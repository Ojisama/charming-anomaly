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

const makeMeta = () => ({
  coins: 0,
  shop: Object.fromEntries(Object.keys(C.SHOP).map((id) => [id, 0])),
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

const stats = { anomalyRolls: 0, emptyAnomalyPool: 0, shortPools: 0, pools: 0 }

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
    const weights = { ...P_RARITY_WEIGHTS }
    if (nEligible > 0) {
      stats.anomalyRolls++
      weights.anomaly = Math.min(ANOMALY_PITY_CAP, ANOMALY_BASE_WEIGHT + ANOMALY_PITY_PER_CARD * st.since)
    } else {
      stats.emptyAnomalyPool++
    }

    const rarity = pickW(weights)
    let card = null

    if (rarity === 'anomaly') {
      card = { kind: 'anomaly', id: pickW(eligible), rarity: 'anomaly' }
      st.since = 0
      anomalyThisPool = true
    } else {
      // Bucket roll. Empty buckets are dropped; if the chosen bucket turns out empty at pick
      // time (pickedIds dedup / MAX_MODS_PER_WEAPON_PER_POOL) we re-roll among the rest
      // rather than returning null — returning null yields pools shorter than choiceSlots,
      // which test/sim-test.js asserts against.
      const passOk = passives.filter((p) => !picked.has(p))
      const modOk = mc.filter((m) => !picked.has(m.mod) && (modWeaponCount.get(m.weapon) ?? 0) < C.MAX_MODS_PER_WEAPON_PER_POOL)
      const wOk = wp.filter((w) => !picked.has(w.id) && w.rarity === rarity)
      const eOk = elems.filter((e) => !picked.has(e))
      const buckets = {}
      if (passOk.length) buckets.passive = BUCKET_WEIGHTS.passive
      if (modOk.length) buckets.mod = BUCKET_WEIGHTS.mod
      if (wOk.length) buckets.weapon = BUCKET_WEIGHTS.weapon
      // MUTATORS.unstable's elementWeightMul must keep a reader once ELEMENT_CARD_WEIGHT dies.
      if (eOk.length) buckets.element = BUCKET_WEIGHTS.element * (run.mods.elementWeightMul ?? 1)

      const b = pickW(buckets)
      if (b === 'passive') {
        const w = {}
        for (const id of passOk) w[id] = DEFENSIVE.has(id) ? DEFENSIVE_WEIGHT : 1
        card = mkPassive(run, pickW(w), rarity)
      } else if (b === 'mod') {
        const m = modOk[(Math.random() * modOk.length) | 0]
        card = mkMod(run, m.weapon, m.mod, rarity)
      } else if (b === 'weapon') {
        const c = wOk[(Math.random() * wOk.length) | 0]
        card = { kind: 'weapon', id: c.id, rarity: c.rarity, tag: c.tag } // keeps cfg.rarity, not the rolled one
      } else if (b === 'element') {
        card = mkElement(run, eOk[(Math.random() * eOk.length) | 0], rarity)
      }
    }

    if (!card) break
    cards.push(card)
    picked.add(card.id)
    if (card.kind === 'mod') modWeaponCount.set(card.weapon, (modWeaponCount.get(card.weapon) ?? 0) + 1)
  }
  return cards
}

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
  const levels = [], anomalies = [], weaponLv = []
  const defTotals = { armor: 0, regen: 0, maxHP: 0 }
  const defPicks = { armor: 0, regen: 0, maxHP: 0 }
  let offered = 0

  for (let n = 0; n < RUNS; n++) {
    const run = createRun(makeMeta(), { chapter: CHAPTER, difficulty: 1 })
    run.choiceSlots = SLOTS
    run.player.magnet = 4000
    const st = { since: 0, taken: new Set() }
    const dt = 1 / 60

    for (let f = 0; f < 300 * 60; f++) {
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
      run.player.hp = run.player.maxHP // immortal probe: measuring the pool, not survival
      const t = f / 60
      stepSim(run, { x: Math.cos(t * 0.7), y: Math.sin(t * 0.7) }, dt)
      run.events.length = 0
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
    rarities: Object.fromEntries(['normal', 'rare', 'epic', 'legendary', 'mythic', 'anomaly'].map((k) => [k, share(rarities, k)])),
    defPicks: Object.values(defPicks).reduce((a, b) => a + b, 0) / RUNS,
    defTotals: Object.fromEntries(Object.entries(defTotals).map(([k, v]) => [k, v / RUNS])),
    defShare: mode === 'proposed' ? defShare : (share(kinds, 'passive') * 3) / Object.keys(C.PASSIVES).length,
    anomalies: avg(anomalies),
    weaponLv: avg(weaponLv),
    emptyPool: stats.emptyAnomalyPool / RUNS,
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
  if (r.mode === 'proposed') console.log(`anomalies ${r.anomalies.toFixed(2)}/run (cap ${MAX_ANOMALIES_PER_RUN})  empty-pool rolls ${f1(r.emptyPool)}/run`)
}

if (flags.has('--compare')) {
  const a = measure('current')
  const b = measure('proposed')
  report(a); report(b)
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
