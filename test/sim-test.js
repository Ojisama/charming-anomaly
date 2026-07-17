// Headless self-check for src/sim.js. Plain node, no framework: `npm test`.
import assert from 'node:assert'
import { createRun, loadMeta, ensureChapterMeta } from '../src/state.js'
import {
  SHOP, PASSIVES, RARITIES, spawnRate, hpScale, eliteEveryAt,
  MUTATORS, mergeMutatorMods, dailyMutators, todayKey, DAILY_MUTATOR_COUNT, randomMutators,
  sacrificeCost,
  SHIELD_HP_FRAC, SHIELD_DMG_MUL, SPLITTER_COUNT, VOLATILE_FUSE,
  FRENZY_HP_FRAC, PACER_RADIUS, ELITE, GILDED_COIN_MUL, NOVA_LIFE,
  WEAPONS, HOLE_SINGULARITY_FRAC,
  ORBIT_NOVA_RADIUS, WISP_NOVA_RADIUS, CRUNCH_DMG_MUL,
  WEAPON_MODS, WEAPON_MOD_TIER_BONUS, MAX_WEAPON_MOD_PICKS, MAX_MODS_PER_WEAPON_PER_POOL,
  xpForLevel, REVIVE_HP_FRAC, REVIVE_INVULN, rerollCost,
  MAX_DIFFICULTY, PLAYER,
  CHAPTERS, CHAPTER_ORDER, nextChapter, dailyChapter,
  LATCH_SLOW_T, SPLIT_CHILD_COUNT, SPLIT_HP_FRAC, SPLIT_RADIUS_FRAC,
  DASH_IDLE_T, DASH_T, ACID_R, ACID_DUR, ACID_DPS, SOAP_R, SOAP_DUR,
  MAX_WEAPON_LEVEL, FLAGELLA_CYCLONE_EVERY, SPOREBURST_FRAC,
  DIVE_STANDOFF, DIVE_HOVER_T, DIVE_TELEGRAPH_T, DIVE_T,
  SPRAY_FUSE, SPRAY_LEN, SPRAY_W, SPRAY_ACTIVE, SPRAY_DPS, STINGER_HIVE_EVERY,
  POUNCE_RANGE, POUNCE_AIM_T, POUNCE_LEAP_T, POUNCE_LAND_T,
  AERIAL_CIRCLE_T, AERIAL_MARK_T, AERIAL_STRIKE_T,
  FLASHLIGHT_ENRAGE_T, FLASHLIGHT_SPEED_MUL,
  SNAP_TRAP_R, SNAP_TRAP_DMG, SNAP_TRAP_REARM, SNAP_TRAP_MIN_DIST,
  LINE_CHARGE_RANGE, LINE_CHARGE_LOCK_T, LINE_CHARGE_T,
  SPAWNER_INTERVAL, SPAWNER_COUNT, SPAWNER_SCATTER, ARCHETYPE_TYPE, SPAWNER_ARCHETYPE,
  TRAFFIC_WARN, TRAFFIC_SWEEP, TRAFFIC_LEN, TRAFFIC_W, TRAFFIC_DMG,
  STRAFE_BANK_T, STRAFE_RUN_T,
  MISSILE_INTERVAL, MISSILE_COUNT, MISSILE_R, MISSILE_DMG,
  ARTILLERY_INTERVAL, ARTILLERY_RADIUS, ARTILLERY_LEAD, ARTILLERY_ELITE_RADIUS,
  BOMBARDMENT_COUNT, BOMBARDMENT_SPREAD, BOMBARDMENT_RADIUS,
  BLINK_INTERVAL, BLINK_DIST, BLINK_MIN_DIST,
  PHASE_SOLID_T, PULL_BEAM_INTERVAL, PULL_BEAM_RANGE, PULL_BEAM_FORCE,
  GRAVITY_MIN_DIST, GRAVITY_MIN_GAP, GRAVITY_WELL_R, GRAVITY_FORCE,
  CLAW_DOUBLE_EVERY, QUILL_RETALIATE_CD, FEAR_SPEED_MUL,
  GEYSER_CHAIN_FRAC, ROAR_RESONANCE_EVERY, TESSERACT_ARMS,
} from '../src/config.js'
import { stepSim, applyChoice, buildLevelUpChoices, currentForce } from '../src/sim.js'

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

// Star mods: force a star-only run with pierce maxed out and check it deals more total
// damage than a plain star-only baseline over the same time against a saturated target ring.
// (blast/"Exploding Stars" was removed in v4.6 — star has no AoE splash anymore.)
function testStarMods() {
  const dt = 1 / 60
  const steps = Math.round(20 / dt)

  // Reseed per run so baseline and modded see the SAME spawn stream. Without this both calls
  // consume one continuous stream — they play two different games and the pierce comparison
  // is meaningless. It only ever passed by luck; the v5.5 archetype-lookup fix shifted the
  // stream and flipped the sign.
  function runStarOnly(mods) {
    Math.random = mulberry32(20260714)
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
  const modded = runStarOnly({ pierce: 3 })

  assert(baseline.totalDmg > 0, `expected baseline total damage > 0, got ${baseline.totalDmg}`)
  assert(modded.totalDmg > baseline.totalDmg,
    `expected modded total damage (${modded.totalDmg}) > baseline total damage (${baseline.totalDmg})`)
  assert(modded.explodeEvents.length === 0, 'star must emit NO explode events since Exploding Stars was removed (v4.6)')

  console.log(`PASS run F (star mods): baseline dmg=${baseline.totalDmg} modded dmg=${modded.totalDmg} (no explosions — blast removed)`)
}

// Multishot/split/chain/ricochet: force all four maxed alongside pierce and check the
// cumulative damage against a saturated target ring beats a pierce-only baseline (same
// seed/duration), that split actually produces _shard bullets, and that at least one bullet
// chain-retargeted (run._chains debug counter, see state.js bullets[] doc).
function testAdvancedStarMods() {
  const dt = 1 / 60
  const steps = Math.round(20 / dt)

  // Reseed per run — the comment above already claims "same seed", which only holds if each
  // run restarts the stream rather than continuing where the previous one stopped.
  function runStarOnly(mods) {
    Math.random = mulberry32(20260714)
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

  const baseline = runStarOnly({ pierce: 3 })
  const advanced = runStarOnly({ pierce: 3, multishot: 3, split: 2, chain: 3, ricochet: 2 })

  assert(baseline.totalDmg > 0, `expected baseline total damage > 0, got ${baseline.totalDmg}`)
  assert(advanced.totalDmg > baseline.totalDmg,
    `expected advanced-mod total damage (${advanced.totalDmg}) > pierce-only baseline (${baseline.totalDmg})`)
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

  // 4 card slots (not the meta default of 2): more cards per pool means more natural chances
  // for a New! card to land, so the focus-nudge signal isn't swamped by the flat
  // NEW_WEAPON_MIN_RATE apparition floor (which applies per-pool regardless of slot count).
  const fourSlotMeta = () => { const m = makeMeta(); m.choiceSlots = 4; return m }

  const fresh = createRun(fourSlotMeta())
  const freshOffers = countNewOffers(fresh, 400)

  const committed = createRun(fourSlotMeta())
  committed.weapons = [{ id: 'star', level: 5 }] // 4 upgrade picks
  committed.weaponModPicks.star.pierce = 5
  committed.weaponModPicks.star.multishot = 5   // +10 mod picks => invested 14, p at the 0.1 floor
  const committedOffers = countNewOffers(committed, 400)

  assert(freshOffers > 0, 'expected a fresh run to be offered new weapons')
  assert(committedOffers < freshOffers * 0.35,
    `expected a committed build to see far fewer new-weapon cards (fresh=${freshOffers}, committed=${committedOffers})`)

  // v4.6 apparition floor: even a fully committed build must see a New! weapon card in at
  // least ~5% of level-ups (NEW_WEAPON_MIN_RATE guarantee; 3% bound leaves statistical room).
  let poolsWithNew = 0
  const ROUNDS = 3000
  for (let i = 0; i < ROUNDS; i++) {
    const cards = buildLevelUpChoices(committed)
    if (cards.some((c) => c.kind === 'weapon' && c.tag === 'New!')) poolsWithNew++
  }
  const rate = poolsWithNew / ROUNDS
  assert(rate > 0.03, `expected >=~5% of committed-build level-ups to offer a new weapon, got ${(rate * 100).toFixed(1)}%`)
  console.log(`PASS run M (focus nudge): new-weapon offers fresh=${freshOffers} committed=${committedOffers}; floored apparition=${(rate * 100).toFixed(1)}%/level-up`)
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
  // pierce) must stay under an 8x runaway over its own pierce-only baseline.
  // (blast removed v4.6 — both sides of the ratio lost it.)
  {
    const level = 3
    const baseline = measureDamage('star', level, (r) => Object.assign(r.weaponMods.star, { pierce: 3 }))
    const advanced = measureDamage('star', level, (r) => Object.assign(r.weaponMods.star, { pierce: 3, multishot: 3, split: 2, chain: 3, ricochet: 2 }))
    const ratio = advanced / baseline
    assert(advanced > baseline, `expected advanced star mods to still beat the pierce-only baseline (adv=${advanced}, base=${baseline})`)
    assert(ratio <= 8.0, `expected star compounding <= 8x its pierce-only baseline, got ${ratio.toFixed(2)}x`)
    console.log(`PASS run P.4 (compounding bound): baseline=${baseline} advanced=${advanced} ratio=${ratio.toFixed(2)}x`)
  }
}

// v4.5 gold sinks: pre-run consumables (revive/headstart/charged) + level-up reroll pricing.
function testGoldSinks() {
  const dt = 1 / 60

  // Q.a revive: a banked revive prevents death once (restoring hp, granting invuln, shoving
  // nearby enemies, emitting a 'revive' event), then a second lethal hit (after invuln expires,
  // with the revive already spent) kills for real.
  {
    const run = createRun(makeMeta(), { consumables: ['revive'] })
    assert.strictEqual(run.revives, 1, `expected the revive consumable to bank 1 revive, got ${run.revives}`)
    run.mods.spawnMul = 0 // isolate hand-placed enemies as the only source of player damage
    run.player.x = 0; run.player.y = 0
    run.player.hp = 1 // guarantees the very next contact hit is lethal

    const contactEnemy = makeStatusEnemy(run, { x: 10, y: 0, hp: 1e6, speed: 0 })
    const nearbyEnemy = makeStatusEnemy(run, { x: 150, y: 0, hp: 1e6, speed: 0 })
    run.enemies.push(contactEnemy, nearbyEnemy)

    stepSim(run, { x: 0, y: 0 }, dt)

    assert.strictEqual(run.phase, 'playing', `expected the run to keep playing after a revive, got '${run.phase}'`)
    assert.strictEqual(run.revives, 0, `expected the revive to be consumed, got ${run.revives}`)
    assert.strictEqual(run.player.hp, run.player.maxHP * REVIVE_HP_FRAC, `expected hp restored to REVIVE_HP_FRAC of maxHP, got ${run.player.hp}`)
    assert(run.events.some((e) => e.type === 'revive'), 'expected a revive event')
    assert(!run.events.some((e) => e.type === 'dead'), 'expected no dead event on a revived hit')
    assert(nearbyEnemy.kb.x > 0, `expected the nearby enemy (at +x) to be knocked back away from the player (positive kb.x), got kb.x=${nearbyEnemy.kb.x}`)

    // Second lethal hit: wait out the revive's longer invuln window, then take a fresh contact
    // hit (the original contact/nearby enemies got shoved away by the revive itself) with no
    // revives left banked — this time the run actually ends.
    run.player.hp = 1
    const contactEnemy2 = makeStatusEnemy(run, { x: 5, y: 0, hp: 1e6, speed: 0 })
    run.enemies.push(contactEnemy2)
    let died = false
    const steps = Math.round((REVIVE_INVULN + 0.5) / dt)
    for (let i = 0; i < steps && !died; i++) {
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.phase === 'dead') died = true
    }
    assert(died, `expected the second lethal hit (after invuln expired, no revives left) to kill the player, phase='${run.phase}'`)
    console.log('PASS run Q.a (revive)')
  }

  // Q.b headstart: pre-loaded xp banks exactly two level-ups (declined, per the existing
  // declineLevelUp helper) with zero enemies killed.
  {
    const run = createRun(makeMeta(), { consumables: ['headstart'] })
    assert.strictEqual(run.player.xp, xpForLevel(1) + xpForLevel(2), `expected headstart to pre-load xp, got ${run.player.xp}`)
    run.mods.spawnMul = 0
    for (let i = 0; i < 10 && run.player.level < 3; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
    }
    assert.strictEqual(run.player.level, 3, `expected headstart to bank 2 level-ups (level 1 -> 3), got ${run.player.level}`)
    assert.strictEqual(run.kills, 0, `expected zero kills from banked headstart level-ups, got ${run.kills}`)
    console.log('PASS run Q.b (headstart)')
  }

  // Q.c charged: the starting weapon begins at level 2.
  {
    const run = createRun(makeMeta(), { consumables: ['charged'] })
    assert.strictEqual(run.weapons[0].level, 2, `expected charged core to start the weapon at level 2, got ${run.weapons[0].level}`)
    console.log('PASS run Q.c (charged)')
  }

  // Q.d rerollCost: ceil(10 * 1.5^used) for used=0,1,2 -> 10, 15, 23.
  {
    assert.strictEqual(rerollCost(0), 10, `expected rerollCost(0)=10, got ${rerollCost(0)}`)
    assert.strictEqual(rerollCost(1), 15, `expected rerollCost(1)=15, got ${rerollCost(1)}`)
    assert.strictEqual(rerollCost(2), 23, `expected rerollCost(2)=23, got ${rerollCost(2)}`)
    console.log('PASS run Q.d (rerollCost)')
  }
}

// ---- Run R: permanent level-up choice slots (v4.8) + retuned rarity (v4.7) ---------------
function testChoiceSlots() {
  // Fresh meta defaults to 2 slots (no localStorage in this Node harness -> loadMeta's
  // try/catch always takes the fresh-meta branch — still worth asserting explicitly).
  const fresh = loadMeta()
  assert.strictEqual(fresh.choiceSlots, 2, 'fresh meta starts at 2 choice slots')

  // loadMeta clamps a stored choiceSlots into [2, 4] and defaults it when missing.
  const stub = {}
  globalThis.localStorage = {
    getItem: () => JSON.stringify(stub),
    setItem: () => {},
  }
  stub.shop = Object.fromEntries(Object.keys(SHOP).map((id) => [id, 0]))
  stub.coins = 0
  const noField = loadMeta()
  assert.strictEqual(noField.choiceSlots, 2, 'loadMeta defaults a missing choiceSlots to 2')
  stub.choiceSlots = 99
  assert.strictEqual(loadMeta().choiceSlots, 4, 'loadMeta clamps choiceSlots above 4 down to 4')
  stub.choiceSlots = 0
  assert.strictEqual(loadMeta().choiceSlots, 2, 'loadMeta clamps choiceSlots below 2 up to 2')
  delete globalThis.localStorage

  // createRun snapshots meta.choiceSlots -> run.choiceSlots, and buildLevelUpChoices rolls
  // exactly that many cards, for every value 2..4.
  for (const slots of [2, 3, 4]) {
    const meta = makeMeta()
    meta.choiceSlots = slots
    const run = createRun(meta)
    assert.strictEqual(run.choiceSlots, slots, `run.choiceSlots should snapshot meta.choiceSlots=${slots}`)
    run.player.xp = run.player.xpNext + 1
    stepSim(run, { x: 0, y: 0 }, 1 / 60)
    run.events = []
    assert.strictEqual(run.phase, 'levelup', 'expected a level-up to trigger')
    assert.strictEqual(run.levelUpChoices.length, slots,
      `expected ${slots} cards for choiceSlots=${slots}, got ${run.levelUpChoices.length}`)
  }

  // Sacrifice pricing: 20 levels for the 3rd slot, 40 for the 4th, no 5th slot to buy.
  assert.strictEqual(sacrificeCost(2), 20, '3rd card slot costs 20 levels')
  assert.strictEqual(sacrificeCost(3), 40, '4th card slot costs 40 levels')
  assert.strictEqual(sacrificeCost(4), null, 'no 5th card slot')

  // Rarity retune: epic-or-better ≈ 12.3% per card (33% per 3-card screen). Wide statistical band.
  let high = 0
  let total = 0
  const sampler = createRun(makeMeta())
  for (let i = 0; i < 3000; i++) {
    for (const c of buildLevelUpChoices(sampler)) {
      total++
      if (c.rarity === 'epic' || c.rarity === 'legendary' || c.rarity === 'mythic') high++
    }
  }
  const rate = high / total
  assert(rate > 0.09 && rate < 0.16, `expected epic+ per-card rate ≈ 12.3%, got ${(rate * 100).toFixed(1)}%`)
  console.log(`PASS run R (permanent choice slots + rarity retune): slots 2/3/4 -> that many cards, sacrifice costs 20/40, epic+ per card=${(rate * 100).toFixed(1)}%`)
}

// ---- Run S: sequential difficulty unlock (v4.10) -----------------------------------------
// The unlock-on-victory bump itself lives in main.js's endRun (untestable glue, no DOM/main.js
// import here) — this only covers loadMeta's grandfathering/clamping of the ladder, which as of
// v5.0 lives per-chapter at meta.chapters.body.{maxDifficulty,difficulty} (see run T for the
// migration itself; this run keeps covering the plain clamping behavior at that new location).
function testDifficultyUnlock() {
  // (a) Fresh meta (no localStorage in this Node harness) starts locked to level 1.
  const fresh = loadMeta()
  assert.strictEqual(fresh.chapters.body.maxDifficulty, 1, 'fresh meta starts at maxDifficulty 1')
  assert.strictEqual(fresh.chapters.body.difficulty, 1, 'fresh meta starts at difficulty 1')

  // (b) A pre-v4.10 save (difficulty set, no maxDifficulty field) is grandfathered: whatever
  // difficulty was already selected stays reachable, and stays selected.
  const stub = {}
  globalThis.localStorage = {
    getItem: () => JSON.stringify(stub),
    setItem: () => {},
  }
  stub.shop = Object.fromEntries(Object.keys(SHOP).map((id) => [id, 0]))
  stub.coins = 0
  stub.difficulty = 4
  const grandfathered = loadMeta()
  assert.strictEqual(grandfathered.chapters.body.maxDifficulty, 4, 'a stored difficulty=4 with no maxDifficulty grandfathers maxDifficulty to 4')
  assert.strictEqual(grandfathered.chapters.body.difficulty, 4, 'grandfathered difficulty stays 4')

  // (c) A save with difficulty ahead of its own maxDifficulty (stale/edited save) gets
  // difficulty clamped down to maxDifficulty.
  stub.difficulty = 5
  stub.maxDifficulty = 2
  const clamped = loadMeta()
  assert.strictEqual(clamped.chapters.body.maxDifficulty, 2, 'stored maxDifficulty=2 is kept as-is')
  assert.strictEqual(clamped.chapters.body.difficulty, 2, 'difficulty=5 > maxDifficulty=2 clamps down to 2')

  // (d) Garbage maxDifficulty values clamp into [1, MAX_DIFFICULTY].
  stub.difficulty = 1
  stub.maxDifficulty = 0
  assert.strictEqual(loadMeta().chapters.body.maxDifficulty, 1, 'maxDifficulty=0 clamps up to 1')
  stub.maxDifficulty = 99
  assert.strictEqual(loadMeta().chapters.body.maxDifficulty, MAX_DIFFICULTY, `maxDifficulty=99 clamps down to ${MAX_DIFFICULTY}`)
  delete globalThis.localStorage

  console.log('PASS run S (sequential difficulty unlock): fresh=1, grandfathered=4, stale-difficulty clamps to maxDifficulty, garbage maxDifficulty clamps to [1,5]')
}

// ---- Run T: chapter data model + meta migration (v5.0) -----------------------------------
function testChapters() {
  // (a) Fresh meta (no localStorage) defaults to chapter 'body', chapters.body unlocked at
  // maxDifficulty 1, chapters.pond present but locked.
  const fresh = loadMeta()
  assert.strictEqual(fresh.chapter, 'body', 'fresh meta selects the body chapter by default')
  assert.strictEqual(fresh.chapters.body.unlocked, true, 'fresh meta: body chapter starts unlocked')
  assert.strictEqual(fresh.chapters.body.maxDifficulty, 1, 'fresh meta: body chapter starts at maxDifficulty 1')
  assert.strictEqual(fresh.chapters.body.difficulty, 1, 'fresh meta: body chapter starts at difficulty 1')
  assert.strictEqual(fresh.chapters.pond.unlocked, false, 'fresh meta: pond chapter starts locked')

  // (b) A pre-v5.0 (v4) save migrates its top-level difficulty ladder into chapters.body, once,
  // and leaves coins/best/choiceSlots/runs untouched. Top-level difficulty/maxDifficulty are gone.
  const stub = {
    difficulty: 4,
    maxDifficulty: 4,
    best: { time: 280, kills: 900 },
    coins: 50,
    shop: {},
    runs: 3,
    choiceSlots: 3,
  }
  globalThis.localStorage = {
    getItem: () => JSON.stringify(stub),
    setItem: () => {},
  }
  const migrated = loadMeta()
  assert.strictEqual(migrated.chapters.body.unlocked, true, 'migrated save: body chapter unlocked')
  assert.strictEqual(migrated.chapters.body.maxDifficulty, 4, 'migrated save: chapters.body absorbs top-level maxDifficulty')
  assert.strictEqual(migrated.chapters.body.difficulty, 4, 'migrated save: chapters.body absorbs top-level difficulty')
  assert.strictEqual(migrated.best.time, 280, 'migrated save: top-level meta.best.time preserved')
  assert.strictEqual(migrated.best.kills, 900, 'migrated save: top-level meta.best.kills preserved')
  assert.strictEqual(migrated.coins, 50, 'migrated save: coins preserved')
  assert.strictEqual(migrated.choiceSlots, 3, 'migrated save: choiceSlots preserved')
  assert.strictEqual(migrated.runs, 3, 'migrated save: runs preserved')
  assert.strictEqual('difficulty' in migrated, false, 'migrated save: top-level meta.difficulty deleted')
  assert.strictEqual('maxDifficulty' in migrated, false, 'migrated save: top-level meta.maxDifficulty deleted')
  delete globalThis.localStorage

  // (c) nextChapter walks CHAPTER_ORDER, null past the end.
  assert.strictEqual(nextChapter('body'), 'pond', "nextChapter('body') === 'pond'")
  assert.strictEqual(nextChapter('pond'), 'garden', "nextChapter('pond') === 'garden'")
  // Order-independent (v5.4: the arc grew from 3 to 7 chapters) — every id hands off to the next,
  // and only the LAST one terminates the walk.
  for (let i = 0; i < CHAPTER_ORDER.length - 1; i++) {
    assert.strictEqual(nextChapter(CHAPTER_ORDER[i]), CHAPTER_ORDER[i + 1], `nextChapter('${CHAPTER_ORDER[i]}') === '${CHAPTER_ORDER[i + 1]}'`)
  }
  assert.strictEqual(nextChapter(CHAPTER_ORDER[CHAPTER_ORDER.length - 1]), null, `nextChapter('${CHAPTER_ORDER[CHAPTER_ORDER.length - 1]}') === null (last shipped chapter)`)

  // (d) dailyChapter is deterministic per date key, and both shipped chapters are reachable
  // over a spread of dates (date-seeded across CHAPTER_ORDER).
  assert.strictEqual(dailyChapter('2026-07-16'), dailyChapter('2026-07-16'), 'dailyChapter is deterministic for a given date key')
  const seen = new Set()
  for (let d = 1; d <= 28; d++) {
    seen.add(dailyChapter(`2026-08-${String(d).padStart(2, '0')}`))
  }
  for (const id of CHAPTER_ORDER) {
    assert(seen.has(id), `dailyChapter should reach chapter '${id}' over a spread of dates`)
  }
  assert.strictEqual(seen.size, CHAPTER_ORDER.length, 'dailyChapter never returns an id outside CHAPTER_ORDER')

  // (e) ensureChapterMeta clamps garbage entries into range and fills in missing fields.
  const garbageMeta = { chapters: { pond: { unlocked: true, maxDifficulty: 99, difficulty: -5 } } }
  const pond = ensureChapterMeta(garbageMeta, 'pond')
  assert.strictEqual(pond.maxDifficulty, MAX_DIFFICULTY, `garbage maxDifficulty=99 clamps down to ${MAX_DIFFICULTY}`)
  assert.strictEqual(pond.difficulty, 1, 'garbage difficulty=-5 clamps up to 1')
  assert.strictEqual(pond.best.time, 0, 'ensureChapterMeta fills in a missing best.time')
  assert.strictEqual(pond.best.kills, 0, 'ensureChapterMeta fills in a missing best.kills')

  const missingMeta = {}
  const body = ensureChapterMeta(missingMeta, 'body')
  assert.strictEqual(body.unlocked, true, 'ensureChapterMeta creates a missing body entry unlocked')
  const missingPond = ensureChapterMeta(missingMeta, 'pond')
  assert.strictEqual(missingPond.unlocked, false, 'ensureChapterMeta creates a missing non-body entry locked')

  // (f) Retroactive chapter unlock (v5.3.3): a save whose pond ladder proves a difficulty-3+
  // win (maxDifficulty 4 = won level 3) unlocks garden on load, even though garden didn't
  // exist when the win happened. A ladder at maxDifficulty 3 (won only level 2) does not.
  const earnedStub = {
    coins: 0, shop: {}, best: { time: 0, kills: 0 }, runs: 5, choiceSlots: 2, chapter: 'pond',
    chapters: {
      body: { unlocked: true, maxDifficulty: 5, difficulty: 3, best: { time: 300, kills: 100 } },
      pond: { unlocked: true, maxDifficulty: 4, difficulty: 3, best: { time: 300, kills: 100 } },
    },
  }
  globalThis.localStorage = { getItem: () => JSON.stringify(earnedStub), setItem: () => {} }
  const earned = loadMeta()
  assert.strictEqual(earned.chapters.garden.unlocked, true, 'pond maxDifficulty 4 (won lvl 3) retroactively unlocks garden')
  earnedStub.chapters.pond.maxDifficulty = 3
  const notEarned = loadMeta()
  assert.strictEqual(notEarned.chapters.garden.unlocked, false, 'pond maxDifficulty 3 (won only lvl 2) leaves garden locked')
  delete globalThis.localStorage

  console.log('PASS run T (chapter data model + meta migration): fresh defaults, v4 migration, nextChapter, dailyChapter, garbage clamps, retroactive unlock')
}

// ---- Run U: per-chapter runs, weapon pools, chapter unlock (v5.0 task 2) -----------------
// Chapter unlock itself (endRun in main.js) is untestable glue here (no DOM/main.js import) —
// this covers what sim/state own: createRun's chapter snapshot + starter weapon, and
// weaponCandidates/buildLevelUpChoices scoping level-up weapon OFFERS to the run's chapter
// (mods/elements stay global — see the run.chapter doc block in state.js).
function testChapterRuns() {
  // (a) Default chapter is 'body'; starting weapon is CHAPTERS.body.starter (star), level 1.
  {
    const run = createRun(makeMeta())
    assert.strictEqual(run.chapter, 'body', "expected createRun's default chapter to be 'body'")
    assert.strictEqual(run.weapons.length, 1, 'expected exactly one starting weapon')
    assert.strictEqual(run.weapons[0].id, CHAPTERS.body.starter, `expected the body starter (${CHAPTERS.body.starter}), got ${run.weapons[0].id}`)
    assert.strictEqual(run.weapons[0].level, 1, 'expected the starting weapon at level 1')
  }

  // (b) chapter: 'pond' starts with the pond starter (flagella) instead of body's star.
  {
    const run = createRun(makeMeta(), { chapter: 'pond' })
    assert.strictEqual(run.chapter, 'pond', "expected run.chapter === 'pond'")
    assert.strictEqual(run.weapons[0].id, CHAPTERS.pond.starter, `expected the pond starter (${CHAPTERS.pond.starter}), got ${run.weapons[0].id}`)
  }

  // The charged consumable still bumps the CHAPTER'S OWN starter to level 2, not hardcoded star.
  {
    const run = createRun(makeMeta(), { chapter: 'pond', consumables: ['charged'] })
    assert.strictEqual(run.weapons[0].id, CHAPTERS.pond.starter, 'expected charged core to keep the chapter starter id')
    assert.strictEqual(run.weapons[0].level, 2, 'expected charged core to bump the chapter starter to level 2')
  }

  // (c) A pond run's level-up pool never offers other-chapter/vaulted weapons (star=body,
  // boomerang=garden, hole/rainbow still vaulted) as 'weapon' cards — only CHAPTERS.pond.weapons
  // can appear. Sampled generously (500 pools x up to 4 cards) to catch any leak.
  {
    const pond = createRun(makeMeta(), { chapter: 'pond' })
    pond.choiceSlots = 4 // more cards per pool -> more chances to catch a leak
    const forbidden = new Set(['star', 'boomerang', 'hole', 'rainbow'])
    let sawWeaponCard = false
    for (let i = 0; i < 500; i++) {
      for (const c of buildLevelUpChoices(pond)) {
        if (c.kind !== 'weapon') continue
        sawWeaponCard = true
        assert(!forbidden.has(c.id), `expected a pond run to never offer '${c.id}' as a weapon card`)
        assert(CHAPTERS.pond.weapons.includes(c.id), `expected every pond weapon card to be a pond native, got '${c.id}'`)
      }
    }
    assert(sawWeaponCard, 'expected at least one weapon card to appear over 500 pond pools')
    console.log('PASS run U.c (pond pool never offers body/vaulted weapons)')
  }

  // (d) A body run's level-up pool never offers mines (a pond native) — the flip side of (c).
  {
    const body = createRun(makeMeta())
    body.choiceSlots = 4
    let sawWeaponCard = false
    for (let i = 0; i < 500; i++) {
      for (const c of buildLevelUpChoices(body)) {
        if (c.kind !== 'weapon') continue
        sawWeaponCard = true
        assert.notStrictEqual(c.id, 'mines', "expected a body run to never offer 'mines' as a weapon card")
        assert(CHAPTERS.body.weapons.includes(c.id), `expected every body weapon card to be a body native, got '${c.id}'`)
      }
    }
    assert(sawWeaponCard, 'expected at least one weapon card to appear over 500 body pools')
    console.log('PASS run U.d (body pool never offers pond weapons)')
  }

  console.log('PASS run U (per-chapter runs + weapon pool filtering): default chapter, pond starter, charged bump, pool filtering both directions')
}

// ---- Run V: chapter behavior flags, drift currents, field obstacles (v5.0 task 3) -------
function testChapterBehaviors() {
  const dt = 1 / 60

  // (a) latch: contact sets the player's movement debuff, and the latch enemy dies (spends
  // itself) instead of dealing normal contact damage.
  {
    const run = createRun(makeMeta())
    run.weapons = []
    run.player.x = 0; run.player.y = 0
    const e = makeStatusEnemy(run, { x: 0, y: 0, hp: 50, speed: 0 })
    e.flags = ['latch']
    run.enemies.push(e)
    const killsBefore = run.kills
    stepSim(run, { x: 0, y: 0 }, dt)
    assert(run.player.slowT > 0, `expected latch contact to set player.slowT, got ${run.player.slowT}`)
    assert(run.kills > killsBefore, 'expected the latch enemy to die on contact')

    // The debuff actually slows movement (not just bookkeeping).
    const slowed = createRun(makeMeta())
    slowed.weapons = []
    slowed.player.x = 0; slowed.player.y = 0
    slowed.player.slowT = LATCH_SLOW_T
    stepSim(slowed, { x: 1, y: 0 }, dt)
    const slowedDist = Math.hypot(slowed.player.x, slowed.player.y)

    const plain = createRun(makeMeta())
    plain.weapons = []
    plain.player.x = 0; plain.player.y = 0
    stepSim(plain, { x: 1, y: 0 }, dt)
    const plainDist = Math.hypot(plain.player.x, plain.player.y)

    assert(slowedDist < plainDist, `expected the latch debuff to slow movement (slowed=${slowedDist}, plain=${plainDist})`)
    console.log(`PASS run V.a (latch): slowT=${run.player.slowT.toFixed(2)} slowedDist=${slowedDist.toFixed(2)} plainDist=${plainDist.toFixed(2)}`)
  }

  // (b) split: death spawns SPLIT_CHILD_COUNT children at reduced hp/radius; children never re-split.
  {
    const run = createRun(makeMeta())
    run.weapons = [{ id: 'star', level: 1 }]
    setElements(run, { fire: 5 })
    run.player.x = 0; run.player.y = 0
    run.player.hp = 1e9; run.player.maxHP = 1e9
    const parent = makeStatusEnemy(run, { x: 100, y: 0, hp: 30, speed: 0 })
    parent.flags = ['split']
    run.enemies.push(parent)

    let hitOnce = false
    for (let i = 0; i < Math.round(2 / dt) && !hitOnce; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.events.some((e) => e.type === 'hit')) hitOnce = true
    }
    assert(hitOnce, 'expected the split target to take at least one hit')
    run.weapons = []
    run.bullets = []

    let killed = false
    for (let i = 0; i < Math.round(4 / dt) && !killed; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.kills > 0) killed = true
    }
    assert(killed, 'expected the ignite DoT to finish off the split target')

    const children = run.enemies.filter((e) => e._splitChild)
    assert.strictEqual(children.length, SPLIT_CHILD_COUNT, `expected ${SPLIT_CHILD_COUNT} split children, got ${children.length}`)
    const expectedHp = parent.maxHP * SPLIT_HP_FRAC
    const expectedRadius = parent.radius * SPLIT_RADIUS_FRAC
    for (const c of children) {
      assert(Math.abs(c.maxHP - expectedHp) < 1e-6, `expected child maxHP ${expectedHp}, got ${c.maxHP}`)
      assert(Math.abs(c.radius - expectedRadius) < 1e-6, `expected child radius ${expectedRadius}, got ${c.radius}`)
    }

    // No re-split: isolate one child (drop its sibling so nothing else can be hit), kill it the
    // same way, and confirm no further _splitChild enemies appear (a broken guard adds 2 more).
    const [child, sibling] = children
    run.enemies = run.enemies.filter((e) => e.id !== sibling.id)
    run.player.x = child.x; run.player.y = child.y
    run.weapons = [{ id: 'star', level: 5 }]
    run.events = [] // drain stale 'hit' events from the parent's death so this check is fresh
    let childHit = false
    for (let i = 0; i < Math.round(2 / dt) && !childHit; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.events.some((e) => e.type === 'hit')) childHit = true
    }
    assert(childHit, 'expected the split child to take at least one hit')
    run.weapons = []
    run.bullets = []
    let childDead = false
    for (let i = 0; i < Math.round(4 / dt) && !childDead; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      if (!run.enemies.find((e) => e.id === child.id)) childDead = true
    }
    assert(childDead, 'expected the split child to die from the ignite DoT')
    assert.strictEqual(run.enemies.filter((e) => e._splitChild).length, 0,
      "expected a split child's own death to spawn no further children (no re-split)")
    console.log(`PASS run V.b (split): children=${children.length} hp=${children[0].maxHP.toFixed(1)} radius=${children[0].radius.toFixed(1)}`)
  }

  // (c) dashBurst: displacement over the dash window far exceeds the idle window.
  {
    const run = createRun(makeMeta())
    run.weapons = []
    run.player.x = 5000; run.player.y = 0 // far away: fixed seek direction, never contacts
    const e = makeStatusEnemy(run, { x: 0, y: 0, hp: 1e6, speed: 100 })
    e.flags = ['dashBurst']
    run.enemies.push(e)

    const idleStart = { x: e.x, y: e.y }
    const idleSteps = Math.round(DASH_IDLE_T / dt)
    for (let i = 0; i < idleSteps; i++) stepSim(run, { x: 0, y: 0 }, dt)
    const afterIdle = run.enemies.find((en) => en.id === e.id)
    const idleDist = Math.hypot(afterIdle.x - idleStart.x, afterIdle.y - idleStart.y)

    const dashStart = { x: afterIdle.x, y: afterIdle.y }
    const dashSteps = Math.round(DASH_T / dt)
    for (let i = 0; i < dashSteps; i++) stepSim(run, { x: 0, y: 0 }, dt)
    const afterDash = run.enemies.find((en) => en.id === e.id)
    const dashDist = Math.hypot(afterDash.x - dashStart.x, afterDash.y - dashStart.y)

    const idleRate = idleDist / DASH_IDLE_T
    const dashRate = dashDist / DASH_T
    assert(dashRate > idleRate * 3, `expected dash-phase speed >> idle-phase speed (idleRate=${idleRate.toFixed(1)}, dashRate=${dashRate.toFixed(1)})`)
    console.log(`PASS run V.c (dashBurst): idleRate=${idleRate.toFixed(1)}px/s dashRate=${dashRate.toFixed(1)}px/s`)
  }

  // (d) acidPool (elite flag): death leaves a pool that damages a standing player and expires.
  {
    const run = createRun(makeMeta())
    run.weapons = [{ id: 'star', level: 3 }]
    run.player.x = 100; run.player.y = 0
    run.player.hp = 1e9; run.player.maxHP = 1e9
    const e = makeStatusEnemy(run, { x: 100, y: 0, hp: 10, speed: 0, elite: true })
    e.flags = ['acidPool']
    run.enemies.push(e)

    let killed = false
    for (let i = 0; i < Math.round(2 / dt) && !killed; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.kills > 0) killed = true
    }
    assert(killed, 'expected the acidPool elite to die')
    assert(run.pools.length > 0, 'expected an acidPool death to leave a pool')
    const pool = run.pools[0]
    assert.strictEqual(pool.r, ACID_R, `expected pool radius ${ACID_R}, got ${pool.r}`)
    assert.strictEqual(pool.dps, ACID_DPS, `expected pool dps ${ACID_DPS}, got ${pool.dps}`)

    const hpBefore = run.player.hp
    let dotHit = false
    for (let i = 0; i < Math.round(1 / dt) && !dotHit; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.events.some((ev) => ev.type === 'hurt' && ev.dot)) dotHit = true
    }
    assert(dotHit, 'expected the acid pool to deal at least one dot-flagged hurt event')
    assert(run.player.hp < hpBefore, `expected the acid pool to damage a standing player (before=${hpBefore}, after=${run.player.hp})`)

    for (let i = 0; i < Math.round((ACID_DUR + 0.5) / dt); i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
    }
    assert.strictEqual(run.pools.length, 0, 'expected the acid pool to expire')
    console.log('PASS run V.d (acidPool): pool damages standing player and expires')
  }

  // (e) soapTrail (elite flag): drops trail nodes into run.pools periodically while alive.
  {
    const run = createRun(makeMeta())
    run.weapons = []
    run.player.x = 5000; run.player.y = 0 // far away: never contacts, never dies
    const e = makeStatusEnemy(run, { x: 0, y: 0, hp: 1e6, speed: 80, elite: true })
    e.flags = ['soapTrail']
    run.enemies.push(e)

    const steps = Math.round(1.5 / dt)
    for (let i = 0; i < steps; i++) stepSim(run, { x: 0, y: 0 }, dt)
    assert(run.pools.length >= 3, `expected a soapTrail elite to leave >= 3 pool nodes over 1.5s, got ${run.pools.length}`)
    for (const p of run.pools) {
      assert.strictEqual(p.r, SOAP_R, `expected soap pool radius ${SOAP_R}, got ${p.r}`)
      assert.strictEqual(p.t <= SOAP_DUR, true, `expected soap pool duration <= ${SOAP_DUR}, got ${p.t}`)
    }
    console.log(`PASS run V.e (soapTrail): nodes=${run.pools.length}`)
  }

  // (f) currents signature: a stationary pond player drifts, a stationary body player never does.
  {
    const pond = createRun(makeMeta(), { chapter: 'pond' })
    pond.weapons = []
    pond.player.x = 0; pond.player.y = 0
    const steps = Math.round(3 / dt)
    for (let i = 0; i < steps; i++) stepSim(pond, { x: 0, y: 0 }, dt)
    const pondDrift = Math.hypot(pond.player.x, pond.player.y)

    const body = createRun(makeMeta())
    body.weapons = []
    body.player.x = 0; body.player.y = 0
    for (let i = 0; i < steps; i++) stepSim(body, { x: 0, y: 0 }, dt)
    const bodyDrift = Math.hypot(body.player.x, body.player.y)

    assert(pondDrift > 20, `expected a stationary pond-run player to drift > 20px over 3s, got ${pondDrift.toFixed(1)}`)
    assert.strictEqual(bodyDrift, 0, `expected a stationary body-run player to never drift (no signature), got ${bodyDrift}`)
    console.log(`PASS run V.f (currents): pondDrift=${pondDrift.toFixed(1)}px bodyDrift=${bodyDrift.toFixed(1)}px`)
  }

  // (f2) currentForce pure query (v5.2, powers the render visualization): nonzero + continuous for
  // a pond run, {0,0} for a body run, and the applied drift == currentForce * dt (same field).
  {
    const pondF = createRun(makeMeta(), { chapter: 'pond' })
    // nonzero somewhere across a few spread world points (a ~55px/s sine-sum field won't vanish everywhere)
    const pts = [[200, 200], [-400, 900], [1500, -600]]
    const maxMag = Math.max(...pts.map(([x, y]) => { const f = currentForce(pondF, x, y); return Math.hypot(f.fx, f.fy) }))
    assert(maxMag > 1, `expected the pond drift field to be nonzero, got maxMag=${maxMag.toFixed(3)}`)
    // continuity: a 1px step barely changes the force (smooth field, no discontinuities)
    const a = currentForce(pondF, 100, 100)
    const b = currentForce(pondF, 101, 100)
    const jump = Math.hypot(a.fx - b.fx, a.fy - b.fy)
    assert(jump < 1, `expected a continuous field (small step -> small change), got jump=${jump.toFixed(4)}`)

    // body run: no currents signature -> exactly the zero vector everywhere
    const bodyF = createRun(makeMeta())
    const bz = currentForce(bodyF, 300, -200)
    assert.strictEqual(bz.fx, 0, `expected body-run currentForce fx=0, got ${bz.fx}`)
    assert.strictEqual(bz.fy, 0, `expected body-run currentForce fy=0, got ${bz.fy}`)

    // the sim applies exactly this field: a lone player's one-frame drift == currentForce * dt.
    const run = createRun(makeMeta(), { chapter: 'pond' })
    run.weapons = []; run.obstacles = []; run.enemies = []
    run.player.x = 123; run.player.y = -456
    const x0 = run.player.x, y0 = run.player.y
    stepSim(run, { x: 0, y: 0 }, dt) // run.time is advanced by the step; sample the field after so it matches
    const f = currentForce(run, x0, y0)
    const dx = run.player.x - x0, dy = run.player.y - y0
    assert(Math.abs(dx - f.fx * dt) < 1e-6 && Math.abs(dy - f.fy * dt) < 1e-6,
      `expected drift == currentForce*dt, got d=(${dx.toFixed(4)},${dy.toFixed(4)}) vs f*dt=(${(f.fx * dt).toFixed(4)},${(f.fy * dt).toFixed(4)})`)
    console.log(`PASS run V.f2 (currentForce): maxMag=${maxMag.toFixed(1)}px/s continuityJump=${jump.toFixed(4)} bodyZero drift==force*dt`)
  }

  // (g) obstacles: pond generates the configured field (no overlaps), body has none, and the
  // player is pushed back out after being steered into one.
  {
    const pond = createRun(makeMeta(), { chapter: 'pond' })
    assert.strictEqual(pond.obstacles.length, CHAPTERS.pond.obstacles.count,
      `expected ${CHAPTERS.pond.obstacles.count} pond obstacles, got ${pond.obstacles.length}`)
    for (let i = 0; i < pond.obstacles.length; i++) {
      for (let j = i + 1; j < pond.obstacles.length; j++) {
        const a = pond.obstacles[i], b = pond.obstacles[j]
        const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r
        assert(gap >= -1e-6, `expected no two pond obstacles to overlap, got gap=${gap}`)
      }
    }
    const body = createRun(makeMeta())
    assert.strictEqual(body.obstacles.length, 0, 'expected a body run to have no obstacles')

    // Push-out: steer a player straight into a nearby (manually placed) obstacle for 1s.
    const run = createRun(makeMeta(), { chapter: 'pond' })
    run.weapons = []
    run.player.x = 0; run.player.y = 0
    const obstacle = { x: 150, y: 0, r: 40 }
    run.obstacles = [obstacle]
    const minSep = obstacle.r + PLAYER.radius
    const steps2 = Math.round(1 / dt)
    for (let i = 0; i < steps2; i++) stepSim(run, { x: 1, y: 0 }, dt)
    const dist = Math.hypot(run.player.x - obstacle.x, run.player.y - obstacle.y)
    assert(dist >= minSep - 0.5, `expected the player pushed out of the obstacle (dist=${dist.toFixed(1)}, min=${minSep.toFixed(1)})`)
    console.log(`PASS run V.g (obstacles): pond count=${pond.obstacles.length} body count=${body.obstacles.length} pushed dist=${dist.toFixed(1)}`)
  }

  console.log('PASS run V (chapter behavior flags, drift currents, field obstacles): latch, split, dashBurst, acidPool, soapTrail, currents, obstacles')
}

// ---- Run W: new pond weapons — Flagella Whip + Toxin Bloom (v5.0 task 4) -----------------
function testPondWeapons() {
  const dt = 1 / 60

  // (a) the whip aims at the NEAREST enemy (v5.1.2 fix), not the player's move direction: the arc
  // locks onto a near enemy in front (it dies), while a far one beyond range stays untouched even
  // after the near one dies (range check excludes it).
  {
    const run = createRun(makeMeta())
    run.weapons = [{ id: 'flagella', level: MAX_WEAPON_LEVEL }]
    run.mods.spawnMul = 0
    run.player.x = 0; run.player.y = 0
    run.player.hp = 1e9; run.player.maxHP = 1e9
    run.player.facingAngle = 0 // moved +x (kiting away) — no longer where the whip aims
    const ahead = makeStatusEnemy(run, { x: 100, y: 0, hp: 20, speed: 0 })
    const farBehind = makeStatusEnemy(run, { x: -500, y: 0, hp: 1e6, speed: 0 }) // beyond range
    run.enemies.push(ahead, farBehind)

    let sawWhip = false
    for (let i = 0; i < Math.round(1.5 / dt); i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      run.player.facingAngle = 0 // pin the (now-irrelevant) move direction
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.events.some((e) => e.type === 'whip')) sawWhip = true
    }
    assert(!run.enemies.find((e) => e.id === ahead.id), 'expected the near in-front enemy to die to the whip')
    const farNow = run.enemies.find((e) => e.id === farBehind.id)
    assert(farNow && farNow.hp === 1e6, `expected the out-of-range enemy untouched (hp ${farNow && farNow.hp})`)
    // (b) whip event emitted, carrying the render fields.
    assert(sawWhip, 'expected at least one whip event')
    console.log('PASS run W.a/b (whip aims at nearest; out-of-range foe untouched + whip event)')
  }

  // (a2) THE FIX: a lone enemy directly BEHIND a player who moved forward is now HIT, because the
  // whip aims at the nearest enemy rather than the move direction (which would swing the arc away).
  {
    const run = createRun(makeMeta())
    run.weapons = [{ id: 'flagella', level: MAX_WEAPON_LEVEL }]
    run.mods.spawnMul = 0
    run.player.x = 0; run.player.y = 0
    run.player.hp = 1e9; run.player.maxHP = 1e9
    run.player.facingAngle = 0 // faces +x, but the only enemy is behind at -x
    const behind = makeStatusEnemy(run, { x: -100, y: 0, hp: 20, speed: 0 })
    run.enemies.push(behind)
    for (let i = 0; i < Math.round(1.5 / dt); i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      run.player.facingAngle = 0
      stepSim(run, { x: 0, y: 0 }, dt)
    }
    assert(!run.enemies.find((e) => e.id === behind.id), 'expected the behind enemy to be hit now the whip aims at nearest')
    console.log('PASS run W.a2 (fix: whip hits an enemy behind the player\'s move direction)')
  }

  // (c) cyclone: every 3rd swing is a full 360°. A never-dying anchor in front keeps the aim locked
  // to +x, so an in-range enemy behind sits OUTSIDE the normal arc and is reached only by cyclone.
  {
    function behindHp(cyclone) {
      const run = createRun(makeMeta())
      run.weapons = [{ id: 'flagella', level: MAX_WEAPON_LEVEL }]
      run.mods.spawnMul = 0
      run.player.x = 0; run.player.y = 0
      run.player.hp = 1e9; run.player.maxHP = 1e9
      if (cyclone) run.weaponMods.flagella.cyclone = 1
      // Anchor (nearest, never dies) pins the aim forward; behind is in range but outside the arc.
      run.enemies.push(makeStatusEnemy(run, { x: 60, y: 0, hp: 1e9, speed: 0 }))
      const behind = makeStatusEnemy(run, { x: -100, y: 0, hp: 1e6, speed: 0 })
      run.enemies.push(behind)
      // Enough time for well past FLAGELLA_CYCLONE_EVERY swings (rate ~0.58s at max level).
      for (let i = 0; i < Math.round((FLAGELLA_CYCLONE_EVERY + 2) * 0.9 / dt); i++) {
        if (run.phase === 'levelup') { declineLevelUp(run); continue }
        stepSim(run, { x: 0, y: 0 }, dt)
      }
      return run.enemies.find((e) => e.id === behind.id).hp
    }
    const withCyclone = behindHp(true)
    const without = behindHp(false)
    assert(without === 1e6, `expected no cyclone to never hit the behind enemy (hp ${without})`)
    assert(withCyclone < 1e6, `expected cyclone's 360° swing to hit the behind enemy (hp ${withCyclone})`)
    console.log(`PASS run W.c (cyclone): behind hp with=${withCyclone.toFixed(0)} without=${without.toFixed(0)}`)
  }

  // (d) bloom: the weapon plants a cloud; a hand-placed cloud expands from 0, ticks dot-flagged
  // damage to enemies inside, and expires at dur.
  {
    // d1: the weapon actually plants a cloud on a nearby enemy within castRange.
    const planter = createRun(makeMeta())
    planter.weapons = [{ id: 'bloom', level: 1 }]
    planter.mods.spawnMul = 0
    planter.player.x = 0; planter.player.y = 0
    planter.player.hp = 1e9; planter.player.maxHP = 1e9
    planter.enemies.push(makeStatusEnemy(planter, { x: 100, y: 0, hp: 1e6, speed: 0 }))
    let planted = false
    for (let i = 0; i < Math.round(4 / dt) && !planted; i++) {
      if (planter.phase === 'levelup') { declineLevelUp(planter); continue }
      stepSim(planter, { x: 0, y: 0 }, dt)
      if (planter.blooms.length > 0) planted = true
    }
    assert(planted, 'expected the bloom weapon to plant a cloud within 4s')

    // d2: lifecycle of a hand-placed cloud — grows, ticks dot-flagged damage, expires.
    const run = createRun(makeMeta())
    run.weapons = [] // no re-planting; isolate this one cloud
    run.mods.spawnMul = 0
    run.player.x = 5000; run.player.y = 0 // far from the cloud/enemies (no contact damage)
    run.player.hp = 1e9; run.player.maxHP = 1e9
    const target = makeStatusEnemy(run, { x: 0, y: 0, hp: 1e6, speed: 0 })
    run.enemies.push(target)
    run.blooms.push({ x: 0, y: 0, r: 0, maxR: 90, t: 0, dur: 3, dmgPerTick: 6 })

    let sawDotHit = false
    let grew = false
    const hpBefore = target.hp
    for (let i = 0; i < Math.round(1.5 / dt); i++) {
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.blooms[0] && run.blooms[0].r > 0) grew = true
      if (run.events.some((e) => e.type === 'hit' && e.dot)) sawDotHit = true
    }
    assert(grew, 'expected the cloud radius to grow from 0')
    assert(sawDotHit, 'expected the bloom to tick dot-flagged hit events')
    assert(target.hp < hpBefore, `expected the bloom to damage an enemy inside it (before=${hpBefore}, after=${target.hp})`)

    // Expiry: step past dur; the cloud is gone (no weapon re-plants).
    for (let i = 0; i < Math.round(3 / dt); i++) stepSim(run, { x: 0, y: 0 }, dt)
    assert.strictEqual(run.blooms.length, 0, 'expected the cloud to expire at dur')
    console.log('PASS run W.d (bloom plants, expands, ticks dot damage, expires)')
  }

  // (e) sporeburst: a foe killed by a (non-mini) cloud emits a mini-cloud; a mini-cloud's own
  // kill emits NOTHING (no chaining).
  {
    // Positive: parent cloud kills an enemy inside -> a _mini cloud appears at SPOREBURST_FRAC size.
    const run = createRun(makeMeta())
    run.weapons = []
    run.mods.spawnMul = 0
    run.weaponMods.bloom.sporeburst = 1
    run.player.x = 5000; run.player.y = 0
    run.player.hp = 1e9; run.player.maxHP = 1e9
    run.enemies.push(makeStatusEnemy(run, { x: 0, y: 0, hp: 5, speed: 0 }))
    run.blooms.push({ x: 0, y: 0, r: 0, maxR: 60, t: 0, dur: 3, dmgPerTick: 100 })
    let miniSeen = null
    for (let i = 0; i < Math.round(1 / dt) && !miniSeen; i++) {
      stepSim(run, { x: 0, y: 0 }, dt)
      miniSeen = run.blooms.find((b) => b._mini)
    }
    assert(miniSeen, 'expected sporeburst to emit a mini-cloud on an in-bloom death')
    assert(Math.abs(miniSeen.maxR - 60 * SPOREBURST_FRAC) < 1e-6, `expected mini maxR ${60 * SPOREBURST_FRAC}, got ${miniSeen.maxR}`)

    // Negative: a _mini cloud that kills an enemy spawns no further cloud (never chains).
    const noChain = createRun(makeMeta())
    noChain.weapons = []
    noChain.mods.spawnMul = 0
    noChain.weaponMods.bloom.sporeburst = 1
    noChain.player.x = 5000; noChain.player.y = 0
    noChain.player.hp = 1e9; noChain.player.maxHP = 1e9
    noChain.enemies.push(makeStatusEnemy(noChain, { x: 0, y: 0, hp: 5, speed: 0 }))
    noChain.blooms.push({ x: 0, y: 0, r: 0, maxR: 40, t: 0, dur: 3, dmgPerTick: 100, _mini: true })
    let maxBlooms = noChain.blooms.length
    for (let i = 0; i < Math.round(1 / dt); i++) {
      stepSim(noChain, { x: 0, y: 0 }, dt)
      maxBlooms = Math.max(maxBlooms, noChain.blooms.length)
    }
    assert.strictEqual(maxBlooms, 1, `expected a mini-cloud kill to spawn no further clouds, saw up to ${maxBlooms}`)
    console.log('PASS run W.e (sporeburst emits a mini-cloud but never chains)')
  }

  // (f) a pond run's mod pool offers ONLY flagella/mines/bloom weapon mods (never a body weapon's).
  {
    const pond = createRun(makeMeta(), { chapter: 'pond' })
    pond.weapons = [{ id: 'flagella', level: 3 }, { id: 'mines', level: 3 }, { id: 'bloom', level: 3 }]
    pond.choiceSlots = 4
    const pondMods = new Set(CHAPTERS.pond.weapons)
    let sawPondMod = false
    for (let i = 0; i < 500; i++) {
      for (const c of buildLevelUpChoices(pond)) {
        if (c.kind !== 'mod') continue
        assert(pondMods.has(c.weapon), `expected only pond weapon mods, got a '${c.weapon}' mod`)
        sawPondMod = true
      }
    }
    assert(sawPondMod, 'expected pond weapon mods to appear over 500 pools')
    console.log('PASS run W.f (pond mod pool offers only pond weapon mods)')
  }

  // (g) mines re-theme is copy-only: the display name is now 'Toxin Cysts'.
  {
    assert.strictEqual(WEAPONS.mines.name, 'Toxin Cysts', `expected mines re-themed to 'Toxin Cysts', got '${WEAPONS.mines.name}'`)
    console.log('PASS run W.g (mines re-themed to Toxin Cysts)')
  }

  // Balance band (run P style, kill-time on a realistic ring — not an immortal-ring DPS race,
  // per the v4.4 lesson): a fully-leveled flagella + 2 mods must clear the ring no slower than
  // 3.5x the pond-median kill-time of the OTHER pond natives (mines, bloom).
  {
    function measureTTK(weaponId, applyMods) {
      const run = createRun(makeMeta()) // body chapter: no currents/obstacles skewing the clear
      run.weapons = [{ id: weaponId, level: MAX_WEAPON_LEVEL }]
      run.mods.spawnMul = 0
      run.player.hp = 1e9; run.player.maxHP = 1e9
      if (applyMods) applyMods(run)
      const N = 14, radius = 150, hp = 50
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2
        run.enemies.push(makeStatusEnemy(run, { x: Math.cos(a) * radius, y: Math.sin(a) * radius, hp, speed: 45 }))
      }
      let t = 0
      const cap = 60
      for (let i = 0; i < Math.round(cap / dt); i++) {
        if (run.phase === 'levelup') { declineLevelUp(run); continue }
        t += dt
        run.player.x = 0; run.player.y = 0        // pin: enemies converge on the origin
        stepSim(run, { x: 0, y: 0 }, dt)          // whip auto-aims at the nearest of the ring
        if (run.enemies.length === 0) return t
      }
      return cap
    }
    const flagellaTTK = measureTTK('flagella', (r) => { r.weaponMods.flagella.heavyLash = 0.40; r.weaponMods.flagella.barbed = 0.50 })
    const minesTTK = measureTTK('mines', (r) => { r.weaponMods.mines.heavyCharge = 0.20; r.weaponMods.mines.bigBoom = 0.20 })
    const bloomTTK = measureTTK('bloom', (r) => { r.weaponMods.bloom.virulent = 0.35; r.weaponMods.bloom.quickCast = 0.25 })
    const others = [minesTTK, bloomTTK].sort((a, b) => a - b)
    const median = others[Math.floor(others.length / 2)]
    assert(flagellaTTK < 60, `expected flagella to clear the ring within the cap, got ${flagellaTTK.toFixed(1)}s`)
    assert(flagellaTTK <= median * 3.5, `expected flagella kill-time within 3.5x the pond-median (flagella=${flagellaTTK.toFixed(1)}s, median=${median.toFixed(1)}s, ratio=${(flagellaTTK / median).toFixed(2)})`)
    console.log(`PASS run W (balance band): flagellaTTK=${flagellaTTK.toFixed(1)}s minesTTK=${minesTTK.toFixed(1)}s bloomTTK=${bloomTTK.toFixed(1)}s ratio=${(flagellaTTK / median).toFixed(2)}x`)
  }
}

// ---- Run X: garden roster flags + Stinger/Pheromone Lure weapons (v5.3) ------------------
function testGarden() {
  const dt = 1 / 60

  // (a) trailFollow: a garden ant standing near a live pheromone node moves faster (accelerates on
  // the trail) than the same ant with no node nearby — gated on the chapter's pheromones signature.
  {
    function antDist(withTrail) {
      const run = createRun(makeMeta(), { chapter: 'garden' })
      run.weapons = []; run.obstacles = []; run.mods.spawnMul = 0
      run.player.x = 2000; run.player.y = 0 // far away: a fixed +x seek direction, never contacts
      const e = makeStatusEnemy(run, { x: 0, y: 0, hp: 1e6, speed: 100 })
      e.flags = ['trailFollow']
      run.enemies.push(e)
      if (withTrail) run.trails.push({ x: 0, y: 0, t: 10 }) // node right on the ant (stays in range)
      const x0 = e.x
      for (let i = 0; i < Math.round(0.3 / dt); i++) stepSim(run, { x: 0, y: 0 }, dt)
      return run.enemies.find((en) => en.id === e.id).x - x0
    }
    const withT = antDist(true)
    const without = antDist(false)
    assert(withT > without * 1.2, `expected an ant on a pheromone trail to accelerate (withTrail=${withT.toFixed(1)}, without=${without.toFixed(1)})`)
    console.log(`PASS run X.a (trailFollow): withTrail=${withT.toFixed(1)}px without=${without.toFixed(1)}px`)
  }

  // (b) diveBomb: a wasp's displacement during its dive window far exceeds its hover window.
  {
    const run = createRun(makeMeta(), { chapter: 'garden' })
    run.weapons = []; run.obstacles = []; run.mods.spawnMul = 0
    run.player.x = 3000; run.player.y = 0
    run.player.hp = 1e9; run.player.maxHP = 1e9
    const e = makeStatusEnemy(run, { x: 3000 - DIVE_STANDOFF, y: 0, hp: 1e6, speed: 120 }) // starts at standoff
    e.flags = ['diveBomb']
    run.enemies.push(e)

    const hoverStart = { x: e.x, y: e.y }
    for (let i = 0; i < Math.round(DIVE_HOVER_T / dt); i++) stepSim(run, { x: 0, y: 0 }, dt)
    const afterHover = run.enemies.find((en) => en.id === e.id)
    const hoverDist = Math.hypot(afterHover.x - hoverStart.x, afterHover.y - hoverStart.y)

    // advance through the telegraph pause into the dive
    for (let i = 0; i < Math.round((DIVE_TELEGRAPH_T + 0.02) / dt); i++) stepSim(run, { x: 0, y: 0 }, dt)
    const diveStart = { x: afterHover.x, y: afterHover.y }
    for (let i = 0; i < Math.round(DIVE_T / dt); i++) stepSim(run, { x: 0, y: 0 }, dt)
    const afterDive = run.enemies.find((en) => en.id === e.id)
    const diveDist = Math.hypot(afterDive.x - diveStart.x, afterDive.y - diveStart.y)

    assert(hoverDist < 10, `expected a wasp at standoff to hover nearly in place, moved ${hoverDist.toFixed(1)}px`)
    assert(diveDist > hoverDist * 3 && diveDist > 80, `expected the dive window to displace far more than hover (hover=${hoverDist.toFixed(1)}, dive=${diveDist.toFixed(1)})`)
    console.log(`PASS run X.b (diveBomb): hoverDist=${hoverDist.toFixed(1)}px diveDist=${diveDist.toFixed(1)}px`)
  }

  // (c) webZone: a player standing in a web moves slower; the web slow STACKS with the latch debuff
  // via a MIN (the stronger of the two multipliers wins — LATCH_SLOW_MUL < WEB_SLOW_MUL, so both == latch).
  {
    function moveDist(setup) {
      const run = createRun(makeMeta(), { chapter: 'garden' })
      run.weapons = []; run.obstacles = []; run.mods.spawnMul = 0
      run.player.x = 0; run.player.y = 0
      setup(run)
      stepSim(run, { x: 1, y: 0 }, dt)
      return Math.hypot(run.player.x, run.player.y)
    }
    const plain = moveDist(() => {})
    const web = moveDist((r) => r.webs.push({ x: 0, y: 0, r: 72, t: 10 }))
    const latch = moveDist((r) => { r.player.slowT = LATCH_SLOW_T })
    const both = moveDist((r) => { r.webs.push({ x: 0, y: 0, r: 72, t: 10 }); r.player.slowT = LATCH_SLOW_T })
    assert(web < plain, `expected a web to slow the player (web=${web.toFixed(2)}, plain=${plain.toFixed(2)})`)
    assert(both <= web + 1e-9, `expected latch+web to be no faster than web alone (min-mul stack): both=${both.toFixed(3)}, web=${web.toFixed(3)}`)
    assert(Math.abs(both - latch) < 1e-6, `expected latch+web == latch alone (the stronger slow wins): both=${both.toFixed(3)}, latch=${latch.toFixed(3)}`)
    console.log(`PASS run X.c (webZone): plain=${plain.toFixed(2)} web=${web.toFixed(2)} latch=${latch.toFixed(2)} both=${both.toFixed(2)}`)
  }

  // (d) sprayStrip: a marked strip deals NO damage during its fuse (telegraph), then dot-flagged
  // damage to the player standing inside it once the fuse elapses.
  {
    const run = createRun(makeMeta(), { chapter: 'garden' })
    run.weapons = []; run.obstacles = []; run.mods.spawnMul = 0
    run.player.x = 0; run.player.y = 0
    run.player.hp = 1e9; run.player.maxHP = 1e9
    run.strips.push({ x: 0, y: 0, angle: 0, len: SPRAY_LEN, w: SPRAY_W, fuse: SPRAY_FUSE, t: SPRAY_ACTIVE, dps: SPRAY_DPS })

    let hurtDuringFuse = false
    for (let i = 0; i < Math.round((SPRAY_FUSE - 0.05) / dt); i++) {
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.events.some((e) => e.type === 'hurt')) hurtDuringFuse = true
    }
    assert(!hurtDuringFuse, 'expected no damage during the spray strip telegraph (fuse)')
    const hpAfterFuse = run.player.hp

    let dotHurt = false
    for (let i = 0; i < Math.round((SPRAY_FUSE + 0.6) / dt) && !dotHurt; i++) {
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.events.some((e) => e.type === 'hurt' && e.dot)) dotHurt = true
    }
    assert(dotHurt, 'expected the live spray strip to deal dot-flagged damage after the fuse')
    assert(run.player.hp < hpAfterFuse, `expected the live strip to damage the standing player (before=${hpAfterFuse}, after=${run.player.hp})`)
    console.log('PASS run X.d (sprayStrip): no damage during fuse, dot damage after')
  }

  // (e) Pheromone Lure: an enemy inside a lure's aggro radius paths toward the DECOY (away from the
  // player), and the lure's burst damages a nearby enemy + emits an explode event (+ stickyScent web).
  {
    function enemyDx(withLure) {
      const run = createRun(makeMeta(), { chapter: 'garden' })
      run.weapons = []; run.obstacles = []; run.mods.spawnMul = 0
      run.player.x = 500; run.player.y = 0 // player to the +x; the lure sits to the -x
      const e = makeStatusEnemy(run, { x: 0, y: 0, hp: 1e6, speed: 100 })
      run.enemies.push(e)
      if (withLure) run.lures.push({ x: -150, y: 0, t: 0, dur: 10, aggro: 250, burstR: 100, burstDmg: 10, sticky: false })
      const x0 = e.x
      for (let i = 0; i < Math.round(0.3 / dt); i++) stepSim(run, { x: 0, y: 0 }, dt)
      return run.enemies.find((en) => en.id === e.id).x - x0
    }
    const lured = enemyDx(true)
    const normal = enemyDx(false)
    assert(normal > 0, `expected an un-lured enemy to move toward the player (+x), got dx=${normal.toFixed(1)}`)
    assert(lured < 0, `expected a lured enemy to move toward the decoy (-x), got dx=${lured.toFixed(1)}`)

    // burst: a decoy expiring damages a nearby enemy and emits an explode; stickyScent leaves a web.
    const burst = createRun(makeMeta(), { chapter: 'garden' })
    burst.weapons = []; burst.obstacles = []; burst.mods.spawnMul = 0
    burst.player.x = 3000; burst.player.y = 0; burst.player.hp = 1e9; burst.player.maxHP = 1e9
    const victim = makeStatusEnemy(burst, { x: 0, y: 0, hp: 500, speed: 0 })
    burst.enemies.push(victim)
    burst.lures.push({ x: 0, y: 0, t: 0, dur: 0.25, aggro: 10, burstR: 100, burstDmg: 200, sticky: true })
    const hp0 = victim.hp
    let exploded = false
    for (let i = 0; i < Math.round(0.6 / dt); i++) {
      stepSim(burst, { x: 0, y: 0 }, dt)
      if (burst.events.some((ev) => ev.type === 'explode')) exploded = true
    }
    assert(exploded, 'expected a lure burst to emit an explode event')
    assert(victim.hp < hp0, `expected the lure burst to damage the nearby enemy (before=${hp0}, after=${victim.hp})`)
    assert(burst.webs.length > 0, 'expected stickyScent to leave a web slow zone on burst')
    console.log(`PASS run X.e (lure): luredDx=${lured.toFixed(1)} normalDx=${normal.toFixed(1)}, burst damages + sticky web`)
  }

  // (f) Stinger: a volley fires `count` needles in a tight cone (each pierce 1, tagged 'stinger');
  // the hive mod makes every 4th volley fire in all directions (reaching a foe outside the cone).
  {
    const run = createRun(makeMeta(), { chapter: 'garden' })
    run.weapons = [{ id: 'stinger', level: MAX_WEAPON_LEVEL }]
    run.obstacles = []; run.mods.spawnMul = 0
    run.player.x = 0; run.player.y = 0; run.player.hp = 1e9; run.player.maxHP = 1e9
    run.enemies.push(makeStatusEnemy(run, { x: 200, y: 0, hp: 1e6, speed: 0 }))
    const lvl = WEAPONS.stinger.levels[MAX_WEAPON_LEVEL - 1]
    let volley = []
    for (let i = 0; i < Math.round(2 / dt) && volley.length === 0; i++) {
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.bullets.length > 0) volley = run.bullets.slice()
    }
    assert.strictEqual(volley.length, lvl.count, `expected a volley of ${lvl.count} needles, got ${volley.length}`)
    for (const b of volley) {
      const ang = Math.atan2(b.vy, b.vx)
      assert(Math.abs(ang) <= lvl.spread + 1e-6, `expected each needle within the ±${lvl.spread} cone, got angle ${ang.toFixed(3)}`)
      assert.strictEqual(b.pierce, 1, 'expected needle base pierce 1')
      assert.strictEqual(b.weapon, 'stinger', 'expected the needle tagged weapon:stinger')
    }
    console.log(`PASS run X.f1 (stinger cone): ${volley.length} needles within ±${lvl.spread}rad, pierce 1`)

    // hive: an enemy well outside the cone (pinned there by a nearer anchor) is only reached by the
    // every-4th-volley all-directions burst.
    function behindHp(hive) {
      const r = createRun(makeMeta(), { chapter: 'garden' })
      r.weapons = [{ id: 'stinger', level: MAX_WEAPON_LEVEL }]
      r.obstacles = []; r.mods.spawnMul = 0
      r.player.x = 0; r.player.y = 0; r.player.hp = 1e9; r.player.maxHP = 1e9
      if (hive) r.weaponMods.stinger.hive = 1
      r.enemies.push(makeStatusEnemy(r, { x: 80, y: 0, hp: 1e9, speed: 0 })) // anchor: nearest, pins aim +x
      const behind = makeStatusEnemy(r, { x: -140, y: 0, hp: 1e6, speed: 0 })
      behind.radius = 100 // big enough that an all-directions needle passing left reaches it
      r.enemies.push(behind)
      for (let i = 0; i < Math.round((STINGER_HIVE_EVERY + 2) * 0.7 / dt); i++) stepSim(r, { x: 0, y: 0 }, dt)
      return r.enemies.find((e) => e.id === behind.id).hp
    }
    const withHive = behindHp(true)
    const without = behindHp(false)
    assert(without === 1e6, `expected no hive to never reach the behind enemy (hp ${without})`)
    assert(withHive < 1e6, `expected hive's all-directions volley to reach the behind enemy (hp ${withHive})`)
    console.log(`PASS run X.f2 (hive): behind hp with=${withHive.toFixed(0)} without=${without.toFixed(0)}`)
  }

  // (g) A garden run's level-up pool offers ONLY its natives (boomerang/stinger/lure) as weapon
  // AND mod cards — the flip side of run U.c / run W.f, extended to the garden pool.
  {
    const allowed = new Set(CHAPTERS.garden.weapons)
    const garden = createRun(makeMeta(), { chapter: 'garden' })
    garden.choiceSlots = 4
    let sawWeapon = false
    for (let i = 0; i < 500; i++) {
      for (const c of buildLevelUpChoices(garden)) {
        if (c.kind !== 'weapon') continue
        sawWeapon = true
        assert(allowed.has(c.id), `expected a garden run to only offer its natives, got weapon '${c.id}'`)
      }
    }
    assert(sawWeapon, 'expected at least one weapon card over 500 garden pools')

    const g2 = createRun(makeMeta(), { chapter: 'garden' })
    g2.weapons = [{ id: 'boomerang', level: 3 }, { id: 'stinger', level: 3 }, { id: 'lure', level: 3 }]
    g2.choiceSlots = 4
    let sawMod = false
    for (let i = 0; i < 500; i++) {
      for (const c of buildLevelUpChoices(g2)) {
        if (c.kind !== 'mod') continue
        assert(allowed.has(c.weapon), `expected only garden weapon mods, got a '${c.weapon}' mod`)
        sawMod = true
      }
    }
    assert(sawMod, 'expected garden weapon mods to appear over 500 pools')
    console.log('PASS run X.g (garden pool offers only boomerang/stinger/lure weapons + mods)')
  }

  // (h) garden sits after pond in the arc and the Daily can land on it (a preview day).
  {
    assert(CHAPTER_ORDER.includes('garden'), 'expected garden in CHAPTER_ORDER')
    assert.strictEqual(nextChapter('pond'), 'garden', "expected nextChapter('pond') === 'garden'")
    let dailyHitGarden = false
    for (let d = 1; d <= 60 && !dailyHitGarden; d++) {
      if (dailyChapter(`2026-09-${String(((d - 1) % 30) + 1).padStart(2, '0')}`) === 'garden') dailyHitGarden = true
    }
    assert(dailyHitGarden, 'expected the Daily Anomaly to land on garden over a spread of dates')
    console.log('PASS run X.h (garden in arc + daily reachable)')
  }

  // Balance band (run W style): a fully-leveled Stinger + 2 mods clears a realistic converging ring
  // no slower than 3.5x the garden-median kill-time of the other natives (Leaf Blade, Pheromone Lure).
  {
    function measureTTK(weaponId, applyMods) {
      const run = createRun(makeMeta()) // body chapter: no garden obstacles/pheromones skewing the clear
      run.weapons = [{ id: weaponId, level: MAX_WEAPON_LEVEL }]
      run.mods.spawnMul = 0
      run.player.hp = 1e9; run.player.maxHP = 1e9
      if (applyMods) applyMods(run)
      const N = 14, radius = 150, hp = 50
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2
        run.enemies.push(makeStatusEnemy(run, { x: Math.cos(a) * radius, y: Math.sin(a) * radius, hp, speed: 45 }))
      }
      let t = 0
      const cap = 60
      for (let i = 0; i < Math.round(cap / dt); i++) {
        if (run.phase === 'levelup') { declineLevelUp(run); continue }
        t += dt
        run.player.x = 0; run.player.y = 0 // pin: enemies converge on the origin
        stepSim(run, { x: 0, y: 0 }, dt)
        if (run.enemies.length === 0) return t
      }
      return cap
    }
    const leafTTK = measureTTK('boomerang', (r) => { r.weaponMods.boomerang.heavyBlade = 0.20; r.weaponMods.boomerang.longThrow = 0.20 })
    const stingerTTK = measureTTK('stinger', (r) => { r.weaponMods.stinger.sharper = 0.25; r.weaponMods.stinger.volley = 2 })
    const lureTTK = measureTTK('lure', (r) => { r.weaponMods.lure.bigBurst = 0.30; r.weaponMods.lure.widerTaunt = 0.30 })
    const others = [leafTTK, lureTTK].sort((a, b) => a - b)
    const median = others[Math.floor(others.length / 2)]
    assert(stingerTTK < 60, `expected stinger to clear the ring within the cap, got ${stingerTTK.toFixed(1)}s`)
    assert(stingerTTK <= median * 3.5, `expected stinger kill-time within 3.5x the garden-median (stinger=${stingerTTK.toFixed(1)}s, median=${median.toFixed(1)}s, ratio=${(stingerTTK / median).toFixed(2)})`)
    console.log(`PASS run X (balance band): leafTTK=${leafTTK.toFixed(1)}s stingerTTK=${stingerTTK.toFixed(1)}s lureTTK=${lureTTK.toFixed(1)}s ratio=${(stingerTTK / median).toFixed(2)}x`)
  }
}

// ---- Run Y: v5.4 behavior flags (undergrowth/city/skies/beyond rosters) ------------------
// One focused check per flag that carries phase state, in run V/X's idiom: drive the machine for a
// known window and assert the phase it should be in actually behaves differently from its neighbour.
function testV54Flags() {
  const dt = 1 / 60

  // Spawns one flagged enemy into a quiet run (no spawns, no weapons, immortal player) so the only
  // thing moving is the machine under test. `at` is its distance from the player along -x.
  function flagRun(chapter, flags, { at = 300, speed = 100, hp = 1e6, elite = false } = {}) {
    const run = createRun(makeMeta(), { chapter })
    run.weapons = []; run.obstacles = []; run.mods.spawnMul = 0
    run.player.x = 0; run.player.y = 0
    run.player.hp = 1e9; run.player.maxHP = 1e9
    const e = makeStatusEnemy(run, { x: -at, y: 0, hp, speed, elite })
    e.flags = flags
    run.enemies.push(e)
    return { run, e }
  }
  // Displacement of `e` over `seconds` of stepping.
  function moved(run, e, seconds) {
    const x0 = e.x, y0 = e.y
    for (let i = 0; i < Math.round(seconds / dt); i++) stepSim(run, { x: 0, y: 0 }, dt)
    return Math.hypot(e.x - x0, e.y - y0)
  }

  // (a) pounce: a cat inside POUNCE_RANGE stops dead for the aim telegraph, then leaps far — and
  // the 'land' window that follows is a punish window (frozen AND unable to deal contact damage).
  {
    const { run, e } = flagRun('undergrowth', ['pounce'], { at: POUNCE_RANGE - 40 })
    stepSim(run, { x: 0, y: 0 }, dt) // first step: in range -> 'aim'
    assert.strictEqual(e._pounceState, 'aim', `expected a cat in range to enter 'aim', got '${e._pounceState}'`)
    const aimDist = moved(run, e, POUNCE_AIM_T - 0.05)
    const leapDist = moved(run, e, POUNCE_LEAP_T + 0.1) // +0.1: past the leap, into the land window
    assert(aimDist < 1, `expected the aim telegraph to be a dead stop, moved ${aimDist.toFixed(2)}px`)
    assert(leapDist > 100, `expected the leap to cover ground, moved ${leapDist.toFixed(1)}px`)
    assert.strictEqual(e._pounceState, 'land', `expected 'land' after the leap, got '${e._pounceState}'`)

    // land: parked on top of the player, it still can't hurt them (that's the free-hits window).
    e.x = run.player.x; e.y = run.player.y
    run.player.invuln = 0
    const hp0 = run.player.hp
    for (let i = 0; i < Math.round((POUNCE_LAND_T - 0.05) / dt); i++) stepSim(run, { x: 0, y: 0 }, dt)
    assert.strictEqual(run.player.hp, hp0, 'expected a landed cat to deal no contact damage')
    console.log(`PASS run Y.a (pounce): aim=${aimDist.toFixed(2)}px leap=${leapDist.toFixed(1)}px, land deals no contact damage`)
  }

  // (b) aerialStrike: an owl is UNTOUCHABLE while circling overhead (AERIAL_UNTOUCHABLE) — no
  // damage in or out — and only becomes fightable once it marks and drops.
  {
    const run = createRun(makeMeta(), { chapter: 'undergrowth' })
    run.weapons = [{ id: 'star', level: MAX_WEAPON_LEVEL }]
    run.obstacles = []; run.mods.spawnMul = 0; run.traps = []
    run.player.x = 0; run.player.y = 0; run.player.hp = 1e9; run.player.maxHP = 1e9
    const owl = makeStatusEnemy(run, { x: 100, y: 0, hp: 1e6, speed: 100 })
    owl.flags = ['aerialStrike']
    run.enemies.push(owl)

    for (let i = 0; i < Math.round((AERIAL_CIRCLE_T - 0.1) / dt); i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
    }
    assert.strictEqual(owl._airState, 'circle', `expected the owl still circling, got '${owl._airState}'`)
    assert.strictEqual(owl.hp, 1e6, `expected a circling owl to take NO damage, hp=${owl.hp}`)
    const hp0 = run.player.hp
    owl.x = run.player.x; owl.y = run.player.y // overhead, right on the player: still harmless
    run.player.invuln = 0
    stepSim(run, { x: 0, y: 0 }, dt)
    assert.strictEqual(run.player.hp, hp0, 'expected a circling owl to deal NO contact damage')

    // ...through mark and into the strike, where it IS fightable.
    for (let i = 0; i < Math.round((AERIAL_MARK_T + AERIAL_STRIKE_T + 0.4) / dt); i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
    }
    assert(owl.hp < 1e6, `expected a marking/striking owl to be hittable, hp=${owl.hp}`)
    console.log(`PASS run Y.b (aerialStrike): untouchable while circling, hittable once it drops (hp=${owl.hp.toFixed(0)})`)
  }

  // (c) lineCharge: a vacuum lines up, stops for the lock telegraph, then charges much further.
  {
    const { run, e } = flagRun('city', ['lineCharge'], { at: LINE_CHARGE_RANGE - 40 })
    run._laneAcc = 1e6 // park the traffic signature: this case is about the flag alone
    stepSim(run, { x: 0, y: 0 }, dt)
    assert.strictEqual(e._chargeState, 'lock', `expected a vacuum in range to 'lock', got '${e._chargeState}'`)
    const lockDist = moved(run, e, LINE_CHARGE_LOCK_T - 0.05)
    const chargeDist = moved(run, e, LINE_CHARGE_T + 0.1) // +0.1: past the charge, into the stall
    assert(lockDist < 1, `expected the lock telegraph to be a dead stop, moved ${lockDist.toFixed(2)}px`)
    assert(chargeDist > lockDist * 10 && chargeDist > 200, `expected the charge to be a rush (lock=${lockDist.toFixed(1)}, charge=${chargeDist.toFixed(1)})`)
    assert.strictEqual(e._chargeState, 'stall', `expected 'stall' after the charge, got '${e._chargeState}'`)
    console.log(`PASS run Y.c (lineCharge): lock=${lockDist.toFixed(2)}px charge=${chargeDist.toFixed(1)}px`)
  }

  // (d) spawner: a van elite disgorges the chapter's 'fast' archetype through the normal spawn
  // path — non-elite, correctly skinned — and never pushes past MAX_ALIVE.
  {
    const { run, e } = flagRun('city', ['spawner'], { at: 400, elite: true })
    run._laneAcc = 1e6
    const before = run.enemies.length
    for (let i = 0; i < Math.round((SPAWNER_INTERVAL + 0.2) / dt); i++) stepSim(run, { x: 0, y: 0 }, dt)
    const spawned = run.enemies.filter((en) => en.id !== e.id)
    assert.strictEqual(run.enemies.length - before, SPAWNER_COUNT, `expected ${SPAWNER_COUNT} spawns, got ${run.enemies.length - before}`)
    for (const s of spawned) {
      assert.strictEqual(s.elite, false, 'expected spawned minions to never be elites')
      // The van disgorges the chapter's SPAWNER_ARCHETYPE through the normal spawnEnemy path, so it
      // hands it that archetype's spawn TYPE (see ARCHETYPE_TYPE in config.js).
      // NOTE (pre-existing, v5.0, deliberately not fixed here): spawnEnemy maps the spawn type BACK
      // to an archetype with `ARCHETYPE_TYPE[type]` — but ARCHETYPE_TYPE is keyed by ARCHETYPE, not
      // type, so the lookup misses for drone/wisp and every 'fast' roster entry falls back to the
      // 'normal' skin. That's why this asserts the type (what the spawner controls) rather than
      // rosterId. Repairing the lookup would re-roll every shipped chapter's roster distribution.
      assert.strictEqual(s.type, ARCHETYPE_TYPE[SPAWNER_ARCHETYPE], `expected the chapter's '${SPAWNER_ARCHETYPE}' archetype spawn type, got '${s.type}'`)
      assert(Math.hypot(s.x - e.x, s.y - e.y) <= SPAWNER_SCATTER + 1e-6, 'expected minions scattered around the van')
    }
    assert(run.events.some((ev) => ev.type === 'explode'), 'expected each spawn point to pop an explode event')
    console.log(`PASS run Y.d (spawner): ${spawned.length} × type '${spawned[0].type}' (non-elite) around the van`)
  }

  // (e) strafe: a jet banks out to its standoff, then flies a straight pass — the run window
  // covers far more ground than the bank, and it ends up PAST the player, not on them.
  {
    const { run, e } = flagRun('skies', ['strafe'], { at: 500 })
    const bankDist = moved(run, e, STRAFE_BANK_T)
    assert.strictEqual(e._strafeState, 'run', `expected 'run' after the bank, got '${e._strafeState}'`)
    const runDist = moved(run, e, STRAFE_RUN_T)
    assert(runDist > bankDist * 2, `expected the strafing run to outpace the bank (bank=${bankDist.toFixed(1)}, run=${runDist.toFixed(1)})`)
    console.log(`PASS run Y.e (strafe): bank=${bankDist.toFixed(1)}px run=${runDist.toFixed(1)}px`)
  }

  // (f) missileVolley: a helicopter holds its standoff and fires MISSILE_COUNT run.enemyShots per
  // volley; a missile that reaches the player damages the PLAYER (and nothing else).
  {
    const { run } = flagRun('skies', ['missileVolley'], { at: 300 })
    for (let i = 0; i < Math.round((MISSILE_INTERVAL + 0.6) / dt); i++) stepSim(run, { x: 0, y: 0 }, dt)
    assert(run.enemyShots.length >= MISSILE_COUNT, `expected a volley of ${MISSILE_COUNT} missiles, got ${run.enemyShots.length}`)

    const hit = createRun(makeMeta(), { chapter: 'skies' })
    hit.weapons = []; hit.obstacles = []; hit.mods.spawnMul = 0
    hit.player.x = 0; hit.player.y = 0; hit.player.hp = 1e9; hit.player.maxHP = 1e9; hit.player.invuln = 0
    const victim = makeStatusEnemy(hit, { x: 0, y: 0, hp: 1e6, speed: 0 })
    hit.enemies.push(victim)
    hit.enemyShots.push({ x: 40, y: 0, vx: -240, vy: 0, r: MISSILE_R, dmg: MISSILE_DMG, life: 4, turnRate: 1.6 })
    const hp0 = hit.player.hp
    let exploded = false
    for (let i = 0; i < Math.round(0.5 / dt); i++) {
      stepSim(hit, { x: 0, y: 0 }, dt)
      if (hit.events.some((ev) => ev.type === 'explode')) exploded = true
    }
    assert(hit.player.hp < hp0, 'expected a missile to damage the player')
    assert(exploded, 'expected a missile impact to emit an explode event')
    assert.strictEqual(victim.hp, 1e6, 'expected an enemy missile to never damage enemies')
    assert.strictEqual(hit.enemyShots.length, 0, 'expected the missile consumed on impact')
    console.log('PASS run Y.f (missileVolley): volley fired, missile hurts the player only')
  }

  // (g) artillery: a tank column shells the player's PREDICTED position (velocity × ARTILLERY_LEAD)
  // into run.bombs — the shared volatile-bomb array, so the blast damages BOTH sides. Elites shell
  // wider (ARTILLERY_ELITE_RADIUS).
  {
    const { run } = flagRun('skies', ['artillery'], { at: 600, speed: 20 })
    run._bombardAcc = 1e6 // park the bombardment signature: this case is about the flag's own shells
    // Break on the FIRING frame: the shell is pushed after stepPlayerMovement, so the player's
    // position/velocity at the end of that frame are exactly the ones it aimed with.
    for (let i = 0; i < Math.round((ARTILLERY_INTERVAL + 0.5) / dt) && run.bombs.length === 0; i++) {
      stepSim(run, { x: 1, y: 0 }, dt)
    }
    const shell = run.bombs.find((b) => b.radius === ARTILLERY_RADIUS)
    assert(shell, `expected an artillery shell of radius ${ARTILLERY_RADIUS}, got ${run.bombs.map((b) => b.radius)}`)
    const lead = shell.x - run.player.x
    assert(Math.abs(lead - run.player.vx * ARTILLERY_LEAD) < 1e-6,
      `expected the shell led by vx*${ARTILLERY_LEAD} (=${(run.player.vx * ARTILLERY_LEAD).toFixed(1)}), got ${lead.toFixed(1)}`)
    assert(lead > 0, 'expected the shell aimed AHEAD of a player moving +x')

    const el = flagRun('skies', ['artillery'], { at: 600, speed: 20, elite: true })
    el.run._bombardAcc = 1e6 // park the bombardment signature: this is about the elite's own shells
    for (let i = 0; i < Math.round(2.0 / dt); i++) stepSim(el.run, { x: 0, y: 0 }, dt)
    assert(el.run.bombs.some((b) => b.radius === ARTILLERY_ELITE_RADIUS), 'expected an AA elite to shell with the wider elite radius')
    console.log(`PASS run Y.g (artillery): shell led ${lead.toFixed(1)}px ahead; elites shell wider`)
  }

  // (h) blink: a blinker teleports toward the player — never landing closer than BLINK_MIN_DIST,
  // and never inside an obstacle (it gives up rather than cheating through one).
  {
    const { run, e } = flagRun('beyond', ['blink'], { at: 600, speed: 40 })
    const x0 = e.x
    for (let i = 0; i < Math.round((BLINK_INTERVAL + 0.05) / dt); i++) stepSim(run, { x: 0, y: 0 }, dt)
    const jumped = e.x - x0
    assert(jumped > BLINK_DIST * 0.9, `expected a ~${BLINK_DIST}px blink toward the player, got ${jumped.toFixed(1)}px`)

    // Clamp: from just outside BLINK_MIN_DIST it may only close the remaining gap, never overshoot.
    const near = flagRun('beyond', ['blink'], { at: BLINK_MIN_DIST + 60, speed: 0 })
    for (let i = 0; i < Math.round((BLINK_INTERVAL + 0.05) / dt); i++) stepSim(near.run, { x: 0, y: 0 }, dt)
    const dist = Math.hypot(near.e.x - near.run.player.x, near.e.y - near.run.player.y)
    assert(dist >= BLINK_MIN_DIST - 1e-6, `expected a blink never to land closer than ${BLINK_MIN_DIST}, got ${dist.toFixed(1)}`)

    // Obstacle: block both the full-distance and the half-distance landing spots -> no blink at all.
    const walled = flagRun('beyond', ['blink'], { at: 600, speed: 0 })
    walled.run.obstacles = [
      { x: -600 + BLINK_DIST, y: 0, r: 60 },
      { x: -600 + BLINK_DIST / 2, y: 0, r: 60 },
    ]
    const wx0 = walled.e.x
    for (let i = 0; i < Math.round((BLINK_INTERVAL + 0.05) / dt); i++) stepSim(walled.run, { x: 0, y: 0 }, dt)
    assert(Math.abs(walled.e.x - wx0) < 1, `expected a blocked blink to be skipped entirely, moved ${(walled.e.x - wx0).toFixed(1)}px`)
    console.log(`PASS run Y.h (blink): jumped ${jumped.toFixed(0)}px, clamped at ${dist.toFixed(0)}px, blocked by obstacles`)
  }

  // (i) phase: a ghosted flicker takes NO damage and deals none; a solid one is an ordinary enemy.
  {
    const run = createRun(makeMeta(), { chapter: 'beyond' })
    run.weapons = [{ id: 'star', level: MAX_WEAPON_LEVEL }]
    run.obstacles = []; run.wells = []; run.mods.spawnMul = 0
    run.player.x = 0; run.player.y = 0; run.player.hp = 1e9; run.player.maxHP = 1e9
    const e = makeStatusEnemy(run, { x: 120, y: 0, hp: 1e6, speed: 0 })
    e.flags = ['phase']
    run.enemies.push(e)

    stepSim(run, { x: 0, y: 0 }, dt)
    e._phaseSolid = false; e._phaseT = PHASE_SOLID_T // force the ghost window
    const ghostHp0 = e.hp
    for (let i = 0; i < Math.round(0.8 / dt); i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      e._phaseSolid = false // pin the window open for the measurement
    }
    assert.strictEqual(e.hp, ghostHp0, `expected a ghosted flicker to take no damage, hp ${ghostHp0} -> ${e.hp}`)

    e._phaseSolid = true
    for (let i = 0; i < Math.round(0.8 / dt); i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      e._phaseSolid = true
    }
    assert(e.hp < ghostHp0, `expected a solid flicker to take damage, hp=${e.hp}`)
    console.log(`PASS run Y.i (phase): ghost immune (hp=${ghostHp0}), solid hittable (hp=${e.hp.toFixed(0)})`)
  }

  // (j) pullBeam: a UFO's beam drags the player in and ticks dot damage — but at PULL_BEAM_FORCE
  // (< PLAYER.baseSpeed), so walking away still nets outward movement. That's the whole design.
  {
    const { run, e } = flagRun('beyond', ['pullBeam'], { at: -200, speed: 0, elite: true }) // UFO at +200
    run.wells = []
    e.x = 200; e.y = 0
    let dragged = false
    let dotHurt = false
    for (let i = 0; i < Math.round((PULL_BEAM_INTERVAL + 0.5) / dt); i++) {
      const x0 = run.player.x
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.player.x > x0 + 1e-9) dragged = true
      if (run.events.some((ev) => ev.type === 'hurt' && ev.dot)) dotHurt = true
    }
    assert(dragged, 'expected an open abduction beam to drag a standing player toward the UFO')
    assert(dotHurt, 'expected an open abduction beam to tick dot-flagged damage')
    assert(Math.hypot(run.player.x - e.x, run.player.y - e.y) <= PULL_BEAM_RANGE, 'expected the drag to have happened in range')

    // Walk out: input away from the UFO beats the beam, since PULL_BEAM_FORCE < PLAYER.baseSpeed.
    const x1 = run.player.x
    for (let i = 0; i < Math.round(0.5 / dt); i++) stepSim(run, { x: -1, y: 0 }, dt)
    assert(run.player.x < x1, `expected the player to out-walk the beam (${x1.toFixed(1)} -> ${run.player.x.toFixed(1)})`)
    assert(PULL_BEAM_FORCE < PLAYER.baseSpeed, 'expected PULL_BEAM_FORCE under the player base speed by design')
    console.log(`PASS run Y.j (pullBeam): drags + ticks, and a walking player still escapes (${PULL_BEAM_FORCE} < ${PLAYER.baseSpeed} px/s)`)
  }

  // (k) flashlightCone: an exterminator elite's cone ENRAGES other enemies (faster + harder contact)
  // and damages NOTHING itself — no hit, no hurt, ever.
  {
    const run = createRun(makeMeta(), { chapter: 'undergrowth' })
    run.weapons = []; run.obstacles = []; run.traps = []; run.mods.spawnMul = 0
    run.player.x = 0; run.player.y = 0; run.player.hp = 1e9; run.player.maxHP = 1e9
    const elite = makeStatusEnemy(run, { x: -300, y: 0, hp: 1e6, speed: 0, elite: true })
    elite.flags = ['flashlightCone']
    const rat = makeStatusEnemy(run, { x: -200, y: 0, hp: 1e6, speed: 100 }) // between the elite and the player
    rat.flags = []
    run.enemies.push(elite, rat)

    for (let i = 0; i < Math.round(0.2 / dt); i++) stepSim(run, { x: 0, y: 0 }, dt)
    assert(rat.enrageT > 0, `expected a rat in the cone to be enraged, enrageT=${rat.enrageT}`)
    assert(Math.abs(rat.enrageT - FLASHLIGHT_ENRAGE_T) < 0.02, `expected enrageT refreshed to ${FLASHLIGHT_ENRAGE_T}, got ${rat.enrageT}`)
    assert(typeof elite._coneAngle === 'number', 'expected the elite to expose _coneAngle for render')
    assert(!run.events.some((ev) => ev.type === 'hit' || ev.type === 'hurt'), 'expected the cone itself to damage NOTHING')

    // The enrage is real: an enraged rat closes faster than a plain one over the same window.
    function ratDx(enraged) {
      const r = createRun(makeMeta(), { chapter: 'undergrowth' })
      r.weapons = []; r.obstacles = []; r.traps = []; r.mods.spawnMul = 0
      r.player.x = 2000; r.player.y = 0
      const en = makeStatusEnemy(r, { x: 0, y: 0, hp: 1e6, speed: 100 })
      en.flags = []
      if (enraged) en.enrageT = 10
      r.enemies.push(en)
      for (let i = 0; i < Math.round(0.3 / dt); i++) stepSim(r, { x: 0, y: 0 }, dt)
      return en.x
    }
    const fast = ratDx(true), plain = ratDx(false)
    assert(Math.abs(fast / plain - FLASHLIGHT_SPEED_MUL) < 0.01, `expected an enraged rat at ${FLASHLIGHT_SPEED_MUL}x speed, got ${(fast / plain).toFixed(3)}x`)
    console.log(`PASS run Y.k (flashlightCone): enrages at ${(fast / plain).toFixed(2)}x speed, damages nothing`)
  }

  console.log('PASS run Y (v5.4 behavior flags): pounce, aerialStrike, lineCharge, spawner, strafe, missileVolley, artillery, blink, phase, pullBeam, flashlightCone')
}

// ---- Run Z: v5.4 signature mechanics (predators/traffic/bombardment/gravity) --------------
function testV54Signatures() {
  const dt = 1 / 60

  // (a) predators: the trap field is seeded at createRun (never under the player), and an armed trap
  // damages BOTH sides — the player AND enemies — then re-arms. Damaging both IS the mechanic.
  {
    const seeded = createRun(makeMeta(), { chapter: 'undergrowth' })
    assert.strictEqual(seeded.traps.length, CHAPTERS.undergrowth.signature.traps,
      `expected ${CHAPTERS.undergrowth.signature.traps} traps seeded, got ${seeded.traps.length}`)
    for (const tr of seeded.traps) {
      assert(Math.hypot(tr.x, tr.y) >= SNAP_TRAP_MIN_DIST, `expected traps >= ${SNAP_TRAP_MIN_DIST}px from the origin, got ${Math.hypot(tr.x, tr.y).toFixed(1)}`)
      assert.strictEqual(tr.armed, true, 'expected a fresh trap armed')
      assert.strictEqual(tr.r, SNAP_TRAP_R, `expected trap radius ${SNAP_TRAP_R}, got ${tr.r}`)
    }
    // Other chapters never seed one (the array exists and stays empty).
    assert.strictEqual(createRun(makeMeta(), { chapter: 'city' }).traps.length, 0, 'expected a non-predators chapter to seed no traps')

    // Player side: standing on an armed trap springs it, hurts, and puts it on cooldown.
    const run = createRun(makeMeta(), { chapter: 'undergrowth' })
    run.weapons = []; run.obstacles = []; run.mods.spawnMul = 0
    run.player.x = 0; run.player.y = 0; run.player.hp = 500; run.player.maxHP = 500; run.player.invuln = 0
    run.traps = [{ x: 0, y: 0, r: SNAP_TRAP_R, armed: true, cd: 0 }]
    const hp0 = run.player.hp
    stepSim(run, { x: 0, y: 0 }, dt)
    assert(run.player.hp < hp0, `expected a snap trap to damage the player (${hp0} -> ${run.player.hp})`)
    assert.strictEqual(run.traps[0].armed, false, 'expected a sprung trap to disarm')
    assert.strictEqual(run.traps[0].cd, SNAP_TRAP_REARM, `expected cd ${SNAP_TRAP_REARM}, got ${run.traps[0].cd}`)
    assert(run.events.some((ev) => ev.type === 'explode'), 'expected a sprung trap to emit an explode event')

    // ...and it re-arms rather than expiring (permanent furniture).
    for (let i = 0; i < Math.round((SNAP_TRAP_REARM + 0.1) / dt); i++) {
      run.player.invuln = 1e9 // hold the player harmless so it re-arms instead of instantly re-springing
      stepSim(run, { x: 0, y: 0 }, dt)
    }
    assert.strictEqual(run.traps.length, 1, 'expected a trap to never expire')
    assert.strictEqual(run.traps[0].armed, true, 'expected a sprung trap to re-arm after SNAP_TRAP_REARM')

    // Enemy side (the kite mechanic): the same trap damages an enemy that walks onto it.
    const kite = createRun(makeMeta(), { chapter: 'undergrowth' })
    kite.weapons = []; kite.obstacles = []; kite.mods.spawnMul = 0
    kite.player.x = 5000; kite.player.y = 0; kite.player.hp = 1e9; kite.player.maxHP = 1e9
    const e = makeStatusEnemy(kite, { x: 0, y: 0, hp: 500, speed: 0 })
    kite.enemies.push(e)
    kite.traps = [{ x: 0, y: 0, r: SNAP_TRAP_R, armed: true, cd: 0 }]
    stepSim(kite, { x: 0, y: 0 }, dt)
    assert.strictEqual(e.hp, 500 - SNAP_TRAP_DMG, `expected the trap to deal ${SNAP_TRAP_DMG} to the enemy, hp=${e.hp}`)
    assert.strictEqual(kite.traps[0].armed, false, 'expected the enemy to spring the trap too')
    console.log(`PASS run Z.a (predators): ${seeded.traps.length} traps seeded, snaps on BOTH sides, re-arms`)
  }

  // (b) traffic: 'warn' is a harmless telegraph; the 'sweep' vehicle damages BOTH sides + knocks back.
  {
    function laneRun() {
      const run = createRun(makeMeta(), { chapter: 'city' })
      run.weapons = []; run.obstacles = []; run.mods.spawnMul = 0
      run._laneAcc = 1e6 // park the roller: this case drives one hand-placed lane
      run.player.x = 0; run.player.y = 0; run.player.hp = 1e9; run.player.maxHP = 1e9; run.player.invuln = 0
      run.lanes = [{
        x: 0, y: 0, angle: 0, len: TRAFFIC_LEN, w: TRAFFIC_W,
        phase: 'warn', t: TRAFFIC_WARN, carT: 0, dmg: TRAFFIC_DMG, hitIds: new Set(),
      }]
      return run
    }
    const warn = laneRun()
    // In the lane, but well clear of the player — otherwise its own CONTACT damage, not the lane,
    // is what the "telegraph is harmless" assertion would be measuring.
    const victimW = makeStatusEnemy(warn, { x: 300, y: 0, hp: 1e6, speed: 0 })
    victimW.flags = []
    warn.enemies.push(victimW)
    for (let i = 0; i < Math.round((TRAFFIC_WARN - 0.05) / dt); i++) stepSim(warn, { x: 0, y: 0 }, dt)
    assert.strictEqual(warn.player.hp, 1e9, 'expected the lane telegraph to damage nobody')
    assert.strictEqual(victimW.hp, 1e6, 'expected the lane telegraph to damage no enemies either')
    assert.strictEqual(warn.lanes[0].phase, 'warn', 'expected the lane still telegraphing')

    const sweep = laneRun()
    const victim = makeStatusEnemy(sweep, { x: 300, y: 0, hp: 1e6, speed: 0 })
    victim.flags = []
    sweep.enemies.push(victim)
    const hp0 = sweep.player.hp
    for (let i = 0; i < Math.round((TRAFFIC_WARN + TRAFFIC_SWEEP + 0.1) / dt); i++) stepSim(sweep, { x: 0, y: 0 }, dt)
    assert(sweep.player.hp < hp0, `expected the car to flatten the player (${hp0} -> ${sweep.player.hp})`)
    assert(victim.hp < 1e6, `expected the car to flatten enemies too (BOTH sides), hp=${victim.hp}`)
    assert(victim.x > 301, `expected the car to knock the enemy along the lane (+x), moved to ${victim.x.toFixed(1)}px`)
    assert.strictEqual(sweep.lanes.length, 0, 'expected the lane removed once the sweep ends')

    // The signature actually rolls lanes on its own in a city run (capped by signature.lanes).
    const auto = createRun(makeMeta(), { chapter: 'city' })
    auto.weapons = []; auto.mods.spawnMul = 0; auto.player.hp = 1e9; auto.player.maxHP = 1e9
    let maxAlive = 0
    for (let i = 0; i < Math.round(12 / dt); i++) {
      stepSim(auto, { x: 0, y: 0 }, dt)
      maxAlive = Math.max(maxAlive, auto.lanes.length)
    }
    assert(maxAlive > 0, 'expected a city run to roll traffic lanes on its own')
    assert(maxAlive <= CHAPTERS.city.signature.lanes, `expected at most ${CHAPTERS.city.signature.lanes} lanes alive, saw ${maxAlive}`)
    console.log(`PASS run Z.b (traffic): warn harmless, sweep flattens BOTH sides + knockback, <= ${maxAlive} lane(s) live`)
  }

  // (c) bombardment: telegraphed circles rain on the player's area continuously, and (being run.bombs)
  // they damage BOTH sides.
  {
    const run = createRun(makeMeta(), { chapter: 'skies' })
    run.weapons = []; run.obstacles = []; run.mods.spawnMul = 0
    run.player.x = 0; run.player.y = 0; run.player.hp = 1e9; run.player.maxHP = 1e9; run.player.invuln = 0
    const victim = makeStatusEnemy(run, { x: 0, y: 0, hp: 1e6, speed: 0 })
    run.enemies.push(victim)

    let sawBombs = 0
    let hurt = false
    for (let i = 0; i < Math.round(9 / dt); i++) {
      stepSim(run, { x: 0, y: 0 }, dt)
      sawBombs = Math.max(sawBombs, run.bombs.length)
      for (const b of run.bombs) {
        assert.strictEqual(b.radius, BOMBARDMENT_RADIUS, `expected bombardment radius ${BOMBARDMENT_RADIUS}, got ${b.radius}`)
        assert(Math.hypot(b.x - run.player.x, b.y - run.player.y) <= BOMBARDMENT_SPREAD + 1e-6, 'expected bombs scattered within BOMBARDMENT_SPREAD of the player')
      }
      if (run.events.some((ev) => ev.type === 'hurt')) hurt = true
    }
    assert(sawBombs >= BOMBARDMENT_COUNT, `expected >= ${BOMBARDMENT_COUNT} bombs alive at once, saw ${sawBombs}`)
    assert(hurt, 'expected the bombardment to damage a player standing in it')
    assert(victim.hp < 1e6, `expected the bombardment to damage enemies too (BOTH sides), hp=${victim.hp}`)
    // Only the skies get shelled by the sky.
    const quiet = createRun(makeMeta(), { chapter: 'city' })
    quiet.weapons = []; quiet.mods.spawnMul = 0; quiet.player.hp = 1e9; quiet.player.maxHP = 1e9
    for (let i = 0; i < Math.round(9 / dt); i++) stepSim(quiet, { x: 0, y: 0 }, dt)
    assert.strictEqual(quiet.bombs.length, 0, 'expected a non-bombardment chapter never to rain bombs')
    console.log(`PASS run Z.c (bombardment): >= ${sawBombs} telegraphed circles, damages BOTH sides`)
  }

  // (d) gravity: the wells are seeded at createRun, they BEND projectiles WITHOUT changing their
  // speed (curvature, not acceleration), and they leave bodies alone.
  {
    const seeded = createRun(makeMeta(), { chapter: 'beyond' })
    assert.strictEqual(seeded.wells.length, CHAPTERS.beyond.signature.wells,
      `expected ${CHAPTERS.beyond.signature.wells} wells seeded, got ${seeded.wells.length}`)
    for (const w of seeded.wells) {
      assert(Math.hypot(w.x, w.y) >= GRAVITY_MIN_DIST, `expected wells >= ${GRAVITY_MIN_DIST}px from the origin, got ${Math.hypot(w.x, w.y).toFixed(1)}`)
      assert.strictEqual(w.r, GRAVITY_WELL_R, `expected well radius ${GRAVITY_WELL_R}, got ${w.r}`)
      assert.strictEqual(w.g, GRAVITY_FORCE, `expected well force ${GRAVITY_FORCE}, got ${w.g}`)
    }
    for (let i = 0; i < seeded.wells.length; i++) {
      for (let j = i + 1; j < seeded.wells.length; j++) {
        const a = seeded.wells[i], b = seeded.wells[j]
        const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r
        assert(gap >= GRAVITY_MIN_GAP - 1e-6, `expected wells spaced >= ${GRAVITY_MIN_GAP}px edge-to-edge, got ${gap.toFixed(1)}`)
      }
    }
    assert.strictEqual(createRun(makeMeta(), { chapter: 'skies' }).wells.length, 0, 'expected a non-gravity chapter to seed no wells')

    // THE contract: a well bends a bullet's path and its speed is preserved exactly.
    const run = createRun(makeMeta(), { chapter: 'beyond' })
    run.weapons = []; run.obstacles = []; run.mods.spawnMul = 0
    run.player.x = 0; run.player.y = 0; run.player.hp = 1e9; run.player.maxHP = 1e9
    run.wells = [{ x: 0, y: 160, r: GRAVITY_WELL_R, g: GRAVITY_FORCE }] // straddles the flight path
    const speed = 480
    run.bullets.push({
      x: -150, y: 0, vx: speed, vy: 0, dmg: 1, pierce: 1, life: 5, r: 10, speed,
      hitIds: new Set(), weapon: 'quill', _shard: false, _splitDone: true, _chainsLeft: 0, _ricochetsLeft: 0,
    })
    const b = run.bullets[0]
    let maxSpeedErr = 0
    for (let i = 0; i < Math.round(0.5 / dt); i++) {
      stepSim(run, { x: 0, y: 0 }, dt)
      if (!run.bullets.includes(b)) break
      maxSpeedErr = Math.max(maxSpeedErr, Math.abs(Math.hypot(b.vx, b.vy) - speed))
    }
    assert(maxSpeedErr < 1e-6, `expected a well to preserve projectile SPEED exactly (curvature, not acceleration), max error ${maxSpeedErr}`)
    assert(b.vy > 20, `expected the well to bend the bullet toward it (+y), vy=${b.vy.toFixed(1)}`)
    assert(b.y > 1, `expected the bent path to actually curve, y=${b.y.toFixed(1)}`)

    // ...and it bends nothing else: bodies, beams, orbitals and zones are not projectiles.
    const bodies = createRun(makeMeta(), { chapter: 'beyond' })
    bodies.weapons = []; bodies.obstacles = []; bodies.mods.spawnMul = 0
    bodies.player.x = 0; bodies.player.y = 0; bodies.player.hp = 1e9; bodies.player.maxHP = 1e9
    bodies.wells = [{ x: 60, y: 0, r: GRAVITY_WELL_R, g: GRAVITY_FORCE }]
    const still = makeStatusEnemy(bodies, { x: 0, y: 60, hp: 1e6, speed: 0 })
    still.flags = []
    bodies.enemies.push(still)
    const px0 = bodies.player.x, py0 = bodies.player.y
    for (let i = 0; i < Math.round(0.5 / dt); i++) stepSim(bodies, { x: 0, y: 0 }, dt)
    assert.strictEqual(still.x, 0, `expected a well to never move an enemy body, x=${still.x}`)
    assert.strictEqual(still.y, 60, `expected a well to never move an enemy body, y=${still.y}`)
    assert.strictEqual(bodies.player.x, px0, 'expected a well to never move the player')
    assert.strictEqual(bodies.player.y, py0, 'expected a well to never move the player')
    assert(!bodies.events.some((ev) => ev.type === 'hurt' || ev.type === 'hit'), 'expected wells to damage nothing')
    console.log(`PASS run Z.d (gravity): ${seeded.wells.length} wells seeded, bullet bent to vy=${b.vy.toFixed(0)} with speed error ${maxSpeedErr.toExponential(1)}, bodies untouched`)
  }

  console.log('PASS run Z (v5.4 signatures): predators traps, traffic lanes, bombardment, gravity wells')
}

// ---- Run AA: v5.4 weapons + per-chapter balance bands (run W/X style) ---------------------
function testV54Weapons() {
  const dt = 1 / 60

  // A quiet run in a chapter, with one weapon at max level and nothing else moving.
  function weaponRun(chapter, id, level = MAX_WEAPON_LEVEL) {
    const run = createRun(makeMeta(), { chapter })
    run.weapons = [{ id, level }]
    run.obstacles = []; run.traps = []; run.wells = []; run.mods.spawnMul = 0
    run._laneAcc = 1e6; run._bombardAcc = 1e6 // park the signatures: these cases are about the weapon
    run.player.x = 0; run.player.y = 0; run.player.hp = 1e9; run.player.maxHP = 1e9
    return run
  }
  function stepQuiet(run, seconds, input = { x: 0, y: 0 }) {
    for (let i = 0; i < Math.round(seconds / dt); i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, input, dt)
    }
  }

  // (a) clawRake: a narrow sector rake at the nearest foe that NEVER moves the player (v5.5 — see
  // the CLAW_* block in config.js). doubleSlash adds a follow-up slash; bleedClaws bleeds.
  {
    const run = weaponRun('undergrowth', 'clawRake')
    const target = makeStatusEnemy(run, { x: 100, y: 0, hp: 1e6, speed: 0 })
    target.flags = []
    run.enemies.push(target)
    let sawRake = null
    for (let i = 0; i < Math.round(2 / dt) && !sawRake; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      sawRake = run.events.find((ev) => ev.type === 'clawRake')
    }
    assert(sawRake, 'expected a clawRake event')
    assert(target.hp < 1e6, `expected the rake to damage the foe, hp=${target.hp}`)

    // THE regression (v5.5): the cast must not move the player. This weapon was "Pounce Claws" and
    // dashed them onto the target — an auto-cast stealing the only input the game has, and feeding
    // them into contact damage. Zero input + many casts must leave the player exactly where it was.
    {
      const still = weaponRun('undergrowth', 'clawRake')
      still.weaponMods.clawRake.doubleSlash = 1 // the follow-up slash must not move them either
      const foe = makeStatusEnemy(still, { x: 60, y: 0, hp: 1e9, speed: 0 })
      foe.flags = []
      still.enemies.push(foe)
      const x0 = still.player.x, y0 = still.player.y
      let rakes = 0
      for (let i = 0; i < Math.round(4 / dt); i++) {
        if (still.phase === 'levelup') { declineLevelUp(still); continue }
        still.events = []
        stepSim(still, { x: 0, y: 0 }, dt)
        rakes += still.events.filter((ev) => ev.type === 'clawRake').length
      }
      assert(rakes >= 8, `expected many rakes to have fired, got ${rakes}`)
      assert.strictEqual(still.player.x, x0, `expected clawRake to NEVER move the player (x moved ${still.player.x - x0} over ${rakes} rakes)`)
      assert.strictEqual(still.player.y, y0, `expected clawRake to NEVER move the player (y moved ${still.player.y - y0} over ${rakes} rakes)`)
    }

    // doubleSlash: every CLAW_DOUBLE_EVERY-th rake queues a follow-up slash, so slashes outnumber casts.
    const dbl = weaponRun('undergrowth', 'clawRake')
    dbl.weaponMods.clawRake.doubleSlash = 1
    dbl.enemies.push(makeStatusEnemy(dbl, { x: 60, y: 0, hp: 1e9, speed: 0 }))
    let slashes = 0
    for (let i = 0; i < Math.round((CLAW_DOUBLE_EVERY + 1) * 1.0 / dt); i++) {
      if (dbl.phase === 'levelup') { declineLevelUp(dbl); continue }
      dbl.events = [] // main.js drains events every frame; tests must too, or counts compound
      stepSim(dbl, { x: 0, y: 0 }, dt)
      slashes += dbl.events.filter((ev) => ev.type === 'clawRake').length
    }
    assert(dbl._clawRakes >= CLAW_DOUBLE_EVERY, `expected several casts, got ${dbl._clawRakes}`)
    assert(slashes > dbl._clawRakes, `expected doubleSlash to add slashes beyond the casts (casts=${dbl._clawRakes}, slashes=${slashes})`)

    // bleedClaws: a raked foe bleeds (flagella's barbed DoT, verbatim).
    const bleed = weaponRun('undergrowth', 'clawRake')
    bleed.weaponMods.clawRake.bleedClaws = 0.5
    const bleeder = makeStatusEnemy(bleed, { x: 60, y: 0, hp: 1e6, speed: 0 })
    bleeder.flags = []
    bleed.enemies.push(bleeder)
    stepQuiet(bleed, 1.0)
    assert(bleeder.bleed > 0 && bleeder.bleedDps > 0, `expected bleedClaws to bleed a raked foe (bleed=${bleeder.bleed}, dps=${bleeder.bleedDps})`)
    console.log(`PASS run AA.a (clawRake): rakes the nearest foe and NEVER moves the player; doubleSlash chains (${slashes} slashes / ${dbl._clawRakes} casts); bleedClaws bleeds`)
  }

  // (b) quillBurst: a ring of quills in every direction (never aimed — the panic button), tagged
  // weapon:'quill'; retaliate fires a free burst the instant the player is hurt.
  {
    const run = weaponRun('undergrowth', 'quillBurst')
    run.enemies.push(makeStatusEnemy(run, { x: 200, y: 0, hp: 1e6, speed: 0 }))
    const lvl = WEAPONS.quillBurst.levels[MAX_WEAPON_LEVEL - 1]
    let burst = []
    for (let i = 0; i < Math.round(2 / dt) && burst.length === 0; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.bullets.length > 0) burst = run.bullets.slice()
    }
    assert.strictEqual(burst.length, lvl.count, `expected ${lvl.count} quills per burst, got ${burst.length}`)
    for (const b of burst) {
      assert.strictEqual(b.weapon, 'quill', 'expected each quill tagged weapon:quill')
      assert.strictEqual(b._chainsLeft, 0, "expected star's chain disabled on quills")
    }
    // Evenly around the full circle: the headings span way more than any cone.
    const angles = burst.map((b) => Math.atan2(b.vy, b.vx)).sort((a, z) => a - z)
    assert(angles[angles.length - 1] - angles[0] > Math.PI, `expected quills all around, span=${(angles[angles.length - 1] - angles[0]).toFixed(2)}rad`)

    // retaliate: taking a hit fires a free burst off the weapon timer (once per QUILL_RETALIATE_CD).
    const ret = weaponRun('undergrowth', 'quillBurst')
    ret.weaponMods.quillBurst.retaliate = 1
    ret.player.hp = 500; ret.player.maxHP = 500; ret.player.invuln = 0
    ret.weaponTimers.quillBurst = 1e6 // park the timer: any burst now can only be the retaliation
    ret.traps = [{ x: 0, y: 0, r: SNAP_TRAP_R, armed: true, cd: 0 }] // a trap under the player = a free hit
    stepSim(ret, { x: 0, y: 0 }, dt)
    assert(ret.bullets.length > 0, 'expected retaliate to fire a free burst when the player is hurt')
    assert.strictEqual(ret.bullets.length, lvl.count + 1, `expected the level's count + 1 retaliate pick, got ${ret.bullets.length}`)
    // The cd is set when the hit lands, then stepQuillWeapon ticks it down later in the same frame.
    assert(ret._quillRetalCd > 0 && ret._quillRetalCd <= QUILL_RETALIATE_CD,
      `expected retaliate on cooldown (0, ${QUILL_RETALIATE_CD}], got ${ret._quillRetalCd}`)
    console.log(`PASS run AA.b (quillBurst): ${burst.length} quills all around; retaliate fires ${lvl.count + 1} on being hit`)
  }

  // (c) chitterShriek: the ring FEARS what it hits — a feared enemy runs AWAY (inverted seek) at
  // FEAR_SPEED_MUL and stops dealing contact damage. panicRout amplifies damage on fleeing foes.
  {
    const run = weaponRun('undergrowth', 'chitterShriek')
    const victim = makeStatusEnemy(run, { x: 100, y: 0, hp: 1e6, speed: 100 })
    victim.flags = []
    run.enemies.push(victim)
    let feared = false
    for (let i = 0; i < Math.round(4 / dt) && !feared; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      if (victim.fearT > 0) feared = true
    }
    assert(feared, 'expected the shriek to fear the enemies it hits')

    // A feared enemy flees at FEAR_SPEED_MUL of its own speed (vs seeking at 1x).
    function fleeDx(fear) {
      const r = weaponRun('undergrowth', 'chitterShriek')
      r.weapons = []
      r.player.x = 1000; r.player.y = 0 // player to the +x
      const e = makeStatusEnemy(r, { x: 0, y: 0, hp: 1e6, speed: 100 })
      e.flags = []
      if (fear) e.fearT = 10
      r.enemies.push(e)
      const x0 = e.x
      stepQuiet(r, 0.3)
      return e.x - x0
    }
    const flee = fleeDx(true), seek = fleeDx(false)
    assert(seek > 0, `expected a calm enemy to seek the player (+x), got ${seek.toFixed(1)}`)
    assert(flee < 0, `expected a feared enemy to FLEE (-x), got ${flee.toFixed(1)}`)
    assert(Math.abs(Math.abs(flee / seek) - FEAR_SPEED_MUL) < 0.01, `expected fleeing at ${FEAR_SPEED_MUL}x, got ${Math.abs(flee / seek).toFixed(3)}x`)

    // A feared enemy deals no contact damage.
    const safe = weaponRun('undergrowth', 'chitterShriek')
    safe.weapons = []
    safe.player.hp = 500; safe.player.maxHP = 500; safe.player.invuln = 0
    const scared = makeStatusEnemy(safe, { x: 0, y: 0, hp: 1e6, speed: 0 })
    scared.flags = []; scared.fearT = 10
    safe.enemies.push(scared)
    stepQuiet(safe, 0.5)
    assert.strictEqual(safe.player.hp, 500, 'expected a fleeing enemy to deal no contact damage')

    // panicRout: the same hit lands harder on a fleeing foe.
    function routHp(rout) {
      const r = weaponRun('undergrowth', 'chitterShriek')
      r.weapons = []
      if (rout) r.weaponMods.chitterShriek.panicRout = 0.40
      const e = makeStatusEnemy(r, { x: 0, y: 0, hp: 1e6, speed: 0 })
      e.flags = []; e.fearT = 10
      r.enemies.push(e)
      r.novas.push({ x: 0, y: 0, r: 0, maxR: 200, dmg: 100, knockback: 0, fear: 0, life: NOVA_LIFE, hit: new Set() })
      stepQuiet(r, NOVA_LIFE + 0.1)
      return 1e6 - e.hp
    }
    const routed = routHp(true), plainHit = routHp(false)
    assert(routed > plainHit, `expected panicRout to amplify damage on a fleeing foe (${plainHit} -> ${routed})`)
    console.log(`PASS run AA.c (chitterShriek): fears + inverts the seek at ${FEAR_SPEED_MUL}x, no contact damage, panicRout ${plainHit} -> ${routed}`)
  }

  // (d) trashTornado: an always-on orbital rewritten into run.debris every frame (the run.orbs
  // contract); suction drags foes in; flingDebris hurls chunks out as run.bullets tagged 'trash'.
  {
    const run = weaponRun('city', 'trashTornado')
    const lvl = WEAPONS.trashTornado.levels[MAX_WEAPON_LEVEL - 1]
    const victim = makeStatusEnemy(run, { x: lvl.radius, y: 0, hp: 1e6, speed: 0 })
    run.enemies.push(victim)
    stepQuiet(run, 1.0)
    assert.strictEqual(run.debris.length, lvl.chunks, `expected ${lvl.chunks} chunks in run.debris, got ${run.debris.length}`)
    for (const d of run.debris) {
      assert(Math.abs(Math.hypot(d.x - run.player.x, d.y - run.player.y) - lvl.radius) < 1e-6, 'expected chunks on the orbit ring')
    }
    assert(victim.hp < 1e6, `expected the chunks to grind an enemy on the ring, hp=${victim.hp}`)

    // suction: a foe just inside the suction range is dragged toward the player.
    function suctionDx(on) {
      const r = weaponRun('city', 'trashTornado')
      if (on) r.weaponMods.trashTornado.suction = 0.50
      const e = makeStatusEnemy(r, { x: 200, y: 0, hp: 1e6, speed: 0 })
      e.flags = []
      r.enemies.push(e)
      stepQuiet(r, 0.3)
      return e.x
    }
    assert(suctionDx(true) < suctionDx(false) - 1, 'expected suction to drag a nearby foe inward')

    // flingDebris: chunks are hurled outward as bullets.
    const fling = weaponRun('city', 'trashTornado')
    fling.weaponMods.trashTornado.flingDebris = 2
    stepQuiet(fling, 2.0)
    assert(fling.bullets.some((b) => b.weapon === 'trash'), 'expected flingDebris to hurl chunks as weapon:trash bullets')
    console.log(`PASS run AA.d (trashTornado): ${run.debris.length} orbiting chunks grind + suction + fling`)
  }

  // (e) sewerGeyser: telegraph (harmless) -> one eruption -> gone. Enemies only, never the player.
  // launch flings and stuns; chainGeyser scatters follow-ups that never chain further.
  {
    const run = weaponRun('city', 'sewerGeyser')
    const lvl = WEAPONS.sewerGeyser.levels[MAX_WEAPON_LEVEL - 1]
    const victim = makeStatusEnemy(run, { x: 200, y: 0, hp: 1e6, speed: 0 }) // in castRange, clear of the player
    victim.flags = []
    run.enemies.push(victim)
    let planted = null
    for (let i = 0; i < Math.round(4 / dt) && !planted; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      planted = run.geysers[0]
    }
    assert(planted, 'expected the weapon to plant a geyser')
    assert.strictEqual(planted.dur, lvl.fuse, 'expected dur to snapshot the starting fuse (render grows the warning ring from fuse/dur)')
    const hpAtPlant = victim.hp
    stepQuiet(run, 0.02)
    assert.strictEqual(victim.hp, hpAtPlant, 'expected the geyser fuse to be a harmless telegraph')
    stepQuiet(run, lvl.fuse + 0.2)
    assert(victim.hp < hpAtPlant, `expected the eruption to damage the enemy, hp=${victim.hp}`)

    // Enemies only, NEVER the player: a geyser erupting right on top of them does nothing at all.
    const safe = weaponRun('city', 'sewerGeyser')
    safe.weapons = [] // no re-planting, no enemies: the hand-placed zone is the only thing live
    safe.player.hp = 500; safe.player.maxHP = 500; safe.player.invuln = 0
    safe.geysers.push({ x: 0, y: 0, r: 150, fuse: 0.05, dur: 0.05, dmg: 999 })
    stepQuiet(safe, 0.3)
    assert.strictEqual(safe.player.hp, 500, 'expected a geyser to NEVER damage the player')
    assert.strictEqual(safe.geysers.length, 0, 'expected the geyser to erupt ONCE and be removed')

    // launch: the eruption flings and stuns.
    const launch = weaponRun('city', 'sewerGeyser')
    launch.weapons = []
    launch.weaponMods.sewerGeyser.launch = 1
    const caught = makeStatusEnemy(launch, { x: 40, y: 0, hp: 1e6, speed: 0 })
    caught.flags = []
    launch.enemies.push(caught)
    launch.geysers.push({ x: 0, y: 0, r: 100, fuse: 0.05, dur: 0.05, dmg: 10 })
    stepQuiet(launch, 0.2)
    assert(caught.stunT > 0, `expected launch to stun what it catches, stunT=${caught.stunT}`)
    assert(caught.x > 40, `expected launch to fling the enemy outward, x=${caught.x.toFixed(1)}`)

    // chainGeyser: follow-ups appear, flagged _chained, and never chain further.
    const chain = weaponRun('city', 'sewerGeyser')
    chain.weapons = []
    chain.weaponMods.sewerGeyser.chainGeyser = 2
    chain.geysers.push({ x: 0, y: 0, r: 100, fuse: 0.05, dur: 0.05, dmg: 50 })
    stepQuiet(chain, 0.2)
    assert.strictEqual(chain.geysers.length, 2, `expected 2 chained follow-ups, got ${chain.geysers.length}`)
    for (const g of chain.geysers) {
      assert.strictEqual(g._chained, true, 'expected follow-ups flagged _chained')
      assert(Math.abs(g.r - 100 * GEYSER_CHAIN_FRAC) < 1e-6, `expected follow-up radius at GEYSER_CHAIN_FRAC, got ${g.r}`)
    }
    stepQuiet(chain, 1.0)
    assert.strictEqual(chain.geysers.length, 0, 'expected a _chained geyser to erupt and never chain further')
    console.log('PASS run AA.e (sewerGeyser): telegraph -> erupt (enemies only) -> gone; launch stuns; chain never re-chains')
  }

  // (f) roar: a narrow sector sweep aimed at the NEAREST enemy that shoves; stagger stuns;
  // resonance opens every ROAR_RESONANCE_EVERY-th roar to a full circle (flagella's cyclone shape).
  {
    const run = weaponRun('skies', 'roar')
    const foe = makeStatusEnemy(run, { x: 100, y: 0, hp: 1e6, speed: 0 })
    foe.flags = []
    run.enemies.push(foe)
    let sawRoar = false
    for (let i = 0; i < Math.round(1.5 / dt); i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.events.some((ev) => ev.type === 'roar')) sawRoar = true
    }
    assert(sawRoar, 'expected a roar event')
    assert(foe.hp < 1e6, 'expected the roar to damage what it hits')
    assert(foe.x > 100, `expected the roar to shove the foe away, x=${foe.x.toFixed(1)}`)

    // stagger: roared foes are stunned.
    const stag = weaponRun('skies', 'roar')
    stag.weaponMods.roar.stagger = 0.50
    const s = makeStatusEnemy(stag, { x: 100, y: 0, hp: 1e6, speed: 0 })
    s.flags = []
    stag.enemies.push(s)
    stepQuiet(stag, 1.5)
    assert(s.stunT > 0, `expected stagger to stun a roared foe, stunT=${s.stunT}`)

    // resonance: an in-range foe BEHIND the aim anchor is only ever reached by the 360° roar.
    function behindHp(resonance) {
      const r = weaponRun('skies', 'roar')
      if (resonance) r.weaponMods.roar.resonance = 1
      // The anchor pins the aim +x. It must be 'anchored': the roar's own shove would otherwise
      // walk it past the behind foe, which would flip "nearest" and hand the aim to the wrong side.
      r.enemies.push(makeStatusEnemy(r, { x: 60, y: 0, hp: 1e9, speed: 0, affixes: ['anchored'] }))
      const behind = makeStatusEnemy(r, { x: -100, y: 0, hp: 1e6, speed: 0 })
      behind.flags = []
      r.enemies.push(behind)
      stepQuiet(r, (ROAR_RESONANCE_EVERY + 2) * 0.7)
      return behind.hp
    }
    const withRes = behindHp(true), without = behindHp(false)
    assert.strictEqual(without, 1e6, `expected no resonance to never reach the behind foe (hp ${without})`)
    assert(withRes < 1e6, `expected resonance's 360° roar to reach the behind foe (hp ${withRes})`)
    console.log(`PASS run AA.f (roar): sweeps + shoves, stagger stuns, resonance reaches behind (${withRes.toFixed(0)} vs ${without.toFixed(0)})`)
  }

  // (g) tailSwipe: a wide sector that launches; wreckingTail turns the launched body into
  // collateral where it lands; counterSwipe swings for free when the player is hit.
  {
    const run = weaponRun('skies', 'tailSwipe')
    const foe = makeStatusEnemy(run, { x: 80, y: 0, hp: 1e6, speed: 0 })
    foe.flags = []
    run.enemies.push(foe)
    let sawTail = false
    for (let i = 0; i < Math.round(2 / dt); i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.events.some((ev) => ev.type === 'tail')) sawTail = true
    }
    assert(sawTail, 'expected a tail event')
    assert(foe.hp < 1e6, 'expected the swipe to damage what it hits')
    assert(foe.x > 80, `expected the swipe to launch the foe, x=${foe.x.toFixed(1)}`)

    // wreckingTail: a bystander near where the launched foe ends up takes collateral.
    function bystanderHp(wrecking) {
      const r = weaponRun('skies', 'tailSwipe')
      if (wrecking) r.weaponMods.tailSwipe.wreckingTail = 0.40
      // struck sits just inside the swipe's reach; bystander sits just OUTSIDE it (so the swipe can
      // never hit it directly) but within TAIL_COLLIDE_R of where the launched body comes down.
      const struck = makeStatusEnemy(r, { x: 190, y: 0, hp: 1e9, speed: 0 })
      struck.flags = []
      const bystander = makeStatusEnemy(r, { x: 240, y: 0, hp: 1e6, speed: 0 })
      bystander.flags = []
      r.enemies.push(struck, bystander)
      stepQuiet(r, 1.5) // one swipe
      return bystander.hp
    }
    const wrecked = bystanderHp(true), clean = bystanderHp(false)
    assert(wrecked < clean, `expected wreckingTail collateral on a bystander (${clean} -> ${wrecked})`)

    // counterSwipe: getting hurt swings for free, off the weapon timer.
    const ctr = weaponRun('skies', 'tailSwipe')
    ctr.player.hp = 500; ctr.player.maxHP = 500; ctr.player.invuln = 0
    ctr.weaponMods.tailSwipe.counterSwipe = 1
    ctr.weaponTimers.tailSwipe = 1e6 // park the timer: any swipe now can only be the counter
    const hitMe = makeStatusEnemy(ctr, { x: 90, y: 0, hp: 1e6, speed: 0 })
    hitMe.flags = []
    ctr.enemies.push(hitMe)
    ctr.bombs.push({ x: 0, y: 0, radius: 60, fuse: 0.01, duration: 0.01, dmg: 5 }) // hurt the player
    stepQuiet(ctr, 0.1)
    assert(ctr.events.some((ev) => ev.type === 'tail') || hitMe.hp < 1e6, 'expected counterSwipe to swing when the player is hurt')
    console.log(`PASS run AA.g (tailSwipe): launches, wreckingTail collateral (${clean} -> ${wrecked}), counterSwipe on being hit`)
  }

  // (h) debrisToss: chunks arc onto foes (run.lobs, t counting UP to flight) and burst ONCE on
  // landing — enemies only. shrapnel scatters splinters as run.bullets tagged 'debris'.
  {
    const run = weaponRun('skies', 'debrisToss')
    const victim = makeStatusEnemy(run, { x: 200, y: 0, hp: 1e6, speed: 0 }) // in castRange, clear of the player
    victim.flags = []
    run.enemies.push(victim)
    let lob = null
    for (let i = 0; i < Math.round(4 / dt) && !lob; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      lob = run.lobs[0]
    }
    assert(lob, 'expected the weapon to lob a chunk')
    assert(lob.t >= 0 && lob.t < lob.flight, `expected t counting UP toward flight, t=${lob.t}`)
    const hpAtLob = victim.hp
    stepQuiet(run, lob.flight + 0.1)
    assert(victim.hp < hpAtLob, `expected the chunk to burst on the enemy, hp=${victim.hp}`)

    // Enemies only, NEVER the player: a chunk landing right on them does nothing at all.
    const safe = weaponRun('skies', 'debrisToss')
    safe.weapons = [] // no re-throwing, no enemies: the hand-placed lob is the only thing live
    safe.player.hp = 500; safe.player.maxHP = 500; safe.player.invuln = 0
    safe.lobs.push({ x: 0, y: 0, fromX: 0, fromY: 0, tx: 0, ty: 0, t: 0, flight: 0.05, r: 150, dmg: 999 })
    stepQuiet(safe, 0.3)
    assert.strictEqual(safe.player.hp, 500, 'expected a lob to NEVER damage the player')
    assert.strictEqual(safe.lobs.length, 0, 'expected the chunk to burst ONCE and be removed')

    // shrapnel: the impact scatters splinters.
    const shr = weaponRun('skies', 'debrisToss')
    shr.weapons = []
    shr.weaponMods.debrisToss.shrapnel = 3
    shr.lobs.push({ x: 0, y: 0, fromX: 0, fromY: 0, tx: 100, ty: 0, t: 0, flight: 0.05, r: 80, dmg: 30 })
    stepQuiet(shr, 0.2)
    const splinters = shr.bullets.filter((b) => b.weapon === 'debris')
    assert.strictEqual(splinters.length, 3, `expected 3 shrapnel splinters, got ${splinters.length}`)
    console.log('PASS run AA.h (debrisToss): lobs arc + burst on enemies only; shrapnel scatters')
  }

  // (i) realityShard: shards SKIP through space (a blink jumps blinkDist along the heading without
  // sweeping the gap). riftScar leaves _chained rifts (so chainGeyser can't fire off them);
  // recursion forks a shard whose LIFE expired.
  {
    const run = weaponRun('beyond', 'realityShard')
    run.enemies.push(makeStatusEnemy(run, { x: 400, y: 0, hp: 1e9, speed: 0 }))
    let shard = null
    for (let i = 0; i < Math.round(2 / dt) && !shard; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      shard = run.bullets.find((b) => b.weapon === 'shard')
    }
    assert(shard, 'expected the weapon to fire shards')
    const lvl = WEAPONS.realityShard.levels[MAX_WEAPON_LEVEL - 1]
    // Across one blinkEvery window a shard covers its own flight PLUS a whole blinkDist jump.
    const x0 = shard.x
    stepQuiet(run, lvl.blinkEvery + 0.02)
    const covered = shard.x - x0
    const flown = lvl.speed * (lvl.blinkEvery + 0.02)
    assert(covered > flown + lvl.blinkDist * 0.9, `expected a blink to skip ~${lvl.blinkDist}px on top of the flight (covered=${covered.toFixed(1)}, flown=${flown.toFixed(1)})`)

    // riftScar: each blink scars its departure point into a _chained rift.
    const rift = weaponRun('beyond', 'realityShard')
    rift.weaponMods.realityShard.riftScar = 0.50
    rift.enemies.push(makeStatusEnemy(rift, { x: 400, y: 0, hp: 1e9, speed: 0 }))
    // Sample WHILE stepping: a rift's whole life is SHARD_RIFT_FUSE, so it plants, erupts and is
    // gone well inside any window long enough to have produced one.
    let rifts = []
    for (let i = 0; i < Math.round(2 / dt) && rifts.length === 0; i++) {
      if (rift.phase === 'levelup') { declineLevelUp(rift); continue }
      stepSim(rift, { x: 0, y: 0 }, dt)
      rifts = rift.geysers.slice()
    }
    assert(rifts.length > 0, 'expected riftScar to leave rifts at blink departure points')
    for (const g of rifts) assert.strictEqual(g._chained, true, "expected rifts flagged _chained so sewerGeyser's chainGeyser can never fire off them")

    // recursion: a shard that runs out of LIFE forks into _fork shards.
    const rec = weaponRun('beyond', 'realityShard')
    rec.weapons = []
    rec.weaponMods.realityShard.recursion = 2
    rec.bullets.push({
      x: 0, y: 0, vx: 380, vy: 0, dmg: 13, pierce: 1, life: 0.02, r: 9, speed: 380,
      hitIds: new Set(), weapon: 'shard', _blinkCd: 99, _blinkEvery: 0.28, _blinkDist: 70, _life0: 0.8,
      _shard: false, _splitDone: true, _chainsLeft: 0, _ricochetsLeft: 0,
    })
    stepQuiet(rec, 0.05)
    const forks = rec.bullets.filter((b) => b._fork)
    assert.strictEqual(forks.length, 2, `expected recursion to fork 2 shards on life expiry, got ${forks.length}`)
    stepQuiet(rec, 1.0)
    assert.strictEqual(rec.bullets.filter((b) => b._fork).length, 0, 'expected forks to expire without re-forking')
    console.log(`PASS run AA.i (realityShard): blink skips ${(covered - flown).toFixed(0)}px, riftScar leaves _chained rifts, recursion forks once`)
  }

  // (j) tesseractBeam: ONE folded run.beams entry sweeping TESSERACT_ARMS arms at once (a plain
  // Neon Beam rakes only the one it points at); collapse damages + yanks everything in any arm.
  {
    const run = weaponRun('beyond', 'tesseractBeam')
    const front = makeStatusEnemy(run, { x: 150, y: 0, hp: 1e9, speed: 0 }) // aim anchor
    const back = makeStatusEnemy(run, { x: -150, y: 0, hp: 1e6, speed: 0 }) // the FOLD's other arm
    front.flags = []; back.flags = []
    run.enemies.push(front, back)
    let beam = null
    for (let i = 0; i < Math.round(6 / dt) && !beam; i++) { // the fold's cast cadence is ~4.5s at max
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      beam = run.beams[0]
    }
    assert(beam, 'expected the weapon to cast a beam')
    assert.strictEqual(beam.folded, true, 'expected the cast flagged folded')
    assert.strictEqual(beam.arms, TESSERACT_ARMS, `expected ${TESSERACT_ARMS} arms on a plain fold, got ${beam.arms}`)

    // The fold itself, isolated: a non-rotating folded beam aimed +x rakes BOTH sides at once,
    // where the plain (unfolded) Neon Beam of the same shape only ever rakes the side it points at.
    // (Left to sweep, any beam eventually crosses everything — that would prove nothing.)
    function farSideHp(folded) {
      const r = weaponRun('beyond', 'tesseractBeam')
      r.weapons = []
      const far = makeStatusEnemy(r, { x: -150, y: 0, hp: 1e6, speed: 0 })
      far.flags = []
      r.enemies.push(far)
      r.beams.push({
        angle: 0, life: 0.5, duration: 0.5, dmg: 22, tick: 0.05, width: 46, length: 430,
        rotSpeed: 0, acc: 0, ...(folded ? { folded: true, arms: TESSERACT_ARMS } : {}),
      })
      stepQuiet(r, 0.3)
      return far.hp
    }
    const foldedFar = farSideHp(true), plainFar = farSideHp(false)
    assert.strictEqual(plainFar, 1e6, `expected an unfolded beam to never reach the far side (hp ${plainFar})`)
    assert(foldedFar < 1e6, `expected the fold's opposite arm to rake the far side too, hp=${foldedFar}`)

    // hyperfold adds arms; collapse detonates + yanks when the fold snaps shut.
    const col = weaponRun('beyond', 'tesseractBeam')
    col.weapons = []
    col.weaponMods.tesseractBeam.collapse = 0.80
    const caught = makeStatusEnemy(col, { x: 150, y: 0, hp: 1e6, speed: 0 })
    caught.flags = []
    col.enemies.push(caught)
    col.beams.push({
      angle: 0, life: 0.05, duration: 2, dmg: 22, tick: 99, width: 46, length: 430,
      rotSpeed: 0, acc: 0, folded: true, arms: TESSERACT_ARMS, collapseBonus: 0.80,
    })
    stepQuiet(col, 0.1)
    assert(caught.hp < 1e6, `expected collapse to detonate on what the fold held, hp=${caught.hp}`)
    assert(caught.kb.x < 0, `expected collapse to yank the foe toward the player, kb.x=${caught.kb.x.toFixed(1)}`)
    assert(col.events.some((ev) => ev.type === 'explode'), 'expected collapse to emit an explode at the player')

    const hyper = weaponRun('beyond', 'tesseractBeam')
    hyper.weaponMods.tesseractBeam.hyperfold = 2
    stepQuiet(hyper, 6.0)
    assert(hyper.beams.length > 0, 'expected the hyperfold cast to land')
    assert.strictEqual(hyper.beams[0].arms, TESSERACT_ARMS + 2, `expected hyperfold to add arms, got ${hyper.beams[0].arms}`)
    console.log(`PASS run AA.j (tesseractBeam): ${beam.arms} arms rake at once, hyperfold adds more, collapse detonates + yanks`)
  }

  // (k) each v5.4 chapter's level-up pool offers ONLY its own natives, as weapon AND mod cards
  // (run U.c / W.f / X.g, extended to the four new chapters — this is what routes the new weapons
  // through weaponCandidates/buildLevelUpChoices at all).
  {
    for (const chapter of ['undergrowth', 'city', 'skies', 'beyond']) {
      const allowed = new Set(CHAPTERS[chapter].weapons)
      const fresh = createRun(makeMeta(), { chapter })
      fresh.choiceSlots = 4
      let sawWeapon = false
      for (let i = 0; i < 400; i++) {
        for (const c of buildLevelUpChoices(fresh)) {
          if (c.kind !== 'weapon') continue
          sawWeapon = true
          assert(allowed.has(c.id), `expected a ${chapter} run to only offer its natives, got weapon '${c.id}'`)
        }
      }
      assert(sawWeapon, `expected at least one weapon card over 400 ${chapter} pools`)

      const owned = createRun(makeMeta(), { chapter })
      owned.weapons = CHAPTERS[chapter].weapons.map((id) => ({ id, level: 3 }))
      owned.choiceSlots = 4
      let sawMod = false
      for (let i = 0; i < 400; i++) {
        for (const c of buildLevelUpChoices(owned)) {
          if (c.kind !== 'mod') continue
          assert(allowed.has(c.weapon), `expected only ${chapter} weapon mods, got a '${c.weapon}' mod`)
          sawMod = true
        }
      }
      assert(sawMod, `expected ${chapter} weapon mods to appear over 400 pools`)
    }
    console.log('PASS run AA.k (pools): undergrowth/city/skies/beyond each offer only their own natives + mods')
  }

  // Balance bands (run W/X style): in every new chapter, the starter + 2 mods must clear a realistic
  // converging ring no slower than 3.5x that chapter's median native. Kill-time on a converging ring,
  // NOT an immortal-ring DPS race (the v4.4 lesson).
  {
    function measureTTK(weaponId, applyMods) {
      const run = createRun(makeMeta()) // body chapter: no signature/obstacles skewing the clear
      run.weapons = [{ id: weaponId, level: MAX_WEAPON_LEVEL }]
      run.mods.spawnMul = 0
      run.player.hp = 1e9; run.player.maxHP = 1e9
      if (applyMods) applyMods(run)
      const N = 14, radius = 150, hp = 50
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2
        run.enemies.push(makeStatusEnemy(run, { x: Math.cos(a) * radius, y: Math.sin(a) * radius, hp, speed: 45 }))
      }
      let t = 0
      const cap = 60
      for (let i = 0; i < Math.round(cap / dt); i++) {
        if (run.phase === 'levelup') { declineLevelUp(run); continue }
        t += dt
        // Pin the player: enemies converge on the origin, and no weapon may drift them off it.
        run.player.x = 0; run.player.y = 0
        stepSim(run, { x: 0, y: 0 }, dt)
        if (run.enemies.length === 0) return t
      }
      return cap
    }
    // { chapter: [[weaponId, mods], ...] } — the first entry of each is that chapter's STARTER.
    const bands = {
      undergrowth: [
        ['clawRake', (r) => { r.weaponMods.clawRake.rend = 0.35; r.weaponMods.clawRake.wideRake = 0.30 }],
        ['quillBurst', (r) => { r.weaponMods.quillBurst.sharpQuills = 0.25; r.weaponMods.quillBurst.moreQuills = 2 }],
        ['chitterShriek', (r) => { r.weaponMods.chitterShriek.shrill = 0.30; r.weaponMods.chitterShriek.shockwave = 0.30 }],
      ],
      city: [
        ['rainbow', (r) => { r.weaponMods.rainbow.wideBeam = 0.20; r.weaponMods.rainbow.longBeam = 0.20 }],
        ['trashTornado', (r) => { r.weaponMods.trashTornado.heavyTrash = 0.25; r.weaponMods.trashTornado.moreTrash = 1 }],
        ['sewerGeyser', (r) => { r.weaponMods.sewerGeyser.pressure = 0.30; r.weaponMods.sewerGeyser.wideGeyser = 0.30 }],
      ],
      skies: [
        ['roar', (r) => { r.weaponMods.roar.bellow = 0.30; r.weaponMods.roar.wideRoar = 0.30 }],
        ['tailSwipe', (r) => { r.weaponMods.tailSwipe.heavyTail = 0.30; r.weaponMods.tailSwipe.longTail = 0.30 }],
        ['debrisToss', (r) => { r.weaponMods.debrisToss.heavyDebris = 0.30; r.weaponMods.debrisToss.bigImpact = 0.30 }],
      ],
      beyond: [
        ['realityShard', (r) => { r.weaponMods.realityShard.keenShard = 0.25; r.weaponMods.realityShard.moreShards = 1 }],
        ['hole', (r) => { r.weaponMods.hole.biggerHole = 0.20; r.weaponMods.hole.denser = 0.20 }],
        ['tesseractBeam', (r) => { r.weaponMods.tesseractBeam.wideFold = 0.20; r.weaponMods.tesseractBeam.longFold = 0.20 }],
      ],
    }
    for (const [chapter, entries] of Object.entries(bands)) {
      const ttks = entries.map(([id, mods]) => [id, measureTTK(id, mods)])
      const [starterId, starterTTK] = ttks[0]
      const others = ttks.slice(1).map(([, t]) => t).sort((a, b) => a - b)
      const median = others[Math.floor(others.length / 2)]
      for (const [id, t] of ttks) {
        assert(t < 60, `expected ${chapter}'s ${id} to clear the ring within the cap, got ${t.toFixed(1)}s`)
      }
      assert(starterTTK <= median * 3.5,
        `expected ${chapter}'s starter within 3.5x the chapter median (${starterId}=${starterTTK.toFixed(1)}s, median=${median.toFixed(1)}s, ratio=${(starterTTK / median).toFixed(2)})`)
      console.log(`PASS run AA (${chapter} balance band): ${ttks.map(([id, t]) => `${id}TTK=${t.toFixed(1)}s`).join(' ')} ratio=${(starterTTK / median).toFixed(2)}x`)
    }
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
  testGoldSinks()
  testChoiceSlots()
  testDifficultyUnlock()
  testChapters()
  testChapterRuns()
  testChapterBehaviors()
  testPondWeapons()
  testGarden()
  testV54Flags()
  testV54Signatures()
  testV54Weapons()
  console.log('ALL TESTS PASSED')
} catch (err) {
  console.error('FAIL:', err.message)
  process.exit(1)
}
