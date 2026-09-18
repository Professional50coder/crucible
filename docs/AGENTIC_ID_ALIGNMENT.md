# Crucible and 0G's official Agentic ID

**Written 2026-08-26.** Every on-chain fact below was read from 0G Galileo (chain 16602) on that
date with `eth_call` and `eth_getCode`, not taken from documentation. Where the documentation and
the deployed contract disagree, that disagreement is recorded in §3 and filed as a defect.

This document exists to answer one question a judge is entitled to ask:

> **0G ships its own Agentic ID contract. Why did you write your own?**

---

## 1 · What 0G ships

0G publishes an official Agentic ID at
[`build.0g.ai/agentic-id`](https://build.0g.ai/agentic-id): an ERC-7857 implementation for on-chain
AI-agent identity, with encrypted metadata, re-encryption on transfer, and TEE- or ZKP-verified
proofs. Reference sources: `0gfoundation/agenticID-examples` and `0gfoundation/0g-agent-nft`.

Deployed on 0G Galileo testnet, verified live:

| Property | Value |
|---|---|
| Address | `0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F` |
| `name()` | `Agentic ID` |
| `symbol()` | `AID` |
| `totalSupply()` | 138 |
| `mintFee()` | **0** |
| `paused()` | `false` |
| `owner()` | reverts — the contract uses `AccessControl`, not `Ownable` |
| Roles present | `MINTER_ROLE` = `0x9f2df0fe…56a6`, `OPERATOR_ROLE`, `DEFAULT_ADMIN_ROLE` |

No mainnet address is published.

---

## 2 · Minting is open, and that matters

The contract exposes four mint paths. Two are role-gated; two are not:

| Function | Selector | Gate |
|---|---|---|
| `mint(address)` | `0x6a627842` | open, `payable`, `whenNotPaused` |
| `iMint(address,(string,bytes32)[])` | `0x69280041` | **open**, `payable`, `whenNotPaused` |
| `mintWithRole(address)` | `0x3ce15291` | `onlyRole(MINTER_ROLE)` |
| `iMintWithRole(address,(string,bytes32)[],address)` | `0x7cc0e776` | `onlyRole(MINTER_ROLE)` |

`iMint` takes an array of `IntelligentData { string dataDescription; bytes32 dataHash; }` — which is
exactly the shape of a Crucible lineage record. Simulated from an unprivileged, unfunded address:

```
iMint(0xDe01…881D, [("manifest root", 0x0f46406e…3b93a7)])  ->  SUCCESS, tokenId 138
mintFee = 0
```

So any developer can anchor hashes into 0G's own registry for the cost of gas alone. Crucible now
does: `contracts/scripts/mint-agentic-id.js`.

---

## 3 · A documentation defect, found while confirming the above

**The interface published on `build.0g.ai/agentic-id` does not match the deployed contract.** Three
documented signatures have no corresponding selector in the bytecode at
`0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F`:

| Documented on build.0g.ai | Selector | In bytecode? | Actually deployed |
|---|---|---|---|
| `mint(address to, string encryptedURI, bytes32 metadataHash)` | `0xd34047b6` | **no** | `mint(address)` / `iMint(address,(string,bytes32)[])` |
| `authorizeUsage(uint256 tokenId, address executor, bytes permissions)` | `0x7b297a6f` | **no** | `authorizeUsage(uint256,address)` — `0xfa83d14e`, no `permissions` argument |
| `iTransferFrom(address,address,uint256,bytes sealedKey,bytes proof)` | `0x2bbd478f` | **no** | `iTransferFrom(address,address,uint256,TransferValidityProof[])` per `IERC7857.sol` |

`revokeAuthorization(uint256,address)` is the one documented method that matches.

**Why this costs a developer real time.** The page describes the testnet contract as
"pre-configured in beginner example". A developer who codes against the documented `mint` signature
gets `execution reverted` with **no revert data** — the fallback path, because the selector simply
does not exist. Nothing in that error suggests a documentation mismatch; it reads like a permission
failure, which sends you hunting for `MINTER_ROLE` you do not need, because `iMint` is open.

That is precisely the failure this project ran into, and it is logged as defect #15 in
[`FIELD_NOTES.md`](FIELD_NOTES.md).

---

## 4 · Interface comparison

| Concern | 0G official `AgenticID` | Crucible `Passport` |
|---|---|---|
| Base | `ERC721Enumerable` + `AccessControl` + `Pausable` | `ERC721` |
| Mint | `iMint(to, IntelligentData[])` | `mint(to, PassportData, encryptedURI)` |
| Metadata shape | `(string description, bytes32 hash)[]` — free-form pairs | **eight typed fields**: `baseModelHash`, `datasetRootHash`, `configHash`, `adapterRootHash`, `manifestRootHash`, `taskId`, `provider`, `mintedAt` |
| Authorization | `authorizeUsage(tokenId, user)` | `authorizeUsage(tokenId, executor, permissions)` |
| Authorization cap | 100 per token | **100 per token** — `MAX_AUTHORIZED_PER_TOKEN` |
| Revocation | `revokeAuthorization(tokenId, user)` | `revokeAuthorization(tokenId, executor)` |
| Cleared on transfer | — | yes, with `AuthorizationsCleared` |
| Encrypted URI | `_tokenURIs` | `encryptedURIOf(tokenId)` |
| Re-encryption on transfer | `iTransferFrom` with TEE/ZKP proofs | **not implemented — deliberately** |
| Clone | `IERC7857Cloneable` | **not implemented — deliberately** |
| Third-party verification | — | `verifyManifest(tokenId, candidateHash) → bool` |
| Duplicate protection | — | `lineageKey` + `DuplicateLineage` revert |

The 100-authorization cap is not a coincidence. Crucible was built against the ERC-7857 surface, and
matches it where the surface is the right shape.

---

## 5 · Why Crucible has its own contract anyway

Three reasons, in order of weight.

**1 · ERC-7857 stores one opaque hash. Provenance needs typed fields.**
`IntelligentData` is `(string description, bytes32 hash)` — a label and a digest. Nothing constrains
the label, nothing is indexed, and nothing can be queried. You cannot ask that contract *"which
token was trained on dataset `0xa5051ae7…`?"* Crucible's `PassportData` makes each element of the
lineage its own typed field, and indexes `(datasetRootHash, configHash, adapterRootHash)` so the
question is answerable on-chain.

**2 · The standard's privacy model is the opposite of what provenance needs.**
ERC-7857 exists to keep model data *encrypted*, and re-encrypts it for the new owner on transfer.
That is the right design for selling private weights. A birth certificate is worthless if only the
owner can read it — Crucible's lineage is **public by construction**, so there is no encrypted
payload to re-encrypt and the oracle half of the standard has nothing to act on. That is why
`iTransferFrom` and `clone()` are absent, and why the project says "ERC-7857-**style**" everywhere
rather than claiming the full standard.

**3 · Nothing in ERC-7857 lets a stranger check a claim.**
The official contract has no verification method. Crucible's `verifyManifest(tokenId, candidate)`
returns `true` for the anchored hash and `false` for a tampered one, is a `view`, and needs no
wallet, no account and no clone. That call *is* the product.

---

## 6 · What Crucible does about it

It does both, and says so.

- The **authoritative** record stays in `Passport.sol` — typed, indexed, and verifiable.
- The **same** manifest hash is additionally anchored into 0G's official Agentic ID via
  `iMint`, so the lineage is readable from a registry 0G deployed and Crucible does not control.

The second point is the one that matters to a sceptic. Verifying a Crucible passport against
Crucible's own contract asks you to trust Crucible's contract. Reading the same hash out of 0G's
registry does not. Two independent contracts, on the same chain, carrying the same digest —
and a third check that needs neither of them, against the manifest bytes on 0G Storage.

### Done — 0G Agentic ID token #138, 2026-08-26

| Fact | Value |
|---|---|
| Contract | `0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F` — 0G's official Agentic ID |
| Token | **#138** |
| Mint tx | `0x6e38a421581bc2f0895666694c89221394b946a9b925d41f39e37c417bc8ef68` |
| Block | 51,470,421 · 715,109 gas · mint fee 0 |
| Owner / creator | `0xDe018836935507375bb9103dFDEAC62580b9881D` |
| `IntelligentData` entries | 6 — manifest root, base model, dataset root, training config, adapter root, delivered artifact sha256 |

**The cross-check, which is the whole point.** Read the manifest root out of *0G's* contract, then
hand it to *Crucible's* contract and ask whether it agrees. Both calls are `view`, and neither needs
a wallet:

```
getIntelligentDatas(138) on 0x2700F6A3…EF1F
  → "crucible: manifest root (keccak256, canonical JSON)"
    0x0f46406e90c548205a0f59481f6c8c35e4a91a8ad5139cb8332382acd23b93a7

verifyManifest(2, 0x0f46406e…3b93a7) on 0x27087B5b…83C1c7   →  true
verifyManifest(2, keccak256("tampered"))                     →  false
```

Two contracts. One deployed by 0G, one by us. The same digest in both, agreeing — and a third check
that needs neither, against the manifest bytes on 0G Storage. A sceptic who distrusts our contract
can read 0G's; a sceptic who distrusts both can hash the file.

Recorded in `contracts/deployments/galileo-agentic-id.json`, written from values read back off the
chain after the mint rather than from what was sent.

### Also done — ERC-8004 Identity Registry registration, agentId 420, 2026-09-18

The mint above uses 0G's **ERC-7857** Agentic ID (`0x2700F6A3…EF1F`). Separately, the same
manifest is now also **registered** in the **ERC-8004** Identity Registry that 0G ships on
Galileo, `0x8004A818BFB912233c491871b3d84c89A494BD9e` (`AgentIdentity` / `AGENT`) — the
concrete form of 0G's sentence *"An Agentic ID can carry a corresponding ERC-8004
registration"*. agentId **420**, register tx
[`0x2a2e86d0…d2c85a`](https://chainscan-galileo.0g.ai/tx/0x2a2e86d027c6865b3be8826142179e97354249bab931c31494062b5352d2c85a),
with six `setMetadata` lineage writes. It is a **registration, not a verification**, it
registers a **model as an agent** (a category claim), and the registry is an **upgradeable
proxy whose admin is unidentified**. Full analysis and every tx hash:
[`ERC8004.md`](ERC8004.md) §7; machine record `runs/erc8004-galileo.json`; tool
`tools/erc8004-register.mjs`.
