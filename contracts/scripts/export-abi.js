/**
 * Export the compiled Passport ABI to contracts/abi/Passport.json.
 *
 * The web app and orchestrator consume this file directly. It holds the bare ABI
 * array — not the full Hardhat artifact — so nothing downstream has to know or care
 * that this package builds with Hardhat.
 *
 *   npm run export-abi
 *
 * Safe to run any time; it recompiles first so the exported ABI can never drift
 * behind the source.
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  await hre.run("compile");

  const artifact = await hre.artifacts.readArtifact("Passport");

  const outDir = path.join(__dirname, "..", "abi");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "Passport.json");

  fs.writeFileSync(outFile, `${JSON.stringify(artifact.abi, null, 2)}\n`);

  const fnCount = artifact.abi.filter((e) => e.type === "function").length;
  const eventCount = artifact.abi.filter((e) => e.type === "event").length;
  const errorCount = artifact.abi.filter((e) => e.type === "error").length;

  console.log(
    `Wrote ${path.relative(process.cwd(), outFile)} — ` +
      `${fnCount} functions, ${eventCount} events, ${errorCount} errors.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
