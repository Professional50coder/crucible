/**
 * mint.js — the generic Model Passport minter.
 *
 * WHY THIS EXISTS
 *   scripts/mint-testnet-passport.js and scripts/mint-run2-passport.js each hardcode
 *   one run's facts as literal constants (mint-testnet-passport.js:34-49,
 *   mint-run2-passport.js:24-39). Minting a passport for a third run means copying a
 *   file and hand-editing five constants. That does not scale, and hand-edited
 *   constants are exactly the kind of thing that drifts from the chain. This script
 *   takes the same facts from a JSON manifest instead, and derives everything else.
 *
 *   The two existing scripts are left untouched on purpose: they are the audit trail
 *   for passports #1 and #2 and their comments explain those two specific runs. This
 *   file replaces them going forward, and reproduces both of them exactly — see
 *   test/mint-args.test.js, which recomputes token #1's and token #2's configHash and
 *   manifestRootHash from deployments/galileo-mints.json and asserts a byte match.
 *
 * WHAT IT PRESERVES FROM THE HAND-WRITTEN SCRIPTS — none of this is optional
 *
 *   1. THE ACKNOWLEDGEMENT REFUSAL (mint-run2-passport.js:70-75).
 *      Before minting, the deliverable is read live from
 *      FineTuningServing.getDeliverables() and the mint is REFUSED if
 *      acknowledged === false. Passport #1 exists because a run was never
 *      acknowledged and its model was lost. A passport that claims an adapter the
 *      chain does not agree was retrieved is precisely the dishonesty this project
 *      was built to make impossible. There is no flag that turns this check off for
 *      a broadcast. `--offline` skips the read, and `--offline` therefore cannot
 *      broadcast — it is dry-run only.
 *
 *   2. THE LIVE ADAPTER ROOT READ (mint-run2-passport.js:59-78).
 *      adapterRootHash comes off the chain, not out of our notes. If the manifest
 *      also states an expected adapter hash, it is treated as an assertion to check,
 *      never as the source of truth: a mismatch is a hard failure.
 *
 *   3. THE CANONICALISATION (mint-testnet-passport.js:65-68, mint-run2:98-101).
 *      configHash = keccak256(utf8(JSON.stringify(config with keys sorted, no
 *      whitespace))). Copied verbatim, not reinvented, because the hash has to match
 *      what @crucible/core and the already-minted passports produce. The manifest
 *      itself is canonicalised the same way, which reproduces the literal key order
 *      both hand-written scripts happened to use (both were already alphabetical).
 *
 *   4. THE MINT RECORD (mint-testnet-passport.js:123-135).
 *      Appended to deployments/<network>-mints.json in the same shape, so passport
 *      #3 sits alongside #1 and #2 in one file with no schema break.
 *
 * DEFAULT IS DRY-RUN — deliberately.
 *   Sending is opt-in via --broadcast. A mint is irreversible, costs gas, and
 *   permanently burns a lineage triple (Passport.sol reverts DuplicateLineage on a
 *   repeat), so the safe default is the one that cannot do any of that. --dry-run is
 *   accepted explicitly too, and is simply the default said out loud.
 *
 * USAGE
 *   # offline proof: every hash and the lineage key, no RPC, no key, no gas
 *   node scripts/mint.js --manifest runs/run3.json --network galileo --offline
 *
 *   # dry run against the live chain: reads deliverables, still sends nothing
 *   MANIFEST=runs/run3.json npx hardhat run scripts/mint.js --network galileo
 *
 *   # the real thing
 *   MANIFEST=runs/run3.json BROADCAST=1 npx hardhat run scripts/mint.js --network galileo
 *
 *   (`hardhat run` swallows unknown CLI flags, so under it the options are read from
 *   the environment: MANIFEST, BROADCAST, OFFLINE, ALLOW_UNRETRIEVED.)
 *
 * MANIFEST SCHEMA — see runs/*.json for examples
 *   REQUIRED
 *     taskId            string   the 0G fine-tuning task id
 *     provider          address  the fine-tuning provider
 *     baseModelHash     bytes32
 *     datasetRootHash   bytes32
 *     trainingConfig    object   flat key/value; hashed, not stored on chain
 *   REQUIRED unless --offline
 *     serving           address  FineTuningServing, for the deliverables read
 *   OPTIONAL
 *     adapterRootHash   bytes32 | "sentinel"
 *                       Offline, this IS the adapter hash. Online, it is an
 *                       assertion checked against the chain. "sentinel" means the
 *                       adapter was never retrieved and produces
 *                       keccak256("crucible:adapter-not-retrieved:<taskId>"), the
 *                       same non-plausible marker passport #1 carries.
 *     artifactPath      string   local adapter file; sha256 + size go in the manifest
    artifactSha256    0x…      declared digest. Checked against artifactPath when
                               the file is present; used as-is (and labelled
                               "NOT re-hashed") when it is not.
    artifactSizeBytes number   only used when the file is not present locally
 *     chainId           number   defaults to the connected chain
 *     network           string   manifest label, e.g. "testnet"
 *     note              string
 *     retrievalPlatform string
 *     recipient         address  defaults to the signer
 *     encryptedURI      string   defaults to "" — nothing here is private
 *     version           number   defaults to 1
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ethers } = require("ethers");

const DELIVERABLES_ABI = [
  "function getDeliverables(address,address) view returns (tuple(bytes id, bytes modelRootHash, bytes encryptedSecret, bool acknowledged)[])",
];

const PASSPORT_ABI = [
  "function mint(address to, (bytes32 baseModelHash, bytes32 datasetRootHash, bytes32 configHash, bytes32 adapterRootHash, bytes32 manifestRootHash, string taskId, address provider, uint64 mintedAt) data, string encryptedURI) external returns (uint256)",
  "function totalMinted() view returns (uint256)",
  "function verifyManifest(uint256 tokenId, bytes32 candidateManifestHash) view returns (bool)",
  "function lineageKey(bytes32 datasetRootHash, bytes32 configHash, bytes32 adapterRootHash) pure returns (bytes32)",
  "function tokenIdForLineage(bytes32 datasetRootHash, bytes32 configHash, bytes32 adapterRootHash) view returns (uint256)",
];

// The fields a manifest cannot omit, and the shape each one must have. Named
// explicitly so a bad manifest fails on the field, not twelve frames deep in ethers.
const REQUIRED = {
  taskId: "non-empty string",
  provider: "0x-prefixed address",
  baseModelHash: "0x-prefixed 32-byte hash",
  datasetRootHash: "0x-prefixed 32-byte hash",
  trainingConfig: "object of training hyperparameters",
};

// ---------------------------------------------------------------------------
// Pure helpers. No network, no filesystem, no hardhat — so they are unit
// testable and so the same code produces the same hash everywhere.
// ---------------------------------------------------------------------------

/**
 * Canonical JSON: keys sorted, no whitespace. This is the one canonicalisation,
 * defined in @crucible/core and copied — not reinvented — from
 * mint-testnet-passport.js:65-67. Change it and every hash in the system moves.
 */
function canonicalJson(obj) {
  return JSON.stringify(
    Object.fromEntries(Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : 1)))
  );
}

/** keccak256 of the canonical training config. */
function computeConfigHash(trainingConfig) {
  return ethers.keccak256(ethers.toUtf8Bytes(canonicalJson(trainingConfig)));
}

/** keccak256 of the canonical manifest. Anchors the off-chain record. */
function computeManifestRootHash(manifest) {
  return ethers.keccak256(ethers.toUtf8Bytes(canonicalJson(manifest)));
}

/**
 * The marker passport #1 carries. Deliberately NOT a plausible root hash:
 * anyone who recomputes it learns immediately that no adapter ever existed.
 * Verbatim from mint-testnet-passport.js:69-71.
 */
function sentinelAdapterHash(taskId) {
  return ethers.keccak256(
    ethers.toUtf8Bytes(`crucible:adapter-not-retrieved:${taskId}`)
  );
}

/**
 * Passport.lineageKey — keccak256(abi.encode(dataset, config, adapter)),
 * Passport.sol:367-373. Recomputed here so a dry run can tell you, before you
 * spend anything, whether this triple has already been burned.
 */
function computeLineageKey(datasetRootHash, configHash, adapterRootHash) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes32", "bytes32"],
      [datasetRootHash, configHash, adapterRootHash]
    )
  );
}

/**
 * Fail loudly and early, naming the field. A manifest is written by hand; the
 * error has to say which line to go fix.
 */
function validateManifestInput(input, { requireServing }) {
  const bad = (field, why) => {
    throw new Error(`manifest field \`${field}\`: ${why}`);
  };
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("manifest must be a JSON object");
  }

  for (const [field, expected] of Object.entries(REQUIRED)) {
    if (input[field] === undefined || input[field] === null) {
      bad(field, `required (${expected})`);
    }
  }

  if (typeof input.taskId !== "string" || input.taskId.trim() === "") {
    bad("taskId", "must be a non-empty string");
  }
  if (!ethers.isAddress(input.provider)) {
    bad("provider", `not a valid address: ${JSON.stringify(input.provider)}`);
  }
  for (const field of ["baseModelHash", "datasetRootHash"]) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(String(input[field]))) {
      bad(field, `must be a 0x-prefixed 32-byte hash, got ${JSON.stringify(input[field])}`);
    }
    if (/^0x0{64}$/.test(String(input[field]))) {
      bad(field, "is zero; Passport.mint rejects zero hashes");
    }
  }

  const cfg = input.trainingConfig;
  if (typeof cfg !== "object" || cfg === null || Array.isArray(cfg)) {
    bad("trainingConfig", "must be a JSON object of hyperparameters");
  }
  if (Object.keys(cfg).length === 0) {
    bad("trainingConfig", "is empty; an empty config hashes to a meaningless constant");
  }

  if (input.adapterRootHash !== undefined && input.adapterRootHash !== null) {
    const a = String(input.adapterRootHash);
    if (a !== "sentinel" && !/^0x[0-9a-fA-F]{64}$/.test(a)) {
      bad("adapterRootHash", `must be a 0x-prefixed 32-byte hash or the string "sentinel", got ${JSON.stringify(input.adapterRootHash)}`);
    }
  }
  if (input.recipient !== undefined && !ethers.isAddress(input.recipient)) {
    bad("recipient", `not a valid address: ${JSON.stringify(input.recipient)}`);
  }
  if (requireServing && !ethers.isAddress(input.serving)) {
    bad(
      "serving",
      "required for an on-chain run — it is the FineTuningServing address the " +
        "acknowledgement check reads. Pass --offline only if you accept a dry run."
    );
  }
  return input;
}

/**
 * Assemble the manifest that gets hashed. Optional fields are omitted when
 * absent rather than written as null, so a run with no local artifact hashes to
 * the same thing whether or not the key was mentioned.
 */
function buildManifest(input, { configHash, adapterRootHash, artifact, chainId }) {
  const manifest = {
    adapterRootHash,
    baseModelHash: input.baseModelHash,
    chainId,
    configHash,
    datasetRootHash: input.datasetRootHash,
    provider: ethers.getAddress(input.provider),
    taskId: input.taskId,
    version: input.version ?? 1,
  };
  if (artifact) {
    manifest.artifactSha256 = artifact.sha256;
    manifest.artifactSizeBytes = artifact.bytes;
  }
  if (input.network) manifest.network = input.network;
  if (input.note) manifest.note = input.note;
  if (input.retrievalPlatform) manifest.retrievalPlatform = input.retrievalPlatform;

  // Canonical order, so the object we print is the object we hash.
  return JSON.parse(canonicalJson(manifest));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/**
 * `hardhat run` does not forward unknown flags to the script, so every option
 * is readable from the environment as well. Flags win when both are present.
 */
function parseArgs(argv, env = process.env) {
  const opts = {
    manifestPath: env.MANIFEST || null,
    network: env.NETWORK || null,
    broadcast: env.BROADCAST === "1" || env.BROADCAST === "true",
    offline: env.OFFLINE === "1" || env.OFFLINE === "true",
    allowUnretrieved: env.ALLOW_UNRETRIEVED === "1" || env.ALLOW_UNRETRIEVED === "true",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) {
        throw new Error(`${arg} needs a value`);
      }
      i += 1;
      return v;
    };
    switch (arg) {
      case "--manifest": opts.manifestPath = next(); break;
      case "--network": opts.network = next(); break;
      case "--broadcast": opts.broadcast = true; break;
      case "--dry-run": opts.broadcast = false; break;
      case "--offline": opts.offline = true; break;
      case "--allow-unretrieved": opts.allowUnretrieved = true; break;
      case "--help":
      case "-h": opts.help = true; break;
      default:
        if (arg.startsWith("--manifest=")) opts.manifestPath = arg.slice(11);
        else if (arg.startsWith("--network=")) opts.network = arg.slice(10);
        break;
    }
  }
  // --offline can never broadcast: broadcasting requires the live acknowledged
  // check, and offline is precisely the mode that skips it.
  if (opts.offline && opts.broadcast) {
    throw new Error(
      "--offline cannot be combined with --broadcast. Broadcasting requires the " +
        "live FineTuningServing acknowledged check, which --offline skips."
    );
  }
  return opts;
}

function loadManifestFile(manifestPath) {
  if (!manifestPath) {
    throw new Error(
      "no manifest given. Pass --manifest <path.json> (or set MANIFEST=<path> when " +
        "running under `npx hardhat run`)."
    );
  }
  const resolved = path.resolve(process.cwd(), manifestPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`manifest not found: ${resolved}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch (e) {
    throw new Error(`manifest ${resolved} is not valid JSON: ${e.message}`);
  }
  return { resolved, input: parsed };
}

/** deployments/<network>.json — resolved exactly as the two hand scripts do. */
function loadDeployment(network) {
  const file = path.join(__dirname, "..", "deployments", `${network}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`No deployment recorded at ${file}`);
  }
  const deployment = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!ethers.isAddress(deployment.address)) {
    throw new Error(`deployments/${network}.json has no valid \`address\``);
  }
  return { file, deployment };
}

/** Bind the passport to the bytes on disk, not merely the provider's claim. */
function hashArtifact(artifactPath) {
  const resolved = path.resolve(process.cwd(), artifactPath);
  if (!fs.existsSync(resolved)) return null;
  const buf = fs.readFileSync(resolved);
  return {
    path: resolved,
    bytes: buf.length,
    sha256: `0x${crypto.createHash("sha256").update(buf).digest("hex")}`,
  };
}

/**
 * The refusal. Reads the deliverable for this task off FineTuningServing and
 * throws unless the chain agrees it was acknowledged. See the header.
 */
async function readAcknowledgedAdapter({ serving, provider, taskId, signerAddress, runner }) {
  const contract = new ethers.Contract(serving, DELIVERABLES_ABI, runner);
  const deliverables = await contract.getDeliverables(signerAddress, provider);
  const dec = new TextDecoder();
  const mine = deliverables.find((d) => {
    try {
      return dec.decode(ethers.getBytes(d.id)) === taskId;
    } catch {
      return false;
    }
  });
  if (!mine) throw new Error(`No deliverable on-chain for task ${taskId}`);
  if (!mine.acknowledged) {
    throw new Error(
      `Deliverable for ${taskId} reads acknowledged=false. Refusing to mint a ` +
        `passport that claims a retrieved model when the chain disagrees.`
    );
  }
  return mine.modelRootHash;
}

// ---------------------------------------------------------------------------

const USAGE = `
mint.js — mint a Crucible Model Passport from a run manifest.

  --manifest <path>       run facts as JSON (required)   [env MANIFEST]
  --network <name>        deployments/<name>.json        [env NETWORK]
  --dry-run               compute and print only (DEFAULT)
  --broadcast             actually send the mint tx      [env BROADCAST=1]
  --offline               skip all RPC; implies dry-run  [env OFFLINE=1]
  --allow-unretrieved     permit a "sentinel" adapter    [env ALLOW_UNRETRIEVED=1]
`;

async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(USAGE);
    return;
  }

  // Under `npx hardhat run`, hardhat is already loaded and owns the network.
  // Run as a plain node script it is not, and --offline keeps it that way.
  const hre = opts.offline ? null : require("hardhat");
  const network = opts.network || (hre && hre.network.name);
  if (!network) {
    throw new Error("no network given. Pass --network <name> (or set NETWORK).");
  }
  if (hre && opts.network && opts.network !== hre.network.name) {
    throw new Error(
      `--network ${opts.network} disagrees with hardhat's --network ${hre.network.name}. ` +
        `Refusing to guess which deployment you meant.`
    );
  }
  if (opts.broadcast && (network === "hardhat" || network === "localhost")) {
    throw new Error("Run against galileo or mainnet, not an ephemeral chain.");
  }

  const { resolved: manifestPath, input } = loadManifestFile(opts.manifestPath);
  validateManifestInput(input, { requireServing: !opts.offline });

  const { file: deployFile, deployment } = loadDeployment(network);
  const address = ethers.getAddress(deployment.address);

  const mode = opts.broadcast ? "BROADCAST" : opts.offline ? "DRY-RUN (offline)" : "DRY-RUN";
  console.log(`mode          : ${mode}`);
  console.log(`manifest      : ${manifestPath}`);
  console.log(`network       : ${network}`);
  console.log(`contract      : ${address}   (${path.basename(deployFile)})`);

  // --- signer / runner -----------------------------------------------------
  let signer = null;
  let signerAddress = input.recipient ? ethers.getAddress(input.recipient) : null;
  if (!opts.offline) {
    const signers = await hre.ethers.getSigners();
    signer = signers[0];
    if (!signer) {
      throw new Error(
        `No signer available on ${network}. Set PRIVATE_KEY in contracts/.env, or ` +
          `use --offline for a pure hash computation.`
      );
    }
    signerAddress = signerAddress || signer.address;
    console.log(`signer        : ${signer.address}`);
  } else if (!signerAddress) {
    // Offline there is no wallet to ask; the recipient is only needed to send.
    signerAddress = ethers.ZeroAddress;
  }

  // --- adapter root: the chain is the source of truth ----------------------
  const declared = input.adapterRootHash ? String(input.adapterRootHash) : null;
  const wantsSentinel = declared === "sentinel";
  let adapterRootHash;
  let adapterSource;

  if (wantsSentinel) {
    // Passport #1's case: the run finished but the adapter was never retrieved.
    // Explicit opt-in, because a sentinel passport is a record of a LOSS.
    if (opts.broadcast && !opts.allowUnretrieved) {
      throw new Error(
        `manifest field \`adapterRootHash\`: "sentinel" means no adapter was ever ` +
          `retrieved. Minting that is a permanent public record of a failed run — ` +
          `pass --allow-unretrieved to confirm you mean it.`
      );
    }
    adapterRootHash = sentinelAdapterHash(input.taskId);
    adapterSource = "sentinel — NO adapter exists for this run";
  } else if (opts.offline) {
    if (!declared) {
      throw new Error(
        "manifest field `adapterRootHash`: required with --offline, since the live " +
          "FineTuningServing read that would supply it is skipped."
      );
    }
    adapterRootHash = declared;
    adapterSource = "manifest (offline — NOT verified against the chain)";
  } else {
    const chainAdapter = await readAcknowledgedAdapter({
      serving: ethers.getAddress(input.serving),
      provider: ethers.getAddress(input.provider),
      taskId: input.taskId,
      signerAddress: signer.address,
      runner: signer.provider,
    });
    console.log(`deliverable   : acknowledged=true`);
    if (declared && declared.toLowerCase() !== String(chainAdapter).toLowerCase()) {
      throw new Error(
        `manifest field \`adapterRootHash\`: says ${declared} but the chain says ` +
          `${chainAdapter}. The chain wins; fix the manifest or remove the field.`
      );
    }
    adapterRootHash = chainAdapter;
    adapterSource = "read from the chain";
  }
  console.log(`adapter root  : ${adapterRootHash}   (${adapterSource})`);

  // --- artifact ------------------------------------------------------------
  let artifact = null;
  if (input.artifactPath) {
    artifact = hashArtifact(input.artifactPath);
  }
  if (artifact && input.artifactSha256) {
    // A declared digest is an assertion about the file, so check it rather than
    // trusting it. Bytes on disk win.
    if (input.artifactSha256.toLowerCase() !== artifact.sha256) {
      throw new Error(
        `manifest field \`artifactSha256\`: says ${input.artifactSha256} but ` +
          `${artifact.path} hashes to ${artifact.sha256}.`
      );
    }
  }
  if (!artifact && input.artifactSha256) {
    // File is elsewhere (or was never kept locally) but its digest was recorded
    // at retrieval time. Carry it, and say plainly that it was not re-verified.
    artifact = { sha256: input.artifactSha256, bytes: input.artifactSizeBytes ?? null };
    console.log(`artifact      : ${artifact.bytes} bytes, sha256 ${artifact.sha256}  (declared, file not present — NOT re-hashed)`);
  } else if (artifact) {
    console.log(`artifact      : ${artifact.bytes} bytes, sha256 ${artifact.sha256}`);
  } else if (input.artifactPath) {
    console.log(`artifact      : not present locally — minting lineage only`);
  }

  // --- hashes --------------------------------------------------------------
  const configHash = computeConfigHash(input.trainingConfig);
  const chainId =
    input.chainId ??
    deployment.chainId ??
    (hre ? Number((await signer.provider.getNetwork()).chainId) : undefined);
  if (chainId === undefined) {
    throw new Error("manifest field `chainId`: required when it cannot be read from the chain");
  }

  const manifest = buildManifest(input, { configHash, adapterRootHash, artifact, chainId });
  const manifestRootHash = computeManifestRootHash(manifest);
  const lineageKey = computeLineageKey(input.datasetRootHash, configHash, adapterRootHash);

  console.log(`config hash   : ${configHash}`);
  console.log(`manifest hash : ${manifestRootHash}`);
  console.log(`lineage key   : ${lineageKey}`);

  // --- the duplicate check, before spending anything -----------------------
  if (!opts.offline) {
    const passportRead = new ethers.Contract(address, PASSPORT_ABI, signer.provider);
    const existing = await passportRead.tokenIdForLineage(
      input.datasetRootHash,
      configHash,
      adapterRootHash
    );
    if (existing !== 0n) {
      throw new Error(
        `This lineage triple is already passport #${existing}. Passport.mint would ` +
          `revert DuplicateLineage(${lineageKey}, ${existing}).`
      );
    }
  }

  if (!opts.broadcast) {
    console.log(`\nmanifest (canonical, this is what was hashed):`);
    console.log(canonicalJson(manifest));
    console.log(`\nDRY RUN — no transaction sent, no gas spent.`);
    console.log(`Re-run with --broadcast (or BROADCAST=1) to mint.`);
    return { manifest, manifestRootHash, configHash, adapterRootHash, lineageKey, address };
  }

  // --- send ----------------------------------------------------------------
  const recipient = input.recipient ? ethers.getAddress(input.recipient) : signer.address;
  const passport = await hre.ethers.getContractAt("Passport", address, signer);
  const tx = await passport.mint(
    recipient,
    {
      baseModelHash: input.baseModelHash,
      datasetRootHash: input.datasetRootHash,
      configHash,
      adapterRootHash,
      manifestRootHash,
      taskId: input.taskId,
      provider: ethers.getAddress(input.provider),
      mintedAt: 0, // ignored by the contract; it stamps block.timestamp
    },
    input.encryptedURI ?? ""
  );
  console.log(`tx            : ${tx.hash}`);

  const receipt = await tx.wait();
  const tokenId = (await passport.totalMinted()).toString();
  console.log(`\nMinted passport #${tokenId} in block ${receipt.blockNumber} (gas ${receipt.gasUsed})`);

  const ok = await passport.verifyManifest(tokenId, manifestRootHash);
  console.log(`verifyManifest(correct) : ${ok}`);

  // Same record shape as the hand-written scripts, appended to the same file.
  const out = path.join(__dirname, "..", "deployments", `${network}-mints.json`);
  const record = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : [];
  record.push({
    tokenId,
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    manifest,
    manifestRootHash,
    mintedAt: new Date().toISOString(),
  });
  fs.writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`recorded      : ${path.relative(process.cwd(), out)}`);

  const explorer =
    network === "galileo" ? "https://chainscan-galileo.0g.ai" : "https://chainscan.0g.ai";
  console.log(`\nExplorer      : ${explorer}/tx/${tx.hash}`);
  return { tokenId, txHash: tx.hash, manifest, manifestRootHash, lineageKey };
}

module.exports = {
  canonicalJson,
  computeConfigHash,
  computeManifestRootHash,
  computeLineageKey,
  sentinelAdapterHash,
  validateManifestInput,
  buildManifest,
  parseArgs,
  loadDeployment,
  main,
};

if (require.main === module) {
  main().catch((e) => {
    console.error(`\n${e.message}`);
    process.exitCode = 1;
  });
}
