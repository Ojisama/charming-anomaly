# Chapters — Spore-style progression (v5 arc)

Date: 2026-07-16 · Status: approved design, pre-implementation

## Goal

Give the game a macro progression above difficulty levels: seven themed **chapters**
following a Spore-like zoom-out. Each chapter is a new biome with its own enemy
roster, signature mechanic, obstacles, native weapon pool, and player skin. Chapters
unlock sequentially by winning the previous chapter at difficulty 3+.

## Decisions made with the user (2026-07-16)

- Chapter kit = new biome/map + enemy skins & stat tables (baseline) **plus**: one
  signature mechanic, chapter-native weapons, chapter-relevant field obstacles, and
  a visually evolving player. No chapter bosses (not picked; may revisit later).
- Chapter gate: **win the previous chapter at difficulty 3 or higher**.
- Meta: **shared wallet, per-chapter ladders** — one coin balance, one stat shop,
  global card slots (sacrifice) and reset; each chapter has its own difficulty 1–5
  ladder (sequential unlock, as shipped in v4.10) and its own best scores.
- Existing 8 weapons are **redistributed** across chapters (~4 natives per chapter);
  new chapters add 2–3 new native weapons each. Mods and elements stay global systems.
- Daily Anomaly picks its chapter **date-seeded across all seven**, even locked ones
  (a preview/teaser day); everyone worldwide plays the same chapter + mutators.
- Gap between "small critter" and "cosmic" was too wide → two chapters added
  (City, Skies), for seven total.

## The arc

| # | id | Name | You are | Enemies (behavior reuse in parens) | Signature mechanic | Obstacles | Natives (moved / NEW) |
|---|----|------|---------|-------------------------------------|--------------------|-----------|------------------------|
| 1 | body | The Body | engineered virus | T cells (chaser), white blood cells (tank), antibodies (latch+slow), pill elites (acid pool on death) | — (intro chapter, current game re-framed) | none (keeps current open field) | Star Shooter (starter), Orbit Sparks, Wave Push, Homing Wisps |
| 2 | pond | The Pond | microbe | amoebas (split on death), paramecia (dash bursts), tardigrades (extreme tank), soap-bubble elites (burning clean trails) | **Drift currents** — flow fields push player and enemies | reed stems, air bubbles | Mines→Toxin Cysts, NEW Flagella Whip (starter, melee arc), NEW Toxin Bloom (poison zone) |
| 3 | garden | The Garden | insect | ants (trail-following swarm), wasps (dive-bomb arcs), spiders (web slow-zones), pesticide-drone elites (telegraphed spray strips) | **Pheromone trails** — dying ants leave trails others follow & accelerate on | grass stalks, pebbles | Boomerang→Leaf Blade (starter), NEW Stinger Volley (pierce cone), NEW Pheromone Lure (taunt decoy that bursts) |
| 4 | undergrowth | The Undergrowth | small critter | cat pounces (telegraphed leap), owl shadow (circling aerial strike), rats (chaser), exterminator elite (flashlight cone enrages) | **Predator telegraphs + snap traps** — traps damage both sides, kiteable | roots, bones, snap traps | NEW Pounce Claws (starter, dash melee), NEW Quill Burst (radial retaliation), NEW Chitter Shriek (fear push, small) |
| 5 | city | The City | urban monster | robot vacuums (line chargers), rat-catcher drones, pigeons (mob), exterminator-van elites (spawner) | **Traffic lanes** — periodic vehicles sweep marked bands, deadly to both sides | hydrants, dumpsters, cones | Prism Beam→Neon Beam (starter), NEW Trash Tornado (orbiting debris), NEW Sewer Geyser (eruption zones) |
| 6 | skies | The Skies | kaiju | fighter jets (strafing runs), helicopters (hover + missile volley), tank columns (slow artillery), AA-turret elites | **Bombardment** — telegraphed artillery zones rain continuously (area denial) | building rubble | NEW Roar (starter, sonic cone), NEW Tail Swipe (melee sweep), NEW Debris Toss (lobbed AoE) |
| 7 | beyond | The Beyond | cosmic anomaly | glitch blinkers (teleport closer), phase flickers (windowed vulnerability), drone swarms, UFO elites (abduction pull beam) | **Gravity wells** — bend ALL projectiles, yours and theirs | asteroid chunks | Black-Hole Vortex (moved home), NEW Reality Shard (starter, teleporting rifts), NEW Tesseract Beam (arena-folding sweep) |

Mechanical handoff across the arc: currents → pheromones → predator telegraphs →
traffic lanes → bombardment → gravity wells.

## Systems

### Data model (config.js)

`CHAPTERS` — ordered map, each entry pure data:
`{ id, name, tagline, palette, floorSet, propSet, obstacleSet, playerSkin,
   roster: [{id, name, archetype, hp/speed/dmg multipliers vs chapter baseline, skin, behaviorFlags}],
   eliteTable, signature: {type, ...tuning}, weapons: [ids], starter: id,
   spawnCurve overrides (optional) }`.
Sim stays theme-agnostic: archetypes (chaser/tank/fast/elite + affixes) and
behavior flags are the shared vocabulary; a chapter is configuration. New behavior
flags (latch, split, dashBurst, diveBomb, webZone, pounce, blink, phase, pullBeam,
trailFollow) implemented once in sim.js, enabled per roster entry.

### Meta (state.js)

- `meta.chapter` — selected chapter id (default 'body').
- `meta.chapters[id] = { unlocked, maxDifficulty, best: {time, kills} }`.
- Per-chapter selected difficulty lives in `meta.chapters[id].difficulty`
  (clamped to that chapter's maxDifficulty); top-level `meta.difficulty` and
  `meta.maxDifficulty` are removed at migration.
- Migration: existing saves → `chapters.body = { unlocked: true, maxDifficulty:
  meta.maxDifficulty, difficulty: meta.difficulty, best: {...meta.best} }`.
  Top-level `meta.best` is KEPT and still updated (all-time aggregate — the title
  screen's "best 05:00 · 1876 kills" line keeps working unchanged).
- Shared and untouched: `coins`, `shop`, `choiceSlots`, `runs`.
- Chapter unlock check runs in endRun: victory && classic && difficulty >= 3 &&
  next chapter exists → unlock next, summary badge "🔓 Chapter N: <name> unlocked!".

### Run

`createRun(meta, { chapter, mutators, difficulty, consumables })` — run.chapter
snapshot. Level-up weapon pool = chapter natives only. Starter weapon per chapter.
Weapon mods: WEAPON_MODS gains entries for new weapons (6 mods each, incl. one
behavioral, per v4.3 parity rule). Elements/passives/rarity system unchanged.

### Obstacles

Circular colliders blocking movement (player + enemies), not projectiles.
Placed procedurally at run start from the chapter's obstacleSet (density tuned in
config). Rendered from real sprite assets. Traps (undergrowth/city) are obstacles
with a damage trigger + cooldown, hurting enemies and player alike.

### Signature mechanics (sim.js, one module-level step each, gated by chapter)

- `currents` (pond): smooth vector flow field, force applied to player/enemies.
- `pheromones` (garden): dying trail-flag enemies drop fading trail nodes; ants
  within range path along them with a speed bonus.
- `predators` (undergrowth): telegraph markers (leap arcs, owl shadow) → strike
  after delay; snap-trap trigger logic.
- `traffic` (city): lane bands with warning → vehicle sweep entities damaging all.
- `bombardment` (skies): continuous telegraphed circles → explosion after fuse.
- `gravity` (beyond): well entities apply curvature to all projectile velocities.

Each emits existing event types where possible (explode, hit) to reuse render/sfx.

### UI

- Title: chapter selector above difficulty pips (horizontal cards/carousel:
  emoji + name; locked = dark silhouette + "win <prev> at difficulty 3+").
  Difficulty pips + hints reflect the selected chapter's ladder.
- Daily button shows today's chapter name; briefing screen mentions it.
- Summary: chapter name shown; unlock badges for difficulty and chapter.
- Shop unchanged (global).

### Render

Per-chapter palette + floor/prop sprite sets and enemy/player skins, loaded from
Kenney CC0 packs (same art discipline: no bare procedural shapes; organic layouts).
Player skin evolves per chapter. Background/ambient tint per palette.

## Rollout

- **v5.0**: chapter framework (data model, meta migration, chapter select UI,
  per-chapter ladders/bests, daily chapter seeding), chapter 1 re-framed as The
  Body (skins/copy; roster behavior additions: latch antibodies, acid pills),
  chapter 2 The Pond complete (currents, obstacles, roster, 3 natives incl. 2 new
  weapons + their mods). Weapon redistribution happens here: mines/wisps move.
- **v5.1+**: one chapter per release (garden → undergrowth → city → skies →
  beyond), each mostly content: roster stats/skins, signature step, obstacles,
  natives + mods, palette/props.
- Balance guardrails carried forward: run P-style invariants extended to new
  weapons; empirical weight audit re-run per chapter pool.

## Testing

- Pure-sim tests per chapter: roster behavior flags, signature mechanic step
  (deterministic setups), obstacle collision, weapon pool filtering by chapter,
  chapter unlock rule, meta migration (old save → chapters.body).
- Daily seeding: same date → same chapter+mutators.

## Out of scope (explicitly)

Chapter bosses (not picked), new playable characters, castable spells, familiars,
weapon evolutions — separate roadmap items.
