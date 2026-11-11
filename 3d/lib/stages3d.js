// PATTY MELT — 3D STAGE PLATES (art3d r2, Blender 1110): the screens that were 2D grids (meltdome.html, handoff.html,
// kitchen.html's FREEZER / BASEMENT bonus) get a rendered plate + ortho food / stock sprites drawn at the exported anchors.
// Data: assets/art3d/stages/stages.manifest.js → globalThis.ART3D_STAGES (plates, slot/lane/row anchors, atlases).
// Render-only: reads engine state, never writes it. Only under ?art=3d; anything missing → the page's 2D path draws.
//   PMStages.load(base)                 base = ".../assets/art3d/stages/"   (call once; images decode async)
//   PMStages.ready(stage)               plate + atlases loaded for that stage
//   PMStages.plate(ctx, stage)          draw the stage's plate at 0,0 (the canvas size it was rendered for)
//   PMStages.stage(name)                the stage's anchors ({slots, lanes, rows, toaster, …})
//   PMStages.food(ctx, p, PM, x, y, meltDone)  draw a grill item at a slot centre → false if no sprite (caller falls back)
//                                       (1110 r3: the melts too — PMELT_/SMELT_ onions ▸ Swiss ▸ browned ▸ the joined rye)
//   PMStages.toast(ctx, b, PM, g, x, y) draw toaster[j] (a Bun, or a GRILLED CHEESE by Stage) at a toaster anchor → false = none
//   PMStages.mini(ctx, key, x, y)       'mini.case' | 'mini.crate' | 'mini.cart_freezer' | 'mini.cart_basement'
//                                       (720×600 single-screen plates freezer720 / basement720 use 'mini720.*': stage.sprite_prefix)
(function (root) {
  "use strict";
  const D = root.ART3D_STAGES, IMG = {};
  let base = null;
  function im(f) { if (!IMG[f]) { const i = new Image(); i.src = base + f; IMG[f] = i; } return IMG[f]; }
  const ok = (i) => i && i.complete && i.naturalWidth > 0;
  function load(b) { if (!D) return false; base = b; for (const s of Object.values(D.stages)) im(s.plate); im(D.food.atlas); im(D.mini.atlas); return true; }
  const stage = (n) => D && D.stages[n];
  const ready = (n) => !!(D && base && stage(n) && ok(IMG[stage(n).plate]));
  function plate(ctx, n) { const s = stage(n); if (!s || !ok(IMG[s.plate])) return false; ctx.drawImage(IMG[s.plate], 0, 0, s.canvas[0], s.canvas[1]); return true; }
  function blit(ctx, atlasFile, spr, x, y) { const a = IMG[atlasFile]; if (!spr || !ok(a)) return false;
    ctx.drawImage(a, spr.sx, spr.sy, spr.w, spr.h, x - spr.ax, y - spr.ay, spr.w, spr.h); return true; }
  const has = (k) => !!(D.food.sprites[k]);
  function foodKey(p, PM, meltDone) {                  // engine Stage (+ item) → the atlas key (kitchen.html grillKey3D rules)
    const S = PM.Stage; let st;
    if (p.stage === S.SEAR_A) st = "SEAR_A"; else if (p.stage === S.SEAR_B) st = "SEAR_B";
    else if (p.stage === S.MELT) st = p.cook < meltDone / 2 ? "MELT_0" : "MELT_1";
    else if (p.stage === S.DONE) st = PM.RECIPES[p.item].includes(PM.Action.CHEESE) ? "DONE" : "DONE_PLAIN";
    else if (p.stage === S.BURNT) st = "BURNT"; else return null;
    if (PM.TOAST_ITEMS.has(p.item)) {                  // THE MELTS (1110 r3): onions on the seared patty ▸ the Swiss ▸ the rye joins
      const mp = p.item === PM.Item.SMASH_MELT ? "SMELT_" : "PMELT_", oi = PM.RECIPES[p.item].indexOf(PM.Action.ONION);
      let k = null;
      if (st === "SEAR_B" && oi >= 0 && p.step === oi + 1) k = mp + "ONION";           // (lib/spatulas.js onionsOn)
      else if (st === "MELT_0" || st === "MELT_1") k = mp + st;
      else if (st === "DONE") k = mp + (p.bunned ? "BUNNED" : p.cook >= meltDone * 2 ? "BROWNED" : "DONE");   // sat jammed = browned Swiss
      if (k && has("grill." + k)) return "grill." + k;
    }
    const sm = p.item === PM.Item.SMASH ? "SMASH_" : p.item === PM.Item.SMASH_MELT ? (/^(MELT|DONE)/.test(st) ? "SMELT_" : "SMASH_") : "";
    if (sm) { const k = "grill." + sm + (st === "DONE_PLAIN" ? "DONE" : st); if (has(k)) return k; }
    return "grill." + st;
  }
  function food(ctx, p, PM, x, y, meltDone) {
    if (!D || !p || p.stage === undefined || p.item === PM.Item.GRILLED_CHEESE) return false;   // (a grilled cheese lives on the toaster)
    const k = foodKey(p, PM, meltDone); return !!k && blit(ctx, D.food.atlas, D.food.sprites[k], x, y);
  }
  function toastKey(b, PM, g) {                        // toaster[j]: a Bun (no .stage) by its cook, or a grilled cheese by its Stage
    if (b.stage === undefined) {
      const r = PM.toast_ready(g), lv = b.cook >= PM.toast_burn(g) ? "BURNT" : b.cook >= r ? "READY" : b.cook >= r * 0.5 ? "TOASTING" : "RAW";
      return "toaster.BUN_" + lv;
    }
    const S = PM.Stage; return "toaster.GC_" + (b.stage === S.MELT ? "MELT" : b.stage === S.DONE ? "DONE" : b.stage === S.BURNT ? "BURNT" : "TOAST");
  }
  function toast(ctx, b, PM, g, x, y) { if (!D || !b) return false; const k = toastKey(b, PM, g); return blit(ctx, D.food.atlas, D.food.sprites[k], x, y); }
  function mini(ctx, key, x, y) { return !!D && blit(ctx, D.mini.atlas, D.mini.sprites[key], x, y); }
  const atlas = () => (D && ok(IMG[D.food.atlas]) ? IMG[D.food.atlas] : null);   // the food atlas Image once decoded (front.html HOW TO COOK)
  root.PMStages = { load, ready, stage, plate, food, toast, mini, foodKey, toastKey, atlas, data: D };
})(typeof globalThis !== "undefined" ? globalThis : this);
