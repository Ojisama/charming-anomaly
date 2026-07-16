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

## v4.1 addendum (2026-07-15) — weapon-mod parity

Star's original six mods (pierce/blast/multishot/split/chain/ricochet) used to be the only
weapon with a mod pool, letting it outscale every other weapon. `STAR_MODS` is now
`WEAPON_MODS` (`src/config.js`): a mod pool per weapon (orbit/wave/boomerang/mines/homing/hole/
rainbow each get 4-5 mods), globally-unique mod ids, offered only while the owning weapon is
equipped. `run.weaponMods`/`run.weaponModPicks` are now nested by weapon id
(`{ [weaponId]: { [modId]: n } }`); `MAX_STAR_MOD_PICKS` → `MAX_WEAPON_MOD_PICKS` (still 5),
`STAR_MOD_TIER_BONUS` → `WEAPON_MOD_TIER_BONUS`. A new `MOD_POOL_MAX` (6) caps how many
weapon-mod candidates a single level-up pool considers (uniformly sampled down when a player
owns several modded-up weapons), so mods can't crowd out weapon/passive/element cards.

Each new weapon gets one flashy behavioral mod plus a few plain stat mods:
**orbit** Twin Ring (counter-rotating inner ring at 60% radius) + Big Sparks/Wide Orbit/
Overdrive/Extra Sparks; **wave** Echo Wave (delayed re-casts at reduced damage) + Big Wave/
Big Shove/Amplitude; **boomerang** Extra Blades/Long Throw/Big Blade/Heavy Blade; **mines**
Cluster Bombs (bomblets flung out on pop) + Minefield/Big Boom/Heavy Charge; **homing**
Phantom Wisps (wisps gain pierce + a `hitIds` set so they retarget instead of dying) +
Extra Wisps/Long Life/Agile; **hole** Singularity (extra 55%-scale vortexes on other enemies)
+ Bigger Hole/Lasting Vortex/Denser Pull; **rainbow** Prismatic Split (extra beams evenly
spread around the circle, rotating together) + Wide Beam/Long Beam/Sustain.

`sim.js` gained `effectiveWeaponStats(run, w)`, which folds a weapon's accumulated stat mods
(flat/pct) into a copy of its current-level numbers; used once per weapon per frame in
`stepWeapons`. Behavioral mods stay out of that table and are read directly off
`run.weaponMods.<weapon>.<mod>` at their trigger site (`fireStar`, `stepOrbitWeapon`,
`stepWaveWeapon`, `stepMines`, `fireHoming`/`stepHomingShots`, `fireHole`, `fireBeam`).

Render-contract deltas (render.js picks these up separately): `orbs[i]` is now `{ x, y, r }`
(effective hit radius, was `{ x, y }`); `mines[i]` gains an optional `small: true` for Cluster
Bombs bomblets; `homingShots[i]` gains `pierce` + `hitIds:Set` (previously died on first hit
unconditionally); `boomerangs[i]` gains `hitR` (sim-internal collision radius, not required by
render); level-up cards of `kind: 'mod'` now carry `weapon` (the owning weapon id) alongside `id`.

`test/sim-test.js` gained **Run L** (`testWeaponModParity`): Twin Ring doubling orbit's orb
count (entries carrying `r`, raised further by Big Sparks), Echo Wave producing 3 novas from
one cast, Cluster Bombs leaving small mines behind a pop, Phantom Wisps hitting 2+ distinct
enemies via `hitIds`, Singularity yielding a second 55%-scale hole, Prismatic Split yielding a
second beam ~180° apart, a few plain stat mods (extraRang/extraWisp/bigWave) raising their
entity counts/`maxR`, and level-up pool gating (no non-star mod ever appears star-only; orbit
mods appear once orbit is owned).

## v4.3 addendum (2026-07-16) — crazy-mod pass: every weapon to 6 mods

Feedback: non-star weapons still felt thinner than star's six behavioral mods. 13 new
behavioral mods (`src/config.js` `WEAPON_MODS`) bring every weapon up to 6 — no render-contract
changes (hard constraint: renderer untouched), reusing `{type:'explode', x, y, radius}` for
every new splash/detonation and mutating existing live fields (`h.radius`, mine `x/y`) for
growth/movement effects.

**orbit** Supernova Sparks — an orb hit that KILLS an enemy splashes `bonus × that hit's dealt
damage` to everything else within `ORBIT_NOVA_RADIUS` (checked via `e._dead` right after
`applyDamage`, same pattern used for the homing/mines on-kill hooks below) + an explode event.

**wave** Undertow (flat) inverts nova knockback into a pull, plus `UNDERTOW_KB_PER_STACK` extra
magnitude per stack — baked into the nova's (signed) `knockback` field at cast time so mid-run
picks never retroactively change an already-live wave. Tsunami multiplies radius AND damage by
`(1 + bonus)` on every `TSUNAMI_EVERY`-th cast (`run._waveCasts`, a sim-internal per-run
counter) — also baked in at cast, so its echoes (if Echo Wave is also owned) inherit the
tsunami-adjusted numbers for free.

**boomerang** Backhand multiplies damage by `(1 + bonus)` only while `phase === 'back'`. Seeker
Blades steers the *outbound* ('out' phase only — the return already homes on the player) travel
angle toward the nearest enemy at `SEEKER_TURN_RATE × bonus` rad/s, same clamped-turn shape as
homing wisps. Both snapshotted onto the boomerang object at throw time.

**mines** Magnetic Mines crawls an armed (not-yet-triggered) mine's `x/y` toward the nearest
enemy at `MINE_CRAWL_SPEED × bonus` px/s — a plain position mutation, no new render contract.
Chain Reaction (tier): a mine's detonation cascades to up to `<tier bonus>` other ARMED mines
within its own blast radius. `stepMines` now resolves detonations via a breadth-first queue
(`m._detonate` flag, sim-internal) so a mine only ever detonates once even mid-cascade, instead
of the single combined arm/trigger/explode loop it used before.

**homing** Popping Wisps (wispNova) makes a wisp — real or mini — pop an AoE splash
(`bonus × its own dmg` in `WISP_NOVA_RADIUS`) + explode event whenever it dies, whether that's
spending its last pierce on a hit or its lifetime simply running out. Swarm (tier) spawns
`<tier bonus>` mini-wisps (`_mini: true`, `SWARM_DMG_FRAC × dmg`, `SWARM_LIFE` lifetime, same
speed/turn rate) at the spot where a *non-mini* wisp's hit kills an enemy — minis never
re-trigger Swarm themselves (no exponential cascade) but can still pop via wispNova.

**hole** Hungry Hole grows a hole's `radius` (and `coreRadius`, kept proportional) by
`bonus × its own spawn radius` per second while alive — visual-safe since render already
re-reads `h.radius`/`h.coreRadius` every frame; a new `h.spawnRadius` field (baked at creation)
anchors the growth rate. Big Crunch detonates a hole at the moment it expires: damage =
`hole tick dmg × CRUNCH_DMG_MUL × (1 + bonus)` to everything within its FINAL radius + an
explode event there.

**rainbow** Focus Lens ramps a beam's damage linearly from 1× at cast to `(1 + bonus)×` by the
end of its duration — recomputed fresh every tick from `elapsed/duration` (not baked, since it
has to keep changing across the beam's life). Strobe Ray divides the beam's tick period by
`(1 + bonus)`, baked into `tick` at cast time (mirrors Undertow/Seeker: mid-run picks shouldn't
speed up an already-live beam).

`test/sim-test.js` gained **Run O** (`testCrazyMods`), one focused check per new mod: an orb
kill triggering a Supernova explosion; Undertow's knockback pointing at the player (negative
radial); the 3rd wave cast having a bigger `maxR` than the 1st; a boomerang's return-phase hit
outdamaging its outbound hit on the same stationary target; a seeker boomerang's heading
converging toward a far off-axis enemy (placed far away specifically to isolate the steering
effect from the incidental bearing-drift caused by the boomerang's own short travel); a
magnetic mine's position closing distance on an enemy too far away to trigger it; one mine's
blast detonating a second in-radius (but otherwise untriggered) armed mine — 2 explode events;
an expiring wisp popping (Popping Wisps); a wisp kill spawning exactly the tier-bonus count of
mini-wisps and never more (no re-swarm cascade, checked against a saturated low-HP ring that
would expose a cascade if one existed); a hole's radius growing over one second (Hungry Hole);
an expiring hole's Big Crunch detonation dealing the expected `tick × 10 × (1+bonus)` damage;
a late beam tick outdamaging an early one on an identical target (Focus Lens); and a strobed
beam landing more hit events than an unmodded one over the same real time. All prior runs
A–N still pass unchanged.

## v4.5 addendum (2026-07-16) — gold sinks: reroll + pre-run consumables

Two ways to spend banked coins beyond the meta shop: pre-run consumables (bought before a run
starts, main.js-side purchase flow) and level-up rerolls (spent mid-run). `sim.js` itself only
gains one small behavior (Revive Token); everything else is `state.js`-at-creation or
main.js-side (reroll cost/spend, `buildLevelUpChoices` is already exported and reroll-agnostic
— rerolling a level-up screen is just calling it again).

**Consumables** (`CONSUMABLES` in `config.js`, ids passed as `opts.consumables` to `createRun`):
`revive` (banks `run.revives = 1`), `headstart` (pre-loads `player.xp = xpForLevel(1) +
xpForLevel(2)` so `stepLevelUp` fires twice naturally on the first 'playing' frames, banking two
level-ups before any enemy is killed), `charged` (starting weapon entry begins at level 2). All
three are applied once, at `createRun` — no ongoing sim-side bookkeeping beyond the revive
counter below.

**Revive Token**: the shared player-death path (`hurtPlayer` in `sim.js`, used by both contact
damage and volatile-bomb blasts) now checks `run.revives > 0` before flipping `phase` to
`'dead'`. On a banked revive: decrement `run.revives`, restore `hp` to `maxHP × REVIVE_HP_FRAC`,
grant `REVIVE_INVULN` seconds of invulnerability (longer than the normal hit-invuln window, so
the player has a real window to reposition), and radially knock back every enemy within
`REVIVE_SHOVE_RADIUS` at a flat `REVIVE_SHOVE_KB` magnitude (direction-only distance dependence,
same shape as the wave nova's knockback — not falloff-scaled, so the whole shove zone clears
evenly) — then push `{type:'revive', x, y}` (render draws a burst, main.js plays a sfx) instead
of `{type:'dead'}`, and return `false` (player survives) to the caller.

**Rerolls**: `run._rerolls` (added in `createRun`, starts at 0) counts rerolls used this run;
main.js increments it and re-derives the next reroll's price via `rerollCost(run._rerolls)`
(`config.js`: `Math.ceil(REROLL_BASE_COST × REROLL_COST_MUL^used)`, so 10/15/23/... coins).
`sim.js` has no reroll-specific code — a reroll is main.js discarding `run.levelUpChoices` and
calling `buildLevelUpChoices(run)` again after charging the player.

`test/sim-test.js` gained **Run Q** (revive/headstart/charged/rerollCost): a low-hp player with
one banked revive takes a lethal contact hit and survives at `maxHP × REVIVE_HP_FRAC` with a
`revive` event and a nearby enemy knocked back, revives now 0, and a second lethal hit (after
invuln expires) kills for real; a `headstart` run reaches player level 3 after declining a
couple of level-ups with zero kills; a `charged` run's starting weapon is level 2; and
`rerollCost(0|1|2)` matches 10/15/23. All prior runs A–P still pass unchanged.

## v4.8 addendum (2026-07-16) — permanent level-up card slots via shop sacrifice

Replaces v4.7's in-run "➕ Card" purchase (which unlocked the 3rd/4th level-up card for that
screen only, for meta coins) with a **permanent**, meta-shop-side unlock: `meta.choiceSlots`
(2..4, persisted, clamped on `loadMeta`) is unlocked by *sacrificing* already-purchased `SHOP`
upgrade levels — 20 levels for the 3rd slot, 40 for the 4th (`sacrificeCost` in `config.js`) —
with no coin refund for the levels given up. `createRun` snapshots `meta.choiceSlots` onto
`run.choiceSlots` at run start (constant for that run's duration), and `buildLevelUpChoices`
now rolls exactly that many cards (was always 4 pre-rolled, with only the first 2 shown). This
applies to every mode, including Daily. The shop screen gained a "🩸 Sacrifice" panel with its
own local pick-then-confirm mode (`hooks.onSacrifice(picks)`, `picks: { [statId]: count }`),
mutually exclusive with the normal Buy flow while active.

## v5.0 addendum (2026-07-16) — chapters: framework + The Body + The Pond

Ships the Spore-style chapter arc's framework plus its first two chapters. `CHAPTERS`
(config.js) is pure data — theme, roster, weapon pool, elite/signature flags, obstacles — and
`sim.js` stays theme-agnostic, reading only behavior flags off `run.chapter`'s snapshot. Meta
gains a per-chapter ladder, `meta.chapters[id] = { unlocked, maxDifficulty, difficulty, best }`,
migrated losslessly from v4 saves (body absorbs the old top-level difficulty/maxDifficulty; the
top-level `meta.best`/coins/shop/choiceSlots are untouched). Level-up pools are scoped per run to
`CHAPTERS[run.chapter].weapons` — a pond run never offers a body card and vice versa. Winning a
chapter's classic mode at difficulty 3+ unlocks the next chapter (`nextChapter`); Daily seeds a
chapter deterministically from the date (`dailyChapter`) and allows locked chapters as a preview.
The Pond adds drift currents, field obstacles, and two new weapons (Flagella Whip, Toxin Bloom;
Toxin Cysts is a mines re-theme). `boomerang`, `hole`, and `rainbow` are pulled from the active
pool and vaulted until their own future chapters ship — not deleted, just chapter-less for now.
