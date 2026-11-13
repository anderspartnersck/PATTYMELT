// PATTY MELT — THE CINEMATIC LAYER (render-only, skippable). "Cinematic glue": anime cut-ins, shift-open /
// shift-clear / break / battle cutscenes, the walk-through camera (kitchen ⇄ pass ⇄ dining room) and the juice
// (squash + ease) on the cooks, Billy and the plates.
//
// HOUSE RULES (same as ONE TIMER's cinematic layer): it only READS what the page hands it; it never touches the
// engine (web/engine.js stays bit-exact). Blocking scenes hold the page's own PRESENTATION clocks (GET READY,
// Billy's-break continue) while they play; any key / button skips. ?nocine turns the whole layer off.
// Colour: the warm diner palette carries the bodies; the anime neon (MERC ZEBRA pinks/blues/violets) is FX only.
// Cast art comes from the ONE cast table (lib/cast.js — ?cast=ink swaps in the inked set).
//
//   PMCine.init({ W, H, skin, screens, kit, din, txt })
//   PMCine.shiftOpen({ n, of, name, time, wrinkle, coop })     — the doors open: dining → pass → kitchen, Patty slams in
//   PMCine.shiftClear({ n, name, served, combo, score, last })  — ORDER UP! kitchen → pass → dining, the tally
//   PMCine.shiftBreak({ line })                                 — BILLY NEEDS A BREAK
//   PMCine.versus({ secs })  PMCine.battleEnd({ winner, a, b }) — the MeltDome open + the bell
//   PMCine.cutIn(who, line, { pose, tone })                     — non-blocking 1.2 s cut-in in a corner band
//   PMCine.busy() / skip() / applyCamera(ctx) / draw(ctx)        — the page's render hooks
//   PMCine.squash(key, trigger) → { sx, sy }  PMCine.bob(key, phase, amp) → px                 — the juice
(function () {
  "use strict";
  const Q = new URLSearchParams((globalThis.location && location.search) || "");
  const OFF = Q.has("nocine");
  const NEON = { pink: "#ff2d9e", blue: "#3b7bff", cyan: "#42e6ff", violet: "#a24cff", hot: "#ff3b3b" };
  const SKIN_COL = {
    diner:  { a: "#c8302a", b: "#ffd23f", ink: "#2a0d08", cream: "#f3e6c8", band: "#7a1f18" },
    heroes: { a: "#1f3a63", b: "#f2c230", ink: "#0b1830", cream: "#f3e6c8", band: "#2b4f86" },
  };
  const P1 = "#ff5a4d", P2 = "#6fb0e0";
  let cfg = { W: 1280, H: 600, skin: "diner", screens: 2, kit: null, din: null };
  let scenes = [];           // blocking + non-blocking scenes in flight
  let cam = null;            // { x, y, z } — the walk-through camera (scene-space focus + zoom)
  const now = () => performance.now();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (u) => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;   // easeInOutCubic
  const outBack = (u) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const col = () => SKIN_COL[cfg.skin === "school" || cfg.skin === "heroes" ? "heroes" : "diner"];
  const F = (px) => Math.round(px * cfg.H / 600);
  function font(px, w = 900) { return w + " " + F(px) + 'px "Saira Condensed","Arial Narrow","Impact",sans-serif'; }
  function text(ctx, s, x, y, px, fill, align = "center", stroke = "#000", lw = 0, maxW = 0) {
    ctx.font = font(px);
    if (maxW) { const w = ctx.measureText(s).width; if (w > maxW) { px = px * maxW / w; ctx.font = font(px); lw = lw * maxW / w; } } ctx.textAlign = align; ctx.textBaseline = "alphabetic";
    if (lw) { ctx.lineJoin = "round"; ctx.lineWidth = F(lw); ctx.strokeStyle = stroke; ctx.strokeText(s, x, y); }
    ctx.fillStyle = fill; ctx.fillText(s, x, y);
  }
  function hero(who, pose) { return globalThis.PMCast ? PMCast.hero(cfg.skin, who, pose) : null; }
  const ok = (im) => !!(im && im.complete && im.naturalWidth);

  // ---------- anime FX primitives ----------
  function speedLines(ctx, cx, cy, r0, r1, n, t, colors, alpha = 1, seed = 1) {
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = alpha;
    for (let i = 0; i < n; i++) {
      const h = Math.sin(i * 91.7 + seed * 13.1) * 43758.5453, fr = h - Math.floor(h);
      const a = (i / n) * Math.PI * 2 + fr * 0.2, len = r1 * (0.55 + 0.45 * Math.abs(Math.sin(t * 0.02 + i)));
      const w = 1 + fr * 3.5;
      ctx.strokeStyle = colors[i % colors.length]; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); ctx.stroke();
    }
    ctx.restore();
  }
  function hLines(ctx, y0, y1, n, t, dir, colors, alpha) {     // horizontal rush lines (a cut-in band's motion)
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = alpha;
    for (let i = 0; i < n; i++) {
      const h = Math.sin(i * 12.9898) * 43758.5453, fr = h - Math.floor(h), y = y0 + fr * (y1 - y0);
      const len = cfg.W * (0.15 + 0.35 * ((i * 7) % 5) / 5), x = ((fr * cfg.W * 3 + t * 2.4 * dir) % (cfg.W + len)) - len;
      ctx.strokeStyle = colors[i % colors.length]; ctx.lineWidth = 1 + (i % 3);
      ctx.beginPath(); ctx.moveTo(dir > 0 ? x : cfg.W - x, y); ctx.lineTo(dir > 0 ? x + len : cfg.W - x - len, y); ctx.stroke();
    }
    ctx.restore();
  }
  function slashBand(ctx, cy, h, skew, u, fill, edge) {     // a diagonal slash band that wipes in (u 0→1)
    const W = cfg.W, x1 = -W * 0.2 + (W * 1.4) * u;
    ctx.save(); ctx.beginPath();
    ctx.moveTo(-W * 0.2, cy - h / 2 + skew); ctx.lineTo(x1, cy - h / 2 - skew * (x1 / W)); ctx.lineTo(x1 - skew, cy + h / 2 - skew * (x1 / W)); ctx.lineTo(-W * 0.2, cy + h / 2 + skew); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = F(4); ctx.stroke(); } ctx.restore();
  }
  function halftone(ctx, x, y, w, h, color, alpha, step = 12) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
    for (let yy = y; yy < y + h; yy += step) for (let xx = x + ((yy / step) % 2) * step / 2; xx < x + w; xx += step) {
      const r = step * 0.32 * (0.4 + 0.6 * (xx - x) / w); ctx.beginPath(); ctx.arc(xx, yy, r, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  function flash(ctx, a, color = "#fff") { if (a <= 0) return; ctx.save(); ctx.globalAlpha = clamp(a, 0, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, cfg.W, cfg.H); ctx.restore(); }
  function letterbox(ctx, u) { const h = cfg.H * 0.085 * u; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cfg.W, h); ctx.fillRect(0, cfg.H - h, cfg.W, h); }
  // a cast picture by its FEET (x, footY), height h, with squash (sx, sy) and an optional mirror + ink outline glow
  function drawCast(ctx, im, x, footY, h, sx = 1, sy = 1, mirror = false, glow = null, alpha = 1) {
    if (!ok(im)) return false;
    if (mirror && /cast_joe\//.test(im.currentSrc || im.src)) mirror = false;   // (1112) Joe's paintings carry lettering (COUGARS, name tags): never flip
    const w = h * im.naturalWidth / im.naturalHeight;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, footY); ctx.scale((mirror ? -1 : 1) * sx, sy);
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = F(26); }
    ctx.drawImage(im, -w / 2, -h, w, h); ctx.restore(); return true;
  }
  function stamp(ctx, s, x, y, px, u, fill, stroke = "#140806", rot = -0.06) {   // a slammed-in title: overshoot scale
    if (u <= 0) return; let k = u < 1 ? 2.2 - 1.2 * outBack(u) : 1;
    ctx.font = font(px); const fitW = cfg.W * 0.62, mw = ctx.measureText(s).width; if (mw > fitW) k *= fitW / mw;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(k, k); ctx.globalAlpha = clamp(u * 3, 0, 1);
    text(ctx, s, 0, 0, px, fill, "center", stroke, Math.max(6, px * 0.16)); ctx.restore();
  }
  function squashAt(t0, t, amp = 0.16) {      // a landed slam: squash then spring back (sy, sx)
    const e = Math.max(0, t - t0); if (e > 600) return [1, 1];
    const s = amp * Math.exp(-e / 120) * Math.cos(e / 46); return [1 + s * 0.6, 1 - s];
  }

  // ---------- the scene runner ----------
  function play(sc) {
    if (OFF) { if (sc.onEnd) sc.onEnd(); return; }
    sc.t0 = now(); sc.blocking = sc.blocking !== false;
    if (sc.blocking) { for (const s of scenes) if (s.blocking) s.dead = true; }
    scenes.push(sc);
  }
  function busy() { return scenes.some((s) => s.blocking && !s.dead); }
  function skip() {
    let any = false;
    for (const s of scenes) if (s.blocking && !s.dead) { s.dead = true; any = true; if (s.onEnd) { const f = s.onEnd; s.onEnd = null; f(); } }
    cam = null; return any;
  }
  function applyCamera(ctx) {
    cam = null;
    for (const s of scenes) if (!s.dead && s.camera) { const u = clamp((now() - s.t0) / s.dur, 0, 1); cam = s.camera(u); }
    if (!cam || cam.z <= 1.001) return;
    const W = cfg.W, H = cfg.H, z = cam.z;
    const x = clamp(cam.x, W / (2 * z), W - W / (2 * z)), y = clamp(cam.y, H / (2 * z), H - H / (2 * z));
    ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-x, -y);
  }
  function draw(ctx) {
    const t = now();
    for (const s of scenes) {
      if (s.dead) continue;
      const e = t - s.t0, u = clamp(e / s.dur, 0, 1);
      ctx.save(); try { s.draw(ctx, e, u); } catch (err) { s.dead = true; } ctx.restore();
      if (u >= 1) { s.dead = true; if (s.onEnd) { const f = s.onEnd; s.onEnd = null; f(); } }
    }
    scenes = scenes.filter((s) => !s.dead);
  }

  // ---------- the walk-through camera: focus points in scene space ----------
  function focusKitchen() { const k = cfg.kit; return { x: k.x + k.w * 0.42, y: k.y + k.h * 0.48 }; }
  function focusPass()    { const k = cfg.kit, d = cfg.din;
    return cfg.screens === 2 ? { x: k.x + k.w, y: k.y + k.h * 0.45 } : { x: cfg.W * 0.62, y: k.y + k.h * 0.8 }; }
  function focusDining()  { const d = cfg.din; return { x: d.x + d.w * 0.5, y: d.y + d.h * 0.55 }; }
  const lerpP = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  function path(points, u) {        // ease along kitchen → pass → dining (or back): piecewise, eased per leg
    const n = points.length - 1, f = ease(u) * n, i = Math.min(n - 1, Math.floor(f));
    return lerpP(points[i], points[i + 1], f - i);
  }

  // ---------- CUT-IN (non-blocking): a slash band in the dining-room corner, the cast member slams in ----------
  let lastCut = 0;
  function cutIn(who, line, opt = {}) {
    if (OFF) return; const t = now(); if (!opt.force && t - lastCut < 3800) return; lastCut = t;
    const pose = opt.pose || "cheer", tone = opt.tone || "good", dur = opt.dur || 1350;
    const C = col(), base = tone === "bad" ? NEON.hot : tone === "p2" ? P2 : tone === "p1" ? P1 : C.b;
    const im = hero(who, pose);
    play({ blocking: false, dur, draw(ctx, e, u) {
      const W = cfg.W, H = cfg.H, bandH = H * 0.2, cy = opt.cy != null ? H * opt.cy : cfg.screens === 2 ? H * 0.32 : H * 0.83;   // clear of the HUD rows
      const inU = seg(e, 0, 170), outU = seg(e, dur - 220, dur), k = inU * (1 - outU);
      if (k <= 0) return;
      const x0 = cfg.screens === 2 ? W * 0.52 : W * 0.04, bw = cfg.screens === 2 ? W * 0.46 : W * 0.92;
      ctx.save(); ctx.globalAlpha = k;
      ctx.beginPath(); ctx.moveTo(x0 + 26, cy - bandH / 2); ctx.lineTo(x0 + bw, cy - bandH / 2); ctx.lineTo(x0 + bw - 26, cy + bandH / 2); ctx.lineTo(x0, cy + bandH / 2); ctx.closePath();
      ctx.fillStyle = "rgba(12,6,20,0.86)"; ctx.fill(); ctx.strokeStyle = base; ctx.lineWidth = F(3); ctx.stroke(); ctx.clip();
      hLines(ctx, cy - bandH / 2, cy + bandH / 2, 14, e, 1, [NEON.pink, NEON.cyan, NEON.violet, base], 0.55);
      halftone(ctx, x0, cy - bandH / 2, bw, bandH, base, 0.12, 10);
      const [sy, sx] = squashAt(170, e, 0.2);
      const slide = (1 - outBack(inU)) * -bw * 0.4;
      if (ok(im)) {   // the anime close-up: the top of the picture (face + shoulders) fills the band
        const srcH = im.naturalHeight * 0.36, dh = bandH * 1.12, dw = im.naturalWidth * dh / srcH;
        ctx.save(); ctx.translate(x0 + bw * 0.17 + slide, cy + bandH / 2); ctx.scale(sx, sy); ctx.shadowColor = base; ctx.shadowBlur = F(18);
        ctx.drawImage(im, 0, 0, im.naturalWidth, srcH, -dw / 2, -dh, dw, dh); ctx.restore(); }
      ctx.restore(); ctx.save(); ctx.globalAlpha = k;
      stamp(ctx, line, x0 + bw * 0.62, cy + F(10), opt.px || 30, seg(e, 90, 330), base === C.b ? C.b : base);
      ctx.restore();
    } });
  }

  // ---------- SHIFT OPEN: the doors open on the dining room → walk through the pass → the kitchen → Patty ----------
  function shiftOpen(o) {
    const C = col(), dur = 3900, coop = !!o.coop;
    const P = hero("patty", "cheer"), Pi = hero("patty", "idle"), Ch = hero("chrissy", "cheer"), B = hero("billy", "turn");
    play({ dur, onEnd: o.onEnd,
      camera(u) {
        const a = focusDining(), b = focusPass(), c = focusKitchen();
        if (u < 0.36) { const v = u / 0.36, p = path([a, b, c], v); return { x: p.x, y: p.y, z: 1.55 - 0.15 * v }; }
        if (u < 0.86) return { x: c.x, y: c.y, z: 1.4 - 0.1 * seg(u, 0.36, 0.86) };
        const v = seg(u, 0.86, 1); return { x: c.x + (cfg.W / 2 - c.x) * ease(v), y: c.y + (cfg.H / 2 - c.y) * ease(v), z: 1.3 - 0.3 * ease(v) };
      },
      draw(ctx, e, u) {
        const W = cfg.W, H = cfg.H;
        letterbox(ctx, seg(e, 0, 300) * (1 - seg(e, dur - 300, dur)));
        // beat 1 (walk-through): a lower-third over the moving camera
        const a1 = seg(e, 120, 420) * (1 - seg(e, 1250, 1450));
        if (a1 > 0) { ctx.save(); ctx.globalAlpha = a1;
          text(ctx, (o.time || "OPEN") + "  ·  THE DOORS OPEN", W * 0.06, H * 0.86, 22, C.cream, "left", "#000", 5);
          text(ctx, "SHIFT " + o.n + (o.of ? " OF " + o.of : ""), W * 0.06, H * 0.79, 16, C.b, "left", "#000", 4); ctx.restore(); }
        // beat 2 (the splash): hard flash → slash band → Patty slams in
        const t2 = e - 1400; if (t2 < 0) return;
        flash(ctx, 0.85 * (1 - seg(t2, 0, 160)));
        const bandU = ease(seg(t2, 0, 260)), outU = seg(e, dur - 380, dur - 60);
        ctx.save(); ctx.globalAlpha = 1 - outU;
        ctx.fillStyle = "rgba(8,4,14," + (0.55 * bandU).toFixed(2) + ")"; ctx.fillRect(0, 0, W, H);
        slashBand(ctx, H * 0.55, H * 0.46, H * 0.06, bandU, C.a, C.b);
        ctx.save(); ctx.beginPath(); ctx.rect(0, H * 0.3, W, H * 0.52); ctx.clip();
        hLines(ctx, H * 0.32, H * 0.78, 22, e, 1, [NEON.pink, NEON.cyan, NEON.violet, C.b], 0.5 * bandU);
        halftone(ctx, 0, H * 0.32, W, H * 0.46, C.b, 0.1 * bandU, 14); ctx.restore();
        speedLines(ctx, W * 0.24, H * 0.55, H * 0.25, W * 0.7, 40, e, [NEON.pink, NEON.blue, NEON.cyan, NEON.violet], 0.35 * bandU, o.n);
        const pin = seg(t2, 120, 420), [sy, sx] = squashAt(1400 + 420, e, 0.22);
        const ph = H * 0.84, px = W * (coop ? 0.2 : 0.24) - (1 - outBack(pin)) * W * 0.45;
        if (!drawCast(ctx, P, px, H * 0.98, ph, sx, sy, false, C.b)) drawCast(ctx, Pi, px, H * 0.98, ph, sx, sy, false, C.b);
        if (coop) { const cin = seg(t2, 300, 600), [cy, cx] = squashAt(1400 + 600, e, 0.2);
          drawCast(ctx, Ch, W * 0.36 + (1 - outBack(cin)) * W * 0.6, H * 0.98, ph * 0.92, cx, cy, true, P2); }
        const tx = W * (coop ? 0.68 : 0.64), tw = W * 0.6;
        stamp(ctx, o.name || "SHIFT " + o.n, tx, H * 0.5, 64, seg(t2, 220, 520), C.b);
        const sub = seg(t2, 480, 760); if (sub > 0) { ctx.save(); ctx.globalAlpha = sub;
          text(ctx, o.wrinkle || "", tx, H * 0.59, 18, C.cream, "center", "#000", 4, tw);
          text(ctx, coop ? "PATTY + CHRISSY — TWO SPATULAS EACH. FOOD SAFETY FIRST." : "PATTY — TWO SPATULAS. NO HANDS ON THE FOOD.", tx, H * 0.65, 15, C.b, "center", "#000", 4, tw); ctx.restore(); }
        // beat 3 (the gag): Billy pops up late from the bottom-right corner, his line above his cap
        const bu = seg(t2, 1100, 1400); if (bu > 0) {
          const bh = H * (W < 1000 ? 0.3 : 0.4), by = H * 1.02 + (1 - outBack(bu)) * H * 0.4;
          drawCast(ctx, B, W - bh * 0.42, by, bh, 1, 1, true, null);
          ctx.save(); ctx.globalAlpha = bu; text(ctx, "…wait, I'm on TODAY?", W - F(12), H * 1.02 - bh - F(8), 16, C.cream, "right", "#000", 4); ctx.restore(); }
        ctx.restore();
        if (e > 700) text(ctx, "▸ any button: skip", W - F(14), H - F(10), 11, "rgba(243,230,200,.6)", "right");
      } });
  }

  // ---------- SHIFT CLEAR: ORDER UP! → walk the last plate kitchen → pass → dining room → the tally ----------
  function shiftClear(o) {
    const C = col(), dur = 4600, B = hero("billy", "serve"), P = hero("patty", "cheer");
    play({ dur, onEnd: o.onEnd,
      camera(u) {
        const a = focusKitchen(), b = focusPass(), c = focusDining();
        if (u < 0.12) return { x: a.x, y: a.y, z: 1 + 0.35 * ease(u / 0.12) };
        if (u < 0.55) { let p = path([a, b, c], seg(u, 0.12, 0.55));
          const bl = cfg.billyAt && cfg.billyAt(); if (bl) { const k = Math.sin(Math.PI * seg(u, 0.12, 0.55)) * 0.6; p = lerpP(p, bl, k); }   // the camera walks WITH Billy
          return { x: p.x, y: p.y, z: 1.35 + 0.15 * Math.sin(Math.PI * seg(u, 0.12, 0.55)) }; }
        if (u < 0.86) return { x: c.x, y: c.y, z: 1.35 };
        const v = ease(seg(u, 0.86, 1)); return { x: c.x + (cfg.W / 2 - c.x) * v, y: c.y + (cfg.H / 2 - c.y) * v, z: 1.35 - 0.35 * v };
      },
      draw(ctx, e, u) {
        const W = cfg.W, H = cfg.H;
        letterbox(ctx, seg(e, 0, 250) * (1 - seg(e, dur - 300, dur)));
        flash(ctx, 0.7 * (1 - seg(e, 0, 200)), C.b);
        stamp(ctx, "ORDER UP!", W / 2, H * 0.24, 70, seg(e, 60, 360) * (1 - seg(e, 1100, 1350)), C.b);
        speedLines(ctx, W / 2, H * 0.22, H * 0.1, W * 0.6, 34, e, [NEON.pink, NEON.cyan, C.b], 0.4 * (1 - seg(e, 900, 1300)), 3);
        // the walk-through beat: Billy carries it out (lower-third rides the pan)
        const wk = seg(e, 700, 1000) * (1 - seg(e, 2500, 2700));
        if (wk > 0) { ctx.save(); ctx.globalAlpha = wk;
          text(ctx, "THROUGH THE PASS…", W * 0.06, H * 0.88, 20, C.cream, "left", "#000", 5);
          text(ctx, "BILLY RUNS THE LAST PLATES OUT", W * 0.06, H * 0.82, 14, C.b, "left", "#000", 4); ctx.restore(); }
        // the tally: the house is fed
        const t3 = e - 2600; if (t3 < 0) return;
        const k = seg(t3, 0, 260) * (1 - seg(e, dur - 260, dur));
        ctx.save(); ctx.globalAlpha = k;
        ctx.fillStyle = "rgba(8,4,14,0.7)"; ctx.fillRect(0, H * 0.3, W, H * 0.44);
        slashBand(ctx, H * 0.52, H * 0.4, H * 0.05, ease(seg(t3, 0, 280)), "rgba(0,0,0,0)", C.b);
        const [sy, sx] = squashAt(2600 + 260, e, 0.2);
        drawCast(ctx, P, W * 0.16, H * 0.8, H * 0.58, sx, sy, false, C.b);
        drawCast(ctx, B, W * 0.86, H * 0.8, H * 0.46, 1, 1, true, null);
        text(ctx, "SHIFT " + o.n + " CLEAR", W / 2, H * 0.4, 34, C.b, "center", "#000", 6);
        text(ctx, o.name || "", W / 2, H * 0.46, 18, C.cream, "center", "#000", 4);
        const cnt = (v) => Math.round(v * ease(seg(t3, 250, 1250)));
        text(ctx, "SERVED " + cnt(o.served || 0) + "   ·   BEST COMBO x" + (o.combo || 0) + "   ·   " + String(cnt(o.score || 0)).padStart(6, "0") + " PTS", W / 2, H * 0.57, 22, C.cream, "center", "#000", 5);
        text(ctx, o.last ? "THE LAST TABLE IS FED." : "THE HOUSE IS FED — NEXT SHIFT'S WAITING.", W / 2, H * 0.65, 16, C.b, "center", "#000", 4);
        ctx.restore();
      } });
  }

  // ---------- BILLY NEEDS A BREAK (the arcade continue) ----------
  function shiftBreak(o) {
    const C = col(), dur = 2600, B = hero("billy", "slack"), P = hero("patty", "idle");
    play({ dur, onEnd: o.onEnd, camera(u) { const d = focusDining(); return { x: d.x, y: d.y, z: 1 + 0.25 * Math.sin(Math.PI * u) }; },
      draw(ctx, e) {
        const W = cfg.W, H = cfg.H;
        flash(ctx, 0.6 * (1 - seg(e, 0, 240)), NEON.hot);
        ctx.fillStyle = "rgba(20,4,10," + (0.55 * seg(e, 0, 300)).toFixed(2) + ")"; ctx.fillRect(0, 0, W, H);
        speedLines(ctx, W / 2, H / 2, H * 0.2, W * 0.7, 30, e, [NEON.violet, NEON.blue, "#552"], 0.35, 7);
        const slump = seg(e, 200, 700), [sy, sx] = squashAt(700, e, 0.25);
        drawCast(ctx, B, W * 0.66, H * 0.92 + (1 - slump) * -H * 0.5, H * 0.52, sx, sy, false, NEON.violet);
        drawCast(ctx, P, W * 0.24, H * 0.98, H * 0.66, 1, 1, false, null, seg(e, 300, 600));
        stamp(ctx, o.line || "BILLY NEEDS A BREAK", W / 2, H * 0.24, 50, seg(e, 300, 600), C.b);
        text(ctx, "(he's a kid. the diner never fires him.)", W / 2, H * 0.31, 15, C.cream, "center", "#000", 4);
      } });
  }

  // ---------- MELTDOME: VERSUS + THE BELL ----------
  function versus(o) {
    const C = col(), dur = 3300, A = hero("patty", "cheer"), Bc = hero("chrissy", "cheer");
    play({ dur, onEnd: o.onEnd, draw(ctx, e) {
      const W = cfg.W, H = cfg.H, inU = ease(seg(e, 0, 380)), out = seg(e, dur - 320, dur);
      ctx.save(); ctx.globalAlpha = 1 - out;
      ctx.fillStyle = "rgba(6,3,10,0.9)"; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W * 0.56 * inU, 0); ctx.lineTo(W * 0.44 * inU, H); ctx.lineTo(0, H); ctx.closePath();
      ctx.fillStyle = "#5a1410"; ctx.fill(); ctx.clip(); hLines(ctx, 0, H, 26, e, 1, [P1, NEON.pink, "#ffb199"], 0.45); halftone(ctx, 0, 0, W * 0.56, H, P1, 0.12, 14); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.moveTo(W, 0); ctx.lineTo(W - W * 0.44 * inU, 0); ctx.lineTo(W - W * 0.56 * inU, H); ctx.lineTo(W, H); ctx.closePath();
      ctx.fillStyle = "#10264a"; ctx.fill(); ctx.clip(); hLines(ctx, 0, H, 26, e, -1, [P2, NEON.cyan, NEON.blue], 0.45); halftone(ctx, W * 0.44, 0, W * 0.56, H, P2, 0.12, 14); ctx.restore();
      ctx.strokeStyle = C.b; ctx.lineWidth = F(6); ctx.beginPath(); ctx.moveTo(W * 0.56, 0); ctx.lineTo(W * 0.44, H); ctx.stroke();
      const [sa, xa] = squashAt(420, e, 0.22), [sb, xb] = squashAt(620, e, 0.22);
      drawCast(ctx, A, W * 0.22 - (1 - outBack(seg(e, 120, 420))) * W * 0.5, H * 1.02, H * 0.92, xa, sa, false, P1);
      drawCast(ctx, Bc, W * 0.78 + (1 - outBack(seg(e, 320, 620))) * W * 0.5, H * 1.02, H * 0.92, xb, sb, true, P2);
      text(ctx, "PATTY", W * 0.2, H * 0.14, 40, P1, "center", "#000", 7); text(ctx, "CHRISSY", W * 0.8, H * 0.14, 40, P2, "center", "#000", 7);
      const vs = seg(e, 700, 950); const sh = vs > 0 && vs < 1 ? 0 : Math.sin(e / 30) * F(2) * (1 - seg(e, 950, 1500));
      stamp(ctx, "VS", W / 2 + sh, H * 0.56, 120, vs, C.b, "#140806", -0.12);
      stamp(ctx, "MELTDOME", W / 2, H * 0.2, 34, seg(e, 900, 1150), C.cream, "#140806", 0);
      const s2 = seg(e, 1200, 1500); if (s2 > 0) { ctx.globalAlpha = (1 - out) * s2;
        text(ctx, "ONE GRILL · ONE BILLY · " + (o.secs || 90) + "s SERVICE", W / 2, H * 0.72, 20, C.cream, "center", "#000", 5);
        text(ctx, "most CLEAN orders at the bell wins — holler Billy to YOUR side", W / 2, H * 0.78, 15, C.b, "center", "#000", 4); }
      ctx.restore();
      if (e > 600) text(ctx, "▸ any button: skip", W - F(14), H - F(10), 11, "rgba(243,230,200,.6)", "right");
    } });
  }
  function battleEnd(o) {
    const C = col(), dur = 3000, names = ["PATTY", "CHRISSY"], who = ["patty", "chrissy"], hue = [P1, P2];
    play({ dur, onEnd: o.onEnd, draw(ctx, e) {
      const W = cfg.W, H = cfg.H, wi = o.winner;
      flash(ctx, 0.9 * (1 - seg(e, 0, 220)), "#fff");
      ctx.fillStyle = "rgba(6,3,10," + (0.82 * seg(e, 0, 300)).toFixed(2) + ")"; ctx.fillRect(0, 0, W, H);
      stamp(ctx, "TIME!", W / 2, H * 0.2, 80, seg(e, 80, 360) * (1 - seg(e, 1100, 1300)), C.b);
      const t2 = e - 1150; if (t2 < 0) return;
      const hx = wi === 1 ? W * 0.7 : W * 0.3;
      speedLines(ctx, wi < 0 ? W / 2 : hx, H * 0.5, H * 0.15, W * 0.8, 46, e, wi < 0 ? [NEON.violet, C.b] : [hue[wi], NEON.pink, NEON.cyan, C.b], 0.5, 11);
      if (wi < 0) {
        drawCast(ctx, hero("patty", "idle"), W * 0.3, H, H * 0.8, 1, 1, false, P1);
        drawCast(ctx, hero("chrissy", "idle"), W * 0.7, H, H * 0.8, 1, 1, true, P2);
        stamp(ctx, "A DEAD HEAT!", W / 2, H * 0.24, 56, seg(t2, 0, 300), C.b);
      } else {
        const [sy, sx] = squashAt(1150 + 300, e, 0.24), lo = 1 - wi;
        drawCast(ctx, hero(who[lo], "idle"), wi === 1 ? W * 0.24 : W * 0.78, H, H * 0.55, 1, 1, wi === 0, null, 0.75);
        drawCast(ctx, hero(who[wi], "cheer"), hx, H * 1.02, H * 0.95 * (0.6 + 0.4 * outBack(seg(t2, 0, 300))), sx, sy, wi === 1, hue[wi]);
        stamp(ctx, names[wi] + " WINS!", W / 2, H * 0.22, 62, seg(t2, 120, 420), hue[wi]);
      }
      const k = seg(t2, 400, 700); if (k > 0) { ctx.globalAlpha = k;
        text(ctx, (o.a || 0) + "  —  " + (o.b || 0), W / 2, H * 0.34, 30, C.cream, "center", "#000", 6);
        text(ctx, "clean orders", W / 2, H * 0.39, 14, C.b, "center", "#000", 4); }
    } });
  }

  // ---------- THE JUICE (render-only springs keyed by the page) ----------
  const _sq = new Map();
  function squash(key, trigger, amp = 0.12) {
    const t = now(); let s = _sq.get(key);
    if (!s) { s = { trig: trigger, t0: -1e9 }; _sq.set(key, s); }
    if (s.trig !== trigger) { s.trig = trigger; s.t0 = t; }
    if (OFF) return { sx: 1, sy: 1 };
    const e = t - s.t0; if (e > 700) return { sx: 1, sy: 1 };
    const k = amp * Math.exp(-e / 130) * Math.cos(e / 52);
    return { sx: 1 + k * 0.7, sy: 1 - k };
  }
  function bob(phase, amp) { return OFF ? 0 : Math.abs(Math.sin(phase)) * amp; }
  function breathe(key, amp = 0.012) { return OFF ? 1 : 1 + amp * Math.sin(now() / 640 + (key.length * 1.7)); }

  function init(o) { cfg = Object.assign(cfg, o); if (globalThis.PMCast) PMCast.preload(cfg.skin); }
  globalThis.PMCine = { off: OFF, init, play, busy, skip, applyCamera, draw, cutIn, shiftOpen, shiftClear, shiftBreak, versus, battleEnd,
    squash, bob, breathe, NEON, _fx: { speedLines, hLines, slashBand, halftone, flash, letterbox, drawCast, stamp, squashAt, text, outBack, ease, seg } };
})();
