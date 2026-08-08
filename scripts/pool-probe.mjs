// Level-up pool balance harness. Runs headless 300s sims and reports what the
// level-up screen actually OFFERS — the measurement behind every number in
// docs/superpowers/specs/2026-08-07-upgrade-pool-design.md.
//
//   node scripts/pool-probe.mjs [chapter] [slots] [runs] [policy] [--proposed|--compare]
//
//   chapter  body|pond|garden|undergrowth|city|skies|beyond   (default body)
//   slots    2..4 level-up cards                              (default 2)
//   runs     sims to average over                             (default 40)
//   policy   random|defense|dps — which card the run picks     (default random)
//   --proposed   run the Track B pipeline instead of the shipped one
//   --compare    run both and print a side-by-side diff
//   --survival   mortal probe: kiting bot, no HP refill, no mega-magnet. Answers "is it still
//                hard?" — pair with --compare. Everything else measures OFFERS, not difficulty.
//   --diff=N     run difficulty 1..5 (default 1). d1 with a stocked shop is at the win ceiling;
//                use d3+ to discriminate.
//   --shop=N     permanent shop level 0..10 per upgrade. Defaults off the sacrifice ladder
//                (4 slots costs 60 of 80 levels, so slots=4 -> 2, slots=3 -> 6, slots=2 -> 8).
//   --offset=N   enemy HP xN, PROPOSED pipeline only — measures how much clawback neutralises
//                the pool's power gain.
//
// WHAT THIS MEASURES: offer distribution and pick throughput. The probe is IMMORTAL
// (it refills HP every frame) and vacuums gems with a huge magnet, so it is NOT valid
// for survival, time-to-death, or difficulty questions. Those need a different rig.
//
// ponytail: the --proposed pipeline is a SHIM that re-implements buildLevelUpChoices
// against the tuning block below, so weights can be tuned before any src/ change. Once
// Track B ships, delete `proposedChoices` and point the flag at the real function.
import { createRun } from '../src/state.js'
import { stepSim, applyChoice } from '../src/sim.js'
import * as C from '../src/config.js'

// ─── TUNING: the Track B proposal. Edit these, re-run --compare, read the diff. ────────
const BUCKET_WEIGHTS = { passive: 30, mod: 30, weapon: 22, element: 18 }
// Inside the passive bucket: defence is weighted so its share survives the 62%->30% cut
// WITHOUT rebasing PASSIVES (a flat base scalar is regressive — it overshoots at 4 slots).
const DEFENSIVE = new Set(['armor', 'regen', 'maxHP'])
const DEFENSIVE_WEIGHT = 4
// Mythic is RETAINED: rainbow (the city starter) is mythic, WEAPON_MOD_TIER_BONUS has a
// live mythic:3, and it is the only jackpot card left once anomalies produce no stats.
const P_RARITY_WEIGHTS = { normal: 100, rare: 50, epic: 12, legendary: 6, mythic: 3 }
// Weapon rarity gates ACQUISITION, not levelling. A `New!` card carries the weapon's rarity —
// that IS the jackpot moment. An upgrade card carries none: weighting owned weapons by their
// rarity too made beyond read 16.6% legendary weapon offers and city 4.2% mythic, because the
// colour kept re-firing for a jackpot the player already had.
const WEAPON_UP_WEIGHT = 100
// Override for MAX_MODS_PER_WEAPON_PER_POOL. The shipped 1 starves the mod bucket at 4 slots
// (measured absent 15.5% of rolls in beyond). null = use config's value.
const MODS_PER_WEAPON_PER_POOL = 2
const ANOMALY_BASE_WEIGHT = 8
const ANOMALY_PITY_PER_CARD = 2
const ANOMALY_PITY_CAP = 45
const MAX_ANOMALIES_PER_RUN = 4
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

// Anomaly stand-ins. The real card list is still open work (see the spec's "Open work"),
// so these model the ELIGIBILITY SHAPE rather than specific cards — which is what drives
// offer rate. Adjust the counts per gate to ask "if I write N easy-conditional cards,
// what does the anomaly curve look like?".
//   always   unconditional, but level-gated so a new player's first anomaly is not a curse
//   easy     one thing invested twice
//   hard     two named things at 3 picks each  (measured near-unreachable at 2 slots)
//   chapter  chapter-scoped, gated behind surviving the signature hazard
const el = (r, id) => r.elementPicks[id] ?? 0
const pp = (r, id) => r.passivePicks[id] ?? 0
const ANOMALY_GATES = {
  always: { n: 4, weight: 1, when: (r) => r.player.level >= 8 },
  easy: { n: 6, weight: 6, when: (r) => el(r, 'fire') >= 2 || pp(r, 'damage') >= 2 },
  hard: { n: 5, weight: 6, when: (r) => pp(r, 'critChance') >= 3 && pp(r, 'critDamage') >= 3 },
  chapter: { n: 3, weight: 2, when: (r) => r.player.level >= 10 },
}
const ANOMALIES = []
for (const [gate, cfg] of Object.entries(ANOMALY_GATES)) {
  for (let i = 0; i < cfg.n; i++) ANOMALIES.push({ id: `${gate}${i}`, gate, weight: cfg.weight, when: cfg.when })
}

const pickW = (obj) => {
  let tot = 0
  for (const v of Object.values(obj)) tot += v
  if (tot <= 0) return null
  let r = Math.random() * tot
  for (const [k, v] of Object.entries(obj)) { r -= v; if (r <= 0) return k }
  return Object.keys(obj)[0]
}
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]] } return a }
const rarityMult = (r) => C.RARITIES[r]?.mult ?? 1

function arsenalInvestment(run) {
  let n = 0
  for (const w of run.weapons) n += w.level - 1
  for (const mods of Object.values(run.weaponModPicks)) for (const p of Object.values(mods)) n += p
  return n
}

// Weapons keep their INHERENT rarity gating inside the bucket — that filter is the only
// thing making hole (legendary) and rainbow (mythic) rare finds, and a bucket that ignores
// it silently doubles their appearance rate.
function weaponCands(run) {
  const owned = new Set(run.weapons.map((w) => w.id))
  const list = []
  if (run.weapons.length < C.MAX_WEAPONS) {
    const pNew = C.newWeaponChance(arsenalInvestment(run))
    for (const id of C.CHAPTERS[run.chapter].weapons) {
      if (!owned.has(id) && Math.random() < pNew) list.push({ id, rarity: C.WEAPONS[id].rarity, tag: 'New!' })
    }
  }
  for (const w of run.weapons) {
    if (w.level < C.MAX_WEAPON_LEVEL) list.push({ id: w.id, rarity: C.WEAPONS[w.id].rarity, tag: 'up' })
  }
  return list
}

function modCands(run) {
  const out = []
  for (const w of run.weapons) {
    const cfgs = C.WEAPON_MODS[w.id]
    if (!cfgs) continue
    const picks = run.weaponModPicks[w.id]
    const avail = Object.keys(cfgs).filter((m) => (picks?.[m] ?? 0) < C.MAX_WEAPON_MOD_PICKS)
    shuffle(avail)
    for (const m of avail.slice(0, C.MOD_CANDIDATES_PER_WEAPON)) out.push({ weapon: w.id, mod: m })
  }
  return out
}

function mkPassive(run, id, rarity) {
  const cfg = C.PASSIVES[id]
  let bonus = cfg.base * rarityMult(rarity)
  if (cfg.kind === 'flat') bonus = Math.round(bonus * 10) / 10
  return { kind: 'passive', id, rarity, bonus }
}
function mkMod(run, w, m, rarity) {
  const cfg = C.WEAPON_MODS[w][m]
  let bonus
  if (cfg.kind === 'tier') bonus = C.WEAPON_MOD_TIER_BONUS[rarity]
  else if (cfg.kind === 'flat') bonus = Math.max(1, Math.round(cfg.base * rarityMult(rarity)))
  else bonus = cfg.base * rarityMult(rarity)
  return { kind: 'mod', id: m, weapon: w, rarity, bonus }
}
const mkElement = (run, id, rarity) => ({ kind: 'element', id, rarity, bonus: C.ELEMENTS[id].base * rarityMult(rarity) })

const ORDINARY_TOTAL = Object.values(P_RARITY_WEIGHTS).reduce((a, b) => a + b, 0)

const stats = {
  anomalyRolls: 0, emptyAnomalyPool: 0, shortPools: 0, pools: 0,
  // Bucket accounting: how often a bucket was ABSENT at roll time. Declared weights can only
  // be honoured while a bucket has candidates, so this is the drift budget made visible
  // instead of inferred from the output shares.
  slots: 0, absent: { passive: 0, mod: 0, weapon: 0, element: 0 },
}

function proposedChoices(run, st) {
  const wp = weaponCands(run)
  const passives = Object.keys(C.PASSIVES).filter((id) => (run.passivePicks[id] ?? 0) < C.MAX_PASSIVE_LEVEL)
  const mc = modCands(run)
  const elems = Object.keys(C.ELEMENTS).filter((id) => (run.elementPicks[id] ?? 0) < C.MAX_ELEMENT_PICKS)
  const picked = new Set()
  const modWeaponCount = new Map()
  const cards = []
  const slots = run.choiceSlots ?? 2
  let anomalyThisPool = false

  for (let s = 0; s < slots; s++) {
    // Anomaly eligibility is computed BEFORE the rarity roll. If the pool is empty the tier
    // gets weight 0 and we re-roll on the base table — it must NEVER deflect onto legendary,
    // which measured 16.1% legendary (vs 3.5% shipped) in the first draft.
    const isLastSlot = s === slots - 1
    const eligible = {}
    const capReached = st.taken.size >= MAX_ANOMALIES_PER_RUN
    // An anomaly may never occupy the last remaining slot: a forced pick must always leave
    // one ordinary card, so a screen can't be "take a curse or take a curse".
    if (!anomalyThisPool && !capReached && !(isLastSlot && cards.length === 0)) {
      for (const a of ANOMALIES) {
        if (st.taken.has(a.id) || picked.has(a.id)) continue
        if (!a.when(run)) continue
        eligible[a.id] = a.weight
      }
    }
    const nEligible = Object.keys(eligible).length
    let card = null

    // The anomaly tier is rolled against the WHOLE ordinary table, not as one entry inside
    // it — so it never perturbs the rarity ladder and can never deflect onto legendary (the
    // first draft measured 16.1% legendary vs 3.5% shipped by walking down the table).
    if (nEligible > 0) {
      stats.anomalyRolls++
      const aw = Math.min(ANOMALY_PITY_CAP, ANOMALY_BASE_WEIGHT + ANOMALY_PITY_PER_CARD * st.since)
      if (Math.random() * (ORDINARY_TOTAL + aw) < aw) {
        card = { kind: 'anomaly', id: pickW(eligible), rarity: 'anomaly' }
        st.since = 0
        anomalyThisPool = true
      }
    } else {
      stats.emptyAnomalyPool++
    }

    if (!card) {
      // BUCKET FIRST, THEN RARITY. Rolling rarity first deleted the weapon bucket on every
      // roll whose rarity no available weapon happened to carry, redistributing its 22 points
      // to whatever was left — measured up to 15pts of drift from the declared weights, and
      // it varied per chapter AND per slot count. Rarity is a BONUS SCALAR; it must not
      // decide the kind of card.
      // Empty buckets are still dropped (nothing to offer), which is now the ONLY source of
      // drift — counted in stats.absent so the budget is visible rather than inferred.
      const passOk = passives.filter((p) => !picked.has(p))
      const modCap = MODS_PER_WEAPON_PER_POOL ?? C.MAX_MODS_PER_WEAPON_PER_POOL
      const modOk = mc.filter((m) => !picked.has(m.mod) && (modWeaponCount.get(m.weapon) ?? 0) < modCap)
      const wOk = wp.filter((w) => !picked.has(w.id))
      const eOk = elems.filter((e) => !picked.has(e))
      const buckets = {}
      stats.slots++
      if (passOk.length) buckets.passive = BUCKET_WEIGHTS.passive; else stats.absent.passive++
      if (modOk.length) buckets.mod = BUCKET_WEIGHTS.mod; else stats.absent.mod++
      if (wOk.length) buckets.weapon = BUCKET_WEIGHTS.weapon; else stats.absent.weapon++
      // MUTATORS.unstable's elementWeightMul must keep a reader once ELEMENT_CARD_WEIGHT dies.
      if (eOk.length) buckets.element = BUCKET_WEIGHTS.element * (run.mods.elementWeightMul ?? 1)
      else stats.absent.element++

      const b = pickW(buckets)
      if (b === 'passive') {
        const w = {}
        for (const id of passOk) w[id] = DEFENSIVE.has(id) ? DEFENSIVE_WEIGHT : 1
        card = mkPassive(run, pickW(w), pickW(P_RARITY_WEIGHTS))
      } else if (b === 'mod') {
        const m = modOk[(Math.random() * modOk.length) | 0]
        card = mkMod(run, m.weapon, m.mod, pickW(P_RARITY_WEIGHTS))
      } else if (b === 'weapon') {
        // Inherent rarity is a WEIGHT inside the bucket, never a filter — that keeps hole
        // (legendary) and rainbow (mythic) rare FINDS without letting a rarity roll delete
        // the whole bucket. Applied to `New!` only; an upgrade competes as a common and
        // shows no tier, so owning a mythic doesn't inflate the mythic rate all run.
        const w = {}
        for (let i = 0; i < wOk.length; i++) {
          w[i] = wOk[i].tag === 'New!' ? (P_RARITY_WEIGHTS[wOk[i].rarity] ?? 1) : WEAPON_UP_WEIGHT
        }
        const c = wOk[Number(pickW(w))]
        card = { kind: 'weapon', id: c.id, rarity: c.tag === 'New!' ? c.rarity : 'upgrade', tag: c.tag }
      } else if (b === 'element') {
        card = mkElement(run, eOk[(Math.random() * eOk.length) | 0], pickW(P_RARITY_WEIGHTS))
      }
    }

    if (!card) break
    cards.push(card)
    picked.add(card.id)
    if (card.kind === 'mod') modWeaponCount.set(card.weapon, (modWeaponCount.get(card.weapon) ?? 0) + 1)
  }
  return cards
}

// ─── SURVIVAL MODE (--survival) ────────────────────────────────────────────────────────
// The default probe is IMMORTAL and cannot answer "is the run still hard?". Survival mode
// drops the HP refill and the 4000px magnet and drives a kiting bot, so death time and win
// rate become measurable. It answers exactly one question: does the proposed pool make the
// game materially easier than the shipped one?
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

// Per-run seeded RNG so `current` and `proposed` start from the same world. The two
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

function measure(mode) {
  stats.anomalyRolls = stats.emptyAnomalyPool = stats.shortPools = stats.pools = 0
  const kinds = {}, rarities = {}
  const levels = [], anomalies = [], weaponLv = [], deaths = []
  const defTotals = { armor: 0, regen: 0, maxHP: 0 }
  const defPicks = { armor: 0, regen: 0, maxHP: 0 }
  let offered = 0

  for (let n = 0; n < RUNS; n++) {
    if (SURVIVAL) Math.random = mulberry32(0x5eed + n * 7919)
    const run = createRun(makeMeta(), { chapter: CHAPTER, difficulty: DIFF })
    run.choiceSlots = SLOTS
    // --offset=N: enemy HP multiplier applied to the PROPOSED pipeline only, to measure how much
    // clawback neutralises the pool's power gain. enemyHpMul is a live per-spawn knob
    // (sim.js:975), so this needs no src/ change. It is a stand-in for whichever lever ships —
    // xpForLevel is a module-level import and cannot be shimmed from here.
    if (mode === 'proposed' && OFFSET !== 1) run.mods.enemyHpMul *= OFFSET
    if (!SURVIVAL) run.player.magnet = 4000
    const st = { since: 0, taken: new Set() }
    const dt = 1 / 60

    // 305s: RUN_DURATION is 300 and victory flips ON the boundary, so the loop must cross it.
    for (let f = 0; f < 305 * 60; f++) {
      if (run.phase === 'levelup') {
        let cards = run.levelUpChoices
        if (mode === 'proposed') {
          st.since += SLOTS
          const shim = proposedChoices(run, st)
          if (shim.length) cards = shim
        }
        stats.pools++
        if (cards.length < SLOTS) stats.shortPools++
        for (const c of cards) {
          offered++
          kinds[c.kind] = (kinds[c.kind] ?? 0) + 1
          rarities[c.rarity] = (rarities[c.rarity] ?? 0) + 1
        }
        run.levelUpChoices = cards
        const i = choose(cards)
        if (cards[i].kind === 'anomaly') { st.taken.add(cards[i].id); run.levelUpChoices = null }
        else applyChoice(run, i)
        run.phase = 'playing'
        continue
      }
      if (run.phase !== 'playing') break
      let input
      if (SURVIVAL) {
        input = kiteInput(run)
      } else {
        run.player.hp = run.player.maxHP // immortal probe: measuring the pool, not survival
        const t = f / 60
        input = { x: Math.cos(t * 0.7), y: Math.sin(t * 0.7) }
      }
      stepSim(run, input, dt)
      run.events.length = 0
    }
    if (SURVIVAL) {
      Math.random = REAL_RANDOM
      deaths.push({ won: run.phase === 'victory', t: run.time, hp: run.player.hp })
    }

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
  const defShare = ((kinds.passive ?? 0) / offered) * 100 *
    (3 * DEFENSIVE_WEIGHT) / (3 * DEFENSIVE_WEIGHT + (Object.keys(C.PASSIVES).length - 3))
  return {
    mode,
    level: avg(levels),
    cards: offered / RUNS,
    shortPools: stats.shortPools,
    pools: stats.pools,
    kinds: Object.fromEntries(['passive', 'mod', 'weapon', 'element', 'anomaly'].map((k) => [k, share(kinds, k)])),
    rarities: Object.fromEntries(['normal', 'rare', 'epic', 'legendary', 'mythic', 'anomaly', 'upgrade'].map((k) => [k, share(rarities, k)])),
    defPicks: Object.values(defPicks).reduce((a, b) => a + b, 0) / RUNS,
    defTotals: Object.fromEntries(Object.entries(defTotals).map(([k, v]) => [k, v / RUNS])),
    defShare: mode === 'proposed' ? defShare : (share(kinds, 'passive') * 3) / Object.keys(C.PASSIVES).length,
    anomalies: avg(anomalies),
    weaponLv: avg(weaponLv),
    emptyPool: stats.emptyAnomalyPool / RUNS,
    absent: Object.fromEntries(Object.entries(stats.absent).map(([k, v]) => [k, (100 * v) / (stats.slots || 1)])),
    winRate: deaths.length ? (100 * deaths.filter((d) => d.won).length) / deaths.length : 0,
    deathT: deaths.filter((d) => !d.won).map((d) => d.t),
  }
}

const f1 = (n) => n.toFixed(1)
function report(r) {
  console.log(`\n== ${CHAPTER} slots=${SLOTS} runs=${RUNS} policy=${POLICY} mode=${r.mode}`)
  console.log(`level ${f1(r.level)}  cards/run ${f1(r.cards)}  weaponLvSum ${f1(r.weaponLv)}`)
  console.log(`short pools ${r.shortPools}/${r.pools}  (MUST be 0)`)
  console.log(`kind   ${Object.entries(r.kinds).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${f1(v)}%`).join('  ')}`)
  console.log(`rarity ${Object.entries(r.rarities).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${f1(v)}%`).join('  ')}`)
  console.log(`defence ${f1(r.defShare)}% of cards, ${f1(r.defPicks)} picks/run — armor ${r.defTotals.armor.toFixed(2)} regen ${r.defTotals.regen.toFixed(2)} maxHP ${f1(r.defTotals.maxHP)}`)
  if (r.mode === 'proposed') {
    console.log(`anomalies ${r.anomalies.toFixed(2)}/run (cap ${MAX_ANOMALIES_PER_RUN})  empty-pool rolls ${f1(r.emptyPool)}/run`)
    console.log(`bucket absent ${Object.entries(r.absent).map(([k, v]) => `${k} ${f1(v)}%`).join('  ')}  <- the ONLY drift budget`)
  }
}

// Declared vs achieved, per bucket. A bucket absent A% of the time loses at most A% of its
// weight; anything beyond that is a bug in the roll, not a capacity ceiling.
function fidelity(r) {
  const tot = Object.values(BUCKET_WEIGHTS).reduce((a, b) => a + b, 0)
  const ordinary = 100 - r.kinds.anomaly
  console.log(`\n== bucket fidelity (${CHAPTER} slots=${SLOTS}) — share of ORDINARY cards`)
  for (const k of ['passive', 'mod', 'weapon', 'element']) {
    const want = (100 * BUCKET_WEIGHTS[k]) / tot
    const got = (100 * r.kinds[k]) / ordinary
    console.log(`  ${k.padEnd(8)} want ${f1(want).padStart(5)}%  got ${f1(got).padStart(5)}%  drift ${(got - want >= 0 ? '+' : '') + f1(got - want).padStart(5)}pts  (absent ${f1(r.absent[k])}% of rolls)`)
  }
}

function survivalReport(a, b) {
  const med = (xs) => { if (!xs.length) return NaN; const s = [...xs].sort((x, y) => x - y); return s[s.length >> 1] }
  console.log(`\n== SURVIVAL (${CHAPTER} slots=${SLOTS} d${DIFF} shop=${SHOP_LV}/10 runs=${RUNS} picks=${POLICY}${OFFSET !== 1 ? ` offset=x${OFFSET} enemyHP` : ''})`)
  console.log(`   bot: kite-and-collect — flees enemies (1/d, 600px), else walks to nearest gem;`)
  console.log(`   pure flee inside ${PANIC_R}px. No projectile dodging, no cover, no obstacle pathing.`)
  console.log(`   A FLOOR on player skill, not a model of one. Quote the policy with the number.`)
  const row = (l, x, y, u = '') => console.log(`  ${l.padEnd(20)} ${f1(x).padStart(6)}${u} -> ${f1(y).padStart(6)}${u}`)
  row('win rate', a.winRate, b.winRate, '%')
  row('median death t', med(a.deathT), med(b.deathT), 's')
  row('mean death t', a.deathT.reduce((s, v) => s + v, 0) / (a.deathT.length || 1),
    b.deathT.reduce((s, v) => s + v, 0) / (b.deathT.length || 1), 's')
  row('deaths', a.deathT.length, b.deathT.length, '')
  row('level reached', a.level, b.level, '')
  row('weaponLvSum', a.weaponLv, b.weaponLv, '')
  // Win rate alone is blind at 0% and 100% — a config the bot always loses (or always wins) can
  // still shift a lot. Read survival time there instead.
  const dw = b.winRate - a.winRate
  const ma = med(a.deathT), mb = med(b.deathT)
  const dt = ma && mb ? (100 * (mb - ma)) / ma : 0
  // Direction comes from the STRONGER signal, not from whichever is merely non-zero: one run in
  // forty is 2.5pts of win rate and must not outvote a 58% survival-time shift.
  const easier = Math.max(Math.abs(dw), Math.abs(dt)) >= 10
  const dir = (Math.abs(dw) >= Math.abs(dt) ? dw : dt) > 0 ? 'EASIER' : 'HARDER'
  console.log(`\n  VERDICT: win rate ${dw >= 0 ? '+' : ''}${f1(dw)}pts, median survival ${dt >= 0 ? '+' : ''}${f1(dt)}%.`)
  console.log(`  ${easier ? `Proposed pool is MEASURABLY ${dir}.` : 'Within noise at this sample size.'}` +
    (a.level < 8 ? `  CAVEAT: bot only reached level ${f1(a.level)} — too few level-ups for the pool to matter much here.` : ''))
}

if (flags.has('--compare')) {
  const a = measure('current')
  const b = measure('proposed')
  if (SURVIVAL) { survivalReport(a, b); process.exit(0) }
  report(a); report(b); fidelity(b)
  const row = (label, x, y, unit = '%') => console.log(`  ${label.padEnd(22)} ${f1(x).padStart(6)}${unit} -> ${f1(y).padStart(6)}${unit}`)
  console.log(`\n== diff (${CHAPTER} slots=${SLOTS})`)
  for (const k of ['passive', 'mod', 'weapon', 'element']) row(`${k} share`, a.kinds[k], b.kinds[k])
  row('defence share', a.defShare, b.defShare)
  row('defence picks/run', a.defPicks, b.defPicks, '')
  row('legendary share', a.rarities.legendary, b.rarities.legendary)
  row('mythic share', a.rarities.mythic, b.rarities.mythic)
  row('weapon level sum', a.weaponLv, b.weaponLv, '')
  console.log(`\n  GUARDS: short pools ${b.shortPools} (want 0) | legendary ${f1(b.rarities.legendary)}% (want ~${f1(a.rarities.legendary)}%, NOT 9-16%) | anomalies ${b.anomalies.toFixed(2)}/run (want <=${MAX_ANOMALIES_PER_RUN})`)
} else {
  report(measure(flags.has('--proposed') ? 'proposed' : 'current'))
}
