# Live app — full page captures

Source: `https://crucible-orpin.vercel.app` · captured 2026-08-26, headless Chrome, 1440px wide,
logged out, no wallet, no extension. Full-page (not viewport) shots, so each file shows everything
a judge would see after scrolling.

| File | Route | What it shows | Use it for |
|---|---|---|---|
| `01-home.png` | `/` | Hero, the live on-chain anchor panel, the three-command verification block, and the "one run lost its model, the other came back" evidence section | Gallery tile 1 · demo video opening shot · X post image |
| `02-gallery.png` | `/gallery` | Passport gallery. `2 / 9 minted on 0G`, `2 on chain · 7 fixtures` stated in the product itself | Gallery tile 3 · the honesty proof |
| `03-new-run.png` | `/new` | The launcher: dataset drop, network + base model, all five training params with 0G's real defaults, live fee estimate, provider card (H200, Intel TDX / Phala dstack) | Shows the CLI-replacement claim is concrete |
| `04-jobs.png` | `/jobs` | Run list with task states | Demo video B-roll |
| `05-job-detail.png` | `/jobs/job_1d55b2` | Single run: state machine, log panel, 48-hour acknowledge countdown | Best single frame for "we solved the deadline footgun" |
| `06-passport-2-live.png` | `/passport/p-000002` | **Passport #2 — real.** `LIVE ON 0G GALILEO · TOKEN #2`, block 49,612,106, hash verified in-browser, and the note explaining why #1 lost its model and #2 did not | Gallery tile 2 · the single strongest frame in the whole submission |
| `07-passport-1-live.png` | `/passport/p-000001` | **Passport #1 — real, and the one that failed.** Its own page says so before it says anything else | The calibration argument, in one screenshot |
| `08-passport-fixture.png` | `/passport/p-4c1f9a` | A fixture passport, labelled as a fixture | Proof the labelling is applied consistently, not selectively |

## Notes

- The `MOCK DATA` badge in the header is **deliberate and correct** — the job-launch flow is
  fixture-backed. Do not crop it out of a screenshot. A judge who finds it themselves after you
  hid it reads every other claim differently.
- `/passport/2` does **not** resolve. Passport ids are `p-000001` / `p-000002`. If you link a
  passport anywhere — the video, the X post, the About — use the `p-` form.
- Re-capture command (no browser extension needed):

  ```
  "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless --disable-gpu \
    --hide-scrollbars --virtual-time-budget=9000 \
    --screenshot="out.png" --window-size=1440,2600 \
    "https://crucible-orpin.vercel.app/"
  ```
