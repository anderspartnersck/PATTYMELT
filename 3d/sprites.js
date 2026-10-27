// PATTY MELT — procedural side-view ITEM render (PuckArt lineage).  *** Dedicated to Christine & Phillip Coleman. ***
//
// Every menu item (BURGER · HAMBURGER · GRILLED CHEESE · PATTY MELT · DOUBLE CHEESE · SMASH · SMASH MELT)
// at every cook stage,
// drawn as a DIMENSIONAL stacked side-view object — a grounded contact shadow, a squashed top ellipse,
// and a side band with a vertical gradient (real thickness) — the way ONE-TIMER's lib/pucks.js renders a
// chip, NEVER a flat top-down blob. One procedural source, zero raster. Animated: a grill SIZZLE wobble,
// a REAL flip (lift on an arc + scaleY turn-over, the raw face on the way up, the seared side landing),
// cheese that sags + drips through the MELT, a "ready" bob + bun sheen on DONE, rising steam/smoke.
// Render-only + parity-safe: reads only the engine Patty (item / stage / cook / step / understeared).
//   PMDrawItem(ctx, patty, cx, cy, rad, PM, t)   — t = continuous seconds (performance.now()/1000); 0 = static
(function (g) {
  "use strict";
  const TAU = Math.PI * 2;
  const FLIP_DUR = 0.42;                 // seconds — the turn-over animation length
  const SETTLE_DUR = 0.18;               // seconds — the landing squash-and-recover after a flip

  // palette — warm diner griddle (sear ramp raw→done graded DOWN so raw never reads as a pink blob)
  const C = {
    rawTop0:"#cda088", rawTop1:"#b27a62", rawSide0:"#6b4338", rawSide1:"#472b22",
    searTop0:"#b07e48", searTop1:"#8a5e34", searSide0:"#553420", searSide1:"#341f12",
    doneTop0:"#9a6c3c", doneTop1:"#7c5430", doneSide0:"#46291a", doneSide1:"#2a180e", crust:"#321d10",
    burntTop0:"#3a2a1f", burntTop1:"#241812", burntSide0:"#150d08", burntSide1:"#080503",
    chzTop0:"#ffe07a", chzTop1:"#ffd24a", chzSide0:"#e0a92e", chzSide1:"#c08713", chzDrip:"#f6c33a",
    bunTop:"#dca85c", bunHi:"rgba(255,240,200,0.55)", bunRim:"#9c6c2e", seed:"#f5e3b6", bunBot:"#c8954c",
    toastPale:"#e9d3a0", toastGold:"#d9a441", toastDone:"#c2812f", breadSide:"#b9863f", breadCrust:"#7a531f",
    ryeTop:"#c39658", ryeSide:"#7c5a2c", ryeCrust:"#5e4220",
    // SMASH — caramelized golden crust + crispy lacy cheese-skirt. Deliberately WARM GOLD, graded far
    // above the near-black BURNT ramp so "extra-crispy premium" never reads as "charred".
    smashTop0:"#e0a352", smashTop1:"#b57a32", smashSide0:"#7a4e20", smashSide1:"#4a2e12",
    lace0:"#f2c568", lace1:"#cf9433", caram:"#8a5518",
  };

  function ell(ctx, cx, cy, rx, ry) { ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); }
  function vgrad(ctx, y0, y1, c0, c1) { const gg = ctx.createLinearGradient(0, y0, 0, y1); gg.addColorStop(0, c0); gg.addColorStop(1, c1); return gg; }

  // THE BUILDING BLOCK — a short cylinder seen 3/4: side band (vertical gradient = thickness) + top face.
  // Returns the y of the top face so callers can stack on it.
  function disc(ctx, cx, cy, rx, ry, th, top0, top1, side0, side1) {
    const topY = cy - th / 2, botY = cy + th / 2;
    ctx.beginPath();
    ctx.moveTo(cx - rx, topY); ctx.lineTo(cx - rx, botY);
    ctx.ellipse(cx, botY, rx, ry, 0, Math.PI, 0, true);     // front of the bottom rim
    ctx.lineTo(cx + rx, topY);
    ctx.ellipse(cx, topY, rx, ry, 0, 0, Math.PI, true);     // back of the top rim
    ctx.closePath();
    ctx.fillStyle = vgrad(ctx, topY, botY, side0, side1); ctx.fill();
    ell(ctx, cx, topY, rx, ry); ctx.fillStyle = vgrad(ctx, topY - ry, topY + ry, top0, top1); ctx.fill();
    return topY;
  }

  function patty(ctx, cx, cy, rad, stage, S) {
    let t0, t1, s0, s1;
    if (stage === S.SEAR_A)      { t0 = C.rawTop0;   t1 = C.rawTop1;   s0 = C.rawSide0;   s1 = C.rawSide1; }
    else if (stage === S.SEAR_B) { t0 = C.searTop0;  t1 = C.searTop1;  s0 = C.searSide0;  s1 = C.searSide1; }
    else if (stage === S.BURNT)  { t0 = C.burntTop0; t1 = C.burntTop1; s0 = C.burntSide0; s1 = C.burntSide1; }
    else                         { t0 = C.doneTop0;  t1 = C.doneTop1;  s0 = C.doneSide0;  s1 = C.doneSide1; }
    const ry = rad * 0.30, th = rad * 0.36;
    const topY = disc(ctx, cx, cy, rad, ry, th, t0, t1, s0, s1);
    if (stage !== S.SEAR_A) {                                // crust char speckle on the seared faces
      ctx.save(); ell(ctx, cx, topY, rad, ry); ctx.clip();
      ctx.fillStyle = stage === S.BURNT ? "#000" : C.crust; ctx.globalAlpha = stage === S.BURNT ? 0.7 : 0.45;
      for (let i = 0; i < 8; i++) { const a = i * 0.81, rr = rad * (0.18 + 0.62 * ((i * 37 % 11) / 11));
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr, topY + Math.sin(a) * ry * 0.78, rad * 0.045, 0, TAU); ctx.fill(); }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    return topY;
  }

  // SMASH patty — smashed thin on the flat-top: HALF a patty's thickness, a CARAMELIZED golden top and a
  // crispy LACY cheese-skirt frill spilling past the rim (irregular golden bits, deterministic — no flicker).
  // Reads "extra-crispy caramelized premium": every tone stays warm gold/amber, never the BURNT char ramp.
  function smashPatty(ctx, cx, cy, rad, stage, S) {
    const rawFace = stage === S.SEAR_A;
    const ry = rad * 0.26, th = rad * 0.18, botY = cy + th / 2;
    if (!rawFace) {                                       // the lacy skirt sits UNDER the patty, poking past the rim
      for (let i = 0; i < 12; i++) {
        const a = Math.PI * ((i + 0.5) / 12);             // the front bottom rim, right → left
        const j1 = ((i * 37) % 7) / 7, j2 = ((i * 53) % 5) / 5;
        const px = cx + Math.cos(a) * rad * (1.02 + 0.10 * j1);
        const py = botY + Math.sin(a) * ry * 0.85;
        const rr = rad * (0.055 + 0.075 * j2);
        ctx.fillStyle = j2 > 0.45 ? C.lace0 : C.lace1;
        ell(ctx, px, py, rr * 1.7, rr); ctx.fill();
      }
    }
    const topY = rawFace
      ? disc(ctx, cx, cy, rad, ry, th, C.rawTop0, C.rawTop1, C.rawSide0, C.rawSide1)
      : disc(ctx, cx, cy, rad, ry, th, C.smashTop0, C.smashTop1, C.smashSide0, C.smashSide1);
    if (!rawFace) {                                       // caramelized mottle — warm amber, NOT char-black
      ctx.save(); ell(ctx, cx, topY, rad, ry); ctx.clip();
      ctx.fillStyle = C.caram; ctx.globalAlpha = 0.38;
      for (let i = 0; i < 9; i++) { const a = i * 0.73, rr = rad * (0.15 + 0.66 * ((i * 41 % 13) / 13));
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr, topY + Math.sin(a) * ry * 0.8, rad * 0.05, 0, TAU); ctx.fill(); }
      ctx.fillStyle = C.lace0; ctx.globalAlpha = 0.5;      // golden crisp highlights
      for (let i = 0; i < 5; i++) { const a = i * 1.31 + 0.4, rr = rad * (0.2 + 0.6 * ((i * 29 % 7) / 7));
        ell(ctx, cx + Math.cos(a) * rr, topY + Math.sin(a) * ry * 0.7, rad * 0.06, rad * 0.03); ctx.fill(); }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    return topY;
  }

  function thinCheese(ctx, cx, cy, rad) {                   // a slice laid flat (pre-melt)
    disc(ctx, cx, cy, rad * 1.02, rad * 0.24, rad * 0.10, C.chzTop0, C.chzTop1, C.chzSide0, C.chzSide1);
  }
  function cheese(ctx, cx, cy, rad, melt) {                 // melt 0..1 — the slab sags + the drips grow
    const th = rad * 0.15, ry = rad * 0.26;
    disc(ctx, cx, cy, rad * 1.04, ry, th, C.chzTop0, C.chzTop1, C.chzSide0, C.chzSide1);
    const botY = cy + th / 2, base = rad * (0.08 + 0.42 * melt);
    ctx.fillStyle = C.chzDrip;
    for (const k of [-0.58, -0.18, 0.2, 0.6]) {                  // rounded cheese lobes of varied length
      const dx = cx + k * rad * 0.86, w = rad * (0.12 + 0.04 * Math.abs(Math.sin(k * 5)));
      const len = base * (0.55 + 0.55 * Math.abs(Math.sin(k * 9 + melt * 3)));
      ctx.beginPath();
      ctx.moveTo(dx - w, botY - 1); ctx.lineTo(dx + w, botY - 1);
      ctx.quadraticCurveTo(dx + w, botY + len, dx, botY + len);
      ctx.quadraticCurveTo(dx - w, botY + len, dx - w, botY - 1);
      ctx.closePath(); ctx.fill();
    }
  }

  function bunBottom(ctx, cx, cy, rad) {
    disc(ctx, cx, cy, rad, rad * 0.26, rad * 0.22, C.bunBot, "#bd8a48", "#a06f33", "#7c5424");
  }
  function bunCrown(ctx, cx, cy, rad, bad) {                // domed top bun + sheen + sesame
    const w = rad * 1.06, h = rad * 0.72;
    ctx.beginPath(); ctx.moveTo(cx - w, cy); ctx.quadraticCurveTo(cx - w, cy - h, cx, cy - h);
    ctx.quadraticCurveTo(cx + w, cy - h, cx + w, cy); ctx.closePath();
    ctx.fillStyle = bad ? "#caa06a" : C.bunTop; ctx.fill();
    ctx.save(); ctx.clip();
    const sg = ctx.createRadialGradient(cx - w * 0.3, cy - h * 0.7, 2, cx - w * 0.3, cy - h * 0.7, w);
    sg.addColorStop(0, C.bunHi); sg.addColorStop(1, "rgba(255,240,200,0)"); ctx.fillStyle = sg;
    ctx.fillRect(cx - w, cy - h, w * 2, h); ctx.restore();
    ctx.fillStyle = C.bunRim; ctx.fillRect(cx - w, cy - 2, w * 2, 3);
    if (!bad) { ctx.fillStyle = C.seed;
      for (const s of [[-0.42, -0.34], [0.06, -0.52], [0.46, -0.30], [-0.12, -0.22], [0.28, -0.14]]) {
        ctx.save(); ctx.translate(cx + s[0] * w, cy + s[1] * h); ctx.rotate(s[0]); ell(ctx, 0, 0, rad * 0.075, rad * 0.035); ctx.fill(); ctx.restore(); } }
  }
  function bread(ctx, cx, cy, rad, top, crust) {            // a toasted slice (side view)
    const topY = disc(ctx, cx, cy, rad, rad * 0.22, rad * 0.30, top, top, C.breadSide, "#9a6c30");
    if (crust) { const botY = cy + rad * 0.15; ctx.strokeStyle = crust; ctx.lineWidth = Math.max(1, rad * 0.05);
      ctx.beginPath(); ctx.moveTo(cx - rad, topY); ctx.lineTo(cx - rad, botY);
      ctx.ellipse(cx, botY, rad, rad * 0.22, 0, Math.PI, 0, true); ctx.lineTo(cx + rad, topY); ctx.stroke(); }
    return topY;
  }

  function steam(ctx, x, yTop, rad, t, smoke) {             // rising wisps — white steam cooking, dark smoke burnt
    const n = smoke ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const ph = ((t * (smoke ? 0.5 : 0.7) + i * 0.37 + x * 0.011) % 1 + 1) % 1;
      const wy = yTop - ph * rad * 1.7, wx = x + (i - (n - 1) / 2) * rad * 0.3 + Math.sin(t * 2 + i * 2 + x * 0.02) * rad * 0.22;
      const a = (smoke ? 0.5 : 0.3) * (1 - ph) * Math.min(1, ph * 3.5);   // fade IN at birth, out as it rises
      ctx.fillStyle = smoke ? "rgba(46,34,26," + a.toFixed(3) + ")" : "rgba(235,232,225," + a.toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(wx, wy, rad * (0.1 + ph * 0.2), 0, TAU); ctx.fill();
    }
  }

  // the item built around (0,0) — caller has applied the motion transform; `raw` forces the raw face
  // (used for the first half of the flip, when the underside is up)
  function body(ctx, p, rad, PM, melt, raw) {
    const S = PM.Stage, I = PM.Item, st = p.stage, bad = p.understeared;
    const isMelt = st === S.MELT || st === S.DONE;
    const face = raw ? S.SEAR_A : st;

    if (st === S.BURNT) { patty(ctx, 0, 0, rad, S.BURNT, S); return; }

    if (p.item === I.GRILLED_CHEESE) {
      const tcol = st === S.TOAST ? C.toastPale : st === S.SEAR_B ? C.toastGold : C.toastDone;
      bread(ctx, 0, rad * 0.18, rad, tcol, st === S.TOAST ? null : C.breadCrust);     // bottom slice
      if (st === S.SEAR_B) thinCheese(ctx, 0, -rad * 0.02, rad);
      else if (isMelt) cheese(ctx, 0, -rad * 0.04, rad, melt);
      bread(ctx, 0, -rad * 0.22, rad, tcol, st === S.TOAST ? null : C.breadCrust);    // top slice
      return;
    }
    if (p.item === I.PATTY_MELT) {
      const toasted = isMelt;
      if (toasted) bread(ctx, 0, rad * 0.22, rad, st === S.DONE ? C.toastDone : C.toastGold, C.ryeCrust);
      patty(ctx, 0, toasted ? rad * 0.02 : 0, rad * (toasted ? 0.82 : 1), face, S);
      if (st === S.SEAR_B || st === S.TOAST) thinCheese(ctx, 0, -rad * 0.14, rad);
      if (toasted) { cheese(ctx, 0, -rad * 0.16, rad, melt); bread(ctx, 0, -rad * 0.32, rad, st === S.DONE ? C.toastDone : C.toastGold, C.ryeCrust); }
      return;
    }
    if (p.item === I.HAMBURGER) {                             // no cheese
      if (st === S.DONE) bunBottom(ctx, 0, rad * 0.30, rad);
      patty(ctx, 0, 0, rad, face, S);
      if (st === S.DONE) bunCrown(ctx, 0, -rad * 0.10, rad, bad);
      return;
    }
    if (p.item === I.DOUBLE_CHEESE) {
      if (st === S.DONE) bunBottom(ctx, 0, rad * 0.42, rad);
      patty(ctx, 0, rad * 0.18, rad, st === S.SEAR_A ? face : S.SEAR_B, S);            // lower patty (seared once committed)
      patty(ctx, 0, -rad * 0.04, rad, face, S);                                        // upper patty
      if (isMelt) cheese(ctx, 0, -rad * 0.20, rad, melt);
      if (st === S.DONE) bunCrown(ctx, 0, -rad * 0.30, rad, bad);
      return;
    }
    if (p.item === I.SMASH) {                             // smashed cheeseburger — thin caramelized patty, lacy skirt
      if (st === S.DONE) bunBottom(ctx, 0, rad * 0.26, rad);
      smashPatty(ctx, 0, rad * 0.04, rad, face, S);
      if (isMelt) cheese(ctx, 0, -rad * 0.08, rad, melt);
      if (st === S.DONE) bunCrown(ctx, 0, -rad * 0.18, rad, bad);
      return;
    }
    if (p.item === I.SMASH_MELT) {                        // the crispy smash take on the PATTY MELT (rye)
      const toasted = isMelt;
      if (toasted) bread(ctx, 0, rad * 0.22, rad, st === S.DONE ? C.toastDone : C.toastGold, C.ryeCrust);
      smashPatty(ctx, 0, toasted ? rad * 0.04 : rad * 0.02, rad * (toasted ? 0.82 : 1), face, S);
      if (st === S.SEAR_B || st === S.TOAST) thinCheese(ctx, 0, -rad * 0.10, rad);
      if (toasted) { cheese(ctx, 0, -rad * 0.12, rad, melt); bread(ctx, 0, -rad * 0.28, rad, st === S.DONE ? C.toastDone : C.toastGold, C.ryeCrust); }
      return;
    }
    // BURGER (default — today's coin-op flow)
    if (st === S.DONE) bunBottom(ctx, 0, rad * 0.30, rad);
    patty(ctx, 0, 0, rad, face, S);
    if (isMelt) cheese(ctx, 0, -rad * 0.12, rad, melt);
    if (st === S.DONE) bunCrown(ctx, 0, -rad * 0.22, rad, bad);
  }

  function drawItem(ctx, p, cx, cy, rad, PM, t) {
    if (!p) return; t = t || 0;
    const S = PM.Stage, st = p.stage;

    // FLIP DETECTION (render-only state stashed on the patty; the engine ignores _underscore fields).
    // A flip = the recipe step we just COMPLETED was a FLIP action — generic across every item.
    if (p._rs === undefined) p._rs = p.step;
    else if (p.step > p._rs) { if (PM.RECIPES[p.item] && PM.RECIPES[p.item][p._rs] === PM.Action.FLIP) p._flipT0 = t; p._rs = p.step; }
    else if (p.step < p._rs) p._rs = p.step;

    const active = st === S.SEAR_A || st === S.SEAR_B || st === S.TOAST;
    const ph = t * 7 + cx * 0.05 + cy * 0.03;

    const fe = (p._flipT0 !== undefined) ? (t - p._flipT0) / FLIP_DUR : 9;     // flip progress 0..1 (else idle)
    // sizzle ENVELOPE — the wobble eases OUT into a flip and back IN after the landing (no amplitude snap)
    let wA = 1;
    if (fe < 0.14) wA = 1 - fe / 0.14;
    else if (fe < 1) wA = 0;
    else if (fe < 1 + SETTLE_DUR) wA = (fe - 1) / SETTLE_DUR;

    let dx = 0, dy = 0, sc = 1, scY = 1, raw = false, lift = 0;
    if (active) { dx = Math.sin(ph) * rad * 0.04 * wA; dy = Math.cos(ph * 1.3) * rad * 0.03 * wA; sc = 1 + Math.sin(ph * 2) * 0.025 * wA; }

    if (fe >= 0 && fe < 1) {                                                   // the turn-over: lift arc + edge-on squash
      lift = Math.sin(fe * Math.PI) * rad * 0.95;
      scY = Math.max(0.05, Math.abs(Math.cos(fe * Math.PI)));                  // |cos| — lands right-side-up, no sign snap
      raw = fe < 0.5;
    } else if (fe >= 1 && fe < 1 + SETTLE_DUR) {                               // landing SETTLE — a soft squash, eased out
      const k = (fe - 1) / SETTLE_DUR;
      scY = 1 - 0.10 * Math.sin(k * Math.PI) * (1 - k * 0.6);
    }

    if (st === S.MELT) sc *= 1 + Math.sin(t * 3 + cx * 0.05) * 0.012;          // gentle melt breathing
    if (st === S.DONE) { if (p._doneT0 === undefined) p._doneT0 = t; }         // render-only: when DONE first seen
    else if (p._doneT0 !== undefined) p._doneT0 = undefined;
    if (st === S.DONE) {                                                       // ready bob — eased IN, no pop at the swap
      const dk = Math.min(1, Math.max(0, (t - p._doneT0) / 0.5)), e = dk * dk * (3 - 2 * dk);
      dy += (Math.sin(t * 4 + cx * 0.05) * rad * 0.05 - rad * 0.02) * e;
    }
    const melt = st === S.MELT ? Math.min(1, p.cook / (PM.MELT_DONE || 16)) : (st === S.DONE ? 1 : 0);

    // ground contact shadow — independent of the flip transform; shrinks as the patty lifts
    if (st !== S.BURNT) { const sh = Math.max(0.3, 1 - lift / (rad * 2.2));
      ctx.save(); ctx.globalAlpha = 0.30 * sh; ctx.fillStyle = "#000";
      ell(ctx, cx, cy + rad * 0.44, rad * 1.05 * sh, rad * 0.16 * sh); ctx.fill(); ctx.restore(); }

    ctx.save(); ctx.translate(cx + dx, cy + dy - lift); ctx.scale(sc, sc * scY);
    body(ctx, p, rad, PM, melt, raw);
    ctx.restore();

    if (active || st === S.MELT) steam(ctx, cx + dx, cy - rad * 0.5 - lift, rad, t, false);
    else if (st === S.BURNT) steam(ctx, cx, cy - rad * 0.4, rad, t, true);

    if (st === S.DONE) { const a = 0.4 + 0.4 * Math.sin(t * 6 + cx * 0.1);    // a little "ready" shimmer
      ctx.save(); ctx.globalAlpha = a * 0.32; ctx.fillStyle = "#ffe7a0";
      ell(ctx, cx, cy - rad * 0.55, rad * 0.22, rad * 0.06); ctx.fill(); ctx.restore(); }
  }
  g.PMDrawItem = drawItem;
})(typeof globalThis !== "undefined" ? globalThis : this);
