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
  /* (1119) THE CAB DECK — Joe 1119: "back to the more arcade cab menu style for all selectables". Every pad control is a
     cell of Patty's own control panel (assets/cab/PANEL FINAL 1 up DINER.png · panel-2up-heroes.png): a dark star-field
     deck (HEROES: navy + blue gingham) in a neon double pinstripe with corner rivets, the panel's DOMED buttons cut from it
     (tools/cut_pad_art.py → assets/pad/), its gold block arrows, and the label in the panel's gold condensed caps under the
     button. Pressed = the lit ON layer (bloom). Hit areas are the whole cell, as before. */
  #pmPad{--deck:#0d0907;--rim1:#c8302a;--rim2:#f0a020;--ink:#f6c040;--plate:#120b08;--rivet:#a88a58}
  #pmPad.heroes{--deck:#0c1a3a;--rim1:#e8d9b4;--rim2:#d9a521;--ink:#f2c230;--plate:#0b1830;--rivet:#d8c9a0}
  #pmPad button{pointer-events:auto;touch-action:none;border:0;margin:0;padding:4px 2px;min-width:0;min-height:0;position:relative;
    border-radius:6px;font:800 15px/1 "Saira Condensed","Arial Narrow",sans-serif;letter-spacing:.07em;color:var(--ink);
    background:
      radial-gradient(circle at 7px 7px,var(--rivet) 0 2px,transparent 2.6px),radial-gradient(circle at calc(100% - 7px) 7px,var(--rivet) 0 2px,transparent 2.6px),
      radial-gradient(circle at 7px calc(100% - 7px),var(--rivet) 0 2px,transparent 2.6px),radial-gradient(circle at calc(100% - 7px) calc(100% - 7px),var(--rivet) 0 2px,transparent 2.6px),
      radial-gradient(ellipse at 50% 45%,rgba(255,255,255,.05),transparent 70%),
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Cg fill='%23d9a521' fill-opacity='.55'%3E%3Cpath d='M9 6l1.2 2.6 2.8.3-2.1 1.9.6 2.8L9 12.2 6.5 13.6l.6-2.8L5 8.9l2.8-.3z'/%3E%3Cpath d='M44 30l.8 1.8 2 .2-1.5 1.3.4 2L44 34.3l-1.7 1 .4-2-1.5-1.3 2-.2z'/%3E%3Cpath d='M22 48l.6 1.3 1.4.2-1 .9.3 1.4-1.3-.7-1.3.7.3-1.4-1-.9 1.4-.2z'/%3E%3C/g%3E%3C/svg%3E"),
      var(--deck);
    box-shadow:inset 0 0 0 2px var(--rim1),inset 0 0 0 4px #000,inset 0 0 0 5px var(--rim2),inset 0 0 22px 6px rgba(0,0,0,.85),0 2px 0 #000;
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;text-shadow:0 2px 0 #000,0 0 6px #000;container-type:inline-size}
  #pmPad.heroes button{background:
      radial-gradient(circle at 7px 7px,var(--rivet) 0 2px,transparent 2.6px),radial-gradient(circle at calc(100% - 7px) 7px,var(--rivet) 0 2px,transparent 2.6px),
      radial-gradient(circle at 7px calc(100% - 7px),var(--rivet) 0 2px,transparent 2.6px),radial-gradient(circle at calc(100% - 7px) calc(100% - 7px),var(--rivet) 0 2px,transparent 2.6px),
      radial-gradient(ellipse at 50% 50%,rgba(12,26,58,.15),rgba(12,26,58,.75) 90%),
      repeating-linear-gradient(0deg,rgba(28,62,128,.55) 0 9px,transparent 9px 18px),repeating-linear-gradient(90deg,rgba(28,62,128,.55) 0 9px,transparent 9px 18px),#c9c2ad}
  #pmPad button .cap{display:block;width:min(78%,calc(100% - 10px));flex:1 1 auto;max-height:64%;min-height:24px;
    background:center/contain no-repeat;filter:drop-shadow(0 4px 3px rgba(0,0,0,.7))}
  #pmPad button .t{display:block;padding:2px 7px 1px;background:var(--plate);border-radius:3px;box-shadow:0 0 0 1px var(--rim2),0 1px 0 #000;white-space:nowrap;font-size:clamp(7px,13cqw,17px);max-width:calc(100% - 8px);box-sizing:border-box;padding-inline:clamp(2px,5cqw,7px)}   /* (1121) TOPPING spilled a 50px portrait cell */
  #pmPad button small{display:block;font-size:clamp(6px,7.5cqw,10px);font-weight:700;letter-spacing:.1em;color:#f3e6c8;opacity:.75;white-space:normal;line-height:1.05}   /* (1121) PASS THE SPATULA ran off a portrait cell */
  #pmPad .flip .cap{background-image:url(../assets/pad/btn-orange.png)}
  #pmPad .top .cap{background-image:url(../assets/pad/btn-yellow.png)}
  #pmPad .toast .cap{background-image:url(../assets/pad/btn-orange.png);filter:sepia(.55) hue-rotate(-12deg) saturate(.8) brightness(.78) drop-shadow(0 4px 3px rgba(0,0,0,.7))}
  #pmPad .tag .cap,#pmPad .billy .cap{background-image:url(../assets/pad/btn-cream.png)}
  #pmPad .ok .cap{background-image:url(../assets/pad/btn-yellow.png)}
  #pmPad .back .cap{background-image:url(../assets/pad/btn-orange.png);filter:hue-rotate(-28deg) saturate(1.25) brightness(.85) drop-shadow(0 4px 3px rgba(0,0,0,.7))}
  #pmPad .billy .t{font-size:clamp(9px,10cqw,20px);color:#fff1d6}   /* (1121) the 12px floor spilled HEY BILLY! out of a one-column cell */
  #pmPad .ok .t{font-size:clamp(12px,14cqw,20px)}
  #pmPad button.dir .cap{width:min(90%,120px);max-height:60%;background-image:url(../assets/pad/arrow-r.png)}
  #pmPad button.dir.l .cap{background-image:url(../assets/pad/arrow-l.png)}
  #pmPad button.dir.u .cap{transform:rotate(-90deg)}
  #pmPad button.dir.d .cap{transform:rotate(90deg)}
  #pmPad button.dir.u .cap,#pmPad button.dir.d .cap{max-height:none;width:min(52%,64px);height:min(84%,110px)}
  #pmPad button.on,#pmPad button:active{transform:translateY(1px)}
  #pmPad button.on .cap,#pmPad button:active .cap{filter:brightness(1.35) saturate(1.15) drop-shadow(0 0 10px rgba(255,214,120,.95)) drop-shadow(0 2px 2px rgba(0,0,0,.7));transform-origin:50% 60%;scale:.96}
  #pmPad .p2{--rim1:#6fb0e0;--rivet:#9fd0ff}
  #pmPad .p2 .billy .cap{filter:hue-rotate(180deg) saturate(.6) drop-shadow(0 4px 3px rgba(0,0,0,.7))}
  #pmPad .chips{position:absolute;display:flex;gap:6px;pointer-events:none}
  #pmPad .chips button{width:46px;height:46px;border-radius:50%;padding:0;font-size:16px;color:#fff1d6;
    background:radial-gradient(circle at 38% 32%,#ff8a70,#c8302a 45%,#6a120c 78%,#1a0504 100%);
    box-shadow:0 0 0 3px #111,0 0 0 5px var(--rim2),0 3px 0 4px #000;text-shadow:0 1px 0 #3a0c08}
  #pmPad.heroes .chips button{background:radial-gradient(circle at 38% 32%,#8fb6ff,#1f3a63 50%,#0b1830 85%)}
  #pmPad .chips button.on,#pmPad .chips button:active{filter:brightness(1.3)}
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
  // a deck cell: the domed button (or arrow) + its label plate; aria-label keeps the plain name (and PMTouch.state's text)
  const cell = (cls, label, sub, key, repeat) => { const b = mk(cls, '<i class="cap"></i>' + (label ? '<span class="t">' + label + (sub ? "<small>" + sub + "</small>" : "") + "</span>" : ""), key, repeat);
    b.setAttribute("aria-label", label || cls); return b; };
  const arrow = (d, key) => { const b = cell("dir " + d, "", "", key, true); b.setAttribute("aria-label", { l: "◄", r: "►", u: "▲", d: "▼" }[d]); return b; };

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
      .map(([id, l]) => cell(id, pre + l, id === "toast" ? "GRAB · TOAST" : id === "tag" ? "PASS THE SPATULA" : "", k[id]));
    return { L: arrow("l", k.left), R: arrow("r", k.right), acts, billy: cell("billy", "HEY BILLY!", "", k.billy) };
  }
  function menuButtons() {
    return { up: arrow("u", "ArrowUp"), down: arrow("d", "ArrowDown"), L: arrow("l", "ArrowLeft"), R: arrow("r", "ArrowRight"),
      ok: cell("ok", "OK", "", "Enter"), back: cell("back", "BACK", "", "Escape") };
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
      else { const c = cookButtons(pads[0]), mv = hand === "right" ? zr : zl, ac = hand === "right" ? zl : zr;   // (chips → the top of the ◄ ► column)
        mv.style.gridTemplate = "1fr 1fr / 1fr"; mv.append(c.L, c.R);
        ac.style.gridTemplateColumns = "1fr 1fr"; ac.style.gridAutoRows = "1fr"; ac.append(...c.acts, c.billy); c.billy.style.gridColumn = "span 2";
        if (c.acts.length % 2) c.acts[c.acts.length - 1].style.gridColumn = "span 2";
        mv.style.top = (ins.t + 56) + "px"; mv.style.height = (H - ins.t - ins.b - 56) + "px"; chipsAt = { x: parseFloat(mv.style.left) + 8, y: ins.t + 6 };
      }
      // (1121 UI audit) every other landscape context (menus, two cooks): the corner chips sat INSIDE the game, on its title /
      // HUD (II over THE KITCHEN, ♪ over SPEED BATTLE). They take the top of the left column instead, like the 1P layout.
      if (!chipsAt) { zl.style.top = (ins.t + 56) + "px"; zl.style.height = (H - ins.t - ins.b - 56) + "px"; chipsAt = { x: ins.l + 8, y: ins.t + 6 }; }
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
  API.state = () => ({ on: true, ctx: lastCtx, hand, area: A, buttons: el ? [...el.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") || b.textContent) : [] });
  API.init = (c) => {
    cfg = Object.assign(cfg, c || {});
    document.body.classList.add("pmtouch");
    el = document.createElement("div"); el.id = "pmPad"; document.body.appendChild(el);
    // the deck follows the edition: HEROES = the navy/gingham 2UP HEROES panel, else the DINER 1UP panel (pages may pass skin)
    const sk = (cfg.skin || Q.get("skin") || Q.get("theme") || Q.get("cab") || "").toLowerCase();
    if (/school|heroes/.test(sk) || /heroes/.test(location.pathname)) el.classList.add("heroes");
    lastSig = ""; layout();
    addEventListener("resize", () => { lastSig = ""; layout(); });
    setInterval(layout, 200);                         // the context (play / menu) follows the page's state
    // tap the game = ENTER (start, skip a cut-in, next shift, results) — unless the page handles taps itself
    if (cfg.tapEnter !== false) { const cv = document.getElementById("screen") || document.querySelector("canvas");
      if (cv) cv.addEventListener("pointerdown", (e) => { e.preventDefault(); send("Enter"); }); }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
