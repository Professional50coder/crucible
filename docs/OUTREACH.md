# Outreach drafts

Kept in the repo so the wording is reviewable and reusable, and so the addresses in it can be
checked against the deployment records rather than retyped from memory.

---

## Telegram — @Damiclone (Martin), 0G

Short version. Send this one.

> Hi Martin — Hitansh, solo builder in the 0G Bridge Buildathon (AKINDO `Crypto_hg`, team Crucible).
>
> **Crucible** gives every 0G fine-tune a verifiable Model Passport — base model, dataset, config
> and TEE provider, hashed on 0G Storage and anchored on 0G Chain. Uses Chain + Compute + Storage
> + Agentic ID.
>
> Already live on Galileo: contract deployed and source-verified
> `0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7`, passport #1 minted, manifest on 0G Storage, two
> paid fine-tuning tasks run.
> Repo: https://github.com/Professional50coder/crucible
>
> **Ask:** Wave 3 needs a mainnet contract + explorer activity. Deploy + mint is ~0.0103 0G of gas
> at 4 gwei, and there's no mainnet faucet. Could I get **0.05 0G on mainnet**?
>
> `0xD68235F859f3756c87f50619b165F68b80FDdFD4`
>
> Also found a reproducible SDK bug that costs users their model — `acknowledgeModel` fails on
> both download paths on Windows/Node 22, and my tasks force-settled unacknowledged with the 30%
> penalty. Happy to write it up for the compute team if useful.
>
> Thanks!

### Why it is shaped this way

- The ask is one line, with a number that is justified rather than rounded up.
- The evidence is one address and one repo link, not a tour.
- The bug report is offered, not delivered — it is a reason to reply, and it costs him nothing to
  decline. It also signals the project is real without asserting that it is.
- No mention of the reward pool. He knows.

---

## Follow-up, only if he asks about the bug

> On Windows + Node 22, `acknowledgeModel` cannot retrieve a delivered model at all:
>
> - `downloadMethod: '0g-storage'` → `spawn …/binary/0g-storage-client ENOENT` — the bundled
>   client is a Linux ELF.
> - `downloadMethod: 'tee'` → fails at 0 bytes with `stream.on is not a function` on every
>   attempt, then surfaces as HTTP 429.
>
> Both of my delivered tasks then force-settled unacknowledged. On-chain,
> `getDeliverables(user, provider)` shows `acknowledged: false` with an empty `encryptedSecret`,
> and the sub-account was debited exactly 30.0000% of the fee — 0.00355584 of 0.0118528 0G —
> which matches the documented penalty.
>
> Tasks `10551604-2664-4516-86cf-269a62f93bfc` and `3e385c46-f5dc-4e93-b713-63ab7a987ae3` on
> provider `0xA02b95Aa6886b1116C4f334eDe00381511E31A09`, testnet.
>
> Two smaller things from the same week: `getLockedTime()` returns 86400 and is the refund lock,
> not the 48-hour acknowledge window — easy to conflate. And `hardhat verify` against
> chainscan needs `/open/api`; the documented `/api` returns the explorer's HTML shell.

---

## AKINDO comment thread — public, only if Telegram gets no reply

Keep it factual. The thread is read by other builders and by the organisers.

> Following up on my 2026-08-14 note. Crucible is now live on Galileo — contract deployed and
> source-verified at `0x27087B5b…83C1c7`, passport #1 minted, manifest on 0G Storage, two paid
> fine-tuning tasks completed. Repo: github.com/Professional50coder/crucible
>
> Wave 3 asks for a mainnet contract address and explorer activity. Deploy plus one mint prices at
> about 0.0103 0G of gas, and there is no mainnet faucet. If there is a route for getting a small
> amount of mainnet 0G for the deployment, I would appreciate a pointer — happy to do it any way
> that works for the team.
