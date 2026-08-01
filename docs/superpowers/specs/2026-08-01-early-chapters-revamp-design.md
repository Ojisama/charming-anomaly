# Early Chapters Revamp — Master Design (v6.1–v6.5)

**Date:** 2026-08-01 (reconciled 2026-08-01 after v6.0.2–v6.1.0 shipped)
**Status:** Approved direction (brainstormed with owner); per-release implementation plans to follow.
**Reconciliation:** since this spec was drafted, four interim releases landed and shift it:
v6.0.2 shipped the pond icon fix (was in Remaster's Tier-0) and the anomaly briefing screen,
v6.0.4 added the anomaly reroll, and v6.1.0 shipped i18n (🌐 toggle + French dictionary keyed by
the ENGLISH source strings). Two consequences: (1) release numbers below shift by one — the
"Remaster" slice ships as v6.2, city as v6.3, pond as v6.4, undergrowth as v6.5, body/garden as
v6.6; (2) every reword in the Remaster now has an i18n side: renaming an English string orphans
its French dictionary key, so each renamed/added string must move/add its fr.js entry (with a
fresh French translation carrying the same fiction) in the same commit.
**Motivation:** A six-dimension audit (weapons, augments, level design, enemies, UI/assets, lore)
found that body/pond/garden/undergrowth/city shipped in v5.0–5.4 and were never revisited, while
skies/beyond/blank each got dedicated authoring passes. The gap is not content volume (mod counts
are uniform, every enemy has bespoke art) — it's that early chapters' systems don't interact,
some signatures are provably vestigial, and a pile of shipped content is silently invisible
(dropped render events, orphaned behavior flags, stale v1 copy).

## Decisions taken (owner-approved)

1. **Master plan, sliced releases** — one coherent design, shipped as five releases (below).
   Decisions that interlock (lore ladder ↔ naming ↔ mods) are fixed here once.
2. **Fiction: local flavor + subtle thread** — each chapter's text is local-first (immune
   vocabulary for body, pond biology, entomology, predation, pest-control satire). The
   "something has been watching you" thread appears exactly once per chapter, in its
   **unlock line**, never in taglines. The Blank remains the payoff.
3. **Body: text + light mechanics** — full re-theme, own anomaly, WBC pounce, sparse obstacles.
   Its `signature: null` tutorial identity is preserved (no heartbeat-pulse mechanic).
4. **Retune freely** — feel changes are in scope where the audit shows omission (melee starters
   hitting flat, dead trap fields). Difficulty ladders must stay winnable; the sim suite and a
   headless balance probe guard that.
5. **Build freely** (owner, 2026-08-01) — "reuse, don't build" is NOT a rule of this program.
   Reusing existing machinery is a tool where it fits; new systems are in scope wherever they
   make the game more fun, playable or coherent. The deferred "L-effort" items (e.g. small-scale
   destructible obstacles for early chapters) are back on the table for their slices, and each
   per-chapter slice should ask "what would make this chapter genuinely fun" before "what can
   we reuse".

Related, already shipped from the same audit: **v6.0.1 anti-kite straggler recycling** (the
run-forever cheese — chasers shed behind a moving player recycle onto the spawn ring ahead).

## Release train

| Release | Theme | One-line contents |
|---|---|---|
| v6.1 "Remaster" | Polish + full reword | Tier-0 render fixes, complete text pass, melee knockback parity, body's anomaly |
| v6.2 "The City gets a city" | City revamp | Real streets/blocks, street-aligned traffic, cover, aerial ratDrone, blink pigeon, ambient system |
| v6.3 "Pond identity" | Pond revamp | Own flora, visible eddies, phase tardigrade, tide-carried bloom, mine stun |
| v6.4 "The hunt" | Undergrowth revamp | Streamed traps, cats spring traps, dashBurst rat, ambush mod, leaf ambient |
| v6.5 "First cell" | Body + garden + beyond touch-up | WBC pounce, cell-debris obstacles, lure pheromone bait, title-card ambients, warden/drifter flags |

---

## v6.1 — Remaster (polish + full reword) — ✅ SHIPPED as v6.2.0 (2026-08-01)

### Tier-0 render/copy fixes (bugs, not features)

- `handleEvents` (render.js) gains cases for the three silently-dropped weapon casts:
  `bloom`, `lure`, `geyser` — each a small burst in its chapter's palette, matching the
  treatment `whip`/`clawRake` already get.
- **realityShard blink made visible**: `stepShardBlink` pushes a `{type:'blink'}` event
  (afterimage/rift streak drawer); `weapon:'shard'` gets its own tint/texture branch in
  `placeBullet` (currently identical to body's plain star).
- **chitterShriek identity**: dedicated `shriek` event + drawer (staggered purple panic bands);
  fear novas stop reusing wave's hardcoded sky-blue `0x59b7ff`.
- **Projectile skins** for `quill` (bone-white), `trash` (rust), `debris` (dust-grey) in
  `placeBullet` — all currently fall through to the gold star texture.
- **Wave cast FX**: staggered multi-ring drawer (modeled on `spawnRoar`) instead of one flat
  expanding circle.
- ~~Pond icon~~ (shipped early, v6.0.2).
- Chapter-unlock badge stops hardcoding 🌊 (see unlock lines below).

### Melee parity (retune)

`fireFlagella` and `slashClaws` share `fireRoar`'s exact sector-sweep but omit its knockback.
Both gain a `knockback` field in their `levels[]` (smaller than roar's) and call
`shoveFromPlayer` — two melee starters stop hitting flat. Numbers in config.js.

### The full reword

**Principle:** local-first; the watcher thread lives only in unlock lines.

Taglines (chapter cards):
- body: keeps **"escape the host"**
- pond: "sink or swim" → **"nothing floats forever"**
- garden: "the lawn is a jungle" → **"your scent gives you away"** (grounded in pheromones)
- undergrowth: "everything here eats you" → **"the traps were already set"**
- city: "mind the traffic" → **"you've been reported"**
- skies/beyond/blank unchanged.

Chapter-unlock lines (per-chapter, replacing the global badge):
- pond: `🔓 The Pond — word of you travels downstream`
- garden: `🔓 The Garden — something marked your trail`
- undergrowth: `🔓 The Undergrowth — the hunters were told to expect you`
- city: `🔓 The City — a report has been filed`
- skies: `🔓 The Skies — this time they're not hiding it`
- beyond: `🔓 The Beyond — you were never the only anomaly`
- blank (sharpened): `⬜ THE BLANK — the antibody that let you go wants you back`
- "???" mystery-card hint gains: *"win The Beyond at level 5 — something has been counting"*

Per-chapter endings (victory / death), replacing global `You escaped! / Squished… 💦`:

| Chapter | Victory | Death |
|---|---|---|
| body | You slipped past the immune system! 🎉 | Neutralized… 🩸 |
| pond | You reached open water! 🎉 | Filtered out… 💧 |
| garden | You outgrew the garden! 🎉 | Swatted… 🍃 |
| undergrowth | You out-hunted the hunters! 🎉 | Caught… 🦴 |
| city | You slipped the dragnet! 🎉 | Pest control wins… 🚚 |
| skies | They couldn't bring you down! 🎉 | Grounded… 💥 |
| beyond | You crossed the edge of the map! 🎉 | Erased from the record… ✨ |
| blank | THE ANTIBODY FAILED. 🎉 | DELETED. ⬜ |

The victory/death table lives in config.js next to CHAPTERS; ui.js reads it by chapter id.

**Body weapon re-theme** (display names/descs/mod names only — ids and behavior unchanged,
same `// COPY ONLY` pattern as mines→Toxin Cysts):
- star "Star Shooter" → **Spike Protein** — "Flings barbed antigens at the nearest cell."
- orbit "Orbiting Wisps" → **Phage Ring** — "Tamed phages circle you, shredding whatever they touch."
- wave "Shockwave" → **Cytokine Burst** — "A pressure wave of alarm signals shoves the swarm back."
- homing "Homing Wisp" → **Seeker Cell** — "A defected white cell that hunts your hunters."
- All ~23 mods re-themed in the same register (Piercing Stars → Membrane Piercer,
  Extra Wisps → Split Culture, …). Exact table authored at implementation time; register is
  immune-system vocabulary, no sci-fi leftovers, and never renames a mechanic's meaning.

**Body anomaly** (mutator-pool parity — body is the only chapter with 8 pre-run options, not 9):
- `toxicShock: { name:'Toxic Shock', icon:'🧪', chapters:['body'], effects:{ acidPotencyMul:1.6, coinMul:1.25 } }`
- `acidPotencyMul` joins MUTATOR_MOD_KEYS; consumed at the single acid-pool push site.

---

## v6.3 — The City gets a city (revised 2026-08-01 after a three-critic adversarial review)

The audit's headline: the terrain generator (biomes, streets, blocks) is fully built and
chapter-agnostic, but gated on `render.districts` — skies-only. "The City" is uniform random
scatter on a bare field. The first draft of this slice was challenged by three adversarial
agents (fun / gameplay / bugs); the design below is the post-review synthesis. Where a
decision reverses the draft, the finding that forced it is noted.

**Fantasy:** a real rainy night city. Furniture lines the curbs (blockSnap pulls obstacles TO
street frontage — the draft's "cluttered block interiors" claim was backwards); streets carry
traffic; dumpsters are destructible cover; pest control has been dispatched — for you.

- **Terrain wiring**: `CHAPTERS.city` gains `roads: true`. `_districtSeed` (state.js) is set
  for roads-chapters too, but **derived from the already-drawn `_obstacleSeed`** (e.g.
  `pickWorldSeed(_obstacleSeed ^ 0x9e3779b9)`), NOT a fresh `Math.random()` draw — a new draw
  in `createRun` desyncs every seeded test between reseed checkpoints (bugs finding 1; the
  AA.c/runStarOnly scar, third time). Skies' existing districts path is untouched.
  `streamObstacles`' per-kind branch re-keys on `render.districts === true` explicitly, so city
  keeps its dumpster/hydrant/cone look + chapter-wide radius band while gaining road exclusion,
  `blockSnap` curb alignment, and biome build-density — with a per-chapter
  `obstacles.densityFloor: 1` clamp so the sprawl never visibly "runs out of city" on a floor
  that can't show biomes (bugs finding 3: outskirts keep today's scatter; fading streets are
  the honest edge cue; highways still cross the outskirts). Post-snap, `minDist` (spawn-ring
  clearance) is RE-CHECKED — blockSnap can shove an obstacle back into the spawn clearing, and
  city's spawn is guaranteed downtown (bugs finding 7; also fixes the latent skies bug).
  Zero new art.
- **Street-aligned traffic — lanes ALWAYS cross the player** (gameplay findings 1/2: a full
  road-snap creates a permanent traffic-free courtyard in every block interior — 20-50% of
  block area — deleting the signature and the rushhour mutator for a camper). `stepLanes`
  keeps its "band crosses the player, ±TRAFFIC_OFFSET" contract in every case. Angle snaps to
  the local street grid (nearest-road angle; random ± direction). When the player is within
  ~a band-width of a real road centerline, the lane snaps fully ONTO that road (centerline
  resolution needs the perpendicular sign-probe trick — `roadAt().dist` is unsigned, bugs
  finding 6; replicate render.js's populateRoad idiom sim-side with one extra `roadAt` call).
  Mid-block, the car jumps the curb and comes for you — which IS the chapter's fantasy.
  Same number of `Math.random()` draws per roll as today. Outside the street grid entirely:
  today's random-angle lane.
- **Cover — telegraphed, destructible, player-only** (fun findings 2/3/7; gameplay finding 2):
  during a sweep, an obstacle with `r >= COVER_MIN_R` (cones don't stop cars) intersecting the
  car→player segment (capsule-vs-circle via the file's along/perp idiom, `t` clamped strictly
  inside the segment) blocks the player hit — and the car DESTROYS the obstacle: splice +
  `_crushed.add` + `{type:'crush'}` event (render case + SFX exist from skies) + heavy shake.
  One block per lane pass (`lane._coverUsed`) — without it the event machine-guns every
  overlap frame (bugs finding 5). Blocking cover is legible BEFORE it matters: during `warn`,
  qualifying obstacles intersecting the band get a subtle glow (render-only). City's big-prop
  pick prefers the dumpster bake for cover-sized obstacles. Enemies get no cover (cars keep
  squashing the swarm). Destructibility is simultaneously the wow moment, the anti-camping
  valve (a shield is consumed when used), and coherent physics.
- **Roster** (gameplay findings 3/4/5; fun findings 4/5): roster entries gain two generic
  config knobs — `weight` (relative spawn share within an archetype, default 1) and `minT`
  (earliest run-time the entry may spawn) — read in `spawnEnemy`'s pool pick (same single
  RNG draw).
  - `vacuum` (tank, lineCharge) and `ratDrone` (normal, plain seek — the ground blob)
    unchanged.
  - NEW `patrolDrone` (normal, `['aerialStrike']`, same drawRatDrone art + ROSTER_LOOKS
    entry, hpMul ~0.85, `weight: 0.3`, `minT: 60`): the parked owl machine finds its
    ranged-chapter home — but NOT as half the bulk archetype from t=0 (fun finding 4), and
    NOT with the melee-era immunity: `AERIAL_UNTOUCHABLE` is DELETED; `damageImmune` drops
    its aerial branch (circling drones are killable), `contactHarmless` keeps `climb` (and
    gains nothing new) unconditionally — the punish-window asymmetry survives the flag's
    removal (bugs finding 2). `AERIAL_RADIUS` 240→200 so orbiters sit inside the beam's
    L1 reach with margin (gameplay finding 3: 240 = exactly blade length, a ~15° hit window).
    NEW `AERIAL_STRIKE_MAX_LIVE` (~6): enemies past the cap hold in `circle` until a slot
    frees — the MISSILE_MAX_LIVE/SHELL_MAX_LIVE lesson, applied before shipping instead of
    after (gameplay finding 4). Tests Y.b/Y.b2 rewritten to the new contract.
  - NEW `rat` (fast, plain seek, reuses the existing undergrowth look): carries the fast
    pressure lane. Cars roadkill non-elite rats (`TRAFFIC_SQUASH` += rat, patrolDrone).
  - `pigeon` gains `blink` as the fast lane's SPICE, not its entirety (gameplay finding 5:
    blink-as-sole-fast made the lane 24% slower at closing). Beyond no longer uses blink, so
    BLINK_* retune freely for the city: faster cadence, longer hop, lands ~70px out (just
    outside contact, one reaction beat), quicker crawl. A startle-hop reads on a bird.
- **Augment**: `WEAPON_MODS.sewerGeyser.trafficMain` — +40% eruption damage inside a live
  lane band (warn or sweep), AND with the mod held `pickBloomSpot` prefers enemies inside a
  live lane ("the mains run under the streets"). Without the placement bias the mod's uptime
  is ~15-25% and uninfluencable — a trap pick (gameplay finding 6).
- **The dispatch beat** (fun finding 6: the tagline was a check no mechanic cashed): every
  city elite spawn emits `{type:'dispatch'}` — siren SFX, brief red strobe on the elite, HUD
  line "📋 REPORTED — pest control dispatched" (EN+FR). Copy + FX on an existing cadence;
  zero balance change; the fiction finally lands in-run.
- **Rain**: `render.rain: true` on city. `updateRain` is currently NESTED inside
  `updateStorm`'s early-return (bugs finding 8) — pull it out behind a
  `chapterHasRain = !!(render.storm || render.rain)` latch so city gets rain without clouds.
  City already has baked puddles.
- **Deferred** (over this slice's pressure budget): the full heat/searchlight system; a
  crossing-incentive objective (fun finding 8 — accepted as partial: curb cover + street
  traffic + dispatch carry street relevance for now).
- **Ship gates**: headless kiting probe per enemy (clear-rate + damage attribution — the R1
  rule: starter kills it while kiting, attack escapable at baseSpeed 220); map-mode street
  verification; new Run KK tests (seed wiring, road exclusion + post-snap minDist, lane
  snapping both branches, cover block/destroy/one-shot, weight/minT pool math, trafficMain
  condition + placement bias, blink retune contract); browser pass; all new strings in fr.js
  same-commit.

## v6.4 — Pond identity

- **Own flora**: `BIOME_POND` in render.js's BIOMES table (currently `pond: BIOME_GARDEN`,
  byte-identical) — reeds/mushrooms/clusters from already-loaded PNGs, murky weighting,
  no lawn flowers.
- **Eddies**: `signature.eddies: N` — a handful of streamed, visible vortices (deterministic
  cell-hash placement like obstacles; `wellForce`-style radial+tangential force, `EDDY_*`
  constants) the player routes around. The ambient current field stays as gentle background.
  Rendered by re-centering the existing current-streak idiom on each eddy.
- **Roster**: tardigrade gains `phase` (orphaned flag) — cryptobiosis flickers: briefly
  untouchable but hurried. Real biology.
- **Augments**: `WEAPON_MODS.bloom.tideCarried` — toxin clouds drift with `currentForce`
  (steerable zones, the game's first signature-load-bearing build option); baseline
  `MINE_STUN` (~0.3s) on mine detonation and `BLOOM_SLOW` inside clouds (retune license).

## v6.5 — The hunt (undergrowth)

- **Streamed traps**: trap placement folds into `streamObstacles`' deterministic cell hash
  (new salt), gated on `signature.type === 'predators'`, with per-trap `armed`/`cd` state
  preserved across streaming via the `_crushed`-Set pattern. The trap field exists everywhere,
  all run — killing the "signature is dead 15 seconds in" defect.
- **Cats spring traps**: `stepPounce`'s `land` state cross-checks `run.traps` and triggers an
  armed trap it lands on — predator and trap field finally interact (the skies
  artillery/bombardment "one hazard vocabulary" pattern).
- **Roster**: rat gains `dashBurst` (startled darting). Centipede stays deliberately plain —
  the code documents why; respected.
- **Augment**: `WEAPON_MODS.clawRake.ambushPredator` — +30% damage within `AMBUSH_R` of an
  armed trap.
- **Ambient**: falling leaves.

## v6.6 — First cell (+ garden polish + beyond touch-up)

- **Body**: WBC gains `pounce` (phagocyte lunge — the tutorial's first telegraph read);
  sparse obstacles `{count:~8, organelle/cell-debris palette}` reusing the generic clump
  machinery; drifting-motes ambient. Signature stays `null`.
- **Garden**: `WEAPON_MODS.lure.pheromoneBait` — the burst seeds a real `run.trails` node so
  ants keep swarming the blast zone after the decoy dies; pollen-dust ambient.
- **Title-card ambients** for garden/undergrowth/city (`CHAPTER_AMBIENT` in ui.js — CSS-only;
  body/pond already have theirs).
- **Beyond touch-up**: warden gains `blink`, drifter gains `phase` — their sprites are the old
  blinker/flicker art, so this reunites art with the behavior it was drawn for; star-twinkle
  ambient so beyond isn't atmosphere-zero.

---

## Cross-cutting constraints

- Module boundaries hold: balance numbers in config.js; sim.js pure (events out); render.js
  reads run, never mutates; render-only knobs in each chapter's `render` block.
- i18n (v6.1.0) discipline: English config strings are the French dictionary's KEYS. Any string
  rename moves its fr.js entry to the new key; any new player-visible string adds one. The
  Remaster's reworded copy gets fresh French translations in the same pass — the fiction must
  land in both languages.
- Display renames never change ids (save compatibility, sim untouched).
- Every new mechanic lands with a sim-test scenario appended at the END of test/sim-test.js
  (seeded-random ordering). Each release runs the headless weaving-runner balance probe
  (kept from v6.0.1) plus a browser pass before shipping.
- Each release is one versioned commit train on main via the standard deploy; the ambient
  system ships once (v6.2) and later releases only add config.

## Out of scope (explicitly)

- No new chapters, no new weapons (rework-only), no changes to skies/beyond structure beyond
  the v6.5 touch-up, no economy changes, no rampage-style destructibility for early chapters
  (audit's item G — revisit after the train ships).
