# The Skies — art direction & FX specification

**Date:** 2026-07-25
**Chapter:** `skies` (`CHAPTERS.skies`, config.js)
**Status:** buildable spec. Every number here is final unless a measurement gate below says otherwise.
**Supersedes the look of:** `2026-07-20-skies-storm-redesign-design.md` (storm/lightning/districts) and the
render half of `2026-07-25-skies-kaiju-redesign-design.md` (crush/rampage). The *sim* of both stands.

---

## 0. The verdict, and what this document is

Four directions were proposed and three judges scored them. Aggregate:

| Direction | J1 | J2 | J3 | Total |
|---|---|---|---|---|
| **TOKUSATSU NIGHT — "the lights are looking for you"** | 33 | 33 | 33 | **99** |
| NIGHT RECON — the region as a drone camera sees it | 29 | 32 | 26 | 87 |
| FIRE CONTROL — the city as the enemy's targeting picture | 26 | 24 | 26 | 76 |
| AFTERMATH — the wreckage is the art | 27 | 24 | 22 | 73 |

**TOKUSATSU NIGHT wins, unanimously ranked first, and is the spine.** It is the only proposal whose art
direction is also a *verb*: the prettiest thing on screen (a searchlight) is anchored to a structure you can
walk into and break. Palette decision and gameplay decision are the same decision.

Grafted on, because the spine is thin exactly where the runners-up are strong:

- from **NIGHT RECON**: the entire ground language (road-marking family, mown stripes, pivot circles,
  container yard, bus-vs-sedan bake set) and the **single global shadow law**;
- from **FIRE CONTROL**: the **sim discriminator** (without which tank fire and sky fire physically cannot
  look different — see §1), the **shadow-stroke rule**, the **arrival-clock rule**, **telegraph LOD**, the
  **warm-gold reservation**, **parallel wind-leaned sky vectors**, and **rampage jamming**;
- from **AFTERMATH**: **kind-specific ruins** (a surviving chimney stack beats a generic scar for the same
  cost) and **material-specific crush dust**.

Everything Aftermath's fire/plume/emergency-vehicle half proposed is cut. §14 says why.

This document is the art brief *and* the implementation contract. It is written against the code as it is
today: `bake(g, pad)` at `resolution: 2` returning `{tex, ax, ay}` (render.js:111), `Texture.from(canvas)`
for gradients (render.js:1865-1941, 2665), the `FLOOR_LAYERS` per-cell pooled populate machinery
(render.js:3596), `syncObstacles`' `ring + clumpA + clumpB` rig (render.js:4140), the global 200-slot
particle ring buffer (render.js:14), and `roadAt`/`districtAt` as the only shared sim/render geometry
(config.js).

---

## 1. Stage 0 — the two prerequisites (do these first; nothing else works without them)

### 1.1 The bombs discriminator (crosses into sim.js — plan it, do not smuggle it)

`sim.js:570` (tank artillery) and `sim.js:1579` (sky bombardment) push **structurally identical**
`run.bombs` entries: `{x, y, radius, fuse, duration, dmg}`. `render.js`'s `redrawBombs` (render.js:6103)
therefore *cannot* tell a tank shell from a lightning strike. That is the literal, verified root cause of
"the storm hit and the tank hit look the same". No amount of art fixes it.

```js
// sim.js:570 — artillery
run.bombs.push({ x, y, radius, fuse: ARTILLERY_FUSE, duration: ARTILLERY_FUSE, dmg,
                 src: 'gun', ox: e.x, oy: e.y })     // ox/oy = the firing tank, for the trajectory ghost
// sim.js:1579 — bombardment
run.bombs.push({ x, y, radius: BOMBARDMENT_RADIUS, fuse: BOMBARDMENT_FUSE,
                 duration: BOMBARDMENT_FUSE, dmg: BOMBARDMENT_DMG, src: 'sky' })
// sim.js:1816 — volatile elites (every other chapter): src stays undefined. Untouched.
```

`stepBombs`' detonation event (`sim.js:1743`) mirrors it:
`run.events.push({ type: 'explode', x: b.x, y: b.y, radius: b.radius, src: b.src, ox: b.ox, oy: b.oy })`.

Document the three new fields in `state.js`'s doc block (the `run.bombs` entry and the `explode` event
shape). The fields are purely additive; `test/sim-test.js` needs no change, but run it.

### 1.2 Split the particle pool

`MAX_PARTICLES = 200` is **one global ring buffer** (render.js:14, `particleCursor` wraps silently). This
spec adds persistent missile smoke, crush dust and artillery clods. At naive rates those would evict every
hit/kill/pickup particle in the game with no error.

Add a **second, separately capped pool** in the same shape as `particles`/`spawnParticle`:

```js
const MAX_SMOKE = 90
const smokeParticles = [] ; let smokeCursor = 0
function spawnSmoke(tex, x, y, vx, vy, life, scale, tint, grow, drag, grav) { /* identical body, own pool */ }
```

Its layer sits directly under `particleLayer`. **Only** these three effects use it: missile trail, crush
dust skirt, artillery dirt clods. Missile trail emission is capped to the **6 nearest live missiles**
(`MISSILE_MAX_LIVE` is 18), at one puff / 0.10 s, life 1.4 s → ≤ 84 live puffs worst case.

### 1.3 The photosensitivity budget (central, not per-effect)

Render-local `let flashCooldown = 0`. `triggerLightningFlash(a)` becomes:

```js
if (flashCooldown > 0) { lightningFlashA = Math.max(lightningFlashA, a * 0.4); return }
lightningFlashA = Math.max(lightningFlashA, a); flashCooldown = 0.9
```

`flashCooldown -= dt` in `sync()`. Additional hard rule: **the full-field flash and the rampage screen
bloom never render in the same frame** — if `lightningFlashA > 0.05`, the rampage bloom sprite's alpha is
forced to 0 for that frame. `LIGHTNING.flash.strikeAlpha` stays at 0.55; do not raise it.

---

## 2. The three palette laws (enforce in code review, not in judgement)

1. **WARM SODIUM GOLD IS AMBIENCE AND IS NEVER A THREAT.** `0xffb45a` (lamp light), `0xffd08a` (lit
   window), `0xffc46a` (interior spill from a collapsing structure). It only ever appears as a *soft fill
   at alpha ≤ 0.16* or as a *static ≤ 5px lit rectangle*. It never strokes, never moves, never pulses.
2. **ATOMIC CYAN-GREEN IS THE PLAYER AND IS NEVER A THREAT.** `0x4bffc8` / `0xd8fff4`. If it is on screen,
   you are the danger. Learned in one run.
3. **ICE BLUE-WHITE `0xdfefff` IS SEARCHLIGHT LIGHT ONLY.** It is taken away from the jet strafe lane and
   from the bomb telegraph, both of which wear it today (`LIGHTNING.telegraph.color = 0x8fd8ff`).

Every threat's stroke obeys the **shadow-stroke rule**: draw the stroke twice — first `0x080c14` at
`width + 2.5`, alpha 0.5, then the colour on top. One helper, used by every telegraph drawer:

```js
function inkStroke(g, path, width, color, alpha) { // path = a closure that issues the geometry
  path(); g.stroke({ width: width + 2.5, color: 0x080c14, alpha: 0.5, join: 'round', cap: 'round' })
  path(); g.stroke({ width, color, alpha, join: 'round', cap: 'round' })
}
```

This is what lets six *saturated* threat palettes stay legible over six district floor tints without
raising alpha — the alternative is the mid-tint mush we have now.

---

## 3. THE THREAT TABLE (the heart of this spec)

Six threats, separated on **three axes at once** — colour family, shape language, motion verb — with **no
two sharing more than one axis**. Every incoming threat additionally carries exactly **one travelling
element that arrives on the exact frame damage lands** (the *arrival clock*), so the player reads four
clocks at four speeds instead of "the circle got brighter".

| Threat | Colour family | Shape language | Motion verb + arrival clock | Duration | Cannot be confused because |
|---|---|---|---|---|---|
| **Jet strafe**<br>`strafe` / `strafeLock` | **Halogen white + tracer orange.** Landing-light pool `0xfff6e2` (additive, a 0.10→0.26); rails `0xffffff` a 0.45; tracer dash `0xff6a10`; tracer core `0xfff2c0`; nav lights `0xff2d2d` / `0x2dff6a`; impact grit `0x8f8a7c` | Two **hairline rails** at the exact contact half-width (`PLAYER.radius + ENEMIES.wisp.radius`), **no fill**, plus a long narrow **light ellipse** (aspect 1 : 0.22) riding between them. Zero brackets, zero chevrons, zero circles | **Travels along a line, laterally, faster than anything else.** *Clock:* the halogen ellipse races from the jet's end of the lane to the player's end over `STRAFE_TELEGRAPH_T` and arrives on the frame the run begins. Then the damage itself is a **stitch**: paired `9×3` orange dashes walking the lane at `STRAFE_RUN_SPEED_MUL`, each popping a 6px grit puff and a 3px scorch tick | telegraph 0.5 s (`STRAFE_TELEGRAPH_T`), run 1.0 s (`STRAFE_RUN_T`) | It is the **only threat whose damage point translates across the screen**, and the only one with **no filled area at all**. Orange dashes appear nowhere else |
| **Helicopter missile**<br>`missileVolley` | **Signal magenta.** Designator `0xff2d6f`; reticle core `0xffd7e6`; exhaust `0xffb35c` → `0xfff2c0`; smoke ribbon `0x6a4a5e` fading to `0x3a2c33`; impact star `0xffd7e6` over `0x2a2620` | A **rotating lock diamond** (four corner ticks on a 45°-rotated square) anchored on **you**, a **dashed designation line** from the helicopter's nose with a bead on it, then a hard dart trailing a **corkscrew smoke helix** (lateral sine offset that *grows* as the puff ages) | **A physical object flies at you and its trail persists.** *Clock:* the bead crawls the designation line and reaches the diamond on the launch frame; the diamond shrinks in **4 discrete snap-steps/s**, never a smooth lerp. `MISSILE_TURN = 0` — the dart is dead straight, the *smoke* is what curls | lock ≈ 0.6 s before each volley; missile life 2.6 s (`MISSILE_LIFE`); ribbon 1.4 s after | It is the **only travelling physical projectile**, the **only spiral shape in the game**, the **only mark anchored to the player**, and the only magenta thing in any chapter |
| **Tank artillery**<br>`artillery`, `src:'gun'` | **Dull ordnance olive + ochre.** Bracket `0xc9b26a`; hatch bars `0x0a0d12` over `0xc9b26a` a 0.18; shell shadow `0x0a0c10` a 0.55; muzzle flash `0xffd98a` (0.06 s); fireball `0xe8641e` with a **black core** `0x16120e`; clods `0x6b4a2a`. Elites add a radar-green `0x7fffb0` tick on the bracket | A **square surveyor's target box**: four L corner brackets + ranging graduations on two edges, with a **diagonal-hatched clock hand** sweeping inside it. Inside, a small dark **ellipse — the falling shell's own shadow**. A thin **trajectory ghost** arcs back to `ox, oy` (the firing tank). Never a circle | **Something heavy falls on you.** *Clock:* the hatched hand sweeps exactly 360° over `ARTILLERY_FUSE` and completes on impact, while the brackets shrink inward **and the shell shadow grows from 4px to full radius** — two opposed motions locking on the impact frame. Detonation throws 10 **angular** clods on real parabolas that land and leave splash decals | 1.1 s (`ARTILLERY_FUSE`); elite 1.1 s at `ARTILLERY_ELITE_RADIUS` | It is the **only square telegraph**, the **only hatched fill in the game**, the **only desaturated telegraph**, and the only one that draws a **curved line back to a ground origin** |
| **Sky bombardment / lightning**<br>signature, `src:'sky'` | **Violet-white.** Descent vector `0xc8b4ff`; brackets/core `0xffffff`; ionisation wash `0x9d8cff` a 0.10; bolt core `0xf4fbff`, glow `0xb79bff`; Lichtenberg scar `0xe6dcff`. **Nothing else in the chapter is violet** | A straight **descent vector** dropped from off-frame to the impact point, **leaned along `STORM_VIS.windAngle` so every simultaneous strike on screen is parallel**; impact marked by **four square brackets closing inward** plus ~20 discrete crackling spark ticks on the perimeter. On the strike: the existing forked bolt + **dendritic Lichtenberg branches** burned into the ground | **Descends and then cracks vertically; its sparks travel UP.** *Clock:* a triple chevron slides down the leaning vector, accelerating, and touches ground exactly at `fuse = 0`. Impact is instantaneous, zero travel, no heading | 1.2 s (`BOMBARDMENT_FUSE`); bolt 0.22 s; ground scar 2.5 s | It is the **only violet** thing, the **only mass-parallel** telegraph (a screenful = the sky is firing, versus rings radiating from scattered tanks = the guns are firing), the **only branching fractal**, and the only telegraph whose particles rise |
| **Crush**<br>`{type:'crush',x,y,kind}` | **Desaturated, and material-specific by `e.kind`.** concrete `0xc9c2b0`/`0x8d8577` (tower); brick `0xa85f45` (house); timber `0xc4a06a` (barn/pier); grain `0xdcc98a` (silo); harbour spray `0x9fc3d8` (pier over water); leaf `0x6f8a5c` (tree). Scar `0x0e1116`. **One beat** of `0xffc46a` interior spill | **The anti-telegraph — no warning iconography at all.** A **low squashed** dust skirt (ellipse ratio 1 : 0.45, hugging the ground), 8-10 **angular hard-edged** slab/tile/plank shards with visible edges, and then **permanent geometry**: a kind-specific baked ruin swapped in at the site | **Slow. Outward, then settling, then drifting downwind.** Shards arc back down under fake gravity and stop. Dust expands then *sinks*. No clock — it already happened | burst 0.9 s, dust skirt 2.5 s, **ruin permanent** (ledger-capped) | It is the **only desaturated event**, the **only slow one**, the **only one with no telegraph**, the **only one that removes light** (windows snap dark), and the **only one that adds permanent geometry to the ground** |
| **Rampage**<br>`run.rampageT > 0` | **Atomic cyan.** Plate charge `0xd8fff4` → `0x4bffc8`; screen bloom `0x2fe0b4` a 0.10; **alert red `0xff3b30`** on the searchlights and klaxons (red is now reserved for ALERT only) | Seven **dorsal plates** chain-charging tail→head, a **heartbeat ring** rolled out to the *true* widened crush radius (`PLAYER.radius * RAMPAGE_CRUSH_MUL`), a cyan rim-light on every structure inside it, and **every enemy telegraph on screen visibly jamming** | **Rhythmic, sustained, emanating from you.** A 0.6 s heartbeat for 5 s — the only looping effect. The searchlight flip to red propagates as a **wave at 900 px/s**, not a single frame. Exit = a slow re-acquisition over 0.6 s | 5 s (`RAMPAGE_DURATION`) | It is the **only sustained rhythmic** effect, the **only one sourced at the player**, the only cyan, and **the only one that changes the lighting state of the whole scene** rather than adding an object |

### 3.1 Axis audit (the acceptance test — verify before drawing anything)

| | colour | shape | motion |
|---|---|---|---|
| jet | halogen/orange | parallel hairlines + ellipse | travels along a line |
| missile | magenta | rotating diamond + helix | flies at you, trail persists |
| artillery | dull olive/ochre | square box + hatch | falls; opposed shrink/grow |
| sky | violet | leaning vector + square brackets | descends, then vertical crack; sparks rise |
| crush | grey/material | squashed skirt + angular shards | slow settle; adds geometry |
| rampage | cyan | rings + plates | sustained pulse outward from you |

No two rows share more than one axis. Artillery and sky both use square corners — that is their one shared
axis, and it is broken by hue (dull ochre vs violet), by mass-composition (radiating from scattered ground
origins vs all-parallel) and by motion (sweeping hand vs descending chevron).

### 3.2 Implementation notes per threat

**Everything static in a telegraph is a BAKED TEXTURE scaled to the live radius** (the `T.obFoot` idiom:
bake at `REF = 100`, `scale.set(live / ref)`). **Only the moving element is per-frame `Graphics`.** This is
not a mitigation, it is the design — `SHELL_MAX_LIVE = 6` and `MAX_STRAFE_LOCKS = 10` telegraphs of
graduated ticks drawn live would not hold on a phone.

New baked telegraph textures (all white-alpha, tinted per use):

| texture | contents | REF |
|---|---|---|
| `T.tgCornerL` | one L corner tick, 22×22, 3px stroke | 32 |
| `T.tgSquare` | four L corners on a square, graduations on two edges (7 ticks, every 3rd long) | 100 |
| `T.tgHatchHand` | a thin ray from centre to rim, filled with 6 diagonal hatch bars | 100 |
| `T.shellShadow` | soft radial ellipse, hard-ish edge (canvas gradient, stop at 0.7) | 64 |
| `T.lockDiamond` | four corner ticks arranged on a 45° square | 48 |
| `T.landingPool` | long narrow additive ellipse gradient, aspect 1 : 0.22 (canvas) | 512×112 |
| `T.lightCone` | additive wedge, 26° arc, alpha 0.30 at mouth → 0.02 at tip (canvas) | 1024×512 |
| `T.lampPool` | additive elliptical sodium pool, 3 nested feathered stops (canvas) | 256×160 |
| `T.klaxonRing` | thin hard ring, 4px stroke, 2px inner gap | 100 |
| `T.branchTree` ×4 | pre-computed Lichtenberg trees, ~40 segments, 3 generations, tapering | 200 |

Live-`Graphics` budget per frame, worst case: 10 strafe lanes × 4 strokes (2 rails × shadow-stroke) + 6
shells × 3 strokes (ghost + 2 graduation accents) + 6 sky vectors × 5 strokes (vector + 3 chevrons +
bracket accent) + 18 missiles × 2 strokes = **≈ 130 strokes**, all into the existing `teleG`/`bombG`. That
is in the same ballpark as today.

**Telegraph LOD.** Beyond 700 px from the player a glyph degrades to its impact mark alone — drop the
rails, the graduations, the trajectory ghost, the designation line. `const far = dx*dx + dy*dy > 490000`.

**Rampage jamming.** While `run.rampageT > 0`, every enemy telegraph glyph rolls per-frame:
`if (Math.random() < 0.22) continue` on each segment, and `alpha *= 0.55 + 0.45 * Math.random()`. Lock
diamonds re-snap to a randomly offset position for 2 frames every ~0.5 s. On rampage end, the dropout
probability decays 0.22 → 0 over 0.6 s so the picture *re-acquires* rather than snapping back.

---

## 4. Ground: districts, roads, junctions, lamps

### 4.1 District floor tints

Stage 1-3 keep **today's** tints — `downtown 0x717c88`, `suburbs 0x9a8a72`, `parks 0x5f7a5f`,
`sea 0x53687c`, `farms 0x7c8a52`, `hills 0x8a7a6a` over `bgColor 0x2a3240`.

The darkening is **Stage 4 and gated on measurement**, in this order and no other: build the light layer at
today's tints first, see how much of the effect comes free, *then* decide. If it goes ahead:
`downtown 0x5c6672`, `suburbs 0x7d7160`, `parks 0x4e6650`, `sea 0x445666`, `farms 0x677245`,
`hills 0x736659`, with `STORM_VIS.shadow.alpha 0.24 → 0.16`. **Re-run `node scripts/obstacle-contrast.mjs`
and re-verify enemy silhouette contrast (`jet 0xb6c4d2`, `heli 0x9cae66`, `tank 0xb3a374`) before
committing.** The documented 0.06-0.09 effective-luminance band is an invariant; if the numbers refuse, keep
the current tints and let the light carry all the contrast. The chapter survives losing the darkening; it
does not survive losing enemy readability.

### 4.2 Roads — the marking family

`T.roadMinor` / `T.roadMajor` are stamped by `populateRoad` with a **non-uniform scale**
(`scale.set((cell*1.6)/ref, (half*2)/ref)` — x factor 0.48, y factor 0.34 minor / 0.62 major). **Anything
baked into the road tile is stretched by a different factor on each axis and by a different factor per road
class.** Circles come out as ovals, zebra bars come out at the wrong pitch. So:

**Into the carriageway tile (pre-compensated for the known constant aspect, and only shapes that survive
it):**
- asphalt base `0x33383f` (minor) / `0x2b2f36` (major), unchanged;
- **kerb line** both long edges, 2 px equivalent, `0x4a515b`;
- **wet crown sheen** down the centre, `0x8fa8c4` a 0.10 (a static overhead reflection of the storm sky —
  no dynamic sheen sprite; the full-field lightning flash already whitens it. `// ponytail:` accepted);
- **two darker wheel-polish bands** at ±0.45 half-width, `0x22262c` a 0.25;
- minor: dashed centreline `0xd8d4c8` a 0.55 baked at the corrected pitch;
- major: **double yellow** `0xdccf86`, two 2px lines 4px apart.

**Everything else becomes a separate, uniformly-scaled decal** on a new floor layer
`{ name: 'roadDecal', cell: 160, chance: 1.00, populate: populateRoadDecal }` which self-gates on
`roadAt` + `ROAD_VISIBLE_DISTRICTS` exactly like `populateRoad`: manhole disc `0x3a3f47` with 6 rim ticks,
patch-repair polygon `0x3d434b` (irregular 5-gon), storm-drain kerb slot pair, a faded turn arrow. One
decal per 160px cell, chosen by `cellHash(i, j, salt)` — **variation along a street is what stops a road
reading as a wireframe; one stamped tile is what got us here.**

### 4.3 Junctions — enumerated, not stamped

`ROAD_CELL = 30` and `ROAD_SPACING = 480`: a junction is ~16 road cells across on each axis, so "stamp a
crosswalk when `onV && onH`" would lay a dozen overlapping zebras on one junction. Do not do that.

Instead, **recover the road grid origin once per run** and enumerate junctions analytically:

```js
// latched in reset(run), beside roadSeed. roadAt's onV depends only on x, onH only on y.
function latchRoadOrigin() {
  let ox = 0
  for (let x = 0; x < ROAD_SPACING; x += 6) {                    // ≤ 80 probes, once per run
    const ra = roadAt(x, 1e6, roadSeed)                          // y far from any horizontal street
    if (ra.onRoad && ra.angle === Math.PI / 2) {                 // vertical street found
      const probe = roadAt(x + 4, 1e6, roadSeed)
      ox = x + (probe.onRoad && probe.dist < ra.dist ? ra.dist : -ra.dist); break
    }
  }
  /* same for oy, sampling roadAt(1e6, y) */
  roadOrigin = { x: ox, y: oy }
}
```

Junction centres are then exactly `(ox + m·480, oy + n·480)`. In a 1280×720 view that is **≤ 6 junctions**.
Each gets ONE composite sprite from a **pooled set of 8**, drawn from four baked variants
(minor×minor, minor×major, major×minor, major×major) **baked at true world size so they are never scaled at
all**:

- 4 approach **zebra crosswalks**: 7 bars, `0xd8d4c8` a 0.55, every 3rd bar at a 0.30 (worn);
- 4 **stop bars**, 3px, same white;
- a painted **turn arrow** on each major approach;
- 2 **manhole discs** in the box;
- on the major×major variant, a **stalled sedan slewed across the box** (from the car set, §6) — everyone
  fled.

### 4.4 Kerb lamps — the strongest "this is a city at night" signal available

Same enumeration trick. For each street line in view, place a lamp every **120 px** along the centreline,
offset to `half - 4` on the kerb side (alternating sides per index so a street is lit from both). Two
sprites per lamp, from a pooled set of **64**:

- a 3px **mast dot** `0x2f343c` on the floor layer;
- a **`T.lampPool` additive sodium pool**, `0xffb45a` at alpha **0.13**, 90 × 150 px with the long axis
  **across** the road, in the light layer.

Do **not** add an 8th `FLOOR_LAYERS` entry at a ~120px cell for this: `updateFloorLayer` already runs seven
nested i×j sweeps per frame and the road layer alone touches ~1000 cells at `cell = 30`. Enumeration is
exact, cheaper, and cannot drift off the grid.

### 4.5 District surfaces and landmarks

`T.districtGround` keeps its "bake white-alpha, let `floorTint` carry hue" contract. Changes:

- **parks** currently falls back to `T.blotches` — the same four soft radial blobs the body/pond/garden
  chapters use. **Replace with MOWN STRIPES**: alternating ~26 px bands at the field's own hashed row angle
  (reuse `farmRowSnap`'s shared-angle machinery), white a 0.10 / a 0.20 alternating. This is the single most
  recognisable overhead pattern that exists and it is one bake.
- **farms** keeps furrows and gains a **centre-pivot irrigation circle**: one 520 px pale ring arc
  (a 0.18) with a radial pivot-arm line, on the `big` layer, plus a headland turn-strip at field edges.
- **sea** gains a **container yard** on the `big` layer: a 4×9 grid of 14×9 px rectangles in six
  **saturated, un-tinted** hues — `0xc0392b`, `0x2e86c1`, `0xe0a800`, `0x2e8b57`, `0x8e44ad`, `0xd35400` —
  plus a riprap breakwater arm (chain of angular boulder polys). Tiny dense saturated rectangles against
  dark water is the highest detail-density-per-line-of-code in the whole redesign.
- **downtown** gains a **painted parking lot** on the `big` layer: two rows of 6 white bay stripes 8 px
  apart with one hatched loading bay, and **cars parked aligned to the stall angle** (see §6 — random
  rotation is the loudest tell that props were scattered by an algorithm rather than placed by a city).
- **hills** keeps `T.contour` and gains a **switchback dirt track** (a 3-segment zigzag ribbon, `0x6b5a44`).
- **suburbs**' lot furniture is baked into the house structure itself (§5).

Saturated accents (containers, pool water, chalk lines, crosswalk paint) must **bypass `tintMul(…,
floorTint)`**. Add a `litTint: true` flag to the prop kind, honoured in `applyPropKind`:
`s.tint = kind.litTint ? (kind.tint ?? 0xffffff) : tintMul(...)`.

---

## 5. Structures — the specific details to draw

**All six kinds are redrawn as TOP-DOWN PLANS.** They are currently side-view, upright, base-anchored
(`T.house`, `T.barn`, `T.silo`), which is why a house reads as "a box plus a triangle".

### 5.1 Three mechanical rules that apply to every structure

1. **Bake at ~3× on-screen size.** `syncObstacles` draws at `o.r * 1.9 / max(tex.w, tex.h)`, so a tower
   (`o.r` 21-32) lands at 40-61 px on screen. Draw on a 128 px canvas (→ 256 px texture at
   `resolution: 2`) so 4 px windows survive minification.
2. **THE SHADOW LAW.** Every structure and every floor prop in this chapter bakes its own cast shadow at
   **one constant offset for the whole region: `(+0.22 · size, +0.28 · size)`, `0x000000` at alpha 0.35**,
   drawn *first*, under the body. One light direction across the entire region is the cheapest, strongest
   "this is a photograph of a place" cue available. **It also shifts every prop's bounds and therefore every
   anchor** — this is exactly the v5.9.2 "the fuck is this?" bug class. Mandatory fix, in every shadowed
   bake:
   ```js
   g.rect(-R, -R, 2*R, 2*R).fill({ color: 0x000000, alpha: 0 })  // bounds keeper: symmetric bounds,
                                                                  // draws nothing, keeps ax/ay = 0.5
   ```
3. **Top-down plans are MASS-CENTRED, not base-anchored.** Add `topDown: true` to the affected
   `STRUCTURE_SKINS` entries; in `syncObstacles`' baked branch, `clumpA.position.set(0, 0)` for those
   (instead of `(0, o.r * 0.28)`), and `clumpB` becomes the **lot detail** tucked at the rim.
   `applyPropKind`'s `anchor.set(0.5, upright ? 0.9 : 0.5)` and `T.obFoot`'s rim-lands-exactly-on-`o.r`
   contract must be re-verified by eye after this change — that contract is what the sim actually tests.

### 5.2 TOWER — downtown, `o.r` 21-32, two variants

Roof deck `0x6d7480`, edge `0x2b3038`, parapet lip `0x878e99`.

- rounded-rect footprint, **two corners chamfered 10 px** (never a rubble blob), 1.6 px dark edge, 3 px
  inner parapet ledge line;
- **44 gravel flecks**, 1.5 px, `0x7d838d` a 0.5, at fixed-hash positions;
- **two HVAC units**: 22×14 and 16×11, `0x9aa1ab` on `0x3a4048`, each with **5 fin hairlines** and a 4 px
  fan disc with 4 blade ticks;
- **stairwell penthouse** 20×16 `0x848b96` with a 6×9 door slit `0x2a2f36` and its own cast shadow;
- **water tank**: r9 `0xb0a08a` on 4 leg ticks, with a 6-rung ladder strip;
- **antenna mast**: 22 px, 1.5 px stroke, **3 guy wires**, and a dark aviation-lamp bead `0x5a1a16` (the
  *lit* lamp is a separate pooled blink sprite, §7.4 — a blinking light is the one thing that cannot bake);
- **flank walls**: on the +x and +y sides, a 9 px parallelogram sliver `0x3c424c` carrying a **4 × 6 window
  grid** of 3×4 rects — **11 lit `0xffd08a`, 13 dark `0x1a1f28`**, with one full column dark (the stairwell
  core);
- **fire escape** on the +y flank: 4 diagonal ticks + 3 landing bars, 1 px `0x2f343c`;
- variant B: a **helipad** — white circle r16, 2 px stroke a 0.7, plus an 'H' of three bars — no water tank,
  three HVAC units, and a different lit-window pattern (7 lit). Two variants is how "window flicker" is
  faked with zero per-frame `Graphics`.

### 5.3 HOUSE — suburbs, `o.r` 11-16, two variants + the lot

Roof slopes `0x8a5c46` (lit) and `0x7a4e3b` (shaded), ridge `0x5f3c2d`.

- **hipped roof**: 62×44 rect with 4 hip diagonals meeting a 22 px ridge line — two tones for the two
  facing slopes;
- **6 shingle course hairlines per slope**, `0x000000` a 0.15;
- 2 px ridge cap; 1 px **gutter line** `0xb9ae9c` along both eaves; a **downpipe tick** at one corner;
- **chimney** 9×9 `0x8f7a68` with a 3 px dark flue and **its own cast shadow crossing the roof**;
- **dormer** with a lit 6×6 pane `0xffd08a` and a 1 px frame cross;
- **skylight** 7×5 `0x9fc3d8` a 0.6;
- **garage wing** 24×18 whose door faces the driveway, drawn with **5 horizontal panel lines**;
- **the lot, baked into the same texture**: a driveway strip 12×26 `0x9a958a` running to the rim, a lawn
  rect `0x4e5f42` a 0.3, an L of hedge (7 lobes), a 10×10 shed with its own mini ridge, a rear deck of
  **7 plank lines**, two bin rects 4×6 (`0x2e6f4a`, `0x2b4a7a`), a hose loop;
- variant B swaps the lawn for a **kidney pool**: 18×12 `0x2f6f9e` (`litTint`, so it stays chlorine-blue on
  any floor), white coping 1.5 px, a ladder tick, one highlight crescent;
- a 2 px **porch lamp dot** `0xffd08a`.

### 5.4 BARN — farms, `o.r` 16-22

- **gambrel roof** as a long rect with a ridge line and two hip breaks, `0x9c3f30` lit / `0x74302a` shaded;
- **9 vertical batten seams** across the slope + a ridge cap and a white-painted ridge-vent line;
- one **rust patch** polygon `0x7a4a2c` a 0.5;
- **cupola** square at ridge centre with a weathervane cross;
- the big **X-braced hay door** on the gable end, `0x2e1a14`;
- **attached paddock**: fenced rect with **8 post ticks**, a churned muck patch `0x5a4a34`, and 3 hay-bale
  discs with end-spiral lines along the flank;
- a **mud track** curving from the door toward the field.

### 5.5 SILO — farms, `o.r` 16-22 — the one circular footprint in the field

- true circle from above, galvanised `0xc7c9cc` — deliberately the **brightest object in a farm belt at
  night**;
- **conical cap as 16 radial facet lines converging on an OFF-CENTRE apex** — the off-centre apex is the
  entire reason it reads as a cone and not a disc;
- **4 ring seams** (corrugated sheet bands), 1 px, a 0.35;
- **ladder cage down one flank**: 2 rails + **9 rungs**;
- a horizontal **auger/chute arm** reaching toward the barn, with a small hopper box;
- an offset hatch square on the cap;
- a **pale fan of spilled grain** `0xdcc98a` a 0.4 at the base.

### 5.6 PIER — sea, `o.r` 11-16

- deck of **14 alternating board lines** with **3 actual GAPS through which the dark water shows** — a hole
  in the fill, not a dark line. That is the detail that sells wood over water;
- **6 piling circles** poking through the deck, each with a soft dark halo in the water;
- **4 mooring bollards** with a coiled rope loop (two nested arcs) over two of them, and one cleat T-glyph;
- a small **crane rig** at the head: mast + jib + a hanging hook line;
- a **shack** with a corrugated roof of **9 parallel ridge arcs** and one lit lantern square `0xffb45a`;
- a **hanging tyre fender** on the flank;
- one **moored dinghy** with a baked static V-wake, and two parallel **wave-crest lines** along the base.

### 5.7 TREE — parks, `o.r` 8-13

- canopy of **6 overlapping lobes** with a scalloped 12-point radial edge (never a smooth circle), two tones
  `0x7f9a6a` (moonlit top) / `0x3d4c36` (underside);
- **6-8 hairline branch spokes** visible through the gaps between lobes;
- a visible dark **trunk dot** at the centre of mass;
- the shared offset **cast shadow ellipse** — that offset, identical to every tower's and every house's, is
  what makes the field read as one lit place.

### 5.8 OUTCROP — hills, `o.r` 8-13 (new bake; see §8, kill list item 7)

- faceted boulder with **3 flat facet planes at differing luminance**;
- a **lichen speckle** of 12 tiny `0x7f8f6a` dots on the lit facets only;
- a **scree tail** of 5 chips fanning downslope, in the shadow direction;
- a downslope shadow skirt so it sits *in* the terrain, not on it.

### 5.9 RUINS — one baked ruin variant per kind (Aftermath's best idea, at the same cost as a scar)

Swapped in permanently at the crush site by the ledger (§7.5). Keyed by **world position**, not obstacle
identity — the obstacle is gone from `run.obstacles` by then.

| kind | ruin |
|---|---|
| tower | broken foundation slab with **3 stepped exposed floor-plate edges**, a rubble cone of 5 angular chunks, **4 bent rebar hairs**, one surviving corner column, a scorch ring |
| house | splintered timber X's, **a SURVIVING CHIMNEY STACK**, a spray of loose shingles, a flattened car |
| silo | a **split cylinder wall arc** plus a **pale fan of spilled grain** |
| barn | roof collapsed into a **V**, hay strewn **downwind along `STORM_VIS.windAngle`** |
| pier | a raft of floating planks and an **iridescent oil-slick ellipse** |
| tree | a snapped stump with a pale splintered crown ring and scattered branches |

All six also stamp the universal **foundation scar**: the footprint as a dark slab `0x0e1116` a 0.5, with 6
snapped rebar ticks and a chipped edge.

---

## 6. Vehicles — "you must be able to tell a bus from a sedan"

That sentence is literally the brief. Three silhouettes from **one bake set**, replacing `T.car` (the City
chapter's yellow traffic taxi, baked from `TRAFFIC_CAR_LEN = 150`) for skies use:

- **sedan**, 26 × 12: roof panel with a **highlight streak**, **windshield and rear-screen trapezoids** in
  dark glass `0x1e2733` a 0.85, **4 wheel rects** 4 × 2.5 `0x15181c` peeking at the corners, **2 mirror
  nubs**, 2 tail dots `0xff5545`, 2 headlight dots `0xfff6d0`, 2 panel seams;
- **van**, 32 × 13: longer roof, **no rear screen**, a sliding-door seam, a 5 × 4 roof vent;
- **bus**, 54 × 14: **6 window bays per flank**, a roof hatch pair, a destination board at the nose, a
  double-door seam, 6 wheels.

Body tints (`litTint`): `0x8f97a3`, `0x6f7f8f`, `0xa8a094`, `0x7a5b52`, `0x4f6b78`, `0x8a8f7a`. Deliberately
desaturated — the saturated hues in this chapter belong to the threats and the container yard.

**Parked cars align to the kerb angle or to the painted stall angle. Never random rotation.**

---

## 7. The light layer — the chapter's identity

### 7.1 Structure

```js
const lightLayer  = new Container()
const lampSub     = new Container()   // all T.lampPool sprites  → one texture, one batch
const coneSub     = new Container()   // all T.lightCone sprites → one texture, one batch
lightLayer.addChild(lampSub, coneSub)
world.addChild(floorLayer, cloudShadowLayer, lightLayer, entitiesLayer)  // light cuts through cloud shadow
```

**`blendMode` appears nowhere in render.js today — additive is a new concept for this file, and it is a
correctness requirement, not a perf note.** Every child of `lightLayer` sets `blendMode = 'add'`, and each
sub-container draws from exactly ONE texture, or Pixi v8's batcher breaks on every blend-mode/texture
transition. Two sub-containers = two draw calls. `lightLayer.visible = chapterHasStorm`.

### 7.2 Searchlights — the hook

**At most 5 live cones.** Each anchors to a real, crushable structure: the nearest obstacles within 900 px
whose `o.kind ∈ {tower, silo, pier}`, chosen **deterministically by `o._cell`** (sort by
`roadHash(cell)`) so the set does not flicker frame to frame.

- cone: `T.lightCone`, 900 px long, 26° arc, `0xdfefff`, additive;
- sweep: render-local phase, ~0.35 rad/s, ±1.1 rad about a per-anchor hashed bearing;
- **LOCK**: when the wedge test contains the player — sweep stops, cone tracks the player, alpha 0.30 →
  0.42, a hard 1 px rim line `0xffffff` a 0.5 down both cone edges, and a **klaxon ring**
  (`T.klaxonRing`, `0xff3b30`, two concentric expanding rings, 1.2 s period) pulses from the anchor;
- **DEATH**: crush the anchor and the cone dies mid-sweep. Render already receives
  `{type:'crush', x, y, kind}` and can read `run.obstacles`. **Zero sim change.** This is the whole hook:
  the light is a target.
- **HYSTERESIS (mandatory, or the headline system reads as a bug):** hold an anchor until it is crushed or
  leaves `OBSTACLE_DROP_RADIUS` (1900). Fade cones in and out over **0.8 s**; never cut. Anchors must
  survive `run._obstacleRev` churn — key the anchor set by `o._cell`, re-resolve positions each rebuild.

### 7.3 Lightning reveal

`lightningFlashA > 0` also multiplies `lightLayer.alpha` by `1 + 2.2 * lightningFlashA` for the flash's
0.16 s, so a bolt momentarily reveals every structure silhouette and every cast shadow in view. One alpha
channel, free drama.

### 7.4 Blinking aviation lamps

The one element that cannot be baked. A fourth pooled sprite on the obstacle rig
(`root: ring + clumpA + clumpB + lamp`), 2.5 px `0xff3b30`, **only for `kind === 'tower'`**, alpha driven by
a render-local 1.4 s clock offset by `o._cell` hash so a skyline does not blink in unison. Worst case ~12
towers in view = 12 extra sprites and one alpha pass.

### 7.5 The crush ledger (one structure serves three features)

```js
const crushLedger = new Map()   // key: `${round(x/8)},${round(y/8)}` → { x, y, kind, t }
const LEDGER_CAP = 96
```

On `{type:'crush'}`: insert; if over cap, evict the entry farthest from the player (and always evict
anything beyond 2200 px). Cleared in `reset()`. **Never written back to `run`.**

It drives, in one pass: (1) the **ruin + scar sprites** (§5.9), pooled, ≤ 96; (2) the **lamp blackout** —
any kerb lamp within **220 px** of a ledger entry renders at alpha 0, so ploughing an avenue leaves a **dead
black corridor through a lit grid**; (3) the searchlight anchor invalidation.

---

## 8. What must NOT be reused — the kill list

Each of these is a concrete, currently-shipping reuse that the user called out. Removing them is not
optional.

1. **`updateStrafeLocks` uses `LIGHTNING.telegraph` for the jet lane** (render.js:4873) — the strafe lane is
   drawn in the *same electric blue as the bomb telegraph*. This is the literal bug in the report. The jet
   loses blue entirely (§3, jet row).
2. **The strafe telegraph reuses `lineCharge`'s band-and-chevrons shape** (render.js:4853 comment says so).
   Kill the filled band, kill the chevrons. Rails + travelling light pool.
3. **`redrawBombs` draws artillery and bombardment identically** because `run.bombs` has no discriminator
   (render.js:6103). Fixed by §1.1; the two must then draw through **separate drawers**, not one drawer with
   a colour swap.
4. **`crushBurst` reuses `T.fx.circle_05` + `T.fx.scorch_01` + `T.dot`** (render.js:5522) — the same two
   Kenney textures `explosionBurst` uses, just tinted grey, and the same soft dot as kill-poofs and pickup
   sparkles. Replace with **baked angular shards** (slab / roof-tile / plank quads with visible edges) and a
   baked low dust-skirt ellipse. Soft round particles are what makes a collapsing building read as a puff.
5. **Missile impact currently routes through `explosionBurst`'s orange `spark_04` fire burst.** Magenta star
   + black smoke ring instead, on the smoke pool.
6. **`T.foam = T.fx.trace_05`** (render.js:2815) — the sea district's breaking-wave prop *is the pond's
   current-streak sprite*, and `populateEdge` reuses it again for coastlines. Bake a real wave-crest
   (2 parallel crest arcs + a foam speckle band).
7. **`STRUCTURE_SKINS.rock = ['voxelRockA','voxelRockB','voxelRockC']`** (render.js:3468) — hills'
   *crushable structures* are the hills *floor-decor* boulders at a bigger scale. Give them the dedicated
   `outcrop` bake (§5.8).
8. **`STRUCTURE_SKINS.tower = ['rubble','rubble']`** — downtown's landmark building is literally the generic
   rubble prop, which is also downtown's floor debris. Draw a real tower (§5.2).
9. **`CLUTTER_BY_DISTRICT.suburbs` includes `{ name: 'car' }` = `T.car`**, the City chapter's yellow traffic
   taxi baked from `TRAFFIC_CAR_LEN`. Replace with the skies car set (§6).
10. **`T.districtGround` has no `parks` entry**, so parks falls back to `T.blotches` — the four soft radial
    blobs shared with body / pond / garden. Mown stripes (§4.5).
11. **`populateEdge` reuses `T.fence` for every land/land district border** — a picket fence between farms
    and hills. Use a hedge line for suburb/park seams, a dry-stone wall tick-row for farm/hill seams, and the
    new riprap+surf line for coastlines.
12. **`LIGHTNING.telegraph.color = 0x8fd8ff` must survive in exactly one drawer** — the sky bombardment —
    and its value moves to violet `0xc8b4ff`. Ice blue-white is searchlights now.

**One reuse is explicitly kept and justified:** `spawnArc`/`redrawArcs` (the elemental shock-arc pool) also
draws lightning bolts. A jagged glow-then-core polyline genuinely *is* a bolt; this is shared *machinery*,
not a shared *look*, and the two are retinted apart (violet vs the elements' own hues).

---

## 9. How we verify

Run in this order. Each item is a pass/fail a reviewer can execute.

1. **`npm test`** — `test/sim-test.js` must still print `ALL TESTS PASSED`. The `src`/`ox`/`oy` fields are
   additive; run CC.* (obstacle density) and DD.d (`STRUCTURE_KINDS.length === 6`) are the ones to watch.
2. **`node scripts/obstacle-contrast.mjs`** — every district's effective floor luminance stays in the
   documented 0.06-0.09 band, or the darkening (§4.1) is rolled back to whatever the audit permits.
3. **Grep audits** (each must return exactly one drawer):
   - `grep -n "0xc8b4ff\|LIGHTNING.telegraph" src/render.js` → sky bombardment only;
   - `grep -n "0xff6a10" src/render.js` → jet tracer only;
   - `grep -n "0xff2d6f" src/render.js` → helicopter missile only;
   - `grep -n "0xff3b30" src/render.js` → klaxon / aviation lamp / rampage alert only, never a telegraph;
   - `grep -n "0x4bffc8\|0xd8fff4" src/render.js` → player/rampage only.
4. **The six-freeze-frame test.** At difficulty 5 with 20+ tanks alive, pause (the pause modal draws a frozen
   world) on six separate frames, one per threat mid-telegraph. **A reviewer who has never played the chapter
   must be able to name each threat from the still image alone.** If they cannot, that threat fails.
5. **The greyscale test.** Convert those six stills to greyscale. Each must *still* be identifiable — from
   shape and composition alone. This is what proves the separation is not carried by hue.
6. **The motion test.** Record 10 s at difficulty 5. Each incoming threat's **arrival clock must visibly
   complete on the frame damage lands** — the light pool reaches the lane end as the jet starts its run, the
   hatched hand hits 360° as the shell lands, the chevrons touch ground at `fuse = 0`, the bead reaches the
   diamond at launch. A clock that finishes early or late is a bug.
7. **The mass-read test.** With 4+ sky strikes and 3+ tank shells live simultaneously: the sky marks must all
   be *parallel*, the tank marks must visibly *radiate from scattered ground origins*. Screenshot both.
8. **Collider fidelity.** After the top-down redraw, confirm `T.obFoot`'s rim still lands exactly on `o.r`
   for every kind, and that no structure sprite visibly sits off its footprint — the v5.9.2 regression.
9. **Phone frame time.** Chrome DevTools performance trace on a mid-range device, in downtown at difficulty
   5, storm active, 5 searchlights live: sustained ≥ 55 fps. If not, the searchlight count is the first knob
   (5 → 3), then the lamp spacing (120 → 180), then the darkening is abandoned.
10. **Flash budget.** Confirm no two full-field flashes within 0.9 s, and that the rampage bloom and the
    lightning flash never co-render, by instrumenting `triggerLightningFlash` with a temporary counter.

---

## 10. Ship order

Each stage is one commit, independently shippable and bisectable.

| Stage | Contents | Why this order |
|---|---|---|
| **0** | bombs `src`/`ox`/`oy` + `state.js` doc + smoke pool split + flash budget | Nothing downstream works without it |
| **1** | **The six threat signatures** (§3) + shadow-stroke rule + LOD + palette laws | Cheapest work in the plan and it alone answers "everything looks the same" |
| **2** | Structure redraws (§5) + the shadow law + ruins (§5.9) + material crush dust | The "not simple squares and lines" complaint |
| **3** | Ground (§4): road decal family, enumerated junctions, district surfaces, car set | Makes the region read as a place |
| **4** | Light layer (§7): lamp pools, searchlights, blackout, lightning reveal, **then** the darkening gate | The identity — and the one stage with a measurement gate |
| **5** | Rampage as regime change (§3, rampage row): plates, heartbeat ring, red flip wave, jamming | Loudest last, and it depends on stages 1 and 4 existing |

---

## 11. What we are NOT doing, and why

Stated honestly, because each of these was proposed by a judge or a losing direction and each is a real loss.

- **No persistent fires and no smoke plumes** (Aftermath's headline). Warm orange plumes are big, soft,
  always-on and drift over the field — in the one chapter where six things can attack at once, they sit
  directly on top of artillery's fireball and the tracer stitch. The mitigation Aftermath itself proposed
  ("cap at 12, alpha under 0.2, render below telegraphs") is an admission that the feature must be
  suppressed until it stops being the feature. Cut outright, not deferred.
- **No emergency vehicles.** "Drive the `roadAt` centrelines toward your latest ruin cluster" is a
  pathfinder in `render.js`: `roadAt` is a point query with no graph, so following a street means a
  per-frame probing walker per vehicle. It was presented as "pure render, zero sim" and is the largest
  unscoped system in any proposal. The *stalled* sedan at major junctions (§4.3) delivers a fraction of the
  same beat for one bake.
- **No block plates.** `ROAD_SPACING`-sized (~440 px) textures × 4-6 variants × 6 districts at
  `resolution: 2` is on the order of 100 MB of GPU texture — a straight OOM on a mid-range phone. They also
  cannot be aligned: `FLOOR_LAYERS` is a fixed i/j grid and `config.js` keeps the per-seed road offset
  private. §4.3's junction enumeration recovers the origin instead, which is what the plates actually needed.
- **No district weight cut.** Aftermath proposed demoting sea/hills/parks/farms to refocus on downtown. That
  regresses the procedural-districts feature shipped five commits ago (v5.7.3). The user asked for
  better-looking art, not less region variety.
- **No hairline phosphor / HUD register** (Fire Control's whole visual layer). Graduated tick strips, corner
  brackets, dashed designation lines and diagonal hatch answer "I don't want simple squares and lines" with
  *more* abstract vector chrome, over a game whose other six chapters speak in soft filled organic shapes.
  Its *engineering* is grafted in full (§1.1, §2, §3, §3.2); its *look* is not. The two survivors of that
  register — artillery's hatch and the square brackets — are deliberately confined to exactly one threat
  each, sit on a naturalistic ground, and are baked, not drawn.
- **No per-structure survey micro-bracket.** It is the best scale device anyone proposed, and it needs a
  fourth pooled sprite on every one of ~40 streamed obstacles plus a per-frame alpha pass, for an effect that
  is invisible individually. Revisit after Stage 5 if the frame budget allows; the aviation lamp (§7.4)
  already claims that fourth sprite slot for towers.
- **No civilian dots.** They ship today (`crushBurst`'s "fleeing figures"). They edge into a darker register
  than this game's kawaii tone, and the lights-going-out beat carries the same implication better and
  abstractly. Remove them with the `crushBurst` rewrite.
- **No dynamic wet-asphalt sheen sprite.** The sheen is baked static into the road tile; the existing
  full-field lightning flash already whitens it. A per-road-cell additive sheen sprite would be ~1000 extra
  sprites at `ROAD_CELL = 30`. `// ponytail:` — revisit only if the road layer is ever coarsened.
- **No new PNG assets and no image generation.** Every mark in this document is hand-drawn vector via
  `Graphics`, baked once, pooled as sprites — the codebase's non-negotiable constraint, and, as the tower's
  window grid and the pier's plank gaps show, not a limiting one.
- **No sim rebalancing.** Apart from §1.1's three additive fields, every number in `sim.js` and every
  balance constant in `config.js` is untouched. This is an art pass; if it changes how hard the chapter is,
  something has gone wrong.
