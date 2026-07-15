# Charming Anomaly — v1 Design

A mobile-first vampire-survivors-like rogue-lite. You are **Mochi**, a cute anomaly
escaped from a research lab, swarmed by security drones. Survive 5 minutes.

Decisions made with the user on 2026-07-14 (style picked from a live gallery):

| Decision | Choice |
|---|---|
| Theme | Charming Anomaly (cute escapee vs. lab drones) |
| Art style | "B1 — Cute Lab Pastel": kawaii squash-and-stretch blobs, cream lab tiles, soft shadows |
| Run length | ~5 min hyper runs, victory at 5:00 |
| Tech | Vite + PixiJS v8, plain JS, DOM overlay UI |
| Mobile | Floating virtual joystick (WASD on desktop), PWA on GitHub Pages |
| Scope | Minimal playable first; heavy meta roadmap after |

## Core loop

Joystick move → weapons auto-fire → kill escalating hordes → XP gems → level-up
(pick 1 of 3 upgrades) → coins drop and persist → die (run summary) or reach 5:00 (victory).

## v1 content

- **Character**: Mochi (mint blob). Base: 100 HP, 220 px/s, 5% crit ×1.5.
- **Weapons** (Lv1→5): Star Shooter (aimed projectiles), Orbit Sparks (orbiting orbs),
  Slime Wave (AoE nova). Start with Star Shooter; others join the level-up pool.
- **In-run passives**: Move Speed, Magnet, Max HP, Fire Rate.
- **Enemies**: Drone (chaser), Wisp (fast/frail), Tank (slow/beefy) + elite variants
  (5× HP, bigger, coin burst). HP scales with run time.
- **Meta shop** (permanent, localStorage coins): Damage, Fire Rate, Crit Chance,
  Crit Damage, Max HP, Move Speed, Magnet, Coin Gain — scaling costs. This is the
  RPG progression the user asked for.
- **Juice**: squash/stretch, hit flash, particles, damage numbers, screen shake,
  procedural WebAudio SFX (no audio assets).

## Architecture

Three cleanly-seamed modules so subagents can build in parallel:

- `src/sim.js` — pure simulation, no Pixi/DOM. `stepSim(run, input, dt)` mutates the
  run state and pushes events (`hit`, `kill`, `levelup`, …) consumed each frame.
- `src/render.js` — PixiJS draws the sim state: world camera, cute programmatic
  sprites, particles, shake. Reads state, never mutates it.
- `src/ui.js` + `styles.css` + `input.js` + `audio.js` — DOM overlay: title, shop,
  HUD, level-up modal, pause, summary; joystick; SFX.
- Ground truth shared by all: `src/state.js` (state shape, meta save/load) and
  `src/config.js` (all balance numbers), written first.
- `src/main.js` — glue: boot Pixi, tick loop, phase transitions.

World is unbounded; camera follows player; enemies spawn on a ring outside the view.

## Roadmap (post-v1, already requested)

More characters, unlockable weapons, castable spells, true familiars, a boss at 5:00,
weapon evolutions.

## Distribution

PWA (manifest + minimal service worker), auto-deployed to GitHub Pages via
GitHub Actions from `main` on a public repo.

## v2 addendum (2026-07-15)

### Rarity system

Level-up cards now roll a **rarity** (Normal/Rare/Epic/Legendary/Mythic, `RARITIES` in
`src/config.js`) with multipliers 1.0 / 1.6 / 2.5 / 4.0 / 6.5. `rarityWeights(level)`
shifts the roll toward high tiers as the player levels — Mythic is 0 at level 1 and
ramps in, Legendary and Epic likewise scale with level, Normal shrinks.

Weapons and passives use the roll differently, on purpose (hybrid model):
- **Weapons have an inherent rarity** (e.g. Boomerang is always Rare, Prism Beam is
  always Mythic) that gates *when* they can appear, not how strong they are — a
  weapon only shows up in a card slot when the rolled tier matches its rarity.
- **Passives have no inherent rarity**; a passive card *adopts* whatever rarity was
  rolled for that slot, and its bonus scales with the tier: `bonus = base × mult`.

`rollCard` walks down `RARITY_ORDER` from the rolled tier if that tier has no eligible
candidates (no matching weapon, and no passive under its 5-pick cap), so a slot never
comes up empty just because the dice landed on a tier nothing currently occupies. This
means low-level runs can still surface a Rare/Epic weapon slot via a passive, while
high-rarity weapons (Legendary Black Hole, Mythic Prism Beam) stay rare early and
become reachable as the run goes on. Cards in one pool never repeat an id.

### New weapons

Six weapons join the original three, each with its own inherent rarity, bringing the
equip cap to `MAX_WEAPONS = 4` (new weapons stop appearing in the pool once the player
already has 4 equipped):

- **🪃 Boomerang** (Rare) — flies out to `range` and back along the same path, hitting
  everything on the way both directions.
- **💣 Slime Mines** (Rare) — drops wobbly bombs (`maxAlive` cap) that detonate in a
  radius on contact.
- **⚡ Chain Zap** (Epic) — lightning arcs drone-to-drone up to `chains` hops within
  `chainRange`.
- **🔮 Homing Wisps** (Epic) — sparks with a `turnRate` that curve toward the nearest
  target and expire after `life` seconds.
- **🕳️ Black Hole** (Legendary) — opens a vortex for `duration` seconds that `pull`s
  enemies in and ticks damage.
- **🌈 Prism Beam** (Mythic) — a sweeping ray (`rotSpeed`, `width`, `length`) that ticks
  damage on everything it passes over.

All six follow the same 5-level cumulative stat table shape as the original three.

### Passive rework

Passives moved from flat per-pick bonuses to an **accumulated-bonus model**: each pick
still rolls a rarity and computes `bonus = base × RARITIES[rarity].mult` (rounded to
one decimal for `flat`-kind passives), but instead of a fixed per-level number the
bonus is added into `run.passives[id]`, and `run.passivePicks[id]` just counts picks
(capped at `MAX_PASSIVE_LEVEL = 5`) for display (`Lv N` tag) and eligibility. Net
effect: two picks of the same passive at different rarities stack their *actual*
rolled bonuses rather than both applying some fixed per-level value, so a lucky
Legendary/Mythic passive roll meaningfully outpaces a string of Normal rolls of the
same passive.

### Background redesign

Rejected: a visible tile grid over the play field — read as sterile/debug-looking and
fought the "cute lab" theme once the world scrolled past a couple of screens.

Shipped: an organic floor with no grid at all —
- Canvas-drawn radial-gradient "blotches" (soft green/sand/sage/blush) as translucent
  ground mottling, scattered deterministically per world cell via a hash function so
  the same cell always looks the same across sessions without storing anything.
- 16 tinted-white Kenney CC0 foliage PNGs (`src/props/`: bushes, clusters, flowers,
  grass, leaf, mushroom, reed, scatter) scattered on top the same way, pooled as
  sprites rather than recreated per frame. Attribution: Kenney (www.kenney.nl),
  CC0 — see `src/props/LICENSE-kenney-cc0.txt`; crediting is optional under CC0 but
  the license file is kept in-repo.
- Ambient dust motes drifting in screen space for parallax life.
- `entitiesLayer` (player/enemies/bullets/etc.) is hidden until `reset(run)` runs, so
  the title screen shows only the organic floor + idle layer, no gameplay entities.

### Test coverage additions

`test/sim-test.js` (plain Node, `npm test`) gained two runs on top of the original
movement/death/victory checks:
- **Run D** (`testNewWeapons`) — for each of the 6 new weapons, equips it alone at
  level 3, circles the player around enemies for 45s, and asserts kills > 0 and that
  the weapon's entity array (e.g. `run.mines`, `run.beams`) saw activity.
- **Run E** (`testRaritySanity`) — samples 200 fresh level-up pools each at player
  level 1 and level 12, asserts every card's rarity key is valid, checks the passive
  bonus formula (`base × mult`, flat rounded to 1 decimal) against every passive card
  seen, and asserts Mythic appears at level 12 and at least as often as at level 1.

## v4.0 addendum (2026-07-15) — run variety: mutators + elite affixes

### Mutators (`MUTATORS` in `src/config.js`)

Eight pre-run modifiers (Overtime Shift, Bulky Batch, Caffeinated Swarm, Elite
Convention, Unstable Physics, Glass Goo, Sticky Floor, Jumbo Anomalies), each a small
bundle of multipliers (`spawnMul`, `enemyHpMul`, `coinMul`, `playerDmgMul`, …) that
trade a buff for a drawback (e.g. Glass Goo: +35% player damage, +75% damage taken).
`mergeMutatorMods(ids)` is a pure helper that starts every key at 1 (neutral) and
multiplies in each selected mutator's `effects` — stacking mutators compounds their
effects independently rather than overriding. `createRun(meta, opts)` now accepts
`opts.mutators` (an array of ids); the derived `run.mods` object is computed once at
run start and read by `src/sim.js` at exactly nine fixed points (spawn rate, per-enemy
hp/speed/dmg/radius, elite cadence, contact damage taken, player outgoing damage,
player move speed, magnet range, xp/coin pickup value, and level-up element-card
weight) — see sim.js's module doc comment for the authoritative list.

A **Daily Anomaly** seeding scheme rides on top: `todayKey()` returns the player's
local `YYYY-MM-DD` date, and `dailyMutators(dateKey)` hashes that string (FNV-1a-style)
into a seed for a small mulberry32 PRNG to deterministically pick `DAILY_MUTATOR_COUNT`
(2) distinct mutator ids — same key always yields the same pair, so every player sees
the same featured mutators on a given day without any server or persisted state, and
the pick is independent of (never perturbs) the sim's own `Math.random()` stream.

### Elite affixes (`ELITE_AFFIXES` in `src/config.js`)

Elites now roll 1 random affix at spawn (2 distinct ones once `run.time >=
AFFIX_SECOND_AT`, so late-run elites compound two effects), stored on `enemy.affixes`
— always `[]` on non-elites, so every affix check in sim.js is guarded (`e.elite &&`
or `e.affixes &&`) to cost effectively nothing off the hot path for the common case:

- **🛡️ Shielded** — takes `SHIELD_DMG_MUL` (0.6×) damage while above `SHIELD_HP_FRAC`
  (50%) of max HP; the shield "breaks" below that threshold and it takes full damage.
- **🧬 Splitter** — death spawns `SPLITTER_COUNT` (4) wisps around the corpse (via a
  refactored `spawnEnemy(run, opts)` that now accepts `{ type, x, y, forceNormal }`).
- **💥 Volatile** — death arms a timed bomb (`run.bombs`, ticked by a new `stepBombs`)
  that detonates after `VOLATILE_FUSE` (0.8s), damaging the player and any enemies
  within `VOLATILE_RADIUS` and emitting the same `{type:'explode'}` event as a mine pop.
- **📣 Cheerleader (pacer)** — speeds up any other enemy within `PACER_RADIUS` by
  `PACER_SPEED_MUL` (1.3×).
- **⚓ Anchored** — immune to nova knockback (still takes the damage) and to black-hole
  pull entirely (still takes a hole's tick damage — only the pull loop skips it).
- **😤 Frenzied** — speeds up by `FRENZY_SPEED_MUL` (1.6×) once below `FRENZY_HP_FRAC`
  (30%) of max HP.
- **👑 Gilded** — spawns with `GILDED_HP_MUL` (1.3×) extra max HP and drops
  `GILDED_COIN_MUL` (2×) as many coins on death.

### Test coverage additions

`test/sim-test.js` gained two more runs on top of A–I:
- **Run J** (`testMutators`) — `mergeMutatorMods` defaulting/stacking math,
  `dailyMutators` determinism (two calls on the same date key match) and validity
  (2 distinct known ids), `spawnMul` roughly doubling total spawns over a fixed
  simulated duration (spawn accumulation is deterministic, only enemy type/position
  roll RNG), and that `xpMul`/`coinMul`/`contactDmgTakenMul` visibly move pickup and
  hurt-damage amounts.
- **Run K** (`testAffixes`) — hand-crafted elites with a forced `affixes` array
  (via a small addition to the existing `makeStatusEnemy` test helper) verifying each
  affix in isolation: shielded's damage reduction flips off exactly at the HP
  threshold, splitter's death wisps (killed via ignite DoT rather than a live star
  bullet, whose leftover pierce could otherwise collaterally snipe a freshly-spawned
  wisp in the same `dealDamage` call), volatile's bomb-then-blast sequence, gilded's
  doubled coin drop, frenzied's HP-gated speed boost, pacer's proximity speed boost,
  and anchored's immunity to both nova knockback and black-hole pull.
