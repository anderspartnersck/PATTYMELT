// PATTY MELT — PMProps: the 1116 Blender PROP SET (drinks, waste bin, emblem badges, wall clock, take-out bags, wall phone,
// sidewalk crowd, tour bus, SPEED BATTLE stackers + tower plate) drawn from the packed atlas the art pipeline exports:
//   3D PIPELINE/games/patty-melt/tools/props1116_post.py → assets/art3d/props/props-N.webp + props.manifest.js (PM_PROPS)
// Each sprite: {a, sx, sy, sw, sh} = atlas rect (2× px) · {w, h} = draw size at 1× · {ax, ay} = anchor in draw px
// (floor props: ground-contact centre · wall props: hang point · badges / handset: centre).
// Render-only. Absent-safe: with no manifest (or before the atlas decodes) every draw() returns false and the caller
// keeps its canvas placeholder — so a page never shows a hole, and `?props=off` forces the placeholders for A/B.
//   PMProps.load(base)                  base = the props folder URL ("../assets/art3d/props/"); idempotent
//   PMProps.has(key) / PMProps.ready()
//   PMProps.draw(ctx, key, x, y, k=1, o) x,y = the sprite's anchor; k = scale on the 1× draw size; o.alpha, o.flip
//   PMProps.skin                        "diner" | "heroes" — set by the page; key(fam, ...rest) builds "<fam>.<skin>.<rest>"
(function (root) {
  "use strict";
  let atl = null, base = null;
  const off = (() => { try { return new URLSearchParams(root.location ? root.location.search : "").get("props") === "off"; } catch (e) { return false; } })();
  function man() { return !off && root.PM_PROPS && root.PM_PROPS.sprites ? root.PM_PROPS : null; }
  const API = {
    skin: "diner",
    load(b) {
      const m = man(); if (!m || atl || typeof Image === "undefined") return API;
      base = b || base || "../assets/art3d/props/";
      atl = m.atlases.map((n) => { const i = new Image(); i.decoding = "async"; i.src = /^(data:|https?:|\/)/.test(n) ? n : base + n; return i; });
      return API;
    },
    ready() { return !!(atl && atl.length && atl.every((i) => i.complete && i.naturalWidth)); },
    has(key) { const m = man(); return !!(m && m.sprites[key]); },
    key(fam, ...rest) { return [fam, API.skin === "school" ? "heroes" : API.skin].concat(rest).join("."); },
    spr(key) { const m = man(); return m ? m.sprites[key] || null : null; },
    draw(ctx, key, x, y, k = 1, o = {}) {
      const m = man(); if (!m) return false;
      if (!atl) API.load();
      const s = m.sprites[key]; if (!s || !atl) return false;
      const im = atl[s.a]; if (!im || !im.complete || !im.naturalWidth) return false;
      ctx.save();
      if (o.alpha != null) ctx.globalAlpha *= o.alpha;
      ctx.translate(x, y); if (o.flip) ctx.scale(-1, 1);
      ctx.drawImage(im, s.sx, s.sy, s.sw, s.sh, -s.ax * k, -s.ay * k, s.w * k, s.h * k);
      ctx.restore();
      return true;
    },
  };
  root.PMProps = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
