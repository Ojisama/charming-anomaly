// Headless self-check for src/sim.js. Plain node, no framework: `npm test`.
import assert from 'node:assert'
import { createRun, loadMeta, ensureChapterMeta } from '../src/state.js'
import {
  SHOP, PASSIVES, RARITIES, spawnRate, hpScale, eliteEveryAt,
  MUTATORS, mergeMutatorMods, dailyMutators, todayKey, DAILY_MUTATOR_COUNT, randomMutators,
  sacrificeCost,
  SHIELD_HP_FRAC, SHIELD_DMG_MUL, SPLITTER_COUNT, VOLATILE_FUSE,
  OBSTACLE_STREAM_RADIUS, OBSTACLE_DROP_RADIUS,
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
  MISSILE_SPEED, MISSILE_STANDOFF,
  STRAFE_BANK_T, STRAFE_RUN_T, STRAFE_TELEGRAPH_T,
  MISSILE_INTERVAL, MISSILE_COUNT, MISSILE_R, MISSILE_DMG,
  ARTILLERY_INTERVAL, ARTILLERY_RADIUS, ARTILLERY_LEAD, ARTILLERY_ELITE_RADIUS, ARTILLERY_FIRE_RANGE, SHELL_MAX_LIVE,
  BOMBARDMENT_COUNT, BOMBARDMENT_SPREAD, BOMBARDMENT_RADIUS, BOMBARDMENT_FUSE, BOMBARDMENT_DMG,
  BLINK_INTERVAL, BLINK_DIST, BLINK_MIN_DIST,
  PHASE_SOLID_T, PULL_BEAM_INTERVAL, PULL_BEAM_RANGE, PULL_BEAM_FORCE,
  GRAVITY_MIN_DIST, GRAVITY_MIN_GAP, GRAVITY_WELL_R, GRAVITY_FORCE,
  CLAW_DOUBLE_EVERY, QUILL_RETALIATE_CD, FEAR_SPEED_MUL,
  GEYSER_CHAIN_FRAC, ROAR_RESONANCE_EVERY, TESSERACT_ARMS,
  DISTRICTS, districtAt, districtTintAt, DISTRICT_STRUCTURE_KINDS,
  LANE_SCROLL_SPEED, LANE_STRAFE_MUL, MARCH_SWAY_RATE, REPULSE_RADIUS, REPULSE_CD,
  STRUCTURE_KINDS, CRUSH_XP, GEM_VALUE, RAMPAGE_GAIN, RAMPAGE_DECAY, RAMPAGE_DURATION, RAMPAGE_CRUSH_MUL,
  RAMPAGE_SPEED_MUL,
  roadAt, nearestCity, CITY_GRID, elevationAt, urbanAt, pickWorldSeed, terrainAt, BIOME_BUILD_DENSITY,
  BLANK_SCRIPT, BLANK_WAVE_TIMEOUT, BLANK_BOSS_R, chapterMaxDifficulty,
  BLANK_READ1_T, BLANK_YANK_T, BLANK_NODE_T, BLANK_YANK_DMG,
  BLANK_PHASE_LEVELS, BLANK_BOSS_SPEED_P3, BLANK_READ3_T, BLANK_BAND_LEN, BLANK_FAN_N,
  SPAWN_RING, CHAPTER_ENDINGS, CHAPTER_UNLOCK_LINES,
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

  // (f) An element card's desc reports the potency its rarity actually bought. This used to be
  // the static ELEMENTS.desc, so every tier read identically and the rarity badge looked
  // decorative — it never was. Roll a pile of card sets and check every element card agrees
  // with its own bonus, and that the tiers genuinely produce different text.
  {
    const descs = new Set()
    let checked = 0
    for (let i = 0; i < 400; i++) {
      const run = createRun(makeMeta())
      for (const c of buildLevelUpChoices(run)) {
        if (c.kind !== 'element') continue
        checked++
        const shown = `+${Math.round(c.bonus * 10) / 10} potency`
        assert(c.desc.startsWith(shown), `element card desc ${JSON.stringify(c.desc)} should lead with ${shown} (bonus ${c.bonus})`)
        descs.add(c.desc)
      }
    }
    assert(checked > 0, 'expected at least one element card across 400 level-up rolls')
    assert(descs.size > 4, `expected element descs to vary by rarity, got ${descs.size} distinct across ${checked} cards`)
    console.log(`PASS run G.f (element card desc shows its rolled potency — ${checked} cards, ${descs.size} distinct)`)
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

  // f. The beam is DOUBLE-ENDED (v5.6.14, Darth Maul): a plain cast is 2 arms ~π apart, and
  // Prismatic Split adds arms on top (prismatic=1 -> 3 arms, evenly spread).
  {
    const base = createRun(makeMeta())
    base.weapons = [{ id: 'rainbow', level: 1 }]
    let fired = false
    for (let i = 0; i < Math.round(9 / dt) && !fired; i++) {
      if (base.phase === 'levelup') { declineLevelUp(base); continue }
      stepSim(base, { x: 0, y: 0 }, dt)
      if (base.beams.length > 0) fired = true
    }
    assert(fired, 'expected the beam to cast at least once')
    assert.strictEqual(base.beams.length, 2, `expected a double-ended staff (2 arms), got ${base.beams.length}`)
    const diff = Math.abs(base.beams[0].angle - base.beams[1].angle)
    const normalized = Math.min(diff, Math.abs(diff - 2 * Math.PI))
    assert(Math.abs(normalized - Math.PI) < 0.05, `expected the two arms ~π apart, got ${normalized.toFixed(3)}`)

    const run = createRun(makeMeta())
    run.weapons = [{ id: 'rainbow', level: 1 }]
    run.weaponMods.rainbow.prismatic = 1
    let fired2 = false
    for (let i = 0; i < Math.round(9 / dt) && !fired2; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.beams.length > 0) fired2 = true
    }
    assert(fired2, 'expected the prismatic cast to fire')
    assert.strictEqual(run.beams.length, 3, `expected 2 base arms + 1 prismatic, got ${run.beams.length}`)
    console.log(`PASS run L.f (double-ended + prismatic): base arms=2 at ${normalized.toFixed(3)} rad, prismatic total=${run.beams.length}`)
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

  // (c2) dashBurst COMMITS its heading: a dash must never track a player who sidesteps out of it.
  // V.c above cannot catch this — it parks the player 5000px away, so the seek direction barely
  // moves, which is exactly the one case a homing dash and a committed dash agree on. The dash runs
  // at DASH_SPEED_MUL of the enemy's speed, well over PLAYER.baseSpeed, so if it re-aims there is
  // no counterplay at all: you can neither outrun it nor step out of it.
  {
    const run = createRun(makeMeta())
    run.weapons = []
    run.player.x = 300; run.player.y = 0
    const e = makeStatusEnemy(run, { x: 0, y: 0, hp: 1e6, speed: 100 })
    e.flags = ['dashBurst']
    run.enemies.push(e)
    // walk it through the idle phase so the heading locks onto the player, out at +x
    const idleSteps = Math.round(DASH_IDLE_T / dt) + 1
    for (let i = 0; i < idleSteps; i++) stepSim(run, { x: 0, y: 0 }, dt)
    const mid = run.enemies.find((en) => en.id === e.id)
    assert.strictEqual(mid._dashPhase, 'dash', 'expected the enemy to be mid-dash after the idle phase')

    // now sidestep hard — the player leaves the dash lane entirely
    run.player.x = 0; run.player.y = 400
    const from = { x: mid.x, y: mid.y }
    for (let i = 0; i < Math.round((DASH_T / dt) * 0.6); i++) stepSim(run, { x: 0, y: 0 }, dt)
    const after = run.enemies.find((en) => en.id === e.id)
    const mvx = after.x - from.x, mvy = after.y - from.y
    assert(mvx > 0, `expected the dash to keep flying along its locked +x heading (moved ${mvx.toFixed(1)}px)`)
    const steer = Math.abs(mvy) / Math.max(1e-6, Math.abs(mvx))
    assert(steer < 0.02, `a dash must not steer toward a sidestepping player (|dy|/|dx| = ${steer.toFixed(3)})`)
    console.log(`PASS run V.c2 (dashBurst commits): flew ${mvx.toFixed(0)}px along the locked heading, steered ${(steer * 100).toFixed(1)}% toward the sidestep`)
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
    run.weapons = []; run.obstacles = []; run._obstacleSeed = null; run.enemies = []
    run.player.x = 123; run.player.y = -456
    const x0 = run.player.x, y0 = run.player.y
    stepSim(run, { x: 0, y: 0 }, dt) // run.time is advanced by the step; sample the field after so it matches
    const f = currentForce(run, x0, y0)
    const dx = run.player.x - x0, dy = run.player.y - y0
    assert(Math.abs(dx - f.fx * dt) < 1e-6 && Math.abs(dy - f.fy * dt) < 1e-6,
      `expected drift == currentForce*dt, got d=(${dx.toFixed(4)},${dy.toFixed(4)}) vs f*dt=(${(f.fx * dt).toFixed(4)},${(f.fy * dt).toFixed(4)})`)
    console.log(`PASS run V.f2 (currentForce): maxMag=${maxMag.toFixed(1)}px/s continuityJump=${jump.toFixed(4)} bodyZero drift==force*dt`)
  }

  // (g) obstacles STREAM (v5.6.13): present around the spawn, present ANYWHERE the player roams
  // (the old origin-only field left the world beyond 900px empty — "obstacles are only in the
  // beginning zone"), deterministic per run (walk away and back -> the SAME rocks), dropped when
  // far, spawn ring kept clear, no overlaps. Body still has none.
  {
    const pond = createRun(makeMeta(), { chapter: 'pond' })
    stepSim(pond, { x: 0, y: 0 }, dt)
    const nearSpawn = pond.obstacles.length
    assert(nearSpawn > 0, 'expected streamed obstacles around the spawn after one step')
    for (const o of pond.obstacles) {
      assert(Math.hypot(o.x, o.y) >= CHAPTERS.pond.obstacles.minDist - 1e-6,
        `spawn clear ring violated: obstacle at ${Math.hypot(o.x, o.y).toFixed(0)}px from origin`)
    }
    for (let i = 0; i < pond.obstacles.length; i++) {
      for (let j = i + 1; j < pond.obstacles.length; j++) {
        const a = pond.obstacles[i], b = pond.obstacles[j]
        const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r
        assert(gap >= -1e-6, `expected no two pond obstacles to overlap, got gap=${gap}`)
      }
    }
    // roam far beyond the old 900px field: obstacles must exist there too
    pond.player.x = 5000; pond.player.y = -3000
    stepSim(pond, { x: 0, y: 0 }, dt)
    const farKey = (o) => `${o.x.toFixed(2)},${o.y.toFixed(2)},${o.r.toFixed(2)}`
    const farOnes = pond.obstacles.filter((o) => Math.hypot(o.x - 5000, o.y + 3000) <= OBSTACLE_STREAM_RADIUS)
    assert(farOnes.length > 0, 'expected obstacles far from the origin — the old field left this empty')
    const snapshot = farOnes.map(farKey).sort().join('|')
    // leave (everything old drops)...
    pond.player.x = 20000; pond.player.y = 20000
    stepSim(pond, { x: 0, y: 0 }, dt)
    assert(pond.obstacles.every((o) => Math.hypot(o.x - 20000, o.y - 20000) <= OBSTACLE_DROP_RADIUS + 1e-6),
      'expected far-behind obstacles to be dropped')
    // ...and come back: the SAME cells regenerate the SAME rocks
    pond.player.x = 5000; pond.player.y = -3000
    stepSim(pond, { x: 0, y: 0 }, dt)
    const again = pond.obstacles.filter((o) => Math.hypot(o.x - 5000, o.y + 3000) <= OBSTACLE_STREAM_RADIUS).map(farKey).sort().join('|')
    assert.strictEqual(again, snapshot, 'expected the same cells to regenerate the same obstacles')

    const body = createRun(makeMeta())
    stepSim(body, { x: 0, y: 0 }, dt)
    assert.strictEqual(body.obstacles.length, 0, 'expected a body run to have no obstacles')

    // Push-out: steer a player straight into a nearby (manually placed) obstacle for 1s.
    const run = createRun(makeMeta(), { chapter: 'pond' })
    run.weapons = []
    run.player.x = 0; run.player.y = 0
    const obstacle = { x: 150, y: 0, r: 40 }
    run.obstacles = [obstacle]; run._obstacleSeed = null // manual field: keep streaming out of it
    const minSep = obstacle.r + PLAYER.radius
    const steps2 = Math.round(1 / dt)
    for (let i = 0; i < steps2; i++) stepSim(run, { x: 1, y: 0 }, dt)
    const dist = Math.hypot(run.player.x - obstacle.x, run.player.y - obstacle.y)
    assert(dist >= minSep - 0.5, `expected the player pushed out of the obstacle (dist=${dist.toFixed(1)}, min=${minSep.toFixed(1)})`)
    console.log(`PASS run V.g (obstacles stream): nearSpawn=${nearSpawn} far=${farOnes.length} deterministic revisit, body=0, pushed dist=${dist.toFixed(1)}`)
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
      const anchor = makeStatusEnemy(run, { x: 60, y: 0, hp: 1e9, speed: 0 })
      run.enemies.push(anchor)
      const behind = makeStatusEnemy(run, { x: -100, y: 0, hp: 1e6, speed: 0 })
      run.enemies.push(behind)
      // Enough time for well past FLAGELLA_CYCLONE_EVERY swings (rate ~0.58s at max level).
      for (let i = 0; i < Math.round((FLAGELLA_CYCLONE_EVERY + 2) * 0.9 / dt); i++) {
        if (run.phase === 'levelup') { declineLevelUp(run); continue }
        stepSim(run, { x: 0, y: 0 }, dt)
        // v6.2 melee knockback shoves the anchor; re-pin it so the aim stays locked +x (the
        // scenario tests ARC selection, not target drift).
        anchor.x = 60; anchor.y = 0; anchor.kb.x = 0; anchor.kb.y = 0
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
      run.weapons = []; run.obstacles = []; run._obstacleSeed = null; run.mods.spawnMul = 0
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
    run.weapons = []; run.obstacles = []; run._obstacleSeed = null; run.mods.spawnMul = 0
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
      run.weapons = []; run.obstacles = []; run._obstacleSeed = null; run.mods.spawnMul = 0
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
    run.weapons = []; run.obstacles = []; run._obstacleSeed = null; run.mods.spawnMul = 0
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
      run.weapons = []; run.obstacles = []; run._obstacleSeed = null; run.mods.spawnMul = 0
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
    burst.weapons = []; burst.obstacles = []; burst._obstacleSeed = null; burst.mods.spawnMul = 0
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
    run.obstacles = []; run._obstacleSeed = null; run.mods.spawnMul = 0
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
      r.obstacles = []; r._obstacleSeed = null; r.mods.spawnMul = 0
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
    run.weapons = []; run.obstacles = []; run._obstacleSeed = null; run.mods.spawnMul = 0
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
    run.obstacles = []; run._obstacleSeed = null; run.mods.spawnMul = 0; run.traps = []
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

  // (b2) 'climb' is the owl's PUNISH window: hittable, but still harmless. It used to be immune,
  // which meant the bird dove onto you, connected, and peeled off invincible — the only window it
  // could be killed in was the 0.45s strike ('mark' is touchable but happens out at AERIAL_RADIUS
  // 240px, past every short-range weapon), so owls piled up unkillable. Measured over a 180s
  // standing run: 56/57/51/56/63 owls alive at the end before, 13/15/11/15/10 after.
  {
    const run = createRun(makeMeta(), { chapter: 'undergrowth' })
    run.weapons = [{ id: 'star', level: MAX_WEAPON_LEVEL }]
    run.obstacles = []; run._obstacleSeed = null; run.mods.spawnMul = 0; run.traps = []
    run.player.x = 0; run.player.y = 0; run.player.hp = 1e9; run.player.maxHP = 1e9
    const owl = makeStatusEnemy(run, { x: 100, y: 0, hp: 1e6, speed: 100 })
    owl.flags = ['aerialStrike']
    run.enemies.push(owl)
    // fly it all the way round to 'climb'
    const toClimb = Math.round((AERIAL_CIRCLE_T + AERIAL_MARK_T + AERIAL_STRIKE_T + 0.05) / dt)
    for (let i = 0; i < toClimb; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
    }
    assert.strictEqual(owl._airState, 'climb', `expected the owl climbing, got '${owl._airState}'`)

    // hittable on the way out...
    owl.hp = 1e6
    owl.x = run.player.x; owl.y = run.player.y
    const hpBefore = owl.hp
    const pHp0 = run.player.hp
    run.player.invuln = 0
    for (let i = 0; i < 20; i++) {
      if (run.phase === 'levelup') { declineLevelUp(run); continue }
      stepSim(run, { x: 0, y: 0 }, dt)
      owl.x = run.player.x; owl.y = run.player.y // pin it on top of the player
    }
    assert(owl.hp < hpBefore, `a climbing owl must be hittable — this is the punish window (hp=${owl.hp})`)
    // ...but still can't hurt you: its strike already had its hit.
    assert.strictEqual(run.player.hp, pHp0, 'a climbing owl must deal NO contact damage')
    console.log(`PASS run Y.b2 (aerialStrike climb): punish window — owl took ${(hpBefore - owl.hp).toFixed(0)} dmg while climbing, dealt 0`)
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

  // (e) strafe: a jet banks out to its standoff, holds still for a TELEGRAPH, then flies a straight
  // pass — the run window covers far more ground than the bank, and it ends up PAST the player.
  //
  // v5.9.1: the telegraph is new, and it is the point of this test now. The user reported jets were
  // "not avoidable when they cross the screen": bank ended and the jet was instantly on you at
  // STRAFE_RUN_SPEED_MUL (4.5x) with no tell at all. The wind-up is what makes the pass dodgeable,
  // so assert it exists, that the jet HOLDS POSITION through it (a telegraph that drifts is a lie
  // about where the pass lands), and that it announces itself so render can draw the line.
  {
    const { run, e } = flagRun('skies', ['strafe'], { at: 500 })
    const bankDist = moved(run, e, STRAFE_BANK_T)
    assert.strictEqual(e._strafeState, 'telegraph', `expected 'telegraph' after the bank, got '${e._strafeState}'`)
    assert(run.events.some((ev) => ev.type === 'strafeLock'), 'expected the lock to announce itself for render')

    const telegraphDist = moved(run, e, STRAFE_TELEGRAPH_T)
    assert(telegraphDist < 1, `expected the jet to hold still through the telegraph, moved ${telegraphDist.toFixed(1)}px`)
    // one more frame to cross the boundary: the state flips on `_strafeT <= 0`, and stepping
    // exactly STRAFE_TELEGRAPH_T lands ON zero, where float accumulation decides the winner.
    stepSim(run, { x: 0, y: 0 }, dt)
    assert.strictEqual(e._strafeState, 'run', `expected 'run' after the telegraph, got '${e._strafeState}'`)

    // the wind-up has to buy enough time to actually step out of the lane, or it is decoration.
    const dodgePx = PLAYER.baseSpeed * STRAFE_TELEGRAPH_T
    assert(dodgePx > e.radius * 2, `expected the telegraph to buy a real dodge, only ${dodgePx.toFixed(0)}px`)

    const runDist = moved(run, e, STRAFE_RUN_T)
    assert(runDist > bankDist * 2, `expected the strafing run to outpace the bank (bank=${bankDist.toFixed(1)}, run=${runDist.toFixed(1)})`)
    console.log(`PASS run Y.e (strafe): bank=${bankDist.toFixed(1)}px telegraph=hold(${dodgePx.toFixed(0)}px dodge window) run=${runDist.toFixed(1)}px`)
  }

  // (f) missileVolley: a helicopter holds its standoff and fires MISSILE_COUNT run.enemyShots per
  // volley; a missile that reaches the player damages the PLAYER (and nothing else).
  {
    const { run } = flagRun('skies', ['missileVolley'], { at: 300 })
    for (let i = 0; i < Math.round((MISSILE_INTERVAL + 0.6) / dt); i++) stepSim(run, { x: 0, y: 0 }, dt)
    assert(run.enemyShots.length >= MISSILE_COUNT, `expected a volley of ${MISSILE_COUNT} missiles, got ${run.enemyShots.length}`)

    const hit = createRun(makeMeta(), { chapter: 'skies' })
    hit.weapons = []; hit.obstacles = []; hit._obstacleSeed = null; hit.mods.spawnMul = 0
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

    // v5.6.15 invariants — the skies was reported "impossible" and both of these were violated:
    // (1) a missile must be OUTRUNNABLE (its own comment always claimed running was the
    //     counterplay, but SPEED was 240 vs the player's 220); (2) the helicopter's standoff must
    //     sit inside the chapter starter's reach, or the common spawn is unkillable and
    //     accumulates into a missile hell (217 alive at t=180 — the owl bug at chapter scale).
    assert(MISSILE_SPEED < PLAYER.baseSpeed,
      `a missile (${MISSILE_SPEED}) must be slower than the player (${PLAYER.baseSpeed}) — outrunning is the stated counterplay`)
    assert(MISSILE_STANDOFF < WEAPONS.roar.levels[0].range,
      `the helicopter standoff (${MISSILE_STANDOFF}) must sit inside the skies starter's L1 reach (${WEAPONS.roar.levels[0].range})`)
  }

  // (g) artillery: a tank column shells the player's PREDICTED position (velocity × ARTILLERY_LEAD)
  // into run.bombs — the shared volatile-bomb array, so the blast damages BOTH sides. Elites shell
  // wider (ARTILLERY_ELITE_RADIUS). v5.7.5: only while within ARTILLERY_FIRE_RANGE, and never past
  // SHELL_MAX_LIVE live telegraphs — so the tank sits AHEAD of the +x-running player (at: -300 →
  // x=+300) to stay in range for the full interval.
  {
    const { run } = flagRun('skies', ['artillery'], { at: -300, speed: 20 })
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

    // v5.7.5 range gate: a tank parked beyond ARTILLERY_FIRE_RANGE never fires, however long it waits.
    const far = flagRun('skies', ['artillery'], { at: ARTILLERY_FIRE_RANGE + 200, speed: 0 })
    far.run._bombardAcc = 1e6
    for (let i = 0; i < Math.round((ARTILLERY_INTERVAL + 1.0) / dt); i++) stepSim(far.run, { x: 0, y: 0 }, dt)
    assert.strictEqual(far.run.bombs.length, 0, `expected an out-of-range tank to hold fire, got ${far.run.bombs.length} shells`)

    // v5.7.5 live cap: with SHELL_MAX_LIVE telegraphs already up, neither artillery nor the
    // bombardment signature adds another (the barrage backstop).
    const cap = flagRun('skies', ['artillery'], { at: 300, speed: 0 })
    for (let i = 0; i < SHELL_MAX_LIVE; i++) cap.run.bombs.push({ x: 9000, y: 9000, radius: 1, fuse: 99, duration: 99, dmg: 0 })
    for (let i = 0; i < Math.round((ARTILLERY_INTERVAL + 1.0) / dt); i++) stepSim(cap.run, { x: 0, y: 0 }, dt)
    assert.strictEqual(cap.run.bombs.length, SHELL_MAX_LIVE, `expected the shell cap to hold at ${SHELL_MAX_LIVE}, got ${cap.run.bombs.length}`)

    console.log(`PASS run Y.g (artillery): shell led ${lead.toFixed(1)}px ahead; elites shell wider; range gate + ${SHELL_MAX_LIVE}-shell cap hold`)
  }

  // (h) blink: a blinker teleports toward the player — never landing closer than BLINK_MIN_DIST,
  // and never inside an obstacle (it gives up rather than cheating through one).
  {
    // v5.18: these three use a FREE-ROAM chapter, not 'beyond'. Beyond is now a lane (its player
    // auto-advances up-screen at LANE_SCROLL_SPEED), which moves the blink's target ~418px during
    // the 2.2s interval and slides the walled case's blocking obstacles off the blink path. `blink`
    // is chapter-agnostic vocabulary, so testing it in a chapter whose movement mode interferes was
    // testing two things at once.
    const { run, e } = flagRun('city', ['blink'], { at: 600, speed: 40 })
    const x0 = e.x
    for (let i = 0; i < Math.round((BLINK_INTERVAL + 0.05) / dt); i++) stepSim(run, { x: 0, y: 0 }, dt)
    const jumped = e.x - x0
    assert(jumped > BLINK_DIST * 0.9, `expected a ~${BLINK_DIST}px blink toward the player, got ${jumped.toFixed(1)}px`)

    // Clamp: from just outside BLINK_MIN_DIST it may only close the remaining gap, never overshoot.
    const near = flagRun('city', ['blink'], { at: BLINK_MIN_DIST + 60, speed: 0 })
    for (let i = 0; i < Math.round((BLINK_INTERVAL + 0.05) / dt); i++) stepSim(near.run, { x: 0, y: 0 }, dt)
    const dist = Math.hypot(near.e.x - near.run.player.x, near.e.y - near.run.player.y)
    assert(dist >= BLINK_MIN_DIST - 1e-6, `expected a blink never to land closer than ${BLINK_MIN_DIST}, got ${dist.toFixed(1)}`)

    // Obstacle: block both the full-distance and the half-distance landing spots -> no blink at all.
    const walled = flagRun('city', ['blink'], { at: 600, speed: 0 })
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
    run.obstacles = []; run._obstacleSeed = null; run.wells = []; run.mods.spawnMul = 0
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
    // v5.18: 'city', not 'beyond' — same reason as the blink cases above. Beyond is a lane now,
    // so its player advances up-screen every frame and cannot "stand still" for a drag test. The
    // lane's own y-axis rule for this beam (it drags sideways only there) is asserted in run CF.
    const { run, e } = flagRun('city', ['pullBeam'], { at: -200, speed: 0, elite: true }) // UFO at +200
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
    run.weapons = []; run.obstacles = []; run._obstacleSeed = null; run.traps = []; run.mods.spawnMul = 0
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
      r.weapons = []; r.obstacles = []; r._obstacleSeed = null; r.traps = []; r.mods.spawnMul = 0
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
    run.weapons = []; run.obstacles = []; run._obstacleSeed = null; run.mods.spawnMul = 0
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
    kite.weapons = []; kite.obstacles = []; kite._obstacleSeed = null; kite.mods.spawnMul = 0
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
      run.weapons = []; run.obstacles = []; run._obstacleSeed = null; run.mods.spawnMul = 0
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

    // v5.6.14: a car ONE-SHOTS the light roster (TRAFFIC_SQUASH: non-elite ratDrone/pigeon die
    // outright, far beyond TRAFFIC_DMG), while an ELITE of the same species just takes TRAFFIC_DMG.
    const squash = laneRun()
    const drone = makeStatusEnemy(squash, { x: 300, y: 0, hp: 1e6, speed: 0 })
    drone.flags = []; drone.rosterId = 'ratDrone'; drone.elite = false
    const eliteDrone = makeStatusEnemy(squash, { x: -300, y: 0, hp: 1e6, speed: 0 })
    eliteDrone.flags = []; eliteDrone.rosterId = 'ratDrone'; eliteDrone.elite = true
    squash.enemies.push(drone, eliteDrone)
    for (let i = 0; i < Math.round((TRAFFIC_WARN + TRAFFIC_SWEEP + 0.1) / dt); i++) stepSim(squash, { x: 0, y: 0 }, dt)
    assert(drone._dead || drone.hp <= 0, `expected the car to ONE-SHOT a basic drone, hp=${drone.hp}`)
    assert(eliteDrone.hp >= 1e6 - TRAFFIC_DMG * 2 && eliteDrone.hp < 1e6,
      `expected the ELITE drone to take ordinary car damage, not a one-shot (hp=${eliteDrone.hp})`)

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
    console.log(`PASS run Z.b (traffic): warn harmless, sweep flattens BOTH sides + knockback, one-shots basics, spares elites, <= ${maxAlive} lane(s) live`)
  }

  // (c) bombardment: telegraphed circles rain on the player's area continuously, and (being run.bombs)
  // they damage BOTH sides.
  {
    const run = createRun(makeMeta(), { chapter: 'skies' })
    run.weapons = []; run.obstacles = []; run._obstacleSeed = null; run.mods.spawnMul = 0
    run.player.x = 0; run.player.y = 0; run.player.hp = 1e9; run.player.maxHP = 1e9; run.player.invuln = 0
    const victim = makeStatusEnemy(run, { x: 0, y: 0, hp: 1e6, speed: 0 })
    run.enemies.push(victim)

    let sawBombs = 0
    for (let i = 0; i < Math.round(9 / dt); i++) {
      stepSim(run, { x: 0, y: 0 }, dt)
      sawBombs = Math.max(sawBombs, run.bombs.length)
      for (const b of run.bombs) {
        assert.strictEqual(b.radius, BOMBARDMENT_RADIUS, `expected bombardment radius ${BOMBARDMENT_RADIUS}, got ${b.radius}`)
        assert(Math.hypot(b.x - run.player.x, b.y - run.player.y) <= BOMBARDMENT_SPREAD + 1e-6, 'expected bombs scattered within BOMBARDMENT_SPREAD of the player')
      }
    }
    assert(sawBombs >= BOMBARDMENT_COUNT, `expected >= ${BOMBARDMENT_COUNT} bombs alive at once, saw ${sawBombs}`)
    // v5.7.5: the scatter is area-uniform across a wide disc now (a storm, not a sniper), so a 9s
    // run may legitimately never roll a strike onto the origin — plant one dead-center to test the
    // both-sides damage contract (that part is stepBombs's job, not the scatter's).
    run.bombs.length = 0
    run.player.invuln = 0
    let hurt = false
    run.bombs.push({ x: 0, y: 0, radius: BOMBARDMENT_RADIUS, fuse: 0.1, duration: BOMBARDMENT_FUSE, dmg: BOMBARDMENT_DMG })
    for (let i = 0; i < Math.round(0.5 / dt); i++) {
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.events.some((ev) => ev.type === 'hurt')) hurt = true
    }
    assert(hurt, 'expected a strike landing on the player to damage them')
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
    run.weapons = []; run.obstacles = []; run._obstacleSeed = null; run.mods.spawnMul = 0
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
    bodies.weapons = []; bodies.obstacles = []; bodies._obstacleSeed = null; bodies.mods.spawnMul = 0
    bodies.player.x = 0; bodies.player.y = 0; bodies.player.hp = 1e9; bodies.player.maxHP = 1e9
    bodies.wells = [{ x: 60, y: 0, r: GRAVITY_WELL_R, g: GRAVITY_FORCE }]
    const still = makeStatusEnemy(bodies, { x: 0, y: 60, hp: 1e6, speed: 0 })
    still.flags = []
    bodies.enemies.push(still)
    const px0 = bodies.player.x, py0 = bodies.player.y
    for (let i = 0; i < Math.round(0.5 / dt); i++) stepSim(bodies, { x: 0, y: 0 }, dt)
    assert.strictEqual(still.x, 0, `expected a well to never move an enemy body, x=${still.x}`)
    assert.strictEqual(still.y, 60, `expected a well to never move an enemy body, y=${still.y}`)
    // v5.18: beyond is a lane, so the player ADVANCES up it every frame by design. What a well must
    // never do is move them off their strafe line — so pin x exactly, and pin y to exactly the
    // lane's own scroll (which doubles as the lane invariant: nothing may change the scroll rate).
    assert.strictEqual(bodies.player.x, px0, 'expected a well to never move the player sideways')
    const laneDrift = py0 - bodies.player.y
    const expectDrift = LANE_SCROLL_SPEED * Math.round(0.5 / dt) * dt
    assert(Math.abs(laneDrift - expectDrift) < 1e-6,
      `expected the player to advance at exactly LANE_SCROLL_SPEED and nothing else, drifted ${laneDrift.toFixed(2)} vs ${expectDrift.toFixed(2)}`)
    assert(!bodies.events.some((ev) => ev.type === 'hurt' || ev.type === 'hit'), 'expected wells to damage nothing')
    console.log(`PASS run Z.d (gravity): ${seeded.wells.length} wells seeded, bullet bent to vy=${b.vy.toFixed(0)} with speed error ${maxSpeedErr.toExponential(1)}, bodies untouched`)
  }

  console.log('PASS run Z (v5.4 signatures): predators traps, traffic lanes, bombardment, gravity wells')
}

// ---- Run ZR: v5.21 repulsion + asteroids ----------------------------------------------------
// The lane's two answers to "strafe-only means sometimes you can't do anything". Repulsion buys
// space you cannot walk to; asteroids are a hazard that hurts BOTH sides, so the pair is a combo
// (shove a rank into a rock) rather than two unrelated buttons.
function testLaneSkills() {
  const dt = 1 / 60

  function laneRun() {
    const run = createRun(makeMeta(), { chapter: 'beyond' })
    run.weapons = []; run.obstacles = []; run._obstacleSeed = null; run.mods.spawnMul = 0
    run._formationT = 1e6; run._rockAcc = 1e6   // park both spawners; these cases place things by hand
    run.rocks = []
    run.player.x = 0; run.player.y = 0
    run.player.hp = 1e9; run.player.maxHP = 1e9
    return run
  }

  // (a) Repulsion shoves nearby enemies away and stuns them, costs no HP, and respects its cooldown.
  {
    const run = laneRun()
    const near = makeStatusEnemy(run, { x: 120, y: 0, speed: 0 })
    const far = makeStatusEnemy(run, { x: REPULSE_RADIUS + 200, y: 0, speed: 0 })
    run.enemies.push(near, far)
    const nearHp = near.hp, farX0 = far.x

    stepSim(run, { x: 0, y: 0, skill: true }, dt)
    assert(run.events.some((e) => e.type === 'repulse'), 'expected a repulse event')
    assert(near.stunT > 0, `expected the near enemy stunned, got ${near.stunT}`)
    assert.strictEqual(near.hp, nearHp, 'expected repulsion to deal NO damage — it buys space, not kills')
    assert(Math.abs(run.repulseCd - REPULSE_CD) < 1e-6, `expected the cooldown armed, got ${run.repulseCd}`)

    for (let i = 0; i < Math.round(0.5 / dt); i++) stepSim(run, { x: 0, y: 0 }, dt)
    assert(near.x > 120 + 40, `expected the near enemy shoved outward, x 120->${near.x.toFixed(0)}`)
    assert(Math.abs(far.x - farX0) < 1e-6, `expected an enemy beyond REPULSE_RADIUS untouched, moved to ${far.x.toFixed(1)}`)

    // On cooldown: pressing again does nothing at all.
    const cdBefore = run.repulseCd
    const evs0 = run.events.length
    stepSim(run, { x: 0, y: 0, skill: true }, dt)
    assert(run.repulseCd < cdBefore, 'expected the cooldown to keep ticking down, not re-arm')
    assert(!run.events.slice(evs0).some((e) => e.type === 'repulse'), 'expected no second repulse while on cooldown')
    console.log(`PASS run ZR.a (repulsion): shoved to x=${near.x.toFixed(0)}, stunned, 0 dmg, cd ${REPULSE_CD}s respected`)
  }

  // (b) An asteroid grinds enemies that overlap it — this is what makes shoving things into one worth
  // doing — and it hurts the player on contact.
  {
    const run = laneRun()
    const victim = makeStatusEnemy(run, { x: 0, y: -600, hp: 1e6, speed: 0 })
    run.enemies.push(victim)
    run.rocks.push({ x: 0, y: -600, r: 60, vx: 0, rot: 0, spin: 0, _acc: 0 })
    const hp0 = victim.hp
    for (let i = 0; i < Math.round(0.5 / dt); i++) stepSim(run, { x: 0, y: 0 }, dt)
    assert(victim.hp < hp0, `expected the rock to grind an overlapping enemy, hp ${hp0}->${victim.hp}`)
    console.log(`PASS run ZR.b (asteroid grinds enemies): ${(hp0 - victim.hp).toFixed(0)} dmg over 0.5s`)
  }

  // (c) ...and the same rock damages the PLAYER. Sat directly on them, with invuln cleared so the
  // gate cannot mask it — the point is that a rock is neutral, not that it is enemy-only.
  {
    const run = laneRun()
    run.player.hp = 500; run.player.maxHP = 500
    run.player.invuln = 0
    run.rocks.push({ x: run.player.x, y: run.player.y, r: 70, vx: 0, rot: 0, spin: 0, _acc: 0 })
    const hp0 = run.player.hp
    stepSim(run, { x: 0, y: 0 }, dt)
    assert(run.player.hp < hp0, `expected a rock overlapping the player to hurt, hp ${hp0}->${run.player.hp}`)
    assert(run.events.some((e) => e.type === 'rockhit'), 'expected a rockhit event')
    console.log(`PASS run ZR.c (asteroid hurts the player): hp ${hp0}->${run.player.hp}`)
  }

  // (e) v5.22: the Tesseract Beam fans FORWARD in a lane. It used to rake a full circle from an
  // angle picked by nearestEnemy, so in a scrolled level most of its duty cycle pointed at empty
  // space behind the player — and the cast could lock onto a straggler that had already gone past.
  {
    const run = laneRun()
    run.weapons = [{ id: 'tesseractBeam', level: 1 }]
    // A decoy BEHIND the player: under the old aimAngle path this is what the beam aimed at.
    run.enemies.push(makeStatusEnemy(run, { x: 0, y: 400, speed: 0 }))
    let fired = null
    for (let i = 0; i < Math.round(9 / dt) && !fired; i++) {
      stepSim(run, { x: 0, y: 0 }, dt)
      if (run.beams.length > 0) fired = run.beams[0]
    }
    assert(fired, 'expected the tesseract beam to fire within 9s (L1 rate is 6.5s)')
    assert(fired.fan > 0, 'expected fan mode in a lane chapter')
    // Every arm, across the whole sweep, must have a forward (negative-y) component.
    let worst = -Infinity
    for (let i = 0; i < Math.round(fired.duration / dt); i++) {
      stepSim(run, { x: 0, y: 0 }, dt)
      const b = run.beams[0]
      if (!b) break
      const arms = []
      for (let k = 0; k < b.arms; k++) arms.push(b.angle - b.fan / 2 + (k / (b.arms - 1)) * b.fan)
      for (const a of arms) worst = Math.max(worst, Math.sin(a)) // +sin = pointing DOWN = behind
    }
    assert(worst < 0, `expected every tesseract arm to point forward; worst sin(angle)=${worst.toFixed(3)}`)
    console.log(`PASS run ZR.e (tesseract fans forward): no arm ever pointed behind (worst sin=${worst.toFixed(2)})`)
  }

  // (f) v5.22: a vortex has to FIT on a phone. The binding constraint is half the screen WIDTH
  // (~215 CSS px), not run.viewRadius (~535, which is half the diagonal) — reading the diagonal is
  // what let 300-460px radii look defensible while rendering as a flat wash with a blob in it.
  {
    const PHONE_HALF_WIDTH = 215
    for (let lv = 0; lv < WEAPONS.hole.levels.length; lv++) {
      const r = WEAPONS.hole.levels[lv].radius
      assert(r <= PHONE_HALF_WIDTH, `hole L${lv + 1} radius ${r} exceeds a phone's half-width ${PHONE_HALF_WIDTH} — it cannot render as a circle`)
    }
    console.log(`PASS run ZR.f (vortex fits a phone): radii ${WEAPONS.hole.levels.map((l) => l.radius).join('/')} all <= ${PHONE_HALF_WIDTH}`)
  }

  // (d) Neither system exists outside a lane chapter — both gate on CHAPTERS[chapter].lane.
  {
    const run = createRun(makeMeta(), { chapter: 'city' })
    run.weapons = []; run.mods.spawnMul = 0
    run.player.hp = 1e9; run.player.maxHP = 1e9
    for (let i = 0; i < Math.round(8 / dt); i++) stepSim(run, { x: 0, y: 0, skill: true }, dt)
    assert.strictEqual(run.rocks.length, 0, `expected no asteroids outside a lane chapter, got ${run.rocks.length}`)
    assert.strictEqual(run.repulseCd, 0, `expected repulsion inert outside a lane chapter, cd=${run.repulseCd}`)
    assert(!run.events.some((e) => e.type === 'repulse'), 'expected no repulse outside a lane chapter')
    console.log('PASS run ZR.d (both gate on `lane`): city sees no rocks and no repulse over 8s')
  }
}

// ---- Run ZM: v5.19 march homing ------------------------------------------------------------
// A marcher used to advance straight down the lane and slide harmlessly past a player who never
// moved. It now converges on the player's column too — but SLOWLY, which is the whole contract:
// fast enough that ignoring a rank costs you, slow enough that committing to a gap still beats it.
// Both halves are asserted here, because only the pair is the design (either alone is a bug).
function testLaneMarch() {
  const dt = 1 / 60

  function marchRun(offsetX) {
    const run = createRun(makeMeta(), { chapter: 'beyond' })
    run.weapons = []; run.obstacles = []; run._obstacleSeed = null; run.mods.spawnMul = 0
    run._formationT = 1e6 // park the rank spawner: this case is about one marcher
    run.player.x = 0; run.player.y = 0
    run.player.hp = 1e9; run.player.maxHP = 1e9
    // Placed well ahead up-lane so it never reaches contact range during the window.
    const e = makeStatusEnemy(run, { x: offsetX, y: -1200, speed: 90 })
    e.flags = ['march']
    run.enemies.push(e)
    return { run, e }
  }

  // Both cases step for EXACTLY one sway period. The shuffle is a cosine with amplitude
  // MARCH_SWAY_PX (~46px of excursion) against a homing rate of only ~17px/s, so over an arbitrary
  // window the sway swamps the signal — a 4s window happens to cancel the homing almost exactly.
  // Over one whole period the cosine integrates to zero and what's left IS the homing.
  const period = (Math.PI * 2) / MARCH_SWAY_RATE

  // (a) It closes the horizontal gap on an idle player, and still descends while doing it.
  {
    const { run, e } = marchRun(400)
    const gap0 = Math.abs(e.x - run.player.x)
    const y0 = e.y
    for (let i = 0; i < Math.round(period / dt); i++) stepSim(run, { x: 0, y: 0 }, dt)
    const gap1 = Math.abs(e.x - run.player.x)
    assert(gap1 < gap0 - 60, `expected a marcher to converge on an idle player, gap ${gap0.toFixed(0)}->${gap1.toFixed(0)}px`)
    assert(e.y > y0 + 50, `expected a marcher to keep descending while homing, y ${y0.toFixed(0)}->${e.y.toFixed(0)}`)

    // ...and slowly. The closure rate must stay far under the player's own strafe, or "commit to a
    // gap" stops working and the rank is just a wall that follows you (rev.1's failure).
    const closeRate = (gap0 - gap1) / period
    const strafe = PLAYER.baseSpeed * LANE_STRAFE_MUL
    assert(closeRate < strafe * 0.25, `expected homing well under a strafe: ${closeRate.toFixed(0)}px/s vs strafe ${strafe.toFixed(0)}px/s`)
    console.log(`PASS run ZM.a (march homes): gap ${gap0.toFixed(0)}->${gap1.toFixed(0)}px at ${closeRate.toFixed(0)}px/s (strafe ${strafe.toFixed(0)}px/s), descended ${(e.y - y0).toFixed(0)}px`)
  }

  // (b) The fairness contract: a player who strafes AWAY outruns the convergence outright. Same
  // marcher, same window — only the input differs, and the gap must grow instead of shrink.
  {
    const { run, e } = marchRun(-200) // enemy to the player's left, so strafe right to flee
    const gap0 = Math.abs(e.x - run.player.x)
    for (let i = 0; i < Math.round(period / dt); i++) stepSim(run, { x: 1, y: 0 }, dt)
    const gap1 = Math.abs(e.x - run.player.x)
    assert(gap1 > gap0 + 100, `expected strafing away to beat the homing, gap ${gap0.toFixed(0)}->${gap1.toFixed(0)}px`)
    console.log(`PASS run ZM.b (strafe beats homing): gap ${gap0.toFixed(0)}->${gap1.toFixed(0)}px while fleeing`)
  }
}

// ---- Run AA: v5.4 weapons + per-chapter balance bands (run W/X style) ---------------------
function testV54Weapons() {
  const dt = 1 / 60

  // A quiet run in a chapter, with one weapon at max level and nothing else moving.
  function weaponRun(chapter, id, level = MAX_WEAPON_LEVEL) {
    const run = createRun(makeMeta(), { chapter })
    run.weapons = [{ id, level }]
    run.obstacles = []; run._obstacleSeed = null; run.traps = []; run.wells = []; run.mods.spawnMul = 0
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
      // Reseed per run, exactly like runStarOnly: these two calls are a BASELINE vs MODDED
      // comparison, and without this they draw from one continuous stream and play different
      // games — the crit rolls diverge, so the assert passes or fails on luck rather than on
      // panicRout. (It passed at 150 vs 140 only because the PLAIN run happened to crit.)
      Math.random = mulberry32(20260714)
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

// Skies procedural districts (v5.7.x piece 4): districtAt/districtTintAt are pure world-XY
// helpers with no Pixi/DOM deps (they live in config.js precisely so they're testable here).
// Checks per the design doc: deterministic per (x, y, seed); varied across a wide sweep (not one
// constant type, and sea shows up somewhere); and the floor tint is CONTINUOUS crossing a border
// (no jump bigger than a small epsilon in one small step) rather than hard-cutting.
function testDistricts() {
  const seed = 1234567

  // deterministic: same (x, y, seed) -> same district, called twice
  for (const [x, y] of [[0, 0], [15000, -8000], [-3000, 40000], [999999, 999999]]) {
    assert.strictEqual(districtAt(x, y, seed), districtAt(x, y, seed), `expected districtAt(${x},${y}) to be deterministic`)
  }
  assert.strictEqual(districtTintAt(5000, -5000, seed), districtTintAt(5000, -5000, seed), 'expected districtTintAt to be deterministic')

  // varied: a wide sweep across world-XY should hit more than one district type (not a constant),
  // every type returned must be a real DISTRICTS key, and sea must show up somewhere (the
  // low-frequency clustering bias shouldn't make it vanish).
  const seen = new Set()
  // v5.11: the sweep is sized against CITY_GRID (the terrain generator's coarsest feature lattice)
  // rather than the retired Voronoi DISTRICT_GRID. The step is deliberately NOT a divisor of any
  // generator wavelength, so the sample can't accidentally ride one phase of the noise.
  const SPAN = CITY_GRID * 7
  const STEP = CITY_GRID * 0.31
  for (let x = -SPAN; x <= SPAN; x += STEP) {
    for (let y = -SPAN; y <= SPAN; y += STEP) seen.add(districtAt(x, y, seed))
  }
  assert(seen.size > 1, `expected districtAt to return varied types across a wide sweep, got only ${[...seen]}`)
  for (const t of seen) assert(t in DISTRICTS, `unexpected district type from districtAt: ${t}`)
  assert(seen.has('sea'), `expected sea to appear somewhere over a wide sweep, got ${[...seen]}`)
  // v5.9 top-down region overhaul grew DISTRICTS from 4 types to 6 (farms, hills) — pin both
  // reachable over the same sweep, the same way sea already was above, so a future weight/bias
  // change that starves one of them out doesn't slip past silently.
  assert(seen.has('farms'), `expected farms to appear somewhere over a wide sweep, got ${[...seen]}`)
  assert(seen.has('hills'), `expected hills to appear somewhere over a wide sweep, got ${[...seen]}`)
  // v5.11 added two biomes (desert, beach) and the report asked for deserts by name. Pin them the
  // same way, so a threshold change in terrain.js that quietly starves one out fails here.
  assert(seen.has('desert'), `expected desert to appear somewhere over a wide sweep, got ${[...seen]}`)
  assert(seen.has('beach'), `expected beach to appear somewhere over a wide sweep, got ${[...seen]}`)
  assert(seen.has('downtown'), `expected downtown to appear somewhere over a wide sweep, got ${[...seen]}`)

  // continuous blend: walk a straight line crossing several district borders in small steps;
  // districtTintAt must never jump by more than a small epsilon per step (no hard pop at a
  // Voronoi edge). Decompose the packed int to RGB channels since that's what "jump" means here.
  const channel = (c, shift) => (c >> shift) & 255
  let prev = districtTintAt(-SPAN, 777, seed)
  let maxJump = 0
  const lineStep = 8 // px — much smaller than DISTRICT_BLEND_PX, so a real border shows as many small steps, not one leap
  for (let x = -SPAN + lineStep; x <= SPAN; x += lineStep) {
    const cur = districtTintAt(x, 777, seed)
    for (const shift of [16, 8, 0]) maxJump = Math.max(maxJump, Math.abs(channel(cur, shift) - channel(prev, shift)))
    prev = cur
  }
  assert(maxJump <= 50, `expected districtTintAt to blend continuously across borders, got a ${maxJump}-level (of 255) jump in one ${lineStep}px step`)

  console.log(`PASS run BB (districts): ${seen.size} distinct types over the sweep (${[...seen].join(',')}), sea present, max per-step tint jump ${maxJump}/255`)
}

// ---- Run CC: v5.8 kaiju redesign (skies crushing, rampage, density) ---------------------
// Design doc §7 flags that the EXISTING suite is structurally blind to all of this: run W/X/AA's
// balance bands run `createRun(makeMeta())` (the body chapter, no obstacles), makeStatusEnemy
// bypasses spawnEnemy, and every skies behavior check in run Y/AA drives `flagRun`, which does
// `run.obstacles = []; run._obstacleSeed = null` — blanking the exact field stepCrush/stepRampage
// are gated on. None of those tests can see crushing, rampage, or the new density, because all
// three only exist for CHAPTERS[chapter].crush, and every existing skies test nulls it out.
// These scenarios build real `createRun(meta, {chapter:'skies'})` runs and let the field stream
// for real — NOT flagRun.
function testSkiesKaiju() {
  const dt = 1 / 60

  // A quiet, LIVE skies run: real chapter (obstacles stream for real, crush/rampage are gated on),
  // no weapons/spawns/bombardment noise. The obstacle field itself is left completely alone.
  function skiesRun() {
    const run = createRun(makeMeta(), { chapter: 'skies' })
    run.weapons = []; run.mods.spawnMul = 0; run._bombardAcc = 1e6 // park the signature, not the field
    run.player.x = 0; run.player.y = 0; run.player.hp = 1e9; run.player.maxHP = 1e9
    return run
  }

  // (a) crush on contact: a live structure overlapping the player is destroyed OUTRIGHT — spliced
  // from run.obstacles, _obstacleRev bumped (so render knows to rebuild), a {type:'crush'} event
  // carrying the structure's kind, xp dropped into run.gems via the same path a kill uses, and the
  // rampage meter fed (sim.js stepCrush, design doc §2/§3).
  {
    Math.random = mulberry32(20260714)
    const run = skiesRun()
    stepSim(run, { x: 0, y: 0 }, dt) // streams in the REAL field around the origin (streamObstacles)
    assert(run.obstacles.length > 0, 'expected a live skies run to stream in real obstacles')
    const target = run.obstacles[0]
    assert(STRUCTURE_KINDS.includes(target.kind), `expected a real structure kind, got '${target.kind}'`)
    const revBefore = run._obstacleRev
    const xpBefore = run.player.xp

    run.player.x = target.x; run.player.y = target.y // dead-center overlap
    stepSim(run, { x: 0, y: 0 }, dt)

    assert(!run.obstacles.includes(target), 'expected the overlapped structure spliced from run.obstacles')
    assert(run._obstacleRev > revBefore, `expected _obstacleRev to bump (was ${revBefore}, now ${run._obstacleRev})`)
    const crushEv = run.events.find((ev) => ev.type === 'crush' && ev.x === target.x && ev.y === target.y)
    assert(crushEv, 'expected a crush event at the structure\'s position')
    assert.strictEqual(crushEv.kind, target.kind, `expected the crush event's kind to match the structure (${target.kind}), got ${crushEv.kind}`)
    // The dropped gem spawns dead-center on the structure — exactly where we just teleported the
    // player — so stepPickups (same frame) collects it INSTANTLY (distance 0 is inside
    // PLAYER.pickupRadius) rather than leaving it sitting in run.gems. Check the effect of the
    // pickup instead: player.xp went up by the gem's value, and a 'gem' event fired, proving the
    // xp really did flow through the same run.gems.push -> stepPickups path a kill uses (not some
    // shortcut that hands the player xp directly).
    assert(run.player.xp >= xpBefore + CRUSH_XP * GEM_VALUE - 1e-9,
      `expected the crush's xp (CRUSH_XP=${CRUSH_XP} * GEM_VALUE=${GEM_VALUE}) collected into player.xp, went ${xpBefore}->${run.player.xp}`)
    assert(run.events.some((ev) => ev.type === 'gem'), 'expected the crush\'s xp to flow through the gem pickup path (a gem event)')
    assert(run.rampage >= RAMPAGE_GAIN - 0.01, `expected the crush to feed the rampage meter (RAMPAGE_GAIN=${RAMPAGE_GAIN}), got ${run.rampage.toFixed(3)}`)
    console.log(`PASS run CC.a (crush on contact): kind=${target.kind} _obstacleRev ${revBefore}->${run._obstacleRev}, xp ${xpBefore}->${run.player.xp}, rampage=${run.rampage.toFixed(3)}`)
  }

  // (b) crushables don't block the PLAYER, but DO block ENEMIES — the design doc calls this "the
  // load-bearing line": stepObstacles' player-push loop is skipped ENTIRELY for a crush chapter
  // (chapter-gated, not per-obstacle), while the enemy loop is untouched. Both custom structures
  // are APPENDED to the real streamed field from (a) (never replaced), placed inside the disc
  // CHAPTERS.skies.obstacles.minDist keeps every real structure out of (with margin for maxR, so
  // nothing organic can wander in and contaminate the push-distance check).
  {
    Math.random = mulberry32(20260714)
    const run = skiesRun()
    stepSim(run, { x: 0, y: 0 }, dt) // real field streams in around the origin, same as (a)

    const wallA = { x: 32, y: 0, r: 15, _cell: 'test-a', kind: 'tower' } // overlaps the PLAYER
    const wallB = { x: 0, y: 60, r: 15, _cell: 'test-b', kind: 'house' } // overlaps only the ENEMY
    run.obstacles.push(wallA, wallB)

    const px0 = run.player.x, py0 = run.player.y // (0, 0) — already overlapping wallA by 5px
    const e = makeStatusEnemy(run, { x: 0, y: wallB.y + (wallB.r + 16 - 5), hp: 1e6, speed: 0 })
    run.enemies.push(e)
    const ey0 = e.y

    stepSim(run, { x: 0, y: 0 }, dt)

    assert.strictEqual(run.player.x, px0, 'expected the player to pass through a crushable structure unpushed (x)')
    assert.strictEqual(run.player.y, py0, 'expected the player to pass through a crushable structure unpushed (y)')
    assert(e.y > ey0, `expected the enemy pushed OUT of its structure, moved ${(e.y - ey0).toFixed(2)}px`)
    const dist = Math.hypot(e.x - wallB.x, e.y - wallB.y)
    assert(dist >= wallB.r + 16 - 1e-6, `expected the enemy no longer overlapping after the push, dist=${dist.toFixed(2)}`)
    console.log(`PASS run CC.b (asymmetric collision): player passed through unpushed, enemy shoved out to dist=${dist.toFixed(1)}`)
  }

  // (c) rampage lifecycle: fills on crush ((a) already covers that), decays on its own otherwise,
  // triggers RAMPAGE at 1.0, genuinely widens the crush radius while active, then drains back to
  // EXACTLY 0 with no residue (sim.js stepRampage, design doc §3).
  {
    // (c1) decays continuously with no crushing and no input.
    {
      Math.random = mulberry32(20260714)
      const run = skiesRun()
      run.rampage = 0.5; run.rampageT = 0
      const steps = Math.round(1 / dt)
      for (let i = 0; i < steps; i++) stepSim(run, { x: 0, y: 0 }, dt)
      const expected = 0.5 - RAMPAGE_DECAY * (steps * dt)
      assert(Math.abs(run.rampage - expected) < 1e-3, `expected rampage to decay to ~${expected.toFixed(3)} after 1s idle, got ${run.rampage.toFixed(3)}`)
      assert.strictEqual(run.rampageT, 0, 'expected rampageT to stay inactive while merely decaying')
    }

    // (c2) reaching 1.0 triggers RAMPAGE on the very next step (the trigger check runs BEFORE
    // decay — see stepRampage's own comment on why: decaying first could knock a just-clamped 1.0
    // fractionally under before the >=1 check ever saw it).
    {
      Math.random = mulberry32(20260714)
      const run = skiesRun()
      run.rampage = 1; run.rampageT = 0
      stepSim(run, { x: 0, y: 0 }, dt)
      assert.strictEqual(run.rampageT, RAMPAGE_DURATION, `expected a full meter to trigger RAMPAGE_DURATION (${RAMPAGE_DURATION}s), got rampageT=${run.rampageT}`)
      assert.strictEqual(run.rampage, 1, 'expected the meter to stay at 1 on the triggering frame itself (no decay yet)')
    }

    // (c3) the crush radius genuinely widens while rampageT > 0: a structure placed beyond the
    // NORMAL crush radius (PLAYER.radius) but inside the WIDENED one (PLAYER.radius *
    // RAMPAGE_CRUSH_MUL) survives outside rampage and is destroyed only once rampage is active.
    {
      Math.random = mulberry32(20260714)
      const run = skiesRun()
      const normalR = PLAYER.radius
      const wideR = PLAYER.radius * RAMPAGE_CRUSH_MUL
      const structR = CHAPTERS.skies.obstacles.minR
      const dist = (normalR + structR + wideR + structR) / 2 // straddles the midpoint of the two thresholds
      const wall = { x: dist, y: 0, r: structR, _cell: 'test-c', kind: 'tower' }
      run.obstacles.push(wall)

      // not rampaging: outside the normal radius, survives.
      run.rampage = 0; run.rampageT = 0
      stepSim(run, { x: 0, y: 0 }, dt)
      assert(run.obstacles.includes(wall), 'expected a structure beyond the normal crush radius to survive OUTSIDE rampage')

      // trigger rampage — this SAME frame's stepCrush still runs at the OLD rampageT=0 (it flips
      // AFTER stepCrush, inside stepRampage), so the wall survives this frame too.
      run.rampage = 1
      stepSim(run, { x: 0, y: 0 }, dt)
      assert(run.obstacles.includes(wall), 'expected the wall to survive the triggering frame itself (rampageT widens AFTER stepCrush runs that frame)')
      assert.strictEqual(run.rampageT, RAMPAGE_DURATION, 'expected rampage to be active now')

      // next frame: rampageT > 0 entering stepCrush -> the widened radius reaches the wall.
      stepSim(run, { x: 0, y: 0 }, dt)
      assert(!run.obstacles.includes(wall), `expected the widened crush radius (${wideR}) to reach a structure ${dist}px out (normal reach was only ${normalR + structR}px)`)
      const crushEv = run.events.find((ev) => ev.type === 'crush' && ev.x === wall.x && ev.y === wall.y)
      assert(crushEv, 'expected a crush event for the wall destroyed by the widened rampage radius')
    }

    // (c4) drains across RAMPAGE_DURATION and resets to EXACTLY 0 — no residue once the buff ends.
    {
      Math.random = mulberry32(20260714)
      const run = skiesRun()
      run.rampage = 1; run.rampageT = RAMPAGE_DURATION
      const half = Math.round((RAMPAGE_DURATION / 2) / dt)
      for (let i = 0; i < half; i++) stepSim(run, { x: 0, y: 0 }, dt)
      assert(run.rampageT > 0, 'expected rampage still active at the halfway point')
      assert(Math.abs(run.rampage - 0.5) < 0.05, `expected the meter roughly half-drained at the halfway point, got ${run.rampage.toFixed(3)}`)

      const rest = Math.round((RAMPAGE_DURATION / 2 + 0.5) / dt) // past the end of the duration
      for (let i = 0; i < rest; i++) stepSim(run, { x: 0, y: 0 }, dt)
      assert.strictEqual(run.rampageT, 0, 'expected rampageT to reset to EXACTLY 0 once the duration elapses')
      assert.strictEqual(run.rampage, 0, 'expected rampage to reset to EXACTLY 0 — no residue')

      // and it stays there — no lingering partial-widen effect after the buff has ended.
      for (let i = 0; i < Math.round(1 / dt); i++) stepSim(run, { x: 0, y: 0 }, dt)
      assert.strictEqual(run.rampage, 0, 'expected rampage to remain 0 with no residue after the buff has fully ended')
      assert.strictEqual(run.rampageT, 0, 'expected rampageT to remain 0 with no residue after the buff has fully ended')
    }

    console.log(`PASS run CC.c (rampage lifecycle): decays idle, triggers at 1.0, widens ${PLAYER.radius}->${PLAYER.radius * RAMPAGE_CRUSH_MUL} while active, drains to exactly 0`)
  }

  // (c5) v5.14 rampage PAYLOAD: invulnerable + faster + harder-hitting while rampageT > 0, and
  // — the assertion that actually matters — NOTHING LEAKS once it ends. Rev.1 of the v5.8 redesign
  // cut these buffs precisely because it granted them by ASSIGNING to p.speed/p.damageMul, which
  // are set once in createRun and never written again, so a re-trigger or a death mid-buff left the
  // multiplier stuck on forever. They are read-time multipliers now; this pins that they stay so.
  {
    Math.random = mulberry32(20260714)
    const run = skiesRun()
    const p = run.player
    const baseSpeed = p.speed, baseDmg = p.damageMul, baseFire = p.fireRateMul
    p.hp = 100; p.maxHP = 100

    // INVULNERABLE: a direct hit from a full-strength contact enemy costs nothing while rampaging.
    run.rampage = 1; run.rampageT = RAMPAGE_DURATION
    const hitter = makeStatusEnemy(run, { x: 0, y: 0, hp: 50, speed: 0 })
    hitter.dmg = 40; hitter.flags = []
    run.enemies.push(hitter)
    stepSim(run, { x: 0, y: 0 }, dt)
    assert.strictEqual(p.hp, 100, `expected rampage to be INVULNERABLE, took ${100 - p.hp} damage`)

    // MOVES FASTER: same input, further travelled, by RAMPAGE_SPEED_MUL.
    run.enemies.length = 0
    const x0 = p.x
    stepSim(run, { x: 1, y: 0 }, dt)
    const rampStep = p.x - x0
    run.rampageT = 0; run.rampage = 0
    const x1 = p.x
    stepSim(run, { x: 1, y: 0 }, dt)
    const normStep = p.x - x1
    assert(Math.abs(rampStep / normStep - RAMPAGE_SPEED_MUL) < 0.02,
      `expected rampage movement to be ${RAMPAGE_SPEED_MUL}x, got ${(rampStep / normStep).toFixed(3)}x`)

    // NO RESIDUE: the buff ended above, so every source value must be untouched. This is the whole
    // point of deriving instead of assigning — if any of these three drifted, the buff leaked.
    assert.strictEqual(p.speed, baseSpeed, 'rampage LEAKED into player.speed')
    assert.strictEqual(p.damageMul, baseDmg, 'rampage LEAKED into player.damageMul')
    assert.strictEqual(p.fireRateMul, baseFire, 'rampage LEAKED into player.fireRateMul')

    // ...and it must still leak nothing after a SECOND rampage runs its full course (the re-trigger
    // case that made rev.1's in-place version compound).
    run.rampage = 1; run.rampageT = RAMPAGE_DURATION
    for (let i = 0; i < Math.round((RAMPAGE_DURATION + 1) / dt); i++) stepSim(run, { x: 0, y: 0 }, dt)
    assert.strictEqual(p.speed, baseSpeed, 'rampage LEAKED into player.speed on re-trigger')
    assert.strictEqual(p.damageMul, baseDmg, 'rampage LEAKED into player.damageMul on re-trigger')
    assert.strictEqual(p.fireRateMul, baseFire, 'rampage LEAKED into player.fireRateMul on re-trigger')

    console.log(`PASS run CC.c5 (rampage payload): invulnerable, ${(rampStep / normStep).toFixed(2)}x move speed, and zero leak into player.speed/damageMul/fireRateMul across two rampages`)
  }

  // (c6) v5.14 'crushable' (skies' aircraft): flying into the kaiju kills the aircraft and costs
  // the player NOTHING — no damage and no invuln window spent. A whole flight dies in one frame,
  // which is what the `continue`-instead-of-`return` in stepContactDamage's branch buys.
  {
    Math.random = mulberry32(20260714)
    const run = skiesRun()
    const p = run.player
    p.hp = 100; p.maxHP = 100; p.invuln = 0
    for (let i = 0; i < 3; i++) {
      const jet = makeStatusEnemy(run, { x: 4 * i - 4, y: 0, hp: 30, speed: 0 })
      jet.dmg = 25; jet.flags = ['strafe', 'crushable']
      run.enemies.push(jet)
    }
    stepSim(run, { x: 0, y: 0 }, dt)
    assert.strictEqual(p.hp, 100, `expected ramming aircraft to cost the kaiju nothing, took ${100 - p.hp}`)
    assert.strictEqual(p.invuln, 0, 'expected no invuln window to be spent on a crushable contact')
    const alive = run.enemies.filter((e) => !e._dead && (e.flags || []).includes('crushable'))
    assert.strictEqual(alive.length, 0, `expected all 3 rammed aircraft dead in ONE frame, ${alive.length} survived`)

    // ...and a NON-crushable enemy on the same contact path still hurts normally, so the branch
    // above is scoped to the flag and has not quietly disarmed contact damage for everything else.
    const run2 = skiesRun()
    run2.player.hp = 100; run2.player.maxHP = 100; run2.player.invuln = 0
    const tank = makeStatusEnemy(run2, { x: 0, y: 0, hp: 30, speed: 0 })
    tank.dmg = 25; tank.flags = ['artillery']
    run2.enemies.push(tank)
    stepSim(run2, { x: 0, y: 0 }, dt)
    assert(run2.player.hp < 100, 'expected a NON-crushable enemy to still deal contact damage')

    console.log('PASS run CC.c6 (crushable aircraft): 3 rammed aircraft died in one frame for 0 damage; a tank on the same path still hurt')
  }

  // (d) structure `kind` is deterministic for a given (cell, obstacleSeed, districtSeed) — and it
  // MATCHES the district it stands in.
  //
  // v5.9.1: this assertion was inverted. It used to require kind to be INDEPENDENT of
  // _districtSeed, because v5.8 derived kind from a bare obstacleCellHash salt specifically so sim
  // would never read the then-render-only _districtSeed. Playtest killed that design: you got
  // houses standing in open sea and piers in farmland. _districtSeed is now a documented read-only
  // sim contract (state.js), kind is picked from DISTRICT_STRUCTURE_KINDS[district], and the thing
  // worth guarding is the opposite of what this test used to say — so it now pins the district
  // match (no land buildings at sea) and keeps only the repeat-visit stability check.
  {
    function seededSkiesRun(obstacleSeed, districtSeed) {
      const run = createRun(makeMeta(), { chapter: 'skies' })
      run.weapons = []; run.mods.spawnMul = 0; run._bombardAcc = 1e6
      run.player.x = 0; run.player.y = 0; run.player.hp = 1e9; run.player.maxHP = 1e9
      run._obstacleSeed = obstacleSeed
      run._districtSeed = districtSeed
      return run
    }
    Math.random = mulberry32(20260714)
    const seed = 424242

    const runA = seededSkiesRun(seed, 111)
    stepSim(runA, { x: 0, y: 0 }, dt)
    const kindsA = Object.fromEntries(runA.obstacles.map((o) => [o._cell, o.kind]))
    assert(Object.keys(kindsA).length > 5, 'expected the forced seed to stream in a real set of obstacles')

    // v5.11 DELIBERATELY RETIRED the invariant that used to be asserted here ("the same obstacle
    // seed streams the exact same set of cells regardless of _districtSeed"). It was true because
    // the per-cell build probability was a flat constant everywhere, which is precisely the property
    // that made a city impossible to see: a pier every 200px across open ocean at the same spacing
    // as towers downtown. Density is now a function of the biome (BIOME_BUILD_DENSITY, terrain.js),
    // so the cell set MUST move with the world seed.
    //
    // What replaces it is the property that actually matters, and the one the "no building" half of
    // the playtest report was about: A CITY IS DENSER THAN OPEN COUNTRY. Measured directly on the
    // generator over equal-area samples rather than on a live run, so it can't be confounded by
    // where the streaming disc happens to sit.
    const runB = seededSkiesRun(seed, 999999)
    stepSim(runB, { x: 0, y: 0 }, dt)
    assert(runB.obstacles.length > 5, 'expected the second world seed to stream in a real set of obstacles too')

    {
      const wseed = pickWorldSeed(31337)
      const tally = {}
      for (let i = 0; i < 24000; i++) {
        const x = (i * 173) % 26000 - 13000
        const y = (i * 1097) % 26000 - 13000
        const b = districtAt(x, y, wseed)
        tally[b] = (tally[b] || 0) + 1
      }
      // Sanity: the sample has to actually contain both kinds of place before comparing them.
      assert((tally.downtown || 0) > 50 && (tally.sea || 0) > 50,
        `expected the sample to cover both downtown and sea, got ${JSON.stringify(tally)}`)
      const dDown = BIOME_BUILD_DENSITY.downtown, dSea = BIOME_BUILD_DENSITY.sea
      assert(dDown > dSea * 10,
        `expected downtown to build far denser than open sea, got ${dDown} vs ${dSea}`)
      assert(BIOME_BUILD_DENSITY.downtown > BIOME_BUILD_DENSITY.suburbs
        && BIOME_BUILD_DENSITY.suburbs > BIOME_BUILD_DENSITY.farms
        && BIOME_BUILD_DENSITY.farms > BIOME_BUILD_DENSITY.desert,
        'expected build density to fall monotonically downtown > suburbs > farms > desert')
    }

    // ...and every structure must be legal for the district it stands in. This is the playtest bug
    // ("there are houses in sea biome") in assertion form: sea may hold piers and nothing else.
    let checked = 0
    for (const run of [runA, runB]) {
      for (const o of run.obstacles) {
        const d = districtAt(o.x, o.y, run._districtSeed)
        const allowed = DISTRICT_STRUCTURE_KINDS[d]
        assert(allowed.includes(o.kind),
          `expected a '${d}' cell to hold one of [${allowed}], got '${o.kind}' at (${o.x.toFixed(0)},${o.y.toFixed(0)})`)
        checked++
      }
    }
    assert(checked > 10, `expected a real sample of structures to district-check, got ${checked}`)

    // repeat visit: walk far enough away to drop the origin's cells, then walk back — the SAME
    // cell must re-roll the SAME kind (sim.js's ponytail note on stepCrush: "walk away and back,
    // same building").
    const runC = seededSkiesRun(seed, 111)
    stepSim(runC, { x: 0, y: 0 }, dt)
    const firstVisit = Object.fromEntries(runC.obstacles.map((o) => [o._cell, o.kind]))
    runC.player.x = OBSTACLE_DROP_RADIUS * 3; runC.player.y = OBSTACLE_DROP_RADIUS * 3
    stepSim(runC, { x: 0, y: 0 }, dt) // drops the origin's cells — now far beyond OBSTACLE_DROP_RADIUS
    assert(!runC.obstacles.some((o) => o._cell in firstVisit), 'expected walking far away to drop the origin cells')
    runC.player.x = 0; runC.player.y = 0
    stepSim(runC, { x: 0, y: 0 }, dt) // walk back — origin cells re-roll
    const secondVisit = Object.fromEntries(runC.obstacles.map((o) => [o._cell, o.kind]))
    for (const cell of Object.keys(firstVisit)) {
      assert.strictEqual(secondVisit[cell], firstVisit[cell],
        `expected cell ${cell} to re-roll the SAME kind on a repeat visit (first=${firstVisit[cell]}, second=${secondVisit[cell]})`)
    }

    console.log(`PASS run CC.d (kind matches district): ${checked} structures all legal for their district, ${Object.keys(kindsA).length} cells stable on a repeat visit`)
  }

  // (e) density guard: THIS specific test exists because rev.1 of this redesign silently did
  // nothing — streamObstacles' per-cell probability is `prob = count*cs^2 /
  // (pi*OBSTACLE_FIELD_RADIUS^2)` (sim.js:1147/1157), which is INVARIANT under cell size alone.
  // Shrinking `cell` 420->260 while leaving `count` at the old 13 would have produced the exact
  // same density wearing a finer grid. Both numbers had to move together (config.js: count
  // 13->34, cell 420->260) to actually reach the intended ~150-obstacle density. Drive an ACTUAL
  // wandering skies run (not a frozen spawn-frame snapshot) long enough for the streaming field's
  // materialize-at-1400/drop-at-1900 hysteresis to settle (empirically stable within a couple
  // obstacles by 30s), then assert a RANGE — loose enough to not chase exact density-formula
  // arithmetic, but tight enough that the rev.1 no-op (which settles under 40 obstacles by this
  // same measurement, verified directly against this file's seed) can't sneak back in. Do not
  // delete this in the name of simplifying: it is the ONLY test that would have caught rev.1's bug.
  //
  // v5.9 top-down region overhaul addendum: roads now carve ~17% of the world out of the
  // buildable area (roadAt/ROAD_* in config.js) — the reason config.js bumped count 34->40 (see
  // CHAPTERS.skies.obstacles' own comment). Checked by hand against this file's seed: reverting to
  // the old count=34 with roads still on settles at 76 live obstacles — inside the ORIGINAL 70-170
  // floor, so that floor could no longer tell "the v5.9 density bump got reverted" apart from
  // "working as intended". Raising the floor 70->80 sits strictly between 76 (the reverted value)
  // and 88 (today's, below) — still comfortably clear of the rev.1 no-op (<40) but now also catches
  // a silent count 40->34 revert.
  {
    Math.random = mulberry32(20260714)
    const run = skiesRun()
    let t = 0
    for (let i = 0; i < Math.round(30 / dt); i++) {
      t += dt
      stepSim(run, { x: Math.cos(t), y: Math.sin(t) }, dt)
    }
    const n = run.obstacles.length
    assert(n >= 80 && n <= 170, `expected roughly the intended ~150 live obstacles after wandering, got ${n} (the rev.1 cell/count no-op settles under 40, and a reverted v5.9 count settles at 76, by this same measurement)`)
    console.log(`PASS run CC.e (density guard): ${n} live obstacles after 30s of wandering (~88 expected since roads carve ~17% of the buildable grid; floor guards the rev.1 cell/count no-op)`)
  }

  // (f) a crushed structure STAYS crushed. v5.9.1, and this one shipped broken because it had no
  // test: v5.8 deliberately kept no record of what had been flattened, on the reasoning that a
  // crushed cell couldn't re-roll until the player walked OBSTACLE_DROP_RADIUS (1900px) away. That
  // reasoning described the DROP path. The RE-ADD path never consults the drop radius — it skips a
  // cell only while that cell is still in `run.obstacles`, and crushing splices it out. So the next
  // scan (any cell-boundary crossing: 260px cells at 220px/s ≈ 1.2s) rebuilt the identical
  // building. The user's report was "crushed assets reappear 1s after being crushed" — exactly the
  // arithmetic. run._crushed is what makes it stick, so pin it hard.
  {
    Math.random = mulberry32(20260714)
    const run = createRun(makeMeta(), { chapter: 'skies' })
    run.weapons = []; run.mods.spawnMul = 0; run._bombardAcc = 1e6
    run.player.hp = 1e9; run.player.maxHP = 1e9
    run.player.x = 0; run.player.y = 0
    stepSim(run, { x: 0, y: 0 }, dt)

    // stand on the nearest structure and flatten it
    const target = run.obstacles.slice().sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0]
    assert(target, 'expected a streamed structure to crush')
    const cell = target._cell
    run.player.x = target.x; run.player.y = target.y
    stepSim(run, { x: 0, y: 0 }, dt)
    assert(!run.obstacles.some((o) => o._cell === cell), `expected cell ${cell} to be crushed`)

    // now pace back and forth across cell boundaries — the exact motion that used to resurrect it.
    // Well over the ~1.2s the user measured, and it must never come back.
    let reappeared = 0
    for (let lap = 0; lap < 6; lap++) {
      for (const [dx, dy] of [[600, 0], [0, 600], [-600, 0], [0, -600]]) {
        run.player.x += dx; run.player.y += dy
        stepSim(run, { x: 0, y: 0 }, dt)
        if (run.obstacles.some((o) => o._cell === cell)) reappeared++
      }
    }
    assert.strictEqual(reappeared, 0, `expected the crushed cell to stay flat, it came back ${reappeared}x`)
    assert(run._crushed.has(cell), 'expected the crushed cell to be recorded in run._crushed')
    console.log(`PASS run CC.f (crush sticks): cell ${cell} stayed flat across 24 cell-crossing re-scans`)
  }
}

// ---- Run DD: v5.9 top-down region overhaul (roads) -------------------------------------------
// roadAt (config.js) grew alongside DISTRICTS (run BB above already covers all 6 district types,
// farms/hills included) and STRUCTURE_KINDS (run CC.d already covers kind determinism/independence
// from _districtSeed). What's untested so far is the road grid itself: that it's actually
// deterministic and non-degenerate, and — the load-bearing one — that streamObstacles' own
// road-rejection (sim.js) and roadAt (config.js) genuinely agree on what counts as roadway,
// not just that both happen to compile.
function testRoads() {
  const dt = 1 / 60

  // (a) roadAt determinism: same (x, y, seed) always gives the same result (a pure function, no
  // RNG stream, no run state); a DIFFERENT seed must actually move the grid (the per-seed ox/oy
  // offset config.js's own comment calls out as "keeps different runs' grids from all sitting on
  // literally the same world-space lines").
  {
    const seed = 777
    for (const [x, y] of [[0, 0], [733, -212], [15000, 8000], [-4001, 6002]]) {
      assert.deepStrictEqual(roadAt(x, y, seed), roadAt(x, y, seed), `expected roadAt(${x},${y},${seed}) to be deterministic`)
    }
    // Sample enough points that "different seed, identical grid" (a broken/no-op per-seed offset)
    // would be caught, not just get lucky on one probe.
    let sawDifference = false
    for (let i = 0; i < 200; i++) {
      const x = i * 37, y = i * 53
      if (roadAt(x, y, seed).onRoad !== roadAt(x, y, seed + 1).onRoad) { sawDifference = true; break }
    }
    assert(sawDifference, 'expected a different seed to produce a different road layout somewhere over a 200-point sample')
    console.log('PASS run DD.a (roadAt determinism): same (x,y,seed) repeats every time, a different seed moves the grid')
  }

  // (b) road geometry is sane: sweep a DIAGONAL line (irrational-ish slope, so it can never ride
  // parallel to an axis-aligned street the whole way — a sweep along a fixed y or x WOULD
  // occasionally land exactly on a street's centreline and read as constantly-on-road for that one
  // probe, a sampling artifact of picking an unlucky line, not a real roadAt bug) and require it to
  // cross roadway sometimes and open ground sometimes, with many transitions — guards against a
  // degenerate roadAt that always (or never) returns onRoad true, which run DD.c below could not
  // distinguish from "roads are working" (an always-false roadAt would trivially pass "no obstacle
  // is on a road" too).
  {
    const seed = 20260714
    let onCount = 0, total = 0, transitions = 0, prevOn = null
    for (let t = 0; t < 20000; t += 5) {
      const r = roadAt(t, t * 0.37 + 53, seed)
      if (r.onRoad) onCount++
      total++
      if (prevOn !== null && prevOn !== r.onRoad) transitions++
      prevOn = r.onRoad
    }
    const frac = onCount / total
    assert(frac > 0.02 && frac < 0.5, `expected roadway to cover a modest slice of a long diagonal sweep, got ${(frac * 100).toFixed(1)}% (a degenerate roadAt reads as ~0% or ~100%)`)
    assert(transitions > 20, `expected many road/non-road transitions along a long diagonal sweep, got ${transitions}`)
    console.log(`PASS run DD.b (road geometry): ${(frac * 100).toFixed(1)}% of a diagonal sweep on-road across ${transitions} transitions (neither constantly on nor off)`)
  }

  // (c) roads are actually clear: drive a REAL live skies run — createRun with a real chapter and
  // a live obstacle field, NOT flagRun (flagRun sets run.obstacles = []; run._obstacleSeed = null,
  // which would make "no obstacle is on a road" vacuously true and prove nothing). Let the field
  // stream in for real, then assert no live obstacle's CENTRE sits on roadway per roadAt fed the
  // run's own _obstacleSeed — the same seed streamObstacles used to reject those cells in the first
  // place (sim.js). This is the one check that would actually catch sim and roadAt drifting apart.
  {
    Math.random = mulberry32(20260714)
    const run = createRun(makeMeta(), { chapter: 'skies' })
    run.weapons = []; run.mods.spawnMul = 0; run._bombardAcc = 1e6
    run.player.x = 0; run.player.y = 0; run.player.hp = 1e9; run.player.maxHP = 1e9
    let t = 0
    for (let i = 0; i < Math.round(30 / dt); i++) {
      t += dt
      stepSim(run, { x: Math.cos(t), y: Math.sin(t) }, dt)
    }
    assert(run.obstacles.length > 0, 'expected a live skies run to stream in real obstacles')
    // v5.11: roads are queried on run._districtSeed (the WORLD seed) — the old separate
    // run._obstacleSeed road lattice is gone, along with the reason streets used to cross open sea.
    const onRoad = run.obstacles.filter((o) => roadAt(o.x, o.y, run._districtSeed).onRoad)
    assert.strictEqual(onRoad.length, 0,
      `expected no live obstacle centred on roadway, found ${onRoad.length}/${run.obstacles.length}: ${JSON.stringify(onRoad.slice(0, 3))}`)
    console.log(`PASS run DD.c (roads are clear): 0/${run.obstacles.length} live obstacles centred on roadway`)
  }

  // (d) STRUCTURE_KINDS grew 4 -> 6 in the same v5.9 overhaul (config.js: 'tower'/'house'/'tree'/
  // 'pier' plus new 'barn'/'silo') — run CC.d above already proves kind is stable per (cell, seed)
  // and independent of _districtSeed; this just pins the COUNT so a future edit can't silently
  // shrink the ladder back down without any test noticing.
  {
    assert.strictEqual(STRUCTURE_KINDS.length, 6, `expected 6 structure kinds (v5.9 grew this from 4), got ${STRUCTURE_KINDS.length}: ${STRUCTURE_KINDS}`)
    console.log(`PASS run DD.d (structure kind count): ${STRUCTURE_KINDS.length} kinds (${STRUCTURE_KINDS.join(',')})`)
  }

  // (e) STREETS ARE CONTINUOUS — the direct regression test for the v5.11 playtest report, "roads
  // are 10 meters long". Nothing in the suite could catch that: DD.b only counts how OFTEN a
  // diagonal sweep is on roadway, and a road chopped into 600px stubs scores exactly the same
  // coverage as an unbroken one. The bug was never about coverage, it was about CONTINUITY.
  //
  // So walk ALONG a street instead of across it: find a point on a city street, take the heading
  // roadAt reports there, and follow it. A real street stays under your feet for its whole length.
  // The old build failed this instantly — render only drew pavement inside the urban districts of a
  // 600px Voronoi cell, so following any street walked off the paving within a few hundred px.
  {
    const seed = pickWorldSeed(4242)
    // Start from the home city's centre (terrain.js guarantees a city at the origin) and search
    // outward for a street to stand on.
    let start = null
    for (let probe = 0; probe < 4000 && !start; probe++) {
      const px = (probe % 63) * 17 - 500, py = Math.floor(probe / 63) * 17 - 500
      const r = roadAt(px, py, seed)
      if (r.onRoad && r.kind === 'street') start = { x: px, y: py, angle: r.angle }
    }
    assert(start, 'expected to find a city street near the origin to walk along')

    // Follow the street's own heading. Re-centre onto the centreline each step (roadAt reports the
    // perpendicular distance) so accumulated float drift can't walk us into the kerb and read as a
    // discontinuity that isn't one.
    const STEP = 12
    let x = start.x, y = start.y, walked = 0, offRoad = 0
    for (let i = 0; i < 60; i++) {
      const r = roadAt(x, y, seed)
      if (!r.onRoad) { offRoad++; break }
      // recentre: nudge perpendicular, keep whichever direction reduced `dist`
      const px = Math.sin(r.angle), py = Math.cos(r.angle)
      const probe = roadAt(x + px * 3, y + py * 3, seed)
      const sign = (probe.onRoad && probe.dist < r.dist) ? 1 : -1
      x += px * r.dist * sign; y += py * r.dist * sign
      x += Math.cos(r.angle) * STEP; y += Math.sin(r.angle) * STEP
      walked += STEP
    }
    assert.strictEqual(offRoad, 0, `expected a city street to stay continuous under a walk along its own heading; left the roadway after ${walked}px`)
    assert(walked >= 700, `expected to walk at least 700px along one street, managed ${walked}px`)
    console.log(`PASS run DD.e (streets are continuous): walked ${walked}px along one street without leaving the roadway`)
  }

  // (f) ROADS BELONG TO CITIES. The v5.10 grid was global and infinite, so roadway existed in the
  // middle of the ocean and halfway up a mountain — which is what forced render to gate drawing per
  // district and produced the stubs DD.e now guards. Assert the structural property that replaced
  // it: every street is inside a city's own radius. (Highways are exempt by construction — their
  // whole job is to run between cities — so they're excluded, not ignored: DD.e already proves the
  // street case, and a highway with no city at either end cannot be generated.)
  {
    const seed = pickWorldSeed(90210)
    let streets = 0, orphans = 0
    for (let i = 0; i < 6000; i++) {
      const x = (i * 137) % 20000 - 10000
      const y = (i * 991) % 20000 - 10000
      const r = roadAt(x, y, seed)
      if (!r.onRoad || r.kind !== 'street') continue
      streets++
      // The right property is "this place is urban", not "this point is within the city's nominal
      // radius": cityEdgeWobble (terrain.js) deliberately makes the urban boundary ragged, pushing
      // it out past r in places and pulling it in elsewhere, which is what stops cities rendering as
      // perfect circles. Testing the raw radius would therefore fail on exactly the feature it is
      // meant to protect (it did — 10/261 "orphans" that were all inside their own city's wobbled
      // edge). urbanAt is the same question roadAt itself asks before laying a street.
      if (urbanAt(x, y, seed) <= 0) orphans++
    }
    assert(streets > 20, `expected the sample to land on a decent number of city streets, got ${streets}`)
    assert.strictEqual(orphans, 0, `expected every city street to lie inside its own city's radius, found ${orphans}/${streets} orphaned in open country`)
    console.log(`PASS run DD.f (roads belong to cities): ${streets} sampled streets, 0 outside a city`)
  }

  // (g) THE RUN OPENS IN A CITY. terrain.js puts the home city at the world origin unconditionally,
  // and state.js walks the world seed forward until the origin is buildable land. Both halves have
  // to hold or the chapter's opening image — a kaiju standing downtown — silently becomes "a kaiju
  // in an empty field", which is exactly the kind of regression that only shows up in a screenshot.
  {
    for (const raw of [1, 2, 3, 99, 12345, 777777]) {
      const seed = pickWorldSeed(raw)
      const t = terrainAt(0, 0, seed)
      assert(t.biome === 'downtown', `expected the world origin to be downtown for raw seed ${raw}, got ${t.biome}`)
      const e = elevationAt(0, 0, seed)
      assert(e > 0.40 && e < 0.71, `expected the origin to be buildable land for raw seed ${raw}, elevation ${e.toFixed(3)}`)
    }
    console.log('PASS run DD.g (spawn is downtown): 6 raw seeds all resolve to a buildable origin inside the home city')
  }
}

// ---- Run EE: v5.24 The Blank (scripted boss chapter) -------------------------------------------
// The chapter has no ordinary spawner at all — stepBossScript (sim.js) is the ONLY thing that
// ever pushes to run.enemies, driven by BLANK_SCRIPT (config.js). Since dealDamage isn't exported,
// every "kill this enemy now" step below reuses the file's own idiom: drag the target onto the
// player, drop its hp to 1, and let an equipped weapon (real sim code) finish it — same as
// makeStatusEnemy's hp:1 elsewhere, just through spawnEnemy's normal path instead of a hand-built
// enemy. Death is detected the same way sim.js's own doc block says it must be: absence from
// run.enemies (or its _dead flag) on a later frame, never a returned id.
function testTheBlank() {
  const dt = 1 / 60

  // (a) Wave 1 + no ordinary spawning: every enemy alive, at spawn and after 30s of idling, must
  // be wave-tagged (stepSpawning early-returns entirely for a scripted chapter) and non-elite
  // (forceNormal, not just an empty eliteFlags list — see the contract's recon notes).
  {
    const run = createRun(makeMeta(), { chapter: 'blank', difficulty: 1 })
    run.player.hp = run.player.maxHP = 1e6 // survive whatever reaches it during the idle window below
    // No weapons: a real (unstripped) starter weapon can clear wave 1 well inside 30s and carry the
    // script all the way into the boss stage, whose antibody is deliberately NOT _wave-tagged (see
    // (c)/(d) below) — that would break this scenario's invariant for reasons unrelated to what it's
    // actually checking (stepSpawning gates off, at every point, for the whole idle window).
    run.weapons = []
    stepSim(run, { x: 0, y: 0 }, dt) // one frame: stepBossScript spawns wave 1 synchronously
    const wave0 = BLANK_SCRIPT[0].waves[0]
    assert.strictEqual(run.enemies.length, wave0.n, `expected wave 1 to spawn ${wave0.n} enemies, got ${run.enemies.length}`)
    assert(run.enemies.every((e) => wave0.ids.includes(e.rosterId)), "expected every wave-1 enemy's rosterId in the wave block's ids")
    assert(run.enemies.every((e) => e._wave), 'expected every wave-1 enemy tagged _wave')
    assert(run.enemies.every((e) => !e.elite), 'expected zero elites in a scripted chapter')

    advance(run, 30, dt, { x: 0, y: 0 })
    assert(run.enemies.every((e) => e._wave), 'expected every enemy alive after 30s idle to still be wave-tagged — no ordinary spawner ever ran')
    assert(run.enemies.every((e) => !e.elite), 'expected zero elites after 30s idle')
    console.log(`PASS run EE.a (wave 1 + no ordinary spawning): ${wave0.n} spawned, ${run.enemies.length} alive after 30s idle, all wave-tagged`)
  }

  // (b) Clear-advance: hard-kill every wave-1 enemy -> wave 2 arrives immediately (rosterIds from
  // the block's second wave). Timeout-advance, isolated in its own run with no weapons at all (so
  // nothing can die and only a timeout can move the script): idling past BLANK_WAVE_TIMEOUT
  // advances anyway, with wave-1's leftovers still alive alongside wave 2.
  {
    const run = createRun(makeMeta(), { chapter: 'blank', difficulty: 1 })
    run.player.hp = run.player.maxHP = 1e6
    run.weapons = [{ id: 'star', level: MAX_WEAPON_LEVEL }]
    stepSim(run, { x: 0, y: 0 }, dt) // wave 1 spawns
    assert.strictEqual(run.script.waveIdx, 0)
    for (const e of run.enemies) { e.x = run.player.x; e.y = run.player.y; e.hp = e.maxHP = 1 }
    advance(run, 3, dt, { x: 0, y: 0 })
    assert.strictEqual(run.script.waveIdx, 1, `expected wave-clear to advance waveIdx to 1, got ${run.script.waveIdx}`)
    const wave1 = BLANK_SCRIPT[0].waves[1]
    const alive = run.enemies.filter((e) => !e._dead)
    assert(alive.length > 0 && alive.every((e) => wave1.ids.includes(e.rosterId)), "expected wave 2 to have arrived with rosterIds from the block's second wave")
    console.log(`PASS run EE.b1 (clear-advance): wave 1 hard-killed -> waveIdx=1, ${alive.length} wave-2 enemies alive`)
  }
  {
    const run = createRun(makeMeta(), { chapter: 'blank', difficulty: 1 })
    run.player.hp = run.player.maxHP = 1e6
    run.weapons = [] // isolate the timeout path — nothing can die, so only a timeout can advance
    stepSim(run, { x: 0, y: 0 }, dt) // wave 1 spawns
    const wave0n = run.enemies.length
    advance(run, BLANK_WAVE_TIMEOUT + 1, dt, { x: 0, y: 0 })
    assert.strictEqual(run.script.waveIdx, 1, `expected timeout to advance waveIdx to 1 even with leftovers alive, got ${run.script.waveIdx}`)
    const stillAlive = run.enemies.filter((e) => !e._dead)
    assert(stillAlive.length > wave0n, `expected wave-1's ${wave0n} leftovers to still linger alongside wave 2, got ${stillAlive.length} alive total`)
    console.log(`PASS run EE.b2 (timeout-advance): waveIdx=1 after idling past ${BLANK_WAVE_TIMEOUT}s, ${wave0n} leftovers still alive (${stillAlive.length} total)`)
  }

  // (c) Boss stage: hard-kill through all 3 waves of the first block -> an antibody1 exists at
  // BLANK_BOSS_R, knockback-immune, with run.bossBar mirroring it; the phase ends ONLY on kill —
  // stripped of weapons, it survives idling well past BLANK_WAVE_TIMEOUT (a wave-stage-only
  // mechanic that must not leak into a boss phase).
  {
    const run = createRun(makeMeta(), { chapter: 'blank', difficulty: 1 })
    run.player.hp = run.player.maxHP = 1e6
    run.weapons = [{ id: 'star', level: MAX_WEAPON_LEVEL }]
    stepSim(run, { x: 0, y: 0 }, dt) // wave 1 spawns
    for (let w = 0; w < 3; w++) {
      for (const e of run.enemies) {
        if (e._wave && !e._dead) { e.x = run.player.x; e.y = run.player.y; e.hp = e.maxHP = 1 }
      }
      advance(run, 3, dt, { x: 0, y: 0 })
    }
    assert.strictEqual(run.script.stage, 1, `expected the script to reach the boss stage after 3 waves cleared, got stage=${run.script.stage}`)
    const boss = run.enemies.find((e) => e.rosterId === 'antibody1')
    assert(boss, 'expected an antibody1 to have spawned entering the boss stage')
    assert.strictEqual(boss.radius, BLANK_BOSS_R, `expected the boss's radius pinned to BLANK_BOSS_R, got ${boss.radius}`)
    assert(boss.affixes.includes('anchored'), 'expected the boss to carry the anchored (knockback-immune) affix')
    assert(run.bossBar && run.bossBar.stage === 1 && run.bossBar.hp === Math.max(0, boss.hp) && run.bossBar.max === boss.maxHP,
      `expected run.bossBar to mirror the boss, got ${JSON.stringify(run.bossBar)}`)

    run.weapons = [] // isolate the timer check below from the combat that just cleared the waves
    advance(run, BLANK_WAVE_TIMEOUT * 3, dt, { x: 0, y: 0 })
    assert(run.enemies.some((e) => e.id === boss.id && !e._dead), 'expected the boss to survive idling well past BLANK_WAVE_TIMEOUT — only a kill ends a boss phase')
    assert.strictEqual(run.phase, 'playing')
    console.log(`PASS run EE.c (boss stage): antibody1 spawned (r=${boss.radius}, anchored), bossBar mirrors it, survives ${(BLANK_WAVE_TIMEOUT * 3).toFixed(0)}s idle`)
  }

  // (d) Victory: kill antibody1/2/3 through the script (hard-set hp, jumping run.script straight
  // to each boss stage the way (c) reaches stage 1 organically) -> phase flips to 'victory'.
  // Separately: a scripted run idling to t=305s (>= RUN_DURATION) with no weapons at all (so the
  // only way it could reach 'victory' is a timer bug, never a real kill) must NOT auto-victory —
  // the whole RUN_DURATION check is skipped for a scripted chapter (see stepSim's gate).
  {
    const run = createRun(makeMeta(), { chapter: 'blank', difficulty: 1 })
    run.player.hp = run.player.maxHP = 1e6
    run.weapons = [{ id: 'star', level: MAX_WEAPON_LEVEL }]
    for (const stage of [1, 3, 5]) {
      Object.assign(run.script, { stage, waveIdx: 0, waveT: 0, spawned: false, bossId: null })
      stepSim(run, { x: 0, y: 0 }, dt) // spawns this phase's antibody
      const boss = run.enemies[run.enemies.length - 1]
      boss.x = run.player.x; boss.y = run.player.y; boss.hp = boss.maxHP = 1
      advance(run, 2, dt, { x: 0, y: 0 })
      assert(!run.enemies.some((e) => e.id === boss.id && !e._dead), `expected stage ${stage}'s antibody dead within 2s`)
    }
    assert.strictEqual(run.phase, 'victory', `expected phase 'victory' after antibody3 dies, got '${run.phase}'`)
    console.log('PASS run EE.d1 (victory): antibody1/2/3 killed through the script -> phase victory')
  }
  {
    const run = createRun(makeMeta(), { chapter: 'blank', difficulty: 1 })
    run.player.hp = run.player.maxHP = 1e9
    run.weapons = [] // nothing can die — the only way this run reaches 'victory' is a timer bug
    advance(run, 305, dt, { x: 0, y: 0 })
    assert.notStrictEqual(run.phase, 'victory', `expected no timer victory in a scripted chapter, got phase='${run.phase}' at t=${run.time.toFixed(1)}s`)
    console.log(`PASS run EE.d2 (no timer victory): phase='${run.phase}' at t=${run.time.toFixed(1)}s (>= RUN_DURATION)`)
  }

  // (e) Meta: a fresh save starts blank locked at maxDifficulty 1; ensureChapterMeta clamps any
  // stray maxDifficulty into the chapter's own 3-rung ladder (chapterMaxDifficulty('blank') === 3,
  // not the game-wide MAX_DIFFICULTY of 5).
  {
    const meta = makeMeta()
    const entry = ensureChapterMeta(meta, 'blank')
    assert.strictEqual(entry.unlocked, false, `expected blank to start locked, got unlocked=${entry.unlocked}`)
    assert.strictEqual(entry.maxDifficulty, 1, `expected a fresh blank entry's maxDifficulty to start at 1, got ${entry.maxDifficulty}`)

    meta.chapters.blank.maxDifficulty = 99
    const clamped = ensureChapterMeta(meta, 'blank')
    assert.strictEqual(chapterMaxDifficulty('blank'), 3, `expected chapterMaxDifficulty('blank') === 3, got ${chapterMaxDifficulty('blank')}`)
    assert.strictEqual(clamped.maxDifficulty, 3, `expected blank's maxDifficulty to clamp to 3, got ${clamped.maxDifficulty}`)
    console.log('PASS run EE.e (meta): blank starts locked at maxDifficulty 1, clamps to its own 3-rung cap')
  }

  console.log('PASS run EE (The Blank): script spawner, clear/timeout advance, boss-phase-ends-only-on-kill, victory, no timer victory, difficulty-3 cap')
}

// ---- Run FF: The Blank's boss mechanics (v5.24 review regressions) ----------------------------
// Locks in the adversarial-review fixes: the victory frame is FINAL even under lethal pressure
// (the review's blocker — hurtPlayer overwriting 'victory' with 'dead' on the detection frame),
// the P1 trail read actually produces src:'trail' bombs, the P2 yank fires/drains/drags, and
// immuneMemory drops erase residue at a wave enemy's corpse.
function testTheBlankBoss() {
  const dt = 1 / 60

  // (a) Victory under fire: kill antibody3 while the player stands at 1 HP inside a live erasure
  // strip. The frame that detects the boss's death must end the run as 'victory' — before the
  // fix, the strip's next damage tick the same frame flipped it to 'dead'.
  {
    const run = createRun(makeMeta(), { chapter: 'blank', difficulty: 1 })
    run.player.hp = run.player.maxHP = 1e6
    run.weapons = [{ id: 'star', level: MAX_WEAPON_LEVEL }]
    Object.assign(run.script, { stage: 5, waveIdx: 0, waveT: 0, spawned: false, bossId: null })
    stepSim(run, { x: 0, y: 0 }, dt) // spawns antibody3
    const boss = run.enemies[run.enemies.length - 1]
    boss.x = run.player.x + 60; boss.y = run.player.y; boss.hp = boss.maxHP = 1
    advance(run, 2, dt, { x: 0, y: 0 })
    assert(!run.enemies.some((e) => e.id === boss.id && !e._dead), 'expected antibody3 dead within 2s')
    // The kill landed but 'victory' may be a frame away (death is detected by id-absence). Pin the
    // lethal situation NOW — a live strip covering the player, 1 HP, no invuln — and step on.
    run.player.hp = 1
    run.player.invuln = 0
    run.strips.push({ x: run.player.x, y: run.player.y, angle: 0, len: 400, w: 400, fuse: 0, t: 5, dps: 1000, look: 'erase' })
    for (let i = 0; i < 10 && run.phase === 'playing'; i++) stepSim(run, { x: 0, y: 0 }, dt)
    assert.strictEqual(run.phase, 'victory', `expected the boss kill to end the run as 'victory' even under lethal strip damage, got '${run.phase}'`)
    console.log('PASS run FF.a (victory under fire): final kill wins even with a lethal strip on the player')
  }

  // (b) P1 trail read: idle in phase 1 past BLANK_READ1_T — the boss detonates the player's trail
  // as src:'trail' bombs (the telegraph->blast machinery), not some other array.
  {
    const run = createRun(makeMeta(), { chapter: 'blank', difficulty: 1 })
    run.player.hp = run.player.maxHP = 1e6
    run.weapons = [] // keep the boss (and the read loop) alive — nothing dies, nothing advances
    Object.assign(run.script, { stage: 1, waveIdx: 0, waveT: 0, spawned: false, bossId: null })
    let sawTrailBomb = false
    const steps = Math.round((BLANK_READ1_T + 1) / dt)
    for (let i = 0; i < steps && run.phase === 'playing'; i++) {
      stepSim(run, { x: 1, y: 0 }, dt) // keep moving so the trail has distinct points
      if (run.bombs.some((b) => b.src === 'trail')) sawTrailBomb = true
    }
    assert(sawTrailBomb, `expected src:'trail' bombs within ${(BLANK_READ1_T + 1).toFixed(1)}s of phase 1`)
    console.log('PASS run FF.b (P1 trail read): trail detonations arrive as src:\'trail\' bombs')
  }

  // (c) P2 yank: age a binding node past BLANK_YANK_T — the player is dragged toward the boss,
  // takes BLANK_YANK_DMG, every node is spent, and a 'yank' event fires.
  {
    const run = createRun(makeMeta(), { chapter: 'blank', difficulty: 1 })
    run.player.hp = run.player.maxHP = 1e6
    run.weapons = [] // nodes must survive to age
    Object.assign(run.script, { stage: 3, waveIdx: 0, waveT: 0, spawned: false, bossId: null })
    stepSim(run, { x: 0, y: 0 }, dt) // spawns antibody2
    // Wait for the first node, then age it artificially instead of idling BLANK_YANK_T real seconds.
    let node = null
    for (let i = 0; i < Math.round((BLANK_NODE_T + 1) / dt) && !node; i++) {
      stepSim(run, { x: 0, y: 0 }, dt)
      node = run.enemies.find((e) => e.rosterId === 'bindnode' && !e._dead) ?? null
    }
    assert(node, 'expected a bindnode within BLANK_NODE_T + 1s of phase 2')
    const hpBefore = run.player.hp
    const px = run.player.x, py = run.player.y
    const boss = run.enemies.find((e) => e.id === run.script.bossId)
    const dBefore = Math.hypot(boss.x - px, boss.y - py)
    node._bindT = BLANK_YANK_T + 1
    run.events.length = 0
    stepSim(run, { x: 0, y: 0 }, dt)
    assert(run.events.some((e) => e.type === 'yank'), 'expected a yank event')
    assert(run.player.hp <= hpBefore - BLANK_YANK_DMG + 1e-9, `expected the yank to cost ${BLANK_YANK_DMG} hp`)
    const dAfter = Math.hypot(boss.x - run.player.x, boss.y - run.player.y)
    assert(dAfter < dBefore - 1, `expected the player dragged toward the boss (${dBefore.toFixed(0)} -> ${dAfter.toFixed(0)}px)`)
    assert(!run.enemies.some((e) => e.rosterId === 'bindnode' && !e._dead), 'expected every node spent by the yank')
    console.log(`PASS run FF.c (P2 yank): dragged ${(dBefore - dAfter).toFixed(0)}px bossward, ${BLANK_YANK_DMG} hp, nodes spent`)
  }

  // (d) immuneMemory: with the difficulty-3 modifier active, a wave enemy's death drops erase
  // residue (a look:'erase' strip) at the corpse.
  {
    const run = createRun(makeMeta(), { chapter: 'blank', difficulty: 3, mutators: ['accelResponse', 'immuneMemory'] })
    run.player.hp = run.player.maxHP = 1e6
    run.weapons = [{ id: 'star', level: MAX_WEAPON_LEVEL }]
    stepSim(run, { x: 0, y: 0 }, dt) // wave 1 spawns
    for (const e of run.enemies) { e.x = run.player.x; e.y = run.player.y; e.hp = e.maxHP = 1 }
    advance(run, 2, dt, { x: 0, y: 0 })
    assert(run.strips.some((s) => s.look === 'erase'), "expected immuneMemory to leave look:'erase' residue at wave corpses")
    console.log('PASS run FF.d (immuneMemory): wave deaths leave erase residue')
  }

  console.log('PASS run FF (The Blank boss mechanics): victory-under-fire, trail bombs, yank, memory residue')
}

// ---- Run GG: chapter-scoped anomalies (v5.25) -------------------------------------------------
// The roll pool respects `chapters` (an anomaly tied to a signature only rolls where that
// signature runs) and `exclude` (sticky's magnet upside is a lie in the beyond's infinite-magnet
// lane), and the new signature knobs actually land in run.mods / the seeded world.
function testChapterAnomalies() {
  // Over-asking returns the whole (shuffled) pool — an order-independent membership probe.
  const all = (ch) => randomMutators(99, ch)
  assert(!all('beyond').includes('sticky'), 'sticky must not roll in the beyond')
  assert(all('beyond').includes('supermassive'), 'supermassive must roll in the beyond')
  assert(!all('pond').includes('supermassive'), 'supermassive must not roll outside the beyond')
  assert(all('pond').includes('riptide') && all('pond').includes('sticky'), 'pond rolls riptide and sticky')
  assert(!all(undefined).includes('riptide'), 'a chapterless roll excludes every scoped anomaly')
  for (const ch of CHAPTER_ORDER) assert(!all(ch).includes('accelResponse'), 'hidden entries never roll anywhere')
  const daily = dailyMutators('2026-07-31', 'beyond')
  assert(!daily.includes('sticky') && !daily.includes('riptide'), 'the daily pool is chapter-scoped too')

  const r1 = createRun(makeMeta(), { chapter: 'beyond', mutators: ['supermassive'] })
  assert.strictEqual(r1.mods.wellForceMul, 1.8, 'supermassive lands in run.mods.wellForceMul')
  assert.strictEqual(createRun(makeMeta(), { chapter: 'pond' }).mods.currentForceMul, 1, 'knobs default neutral')
  const base = createRun(makeMeta(), { chapter: 'undergrowth' }).traps.length
  const more = createRun(makeMeta(), { chapter: 'undergrowth', mutators: ['trapseason'] }).traps.length
  assert(more > base, `expected trap season to seed more traps (${base} -> ${more})`)
  console.log(`PASS run GG (chapter anomalies): scoped pools, scoped daily, wellForceMul 1.8, traps ${base}->${more}`)
}

// ---- Run HH: The Blank pacing pass (v6.0.0) --------------------------------------------------
// Locks in the pacing rework: a non-final phase kill banks BLANK_PHASE_LEVELS level-ups, P3's
// antibody chases at its own speed (no standoff flag), fires band CROSSES (two strips ~90° apart
// at the extrapolated point) plus straight BLANK_FAN_N-shot fans, and its recruit pulse keeps an
// endless mixed xp faucet flowing.
function testTheBlankPacing() {
  const dt = 1 / 60

  // (a) Phase-kill levels: killing antibody1 banks at least BLANK_PHASE_LEVELS level-ups.
  {
    const run = createRun(makeMeta(), { chapter: 'blank', difficulty: 1 })
    run.player.hp = run.player.maxHP = 1e6
    run.weapons = [{ id: 'star', level: MAX_WEAPON_LEVEL }]
    Object.assign(run.script, { stage: 1, waveIdx: 0, waveT: 0, spawned: false, bossId: null })
    stepSim(run, { x: 0, y: 0 }, dt) // spawns antibody1
    const before = run.player.level
    const boss = run.enemies[run.enemies.length - 1]
    boss.x = run.player.x; boss.y = run.player.y; boss.hp = boss.maxHP = 1
    advance(run, 3, dt, { x: 0, y: 0 }) // kill + auto-resolve the chained levelups
    assert(run.player.level >= before + BLANK_PHASE_LEVELS,
      `expected a phase kill to bank >= ${BLANK_PHASE_LEVELS} levels (${before} -> ${run.player.level})`)
    console.log(`PASS run HH.a (phase-kill levels): antibody1 kill leveled ${before} -> ${run.player.level}`)
  }

  // (b) P3 chases: antibody3 spawns at BLANK_BOSS_SPEED_P3 with no standoff flag, and actually
  // closes distance on a stationary player. (c) Its reads land as CROSSES — two full-length
  // erase bands ~90° apart (wake residue is short, so filter by BLANK_BAND_LEN) — and (d) its
  // fans as BLANK_FAN_N straight shots per volley.
  {
    const run = createRun(makeMeta(), { chapter: 'blank', difficulty: 1 })
    run.player.hp = run.player.maxHP = 1e6
    run.weapons = [] // keep the boss alive through the whole observation window
    Object.assign(run.script, { stage: 5, waveIdx: 0, waveT: 0, spawned: false, bossId: null })
    stepSim(run, { x: 0, y: 0 }, dt) // spawns antibody3
    const boss = run.enemies.find((e) => e.id === run.script.bossId)
    assert.strictEqual(boss.speed, BLANK_BOSS_SPEED_P3, `expected antibody3 at BLANK_BOSS_SPEED_P3, got ${boss.speed}`)
    assert(!boss.flags.includes('standoff'), 'expected antibody3 without the standoff flag — it chases')
    // Stationary player, boss parked 800px out: the chase closes 170 px/s (never to contact inside
    // the window), and the fan is sampled IN FLIGHT — a shot that reaches the player pops out of
    // run.enemyShots, so an end-of-window length check would race the projectile.
    boss.x = run.player.x + 800; boss.y = run.player.y
    const dBefore = Math.hypot(boss.x - run.player.x, boss.y - run.player.y)
    let fanSeen = 0, allStraight = true
    const steps = Math.round((BLANK_READ3_T + 1) / dt)
    for (let i = 0; i < steps && run.phase === 'playing'; i++) {
      stepSim(run, { x: 0, y: 0 }, dt)
      fanSeen = Math.max(fanSeen, run.enemyShots.length)
      if (run.enemyShots.some((s) => s.turnRate !== 0)) allStraight = false
    }
    const bands = run.strips.filter((s) => s.look === 'erase' && s.len === BLANK_BAND_LEN)
    assert(bands.length >= 2, `expected a cross (>= 2 full-length bands) within ${(BLANK_READ3_T + 1).toFixed(1)}s, got ${bands.length}`)
    const perp = Math.abs(Math.atan2(Math.sin(bands[0].angle - bands[1].angle), Math.cos(bands[0].angle - bands[1].angle)))
    assert(Math.abs(perp - Math.PI / 2) < 0.01, `expected the cross's bands ~90° apart, got ${(perp * 180 / Math.PI).toFixed(1)}°`)
    assert(fanSeen >= BLANK_FAN_N, `expected a ${BLANK_FAN_N}-shot fan in flight, saw at most ${fanSeen}`)
    assert(allStraight, 'expected P3 fan shots to fly straight (turnRate 0)')
    const dAfter = Math.hypot(boss.x - run.player.x, boss.y - run.player.y)
    assert(dAfter < dBefore - 100, `expected the P3 boss to close on the player (${dBefore.toFixed(0)} -> ${dAfter.toFixed(0)}px)`)
    console.log(`PASS run HH.b-d (P3): chases at ${BLANK_BOSS_SPEED_P3} (${dBefore.toFixed(0)} -> ${dAfter.toFixed(0)}px), cross ${(perp * 180 / Math.PI).toFixed(0)}° apart, ${fanSeen}-shot straight fan`)
  }

  // (e) P3 recruit faucet: idling in the duel keeps spawning mixed fodder — after 10s there are
  // multiple recruits alive and more than one rosterId among them.
  {
    const run = createRun(makeMeta(), { chapter: 'blank', difficulty: 1 })
    run.player.hp = run.player.maxHP = 1e6
    run.weapons = []
    Object.assign(run.script, { stage: 5, waveIdx: 0, waveT: 0, spawned: false, bossId: null })
    stepSim(run, { x: 0, y: 0 }, dt)
    advance(run, 10, dt, { x: 0, y: 0 })
    const recruits = run.enemies.filter((e) => !e._dead && e.id !== run.script.bossId)
    const rids = new Set(recruits.map((e) => e.rosterId))
    assert(recruits.length >= 10, `expected an endless P3 faucet (>= 10 recruits after 10s), got ${recruits.length}`)
    assert(rids.size >= 2, `expected a mixed P3 recruit pulse, got only ${[...rids].join(',')}`)
    console.log(`PASS run HH.e (P3 faucet): ${recruits.length} recruits after 10s idle, mix of ${[...rids].join('/')}`)
  }

  console.log('PASS run HH (The Blank pacing): phase-kill levels, P3 chase, band crosses, straight fans, endless faucet')
}

// ---- Run II: anti-kite straggler recycling (v6.0.1) -------------------------------------------
// Nothing in the game outruns the player, so a committed runner used to shed the whole horde and
// win the survival clock untouched (measured: a weaving diagonal runner beat body/pond/garden at
// 92-95% hp, level 1). stepStragglers recycles any chaser left beyond KITE_DROP_MUL × spawn
// distance behind a MOVING player onto the spawn ring ahead of the heading. Locked here: the
// recycle itself, the stationary exemption, and the lane/scripted chapter exemptions.
function testAntiKite() {
  const dt = 1 / 60
  const place = (run, dist) => {
    const e = makeStatusEnemy(run, { x: run.player.x - dist, y: run.player.y, hp: 50, speed: 0 })
    run.enemies.push(e)
    return e
  }

  // (a) Moving player: a straggler 3000px behind lands on the spawn ring, ahead of the heading.
  {
    const run = createRun(makeMeta(), { chapter: 'body', difficulty: 1 })
    run.player.hp = run.player.maxHP = 1e6
    const e = place(run, 3000)
    stepSim(run, { x: 1, y: 0 }, dt)
    const d = Math.hypot(e.x - run.player.x, e.y - run.player.y)
    const spawnD = run.viewRadius + SPAWN_RING
    assert(Math.abs(d - spawnD) < spawnD * 0.05, `expected the straggler recycled to ~${spawnD.toFixed(0)}px, got ${d.toFixed(0)}`)
    assert(e.x > run.player.x, `expected the recycled straggler AHEAD of a +x runner, got dx=${(e.x - run.player.x).toFixed(0)}`)
    console.log(`PASS run II.a (recycle): straggler 3000px behind -> ${d.toFixed(0)}px ahead of the heading`)
  }

  // (b) Stationary player: the same straggler is never touched.
  {
    const run = createRun(makeMeta(), { chapter: 'body', difficulty: 1 })
    run.player.hp = run.player.maxHP = 1e6
    const e = place(run, 3000)
    stepSim(run, { x: 0, y: 0 }, dt)
    assert(Math.abs(e.x - (run.player.x - 3000)) < 1, 'expected no recycling around a stationary player')
    console.log('PASS run II.b (stationary exemption): distant enemy untouched')
  }

  // (c) Lane and scripted chapters are exempt (they own their spawn geometry).
  for (const chapter of ['beyond', 'blank']) {
    const run = createRun(makeMeta(), { chapter, difficulty: 1 })
    run.player.hp = run.player.maxHP = 1e6
    const e = place(run, 3000)
    stepSim(run, { x: 1, y: 0 }, dt)
    assert(e.x < run.player.x - 2000, `expected the ${chapter} straggler still far behind, got dx=${(e.x - run.player.x).toFixed(0)}`)
    console.log(`PASS run II.c (${chapter} exemption): straggler stays where it was left`)
  }

  console.log('PASS run II (anti-kite): stragglers recycle ahead, stationary/lane/scripted exempt')
}

// ---- Run JJ: v6.2 Remaster (melee parity, toxic shock, new events, reword tables) -------------
function testRemaster() {
  const dt = 1 / 60
  // (a) Melee parity: a flagella sweep shoves — the enemy gains outward push it never had before.
  {
    const run = createRun(makeMeta(), { chapter: 'pond', difficulty: 1 })
    run.player.hp = run.player.maxHP = 1e6
    run.weapons = [{ id: 'flagella', level: 1 }]
    const e = makeStatusEnemy(run, { x: 60, y: 0, hp: 1e6, speed: 0 })
    run.enemies.push(e)
    advance(run, 2, dt, { x: 0, y: 0 })
    assert(Math.abs(e.kb.x) + Math.abs(e.kb.y) > 0 || Math.hypot(e.x, e.y) > 70,
      'expected the flagella sweep to shove the enemy (knockback parity with roar)')
    console.log('PASS run JJ.a (melee parity): flagella hit shoves')
  }
  // (b) Toxic Shock: rolls only in body, lands in run.mods, scales the acid pool's dps.
  {
    assert(randomMutators(99, 'body').includes('toxicShock'), 'toxicShock must roll in body')
    assert(!randomMutators(99, 'pond').includes('toxicShock'), 'toxicShock must not roll outside body')
    const run = createRun(makeMeta(), { chapter: 'body', mutators: ['toxicShock'] })
    assert.strictEqual(run.mods.acidPotencyMul, 1.6, 'toxicShock lands in run.mods.acidPotencyMul')
    console.log('PASS run JJ.b (toxic shock): body-scoped, acidPotencyMul 1.6')
  }
  // (c) New events: chitterShriek emits 'shriek' (not a generic shoot); shard blinks emit 'blink'.
  {
    const run = createRun(makeMeta(), { chapter: 'undergrowth', difficulty: 1 })
    run.player.hp = run.player.maxHP = 1e6
    run.weapons = [{ id: 'chitterShriek', level: 1 }]
    run.enemies.push(makeStatusEnemy(run, { x: 80, y: 0, hp: 1e6, speed: 0 }))
    const seen = advance(run, 4, dt, { x: 0, y: 0 })
    assert(seen.has('shriek'), "expected a 'shriek' event within 4s")
    const run2 = createRun(makeMeta(), { chapter: 'beyond', difficulty: 1 })
    run2.player.hp = run2.player.maxHP = 1e6
    run2.weapons = [{ id: 'realityShard', level: 1 }]
    run2.enemies.push(makeStatusEnemy(run2, { x: 400, y: 0, hp: 1e6, speed: 0 }))
    const seen2 = advance(run2, 4, dt, { x: 0, y: 0 })
    assert(seen2.has('blink'), "expected a 'blink' event within 4s")
    console.log('PASS run JJ.c (new events): shriek + blink emitted')
  }
  // (d) Reword tables: every chapter (incl. blank) has both ending lines; unlock lines cover
  // every non-first CHAPTER_ORDER chapter.
  {
    for (const id of [...CHAPTER_ORDER, 'blank']) {
      assert(CHAPTER_ENDINGS[id]?.victory && CHAPTER_ENDINGS[id]?.death, `CHAPTER_ENDINGS missing ${id}`)
    }
    for (const id of CHAPTER_ORDER.slice(1)) assert(CHAPTER_UNLOCK_LINES[id], `CHAPTER_UNLOCK_LINES missing ${id}`)
    console.log('PASS run JJ.d (reword tables): endings + unlock lines complete')
  }
  console.log('PASS run JJ (Remaster): melee parity, toxic shock, new events, reword tables')
}

// ---- Run KK: v6.3 city terrain wiring (world seed, road exclusion, curb snapping, density floor)
// CHAPTERS.city gains roads:true and shares the WORLD seed (run._districtSeed) with skies — but
// city's is DERIVED from run._obstacleSeed (state.js) rather than a fresh Math.random() draw, so
// no seeded test's RNG stream can shift (the AA.c/runStarOnly scar, third time). KK.a proves that
// derivation: non-null, deterministic, and free (zero extra draws). KK.b proves streamObstacles
// actually exercises the new gates for a live city run: road exclusion and the post-snap minDist
// re-check (blockSnap can shove a structure back into the spawn clearing).
function testCityTerrainWiring() {
  // (a) world seed: non-null for city, deterministic given the same _obstacleSeed path, skies
  // unaffected, and CHAPTERS.city.roads costs exactly zero Math.random() draws in createRun.
  {
    Math.random = mulberry32(20260714)
    const run1 = createRun(makeMeta(), { chapter: 'city' })
    assert(run1._districtSeed != null, 'expected a city run to get a non-null _districtSeed (v6.3: roads-only chapters derive one from _obstacleSeed)')

    Math.random = mulberry32(20260714)
    const run2 = createRun(makeMeta(), { chapter: 'city' })
    assert.strictEqual(run2._districtSeed, run1._districtSeed, 'expected _districtSeed to be deterministic given the same _obstacleSeed path (same Math.random stream in)')

    Math.random = mulberry32(20260714)
    const skiesRun = createRun(makeMeta(), { chapter: 'skies' })
    assert(skiesRun._districtSeed != null, 'expected skies to keep its own non-null _districtSeed (districts path untouched by v6.3)')

    // RNG-neutrality: reseed identically, create a city run with roads on vs off, and compare the
    // NEXT Math.random() draw after createRun returns — if roads consumed a draw internally, the
    // two streams would have diverged and this next value would differ.
    Math.random = mulberry32(20260714)
    createRun(makeMeta(), { chapter: 'city' })
    const nextWithRoads = Math.random()

    Math.random = mulberry32(20260714)
    const savedRoads = CHAPTERS.city.roads
    CHAPTERS.city.roads = false
    createRun(makeMeta(), { chapter: 'city' })
    CHAPTERS.city.roads = savedRoads
    const nextWithoutRoads = Math.random()

    assert.strictEqual(nextWithRoads, nextWithoutRoads, 'expected CHAPTERS.city.roads to cost zero Math.random() draws in createRun (RNG-neutrality invariant)')
    console.log('PASS run KK.a (city world seed): non-null + deterministic for city, skies unaffected, roads costs zero draws')
  }

  // (b) a live city run: obstacles actually stream in, none centred on roadway, none inside the
  // spawn-ring minDist (including post-blockSnap — the case the pre-snap check alone would miss).
  {
    Math.random = mulberry32(20260714)
    const run = createRun(makeMeta(), { chapter: 'city' })
    run.weapons = []; run.mods.spawnMul = 0
    run.player.hp = run.player.maxHP = 1e9
    const dt = 1 / 60
    let t = 0
    for (let i = 0; i < Math.round(10 / dt); i++) { t += dt; stepSim(run, { x: Math.cos(t), y: Math.sin(t) }, dt) }
    // Teleport well clear of OBSTACLE_CELL (420px) so the next step forces a fresh cell scan —
    // streamObstacles early-returns while the player stays inside the same streaming cell.
    run.player.x += 1200; run.player.y += 1200
    for (let i = 0; i < Math.round(5 / dt); i++) { t += dt; stepSim(run, { x: 0, y: 0 }, dt) }
    assert(run.obstacles.length > 0, 'expected a live city run to stream in real obstacles')

    const cfg = CHAPTERS.city.obstacles
    const onRoad = run.obstacles.filter((o) => roadAt(o.x, o.y, run._districtSeed).onRoad)
    assert.strictEqual(onRoad.length, 0,
      `expected no city obstacle centred on roadway, found ${onRoad.length}/${run.obstacles.length}: ${JSON.stringify(onRoad.slice(0, 3))}`)
    const tooClose = run.obstacles.filter((o) => Math.hypot(o.x, o.y) < cfg.minDist - 1e-6)
    assert.strictEqual(tooClose.length, 0,
      `expected every city obstacle to respect minDist=${cfg.minDist} from spawn (post-snap re-check included), found ${tooClose.length} inside it`)
    console.log(`PASS run KK.b (city road exclusion + post-snap minDist): ${run.obstacles.length} live obstacles, 0 on roadway, 0 inside minDist=${cfg.minDist}`)
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
  testLaneMarch()
  testLaneSkills()
  testV54Weapons()
  testDistricts()
  testSkiesKaiju()
  testRoads()
  testTheBlank()
  testTheBlankBoss()
  testChapterAnomalies()
  testTheBlankPacing()
  testAntiKite()
  testRemaster()
  testCityTerrainWiring()
  console.log('ALL TESTS PASSED')
} catch (err) {
  console.error('FAIL:', err.message)
  process.exit(1)
}
