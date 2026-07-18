// Pure simulation. No Pixi/DOM/localStorage — mutates `run` (see state.js) and
// pushes events consumed once per frame by main.js/render.js.
// Contract: see state.js (run shape + events) and config.js (all numbers).
//
// Mutators (v4.0, see MUTATORS/mergeMutatorMods in config.js): run.mods is applied at exactly
// these points, nowhere else —
//   spawnMul            stepSpawning (spawn rate)
//   enemyHpMul/enemySpeedMul/enemyDmgMul/enemyRadiusMul   spawnEnemy (per-enemy stats)
//   eliteEveryMul        spawnEnemy (elite cadence step)
//   contactDmgTakenMul   hurtPlayer (contact damage + volatile bomb blasts)
//   playerDmgMul         applyDamage (player-side outgoing damage only, not raw DoT/combo ticks)
//   playerSpeedMul       stepPlayerMovement
//   magnetMul            stepPickups (magnet range)
//   xpMul/coinMul        stepPickups (gem xp / coin value, at pickup time)
//   elementWeightMul     eligibleElementIds (level-up pool weight)
//
// Elite affixes (v4.0, see ELITE_AFFIXES in config.js): rolled once at elite spawn, stored on
// e.affixes. shielded/gilded apply in dealDamage; splitter/volatile apply in dealDamage's death
// branch; pacer/frenzied apply in stepEnemyMovement; anchored is checked in stepNovas
// (knockback) and stepHoles (pull) — see each function for the guard.
//
// Gold sinks (v4.5, see CONSUMABLES/REVIVE_* in config.js): pre-run consumables are applied once
// at createRun (state.js) — headstart/charged just pre-load player.xp/starting weapon level, no
// sim.js involvement. Revive Token is the one with sim-side behavior: hurtPlayer (the shared
// player-death path used by contact damage and volatile bombs) consumes run.revives instead of
// flipping phase to 'dead' when one is banked — see hurtPlayer below.

import {
  RUN_DURATION, PLAYER, WEAPONS, CHAPTERS, MAX_WEAPON_LEVEL, MAX_WEAPONS,
  PASSIVES, MAX_PASSIVE_LEVEL, WEAPON_MODS, MAX_WEAPON_MOD_PICKS, WEAPON_MOD_TIER_BONUS, MOD_POOL_MAX,
  MOD_CANDIDATES_PER_WEAPON, MAX_MODS_PER_WEAPON_PER_POOL,
  ELEMENTS, MAX_ELEMENT_PICKS, ELEMENT_CARD_WEIGHT, COMBOS,
  RARITIES, RARITY_ORDER, RARITY_WEIGHTS,
  ENEMIES, ELITE, WAVE_TABLE,
  spawnRate, hpScale, MAX_ALIVE, eliteEveryAt, SPAWN_RING, speedCreepMul,
  OBSTACLE_CELL, OBSTACLE_STREAM_RADIUS, OBSTACLE_DROP_RADIUS, OBSTACLE_FIELD_RADIUS,
  xpForLevel, GEM_VALUE,
  STAR_LIFE, STAR_R, STAR_FAN, ORB_R, NOVA_LIFE,
  STAR_SPLIT_DMG_FRAC, STAR_SPLIT_BASE_ANGLE, STAR_SPLIT_MAX_SPREAD,
  STAR_CHAIN_RANGE, STAR_CHAIN_DMG_MUL, STAR_CHAIN_EXTRA_LIFE,
  STAR_RICOCHET_DMG_MUL, STAR_RICOCHET_ANGLE_MIN, STAR_RICOCHET_ANGLE_MAX, STAR_RICOCHET_EXTRA_LIFE,
  HOLE_CORE_FRAC, HOLE_RIM_PULL_MUL, HOLE_RESIST_CAP, HOLE_SPIRAL_MUL,
  HOLE_CORE_DMG_MUL, HOLE_PULL_DECAY,
  ORBIT_TWIN_RING_RADIUS_FRAC, WAVE_ECHO_DELAY, WAVE_ECHO_DMG_FRAC,
  MINE_CLUSTER_DMG_FRAC, MINE_CLUSTER_RADIUS_FRAC, MINE_CLUSTER_ARM,
  MINE_CLUSTER_SCATTER_MIN, MINE_CLUSTER_SCATTER_MAX, HOLE_SINGULARITY_FRAC,
  ORBIT_NOVA_RADIUS, UNDERTOW_KB_PER_STACK, TSUNAMI_EVERY, SEEKER_TURN_RATE,
  MINE_CRAWL_SPEED, WISP_NOVA_RADIUS, SWARM_DMG_FRAC, SWARM_LIFE, CRUNCH_DMG_MUL,
  STATUS_TICK, IGNITE_DOT_FRAC, IGNITE_DURATION,
  CHILL_SLOW_BASE, CHILL_SLOW_PER_POTENCY, CHILL_SLOW_CAP, CHILL_DURATION,
  CHILL_STACK_TO_FREEZE, FREEZE_DURATION, FREEZE_IMMUNITY, ELITE_FREEZE_SLOW_MUL,
  SHOCK_ARC_FRAC, SHOCK_RANGE, SHOCK_CD,
  VENOM_MAX_STACKS, VENOM_DURATION, VENOM_DOT_PER_STACK, VENOM_AMP_PER_STACK,
  ELITE_AFFIXES, AFFIX_SECOND_AT, SHIELD_HP_FRAC, SHIELD_DMG_MUL, SPLITTER_COUNT,
  VOLATILE_FUSE, VOLATILE_RADIUS, VOLATILE_DMG, PACER_RADIUS, PACER_SPEED_MUL,
  FRENZY_HP_FRAC, FRENZY_SPEED_MUL, GILDED_HP_MUL, GILDED_COIN_MUL,
  newWeaponChance, NEW_WEAPON_MIN_RATE,
  REVIVE_HP_FRAC, REVIVE_INVULN, REVIVE_SHOVE_RADIUS, REVIVE_SHOVE_KB,
  ARCHETYPE_TYPE, TYPE_ARCHETYPE, LATCH_SLOW_T, LATCH_SLOW_MUL,
  SPLIT_CHILD_COUNT, SPLIT_HP_FRAC, SPLIT_RADIUS_FRAC,
  DASH_IDLE_T, DASH_T, DASH_IDLE_SPEED_MUL, DASH_SPEED_MUL,
  ACID_R, ACID_DUR, ACID_DPS, SOAP_INTERVAL, SOAP_R, SOAP_DUR, SOAP_DPS,
  FLAGELLA_CYCLONE_EVERY, BARBED_DMG_MUL, BARBED_DURATION,
  BLOOM_GROW_FRAC, BLOOM_TICK, SPOREBURST_FRAC,
  STINGER_R, STINGER_HIVE_EVERY, LURE_STICKY_R, LURE_STICKY_DUR,
  PHEROMONE_LIFE, PHEROMONE_FOLLOW_RADIUS, PHEROMONE_SPEED_MUL,
  DIVE_STANDOFF, DIVE_HOVER_T, DIVE_TELEGRAPH_T, DIVE_T, DIVE_RECOVER_T,
  DIVE_HOVER_SPEED_MUL, DIVE_SPEED_START, DIVE_SPEED_END, DIVE_RECOVER_SPEED_MUL, DIVE_HOVER_DEADZONE,
  WEB_INTERVAL, WEB_R, WEB_DUR, WEB_SLOW_MUL,
  SPRAY_INTERVAL, SPRAY_FUSE, SPRAY_LEN, SPRAY_W, SPRAY_ACTIVE, SPRAY_DPS,
  // v5.4 undergrowth
  POUNCE_RANGE, POUNCE_HOLD_SPEED_MUL, POUNCE_AIM_T, POUNCE_LEAP_T, POUNCE_LEAP_SPEED_MUL, POUNCE_LAND_T,
  AERIAL_RADIUS, AERIAL_ORBIT_SPEED, AERIAL_CIRCLE_T, AERIAL_MARK_T, AERIAL_STRIKE_T,
  AERIAL_STRIKE_SPEED_MUL, AERIAL_CLIMB_T, AERIAL_UNTOUCHABLE,
  FLASHLIGHT_RANGE, FLASHLIGHT_ARC, FLASHLIGHT_SWEEP, FLASHLIGHT_SWEEP_SPEED,
  FLASHLIGHT_ENRAGE_T, FLASHLIGHT_SPEED_MUL, FLASHLIGHT_DMG_MUL,
  SNAP_TRAP_DMG, SNAP_TRAP_REARM,
  CLAW_DOUBLE_EVERY, CLAW_DOUBLE_DELAY, CLAW_DOUBLE_DMG_FRAC,
  QUILL_R, QUILL_RETALIATE_CD,
  FEAR_SPEED_MUL, SHRIEK_ECHO_DELAY, SHRIEK_ECHO_DMG_FRAC,
  // v5.4 city
  LINE_CHARGE_RANGE, LINE_CHARGE_TRACK_SPEED_MUL, LINE_CHARGE_LOCK_T, LINE_CHARGE_T,
  LINE_CHARGE_SPEED_MUL, LINE_CHARGE_STALL_T,
  SPAWNER_INTERVAL, SPAWNER_COUNT, SPAWNER_ARCHETYPE, SPAWNER_SCATTER,
  TRAFFIC_INTERVAL, TRAFFIC_WARN, TRAFFIC_SWEEP, TRAFFIC_LEN, TRAFFIC_W, TRAFFIC_OFFSET,
  TRAFFIC_CAR_LEN, TRAFFIC_CAR_W, TRAFFIC_DMG, TRAFFIC_KB, TRAFFIC_SQUASH,
  DEBRIS_R, TORNADO_FLING_EVERY, TORNADO_FLING_DMG_FRAC, TORNADO_FLING_SPEED, TORNADO_FLING_RANGE,
  TORNADO_SUCTION_RANGE, TORNADO_SUCTION_PULL, TORNADO_SUCTION_RESIST,
  GEYSER_LAUNCH_KB, GEYSER_STUN, GEYSER_CHAIN_FRAC, GEYSER_CHAIN_FUSE,
  GEYSER_CHAIN_SCATTER_MIN, GEYSER_CHAIN_SCATTER_MAX,
  // v5.4 skies
  STRAFE_STANDOFF, STRAFE_BANK_T, STRAFE_BANK_SPEED_MUL, STRAFE_RUN_T, STRAFE_RUN_SPEED_MUL,
  MISSILE_STANDOFF, MISSILE_HOVER_SPEED_MUL, MISSILE_DEADZONE, MISSILE_INTERVAL, MISSILE_COUNT,
  MISSILE_GAP, MISSILE_SPEED, MISSILE_TURN, MISSILE_LIFE, MISSILE_R, MISSILE_DMG, MISSILE_BLAST,
  ARTILLERY_INTERVAL, ARTILLERY_FUSE, ARTILLERY_RADIUS, ARTILLERY_DMG, ARTILLERY_LEAD,
  ARTILLERY_ELITE_INTERVAL, ARTILLERY_ELITE_RADIUS, ARTILLERY_ELITE_DMG,
  BOMBARDMENT_COUNT, BOMBARDMENT_SPREAD, BOMBARDMENT_FUSE, BOMBARDMENT_RADIUS, BOMBARDMENT_DMG,
  ROAR_STUN, ROAR_RESONANCE_EVERY, TAIL_COLLIDE_R, TAIL_COLLIDE_FRAC, TAIL_COUNTER_CD,
  LOB_SHRAPNEL_DMG_FRAC, LOB_SHRAPNEL_SPEED, LOB_SHRAPNEL_RANGE, LOB_SHRAPNEL_R,
  // v5.4 beyond
  BLINK_INTERVAL, BLINK_DIST, BLINK_MIN_DIST, BLINK_CRAWL_SPEED_MUL, BLINK_FX_R,
  PHASE_SOLID_T, PHASE_GHOST_T, PHASE_GHOST_SPEED_MUL,
  PULL_BEAM_INTERVAL, PULL_BEAM_T, PULL_BEAM_RANGE, PULL_BEAM_FORCE, PULL_BEAM_DPS,
  SHARD_R, SHARD_RIFT_FUSE, SHARD_RIFT_R, SHARD_RIFT_FRAC,
  SHARD_RECURSE_DMG_FRAC, SHARD_RECURSE_LIFE_FRAC,
  TESSERACT_ARMS, TESSERACT_COLLAPSE_MUL, TESSERACT_COLLAPSE_PULL,
} from './config.js'

const KB_DECAY_RATE = 6 // per-second exponential-ish decay factor for enemy knockback

// Fixed tuning for v2 weapons (no per-level config entries; same shape at every level).
const BOOMERANG_FAN = 0.25    // rad, half-spread when several boomerangs are thrown
const BOOMERANG_HIT_R = 14    // px, hit radius added to enemy radius
const BOOMERANG_RETURN_R = 24 // px, distance from player at which a returning boomerang despawns
const MINE_TRIGGER_R = 28     // px, proximity (added to enemy radius) that arms a mine's detonation
const HOMING_FAN = 0.35       // rad, half-spread when several homing shots are fired
const HOMING_HIT_R = 10       // px, hit radius added to enemy radius

/** Advance the simulation by dt seconds. input = {x, y} normalized move vector. */
export function stepSim(run, input, dt) {
  run.time += dt
  if (run.time >= RUN_DURATION) {
    run.phase = 'victory'
    run.events.push({ type: 'victory' })
    return
  }

  stepPlayerMovement(run, input, dt)
  stepRegen(run, dt)
  stepSpawning(run, dt)
  stepEnemyMovement(run, dt)
  stepFlashlightCones(run, dt) // v5.4 undergrowth: elite cones that enrage the swarm (damages nothing)
  stepCurrents(run, dt)   // v5.0 signature mechanic: drift field (no-op unless the chapter has one)
  stepBombardment(run, dt) // v5.4 skies signature: rain telegraphed bombs on the player's area
  streamObstacles(run)    // v5.6.13: materialize/drop obstacle cells as the player roams
  stepObstacles(run)      // v5.0: push player/enemies out of this chapter's obstacle field (if any)
  stepTrails(run, dt)     // v5.3 garden: expire dropped pheromone nodes (no-op unless any exist)
  stepWebs(run, dt)       // v5.3 garden: expire spider web slow-zones (no-op unless any exist)

  if (stepContactDamage(run)) return // phase is now 'dead'
  if (stepBombs(run, dt)) return // phase is now 'dead' (volatile-elite death bomb blast)
  if (stepPools(run, dt)) return // phase is now 'dead' (acid/soap pool DoT — v5.0)
  if (stepStrips(run, dt)) return // phase is now 'dead' (garden pesticide spray-strip DoT — v5.3)
  if (stepTraps(run, dt)) return // phase is now 'dead' (undergrowth snap trap — v5.4)
  if (stepLanes(run, dt)) return // phase is now 'dead' (city traffic — v5.4)
  if (stepEnemyShots(run, dt)) return // phase is now 'dead' (helicopter missile — v5.4)
  if (stepPullBeams(run, dt)) return // phase is now 'dead' (UFO abduction beam DoT — v5.4)

  stepGravityWells(run, dt) // v5.4 beyond signature: bend every projectile in flight (damages nothing)
  stepWeapons(run, dt)
  stepStatuses(run, dt)
  stepPickups(run, dt)
  stepLevelUp(run)
}

/** Apply run.levelUpChoices[i] to the run (weapon add/level, passive, heal). */
export function applyChoice(run, i) {
  const choice = run.levelUpChoices && run.levelUpChoices[i]
  run.levelUpChoices = null
  if (!choice) return

  const p = run.player
  if (choice.kind === 'weapon') {
    const existing = run.weapons.find((w) => w.id === choice.id)
    if (existing) existing.level = Math.min(MAX_WEAPON_LEVEL, existing.level + 1)
    else if (run.weapons.length < MAX_WEAPONS) run.weapons.push({ id: choice.id, level: 1 })
  } else if (choice.kind === 'passive') {
    run.passives[choice.id] = (run.passives[choice.id] ?? 0) + choice.bonus
    run.passivePicks[choice.id] = (run.passivePicks[choice.id] ?? 0) + 1
    if (choice.id === 'maxHP') {
      p.maxHP += choice.bonus
      p.hp = Math.min(p.maxHP, p.hp + choice.bonus)
    }
  } else if (choice.kind === 'mod') {
    const mods = run.weaponMods[choice.weapon]
    const picks = run.weaponModPicks[choice.weapon]
    mods[choice.id] = (mods[choice.id] ?? 0) + choice.bonus
    picks[choice.id] = (picks[choice.id] ?? 0) + 1
  } else if (choice.kind === 'element') {
    run.elements[choice.id] = (run.elements[choice.id] ?? 0) + choice.bonus
    run.elementPicks[choice.id] = (run.elementPicks[choice.id] ?? 0) + 1
  } else if (choice.kind === 'heal') {
    p.hp = Math.min(p.maxHP, p.hp + 30)
  }
}

// ---- Player -------------------------------------------------------------------

function stepPlayerMovement(run, input, dt) {
  const p = run.player
  let ix = input?.x || 0
  let iy = input?.y || 0
  const len = Math.hypot(ix, iy)
  if (len > 1) { ix /= len; iy /= len } // clamp to unit circle, keep sub-unit analog magnitude

  // Move-speed debuffs: latch (v5.0) sets a timed player.slowT; web (v5.3 garden) slows while the
  // player stands in any run.webs patch. They STACK via a MIN of the two multipliers — the stronger
  // slow wins rather than compounding (documented on WEB_SLOW_MUL in config.js).
  const latchMul = p.slowT > 0 ? LATCH_SLOW_MUL : 1
  let webMul = 1
  if (run.webs && run.webs.length > 0) {
    for (const web of run.webs) {
      const wdx = p.x - web.x, wdy = p.y - web.y
      if (wdx * wdx + wdy * wdy <= web.r * web.r) { webMul = WEB_SLOW_MUL; break }
    }
  }
  const slowMul = Math.min(latchMul, webMul)
  const speed = p.speed * (1 + run.passives.moveSpeed) * run.mods.playerSpeedMul * slowMul
  p.x += ix * speed * dt
  p.y += iy * speed * dt
  // The player's own input velocity, snapshotted for the skies' artillery flag to lead its shells
  // (ARTILLERY_LEAD). Deliberately input-only: drift/pull forces aren't something a tank can read.
  p.vx = ix * speed
  p.vy = iy * speed

  p.moving = len > 1e-6
  if (ix > 1e-6) p.facing = 1
  else if (ix < -1e-6) p.facing = -1
  // v5.0: last non-zero move direction as a full angle — render orients the pond tail to it, and
  // the Flagella Whip falls back to it only when no enemy exists to aim at (see fireFlagella).
  // Stays null until the player first moves.
  if (len > 1e-6) p.facingAngle = Math.atan2(iy, ix)

  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt)
  if (p.slowT > 0) p.slowT = Math.max(0, p.slowT - dt)
}

function stepRegen(run, dt) {
  const p = run.player
  if (run.passives.regen > 0) {
    p.hp = Math.min(p.maxHP, p.hp + run.passives.regen * dt)
  }
}

// ---- Spawning -------------------------------------------------------------------

function waveWeights(t) {
  let table = WAVE_TABLE[0][1]
  for (const [from, weights] of WAVE_TABLE) {
    if (t >= from) table = weights
    else break
  }
  return table
}

// Generic weighted-random key pick; used for both enemy-type spawns and rarity rolls.
function pickWeighted(weights) {
  const entries = Object.entries(weights)
  let total = 0
  for (const [, w] of entries) total += w
  let r = Math.random() * total
  for (const [key, w] of entries) {
    r -= w
    if (r <= 0) return key
  }
  return entries[entries.length - 1][0]
}

function stepSpawning(run, dt) {
  run._spawnAcc += spawnRate(run.time) * run.mods.spawnMul * dt
  while (run._spawnAcc >= 1 && run.enemies.length < MAX_ALIVE) {
    run._spawnAcc -= 1
    spawnEnemy(run)
  }
}

// Rolls ELITE_AFFIXES.length equal-weight distinct affix ids: 1 normally, 2 once
// run.time >= AFFIX_SECOND_AT. Called only for elites.
function rollAffixes(run) {
  const count = run.time >= AFFIX_SECOND_AT ? 2 : 1
  const pool = Object.keys(ELITE_AFFIXES)
  const picked = []
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length)
    picked.push(pool.splice(idx, 1)[0])
  }
  return picked
}

// Shared init for every field an enemy needs beyond its combat stats (elemental status, hit/
// knockback bookkeeping) — used by both spawnEnemy and spawnSplitChildren so the two spawn
// paths can't drift out of sync with the enemies[] contract in state.js.
function freshEnemyFields() {
  return {
    hitFlash: 0,
    orbCd: 0,
    kb: { x: 0, y: 0 },
    holePull: 0,
    // Elemental status (see ELEMENTS/COMBOS in config.js; ticked by stepStatuses).
    ignite: 0, igniteDps: 0,
    chill: 0, chillSlow: 0, frozen: 0,
    venom: 0, venomT: 0,
    // Bleed DoT (v5.0, flagella's barbed mod — see applyBleed): dot-flagged, ticks like ignite.
    bleed: 0, bleedDps: 0,
    // Status effects (v5.4, see the enemies[] contract in state.js): fear inverts the seek, stun
    // freezes it, enrage speeds it up and hardens its contact damage. Ticked in stepEnemyMovement.
    fearT: 0, stunT: 0, enrageT: 0,
    _chillStack: 0, _freezeImmuneT: 0, _shockCd: 0, _comboCd: {},
  }
}

// opts: { type, x, y, forceNormal } — lets splitter deaths spawn wisps at a fixed position
// (never elite, but still time-scaled like any other spawn). Called with no opts by the
// normal spawn-timer path in stepSpawning.
function spawnEnemy(run, opts = {}) {
  const isElite = !opts.forceNormal && run.time >= run._nextEliteAt
  if (isElite) run._nextEliteAt += eliteEveryAt(run.time) * run.mods.eliteEveryMul

  const type = opts.type ?? pickWeighted(waveWeights(run.time))
  const base = ENEMIES[type]
  const p = run.player

  // Roster (v5.0, see CHAPTERS[run.chapter].roster in config.js): pick a random roster entry
  // matching this spawn type's archetype, apply its hp/speed multipliers, and carry its behavior
  // flags onto the enemy (elites additionally get the chapter's eliteFlags — see below).
  const archetype = TYPE_ARCHETYPE[type] ?? 'normal'
  const rosterPool = CHAPTERS[run.chapter].roster.filter((r) => r.archetype === archetype)
  const roster = rosterPool.length > 0 ? rosterPool[Math.floor(Math.random() * rosterPool.length)] : null

  let x, y
  if (opts.x !== undefined && opts.y !== undefined) {
    x = opts.x; y = opts.y
  } else {
    const angle = Math.random() * Math.PI * 2
    const dist = run.viewRadius + SPAWN_RING
    x = p.x + Math.cos(angle) * dist
    y = p.y + Math.sin(angle) * dist
  }

  let hp = base.hp * hpScale(run.time) * (isElite ? ELITE.hpMul : 1) * run.mods.enemyHpMul * (roster?.hpMul ?? 1)
  const speed = base.speed * speedCreepMul(run.time) * run.mods.enemySpeedMul * (roster?.speedMul ?? 1)
  const dmg = base.dmg * (isElite ? ELITE.dmgMul : 1) * run.mods.enemyDmgMul
  const radius = base.radius * (isElite ? ELITE.sizeMul : 1) * run.mods.enemyRadiusMul

  const affixes = isElite ? rollAffixes(run) : []
  if (isElite && affixes.includes('gilded')) hp *= GILDED_HP_MUL

  const flags = roster ? [...roster.flags] : []
  if (isElite) flags.push(...CHAPTERS[run.chapter].eliteFlags)

  run.enemies.push({
    id: run._nextId++,
    type,
    x, y,
    hp, maxHP: hp,
    radius,
    speed,
    dmg,
    elite: isElite,
    affixes,
    flags,
    rosterId: roster?.id ?? null,
    xp: base.xp,
    ...freshEnemyFields(),
  })
}

// split flag (v5.0, see CHAPTERS roster in config.js): spawns SPLIT_CHILD_COUNT smaller clones
// of a dying enemy around its corpse — reuses the same corpse-scatter shape as the elite
// splitter affix (see dealDamage's death branch), but derives the children's hp/radius as a
// fraction of the PARENT's own stats (not a fresh ENEMIES/hpScale spawn) per the v5.0 spec.
// Children are flagged `_splitChild: true` so a further death never re-triggers this (see the
// guard at the call site).
function spawnSplitChildren(run, parent, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const d = Math.random() * 20
    const hp = parent.maxHP * SPLIT_HP_FRAC
    run.enemies.push({
      id: run._nextId++,
      type: parent.type,
      x: parent.x + Math.cos(a) * d,
      y: parent.y + Math.sin(a) * d,
      hp, maxHP: hp,
      radius: parent.radius * SPLIT_RADIUS_FRAC,
      speed: parent.speed,
      dmg: parent.dmg,
      elite: false,
      affixes: [],
      flags: parent.flags,
      rosterId: parent.rosterId,
      xp: parent.xp,
      _splitChild: true,
      ...freshEnemyFields(),
    })
  }
}

// ---- Enemy movement -------------------------------------------------------------

// ponytail: naive O(enemies) seek + O(bullets/orbs/novas × enemies) collision below.
// Upgrade path if profiling ever demands it: bucket enemies into a spatial hash
// (grid keyed by floor(x/cell),floor(y/cell)) and only test nearby cells/pairs.
function stepEnemyMovement(run, dt) {
  const p = run.player
  const kbDecay = Math.max(0, 1 - dt * KB_DECAY_RATE)

  // Cheerleader (pacer) affix: pre-collect live pacer elites before the main loop below
  // starts moving anyone, so "nearby" is judged from this frame's starting positions.
  const pacers = []
  for (const e of run.enemies) {
    if (!e._dead && e.affixes && e.affixes.includes('pacer')) pacers.push(e)
  }
  const pacerRadSq = PACER_RADIUS * PACER_RADIUS

  // v5.3 garden: does this chapter's signature drive pheromone trails? (gates trailFollow logic)
  const sig = CHAPTERS[run.chapter].signature
  const pheromones = sig != null && sig.type === 'pheromones'
  const hasTrails = pheromones && run.trails && run.trails.length > 0
  const hasLures = run.lures && run.lures.length > 0
  const followRadSq = PHEROMONE_FOLLOW_RADIUS * PHEROMONE_FOLLOW_RADIUS

  for (const e of run.enemies) {
    // Seek target: the player by default, or the nearest Pheromone Lure decoy (v5.3 garden) whose
    // aggro radius this enemy sits inside — lured foes path to the decoy instead of the player.
    let tx = p.x, ty = p.y
    if (hasLures) {
      let bestSq = Infinity
      for (const lu of run.lures) {
        const ldx = lu.x - e.x, ldy = lu.y - e.y
        const lsq = ldx * ldx + ldy * ldy
        if (lsq <= lu.aggro * lu.aggro && lsq < bestSq) { bestSq = lsq; tx = lu.x; ty = lu.y }
      }
    }
    const dx = tx - e.x, dy = ty - e.y
    const d = Math.hypot(dx, dy)
    const slowMul = e.frozen > 0 ? 0 : (1 - (e.chillSlow || 0)) // chill/freeze slow the seek movement only

    // Frenzied: speeds up once badly hurt. Cheerleader (pacer): speeds up anyone else nearby.
    let affixSpeedMul = 1
    if (e.affixes && e.affixes.includes('frenzied') && e.hp < e.maxHP * FRENZY_HP_FRAC) {
      affixSpeedMul *= FRENZY_SPEED_MUL
    }
    if (pacers.length > 0) {
      for (const pc of pacers) {
        if (pc === e) continue
        const pdx = pc.x - e.x, pdy = pc.y - e.y
        if (pdx * pdx + pdy * pdy <= pacerRadSq) { affixSpeedMul *= PACER_SPEED_MUL; break }
      }
    }

    let flagSpeedMul = 1
    // trailFollow flag (v5.3 garden's ants): while within PHEROMONE_FOLLOW_RADIUS of any live
    // pheromone node, accelerate along the seek (design: ants "follow & accelerate on" the trail).
    if (hasTrails && e.flags && e.flags.includes('trailFollow')) {
      for (const tr of run.trails) {
        const trdx = tr.x - e.x, trdy = tr.y - e.y
        if (trdx * trdx + trdy * trdy <= followRadSq) { flagSpeedMul *= PHEROMONE_SPEED_MUL; break }
      }
    }

    // phase flag (v5.4 beyond's flickers): windows the enemy solid <-> ghosted. Only its speed
    // shows up here (a ghost hurries); its damage immunity lives in dealDamage/stepContactDamage
    // and its obstacle pass-through in stepObstacles, all keyed off e._phaseSolid.
    if (e.flags && e.flags.includes('phase')) {
      stepPhaseWindow(e, dt)
      if (!e._phaseSolid) flagSpeedMul *= PHASE_GHOST_SPEED_MUL
    }
    // Status effects (v5.4, see state.js): enrage is a plain speed multiplier; fear and stun
    // REPLACE the movement outright below. All guarded — other chapters never set these.
    const enrageMul = (e.enrageT || 0) > 0 ? FLASHLIGHT_SPEED_MUL : 1
    flagSpeedMul *= enrageMul

    // Movement resolution, most-overriding first. stun/fear beat every behavior flag (a panicking
    // or stunned animal doesn't run its hunting routine); the flag machines REPLACE the normal
    // seek for everyone else; the plain seek runs for the rest. slowMul (chill/freeze) applies
    // throughout. Machines take the seek target, so lured foes run their routine at the decoy.
    if ((e.stunT || 0) > 0) {
      // stunned (geyser launch / roar stagger): no seek at all — knockback still carries it below.
    } else if ((e.fearT || 0) > 0) {
      // feared (chitter shriek): flee — the seek direction, inverted, at FEAR_SPEED_MUL.
      if (d > 1e-6 && slowMul > 0) {
        e.x -= (dx / d) * e.speed * FEAR_SPEED_MUL * slowMul * dt
        e.y -= (dy / d) * e.speed * FEAR_SPEED_MUL * slowMul * dt
      }
    } else if (e.flags && e.flags.includes('dashBurst')) {
      // affixSpeedMul is passed through (unlike the other machines, which take enrageMul alone)
      // because dashBurst used to ride the plain seek and therefore honoured pacer/frenzy. Keeping
      // it means this change commits the DIRECTION and nothing else — no silent balance shift.
      stepDashBurst(e, tx, ty, dt, slowMul, affixSpeedMul * enrageMul)
    } else if (e.flags && e.flags.includes('diveBomb')) {
      stepDiveBomb(e, tx, ty, dt, slowMul)
    } else if (e.flags && e.flags.includes('pounce')) {
      stepPounce(e, tx, ty, dt, slowMul, enrageMul)
    } else if (e.flags && e.flags.includes('aerialStrike')) {
      stepAerialStrike(e, tx, ty, dt, slowMul, enrageMul)
    } else if (e.flags && e.flags.includes('lineCharge')) {
      stepLineCharge(e, tx, ty, dt, slowMul, enrageMul)
    } else if (e.flags && e.flags.includes('strafe')) {
      stepStrafe(e, tx, ty, dt, slowMul, enrageMul)
    } else if (e.flags && e.flags.includes('missileVolley')) {
      stepMissileVolley(run, e, tx, ty, dt, slowMul, enrageMul)
    } else if (e.flags && e.flags.includes('blink')) {
      stepBlink(run, e, tx, ty, dt, slowMul, enrageMul)
    } else if (e.elite && e.flags && e.flags.includes('pullBeam') && e._beamState === 'beam') {
      // pullBeam (v5.4 beyond's UFO elites): the UFO holds still while its beam is open. The beam
      // itself (drag + DoT) is stepPullBeams' business — this branch is only its movement.
    } else if (d > 1e-6 && slowMul > 0) {
      e.x += (dx / d) * e.speed * affixSpeedMul * flagSpeedMul * slowMul * dt
      e.y += (dy / d) * e.speed * affixSpeedMul * flagSpeedMul * slowMul * dt
    }

    e.x += e.kb.x * dt
    e.y += e.kb.y * dt
    e.kb.x *= kbDecay
    e.kb.y *= kbDecay
    if (Math.abs(e.kb.x) < 0.5) e.kb.x = 0
    if (Math.abs(e.kb.y) < 0.5) e.kb.y = 0

    if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt)
    if (e.orbCd > 0) e.orbCd = Math.max(0, e.orbCd - dt)
    if (e._debrisCd > 0) e._debrisCd = Math.max(0, e._debrisCd - dt) // Trash Tornado's per-chunk cd
    // v5.4 status effects: tick down every frame, like invuln does for the player.
    if (e.fearT > 0) e.fearT = Math.max(0, e.fearT - dt)
    if (e.stunT > 0) e.stunT = Math.max(0, e.stunT - dt)
    if (e.enrageT > 0) e.enrageT = Math.max(0, e.enrageT - dt)

    // soapTrail elite flag (v5.0, e.g. pond's soap-bubble elites): drops a damaging pool node
    // into the shared run.pools array every SOAP_INTERVAL while alive (see stepPools below).
    if (e.elite && e.flags && e.flags.includes('soapTrail') && !e._dead) {
      e._soapAcc = (e._soapAcc ?? 0) + dt
      if (e._soapAcc >= SOAP_INTERVAL) {
        e._soapAcc -= SOAP_INTERVAL
        run.pools.push({ x: e.x, y: e.y, r: SOAP_R, t: SOAP_DUR, dps: SOAP_DPS })
      }
    }

    // webZone flag (v5.3 garden's spiders): drop a player-slowing web patch into run.webs every
    // WEB_INTERVAL while alive (NOT elite-gated — spiders are ordinary tank-archetype enemies).
    if (e.flags && e.flags.includes('webZone') && !e._dead) {
      e._webAcc = (e._webAcc ?? 0) + dt
      if (e._webAcc >= WEB_INTERVAL) {
        e._webAcc -= WEB_INTERVAL
        run.webs.push({ x: e.x, y: e.y, r: WEB_R, t: WEB_DUR })
      }
    }

    // sprayStrip elite flag (v5.3 garden's pesticide-drone elites): periodically mark a telegraphed
    // rectangular spray strip centered on the player (see run.strips / stepStrips below).
    if (e.elite && e.flags && e.flags.includes('sprayStrip') && !e._dead) {
      e._sprayAcc = (e._sprayAcc ?? 0) + dt
      if (e._sprayAcc >= SPRAY_INTERVAL) {
        e._sprayAcc -= SPRAY_INTERVAL
        run.strips.push({ x: p.x, y: p.y, angle: Math.random() * Math.PI, len: SPRAY_LEN, w: SPRAY_W, fuse: SPRAY_FUSE, t: SPRAY_ACTIVE, dps: SPRAY_DPS })
      }
    }

    // artillery flag (v5.4 skies' tank columns AND its AA-turret elites): a plain slow seek (above)
    // that shells the player's PREDICTED position from wherever it stands. It pushes the EXISTING
    // volatile-bomb array (run.bombs), so it inherits that telegraph -> explode contract for free —
    // and with it, the fact that a shell damages the player and the enemies around it alike.
    if (e.flags && e.flags.includes('artillery') && !e._dead) {
      const interval = e.elite ? ARTILLERY_ELITE_INTERVAL : ARTILLERY_INTERVAL
      e._shellT = (e._shellT ?? interval) - dt
      if (e._shellT <= 0) {
        e._shellT += interval
        run.bombs.push({
          x: p.x + (p.vx ?? 0) * ARTILLERY_LEAD,
          y: p.y + (p.vy ?? 0) * ARTILLERY_LEAD,
          radius: e.elite ? ARTILLERY_ELITE_RADIUS : ARTILLERY_RADIUS,
          fuse: ARTILLERY_FUSE, duration: ARTILLERY_FUSE,
          dmg: e.elite ? ARTILLERY_ELITE_DMG : ARTILLERY_DMG,
        })
      }
    }

    // spawner elite flag (v5.4 city's exterminator vans): disgorges the chapter's SPAWNER_ARCHETYPE
    // roster entry through the NORMAL spawnEnemy path (forceNormal, so they're never elites and
    // never eat the elite cadence) — they get this chapter's roster skin/flags and the run's current
    // hp/speed scaling like any other spawn. Capped so a van can't push the field past MAX_ALIVE.
    if (e.elite && e.flags && e.flags.includes('spawner') && !e._dead) {
      e._spawnT = (e._spawnT ?? SPAWNER_INTERVAL) - dt
      if (e._spawnT <= 0) {
        e._spawnT += SPAWNER_INTERVAL
        for (let i = 0; i < SPAWNER_COUNT && run.enemies.length < MAX_ALIVE; i++) {
          const a = Math.random() * Math.PI * 2
          const sd = Math.random() * SPAWNER_SCATTER
          const sx = e.x + Math.cos(a) * sd
          const sy = e.y + Math.sin(a) * sd
          spawnEnemy(run, { type: ARCHETYPE_TYPE[SPAWNER_ARCHETYPE], x: sx, y: sy, forceNormal: true })
          const spawned = run.enemies[run.enemies.length - 1]
          run.events.push({ type: 'explode', x: sx, y: sy, radius: spawned.radius * 2 })
        }
      }
    }
  }
}

// diveBomb (v5.3 garden's wasps): a four-phase state machine on the enemy — hover at DIVE_STANDOFF,
// telegraph (a brief pause, aim locked at its start), dive in a straight accelerating line through
// the target and overshoot, then recover — repeating. (tx,ty) is the enemy's current seek target
// (player or lure). Speeds are multipliers of e.speed; slowMul folds in chill/freeze (0 = frozen).
function stepDiveBomb(e, tx, ty, dt, slowMul) {
  if (e._diveState === undefined) { e._diveState = 'hover'; e._diveT = DIVE_HOVER_T }
  e._diveT -= dt
  const dx = tx - e.x, dy = ty - e.y
  const d = Math.hypot(dx, dy) || 1
  const ux = dx / d, uy = dy / d
  let vx = 0, vy = 0
  if (e._diveState === 'hover') {
    // Hold DIVE_STANDOFF: close in if too far, back off if too near, hold still within the deadzone.
    const diff = d - DIVE_STANDOFF
    if (Math.abs(diff) > DIVE_HOVER_DEADZONE) {
      const dir = diff > 0 ? 1 : -1
      const spd = e.speed * DIVE_HOVER_SPEED_MUL
      vx = ux * dir * spd; vy = uy * dir * spd
    }
    if (e._diveT <= 0) { e._diveState = 'telegraph'; e._diveT = DIVE_TELEGRAPH_T; e._diveDirX = ux; e._diveDirY = uy }
  } else if (e._diveState === 'telegraph') {
    // Locked pause (aim already snapshotted on entry) — the telegraph the player reacts to.
    if (e._diveT <= 0) { e._diveState = 'dive'; e._diveT = DIVE_T; e._diveElapsed = 0 }
  } else if (e._diveState === 'dive') {
    e._diveElapsed = (e._diveElapsed ?? 0) + dt
    const frac = Math.min(1, e._diveElapsed / DIVE_T)
    const spdMul = DIVE_SPEED_START + (DIVE_SPEED_END - DIVE_SPEED_START) * frac // accelerating line
    vx = e._diveDirX * e.speed * spdMul; vy = e._diveDirY * e.speed * spdMul
    if (e._diveT <= 0) { e._diveState = 'recover'; e._diveT = DIVE_RECOVER_T }
  } else { // recover: slow drift back toward the target before hovering again
    const spd = e.speed * DIVE_RECOVER_SPEED_MUL
    vx = ux * spd; vy = uy * spd
    if (e._diveT <= 0) { e._diveState = 'hover'; e._diveT = DIVE_HOVER_T }
  }
  e.x += vx * slowMul * dt
  e.y += vy * slowMul * dt
}

// pounce (v5.4 undergrowth's cats): hold -> aim -> leap -> land, on _pounceState/_pounceT/
// _pounceDirX/_pounceDirY (the diveBomb idiom). The heading locks at the START of 'aim' and the
// leap never steers, so a dodge beats it and it overshoots; 'land' is the punish window (frozen,
// and stepContactDamage won't let it hurt you there). It has no attack of its own — a cat that
// lands on you damages you through ordinary contact damage, like any other enemy.
// (tx,ty) is the seek target; spdMul folds in enrage. slowMul folds in chill/freeze (0 = frozen).
function stepPounce(e, tx, ty, dt, slowMul, spdMul) {
  if (e._pounceState === undefined) { e._pounceState = 'hold'; e._pounceT = 0 }
  e._pounceT -= dt
  const dx = tx - e.x, dy = ty - e.y
  const d = Math.hypot(dx, dy) || 1
  const ux = dx / d, uy = dy / d
  let vx = 0, vy = 0
  if (e._pounceState === 'hold') {
    const spd = e.speed * spdMul * POUNCE_HOLD_SPEED_MUL
    vx = ux * spd; vy = uy * spd
    if (d <= POUNCE_RANGE) { e._pounceState = 'aim'; e._pounceT = POUNCE_AIM_T; e._pounceDirX = ux; e._pounceDirY = uy }
  } else if (e._pounceState === 'aim') {
    // Dead stop, heading already snapshotted on entry — the telegraph the player reacts to.
    if (e._pounceT <= 0) { e._pounceState = 'leap'; e._pounceT = POUNCE_LEAP_T }
  } else if (e._pounceState === 'leap') {
    const spd = e.speed * spdMul * POUNCE_LEAP_SPEED_MUL
    vx = e._pounceDirX * spd; vy = e._pounceDirY * spd
    if (e._pounceT <= 0) { e._pounceState = 'land'; e._pounceT = POUNCE_LAND_T }
  } else { // land: frozen (the free-hits window)
    if (e._pounceT <= 0) { e._pounceState = 'hold'; e._pounceT = 0 }
  }
  e.x += vx * slowMul * dt
  e.y += vy * slowMul * dt
}

// aerialStrike (v5.4 undergrowth's owls): circle -> mark -> strike -> climb, on _airState/_airT/
// _airAngle/_airTargX/_airTargY. While circling/marking its position is SET on a circle around the
// target (it isn't seeking); the marked point locks at the start of 'mark' (the shadow render draws)
// and 'strike' flies to THAT point without re-aiming. Under AERIAL_UNTOUCHABLE it can neither be
// hit nor hit you while 'circle'/'climb' (see damageImmune/contactHarmless) — it's overhead.
function stepAerialStrike(e, tx, ty, dt, slowMul, spdMul) {
  if (e._airState === undefined) {
    e._airState = 'circle'
    e._airT = AERIAL_CIRCLE_T
    e._airAngle = Math.atan2(e.y - ty, e.x - tx)
  }
  e._airT -= dt
  if (e._airState === 'circle' || e._airState === 'mark') {
    e._airAngle += AERIAL_ORBIT_SPEED * slowMul * dt
    e.x = tx + Math.cos(e._airAngle) * AERIAL_RADIUS
    e.y = ty + Math.sin(e._airAngle) * AERIAL_RADIUS
    if (e._airT <= 0) {
      if (e._airState === 'circle') { e._airState = 'mark'; e._airT = AERIAL_MARK_T; e._airTargX = tx; e._airTargY = ty }
      else { e._airState = 'strike'; e._airT = AERIAL_STRIKE_T }
    }
  } else if (e._airState === 'strike') {
    const dx = e._airTargX - e.x, dy = e._airTargY - e.y
    const d = Math.hypot(dx, dy)
    if (d > 1e-6) {
      const step = Math.min(d, e.speed * spdMul * AERIAL_STRIKE_SPEED_MUL * slowMul * dt)
      e.x += (dx / d) * step
      e.y += (dy / d) * step
    }
    if (e._airT <= 0) { e._airState = 'climb'; e._airT = AERIAL_CLIMB_T }
  } else { // climb: drift back out to the circling standoff, then resume circling from where it is
    const dx = e.x - tx, dy = e.y - ty
    const d = Math.hypot(dx, dy) || 1
    const diff = AERIAL_RADIUS - d
    const step = Math.sign(diff) * Math.min(Math.abs(diff), e.speed * spdMul * slowMul * dt)
    e.x += (dx / d) * step
    e.y += (dy / d) * step
    if (e._airT <= 0) { e._airState = 'circle'; e._airT = AERIAL_CIRCLE_T; e._airAngle = Math.atan2(e.y - ty, e.x - tx) }
  }
}

// lineCharge (v5.4 city's robot vacuums): track -> lock -> charge -> stall, on _chargeState/
// _chargeT/_chargeDirX/_chargeDirY. Same shape as pounce (heading locks at the start of 'lock',
// the charge never steers), but it lines up from much further out and spins down afterwards —
// 'stall' is its punish window (motionless, no contact damage). Render draws the lane off the state.
// dashBurst (v5.0, pond's tadpoles): idle -> dash, on _dashPhase/_dashT/_dashDirX/_dashDirY.
// It idles slow, then LOCKS its heading and flies straight — it does NOT re-aim mid-dash, exactly
// like pounce / lineCharge / strafe / aerialStrike.
//
// It used to re-aim: dashBurst was the only burst in the game that wasn't a machine, just a speed
// multiplier bolted onto the plain seek, so it homed. At DASH_SPEED_MUL of a wisp's 165 that is
// 429 px/s against PLAYER.baseSpeed 220 — a homing burst at ~2x your top speed that you can
// neither outrun nor sidestep, i.e. a guaranteed hit with no counterplay. The player reported it
// as simply "unavoidable" and they were right.
//
// The rule this restores is already the game's own, stated at the pull beam: a threat may be
// impossible to IGNORE but never impossible to ESCAPE. Committing the heading is what turns the
// dash from an unavoidable hit into a dodge — the speed is not the problem and is untouched.
function stepDashBurst(e, tx, ty, dt, slowMul, spdMul) {
  if (e._dashPhase === undefined) { e._dashPhase = 'idle'; e._dashT = DASH_IDLE_T }
  e._dashT -= dt
  const dx = tx - e.x, dy = ty - e.y
  const d = Math.hypot(dx, dy) || 1
  const ux = dx / d, uy = dy / d
  let vx = 0, vy = 0
  if (e._dashPhase === 'idle') {
    const spd = e.speed * spdMul * DASH_IDLE_SPEED_MUL
    vx = ux * spd; vy = uy * spd
    // lock the heading on the way OUT of idle — this is the last moment it looks at you
    if (e._dashT <= 0) { e._dashPhase = 'dash'; e._dashT += DASH_T; e._dashDirX = ux; e._dashDirY = uy }
  } else {
    const spd = e.speed * spdMul * DASH_SPEED_MUL
    vx = e._dashDirX * spd; vy = e._dashDirY * spd
    if (e._dashT <= 0) { e._dashPhase = 'idle'; e._dashT += DASH_IDLE_T }
  }
  e.x += vx * slowMul * dt
  e.y += vy * slowMul * dt
}

function stepLineCharge(e, tx, ty, dt, slowMul, spdMul) {
  if (e._chargeState === undefined) { e._chargeState = 'track'; e._chargeT = 0 }
  e._chargeT -= dt
  const dx = tx - e.x, dy = ty - e.y
  const d = Math.hypot(dx, dy) || 1
  const ux = dx / d, uy = dy / d
  let vx = 0, vy = 0
  if (e._chargeState === 'track') {
    const spd = e.speed * spdMul * LINE_CHARGE_TRACK_SPEED_MUL
    vx = ux * spd; vy = uy * spd
    if (d <= LINE_CHARGE_RANGE) { e._chargeState = 'lock'; e._chargeT = LINE_CHARGE_LOCK_T; e._chargeDirX = ux; e._chargeDirY = uy }
  } else if (e._chargeState === 'lock') {
    if (e._chargeT <= 0) { e._chargeState = 'charge'; e._chargeT = LINE_CHARGE_T }
  } else if (e._chargeState === 'charge') {
    const spd = e.speed * spdMul * LINE_CHARGE_SPEED_MUL
    vx = e._chargeDirX * spd; vy = e._chargeDirY * spd
    if (e._chargeT <= 0) { e._chargeState = 'stall'; e._chargeT = LINE_CHARGE_STALL_T }
  } else { // stall: spinning down, motionless
    if (e._chargeT <= 0) { e._chargeState = 'track'; e._chargeT = 0 }
  }
  e.x += vx * slowMul * dt
  e.y += vy * slowMul * dt
}

// strafe (v5.4 skies' fighter jets): bank -> run, on _strafeState/_strafeT/_strafeDirX/_strafeDirY.
// It never chases — it drifts out to a standoff point on a random bearing, locks onto you at the
// END of the bank, then flies a straight pass THROUGH you and well beyond. Damages the player only,
// via ordinary contact damage while it passes.
function stepStrafe(e, tx, ty, dt, slowMul, spdMul) {
  if (e._strafeState === undefined) { e._strafeState = 'bank'; e._strafeT = STRAFE_BANK_T; e._strafeBearing = Math.random() * Math.PI * 2 }
  e._strafeT -= dt
  if (e._strafeState === 'bank') {
    const px = tx + Math.cos(e._strafeBearing) * STRAFE_STANDOFF
    const py = ty + Math.sin(e._strafeBearing) * STRAFE_STANDOFF
    const dx = px - e.x, dy = py - e.y
    const d = Math.hypot(dx, dy)
    if (d > 1e-6) {
      const step = Math.min(d, e.speed * spdMul * STRAFE_BANK_SPEED_MUL * slowMul * dt)
      e.x += (dx / d) * step
      e.y += (dy / d) * step
    }
    if (e._strafeT <= 0) {
      const ax = tx - e.x, ay = ty - e.y
      const ad = Math.hypot(ax, ay) || 1
      e._strafeDirX = ax / ad; e._strafeDirY = ay / ad
      e._strafeState = 'run'; e._strafeT = STRAFE_RUN_T
    }
  } else {
    const spd = e.speed * spdMul * STRAFE_RUN_SPEED_MUL
    e.x += e._strafeDirX * spd * slowMul * dt
    e.y += e._strafeDirY * spd * slowMul * dt
    if (e._strafeT <= 0) { e._strafeState = 'bank'; e._strafeT = STRAFE_BANK_T; e._strafeBearing = Math.random() * Math.PI * 2 }
  }
}

// missileVolley (v5.4 skies' helicopters): holds MISSILE_STANDOFF (the diveBomb hover, deadzone and
// all) and shoots instead of closing. Firing state on _volleyT (s to the next volley) / _volleyLeft
// (missiles left in the current one) / _volleyGapT. Each shot is a run.enemyShots entry aimed at the
// player's CURRENT position — the only enemy-owned projectile in the game (see stepEnemyShots).
function stepMissileVolley(run, e, tx, ty, dt, slowMul, spdMul) {
  const dx = tx - e.x, dy = ty - e.y
  const d = Math.hypot(dx, dy) || 1
  const diff = d - MISSILE_STANDOFF
  if (Math.abs(diff) > MISSILE_DEADZONE) {
    const dir = diff > 0 ? 1 : -1
    const spd = e.speed * spdMul * MISSILE_HOVER_SPEED_MUL
    e.x += (dx / d) * dir * spd * slowMul * dt
    e.y += (dy / d) * dir * spd * slowMul * dt
  }

  if (e._volleyT === undefined) { e._volleyT = MISSILE_INTERVAL; e._volleyLeft = 0; e._volleyGapT = 0 }
  if (e._volleyLeft > 0) {
    e._volleyGapT -= dt
    if (e._volleyGapT <= 0) {
      e._volleyGapT += MISSILE_GAP
      e._volleyLeft -= 1
      fireEnemyMissile(run, e)
    }
  } else {
    e._volleyT -= dt
    if (e._volleyT <= 0) { e._volleyT += MISSILE_INTERVAL; e._volleyLeft = MISSILE_COUNT; e._volleyGapT = 0 }
  }
}

function fireEnemyMissile(run, e) {
  const p = run.player
  const angle = Math.atan2(p.y - e.y, p.x - e.x)
  run.enemyShots.push({
    x: e.x, y: e.y,
    vx: Math.cos(angle) * MISSILE_SPEED,
    vy: Math.sin(angle) * MISSILE_SPEED,
    r: MISSILE_R, dmg: MISSILE_DMG, life: MISSILE_LIFE, turnRate: MISSILE_TURN,
  })
}

// blink (v5.4 beyond's glitch blinkers): the blink IS its movement — it barely crawls between
// jumps. State on _blinkT (s to the next blink). A jump is clamped so it never lands closer than
// BLINK_MIN_DIST (no free contact hit) and never inside an obstacle: it retries the same heading at
// half distance, then gives up on this blink entirely rather than cheating through a wall.
function stepBlink(run, e, tx, ty, dt, slowMul, spdMul) {
  const dx = tx - e.x, dy = ty - e.y
  const d = Math.hypot(dx, dy)
  if (d > 1e-6 && slowMul > 0) {
    const spd = e.speed * spdMul * BLINK_CRAWL_SPEED_MUL
    e.x += (dx / d) * spd * slowMul * dt
    e.y += (dy / d) * spd * slowMul * dt
  }

  if (e._blinkT === undefined) e._blinkT = BLINK_INTERVAL
  e._blinkT -= dt
  if (e._blinkT > 0) return
  e._blinkT += BLINK_INTERVAL

  const ndx = tx - e.x, ndy = ty - e.y
  const nd = Math.hypot(ndx, ndy)
  if (nd <= BLINK_MIN_DIST) return // already close enough — nothing to close
  const ux = ndx / nd, uy = ndy / nd
  const tryJump = (want) => {
    const dist = Math.min(want, nd - BLINK_MIN_DIST) // clamp: never overshoot into the player's lap
    if (dist <= 0) return null
    const x = e.x + ux * dist, y = e.y + uy * dist
    return blockedByObstacle(run, x, y, e.radius) ? null : { x, y }
  }
  const spot = tryJump(BLINK_DIST) ?? tryJump(BLINK_DIST / 2)
  if (!spot) return
  run.events.push({ type: 'explode', x: e.x, y: e.y, radius: BLINK_FX_R })
  e.x = spot.x
  e.y = spot.y
  run.events.push({ type: 'explode', x: e.x, y: e.y, radius: BLINK_FX_R })
}

// Would a body of radius `r` centered at (x,y) overlap one of this chapter's obstacles? Only the
// blink teleport asks — every other mover is resolved by stepObstacles pushing it back out, which
// a teleport can't rely on (it would let a blinker pop through a root and get shoved out the far side).
function blockedByObstacle(run, x, y, r) {
  if (!run.obstacles || run.obstacles.length === 0) return false
  for (const o of run.obstacles) {
    const dx = x - o.x, dy = y - o.y
    const minSep = o.r + r
    if (dx * dx + dy * dy < minSep * minSep) return true
  }
  return false
}

// phase (v5.4 beyond's flickers): alternates solid <-> ghosted forever on _phaseSolid/_phaseT,
// starting solid with _phaseT randomised across PHASE_SOLID_T so a wave doesn't blink in unison.
function stepPhaseWindow(e, dt) {
  if (e._phaseSolid === undefined) { e._phaseSolid = true; e._phaseT = Math.random() * PHASE_SOLID_T }
  e._phaseT -= dt
  if (e._phaseT <= 0) {
    e._phaseSolid = !e._phaseSolid
    e._phaseT += e._phaseSolid ? PHASE_SOLID_T : PHASE_GHOST_T
  }
}

// -- flashlightCone (v5.4 undergrowth's exterminator elites) ----------------------------
// Sweeps a cone back and forth across FLASHLIGHT_SWEEP rad centered on the direction to the player
// (heading on e._coneAngle, which render reads; the sweep's own offset/direction are internal).
// Every OTHER enemy caught in the sector gets e.enrageT refreshed. Damages NOTHING — the cone hurts
// neither the player nor the enemies. It is pure buff + telegraph: the threat is what it turns the
// swarm into. A no-op unless a live elite carries the flag.
function stepFlashlightCones(run, dt) {
  const p = run.player
  for (const src of run.enemies) {
    if (src._dead || !src.elite || !src.flags || !src.flags.includes('flashlightCone')) continue

    src._coneDir = src._coneDir ?? 1
    src._coneOff = (src._coneOff ?? 0) + src._coneDir * FLASHLIGHT_SWEEP_SPEED * dt
    const halfSweep = FLASHLIGHT_SWEEP / 2
    if (src._coneOff > halfSweep) { src._coneOff = halfSweep; src._coneDir = -1 }
    else if (src._coneOff < -halfSweep) { src._coneOff = -halfSweep; src._coneDir = 1 }
    src._coneAngle = Math.atan2(p.y - src.y, p.x - src.x) + src._coneOff

    for (const e of run.enemies) {
      if (e === src || e._dead) continue
      const dx = e.x - src.x, dy = e.y - src.y
      if (dx * dx + dy * dy > FLASHLIGHT_RANGE * FLASHLIGHT_RANGE) continue
      const ea = Math.atan2(dy, dx)
      const da = Math.atan2(Math.sin(ea - src._coneAngle), Math.cos(ea - src._coneAngle)) // signed offset
      if (Math.abs(da) > FLASHLIGHT_ARC) continue
      e.enrageT = FLASHLIGHT_ENRAGE_T
    }
  }
}

// ---- Contact damage ---------------------------------------------------------------

// Shared player-hit resolution: contact damage and volatile-bomb blasts both apply
// armor + contactDmgTakenMul the same way, set invuln, push 'hurt', and handle death
// identically. dot (v5.0, see run.pools in state.js): pool DoT ticks skip armor/
// contactDmgTakenMul (like enemy ignite/venom skip enemy mitigation) and don't grant/require
// invuln — standing in a pool keeps ticking every STATUS_TICK regardless of the contact-damage
// invuln window. @returns true if the player died (phase now 'dead').
function hurtPlayer(run, rawDmg, dot = false) {
  const p = run.player
  const dmg = dot
    ? Math.max(1, Math.round(rawDmg))
    : Math.max(1, Math.round((rawDmg - run.passives.armor) * run.mods.contactDmgTakenMul))
  p.hp -= dmg
  if (!dot) p.invuln = PLAYER.invulnTime
  run.events.push({ type: 'hurt', dmg, dot })
  // v5.4 reaction mods: taking damage (contact OR zone — every path routes through here) fires a
  // free Quill Burst / Tail Swipe off the weapon timer, each on its own internal cooldown. No-ops
  // unless the weapon is equipped AND the mod is picked.
  tryQuillRetaliate(run)
  tryCounterSwipe(run)
  if (p.hp <= 0) {
    // Revive Token (v4.5, see CONSUMABLES.revive in config.js): consume one revive instead of
    // dying — restore hp, grant a longer invuln window, and radially shove every nearby enemy
    // off the player so they aren't instantly re-hit the next frame.
    if (run.revives > 0) {
      run.revives -= 1
      p.hp = p.maxHP * REVIVE_HP_FRAC
      p.invuln = REVIVE_INVULN
      const radSq = REVIVE_SHOVE_RADIUS * REVIVE_SHOVE_RADIUS
      for (const e of run.enemies) {
        const dx = e.x - p.x, dy = e.y - p.y
        const distSq = dx * dx + dy * dy
        if (distSq > radSq) continue
        const dist = Math.sqrt(distSq)
        const kdx = dist > 1e-6 ? dx / dist : 1
        const kdy = dist > 1e-6 ? dy / dist : 0
        // Flat magnitude (like the wave nova's knockback) rather than distance-scaled — every
        // enemy in the zone gets shoved equally hard, clearing space around the player reliably
        // regardless of exactly how close they'd wandered.
        e.kb.x += kdx * REVIVE_SHOVE_KB
        e.kb.y += kdy * REVIVE_SHOVE_KB
      }
      run.events.push({ type: 'revive', x: p.x, y: p.y })
      return false
    }
    run.phase = 'dead'
    run.events.push({ type: 'dead' })
    return true
  }
  return false
}

// v5.4: is this enemy untouchable right now? An owl overhead (AERIAL_UNTOUCHABLE, 'circle'/'climb')
// and a ghosted phase flicker take NO damage at all — dealDamage/applyDamage return before any
// number, status, crit or death is rolled, so a DoT already on them keeps counting down but lands
// nothing while the window is up. Guarded on the state fields, so an enemy that never ran either
// machine is never immune.
function damageImmune(e) {
  // Only while genuinely overhead at the standoff — 'circle'. NOT 'climb': a climbing owl is at
  // ground level, right where it just landed on you, and that is exactly when the player swings at
  // it. Gating the recovery too meant the bird dove, hit you, and peeled off invincible; the only
  // window it could actually be killed in was the 0.45s strike (it is touchable during 'mark', but
  // 'mark' happens out at AERIAL_RADIUS 240px, past every short-range weapon). So owls piled up
  // unkillable — reported as "they're unkillable" and "just too far away".
  if (AERIAL_UNTOUCHABLE && e._airState === 'circle') return true
  if (e._phaseSolid === false) return true
  return false
}

// v5.4: is this enemy harmless to touch right now? The mirror of damageImmune (an enemy that can't
// be hit can't hit you either), plus the phases and statuses that disarm an enemy without making it
// invulnerable: a landed cat and a stalled vacuum are punish windows, and a stunned or fleeing
// enemy isn't attacking anyone.
function contactHarmless(e) {
  if (damageImmune(e)) return true
  // ...but a climbing owl still can't HURT you. It's peeling away and its strike already had its
  // hit; charging the exit for a second one would just punish the player for standing their ground.
  // Deliberately asymmetric with damageImmune above: 'climb' is a PUNISH window — you can hit it,
  // it can't hit you — the same shape as pounce's 'land' and lineCharge's 'stall' on the next line.
  if (AERIAL_UNTOUCHABLE && e._airState === 'climb') return true
  if ((e.stunT || 0) > 0 || (e.fearT || 0) > 0) return true
  if (e._pounceState === 'land' || e._chargeState === 'stall') return true
  return false
}

/** @returns true if the player died this frame (phase set to 'dead'). */
function stepContactDamage(run) {
  const p = run.player
  for (const e of run.enemies) {
    if (e._dead || contactHarmless(e)) continue
    const dx = e.x - p.x, dy = e.y - p.y
    const rad = PLAYER.radius + e.radius
    if (dx * dx + dy * dy >= rad * rad) continue

    // latch flag (v5.0, e.g. body's antibody): applies a movement debuff then spends itself —
    // no normal contact damage, and unlike the plain path below, not gated behind p.invuln (the
    // antibody still latches on and dies even while the player is briefly invulnerable).
    if (e.flags && e.flags.includes('latch')) {
      p.slowT = LATCH_SLOW_T
      dealDamage(run, e, e.hp, false)
      continue
    }

    if (p.invuln > 0) return false
    // enrage (v5.4, flashlightCone elites): a lit-up enemy hits harder, not just faster.
    const dmg = (e.enrageT || 0) > 0 ? e.dmg * FLASHLIGHT_DMG_MUL : e.dmg
    return hurtPlayer(run, dmg) // one hit per frame; invuln now active either way
  }
  return false
}

// -- Pools: acidPool/soapTrail elite flags (v5.0) -------------------------------------
// Shared array + step for both flags (see run.pools in state.js) — pools only ever damage the
// PLAYER, ticked at STATUS_TICK cadence like other DoTs (see applyIgnite/applyVenomStack below).
// @returns true if the player died this frame (phase set to 'dead').
function stepPools(run, dt) {
  if (!run.pools || run.pools.length === 0) return false
  const p = run.player
  let playerDied = false
  for (const pool of run.pools) {
    pool.t -= dt
    if (pool.t <= 0) continue
    const dx = p.x - pool.x, dy = p.y - pool.y
    if (dx * dx + dy * dy > pool.r * pool.r) continue
    pool._tickAcc = (pool._tickAcc ?? 0) + dt
    while (pool._tickAcc >= STATUS_TICK) {
      pool._tickAcc -= STATUS_TICK
      if (!playerDied && hurtPlayer(run, pool.dps * STATUS_TICK, true)) playerDied = true
    }
  }
  run.pools = run.pools.filter((pl) => pl.t > 0)
  return playerDied
}

// -- Currents signature mechanic (v5.0, e.g. pond) ------------------------------------
// Smooth vector flow field from 2 summed sine pairs per axis, phase-offset by run._driftSeed
// (see createRun in state.js) so no two runs drift identically. Displaces player AND enemy
// POSITIONS directly each frame (drift, not a stored velocity/control loss) — gated entirely on
// the run's chapter having a 'currents' signature (config.js CHAPTERS[id].signature); a no-op
// otherwise (e.g. body).
// Pure query: the drift-field force (px/s) at WORLD position (x,y) for this run, exactly what
// stepCurrents applies. Zero vector when the run's chapter has no 'currents' signature. Exported
// so render.js can visualize the REAL field (not an approximation). Reads run.time internally so
// the field animates in lockstep with the sim.
export function currentForce(run, x, y) {
  const sig = CHAPTERS[run.chapter].signature
  if (!sig || sig.type !== 'currents') return { fx: 0, fy: 0 }
  const seed = run._driftSeed ?? 0
  const t = run.time
  const fx = Math.sin(x * sig.scale + t * sig.drift + seed) +
             Math.sin(y * sig.scale * 1.3 - t * sig.drift * 0.7 + seed * 1.7)
  const fy = Math.cos(y * sig.scale + t * sig.drift * 0.9 + seed * 2.3) +
             Math.cos(x * sig.scale * 1.6 - t * sig.drift * 1.2 + seed * 0.6)
  return { fx: fx * sig.strength * 0.5, fy: fy * sig.strength * 0.5 }
}

function stepCurrents(run, dt) {
  const sig = CHAPTERS[run.chapter].signature
  if (!sig || sig.type !== 'currents') return
  const p = run.player
  const pf = currentForce(run, p.x, p.y)
  p.x += pf.fx * dt
  p.y += pf.fy * dt
  for (const e of run.enemies) {
    if (e._dead) continue
    const ef = currentForce(run, e.x, e.y)
    e.x += ef.fx * dt
    e.y += ef.fy * dt
  }
}

// -- Obstacles (v5.0; streamed v5.6.13) ------------------------------------------------
// Circular colliders (run.obstacles) push the player and every enemy out of overlap;
// projectiles are never affected (not checked here or anywhere bullets/novas/etc. move).
// A no-op when the chapter has none (e.g. body).
//
// The field STREAMS with the player. The old createRun origin field left the whole world beyond
// OBSTACLE_FIELD_RADIUS obstacle-free — the player reported "obstacles are only in the beginning
// zone". Now the world is a grid of OBSTACLE_CELL cells; each cell rolls at most one obstacle from
// a pure hash of (cell, run._obstacleSeed), so:
//   - a cell's obstacle is THE SAME every time you visit it (walk away and back, same rock);
//   - no RNG stream is consumed at step time (adding a draw would shift every seeded test after
//     it — the AA.c/runStarOnly incident, twice);
//   - the chapter config's `count` keeps its old meaning (expected obstacles within the old
//     origin field) via count -> per-cell probability, so the density is unchanged;
//   - cfg.minDist still keeps a clear ring around the RUN ORIGIN (the spawn), not the player —
//     streamed cells materialize at OBSTACLE_STREAM_RADIUS, beyond any screen edge, so nothing
//     ever pops in on top of the player (or visibly at all).
// Cells only re-scan when the player crosses a cell boundary; obstacles past OBSTACLE_DROP_RADIUS
// are dropped (hysteresis, so pacing the same boundary doesn't churn). run._obstacleRev bumps on
// any change — render's syncObstacles rebuilds only on that. _obstacleSeed null = streaming off
// (body, and tests that blank the field).
function obstacleCellHash(i, j, seed, salt) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + seed + Math.imul(salt, 974634923)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function streamObstacles(run) {
  if (run._obstacleSeed == null) return
  const cfg = CHAPTERS[run.chapter].obstacles
  if (!cfg) return
  const p = run.player
  const cs = OBSTACLE_CELL
  const ci = Math.floor(p.x / cs), cj = Math.floor(p.y / cs)
  if (ci === run._obCellI && cj === run._obCellJ) return // same cell as last scan — field unchanged
  run._obCellI = ci; run._obCellJ = cj

  let changed = false
  for (let k = run.obstacles.length - 1; k >= 0; k--) {
    const o = run.obstacles[k]
    if (Math.hypot(o.x - p.x, o.y - p.y) > OBSTACLE_DROP_RADIUS) { run.obstacles.splice(k, 1); changed = true }
  }
  const live = new Set()
  for (const o of run.obstacles) live.add(o._cell)

  // count over the old origin field's area -> per-cell probability (density preserved)
  const prob = cfg.count * cs * cs / (Math.PI * OBSTACLE_FIELD_RADIUS * OBSTACLE_FIELD_RADIUS)
  const seed = run._obstacleSeed
  const span = Math.ceil(OBSTACLE_STREAM_RADIUS / cs)
  for (let i = ci - span; i <= ci + span; i++) {
    for (let j = cj - span; j <= cj + span; j++) {
      const key = i + ',' + j
      if (live.has(key)) continue
      if (obstacleCellHash(i, j, seed, 0) >= prob) continue
      const r = cfg.minR + obstacleCellHash(i, j, seed, 1) * (cfg.maxR - cfg.minR)
      // jitter inside the cell, pulled in by the radius so neighbours can't overlap
      const slack = Math.max(0, cs / 2 - r - 20)
      const x = (i + 0.5) * cs + (obstacleCellHash(i, j, seed, 2) - 0.5) * 2 * slack
      const y = (j + 0.5) * cs + (obstacleCellHash(i, j, seed, 3) - 0.5) * 2 * slack
      if (Math.hypot(x, y) < cfg.minDist) continue                      // spawn ring stays clear
      if (Math.hypot(x - p.x, y - p.y) > OBSTACLE_STREAM_RADIUS) continue
      run.obstacles.push({ x, y, r, _cell: key })
      changed = true
    }
  }
  if (changed) run._obstacleRev = (run._obstacleRev || 0) + 1
}

function stepObstacles(run) {
  if (!run.obstacles || run.obstacles.length === 0) return
  const p = run.player
  for (const o of run.obstacles) {
    const dx = p.x - o.x, dy = p.y - o.y
    const d = Math.hypot(dx, dy)
    const minSep = o.r + PLAYER.radius
    if (d < minSep) {
      const nx = d > 1e-6 ? dx / d : 1
      const ny = d > 1e-6 ? dy / d : 0
      p.x = o.x + nx * minSep
      p.y = o.y + ny * minSep
    }
  }
  for (const e of run.enemies) {
    if (e._dead) continue
    if (e._phaseSolid === false) continue // v5.4: a ghosted phase flicker passes straight through
    for (const o of run.obstacles) {
      const dx = e.x - o.x, dy = e.y - o.y
      const d = Math.hypot(dx, dy)
      const minSep = o.r + e.radius
      if (d < minSep) {
        const nx = d > 1e-6 ? dx / d : 1
        const ny = d > 1e-6 ? dy / d : 0
        e.x = o.x + nx * minSep
        e.y = o.y + ny * minSep
      }
    }
  }
}

// -- Pheromone trails (v5.3 garden signature) -----------------------------------------
// Fading nodes dropped by dying trailFollow ants (dealDamage) that living ants accelerate along
// (stepEnemyMovement). No damage, no player interaction — just age out. A no-op unless nodes exist.
function stepTrails(run, dt) {
  if (!run.trails || run.trails.length === 0) return
  for (const tr of run.trails) tr.t -= dt
  run.trails = run.trails.filter((tr) => tr.t > 0)
}

// -- Spider web slow-zones (v5.3 garden) ----------------------------------------------
// Patches dropped by webZone spiders (stepEnemyMovement) that slow the PLAYER while standing in
// them (stepPlayerMovement). No damage — just age out. A no-op unless patches exist.
function stepWebs(run, dt) {
  if (!run.webs || run.webs.length === 0) return
  for (const web of run.webs) web.t -= dt
  run.webs = run.webs.filter((web) => web.t > 0)
}

// -- Pesticide spray strips (v5.3 garden's sprayStrip elites) --------------------------
// Telegraphed rectangles marked on the player (stepEnemyMovement). Each strip counts down its
// `fuse` (telegraph, no damage) first, then goes live and ticks dot-flagged damage to the PLAYER
// standing inside the rotated rectangle for `t` seconds (like run.pools). Removed once spent.
// @returns true if the player died this frame (phase set to 'dead').
function stepStrips(run, dt) {
  if (!run.strips || run.strips.length === 0) return false
  const p = run.player
  let playerDied = false
  for (const s of run.strips) {
    if (s.fuse > 0) { s.fuse -= dt; continue } // telegraph phase — no damage yet
    s.t -= dt
    if (s.t <= 0) continue
    // Point-in-rotated-rectangle: project the player offset onto the strip's axis (along) and its
    // perpendicular (perp); inside iff within half the length/width on each.
    const dx = p.x - s.x, dy = p.y - s.y
    const c = Math.cos(s.angle), sn = Math.sin(s.angle)
    const along = dx * c + dy * sn
    const perp = -dx * sn + dy * c
    if (Math.abs(along) > s.len / 2 || Math.abs(perp) > s.w / 2) continue
    s._tickAcc = (s._tickAcc ?? 0) + dt
    while (s._tickAcc >= STATUS_TICK) {
      s._tickAcc -= STATUS_TICK
      if (!playerDied && hurtPlayer(run, s.dps * STATUS_TICK, true)) playerDied = true
    }
  }
  run.strips = run.strips.filter((s) => s.fuse > 0 || s.t > 0)
  return playerDied
}

// -- Predators signature mechanic (v5.4, e.g. undergrowth) ----------------------------
// Snap traps (run.traps, seeded once at createRun — see state.js). Permanent field furniture: they
// never expire, they only spring and re-arm. An ARMED trap containing the center of the player OR
// of any enemy snaps on THAT ONE entity for SNAP_TRAP_DMG and goes on cooldown.
// It damages BOTH sides, and that IS the mechanic: the trap field is only a hazard until you learn
// to kite the swarm across it. Gated on the chapter's 'predators' signature so a trap array in a
// future chapter could mean something else.
// @returns true if the player died this frame (phase set to 'dead').
function stepTraps(run, dt) {
  if (!run.traps || run.traps.length === 0) return false
  const sig = CHAPTERS[run.chapter].signature
  if (!sig || sig.type !== 'predators') return false
  const p = run.player
  let playerDied = false

  for (const tr of run.traps) {
    if (!tr.armed) {
      tr.cd -= dt
      if (tr.cd <= 0) { tr.armed = true; tr.cd = 0 }
      continue
    }
    const rSq = tr.r * tr.r
    // The player trips it first when they're standing in it — but an invulnerable player walks over
    // a trap without springing it (it would otherwise be spent for free, on nothing).
    if (p.invuln <= 0) {
      const dx = p.x - tr.x, dy = p.y - tr.y
      if (dx * dx + dy * dy <= rSq) {
        springTrap(run, tr)
        if (!playerDied && hurtPlayer(run, SNAP_TRAP_DMG)) playerDied = true
        continue
      }
    }
    for (const e of run.enemies) {
      if (e._dead) continue
      const dx = e.x - tr.x, dy = e.y - tr.y
      if (dx * dx + dy * dy > rSq) continue
      springTrap(run, tr)
      dealDamage(run, e, SNAP_TRAP_DMG, false)
      break // one entity per snap
    }
  }
  return playerDied
}

function springTrap(run, tr) {
  tr.armed = false
  tr.cd = SNAP_TRAP_REARM
  run.events.push({ type: 'explode', x: tr.x, y: tr.y, radius: tr.r })
}

// -- Traffic signature mechanic (v5.4, e.g. city) --------------------------------------
// Lanes (run.lanes, see state.js): while fewer than signature.lanes are alive, a new one is rolled
// every TRAFFIC_INTERVAL seconds — a band at a random angle, offset perpendicular from the player by
// up to ±TRAFFIC_OFFSET so it always CROSSES them but can never be dropped unavoidably on top of
// them. 'warn' telegraphs it harmlessly, then 'sweep' runs a vehicle down it that flattens BOTH
// sides. A no-op unless the chapter's signature is 'traffic'.
// @returns true if the player died this frame (phase set to 'dead').
function stepLanes(run, dt) {
  const sig = CHAPTERS[run.chapter].signature
  if (!sig || sig.type !== 'traffic') return false
  const p = run.player

  run._laneAcc = (run._laneAcc ?? TRAFFIC_INTERVAL) - dt
  if (run._laneAcc <= 0) {
    run._laneAcc += TRAFFIC_INTERVAL
    if (run.lanes.length < sig.lanes) {
      const angle = Math.random() * Math.PI * 2
      const off = (Math.random() * 2 - 1) * TRAFFIC_OFFSET
      run.lanes.push({
        x: p.x - Math.sin(angle) * off, y: p.y + Math.cos(angle) * off, // perpendicular offset
        angle, len: TRAFFIC_LEN, w: TRAFFIC_W,
        phase: 'warn', t: TRAFFIC_WARN, carT: 0,
        dmg: TRAFFIC_DMG, // snapshotted so a mid-run retune can't desync a live lane
        hitIds: new Set(),
      })
    }
  }

  let playerDied = false
  for (const lane of run.lanes) {
    lane.t -= dt
    if (lane.phase === 'warn') {
      if (lane.t <= 0) { lane.phase = 'sweep'; lane.t = TRAFFIC_SWEEP; lane.carT = 0 }
      continue // telegraph: nothing is damaged
    }
    lane.carT = Math.min(1, Math.max(0, 1 - lane.t / TRAFFIC_SWEEP))
    const cos = Math.cos(lane.angle), sin = Math.sin(lane.angle)
    const cx = lane.x + cos * (lane.carT - 0.5) * lane.len
    const cy = lane.y + sin * (lane.carT - 0.5) * lane.len

    // The vehicle's hitbox: a TRAFFIC_CAR_LEN × TRAFFIC_CAR_W box on (cx, cy), aligned to the lane.
    const inCar = (x, y, pad) => {
      const dx = x - cx, dy = y - cy
      const along = dx * cos + dy * sin
      const perp = -dx * sin + dy * cos
      return Math.abs(along) <= TRAFFIC_CAR_LEN / 2 + pad && Math.abs(perp) <= TRAFFIC_CAR_W / 2 + pad
    }

    if (!playerDied && p.invuln <= 0 && inCar(p.x, p.y, 0)) {
      // invuln makes "once per pass" implicit for the player, the way contact damage does.
      if (hurtPlayer(run, lane.dmg)) playerDied = true
    }
    for (const e of run.enemies) {
      if (e._dead || lane.hitIds.has(e.id)) continue
      if (!inCar(e.x, e.y, e.radius)) continue
      lane.hitIds.add(e.id) // one hit per enemy per pass
      // v5.6.14 (user): cars ONE-SHOT the light roster — a non-elite pigeon/drone dies outright
      // under a car (dealt its remaining hp, so drops/death flow normally). Elites and everything
      // not in TRAFFIC_SQUASH take the ordinary TRAFFIC_DMG.
      const squash = !e.elite && TRAFFIC_SQUASH.includes(e.rosterId)
      dealDamage(run, e, squash ? e.hp : lane.dmg, false)
      e.kb.x += cos * TRAFFIC_KB
      e.kb.y += sin * TRAFFIC_KB
    }
    if (lane.t <= 0) lane._done = true
  }
  run.lanes = run.lanes.filter((lane) => !lane._done)
  return playerDied
}

// -- Bombardment signature mechanic (v5.4, e.g. skies) ---------------------------------
// Area denial, independent of the artillery-flagged roster: this is the sky itself shelling you.
// Every signature.rate seconds it pushes BOMBARDMENT_COUNT run.bombs entries around the player —
// the EXISTING volatile-bomb array, so it inherits the telegraph -> explode contract AND the fact
// that a blast damages the player and the enemies standing in it alike. A no-op elsewhere.
function stepBombardment(run, dt) {
  const sig = CHAPTERS[run.chapter].signature
  if (!sig || sig.type !== 'bombardment') return
  run._bombardAcc = (run._bombardAcc ?? sig.rate) - dt
  if (run._bombardAcc > 0) return
  run._bombardAcc += sig.rate
  const p = run.player
  for (let i = 0; i < BOMBARDMENT_COUNT; i++) {
    const a = Math.random() * Math.PI * 2
    const d = Math.random() * BOMBARDMENT_SPREAD
    run.bombs.push({
      x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d,
      radius: BOMBARDMENT_RADIUS, fuse: BOMBARDMENT_FUSE, duration: BOMBARDMENT_FUSE,
      dmg: BOMBARDMENT_DMG,
    })
  }
}

// -- Gravity signature mechanic (v5.4, e.g. beyond) ------------------------------------
// Wells (run.wells, seeded once at createRun — see state.js) BEND every projectile in flight, the
// player's (run.bullets/homingShots/lobs) and the enemies' (run.enemyShots) alike, and touch nothing
// else: bodies, beams, orbitals and zones are not projectiles. They damage nothing — they only curve.
// The whole mechanic is CURVATURE, not chaos: each well adds g × (1 - dist/r) px/s² toward its
// center, and the projectile's speed is then renormalised back to exactly what it was, so a well
// steers a shot without ever making it faster or slower.
function stepGravityWells(run, dt) {
  if (!run.wells || run.wells.length === 0) return
  const sig = CHAPTERS[run.chapter].signature
  if (!sig || sig.type !== 'gravity') return

  for (const list of [run.bullets, run.homingShots, run.enemyShots]) {
    if (!list) continue
    for (const pr of list) bendProjectile(run, pr, dt)
  }
  if (run.lobs) for (const lo of run.lobs) bendLob(run, lo, dt)
}

// The field's acceleration at (x, y), summed over every well in range. { ax, ay } px/s².
function wellForce(run, x, y) {
  let ax = 0, ay = 0
  for (const w of run.wells) {
    const dx = w.x - x, dy = w.y - y
    const d = Math.hypot(dx, dy)
    if (d <= 1e-6 || d > w.r) continue
    const a = w.g * (1 - d / w.r) // full strength at the center, linearly to 0 at the rim
    ax += (dx / d) * a
    ay += (dy / d) * a
  }
  return { ax, ay }
}

function bendProjectile(run, pr, dt) {
  const speed = Math.hypot(pr.vx, pr.vy)
  if (speed <= 1e-6) return
  const { ax, ay } = wellForce(run, pr.x, pr.y)
  if (ax === 0 && ay === 0) return
  const vx = pr.vx + ax * dt
  const vy = pr.vy + ay * dt
  const mag = Math.hypot(vx, vy)
  if (mag <= 1e-6) return
  pr.vx = (vx / mag) * speed // renormalise: curvature, not acceleration
  pr.vy = (vy / mag) * speed
}

// A lob has no velocity to bend — its position is a t/flight lerp onto a fixed landing point (see
// run.lobs in state.js). So a well bends its LANDING POINT instead, by exactly the displacement the
// same acceleration would have produced over this frame (a·dt²). Its flight TIME is untouched,
// which is the lob's analogue of the speed preservation above: a well curves where the chunk comes
// down, never how long it hangs.
function bendLob(run, lo, dt) {
  const { ax, ay } = wellForce(run, lo.x, lo.y)
  if (ax === 0 && ay === 0) return
  lo.tx += ax * dt * dt
  lo.ty += ay * dt * dt
}

// -- Enemy missiles (v5.4, skies' missileVolley helicopters) ---------------------------
// run.enemyShots is the ONLY enemy-owned projectile array (see state.js). Each shot homes at
// turnRate rad/s (slow — outrunning them is the counterplay), fizzles silently at life <= 0, and on
// touching the player damages the PLAYER only and pops. It never damages enemies; it IS bent by the
// beyond's gravity wells like any other projectile.
// @returns true if the player died this frame (phase set to 'dead').
function stepEnemyShots(run, dt) {
  if (!run.enemyShots || run.enemyShots.length === 0) return false
  const p = run.player
  let playerDied = false

  for (const s of run.enemyShots) {
    s.life -= dt
    if (s.life <= 0) { s._done = true; continue } // fizzles: removed, no blast

    const speed = Math.hypot(s.vx, s.vy) || 1
    const desired = Math.atan2(p.y - s.y, p.x - s.x)
    const cur = Math.atan2(s.vy, s.vx)
    const diff = Math.atan2(Math.sin(desired - cur), Math.cos(desired - cur))
    const maxTurn = s.turnRate * dt
    const angle = cur + Math.max(-maxTurn, Math.min(maxTurn, diff))
    s.vx = Math.cos(angle) * speed
    s.vy = Math.sin(angle) * speed
    s.x += s.vx * dt
    s.y += s.vy * dt

    const dx = p.x - s.x, dy = p.y - s.y
    const rad = s.r + PLAYER.radius
    if (dx * dx + dy * dy > rad * rad) continue
    s._done = true
    run.events.push({ type: 'explode', x: s.x, y: s.y, radius: MISSILE_BLAST })
    if (!playerDied && p.invuln <= 0 && hurtPlayer(run, s.dmg)) playerDied = true
  }
  run.enemyShots = run.enemyShots.filter((s) => !s._done)
  return playerDied
}

// -- pullBeam (v5.4, beyond's UFO elites) ----------------------------------------------
// An abduction beam on _beamState ('idle'|'beam') / _beamT: every PULL_BEAM_INTERVAL it opens for
// PULL_BEAM_T seconds, dragging a player within PULL_BEAM_RANGE toward the UFO at PULL_BEAM_FORCE
// px/s and ticking PULL_BEAM_DPS at the run.pools cadence. The force is deliberately under
// PLAYER.baseSpeed, so you can always walk out — you just can't ignore it. (The UFO holds still
// while beaming; that half lives in stepEnemyMovement.)
// Contract deviation: the drag is applied here rather than inside stepPlayerMovement — same
// "after their own input" ordering (this runs later in the frame), but it reads the UFO's CURRENT
// position instead of last frame's, and it can end the run cleanly like every other DoT step.
// @returns true if the player died this frame (phase set to 'dead').
function stepPullBeams(run, dt) {
  const p = run.player
  let playerDied = false
  for (const e of run.enemies) {
    if (e._dead || !e.elite || !e.flags || !e.flags.includes('pullBeam')) continue

    if (e._beamState === undefined) { e._beamState = 'idle'; e._beamT = PULL_BEAM_INTERVAL }
    e._beamT -= dt
    if (e._beamT <= 0) {
      if (e._beamState === 'idle') { e._beamState = 'beam'; e._beamT += PULL_BEAM_T }
      else { e._beamState = 'idle'; e._beamT += PULL_BEAM_INTERVAL }
    }
    if (e._beamState !== 'beam') continue

    const dx = e.x - p.x, dy = e.y - p.y
    const d = Math.hypot(dx, dy)
    if (d > PULL_BEAM_RANGE || d <= 1e-6) continue
    p.x += (dx / d) * PULL_BEAM_FORCE * dt
    p.y += (dy / d) * PULL_BEAM_FORCE * dt

    e._beamAcc = (e._beamAcc ?? 0) + dt
    while (e._beamAcc >= STATUS_TICK) {
      e._beamAcc -= STATUS_TICK
      if (!playerDied && hurtPlayer(run, PULL_BEAM_DPS * STATUS_TICK, true)) playerDied = true
    }
  }
  return playerDied
}

// -- Volatile-elite death bombs (v4.0) ------------------------------------------------

/** @returns true if the player died this frame (phase set to 'dead'). */
function stepBombs(run, dt) {
  const p = run.player
  let playerDied = false
  for (const b of run.bombs) {
    b.fuse -= dt
    if (b.fuse > 0) continue

    if (!playerDied && p.invuln <= 0) {
      const dx = p.x - b.x, dy = p.y - b.y
      if (dx * dx + dy * dy <= b.radius * b.radius && hurtPlayer(run, b.dmg)) playerDied = true
    }

    const radSq = b.radius * b.radius
    for (const e of run.enemies) {
      if (e._dead) continue
      const dx = e.x - b.x, dy = e.y - b.y
      if (dx * dx + dy * dy <= radSq) dealDamage(run, e, b.dmg, false)
    }

    run.events.push({ type: 'explode', x: b.x, y: b.y, radius: b.radius })
    b._dead = true
  }
  run.bombs = run.bombs.filter((b) => !b._dead)
  return playerDied
}

// ---- Damage application (shared by all weapons) -----------------------------------

// Shared tail: apply a final (already-multiplied) damage number to an enemy, push the
// 'hit' event, and handle death/xp/coin drops. Used by applyDamage after it rolls the
// player's multipliers/crit, and directly by effects (like star blasts) that derive
// their damage from an already-rolled hit and shouldn't re-roll crit/multipliers.
function dealDamage(run, enemy, dmg, crit, dot = false) {
  // Untouchable windows (v5.4): an owl overhead / a ghosted flicker eats nothing at all — no
  // number, no flash, no status, no death. Checked before everything else, including DoT ticks.
  if (damageImmune(enemy)) return
  // Shielded (elite affix): while above SHIELD_HP_FRAC of maxHP, the shield absorbs part
  // of every hit. Checked before venom amp per spec (shield softens the raw hit first).
  if (enemy.elite && enemy.affixes && enemy.affixes.includes('shielded') && enemy.hp > enemy.maxHP * SHIELD_HP_FRAC) {
    dmg *= SHIELD_DMG_MUL
  }
  // Venom: amplifies ALL damage the enemy takes; Brittle (cold+venom) doubles the amp
  // while the enemy is chilled/frozen.
  if (enemy.venom > 0) {
    let amp = enemy.venom * VENOM_AMP_PER_STACK
    if (enemy.chill > 0 || enemy.frozen > 0) amp *= COMBOS.brittleAmpMul
    dmg *= (1 + amp)
  }
  // panicRout (v5.4 chitterShriek mod): a FLEEING enemy takes amplified damage from EVERY source —
  // applied here alongside the venom amp, so DoT ticks and combo bursts get it too.
  if ((enemy.fearT || 0) > 0) {
    const rout = run.weaponMods.chitterShriek?.panicRout ?? 0
    if (rout > 0) dmg *= (1 + rout)
  }
  dmg = Math.round(dmg)

  enemy.hp -= dmg
  // DoT ticks don't white-flash: with ignite/venom up they fire every STATUS_TICK and
  // the enemy would strobe white permanently
  if (!dot) enemy.hitFlash = 0.12
  run.events.push({ type: 'hit', x: enemy.x, y: enemy.y, dmg, crit, dot })

  if (enemy.hp <= 0 && !enemy._dead) {
    enemy._dead = true
    run.kills++
    run.events.push({ type: 'kill', x: enemy.x, y: enemy.y, elite: enemy.elite, etype: enemy.type })

    const xp = enemy.xp * (enemy.elite ? ELITE.xpMul : 1)
    run.gems.push({ x: enemy.x, y: enemy.y, xp })

    if (enemy.elite) {
      const gilded = enemy.affixes && enemy.affixes.includes('gilded')
      const coinCount = gilded ? Math.round(ELITE.coins * GILDED_COIN_MUL) : ELITE.coins
      for (let i = 0; i < coinCount; i++) {
        const a = Math.random() * Math.PI * 2
        const d = Math.random() * 20
        run.coins.push({ x: enemy.x + Math.cos(a) * d, y: enemy.y + Math.sin(a) * d, value: 1 })
      }
    } else if (Math.random() < ENEMIES[enemy.type].coinChance) {
      run.coins.push({ x: enemy.x, y: enemy.y, value: 1 })
    }

    // Splitter (elite affix): spawns SPLITTER_COUNT wisps around the corpse.
    if (enemy.elite && enemy.affixes && enemy.affixes.includes('splitter')) {
      for (let i = 0; i < SPLITTER_COUNT; i++) {
        const a = Math.random() * Math.PI * 2
        const d = Math.random() * 20
        spawnEnemy(run, { type: 'wisp', x: enemy.x + Math.cos(a) * d, y: enemy.y + Math.sin(a) * d, forceNormal: true })
      }
    }
    // Volatile (elite affix): a timed bomb goes off where the enemy died (see stepBombs).
    if (enemy.elite && enemy.affixes && enemy.affixes.includes('volatile')) {
      run.bombs.push({ x: enemy.x, y: enemy.y, radius: VOLATILE_RADIUS, fuse: VOLATILE_FUSE, duration: VOLATILE_FUSE, dmg: VOLATILE_DMG })
    }
    // split flag (v5.0, e.g. pond's amoeba): generalized version of the splitter affix above —
    // spawns SPLIT_CHILD_COUNT smaller clones of THIS enemy (not fresh wisps). Guarded by
    // `!enemy._splitChild` so a spawned child's own death never re-splits.
    if (enemy.flags && enemy.flags.includes('split') && !enemy._splitChild) {
      spawnSplitChildren(run, enemy, SPLIT_CHILD_COUNT)
    }
    // acidPool elite flag (v5.0, e.g. body's pill elites): leaves a damaging pool where the
    // elite died (see run.pools in state.js / stepPools above).
    if (enemy.elite && enemy.flags && enemy.flags.includes('acidPool')) {
      run.pools.push({ x: enemy.x, y: enemy.y, r: ACID_R, t: ACID_DUR, dps: ACID_DPS })
    }
    // trailFollow flag (v5.3 garden's ants): a dying ant drops a fading pheromone node that other
    // ants follow & accelerate on (see run.trails / stepEnemyMovement). Gated on the chapter's
    // 'pheromones' signature so an ant roster in a non-pheromone chapter simply wouldn't lay trails.
    if (enemy.flags && enemy.flags.includes('trailFollow') && CHAPTERS[run.chapter].signature?.type === 'pheromones') {
      run.trails.push({ x: enemy.x, y: enemy.y, t: PHEROMONE_LIFE })
    }
  }
}

/** @returns the final applied damage number (post multiplier/crit), for effects like star blast. */
function applyDamage(run, enemy, baseDmg) {
  if (damageImmune(enemy)) return 0 // v5.4 untouchable window: no crit roll, no elements either
  const p = run.player
  let dmg = baseDmg * p.damageMul * (1 + run.passives.damage) * run.mods.playerDmgMul
  let crit = false
  if (Math.random() < p.critChance + run.passives.critChance) {
    dmg *= (p.critDamage + run.passives.critDamage)
    crit = true
  }
  dmg = Math.round(dmg)
  dealDamage(run, enemy, dmg, crit)
  if (!enemy._dead) applyElements(run, enemy, dmg)
  return dmg
}

// ---- Elemental status + combos (see ELEMENTS/COMBOS in config.js) -----------------------
// Applied once per real weapon hit (from applyDamage), using that hit's final dealt damage
// as the basis for ignite/shock potency. DoT ticks and combo bursts deal their damage via
// dealDamage directly (not applyDamage) so they don't re-roll crit/player multipliers or
// recursively re-trigger elemental application.

function comboReady(enemy, name) {
  return (enemy._comboCd[name] || 0) <= 0
}

function triggerCombo(enemy, name) {
  enemy._comboCd[name] = COMBOS.comboCd
}

function applyIgnite(enemy, potency, dmgDealt) {
  enemy.ignite = IGNITE_DURATION
  enemy.igniteDps = (IGNITE_DOT_FRAC * potency * dmgDealt) / IGNITE_DURATION
}

// Shared by the primary hit and Frost Arc's arc targets.
function applyChill(enemy, potency) {
  const wasChilling = enemy.chill > 0 && enemy.frozen <= 0
  const slow = Math.min(CHILL_SLOW_CAP, CHILL_SLOW_BASE + CHILL_SLOW_PER_POTENCY * potency)
  enemy.chill = CHILL_DURATION
  if (enemy.frozen > 0) return // already frozen; window refreshed, no restacking needed

  if (enemy._freezeImmuneT > 0) {
    enemy.chillSlow = slow
    enemy._chillStack = 0
    return
  }

  enemy._chillStack = wasChilling ? enemy._chillStack + 1 : 1
  if (enemy._chillStack >= CHILL_STACK_TO_FREEZE) {
    enemy._chillStack = 0
    if (enemy.elite || enemy.type === 'tank') {
      // Elites/tanks never freeze — a stronger slow instead.
      enemy.chillSlow = Math.min(1, slow * ELITE_FREEZE_SLOW_MUL)
    } else {
      enemy.chillSlow = slow
      enemy.frozen = FREEZE_DURATION
    }
  } else {
    enemy.chillSlow = slow
  }
}

// Shared by the primary hit and Conduct's arc targets.
function applyVenomStack(enemy, stacks = 1) {
  enemy.venom = Math.min(VENOM_MAX_STACKS, enemy.venom + stacks)
  enemy.venomT = VENOM_DURATION
}

// fire+cold Shatter: fire landing on a chilled/frozen enemy (or cold landing on an ignited
// one) bursts AoE damage in COMBOS.shatterRadius, consuming the chill/freeze.
function triggerShatter(run, enemy, dmgDealt) {
  triggerCombo(enemy, 'shatter')
  const dmg = Math.round(dmgDealt * COMBOS.shatterMul)
  const radSq = COMBOS.shatterRadius * COMBOS.shatterRadius
  for (const e of run.enemies) {
    if (e._dead) continue
    const dx = e.x - enemy.x, dy = e.y - enemy.y
    if (dx * dx + dy * dy <= radSq) dealDamage(run, e, dmg, false)
  }
  enemy.chill = 0
  enemy.frozen = 0
  enemy.chillSlow = 0
  enemy._chillStack = 0
  run.events.push({ type: 'shatter', x: enemy.x, y: enemy.y, radius: COMBOS.shatterRadius })
}

// fire+lightning Overload: a shock arc landing on an ignited enemy detonates its remaining
// ignite damage instantly as an AoE burst in COMBOS.overloadRadius, consuming the ignite.
function triggerOverload(run, enemy) {
  triggerCombo(enemy, 'overload')
  const remaining = Math.round(enemy.igniteDps * enemy.ignite)
  enemy.ignite = 0
  enemy.igniteDps = 0
  if (remaining > 0) {
    const radSq = COMBOS.overloadRadius * COMBOS.overloadRadius
    for (const e of run.enemies) {
      if (e._dead) continue
      const dx = e.x - enemy.x, dy = e.y - enemy.y
      if (dx * dx + dy * dy <= radSq) dealDamage(run, e, remaining, false)
    }
  }
  run.events.push({ type: 'overload', x: enemy.x, y: enemy.y, radius: COMBOS.overloadRadius })
}

// Shock (lightning): arcs a share of this hit's dealt damage to nearby enemies, and carries
// Overload/Frost Arc/Conduct depending on the source enemy's/targets' current status.
function applyShock(run, enemy, potency, dmgDealt) {
  if (enemy._shockCd > 0) return // per-source cooldown so continuous weapons don't spam arcs
  const rangeSq = SHOCK_RANGE * SHOCK_RANGE
  const nearby = []
  for (const e of run.enemies) {
    if (e === enemy || e._dead) continue
    const dx = e.x - enemy.x, dy = e.y - enemy.y
    const dSq = dx * dx + dy * dy
    if (dSq <= rangeSq) nearby.push({ e, dSq })
  }
  const maxTargets = run.elementPicks.lightning ?? 0
  if (nearby.length === 0 || maxTargets <= 0) return
  enemy._shockCd = SHOCK_CD

  nearby.sort((a, b) => a.dSq - b.dSq)
  const targets = nearby.slice(0, maxTargets).map((n) => n.e)

  const arcDmg = Math.round(SHOCK_ARC_FRAC * potency * dmgDealt)
  const sourceChilled = enemy.chill > 0 || enemy.frozen > 0
  const sourceVenomStacks = enemy.venom

  const frostPoints = []
  const conductPoints = []
  for (const t of targets) {
    if (arcDmg > 0) dealDamage(run, t, arcDmg, false)

    if (t.ignite > 0 && comboReady(t, 'overload')) triggerOverload(run, t)

    if (sourceChilled && comboReady(enemy, 'frostarc')) {
      applyChill(t, potency)
      frostPoints.push([t.x, t.y])
    }
    if (sourceVenomStacks > 0 && comboReady(enemy, 'conduct')) {
      applyVenomStack(t, sourceVenomStacks)
      conductPoints.push([t.x, t.y])
    }
  }
  // Exactly one arc-visual event per shock: frostarc/conduct already carry the arc's shape
  // (source + every target) when their combo fires, so only fall back to the plain shockarc
  // visual when neither combo triggered this hit — otherwise the arc would double-render.
  if (frostPoints.length > 0) {
    triggerCombo(enemy, 'frostarc')
    run.events.push({ type: 'frostarc', points: [[enemy.x, enemy.y], ...frostPoints] })
  } else if (conductPoints.length > 0) {
    triggerCombo(enemy, 'conduct')
    run.events.push({ type: 'conduct', points: [[enemy.x, enemy.y], ...conductPoints] })
  } else {
    run.events.push({ type: 'shockarc', points: [[enemy.x, enemy.y], ...targets.map((t) => [t.x, t.y])] })
  }
}

// Entry point called by applyDamage after every real weapon hit lands.
function applyElements(run, enemy, dmgDealt) {
  const pot = run.elements
  const preChill = enemy.chill > 0 || enemy.frozen > 0
  const preIgnite = enemy.ignite > 0

  // fire+cold Shatter: both directions, but only one burst per hit.
  if (pot.fire > 0 && preChill && comboReady(enemy, 'shatter')) {
    triggerShatter(run, enemy, dmgDealt)
  } else if (pot.cold > 0 && preIgnite && comboReady(enemy, 'shatter')) {
    triggerShatter(run, enemy, dmgDealt)
  }

  if (pot.fire > 0) applyIgnite(enemy, pot.fire, dmgDealt)
  if (pot.cold > 0) applyChill(enemy, pot.cold)
  if (pot.venom > 0) applyVenomStack(enemy)
  if (pot.lightning > 0) applyShock(run, enemy, pot.lightning, dmgDealt)
}

// Ticks ignite/venom DoTs (fire+venom Acid Burn speeds both up together), decays chill/freeze
// and their windows/cooldowns. Chill/freeze's movement effect lives in stepEnemyMovement.
function stepStatuses(run, dt) {
  const potVenom = run.elements.venom
  for (const e of run.enemies) {
    if (e._dead) continue

    for (const k of Object.keys(e._comboCd)) e._comboCd[k] = Math.max(0, e._comboCd[k] - dt)
    if (e._shockCd > 0) e._shockCd = Math.max(0, e._shockCd - dt)

    const acidBurn = e.ignite > 0 && e.venom > 0 // fire+venom: both DoTs tick faster together
    const tickMul = acidBurn ? COMBOS.acidBurnTickMul : 1

    if (e.ignite > 0) {
      e.ignite = Math.max(0, e.ignite - dt)
      e._igniteAcc = (e._igniteAcc || 0) + dt * tickMul
      while (!e._dead && e._igniteAcc >= STATUS_TICK) {
        e._igniteAcc -= STATUS_TICK
        dealDamage(run, e, e.igniteDps * STATUS_TICK, false, true)
      }
      if (e.ignite <= 0) { e.igniteDps = 0; e._igniteAcc = 0 }
    }

    if (e.venom > 0) {
      e.venomT = Math.max(0, e.venomT - dt)
      e._venomAcc = (e._venomAcc || 0) + dt * tickMul
      const perSecond = VENOM_DOT_PER_STACK * potVenom * e.venom
      while (!e._dead && e._venomAcc >= STATUS_TICK) {
        e._venomAcc -= STATUS_TICK
        dealDamage(run, e, perSecond * STATUS_TICK, false, true)
      }
      if (e.venomT <= 0) { e.venom = 0; e._venomAcc = 0 }
    }

    // Bleed (v5.0, flagella's barbed mod): a plain dot-flagged DoT, same tick shape as ignite —
    // no combo interactions, no element potency, just BARBED_DURATION seconds of bleedDps.
    if (e.bleed > 0) {
      e.bleed = Math.max(0, e.bleed - dt)
      e._bleedAcc = (e._bleedAcc || 0) + dt
      while (!e._dead && e._bleedAcc >= STATUS_TICK) {
        e._bleedAcc -= STATUS_TICK
        dealDamage(run, e, e.bleedDps * STATUS_TICK, false, true)
      }
      if (e.bleed <= 0) { e.bleedDps = 0; e._bleedAcc = 0 }
    }

    if (e.chill > 0) {
      e.chill = Math.max(0, e.chill - dt)
      if (e.chill <= 0) { e.chillSlow = 0; e._chillStack = 0 }
    }

    if (e.frozen > 0) {
      e.frozen = Math.max(0, e.frozen - dt)
      if (e.frozen <= 0) e._freezeImmuneT = FREEZE_IMMUNITY
    }
    if (e._freezeImmuneT > 0) e._freezeImmuneT = Math.max(0, e._freezeImmuneT - dt)
  }
}

// Nearest enemy within (viewRadius + pad), or null. Shared by weapons that target on fire.
function nearestEnemy(run, pad = 100) {
  const p = run.player
  const rangeSq = (run.viewRadius + pad) ** 2
  let target = null
  let bestSq = Infinity
  for (const e of run.enemies) {
    const dx = e.x - p.x, dy = e.y - p.y
    const dSq = dx * dx + dy * dy
    if (dSq <= rangeSq && dSq < bestSq) { bestSq = dSq; target = e }
  }
  return target
}

// ---- Weapons ------------------------------------------------------------------------

// Maps each weapon's plain STAT mods (flat/pct, folded straight into a `levels[]` field) onto
// the field they bump. Behavioral mods (twinRing/echo/cluster/phantom/singularity/prismatic,
// the star six, and bigOrbs/bigBlade — which scale a constant, not a `levels[]` field) are NOT
// listed here; they're read directly off run.weaponMods.<weapon>.<mod> at their trigger site
// (see WEAPON_MODS's doc comment in config.js for the full behavioral-mod list).
const WEAPON_STAT_MODS = {
  orbit:     { extraOrb: ['orbs', 'flat'], wideRing: ['radius', 'pct'], overdrive: ['rotSpeed', 'pct'] },
  wave:      { bigWave: ['radius', 'pct'], shove: ['knockback', 'pct'], amplitude: ['dmg', 'pct'] },
  boomerang: { extraRang: ['count', 'flat'], longThrow: ['range', 'pct'], heavyBlade: ['dmg', 'pct'] },
  mines:     { minefield: ['maxAlive', 'flat'], bigBoom: ['radius', 'pct'], heavyCharge: ['dmg', 'pct'] },
  homing:    { extraWisp: ['count', 'flat'], longLife: ['life', 'pct'], agile: ['turnRate', 'pct'] },
  hole:      { biggerHole: ['radius', 'pct'], lasting: ['duration', 'pct'], denser: ['pull', 'pct'] },
  rainbow:   { wideBeam: ['width', 'pct'], longBeam: ['length', 'pct'], sustain: ['duration', 'pct'] },
  // v5.0 pond natives: frenzy/quickCast (attack-speed mods) are NOT here — folding them into the
  // `rate` field would SLOW the weapon (rate is the interval); they divide the interval at the
  // fire site instead (see stepFlagellaWeapon/stepBloomWeapon), like the global fire rate.
  flagella:  { reach: ['range', 'pct'], wideArc: ['arc', 'pct'], heavyLash: ['dmg', 'pct'] },
  bloom:     { bigBloom: ['maxR', 'pct'], lasting: ['dur', 'pct'], virulent: ['dmgPerTick', 'pct'] },
  // v5.3 garden natives: rapid/fastLure (attack rate) and longNeedles (range AND speed)/bigBurst
  // (burst dmg AND radius) are NOT here — they'd need to divide `rate` or touch two fields, so
  // they're read at the fire/plant/burst site instead (see stepStingerWeapon/stepLureWeapon).
  stinger:   { sharper: ['dmg', 'pct'], volley: ['count', 'flat'] },
  lure:      { widerTaunt: ['aggro', 'pct'], longerLure: ['dur', 'pct'] },
  // v5.4 natives. Same two exclusions as above, applied uniformly: every attack-RATE mod
  // (quickPaws/rapidQuills/rapidShriek/rapidGeyser/rapidRoar/quickTail/rapidToss/rapidShard/
  // rapidFold) divides the interval at its fire site rather than folding into `rate` — folding it
  // in would SLOW the weapon — and so does every mod that has to touch two fields at once
  // (longQuills = range AND speed, longToss = castRange at the throw site). The rest is plain stat
  // folding.
  clawRake:      { rend: ['dmg', 'pct'], wideRake: ['arc', 'pct'], longClaws: ['range', 'pct'] },
  quillBurst:    { sharpQuills: ['dmg', 'pct'], moreQuills: ['count', 'flat'], piercingQuills: ['pierce', 'flat'] },
  chitterShriek: { terror: ['fear', 'pct'], shockwave: ['radius', 'pct'], shrill: ['dmg', 'pct'] },
  trashTornado:  { heavyTrash: ['dmg', 'pct'], wideTornado: ['radius', 'pct'], fasterSpin: ['rotSpeed', 'pct'], moreTrash: ['chunks', 'flat'] },
  sewerGeyser:   { pressure: ['dmg', 'pct'], wideGeyser: ['r', 'pct'], moreGeysers: ['count', 'flat'] },
  roar:          { bellow: ['dmg', 'pct'], wideRoar: ['arc', 'pct'], farRoar: ['range', 'pct'] },
  tailSwipe:     { heavyTail: ['dmg', 'pct'], longTail: ['range', 'pct'], broadSweep: ['arc', 'pct'] },
  debrisToss:    { heavyDebris: ['dmg', 'pct'], bigImpact: ['r', 'pct'], moreDebris: ['count', 'flat'] },
  realityShard:  { keenShard: ['dmg', 'pct'], moreShards: ['count', 'flat'], pierceShard: ['pierce', 'flat'] },
  tesseractBeam: { wideFold: ['width', 'pct'], longFold: ['length', 'pct'], sustainFold: ['duration', 'pct'] },
}

/** Copies WEAPONS[w.id]'s current-level stats and folds in that weapon's accumulated STAT mods
 * (see WEAPON_STAT_MODS above). Behavioral mods are untouched here — callers read those
 * directly off run.weaponMods.<weapon>.<mod> at their own trigger site. */
function effectiveWeaponStats(run, w) {
  const stats = { ...WEAPONS[w.id].levels[w.level - 1] }
  const modMap = WEAPON_STAT_MODS[w.id]
  const mods = run.weaponMods[w.id]
  if (modMap && mods) {
    for (const [modId, [field, kind]] of Object.entries(modMap)) {
      const bonus = mods[modId] ?? 0
      if (bonus === 0) continue
      stats[field] = kind === 'flat' ? Math.round(stats[field] + bonus) : stats[field] * (1 + bonus)
    }
  }
  return stats
}

function stepWeapons(run, dt) {
  const p = run.player
  run.orbs = []
  run.debris = [] // rewritten every frame by the Trash Tornado, exactly like run.orbs
  const fireRateMul = p.fireRateMul * (1 + run.passives.fireRate)

  for (const w of run.weapons) {
    const stats = effectiveWeaponStats(run, w)
    if (w.id === 'star') stepStarWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'wave') stepWaveWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'orbit') stepOrbitWeapon(run, stats, fireRateMul)
    else if (w.id === 'boomerang') stepBoomerangWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'mines') stepMinesWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'homing') stepHomingWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'hole') stepHoleWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'rainbow') stepBeamWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'flagella') stepFlagellaWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'bloom') stepBloomWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'stinger') stepStingerWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'lure') stepLureWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'clawRake') stepClawRake(run, w, stats, fireRateMul, dt)
    else if (w.id === 'quillBurst') stepQuillWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'chitterShriek') stepShriekWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'trashTornado') stepTornadoWeapon(run, stats, fireRateMul, dt)
    else if (w.id === 'sewerGeyser') stepGeyserWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'roar') stepRoarWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'tailSwipe') stepTailWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'debrisToss') stepDebrisWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'realityShard') stepShardWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'tesseractBeam') stepTesseractWeapon(run, w, stats, fireRateMul, dt)
  }

  stepBullets(run, dt)
  stepNovas(run, dt)
  stepBoomerangs(run, dt)
  stepMines(run, dt)
  stepHomingShots(run, dt)
  stepHoles(run, dt)
  stepBeams(run, dt)
  stepBlooms(run, dt)
  stepLures(run, dt)
  stepClawSlashes(run, dt)
  stepGeysers(run, dt)
  stepLobs(run, dt)

  if (run.enemies.some((e) => e._dead)) run.enemies = run.enemies.filter((e) => !e._dead)
}

// Shared interval countdown with catch-up: fires as often as needed to absorb
// a long dt (tab-back), carrying the remainder in run.weaponTimers[id].
function fireOnTimer(run, id, interval, dt, fire) {
  let timer = run.weaponTimers[id]
  if (timer === undefined) timer = interval
  timer -= dt
  while (timer <= 0) {
    fire()
    timer += interval
  }
  run.weaponTimers[id] = timer
}

function stepStarWeapon(run, w, stats, fireRateMul, dt) {
  fireOnTimer(run, w.id, stats.interval / fireRateMul, dt, () => fireStar(run, stats))
}

function fireStar(run, stats) {
  const p = run.player
  const target = nearestEnemy(run)

  const baseAngle = target
    ? Math.atan2(target.y - p.y, target.x - p.x)
    : (p.facing >= 0 ? 0 : Math.PI)

  // Multi Stars: more volleys widen the fan gracefully for free, since each extra star is
  // just another STAR_FAN-spaced slot in the same (count-1)/2-centered spread below.
  const count = stats.count + (run.weaponMods.star?.multishot ?? 0)
  const pierce = stats.pierce + (run.weaponMods.star?.pierce ?? 0)
  const chainsLeft = run.weaponMods.star?.chain ?? 0
  const ricochetsLeft = run.weaponMods.star?.ricochet ?? 0
  for (let i = 0; i < count; i++) {
    const angle = baseAngle + (i - (count - 1) / 2) * STAR_FAN
    run.bullets.push({
      x: p.x, y: p.y,
      vx: Math.cos(angle) * stats.speed,
      vy: Math.sin(angle) * stats.speed,
      dmg: stats.dmg,
      pierce,
      life: STAR_LIFE,
      r: STAR_R,
      speed: stats.speed, // kept so chain/ricochet redirects preserve the original travel speed
      hitIds: new Set(),
      _shard: false,
      _splitDone: false,
      _chainsLeft: chainsLeft,
      _ricochetsLeft: ricochetsLeft,
    })
  }
  run.events.push({ type: 'shoot', weapon: 'star' })
}

// Split Stars: actual shard count = run.weaponMods.star.split + 1 (0 picks = no split; see
// WEAPON_MODS doc in config.js). Shards are plain bullets flagged _shard so they never re-split, but they
// still carry a fresh chain/ricochet budget off run.weaponMods.star, same as any other bullet.
function splitCountFor(run) {
  const picks = run.weaponMods.star?.split ?? 0
  return picks > 0 ? picks + 1 : 0
}

function spawnSplitShards(run, b, hitEnemy, shardCount) {
  const baseAngle = Math.atan2(b.vy, b.vx)
  const spreadTotal = shardCount <= 2 ? STAR_SPLIT_BASE_ANGLE * 2 : STAR_SPLIT_MAX_SPREAD
  const chainsLeft = run.weaponMods.star?.chain ?? 0
  const ricochetsLeft = run.weaponMods.star?.ricochet ?? 0
  const shardDmg = b.dmg * STAR_SPLIT_DMG_FRAC
  for (let i = 0; i < shardCount; i++) {
    const offset = shardCount > 1 ? -spreadTotal / 2 + i * (spreadTotal / (shardCount - 1)) : 0
    const angle = baseAngle + offset
    run.bullets.push({
      x: hitEnemy.x, y: hitEnemy.y,
      vx: Math.cos(angle) * b.speed,
      vy: Math.sin(angle) * b.speed,
      dmg: shardDmg,
      pierce: 1, // shards die on their first hit unless chain/ricochet picks keep them alive
      life: STAR_LIFE,
      r: STAR_R,
      speed: b.speed,
      hitIds: new Set([hitEnemy.id]), // don't let a shard immediately re-hit the enemy it spawned from
      _shard: true,
      _splitDone: true,
      _chainsLeft: chainsLeft,
      _ricochetsLeft: ricochetsLeft,
    })
  }
}

// Chain Stars: when a bullet's pierce is exhausted, re-target the nearest not-yet-hit enemy
// within STAR_CHAIN_RANGE of the last hit and keep flying (damage decays per jump).
// @returns true if the bullet was redirected (caller should not also try ricochet).
function tryChainBullet(run, b, fromEnemy) {
  const rangeSq = STAR_CHAIN_RANGE * STAR_CHAIN_RANGE
  let target = null
  let bestSq = Infinity
  for (const e of run.enemies) {
    if (e._dead || b.hitIds.has(e.id)) continue
    const dx = e.x - fromEnemy.x, dy = e.y - fromEnemy.y
    const dSq = dx * dx + dy * dy
    if (dSq <= rangeSq && dSq < bestSq) { bestSq = dSq; target = e }
  }
  if (!target) return false

  b._chainsLeft--
  const dx = target.x - fromEnemy.x, dy = target.y - fromEnemy.y
  const d = Math.hypot(dx, dy) || 1
  b.x = fromEnemy.x
  b.y = fromEnemy.y
  b.vx = (dx / d) * b.speed
  b.vy = (dy / d) * b.speed
  b.dmg *= STAR_CHAIN_DMG_MUL
  b.pierce = 1
  b.life = Math.max(b.life, STAR_CHAIN_EXTRA_LIFE)
  run._chains = (run._chains ?? 0) + 1
  return true
}

// Ricochet Stars: once a spent bullet has no chain jumps left (or none targetable), bounce it
// off in a random new direction instead of letting it die.
function tryRicochetBullet(run, b) {
  b._ricochetsLeft--
  const curAngle = Math.atan2(b.vy, b.vx)
  const sign = Math.random() < 0.5 ? -1 : 1
  const turn = sign * (STAR_RICOCHET_ANGLE_MIN + Math.random() * (STAR_RICOCHET_ANGLE_MAX - STAR_RICOCHET_ANGLE_MIN))
  const newAngle = curAngle + turn
  b.vx = Math.cos(newAngle) * b.speed
  b.vy = Math.sin(newAngle) * b.speed
  b.dmg *= STAR_RICOCHET_DMG_MUL
  b.pierce = 1
  b.hitIds.clear() // allow re-hits after bouncing away; bounce count itself caps any loop
  b.life = Math.max(b.life, STAR_RICOCHET_EXTRA_LIFE)
  run._ricochets = (run._ricochets ?? 0) + 1
}

function stepBullets(run, dt) {
  const bullets = run.bullets
  const splitCount = splitCountFor(run)
  for (const b of bullets) {
    b.x += b.vx * dt
    b.y += b.vy * dt
    b.life -= dt
    // Reality Shard: every blinkEvery seconds a shard SKIPS blinkDist px along its current heading
    // (post any gravity-well curvature), passing over the gap without touching it.
    if (b.weapon === 'shard' && b.life > 0) stepShardBlink(run, b, dt)
    if (b.life <= 0) {
      // recursion: a shard that ran out of LIFE (not one whose pierce was spent) forks. Checked
      // here, on the frame the life expires, so it fires exactly once before the filter drops it.
      if (b.weapon === 'shard' && b.pierce > 0 && !b._fork) tryShardRecursion(run, b)
      continue
    }
    if (b.pierce <= 0) continue

    let justHit = null
    for (const e of run.enemies) {
      if (b.pierce <= 0) break
      if (e._dead || b.hitIds.has(e.id)) continue
      const dx = e.x - b.x, dy = e.y - b.y
      const rad = b.r + e.radius
      if (dx * dx + dy * dy <= rad * rad) {
        applyDamage(run, e, b.dmg)
        // Venom Tips (v5.3 stinger's venomTips mod, snapshotted as b._venomTips at fire time):
        // a needle injects 1 venom stack WITHOUT needing the venom element card — reuses the
        // element system's applyVenomStack (its DoT scales with venom potency, but the stacks
        // still amplify all damage the enemy takes even at zero potency; see dealDamage/stepStatuses).
        if (b._venomTips && !e._dead) applyVenomStack(e, 1)
        b.hitIds.add(e.id)
        b.pierce--
        justHit = e
        // Split Stars: only the original star splits, and only on its first hit ever.
        if (!b._shard && !b._splitDone && splitCount > 0) {
          b._splitDone = true
          spawnSplitShards(run, b, e, splitCount)
        }
      }
    }

    // Resolution order once a bullet is spent this frame: chain re-target first, ricochet
    // bounce only if chain isn't available/found a target.
    if (justHit && b.pierce <= 0) {
      if (!(b._chainsLeft > 0 && tryChainBullet(run, b, justHit)) && b._ricochetsLeft > 0) {
        tryRicochetBullet(run, b)
      }
    }
  }
  run.bullets = bullets.filter((b) => b.life > 0 && b.pierce > 0)
}

// Supernova Sparks: when an orb hit KILLS an enemy, splash bonus × that hit's dealt damage to
// everything else within ORBIT_NOVA_RADIUS of the kill spot (dealDamage, no re-roll) + explode.
function orbitSupernova(run, deadEnemy, dealtDmg, bonus) {
  const dmg = Math.round(dealtDmg * bonus)
  if (dmg <= 0) return
  const radSq = ORBIT_NOVA_RADIUS * ORBIT_NOVA_RADIUS
  for (const e of run.enemies) {
    if (e._dead || e.id === deadEnemy.id) continue
    const dx = e.x - deadEnemy.x, dy = e.y - deadEnemy.y
    if (dx * dx + dy * dy <= radSq) dealDamage(run, e, dmg, false)
  }
  run.events.push({ type: 'explode', x: deadEnemy.x, y: deadEnemy.y, radius: ORBIT_NOVA_RADIUS })
}

// Shared by the main ring and the Twin Ring inner ring: damages the nearest not-on-cooldown
// enemy touching an orb at (ox, oy), same dmg/tick logic for both rings.
function hitOrbitAt(run, ox, oy, orbR, stats, fireRateMul, supernovaBonus) {
  for (const e of run.enemies) {
    if (e._dead || e.orbCd > 0) continue
    const dx = e.x - ox, dy = e.y - oy
    const rad = orbR + e.radius
    if (dx * dx + dy * dy <= rad * rad) {
      const dealt = applyDamage(run, e, stats.dmg)
      e.orbCd = stats.tick / fireRateMul
      if (supernovaBonus > 0 && e._dead) orbitSupernova(run, e, dealt, supernovaBonus)
    }
  }
}

function stepOrbitWeapon(run, stats, fireRateMul) {
  const p = run.player
  const mods = run.weaponMods.orbit
  const orbR = ORB_R * (1 + (mods?.bigOrbs ?? 0)) // bigOrbs scales ORB_R, a constant, not a levels[] field
  const supernovaBonus = mods?.supernova ?? 0

  for (let i = 0; i < stats.orbs; i++) {
    const angle = (i / stats.orbs) * Math.PI * 2 + run.time * stats.rotSpeed
    const ox = p.x + Math.cos(angle) * stats.radius
    const oy = p.y + Math.sin(angle) * stats.radius
    run.orbs.push({ x: ox, y: oy, r: orbR })
    hitOrbitAt(run, ox, oy, orbR, stats, fireRateMul, supernovaBonus)
  }

  // Twin Ring: N orbs on an inner, counter-rotating ring (negative angular velocity), same
  // dmg/tick as the main ring.
  const twinRing = mods?.twinRing ?? 0
  if (twinRing > 0) {
    const innerRadius = stats.radius * ORBIT_TWIN_RING_RADIUS_FRAC
    for (let i = 0; i < twinRing; i++) {
      const angle = (i / twinRing) * Math.PI * 2 - run.time * stats.rotSpeed
      const ox = p.x + Math.cos(angle) * innerRadius
      const oy = p.y + Math.sin(angle) * innerRadius
      run.orbs.push({ x: ox, y: oy, r: orbR })
      hitOrbitAt(run, ox, oy, orbR, stats, fireRateMul, supernovaBonus)
    }
  }
}

// fear (v5.4, the Chitter Shriek's whole point): seconds of flee applied to every enemy the ring
// touches. 0 (the wave's novas, and every other caller) means the ring only damages and shoves.
function spawnNova(run, x, y, maxR, dmg, knockback, fear = 0) {
  run.novas.push({ x, y, r: 0, maxR, dmg, knockback, fear, life: NOVA_LIFE, hit: new Set() })
}

function stepWaveWeapon(run, w, stats, fireRateMul, dt) {
  const p = run.player
  const echoCount = run.weaponMods.wave?.echo ?? 0
  const undertowStacks = run.weaponMods.wave?.undertow ?? 0
  const tsunamiBonus = run.weaponMods.wave?.tsunami ?? 0
  fireOnTimer(run, w.id, stats.interval / fireRateMul, dt, () => {
    run._waveCasts = (run._waveCasts ?? 0) + 1
    // Tsunami: every TSUNAMI_EVERY-th cast is a "monster wave" — radius AND damage multiplied.
    const isTsunami = tsunamiBonus > 0 && run._waveCasts % TSUNAMI_EVERY === 0
    const radius = isTsunami ? stats.radius * (1 + tsunamiBonus) : stats.radius
    const dmg = isTsunami ? stats.dmg * (1 + tsunamiBonus) : stats.dmg
    // Undertow: bake the inverted (pulling) + amplified knockback into the nova at cast time, so
    // mid-run picks don't retroactively change already-live waves (see spawnNova/stepNovas).
    const knockback = undertowStacks > 0
      ? -stats.knockback * (1 + UNDERTOW_KB_PER_STACK * undertowStacks)
      : stats.knockback
    spawnNova(run, p.x, p.y, radius, dmg, knockback)
    run.events.push({ type: 'shoot', weapon: 'wave' })
    // Echo Wave: queue N delayed re-casts at the same spot, each WAVE_ECHO_DELAY later than the
    // previous, at WAVE_ECHO_DMG_FRAC damage (full radius/knockback, already tsunami/undertow-adjusted).
    for (let i = 1; i <= echoCount; i++) {
      run._waveEchoes.push({
        delay: WAVE_ECHO_DELAY * i, x: p.x, y: p.y,
        radius, dmg: dmg * WAVE_ECHO_DMG_FRAC, knockback,
      })
    }
  })
  stepWaveEchoes(run, dt)
}

// Ticks down pending Echo Wave casts (run._waveEchoes) and spawns their nova once each one's
// delay elapses.
function stepWaveEchoes(run, dt) {
  const echoes = run._waveEchoes
  for (const ec of echoes) {
    ec.delay -= dt
    if (ec.delay <= 0) {
      spawnNova(run, ec.x, ec.y, ec.radius, ec.dmg, ec.knockback)
      ec._done = true
    }
  }
  run._waveEchoes = echoes.filter((e) => !e._done)
}

function stepNovas(run, dt) {
  const novas = run.novas
  for (const n of novas) {
    n.life -= dt
    if (n.life <= 0) continue

    const progress = Math.min(1, Math.max(0, 1 - n.life / NOVA_LIFE))
    n.r = n.maxR * progress

    for (const e of run.enemies) {
      if (e._dead || n.hit.has(e.id)) continue
      const dx = e.x - n.x, dy = e.y - n.y
      const dist = Math.hypot(dx, dy)
      if (dist <= n.r + e.radius) {
        applyDamage(run, e, n.dmg)
        n.hit.add(e.id)
        // Chitter Shriek: the ring panics what it hits (see FEAR_SPEED_MUL / stepEnemyMovement).
        if ((n.fear ?? 0) > 0) e.fearT = Math.max(e.fearT || 0, n.fear)
        // Anchored (elite affix): still takes the damage above, just never gets knocked back.
        if (!(e.affixes && e.affixes.includes('anchored'))) {
          const kdx = dist > 1e-6 ? dx / dist : 1
          const kdy = dist > 1e-6 ? dy / dist : 0
          e.kb.x += kdx * n.knockback
          e.kb.y += kdy * n.knockback
        }
      }
    }
  }
  run.novas = novas.filter((n) => n.life > 0)
}

// -- Boomerang --------------------------------------------------------------------

function stepBoomerangWeapon(run, w, stats, fireRateMul, dt) {
  fireOnTimer(run, w.id, stats.interval / fireRateMul, dt, () => fireBoomerang(run, stats))
}

function fireBoomerang(run, stats) {
  const p = run.player
  const target = nearestEnemy(run)
  const baseAngle = target
    ? Math.atan2(target.y - p.y, target.x - p.x)
    : (p.facing >= 0 ? 0 : Math.PI)

  const count = stats.count
  const step = count > 1 ? (2 * BOOMERANG_FAN) / (count - 1) : 0
  // bigBlade scales BOOMERANG_HIT_R, a constant, not a levels[] field — read directly and
  // snapshotted per boomerang at throw time, like bigOrbs is for orbit.
  const hitR = BOOMERANG_HIT_R * (1 + (run.weaponMods.boomerang?.bigBlade ?? 0))
  // Backhand/Seeker: also snapshotted per boomerang at throw time (same reasoning as Undertow —
  // mid-run picks shouldn't retroactively change blades already in flight).
  const backhandMul = 1 + (run.weaponMods.boomerang?.backhand ?? 0)
  const seekerTurnRate = SEEKER_TURN_RATE * (run.weaponMods.boomerang?.seeker ?? 0)
  for (let i = 0; i < count; i++) {
    const angle = count > 1 ? baseAngle - BOOMERANG_FAN + i * step : baseAngle
    run.boomerangs.push({
      x: p.x, y: p.y, ox: p.x, oy: p.y,
      angle, phase: 'out',
      dmg: stats.dmg, hit: new Set(),
      speed: stats.speed, range: stats.range, hitR,
      backhandMul, seekerTurnRate,
    })
  }
  run.events.push({ type: 'shoot', weapon: 'boomerang' })
}

// Seeker Blades: steer an outbound ('out' phase only) boomerang's travel angle toward the
// nearest enemy, same clamped-turn approach as homing wisps.
function steerSeekerBoomerang(run, b, dt) {
  let target = null
  let bestSq = Infinity
  for (const e of run.enemies) {
    if (e._dead) continue
    const dx = e.x - b.x, dy = e.y - b.y
    const dSq = dx * dx + dy * dy
    if (dSq < bestSq) { bestSq = dSq; target = e }
  }
  if (!target) return
  const desired = Math.atan2(target.y - b.y, target.x - b.x)
  const diff = Math.atan2(Math.sin(desired - b.angle), Math.cos(desired - b.angle))
  const maxTurn = b.seekerTurnRate * dt
  b.angle += Math.max(-maxTurn, Math.min(maxTurn, diff))
}

function stepBoomerangs(run, dt) {
  const p = run.player
  for (const b of run.boomerangs) {
    if (b.phase === 'out') {
      if (b.seekerTurnRate > 0) steerSeekerBoomerang(run, b, dt)
      b.x += Math.cos(b.angle) * b.speed * dt
      b.y += Math.sin(b.angle) * b.speed * dt
      const traveled = Math.hypot(b.x - b.ox, b.y - b.oy)
      if (traveled >= b.range) { b.phase = 'back'; b.hit.clear() }
    } else {
      const dx = p.x - b.x, dy = p.y - b.y
      const d = Math.hypot(dx, dy)
      if (d > 1e-6) {
        b.x += (dx / d) * b.speed * dt
        b.y += (dy / d) * b.speed * dt
      }
      if (d < BOOMERANG_RETURN_R) b._done = true
    }

    for (const e of run.enemies) {
      if (e._dead || b.hit.has(e.id)) continue
      const dx = e.x - b.x, dy = e.y - b.y
      const rad = b.hitR + e.radius
      if (dx * dx + dy * dy <= rad * rad) {
        // Backhand: bonus damage while returning ('back' phase only).
        const dmg = b.phase === 'back' ? b.dmg * b.backhandMul : b.dmg
        applyDamage(run, e, dmg)
        b.hit.add(e.id)
      }
    }
  }
  run.boomerangs = run.boomerangs.filter((b) => !b._done)
}

// -- Mines --------------------------------------------------------------------------

function stepMinesWeapon(run, w, stats, fireRateMul, dt) {
  fireOnTimer(run, w.id, stats.interval / fireRateMul, dt, () => {
    // maxAlive only gates the weapon's own deployment — Cluster Bombs bomblets (m.small) don't
    // count against it and can push the total mine count above maxAlive.
    const deployed = run.mines.reduce((n, m) => n + (m.small ? 0 : 1), 0)
    if (deployed >= stats.maxAlive) return
    const p = run.player
    run.mines.push({
      x: p.x - p.facing * 20, y: p.y,
      arm: 0.4, dmg: stats.dmg, radius: stats.radius,
    })
  })
}

// Cluster Bombs: N bomblets flung outward when a (non-bomblet) mine pops, at
// MINE_CLUSTER_DMG_FRAC damage / MINE_CLUSTER_RADIUS_FRAC radius, scattered
// MINE_CLUSTER_SCATTER_MIN..MAX px away with a short MINE_CLUSTER_ARM fuse. Bomblets are
// flagged `small: true` and never cluster further (guarded by the caller).
function spawnClusterMines(run, parent, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const d = MINE_CLUSTER_SCATTER_MIN + Math.random() * (MINE_CLUSTER_SCATTER_MAX - MINE_CLUSTER_SCATTER_MIN)
    run.mines.push({
      x: parent.x + Math.cos(a) * d, y: parent.y + Math.sin(a) * d,
      arm: MINE_CLUSTER_ARM,
      dmg: parent.dmg * MINE_CLUSTER_DMG_FRAC,
      radius: parent.radius * MINE_CLUSTER_RADIUS_FRAC,
      small: true,
    })
  }
}

// Magnetic Mines: an armed (arm <= 0, not yet triggered) mine crawls toward the nearest enemy.
function stepMagneticMines(run, dt, bonus) {
  const speed = MINE_CRAWL_SPEED * bonus
  for (const m of run.mines) {
    if (m.arm > 0 || m._dead) continue
    let target = null
    let bestSq = Infinity
    for (const e of run.enemies) {
      if (e._dead) continue
      const dx = e.x - m.x, dy = e.y - m.y
      const dSq = dx * dx + dy * dy
      if (dSq < bestSq) { bestSq = dSq; target = e }
    }
    if (!target || bestSq <= 1e-6) continue
    const d = Math.sqrt(bestSq)
    m.x += ((target.x - m.x) / d) * speed * dt
    m.y += ((target.y - m.y) / d) * speed * dt
  }
}

// A single mine's detonation: AoE damage + explode event + (non-bomblet) Cluster Bombs.
// Shared by the natural trigger path and Chain Reaction cascades below.
function detonateMine(run, m) {
  for (const e of run.enemies) {
    if (e._dead) continue
    const dx = e.x - m.x, dy = e.y - m.y
    if (dx * dx + dy * dy <= m.radius * m.radius) applyDamage(run, e, m.dmg)
  }
  run.events.push({ type: 'explode', x: m.x, y: m.y, radius: m.radius })
  m._dead = true
  if (!m.small) {
    const cluster = run.weaponMods.mines?.cluster ?? 0
    if (cluster > 0) spawnClusterMines(run, m, cluster)
  }
}

function stepMines(run, dt) {
  const magneticBonus = run.weaponMods.mines?.magnetic ?? 0
  if (magneticBonus > 0) stepMagneticMines(run, dt, magneticBonus)

  for (const m of run.mines) {
    if (m.arm > 0) { m.arm = Math.max(0, m.arm - dt); continue }
    if (m._dead || m._detonate) continue

    let triggered = false
    for (const e of run.enemies) {
      if (e._dead) continue
      const dx = e.x - m.x, dy = e.y - m.y
      const trig = MINE_TRIGGER_R + e.radius
      if (dx * dx + dy * dy <= trig * trig) { triggered = true; break }
    }
    if (triggered) m._detonate = true
  }

  // Chain Reaction: process detonations breadth-first (a mine only ever detonates once) so a
  // cascade can also trigger other ARMED mines within its own blast radius.
  const chainCap = run.weaponMods.mines?.chainReaction ?? 0
  const queue = run.mines.filter((m) => m._detonate && !m._dead)
  for (let qi = 0; qi < queue.length; qi++) {
    const m = queue[qi]
    if (m._dead) continue
    detonateMine(run, m)
    if (chainCap <= 0) continue
    const radSq = m.radius * m.radius
    let chained = 0
    for (const other of run.mines) {
      if (chained >= chainCap) break
      if (other === m || other._dead || other.arm > 0 || other._detonate) continue
      const dx = other.x - m.x, dy = other.y - m.y
      if (dx * dx + dy * dy <= radSq) {
        other._detonate = true
        queue.push(other)
        chained++
      }
    }
  }

  run.mines = run.mines.filter((m) => !m._dead)
}

// -- Homing wisps ---------------------------------------------------------------------

function stepHomingWeapon(run, w, stats, fireRateMul, dt) {
  fireOnTimer(run, w.id, stats.interval / fireRateMul, dt, () => fireHoming(run, stats))
}

function fireHoming(run, stats) {
  const p = run.player
  const target = nearestEnemy(run)
  const baseAngle = target
    ? Math.atan2(target.y - p.y, target.x - p.x)
    : (p.facing >= 0 ? 0 : Math.PI)

  const count = stats.count
  // Phantom Wisps: base pierce of 1 (dies on first hit, as before) + N per phantom pick.
  const pierce = 1 + (run.weaponMods.homing?.phantom ?? 0)
  for (let i = 0; i < count; i++) {
    const angle = count > 1 ? baseAngle + (i - (count - 1) / 2) * HOMING_FAN : baseAngle
    run.homingShots.push({
      x: p.x, y: p.y,
      vx: Math.cos(angle) * stats.speed,
      vy: Math.sin(angle) * stats.speed,
      dmg: stats.dmg, life: stats.life,
      speed: stats.speed, turnRate: stats.turnRate,
      pierce, hitIds: new Set(),
    })
  }
  run.events.push({ type: 'shoot', weapon: 'homing' })
}

// Popping Wisps: on death (spent its last pierce on a hit, OR lifetime expiry) a wisp pops an
// AoE splash = bonus × its own dmg in WISP_NOVA_RADIUS + explode event. Mini-wisps (Swarm) can
// pop too — only re-triggering Swarm itself is disallowed (see the hit loop below).
function wispPop(run, h, bonus) {
  const dmg = Math.round(h.dmg * bonus)
  if (dmg <= 0) return
  const radSq = WISP_NOVA_RADIUS * WISP_NOVA_RADIUS
  for (const e of run.enemies) {
    if (e._dead) continue
    const dx = e.x - h.x, dy = e.y - h.y
    if (dx * dx + dy * dy <= radSq) dealDamage(run, e, dmg, false)
  }
  run.events.push({ type: 'explode', x: h.x, y: h.y, radius: WISP_NOVA_RADIUS })
}

// Swarm: a (non-mini) wisp's hit that KILLS an enemy spawns `count` mini-wisps at the kill spot,
// flagged `_mini` so they never re-trigger Swarm themselves (no exponential cascade).
function spawnSwarmWisps(run, x, y, source, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    run.homingShots.push({
      x, y,
      vx: Math.cos(angle) * source.speed,
      vy: Math.sin(angle) * source.speed,
      dmg: source.dmg * SWARM_DMG_FRAC,
      life: SWARM_LIFE,
      speed: source.speed, turnRate: source.turnRate,
      pierce: 1, hitIds: new Set(),
      _mini: true,
    })
  }
}

function stepHomingShots(run, dt) {
  const wispNovaBonus = run.weaponMods.homing?.wispNova ?? 0
  const swarmBonus = run.weaponMods.homing?.swarm ?? 0
  for (const h of run.homingShots) {
    if (h.pierce <= 0) continue // already resolved (popped) when its last hit spent pierce
    h.life -= dt
    if (h.life <= 0) {
      if (wispNovaBonus > 0) wispPop(run, h, wispNovaBonus)
      continue
    }

    let target = null
    let bestSq = Infinity
    for (const e of run.enemies) {
      if (e._dead || h.hitIds.has(e.id)) continue
      const dx = e.x - h.x, dy = e.y - h.y
      const dSq = dx * dx + dy * dy
      if (dSq < bestSq) { bestSq = dSq; target = e }
    }
    if (target) {
      const desired = Math.atan2(target.y - h.y, target.x - h.x)
      const cur = Math.atan2(h.vy, h.vx)
      const diff = Math.atan2(Math.sin(desired - cur), Math.cos(desired - cur))
      const maxTurn = h.turnRate * dt
      const turn = Math.max(-maxTurn, Math.min(maxTurn, diff))
      const newAngle = cur + turn
      h.vx = Math.cos(newAngle) * h.speed
      h.vy = Math.sin(newAngle) * h.speed
    }
    h.x += h.vx * dt
    h.y += h.vy * dt

    for (const e of run.enemies) {
      if (e._dead || h.hitIds.has(e.id)) continue
      const dx = e.x - h.x, dy = e.y - h.y
      const rad = HOMING_HIT_R + e.radius
      if (dx * dx + dy * dy <= rad * rad) {
        applyDamage(run, e, h.dmg)
        h.hitIds.add(e.id)
        if (!h._mini && swarmBonus > 0 && e._dead) spawnSwarmWisps(run, e.x, e.y, h, swarmBonus)
        h.pierce--
        if (h.pierce <= 0) {
          h.life = 0
          if (wispNovaBonus > 0) wispPop(run, h, wispNovaBonus)
        }
        break
      }
    }
  }
  run.homingShots = run.homingShots.filter((h) => h.life > 0 && h.pierce > 0)
}

// -- Black hole -------------------------------------------------------------------------

function stepHoleWeapon(run, w, stats, fireRateMul, dt) {
  fireOnTimer(run, w.id, stats.interval / fireRateMul, dt, () => fireHole(run, stats))
}

// Picks a spawn spot for a hole: a random other in-view, not-yet-used enemy, falling back to a
// random offset from the player when none are available (or all are excluded). Shared by the
// main cast and Singularity's extra vortexes.
function pickHoleSpot(run, excludeIds) {
  const p = run.player
  const viewSq = run.viewRadius * run.viewRadius
  const inView = run.enemies.filter((e) => {
    if (e._dead || excludeIds.has(e.id)) return false
    const dx = e.x - p.x, dy = e.y - p.y
    return dx * dx + dy * dy <= viewSq
  })

  if (inView.length > 0) {
    const e = inView[Math.floor(Math.random() * inView.length)]
    return { x: e.x, y: e.y, id: e.id }
  }
  const a = Math.random() * Math.PI * 2
  const d = 250 + Math.random() * 150
  return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, id: null }
}

function fireHole(run, stats) {
  const usedIds = new Set()
  const main = pickHoleSpot(run, usedIds)
  if (main.id != null) usedIds.add(main.id)

  run.holes.push({
    x: main.x, y: main.y, radius: stats.radius, coreRadius: stats.radius * HOLE_CORE_FRAC,
    life: stats.duration, duration: stats.duration,
    dmg: stats.dmg, tick: stats.tick, pull: stats.pull, acc: 0,
    spawnRadius: stats.radius, // Hungry Hole: growth is a fraction of THIS (per-hole) radius
  })
  run.events.push({ type: 'hole' })

  // Singularity: N extra vortexes per cast, at HOLE_SINGULARITY_FRAC radius/coreRadius/pull,
  // spawned on other random in-view enemies (falls back to a random offset, like the main cast).
  const singularity = run.weaponMods.hole?.singularity ?? 0
  for (let i = 0; i < singularity; i++) {
    const spot = pickHoleSpot(run, usedIds)
    if (spot.id != null) usedIds.add(spot.id)
    const radius = stats.radius * HOLE_SINGULARITY_FRAC
    run.holes.push({
      x: spot.x, y: spot.y, radius, coreRadius: radius * HOLE_CORE_FRAC,
      life: stats.duration, duration: stats.duration,
      dmg: stats.dmg, tick: stats.tick, pull: stats.pull * HOLE_SINGULARITY_FRAC, acc: 0,
      spawnRadius: radius,
    })
    run.events.push({ type: 'hole' })
  }
}

// Big Crunch: on expiry, a hole collapses in a detonation — damage = tick dmg × CRUNCH_DMG_MUL ×
// (1 + bonus) to everything within its FINAL radius + explode event there.
function holeCrunch(run, h, bonus) {
  const dmg = Math.round(h.dmg * CRUNCH_DMG_MUL * (1 + bonus))
  if (dmg <= 0) return
  const radSq = h.radius * h.radius
  for (const e of run.enemies) {
    if (e._dead) continue
    const dx = e.x - h.x, dy = e.y - h.y
    if (dx * dx + dy * dy <= radSq) dealDamage(run, e, dmg, false)
  }
  run.events.push({ type: 'explode', x: h.x, y: h.y, radius: h.radius })
}

// Suction ramps from HOLE_RIM_PULL_MUL at the rim up to full strength at the core, so things
// near the edge can still resist while anything close in gets locked down. Shared by enemies
// and coins (see stepHoles); returns 0..1, pre elite-resist-cap/pull multiplier.
function holePullT(d, h) {
  const span = Math.max(1e-6, h.radius - h.coreRadius)
  return d <= h.coreRadius ? 1 : Math.max(0, 1 - (d - h.coreRadius) / span)
}

// Runs after stepEnemyMovement, so the vortex always wins the tug-of-war near the core
// instead of enemies "escaping" on the same frame they were pulled in.
function stepHoles(run, dt) {
  const pulled = new Set() // enemy ids affected by a hole this frame; rest decay e.holePull toward 0
  const hungryBonus = run.weaponMods.hole?.hungry ?? 0
  const crunchBonus = run.weaponMods.hole?.crunch ?? 0

  for (const h of run.holes) {
    h.life -= dt
    if (h.life <= 0) {
      if (crunchBonus > 0) holeCrunch(run, h, crunchBonus)
      continue
    }

    // Hungry Hole: radius (and coreRadius, kept proportional) grows while alive. Render is
    // visual-safe here — it already re-reads h.radius/coreRadius every frame.
    if (hungryBonus > 0 && h.spawnRadius) {
      h.radius += hungryBonus * h.spawnRadius * dt
      h.coreRadius = h.radius * HOLE_CORE_FRAC
    }

    for (const e of run.enemies) {
      if (e._dead) continue
      if (e.affixes && e.affixes.includes('anchored')) continue // anchored: never pulled (still takes tick damage below)
      const dx = h.x - e.x, dy = h.y - e.y
      const d = Math.hypot(dx, dy)
      if (d > 1e-6 && d <= h.radius) {
        const t = holePullT(d, h)
        let strength = HOLE_RIM_PULL_MUL + (1 - HOLE_RIM_PULL_MUL) * t

        // Elites and tanks are heavier — they resist getting yanked all the way in.
        if (e.elite || e.type === 'tank') strength = Math.min(strength, HOLE_RESIST_CAP)

        const ux = dx / d, uy = dy / d
        const radialSpeed = h.pull * strength
        const tangentSpeed = radialSpeed * HOLE_SPIRAL_MUL // spiral instead of a straight beeline
        const radial = Math.min(d, radialSpeed * dt) // never fling an enemy past the center
        e.x += ux * radial - uy * tangentSpeed * dt
        e.y += uy * radial + ux * tangentSpeed * dt

        e.holePull = Math.max(e.holePull ?? 0, t)
        pulled.add(e.id)
      }
    }

    // Coins get sucked in too (same rim-to-core ramp, no elite-style resist); gems are left
    // alone so a hole doesn't yank xp away from where the player is standing.
    for (const c of run.coins) {
      const dx = h.x - c.x, dy = h.y - c.y
      const d = Math.hypot(dx, dy)
      if (d > 1e-6 && d <= h.radius) {
        const t = holePullT(d, h)
        const strength = HOLE_RIM_PULL_MUL + (1 - HOLE_RIM_PULL_MUL) * t
        const ux = dx / d, uy = dy / d
        const radialSpeed = h.pull * strength
        const tangentSpeed = radialSpeed * HOLE_SPIRAL_MUL
        const radial = Math.min(d, radialSpeed * dt)
        c.x += ux * radial - uy * tangentSpeed * dt
        c.y += uy * radial + ux * tangentSpeed * dt
      }
    }

    h.acc += dt
    while (h.acc >= h.tick) {
      h.acc -= h.tick
      for (const e of run.enemies) {
        if (e._dead) continue
        const dx = e.x - h.x, dy = e.y - h.y
        const distSq = dx * dx + dy * dy
        if (distSq <= h.radius * h.radius) {
          const inCore = distSq <= h.coreRadius * h.coreRadius
          applyDamage(run, e, h.dmg * (inCore ? HOLE_CORE_DMG_MUL : 1))
        }
      }
    }
  }
  run.holes = run.holes.filter((h) => h.life > 0)

  for (const e of run.enemies) {
    if (e._dead || pulled.has(e.id)) continue
    if (e.holePull > 0) e.holePull = Math.max(0, e.holePull - HOLE_PULL_DECAY * dt)
  }
}

// -- Prism beam -------------------------------------------------------------------------

function stepBeamWeapon(run, w, stats, fireRateMul, dt) {
  fireOnTimer(run, w.id, stats.interval / fireRateMul, dt, () => fireBeam(run, stats))
}

function fireBeam(run, stats) {
  const p = run.player
  const target = nearestEnemy(run)
  const baseAngle = target
    ? Math.atan2(target.y - p.y, target.x - p.x)
    : (p.facing >= 0 ? 0 : Math.PI)

  // v5.6.14 (user): the beam is DOUBLE-ENDED, Darth Maul style — the base cast is 2 arms 180°
  // apart, one aimed at the target and one out the back, rotating together as a staff. Prismatic
  // Split still adds arms on top (3 arms = 120°, ...), all evenly spread by the same machinery.
  const beamCount = 2 + (run.weaponMods.rainbow?.prismatic ?? 0)
  const angleStep = (2 * Math.PI) / beamCount
  // Strobe Ray: bake the faster tick period in at cast time (mid-run picks shouldn't retroactively
  // speed up an already-live beam). Focus Lens's ramp is recomputed every tick instead (see below).
  const strobeBonus = run.weaponMods.rainbow?.strobe ?? 0
  const tick = stats.tick / (1 + strobeBonus)
  const focusBonus = run.weaponMods.rainbow?.focus ?? 0
  for (let i = 0; i < beamCount; i++) {
    run.beams.push({
      angle: baseAngle + i * angleStep, life: stats.duration, duration: stats.duration, dmg: stats.dmg,
      tick, width: stats.width, length: stats.length,
      rotSpeed: stats.rotSpeed, acc: 0, focusBonus,
    })
  }
  run.events.push({ type: 'beam' })
}

// Is an enemy inside the beam arm at `angle`? Shared by the tick loop and Collapse.
function inBeamArm(run, b, e, angle) {
  const p = run.player
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const dx = e.x - p.x, dy = e.y - p.y
  const along = dx * cos + dy * sin           // distance projected onto the beam axis
  const perp = -dx * sin + dy * cos            // perpendicular distance from the axis
  return along >= 0 && along <= b.length && Math.abs(perp) < b.width / 2 + e.radius
}

// A beam's arms: 1 for the Neon Beam, or `arms` evenly around the circle for a folded Tesseract
// Beam (2 = the fold itself, 180° apart; hyperfold adds more). One entity rakes them all, so
// Collapse can resolve the whole fold at once — that's why the fold isn't N separate beams.
function beamArmAngles(b) {
  if (!b.folded) return [b.angle]
  const arms = b.arms ?? TESSERACT_ARMS
  const out = []
  for (let i = 0; i < arms; i++) out.push(b.angle + (i / arms) * Math.PI * 2)
  return out
}

// Collapse (tesseractBeam): when the fold snaps shut, everything inside ANY arm is yanked toward
// the player and takes a multiple of the beam's per-tick damage, plus one explode at the player.
function collapseFold(run, b) {
  const p = run.player
  const dmg = Math.round(b.dmg * TESSERACT_COLLAPSE_MUL * (1 + b.collapseBonus))
  const angles = beamArmAngles(b)
  for (const e of run.enemies) {
    if (e._dead) continue
    if (!angles.some((a) => inBeamArm(run, b, e, a))) continue
    const dx = p.x - e.x, dy = p.y - e.y
    const d = Math.hypot(dx, dy)
    if (d > 1e-6 && !(e.affixes && e.affixes.includes('anchored'))) {
      e.kb.x += (dx / d) * TESSERACT_COLLAPSE_PULL
      e.kb.y += (dy / d) * TESSERACT_COLLAPSE_PULL
    }
    if (dmg > 0) dealDamage(run, e, dmg, false)
  }
  run.events.push({ type: 'explode', x: p.x, y: p.y, radius: b.length })
}

function stepBeams(run, dt) {
  for (const b of run.beams) {
    b.life -= dt
    if (b.life <= 0) {
      if (b.folded && (b.collapseBonus ?? 0) > 0) collapseFold(run, b)
      continue
    }
    b.angle += b.rotSpeed * dt

    b.acc += dt
    while (b.acc >= b.tick) {
      b.acc -= b.tick
      // Focus Lens: damage ramps linearly from 1x at cast to (1 + focusBonus)x by the end of
      // the beam's duration, recomputed fresh from elapsed/duration on every tick.
      const focusBonus = b.focusBonus ?? 0
      const elapsed = Math.min(b.duration, b.duration - b.life)
      const dmg = focusBonus > 0 ? b.dmg * (1 + focusBonus * (elapsed / b.duration)) : b.dmg
      for (const angle of beamArmAngles(b)) {
        for (const e of run.enemies) {
          if (e._dead) continue
          if (inBeamArm(run, b, e, angle)) applyDamage(run, e, dmg)
        }
      }
    }
  }
  run.beams = run.beams.filter((b) => b.life > 0)
}

// -- Flagella Whip (v5.0 pond starter) --------------------------------------------------
// A melee arc sweep: every `rate` seconds (frenzy divides that interval, like the global fire
// rate) it damages every enemy whose CENTER falls in the sector (arc rad, range px) centered on
// the nearest enemy. cyclone opens every 3rd swing to a full circle; barbed adds a bleed DoT.
// Emits one {type:'whip', x, y, angle, range, arc} event per swing (render draws the sweep) plus
// the usual per-enemy {type:'hit'} from applyDamage.
function stepFlagellaWeapon(run, w, stats, fireRateMul, dt) {
  const frenzy = run.weaponMods.flagella?.frenzy ?? 0
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + frenzy)), dt, () => fireFlagella(run, stats))
}

function fireFlagella(run, stats) {
  const p = run.player
  // Aim at the nearest enemy so the arc sweeps INTO the swarm: in a survivors-like the player kites
  // AWAY from the pack, so the last move direction (p.facingAngle) points the opposite way. Only
  // when there is no enemy to target do we fall back to the last move direction, then p.facing.
  const target = nearestEnemy(run)
  let angle
  if (target) angle = Math.atan2(target.y - p.y, target.x - p.x)
  else if (p.facingAngle != null) angle = p.facingAngle
  else angle = p.facing >= 0 ? 0 : Math.PI

  // cyclone (behavioral): every FLAGELLA_CYCLONE_EVERY-th swing opens to a full circle.
  const cycloneOn = (run.weaponMods.flagella?.cyclone ?? 0) > 0
  run._flagellaSwings = (run._flagellaSwings ?? 0) + 1
  const fullCircle = cycloneOn && run._flagellaSwings % FLAGELLA_CYCLONE_EVERY === 0
  const arc = fullCircle ? Math.PI * 2 : stats.arc
  const half = arc / 2
  const barbedBonus = run.weaponMods.flagella?.barbed ?? 0

  for (const e of run.enemies) {
    if (e._dead) continue
    const dx = e.x - p.x, dy = e.y - p.y
    if (dx * dx + dy * dy > stats.range * stats.range) continue // center within range
    if (!fullCircle) {
      const ea = Math.atan2(dy, dx)
      const da = Math.atan2(Math.sin(ea - angle), Math.cos(ea - angle)) // signed angular offset
      if (Math.abs(da) > half) continue
    }
    const dealt = applyDamage(run, e, stats.dmg)
    if (barbedBonus > 0 && !e._dead) applyBleed(e, dealt, barbedBonus)
  }
  run.events.push({ type: 'whip', x: p.x, y: p.y, angle, range: stats.range, arc })
}

// barbed: refresh (replace, like ignite) a bleed whose total = dmgDealt × BARBED_DMG_MUL × bonus
// over BARBED_DURATION seconds. dmgDealt is already the fully-rolled hit (player mult + crit), so
// the bleed ticks it straight through dealDamage (dot-flagged) without re-scaling — see stepStatuses.
function applyBleed(enemy, dmgDealt, bonus) {
  const total = dmgDealt * BARBED_DMG_MUL * bonus
  if (total <= 0) return
  enemy.bleed = BARBED_DURATION
  enemy.bleedDps = total / BARBED_DURATION
}

// -- Toxin Bloom (v5.0 rare AoE zoner) --------------------------------------------------
// Every `rate` seconds (quickCast divides that interval) plants a toxin cloud (twinBloom plants
// extra clouds) on a random enemy within castRange, falling back to a random offset near the
// player. Clouds live in run.blooms (see state.js) and are ticked by stepBlooms below.
function stepBloomWeapon(run, w, stats, fireRateMul, dt) {
  const quickCast = run.weaponMods.bloom?.quickCast ?? 0
  const cloudCount = 1 + (run.weaponMods.bloom?.twinBloom ?? 0) // twinBloom: +1 cloud per pick
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + quickCast)), dt, () => {
    for (let i = 0; i < cloudCount; i++) {
      const spot = pickBloomSpot(run, stats.castRange)
      run.blooms.push({ x: spot.x, y: spot.y, r: 0, maxR: stats.maxR, t: 0, dur: stats.dur, dmgPerTick: stats.dmgPerTick })
    }
    run.events.push({ type: 'bloom', x: run.player.x, y: run.player.y })
  })
}

// A random live enemy within castRange, else a random offset within castRange of the player.
function pickBloomSpot(run, castRange) {
  const p = run.player
  const rangeSq = castRange * castRange
  const inRange = run.enemies.filter((e) => {
    if (e._dead) return false
    const dx = e.x - p.x, dy = e.y - p.y
    return dx * dx + dy * dy <= rangeSq
  })
  if (inRange.length > 0) {
    const e = inRange[Math.floor(Math.random() * inRange.length)]
    return { x: e.x, y: e.y }
  }
  const a = Math.random() * Math.PI * 2
  const d = Math.random() * castRange
  return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d }
}

// Player-scaled but dot-flagged damage (no crit, no white flash, no element application) — a
// bloom tick reads as a poison DoT, not a bright weapon hit, while still benefiting from the
// player's damage passives/shop like every other weapon.
function applyDotDamage(run, enemy, baseDmg) {
  const p = run.player
  const dmg = baseDmg * p.damageMul * (1 + run.passives.damage) * run.mods.playerDmgMul
  dealDamage(run, enemy, dmg, false, true)
}

// Grows each cloud 0 -> maxR over dur × BLOOM_GROW_FRAC (then holds maxR), ticks dot-flagged
// damage every BLOOM_TICK to enemies inside, and expires once t reaches dur. sporeburst: a foe
// killed by a (non-mini) cloud's own tick emits a mini-cloud (SPOREBURST_FRAC maxR, flagged
// `_mini` so it never chains). New minis are collected and appended after the pass so they don't
// perturb the in-progress iteration.
function stepBlooms(run, dt) {
  if (run.blooms.length === 0) return
  const sporeOn = (run.weaponMods.bloom?.sporeburst ?? 0) > 0
  const minis = []
  for (const bl of run.blooms) {
    bl.t += dt
    const growT = bl.dur * BLOOM_GROW_FRAC
    bl.r = bl.t >= growT ? bl.maxR : bl.maxR * (bl.t / Math.max(1e-6, growT))
    bl._tickAcc = (bl._tickAcc ?? 0) + dt
    while (bl._tickAcc >= BLOOM_TICK) {
      bl._tickAcc -= BLOOM_TICK
      const rSq = bl.r * bl.r
      for (const e of run.enemies) {
        if (e._dead) continue
        const dx = e.x - bl.x, dy = e.y - bl.y
        if (dx * dx + dy * dy > rSq) continue
        applyDotDamage(run, e, bl.dmgPerTick)
        if (sporeOn && !bl._mini && e._dead) {
          minis.push({ x: e.x, y: e.y, maxR: bl.maxR * SPOREBURST_FRAC, dur: bl.dur, dmgPerTick: bl.dmgPerTick })
        }
      }
    }
  }
  for (const m of minis) {
    run.blooms.push({ x: m.x, y: m.y, r: 0, maxR: m.maxR, t: 0, dur: m.dur, dmgPerTick: m.dmgPerTick, _mini: true })
  }
  run.blooms = run.blooms.filter((bl) => bl.t < bl.dur)
}

// -- Stinger (v5.3 garden native) -------------------------------------------------------
// Every `rate` seconds (rapid divides that interval, like the global fire rate) fires a tight cone
// of `count` needle projectiles into run.bullets, aimed at the nearest enemy. Needles reuse the
// bullet system (stepBullets) but are tagged weapon:'stinger' and carry disabled split/chain/
// ricochet budgets so star's mods never touch them. longNeedles scales range AND speed; venomTips
// injects a venom stack per needle hit (stepBullets); hive fires the whole volley in all directions
// every STINGER_HIVE_EVERY-th cast.
function stepStingerWeapon(run, w, stats, fireRateMul, dt) {
  const rapid = run.weaponMods.stinger?.rapid ?? 0
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + rapid)), dt, () => fireStinger(run, stats))
}

function fireStinger(run, stats) {
  const p = run.player
  const target = nearestEnemy(run)
  let baseAngle
  if (target) baseAngle = Math.atan2(target.y - p.y, target.x - p.x)
  else if (p.facingAngle != null) baseAngle = p.facingAngle
  else baseAngle = p.facing >= 0 ? 0 : Math.PI

  const longMul = 1 + (run.weaponMods.stinger?.longNeedles ?? 0) // longNeedles: +range AND +speed
  const speed = stats.speed * longMul
  const range = stats.range * longMul
  const life = range / speed
  const count = stats.count // volley (+needles) already folded in via effectiveWeaponStats
  const venomOn = (run.weaponMods.stinger?.venomTips ?? 0) > 0

  // hive: every STINGER_HIVE_EVERY-th volley opens from the tight cone to a full 360° spread.
  const hiveOn = (run.weaponMods.stinger?.hive ?? 0) > 0
  run._stingerVolleys = (run._stingerVolleys ?? 0) + 1
  const allAround = hiveOn && run._stingerVolleys % STINGER_HIVE_EVERY === 0
  const spread = stats.spread

  for (let i = 0; i < count; i++) {
    let angle
    if (allAround) angle = baseAngle + (i / count) * Math.PI * 2
    else angle = baseAngle + (count > 1 ? -spread + i * ((2 * spread) / (count - 1)) : 0)
    run.bullets.push({
      x: p.x, y: p.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      dmg: stats.dmg,
      pierce: 1,
      life,
      r: STINGER_R,
      speed,
      hitIds: new Set(),
      weapon: 'stinger',
      _venomTips: venomOn,
      // Disable star's bullet behaviours on needles (they share run.bullets/stepBullets).
      _shard: false, _splitDone: true, _chainsLeft: 0, _ricochetsLeft: 0,
    })
  }
  run.events.push({ type: 'shoot', weapon: 'stinger' })
}

// -- Pheromone Lure (v5.3 garden native) ------------------------------------------------
// Every `rate` seconds (fastLure divides that interval) plants a decoy (twinLure plants extra ones)
// at a random spot within castRange. Enemies within a lure's aggro radius path to it instead of the
// player (stepEnemyMovement); the lure bursts for AoE damage at expiry (stepLures). widerTaunt/
// longerLure fold into stats; bigBurst scales burst dmg/radius; stickyScent drops a slow zone.
function stepLureWeapon(run, w, stats, fireRateMul, dt) {
  const fastLure = run.weaponMods.lure?.fastLure ?? 0
  const decoyCount = 1 + (run.weaponMods.lure?.twinLure ?? 0) // twinLure: +1 decoy per pick
  const burstMul = 1 + (run.weaponMods.lure?.bigBurst ?? 0)   // bigBurst: +dmg AND +radius
  const sticky = (run.weaponMods.lure?.stickyScent ?? 0) > 0
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + fastLure)), dt, () => {
    for (let i = 0; i < decoyCount; i++) {
      const a = Math.random() * Math.PI * 2
      const d = Math.random() * stats.castRange
      run.lures.push({
        x: run.player.x + Math.cos(a) * d,
        y: run.player.y + Math.sin(a) * d,
        t: 0, dur: stats.dur, aggro: stats.aggro,
        burstR: stats.burstR * burstMul, burstDmg: stats.burstDmg * burstMul,
        sticky,
      })
    }
    run.events.push({ type: 'lure', x: run.player.x, y: run.player.y })
  })
}

// Ages each lure; on expiry it BURSTS — player-scaled AoE damage (applyDamage, like a mine pop) to
// enemies within burstR + an explode event, and (stickyScent) a slow zone dropped into run.webs.
function stepLures(run, dt) {
  if (!run.lures || run.lures.length === 0) return
  for (const lu of run.lures) {
    lu.t += dt
    if (lu.t < lu.dur) continue
    lu._burst = true
    const radSq = lu.burstR * lu.burstR
    for (const e of run.enemies) {
      if (e._dead) continue
      const dx = e.x - lu.x, dy = e.y - lu.y
      if (dx * dx + dy * dy <= radSq) applyDamage(run, e, lu.burstDmg)
    }
    run.events.push({ type: 'explode', x: lu.x, y: lu.y, radius: lu.burstR })
    if (lu.sticky) run.webs.push({ x: lu.x, y: lu.y, r: LURE_STICKY_R, t: LURE_STICKY_DUR })
  }
  run.lures = run.lures.filter((lu) => !lu._burst)
}

// ---- v5.4 natives (undergrowth / city / skies / beyond) --------------------------------
// Shared by every v5.4 weapon that aims: the NEAREST enemy first, the last move direction only if
// there is none, p.facing last. This is fireFlagella's hard-won rule (v5.1.2) — in a survivors-like
// the player kites AWAY from the pack, so aiming at the move direction points at empty ground.
function aimAngle(run) {
  const p = run.player
  const target = nearestEnemy(run)
  if (target) return Math.atan2(target.y - p.y, target.x - p.x)
  if (p.facingAngle != null) return p.facingAngle
  return p.facing >= 0 ? 0 : Math.PI
}

// Shared by every sector sweep (clawRake, roar, tailSwipe): is the enemy's CENTER inside
// the sector of half-angle arc/2 and radius `range` centered on `angle` at (ox, oy)? fullCircle
// skips the angular test (cyclone/resonance's 360° swings).
// Tests the enemy's BODY against the sector, not its centre. A centre-only test is why a foe whose
// sprite plainly overlaps the sweep — but whose centre sits a few px past the edge — took nothing:
// the swing visibly passed through it and did nothing.
//
// The body radius is also what pays for "incoming" foes. Every sector sweep here is INSTANTANEOUS
// while its FX lingers (~0.16-0.18s — the whip does the same), so a foe that closes during the
// animation looks like it walked into a live blade and should have been cut. Widening by the foe's
// own radius is the compensation, and it beats a magic pad constant twice over: it scales with the
// foe (a tank's bulk earns more tolerance than a wisp's), and it never claims ground the DRAWING
// doesn't cover, because what the eye judges is body-overlaps-claws — which is exactly this test.
// It shrinks the walk-in window; only a live multi-frame hitbox would close it entirely.
function inSector(ox, oy, angle, range, arc, e, fullCircle) {
  const dx = e.x - ox, dy = e.y - oy
  const dSq = dx * dx + dy * dy
  const reach = range + e.radius
  if (dSq > reach * reach) return false
  if (fullCircle) return true
  // The sector's apex is INSIDE the enemy's own body: it's in every arc, and the angular test is
  // meaningless there anyway (a bearing of ~zero length is arbitrary — atan2(0,0) is just 0). Without
  // this, an enemy hugging the player would fall out of the sweep exactly when it is most obviously
  // being clawed.
  if (dSq <= e.radius * e.radius) return true
  const ea = Math.atan2(dy, dx)
  const da = Math.atan2(Math.sin(ea - angle), Math.cos(ea - angle)) // signed angular offset
  // A body of radius r at distance d subtends asin(r/d) either side of its centre's bearing, so a
  // foe merely CLIPPED by the wedge's edge counts — same reason as the reach above.
  return Math.abs(da) <= arc / 2 + Math.asin(Math.min(1, e.radius / Math.sqrt(dSq)))
}

// -- Claw Rake (v5.5 undergrowth starter) -------------------------------------------------
// A narrow, fast sector rake at the nearest enemy — fireFlagella's shape, tuned the other way
// (half the arc, ~1.6x the cadence). It NEVER touches the player's position: this weapon used to
// dash them onto the target, which stole the only input the game has and fed them into contact
// damage. See the CLAW_* block in config.js before changing that.
// quickPaws divides the interval (a `rate` fold would slow it); doubleSlash adds a follow-up slash
// every CLAW_DOUBLE_EVERY-th rake; bleedClaws adds flagella's barbed bleed.
function stepClawRake(run, w, stats, fireRateMul, dt) {
  const mods = run.weaponMods.clawRake
  const quickPaws = mods?.quickPaws ?? 0
  const doubleOn = (mods?.doubleSlash ?? 0) > 0
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + quickPaws)), dt, () => {
    run._clawRakes = (run._clawRakes ?? 0) + 1
    slashClaws(run, {
      range: stats.range,
      arc: stats.arc,
      dmg: stats.dmg,
      chain: doubleOn && run._clawRakes % CLAW_DOUBLE_EVERY === 0,
    })
  })
}

// One slash. o = { range, arc, dmg, chain } — already mod-resolved, so a doubleSlash follow-up can
// reuse it verbatim at reduced damage. Re-aimed on every slash (including the follow-up): the
// swarm moves between them.
function slashClaws(run, o) {
  const p = run.player
  const angle = aimAngle(run)
  const bleedBonus = run.weaponMods.clawRake?.bleedClaws ?? 0
  for (const e of run.enemies) {
    if (e._dead) continue
    if (!inSector(p.x, p.y, angle, o.range, o.arc, e, false)) continue
    const dealt = applyDamage(run, e, o.dmg)
    // bleedClaws: flagella's barbed bleed, verbatim (same DoT, re-themed as claw wounds).
    if (bleedBonus > 0 && !e._dead) applyBleed(e, dealt, bleedBonus)
  }
  run.events.push({ type: 'clawRake', x: p.x, y: p.y, angle, range: o.range, arc: o.arc })
  // doubleSlash: queue a second, weaker slash after a beat. The follow-up never chains further.
  if (o.chain) {
    run._clawChain = {
      delay: CLAW_DOUBLE_DELAY,
      o: { ...o, dmg: o.dmg * CLAW_DOUBLE_DMG_FRAC, chain: false },
    }
  }
}

// Ticks the doubleSlash follow-up delay. A no-op unless one is queued.
function stepClawSlashes(run, dt) {
  const chain = run._clawChain
  if (!chain) return
  chain.delay -= dt
  if (chain.delay <= 0) {
    run._clawChain = null
    slashClaws(run, chain.o)
  }
}

// -- Quill Burst (v5.4 undergrowth) -------------------------------------------------------
// A ring of quills fired evenly around the FULL circle — never aimed: this is the panic button,
// not the sniper. Each quill is a run.bullets entry tagged weapon:'quill' with star's split/chain/
// ricochet budgets zeroed, exactly like the stinger's needles. longQuills scales range AND speed;
// rapidQuills divides the interval; retaliate fires a free (bigger) burst whenever the player is hit.
function stepQuillWeapon(run, w, stats, fireRateMul, dt) {
  if (run._quillRetalCd > 0) run._quillRetalCd = Math.max(0, run._quillRetalCd - dt)
  const rapid = run.weaponMods.quillBurst?.rapidQuills ?? 0
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + rapid)), dt, () => fireQuills(run, stats, stats.count))
}

function fireQuills(run, stats, count) {
  const p = run.player
  const longMul = 1 + (run.weaponMods.quillBurst?.longQuills ?? 0) // longQuills: +range AND +speed
  const speed = stats.speed * longMul
  const range = stats.range * longMul
  const life = range / speed
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2
    run.bullets.push({
      x: p.x, y: p.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      dmg: stats.dmg,
      pierce: stats.pierce,
      life,
      r: QUILL_R,
      speed,
      hitIds: new Set(),
      weapon: 'quill',
      // Disable star's bullet behaviours on quills (they share run.bullets/stepBullets).
      _shard: false, _splitDone: true, _chainsLeft: 0, _ricochetsLeft: 0,
    })
  }
  run.events.push({ type: 'shoot', weapon: 'quillBurst' })
}

// retaliate: getting hurt (contact or zone — hurtPlayer is the one shared path) bristles a free
// burst, at most once per QUILL_RETALIATE_CD. Each pick adds a quill on top of the level's count.
function tryQuillRetaliate(run) {
  const bonus = run.weaponMods.quillBurst?.retaliate ?? 0
  if (bonus <= 0 || (run._quillRetalCd ?? 0) > 0) return
  const w = run.weapons.find((x) => x.id === 'quillBurst')
  if (!w) return
  run._quillRetalCd = QUILL_RETALIATE_CD
  const stats = effectiveWeaponStats(run, w)
  fireQuills(run, stats, stats.count + bonus)
}

// -- Chitter Shriek (v5.4 undergrowth utility) --------------------------------------------
// A run.novas ring carrying `fear`: it damages, shoves, AND panics what it touches (see
// FEAR_SPEED_MUL / stepEnemyMovement). The slowest clear in the pool on purpose — its value is the
// rout, not the DPS. terror/shockwave/shrill fold into the stats; rapidShriek divides the interval;
// echoShriek queues delayed re-casts (the wave's Echo Wave shape); panicRout lives in dealDamage.
function stepShriekWeapon(run, w, stats, fireRateMul, dt) {
  const mods = run.weaponMods.chitterShriek
  const rapid = mods?.rapidShriek ?? 0
  const echoCount = mods?.echoShriek ?? 0
  const p = run.player
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + rapid)), dt, () => {
    spawnNova(run, p.x, p.y, stats.radius, stats.dmg, stats.knockback, stats.fear)
    run.events.push({ type: 'shoot', weapon: 'chitterShriek' })
    run._shriekEchoes = run._shriekEchoes ?? []
    for (let i = 1; i <= echoCount; i++) {
      run._shriekEchoes.push({
        delay: SHRIEK_ECHO_DELAY * i, x: p.x, y: p.y,
        radius: stats.radius, dmg: stats.dmg * SHRIEK_ECHO_DMG_FRAC,
        knockback: stats.knockback, fear: stats.fear * SHRIEK_ECHO_DMG_FRAC,
      })
    }
  })
  stepShriekEchoes(run, dt)
}

// Ticks down pending Echo Shriek casts (run._shriekEchoes, sim-internal) — cf. stepWaveEchoes.
function stepShriekEchoes(run, dt) {
  const echoes = run._shriekEchoes
  if (!echoes || echoes.length === 0) return
  for (const ec of echoes) {
    ec.delay -= dt
    if (ec.delay <= 0) {
      spawnNova(run, ec.x, ec.y, ec.radius, ec.dmg, ec.knockback, ec.fear)
      ec._done = true
    }
  }
  run._shriekEchoes = echoes.filter((ec) => !ec._done)
}

// -- Trash Tornado (v5.4 city) -------------------------------------------------------------
// An always-on orbital, exactly orbit's shape: sim rewrites every chunk's position into run.debris
// each frame and ticks damage to whatever they overlap, on a per-chunk-per-enemy cooldown
// (e._debrisCd, the run.orbs/orbCd bookkeeping). flingDebris hurls chunks outward as run.bullets
// tagged weapon:'trash'; suction drags nearby foes in (elites/tanks resist, like a black hole's).
function stepTornadoWeapon(run, stats, fireRateMul, dt) {
  const p = run.player
  const mods = run.weaponMods.trashTornado

  for (let i = 0; i < stats.chunks; i++) {
    const angle = (i / stats.chunks) * Math.PI * 2 + run.time * stats.rotSpeed
    const ox = p.x + Math.cos(angle) * stats.radius
    const oy = p.y + Math.sin(angle) * stats.radius
    run.debris.push({ x: ox, y: oy, r: DEBRIS_R })
    for (const e of run.enemies) {
      if (e._dead || (e._debrisCd || 0) > 0) continue
      const dx = e.x - ox, dy = e.y - oy
      const rad = DEBRIS_R + e.radius
      if (dx * dx + dy * dy > rad * rad) continue
      applyDamage(run, e, stats.dmg)
      e._debrisCd = stats.tick / fireRateMul
    }
  }

  // suction: everything nearby is dragged toward the player (the tornado's eye). Elites/tanks are
  // heavier — capped at TORNADO_SUCTION_RESIST of the pull, mirroring HOLE_RESIST_CAP.
  const suction = mods?.suction ?? 0
  if (suction > 0) {
    const rangeSq = TORNADO_SUCTION_RANGE * TORNADO_SUCTION_RANGE
    for (const e of run.enemies) {
      if (e._dead) continue
      if (e.affixes && e.affixes.includes('anchored')) continue
      const dx = p.x - e.x, dy = p.y - e.y
      const dSq = dx * dx + dy * dy
      if (dSq > rangeSq || dSq <= 1e-6) continue
      const d = Math.sqrt(dSq)
      let pull = TORNADO_SUCTION_PULL * suction
      if (e.elite || e.type === 'tank') pull *= TORNADO_SUCTION_RESIST
      const step = Math.min(d, pull * dt)
      e.x += (dx / d) * step
      e.y += (dy / d) * step
    }
  }

  // flingDebris: every TORNADO_FLING_EVERY seconds, hurl <tier bonus> chunks straight outward.
  const fling = mods?.flingDebris ?? 0
  if (fling > 0) {
    run._tornadoFlingAcc = (run._tornadoFlingAcc ?? 0) + dt
    while (run._tornadoFlingAcc >= TORNADO_FLING_EVERY) {
      run._tornadoFlingAcc -= TORNADO_FLING_EVERY
      for (let i = 0; i < fling; i++) {
        const angle = (i / fling) * Math.PI * 2 + run.time * stats.rotSpeed
        run.bullets.push({
          x: p.x + Math.cos(angle) * stats.radius,
          y: p.y + Math.sin(angle) * stats.radius,
          vx: Math.cos(angle) * TORNADO_FLING_SPEED,
          vy: Math.sin(angle) * TORNADO_FLING_SPEED,
          dmg: stats.dmg * TORNADO_FLING_DMG_FRAC,
          pierce: 1,
          life: TORNADO_FLING_RANGE / TORNADO_FLING_SPEED,
          r: DEBRIS_R,
          speed: TORNADO_FLING_SPEED,
          hitIds: new Set(),
          weapon: 'trash',
          _shard: false, _splitDone: true, _chainsLeft: 0, _ricochetsLeft: 0,
        })
      }
    }
  }
}

// -- Sewer Geyser (v5.4 city utility) ------------------------------------------------------
// Plants telegraphed eruption zones (run.geysers) on/near random enemies within castRange; each
// waits out its harmless fuse, then erupts ONCE against ENEMIES only. The utility native — slowest
// clear in the pool on purpose. rapidGeyser divides the interval; launch flings and stuns what an
// eruption catches; chainGeyser scatters weaker follow-ups off each eruption.
function stepGeyserWeapon(run, w, stats, fireRateMul, dt) {
  const rapid = run.weaponMods.sewerGeyser?.rapidGeyser ?? 0
  const p = run.player
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + rapid)), dt, () => {
    for (let i = 0; i < stats.count; i++) {
      const spot = pickBloomSpot(run, stats.castRange) // random enemy in range, else a random offset
      run.geysers.push({ x: spot.x, y: spot.y, r: stats.r, fuse: stats.fuse, dur: stats.fuse, dmg: stats.dmg })
    }
    run.events.push({ type: 'geyser', x: p.x, y: p.y })
  })
}

// Shared by the Sewer Geyser and the Reality Shard's riftScar (same telegraph -> erupt -> gone
// contract, see run.geysers in state.js). Never touches the player.
function stepGeysers(run, dt) {
  if (!run.geysers || run.geysers.length === 0) return
  const launchBonus = run.weaponMods.sewerGeyser?.launch ?? 0
  const chain = run.weaponMods.sewerGeyser?.chainGeyser ?? 0
  const followUps = []

  for (const g of run.geysers) {
    g.fuse -= dt
    if (g.fuse > 0) continue // telegraph — harmless
    g._done = true
    const rSq = g.r * g.r
    for (const e of run.enemies) {
      if (e._dead) continue
      const dx = e.x - g.x, dy = e.y - g.y
      if (dx * dx + dy * dy > rSq) continue
      applyDamage(run, e, g.dmg)
      // launch: the jet throws them clear and leaves them stunned (see e.stunT in state.js).
      if (launchBonus > 0 && !e._dead) {
        const d = Math.hypot(dx, dy)
        const ux = d > 1e-6 ? dx / d : 1
        const uy = d > 1e-6 ? dy / d : 0
        if (!(e.affixes && e.affixes.includes('anchored'))) {
          e.kb.x += ux * GEYSER_LAUNCH_KB
          e.kb.y += uy * GEYSER_LAUNCH_KB
        }
        e.stunT = Math.max(e.stunT || 0, GEYSER_STUN * launchBonus)
      }
    }
    run.events.push({ type: 'explode', x: g.x, y: g.y, radius: g.r })
    // chainGeyser: scatter weaker follow-ups. _chained ones never chain further — and a riftScar
    // rift arrives already flagged _chained, so this can never fire off another weapon's zone.
    if (chain > 0 && !g._chained) {
      for (let i = 0; i < chain; i++) {
        const a = Math.random() * Math.PI * 2
        const d = GEYSER_CHAIN_SCATTER_MIN + Math.random() * (GEYSER_CHAIN_SCATTER_MAX - GEYSER_CHAIN_SCATTER_MIN)
        followUps.push({
          x: g.x + Math.cos(a) * d, y: g.y + Math.sin(a) * d,
          r: g.r * GEYSER_CHAIN_FRAC, fuse: GEYSER_CHAIN_FUSE, dur: GEYSER_CHAIN_FUSE,
          dmg: g.dmg * GEYSER_CHAIN_FRAC, _chained: true,
        })
      }
    }
  }
  for (const g of followUps) run.geysers.push(g)
  run.geysers = run.geysers.filter((g) => !g._done)
}

// -- Roar (v5.4 skies starter) -------------------------------------------------------------
// The flagella/pounce sector test again, but long, narrow and shoving — and the player doesn't move
// with it. rapidRoar divides the interval; stagger stuns what it catches; resonance opens every
// ROAR_RESONANCE_EVERY-th roar to a full circle (flagella's cyclone shape).
function stepRoarWeapon(run, w, stats, fireRateMul, dt) {
  const rapid = run.weaponMods.roar?.rapidRoar ?? 0
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + rapid)), dt, () => fireRoar(run, stats))
}

function fireRoar(run, stats) {
  const p = run.player
  const angle = aimAngle(run)
  const resonanceOn = (run.weaponMods.roar?.resonance ?? 0) > 0
  run._roarCasts = (run._roarCasts ?? 0) + 1
  const fullCircle = resonanceOn && run._roarCasts % ROAR_RESONANCE_EVERY === 0
  const arc = fullCircle ? Math.PI * 2 : stats.arc
  const staggerBonus = run.weaponMods.roar?.stagger ?? 0

  for (const e of run.enemies) {
    if (e._dead) continue
    if (!inSector(p.x, p.y, angle, stats.range, arc, e, fullCircle)) continue
    applyDamage(run, e, stats.dmg)
    if (e._dead) continue
    shoveFromPlayer(run, e, stats.knockback)
    if (staggerBonus > 0) e.stunT = Math.max(e.stunT || 0, ROAR_STUN * staggerBonus)
  }
  run.events.push({ type: 'roar', x: p.x, y: p.y, angle, range: stats.range, arc })
}

// Radial shove away from the player (the sector sweeps' knockback). Anchored elites take the
// damage and stand their ground, exactly as they do against a nova.
function shoveFromPlayer(run, e, knockback) {
  if (e.affixes && e.affixes.includes('anchored')) return
  const p = run.player
  const dx = e.x - p.x, dy = e.y - p.y
  const d = Math.hypot(dx, dy)
  const ux = d > 1e-6 ? dx / d : 1
  const uy = d > 1e-6 ? dy / d : 0
  e.kb.x += ux * knockback
  e.kb.y += uy * knockback
}

// -- Tail Swipe (v5.4 skies) ---------------------------------------------------------------
// The sector again, WIDE and short: slow, hard, and it launches. quickTail divides the interval;
// counterSwipe fires a free swipe when the player is hit; wreckingTail turns the launched bodies
// into collateral where they come down.
function stepTailWeapon(run, w, stats, fireRateMul, dt) {
  if (run._tailCounterCd > 0) run._tailCounterCd = Math.max(0, run._tailCounterCd - dt)
  const quick = run.weaponMods.tailSwipe?.quickTail ?? 0
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + quick)), dt, () => fireTail(run, stats))
}

function fireTail(run, stats) {
  const p = run.player
  const angle = aimAngle(run)
  const wrecking = run.weaponMods.tailSwipe?.wreckingTail ?? 0
  const struck = []

  for (const e of run.enemies) {
    if (e._dead) continue
    if (!inSector(p.x, p.y, angle, stats.range, stats.arc, e, false)) continue
    const dealt = applyDamage(run, e, stats.dmg)
    if (e._dead) continue
    shoveFromPlayer(run, e, stats.knockback)
    struck.push({ e, dealt })
  }

  // wreckingTail: resolved in a second pass, AFTER every knockback of this swipe is applied, so a
  // launched body's collateral lands where it's actually headed. "Where it ends up" is derived from
  // the knockback we just gave it: e.kb decays exponentially at KB_DECAY_RATE, so its remaining
  // travel integrates to kb/KB_DECAY_RATE. Collateral never re-triggers collateral.
  if (wrecking > 0) {
    for (const { e, dealt } of struck) {
      const lx = e.x + e.kb.x / KB_DECAY_RATE
      const ly = e.y + e.kb.y / KB_DECAY_RATE
      const dmg = Math.round(dealt * TAIL_COLLIDE_FRAC * wrecking)
      if (dmg <= 0) continue
      for (const other of run.enemies) {
        if (other._dead || other.id === e.id) continue
        const dx = other.x - lx, dy = other.y - ly
        if (dx * dx + dy * dy > TAIL_COLLIDE_R * TAIL_COLLIDE_R) continue
        dealDamage(run, other, dmg, false)
      }
    }
  }
  run.events.push({ type: 'tail', x: p.x, y: p.y, angle, range: stats.range, arc: stats.arc })
}

// counterSwipe: getting hurt swings the tail for free, at most every TAIL_COUNTER_CD (cf. retaliate).
function tryCounterSwipe(run) {
  const bonus = run.weaponMods.tailSwipe?.counterSwipe ?? 0
  if (bonus <= 0 || (run._tailCounterCd ?? 0) > 0) return
  const w = run.weapons.find((x) => x.id === 'tailSwipe')
  if (!w) return
  run._tailCounterCd = TAIL_COUNTER_CD
  fireTail(run, effectiveWeaponStats(run, w))
}

// -- Debris Toss (v5.4 skies utility) ------------------------------------------------------
// Lobs chunks (run.lobs) on an arc toward random enemies within castRange; each bursts ONCE where
// it lands, against ENEMIES only. longToss extends castRange and rapidToss divides the interval,
// both at the throw site; shrapnel scatters splinters (run.bullets tagged weapon:'debris').
function stepDebrisWeapon(run, w, stats, fireRateMul, dt) {
  const mods = run.weaponMods.debrisToss
  const rapid = mods?.rapidToss ?? 0
  const castRange = stats.castRange * (1 + (mods?.longToss ?? 0))
  const p = run.player
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + rapid)), dt, () => {
    for (let i = 0; i < stats.count; i++) {
      const spot = pickBloomSpot(run, castRange)
      run.lobs.push({
        x: p.x, y: p.y, fromX: p.x, fromY: p.y, tx: spot.x, ty: spot.y,
        t: 0, flight: stats.flight, r: stats.r, dmg: stats.dmg,
      })
    }
    run.events.push({ type: 'toss', x: p.x, y: p.y })
  })
}

// Ages each lob along its (fromX,fromY)->(tx,ty) lerp (render adds the parabola), then bursts it on
// landing. A gravity well may have moved tx/ty mid-flight — the lerp just follows (see bendLob).
function stepLobs(run, dt) {
  if (!run.lobs || run.lobs.length === 0) return
  const shrapnel = run.weaponMods.debrisToss?.shrapnel ?? 0

  for (const lo of run.lobs) {
    lo.t += dt
    const f = Math.min(1, lo.t / lo.flight)
    lo.x = lo.fromX + (lo.tx - lo.fromX) * f
    lo.y = lo.fromY + (lo.ty - lo.fromY) * f
    if (lo.t < lo.flight) continue
    lo._done = true

    const rSq = lo.r * lo.r
    for (const e of run.enemies) {
      if (e._dead) continue
      const dx = e.x - lo.tx, dy = e.y - lo.ty
      if (dx * dx + dy * dy <= rSq) applyDamage(run, e, lo.dmg)
    }
    run.events.push({ type: 'explode', x: lo.tx, y: lo.ty, radius: lo.r })

    // shrapnel: splinters fly radially out of the impact.
    for (let i = 0; i < shrapnel; i++) {
      const angle = (i / shrapnel) * Math.PI * 2
      run.bullets.push({
        x: lo.tx, y: lo.ty,
        vx: Math.cos(angle) * LOB_SHRAPNEL_SPEED,
        vy: Math.sin(angle) * LOB_SHRAPNEL_SPEED,
        dmg: lo.dmg * LOB_SHRAPNEL_DMG_FRAC,
        pierce: 1,
        life: LOB_SHRAPNEL_RANGE / LOB_SHRAPNEL_SPEED,
        r: LOB_SHRAPNEL_R,
        speed: LOB_SHRAPNEL_SPEED,
        hitIds: new Set(),
        weapon: 'debris',
        _shard: false, _splitDone: true, _chainsLeft: 0, _ricochetsLeft: 0,
      })
    }
  }
  run.lobs = run.lobs.filter((lo) => !lo._done)
}

// -- Reality Shard (v5.4 beyond starter) ---------------------------------------------------
// Fans `count` shards at the nearest enemy (star's STAR_FAN volley shape). Each is a run.bullets
// entry tagged weapon:'shard' that flies normally but TELEPORTS along its own heading every
// blinkEvery seconds — skipping the gap entirely, which is the point (nothing in between is hit).
// rapidShard divides the interval; riftScar leaves a detonating rift at each departure point;
// recursion forks a shard that outlives its range (see the shard branch of stepBullets).
function stepShardWeapon(run, w, stats, fireRateMul, dt) {
  const rapid = run.weaponMods.realityShard?.rapidShard ?? 0
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + rapid)), dt, () => fireShards(run, stats))
}

function fireShards(run, stats) {
  const p = run.player
  const baseAngle = aimAngle(run)
  const life = stats.range / stats.speed
  for (let i = 0; i < stats.count; i++) {
    const angle = baseAngle + (i - (stats.count - 1) / 2) * STAR_FAN
    run.bullets.push({
      x: p.x, y: p.y,
      vx: Math.cos(angle) * stats.speed,
      vy: Math.sin(angle) * stats.speed,
      dmg: stats.dmg,
      pierce: stats.pierce,
      life,
      r: SHARD_R,
      speed: stats.speed,
      hitIds: new Set(),
      weapon: 'shard',
      _blinkCd: stats.blinkEvery, _blinkEvery: stats.blinkEvery, _blinkDist: stats.blinkDist,
      _life0: life, // recursion forks at a fraction of the ORIGINAL life, not what's left
      _shard: false, _splitDone: true, _chainsLeft: 0, _ricochetsLeft: 0,
    })
  }
  run.events.push({ type: 'shoot', weapon: 'realityShard' })
}

// A blink: jump blinkDist px along the CURRENT heading (so a gravity well's curvature carries
// through it) without consuming life, and without sweeping the gap.
function stepShardBlink(run, b, dt) {
  b._blinkCd -= dt
  if (b._blinkCd > 0) return
  b._blinkCd += b._blinkEvery
  const speed = Math.hypot(b.vx, b.vy) || 1
  const fromX = b.x, fromY = b.y
  b.x += (b.vx / speed) * b._blinkDist
  b.y += (b.vy / speed) * b._blinkDist
  // riftScar: the departure point scars over and detonates. Rifts reuse run.geysers (the same
  // "telegraph then erupt, enemies only" contract) flagged _chained so sewerGeyser's chainGeyser —
  // a different weapon's mod — can never fire off them.
  const rift = run.weaponMods.realityShard?.riftScar ?? 0
  if (rift > 0) {
    run.geysers.push({
      x: fromX, y: fromY, r: SHARD_RIFT_R,
      fuse: SHARD_RIFT_FUSE, dur: SHARD_RIFT_FUSE,
      dmg: b.dmg * SHARD_RIFT_FRAC * rift, _chained: true,
    })
  }
}

// recursion: a shard whose LIFE expired forks into <tier bonus> weaker, shorter-lived shards in
// random directions, flagged _fork so a fork never re-forks.
function tryShardRecursion(run, b) {
  const count = run.weaponMods.realityShard?.recursion ?? 0
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    run.bullets.push({
      x: b.x, y: b.y,
      vx: Math.cos(angle) * b.speed,
      vy: Math.sin(angle) * b.speed,
      dmg: b.dmg * SHARD_RECURSE_DMG_FRAC,
      pierce: 1,
      life: (b._life0 ?? 1) * SHARD_RECURSE_LIFE_FRAC,
      r: SHARD_R,
      speed: b.speed,
      hitIds: new Set(),
      weapon: 'shard',
      _blinkCd: b._blinkEvery, _blinkEvery: b._blinkEvery, _blinkDist: b._blinkDist,
      _life0: (b._life0 ?? 1) * SHARD_RECURSE_LIFE_FRAC,
      _fork: true,
      _shard: false, _splitDone: true, _chainsLeft: 0, _ricochetsLeft: 0,
    })
  }
}

// -- Tesseract Beam (v5.4 beyond) ----------------------------------------------------------
// One run.beams entry flagged folded: the "fold" is a second arm 180° opposite the first, sweeping
// with it, so a cast rakes both sides at once (hyperfold adds arms — 3 = 120° apart, 4 = 90°...).
// Baking the whole fold into ONE entity (rather than N beams, the way rainbow.prismatic does) is
// what lets collapse resolve it as a single event. rapidFold divides the cast interval.
function stepTesseractWeapon(run, w, stats, fireRateMul, dt) {
  const rapid = run.weaponMods.tesseractBeam?.rapidFold ?? 0
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + rapid)), dt, () => fireTesseract(run, stats))
}

function fireTesseract(run, stats) {
  const mods = run.weaponMods.tesseractBeam
  run.beams.push({
    angle: aimAngle(run), life: stats.duration, duration: stats.duration, dmg: stats.dmg,
    tick: stats.tick, width: stats.width, length: stats.length,
    rotSpeed: stats.rotSpeed, acc: 0,
    folded: true,
    arms: TESSERACT_ARMS + (mods?.hyperfold ?? 0),
    collapseBonus: mods?.collapse ?? 0,
  })
  run.events.push({ type: 'beam' })
}

// ---- Pickups ------------------------------------------------------------------------

function magnetSpeed(dist, magnet) {
  const t = magnet > 0 ? Math.min(1, Math.max(0, dist / magnet)) : 0
  return 800 - t * 300 // faster (800px/s) when close, slower (500px/s) near magnet edge
}

function stepPickups(run, dt) {
  const p = run.player
  const magnet = p.magnet * (1 + run.passives.magnet) * run.mods.magnetMul
  const magnetSq = magnet * magnet
  const pickupSq = PLAYER.pickupRadius * PLAYER.pickupRadius

  const collect = (list, onPickup) => {
    const kept = []
    for (const it of list) {
      const dx = p.x - it.x, dy = p.y - it.y
      const distSq = dx * dx + dy * dy
      if (distSq <= pickupSq) { onPickup(it); continue }
      if (distSq <= magnetSq) {
        const dist = Math.sqrt(distSq)
        const spd = magnetSpeed(dist, magnet)
        it.x += (dx / dist) * spd * dt
        it.y += (dy / dist) * spd * dt
      }
      kept.push(it)
    }
    return kept
  }

  run.gems = collect(run.gems, (g) => {
    p.xp += g.xp * GEM_VALUE * (1 + run.passives.xpGain) * run.mods.xpMul
    run.events.push({ type: 'gem', x: g.x, y: g.y })
  })
  run.coins = collect(run.coins, (c) => {
    run.coinsEarned += Math.round(c.value * p.coinGainMul * run.mods.coinMul)
    run.events.push({ type: 'coin', x: c.x, y: c.y, value: c.value })
  })
}

// ---- Level up -----------------------------------------------------------------------

// Weapon candidates: new (unowned, only if under MAX_WEAPONS) + upgrades (below max level).
// Each carries its inherent config rarity; passives are added per-card once a rarity is rolled.
// Build-focus nudge (see NEW_WEAPON_FADE in config.js): arsenal investment = every pick
// spent upgrading an owned weapon or buying a weapon mod. Derived from state, no counter.
function arsenalInvestment(run) {
  let n = 0
  for (const w of run.weapons) n += w.level - 1
  for (const mods of Object.values(run.weaponModPicks)) {
    for (const picks of Object.values(mods)) n += picks
  }
  return n
}

function weaponCandidates(run) {
  const ownedIds = new Set(run.weapons.map((w) => w.id))
  const list = []

  if (run.weapons.length < MAX_WEAPONS) {
    const pNew = newWeaponChance(arsenalInvestment(run))
    // New-weapon offers are scoped to the run's chapter (see CHAPTERS in config.js) — the other
    // chapters' natives simply never appear in this run's pool.
    for (const id of CHAPTERS[run.chapter].weapons) {
      if (!ownedIds.has(id) && Math.random() < pNew) {
        const cfg = WEAPONS[id]
        list.push({ kind: 'weapon', id, title: cfg.name, desc: cfg.desc, tag: 'New!', rarity: cfg.rarity, icon: cfg.icon })
      }
    }
  }
  for (const w of run.weapons) {
    if (w.level < MAX_WEAPON_LEVEL) {
      const cfg = WEAPONS[w.id]
      list.push({ kind: 'weapon', id: w.id, title: cfg.name, desc: cfg.desc, tag: `Lv ${w.level + 1}`, rarity: cfg.rarity, icon: cfg.icon })
    }
  }
  return list
}

function eligiblePassiveIds(run) {
  return Object.keys(PASSIVES).filter((id) => (run.passivePicks[id] ?? 0) < MAX_PASSIVE_LEVEL)
}

// Fisher-Yates shuffle in place (used for per-weapon mod candidate fairness below).
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = arr[i]
    arr[i] = arr[j]
    arr[j] = t
  }
  return arr
}

// Weapon-mod candidates: for every OWNED weapon, its WEAPON_MODS entries still under the pick cap
// — as { weapon, mod } pairs (a mod id alone isn't enough to look up its config once mods are
// split per-weapon). Per-weapon fairness (v4.4, see MOD_CANDIDATES_PER_WEAPON): each weapon only
// contributes up to MOD_CANDIDATES_PER_WEAPON of its eligible mods (randomly chosen) so the
// starting/only weapon (star) can't flood every early pool with all 6 of its mods, and no single
// weapon dominates once several are owned. If the combined list still exceeds MOD_POOL_MAX
// (several weapons owned), uniformly sample MOD_POOL_MAX so mods don't crowd out weapon/passive/
// element cards.
function eligibleWeaponModCandidates(run) {
  const candidates = []
  for (const w of run.weapons) {
    const modCfgs = WEAPON_MODS[w.id]
    if (!modCfgs) continue
    const picks = run.weaponModPicks[w.id]
    const owned = Object.keys(modCfgs).filter((modId) => (picks?.[modId] ?? 0) < MAX_WEAPON_MOD_PICKS)
    shuffleInPlace(owned)
    for (const modId of owned.slice(0, MOD_CANDIDATES_PER_WEAPON)) candidates.push({ weapon: w.id, mod: modId })
  }
  if (candidates.length <= MOD_POOL_MAX) return candidates

  const pool = candidates.slice()
  const sampled = []
  while (sampled.length < MOD_POOL_MAX && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length)
    sampled.push(pool.splice(idx, 1)[0])
  }
  return sampled
}

// Elements are offered always (no weapon prerequisite), up to their pick cap — but each
// eligible id only joins this level-up's pool with ELEMENT_CARD_WEIGHT probability (rolled
// once here, shared by all 3 card slots below), making them rarer than weapons/passives/mods.
function eligibleElementIds(run) {
  const weight = Math.min(1, ELEMENT_CARD_WEIGHT * run.mods.elementWeightMul)
  return Object.keys(ELEMENTS)
    .filter((id) => (run.elementPicks[id] ?? 0) < MAX_ELEMENT_PICKS)
    .filter(() => Math.random() < weight)
}

// A passive card adopts whatever rarity was rolled for its slot.
function makePassiveCard(run, id, rarity) {
  const cfg = PASSIVES[id]
  const mult = RARITIES[rarity].mult
  let bonus = cfg.base * mult
  if (cfg.kind === 'flat') bonus = Math.round(bonus * 10) / 10
  const picks = run.passivePicks[id] ?? 0
  const desc = cfg.kind === 'pct'
    ? `+${Math.round(bonus * 100)}% ${cfg.desc}`
    : `+${bonus} ${cfg.desc}`
  return { kind: 'passive', id, title: cfg.name, desc, tag: `Lv ${picks + 1}`, rarity, icon: '💪', bonus }
}

// A weapon-mod card adopts whatever rarity was rolled for its slot, same as passives.
// flat mods round to a whole extra unit (min 1); pct mods are additive %; tier mods look up a
// per-rarity bonus instead of rarityMult (see WEAPON_MOD_TIER_BONUS in config.js — keeps
// per-cast entity counts from spiraling). tag names the owning weapon; id stays globally
// unique across weapons (see WEAPON_MODS in config.js) so pickedIds dedup still works untouched.
function makeWeaponModCard(run, weaponId, modId, rarity) {
  const cfg = WEAPON_MODS[weaponId][modId]
  const mult = RARITIES[rarity].mult
  let bonus
  if (cfg.kind === 'tier') bonus = WEAPON_MOD_TIER_BONUS[rarity]
  else if (cfg.kind === 'flat') bonus = Math.max(1, Math.round(cfg.base * mult))
  else bonus = cfg.base * mult
  const desc = cfg.kind === 'pct'
    ? `+${Math.round(bonus * 100)}% ${cfg.desc}`
    : `+${bonus} ${cfg.desc}`
  return { kind: 'mod', id: modId, weapon: weaponId, title: cfg.name, desc, tag: `${WEAPONS[weaponId].name} upgrade`, rarity, icon: cfg.icon, bonus }
}

// An element card adopts whatever rarity was rolled for its slot, same as passives.
// desc already carries a combo hint (see ELEMENTS in config.js).
function makeElementCard(run, id, rarity) {
  const cfg = ELEMENTS[id]
  const mult = RARITIES[rarity].mult
  const bonus = cfg.base * mult
  const picks = run.elementPicks[id] ?? 0
  return { kind: 'element', id, title: cfg.name, desc: cfg.desc, tag: `Lv ${picks + 1}`, rarity, icon: cfg.icon, bonus }
}

// Roll one card: roll a rarity on the fixed RARITY_WEIGHTS table (no level scaling — see
// config.js), gather candidates at that rarity
// (inherent-rarity weapons + all eligible passives/weapon-mods/elements adopting the roll), and
// walk down RARITY_ORDER if that tier is empty. Excludes ids already used by earlier cards this pool.
function rollCard(run, weaponPool, passiveIds, modCandidates, elementIds, pickedIds, modWeaponCounts) {
  let idx = RARITY_ORDER.indexOf(pickWeighted(RARITY_WEIGHTS))
  while (idx >= 0) {
    const rarity = RARITY_ORDER[idx]
    const options = []
    for (const wc of weaponPool) {
      if (wc.rarity === rarity && !pickedIds.has(wc.id)) options.push(wc)
    }
    for (const pid of passiveIds) {
      if (!pickedIds.has(pid)) options.push(makePassiveCard(run, pid, rarity))
    }
    for (const mc of modCandidates) {
      // Skip if already offered this pool, or its weapon already hit the per-pool card cap
      // (MAX_MODS_PER_WEAPON_PER_POOL) — so one weapon can't monopolize a level-up screen.
      if (pickedIds.has(mc.mod)) continue
      if ((modWeaponCounts.get(mc.weapon) ?? 0) >= MAX_MODS_PER_WEAPON_PER_POOL) continue
      options.push(makeWeaponModCard(run, mc.weapon, mc.mod, rarity))
    }
    for (const eid of elementIds) {
      if (!pickedIds.has(eid)) options.push(makeElementCard(run, eid, rarity))
    }
    if (options.length > 0) return options[Math.floor(Math.random() * options.length)]
    idx--
  }
  return null
}

function buildLevelUpChoices(run) {
  const weaponPool = weaponCandidates(run)
  const passiveIds = eligiblePassiveIds(run)
  const modCandidates = eligibleWeaponModCandidates(run)
  const elementIds = eligibleElementIds(run)

  if (weaponPool.length === 0 && passiveIds.length === 0 && modCandidates.length === 0 && elementIds.length === 0) {
    return [{ kind: 'heal', title: 'Snack Break', desc: 'Heal 30 HP', tag: '', rarity: 'normal', icon: '🍡' }]
  }

  const pickedIds = new Set()
  const modWeaponCounts = new Map() // weaponId -> mod cards already placed this pool (per-weapon cap)
  const cards = []
  // Roll exactly run.choiceSlots cards (2..4, permanently unlocked in the meta shop — see
  // choiceSlots in state.js and sacrificeCost in config.js).
  const slots = run.choiceSlots ?? 2
  for (let i = 0; i < slots; i++) {
    const card = rollCard(run, weaponPool, passiveIds, modCandidates, elementIds, pickedIds, modWeaponCounts)
    if (!card) break
    cards.push(card)
    pickedIds.add(card.id)
    if (card.kind === 'mod') modWeaponCounts.set(card.weapon, (modWeaponCounts.get(card.weapon) ?? 0) + 1)
  }

  if (cards.length === 0) {
    return [{ kind: 'heal', title: 'Snack Break', desc: 'Heal 30 HP', tag: '', rarity: 'normal', icon: '🍡' }]
  }

  // Hard new-weapon apparition floor (see NEW_WEAPON_MIN_RATE in config.js): if the pool has
  // room for a new weapon but none made it into the cards, occasionally force one in so the
  // focus nudge can never fade discovery out entirely.
  const ownedIds = new Set(run.weapons.map((w) => w.id))
  const unowned = CHAPTERS[run.chapter].weapons.filter((id) => !ownedIds.has(id))
  const hasNewCard = cards.some((c) => c.kind === 'weapon' && c.tag === 'New!')
  if (!hasNewCard && unowned.length > 0 && run.weapons.length < MAX_WEAPONS && Math.random() < NEW_WEAPON_MIN_RATE) {
    const id = unowned[Math.floor(Math.random() * unowned.length)]
    const cfg = WEAPONS[id]
    // Swap into the LAST slot — every rolled card is visible now (no purchasable extras), so
    // the guarantee just needs a slot that always exists.
    const slot = cards.length - 1
    cards[slot] = { kind: 'weapon', id, title: cfg.name, desc: cfg.desc, tag: 'New!', rarity: cfg.rarity, icon: cfg.icon }
  }
  return cards
}

function stepLevelUp(run) {
  const p = run.player
  if (p.xp < p.xpNext) return
  // Only one levelup triggers per frame; stepSim won't run again until phase is
  // back to 'playing' (main.js calls applyChoice then flips phase). Leftover xp
  // beyond xpNext is handled by this same check on the next 'playing' frame.
  p.xp -= p.xpNext
  p.level += 1
  p.xpNext = xpForLevel(p.level)
  run.levelUpChoices = buildLevelUpChoices(run)
  run.phase = 'levelup'
  run.events.push({ type: 'levelup' })
}

// Exported for test/sim-test.js only (rarity distribution sanity checks); main.js does
// not use this directly — it just drives stepSim/applyChoice.
export { buildLevelUpChoices }
