/**
 * Mint passport #2 — the run that kept its model.
 *
 * Everything in this passport is real. Unlike passport #1, whose adapter field is
 * a sentinel because the artifact was never retrieved, this one carries the actual
 * adapter root hash the provider committed on-chain, and the deliverable behind it
 * reads acknowledged = true.
 *
 *   task            3e385c46-f5dc-4e93-b713-63ab7a987ae3
 *   modelRootHash   read from FineTuningServing.getDeliverables(), not from our notes
 *   artifact        93,642,469 bytes on disk, sha256 recorded in runs/run2-retrieval.json
 *   acknowledged    true, tx 0x0911a132…c15aeb
 *
 * The two passports side by side are the project's whole argument: same pipeline,
 * same wallet, same dataset, one variable — the operating system the acknowledgement
 * ran on — and two outcomes, one of which cost 30% of the fee and the model.
 *
 *   npx hardhat run scripts/mint-run2-passport.js --network galileo
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const TASK_ID = "3e385c46-f5dc-4e93-b713-63ab7a987ae3";
const PROVIDER = "0xA02b95Aa6886b1116C4f334eDe00381511E31A09";
const SERVING = "0xC6C075D8039763C8f1EbE580be5ADdf2fd6941bA";
const BASE_MODEL_HASH =
  "0xb4f76a886b8655c92bb021922d60b5e4d9271a5c9da98b6cb10937a06c2c75a7";
const DATASET_ROOT_HASH =
  "0xa5051ae76e5bc0e3c64975dea37231dba744945ad50f564c9534948139e7dbfd";

// The config this task actually carried.
const TRAINING_CONFIG = {
  learning_rate: 0.0002,
  max_steps: 10,
  neftune_noise_alpha: 5,
  num_train_epochs: 3,
  per_device_train_batch_size: 2,
};

const DELIVERABLES_ABI = [
  "function getDeliverables(address,address) view returns (tuple(bytes id, bytes modelRootHash, bytes encryptedSecret, bool acknowledged)[])",
];

async function main() {
  const { ethers } = hre;
  const network = hre.network.name;
  if (network === "hardhat" || network === "localhost") {
    throw new Error("Run against galileo or mainnet, not an ephemeral chain.");
  }

  const deployFile = path.join(__dirname, "..", "deployments", `${network}.json`);
  const { address } = JSON.parse(fs.readFileSync(deployFile, "utf8"));
  const [signer] = await ethers.getSigners();
  const passport = await ethers.getContractAt("Passport", address, signer);

  // Read the adapter hash off the chain rather than trusting a note. If the
  // deliverable is not acknowledged, this passport should not exist yet.
  const serving = new ethers.Contract(SERVING, DELIVERABLES_ABI, signer.provider);
  const deliverables = await serving.getDeliverables(signer.address, PROVIDER);
  const dec = new TextDecoder();
  const mine = deliverables.find((d) => {
    try {
      return dec.decode(ethers.getBytes(d.id)) === TASK_ID;
    } catch {
      return false;
    }
  });
  if (!mine) throw new Error(`No deliverable on-chain for task ${TASK_ID}`);
  if (!mine.acknowledged) {
    throw new Error(
      `Deliverable for ${TASK_ID} reads acknowledged=false. Refusing to mint a ` +
        `passport that claims a retrieved model when the chain disagrees.`
    );
  }
  const adapterRootHash = mine.modelRootHash;
  console.log(`deliverable   : acknowledged=${mine.acknowledged}`);
  console.log(`adapter root  : ${adapterRootHash}   (read from the chain)`);

  // Bind the passport to the bytes actually on disk, not merely to the provider's
  // claim about them.
  const artifactPath = path.join(
    __dirname, "..", "..", "runs", "ack-3e385c46",
    `model_${TASK_ID}.bin`
  );
  let artifactSha256 = null;
  let artifactBytes = null;
  if (fs.existsSync(artifactPath)) {
    const crypto = require("crypto");
    const buf = fs.readFileSync(artifactPath);
    artifactBytes = buf.length;
    artifactSha256 = `0x${crypto.createHash("sha256").update(buf).digest("hex")}`;
    console.log(`artifact      : ${artifactBytes} bytes, sha256 ${artifactSha256}`);
  } else {
    console.log(`artifact      : not present locally — minting lineage only`);
  }

  const canonicalConfig = JSON.stringify(
    Object.fromEntries(Object.entries(TRAINING_CONFIG).sort(([a], [b]) => (a < b ? -1 : 1)))
  );
  const configHash = ethers.keccak256(ethers.toUtf8Bytes(canonicalConfig));

  const manifest = {
    adapterRootHash,
    artifactSha256,
    artifactSizeBytes: artifactBytes,
    baseModelHash: BASE_MODEL_HASH,
    chainId: 16602,
    configHash,
    datasetRootHash: DATASET_ROOT_HASH,
    network: "testnet",
    note:
      "Adapter retrieved and acknowledged. Downloaded via the 0g-storage path from " +
      "WSL2 Linux after both paths failed on Windows; the SDK validated the artifact " +
      "against the provider's on-chain root hash before acknowledging.",
    provider: PROVIDER,
    retrievalPlatform: "wsl2-linux",
    taskId: TASK_ID,
    version: 1,
  };
  const manifestRootHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(manifest)));
  console.log(`manifest hash : ${manifestRootHash}`);

  const tx = await passport.mint(
    signer.address,
    {
      baseModelHash: BASE_MODEL_HASH,
      datasetRootHash: DATASET_ROOT_HASH,
      configHash,
      adapterRootHash,
      manifestRootHash,
      taskId: TASK_ID,
      provider: PROVIDER,
      mintedAt: 0,
    },
    ""
  );
  console.log(`tx            : ${tx.hash}`);
  const receipt = await tx.wait();
  const tokenId = (await passport.totalMinted()).toString();
  console.log(`\nMinted passport #${tokenId} in block ${receipt.blockNumber} (gas ${receipt.gasUsed})`);

  const ok = await passport.verifyManifest(tokenId, manifestRootHash);
  console.log(`verifyManifest(correct) : ${ok}`);

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

  const explorer =
    network === "galileo" ? "https://chainscan-galileo.0g.ai" : "https://chainscan.0g.ai";
  console.log(`Explorer      : ${explorer}/tx/${tx.hash}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
