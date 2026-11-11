# PATTY MELT

> **Status: Working build — live on GitHub Pages, not a finished game.**
> Main game = the 3D edition in `3d/`. Live pages:
> [3d/](https://anderspartnersck.github.io/PATTYMELT/3d/) (the diner campaign) ·
> [3d/heroes.html](https://anderspartnersck.github.io/PATTYMELT/3d/heroes.html) (HEROES cafeteria) ·
> [3d/rear.html](https://anderspartnersck.github.io/PATTYMELT/3d/rear.html) (cooks from behind, experiment) ·
> [3d/front.html](https://anderspartnersck.github.io/PATTYMELT/3d/front.html) (front door with every mode).
> The root of this repo is the OLD 2D VERSION (see the bottom of this page).

A grill rush. You're Patty. Billy is expediting, and Billy is not reliable.

## ▶ [PLAY IT IN YOUR BROWSER](https://anderspartnersck.github.io/PATTYMELT/3d/)

### ▶ [HEROES CAFETERIA](https://anderspartnersck.github.io/PATTYMELT/3d/heroes.html) · [ALL MODES (FRONT DOOR)](https://anderspartnersck.github.io/PATTYMELT/3d/front.html) · [COOKS FROM BEHIND](https://anderspartnersck.github.io/PATTYMELT/3d/rear.html)

The 3D kitchen: two spatulas per cook, lit 3D kitchen art.

A Castle Killscreen game by **Anders & Partners**.

> ### ⚠︎ Working build — not a finished game
>
> Playable and reasonably deep — 12 shifts, the grill and the bun toaster as competing scarce stations, a dining room that reports the game back to you. Art, balance and the co-op modes are all still moving.
>
> The finished Castle Killscreen titles are **[SUCK UP](https://anderspartnersck.github.io/suck-up/3d.html?arcade)**
> and **[ONE-TIMER: THE HIGH TABLE](https://anderspartnersck.github.io/high-table/)**. This repo
> exists so the work can happen in the open, not because the work is done.

## About

A cooking game about **synchronisation**, not speed. The grill and the bun toaster
are both scarce, both on their own clocks, and the single skill the game teaches is
waiting for RDY instead of flipping early. The dining room isn't a scoreboard bolted
on the side — it *is* the score, played as drama.

## How to play

Any key starts the campaign: 12 shifts, dawn to closing.

| Keyboard | Pad | |
|---|---|---|
| **← / →** or **A / D** | stick / d-pad | move the spatulas (along the grill, and on past it to the toaster) |
| **F** | A | flip |
| **C** | B | topping (cheese / onions) |
| **X** | X | toast a bun / grilled cheese, at the BUN TOASTER |
| **SPACE** (or V / B) | Y / RT | HEY BILLY! — the serve lever |
| **P** or **Esc** | START | pause menu (resume, restart, controls, tips) |
| **R** | | restart this shift |
| **H** | | hide the tip on screen |
| **S** | | sound on / off |

Wait for **RDY** — act too soon and the order is sent back.

The **BUN TOASTER** only switches on when the shift's menu has a toasted item
(patty melt, grilled cheese). Shift 8, THE PATTY MELT, teaches it.

**Co-op (2 players):** P1 as above. P2 (Chrissy): **J / L** move · **I** flip ·
**K** topping · **.** toast · **M** HEY BILLY, or a second pad. Hand off / drop a
jammed slot: P1 **G / T**, P2 **U / O**.

**Front door** ([3d/front.html](https://anderspartnersck.github.io/PATTYMELT/3d/front.html)):
↑ ↓ pick a mode; **TAB** moves to the edition (HEROES / DINER), demand
(as authored / kids / arcade) and screens rows, ← → changes them; **ENTER** or **SPACE** cooks.
Modes: THE CAMPAIGN · CO-OP KITCHEN · MELTDOME (2-player versus, 90-second grill-off) ·
THE POP-UP (full menu from shift 1) · STRAIGHT TO THE WEEDS (starts at shift 9) ·
COOKS FROM BEHIND · **MELTDOME — SIDE BY SIDE** (two flat-tops, one screen) ·
**TAG TEAM** (two cooks share one grill; **H** tags your partner in).

## What still needs work

- Co-op and the MeltDome battle mode are built but under-tuned.
- The front door isn't the landing page yet; two of its modes aren't published (above).

## Rebuilding this bundle

This repo is **generated** — never edit the game files directly. Everything here is built from the
private Castle Killscreen tree:

```
cd "ANDERS CASTLE KILLSCREEN/PATTY MELT"
python3 tools/build_pages.py

# the 3D edition (3d/ + assets/art3d/), from the art-3d-kitchen worktree:
cd "ANDERS CASTLE KILLSCREEN/PATTY_MELT_ART3D"
python3 tools/build_pages_3d.py
```

This README is the one file the builders never touch (it's bundle-owned), so edit it here.

The bundler shrinks art by **resolution, not by pruning**: these engines build most asset
paths by string concatenation, so a static scan can't see what's used, and a wrongly-cut
sprite doesn't error — it just silently fails to draw.

## Credits

Created by **Joseph Coleman**, with Claude, ChatGPT, and Blender.
Anders & Partners.

<sub>Generated from the private Castle Killscreen tree. Edit there, not here (except this README).</sub>

## ⚠︎ OLD 2D VERSION — NOT THE MAIN GAME

Archived for reference only. It is no longer updated, and nothing new goes into it.
The game at the top of this page is the real one. This is the original flat-sprite build:
[OLD 2D VERSION](https://anderspartnersck.github.io/PATTYMELT/).
