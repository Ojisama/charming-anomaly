// Headless self-check for src/sim.js. Plain node, no framework: `npm test`.
import assert from 'node:assert'
import { createRun } from '../src/state.js'
import { SHOP, PASSIVES, RARITIES } from '../src/config.js'
import { stepSim, applyChoice, buildLevelUpChoices } from '../src/sim.js'

// Sim relies on Math.random() for spawn positions/types, crit, coin drops, and
// levelup pool picks. Seed it so the self-check is deterministic — no flaky
// pass/fail on outcomes (like "leveled up by exactly 120s") that are close to
// the RNG's natural variance.
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
Math.random = mulberry32(20260714)

function makeMeta() {
  return {
    coins: 0,
    shop: Object.fromEntries(Object.keys(SHOP).map((id) => [id, 0])),
    best: { time: 0, kills: 0 },
    runs: 0,
  }
}

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n)
}

// Advances `run` by stepping stepSim, auto-resolving any levelup screens
// (always picks choice 0) so the run keeps flowing like main.js would drive it.
function advance(run, seconds, dt, input) {
  const steps = Math.round(seconds / dt)
  const eventsSeen = new Set()
  for (let i = 0; i < steps; i++) {
    if (run.phase === 'levelup') {
      applyChoice(run, 0)
      run.phase = 'playing'
      continue
    }
    if (run.phase !== 'playing') break
    stepSim(run, input, dt)
    for (const e of run.events) eventsSeen.add(e.type)
    assert(finite(run.player.x), `player.x not finite: ${run.player.x}`)
    assert(finite(run.player.y), `player.y not finite: ${run.player.y}`)
    assert(finite(run.player.hp), `player.hp not finite: ${run.player.hp}`)
  }
  return eventsSeen
}

function testMovementAndCombat() {
  const run = createRun(makeMeta())
  const startLevel = run.player.level
  const eventsSeen = advance(run, 120, 1 / 60, { x: 1, y: 0 })

  assert(run._nextId > 1, 'expected enemies to have spawned (id counter unchanged)')
  assert(run.kills > 0, `expected kills > 0, got ${run.kills}`)
  assert(run.player.level > startLevel, `expected player to level up, still level ${run.player.level}`)
  assert(eventsSeen.has('shoot'), 'expected at least one shoot event')
  assert(eventsSeen.has('hit'), 'expected at least one hit event')
  assert(eventsSeen.has('kill'), 'expected at least one kill event')
  assert(eventsSeen.has('levelup'), 'expected at least one levelup event')

  console.log(`PASS run A (movement + combat): kills=${run.kills} level=${run.player.level} time=${run.time.toFixed(1)}s`)
}

function testDeath() {
  const run = createRun(makeMeta())
  run.player.speed = 0
  advance(run, 300, 1 / 60, { x: 0, y: 0 })

  assert.strictEqual(run.phase, 'dead', `expected phase 'dead', got '${run.phase}' at time ${run.time.toFixed(1)}s`)
  console.log(`PASS run B (death): died at time=${run.time.toFixed(1)}s kills=${run.kills}`)
}

function testVictory() {
  const run = createRun(makeMeta())
  run.player.hp = 1e9
  run.player.maxHP = 1e9
  advance(run, 305, 1 / 60, { x: 1, y: 0 })

  assert.strictEqual(run.phase, 'victory', `expected phase 'victory', got '${run.phase}' at time ${run.time.toFixed(1)}s`)
  console.log(`PASS run C (victory): time=${run.time.toFixed(1)}s kills=${run.kills}`)
}

// Fresh run per new weapon id, forced to be the only equipped weapon at level 3.
// Drives 45s with a circling input (so enemies approach from every angle) and checks
// the weapon dealt damage and its dedicated entity array actually saw activity.
const NEW_WEAPON_ENTITY = {
  boomerang: 'boomerangs',
  mines: 'mines',
  zap: 'zaps',
  homing: 'homingShots',
  hole: 'holes',
  rainbow: 'beams',
}

function testNewWeapons() {
  const dt = 1 / 60
  const steps = Math.round(45 / dt)

  for (const [id, arrKey] of Object.entries(NEW_WEAPON_ENTITY)) {
    const run = createRun(makeMeta())
    run.weapons = [{ id, level: 3 }]

    let sawActivity = false
    let t = 0
    for (let i = 0; i < steps; i++) {
      if (run.phase === 'levelup') {
        applyChoice(run, 0)
        run.phase = 'playing'
        continue
      }
      if (run.phase !== 'playing') break

      t += dt
      const input = { x: Math.cos(t), y: Math.sin(t) } // circle around, so enemies close in from all sides
      stepSim(run, input, dt)

      if (run[arrKey].length > 0) sawActivity = true

      assert(finite(run.player.x), `[${id}] player.x not finite: ${run.player.x}`)
      assert(finite(run.player.y), `[${id}] player.y not finite: ${run.player.y}`)
      for (const e of run.enemies) {
        assert(finite(e.x), `[${id}] enemy.x not finite: ${e.x}`)
        assert(finite(e.y), `[${id}] enemy.y not finite: ${e.y}`)
      }
    }

    assert(run.kills > 0, `[${id}] expected kills > 0, got ${run.kills}`)
    assert(sawActivity, `[${id}] expected run.${arrKey} to see activity at some point`)
    console.log(`PASS run D (${id}): kills=${run.kills} time=${run.time.toFixed(1)}s ${arrKey} active`)
  }
}

// Rarity sanity: sample 200 level-up pools each at player level 1 and 12 (fresh run each
// time, so pools aren't depleted by earlier picks), and check the rarity distribution and
// passive bonus math the hybrid model promises.
function testRaritySanity() {
  const seenL1 = {}
  const seenL12 = {}
  let passiveBonusChecked = false

  function sample(level, counter) {
    const run = createRun(makeMeta())
    run.player.level = level
    const choices = buildLevelUpChoices(run)
    for (const c of choices) {
      assert(c.rarity in RARITIES, `invalid rarity key: ${c.rarity}`)
      counter[c.rarity] = (counter[c.rarity] ?? 0) + 1

      if (c.kind === 'passive') {
        const cfg = PASSIVES[c.id]
        const mult = RARITIES[c.rarity].mult
        let expected = cfg.base * mult
        if (cfg.kind === 'flat') expected = Math.round(expected * 10) / 10
        assert.strictEqual(c.bonus, expected, `[${c.id}] bonus ${c.bonus} != expected ${expected} for rarity ${c.rarity}`)
        passiveBonusChecked = true
      }
    }
  }

  for (let i = 0; i < 200; i++) sample(1, seenL1)
  for (let i = 0; i < 200; i++) sample(12, seenL12)

  assert(passiveBonusChecked, 'expected at least one passive card to verify bonus math against')
  assert((seenL12.mythic ?? 0) > 0, `expected mythic to appear at level 12, got ${seenL12.mythic ?? 0}`)
  assert((seenL12.mythic ?? 0) >= (seenL1.mythic ?? 0),
    `expected mythic to appear at least as often at level 12 (${seenL12.mythic ?? 0}) as level 1 (${seenL1.mythic ?? 0})`)

  console.log(`PASS run E (rarity sanity): L1=${JSON.stringify(seenL1)} L12=${JSON.stringify(seenL12)}`)
}

try {
  testMovementAndCombat()
  testDeath()
  testVictory()
  testNewWeapons()
  testRaritySanity()
  console.log('ALL TESTS PASSED')
} catch (err) {
  console.error('FAIL:', err.message)
  process.exit(1)
}
