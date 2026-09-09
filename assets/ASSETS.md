# PATTY MELT — art asset manifest

The cabinet (`web/cabinet.html`) is wired to load these by exact path. Drop a file in
and it lights up on reload — no code change. Missing files degrade gracefully:
the cabinet falls back to its built-in vector art, so the game is always playable.

All art is **cosmetic** — it never touches the deterministic engine or parity.

## 1. Cabinet frame — WIRED NOW

| path | what | source |
|---|---|---|
| `assets/cab/cab-1up.png` | the full baked **1UP cabinet** render (marquee + Billy + recipe band + deck + belly + coin doors). The live game canvas overlays the screen cutout. | the full-cab render |

- Any aspect ratio works — the frame auto-fits to the image's dimensions on load.
- **Align the screen:** in the running cabinet, type `rect` to open the registration
  panel, nudge left/top/width/height until the dashed box sits on the cab's screen,
  then **SAVE** (persists to localStorage). Tell the dev the four numbers to bake them
  in as the new defaults (`DEFAULT_RECT` in `cabinet.html`).

## 2. In-screen grill sprites

**Cutting the sheets:** the source sheets (`GAMES/PATTY MELT/SPRITES/BOARD OF *`) are
renders on an opaque RED field, not transparent contact sheets. Cut them with
`tools/cut_sheet.py <sheet> <outdir> --key auto` (keys out the dominant background color
→ slices by alpha gaps → indexed PNGs + a labeled `_contact.png`). Eyeball the contact,
rename the cuts to the manifest names below, drop into `assets/sprites/grill/`. Adapted
from SUCK UP's `cut_sheet.py`; keying = the house green-screen technique (here it's red).

`drawPatty` prefers these and falls back to vector art **per-sprite** if a file's absent.

| path | maps to engine | status |
|---|---|---|
| `assets/sprites/grill/patty-raw.png`    | `Stage.SEAR_A` | ✅ cut + wired (BOARD OF BURGERS row 2) |
| `assets/sprites/grill/patty-seared.png` | `Stage.SEAR_B` | ✅ cut + wired |
| `assets/sprites/grill/patty-done.png`   | `Stage.MELT`+`DONE` | ✅ cut + wired (patty + cheese) |
| `assets/sprites/grill/patty-burnt.png`  | `Stage.BURNT`  | ✅ cut + wired |
| `assets/sprites/grill/cheese-fresh.png`   | melt start (cook ≈ 0)        | the MELTOMETER, art-side |
| `assets/sprites/grill/cheese-melting.png` | melt mid (0 < cook < DONE)  | |
| `assets/sprites/grill/cheese-burnt.png`   | over-melt / burnt           | |
| `assets/sprites/grill/plate-diner.png`    | empty slot (diner skin) = cream plate | ✅ cut + wired (`slotArt`, theme-aware) |
| `assets/sprites/grill/tray-school.png`    | empty slot (school skin) = blue tray  | ✅ cut + wired |
| `assets/sprites/ui/callout-uhoh.png`      | flash: BURNT / ORDER LOST   | ✅ cut + wired (`calloutFor`) — comic sticker |
| `assets/sprites/ui/callout-oops.png`      | flash: SENT BACK            | ✅ cut + wired |
| `assets/sprites/ui/callout-focus.png`     | Billy slacking (DONE jammed, expo checked out), blinks | ✅ cut + wired — "FOCUS, BILLY!" |
| `assets/sprites/grill/billy-tray.png`     | Billy / expo placeholder    | tray-of-buns stand-in; swap for a Billy sprite later |

**The `PLATES AND TRAYS` sheet** (`assets/sprites/PLATES TRAYS/`) is a TRANSPARENT sheet but
its big plates/trays touch via soft shadows, so `cut_sheet.py` merges them into one blob.
For that case use **`tools/crop.py <sheet> <out> x0 y0 x1 y1`** (explicit rect → trim to the
alpha bbox). The plates/trays/callouts above were cut that way. (Cheese ladder below: still parked.)

## 3. Grill-state background — WIRED NOW

The flat-top art behind the slots **swaps with `buried_index`** (the mood axis), so the
grill visibly heats up and goes to hell as the line backs up. Cut from the CLASSIC GRILL
WORK sheet (`ChatGPT Image Jun 10, 2026, 08_52_34 PM.png`, a transparent 2×3 contact —
alpha-cut, no `--key`). `grillBgFor(buried_index)` in `cabinet.html` picks the panel on the
mapped mood bands (`palette.md`: cool ≤0.3 · restless ≥0.55 · barking ≥0.78); the vector
gradient griddle stays the fallback when a file's absent.

| path | swaps in when | source panel |
|---|---|---|
| `assets/sprites/grill/grill-empty.png`      | `buried < 0.15` — clean grill            | sheet row1-L EMPTY |
| `assets/sprites/grill/grill-cluttered.png`  | `0.15 ≤ buried < 0.30` — a few going (cool) | sheet row1-R CLUTTERED |
| `assets/sprites/grill/grill-steaming.png`   | `0.30 ≤ buried < 0.55` — warming up       | sheet row2-L STEAMING |
| `assets/sprites/grill/grill-overloaded.png` | `0.55 ≤ buried < 0.78` — restless → hot   | sheet row2-R OVERLOADED |
| `assets/sprites/grill/grill-disaster.png`   | `buried ≥ 0.78` — barking / on fire       | sheet row3-R DISASTER (flames) |

(The sheet also carries a duplicate CLUTTERED in row3-L and the parked BIG HEROES 2×4
wide panel at the bottom — neither is used; BIG HEROES stays parked.)

## 4. CHARACTER sprites — the cast seam (WIRED NOW, art pending)

`web/cabinet.html` loads these by exact path; absent = the built-in vector read (meter + cursor)
stays, so the game is always playable. **All are EXTRACTION / cleanup jobs from art we already
have, not redesigns** — Billy & Chrissy are high-schoolers working their first job (canon), so the
existing diner art is the source.

| path | who / state | source to cut from | status |
|---|---|---|---|
| `assets/chars/billy-slack.png` | Billy SLACKING — milkshake up, looking away | `cab/1 up MELT.png` Billy beside the screen (blue B-cap kid) | matte/extract |
| `assets/chars/billy-serve.png` | Billy ON IT / SERVING — turned to the grill, plate in hand | the **1up panel belly** (`cab-panel-1up.png` / MELT belly): Billy, arms-crossed, front-facing | matte/extract |
| `assets/chars/billy-turn.png`  | Billy TURNING (2P swing between cooks) | same Billy, ¾ turn | extract + repose |
| `assets/chars/patty.png`       | Patty avatar (over the P cursor) | the **1up panel belly**: Patty front-facing w/ spatula ("Patty" shirt) — cleanest matte | matte/extract |
| `assets/chars/chrissy.png`     | Chrissy avatar (over the C cursor, 2P) | the **1up panel belly**: Chrissy (red bandana, plated burger) | matte/extract |

> **Best cast source = the 1up panel belly** (the "WE COOK. YOU PLAY." trio): Patty / Billy / Chrissy
> all front-facing, clean, side by side — the easiest three mattes in the project. Billy's arms-crossed
> panel pose = his confident "ON IT"; the cab-side milkshake pose = "SLACKING".

- **Billy is STATE-keyed** (`billyState()` → slack/serve/turn) so the expo visibly reads
  busy-vs-slacking — drop the three poses and Billy literally looks like he's slacking or on it.
  `onit` reuses the `serve` pose. One pose (`billy-slack.png`) is enough to light the seam.
- The cab renders are **opaque** (laser-tag wall / gingham behind the figures), so these need a
  **background matte (alpha key)**, not just a rect crop — `tools/crop.py` gives a tight rect to
  start, but the cutout itself is an art-side bg-removal pass.
- **No "spatula-flurry" multi-frame Patty exists** — only single hero poses. The serve **toss**
  (spinning patty between the spatulas) is rendered **procedurally** in `drawServeFx`, so a flurry
  sheet is optional polish, not a blocker.
