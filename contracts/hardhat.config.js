require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Tests MUST run without a private key. Only the live networks consume it, and
// an empty accounts array is a legal Hardhat config — it just means "no signers
// available on that network", which is exactly right when the key is absent.
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const accounts = PRIVATE_KEY
  ? [PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`]
  : [];

/**
 * COMPILER PIN — read before changing.
 *
 * Solidity is pinned to 0.8.19 because newer versions fail 0G explorer
 * verification. That pin is non-negotiable.
 *
 * The originally specified `evmVersion: "cancun"` is NOT achievable at 0.8.19.
 * solc only learned the cancun target in 0.8.24; 0.8.19 rejects it outright
 * with "Invalid EVM version requested." Probed on this exact toolchain:
 *
 *   cancun   -> Invalid EVM version requested (HH600)
 *   shanghai -> Invalid EVM version requested (HH600)
 *   paris    -> compiles
 *   london   -> compiles
 *
 * "paris" is therefore the highest target 0.8.19 can emit and is what we pin.
 * This is safe: paris bytecode contains no PUSH0 and no cancun-only opcodes, so
 * it executes identically on a cancun-era chain such as 0G. Forward
 * compatibility is the direction that holds; the reverse is not.
 *
 * If cancun bytecode is ever genuinely required, the compiler must move to
 * >= 0.8.24 and 0G explorer verification must be re-tested first.
 *
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      // Highest target solc 0.8.19 supports. See the note above re: cancun.
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat: {
      // In-process EVM used by the test suite. No key, no RPC, no network access.
    },
    galileo: {
      url: "https://evmrpc-testnet.0g.ai",
      chainId: 16602,
      accounts,
    },
    mainnet: {
      url: "https://evmrpc.0g.ai",
      chainId: 16661,
      accounts,
    },
  },
  etherscan: {
    // 0G chainscan is a Conflux-Scan derivative, NOT Blockscout and NOT Etherscan.
    // Its Etherscan-compatible endpoint lives at /open/api, not /api. Hitting
    // https://chainscan-galileo.0g.ai/api returns the explorer's SPA HTML, which
    // is what produced:
    //   Error: Unexpected token '<', "<!doctype "... is not valid JSON
    // Confirmed live:
    //   GET /api      -> 200 text/html          (SPA shell)
    //   GET /open/api -> 200 application/json   ({"status":"0","message":"NOTOK",
    //                                             "result":"Contract source code
    //                                              not verified"})
    // The endpoint enumerates verifysourcecode / checkverifystatus / getabi /
    // getsourcecode, so the standard hardhat-verify flow works against it.
    // No API key is issued or required; hardhat-verify insists on a non-empty
    // string, so a placeholder is supplied.
    apiKey: {
      galileo: "empty",
      mainnet: "empty",
    },
    customChains: [
      {
        network: "galileo",
        chainId: 16602,
        urls: {
          apiURL: "https://chainscan-galileo.0g.ai/open/api",
          browserURL: "https://chainscan-galileo.0g.ai",
        },
      },
      {
        network: "mainnet",
        chainId: 16661,
        urls: {
          apiURL: "https://chainscan.0g.ai/open/api",
          browserURL: "https://chainscan.0g.ai",
        },
      },
    ],
  },
  sourcify: {
    // 0G chain is not on Sourcify's supported-chain list, so the Sourcify path is
    // a dead end here. Disabled explicitly to silence hardhat-verify's nag.
    enabled: false,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 120000,
  },
};
