/**
 * Deploy Passport.sol to a 0G network.
 *
 * NOT run as part of the test suite and never executed automatically. Deployment
 * costs real gas and produces an address other components will hard-code, so it is
 * always a deliberate, human-initiated act.
 *
 *   npx hardhat run scripts/deploy.js --network galileo   # testnet, chain 16602
 *   npx hardhat run scripts/deploy.js --network mainnet   # mainnet, chain 16661
 *
 * Requires PRIVATE_KEY in contracts/.env with a funded account on the target chain.
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const EXPLORERS = {
  16602: "https://chainscan-galileo.0g.ai",
  16661: "https://chainscan.0g.ai",
};

async function main() {
  const network = hre.network.name;

  if (network === "hardhat" || network === "localhost") {
    throw new Error(
      `Refusing to deploy to "${network}". A passport contract deployed to an ` +
        `ephemeral chain is worse than useless — it hands out an address that ` +
        `disappears. Pass --network galileo or --network mainnet.`
    );
  }

  const signers = await hre.ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      "No signer available. Set PRIVATE_KEY in contracts/.env before deploying."
    );
  }
  const [deployer] = signers;

  const { chainId } = await hre.ethers.provider.getNetwork();
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log(`network   : ${network} (chainId ${chainId})`);
  console.log(`deployer  : ${deployer.address}`);
  console.log(`balance   : ${hre.ethers.formatEther(balance)} 0G`);

  if (balance === 0n) {
    throw new Error(
      `Deployer ${deployer.address} holds no 0G on ${network}. Fund it first.`
    );
  }

  const Passport = await hre.ethers.getContractFactory("Passport");
  const passport = await Passport.deploy();
  console.log(`tx        : ${passport.deploymentTransaction().hash}`);

  await passport.waitForDeployment();
  const address = await passport.getAddress();
  const receipt = await passport.deploymentTransaction().wait();

  console.log(`\nPassport deployed to ${address}`);
  console.log(`block     : ${receipt.blockNumber}`);
  console.log(`gas used  : ${receipt.gasUsed.toString()}`);

  // Record the deployment so downstream packages can pick the address up without
  // anyone copying it by hand out of a terminal.
  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${network}.json`);
  fs.writeFileSync(
    outFile,
    `${JSON.stringify(
      {
        network,
        chainId: Number(chainId),
        address,
        deployer: deployer.address,
        txHash: passport.deploymentTransaction().hash,
        blockNumber: receipt.blockNumber,
        deployedAt: new Date().toISOString(),
        compiler: {
          version: "0.8.19",
          evmVersion: "paris",
          optimizer: { enabled: true, runs: 200 },
        },
      },
      null,
      2
    )}\n`
  );
  console.log(`recorded  : ${path.relative(process.cwd(), outFile)}`);

  const explorer = EXPLORERS[Number(chainId)];
  console.log(`\nExplorer  : ${explorer}/address/${address}`);
  console.log(`\nVerify with:\n  npx hardhat verify --network ${network} ${address}`);
  console.log("\nThe constructor takes no arguments, so no constructor-args file is needed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
