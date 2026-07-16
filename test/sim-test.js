// Headless self-check for src/sim.js. Plain node, no framework: `npm test`.
import assert from 'node:assert'
import { createRun } from '../src/state.js'
import {
  SHOP, PASSIVES, RARITIES, spawnRate, hpScale, eliteEveryAt,
  MUTATORS, mergeMutatorMods, dailyMutators, todayKey, DAILY_MUTATOR_COUNT, randomMutators,
  SHIELD_HP_FRAC, SHIELD_DMG_MUL, SPLITTER_COUNT, VOLATILE_FUSE,
  FRENZY_HP_FRAC, PACER_RADIUS, ELITE, GILDED_COIN_MUL, NOVA_LIFE,
  WEAPONS, HOLE_SINGULARITY_FRAC,
  ORBIT_NOVA_RADIUS, WISP_NOVA_RADIUS, CRUNCH_DMG_MUL,
  WEAPON_MODS, WEAPON_MOD_TIER_BONUS, MAX_WEAPON_MOD_PICKS, MAX_MODS_PER_WEAPON_PER_POOL,
} from '../src/config.js'
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

// Elements now compete for level-up slots alongside weapons/passives/star-mods. Auto-picking
// index 0 could occasionally hand a run a free elemental infusion it didn't ask for, which
// would contaminate tests that are specifically isolating another system's effect (e.g. star
// mods vs a star-only baseline). Picking the first non-'element' offer keeps those tests'
// power budget exactly what they set up explicitly; runs that want elements force them onto
// run.elements directly (see testElements), mirroring how testStarMods forces run.weaponMods.star.
function pickNonElementIndex(run) {
  const choices = run.levelUpChoices || []
  const idx = choices.findIndex((c) => c.kind !== 'element')
  return idx >= 0 ? idx : 0
}

// Advances `run` by stepping stepSim, auto-resolving any levelup screens
// (picks the first non-element choice) so the run keeps flowing like main.js would drive it.
function advance(run, seconds, dt, input) {
  const steps = Math.round(seconds / dt)
  const eventsSeen = new Set()
  for (let i = 0; i < steps; i++) {
    if (run.phase === 'levelup') {
      applyChoice(run, pickNonElementIndex(run))
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
        applyChoice(run, pickNonElementIndex(run))
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
  // Fixed 50/25/12/6/3 weights (no level scaling): same shape at any level — normal is the
  // plurality, every tier still shows up across both samples, and rarity falls off monotonically.
  for (const seen of [seenL1, seenL12]) {
    assert((seen.normal ?? 0) > (seen.rare ?? 0), `expected normal > rare, got ${JSON.stringify(seen)}`)
    assert((seen.rare ?? 0) > (seen.legendary ?? 0), `expected rare > legendary, got ${JSON.stringify(seen)}`)
  }
  const both = (id) => (seenL1[id] ?? 0) + (seenL12[id] ?? 0)
  for (const id of ['normal', 'rare', 'epic', 'legendary', 'mythic']) {
    assert(both(id) > 0, `expected some ${id} rolls across 400 samples`)
  }

  console.log(`PASS run E (rarity sanity): L1=${JSON.stringify(seenL1)} L12=${JSON.stringify(seenL12)}`)
}

// Declines every level-up screen (still banks the xp/level, per stepLevelUp, but grants no
// weapon/passive/mod/element bonus). Used by controlled A/B comparisons below so the two
// runs' power gap is exactly whatever was forced onto them — organic level-up picks are
// themselves RNG-driven and would otherwise contaminate the comparison with an unrelated
// (and unequal, since the two runs walk the same global RNG stream one after another)
// weapon/passive/element path.
function declineLevelUp(run) {
  run.levelUpChoices = null
  run.phase = 'playing'
}

// Tests force elemental potency directly onto run.elements (bypassing the level-up roll — see
// pickNonElementIndex above), so also force the matching run.elementPicks: applyShock's arc
// target count now reads run.elementPicks.lightning directly (one arc target per lightning
// pick, not per potency point), so a test that sets elements.lightning without elementPicks
// would silently get zero shock targets.
function setElements(run, elements) {
  Object.assign(run.elements, elements)
  for (const id of Object.keys(elements)) {
    run.elementPicks[id] = Math.max(run.elementPicks[id] ?? 0, Math.round(elements[id]))
  }
}

// A hand-placed enemy with every elemental-status field initialized, matching what
// spawnEnemy sets up in sim.js (see state.js's enemies[] doc block for the field contract).
// affixes (v4.0): defaults to [] like a real non-elite spawn; tests force elite affixes by
// passing e.g. affixes: ['shielded'] (mirrors how testElements forces run.elements directly).
function makeStatusEnemy(run, { x, y, type = 'drone', elite = false, hp = 1e6, speed = 90, affixes = [] }) {
  return {
    id: run._nextId++, type, x, y,
    hp, maxHP: hp, radius: 16, speed, dmg: 8, elite, xp: 1,
    hitFlash: 0, orbCd: 0, kb: { x: 0, y: 0 }, holePull: 0,
    ignite: 0, igniteDps: 0, chill: 0, chillSlow: 0, frozen: 0, venom: 0, venomT: 0,
    _chillStack: 0, _freezeImmuneT: 0, _shockCd: 0, _comboCd: {},
    affixes,
  }
}

// Ring of near-immortal drones around the origin, close enough together that pierce/blast
// mods (and, in run G, shock arcs) have plenty of neighbors to reach — a fixed target-rich
// field so a stronger build's extra damage shows up as more total damage dealt instead of
// being masked by target starvation (a strong build can clear a small finite spawn faster and
// then simply run out of things to shoot, which is what made the original kill-count race
// between star-mod baseline/modded a near-tie: both cleared everything spawnable either way).
function seedTargetRing(run, count, hp, radius) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2
    run.enemies.push(makeStatusEnemy(run, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, hp, speed: 0 }))
  }
}

// Star mods: force a star-only run with pierce+blast maxed out and check it deals more total
// damage than a plain star-only baseline over the same time against a saturated target ring,
// plus that blast actually emits radius'd explode events (pierce is harder to observe directly
// from outside sim.js internals).
function testStarMods() {
  const dt = 1 / 60
  const steps = Math.round(20 / dt)

  function runStarOnly(mods) {
    const run = createRun(makeMeta())
    run.weapons = [{ id: 'star', level: 3 }]
    if (mods) Object.assign(run.weaponMods.star, mods)
    seedTargetRing(run, 24, 1e6, 200)
    const explodeEvents = []
    let totalDmg = 0
    let t = 0
    for (let i = 0; i < steps; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      if (run.phase !== 'playing') break
      t += dt
      const input = { x: Math.cos(t), y: Math.sin(t) }
      stepSim(run, input, dt)
      const events = run.events
      run.events = [] // drain, mirroring main.js — otherwise events keep re-appearing every frame
      for (const e of events) {
        if (e.type === 'explode') explodeEvents.push(e)
        if (e.type === 'hit') totalDmg += e.dmg
      }
    }
    return { run, explodeEvents, totalDmg }
  }

  const baseline = runStarOnly(null)
  const modded = runStarOnly({ pierce: 3, blast: 0.9 })

  assert(baseline.totalDmg > 0, `expected baseline total damage > 0, got ${baseline.totalDmg}`)
  assert(modded.totalDmg > baseline.totalDmg,
    `expected modded total damage (${modded.totalDmg}) > baseline total damage (${baseline.totalDmg})`)
  assert(modded.explodeEvents.length > 0, 'expected exploding-stars mod to emit explode events')
  for (const e of modded.explodeEvents) {
    assert(finite(e.radius) && e.radius > 0, `explode event missing/invalid radius: ${e.radius}`)
  }

  console.log(`PASS run F (star mods): baseline dmg=${baseline.totalDmg} modded dmg=${modded.totalDmg} explosions=${modded.explodeEvents.length}`)
}

// Multishot/split/chain/ricochet: force all four maxed alongside pierce/blast and check the
// cumulative damage against a saturated target ring beats a pierce/blast-only baseline (same
// seed/duration), that split actually produces _shard bullets, and that at least one bullet
// chain-retargeted (run._chains debug counter, see state.js bullets[] doc).
function testAdvancedStarMods() {
  const dt = 1 / 60
  const steps = Math.round(20 / dt)

  function runStarOnly(mods) {
    const run = createRun(makeMeta())
    run.weapons = [{ id: 'star', level: 3 }]
    if (mods) Object.assign(run.weaponMods.star, mods)
    seedTargetRing(run, 24, 1e6, 200)
    let totalDmg = 0
    let sawShard = false
    let t = 0
    for (let i = 0; i < steps; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      if (run.phase !== 'playing') break
      t += dt
      const input = { x: Math.cos(t), y: Math.sin(t) }
      stepSim(run, input, dt)
      const events = run.events
      run.events = [] // drain, mirroring main.js
      for (const e of events) if (e.type === 'hit') totalDmg += e.dmg
      if (!sawShard && run.bullets.some((b) => b._shard)) sawShard = true
    }
    return { run, totalDmg, sawShard }
  }

  const baseline = runStarOnly({ pierce: 3, blast: 0.9 })
  const advanced = runStarOnly({ pierce: 3, blast: 0.9, multishot: 3, split: 2, chain: 3, ricochet: 2 })

  assert(baseline.totalDmg > 0, `expected baseline total damage > 0, got ${baseline.totalDmg}`)
  assert(advanced.totalDmg > baseline.totalDmg,
    `expected advanced-mod total damage (${advanced.totalDmg}) > pierce/blast-only baseline (${baseline.totalDmg})`)
  assert(advanced.sawShard, 'expected Split Stars to produce at least one _shard bullet')
  assert((advanced.run._chains ?? 0) > 0, `expected at least one Chain Stars retarget, got ${advanced.run._chains}`)

  console.log(`PASS run F2 (multishot/split/chain/ricochet): baseline dmg=${baseline.totalDmg} advanced dmg=${advanced.totalDmg} chains=${advanced.run._chains} ricochets=${advanced.run._ricochets ?? 0}`)
}

// Elements + combos: (a) ignite DoT alone can finish a kill, (b) chill slows movement and
// stacks into a freeze on non-elites while elites/tanks never freeze, (c) every combo event
// fires at least once when its element pair is forced, (d) a combo-loaded run outkills a
// no-element baseline against the same saturated target field.
function testElements() {
  const dt = 1 / 60

  // (a) Ignite DoT alone can kill: land exactly one hit, strip the weapon (and any bullet
  // still in flight) so nothing but the burn can finish the job, then watch it happen.
  {
    const run = createRun(makeMeta())
    run.weapons = [{ id: 'star', level: 1 }]
    setElements(run, { fire: 5 })
    run.player.x = 0; run.player.y = 0
    run.player.hp = 1e9; run.player.maxHP = 1e9
    run.enemies.push(makeStatusEnemy(run, { x: 100, y: 0, hp: 30, speed: 0 }))

    let hitOnce = false
    for (let i = 0; i < Math.round(2 / dt) && !hitOnce; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.events.some((e) => e.type === 'hit')) hitOnce = true
    }
    assert(hitOnce, 'expected the seeded drone to take at least one hit')
    const target = run.enemies.find((e) => !e._dead)
    assert(target, 'expected the drone to survive the single hit (hp budgeted above one star hit)')
    assert(target.ignite > 0, `expected ignite to be applied by the hit, got ${target.ignite}`)

    run.weapons = [] // no more hits from here on
    run.bullets = [] // ...and no in-flight bullet gets to land a second one either

    let dotKilled = false
    for (let i = 0; i < Math.round(4 / dt) && !dotKilled; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.kills > 0) dotKilled = true
    }
    assert(dotKilled, 'expected the ignite DoT alone (weapon removed) to kill the seeded drone')
    console.log('PASS run G.a (ignite DoT alone kills)')
  }

  // (b) Chill slows movement; enough chilling hits within the chill window freeze a
  // non-elite; an elite/tank is chilled the same way but never freezes.
  function runChillScenario(elite) {
    const run = createRun(makeMeta())
    run.weapons = [{ id: 'star', level: 1 }]
    setElements(run, { cold: 5 })
    run.player.x = 0; run.player.y = 0
    run.player.hp = 1e9; run.player.maxHP = 1e9
    const seed = makeStatusEnemy(run, { x: 120, y: 0, type: elite ? 'tank' : 'drone', elite, speed: 90 })
    run.enemies.push(seed)

    let sawSlower = false
    let sawFreeze = false
    const steps = Math.round(20 / dt)
    for (let i = 0; i < steps; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      const before = run.enemies.find((e) => e.id === seed.id)
      if (before && !sawSlower && before.chillSlow > 0 && before.frozen <= 0) {
        const startX = before.x
        stepSim(run, { x: 0, y: 0 }, dt)
        const after = run.enemies.find((e) => e.id === seed.id)
        if (after) {
          const actualDist = Math.abs(startX - after.x)
          const fullSpeedDist = before.speed * dt
          if (actualDist < fullSpeedDist * 0.95) sawSlower = true
        }
        continue
      }
      stepSim(run, { x: 0, y: 0 }, dt)
      const after = run.enemies.find((e) => e.id === seed.id)
      if (after && after.frozen > 0) sawFreeze = true
    }
    return { sawSlower, sawFreeze }
  }

  const chillDrone = runChillScenario(false)
  assert(chillDrone.sawSlower, 'expected a chilled drone to move slower than its full speed')
  assert(chillDrone.sawFreeze, 'expected the chilled non-elite drone to freeze at some point')

  const chillTank = runChillScenario(true)
  assert(chillTank.sawSlower, 'expected a chilled elite/tank to still be slowed')
  assert.strictEqual(chillTank.sawFreeze, false, 'expected an elite/type tank to never freeze')
  console.log(`PASS run G.b (chill slows + freezes non-elites, never elites/tanks)`)

  // (c) Every combo event fires at least once when its element pair is forced, against a
  // saturated ring of near-immortal targets (so DoT/stack windows have time to build up
  // instead of the run just running out of nearby enemies).
  {
    const run = createRun(makeMeta())
    run.weapons = [{ id: 'star', level: 3 }, { id: 'orbit', level: 3 }]
    setElements(run, { fire: 3, cold: 3, lightning: 4, venom: 3 })
    run.player.x = 0; run.player.y = 0
    run.player.hp = 1e9; run.player.maxHP = 1e9
    seedTargetRing(run, 24, 1e6, 200)

    const eventsSeen = new Set()
    const steps = Math.round(30 / dt)
    for (let i = 0; i < steps; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      for (const e of run.events) eventsSeen.add(e.type)
    }
    for (const type of ['shatter', 'frostarc', 'overload', 'conduct']) {
      assert(eventsSeen.has(type), `expected combo event '${type}' to fire at least once (saw: ${[...eventsSeen].join(',')})`)
    }
    console.log('PASS run G.c (all four combo events fired: shatter, frostarc, overload, conduct)')
  }

  // (d) A combo-loaded run outkills a no-element baseline over the same saturated target
  // field and duration.
  function runComboKills(elements) {
    const run = createRun(makeMeta())
    run.weapons = [{ id: 'star', level: 3 }, { id: 'orbit', level: 3 }]
    if (elements) setElements(run, elements)
    run.player.x = 0; run.player.y = 0
    run.player.hp = 1e9; run.player.maxHP = 1e9
    seedTargetRing(run, 40, 150, 220)

    const steps = Math.round(20 / dt)
    for (let i = 0; i < steps; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      if (run.phase !== 'playing') break
      stepSim(run, { x: 0, y: 0 }, dt)
    }
    return run.kills
  }

  const baselineKills = runComboKills(null)
  const comboKills = runComboKills({ fire: 3, cold: 3, lightning: 4, venom: 3 })
  assert(comboKills > baselineKills,
    `expected combo-loaded kills (${comboKills}) > no-element baseline kills (${baselineKills})`)

  console.log(`PASS run G.d (combo run outkills baseline): baseline=${baselineKills} combo=${comboKills}`)

  // (e) Lightning-only (no chill/venom potency, so neither frostarc nor conduct's combo
  // condition can hold) must still visibly arc: applyShock's plain 'shockarc' event is the
  // fallback emitted when neither combo triggers on a given shock.
  {
    const run = createRun(makeMeta())
    run.weapons = [{ id: 'star', level: 3 }]
    setElements(run, { lightning: 4 })
    run.player.x = 0; run.player.y = 0
    run.player.hp = 1e9; run.player.maxHP = 1e9
    seedTargetRing(run, 24, 1e6, 200)

    let sawShockArc = false
    let t = 0
    const steps = Math.round(20 / dt)
    for (let i = 0; i < steps && !sawShockArc; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      t += dt
      const input = { x: Math.cos(t), y: Math.sin(t) }
      stepSim(run, input, dt)
      if (run.events.some((e) => e.type === 'shockarc')) sawShockArc = true
    }
    assert(sawShockArc, 'expected a lightning-only run to emit at least one shockarc event')
    console.log('PASS run G.e (lightning-only run emits shockarc event)')
  }
}

// Black holes pull coins toward their center (not gems): spawn a coin at the vortex rim,
// step the sim once, and check its distance to the hole's center strictly decreased. Also
// checks a gem at the same spot is left untouched (holes only pull coins per the spec).
function testHolePullsCoins() {
  const run = createRun(makeMeta())
  run.player.x = 0; run.player.y = 0
  run.holes.push({
    x: 0, y: 0, radius: 225, coreRadius: 225 * 0.22,
    life: 2.2, duration: 2.2, dmg: 6, tick: 0.22, pull: 340, acc: 0,
  })
  run.coins.push({ x: 220, y: 0, value: 1 }) // at the rim
  const gem = { x: 220, y: 0, xp: 1 }
  run.gems.push(gem)

  const before = Math.hypot(run.coins[0].x, run.coins[0].y)
  stepSim(run, { x: 0, y: 0 }, 1 / 60)

  assert.strictEqual(run.coins.length, 1, 'expected the coin to still exist after one step (not collected)')
  const after = Math.hypot(run.coins[0].x, run.coins[0].y)
  assert(after < before, `expected coin distance to hole center to decrease (before=${before.toFixed(1)}, after=${after.toFixed(1)})`)
  assert.strictEqual(gem.x, 220, 'expected gems to NOT be pulled by black holes')
  assert.strictEqual(gem.y, 0, 'expected gems to NOT be pulled by black holes')

  console.log(`PASS run H (black hole pulls coins, not gems): before=${before.toFixed(1)} after=${after.toFixed(1)}`)
}

// Difficulty must keep climbing all the way to the end, not flatten out once a build comes
// online: (a) the spawnRate/hpScale/elite-cadence curves hit their late-game targets, and (b)
// with weapons stripped (so nothing ever dies and enemies simply pile up — contact damage hurts
// the player but never removes an enemy, see stepContactDamage) a late-run alive-count snapshot
// beats an early one, showing the higher spawn rate + MAX_ALIVE cap actually let more enemies
// stack up on screen later in the run.
function testEscalation() {
  assert(spawnRate(300) >= 15, `expected spawnRate(300) >= 15, got ${spawnRate(300)}`)
  assert(hpScale(300) >= 7, `expected hpScale(300) >= 7, got ${hpScale(300)}`)
  assert(eliteEveryAt(290) <= 15, `expected elite step at t=290 <= 15s, got ${eliteEveryAt(290)}`)

  const run = createRun(makeMeta())
  run.weapons = []
  run.player.hp = 1e9
  run.player.maxHP = 1e9

  const dt = 1 / 60
  let earlyAlive = 0
  let lateAlive = 0
  const steps = Math.round(280 / dt)
  for (let i = 0; i < steps; i++) {
    if (run.phase === 'levelup') { declineLevelUp(run); continue }
    if (run.phase !== 'playing') break
    stepSim(run, { x: 0, y: 0 }, dt)
    if (Math.abs(run.time - 60) < dt) earlyAlive = run.enemies.length
    if (Math.abs(run.time - 280) < dt) lateAlive = run.enemies.length
  }

  assert(earlyAlive > 0, `expected some enemies alive at the t=60 snapshot, got ${earlyAlive}`)
  assert(lateAlive > earlyAlive,
    `expected late-run alive count (${lateAlive}) > early-run alive count (${earlyAlive})`)

  console.log(`PASS run I (escalating difficulty): spawnRate(300)=${spawnRate(300).toFixed(2)} hpScale(300)=${hpScale(300).toFixed(2)} eliteStep(290)=${eliteEveryAt(290).toFixed(2)} earlyAlive=${earlyAlive} lateAlive=${lateAlive}`)
}

// Mutators (v4.0): mergeMutatorMods math, dailyMutators determinism, and that run.mods
// actually moves the needle at each of its application points in sim.js.
function testMutators() {
  const dt = 1 / 60

  // mergeMutatorMods: every key defaults to 1, and each mutator's effects multiply in
  // (stacking two mutators multiplies both sets of effects independently).
  const empty = mergeMutatorMods([])
  for (const k of Object.keys(empty)) assert.strictEqual(empty[k], 1, `expected ${k} to default to 1 with no mutators`)

  const single = mergeMutatorMods(['overtime'])
  assert.strictEqual(single.spawnMul, MUTATORS.overtime.effects.spawnMul)
  assert.strictEqual(single.xpMul, MUTATORS.overtime.effects.xpMul)
  assert.strictEqual(single.enemyHpMul, 1, 'expected an unrelated key to stay at 1')

  const stacked = mergeMutatorMods(['overtime', 'bulky'])
  assert.strictEqual(stacked.spawnMul, MUTATORS.overtime.effects.spawnMul)
  assert.strictEqual(stacked.xpMul, MUTATORS.overtime.effects.xpMul)
  assert.strictEqual(stacked.enemyHpMul, MUTATORS.bulky.effects.enemyHpMul)
  assert.strictEqual(stacked.coinMul, MUTATORS.bulky.effects.coinMul)

  // dailyMutators: deterministic per date key, DAILY_MUTATOR_COUNT distinct valid ids.
  assert(/^\d{4}-\d{2}-\d{2}$/.test(todayKey()), `expected todayKey() to look like YYYY-MM-DD, got ${todayKey()}`)
  const day = '2026-07-15'
  const firstRoll = dailyMutators(day)
  const secondRoll = dailyMutators(day)
  assert.deepStrictEqual(firstRoll, secondRoll, 'expected dailyMutators to be deterministic for the same date key')
  assert.strictEqual(firstRoll.length, DAILY_MUTATOR_COUNT, `expected ${DAILY_MUTATOR_COUNT} daily mutators, got ${firstRoll.length}`)
  assert.strictEqual(new Set(firstRoll).size, firstRoll.length, 'expected distinct daily mutator ids')
  for (const id of firstRoll) assert(id in MUTATORS, `unexpected mutator id from dailyMutators: ${id}`)

  // spawnMul: spawn accumulation has no RNG in it (only enemy type/position do), so doubling
  // it should almost exactly double the total number of enemies spawned over the same time.
  function spawnedCount(spawnMul) {
    const run = createRun(makeMeta())
    run.mods.spawnMul = spawnMul
    run.weapons = []
    run.player.hp = 1e9
    run.player.maxHP = 1e9
    const steps = Math.round(100 / dt)
    for (let i = 0; i < steps; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      if (run.phase !== 'playing') break
      stepSim(run, { x: 0, y: 0 }, dt)
    }
    return run._nextId - 1
  }
  const baselineSpawned = spawnedCount(1)
  const doubledSpawned = spawnedCount(2)
  assert(doubledSpawned > baselineSpawned * 1.7,
    `expected spawnMul=2 to roughly double spawn count (baseline=${baselineSpawned}, doubled=${doubledSpawned})`)

  // xpMul/coinMul: change gem/coin pickup amounts (applied at pickup time).
  function pickupAmounts(xpMul, coinMul) {
    const run = createRun(makeMeta())
    run.mods.xpMul = xpMul
    run.mods.coinMul = coinMul
    run.player.x = 0; run.player.y = 0
    run.gems.push({ x: 0, y: 0, xp: 10 })
    run.coins.push({ x: 0, y: 0, value: 10 })
    stepSim(run, { x: 0, y: 0 }, dt)
    return { xp: run.player.xp, coins: run.coinsEarned }
  }
  const plainPickup = pickupAmounts(1, 1)
  const boostedPickup = pickupAmounts(2, 2)
  assert(boostedPickup.xp > plainPickup.xp, `expected xpMul to increase xp gained (plain=${plainPickup.xp}, boosted=${boostedPickup.xp})`)
  assert(boostedPickup.coins > plainPickup.coins, `expected coinMul to increase coins earned (plain=${plainPickup.coins}, boosted=${boostedPickup.coins})`)

  // contactDmgTakenMul: increases hurt damage from contact.
  function hurtDamage(mul) {
    const run = createRun(makeMeta())
    run.mods.contactDmgTakenMul = mul
    run.weapons = []
    run.player.x = 0; run.player.y = 0
    run.player.hp = 1e9; run.player.maxHP = 1e9
    run.enemies.push(makeStatusEnemy(run, { x: 0, y: 0 }))
    stepSim(run, { x: 0, y: 0 }, dt)
    const hurtEvt = run.events.find((e) => e.type === 'hurt')
    return hurtEvt ? hurtEvt.dmg : 0
  }
  const normalHurt = hurtDamage(1)
  const boostedHurt = hurtDamage(2)
  assert(boostedHurt > normalHurt, `expected contactDmgTakenMul to increase hurt damage (normal=${normalHurt}, boosted=${boostedHurt})`)

  console.log(`PASS run J (mutators): daily=${JSON.stringify(firstRoll)} spawns baseline=${baselineSpawned} doubled=${doubledSpawned} hurt normal=${normalHurt} boosted=${boostedHurt}`)
}

// Elite affixes (v4.0): craft elites with forced affixes (via makeStatusEnemy's affixes
// option) and check each affix's isolated effect on damage, death, and movement.
function testAffixes() {
  const dt = 1 / 60

  // Shielded: reduced damage while above SHIELD_HP_FRAC of maxHP, full damage below it.
  {
    const run = createRun(makeMeta())
    run.weapons = [{ id: 'star', level: 3 }]
    run.player.x = 0; run.player.y = 0
    run.player.critChance = 0 // keep hit damage deterministic (no crit roll)
    const target = makeStatusEnemy(run, { x: 300, y: 0, hp: 1e6, speed: 0, elite: true, affixes: ['shielded'] })
    run.enemies.push(target)

    const aboveHits = []
    const belowHits = []
    let droppedThreshold = false
    const steps = Math.round(12 / dt)
    for (let i = 0; i < steps; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      const events = run.events
      run.events = [] // drain, mirroring main.js — otherwise old events re-classify on every later frame
      for (const e of events) {
        if (e.type === 'hit') (droppedThreshold ? belowHits : aboveHits).push(e.dmg)
      }
      if (!droppedThreshold && aboveHits.length >= 3) {
        target.hp = target.maxHP * (SHIELD_HP_FRAC / 2) // force below the shield threshold
        droppedThreshold = true
      }
      if (droppedThreshold && belowHits.length >= 3) break
    }

    assert(aboveHits.length >= 3, `expected shielded hits above the threshold, got ${aboveHits.length}`)
    assert(belowHits.length >= 3, `expected hits below the threshold, got ${belowHits.length}`)
    const starLv3Dmg = 16 // WEAPONS.star.levels[2].dmg
    const expectedShielded = Math.round(starLv3Dmg * SHIELD_DMG_MUL)
    for (const d of aboveHits) assert.strictEqual(d, expectedShielded, `expected shielded dmg ${expectedShielded} above threshold, got ${d}`)
    for (const d of belowHits) assert.strictEqual(d, starLv3Dmg, `expected full dmg ${starLv3Dmg} below shield threshold, got ${d}`)
    console.log(`PASS run K.a (shielded): above=${aboveHits[0]} below=${belowHits[0]}`)
  }

  // Splitter: dying spawns SPLITTER_COUNT wisps around the corpse. Kill via ignite DoT
  // (mirroring run G.a) rather than a still-in-flight star bullet: a level-3 star's leftover
  // pierce could otherwise immediately catch a freshly-spawned wisp as collateral within the
  // very same dealDamage call, undercounting survivors for reasons unrelated to splitter itself.
  {
    const run = createRun(makeMeta())
    run.weapons = [{ id: 'star', level: 1 }]
    setElements(run, { fire: 5 })
    run.player.x = 0; run.player.y = 0
    run.player.hp = 1e9; run.player.maxHP = 1e9
    const target = makeStatusEnemy(run, { x: 100, y: 0, hp: 30, speed: 0, elite: true, affixes: ['splitter'] })
    run.enemies.push(target)

    let hitOnce = false
    for (let i = 0; i < Math.round(2 / dt) && !hitOnce; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.events.some((e) => e.type === 'hit')) hitOnce = true
    }
    assert(hitOnce, 'expected the splitter target to take at least one hit')
    run.weapons = [] // no more hits from here on
    run.bullets = [] // ...and no in-flight bullet lands a second one either

    let killed = false
    for (let i = 0; i < Math.round(4 / dt) && !killed; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.kills > 0) killed = true
    }
    assert(killed, 'expected the ignite DoT to finish off the splitter elite')
    const wisps = run.enemies.filter((e) => e.type === 'wisp' && !e.elite)
    assert(wisps.length >= SPLITTER_COUNT, `expected at least ${SPLITTER_COUNT} splitter wisps, got ${wisps.length}`)
    console.log(`PASS run K.b (splitter): wisps=${wisps.length}`)
  }

  // Volatile: dying arms a bomb; once its fuse ends, a nearby player takes damage.
  {
    const run = createRun(makeMeta())
    run.mods.spawnMul = 0 // isolate the bomb as the only source of player damage
    run.weapons = [{ id: 'star', level: 3 }]
    run.player.x = 0; run.player.y = 0
    run.player.hp = 1e9; run.player.maxHP = 1e9
    const target = makeStatusEnemy(run, { x: 50, y: 0, hp: 10, speed: 0, elite: true, affixes: ['volatile'] })
    run.enemies.push(target)

    let killed = false
    for (let i = 0; i < Math.round(3 / dt) && !killed; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.kills > 0) killed = true
    }
    assert(killed, 'expected the volatile elite to die')
    assert(run.bombs.length > 0, 'expected a volatile death to arm a bomb')

    const hpBefore = run.player.hp
    let exploded = false
    for (let i = 0; i < Math.round((VOLATILE_FUSE + 1) / dt) && !exploded; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.events.some((e) => e.type === 'explode')) exploded = true
    }
    assert(exploded, 'expected the bomb to explode after its fuse')
    assert(run.player.hp < hpBefore, `expected the bomb blast to damage the player (before=${hpBefore}, after=${run.player.hp})`)
    console.log('PASS run K.c (volatile bomb)')
  }

  // Gilded: dying drops GILDED_COIN_MUL times as many coins as a plain elite kill.
  {
    function killElite(affixes) {
      const run = createRun(makeMeta())
      run.weapons = [{ id: 'star', level: 3 }]
      run.player.x = 0; run.player.y = 0
      const target = makeStatusEnemy(run, { x: 200, y: 0, hp: 10, speed: 0, elite: true, affixes })
      run.enemies.push(target)
      let killed = false
      for (let i = 0; i < Math.round(3 / dt) && !killed; i++) {
        if (run.phase === 'levelup') { declineLevelUp(run); continue }
        stepSim(run, { x: 0, y: 0 }, dt)
        if (run.kills > 0) killed = true
      }
      assert(killed, 'expected the elite to die')
      return run.coins.length
    }
    const plainCoins = killElite([])
    const gildedCoins = killElite(['gilded'])
    assert.strictEqual(plainCoins, ELITE.coins, `expected a plain elite to drop ${ELITE.coins} coins, got ${plainCoins}`)
    assert.strictEqual(gildedCoins, Math.round(ELITE.coins * GILDED_COIN_MUL),
      `expected a gilded elite to drop ${Math.round(ELITE.coins * GILDED_COIN_MUL)} coins, got ${gildedCoins}`)
    console.log(`PASS run K.d (gilded coins): plain=${plainCoins} gilded=${gildedCoins}`)
  }

  // Frenzied: moves faster once below FRENZY_HP_FRAC of maxHP than the same enemy above it.
  {
    function frenziedDist(hpFrac) {
      const run = createRun(makeMeta())
      run.weapons = []
      run.player.x = 5000; run.player.y = 0 // far away: fixed seek direction, never contacts
      const maxHP = 100
      const e = makeStatusEnemy(run, { x: 0, y: 0, hp: maxHP * hpFrac, speed: 100, elite: true, affixes: ['frenzied'] })
      e.maxHP = maxHP
      run.enemies.push(e)
      const startX = e.x
      stepSim(run, { x: 0, y: 0 }, dt)
      const after = run.enemies.find((en) => en.id === e.id)
      return Math.abs(after.x - startX)
    }
    const distAbove = frenziedDist(Math.min(1, FRENZY_HP_FRAC + 0.2))
    const distBelow = frenziedDist(Math.max(0.01, FRENZY_HP_FRAC - 0.1))
    assert(distBelow > distAbove,
      `expected a frenzied enemy below ${FRENZY_HP_FRAC * 100}% hp to move faster (above=${distAbove}, below=${distBelow})`)
    console.log(`PASS run K.e (frenzied): above=${distAbove.toFixed(2)} below=${distBelow.toFixed(2)}`)
  }

  // Pacer (Cheerleader): speeds up other enemies within PACER_RADIUS.
  {
    const run = createRun(makeMeta())
    run.weapons = []
    run.player.x = 5000; run.player.y = 0 // far away: fixed seek direction for both enemies
    const pacer = makeStatusEnemy(run, { x: 0, y: 0, hp: 1e6, speed: 0, elite: true, affixes: ['pacer'] })
    const near = makeStatusEnemy(run, { x: PACER_RADIUS - 10, y: 0, hp: 1e6, speed: 100 })
    const far = makeStatusEnemy(run, { x: PACER_RADIUS + 500, y: 0, hp: 1e6, speed: 100 })
    run.enemies.push(pacer, near, far)

    const nearStartX = near.x
    const farStartX = far.x
    stepSim(run, { x: 0, y: 0 }, dt)
    const nearAfter = run.enemies.find((e) => e.id === near.id)
    const farAfter = run.enemies.find((e) => e.id === far.id)
    const nearDist = Math.abs(nearAfter.x - nearStartX)
    const farDist = Math.abs(farAfter.x - farStartX)
    assert(nearDist > farDist * 1.1, `expected the enemy near a pacer to move faster (near=${nearDist}, far=${farDist})`)
    console.log(`PASS run K.f (pacer): near=${nearDist.toFixed(2)} far=${farDist.toFixed(2)}`)
  }

  // Anchored: no nova knockback (still takes damage) and never pulled into a black hole.
  {
    const run = createRun(makeMeta())
    run.weapons = []
    run.player.x = 0; run.player.y = 0
    const anchored = makeStatusEnemy(run, { x: 60, y: 0, hp: 1e6, speed: 0, elite: true, affixes: ['anchored'] })
    run.enemies.push(anchored)
    run.novas.push({ x: 0, y: 0, r: 0, maxR: 200, dmg: 5, knockback: 300, life: NOVA_LIFE, hit: new Set() })

    let hit = false
    for (let i = 0; i < Math.round(NOVA_LIFE / dt) + 5 && !hit; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.events.some((e) => e.type === 'hit')) hit = true
    }
    assert(hit, 'expected the nova to hit the anchored enemy')
    const afterNova = run.enemies.find((e) => e.id === anchored.id)
    assert(afterNova, 'expected the anchored enemy to survive the nova hit')
    assert.strictEqual(afterNova.kb.x, 0, `expected no nova knockback on an anchored enemy, got kb.x=${afterNova.kb.x}`)
    assert.strictEqual(afterNova.kb.y, 0, `expected no nova knockback on an anchored enemy, got kb.y=${afterNova.kb.y}`)

    const beforeHoleX = afterNova.x
    run.holes.push({ x: 0, y: 0, radius: 300, coreRadius: 300 * 0.22, life: 2, duration: 2, dmg: 1, tick: 5, pull: 400, acc: 0 })
    stepSim(run, { x: 0, y: 0 }, dt)
    const afterHole = run.enemies.find((e) => e.id === anchored.id)
    assert.strictEqual(afterHole.x, beforeHoleX, `expected an anchored enemy's x to be untouched by hole pull, got ${afterHole.x} vs ${beforeHoleX}`)
    console.log('PASS run K.g (anchored: no knockback, no hole pull)')
  }
}

// Weapon-mod parity (v4.1): every non-star weapon gets its own mod pool now (see WEAPON_MODS
// in config.js). Exercises one behavioral mod per weapon plus a couple of plain stat mods, and
// the level-up pool's per-weapon gating (only offers a weapon's mods while it's owned).
function testWeaponModParity() {
  const dt = 1 / 60

  // a. Twin Ring: main + inner-ring orbs, every orb entry carries r; bigOrbs raises r.
  {
    const run = createRun(makeMeta())
    run.weapons = [{ id: 'orbit', level: 3 }] // WEAPONS.orbit.levels[2].orbs === 3
    run.weaponMods.orbit.twinRing = 3
    stepSim(run, { x: 0, y: 0 }, dt)
    assert.strictEqual(run.orbs.length, 6, `expected 3 main + 3 twin-ring orbs, got ${run.orbs.length}`)
    for (const o of run.orbs) assert(finite(o.r) && o.r > 0, `expected every orb to carry a positive r, got ${o.r}`)
    const baseR = run.orbs[0].r

    run.weaponMods.orbit.bigOrbs = 0.5
    stepSim(run, { x: 0, y: 0 }, dt)
    assert(run.orbs[0].r > baseR, `expected bigOrbs to raise orb r (base=${baseR}, boosted=${run.orbs[0].r})`)
    console.log(`PASS run L.a (twinRing + bigOrbs): orbs=${run.orbs.length} baseR=${baseR.toFixed(1)} boostedR=${run.orbs[0].r.toFixed(1)}`)
  }

  // b. Echo Wave: one cast with echo=2 produces 3 novas total (1 original + 2 delayed echoes).
  {
    const run = createRun(makeMeta())
    run.weapons = [{ id: 'wave', level: 1 }] // interval 2.4s, well under the 4s window below
    run.weaponMods.wave.echo = 2
    const seenNovas = new Set()
    const steps = Math.round(4 / dt)
    for (let i = 0; i < steps; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      for (const n of run.novas) seenNovas.add(n)
    }
    assert.strictEqual(seenNovas.size, 3, `expected 1 original + 2 echo novas, got ${seenNovas.size}`)
    console.log(`PASS run L.b (echo wave): novas=${seenNovas.size}`)
  }

  // c. Cluster Bombs: a mine pop with cluster=2 leaves 2 small bomblets behind.
  {
    const run = createRun(makeMeta())
    run.weapons = []
    run.weaponMods.mines.cluster = 2
    run.player.x = 5000; run.player.y = 0 // clear of the mine, so contact damage doesn't interfere
    run.mines.push({ x: 0, y: 0, arm: 0, dmg: 20, radius: 50 })
    run.enemies.push(makeStatusEnemy(run, { x: 5, y: 0, hp: 1e6, speed: 0 }))
    stepSim(run, { x: 0, y: 0 }, dt)
    const bomblets = run.mines.filter((m) => m.small)
    assert.strictEqual(bomblets.length, 2, `expected 2 cluster bomblets, got ${bomblets.length}`)
    console.log(`PASS run L.c (cluster bombs): bomblets=${bomblets.length}`)
  }

  // d. Phantom Wisps: a homing shot with phantom=2 (pierce=3) damages at least 2 distinct
  // enemies before dying — tracked via the max hitIds size seen on any live shot.
  {
    const run = createRun(makeMeta())
    run.weapons = [{ id: 'homing', level: 1 }]
    run.weaponMods.homing.phantom = 2
    seedTargetRing(run, 6, 1e6, 80)
    let maxHitIds = 0
    const steps = Math.round(5 / dt)
    for (let i = 0; i < steps; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      for (const h of run.homingShots) maxHitIds = Math.max(maxHitIds, h.hitIds.size)
    }
    assert(maxHitIds >= 2, `expected a phantom wisp to hit at least 2 distinct enemies, got max hitIds=${maxHitIds}`)
    console.log(`PASS run L.d (phantom wisps): maxHitIds=${maxHitIds}`)
  }

  // e. Singularity: one hole cast with singularity=1 yields 2 holes, the second at
  // HOLE_SINGULARITY_FRAC of the main cast's radius.
  {
    const run = createRun(makeMeta())
    run.weapons = [{ id: 'hole', level: 1 }] // interval 6.5s, radius 510
    run.weaponMods.hole.singularity = 1
    let fired = false
    const steps = Math.round(7 / dt)
    for (let i = 0; i < steps && !fired; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.holes.length > 0) fired = true
    }
    assert(fired, 'expected the black hole to cast at least once')
    assert.strictEqual(run.holes.length, 2, `expected 1 main + 1 singularity hole, got ${run.holes.length}`)
    const radii = run.holes.map((h) => h.radius).sort((a, b) => a - b)
    const expectedSmall = WEAPONS.hole.levels[0].radius * HOLE_SINGULARITY_FRAC
    assert(Math.abs(radii[0] - expectedSmall) < 1e-6, `expected singularity radius ${expectedSmall}, got ${radii[0]}`)
    console.log(`PASS run L.e (singularity): holes=${run.holes.length} radii=${radii.map((r) => r.toFixed(0)).join(',')}`)
  }

  // f. Prismatic Split: one beam cast with prismatic=1 yields 2 beams, ~π (180°) apart.
  {
    const run = createRun(makeMeta())
    run.weapons = [{ id: 'rainbow', level: 1 }] // interval 8.0s
    run.weaponMods.rainbow.prismatic = 1
    let fired = false
    const steps = Math.round(9 / dt)
    for (let i = 0; i < steps && !fired; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.beams.length > 0) fired = true
    }
    assert(fired, 'expected the prism beam to cast at least once')
    assert.strictEqual(run.beams.length, 2, `expected 1 main + 1 prismatic beam, got ${run.beams.length}`)
    const diff = Math.abs(run.beams[0].angle - run.beams[1].angle)
    const normalized = Math.min(diff, Math.abs(diff - 2 * Math.PI))
    assert(Math.abs(normalized - Math.PI) < 0.05, `expected beams ~π apart, got ${normalized.toFixed(3)}`)
    console.log(`PASS run L.f (prismatic split): beams=${run.beams.length} angleDiff=${normalized.toFixed(3)}`)
  }

  // g. Plain stat mods: boomerang.extraRang / homing.extraWisp raise per-volley entity counts;
  // wave.bigWave raises nova maxR. Each compares a modded run against an unmodded baseline,
  // both driven only until their weapon's first cast (so a slow interval doesn't cost extra time).
  {
    function firstFireSnapshot(weaponId, arrKey, modSetter, waitSeconds) {
      const run = createRun(makeMeta())
      run.weapons = [{ id: weaponId, level: 1 }]
      if (modSetter) modSetter(run)
      const steps = Math.round(waitSeconds / dt)
      for (let i = 0; i < steps; i++) {
        if (run.phase === 'levelup') { declineLevelUp(run); continue }
        stepSim(run, { x: 0, y: 0 }, dt)
        if (run[arrKey].length > 0) break
      }
      return run[arrKey]
    }

    const baseRangs = firstFireSnapshot('boomerang', 'boomerangs', null, 2)
    const moddedRangs = firstFireSnapshot('boomerang', 'boomerangs', (r) => { r.weaponMods.boomerang.extraRang = 2 }, 2)
    assert(moddedRangs.length > baseRangs.length,
      `expected extraRang to raise boomerang count (base=${baseRangs.length}, modded=${moddedRangs.length})`)

    const baseWisps = firstFireSnapshot('homing', 'homingShots', null, 1.5)
    const moddedWisps = firstFireSnapshot('homing', 'homingShots', (r) => { r.weaponMods.homing.extraWisp = 2 }, 1.5)
    assert(moddedWisps.length > baseWisps.length,
      `expected extraWisp to raise wisp count (base=${baseWisps.length}, modded=${moddedWisps.length})`)

    const baseNovas = firstFireSnapshot('wave', 'novas', null, 3)
    const moddedNovas = firstFireSnapshot('wave', 'novas', (r) => { r.weaponMods.wave.bigWave = 0.5 }, 3)
    assert(moddedNovas[0].maxR > baseNovas[0].maxR,
      `expected bigWave to raise nova maxR (base=${baseNovas[0].maxR}, modded=${moddedNovas[0].maxR})`)

    console.log(`PASS run L.g (stat mods): rangs base=${baseRangs.length} modded=${moddedRangs.length}; wisps base=${baseWisps.length} modded=${moddedWisps.length}; nova maxR base=${baseNovas[0].maxR} modded=${moddedNovas[0].maxR}`)
  }

  // h. Level-up pool gating: with only star owned, buildLevelUpChoices never offers a non-star
  // weapon mod; once orbit is also owned, orbit mods start appearing.
  {
    const starOnly = createRun(makeMeta())
    starOnly.weapons = [{ id: 'star', level: 3 }]
    let sawNonStarMod = false
    for (let i = 0; i < 300; i++) {
      for (const c of buildLevelUpChoices(starOnly)) {
        if (c.kind === 'mod' && c.weapon !== 'star') sawNonStarMod = true
      }
    }
    assert.strictEqual(sawNonStarMod, false, 'expected only star weapon mods to appear with just star owned')

    const withOrbit = createRun(makeMeta())
    withOrbit.weapons = [{ id: 'star', level: 3 }, { id: 'orbit', level: 3 }]
    let sawOrbitMod = false
    for (let i = 0; i < 300; i++) {
      for (const c of buildLevelUpChoices(withOrbit)) {
        if (c.kind === 'mod' && c.weapon === 'orbit') sawOrbitMod = true
      }
    }
    assert(sawOrbitMod, 'expected orbit weapon mods to appear in the pool once orbit is owned')
    console.log('PASS run L.h (mod pool gating): star-only never offers non-star mods; orbit mods appear once owned')
  }
}

// ---- Run M: build-focus nudge -----------------------------------------------------
// The more picks invested in owned weapons (upgrades + mods), the less often NEW weapons
// join the level-up pool (see NEW_WEAPON_FADE/newWeaponChance in config.js).
function testFocusNudge() {
  const countNewOffers = (run, rounds) => {
    let n = 0
    for (let i = 0; i < rounds; i++) {
      for (const c of buildLevelUpChoices(run)) {
        if (c.kind === 'weapon' && c.tag === 'New!') n++
      }
    }
    return n
  }

  const fresh = createRun(makeMeta())
  const freshOffers = countNewOffers(fresh, 400)

  const committed = createRun(makeMeta())
  committed.weapons = [{ id: 'star', level: 5 }] // 4 upgrade picks
  committed.weaponModPicks.star.pierce = 5
  committed.weaponModPicks.star.blast = 5       // +10 mod picks => invested 14, p at the 0.1 floor
  const committedOffers = countNewOffers(committed, 400)

  assert(freshOffers > 0, 'expected a fresh run to be offered new weapons')
  assert(committedOffers < freshOffers * 0.35,
    `expected a committed build to see far fewer new-weapon cards (fresh=${freshOffers}, committed=${committedOffers})`)
  console.log(`PASS run M (focus nudge): new-weapon offers fresh=${freshOffers} committed=${committedOffers}`)
}

// ---- Run N: difficulty levels -------------------------------------------------------
// Difficulty d (1..MAX_DIFFICULTY): +25% enemy HP per level above 1, stacked ON TOP of
// mutator effects; main.js also rolls d-1 random mutators (randomMutators is tested here).
function testDifficulty() {
  const base = createRun(makeMeta())
  assert.strictEqual(base.mods.enemyHpMul, 1, 'difficulty defaults to 1 = untouched enemy HP')

  const d3 = createRun(makeMeta(), { difficulty: 3 })
  assert.strictEqual(d3.mods.enemyHpMul, 1.5, `difficulty 3 => enemyHpMul 1.5, got ${d3.mods.enemyHpMul}`)
  assert.strictEqual(d3.mods.coinMul, 1.5, `difficulty 3 => coinMul 1.5, got ${d3.mods.coinMul}`)

  const d5bulky = createRun(makeMeta(), { difficulty: 5, mutators: ['bulky'] })
  assert.strictEqual(d5bulky.mods.enemyHpMul, 1.5 * 2, `bulky(1.5) x difficulty5(2) => 3, got ${d5bulky.mods.enemyHpMul}`)
  assert.strictEqual(d5bulky.mods.coinMul, 1.6 * 2, `bulky coins(1.6) x difficulty5(2) => 3.2, got ${d5bulky.mods.coinMul}`)

  for (let i = 0; i < 50; i++) {
    const ids = randomMutators(4)
    assert.strictEqual(ids.length, 4, 'randomMutators(4) returns 4 ids')
    assert.strictEqual(new Set(ids).size, 4, 'randomMutators ids are distinct')
    for (const id of ids) assert(id in MUTATORS, `unknown mutator id ${id}`)
  }
  assert.strictEqual(randomMutators(0).length, 0, 'randomMutators(0) is empty')

  console.log('PASS run N (difficulty): hp scaling stacks with mutators, randomMutators sane')
}

// ---- Run O: v4.3 "crazy-mod pass" (13 new behavioral mods, one focused check each) ----------
function testCrazyMods() {
  const dt = 1 / 60

  // 1. orbit.supernova: an orb-killed enemy splashes an explode event (radius ORBIT_NOVA_RADIUS).
  function testSupernova() {
    const run = createRun(makeMeta())
    run.weapons = [{ id: 'orbit', level: 1 }]
    run.weaponMods.orbit.supernova = 1
    run.player.x = 0; run.player.y = 0
    run.enemies.push(makeStatusEnemy(run, { x: WEAPONS.orbit.levels[0].radius, y: 0, hp: 1, speed: 0 }))
    let exploded = false
    const steps = Math.round(3 / dt)
    for (let i = 0; i < steps && !exploded; i++) {
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.events.some((e) => e.type === 'explode' && Math.abs(e.radius - ORBIT_NOVA_RADIUS) < 1e-6)) exploded = true
    }
    assert(exploded, 'expected an orb kill to trigger a Supernova Sparks explosion')
    console.log('PASS run O.1 (orbit supernova): explosion on orb kill confirmed')
  }

  // 2. wave.undertow: nova knockback points toward the player (negative radial) instead of away.
  function testUndertow() {
    const run = createRun(makeMeta())
    run.weapons = [{ id: 'wave', level: 1 }]
    run.weaponMods.wave.undertow = 1
    run.player.x = 0; run.player.y = 0
    const target = makeStatusEnemy(run, { x: 100, y: 0, hp: 1e6, speed: 0 })
    run.enemies.push(target)
    let sawKb = false
    const steps = Math.round(3 / dt)
    for (let i = 0; i < steps && !sawKb; i++) {
      stepSim(run, { x: 0, y: 0 }, dt)
      const t = run.enemies.find((e) => e.id === target.id)
      if (t && (t.kb.x !== 0 || t.kb.y !== 0)) sawKb = true
    }
    const t = run.enemies.find((e) => e.id === target.id)
    assert(sawKb, 'expected the nova to knock back (pull) the target')
    assert(t.kb.x < 0, `expected undertow knockback to pull the target toward the player (negative kb.x), got ${t.kb.x}`)
    console.log(`PASS run O.2 (undertow): kb.x=${t.kb.x.toFixed(2)}`)
  }

  // 3. wave.tsunami: every 3rd wave cast has a bigger maxR than the 1st.
  function testTsunami() {
    const run = createRun(makeMeta())
    run.weapons = [{ id: 'wave', level: 1 }] // interval 2.4s
    run.weaponMods.wave.tsunami = 1
    run.player.x = 0; run.player.y = 0
    const seenSet = new Set()
    const seenNovas = []
    const steps = Math.round(8 / dt)
    for (let i = 0; i < steps; i++) {
      stepSim(run, { x: 0, y: 0 }, dt)
      for (const n of run.novas) if (!seenSet.has(n)) { seenSet.add(n); seenNovas.push(n) }
    }
    assert(seenNovas.length >= 3, `expected at least 3 wave casts, got ${seenNovas.length}`)
    assert(seenNovas[2].maxR > seenNovas[0].maxR,
      `expected the 3rd (tsunami) cast's maxR (${seenNovas[2].maxR}) > the 1st's (${seenNovas[0].maxR})`)
    console.log(`PASS run O.3 (tsunami): 1st maxR=${seenNovas[0].maxR.toFixed(1)} 3rd maxR=${seenNovas[2].maxR.toFixed(1)}`)
  }

  // 4. boomerang.backhand: the same stationary target takes more damage on the return hit than
  // the outbound hit (the boomerang naturally re-crosses it: out -> hit -> range -> back -> hit).
  function testBackhand() {
    const run = createRun(makeMeta())
    run.weapons = [{ id: 'boomerang', level: 1 }]
    run.weaponMods.boomerang.backhand = 1
    run.player.critChance = 0
    run.player.x = 0; run.player.y = 0; run.player.facing = 1
    const target = makeStatusEnemy(run, { x: 100, y: 0, hp: 1e9, speed: 0 })
    run.enemies.push(target)
    let outDmg = null, backDmg = null
    const steps = Math.round(3 / dt)
    for (let i = 0; i < steps; i++) {
      stepSim(run, { x: 0, y: 0 }, dt)
      const events = run.events
      run.events = []
      const b = run.boomerangs[0]
      for (const e of events) {
        if (e.type !== 'hit' || !b) continue
        if (b.phase === 'out' && outDmg === null) outDmg = e.dmg
        if (b.phase === 'back' && backDmg === null) backDmg = e.dmg
      }
    }
    assert(outDmg !== null, 'expected an outbound boomerang hit')
    assert(backDmg !== null, 'expected a return-phase boomerang hit')
    assert(backDmg > outDmg, `expected backhand return dmg (${backDmg}) > outbound dmg (${outDmg})`)
    console.log(`PASS run O.4 (backhand): out=${outDmg} back=${backDmg}`)
  }

  // 5. boomerang.seeker: an outbound boomerang's angle converges toward an off-axis enemy.
  // Enemy placed very far away so the boomerang's own (short) travel barely shifts the bearing
  // to it — isolating the steering effect from incidental position-drift geometry.
  function testSeeker() {
    const run = createRun(makeMeta())
    run.weapons = [{ id: 'boomerang', level: 1 }]
    run.weaponMods.boomerang.seeker = 1
    run.player.x = 0; run.player.y = 0; run.player.facing = 1
    let fired = false
    const fireSteps = Math.round(2 / dt)
    for (let i = 0; i < fireSteps && !fired; i++) {
      stepSim(run, { x: 0, y: 0 }, dt) // no enemies yet -> baseAngle = facing = 0
      if (run.boomerangs.length > 0) fired = true
    }
    assert(fired, 'expected the boomerang to fire')
    const b = run.boomerangs[0]
    const enemyAngle = b.angle + Math.PI / 2 // 90 degrees off its current heading
    const ex = b.x + Math.cos(enemyAngle) * 3000
    const ey = b.y + Math.sin(enemyAngle) * 3000
    run.enemies.push(makeStatusEnemy(run, { x: ex, y: ey, hp: 1e6, speed: 0 }))
    const angleDiff = (a, c) => Math.abs(Math.atan2(Math.sin(a - c), Math.cos(a - c)))
    const diffBefore = angleDiff(b.angle, Math.atan2(ey - b.y, ex - b.x))
    for (let i = 0; i < 50; i++) stepSim(run, { x: 0, y: 0 }, dt)
    const bAfter = run.boomerangs.find((x) => x === b)
    assert(bAfter, 'expected the boomerang to still be flying (out phase)')
    const diffAfter = angleDiff(bAfter.angle, Math.atan2(ey - bAfter.y, ex - bAfter.x))
    assert(diffAfter < diffBefore, `expected seeker angle diff to shrink (before=${diffBefore.toFixed(3)}, after=${diffAfter.toFixed(3)})`)
    console.log(`PASS run O.5 (seeker): angleDiff before=${diffBefore.toFixed(3)} after=${diffAfter.toFixed(3)}`)
  }

  // 6. mines.magnetic: an armed mine crawls toward a distant enemy (too far to trigger).
  function testMagneticMines() {
    const run = createRun(makeMeta())
    run.weapons = []
    run.weaponMods.mines.magnetic = 1
    run.player.x = 5000; run.player.y = 0
    run.mines.push({ x: 0, y: 0, arm: 0, dmg: 10, radius: 30 })
    run.enemies.push(makeStatusEnemy(run, { x: 300, y: 0, hp: 1e6, speed: 0 }))
    const before = Math.hypot(run.mines[0].x - 300, run.mines[0].y)
    for (let i = 0; i < 30; i++) stepSim(run, { x: 0, y: 0 }, dt)
    assert.strictEqual(run.mines.length, 1, 'expected the mine to still exist (too far to trigger)')
    const after = Math.hypot(run.mines[0].x - 300, run.mines[0].y)
    assert(after < before, `expected the magnetic mine to crawl toward the enemy (before=${before.toFixed(1)}, after=${after.toFixed(1)})`)
    console.log(`PASS run O.6 (magnetic mines): before=${before.toFixed(1)} after=${after.toFixed(1)}`)
  }

  // 7. mines.chainReaction: one triggered mine detonates a second in-radius (but otherwise
  // untriggered) armed mine — 2 explode events, both dealing damage.
  function testChainReaction() {
    const run = createRun(makeMeta())
    run.weapons = []
    run.weaponMods.mines.chainReaction = 2
    run.player.x = 5000; run.player.y = 0 // clear of the mines, no contact damage
    run.mines.push({ x: 0, y: 0, arm: 0, dmg: 20, radius: 80 })  // triggers naturally
    run.mines.push({ x: 70, y: 0, arm: 0, dmg: 20, radius: 80 }) // in A's blast, no enemy of its own
    run.enemies.push(makeStatusEnemy(run, { x: 2, y: 0, hp: 1e6, speed: 0 }))
    stepSim(run, { x: 0, y: 0 }, dt)
    const explodes = run.events.filter((e) => e.type === 'explode')
    assert.strictEqual(explodes.length, 2, `expected both mines to detonate (2 explode events), got ${explodes.length}`)
    console.log(`PASS run O.7 (chain reaction): explodes=${explodes.length}`)
  }

  // 8. homing.wispNova: a wisp popping on lifetime expiry emits an explode event of the right radius.
  function testWispNova() {
    const run = createRun(makeMeta())
    run.weapons = []
    run.weaponMods.homing.wispNova = 1
    run.player.x = 0; run.player.y = 0
    run.homingShots.push({ x: 0, y: 0, vx: 0, vy: 0, dmg: 50, life: 0.05, speed: 0, turnRate: 0, pierce: 1, hitIds: new Set() })
    let exploded = false
    for (let i = 0; i < 10 && !exploded; i++) {
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.events.some((e) => e.type === 'explode' && Math.abs(e.radius - WISP_NOVA_RADIUS) < 1e-6)) exploded = true
    }
    assert(exploded, 'expected an expiring wisp to trigger a Popping Wisps explosion')
    console.log('PASS run O.8 (wisp nova): explosion on wisp expiry confirmed')
  }

  // 9. homing.swarm: a wisp kill spawns exactly the tier-bonus count of mini wisps, and none of
  // those minis (even after killing more enemies themselves) ever spawn further minis.
  function testSwarm() {
    const run = createRun(makeMeta())
    run.weapons = []
    run.weaponMods.homing.swarm = 3
    run.player.x = 0; run.player.y = 0
    seedTargetRing(run, 12, 4, 60) // low-hp ring: minis can also land kills if swarm ever misfires
    run.homingShots.push({ x: 0, y: 0, vx: 300, vy: 0, dmg: 50, life: 3, speed: 300, turnRate: 8, pierce: 1, hitIds: new Set() })
    const seenMinis = new Set()
    const steps = Math.round(6 / dt)
    for (let i = 0; i < steps; i++) {
      stepSim(run, { x: 0, y: 0 }, dt)
      for (const h of run.homingShots) if (h._mini) seenMinis.add(h)
    }
    assert(seenMinis.size >= 3, `expected at least 3 mini wisps spawned on kill, got ${seenMinis.size}`)
    assert(seenMinis.size <= 3, `expected exactly the swarm tier bonus (3) mini wisps total, no re-swarm cascade — got ${seenMinis.size}`)
    console.log(`PASS run O.9 (swarm): minis=${seenMinis.size}`)
  }

  // 10. hole.hungry: a hole's radius grows over time while alive.
  function testHungryHole() {
    const run = createRun(makeMeta())
    run.weapons = []
    run.weaponMods.hole.hungry = 1
    run.player.x = 0; run.player.y = 0
    run.player.hp = 1e9; run.player.maxHP = 1e9
    const h = { x: 0, y: 0, radius: 100, coreRadius: 22, spawnRadius: 100, life: 3, duration: 3, dmg: 5, tick: 0.5, pull: 100, acc: 0 }
    run.holes.push(h)
    const before = h.radius
    for (let i = 0; i < Math.round(1 / dt); i++) stepSim(run, { x: 0, y: 0 }, dt)
    const after = run.holes.find((x) => x === h)
    assert(after, 'expected the hole to still be alive')
    assert(after.radius > before, `expected Hungry Hole to grow radius over time (before=${before}, after=${after.radius.toFixed(1)})`)
    console.log(`PASS run O.10 (hungry hole): before=${before} after=${after.radius.toFixed(1)}`)
  }

  // 11. hole.crunch: an expiring hole detonates at its final radius, damaging enemies inside.
  function testCrunch() {
    const run = createRun(makeMeta())
    run.weapons = []
    run.weaponMods.hole.crunch = 1
    run.player.x = 5000; run.player.y = 0
    const target = makeStatusEnemy(run, { x: 50, y: 0, hp: 1e6, speed: 0 })
    run.enemies.push(target)
    const h = { x: 0, y: 0, radius: 150, coreRadius: 33, spawnRadius: 150, life: 0.05, duration: 2, dmg: 5, tick: 5, pull: 0, acc: 0 }
    run.holes.push(h)
    let exploded = false
    for (let i = 0; i < 10 && !exploded; i++) {
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.events.some((e) => e.type === 'explode' && Math.abs(e.radius - 150) < 1e-6)) exploded = true
    }
    assert(exploded, 'expected the expiring hole to detonate (Big Crunch) at its final radius')
    const expectedDmg = Math.round(5 * CRUNCH_DMG_MUL * (1 + 1))
    const after = run.enemies.find((e) => e.id === target.id)
    assert(after.hp <= 1e6 - expectedDmg + 1, `expected the crunch detonation to deal ~${expectedDmg} dmg, hp=${after.hp}`)
    console.log(`PASS run O.11 (big crunch): expectedDmg=${expectedDmg} targetHp=${after.hp}`)
  }

  // 12. rainbow.focus: a late beam tick deals more damage than an early tick on an identical target.
  function testFocus() {
    const run = createRun(makeMeta())
    run.weapons = []
    run.player.critChance = 0
    run.player.x = 0; run.player.y = 0
    const target = makeStatusEnemy(run, { x: 200, y: 0, hp: 1e9, speed: 0 })
    run.enemies.push(target)
    const duration = 2
    run.beams.push({ angle: 0, life: duration, duration, dmg: 10, tick: 0.1, width: 60, length: 400, rotSpeed: 0, acc: 0, focusBonus: 1 })
    let earlyDmg = null, lateDmg = null
    const steps = Math.round(duration / dt)
    for (let i = 0; i < steps; i++) {
      stepSim(run, { x: 0, y: 0 }, dt)
      const events = run.events
      run.events = []
      for (const e of events) {
        if (e.type !== 'hit') continue
        if (earlyDmg === null) earlyDmg = e.dmg
        lateDmg = e.dmg
      }
    }
    assert(earlyDmg !== null && lateDmg !== null, 'expected hit events from the focused beam')
    assert(lateDmg > earlyDmg, `expected late-beam tick damage (${lateDmg}) > early tick damage (${earlyDmg})`)
    console.log(`PASS run O.12 (focus lens): early=${earlyDmg} late=${lateDmg}`)
  }

  // 13. rainbow.strobe: a strobed beam lands more hit events than an unmodded one over the same time.
  function testStrobe() {
    function totalHits(strobeBonus) {
      const run = createRun(makeMeta())
      run.weapons = [{ id: 'rainbow', level: 1 }] // interval 8.0s, duration 2.2s
      if (strobeBonus) run.weaponMods.rainbow.strobe = strobeBonus
      run.mods.spawnMul = 0
      run.player.x = 0; run.player.y = 0
      const target = makeStatusEnemy(run, { x: 2, y: 0, hp: 1e12, speed: 0 })
      target.radius = 500 // always within beam width/length regardless of rotation angle
      run.enemies.push(target)
      let hits = 0
      const steps = Math.round(11 / dt)
      for (let i = 0; i < steps; i++) {
        stepSim(run, { x: 0, y: 0 }, dt)
        for (const e of run.events) if (e.type === 'hit') hits++
        run.events = []
      }
      return hits
    }
    const baseline = totalHits(0)
    const strobed = totalHits(1)
    assert(strobed > baseline, `expected strobe to increase hit count over the same duration (baseline=${baseline}, strobed=${strobed})`)
    console.log(`PASS run O.13 (strobe ray): baseline hits=${baseline} strobed hits=${strobed}`)
  }

  testSupernova()
  testUndertow()
  testTsunami()
  testBackhand()
  testSeeker()
  testMagneticMines()
  testChainReaction()
  testWispNova()
  testSwarm()
  testHungryHole()
  testCrunch()
  testFocus()
  testStrobe()
}

// ---- Run P: star balance invariants (v4.4) ---------------------------------------
// Guards the two levers that made star a no-brainer: (1) offer flooding — star is the
// starting/only weapon, so its 6 mods used to be ~32% of all early cards and appeared in ~70%
// of level-up pools; (2) runaway multiplicative compounding — a heavily-modded star hit ~9.5x
// its own pierce/blast baseline (F2). This asserts both are reined in, WITHOUT making star weak
// (it must still clearly beat a plain star and stay under the strong AoE weapons, not vanish).
function testStarBalance() {
  const dt = 1 / 60
  const RARITIES_MULT = RARITIES

  // Bonus for one pick of a mod at a rarity, mirroring makeWeaponModCard in sim.js.
  function modBonus(weaponId, modId, rarity) {
    const c = WEAPON_MODS[weaponId][modId]
    const mult = RARITIES_MULT[rarity].mult
    if (c.kind === 'tier') return WEAPON_MOD_TIER_BONUS[rarity]
    if (c.kind === 'flat') return Math.max(1, Math.round(c.base * mult))
    return c.base * mult
  }
  // Apply "6-spread": one normal-rarity pick on each of the weapon's 6 mods.
  function applySpread6(run, weaponId) {
    for (const modId of Object.keys(WEAPON_MODS[weaponId])) {
      run.weaponMods[weaponId][modId] += modBonus(weaponId, modId, 'normal')
      run.weaponModPicks[weaponId][modId] += 1
    }
  }
  // Total hit-event damage over `seconds` vs a saturated immortal ring (same setup as F2).
  function measureDamage(weaponId, level, apply, seconds = 20) {
    const steps = Math.round(seconds / dt)
    const run = createRun(makeMeta())
    run.weapons = [{ id: weaponId, level }]
    run.mods.spawnMul = 0
    if (apply) apply(run)
    seedTargetRing(run, 24, 1e15, 200)
    let totalDmg = 0
    let t = 0
    for (let i = 0; i < steps; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      if (run.phase !== 'playing') break
      t += dt
      stepSim(run, { x: Math.cos(t), y: Math.sin(t) }, dt)
      for (const e of run.events) if (e.type === 'hit') totalDmg += e.dmg
      run.events = []
    }
    return Math.round(totalDmg)
  }

  // --- Invariant 1: offer fairness. Over many fresh star-only pools, star mods must be a modest
  // slice of cards (not the ~32% flood they were), and no single weapon may exceed the per-pool
  // card cap.
  {
    const starOnly = createRun(makeMeta())
    starOnly.weapons = [{ id: 'star', level: 3 }]
    let starMods = 0
    let totalCards = 0
    let maxStarPerPool = 0
    const N = 2000
    for (let i = 0; i < N; i++) {
      const cards = buildLevelUpChoices(starOnly)
      let perPool = 0
      for (const c of cards) {
        totalCards++
        if (c.kind === 'mod' && c.weapon === 'star') { starMods++; perPool++ }
      }
      maxStarPerPool = Math.max(maxStarPerPool, perPool)
    }
    const share = starMods / totalCards
    assert(maxStarPerPool <= MAX_MODS_PER_WEAPON_PER_POOL,
      `expected <= ${MAX_MODS_PER_WEAPON_PER_POOL} star mod(s) per pool, saw ${maxStarPerPool}`)
    assert(share < 0.20, `expected star-mod share of early cards < 20%, got ${(share * 100).toFixed(1)}%`)
    console.log(`PASS run P.1 (offer fairness): star-mod share=${(share * 100).toFixed(1)}% maxPerPool=${maxStarPerPool}`)
  }

  // --- Invariant 2: multi-weapon per-pool cap. No single owned weapon may flood a pool.
  {
    const multi = createRun(makeMeta())
    multi.weapons = [{ id: 'star', level: 5 }, { id: 'orbit', level: 3 }, { id: 'wave', level: 2 }, { id: 'boomerang', level: 4 }]
    let worst = 0
    for (let i = 0; i < 2000; i++) {
      const counts = {}
      for (const c of buildLevelUpChoices(multi)) {
        if (c.kind === 'mod') counts[c.weapon] = (counts[c.weapon] ?? 0) + 1
      }
      for (const n of Object.values(counts)) worst = Math.max(worst, n)
    }
    assert(worst <= MAX_MODS_PER_WEAPON_PER_POOL,
      `expected no weapon to exceed ${MAX_MODS_PER_WEAPON_PER_POOL} mod card(s)/pool, saw ${worst}`)
    console.log(`PASS run P.2 (multi-weapon cap): worst per-weapon mods/pool=${worst}`)
  }

  // --- Invariant 3: power band. A 6-modded star must (a) still clearly beat a plain star (stays a
  // solid starter), (b) not exceed the strongest other 6-modded weapon (it isn't the top raw
  // weapon), and (c) sit within a bounded multiple of the MEDIAN other 6-modded weapon.
  {
    const others = ['orbit', 'wave', 'boomerang', 'mines', 'homing', 'hole', 'rainbow']
    const level = 3
    const starPlain = measureDamage('star', level, null)
    const star6 = measureDamage('star', level, (r) => applySpread6(r, 'star'))
    const otherDmg = others.map((w) => measureDamage(w, level, (r) => applySpread6(r, w))).sort((a, b) => a - b)
    const median = otherDmg[Math.floor(otherDmg.length / 2)]
    const strongest = otherDmg[otherDmg.length - 1]

    assert(star6 > starPlain * 1.5, `expected 6-modded star to stay a solid starter (>1.5x plain), got ${star6} vs ${starPlain}`)
    assert(star6 <= strongest, `expected 6-modded star not to exceed the strongest other 6-modded weapon (star=${star6}, strongest-other=${strongest})`)
    assert(star6 <= median * 3.5, `expected 6-modded star within 3.5x the median other 6-modded weapon (star=${star6}, median=${median}, ratio=${(star6 / median).toFixed(2)})`)
    console.log(`PASS run P.3 (power band): starPlain=${starPlain} star6=${star6} median-other=${median} strongest-other=${strongest} star6/median=${(star6 / median).toFixed(2)}x`)
  }

  // --- Invariant 4: compounding bound. The F2 stack (multishot/split/chain/ricochet on top of
  // pierce/blast) must stay under an 8x runaway over its own pierce/blast baseline (was ~9.5x).
  {
    const level = 3
    const baseline = measureDamage('star', level, (r) => Object.assign(r.weaponMods.star, { pierce: 3, blast: 0.9 }))
    const advanced = measureDamage('star', level, (r) => Object.assign(r.weaponMods.star, { pierce: 3, blast: 0.9, multishot: 3, split: 2, chain: 3, ricochet: 2 }))
    const ratio = advanced / baseline
    assert(advanced > baseline, `expected advanced star mods to still beat the pierce/blast baseline (adv=${advanced}, base=${baseline})`)
    assert(ratio <= 8.0, `expected star compounding <= 8x its pierce/blast baseline, got ${ratio.toFixed(2)}x`)
    console.log(`PASS run P.4 (compounding bound): baseline=${baseline} advanced=${advanced} ratio=${ratio.toFixed(2)}x`)
  }
}

try {
  testMovementAndCombat()
  testDeath()
  testVictory()
  testNewWeapons()
  testRaritySanity()
  testStarMods()
  testAdvancedStarMods()
  testElements()
  testHolePullsCoins()
  testEscalation()
  testMutators()
  testAffixes()
  testWeaponModParity()
  testFocusNudge()
  testDifficulty()
  testCrazyMods()
  testStarBalance()
  console.log('ALL TESTS PASSED')
} catch (err) {
  console.error('FAIL:', err.message)
  process.exit(1)
}
