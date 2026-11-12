// PATTY MELT — THE ORDERS YOU CAN SEE (Joe 1111: "no orders reading out or showing… no bread choice").
// Render-only reader of the engine's SERVICE tickets (pm.order_receipts). Never writes game state.
//   printer  — Joe's receipt-printer sprite; every new ticket PRINTS (slides out, the printer jolts)
//   rail     — the ticket rail: one readable ticket per open order, oldest first:
//              SEAT (B1-B6 counter / T1-T4 booths) · item · bread · where it is now (WAITING / GRILL 3 / UP!)
//   call     — the order is CALLED: a banner over the kitchen + read aloud (speech; the S mute silences it)
//   chips    — the same seat tag rides on the food itself (grill patty / toaster bun), in its bread's colour,
//              so every patty on the flat-top says whose it is and what it goes on
//   pans     — the bread pans (SESAME · RYE · WHITE) as stops on the line, labelled; the bread on your blades
// Seat names come from ONE place: the engine's ticket.seat + seat_id/seat_label (PMService falls back to the
// same SEAT_CYCLE). Keep "B#"/"T#" — the dining-room plaques, Billy's run and the receipts all use them.
(function (root) {
  "use strict";
  const BREAD_COL = { SESAME: "#d9a55a", RYE: "#6b4a2e", WHITE: "#f3ead6" };
  const BREAD_INK = { SESAME: "#2B2B2B", RYE: "#f7f0e2", WHITE: "#2B2B2B" };
  const SAY_ITEM = { BURGER: "cheeseburger", HAMBURGER: "hamburger", GRILLED_CHEESE: "grilled cheese", PATTY_MELT: "patty melt",
                     DOUBLE_CHEESE: "double cheese", SMASH: "smash burger", SMASH_MELT: "smash melt" };
  const SAY_BREAD = { SESAME: "on sesame", RYE: "on rye", WHITE: "on white" };
  const NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  const IMG = {}; let base = "../assets/sprites/ui/";
  function img(k, f) { if (!IMG[k]) { const im = new Image(); im.src = base + f; IMG[k] = im; } const i = IMG[k]; return i.complete && i.naturalWidth ? i : null; }
  let pm = null, seen = 0, gameRef = null, prints = [], call = null, speakQ = 0;
  const now = () => performance.now();

  function seatIndex(t) {
    if (t && Number.isInteger(t.seat)) return t.seat;
    const cyc = (pm && pm.SEAT_CYCLE) || [0, 1, 6, 2, 3, 7, 4, 8, 5, 9];
    return cyc[Math.abs(Math.floor(Number(t && t.id) || 0)) % cyc.length];
  }
  const seatId = (i) => pm && pm.seat_id ? pm.seat_id(i) : (i < 6 ? "B" + (i + 1) : "T" + (i - 5));
  const seatLabel = (i) => pm && pm.seat_label ? pm.seat_label(i) : (i < 6 ? "BAR " + (i + 1) : "TABLE " + (i - 5));
  const breadTag = (b) => (pm && pm.BREAD_TAG && pm.BREAD_TAG[b]) || ({ SESAME: "SES", RYE: "RYE", WHITE: "WHT" })[b] || "";
  const breadLabel = (b) => (pm && pm.BREAD_LABEL && pm.BREAD_LABEL[b]) || ({ SESAME: "SESAME BUN", RYE: "RYE", WHITE: "WHITE" })[b] || "";
  const itemLabel = (it) => (pm && pm.ITEM_LABEL && pm.ITEM_LABEL[it]) || String(it || "").replace(/_/g, " ");

  function tickets(g) { return g && g.service ? g.service.tickets.filter((t) => t.rating === null) : []; }
  function rows(g) {                                   // the engine's own receipt rows (slot, status, next action)
    if (!g || !g.service || !pm.order_receipts) return [];
    try { return pm.order_receipts(g); } catch (e) { return []; }
  }

  // ---- per frame: new tickets print + get called ----
  function update(g, opt = {}) {
    if (g !== gameRef) { gameRef = g; seen = g && g.service ? g.service.tickets.reduce((n, t) => Math.max(n, t.id), 0) : 0; prints = []; call = null; }
    if (!g || !g.service) return;
    for (const t of g.service.tickets) if (t.id > seen) {
      seen = t.id; prints.push({ id: t.id, t0: now() });
      const si = seatIndex(t), bread = t.bread || null;
      call = { t0: now(), text: "ORDER IN · " + seatId(si) + " · " + itemLabel(t.item) + (bread ? " ON " + breadLabel(bread) : ""), bread };
      if (opt.voice && !opt.muted) say("Order in. " + (si < 6 ? "Bar " : "Table ") + NUM[si < 6 ? si + 1 : si - 5] + ", " +
                                       (SAY_ITEM[t.item] || itemLabel(t.item).toLowerCase()) + (bread ? " " + SAY_BREAD[bread] : "") + ".");
    }
  }
  function say(line) {
    const S = root.speechSynthesis; if (!S || !root.SpeechSynthesisUtterance) return;
    try {
      if (S.speaking && speakQ >= 2) S.cancel(), speakQ = 0;          // never fall behind the kitchen: drop the backlog
      const u = new SpeechSynthesisUtterance(line); u.rate = 1.12; u.pitch = 1.0; u.volume = 0.9;
      u.onend = u.onerror = () => { speakQ = Math.max(0, speakQ - 1); };
      speakQ++; S.speak(u);
    } catch (e) {}
  }
  function hush() { try { root.speechSynthesis && root.speechSynthesis.cancel(); } catch (e) {} speakQ = 0; }

  // ---- drawing helpers ----
  function T(ctx, s, x, y, sz, c, al = "left", w = 800) {
    ctx.fillStyle = c; ctx.textAlign = al; ctx.textBaseline = "alphabetic";
    ctx.font = w + " " + sz + 'px "Saira Condensed","Arial Narrow",sans-serif'; ctx.fillText(s, x, y);
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }

  // the seat chip that rides on the food: "T3" in the bread's colour (no bread yet = cream)
  function chip(ctx, tOrP, x, y, opt = {}) {
    const g = gameRef; if (!g || !g.service) return;
    const t = tOrP && tOrP.orderId != null ? g.service.tickets.find((q) => q.id === tOrP.orderId) : tOrP;
    if (!t) return;
    const si = seatIndex(t), id = seatId(si), b = t.bread || (tOrP && tOrP.bread) || null;
    const lab = id + (b && !opt.noBread ? " " + breadTag(b) : ""), w = 10 + lab.length * 6.2, h = 15;
    ctx.save(); ctx.globalAlpha = opt.alpha == null ? 0.95 : opt.alpha;
    ctx.fillStyle = b ? BREAD_COL[b] : "#f3e6c8"; ctx.strokeStyle = "rgba(20,12,6,.85)"; ctx.lineWidth = 1.5;
    rr(ctx, x - w / 2, y - h / 2, w, h, 4); ctx.fill(); ctx.stroke(); ctx.restore();
    T(ctx, lab, x, y + 4.5, 12, b ? BREAD_INK[b] : "#2B2B2B", "center", 800);
  }
  // a bun / slice on the toaster says which bread it is
  function breadChip(ctx, bread, x, y) {
    if (!bread) return; const lab = breadTag(bread), w = 30, h = 14;
    ctx.save(); ctx.fillStyle = BREAD_COL[bread]; ctx.strokeStyle = "rgba(20,12,6,.85)"; ctx.lineWidth = 1.2;
    rr(ctx, x - w / 2, y - h / 2, w, h, 3); ctx.fill(); ctx.stroke(); ctx.restore();
    T(ctx, lab, x, y + 4.5, 11, BREAD_INK[bread], "center", 800);
  }

  // ---- the rail: printer at the left end, tickets oldest → newest ----
  function where(r, g) {
    if (!r) return { s: "WAITING", c: "#7a6a58" };
    if (r.status === "queued") return { s: "WAITING", c: "#7a6a58" };
    const surf = r.surface === "toaster" ? "TOASTER " : "GRILL ";
    if (r.status === "ready") {
      if (/BUN/.test(String(r.nextAction || ""))) return { s: "NEEDS " + (r.bread ? breadTag(r.bread) : "BUN"), c: "#c0392b", blink: true };
      return { s: "UP! · EXPO", c: "#1f7a3a", blink: true, up: true };
    }
    return { s: surf + (r.slot + 1), c: "#3b2a1c" };
  }
  function drawRail(ctx, g, box) {
    if (!g || !g.service) return;
    const open = tickets(g); const R = rows(g), byId = new Map(R.map((r) => [r.id, r]));
    const tw = box.tw || 92, th = box.th || 66, gap = 6, pw = box.printerW || 70, ph = Math.round(pw * 1100 / 1430);
    const t = now();
    // the rail bar
    ctx.save(); ctx.fillStyle = "rgba(30,24,18,.55)"; rr(ctx, box.x, box.y - 4, box.w, th + 14, 6); ctx.fill();
    ctx.fillStyle = "#b9b4ad"; ctx.fillRect(box.x + pw + 4, box.y - 1, box.w - pw - 8, 4); ctx.restore();
    // the printer (jolts while a ticket is printing)
    const printing = prints.find((p) => t - p.t0 < 700);
    const jolt = printing ? Math.sin((t - printing.t0) / 35) * 1.5 : 0;
    const P = img("printer", "receipt-printer.png");
    if (P) ctx.drawImage(P, box.x + 2 + jolt, box.y + th - ph + 6, pw, ph);
    else { ctx.fillStyle = "#cfc6b4"; rr(ctx, box.x + 2, box.y + th - 40, pw, 40, 5); ctx.fill(); }
    T(ctx, open.length ? open.length + " OPEN" : "NO ORDERS", box.x + 2 + pw / 2, box.y + th + 8, 10, "#f3e6c8", "center", 800);
    const x0 = box.x + pw + 10, fit = Math.max(1, Math.floor((box.w - pw - 14 + gap) / (tw + gap)));
    const shown = open.slice(0, open.length > fit ? fit - 1 : fit);
    shown.forEach((tk, i) => {
      const r = byId.get(tk.id), wh = where(r, g), si = seatIndex(tk), b = tk.bread || null;
      let x = x0 + i * (tw + gap), y = box.y + 3;
      const pr = prints.find((p) => p.id === tk.id), age = pr ? t - pr.t0 : 1e9;
      if (age < 600) { const u = age / 600, e = 1 - (1 - u) * (1 - u);   // fresh off the printer: slides out of the slot
        x = box.x + pw * 0.5 + (x - box.x - pw * 0.5) * e; y = box.y + th * 0.4 * (1 - e) + 3 * e; ctx.globalAlpha = 0.4 + 0.6 * e; }
      // paper
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
      ctx.fillStyle = wh.up ? "#fff7d6" : "#fbf6ea"; rr(ctx, x, y, tw, th, 3); ctx.fill(); ctx.restore();
      ctx.fillStyle = "#c0392b"; ctx.fillRect(x, y, tw, 3);                       // the order pad's red rule
      if (wh.up && (t / 260 | 0) % 2) { ctx.strokeStyle = "#f2c14e"; ctx.lineWidth = 3; rr(ctx, x - 1, y - 1, tw + 2, th + 2, 4); ctx.stroke(); }
      // seat (big) + ticket number
      T(ctx, seatId(si), x + 5, y + 21, 19, "#2B2B2B", "left", 900);
      T(ctx, "#" + tk.id, x + tw - 4, y + 15, 10, "#7a6a58", "right", 700);
      // item
      T(ctx, itemLabel(tk.item), x + 5, y + 35, 11, "#2B2B2B", "left", 800);
      // bread band
      if (b) { ctx.fillStyle = BREAD_COL[b]; rr(ctx, x + 4, y + 39, tw - 8, 11, 2); ctx.fill();
        T(ctx, "ON " + breadLabel(b), x + tw / 2, y + 48, 9.5, BREAD_INK[b], "center", 800); }
      // where it is now
      if (!wh.blink || (t / 300 | 0) % 2) T(ctx, wh.s, x + tw / 2, y + th - 5, 10, wh.c, "center", 900);
      ctx.globalAlpha = 1;
    });
    if (open.length > shown.length) T(ctx, "+" + (open.length - shown.length) + " MORE", x0 + shown.length * (tw + gap) + 4, box.y + th / 2 + 6, 13, "#f2c14e", "left", 900);
  }
  // the order CALL: a banner across the top of the kitchen for ~1.8 s
  function drawCall(ctx, box) {
    if (!call) return; const age = now() - call.t0; if (age > 1800) return;
    const a = age < 150 ? age / 150 : age > 1500 ? (1800 - age) / 300 : 1;
    ctx.save(); ctx.globalAlpha = a;
    ctx.font = '900 20px "Saira Condensed","Arial Narrow",sans-serif'; const w = Math.min(box.w - 20, ctx.measureText(call.text).width + 34);
    const x = box.x + (box.w - w) / 2, y = box.y;
    ctx.fillStyle = "rgba(20,14,10,.86)"; rr(ctx, x, y, w, 30, 6); ctx.fill();
    ctx.strokeStyle = call.bread ? BREAD_COL[call.bread] : "#f2c14e"; ctx.lineWidth = 2; ctx.stroke();
    T(ctx, call.text, x + w / 2, y + 22, 20, "#f2c14e", "center", 900);
    ctx.restore();
  }
  // the bread pans as stops on the line: labels + the cursor ring + "PICK" hint; the bread riding the pair
  function drawPans(ctx, g, cells) {
    if (!g || !cells || !cells.length || !pm || !pm.BREADS) return;
    const base = g.slots.length + (g.toaster ? g.toaster.length : 0);
    cells.forEach((c, k) => {
      const bread = pm.BREADS[k]; if (!bread) return;
      const on = g.players.some((pl) => pl.cursor === base + k);
      if (on) { ctx.save(); ctx.strokeStyle = "#f2c14e"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(c.x, c.y, 22, 12, 0, 0, 7); ctx.stroke(); ctx.restore(); }
      breadChip(ctx, bread, c.x, c.y + 16);
      if (on) T(ctx, "X = GRAB", c.x, c.y - 18, 11, "#f2c14e", "center", 900);
    });
  }
  function drawHeld(ctx, g, pi, x, y) {
    const pl = g && g.players[pi]; if (!pl || !pl.held) return;
    breadChip(ctx, pl.held, x, y - 30);
  }
  root.PMOrders = { init(p, opt = {}) { pm = p; if (opt.base) base = opt.base; }, update, drawRail, drawCall, chip, breadChip, drawPans, drawHeld,
                    seatIndex, seatId, seatLabel, breadTag, breadLabel, hush, BREAD_COL };
})(typeof globalThis !== "undefined" ? globalThis : this);
