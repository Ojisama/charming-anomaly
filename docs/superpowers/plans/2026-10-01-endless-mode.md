# Endless Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a per-chapter endless survival mode with no 300s victory, a quadratic difficulty ramp,
milestone elites, a mutator drip, an affixed crowd, decaying uncapped coins, and a
longest-survival leaderboard.

**Architecture:**
- An endless run is a normal classic run with `run.endless = true`.
- The sim freezes every time curve at 300s through one helper (`curveT`).
- A new `stepEndless` recomputes the difficulty multipliers and the coin multiplier from a base
  snapshot taken at `createRun`, and fires the milestones.
- Meta and UI carry the choice as an additive `endlessPicked` flag. The leaderboard uses the
  `difficulty: 0` partition and a new `survive_ms` column.

**Tech Stack:** vanilla JS (ES modules), PixiJS v8 (render only), a Cloudflare Worker + D1 for
scores, and plain-node `assert` scenarios in `test/sim-test.js`.

**Spec:** `docs/superpowers/specs/2026-10-01-endless-mode-design.md` (rev 2). Read it before any
task.

## Global Constraints

- **Balance numbers live in `config.js` as named exports.** No magic numbers in sim.js.
- **`sim.js` never touches Pixi, DOM or localStorage. `render.js` never writes `run`.**
- **Meta is additive only.** New fields are `meta.chapters[id].endlessPicked` (boolean) and
  `meta.chapters[id].endlessBest` (ms), read with `?? false` and `?? 0`. No SCHEMA bump, no rename.
- **Eligible chapters:**
  `Object.keys(CHAPTERS).filter(id => !CHAPTERS[id].scripted && !CHAPTERS[id].circuit)`. Never
  `CHAPTER_ORDER`.
- **Unlock:** `meta.chapters[id].won >= CHAPTER_UNLOCK_DIFFICULTY`, and
  `!isWipChapter(id) || meta.dev`.
- **Ship behind the dev gate first.** The ∞ pip renders only when `meta.dev` is on, until the
  owner has playtested (memory: ship-behind-the-dev-gate). Removing that gate is the last task.
- **Every new sim event** needs a render consumer and an `SFX_FOR_EVENT` entry or a
  `SILENT_BY_DESIGN` line (run EV).
- **Every enemy push** goes through `spawnEnemy`/`flushSpawns` (run SQ).
- **Every new player-visible string** goes in a config TABLE with `.name`/`.desc` one level deep,
  plus an `fr.js` entry (run XX). French wording is drafted and then **confirmed with the owner via
  AskUserQuestion** (memory: french-copy-ask-the-owner).
- **Icons:** inline SVG, never emoji (memory: draw-ui-icons-dont-use-emoji).
- **Balance comments** use one line: `// balance_decision : <≤10 words> 2026-10-..`.
- **No `any`, no `eslint-disable`, and no Claude signature in commits.** Any commit message
  containing backticks goes through `git commit -F <file>`.
- **Mutation-prove every new scenario** in a scratch tree made with
  `git archive HEAD | tar -x -C <tmp>`, never in the working tree.
- **`npm test` is the gate.** A render or worker change also needs its own check: a shot
  (render) or `worker/test.sh` (worker).

## File map

| File | What changes |
|---|---|
| `src/config.js` | Endless constants; `endlessLevel`, `endlessAffixChance`, `endlessEligible`, `endlessUnlocked`; export `mutatorPool`; `ENDLESS_COPY` table |
| `src/state.js` | `createRun` reads `opts.endless`, skips `EARLY_CALM`, stores `run.endless` and `_endlessBase`; doc block updated; `ensureChapterMeta` leaves the new fields alone |
| `src/sim.js` | `curveT` helper at every curve site; victory gate; `stepEndless` (ramp, coins, milestones); `spawnEnemy` gains `forceElite` and the crowd roll; affix gates widened; coin cap bypass |
| `src/main.js` | `onEndless` hook, `pendingPlay.endless`, `startClassic(…, endless)`, `endRun` gating and `endlessBest`, explicit `difficulty: 0` submission, `SFX_FOR_EVENT.endlessMutator` |
| `src/ui.js` | ∞ pip, HUD count-up and level, milestone banner, summary line, endless board branch |
| `src/render.js` | Affix badge gate for `affixVisible`; banner for `endlessMutator` (if not in ui.js) |
| `src/scores.js` | `submitScore` forwards `surviveMs`; `podiumRank` reads `boards.survive` |
| `src/fr.js` | French for `ENDLESS_COPY` |
| `src/styles.css` | ∞ pip and HUD level styles |
| `worker/migrate-scores-survive.sql`, `worker/schema.sql`, `worker/src/index.js`, `worker/test.sh` | `survive_ms` column and index, difficulty 0..9, the survive board |
| `test/sim-test.js` | One scenario per task, each mutation-proved |
| `scripts/endless-probe.mjs` | The balance probe (Task 9) |

---

### Task 1: Config surface

**Files:**
- Modify: `src/config.js`. Add the constants near the difficulty block (~5261-5292). Change
  `const mutatorPool` (~5315) to `export const mutatorPool`.
- Test: `test/sim-test.js` (new `testEndlessConfig`).

**Interfaces:**
- Produces:
  - `ENDLESS_RAMP_A`, `ENDLESS_RAMP_B`, `ENDLESS_MILESTONE_S`, `ENDLESS_MILESTONE_ELITES`,
    `ENDLESS_AFFIX_FROM`, `ENDLESS_AFFIX_PER_LEVEL`, `ENDLESS_AFFIX_MAX`,
    `ENDLESS_COIN_HALF_LIFE_S`, `ENDLESS_GILDED_COINS` (number exports);
  - `endlessLevel(t: number): number`;
  - `endlessAffixChance(d: number): number`;
  - `endlessEligible(id: string): boolean`;
  - `endlessUnlocked(meta, id: string): boolean`;
  - `mutatorPool(chapterId: string): string[]` (now exported).

- [ ] **Step 1: Write the failing test.** Append the scenario next to `testVictory` and register it
  with `run(testEndlessConfig)` next to the other `run(...)` calls. Import the new names in the
  config import block at the top.

```js
function testEndlessConfig() {
  // ramp: D1 at 0, monotone, quadratic (second differences constant and positive)
  assert.strictEqual(endlessLevel(0), 1)
  const l = [0, 60, 120, 180].map(endlessLevel)
  assert.ok(l[1] > l[0] && l[2] > l[1] && l[3] > l[2], `ramp not increasing: ${l}`)
  const d2a = l[2] - 2 * l[1] + l[0], d2b = l[3] - 2 * l[2] + l[1]
  assert.ok(d2a > 0 && Math.abs(d2a - d2b) < 1e-9, `ramp not quadratic: ${d2a} ${d2b}`)
  // affix chance: 0 until FROM, clamped at MAX
  assert.strictEqual(endlessAffixChance(1), 0)
  assert.strictEqual(endlessAffixChance(ENDLESS_AFFIX_FROM), 0)
  assert.ok(endlessAffixChance(ENDLESS_AFFIX_FROM + 1) > 0)
  assert.strictEqual(endlessAffixChance(1e6), ENDLESS_AFFIX_MAX)
  // eligibility over the HONEST denominator
  const all = Object.keys(CHAPTERS)
  const elig = all.filter(endlessEligible)
  for (const id of ['blank', 'kraken', 'reef']) assert.ok(!elig.includes(id), `${id} must be excluded`)
  for (const id of ['body', 'deep', 'trawl']) assert.ok(elig.includes(id), `${id} must be eligible`)
  // unlock gate on won
  const m = makeMeta()
  ensureChapterMeta(m, 'body').won = 2
  assert.ok(!endlessUnlocked(m, 'body'), 'won=2 must not unlock')
  m.chapters.body.won = 3
  assert.ok(endlessUnlocked(m, 'body'), 'won=3 must unlock')
  ensureChapterMeta(m, 'kraken').won = 5
  assert.ok(!endlessUnlocked(m, 'kraken'), 'boss chapter never unlocks endless')
  console.log(`PASS run EN.a (endless config): ${elig.length}/${all.length} chapters eligible`)
}
```

- [ ] **Step 2: Run it.** `npm test testEndlessConfig`. Expected: FAIL with an import error
  (`endlessLevel` is not exported).

- [ ] **Step 3: Implement** in config.js, after `difficultyCoinMul`:

```js
// ---- Endless mode (spec 2026-10-01-endless-mode-design.md) ----
// balance_decision : placeholder ramp, Task 9 probe sets A/B 2026-10-01
export const ENDLESS_RAMP_A = 0.5   // levels per minute, linear term
export const ENDLESS_RAMP_B = 0.05  // levels per minute², quadratic term
export const endlessLevel = (t) => { const m = Math.max(0, t) / 60; return 1 + ENDLESS_RAMP_A * m + ENDLESS_RAMP_B * m * m }
export const ENDLESS_MILESTONE_S = 120
export const ENDLESS_MILESTONE_ELITES = 3
export const ENDLESS_AFFIX_FROM = 3
export const ENDLESS_AFFIX_PER_LEVEL = 0.07
export const ENDLESS_AFFIX_MAX = 0.5
export const endlessAffixChance = (d) => Math.min(ENDLESS_AFFIX_MAX, Math.max(0, (d - ENDLESS_AFFIX_FROM) * ENDLESS_AFFIX_PER_LEVEL))
export const ENDLESS_COIN_HALF_LIFE_S = 60
export const ENDLESS_GILDED_COINS = 3
export const endlessEligible = (id) => !!CHAPTERS[id] && !CHAPTERS[id].scripted && !CHAPTERS[id].circuit
export const endlessUnlocked = (meta, id) => endlessEligible(id)
  && (meta?.chapters?.[id]?.won ?? 0) >= CHAPTER_UNLOCK_DIFFICULTY
  && (!isWipChapter(id) || meta?.dev === true)
```

`CHAPTERS` and `isWipChapter` are declared further down the file. This works because both are
only read inside the arrow bodies, at call time. If `isWipChapter` is declared with `function`,
it is hoisted anyway. Change `const mutatorPool =` to `export const mutatorPool =`.

- [ ] **Step 4: Run it.** `npm test testEndlessConfig`. Expected: PASS.

- [ ] **Step 5: Mutation-prove** in a scratch tree:
  - `won >= CHAPTER_UNLOCK_DIFFICULTY` → `won >= 2` must FAIL;
  - removing `!CHAPTERS[id].circuit` must FAIL;
  - `ENDLESS_RAMP_B = 0` must FAIL.

- [ ] **Step 6: Commit.** `git commit -m "feat(endless): config surface"`.

---

### Task 2: Run flag, no timer victory, curves frozen at 300s

**Files:**
- Modify: `src/state.js`.
  - In `createRun` (~2481-2597), read `opts.endless` and gate `EARLY_CALM` on `!endless`.
  - Add `endless` and `_endlessBase` to the returned object.
  - Document both in the run doc block.
- Modify: `src/sim.js`.
  - Victory gate at line 316.
  - Add `curveT` and use it at every curve call site.
- Modify: `src/config.js:1015`. Chaos Pact's `when` gate:
  `(r) => r.endless || (RUN_DURATION - (r.time ?? 0)) >= CHAOS_PACT_MIN_REMAINING`.
- Test: `testEndlessNoVictory`, `testEndlessCurvesFrozen`.

**Interfaces:**
- Produces:
  - `run.endless: boolean`;
  - `run._endlessBase: { enemySpeedMul, spawnMul, maxAliveMul, enemyDmgMul, coinMul } | null`,
    each value divided out by its D1 multiplier (all `1` at D1, so it equals the mods snapshot);
  - `curveT(run): number` (sim.js, module-private).

- [ ] **Step 1: Write the failing tests.**

```js
function testEndlessNoVictory() {
  const run = createRun(makeMeta(), { chapter: 'body', endless: true })
  assert.strictEqual(run.endless, true)
  run.player.hp = run.player.maxHP = 1e12
  advance(run, 305, 1 / 60, { x: 1, y: 0 })
  assert.strictEqual(run.phase, 'playing', `endless must not win at 300s, got ${run.phase}`)
  const ctl = createRun(makeMeta(), { chapter: 'body' })
  ctl.player.hp = ctl.player.maxHP = 1e12
  advance(ctl, 305, 1 / 60, { x: 1, y: 0 })
  assert.strictEqual(ctl.phase, 'victory', 'control run must still win at 300s')
  console.log('PASS run EN.b (endless: no timer victory)')
}

// EFFECT, not state: an enemy born at t=600 in endless has the same hp per base hp as one born at
// t=300. HP carries no difficulty term, so only the TIME curve could differ. Milestones are off so
// no drip (bulky/jumbo touch enemyHpMul) or forced elite can land. Elites are excluded by type
// filter, and the ratio is taken per (type, rosterId) so roster hpMul cannot vary between arms.
function testEndlessCurvesFrozen() {
  const ratios = (t) => {
    Math.random = mulberry32(20261001)
    const run = createRun(makeMeta(), { chapter: 'beyond', endless: true })
    run.player.hp = run.player.maxHP = 1e12
    run.time = t
    run._endlessNextMilestone = Infinity
    run._nextEliteAt = Infinity
    advance(run, 3, 1 / 60, { x: 1, y: 0 })
    const out = new Map()
    for (const e of run.enemies) if (!e.elite) out.set(`${e.type}/${e.rosterId}`, e.maxHP / ENEMIES[e.type].hp)
    return out
  }
  const a = ratios(300), b = ratios(600)
  const shared = [...a.keys()].filter((k) => b.has(k))
  assert.ok(shared.length > 0, 'no common enemy kind between arms')
  for (const k of shared) assert.ok(Math.abs(b.get(k) - a.get(k)) / a.get(k) < 0.02, `${k}: ${a.get(k)} vs ${b.get(k)}`)
  // Control: the shipped curve itself keeps ramping (a normal run at t=600 cannot spawn: the
  // victory gate returns first, so the control is the pure function).
  assert.ok(hpScale(600, lateRateFor('beyond')) > 2 * hpScale(300, lateRateFor('beyond')))
  console.log(`PASS run EN.c (curves frozen): ${shared.length} kinds compared at 300 vs 600`)
}
```

`hpScale` rounds HP to an integer, which is why the tolerance is 2%. Register both with `run(...)`.

- [ ] **Step 2: Run them.** `npm test testEndless`. Expected: EN.b FAILS (the endless run reaches
  victory) and EN.c FAILS (hp keeps ramping).

- [ ] **Step 3: Implement state.js.**

```js
  const endless = opts.endless === true
  const difficulty = endless ? 1 : (opts.difficulty ?? 1)
  ...
  const calm = !endless && opts.difficulty === 1 ? EARLY_CALM[chapter] : null
  ...
  // returned object:
    endless,
    _endlessBase: endless ? { enemySpeedMul: mods.enemySpeedMul, spawnMul: mods.spawnMul, maxAliveMul: mods.maxAliveMul, enemyDmgMul: mods.enemyDmgMul, coinMul: mods.coinMul } : null,
```

Snapshot `_endlessBase` AFTER the chapter-balance block. D1 multipliers are all 1, so the snapshot
is already the base.

- [ ] **Step 4: Implement sim.js.**

```js
// Endless freezes every TIME curve at RUN_DURATION: past it, the endless level is the only escalator.
const curveT = (run) => (run.endless ? Math.min(run.time, RUN_DURATION) : run.time)
```

- Victory gate (line 316): add `&& !run.endless`.
- Then replace `run.time` with `curveT(run)` as the curve argument at every site this grep
  prints:

```bash
grep -nE "(hpScale|spawnRate|dmgScale|speedCreepMul|eliteEveryAt|spawnTiltMul|lateSpawnMulAt|waveWeights|mowerDmgAt)\(run\.time|spawnTiltMul\([^)]*run\.time|lateSpawnMulAt\([^)]*run\.time" src/sim.js
```

  Known sites today: 613, 1175 (three curves on one line), 1230, 4029, 4033 (`waveWeights`), 4147,
  4148, 4159, 5537, 8057, 8688, 9227, and the `mowerDmgAt` caller. Re-run the grep afterwards: it
  must print nothing.
- `rollAffixes`' `run.time >= AFFIX_SECOND_AT` is a threshold, not a curve. Leave it alone.

- [ ] **Step 5: Update the HUD countdown** (ui.js ~2506). In the `else` branch:

```js
      const remain = run.endless ? Math.floor(run._realTime ?? 0) : Math.max(0, Math.ceil(RUN_DURATION - run.time))
```

  That is a count-up. The level label lands in Task 7.

- [ ] **Step 6: Run the tests.** `npm test testEndless`. Expected: PASS. Then run the full gate,
  `npm test`. Expected: ALL TESTS PASSED, because normal runs are untouched (`curveT` returns
  `run.time`).

- [ ] **Step 7: Mutation-prove.**
  - Drop `&& !run.endless` from the victory gate → EN.b fails.
  - Revert the 4147 site to `run.time` → EN.c fails.

- [ ] **Step 8: Commit.** `git commit -m "feat(endless): run flag, no timer victory, frozen time curves"`.

---

### Task 3: `stepEndless`, the ramp and coin decay with no cap

**Files:**
- Modify: `src/sim.js`.
  - Add `stepEndless(run, dt)` and call it in `stepSim` right after `flushSpawns(run)`.
  - In `stepPickups` (~14536-14549), skip the cap when `run.endless`.
- Modify: `src/main.js:749-751`. The kill bonus uses `difficultyCoinMul(1)` in endless, with no cap.
- Test: `testEndlessRamp`, `testEndlessCoins`.

**Interfaces:**
- Consumes: `endlessLevel`, `ENDLESS_COIN_HALF_LIFE_S`, `run._endlessBase` and the difficulty
  multiplier functions.
- Produces: `run.difficulty` (a float in endless), and live `run.mods.{enemySpeedMul, spawnMul,
  maxAliveMul, enemyDmgMul, coinMul}`.

- [ ] **Step 1: Write the failing tests.**

```js
// Pure arithmetic, so it JUMPS the clock: 20 simulated minutes cost ~25s and would set the gate floor.
function testEndlessRamp() {
  const run = createRun(makeMeta(), { chapter: 'body', endless: true })
  run.player.hp = run.player.maxHP = 1e12
  run._endlessNextMilestone = Infinity   // no drip: it would rewrite _endlessBase under the assertion
  const base = { ...run._endlessBase }
  run.time = 20 * 60
  stepSim(run, { x: 0, y: 0 }, 1 / 60)
  const d = endlessLevel(run.time)
  assert.ok(Math.abs(run.difficulty - d) < 1e-9, `difficulty ${run.difficulty} != ${d}`)
  const want = base.enemyDmgMul * difficultyDmgMul(d)
  assert.ok(Math.abs(run.mods.enemyDmgMul - want) < 1e-9, `drift: ${run.mods.enemyDmgMul} vs ${want}`)
  assert.ok(Math.abs(run.mods.enemySpeedMul - base.enemySpeedMul * difficultySpeedMul(d)) < 1e-9)
  assert.ok(Math.abs(run.mods.maxAliveMul - base.maxAliveMul * difficultyCountMul(d)) < 1e-9)
  console.log(`PASS run EN.d (endless ramp): d=${d.toFixed(2)} at ${(run.time / 60).toFixed(1)}min, dmgMul=${run.mods.enemyDmgMul.toFixed(3)}`)
}

function testEndlessCoins() {
  const run = createRun(makeMeta(), { chapter: 'body', endless: true })
  run.player.hp = run.player.maxHP = 1e12
  run._endlessNextMilestone = Infinity   // 5 of body's 9 pool mutators carry coinMul
  const c0 = run._endlessBase.coinMul
  // advance() spends a step per level-up without advancing time, so assert against run.time, not 120
  advance(run, 120, 1 / 30, { x: 1, y: 0 })
  const want = c0 * Math.pow(0.5, run.time / 60)
  assert.ok(run.time > 100 && Math.abs(run.mods.coinMul - want) < 1e-9 * c0, `coinMul ${run.mods.coinMul} != ${want} at t=${run.time}`)
  // cap bypass: force a big coin through the shipped path (coins live in run.coins as {x,y,value})
  run.coinsEarned = COIN_CAP_PER_RUN - 1
  run.mods.coinMul = 1
  const before = run.coinsEarned
  run.coins.push({ x: run.player.x, y: run.player.y, value: 50 })
  stepSim(run, { x: 0, y: 0 }, 1 / 60)
  assert.ok(run.coinsEarned > COIN_CAP_PER_RUN, `endless must not cap: ${run.coinsEarned}`)
  console.log(`PASS run EN.e (endless coins): x${(run.mods.coinMul).toFixed(2)} after reset, earned ${before}->${run.coinsEarned}`)
}
```

Confirm the `run.coins` entry shape and the collection radius in `stepPickups` (~14500-14550)
before running. Then assert the same thing against a normal run in the same scenario (it must stay
≤ `COIN_CAP_PER_RUN`), so the control is part of the test.

**Probe hook (lands here, used in Task 9):** `stepEndless` reads
`const d = run._endlessPinLevel ?? endlessLevel(run.time)`. It is a probe-only override; mark it
with a one-line comment.

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement.**

```js
// ENDLESS (spec 2026-10-01): the level climbs on run.time; every difficulty mul is recomputed from
// the createRun base, never chained, so thousands of steps cannot drift.
function stepEndless(run) {
  if (!run.endless) return
  const d = endlessLevel(run.time)
  run.difficulty = d
  const b = run._endlessBase
  run.mods.enemySpeedMul = b.enemySpeedMul * difficultySpeedMul(d)
  run.mods.spawnMul = b.spawnMul * difficultyCountMul(d)
  run.mods.maxAliveMul = b.maxAliveMul * difficultyCountMul(d)
  run.mods.enemyDmgMul = b.enemyDmgMul * difficultyDmgMul(d)
  run.mods.coinMul = b.coinMul * Math.pow(0.5, run.time / ENDLESS_COIN_HALF_LIFE_S)
  stepEndlessMilestones(run)   // Task 4; define as an empty function now
}
```

  - **Pickup cap** (`stepPickups`): `run.coinsEarned = run.endless ? run.coinsEarned + whole : Math.min(COIN_CAP_PER_RUN, run.coinsEarned + whole)`.
    Check the "pickups past the cap still sparkle" branch at ~14536 and gate it the same way.
  - **`endRun`** (main.js):

```js
  const bonus = Math.round(runBonusCoins(run.kills, run.player.level) * difficultyCoinMul(run.endless ? 1 : (run.difficulty ?? 1)))
  const earned = run.endless ? run.coinsEarned + bonus : Math.min(COIN_CAP_PER_RUN, run.coinsEarned + bonus)
```

- [ ] **Step 4: Run them.** Expected: PASS. Then `npm test`.
- [ ] **Step 5: Mutation-prove.**
  - Delete the `stepEndless` call → EN.d fails.
  - Use `difficultyCountMul` for `enemyDmgMul` → EN.d fails.
  - Remove the endless cap bypass → EN.e fails.
  - Remove the halving → EN.e fails.
- [ ] **Step 6: Commit.**

---

### Task 4: Milestones, the forced elite wave and the mutator drip

**Files:**
- Modify: `src/sim.js`.
  - `spawnEnemy` (~4021-4029). Today the bump is inside `if (isElite)`, so split the condition:

```js
  const cadence = !opts.forceNormal && run.time >= run._nextEliteAt
  const isElite = opts.forceElite === true || cadence
  if (cadence) { /* the existing eliteSurge + _nextEliteAt bump, unchanged */ }
```
  - `stepEndlessMilestones`.
- Modify: `src/main.js`. Add `endlessMutator: '<existing sfx name, e.g. the elite-arrival one>'`
  to `SFX_FOR_EVENT` (~534). Pick from the existing synth names; do not invent one.
- Modify: `src/ui.js` or `src/render.js`. The banner consumer for `endlessMutator` (Task 7 styles
  it; here a minimal consumer so run EV passes). Read how an existing banner-style event (e.g.
  `levelup` or an anomaly toast) is consumed and reuse it.
- Modify: `src/state.js`. Document the `endlessMutator` event and `run._endlessNextMilestone` in
  the doc block.
- Test: `testEndlessMilestones`.

**Interfaces:**
- Consumes: `mutatorPool`, `MUTATORS`, `ENDLESS_MILESTONE_S`, `ENDLESS_MILESTONE_ELITES`.
- Produces: the `{ type: 'endlessMutator', id: string }` event; `run._endlessNextMilestone`;
  `spawnEnemy(run, { forceElite: true })`.

- [ ] **Step 1: Write the failing test.**

```js
function testEndlessMilestones() {
  Math.random = mulberry32(20261002)
  const run = createRun(makeMeta(), { chapter: 'body', endless: true })
  run.player.hp = run.player.maxHP = 1e12
  run._nextEliteAt = 1e9                    // isolate the forced wave from the cadence
  const cadence = run._nextEliteAt
  const pool = mutatorPool('body')
  run.time = ENDLESS_MILESTONE_S - 0.5   // jump the clock: advance() under-runs time on level-ups
  stepSim(run, { x: 0, y: 0 }, 1 / 60)
  assert.strictEqual(run.mutators.length, 0, 'no drip before the first milestone')
  const elitesBefore = run.enemies.filter((e) => e.elite).length
  while (run.time < ENDLESS_MILESTONE_S + 0.1) stepSim(run, { x: 0, y: 0 }, 1 / 60)
  stepSim(run, { x: 0, y: 0 }, 1 / 60)   // flushSpawns on the next step
  assert.strictEqual(run.mutators.length, 1, 'one mutator per milestone')
  const id = run.mutators[0]
  assert.ok(pool.includes(id), `${id} not in body's pool`)
  for (const [k, v] of Object.entries(MUTATORS[id].effects)) {
    if (['enemySpeedMul', 'spawnMul', 'maxAliveMul', 'enemyDmgMul', 'coinMul'].includes(k)) {
      assert.ok(Math.abs(run._endlessBase[k] / createRun(makeMeta(), { chapter: 'body', endless: true })._endlessBase[k] - v) < 1e-9, `${k} not folded into the base`)
    }
  }
  const elitesAfter = run.enemies.filter((e) => e.elite).length
  assert.ok(elitesAfter - elitesBefore >= ENDLESS_MILESTONE_ELITES, `forced elites: +${elitesAfter - elitesBefore}`)
  assert.strictEqual(run._nextEliteAt, cadence, 'forced elites must not move the cadence')
  // drip exhausts cleanly: jump milestone by milestone, one step each (cheap)
  for (let i = 0; i < pool.length + 2; i++) { run.time = run._endlessNextMilestone; stepSim(run, { x: 0, y: 0 }, 1 / 60) }
  assert.strictEqual(new Set(run.mutators).size, run.mutators.length, 'no duplicate drip')
  assert.ok(run.mutators.length <= pool.length)
  console.log(`PASS run EN.f (milestones): first drip ${id}, +${elitesAfter - elitesBefore} elites, pool ${pool.length}`)
}
```

Effects keyed on mods outside the five base keys must still land in `run.mods` directly. Add an
assertion for one such mutator if the pool has one (read `MUTATORS` for a key like `enemyHpMul`).
The test above counts elites **including ones still queued**, so if the forced elites go through
`deferred`, count `run._spawnQueue` too. Read `flushSpawns` first.

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**

```js
function stepEndlessMilestones(run) {
  run._endlessNextMilestone ??= ENDLESS_MILESTONE_S
  if (run.time < run._endlessNextMilestone) return
  run._endlessNextMilestone += ENDLESS_MILESTONE_S
  for (let i = 0; i < ENDLESS_MILESTONE_ELITES; i++) spawnEnemy(run, { forceElite: true })
  const pool = mutatorPool(run.chapter).filter((id) => !run.mutators.includes(id))
  if (pool.length === 0) return
  const id = pool[Math.floor(Math.random() * pool.length)]
  run.mutators.push(id)
  for (const [k, v] of Object.entries(MUTATORS[id].effects)) {
    if (k in run._endlessBase) run._endlessBase[k] *= v
    else run.mods[k] *= v
  }
  run.events.push({ type: 'endlessMutator', id })
}
```

`run.mutators` is the array createRun was given (`opts.mutators ?? []`). Make createRun copy it
(`[...(opts.mutators ?? [])]`) so the drip never mutates the caller's `pendingPlay` array.

- [ ] **Step 4: Run it.** Expected: PASS, plus `npm test EV` and `npm test SQ` green.
- [ ] **Step 5: Mutation-prove.**
  - Drop the `!run.mutators.includes` filter → duplicates.
  - Let `forceElite` move the cadence → the cadence assertion fails.
  - Delete the `SFX_FOR_EVENT` entry → run EV fails.
- [ ] **Step 6: Commit.**

---

### Task 5: The affixed crowd, with every affix ungated

**Files:**
- Modify: `src/sim.js`.
  - The `spawnEnemy` roll (~4163).
  - Widen the gates at 4164 (gilded HP), 5680 (volatile on the submission end), 9314 (shielded),
    9488 (splitter) and 9496 (volatile).
  - A gilded-normal coin payout in the death path next to 9464.
- Modify: `src/render.js:28265`. `const affixes = (e.elite || e.affixVisible) ? e.affixes : null`.
  Check the shield tell at ~29056, which already reads `e.affixes`, so it now matches the sim.
- Modify: `src/state.js`. Document `enemy.affixVisible`.
- Test: `testEndlessCrowdAffixes`.

**Interfaces:**
- Consumes: `endlessAffixChance`, `rollAffixes`, `ENDLESS_GILDED_COINS`.
- Produces: `enemy.affixVisible: boolean`, and the helper `hasAffix(e, id)` (sim.js, private):
  `(e.elite || e.affixVisible) && e.affixes && e.affixes.includes(id)`.

- [ ] **Step 1: Write the failing test.**

```js
function testEndlessCrowdAffixes() {
  Math.random = mulberry32(20261003)
  const mk = (t) => {
    const run = createRun(makeMeta(), { chapter: 'body', endless: true })
    run.player.hp = run.player.maxHP = 1e12
    run._nextEliteAt = 1e9
    run._endlessNextMilestone = 1e9
    run.time = t
    return run
  }
  // D1: none
  const low = mk(0)
  advance(low, 30, 1 / 30, { x: 1, y: 0 })
  assert.ok(low.enemies.every((e) => e.elite || e.affixes.length === 0), 'no crowd affixes at D1')
  // high level: a material share, exactly one each, all visible
  const hi = mk(60 * 30)
  advance(hi, 30, 1 / 30, { x: 1, y: 0 })
  const normals = hi.enemies.filter((e) => !e.elite)
  const aff = normals.filter((e) => e.affixes.length > 0)
  assert.ok(normals.length >= 100, `denominator too small: ${normals.length}`)
  assert.ok(aff.length / normals.length > ENDLESS_AFFIX_MAX * 0.6, `share ${aff.length}/${normals.length}`)
  assert.ok(aff.every((e) => e.affixVisible && e.affixes.filter((a) => a !== 'anchored').length === 1))
  // splitter children never carry an affix
  assert.ok(hi.enemies.filter((e) => e.type === 'wisp').every((e) => e.affixes.length === 0), 'wisp rolled an affix')
  // EFFECTS: shielded normal takes reduced damage; volatile normal leaves a bomb
  const s = aff.find((e) => e.affixes.includes('shielded'))
  // build a fresh enemy rather than relying on the roll for each effect check:
  // read how other scenarios call dealDamage on a hand-made enemy (grep "dealDamage(run" test/sim-test.js)
  console.log(`PASS run EN.g (crowd affixes): ${aff.length}/${normals.length} affixed at d=${hi.difficulty.toFixed(1)}`)
}
```

Before Step 2, complete the two **effect** checks. `spawnEnemy` and `dealDamage` are not exported,
so use `makeStatusEnemy` (test/sim-test.js:3287) and the shipped step path it is used with.
Also set `run._endlessNextMilestone = Infinity` in `mk`.
The two checks are:
- a normal enemy with `affixes: ['shielded'], affixVisible: true` loses
  `dmg * SHIELD_DMG_MUL` per hit, against `dmg` with `affixVisible: false`;
- a normal enemy with `affixes: ['volatile'], affixVisible: true`, killed, leaves
  `run.bombs.length + 1`.

The unflagged control must take full damage and leave no bomb. That keeps The Blank's Antibody,
whose `anchored` is unflagged, safe.

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.**

```js
  // spawnEnemy, replacing `const affixes = isElite ? rollAffixes(run) : []`
  let affixes = isElite ? rollAffixes(run) : []
  let affixVisible = false
  if (!isElite && run.endless && !opts.forceNormal && !opts.deferred && Math.random() < endlessAffixChance(run.difficulty)) {
    affixes = rollAffixes(run).filter((a) => a !== 'anchored').slice(0, 1)
    affixVisible = affixes.length > 0
  }
  if ((isElite || affixVisible) && affixes.includes('gilded')) hp *= GILDED_HP_MUL
  // born: add `affixVisible,`
```

- Replace each `enemy.elite && enemy.affixes && enemy.affixes.includes('X')` (and
  `e.elite && …`) at 5680, 9314, 9488 and 9496 with `hasAffix(enemy, 'X')`.
- **Leave 9468's elite coin block alone**; the elite payout stays keyed on `e.elite`.
- Add, in the non-elite death path:
  `if (!enemy.elite && hasAffix(enemy, 'gilded'))` drop `ENDLESS_GILDED_COINS` coins. Copy the
  elite block's exact drop form (sim.js:9463-9479): coins go into `run.coins` as `{x, y, value}`,
  and the drop must respect `paid` and `coinDropMul` exactly as that block does.
- Check the splitter's child spawn passes `forceNormal: true, deferred: true` (it does at 9492),
  so the roll guard covers it.

- [ ] **Step 4: Run it.** Expected: PASS, and the `npm test` gate is green. That gate includes the
  Blank scenarios, which prove the Antibody's `anchored` is unaffected.
- [ ] **Step 5: Mutation-prove.**
  - Drop `!opts.forceNormal` → the wisp assertion fails. (`!opts.deferred` is redundant: splitter
    wisps pass `forceNormal`, and split-flag children go straight to `_spawnQueue` at sim.js:4305,
    so dropping it cannot fail.)
  - Revert the shielded gate to `enemy.elite` → the effect check fails.
  - Set `affixVisible = false` → the visibility assertion fails.
- [ ] **Step 6: Shoot a frame.** Load `probing-the-game`. Use `scripts/shot.mjs` with a seed script
  that starts an endless body run at `run.time = 1800`. Confirm that normal enemies show one
  affix badge and that a shielded one shows the bubble. Send the PNG to the owner.
- [ ] **Step 7: Commit.**

---

### Task 6: Meta, the run wiring and `endRun`

**Files:**
- Modify: `src/main.js`.
  - `onPlay` (~185-200): build
    `pendingPlay = { chapter, difficulty, mutators, endless }`, where `endless` is
    `chMeta.endlessPicked === true && endlessUnlocked(meta, chapterId)`, and in endless use
    `mutators = []`.
  - `onBriefStart` → `startClassic(p.chapter, p.difficulty, p.mutators, consumableIds, p.endless)`.
  - `startClassic` passes `endless` to `createRun`.
  - New hook `onEndless(on)` sets `chMeta.endlessPicked = !!on`, saves and clicks.
  - `onDifficulty` sets `chMeta.endlessPicked = false`, so picking a number pip leaves ∞.
  - `endRun`: gate `meta.best.time` and `chMeta.best.time` on `!run.endless`, and write
    `chMeta.endlessBest = Math.max(chMeta.endlessBest ?? 0, Math.round((run._realTime ?? run.time) * 1000))`
    when `run.endless`.
- Modify: `src/ui.js`. Document `onEndless(on)` in the hook contract block (~290-303).
- Modify: `src/state.js`. Document both new chapter fields at ~144-170. `ensureChapterMeta` must
  NOT touch them: read it and confirm it rebuilds no object that would drop unknown keys.
- Test: `testEndlessMeta`.

**Interfaces:**
- Produces: the `hooks.onEndless(on: boolean)` hook, `chMeta.endlessPicked`, `chMeta.endlessBest`,
  and a 5th `startClassic` argument.

main.js is not importable, so the scenario tests what IS: the state side plus source-text
contracts for the main.js wiring (the run UG.k idiom).

- [ ] **Step 1: Write the failing test.**

```js
function testEndlessMeta() {
  const m = makeMeta()
  const c = ensureChapterMeta(m, 'body')
  c.endlessPicked = true
  c.endlessBest = 123456
  const again = ensureChapterMeta(m, 'body')
  assert.strictEqual(again.endlessPicked, true, 'ensureChapterMeta dropped endlessPicked')
  assert.strictEqual(again.endlessBest, 123456)
  // round-trip through load keeps them (additive fields). node has no localStorage: use the
  // suite's loadMetaFrom(blob) shim (test/sim-test.js:298), never saveMeta/loadMeta directly.
  const loaded = loadMetaFrom(JSON.parse(JSON.stringify(m)))
  assert.strictEqual(loaded.chapters.body.endlessPicked, true)
  assert.strictEqual(loaded.chapters.body.endlessBest, 123456)
  // main.js contracts, as source text (render/main are not importable)
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  assert.match(main, /createRun\(meta, \{[^}]*endless[^}]*\}\)/, 'startClassic must forward endless to createRun')
  assert.match(main, /if \(!run\.endless\)[^\n]*best\.time|!run\.endless[\s\S]{0,200}best\.time/, 'best.time must be gated on !run.endless')
  console.log('PASS run EN.h (endless meta + main wiring)')
}
```

The `difficulty: 0` submission assertion belongs to Task 8 (run LB extension), not here.

**Also in this task, so the summary can show endless:**
- `summaryData` (main.js:881) carries `endless: run.endless` and `endlessBest`.
- The brief screen (ui.js:3137) shows "∞" instead of a D-number when `endless`, with no
  anomaly list.
- The brief's reroll is hidden for endless runs.
- The closed-page `leaderLine(…, chMeta.difficulty)` and the "difficulty {n}" line (ui.js:963,
  1002) read difficulty 0 when `endlessPicked`.

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement** as listed in Files.
- [ ] **Step 4: Run it.** Expected: PASS, then `npm test`.
- [ ] **Step 5: Mutation-prove.**
  - Remove the `best.time` gate → fails.
  - Drop `endless` from the `createRun` call → fails.
- [ ] **Step 6: Commit.**

---

### Task 7: UI (∞ pip, HUD level, banner, summary, copy)

**Files:**
- Modify: `src/ui.js`.
  - The title pip row (~945-950): after the numbered pips, when
    `meta.dev && endlessUnlocked(meta, browseChapterId)`, render
    `<button class="diff-pip diff-pip--endless${chMeta.endlessPicked ? ' diff-pip--on' : ''}" data-act="endless" aria-label="${t(ENDLESS_COPY.pip.name)}">${INFINITY_SVG}</button>`.
  - While `endlessPicked`, the numbered pips render un-lit.
  - Click handler: `case 'endless': hooks.onEndless(!selectedChapterMeta(meta).endlessPicked); updateTitleBelow(); break`.
  - **HUD:** `hud.timerK` (the caption slot under the timer) shows `∞ ${run.difficulty.toFixed(1)}`
    in endless. Today it is written only on the circuit toggle (ui.js:2411), so add a per-frame
    write cached on `last.endlessK` (the same idiom as `last.remain`).
  - **The count-up uses `run._realTime`, not `run.time`,** so the HUD matches the board's unit
    under Time Debt. Correct Task 2's count-up line accordingly.
  - **Banner** on `endlessMutator`: `t(MUTATORS[id].name)`, the existing translated name, prefixed
    with `t(ENDLESS_COPY.milestone.name)`.
  - **Summary** for an endless run: the survival time and `t(ENDLESS_COPY.best.name)` + `fmtTime(endlessBest/1000)`.
- Modify: `src/config.js`. Add the `ENDLESS_COPY` table:
  `{ pip: { name: 'Endless' }, milestone: { name: 'Mutation' }, best: { name: 'Best' }, survived: { name: 'Survived' } }`.
  run XX's walk is NOT automatic. Import `ENDLESS_COPY` in the test file and add it to the
  explicit table list at test/sim-test.js:18645.
- Modify: `src/fr.js`. Add the French drafts, then **AskUserQuestion the owner with 2-3 options per
  string** before committing.
- Modify: `src/styles.css`. Add `.diff-pip--endless`. Run SP: never re-declare `position` on a
  `.screen`.
- `INFINITY_SVG`: an inline `<svg viewBox="0 0 24 24">` lemniscate path, with
  `stroke="currentColor"`.

- [ ] **Step 1:** Implement the pieces above.
- [ ] **Step 2:** Run `npm test`. Run XX must be green with `ENDLESS_COPY` translated.
  Mutation-prove by deleting one `fr.js` line; run XX must fail.
- [ ] **Step 3:** Shoot the title with ∞ unlocked and selected, the HUD in endless, and the summary,
  at phone (390×844) and desktop. Judge the SVG at its shipped size, zoomed 3×.
- [ ] **Step 4:** Send the shots plus the French options to the owner and apply the rulings.
- [ ] **Step 5: Commit.**

---

### Task 8: The leaderboard

**Files:**
- Create: `worker/migrate-scores-survive.sql`:

```sql
ALTER TABLE scores ADD COLUMN survive_ms INTEGER;
CREATE INDEX IF NOT EXISTS scores_survive ON scores (chapter, difficulty, survive_ms DESC, at ASC);
```

- Modify: `worker/schema.sql`. Add the column last and the index, mirroring the migration.
- Modify: `worker/src/index.js`.
  - Lines 174 and 184: `int(…, 0, 9)`.
  - Parse `const surviveMs = body.surviveMs == null ? null : int(body.surviveMs, 1, 86400000)`.
    The ceiling is 24h, not the 1h bound that `timeMs` uses: a run past one hour would otherwise
    get a 400 and lose its score.
    Reject with 400 when `difficulty === 0 && surviveMs === null`, and when
    `difficulty !== 0 && body.surviveMs != null`.
  - Add `survive_ms` to the INSERT.
  - `boardRow` gains `surviveMs: r.survive_ms`.
  - The SELECT columns gain `survive_ms`.
  - `readBoards` gains a fifth query:
    `${cols} AND survive_ms IS NOT NULL ORDER BY survive_ms DESC, at ASC LIMIT 3`, returned as
    `survive`.
- Modify: `worker/test.sh`. Add the cases:
  - endless submit OK;
  - difficulty 0 without `surviveMs` → 400;
  - `surviveMs` on difficulty 3 → 400;
  - the survive board sorts DESC.
- Modify: `src/scores.js`.
  - `submitScore({ …, surviveMs = null })` forwards it in the JSON body.
  - `podiumRank(boards, { …, surviveMs = null })` adds
    `const s = at(boards.survive ?? [], 'surviveMs', surviveMs)`. `at()` is a `findIndex` over rows
    the Worker already sorted (scores.js:111-119), so there is no comparator to change. The DESC
    order is proved in `worker/test.sh` only.
  - Add `survive` to the tolerated-missing list (~64-69).
- Modify: `src/main.js` (~953): `difficulty: run.endless ? 0 : (run.difficulty ?? 1)`,
  `surviveMs: run.endless ? Math.round((run._realTime ?? run.time) * 1000) : null`. Pass
  `surviveMs` to `podiumRank` too.
- Modify: `src/ui.js`.
  - `boardsFor` (~733): an endless branch returns the PAIR `['survive', 'kills']`. ui.js:858
    destructures `[verso, recto]`, so a third entry would be silently dropped.
  - Add `survive` to `podiumPageHtml`'s label and score maps (ui.js:915-927):
    `'Best time'` and `fmtTime(r.surviveMs / 1000)`. Add it to the rank display too.
  - `loadPodium` (~4200): use `chMeta.endlessPicked ? 0 : (chMeta.difficulty ?? 1)`.
  - Find every other `fetchBoards` caller with
    `grep -n "fetchBoards\|loadPodium" src/*.js` and give each the same rule.
- Test: extend run LB (`testLeaderboard`, test/sim-test.js:19281).
  - `podiumRank` finds a submitted `surviveMs` row in `boards.survive`.
  - A missing `boards.survive` does not throw.
  - Source text: main.js submits `difficulty: run.endless ? 0 : …` and forwards `surviveMs`
    (moved here from EN.h).
  - Mutation: drop `surviveMs` from `submitScore`'s body → fails.

- [ ] **Step 1:** Write the run LB extension and the worker test cases. Both fail.
- [ ] **Step 2:** Implement the worker side. Run `cd worker && ./test.sh` (read it for how it runs
  locally via `wrangler.test.toml`). Expected: PASS.
- [ ] **Step 3:** Implement the client side. Run `npm test LB` and `npm test testEndlessMeta`.
  Expected: PASS.
- [ ] **Step 4: Commit.**
- [ ] **Step 5: Deploy order** (owner-visible infrastructure, so ask before running):
  1. `wrangler d1 execute <db> --remote --file worker/migrate-scores-survive.sql`;
  2. `wrangler deploy`;
  3. `worker/smoke-live.sh`.

  Only then ship the client. Read `smoke-live.sh` and `wrangler.toml` for the real db name.

---

### Task 9: Balance probe and tuning

**Files:**
- Create: `scripts/endless-probe.mjs`.
- Modify: `src/config.js`. Set `ENDLESS_RAMP_A`/`B`, `ENDLESS_MILESTONE_S` and the affix curve
  from the measurements, with one `balance_decision` line each.

- [ ] **Step 1: Load `probing-the-game`,** or dispatch the `measure` agent with this brief.
- [ ] **Step 2: Write the probe.** Endless runs, mortal, with two fixed loadouts: a strong
  late-game build and a median one (copy the loadout idiom from `scripts/wreck-threat.mjs`).
  - **Chapters:** body, beyond and deep.
  - **Seeds:** 8 per cell.
  - **Movement axis:** still, amble and kite (memory: kiting-rig-hides-shove-locks).
  - **Control arm:** `run._endlessPinLevel = 1` (the hook from Task 3).
  - **Also measure render cost:** affix badges are one Pixi `Text` each (render.js:28261). Shoot a
    late-endless frame on a phone viewport and note the frame time. If it is bad, report it; the
    owner decides on caps.
  - **Prints:** the death-time distribution (min, median, max), N per cell, and the alive count
    plus sim ms/step at death.
- [ ] **Step 3: Tune.** Grid-sweep `A`/`B` (3×3) until the median build dies around 8–12 minutes
  and the strong one around 15–20. The control arm must live markedly longer than the ramped arm;
  otherwise the ramp is not what kills (memory: rig-must-vary-with-the-knob).
- [ ] **Step 4:** Report the table to the owner. Commit the constants with one `balance_decision`
  line each, and put the reasoning in the commit body.

---

### Task 10: Ship (dev-gated), then remove the gate after the owner's playtest

- [ ] **Step 1:** `npm test`, full gate, ALL TESTS PASSED. Then
  `git fetch && git log --oneline HEAD..origin/main`, merge main, and run `npm test` again (memory:
  a-clean-merge-can-create-a-defect).
- [ ] **Step 2:** Run the function-set diff from CLAUDE.md against `origin/main:src/sim.js`. Every
  removal must be deliberate.
- [ ] **Step 3:** Load `shipping-a-release`. Confirm the worker is already deployed (Task 8, Step 5).
  Then `npm run ship "Endless mode is in testing behind the dev switch"`.
- [ ] **Step 4:** After the owner's playtest, add a follow-up commit that removes `meta.dev &&` from
  the ∞ pip condition, and ship it with a player-facing sentence.

---

## Known, accepted

- **The Task 2 grep also matches the comment at sim.js:9.** "Must print nothing" means no code
  lines.
- **Chaos Pact's damage bonus** (`chaosWavesSurvived(run.time)`, sim.js:685) keeps growing in
  endless. It is player power, not a time curve, so it is left unfrozen. Flag it in the playtest
  notes.
- **The dev gate blocks submission** (main.js:919), so the endless board stays empty until Task 10
  Step 4. `worker/test.sh` is the board's only proof before then.

## Self-review notes

- **Spec coverage:** every spec section maps to a task.
  - Scope and unlock → T1.
  - Run flag, victory, frozen curves, Chaos Pact, HUD count-up → T2.
  - Ramp and coins → T3.
  - Milestones → T4.
  - Crowd affixes → T5.
  - Meta and `endRun` → T6.
  - UI and copy → T7.
  - Leaderboard → T8.
  - Balance → T9.
  - Tests 1-11 → EN.a-EN.h plus the LB extension plus worker/test.sh.
- **Known guesses, each flagged inline with a "read X first" instruction:**
  - the coin pickup shape (T3);
  - the elite count through the spawn queue (T4);
  - the hand-made enemy idiom (T5);
  - the save/load shim (T6);
  - `podiumRank`'s `at()` sort direction (T8).
