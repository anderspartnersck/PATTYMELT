// PATTY MELT — SHIFT SCORING (presentation)  *** for Christine & Phillip Coleman. ***
//
// Joe 1112: "the scoring progression system works in the asymmetric horror games I play — it can work here."
// The ENGINE (web/engine.js == src/patty_melt.py, parity-proven) earns points in four CATEGORIES and logs a
// pop-up feed (s.pts / s.pops / s.waste / s.waste_cost / s.grades). THIS file is render-only: it turns those into
//   * pop-ups over the food (+PERFECT SEAR, +ON TIME, +DRINK RUN, WASTE -60 …), category-coloured
//   * a per-shift EMBLEM per category (4 tiers, by points-per-order) + an overall SHIFT GRADE
//   * the end-of-shift BREAKDOWN card (categories, emblems, the waste cost line, the grade, the rank bar)
//   * a persistent RANK (lifetime shift points → a cook's title), stored like the kitchen's high-score board
//     (localStorage, every access try/catch'd; practice / demo / attract never bank).
// Numbers + thresholds are documented in docs/SCORING-1112.md. Classic script (file:// safe), no deps.
(function (root) {
  "use strict";
  const CATS = ["grill", "service", "hustle", "nerve"];
  const META = {
    grill:   { name: "GRILL",   col: "#ff8a3d", what: "the cook — sear timing, minimum flips" },
    service: { name: "SERVICE", col: "#6fb0e0", what: "on time, in ticket order, drinks run" },
    hustle:  { name: "HUSTLE",  col: "#7ad17a", what: "HEY BILLY when it counts, handoffs, clutch serves" },
    nerve:   { name: "NERVE",   col: "#ffd23f", what: "the streak — combo x mult, BIG GRILL ENERGY" },
  };
  // Emblem thresholds = POINTS PER ORDER SERVED in that category (tier 1..4). Calibrated on the auto-player
  // (tools/service_balance.py world, 1112): a robotic cook acting the instant RDY lights = GRILL 150/order
  // (all GOOD = tier 2), SERVICE ~330/order with drinks, HUSTLE ~20, NERVE ~90.
  const PER_ORDER = {
    grill:   [75, 150, 220, 280],     // 280 ≈ nearly every patty PERFECT (300)
    service: [120, 200, 280, 330],    // max 250/order (ON TIME 150 + IN ORDER 100) + 100 with a drink run
    hustle:  [10, 25, 50, 90],        // WAKE-UP CALL 100 · HANDOFF 75 · CLUTCH 75 — earned, not per-order
    nerve:   [30, 70, 110, 150],      // STREAK 25 x mult per serve at 3+ · BIG GRILL ENERGY 250
  };
  const TIERS = {
    diner:  ["PAPER HAT", "CLEAN APRON", "GOLD SPATULA", "BLUE PLATE"],
    school: ["HAIRNET", "GOLD STAR", "HONOR ROLL", "LUNCH HERO"],
  };
  const TIER_COL = ["#5b4a3a", "#b07a4a", "#c9d2da", "#ffd23f", "#9fe8ff"];   // none, bronze, silver, gold, iridescent
  const RANKS = {
    diner: [[0, "DISHWASHER"], [6000, "BUSSER"], [18000, "FRY COOK"], [40000, "LINE COOK"], [75000, "GRILL COOK"],
            [125000, "SHORT-ORDER ACE"], [200000, "GRILL CAPTAIN"], [320000, "LEGEND OF THE FLAT-TOP"]],
    school: [[0, "TRAY RUNNER"], [6000, "LINE HELPER"], [18000, "LUNCH SERVER"], [40000, "GRILL HELPER"], [75000, "LUNCH LADY"],
             [125000, "HEAD COOK"], [200000, "CAFETERIA CAPTAIN"], [320000, "LUNCH LEGEND"]],
  };
  const GRADES = [[15, "A+"], [12, "A"], [9, "B"], [6, "C"], [3, "D"], [0, "F"]];
  const skinOf = (g) => (g && g.theme === "school") ? "school" : "diner";

  function tierOf(cat, pts, served) {
    const per = pts / Math.max(1, served), th = PER_ORDER[cat];
    let t = 0; for (let k = 0; k < th.length; k++) if (per >= th[k]) t = k + 1;
    return t;
  }
  // one shift's breakdown (pure: same game state → same card)
  function breakdown(g) {
    const sk = skinOf(g), served = g.served || 0, cats = {};
    let tiers = 0, raw = 0;
    for (const c of CATS) {
      const pts = (g.pts && g.pts[c]) || 0, t = tierOf(c, pts, served);
      cats[c] = { pts, tier: t, emblem: t ? TIERS[sk][t - 1] : "—", col: TIER_COL[t] };
      tiers += t; raw += pts;
    }
    const waste = g.waste || 0, wasteCost = g.waste_cost || 0;
    const gradePts = Math.max(0, tiers - Math.floor(waste / 2));     // every 2 wasted items knock a step off the grade
    const grade = (GRADES.find((x) => gradePts >= x[0]) || GRADES[GRADES.length - 1])[1];
    return { cats, served, waste, wasteCost, raw, total: Math.max(0, raw - wasteCost), grade, grades: g.grades || {} };
  }
  // ---- persistent RANK (lifetime shift points) — same storage policy as the kitchen high-score board ----
  const KEY = (sk) => "pmRank_v1_" + sk;
  function loadRank(sk) { try { const j = JSON.parse(localStorage.getItem(KEY(sk))); if (j && typeof j.pts === "number") return j; } catch (e) {} return { pts: 0, shifts: 0, best: "" }; }
  function saveRank(sk, r) { try { localStorage.setItem(KEY(sk), JSON.stringify(r)); } catch (e) {} }
  function rankOf(sk, pts) {
    const L = RANKS[sk]; let i = 0; for (let k = 0; k < L.length; k++) if (pts >= L[k][0]) i = k;
    const next = L[i + 1];
    return { i, title: L[i][1], next: next ? next[1] : null, frac: next ? (pts - L[i][0]) / (next[0] - L[i][0]) : 1, toNext: next ? next[0] - pts : 0 };
  }
  const _banked = new WeakSet();
  // bank a finished shift ONCE (excluded = practice / demo / attract / battle: never banks). Returns {before, after, rank, up}.
  function bank(g, excluded) {
    const sk = skinOf(g), r = loadRank(sk), before = rankOf(sk, r.pts);
    if (excluded || _banked.has(g)) return { before, after: before, pts: r.pts, gained: 0, up: false };
    _banked.add(g);
    const b = breakdown(g);
    r.pts += b.total; r.shifts += 1;
    if (!r.best || GRADES.findIndex((x) => x[1] === b.grade) < GRADES.findIndex((x) => x[1] === r.best)) r.best = b.grade;
    saveRank(sk, r);
    const after = rankOf(sk, r.pts);
    return { before, after, pts: r.pts, gained: b.total, up: after.i > before.i };
  }
  function peekRank(g) { const sk = skinOf(g), r = loadRank(sk); return Object.assign(rankOf(sk, r.pts), { pts: r.pts }); }

  // ---- the POP-UP feed: new engine pops → floating labels (render-only) ----
  const _seen = new WeakSet();
  function createFeed() {
    const live = [];
    return {
      live,
      // where(at) → {x,y} on screen for an engine anchor (["grill",i] / ["toaster",i] / ["rail",k,id] / null)
      take(g, where, now) {
        for (const p of g.pops || []) {
          if (_seen.has(p)) continue; _seen.add(p);
          const xy = where(p.at) || where(null);
          live.push({ x: xy.x, y: xy.y, t0: now, cat: p.cat, label: p.label, pts: p.pts, slot: 0, sy: 0 });
        }
        while (live.length > 24) live.shift();
      },
      // (1112 art pass: the pops used to pile up on each other and over the header / tickets.) Pops that land near each
      // other form ONE column: newest at its anchor, older ones slide up a line each (eased), at most MAX per column —
      // the oldest beyond that fade out fast. o.top = nothing above this y (the HUD header); o.avoid = [x, y, w, h] rects
      // (the ticket rail) a column is pushed below.
      draw(ctx, now, txt, o = {}) {
        const MAX = 4, LH = 17;
        for (let n = live.length - 1; n >= 0; n--) { const f = live[n]; if (now - f.t0 > (f.cat === "grill" ? 1500 : 1300)) live.splice(n, 1); }
        const cols = [];
        for (const f of live) {                         // group by anchor (oldest first)
          let c = cols.find((c) => Math.abs(c.x - f.x) < 70 && Math.abs(c.y - f.y) < 40);
          if (!c) { c = { x: f.x, y: f.y, list: [] }; cols.push(c); }
          c.list.push(f);
        }
        ctx.save(); ctx.textAlign = "center";
        for (const c of cols) {
          let base = c.y;
          for (const r of o.avoid || []) if (c.x > r[0] - 40 && c.x < r[0] + r[2] + 40 && base > r[1] - 6 && base - (Math.min(MAX, c.list.length)) * LH < r[1] + r[3]) base = r[1] + r[3] + 24 + Math.min(MAX, c.list.length) * LH;
          if (o.top != null) base = Math.max(base, o.top + 14 + Math.min(MAX, c.list.length) * LH);
          const L = c.list.length;
          c.list.forEach((f, i) => {
            const slot = L - 1 - i;                     // 0 = newest
            f.sy += (slot - f.sy) * 0.5;                // ease up a line when a newer one arrives
            const age = now - f.t0, life = f.cat === "grill" ? 1500 : 1300, k = age / life;
            let a = k < 0.75 ? 1 : (1 - k) / 0.25; if (slot >= MAX) a = Math.min(a, Math.max(0, 1 - (slot - MAX + 1) * 0.8));
            if (a <= 0.02) return;
            const y = base - 14 - f.sy * LH - Math.min(k, 0.75) * 8;
            const big = f.cat === "grill" && (f.label === "PERFECT!" || f.label === "GOOD!");
            const pop = age < 160 ? 1 + 0.35 * (1 - age / 160) : 1;
            const col = f.cat === "waste" ? "#ff5a4d" : (META[f.cat] || META.grill).col;
            const head = f.cat === "waste" ? f.label : (f.pts > 0 ? "+" + f.pts + " " : "") + f.label;
            const sz = Math.round((big ? (f.label === "PERFECT!" ? 20 : 17) : 13) * pop);
            ctx.globalAlpha = Math.max(0, a);
            ctx.font = '900 ' + sz + 'px "Saira Condensed","Arial Narrow",sans-serif';
            const w = ctx.measureText(head).width + 12;   // a dark pill behind each: reads over any art, never over another pop
            ctx.fillStyle = "rgba(10,6,4,.72)"; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(c.x - w / 2, y - sz + 1, w, sz + 4, 5) : ctx.rect(c.x - w / 2, y - sz + 1, w, sz + 4); ctx.fill();
            if (big) { ctx.shadowColor = f.label === "PERFECT!" ? "rgba(255,210,63,.9)" : "rgba(122,209,122,.8)"; ctx.shadowBlur = 10; }
            ctx.fillStyle = big && f.label === "PERFECT!" ? "#ffe27a" : col; ctx.fillText(head, c.x, y);
            ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
          });
        }
        ctx.restore();
      },
    };
  }

  // ---- HUD (2 rows, ~246px wide): the four emblem chips filling this shift; the waste tally + the drink rail ----
  function drawHud(ctx, g, x, y, txt, opts = {}) {
    const b = breakdown(g), sk = skinOf(g);
    let cx = x;
    for (const c of CATS) {                                    // four little badges: colour = the emblem tier you're on
      const t = b.cats[c].tier;
      ctx.fillStyle = "rgba(10,6,4,.7)"; ctx.fillRect(cx, y, 58, 15);
      ctx.fillStyle = TIER_COL[t]; ctx.fillRect(cx + 2, y + 2, 11, 11);
      txt(META[c].name, cx + 16, y + 12, 10, META[c].col, "left", 800); cx += 62;
    }
    // the WASTE BIN (second row): one tossed patty per waste, the cost in red (show it, don't bury it)
    const wx = x; y += 19;
    ctx.fillStyle = "rgba(10,6,4,.7)"; ctx.fillRect(wx, y, 104, 15);
    ctx.fillStyle = "#6b6f72"; ctx.fillRect(wx + 3, y + 3, 9, 10); ctx.fillStyle = "#4a4d50"; ctx.fillRect(wx + 2, y + 2, 11, 2);   // the bin
    const n = Math.min(6, b.waste);
    for (let k = 0; k < n; k++) { ctx.fillStyle = "#3a2214"; ctx.beginPath(); ctx.ellipse(wx + 18 + k * 7, y + 8, 3.5, 2.5, 0, 0, 7); ctx.fill(); }
    txt(b.waste ? (sk === "school" ? "WASTED " : "WASTE ") + b.waste + "  -" + b.wasteCost : (sk === "school" ? "NO WASTE" : "WASTE 0"),
        wx + 100, y + 12, 10, b.waste ? "#ff5a4d" : "#a89a80", "right", 800);
    if (opts.drinks && g.service && g.service.drinks) drawRail(ctx, g, wx + 110, y - 2, txt);
  }
  // the DRINK RAIL at the pass (placeholder glasses — canvas-drawn until the Blender drink art lands)
  function drawRail(ctx, g, x, y, txt) {
    const d = g.service.drinks, POUR = (root.PM || {}).DRINK_POUR || { WATER: 8, SODA: 14, MILKSHAKE: 36 };
    ctx.fillStyle = "rgba(10,6,4,.7)"; ctx.fillRect(x, y, 70, 19);
    d.rail.forEach((e, k) => drawGlass(ctx, x + 12 + k * 22, y + 17, e ? e.drink : null, e ? Math.min(1, e.pour / POUR[e.drink]) : 0, 0.9));
    if (d.queue.length) txt("+" + d.queue.length, x + 68, y + 13, 9, "#a89a80", "right", 800);
  }
  // a drink glass: SODA tall amber-brown w/ straw, WATER clear blue, MILKSHAKE a fluted glass + cream + cherry.
  // fill 0..1 = how poured it is. Render-only placeholder (docs/SCORING-1112.md lists the Blender art owed).
  function drawGlass(ctx, x, y, drink, fill, s = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const shake = drink === "MILKSHAKE", h = shake ? 16 : 18, wTop = shake ? 7 : 5.5, wBot = shake ? 3.5 : 4.5;
    ctx.beginPath(); ctx.moveTo(-wBot, 0); ctx.lineTo(-wTop, -h); ctx.lineTo(wTop, -h); ctx.lineTo(wBot, 0); ctx.closePath();
    ctx.fillStyle = "rgba(220,235,245,.18)"; ctx.fill();
    if (drink && fill > 0) {
      const fh = h * fill, wf = wBot + (wTop - wBot) * fill;
      ctx.beginPath(); ctx.moveTo(-wBot, 0); ctx.lineTo(-wf, -fh); ctx.lineTo(wf, -fh); ctx.lineTo(wBot, 0); ctx.closePath();
      ctx.fillStyle = drink === "SODA" ? "#7a3a1a" : drink === "WATER" ? "rgba(140,200,240,.75)" : "#f3d2dc"; ctx.fill();
      if (fill >= 1 && shake) { ctx.fillStyle = "#fff6ea"; ctx.beginPath(); ctx.arc(0, -h - 1, 5, Math.PI, 0); ctx.fill();
        ctx.fillStyle = "#d0202a"; ctx.beginPath(); ctx.arc(0, -h - 6, 1.8, 0, 7); ctx.fill(); }
      if (fill >= 1 && drink === "SODA") { ctx.strokeStyle = "#e84a3a"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(1.5, -h + 2); ctx.lineTo(3.5, -h - 6); ctx.stroke(); }
    }
    ctx.strokeStyle = "rgba(235,245,255,.75)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-wBot, 0); ctx.lineTo(-wTop, -h); ctx.moveTo(wTop, -h); ctx.lineTo(wBot, 0); ctx.lineTo(-wBot, 0); ctx.stroke();
    ctx.restore();
  }

  // ---- the END-OF-SHIFT breakdown card ----
  function drawCard(ctx, g, W, H, txt, opts = {}) {
    const b = breakdown(g), sk = skinOf(g), cw = Math.min(560, W - 40), ch = 300, x0 = (W - cw) / 2, y0 = Math.max(10, (H - ch) / 2);
    ctx.fillStyle = "rgba(12,7,5,.92)"; ctx.fillRect(x0, y0, cw, ch);
    ctx.strokeStyle = "#e0a92e"; ctx.lineWidth = 2; ctx.strokeRect(x0 + 0.5, y0 + 0.5, cw - 1, ch - 1);
    txt(opts.title || "SHIFT CLEAR", x0 + 18, y0 + 30, 22, "#7ad17a", "left", 800);
    txt("GRADE", x0 + cw - 92, y0 + 26, 12, "#a89a80", "center", 800);
    txt(b.grade, x0 + cw - 92, y0 + 66, 44, b.grade[0] === "A" ? "#ffd23f" : b.grade === "B" ? "#c9d2da" : "#e0a92e", "center", 900);
    const g5 = b.grades;
    txt("PERFECT " + (g5.PERFECT || 0) + " · GOOD " + (g5.GOOD || 0) + " · OK " + (g5.OK || 0) + " · UNDER/OVER " + ((g5.UNDER || 0) + (g5.OVER || 0)),
        x0 + 18, y0 + 50, 12, "#f3e6c8", "left", 700);
    let yy = y0 + 82;
    for (const c of CATS) {
      const r = b.cats[c], th = PER_ORDER[c], per = r.pts / Math.max(1, b.served);
      txt(META[c].name, x0 + 18, yy + 13, 15, META[c].col, "left", 800);
      txt(String(r.pts), x0 + 150, yy + 13, 15, "#f3e6c8", "right", 800);
      const bx = x0 + 160, bw = cw - 360;                     // the bar fills toward the top emblem
      ctx.fillStyle = "#241c12"; ctx.fillRect(bx, yy + 3, bw, 11);
      ctx.fillStyle = META[c].col; ctx.fillRect(bx, yy + 3, bw * Math.min(1, per / th[3]), 11);
      for (const t of th) { ctx.fillStyle = "rgba(10,6,4,.9)"; ctx.fillRect(bx + bw * t / th[3] - 1, yy + 1, 2, 15); }
      ctx.fillStyle = r.col; ctx.beginPath(); ctx.arc(bx + bw + 16, yy + 9, 8, 0, 7); ctx.fill();
      txt(r.emblem, bx + bw + 30, yy + 14, 13, r.tier ? r.col : "#7d6f5c", "left", 800);
      yy += 30;
    }
    ctx.fillStyle = "rgba(255,90,77,.12)"; ctx.fillRect(x0 + 12, yy, cw - 24, 22);
    // The cost line and SHIFT POINTS share one row: measure both and step the size (then the wording) down until
    // they fit with a clear gap, so "WASTE TALLY 1 × 60 = -60 (redone)" never runs into "SHIFT POINTS" (1112 fix).
    const cost = (root.PM && root.PM.WASTE_COST) || 60, room = cw - 36 - 24;
    const lefts = [(sk === "school" ? "WASTED TRAYS " : "WASTE TALLY ") + b.waste + " × " + cost + " = -" + b.wasteCost + " (redone)",
                   (sk === "school" ? "WASTED " : "WASTE ") + b.waste + " × " + cost + " = -" + b.wasteCost,
                   "WASTE -" + b.wasteCost];
    const right = "SHIFT POINTS " + b.total;
    const wid = (s, sz) => { ctx.font = "800 " + sz + 'px "Saira Condensed","Arial Narrow",sans-serif'; return ctx.measureText(s).width; };
    let left = lefts[lefts.length - 1], fs = 11;
    found: for (const l of lefts) for (const sz of [14, 13, 12, 11]) if (wid(l, sz) + wid(right, sz) <= room) { left = l; fs = sz; break found; }
    txt(left, x0 + 18, yy + 16, fs, "#ff5a4d", "left", 800);
    txt(right, x0 + cw - 18, yy + 16, fs, "#f3e6c8", "right", 800);
    yy += 34;
    const rk = opts.rank || peekRank(g);
    const A = rk.after || rk;
    txt("RANK  " + A.title + (rk.up ? "  — PROMOTED!" : ""), x0 + 18, yy + 13, 14, rk.up ? "#ffd23f" : "#e0a92e", "left", 800);
    const rx = x0 + 18, rw = cw - 36;
    ctx.fillStyle = "#241c12"; ctx.fillRect(rx, yy + 20, rw, 8); ctx.fillStyle = "#e0a92e"; ctx.fillRect(rx, yy + 20, rw * Math.min(1, A.frac), 8);
    if (A.next) txt(A.toNext + " to " + A.next, x0 + cw - 18, yy + 13, 11, "#a89a80", "right", 700);
    if (opts.foot) txt(opts.foot, W / 2, y0 + ch - 8, 13, "#f3e6c8", "center", 700);
  }

  const API = { CATS, META, PER_ORDER, TIERS, TIER_COL, RANKS, GRADES, tierOf, breakdown, bank, peekRank, rankOf, loadRank,
                createFeed, drawHud, drawRail, drawGlass, drawCard };
  root.PMScore = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
