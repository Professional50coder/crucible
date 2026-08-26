# Image gallery — upload set

AKINDO allows 1–5 images. Upload these five, **in this numbered order**. The first one becomes the
thumbnail on the Wave listing page, where it competes for attention with ~240 other builders.

| # | File | Size | Source | What it argues |
|---|---|---|---|---|
| 1 | `1-app-home.png` | 1440×810 | live app `/`, cropped | *This is real and it is hosted.* Hero plus the on-chain anchor panel — contract, mint tx, manifest root, anchor — in one frame |
| 2 | `2-passport-live.png` | 1440×900 | live app `/passport/p-000002` | *A real passport exists.* `LIVE ON 0G GALILEO · TOKEN #2`, block 49,612,106, hash verified in the browser |
| 3 | `3-passport-gallery.png` | 1440×900 | live app `/gallery` | *We label our own fixtures.* `2 / 9 minted on 0G` · `2 on chain · 7 fixtures`, stated in the product itself |
| 4 | `4-architecture.png` | 1736×806 | `docs/diagrams/architecture.svg` | *All four 0G components, each load-bearing.* This is the 30% "0G Integration" criterion in one picture |
| 5 | `5-verification.png` | 1680×620 | `docs/diagrams/verification.svg` | *The check needs nothing from us.* No wallet, no account, no clone |

Spare, if you want to swap one out:

| File | Size | Shows |
|---|---|---|
| `alt-lifecycle.png` | 1680×640 | The task lifecycle and the 48-hour acknowledge deadline as a state machine |

## Rules that produced this order

1. **Never lead with a diagram.** A thumbnail has about one second to say "this is a working
   product". A dark, dense, live product screen does that. A box-and-arrow SVG does not.
2. **Screens before drawings.** Tiles 1–3 are things that exist; 4–5 explain them. A judge who
   stops after tile 2 has already seen the strongest evidence.
3. **Do not crop the `MOCK DATA` badge** out of any screenshot. It is accurate — the job-launch
   flow is fixture-backed — and a judge who finds it themselves after you hid it will re-read
   every other claim with suspicion.

## Regenerating these

No browser extension required — headless Chrome renders both the live pages and the local SVGs:

> **Trap — read this before re-shooting the home page.** A short viewport (`--window-size=1440,900`)
> renders the home hero **blank**: the app reveals it with a scroll-triggered animation that never
> fires in headless Chrome, so the text stays at opacity 0 and you get an empty grid. Render the
> page **tall** so everything counts as in-view, then crop. `/gallery` and `/passport/…` do not
> have this problem and can be shot at 900 directly.

```
CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"

# home page — render TALL, then crop (see the trap above)
"$CHROME" --headless --disable-gpu --hide-scrollbars --virtual-time-budget=9000 \
  --screenshot="home-full.png" --window-size=1440,2600 \
  "https://crucible-orpin.vercel.app/"

# crop the top 810px — PowerShell, no extra tooling
#   Add-Type -AssemblyName System.Drawing
#   $src = [System.Drawing.Image]::FromFile("home-full.png")
#   $dst = New-Object System.Drawing.Bitmap(1440, 810)
#   $g = [System.Drawing.Graphics]::FromImage($dst)
#   $r = New-Object System.Drawing.Rectangle(0,0,1440,810)
#   $g.DrawImage($src, $r, $r, [System.Drawing.GraphicsUnit]::Pixel)
#   $g.Dispose(); $dst.Save("1-app-home.png", [System.Drawing.Imaging.ImageFormat]::Png)

# other live pages — 900 is fine
"$CHROME" --headless --disable-gpu --hide-scrollbars --virtual-time-budget=9000 \
  --screenshot="3-passport-gallery.png" --window-size=1440,900 \
  "https://crucible-orpin.vercel.app/gallery"

# local diagrams — window-size must match the SVG's own width/height
"$CHROME" --headless --disable-gpu --hide-scrollbars \
  --screenshot="4-architecture.png" --window-size=1736,806 \
  "file:///D:/crucible/docs/diagrams/architecture.svg"
```
