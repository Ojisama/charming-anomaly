# Track B — Upgrade Pool Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the level-up pool's rarity-first roll with an explicit bucket-first pipeline, and add `anomaly` as a sixth rarity tier carrying run-changing cards.

**Architecture:** All behaviour lands in one function — `rollCard` in `src/sim.js` — plus new data tables in `src/config.js`. The shipped roll picks a rarity and then walks *down* the ladder when that rarity has no options, which is what silently deleted the weapon bucket and inflated legendaries. The new roll picks a **bucket first**, then a rarity, and never walks the ladder. Anomalies are a parallel tier that produces no stat growth and can never be a screen's only offer.

**Tech Stack:** Vanilla JS (ES modules), no framework, no TypeScript. Tests are `node:assert` scenarios in `test/sim-test.js`, run by `npm test`. Balance measurement is `scripts/pool-probe.mjs`.

**Source spec:** `docs/superpowers/specs/2026-08-07-upgrade-pool-design.md` (sections B1–B7, the F-findings table, and "BETTER LEVER: steepen the hpScale tail").

**Scope:** The **pipeline only**, plus one seed anomaly to exercise the tier end to end. The 19 remaining cards, the anomaly *rate* tuning, and the zero-run guarantee are a **separate plan** — see "Deferred, with reasons".

---

## Revision note — this plan was rewritten after adversarial review

The first draft was reviewed by three adversarial agents (correctness / balance / fun) before any code was written. They found nineteen defects, five of which would not have run at all. The rewrite below incorporates all of them. Recording the three that changed the plan's *shape*, because they are the ones a re-reader will otherwise re-introduce:

1. **The offset lever was wrong.** The first draft applied a flat enemy-HP ×1.8. The spec **explicitly supersedes** that with a per-chapter `HP_SCALE_LATE_RATE` tail ladder, measured better on the metric that matters: level-ups 12.8 (flat) vs **15.2** (tail) at identical difficulty parity. Worse, the draft justified the flat lever with *"do not invent a new global"* — **implementation cost used as a ranking column on a balance decision**, which is the owner's most explicit standing bar. Task 5 is now the ladder.
2. **Weapon rarity was a filter, not a weight.** `weaponOpts.filter(wc => wc.rarity === rarity)` contradicts both the spec and the harness that produced every number quoted here. Measured consequence: in beyond the normal-rarity starter would take **68.8%** of weapon offers while the legendary `hole` took 13.8%; in city the *mythic starter* becomes the hardest weapon to level. The plan would have **manufactured the dominant-build-per-chapter problem** the owner is complaining about.
3. **A guarantee paired with a one-card table.** With one anomaly, `MAX_ANOMALIES_PER_RUN = 2` is dead and a level-14 guarantee hands 100% of runs the same card at the same moment. Strictly worse than no guarantee, which at least leaves variance in *when*. Rate tuning and the guarantee are deferred to the slate plan.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Balance numbers live in `config.js` and nowhere else.** A magic number typed into `sim.js` is a bug; it belongs in `config.js` as a named export.
- **Module boundaries are the design — do not cross them.** `sim.js` may touch nothing but `run` and `config` (no Pixi, no DOM, no localStorage). `render.js` reads `run` and **never mutates it**. `config.js` is read-only ground truth. `main.js` is glue only.
- **`npm test` is the gate for every task in this plan.** Run it after every step that touches `src/`.
- **The pool-reading test scenarios are:** `testRaritySanity`, `testStarBalance`, `testChoiceSlots`, `testFocusNudge`, `testWeaponModParity`, `testCrazyMods`, `testFrenchDictionary` (run XX), `testPlaytestSweepAndBlades` (run PT.a). **All eight** must be checked after any change here — the first draft named three and was broken by two of the five it missed.
- **There is no test framework and no single-test runner.** Add scenarios as plain functions in the existing style and register them in the `try { … }` block at `test/sim-test.js:8376`.
- **Every new config export must be added to the import block in `src/sim.js` (line ~33) AND `test/sim-test.js` (lines 10–84).** The first draft omitted nine and would have thrown `ReferenceError` on the first level-up.
- **No top-level `await` in `main.js`** — it deadlocks Pixi v8's dynamic environment import in the production bundle (blank page).
- **Do not edit `src/fr.js` by exact-string match.** French values carry U+00A0 before `: ; ! ?`. Anchor on a line with no French punctuation, or edit with node.
- **Never hand-write French copy.** New user-facing strings get an adversarial French review; uncertain renderings get asked about, not guessed.
- **`.gitignore` covers only `/*.png` at the repo root.** Delete every scratch artifact explicitly and verify with `git status --short` before committing.
- **Commit subjects:** `vX.Y.Z: <what changed and why, in one plain sentence>`. Bump the patch version in `package.json`. **Never add a Claude signature or `Co-Authored-By` line.**

## Mandatory Adversarial Gate (every task)

**Owner directive, 2026-08-08: every task ends with three adversarial reviewers before its commit is final.** Dispatched as subagents, in parallel, each given the task's diff and the source spec, and instructed to **find the failure, not to approve**.

| lens | the question it must try to answer YES to |
|---|---|
| **Correctness** | Is there an input, ordering, or run state where this produces a wrong card, throws, or silently no-ops? Does it turn any of the eight pool-reading scenarios red? |
| **Balance** | Does this move a measured distribution away from its declared target? Re-run `scripts/pool-probe.mjs` and quote real numbers — never an estimate. |
| **Fun** | Does this make a screen *less* interesting? A card that changes nothing moment-to-moment has failed regardless of how correct it is. Does it address, ignore, or *amplify* the three flatness complaints? |

A task is not complete until all three report, and any CONFIRMED finding is fixed or explicitly waived in the commit message with a reason.

**Two standing rules for the Balance lens.** Never estimate a quantity the harness can measure — every estimate this project has made was off 3–6×. And **check the emulation actually reaches its subject before reading its number**: a discarded beyond arm once read "+2.1%" only because the probe's mod table covered 1 of that chapter's 3 weapons.

**Harness gotcha, verified:** `--offset`, `--laterate`, `--latestart` and the `anomalies/run` report line are all gated on `mode === 'proposed'`. A probe command without `--proposed` or `--compare` silently ignores them. The first draft's six measurement commands were all no-ops for this reason.

---

### Task 1: Bucket-first roll pipeline

**Files:**
- Modify: `src/config.js` — add `BUCKET_WEIGHTS`, `DEFENSIVE_PASSIVES`, `DEFENSIVE_PASSIVE_WEIGHT`, `WEAPON_UP_WEIGHT`; make `MAX_MODS_PER_WEAPON_PER_POOL` slot-aware; delete `ELEMENT_CARD_WEIGHT`
- Modify: `src/sim.js` — rewrite `rollCard` (5891-5922) and its doc block (5887-5890); drop the `ELEMENT_CARD_WEIGHT` gate in `eligibleElementIds` (~5812); move `newWeaponChance` from a pre-filter to a bucket weight
- Test: `test/sim-test.js` — new `testPoolBuckets()`

**Interfaces:**
- Consumes: nothing.
- Produces: `rollCard(run, weaponPool, passiveIds, modCandidates, elementIds, pickedIds, modWeaponCounts, allowAnomaly)` — the 8th parameter is added here and stays unused until Task 2. Exports `BUCKET_WEIGHTS: {passive,mod,weapon,element}`, `DEFENSIVE_PASSIVES: string[]`, `DEFENSIVE_PASSIVE_WEIGHT: number`, `WEAPON_UP_WEIGHT: number`, `maxModsPerWeaponPerPool(slots): number`.

- [ ] **Step 1: Write the failing test**

Add above the `try {` runner block in `test/sim-test.js`:

```js
// ---- Run PB1: bucket-first roll ----------------------------------------------------
// The shipped roll picked a RARITY first and walked DOWN the ladder when that rarity had no
// options, which deleted the weapon bucket on every roll no weapon happened to carry. Buckets
// are now explicit and rolled first. See B1 in the Track B spec.
function testPoolBuckets() {
  const sample = (chapter, slots, weapons) => {
    Math.random = mulberry32(20260808)
    const meta = makeMeta()
    meta.choiceSlots = slots
    meta.chapter = chapter
    const run = createRun(meta)
    run.weapons = weapons
    const kinds = {}, rarities = {}, perWeapon = {}
    let total = 0
    for (let i = 0; i < 4000; i++) {
      run._screenRerolls = -1   // never let reroll decay contaminate a base-rate sample
      for (const c of buildLevelUpChoices(run)) {
        if (c.kind === 'heal') continue
        kinds[c.kind] = (kinds[c.kind] ?? 0) + 1
        rarities[c.rarity] = (rarities[c.rarity] ?? 0) + 1
        if (c.kind === 'weapon') perWeapon[c.id] = (perWeapon[c.id] ?? 0) + 1
        total++
      }
    }
    return { kinds, rarities, perWeapon, total }
  }

  const body = sample('body', 4, [{ id: 'star', level: 3 }, { id: 'orbit', level: 2 }])
  const share = (k) => (body.kinds[k] / body.total) * 100

  // Declared BUCKET_WEIGHTS. Measured seed-to-seed sd is ~0.4pt over this exact scenario, so
  // +/-1.5pt is ~3.5 sigma — tight enough to catch a real regression. The first draft used
  // +/-6pt, which is 12-15 sigma and would have passed a bucket anywhere in 16-28%.
  assert.ok(Math.abs(share('weapon') - 22) < 1.5, `weapon share ${share('weapon').toFixed(1)}% vs declared 22%`)
  assert.ok(Math.abs(share('element') - 18) < 1.5, `element share ${share('element').toFixed(1)}% vs declared 18%`)
  assert.ok(Math.abs(share('passive') - 30) < 1.5, `passive share ${share('passive').toFixed(1)}% vs declared 30%`)
  assert.ok(Math.abs(share('mod') - 30) < 1.5, `mod share ${share('mod').toFixed(1)}% vs declared 30%`)

  // F1: an empty bucket must NOT deflect onto a high rarity (first draft measured 16.1% legendary).
  const legendaryShare = ((body.rarities.legendary ?? 0) / body.total) * 100
  assert.ok(legendaryShare < 6, `legendary share ${legendaryShare.toFixed(1)}% — a bucket is deflecting up the ladder`)

  // Mythic is RETAINED (B3): rainbow is the mythic city starter, and WEAPON_MOD_TIER_BONUS has a
  // live mythic:3 that deleting the tier would silently cap at +2.
  assert.ok(RARITY_ORDER.includes('mythic'), 'mythic must stay in RARITY_ORDER')
  assert.strictEqual(WEAPON_MOD_TIER_BONUS.mythic, 3, 'deleting mythic silently caps every tier mod at +2')

  // Inherent rarity gates ACQUISITION, never LEVELLING. A filter here would hand beyond's
  // normal-rarity starter 68.8% of weapon offers while the legendary hole took 13.8% — i.e. the
  // pool would pick the dominant build for you. Every owned weapon must compete flat.
  const beyond = sample('beyond', 4, [
    { id: 'realityShard', level: 3 }, { id: 'hole', level: 2 }, { id: 'tesseractBeam', level: 2 },
  ])
  const wTotal = Object.values(beyond.perWeapon).reduce((a, b) => a + b, 0)
  for (const [id, n] of Object.entries(beyond.perWeapon)) {
    assert.ok(n / wTotal < 0.45,
      `weapon ${id} took ${((n / wTotal) * 100).toFixed(1)}% of beyond's weapon cards — rarity is gating levelling, not acquisition`)
  }

  console.log(`PASS run PB1 (bucket-first roll): weapon ${share('weapon').toFixed(1)}% mod ${share('mod').toFixed(1)}% passive ${share('passive').toFixed(1)}% element ${share('element').toFixed(1)}%, legendary ${legendaryShare.toFixed(1)}%, no weapon over 45% of beyond's weapon bucket`)
}
```

Register `testPoolBuckets()` after `testRaritySanity()`. Add `BUCKET_WEIGHTS` to the config import block in `test/sim-test.js`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL on the weapon-share assertion — today weapon share measures ~10.5%.

- [ ] **Step 3: Add the config tables**

In `src/config.js`, after `RARITY_WEIGHTS` (line 29):

```js
// ---- Level-up buckets (Track B) -----------------------------------------------------
// The pool rolls a BUCKET first, then a rarity inside it. The shipped order was the reverse,
// which deleted a bucket entirely on every roll whose rarity no member happened to carry —
// measured as weapon share collapsing to 10.5% against a declared 22%. Empty buckets are
// dropped and the rest renormalized, so these are relative weights, not percentages.
export const BUCKET_WEIGHTS = { passive: 30, mod: 30, weapon: 22, element: 18 }
// Cutting passive share 62% -> 30% is a survivability cut: these three are the only direct
// defence in the pool. Do NOT rebase the PASSIVES numbers to compensate — a flat base scalar is
// regressive, measured -41% defensive picks at 2 slots against only -7% at 4. Weighting inside
// the bucket holds defensive share at parity at every slot count.
export const DEFENSIVE_PASSIVES = ['armor', 'regen', 'maxHP']
export const DEFENSIVE_PASSIVE_WEIGHT = 4
// Inside the weapon bucket, an UPGRADE of an owned weapon competes at this flat weight while a
// `New!` card competes at its weapon's inherent rarity weight. Rarity gates ACQUISITION (that IS
// the jackpot moment); it must never gate LEVELLING. Weighting owned weapons by rarity too was
// measured handing beyond's normal starter 68.8% of its weapon cards and making city's mythic
// starter the hardest weapon in the chapter to level — the pool choosing your build for you.
export const WEAPON_UP_WEIGHT = 100
```

Replace `MAX_MODS_PER_WEAPON_PER_POOL` (line 947) with a slot-aware function:

```js
// Belt-and-braces with the candidate cap: at most this many mod cards from the SAME weapon may
// land in one pool, so a roll can never hand a player an all-one-weapon screen.
// v6.7 (Track B): now slot-aware. A flat 2 starved nothing at 4 slots but flooded at 2 — with
// only the starter owned, every mod card is a star mod, and star-mod share measured 13.7% -> 31.9%
// (testStarBalance asserts < 20%). A flat 1 does the reverse: the mod bucket measured absent from
// 15.5% of rolls in beyond at 4 slots, which is a bucket that cannot pay its declared 30%.
export const maxModsPerWeaponPerPool = (slots) => (slots >= 4 ? 2 : 1)
```

Update the two existing consumers of `MAX_MODS_PER_WEAPON_PER_POOL` (`src/sim.js` and `test/sim-test.js`) to call the function with `run.choiceSlots ?? 2`.

**Delete `ELEMENT_CARD_WEIGHT`** and its doc comment (config.js ~1264). It is the pre-filter that makes elements join a pool only 25% of the time *per id*; with four elements, all four are dropped on 0.75⁴ = **31.6%** of rolls, so the element bucket would deliver ~12% against its declared 18%. The bucket weight is now the only element-frequency knob.

- [ ] **Step 4: Rewrite `rollCard`**

Replace the doc block at `src/sim.js:5887-5890` (it describes the old ladder-walk and would sit directly above code doing the opposite) and the function at `5891-5922`:

```js
// Roll ONE card: bucket first, then rarity inside it. Never walks the rarity ladder — an empty
// bucket is dropped and the remainder renormalized, because deflecting a failed roll onto the
// next tier down is what produced 16.1% legendary in the first draft (F1).
function rollCard(run, weaponPool, passiveIds, modCandidates, elementIds, pickedIds, modWeaponCounts, allowAnomaly = false) {
  // Build each bucket's live option list ONCE, so "is this bucket empty" and "pick from it" can
  // never disagree.
  const buckets = {}
  const modCap = maxModsPerWeaponPerPool(run.choiceSlots ?? 2)

  const weaponOpts = weaponPool.filter((wc) => !pickedIds.has(wc.id))
  if (weaponOpts.length > 0) buckets.weapon = weaponOpts

  const passiveOpts = passiveIds.filter((pid) => !pickedIds.has(pid))
  if (passiveOpts.length > 0) buckets.passive = passiveOpts

  const modOpts = modCandidates.filter((mc) =>
    !pickedIds.has(mc.mod) && (modWeaponCounts.get(mc.weapon) ?? 0) < modCap)
  if (modOpts.length > 0) buckets.mod = modOpts

  const elementOpts = elementIds.filter((eid) => !pickedIds.has(eid))
  if (elementOpts.length > 0) buckets.element = elementOpts

  const liveWeights = {}
  for (const b of Object.keys(buckets)) liveWeights[b] = BUCKET_WEIGHTS[b]
  if (Object.keys(liveWeights).length === 0) return null

  const bucket = pickWeighted(liveWeights)
  const rarity = pickWeighted(RARITY_WEIGHTS)

  if (bucket === 'weapon') {
    // Inherent rarity is a WEIGHT on `New!` only, never a filter, and never applied to upgrades.
    // A card keeps cfg.rarity for its chip rather than adopting the rolled rarity — applyChoice's
    // weapon branch never reads rarity, so an adopted colour would mean nothing.
    const w = {}
    for (let i = 0; i < weaponOpts.length; i++) {
      w[i] = weaponOpts[i].tag === 'New!' ? (RARITY_WEIGHTS[weaponOpts[i].rarity] ?? 1) : WEAPON_UP_WEIGHT
    }
    return weaponOpts[Number(pickWeighted(w))]
  }

  if (bucket === 'passive') {
    const w = {}
    for (const pid of passiveOpts) w[pid] = DEFENSIVE_PASSIVES.includes(pid) ? DEFENSIVE_PASSIVE_WEIGHT : 1
    const pid = pickWeighted(w)
    // makePassiveCard returns null for a values-passive (armor/regen) rolled at a rarity outside
    // its own table. Re-roll the rarity within the bucket rather than falling back to 'normal':
    // a fallback converts every epic/mythic defensive roll into an extra normal-tier defensive
    // card, which is an unnamed balance change on a x4-weighted bucket member.
    for (const r of [rarity, 'legendary', 'rare', 'normal']) {
      const card = makePassiveCard(run, pid, r)
      if (card) return card
    }
    return null
  }

  if (bucket === 'mod') {
    const mc = modOpts[Math.floor(Math.random() * modOpts.length)]
    // null = a switch mod declining a rarity above normal, same contract as makePassiveCard.
    return makeWeaponModCard(run, mc.weapon, mc.mod, rarity) ?? makeWeaponModCard(run, mc.weapon, mc.mod, 'normal')
  }

  const eid = elementOpts[Math.floor(Math.random() * elementOpts.length)]
  return makeElementCard(run, eid, rarity)
}
```

In `eligibleElementIds` (~5812), delete the `Math.random() < ELEMENT_CARD_WEIGHT` gate and its import. **Keep** the `run.mods.elementWeightMul` read that is already there at 5813 — it is live and measured (`unstable` moves element share 6.3% → 16.5%). Do **not** also fold `elementWeightMul` into the bucket weight: the spec's finding F8 asserts it is dead, and that premise is **false**. Folding it a second time double-counts, measured taking element share to 37% and dragging every other bucket down.

In `weaponCandidates` (~5735), stop pre-filtering `New!` entries by `newWeaponChance` and instead attach the probability as a weight the weapon bucket applies, so the focus nudge survives bucket-first. Multiply each `New!` entry's weight above by `newWeaponChance(run)`. Without this, `testFocusNudge` fails on 6 of 10 seeds — bucket-first hands the weapon bucket a fixed 22% whenever it is non-empty, so thinning the *count* of `New!` entries no longer thins their *rate*.

Add `BUCKET_WEIGHTS, DEFENSIVE_PASSIVES, DEFENSIVE_PASSIVE_WEIGHT, WEAPON_UP_WEIGHT, maxModsPerWeaponPerPool` to the `config.js` import block at `src/sim.js:33`, and remove `ELEMENT_CARD_WEIGHT` and `MAX_MODS_PER_WEAPON_PER_POOL`.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS. Check all eight pool-reading scenarios named in Global Constraints. If `testStarBalance` or `testFocusNudge` is red, the fix is in Step 4 (mod cap / `newWeaponChance` weighting), **not** in the test's threshold — those thresholds encode shipped anti-flood guarantees.

- [ ] **Step 6: Measure the distribution**

Run: `node scripts/pool-probe.mjs body 2 40 random --compare`
Expected: the `current` column now matches what the `proposed` shim reports, within ~2pts on all four buckets. **This is the check that the shim and the real implementation agree** — they are two implementations of one design, and the shim is where every number in the spec came from.

Also confirm `short pools 0/N` and `bucket absent … element 0.0%` (the `ELEMENT_CARD_WEIGHT` deletion is what makes the last one true).

- [ ] **Step 7: Adversarial gate**

Three reviewers. Correctness must probe: every bucket empty; a `values`-passive at epic/mythic; `run.choiceSlots` undefined. Balance must re-measure per-weapon share **inside** the weapon bucket on beyond and city, not just bucket shares — the first draft's regression was invisible to bucket-share checks.

- [ ] **Step 8: Commit**

```bash
git add src/config.js src/sim.js test/sim-test.js package.json
git commit -m "v6.7.0: the level-up pool rolls a bucket before a rarity, so weapons stop vanishing from it"
```

> **Shipped as v6.7.4 + v6.7.5 — read the code, not the snippets above.** The adversarial gate
> (Step 7) confirmed five defects in the code this task prescribes, and the repair changed the
> shape. Do not re-apply the literal snippets when building on Task 1:
> 1. **`BUCKET_WEIGHTS` has FIVE buckets:** `{ defense: 19, utility: 11, mod: 30, weapon: 22,
>    element: 18 }`. `DEFENSIVE_PASSIVE_WEIGHT` is gone — a weight inside one passive bucket left
>    the seven non-defensive passives' share implicit (measured 1.6% of cards each) and untested
>    (setting the weight to 1 halved defence share with the whole suite green).
> 2. **A weapon UPGRADE card carries `UPGRADE_RARITY` and shows no chip** (spec line 334). Keeping
>    `cfg.rarity` measured city mythic 8.9% of ALL cards, beyond legendary 11.3% on a fixed pool.
> 3. **The values-passive fallback re-rolls the rarity on the passive's OWN `values` keys.** The
>    prescribed `for (const r of [rarity, 'legendary', 'rare', 'normal'])` sent every epic and
>    mythic roll to the top tier: 12.2% legendary armor, +15% mean armor per card.
> 4. **The mod branch filters candidates by the rolled rarity** instead of coercing a declined
>    roll to normal, which was offering switch mods 1.72x their shipped rate.
> 5. **`MUTATORS.unstable.elementWeightMul` is 2, not 3** — the same number against a bucket
>    weight instead of the old 0.25 per-id filter measured 38.6% of cards elemental (the plan's
>    own 37% pathology). x2 measures 29.4%.

---

### Task 2: Anomaly as a sixth rarity tier

**Files:**
- Modify: `src/config.js` — `RARITY_ORDER`, `RARITIES`, `WEAPON_MOD_TIER_BONUS`, new `ANOMALIES` table and constants
- Modify: `src/sim.js` — `rollCard` gains the tier; `buildLevelUpChoices` gains the invariant and the F4 fix; `applyChoice` gains an anomaly branch; the volatile affix reads the anomaly
- Modify: `src/state.js` — `createRun` gains `anomalies: {}`; update the `run` doc block
- Modify: `src/styles.css` — `.lv-card[data-rarity="anomaly"]`
- Modify: `src/fr.js` — the new tier name (**via the French review process, not by hand**)
- Test: `test/sim-test.js` — new `testAnomalyTier()`

**Interfaces:**
- Consumes: Task 1's `rollCard`.
- Produces: `ANOMALIES: Record<string, {name, icon, from, desc, when: (run)=>boolean, weight: number, chapter: string|null}>`; `eligibleAnomalyIds(run) => string[]`; `hasWeaponAt(run, id, lv) => boolean`; `run.anomalies: Record<string, true>`.

- [ ] **Step 1: Write the failing test**

```js
// ---- Run PB2: the anomaly tier -----------------------------------------------------
// Anomalies are a SIXTH rarity tier, not a replacement for mythic. No rarity multiplier, no
// levels — one-shot rule changes, filtered out once taken. See B3/B4/B5.
function testAnomalyTier() {
  Math.random = mulberry32(20260808)
  const meta = makeMeta()
  meta.choiceSlots = 3
  const run = createRun(meta)
  run.player.level = 12   // past ANOMALY_MIN_LEVEL (F10)

  let anomalyCards = 0, pools = 0, lastSlot = 0
  for (let i = 0; i < 4000; i++) {
    run._screenRerolls = -1
    const cards = buildLevelUpChoices(run)
    pools++
    const anomalies = cards.filter((c) => c.kind === 'anomaly')
    if (anomalies.length === 0) continue
    anomalyCards++
    assert.strictEqual(anomalies.length, 1, 'at most one anomaly per pool')
    // B5: a forced pick must never be "take a curse or take a curse".
    assert.ok(cards.some((c) => c.kind !== 'anomaly'),
      'a pool offered nothing but anomalies')
    // The INVARIANT, asserted on every pool — the first draft only counted 1-card pools, which a
    // 3-slot run never produces, so the rule it guards was untested.
    if (cards[cards.length - 1].kind === 'anomaly') lastSlot++
    for (const c of anomalies) {
      assert.ok(!('bonus' in c), `anomaly ${c.id} carries a stat bonus — anomalies produce no growth`)
      assert.ok(ANOMALIES[c.id], `anomaly card has no valid id: ${c.id}`)
    }
  }
  assert.ok(anomalyCards > 0, 'the anomaly tier never rolled at all')
  assert.strictEqual(lastSlot, 0, `${lastSlot} pools ended on an anomaly — the last-slot invariant is broken`)

  // No rarity multiplier, or every anomaly silently scales stats.
  assert.strictEqual(RARITIES.anomaly.mult, 1, 'an anomaly must carry no rarity multiplier')
  // Adding a tier to RARITY_ORDER without a tier bonus breaks run PT.a's <= assertion.
  assert.strictEqual(WEAPON_MOD_TIER_BONUS.anomaly, 1, 'every RARITY_ORDER entry needs a tier bonus')

  // applyChoice must RECORD it — the shipped chain is closed over weapon|passive|mod|element|heal,
  // so without a branch an anomaly card is silently consumed with no effect.
  const taken = createRun(meta)
  taken.levelUpChoices = [{ kind: 'anomaly', id: 'unstableCores', title: 'x', desc: 'x', tag: '', rarity: 'anomaly', icon: '💥' }]
  applyChoice(taken, 0)
  assert.strictEqual(taken.anomalies.unstableCores, true, 'applyChoice must record the anomaly on run.anomalies')

  console.log(`PASS run PB2 (anomaly tier): ${((anomalyCards / pools) * 100).toFixed(1)}% of pools offered one, never alone, never last, never twice`)
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `anomalyCards > 0` is false; no anomaly tier exists.

- [ ] **Step 3: Add the config data**

Replace `RARITY_ORDER` (line 26):

```js
// 'anomaly' is a SIXTH tier, not a replacement for mythic. Replacing mythic would give the mythic
// city starter (rainbow) a "Normal" chip, silently cap all 15 kind:'tier' mods at +2 via
// WEAPON_MOD_TIER_BONUS, break three assertions in test/sim-test.js, and delete the pool's only
// jackpot at the same moment anomalies stop producing stat growth.
export const RARITY_ORDER = ['normal', 'rare', 'epic', 'legendary', 'mythic', 'anomaly']
```

Add to `RARITIES`: `anomaly: { name: 'Anomaly', color: 0x35e0c8, mult: 1.0 },`

Add to `WEAPON_MOD_TIER_BONUS` (line 918): `anomaly: 1`. **Required** — run PT.a asserts `WEAPON_MOD_TIER_BONUS[r] <= Math.max(1, Math.round(RARITIES[r].mult))` over every `RARITY_ORDER` entry, and `undefined <= 1` is `false`.

`RARITY_WEIGHTS` gains **no** anomaly entry — the anomaly weight depends on eligibility and pity, so it is computed per roll and merged in at the roll site.

Then the table:

```js
// ---- Anomalies (Track B) ------------------------------------------------------------
// Run-changing cards with no rarity multiplier and no levels. Behaviour lives at trigger sites in
// sim.js reading run.anomalies.<id> — the same pattern behavioural weapon mods already use.
//
// PREDICATE HAZARD: run.weaponMods / run.weaponModPicks are pre-populated for EVERY weapon, so
// `r.weaponModPicks.star?.chain` is safe. But `r.weapons.find(w => w.id === 'orbit').level` THROWS
// when the weapon is not owned. Use hasWeaponAt (config.js — a predicate authored in config.js
// cannot reach a helper in sim.js without the import cycle that file forbids) instead, always.
//
// NAMING: "Anomaly" is already the player-facing word for a Daily's mutators (ANOMALY_REROLL_COST,
// ui.js "Reroll this anomaly"). Two meanings now share it. Resolve the copy before ship — this is
// a player-facing collision, not an internal one.
export const ANOMALY_BASE_WEIGHT = 8
export const ANOMALY_PITY_PER_CARD = 2
export const ANOMALY_PITY_CAP = 45
export const MAX_ANOMALIES_PER_RUN = 4
// F10: the unconditional cards are eligible from level 1 and taken in ~100% of runs, so without a
// floor a new player's first encounter with the rarest tier is a pure downside.
export const ANOMALY_MIN_LEVEL = 8

export const ANOMALIES = {
  unstableCores: {
    name: 'Unstable Cores', icon: '💥',
    from: 'you killed an elite and something went critical',
    desc: 'Every elite dies volatile. Stand back when it drops.',
    // The hidden gate from the slate: this teaches itself only if you have met an elite.
    when: (r) => (r._eliteKills ?? 0) > 0,
    weight: 1,      // unconditional 1 / conditional 6 / chapter inversion 2
    chapter: null,
  },
}
```

> **These five constants are the SHIM's values, retained deliberately.** The owner's call is 1–2 anomalies per run, which these do not deliver — but retuning them is meaningless against a one-card table, and the guarantee that must accompany a low rate is worse than useless with one card. Both move to the slate plan. See "Deferred, with reasons".

- [ ] **Step 4: Wire the tier in**

In `src/sim.js`, above `rollCard`:

```js
// Safe ownership test. r.weapons.find(...).level throws when the weapon is not owned, which is the
// single easiest way to write an anomaly predicate that crashes a level-up.
function hasWeaponAt(run, id, lv = 1) {
  const w = run.weapons.find((x) => x.id === id)
  return !!w && w.level >= lv
}

function eligibleAnomalyIds(run) {
  if ((run.player.level ?? 1) < ANOMALY_MIN_LEVEL) return []
  if (Object.keys(run.anomalies ?? {}).length >= MAX_ANOMALIES_PER_RUN) return []
  return Object.keys(ANOMALIES).filter((id) => {
    if (run.anomalies?.[id]) return false
    const a = ANOMALIES[id]
    if (a.chapter && a.chapter !== run.chapter) return false
    try { return a.when(run) } catch { return false }  // a bad predicate loses its card, not the screen
  })
}
```

At the top of `rollCard`, before the bucket build:

```js
  if (allowAnomaly) {
    const eligible = eligibleAnomalyIds(run)
    if (eligible.length > 0) {
      const w = {}
      for (const id of eligible) w[id] = ANOMALIES[id].weight
      // The tier competes against the UNDECAYED ordinary total, so its share is readable directly
      // and reroll's rarity decay (Task 4) cannot inflate it by shrinking the denominator.
      const ordinaryTotal = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0)
      if (Math.random() * (ordinaryTotal + ANOMALY_BASE_WEIGHT) < ANOMALY_BASE_WEIGHT) {
        const id = pickWeighted(w)
        const a = ANOMALIES[id]
        return { kind: 'anomaly', id, title: a.name, desc: a.desc, tag: a.from, rarity: 'anomaly', icon: a.icon }
      }
    }
  }
```

In `buildLevelUpChoices`, add `let placedAnomaly = false` beside `pickedIds`, and pass the flag:

```js
    const card = rollCard(run, weaponPool, passiveIds, modCandidates, elementIds, pickedIds, modWeaponCounts, !placedAnomaly)
    if (!card) break
    if (card.kind === 'anomaly') placedAnomaly = true
```

**Anomaly-eligible on every index, not just the early ones.** Then enforce the invariant on the finished array, after the `NEW_WEAPON_MIN_RATE` block:

```js
  // B5 as an INVARIANT, not a position. Gating by index (i < slots - 1) makes the anomaly always
  // the LEFT card at the default 2 slots while NEW_WEAPON_MIN_RATE always swaps the right one — a
  // positionally deterministic screen — and gives 4-slot players 3x the per-screen rate of 2-slot
  // players, which is a lottery on shop spending rather than on play.
  if (cards.length > 0 && cards.every((c) => c.kind === 'anomaly')) {
    cards.pop()   // can only happen if later slots returned null; drop to a non-anomaly-only pool
  }
  if (cards.length > 1) {
    // Shuffle so the tier carries no positional tell.
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const t = cards[i]; cards[i] = cards[j]; cards[j] = t
    }
  }
```

**F4, which the first draft dropped:** guard the `NEW_WEAPON_MIN_RATE` swap so it cannot delete an anomaly. Change its condition to also require `!cards.some((c) => c.kind === 'anomaly')`. Without this the swap overwrites `cards[cards.length - 1]` unconditionally — deleting the anomaly *after* the pity counter was already reset inside `rollCard`.

In `applyChoice` (`src/sim.js:215-241`), add a branch to the chain that currently ends at `else if (choice.kind === 'heal')`:

```js
  } else if (choice.kind === 'anomaly') {
    // No stat growth: an anomaly is a rule change read at its trigger site in sim.js.
    run.anomalies[choice.id] = true
```

- [ ] **Step 5: Run fields and the seed anomaly's real trigger site**

In `src/state.js`'s `createRun`, add `anomalies: {},` and `_eliteKills: 0,`. Add to the doc block:

```
//   anomalies      {id: true} — anomaly cards taken this run, read at trigger sites in sim.js.
//                  Never serialized (run is not saved). Filtered out of future pools once set.
//   _eliteKills    count of elites killed this run; gates anomaly predicates.
```

and add `anomaly` to the doc block's list of `levelUpChoices[i].kind` values.

**`volatile` is an elite AFFIX, not a boolean.** It is produced by `rollAffixes(run)` (`src/sim.js:980`, stored as `affixes` at `:995`) and read **only** as `enemy.affixes.includes('volatile')` (`src/sim.js:3210`). Writing `enemy.volatile = true` is a dead write that nothing reads and no test catches. Instead, in `rollAffixes`, push `'volatile'` onto the affix array for every elite when the anomaly is held:

```js
  if (run.anomalies?.unstableCores && !affixes.includes('volatile')) affixes.push('volatile')
```

Increment `run._eliteKills` at the kill site that already emits `{ type: 'kill', …, elite: enemy.elite }` (`src/sim.js:3184`).

- [ ] **Step 6: UI and copy**

Add `.lv-card[data-rarity="anomaly"]` to `src/styles.css` beside the five existing tier rules (~693-707) — without it the new tier renders with no border, no chip background and no glow, and `RARITIES.anomaly.color` is dead since `ui.js:1156` reads only `.name`.

Add the French entry for `'Anomaly'` to `src/fr.js`. **Run XX (`testFrenchDictionary`) walks `RARITIES` and fails on any `.name` with no `FR` entry**, so this is not optional. Per standing rule, get the rendering adversarially reviewed rather than writing it directly — and note the collision: the player already sees "anomaly" for a Daily's mutators.

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: PASS, including runs XX and PT.a.

- [ ] **Step 8: Measure**

Run: `node scripts/pool-probe.mjs body 2 40 random --proposed`
(`--proposed` is required — the `anomalies/run` report line is gated on it.)
Expected: a non-zero rate at or under `MAX_ANOMALIES_PER_RUN`. Note the shim has its own copies of these constants and does not import the new config, so treat the two as independent implementations and reconcile any gap.

- [ ] **Step 9: Adversarial gate**

Three reviewers. Correctness must probe: a predicate that throws; a pool where later slots return `null`; `run.anomalies` absent; an anomaly `id` colliding with a weapon/passive/mod/element id (`pickedIds` is one flat Set across all kinds). Fun must answer whether a single card in the table is worth shipping at all.

- [ ] **Step 10: Commit**

```bash
git add src/config.js src/sim.js src/state.js src/styles.css src/fr.js test/sim-test.js package.json
git commit -m "v6.7.1: anomalies join the pool as a sixth rarity tier, never a screen's only offer"
```

---

### Task 3: Pity, capped and non-deflecting

**Files:** `src/sim.js` (`rollCard`, `stepLevelUp`), `src/state.js` (`createRun`), `test/sim-test.js`

**Interfaces:** Consumes Task 2's tier. Produces `run._cardsSinceAnomaly: number`.

> **Shipped as v6.7.8 — the field and the constant are named for the SCREEN.** This task's own
> revision note (below) left the pity UNIT open; it is now settled, and the names moved with it:
> `run._cardsSinceAnomaly` → **`run._screensSinceAnomaly`**, `ANOMALY_PITY_PER_CARD` →
> **`ANOMALY_PITY_PER_SCREEN`**. Per card, a 4-slot player accrues pity twice as fast as a 2-slot
> one — the meta-shop lottery v6.7.7 closed on the base rate, walked back in through the pity term.
> Task 4's test snippet still says `_cardsSinceAnomaly`; read it as the new name (setting the old
> one writes a dead field, and the sampler it is meant to hold flat silently drifts).
> The counter INCLUDES the screen being built, so the weight term is `count - 1` clamped at 0 —
> that is what keeps a screen with nothing behind it rolling at exactly `ANOMALY_BASE_WEIGHT`,
> i.e. what keeps that constant's documented 6.6% true rather than an unreachable floor.

- [ ] **Step 1: Write the failing test**

```js
// ---- Run PB3: anomaly pity ---------------------------------------------------------
// Pity resets when the tier is ROLLED, not when a card is produced (F1) — otherwise an ineligible
// pool pumps the counter forever and the tier detonates the moment one becomes eligible. It
// advances once per SCREEN, in stepLevelUp, so a reroll cannot pump it (F5).
function testAnomalyPity() {
  Math.random = mulberry32(20260808)
  const meta = makeMeta()
  const run = createRun(meta)
  run.player.level = 12
  run._eliteKills = 1

  // Pity advances through stepLevelUp, NOT through buildLevelUpChoices. The first draft asserted
  // on buildLevelUpChoices and so passed vacuously whether or not pity was wired to anything.
  run._cardsSinceAnomaly = 0
  run.player.xp = run.player.xpNext
  stepSim(run, { x: 0, y: 0 }, 1 / 60)
  assert.strictEqual(run._cardsSinceAnomaly, 1, 'stepLevelUp must advance pity exactly once per screen')
  run.phase = 'playing'

  // A reroll must NOT advance it.
  const before = run._cardsSinceAnomaly
  buildLevelUpChoices(run)
  assert.strictEqual(run._cardsSinceAnomaly, before, 'a reroll advanced pity — reroll is a pity pump (F5)')

  // Capped: an ineligible stretch cannot make the tier certain.
  const dry = createRun(meta)
  dry.player.level = 12
  dry._eliteKills = 1
  dry._cardsSinceAnomaly = 10000
  let firstPoolOffers = 0
  for (let i = 0; i < 500; i++) {
    const d = createRun(meta)
    d.player.level = 12
    d._eliteKills = 1
    d._cardsSinceAnomaly = 10000   // fresh run each time: the roll RESETS the counter on fire
    d._screenRerolls = -1
    if (buildLevelUpChoices(d).some((c) => c.kind === 'anomaly')) firstPoolOffers++
  }
  const saturated = firstPoolOffers / 500
  const ordinaryTotal = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0)
  const ceiling = ANOMALY_PITY_CAP / (ordinaryTotal + ANOMALY_PITY_CAP)
  assert.ok(saturated < ceiling * 1.6,
    `saturated anomaly rate ${(saturated * 100).toFixed(1)}% exceeds the capped ceiling ${(ceiling * 100).toFixed(1)}% — pity is uncapped`)

  console.log(`PASS run PB3 (anomaly pity): advances once per screen, flat on reroll, capped at ${(saturated * 100).toFixed(1)}% vs ceiling ${(ceiling * 100).toFixed(1)}%`)
}
```

> Each saturation sample uses a **fresh run**, because the roll resets the counter on fire. The first draft reused one run and so measured 399 pools at base weight while claiming saturation — and its assertion (`offered < 400`) passed with the bug present.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `run._cardsSinceAnomaly` is `undefined` after `stepSim`, so `strictEqual(undefined, 1)` fails.

- [ ] **Step 3: Implement**

`src/state.js`'s `createRun`: add `_cardsSinceAnomaly: 0,`.

> **v6.7.7 changed where this lands.** The tier is no longer rolled inside `rollCard` at all: it
> is ONE roll per SCREEN in `buildLevelUpChoices` (`rollAnomalyCard`), because a per-slot roll
> delivered `1-(1-p)^slots` and measured 2.40 anomalies/run at 2 slots against 3.60 at 4 — the
> rarest tier bought in the meta shop. Apply the snippet below to `rollAnomalyCard` instead, and
> note that the pity UNIT is now open: `ANOMALY_PITY_PER_CARD` is named per CARD but the roll it
> feeds happens once per screen, so decide (and name) whether pity advances per card or per screen
> before tuning it. The rate table in `config.js` was measured at the per-screen roll and has to be
> re-measured with pity on.

In `rollAnomalyCard` (was `rollCard`), replace the fixed weight:

```js
      // Capped so a long ineligible stretch cannot detonate the tier the instant one becomes
      // eligible. RESET happens when the tier is ROLLED, not when a card is produced — resetting
      // on production lets an empty eligible pool pump the counter forever (F1).
      const anomalyWeight = Math.min(ANOMALY_PITY_CAP,
        ANOMALY_BASE_WEIGHT + ANOMALY_PITY_PER_CARD * (run._cardsSinceAnomaly ?? 0))
      if (Math.random() * (ordinaryTotal + anomalyWeight) < anomalyWeight) {
        run._cardsSinceAnomaly = 0
```

In `stepLevelUp`, advance once per screen before building:

```js
  run._cardsSinceAnomaly = (run._cardsSinceAnomaly ?? 0) + 1
  run.levelUpChoices = buildLevelUpChoices(run)
```

Advancing here rather than inside `buildLevelUpChoices` is what stops a reroll pumping it (F5) — `main.js`'s `onReroll` calls `buildLevelUpChoices` directly.

- [ ] **Step 4: Run the tests** — `npm test`, expect PASS.

- [ ] **Step 5: Adversarial gate.** Correctness must confirm the F4 ordering: the pity reset happens inside the anomaly roll, but the `NEW_WEAPON_MIN_RATE` swap runs afterward — verify Task 2's guard actually prevents a reset-then-deleted anomaly. (v6.7.7 made the anomaly a REPLACEMENT of an already-rolled slot rather than an extra card, so the all-anomaly fallback that used to be able to throw the roll away is gone by construction; the swap guard is still the live risk.)

> **v6.7.8 put that ordering under test rather than under review.** Run PB3 asserts, on every
> sampled pool, that `_screensSinceAnomaly === 0` **iff** the pool contains an anomaly — so a reset
> whose card is then overwritten is a red test. Mutation-proven: deleting the `!placedAnomaly`
> guard fails with "a pool reset pity without offering an anomaly".
>
> **Measured, same command before and after (`body 2 40 dps --survival --diff=3 --compare`, the
> mortal rig — an immortal probe reaches level 36 and saturates `MAX_ANOMALIES_PER_RUN` whatever
> the weight is, so it cannot see this):** anomalies/run 0.5 → 0.8 on the shipped one-card table
> and 0.8 → 1.2 on the 18-card slate stand-ins. Pity is worth ~+50% relative and lands the slate
> inside the owner's 1–2/run. `survivalReport` now prints that row; it did not, which is why the
> number this task is tuned on was previously unreadable from the harness.

- [ ] **Step 6: Commit**

```bash
git add src/sim.js src/state.js test/sim-test.js package.json
git commit -m "v6.7.2: anomaly pity is capped and resets on the roll, so a dry run can't detonate the tier"
```

---

### Task 4: Reroll nudges rarity, never the anomaly tier

**Files:** `src/config.js`, `src/sim.js`, `src/state.js`, `test/sim-test.js`

**Interfaces:** Consumes Task 3. Produces `run._screenRerolls: number`.

- [ ] **Step 1: Write the failing test**

```js
// ---- Run PB4: reroll nudges rarity, never the anomaly tier --------------------------
// Rerolling buys BIGGER NUMBERS, not more rule-changes. Without that separation reroll becomes a
// pity pump: 133 coins measured anomaly-on-screen going 21% -> 65%.
function testRerollRarity() {
  const sample = (rerolls) => {
    Math.random = mulberry32(20260808)
    const meta = makeMeta()
    meta.choiceSlots = 3
    const run = createRun(meta)
    run.player.level = 12
    run._eliteKills = 1
    let normal = 0, total = 0, anomalyScreens = 0
    const SCREENS = 4000
    for (let i = 0; i < SCREENS; i++) {
      run._screenRerolls = -1
      run._screensSinceAnomaly = 3            // held FLAT so pity cannot confound the comparison
      let cards = buildLevelUpChoices(run)    // (v6.7.8 name — the roll ZEROES it on a hit)
      for (let r = 0; r < rerolls; r++) { run._screensSinceAnomaly = 3; cards = buildLevelUpChoices(run) }
      if (cards.some((c) => c.kind === 'anomaly')) anomalyScreens++
      for (const c of cards) {
        if (c.kind === 'anomaly') continue
        if (c.rarity === 'normal') normal++
        total++
      }
    }
    return { normalShare: normal / total, anomalyRate: anomalyScreens / SCREENS }
  }

  const zero = sample(0)
  const three = sample(3)
  assert.ok(three.normalShare < zero.normalShare - 0.05,
    `rerolling must raise average rarity (normal ${(zero.normalShare * 100).toFixed(1)}% -> ${(three.normalShare * 100).toFixed(1)}%)`)
  // The separation that matters. Measured on the first draft this ran at +35-39% relative because
  // the decayed table was also used for the anomaly denominator; the old tolerance (0.03 absolute)
  // was 4x too wide to see it. Assert RELATIVE drift.
  const drift = Math.abs(three.anomalyRate - zero.anomalyRate) / Math.max(zero.anomalyRate, 1e-9)
  assert.ok(drift < 0.10,
    `rerolling moved the anomaly rate ${(zero.anomalyRate * 100).toFixed(2)}% -> ${(three.anomalyRate * 100).toFixed(2)}% (${(drift * 100).toFixed(0)}% relative) — reroll is buying anomalies`)

  console.log(`PASS run PB4 (reroll rarity): normal ${(zero.normalShare * 100).toFixed(1)}% -> ${(three.normalShare * 100).toFixed(1)}% over 3 rerolls, anomaly rate drift ${(drift * 100).toFixed(0)}%`)
}
```

- [ ] **Step 2: Run the test to verify it fails** — `npm test`. Expected: FAIL on the first assertion; normal share is identical at 0 and 3 rerolls.

- [ ] **Step 3: Implement**

`src/config.js`:

```js
// Rerolling a level-up screen carries a small rarity pity — it buys BIGGER NUMBERS. It
// deliberately does not touch the anomaly weight: without that separation, 133 coins of rerolls
// took anomaly-on-screen from 21% to 65%, i.e. reroll became the way to farm the rarest tier
// rather than a way to fix a bad screen.
export const REROLL_RARITY_DECAY = 0.8   // `normal` weight multiplier per reroll of THIS screen
export const REROLL_RARITY_CAP = 3
```

`src/state.js`'s `createRun`: add `_screenRerolls: 0,`.

In `rollCard`, derive the ordinary table — and **leave the anomaly denominator on the undecayed weights**:

```js
  // Decays only `normal`, so every other tier's share rises proportionally without its own knob.
  const rr = Math.min(REROLL_RARITY_CAP, Math.max(0, run._screenRerolls ?? 0))
  const rarityWeights = rr === 0
    ? RARITY_WEIGHTS
    : { ...RARITY_WEIGHTS, normal: RARITY_WEIGHTS.normal * Math.pow(REROLL_RARITY_DECAY, rr) }
```

Use `rarityWeights` for the `pickWeighted` call **only**. `ordinaryTotal` (Task 2) already sums `RARITY_WEIGHTS`, and must keep doing so: summing the decayed table shrinks the denominator the anomaly tier competes against and raises its share ~35–39% — the exact leak this task exists to prevent.

In `buildLevelUpChoices`, increment on entry: `run._screenRerolls = (run._screenRerolls ?? -1) + 1`. In `stepLevelUp`, reset before the call: `run._screenRerolls = -1`. First build lands on 0; each reroll steps up. **No `main.js` change needed.**

> **Sampler hazard for every future test:** because the counter increments inside `buildLevelUpChoices`, any loop that reuses one `run` pins at `REROLL_RARITY_CAP` after three calls and then samples the *3-reroll* distribution while labelling it the base rate. Every sampling loop in `test/sim-test.js` must set `run._screenRerolls = -1` per iteration. Tasks 1–4 tests already do.

- [ ] **Step 4: Run the tests** — `npm test`, expect PASS. Re-check `testChoiceSlots`, `testStarBalance` and `testFocusNudge`, whose samplers reuse a run.

- [ ] **Step 5: Adversarial gate.** Balance must confirm the zero-reroll distribution is unchanged from Task 1's measurement — the decay must be inert at zero.

- [ ] **Step 6: Commit**

```bash
git add src/config.js src/sim.js src/state.js test/sim-test.js package.json
git commit -m "v6.7.3: rerolling a level-up nudges rarity upward but never buys anomalies"
```

---

### Task 5: Offset the power gain — the hpScale tail, per chapter

The redesign is a net power buff. The owner's lever, **measured and adopted**, is steepening the `hpScale` tail rather than multiplying enemy HP flat:

| | baseline | flat HP ×1.8 | **tail RATE 0.022** |
|---|---|---|---|
| win rate | 7.5% | 7.5% | 7.5% |
| **level-ups** | 14.2 | 12.8 (**−10%**) | **15.2 (+7%)** |
| weaponLvSum | 3.2 | 5.1 | 5.3 |

Same difficulty, better outcome: the tail is unchanged until 150s and most levelling happens before then, so it buys difficulty **without deleting choice moments**. It is also self-targeting — a struggling run dies before 150s and is never touched, where a flat multiplier punishes it hardest.

**Files:** `src/config.js` (per-chapter rate + `CHAPTERS[id].balance`), `src/sim.js` (route the rate through `run.mods`), `test/sim-test.js`

- [ ] **Step 1: Sweep each chapter**

The harness already supports this (`--laterate=N --latestart=N`), and **`--proposed` is mandatory** or the flags are ignored:

```
node scripts/pool-probe.mjs body   2 40 dps --survival --proposed --diff=3 --laterate=0.005
node scripts/pool-probe.mjs city   2 40 dps --survival --proposed --diff=3 --laterate=0.028
node scripts/pool-probe.mjs beyond 4 40 dps --survival --proposed --diff=1 --laterate=0.045
```

Record win rate, median survival **and level-ups** for each. The spec's ladder — body 0.005, pond 0.010, garden 0.015, undergrowth 0.020, city 0.028, skies 0.036, beyond 0.045 — is **verified on body/2 d3 and beyond/2 only; the rest are interpolated.** Sweep each and adjust.

**The number that decides this is level-ups, not win rate.** If a chapter's rate returns difficulty to baseline while cutting level-ups below baseline, the rate is too steep — that is the failure mode that disqualified the flat multiplier.

- [ ] **Step 2: Route the rate per chapter**

`HP_SCALE_LATE_RATE` is a module-level export read directly by `hpScale`. Do **not** let `sim.js` read the constant per chapter. Add the rate to each chapter's balance block in `CHAPTERS` and fold the **ratio** of the new curve to the shipped one into `run.mods.enemyHpMul` at spawn — the same read-once-at-spawn semantics `hpScale` already has, and exactly what the harness does, so the sweep and the implementation measure the same thing.

```js
// Track B: the pool's power gain is absorbed by steepening the END of the run, not by taxing the
// whole of it. Measured better than a flat multiplier on the metric that matters — same win rate,
// +7% level-ups instead of -10% — because the curve is unchanged until HP_SCALE_LATE_START and
// most levelling happens before then. Chapter 1 keeps the shipped curve, so onboarding keeps the
// full gift of the redesign.
export const CHAPTER_LATE_RATE = {
  body: 0.005, pond: 0.010, garden: 0.015, undergrowth: 0.020,
  city: 0.028, skies: 0.036, beyond: 0.045,
}
```

- [ ] **Step 3: Check what else rides `hpScale`**

Verified call sites — the implementation must not disturb the second or forget the third:

- `sim.js:975` `spawnEnemy` — normals **and** elites (`ELITE.hpMul` multiplies the same product); split children inherit via `parent.maxHP * SPLIT_HP_FRAC` (1040). Both intended.
- `sim.js:2666` `stepTraps` — `SNAP_TRAP_DMG * hpScale(run.time)` is the snap trap's **enemy-side** damage. Scaling it makes undergrowth's signature mechanic hit enemies harder while the player side stays flat: a **player buff** that partially cancels the offset in exactly one chapter. Leave this site on the shipped curve.
- `CHAPTERS.blank` — `spawnBlankEnemy` (755) re-pins `e.hp` **without** `hpScale`, and the boss uses the fixed `BLANK_BOSS_HP` table. The Blank therefore absorbs **zero** clawback while keeping the full pool buff, and `pool-probe.mjs` cannot measure it (no `blank` chapter). Decide explicitly whether the Blank needs its own number; do not leave it unstated.

Also update the two stale docs that quote the old curve: `config.js:1463` and `:3443-3445` both say "hpScale(300) ≈ 7.6×".

- [ ] **Step 4: Run the tests** — `npm test`. Scenarios asserting enemy HP or time-to-kill may need updated expectations; each change gets a comment naming this task.

- [ ] **Step 5: Confirm parity on two chapters**

body/2 d3 and beyond/4 d1, per the spec's note that body d1 is at the win ceiling and cannot discriminate. Expected: win rate near the pre-Track-B baseline with **level-ups at or above** it.

- [ ] **Step 6: Adversarial gate.** Fun must answer: does the last 60s of beyond at 22.6× enemy HP play, or is it a wall? The spec flags this as mandatory before locking the number, and the probe's bot is a floor on skill, not a model of it — this one may genuinely need a controller.

- [ ] **Step 7: Commit**

```bash
git add src/config.js src/sim.js test/sim-test.js package.json
git commit -m "v6.7.4: the end of a run steepens per chapter, so the new pool's power costs no level-ups"
```

---

## Deferred, with reasons

- **The zero-run guarantee** (the rate itself was tuned in v6.7.7 against a transplanted 19-card table — see `ANOMALY_BASE_WEIGHT` in config.js for the measurements). Still meaningless against a one-card table: `MAX_ANOMALIES_PER_RUN = 2` is unreachable with one card, and a guarantee then hands 100% of qualifying runs the same card at the same level — strictly worse than no guarantee, which at least leaves variance in *when*. Ship with the slate. **Two measured traps for that plan:** (a) ~~rolls per screen scale with `choiceSlots`, so a 4-slot player sees ~2.4× the per-screen rate — a lottery on shop spending, not on play~~ **fixed in v6.7.7**: one roll per screen, placed in a uniform slot, measured 6.6% of 2-slot screens against 6.3% of 4-slot ones and asserted at both counts in run PB2; (b) after Task 5 the mean level reached is well under any level-gated guarantee in the chapters that need it most, so a level gate must be checked against *mortal* levels, not the immortal probe's.
- **The other 19 cards** and the per-kind (pivot/jackpot/trade) weighting.
- **Ipecac's 22 per-weapon count shapes.** Note: per-cast counts are named `count`/`orbs`/`chunks`/`maxAlive` per weapon, and `WEAPON_COUNT_MODS` is a one-entry *readout patch*, not a registry.
- **The three flatness complaints.** Stated plainly, because the adversarial fun review scored this plan **zero for three, with one amplified**: "cards are boring" is untouched (F14 — 70% of mods are numbers — stays Open); "dominant build per chapter" is untouched and *accelerated* by starter-mod deliverability going 62.5% → 95%; "you cannot pursue a mod" moves 42.9% → 51.7%, still absent from half of runs. This plan makes the pool *deliver what it promises*; it does not make the cards interesting. That is the slate plan's job, and it should be judged on it.
- **A "rule-change vs number" probe column.** The fun review's best suggestion: classify each offered card as a rule-change (`New!` weapon, first pick of an element, `kind:'switch'` or behavioural mod, anomaly) vs a number, and set a target. It is one classifier over data the probe already builds, and it is the only measurement that speaks to "cards are boring". Nobody has measured it yet.
- **Track A** is unblocked by Task 1 — but only if the element bucket genuinely lands at 18%, since Track A's DoT numbers are sized against that share. Confirm at Task 1 Step 6 before starting it.
