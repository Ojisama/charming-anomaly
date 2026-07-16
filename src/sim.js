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
  RUN_DURATION, PLAYER, WEAPONS, MAX_WEAPON_LEVEL, MAX_WEAPONS,
  PASSIVES, MAX_PASSIVE_LEVEL, WEAPON_MODS, MAX_WEAPON_MOD_PICKS, WEAPON_MOD_TIER_BONUS, MOD_POOL_MAX,
  MOD_CANDIDATES_PER_WEAPON, MAX_MODS_PER_WEAPON_PER_POOL,
  ELEMENTS, MAX_ELEMENT_PICKS, ELEMENT_CARD_WEIGHT, COMBOS,
  RARITIES, RARITY_ORDER, rarityWeights,
  ENEMIES, ELITE, WAVE_TABLE,
  spawnRate, hpScale, MAX_ALIVE, eliteEveryAt, SPAWN_RING, speedCreepMul,
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

  if (stepContactDamage(run)) return // phase is now 'dead'
  if (stepBombs(run, dt)) return // phase is now 'dead' (volatile-elite death bomb blast)

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

  const speed = p.speed * (1 + run.passives.moveSpeed) * run.mods.playerSpeedMul
  p.x += ix * speed * dt
  p.y += iy * speed * dt

  p.moving = len > 1e-6
  if (ix > 1e-6) p.facing = 1
  else if (ix < -1e-6) p.facing = -1

  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt)
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

// opts: { type, x, y, forceNormal } — lets splitter deaths spawn wisps at a fixed position
// (never elite, but still time-scaled like any other spawn). Called with no opts by the
// normal spawn-timer path in stepSpawning.
function spawnEnemy(run, opts = {}) {
  const isElite = !opts.forceNormal && run.time >= run._nextEliteAt
  if (isElite) run._nextEliteAt += eliteEveryAt(run.time) * run.mods.eliteEveryMul

  const type = opts.type ?? pickWeighted(waveWeights(run.time))
  const base = ENEMIES[type]
  const p = run.player

  let x, y
  if (opts.x !== undefined && opts.y !== undefined) {
    x = opts.x; y = opts.y
  } else {
    const angle = Math.random() * Math.PI * 2
    const dist = run.viewRadius + SPAWN_RING
    x = p.x + Math.cos(angle) * dist
    y = p.y + Math.sin(angle) * dist
  }

  let hp = base.hp * hpScale(run.time) * (isElite ? ELITE.hpMul : 1) * run.mods.enemyHpMul
  const speed = base.speed * speedCreepMul(run.time) * run.mods.enemySpeedMul
  const dmg = base.dmg * (isElite ? ELITE.dmgMul : 1) * run.mods.enemyDmgMul
  const radius = base.radius * (isElite ? ELITE.sizeMul : 1) * run.mods.enemyRadiusMul

  const affixes = isElite ? rollAffixes(run) : []
  if (isElite && affixes.includes('gilded')) hp *= GILDED_HP_MUL

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
    xp: base.xp,
    hitFlash: 0,
    orbCd: 0,
    kb: { x: 0, y: 0 },
    holePull: 0,
    // Elemental status (see ELEMENTS/COMBOS in config.js; ticked by stepStatuses).
    ignite: 0, igniteDps: 0,
    chill: 0, chillSlow: 0, frozen: 0,
    venom: 0, venomT: 0,
    _chillStack: 0, _freezeImmuneT: 0, _shockCd: 0, _comboCd: {},
  })
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

  for (const e of run.enemies) {
    const dx = p.x - e.x, dy = p.y - e.y
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

    if (d > 1e-6 && slowMul > 0) {
      e.x += (dx / d) * e.speed * affixSpeedMul * slowMul * dt
      e.y += (dy / d) * e.speed * affixSpeedMul * slowMul * dt
    }

    e.x += e.kb.x * dt
    e.y += e.kb.y * dt
    e.kb.x *= kbDecay
    e.kb.y *= kbDecay
    if (Math.abs(e.kb.x) < 0.5) e.kb.x = 0
    if (Math.abs(e.kb.y) < 0.5) e.kb.y = 0

    if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt)
    if (e.orbCd > 0) e.orbCd = Math.max(0, e.orbCd - dt)
  }
}

// ---- Contact damage ---------------------------------------------------------------

// Shared player-hit resolution: contact damage and volatile-bomb blasts both apply
// armor + contactDmgTakenMul the same way, set invuln, push 'hurt', and handle death
// identically. @returns true if the player died (phase now 'dead').
function hurtPlayer(run, rawDmg) {
  const p = run.player
  const dmg = Math.max(1, Math.round((rawDmg - run.passives.armor) * run.mods.contactDmgTakenMul))
  p.hp -= dmg
  p.invuln = PLAYER.invulnTime
  run.events.push({ type: 'hurt', dmg })
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

/** @returns true if the player died this frame (phase set to 'dead'). */
function stepContactDamage(run) {
  const p = run.player
  if (p.invuln > 0) return false

  for (const e of run.enemies) {
    const dx = e.x - p.x, dy = e.y - p.y
    const rad = PLAYER.radius + e.radius
    if (dx * dx + dy * dy < rad * rad) {
      return hurtPlayer(run, e.dmg) // one hit per frame; invuln now active either way
    }
  }
  return false
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
  }
}

/** @returns the final applied damage number (post multiplier/crit), for effects like star blast. */
function applyDamage(run, enemy, baseDmg) {
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
  }

  stepBullets(run, dt)
  stepNovas(run, dt)
  stepBoomerangs(run, dt)
  stepMines(run, dt)
  stepHomingShots(run, dt)
  stepHoles(run, dt)
  stepBeams(run, dt)

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
    if (b.life <= 0 || b.pierce <= 0) continue

    let justHit = null
    for (const e of run.enemies) {
      if (b.pierce <= 0) break
      if (e._dead || b.hitIds.has(e.id)) continue
      const dx = e.x - b.x, dy = e.y - b.y
      const rad = b.r + e.radius
      if (dx * dx + dy * dy <= rad * rad) {
        applyDamage(run, e, b.dmg)
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

function spawnNova(run, x, y, maxR, dmg, knockback) {
  run.novas.push({ x, y, r: 0, maxR, dmg, knockback, life: NOVA_LIFE, hit: new Set() })
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

  // Prismatic Split: N extra beams per cast, evenly spread around the circle (2 beams total =
  // 180° apart, 3 = 120°, ...), same stats, all rotating together (same rotSpeed keeps their
  // relative spacing fixed for the whole cast).
  const beamCount = 1 + (run.weaponMods.rainbow?.prismatic ?? 0)
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

function stepBeams(run, dt) {
  const p = run.player
  for (const b of run.beams) {
    b.life -= dt
    if (b.life <= 0) continue
    b.angle += b.rotSpeed * dt

    b.acc += dt
    while (b.acc >= b.tick) {
      b.acc -= b.tick
      // Focus Lens: damage ramps linearly from 1x at cast to (1 + focusBonus)x by the end of
      // the beam's duration, recomputed fresh from elapsed/duration on every tick.
      const focusBonus = b.focusBonus ?? 0
      const elapsed = Math.min(b.duration, b.duration - b.life)
      const dmg = focusBonus > 0 ? b.dmg * (1 + focusBonus * (elapsed / b.duration)) : b.dmg
      const cos = Math.cos(b.angle), sin = Math.sin(b.angle)
      for (const e of run.enemies) {
        if (e._dead) continue
        const dx = e.x - p.x, dy = e.y - p.y
        const along = dx * cos + dy * sin           // distance projected onto the beam axis
        const perp = -dx * sin + dy * cos            // perpendicular distance from the axis
        if (along >= 0 && along <= b.length && Math.abs(perp) < b.width / 2 + e.radius) {
          applyDamage(run, e, dmg)
        }
      }
    }
  }
  run.beams = run.beams.filter((b) => b.life > 0)
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
    for (const id of Object.keys(WEAPONS)) {
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

// Roll one card: pick a rarity weighted by player level, gather candidates at that rarity
// (inherent-rarity weapons + all eligible passives/weapon-mods/elements adopting the roll), and
// walk down RARITY_ORDER if that tier is empty. Excludes ids already used by earlier cards this pool.
function rollCard(run, weaponPool, passiveIds, modCandidates, elementIds, pickedIds, modWeaponCounts) {
  let idx = RARITY_ORDER.indexOf(pickWeighted(rarityWeights(run.player.level)))
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
  const unowned = Object.keys(WEAPONS).filter((id) => !ownedIds.has(id))
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
