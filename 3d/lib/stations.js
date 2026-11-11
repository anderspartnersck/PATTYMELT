// PATTY MELT — THE RENDERED STATION LOOPS (render-only; Blender 1110, tools/build_stations.py → assets/art3d/stations/).
// Canvas-size overlays at the 3D kitchen camera, each cropped to its moving rect, drawn at KIT + rect:
//   sizzle  — the flat-top's spit + shimmer, while ANY grill item is cooking (SEAR_A / SEAR_B / MELT)
//   glow    — the toaster's heat shimmer (the "toast" loop with its baked bun stripped), per bay, while that bay is busy
//   bunpick — the two-spatula BUN CARRY: the pair lifts a bun off the bun pans and lays it on the toaster. Fires the
//             moment the ENGINE puts a new bun in a toaster bay (the press already happened — the bun is in the engine);
//             the page hides that bun until the carry lands, and hides the laying cook's own cursor pair during it
//             (the rendered pair IS her pair). Aborts the instant her cursor leaves the toaster (input stays live).
// Observer-only: reads game state, never writes it. ?stations=off disables. No rear-cook carry (the arms hold the pair).
(function (root) {
  "use strict";
  const Q = new URLSearchParams((root.location && location.search) || "");
  const OFF = Q.get("stations") === "off";
  const IMG = {};                      // "set/loop" -> [Image]
  let set = null, carry = null, prevT = null, prevGame = null;
  function init(skinSet, base) {
    if (OFF || !root.PM_STATIONS || !root.PM_STATIONS[skinSet]) return false;
    set = skinSet;
    for (const [lp, L] of Object.entries(root.PM_STATIONS[set])) IMG[lp] = L.frames.map((f) => { const im = new Image(); im.src = base + f; return im; });
    return true;
  }
  const ok = () => !!set;
  function frameOf(lp, t, once) {
    const L = root.PM_STATIONS[set][lp], fr = IMG[lp]; if (!L || !fr) return null;
    let i = Math.floor(t * L.fps / 1000); if (once) { if (i >= fr.length) return null; } else i %= fr.length;
    const im = fr[i]; return im && im.complete && im.naturalWidth ? { im, i, n: fr.length, rect: L.rect } : null;
  }
  // once per frame, before the toaster draws: detect a freshly laid bun → start the carry
  function observe(g, opt) {
    if (!set || !g) return;
    if (g !== prevGame) { prevGame = g; prevT = null; carry = null; }
    const T = g.toaster || [], n = g.slots.length, now = performance.now();
    const cur = T.map((b) => b ? (b.stage === undefined ? "bun:" + b.born : "gc") : null);
    if (prevT && prevT.length === cur.length && !opt.rear) for (let j = 0; j < cur.length; j++) {
      if (cur[j] && cur[j].startsWith("bun") && cur[j] !== prevT[j] && j < (opt.bays || []).length) {
        let pi = g.players.findIndex((pl) => pl.cursor === n + j); if (pi < 0) pi = 0;
        carry = { j, pi, t0: now, cursor: n + j };
      }
    }
    prevT = cur;
    if (carry) {
      const pl = g.players[carry.pi];
      if (!T[carry.j] || T[carry.j].stage !== undefined || (pl && pl.cursor !== carry.cursor) || (now - carry.t0) * root.PM_STATIONS[set].bunpick.fps / 1000 >= IMG.bunpick.length) carry = null;
    }
  }
  const hideBay = (j) => !!(carry && carry.j === j);                   // the bun is still riding the pair
  const carrying = (pi) => !!(carry && carry.pi === pi);              // her cursor pair is the rendered one
  function drawSizzle(ctx, g, kx, ky) {
    if (!set) return;
    const S = root.PM.Stage, hot = g.slots.some((p) => p && (p.stage === S.SEAR_A || p.stage === S.SEAR_B || p.stage === S.MELT));
    if (!hot) return; const f = frameOf("sizzle", performance.now()); if (f) ctx.drawImage(f.im, kx + f.rect[0], ky + f.rect[1]);
  }
  function drawToaster(ctx, g, kx, ky, bays) {          // glow per busy bay (clipped to that bay's half) + the carry
    if (!set) return;
    const T = g.toaster || [], now = performance.now(), f = frameOf("glow", now);
    if (f && bays && bays.length) {
      const [x0, y0, x1, y1] = f.rect;
      for (let j = 0; j < T.length && j < bays.length; j++) {
        if (!T[j] || hideBay(j)) continue;
        const lo = j === 0 ? x0 : (bays[j - 1].x + bays[j].x) / 2, hi = j === bays.length - 1 ? x1 : (bays[j].x + bays[j + 1].x) / 2;
        ctx.save(); ctx.beginPath(); ctx.rect(kx + lo, ky + y0, hi - lo, y1 - y0); ctx.clip();
        ctx.drawImage(f.im, kx + x0, ky + y0); ctx.restore();
      }
    }
    if (carry) {
      const c = frameOf("bunpick", now - carry.t0, true); if (!c) return;
      const dx = bays && bays[carry.j] && bays[0] ? (bays[carry.j].x - bays[0].x) * (c.i / (c.n - 1)) : 0;   // the loop lands in bay 0: steer it to the real bay
      ctx.save(); if (carry.pi === 1) ctx.filter = "hue-rotate(150deg) saturate(1.2)";                      // P2's pair (same tint as lib/spatulas.js)
      ctx.drawImage(c.im, kx + c.rect[0] + dx, ky + c.rect[1]); ctx.restore();
    }
  }
  root.PMStations = { init, ok, observe, hideBay, carrying, drawSizzle, drawToaster, OFF, _carry: () => carry };
})(typeof globalThis !== "undefined" ? globalThis : this);
