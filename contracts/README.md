# `@crucible/contracts` — `Passport.sol`

The on-chain anchor for Crucible. One ERC-7857-style Agentic ID per completed 0G
fine-tune, carrying that job's immutable lineage.

This is a **standalone npm project**. It is deliberately *not* a workspace member of the
repo root, so `npm install` here cannot collide with the other packages.

---

## What the contract does

0G Compute already emits everything needed to prove how a fine-tune was produced. Crucible
collects it into a canonical JSON manifest, stores that manifest on 0G Storage, and anchors
its keccak256 here. The token is the public, permanent, checkable record.

Each passport stores eight immutable fields, written once at mint and never again:

| Field | Type | Meaning |
|---|---|---|
| `baseModelHash` | `bytes32` | Hash of the pre-trained base model |
| `datasetRootHash` | `bytes32` | 0G Storage root hash of the training dataset |
| `configHash` | `bytes32` | Hash of the training config JSON |
| `adapterRootHash` | `bytes32` | 0G Storage root hash of the resulting LoRA adapter |
| `manifestRootHash` | `bytes32` | Root hash of the full manifest — **public, unencrypted** |
| `taskId` | `string` | The 0G fine-tuning task id |
| `provider` | `address` | The 0G compute provider that ran the job |
| `mintedAt` | `uint64` | Block timestamp, stamped by the contract |

`manifestRootHash` is public on purpose. Anyone can fetch the manifest from 0G Storage,
hash it, and call `verifyManifest` — no key, no permission, no cooperation from the owner.
That is the entire value proposition, and encrypting it would destroy it.

### The five invariants

1. **Lineage is immutable after mint.** No function mutates it. The test suite asserts the
   complete set of state-changing functions in the ABI, so adding a setter breaks the build.
2. **Max 100 authorized executors per token.** 100 succeeds, the 101st reverts
   `MaxAuthorizationsReached`.
3. **Every authorization is cleared on transfer.** ERC-7857 security requirement — a new
   owner must never inherit the previous owner's grants.
4. **Usage authorization never transfers ownership.** `authorizeUsage` grants execution
   rights only. ERC-721 `approve` / `setApprovalForAll` deliberately do *not* confer it:
   those are transfer permissions, and "may sell it" is not "may run it".
5. **No duplicate lineage.** The same `(datasetRootHash, configHash, adapterRootHash)`
   triple cannot be minted twice; the second attempt reverts `DuplicateLineage` with the
   colliding key and the token that already holds it.

### Public surface

```solidity
// Minting and lineage
function mint(address to, PassportData calldata data, string calldata encryptedURI)
    external returns (uint256 tokenId);
function passportOf(uint256 tokenId) external view returns (PassportData memory);
function encryptedURIOf(uint256 tokenId) external view returns (string memory);
function verifyManifest(uint256 tokenId, bytes32 candidateManifestHash) external view returns (bool);
function totalMinted() external view returns (uint256);
function lineageKey(bytes32 dataset, bytes32 config, bytes32 adapter) external pure returns (bytes32);
function tokenIdForLineage(bytes32 dataset, bytes32 config, bytes32 adapter) external view returns (uint256);

// Authorization
function authorizeUsage(uint256 tokenId, address executor, bytes calldata permissions) external;
function revokeAuthorization(uint256 tokenId, address executor) external;
function isAuthorized(uint256 tokenId, address executor) external view returns (bool);
function permissionsOf(uint256 tokenId, address executor) external view returns (bytes memory);
function authorizedCount(uint256 tokenId) external view returns (uint256);
function authorizedExecutors(uint256 tokenId) external view returns (address[] memory);
uint256 public constant MAX_AUTHORIZED_PER_TOKEN = 100;

// Plus the full ERC-721 surface from OpenZeppelin.
```

Events: `PassportMinted`, `UsageAuthorized`, `UsageRevoked`, `AuthorizationsCleared`, and
the ERC-721 `Transfer` / `Approval` / `ApprovalForAll`.

`PassportMinted` carries the entire lineage in its payload, so an indexer can reconstruct
provenance from logs alone without an archive node.

The compiled ABI is committed at [`abi/Passport.json`](./abi/Passport.json) — the bare ABI
array, not a Hardhat artifact. Downstream packages consume that file and never import this
build pipeline. Regenerate it with `npm run export-abi` after any change to the contract.

---

## Behaviour worth knowing before you integrate

**Minting is permissionless.** A mint is a public *claim* of lineage, not a privileged
assertion of truth. The proof lives in the manifest on 0G Storage, which carries the
provider's TEE attestation and is checkable by anyone. Gating the mint would introduce a
trusted party without adding a single bit of verifiability. Consumers should verify the
manifest, not trust the minter.

**`mintedAt` is stamped by the contract.** Whatever the caller puts in that field is
overwritten with `block.timestamp`, so a passport cannot be backdated. The field stays in
the input struct because the interface spec pins the struct shape.

**The owner is not implicitly authorized.** `isAuthorized(tokenId, owner)` is `false`
unless the owner explicitly authorized themselves. Implicit ownership rights would
contradict invariant 3: the new owner would silently inherit usage on transfer.

**Two families of view functions, two failure modes.**

- *Lineage* views (`passportOf`, `encryptedURIOf`, `verifyManifest`) **revert** with
  `NonexistentPassport` for an unknown token. Returning zeroed lineage would be actively
  dangerous — `verifyManifest(unknownToken, 0x00…)` would otherwise answer `true`.
- *Authorization* views (`isAuthorized`, `permissionsOf`, `authorizedCount`,
  `authorizedExecutors`) **never revert**. An unknown token simply has an empty
  authorization set, which makes them safe to call in a hot path.

**`permissions` is opaque.** Stored verbatim, never interpreted on-chain. Its meaning is
defined by the off-chain executor.

**The contract does no hashing.** `verifyManifest` compares `bytes32` values and nothing
else. Manifest canonicalization — recursive key sort, no whitespace — lives in exactly one
place, the core package, off-chain. A second implementation here would create a second
definition of truth.

**Clearing authorizations is O(1).** A transfer bumps the token's authorization epoch
rather than deleting up to 100 entries, so a token with 100 authorized executors transfers
for the same gas as an empty one. A test asserts this bound directly, so replacing the
epoch bump with a delete loop fails the suite.

---

## Testing

```bash
cd contracts
npm install
npm test
```

**No private key, no funds and no network access are required to run the tests.** The suite
runs entirely on the in-process Hardhat EVM.

Coverage:

```bash
npm run coverage
```

Last observed run: **70 passing, 0 failing**, with **100% statement, branch, function and
line coverage** of `Passport.sol`.

The suite was built test-first. It covers, among the rest, the 100-authorization boundary
from both sides, clear-on-transfer including the transfer-back case, lineage immutability
asserted at the ABI level, and every duplicate-prevention branch.

---

## Deploying

Deployment is never automated. It costs real gas and produces an address other components
hard-code, so it stays a deliberate act.

```bash
cp .env.example .env      # then set PRIVATE_KEY to a funded deployer
npm run deploy:galileo    # testnet, chain 16602
npm run deploy:mainnet    # mainnet, chain 16661
```

The script refuses to run against the ephemeral `hardhat` network, refuses an unfunded
deployer, and writes `deployments/<network>.json` with the address, tx hash, block and
exact compiler settings so downstream packages never copy an address by hand.

| Network | Name | Chain | RPC | Explorer |
|---|---|---|---|---|
| Testnet | `galileo` | 16602 | `https://evmrpc-testnet.0g.ai` | `https://chainscan-galileo.0g.ai` |
| Mainnet | `mainnet` | 16661 | `https://evmrpc.0g.ai` | `https://chainscan.0g.ai` |

### Verifying on chainscan

The constructor takes no arguments, so there is no constructor-args file:

```bash
npx hardhat verify --network galileo <DEPLOYED_ADDRESS>
```

```bash
npx hardhat verify --network mainnet <DEPLOYED_ADDRESS>
```

If the explorer's API rejects the plugin, fall back to a standard-JSON-input upload in the
chainscan UI with exactly these settings — they must match the deployment byte for byte:

| Setting | Value |
|---|---|
| Compiler | `v0.8.19` |
| EVM version | `paris` |
| Optimizer | enabled, **200** runs |
| License | MIT |

---

## Compiler pin — read before changing anything

Solidity is pinned to **0.8.19**. Newer versions fail 0G explorer verification. That pin is
non-negotiable, and two downstream consequences follow from it.

**1. `evmVersion` is `paris`, not `cancun`.** The original spec asked for `cancun`. solc
0.8.19 cannot emit it — the cancun target was only added in solc 0.8.24. Probed directly on
this toolchain:

| Requested target | Result at 0.8.19 |
|---|---|
| `cancun` | `Invalid EVM version requested.` (HH600) |
| `shanghai` | `Invalid EVM version requested.` (HH600) |
| `paris` | compiles |
| `london` | compiles |

`paris` is the highest target 0.8.19 supports, and it is safe: paris bytecode contains no
`PUSH0` and no cancun-only opcodes, so it executes identically on a cancun-era chain.
Forward compatibility is the direction that holds. Moving to cancun bytecode would require
solc >= 0.8.24 and a fresh test of 0G explorer verification first.

**2. OpenZeppelin is v4.9.x, not v5.** Every OZ v5 release requires `^0.8.20` or newer
(`ERC721.sol` in 5.6 requires `^0.8.24`), so v5 and the 0.8.19 pin are mutually exclusive.
OZ 4.9.6 declares `^0.8.0` and compiles cleanly. The practical difference: OZ 4.9 reverts
with strings rather than custom errors, so this contract defines its own
`ZeroRecipient` and `NonexistentPassport` errors and checks those conditions *before*
delegating to OZ. Every error in Crucible's own API surface is a custom error, as specified.

Both deviations are forced by the compiler pin. If the pin is ever lifted, revisit both.

---

## Layout

```
contracts/
├── contracts/Passport.sol       the contract
├── test/Passport.test.js        70 tests, no network needed
├── scripts/deploy.js            deploy — never run automatically
├── scripts/export-abi.js        regenerates abi/Passport.json
├── abi/Passport.json            committed ABI, consumed by web + orchestrator
├── deployments/<network>.json   written by deploy.js
└── hardhat.config.js            pinned compiler + both 0G networks
```
