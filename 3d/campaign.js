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
  // ---- THE DAY (Joe 1112, docs/DAY-1112.md) ----------------------------------------------------------------
  // "open at 11 am … a pop at lunch time … 2-3 hours, 4-5 if you push or get the late bump, then happy hour 6-7,
  //  then your dinner people … by 8 pm getting blasted by take out and a full 2 seatings, 3 if it's super busy,
  //  then the closing … the drunk crowd or movies letting out … close at 11 pm. 12 on weekends."
  // Each shift covers a window of ONE restaurant day and hands the engine a schedule (`day`, opt-in cfg.sched):
  //   t0/t1 — the wall-clock window (minutes since midnight) the shift's arrivals span
  //   segs  — [n, gap, kind, pre?, bag?]: n arrivals `gap`% of the shift's drop_interval apart (the first after
  //           `pre`%). kind: walk | seat (a SEATING — a wave of tables that sit together) | togo (TAKE-OUT bags,
  //           PICKUP clock, no table) | bar (HAPPY HOUR: a round of drinks) | rush (the bus / the movie letting out)
  //   Gaps >= 150% are BREATHERS (the WAIT meter recovers 2x). The quota = the number of arrivals.
  // `bump` (shift 6): THE LATE BUMP — when the last shift went well (hot streak, ≤1 waste) word gets out and a
  // late-lunch crowd stretches the pop past 3. `bonus` = the back-of-house interlude after the shift clears.
  const H = (h, m = 0) => h * 60 + m;
  // ---- SHIFTS ON A GAME CLOCK (Joe 1112 pt 2, docs/SHIFTS-AND-BATTLE-1112.md) -----------------------------------
  // "i think you have the timetable of a full restaurant day, lets make the shifts mimic those. they can be longer
  //  games, we dont need minute rounds. truncate the time perhaps by a multiple common in video games, minutes for
  //  hours, etc."  Each shift is now a REAL service period of the day, played on a compressed clock (LENGTHS below:
  // FULL DAY = 1 real minute per restaurant hour). A shift ENDS WHEN THE CLOCK HITS ITS CLOSE TIME — you clear it by
  // surviving to the end (the WAIT meter never fills). The customers come on a FLOW across the period (engine opt-in
  // cfg.sched with `tpm`), not a quota:
  //   flow: [m0, m1, gap, kind(, n(, bag))] — m0/m1 = wall-clock minutes. n 0 = a STREAM (one every `gap`% of the
  //         shift's drop_interval from m0 to m1: density never changes with the clock scale, a longer clock = more
  //         customers); n > 0 = a BURST of n (a SEATING / a TAKE-OUT flood / a RUSH; the first one is a cued WAVE).
  //   Gaps >= 150% are BREATHERS (the WAIT meter recovers 2x). After the last arrival the house breathes to close.
  //   bump: THE LATE BUMP — at wall-clock `at`, a hot lunch (combo_best >= combo, waste <= waste) keeps the pop
  //         going: a tour bus + the late-lunchers, close moves to `t1` ("4-5 hours if you push").
  //   t0bump: if the previous shift got THE LATE BUMP, this one opens later (planFor()).
  // `bonus` = the back-of-house interlude after the shift clears.
  const SHIFTS = [
    { n: 1, name: "OPEN", time: "11:00 AM", music: "open",
      wrinkle: "Doors open. Learn the grill: FLIP, CHEESE, then HEY BILLY to serve. Hear the bell? A table's coming in.",
      mode: "kids", grill: 6, rnd: 1, items: "burger",
      day: { t0: H(11), t1: H(11, 45), flow: [[H(11, 2), H(11, 40), 150, "walk"], [H(11, 22), 0, 70, "seat", 3]] } },
    { n: 2, name: "THE LUNCH POP", time: "11:45 AM", music: "rush",
      wrinkle: "Lunch hits: tables in waves, and the office calls in TAKE-OUT. Push it and the pop keeps going…",
      mode: "family", grill: 6, rnd: 1, items: "burger",
      day: { t0: H(11, 45), t1: H(15),
             flow: [[H(11, 45), H(12, 5), 200, "walk"], [H(12), 0, 60, "seat", 4], [H(12, 5), H(13, 30), 320, "walk"],
                    [H(12, 22), 0, 60, "togo", 4], [H(12, 50), 0, 70, "seat", 4], [H(13, 15), 0, 60, "seat", 4],
                    [H(13, 35), 0, 60, "togo", 2], [H(13, 30), H(14, 50), 300, "walk"], [H(13, 55), 0, 70, "seat", 4]],
             bump: { at: H(14, 30), combo: 8, waste: 3, t1: H(15, 45), label: "THE LATE BUMP — A TOUR BUS!",
                     flow: [[H(14, 40), 0, 60, "rush", 6], [H(14, 50), H(15, 35), 170, "walk"], [H(15, 5), 0, 60, "togo", 2]] } } },
    { n: 3, name: "THE AFTERNOON LULL", time: "3:00 PM", music: "open",
      wrinkle: "A breather. Stragglers and regulars, and the patty melt lands: toast the rye on the TOASTER.",
      mode: "family", grill: 6, rnd: 1, items: "meltintro", bonus: "FREEZER",
      day: { t0: H(15), t0bump: H(15, 45), t1: H(17, 30), flow: [[H(15, 5), H(17, 20), 300, "walk"], [H(16, 15), 0, 80, "seat", 2]] } },
    // → BONUS: WALK-IN FREEZER (restock breather, no-fail) after the lull
    { n: 4, name: "HAPPY HOUR", time: "5:30 PM", music: "day",
      wrinkle: "Rounds of drinks: Billy's running the rail. Lighter food, but keep him at the pass.",
      mode: "family", grill: 6, rnd: 2, items: "fifties",
      day: { t0: H(17, 30), t1: H(19), flow: [[H(17, 32), H(18, 55), 150, "walk"], [H(17, 50), 0, 130, "bar", 6], [H(18, 25), 0, 130, "bar", 6]] } },
    { n: 5, name: "DINNER", time: "7:00 PM", music: "rush",
      wrinkle: "SMASH hits the menu — low-and-slow, hogs a slot 1.5x longer, pays the most. Dinner builds.",
      mode: "family", grill: 6, rnd: 2, items: "full",
      day: { t0: H(19), t1: H(20), flow: [[H(19, 2), H(19, 55), 130, "walk"], [H(19, 10), 0, 75, "seat", 4], [H(19, 35), 0, 70, "seat", 4]] } },
    { n: 6, name: "THE BLAST", time: "8:00 PM", music: "weeds",
      wrinkle: "Two full seatings and the phone won't stop. Seat, flip, bag, breathe.",
      mode: "arcade", grill: 6, rnd: 1, items: "full", bonus: "BASEMENT",
      day: { t0: H(20), t1: H(22),
             flow: [[H(20, 2), 0, 50, "seat", 6], [H(20, 10), H(21, 50), 280, "walk"], [H(20, 28), 0, 50, "togo", 4],
                    [H(21, 5), 0, 45, "seat", 6], [H(21, 30), 0, 50, "togo", 4]] } },
    // → BONUS: THE BASEMENT (quota-or-forfeit, ×2) before last call
    { n: 7, name: "LAST CALL", time: "10:00 PM", music: "finale",
      wrinkle: "It winds down… then the movie lets out. Close it out.",
      mode: "arcade", grill: 6, rnd: 2, items: "full",
      day: { t0: H(22), t1: H(23), close: H(23),
             flow: [[H(22, 2), H(22, 22), 240, "walk"], [H(22, 22), 0, 50, "rush", 8], [H(22, 33), 0, 60, "togo", 3], [H(22, 36), H(22, 50), 200, "walk"]] } },
  ];
  // Fri/Sat: a THIRD seating in the blast (to 10:30) and last call runs to midnight — the bars empty, then the
  // midnight movie.
  const WEEKEND = {
    6: { name: "THE BLAST: 3 SEATINGS", wrinkle: "Super busy: a THIRD seating sits as the second leaves.",
         day: { t0: H(20), t1: H(22, 30),
                flow: [[H(20, 2), 0, 50, "seat", 6], [H(20, 10), H(22, 20), 280, "walk"], [H(20, 28), 0, 50, "togo", 4],
                       [H(21, 5), 0, 45, "seat", 6], [H(21, 30), 0, 50, "togo", 4], [H(21, 58), 0, 50, "seat", 6]] } },
    7: { time: "10:30 PM", wrinkle: "The bars empty and the midnight movie lets out. Close at twelve.",
         day: { t0: H(22, 30), t1: H(24), close: H(24),
                flow: [[H(22, 32), H(23), 240, "walk"], [H(23), 0, 60, "rush", 7], [H(23, 15), 0, 60, "togo", 2],
                       [H(23, 20), H(23, 30), 240, "walk"], [H(23, 33), 0, 70, "rush", 4]] } },
  };
  // LENGTH — the clock scale ("minutes for hours"). tpm = engine ticks per restaurant minute at TPS 10.
  const LENGTHS = {
    quick: { tpm: 5,  label: "QUICK", sub: "30 s per hour · a 6-minute day" },
    day:   { tpm: 10, label: "FULL DAY", sub: "1 minute per hour · a 12-minute day" },
    long:  { tpm: 20, label: "LONG HAUL", sub: "2 minutes per hour · 1.5–6.5-minute shifts" },
  };
  const DEFAULT_LENGTH = "day";
  const lengthOf = (k) => LENGTHS[String(k || "").toLowerCase()] ? String(k).toLowerCase() : DEFAULT_LENGTH;
  // a shift's play length in real seconds at a scale (TPS 10) — for the cards + docs
  const secsOf = (day, len) => day ? (day.t1 - day.t0) * LENGTHS[lengthOf(len)].tpm / 10 : 0;
  function forNight(night, length) {  // "weekend" | "fri" | "sat" → the Fri/Sat table; anything else = the weekday
    const wk = /^(weekend|fri|sat)/i.test(String(night || ""));
    const shifts = wk ? SHIFTS.map((sh) => { const o = WEEKEND[sh.n]; return o ? Object.assign({}, sh, o) : sh; }) : SHIFTS;
    return Object.assign({}, CAMPAIGN, { SHIFTS: shifts, night: wk ? "weekend" : "weekday", length: lengthOf(length) });
  }
  // What the last shift handed this one (note()): THE LATE BUMP ran long → the lull opens later.
  let _prev = null;
  function note(g) { _prev = g ? { combo_best: g.combo_best, waste: g.waste || 0, bumped: !!(g.service && g.service.day && g.service.day.bumped) } : null; }
  function planFor(sh, prev = _prev, length = DEFAULT_LENGTH) {
    if (!sh.day) return { day: null, bumped: false, label: null };
    const day = Object.assign({}, sh.day, { tpm: LENGTHS[lengthOf(length)].tpm });
    const late = !!(prev && prev.bumped && sh.day.t0bump);
    if (late) day.t0 = sh.day.t0bump;
    delete day.t0bump;
    return { day, bumped: late, label: null };
  }
  // CLEARING A SHIFT (docs/SHIFTS-AND-BATTLE-1112.md §2): survive to the close = CLEAR. The SERVICE TARGET is 80% of
  // everyone who walked in; the emblems are earned per order against max(served, target), so a shift that let people
  // walk can't buy its emblems on a few perfect plates.
  const TARGET = 0.8;
  function verdict(g) {
    const walkins = g && g.cfg ? g.cfg.orders : 0, target = Math.ceil(walkins * TARGET), served = g ? g.served : 0;
    return { cleared: !!(g && g.won), walkins, target, served, hit: served >= target,
             bumped: !!(g && g.service && g.service.day && g.service.day.bumped) };
  }
  // The game the end-of-shift card scores (emblems per order on the target). Read-only view; the engine state is untouched.
  const _views = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  function cardView(g) {                               // (cached per game: PMScore.bank() banks a game object once)
    if (!g || !g.cfg || !g.cfg.sched || !g.cfg.sched.clocked || !g.won) return g;
    const v = verdict(g); if (v.hit) return g;
    if (_views && _views.has(g)) return _views.get(g);
    const view = Object.assign(Object.create(Object.getPrototypeOf(g)), g, { served: v.target });
    if (_views) _views.set(g, view);
    return view;
  }

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
  // `bread` = the REAL ORDERS opt-in (service only): bread pans + held bread + a bun of the ticket's bread per patty.
  // `drinks` = the DRINKS opt-in (1112, service only): Billy runs one drink per customer off the drink rail.
  // THE DAY on the GAME CLOCK (1112): the shift's flow + close time ride along (engine opt-in cfg.sched with tpm, service
  // only); `length` = the clock scale (LENGTHS). ?day=off drops it: the old flat arrivals, a quota of the same headcount.
  function build(pm, sh, players, theme, itemsOverride, profile = "legacy", bread = false, drinks = false, useDay = true, length) {
    const items = itemsOverride && itemsOverride.length ? itemsOverride : itemSeq(pm, sh.items);
    const plan = planFor(sh, _prev, length || (this && this.length));
    const day = useDay && profile === "service" ? plan.day : null;
    const g = pm.new_game(sh.rnd || 1, sh.mode || "family", players || 1, theme || "diner", sh.grill || 6, items, profile, bread, drinks, day);
    if (!day) {                                          // flat arrivals: a quota of the clocked shift's headcount
      const q = sh.day ? pm.new_game(sh.rnd || 1, sh.mode || "family", 1, "diner", 6, items, "service", false, false, plan.day).cfg.orders : sh.quota;
      if (q) { g.cfg.orders = q; g.orders_left = q; }
    }
    Object.defineProperty(g, "bumped", { configurable: true, enumerable: false,       // (presentation) THE LATE BUMP label
      get() { return this.service && this.service.day && this.service.day.bumped && sh.day && sh.day.bump ? sh.day.bump.label : null; } });
    return g;
  }

  const CAMPAIGN = { SHIFTS, WEEKEND, LENGTHS, DEFAULT_LENGTH, TARGET, length: DEFAULT_LENGTH, itemSeq, build, forNight, planFor, note, verdict, cardView, secsOf, lengthOf };
  global.PMCampaign = CAMPAIGN;
  if (typeof module !== "undefined" && module.exports) module.exports = CAMPAIGN;
})(typeof globalThis !== "undefined" ? globalThis : this);
