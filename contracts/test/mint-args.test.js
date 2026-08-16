/**
 * mint-args.test.js — the argument, canonicalisation and manifest logic of
 * scripts/mint.js, exercised without a network and without gas.
 *
 * WHY THIS TEST IS THE INTERESTING ONE
 *   scripts/mint.js is generic where mint-testnet-passport.js and
 *   mint-run2-passport.js were hardcoded. Generic is only an improvement if it
 *   produces the SAME bytes the hardcoded scripts did — otherwise the new script
 *   quietly forks the hash space and passports #1 and #2 stop being reproducible.
 *
 *   So the load-bearing assertions here replay the two passports that actually
 *   exist on Galileo, using the values recorded in deployments/galileo-mints.json
 *   as the expected answer, and require a byte-for-byte match on configHash and
 *   manifestRootHash. That file is a record of two real transactions; it is not a
 *   fixture anyone can adjust to make a test pass.
 *
 *   lineageKey is checked against the deployed contract's own pure function,
 *   compiled and run in-process, so the JS abi.encode and Passport.sol:367-373
 *   are proven to agree rather than assumed to.
 */
const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { ethers } = require("hardhat");

const mint = require("../scripts/mint.js");

const MINTS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "deployments", "galileo-mints.json"), "utf8")
);
const byToken = (id) => MINTS.find((m) => m.tokenId === id);

// The config both real runs carried (mint-testnet-passport.js:43-49,
// mint-run2-passport.js:33-39). Identical in both, which is the point of the
// two-passport comparison: one variable changed, and it was not the config.
const TRAINING_CONFIG = {
  learning_rate: 0.0002,
  max_steps: 10,
  neftune_noise_alpha: 5,
  num_train_epochs: 3,
  per_device_train_batch_size: 2,
};

function writeTempManifest(obj) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crucible-mint-"));
  const file = path.join(dir, "manifest.json");
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
  return file;
}

describe("mint.js — canonicalisation", function () {
  it("sorts keys and emits no whitespace", function () {
    expect(mint.canonicalJson({ b: 2, a: 1 })).to.equal('{"a":1,"b":2}');
  });

  it("hashes the same config identically regardless of key order", function () {
    const shuffled = {
      per_device_train_batch_size: 2,
      learning_rate: 0.0002,
      num_train_epochs: 3,
      neftune_noise_alpha: 5,
      max_steps: 10,
    };
    expect(mint.computeConfigHash(shuffled)).to.equal(
      mint.computeConfigHash(TRAINING_CONFIG)
    );
  });

  it("reproduces the configHash recorded for passport #1 on Galileo", function () {
    expect(mint.computeConfigHash(TRAINING_CONFIG)).to.equal(
      byToken("1").manifest.configHash
    );
  });

  it("reproduces the configHash recorded for passport #2 on Galileo", function () {
    expect(mint.computeConfigHash(TRAINING_CONFIG)).to.equal(
      byToken("2").manifest.configHash
    );
  });
});

describe("mint.js — manifest reproduction of the live passports", function () {
  it("rebuilds passport #1's manifest and manifestRootHash byte for byte", function () {
    const recorded = byToken("1");
    const m = recorded.manifest;
    const built = mint.buildManifest(
      {
        taskId: m.taskId,
        provider: m.provider,
        baseModelHash: m.baseModelHash,
        datasetRootHash: m.datasetRootHash,
        network: m.network,
        note: m.note,
        version: m.version,
      },
      {
        configHash: m.configHash,
        adapterRootHash: m.adapterRootHash,
        artifact: null,
        chainId: m.chainId,
      }
    );
    expect(mint.canonicalJson(built)).to.equal(mint.canonicalJson(m));
    expect(mint.computeManifestRootHash(built)).to.equal(recorded.manifestRootHash);
  });

  it("rebuilds passport #2's manifest and manifestRootHash byte for byte", function () {
    const recorded = byToken("2");
    const m = recorded.manifest;
    const built = mint.buildManifest(
      {
        taskId: m.taskId,
        provider: m.provider,
        baseModelHash: m.baseModelHash,
        datasetRootHash: m.datasetRootHash,
        network: m.network,
        note: m.note,
        retrievalPlatform: m.retrievalPlatform,
        version: m.version,
      },
      {
        configHash: m.configHash,
        adapterRootHash: m.adapterRootHash,
        artifact: { sha256: m.artifactSha256, bytes: m.artifactSizeBytes },
        chainId: m.chainId,
      }
    );
    expect(mint.canonicalJson(built)).to.equal(mint.canonicalJson(m));
    expect(mint.computeManifestRootHash(built)).to.equal(recorded.manifestRootHash);
  });

  it("reproduces passport #1's sentinel adapter hash from its taskId alone", function () {
    // Anyone recomputing this learns the adapter was never retrieved.
    expect(mint.sentinelAdapterHash(byToken("1").manifest.taskId)).to.equal(
      byToken("1").manifest.adapterRootHash
    );
  });

  it("omits absent optional fields rather than writing nulls", function () {
    const built = mint.buildManifest(
      {
        taskId: "t",
        provider: ethers.ZeroAddress.replace(/0$/, "1"),
        baseModelHash: `0x${"11".repeat(32)}`,
        datasetRootHash: `0x${"22".repeat(32)}`,
      },
      { configHash: `0x${"33".repeat(32)}`, adapterRootHash: `0x${"44".repeat(32)}`, artifact: null, chainId: 1 }
    );
    expect(built).to.not.have.property("note");
    expect(built).to.not.have.property("artifactSha256");
    expect(JSON.stringify(built)).to.not.include("null");
  });
});

describe("mint.js — lineage key agrees with Passport.sol", function () {
  it("computes keccak256(abi.encode(dataset, config, adapter)) the same way the contract does", async function () {
    const Passport = await ethers.getContractFactory("Passport");
    const passport = await Passport.deploy();
    await passport.waitForDeployment();

    const m = byToken("2").manifest;
    const onChain = await passport.lineageKey(
      m.datasetRootHash,
      m.configHash,
      m.adapterRootHash
    );
    expect(mint.computeLineageKey(m.datasetRootHash, m.configHash, m.adapterRootHash)).to.equal(
      onChain
    );

    // And for passport #1's sentinel triple, so the sentinel path is covered too.
    const m1 = byToken("1").manifest;
    expect(mint.computeLineageKey(m1.datasetRootHash, m1.configHash, m1.adapterRootHash)).to.equal(
      await passport.lineageKey(m1.datasetRootHash, m1.configHash, m1.adapterRootHash)
    );
  });
});

describe("mint.js — argument parsing", function () {
  it("defaults to dry-run", function () {
    expect(parsedWithCleanEnv([]).broadcast).to.equal(false);
  });

  it("treats --dry-run as an explicit restatement of the default", function () {
    expect(parsedWithCleanEnv(["--dry-run"]).broadcast).to.equal(false);
  });

  it("only broadcasts when asked", function () {
    expect(parsedWithCleanEnv(["--broadcast"]).broadcast).to.equal(true);
  });

  it("refuses --offline together with --broadcast", function () {
    // Broadcasting requires the live acknowledged check; offline skips it.
    expect(() => parsedWithCleanEnv(["--offline", "--broadcast"])).to.throw(
      /--offline cannot be combined with --broadcast/
    );
  });

  it("accepts --manifest x and --manifest=x alike", function () {
    expect(parsedWithCleanEnv(["--manifest", "a.json"]).manifestPath).to.equal("a.json");
    expect(parsedWithCleanEnv(["--manifest=b.json"]).manifestPath).to.equal("b.json");
  });

  it("fails when a value-taking flag is given no value", function () {
    expect(() => parsedWithCleanEnv(["--manifest", "--network", "galileo"])).to.throw(
      /--manifest needs a value/
    );
  });

  function parsedWithCleanEnv(argv) {
    return mint.parseArgs(argv, {});
  }
});

describe("mint.js — input validation fails loudly and names the field", function () {
  const base = () => ({
    taskId: "3e385c46-f5dc-4e93-b713-63ab7a987ae3",
    provider: "0xA02b95Aa6886b1116C4f334eDe00381511E31A09",
    serving: "0xC6C075D8039763C8f1EbE580be5ADdf2fd6941bA",
    baseModelHash: `0x${"ab".repeat(32)}`,
    datasetRootHash: `0x${"cd".repeat(32)}`,
    trainingConfig: TRAINING_CONFIG,
  });
  const check = (mutate, re, opts = { requireServing: false }) => {
    const input = base();
    mutate(input);
    expect(() => mint.validateManifestInput(input, opts)).to.throw(re);
  };

  it("accepts a well-formed manifest", function () {
    expect(() => mint.validateManifestInput(base(), { requireServing: true })).to.not.throw();
  });

  it("names a missing taskId", function () {
    check((i) => delete i.taskId, /`taskId`.*required/);
  });
  it("names an empty taskId", function () {
    check((i) => (i.taskId = "   "), /`taskId`.*non-empty/);
  });
  it("names a bad provider address", function () {
    check((i) => (i.provider = "0xnope"), /`provider`.*not a valid address/);
  });
  it("names a malformed baseModelHash", function () {
    check((i) => (i.baseModelHash = "0xdeadbeef"), /`baseModelHash`.*32-byte hash/);
  });
  it("rejects a zero datasetRootHash, which mint() would revert on anyway", function () {
    check((i) => (i.datasetRootHash = `0x${"00".repeat(32)}`), /`datasetRootHash`.*zero/);
  });
  it("names a missing trainingConfig", function () {
    check((i) => delete i.trainingConfig, /`trainingConfig`.*required/);
  });
  it("rejects an empty trainingConfig", function () {
    check((i) => (i.trainingConfig = {}), /`trainingConfig`.*empty/);
  });
  it("rejects an adapterRootHash that is neither a hash nor \"sentinel\"", function () {
    check((i) => (i.adapterRootHash = "maybe"), /`adapterRootHash`/);
  });
  it("accepts the literal string \"sentinel\"", function () {
    const input = base();
    input.adapterRootHash = "sentinel";
    expect(() => mint.validateManifestInput(input, { requireServing: false })).to.not.throw();
  });
  it("requires `serving` for an on-chain run and explains why", function () {
    check((i) => delete i.serving, /`serving`.*acknowledgement check/, { requireServing: true });
  });
  it("does not require `serving` offline", function () {
    const input = base();
    delete input.serving;
    expect(() => mint.validateManifestInput(input, { requireServing: false })).to.not.throw();
  });
  it("rejects a manifest that is not an object", function () {
    expect(() => mint.validateManifestInput([1, 2], { requireServing: false })).to.throw(
      /must be a JSON object/
    );
  });
});

describe("mint.js — deployment resolution", function () {
  it("reads the address from deployments/<network>.json", function () {
    const { deployment } = mint.loadDeployment("galileo");
    expect(ethers.isAddress(deployment.address)).to.equal(true);
    expect(deployment.chainId).to.equal(16602);
  });

  it("fails with the path when no deployment is recorded", function () {
    expect(() => mint.loadDeployment("no-such-network")).to.throw(/No deployment recorded at/);
  });
});

describe("mint.js — offline dry run end to end", function () {
  it("reproduces passport #2 from a manifest file and sends nothing", async function () {
    const recorded = byToken("2");
    const m = recorded.manifest;
    const file = writeTempManifest({
      taskId: m.taskId,
      provider: m.provider,
      baseModelHash: m.baseModelHash,
      datasetRootHash: m.datasetRootHash,
      adapterRootHash: m.adapterRootHash,
      artifactSha256: m.artifactSha256,
      artifactSizeBytes: m.artifactSizeBytes,
      trainingConfig: TRAINING_CONFIG,
      chainId: m.chainId,
      network: m.network,
      note: m.note,
      retrievalPlatform: m.retrievalPlatform,
      version: m.version,
    });

    const log = console.log;
    console.log = () => {};
    let result;
    try {
      result = await mint.main(["--manifest", file, "--network", "galileo", "--offline"]);
    } finally {
      console.log = log;
    }

    expect(result.configHash).to.equal(m.configHash);
    expect(result.manifestRootHash).to.equal(recorded.manifestRootHash);
    expect(result.address).to.equal("0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7");
    expect(result.lineageKey).to.equal(
      mint.computeLineageKey(m.datasetRootHash, m.configHash, m.adapterRootHash)
    );
    // No tokenId and no txHash: nothing was sent.
    expect(result).to.not.have.property("txHash");
  });

  it("refuses to compute offline without an adapterRootHash to stand in for the chain read", async function () {
    const m = byToken("2").manifest;
    const file = writeTempManifest({
      taskId: m.taskId,
      provider: m.provider,
      baseModelHash: m.baseModelHash,
      datasetRootHash: m.datasetRootHash,
      trainingConfig: TRAINING_CONFIG,
      chainId: m.chainId,
    });
    let threw = null;
    const log = console.log;
    console.log = () => {};
    try {
      await mint.main(["--manifest", file, "--network", "galileo", "--offline"]);
    } catch (e) {
      threw = e;
    } finally {
      console.log = log;
    }
    expect(threw, "expected a throw").to.not.equal(null);
    expect(threw.message).to.match(/`adapterRootHash`.*required with --offline/);
  });

  it("fails with the path when the manifest file does not exist", async function () {
    let threw = null;
    try {
      await mint.main(["--manifest", "definitely-not-here.json", "--network", "galileo", "--offline"]);
    } catch (e) {
      threw = e;
    }
    expect(threw.message).to.match(/manifest not found/);
  });

  it("fails when no manifest is given at all", async function () {
    let threw = null;
    try {
      await mint.main(["--network", "galileo", "--offline"]);
    } catch (e) {
      threw = e;
    }
    expect(threw.message).to.match(/no manifest given/);
  });
});
