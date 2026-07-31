# The Blank — implementation contract (v5.24.0)

Companion to `../specs/2026-07-30-the-blank-final-boss-design.md`. This file is the INTERFACE
CONTRACT between the files touched: every export name, run field, event shape and roster id is
pinned here. Implementers follow it exactly — coordination happens through this document, not
through reading each other's diffs. Line anchors below come from a recon pass and may drift a few
lines; re-grep before editing, trust the symbol names.

## File ownership

| Owner | Files | May not touch |
|---|---|---|
| CFG | config.js, state.js | everything else |
| SIM | sim.js | everything else |
| RENDER | render.js | everything else |
| UI | ui.js | everything else |
| SFX | main.js, audio.js | everything else |
| TEST | test/sim-test.js | everything else |

## Key recon facts (verified against the code)

- `formationOnly: true` roster entries are excluded from random spawning (sim.js ~520) but ARE
  spawnable via `spawnEnemy(run, {rosterId})` — reuse this for the boss/node entries, no new field.
- `spawnEnemy` ring placement (no opts.x/y, non-lane): random angle at `run.viewRadius + SPAWN_RING`.
- Elites are chapter-agnostic (`run.time >= run._nextEliteAt` inside spawnEnemy); `eliteFlags: []`
  does NOT prevent them. The blank chapter must gate `stepSpawning` off entirely AND every script
  spawn passes `forceNormal: true`. `eliteFlags: []` must still be present (indexed unconditionally).
- Enemy death: `_dead` flag set in `dealDamage`, corpses filtered at the tail of `stepWeapons` once
  per frame; the `kill` event has NO id. Track ids and detect death by absence from `run.enemies`
  on the next frame.
- `run.bombs` is the generic telegraph→blast entity: `{x, y, radius, fuse, duration, dmg, src}` —
  fuse counts down (telegraph window), detonation damages player AND enemies in radius, pushes an
  `explode` event. `src` is render-only. P1 trail detonations reuse it with `src: 'trail'`.
- `run.strips` is the generic world-anchored telegraph→active rotated rect:
  `{x, y, angle, len, w, fuse, t, dps}` (anchored at x,y extending len along angle; damages the
  PLAYER only, at STATUS_TICK cadence, while t runs after fuse expires). P3 erasure bands, eraser
  trails and L3 residue all reuse it, with a new render-only field `look: 'erase'`.
- `p.vx/p.vy` are stored every frame by stepPlayerMovement (already used by skies ARTILLERY_LEAD)
  — P3's extrapolation reads them.
- Player slows combine via `Math.min(latchMul, webMul, ...)` — MIN-stack, not multiplicative.
- Knockback immunity: the `'anchored'` affix is checked by all relevant kb sites; set it on the
  boss post-spawn.
- `MUTATORS` is a flat pool; `randomMutators`/`dailyMutators` draw from `Object.keys(MUTATORS)`.
  Blank's named modifiers become MUTATORS entries with `hidden: true`, and BOTH pickers filter
  hidden out (this leaves daily picks byte-identical to today). HUD/pause chips then render blank's
  modifiers with zero UI changes.
- render.js keys everything off `CHAPTERS[run.chapter]` lookups with safe fallbacks; no
  CHAPTER_ORDER usage. New chapter = config entry + explicit handling for the white void (below).
- ui.js `titleChapterList` appends CHAPTER_ORDER's next locked id unconditionally — blank stays
  OUT of CHAPTER_ORDER and gets explicit card logic.
- state.js `loadMeta` retroactive-unlock loop walks CHAPTER_ORDER only — safe with blank outside it.
- sim-test.js: single seeded Math.random stream shared by scenario ORDER — append new scenarios at
  the END (new run letters), never insert mid-file.

## config.js (CFG)

After the CHAPTERS literal closes (~line 1543), append:

```js
CHAPTERS.blank = {
  name: 'The Blank', tagline: 'deletion in progress', icon: '⬜',
  scripted: true,          // NEW chapter-level flag, read by sim.js (gates victory timer + spawning) and ui.js (HUD)
  maxDifficultyCap: 3,     // NEW: per-chapter ladder ceiling (see chapterMaxDifficulty helper)
  weapons: ['star','orbit','wave','homing','flagella','mines','bloom','boomerang','stinger','lure',
            'clawRake','quillBurst','chitterShriek','rainbow','trashTornado','sewerGeyser',
            'roar','tailSwipe','debrisToss','realityShard','hole','tesseractBeam'], // union of all 7 pools
  starter: 'realityShard',
  roster: [
    { id: 'probe',     archetype: 'fast',   name: 'Probe',        hpMul: 0.7, speedMul: 1.15, flags: ['pastSeek'] },
    { id: 'binder',    archetype: 'normal', name: 'Binder',       hpMul: 0.9, speedMul: 1.05, flags: ['latch'] },
    { id: 'eraser',    archetype: 'tank',   name: 'Eraser',       hpMul: 1.2, speedMul: 0.6,  flags: ['wake'] },
    { id: 'bindnode',  archetype: 'normal', name: 'Binding Node', hpMul: 1,   speedMul: 0,    flags: [], formationOnly: true },
    { id: 'antibody1', archetype: 'tank',   name: 'The Antibody', hpMul: 1,   speedMul: 1,    flags: ['standoff'], formationOnly: true },
    { id: 'antibody2', archetype: 'tank',   name: 'The Antibody', hpMul: 1,   speedMul: 1,    flags: ['standoff'], formationOnly: true },
    { id: 'antibody3', archetype: 'tank',   name: 'The Antibody', hpMul: 1,   speedMul: 1,    flags: ['standoff'], formationOnly: true },
  ],
  eliteFlags: [],
  signature: null,
  obstacles: null,
  modsByDifficulty: { 1: [], 2: ['accelResponse'], 3: ['accelResponse', 'immuneMemory'] },
  render: { bgColor: 0xf2efe8, floorTint: 0xffffff, playerTint: 0x8a55d6, tail: false,
            voidFloor: true,   // RENDER gates all decorative floor layers off
            ink: 0x4a4458 },   // RENDER uses for damage numbers / telegraphs that default to white
}
```

New exports (single tuning block, flag-comment style of blink/pullBeam ~config.js:3290):

```js
export const chapterMaxDifficulty = (id) => CHAPTERS[id]?.maxDifficultyCap ?? MAX_DIFFICULTY

// Script table: even indices = wave blocks, odd = boss phases (stage 1/2/3).
export const BLANK_SCRIPT = [
  { waves: [ { n: 10, ids: ['probe'] }, { n: 14, ids: ['probe'] }, { n: 16, ids: ['probe','binder'] } ] },
  { boss: 'antibody1' },
  { waves: [ { n: 12, ids: ['binder','probe'] }, { n: 16, ids: ['binder','probe'] }, { n: 18, ids: ['binder','eraser'] } ] },
  { boss: 'antibody2' },
  { waves: [ { n: 14, ids: ['eraser','binder'] }, { n: 18, ids: ['eraser','probe','binder'] }, { n: 22, ids: ['eraser','probe','binder'] } ] },
  { boss: 'antibody3' },
]
export const BLANK_WAVE_TIMEOUT = 20      // s, next wave arrives even if this one isn't cleared
export const BLANK_BOSS_HP = [2200, 3000, 3800] // per phase, × run.mods.enemyHpMul, set post-spawn (no hpScale)
export const BLANK_BOSS_R = 80            // world px, set post-spawn; render bakes at this size
export const BLANK_BOSS_SPEED = 45        // px/s toward the band
export const BLANK_BOSS_XP = 60           // gem worth on each phase kill
export const BLANK_STANDOFF_MIN = 240     // px, standoff flag: back off inside this
export const BLANK_STANDOFF_MAX = 340     // px, close in outside this
export const BLANK_TRAIL_DT = 0.35        // s between trail samples
export const BLANK_TRAIL_MAX = 26         // samples kept (~9s of history)
export const BLANK_READ1_T = 5.0          // s between P1 trail reads
export const BLANK_READ1_K = 8            // trail points detonated per read (most recent K)
export const BLANK_READ1_FUSE = 0.9       // s telegraph on the oldest point
export const BLANK_READ1_STAGGER = 0.14   // s extra fuse per point (oldest detonates first)
export const BLANK_READ1_R = 46           // px blast radius
export const BLANK_READ1_DMG = 12
export const BLANK_PASTSEEK_LAG = 4       // trail samples behind the player probes aim at (~1.4s)
export const BLANK_NODE_MAX = 3
export const BLANK_NODE_T = 3.5           // s between node spawns while below max
export const BLANK_NODE_HP = 45           // set post-spawn
export const BLANK_NODE_RING = 170        // px from player where a node appears
export const BLANK_NODE_SLOW = [1, 0.78, 0.62, 0.5] // player speed mul by alive-node count (MIN-stacked)
export const BLANK_YANK_T = 5             // s a node survives before the yank fires
export const BLANK_YANK_DIST = 150        // px instant drag toward the boss
export const BLANK_YANK_DMG = 10
export const BLANK_SHOT_T = 2.4           // s between P2 aimed shots (run.enemyShots)
export const BLANK_SHOT_SPEED = 240
export const BLANK_SHOT_DMG = 10
export const BLANK_READ3_T = 3.4          // s between P3 pre-fired bands
export const BLANK_LEAD = 0.55            // s of velocity extrapolation
export const BLANK_BAND_LEN = 320
export const BLANK_BAND_W = 64
export const BLANK_BAND_FUSE = 0.75       // s telegraph
export const BLANK_BAND_T = 2.4           // s active
export const BLANK_BAND_DPS = 26
export const BLANK_DESPERATE_FRAC = 0.25  // P3 hp fraction under which timers ×= BLANK_DESPERATE_MUL
export const BLANK_DESPERATE_MUL = 0.62
export const BLANK_WAKE_DT = 0.5          // s between eraser residue drops
export const BLANK_WAKE_LEN = 40
export const BLANK_WAKE_W = 30
export const BLANK_WAKE_T = 1.6
export const BLANK_WAKE_DPS = 14
export const BLANK_MEMORY_T = 2.0         // s an immuneMemory residue lives (len/w = BLANK_WAKE_*)
export const BLANK_RECRUIT_T = [6, 7, 8]  // s between recruit spawns in phase 1/2/3
export const BLANK_RECRUIT_N = [3, 2, 2]  // recruits per pulse (probe/binder/eraser respectively)
export const BLANK_ACCEL_MUL = 0.75       // accelResponse: applied to READ1_T/READ3_T/NODE_T/SHOT_T/fuses/WAVE_TIMEOUT
```

MUTATORS gains two `hidden: true` entries matching its existing entry shape (name/icon/desc plus
whatever effect field existing entries carry — with a no-op effect): id `accelResponse`
("Accelerated Response" ⚡ "its telegraphs are 25% faster") and id `immuneMemory`
("Immune Memory" 🧠 "slain cells leave erasing residue"). `randomMutators` and `dailyMutators`
filter `hidden` out of their pools (daily picks must stay identical to today).

## state.js (CFG)

- `ensureChapterMeta`: clamp with `chapterMaxDifficulty(id)` instead of flat MAX_DIFFICULTY.
- `createRun`: init `script: CHAPTERS[chapter].scripted ? { stage: 0, waveIdx: 0, waveT: 0, spawned: false, bossId: null } : null`,
  `trail: []`, `bossBar: null` (always present, inert elsewhere — rampage pattern).
- Doc block (~line 618, before createRun): a dated v5.24 paragraph documenting `run.script`,
  `run.trail`, `run.bossBar`, the `scripted` gate, the reuse of bombs (`src:'trail'`) and strips
  (`look:'erase'`), and the new events (shapes below).

## sim.js (SIM)

New step `stepBossScript(run, dt)`, called from stepSim right after `stepSpawning(run, dt)`.
Early-return unless `CHAPTERS[run.chapter].scripted`. Gates elsewhere:

- Victory timer (~line 135): skip the whole RUN_DURATION check when scripted.
- `stepSpawning`: early return when scripted (kills ordinary + elite spawning).

Inside stepBossScript (all spawns use `forceNormal: true`; timers scale by BLANK_ACCEL_MUL when
`run.mutators.includes('accelResponse')`):

- Sample `{x: p.x, y: p.y}` into `run.trail` every BLANK_TRAIL_DT, capped BLANK_TRAIL_MAX (shift).
- **Stage machine** (`run.script.stage` indexes BLANK_SCRIPT):
  - Wave stage: if `!spawned`, spawn wave (`n` enemies, rosterId round-robin from `ids`, default
    ring placement), tag each `e._wave = true`, set spawned. Advance waveIdx when no alive `_wave`
    enemy OR `waveT > BLANK_WAVE_TIMEOUT`; after the block's last wave, `stage++`, reset.
  - Boss stage: if `!spawned`, spawn the boss rosterId, then override post-spawn:
    `hp = maxHP = BLANK_BOSS_HP[phase-1] * run.mods.enemyHpMul`, `radius = BLANK_BOSS_R`,
    `speed = BLANK_BOSS_SPEED`, `xp = BLANK_BOSS_XP`, `affixes = ['anchored']`; store
    `bossId = e.id`; push event `{type:'bossSpawn', x, y, stage: phase}`. Boss dead (id absent
    from run.enemies) → if last stage: `{type:'bossDead'}`, `run.phase = 'victory'`, push
    `{type:'victory'}`; else `stage++`, reset, next frame's wave block starts.
- **Maintain `run.bossBar`**: `{hp, max, stage}` while the boss is alive, else null.
- **P1** (stage 1): every BLANK_READ1_T, push the most recent BLANK_READ1_K trail points as bombs
  `{x, y, radius: BLANK_READ1_R, fuse: BLANK_READ1_FUSE + i*BLANK_READ1_STAGGER (i: oldest=0),
  duration: same, dmg: BLANK_READ1_DMG, src: 'trail'}`. Recruits: BLANK_RECRUIT_N[0] probes every
  BLANK_RECRUIT_T[0].
- **P2** (stage 3): keep up to BLANK_NODE_MAX 'bindnode' enemies alive (spawn one every
  BLANK_NODE_T at a random angle BLANK_NODE_RING from the player; post-spawn `hp = maxHP =
  BLANK_NODE_HP`, track `e._bindT` age). Player slow: MIN-stack
  `BLANK_NODE_SLOW[aliveNodeCount]` into stepPlayerMovement's slowMul (sim computes the count once
  per frame; keep the plumbing simple — e.g. run._bindSlow written by stepBossScript, read in
  stepPlayerMovement, defaulting 1). Any node with `_bindT > BLANK_YANK_T`: drag the player
  BLANK_YANK_DIST toward the boss (clamped to not overshoot), `hurtPlayer(run, BLANK_YANK_DMG)`,
  kill ALL nodes via dealDamage, push `{type:'yank', x: p.x, y: p.y}`. Aimed shots every
  BLANK_SHOT_T into run.enemyShots ({x,y,vx,vy toward player at BLANK_SHOT_SPEED, r: 8,
  dmg: BLANK_SHOT_DMG, life: 3, turnRate: 0.4}). Recruits: binders.
- **P3** (stage 5): every BLANK_READ3_T (× BLANK_DESPERATE_MUL when boss hp < BLANK_DESPERATE_FRAC
  × max), push a strip centred on `(p.x + p.vx*BLANK_LEAD, p.y + p.vy*BLANK_LEAD)`, angle
  perpendicular to the velocity (random when speed ~0), `{x: cx - cos(a)*len/2, y: cy - sin(a)*len/2,
  angle: a, len: BLANK_BAND_LEN, w: BLANK_BAND_W, fuse: BLANK_BAND_FUSE, t: BLANK_BAND_T,
  dps: BLANK_BAND_DPS, look: 'erase'}`. Recruits: erasers.
- **immuneMemory**: track live `_wave` enemies' positions (id→{x,y}); when one disappears, push a
  residue strip at its last position (len BLANK_WAKE_LEN, w BLANK_WAKE_W, fuse 0.3,
  t BLANK_MEMORY_T, dps BLANK_WAKE_DPS, look: 'erase', random angle).

New enemy flags (implemented in the existing flag style, constants above):

- `standoff` (stepEnemyMovement): hold a distance band — close in beyond BLANK_STANDOFF_MAX, back
  off inside BLANK_STANDOFF_MIN, else gentle sideways drift. Used only by the boss.
- `pastSeek` (stepEnemyMovement): seek `run.trail[len-1-BLANK_PASTSEEK_LAG]` (fallback: player).
- `wake` (in stepBossScript or movement): every BLANK_WAKE_DT drop a strip at the enemy's position
  along its heading `{len: BLANK_WAKE_LEN, w: BLANK_WAKE_W, fuse: 0.15, t: BLANK_WAKE_T,
  dps: BLANK_WAKE_DPS, look: 'erase'}`.

`stepStrips` must tolerate the extra `look` field (it will — it reads named fields only; verify).

## Events (SIM emits, RENDER + SFX consume)

- `{type:'bossSpawn', x, y, stage}` — stage 1 = first arrival, 2/3 = reform
- `{type:'bossDead', x, y}` — final kill only
- `{type:'yank', x, y}` — the P2 drag
- Existing `explode` events fire from bombs (trail blasts) for free; `victory` as usual.

## render.js (RENDER)

- `voidFloor` flag (from chapterRender): early-return ALL decorative floor layers (blotch, big,
  mid, detail, clutter, edge — whatever populate* fns exist) so the void is flat. bgColor applies
  as normal.
- Damage numbers: base fill becomes `chapterRender.ink ?? 0xffffff` (stroke unchanged).
- `ROSTER_BASE_R.boss = 80`; ROSTER_LOOKS entries for `antibody1/2/3` (archetype 'boss', drawn at
  local r=80): pale Y-shaped/tri-lobed rotating form, warm-white #fbfaf6 body, gray-lavender
  0x8880a8 edges, escalating menace per phase (spikes/darker core). Entries for `probe` (fast),
  `binder` (normal), `eraser` (tank), `bindnode` (normal): pale bodies with visible gray-lavender
  outlines (they must read on WHITE — outline-first design, unlike every existing dark-bg enemy).
- Bombs with `src:'trail'`: telegraph ring drawn in violet 0x8a5fe0 (the default warm-yellow
  telegraph is invisible on white).
- Strips with `look:'erase'`: pale cool fill 0xdde4ee + edge 0x9aa6c4 (instead of the spray look).
- New Graphics `bindG` (wellG pattern: clear+redraw per frame, register in clearWorld): for each
  alive `bindnode` enemy, a filament line to the player, thickness/alpha ramping with `e._bindT`
  (telegraphs the yank). Iterate run.enemies filtering rosterId — no new run field needed.
- Event FX cases: `bossSpawn` (implosion burst + ring, explicit violet/gray tints, addShake),
  `bossDead` (big white-out flash + burst), `yank` (line-flash/ring at the player). Every
  spawnRing call passes an explicit non-white tint.
- clearWorld: add bindG.clear() and any new pool registrations.

## ui.js (UI)

- `titleChapterList`: after the existing logic, push 'blank' when `meta.chapters?.blank?.unlocked`,
  else when `meta.chapters?.beyond?.maxDifficulty === MAX_DIFFICULTY` (mystery card state).
- heroCardHtml locked branch: for id 'blank', tagline `win The Beyond at level 5` (not the generic
  "difficulty 3+" line).
- Per-chapter cap: pips loop, "win level X to unlock X+1" hint gate, and star-row length use
  `chapterMaxDifficulty(id)` (import from config). Blank's card shows 3 stars.
- Beyond's 5th star: `on` when `meta.chapters?.blank?.unlocked` (suppress the pulse then).
- Difficulty hint for blank: instead of "+N random anomalies…", list the level's modifier names
  from `CHAPTERS.blank.modsByDifficulty[level]` via MUTATORS[id].name (falls out of the chip
  machinery; keep the +HP/+coins tail).
- HUD: when `CHAPTERS[run.chapter].scripted` (cache like laneChapter), the timer element shows
  `WAVE n` during wave stages / `PHASE k/3` during boss stages (from run.script), and a boss HP
  bar (new thin bar element, hidden unless `run.bossBar`) renders hp/max.
- renderSummary: third badge when `d.unlockedHiddenChapter` (distinct class/copy: "⬜ THE BLANK
  REVEALED — something noticed you").

## main.js + audio.js (SFX)

- onPlay classic branch: `mutators: meta.chapter === 'blank'
  ? (CHAPTERS.blank.modsByDifficulty[chMeta.difficulty] ?? []) : randomMutators(chMeta.difficulty - 1)`.
- endRun: difficulty-unlock block caps at `chapterMaxDifficulty(run.chapter)`; onDifficulty clamp
  likewise. NEW third unlock block: classic victory, `run.chapter === 'beyond'`,
  `(run.difficulty ?? 1) >= 5` → `ensureChapterMeta(meta,'blank')`; if not already unlocked, set
  `unlocked = true` and thread `unlockedHiddenChapter: CHAPTERS.blank.name` into showScreen('summary').
- SFX_FOR_EVENT: `bossSpawn: 'bossRise'`, `bossDead: 'bossFall'`, `yank: 'zap'`.
- audio.js: two new voices in the SFX table — `bossRise` (low rising layered tones, death()-style
  layering inverted) and `bossFall` (long descending multi-voice cadence, bigger than death()).

## test/sim-test.js (TEST — after SIM+CFG land)

Append (end of file, next free run letters), style-matched (assert + PASS log + call at bottom):

1. Blank run: script spawns wave 1 (enemies alive, all rosterId in wave ids, zero elites), no
   ordinary spawning over 30s idle (enemy count only from waves).
2. Clear-advance: hard-kill all `_wave` enemies (set hp 0 via dealDamage or hp=0+step) → next wave
   spawns; timeout-advance: idle past BLANK_WAVE_TIMEOUT → next wave arrives with leftovers alive.
3. Boss stage: after 3 waves cleared, an `antibody1` exists with BLANK_BOSS_R radius and
   run.bossBar set; boss survives waveT >> timeout (phase ends only on kill).
4. Victory: kill antibody1/2/3 through the script (hard-set hp) → run.phase === 'victory'; and a
   blank run at t=305s with invulnerable player is NOT auto-victory.
5. Meta: ensureChapterMeta('blank') starts locked, maxDifficulty clamps to 3.

## Explicitly out of scope (v5.24.0)

Victory-beat delay after the final kill, bespoke boss music, per-phase arena visuals beyond the
white void, retroactive unlock for pre-existing saves (impossible — the save never recorded
won-at-5), any change to daily mode.
