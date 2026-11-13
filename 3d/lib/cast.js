// PATTY MELT — THE CAST TABLE (render-only). ONE place that decides which picture is Patty / Chrissy / Billy.
// Every cast-sprite load in the 3D edition goes through here: the in-game 3D relief frames (art3d.js), the 2D
// fallback cooks + Billy (kitchen.html), and the big splash / cut-in / cutscene art (lib/cine.js, front.html).
//
//   ?cast=ink   → try the hand-inked set first: assets/art3d/cast_ink/{diner,heroes}/<who>-<pose>.webp
//                 (same pose names + sizes as the current frames); anything missing falls back, per image, to
//                 today's art. No flag = today's art, untouched.
//
// API (globalThis.PMCast):
//   PMCast.ink                       true when ?cast=ink
//   PMCast.skinDir(skin)             "diner" | "heroes"
//   PMCast.art3dChain(base, file)    [urls…] for one manifest cast frame ("cast/patty-idle.webp" under base)
//   PMCast.heroChain(skin, who, pose) [urls…] the hi-res splash picture for a cast member's pose
//   PMCast.img(chain, onload?)       an Image that walks the chain on error (null-safe .width check before drawing)
//   PMCast.hero(skin, who, pose)     cached PMCast.img(heroChain(...))
//   PMCast.POSES                     what each cast member has for the splash work, per skin
(function () {
  "use strict";
  const Q = new URLSearchParams((globalThis.location && location.search) || "");
  const INK = (Q.get("cast") || "").toLowerCase() === "ink";
  const ROOT = "../assets/";
  const skinDir = (skin) => (String(skin || "").toLowerCase() === "school" || String(skin).toLowerCase() === "heroes") ? "heroes" : "diner";
  const inkUrl = (skin, who, pose) => ROOT + "art3d/cast_ink/" + skinDir(skin) + "/" + who + "-" + pose + ".webp";

  // The hi-res painted cast (the 0701 masters + the HEROES Cougars set). HEROES Patty — COUGARS apron, black pants,
  // boots, hairnet, eyeblack — is Joe's favourite look: she is the star of the splash + cutscene work.
  const HERO = {
    diner: {
      patty:   { dir: "chars/cast/", poses: ["idle", "serve", "cheer", "profile"] },
      chrissy: { dir: "chars/cast/", poses: ["idle", "cheer", "cheese", "flip", "serve", "run", "scrape"] },
      billy:   { dir: "chars/", poses: ["serve", "turn", "slack", "walk-0", "walk-1", "walk-2", "walk-3", "walk-4", "walk-5"] },
    },
    heroes: {
      patty:   { dir: "chars/", file: (p) => "patty-school-" + p + ".png", poses: ["idle", "serve", "cheer", "flip"] },
      chrissy: { dir: "chars/", file: (p) => "chrissy-school-" + p + ".png", poses: ["idle", "serve", "cheer", "flip"] },
      billy:   { dir: "chars/", poses: ["serve", "turn", "slack", "walk-0", "walk-1", "walk-2", "walk-3", "walk-4", "walk-5"] },
    },
  };
  // JOE'S OWN PAINTINGS (1111 HEROES set, 1112 DINER Patty) — cut clean by 3D PIPELINE/games/patty-melt/tools/joe_cast.py
  // into assets/art3d/cast_joe/<look>/<who>-<pose>.webp. They are THE art: first in every chain (before ?cast=ink's
  // procedural re-ink, which degrades already-inked paintings), and only the poses listed here are asked for (no 404s).
  // (1112) Joe: "you are replacing many of them with new look sprites" — Billy = his teen Cougars Billy (run-with-tray =
  // serve, near-duplicate run = turn, kneeling = slack). DINER Chrissy / DINER Billy = paint-overs of those HEROES
  // paintings (diner red, COUGARS + paw + eye-black painted out; tools/diner_paintover.py), cut into cast_joe/diner/.
  const JOE = {
    heroes: { patty: ["idle", "flip", "cheer", "serve", "cheese"], chrissy: ["idle", "flip", "cheer", "serve", "cheese"], billy: ["slack", "serve", "turn"] },
    diner:  { patty: ["idle", "flip", "cheer", "serve"], chrissy: ["idle", "flip", "cheer", "serve", "cheese"], billy: ["slack", "serve", "turn"] },
  };
  const joeUrl = (sd, who, pose) => ROOT + "art3d/cast_joe/" + sd + "/" + who + "-" + pose + ".webp";
  const POSE_FALLBACK ={ cheer: ["cheer", "serve", "idle"], flip: ["flip", "cheese", "idle"], cheese: ["cheese", "flip", "idle"],
    serve: ["serve", "cheer", "idle"], run: ["run", "idle"], profile: ["profile", "idle"], idle: ["idle"], slack: ["slack", "turn"], turn: ["turn", "serve"] };

  function heroChain(skin, who, pose) {
    const sd = skinDir(skin), rec = HERO[sd][who] || HERO.diner[who]; if (!rec) return [];
    const want = POSE_FALLBACK[pose] || [pose, "idle"], out = [];
    const joe = (JOE[sd] && JOE[sd][who]) || [];
    for (const p of want) {
      if (joe.includes(p)) out.push(joeUrl(sd, who, p));
      if (INK) out.push(inkUrl(skin, who, p));
      if (rec.poses.includes(p)) out.push(ROOT + rec.dir + (rec.file ? rec.file(p) : who + "-" + p + ".png"));
    }
    if (sd === "heroes") { const d = HERO.diner[who]; for (const p of want) if (d && d.poses.includes(p)) out.push(ROOT + d.dir + who + "-" + p + ".png"); }
    return out;
  }
  function art3dChain(base, file) {       // base "../assets/art3d/" or ".../art3d/heroes/", file "cast/patty-idle.webp"
    const out = [];
    if (INK) { const name = String(file).split("/").pop(); out.push(ROOT + "art3d/cast_ink/" + (/heroes\/?$/.test(base) ? "heroes" : "diner") + "/" + name); }
    out.push(base + file); return out;
  }
  function img(chain, onload) {
    const im = new Image(); let i = 0;
    im.onerror = () => { i++; if (i < chain.length) im.src = chain[i]; else im.onerror = null; };
    im.onload = () => { if (onload) onload(im); };
    if (chain.length) im.src = chain[0];
    return im;
  }
  const _cache = new Map();
  function hero(skin, who, pose) {
    const k = skinDir(skin) + "/" + who + "/" + pose;
    if (!_cache.has(k)) _cache.set(k, img(heroChain(skin, who, pose)));
    return _cache.get(k);
  }
  function preload(skin) { for (const who of ["patty", "chrissy", "billy"]) for (const p of ["idle", "serve", "cheer", "flip", "slack", "turn"]) hero(skin, who, p); }
  const ready = (im) => !!(im && im.complete && im.naturalWidth);
  globalThis.PMCast = { ink: INK, skinDir, heroChain, art3dChain, img, hero, preload, ready, HERO, JOE };
})();
