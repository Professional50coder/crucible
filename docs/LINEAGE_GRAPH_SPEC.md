# The lineage graph — spec

The passport page carries about forty facts. A table makes you read all of them to understand any
of them. But the lineage is not a list — it is a **directed acyclic graph**, and drawing it as one
is both more legible and more honest about what the passport actually asserts.

This spec is the contract. It exists so the graph is built once, correctly, rather than three times.

---

## 1 · The graph

Eight nodes, four ranks, left to right. Three inputs converge on a task; everything after is a chain.

```
  rank 0            rank 1              rank 2                    rank 3

  BASE MODEL ─┐
              │
  DATASET ────┼──▶  0G COMPUTE TASK  ──▶  ADAPTER  ──▶  MANIFEST  ──▶  ON-CHAIN ANCHOR  ──▶  AGENTIC ID
              │       (provider, TEE)                                    (keccak256)          (token #n)
  CONFIG ─────┘
```

| Node | Kind | Carries | Verifiable by |
|---|---|---|---|
| Base model | `input` | name, `preTrainedModelHash` | 0G validated it against registered providers at task creation |
| Dataset | `input` | 0G Storage root hash, example count, token count | retrieve it from the indexer at that root hash |
| Training config | `input` | the five parameters, `configHash` | recompute the hash from the canonical JSON |
| 0G Compute task | `process` | task id, provider address, TEE signer, hardware, fee | read the task from the provider; read the signer on-chain |
| Adapter | `artifact` | root hash **or sentinel**, size, sha256 if held | `getDeliverables().modelRootHash` |
| Manifest | `record` | canonical JSON, 0G Storage root hash, size | download it, recompute its keccak256 |
| On-chain anchor | `anchor` | `manifestRootHash`, contract, block | `verifyManifest(tokenId, hash)` returns a bool |
| Agentic ID | `token` | token id, owner, mint tx | `ownerOf(tokenId)` |

## 2 · Node state — the whole point

Every node carries one of four states, and the state is derived from the record, never hardcoded:

| State | Colour | Means |
|---|---|---|
| `verified` | phosphor | checked against the chain or recomputed in the browser just now |
| `recorded` | dim/neutral | present and internally consistent, but nothing external was checked |
| `provider` | amber | the provider says so and nothing else does — off-chain, advisory |
| `lost` | danger | this link in the chain is broken, and the passport says so |

**Passport #1 and passport #2 render the identical graph.** The only difference is that #1's adapter
node is `lost` and #2's is `verified`. That single red node, in an otherwise green chain, is the most
compelling thing this project can show a judge — the same pipeline, one variable, two outcomes.

## 3 · Interaction

- **Idle.** The chain draws itself once on first view: nodes settle in rank order, edges draw after
  the nodes they connect. About 900ms total, then completely still. Nothing loops.
- **Hover a node.** It lifts (`shadow-panel-lg`), its incoming and outgoing edges brighten, and
  unrelated nodes drop to ~45% opacity. The path a value took becomes obvious without a click.
- **Click a node.** A detail panel slides in beneath the graph carrying that node's typed rows, its
  full hashes, and its verification link. Clicking another node cross-fades the panel rather than
  collapsing and reopening it. Clicking the same node again closes it.
- **Keyboard.** Nodes are real buttons in DOM order. Arrow keys move along the chain, Enter opens,
  Escape closes. The graph is not a picture with a mouse trap around it.
- **Reduced motion.** Everything above still works; the drawing, the lift and the slide all resolve
  instantly. No exceptions, no degraded version.

## 4 · Progressive disclosure elsewhere

The page's density is a real problem — but the answer is not to delete the facts, it is to let a
reader choose their depth. Three tiers:

1. **Always open, never collapsible.** The verification hero, the identity block, and the
   settlement panel when a model was lost. If a reader collapses everything and walks away, these
   three are what they should have seen.
2. **Collapsed by default, one click to open.** Decoded manifest, chain of custody, the raw
   document, and the on-chain anchor detail. Each summary line states what is inside *and* its
   verdict, so the closed state is still informative: *"Decoded manifest — 14 fields, all consistent"*.
3. **Nested inside those.** Individual field explanations.

Implement with native `<details>`/`<summary>` — animated with `framer-motion` on the content, not on
the element itself, so the section still works with JS disabled and remains findable by in-page
search. Open state persists per section in `sessionStorage`, so a reader who opens everything and
follows a link does not lose their place.

## 5 · Rules

- **SVG, not canvas.** Nodes must be selectable, linkable and readable by a screen reader.
- **No physics simulation.** Ranks are fixed. A force-directed layout that settles differently on
  each load makes a certificate look unstable.
- **The graph is generated from the record.** If a field is absent, its node renders `recorded` or
  `lost` — never invented, never hidden to make the picture tidier.
- **It degrades.** Below ~720px the graph becomes a vertical chain, same nodes, same states.
- **It prints.** In the print stylesheet the graph renders static and fully expanded.
