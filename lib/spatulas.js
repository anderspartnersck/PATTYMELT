// PATTY MELT — THE TWO-SPATULA MANDATE (render layer). Joe 2026-10-26:
//   "each player should control 2 spatulas, and they must use these spatulas to manipulate the bread, burgers,
//    cheese, and even the onion mix for the patty melt. grilled cheese bread and cheese as well. mandate it and
//    even tell the audience in the game its all about food safety"
// No hands on the food, ever. Each cook's cursor is a PAIR of painted spatulas (spatula-level.png, the right one as
// painted, the left one mirrored, blades pointing in at the slot). Every food move the engine makes is shown being
// done BY the pair: FLIP = slide under + toss + clap, CHEESE = the slice rides a blade in and slides off (patty melts
// get the onion mix first, carried on the other blade), TOAST = the bread is carried in flat and pressed, HANDOFF =
// the pair carries the item across, DROP = the pair tips it off the grill, HEY BILLY = the spatulas clang ("sing").
//
// Parity-safe by construction: this file never writes engine state. It OBSERVES the state each frame (diffing slots
// and the toaster, like detectFlips), so the bot/attract demo animates too, and node parity never loads it.
// Shading: light from the upper left (the baked flat-top's key). Every spatula and every airborne food item casts a
// soft shadow on the grill that tightens and darkens as it comes down to contact.
//
//   PMSpat.load(base)                       load spatula-level.png from `base` (…/assets/sprites/grill/)
//   PMSpat.observe(s)                       once per frame, before drawing the grill: detect actions
//   PMSpat.hidden(s, idx)                   true while the food at cursor index idx is riding the spatulas
//                                           (idx = grill slot, or slots.length + toaster slot)
//   PMSpat.drawPair(ctx, s, pi, glide, o)   draw player pi's pair; glide = {x, y, vx} (the airy spring)
//      o.slotXY(idx) -> {x, y, r}           centre + food radius of a cursor index (grill or toaster)
//      o.food(name)  -> Image|null          'raw' 'seared' 'done' 'burnt' 'cheese' 'bread' 'rye' ('onion' is painted here)
//      o.h                                  drawn spatula height, px      o.foodW  food width (match the grill's)
//      o.rim                                the cook's colour, a soft rim glow on both spatulas
//      o.selfFlip                           the page animates the flipping item itself (kitchen.html's PMDrawItem)      o.filter  canvas filter for this cook's pair
//      o.fromBehind                         REAR COOKS (?cooks=rear): handles point back DOWN the screen, toward the cook
//      o.grips                              (out) [left, right] handle ends {x, y} this frame — where the cook's hands go
//   PMSpat.SAFETY                           the audience copy ({diner, school} lines)
(function (global) {
  "use strict";
  const PM = global.PM;
  const SPR = {};
  function load(base) {
    const im = new Image(); im.onload = () => { SPR.level = im; }; im.src = base + "spatula/spatula-level.png";
    // JOE'S TOPPINGS (1027, tools/cut_toppings.py): the onion + Swiss cook ladders, the prep pans, the plated melt.
    // Each one appears the instant it loads; absent = the procedural stand-in below stays (game always playable).
    const files = {};
    for (const st of ONION_ST) for (const v of ["top", "side"]) files["onion-" + st + "-" + v] = base + "onion-" + st + "-" + v + ".png";
    for (const st of SWISS_ST) for (const v of ["slice", "draped"]) files["swiss-" + st + "-" + v] = base + "swiss-" + st + "-" + v + ".png";
    for (const b of ["onions", "swiss", "american"]) files["bin-" + b] = base + "bin-" + b + ".png";
    for (const t of ["diner", "heroes"]) files["plated-" + t] = base + "../dining/plated-pattymelt-" + t + ".png";
    for (const [k, f] of Object.entries(files)) { const t = new Image(); t.onload = () => { t.pmPad = 16; TOP[k] = t; }; t.src = f; }
  }
  // ---- THE TOPPING LADDERS (render-only: read the engine's step/stage/cook, never write) ----
  const ONION_ST = ["raw", "soft", "golden", "burnt"], SWISS_ST = ["fresh", "melting", "browned"];
  const TOP = {};
  const OFF = typeof location !== "undefined" && /[?&]toppings=0\b/.test(location.search);   // QA: the old procedural look
  const isMeltItem = (p) => !!(p && p.stage !== undefined && PM && PM.RECIPES[p.item] && PM.RECIPES[p.item].includes("ONION"));
  // The melt's ONIONS step: the onions go on (engine: step passes ONION, cook resets to 0) and then cook in the
  // Swiss step's own sear window until the Swiss lands. raw when laid ▸ soft ▸ GOLDEN across the go-window
  // (cook >= sear_ready = the perfect time to lay the Swiss) ▸ burnt in the red near-burn band (the last 6 ticks
  // before the engine burns the melt — the same band the slot ring flashes red). KIDS never burn: the band sits at
  // 2x ready so overstaying still shows.
  function onionStage(p, s) {
    if (!onionsOn(p)) return null;
    const ready = PM.sear_ready(p), burn = Math.min(s && s.cfg ? PM.sear_burn_of(s, p) : PM.SEAR_BURN, ready * 2);
    if (p.cook >= burn - 6) return "burnt";
    if (p.cook >= ready) return "golden";
    return p.cook < ready * 0.35 ? "raw" : "soft";
  }
  // The Swiss on a melt (MELT ▸ DONE): fresh as laid, melting through the melt window, BROWNED once a finished melt
  // has sat on the flat-top past twice the melt time (jammed waiting on its bun or on Billy = overcooked).
  const BROWN_AFTER = 2;                                   // x MELT_DONE ticks sitting DONE on the grill
  function swissStage(p) {
    if (!isMeltItem(p)) return null;
    if (p.stage === "MELT") return p.cook < PM.MELT_DONE * 0.3 ? "fresh" : "melting";
    if (p.stage === "DONE") return p.cook >= PM.MELT_DONE * BROWN_AFTER ? "browned" : "melting";
    return null;
  }
  function topping(key) { return OFF ? null : (TOP[key] || null); }
  // draw a topping sprite centred on (x,y), w wide (keeps the art's aspect; the 16px clear border is trimmed off)
  function drawTop(ctx, im, x, y, w) {
    const B = 16, iw = im.width - 2 * B, ih = im.height - 2 * B, h = w * ih / iw;
    ctx.drawImage(im, B, B, iw, ih, x - w / 2, y - h / 2, w, h); return h;
  }
  // the blade's centre in spatula-level.png (600×412; blade lower-left, handle upper-right), as fractions
  const BLADE_AX = 0.18, BLADE_AY = 0.60;
  const GRIP_AX = 0.90, GRIP_AY = 0.10;                   // the handle's end (where a hand closes), as fractions
  const TILT = -0.5;
  const TILT_BEHIND = 0.85;                                // REAR COOKS: the flipped pair's handles turn down, in at her shoulders                                         // raise the handles: the painted spatula lies too flat for a pair

  const DUR = { FLIP: 620, CHEESE: 560, ONION: 600, MELT_CHEESE: 820, TOAST: 600, BUN: 600, BILLY: 420, HANDOFF: 560, DROP: 520 };
  const SAFETY = {
    diner:  ["NO HANDS ON THE FOOD.", "TWO SPATULAS, EVERY ITEM.", "IT'S ALL ABOUT FOOD SAFETY."],
    school: ["NO HANDS ON THE FOOD.", "TWO SPATULAS, EVERY TRAY. LUNCH-LADY LAW.", "IT'S ALL ABOUT FOOD SAFETY."],
  };

  const per = new WeakMap();                                       // state -> {prev, anim[pi], key}
  const now = () => performance.now();
  const ease = (k) => k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k);
  const seg = (k, a, b) => ease((k - a) / (b - a));                // 0..1 across [a,b] of an anim
  const lerp = (a, b, k) => a + (b - a) * k;

  function snap(e) {
    if (!e) return null;
    if (e.stage === undefined) return { bun: true, born: e.born };
    return { born: e.born, step: e.step, item: e.item, stage: e.stage };
  }
  function cursorNear(s, idx) {
    let best = 0, bd = 1e9;
    s.players.forEach((pl, pi) => { const d = Math.abs(pl.cursor - idx); if (d < bd) { bd = d; best = pi; } });
    return best;
  }
  function start(st, pi, a) { a.t0 = now(); a.dur = DUR[a.kind] || 560; st.anim[pi] = a; }

  function observe(s) {
    if (!s || !s.slots) return;
    let st = per.get(s);
    const cur = s.slots.map(snap).concat((s.toaster || []).map(snap));
    if (!st) { per.set(s, { prev: cur, anim: [], key: "" }); return; }
    const prev = st.prev, n = s.slots.length;
    if (prev.length === cur.length) {
      for (let i = 0; i < cur.length; i++) {
        const a = prev[i], b = cur[i];
        if (b && !b.bun && a && !a.bun && a.born === b.born && b.step > a.step) {          // a recipe step landed
          const act = PM.RECIPES[a.item][a.step];
          const kind = act === "CHEESE" && PM.TOAST_ITEMS.has(a.item) && !(PM.RECIPES[a.item] || []).includes("ONION") ? "MELT_CHEESE" : act;
          // (ONION is its own step now — Joe 1026 "onions are a step": the melt's onions land on their own press)
          start(st, cursorNear(s, i), { kind, idx: i, item: a.item, from: a.stage });
        } else if (b && b.bun && !a) {                                                    // a bun laid on the toaster
          start(st, cursorNear(s, i), { kind: "BUN", idx: i, item: "BUN" });
        } else if (a && !a.bun && !b && i < n) {
          const j = cur.findIndex((c, k) => k < n && k !== i && c && c.born === a.born && !(prev[k] && prev[k].born === a.born));
          if (j >= 0) start(st, cursorNear(s, i), { kind: "HANDOFF", idx: i, to: j, item: a.item, from: a.stage });
          else if (s.flash === "DROPPED!") start(st, cursorNear(s, i), { kind: "DROP", idx: i, item: a.item, from: a.stage });
        }
      }
    }
    // HEY BILLY: the holler is a flash, not a slot change. Fresh = flash_t at full on a tick we haven't seen.
    const holler = PM.THEMES[s.theme] && PM.THEMES[s.theme].holler;
    if (s.flash === holler && s.flash_t === PM.TPS) {
      const key = s.ticks + ":" + holler;
      if (key !== st.key) {
        st.key = key;
        const pi = s.players.length < 2 ? s.billy_facing : (s.billy_turn_t > 0 ? s.billy_turn_to : s.billy_facing);
        if (!st.anim[pi] || now() - st.anim[pi].t0 > st.anim[pi].dur) start(st, pi, { kind: "BILLY", idx: s.players[pi].cursor });
      }
    }
    st.prev = cur;
  }
  function live(st, pi) { const a = st && st.anim[pi]; return a && now() - a.t0 < a.dur ? a : null; }
  function hidden(s, idx) {
    const st = per.get(s); if (!st) return false;
    for (let pi = 0; pi < st.anim.length; pi++) {
      const a = live(st, pi); if (!a) continue;
      const k = (now() - a.t0) / a.dur;
      if ((a.kind === "FLIP" || (a.kind === "TOAST" && a.item !== "GRILLED_CHEESE")) && a.idx === idx && k < 0.82) return true;
      if ((a.kind === "BUN") && a.idx === idx && k < 0.5) return true;
      if (a.kind === "HANDOFF" && a.to === idx && k < 0.9) return true;
    }
    return false;
  }

  // ---- drawing helpers ----
  function shadow(ctx, x, y, rx, ry, a) {                   // soft contact/cast shadow on the grill
    if (a <= 0.01) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, "rgba(10,5,2," + (a * 0.55).toFixed(3) + ")");
    g.addColorStop(0.6, "rgba(10,5,2," + (a * 0.28).toFixed(3) + ")");
    g.addColorStop(1, "rgba(10,5,2,0)");
    ctx.save(); ctx.fillStyle = g; ctx.translate(x, y); ctx.scale(1, ry / rx); ctx.translate(-x, -y);
    ctx.beginPath(); ctx.arc(x, y, rx, 0, 7); ctx.fill(); ctx.restore();
  }
  // one spatula with its blade centre at (x,y); side -1 = the LEFT spatula (mirrored), +1 = the RIGHT (as painted)
  let CUR = null;                                           // the drawPair options in force (fromBehind, grips)
  function spatula(ctx, x, y, side, rot, h, lift, filter, rim) {
    const im = SPR.level, fy = CUR && CUR.fromBehind ? -1 : 1;
    if (CUR && CUR.grips && im && im.width) {                // where this spatula's handle ends, for the cook's hand
      const sc = h / im.height, lx = side * (GRIP_AX - BLADE_AX) * im.width * sc, ly = fy * (GRIP_AY - BLADE_AY) * im.height * sc;
      const th = (rot + (fy < 0 ? TILT_BEHIND : TILT)) * side, c = Math.cos(th), sn = Math.sin(th);
      CUR.grips[side < 0 ? 0 : 1] = { x: x + lx * c - ly * sn, y: y - lift + lx * sn + ly * c };
    }
    shadow(ctx, x + 6 + lift * 0.5, y + h * 0.10 + lift * 0.9, h * (0.40 + lift * 0.004), h * 0.11, Math.max(0.15, 0.85 - lift / 60));
    ctx.save(); ctx.translate(x, y - lift); ctx.rotate((rot + (fy < 0 ? TILT_BEHIND : TILT)) * side); ctx.scale(side, fy);
    if (im && im.width) {
      const sc = h / im.height;
      if (filter) ctx.filter = filter;
      if (rim) { ctx.shadowColor = rim; ctx.shadowBlur = Math.max(3, h * 0.08); }   // the cook's colour, so the pair reads on a dark grill
      ctx.drawImage(im, -im.width * BLADE_AX * sc, -im.height * BLADE_AY * sc, im.width * sc, im.height * sc);
      ctx.filter = "none"; ctx.shadowBlur = 0;
    } else {                                                // vector stand-in: blade + handle
      ctx.fillStyle = "#c9c2b2"; ctx.beginPath(); ctx.moveTo(-h * 0.2, 0); ctx.lineTo(h * 0.2, -h * 0.06);
      ctx.lineTo(h * 0.24, h * 0.06); ctx.lineTo(-h * 0.16, h * 0.1); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#6b3b1c"; ctx.lineWidth = h * 0.07; ctx.beginPath(); ctx.moveTo(h * 0.18, -h * 0.02);
      ctx.lineTo(h * 0.62, -h * 0.5); ctx.stroke();
    }
    ctx.restore();
  }
  function food(ctx, o, name, x, y, w, rot, sy, height) {  // a food item riding the blades (or in the air)
    shadow(ctx, x + 4 + height * 0.35, y + w * 0.18 + height, w * (0.55 + height * 0.004), w * 0.16, Math.max(0.12, 0.8 - height / 70));
    const tp = name === "onion" ? topping("onion-raw-side") : name === "swiss" ? topping("swiss-fresh-slice") : null;   // Joe's art rides the blade
    const im = tp ? null : (name === "onion" ? null : o.food(name === "swiss" ? "cheese" : name));
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.scale(1, sy == null ? 1 : sy);
    if (tp) drawTop(ctx, tp, 0, 0, w * (name === "onion" ? 0.95 : 0.9));
    else if (im && im.width) { const h = w * im.height / im.width; ctx.drawImage(im, -w / 2, -h / 2, w, h); }
    else if (name === "onion") onionMix(ctx, w);
    else if (name === "cheese") { ctx.fillStyle = "#f2c230"; ctx.fillRect(-w * 0.42, -w * 0.32, w * 0.84, w * 0.64);
      ctx.fillStyle = "rgba(255,240,170,.6)"; ctx.fillRect(-w * 0.42, -w * 0.32, w * 0.84, w * 0.1); }
    else { ctx.fillStyle = name === "raw" ? "#b9775a" : name === "bread" || name === "rye" ? "#c99a5a" : "#7c4f2c";
      ctx.beginPath(); ctx.ellipse(0, 0, w * 0.45, w * 0.3, 0, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  // THE ONION MIX — painted here: a low mound of caramelized slivers, dark underside, lit tops (key upper-left)
  const ONION = []; { let r = 7; const R = () => (r = (r * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 16; i++) ONION.push([R() * 2 - 1, R() * 2 - 1, R() * Math.PI, 0.18 + R() * 0.16, R()]); }
  function onionMix(ctx, w) {
    const rx = w * 0.4, ry = w * 0.2;
    ctx.fillStyle = "#4a2a10"; ctx.beginPath(); ctx.ellipse(0, ry * 0.25, rx, ry, 0, 0, 7); ctx.fill();   // underside
    for (const [u, v, a, len, c] of ONION) {
      const x = u * rx * 0.85, y = v * ry * 0.8, L = len * w;
      ctx.strokeStyle = c < 0.33 ? "#8a4f1c" : c < 0.66 ? "#b8752c" : "#d9a04a"; ctx.lineWidth = Math.max(1.5, w * 0.05);
      ctx.lineCap = "round"; ctx.beginPath(); ctx.arc(x, y, L * 0.5, a, a + 1.6); ctx.stroke();
      ctx.strokeStyle = "rgba(255,226,160,.55)"; ctx.lineWidth = Math.max(0.8, w * 0.018);     // the lit edge
      ctx.beginPath(); ctx.arc(x - w * 0.01, y - w * 0.012, L * 0.5, a + 0.2, a + 1.0); ctx.stroke();
    }
  }
  function preName(a) {                                     // what the item looked like BEFORE this action
    if (a.item === "GRILLED_CHEESE") return a.from === "BURNT" ? "burnt" : "bread";
    if (a.from === "SEAR_A") return "raw";
    if (a.from === "MELT" || a.from === "DONE") return "done";
    return "seared";
  }

  function drawPair(ctx, s, pi, g, o) {
    CUR = o; try { drawPair_(ctx, s, pi, g, o); } finally { CUR = null; }
  }
  function drawPair_(ctx, s, pi, g, o) {
    const st = per.get(s), a = live(st, pi), h = o.h || 60, f = o.filter || "", rim = o.rim || "";
    const t = now();
    const lean = Math.max(-0.35, Math.min(0.35, (g.vx || 0) * 0.0009));
    if (!a) {                                                // idle / travel: the pair hovers either side of the slot
      const z = o.slotXY(s.players[pi].cursor), r = z.r, bob = Math.sin(t / 380 + pi) * 1.5;
      const travel = Math.min(8, Math.abs(g.vx || 0) * 0.012), trail = -(g.vx || 0) * 0.02;
      const x = g.x, y = g.y;
      spatula(ctx, x - r * 1.05 + (g.vx < 0 ? 0 : trail), y - r * 0.05 + bob, -1, 0.10 + lean, h, 10 + travel, f, rim);
      spatula(ctx, x + r * 1.05 + (g.vx > 0 ? 0 : trail), y - r * 0.05 - bob, +1, 0.10 - lean, h, 10 + travel, f, rim);
      return;
    }
    const k = (t - a.t0) / a.dur, z = o.slotXY(a.idx), r = z.r, x = z.x, y = z.y, W = o.foodW || r * 1.9;
    if (a.kind === "FLIP") {                                 // slide under · toss · clap · land
      const under = seg(k, 0, 0.25), air = seg(k, 0.25, 0.78), land = seg(k, 0.78, 1);
      const hgt = Math.sin(Math.PI * Math.min(1, Math.max(0, (k - 0.25) / 0.53))) * r * 1.5;
      const sy = Math.cos(Math.PI * air), nm = air < 0.5 ? preName(a) : (a.item === "GRILLED_CHEESE" ? "bread" : "seared");
      const lx = lerp(x - r * 1.05, x - r * 0.15, under) - air * r * 0.2 + land * r * -0.7;
      spatula(ctx, lx, y + r * 0.05, -1, lerp(0.1, -0.15, under) + air * 0.35, h, lerp(10, 0, under) + hgt * 0.35, f, rim);
      if (k < 0.82 && !o.selfFlip) food(ctx, o, nm, x, y - hgt, W, air * 0.3, Math.abs(sy) < 0.12 ? 0.12 * Math.sign(sy || 1) : sy, hgt);
      const clap = seg(k, 0.4, 0.6) * (1 - land);
      spatula(ctx, lerp(x + r * 1.05, x + r * 0.35, clap), y - hgt * 0.9 * clap + r * 0.05, +1, 0.1 - clap * 0.3, h, 10 + clap * 6, f, rim);
    } else if (a.kind === "CHEESE" || a.kind === "MELT_CHEESE" || a.kind === "ONION") {
      // ONION (its own step on a melt): the onion mix rides in on the left blade while the right steadies the patty.
      // CHEESE: the slice on the right blade. MELT_CHEESE (the old single-step melt) = both, onions first.
      const melt = a.kind !== "CHEESE", onlyOnion = a.kind === "ONION", c0 = a.kind === "MELT_CHEESE" ? 0.42 : 0;
      const ok = onlyOnion ? k * 0.6 : k;                   // ONION plays the onion beat across its whole duration
      if (melt) {
        const inn = seg(ok, 0, 0.22), tip = seg(ok, 0.22, 0.38), back = seg(ok, 0.38, 0.6);
        const ox = lerp(x - r * 2.6, x - r * 0.2, inn) - back * r * 0.9, oy = y - r * 0.9 * (1 - inn) - r * 0.25;
        if (k < 0.38) food(ctx, o, "onion", lerp(ox + r * 0.1, x, tip), lerp(oy - r * 0.15, y - r * 0.12, tip), W * 0.8, 0, 1, 10 * (1 - tip));
        else food(ctx, o, "onion", x, y - r * 0.12, W * 0.8, 0, 1, 0);
        spatula(ctx, ox, oy, -1, 0.1 + tip * 0.5 - back * 0.4, h, 10 + (1 - inn) * 8, f, rim);
      } else spatula(ctx, x - r * 0.95, y + r * 0.02, -1, 0.05, h, 2, f, rim);   // the left blade steadies the patty
      if (onlyOnion) { spatula(ctx, x + r * 0.95, y + r * 0.02, +1, 0.05, h, 2, f, rim); return; }   // the right blade steadies it
      const inn = seg(k, c0, c0 + 0.3), tip = seg(k, c0 + 0.3, c0 + 0.45), back = seg(k, c0 + 0.45, 1);
      const cx = lerp(x + r * 2.6, x + r * 0.2, inn) + back * r * 0.9, cy = y - r * 0.9 * (1 - inn) - r * 0.25;
      if (k < c0 + 0.45) food(ctx, o, PM.TOAST_ITEMS.has(a.item) ? "swiss" : "cheese", lerp(cx - r * 0.1, x, tip), lerp(cy - r * 0.2, y - r * 0.2, tip), W * 0.82, -0.2 + tip * 0.2, 1, 10 * (1 - tip));
      spatula(ctx, cx, cy, +1, 0.1 + tip * 0.55 - back * 0.4, h, 10 + (1 - inn) * 8, f, rim);
    } else if (a.kind === "TOAST" || a.kind === "BUN") {     // bread carried in flat on both blades, then pressed twice
      const inn = seg(k, 0, 0.45), press = k > 0.5 ? Math.abs(Math.sin((k - 0.5) / 0.5 * Math.PI * 2)) : 0;
      const hgt = (1 - inn) * r * 1.6;
      const nm = a.kind === "BUN" ? "rye" : "bread";
      if (a.kind === "BUN" || a.item !== "GRILLED_CHEESE") { if (k < 0.5) food(ctx, o, nm, x, y - hgt, W, 0, 1, hgt); }
      const lx = k < 0.5 ? x - r * 0.45 : lerp(x - r * 0.45, x - r * 1.05, seg(k, 0.85, 1));
      const rx = k < 0.5 ? x + r * 0.45 : lerp(x + r * 0.45, x + r * 1.05, seg(k, 0.85, 1));
      const by = k < 0.5 ? y - hgt + r * 0.12 : y - r * 0.18;
      spatula(ctx, lx, by, -1, 0.0, h, k < 0.5 ? 0 : 3 - press * 3, f, rim);
      spatula(ctx, rx, by, +1, 0.0, h, k < 0.5 ? 0 : 3 - press * 3, f, rim);
    } else if (a.kind === "HANDOFF") {                       // the pair carries the item across to the partner's side
      const z2 = o.slotXY(a.to), m = seg(k, 0.1, 0.85), hgt = Math.sin(Math.PI * m) * r * 1.2;
      const fx = lerp(x, z2.x, m), fy = lerp(y, z2.y, m) - hgt;
      if (k < 0.9) food(ctx, o, preName(a), fx, fy, W, 0, 1, hgt);
      spatula(ctx, fx - r * 0.5, fy + r * 0.1, -1, -0.1, h, 0, f, rim);
      spatula(ctx, fx + r * 0.55, fy - r * 0.15, +1, 0.15, h, 2, f, rim);
    } else if (a.kind === "DROP") {                          // tipped off the front of the grill into the bin
      const m = seg(k, 0, 1), fy = y + m * m * r * 4, fx = x + m * r * 0.6;
      ctx.save(); ctx.globalAlpha = 1 - seg(k, 0.6, 1);
      food(ctx, o, preName(a), fx, fy, W * (1 - m * 0.3), m * 2.4, 1, 0); ctx.restore();
      spatula(ctx, x - r * 0.4, y + r * 0.1, -1, -0.2 - seg(k, 0, 0.3) * 0.5, h, 0, f, rim);
      spatula(ctx, x + r * 1.05, y, +1, 0.1, h, 8, f, rim);
    } else if (a.kind === "BILLY") {                         // HEY BILLY: the spatulas clang twice ("they sing")
      const c = Math.abs(Math.sin(k * Math.PI * 2)), up = r * 1.4;
      spatula(ctx, lerp(x - r * 1.05, x - r * 0.22, c), y - up, -1, 0.5, h, 14, f, rim);
      spatula(ctx, lerp(x + r * 1.05, x + r * 0.22, c), y - up, +1, 0.5, h, 14, f, rim);
      if (c > 0.92) { ctx.save(); ctx.fillStyle = "rgba(255,236,170,.9)"; ctx.font = "800 " + Math.round(r * 0.8) + "px sans-serif";
        ctx.textAlign = "center"; ctx.fillText("✶", x, y - up - h * 0.25 - 14); ctx.restore(); }
    }
  }

  // QA (web/spatula-lab.html): pin player pi's pair at fraction k through an action, so a still frame shows it
  function _force(s, pi, a, k) {
    let st = per.get(s); if (!st) { st = { prev: [], anim: [], key: "" }; per.set(s, st); }
    a.dur = DUR[a.kind] || 560; a.t0 = now() - k * a.dur; st.anim[pi] = a;
  }
  // the onions sit on a melt once laid, until the Swiss goes over them: pages draw this over the patty
  function onionsOn(p) { if (!p || p.stage === undefined || !PM || !PM.RECIPES[p.item]) return false;
    const i = PM.RECIPES[p.item].indexOf("ONION"); return i >= 0 && p.step === i + 1 && p.stage === "SEAR_B"; }   // (the Swiss then covers them)
  // drawOnions(ctx, x, y, w [, p, s, view]) — with the patty + state: Joe's sprite for its onionStage ('top' on the
  // grill, 'side' where the food is seen side-on); without (or art absent): the procedural mix, as before.
  function drawOnions(ctx, x, y, w, p, s, view) {
    const st = p ? onionStage(p, s) : null, im = st && topping("onion-" + st + "-" + (view || "top"));
    if (im) { drawTop(ctx, im, x, y, w); return; }
    ctx.save(); ctx.translate(x, y); onionMix(ctx, w); ctx.restore();
  }
  // drawSwiss(ctx, x, y, w, p [, view]) — the melt's Swiss for its swissStage. 'draped' = the slice over a patty
  // (it carries its own patty: draw it INSTEAD of the patty), 'slice' = the flat slice alone. false = no art.
  function drawSwiss(ctx, x, y, w, p, view) {
    const st = swissStage(p), im = st && topping("swiss-" + st + "-" + (view || "draped"));
    if (!im) return false; drawTop(ctx, im, x, y, w); return true;
  }
  // the prep pans the blades scoop from: 'onions' | 'swiss' | 'american'
  function drawBin(ctx, kind, x, y, w) { const im = topping("bin-" + kind); if (!im) return false; drawTop(ctx, im, x, y, w); return true; }
  // the plated patty melt (toasted marble rye, cut on the diagonal): diner plate, or the blue HEROES tray (school)
  function drawPlated(ctx, school, x, y, w) { const im = topping(school ? "plated-heroes" : "plated-diner"); if (!im) return false; drawTop(ctx, im, x, y, w); return true; }
  // QA (?fill=melt | melt2 on kitchen.html / cabinet.html): stage the melt's topping ladder across the grill so one
  // still frame shows every onion + Swiss state. Writes ONLY a QA game's slots (the page pauses it); never in play.
  function stageMelts(g, set) {
    const M = PM.Item.PATTY_MELT, mk = (item, step, stage, cook, bunned) => {
      const p = PM.Patty(0, item, stage); p.step = step; p.stage = stage; p.cook = cook; p.bunned = !!bunned; return p; };
    const rows = set === "melt2"
      ? [mk(M, 3, "DONE", PM.MELT_DONE * BROWN_AFTER + 4), mk(M, 3, "DONE", 3, true), mk(PM.Item.SMASH_MELT, 2, "SEAR_B", 22),
         mk(PM.Item.SMASH_MELT, 3, "MELT", 9), mk(PM.Item.BURGER, 2, "MELT", 9), mk(PM.Item.BURGER, 1, "SEAR_B", 6)]
      : [mk(M, 2, "SEAR_B", 1), mk(M, 2, "SEAR_B", 8), mk(M, 2, "SEAR_B", 16), mk(M, 2, "SEAR_B", 24),
         mk(M, 3, "MELT", 2), mk(M, 3, "MELT", 10)];
    for (let i = 0; i < g.slots.length; i++) g.slots[i] = rows[i % rows.length];
  }
  global.PMSpat = { load, stageMelts, observe, hidden, drawPair, onionsOn, drawOnions, SAFETY, DUR, _force,
                    isMeltItem, onionStage, swissStage, drawSwiss, drawBin, drawPlated, topping };
})(typeof globalThis !== "undefined" ? globalThis : this);
