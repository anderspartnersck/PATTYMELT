// PATTY MELT — THE PAINTED FOOD (Joe 1118 standing rule: "preserve our painterly sprites, 2D + 3D sweetening").
// The food on the 3D line (grill, flips, toaster, plating, the pass, the stage pages) is Joe's PAINTINGS by default:
// assets/sprites/grill/*.png (+ the plated melts in dining/). The rendered 3D food is the opt-in, ?food3d=1.
// 3D only SWEETENS a painting, it never replaces it: a contact shadow, a cached toon top-light (rim), the grill's warm
// under-glow and a little steam. Every draw lands in the box the rendered sprite would have used (same anchors), so the
// layout, the prompts and the chips don't move. Render-only: no engine state is read or written here beyond the key.
//
//   PMFoodPaint.load("../assets/sprites/")      once per page (the paintings decode in the background)
//   PMFoodPaint.on()                            true unless ?food3d=1 (then every caller draws the rendered food)
//   PMFoodPaint.draw(ctx, key, box, opt)        key = the rendered key minus its slot/seat suffix ("grill.SEAR_A",
//                                               "toaster.BUN_READY", "plating.3", "to_pass", "flip.4", "grill.PMELT_DONE"…)
//                                               box = {x,y,w,h} where the rendered sprite would draw; opt = {a, school, bread, gc}
//                                               returns true when it drew (false = painting not decoded yet → caller falls back)
(function (root) {
  "use strict";
  const FILES = { raw: "grill/patty-raw", seared: "grill/patty-seared", done: "grill/patty-done", burnt: "grill/patty-burnt",
    cheeseF: "grill/cheese-fresh", cheeseM: "grill/cheese-melting", cheeseB: "grill/cheese-burnt", bun: "grill/bread", rye: "grill/bread-rye",
    plate: "grill/plate-diner", tray: "grill/tray-school", swissF: "grill/swiss-fresh-draped", swissM: "grill/swiss-melting-draped",
    swissB: "grill/swiss-browned-draped", onion: "grill/onion-golden-top", meltD: "dining/plated-pattymelt-diner", meltH: "dining/plated-pattymelt-heroes" };
  const IMG = {}, CACHE = {};
  let loaded = false;
  const Q = (() => { try { return new URLSearchParams(root.location ? root.location.search : ""); } catch (e) { return new URLSearchParams(""); } })();
  const FOOD3D = /^(1|on|yes|true)$/i.test(Q.get("food3d") || "");
  const ok = (i) => i && i.complete && i.naturalWidth > 0;
  const RYE = (b) => /^rye$/i.test(b || "");                                   // engine breads: SESAME · RYE · WHITE
  function load(base) {
    if (loaded || typeof Image === "undefined") return; loaded = true;
    for (const [k, f] of Object.entries(FILES)) { const i = new Image(); i.src = base + f + ".png"; IMG[k] = i; }
  }
  // a painting with the 3D sweetening baked once: a warm top-light (the toon rim of the key light) + an optional tint
  // (bun toast levels / burnt). Cached per (painting, tint) on an offscreen canvas.
  function lit(k, tint) {
    const im = IMG[k]; if (!ok(im)) return null;
    const ck = k + "|" + (tint || ""); if (CACHE[ck]) return CACHE[ck];
    const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext("2d"); g.drawImage(im, 0, 0);
    g.globalCompositeOperation = "source-atop";
    if (tint) { g.fillStyle = tint; g.fillRect(0, 0, c.width, c.height); }
    const gr = g.createLinearGradient(0, 0, 0, c.height * 0.45);
    gr.addColorStop(0, "rgba(255,236,200,0.30)"); gr.addColorStop(1, "rgba(255,236,200,0)");
    g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height * 0.45);
    return (CACHE[ck] = c);
  }
  // draw painting k centred on cx, its BOTTOM at by, w wide (sx/sy squash for smash + flips)
  function put(ctx, k, cx, by, w, o) {
    o = o || {}; const c = lit(k, o.tint); if (!c) return 0;
    const ww = w * (o.sx || 1), hh = w * c.height / c.width * (o.sy || 1);
    ctx.drawImage(c, cx - ww / 2, by - hh, ww, hh); return hh;
  }
  function shadow(ctx, cx, by, w, glow) {
    ctx.save();
    if (glow) { ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = "rgba(255,120,40,0.10)";
      ctx.beginPath(); ctx.ellipse(cx, by - w * 0.02, w * 0.62, w * 0.17, 0, 0, 7); ctx.fill(); ctx.globalCompositeOperation = "source-over"; }
    ctx.fillStyle = "rgba(0,0,0,0.26)"; ctx.beginPath(); ctx.ellipse(cx + w * 0.03, by - w * 0.01, w * 0.46, w * 0.09, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  function steam(ctx, cx, top, w, n) {
    const t = (typeof performance !== "undefined" ? performance.now() : 0) / 1000;
    ctx.save();
    for (let i = 0; i < n; i++) { const u = (t * 0.6 + i / n + cx * 0.013) % 1;
      ctx.fillStyle = "rgba(255,248,236," + (0.13 * (1 - u) * Math.min(1, u * 4)).toFixed(3) + ")";
      ctx.beginPath(); ctx.ellipse(cx + (i - (n - 1) / 2) * w * 0.22 + Math.sin(t * 2 + i) * w * 0.05, top - u * w * 0.55, w * (0.06 + u * 0.08), w * (0.05 + u * 0.06), 0, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  const BUN_TINT = { RAW: "rgba(255,246,226,0.42)", TOASTING: "rgba(255,240,210,0.18)", READY: null, BURNT: "rgba(26,12,4,0.62)" };
  // a patty on the grill: base painting + (american | swiss) cheese, smash squash, the rye lid
  function patty(ctx, st, cx, by, w, opt) {
    const smash = /^(SMASH|SMELT)_/.test(st), melt = /^(PMELT|SMELT)_/.test(st), s = st.replace(/^(SMASH|SMELT|PMELT)_/, "");
    const sq = smash ? { sx: 1.12, sy: 0.78 } : null;
    let h = 0;
    if (melt && /^(MELT_0|MELT_1|DONE|BROWNED|BUNNED)$/.test(s)) {           // the melts: Joe's draped Swiss carries its own patty
      const k = s === "MELT_0" ? "swissF" : s === "MELT_1" || s === "DONE" ? "swissM" : "swissB";
      h = put(ctx, k, cx, by, w * 1.05, sq); if (!h) return false;
      if (s === "BUNNED") put(ctx, RYE(opt.bread) || !opt.bread ? "rye" : "bun", cx, by - h * 0.45, w * 0.98);
      return true;
    }
    const base = s === "SEAR_A" ? "raw" : s === "BURNT" ? "burnt" : s === "DONE" ? "done" : "seared";
    h = put(ctx, base, cx, by, w, sq); if (!h) return false;
    if (s === "ONION") put(ctx, "onion", cx, by - h * 0.55, w * 0.62);
    else if (s === "MELT_0") put(ctx, "cheeseF", cx, by - h * 0.42, w * 0.86, sq);
    else if (s === "MELT_1") put(ctx, "cheeseM", cx, by - h * 0.30, w * 1.0, sq);
    if (/^(MELT_1|DONE)$/.test(s) || /^(MELT_0)$/.test(s)) steam(ctx, cx, by - h, w, 2);
    return true;
  }
  // a plated order: the plate (diner) or tray (HEROES) + the build. n = how far plating has got (0..4), gc = grilled cheese
  function plated(ctx, cx, by, w, n, opt) {
    const melt = opt.melt;
    if (melt) { return !!put(ctx, opt.school ? "meltH" : "meltD", cx, by, w * 1.05); }
    const ph = put(ctx, opt.school ? "tray" : "plate", cx, by, w * 0.98); if (!ph) return false;
    const fy = by - ph * 0.42, fw = w * 0.5;
    if (opt.gc) {                                                          // bread · melting American · bread, pressed
      if (n >= 1) { const b = put(ctx, "bun", cx, fy, fw); if (n >= 2) put(ctx, "cheeseM", cx, fy - b * 0.55, fw * 1.05); if (n >= 3) put(ctx, "bun", cx, fy - b * 0.65, fw * 0.98); }
      return true;
    }
    // (1125) the ORDER's build when opt.item is given (Billy's carry + the plate at its seat): HAMBURGER = patty only,
    // BURGER / SMASH = + American, DOUBLE_CHEESE = two patties + American, SMASH_MELT (when no plated melt painting) = + onions;
    // no item = the plain plate as before
    const it = opt.item || "", cheese = /^(BURGER|SMASH|DOUBLE_CHEESE|SMASH_MELT|PATTY_MELT)$/.test(it), two = it === "DOUBLE_CHEESE",
      onion = /MELT$/.test(it);
    if (n >= 1) { const b = put(ctx, RYE(opt.bread) ? "rye" : "bun", cx, fy, fw);       // the heel · the patty · the crown
      if (n >= 2) { let top = fy - b * 0.45; const p = put(ctx, "done", cx, top, fw * 0.96);
        if (two) { top -= p * 0.48; put(ctx, "done", cx, top, fw * 0.92); }
        if (n >= 3 && onion) put(ctx, "onion", cx, top - p * 0.30, fw * 0.66);
        if (n >= 3 && cheese) put(ctx, "cheeseM", cx, top - p * 0.22, fw * 0.98);
        if (n >= 4) put(ctx, RYE(opt.bread) ? "rye" : "bun", cx, top - p * (cheese ? 0.70 : 0.62), fw * 0.98, { sy: 1.15 }); } }
    return true;
  }
  function draw(ctx, key, box, opt) {
    if (!loaded || !box) return false; opt = opt || {};
    const cx = box.x + box.w / 2, a = opt.a;
    const save = a != null && a < 1; if (save) { ctx.save(); ctx.globalAlpha *= Math.max(0, a); }
    let done = false;
    try {
      let m;
      if ((m = /^grill\.(.+)$/.exec(key))) {
        const st = m[1], w = box.w * (/^(SMASH|SMELT)_/.test(st) ? 0.84 : 1.0), by = box.y + box.h * 0.86;
        if (st === "RYE_LID") return (done = !!put(ctx, "rye", cx, box.y + box.h * 0.62, box.w * 0.95));
        shadow(ctx, cx, by, w, true);
        done = patty(ctx, st, cx, by, w, opt);
      } else if ((m = /^flip\.(\d)$/.exec(key))) {                          // the 8-drawing turn: the painting squashes through edge-on
        const f = +m[1], t = f / 7, w = box.w * 0.97, by = box.y + box.h * 0.9, lift = Math.sin(Math.PI * t) * box.h * 0.75;
        shadow(ctx, cx, by, w * (1 - 0.35 * Math.sin(Math.PI * t)), true);
        done = !!put(ctx, t < 0.5 ? "raw" : "seared", cx, by - lift, w, { sy: Math.max(0.12, Math.abs(Math.cos(Math.PI * t))) });
      } else if ((m = /^toaster\.BUN_(\w+)$/.exec(key))) {
        const w = box.w * 0.62, by = box.y + box.h * 0.66;
        shadow(ctx, cx, by, w, false);
        done = !!put(ctx, RYE(opt.bread) ? "rye" : "bun", cx, by, w, { tint: BUN_TINT[m[1]] });
      } else if ((m = /^toaster\.GC_(\w+)$/.exec(key))) {
        const st = m[1], w = box.w * 0.6, by = box.y + box.h * 0.66, tint = st === "TOAST" ? BUN_TINT.TOASTING : st === "BURNT" ? BUN_TINT.BURNT : null;
        shadow(ctx, cx, by, w, false);
        const b = put(ctx, "bun", cx, by, w, { tint }); if (!b) return false;
        put(ctx, st === "BURNT" ? "cheeseB" : st === "TOAST" ? "cheeseF" : "cheeseM", cx, by - b * 0.5, w * 1.02);
        put(ctx, "bun", cx, by - b * 0.62, w * 0.97, { tint });
        if (st === "MELT" || st === "DONE") steam(ctx, cx, by - b * 1.5, w, 2);
        done = true;
      } else if ((m = /^(plating|to_pass)(_gc)?(?:\.(\d))?$/.exec(key))) {
        const n = m[1] === "plating" ? +(m[3] || 4) : 4, w = box.w * 0.92, by = box.y + box.h * 0.9;
        shadow(ctx, cx, by, w * 0.9, false);
        done = plated(ctx, cx, by, w, n, { ...opt, gc: opt.gc || !!m[2] });
      }
    } finally { if (save) ctx.restore(); }
    return done;
  }
  root.PMFoodPaint = { load, draw, on: () => !FOOD3D, ready: () => loaded && ok(IMG.seared), FILES };
})(typeof globalThis !== "undefined" ? globalThis : this);
