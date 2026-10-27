// PATTY MELT — the ?art=3d asset layer (RENDER-ONLY: it loads pictures; it never reads or writes the engine).
// Built by the 3D PIPELINE (games/patty-melt/blender/export_art3d.py) into assets/art3d/:
//   art3d.json      the manifest: kitchen backgrounds per grill mood, the counter foreground layer, the food
//                   atlases (every sprite's atlas rect + its top-left in the KIT panel), the cast frames, and the
//                   gameplay locations (from refs/locations.json, KIT-panel pixels) keyed to engine slot indices
//   *.webp          everything pre-sized to draw size and compressed — "smash down the art"
// ART3D.load() preloads ALL of it; kitchen.html holds the shift start until ART3D.ready, so nothing pops in mid-shift.
// ART3D.make() returns an independent asset set (the 1UP cab loads three: its grill band, the classic cast/patrons,
// and HEROES); manifests are read one at a time (they arrive through one global), so loads queue behind each other.
(function () {
  "use strict";
  let _queue = Promise.resolve();
  function make() {
  const ART = { ready: false, failed: false, progress: 0, m: null, img: {}, atl: [], cast: {}, patronAtl: [] };
  let BASE = "../assets/art3d/";
  function loadImg(src) {
    // decode() up front: the first draw of a big WebP otherwise decodes on the render thread (a 400+ ms hitch mid-shift)
    return new Promise((res) => { const im = new Image(); im.onerror = () => res(null);
      im.onload = () => { (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => res(im)); }; im.src = BASE + src; });
  }
  ART.load = function (base) { const p = _queue.then(() => ART._load(base)); _queue = p.catch(() => {}); return p; };
  ART._load = async function (base) {
    if (base) BASE = base;                          // HEROES: ../assets/art3d/heroes/
    // the manifest ships as a script too (art3d.manifest.js) so ?art=3d also works straight off the filesystem
    await new Promise((res) => { const sc = document.createElement("script"); sc.src = BASE + "art3d.manifest.js";
      sc.onload = res; sc.onerror = res; document.head.appendChild(sc); });
    ART.m = globalThis.ART3D_MANIFEST || null; globalThis.ART3D_MANIFEST = null;
    if (!ART.m) { try { const r = await fetch(BASE + "art3d.json", { cache: "no-cache" }); ART.m = await r.json(); } catch (e) {} }
    if (!ART.m) { ART.failed = true; return ART; }
    const m = ART.m, jobs = [];
    let done = 0; const tick = (p) => p.then((v) => { done++; ART.progress = done / jobs.length; return v; });
    for (const [k, f] of Object.entries(m.bg)) jobs.push(tick(loadImg(f)).then((im) => { ART.img["bg_" + k] = im; }));
    if (m.fg) jobs.push(tick(loadImg(m.fg)).then((im) => { ART.img.fg = im; }));
    m.atlases.forEach((f, i) => jobs.push(tick(loadImg(f)).then((im) => { ART.atl[i] = im; })));
    (m.patron_atlases || []).forEach((f, i) => jobs.push(tick(loadImg(f)).then((im) => { ART.patronAtl[i] = im; })));
    if (m.dining_bg) jobs.push(tick(loadImg(m.dining_bg)).then((im) => { ART.img.dining = im; }));
    for (const [who, poses] of Object.entries(m.cast)) {
      ART.cast[who] = {};
      for (const [pose, f] of Object.entries(poses)) {
        if (Array.isArray(f)) { ART.cast[who][pose] = []; f.forEach((ff, i) => jobs.push(tick(loadImg(ff)).then((im) => { ART.cast[who][pose][i] = im; }))); }
        else jobs.push(tick(loadImg(f)).then((im) => { ART.cast[who][pose] = im; }));
      }
    }
    await Promise.all(jobs);
    ART.ready = !!(ART.img.bg_empty && ART.atl.every(Boolean));
    ART.failed = !ART.ready;
    return ART;
  };
  ART.has = (key) => !!(ART.m && ART.m.sprites[key]);
  // blit one atlas sprite at its baked KIT-panel position (ox, oy = the panel origin), optional alpha
  ART.draw = function (ctx, key, ox, oy, alpha) {
    const s = ART.m && ART.m.sprites[key]; if (!s) return false;
    const im = ART.atl[s.a]; if (!im) return false;
    if (alpha != null && alpha < 1) { const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * alpha; ctx.drawImage(im, s.sx, s.sy, s.w, s.h, ox + s.x, oy + s.y, s.w, s.h); ctx.globalAlpha = a0; }
    else ctx.drawImage(im, s.sx, s.sy, s.w, s.h, ox + s.x, oy + s.y, s.w, s.h);
    return true;
  };
  return ART;
  }
  globalThis.ART3D = make(); globalThis.ART3D.make = make;
})();
