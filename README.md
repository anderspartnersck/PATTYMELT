# PATTY MELT

A grill rush. You're Patty. Billy is expediting, and Billy is not reliable.

## ▶ [PLAY IT IN YOUR BROWSER](https://anderspartnersck.github.io/PATTYMELT/)

A Castle Killscreen game by **Anders & Partners**.

> ### ⚠︎ Working build — not a finished game
>
> Playable and reasonably deep — shifts, the grill and toaster as competing scarce stations, a dining room that reports the game back to you. Art, balance and the co-op modes are all still moving.
>
> The finished Castle Killscreen titles are **[SUCK UP](https://anderspartnersck.github.io/suck-up/)**
> and **[ONE-TIMER: THE HIGH TABLE](https://anderspartnersck.github.io/high-table/)**. This repo
> exists so the work can happen in the open, not because the work is done.

## About

A cooking game about **synchronisation**, not speed. The grill and the bun toaster
are both scarce, both on their own clocks, and the single skill the game teaches is
waiting for RDY instead of flipping early. The dining room isn't a scoreboard bolted
on the side — it *is* the score, played as drama.

## How to play

| | |
|---|---|
| **← / →** | move the spatula |
| **SPACE** | flip |
| **C** | cheese |
| **B** | HEY BILLY! — the serve lever |
| **P** | pause |

**Menu:** ↑/↓ shift · **1/2** players · **T** diner/school skin · **ENTER** cook
**2-up:** P1 `← → SPACE C B` · P2 `J/L I/K/M`
**⛶** in the screen corner (or **F11**) goes fullscreen.

## What still needs work

- The HEROES / School cab has **no dining room art** — `cafeteria-room.png` doesn't exist yet, so that backdrop draws empty.
- Co-op and the MeltDome battle mode are built but under-tuned.

## Rebuilding this bundle

This repo is **generated** — never edit it directly. Everything here is built from the
private Castle Killscreen tree:

```
cd "ANDERS CASTLE KILLSCREEN/PATTY MELT"
python3 tools/build_pages.py
```

The bundler shrinks art by **resolution, not by pruning**: these engines build most asset
paths by string concatenation, so a static scan can't see what's used, and a wrongly-cut
sprite doesn't error — it just silently fails to draw.

## Credits

Created by **Joseph Coleman**, with Claude, ChatGPT, and Blender.
Anders & Partners.

<sub>Generated from the private Castle Killscreen tree. Edit there, not here.</sub>
