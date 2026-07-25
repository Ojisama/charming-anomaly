# Skies redesign v2 — "The city arrives intact and leaves as rubble"

**Date:** 2026-07-25
**Chapter:** `skies` (config.js `CHAPTERS.skies`)
**Status:** design, pending implementation plan
**Supersedes (extends, does not replace):** `2026-07-20-skies-storm-redesign-design.md`

## Problem

The July 20 redesign shipped (v5.6.17 → v5.7.5) and it worked: the storm, the
lightning, the Voronoi districts all landed. But it fixed the chapter's *look*
under a hard "**zero sim change**" constraint, and the constraint is now the
thing in the way. The kaiju fantasy is a verb — *you crush what is under you* —
and a verb cannot be a render change.

What's actually wrong, verified against the code:

1. **You are smaller than the debris, and it blocks you.** `PLAYER.radius` is 22
   (config.js:26). Skies obstacles are radius 30–60 (config.js `CHAPTERS.skies.obstacles`).
   `stepObstacles` (sim.js:1170) hard-shoves the player out of every one of them.
   A 60-metre monster is being stopped by a pile of concrete.
2. **The city is already destroyed when you arrive.** The floor is rubble, the
   props are rubble, the obstacles are named "building rubble". You tour an
   aftermath someone else authored. The fiction claims *you did this*; the game
   only ever shows the after picture.
3. **Nothing gives way underfoot.** No destructible anything exists in the
   codebase (`grep -n "crush\|stomp\|destructib" src/*.js` → zero hits outside
   colour-channel comments).
4. **No scale read.** Enemies are the player's size class. Jets and helicopters
   fight at 420px / 180px standoff — that is dogfighting between peers, not
   insects harassing a monster.

The three skies weapons (roar, tail swipe, debris toss) are *right* and are not
touched here. The missing weapon is the one a kaiju uses most: its feet.

## Decision (locked with the user, 2026-07-25)

Four axes, chosen:

| Axis | Chosen |
|---|---|
| Scale | **Shrink the world** — player radius unchanged; structures/enemies/props smaller and denser |
| Crush reward | **Rampage meter** — crushing fills a bar; full bar = timed buff |
| Enemies | Keep the roster, **add a fleeing-civilian layer** |
| Procgen | **Structures in the existing hashed streaming grid** (reuse `streamObstacles`) |

**Assumption flagged:** the civilian option was offered as an additive layer "on
top of either" roster direction, and was chosen without naming a base. This spec
assumes the base is **keep jet/helicopter/tankColumn, retune only** — the cheaper
of the two, and it gives a clean contrast (civilians pop underfoot, tanks do
not). If the intent was static gun emplacements instead of mobile tank columns,
say so and §6 changes; nothing else in this spec depends on it.

### Thesis

**The city arrives intact and leaves as rubble, and you are what did that.**
Rubble stops being the chapter's starting texture and becomes its *output* — the
trail behind the player is the scoreboard.

### What this costs that the last redesign refused to pay

The July 20 spec's proof obligation was "`npm test` passes **unchanged**". That
promise is now deliberately retired. This work adds sim state (`run.structures`
hp, `run.rampage`, `run.civilians`) and sim steps. Every **existing** scenario in
`test/sim-test.js` must still pass unchanged — that remains the regression
guarantee — but new scenarios are added alongside them.

---

## 1. The scale flip — shrink the world

The player stays `radius: 22`. This is the whole reason to pick "shrink the
world" over "grow the hitbox": every bomb, missile, contact-damage and weapon
range number in the game keeps its meaning, so there is no chapter-wide
rebalance pass hiding inside this work.

Everything else in the chapter shrinks and multiplies:

| | today | redesign |
|---|---|---|
| structures | 13 obstacles, r 30–60, ≤1 per 420px cell | r 10–28, ≤1 per **160px** cell — a dense skyline you tower over |
| enemy drawn size + sim radius | 1.0× | ~0.55× via a chapter `enemyScale` knob |
| props (mid/detail layers) | rubble chunks at chapter scale | intact city furniture, small |

### The load-bearing line

**Crushable structures do not push the player.**

`stepObstacles` keeps its enemy loop exactly as written — buildings remain real
terrain and cover for the air force's ground units — but the player loop skips
any structure flagged crushable. The kaiju walks straight through.

That single branch *is* the scale read. Everything else in this section is
dressing; a monster that can be stopped by a house is not a monster.

### New config surface

- `CHAPTERS[x].obstacles.cell` — per-chapter streaming cell size, defaulting to
  the existing `OBSTACLE_CELL` (420) when absent. Skies sets ~160. Density
  changes for skies alone; no other chapter's field moves by a pixel.
  The existing `count → per-cell probability` conversion in `streamObstacles`
  already divides by cell area, so density stays expressible in the same units.
- `CHAPTERS[x].enemyScale` — multiplies drawn size **and** sim `radius` at spawn.
  Applied in one place at enemy construction.

**Verify by hand, not by assumption:** shrinking enemy `radius` changes contact
damage (you must be closer to be touched) and may change `inSector` hit feel for
roar/tail swipe. Both are sector tests against enemy centres, so the effect
should be small — but it is a *feel* change and needs a play pass, not a
calculation.

---

## 2. Crushing

Structures are the existing streamed obstacle entries, given three new fields:

```
{ x, y, r, _cell,           // unchanged
  hp, kind, rampage }       // new
```

`kind` and its stats come from the **district the structure stands in** — the
Voronoi `district(x, y)` helper shipped in v5.7.x, which until now was
render-only. It becomes a shared pure function so sim can read it too. (It has
no Pixi dependency by construction; the July 20 spec required that so it could
be self-checked.)

| district | structure | crush HP | feel |
|---|---|---|---|
| downtown | tower block | high | you lean into it, it resists a beat, then it goes |
| suburbs | house / car / fence | low | pops underfoot |
| parks | tree / kiosk | 0 | pops instantly |
| sea | — | — | open water, nothing to crush |

### `stepCrush(run, dt)`

Any structure whose circle overlaps the player takes `CRUSH_DPS * dt`. At ≤ 0 it
**breaks**:

- push `{ type: 'crush', x, y, kind }` onto `run.events` — render draws a dust
  burst + collapse, `SFX_FOR_EVENT` maps it to a new `crush` sound
- drop XP through the existing `run.gems.push({x, y, xp})` path (sim.js:1599)
- add its `rampage` value to the meter (§3)
- release civilians (§4)
- record `_cell` in `run._crushed` so streaming never resurrects it
- leave a permanent flattened-rubble decal

`streamObstacles` gains one guard: skip any cell present in `run._crushed`. The
hash-based determinism is untouched — a crushed cell is simply masked out.

**Decal positioning:** render draws the rubble decal from `run._crushed` alone.
A cell key is `"i,j"`, so the decal's position is the cell centre — good enough,
and it means the decal survives the structure object being dropped past
`OBSTACLE_DROP_RADIUS`. Walk away and back and the wreckage is still there.

**Two streaming details the implementer must not trip over:**

- The in-cell jitter slack is `Math.max(0, cs/2 - r - 20)`. At `cs = 160` and
  `r ≤ 28` that is ≥ 32px — still positive, so structures still jitter within
  their cell rather than snapping to a visible grid. Do not raise `maxR` past
  ~50 at this cell size or the slack collapses to 0 and the city becomes a
  lattice.
- `obstacles.minDist` is currently 240, which keeps a clear ring around the run
  origin. At the old sparse density that was a courtesy; at the new density it
  is a conspicuous bald patch in the middle of a dense city. Drop it to roughly
  one cell (~160) — enough that nothing materialises on top of the spawn, not so
  much that the player starts in a crater.

> `// ponytail:` `run._crushed` is an unbounded Set of `"i,j"` strings. A 5-minute
> run at a few crushes per second tops out in the low thousands of short strings —
> nothing. Cap or LRU it only if run length ever grows enough to matter.

---

## 3. Rampage meter

`run.rampage` runs 0 → 1. Crushing adds to it. **It decays continuously** at
`RAMPAGE_DECAY` per second.

The decay is the design. A bank you fill at leisure rewards patience; a streak
that bleeds unless you keep wrecking rewards *momentum* — which is the kaiju
verb, and which is the thing that gets a survivors-like player to stop kiting in
open ground and detour into a dense block. That detour is the entire reason to
put a city under this genre.

At 1.0 → **RAMPAGE** for `RAMPAGE_DURATION` seconds:

- every structure crushes **instantly**, HP ignored
- player speed × `RAMPAGE_SPEED_MUL`, damage × `RAMPAGE_DMG_MUL`
- the meter drains to 0 across the duration, then resets to normal accumulation

**HUD:** one bar under the HP bar in `screens.hud` (ui.js:610), mutated in place
by `updateHUD` like every other HUD element. Hidden on every chapter whose config
has no `crush` block — so it costs other chapters nothing but a falsy check.

**Render:** player glow ramp + a screen-shake pulse on entry.
**Audio:** reuse the roar sfx pitched down; no new synthesis needed.

All tuning (`CRUSH_DPS`, `RAMPAGE_DECAY`, `RAMPAGE_DURATION`, the multipliers,
per-`kind` HP and rampage values) lives in config.js as named exports. No magic
numbers in sim.js — house rule.

---

## 4. Fleeing civilians

The laziest spawn rule available is also the best one: **a crushed building
releases the people inside it.** No separate spawner, no crowd streaming, no
density tuning.

```
run.civilians[i] = { x, y, vx, vy, t }
```

No HP. No damage. No collision with anything. They steer radially away from the
player, pop when they enter the crush radius, and despawn past the obstacle drop
radius or after `CIVILIAN_LIFE` seconds. Hard-capped at `CIVILIAN_MAX`.

Popping one pushes `{ type: 'squish', x, y }`, adds a small amount of rampage,
and drops a tiny XP gem.

The loop this creates: **crush a house → four dots scatter → chase them down →
meter jumps → rampage → every building pops instantly → more dots.** A
self-contained kaiju power fantasy for the price of one small array and one
steering function.

Deliberately *not* built: ambient crowds wandering the city independent of
crushing. It needs its own streaming and density rules and the release-on-crush
rule already carries the fantasy. Add it only if the city feels empty in play.

---

## 5. Background, districts and assets

The storm overlay (v5.6.18), lightning re-theme (v5.7.2) and Voronoi districts
(v5.7.x) all **stay**. They are good and they shipped. The districts get
*promoted*: they now decide which structure a cell rolls, not only how the floor
is tinted.

What changes is the ground's state — from wrecked to intact:

- **downtown** — asphalt, road markings, intact block footprints
- **suburbs** — lawns, driveways, fences
- **parks** — grass, tree stands
- **sea** — water, unchanged (still visual-only; no swim, no slow)

New baked-vector props, hand-drawn in render.js exactly as every other chapter's
looks are made: tower block, house, car, fence, tree, kiosk, a flattened-rubble
decal, and a civilian dot. Crush dust reuses the existing Kenney `circle_05` and
`scorch_01` textures.

The art-pipeline decision is inherited unchanged from the July 20 spec: **flat
baked vector, not generated art.** That spec's ComfyUI recon still applies — the
plumbing is reusable but the style engine is painterly, and matching outline
weight and palette across a prop set by hand is the expensive part regardless.

---

## 6. Enemies

Keep `jet` / `helicopter` / `tankColumn`. They are already flavoured correctly
and the roster is not the problem. Let the **contrast** carry the new idea:
civilians pop underfoot, tanks emphatically do not. The ground now offers two
classes of thing — one that rewards stepping on it, one that punishes it.

Retunes for the shrunken scale:

- **Jets** — drawn tiny, and spawned in **flights of 2–3 on a shared bearing**.
  This is a spawn-side change only; `strafe` already does bank-then-run
  (sim.js:765) and its behaviour is untouched.
- **Helicopters** — **leave `MISSILE_STANDOFF` at 180.** It is tempting to push
  them further out "so you have to close", and that is a trap: v5.6.15 lowered it
  from 300 to 180 precisely *because* 300 sat outside every skies weapon's reach
  (roar L1 ≈ 216 including body, tailSwipe 200 — see config.js:1882), which made
  the chapter's entire air wing unkillable. Raising it re-creates that bug.
- **Tank columns** — unchanged. They are the reason you cannot simply walk in a
  straight line through the city.

The `bombardment` signature stays exactly as-is. "The sky is shelling you" is
directly on-message for *flying stuff attacks you*, and it has been lightning-
themed since v5.7.2.

---

## 7. Determinism & testing

`district(x, y)` must stay a pure, Pixi-free function now that sim reads it —
this was already a design requirement in the July 20 spec and is now load-bearing
for testability.

Everything added here lives in sim.js, config.js and state.js, so all of it is
reachable by `test/sim-test.js`. New scenarios, in the file's existing plain-node
assert style:

1. A structure overlapping the player loses HP and breaks; its cell lands in
   `run._crushed` and `streamObstacles` never re-rolls it after a walk-away and
   walk-back.
2. A crushable structure does **not** displace the player, while an enemy walking
   into the same structure still gets pushed out.
3. `run.rampage` decays without input, triggers at 1.0, applies its multipliers,
   drains across the duration, and resets.
4. A civilian spawns on a crush, steers away from the player, pops inside the
   crush radius, and the population respects `CIVILIAN_MAX`.

**Regression guarantee:** every pre-existing scenario in `test/sim-test.js`
passes unchanged. New sim steps must not consume from the shared `Math.random`
stream at step time — the same rule `streamObstacles` follows (pure hashes only),
or every seeded scenario downstream shifts. This has bitten the project twice
already (noted at sim.js:1112).

**Visual verification:** seed a save to force the chapter, per the recipe in the
July 20 spec (`localStorage['charming-anomaly-save-v1']` must include a `shop:{}`
key or `loadMeta` silently falls back to a fresh save; set `meta.chapter='skies'`
and click Play without touching the carousel). Capture: an intact block, the same
block after a rampage, the civilian scatter, and a full meter.

---

## 8. Build order

Each step is shippable on its own.

1. **Scale flip** — `obstacles.cell`, `enemyScale`, and the crushable-skip in
   `stepObstacles`. The dense small-city read lands here with no new systems.
2. **Crushing** — structure HP/kind from districts, `stepCrush`, `run._crushed`,
   the `crush` event, dust + rubble decals.
3. **Rampage meter** — sim state, HUD bar, buff, glow.
4. **Civilians** — release-on-crush, flee, pop.
5. **Art pass** — intact district props, replacing the rubble skins.

Steps 1–2 alone deliver the headline ("I walk through buildings and they fall").
3–4 add the loop. 5 makes it look like a city instead of a quarry.

## Out of scope

- Growing `PLAYER.radius` (explicitly rejected in favour of shrinking the world).
- Sea swim/slow movement — still deliberately excluded, as in the July 20 spec.
- Ambient civilian crowds independent of crushing (see §4).
- Static gun emplacements replacing mobile tank columns (see the flagged
  assumption above).
- New weapons. Roar / tail swipe / debris toss are untouched.
