# Skies redesign v2 — "The city arrives intact and leaves as rubble"

**Date:** 2026-07-25 (rev. 2, after adversarial + ponytail review)
**Chapter:** `skies` (config.js `CHAPTERS.skies`)
**Status:** design, pending implementation plan
**Extends:** `2026-07-20-skies-storm-redesign-design.md`

## Problem

The July 20 redesign shipped (v5.6.17 → v5.7.5) and it worked: storm, lightning
and Voronoi districts all landed. But it fixed the chapter's *look* under a hard
"**zero sim change**" constraint, and that constraint is now the thing in the
way. The kaiju fantasy is a verb — *you crush what is under you* — and a verb
cannot be a render change.

Verified against the code:

1. **You are smaller than the debris, and it blocks you.** `PLAYER.radius` is 22
   (config.js); skies obstacles are radius 30–60. `stepObstacles` (sim.js)
   hard-shoves the player out of every one. A 60-metre monster is stopped by a
   pile of concrete.
2. **The city is already destroyed when you arrive.** Floor, props and obstacles
   are all rubble. The fiction claims *you did this*; the game only shows the
   after picture.
3. **Nothing gives way underfoot.** No destructible anything exists
   (`grep -n "crush\|stomp\|destructib" src/*.js` → only two colour-channel
   comments, render.js and :1520).

The three skies weapons (roar, tail swipe, debris toss) are right and are not
touched. The missing weapon is the one a kaiju uses most: its feet.

## Thesis

**The city arrives intact and leaves as rubble, and you are what did that.**

## Decisions (locked with the user, 2026-07-25)

| Axis | Chosen |
|---|---|
| Scale | **Shrink the world** — player radius unchanged; structures smaller and denser |
| Crush reward | **Rampage meter** — crushing fills a decaying bar; full bar = timed buff |
| Enemies | Keep the roster, **add a fleeing-civilian layer** |
| Procgen | **Structures in the existing hashed streaming grid** |

### What rev. 2 changed, and why

Rev. 1 of this spec was reviewed adversarially against the source and then for
over-engineering. Both passes hit the same section. The corrections are load-
bearing enough to state up front:

- **The density change in rev. 1 did nothing.** `streamObstacles` computes
  `prob = count · cs² / (π·OBSTACLE_FIELD_RADIUS²)` (sim.js) — obstacle
  count is *invariant under cell size by construction*. Changing `cell` 420→160
  and leaving `count` at 13 yields 58 live obstacles before and 58 after. Both
  numbers must move. See §1.
- **`enemyScale` was a sim knob bought for a visual read**, and it silently
  rebalanced the chapter. `e.radius` is an addend in ~12 hit tests, including
  all three body tests inside `inSector` (sim.js, :3179, :3184) — added
  deliberately in v5.6.3 (*"sector sweeps test the enemy's BODY, not its
  centre"*). Cut; render scales sprites instead.
- **`districtAt` already exists**, in config.js, already exported, already
  imported and tested by `test/sim-test.js`. Rev. 1's "it lives in render.js
  and must become shared" was wrong on all three counts. More importantly, sim
  reading `run._districtSeed` would violate a documented boundary
  (state.js, :621-623, config.js: *render-only, not a sim
  contract*, and drawn from the shared `Math.random` stream). §2 now derives
  structure kind from `obstacleCellHash` instead, so **sim never learns what a
  district is.**
- **Civilians, structure HP, `run._crushed` and the rampage stat multipliers are
  all cut.** Each bought less than it cost; §3–§4 explain.

**Assumption flagged:** the civilian option was offered as a layer "on top of
either" roster direction and chosen without naming a base. This spec keeps
**jet / helicopter / tankColumn unchanged**. If static gun emplacements were
wanted instead, say so — §6 changes and nothing else does.

### The constraint that is retired

July 20's proof obligation was "`npm test` passes **unchanged**". That is
deliberately dropped: this work adds sim state and sim steps. Every *existing*
scenario must still pass — but see §7, because that guarantee is much weaker
than it looks and needs new tests to mean anything.

---

## 1. The scale flip — shrink the world

The player stays `radius: 22`, and **no enemy's sim radius changes**. Enemies are
drawn smaller (a render-side draw scale on the skies chapter; render already
scales sprites and never touches `run`). Jets read as specks without a single
hit test moving.

Structures get smaller and genuinely denser — which takes **two** numbers:

| | today | redesign |
|---|---|---|
| `obstacles.cell` | 420 (the global `OBSTACLE_CELL`) | **260** |
| `obstacles.count` | 13 | **34** |
| `obstacles.minR / maxR` | 30 / 60 | **10 / 28** |
| live obstacles in drop radius | ~58 | **~150** |

`count` is a *density reference over a 900px-radius disc* (config.js), not a
live count — hence 34, not 150. At `cell: 420` the one-obstacle-per-cell rule
caps the field at ~64 live no matter what `count` says, so the cell **must**
shrink to reach 150; 260 is the largest cell that gets there, which keeps the
streaming scan at 169 cells (vs 81 today) instead of the 361 that `cell: 160`
would have cost.

New config surface: `CHAPTERS[x].obstacles.cell`, defaulting to `OBSTACLE_CELL`
when absent. Skies alone sets it; no other chapter's field moves a pixel.

**Jitter check:** in-cell slack is `Math.max(0, cs/2 - r - 20)` (sim.js). At
`cs: 260, maxR: 28` that is 82px — comfortably positive, so structures still
jitter rather than snapping to a visible lattice.

**`minDist`:** currently 240, keeping a clear ring around the run origin. At the
new density that is a conspicuous bald crater in the middle of a city. Drop it to
~160 — enough that nothing materialises on the spawn, not a starting hole.

### The load-bearing line

**Crushable structures do not push the player.** `stepObstacles`' player loop
skips them; the enemy loop is untouched, so buildings remain real terrain for
everything else.

This is safe *only because structures pop on contact* (§2). Rev. 1 gave them HP,
which would have made every structure a pocket where contact enemies are pushed
out and the player is not — a shelter every 260px, and "high HP" would have read
mechanically as "longer invulnerability." Instant pop removes the exploit by
removing the structure.

### Performance — the cost this section actually incurs

**Measured after implementation** (the estimates below were written before the
code existed; these are the real numbers): obstacles only *materialize* within
`OBSTACLE_STREAM_RADIUS` (1400) and are dropped at `OBSTACLE_DROP_RADIUS`
(1900), so the wandering steady state sits between the two figures. Today: 31
in the stream radius, 58 in the drop radius. Shipped: 82 and 152. A real
30-second wandering skies run settles at **102 live obstacles, against 31
today — 3.3×**, not the 2.6× estimated here. The `test/sim-test.js` density
guard asserts this band.

3.3× the obstacles hits three loops that have no spatial index (there is none
anywhere in sim.js — checked):

- **`stepObstacles`** (sim.js) is `enemies × obstacles`. At `MAX_ALIVE
  400` that goes 23k → 60k distance checks per frame. **Required mitigation:**
  both loops call `Math.hypot(dx, dy)` and compare against `minSep`; replace with
  `dx*dx + dy*dy < minSep*minSep` and only take the square root on the rare
  overlap branch. ~3× cheaper, and it is a strictly smaller diff than the code it
  replaces. This ships to phones; do not skip it.
- **`syncObstacles`** (render.js) rebuilds *every* obstacle whenever
  `run._obstacleRev` bumps, and calls `districtAt` + `districtTintAt` per
  obstacle — ~72 `hash01` calls each, every one of which does a `parts.join(',')`
  string allocation. config.js states the constraint outright: *"nowhere
  near a hot per-frame loop."* Crushing bumps `_obstacleRev` **every frame you
  are crushing**. **Required mitigation:** cache the district and tint on the
  obstacle the first time it is drawn (`o._skin`), so a rebuild reads a field.
- **`streamObstacles`** scans 169 cells instead of 81, and re-triggers every
  260px of travel instead of every 420px — ~3.3× total. Acceptable as-is.

---

## 2. Crushing

Structures are the existing streamed obstacle entries plus one field:

```
{ x, y, r, _cell,   // unchanged
  kind }            // new — 'tower' | 'house' | 'tree' | 'pier'
```

`kind` comes from **`obstacleCellHash(i, j, seed, 4)`** — a fifth salt on the
hash already used for position and radius (sim.js). Pure, deterministic,
consumes nothing from `Math.random` at step time, and **sim never reads
`run._districtSeed`**, so the render-only boundary documented at state.js
stays intact. Render maps `kind` × district to a sprite; sim does not know what a
district is.

### `stepCrush(run)`

Any structure overlapping the player is **destroyed immediately**:

- splice it from `run.obstacles` and bump `run._obstacleRev` (without the bump,
  render keeps drawing it until the next cell crossing — render.js)
- push `{ type: 'crush', x, y, kind }`; render draws collapse + dust, and
  `SFX_FOR_EVENT` maps it to a new `crush` sound
- drop XP via the existing `run.gems.push({x, y, xp})` path (sim.js)
- add to the rampage meter (§3)

No HP, no `CRUSH_DPS`, no per-district HP table, no partial-damage state.

> `// ponytail:` crushed structures are not remembered. Walk 1900px away
> (`OBSTACLE_DROP_RADIUS`) and back and the cell re-rolls its building. In a
> 5-minute run you rarely backtrack that far, and everything within the drop
> radius stays flattened, so the trail behind you reads correctly. Add a
> `run._crushed` cell-mask only if backtracking ever becomes common — it costs a
> Set, a streaming guard, and a decal system that must re-derive positions from
> `obstacleCellHash` salts 2/3 to avoid landing off-footprint.

### Two hazards this creates

- **XP flooding.** `stepLevelUp` (sim.js) fires **one level per frame**
  and hands control to a modal; leftover XP carries to the next playing frame.
  Crushing hundreds of structures during a rampage will queue back-to-back
  level-up screens at exactly the moment the design wants uninterrupted momentum.
  Structure XP must be small, and worth capping gem drops to every Nth crush.
- **Audio machine-gunning.** `main.js` plays one SFX per event with no dedup;
  `audio.js` throttles only `shoot`/`hit`/`zap`. `crush` must be added to that
  throttle set, and `gem` probably too.

---

## 3. Rampage meter

`run.rampage` runs 0 → 1. Crushing adds; it **decays continuously** at
`RAMPAGE_DECAY`/s.

The decay is the design: a bank you fill at leisure rewards patience, a streak
that bleeds unless you keep wrecking rewards momentum — the kaiju verb.

At 1.0 → **RAMPAGE** for `RAMPAGE_DURATION` s: **the crush radius widens** from
`PLAYER.radius` to `PLAYER.radius × RAMPAGE_CRUSH_MUL`. You flatten a swath
without touching it. The meter drains across the duration, then resets.

That is the entire buff. Rev. 1 also granted speed and damage multipliers; both
are cut. `p.speed` and `p.damageMul` are never assigned anywhere in sim.js —
they are set once in `createRun` and read through multipliers (sim.js, :1649,
:3003), so mutating them in place leaks permanently on re-trigger or on death
mid-buff. A widening crush radius is one number, cannot leak, and is the more
legible power fantasy anyway.

**HUD:** a bar under the HP bar. Note `screens.hud.innerHTML` is built **once in
`initUI`** (ui.js), before any chapter is chosen — so the bar's markup always
exists and only its visibility is chapter-gated. `updateHUD` (ui.js) is
dirty-checked against a `last.*` cache; the new bar must follow that pattern, not
write every frame.

**Render:** player glow ramp + a screen-shake pulse on entry.
**Audio:** the roar sfx, pitched down.

All tuning (`RAMPAGE_DECAY`, `RAMPAGE_DURATION`, `RAMPAGE_CRUSH_MUL`, per-`kind`
rampage gain) lives in config.js as named exports.

### Open tuning risk

At the target density, a player simply walking forward sweeps roughly 0.7
structures/s with no routing effort, because crushables no longer block them.
Whether the meter reads as a *choice* or as a function of holding a direction
depends entirely on `RAMPAGE_DECAY`, and that cannot be settled on paper. Tune it
in play, first thing after §3 ships; if it can only be permanently-full or
permanently-empty, the meter is the wrong shape and should become a straight
crush-combo counter.

---

## 4. Civilians — render particles, not entities

Crushed buildings emit a **puff of tiny fleeing figures as render particles**:
scatter radially, fade, no sim state. Zero entities, zero steering code, zero
collision, and it delivers the beat that matters ("there were people in there").

The full entity layer from rev. 1 is cut. It cost a new `run.civilians` array, a
steering function, lifetime/cap management, a sprite, an event and an SFX — and
it did not work:

- Its loop pointed **against** the rampage loop. §3's justification for the decay
  is that it makes you *detour into a dense block*; chasing civilians that "steer
  radially away" means, by construction, *leaving* the block.
- The flee rule is degenerate. Radial flight from a player at `baseSpeed 220` is
  either strictly slower (caught 100% of the time, no decision) or strictly
  faster (never caught, dead content). No speed produces a chase.

Revisit only with a flee rule that can actually be outplayed — herding, panicked
milling, or civilians who cluster and must be cornered.

---

## 5. Background, districts and assets

The storm overlay (v5.6.18), lightning re-theme (v5.7.2) and Voronoi districts
(v5.7.x) all **stay**, unchanged and render-only. What changes is the ground's
state: from wrecked to intact.

- **downtown** — asphalt, road markings, intact block footprints → `tower`
- **suburbs** — lawns, driveways, fences → `house`
- **parks** — grass, tree stands → `tree`
- **sea** — water; **gains crushable piers, boats and buoys** → `pier`

Sea is not a dead zone, and this is deliberate. Sea is **42% of the world** —
computed from the shipped weights at config.js: base weight 2/10, but
`DISTRICT_SEA_REGION_CHANCE = 0.32` of blocks apply `DISTRICT_SEA_BOOST = 6` for
90% sea inside them, giving `0.32×0.90 + 0.68×0.20 = 42.4%`. Sea is also
walkable. Left empty it would be a 42% rampage dead zone that doubles as the
safest kiting ground in the chapter — the meter's decay would have a huge,
always-available opt-out. Giving sea a crushable skin fixes that without touching
a single district weight.

New baked-vector props, hand-drawn in render.js as every other chapter's looks
are: tower block, house, car, fence, tree, pier/boat. Crush dust reuses the
existing Kenney `circle_05` and `scorch_01`. The art-pipeline decision is
inherited unchanged from July 20: **flat baked vector, not generated art.**

---

## 6. Enemies

**Keep jet / helicopter / tankColumn exactly as they are.** The roster is not the
problem, and both retunes proposed in rev. 1 were traps:

- **Helicopters — do not touch `MISSILE_STANDOFF` (180).** v5.6.15 lowered it
  from 300 *because* 300 sat outside every skies weapon's reach (roar L1 ≈ 216
  including body, tailSwipe 200 — config.js), making the entire air wing
  unkillable. The user called the chapter impossible and was right.
- **Jets — no flights of 2–3.** It is not the spawn-side change rev. 1 claimed:
  `_strafeBearing` is lazily initialised inside `stepStrafe` (sim.js), so
  sharing a bearing means changing that contract. And `jet` is `archetype:
  'fast'` → `wisp`, which is **55% of spawns** at t=260 (`WAVE_TABLE`,
  config.js). Multiplying the dominant late spawn 2–3× is a difficulty
  rewrite, and it re-attacks the exact v5.6.15 failure from the other side.

The chapter gets its new shape from the ground, not from the roster. Civilians
pop, tanks do not — that contrast is the design.

`bombardment` stays as-is: "the sky is shelling you" is directly on-message for
*flying stuff attacks you*, and it has been lightning-themed since v5.7.2.

### Known issue, deliberately deferred

`stepObstacles` pushes **every** enemy out of obstacles — the only exemption is
`e._phaseSolid === false` (beyond's flickers). Jets and helicopters are pushed
out of buildings *today*; at 2.6× density the air wing will jam against them
visibly, and `STRAFE_RUN_SPEED_MUL = 4.5` means a jet's pass gets radially
teleported by whatever it clips. The fix is a `flying` flag that skips the
obstacle push. It is genuinely out of scope here, but it will surface the moment
§1 lands — **watch for it during the §1 play pass** and file it.

---

## 7. Determinism & testing

Everything added lives in sim.js / config.js / state.js, so all of it is
reachable by `test/sim-test.js`. Nothing added may consume from the shared
`Math.random` stream at step time — pure hashes only, the rule `streamObstacles`
already follows. This has bitten the project twice (sim.js).

**The "existing tests pass unchanged" guarantee is nearly vacuous, and pretending
otherwise is how this regresses.** The suite cannot see this chapter:

- `test/sim-test.js` — the per-chapter balance band, *including the skies
  band*, runs `createRun(makeMeta())`, i.e. **the body chapter** (`// body
  chapter: no signature/obstacles skewing the clear`).
- `test/sim-test.js` — `makeStatusEnemy` hardcodes `radius: 16` and bypasses
  `spawnEnemy` entirely. Every skies flag test uses it.
- `test/sim-test.js` — `flagRun` sets `run.obstacles = []; run._obstacleSeed
  = null`. Every skies behaviour test blanks the obstacle field, so the density
  change is invisible to all of them.
- `test/sim-test.js` — the v5.6.15 invariant asserts `MISSILE_STANDOFF <
  WEAPONS.roar.levels[0].range`, comparing against `range` alone, not `range +
  e.radius`. It would have kept passing while `enemyScale` ate the body margin
  config.js calls load-bearing.

New scenarios must therefore build a **real skies run with a live obstacle
field**, not `flagRun`:

1. A structure overlapping the player is destroyed on contact, leaves
   `run.obstacles`, and bumps `run._obstacleRev`.
2. A crushable structure does **not** displace the player, while an enemy walking
   into the same structure still gets pushed out.
3. `run.rampage` decays without input, triggers at 1.0, widens the crush radius,
   drains across the duration, and resets — with no residual effect afterwards.
4. Structure `kind` is deterministic for a given `(cell, seed)` and independent
   of `run._districtSeed`.
5. Density: a real skies run at the new `cell`/`count` yields ~150 live obstacles
   in the drop radius, guarding against exactly the rev. 1 no-op.

**Visual verification:** seed a save per the July 20 recipe
(`localStorage['charming-anomaly-save-v1']` must include a `shop:{}` key or
`loadMeta` silently falls back to a fresh save; set `meta.chapter='skies'` and
click Play without touching the carousel). Capture an intact block, the same
block after a rampage, and a full meter.

---

## 8. Build order

1. **Scale flip** — `obstacles.cell` **and** `count`, `minR`/`maxR`, `minDist`,
   the render draw scale, the crushable-skip in `stepObstacles`, and the
   `Math.hypot` → squared-compare shrink. Dense small city, no new systems.
2. **Crushing** — `kind` from hash salt 4, `stepCrush`, the `crush` event, dust,
   the `o._skin` cache in `syncObstacles`, the SFX throttle.
3. **Rampage meter** — sim state, HUD bar, widening crush radius, glow.
   Then tune `RAMPAGE_DECAY` in play before going further.
4. **Art pass** — intact district props incl. sea piers, replacing rubble skins.

Steps 1–2 alone deliver the headline: *I walk through buildings and they fall.*

## Out of scope

- Growing `PLAYER.radius`, or any `enemyScale` sim knob (§1).
- `run.civilians` as entities (§4) — revisit only with an outplayable flee rule.
- `run._crushed` permanent crush record (§2 ponytail note).
- A `flying` flag exempting air units from the obstacle push (§6) — expected to
  surface during the §1 play pass.
- Sea swim/slow movement; still excluded, as in July 20.
- Static gun emplacements replacing tank columns (see the flagged assumption).
- New weapons. Roar / tail swipe / debris toss untouched.
