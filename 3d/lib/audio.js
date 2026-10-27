// PATTY MELT — shared WebAudio SFX synth (zero-dep).  *** Dedicated to Christine & Phillip Coleman. ***
//
// Extracted from web/cabinet.html so the CANONICAL builds (kitchen.html, meltdome.html) aren't silent.
// One source: the singing-spatula FLIP is the signature voice; order-up bell rises with combo; griddle +
// crowd beds track buried_index. Pure/deterministic-safe — the engine never reads audio; audioEvents is a
// pure per-tick state diff (proven headless). Exposes globalThis.PMAudio = { AudioBus, audioSnap, audioEvents }.
//   NOTE: cabinet.html still carries an INLINE twin of this (its mute-button UI is intertwined) — keep in sync.
(function (g) {
  "use strict";

  function audioSnap(s) {
    return { served: s.served, sent_back: s.sent_back, fails: s.fails, combo: s.combo, won: s.won, over: s.over };
  }
  function audioEvents(prev, s, FLOW) {                 // PURE — a per-tick state diff → sound events
    const ev = [];
    if (!prev) return ev;
    if (s.served < prev.served || s.fails < prev.fails || s.sent_back < prev.sent_back) return ev; // new game/round
    if (s.served > prev.served) ev.push({ t: "serve", combo: s.combo });
    if (s.sent_back > prev.sent_back) ev.push({ t: "sentback" });
    const burntOrLost = (s.fails - prev.fails) - (s.sent_back - prev.sent_back);
    for (let i = 0; i < burntOrLost; i++) ev.push({ t: "fail" });
    if (prev.combo < FLOW && s.combo >= FLOW) ev.push({ t: "flow" });
    if (s.won && !prev.won) ev.push({ t: "win" });
    if (s.over && !prev.over) ev.push({ t: "over" });
    return ev;
  }

  class AudioBus {
    constructor() {
      this.ctx = null; this.master = null; this.sizzle = null; this.crowd = null;
      this.noiseBuf = null; this.muted = false;
      try { this.muted = localStorage.getItem("pattymelt.muted") === "1"; } catch {}
    }
    on() { return this.ctx && !this.muted; }
    ensure() {                                          // lazy — must follow a user gesture (or autoplay-allowed)
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
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
        this.sizzle = bed(2000);   // griddle hiss
        this.crowd = bed(360);     // diner murmur
      } catch { this.ctx = null; }
    }
    resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); }
    setMuted(m) { this.muted = m; try { localStorage.setItem("pattymelt.muted", m ? "1" : "0"); } catch {}
      if (this.master) this.master.gain.value = m ? 0 : 0.45; }
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
    // --- voices ---
    spatula() { if (!this.on()) return; const t = this.ctx.currentTime;     // singing two-note ting (FLIP)
      this._tone(t, 720, 1180, 0.10, "triangle", 0.22);
      this._tone(t + 0.06, 1180, 1560, 0.09, "triangle", 0.17);
      this._tone(t, 2200, 2500, 0.05, "square", 0.035); }
    fwump() { if (!this.on()) return; const t = this.ctx.currentTime;       // cheese plop
      this._noise(t, 0.13, 850, 0.45); this._tone(t, 190, 95, 0.13, "sine", 0.12); }
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
    // --- FEEDBACK SEAMS (the RDY window / near-burn / bun-join). Placeholder synth today — SWAP the bodies
    //     for Joe's real cue-samples when the shift themes are cut; the call sites stay the same. ---
    ready() { if (!this.on()) return; const t = this.ctx.currentTime;       // a patty enters its sweet spot — soft ready blip
      this._tone(t, 1320, 1560, 0.055, "triangle", 0.05); }
    warn() { if (!this.on()) return; const t = this.ctx.currentTime;        // about to BURN — a nagging double tick
      this._tone(t, 560, 470, 0.05, "square", 0.09); this._tone(t + 0.08, 560, 470, 0.05, "square", 0.09); }
    assemble() { if (!this.on()) return; const t = this.ctx.currentTime;    // the bun joins the melt — a satisfying snap-up (THE dance)
      this._noise(t, 0.05, 1600, 0.10); this._tone(t, 300, 300, 0.05, "sine", 0.12);
      this._tone(t + 0.05, 540, 660, 0.11, "triangle", 0.15); }
    fire(ev) {
      switch (ev.t) {
        case "serve": this.bell(ev.combo); break;
        case "flow":  this.flow(); break;
        case "sentback":
        case "fail":  this.buzzer(); break;
        case "win":   this.win(); break;
        case "over":  this.over(); break;
        case "ready": this.ready(); break;
        case "warn":  this.warn(); break;
        case "assemble": this.assemble(); break;
      }
    }
    setBed(active, buried) { if (!this.ctx) return; const t = this.ctx.currentTime;
      const sz = active ? 0.035 + buried * 0.05 : 0;
      const cr = active ? 0.02 + buried * 0.10 : 0;
      this.sizzle.gain.setTargetAtTime(sz, t, 0.25);
      this.crowd.gain.setTargetAtTime(cr, t, 0.4); }
  }

  g.PMAudio = { AudioBus, audioSnap, audioEvents };
})(typeof globalThis !== "undefined" ? globalThis : this);
