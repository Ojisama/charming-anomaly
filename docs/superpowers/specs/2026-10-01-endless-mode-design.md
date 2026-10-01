# Endless mode — design (rev 1, 2026-10-01)

## Goal

A per-chapter survival mode: no 300s victory, difficulty climbs until you die, and the score is
how long you lasted. Ranked on a per-chapter leaderboard.

## Rulings (owner, brainstorm 2026-10-01)

| Question | Ruling |
|---|---|
| What the player chases | Survival time, ranked per chapter |
| Difficulty | Starts at D1 and escalates on its own |
| Shape of the escalation | Continuous (a float), not steps |
| Ramp | Slow at first, then quadratic |
| Extras | Milestone elites, **mutator drip**, a **growing share of ordinary enemies carrying affixes** |
| Leaderboard key | `difficulty: 0` as the endless partition |
| Entry point | An ∞ pip after the D1–D5 pips |

Considered and **not** in v1: anti-sustain (healing decay), named-tier HUD, a giants-only finale,
signature escalation, a ghost of your best, push-your-luck cash-out, a daily seed.

## Scope

- **Eligible:** every chapter that has the 300s timer victory, i.e. `!scripted && !circuit`:
  body, pond, garden, undergrowth, city, skies, beyond, shelf, surf, wreck, trawl, deep.
  Derive the set from `Object.keys(CHAPTERS)` with that predicate, never from `CHAPTER_ORDER`
  (CLAUDE.md: `CHAPTER_ORDER` is Book 1 only).
- **Excluded:** blank and kraken (scripted boss fights) and reef (a circuit race, with no clock to
  survive against).
- **Unlock:** per chapter, `meta.chapters[id].won >= CHAPTER_UNLOCK_DIFFICULTY` (3).

## Sim

### Run flag

`createRun(chapter, { endless: true })` sets `run.endless = true` and `difficulty = 1`. It skips
the D1 `EARLY_CALM` thinning: endless starts at D1, but it is not the onboarding run.

### No timer victory

`stepSim`'s victory gate gains `&& !run.endless`. **Sweep every other `RUN_DURATION` reader** (18
sites across config/sim/ui). Anything computing "time remaining" must treat endless as unbounded:
Chaos Pact's `when` gate, `spawnTiltMul`, `eliteEveryAt` and the HUD countdown at least. List the
outcome for each site in the plan.

### The ramp: `stepEndless(run, dt)`

`run.difficulty = endlessLevel(run.time)`, where

```
endlessLevel(t) = 1 + ENDLESS_RAMP_A * m + ENDLESS_RAMP_B * m * m     // m = t / 60
```

It reads `run.time` (not real time), so Time Debt compresses endless the same way it compresses a
normal run.

Each step, rescale the four difficulty multipliers already baked into `run.mods` by the
`mul(new) / mul(old)` ratio:
- `enemySpeedMul` via `difficultySpeedMul`;
- `spawnMul` and `maxAliveMul` via `difficultyCountMul`;
- `enemyDmgMul` via `difficultyDmgMul`;
- `coinMul` via `difficultyCoinMul`.

All four are linear in `d` and already accept floats (config.js:5277-5292). Nothing downstream
learns that endless exists.

- **Drift guard:** a few thousand multiplications per run accumulate float error. Keep
  `run._endlessBase` (the `mods` values divided by `mul(1)` at `createRun`) and recompute each
  multiplier as `base * mul(d)` rather than chaining ratios. Mutator drip (below) multiplies into
  that base too.
- Starting values for `A`/`B` are placeholders, to be fixed by a probe (see Balance).

### Milestones: every `ENDLESS_MILESTONE_S` seconds (start at 120)

1. **Elite wave:** force-spawn `ENDLESS_MILESTONE_ELITES` elites through `spawnEnemy`. Run SQ
   requires every enemy push to go through `spawnEnemy`/`flushSpawns`.
2. **Mutator drip:** pick a random id from `MUTATORS`.
   - Exclude anything already in `run.mutators`, anything `hidden`, and anything whose `chapters`
     list excludes this chapter.
   - Push it onto `run.mutators`, so the behaviour mutators that read the array work as is.
   - Multiply its `effects` into `run.mods` the way `mergeMutatorMods` does.
   - Emit `{type: 'endlessMutator', id}`, and give it a render/HUD banner. Run EV requires that
     consumer.
   - When the pool is empty, the drip stops.

### Affixed crowd

In `spawnEnemy`, when `run.endless && !isElite`, roll `Math.random() < endlessAffixChance(d)`.
On a hit, `affixes = rollAffixes(run).slice(0, 1)`, i.e. one affix.

- `endlessAffixChance(d) = clamp((d - ENDLESS_AFFIX_FROM) * ENDLESS_AFFIX_PER_LEVEL, 0, ENDLESS_AFFIX_MAX)`.
  Start with from = 3, 0.07/level, max 0.5.
- **`gilded` triples a normal enemy's HP** (`GILDED_HP_MUL`). Decide in the plan whether gilded is
  excluded from the crowd roll or allowed through as is.
- **Render gap:** `render.js:28265` draws affix icons for elites only, on purpose, because the
  Antibody carries an internal `anchored`. Set `e.affixVisible = true` on endless-affixed normal
  enemies and change that line to `(e.elite || e.affixVisible)`. Without this the mechanic is
  invisible, and invisible looks the same as broken (CLAUDE.md, contract fields).

## Meta, save and unlock

- **Additive field only:** `meta.chapters[id].endlessBest` (milliseconds of real time, 0 when the
  mode has never been played). Read with `?? 0`; no SCHEMA bump (R2).
- **`endRun` (main.js) for an endless run:**
  - it never bumps `maxDifficulty`, `won`, chapter unlocks or `best.time`;
  - it updates `endlessBest` from `run._realTime`, the honest unit under Time Debt;
  - coins are banked normally under `COIN_CAP_PER_RUN`, and the kill bonus uses
    `difficultyCoinMul(run.difficulty)` at death (already the existing line).
- **The dev gate still refuses submission** (run LB).

## Leaderboard

- The client submits `{ chapter, difficulty: 0, kills, level, surviveMs }`.
- Worker:
  - widen `int(difficulty, 1, 9)` to `0..9` at both sites;
  - add a `survive_ms INTEGER` column (`worker/migrate-scores-survive.sql`);
  - `readBoards` adds `survive` = `survive_ms IS NOT NULL ORDER BY survive_ms DESC, at ASC LIMIT 3`;
  - `survive_ms` is accepted **only** when `difficulty === 0`, and is required there.
- Add `boards.survive ?? []` to the tolerated-missing list in scores.js, as with `time`/`lap`.
  `podiumRank` gains `surviveMs`.
- The summary screen shows the survive podium for endless runs.

## UI

- **Chapter card:** an ∞ pip after the difficulty pips, rendered only when the chapter is eligible
  and unlocked. Selecting it starts the run with `endless: true`.
- **HUD:** the clock counts up and shows the level as `∞ 7.4`. Milestone banners announce the
  mutator by its existing (translated) name.
- **Summary:** a survival time and "Best: mm:ss" in place of the victory/defeat framing. Copy goes in
  a config table so run XX walks it; French wording to be confirmed with the owner (memory:
  french-copy-ask-the-owner).
- **The ∞ icon is drawn as an inline SVG, not a glyph or emoji** (memory: draw-ui-icons). Judge it
  at its shipped size.

## Balance (measured, not guessed)

Pick `ENDLESS_RAMP_A`/`B`, `ENDLESS_MILESTONE_S` and the affix curve from a probe over endless runs
with a fixed strong late-game loadout and a median one, across 3+ chapters and several seeds,
mortal. Target: the median build dies around 8–12 minutes and the strong one around 15–20. Report
the death-time distribution with its denominator. Load `probing-the-game` before writing it.

## Tests (test/sim-test.js, mutation-proved)

1. An endless run does not reach `phase: 'victory'` at 300s or 900s; a normal run does at 300s.
2. `run.difficulty` follows `endlessLevel(t)`, and `run.mods.enemyDmgMul` equals
   `base * difficultyDmgMul(d)` within 1e-9 after 20 simulated minutes (proves no ratio drift).
3. A milestone adds exactly one new, non-hidden, chapter-legal mutator, and its effect lands in
   `run.mods`.
4. At a high level a material share of non-elite spawns carry exactly one affix plus
   `affixVisible`; at D1 none do.
5. Unlock: the predicate is false at `won = 2`, true at `won = 3`, and false for blank, kraken and
   reef. Sweep `Object.keys(CHAPTERS)` and print the denominator.
6. `endRun` on an endless run leaves `won`/`maxDifficulty` untouched.

The render pieces (∞ pip, HUD level, affix icons on normal enemies) are verified by shooting
frames, not by the suite.

## Out of scope for v1

Anti-sustain, named tiers, a giants-only finale, signature escalation, a ghost of your best,
cash-out, daily seeds, endless for boss or circuit chapters.
