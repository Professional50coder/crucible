/**
 * Anchor Crucible's lineage into 0G's OFFICIAL Agentic ID contract.
 *
 * Why this exists, in one line: verifying a Crucible passport against Crucible's own
 * contract asks you to trust Crucible's contract. Anchoring the same hashes into a
 * registry 0G deployed and Crucible does not control removes that assumption.
 *
 *   npx hardhat run scripts/mint-agentic-id.js --network galileo
 *
 * Requires PRIVATE_KEY in contracts/.env with testnet gas. The contract's mintFee is
 * 0, and iMint is open to any address — verified on-chain 2026-08-26 — so the only
 * cost is gas. Claim it free at https://faucet.0g.ai (0.1 0G/day).
 *
 * NOT part of the test suite. Never runs automatically.
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

// 0G's official Agentic ID, 0G Galileo testnet (chain 16602).
// Published at https://build.0g.ai/agentic-id. name() = "Agentic ID", symbol() = "AID".
const AGENTIC_ID = "0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F";

// The real ABI, read from the deployed bytecode and 0gfoundation/agenticID-examples —
// NOT from the Builder Hub page, whose documented signatures do not exist on chain.
// See docs/AGENTIC_ID_ALIGNMENT.md.
const ABI = [
  "function iMint(address to, (string dataDescription, bytes32 dataHash)[] datas) payable returns (uint256)",
  "function getIntelligentDatas(uint256 tokenId) view returns ((string dataDescription, bytes32 dataHash)[])",
  "function mintFee() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function paused() view returns (bool)",
];

// Passport #2 — the run that kept its model. Every hash below is already anchored in
// Crucible's own Passport.sol on Galileo and is reproducible from runs/run2-retrieval.json.
const LINEAGE = [
  ["crucible: manifest root (keccak256, canonical JSON)", "0x0f46406e90c548205a0f59481f6c8c35e4a91a8ad5139cb8332382acd23b93a7"],
  ["crucible: base model (Qwen2.5-0.5B-Instruct)", "0xb4f76a886b8655c92bb021922d60b5e4d9271a5c9da98b6cb10937a06c2c75a7"],
  ["crucible: dataset root (0G Storage)", "0xa5051ae76e5bc0e3c64975dea37231dba744945ad50f564c9534948139e7dbfd"],
  ["crucible: training config", "0xe65b3e5183dff7b35bb409425f55ba0f6210c726cb1e8ae83e33b8e89cca55f1"],
  ["crucible: LoRA adapter root (0G Storage)", "0x40a5f256ff464106f6be38ef146614bd78d5ddfe07af16b156d3efcddb561b4d"],
  ["crucible: delivered artifact sha256 (93,642,469 bytes)", "0x9f78876467e409cdcf4b95fbb3aacb6958d6cd487295c31d208996838026ae1d"],
];

async function main() {
  const network = hre.network.name;
  if (network !== "galileo") {
    throw new Error(
      `0G's Agentic ID at ${AGENTIC_ID} is deployed on Galileo (16602). ` +
        `Refusing to run against "${network}" — the address would be a different ` +
        `contract, or nothing at all.`
    );
  }

  const signers = await hre.ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No signer. Set PRIVATE_KEY in contracts/.env.");
  }
  const [signer] = signers;
  const { chainId } = await hre.ethers.provider.getNetwork();
  const balance = await hre.ethers.provider.getBalance(signer.address);

  console.log(`network   : ${network} (chainId ${chainId})`);
  console.log(`signer    : ${signer.address}`);
  console.log(`balance   : ${hre.ethers.formatEther(balance)} 0G`);

  if (balance === 0n) {
    throw new Error(
      `${signer.address} holds no testnet 0G. Claim 0.1 0G free at https://faucet.0g.ai ` +
        `and run this again. The mint fee is 0 — this is gas only.`
    );
  }

  const aid = new hre.ethers.Contract(AGENTIC_ID, ABI, signer);

  const paused = await aid.paused();
  if (paused) throw new Error("0G's Agentic ID contract is paused. Nothing to do but wait.");

  const fee = await aid.mintFee();
  const supplyBefore = await aid.totalSupply();
  console.log(`contract  : ${AGENTIC_ID} (0G official Agentic ID)`);
  console.log(`mintFee   : ${hre.ethers.formatEther(fee)} 0G`);
  console.log(`supply    : ${supplyBefore} before mint`);
  console.log(`anchoring : ${LINEAGE.length} lineage hashes\n`);

  const gas = await aid.iMint.estimateGas(signer.address, LINEAGE, { value: fee });
  const gasPrice = (await hre.ethers.provider.getFeeData()).gasPrice ?? 0n;
  console.log(`gas est   : ${gas} @ ${hre.ethers.formatUnits(gasPrice, "gwei")} gwei`);
  console.log(`cost est  : ${hre.ethers.formatEther(gas * gasPrice)} 0G\n`);

  const tx = await aid.iMint(signer.address, LINEAGE, { value: fee });
  console.log(`tx        : ${tx.hash}`);
  const receipt = await tx.wait();

  const supplyAfter = await aid.totalSupply();
  const tokenId = supplyAfter - 1n;

  console.log(`\nMinted into 0G's official Agentic ID — token #${tokenId}`);
  console.log(`block     : ${receipt.blockNumber}`);
  console.log(`gas used  : ${receipt.gasUsed}`);
  console.log(`owner     : ${await aid.ownerOf(tokenId)}`);

  // Read the data back off-chain state, so the record proves what landed rather than
  // what we intended to send.
  const stored = await aid.getIntelligentDatas(tokenId);
  console.log(`\nIntelligent data now readable from 0G's contract:`);
  for (const d of stored) console.log(`  ${d.dataDescription}\n    ${d.dataHash}`);

  const outFile = path.join(__dirname, "..", "deployments", "galileo-agentic-id.json");
  fs.writeFileSync(
    outFile,
    `${JSON.stringify(
      {
        contract: AGENTIC_ID,
        contractName: "0G official Agentic ID (AID)",
        network,
        chainId: Number(chainId),
        tokenId: tokenId.toString(),
        owner: signer.address,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        mintFee: fee.toString(),
        mintedAt: new Date().toISOString(),
        intelligentData: stored.map((d) => ({
          dataDescription: d.dataDescription,
          dataHash: d.dataHash,
        })),
        note:
          "Crucible's lineage hashes anchored in a registry 0G deployed and Crucible " +
          "does not control. Verifying against this contract requires trusting 0G, not us.",
      },
      null,
      2
    )}\n`
  );
  console.log(`\nrecorded  : ${path.relative(process.cwd(), outFile)}`);
  console.log(`explorer  : https://chainscan-galileo.0g.ai/tx/${tx.hash}`);
  console.log(`token     : https://chainscan-galileo.0g.ai/address/${AGENTIC_ID}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
