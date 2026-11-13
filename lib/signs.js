// PATTY MELT — THE SIGNS, lettered live (Joe 1112: "text looked really bad on just about all patty melt locations and
// signs for the environments. or the signs were in bad spots").
//
// Every set's signage was baked into a 640×600 render (or the painted dining-room plate) and then smeared by the
// painterly pass + a 2-3× upscale — so the words came out blurred, AI-wobbly or plain wrong (a COUGARS valance in the
// DINER). This layer re-letters them CRISP at the canvas's real device resolution:
//   * each sign = a quad on the panel (640×600 panel px, TL TR BR BL) that covers the baked sign completely (the plate
//     paints the old letters out), then real type on it, mapped through the quad (strip-affine = perspective-matched)
//   * plate + type are rasterised once into a cache at ≥2× the on-screen size and reused every frame (cheap)
//   * copy is short + on-brand; placements stay where a real diner / cafeteria hangs them, off the HUD and the grill
// Render-only: it reads nothing from the engine.
//   PMSigns.draw(ctx, set, panel)        set = "diner_kitchen" | "diner_dining" | "heroes_kitchen" | "heroes_dining"
//   PMSigns.anchor(set, "clock", panel)  where the set hangs its wall clock (THE DAY's clock; lib/day.js draws it)
//   ?signs=off  → the old baked signs (A/B)
(function (root) {
  "use strict";
  const Q = new URLSearchParams((root.location && location.search) || "");
  const OFF = Q.get("signs") === "off";
  // type stacks (no web fonts ship with the game: the Mac cab has these; others fall back cleanly)
  const F = {
    cond: '"Saira Condensed","DIN Condensed","Arial Narrow","Helvetica Neue",sans-serif',
    gold: 'Copperplate,"Copperplate Gothic Bold","Trajan Pro",Georgia,serif',
    chalk: '"Chalkboard SE",Chalkboard,"Comic Sans MS","Marker Felt",cursive',
    script: '"Snell Roundhand","Brush Script MT","Segoe Script",cursive',
    futura: 'Futura,"Century Gothic","Avenir Next","Trebuchet MS",sans-serif',
  };
  // ---- plate styles: paint(ctx, w, h) draws the blank sign that covers the baked one ----
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function lin(c, y0, y1, stops) { const g = c.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, s]) => g.addColorStop(o, s)); return g; }
  const PLATE = {
    navy(c, w, h) {                      // HEROES station plate: navy enamel, a thin brass rule, gold-leaf letters
      c.fillStyle = lin(c, 0, h, [[0, "#26346e"], [0.55, "#1b2552"], [1, "#121a3c"]]); rr(c, 0, 0, w, h, h * 0.12); c.fill();
      c.strokeStyle = "#c9a24a"; c.lineWidth = Math.max(1, h * 0.06); rr(c, h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16, h * 0.08); c.stroke();
    },
    navyBand(c, w, h) {                  // a long navy banner / fascia (no inner rule; brass top + bottom edges)
      c.fillStyle = lin(c, 0, h, [[0, "#24316a"], [1, "#151d44"]]); c.fillRect(0, 0, w, h);
      c.fillStyle = "#c9a24a"; c.fillRect(0, 0, w, Math.max(1, h * 0.05)); c.fillRect(0, h - Math.max(1, h * 0.05), w, Math.max(1, h * 0.05));
    },
    fascia(c, w, h) {                    // paint the baked words out of a dark counter front: a feathered patch, no visible plate
      const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, "rgba(8,9,14,0)"); g.addColorStop(0.12, "rgba(8,9,14,1)");
      g.addColorStop(0.88, "rgba(8,9,14,1)"); g.addColorStop(1, "rgba(8,9,14,0)"); c.fillStyle = g; c.fillRect(0, 0, w, h); },
    fasciaLt(c, w, h) {                  // the same on the cafeteria line's lighter navy front
      const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, "rgba(20,23,34,0)"); g.addColorStop(0.1, "rgba(20,23,34,1)");
      g.addColorStop(0.9, "rgba(20,23,34,1)"); g.addColorStop(1, "rgba(20,23,34,0)"); c.fillStyle = g; c.fillRect(0, 0, w, h); },
    brass(c, w, h) {                     // the diner flat-top's name plate
      c.fillStyle = lin(c, 0, h, [[0, "#f3d68a"], [0.45, "#c99a3c"], [1, "#8a6420"]]); rr(c, 0, 0, w, h, h * 0.25); c.fill();
      c.strokeStyle = "rgba(60,36,8,.8)"; c.lineWidth = Math.max(1, h * 0.07); rr(c, 0.5, 0.5, w - 1, h - 1, h * 0.25); c.stroke();
    },
    chalk(c, w, h) {                     // a chalkboard in a wood frame, with a faint dusting of old chalk
      c.fillStyle = "#5a3a1e"; c.fillRect(0, 0, w, h);
      const f = Math.max(2, w * 0.035);
      c.fillStyle = lin(c, f, h - f, [[0, "#22282a"], [1, "#161b1c"]]); c.fillRect(f, f, w - 2 * f, h - 2 * f);
      let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      c.fillStyle = "rgba(230,230,220,.05)";
      for (let i = 0; i < 70; i++) { c.beginPath(); c.ellipse(f + rnd() * (w - 2 * f), f + rnd() * (h - 2 * f), 2 + rnd() * w * 0.08, 1 + rnd() * 3, rnd() * 3, 0, 7); c.fill(); }
    },
    enamel(c, w, h) {                    // porcelain-enamel shop sign: white field, red border
      c.fillStyle = lin(c, 0, h, [[0, "#fbf6ec"], [1, "#e8dfcf"]]); rr(c, 0, 0, w, h, h * 0.12); c.fill();
      c.strokeStyle = "#b8231d"; c.lineWidth = Math.max(1, h * 0.08); rr(c, h * 0.1, h * 0.1, w - h * 0.2, h - h * 0.2, h * 0.08); c.stroke();
    },
    cream(c, w, h) {                     // the take-out board: cream, navy type, red stars, wood edge
      c.fillStyle = "#6a4424"; rr(c, 0, 0, w, h, h * 0.08); c.fill();
      const f = Math.max(2, h * 0.07);
      c.fillStyle = lin(c, 0, h, [[0, "#fbf3e0"], [1, "#eadcbc"]]); rr(c, f, f, w - 2 * f, h - 2 * f, h * 0.05); c.fill();
    },
    valance(c, w, h) {                   // the diner's red-and-white awning valance over the windows (was the school's COUGARS one)
      const n = 9, sw = w / n, body = h * 0.74;
      for (let i = 0; i < n; i++) {
        c.fillStyle = i % 2 ? "#f4ecdc" : "#c42a22"; c.fillRect(i * sw, 0, sw + 0.5, body);
        c.beginPath(); c.moveTo(i * sw, body); c.quadraticCurveTo(i * sw + sw / 2, h * 1.02, i * sw + sw, body); c.closePath(); c.fill();
      }
      c.fillStyle = lin(c, 0, body, [[0, "rgba(0,0,0,.35)"], [0.25, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,.12)"]]); c.fillRect(0, 0, w, body);
      c.fillStyle = "#3a1a10"; c.fillRect(0, 0, w, Math.max(1, h * 0.06));   // the rod
    },
  };
  // ---- the sets. quad = the panel px corners TL TR BR BL; lines = [text, y (0..1 of the plate), size (of plate h), colour, font, extra]
  const GOLD = "#ecc760", CHALK = "#efeadb", CHALKY = "#f2d36b";
  const SETS = {
    diner_kitchen: {
      signs: [
        { id: "grill-plate", quad: [[263, 284], [335, 284], [335, 296], [263, 296]], plate: "brass",
          lines: [["PATTY MELT'S", 0.74, 0.72, "#3a2408", F.cond, { weight: 900, track: 0.08 }]] },
        // ACCESS POINT: the pass shelf (Billy's pick-up) — an enamel tag on the back wall right above it
        { id: "order-up", quad: [[480, 224], [546, 224], [546, 241], [480, 241]], plate: "enamel",
          lines: [["ORDER UP ▶", 0.74, 0.6, "#b8231d", F.cond, { weight: 900, track: 0.06 }]] },
      ],
    },
    diner_dining: {
      clock: { x: 441.5, y: 52.5, r: 21, frame: [416, 29, 51, 47] },   // the clock hangs where the old "ColaMan" tin sign was
      signs: [
        { id: "specials", quad: [[213, 17], [304, 17], [304, 101], [213, 101]], plate: "chalk",
          lines: [["Today's Special", 0.24, 0.15, CHALKY, F.script, { weight: 700 }],
                  ["PATTY MELT", 0.46, 0.17, CHALK, F.chalk, { weight: 700 }],
                  ["on grilled rye", 0.6, 0.1, CHALK, F.chalk, {}],
                  ["fries + a shake", 0.73, 0.1, CHALK, F.chalk, {}],
                  ["$12", 0.9, 0.16, "#ff6b5e", F.chalk, { weight: 700 }]] },
        { id: "shakes", quad: [[340, 27], [392, 27], [392, 49], [340, 49]], plate: "enamel",
          lines: [["SHAKES", 0.73, 0.56, "#b8231d", F.cond, { weight: 900, track: 0.06 }]] },
        { id: "valance", quad: [[478, 7], [641, 46], [641, 112], [478, 50]], plate: "valance", strips: 12,
          lines: [["GOOD BURGERS", 0.42, 0.26, "#3a1206", F.cond, { weight: 900, track: 0.12, panelOnly: [0.12, 0.62] }]] },
        { id: "takeout", quad: [[480, 256], [558, 256], [558, 298], [480, 298]], plate: "cream",
          lines: [["TAKE-OUT", 0.44, 0.3, "#1f3a78", F.cond, { weight: 900, track: 0.04 }],
                  ["★ PICK-UP ★", 0.8, 0.27, "#1f3a78", F.cond, { weight: 900, star: "#c42a22" }]] },
      ],
    },
    heroes_kitchen: {
      signs: [
        { id: "season", quad: [[36, 248], [121, 248], [121, 263], [36, 263]], plate: "navy",
          lines: [["SEASON & SIZZLE", 0.7, 0.5, GOLD, F.gold, { weight: 700 }]] },
        { id: "melt-master", quad: [[501, 251], [601, 251], [601, 268], [501, 268]], plate: "navy",
          lines: [["MELT MASTER", 0.7, 0.52, GOLD, F.gold, { weight: 700 }]] },
        { id: "miss-patty", quad: [[121, 275], [231, 275], [231, 290], [121, 290]], plate: "navy",
          lines: [["MISS PATTY", 0.72, 0.56, GOLD, F.gold, { weight: 700 }]] },
        { id: "miss-chrissy", quad: [[409, 275], [521, 275], [521, 290], [409, 290]], plate: "navy",
          lines: [["MISS CHRISSY", 0.72, 0.56, GOLD, F.gold, { weight: 700 }]] },
        // the window ledge between the two pick-up trays: it points at them (the old plate read "SERVICE WINDOW")
        { id: "order-up", quad: [[249, 305], [392, 305], [392, 322], [249, 322]], plate: "navy",
          lines: [["◀  ORDER UP  ▶", 0.73, 0.6, "#fff3c4", F.cond, { weight: 900, track: 0.1 }]] },
        { id: "fascia", quad: [[200, 421], [440, 421], [440, 444], [200, 444]], plate: "fascia",
          lines: [["FAST · HOT · HEROES", 0.7, 0.62, GOLD, F.gold, { weight: 700, track: 0.08 }]] },
      ],
    },
    // the HEROES front-door title shot (assets/art3d/heroes/title.webp, 1280×720 → panel 640×600: x/2, y/1.2)
    heroes_title: {
      signs: [
        { id: "season", quad: [[182.5, 286.7], [222.5, 286.7], [222.5, 299.2], [182.5, 299.2]], plate: "navy",
          lines: [["SEASON & SIZZLE", 0.7, 0.5, GOLD, F.gold, { weight: 700 }]] },
        { id: "order-up", quad: [[264.5, 328.3], [338, 337.5], [338, 356.3], [264.5, 346.4]], plate: "navy",
          lines: [["◀  ORDER UP  ▶", 0.72, 0.56, "#fff3c4", F.cond, { weight: 900, track: 0.1 }]] },
        { id: "melt-master", quad: [[415, 323], [477, 328.3], [477, 345.8], [415, 339.6]], plate: "navy",
          lines: [["MELT MASTER", 0.7, 0.52, GOLD, F.gold, { weight: 700 }]] },
        { id: "miss-chrissy", quad: [[363, 351.3], [411, 357.3], [411, 369.3], [363, 363.3]], plate: "navy",
          lines: [["MISS CHRISSY", 0.72, 0.56, GOLD, F.gold, { weight: 700 }]] },
        { id: "fascia", quad: [[240, 421.5], [328, 436.5], [328, 462], [240, 447]], plate: "fascia",
          lines: [["FAST · HOT · HEROES", 0.66, 0.5, GOLD, F.gold, { weight: 700, track: 0.06 }]] },
      ],
    },
    heroes_dining: {
      clock: { x: 470, y: 116, r: 12 },   // on the soffit wall right of the GAME DAY banner
      signs: [
        { id: "game-day", quad: [[236, 134], [421, 134], [421, 167], [236, 167]], plate: "navyBand",
          lines: [["GAME DAY!  GO COUGARS!", 0.66, 0.42, GOLD, F.gold, { weight: 700 }]] },
        { id: "go-left", quad: [[53, 168], [152, 168], [152, 192], [53, 192]], plate: "navyBand",   // the menu board hangs over its right end:
          lines: [["GO CATS!", 0.68, 0.46, GOLD, F.gold, { weight: 700, panelOnly: [0.02, 0.58] }]] },   // the words sit in the clear part
        { id: "menu", quad: [[111, 159], [187, 161], [186, 206], [110, 204]], plate: "chalk",
          lines: [["TODAY'S LUNCH", 0.24, 0.13, CHALKY, F.chalk, { weight: 700 }],
                  ["COUGAR", 0.45, 0.19, CHALK, F.chalk, { weight: 700 }],
                  ["CHEESEBURGER", 0.65, 0.15, CHALK, F.chalk, { weight: 700 }],
                  ["milk 25¢", 0.86, 0.12, "#ff8a7a", F.chalk, {}]] },
        { id: "go-right", quad: [[528, 180], [618, 180], [618, 206], [528, 206]], plate: "navyBand",
          lines: [["GO COUGARS!", 0.68, 0.48, GOLD, F.gold, { weight: 700 }]] },
        { id: "line-fascia", quad: [[248, 215], [408, 215], [408, 238], [248, 238]], plate: "fasciaLt",
          lines: [["FAST · HOT · HEROES", 0.68, 0.46, GOLD, F.gold, { weight: 700, track: 0.06 }]] },
      ],
    },
  };
  // ---- raster cache: plate + type at K px per panel px ----
  const cache = new Map();
  function fitText(c, s, font, weight, px, maxW, track) {
    let sz = px; c.font = `${weight || 700} ${sz}px ${font}`;
    const wOf = () => c.measureText(s).width + track * sz * (s.length - 1);
    while (sz > 4 && wOf() > maxW) { sz -= 0.5; c.font = `${weight || 700} ${sz}px ${font}`; }
    return { sz, w: wOf() };
  }
  function drawLine(c, ln, w, h) {
    const [s, yk, hk, col, font, o] = ln, track = o.track || 0;
    const x0 = o.panelOnly ? w * o.panelOnly[0] : 0, x1 = o.panelOnly ? w * o.panelOnly[1] : w;
    const { sz, w: tw } = fitText(c, s, font, o.weight, h * hk, (x1 - x0) * 0.9, track);
    let x = (x0 + x1) / 2 - tw / 2; const y = h * yk;
    c.textAlign = "left"; c.textBaseline = "alphabetic";
    c.shadowColor = "rgba(0,0,0,.45)"; c.shadowBlur = sz * 0.08; c.shadowOffsetY = sz * 0.04;
    for (const ch of s) {
      c.fillStyle = (o.star && ch === "★") ? o.star : col; c.fillText(ch, x, y);
      x += c.measureText(ch).width + track * sz;
    }
    c.shadowColor = "transparent";
  }
  function build(sg, K) {
    const q = sg.quad, w = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), h = Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]);
    const cv = document.createElement("canvas"); cv.width = Math.ceil(w * K); cv.height = Math.ceil(h * K);
    const c = cv.getContext("2d"); c.scale(K, K);
    PLATE[sg.plate](c, w, h);
    for (const ln of sg.lines || []) drawLine(c, ln, w, h);
    c.fillStyle = lin(c, 0, h, [[0, "rgba(255,250,235,.10)"], [0.5, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,.14)"]]);   // the room's top light
    c.fillRect(0, 0, w, h);
    return { cv, w, h };
  }
  const L = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  function blit(ctx, im, q, ox, oy, n) {
    const cw = im.cv.width, ch = im.cv.height;
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n, tl = L(q[0], q[1], u0), tr = L(q[0], q[1], u1), bl = L(q[3], q[2], u0);
      const sw = im.w * (u1 - u0), ov = i < n - 1 ? 0.6 : 0;   // a hair of overlap: no seams between strips
      ctx.save();
      ctx.transform((tr[0] - tl[0]) / sw, (tr[1] - tl[1]) / sw, (bl[0] - tl[0]) / im.h, (bl[1] - tl[1]) / im.h, ox + tl[0], oy + tl[1]);
      ctx.drawImage(im.cv, cw * u0, 0, cw * (u1 - u0) + (ov ? 1 : 0), ch, 0, 0, sw + ov, im.h);
      ctx.restore();
    }
  }
  function draw(ctx, set, panel) {
    const S = SETS[set]; if (OFF || !S) return;
    const m = ctx.getTransform(), K = Math.max(2, Math.ceil(Math.hypot(m.a, m.b) * 2 * (panel.w / 640)));   // ≥2× the device px it lands on
    const sx = panel.w / 640, sy = panel.h / 600;
    ctx.save(); ctx.translate(panel.x, panel.y); ctx.scale(sx, sy);
    for (const sg of S.signs) {
      const key = set + ":" + sg.id + ":" + K;
      let im = cache.get(key); if (!im) { im = build(sg, K); cache.set(key, im); }
      blit(ctx, im, sg.quad, 0, 0, sg.strips || (Math.abs((sg.quad[1][1] - sg.quad[0][1]) - (sg.quad[2][1] - sg.quad[3][1])) > 1.5 ? 8 : 1));
    }
    ctx.restore();
  }
  function anchor(set, name, panel) {
    const S = SETS[set], a = S && S[name]; if (!a) return null;
    const sx = panel.w / 640, sy = panel.h / 600;
    return Object.assign({}, a, { x: panel.x + a.x * sx, y: panel.y + a.y * sy, r: a.r * Math.min(sx, sy),
      frame: a.frame ? [panel.x + a.frame[0] * sx, panel.y + a.frame[1] * sy, a.frame[2] * sx, a.frame[3] * sy] : null });
  }
  root.PMSigns = { SETS, draw, anchor, get off() { return OFF; } };
})(typeof globalThis !== "undefined" ? globalThis : this);
