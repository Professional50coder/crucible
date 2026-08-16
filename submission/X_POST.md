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

**Counting note.** Character counts below are literal counts of the text as written. X collapses
any URL to 23 characters when counting, and attached media does not count at all — so a draft
that fits literally also fits on X. The mandatory hashtag + tag block is 53 characters on its own;
budget accordingly if you rewrite.

---

## Draft A — lead with the deadline (the strongest hook)

**Angle:** the problem first. This is the version that makes a stranger stop scrolling, because
it describes a loss, not a feature.

<!-- DRAFT-A-START -->
```text
Fine-tuning on 0G gives you 48 hours to acknowledge or you lose the model. Nothing warns you.

Crucible fixes that, and turns the lineage 0G already emits into a Model Passport minted as an ERC-7857-style Agentic ID.

#0GBridge #BuildOn0G @0G_labs @0G_Builders @AKINDO_io
```
<!-- DRAFT-A-END -->

**Length: 271 characters.** (280 limit — 9 to spare.)

**Asset needed:** a screenshot of the live task view at `Delivered` with the 48-hour countdown
visible *and* the daemon's auto-acknowledge log line beside it. One image that shows the problem
and the fix in the same frame. If you only produce one asset for this whole submission, make it
this one.

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

**Length: 274 characters as posted** — counting `PLACEHOLDER_DEMO_URL` as X's fixed 23-character
URL weight. Any real URL, however long, counts the same. **6 to spare.**

**Asset needed:** the Model Passport page, scrolled so the dataset root hash, the training
parameters and the manifest hash are all visible at once. Crop tight; hashes must be readable in
the timeline preview.

**PLACEHOLDER:** replace `PLACEHOLDER_DEMO_URL` with the real YouTube/Loom link before posting.

---

## Draft C — lead with the integration depth

**Angle:** aimed at the 0G accounts and the judges rather than at a general audience. Names all
four components explicitly, which is what the 30%-weighted integration criterion reads.

<!-- DRAFT-C-START -->
```text
We shipped Crucible for Wave 3: one upload replaces 12 CLI steps on 0G fine-tuning, and the run's lineage becomes a public, on-chain Model Passport.

Uses 0G Compute, Storage, Chain and Agentic ID.

#0GBridge #BuildOn0G @0G_labs @0G_Builders @AKINDO_io
```
<!-- DRAFT-C-END -->

**Length: 252 characters.** (28 to spare — the most room of the three if you want to add a link
or a word.)

**Asset needed:** a short clip (6–10s) of the passport page, or a composite screenshot showing
the passport page next to the `chainscan.0g.ai` page for the verified contract. The point of this
one is to make the on-chain half visible.

---

## Recommendation

Post **Draft A** as the main post, then reply to it in a thread with Draft B's content plus the
demo link and Draft C's content plus the chainscan screenshot. Replies do not need to repeat the
hashtags or tags, but the **root post must contain all of them** — that is the post the judges
will be pointed at.

---

## Before posting

- [ ] Account is public and the post is not restricted to followers.
- [ ] Asset attached and legible in the timeline preview (check on a phone, not just desktop).
- [ ] No private key, wallet balance, file path with your username, or `.env` content visible anywhere in the image.
- [ ] All five required handles/hashtags present and spelled exactly: `#0GBridge` `#BuildOn0G` `@0G_labs` `@0G_Builders` `@AKINDO_io`.
- [ ] Every `PLACEHOLDER_*` token replaced.
- [ ] Post URL copied into `submission/CHECKLIST.md` and into the AKINDO submission form.

---

## Verify the counts yourself

```bash
node -e "const fs=require('fs');const t=fs.readFileSync('submission/X_POST.md','utf8');for(const k of ['A','B','C']){const m=t.split('<!-- DRAFT-'+k+'-START -->')[1].split('<!-- DRAFT-'+k+'-END -->')[0];const body=m.replace(/^\s*\`\`\`text\n/,'').replace(/\n\`\`\`\s*$/,'');console.log(k,body.length);}"
```
