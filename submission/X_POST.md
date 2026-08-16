# Crucible — Public X Post (mandatory Wave 3 requirement)

The post is a hard requirement, not a bonus. It must be **public**, and it must contain all of:

| Required | Value |
|---|---|
| Project name | Crucible |
| Demo screenshot or clip | attached media (see per-draft asset note) |
| Hashtags | `#0GBridge` `#BuildOn0G` |
| Tags | `@0G_labs` `@0G_Builders` `@AKINDO_io` |

Three drafts below. Pick one, attach the named asset, post it, then paste the resulting URL into
`submission/CHECKLIST.md` and the AKINDO form.

**Counting note.** X collapses any URL to **23 characters** regardless of its real length, and
attached media does not count at all. Everything else counts literally, including the newlines
between paragraphs. The limit is **280**. The mandatory hashtag + tag block —
`#0GBridge #BuildOn0G @0G_labs @0G_Builders @AKINDO_io` — is **53 characters** on its own, plus
the two newlines that separate it from the body, so budget **55** for it before writing a word.

**Recounted 2026-08-16** after this file was rewritten to remove three unsupported claims. Every
count below is the output of the script at the bottom of this file, not an estimate. If you
change a word, run the script again — a draft that goes over is rejected silently by the
composer, and one that scrapes under leaves no room for a typo fix.

---

## Draft A — the two outcomes (recommended)

**Angle:** the strongest true thing this project has. Two runs, one variable, two outcomes, both
permanently on chain. It describes a loss, which is what stops a stranger scrolling, and it is
falsifiable in one `eth_call`, which is what makes a judge trust the rest.

<!-- DRAFT-A-START -->
```text
Two 0G fine-tunes. Same dataset, same config, same provider. One missed the 48-hour acknowledge deadline and lost the model plus 30% of the fee. The other came back.

Crucible records both as on-chain Model Passports.

#0GBridge #BuildOn0G @0G_labs @0G_Builders @AKINDO_io
```
<!-- DRAFT-A-END -->

**Length: 272 characters. 8 to spare.**

Arithmetic — three paragraphs separated by two blank-line breaks of two characters each
(`\n\n`):

| Part | Chars |
|---|---|
| "Two 0G fine-tunes … came back." | 165 |
| paragraph break | 2 |
| "Crucible records both as on-chain Model Passports." | 50 |
| paragraph break | 2 |
| `#0GBridge #BuildOn0G @0G_labs @0G_Builders @AKINDO_io` | 53 |
| **Total** | **272** |

165 + 2 + 50 + 2 + 53 = **272**, which is what the script at the bottom of this file reports.
No URL in this draft, so the literal count is the posted count.

**Asset needed:** passport #1 and passport #2 screenshotted side by side, cropped to the rows
that are identical and the one row that is not — #1's sentinel adapter hash against #2's real
`0x40a5f256…1b4d`. One image carrying the whole argument. If you produce one asset for this
entire submission, make it this one.

**What changed and why.** The previous Draft A said "Crucible fixes that". It does not fix it on
Windows — `DEFECT-01` is open and passport #1 is the evidence — and the asset it called for was
a composite of the live task view and a daemon log line side by side, which is a screen that
does not exist. Both are gone.

---

## Draft B — lead with the product, include the demo link

**Angle:** clearest statement of what the thing is. Use this one if the demo video is the asset
you most want clicked.

<!-- DRAFT-B-START -->
```text
Crucible: verifiable fine-tuning on 0G.

Every model gets a birth certificate — base model, dataset, hyperparameters, provider — hashed on 0G Chain, minted as an ERC-7857-style Agentic ID.

Demo: PLACEHOLDER_DEMO_URL

#0GBridge #BuildOn0G @0G_labs @0G_Builders @AKINDO_io
```
<!-- DRAFT-B-END -->

**Length: 271 literal / 274 as posted. 6 to spare** — the tightest of the three, so re-run the
script after any edit. The text is unchanged from the previous version of this file; every claim
in it holds, and the count is confirmed rather than inherited.

Arithmetic — four paragraphs, three breaks of two characters:

| Part | Chars |
|---|---|
| "Crucible: verifiable fine-tuning on 0G." | 39 |
| paragraph break | 2 |
| "Every model gets a birth certificate … Agentic ID." | 147 |
| paragraph break | 2 |
| "Demo: PLACEHOLDER_DEMO_URL" | 26 |
| paragraph break | 2 |
| tag block | 53 |
| **Literal total** | **271** |
| less `PLACEHOLDER_DEMO_URL` (20), plus X's fixed URL weight (23) | +3 |
| **Posted total** | **274** |

39 + 2 + 147 + 2 + 26 + 2 + 53 = **271**; 271 − 20 + 23 = **274**. Any real URL, however long,
weighs the same 23, so a shortened link buys nothing.

**Asset needed:** `/passport/p-000002`, scrolled so the dataset root hash, the training config
hash and the manifest hash are all visible at once, with the `mock data` badge left in frame —
the passport record itself is real, and cropping the badge out to hide that the app is on
fixtures is the kind of tidy-up that reads as a lie when someone clones the repo.

**PLACEHOLDER:** replace `PLACEHOLDER_DEMO_URL` with the real YouTube/Loom link before posting.

---

## Draft C — lead with the integration depth

**Angle:** aimed at the 0G accounts and the judges rather than at a general audience. Names the
daemon result and all four components, which is what the 30%-weighted integration criterion
reads.

<!-- DRAFT-C-START -->
```text
Crucible, Wave 3: our daemon took a 0G fine-tune from POST /jobs to an unattended on-chain acknowledgement. Its lineage is now a public Model Passport.

Uses 0G Compute, Storage, Chain and Agentic ID.

#0GBridge #BuildOn0G @0G_labs @0G_Builders @AKINDO_io
```
<!-- DRAFT-C-END -->

**Length: 255 characters. 25 to spare** — the most room of the three.

Arithmetic — three paragraphs, two breaks of two characters:

| Part | Chars |
|---|---|
| "Crucible, Wave 3 … public Model Passport." | 151 |
| paragraph break | 2 |
| "Uses 0G Compute, Storage, Chain and Agentic ID." | 47 |
| paragraph break | 2 |
| tag block | 53 |
| **Total** | **255** |

151 + 2 + 47 + 2 + 53 = **255**. No URL, so literal equals posted.

An earlier version of this draft added "an hour after delivery" and came out at **279** — inside
the limit, but one character of headroom, which is not a margin, it is a coin flip on the next
edit. The detail moved to the asset note, where it costs nothing.

**Asset needed:** `runs/run3-daemon.json` open at the `timeline` block — delivered `08:53:57Z`,
acknowledgement scheduled `09:53:57Z` at the daemon's real one-hour default, acknowledged
`09:56:05Z` — beside the chainscan page for tx `0x4e2c81e2…4cfa` at block 49716408. The point of
this one is to make the unattended acknowledgement visible rather than asserted.

**What changed and why.** The previous Draft C claimed "one upload replaces 12 CLI steps". That
number appears **nowhere in the repository** — not in the README, the architecture doc, the CLI
package or the field notes. It was the only figure in this file with no source behind it, and a
judge who asked where it came from would have got no answer. It is replaced with the run 3
result, which has a transaction hash.

---

## Recommendation

Post **Draft A** as the main post, then reply to it in a thread with Draft B's content plus the
demo link and Draft C's content plus the run 3 screenshot. Replies do not need to repeat the
hashtags or tags, but the **root post must contain all of them** — that is the post the judges
will be pointed at.

Do not add "mainnet" anywhere in the thread. Nothing is deployed there, and the contract address
you would want to paste is on Galileo testnet:
`0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7`.

---

## Before posting

- [ ] Account is public and the post is not restricted to followers.
- [ ] Asset attached and legible in the timeline preview (check on a phone, not just desktop).
- [ ] No private key, wallet balance, file path with your username, or `.env` content visible anywhere in the image.
- [ ] No `mainnet` or `16661` chip visible in any attached screenshot — four gallery fixtures and four job fixtures carry that label and nothing is deployed on mainnet.
- [ ] All five required handles/hashtags present and spelled exactly: `#0GBridge` `#BuildOn0G` `@0G_labs` `@0G_Builders` `@AKINDO_io`.
- [ ] Every `PLACEHOLDER_*` token replaced.
- [ ] Count re-run after the **final** edit, not before it.
- [ ] Post URL copied into `submission/CHECKLIST.md` and into the AKINDO submission form.

---

## Verify the counts yourself

Literal count of each draft body, straight out of this file:

```bash
node -e "const fs=require('fs');const t=fs.readFileSync('submission/X_POST.md','utf8');for(const k of ['A','B','C']){const m=t.split('<!-- DRAFT-'+k+'-START -->')[1].split('<!-- DRAFT-'+k+'-END -->')[0];const body=m.replace(/^\s*\`\`\`text\n/,'').replace(/\n\`\`\`\s*$/,'');console.log(k,body.length);}"
```

Expected output: `A 272`, `B 271`, `C 255`. Run on Windows, strip `\r` first — a CRLF checkout
inflates every count by one per line and will tell you a fitting draft does not fit.

For Draft B, the posted length is the literal count with the placeholder reweighted:
271 − `'PLACEHOLDER_DEMO_URL'.length` (20) + 23 = **274**. A and C contain no URL, so their
literal counts are their posted counts.
