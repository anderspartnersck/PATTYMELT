// PATTY MELT — HI-DPI canvas (Joe 1112: "text looked really bad … all the cut-out sprites look worse than I know you are
// capable"). Every page authored its canvas at a fixed LOGICAL size (1280×600, 760×620, 1280×720) and let CSS stretch
// it to the window with image-rendering:pixelated — so on a retina / 1080p+ screen every glyph and sprite was blown up
// 2-3× with nearest-neighbour. This keeps the logical size (all game/layout code is untouched) and gives the canvas a
// BACKING STORE at the real device resolution: draw code runs under a base scale, text + vectors rasterise at native
// res, sprites sample their (≥2×) source pixels instead of a pre-shrunk copy, and the browser no longer upscales.
//   const SS = PMHiDPI.setup(cv, W, H);   // once, after the logical size is known (returns the backing scale)
//   PMHiDPI.begin(ctx);                    // at the top of every frame (resets the base transform + smoothing)
// ?ss=N forces the scale (1 = the old look, for A/B); default = device px / logical px, capped at 2.5 (fill-rate).
(function (root) {
  "use strict";
  let SS = 1;
  function pick(W) {
    const q = parseFloat(new URLSearchParams((root.location && location.search) || "").get("ss"));
    if (q > 0) return Math.min(3, q);
    const dpr = root.devicePixelRatio || 1;
    const css = Math.max(root.innerWidth || W, (root.screen && root.screen.width) || 0);   // fullscreen = the screen width
    return Math.max(1, Math.min(2.5, Math.ceil(css * dpr / W * 4) / 4));
  }
  function setup(cv, W, H, opts = {}) {
    SS = opts.ss || pick(W);
    cv.width = Math.round(W * SS); cv.height = Math.round(H * SS);
    cv.style.imageRendering = "auto";        // (was pixelated: a nearest-neighbour blow-up of every frame)
    cv._pmSS = SS;
    return SS;
  }
  function begin(ctx, ss) {
    const k = ss || (ctx.canvas && ctx.canvas._pmSS) || SS;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";   // big down-scales (spatulas, burn FX) filter, not alias
  }
  root.PMHiDPI = { setup, begin, get ss() { return SS; } };
})(typeof globalThis !== "undefined" ? globalThis : this);
