// PATTY MELT — BILLY'S RUN: the expo + THE PASS as one render-only model (?art=3d). Pure + deterministic given the
// engine states and frame times it is fed, so the SAME code draws the game (kitchen.html) and is audited headless
// (tools/billy_check.mjs). It never writes engine state.
//
// How the ENGINE serves (web/engine.js): while billy >= cfg.billy_serve_min and not mid-swing (billy_turn_t), every
// billy_interval ticks _billy_tick takes the FIRST servable item in his zone (co-op: billy_facing's half) and rings it
// up — or, if it was understeared, SENT BACK. That instant is when the order leaves the grill. HEY BILLY tops his
// attention up (and, in co-op, starts a TURN_LATENCY swing to the hollering cook); attention drifts down every tick.
//
// How it is SHOWN (every beat keyed to those state changes, nothing invented):
//   serve tick  → the plate is built on the board (P1/P2 spot) and slides onto ITS pass slot (0 = left half / P1,
//                 1 = right half / P2) under a lit heat lamp — it waits there until Billy physically takes it
//   on duty     → (billy >= serve_min) Billy walks to the pass, picks up each waiting plate in order onto his tray
//   run         → he carries exactly those plates, seat by seat along the aisle routes from locations.json, hands
//                 each one off at its seat, and heads back (to the pass if he's on duty / plates wait, else his slack spot)
//   slack       → (billy < serve_min, tray empty) he idles at the bus spot in his slack pose
//   sent back   → that plate is refused at the table, rides back on his tray and goes back through the pass
//   turn        → (co-op, billy_turn_t > 0) he swings at the pass, picking up nobody
// Walking is distance-driven (stride-locked walk phase), speed-capped, never teleports.
(function (root) {
  "use strict";
  const RUN_V = 300, SLACK_V = 150, PICK_MS = 140, HAND_MS = 300, DROP_MS = 320, PLATE_MS = 300, SLIDE_MS = 300, TRAY_MAX = 6, IDLE_GO_MS = 700;
  const PARTY = 3;   // a booth is a party: up to 3 consecutive orders go to the same table (stools = singles)
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  function create(geo, opts = {}) {
    const S = {
      t: 0, nextId: 1, plates: [], events: [],
      billy: { x: geo.slack[0], y: geo.slack[1], face: 1, mode: "slack", path: null, seg: 0, phase: 0, tray: [], timer: 0, idleT: 0, dest: "slack", seat: -1 },
      prev: null, seatRR: 0,
    };
    const log = (type, extra) => S.events.push(Object.assign({ t: Math.round(S.t), type, bx: +S.billy.x.toFixed(2), by: +S.billy.y.toFixed(2) }, extra));
    const servable = (p, TI) => p && p.stage !== undefined && p.stage === "DONE" && (!TI.has(p.item) || p.bunned);
    // ---- routes (DIN-local px). seats[s].out = [pass, (lane top), (lane s), (stop.x, lane s), stop] ----
    const seatOut = (s) => geo.seats[s].out;
    function route(from, to) {   // from/to: "pass" | "slack" | seat index
      if (from === to) return [];
      const P = geo.pass, B = geo.passBus;
      if (from === "pass" && to === "slack") return B.slice(1);
      if (from === "slack" && to === "pass") return B.slice(0, -1).reverse();
      if (from === "pass" && typeof to === "number") return seatOut(to).slice(1);
      if (typeof from === "number" && to === "pass") return seatOut(from).slice(0, -1).reverse();
      if (from === "slack" && typeof to === "number") return B.slice(0, -1).reverse().slice(1).concat(seatOut(to).slice(1));
      if (typeof from === "number" && to === "slack") return seatOut(from).slice(0, -1).reverse().slice(0, -1).concat(B.slice(1));
      // seat → seat: back to the lane junction, along the kitchen-side lane, out the other lane
      const A = seatOut(from), C = seatOut(to);
      return [A[3], A[2], C[2], C[3], C[4]];
    }
    function go(dest, slack) {
      const b = S.billy; const from = b.dest;
      b.path = [[b.x, b.y]].concat(route(from, dest)); b.seg = 0; b.dest = dest; b.v = slack ? SLACK_V : RUN_V;
      b.mode = "walk"; b.seat = typeof dest === "number" ? dest : -1;
    }
    // ---- per ENGINE TICK: what did the engine just do? ----
    S.onTick = function (g) {
      const TI = opts.toastItems || new Set();
      const snap = { slots: g.slots.map((p) => p ? { born: p.born, srv: servable(p, TI), us: !!p.understeared, item: p.item } : null),
                     toaster: (g.toaster || []).map((e) => e ? { born: e.born, srv: e.stage !== undefined && servable(e, TI), us: !!e.understeared, item: e.item } : null),
                     n: g.served + g.sent_back, holler: g.billy };
      const pv = S.prev; S.prev = snap; if (!pv) return;
      let k = snap.n - pv.n; if (k <= 0) return;
      const half = Math.floor(g.slots.length / 2), found = [];
      pv.slots.forEach((q, i) => { if (q && q.srv && (!snap.slots[i] || snap.slots[i].born !== q.born)) found.push({ k: i < half ? 0 : 1, us: q.us, from: "slot" + i, item: q.item }); });
      pv.toaster.forEach((q, j) => { if (q && q.srv && (!snap.toaster[j] || snap.toaster[j].born !== q.born)) found.push({ k: 0, us: q.us, from: "toaster" + j, item: q.item }); });
      for (let n = 0; n < k; n++) {
        const f = found[n] || { k: 0, us: false, from: "?" };
        const seated = Math.max(2, Math.min(geo.seats.length, opts.seated ? opts.seated(g) : geo.seats.length));
        let seat;
        if (S.party && S.party.left > 0 && S.party.seat < seated) { seat = S.party.seat; S.party.left--; }
        else { seat = (S.seatRR++) % seated; S.party = { seat, left: seat >= 6 ? PARTY - 1 : 0 }; }
        const p = { id: S.nextId++, k: f.k, seat, sent: f.us, from: f.from, item: f.item || null, state: "plating", t0: S.t, q: 0, tick: g.ticks };   // item: which dish (the plated melt art)
        S.plates.push(p); log("serve", { plate: p.id, k: p.k, seat, sent: p.sent, from: f.from, tick: g.ticks });
      }
    };
    // ---- per RENDER FRAME ----
    S.update = function (g, dtMs) {
      S.t += dtMs; const b = S.billy;
      const onDuty = (g.billy >= g.cfg.billy_serve_min || g.won) && !g.over;   // shift clear: he runs out what's left
      // plates in the kitchen: build → slide → wait in their pass slot (queue position per slot)
      for (const p of S.plates) {
        if (p.state === "plating" && S.t - p.t0 >= PLATE_MS) p.state = "slide";
        if (p.state === "slide" && S.t - p.t0 >= PLATE_MS + SLIDE_MS) { p.state = "pass"; p.tPass = S.t; log("land", { plate: p.id, k: p.k }); }
        if (p.state === "returned" && S.t - p.tRet >= 600) { p.state = "gone"; log("back_to_kitchen", { plate: p.id }); }
        if (p.state === "served" && S.t - p.tServed >= 4000) p.state = "cleared";
      }
      const waiting = S.plates.filter((p) => p.state === "pass");
      [0, 1].forEach((k) => waiting.filter((p) => p.k === k).forEach((p, i) => { p.q = i; }));
      // Billy
      if (b.mode === "walk") {
        let step = b.v * dtMs / 1000;
        while (step > 0 && b.seg < b.path.length - 1) {
          const a = [b.x, b.y], c = b.path[b.seg + 1], d = dist(a, c);
          if (d <= step) { b.x = c[0]; b.y = c[1]; step -= d; b.phase += d; b.seg++; }
          else { const u = step / d; if (Math.abs(c[0] - a[0]) > 0.5) b.face = c[0] > a[0] ? 1 : -1; b.x += (c[0] - a[0]) * u; b.y += (c[1] - a[1]) * u; b.phase += step; step = 0; }
        }
        if (b.seg >= b.path.length - 1) {   // arrived
          b.timer = 0;
          if (b.dest === "pass") { b.mode = "at_pass"; b.face = -1; log("arrive_pass"); }
          else if (b.dest === "slack") { b.mode = "slack"; b.idleT = 0; log("arrive_slack"); }
          else { b.mode = "handoff"; log("arrive_seat", { seat: b.dest }); }
        }
      } else if (b.mode === "at_pass") {
        b.timer += dtMs;
        const ret = b.tray.map((id) => S.plates.find((p) => p.id === id)).filter((p) => p.state === "rejected");
        if (ret.length) {                              // a sent-back plate goes back through the pass first
          if (b.timer >= DROP_MS) { const p = ret[0]; b.tray = b.tray.filter((id) => id !== p.id); p.state = "returned"; p.tRet = S.t; b.timer = 0; log("return", { plate: p.id }); }
        } else if (g.billy_turn_t > 0 && !g.over && !g.won) { /* co-op swing: serving nobody (frozen engine = no swing) */ }
        else {
          const next = waiting.slice().sort((a, c) => a.tPass - c.tPass)[0];
          if (next && b.tray.length < TRAY_MAX && b.timer >= PICK_MS) {
            next.state = "tray"; b.tray.push(next.id); b.timer = 0; log("pickup", { plate: next.id, k: next.k });
          } else if (b.tray.length && (!onDuty || b.tray.length >= TRAY_MAX || (!next && b.timer >= IDLE_GO_MS))) {
            b.tray.sort((a, c) => S.plates.find((p) => p.id === a).seat - S.plates.find((p) => p.id === c).seat);
            const first = S.plates.find((p) => p.id === b.tray[0]); go(first.seat); log("run", { tray: b.tray.slice() });
          } else if (!b.tray.length && !next && !onDuty) { go("slack", true); log("to_slack"); }
        }
      } else if (b.mode === "handoff") {
        b.timer += dtMs;
        if (b.timer >= HAND_MS) {
          const here = b.tray.map((id) => S.plates.find((p) => p.id === id)).filter((p) => p.seat === b.dest && p.state === "tray");
          for (const p of here) {
            if (p.sent) { p.state = "rejected"; log("refused", { plate: p.id, seat: p.seat }); }
            else { p.state = "served"; p.tServed = S.t; b.tray = b.tray.filter((id) => id !== p.id); log("deliver", { plate: p.id, seat: p.seat }); }
          }
          const left = b.tray.map((id) => S.plates.find((p) => p.id === id)).filter((p) => p.state === "tray");
          if (left.length) go(left[0].seat);
          else if (b.tray.length || onDuty || waiting.length) go("pass");   // carrying a refused plate, or more to run
          else go("slack", true);
        }
      } else if (b.mode === "slack") {
        b.idleT += dtMs;
        if (onDuty || (waiting.length && b.idleT > 1500)) go("pass", !onDuty);
      }
    };
    S.trayPlates = () => S.billy.tray.map((id) => S.plates.find((p) => p.id === id));
    S.geo = geo;
    return S;
  }
  const API = { create, RUN_V, SLACK_V, TRAY_MAX };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.BillyRun = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
