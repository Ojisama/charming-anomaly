// Level-up pool balance harness. Runs headless 300s sims and reports what the
// level-up screen actually OFFERS — the measurement behind every number in
// docs/superpowers/specs/2026-08-07-upgrade-pool-design.md.
//
//   node scripts/pool-probe.mjs [chapter] [slots] [runs] [policy] [flags]
//
//   chapter  body|pond|garden|undergrowth|city|skies|beyond   (default body)
//   slots    2..4 level-up cards                              (default 2)
//   runs     sims to average over                             (default 40)
//   policy   random|defense|dps — which card the run picks     (default random)
//   (v6.7.14: --proposed and --compare are GONE. They existed to diff the shipped pool against
//   `proposedChoices`, a hand-written second implementation of buildLevelUpChoices that this file
//   carried while Track B was unshipped. Track B shipped in v6.7.4-v6.7.11, so the shim was
//   measuring a pipeline nobody runs — and because fidelity() was only ever called on it, the
//   declared-vs-achieved bucket table described the DEAD pipeline and could not be pointed at the
//   real one at all. To A/B now, run this TWICE with the same seeds and diff the rows.)
//   --survival   mortal probe: kiting bot, no HP refill, no mega-magnet. Answers "is it still
//                hard?" Everything else measures OFFERS, not difficulty.
//   --diff=N     run difficulty 1..5 (default 1). d1 with a stocked shop is at the win ceiling;
//                use d3+ to discriminate.
//   --shop=N     permanent shop level 0..10 per upgrade. Defaults off the sacrifice ladder
//                (4 slots costs 60 of 80 levels, so slots=4 -> 2, slots=3 -> 6, slots=2 -> 8).
//   --offset=N   enemy HP xN, PROPOSED pipeline only — measures how much clawback neutralises
//                the pool's power gain.
//   --rerolls=N  measure the pool a player who PAID for N rerolls of every screen actually sees
//                (v6.7.11). Without
//                it every row of this harness describes an unrerolled screen, which is not the
//                screen the REROLL_RARITY_DECAY table in config.js is about:
//                  node scripts/pool-probe.mjs body 3 40 random --rerolls=3
//                regenerates that table's rows (rarity line) off the real pipeline. It does NOT
//                charge coins — it answers "what does this pool look like at N rerolls", not "can
//                the player afford it"; the coins/run line above is the other half of that
//                question, and rerollCost(0..7) is 10/15/23/34/51/76/114/171 CUMULATIVE
//                10/25/48/82/133/209/323 over a RUN, not over a screen.
//                READ THE RARITY LINE, NOT THE REST. This is a whole-run probe: at N>0 the run
//                keeps DIFFERENT cards, so it diverges — level, anomalies/run and the pity line
//                are two different runs, not an A/B. Run it as shipped-vs-shipped (two
//                invocations, same seeds) and quote the `rarity` row.
//
// WHAT THIS MEASURES: offer distribution and pick throughput. The probe is IMMORTAL
// (it refills HP every frame) and vacuums gems with a huge magnet, so it is NOT valid
// for survival, time-to-death, or difficulty questions. Those need a different rig.
//
// The tuning block below is now a READOUT of config.js, not a parallel set of knobs: the pool it
// measures is the shipped one. Override a line there to try a value before touching config.js.
import { createRun } from '../src/state.js'
import { stepSim, applyChoice, anomalyWeightFor, buildLevelUpChoices } from '../src/sim.js'
import * as C from '../src/config.js'

// ─── TUNING: mirrors of the shipped config. Edit one, re-run, read the diff. ───────────
// v6.7.5: defence and utility are two BUCKETS, matching config.js — a weight inside one passive
// bucket left the seven non-defensive passives' share implicit (and untested). Weights sum to 100,
// so each one reads as its declared share of the table.
// v6.7.14: these ALIAS config rather than restating it. A hand-kept copy that has drifted is a
// harness measuring a pool nobody plays, and this file has already sprung that trap once — its
// anomaly constants were still 8/4 after config.js was tuned to 12/2. DEFENSIVE is the urgent one:
// it is read on the live measurement path (defOffered), so a drifted copy corrupts the defence
// share in every report, not just a dead column. Override a line here to try a value first.
const BUCKET_WEIGHTS = C.BUCKET_WEIGHTS
const DEFENSIVE = new Set(C.DEFENSIVE_PASSIVES)
// Mythic is RETAINED: rainbow (the city starter) is mythic, WEAPON_MOD_TIER_BONUS has a
// live mythic:3, and it is the only jackpot card left once anomalies produce no stats.
const P_RARITY_WEIGHTS = C.RARITY_WEIGHTS
// Weapon rarity gates ACQUISITION, not levelling. A `New!` card carries the weapon's rarity —
// that IS the jackpot moment. An upgrade card carries none: weighting owned weapons by their
// rarity too made beyond read 16.6% legendary weapon offers and city 4.2% mythic, because the
// colour kept re-firing for a jackpot the player already had.
const WEAPON_UP_WEIGHT = C.WEAPON_UP_WEIGHT
// Override for the per-pool per-weapon mod cap. A flat 1 starves the mod bucket at 4 slots
// (measured absent 15.5% of rolls in beyond); a flat 2 floods a 2-slot star-only pool. v6.7
// shipped that as the slot-aware maxModsPerWeaponPerPool(slots), so the default is now null =
// use config's value.
const MODS_PER_WEAPON_PER_POOL = null
// v6.7.7: these DEFAULT to the shipped constants rather than duplicating them. The tier ships, so
// a hand-kept copy that has drifted is a harness measuring a pipeline nobody runs — this file's
// copies were still 8/4 after config.js was tuned to 12/2 against measured runs. Override a line
// here to tune a value before touching config.js; that is what this block is for.
const ANOMALY_BASE_WEIGHT = C.ANOMALY_BASE_WEIGHT
const ANOMALY_PITY_PER_SCREEN = C.ANOMALY_PITY_PER_SCREEN
const ANOMALY_PITY_CAP = C.ANOMALY_PITY_CAP
const MAX_ANOMALIES_PER_RUN = C.MAX_ANOMALIES_PER_RUN
// ──────────────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const pos = args.filter((a) => !a.startsWith('--'))
const CHAPTER = pos[0] ?? 'body'
const SLOTS = Number(pos[1] ?? 2)
const RUNS = Number(pos[2] ?? 40)
const POLICY = pos[3] ?? 'random'
const SURVIVAL = flags.has('--survival')
const DIFF = Number(args.find((a) => a.startsWith('--diff='))?.slice(7) ?? 1)
const OFFSET = Number(args.find((a) => a.startsWith('--offset='))?.slice(9) ?? 1)
// --rerolls=N: re-deal every screen N times before measuring it, exactly as a paying player would
// (see the header). Shipped pipeline only. Drives buildLevelUpChoices through the same field
// main.js's reroll purchase steps, so the anomaly memo (run._screenAnomaly) survives the re-deal
// and the tier stays decided once per screen — the reason this cannot be faked by rebuilding the
// screen from scratch.
const REROLLS = Number(args.find((a) => a.startsWith('--rerolls='))?.slice(10) ?? 0)
const XPMUL = Number(args.find((a) => a.startsWith('--xpmul='))?.slice(8) ?? 1)
// v6.7.14: --modcands, --focus/--focusmul and --specialist are GONE. All four biased the mod
// bucket INSIDE proposedChoices, so with the shim deleted they had nothing left to act on:
// --modcands in particular could never have worked against the shipped pool, because sim.js reads
// MOD_CANDIDATES_PER_WEAPON from config directly. Leaving a flag that parses and then silently
// changes nothing is worse than not having it — it reads as a measurement that was taken.
// To ask those questions again, change the constant in config.js and run this twice.
// --laterate / --latestart: reshape the TAIL of hpScale instead of multiplying it flat.
// hpScale(t) = (1 + t/90) * (t <= START ? 1 : 1 + RATE*(t - START))   [config.js]
// hpScale is a module-level import sim.js cannot be made to re-read, but spawnEnemy multiplies
// base.hp * hpScale(run.time) * run.mods.enemyHpMul (sim.js) — so driving enemyHpMul by the
// RATIO of the new curve to the shipped one reproduces the reshaped curve exactly, for every
// enemy spawned after the change. Already-alive enemies keep their HP, which is also how the
// real hpScale behaves (it is read once, at spawn).
const LATE_RATE = Number(args.find((a) => a.startsWith('--laterate='))?.slice(11) ?? C.HP_SCALE_LATE_RATE)
const LATE_START = Number(args.find((a) => a.startsWith('--latestart='))?.slice(12) ?? C.HP_SCALE_LATE_START)
const curve = (t, start, rate) => {
  const b = 1 + t / 90
  return t <= start ? b : b * (1 + rate * (t - start))
}
const RESHAPED = LATE_RATE !== C.HP_SCALE_LATE_RATE || LATE_START !== C.HP_SCALE_LATE_START
const curveRatio = (t) =>
  curve(t, LATE_START, LATE_RATE) / curve(t, C.HP_SCALE_LATE_START, C.HP_SCALE_LATE_RATE)

// ---- Card emulation. All of these ride live `run` knobs, so they need no src change — and they
// were never shim-specific, despite having been gated to it until v6.7.14.
// --timescale=N  TIME DEBT: the run CLOCK runs at N x while weapons, movement and regen stay on the
//   real one. Everything that reads run.time (hpScale, dmgScale = 1 + t/300, spawnRate, eliteEvery,
//   victory at RUN_DURATION) therefore arrives N x sooner, but your dps and sustain do not scale
//   with it. Emulated by adding the surplus to run.time after each step.
const TIMESCALE = Number(args.find((a) => a.startsWith('--timescale='))?.slice(12) ?? 1)
// --overload=N   OVERLOAD: 2x fire rate, 2x damage, N HP per SECOND. player.fireRateMul and
//   player.damageMul are per-player knobs (state.js); the HP cost is applied raw rather
//   than through hurtPlayer (not exported) — fine for pricing, it only skips the hurt event and the
//   retaliate mods. Per-second, NOT per-shot: fires/s spans 0.5 (city, beam) to 3.8 (body), a 7.6x
//   chapter lottery, and a beam has no "shot" to charge for at all.
const OVERLOAD = args.some((a) => a.startsWith('--overload'))
const OVERLOAD_COST = Number(args.find((a) => a.startsWith('--overload='))?.slice(11) ?? 1)
// --fire=N --dmg=N   SOY MILK / IPECAC: flat multipliers on the same two player knobs Overload
//   rides. Soy Milk is --fire=5 --dmg=0.2 (dps-NEUTRAL on paper, 5 x 0.2 = 1.0); Ipecac is
//   --fire=0.5 --dmg=3 (1.5x on paper). Both paper figures are the question, not the answer:
//   overkill waste makes big hits worth less than their multiplier, and per-hit damage that falls
//   under a tank's effective HP makes small hits worth less than theirs. Multipliers, unlike
//   Overload's per-second cost, carry no cadence hazard — they scale a beam and a shotgun alike.
const FIRE_MUL = Number(args.find((a) => a.startsWith('--fire='))?.slice(7) ?? 1)
const DMG_MUL = Number(args.find((a) => a.startsWith('--dmg='))?.slice(6) ?? 1)
// v6.7.14: --rarityfloor (the BLIND FAITH probe) is GONE with the shim it was read inside. The
// card is still unbuilt and its measurement still matters — see the spec — but it must be re-added
// against the shipped roll in sim.js, not re-implemented here. A second implementation of the
// rarity roll is what this deletion was about.
// --spread=N  IPECAC-as-COUNT (user 2026-08-08: "3x projectiles, or beam arms, or 3 claws in
//   different directions" instead of 3x damage). Grants +N to every OWNED weapon's count mod, once
//   per weapon, as it is acquired. Every weapon has such a mod — that is the whole reason this
//   version of the card is authorable at all.
//   APPROXIMATE: this is "+N things per cast", not literally "xN things". For a weapon whose base
//   count is 1 (star volley, rainbow beam) +2 IS x3; for one that already fires several (orbit's
//   ring) it is less. Read it as the SHAPE of the change, not a calibrated multiplier.
//   Stacks on top of whatever count mods the run picks, deliberately — that stacking is a live
//   design question for the card, so the rig must not hide it.
const SPREAD = Number(args.find((a) => a.startsWith('--spread='))?.slice(9) ?? 0)
const COUNT_MOD = {
  star: 'multishot', orbit: 'extraOrb', wave: 'echo', boomerang: 'extraRang', mines: 'minefield',
  homing: 'extraWisp', hole: 'singularity', rainbow: 'prismatic', bloom: 'twinBloom',
}

// Permanent shop progression, 0..10 per upgrade. Zero is only honest for a chapter-1 first run:
// nobody reaches city (ch5) or buys a 4th slot without a stocked shop, and a survival number from
// a zero-shop save on a late chapter measures the empty save, not the pool.
// NOTE the sacrifice ladder couples this to SLOTS: SACRIFICE_COSTS is [20, 40], so a 4-slot player
// has spent 60 of the 80 available levels and can hold at most ~20 (≈2/upgrade). Defaults below
// encode that; --shop=N overrides.
const SHOP_LV = Number(args.find((a) => a.startsWith('--shop='))?.slice(7) ??
  (SLOTS >= 4 ? 2 : SLOTS === 3 ? 6 : 8))
const makeMeta = () => ({
  coins: 0,
  shop: Object.fromEntries(Object.keys(C.SHOP).map((id) => [id, Math.min(SHOP_LV, C.MAX_SHOP_LEVEL)])),
  best: { time: 0, kills: 0 },
  runs: 0,
  choiceSlots: SLOTS,
})

const rarityMult = (r) => C.RARITIES[r]?.mult ?? 1

const stats = {
  anomalyRolls: 0, emptyAnomalyPool: 0, shortPools: 0, pools: 0,
  // Bucket accounting: how often a bucket was ABSENT at roll time. Declared weights can only
  // be honoured while a bucket has candidates, so this is the drift budget made visible
  // instead of inferred from the output shares.
  slots: 0, absent: { defense: 0, utility: 0, mod: 0, weapon: 0, element: 0 },
}

// ─── SURVIVAL MODE (--survival) ────────────────────────────────────────────────────────
// The default probe is IMMORTAL and cannot answer "is the run still hard?". Survival mode
// drops the HP refill and the 4000px magnet and drives a kiting bot, so death time and win
// rate become measurable. It answers exactly one question: is this configuration materially
// easier or harder than the one you measured last?
//
// BOT POLICY (state it with every number — intake figures on this repo are
// bot-policy-sensitive): **kite-and-collect**. Flees nearby enemies with 1/d weighting so the
// nearest dominates, and otherwise walks to the nearest xp gem. The blend is the whole point:
// a PURE kiter never collects, so it never levels (measured level 6.3 vs 28.6 immortal), and a
// probe whose bot never levels cannot see a change to the level-up pool at all.
// Flee takes over completely inside PANIC_R; outside it, collecting dominates.
// It does not dodge projectiles, use cover, or path around obstacles — a floor on player
// skill, not a model of one.
const KITE_R2 = 600 * 600
const PANIC_R = 170
const GEM_R2 = 900 * 900
function kiteInput(run) {
  const p = run.player
  let bx = 0, by = 0, nearest = Infinity
  for (const e of run.enemies) {
    if (e._dead) continue
    const dx = p.x - e.x, dy = p.y - e.y
    const d2 = dx * dx + dy * dy
    if (d2 > KITE_R2) continue
    if (d2 < nearest) nearest = d2
    const d = Math.sqrt(d2) || 1
    bx += (dx / d) / d
    by += (dy / d) / d
  }
  const fm = Math.hypot(bx, by) || 1
  bx /= fm; by /= fm

  let gx = 0, gy = 0, best = GEM_R2
  for (const g of run.gems) {
    const dx = g.x - p.x, dy = g.y - p.y
    const d2 = dx * dx + dy * dy
    if (d2 < best) { best = d2; gx = dx; gy = dy }
  }
  const gm = Math.hypot(gx, gy)
  if (gm > 0) { gx /= gm; gy /= gm }

  // Panic blend: 1 = pure flee at contact, 0 = pure collect once the field is clear.
  const w = gm === 0 ? 1 : Math.min(1, (PANIC_R * PANIC_R) / (nearest || 1))
  const x = bx * w + gx * (1 - w)
  const y = by * w + gy * (1 - w)
  const m = Math.hypot(x, y) || 1
  return { x: x / m, y: y / m }
}

// Per-run seeded RNG so two invocations start from the same world. The two
// pipelines consume different numbers of draws and diverge within a level, so this is
// variance reduction and reproducibility, NOT a paired comparison — the sample size still
// has to carry the result.
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const REAL_RANDOM = Math.random

const DEF_SCORE = { armor: 100, maxHP: 60, regen: 40 }
function choose(cards) {
  if (POLICY === 'random') return (Math.random() * cards.length) | 0
  let best = 0, bs = -Infinity
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i]
    const mult = rarityMult(c.rarity)
    let s
    if (c.kind === 'anomaly') s = 1000
    else if (POLICY === 'defense') s = c.kind === 'passive' ? (DEF_SCORE[c.id] ?? 5) * mult : c.kind === 'weapon' ? 20 : 8
    else s = c.kind === 'weapon' ? 90 : c.kind === 'mod' ? 40 * mult : c.kind === 'element' ? 35 * mult
      : ['damage', 'fireRate', 'critDamage', 'critChance'].includes(c.id) ? 45 * mult : 5
    if (s > bs) { bs = s; best = i }
  }
  return best
}

function measure() {
  stats.anomalyRolls = stats.emptyAnomalyPool = stats.shortPools = stats.pools = 0
  // v6.7.9 pity diagnostics. anomalyRolls counts screens the tier was ELIGIBLE on (the only ones
  // that roll, and now the only ones that accrue pity); Offers, those that came up anomaly;
  // WeightSum/Capped, the weight actually in play. config.js's rate block used to claim
  // ANOMALY_BASE_WEIGHT "reads directly as the share of screens carrying an anomaly" — these three
  // counters are what makes that claim checkable instead of asserted.
  stats.anomalyOffers = stats.anomalyWeightSum = stats.anomalyCapped = 0
  const kinds = {}, rarities = {}
  const levels = [], anomalies = [], weaponLv = [], deaths = []
  // Deliverability: can a player PURSUE a specific mod? Counts, per mod, how many runs offered it
  // at least once. User report (2026-08-08): "frustrating to aim for some mod (like laser prism
  // sub-beams) and not seeing any in the run" — this is the measurement of that complaint.
  const modRuns = new Map()
  const coinsEarned = [], killCounts = [], fireCounts = [], eliteKillCounts = []
  const hurtCounts = [], hpLostCounts = []
  const defTotals = { armor: 0, regen: 0, maxHP: 0 }
  const defPicks = { armor: 0, regen: 0, maxHP: 0 }
  let offered = 0
  // Defensive-card share is now COUNTED, not inferred. It used to be inferred for the `current`
  // column from passive share x 3/10, which silently assumed every passive is equally likely —
  // true of the flat bag, false since v6.7 gave defence its own bucket weight. That estimator read
  // 8.9% against a real 17-18%.
  let defOffered = 0

  for (let n = 0; n < RUNS; n++) {
    // Seed EVERY mode, not just --survival. Unseeded offer runs made the `current` column swing
    // 6.1pts between two invocations of the same config — larger than the ~4pt effect a --specialist
    // A/B was trying to resolve, so cross-invocation comparisons were pure noise. Per-run seeding
    // makes the shipped-pipeline column reproducible across invocations, which is what makes
    // proposed-vs-proposed comparisons legible at all.
    Math.random = mulberry32(0x5eed + n * 7919)
    const run = createRun(makeMeta(), { chapter: CHAPTER, difficulty: DIFF })
    run.choiceSlots = SLOTS
    // --offset=N: enemy HP multiplier applied to the PROPOSED pipeline only, to measure how much
    // clawback neutralises the pool's power gain. enemyHpMul is a live per-spawn knob
    // (sim.js), so this needs no src/ change. It is a stand-in for whichever lever ships —
    // xpForLevel is a module-level import and cannot be shimmed from here.
    if (OFFSET !== 1) run.mods.enemyHpMul *= OFFSET
    // --xpmul=N: the xpForLevel offset, measured through the one lever the harness CAN reach.
    // xpForLevel is a module-level import (config.js, sim.js) so it cannot be shimmed;
    // run.mods.xpMul (sim.js) scales gem xp at pickup, which moves total picks the same way.
    // CONVERSION: cumulative xp to level L is sum(5 + 4l) ~ 5L + 2L^2, so the quadratic term
    // dominates and cost scales ~linearly in the coefficient. xpMul = m is therefore worth
    // xpForLevel = 5 + level * (4 / m). Approximate — verify the real curve once it ships.
    if (XPMUL !== 1) run.mods.xpMul *= XPMUL
    const baseHpMul = run.mods.enemyHpMul
    if (!SURVIVAL) run.player.magnet = 4000
    if (OVERLOAD) {
      run.player.fireRateMul *= 2
      run.player.damageMul *= 2   // user 2026-08-08: double damage, not +50%
    }
    if (FIRE_MUL !== 1) run.player.fireRateMul *= FIRE_MUL
    if (DMG_MUL !== 1) run.player.damageMul *= DMG_MUL
    const st = { since: 0, taken: new Set() }
    const seenMods = new Set()
    const dt = 1 / 60
    // Counting weapon FIRES without touching src/: weaponTimers[id] counts DOWN to the next shot
    // and is reset upward on fire, so a rising edge is exactly one fire. Covers every weapon —
    // only 7 of them emit a 'shoot' event (those are for SFX), and none of the city three do.
    let fires = 0, eliteKills = 0, hurts = 0, hpLost = 0
    let prevSince = 0   // last observed run._screensSinceAnomaly — see the pity diagnostics below
    const prevT = {}
    // Weapons arrive mid-run, so the grant is re-checked rather than applied once at setup.
    const spreadDone = new Set()
    const grantSpread = () => {
      if (!SPREAD) return
      for (const w of run.weapons ?? []) {
        const mod = COUNT_MOD[w.id]
        if (!mod || spreadDone.has(w.id)) continue
        run.weaponMods[w.id] ??= {}
        run.weaponMods[w.id][mod] = (run.weaponMods[w.id][mod] ?? 0) + SPREAD
        spreadDone.add(w.id)
      }
    }
    grantSpread()

    // 305s: RUN_DURATION is 300 and victory flips ON the boundary, so the loop must cross it.
    for (let f = 0; f < 305 * 60; f++) {
      if (run.phase === 'levelup') {
        // --rerolls=N: the screen a PAYING player ends up looking at. Stepping run._screenRerolls
        // is exactly what the purchase does (sim.js rerollLevelUpChoices), so this measures the
        // decayed rarity table without re-implementing it here. Before the pity read below,
        // because the reroll IS the screen as far as every downstream count is concerned — the
        // v6.7.9 memo keeps the tier's answer identical across the re-deals, which is the property
        // that makes "rerolls do not buy Ruptures" visible in this harness's anomaly line.
        if (REROLLS > 0) {
          for (let r = 0; r < REROLLS; r++) {
            run._screenRerolls = (run._screenRerolls ?? 0) + 1
            run.levelUpChoices = buildLevelUpChoices(run)
          }
        }
        let cards = run.levelUpChoices
        // The SHIPPED pipeline's pity, read off the run rather than re-derived: the counter only
        // moves on a screen the tier was ELIGIBLE on (v6.7.9), so "it moved, or an anomaly came
        // up" IS eligibility, and in both cases the value the roll used was prevSince + 1 (a hit
        // zeroes it afterwards). anomalyWeightFor is imported from sim.js so the harness cannot
        // drift from the shipped formula — this file has shipped a stale copy of these constants
        // before.
        const onScreen = cards.some((c) => c.kind === 'anomaly')
        if (onScreen || run._screensSinceAnomaly !== prevSince) {
          const w = anomalyWeightFor({ _screensSinceAnomaly: prevSince + 1 })
          stats.anomalyRolls++
          stats.anomalyWeightSum += w
          if (w >= ANOMALY_PITY_CAP) stats.anomalyCapped++
          if (onScreen) stats.anomalyOffers++
        }
        prevSince = run._screensSinceAnomaly
        stats.pools++
        if (cards.length < SLOTS) stats.shortPools++
        for (const c of cards) {
          offered++
          kinds[c.kind] = (kinds[c.kind] ?? 0) + 1
          rarities[c.rarity] = (rarities[c.rarity] ?? 0) + 1
          if (c.kind === 'passive' && DEFENSIVE.has(c.id)) defOffered++
          if (c.kind === 'mod') seenMods.add(`${c.weapon}.${c.id}`)
        }
        run.levelUpChoices = cards
        const i = choose(cards)
        // v6.7.6: applyChoice HAS an anomaly branch now (it records run.anomalies[id], which is
        // what keeps the card out of every later pool), so anomalies go through it like any other
        // card. Skipping it — as this did while the tier was shim-only — left the shipped pipeline
        // re-offering the same anomaly for the rest of the run, i.e. the `current` column could
        // not measure the real tier at all. st.taken stays as the counter because proposed-mode
        // ids are stand-ins with no ANOMALIES entry.
        if (cards[i].kind === 'anomaly') st.taken.add(cards[i].id)
        applyChoice(run, i)
        grantSpread()   // a choice may have been a New! weapon
        run.phase = 'playing'
        continue
      }
      if (run.phase !== 'playing') break
      // Reshaped tail: re-derive the spawn-time HP multiplier from the curve ratio each frame.
      if (RESHAPED) run.mods.enemyHpMul = baseHpMul * curveRatio(run.time)
      let input
      if (SURVIVAL) {
        input = kiteInput(run)
      } else {
        run.player.hp = run.player.maxHP // immortal probe: measuring the pool, not survival
        const t = f / 60
        input = { x: Math.cos(t * 0.7), y: Math.sin(t * 0.7) }
      }
      stepSim(run, input, dt)
      for (const [id, t] of Object.entries(run.weaponTimers)) {
        if (t > (prevT[id] ?? 0) + 1e-9) fires++
        prevT[id] = t
      }
      // Cost is per SECOND, not per fire — see the fires/s spread in the spec: 0.5/s (city, beam)
      // to 3.8/s (body) is a 7.6x chapter lottery, and "per shot" is undefined for beams entirely.
      if (OVERLOAD && SURVIVAL) run.player.hp -= OVERLOAD_COST * dt
      if (TIMESCALE !== 1) run.time += dt * (TIMESCALE - 1)
      // BLOOD PACT stacks per kill AND per elite kill, so both rates need their own denominator.
      // MARTYR is priced on HP LOST, so both the count and the total matter: N x hp-lost is a
      // per-hit burst, and hp-lost/run is the run-long damage budget it converts. Only meaningful
      // under --survival (the offer probe refills to maxHP every frame, so `hurt` still fires but
      // the player never actually spends anything).
      for (const ev of run.events) {
        if (ev.type === 'kill' && ev.elite) eliteKills++
        else if (ev.type === 'hurt') { hurts++; hpLost += ev.dmg }
      }
      run.events.length = 0
    }
    Math.random = REAL_RANDOM
    if (SURVIVAL) deaths.push({ won: run.phase === 'victory', t: run.time, hp: run.player.hp })

    for (const k of seenMods) modRuns.set(k, (modRuns.get(k) ?? 0) + 1)
    coinsEarned.push(run.coinsEarned ?? 0)
    killCounts.push(run.kills ?? 0)
    eliteKillCounts.push(eliteKills)
    hurtCounts.push(hurts)
    hpLostCounts.push(hpLost)
    fireCounts.push(fires)
    levels.push(run.player.level)
    anomalies.push(st.taken.size)
    weaponLv.push(run.weapons.reduce((s, w) => s + w.level, 0))
    for (const k of Object.keys(defTotals)) {
      defTotals[k] += run.passives[k] ?? 0
      defPicks[k] += run.passivePicks[k] ?? 0
    }
  }

  const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length
  const share = (o, k) => (100 * (o[k] ?? 0)) / offered
  const defShare = (defOffered / (offered || 1)) * 100
  return {
    level: avg(levels),
    cards: offered / RUNS,
    shortPools: stats.shortPools,
    pools: stats.pools,
    kinds: Object.fromEntries(['passive', 'mod', 'weapon', 'element', 'anomaly'].map((k) => [k, share(kinds, k)])),
    rarities: Object.fromEntries(['normal', 'rare', 'epic', 'legendary', 'mythic', 'anomaly', 'upgrade'].map((k) => [k, share(rarities, k)])),
    defPicks: Object.values(defPicks).reduce((a, b) => a + b, 0) / RUNS,
    defTotals: Object.fromEntries(Object.entries(defTotals).map(([k, v]) => [k, v / RUNS])),
    defShare,
    anomalies: avg(anomalies),
    weaponLv: avg(weaponLv),
    // Pity, as it actually ran (see the counters in measure/proposedChoices). eligScreens is per
    // run; offerRate and meanWeight are over ELIGIBLE screens, which is the denominator the tier's
    // weight is defined against — offers/all-screens would be diluted by the ineligible stretch.
    eligScreens: stats.anomalyRolls / RUNS,
    offerRate: (100 * stats.anomalyOffers) / (stats.anomalyRolls || 1),
    meanWeight: stats.anomalyWeightSum / (stats.anomalyRolls || 1),
    cappedShare: (100 * stats.anomalyCapped) / (stats.anomalyRolls || 1),
    emptyPool: stats.emptyAnomalyPool / RUNS,
    absent: Object.fromEntries(Object.entries(stats.absent).map(([k, v]) => [k, (100 * v) / (stats.slots || 1)])),
    modRuns,
    coins: avg(coinsEarned),
    kills: avg(killCounts),
    eliteKills: avg(eliteKillCounts),
    hurts: avg(hurtCounts),
    hpLost: avg(hpLostCounts),
    fires: avg(fireCounts),
    liveT: avg(deaths.length ? deaths.map((d) => Math.min(d.t, C.RUN_DURATION)) : [C.RUN_DURATION]),
    winRate: deaths.length ? (100 * deaths.filter((d) => d.won).length) / deaths.length : 0,
    deathT: deaths.filter((d) => !d.won).map((d) => d.t),
  }
}

const f1 = (n) => n.toFixed(1)
function report(r) {
  console.log(`\n== ${CHAPTER} slots=${SLOTS} runs=${RUNS} policy=${POLICY}` +
    (REROLLS > 0 ? `  rerolls=${REROLLS}/screen (decay ${C.REROLL_RARITY_DECAY}^min(${REROLLS},${C.REROLL_RARITY_CAP}) on \`normal\`)` : ''))
  console.log(`level ${f1(r.level)}  cards/run ${f1(r.cards)}  weaponLvSum ${f1(r.weaponLv)}  coins/run ${f1(r.coins)} (cap ${C.COIN_CAP_PER_RUN})`)
  console.log(`kills/run ${f1(r.kills)} (elites ${f1(r.eliteKills)})  fires/run ${f1(r.fires)} (${f1(r.fires / r.liveT)}/s over ${f1(r.liveT)}s alive)`)
  console.log(`short pools ${r.shortPools}/${r.pools}  (MUST be 0)`)
  console.log(`kind   ${Object.entries(r.kinds).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${f1(v)}%`).join('  ')}`)
  console.log(`rarity ${Object.entries(r.rarities).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${f1(v)}%`).join('  ')}`)
  console.log(`defence ${f1(r.defShare)}% of cards, ${f1(r.defPicks)} picks/run — armor ${r.defTotals.armor.toFixed(2)} regen ${r.defTotals.regen.toFixed(2)} maxHP ${f1(r.defTotals.maxHP)}`)
  console.log(`anomalies ${r.anomalies.toFixed(2)}/run (cap ${MAX_ANOMALIES_PER_RUN})` +
    `  [${Object.keys(C.ANOMALIES).length} card(s) in ANOMALIES]`)
  // The pity line. Read offer rate against ANOMALY_BASE_WEIGHT's share (base/(ordinary+base)):
  // equal means pity never got going, far above means the run spends its screens dry.
  console.log(`pity  ${f1(r.eligScreens)} tier-eligible screens/run, ${f1(r.offerRate)}% of them offered one` +
    `  (mean weight ${f1(r.meanWeight)} vs base ${ANOMALY_BASE_WEIGHT}, at the cap on ${f1(r.cappedShare)}%)`)
}

// Can a player PURSUE a named mod? For every mod on every weapon in the chapter, the share of runs
// that offered it AT LEAST ONCE. A low number means "aim for prismatic" is not a strategy the pool
// supports — the card simply never shows up, which is the agency complaint, not a variety one.
function deliverability(r) {
  const ids = []
  for (const w of C.CHAPTERS[CHAPTER].weapons) {
    for (const m of Object.keys(C.WEAPON_MODS[w] ?? {})) ids.push(`${w}.${m}`)
  }
  const pct = (k) => (100 * (r.modRuns.get(k) ?? 0)) / RUNS
  const rows = ids.map((k) => ({ k, v: pct(k) })).sort((x, y) => x.v - y.v)
  console.log(`\n== mod deliverability (${CHAPTER}) — % of runs offering this mod at least once`)
  for (const x of rows) console.log(`  ${x.k.padEnd(24)} ${f1(x.v).padStart(5)}%`)
  const mean = rows.reduce((t, x) => t + x.v, 0) / rows.length
  console.log(`  ${'MEAN'.padEnd(24)} ${f1(mean).padStart(5)}%   worst ${f1(rows[0].v)}% (${rows[0].k})`)
}

// Declared vs achieved, per bucket, as a share of ORDINARY cards.
// v6.7.14: the "absent N% of rolls" column is gone with the shim. It was computed inside
// proposedChoices, which knew each bucket's candidate list because it BUILT it. The shipped
// pipeline decides that inside sim.js, and the only way to report it here would be to
// re-implement eligibility — exactly the duplicate this file just deleted. A bucket short of its
// declared share is still visible as drift; what is no longer distinguishable is "the roll is
// wrong" from "the bucket had nothing to offer".
function fidelity(r) {
  const tot = Object.values(BUCKET_WEIGHTS).reduce((a, b) => a + b, 0)
  const ordinary = 100 - r.kinds.anomaly
  console.log(`\n== bucket fidelity (${CHAPTER} slots=${SLOTS}) — share of ORDINARY cards`)
  // defence/utility both emit kind 'passive', so their shares are split out of it: defShare is
  // counted card by card (see defOffered), and utility is whatever passive share is left.
  for (const k of ['defense', 'utility', 'mod', 'weapon', 'element']) {
    const want = (100 * BUCKET_WEIGHTS[k]) / tot
    const raw = k === 'defense' ? r.defShare : k === 'utility' ? r.kinds.passive - r.defShare : r.kinds[k]
    const got = (100 * raw) / ordinary
    console.log(`  ${k.padEnd(8)} want ${f1(want).padStart(5)}%  got ${f1(got).padStart(5)}%  drift ${(got - want >= 0 ? '+' : '') + f1(got - want).padStart(5)}pts`)
  }
}

function survivalReport(r) {
  const med = (xs) => { if (!xs.length) return NaN; const s = [...xs].sort((x, y) => x - y); return s[s.length >> 1] }
  console.log(`\n== SURVIVAL (${CHAPTER} slots=${SLOTS} d${DIFF} shop=${SHOP_LV}/10 runs=${RUNS} picks=${POLICY}${OFFSET !== 1 ? ` enemyHP x${OFFSET}` : ''}${XPMUL !== 1 ? ` xpMul x${XPMUL} (= xpForLevel 5+level*${(4 / XPMUL).toFixed(2)})` : ''})`)
  if (RESHAPED) {
    console.log(`   hpScale tail: START ${LATE_START}s RATE ${LATE_RATE} (shipped ${C.HP_SCALE_LATE_START}s ${C.HP_SCALE_LATE_RATE})`)
    console.log(`   vs shipped -> ` + [120, 150, 180, 210, 240, 270, 300]
      .map((t) => `${t}s x${curveRatio(t).toFixed(2)}`).join('  '))
  }
  console.log(`   bot: kite-and-collect — flees enemies (1/d, 600px), else walks to nearest gem;`)
  console.log(`   pure flee inside ${PANIC_R}px. No projectile dodging, no cover, no obstacle pathing.`)
  console.log(`   A FLOOR on player skill, not a model of one. Quote the policy with the number.`)
  const row = (l, x, u = '') => console.log(`  ${l.padEnd(20)} ${f1(x).padStart(6)}${u}`)
  row('win rate', r.winRate, '%')
  row('median death t', med(r.deathT), 's')
  row('mean death t', r.deathT.reduce((s, v) => s + v, 0) / (r.deathT.length || 1), 's')
  row('deaths', r.deathT.length)
  row('level reached', r.level)
  row('weaponLvSum', r.weaponLv)
  // MARTYR's denominator. hits/run is the burst COUNT, HP lost/run the budget it converts — an
  // N x hp-lost detonation pays N * hpLost damage over the run, spread over `hurts` explosions.
  row('hits taken/run', r.hurts)
  row('HP lost/run', r.hpLost)
  row('  HP per hit', r.hpLost / (r.hurts || 1))
  // The MORTAL anomaly rate is the one the tier is tuned against: an immortal 36-level probe run
  // saturates MAX_ANOMALIES_PER_RUN whatever the weight is. Taken, not offered — with any policy
  // but `random` the bot scores an anomaly at 1000 and always takes it.
  row('anomalies/run', r.anomalies)
  // The three numbers behind that one, so a rate change can be attributed to the roll rather than
  // to the run simply being longer. Denominator is TIER-ELIGIBLE screens.
  row('elig screens/run', r.eligScreens)
  row('offered/elig scr', r.offerRate, '%')
  row('mean pity weight', r.meanWeight)
  if (r.level < 8) {
    console.log(`\n  CAVEAT: bot only reached level ${f1(r.level)} — too few level-ups for the pool to matter much here.`)
  }
}

// v6.7.14: ONE pipeline. `--proposed`/`--compare` are gone with proposedChoices — there is no
// second implementation left to compare against, and the A/B this file actually supports is the
// one documented at the top: run it TWICE with the same seeds and diff the rows you care about.
const r = measure()
if (SURVIVAL) {
  survivalReport(r)
} else {
  report(r)
  fidelity(r)
  deliverability(r)
  console.log(`\n  GUARDS: short pools ${r.shortPools} (want 0) | legendary ${f1(r.rarities.legendary)}% (NOT 9-16%) | anomalies ${r.anomalies.toFixed(2)}/run (want <=${MAX_ANOMALIES_PER_RUN})`)
}
