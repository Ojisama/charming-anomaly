# Skies redesign — "Kaiju rampage across a stormed region"

**Date:** 2026-07-20
**Chapter:** `skies` (config.js `CHAPTERS.skies`)
**Status:** design, pending implementation plan

## Problem

`The Skies` doesn't read as its name. In-game it's **grey boulders scattered on flat
pale blue** (verified live: pale-blue bg `0x6f9ecf`, "building rubble" obstacles that
look like generic rocks, aircraft as edge specks). No clouds, no storm, no lightning,
no city — the top-down camera has no horizon, so the name's promise ("the skies") never
lands. The current fiction is actually *ground kaiju vs. air force*, and that's fine —
the fix is to make the ground read as a **stormed city under a night thunderstorm** and
let the ground itself **change as you roam**, rather than chase a literal aerial view a
top-down camera can't show.

## Decision (locked with the user)

A **ground rampage under a storm**, across a **procedurally-districted region**:

- You stay the ground kaiju (green + tail). Air force still hunts you across the region.
- **Constant global overlay:** night thunderstorm — dark bg, drifting cloud shadows on
  the ground, **parallax clouds passing overhead** (altitude/depth cue), rain, lightning.
- **Varying ground:** a **seeded Voronoi district map** over world-XY. Drift *any*
  direction → cross into a new district (downtown → suburbs → parks → sea, in any spatial
  arrangement, not radial rings). Each district = its own floor tint + obstacle/prop skin,
  blended at borders. Deterministic per run.

### The load-bearing constraint: **zero sim change**

Jets strafe, helis volley, tanks shell, and the `bombardment` signature rains — all run
identically regardless of the skin. So this is a **render.js + config-data** change:

- Districts are a pure `district(x, y)` function read by **render only** — for floor tint
  and for which prop-skin an obstacle wears. Obstacles stay generic circular colliders in
  `sim.js` (`run.obstacles`, streamed by `streamObstacles`, hashed off `run._obstacleSeed`).
- Lightning re-themes the **existing** `bombardment` telegraph/explosion (`run.bombs`);
  same sim, new art.
- **Sea is visual-only** water + waves. No swim, no slow (a slow would be sim). This keeps
  the zero-sim promise; a sea movement effect is explicitly out of scope (see Future).

**Proof obligation:** `npm test` (`test/sim-test.js`) must pass **unchanged** after the
work — that's the evidence the sim was not touched.

## Architecture — where each piece hooks in

Confirmed touchpoints (read during design):

| Concern | Location today | Change |
|---|---|---|
| Chapter palette | `config.js` `CHAPTERS.skies.render` (~L1337) | New bg/floor/player values (piece 1) |
| Background fill | `render.js` `R.background.color` (~L5290) | Single dark storm color (piece 1) |
| Floor color the player sees | `render.js` blotch/prop sprites tinted by one global `chapterRender.floorTint` (~L2547–2586) | Tint **per world-cell district** (piece 4) |
| Obstacle skin | `render.js` obstacle draw, rebuilt on `run._obstacleRev` | Prop-skin **per district** at the obstacle's cell (piece 4) |
| Signature (bombardment) | `config.js` `signature:{type:'bombardment'}` (L1332); `render.js` `bombG` telegraph `redrawBombs` (~L3596) | Re-theme telegraph→strike, explosion→bolt+flash (piece 3) |
| Moving world-space FX template | `render.js` `CURRENT_VIS` streak layer (~L2879–2972) | Copy the pattern for storm layers (piece 2) |
| Enemy machine palette | `render.js` L1331–1338 (jet gunmetal / heli olive / tank khaki) | Re-pass for the flipped (dark) floor (see Coupled cost) |
| Run seed | `state.js` `createRun`, `run._obstacleSeed` | Add render-only `run._districtSeed` |

## The four pieces (laziest-first; each ships independently)

### 1. Palette flip — *config data, ~0 code*

In `CHAPTERS.skies.render`:
- `bgColor`: `0x6f9ecf` → dark storm indigo (`~0x2b3440`). Night storm, not washed-out noon.
- `floorTint`: pale `0xc9d6e4` → wet-asphalt cool grey. Rubble → rain-slicked night wreckage.
  (Becomes the *default*/downtown district tint once piece 4 lands; districts override per-cell.)
- `playerTint`: keep kaiju green, optionally storm-lit (slightly desaturated).

**Coupled cost (not free, flag it):** `render.js` L1331–1338 documents that the three
machines were pushed **dark** *because the floor was light*. Flipping the floor **dark**
inverts that rule — the machines must go **light** to stay legible. One contrast re-pass
on jet/heli/tank fills; audit with the existing `node scripts/obstacle-contrast.mjs` and
by eye in-game.

### 2. Storm overlay — *new render layers, sized like `CURRENT_VIS`*

Three cosmetic layers, all keyed on the skies chapter, all pooled/world-space:

- **Ground cloud-shadows** (behind entities): big soft dark translucent blobs drifting on
  one wind vector, dimming the ground under them. Copy the `CURRENT_VIS` pool/advect idiom.
- **Overhead parallax clouds** (in front of everything): a top container offset by
  `-camera * parallaxFactor` (≈0.3) plus its own drift, so high clouds slide slower than
  the ground → reads as altitude/distance. Translucent, soft-edged.
- **Rain**: short diagonal streaks on the same wind vector (can reuse the streak sprite).

New config block `STORM_VIS` (counts, drift speed, wind angle, parallaxFactor, alphas,
rain density) — same shape/spirit as `CURRENT_VIS`.

### 3. Lightning — *re-theme existing `bombardment`, nearly free*

`bombardment` already telegraphs a circle then explodes into `run.bombs`. For skies:
- Telegraph (`bombG` in `redrawBombs`): draw as a **strike-incoming** flicker/target.
- Explosion: **bolt + brief full-field white flash** instead of the generic burst.
- Plus **ambient cosmetic lightning**: occasional full-field flash + distant bolt on a
  timer, no damage (pure render). Config: `LIGHTNING` (flash duration, ambient interval,
  bolt look).

Same `run.bombs` sim path — the storm *is* the hazard, now legibly.

### 4. Procedural Voronoi districts — *the one non-trivial piece, render-only*

- **`district(x, y)`** helper in `render.js` (module-level, pure): seeded Voronoi.
  Scatter seed points on a coarse world grid (~2000px spacing) jittered by a hash of
  `(cell, run._districtSeed)`; nearest seed's assigned type wins. Types weighted
  (`downtown`, `suburbs`, `parks`, `sea`); `sea` biased to cluster (bias by a low-freq
  hash so ocean forms a coherent region, not confetti). Deterministic per run.
- **Floor tint per district:** in the blotch/prop tint step (~L2547–2586), replace the
  single `chapterRender.floorTint` with `districtTint(worldCellCentre)`, **blended** across
  borders: near a Voronoi edge, lerp between the two nearest districts' tints over ~200px
  so tint transitions don't pop. (Props snap per-cell — only the *tint* needs blending.)
- **Obstacle + prop skin per district:** the obstacle draw and the scatter `kind` selection
  pick their sprite by `district(cell)`:
  - downtown = tall shattered-building chunks (today's rubble, kept)
  - suburbs = low houses, cars, fences
  - parks = trees, hedges, grass, small ponds
  - sea = water surface + breaking waves; few/no colliders (open water)
- **`run._districtSeed`** added in `state.js` `createRun` (unseeded `Math.random`, like
  `_obstacleSeed`; render-only, never read by sim → no seeded-test drift). Documented in
  the `state.js` run-shape doc block.

**// ponytail markers to leave in code:**
- `// ponytail:` Voronoi seed points from a coarse grid+hash, not a real point-set —
  upgrade to Poisson-disk sampling only if district sizes feel too uniform.
- `// ponytail:` tint blend is a 2-nearest lerp, not true multi-cell — fine for legible
  borders; revisit if 3-district corners look wrong.
- `// ponytail:` sea is visual-only; add a movement effect only if it plays flat.

**District set:** ship the four (downtown / suburbs / parks / sea). `industrial/docks`
and `highway/airport` are drop-in extra types (add a weight + a prop-skin) — deferred,
not built now.

#### Art pipeline for new district props — decided: hand-drawn vector

The four district skins need new props (houses, cars, fences, trees, hedges, waves…).
**Decision: hand-draw them as baked vector in `render.js`**, the way every existing
chapter's looks are made (`drawJet`, foliage baked to textures once). Matches the game's
clean flat-vector aesthetic, no new pipeline, no runtime asset graph (respects the
`import.meta.glob` eager-URL constraint). Storm/lightning FX (pieces 2–3) are procedural
regardless — no generated art anywhere in this work.

**Why not ComfyUI** (the user's `~/ComfyUI` + `~/gamedev/special-funicular/` sprite-gen,
recon'd 2026-07-20): the *plumbing* is excellent and reusable (config-driven Python +
ComfyUI HTTP API + auto bg-removal + gallery-pick, `scripts/generate-transparent.py`),
but the *style engine* is wrong here. `special-funicular` runs bare **FLUX.1-schnell with
no style LoRA**; output is **painterly/rendered digital-painting** creatures (soft
gradients, AO, glow, drop-shadows, no outlines) — the opposite of this game's solid-fill
+ dark-outline vector. Forcing flat-vector out of it would need a model/LoRA swap **plus**
a vectorize/posterize+outline post-step, and matching outline weight + palette across a
whole prop set is the hard, manual part. Not worth it for props.
Parked, not dead: if we ever deliberately move this game toward a painterly look, that
pipeline is ready to reuse — but that's a whole-game art-direction change, out of scope.

## Determinism & testing

- **Sim purity:** `npm test` passes unchanged (the whole point).
- **`district(x, y)` self-check** (per ponytail, one runnable assert-based check, no
  framework): same `(x, y, seed)` → same district; two calls either side of a border
  return different districts; the ~200px tint blend is continuous (no jump > small ε).
  Lives as a `demo()`/`__main__`-style check next to the helper or a scenario appended to
  `test/sim-test.js` **only if** the helper is importable without Pixi (it should be —
  keep `district()` a pure fn with no Pixi deps so it's testable).
- **Visual verification (chrome-devtools):** seed a save to force the skies chapter.
  `localStorage['charming-anomaly-save-v1']` must include a `shop:{}` key or `loadMeta`
  throws and silently falls back to a fresh (all-locked) save. `onPlay` launches
  `meta.chapter`; the title carousel can't scroll-center the last-but-one chapter, so set
  `meta.chapter='skies'` and click Play without touching the carousel (or hide the
  preceding hero-cards so a synthetic `scrollend` settles on skies). Then screenshot each
  district + a lightning strike + parallax drift.

## Out of scope / future

- Sea swim/slow movement mechanic (would be sim; deliberately excluded to keep zero-sim).
- Extra district types (industrial, highway/airport) — drop-in later.
- Per-district *bg gradient* — bg stays one dark storm color (mostly hidden under storm +
  blotches); districts read from floor tint + props, which is enough and far cheaper.
- Reworking enemy rosters/behaviors — untouched; this is purely look.

## Build order

1 (palette + contrast re-pass) → 2 (storm overlay + parallax) → 3 (lightning re-theme) →
4 (districts). 1–3 are a shippable "stormed city" on their own; 4 adds the region.
