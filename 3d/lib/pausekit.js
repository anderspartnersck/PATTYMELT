// PATTY MELT — PMPause: ONE pause sheet for the side pages (MELTDOME SIDE BY SIDE, TAG TEAM, SPEED BATTLE).
// kitchen.html keeps its own (bigger) pause menu; this is the same look + vocabulary for the pages that had none
// (1116: "pause menu everywhere"). Render-only + input-only: it never touches the engine. While it is open the page
// must not step its sim (check pz.open in the page's step()).
//
//   const pz = PMPause.create({ title, items: [[id, label], ...], controls: [[what, p1keys, p2keys?], ...], onPick(id) });
//   keydown:  if (pz.key(k)) { e.preventDefault(); return; }      // P / Esc open it; ▲▼ pick; SPACE/ENTER/F choose
//   render:   pz.draw(ctx, W, H)                                   // last, over everything
//   pz.open / pz.toggle(true|false)
(function (root) {
  "use strict";
  const FONT = '"Saira Condensed","Arial Narrow",sans-serif';
  function T(ctx, s, x, y, sz, c, al = "center", w = 800) {
    ctx.font = w + " " + sz + "px " + FONT; ctx.textAlign = al; ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round"; ctx.lineWidth = Math.max(2, sz / 7); ctx.strokeStyle = "#0a0604"; ctx.strokeText(s, x, y);
    ctx.fillStyle = c; ctx.fillText(s, x, y);
  }
  function create(o = {}) {
    const st = { open: false, sel: 0, view: "menu", t: 0 };
    const items = () => (typeof o.items === "function" ? o.items() : o.items) || [["resume", "RESUME"]];
    const api = {
      get open() { return st.open; },
      toggle(v) { st.open = v == null ? !st.open : !!v; st.sel = 0; st.view = "menu"; st.t = performance.now(); if (o.onToggle) o.onToggle(st.open); },
      // returns true when the key was the pause sheet's (the page should then ignore it)
      key(k) {
        if (!st.open) { if (k === "p" || k === "escape") { api.toggle(true); return true; } return false; }
        if (st.view === "controls") { st.view = "menu"; return true; }
        const it = items();
        if (k === "escape" || k === "p") { api.toggle(false); return true; }
        if (k === "arrowup" || k === "w") { st.sel = (st.sel + it.length - 1) % it.length; return true; }
        if (k === "arrowdown" || k === "s") { st.sel = (st.sel + 1) % it.length; return true; }
        if (k === "enter" || k === " " || k === "f") {
          const id = it[st.sel][0];
          if (id === "resume") api.toggle(false);
          else if (id === "controls") st.view = "controls";
          else { api.toggle(false); if (o.onPick) o.onPick(id); }
        }
        return true;                                        // everything else is swallowed while paused
      },
      draw(ctx, W, H) {
        if (!st.open) return;
        ctx.save();
        ctx.fillStyle = "rgba(8,4,3,.88)"; ctx.fillRect(0, 0, W, H);
        const cx = W / 2, k = Math.min(1, (performance.now() - st.t) / 160);
        ctx.globalAlpha = k;
        if (st.view === "controls") {
          T(ctx, "CONTROLS", cx, H * 0.17, 34, "#ffd23f");
          const rows = o.controls || [], two = rows.some((r) => r[2]);
          const y0 = H * 0.17 + 40, lh = Math.min(30, (H * 0.66) / Math.max(1, rows.length + 1));
          if (two) { T(ctx, "PATTY", cx + 40, y0, 15, "#ff5a4d", "left"); T(ctx, "CHRISSY", cx + 210, y0, 15, "#6fb0e0", "left"); }
          rows.forEach((r, i) => { const y = y0 + (i + 1) * lh;
            T(ctx, r[0], cx + 20, y, 16, "#f3e6c8", "right", 700);
            T(ctx, r[1], cx + 40, y, 16, "#ffd23f", "left", 800);
            if (r[2]) T(ctx, r[2], cx + 210, y, 16, "#9fd0f0", "left", 800); });
          T(ctx, "any key — back", cx, H * 0.92, 14, "#a89a80", "center", 700);
        } else {
          T(ctx, o.title || "PAUSED", cx, H * 0.24, 40, "#ffd23f");
          const it = items(), y0 = H * 0.24 + 56, lh = Math.min(46, (H * 0.6) / it.length);
          it.forEach(([id, label], i) => { const on = i === st.sel, y = y0 + i * lh;
            if (on) { ctx.fillStyle = "rgba(255,210,63,.16)"; ctx.fillRect(cx - 190, y - lh * 0.62, 380, lh * 0.82); }
            T(ctx, (on ? "▶ " : "") + label + (on ? " ◀" : ""), cx, y, on ? 26 : 22, on ? "#fff" : "#f3e6c8"); });
          T(ctx, "▲▼ pick  ·  SPACE / ENTER choose  ·  P / ESC resume", cx, H * 0.92, 14, "#a89a80", "center", 700);
        }
        ctx.restore();
      },
    };
    return api;
  }
  const API = { create };
  root.PMPause = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
