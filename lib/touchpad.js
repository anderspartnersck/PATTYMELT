// PATTY MELT — PHONE PAD (X7, 1119). The touch front-end for the 3D kitchen, the side modes and the front door.
// A FRONT-END LAYER ONLY: every button speaks a KEY the page already handles (the same keydown a keyboard sends), so the
// engine, the sim and parity never see the difference, and the desktop (keyboard + mouse + pads) is unchanged — none of
// this runs unless the pad is on. House scheme from HIGH TABLE (one-thumb column + HAND flop) and SUCK UP (1014 pad).
//
//   ON:  a coarse pointer (phone / tablet), or ?touch=1.  OFF: ?touch=0.  Never inside an iframe (the front door's demo).
//   LANDSCAPE 1P  the game fits the middle; the frame columns hold the pad — ◄ ► on one thumb, FLIP · TOPPING · BREAD ·
//                 HEY BILLY on the other. ⇄ (or ?hand=right) flops the sides; remembered on this device.
//   PORTRAIT  1P  the game on top, the pad underneath (◄ ► left, the four cook buttons right).
//   2 COOKS       one phone, two people: landscape = P1 column left, P2 column right; portrait = P1 at the bottom and P2
//                 at the top, turned to face across the table.
//   MENUS         while a menu / pause / initials card is up the pad turns into ▲ ▼ ◄ ► OK BACK. Tap the game = ENTER.
//   Safe-area insets (notch, home bar) pad every edge.
//
//   PMTouch.on                          — is the pad on (read it before choosing a layout)
//   PMTouch.init({ pads, ctx, fit })    — pads: [{ left,right,flip,top,toast?,billy,tag? } keys] (1 or 2);
//                                         ctx(): "play" | "menu" | "none";  fit: "frame" (default) | fn(area) for custom pages
//   PMTouch.area()                      — the free rect {x,y,w,h} the game may use (CSS px)
(function (root) {
  "use strict";
  const Q = new URLSearchParams(root.location ? location.search : "");
  const inFrame = (() => { try { return root.top !== root; } catch (e) { return true; } })();
  const forced = Q.get("touch");
  const coarse = !!(root.matchMedia && matchMedia("(pointer: coarse)").matches);
  const ON = !inFrame && Q.get("shell") !== "demo" && (forced === "1" || (forced !== "0" && coarse));
  const API = { on: ON, init() {}, area: () => ({ x: 0, y: 0, w: innerWidth, h: innerHeight }), state: () => ({ on: false }) };
  root.PMTouch = API;
  if (!ON) return;

  const HKEY = "pmPadHand";
  let hand = Q.get("hand") || (() => { try { return localStorage.getItem(HKEY) || "left"; } catch (e) { return "left"; } })();
  let cfg = { pads: [], ctx: () => "play", fit: "frame" }, el = null, A = { x: 0, y: 0, w: 0, h: 0 }, lastCtx = "", lastSig = "";

  const css = document.createElement("style");
  css.textContent = `
  body.pmtouch{touch-action:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;
    --sal:env(safe-area-inset-left,0px);--sar:env(safe-area-inset-right,0px);--sat:env(safe-area-inset-top,0px);--sab:env(safe-area-inset-bottom,0px)}
  body.pmtouch #tag,body.pmtouch #pmRailTab,body.pmtouch .pm-service{display:none!important}
  body.pmtouch #wrap,body.pmtouch #screenwrap{border-width:4px!important;box-shadow:0 0 0 2px #0a0504,0 8px 30px #000!important;max-width:none!important}
  #pmPad{position:fixed;inset:0;pointer-events:none;z-index:80;font-family:"Saira Condensed","Arial Narrow",sans-serif}
  #pmPad .zone{position:absolute;display:grid;gap:8px;pointer-events:none;box-sizing:border-box;padding:8px}
  #pmPad .zone.flip180{transform:rotate(180deg)}
  #pmPad button{pointer-events:auto;touch-action:none;border:0;border-radius:16px;margin:0;padding:0 4px;min-width:0;min-height:0;
    font:800 15px/1.05 "Saira Condensed","Arial Narrow",sans-serif;letter-spacing:.06em;color:#fff3d5;
    background:linear-gradient(180deg,rgba(181,53,43,.92),rgba(122,31,24,.92));box-shadow:0 3px 0 #3a0c08,inset 0 1px 0 rgba(255,255,255,.25);
    display:flex;flex-direction:column;align-items:center;justify-content:center;text-shadow:0 1px 0 #000}
  #pmPad button small{font-size:10px;font-weight:700;opacity:.8;letter-spacing:.08em}
  #pmPad button.dir{font-size:30px;background:linear-gradient(180deg,rgba(60,32,24,.92),rgba(30,14,10,.92));box-shadow:0 3px 0 #000,inset 0 1px 0 rgba(255,255,255,.16)}
  #pmPad button.billy{font-size:19px;background:linear-gradient(180deg,#ffd23f,#e0a32a);color:#2a1206;text-shadow:none;box-shadow:0 3px 0 #7a4a08}
  #pmPad button.billy small{color:#5a2a08}
  #pmPad button.ok{background:linear-gradient(180deg,#ffd23f,#e0a32a);color:#2a1206;text-shadow:none;font-size:19px}
  #pmPad button.on,#pmPad button:active{transform:translateY(2px);filter:brightness(1.25);box-shadow:0 1px 0 #000}
  #pmPad .p2 button{background:linear-gradient(180deg,rgba(47,95,160,.92),rgba(24,52,96,.92));box-shadow:0 3px 0 #0b1830}
  #pmPad .p2 button.dir{background:linear-gradient(180deg,rgba(30,40,60,.92),rgba(12,18,30,.92))}
  #pmPad .p2 button.billy{background:linear-gradient(180deg,#9fd0ff,#6fb0e0);color:#0b1830}
  #pmPad .chips{position:absolute;display:flex;gap:6px;pointer-events:none}
  #pmPad .chips button{width:44px;height:44px;border-radius:50%;font-size:17px;background:rgba(20,10,8,.78);box-shadow:0 0 0 2px rgba(255,210,63,.55)}
  #pmPad .lbl{position:absolute;font:800 10px "Saira Condensed",sans-serif;letter-spacing:.16em;color:rgba(255,243,213,.6);pointer-events:none}
  `;
  document.head.appendChild(css);
  { const m = document.querySelector("meta[name=viewport]"); if (m && !/viewport-fit/.test(m.content)) m.content += ", viewport-fit=cover"; }

  // ---- keys: the pad says exactly what a keyboard would ----
  const send = (key, type = "keydown") => {
    const ev = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
    (document.activeElement && document.activeElement !== document.body ? document.activeElement : root).dispatchEvent(ev);
  };
  const REPEAT = { first: 260, every: 115 };
  function bindBtn(b, key, repeat) {
    let t = 0, id = null;
    const down = (e) => { e.preventDefault(); if (id !== null) return; id = e.pointerId; b.classList.add("on");
      try { b.setPointerCapture(e.pointerId); } catch (x) {}
      send(key); if (repeat) { const rep = () => { send(key); t = setTimeout(rep, REPEAT.every); }; t = setTimeout(rep, REPEAT.first); } };
    const up = (e) => { if (e.pointerId !== id) return; id = null; clearTimeout(t); b.classList.remove("on"); send(key, "keyup"); };
    b.addEventListener("pointerdown", down); b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
    b.addEventListener("lostpointercapture", up); b.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  const mk = (cls, html, key, repeat) => { const b = document.createElement("button"); b.className = cls; b.innerHTML = html; b.type = "button"; if (key) bindBtn(b, key, repeat); return b; };

  // safe-area insets as px (env() is CSS-only)
  function insets() {
    const p = document.createElement("div");
    p.style.cssText = "position:fixed;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
    document.body.appendChild(p); const s = getComputedStyle(p);
    const r = { t: parseFloat(s.paddingTop) || 0, r: parseFloat(s.paddingRight) || 0, b: parseFloat(s.paddingBottom) || 0, l: parseFloat(s.paddingLeft) || 0 };
    p.remove(); return r;
  }
  const place = (z, x, y, w, h) => Object.assign(z.style, { left: x + "px", top: y + "px", width: w + "px", height: h + "px" });

  // the pad set for one cook: ◄ ► + the cook buttons it has keys for
  function cookButtons(k, p2) {
    const pre = p2 ? "" : "";
    const acts = [["flip", "FLIP"], ["top", "TOPPING"], ["toast", "BREAD"], ["tag", "TAG"]].filter(([id]) => k[id])
      .map(([id, l]) => mk("", pre + l + (id === "toast" ? "<small>GRAB · TOAST</small>" : id === "tag" ? "<small>PASS THE SPATULA</small>" : ""), k[id]));
    return { L: mk("dir", "◄", k.left, true), R: mk("dir", "►", k.right, true), acts, billy: mk("billy", "HEY BILLY!<small>EXPO</small>", k.billy) };
  }
  function menuButtons() {
    return { up: mk("dir", "▲", "ArrowUp", true), down: mk("dir", "▼", "ArrowDown", true), L: mk("dir", "◄", "ArrowLeft", true), R: mk("dir", "►", "ArrowRight", true),
      ok: mk("ok", "OK", "Enter"), back: mk("", "BACK", "Escape") };
  }

  function layout() {
    if (!el) return;
    const W = innerWidth, H = innerHeight, ins = insets(), por = H > W;
    const pads = typeof cfg.pads === "function" ? cfg.pads() : cfg.pads, ctx = cfg.ctx() || "play", two = pads.length > 1 && ctx === "play";
    const sig = [W, H, ctx, two, hand, pads.length].join("|");
    if (sig === lastSig) return; lastSig = sig; lastCtx = ctx;
    el.innerHTML = "";
    const zone = (cls) => { const z = document.createElement("div"); z.className = "zone " + (cls || ""); el.appendChild(z); return z; };
    let free, chipsAt = null;
    if (ctx === "none") { free = { x: ins.l, y: ins.t, w: W - ins.l - ins.r, h: H - ins.t - ins.b }; }
    else if (!por) {                                   // ---- LANDSCAPE: frame columns either side of the game ----
      const col = Math.round(Math.min(Math.max(150, W * 0.2), 230));
      free = { x: ins.l + col, y: ins.t, w: W - ins.l - ins.r - 2 * col, h: H - ins.t - ins.b };
      const zl = zone(), zr = zone(two ? "p2" : "");
      place(zl, ins.l, ins.t, col, H - ins.t - ins.b); place(zr, W - ins.r - col, ins.t, col, H - ins.t - ins.b);
      if (ctx === "menu") { const m = menuButtons();
        zl.style.gridTemplate = "1fr 1fr 1fr / 1fr 1fr"; zl.append(m.up, m.down, m.L, m.R); m.up.style.gridColumn = m.down.style.gridColumn = "span 2";
        zr.style.gridTemplate = "2fr 1fr / 1fr"; zr.append(m.ok, m.back); }
      else if (two) { [zl, zr].forEach((z, i) => { const c = cookButtons(pads[i]);
        z.style.gridTemplateColumns = "1fr 1fr"; z.style.gridAutoRows = "1fr"; z.append(c.L, c.R, ...c.acts, c.billy);
        if (c.acts.length % 2) c.billy.style.gridColumn = "auto"; else c.billy.style.gridColumn = "span 2"; });
         }
      else { const c = cookButtons(pads[0]), mv = hand === "right" ? zr : zl, ac = hand === "right" ? zl : zr;
        mv.style.gridTemplate = "1fr 1fr / 1fr"; mv.append(c.L, c.R);
        ac.style.gridTemplateColumns = "1fr 1fr"; ac.style.gridAutoRows = "1fr"; ac.append(...c.acts, c.billy); c.billy.style.gridColumn = "span 2";
        if (c.acts.length % 2) c.acts[c.acts.length - 1].style.gridColumn = "span 2";
        mv.style.top = (ins.t + 56) + "px"; mv.style.height = (H - ins.t - ins.b - 56) + "px"; chipsAt = { x: parseFloat(mv.style.left) + 8, y: ins.t + 6 };
        c.L.style.fontSize = c.R.style.fontSize = "40px"; }
    } else {                                           // ---- PORTRAIT: game on top, pad underneath (P2 on top, turned) ----
      const padH = Math.round(Math.min(Math.max(190, H * 0.3), 300));
      const top = two ? padH : 0;
      const chipRow = two || ctx === "none" ? 0 : 56;
      free = { x: ins.l, y: ins.t + top + chipRow, w: W - ins.l - ins.r, h: H - ins.t - ins.b - padH - top - chipRow };
      const zb = zone(); place(zb, ins.l, H - ins.b - padH, W - ins.l - ins.r, padH);
      if (ctx === "menu") { const m = menuButtons(); zb.style.gridTemplate = "1fr 1fr / 1fr 1fr 1fr 1.4fr";
        const at = (e, a) => { e.style.gridArea = a; zb.append(e); };
        at(m.up, "1 / 2 / 2 / 3"); at(m.down, "2 / 2 / 3 / 3"); at(m.L, "1 / 1 / 3 / 2"); at(m.R, "1 / 3 / 3 / 4"); at(m.ok, "1 / 4 / 2 / 5"); at(m.back, "2 / 4 / 3 / 5"); }
      else {
        const fill = (z, k) => { const c = cookButtons(k); const n = c.acts.length;
          const na = Math.max(2, n), mvc = "minmax(68px,1fr) minmax(68px,1fr)", acc = Array(na).fill("minmax(0,1.15fr)").join(" ");
          z.style.gridTemplateColumns = hand === "right" ? acc + " " + mvc : mvc + " " + acc; z.style.gridTemplateRows = "1fr 1fr";
          const mvL = hand === "right" ? na + 1 : 1;
          c.L.style.gridArea = `1 / ${mvL} / 3 / ${mvL + 1}`; c.R.style.gridArea = `1 / ${mvL + 1} / 3 / ${mvL + 2}`;
          const a0 = hand === "right" ? 1 : 3;
          c.acts.forEach((b, i) => { b.style.gridArea = `1 / ${a0 + i} / 2 / ${a0 + i + 1}`; });
          c.billy.style.gridArea = `2 / ${a0} / 3 / ${a0 + Math.max(2, n)}`;
          z.append(c.L, c.R, ...c.acts, c.billy); };
        fill(zb, pads[0]);
        if (two) { const zt = zone("p2 flip180"); place(zt, ins.l, ins.t, W - ins.l - ins.r, padH); fill(zt, pads[1]); }
      }
    }
    // the corner chips: PAUSE · SOUND · ⇄ HAND (1P play only)
    const chips = document.createElement("div"); chips.className = "chips"; el.appendChild(chips);
    if (cfg.pause !== false && ctx !== "none") chips.append(mk("", "II", "p"));
    if (cfg.mute !== false) chips.append(mk("", "♪", "s"));
    if (ctx === "play" && pads.length === 1) { const f = mk("", "⇄"); f.title = "flop the pad"; f.addEventListener("pointerdown", (e) => { e.preventDefault();
      hand = hand === "right" ? "left" : "right"; try { localStorage.setItem(HKEY, hand); } catch (x) {} lastSig = ""; layout(); }); chips.append(f); }
    Object.assign(chips.style, chipsAt ? { left: chipsAt.x + "px", top: chipsAt.y + "px" } : por ? { right: (ins.r + 8) + "px", top: (ins.t + 6) + "px" } : { left: (free.x + 6) + "px", top: (ins.t + 6) + "px" });
    chips.style.flexDirection = (por || chipsAt) ? "row" : "column";
    A = free; fitGame();
  }
  function fitGame() {
    if (typeof cfg.fit === "function") return cfg.fit(A);
    const fr = document.getElementById("frame"), wr = document.getElementById("wrap") || document.getElementById("screenwrap"), cv = document.getElementById("screen");
    if (!fr || !wr || !cv) return;
    const set = (e, k, v) => e.style.setProperty(k, v, "important");
    set(fr, "position", "fixed"); set(fr, "right", "auto"); set(fr, "bottom", "auto"); set(fr, "left", A.x + "px"); set(fr, "top", A.y + "px"); set(fr, "width", A.w + "px"); set(fr, "height", A.h + "px");
    const asp = cv.width / cv.height || 16 / 9, b = 8 + 4;   // 4px border each side + a few px of gingham
    const w = Math.max(80, Math.min(A.w - b, (A.h - b) * asp));
    set(wr, "width", Math.floor(w) + "px");
  }

  API.area = () => A;
  API.state = () => ({ on: true, ctx: lastCtx, hand, area: A, buttons: el ? [...el.querySelectorAll("button")].map((b) => b.textContent) : [] });
  API.init = (c) => {
    cfg = Object.assign(cfg, c || {});
    document.body.classList.add("pmtouch");
    el = document.createElement("div"); el.id = "pmPad"; document.body.appendChild(el);
    lastSig = ""; layout();
    addEventListener("resize", () => { lastSig = ""; layout(); });
    setInterval(layout, 200);                         // the context (play / menu) follows the page's state
    // tap the game = ENTER (start, skip a cut-in, next shift, results) — unless the page handles taps itself
    if (cfg.tapEnter !== false) { const cv = document.getElementById("screen") || document.querySelector("canvas");
      if (cv) cv.addEventListener("pointerdown", (e) => { e.preventDefault(); send("Enter"); }); }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
