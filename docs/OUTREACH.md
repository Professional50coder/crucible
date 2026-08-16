# Outreach drafts

Kept in the repo so the wording is reviewable and reusable, and so the addresses in it can be
checked against the deployment records rather than retyped from memory.

---

## Telegram — @Damiclone (Martin), 0G

Short version. Send this one. Sent from **@Hitansh54** (https://t.me/Hitansh54).

> Hi Martin — Hitansh, solo builder in the 0G Bridge Buildathon (AKINDO `Crypto_hg`, team Crucible).
>
> **Crucible** gives every 0G fine-tune a verifiable Model Passport — base model, dataset, config
> and TEE provider, hashed on 0G Storage and anchored on 0G Chain. Uses Chain + Compute + Storage
> + Agentic ID.
>
> Already live on Galileo: contract deployed and source-verified
> `0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7`, passports #1 and #2 minted, manifest on 0G Storage,
> three paid fine-tuning tasks run — the last one acknowledged on-chain by my own daemon,
> tx `0x4e2c81e2…7e4cfa`.
> Repo: https://github.com/Professional50coder/crucible
>
> **Ask:** Wave 3 needs a mainnet contract + explorer activity. Deploy + mint is ~0.0103 0G of gas
> at 4 gwei, and there's no mainnet faucet. Could I get **0.05 0G on mainnet**?
>
> `0xD68235F859f3756c87f50619b165F68b80FDdFD4`
>
> Also found a reproducible SDK bug that costs users their model — `acknowledgeModel` fails on
> both download paths on Windows/Node 22, and my first task force-settled unacknowledged with the
> 30% penalty. The identical code retrieved the model from WSL2, so it's isolated to one variable.
> Happy to write it up for the compute team if useful.
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
> My first task force-settled unacknowledged because of it. On-chain,
> `getDeliverables(user, provider)` shows `acknowledged: false` with an empty `encryptedSecret`,
> and the sub-account was debited exactly 30.0000% of the fee — 0.00355584 of 0.0118528 0G —
> which matches the documented penalty.
>
> The isolation is the useful part: the identical code, wallet, dataset, config, provider and SDK
> run from **WSL2 Linux** pulled the 93,642,469-byte adapter down the 0G Storage path and read
> `acknowledged: true`. One variable — the OS — and two outcomes, both minted on Galileo as
> passports #1 and #2 so the comparison is public. A third task has since been acknowledged
> end to end by my orchestrator on its own defaults.
>
> Task `10551604-2664-4516-86cf-269a62f93bfc` is the one that lost its model;
> `3e385c46-f5dc-4e93-b713-63ab7a987ae3` and `b1807e85-a942-46f5-9d04-ec23fdff020a` both read
> `acknowledged: true`. All on provider `0xA02b95Aa6886b1116C4f334eDe00381511E31A09`, testnet.
>
> Two smaller things from the same week: `getLockedTime()` returns 86400 and is the refund lock,
> not the 48-hour acknowledge window — easy to conflate. And `hardhat verify` against
> chainscan needs `/open/api`; the documented `/api` returns the explorer's HTML shell.

---

## AKINDO comment thread — post this one

**Why this is now a correction and not a follow-up.** The comment posted to the buildathon page on
2026-08-14 says a Compute ledger "requires a 3 0G minimum". That is the claim this project spent a
day disproving, and it is sitting in public under our own name, on the same page whose judges will
read a repository whose README lists it as defect 03. Leaving a wrong number up while the repo
calls it wrong is worse than never having posted it.

It also inverts the ask. The original comment requested tokens *because* of a blocker that does not
exist. Correcting it in public is the stronger move: it withdraws a request we no longer need, hands
other builders a real finding, and demonstrates the thing Wave 3 scores 40% on — progress.

> Correcting my own comment above, because it is publicly wrong and other builders will hit the
> same wall.
>
> **The 3 0G ledger minimum is a client-side guard in the SDK, not a chain rule.** `addLedger()`
> throws *"Minimum balance to create a ledger is 3 0G"* before it ever reaches the network. The
> contract disagrees: `LedgerManager.MIN_ACCOUNT_BALANCE()` returns **0.1 0G** on Galileo. We
> created a working ledger with 0.3 0G by calling the contract directly, and have since run three
> fine-tuning tasks on `0xA02b95Aa…1A09` at ~0.0119 0G each.
>
> So nobody needs a month of faucet drips to run a job that costs pennies. Skip the guard.
>
> Two more from the same week, in case they save someone else the loss:
>
> - `acknowledgeModel`'s default `downloadMethod: 'auto'` tries 0G Storage first, which spawns a
>   bundled `0g-storage-client` that is a **Linux ELF**. On Windows that is ENOENT, the TEE
>   fallback rate-limits, and you lose the model *and* 30% of the fee. Identical code from WSL2
>   retrieved the 93 MB adapter first try. One variable, two outcomes — both are minted on Galileo
>   as passports #1 and #2, so the comparison is public and checkable.
> - `getLockedTime()` returns 86400. That is the 24-hour *refund* lock, not the 48-hour acknowledge
>   window. Read it as the deadline and your daemon fires at the wrong time.
>
> Withdrawing the token request from my earlier comment — we are unblocked on testnet.
>
> Repo: github.com/Professional50coder/crucible

**Still true, and still needed — the mainnet gas ask.** Keep this separate from the correction; do
not bury a request inside an apology. Send it on Telegram first (above), and only post publicly if
that gets no reply:

> Wave 3 asks for a mainnet contract address and explorer activity. Deploy plus one mint prices at
> about 0.0103 0G of gas at 4 gwei, and there is no mainnet faucet. If there is a route to a small
> amount of mainnet 0G for the deployment, I would appreciate a pointer — happy to do it whichever
> way works for the team. `0xD68235F859f3756c87f50619b165F68b80FDdFD4`
