/**
 * Mint passport #1 on 0G Galileo testnet from the real 2026-08-14 run.
 *
 * WHAT IS REAL HERE
 *   baseModelHash    — read off the task 0G created for Qwen2.5-0.5B-Instruct
 *   datasetRootHash  — the actual 0G Storage root hash of the sentiment dataset,
 *                      uploaded in tx 0xc38e4131…d7da52
 *   configHash       — keccak256 of the exact training config that task carried
 *   taskId           — the real fine-tuning task
 *   provider         — the live testnet fine-tuning provider
 *
 * WHAT IS NOT
 *   adapterRootHash  — the adapter was never retrieved. The task reached Delivered
 *                      and acknowledgeModel then failed: the bundled 0g-storage-client
 *                      binary is a Linux ELF and the host is Windows (ENOENT), and the
 *                      TEE fallback answered HTTP 429. That is precisely the failure
 *                      Crucible's daemon exists to survive, and it happened to us.
 *
 *                      mint() rejects a zero adapter hash, so this passport carries an
 *                      explicit sentinel — keccak256("crucible:adapter-not-retrieved:<taskId>").
 *                      It is deliberately NOT a plausible-looking root hash: anyone
 *                      recomputing it gets the sentinel and knows immediately that no
 *                      adapter was ever produced.
 *
 * This token is a live-chain smoke test of the contract, not a completed fine-tune,
 * and every document that mentions it says so.
 *
 *   npx hardhat run scripts/mint-testnet-passport.js --network galileo
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const TASK_ID = "10551604-2664-4516-86cf-269a62f93bfc";
const PROVIDER = "0xA02b95Aa6886b1116C4f334eDe00381511E31A09";
const BASE_MODEL_HASH =
  "0xb4f76a886b8655c92bb021922d60b5e4d9271a5c9da98b6cb10937a06c2c75a7";
const DATASET_ROOT_HASH =
  "0xa5051ae76e5bc0e3c64975dea37231dba744945ad50f564c9534948139e7dbfd";

// The config the task actually carried, serialised the way the manifest serialises:
// keys sorted, no whitespace. One canonicalisation, defined in @crucible/core.
const TRAINING_CONFIG = {
  learning_rate: 0.0002,
  max_steps: 10,
  neftune_noise_alpha: 5,
  num_train_epochs: 3,
  per_device_train_batch_size: 2,
};

async function main() {
  const { ethers } = hre;
  const network = hre.network.name;
  if (network === "hardhat" || network === "localhost") {
    throw new Error("Run against galileo or mainnet, not an ephemeral chain.");
  }

  const file = path.join(__dirname, "..", "deployments", `${network}.json`);
  if (!fs.existsSync(file)) throw new Error(`No deployment recorded at ${file}`);
  const { address } = JSON.parse(fs.readFileSync(file, "utf8"));

  const [signer] = await ethers.getSigners();
  const passport = await ethers.getContractAt("Passport", address, signer);

  const canonicalConfig = JSON.stringify(
    Object.fromEntries(Object.entries(TRAINING_CONFIG).sort(([a], [b]) => (a < b ? -1 : 1)))
  );
  const configHash = ethers.keccak256(ethers.toUtf8Bytes(canonicalConfig));
  const adapterRootHash = ethers.keccak256(
    ethers.toUtf8Bytes(`crucible:adapter-not-retrieved:${TASK_ID}`)
  );

  // The manifest hash anchors the off-chain record. Here it commits to the same
  // facts this transaction carries, so the two cannot drift.
  const manifest = {
    adapterRootHash,
    baseModelHash: BASE_MODEL_HASH,
    chainId: 16602,
    configHash,
    datasetRootHash: DATASET_ROOT_HASH,
    network: "testnet",
    note: "adapter not retrieved; acknowledgeModel failed on Windows (ENOENT) then HTTP 429",
    provider: PROVIDER,
    taskId: TASK_ID,
    version: 1,
  };
  const manifestRootHash = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify(manifest))
  );

  console.log(`contract      : ${address}`);
  console.log(`config hash   : ${configHash}`);
  console.log(`adapter hash  : ${adapterRootHash}   (sentinel — no adapter exists)`);
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
      mintedAt: 0, // ignored by the contract; it stamps block.timestamp
    },
    "" // no encrypted URI: nothing about this passport is private
  );
  console.log(`tx            : ${tx.hash}`);

  const receipt = await tx.wait();
  const total = await passport.totalMinted();
  const tokenId = total.toString();

  console.log(`\nMinted passport #${tokenId} in block ${receipt.blockNumber} (gas ${receipt.gasUsed})`);

  const ok = await passport.verifyManifest(tokenId, manifestRootHash);
  const bad = await passport.verifyManifest(tokenId, ethers.ZeroHash.replace(/0$/, "1"));
  console.log(`verifyManifest(correct hash) : ${ok}`);
  console.log(`verifyManifest(wrong hash)   : ${bad}`);

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
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
