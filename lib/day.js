// PATTY MELT — THE DAY presentation (Joe 1112, docs/DAY-1112.md).  *** for Christine & Phillip Coleman. ***
//
// Render-only (reads engine fields; parity untouched). The engine's opt-in day schedule (cfg.sched) runs the
// arrivals; this shows the day WITHOUT telling it (show-don't-tell):
//   * THE WALL CLOCK — a diner clock on the dining-room wall, hands on the engine's day_clock, a neon ring in the
//     colour of the hour (lunch noon-white, lull teal, happy-hour pink, the blast red, last call violet).
//   * THE RUSH CUE — before a WAVE (a seating / a rush) the door bell jingles and a line forms outside the door;
//     before a TAKE-OUT flood the phone by the pickup shelf rings. No banner: you see them coming and brace.
//   * THE PICKUP SHELF — take-out bags wait on the TAKE-OUT PICK-UP rack: a pending order is a ticket stub with a
//     pie clock running down to its quoted pickup; a bagged order sits there until its caller walks in; a late one
//     has its caller standing at the shelf, tapping.
// (1112 art pass) vector art drawn at the canvas's device resolution: chrome wall clock, kraft bags, ticket stubs, a red
// wall phone, backlit queue silhouettes. ART WANTED (painted): wall clock, paper bags (diner) / lunch sacks (HEROES), phone,
// queue silhouettes (see docs/DAY-1112.md).
(function (root) {
  "use strict";
  const COL = { cream: "#f3e6c8", amber: "#e0a92e", bad: "#ff5a4d", good: "#7ad17a", dim: "#a89a80", ink: "#16100c" };
  // the hour's colour + name (minutes since midnight). Weekend closes at 24:00; the names still fit.
  const PHASES = [
    [11 * 60 + 45, "OPEN", "#f3e6c8"],
    [15 * 60, "LUNCH POP", "#ffe9a8"],
    [17 * 60 + 30, "THE LULL", "#7fd6c8"],
    [19 * 60, "HAPPY HOUR", "#ff8fc8"],
    [20 * 60, "DINNER", "#ffb25a"],
    [22 * 60, "THE BLAST", "#ff5a4d"],
    [22 * 60 + 30, "WIND-DOWN", "#9aa8ff"],
    [24 * 60 + 1, "LAST CALL", "#c49aff"],
  ];
  function phaseOf(min) { for (const p of PHASES) if (min < p[0]) return { name: p[1], col: p[2] }; return { name: "CLOSED", col: COL.dim }; }
  function clockOf(pm, g) { return g && g.cfg && g.cfg.sched && pm.day_clock ? pm.day_clock(g) : null; }
  function hour24(pm, g) { const m = clockOf(pm, g); return m == null ? null : Math.floor(m / 60) % 24; }
  function hhmm(m) { const h = Math.floor(m / 60) % 24, mm = m % 60; return ((h + 11) % 12 + 1) + ":" + String(mm).padStart(2, "0") + (h < 12 ? " AM" : " PM"); }

  // the size of the wave about to walk in (consecutive arrivals of the same kind from the next one)
  function waveAhead(g) {
    const sc = g.cfg.sched, k = g.service.nextId - 1;
    if (!sc || k >= sc.kinds.length) return { n: 0, kind: "walk" };
    let n = 0; while (k + n < sc.kinds.length && sc.kinds[k + n] === sc.kinds[k] && (n === 0 || !sc.wave[k + n])) n++;
    return { n, kind: sc.kinds[k] };
  }

  let _cue = -1, _cueKind = "", _wasBreather = false;
  function jingle(a, kind) {             // door bell (a seating / rush) or the phone (take-out). Placeholder synth.
    if (!a || !a.on || !a.on() || !a._tone) return;
    const t = a.ctx.currentTime;
    if (kind === "togo") { for (let i = 0; i < 2; i++) { a._tone(t + i * 0.32, 1240, 1240, 0.22, "square", 0.035); a._tone(t + i * 0.32, 1480, 1480, 0.22, "square", 0.025); } }
    else { a._tone(t, 2093, 2093, 0.35, "sine", 0.09); a._tone(t + 0.09, 2637, 2637, 0.32, "sine", 0.07); a._tone(t + 0.18, 2349, 2349, 0.4, "sine", 0.06); }
  }

  // THE WALL CLOCK (1112 art pass: was a flat placeholder disc) — a chrome-bezel diner clock, cream face with real
  // numerals, tapered hands + a red sweep hand, the hour's neon ring around it. frame = [x, y, w, h]: hang it in a square
  // chrome case of that size (the diner hangs it where the old tin sign was, so the case covers the sign completely).
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function hand(ctx, x, y, a, len, w0, w1, col) {
    const s = Math.sin(a), c = -Math.cos(a), px = -c, py = s;
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(x - s * len * 0.16 + px * w0, y - c * len * 0.16 + py * w0); ctx.lineTo(x + s * len + px * w1, y + c * len + py * w1);
    ctx.lineTo(x + s * len - px * w1, y + c * len - py * w1); ctx.lineTo(x - s * len * 0.16 - px * w0, y - c * len * 0.16 - py * w0); ctx.closePath(); ctx.fill();
  }
  function drawClock(ctx, x, y, r, min, ph, txt, bump, frame) {
    ctx.save();
    if (frame) {                                  // the square case (chrome, a soft wall shadow under it)
      const [fx, fy, fw, fh] = frame;
      ctx.fillStyle = "rgba(0,0,0,.35)"; rrect(ctx, fx + 1.5, fy + 2.5, fw, fh, 5); ctx.fill();
      const g = ctx.createLinearGradient(fx, fy, fx + fw, fy + fh); g.addColorStop(0, "#f2f2ee"); g.addColorStop(0.45, "#9a9c9e"); g.addColorStop(0.55, "#c9cbcc"); g.addColorStop(1, "#5c5f62");
      ctx.fillStyle = g; rrect(ctx, fx, fy, fw, fh, 5); ctx.fill();
      ctx.fillStyle = "#b8231d"; rrect(ctx, fx + 2.5, fy + 2.5, fw - 5, fh - 5, 3.5); ctx.fill();   // diner-red enamel behind the dial
    }
    ctx.shadowColor = ph.col; ctx.shadowBlur = r * 0.6;                 // the hour's neon ring
    ctx.strokeStyle = ph.col; ctx.lineWidth = Math.max(1.5, r * 0.1); ctx.beginPath(); ctx.arc(x, y, r * 1.1, 0, 7); ctx.stroke();
    ctx.shadowBlur = 0;
    const bz = ctx.createLinearGradient(x - r, y - r, x + r, y + r); bz.addColorStop(0, "#ffffff"); bz.addColorStop(0.5, "#8d9094"); bz.addColorStop(1, "#3c3f43");
    ctx.fillStyle = bz; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();                  // chrome bezel
    const fc = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r * 0.9); fc.addColorStop(0, "#fffdf6"); fc.addColorStop(1, "#ece2c9");
    ctx.fillStyle = fc; ctx.beginPath(); ctx.arc(x, y, r * 0.86, 0, 7); ctx.fill();          // the face
    ctx.strokeStyle = "#2a1a10";
    for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2, big = i % 5 === 0, r0 = r * (big ? 0.7 : 0.76);
      ctx.lineWidth = big ? Math.max(1, r * 0.06) : Math.max(0.5, r * 0.025);
      ctx.beginPath(); ctx.moveTo(x + Math.sin(a) * r0, y - Math.cos(a) * r0); ctx.lineTo(x + Math.sin(a) * r * 0.82, y - Math.cos(a) * r * 0.82); ctx.stroke(); }
    if (r >= 15) {                                                    // numerals once the dial is big enough to read them
      ctx.fillStyle = "#1a1008"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = `700 ${Math.round(r * 0.24 * 10) / 10}px "Saira Condensed","DIN Condensed","Arial Narrow",sans-serif`;
      for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI * 2; ctx.fillText(String(i), x + Math.sin(a) * r * 0.55, y - Math.cos(a) * r * 0.55 + r * 0.02); }
      ctx.textBaseline = "alphabetic";
    }
    const ha = ((min / 60) % 12) / 12 * Math.PI * 2, ma = (min % 60) / 60 * Math.PI * 2, sa = (min * 60 % 60) / 60 * Math.PI * 2;
    ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = r * 0.08; ctx.shadowOffsetY = r * 0.04;
    hand(ctx, x, y, ha, r * 0.46, r * 0.075, r * 0.03, "#1a1008");
    hand(ctx, x, y, ma, r * 0.7, r * 0.055, r * 0.02, "#1a1008");
    hand(ctx, x, y, sa, r * 0.76, r * 0.02, r * 0.012, "#d0202a");
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#d0202a"; ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, r * 0.08), 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.beginPath(); ctx.ellipse(x - r * 0.25, y - r * 0.4, r * 0.45, r * 0.18, -0.5, 0, 7); ctx.fill();   // glass glint
    // the time + the hour's name on a small enamel plate under it
    const py = frame ? frame[1] + frame[3] + 3 : y + r * 1.2 + 3, pw = 66, phh = 25;
    ctx.fillStyle = "rgba(14,8,6,.82)"; rrect(ctx, x - pw / 2, py, pw, phh, 4); ctx.fill();
    ctx.strokeStyle = ph.col; ctx.globalAlpha = 0.6; ctx.lineWidth = 1; rrect(ctx, x - pw / 2 + 0.5, py + 0.5, pw - 1, phh - 1, 4); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.restore();
    txt(hhmm(min), x, py + 11, 12, COL.cream, "center", 800);
    txt(bump || ph.name, x, py + 22, 10, ph.col, "center", 800);
  }

  // the waiting line on the sidewalk, seen through the front window: varied silhouettes (heights, hats, a kid), backlit
  function person(ctx, x, y, sc, k, T) {
    const h = [1, 0.92, 1.06, 0.7, 0.97, 1.03, 0.88][k % 7] * sc, sway = Math.sin(T * 2.2 + k * 1.9) * 0.6;
    const g = ctx.createLinearGradient(x, y - 30 * h, x, y + 12 * h); g.addColorStop(0, "rgba(40,30,52,.92)"); g.addColorStop(1, "rgba(16,10,22,.92)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x - 6.5 * h + sway, y - 14 * h); ctx.quadraticCurveTo(x + sway, y - 19 * h, x + 6.5 * h + sway, y - 14 * h);   // shoulders
    ctx.lineTo(x + 5.5 * h, y + 12 * h); ctx.lineTo(x - 5.5 * h, y + 12 * h); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(x + sway, y - 21.5 * h, 5 * h, 0, 7); ctx.fill();                                                           // head
    if (k % 3 === 1) { ctx.fillRect(x - 6.5 * h + sway, y - 26 * h, 13 * h, 1.8 * h); ctx.fillRect(x - 3.6 * h + sway, y - 30 * h, 7.2 * h, 4.2 * h); }   // a hat
    ctx.fillStyle = "rgba(255,214,150,.28)"; ctx.fillRect(x + 4.5 * h + sway, y - 14 * h, 1.2 * h, 24 * h);                              // rim light off the diner
  }
  function drawQueue(ctx, D, door, n, T) {
    const k = Math.min(7, Math.max(2, n)), sc = Math.max(0.6, D.h / 600) * 0.62;
    for (let i = k - 1; i >= 0; i--) {             // nearest the door first, trailing back along the glass
      const x = D.x + D.w * (0.965 - i * 0.026), y = D.y + D.h * (0.40 - i * 0.012) + (i % 2) * 2;
      person(ctx, x, y, sc, i, T);
    }
    const sw = Math.sin(T * 18) * 0.5;          // the brass bell over the door, swinging
    ctx.save(); ctx.translate(door.x, door.y - 46); ctx.rotate(sw);
    ctx.strokeStyle = "#5a3a10"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, -3); ctx.stroke();
    const bg = ctx.createLinearGradient(-7, 0, 7, 0); bg.addColorStop(0, "#8a5c12"); bg.addColorStop(0.4, "#ffd970"); bg.addColorStop(1, "#9a6a18");
    ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(-7, 10); ctx.quadraticCurveTo(-7, -2, 0, -3); ctx.quadraticCurveTo(7, -2, 7, 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#6a4a12"; ctx.beginPath(); ctx.arc(0, 11, 2.2, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawPhone(ctx, x, y, T) {          // the take-out phone on the wall by the shelf: a red wall phone, handset rattling
    const j = Math.sin(T * 40) * 1.2;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(x - 8, y - 9, 18, 24);
    const body = ctx.createLinearGradient(x - 9, 0, x + 9, 0); body.addColorStop(0, "#7e120e"); body.addColorStop(0.35, "#e0362b"); body.addColorStop(1, "#8e1a14");
    ctx.fillStyle = body; rrect(ctx, x - 9, y - 11, 18, 24, 3); ctx.fill();
    ctx.fillStyle = "#f3ead6"; ctx.beginPath(); ctx.arc(x, y + 4, 5, 0, 7); ctx.fill();                // the dial
    ctx.fillStyle = "#3a1008"; for (let i = 0; i < 8; i++) { const a = i / 8 * 5.2 + 0.6; ctx.beginPath(); ctx.arc(x + Math.sin(a) * 3.4, y + 4 - Math.cos(a) * 3.4, 0.7, 0, 7); ctx.fill(); }
    ctx.save(); ctx.translate(x + j, y - 12); ctx.rotate(j * 0.05);                                    // the handset in its cradle
    ctx.fillStyle = "#c42a22"; rrect(ctx, -11, -3, 22, 5, 2.5); ctx.fill(); ctx.fillStyle = "#a01e18"; ctx.beginPath(); ctx.arc(-9, 1, 3.2, 0, 7); ctx.arc(9, 1, 3.2, 0, 7); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "#2a1008"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 9, y + 8);           // the coiled cord
    for (let i = 0; i < 8; i++) ctx.quadraticCurveTo(x - 13 - (i % 2) * 2, y + 10 + i * 2, x - 11, y + 11 + i * 2); ctx.stroke();
    ctx.strokeStyle = "#f3e6c8"; ctx.lineWidth = 1.4;                                                  // RING lines
    for (const s of [-1, 1]) for (const rr of [15, 20]) { ctx.globalAlpha = rr === 15 ? 0.9 : 0.5; ctx.beginPath();
      ctx.arc(x, y - 10, rr, s < 0 ? Math.PI * 1.12 : -0.4, s < 0 ? Math.PI * 1.4 : -0.12); ctx.stroke(); }
    ctx.restore();
  }

  function drawBag(ctx, x, y, late) {          // a kraft take-out bag: folded top, side gusset shade, a red THANK YOU sticker
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(x + 1, y, 8.5, 1.8, 0, 0, 7); ctx.fill();
    const g = ctx.createLinearGradient(x - 7, 0, x + 7, 0); g.addColorStop(0, "#a8783c"); g.addColorStop(0.3, "#d7a868"); g.addColorStop(0.75, "#c8955a"); g.addColorStop(1, "#8e6430");
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x - 6.5, y - 13); ctx.lineTo(x + 6.5, y - 13); ctx.lineTo(x + 7, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#b98a4c"; ctx.beginPath(); ctx.moveTo(x - 6.5, y - 13); ctx.lineTo(x - 5.5, y - 17); ctx.lineTo(x + 5.5, y - 17); ctx.lineTo(x + 6.5, y - 13); ctx.closePath(); ctx.fill();   // the fold
    ctx.strokeStyle = "rgba(70,40,12,.55)"; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x - 6.5, y - 13); ctx.lineTo(x + 6.5, y - 13); ctx.stroke();
    for (const sx of [-3, 3]) { ctx.beginPath(); ctx.moveTo(x + sx, y - 16.5); ctx.lineTo(x + sx * 0.8, y - 13.5); ctx.stroke(); }   // the staple crimp
    ctx.fillStyle = late ? COL.bad : "#d0202a"; ctx.beginPath(); ctx.arc(x, y - 7, 2.8, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(x - 1.6, y - 7.3, 3.2, 0.7);
    ctx.restore();
  }

  function drawStub(ctx, x, y, frac) {         // a pending take-out ticket on a spike: torn edge + a pie clock running down
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(x - 5.5, y - 16, 12, 16);
    ctx.fillStyle = "#fbf6ea"; ctx.beginPath(); ctx.moveTo(x - 6, y - 17); ctx.lineTo(x + 6, y - 17);
    for (let i = 0; i <= 6; i++) ctx.lineTo(x + 6 - i * 2, y - (i % 2 ? 1.5 : 0)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#c0392b"; ctx.fillRect(x - 6, y - 17, 12, 1.5);
    const c = frac > 0.5 ? COL.good : frac > 0.25 ? COL.amber : COL.bad;
    ctx.fillStyle = "rgba(0,0,0,.12)"; ctx.beginPath(); ctx.arc(x, y - 8.5, 4.6, 0, 7); ctx.fill();
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y - 8.5); ctx.arc(x, y - 8.5, 4.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, frac)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(40,24,12,.6)"; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(x, y - 8.5, 4.6, 0, 7); ctx.stroke();
    ctx.restore();
  }

  function drawShelf(ctx, pm, g, at, T) {
    const tix = g.service.tickets.filter((t) => t.togo), now = g.ticks;
    const show = [];
    for (const t of tix) {
      if (t.rating === null) show.push({ t, kind: "stub" });
      else if (t.status === "served" && now < Math.max(t.due, t.servedTick + 20)) show.push({ t, kind: "bag" });   // waits for its caller
    }
    if (!show.length) return;
    const w = 112;
    ctx.fillStyle = "rgba(40,24,14,.85)"; ctx.fillRect(at.x - w / 2, at.y + 2, w, 5);   // the shelf board
    ctx.fillStyle = "rgba(40,24,14,.5)"; ctx.fillRect(at.x - w / 2 + 4, at.y + 7, 3, 12); ctx.fillRect(at.x + w / 2 - 7, at.y + 7, 3, 12);
    const max = 7;
    show.slice(0, max).forEach((e, i) => {
      const x = at.x - w / 2 + 12 + i * 15 + (e.t.bag % 2) * 2, y = at.y + 2;
      ctx.save(); ctx.translate(x, y); ctx.scale(1.35, 1.35);
      if (e.kind === "bag") drawBag(ctx, 0, 0, e.t.pickupLate);
      else drawStub(ctx, 0, 0, (e.t.due - now) / pm.TAKEOUT_WINDOW);
      ctx.restore();
    });
    const waiting = tix.filter((t) => t.rating === null && t.pickupLate).length;   // callers already here, tapping
    for (let i = 0; i < Math.min(3, waiting); i++) {
      const x = at.x + w / 2 + 10 + i * 12, y = at.y + 18 + Math.abs(Math.sin(T * 6 + i)) * -2;
      ctx.fillStyle = "rgba(20,12,8,.85)"; ctx.fillRect(x - 5, y - 4, 10, 14); ctx.beginPath(); ctx.arc(x, y - 8, 5, 0, 7); ctx.fill();
      ctx.fillStyle = COL.bad; ctx.beginPath(); ctx.arc(x + 5, y - 14, 2.5, 0, 7); ctx.fill();
    }
  }

  // o: { DIN, txt, door:{x,y}, takeout:{x,y}, audio, live, clockAt?:{x,y,r} }
  function draw(ctx, pm, g, o) {
    const min = clockOf(pm, g);
    if (min == null || !g.service) return;
    const T = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000, D = o.DIN;
    const ph = phaseOf(min);
    const ca = o.clockAt || { x: D.x + D.w - 50, y: D.y + 40, r: 22 };
    drawClock(ctx, ca.x, ca.y, ca.r, min, ph, o.txt, g.bumped || null, ca.frame || null);
    // the rush cue (door bell + a line outside / the phone) — fires once per wave
    const cue = pm.day_cue(g), wave = waveAhead(g);
    if (cue >= 0) {
      if (wave.kind === "togo") { ctx.save(); ctx.translate(o.takeout.x - 84, o.takeout.y - 74); ctx.scale(1.4, 1.4); drawPhone(ctx, 0, 0, T); ctx.restore(); }
      else drawQueue(ctx, D, o.door, wave.n, T);
      if (_cue < 0 && o.live) jingle(o.audio, wave.kind);
    }
    _cue = cue; _cueKind = wave.kind;
    drawShelf(ctx, pm, g, o.takeout, T);
    // the breather: the room exhales — a faint cool wash while the meter is recovering fast
    const br = pm.day_breather(g) && pm.buried_index(g) < pm.WAIT_COMFORT && g.wait > 0;
    if (br) { ctx.fillStyle = "rgba(120,200,220,0.05)"; ctx.fillRect(D.x, D.y, D.w, D.h); }
    _wasBreather = br;
  }

  const API = { PHASES, phaseOf, clockOf, hour24, hhmm, waveAhead, draw, drawClock };
  root.PMDay = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
