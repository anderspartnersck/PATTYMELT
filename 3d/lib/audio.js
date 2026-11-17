// PATTY MELT — shared WebAudio sound (zero-dep).  *** Dedicated to Christine & Phillip Coleman. ***
//
// Extracted from web/cabinet.html so the CANONICAL builds (kitchen.html, meltdome.html) aren't silent.
// Two layers on one AudioContext:
//   1. JOE'S SOUND SET (1117, docs/AUDIO-1117.md) — the levelled mp3s in web/audio/pm/ (tools/audio_prep.py), decoded from
//      audio/pm/bank.js (base64, so file:// pages work too). ONE MUSIC ENGINE (`Mus`): every music cue goes through it; a
//      new cue crossfades the old one (equal power, per-transition times, beat-quantised + bar-phase-locked between the
//      round beds), chained cues (INTRO → LULL, SYNTH → MAIN) are sample-scheduled, the same cue is never started twice
//      while it sounds, the music ducks briefly under the big stingers. SFX get a per-sound voice cap + cooldown. The
//      grill bed is a seamless loop whose level follows how full the grill is.
//   2. THE SYNTH (the old voices) — the singing-spatula FLIP, toast, holler, RDY blips, stings; and the FALLBACK for
//      every sample if the bank fails to load or decode (the game is never silent).
// Render-only: the engine never reads audio; audioEvents is a pure per-tick state diff (proven headless).
// Exposes globalThis.PMAudio = { AudioBus, audioSnap, audioEvents, SFX, active }.
//   NOTE: cabinet.html still carries an INLINE twin of the synth (its mute-button UI is intertwined) — keep in sync.
(function (g) {
  "use strict";

  function audioSnap(s) {
    return { served: s.served, sent_back: s.sent_back, fails: s.fails, waste: s.waste || 0, combo: s.combo, won: s.won, over: s.over };
  }
  function audioEvents(prev, s, FLOW) {                 // PURE — a per-tick state diff → sound events
    const ev = [];
    if (!prev) return ev;
    if (s.served < prev.served || s.fails < prev.fails || s.sent_back < prev.sent_back) return ev; // new game/round
    if (s.served > prev.served) ev.push({ t: "serve", combo: s.combo });
    if (s.sent_back > prev.sent_back) ev.push({ t: "sentback" });
    const wasted = Math.max(0, (s.waste || 0) - (prev.waste || 0));          // a WASTE is also a fail: its own sound
    for (let i = 0; i < wasted; i++) ev.push({ t: "waste" });
    const burntOrLost = (s.fails - prev.fails) - (s.sent_back - prev.sent_back) - wasted;
    for (let i = 0; i < burntOrLost; i++) ev.push({ t: "fail" });
    if (prev.combo < FLOW && s.combo >= FLOW) ev.push({ t: "flow" });
    if (s.won && !prev.won) ev.push({ t: "win" });
    if (s.over && !prev.over) ev.push({ t: "over" });
    return ev;
  }

  // ---------------- JOE'S SOUND SET: policy (levels are in the files; these are the mix + traffic rules) ----------------
  //   bus: sfx | ui | amb      gain: linear on top of the file's levelled loudness      cap: max simultaneous voices
  //   cd: cooldown (s) — a re-fire inside it is dropped      duck: dip the music to this under it (the big stingers)
  const SFX = {
    ui_move:   { bus: "ui",  gain: 0.80, cap: 2, cd: 0.045 },
    ui_select: { bus: "ui",  gain: 0.85, cap: 1, cd: 0.08 },
    ui_lock:   { bus: "ui",  gain: 0.90, cap: 1, cd: 0.30, duck: 0.55 },
    ui_back:   { bus: "ui",  gain: 0.80, cap: 1, cd: 0.08 },
    order_in:  { bus: "sfx", gain: 0.85, cap: 1, cd: 0.40, duck: 0.70 },
    served:    { bus: "sfx", gain: 0.85, cap: 2, cd: 0.25, duck: 0.65 },
    waste1:    { bus: "sfx", gain: 0.90, cap: 1, cd: 0.35, duck: 0.60, group: "waste" },
    waste2:    { bus: "sfx", gain: 0.90, cap: 1, cd: 0.35, duck: 0.60, group: "waste" },
    cheese:    { bus: "sfx", gain: 0.80, cap: 2, cd: 0.12 },
    onion:     { bus: "sfx", gain: 0.80, cap: 2, cd: 0.12 },
    bun_plate: { bus: "sfx", gain: 0.80, cap: 2, cd: 0.10 },
    billy_run: { bus: "sfx", gain: 0.70, cap: 1, cd: 2.50 },
  };
  const BUS = { music: 0.42, sfx: 1.0, ui: 0.9, amb: 0.55 };           // into the sample master (0.9)
  const GROUP_CD = { waste: 0.35 };
  // per-transition crossfades (s) — tuned to the 90 bpm ROUND 1 cues (beat 0.667, bar 2.667)
  const XF = { chain: 0.04, titleIn: 0.8, toRound: 0.6, up: 1.333, down: 2.0, toEnd: 0.5, out: 0.6, launch: 0.25, endToTitle: 1.2 };
  // round pressure (the WAIT meter 0..1) → INTENSE with hysteresis + a minimum dwell (no flapping)
  const PRESS = { up: 0.50, upHold: 1.0, down: 0.32, downHold: 3.0, dwell: 6.0 };

  let BANK_URL = null;
  try { const cs = typeof document !== "undefined" && document.currentScript; if (cs && cs.src) BANK_URL = new URL("../audio/pm/bank.js", cs.src).href; } catch (e) {}
  let bankState = "idle"; const bankWait = [];
  function loadBank(cb) {
    if (g.PM_AUDIO_BANK) { bankState = "ok"; return cb(true); }
    if (bankState === "fail" || !BANK_URL || typeof document === "undefined" || g.__PM_NO_BANK) { bankState = "fail"; return cb(false); }   // __PM_NO_BANK: QA (the fallback check)
    bankWait.push(cb); if (bankState === "loading") return; bankState = "loading";
    const sc = document.createElement("script"); sc.src = BANK_URL; sc.async = true;
    const done = (ok) => { bankState = ok && g.PM_AUDIO_BANK ? "ok" : "fail"; while (bankWait.length) bankWait.shift()(bankState === "ok"); };
    sc.onload = () => done(true); sc.onerror = () => done(false);
    (document.head || document.documentElement).appendChild(sc);
  }
  function b64buf(s) { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
  const EP_IN = (n) => { const c = new Float32Array(n); for (let i = 0; i < n; i++) c[i] = Math.sin(i / (n - 1) * Math.PI / 2); return c; };

  class AudioBus {
    constructor(opt = {}) {
      this.ctx = null; this.master = null; this.sizzle = null; this.crowd = null;
      this.noiseBuf = null; this.muted = false; this.disabled = !!opt.silent;
      this.sm = null; this.bus = {}; this.duckG = null; this.musLvl = null;
      this.buf = {}; this.loopBuf = {}; this.man = null; this.loaded = false; this.failed = false;
      this.voices = []; this.vid = 0; this.sfxAct = {}; this.sfxLast = {}; this.groupLast = {}; this.wasteAlt = 0;
      this.grillSrc = null; this.grillG = null; this.log = []; this.drops = 0; this._scened = false;
      this.sc = { name: "", serial: null, intense: false, since: 0, upT: 0, downT: 0, endDone: null };
      try { this.muted = localStorage.getItem("pattymelt.muted") === "1"; } catch {}
      if (!this.disabled) { g.PMAudio.active = this; loadBank(() => this._decode()); }
    }
    on() { return this.ctx && !this.muted; }
    ensure() {                                          // lazy — must follow a user gesture (or autoplay-allowed)
      if (this.ctx || this.disabled) return;
      const AC = g.AudioContext || g.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.45;
        this.master.connect(this.ctx.destination);
        const len = Math.floor(this.ctx.sampleRate * 1.2);
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;   // decoration RNG only
        const bed = (lp) => { const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
          const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp;
          const gn = this.ctx.createGain(); gn.gain.value = 0; src.connect(f).connect(gn).connect(this.master);
          src.start(); return gn; };
        this.sizzle = bed(2000);   // griddle hiss (fallback when the GRILL loop isn't loaded)
        this.crowd = bed(360);     // diner murmur
        // the sample side: master → buses (music runs through a duck stage + a level stage for pause)
        this.sm = this.ctx.createGain(); this.sm.gain.value = this.muted ? 0 : 0.9; this.sm.connect(this.ctx.destination);
        this.duckG = this.ctx.createGain(); this.musLvl = this.ctx.createGain();
        for (const k of Object.keys(BUS)) { const n = this.ctx.createGain(); n.gain.value = BUS[k]; this.bus[k] = n; }
        this.bus.music.connect(this.duckG).connect(this.musLvl).connect(this.sm);
        this.bus.sfx.connect(this.sm); this.bus.ui.connect(this.sm); this.bus.amb.connect(this.sm);
      } catch { this.ctx = null; }
      this._decode();
    }
    resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); }
    setMuted(m) { this.muted = m; try { localStorage.setItem("pattymelt.muted", m ? "1" : "0"); } catch {}
      if (this.master) this.master.gain.value = m ? 0 : 0.45;
      if (this.sm) this.sm.gain.value = m ? 0 : 0.9; }
    // ---------------- the bank ----------------
    _decode() {
      if (!this.ctx || this._decoding || bankState !== "ok") { if (bankState === "fail") this.failed = true; return; }
      this._decoding = true; const B = g.PM_AUDIO_BANK; this.man = B.manifest;
      const ids = Object.keys(B.data); let left = ids.length, bad = 0;
      ids.forEach((id) => {
        let p; try { p = this.ctx.decodeAudioData(b64buf(B.data[id])); } catch (e) { p = Promise.reject(e); }
        Promise.resolve(p).then((buf) => {
          const m = this.man[id], pad = Math.max(0, buf.duration - m.dur) > 0.005 ? Math.min(buf.duration - m.dur, 1105 / 48000) : 0;
          this.buf[id] = { b: buf, pad };
          if (m.loop) this.loopBuf[id] = this._fold(buf, m.loop.start + pad, m.loop.end + pad, m.loop.xfade);
        }).catch(() => { bad++; }).then(() => { if (--left === 0) { this.loaded = true; this.failed = bad === ids.length; this._kick(); } });
      });
    }
    _fold(buf, ls, le, xf) {   // the loop buffer: [ls, le) with the audio just past le (the real continuation) folded over its head
      const sr = buf.sampleRate, a = Math.round(ls * sr), b = Math.round(le * sr), n = Math.min(Math.round(xf * sr), buf.length - b);
      const out = this.ctx.createBuffer(buf.numberOfChannels, b - a, sr);
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const s = buf.getChannelData(c), d = out.getChannelData(c); d.set(s.subarray(a, b));
        for (let i = 0; i < n; i++) { const t = i / n * Math.PI / 2; d[i] = d[i] * Math.sin(t) + s[b + i] * Math.cos(t); }
      }
      return out;
    }
    has(id) { return !!(this.ctx && this.buf[id]); }
    _note(k, id, x) { if (this.log.length > 4000) this.log.splice(0, 1000); this.log.push(Object.assign({ t: this.ctx ? +this.ctx.currentTime.toFixed(3) : 0, k, id }, x || {})); }
    // ---------------- SFX: voice cap + cooldown ----------------
    play(id, opt = {}) {        // → true played · false dropped (cap/cooldown) · null not loaded (caller falls back)
      if (!this.ctx || this.disabled) return null;
      if (id === "waste") { id = this.wasteAlt++ % 2 ? "waste2" : "waste1"; }
      const P = SFX[id], B = this.buf[id]; if (!P || !B) return null;
      if (this.muted) return false;
      const now = this.ctx.currentTime;
      const act = (this.sfxAct[id] || []).filter((v) => v.end > now); this.sfxAct[id] = act;
      const gl = P.group ? this.groupLast[P.group] : null;
      if (now - (this.sfxLast[id] ?? -9) < P.cd || (gl != null && now - gl < GROUP_CD[P.group]) || act.length >= P.cap) {
        this.drops++; this._note("drop", id); return false; }
      const src = this.ctx.createBufferSource(), gn = this.ctx.createGain();
      src.buffer = B.b; gn.gain.value = P.gain * (opt.gain == null ? 1 : opt.gain);
      src.connect(gn).connect(this.bus[P.bus]); src.start(now, B.pad);
      act.push({ end: now + B.b.duration - B.pad }); this.sfxLast[id] = now; if (P.group) this.groupLast[P.group] = now;
      if (P.duck) this.duck(P.duck, Math.min(0.35, B.b.duration * 0.5));
      this._note("sfx", id); return true;
    }
    duck(to, hold) { if (!this.duckG) return; const t = this.ctx.currentTime, p = this.duckG.gain;
      p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(Math.min(p.value, to), t + 0.04);
      p.setValueAtTime(Math.min(p.value, to), t + 0.04 + hold); p.linearRampToValueAtTime(1, t + 0.04 + hold + 0.5); }
    musicLevel(v, tau = 0.12) { if (this.musLvl && Math.abs((this._ml ?? 1) - v) > 1e-3) { this._ml = v; this.musLvl.gain.setTargetAtTime(v, this.ctx.currentTime, tau); } }
    ui(kind) {                   // menus / select screens — Joe's UI set, else the old synth voices
      const id = { move: "ui_move", select: "ui_select", lock: "ui_lock", back: "ui_back" }[kind] || "ui_move";
      if (this.play(id) !== null) return;
      if (kind === "select") this.bell(2); else if (kind === "lock") this.win(); else if (kind === "back") this.tick(); else this.spatula();
    }
    // ---------------- THE MUSIC ENGINE (one voice; a crossfade is the only time two sound) ----------------
    _gainTo(p, to, t0, dur, curve) {   // equal-power style ramp of an AudioParam from its current value
      const now = this.ctx.currentTime, v = p.value; p.cancelScheduledValues(now); p.setValueAtTime(v, now);
      const st = Math.max(t0, now + 0.005);
      if (dur <= 0.01) { p.setValueAtTime(to, st); return; }
      const n = 48, c = new Float32Array(n), e = EP_IN(n);
      for (let i = 0; i < n; i++) c[i] = to >= v ? v + (to - v) * e[i] : to + (v - to) * e[n - 1 - i];
      p.setValueAtTime(v, st); p.setValueCurveAtTime(c, st + 0.001, dur);
    }
    _phaseOffset(id, t0) {   // where to enter `id` so its bar phase matches the voice playing now (null = from the top)
      const m = this.man[id], cur = this.voices.find((v) => !v.out && v.grid), L = m.loop;
      if (!m.grid || !cur) return null;
      const pos = cur.posAt(t0), beat = m.grid.beat, bar = beat * m.grid.bar_beats;
      const ph = (((pos - cur.grid.downbeat) / bar) % 1 + 1) % 1;            // 0..1 through the bar
      let o = m.grid.downbeat + ph * bar;
      if (L) { while (o < L.start) o += bar; while (o >= L.end) o -= (L.end - L.start); }
      return o;
    }
    _quant(t) {   // the next beat line of the music playing now (≤ one beat away)
      const cur = this.voices.find((v) => !v.out && v.grid && v.started(t)); if (!cur) return t;
      const beat = cur.grid.beat, p = cur.posAt(t), k = Math.ceil((p - cur.grid.downbeat) / beat - 1e-3);
      return t + Math.max(0, cur.grid.downbeat + k * beat - p);
    }
    music(id, o = {}) {          // start `id` (crossfading everything else out); o: xf, xin, quant, phase, at, chain, chainXf
      if (!this.ctx || !this.buf[id]) return null;
      const now = this.ctx.currentTime;
      const live = this.voices.find((v) => v.id === id && !v.out && this._alive(v, now));
      if (live) return live;     // the house rule: the same cue is never stacked on itself
      let t0 = o.at != null ? Math.max(o.at, now + 0.01) : now + 0.02;
      if (o.quant) t0 = this._quant(t0);
      const off = (o.phase ? this._phaseOffset(id, t0) : null) ?? 0;
      const xf = o.xf == null ? XF.out : o.xf;
      for (const v of this.voices) if (this._alive(v, now) && (!v.out || v.outAt > t0)) this._kill(v, t0, xf);   // incl. a chained hand-off still pending
      const v = this._voice(id, t0, off, o.xin == null ? xf : o.xin, o.level == null ? 1 : o.level);
      this._note("mus", id, { at: +t0.toFixed(3), off: +off.toFixed(3) });
      if (o.chain && this.buf[o.chain]) {      // sample-scheduled successor (INTRO → LULL, SYNTH → MAIN)
        const cx = o.chainXf == null ? XF.chain : o.chainXf, tEnd = t0 + (v.dur - off);
        const nx = this._voice(o.chain, tEnd - cx, 0, cx, 1); this._kill(v, tEnd - cx, cx, true); nx.chainedFrom = id;
        this._note("mus", o.chain, { at: +(tEnd - cx).toFixed(3), chained: id });
      }
      return v;
    }
    stopMusic(xf = XF.out) { if (!this.ctx) return; const t = this.ctx.currentTime + 0.01; for (const v of this.voices) if (this._alive(v, t) && (!v.out || v.outAt > t)) this._kill(v, t, xf); }
    _alive(v, now) { return !(v.endAt && v.endAt <= now) && (!v.out || v.outAt + 0.02 > now); }
    _voice(id, t0, off, xin, level) {
      const m = this.man[id], B = this.buf[id], pad = B.pad, gn = this.ctx.createGain(), L = m.loop;
      gn.gain.value = 0; gn.connect(this.bus.music);
      const srcs = [], mk = (buf, loop) => { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = !!loop; s.connect(gn); srcs.push(s); return s; };
      const v = { id, gn, srcs, t0, off, out: false, grid: m.grid || null, dur: B.b.duration - pad, loop: L || null, kind: m.kind, level };
      if (m.kind === "loop") { mk(this.loopBuf[id], true).start(t0, (off % (L.end - L.start))); }
      else if (m.kind === "headloop" && off >= L.start) { mk(this.loopBuf[id], true).start(t0, off - L.start); }
      else if (m.kind === "headloop") { const ll = L.end - off; mk(B.b).start(t0, off + pad, ll); mk(this.loopBuf[id], true).start(t0 + ll, 0); }
      else { const s = mk(B.b); s.start(t0, off + pad); v.endAt = t0 + v.dur - off; }
      v.posAt = (t) => { const e = t - t0 + off; if (!L) return e; if (e < L.end) return e; return L.start + ((e - L.start) % (L.end - L.start)); };
      v.started = (t) => t >= t0;
      this._gainTo(gn.gain, level, t0, Math.max(0.01, xin));
      this.voices.push(v); return v;
    }
    _kill(v, t, xf, later) {   // later: a scheduled hand-off AFTER its fade-in (keep that automation; fade from its level at t)
      v.out = true; v.outAt = t;
      if (later) { const p = v.gn.gain, n = 48, c = new Float32Array(n), e = EP_IN(n);
        for (let i = 0; i < n; i++) c[i] = v.level * e[n - 1 - i];
        p.cancelScheduledValues(t); p.setValueAtTime(v.level, t); p.setValueCurveAtTime(c, t + 0.001, Math.max(0.01, xf)); }
      else this._gainTo(v.gn.gain, 0, t, Math.max(0.01, xf));
      const stopAt = Math.max(this.ctx.currentTime, t) + xf + 0.05;
      for (const s of v.srcs) { try { s.stop(stopAt); } catch (e) {} }
      setTimeout(() => { const i = this.voices.indexOf(v); if (i >= 0) this.voices.splice(i, 1); try { v.gn.disconnect(); } catch (e) {} },
        Math.max(0, (stopAt - this.ctx.currentTime) * 1000) + 200);
    }
    current() { if (!this.ctx) return null; const now = this.ctx.currentTime;
      const v = this.voices.filter((x) => !x.out || x.outAt > now).filter((x) => x.started(now) && !(x.endAt && x.endAt <= now));
      return v.length ? v[v.length - 1].id : null; }
    // ---------------- THE SCORE: what the music does per scene (pages call scene() every frame) ----------------
    //   silent · title · attract · round {pressure 0..1, serial} · bonus · end {serial} · launch
    scene(name, p = {}) {
      this._scened = true; this._want = [name, p];
      if (!this.ctx || !this.loaded || this.failed) return;
      const S = this.sc, now = this.ctx.currentTime, prev = S.name, mus = (id) => this.voices.some((v) => v.id === id && this._alive(v, now));
      S.name = name;
      if (name === "silent" || name === "launch") { if (prev !== name) this.stopMusic(name === "launch" ? XF.launch : XF.out); return; }
      if (name === "title" || name === "attract") {
        if (mus("mus_main") || mus("mus_synth")) return;
        if (prev === "end" && mus("mus_end")) {     // let END finish, then the theme
          const e = this.voices.find((v) => v.id === "mus_end" && this._alive(v, now)); this.music("mus_main", { at: e.endAt - XF.endToTitle, xf: XF.endToTitle }); return; }
        if (name === "title" && prev !== "attract") this.music("mus_synth", { xf: XF.titleIn, xin: 0.01, chain: "mus_main", chainXf: 0.06 });
        else this.music("mus_main", { xf: XF.titleIn });
        return;
      }
      if (name === "round" || name === "bonus") {
        const fresh = p.serial !== undefined && p.serial !== S.serial;
        if (fresh) { S.serial = p.serial; S.intense = false; S.since = now; S.upT = S.downT = 0; S.endDone = null;
          this.music("mus_intro", { xf: XF.toRound, xin: 0.02, chain: "mus_lull" }); return; }
        const inRound = mus("mus_intro") || mus("mus_lull") || mus("mus_intense");
        if (!inRound) { S.intense = false; S.since = now; this.music("mus_lull", { xf: XF.toRound, quant: false }); return; }
        if (name === "bonus") return;
        const pr = +p.pressure || 0, dt = Math.min(0.25, Math.max(0, now - (S.lastT || now))); S.lastT = now;
        if (!S.intense) { S.upT = pr >= PRESS.up ? S.upT + dt : 0;
          if (S.upT >= PRESS.upHold && now - S.since >= PRESS.dwell) {
            S.intense = true; S.since = now; S.upT = 0; this.music("mus_intense", { xf: XF.up, quant: true, phase: true }); } }
        else { S.downT = pr <= PRESS.down ? S.downT + dt : 0;
          if (S.downT >= PRESS.downHold && now - S.since >= PRESS.dwell) {
            S.intense = false; S.since = now; S.downT = 0; this.music("mus_lull", { xf: XF.down, quant: true, phase: true }); } }
        return;
      }
      if (name === "end") {
        const key = p.serial === undefined ? "x" : p.serial;
        if (S.endDone === key) return; S.endDone = key;
        this.music("mus_end", { xf: XF.toEnd, xin: 0.03, quant: true, phase: false });
      }
    }
    _kick() { if (this._want) this.scene(this._want[0], this._want[1]); }
    // ---------------- the grill bed ----------------
    grillBed(active, frac) {
      if (!this.ctx) return false;
      const B = this.loopBuf.grill; if (!B) return false;
      if (!this.grillSrc) { this.grillG = this.ctx.createGain(); this.grillG.gain.value = 0; this.grillG.connect(this.bus.amb);
        this.grillSrc = this.ctx.createBufferSource(); this.grillSrc.buffer = B; this.grillSrc.loop = true; this.grillSrc.connect(this.grillG); this.grillSrc.start(); }
      const v = active ? 0.18 + 0.82 * Math.max(0, Math.min(1, frac)) : 0;
      if (Math.abs((this._gv ?? -1) - v) > 0.01) { this._gv = v; this.grillG.gain.setTargetAtTime(v, this.ctx.currentTime, active ? 0.35 : 0.2); }
      return true;
    }
    debug() {   // QA (tools/audio_gate.mjs): the live music voices + their gain, the SFX in flight
      if (!this.ctx) return null; const now = this.ctx.currentTime, sf = {};
      for (const [k, a] of Object.entries(this.sfxAct)) sf[k] = a.filter((v) => v.end > now).length;
      return { t: now, state: this.ctx.state, ready: this.loaded, failed: this.failed, scene: this.sc.name, intense: this.sc.intense,
        music: this.voices.map((v) => [v.id, +(v.gn.gain.value * (this.duckG ? 1 : 1)).toFixed(4), v.started(now) ? 1 : 0]),
        sfx: sf, grill: this.grillG ? +this.grillG.gain.value.toFixed(3) : null, drops: this.drops };
    }
    // --- synth primitives ---
    _tone(t0, f0, f1, dur, type, peak) {
      const o = this.ctx.createOscillator(), gn = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(gn).connect(this.master); o.start(t0); o.stop(t0 + dur + 0.03);
    }
    _noise(t0, dur, lp, peak) {
      const src = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), gn = this.ctx.createGain();
      src.buffer = this.noiseBuf; f.type = "lowpass"; f.frequency.value = lp;
      gn.gain.setValueAtTime(peak, t0); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f).connect(gn).connect(this.master); src.start(t0); src.stop(t0 + dur + 0.03);
    }
    _arp(notes, step, dur, type, peak) { if (!this.on()) return; const t = this.ctx.currentTime;
      notes.forEach((f, i) => this._tone(t + i * step, f, f, dur, type, peak)); }
    // --- voices (a sample from Joe's set where one exists, else the synth) ---
    spatula() { if (!this.on()) return; const t = this.ctx.currentTime;     // singing two-note ting (FLIP)
      this._tone(t, 720, 1180, 0.10, "triangle", 0.22);
      this._tone(t + 0.06, 1180, 1560, 0.09, "triangle", 0.17);
      this._tone(t, 2200, 2500, 0.05, "square", 0.035); }
    fwump() { if (this.play("cheese") !== null) return; if (!this.on()) return; const t = this.ctx.currentTime;   // cheese
      this._noise(t, 0.13, 850, 0.45); this._tone(t, 190, 95, 0.13, "sine", 0.12); }
    onion() { if (this.play("onion") !== null) return; this.fwump(); }                                          // the melt's onions
    toastpress() { if (!this.on()) return; const t = this.ctx.currentTime;  // a lighter press/scrape (TOAST)
      this._noise(t, 0.14, 1200, 0.22); this._tone(t, 300, 220, 0.10, "triangle", 0.08); }
    holler() { if (!this.on()) return; const t = this.ctx.currentTime;      // "hey!" two-syllable (HEY BILLY)
      this._noise(t, 0.09, 1300, 0.16);
      this._tone(t, 430, 520, 0.10, "square", 0.10); this._tone(t + 0.1, 520, 300, 0.10, "square", 0.085); }
    bell(combo) { if (!this.on()) return; const t = this.ctx.currentTime;   // order-up ding, rises with combo
      const f = 660 + Math.min(combo, 10) * 46;
      this._tone(t, f, f, 0.22, "sine", 0.20); this._tone(t, f * 2.01, f * 2.01, 0.22, "sine", 0.06);
      this._tone(t + 0.015, f * 1.5, f * 2.3, 0.07, "square", 0.05); }
    buzzer() { if (!this.on()) return; const t = this.ctx.currentTime;     // sour fail
      this._tone(t, 210, 120, 0.22, "sawtooth", 0.16); this._noise(t, 0.10, 1400, 0.16); }
    flow() { this._arp([523, 659, 784, 1047], 0.06, 0.12, "triangle", 0.16); }        // BIG GRILL ENERGY
    win() { this._arp([523, 659, 784, 1047, 1319], 0.10, 0.30, "triangle", 0.18); }   // round clear / winner
    over() { this._arp([392, 330, 294, 247], 0.13, 0.34, "sawtooth", 0.16); }         // BILLY'S BREAK
    servicebell() { if (!this.on()) return; const t = this.ctx.currentTime;           // MeltDome bell (round/shift end)
      this._tone(t, 880, 880, 0.5, "sine", 0.22); this._tone(t, 1320, 1320, 0.5, "sine", 0.10);
      this._tone(t + 0.28, 660, 660, 0.4, "sine", 0.14); }
    tick() { if (!this.on()) return; const t = this.ctx.currentTime; this._tone(t, 1500, 1500, 0.03, "square", 0.05); }  // countdown tick
    ready() { if (!this.on()) return; const t = this.ctx.currentTime;       // a patty enters its sweet spot — soft ready blip
      this._tone(t, 1320, 1560, 0.055, "triangle", 0.05); }
    warn() { if (!this.on()) return; const t = this.ctx.currentTime;        // about to BURN — a nagging double tick
      this._tone(t, 560, 470, 0.05, "square", 0.09); this._tone(t + 0.08, 560, 470, 0.05, "square", 0.09); }
    assemble() { if (this.play("bun_plate") !== null) return; if (!this.on()) return; const t = this.ctx.currentTime;   // the bun joins the melt
      this._noise(t, 0.05, 1600, 0.10); this._tone(t, 300, 300, 0.05, "sine", 0.12);
      this._tone(t + 0.05, 540, 660, 0.11, "triangle", 0.15); }
    orderIn() { if (this.play("order_in") === null) this.tick(); }            // a ticket prints
    served() { this.play("served"); }                                       // the plate reaches the customer (no synth twin: the bell covers it)
    billyRun() { this.play("billy_run"); }                                  // Billy sets off with a tray (throttled)
    fire(ev) {
      const music = this._scened && this.loaded && !this.failed;             // the music engine plays END: no arps over it
      switch (ev.t) {
        case "serve": this.bell(ev.combo); break;
        case "flow":  this.flow(); break;
        case "waste": if (this.play("waste") === null) this.buzzer(); break;
        case "sentback":
        case "fail":  this.buzzer(); break;
        case "win":   if (!music) this.win(); break;
        case "over":  if (!music) this.over(); break;
        case "ready": this.ready(); break;
        case "warn":  this.warn(); break;
        case "assemble": this.assemble(); break;
      }
    }
    setBed(active, buried, grill) { if (!this.ctx) return; const t = this.ctx.currentTime;
      const fr = grill == null ? buried : grill;
      const sample = this.grillBed(active, fr);                            // Joe's GRILL loop, level = how full the grill is
      const sz = active && !sample ? 0.035 + buried * 0.05 : 0;
      const cr = active ? 0.02 + buried * 0.10 : 0;
      this.sizzle.gain.setTargetAtTime(sz, t, 0.25);
      this.crowd.gain.setTargetAtTime(cr, t, 0.4); }
  }

  g.PMAudio = { AudioBus, audioSnap, audioEvents, SFX, XF, PRESS, active: null };
})(typeof globalThis !== "undefined" ? globalThis : this);
