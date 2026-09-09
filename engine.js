// PATTY MELT — web engine (UMD).  *** Dedicated to Christine & Phillip Coleman. ***
//
// Faithful port of src/patty_melt.py — pure, deterministic, NO RNG. Same rules
// AND same numbers as the Python tick-engine (the two machines must agree).
//
// UMD (classic script, no ES module) ON PURPOSE: browsers block `type=module`
// imports over file://, so the house cabinets are self-contained. This loads via
// a plain <script src="engine.js"> (double-click index.html works) and under node
// via require() — one engine source for both. selftest() is baked in (ZEBRA
// pattern): reachable in-browser via index.html?selftest and from node.
//
// The cabinet steps this on a FIXED-TIMESTEP accumulator (sim dt = 1/TPS), never
// a raw dt loop — reaction windows stay frame-quantized on 60Hz/144Hz (CLAUDE.md).
(function (global) {
  "use strict";

  // ===================================================================== TUNING
  const TPS = 10, SLOTS = 6;
  const SEAR_READY = 14, SEAR_BURN = 28, MELT_DONE = 16;
  // THE BUN TOASTER — the second scarce station (docs/BUN_TOASTER.md). Mirrors src/patty_melt.py EXACTLY.
  // Toast items (patty melt / smash melt) cook the patty on the grill, toast the rye on a separate 2-slot
  // toaster, and can't be served until a finished patty JOINS a READY bun (auto at the pass). The toaster
  // only EXISTS in a round with a toast item → all-burger is byte-identical (no toaster, cursor stays on grill).
  const TOASTER_SLOTS = 2, TOAST_READY = 12, TOAST_BURN = 26, BUN_SPIKE = 12.0;
  const BILLY_FULL = 100.0, SERVE_POINTS = 100, PERFECT_BONUS = 25, NEVER_BURN = 1e9;
  const TURN_LATENCY = 4;   // 2P: ticks Billy swings to a new cook (serving no one) — the
                            // cost that makes the co-op tug-of-war bind. No effect in 1P.
  const COMBO_PER_MULT = 3, MULT_MAX = 5, FLOW_COMBO = 6;
  const BURIED_RESTLESS = 0.55, BURIED_BARKING = 0.78;
  // THE WEEDS: the WAIT meter = the collapse clock. Mirrors src/patty_melt.py EXACTLY — keep in parity.
  // Replaces fails>=max_fails as the loss; R1 holds at wait 0 for every mode so the locked numbers stand.
  const WAIT_FULL = 100.0, WAIT_COMFORT = 0.40, WAIT_RATE_UP = 2.2, WAIT_RATE_DOWN = 2.8,
        WAIT_SPIKE = 18.0, WAIT_RELIEF = 12.0;
  const HISCORE_N = 10;
  const combo_mult = (c) => Math.min(MULT_MAX, 1 + Math.floor(c / COMBO_PER_MULT));

  const DEFAULT_SCORES = [
    ["CPC", 25000], ["PAT", 21000], ["CHR", 18000], ["MOM", 15000],
    ["POP", 12000], ["MEL", 9000], ["BUN", 6000], ["FRY", 4000],
    ["SHK", 2500], ["BIL", 1000],
  ];

  const THEMES = {
    diner: {
      title: "PATTY MELT", sub: "BURGERS . FRIES . SHAKES",
      item: "BURGER", slung: "BURGERS SLUNG", holler: "HEY BILLY!",
      fired: "GO ON YOUR BREAK, BILLY!", clear: "ROUND CLEAR — press SPACE",
      restless: "the crowd's gettin' restless",
      barks: ["WHERE'S MY BURGER?!", "C'MON, I'M STARVIN'!", "ANY DAY NOW!",
              "TABLE SIX IS WAITIN'!", "ORDER UP ALREADY!"],
    },
    school: {
      title: "PATTY MELT'S HEROES", sub: "SCHOOL LUNCH . MADE WITH LOVE",
      item: " TRAY ", slung: "TRAYS SERVED", holler: "C'MON BILLY!",
      fired: "LUNCH BELL — TAKE RECESS!", clear: "LUNCH SERVED — press SPACE",
      restless: "the line's gettin' antsy",
      barks: ["IS LUNCH READY?", "I'M HUNGRY!", "C'MON, THE BELL!",
              "MY TUMMY'S RUMBLIN'!", "TRAY PLEASE!"],
    },
  };

  const MODES = {
    kids:   { label: "KIDS",   burn: false, orders: [6, 1],  drop: [26, 1, 20],
              drift: 0.7, serve_min: 18.0, serve_iv: 4, pile_max: 8, max_fails: 10 },
    family: { label: "FAMILY", burn: true,  orders: [10, 2], drop: [20, 1, 6],
              drift: 1.3, serve_min: 30.0, serve_iv: 5, pile_max: 6, max_fails: 6 },
    arcade: { label: "ARCADE", burn: true,  orders: [12, 2], drop: [16, 3, 6],
              drift: 2.0, serve_min: 38.0, serve_iv: 6, pile_max: 5, max_fails: 5 },
  };

  const PERIODS = [
    ["LUNCH RUSH",    { drop: 0.85, orders: 1.15, drift: 1.0,  mood: "slam" }],
    ["AFTERNOON POP", { drop: 1.30, orders: 0.80, drift: 0.85, mood: "breather" }],
    ["LATE CROWD",    { drop: 0.90, orders: 1.10, drift: 1.30, mood: "rowdy" }],
  ];

  const Stage = Object.freeze({
    SEAR_A: "SEAR_A", SEAR_B: "SEAR_B", TOAST: "TOAST", MELT: "MELT", DONE: "DONE", BURNT: "BURNT",
  });

  // ---- ORDER VARIETY (mirrors src/patty_melt.py EXACTLY — keep in parity) -------
  // Three orderable items from shared components; each is the same scarce grill running a recipe
  // that differs only in its ordered list of cook ACTIONS (same sweet-spot window), then the cheese
  // MELTs to DONE. BURGER == today's flow, so an all-burger round is byte-identical (locked numbers).
  const Action = Object.freeze({ FLIP: "FLIP", CHEESE: "CHEESE", TOAST: "TOAST" });
  const Item = Object.freeze({ BURGER: "BURGER", GRILLED_CHEESE: "GRILLED_CHEESE", PATTY_MELT: "PATTY_MELT",
                               HAMBURGER: "HAMBURGER", DOUBLE_CHEESE: "DOUBLE_CHEESE",
                               SMASH: "SMASH", SMASH_MELT: "SMASH_MELT" });
  const RECIPES = {
    BURGER:         [Action.FLIP, Action.CHEESE],
    GRILLED_CHEESE: [Action.TOAST, Action.CHEESE],               // (phase 2: moves to the toaster)
    PATTY_MELT:     [Action.FLIP, Action.CHEESE],                // patty on the grill; rye toasts on the TOASTER + joins
    HAMBURGER:      [Action.FLIP],                                // sear, flip, plate — no cheese
    DOUBLE_CHEESE:  [Action.FLIP, Action.FLIP, Action.CHEESE],    // two patties, then the cheese
    SMASH:          [Action.FLIP, Action.CHEESE],                 // smashed cheeseburger — same steps as BURGER but SLOW (ITEM_COOK)
    SMASH_MELT:     [Action.FLIP, Action.CHEESE],                 // smashed patty (1.5x) on rye — grill + a toasted bun
  };
  // Items whose patty needs a TOASTED BUN off the toaster before it can be served (docs/BUN_TOASTER.md).
  // Their grill recipe is now identical to a BURGER's; a round with NONE of these never spins up a toaster.
  const TOAST_ITEMS = new Set([Item.PATTY_MELT, Item.SMASH_MELT]);
  // Items that live ENTIRELY on the toaster — no patty, no grill slot (phase 2). GRILLED CHEESE cooks its
  // whole recipe on a toaster slot and Billy serves it off the toaster. A toaster entry is a Bun (no .stage)
  // or a Patty (a grilled cheese) — `isBun` tells them apart in the tick/serve/dump logic.
  const TOASTER_ITEMS = new Set([Item.GRILLED_CHEESE]);
  const isBun = (e) => e !== null && e.stage === undefined;
  const _ACTION_STAGE = { FLIP: Stage.SEAR_A, CHEESE: Stage.SEAR_B, TOAST: Stage.TOAST };
  const _ACTIVE_STAGES = [Stage.SEAR_A, Stage.SEAR_B, Stage.TOAST];   // actively cooking — can burn
  // ITEM_COOK = per-item cook-time multiplier on the sear windows (SEAR_READY / sear_burn). Default 1.0
  // for EVERY existing item, so an all-BURGER round + the locked R1 numbers are byte-identical. SMASH items
  // cook 1.5x: ready 14->21, burn 28->42 — they genuinely TAKE LONGER on the grill (Joe's call). Mirrors Python.
  const ITEM_COOK = { SMASH: 1.5, SMASH_MELT: 1.5 };
  // Pay scales with work; BURGER pay == SERVE_POINTS so the locked numbers hold. BALANCE PASS
  // ($/tick = (pay+PERFECT_BONUS)/min_ticks): GC 75->2.27 (cheap same-speed filler), BURGER 100->2.84
  // (baseline), PATTY MELT 140->2.84 (EQUAL efficiency to burger: more value + longer commitment = risk/reward).
  // SMASH 150 -> (150+25)/58 ~3.02 and SMASH MELT 210 -> (210+25)/79 ~2.97: the crave items carry a small
  // premium for the 1.5x slot commitment (SMASH MELT = the biggest single ticket on the board).
  const ITEM_PAY = { BURGER: SERVE_POINTS, GRILLED_CHEESE: 75, PATTY_MELT: 140, HAMBURGER: 70, DOUBLE_CHEESE: 180,
                     SMASH: 150, SMASH_MELT: 210 };
  const ITEM_LABEL = { BURGER: "CHEESEBURGER", GRILLED_CHEESE: "GRILLED CHEESE", PATTY_MELT: "PATTY MELT",
                       HAMBURGER: "HAMBURGER", DOUBLE_CHEESE: "DOUBLE CHEESE", SMASH: "SMASH BURGER", SMASH_MELT: "SMASH MELT" };
  const ITEM_TICKET = { BURGER: "CHZ", GRILLED_CHEESE: "G.CHZ", PATTY_MELT: "MELT", HAMBURGER: "HAM", DOUBLE_CHEESE: "2X",
                        SMASH: "SMSH", SMASH_MELT: "SMLT" };
  // Deterministic per-context item sequences (NO RNG): coin-op = burger; bonus rounds = one item;
  // the JAILBREAK cab's FULL MENU interleaves all of them. WHERE each appears is a deployment knob.
  const ITEMS_BURGER = [Item.BURGER];
  const ITEMS_GRILLED_CHEESE = [Item.GRILLED_CHEESE];
  const ITEMS_PATTY_MELT = [Item.PATTY_MELT];
  const ITEMS_SMASH = [Item.SMASH, Item.SMASH_MELT];                        // the SLOW smash-house showcase
  const ITEMS_FIFTIES = [Item.HAMBURGER, Item.BURGER, Item.DOUBLE_CHEESE];   // the 50s burger-stand spread (no toast)
  const ITEMS_FULL_MENU = [Item.BURGER, Item.HAMBURGER, Item.GRILLED_CHEESE, Item.DOUBLE_CHEESE, Item.PATTY_MELT,
                           Item.SMASH, Item.SMASH_MELT];

  function pyround(x) {                 // Python round() is round-half-to-EVEN
    const f = Math.floor(x), d = x - f;
    if (d < 0.5) return f;
    if (d > 0.5) return f + 1;
    return (f % 2 === 0) ? f : f + 1;
  }

  // Per-item cook windows (ITEM_COOK). Default items scale 1.0 == the global constants (byte-identical).
  // SMASH items stretch the sear windows so they take longer to cook AND longer to burn. Mirrors Python.
  function sear_ready(p)    { return pyround(SEAR_READY * (ITEM_COOK[p.item] || 1)); }
  function sear_burn_of(s, p) {
    const b = s.cfg.sear_burn;
    return b >= NEVER_BURN ? b : pyround(b * (ITEM_COOK[p.item] || 1));   // kids never burn — keep the sentinel
  }

  function _scale(spec, rnd) {
    const base = spec[0], delta = spec[1];
    const v = (delta > 0 && spec.length === 3)
      ? base - delta * (rnd - 1) : base + delta * (rnd - 1);
    return spec.length === 3 ? Math.max(spec[2], v) : v;
  }

  function round_config(rnd, mode = "family", players = 1, items = null) {
    const m = MODES[mode];
    const pr = PERIODS[(rnd - 1) % PERIODS.length], pname = pr[0], pf = pr[1];
    const day = Math.floor((rnd - 1) / PERIODS.length) + 1;
    let orders = Math.max(1, pyround(_scale(m.orders, rnd) * pf.orders));
    let drop = Math.max(5, pyround(_scale(m.drop, rnd) * pf.drop));
    const drift = m.drift * pf.drift;
    let serve_iv = m.serve_iv, pile = m.pile_max;
    if (players === 2) {
      // Chrissy = "the RELIEF": co-op feels like HELP. Longer shift (×1.5 orders) but arrival is
      // NOT accelerated in 2P — that flooded the single Billy and made co-op HARDER than solo.
      // Keep the 1P arrival pace + faster Billy (iv-4) + bigger buffer. Mirrors src/patty_melt.py.
      orders = pyround(orders * 1.5);
      serve_iv = Math.max(2, serve_iv - 4);
      pile += 3;
    }
    return {
      label: m.label, period: pname, day, mood: pf.mood,
      orders, drop_interval: drop,
      sear_burn: m.burn ? SEAR_BURN : NEVER_BURN,
      billy_drift: drift, billy_serve_min: m.serve_min,
      billy_interval: serve_iv, pile_max: pile, max_fails: m.max_fails,
      item_seq: (items && items.length) ? items.slice() : ITEMS_BURGER.slice(),
    };
  }

  // ===================================================================== ENGINE
  function Patty(born = 0, item = Item.BURGER, stage = Stage.SEAR_A) {
    return { stage, cook: 0, understeared: false, born, item, step: 0, bunned: false };   // ORDER VARIETY + toaster join
  }
  // A slice of bread toasting on the TOASTER. cook = ticks toasting (< TOAST_READY = not ready,
  // [TOAST_READY, TOAST_BURN) = READY, TOAST_BURN = BURNS). Mirrors Python's Bun.
  function Bun(born = 0) { return { cook: 0, born }; }

  function new_game(rnd = 1, mode = "family", players = 1, theme = "diner", grill = SLOTS, items = null) {
    // `grill` = the GRILL-SIZE lever (default SLOTS=6). Everything else reads s.slots.length, so a
    // non-6 grill is fully supported (the shift = grill size x headcount). `items` = the ORDER VARIETY
    // item sequence (default = all BURGER = today's coin-op run). Mirrors Python exactly.
    grill = Math.max(1, grill);                  // hardening: a grill is always >=1 slot (no empty-array indexing)
    const cfg = round_config(rnd, mode, players, items);
    const roster = [{ name: "PATTY", cursor: 0 }];
    if (players === 2) roster.push({ name: "CHRISSY", cursor: grill - 1 });
    // The toaster spins up ONLY when this round's menu has a bun-item OR a toaster-item — else [] (identical).
    const toaster = cfg.item_seq.some((it) => TOAST_ITEMS.has(it) || TOASTER_ITEMS.has(it))
      ? new Array(TOASTER_SLOTS).fill(null) : [];
    return {
      cfg, mode, theme, rnd, players: roster,
      slots: new Array(grill).fill(null),
      toaster,
      pile: 0, orders_left: cfg.orders, score: 0, fails: 0, bun_fails: 0, wait: 0.0,
      billy: BILLY_FULL, billy_facing: 0, billy_turn_t: 0, billy_turn_to: 0, ticks: 0,
      dropped: 0,                                       // ORDER VARIETY: patties minted so far (indexes item_seq)
      drop_t: cfg.drop_interval, billy_t: 0,
      served: 0, sent_back: 0, combo: 0, combo_best: 0,
      wait_sum: 0, wait_max: 0, over: false, won: false, flash: "", flash_t: 0,
    };
  }

  // The next-round carry rule, in ONE place (the web cabinet AND the terminal loop both call it,
  // so progression can't drift between builds — and the session parity check proves it). Pure:
  // carry SCORE (+ any back-of-house bonus), ease the WAIT meter (WAIT_RELIEF), re-apply the shift's
  // levers (grill size, optional headcount quota). headcount=null leaves the round_config quota.
  function advance_round(s, grill = SLOTS, headcount = null, bonus = 0) {
    const next = new_game(s.rnd + 1, s.mode, s.players.length, s.theme, grill, s.cfg.item_seq);
    if (headcount != null) { next.cfg.orders = headcount; next.orders_left = headcount; }
    next.score = s.score + bonus;
    next.wait = Math.max(0, s.wait - WAIT_RELIEF);
    return next;
  }

  const cursorOf = (s) => s.players[0].cursor;
  function _say(s, msg) { s.flash = msg; s.flash_t = TPS; }
  function _break_combo(s) { s.combo = 0; }
  const _ready = (p) => p.cook >= sear_ready(p);

  const _peek_item = (s) => s.cfg.item_seq[s.dropped % s.cfg.item_seq.length];   // next order's item (no consume)
  function _mint(s, item) { s.dropped += 1; return Patty(s.ticks, item, _ACTION_STAGE[RECIPES[item][0]]); }
  function _new_patty(s) { return _mint(s, _peek_item(s)); }   // grill-slot mint (back-compat)

  // Place the NEXT order on its REQUIRED surface if there's room (GRILLED CHEESE -> a toaster slot, else a
  // grill slot). Head-of-line: if the surface is full it's not placed. For a grill-only menu this is exactly
  // 'fill the first empty grill slot', so all-burger stays byte-identical. Mirrors Python's _place_next.
  function _place_next(s) {
    const item = _peek_item(s);
    if (TOASTER_ITEMS.has(item)) {
      const ti = s.toaster.findIndex((b) => b === null);
      if (ti === -1) return false;
      s.toaster[ti] = _mint(s, item); return true;
    }
    const gi = s.slots.findIndex((sl) => sl === null);
    if (gi === -1) return false;
    s.slots[gi] = _mint(s, item); return true;
  }
  function _place_from_pile_or_drop(s) {               // drain the pile in sequence order (head-of-line)
    while (s.pile > 0 && _place_next(s)) s.pile -= 1;
  }

  function move(s, d, pi = 0) {
    // The cursor spans the grill AND the toaster: [0, slots.length) = grill, then the toaster slots.
    // With no toaster (all-burger) the range is exactly the grill, so clamping is byte-identical.
    if (pi < s.players.length) {
      const c = s.players[pi].cursor;
      s.players[pi].cursor = Math.max(0, Math.min(s.slots.length + s.toaster.length - 1, c + d));
    }
  }
  function _target(s, pi) {                            // (container, index) the cursor points at — grill or toaster
    if (pi >= s.players.length) return [null, -1];
    const c = s.players[pi].cursor;
    if (c < s.slots.length) return [s.slots, c];
    const ti = c - s.slots.length;
    if (ti >= 0 && ti < s.toaster.length) return [s.toaster, ti];
    return [null, -1];
  }
  function _act(s, pi, action, msg) {
    // The ONE generalized step engine, on the GRILL or (a grilled cheese on) the TOASTER: advance only if
    // `action` is the item's NEXT recipe step; acting before the sweet spot understears it. Mirrors Python.
    const [cont, i] = _target(s, pi);
    if (cont === null) return;
    const p = cont[i];
    if (p === null || isBun(p)) return;                           // empty, or a Bun (no cook actions)
    if (p.step >= RECIPES[p.item].length) return;                 // nothing pending (melting / done)
    if (RECIPES[p.item][p.step] !== action) return;               // not this item's next step — no-op
    if (p.cook < sear_ready(p)) p.understeared = true;            // acted too soon — sent back, no bonus (per-item window)
    p.step += 1;
    p.stage = (p.step < RECIPES[p.item].length) ? _ACTION_STAGE[RECIPES[p.item][p.step]] : Stage.MELT;
    p.cook = 0; _say(s, msg);
  }
  function flip(s, pi = 0)       { _act(s, pi, Action.FLIP, "FLIP!"); }
  function add_cheese(s, pi = 0) { _act(s, pi, Action.CHEESE, "CHEESE!"); }
  // Context-aware TOAST (the `X` button): an EMPTY toaster slot -> start a bun for a melt; a toaster slot with
  // a GRILLED CHEESE cooking -> advance its in-toaster toast step; a grill slot -> a harmless no-op (nothing
  // on the grill toasts anymore). Mirrors Python.
  function toast(s, pi = 0) {
    const [cont, i] = _target(s, pi);
    if (cont === s.toaster && i >= 0) {
      const entry = cont[i];
      if (entry === null) { s.toaster[i] = Bun(s.ticks); _say(s, "TOAST!"); return; }
      if (!isBun(entry)) { _act(s, pi, Action.TOAST, "TOAST!"); }   // a grilled cheese toasting on the toaster
      return;                                                        // a Bun already toasting — no-op
    }
    _act(s, pi, Action.TOAST, "TOAST!");
  }

  // 2-UP CO-OP actions: DROP (sacrifice a jammed slot) + HANDOFF (pass to your partner). Mirror Python.
  // The auto-player never calls these → locked R1 numbers untouched. Deterministic / parity-safe.
  function drop(s, pi = 0) {
    if (pi >= s.players.length) return;
    const i = s.players[pi].cursor;
    if (i >= s.slots.length || s.slots[i] === null) return;   // nothing to sacrifice on the toaster / empty slot
    s.slots[i] = null; s.fails += 1; _break_combo(s); _say(s, "DROPPED!");
  }
  function handoff(s, pi = 0) {
    if (s.players.length < 2 || pi >= s.players.length) return;
    const i = s.players[pi].cursor;
    if (i >= s.slots.length) return;                          // a toaster bun can't be handed to a grill slot
    const pat = s.slots[i];
    if (pat === null) return;
    const other = 1 - pi, pc = s.players[other].cursor;
    let best = -1, bestD = 1e9;
    for (const j of _zone_of(s, other)) if (s.slots[j] === null && Math.abs(j - pc) < bestD) { best = j; bestD = Math.abs(j - pc); }
    if (best === -1) return;                     // partner's half is full
    s.slots[best] = pat; s.slots[i] = null; _say(s, "HANDOFF!");
  }
  function hey_billy(s, pi = 0) {
    if (pi >= s.players.length) return;
    s.billy = BILLY_FULL;
    if (s.players.length < 2) {
      s.billy_facing = pi;
    } else if (pi !== s.billy_facing && !(s.billy_turn_t > 0 && s.billy_turn_to === pi)) {
      s.billy_turn_to = pi; s.billy_turn_t = TURN_LATENCY;   // start a swing (repeats don't reset)
    }
    _say(s, THEMES[s.theme].holler);
  }
  function _billy_zone(s) {
    if (s.players.length < 2) return range(0, s.slots.length);
    const half = Math.floor(s.slots.length / 2);
    return s.billy_facing === 0 ? range(0, half) : range(half, s.slots.length);
  }

  function _cook_tick(s) {
    for (let i = 0; i < s.slots.length; i++) {
      const p = s.slots[i];
      if (p === null) continue;
      p.cook += 1;
      if (_ACTIVE_STAGES.indexOf(p.stage) !== -1) {     // SEAR_A / SEAR_B / TOAST — a step is pending
        if (p.cook >= sear_burn_of(s, p)) {             // per-item burn window (SMASH items burn later)
          p.stage = Stage.BURNT; s.slots[i] = null; s.fails += 1; _break_combo(s); _say(s, "BURNT!");
        }
      } else if (p.stage === Stage.MELT) {
        if (p.cook >= MELT_DONE) { p.stage = Stage.DONE; p.cook = 0; }
      }
    }
  }
  // THE BUN TOASTER (docs/BUN_TOASTER.md) — mirrors Python's _toaster_tick / _assembly_tick / _servable.
  function _toaster_tick(s) {          // advance everything on the toaster: buns AND grilled cheeses
    for (let ti = 0; ti < s.toaster.length; ti++) {
      const e = s.toaster[ti];
      if (e === null) continue;
      e.cook += 1;
      if (isBun(e)) {                                   // a bun for a melt (fungible)
        if (e.cook >= TOAST_BURN) { s.toaster[ti] = null; s.fails += 1; s.bun_fails += 1; _break_combo(s); _say(s, "BUN BURNT!"); }
      } else if (_ACTIVE_STAGES.indexOf(e.stage) !== -1) {   // a grilled cheese mid-cook (TOAST / CHEESE step)
        if (e.cook >= sear_burn_of(s, e)) { e.stage = Stage.BURNT; s.toaster[ti] = null; s.fails += 1; _break_combo(s); _say(s, "BURNT!"); }
      } else if (e.stage === Stage.MELT) {
        if (e.cook >= MELT_DONE) { e.stage = Stage.DONE; e.cook = 0; }   // finished grilled cheese jams the slot
      }
    }
  }
  function _assembly_tick(s) {          // the AUTOMATIC join: a finished melt claims the first READY bun
    for (const p of s.slots) {
      if (p === null || p.stage !== Stage.DONE || !TOAST_ITEMS.has(p.item) || p.bunned) continue;
      for (let ti = 0; ti < s.toaster.length; ti++) {
        const b = s.toaster[ti];
        if (isBun(b) && b.cook >= TOAST_READY && b.cook < TOAST_BURN) { p.bunned = true; s.toaster[ti] = null; break; }
      }
    }
  }
  // A DONE item Billy can run: a finished Patty EXCEPT a toast-item still waiting on its bun. (A Bun never
  // serves directly — it joins a melt.)
  const _servable = (p) => p !== null && !isBun(p) && p.stage === Stage.DONE && (!TOAST_ITEMS.has(p.item) || p.bunned);
  function _do_serve(s, p) {            // ring up a served item — shared by the grill and the toaster
    if (p.understeared) { s.fails += 1; s.sent_back += 1; _break_combo(s); _say(s, "SENT BACK!"); }
    else {
      const wait = s.ticks - p.born;
      s.wait_sum += wait; s.wait_max = Math.max(s.wait_max, wait);
      s.served += 1; s.combo += 1; s.combo_best = Math.max(s.combo_best, s.combo);
      s.score += (ITEM_PAY[p.item] + PERFECT_BONUS) * combo_mult(s.combo);
      s.orders_left = Math.max(0, s.orders_left - 1);
      if (s.combo === FLOW_COMBO) _say(s, "BIG GRILL ENERGY!");
    }
  }
  function _billy_tick(s) {
    if (s.billy_turn_t > 0) {                  // 2P: mid-swing — serves NOBODY (the cost)
      s.billy_turn_t -= 1;
      if (s.billy_turn_t === 0) s.billy_facing = s.billy_turn_to;
      s.billy = Math.max(0.0, s.billy - s.cfg.billy_drift);
      return;
    }
    s.billy = Math.max(0.0, s.billy - s.cfg.billy_drift);
    if (s.billy < s.cfg.billy_serve_min) return;
    s.billy_t -= 1;
    if (s.billy_t > 0) return;
    s.billy_t = s.cfg.billy_interval;
    for (const i of _billy_zone(s)) {            // grill first
      const p = s.slots[i];
      if (!_servable(p)) continue;                 // skip empties, unfinished, and un-bunned melts (they jam)
      s.slots[i] = null; _do_serve(s, p); return;
    }
    for (let ti = 0; ti < s.toaster.length; ti++) {   // then a finished GRILLED CHEESE off the toaster (shared)
      const e = s.toaster[ti];
      if (!_servable(e)) continue;
      s.toaster[ti] = null; _do_serve(s, e); return;
    }
  }
  function _drop_tick(s) {
    s.drop_t -= 1;
    if (s.drop_t > 0) return;
    s.drop_t = s.cfg.drop_interval;
    if (!_place_next(s)) {                        // place the next order on its surface (grill / toaster)
      s.pile += 1;
      if (s.pile > s.cfg.pile_max) { s.pile = s.cfg.pile_max; s.fails += 1; _break_combo(s); _say(s, "ORDER LOST!"); }
    }
  }
  function tick(s) {
    if (s.over || s.won) return;
    s.ticks += 1;
    if (s.flash_t > 0) { s.flash_t -= 1; if (s.flash_t === 0) s.flash = ""; }
    const f0 = s.fails, bf0 = s.bun_fails;
    _cook_tick(s);
    _toaster_tick(s);       // buns advance / burn
    _assembly_tick(s);      // finished patties claim ready buns (auto-join)
    _billy_tick(s); _drop_tick(s); _place_from_pile_or_drop(s);
    // THE WEEDS: integrate buried pressure over COMFORT, spike on new fails, clamp 0..FULL. A burnt BUN
    // spikes SOFTER (BUN_SPIKE) than a burnt/walked/sent patty (WAIT_SPIKE). With no toaster, bun_fails
    // never moves, so this reduces to exactly WAIT_SPIKE*(new fails) — byte-identical.
    const delta = buried_index(s) - WAIT_COMFORT;
    s.wait += (delta > 0 ? WAIT_RATE_UP : WAIT_RATE_DOWN) * delta;
    const new_bun = s.bun_fails - bf0;
    s.wait += WAIT_SPIKE * Math.max(0, (s.fails - f0) - new_bun) + BUN_SPIKE * Math.max(0, new_bun);
    s.wait = Math.max(0, Math.min(WAIT_FULL, s.wait));
    if (s.orders_left <= 0) s.won = true;
    else if (s.wait >= WAIT_FULL) s.over = true;          // IN THE WEEDS — the WAIT meter is the loss now
  }

  function live_wait(s) {
    let mx = 0, any = false;
    for (const p of s.slots) if (p !== null) { mx = Math.max(mx, s.ticks - p.born); any = true; }
    return any ? mx / TPS : 0.0;
  }
  function buried_index(s) {
    const occ = s.slots.filter((x) => x !== null).length;
    const done = s.slots.filter((x) => x && x.stage === Stage.DONE).length;
    const pile = s.cfg.pile_max ? (s.pile / s.cfg.pile_max) : 0.0;
    const n = s.slots.length || 1;               // hardening: never divide by zero on a degenerate grill
    return (occ / n) * 0.5 + pile * 0.3 + (done / n) * 0.2;
  }
  function crowd_bark(s) {
    if (buried_index(s) < BURIED_BARKING) return "";
    const barks = THEMES[s.theme].barks;
    return barks[Math.floor(s.ticks / (TPS * 2)) % barks.length];
  }

  function qualifies(scores, score) {
    return score > 0 && (scores.length < HISCORE_N || score > Math.min.apply(null, scores.map((e) => e[1])));
  }
  function add_high_score(scores, name, score) {
    const board = scores.concat([[name, score]]).sort((a, b) => b[1] - a[1]).slice(0, HISCORE_N);
    const rank = board.findIndex((e) => e[0] === name && e[1] === score);
    return [board, rank];
  }

  function _zone_of(s, pi) {
    if (s.players.length < 2) return range(0, s.slots.length);
    const half = Math.floor(s.slots.length / 2);
    return pi === 0 ? range(0, half) : range(half, s.slots.length);
  }
  function auto_step(s) {
    for (let pi = 0; pi < s.players.length; pi++) {
      const zone = _zone_of(s, pi);
      // a SERVABLE done worth a holler — my grill zone, or the shared toaster (grilled cheese). In 2P only
      // cook 0 "owns" toaster hollering so the two cooks don't thrash Billy. (Grill/melt rounds: buns aren't
      // servable, so the toaster term is always false → byte-identical.)
      const my_done = zone.some((i) => _servable(s.slots[i])) ||
        ((s.players.length < 2 || pi === 0) && s.toaster.some((e) => _servable(e)));
      const billy_here = s.players.length < 2 || s.billy_facing === pi;
      if (my_done && (s.billy < s.cfg.billy_serve_min + 12 || !billy_here)) { hey_billy(s, pi); continue; }
      // BUN MANAGEMENT — keep the toaster fed so a bun lands READY as each melt finishes: if more
      // nearly/already-finished melts in my zone need a bun than there are buns going, start one.
      if (s.toaster.length) {
        let need = 0;
        for (const i of zone) { const p = s.slots[i];
          if (p && TOAST_ITEMS.has(p.item) && !p.bunned && (p.stage === Stage.MELT || p.stage === Stage.DONE)) need += 1; }
        const have = s.toaster.filter((b) => isBun(b)).length;
        if (need > have) {
          const free = s.toaster.findIndex((b) => b === null);
          if (free !== -1) { s.players[pi].cursor = s.slots.length + free; toast(s, pi); continue; }
        }
      }
      // COOK the most-urgent READY item — a grill patty OR a grilled cheese cooking on the toaster.
      let bestCont = null, bestI = -1, best_cook = -1;
      for (const i of zone) {
        const p = s.slots[i];
        if (p && _ACTIVE_STAGES.indexOf(p.stage) !== -1 && _ready(p) && p.cook > best_cook) { bestCont = s.slots; bestI = i; best_cook = p.cook; }
      }
      for (let ti = 0; ti < s.toaster.length; ti++) {
        const e = s.toaster[ti];
        if (e !== null && !isBun(e) && _ACTIVE_STAGES.indexOf(e.stage) !== -1 && _ready(e) && e.cook > best_cook) { bestCont = s.toaster; bestI = ti; best_cook = e.cook; }
      }
      if (bestCont === null) continue;
      s.players[pi].cursor = (bestCont === s.slots ? bestI : s.slots.length + bestI);
      const p = bestCont[bestI];
      const act = RECIPES[p.item][p.step];              // do the item's NEXT recipe step
      if (act === Action.FLIP) flip(s, pi); else if (act === Action.CHEESE) add_cheese(s, pi); else toast(s, pi);
    }
  }

  function range(a, b) { const r = []; for (let i = a; i < b; i++) r.push(i); return r; }

  // ================================================================ MINI-STAGES
  // Back-of-house FREEZER/BASEMENT — a faithful port of src/patty_melt.py's mini-stage
  // skeleton (a cart under lanes of moving items + a clock). Pure, deterministic, NO RNG
  // (lanes follow a fixed spread). FREEZER = no-fail bonus breather; BASEMENT = quota-or-
  // forfeit, x2 on a clean clear. Parity-proven vs Python tick-by-tick (tools/parity.py).
  const MINI_LANES = 6, MINI_ROWS = 5;
  const _LANE_SEQ = [0, 3, 1, 4, 2, 5, 1, 4, 0, 3, 2, 5];   // deterministic spread (no RNG)
  function MiniConfig(name, flavor, rising, duration, spawn_interval, fall_interval, points, quota, mult_clear, mood) {
    return { name, flavor, rising, duration, spawn_interval, fall_interval, points, quota, mult_clear, mood };
  }
  const FREEZER = MiniConfig("FREEZER", "RESTOCK THE WALK-IN", false, 240, 12, 4, 25, 0, 1, "chill");
  const BASEMENT = MiniConfig("BASEMENT", "AFTER HOURS - THE WALK-IN", true, 300, 9, 3, 50, 10, 2, "metal");
  const MINI_STAGES = { FREEZER, BASEMENT };

  function mini_new(cfg) {
    return { cfg, cart: Math.floor(MINI_LANES / 2), items: [], t_left: cfg.duration,
             spawn_t: cfg.spawn_interval, spawned: 0, caught: 0, missed: 0, score: 0,
             done: false, flash: "", flash_t: 0 };
  }
  function mini_move(s, d) { s.cart = Math.max(0, Math.min(MINI_LANES - 1, s.cart + d)); }
  const _mini_catch_row = (cfg) => cfg.rising ? 0 : MINI_ROWS - 1;   // rising resolves at top, falling at bottom

  function mini_tick(s) {                                  // one tick — items step toward the resolve row, spawn on the interval
    if (s.done) return;
    if (s.flash_t > 0) { s.flash_t -= 1; if (s.flash_t === 0) s.flash = ""; }
    s.t_left -= 1;
    const catchRow = _mini_catch_row(s.cfg), step = s.cfg.rising ? -1 : 1;
    const survivors = [];
    for (const it of s.items) {
      it[2] += 1;
      if (it[2] >= s.cfg.fall_interval) { it[2] = 0; it[1] += step; }
      if (it[1] === catchRow) {                            // reached the resolve row — consumed either way
        if (it[0] === s.cart) { s.caught += 1; s.score += s.cfg.points; s.flash = "GOT IT!"; s.flash_t = Math.floor(TPS / 2); }
        else s.missed += 1;
        continue;
      }
      if (it[1] >= 0 && it[1] < MINI_ROWS) survivors.push(it);
    }
    s.items = survivors;
    s.spawn_t -= 1;
    if (s.spawn_t <= 0 && s.t_left > 0) {                  // stop spawning once the clock's out
      s.spawn_t = s.cfg.spawn_interval;
      s.items.push([_LANE_SEQ[s.spawned % _LANE_SEQ.length], s.cfg.rising ? MINI_ROWS - 1 : 0, 0]);
      s.spawned += 1;
    }
    if (s.t_left <= 0 && s.items.length === 0) _mini_finish(s);   // clock out AND everything resolved
  }
  function _mini_finish(s) {
    s.done = true;
    if (s.cfg.quota && s.caught < s.cfg.quota) { s.score = 0; s.flash = "FORFEIT - couldn't clear it"; s.flash_t = TPS; }
    else if (s.cfg.quota) { s.score *= s.cfg.mult_clear; s.flash = "CLEARED!"; s.flash_t = TPS; }
  }
  function mini_auto_step(s) {                             // competent cart: slide toward the nearest-to-resolve item
    const catchRow = _mini_catch_row(s.cfg);
    let target = null, best = 999;
    for (const it of s.items) { const d = Math.abs(it[1] - catchRow); if (d < best) { best = d; target = it; } }
    if (target !== null && target[0] !== s.cart) mini_move(s, target[0] > s.cart ? 1 : -1);
  }

  // =================================================================== SELFTEST
  // Baked in (ZEBRA pattern): node prints it; index.html?selftest renders it.
  // Includes the PARITY check — reproduce the Python engine's exact R1 numbers.
  function play(rnd, mode, players, maxTicks, items) {
    const s = new_game(rnd || 1, mode || "family", players || 1, "diner", SLOTS, items || null);
    const cap = maxTicks || 6000;
    while (!(s.over || s.won) && s.ticks < cap) { auto_step(s); tick(s); }
    return s;
  }
  function serveOne(s) {                 // one forced Billy serve (mirrors _billy_tick)
    for (let i = 0; i < s.slots.length; i++) {
      const p = s.slots[i];
      if (!p || p.stage !== Stage.DONE) continue;
      s.slots[i] = null;
      s.served += 1; s.combo += 1; s.combo_best = Math.max(s.combo_best, s.combo);
      s.score += (ITEM_PAY[p.item] + PERFECT_BONUS) * combo_mult(s.combo);
      s.orders_left = Math.max(0, s.orders_left - 1);
      return;
    }
  }
  function selftest() {
    const R = [];
    const ok = (n, c, i) => R.push({ name: n, ok: !!c, info: i == null ? "" : "" + i });

    const a = play(), b = play();
    ok("deterministic", a.won === b.won && a.score === b.score && a.fails === b.fails && a.ticks === b.ticks);

    let winAll = true;
    for (const m of Object.keys(MODES)) for (const pl of [1, 2]) { const s = play(1, m, pl); if (!(s.won && !s.over)) winAll = false; }
    ok("winnable R1 (all modes, 1P+2P)", winAll);

    ok("2P adds Chrissy + helps (more orders, faster Billy, same arrival)",
      new_game(1, "family", 2).players[1].name === "CHRISSY" &&
      round_config(1, "arcade", 2).orders > round_config(1, "arcade", 1).orders &&
      round_config(1, "arcade", 2).drop_interval === round_config(1, "arcade", 1).drop_interval &&
      round_config(1, "arcade", 2).billy_interval < round_config(1, "arcade", 1).billy_interval);

    // TURN-LATENCY: holler swings Billy (serving no one mid-swing); 1P unaffected
    const tl = new_game(1, "family", 2);
    tl.slots[0] = Patty(0); tl.slots[0].stage = Stage.DONE;
    tl.billy_facing = 0; tl.billy = BILLY_FULL; tl.billy_t = 0;
    hey_billy(tl, 1);
    let tlOk = tl.billy_turn_t === TURN_LATENCY && tl.billy_facing === 0;
    const base = tl.served;
    for (let i = 0; i < TURN_LATENCY; i++) _billy_tick(tl);
    tlOk = tlOk && tl.slots[0] !== null && tl.served === base && tl.billy_facing === 1;
    const one = new_game(1, "family"); hey_billy(one);
    ok("turn-latency binds 2P, 1P unaffected", tlOk && one.billy_turn_t === 0);

    const neg = new_game(1, "arcade");
    while (!(neg.over || neg.won) && neg.ticks < 6000) tick(neg);
    ok("neglect buries you (WAIT meter fills)", neg.over && !neg.won && neg.wait >= WAIT_FULL);
    let r1safe = true;                                    // parity guard: a clean R1 never buries
    for (const m of Object.keys(MODES)) { const a = play(1, m); if (!(a.won && a.wait < WAIT_FULL)) r1safe = false; }
    ok("clean R1 never buries (parity safe)", r1safe && play(1, "arcade").wait === 0);

    const j = new_game(1, "arcade");
    j.slots[0] = Patty(0); flip(j); add_cheese(j);
    ok("rushed burger is understeared", j.slots[0].understeared);

    ok("sweet spot fixed across rounds",
      round_config(1, "arcade").sear_burn === round_config(9, "arcade").sear_burn &&
      round_config(1, "arcade").sear_burn === SEAR_BURN);

    const cm = new_game(1, "arcade");
    for (let k = 0; k < FLOW_COMBO; k++) { cm.slots[0] = Patty(cm.ticks); cm.slots[0].stage = Stage.DONE; serveOne(cm); }
    let want = 0; for (let k = 1; k <= FLOW_COMBO; k++) want += (SERVE_POINTS + PERFECT_BONUS) * combo_mult(k);
    ok("combo builds + scores", cm.combo === FLOW_COMBO && combo_mult(cm.combo) === 3 && cm.score === want);

    const bi = new_game(1, "arcade");
    let buriedOk = buried_index(bi) === 0.0 && crowd_bark(bi) === "";
    for (let i = 0; i < SLOTS; i++) { bi.slots[i] = Patty(0); bi.slots[i].stage = Stage.DONE; }
    bi.pile = bi.cfg.pile_max;
    buriedOk = buriedOk && Math.abs(buried_index(bi) - 1.0) < 1e-9 && THEMES.diner.barks.indexOf(crowd_bark(bi)) !== -1;
    const sk = new_game(1, "arcade", 1, "school");
    for (let i = 0; i < SLOTS; i++) { sk.slots[i] = Patty(0); sk.slots[i].stage = Stage.DONE; }
    sk.pile = sk.cfg.pile_max;
    buriedOk = buriedOk && THEMES.school.barks.indexOf(crowd_bark(sk)) !== -1;
    ok("buried index 0..1 drives barks (reskins)", buriedOk);

    // GRILL-SIZE lever (per-shift): non-6 grills wired + deterministic + buried scales to grill size
    const g4 = new_game(1, "family", 1, "diner", 4);
    const g8 = new_game(1, "family", 2, "diner", 8);
    let gridOk = g4.slots.length === 4 && g8.slots.length === 8 && g8.players[1].cursor === 7;
    while (!(g8.over || g8.won) && g8.ticks < 6000) { auto_step(g8); tick(g8); }
    gridOk = gridOk && g8.won;
    const bj = new_game(1, "arcade", 1, "diner", 4);
    for (let i = 0; i < 4; i++) { bj.slots[i] = Patty(0); bj.slots[i].stage = Stage.DONE; }
    bj.pile = bj.cfg.pile_max;
    gridOk = gridOk && Math.abs(buried_index(bj) - 1.0) < 1e-9;
    ok("grill-size lever: non-6 grills wired + buried scales", gridOk);

    const ins = add_high_score(DEFAULT_SCORES, "JOE", 30000);
    ok("high-score board", DEFAULT_SCORES[0][0] === "CPC" && qualifies(DEFAULT_SCORES, 26000) &&
      !qualifies(DEFAULT_SCORES, 500) && ins[1] === 0 && ins[0][0][0] === "JOE" && ins[0].length === HISCORE_N);

    // MINI-STAGES (back of house): freezer banks a no-fail bonus; basement quota clears x2
    const playMini = (cfg) => { const s = mini_new(cfg); let g = 0; while (!s.done && g++ < 5000) { mini_auto_step(s); mini_tick(s); } return s; };
    const fz = playMini(FREEZER), bz = playMini(BASEMENT);
    const bzForfeit = mini_new(BASEMENT); for (let i = 0; i < 5000 && !bzForfeit.done; i++) mini_tick(bzForfeit);  // never move → miss quota
    ok("mini-stages: freezer bonus + basement quota clear/forfeit",
       fz.done && fz.score > 0 && FREEZER.quota === 0 &&
       bz.done && bz.caught >= BASEMENT.quota && bz.score > 0 &&
       bzForfeit.done && bzForfeit.score === 0);

    // ORDER VARIETY: three items from shared steps; BURGER byte-identical, the new ones winnable.
    let varOk = RECIPES.BURGER.length === 2 && RECIPES.GRILLED_CHEESE[0] === Action.TOAST &&
      RECIPES.PATTY_MELT.length === 2 && RECIPES.SMASH_MELT.length === 2 &&   // melts cook like a burger; rye's on the toaster
      TOAST_ITEMS.has(Item.PATTY_MELT) && TOAST_ITEMS.has(Item.SMASH_MELT) && !TOAST_ITEMS.has(Item.SMASH) &&
      ITEM_PAY.GRILLED_CHEESE < ITEM_PAY.BURGER && ITEM_PAY.BURGER < ITEM_PAY.PATTY_MELT &&
      ITEM_PAY.BURGER === SERVE_POINTS;
    const burgerExplicit = play(1, "arcade", 1, undefined, ITEMS_BURGER);
    varOk = varOk && burgerExplicit.score === 5500 && burgerExplicit.ticks === 244;   // all-burger == default (locked)
    for (const items of [ITEMS_GRILLED_CHEESE, ITEMS_PATTY_MELT])
      for (const m of Object.keys(MODES)) for (const pl of [1, 2]) {
        const s = play(1, m, pl, undefined, items); if (!(s.won && !s.over)) varOk = false;
      }
    for (const m of Object.keys(MODES)) if (!play(1, m, 1, undefined, ITEMS_FULL_MENU).won) varOk = false;
    if (!play(1, "kids", 2, undefined, ITEMS_FULL_MENU).won) varOk = false;
    // recipe ORDER enforced: wrong action no-ops; TOAST burns like a sear
    const gc = new_game(1, "arcade", 1, "diner", SLOTS, ITEMS_GRILLED_CHEESE);
    gc.slots[0] = _new_patty(gc);
    varOk = varOk && gc.slots[0].item === Item.GRILLED_CHEESE && gc.slots[0].stage === Stage.TOAST;
    flip(gc); varOk = varOk && gc.slots[0].step === 0;                 // FLIP must not advance a grilled cheese
    gc.slots[0].cook = SEAR_READY; toast(gc);
    varOk = varOk && gc.slots[0].step === 1 && gc.slots[0].stage === Stage.SEAR_B;
    const tb = new_game(1, "arcade", 1, "diner", SLOTS, ITEMS_GRILLED_CHEESE);   // in-slot toast still burns (phase 1)
    tb.slots[0] = Patty(0, Item.GRILLED_CHEESE, Stage.TOAST); tb.slots[0].cook = SEAR_BURN; _cook_tick(tb);
    varOk = varOk && tb.slots[0] === null && tb.fails === 1;
    // FULL MENU interleaves all items deterministically by creation order
    const fm = new_game(1, "arcade", 1, "diner", SLOTS, ITEMS_FULL_MENU);
    const minted = []; for (let i = 0; i < 2 * ITEMS_FULL_MENU.length; i++) minted.push(_new_patty(fm).item);
    varOk = varOk && minted.join(",") === ITEMS_FULL_MENU.concat(ITEMS_FULL_MENU).join(",");
    ok("order variety: recipes + det. item seq + burger byte-identical", varOk);

    // THE BUN TOASTER (docs/BUN_TOASTER.md) — toaster exists only for toast rounds; join gates the serve;
    // buns burn SOFTER; the cursor spans grill+toaster. Mirrors src/patty_melt.py's toaster checks.
    let toastOk = new_game(1, "arcade", 1, "diner", SLOTS, ITEMS_BURGER).toaster.length === 0 &&
      new_game(1, "arcade", 1, "diner", SLOTS, ITEMS_PATTY_MELT).toaster.length === TOASTER_SLOTS;
    const jm = new_game(1, "arcade", 1, "diner", SLOTS, ITEMS_PATTY_MELT);
    jm.slots[0] = Patty(0, Item.PATTY_MELT, Stage.DONE); jm.billy = BILLY_FULL; jm.billy_t = 0; _billy_tick(jm);
    toastOk = toastOk && jm.slots[0] !== null && jm.served === 0 && !_servable(jm.slots[0]);   // bun-less melt jams
    jm.toaster[0] = Bun(0); jm.toaster[0].cook = TOAST_READY; _assembly_tick(jm);
    toastOk = toastOk && jm.slots[0].bunned && jm.toaster[0] === null && _servable(jm.slots[0]);  // ready bun joins
    const ub = new_game(1, "arcade", 1, "diner", SLOTS, ITEMS_PATTY_MELT);   // under-toasted can't join
    ub.slots[0] = Patty(0, Item.PATTY_MELT, Stage.DONE); ub.toaster[0] = Bun(0); ub.toaster[0].cook = TOAST_READY - 1;
    _assembly_tick(ub); toastOk = toastOk && !ub.slots[0].bunned && ub.toaster[0] !== null;
    const bb = new_game(1, "arcade", 1, "diner", SLOTS, ITEMS_PATTY_MELT);   // a forgotten bun burns = soft fail
    bb.toaster[0] = Bun(0); bb.toaster[0].cook = TOAST_BURN - 1; tick(bb);
    toastOk = toastOk && bb.toaster[0] === null && bb.bun_fails === 1 && bb.fails === 1;
    const cur = new_game(1, "arcade", 1, "diner", SLOTS, ITEMS_PATTY_MELT);  // cursor spans grill + toaster
    for (let i = 0; i < 20; i++) move(cur, +1);
    toastOk = toastOk && cur.players[0].cursor === SLOTS + TOASTER_SLOTS - 1;
    const curb = new_game(1, "arcade", 1, "diner", SLOTS, ITEMS_BURGER);     // all-burger cursor stays on the grill
    for (let i = 0; i < 20; i++) move(curb, +1);
    toastOk = toastOk && curb.players[0].cursor === SLOTS - 1;
    ok("bun toaster: join gates serve, buns burn soft, cursor spans grill+toaster", toastOk);

    // SMASH items — take LONGER (ITEM_COOK 1.5x) but a normal item is unaffected + still winnable
    let smOk = sear_ready({ item: Item.BURGER }) === SEAR_READY &&        // default item unchanged
      sear_ready({ item: Item.SMASH }) === 21 && sear_ready({ item: Item.SMASH_MELT }) === 21 &&
      sear_burn_of({ cfg: { sear_burn: SEAR_BURN } }, { item: Item.SMASH }) === 42 &&
      sear_burn_of({ cfg: { sear_burn: NEVER_BURN } }, { item: Item.SMASH }) === NEVER_BURN &&   // kids sentinel holds
      ITEM_PAY.PATTY_MELT < ITEM_PAY.SMASH_MELT && ITEM_PAY.BURGER < ITEM_PAY.SMASH;
    for (const m of Object.keys(MODES)) if (!play(1, m, 1, undefined, ITEMS_SMASH).won) smOk = false;   // slow but clearable
    // a SMASH understears if flipped at the burger window (14) but not at its own (21)
    const su = new_game(1, "arcade", 1, "diner", SLOTS, ITEMS_SMASH); su.slots[0] = _new_patty(su);
    su.slots[0].cook = SEAR_READY; flip(su); smOk = smOk && su.slots[0].understeared === true && su.slots[0].step === 1;
    ok("smash items: 1.5x cook window (slower), premium pay, winnable, burger unaffected", smOk);

    // CO-OP DROP + HANDOFF (2P teamwork / recovery)
    const dd = new_game(1, "arcade"); dd.slots[0] = Patty(0); const bf = dd.fails;
    drop(dd); let coOk = dd.slots[0] === null && dd.fails === bf + 1;
    drop(dd); coOk = coOk && dd.fails === bf + 1;                       // empty -> no-op
    const h1 = new_game(1, "arcade"); h1.slots[0] = Patty(0); handoff(h1); coOk = coOk && h1.slots[0] !== null;   // 1P no-op
    const h2 = new_game(1, "arcade", 2); h2.slots[1] = Patty(0); h2.players[0].cursor = 1;
    handoff(h2, 0); coOk = coOk && h2.slots[1] === null && h2.slots[5] !== null;
    ok("co-op drop + handoff (2P)", coOk);

    // PARITY: exact Python --selftest numbers
    const EXPECT = { kids: [201, 1750], family: [249, 4250], arcade: [244, 5500] };
    for (const m of Object.keys(MODES)) {
      const s = play(1, m);
      const e = EXPECT[m];
      ok("parity vs Python: " + MODES[m].label, s.ticks === e[0] && s.score === e[1],
         "ticks=" + s.ticks + " score=" + s.score);
    }
    return R;
  }

  const PM = {
    TPS, SLOTS, SEAR_READY, SEAR_BURN, MELT_DONE, BILLY_FULL, SERVE_POINTS,
    PERFECT_BONUS, NEVER_BURN, TURN_LATENCY, COMBO_PER_MULT, MULT_MAX, FLOW_COMBO,
    BURIED_RESTLESS, BURIED_BARKING, WAIT_FULL, WAIT_COMFORT, WAIT_RATE_UP,
    WAIT_RATE_DOWN, WAIT_SPIKE, WAIT_RELIEF, HISCORE_N, DEFAULT_SCORES, THEMES, MODES,
    PERIODS, Stage, combo_mult, pyround, round_config, Patty, new_game, advance_round, cursorOf,
    move, flip, add_cheese, toast, drop, handoff, hey_billy, tick, live_wait, buried_index, crowd_bark,
    qualifies, add_high_score, auto_step, selftest,
    Action, Item, RECIPES, ITEM_PAY, ITEM_LABEL, ITEM_TICKET, ITEM_COOK, sear_ready, sear_burn_of,
    TOASTER_SLOTS, TOAST_READY, TOAST_BURN, BUN_SPIKE, TOAST_ITEMS, TOASTER_ITEMS, Bun,   // THE BUN TOASTER
    ITEMS_BURGER, ITEMS_GRILLED_CHEESE, ITEMS_PATTY_MELT, ITEMS_SMASH, ITEMS_FIFTIES, ITEMS_FULL_MENU,
    MINI_LANES, MINI_ROWS, FREEZER, BASEMENT, MINI_STAGES,
    mini_new, mini_move, mini_tick, mini_auto_step,
  };
  global.PM = PM;
  if (typeof module !== "undefined" && module.exports) module.exports = PM;
})(typeof globalThis !== "undefined" ? globalThis : this);

// CLI: `node web/engine.js` prints the baked selftest + PARITY summary (the header's
// promise — "node prints it"). This is the canonical web parity runner; exits 1 on any
// failure so it's CI-friendly. In the browser it's inert (no require.main).
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const pm = module.exports;
  const R = pm.selftest(), fails = R.filter((r) => !r.ok);
  for (const f of fails) console.error("FAIL:", f.name, f.info);
  if (fails.length) { console.error(`PATTY MELT web selftest: ${fails.length}/${R.length} checks FAILED`); process.exit(1); }
  console.log("PATTY MELT web selftest OK  (parity vs Python engine)");
  for (const m of Object.keys(pm.MODES)) {
    const s = pm.new_game(1, m);
    while (!(s.over || s.won) && s.ticks < 6000) { pm.auto_step(s); pm.tick(s); }
    console.log(`  ${pm.MODES[m].label.padEnd(7)} R1 cleared in ${String(s.ticks).padStart(3)} ticks ` +
      `(~${Math.round(s.ticks / pm.TPS)}s), score ${s.score}, fails ${s.fails}   [matches Python]`);
  }
}
