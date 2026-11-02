// PATTY MELT — CAMPAIGN (UMD).  *** for Christine & Phillip Coleman. ***
//
// STEP ONE of the MARK 2 campaign (docs/MARK2.md): the authored, DETERMINISTIC "SHIFT" spine.
// A shift is a classic-arcade level — fewer-but-harder, memorizable, each with its own music.
// This is DATA + a thin builder ONLY: it drives pm.new_game() with per-shift levers and (optionally)
// overrides the order quota. It makes NO engine edits, so the bit-exact parity proof stays green.
//
// Joe's law honored: the GRILL NEVER GROWS (grill=6 every shift) — difficulty is demand-side only
// (arrival pace via `rnd`, shift length via `quota`, and the menu via `items`). The one honest
// capacity lever, co-op, stays a separate axis (players).
(function (global) {
  "use strict";

  // Each shift: display (name/time/wrinkle/music) + the engine params that make it PLAY that way.
  //   mode  — kids | family | arcade   (burn on/off + Billy neediness + base pace band)
  //   rnd   — the engine's internal difficulty index (scales arrival faster + orders up)
  //   quota — orders to clear THIS shift (overrides the mode's scaled quota = authored level length)
  //   items — burger | fifties | full | grilledcheese | pattymelt   (the menu / the "new wrinkle")
  //   grill — ALWAYS 6 (the diner doesn't remodel mid-rush)
  // Bonus/battle interludes are marked but rendered later (FREEZER mini-stage + MELTDOME already exist).
  const SHIFTS = [
    // ---- ACT I — OPEN (learn one thing per shift) ----
    { n: 1,  name: "SOFT OPEN",          time: "6:00 AM",  music: "open",
      wrinkle: "Learn the grill: FLIP, CHEESE, then HEY BILLY to serve.",
      mode: "kids",   grill: 6, rnd: 1, quota: 5,  items: "burger" },
    { n: 2,  name: "BREAKFAST REGULARS", time: "7:30 AM",  music: "open",
      wrinkle: "The regulars sit down. Keep Billy at the pass.",
      mode: "kids",   grill: 6, rnd: 2, quota: 7,  items: "burger" },
    { n: 3,  name: "THE MORNING TICKET", time: "9:00 AM",  music: "day",
      wrinkle: "Orders pick up — don't let a done burger jam the slot.",
      mode: "family", grill: 6, rnd: 1, quota: 8,  items: "burger" },
    { n: 4,  name: "PRE-NOON PREP",      time: "11:00 AM", music: "day",
      wrinkle: "The griddle bites now — pull them at the sweet spot.",
      mode: "family", grill: 6, rnd: 2, quota: 10, items: "burger", bonus: "FREEZER" },
    // → BONUS: WALK-IN FREEZER (restock breather, no-fail) plays after this shift clears

    // ---- ACT II — RUSH (build) ----
    { n: 5,  name: "LUNCH BELL",         time: "12:00 PM", music: "rush",
      wrinkle: "The first real rush. Waves back to back.",
      mode: "family", grill: 6, rnd: 3, quota: 11, items: "burger" },
    { n: 6,  name: "THE BUS ARRIVES",    time: "12:40 PM", music: "rush",
      wrinkle: "A busload walks in. Ride the surge, don't drown.",
      mode: "family", grill: 6, rnd: 4, quota: 12, items: "burger" },
    { n: 7,  name: "THE LUNCH SPREAD",   time: "1:15 PM",  music: "rush",
      wrinkle: "New menu: hamburgers & double-cheese join the line.",
      mode: "arcade", grill: 6, rnd: 1, quota: 12, items: "fifties" },
    { n: 8,  name: "THE PATTY MELT",     time: "1:45 PM",  music: "peak",
      wrinkle: "The namesake lands: toast the rye on the TOASTER — it joins the patty at the pass.",
      mode: "arcade", grill: 6, rnd: 1, quota: 14, items: "meltintro", bonus: "BASEMENT" },
    // → BONUS: THE BASEMENT (after-hours restock, quota-or-forfeit, ×2) plays after this shift clears
    //   (MELTDOME battle = a separate 2P mode: kitchen.html?battle)
    //   NOTE (2026-07-11): shift 8 now TEACHES the BUN TOASTER with burger+patty-melt only, so the second
    //   station gets a clean debut before the full-menu weeds — and shift 9's "full" is where SMASH really
    //   first appears (its wrinkle is now accurate). Menu key `meltintro` is campaign-only (see itemSeq).

    // ---- ACT III — THE WEEDS (gauntlet) ----
    { n: 9,  name: "DINNER SLAM",        time: "6:00 PM",  music: "weeds",
      wrinkle: "SMASH hits the menu — they cook low-and-slow, hog a slot 1.5x longer, but pay the most.",
      mode: "arcade", grill: 6, rnd: 2, quota: 15, items: "full" },
    { n: 10, name: "SATURDAY NIGHT",     time: "8:30 PM",  music: "weeds",
      wrinkle: "It does not let up. Keep the combo alive.",
      mode: "arcade", grill: 6, rnd: 3, quota: 16, items: "full" },
    { n: 11, name: "THE 86",             time: "10:00 PM", music: "weeds",
      wrinkle: "Deep in it now — every burnt patty is a walkout.",
      mode: "arcade", grill: 6, rnd: 3, quota: 18, items: "full" },
    { n: 12, name: "LAST CALL",          time: "11:30 PM", music: "finale",
      wrinkle: "Close it out. Everything, all at once.",
      mode: "arcade", grill: 6, rnd: 3, quota: 20, items: "full" },
  ];

  function itemSeq(pm, key) {
    switch ((key || "burger").toLowerCase()) {
      case "fifties":       return pm.ITEMS_FIFTIES;
      case "full":          return pm.ITEMS_FULL_MENU;
      case "grilledcheese": return pm.ITEMS_GRILLED_CHEESE;
      case "pattymelt":     return pm.ITEMS_PATTY_MELT;
      case "smash":         return pm.ITEMS_SMASH;        // the SLOW smash-house showcase (1.5x cook)
      case "meltintro":     return [pm.Item.BURGER, pm.Item.PATTY_MELT];  // shift 8 — TEACH the BUN TOASTER
      default:              return pm.ITEMS_BURGER;
    }
  }

  // Build a fresh game for a shift. `itemsOverride` (jailbreak FULL MENU) wins if provided.
  function build(pm, sh, players, theme, itemsOverride, profile = "legacy") {
    const items = itemsOverride && itemsOverride.length ? itemsOverride : itemSeq(pm, sh.items);
    const g = pm.new_game(sh.rnd || 1, sh.mode || "family", players || 1, theme || "diner", sh.grill || 6, items, profile);
    if (sh.quota) { g.cfg.orders = sh.quota; g.orders_left = sh.quota; }   // authored level length
    return g;
  }

  const CAMPAIGN = { SHIFTS, itemSeq, build };
  global.PMCampaign = CAMPAIGN;
  if (typeof module !== "undefined" && module.exports) module.exports = CAMPAIGN;
})(typeof globalThis !== "undefined" ? globalThis : this);
