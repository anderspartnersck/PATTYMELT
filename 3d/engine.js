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
  // REAL ORDERS (SERVICE profile only; legacy byte-identical). Every service ticket has a SEAT and a BREAD;
  // every patty item needs a toasted bun OF ITS TICKET'S BREAD. The three bread PANS are cursor stops after
  // the toaster (grill slots, toaster slots, then pans in BREADS order). Mirrors src/patty_melt.py EXACTLY.
  // OPT-IN: new_game(..., "service", true) sets cfg.bread (carried by advance_round). Service games WITHOUT it
  // behave exactly as before (seats + ticket bread are harmless data on every service ticket).
  const TOASTER_SLOTS_SERVICE = 2;                  // the bread kitchen's toaster (2 bays modelled in 3D)
  const TOAST_READY_BREAD = 16, TOAST_BURN_BREAD = 60;   // bread game: toast quick (1.6s), HOLD long (6.0s, a warmer)
  const BREADS = ["SESAME", "RYE", "WHITE"];        // left->right pan order on the line (pan stop k = BREADS[k])
  const BREAD_LABEL = { SESAME: "SESAME BUN", RYE: "RYE", WHITE: "WHITE" };
  const BREAD_TAG = { SESAME: "SES", RYE: "RYE", WHITE: "WHT" };
  const SEAT_CYCLE = [0, 1, 6, 2, 3, 7, 4, 8, 5, 9]; // ticket id % 10 -> seat (0-5 counter stools, 6-9 booths)
  const COUNTER_SEATS = 6;                          // 0..5 = BAR 1..6 (B1..B6); 6..9 = TABLE 1..4 (T1..T4)
  const BILLY_FULL = 100.0, SERVE_POINTS = 100, PERFECT_BONUS = 25, NEVER_BURN = 1e9;
  const TURN_LATENCY = 4;   // 2P: ticks Billy swings to a new cook (serving no one) — the
                            // cost that makes the co-op tug-of-war bind. No effect in 1P.
  const COMBO_PER_MULT = 3, MULT_MAX = 5, FLOW_COMBO = 6;
  // COOK QUALITY + WASTE (Joe 1112, docs/SCORING-1112.md) — mirrors src/patty_melt.py EXACTLY. No more
  // "too soon -> SENT BACK": an early/late action changes the patty's DONENESS; you keep cooking. Per-side
  // sear + flip count -> a GRADE when the sear ends. EXTRA flips swap the down side (rescue) at FLIP_PENALTY.
  // RAW (a side under half its ready) / BURNT / DROPPED / WRONG BREAD = the WASTE TALLY (-WASTE_COST, a fail)
  // and, with a ticket, the order is REDONE (back to the head of the queue).
  const GRADE_PERFECT = 95, GRADE_GOOD = 75, GRADE_OK = 50, FLIP_PENALTY = 15;
  const GRADE_BONUS = { PERFECT: 50, GOOD: PERFECT_BONUS, OK: 0 };   // GOOD == the old flat bonus
  const WASTE_COST = 60, POOR_SPIKE = 9.0;
  // SHIFT POINTS: four categories (asymmetric-horror style emblems; presentation in web/lib/scoring.js)
  const CATS = ["grill", "service", "hustle", "nerve"];
  const PTS = { PERFECT: 300, GOOD: 150, OK: 50, ON_TIME: 150, IN_ORDER: 100, DRINK: 100, DRINK_LATE: 25,
                WAKE_UP: 100, HANDOFF: 75, CLUTCH: 75, STREAK: 25, BGE: 250 };
  const POPS_MAX = 12;
  // DRINKS (opt-in cfg.drinks, service only): Billy runs one drink per customer off a 3-spot rail.
  const DRINKS = ["SODA", "WATER", "MILKSHAKE"];
  const DRINK_CYCLE = ["SODA", "WATER", "SODA", "MILKSHAKE", "WATER"];   // ticket id % 5
  const DRINK_POUR = { WATER: 8, SODA: 14, MILKSHAKE: 36 };
  const DRINK_RAIL = 3, DRINK_PATIENCE = 160, DRINK_SPIKE = 4.0, DRINK_BEAT = 3;   // a drink run = 1/DRINK_BEAT serve beat
  const drink_for = (id) => DRINK_CYCLE[id % DRINK_CYCLE.length];
  // THE DAY (Joe 1112, docs/DAY-1112.md): a real restaurant day (opt-in cfg.sched, service only). Mirrors Python:
  // segments [n, gap, kind(, pre(, bag))] — walk | seat (a SEATING wave) | togo (TAKE-OUT bag + PICKUP clock) |
  // bar (HAPPY HOUR round of drinks) | rush (a surge). The WAIT meter recovers DAY_RECOVER x in a breather
  // (next arrival a long gap away / schedule spent); a waste spikes WASTE_SPIKE (a redo, not a lost order).
  const DAY_LULL_GAP = 150, DAY_RECOVER = 2.0, WASTE_SPIKE = 9.0, DAY_CUE = 60, DAY_TAIL = 150;
  const DAY_WAVES = ["seat", "togo", "rush"];
  const TAKEOUT_WINDOW = 240, TAKEOUT_BAG = 2, TAKEOUT_SPIKE = 4.0, BAG_BEAT = 2, BAR_ROUNDS = 2;
  // SHIFTS ON A GAME CLOCK (Joe 1112, docs/SHIFTS-AND-BATTLE-1112.md) — opt-in `tpm` in the day spec. Mirrors Python:
  // (t1 - t0) restaurant minutes x tpm ticks; a FLOW of [m0, m1, gap, kind(, n(, bag))] (n 0 = a stream until m1,
  // n > 0 = a burst of n); the shift ends at the close (survive = won); `bump` = THE LATE BUMP inside the shift.
  const DAY_REF_TPM = 10;       // GAME CLOCK: the reference scale; a faster clock (QUICK) shrinks every burst to tpm/REF of its people
  const DAY_LAST_ORDERS = 150;   // GAME CLOCK: no new walk-ins in the final 150 ticks (15 s) before close, at any scale
  function _flow_compile(spec, drop_interval) {
    const t0 = spec.t0, tpm = spec.tpm, span = (spec.t1 - t0) * tpm, door = Math.max(1, span - DAY_LAST_ORDERS), ev = [];   // door = the last ticket the grill takes
    let bags = 0;
    spec.flow.forEach((seg, si) => {
      const m0 = seg[0], m1 = seg[1], gap = seg[2], kind = seg[3], size = seg.length > 5 ? seg[5] : TAKEOUT_BAG;
      let n = seg.length > 4 ? seg[4] : 0;
      const step = Math.max(1, Math.floor(drop_interval * gap / 100)), a = (m0 - t0) * tpm;
      if (n > 0) {
        if (a < 0) return;                           // a burst before this shift opened (the late bump moved t0)
        if (tpm < DAY_REF_TPM) n = Math.max(1, Math.floor((n * tpm + DAY_REF_TPM - 1) / DAY_REF_TPM));   // QUICK: smaller bursts (tpm/REF, rounded up)
        for (let i = 0; i < n; i++) {
          const t = a + i * step; if (t >= door) break;
          if (kind === "togo" && i % size === 0) bags += 1;
          ev.push([t, si, i, kind, i === 0 && DAY_WAVES.includes(kind) ? 1 : 0, kind === "togo" ? bags : 0]);
        }
      } else {
        const b = Math.min((m1 - t0) * tpm, door); let t = a, i = 0;
        while (t < b) {
          if (t >= 0) { if (kind === "togo" && i % size === 0) bags += 1; ev.push([t, si, i, kind, 0, kind === "togo" ? bags : 0]); i += 1; }
          t += step;
        }
      }
    });
    ev.sort((x, y) => (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2]));
    const gaps = [], kinds = [], wave = [], rest = [], bag = [];
    let prev = 0;
    for (const e of ev) {
      const t = Math.max(e[0], prev + 1);            // strictly increasing arrival ticks (>= tick 1)
      gaps.push(t - prev); prev = t;
      kinds.push(e[3]); wave.push(e[4]); rest.push(gaps[gaps.length - 1] * 100 >= DAY_LULL_GAP * drop_interval ? 1 : 0); bag.push(e[5]);
    }
    return { spec, t0, t1: spec.t1, gaps, kinds, wave, rest, bag, total: span, clocked: true, tpm };
  }
  const day_clocked = (s) => !!(s.cfg.sched && s.cfg.sched.clocked);
  function _day_bump_tick(s) {        // THE LATE BUMP (clocked): at the bump's wall-clock minute a hot shift keeps the pop going
    const sc = s.cfg.sched, b = sc.spec.bump;
    if (!b || s.ticks !== (b.at - sc.t0) * sc.tpm) return;
    if (s.combo_best < b.combo || s.waste > b.waste) return;
    const spec = Object.assign({}, sc.spec); delete spec.bump;
    spec.t1 = b.t1; spec.flow = sc.spec.flow.concat(b.flow);
    const nsc = _flow_compile(spec, s.cfg.drop_interval), added = nsc.gaps.length - sc.gaps.length;
    s.cfg.sched = nsc; s.cfg.orders += added; s.orders_left += added; s.service.day.bumped = 1;
    const k = s.service.nextId - 1;
    if (k < nsc.gaps.length) s.drop_t = nsc.gaps.slice(0, k + 1).reduce((a, x) => a + x, 0) - s.ticks + 1;
  }
  function day_compile(spec, drop_interval) {        // spec -> per-arrival tick gaps + kinds + wave/rest + bags
    if (spec.tpm) return _flow_compile(spec, drop_interval);
    const gaps = [], kinds = [], wave = [], rest = [], bag = [];
    let bags = 0;
    for (const seg of spec.segs) {
      const n = seg[0], gap = seg[1], kind = seg[2], pre = seg.length > 3 ? seg[3] : gap, size = seg.length > 4 ? seg[4] : TAKEOUT_BAG;
      for (let i = 0; i < n; i++) {
        const g = i === 0 ? pre : gap;
        if (kind === "togo" && i % size === 0) bags += 1;
        gaps.push(Math.max(1, Math.floor(drop_interval * g / 100)));
        kinds.push(kind); wave.push(i === 0 && DAY_WAVES.includes(kind) ? 1 : 0);
        rest.push(g >= DAY_LULL_GAP ? 1 : 0); bag.push(kind === "togo" ? bags : 0);
      }
    }
    const total = gaps.reduce((a, b) => a + b, 0) + Math.max(1, Math.floor(drop_interval * (spec.tail !== undefined ? spec.tail : DAY_TAIL) / 100));
    return { spec, t0: spec.t0, t1: spec.t1, gaps, kinds, wave, rest, bag, total };
  }
  const _day_gap = (s, k) => k < s.cfg.sched.gaps.length ? s.cfg.sched.gaps[k] : s.cfg.drop_interval;
  function day_clock(s) {            // minutes since midnight on the diner wall clock (null without a schedule)
    const sc = s.cfg.sched; if (!sc) return null;
    return sc.t0 + Math.floor((sc.t1 - sc.t0) * Math.min(s.ticks, sc.total) / sc.total);
  }
  function day_breather(s) {         // the next arrival is a long gap away (lull / between seatings) or none are left
    const sc = s.cfg.sched; if (!sc || !s.service) return false;
    const k = s.service.nextId - 1;
    return k >= sc.gaps.length || sc.rest[k] === 1;
  }
  function day_cue(s) {              // ticks until the next WAVE walks in, when within DAY_CUE; else -1
    const sc = s.cfg.sched; if (!sc || !s.service) return -1;
    const k = s.service.nextId - 1;
    return k < sc.gaps.length && sc.wave[k] === 1 && s.drop_t <= DAY_CUE ? s.drop_t : -1;
  }
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
  const Action = Object.freeze({ FLIP: "FLIP", CHEESE: "CHEESE", TOAST: "TOAST", ONION: "ONION" });   // ONION: the melts (Joe 1026)
  const Item = Object.freeze({ BURGER: "BURGER", GRILLED_CHEESE: "GRILLED_CHEESE", PATTY_MELT: "PATTY_MELT",
                               HAMBURGER: "HAMBURGER", DOUBLE_CHEESE: "DOUBLE_CHEESE",
                               SMASH: "SMASH", SMASH_MELT: "SMASH_MELT" });
  const RECIPES = {
    BURGER:         [Action.FLIP, Action.CHEESE],
    GRILLED_CHEESE: [Action.TOAST, Action.CHEESE],               // (phase 2: moves to the toaster)
    PATTY_MELT:     [Action.FLIP, Action.ONION, Action.CHEESE],  // flip, the onion mix, the Swiss; rye toasts on the TOASTER + joins
    HAMBURGER:      [Action.FLIP],                                // sear, flip, plate — no cheese
    DOUBLE_CHEESE:  [Action.FLIP, Action.FLIP, Action.CHEESE],    // two patties, then the cheese
    SMASH:          [Action.FLIP, Action.CHEESE],                 // smashed cheeseburger — same steps as BURGER but SLOW (ITEM_COOK)
    SMASH_MELT:     [Action.FLIP, Action.ONION, Action.CHEESE],   // smashed patty (1.5x), onions, Swiss, on rye + a toasted bun
  };
  // Items whose patty needs a TOASTED BUN off the toaster before it can be served (docs/BUN_TOASTER.md).
  // Their grill recipe is now identical to a BURGER's; a round with NONE of these never spins up a toaster.
  const TOAST_ITEMS = new Set([Item.PATTY_MELT, Item.SMASH_MELT]);
  // COOK QUALITY: steps each SIDE cooks face-down in the minimum-flip flow (BURGER [1,1], MELT [1,2],
  // HAMBURGER [1,0], DOUBLE [2,1]) and the minimum flips. Mirrors Python's SIDE_STEPS / MIN_FLIPS.
  const SIDE_STEPS = {}, MIN_FLIPS = {};
  for (const it of Object.keys(RECIPES)) {
    const n = [0, 0]; let down = 0, f = 0;
    for (const a of RECIPES[it]) { n[down] += 1; if (a === Action.FLIP) { down ^= 1; f += 1; } }
    SIDE_STEPS[it] = n; MIN_FLIPS[it] = f;
  }
  // Items that live ENTIRELY on the toaster — no patty, no grill slot (phase 2). GRILLED CHEESE cooks its
  // whole recipe on a toaster slot and Billy serves it off the toaster. A toaster entry is a Bun (no .stage)
  // or a Patty (a grilled cheese) — `isBun` tells them apart in the tick/serve/dump logic.
  const TOASTER_ITEMS = new Set([Item.GRILLED_CHEESE]);
  const isBun = (e) => e !== null && e.stage === undefined;
  const _ACTION_STAGE = { FLIP: Stage.SEAR_A, CHEESE: Stage.SEAR_B, TOAST: Stage.TOAST, ONION: Stage.SEAR_B };
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
  function sear_ready(p)    { return pyround(SEAR_READY * (ITEM_COOK[p.item] || 1) * (p.serviceScale || 1)); }
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
    return { stage, cook: 0, understeared: false, born, item, step: 0, bunned: false,   // ORDER VARIETY + toaster join
             flips: 0, down: 0, sear: [0, 0], off: 0, qsum: 0, qn: 0, qual: -1, grade: null, handed: false };   // COOK QUALITY
  }
  // A slice of bread toasting on the TOASTER. cook = ticks toasting (< TOAST_READY = not ready,
  // [TOAST_READY, TOAST_BURN) = READY, TOAST_BURN = BURNS). Mirrors Python's Bun.
  function Bun(born = 0, bread = null) { const b = { cook: 0, born }; if (bread !== null) b.bread = bread; return b; }

  function new_game(rnd = 1, mode = "family", players = 1, theme = "diner", grill = SLOTS, items = null, profile = "legacy", bread = false, drinks = false, sched = null) {
    // `grill` = the GRILL-SIZE lever (default SLOTS=6). Everything else reads s.slots.length, so a
    // non-6 grill is fully supported (the shift = grill size x headcount). `items` = the ORDER VARIETY
    // item sequence (default = all BURGER = today's coin-op run). Mirrors Python exactly.
    grill = Math.max(1, grill);                  // hardening: a grill is always >=1 slot (no empty-array indexing)
    const cfg = round_config(rnd, mode, players, items);
    if(profile === "service"){ cfg.drop_interval*=2; if(cfg.sear_burn<NEVER_BURN) cfg.sear_burn*=2; cfg.billy_drift/=2; cfg.billy_interval*=2; if(bread) cfg.bread=true; if(drinks) cfg.drinks=true; if(sched){ cfg.sched=day_compile(sched, cfg.drop_interval); if(cfg.sched.clocked) cfg.orders=cfg.sched.gaps.length; } }   // GAME CLOCK: the target = everyone who walks in
    const roster = [{ name: "PATTY", cursor: 0 }];
    if (players === 2) roster.push({ name: "CHRISSY", cursor: grill - 1 });
    if (cfg.bread) for (const r of roster) r.held = null;   // BREAD game: the bread in hand
    // The toaster spins up ONLY when this round's menu has a bun-item OR a toaster-item — else [] (identical).
    // BREAD game: every patty needs a bun, so it ALWAYS has the toaster (and the bread pans).
    const toaster = cfg.bread ? new Array(TOASTER_SLOTS_SERVICE).fill(null)
      : cfg.item_seq.some((it) => TOAST_ITEMS.has(it) || TOASTER_ITEMS.has(it))
      ? new Array(TOASTER_SLOTS).fill(null) : [];
    return {
      cfg, mode, theme, rnd, players: roster,
      ...(profile === "service" ? {service:{profile:"service",nextId:1,tickets:[],events:[],queue:[],waste:{totals:{pattyBuilds:0,breadPortions:0,onionPortions:0,cheeseSlices:0},events:[]},
        ...(cfg.drinks ? {drinks:{rail:new Array(DRINK_RAIL).fill(null),queue:[]}} : {}),
        ...(cfg.sched ? {day:Object.assign({late:0,wseen:0}, cfg.sched.clocked ? {bumped:0} : {})} : {})}} : {}),
      slots: new Array(grill).fill(null),
      toaster,
      pile: 0, orders_left: cfg.orders, score: 0, fails: 0, bun_fails: 0, wait: 0.0,
      billy: BILLY_FULL, billy_facing: 0, billy_turn_t: 0, billy_turn_to: 0, ticks: 0,
      dropped: 0,                                       // ORDER VARIETY: patties minted so far (indexes item_seq)
      drop_t: cfg.sched && cfg.sched.gaps.length ? cfg.sched.gaps[0] : cfg.drop_interval, billy_t: 0,
      served: 0, sent_back: 0, combo: 0, combo_best: 0,
      wait_sum: 0, wait_max: 0, over: false, won: false, flash: "", flash_t: 0,
      // COOK QUALITY + SHIFT POINTS (1112)
      waste: 0, waste_cost: 0, poor: 0, drink_late: 0, drinks_run: 0, fseen: 0, bfseen: 0,
      grades: { PERFECT: 0, GOOD: 0, OK: 0, UNDER: 0, OVER: 0 },
      pts: { grill: 0, service: 0, hustle: 0, nerve: 0 }, pops: [],
    };
  }

  // The next-round carry rule, in ONE place (the web cabinet AND the terminal loop both call it,
  // so progression can't drift between builds — and the session parity check proves it). Pure:
  // carry SCORE (+ any back-of-house bonus), ease the WAIT meter (WAIT_RELIEF), re-apply the shift's
  // levers (grill size, optional headcount quota). headcount=null leaves the round_config quota.
  function advance_round(s, grill = SLOTS, headcount = null, bonus = 0) {
    const next = new_game(s.rnd + 1, s.mode, s.players.length, s.theme, grill, s.cfg.item_seq, s.service ? "service" : "legacy", !!s.cfg.bread, !!s.cfg.drinks, s.cfg.sched ? s.cfg.sched.spec : null);
    if (headcount != null) { next.cfg.orders = headcount; next.orders_left = headcount; }
    next.score = s.score + bonus;
    next.wait = Math.max(0, s.wait - WAIT_RELIEF);
    return next;
  }

  const cursorOf = (s) => s.players[0].cursor;
  function _say(s, msg) { s.flash = msg; s.flash_t = TPS; }
  function _break_combo(s) { s.combo = 0; }
  // SERVICE profile: compressed cook clocks plus deterministic order/review evidence.
  // Legacy remains the default for archived references and their exact parity locks.
  const service_scale = (s) => s.service ? 2 : 1;
  const melt_done = (s) => MELT_DONE * service_scale(s);
  const _bread_on = (s) => !!s.service && !!s.cfg.bread;
  const toast_ready = (s) => _bread_on(s) ? TOAST_READY_BREAD : TOAST_READY * service_scale(s);
  const toast_burn = (s) => _bread_on(s) ? TOAST_BURN_BREAD : TOAST_BURN * service_scale(s);
  function cook_window(s, p) {
    const ready = p ? sear_ready(p) : SEAR_READY * service_scale(s);
    const burn = pyround(SEAR_BURN * (p ? ITEM_COOK[p.item] || 1 : 1) * service_scale(s));
    return { ready, idealStart: ready + Math.floor((burn-ready)*0.35),
      idealEnd: ready + Math.floor((burn-ready)*0.55), burn: s.cfg.sear_burn >= NEVER_BURN ? NEVER_BURN : burn,
      meltDone: melt_done(s), toastReady: toast_ready(s), toastBurn: toast_burn(s) };
  }
  // Seat index -> table-map id/label: 0..5 = B1..B6 / "BAR 1..6", 6..9 = T1..T4 / "TABLE 1..4".
  const seat_id = (i) => i < COUNTER_SEATS ? "B" + (i + 1) : "T" + (i - COUNTER_SEATS + 1);
  const seat_label = (i) => i < COUNTER_SEATS ? "BAR " + (i + 1) : "TABLE " + (i - COUNTER_SEATS + 1);
  // The bread a ticket is ordered on (deterministic): melts RYE; GC WHITE (odd id) / RYE; others SESAME (odd) / WHITE.
  function bread_for(item, id) {
    if (item === Item.PATTY_MELT || item === Item.SMASH_MELT) return "RYE";
    if (item === Item.GRILLED_CHEESE) return id % 2 === 1 ? "WHITE" : "RYE";
    return id % 2 === 1 ? "SESAME" : "WHITE";
  }
  // Legacy: only the melts need a bun. SERVICE: every grill item (it carries its ticket's bread); GC never.
  const _needs_bun = (p) => TOAST_ITEMS.has(p.item) || (p.bread != null && !TOASTER_ITEMS.has(p.item));
  const _item_needs_bun = (s, item) => TOAST_ITEMS.has(item) || (_bread_on(s) && !TOASTER_ITEMS.has(item));
  const needs_bun = (s, p) => !!p && !isBun(p) && _needs_bun(p);   // public: the UI asks the engine
  // What player pi's cursor is on. [0,G) grill c; [G,G+T) toaster c-G; [G+T,G+T+3) pan c-G-T (service only).
  function cursor_target(s, pi = 0) {
    if (pi >= s.players.length) return null;
    const c = s.players[pi].cursor, g = s.slots.length, t = s.toaster.length;
    if (c < g) return { kind: "grill", index: c };
    if (c < g + t) return { kind: "toaster", index: c - g };
    return { kind: "pan", index: c - g - t };
  }
  function _new_ticket(s) {
    const id=s.service.nextId++, item=s.cfg.item_seq[(id-1)%s.cfg.item_seq.length];
    const ticket={id,item,arrivedTick:s.ticks,placedTick:null,status:'queued',surface:null,slot:null,
      actions:[],rating:null,reason:null,servedTick:null,seat:SEAT_CYCLE[id%10],bread:bread_for(item,id),redo:0,
      drink:s.cfg.drinks?drink_for(id):null,drinkTick:null,drinkLate:false};
    let rounds = 1;
    if (s.cfg.sched) {                               // THE DAY: who this is (walk-in / seating / take-out / bar)
      const sc = s.cfg.sched, k = id - 1, kind = k < sc.kinds.length ? sc.kinds[k] : "walk", togo = kind === "togo";
      rounds = togo ? 0 : kind === "bar" ? BAR_ROUNDS : 1;
      Object.assign(ticket, { party: kind, togo, bag: k < sc.bag.length ? sc.bag[k] : 0, due: togo ? s.ticks + TAKEOUT_WINDOW : null, pickupLate: false });
      if (togo) ticket.drink = null;                 // take-out: no table, no drink run
      else if (s.cfg.drinks) Object.assign(ticket, { rounds, poured: 0, drinksOut: 0 });
    }
    s.service.tickets.push(ticket);
    if (s.cfg.drinks) for (let r = 0; r < (ticket.drink ? rounds : 0); r++) s.service.drinks.queue.push(id);
    return ticket;
  }
  function _ticket(s,p) { return s.service && p && s.service.tickets.find(t=>t.id===p.orderId); }
  // Count tracked station ingredients, never inferred purchase costs or unstarted orders.
  function _record_waste(s,p,cause) {
    if(!s.service||!p||p.wasteRecorded) return;
    const bun=isBun(p), ticket=bun?null:_ticket(s,p), actions=ticket?ticket.actions:[];
    const ingredients={pattyBuilds:bun||p.item===Item.GRILLED_CHEESE?0:1,
      breadPortions:bun||p.item===Item.GRILLED_CHEESE||p.bunned?1:0,
      onionPortions:actions.filter(a=>a.action===Action.ONION).length,
      cheeseSlices:actions.filter(a=>a.action===Action.CHEESE).length};
    p.wasteRecorded=true;
    const w=s.service.waste;
    for(const k of Object.keys(ingredients)) w.totals[k]+=ingredients[k];
    w.events.push({id:w.events.length+1,type:'waste',ticketId:ticket?ticket.id:null,
      tick:s.ticks,cause,ingredients,bread:p.bread??null});
  }
  function _record_action(s,p,action,cook,w) {
    const t=_ticket(s,p); if(!t) return;
    const late=w.burn>=NEVER_BURN ? pyround(SEAR_BURN*(ITEM_COOK[p.item]||1)*2) : w.burn;
    let quality=100;
    if(cook<w.ready) quality=20;
    else if(cook<w.idealStart) quality=75+Math.floor(25*(cook-w.ready)/Math.max(1,w.idealStart-w.ready));
    else if(cook>w.idealEnd) quality=Math.max(40,100-Math.floor(45*(cook-w.idealEnd)/Math.max(1,late-w.idealEnd)));
    t.actions.push({action,cook,ready:w.ready,idealStart:w.idealStart,idealEnd:w.idealEnd,burn:late,quality});
  }
  function _settle(s,p,outcome,ticket=null) {
    const t=ticket||_ticket(s,p); if(!t||t.rating!==null) return;
    if(outcome==='burnt'||outcome==='dropped'||outcome==='raw'||outcome==='wrong_bread') _record_waste(s,p,outcome);
    const ageTicks=s.ticks-t.arrivedTick, actions=t.actions, graded=!!p&&p.qual>=0;
    const cookScore=graded ? p.qual : actions.length ? Math.floor(actions.reduce((n,a)=>n+a.quality,0)/actions.length) : 0;
    const ideal=graded ? p.grade==="PERFECT" : actions.length>0 && actions.every(a=>a.cook>=a.idealStart&&a.cook<=a.idealEnd);
    const w=cook_window(s,p||{item:t.item,serviceScale:2});
    const target=RECIPES[t.item].length*w.idealEnd+w.meltDone+(_item_needs_bun(s,t.item)?w.toastReady:0)+TPS*3;
    const waitPenalty=Math.min(40,Math.floor(Math.max(0,ageTicks-target)/TPS)*2);
    const qualityScore=outcome==='served'?Math.max(0,cookScore-waitPenalty):0;
    let rating=outcome==='served'?Math.max(1,Math.min(ideal?5:4,Math.floor((qualityScore+19)/20))):1;
    let reasons;
    if(graded&&outcome==='served'){ const extra=Math.max(0,p.flips-MIN_FLIPS[p.item]);
      reasons=[p.grade+(['PERFECT','GOOD','OK'].indexOf(p.grade)!==-1?' cook':'COOKED'),
        p.flips+(p.flips===1?' flip':' flips')+(extra?' (+'+extra+' extra)':'')]; }
    else reasons=outcome==='served'?[ideal?'Ideal cook timing':'Cook timing outside ideal band']:
      [{raw:'Cooked too early',burnt:'Burnt order',dropped:'Dropped order',lost:'Order not served',wrong_bread:'Wrong bread',closed:'Still cooking at close'}[outcome]||'Order rejected'];
    if(waitPenalty) reasons.push('Long ticket wait (-'+waitPenalty+')');
    if(outcome==='served'&&t.redo) reasons.push('Redone x'+t.redo);
    if(outcome==='served'&&t.drink&&(t.drinkTick===null||t.drinkLate)){ rating=Math.max(1,rating-1);
      reasons.push(t.drinkTick!==null?'Drink came late':'No drink yet'); }
    if(outcome==='served'&&t.pickupLate){ rating=Math.max(1,rating-1); reasons.push('Pickup was late'); }   // THE DAY
    if(outcome==='lost'&&s.service.drinks){ const d=s.service.drinks;   // the customer walked: pull their drink
      d.queue=d.queue.filter(i=>i!==t.id); d.rail=d.rail.map(e=>e!==null&&e.id===t.id?null:e); }
    t.status=outcome==='served'?'served':'rejected';t.rating=rating;t.reason=reasons.join('; ');t.servedTick=s.ticks;
    s.service.events.push({id:t.id,type:'review',item:t.item,outcome,tick:s.ticks,ageTicks,rating,qualityScore,cookScore,waitPenalty,reasons});
  }
  // ---- COOK QUALITY / WASTE / SHIFT POINTS helpers (1112) — mirror Python ----
  function _pop(s, cat, label, pts, at = null) {
    if (s.pts[cat] !== undefined) s.pts[cat] += pts;
    s.pops.push({ t: s.ticks, cat, label, pts, at });
    if (s.pops.length > POPS_MAX) s.pops.shift();
  }
  function _q(t, r, i0, i1, late) {
    if (t < r) return Math.floor((70 * t) / Math.max(1, r));
    if (t < i0) return 75 + Math.floor((25 * (t - r)) / Math.max(1, i0 - r));
    if (t <= i1) return 100;
    return Math.max(30, 100 - Math.floor((50 * (t - i1)) / Math.max(1, late - i1)));
  }
  function grade_window(s, p) {     // [ready, idealStart, idealEnd, late] for ONE step/side of this item
    const sc = p.serviceScale || 1, ready = sear_ready(p), burn = pyround(SEAR_BURN * (ITEM_COOK[p.item] || 1) * sc);
    return [ready, ready + Math.floor((burn - ready) * 0.35), ready + Math.floor((burn - ready) * 0.55),
            s.cfg.sear_burn < NEVER_BURN ? burn : 2 * burn];
  }
  function _grade(s, p) {
    const [r, i0, i1, late] = grade_window(s, p);
    let raw = false, under = false, qual;
    if (TOASTER_ITEMS.has(p.item)) {
      qual = Math.floor(p.qsum / Math.max(1, p.qn)); raw = p.understeared && qual < 35; under = p.understeared;
    } else {
      const qs = [];
      for (const k of [0, 1]) {
        const n = SIDE_STEPS[p.item][k]; if (n === 0) continue;
        const t = p.sear[k]; qs.push(_q(t, n * r, n * i0, n * i1, n * late));
        if (t < n * r) { under = true; if (2 * t < n * r) raw = true; }
      }
      qual = Math.floor(qs.reduce((a, b) => a + b, 0) / qs.length);
    }
    const extra = Math.max(0, p.flips - MIN_FLIPS[p.item]);
    qual = Math.max(0, qual - FLIP_PENALTY * extra);
    p.qual = qual;
    p.grade = raw ? "RAW" : (qual >= GRADE_PERFECT && extra === 0) ? "PERFECT" : qual >= GRADE_GOOD ? "GOOD"
            : qual >= GRADE_OK ? "OK" : under ? "UNDER" : "OVER";
    return p.grade;
  }
  function _waste(s, p, cause, msg, at = null) {   // the WASTE TALLY: cost + fail + REDO (caller cleared the slot)
    s.fails += 1; s.waste += 1; s.waste_cost += WASTE_COST; s.score = Math.max(0, s.score - WASTE_COST);
    _break_combo(s); _say(s, msg);
    _pop(s, "waste", "WASTE -" + WASTE_COST, -WASTE_COST, at);
    const t = _ticket(s, p);
    if (t && t.rating === null) {
      _record_waste(s, p, cause);
      t.status = "queued"; t.placedTick = null; t.actions = []; t.redo += 1;
      s.service.queue.unshift(t); s.pile += 1;
    }
  }
  function finalize_service(s) {
    if(!s.service||s.service.closed) return;
    for(const p of s.slots.concat(s.toaster)) if(p) _record_waste(s,p,'discarded');
    const closing=!!(s.cfg.sched&&s.cfg.sched.clocked&&s.won);   // GAME CLOCK: still in flight when the doors closed
    for(const t of s.service.tickets) if(t.rating===null) _settle(s,null,closing?"closed":"lost",t);
    s.service.closed=true;
  }
  function order_receipts(s) {
    if(!s.service) return [];
    const active=s.slots.concat(s.toaster).filter(p=>p&&!isBun(p));
    return s.service.tickets.filter(t=>t.rating===null).map(t=>{
      const p=active.find(p=>p.orderId===t.id), w=cook_window(s,p||{item:t.item,serviceScale:2});
      const at=s.slots.indexOf(p), ti=s.toaster.indexOf(p);
      const nextAction=!p?'WAIT':p.stage===Stage.DONE?(_needs_bun(p)&&!p.bunned?'TOAST BUN':'SERVE'):
        p.stage===Stage.MELT?'MELT':RECIPES[p.item][p.step]||'SERVE';
      const needs=_item_needs_bun(s,t.item), joined=!!(p&&p.bunned), buns=s.toaster.filter(b=>isBun(b)&&b.bread===t.bread);
      return {...t,recipe:RECIPES[t.item].slice(),needsBun:needs,bunJoined:joined,
        bunReady:needs&&!joined&&buns.some(b=>b.cook>=toast_ready(s)&&b.cook<toast_burn(s)),
        bunToasting:needs&&!joined&&buns.some(b=>b.cook<toast_ready(s)),status:!p?'queued':p.stage===Stage.DONE?'ready':'cooking',
        surface:p?(at>=0?'grill':'toaster'):null,slot:p?(at>=0?at:ti):null,nextAction,ageTicks:s.ticks-t.arrivedTick,
        cookTicks:p?p.cook:0,remainingTicks:p?Math.max(0,(p.stage===Stage.MELT?w.meltDone:w.ready)-p.cook):0,
        ready:!!p&&(p.stage===Stage.DONE||p.cook>=w.ready),window:w};
    });
  }

  const _ready = (p) => p.cook >= sear_ready(p);

  const _peek_item = (s) => s.cfg.item_seq[s.dropped % s.cfg.item_seq.length];   // next order's item (no consume)
  function _mint(s, item, ticket=null) { s.dropped += 1; const p=Patty(ticket?ticket.arrivedTick:s.ticks, item, _ACTION_STAGE[RECIPES[item][0]]); if(s.service){ const t=ticket||_new_ticket(s);p.orderId=t.id;p.serviceScale=2;t.placedTick=s.ticks;t.status="cooking"; if(s.cfg.bread&&!TOASTER_ITEMS.has(item)) p.bread=t.bread; } return p; }
  function _new_patty(s) { return _mint(s, _peek_item(s)); }   // grill-slot mint (back-compat)

  // Place the NEXT order on its REQUIRED surface if there's room (GRILLED CHEESE -> a toaster slot, else a
  // grill slot). Head-of-line: if the surface is full it's not placed. For a grill-only menu this is exactly
  // 'fill the first empty grill slot', so all-burger stays byte-identical. Mirrors Python's _place_next.
  function _place_next(s, ticket=null) {
    const item = ticket?ticket.item:_peek_item(s);
    if (TOASTER_ITEMS.has(item)) {
      const ti = s.toaster.findIndex((b) => b === null);
      if (ti === -1) return false;
      s.toaster[ti] = _mint(s, item, ticket); return true;
    }
    let gi = s.slots.findIndex((sl) => sl === null);
    if (gi === -1) return false;
    if (s.cfg.alt_deal && s.players.length === 2) {   // MELTDOME FAIR DEAL (opt-in, cfg.alt_deal): this order's half first
      const want = s.dropped % 2, f = _zone_of(s, want).concat(_zone_of(s, 1 - want)).find((j) => s.slots[j] === null);
      if (f !== undefined) gi = f;                    // (off = first free slot, byte-identical). Mirrors Python.
    }
    s.slots[gi] = _mint(s, item, ticket); return true;
  }
  function _place_from_pile_or_drop(s) {               // drain the pile in sequence order (head-of-line)
    while (s.pile > 0 && _place_next(s, s.service?s.service.queue[0]:null)){ s.pile -= 1;if(s.service)s.service.queue.shift(); }
  }

  function move(s, d, pi = 0) {
    // The cursor spans the grill AND the toaster: [0, slots.length) = grill, then the toaster slots.
    // With no toaster (all-burger) the range is exactly the grill, so clamping is byte-identical.
    if (pi < s.players.length) {
      const c = s.players[pi].cursor;
      const pans = _bread_on(s) ? BREADS.length : 0;    // SERVICE: the bread pans are stops past the toaster
      s.players[pi].cursor = Math.max(0, Math.min(s.slots.length + s.toaster.length + pans - 1, c + d));
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
    if (p.cook < sear_ready(p)) p.understeared = true;            // acted early — NOT sent back: it grades lower (1112)
    if(s.service) _record_action(s,p,action,p.cook,cook_window(s,p));
    const [r, i0, i1, late] = grade_window(s, p);
    p.qsum += _q(p.cook, r, i0, i1, late); p.qn += 1;             // per-step quality (grades toaster items)
    if (action === Action.FLIP) { p.flips += 1; p.down ^= 1; p.off = p.cook; }   // recipe flip: other side down
    p.step += 1;
    p.stage = (p.step < RECIPES[p.item].length) ? _ACTION_STAGE[RECIPES[p.item][p.step]] : Stage.MELT;
    p.cook = 0; _say(s, msg);
    if (p.stage === Stage.MELT) {                                 // the sear is over -> stamp the grade
      const surf = cont === s.slots ? "grill" : "toaster", g = _grade(s, p);
      if (g === "RAW") { cont[i] = null; _waste(s, p, "raw", "RAW! WASTED", [surf, i]); }
      else if (g === "PERFECT" || g === "GOOD" || g === "OK") _pop(s, "grill", g + (g !== "OK" ? "!" : ""), PTS[g], [surf, i]);
      else _pop(s, "grill", g + "COOKED", 0, [surf, i]);
    }
  }
  // FLIP: on a grill patty whose next step is NOT a flip, an EXTRA flip — the other side goes back down and
  // RESUMES its step clock (rescue an early flip), at FLIP_PENALTY per extra flip. Mirrors Python.
  function flip(s, pi = 0) {
    const [cont, i] = _target(s, pi), p = cont === s.slots ? cont[i] : null;
    if (p && !TOASTER_ITEMS.has(p.item) && (p.stage === Stage.SEAR_A || p.stage === Stage.SEAR_B) && RECIPES[p.item][p.step] !== Action.FLIP) {
      p.flips += 1; p.down ^= 1; const c = p.cook; p.cook = p.off; p.off = c; _say(s, "FLIP!"); return;
    }
    _act(s, pi, Action.FLIP, "FLIP!");
  }
  function add_cheese(s, pi = 0) {   // the TOPPING button: on a melt whose next step is the onion mix it lays the ONIONS first
    const [cont, i] = _target(s, pi), p = cont !== null ? cont[i] : null;
    if (p !== null && !isBun(p) && p.step < RECIPES[p.item].length && RECIPES[p.item][p.step] === Action.ONION) { _act(s, pi, Action.ONION, "ONIONS!"); return; }
    _act(s, pi, Action.CHEESE, "CHEESE!");
  }
  // Context-aware TOAST (the `X` button): an EMPTY toaster slot -> start a bun for a melt; a toaster slot with
  // a GRILLED CHEESE cooking -> advance its in-toaster toast step; a grill slot -> a harmless no-op (nothing
  // on the grill toasts anymore). Mirrors Python.
  function toast(s, pi = 0) {
    if (_bread_on(s)) { _toast_service(s, pi); return; }
    const [cont, i] = _target(s, pi);
    if (cont === s.toaster && i >= 0) {
      const entry = cont[i];
      if (entry === null) { s.toaster[i] = Bun(s.ticks); _say(s, "TOAST!"); return; }
      if (!isBun(entry)) { _act(s, pi, Action.TOAST, "TOAST!"); }   // a grilled cheese toasting on the toaster
      return;                                                        // a Bun already toasting — no-op
    }
    _act(s, pi, Action.TOAST, "TOAST!");
  }

  // SERVICE X button: a PAN -> pick up that bread; an EMPTY toaster slot -> lay the held bread toasting (nothing
  // held = GRAB BREAD!); a grilled cheese whose next step is TOAST -> toast it on the held bread (wrong bread =
  // sent back at the pass); anything else = no-op. Mirrors Python's _toast_service.
  function _toast_service(s, pi) {
    const tgt = cursor_target(s, pi);
    if (tgt === null) return;
    const pl = s.players[pi];
    if (tgt.kind === "pan") {
      if (tgt.index < BREADS.length) { pl.held = BREADS[tgt.index]; _say(s, pl.held + "!"); }
      return;
    }
    if (tgt.kind === "toaster") {
      const i = tgt.index, entry = s.toaster[i];
      if (entry === null) {
        if (pl.held == null) { _say(s, "GRAB BREAD!"); return; }
        s.toaster[i] = Bun(s.ticks, pl.held); pl.held = null; _say(s, "TOAST!"); return;
      }
      if (!isBun(entry) && entry.step < RECIPES[entry.item].length && RECIPES[entry.item][entry.step] === Action.TOAST) {
        if (pl.held == null) { _say(s, "GRAB BREAD!"); return; }
        const bread = pl.held;
        _act(s, pi, Action.TOAST, "TOAST!");
        entry.bread = bread; pl.held = null;
        const t = _ticket(s, entry);
        if (t && bread !== t.bread) entry.wrongBread = true;
      }
      return;
    }
    _act(s, pi, Action.TOAST, "TOAST!");                 // a grill slot: nothing toasts there (no-op)
  }

  // 2-UP CO-OP actions: DROP (sacrifice a jammed slot) + HANDOFF (pass to your partner). Mirror Python.
  // The auto-player never calls these → locked R1 numbers untouched. Deterministic / parity-safe.
  function drop(s, pi = 0) {
    if (pi >= s.players.length) return;
    const i = s.players[pi].cursor;
    if (i >= s.slots.length || s.slots[i] === null) return;   // nothing to sacrifice on the toaster / empty slot
    const p = s.slots[i]; s.slots[i] = null;
    _waste(s, p, "dropped", "DROPPED!", ["grill", i]);          // a sacrifice is still WASTE (+ the ticket is redone)
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
    if (!pat.handed) { pat.handed = true; _pop(s, "hustle", "HANDOFF", PTS.HANDOFF, ["grill", best]); }
  }
  function hey_billy(s, pi = 0) {
    if (pi >= s.players.length) return;
    if (s.billy < s.cfg.billy_serve_min && (_zone_of(s, pi).some((i) => _servable(s.slots[i])) || s.toaster.some((e) => _servable(e))))
      _pop(s, "hustle", "WAKE-UP CALL", PTS.WAKE_UP);              // HUSTLE: holler when he'd drifted AND food waits
    s.billy = BILLY_FULL;
    if (s.players.length < 2) {
      s.billy_facing = pi;
    } else if (pi !== s.billy_facing && !(s.billy_turn_t > 0 && s.billy_turn_to === pi)) {
      s.billy_turn_to = pi; s.billy_turn_t = TURN_LATENCY * service_scale(s);   // start a swing (repeats don't reset)
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
        p.sear[p.down] += 1;                            // COOK QUALITY: the face-down side sears
        if (p.cook >= sear_burn_of(s, p)) {             // per-item burn window (SMASH items burn later)
          p.stage = Stage.BURNT; s.slots[i] = null; _waste(s, p, "burnt", "BURNT!", ["grill", i]);   // WASTE + redo
        }
      } else if (p.stage === Stage.MELT) {
        if (p.cook >= melt_done(s)) { p.stage = Stage.DONE; p.cook = 0; }
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
        if (e.cook >= toast_burn(s) && _bread_on(s) && s.cfg.sear_burn >= NEVER_BURN) {   // SERVICE KIDS: never burns —
          _record_waste(s,e,"stale"); s.toaster[ti] = null; _say(s, "STALE BUN");      // an unclaimed bun goes stale (no fail)
        } else if (e.cook >= toast_burn(s)) { _record_waste(s,e,"burnt");s.toaster[ti] = null; s.fails += 1; s.bun_fails += 1; _break_combo(s); _say(s, "BUN BURNT!"); }
      } else if (_ACTIVE_STAGES.indexOf(e.stage) !== -1) {   // a grilled cheese mid-cook (TOAST / CHEESE step)
        if (e.cook >= sear_burn_of(s, e)) { e.stage = Stage.BURNT; s.toaster[ti] = null; _waste(s, e, "burnt", "BURNT!", ["toaster", ti]); }
      } else if (e.stage === Stage.MELT) {
        if (e.cook >= melt_done(s)) { e.stage = Stage.DONE; e.cook = 0; }   // finished grilled cheese jams the slot
      }
    }
  }
  function _assembly_tick(s) {          // the AUTOMATIC join: a finished melt claims the first READY bun
    for (const p of s.slots) {
      if (p === null || p.stage !== Stage.DONE || !_needs_bun(p) || p.bunned) continue;
      for (let ti = 0; ti < s.toaster.length; ti++) {
        const b = s.toaster[ti];
        if (isBun(b) && b.cook >= toast_ready(s) && b.cook < toast_burn(s) && (!_bread_on(s) || b.bread === p.bread)) { if(s.service){const r=toast_ready(s),bmax=toast_burn(s);_record_action(s,p,"BUN",b.cook,{ready:r,idealStart:r+Math.floor((bmax-r)*0.35),idealEnd:r+Math.floor((bmax-r)*0.55),burn:bmax});}p.bunned = true; s.toaster[ti] = null; break; }
      }
    }
  }
  // A DONE item Billy can run: a finished Patty EXCEPT a toast-item still waiting on its bun. (A Bun never
  // serves directly — it joins a melt.)
  const _servable = (p) => p !== null && !isBun(p) && p.stage === Stage.DONE && (!_needs_bun(p) || p.bunned);
  function _do_serve(s, p, at = null) {   // ring up by COOK GRADE (1112) + shift points — mirrors Python
    if (p.wrongBread) { _waste(s, p, "wrong_bread", "WRONG BREAD!", at); return; }
    const g = p.grade || "GOOD";
    const wait = s.ticks - p.born;
    s.wait_sum += wait; s.wait_max = Math.max(s.wait_max, wait);
    s.served += 1; s.orders_left = Math.max(0, s.orders_left - 1);
    s.grades[g] = (s.grades[g] || 0) + 1;
    const [r, i0, i1, late] = grade_window(s, p);
    const target = RECIPES[p.item].length * i1 + melt_done(s) + (_item_needs_bun(s, p.item) ? toast_ready(s) : 0) + TPS * 3;
    if (wait <= target) _pop(s, "service", "ON TIME", PTS.ON_TIME, at);
    if (!s.slots.concat(s.toaster).some((q) => q !== null && !isBun(q) && q.born < p.born)) _pop(s, "service", "IN ORDER", PTS.IN_ORDER, at);
    if (buried_index(s) >= BURIED_RESTLESS) _pop(s, "hustle", "CLUTCH", PTS.CLUTCH, at);
    if (g === "UNDER" || g === "OVER") {
      s.poor += 1; _break_combo(s); s.score += Math.floor(ITEM_PAY[p.item] / 2); _say(s, g + "COOKED!");
    } else {
      s.combo += 1; s.combo_best = Math.max(s.combo_best, s.combo);
      s.score += (ITEM_PAY[p.item] + GRADE_BONUS[g]) * combo_mult(s.combo);
      if (s.combo >= COMBO_PER_MULT) _pop(s, "nerve", "STREAK x" + combo_mult(s.combo), PTS.STREAK * combo_mult(s.combo), at);
      if (s.combo === FLOW_COMBO) { _say(s, "BIG GRILL ENERGY!"); _pop(s, "nerve", "BIG GRILL ENERGY", PTS.BGE, at); }
    }
    _settle(s, p, "served");
  }
  function _drink_tick(s) {          // DRINKS: pour the rail, refill from the queue, mark LATE drinks (once)
    const d = s.service ? s.service.drinks : null;
    if (!d) return;
    for (const e of d.rail) if (e !== null && e.pour < DRINK_POUR[e.drink]) e.pour += 1;
    for (let k = 0; k < d.rail.length; k++) {
      if (d.rail[k] === null && d.queue.length) {
        const id = d.queue.shift(), t = s.service.tickets.find((t) => t.id === id);
        let drink = t.drink;
        if (t.poured !== undefined) { if (t.poured > 0) drink = drink_for(id + 2 * t.poured); t.poured += 1; }   // THE DAY: a round
        d.rail[k] = { id, drink, pour: 0 };
      }
    }
    for (const t of s.service.tickets)
      if (t.drink && t.drinkTick === null && !t.drinkLate && t.status !== "rejected" && s.ticks - t.arrivedTick > DRINK_PATIENCE) { t.drinkLate = true; s.drink_late += 1; }
  }
  function _run_drink(s) {           // Billy's drink run: the first POURED drink goes to its seat
    const d = s.service ? s.service.drinks : null;
    if (!d) return false;
    for (let k = 0; k < d.rail.length; k++) {
      const e = d.rail[k];
      if (e !== null && e.pour >= DRINK_POUR[e.drink]) {
        d.rail[k] = null;
        const t = s.service.tickets.find((t) => t.id === e.id);
        if (t.drinksOut !== undefined) { t.drinksOut += 1; if (t.drinksOut >= t.rounds) t.drinkTick = s.ticks; }   // THE DAY: the round lands with its last drink
        else t.drinkTick = s.ticks;
        s.drinks_run += 1;
        if (t.drinkLate) _pop(s, "service", "LATE DRINK", PTS.DRINK_LATE, ["rail", k, e.id]);
        else _pop(s, "service", "DRINK RUN", PTS.DRINK, ["rail", k, e.id]);
        return true;
      }
    }
    return false;
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
    if (_run_drink(s)) { s.billy_t = Math.max(1, Math.floor(s.cfg.billy_interval / DRINK_BEAT)); return; }   // DRINKS first — a quick run (1/DRINK_BEAT beat)
    for (const i of _billy_zone(s)) {            // grill first
      const p = s.slots[i];
      if (!_servable(p)) continue;                 // skip empties, unfinished, and un-bunned melts (they jam)
      s.slots[i] = null; _do_serve(s, p, ["grill", i]); _bag_beat(s, p); return;
    }
    for (let ti = 0; ti < s.toaster.length; ti++) {   // then a finished GRILLED CHEESE off the toaster (shared)
      const e = s.toaster[ti];
      if (!_servable(e)) continue;
      s.toaster[ti] = null; _do_serve(s, e, ["toaster", ti]); _bag_beat(s, e); return;
    }
  }
  function _bag_beat(s, p) {         // THE DAY: a take-out is bagged onto the pickup shelf — a quicker beat (no table walk)
    if (!s.cfg.sched) return;
    const t = _ticket(s, p);
    if (t && t.togo && t.status === "served") s.billy_t = Math.max(1, Math.floor(s.cfg.billy_interval / BAG_BEAT));
  }
  function _day_tick(s) {            // THE DAY: a take-out not bagged by its quoted pickup time goes LATE (once)
    if (!(s.service && s.cfg.sched)) return;
    if (s.cfg.sched.clocked) _day_bump_tick(s);      // GAME CLOCK: THE LATE BUMP (a hot lunch keeps going)
    for (const t of s.service.tickets)
      if (t.togo && t.rating === null && !t.pickupLate && s.ticks > t.due) { t.pickupLate = true; s.service.day.late += 1; }
  }
  function _drop_tick(s) {
    s.drop_t -= 1;
    if (s.drop_t > 0) return;
    s.drop_t = s.cfg.drop_interval;
    if(s.service){
      if(s.cfg.sched&&s.cfg.sched.clocked){ if(s.service.nextId-1>=s.cfg.sched.gaps.length) return; }   // GAME CLOCK: the flow is spent
      else if(s.service.tickets.filter(t=>t.rating===null).length>=s.orders_left) return;
      const t=_new_ticket(s);
      if(s.cfg.sched) s.drop_t=_day_gap(s,t.id);   // THE DAY: the gap before the NEXT arrival (the curve)
      if(s.service.queue.length||!_place_next(s,t)){
        if(s.pile>=s.cfg.pile_max){_settle(s,null,"lost",t);s.fails++;_break_combo(s);_say(s,"ORDER LOST!");}
        else {s.service.queue.push(t);s.pile++;}
      }
      return;
    }
    if (!_place_next(s)) {                        // place the next order on its surface (grill / toaster)
      s.pile += 1;
      if (s.pile > s.cfg.pile_max) { s.pile = s.cfg.pile_max; s.fails += 1; _break_combo(s); _say(s, "ORDER LOST!"); }
    }
  }
  function tick(s) {
    if (s.over || s.won || (s.service && s.service.closed)) return;
    s.ticks += 1;
    if (s.flash_t > 0) { s.flash_t -= 1; if (s.flash_t === 0) s.flash = ""; }
    const f0 = s.fseen, bf0 = s.bfseen, pr0 = s.poor, dl0 = s.drink_late;   // fails since the LAST tick (1112)
    const lt0 = s.service && s.service.day ? s.service.day.late : 0;
    _cook_tick(s);
    _toaster_tick(s);       // buns advance / burn
    _assembly_tick(s);      // finished patties claim ready buns (auto-join)
    _drink_tick(s);         // DRINKS: pour the rail / late drinks (no-op unless cfg.drinks)
    _day_tick(s);           // THE DAY: late take-out pickups (no-op unless cfg.sched)
    _billy_tick(s); _drop_tick(s); _place_from_pile_or_drop(s);
    // THE WEEDS: integrate buried pressure over COMFORT, spike on new fails, clamp 0..FULL. A burnt BUN
    // spikes SOFTER (BUN_SPIKE) than a burnt/walked/sent patty (WAIT_SPIKE). With no toaster, bun_fails
    // never moves, so this reduces to exactly WAIT_SPIKE*(new fails) — byte-identical.
    const delta = buried_index(s) - WAIT_COMFORT;
    let rate = delta > 0 ? WAIT_RATE_UP : WAIT_RATE_DOWN;
    if (delta <= 0 && day_breather(s)) rate = rate * DAY_RECOVER;   // THE DAY: a lull / between seatings
    s.wait += rate * delta / service_scale(s);
    const new_bun = s.bun_fails - bf0;
    const day = s.service ? s.service.day : undefined;
    if (day) {                       // THE DAY: waste = a redo (half spike); a late pickup = a complaint
      const nw = s.waste - day.wseen; day.wseen = s.waste;
      s.wait += WAIT_SPIKE * Math.max(0, (s.fails - f0) - new_bun - nw) + BUN_SPIKE * Math.max(0, new_bun) + WASTE_SPIKE * nw;
      s.wait += TAKEOUT_SPIKE * (day.late - lt0);
    } else s.wait += WAIT_SPIKE * Math.max(0, (s.fails - f0) - new_bun) + BUN_SPIKE * Math.max(0, new_bun);
    s.wait += POOR_SPIKE * (s.poor - pr0) + DRINK_SPIKE * (s.drink_late - dl0);   // complaints (0 for the auto-player)
    s.wait = Math.max(0, Math.min(WAIT_FULL, s.wait));
    s.fseen = s.fails; s.bfseen = s.bun_fails;
    if (s.cfg.sched && s.cfg.sched.clocked) {             // GAME CLOCK: survive to close (the quota never ends it)
      if (s.wait >= WAIT_FULL) s.over = true; else if (s.ticks >= s.cfg.sched.total) s.won = true;
    } else if (s.orders_left <= 0) s.won = true;
    else if (s.wait >= WAIT_FULL) s.over = true;          // IN THE WEEDS — the WAIT meter is the loss now
    if(s.won&&s.service) finalize_service(s);

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
    if (_bread_on(s)) { _auto_step_service(s); return; }   // BREAD games: bread pans + bread-matched buns
    for (let pi = 0; pi < s.players.length; pi++) {
      const zone = _zone_of(s, pi);
      // a SERVABLE done worth a holler — my grill zone, or the shared toaster (grilled cheese). In 2P only
      // cook 0 "owns" toaster hollering so the two cooks don't thrash Billy. (Grill/melt rounds: buns aren't
      // servable, so the toaster term is always false → byte-identical.)
      const my_done = zone.some((i) => _servable(s.slots[i])) ||
        ((s.players.length < 2 || pi === 0) && s.toaster.some((e) => _servable(e)));
      const billy_here = s.players.length < 2 || s.billy_facing === pi;
      const partner_serving = s.service && !billy_here && (s.billy_turn_t>0 || _zone_of(s,s.billy_facing).some(i=>_servable(s.slots[i])));
      if (my_done && !partner_serving && (s.billy < s.cfg.billy_serve_min + 12 || !billy_here)) { hey_billy(s, pi); continue; }
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
      if (act === Action.FLIP) flip(s, pi); else if (act === Action.CHEESE || act === Action.ONION) add_cheese(s, pi); else toast(s, pi);
    }
  }
  // SERVICE autoplayer — mirrors Python's _auto_step_service EXACTLY (see its docstring).
  function _auto_step_service(s) {
    const g = s.slots.length, t = s.toaster.length, pan0 = g + t;
    for (let pi = 0; pi < s.players.length; pi++) {
      const pl = s.players[pi], zone = _zone_of(s, pi);
      const my_done = zone.some((i) => _servable(s.slots[i])) ||
        ((s.players.length < 2 || pi === 0) && s.toaster.some((e) => _servable(e)));
      const billy_here = s.players.length < 2 || s.billy_facing === pi;
      const partner_serving = !billy_here && (s.billy_turn_t > 0 || _zone_of(s, s.billy_facing).some((i) => _servable(s.slots[i])));
      if (my_done && !partner_serving && (s.billy < s.cfg.billy_serve_min + 12 || !billy_here)) { hey_billy(s, pi); continue; }
      const others = s.players.filter((q, k) => k !== pi).map((q) => q.held);
      // 1) a GRILLED CHEESE ready for its TOAST step: bring its ticket's bread, then toast it
      let gc_i = -1;
      for (let ti = 0; ti < s.toaster.length; ti++) {
        const e = s.toaster[ti];
        if (e !== null && !isBun(e) && e.stage === Stage.TOAST && _ready(e)) {
          const tk = _ticket(s, e);
          if (tk && (pl.held === tk.bread || others.indexOf(tk.bread) === -1)) { gc_i = ti; break; }
        }
      }
      if (gc_i >= 0) {
        const need = _ticket(s, s.toaster[gc_i]).bread;
        pl.cursor = pl.held === need ? g + gc_i : pan0 + BREADS.indexOf(need);
        toast(s, pi); continue;
      }
      // 2) BUNS: per bread, melting/finished patties still unbunned vs buns of that bread on the toaster
      const deficit = {}; for (const b of BREADS) deficit[b] = 0;
      const order = [];
      for (const p of s.slots) if (p !== null && _needs_bun(p) && !p.bunned && (p.stage === Stage.MELT || p.stage === Stage.DONE)) { deficit[p.bread] += 1; order.push(p.bread); }
      for (const e of s.toaster) if (isBun(e)) deficit[e.bread] -= 1;
      const free = s.toaster.findIndex((e) => e === null);
      if (free !== -1) {
        if (pl.held != null && deficit[pl.held] > 0) { pl.cursor = g + free; toast(s, pi); continue; }
        const want = order.find((b) => deficit[b] - others.filter((h) => h === b).length > 0);
        if (want !== undefined) { pl.cursor = pan0 + BREADS.indexOf(want); toast(s, pi); continue; }
      }
      // 3) COOK the most-urgent READY grill patty in my zone (grilled cheese CHEESE steps too)
      let bestCont = null, bestI = -1, best_cook = -1;
      for (const i of zone) {
        const p = s.slots[i];
        if (p && _ACTIVE_STAGES.indexOf(p.stage) !== -1 && _ready(p) && p.cook > best_cook) { bestCont = s.slots; bestI = i; best_cook = p.cook; }
      }
      for (let ti = 0; ti < s.toaster.length; ti++) {
        const e = s.toaster[ti];
        if (e !== null && !isBun(e) && (e.stage === Stage.SEAR_A || e.stage === Stage.SEAR_B) && _ready(e) && e.cook > best_cook) { bestCont = s.toaster; bestI = ti; best_cook = e.cook; }
      }
      if (bestCont === null) continue;
      pl.cursor = bestCont === s.slots ? bestI : g + bestI;
      const p = bestCont[bestI];
      if (RECIPES[p.item][p.step] === Action.FLIP) flip(s, pi); else add_cheese(s, pi);
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

    // COOK QUALITY (1112) — mirrors Python selftest 3b
    const j = new_game(1, "arcade");
    j.slots[0] = Patty(0); flip(j); add_cheese(j);
    ok("rushed burger = RAW = WASTE (not sent back)", j.slots[0] === null && j.waste === 1 && j.sent_back === 0 && j.fails === 1 && j.served === 0);
    {
    const [, gi0] = grade_window(j, Patty());
    const pf = new_game(1, "arcade"); pf.slots[0] = Patty(0); let pq = pf.slots[0];
    for (let k = 0; k < gi0; k++) _cook_tick(pf); flip(pf); for (let k = 0; k < gi0; k++) _cook_tick(pf); add_cheese(pf);
    ok("ideal + one flip = PERFECT", pq.grade === "PERFECT" && pq.flips === 1 && pf.pts.grill === PTS.PERFECT);
    const ef = new_game(1, "arcade"); ef.slots[0] = Patty(0); pq = ef.slots[0];
    for (let k = 0; k < 8; k++) _cook_tick(ef); flip(ef);
    let eok = ef.slots[0] === pq && pq.understeared && pq.down === 1;
    for (let k = 0; k < gi0; k++) _cook_tick(ef); flip(ef);
    eok = eok && pq.flips === 2 && pq.down === 0 && pq.cook === 8 && pq.sear[0] === 8 && pq.sear[1] === gi0;
    for (let k = 0; k < gi0 - 8; k++) _cook_tick(ef); add_cheese(ef);
    ok("early flip rescued by ONE extra flip -> GOOD (penalised)", eok && pq.qual === 100 - FLIP_PENALTY && pq.grade === "GOOD", pq.qual + " " + pq.grade);
    const sv = new_game(1, "family", 1, "diner", 6, null, "service"); sv.drop_t = 1; tick(sv); sv.drop_t = 1e8;
    const sp = sv.slots.find(Boolean), sid = sp.orderId; sp.cook = sear_burn_of(sv, sp) - 1; tick(sv);
    const stk = sv.service.tickets.find((t) => t.id === sid);
    ok("service: burnt = WASTE + REDO", sv.waste === 1 && stk.redo === 1 && stk.rating === null && sv.service.events.length === 0 &&
      sv.slots.some((x) => x && x.orderId === sid && x !== sp) && sv.score === 0 && sv.waste_cost === WASTE_COST);
    // DRINKS (opt-in) — mirrors Python
    const dk = new_game(1, "family", 1, "diner", SLOTS, ITEMS_BURGER, "service", true, true);
    dk.drop_t = 1; tick(dk); dk.drop_t = 1e8; const t1 = dk.service.tickets[0]; _drink_tick(dk);
    let dok = dk.cfg.drinks && advance_round(dk).cfg.drinks && t1.drink === "WATER" && dk.service.drinks.rail[0].id === 1;
    for (let k = 0; k < DRINK_POUR.WATER; k++) _drink_tick(dk);
    dk.billy = BILLY_FULL; dk.billy_t = 1; dk.slots[0].stage = Stage.DONE; _billy_tick(dk);
    dok = dok && t1.drinkTick === dk.ticks && dk.drinks_run === 1 && dk.slots[0] !== null && dk.pts.service === PTS.DRINK;
    for (const m of Object.keys(MODES)) {
      const dd = new_game(1, m, 1, "diner", SLOTS, ITEMS_FULL_MENU, "service", true, true);
      while (!(dd.won || dd.over) && dd.ticks < 8000) { auto_step(dd); tick(dd); }
      if (!(dd.won && dd.drinks_run > 0)) dok = false;
    }
    ok("drinks: rail pours, Billy runs a drink before food, auto clears R1 with drinks", dok);
    // THE DAY (1112, opt-in cfg.sched) — mirrors the Python selftest block
    {
      const spec = { t0: 660, t1: 720, segs: [[2, 100, "walk", 50], [3, 40, "seat", 200], [2, 50, "togo", 160], [1, 100, "bar", 160]] };
      const dg = new_game(1, "family", 1, "diner", SLOTS, null, "service", true, true, spec), di = dg.cfg.drop_interval, F = Math.floor;
      let dok = JSON.stringify(dg.cfg.sched.gaps) === JSON.stringify([F(di * 50 / 100), di, di * 2, F(di * 40 / 100), F(di * 40 / 100), F(di * 160 / 100), F(di / 2), F(di * 160 / 100)])
        && dg.drop_t === dg.cfg.sched.gaps[0] && day_clock(dg) === 660 && day_cue(dg) === -1
        && new_game(1, "family", 1, "diner", SLOTS, null, "service").cfg.sched === undefined;
      let cue = false, br = false;
      while (!(dg.won || dg.over) && dg.ticks < 6000) { cue = cue || day_cue(dg) >= 0; br = br || day_breather(dg); auto_step(dg); tick(dg); }
      const tk = dg.service.tickets;
      dok = dok && dg.won && cue && br && tk.slice(0, 8).map((t) => t.party).join() === "walk,walk,seat,seat,seat,togo,togo,bar"
        && tk[5].togo && tk[5].drink === null && tk[5].bag === 1 && tk[6].bag === 1 && tk[5].due === tk[5].arrivedTick + TAKEOUT_WINDOW
        && tk[7].rounds === BAR_ROUNDS && tk[7].drinksOut === BAR_ROUNDS;
      const wb = new_game(1, "family", 1, "diner", SLOTS, null, "service", true, true, spec);
      for (let i = 0; i < wb.cfg.sched.gaps[0]; i++) tick(wb);
      wb.slots[0].cook = sear_burn_of(wb, wb.slots[0]) - 1; const w0 = wb.wait; tick(wb);
      dok = dok && wb.waste === 1 && Math.abs((wb.wait - w0) - WASTE_SPIKE) < 2 && WASTE_SPIKE === WAIT_SPIKE / 2;
      const lp = new_game(1, "family", 1, "diner", SLOTS, null, "service", true, true, { t0: 0, t1: 60, segs: [[1, 10, "togo"]] });
      while (lp.service.nextId === 1) tick(lp);
      for (let i = 0; i < TAKEOUT_WINDOW + 2; i++) { lp.billy = 0; lp.wait = 0; tick(lp); }
      dok = dok && lp.service.day.late === 1 && lp.service.tickets[0].pickupLate;
      ok("the day: curve gaps, wave cue, breather, take-out bags + pickup clock, happy-hour rounds, half waste spike", dok);
    }
    // SHIFTS ON A GAME CLOCK (1112 pt 2, opt-in tpm) — mirrors the Python selftest block
    {
      const cs = { t0: 660, t1: 720, tpm: 10, flow: [[662, 700, 200, "walk"], [680, 0, 50, "seat", 3], [690, 0, 50, "togo", 2]],
                   bump: { at: 700, combo: 1, waste: 99, t1: 730, flow: [[705, 0, 60, "rush", 2]] } };
      const cg = new_game(1, "family", 1, "diner", SLOTS, null, "service", true, true, cs), sc0 = cg.cfg.sched;
      const n0 = sc0.gaps.length, last0 = sc0.gaps.reduce((a, x) => a + x, 0);
      let cok = day_clocked(cg) && sc0.total === 600 && cg.cfg.orders === n0 && cg.orders_left === n0 && last0 < 600 - DAY_LAST_ORDERS
        && sc0.kinds.filter((k) => k === "seat").length === 3 && sc0.wave[sc0.kinds.indexOf("seat")] === 1 && cg.service.day.bumped === 0;
      let early = false;
      while (!(cg.won || cg.over) && cg.ticks < 3000) { auto_step(cg); tick(cg); if (cg.orders_left === 0 && !cg.won && cg.ticks < cg.cfg.sched.total) early = true; }
      cok = cok && cg.won && cg.service.day.bumped === 1 && cg.ticks === 700 && day_clock(cg) === 730 && cg.cfg.orders === n0 + 2
        && cg.service.tickets.filter((t) => t.party === "rush").length === 2 && early;
      const nb = new_game(1, "family", 1, "diner", SLOTS, null, "service", true, true, Object.assign({}, cs, { bump: Object.assign({}, cs.bump, { combo: 999 }) }));
      while (!(nb.won || nb.over) && nb.ticks < 3000) { auto_step(nb); tick(nb); }
      cok = cok && nb.won && nb.ticks === 600 && nb.service.day.bumped === 0;
      const qk = new_game(1, "family", 1, "diner", SLOTS, null, "service", true, true, Object.assign({}, cs, { tpm: 5 }));
      cok = cok && qk.cfg.sched.total === 300 && qk.cfg.sched.kinds.filter((k) => k === "seat").length === 2;
      const cl = new_game(1, "kids", 1, "diner", SLOTS, null, "service", true, true, { t0: 0, t1: 40, tpm: 10, flow: [[1, 0, 50, "walk", 1]] });
      while (!(cl.won || cl.over) && cl.ticks < 3000) { cl.billy = 0; cl.wait = 0; tick(cl); }
      cok = cok && cl.won && cl.ticks === 400 && cl.service.tickets[0].reason.startsWith("Still cooking at close");
      ok("game clock: flow compile, close-time end (not the quota), the late bump inside the shift, QUICK bursts, closed tickets", cok);
    }
    }

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
      RECIPES.PATTY_MELT.length === 3 && RECIPES.SMASH_MELT.length === 3 && RECIPES.PATTY_MELT[1] === Action.ONION &&   // melts: flip, onions, Swiss; rye's on the toaster
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

    // REAL ORDERS (SERVICE only): seats, breads, bread pans, bread-matched buns. Mirrors Python selftest 8).
    let ro = true;
    const sv = new_game(1, "family", 1, "diner", SLOTS, ITEMS_FULL_MENU, "service", true);
    const tks = []; for (let k = 0; k < 10; k++) tks.push(_new_ticket(sv));
    ro = ro && tks.every((t) => t.seat === SEAT_CYCLE[t.id % 10]) && tks.map((t) => t.seat).sort((a, b) => a - b).join() === "0,1,2,3,4,5,6,7,8,9";
    ro = ro && seat_id(0) === "B1" && seat_id(5) === "B6" && seat_id(6) === "T1" && seat_id(9) === "T4" &&
      seat_label(0) === "BAR 1" && seat_label(9) === "TABLE 4" && BREADS.join() === "SESAME,RYE,WHITE" &&
      BREAD_TAG.WHITE === "WHT" && BREAD_LABEL.SESAME === "SESAME BUN";
    ro = ro && [bread_for(Item.PATTY_MELT, 1), bread_for(Item.SMASH_MELT, 2), bread_for(Item.GRILLED_CHEESE, 1),
      bread_for(Item.GRILLED_CHEESE, 2), bread_for(Item.BURGER, 1), bread_for(Item.SMASH, 2), bread_for("HAMBURGER", 3)].join() ===
      "RYE,RYE,WHITE,RYE,SESAME,WHITE,SESAME";
    const sb = new_game(1, "family", 1, "diner", SLOTS, ITEMS_BURGER, "service", true);
    const G = sb.slots.length, T = sb.toaster.length;
    ro = ro && T === TOASTER_SLOTS_SERVICE;
    for (let k = 0; k < 40; k++) move(sb, 1);
    const ct = cursor_target(sb);
    ro = ro && cursorOf(sb) === G + T + BREADS.length - 1 && ct.kind === "pan" && ct.index === 2;
    sb.slots[0] = _new_patty(sb); const sp = sb.slots[0];
    ro = ro && sp.bread === "SESAME" && sb.service.tickets[0].bread === "SESAME";
    sb.players[0].cursor = G; toast(sb); ro = ro && sb.toaster[0] === null && sb.flash === "GRAB BREAD!";
    flip(sb); add_cheese(sb); ro = ro && sp.step === 0;
    sb.players[0].cursor = G + T + BREADS.indexOf("WHITE"); toast(sb);
    flip(sb); drop(sb); handoff(sb); ro = ro && sb.players[0].held === "WHITE" && sb.flash === "WHITE!";
    sb.players[0].cursor = G; toast(sb);
    ro = ro && isBun(sb.toaster[0]) && sb.toaster[0].bread === "WHITE" && sb.players[0].held === null;
    sp.stage = Stage.DONE; sp.cook = 0; sb.toaster[0].cook = toast_ready(sb); _assembly_tick(sb);
    ro = ro && !sp.bunned && sb.toaster[0] !== null && !_servable(sp);        // wrong-bread bun never claimed
    sb.players[0].cursor = G + T + BREADS.indexOf("SESAME"); toast(sb);
    sb.players[0].cursor = G + 1; toast(sb); sb.toaster[1].cook = toast_ready(sb);
    const rc = order_receipts(sb)[0];
    ro = ro && rc.seat === SEAT_CYCLE[1] && rc.bread === "SESAME" && rc.needsBun && rc.bunReady && !rc.bunJoined;
    _assembly_tick(sb);
    ro = ro && sp.bunned && sb.toaster[1] === null && sb.toaster[0] !== null && _servable(sp) && order_receipts(sb)[0].bunJoined;
    sb.toaster[0].cook = toast_burn(sb) - 1; tick(sb);
    ro = ro && sb.bun_fails === 1 && sb.service.waste.events[sb.service.waste.events.length - 1].bread === "WHITE";
    const gw = new_game(1, "family", 1, "diner", SLOTS, ITEMS_GRILLED_CHEESE, "service", true);
    ro = ro && _place_next(gw) && !isBun(gw.toaster[0]);
    const gcp = gw.toaster[0];
    ro = ro && gcp.bread === undefined && gw.service.tickets[0].bread === "WHITE";
    gw.players[0].cursor = gw.slots.length; gcp.cook = sear_ready(gcp); toast(gw);
    ro = ro && gcp.step === 0 && gw.flash === "GRAB BREAD!";
    gw.players[0].cursor = gw.slots.length + gw.toaster.length + BREADS.indexOf("RYE"); toast(gw);
    gw.players[0].cursor = gw.slots.length; toast(gw);
    ro = ro && gcp.step === 1 && gcp.bread === "RYE" && gcp.wrongBread === true && gw.players[0].held === null;
    gcp.cook = sear_ready(gcp); add_cheese(gw); gcp.stage = Stage.DONE; gcp.cook = 0; _do_serve(gw, gcp);
    // 1112: wrong bread never reaches the customer — WASTE + the ticket is redone (no review yet)
    ro = ro && gw.service.events.length === 0 && gw.service.tickets[0].redo === 1 && gw.service.queue[0].id === 1 &&
      gw.waste === 1 && gw.served === 0 && gw.fails === 1 && gw.service.waste.events[gw.service.waste.events.length - 1].cause === "wrong_bread";
    const gr = new_game(1, "family", 1, "diner", SLOTS, ITEMS_GRILLED_CHEESE, "service", true);
    _place_next(gr); const gc2 = gr.toaster[0];
    gr.players[0].cursor = gr.slots.length + gr.toaster.length + BREADS.indexOf("WHITE"); toast(gr);
    gr.players[0].cursor = gr.slots.length; gc2.cook = sear_ready(gc2); toast(gr);
    ro = ro && gc2.bread === "WHITE" && !gc2.wrongBread;
    const kb = new_game(1, "kids", 1, "diner", SLOTS, ITEMS_BURGER, "service", true);
    kb.toaster[0] = Bun(0, "RYE"); kb.toaster[0].cook = toast_burn(kb) - 1; tick(kb);
    ro = ro && kb.toaster[0] === null && kb.fails === 0 && kb.bun_fails === 0 && kb.wait === 0;   // kids: stale, not burnt
    const lg = new_game(1, "arcade", 1, "diner", SLOTS, ITEMS_PATTY_MELT);                     // LEGACY untouched
    for (let k = 0; k < 40; k++) move(lg, 1);
    ro = ro && cursorOf(lg) === SLOTS + TOASTER_SLOTS - 1 && !("held" in lg.players[0]);
    toast(lg); ro = ro && isBun(lg.toaster[lg.toaster.length - 1]) && !("bread" in lg.toaster[lg.toaster.length - 1]);
    const lb = new_game(1, "arcade"); lb.slots[0] = _new_patty(lb); lb.slots[0].stage = Stage.DONE;
    ro = ro && lb.toaster.length === 0 && !("bread" in lb.slots[0]) && _servable(lb.slots[0]);
    const ns = new_game(1, "family", 1, "diner", SLOTS, ITEMS_PATTY_MELT, "service");   // service WITHOUT opt-in: unchanged
    ro = ro && !ns.cfg.bread && ns.toaster.length === TOASTER_SLOTS && toast_ready(ns) === TOAST_READY * 2 && !("held" in ns.players[0]);
    for (let k = 0; k < 40; k++) move(ns, 1);
    ro = ro && cursorOf(ns) === SLOTS + TOASTER_SLOTS - 1;
    toast(ns); ro = ro && isBun(ns.toaster[ns.toaster.length - 1]) && !("bread" in ns.toaster[ns.toaster.length - 1]);
    const nb = new_game(1, "family", 1, "diner", SLOTS, ITEMS_BURGER, "service");
    nb.slots[0] = _new_patty(nb); nb.slots[0].stage = Stage.DONE;
    ro = ro && nb.toaster.length === 0 && !needs_bun(nb, nb.slots[0]) && _servable(nb.slots[0]) &&
      nb.service.tickets[0].seat === SEAT_CYCLE[1] && nb.service.tickets[0].bread === "SESAME" &&
      advance_round(sb).cfg.bread === true && !advance_round(nb).cfg.bread;
    for (const m of Object.keys(MODES)) for (const pl of [1, 2]) for (const items of [ITEMS_BURGER, ITEMS_FULL_MENU, ITEMS_GRILLED_CHEESE]) {
      const sa = new_game(1, m, pl, "diner", SLOTS, items, "service", true);
      while (!(sa.won || sa.over) && sa.ticks < 6000) { auto_step(sa); tick(sa); }
      if (!(sa.won && sa.bun_fails === 0 && sa.sent_back === 0)) ro = false;
    }
    ok("real orders (service): seats, bread_for, pans -> toast -> join by bread, wrong bun unclaimed, GC wrong bread = waste + redo, legacy untouched", ro);

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
    finalize_service, close_service:finalize_service, cook_window, order_receipts, melt_done, toast_ready, toast_burn,
    TPS, SLOTS, SEAR_READY, SEAR_BURN, MELT_DONE, BILLY_FULL, SERVE_POINTS,
    PERFECT_BONUS, NEVER_BURN, TURN_LATENCY, COMBO_PER_MULT, MULT_MAX, FLOW_COMBO,
    BURIED_RESTLESS, BURIED_BARKING, WAIT_FULL, WAIT_COMFORT, WAIT_RATE_UP,
    WAIT_RATE_DOWN, WAIT_SPIKE, WAIT_RELIEF, HISCORE_N, DEFAULT_SCORES, THEMES, MODES,
    GRADE_PERFECT, GRADE_GOOD, GRADE_OK, FLIP_PENALTY, GRADE_BONUS, WASTE_COST, POOR_SPIKE, CATS, PTS, POPS_MAX,   // 1112 COOK QUALITY
    SIDE_STEPS, MIN_FLIPS, grade_window, DRINKS, DRINK_CYCLE, DRINK_POUR, DRINK_RAIL, DRINK_PATIENCE, DRINK_SPIKE, drink_for,
    DAY_LULL_GAP, DAY_RECOVER, WASTE_SPIKE, DAY_CUE, DAY_TAIL, DAY_WAVES, TAKEOUT_WINDOW, TAKEOUT_BAG, TAKEOUT_SPIKE, BAG_BEAT, BAR_ROUNDS,   // THE DAY
    day_compile, day_clock, day_breather, day_cue, day_clocked, DAY_LAST_ORDERS, DAY_REF_TPM,
    PERIODS, Stage, combo_mult, pyround, round_config, Patty, new_game, advance_round, cursorOf,
    move, flip, add_cheese, toast, drop, handoff, hey_billy, tick, live_wait, buried_index, crowd_bark,
    qualifies, add_high_score, auto_step, selftest,
    Action, Item, RECIPES, ITEM_PAY, ITEM_LABEL, ITEM_TICKET, ITEM_COOK, sear_ready, sear_burn_of,
    TOASTER_SLOTS, TOAST_READY, TOAST_BURN, BUN_SPIKE, TOAST_ITEMS, TOASTER_ITEMS, Bun,   // THE BUN TOASTER
    TOASTER_SLOTS_SERVICE, TOAST_READY_BREAD, TOAST_BURN_BREAD, needs_bun, BREADS, BREAD_LABEL, BREAD_TAG, SEAT_CYCLE, COUNTER_SEATS,      // REAL ORDERS (service)
    seat_id, seat_label, bread_for, cursor_target,
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
