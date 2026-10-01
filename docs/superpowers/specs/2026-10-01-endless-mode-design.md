# Endless mode — design (rev 2, 2026-10-01)

## Goal

A per-chapter survival mode: no 300s victory, difficulty climbs until you die, and the score is
how long you lasted. Ranked on a per-chapter leaderboard.

## Rulings (owner, 2026-10-01)

| Question | Ruling |
|---|---|
| What the player chases | Survival time, ranked per chapter |
| Difficulty | Starts at D1 and escalates on its own, continuously (a float) |
| Shape of the ramp | Slow at first, then quadratic |
| What drives the ramp | **The time curves freeze at 300s; the endless level is the ONLY escalator** |
| Extras | Milestone elites, mutator drip, a growing share of ordinary enemies carrying affixes |
| Crowd affixes | **Every affix ungated for ordinary enemies** |
| Caps on speed or crowd size | **None for now; judge in playtest** |
| Revive consumable | **Allowed** |
| Coins | **No cap; drops halve every minute** |
| Leaderboard key | `difficulty: 0` as the endless partition |
| Entry point | An ∞ pip after the D1–D5 pips |

Considered and **not** in v1: anti-sustain, named-tier HUD, a giants-only finale, signature
escalation, a ghost of your best, cash-out, a daily seed.

## Scope

- **Eligible:** chapters with `!scripted && !circuit && (!isWipChapter(id) || meta.dev)`. That is
  body, pond, garden, undergrowth, city, skies, beyond, shelf, surf, wreck, trawl, deep. Enumerate
  over `Object.keys(CHAPTERS)`, never `CHAPTER_ORDER`.
- **Excluded:** blank and kraken (scripted bosses) and reef (a circuit race).
- **Unlock:** per chapter, `meta.chapters[id].won >= CHAPTER_UNLOCK_DIFFICULTY` (3).

## Sim

### Run flag

`createRun(chapter, { endless: true })` sets `run.endless = true` and `difficulty = 1`, and skips
`EARLY_CALM`.

### Time curves frozen at 300s

For an endless run, every time curve reads `tc = Math.min(run.time, RUN_DURATION)` instead of
`run.time`:
- `hpScale`, `spawnRate`, `dmgScale`, `speedCreepMul`, `eliteEveryAt`, `spawnTiltMul`;
- the wave table, the late spawn multiplier and the mower.

So the first 5 minutes play exactly like a normal run's curve, and after that only the endless
level escalates.

- **Implementation:** one helper, `curveTime(run)`, that every one of those sim call sites goes
  through. The plan must list every site that reads `run.time` into a curve. A site that is missed
  keeps ramping on its own, so grep for each curve's name, not just for `run.time`.
- `run.time` itself keeps advancing (the HUD and the milestones use it).

### Other `RUN_DURATION` readers

- **sim.js:316, the victory gate:** add `&& !run.endless`.
- **config.js:1015, Chaos Pact's `when` gate:** treat the time remaining as unbounded in endless,
  so the card stays offerable.
- **ui.js:2117 and 2506, the HUD clocks:** count up in endless, never down to a stuck 0:00.

### The ramp: `stepEndless(run, dt)`

```
endlessLevel(t) = 1 + ENDLESS_RAMP_A * m + ENDLESS_RAMP_B * m * m     // m = run.time / 60
```

- `run.difficulty = endlessLevel(run.time)`. `run.difficulty` is read elsewhere only for the
  Kraken's rung, which an endless run never reaches, so a float is safe there (verified).
- **Recompute from a base, never chain ratios:** `createRun` stores
  `run._endlessBase = { enemySpeedMul, spawnMul, maxAliveMul, enemyDmgMul, coinMul }`, each value
  divided by its D1 multiplier. Every step then recomputes:
  - `enemySpeedMul = base * difficultySpeedMul(d)`;
  - `spawnMul` and `maxAliveMul = base * difficultyCountMul(d)`;
  - `enemyDmgMul = base * difficultyDmgMul(d)`.
- Nothing else writes those keys mid-run (verified), so the recompute clobbers nothing. The mutator
  drip multiplies into `_endlessBase`.

### Coins

- `difficultyCoinMul` stays at 1 in endless. Every step:
  `coinMul = base.coinMul * 0.5 ^ (run.time / 60)`, a smooth halving every minute.
- **`COIN_CAP_PER_RUN` does not apply in endless**, either in `stepPickups` or in `endRun`.
- The kill bonus (main.js:749) uses `difficultyCoinMul(1)` in endless.
- **Stated consequence:** endless pays little. Drops add up to about 1.44 minutes' worth of
  first-minute income, the kill bonus grows like `sqrt(kills)`, and rerolls get expensive late.
  That is intended.

### Milestones: every `ENDLESS_MILESTONE_S` seconds (start at 120)

1. **Elite wave:** `ENDLESS_MILESTONE_ELITES` elites through `spawnEnemy` with a new
   `opts.forceElite`. Today elite status comes only from `run.time >= run._nextEliteAt`
   (sim.js:4020); `forceElite` must not move that cadence.
2. **Mutator drip:**
   - Export `mutatorPool(chapterId)` (config.js:5318). It already handles `hidden`, `chapters`,
     `exclude` and `noGenericMutators`. Filter out anything already in `run.mutators` and pick at
     random.
   - Push the id onto `run.mutators` and multiply its `effects` into `run.mods` and `_endlessBase`.
     Every effect is read live (verified), so a mid-run add works.
   - Emit `{type: 'endlessMutator', id}`. It needs a render banner and an `SFX_FOR_EVENT` entry
     (milestones are rare, so a sound is fine), or else a `SILENT_BY_DESIGN` line (run EV).
   - When the pool is empty (it is small: about 8 generic mutators plus 1-2 per chapter), the drip
     stops.

### Affixed crowd (every affix ungated)

**The roll:** in `spawnEnemy`, when
`run.endless && !isElite && !opts.forceNormal && !opts.deferred`, roll
`Math.random() < endlessAffixChance(d)`. On a hit, set `affixes = rollAffixes(run).slice(0, 1)`.
- The `forceNormal`/`deferred` guard stops splitter children rolling splitter again, which would
  chain.
- `endlessAffixChance(d) = clamp((d - ENDLESS_AFFIX_FROM) * ENDLESS_AFFIX_PER_LEVEL, 0, ENDLESS_AFFIX_MAX)`.
  Start with from = 3, 0.07/level, max 0.5.

**Ungating.** Today every affix that matters checks `enemy.elite`. Change those checks to
`(enemy.elite || enemy.affixVisible)`, so normal runs are unaffected:

| Affix | Gate site | Normal-enemy behaviour | Payout on a normal |
|---|---|---|---|
| gilded | sim.js:4164 (HP), 9468 (coins) | `GILDED_HP_MUL` HP | Gilded coins, scaled by `coinMul` (decays) |
| shielded | sim.js:9314 | same shield | none |
| splitter | sim.js:9488 | `SPLITTER_COUNT` wisps | none (wisps pay normally) |
| volatile | sim.js:9496, 5680 | corpse bomb | none |
| pacer | already ungated | — | — |
| frenzied | already ungated | — | — |

- Elite coin and xp payouts stay keyed on `e.elite`, so an affixed normal enemy is not an elite.
- Set `e.affixVisible = true` on these enemies. Change render.js:28265 to
  `(e.elite || e.affixVisible)`. Also check render.js:29056 (the shield tell already draws for any
  `e.affixes`), so it now matches the sim.
- **Ungating must not reach The Blank's Antibody,** whose `anchored` is internal and not
  `affixVisible`.

## Meta, save and unlock

- **Additive field:** `meta.chapters[id].endlessBest` (ms of `run._realTime`), read with `?? 0`. No
  SCHEMA bump.
- **The ∞ selection is NOT stored as `difficulty: 0`.**
  - `onDifficulty` (main.js:373), `ensureChapterMeta` (state.js:236, `|| 1`) and `loadPodium`
    (ui.js:4200, `?? 1`) all turn a 0 into 1, so it would silently start a D1 normal run.
  - Instead, use an additive `meta.chapters[id].endlessPicked` boolean, so an old build ignores it.
  - Send `endless` explicitly through `onPlay` → `pendingPlay` → `startClassic` → `createRun`
    (main.js:185-200).
- **`endRun` for an endless run:**
  - it never bumps `maxDifficulty`, `won` or unlocks (all already gated on `victory`);
  - it **also gates `meta.best.time`** (main.js:759-763, which today is not gated);
  - it updates `endlessBest`, banks coins with no cap, and uses the kill bonus at D1.
- **Dev gate:** a dev run still never submits (run LB).

## Leaderboard

**Client:**
- main.js:953 currently submits `run.difficulty ?? 1`, which would be a float like 7.4 and rejected.
  Endless must send **`difficulty: 0` explicitly**.
- `submitScore` (scores.js:136-142) forwards a fixed list of fields, so add `surviveMs`.
- `podiumRank` gains `surviveMs`.
- Add `boards.survive ?? []` to the tolerated-missing list.
- `boardsFor` (ui.js:733) picks boards per chapter, so it needs an endless branch that shows `kills`
  / `level` / `survive`.

**Worker:**
- `worker/migrate-scores-survive.sql`: `ALTER TABLE scores ADD COLUMN survive_ms INTEGER`, plus the
  index `scores_survive (chapter, difficulty, survive_ms DESC, at ASC)`. Mirror both in
  schema.sql, column last.
- Widen `int(difficulty, 1, 9)` to `0..9` at both sites (index.js:174, 184).
- `survive_ms`: `int(…, 1, 3600000)`, accepted **only** when `difficulty === 0`, and required
  there.
- Add `survive_ms` to `boardRow` (index.js:108). `readBoards` adds `survive`:
  `survive_ms IS NOT NULL ORDER BY survive_ms DESC, at ASC LIMIT 3`.
- **Deploy order:** worker migration → worker deploy → client ship.

## UI

- **Chapter card:** an ∞ pip after the difficulty pips, shown when the chapter is eligible and
  unlocked. It toggles `endlessPicked`.
- **∞ icon:** drawn as an inline SVG, judged at its shipped size.
- **HUD:** the clock counts up and shows the level as `∞ 7.4`. A banner names each dripped mutator
  by its existing translated name.
- **Summary:** the survival time and the best time.
- **Copy:** all new strings go in a config table so run XX walks them. French wording to be
  confirmed with the owner.

## Balance (measured, not guessed)

Probe endless runs:
- **Builds:** a fixed strong late-game loadout and a median one.
- **Coverage:** 3+ chapters (including beyond, whose formation pressure past 300s is untested),
  several seeds, mortal.
- **Control arm:** endless level pinned at 1. This proves the ramp, and not something else, is
  what kills (memory: rig-must-vary-with-the-knob).
- **Tune:** `A`/`B`, `ENDLESS_MILESTONE_S` and the affix curve.
- **Target:** the median build dies around 8–12 minutes, the strong one around 15–20.
- **Report:** the death-time distribution with its denominator, plus frame-time at the death point.
  There are no caps on enemy count, so this is the number playtest will judge.

Load `probing-the-game` first.

## Tests (test/sim-test.js, mutation-proved)

1. **No timer victory:** an endless run is not in `victory` at 300s or 900s; a normal run is at
   300s.
2. **Curves frozen:** at t = 600 in endless, `hpScale`/`spawnRate`/`dmgScale` inputs equal their
   t = 300 values. A normal run's do not freeze.
3. **Ramp exact:** `run.difficulty === endlessLevel(t)`, and `enemyDmgMul` equals
   `base * difficultyDmgMul(d)` within 1e-9 after 20 simulated minutes.
4. **Mutator drip:** a milestone adds exactly one new id from `mutatorPool(chapter)`, and its effect
   lands in `run.mods`.
5. **Forced elites:** a milestone spawns N elites and `_nextEliteAt` is unchanged.
6. **Affixed crowd:**
   - at a high level, a material share of non-elites carry one affix with `affixVisible`; at D1
     none do;
   - splitter children never carry an affix;
   - a shielded normal enemy takes reduced damage, and a volatile normal enemy leaves a bomb (this
     asserts the effect, not the field).
7. **Unlock predicate:** false at `won = 2`, true at `won = 3`, false for blank/kraken/reef. Sweep
   `Object.keys(CHAPTERS)` and print the denominator.
8. **`endRun`:** `won`, `maxDifficulty` and `meta.best.time` are untouched, and `endlessBest` is
   updated.
9. **Coins:** `coinMul` at t = 120 is ¼ of its t = 0 value. Endless can bank more than
   `COIN_CAP_PER_RUN`; a normal run cannot.
10. **The 0 → 1 trap:** `endlessPicked` survives `ensureChapterMeta`, and the submitted payload
    carries `difficulty: 0`.
11. **Worker:** `worker/test.sh` covers `survive_ms`, the difficulty 0 bounds and the DESC order.

The render pieces (∞ pip, HUD level, affix badges and shield tell on normal enemies) are verified
by shooting frames.

## Out of scope for v1

Caps on speed or crowd size (playtest decides), anti-sustain, named tiers, a giants-only finale,
signature escalation, a ghost of your best, cash-out, daily seeds, endless for boss or circuit
chapters.
