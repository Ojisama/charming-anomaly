// Headless self-check for src/sim.js. Plain node, no framework: `npm test`.
import assert from 'node:assert'
import { createRun } from '../src/state.js'
import { SHOP, PASSIVES, RARITIES, spawnRate, hpScale, eliteEveryAt } from '../src/config.js'
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
// run.elements directly (see testElements), mirroring how testStarMods forces run.starMods.
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
  assert((seenL12.mythic ?? 0) > 0, `expected mythic to appear at level 12, got ${seenL12.mythic ?? 0}`)
  assert((seenL12.mythic ?? 0) >= (seenL1.mythic ?? 0),
    `expected mythic to appear at least as often at level 12 (${seenL12.mythic ?? 0}) as level 1 (${seenL1.mythic ?? 0})`)

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
function makeStatusEnemy(run, { x, y, type = 'drone', elite = false, hp = 1e6, speed = 90 }) {
  return {
    id: run._nextId++, type, x, y,
    hp, maxHP: hp, radius: 16, speed, dmg: 8, elite, xp: 1,
    hitFlash: 0, orbCd: 0, kb: { x: 0, y: 0 }, holePull: 0,
    ignite: 0, igniteDps: 0, chill: 0, chillSlow: 0, frozen: 0, venom: 0, venomT: 0,
    _chillStack: 0, _freezeImmuneT: 0, _shockCd: 0, _comboCd: {},
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
    if (mods) Object.assign(run.starMods, mods)
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
    if (mods) Object.assign(run.starMods, mods)
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
  console.log('ALL TESTS PASSED')
} catch (err) {
  console.error('FAIL:', err.message)
  process.exit(1)
}
