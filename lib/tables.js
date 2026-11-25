// PATTY MELT — GROUP LANDING presentation (1124 pc, ORDER 28A prep; engine cfg.tables, URL ?tables=1, default OFF).
//
// Render-only: reads engine fields (game.passq, game.service.tables, game.pops); parity is untouched, and nothing here
// runs unless game.cfg.tables is on. Joe 1124: windows ON THE BELL <= 3 s, CLEAN <= 6 s (engine BELL_SPREAD/CLEAN_SPREAD).
//   * THE PASS SHELF — the stainless shelf under the heat lamps; up to 4 plates of an incomplete table wait here (static).
//   * THE BELL — the counter bell; it rings (a short wobble) when a table goes out ON THE BELL.
//   * HEAT STEAM — a baked sprite strip over each waiting plate (capped: <= 4 plates, one strip, no particles).
//   * THE CALL STAMPS — ON THE BELL / CLEAN / RAGGED, stamped over the pass for a beat when a table lands.
// ART HOOKS: painted sprites (Order 28A GPU half) drop into assets/sprites/pass-1124/ as listed in ART below; until they
// exist, every piece falls back to a plain vector placeholder so the flag is playable now.
(function (root) {
  "use strict";
  const BASE = "assets/sprites/pass-1124/";
  const ART = {
    shelf: "pass_shelf.webp",        // 1 frame, the shelf + heat-lamp hood, ~360x120
    plate: "pass_plate.webp",        // 1 frame, the plated melt (diner plate), 144x96 (2x)
    plateH: "pass_plate_heroes.webp", // (1125) the HEROES school tray, picked when PMProps.skin === "school"
    bell: "pass_bell.webp",          // 2 frames side by side (rest | struck), ~2x56x48
    steam: "pass_steam.webp",        // STEAM_FRAMES frames side by side, ~64x96 each, alpha
    stampBELL: "stamp_on_the_bell.webp",
    stampCLEAN: "stamp_clean.webp",
    stampRAGGED: "stamp_ragged.webp",
  };
  const STEAM_FRAMES = 8, STEAM_FPS = 8, PLATES_MAX = 4, STAMP_TICKS = 14;   // stamp shows 1.4 s (engine TPS 10)
  const CALL_OF = { "ON THE BELL": "BELL", "CLEAN LANDING": "CLEAN", "RAGGED": "RAGGED" };
  const CALL_COL = { BELL: "#ffd23a", CLEAN: "#7ad17a", RAGGED: "#ff5a4d" };
  const CALL_TXT = { BELL: "ON THE BELL", CLEAN: "CLEAN", RAGGED: "RAGGED" };
  const FONT = '"Saira Condensed","Arial Narrow",sans-serif';   // the house type (kitchen.html txt())

  const img = {};
  function art(k) {                       // lazy: a missing file just leaves the vector placeholder
    if (!(k in img)) {
      img[k] = null;
      if (typeof Image !== "undefined") {
        const im = new Image();
        im.onload = () => { img[k] = im; };
        im.src = BASE + ART[k];
      }
    }
    return img[k];
  }

  function lastCall(g) {                  // the most recent landing pop still inside its stamp window
    const pops = g.pops || [];
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i], c = CALL_OF[p.label];
      if (!c) continue;
      const age = g.ticks - p.t;
      return age >= 0 && age <= STAMP_TICKS ? { call: c, age } : null;
    }
    return null;
  }

  // anchor = { x, y }: the centre-bottom of the pass ledge on the canvas (kitchen.html supplies it per layout)
  function draw(ctx, g, anchor, clockSec) {
    if (!g || !g.cfg || !g.cfg.tables) return;
    const ax = anchor.x, ay = anchor.y;
    ctx.save();
    // THE PASS SHELF
    const sw = 180, sh = 14, shelf = art("shelf");
    if (shelf) ctx.drawImage(shelf, ax - sw / 2, ay - 60, sw, 60 + sh);
    else {
      ctx.fillStyle = "#8c8f94"; ctx.fillRect(ax - sw / 2, ay, sw, sh);
      ctx.fillStyle = "#c9ccd1"; ctx.fillRect(ax - sw / 2, ay, sw, 3);
    }
    // plates waiting on THE PASS (static; capped) + one baked steam strip over each
    const school = root.PMProps && root.PMProps.skin === "school";
    const q = (g.passq || []).slice(0, PLATES_MAX), plate = art(school ? "plateH" : "plate"), steam = art("steam");
    const fr = Math.floor((clockSec || 0) * STEAM_FPS) % STEAM_FRAMES;
    q.forEach((p, i) => {
      const px = ax - sw / 2 + 24 + i * ((sw - 76) / Math.max(1, PLATES_MAX - 1)), py = ay - 2;   // (1125) the 4th plate clears the bell
      if (plate) ctx.drawImage(plate, px - 18, py - 24, 36, 24);
      else {
        ctx.fillStyle = "#f3e6c8"; ctx.beginPath(); ctx.ellipse(px, py - 4, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#c98a3c"; ctx.beginPath(); ctx.ellipse(px, py - 8, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
      }
      if (steam) {
        const fw = steam.width / STEAM_FRAMES;
        ctx.globalAlpha = 0.8; ctx.drawImage(steam, ((fr + i * 3) % STEAM_FRAMES) * fw, 0, fw, steam.height, px - 14, py - 64, 28, 42);
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 2;
        const w = Math.sin(((clockSec || 0) * 3) + i) * 3;
        ctx.beginPath(); ctx.moveTo(px - 4, py - 14); ctx.quadraticCurveTo(px - 4 + w, py - 26, px - 3, py - 38); ctx.stroke();
      }
    });
    // THE BELL (struck for the first beat of an ON THE BELL call)
    const lc = lastCall(g), struck = lc && lc.call === "BELL" && lc.age < 5, bell = art("bell");
    const bx = ax + sw / 2 - 14, by = ay;
    if (bell) {
      const fw = bell.width / 2;
      ctx.drawImage(bell, struck ? fw : 0, 0, fw, bell.height, bx - 14, by - 22, 28, 22);
    } else {
      ctx.save(); ctx.translate(bx, by);
      if (struck) ctx.rotate(Math.sin(lc.age * 2.2) * 0.18);
      ctx.fillStyle = "#e0a92e"; ctx.beginPath(); ctx.arc(0, -6, 9, Math.PI, 0); ctx.fill();
      ctx.fillRect(-11, -6, 22, 3); ctx.fillRect(-1.5, -18, 3, 4);
      ctx.restore();
    }
    // THE CALL STAMP
    if (lc) {
      const k = "stamp" + lc.call, st = art(k), a = 1 - Math.max(0, lc.age - STAMP_TICKS + 4) / 4;
      const sc = 1 + Math.max(0, 3 - lc.age) * 0.12;     // a quick thump in, then still
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.translate(ax, ay - 84); ctx.scale(sc, sc); ctx.rotate(-0.06);
      if (st) { const h = 48, w = st.width * h / st.height; ctx.drawImage(st, -w / 2, -h / 2, w, h); }   // (1125) 512x160 art -> ~154x48, the placeholder box's size
      else {
        const t = CALL_TXT[lc.call];
        ctx.font = "800 26px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const tw = ctx.measureText(t).width + 20;
        ctx.strokeStyle = CALL_COL[lc.call]; ctx.lineWidth = 3; ctx.strokeRect(-tw / 2, -18, tw, 36);
        ctx.fillStyle = CALL_COL[lc.call]; ctx.fillText(t, 0, 1);
      }
    }
    ctx.restore();
  }

  root.PMTables = { draw, ART, BASE, STEAM_FRAMES, PLATES_MAX };
})(typeof window !== "undefined" ? window : globalThis);
