// Level-up pool probe: runs N headless 300s sims and reports what the level-up
// screen actually offers. Balance harness for any change to buildLevelUpChoices,
// BUCKET/RARITY weights, PASSIVES bases, or the element/mod tables.
//
//   node scripts/pool-probe.mjs [chapter] [slots] [runs] [policy]
//
//   chapter  body|pond|garden|undergrowth|city|skies|beyond   (default body)
//   slots    2..4 level-up cards                              (default 2)
//   runs     sims to average over                             (default 40)
//   policy   random|defense|dps  which card the probe picks   (default random)
//
// The probe is IMMORTAL (it refills HP every frame) and vacuums gems with a huge
// magnet, because it measures the OFFER distribution, not survival. Numbers about
// how long a build lives are not valid from this script — see the `defense` policy
// notes in docs/superpowers/specs/2026-08-07-upgrade-pool-design.md.
import { createRun } from '../src/state.js'
import { stepSim, applyChoice } from '../src/sim.js'
import { SHOP, PASSIVES } from '../src/config.js'

const CHAPTER = process.argv[2] ?? 'body'
const SLOTS = Number(process.argv[3] ?? 2)
const RUNS = Number(process.argv[4] ?? 40)
const POLICY = process.argv[5] ?? 'random'

const DEFENSIVE = new Set(['armor', 'regen', 'maxHP'])

// Mirrors test/sim-test.js's makeMeta — a zeroed save, no shop levels bought.
const makeMeta = () => ({
  coins: 0,
  shop: Object.fromEntries(Object.keys(SHOP).map((id) => [id, 0])),
  best: { time: 0, kills: 0 },
  runs: 0,
  choiceSlots: SLOTS,
})

// Which card index a run picks. `random` measures the pool as-offered; `defense`
// and `dps` measure what a player steering toward a build can actually accumulate.
function choose(cards) {
  if (POLICY === 'defense') {
    const i = cards.findIndex((c) => c.kind === 'passive' && DEFENSIVE.has(c.id))
    if (i >= 0) return i
  } else if (POLICY === 'dps') {
    const i = cards.findIndex((c) => c.kind === 'mod' || c.kind === 'weapon')
    if (i >= 0) return i
  }
  return Math.floor(Math.random() * cards.length)
}

const kinds = {}, rarities = {}, ids = {}
const levels = []
let offeredCards = 0, shortPools = 0, pools = 0
const passiveTotals = Object.fromEntries(Object.keys(PASSIVES).map((id) => [id, 0]))

for (let n = 0; n < RUNS; n++) {
  const run = createRun(makeMeta(), { chapter: CHAPTER, difficulty: 1 })
  run.choiceSlots = SLOTS
  const p = run.player
  p.magnet = 4000 // vacuum every gem — xp must not be movement-bound

  const dt = 1 / 60
  for (let f = 0; f < 300 * 60; f++) {
    if (run.phase === 'levelup') {
      pools++
      if (run.levelUpChoices.length < SLOTS) shortPools++
      for (const c of run.levelUpChoices) {
        offeredCards++
        kinds[c.kind] = (kinds[c.kind] ?? 0) + 1
        rarities[c.rarity] = (rarities[c.rarity] ?? 0) + 1
        const key = `${c.kind}:${c.id ?? c.title}`
        ids[key] = (ids[key] ?? 0) + 1
      }
      applyChoice(run, choose(run.levelUpChoices))
      run.phase = 'playing'
      continue
    }
    if (run.phase !== 'playing') break
    p.hp = p.maxHP // immortal probe: measuring the pool, not survival
    const t = f / 60
    stepSim(run, { x: Math.cos(t * 0.7), y: Math.sin(t * 0.7) }, dt)
    run.events.length = 0
  }
  levels.push(run.player.level)
  for (const id of Object.keys(passiveTotals)) passiveTotals[id] += run.passives[id] ?? 0
}

const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length
const pct = (o, tot) => Object.entries(o).sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${(100 * v / tot).toFixed(1)}%`).join('  ')

console.log(`chapter=${CHAPTER} slots=${SLOTS} runs=${RUNS} policy=${POLICY}`)
console.log(`avg level reached : ${avg(levels).toFixed(1)}  (min ${Math.min(...levels)}, max ${Math.max(...levels)})`)
console.log(`cards seen per run: ${(offeredCards / RUNS).toFixed(1)}`)
console.log(`short pools       : ${shortPools}/${pools} (${(100 * shortPools / pools).toFixed(1)}%) — must stay 0`)
console.log(`kind  : ${pct(kinds, offeredCards)}`)
console.log(`rarity: ${pct(rarities, offeredCards)}`)
const def = ['armor', 'regen', 'maxHP'].map((id) => `${id} ${(passiveTotals[id] / RUNS).toFixed(2)}`).join('  ')
console.log(`defensive totals/run: ${def}`)
