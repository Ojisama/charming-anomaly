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

## v6.1 — Remaster (polish + full reword)

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

## v6.2 — The City gets a city

The audit's headline: the terrain generator (biomes, streets, blocks) is fully built and
chapter-agnostic, but gated on `render.districts` — skies-only. "The City" is uniform random
scatter on a bare field.

- **Terrain wiring**: `_districtSeed` (state.js) is set when `render?.districts || roads` —
  the world seed decouples from skies' district *visual* system. `streamObstacles`' per-kind
  branch keys on `render.districts === true` explicitly (not `_districtSeed != null`), so city
  keeps its existing 3-variant look but gains `roadAt` exclusion + `blockSnap` alignment.
  `CHAPTERS.city` gains `roads: true`. Zero new art.
- **Street-aligned traffic**: `stepLanes` snaps each sweep's angle to the nearest road's angle
  (`roadAt`) — a car drives down an actual street.
- **Cover**: a traffic sweep checks a segment-vs-circle test against `run.obstacles` between
  car and player; an obstacle in the line blocks the hit. Constants in config.js.
- **Roster**: ratDrone gains `aerialStrike` (the owl machine parked since v5.6.8 "for a chapter
  that hands out a ranged weapon" — city's starter is a beam; small silhouette pass on the
  existing drawRatDrone); pigeon gains `blink` (orphaned flag; skittish flutter-hop).
- **Augment**: `WEAPON_MODS.sewerGeyser.trafficMain` — eruption inside a live lane +40% damage.
- **Ambient system built this release**: generalize the `CURRENT_VIS`/`updateCurrents` idiom
  (pooled world-space sprites, fade envelope, respawn-in-view) into one `updateAmbient` driven
  by `chapterRender.ambient` config. City's parameterization: rain glints on asphalt.
  Later releases only add config entries.

## v6.3 — Pond identity

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

## v6.4 — The hunt (undergrowth)

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

## v6.5 — First cell (+ garden polish + beyond touch-up)

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
