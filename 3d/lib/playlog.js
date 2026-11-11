// PATTY MELT — THE PLAYTEST LOG (local only). Records what a HUMAN did and when, so a playtest is data, not anecdote.
// NOTHING IS SENT ANYWHERE: the log lives in this browser's localStorage ("pmPlaylog.v1", last 40 sessions) and leaves
// the machine only if you press SAVE PLAYTEST LOG (a .json download). ?playlog=off disables it.
// Observer-only: it reads engine state before/after the page calls the engine; it never changes the game.
//
// What it records, per shift:
//   every FLIP / TOPPING / TOAST press — the item, its cook clock vs its window (early = sent back · rdy · PERFECT · late),
//     and how many ticks after the item went RDY the press came (reaction);
//   every HEY BILLY — was a plate waiting in your half (needed), was Billy already serving you (redundant), or nothing
//     was ready yet (early); how long the oldest finished plate had waited;
//   serves / burns / sent-backs / lost orders (from the engine's counters), the WAIT meter + buried index every second,
//   moves (count only), pauses, and how the shift ended.
// PMPlaylog.analyze(sessions) → the "wait for RDY" read (also used by tools/playlog_analyze.mjs in node).
(function (root) {
  "use strict";
  const KEY = "pmPlaylog.v1", CAP = 40, TPS_FALLBACK = 10;
  const keyOf = (p) => p ? (p.orderId != null ? "o" + p.orderId : "b" + p.born + ":" + p.item) : null;
  const isBun = (p) => p && p.stage === undefined;

  function create(pm, meta) {
    const Q = new URLSearchParams((root.location && location.search) || "");
    const off = Q.get("playlog") === "off";
    const S = pm.Stage, TPS = pm.TPS || TPS_FALLBACK;
    const sess = { v: 1, id: Date.now().toString(36), started: new Date().toISOString(), meta: Object.assign({ url: root.location ? location.search : "" }, meta || {}), shifts: [] };
    let cur = null, track = new Map();   // per item: { readyAt: tick the pending step went RDY, doneAt: tick it became servable }
    function target(g, pi) { const c = g.players[pi] ? g.players[pi].cursor : -1, n = g.slots.length;
      return c < n ? { cont: "grill", i: c, p: g.slots[c] } : { cont: "toaster", i: c - n, p: (g.toaster || [])[c - n] || null }; }
    function zone(g, pi) { if (g.players.length < 2) return g.slots.map((_, i) => i); const h = Math.floor(g.slots.length / 2); return pi === 0 ? [...Array(h).keys()] : [...Array(g.slots.length - h).keys()].map((i) => i + h); }
    const servable = (p) => p && !isBun(p) && p.stage === S.DONE && (!pm.TOAST_ITEMS.has(p.item) || p.bunned);
    function shiftStart(info) {
      if (off) return; track = new Map();
      cur = { n: info.n, name: info.name || "", kind: info.kind || "shift", t0: Date.now(), tick0: info.tick || 0, ev: [], moves: [0, 0], pauses: 0,
              series: { wait: [], buried: [] }, end: null };
      sess.shifts.push(cur);
    }
    function observe(g) {          // once per sim tick of HUMAN play
      if (off || !cur) return;
      const all = g.slots.map((p, i) => [p, "grill", i]).concat((g.toaster || []).map((p, i) => [p, "toaster", i]));
      for (const [p] of all) { if (!p || isBun(p)) continue; const k = keyOf(p); let t = track.get(k); if (!t) track.set(k, t = { step: p.step, readyAt: null, doneAt: null });
        if (t.step !== p.step) { t.step = p.step; t.readyAt = null; }
        if (t.readyAt == null && p.step < pm.RECIPES[p.item].length && p.cook >= pm.sear_ready(p)) t.readyAt = g.ticks;
        if (t.doneAt == null && servable(p)) t.doneAt = g.ticks; }
      if (g.ticks % TPS === 0) { cur.series.wait.push(+(g.wait / pm.WAIT_FULL).toFixed(3)); cur.series.buried.push(+pm.buried_index(g).toFixed(3)); }
    }
    function press(g, pi, verb, call) {    // wrap ONE human input: snapshot → the real engine call → what it did
      if (off || !cur || !g) return call();
      if (verb === "move") { cur.moves[pi] = (cur.moves[pi] || 0) + 1; return call(); }
      const tick = g.ticks, ev = { t: tick - cur.tick0, pi, verb };
      if (verb === "billy") {
        const z = zone(g, pi), waiting = z.map((i) => g.slots[i]).filter(servable).concat(pi === 0 || g.players.length < 2 ? (g.toaster || []).filter(servable) : []);
        const facingMe = g.players.length < 2 || (g.billy_facing === pi && !(g.billy_turn_t > 0));
        const onDuty = g.billy >= g.cfg.billy_serve_min;
        ev.billy = +(g.billy / pm.BILLY_FULL).toFixed(2); ev.facingMe = facingMe; ev.waiting = waiting.length;
        ev.kind = !waiting.length ? "early" : (facingMe && onDuty ? "redundant" : "needed");
        const oldest = waiting.map((p) => { const t = track.get(keyOf(p)); return t && t.doneAt != null ? tick - t.doneAt : 0; });
        ev.plateWait = oldest.length ? Math.max(...oldest) : null;
        call(); cur.ev.push(ev); return;
      }
      const tg = target(g, pi), p = tg.p;
      ev.at = tg.cont + tg.i;
      if (!p || isBun(p)) { call(); const q = target(g, pi).p; ev.kind = verb === "toast" && q && isBun(q) ? "bun" : "noop"; cur.ev.push(ev); return; }
      const step0 = p.step, cook = p.cook, w = pm.cook_window(g, p), ready = pm.sear_ready(p), tr = track.get(keyOf(p));
      ev.item = p.item; ev.cook = cook; ev.ready = ready; ev.ideal = [w.idealStart, w.idealEnd]; ev.burn = w.burn;
      call();
      if (p.step === step0) ev.kind = "noop";                       // wrong button / nothing pending: the engine ignored it
      else ev.kind = cook < ready ? "early" : cook < w.idealStart ? "rdy" : cook <= w.idealEnd ? "perfect" : "late";
      if (ev.kind !== "noop" && tr && tr.readyAt != null) ev.react = tick - tr.readyAt;
      cur.ev.push(ev);
    }
    function note(kind, extra) { if (!off && cur) cur.ev.push(Object.assign({ t: null, verb: kind }, extra || {})); if (kind === "pause" && cur) cur.pauses++; }
    function shiftEnd(g, outcome, extra) {
      if (off || !cur || cur.end) return;
      cur.end = Object.assign({ outcome, ms: Date.now() - cur.t0, ticks: g ? g.ticks - cur.tick0 : 0, served: g ? g.served : 0, fails: g ? g.fails : 0,
        sent_back: g ? g.sent_back : 0, combo_best: g ? g.combo_best : 0, score: g ? g.score : 0, wait: g ? +(g.wait / pm.WAIT_FULL).toFixed(3) : 0 }, extra || {});
      save();
    }
    function save() {
      if (off) return;
      try { const all = load(); const i = all.findIndex((s) => s.id === sess.id); if (i >= 0) all[i] = sess; else all.push(sess);
        while (all.length > CAP) all.shift(); localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) {}
    }
    function download() {
      save(); const data = JSON.stringify({ exported: new Date().toISOString(), sessions: load() }, null, 1);
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
      a.download = "patty-melt-playlog-" + new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-") + ".json";
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    if (root.addEventListener) root.addEventListener("pagehide", save);
    return { off, session: sess, shiftStart, observe, press, note, shiftEnd, save, download, current: () => cur };
  }
  function load() { try { const j = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(j) ? j : []; } catch (e) { return []; } }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }

  // ---------- the read: did they wait for RDY? ----------
  function analyze(sessions, tps = TPS_FALLBACK) {
    const out = { sessions: sessions.length, shifts: 0, cook: { early: 0, rdy: 0, perfect: 0, late: 0, noop: 0 }, react: [],
      billy: { needed: 0, redundant: 0, early: 0, plateWait: [] }, served: 0, fails: 0, sent_back: 0, byShift: [] };
    for (const s of sessions) for (const sh of s.shifts || []) {
      out.shifts++; const row = { session: s.id, n: sh.n, name: sh.name, outcome: sh.end ? sh.end.outcome : "open", early: 0, perfect: 0, presses: 0, hollers: 0, redundant: 0 };
      for (const e of sh.ev || []) {
        if (["flip", "top", "toast"].includes(e.verb) && e.kind in out.cook) { out.cook[e.kind]++; if (e.kind !== "noop") { row.presses++; if (e.kind === "early") row.early++; if (e.kind === "perfect") row.perfect++; } if (e.react != null) out.react.push(e.react); }
        if (e.verb === "billy") { out.billy[e.kind]++; row.hollers++; if (e.kind === "redundant") row.redundant++; if (e.kind === "needed" && e.plateWait != null) out.billy.plateWait.push(e.plateWait); }
      }
      if (sh.end) { out.served += sh.end.served; out.fails += sh.end.fails; out.sent_back += sh.end.sent_back; }
      out.byShift.push(row);
    }
    const c = out.cook, acted = c.early + c.rdy + c.perfect + c.late;
    const med = (a) => { if (!a.length) return null; const q = a.slice().sort((x, y) => x - y); return q[Math.floor(q.length / 2)]; };
    out.summary = {
      presses: acted,
      early_pct: acted ? +(100 * c.early / acted).toFixed(1) : null,       // too soon → SENT BACK (the skill failing)
      rdy_pct: acted ? +(100 * c.rdy / acted).toFixed(1) : null,           // waited for RDY, a little eager
      perfect_pct: acted ? +(100 * c.perfect / acted).toFixed(1) : null,   // the sweet spot
      late_pct: acted ? +(100 * c.late / acted).toFixed(1) : null,         // waited too long (burn risk)
      wasted_presses: c.noop,
      rdy_skill: acted ? +(100 * (c.rdy + c.perfect) / acted).toFixed(1) : null,   // % of cook presses that waited for RDY and weren't late
      react_median_s: med(out.react) != null ? +(med(out.react) / tps).toFixed(2) : null,
      hollers: out.billy.needed + out.billy.redundant + out.billy.early,
      holler_needed_pct: (out.billy.needed + out.billy.redundant + out.billy.early) ? +(100 * out.billy.needed / (out.billy.needed + out.billy.redundant + out.billy.early)).toFixed(1) : null,
      holler_redundant: out.billy.redundant, holler_early: out.billy.early,
      plate_wait_median_s: med(out.billy.plateWait) != null ? +(med(out.billy.plateWait) / tps).toFixed(2) : null,
    };
    return out;
  }
  const API = { create, load, clear, analyze, KEY };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.PMPlaylog = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
