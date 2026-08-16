// Generates 0g-expert/{train,test}.jsonl
// Every fact below traces to a source listed in datasets/README.md.
import { writeFileSync } from 'node:fs'

const OUT = new URL('./', import.meta.url)

const SYS = '0G expert. Answer precisely, using exact chain IDs, URLs and package names.'
const SYS2 = 'You are a 0G Network support engineer. Be exact and warn about known footguns.'
const SYS3 = 'You are an assistant for 0G developers. Prefer field-verified facts over stale documentation.'

// u(question, answer) -> single-turn chat record
const u = (q, a) => ({ messages: [{ role: 'user', content: q }, { role: 'assistant', content: a }] })
// s(system, ...alternating turns)
const s = (sys, ...turns) => ({
  messages: [
    { role: 'system', content: sys },
    ...turns.map((t, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: t })),
  ],
})
// m(...alternating turns) -> multi-turn, no system
const m = (...turns) => ({
  messages: turns.map((t, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: t })),
})

const R = []

// ---------------------------------------------------------------------------
// 1. What 0G is / the four components
//    src: docs.0g.ai/, build.0g.ai/, docs.0g.ai/concepts/chain
// ---------------------------------------------------------------------------
R.push(
  u('What is 0G?', '0G is a modular infrastructure stack for decentralized AI. It combines an EVM-compatible Layer 1 blockchain with three AI-specific services: 0G Storage for datasets and model artifacts, 0G Compute for inference and fine-tuning on decentralized GPUs, and 0G DA for data availability. On top of those sits Agentic ID, an on-chain identity standard for AI agents.'),
  u('Give me a one-sentence description of 0G.', '0G is a decentralized AI infrastructure stack: an AI-tuned EVM Layer 1 plus storage, compute and data-availability layers built for AI workloads.'),
  u('What are the four components of the 0G stack?', 'Chain, Storage, Compute and DA.\n\n- **0G Chain** — an EVM-compatible L1 tuned for AI apps.\n- **0G Storage** — fast decentralized storage for AI workloads, with Go, Rust and TypeScript clients.\n- **0G Compute** — decentralized AI inference and fine-tuning.\n- **0G DA** — data availability.\n\nAgentic ID, the on-chain identity layer for AI agents, is built on top of these.'),
  u('Is 0G just a blockchain?', 'No. The chain is one of four components. 0G Chain handles settlement and smart contracts, but 0G Storage, 0G Compute and 0G DA are separate systems that do the actual AI work — storing datasets, running inference and fine-tuning jobs, and guaranteeing data availability.'),
  u('Which part of 0G do I use to store a training dataset?', '0G Storage. Use the TypeScript client `@0gfoundation/0g-storage-ts-sdk`, the Go client `github.com/0gfoundation/0g-storage-client`, or the Rust SDK from `github.com/0gfoundation/0g-storage-sdk-rust`.'),
  u('Which part of 0G do I use to fine-tune a model?', '0G Compute. The fine-tuning API lives under `broker.fineTuning` in `@0gfoundation/0g-compute-ts-sdk`.'),
  u('What is 0G built for?', 'AI applications. 0G Chain is described as a blockchain built specifically for AI applications, and the storage, compute and DA layers are all designed around AI workloads such as large datasets, model artifacts and GPU jobs.'),
  s(SYS, 'New to 0G. Where do I start?', 'Start with 0G Chain, because everything settles there. Add the Galileo testnet to your wallet — network name 0G-Galileo-Testnet, chain ID 16602, RPC https://evmrpc-testnet.0g.ai, explorer https://chainscan-galileo.0g.ai, currency 0G with 18 decimals. Get test tokens from https://faucet.0g.ai, then pick the service you need: Storage for data, Compute for inference or fine-tuning.'),
  m('Does 0G have its own explorer?', 'Yes, two. ChainScan is the block explorer — https://chainscan.0g.ai for mainnet and https://chainscan-galileo.0g.ai for the Galileo testnet. StorageScan at https://storagescan.0g.ai is the separate explorer for 0G Storage.', 'Which one shows my fine-tuning transaction?', 'ChainScan. Fine-tuning tasks are created through on-chain transactions on 0G Chain, so use https://chainscan.0g.ai on mainnet or https://chainscan-galileo.0g.ai on testnet. StorageScan only shows storage uploads.'),
  u('How many projects are in the 0G ecosystem showcase?', 'The 0G Builder Hub showcase lists 173 projects.'),
)

// ---------------------------------------------------------------------------
// 2. Chain IDs, RPC, explorers, units
//    src: build.0g.ai/chain, docs.0g.ai/.../deploy-contracts, FIELD_NOTES.md
// ---------------------------------------------------------------------------
R.push(
  u('What is the 0G testnet chain ID?', '16602. That is the 0G-Galileo-Testnet.'),
  u('What is the 0G mainnet chain ID?', '16661.'),
  u('What are the chain IDs for 0G?', 'Testnet (0G-Galileo-Testnet) is chain ID 16602. Mainnet is chain ID 16661.'),
  u('chain id for 0g galileo', '16602.'),
  u('0G mainnet RPC URL?', 'https://evmrpc.0g.ai'),
  u('0G testnet RPC URL?', 'https://evmrpc-testnet.0g.ai'),
  u('Give me the full network config for 0G testnet.', 'Network name: 0G-Galileo-Testnet\nChain ID: 16602\nRPC URL: https://evmrpc-testnet.0g.ai\nBlock explorer: https://chainscan-galileo.0g.ai\nCurrency symbol: 0G\nDecimals: 18\nFaucet: https://faucet.0g.ai'),
  u('Give me the full network config for 0G mainnet.', 'Network name: 0G Mainnet\nChain ID: 16661\nRPC URL: https://evmrpc.0g.ai\nBlock explorer: https://chainscan.0g.ai\nCurrency symbol: 0G\nDecimals: 18'),
  u('What is the native token of 0G?', '0G, with 18 decimals.'),
  u('What is a neuron in 0G?', 'The base unit of the 0G token. 1 0G = 1e18 neuron, matching the token\'s 18 decimals. 0G Compute quotes `pricePerToken` in neuron — for example 500000000000 neuron per token on mainnet.'),
  u('How many neuron are in one 0G?', '1e18 — one quintillion. The 0G token has 18 decimals, so neuron is to 0G what wei is to ether.'),
  u('A provider quotes pricePerToken of 800000000000 neuron. What is that in 0G?', '800000000000 neuron divided by 1e18 = 8e-7 0G per token, which is 0.8 0G per million tokens. That is the testnet fine-tuning price.'),
  u('A provider quotes pricePerToken of 500000000000 neuron. What is that in 0G?', '500000000000 / 1e18 = 5e-7 0G per token, i.e. 0.5 0G per million tokens. That is the mainnet fine-tuning price.'),
  u('Where do I get 0G testnet tokens?', 'The faucet at https://faucet.0g.ai. It dispenses 0.1 0G per day on testnet.'),
  u('How much does the 0G faucet give me?', '0.1 0G per day, on testnet.'),
  u('What is the block explorer for 0G mainnet?', 'ChainScan, at https://chainscan.0g.ai'),
  u('What is the block explorer for the Galileo testnet?', 'https://chainscan-galileo.0g.ai'),
  u('Is there an explorer for 0G Storage?', 'Yes — StorageScan, at https://storagescan.0g.ai. It is separate from ChainScan, which covers chain transactions.'),
  u('What contract-verification API does ChainScan expose?', 'https://chainscan.0g.ai/open/api on mainnet and https://chainscan-galileo.0g.ai/open/api on the Galileo testnet.'),
  m('I added 0G to MetaMask but transactions fail.', 'Check the chain ID first. The Galileo testnet is 16602 and mainnet is 16661 — a mismatch between the RPC URL and the configured chain ID is the usual cause. Testnet RPC is https://evmrpc-testnet.0g.ai and mainnet RPC is https://evmrpc.0g.ai.', 'I had 16661 with the testnet RPC.', 'That is the problem. Chain ID 16661 is mainnet. Either set the chain ID to 16602 to keep using https://evmrpc-testnet.0g.ai, or switch the RPC to https://evmrpc.0g.ai to stay on 16661.'),
)

// ---------------------------------------------------------------------------
// 3. Chain internals
//    src: docs.0g.ai/concepts/chain, build.0g.ai/chain
// ---------------------------------------------------------------------------
R.push(
  u('What consensus does 0G Chain use?', 'A highly optimized version of CometBFT, formerly Tendermint, with tuned block production intervals and timeout configurations.'),
  u('Is CometBFT the same as Tendermint?', 'CometBFT is the successor to Tendermint — the same BFT consensus engine under a new name. 0G Chain runs a highly optimized version of it.'),
  u('What throughput does 0G Chain claim?', 'Up to 11,000 TPS per shard, with sub-second finality.'),
  u('How fast is finality on 0G Chain?', 'Sub-second — near-instant transaction confirmation.'),
  u('Is 0G Chain EVM compatible?', 'Yes. Existing Ethereum code works without changes. Any Solidity contract compiled for the cancun hard fork with Solidity 0.8.19 will deploy unchanged.'),
  u('What Solidity version should I target on 0G?', '0.8.19, compiled for the cancun EVM version. Pass `--evm-version cancun` to ensure compatibility with the EVM upgrades 0G Chain supports.'),
  u('What EVM version should I compile for on 0G Chain?', 'cancun. The docs recommend `--evm-version cancun`.'),
  u('Which dev frameworks does 0G Chain support?', 'Hardhat and Foundry are both supported for deploying contracts.'),
  u('Describe 0G Chain\'s modular architecture.', 'It separates two layers. The consensus layer is dedicated to achieving network agreement — validator coordination and block production. The execution layer focuses on state management: smart contract execution, transaction processing, and EVM compatibility.'),
  u('How are validators selected on 0G Chain?', 'Via a VRF — a Verifiable Random Function — for fair validator selection. Validators stake 0G tokens to participate and CometBFT provides Byzantine fault tolerance.'),
  u('How do 0G validators earn?', 'Three ways: block production rewards, transaction fee collection, and staking yields proportional to stake size.'),
  u('Does 0G use proof of work?', 'No, 0G Chain is proof-of-stake. Validators stake 0G tokens to participate and CometBFT ensures Byzantine fault tolerance. Separately, 0G Storage uses PoRA — Proof of Random Access — which is a mining mechanism, but the chain itself is PoS.'),
  s(SYS, 'Can I just deploy my existing Hardhat project to 0G?', 'Yes. 0G Chain is EVM-compatible, so a Solidity contract compiled for the cancun hard fork with Solidity 0.8.19 deploys unchanged. Point Hardhat at https://evmrpc.0g.ai with chain ID 16661 for mainnet, or https://evmrpc-testnet.0g.ai with chain ID 16602 for Galileo testnet.'),
)

// ---------------------------------------------------------------------------
// 4. Precompiles / predeployed contracts
//    src: docs.0g.ai/.../deploy-contracts, .../staking-interfaces, web search
// ---------------------------------------------------------------------------
R.push(
  u('What precompiles does 0G Chain have?', 'Two are documented: **DASigners**, at `0x0000000000000000000000000000000000001000`, which exposes data-availability signatures; and **Wrapped0GBase**, in the same precompile range at `0x...1002`, which handles wrapped 0G token operations.'),
  u('What is the DASigners precompile address?', '`0x0000000000000000000000000000000000001000`.'),
  u('What does the DASigners precompile do?', 'It is the interface through which Solidity contracts interact with the 0G chain module DASigners — data-availability signatures. It is registered as a precompiled contract, like other precompiled EVM extensions.'),
  u('What is Wrapped0GBase?', 'A 0G Chain precompile for wrapped 0G token operations. It sits in the precompile range at `0x...1002`, alongside DASigners at `0x...1000`.'),
  u('How do I become a DA signer on 0G?', 'Your address needs enough delegations — at least the TokensPerVote amount of 0G tokens, which is 30 tokens per vote on testnet — registered in the DASigners module. Then call `registerSigner` with your address, node socket address, BLS public key, and a signature signed by your BLS private key. Each signer must run a DA node that verifies blob encoding and generates BLS signatures for signed blobs.'),
  u('What is TokensPerVote in the DASigners module?', 'The delegation threshold to become a signer. On testnet it is 30 0G tokens per vote.'),
  u('What signature scheme do 0G DA signers use?', 'BLS. Signers register a BLS public key plus a signature made with their BLS private key, and their DA node generates BLS signatures for signed blobs.'),
  u('What is the 0G staking contract address on mainnet?', '`0xea224dBB52F57752044c0C86aD50930091F561B9` — the IStaking contract, the central registry for validators and global parameters.'),
  m('I want to read DA signer info from a smart contract. How?', 'Call the DASigners precompile at `0x0000000000000000000000000000000000001000`. It is the Solidity-facing interface to the chain\'s DASigners module.', 'Is that address the same on testnet and mainnet?', 'Precompiles live at fixed addresses baked into the chain\'s EVM, so the address is the same across 0G networks. The delegation parameters differ though — TokensPerVote is 30 0G tokens on testnet.'),
)

// ---------------------------------------------------------------------------
// 5. 0G Storage
//    src: docs.0g.ai/concepts/storage, build.0g.ai/storage, FIELD_NOTES.md
// ---------------------------------------------------------------------------
R.push(
  u('What is 0G Storage?', 'A decentralized storage network for AI workloads. It uses a two-lane system: a data publishing lane that handles metadata and availability proofs verified through the 0G Consensus network, and a data storage lane that holds the actual data using erasure coding.'),
  u('What are the two layers of 0G Storage?', 'The **Log Layer** and the **Key-Value Layer**.\n\n- Log Layer: immutable, append-only — write once, read many. Optimized for large files. Used for ML datasets, archives and blockchain history.\n- Key-Value Layer: mutable. You can update existing data, with fast key-based retrieval. Used for databases and real-time applications.'),
  u('What is the difference between 0G Storage\'s Log layer and Key-Value layer?', 'The Log layer is immutable and append-only — write once, read many — and is optimized for large files like ML datasets and archives. The Key-Value layer is mutable: it lets you update existing data and retrieve it fast by key, which suits databases and real-time applications.'),
  u('Which 0G Storage layer should I use for a training dataset?', 'The Log layer. It is append-only and optimized for large files, which is exactly the ML-dataset case. The Key-Value layer is for mutable data you need to update.'),
  u('Can I update a file stored in 0G Storage?', 'Only through the Key-Value layer, which is the mutable one. The Log layer is append-only — write once, read many — so data written there cannot be changed.'),
  u('What is PoRA?', 'Proof of Random Access, 0G Storage\'s mining mechanism. The system randomly challenges miners to prove they hold specific data; the miner must generate a valid hash, similar to Bitcoin mining; successful proofs earn rewards.'),
  u('Explain how PoRA works, step by step.', 'Three steps.\n1. **Random challenges** — the system randomly asks miners to prove they have specific data.\n2. **Hash generation** — the miner must produce a valid hash, like Bitcoin mining.\n3. **Reward** — successful proofs earn rewards.\n\nThe mining range is capped at 8 TB per operation so small miners can compete with large operations.'),
  u('What does PoRA stand for?', 'Proof of Random Access.'),
  u('Why is 0G Storage\'s mining range capped at 8 TB?', 'To prevent centralization. The cap means small miners can compete with large operations rather than being outscaled by them.'),
  u('What is the mining range limit in 0G Storage?', '8 TB per operation.'),
  u('How does 0G Storage handle node failures?', 'Erasure coding splits data into chunks with redundancy, so even if 30% of nodes fail, the data remains accessible.'),
  u('What retrieval speed does 0G Storage claim?', '200 MBPS, even at network congestion.'),
  u('What makes 0G Storage different from other decentralized storage?', 'It is positioned as the only solution supporting both structured and unstructured data, with instant access. The Key-Value layer covers structured, mutable data while the Log layer covers large immutable files.'),
  u('What is the TypeScript package for 0G Storage?', '`@0gfoundation/0g-storage-ts-sdk`. Install it with `npm install @0gfoundation/0g-storage-ts-sdk ethers`. The current version is 1.2.11 and it is ISC licensed.'),
  u('What is the Go client for 0G Storage?', '`github.com/0gfoundation/0g-storage-client`. Install with `go get github.com/0gfoundation/0g-storage-client`.'),
  u('Is there a Rust SDK for 0G Storage?', 'Yes: `git clone https://github.com/0gfoundation/0g-storage-sdk-rust`.'),
  u('What are the main methods in the 0G Storage TypeScript SDK?', '`Indexer.upload()` for file uploads with Merkle proof generation, and `Indexer.download()` for retrieval with proof verification. Payloads are supplied as `MemData` for in-memory data or `ZgFile` for files.'),
  u('What is the difference between MemData and ZgFile?', 'They are the two payload types in the 0G Storage TypeScript SDK. `MemData` wraps in-memory data; `ZgFile` wraps a file on disk.'),
  u('What are the 0G Storage indexer URLs?', 'Testnet: https://indexer-storage-testnet-turbo.0g.ai and https://indexer-storage-testnet-standard.0g.ai\nMainnet: https://indexer-storage-turbo.0g.ai and https://indexer-storage-standard.0g.ai'),
  u('What is the turbo indexer for 0G Storage on mainnet?', 'https://indexer-storage-turbo.0g.ai'),
  u('What is the standard indexer for 0G Storage on testnet?', 'https://indexer-storage-testnet-standard.0g.ai'),
  s(SYS3, 'I uploaded the same file twice to 0G Storage and got "execution reverted".', 'That is expected. The flow contract rejects a root hash it already holds, so re-uploading an identical file reverts with `execution reverted` / `CALL_EXCEPTION`. Catch the error and reuse the existing root hash — the data is already stored.'),
  m('What does uploadDataset return?', 'A string: the root hash of the uploaded dataset. That root hash is what you pass to `createTask` as the dataset hash.', 'What if the upload reverts?', 'A revert on an identical re-upload is expected — the flow contract will not accept a root hash it already has. Catch the `CALL_EXCEPTION` and reuse the root hash you already have rather than treating it as a failure.'),
)

// ---------------------------------------------------------------------------
// 6. 0G DA
//    src: docs.0g.ai/concepts/da
// ---------------------------------------------------------------------------
R.push(
  u('What is 0G DA?', '0G\'s data availability layer. Data is erasure-coded and split into data chunks that are distributed across Storage Nodes in the 0G Storage network. DA nodes, chosen randomly by a Verifiable Random Function, verify the data in small groups called quorums and submit availability proofs to the 0G Consensus network.'),
  u('How are 0G DA nodes selected?', 'Randomly, using a Verifiable Random Function (VRF).'),
  u('Why does 0G DA use a VRF to pick nodes?', 'A VRF generates random values that are unpredictable yet verifiable by others. That unpredictability prevents potentially malicious nodes from colluding, since no node can know in advance that it will be selected.'),
  u('What is a quorum in 0G DA?', 'A small group of DA nodes that work together to check and verify stored data. The system assumes most nodes in each group act honestly — the "honest majority" assumption.'),
  u('What security assumption does 0G DA make?', 'An honest majority within each quorum: the system assumes that most nodes in a given group will act honestly.'),
  u('Do 0G DA nodes verify all the data?', 'No. 0G DA uses a sampling-based approach — rather than verifying all data, DA nodes sample portions of it, which drastically reduces the data they need to handle.'),
  u('Who finalizes availability proofs in 0G DA?', 'Validators in the 0G Consensus network, who are separate from the DA nodes. The DA nodes submit availability proofs and the validators verify and finalize them.'),
  u('Are 0G DA nodes the same as 0G validators?', 'No, they are separate roles. DA nodes sample and verify data and submit availability proofs; validators in the 0G Consensus network then verify and finalize those proofs.'),
  u('What throughput has 0G DA achieved?', '50 Gbps on the Galileo Testnet, through parallel data processing enabled by erasure coding and horizontally scalable consensus networks.'),
  u('How does 0G DA get its security?', 'It inherits Ethereum\'s security, leveraging over 34 million ETH staked — approximately $80 billion in cryptoeconomic security.'),
  u('Does 0G DA use erasure coding?', 'Yes. Data is erasure-coded and split into data chunks distributed across Storage Nodes. The erasure coding is also what enables the parallel data processing behind the 50 Gbps figure measured on the Galileo Testnet.'),
  m('How does 0G DA differ from 0G Storage?', '0G Storage is where data physically lives — erasure-coded chunks spread across Storage Nodes, with a Log layer for immutable large files and a Key-Value layer for mutable data. 0G DA is the guarantee layer on top: VRF-selected DA nodes sample those chunks in quorums and submit availability proofs to the 0G Consensus network.', 'So DA nodes store the data too?', 'No. The chunks live on Storage Nodes. DA nodes sample portions of that data to verify availability rather than storing or checking all of it.'),
)

// ---------------------------------------------------------------------------
// 7. 0G Compute — general
//    src: docs.0g.ai/concepts/compute, build.0g.ai/compute, FIELD_NOTES.md
// ---------------------------------------------------------------------------
R.push(
  u('What is 0G Compute?', 'A decentralized framework providing AI computing capabilities — in practice a decentralized marketplace where GPU owners sell computing power to developers. It covers both inference and fine-tuning, with pay-per-use pricing and no subscriptions.'),
  u('How much cheaper is 0G Compute than traditional cloud?', 'The documentation states 90% cheaper than traditional cloud providers.'),
  u('How do payments work on 0G Compute?', 'Smart contract escrow: you deposit funds for credits, submit requests, and payment is released only after service delivery. GPU owners get paid immediately upon completion.'),
  u('What is the settlement mechanism for 0G Compute?', 'ZK-proof settlement, which the docs describe as giving 100x lower transaction costs through compressed proofs.'),
  u('What verification methods does 0G Compute support?', 'TEEML, OPML and ZKML — TEE-based, optimistic and zero-knowledge machine learning proofs of computation.'),
  u('Does a 0G Compute provider keep my data?', 'No. The documentation states there is no data retention by providers, and verifiable computation proofs are available.'),
  u('What is the flow for a GPU owner on 0G Compute?', 'Four steps: register hardware specifications, set competitive pricing, receive automatic job allocation, and get paid immediately upon completion.'),
  u('What is the flow for an AI user on 0G Compute?', 'Deposit funds for credits, submit AI requests, receive results from available GPUs, and pay only for the compute used.'),
  u('What Node version do I need for the 0G Compute SDK?', 'Node 20 or later.'),
  u('What is the npm package for 0G Compute?', '`@0gfoundation/0g-compute-ts-sdk`. Current version 0.9.0, ISC licensed. Install the CLI with `pnpm add @0gfoundation/0g-compute-ts-sdk -g`.'),
  u('I see both @0glabs and @0gfoundation packages. Which do I use?', 'Use `@0gfoundation/*` — they are current. `@0gfoundation/0g-compute-ts-sdk` is at 0.9.0 and `@0gfoundation/0g-storage-ts-sdk` at 1.2.11. The `@0glabs/*` family (`0g-serving-broker` 0.7.8, `0g-ts-sdk` 0.3.3) is older; the official fine-tuning example still pins `@0glabs/0g-serving-broker` at ^0.7.1, which is why you see both. All are ISC licensed.'),
  u('What licence are the 0G SDKs under?', 'ISC — permissive, so reuse is fine with attribution. That covers `@0gfoundation/0g-compute-ts-sdk`, `@0gfoundation/0g-storage-ts-sdk`, `@0glabs/0g-serving-broker` and `@0glabs/0g-ts-sdk`.'),
  u('What version is @0gfoundation/0g-compute-ts-sdk?', '0.9.0.'),
  u('What version is @0gfoundation/0g-storage-ts-sdk?', '1.2.11.'),
)

// ---------------------------------------------------------------------------
// 8. Compute — inference specifics
//    src: build.0g.ai/compute
// ---------------------------------------------------------------------------
R.push(
  u('How do I set up a 0G Compute account from the CLI?', 'Set `PRIVATE_KEY` for a funded wallet, then run:\n\n```\n0g-compute-cli setup-network\n0g-compute-cli login\n0g-compute-cli deposit --amount 3\n```\n\nThe CLI examples use 3, but that is not a contract minimum — see the deposit question. On testnet, fund the wallet from https://faucet.0g.ai first.'),
  u('What is the minimum deposit for 0G Compute?', 'Not 3 OG, despite what the CLI and SDK suggest. The 3 OG figure is a **client-side guard hardcoded in the SDK**, applied on every network. The ledger contract itself is the authority: `LedgerManager.MIN_ACCOUNT_BALANCE()` reads **0.1 0G on testnet**. A ledger was created with 0.3 0G and worked, so anyone told they need 3 OG to start is being blocked by a client, not by the chain. Read the contract, not the CLI help text.'),
  u('How do I list inference providers from the CLI?', '`0g-compute-cli inference list-providers`'),
  u('How do I transfer funds to a specific 0G provider?', '`0g-compute-cli transfer-fund --provider $PROVIDER --amount 1`'),
  u('How do I acknowledge an inference provider?', '`0g-compute-cli inference acknowledge-provider --provider $PROVIDER`'),
  u('How do I get my 0G inference API secret?', '`0g-compute-cli inference get-secret --provider $PROVIDER`. It returns an `app-sk-...` key.'),
  u('What are the two ways to call 0G inference?', 'Either through the OpenAI-compatible HTTP endpoint or through the broker SDK.\n\n1. **OpenAI SDK** — point `baseURL` at `${ZG_SERVICE_URL}/v1/proxy` and use your `app-sk-...` API key. Existing OpenAI client code works unchanged.\n2. **Broker SDK** — `createZGComputeNetworkBroker(wallet)` with an ethers wallet, then `broker.inference.getServiceMetadata()` and `broker.inference.getRequestHeaders()`. This handles wallet-based authentication directly inside your application.'),
  u('Can I use the OpenAI SDK with 0G?', 'Yes. 0G Compute exposes an OpenAI-compatible API. Set the client\'s `baseURL` to `${ZG_SERVICE_URL}/v1/proxy` and pass your `app-sk-...` key as the API key. Install it alongside the 0G SDK with `npm install openai`.'),
  u('What is the baseURL for 0G\'s OpenAI-compatible endpoint?', '`${ZG_SERVICE_URL}/v1/proxy`, where `ZG_SERVICE_URL` is the provider\'s service URL.'),
  u('What does an 0G inference API key look like?', 'It starts with `app-sk-` — for example `app-sk-...`, retrieved with `0g-compute-cli inference get-secret --provider $PROVIDER`.'),
  u('What does broker.inference.getRequestHeaders() do?', 'It produces the signed request headers for a 0G inference call, so the broker SDK can authenticate with your wallet directly from your application rather than using a static API key.'),
  u('What model is available on the 0G testnet inference provider 0xa48f01287233509FD694a22Bf840225062E67836?', '`qwen/qwen-2.5-7b-instruct`.'),
  u('What kinds of inference does 0G Compute support?', 'Chat completions, image generation, and speech processing, with pay-per-request on-chain settlement.'),
  u('How many inference providers are on 0G?', 'As measured against the live network on 2026-08-14: 2 on testnet (chain 16602) and 21 on mainnet (chain 16661).'),
  m('Can I list 0G services without a private key?', 'Yes. `createZGComputeNetworkReadOnlyBroker(rpcUrl, chainId?)` needs no wallet and no private key. It exposes `fineTuning.listService()`, `fineTuning.listModel()`, `inference.listService()` and `inference.listServiceWithDetail()`.', 'What extra does listServiceWithDetail give me?', 'Health metrics — notably `healthMetrics.uptime` for each service.'),
)

// ---------------------------------------------------------------------------
// 9. Compute — fine-tuning: availability, providers, pricing
//    src: FIELD_NOTES.md (live-verified 2026-08-14)
// ---------------------------------------------------------------------------
R.push(
  u('Is fine-tuning available on 0G mainnet?', 'Yes. Verified against the live network on 2026-08-14: mainnet (chain 16661) has one fine-tuning provider, `0x940b4a101CaBa9be04b16A7363cafa29C1660B0d`, unoccupied and available. Note that the official `fine-tuning-example` repo\'s `.env.example` says "Mainnet — fine-tuning not yet available"; that comment is stale. The SDK ships MAINNET_MODELS, mainnet indexer URLs, and a live mainnet provider.'),
  u('The 0G fine-tuning example says mainnet fine-tuning is not available. Is that true?', 'No, that comment is stale. Live checks on 2026-08-14 found a working, unoccupied fine-tuning provider on mainnet at `0x940b4a101CaBa9be04b16A7363cafa29C1660B0d`, and the SDK ships MAINNET_MODELS and mainnet indexer URLs. Mainnet fine-tuning works.'),
  u('How many fine-tuning providers does 0G have?', 'One per network. Testnet (chain 16602) has 1 and mainnet (chain 16661) has 1, as verified on 2026-08-14.'),
  u('What is the 0G testnet fine-tuning provider address?', '`0xA02b95Aa6886b1116C4f334eDe00381511E31A09`.'),
  u('What is the 0G mainnet fine-tuning provider address?', '`0x940b4a101CaBa9be04b16A7363cafa29C1660B0d`.'),
  u('Is 0G fine-tuning cheaper on testnet or mainnet?', 'Mainnet, by a wide margin. Mainnet charges 500000000000 neuron per token versus testnet\'s 800000000000 — mainnet is 37.5% cheaper. There is no cost reason to prefer testnet.'),
  u('What does 0G fine-tuning cost per token?', '800000000000 neuron per token on testnet and 500000000000 neuron per token on mainnet. In 0G terms that is 0.8 and 0.5 0G per million tokens respectively.'),
  u('What hardware do the 0G fine-tuning providers run?', 'Both the testnet and mainnet providers report a quota of `["8","187","1","900","H200"]` — 8 CPUs, 187 GB memory, 1 GPU, 900 GB storage, and an NVIDIA H200.'),
  u('What does the quota array on a 0G service mean?', 'It is `[cpu, memory GB, gpus, storage GB, GPU model]`. The fine-tuning providers report `["8","187","1","900","H200"]`: 8 CPUs, 187 GB RAM, 1 GPU, 900 GB storage, H200.'),
  u('Do 0G compute providers run in a TEE?', 'Yes. The fine-tuning providers run in Phala dstack, which is Intel TDX, with an on-chain acknowledged TEE signer. Both the testnet and mainnet providers report `teeSignerAddress` `0x24135b4Bd964872284728F79F5f17eB874C5583A` with `teeSignerAcknowledged` true. Combined with `broker.fineTuning.verifyService()`, the attestation is an independently verifiable claim.'),
  u('What is the teeSignerAddress on the 0G fine-tuning providers?', '`0x24135b4Bd964872284728F79F5f17eB874C5583A` — the same address on both testnet and mainnet, with `teeSignerAcknowledged` set to true.'),
  u('What TEE technology does 0G use for compute?', 'Providers run in Phala dstack, which is Intel TDX.'),
  u('What is the Automata attestation endpoint in the 0G SDK?', 'RPC `https://1rpc.io/ata` with contract `0xE26E11B257856B0bEBc4C759aaBDdea72B64351F`, used for TEE quote verification.'),
  u('What are the fields on a 0G ServiceStructOutput?', '`provider`, `url`, `quota`, `pricePerToken`, `occupied`, `models`, `teeSignerAddress`, `teeSignerAcknowledged`.'),
  u('What does the "occupied" flag on a 0G provider mean?', 'That the provider is currently busy with a task. Because there is only one fine-tuning provider per network, tasks queue one at a time — so you must check `occupied` before creating a task, and treat a busy provider as a normal state to surface in your UI, not an error.'),
  s(SYS2, 'My fine-tuning task will not start.', 'Check `occupied` on the provider first. There is only one fine-tuning provider per network, so tasks queue one at a time — if another user\'s task is running, the provider reports `occupied: true` and yours must wait. That is a normal state, not a failure. Use `listService()` on a read-only broker to check without needing a wallet.'),
)

// ---------------------------------------------------------------------------
// 10. Compute — models
// ---------------------------------------------------------------------------
R.push(
  u('What models can I fine-tune on 0G?', '`Qwen2.5-0.5B-Instruct` on both testnet and mainnet, and `Qwen3-32B` on mainnet only.'),
  u('Can I fine-tune Qwen3-32B on 0G testnet?', 'No. Qwen3-32B is mainnet-only. Testnet offers only `Qwen2.5-0.5B-Instruct`.'),
  u('What models does the 0G testnet fine-tuning provider offer?', 'Just `Qwen2.5-0.5B-Instruct`.'),
  u('What models does the 0G mainnet fine-tuning provider offer?', '`Qwen2.5-0.5B-Instruct` and `Qwen3-32B`.'),
  u('What tokenizer does Qwen2.5-0.5B-Instruct use on 0G?', '`Qwen/Qwen2.5-0.5B-Instruct`.'),
  u('What tokenizer does Qwen3-32B use on 0G?', '`Qwen/Qwen3-32B`.'),
  u('Should I pass Qwen/Qwen2.5-0.5B-Instruct as the model name?', 'No. Model names take no `Qwen/` prefix when passed as `--model`. Use `Qwen2.5-0.5B-Instruct`. The `Qwen/`-prefixed form is the tokenizer identifier, not the model argument.'),
  u('How big is the LoRA adapter from a 0G fine-tune?', 'About 100 MB for `Qwen2.5-0.5B-Instruct` and about 900 MB for `Qwen3-32B`.'),
  u('What is the storage reserve fee for fine-tuning on 0G?', '0.01 0G for `Qwen2.5-0.5B-Instruct` and 0.09 0G for `Qwen3-32B`.'),
  u('Why does each 0G model have a turbo hash and a standard hash?', 'Each model carries a `turbo` hash for TEE storage and an empty `standard` hash. The contract validates the model hash against registered providers when a task is created.'),
  m('I want the cheapest 0G fine-tune that still shows a real behaviour change.', 'Use `Qwen2.5-0.5B-Instruct` on mainnet. It is available on both networks, but mainnet costs 0.5 0G per million tokens against testnet\'s 0.8, and the storage reserve is only 0.01 0G. Budget 200 to 1,000 examples — that is 0G\'s guidance for seeing real behaviour change on that model.', 'What if I used Qwen3-32B instead?', 'It is mainnet-only, the LoRA is about 900 MB rather than 100 MB, the storage reserve rises to 0.09 0G, and 0G suggests 500 to 5,000 examples. More capable, but a much bigger job for a demo.'),
)

// ---------------------------------------------------------------------------
// 11. Compute — the fine-tuning API surface
// ---------------------------------------------------------------------------
R.push(
  u('How do I create a fine-tuning task on 0G?', '`broker.fineTuning.createTask(provider, model, datasetHash, trainingPath, gasPrice?)`. It returns the task ID.'),
  u('What does broker.fineTuning.uploadDataset return?', 'A string — the root hash of the uploaded dataset. Signature: `uploadDataset(dataPath, gasPrice?, maxGasPrice?)`.'),
  u('What is uploadDatasetToTEE?', '`broker.fineTuning.uploadDatasetToTEE(provider, datasetPath)` uploads a dataset directly to the provider\'s TEE. It returns `{ datasetHash, message }`.'),
  u('How do I estimate the token count of my dataset on 0G?', '`broker.fineTuning.calculateToken(datasetPath, model, usePython, provider?)`. It uses the real model tokenizer, so it is more accurate than any character-based heuristic.'),
  u('How do I check the status of my 0G fine-tuning task?', '`broker.fineTuning.getTask(provider, taskID?)` for one task, or `broker.fineTuning.listTask(provider)` for all of them.'),
  u('How do I read the training logs of a 0G task?', '`broker.fineTuning.getLog(provider, taskID?)` returns them as a string.'),
  u('How do I cancel a 0G fine-tuning task?', '`broker.fineTuning.cancelTask(provider, taskId)`.'),
  u('How do I verify a 0G compute provider\'s TEE attestation?', '`broker.fineTuning.verifyService(provider, outputDir?, onLog?)` returns a VerificationResult. It checks the provider\'s TEE attestation, which for the fine-tuning providers is Phala dstack / Intel TDX with an on-chain acknowledged TEE signer.'),
  u('How do I see my 0G compute account balance and refunds?', '`broker.fineTuning.getAccountWithDetail(provider)` returns `{ account, refunds[] }`.'),
  u('What is acknowledgeProviderSigner for?', '`broker.fineTuning.acknowledgeProviderSigner(provider, gasPrice?)` acknowledges the provider\'s TEE signer on chain. The fine-tuning providers already report `teeSignerAcknowledged: true`.'),
  u('How do I create a read-only 0G compute broker?', '`createZGComputeNetworkReadOnlyBroker(rpcUrl, chainId?)` — it requires no wallet and no private key.'),
  u('How do I create an authenticated 0G compute broker?', '`createZGComputeNetworkBroker(signer)`, passing an ethers signer or wallet.'),
  u('What does listModel() return?', '`broker.fineTuning.listModel()` returns a pair: an array of `[name, cfg]` entries and an array of per-provider model lists.'),
  u('Does listService take any arguments?', 'Yes — `broker.fineTuning.listService(includeUnacknowledged?)`. It returns `ServiceStructOutput[]`.'),
)

// ---------------------------------------------------------------------------
// 12. Task lifecycle, the 48-hour deadline, footguns
// ---------------------------------------------------------------------------
R.push(
  u('What are the states of a 0G fine-tuning task?', 'Init → SettingUp → SetUp → Training → Trained → Delivering → Delivered → UserAcknowledged → Finished, with Failed as the terminal error state. `Delivered` starts the 48-hour acknowledgement clock; `Finished` is when decryption becomes possible.'),
  u('What comes after Training in the 0G task lifecycle?', 'Trained, then Delivering, then Delivered.'),
  u('What state does a 0G task reach before I can decrypt the model?', 'Finished. Decryption only becomes possible at `Finished`, which is after `UserAcknowledged`.'),
  u('Which 0G task state starts the acknowledgement deadline?', '`Delivered`. From that point you have 48 hours to acknowledge.'),
  u('What is the 48-hour rule in 0G fine-tuning?', 'Once a task reaches `Delivered`, you have 48 hours to acknowledge it. Miss the window and you lose the model *and* 30% of the fee is deducted. Nothing warns you — the deadline is silent, so you have to track it yourself.'),
  u('What happens if I miss the 48-hour acknowledgement window on 0G?', 'You lose the model and 30% of the fee is deducted. There is no warning before it happens.'),
  u('How much of the fee do I lose if I do not acknowledge a 0G deliverable in time?', '30%, and you lose the model as well.'),
  u('How do I acknowledge a finished 0G fine-tuning task?', '`broker.fineTuning.acknowledgeModel(provider, taskId, dataPath, options?)`. It downloads the artifact, verifies the on-chain hash, and acknowledges in one call. Options are `downloadMethod` (`auto` | `tee` | `0g-storage`, where auto tries 0G Storage first and falls back to the TEE), `teeIdleTimeoutMs` (default 60000, measuring idle time not total time), and `teeMaxRetries` (default 2, so 3 attempts).'),
  u('What does downloadMethod: auto do in acknowledgeModel?', 'It tries 0G Storage first and falls back to the TEE if that fails.'),
  u('What is the default teeIdleTimeoutMs in acknowledgeModel?', '60000 ms. Importantly it measures *idle* time, not total elapsed time — a slow but steady download will not trip it.'),
  u('What is the default teeMaxRetries?', '2, which means 3 attempts in total.'),
  u('Why are downloadModelFrom0GStorage and decryptModel deprecated on 0G?', 'Because the legacy two-step flow could permanently lock a user\'s deliverable queue. A user in a May 2026 hackathon bug report retrieved a model with `downloadModelFrom0GStorage` + `decryptModel` and never called `acknowledgeModel`. Days later the artifact was garbage-collected from both 0G Storage and the TEE buffer. At that point `acknowledgeModel` could no longer succeed, because it requires a successful download — and every subsequent `addDeliverable` reverted with "previous deliverable not acknowledged". Use `acknowledgeModel`, which downloads, verifies and acknowledges atomically.'),
  u('My 0G deliverable queue is locked and addDeliverable reverts with "previous deliverable not acknowledged". What do I do?', 'Use the escape hatch: `broker.fineTuning.acknowledgeDeliverable(provider, taskId)`. It acknowledges without requiring a download, which is what unblocks an already-stuck queue. The usual cause is having used the deprecated `downloadModelFrom0GStorage` + `decryptModel` path and never acknowledging, after which the artifact was garbage-collected and `acknowledgeModel` could no longer succeed.'),
  u('What is acknowledgeDeliverable for?', '`broker.fineTuning.acknowledgeDeliverable(provider, taskId, gasPrice?)` is the escape hatch for an already-stuck deliverable queue. For the normal path use `acknowledgeModel`, which downloads, verifies the on-chain hash and acknowledges in one call.'),
  u('I called decryptModel and got "second arg must be public key". Why?', 'You decrypted too early. `decryptModel` fails that way if the task has not yet reached `Finished`. The provider needs roughly a minute after acknowledgement to settle and upload the key. Poll the task state rather than guessing — and prefer `acknowledgeModel`, since `decryptModel` is deprecated.'),
  u('How do I download just the LoRA from a 0G task?', '`broker.fineTuning.downloadLoRAFromTEE(provider, taskId, outputPath, opts?)`.'),
  s(SYS2, 'My task just hit Delivered. What now?', 'Acknowledge it within 48 hours. From `Delivered` you have a 48-hour window; miss it and you lose the model and 30% of the fee, with no warning. Call `broker.fineTuning.acknowledgeModel(provider, taskId, dataPath)` — it downloads, verifies the on-chain hash and acknowledges in one call. Do not use the deprecated `downloadModelFrom0GStorage` + `decryptModel` path; that is what permanently locks deliverable queues.'),
  m('How long do I have to acknowledge a 0G model?', '48 hours from the moment the task reaches `Delivered`.', 'And if I miss it?', 'You lose the model and 30% of the fee is deducted. Nothing warns you beforehand, so you need your own timer.', 'Can I recover afterwards?', 'You cannot recover the model. If your deliverable queue ends up locked — every `addDeliverable` reverting with "previous deliverable not acknowledged" — `acknowledgeDeliverable(provider, taskId)` is the escape hatch that unblocks the queue.'),
)

// ---------------------------------------------------------------------------
// 13. Dataset format + training config
// ---------------------------------------------------------------------------
R.push(
  u('What dataset formats does 0G fine-tuning accept?', 'Three, and you must pick one and use it consistently across the whole file:\n\n1. Chat messages (recommended for instruct models) — `{"messages":[{"role":"user","content":"…"},{"role":"assistant","content":"…"}]}`. Supports multi-turn and a system role.\n2. Instruction — `{"instruction":"…","input":"…","output":"…"}`, where `input` may be empty.\n3. Text completion — `{"text":"…"}`.'),
  u('Which dataset format should I use for Qwen2.5-0.5B-Instruct on 0G?', 'Chat messages. It is the recommended format for instruct models and it is the only one that supports multi-turn conversations and a system role.'),
  u('Can I mix dataset formats in one 0G file?', 'No. Pick one format and use it consistently across the whole file. Mixing is a hard failure.'),
  u('What are the file requirements for a 0G dataset?', 'JSONL with a `.jsonl` extension, UTF-8 encoded, at least 10 examples, one JSON object per line, no trailing commas, and no blank lines between records.'),
  u('What is the minimum number of examples for a 0G fine-tune?', '10. But 10 is only the hard floor — for real behaviour change 0G recommends 200 to 1,000 examples for Qwen2.5-0.5B and 500 to 5,000 for Qwen3-32B.'),
  u('How many examples do I need to actually change Qwen2.5-0.5B\'s behaviour?', '200 to 1,000, per 0G\'s sizing guidance. The minimum of 10 will be accepted but will not move the model. For reference, the shipped 0G example uses 30 train and 10 test.'),
  u('How many examples for Qwen3-32B?', '500 to 5,000 for real behaviour change, against a hard minimum of 10.'),
  u('How big is 0G\'s shipped example dataset?', '30 training examples and 10 test examples.'),
  u('Show me a valid chat-format record for 0G.', '`{"messages":[{"role":"user","content":"What is the 0G testnet chain ID?"},{"role":"assistant","content":"16602."}]}`\n\nOne JSON object on one line, no trailing comma, no blank line after it.'),
  u('Show me a valid instruction-format record for 0G.', '`{"instruction":"Summarise the passage.","input":"0G Chain uses CometBFT.","output":"It runs an optimized CometBFT consensus."}`\n\nThe `input` field may be an empty string when the instruction needs no context.'),
  u('Can the input field be empty in 0G\'s instruction format?', 'Yes. `input` may be empty — an empty string is valid for instructions that need no additional context.'),
  u('What keys does the 0G training config accept?', 'Exactly five: `neftune_noise_alpha`, `num_train_epochs`, `per_device_train_batch_size`, `learning_rate` and `max_steps`. No additions and no removals.'),
  u('What are the valid ranges for the 0G training config?', '`neftune_noise_alpha` 0–10; `num_train_epochs` a positive integer; `per_device_train_batch_size` 1–4; `learning_rate` 0.00001–0.001; `max_steps` either −1 or a positive integer.'),
  u('Can I write learning_rate as 2e-4 in a 0G training config?', 'No — use decimal notation, `0.0002`. Scientific notation is rejected.'),
  u('What does the working 0G training config look like?', '```json\n{\n  "neftune_noise_alpha": 5,\n  "num_train_epochs": 3,\n  "per_device_train_batch_size": 2,\n  "learning_rate": 0.0002,\n  "max_steps": 45\n}\n```\n\nNote this differs from the docs template, which uses `num_train_epochs: 1` and `max_steps: 3`. The values above are what the shipped `fine-tuning-example` actually uses.'),
  u('The 0G docs show max_steps 3 but the example uses 45. Which is right?', 'The docs page shows a minimal template — `num_train_epochs: 1`, `max_steps: 3`. The shipped `fine-tuning-example/config/training_config.json` uses `num_train_epochs: 3` and `max_steps: 45`. Both are structurally valid; the example\'s values are the ones known to produce a real run.'),
  u('What is neftune_noise_alpha?', 'One of the five keys in a 0G training config. Valid range is 0 to 10; both the docs template and the shipped example use 5.'),
  s(SYS, 'My dataset has 12 examples. Is that enough?', 'It will be accepted — 0G\'s hard minimum is 10 — but it will not change the model\'s behaviour. For Qwen2.5-0.5B, 0G recommends 200 to 1,000 examples. With 12 you will pay for a job whose output is indistinguishable from the base model.'),
  m('My upload was rejected. The file looks fine.', 'Check the mechanical rules first: `.jsonl` extension, UTF-8 encoding, one JSON object per line, no trailing commas, no blank lines between records, and at least 10 examples.', 'There is a blank line at the end.', 'A single trailing newline is normal and fine. What 0G rejects is a blank line *between* records — an empty line in the middle of the file. If your file ends with one newline character after the last object, that is correct JSONL.'),
  m('Can I use a system prompt in my 0G dataset?', 'Yes, if you use the chat-messages format. It supports both multi-turn conversations and a system role. The instruction and text formats do not.', 'How do I write it?', 'Add a message with `"role": "system"` as the first element of the `messages` array, before the user turn — for example `{"messages":[{"role":"system","content":"You are a 0G expert."},{"role":"user","content":"..."},{"role":"assistant","content":"..."}]}`.'),
)

// ---------------------------------------------------------------------------
// 14. Agentic ID / ERC-7857
// ---------------------------------------------------------------------------
R.push(
  u('What is an Agentic ID?', 'On-chain identity for an AI agent, built on ERC-7857. Unlike a traditional NFT that merely references metadata, an Agentic ID contains the actual AI agent intelligence — when you own one, you own the complete intelligence, not just a certificate.'),
  u('What was Agentic ID called before?', 'INFT, or Intelligent NFT. It is the same standard — ERC-7857 — and the same encrypted-metadata transfer model, just renamed.'),
  u('What is an INFT?', 'The former name for an Agentic ID. Same ERC-7857 standard, same encrypted-metadata transfer model.'),
  u('What standard do Agentic IDs use?', 'ERC-7857.'),
  u('What does ERC-7857 add to ERC-721?', 'Four things: encrypted metadata storage to protect AI algorithms, secure re-encryption enabling safe ownership transitions, oracle verification ensuring transfer validity, and authorized usage mechanisms for AI-as-a-Service deployments.'),
  u('What happens when an Agentic ID is transferred?', 'Both the ownership and the encrypted AI intelligence transfer together. During `iTransferFrom`, the oracle — a TEE or ZKP — re-encrypts the intelligent data for the new owner.'),
  u('What does iTransferFrom do in ERC-7857?', 'It transfers ownership with re-encryption: the oracle, either a TEE or a ZKP, re-encrypts the intelligent data for the new owner so the agent\'s intelligence moves with the token.'),
  u('How do I mint an Agentic ID?', 'Call `mint()`, which registers the agent with encrypted intelligent data hashes.'),
  u('Can I let someone use my Agentic ID without selling it?', 'Yes. `authorizeUsage()` grants per-token execution rights without transferring ownership, and `revokeAuthorization()` removes those permissions at any time. Each token supports up to 100 authorized users.'),
  u('How many users can be authorized on one Agentic ID?', 'Up to 100 per token.'),
  u('What is revokeAuthorization?', 'The ERC-7857 function that removes previously granted usage permissions. It can be called at any time.'),
  u('Is Agentic ID data ever decrypted publicly?', 'No. The design maintains encryption throughout the entire lifecycle — only the owner can access it. Transfers re-encrypt for the new owner rather than exposing the plaintext.'),
  u('What is the Agentic ID contract address on 0G testnet?', '`0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F` on 0G Galileo.'),
  u('Is ERC-7857 compatible with ERC-8004?', 'Yes. Agentic IDs are compatible with the ERC-8004 Trustless Agent standard, which makes them discoverable across the broader agent ecosystem.'),
  u('What is ERC-8004?', 'The Trustless Agent standard. Agentic IDs are compatible with it, enabling discoverability across the broader agent ecosystem.'),
  u('How do Agentic IDs use the rest of the 0G stack?', 'All four components: 0G Storage for decentralized AI persistence, 0G Chain for the smart contracts, 0G Compute for secure inference, and 0G DA for transfer verification.'),
  u('What authorization patterns does Agentic ID support?', 'Per-token authorization, batch authorization across many agents, hot-wallet delegation, and agent cloning patterns.'),
  u('What stack do the Agentic ID examples use?', 'Next.js, wagmi, RainbowKit, Hardhat, TypeScript, Solidity and EIP-712. The reference implementation is `0g-agent-nft` from 0gfoundation, and the examples live in the `agenticID-examples` repository.'),
  m('If I sell my AI agent as an Agentic ID, does the buyer get the model?', 'Yes. Both the ownership and the encrypted AI intelligence transfer together — that is the point of ERC-7857 versus a plain ERC-721, which would only transfer a pointer to metadata.', 'How does the buyer decrypt it?', 'During `iTransferFrom` the oracle — a TEE or a ZKP — re-encrypts the intelligent data for the new owner. The data is never exposed in plaintext; encryption is maintained throughout the entire lifecycle.'),
)

// ---------------------------------------------------------------------------
// 15. Cross-cutting / comparison / edge phrasing
// ---------------------------------------------------------------------------
R.push(
  u('Summarise 0G in three bullet points.', '- An EVM-compatible L1 running optimized CometBFT, up to 11,000 TPS per shard with sub-second finality.\n- Storage, Compute and DA layers purpose-built for AI: erasure-coded storage with PoRA mining, a decentralized GPU marketplace for inference and fine-tuning, and VRF-selected DA quorums.\n- Agentic ID (ERC-7857), which puts an AI agent\'s encrypted intelligence itself on chain rather than a pointer to it.'),
  u('0G', '0G is a decentralized AI infrastructure stack: an EVM-compatible L1 (chain ID 16661 on mainnet, 16602 on the Galileo testnet) plus 0G Storage, 0G Compute and 0G DA, with Agentic ID for on-chain agent identity. What would you like to know about?'),
  u('what chain id', 'For 0G: 16602 on the Galileo testnet and 16661 on mainnet.'),
  u('Which is faster, 0G Chain finality or 0G DA throughput?', 'Those measure different things. 0G Chain reports sub-second finality and up to 11,000 TPS per shard. 0G DA reports 50 Gbps of data throughput on the Galileo Testnet. One is a latency and transaction-rate figure, the other a bandwidth figure.'),
  u('Does 0G use VRFs anywhere?', 'In two places. 0G Chain uses a VRF for fair validator selection, and 0G DA uses a VRF to randomly choose which DA nodes verify data — there, the unpredictability is what prevents malicious nodes from colluding.'),
  u('What is the relationship between 0G Storage and 0G DA?', '0G DA is built on top of 0G Storage. Data is erasure-coded and split into chunks that are distributed across Storage Nodes in the 0G Storage network; DA nodes, selected by VRF, then sample those chunks in quorums and submit availability proofs to the 0G Consensus network, where validators finalize them.'),
  u('If I want verifiable AI training, what does 0G give me?', 'Three things that compose. Providers run in TEEs — Phala dstack, Intel TDX — with an on-chain acknowledged TEE signer, and `broker.fineTuning.verifyService()` checks the attestation. The task itself is created on chain, so the provider, model and dataset hash are all recorded. And 0G Compute supports TEEML, OPML and ZKML as verification methods.'),
  u('Is the 0G token called OG or 0G?', 'The currency symbol is 0G, with 18 decimals. Some CLI text writes it as "OG" — for example `0g-compute-cli deposit --amount 3` — but it is the same native token.'),
  u('Name every 0G URL I need as a developer.', 'Chain RPC: https://evmrpc.0g.ai (mainnet), https://evmrpc-testnet.0g.ai (testnet)\nExplorers: https://chainscan.0g.ai, https://chainscan-galileo.0g.ai\nStorage explorer: https://storagescan.0g.ai\nStorage indexers: https://indexer-storage-turbo.0g.ai, https://indexer-storage-standard.0g.ai (mainnet); https://indexer-storage-testnet-turbo.0g.ai, https://indexer-storage-testnet-standard.0g.ai (testnet)\nFaucet: https://faucet.0g.ai\nDocs: https://docs.0g.ai · Builder Hub: https://build.0g.ai'),
  u('Is 0G a Layer 2?', 'No. 0G Chain is an EVM-compatible Layer 1 with its own CometBFT-based proof-of-stake consensus and its own validator set. Its DA layer does inherit Ethereum\'s security — over 34 million ETH staked, roughly $80 billion in cryptoeconomic security — but the chain itself is an L1.'),
  u('What does "modular" mean in 0G\'s case?', 'Two senses. Within the chain, the consensus layer (validator coordination, block production) is separated from the execution layer (state management, smart contracts, EVM compatibility). Across the stack, storage, compute and data availability are independent services you can adopt individually rather than a monolith.'),
  s(SYS3, 'Give me the shortest correct answer: which network should I fine-tune on?', 'Mainnet, chain 16661. It is 37.5% cheaper (500000000000 versus 800000000000 neuron per token), has more models (Qwen3-32B as well as Qwen2.5-0.5B-Instruct), and its fine-tuning provider is live and unoccupied — despite the example repo\'s stale comment claiming mainnet fine-tuning is unavailable.'),
  m('I want to build a provenance record of a fine-tune on 0G. What can I actually prove?', 'Several things are independently checkable. The task creation transaction on 0G Chain records the provider address, model and dataset root hash. The dataset root hash itself is a Merkle commitment produced by 0G Storage on upload. `broker.fineTuning.verifyService(provider)` returns a TEE attestation result — the fine-tuning providers run Phala dstack / Intel TDX with `teeSignerAddress` `0x24135b4Bd964872284728F79F5f17eB874C5583A` acknowledged on chain. And the task state transitions through to `Finished` are on-chain facts.', 'Which of those is the weakest link?', 'The dataset contents. The chain records a root hash, so it proves *which* bytes were used — but it says nothing about where those bytes came from or whether they were accurate. Provenance of the source material has to be asserted and evidenced off chain.'),
  u('Emoji test: does 0G handle unicode in datasets? 🚀', 'Yes — 0G requires datasets to be UTF-8 encoded, so emoji (🚀), accented characters (café, naïve, Zürich) and CJK text (零重力, データ, 데이터) are all valid inside JSON string values. What matters is that the file is genuinely UTF-8 and has no byte-order mark, and that each line remains a single valid JSON object.'),
  u('Do I need to escape braces or quotes in a 0G dataset?', 'Inside JSON string values you must escape double quotes as \\" and backslashes as \\\\, and newlines must be written as \\n rather than a literal line break — a literal newline would split the record across two lines and break JSONL. Braces { and } need no escaping inside a string. Using a real JSON serializer rather than string concatenation handles all of this for you.'),
)

// ---------------------------------------------------------------------------
// 16. Paraphrase variety — same verified facts, different question styles.
//     Deliberately includes terse, misspelled, conversational and
//     multiple-choice framings so the model generalises rather than memorising.
// ---------------------------------------------------------------------------
R.push(
  u('whats the testnet chain id for 0g', '16602 — the 0G-Galileo-Testnet.'),
  u('0g mainnet chainid?', '16661.'),
  u('Is 0G testnet 16601 or 16602?', '16602. The 0G-Galileo-Testnet is chain ID 16602; mainnet is 16661.'),
  u('True or false: 0G mainnet is chain 16602.', 'False. 16602 is the Galileo *testnet*. Mainnet is chain ID 16661.'),
  u('I need to point ethers at 0G mainnet. What do I pass?', 'RPC URL https://evmrpc.0g.ai with chain ID 16661. The native currency is 0G with 18 decimals.'),
  u('Which RPC goes with chain 16602?', 'https://evmrpc-testnet.0g.ai — the Galileo testnet RPC.'),
  u('Which RPC goes with chain 16661?', 'https://evmrpc.0g.ai — the mainnet RPC.'),
  u('Tell me about 0G Storage in one sentence.', '0G Storage is a decentralized, erasure-coded storage network with an immutable append-only Log layer for large files and a mutable Key-Value layer for fast key-based retrieval, secured by Proof of Random Access mining.'),
  u('Is the 0G Log layer mutable?', 'No. The Log layer is immutable and append-only — write once, read many. The Key-Value layer is the mutable one.'),
  u('Is the 0G Key-Value layer append-only?', 'No, it is the mutable layer — it lets you update existing data with fast key-based retrieval. The Log layer is the append-only one.'),
  u('Which 0G Storage layer suits a real-time application?', 'The Key-Value layer. It is mutable and offers fast key-based retrieval, which is what databases and real-time applications need.'),
  u('Which 0G Storage layer suits an archive?', 'The Log layer — immutable, append-only, optimized for large files, and intended for ML datasets, archives and blockchain history.'),
  u('proof of random access — what network is that?', '0G Storage. PoRA is its mining mechanism: random challenges ask miners to prove they hold specific data, the miner generates a valid hash like Bitcoin mining, and successful proofs earn rewards.'),
  u('Does 0G Chain use PoRA?', 'No. PoRA — Proof of Random Access — is 0G Storage\'s mining mechanism. 0G Chain uses proof-of-stake with an optimized CometBFT consensus.'),
  u('what tps does 0g do', 'Up to 11,000 TPS per shard, with sub-second finality.'),
  u('Does 0G Chain use Tendermint?', 'Effectively yes — it runs a highly optimized version of CometBFT, which is the renamed successor to Tendermint, with tuned block production intervals and timeout configurations.'),
  u('Explain 0G DA to someone who knows Ethereum.', 'It is a data availability layer, like blobs on Ethereum but with a different trust model. Data is erasure-coded into chunks spread across 0G Storage nodes. A VRF randomly selects DA nodes, which sample portions of the data in small quorums under an honest-majority assumption, then submit availability proofs to the 0G Consensus network for validators to finalize. It reports 50 Gbps on the Galileo Testnet and inherits Ethereum\'s security — over 34 million ETH staked, roughly $80 billion.'),
  u('What is the honest majority assumption in 0G DA?', 'The assumption that most nodes within each quorum will act honestly. Quorums are small groups of DA nodes that check and verify stored data together.'),
  u('50 Gbps — what is that number about in 0G?', 'The data throughput 0G DA achieved on the Galileo Testnet, enabled by parallel data processing through erasure coding and horizontally scalable consensus networks.'),
  u('34 million ETH — what is that about in 0G?', 'The staked ETH that 0G DA inherits security from — over 34 million ETH, approximately $80 billion in cryptoeconomic security.'),
  u('What does the "0G" in 0G Compute\'s TEEML stand for?', 'Nothing — TEEML is one of the three verification methods 0G Compute supports, alongside OPML and ZKML. TEEML is trusted-execution-based ML verification, OPML is optimistic, ZKML is zero-knowledge.'),
  u('List the verification options in 0G Compute.', 'TEEML, OPML and ZKML.'),
  u('How does 0G Compute keep transaction costs low?', 'ZK-proof settlement — compressed proofs, which the documentation describes as giving 100x lower transaction costs.'),
  u('Do I subscribe to 0G Compute?', 'No, there are no subscriptions. It is pay-per-use — you deposit funds for credits and pay only for the compute you actually consume, with payment released from smart contract escrow after service delivery.'),
  u('give me the compute sdk package name', '`@0gfoundation/0g-compute-ts-sdk`, currently version 0.9.0.'),
  u('give me the storage sdk package name', '`@0gfoundation/0g-storage-ts-sdk`, currently version 1.2.11.'),
  u('Is @0glabs/0g-serving-broker still current?', 'No, it is the older package — version 0.7.8. The current compute SDK is `@0gfoundation/0g-compute-ts-sdk` 0.9.0. The official `fine-tuning-example` still pins `@0glabs/0g-serving-broker` at ^0.7.1, which is why both appear in the wild. Both are ISC licensed.'),
  u('Is @0glabs/0g-ts-sdk still current?', 'No — it is the older storage SDK at version 0.3.3. Use `@0gfoundation/0g-storage-ts-sdk` 1.2.11 instead.'),
  u('how much does it cost to fine tune on 0g', 'Fine-tuning is priced per token: 0.5 0G per million tokens on mainnet and 0.8 0G per million tokens on testnet, multiplied by the number of epochs. On top of that there is a one-off storage reserve fee — 0.01 0G for Qwen2.5-0.5B-Instruct or 0.09 0G for Qwen3-32B.'),
  u('Work out the cost of fine-tuning 100,000 tokens for 3 epochs on 0G mainnet.', '100,000 ÷ 1,000,000 = 0.1 million tokens. At the mainnet price of 0.5 0G per million, that is 0.05 0G per epoch, so 0.15 0G for 3 epochs. Add the 0.01 0G storage reserve for Qwen2.5-0.5B-Instruct: **0.16 0G** total.'),
  u('Same job on testnet — what does it cost?', 'At 0.8 0G per million tokens: 0.1 × 0.8 = 0.08 0G per epoch, so 0.24 0G for 3 epochs, plus the 0.01 0G storage reserve = **0.25 0G**. That is why mainnet is the better choice — it is 37.5% cheaper per token.'),
  u('What is the formula for 0G fine-tuning cost?', 'tokens ÷ 1,000,000 × price-per-million × epochs, plus the model\'s storage reserve fee. Price-per-million is 0.8 0G on testnet and 0.5 0G on mainnet; the storage reserve is 0.01 0G for Qwen2.5-0.5B-Instruct and 0.09 0G for Qwen3-32B.'),
  u('Which GPU trains my model on 0G?', 'An NVIDIA H200. Both the testnet and mainnet fine-tuning providers report a quota of `["8","187","1","900","H200"]` — 8 CPUs, 187 GB memory, 1 GPU, 900 GB storage, H200.'),
  u('Can two people fine-tune on 0G at the same time?', 'Not on the same network. There is only one fine-tuning provider per network, and tasks queue one at a time — the provider\'s `occupied` flag tells you whether it is busy. Check it before creating a task and treat a busy provider as an expected state.'),
  u('occupied: true — is that an error?', 'No. It means the single fine-tuning provider for that network is currently running a task. Because there is one provider per network and tasks queue one at a time, a busy provider is a normal first-class state to surface, not a failure.'),
  u('Where is my 0G fine-tuning job actually running?', 'Inside a TEE. The fine-tuning providers run in Phala dstack, which is Intel TDX, with an on-chain acknowledged TEE signer (`0x24135b4Bd964872284728F79F5f17eB874C5583A`). You can check the attestation yourself with `broker.fineTuning.verifyService(provider)`.'),
  u('What is Phala dstack?', 'The TEE runtime the 0G fine-tuning providers run in. It is based on Intel TDX, and the providers publish an on-chain acknowledged TEE signer so the attestation can be verified independently.'),
  u('what happens after Delivered', 'Delivered → UserAcknowledged → Finished. Delivered starts a 48-hour clock in which you must acknowledge, or you lose the model and 30% of the fee. Finished is the state at which decryption becomes possible.'),
  u('Is Failed part of the normal 0G task lifecycle?', 'It is the terminal error state, reachable from the normal path. The success path is Init → SettingUp → SetUp → Training → Trained → Delivering → Delivered → UserAcknowledged → Finished.'),
  u('What is the first state of a 0G fine-tuning task?', 'Init.'),
  u('What is the last state of a successful 0G fine-tuning task?', 'Finished, which is also when decryption becomes possible.'),
  u('48 hours — what is that deadline in 0G?', 'The acknowledgement window. From the moment a fine-tuning task reaches `Delivered`, you have 48 hours to acknowledge it; miss it and you lose the model and 30% of the fee, with no warning.'),
  u('Which single call should I use to collect a finished 0G model?', '`broker.fineTuning.acknowledgeModel(provider, taskId, dataPath)`. It downloads the artifact, verifies the on-chain hash and acknowledges, all in one call. Avoid the deprecated `downloadModelFrom0GStorage` + `decryptModel` pair.'),
  u('Are there any deprecated methods in the 0G fine-tuning SDK?', 'Yes — `downloadModelFrom0GStorage` and `decryptModel` are both deprecated. Using them, and then failing to acknowledge, is what permanently locked a user\'s deliverable queue in a documented May 2026 hackathon bug report.'),
  u('what erc is agentic id', 'ERC-7857.'),
  u('Is Agentic ID just an NFT?', 'It extends ERC-721, but the difference matters: a traditional NFT merely references metadata, whereas an Agentic ID contains the actual AI agent intelligence as encrypted metadata. Own one and you own the complete intelligence, not just a certificate — and on transfer the encrypted intelligence moves with it, re-encrypted for the new owner by a TEE or ZKP oracle.'),
  u('Can I clone an agent on 0G?', 'Agent cloning patterns are among the authorization patterns Agentic ID supports, alongside per-token authorization, batch authorization across many agents, and hot-wallet delegation.'),
  u('What does 0G recommend for instruct-model datasets?', 'The chat-messages format: `{"messages":[{"role":"user","content":"…"},{"role":"assistant","content":"…"}]}`. It is recommended for instruct models and is the only one of the three formats supporting multi-turn conversations and a system role.'),
  u('Can a text-format 0G dataset have a system prompt?', 'No. The text format is just `{"text":"…"}` — it has no roles. Only the chat-messages format supports a system role and multi-turn conversations.'),
  u('How many formats does 0G accept and can I mix them?', 'Three — chat messages, instruction, and text — and no, you cannot mix them. Pick one and use it consistently throughout the file.'),
  u('Is a .json file acceptable for 0G fine-tuning?', 'No. 0G expects JSONL with a `.jsonl` extension: one JSON object per line, not a single JSON array. A `.json` file containing an array will be rejected.'),
  u('Can my 0G dataset be UTF-16?', 'No. 0G requires UTF-8.'),
  u('How many epochs does the shipped 0G example train for?', '3 — `num_train_epochs: 3` in `fine-tuning-example/config/training_config.json`, with `max_steps: 45`. The docs template instead shows 1 epoch and `max_steps: 3`.'),
  u('What is the maximum per_device_train_batch_size on 0G?', '4. The valid range is 1 to 4.'),
  u('What learning rate range does 0G accept?', '0.00001 to 0.001, written in decimal notation — `2e-4` is rejected, use `0.0002`.'),
  u('Can I add an extra key to the 0G training config?', 'No. It must contain exactly five keys — `neftune_noise_alpha`, `num_train_epochs`, `per_device_train_batch_size`, `learning_rate`, `max_steps` — with no additions and no removals.'),
  u('Can max_steps be -1 on 0G?', 'Yes. `max_steps` must be either −1 or a positive integer.'),
  s(SYS, 'Quick sanity check — is 0.8 0G per million tokens the mainnet price?', 'No, that is testnet. Mainnet is 0.5 0G per million tokens (500000000000 neuron per token); testnet is 0.8 (800000000000 neuron per token). Mainnet is 37.5% cheaper.'),
  s(SYS2, 'I get "previous deliverable not acknowledged" on every task.', 'Your deliverable queue is locked. It happens when a previous deliverable was never acknowledged — typically after using the deprecated `downloadModelFrom0GStorage` + `decryptModel` path, after which the artifact gets garbage-collected from both 0G Storage and the TEE buffer, and `acknowledgeModel` can no longer succeed because it requires a successful download. The escape hatch is `broker.fineTuning.acknowledgeDeliverable(provider, taskId)`, which acknowledges without downloading.'),
  m('Walk me through fine-tuning on 0G end to end.', 'Seven steps.\n1. Fund a wallet and create an authenticated broker with `createZGComputeNetworkBroker(signer)`.\n2. Check the provider with `listService()` — confirm `occupied` is false.\n3. Estimate cost with `calculateToken(datasetPath, model, usePython, provider?)`.\n4. Upload with `uploadDataset(dataPath)` to get a root hash, or `uploadDatasetToTEE(provider, datasetPath)`.\n5. `createTask(provider, model, datasetHash, trainingPath)` returns a task ID.\n6. Poll `getTask(provider, taskId)` through Training → Trained → Delivering → Delivered.\n7. Within 48 hours of Delivered, call `acknowledgeModel(provider, taskId, dataPath)`.', 'What if step 4 reverts?', 'An identical re-upload reverts with `execution reverted` / `CALL_EXCEPTION`, because the flow contract rejects a root hash it already holds. That is expected — catch it and reuse the existing root hash.', 'And if I am late on step 7?', 'You lose the model and 30% of the fee. Nothing warns you, so set your own timer from the moment the state becomes Delivered.'),
  m('Which network has more inference providers?', 'Mainnet, by a large margin — 21 inference providers against 2 on testnet, as verified on 2026-08-14.', 'And fine-tuning providers?', 'One on each network. Testnet has `0xA02b95Aa6886b1116C4f334eDe00381511E31A09` and mainnet has `0x940b4a101CaBa9be04b16A7363cafa29C1660B0d`. Both were unoccupied and available when checked.'),
  u('Does 0G Storage guarantee my data survives node failure?', 'Erasure coding splits data into chunks with redundancy such that even if 30% of nodes fail, the data remains accessible.'),
  u('Give me a very short answer: what is 0G Compute?', 'A decentralized marketplace where GPU owners sell computing power to developers, covering both AI inference and fine-tuning.'),
  u('Explain 0G to a non-technical person in two sentences, in plain language, without jargon, assuming they have heard of Bitcoin but nothing else, and be honest about what is a claim rather than a measured fact.', '0G is a set of shared, public services for building AI — a payment-and-record system like Bitcoin\'s, plus places to keep large amounts of data and rent time on powerful graphics chips to train or run AI models. Note that figures like "90% cheaper than traditional cloud" and "11,000 transactions per second per shard" come from 0G\'s own documentation and are claims rather than results you should treat as independently measured.'),
)

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

// Deterministic shuffle (seeded LCG) so train/test split is reproducible.
let seed = 20260814
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const shuffled = [...R]
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1))
  ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
}

const testCount = Math.round(shuffled.length * 0.15)
const test = shuffled.slice(0, testCount)
const train = shuffled.slice(testCount)

const toJsonl = (rs) => rs.map((r) => JSON.stringify(r)).join('\n') + '\n'
writeFileSync(new URL('train.jsonl', OUT), toJsonl(train), 'utf8')
writeFileSync(new URL('test.jsonl', OUT), toJsonl(test), 'utf8')

// Duplicate check
const seen = new Set()
let dupes = 0
for (const r of R) {
  const key = JSON.stringify(r)
  if (seen.has(key)) dupes++
  seen.add(key)
}
console.log(`total ${R.length}  train ${train.length}  test ${test.length}  duplicates ${dupes}`)
