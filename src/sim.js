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
  KITE_DROP_MUL, KITE_MIN_SPEED, KITE_AHEAD_ARC,
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
  AERIAL_STRIKE_SPEED_MUL, AERIAL_CLIMB_T, AERIAL_STRIKE_MAX_LIVE,
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
  TRAFFIC_INTERVAL, TRAFFIC_WARN, TRAFFIC_SWEEP, TRAFFIC_LEN, TRAFFIC_W, TRAFFIC_OFFSET, TRAFFIC_SNAP_R,
  TRAFFIC_CAR_LEN, TRAFFIC_CAR_W, TRAFFIC_DMG, TRAFFIC_KB, TRAFFIC_SQUASH, COVER_MIN_R,
  DEBRIS_R, TORNADO_FLING_EVERY, TORNADO_FLING_DMG_FRAC, TORNADO_FLING_SPEED, TORNADO_FLING_RANGE,
  TORNADO_SUCTION_RANGE, TORNADO_SUCTION_PULL, TORNADO_SUCTION_RESIST,
  GEYSER_LAUNCH_KB, GEYSER_STUN, GEYSER_CHAIN_FRAC, GEYSER_CHAIN_FUSE,
  GEYSER_CHAIN_SCATTER_MIN, GEYSER_CHAIN_SCATTER_MAX,
  // v5.4 skies
  STRAFE_STANDOFF, STRAFE_BANK_T, STRAFE_BANK_SPEED_MUL, STRAFE_TELEGRAPH_T, STRAFE_RUN_T, STRAFE_RUN_SPEED_MUL,
  MISSILE_STANDOFF, MISSILE_HOVER_SPEED_MUL, MISSILE_DEADZONE, MISSILE_FIRE_RANGE, MISSILE_REACQUIRE_T, MISSILE_MAX_LIVE, MISSILE_INTERVAL, MISSILE_COUNT,
  MISSILE_GAP, MISSILE_SPEED, MISSILE_TURN, MISSILE_LIFE, MISSILE_R, MISSILE_DMG, MISSILE_BLAST,
  ARTILLERY_INTERVAL, ARTILLERY_FUSE, ARTILLERY_RADIUS, ARTILLERY_DMG, ARTILLERY_LEAD,
  ARTILLERY_ELITE_INTERVAL, ARTILLERY_ELITE_RADIUS, ARTILLERY_ELITE_DMG, ARTILLERY_FIRE_RANGE, SHELL_MAX_LIVE,
  BOMBARDMENT_COUNT, BOMBARDMENT_SPREAD, BOMBARDMENT_FUSE, BOMBARDMENT_RADIUS, BOMBARDMENT_DMG,
  ROAR_STUN, ROAR_RESONANCE_EVERY, TAIL_COLLIDE_R, TAIL_COLLIDE_FRAC, TAIL_COUNTER_CD,
  LOB_SHRAPNEL_DMG_FRAC, LOB_SHRAPNEL_SPEED, LOB_SHRAPNEL_RANGE, LOB_SHRAPNEL_R,
  // v5.8 kaiju redesign (skies crushing + rampage)
  STRUCTURE_KINDS, CRUSH_XP, RAMPAGE_GAIN, RAMPAGE_DECAY, RAMPAGE_DURATION, RAMPAGE_CRUSH_MUL, RAMPAGE_GRACE_T,
  RAMPAGE_SPEED_MUL, RAMPAGE_DMG_MUL, RAMPAGE_FIRE_RATE_MUL,
  // v5.9 top-down region overhaul (skies roads + districts)
  roadAt, nearestCity, districtAt, terrainAt, DISTRICT_STRUCTURE_KINDS, BIOME_BUILD_DENSITY, blockSnap, STRUCTURE_SETBACK,
  // v5.9.2 (per-kind structure radius — see STRUCTURE_RADIUS's doc in config.js)
  STRUCTURE_RADIUS,
  // v5.4 beyond
  BLINK_INTERVAL, BLINK_DIST, BLINK_MIN_DIST, BLINK_CRAWL_SPEED_MUL, BLINK_FX_R,
  PHASE_SOLID_T, PHASE_GHOST_T, PHASE_GHOST_SPEED_MUL,
  LANE_SCROLL_SPEED, LANE_STRAFE_MUL, LANE_LEAK_BEHIND_PX, LANE_LEAK_DMG, laneHalfWidth,
  MARCH_SPEED_MUL, MARCH_SWAY_PX, MARCH_SWAY_RATE, MARCH_HOME_MUL,
  FORMATION_INTERVAL, FORMATION_COLS, FORMATION_AHEAD_MUL, FORMATION_AHEAD_MIN, FORMATION_ROW_PX, LANE_SPAWN_MUL, LANE_CONTACT_MUL,
  REPULSE_CD, REPULSE_RADIUS, REPULSE_FORCE, REPULSE_STUN,
  ROCK_INTERVAL, ROCK_MAX_LIVE, ROCK_MIN_R, ROCK_MAX_R, ROCK_SPEED, ROCK_DRIFT_X, ROCK_SPIN, ROCK_SPREAD_MUL, ROCK_DMG, ROCK_TICK, ROCK_TICK_DMG,
  PULL_BEAM_INTERVAL, PULL_BEAM_T, PULL_BEAM_RANGE, PULL_BEAM_FORCE, PULL_BEAM_DPS,
  SHARD_R, SHARD_RIFT_FUSE, SHARD_RIFT_R, SHARD_RIFT_FRAC,
  SHARD_RECURSE_DMG_FRAC, SHARD_RECURSE_LIFE_FRAC,
  TESSERACT_ARMS, TESSERACT_COLLAPSE_MUL, TESSERACT_COLLAPSE_PULL,
  TESSERACT_FAN_ARC, TESSERACT_FAN_SWEEP, TESSERACT_FAN_RATE,
  // v5.24 The Blank (scripted boss chapter — see stepBossScript)
  BLANK_SCRIPT, BLANK_WAVE_TIMEOUT, BLANK_BOSS_HP, BLANK_BOSS_R, BLANK_BOSS_SPEED, BLANK_BOSS_XP,
  BLANK_STANDOFF_MIN, BLANK_STANDOFF_MAX, BLANK_TRAIL_DT, BLANK_TRAIL_MAX,
  BLANK_READ1_T, BLANK_READ1_K, BLANK_READ1_FUSE, BLANK_READ1_STAGGER, BLANK_READ1_R, BLANK_READ1_DMG,
  BLANK_PASTSEEK_LAG, BLANK_NODE_MAX, BLANK_NODE_T, BLANK_NODE_HP, BLANK_NODE_RING, BLANK_NODE_SLOW,
  BLANK_YANK_T, BLANK_YANK_DIST, BLANK_YANK_DMG, BLANK_SHOT_T, BLANK_SHOT_SPEED, BLANK_SHOT_DMG,
  BLANK_SHOT_R, BLANK_SHOT_LIFE, BLANK_SHOT_TURN, BLANK_STANDOFF_DRIFT_MUL, BLANK_BOSS_DMG,
  BLANK_STANDOFF_CATCHUP_D, BLANK_STANDOFF_CATCHUP_MUL,
  BLANK_READ3_T, BLANK_LEAD, BLANK_BAND_LEN, BLANK_BAND_W, BLANK_BAND_FUSE, BLANK_BAND_T, BLANK_BAND_DPS,
  BLANK_DESPERATE_FRAC, BLANK_DESPERATE_MUL, BLANK_WAKE_DT, BLANK_WAKE_LEN, BLANK_WAKE_W, BLANK_WAKE_T,
  BLANK_WAKE_DPS, BLANK_MEMORY_T, BLANK_RECRUIT_T, BLANK_RECRUIT_N, BLANK_ACCEL_MUL,
  BLANK_BOSS_SPEED_P3, BLANK_PHASE_LEVELS, BLANK_FAN_N, BLANK_FAN_SPREAD, BLANK_FAN_SPEED,
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
  // v5.24: a scripted chapter (The Blank) has no timer victory at all — killing the script's last
  // boss IS the win (see stepBossScript), so the survival clock below never fires there.
  if (!CHAPTERS[run.chapter].scripted && run.time >= RUN_DURATION) {
    run.phase = 'victory'
    run.events.push({ type: 'victory' })
    return
  }

  stepPlayerMovement(run, input, dt)
  stepRegen(run, dt)
  stepRepulse(run, input, dt) // v5.21 lane: the active shove (ticks its cooldown even when unused)
  stepSpawning(run, dt)
  stepStragglers(run)     // v6.0.1 anti-kite: chasers shed behind a runner recycle onto the ring ahead
  if (stepBossScript(run, dt)) return // v5.24 blank: the scripted chapter's ONLY spawner (phase may be 'dead' — P2 yank)
  stepFormations(run, dt) // v5.18 beyond lane: ranks of marchers, alongside the seeking swarm above
  stepEnemyMovement(run, dt)
  stepFlashlightCones(run, dt) // v5.4 undergrowth: elite cones that enrage the swarm (damages nothing)
  stepCurrents(run, dt)   // v5.0 signature mechanic: drift field (no-op unless the chapter has one)
  stepBombardment(run, dt) // v5.4 skies signature: rain telegraphed bombs on the player's area
  streamObstacles(run)    // v5.6.13: materialize/drop obstacle cells as the player roams
  stepObstacles(run)      // v5.0: push player/enemies out of this chapter's obstacle field (if any)
  stepCrush(run)          // v5.8 skies kaiju: destroy any structure overlapping the crush radius
  stepRampage(run, dt)    // v5.8 skies kaiju: rampage meter decay/trigger/drain (crush-gated, no-op elsewhere)
  stepTrails(run, dt)     // v5.3 garden: expire dropped pheromone nodes (no-op unless any exist)
  stepWebs(run, dt)       // v5.3 garden: expire spider web slow-zones (no-op unless any exist)

  if (stepRocks(run, dt)) return // v5.21 lane: drifting asteroids (phase may be 'dead')
  if (stepLeaks(run)) return // v5.18 beyond lane: invaders that got past you (phase may be 'dead')
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
  // player stands in any run.webs patch; binding nodes (v5.24 blank P2) publish run._bindSlow from
  // stepBossScript. They STACK via a MIN of the multipliers — the strongest slow wins rather than
  // compounding (documented on WEB_SLOW_MUL in config.js).
  const latchMul = p.slowT > 0 ? LATCH_SLOW_MUL : 1
  let webMul = 1
  if (run.webs && run.webs.length > 0) {
    for (const web of run.webs) {
      const wdx = p.x - web.x, wdy = p.y - web.y
      if (wdx * wdx + wdy * wdy <= web.r * web.r) { webMul = WEB_SLOW_MUL; break }
    }
  }
  const slowMul = Math.min(latchMul, webMul, run._bindSlow ?? 1)
  const rampMul = run.rampageT > 0 ? RAMPAGE_SPEED_MUL : 1   // v5.14, read-time only (see config)
  const speed = p.speed * (1 + run.passives.moveSpeed) * run.mods.playerSpeedMul * slowMul * rampMul

  // v5.18 THE LANE (beyond only — see CHAPTERS.beyond.lane). You do not roam here: you advance up
  // the lane at a fixed rate forever and the joystick gives you nothing but left and right. Because
  // the camera already tracks the player in every chapter, advancing the player IS the auto-scroll —
  // the world slides past while you hold station on screen, for the cost of this branch and nothing
  // else. The forward rate is LANE_SCROLL_SPEED and not `speed`, so move-speed upgrades buy a faster
  // strafe and never a faster scroll.
  // No early return: the lane only changes the three expressions below, so it is folded into them
  // rather than branching past the per-frame ticks at the bottom of this function. (Rev.1 DID
  // return early and re-implemented those ticks, which is the classic trap — the next per-frame
  // player timer someone appends down there would silently never fire in this chapter.)
  const lane = CHAPTERS[run.chapter].lane === true
  p.vx = ix * speed * (lane ? LANE_STRAFE_MUL : 1)
  p.vy = lane ? -LANE_SCROLL_SPEED : iy * speed
  p.x += p.vx * dt
  p.y += p.vy * dt
  // The walls. Clamped to a lane that shrinks to fit a narrow viewport, so a rank spanning the lane
  // is always fully on screen — see laneHalfWidth's doc in config.js for why that is load-bearing.
  if (lane) {
    const hw = laneHalfWidth(run.viewRadius)
    p.x = Math.max(-hw, Math.min(hw, p.x))
  }
  // p.vx/p.vy above ARE the snapshot the skies' artillery flag leads its shells with
  // (ARTILLERY_LEAD). Deliberately input-only: drift/pull forces aren't something a tank can read —
  // and in the lane the forward component is the scroll, which is exactly what a shell should lead.

  p.moving = lane || len > 1e-6   // in the lane you are never stationary
  if (ix > 1e-6) p.facing = 1
  else if (ix < -1e-6) p.facing = -1
  // v5.0: last non-zero move direction as a full angle — render orients the pond tail to it, and
  // the Flagella Whip falls back to it only when no enemy exists to aim at (see fireFlagella).
  // Stays null until the player first moves. In the lane you always face up it, so a weapon with
  // nothing to shoot at fires forward rather than at wherever you last strafed.
  if (lane) p.facingAngle = -Math.PI / 2
  else if (len > 1e-6) p.facingAngle = Math.atan2(iy, ix)

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
  // v5.24: a scripted chapter has NO ordinary spawning — stepBossScript is its only spawner. This
  // one gate also kills the elite cadence: spawnEnemy's elite roll only ever runs from here, and
  // every script spawn passes forceNormal (eliteFlags: [] alone would NOT prevent elites).
  if (CHAPTERS[run.chapter].scripted) return
  // v5.18: in the lane the ranks (stepFormations) are a second, concurrent spawner aimed down the
  // same narrow corridor — the ordinary stream yields so the two together read as pressure rather
  // than a wall. See LANE_SPAWN_MUL.
  const laneMul = CHAPTERS[run.chapter].lane ? LANE_SPAWN_MUL : 1
  run._spawnAcc += spawnRate(run.time) * run.mods.spawnMul * laneMul * dt
  while (run._spawnAcc >= 1 && run.enemies.length < MAX_ALIVE) {
    run._spawnAcc -= 1
    spawnEnemy(run)
  }
}

// -- Formation waves (v5.18, The Beyond's lane) -------------------------------------------------
// The Space Invaders half of this chapter's spawning. Every FORMATION_INTERVAL seconds a RANK
// materialises across the lane ahead of the player: a row of `march` enemies, evenly spaced,
// arriving together so the screen reads as ordered ranks. It runs ALONGSIDE the ordinary
// stepSpawning above, which keeps delivering the seeking swarm — the merge is the point, so
// neither replaces the other.
// The rank is centred on the player's CURRENT x, which is what makes strafing meaningful: a rank
// aimed where you are now is a rank you have to move out of, and moving out of it is the game.
// Wave size rides the existing spawn-rate curve rather than a second difficulty ramp, so a late
// run thickens the ranks with no new tuning surface.
function stepFormations(run, dt) {
  if (!CHAPTERS[run.chapter].lane) return
  run._formationT = (run._formationT ?? FORMATION_INTERVAL) - dt
  if (run._formationT > 0) return
  run._formationT += FORMATION_INTERVAL

  // Extra rows come from the same curve that drives ordinary spawning: 1 row early, up to 3 late.
  const rows = Math.max(1, Math.min(3, Math.round(spawnRate(run.time) * run.mods.spawnMul / 3)))
  const p = run.player
  // Columns are spread across the LANE and anchored to world x, not to the player. That is what
  // makes a strafe a decision: the gaps are always in the same places, so you are choosing which
  // gap to be in rather than watching a wall re-centre on you (which is what rev.1 did).
  const hw = laneHalfWidth(run.viewRadius)
  const pitch = (hw * 2) / FORMATION_COLS
  for (let row = 0; row < rows; row++) {
    // Alternate rows are offset by half a column — a brick pattern, so holding one gap all the way
    // through a multi-row wave never works.
    const offset = (row % 2) * pitch * 0.5
    for (let col = 0; col < FORMATION_COLS; col++) {
      if (run.enemies.length >= MAX_ALIVE) return
      const x = -hw + pitch * (col + 0.5) + offset
      const y = p.y - Math.max(FORMATION_AHEAD_MIN, run.viewRadius * FORMATION_AHEAD_MUL) - row * FORMATION_ROW_PX
      // rosterId: a rank is rank-and-file invaders, never whatever the archetype pool happens to
      // roll. Elites arrive on their own timer through the ordinary spawn path, where they get the
      // chapter's eliteFlags and read as the exception they are.
      spawnEnemy(run, { type: ARCHETYPE_TYPE.normal, x, y, forceNormal: true, rosterId: 'invader' })
    }
  }
}

// -- The boss script (v5.24, The Blank) ---------------------------------------------------------
// The scripted chapter's ONLY spawner and its whole win condition. run.script ({ stage, waveIdx,
// waveT, spawned, bossId } — see state.js) walks BLANK_SCRIPT (config.js): even stages are wave
// blocks, odd stages are boss phases (stage 1/3/5 = phase 1/2/3, one run.enemies entry each so
// every weapon hits it with zero new plumbing).
//   Wave block: 3 discrete ring-burst waves, each tagged e._wave. The next wave arrives on clear
//     OR after BLANK_WAVE_TIMEOUT — leftovers linger and stack pressure (they still count against
//     the NEXT wave's clear, which is the point). After the block's last wave: stage++.
//   Boss phase: one antibody spawned through the normal path, then overridden post-spawn (hp/
//     radius/speed/xp pinned by BLANK_BOSS_*, affixes ['anchored'] = knockback/pull immune). It
//     ends ONLY on the boss's death — detected by id-absence from run.enemies on a later frame,
//     same as every kill (kill events carry no id; corpses are filtered at stepWeapons' tail).
//     Death of the LAST phase IS the victory; no timer victory exists here (see stepSim's gate).
// The boss learns you — past, present, future, one read per phase:
//   P1 reads your PAST: run.trail (sampled every BLANK_TRAIL_DT below) is periodically detonated —
//     the most recent BLANK_READ1_K points become run.bombs (src:'trail'), fuses staggered so the
//     oldest blows first and the blast chases you along your own path.
//   P2 holds your PRESENT: killable 'bindnode' enemies extruded near the player; while alive they
//     MIN-stack a slow (run._bindSlow, read by stepPlayerMovement next frame — one frame of lag
//     nobody can see) and a node that survives BLANK_YANK_T drags the player toward the boss,
//     spending ALL nodes. Plus slow aimed shots through the existing run.enemyShots machinery.
//   P3 takes your FUTURE: erasure bands (run.strips, look:'erase') pre-fired at the player's
//     extrapolated position (p.vx/vy × BLANK_LEAD), perpendicular to their heading; reads
//     accelerate below BLANK_DESPERATE_FRAC hp (desperation).
// Each phase also drip-recruits its wave minion (BLANK_RECRUIT_*) so AoE builds and the XP economy
// never starve during the duel. All spawns pass forceNormal — no elites exist in this chapter.
// The accelResponse mutator (difficulty 2+, assigned not rolled) shortens every read timer,
// telegraph fuse and the wave timeout by BLANK_ACCEL_MUL.
// @returns true if the run ENDED this frame — the P2 yank can kill (phase 'dead'), and the final
// boss's death wins (phase 'victory'); either way the rest of stepSim must not run.
function stepBossScript(run, dt) {
  if (!CHAPTERS[run.chapter].scripted) return false
  const p = run.player
  const s = run.script
  const accel = run.mutators.includes('accelResponse') ? BLANK_ACCEL_MUL : 1

  // The trail: the ring buffer of recent player positions that P1 detonates and pastSeek probes
  // hunt. Sampled unconditionally so a boss read always has history to work with.
  run._trailT = (run._trailT ?? BLANK_TRAIL_DT) - dt
  if (run._trailT <= 0) {
    run._trailT += BLANK_TRAIL_DT
    run.trail.push({ x: p.x, y: p.y })
    if (run.trail.length > BLANK_TRAIL_MAX) run.trail.shift()
  }

  // Binding-node bookkeeping runs at EVERY stage, not just P2: nodes a dead boss leaves behind
  // keep binding until killed. Ages each node and publishes the MIN-stacked player slow.
  const nodes = []
  for (const e of run.enemies) {
    if (!e._dead && e.rosterId === 'bindnode') { e._bindT = (e._bindT ?? 0) + dt; nodes.push(e) }
  }
  run._bindSlow = BLANK_NODE_SLOW[Math.min(nodes.length, BLANK_NODE_SLOW.length - 1)]

  const block = BLANK_SCRIPT[s.stage]
  if (!block) return false // defensive: past the script's end (victory already fired)

  // ---- Wave block ----
  if (block.waves) {
    run.bossBar = null
    if (!s.spawned) {
      const wave = block.waves[s.waveIdx]
      for (let i = 0; i < wave.n; i++) {
        const e = spawnBlankEnemy(run, wave.ids[i % wave.ids.length])
        if (!e) break // MAX_ALIVE — leftovers already saturate the field
        e._wave = true
      }
      s.spawned = true
      s.waveT = 0
      return false
    }
    s.waveT += dt
    const cleared = !run.enemies.some((e) => e._wave && !e._dead)
    if (!cleared && s.waveT < BLANK_WAVE_TIMEOUT * accel) return false
    if (s.waveIdx < block.waves.length - 1) {
      s.waveIdx++
      s.spawned = false
    } else {
      s.stage++
      s.waveIdx = 0
      s.waveT = 0
      s.spawned = false
    }
    return false
  }

  // ---- Boss phase ----
  const phase = (s.stage >> 1) + 1 // stage 1/3/5 -> phase 1/2/3
  if (!s.spawned) {
    // Through the normal spawn path (ring placement, this chapter's roster skin/flags), then the
    // pinned overrides: the antibody's stats are a fixed per-phase table, not the hpScale curve.
    const e = spawnBlankEnemy(run, block.boss, true)
    e.hp = e.maxHP = BLANK_BOSS_HP[phase - 1] * run.mods.enemyHpMul
    e.radius = BLANK_BOSS_R
    e.speed = phase === 3 ? BLANK_BOSS_SPEED_P3 : BLANK_BOSS_SPEED // P3 has no standoff flag — it chases
    e.dmg = BLANK_BOSS_DMG // contact DOES hurt — standoff keeps it rare, not impossible
    e.xp = BLANK_BOSS_XP
    e.affixes = ['anchored'] // knockback/pull immune — checked by every kb site
    s.bossId = e.id
    s.spawned = true
    // Phase timers, armed fresh per phase. Recruits' first pulse waits a full interval.
    run._read1T = BLANK_READ1_T * accel
    run._nodeT = BLANK_NODE_T * accel
    run._shotT = BLANK_SHOT_T * accel
    run._read3T = BLANK_READ3_T * accel
    run._recruitT = BLANK_RECRUIT_T[phase - 1]
    run.events.push({ type: 'bossSpawn', x: e.x, y: e.y, stage: phase })
    return false
  }

  const boss = run.enemies.find((e) => e.id === s.bossId)
  if (!boss) {
    // The phase entity is gone from run.enemies: it died last frame. Reform — or win.
    run.bossBar = null
    if (s.stage >= BLANK_SCRIPT.length - 1) {
      run.events.push({ type: 'bossDead', x: run._bossX ?? p.x, y: run._bossY ?? p.y })
      run.phase = 'victory'
      run.events.push({ type: 'victory' })
      // End the frame HERE, like the timer victory does: the steps below this one can still hurt
      // the player (a live erasure strip, a leftover recruit), and hurtPlayer would overwrite
      // 'victory' with 'dead' — turning the run's climactic kill into a recorded defeat.
      return true
    } else {
      // A phase kill pays in power, not gems: bank exactly BLANK_PHASE_LEVELS level-ups' worth of
      // xp (current bar to full, then each next level's cost) — stepLevelUp chains the screens one
      // per playing frame, same as any banked-xp overflow.
      p.xp += p.xpNext
      for (let i = 1; i < BLANK_PHASE_LEVELS; i++) p.xp += xpForLevel(p.level + i)
      s.stage++
      s.waveIdx = 0
      s.waveT = 0
      s.spawned = false
      s.bossId = null
    }
    return false
  }

  run._bossX = boss.x // last-known position, for the bossDead event a frame after the corpse
  run._bossY = boss.y // is filtered (the kill event carries no id — see the doc block above)
  run.bossBar = { hp: Math.max(0, boss.hp), max: boss.maxHP, stage: phase }
  let playerDied = false

  if (phase === 1) {
    // P1 — reads your past: detonate the recent trail as staggered bombs, oldest first, so the
    // blast front chases the player along their own path. A turner escapes; a straight-liner dies.
    run._read1T -= dt
    if (run._read1T <= 0) {
      run._read1T += BLANK_READ1_T * accel
      const pts = run.trail.slice(-BLANK_READ1_K) // chronological: index 0 = oldest of the K
      for (let i = 0; i < pts.length; i++) {
        const fuse = BLANK_READ1_FUSE * accel + i * BLANK_READ1_STAGGER
        run.bombs.push({ x: pts[i].x, y: pts[i].y, radius: BLANK_READ1_R, fuse, duration: fuse, dmg: BLANK_READ1_DMG, src: 'trail' })
      }
    }
  } else if (phase === 2) {
    // P2 — holds your present: extrude killable binding nodes near the player. Target-switching
    // discipline is the counterplay — a node that survives BLANK_YANK_T fires the yank.
    run._nodeT -= dt
    if (run._nodeT <= 0) {
      run._nodeT += BLANK_NODE_T * accel
      if (nodes.length < BLANK_NODE_MAX) {
        const a = Math.random() * Math.PI * 2
        const e = spawnBlankEnemy(run, 'bindnode', false, { x: p.x + Math.cos(a) * BLANK_NODE_RING, y: p.y + Math.sin(a) * BLANK_NODE_RING })
        if (e) { e.hp = e.maxHP = BLANK_NODE_HP; e._bindT = 0 }
      }
    }
    if (nodes.some((n) => n._bindT > BLANK_YANK_T)) {
      // The yank: an instant drag toward the boss (clamped to never overshoot it), spending ALL
      // nodes — the punishment resets rather than compounding.
      const dx = boss.x - p.x, dy = boss.y - p.y
      const d = Math.hypot(dx, dy)
      if (d > 1e-6) {
        const drag = Math.min(BLANK_YANK_DIST, d)
        p.x += (dx / d) * drag
        p.y += (dy / d) * drag
      }
      if (hurtPlayer(run, BLANK_YANK_DMG)) playerDied = true
      for (const n of nodes) dealDamage(run, n, n.hp, false)
      run.events.push({ type: 'yank', x: p.x, y: p.y })
    }
    // Slow aimed shots (the existing enemy-projectile machinery — outrunnable, but you're slowed).
    run._shotT -= dt
    if (run._shotT <= 0) {
      run._shotT += BLANK_SHOT_T * accel
      const a = Math.atan2(p.y - boss.y, p.x - boss.x)
      run.enemyShots.push({
        x: boss.x, y: boss.y,
        vx: Math.cos(a) * BLANK_SHOT_SPEED, vy: Math.sin(a) * BLANK_SHOT_SPEED,
        r: BLANK_SHOT_R, dmg: BLANK_SHOT_DMG, life: BLANK_SHOT_LIFE, turnRate: BLANK_SHOT_TURN,
      })
    }
  } else {
    // P3 — takes your future, and comes to collect it: the antibody itself chases (no standoff
    // flag, BLANK_BOSS_SPEED_P3) while pre-firing an erasure CROSS at the extrapolated position
    // (p.vx/vy are stepPlayerMovement's input-only snapshot) — one band across the heading, one
    // along it, so both the straight-ahead escape and the sideline are cut. Feinting — breaking
    // your own pattern — is still the counterplay; now it must be done at a run.
    const desperate = boss.hp < boss.maxHP * BLANK_DESPERATE_FRAC
    run._read3T -= dt
    if (run._read3T <= 0) {
      run._read3T += BLANK_READ3_T * accel * (desperate ? BLANK_DESPERATE_MUL : 1)
      const speed = Math.hypot(p.vx, p.vy)
      const a = speed > 1 ? Math.atan2(p.vy, p.vx) + Math.PI / 2 : Math.random() * Math.PI * 2
      const cx = p.x + p.vx * BLANK_LEAD, cy = p.y + p.vy * BLANK_LEAD
      for (const da of [0, Math.PI / 2]) {
        run.strips.push({
          x: cx, y: cy, angle: a + da,
          len: BLANK_BAND_LEN, w: BLANK_BAND_W, fuse: BLANK_BAND_FUSE * accel, t: BLANK_BAND_T,
          dps: BLANK_BAND_DPS, look: 'erase',
        })
      }
    }
    // Straight aimed fans on the P2 shot timer — no homing (turnRate 0): from a boss already on
    // your heels the threat is the spread, and sidestepping it steers you toward the cross.
    run._shotT -= dt
    if (run._shotT <= 0) {
      run._shotT += BLANK_SHOT_T * accel * (desperate ? BLANK_DESPERATE_MUL : 1)
      const base = Math.atan2(p.y - boss.y, p.x - boss.x)
      for (let i = 0; i < BLANK_FAN_N; i++) {
        const a = base + (i - (BLANK_FAN_N - 1) / 2) * BLANK_FAN_SPREAD
        run.enemyShots.push({
          x: boss.x, y: boss.y,
          vx: Math.cos(a) * BLANK_FAN_SPEED, vy: Math.sin(a) * BLANK_FAN_SPEED,
          r: BLANK_SHOT_R, dmg: BLANK_SHOT_DMG, life: BLANK_SHOT_LIFE, turnRate: 0,
        })
      }
    }
  }

  // Drip recruits: the current phase's wave minion, so the field is never bare during the duel.
  // P3's pulse is fast and mixed (see BLANK_RECRUIT_T/N) — an endless xp faucet for the build
  // that can't burn 3800 hp down fast, so the duel stalls into farming, never into a wall.
  run._recruitT -= dt
  if (run._recruitT <= 0) {
    run._recruitT += BLANK_RECRUIT_T[phase - 1]
    const rids = [['probe'], ['binder'], ['probe', 'eraser', 'binder']][phase - 1]
    for (let i = 0; i < BLANK_RECRUIT_N[phase - 1]; i++) spawnBlankEnemy(run, rids[i % rids.length])
  }
  return playerDied
}

// Spawn one blank-roster enemy by id through the normal spawnEnemy path — never elite, base stats
// from its roster archetype, default ring placement unless opts gives (x,y) — and return it (spawnEnemy
// exposes the spawn only as the run.enemies tail, same as the spawner elite flag reads it). Returns
// null at MAX_ALIVE, EXCEPT for the boss (essential = true): a script whose boss never arrives
// soft-locks the chapter, so the antibody ignores the cap the way nothing else does.
function spawnBlankEnemy(run, rosterId, essential = false, opts = {}) {
  if (!essential && run.enemies.length >= MAX_ALIVE) return null
  const roster = CHAPTERS[run.chapter].roster.find((r) => r.id === rosterId)
  spawnEnemy(run, { type: ARCHETYPE_TYPE[roster.archetype], forceNormal: true, rosterId, ...opts })
  const e = run.enemies[run.enemies.length - 1]
  // Re-pin hp/speed WITHOUT hpScale/speedCreep: those curves ramp toughness against the 300s
  // survival clock, but a scripted fight has no clock — its difficulty is the ladder's job, and a
  // slow clear must not quietly toughen wave 7 against the player who most needs it not to.
  const base = ENEMIES[ARCHETYPE_TYPE[roster.archetype]]
  e.hp = e.maxHP = base.hp * (roster.hpMul ?? 1) * run.mods.enemyHpMul
  e.speed = base.speed * (roster.speedMul ?? 1) * run.mods.enemySpeedMul
  return e
}

// -- The line (v5.18, The Beyond's lane) --------------------------------------------------------
// "They must not pass." A marcher that gets LANE_LEAK_BEHIND_PX behind the player has got through:
// it costs LANE_LEAK_DMG and leaves. Without this the lane has no stakes at all — you would simply
// out-scroll every rank, since the player advances faster than a marcher descends, and the whole
// formation would be scenery you drive past.
// Only `march` enemies leak. The seeking swarm chases you and is therefore never "behind" in any
// meaningful sense; killing it is its own reward and letting it live is its own punishment.
// @returns true if the player died this frame (phase set to 'dead').
// Repulsion (v5.21, lane chapters). An active, cooldown-gated shove — the lane's answer to its own
// strafe-only constraint, where a rank converging on your column is otherwise a situation with no
// positional out. Pushes and stuns; deals NO damage (see REPULSE_CD's block in config.js for why).
// The cooldown ticks unconditionally so it recovers while you are busy, and `input.skill` is an
// edge-triggered one-shot from input.js — sim never sees a held button, only a press.
function stepRepulse(run, input, dt) {
  if (!CHAPTERS[run.chapter].lane) return
  run.repulseCd = Math.max(0, (run.repulseCd ?? 0) - dt)
  if (!input.skill || run.repulseCd > 0) return
  run.repulseCd = REPULSE_CD
  const p = run.player
  run.events.push({ type: 'repulse', x: p.x, y: p.y, r: REPULSE_RADIUS })
  const radSq = REPULSE_RADIUS * REPULSE_RADIUS
  for (const e of run.enemies) {
    if (e._dead) continue
    const dx = e.x - p.x, dy = e.y - p.y
    const dsq = dx * dx + dy * dy
    if (dsq > radSq) continue
    const d = Math.sqrt(dsq)
    // Dead centre has no direction to push along; shove it up-lane rather than picking a random one,
    // so an enemy sitting exactly on the player still goes the way everything else does.
    const ux = d > 1e-6 ? dx / d : 0
    const uy = d > 1e-6 ? dy / d : -1
    const falloff = 1 - d / REPULSE_RADIUS
    e.kb.x += ux * REPULSE_FORCE * falloff
    e.kb.y += uy * REPULSE_FORCE * falloff
    e.stunT = Math.max(e.stunT || 0, REPULSE_STUN)
  }
}

// Asteroids (v5.21, lane chapters). Neutral drifting hazard: hurts the player on contact AND grinds
// any enemy overlapping it. Not destructible — see ROCK_INTERVAL's block in config.js.
// Returns true if the player died, matching stepLeaks/stepContactDamage's contract.
function stepRocks(run, dt) {
  if (!CHAPTERS[run.chapter].lane) return false
  const p = run.player
  run._rockAcc = (run._rockAcc ?? ROCK_INTERVAL) - dt
  if (run._rockAcc <= 0) {
    run._rockAcc += ROCK_INTERVAL
    if (run.rocks.length < ROCK_MAX_LIVE) {
      const hw = laneHalfWidth(run.viewRadius) * ROCK_SPREAD_MUL
      run.rocks.push({
        x: -hw + Math.random() * hw * 2,
        y: p.y - Math.max(FORMATION_AHEAD_MIN, run.viewRadius * FORMATION_AHEAD_MUL),
        r: ROCK_MIN_R + Math.random() * (ROCK_MAX_R - ROCK_MIN_R),
        vx: (Math.random() - 0.5) * 2 * ROCK_DRIFT_X,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 2 * ROCK_SPIN,
        _acc: 0,
      })
    }
  }
  let died = false
  for (const rk of run.rocks) {
    rk.x += rk.vx * dt
    rk.y += ROCK_SPEED * dt
    rk.rot += rk.spin * dt
    rk._acc += dt
    // Grind on the DoT cadence, not per frame: 60 fractional hits a second is unreadable and floods
    // the event stream. One tick per ROCK_TICK reads as a rock chewing through a rank.
    let ticks = 0
    while (rk._acc >= ROCK_TICK) { rk._acc -= ROCK_TICK; ticks++ }
    if (ticks > 0) {
      for (const e of run.enemies) {
        if (e._dead) continue
        const dx = e.x - rk.x, dy = e.y - rk.y
        const rad = rk.r + e.radius
        if (dx * dx + dy * dy > rad * rad) continue
        dealDamage(run, e, ROCK_TICK_DMG * ticks, false)
      }
    }
    if (died) continue
    const pdx = p.x - rk.x, pdy = p.y - rk.y
    const prad = rk.r + PLAYER.radius
    if (pdx * pdx + pdy * pdy <= prad * prad && p.invuln <= 0) {
      run.events.push({ type: 'rockhit', x: rk.x, y: rk.y })
      if (hurtPlayer(run, ROCK_DMG)) died = true
    }
  }
  // Drop rocks once they are well behind — same threshold a leaked marcher uses.
  run.rocks = run.rocks.filter((rk) => rk.y < p.y + LANE_LEAK_BEHIND_PX + rk.r)
  return died
}

function stepLeaks(run) {
  if (!CHAPTERS[run.chapter].lane) return false
  const p = run.player
  for (const e of run.enemies) {
    if (e._dead) continue
    if (!e.flags || !e.flags.includes('march')) continue
    if (e.y < p.y + LANE_LEAK_BEHIND_PX) continue
    e._dead = true
    run.events.push({ type: 'leak', x: e.x, y: e.y })
    // THE INVULNERABILITY GATE, and it has to be HERE rather than inside hurtPlayer: hurtPlayer
    // SETS p.invuln but never CHECKS it — every caller does its own gating (stepContactDamage's is
    // the model). Rev.1 of this function omitted the check and looped, so a rank arriving together
    // removed FORMATION_COLS x LANE_LEAK_DMG in a single frame out of 100 max HP, and the chapter
    // killed the player in 15 seconds without an enemy ever touching them.
    if (p.invuln > 0) continue
    if (hurtPlayer(run, LANE_LEAK_DMG)) return true
  }
  return false
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
  // v5.18: opts.rosterId forces a specific roster entry (stepFormations uses it to spawn rank
  // invaders), and `formationOnly` entries are invisible to the ordinary random pick — they exist
  // solely to be summoned by id. Without that exclusion a chapter's marchers get spawned on the
  // ordinary spawn ring too, where a formation enemy makes no sense at all.
  const chapterRoster = CHAPTERS[run.chapter].roster
  const forced = opts.rosterId ? chapterRoster.find((r) => r.id === opts.rosterId) : null
  const rosterPool = chapterRoster.filter((r) => r.archetype === archetype && !r.formationOnly)
  // v6.3: weight (relative share, default 1) + minT (earliest spawn time, default 0) gate the SAME
  // single draw below — an entry not yet eligible by minT is filtered out of the pool first, but
  // if that filter would empty the pool (every candidate still minT-gated) it falls back to the
  // unfiltered pool rather than going silent. Weighted pick with all weights=1 selects the exact
  // same index as the old plain `Math.floor(Math.random() * n)` for the same draw (see git history
  // for the proof) — so every pre-v6.3 roster is bit-identical under this rewrite.
  const eligiblePool = rosterPool.filter((r) => (r.minT ?? 0) <= run.time)
  const pool = eligiblePool.length > 0 ? eligiblePool : rosterPool
  let roster = forced
  if (!roster && pool.length > 0) {
    let t = Math.random() * pool.reduce((s, r) => s + (r.weight ?? 1), 0)
    roster = pool.find((r) => (t -= r.weight ?? 1) <= 0) ?? pool[pool.length - 1]
  }

  let x, y
  if (opts.x !== undefined && opts.y !== undefined) {
    x = opts.x; y = opts.y
  } else {
    // v5.18: EVERYTHING ARRIVES FROM AHEAD IN THE LANE. The ring spawn below is written for a
    // chapter you can run away from in any direction; in a strafe-only lane it is unsurvivable by
    // construction. The player's only forward option is LANE_SCROLL_SPEED (70), every seeker in the
    // game is faster than that (drone 90, wisp 165), and sideways is the one axis you can move on —
    // so a swarm spawned BEHIND you closes forever and can never be shaken, no matter how well you
    // play. Spawning up the lane instead makes a seeker something you meet, dodge across, and leave
    // behind: the shmup contract, and the one that makes "you can only strafe" a game rather than a
    // countdown. Anything that does get past you is now genuinely past you.
    if (CHAPTERS[run.chapter].lane) {
      const hw = laneHalfWidth(run.viewRadius)
      x = -hw + Math.random() * hw * 2
      y = p.y - (run.viewRadius + SPAWN_RING)
    } else {
      const angle = Math.random() * Math.PI * 2
      const dist = run.viewRadius + SPAWN_RING
      x = p.x + Math.cos(angle) * dist
      y = p.y + Math.sin(angle) * dist
    }
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

// Anti-kite straggler recycling (v6.0.1, KITE_* in config.js). Nothing in the game outruns the
// player (220 px/s vs a creeped wisp's ~190-237), so a runner who commits to one direction sheds
// every chaser forever and the survival clock wins itself — measured headless: a weaving diagonal
// runner beat body/pond/garden at 92-95% hp without a single level-up. The fix is the genre's own:
// an enemy left beyond KITE_DROP_MUL × spawn distance behind a MOVING player teleports back onto
// the spawn ring, inside KITE_AHEAD_ARC of the heading. Off-screen both before and after, so it's
// invisible; a standing fight (below KITE_MIN_SPEED) never recycles anyone. Lane chapters already
// spawn everything ahead by construction and handle leavers via stepLeaks; the blank is a scripted
// boss duel whose antibody carries catch-up gear — both exempt. Anchored entities never move.
function stepStragglers(run) {
  const ch = CHAPTERS[run.chapter]
  if (ch.lane || ch.scripted) return
  const p = run.player
  if (Math.hypot(p.vx, p.vy) < KITE_MIN_SPEED) return
  const heading = Math.atan2(p.vy, p.vx)
  const spawnD = run.viewRadius + SPAWN_RING
  const dropSq = spawnD * KITE_DROP_MUL * (spawnD * KITE_DROP_MUL)
  for (const e of run.enemies) {
    if (e._dead || (e.affixes && e.affixes.includes('anchored'))) continue
    const dx = e.x - p.x, dy = e.y - p.y
    if (dx * dx + dy * dy < dropSq) continue
    const a = heading + (Math.random() - 0.5) * KITE_AHEAD_ARC
    e.x = p.x + Math.cos(a) * spawnD
    e.y = p.y + Math.sin(a) * spawnD
    e.kb.x = 0
    e.kb.y = 0
  }
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

  // v6.3 AERIAL_STRIKE_MAX_LIVE: one O(n) pre-pass counts aerial enemies already past 'circle'
  // (mark/strike/climb) — then threaded into stepAerialStrike below and incremented THERE on each
  // new circle->mark transition, so the cap self-enforces even when several drones are ready to
  // transition in the very same frame, with no O(n^2) rescanning per enemy.
  let airLiveCount = 0
  for (const e of run.enemies) {
    if (!e._dead && e._airState && e._airState !== 'circle') airLiveCount++
  }

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
    // pastSeek flag (v5.24 blank's probes): hunt where the player WAS — a trail sample
    // BLANK_PASTSEEK_LAG behind the newest (~1.4s ago), falling back to the live player while the
    // trail is still short. Keep moving and a probe forever arrives where you no longer are.
    if (e.flags && e.flags.includes('pastSeek')) {
      const pt = run.trail && run.trail[run.trail.length - 1 - BLANK_PASTSEEK_LAG]
      if (pt) { tx = pt.x; ty = pt.y }
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
      airLiveCount = stepAerialStrike(e, tx, ty, dt, slowMul, enrageMul, airLiveCount)
    } else if (e.flags && e.flags.includes('lineCharge')) {
      stepLineCharge(e, tx, ty, dt, slowMul, enrageMul)
    } else if (e.flags && e.flags.includes('strafe')) {
      stepStrafe(run, e, tx, ty, dt, slowMul, enrageMul)
    } else if (e.flags && e.flags.includes('missileVolley')) {
      stepMissileVolley(run, e, tx, ty, dt, slowMul, enrageMul)
    } else if (e.flags && e.flags.includes('standoff')) {
      stepStandoff(e, tx, ty, dt, slowMul, enrageMul)
    } else if (e.flags && e.flags.includes('march')) {
      stepMarch(e, tx, dt, slowMul, enrageMul)
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

    // wake flag (v5.24 blank's erasers): leaves erasing no-go residue along its path — a short
    // strip dropped every BLANK_WAKE_DT at its position, aligned to its heading, into the shared
    // run.strips array (look:'erase' is render-only; stepStrips damages the player as usual).
    if (e.flags && e.flags.includes('wake') && !e._dead) {
      e._wakeAcc = (e._wakeAcc ?? 0) + dt
      if (e._wakeAcc >= BLANK_WAKE_DT) {
        e._wakeAcc -= BLANK_WAKE_DT
        run.strips.push({
          x: e.x, y: e.y, angle: Math.atan2(ty - e.y, tx - e.x),
          len: BLANK_WAKE_LEN, w: BLANK_WAKE_W, fuse: 0.15, t: BLANK_WAKE_T, dps: BLANK_WAKE_DPS,
          look: 'erase',
        })
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
      // out of range: hold the timer near-ready (same shape as missileVolley's on-station gate) —
      // only tanks close enough to be a visible threat get to shell, however many exist on the map
      if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 > ARTILLERY_FIRE_RANGE * ARTILLERY_FIRE_RANGE ||
          run.bombs.length >= SHELL_MAX_LIVE) {
        e._shellT = Math.max(e._shellT, 0.3)
      } else if (e._shellT <= 0) {
        e._shellT += interval
        run.bombs.push({
          x: p.x + (p.vx ?? 0) * ARTILLERY_LEAD,
          y: p.y + (p.vy ?? 0) * ARTILLERY_LEAD,
          radius: e.elite ? ARTILLERY_ELITE_RADIUS : ARTILLERY_RADIUS,
          fuse: ARTILLERY_FUSE, duration: ARTILLERY_FUSE,
          dmg: e.elite ? ARTILLERY_ELITE_DMG : ARTILLERY_DMG,
          // v5.10.1: explicit discriminator + the firing tank's own position, so render.js can draw
          // the trajectory ghost from the ACTUAL shooter instead of guessing (it used to scan for
          // whichever artillery enemy currently held the globally highest e._shellT, with no range
          // check and no verification that enemy just fired — wrong whenever two tanks fire the same
          // frame, or an idle tank's timer simply outranks the one that genuinely shot).
          src: 'gun', ox: e.x, oy: e.y,
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

// aerialStrike (v5.4, city's patrol drone since v6.3): circle -> mark -> strike -> climb, on
// _airState/_airT/_airAngle/_airTargX/_airTargY. While circling/marking its position is SET on a
// circle around the target (it isn't seeking); the marked point locks at the start of 'mark' (the
// shadow render draws) and 'strike' flies to THAT point without re-aiming. v6.3: AERIAL_UNTOUCHABLE
// is gone — it's hittable and can deal contact damage in every state except 'climb' (a punish
// window: hittable, harmless — see damageImmune/contactHarmless).
// `airLiveCount` (v6.3): threaded in from stepEnemyMovement's pre-pass (count of enemies already
// past 'circle' this frame) and returned back out, incremented on a transition — see
// AERIAL_STRIKE_MAX_LIVE's doc in config.js. Past the cap, a drone ready to mark HOLDS in 'circle'
// (its _airT is left at/below 0 rather than reset, so it rechecks — and can transition — the very
// next frame a slot frees, instead of waiting out a full fresh AERIAL_CIRCLE_T).
function stepAerialStrike(e, tx, ty, dt, slowMul, spdMul, airLiveCount) {
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
      if (e._airState === 'circle') {
        if (airLiveCount < AERIAL_STRIKE_MAX_LIVE) {
          e._airState = 'mark'; e._airT = AERIAL_MARK_T; e._airTargX = tx; e._airTargY = ty
          airLiveCount++
        } // else: hold in 'circle' — cap is full, recheck next frame
      } else { e._airState = 'strike'; e._airT = AERIAL_STRIKE_T }
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
  return airLiveCount
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

// strafe (v5.4 skies' fighter jets): bank -> telegraph -> run, on _strafeState/_strafeT/
// _strafeDirX/_strafeDirY. It never chases — it drifts out to a standoff point on a random
// bearing, locks onto you at the END of the bank, holds that lock through a telegraph beat, then
// flies a straight pass THROUGH you and well beyond. Damages the player only, via ordinary contact
// damage while it passes.
// v5.9.1 bugfix ("jets are unavoidable when they cross the screen", playtest report): the
// 'telegraph' state and its {type:'strafeLock', x, y, angle, len} event are new — before this,
// 'bank' transitioned straight into the fast 'run' with zero warning, so the first thing the player
// saw was contact. STRAFE_TELEGRAPH_T (config.js) mirrors DIVE_TELEGRAPH_T (garden's wasp dive, a
// similarly extreme speed multiplier that already ships with exactly this kind of pause) — 0.5s in
// which the jet HOLDS its locked position (like lineCharge's 'lock' state, stepLineCharge above),
// so the line render draws from strafeLock's (x,y,angle) stays true to where the run actually
// starts. Arithmetic for why 0.5s is enough to dodge: the jet is STRAFE_STANDOFF (420px) from the
// player's locked position when the telegraph starts; the player moves at PLAYER.baseSpeed
// (220px/s), so in 0.5s they can clear up to 110px laterally — over 3x the ~34px (PLAYER.radius +
// jet radius) needed to step clear of the dead-straight line the jet just committed to.
// STRAFE_RUN_SPEED_MUL and contact damage are deliberately left AS-IS: the bug was avoidability,
// not raw power (jet contact dmg is a flat 5, ~5% of PLAYER.baseHP, and jets are ~55% of late
// spawns — WAVE_TABLE, config.js — so any per-hit nerf would be a much bigger difficulty swing than
// this bug calls for; a telegraphed-and-dodgeable pass at the SAME speed is the smaller, more
// surgical fix).
function stepStrafe(run, e, tx, ty, dt, slowMul, spdMul) {
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
      e._strafeState = 'telegraph'; e._strafeT = STRAFE_TELEGRAPH_T
      // len: the nominal (unslowed) distance the 'run' phase below will actually travel — same
      // e.speed*spdMul*STRAFE_RUN_SPEED_MUL this function uses once it gets there — so render's
      // incoming-line length matches the real pass, not a guessed constant.
      const len = e.speed * spdMul * STRAFE_RUN_SPEED_MUL * STRAFE_RUN_T
      run.events.push({ type: 'strafeLock', x: e.x, y: e.y, angle: Math.atan2(ay, ax), len })
    }
  } else if (e._strafeState === 'telegraph') {
    // Holds position — keeps the lock (and the strafeLock event's x/y/angle) true to where the run
    // actually starts, exactly like lineCharge's 'lock' state above.
    if (e._strafeT <= 0) { e._strafeState = 'run'; e._strafeT = STRAFE_RUN_T }
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
  // v5.6.17: hold fire unless ON STATION (within MISSILE_FIRE_RANGE). The timer keeps ticking —
  // a heli that drifts into range mid-cycle fires on its normal cadence, it doesn't alpha-strike.
  // v5.16 BUGFIX: that floor was 0.2s, which broke the promise in the line above in the one way the
  // player can actually see. render.js draws the missile LOCK (designation line + crawling bead +
  // the reticle on you) for the last SKIES_FX.missile.lockT = 0.6s before a volley — so a heli
  // loitering out of range with its timer pinned at 0.2 crossed the boundary ALREADY INSIDE its own
  // telegraph window: the line snapped on two-thirds complete and the rocket left 0.2s later. That
  // is the reported "they fire the very first second they target", and with a whole loitering pack
  // it is a wall of designation lines flicking on at the range edge. The floor must sit ABOVE lockT
  // so entering range always buys the full, honest warning.
  if (d > MISSILE_FIRE_RANGE) { e._volleyT = Math.max(e._volleyT - dt, MISSILE_REACQUIRE_T); e._volleyLeft = 0; return }
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
  if (run.enemyShots.length >= MISSILE_MAX_LIVE) return // sky saturated — hold (see config note)
  const p = run.player
  const angle = Math.atan2(p.y - e.y, p.x - e.x)
  run.enemyShots.push({
    x: e.x, y: e.y,
    vx: Math.cos(angle) * MISSILE_SPEED,
    vy: Math.sin(angle) * MISSILE_SPEED,
    r: MISSILE_R, dmg: MISSILE_DMG, life: MISSILE_LIFE, turnRate: MISSILE_TURN,
  })
}

// march (v5.18, The Beyond's lane): the Space Invaders half. It advances DOWN the lane at a fixed
// fraction of its own speed, shuffling side to side. The sway phase is seeded from the enemy's spawn
// x (not its id and not Math.random), so every invader in a rank spawned across the same row shares
// a phase relationship and the block reads as ONE marching formation rather than a crowd of
// individuals wobbling.
// v5.19: it now also CONVERGES on the player horizontally, but at MARCH_HOME_MUL of its march speed
// — roughly a seventh of the player's strafe. That keeps the original contract intact: a rank is
// still always dodgeable by anyone who commits to a gap (which is what makes LANE_LEAK_DMG a fair
// punishment), it just no longer slides harmlessly past a player who stands still. The homing is
// deliberately x-only; steering the descent too would make ranks converge into a column and destroy
// the formation read.
function stepMarch(e, tx, dt, slowMul, spdMul) {
  if (e._marchPhase === undefined) e._marchPhase = e.x * 0.01
  e._marchPhase += MARCH_SWAY_RATE * dt
  const spd = e.speed * spdMul * MARCH_SPEED_MUL
  e.y += spd * slowMul * dt
  const hx = tx - e.x
  // Deadband: without it a rank sitting on the player's column jitters across it every frame.
  if (Math.abs(hx) > 1) e.x += Math.sign(hx) * spd * MARCH_HOME_MUL * slowMul * dt
  e.x += Math.cos(e._marchPhase) * MARCH_SWAY_PX * MARCH_SWAY_RATE * slowMul * dt
}

// standoff (v5.24 blank's antibody): holds a mid-range distance band instead of chasing — closes
// in beyond BLANK_STANDOFF_MAX, backs off inside BLANK_STANDOFF_MIN, and drifts gently sideways
// while on station (a fixed per-entity orbit direction, so the huge silhouette reads as circling
// rather than jittering). The boss never CHASES — but its body still hurts to touch
// (BLANK_BOSS_DMG): the band keeps contact rare, walking into it is on you.
function stepStandoff(e, tx, ty, dt, slowMul, spdMul) {
  const dx = tx - e.x, dy = ty - e.y
  const d = Math.hypot(dx, dy) || 1
  const spd = e.speed * spdMul * slowMul
  if (d > BLANK_STANDOFF_MAX) {
    const chase = d > BLANK_STANDOFF_CATCHUP_D ? BLANK_STANDOFF_CATCHUP_MUL : 1 // see config: a kited boss pursues
    e.x += (dx / d) * spd * chase * dt
    e.y += (dy / d) * spd * chase * dt
  } else if (d < BLANK_STANDOFF_MIN) {
    e.x -= (dx / d) * spd * dt
    e.y -= (dy / d) * spd * dt
  } else {
    if (e._driftDir === undefined) e._driftDir = Math.random() < 0.5 ? -1 : 1
    e.x += (-dy / d) * e._driftDir * spd * BLANK_STANDOFF_DRIFT_MUL * dt
    e.y += (dx / d) * e._driftDir * spd * BLANK_STANDOFF_DRIFT_MUL * dt
  }
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
  // v5.14: RAMPAGE = INVULNERABLE. Every player-damage path in this file funnels through here
  // (contact, pools, spray strips, snap traps, traffic lanes, enemy shots, pull beams, bombs), so
  // this one guard is the whole feature — and it covers `dot` too, which deliberately bypasses the
  // normal invuln window. Derived from run.rampageT, never assigned onto the player: see
  // RAMPAGE_CRUSH_MUL's doc block in config.js for why that distinction is load-bearing.
  if (run.rampageT > 0) return false
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
        if (e.affixes && e.affixes.includes('anchored')) continue // kb-immune (v5.24: the antibody holds its band even through a revive)
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

// v5.4: is this enemy untouchable right now? A ghosted phase flicker takes NO damage at all —
// dealDamage/applyDamage return before any number, status, crit or death is rolled, so a DoT
// already on them keeps counting down but lands nothing while the window is up. Guarded on the
// state field, so an enemy that never runs the machine is never immune.
// v6.3: the aerialStrike branch that used to sit here (AERIAL_UNTOUCHABLE, 'circle') is DELETED —
// the flag's new home (city's patrol drone) is a ranged chapter, and circling/marking/striking
// drones are ordinary, killable targets there. Only 'climb' keeps any special contact rule, and
// that lives in contactHarmless below (a punish window, not a damage immunity).
function damageImmune(e) {
  if (e._phaseSolid === false) return true
  return false
}

// v5.4: is this enemy harmless to touch right now? The mirror of damageImmune (an enemy that can't
// be hit can't hit you either), plus the phases and statuses that disarm an enemy without making it
// invulnerable: a landed cat and a stalled vacuum are punish windows, and a stunned or fleeing
// enemy isn't attacking anyone.
function contactHarmless(e) {
  if (damageImmune(e)) return true
  // A climbing aerialStrike enemy still can't HURT you. It's peeling away and its strike already
  // had its hit; charging the exit for a second one would just punish the player for standing
  // their ground. v6.3: the AERIAL_UNTOUCHABLE guard that used to gate this is gone — this clause
  // is now UNCONDITIONAL — but the asymmetry it creates survives the flag's removal: 'climb' is a
  // PUNISH window — you can hit it, it can't hit you — the same shape as pounce's 'land' and
  // lineCharge's 'stall' on the next line. 'circle'/'mark'/'strike' are ordinary: hittable AND able
  // to hit you, like any other enemy.
  if (e._airState === 'climb') return true
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

    // crushable flag (v5.14, skies' aircraft): the airframe is not a weapon. Flying into the kaiju
    // destroys the aircraft outright and costs the player NOTHING — no damage, no invuln window
    // spent. Like 'latch' above this sits before the p.invuln gate and `continue`s rather than
    // returning, so a whole flight dies in the frame it is plowed through instead of one per frame.
    if (e.flags && e.flags.includes('crushable')) {
      dealDamage(run, e, e.hp, false)
      continue
    }

    if (p.invuln > 0) return false
    // enrage (v5.4, flashlightCone elites): a lit-up enemy hits harder, not just faster.
    let dmg = (e.enrageT || 0) > 0 ? e.dmg * FLASHLIGHT_DMG_MUL : e.dmg
    if (CHAPTERS[run.chapter].lane) dmg *= LANE_CONTACT_MUL // see LANE_CONTACT_MUL: one axis to dodge on
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
  const k = sig.strength * 0.5 * run.mods.currentForceMul // riptide anomaly turns the field up
  return { fx: fx * k, fy: fy * k }
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
// (body, and tests that blank the field). v5.9.1 bugfix: run._crushed (a Set of cell keys, see
// stepCrush below) permanently excludes an already-crushed cell from ever re-rolling, even across
// many re-scans within the drop radius — see this function's body for why that guard is needed.
// v5.8 kaiju redesign: cfg.cell (CHAPTERS[id].obstacles.cell) overrides the shared OBSTACLE_CELL
// per chapter — skies alone sets it, shrinking to pack structures denser (see config.js). Every
// obstacle also gets a `kind` (one of STRUCTURE_KINDS) from a FIFTH salt on this same pure hash —
// deterministic per cell, consumes nothing from Math.random. v5.9.1 bugfix: for a chapter with a
// district map (run._districtSeed != null, skies only) that salt now picks WITHIN the district-
// appropriate subset (DISTRICT_STRUCTURE_KINDS, config.js) instead of the full list, so a district
// actually reads as itself (no houses at sea) — see run._districtSeed's doc in state.js for why
// reading that field here is still safe for the seeded test suite (drawn once at createRun, same as
// always; reading an EXISTING value costs nothing from the shared Math.random stream at step time).
function obstacleCellHash(i, j, seed, salt) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + seed + Math.imul(salt, 974634923)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function streamObstacles(run) {
  if (run._obstacleSeed == null) return
  const cfg = CHAPTERS[run.chapter].obstacles
  if (!cfg) return
  const roadsOn = !!CHAPTERS[run.chapter].roads // v5.9 skies, v6.3 city — see CHAPTERS.skies.roads' comment
  const p = run.player
  const cs = cfg.cell ?? OBSTACLE_CELL
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
  // The WORLD seed (v5.11): biomes, rivers, cities and roads all derive from this one value, so
  // structure placement can finally agree with the ground it is standing on. null for every chapter
  // without a terrain map, where all the branches below fall back to the old uniform behaviour.
  const worldSeed = run._districtSeed
  const span = Math.ceil(OBSTACLE_STREAM_RADIUS / cs)
  for (let i = ci - span; i <= ci + span; i++) {
    for (let j = cj - span; j <= cj + span; j++) {
      const key = i + ',' + j
      if (live.has(key)) continue
      // v5.9.1 bugfix ("crushed buildings reappear after ~1s", playtest report): a cell whose
      // structure was already crushed THIS RUN never re-rolls, even though stepCrush's splice
      // removes it from `live` above. Before run._crushed existed, ANY cell-boundary crossing (the
      // early-return at the top of this function, ~1.2s apart at PLAYER.baseSpeed/OBSTACLE_CELL)
      // re-triggered a scan that saw the crushed cell missing from `live` and re-rolled the
      // IDENTICAL building right back in from the same pure hash — nothing to do with
      // OBSTACLE_DROP_RADIUS/distance, which is why walking away and back was never required to
      // see it happen.
      if (run._crushed.has(key)) continue
      // v5.9.2 ("the fuck is this?" bug report): a chapter with a district map picks its structure's
      // RADIUS per-kind (STRUCTURE_RADIUS, config.js) instead of one chapter-wide cfg.minR/maxR band
      // — see that table's doc for why (draw size used to be divorced from the collider entirely).
      // Same render.districts gate the kind-subsetting below already uses.
      // v6.3: re-keyed off render.districts explicitly (was run._districtSeed != null) now that
      // roads-only chapters (city) also carry a non-null _districtSeed — city keeps its chapter-
      // wide radius band and its full STRUCTURE_KINDS/dumpster-hydrant-cone pool, never routed to
      // DISTRICT_STRUCTURE_KINDS.
      const perKindRadius = !!CHAPTERS[run.chapter].render?.districts
      let r
      if (!perKindRadius) r = cfg.minR + obstacleCellHash(i, j, seed, 1) * (cfg.maxR - cfg.minR)
      // jitter inside the cell, pulled in by the radius so neighbours can't overlap. `kind` (and so
      // the per-kind radius band) isn't known yet — it's picked from the FINAL (x, y) below, via
      // districtAt — so a perKindRadius cell jitters against cfg.maxR, the chapter's overall largest
      // possible structure, as a conservative worst case: every kind's real r <= this, so nothing
      // can end up more tightly packed than the jitter assumed.
      const slack = Math.max(0, cs / 2 - (perKindRadius ? cfg.maxR : r) - 20)
      let x = (i + 0.5) * cs + (obstacleCellHash(i, j, seed, 2) - 0.5) * 2 * slack
      let y = (j + 0.5) * cs + (obstacleCellHash(i, j, seed, 3) - 0.5) * 2 * slack
      if (Math.hypot(x, y) < cfg.minDist) continue                      // spawn ring stays clear
      if (Math.hypot(x - p.x, y - p.y) > OBSTACLE_STREAM_RADIUS) continue
      // v5.9 top-down region overhaul: keep structures off the streets. roadAt is a pure hash (see
      // config.js) — consumes nothing from Math.random, so this can't shift a seeded test the way
      // an actual draw would (the AA.c/runStarOnly incident, twice — see this function's header
      // comment above). Gated on CHAPTERS[chapter].roads so no other chapter's obstacle field moves.
      // // ponytail: roads key off run._obstacleSeed and districts off run._districtSeed — two
      // independent seeds — so a road strip is NOT aware of which district it's crossing (it clears
      // structures out of a sea district exactly as readily as downtown). Still harmless in
      // practice (a clear channel through open water just reads as a channel) and unrelated to the
      // v5.9.1 kind fix right below: THAT fix reads _districtSeed to pick which STRUCTURE survives
      // in a cell, this ponytail is about the STREET GRID's own shape, and nothing depends on the
      // two agreeing. _districtSeed being promoted to a real sim contract (see below) doesn't change
      // this call — revisit only if roads ever need to read as district-aware (e.g. no roads carved
      // into open sea).
      // v5.11: roads are queried on the WORLD seed (run._districtSeed), not run._obstacleSeed. The
      // old two-seed split is gone along with the global lattice — see config.js's roadAt re-export
      // for the full account, and note that this retires the standing ponytail here about a street
      // grid being unaware of the district it crosses. It is aware now, because a street only exists
      // where a city put it, and cities are placed by consulting the terrain.
      if (roadsOn && roadAt(x, y, worldSeed).onRoad) continue

      // v5.11 DENSITY IS A PROPERTY OF THE PLACE. The base probability here works out to 1.06 at the
      // skies numbers, i.e. >= 1, so before this every single cell in the streamed disc built a
      // structure — a pier every 260px across open ocean at exactly the same spacing as towers
      // downtown. That is the "no building" half of the playtest report: a city cannot read as dense
      // when nothing else is sparse. BIOME_BUILD_DENSITY (terrain.js) scales the roll per biome, so
      // downtown saturates, farmland thins to about a third, and the desert is nearly bare.
      // terrainAt returns biome AND urban together, so the continuous falloff below costs no extra
      // field evaluation over the districtAt call it replaces.
      const terr = worldSeed != null ? terrainAt(x, y, worldSeed) : null
      const biome = terr ? terr.biome : null
      let density = biome ? (BIOME_BUILD_DENSITY[biome] ?? 1) : 1
      // v6.3: cfg.densityFloor (city only) clamps the effective density from BOTH below — before
      // AND after the urban falloff — so the sprawl never visibly runs out anywhere in the field.
      // A per-chapter floor rather than a global one: this table can show a real biome (skies'
      // desert IS meant to go nearly bare), city's floor just can't.
      const floor = cfg.densityFloor ?? 0
      density = Math.max(floor, density)
      // v5.12: a CONTINUOUS falloff across the built-up area. Keying density off the biome alone
      // makes it a step function — every suburb cell builds at exactly the same rate right up to the
      // line where it stops being a suburb, so a town has no edge, it has a border. Real settlement
      // density decays outward, and that decay IS the edge. Downtown is unaffected in practice (its
      // multiplier is already past the per-cell ceiling), so this only thins the fringe, which is
      // where it should be visible.
      if (terr && terr.urban > 0) density *= 0.42 + 0.58 * terr.urban
      density = Math.max(floor, density)
      if (obstacleCellHash(i, j, seed, 0) >= prob * density) continue
      // v5.9.1 bugfix ("houses in the sea", playtest report): kind used to be picked UNIFORMLY
      // across the full STRUCTURE_KINDS list regardless of where the cell sat, so any silhouette
      // (including a house or a tower) could land in open water. When this run has a district map
      // (run._districtSeed != null, skies only), pick from the district-appropriate subset instead
      // (DISTRICT_STRUCTURE_KINDS, config.js) — same hash salt, deterministic, no new RNG draw.
      // Every other chapter (_districtSeed always null there) keeps the old uniform pick across the
      // full list, unchanged.
      // v5.11 BUILDINGS LINE THE STREETS, and the SNAP HAPPENS BEFORE THE KIND IS CHOSEN. In a
      // city a building's position is not where a hash dropped it: it is set back from the kerb and
      // squared to the block. Scattering them freely inside a street grid is what made downtown read
      // as "props sprinkled near some roads" rather than as a built place — the grid said one thing
      // and the buildings said another. blockSnap (terrain.js) pushes the point out of the
      // carriageway to the nearest block interior and returns the city's own grid angle to face it
      // onto the street. Countryside keeps its free scatter, which is correct: a barn in a field
      // answers to nothing.
      //
      // ORDER IS LOAD-BEARING. The first cut picked `kind` at the PRE-snap position and then moved
      // the structure, which let a house chosen in the suburbs be carried across the downtown line
      // and stand there as a house (caught by run CC.d: "expected a 'downtown' cell to hold one of
      // [tower], got 'house'"). A structure has to be the kind appropriate to where it ENDS UP, so
      // the kind and its radius are resolved below, from the FINAL position. The setback therefore
      // cannot use the real radius yet and uses cfg.maxR — the chapter's largest possible structure
      // — as a conservative stand-in, exactly as the cell jitter above already does.
      let rot = 0
      if (worldSeed != null && (biome === 'downtown' || biome === 'suburbs')) {
        const snapped = blockSnap(x, y, worldSeed, cfg.maxR + STRUCTURE_SETBACK)
        if (snapped) {
          // The snap clears the CITY GRID, which is the only geometry it knows about — a highway
          // running through the same city is a separate segment, and pushing a building off a side
          // street can push it onto one. (Caught by run DD.c: one tower in 147 landed on a highway.)
          // Re-checking after the move is both the cheapest and the most honest fix: it is the same
          // predicate the pre-snap gate already used, so "no structure stands on roadway" holds for
          // every road class without blockSnap having to learn about highways at all.
          if (roadsOn && roadAt(snapped.x, snapped.y, worldSeed).onRoad) continue
          x = snapped.x; y = snapped.y; rot = snapped.angle
          // v6.3: re-check the spawn-ring clearance too — blockSnap can shove a structure back into
          // the spawn clearing — city spawns downtown, so this is the common case (also fixes a
          // latent skies bug: the pre-snap minDist check above was already stale once blockSnap moved
          // the point).
          if (Math.hypot(x, y) < cfg.minDist) continue
        }
      }
      // v5.9.1 bugfix ("houses in the sea", playtest report): kind used to be picked UNIFORMLY
      // across the full STRUCTURE_KINDS list regardless of where the cell sat, so any silhouette
      // (including a house or a tower) could land in open water. A chapter with a district map
      // (perKindRadius, skies only — v6.3: NOT run._districtSeed != null, city has one of those too
      // now but keeps the uniform pick) picks from the district-appropriate subset instead
      // (DISTRICT_STRUCTURE_KINDS, config.js) — same hash salt, deterministic, no new RNG draw.
      // Every other chapter keeps the old uniform pick across the full list, unchanged.
      const placedBiome = worldSeed != null ? districtAt(x, y, worldSeed) : null
      const kindRoll = obstacleCellHash(i, j, seed, 4)
      const kinds = perKindRadius
        ? (DISTRICT_STRUCTURE_KINDS[placedBiome] || STRUCTURE_KINDS)
        : STRUCTURE_KINDS
      const kind = kinds[Math.min(kinds.length - 1, Math.floor(kindRoll * kinds.length))]
      // v5.9.2: NOW that kind is known, a perKindRadius cell rolls its real radius from
      // STRUCTURE_RADIUS[kind] (reusing salt 1 — a pure function of (i,j,seed,salt), so calling it
      // here instead of up front changes nothing about determinism). Falls back to the chapter-wide
      // band if a kind is ever missing from the table (defensive, not expected in practice).
      if (perKindRadius) {
        const band = STRUCTURE_RADIUS[kind] || [cfg.minR, cfg.maxR]
        r = band[0] + obstacleCellHash(i, j, seed, 1) * (band[1] - band[0])
      }
      run.obstacles.push({ x, y, r, _cell: key, kind, rot })
      changed = true
    }
  }
  if (changed) run._obstacleRev = (run._obstacleRev || 0) + 1
}

// v5.8 kaiju redesign: both loops used to call Math.hypot(dx,dy) unconditionally and compare it to
// minSep. At skies' new density (2.6x the obstacles, see config.js) the enemy loop alone is
// enemies x obstacles with no spatial index anywhere in sim.js — at MAX_ALIVE 400 that's ~60k
// distance checks/frame. Comparing squared distances skips the sqrt on every non-overlapping pair
// (the overwhelming majority) and only pays for it on the rare branch that actually needs the unit
// normal to push something out. Ships to phones; not optional (design doc §1).
function stepObstacles(run) {
  if (!run.obstacles || run.obstacles.length === 0) return
  // v5.18: in the lane (beyond) the obstacles are PLANETS — distant bodies you scroll past, not
  // terrain you bump into. They collide with nothing, which is both the honest reading of a star
  // system at this scale and a bug fix: the radial push-out below was shoving the player back DOWN
  // the lane on ~10% of frames when they held a strafe into a planet's belly, locally reversing the
  // one thing this chapter guarantees is constant (LANE_SCROLL_SPEED). It also kept marchers from
  // holding rank, since a rank crossing a planet was shoved apart sideways.
  if (CHAPTERS[run.chapter].lane) return
  const p = run.player
  // v5.8 kaiju redesign: crushable structures (CHAPTERS[chapter].crush) don't push the PLAYER —
  // they pop on contact instead (stepCrush, below), so treating them as terrain for the player
  // would fight that: rev.1 of this redesign gave them HP, which turned every structure into a
  // pocket where the player is shoved out just like an enemy is (see CRUSH_XP's doc in config.js
  // for why that was cut). The enemy loop is untouched: buildings stay real terrain for everything
  // that isn't the kaiju.
  if (!CHAPTERS[run.chapter].crush) {
    for (const o of run.obstacles) {
      const dx = p.x - o.x, dy = p.y - o.y
      const minSep = o.r + PLAYER.radius
      const distSq = dx * dx + dy * dy
      if (distSq < minSep * minSep) {
        const d = Math.sqrt(distSq)
        const nx = d > 1e-6 ? dx / d : 1
        const ny = d > 1e-6 ? dy / d : 0
        p.x = o.x + nx * minSep
        p.y = o.y + ny * minSep
      }
    }
  }
  for (const e of run.enemies) {
    if (e._dead) continue
    if (e._phaseSolid === false) continue // v5.4: a ghosted phase flicker passes straight through
    for (const o of run.obstacles) {
      const dx = e.x - o.x, dy = e.y - o.y
      const minSep = o.r + e.radius
      const distSq = dx * dx + dy * dy
      if (distSq < minSep * minSep) {
        const d = Math.sqrt(distSq)
        const nx = d > 1e-6 ? dx / d : 1
        const ny = d > 1e-6 ? dy / d : 0
        e.x = o.x + nx * minSep
        e.y = o.y + ny * minSep
      }
    }
  }
}

// -- Crushing (v5.8 kaiju redesign, skies only) ----------------------------------------
// Gated on CHAPTERS[chapter].crush (see config.js). Any structure whose circle overlaps the
// player's crush radius is destroyed OUTRIGHT this frame — no HP, no per-hit damage, no partial-
// crush state (see CRUSH_XP's doc in config.js for why: a structure with HP would be a shelter
// pocket, not an obstacle). Crush radius is PLAYER.radius normally, widened by RAMPAGE_CRUSH_MUL
// while a rampage is active (run.rampageT > 0, see stepRampage below) — that widened radius is the
// entire rampage payoff.
// v5.9.1 bugfix ("crushed buildings reappear after ~1s", playtest report): every crushed cell key
// is recorded into run._crushed (a Set, state.js) so streamObstacles never re-rolls it, permanently,
// for the rest of the run. This REPLACES an earlier ponytail note that claimed crushed structures
// only came back after walking OBSTACLE_DROP_RADIUS away and back — that reasoning described the
// DROP path (obstacles beyond OBSTACLE_DROP_RADIUS get spliced out too) but the RE-ADD path never
// actually consulted distance at all: streamObstacles only skipped cells still present in `live`,
// and this function's own splice below removes the cell from `live`, so the very next cell-boundary
// scan (~1.2s later at PLAYER.baseSpeed/OBSTACLE_CELL, nowhere near a 1900px walk) re-rolled the
// identical building right back in. The claim was simply wrong, confirmed by playtest.
function stepCrush(run) {
  if (!CHAPTERS[run.chapter].crush) return
  if (!run.obstacles || run.obstacles.length === 0) return
  const p = run.player
  const crushR = PLAYER.radius * (run.rampageT > 0 ? RAMPAGE_CRUSH_MUL : 1)
  let changed = false
  for (let i = run.obstacles.length - 1; i >= 0; i--) {
    const o = run.obstacles[i]
    const dx = p.x - o.x, dy = p.y - o.y
    const minSep = o.r + crushR
    if (dx * dx + dy * dy >= minSep * minSep) continue
    run.obstacles.splice(i, 1)
    run._crushed.add(o._cell) // v5.9.1 bugfix: permanent — see this function's header comment
    changed = true
    run.events.push({ type: 'crush', x: o.x, y: o.y, kind: o.kind })
    run.gems.push({ x: o.x, y: o.y, xp: CRUSH_XP }) // same drop path dealDamage uses for a kill
    run.rampage = Math.min(1, run.rampage + RAMPAGE_GAIN)
    run._rampageGraceT = RAMPAGE_GRACE_T // v5.9.1 bugfix: see stepRampage's own comment below
  }
  // Without this bump render keeps drawing the (now-spliced) obstacle until the next natural cell
  // crossing re-triggers streamObstacles — syncObstacles only rebuilds when _obstacleRev changes
  // (render.js).
  if (changed) run._obstacleRev = (run._obstacleRev || 0) + 1
}

// -- Rampage meter (v5.8 kaiju redesign, skies only) ------------------------------------
// run.rampage (0..1) fills on crush (RAMPAGE_GAIN, see stepCrush above) and otherwise bleeds
// continuously at RAMPAGE_DECAY/s — the decay is the design: a bank filled at leisure rewards
// patience, a streak that bleeds unless you keep wrecking rewards momentum (design doc §3).
// At a full bar, RAMPAGE triggers for RAMPAGE_DURATION s (run.rampageT counts it down) — no other
// effect is applied here; the crush radius widening lives entirely in stepCrush's read of
// rampageT, and player.speed/damageMul are deliberately never touched (see RAMPAGE_CRUSH_MUL's
// doc in config.js for why mutating those would leak on re-trigger or death mid-buff).
// Trigger check runs BEFORE this frame's decay, not after: stepCrush may have just clamped
// run.rampage to exactly 1 this same frame, and decaying first would knock it fractionally under 1
// before the >=1 check ever saw it, silently swallowing the trigger.
// v5.9.1 bugfix ("the meter is unfillable and drains too fast", playtest report): RAMPAGE_GAIN was
// 0.05 (20 crushes to fill) against RAMPAGE_DECAY 0.05/s — a player had to sustain a crush EVERY
// SECOND just to break even, which the density this chapter actually streams (see CHAPTERS.skies.
// obstacles' own arithmetic) never supports. RAMPAGE_GAIN/RAMPAGE_DECAY's doc in config.js derives
// the new numbers from the field's real geometry (structures are ~one per streamed cell, so a
// player weaving through a dense block crushes roughly one every ~1.2s, not one a second) and shows
// the resulting fill time lands in the target 8-15s window. run._rampageGraceT (set by stepCrush on
// every crush) holds off decay for RAMPAGE_GRACE_T s after the LAST crush, so a couple of seconds
// spent crossing a gap between clusters (or dodging an enemy) doesn't quietly erase progress the
// way continuous decay would.
function stepRampage(run, dt) {
  if (!CHAPTERS[run.chapter].crush) return
  if (run.rampageT > 0) {
    // Active: drain the meter to 0 across the buff's OWN duration (not RAMPAGE_DECAY) so the bar
    // visibly empties exactly as the buff runs out, then reset both fields cleanly — no residual
    // rampage carries into the next fill.
    run.rampageT -= dt
    run.rampage = Math.max(0, run.rampage - dt / RAMPAGE_DURATION)
    if (run.rampageT <= 0) { run.rampageT = 0; run.rampage = 0 }
    return
  }
  if (run.rampage >= 1) { run.rampageT = RAMPAGE_DURATION; return }
  if (run._rampageGraceT > 0) { run._rampageGraceT = Math.max(0, run._rampageGraceT - dt); return } // grace: no decay yet
  run.rampage = Math.max(0, run.rampage - RAMPAGE_DECAY * dt)
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

// -- Cover (v6.3 Task 4: telegraphed, destructible, player-only) -----------------------
// The anti-camping valve for the traffic signature's always-crosses-you contract (see TRAFFIC_SNAP_R's
// doc, config.js, for why the lane itself never leaves the player): an obstacle big enough (o.r >=
// COVER_MIN_R — cones don't stop cars) standing between the car and the player takes the hit
// instead, and is destroyed OUTRIGHT for it — the reward is exactly as physical as skies' crush (the
// same {type:'crush'} event/run._crushed permanent-removal path, see stepCrush's doc above; this is
// its second entry point, reused rather than duplicated because the contract — splice, record the
// cell, tell render/audio — is identical).
// Capsule-vs-circle on the car-center(cx,cy) -> player(px,py) segment: `t` clamped STRICTLY inside
// (0.05, 0.95) so an obstacle sitting right under the car, or at/behind the player, never shields —
// cover has to be a genuine screen standing IN BETWEEN, not a technicality. Degenerate segment
// (len2 < 1, car on top of the player) returns null — there is no "between" left to consult.
// Returns the FIRST qualifying obstacle found (run.obstacles is unordered; any legitimate shield is
// as good as any other — there is no "closest" requirement in the design).
function findCover(run, cx, cy, px, py) {
  const dx = px - cx, dy = py - cy
  const len2 = dx * dx + dy * dy
  if (len2 < 1) return null
  for (const o of run.obstacles) {
    if (o.r < COVER_MIN_R) continue
    const t = ((o.x - cx) * dx + (o.y - cy) * dy) / len2
    if (t <= 0.05 || t >= 0.95) continue
    const cxp = cx + dx * t, cyp = cy + dy * t
    const ddx = o.x - cxp, ddy = o.y - cyp
    if (ddx * ddx + ddy * ddy < o.r * o.r) return o
  }
  return null
}

// -- Traffic signature mechanic (v5.4, e.g. city) --------------------------------------
// Lanes (run.lanes, see state.js): while fewer than signature.lanes are alive, a new one is rolled
// every TRAFFIC_INTERVAL seconds — a band at a random angle, offset perpendicular from the player by
// up to ±TRAFFIC_OFFSET so it always CROSSES them but can never be dropped unavoidably on top of
// them. 'warn' telegraphs it harmlessly, then 'sweep' runs a vehicle down it that flattens BOTH
// sides. A no-op unless the chapter's signature is 'traffic'.
// v6.3 Task 4: the sweep branch's player hit first consults findCover (above) — a big enough
// obstacle between the car and the player is destroyed instead of the player being hurt, once per
// lane pass (lane._coverUsed, transient — never set on Z.b's hand-built lane literals, which is
// fine: missing reads as false and those lanes never carry obstacles worth shielding anyway).
// @returns true if the player died this frame (phase set to 'dead').
function stepLanes(run, dt) {
  const sig = CHAPTERS[run.chapter].signature
  if (!sig || sig.type !== 'traffic') return false
  const p = run.player

  const laneEvery = TRAFFIC_INTERVAL * run.mods.trafficIntervalMul // rush-hour anomaly shortens it
  run._laneAcc = (run._laneAcc ?? laneEvery) - dt
  if (run._laneAcc <= 0) {
    run._laneAcc += laneEvery
    if (run.lanes.length < sig.lanes) {
      // v6.3: SAME two draws on every roll, regardless of which tier below fires — only their
      // INTERPRETATION changes with the terrain. See TRAFFIC_SNAP_R's doc block (config.js) for
      // the full three-tier contract and why position never leaves the player.
      const dirRoll = Math.random()
      const offRoll = Math.random()
      const seed = run._districtSeed
      const ra = seed != null ? roadAt(p.x, p.y, seed) : { onRoad: false }
      let x, y, angle
      if (ra.onRoad && ra.dist <= TRAFFIC_SNAP_R) {
        // Tier 1: on/near a road — snap the lane fully onto its centerline. roadAt's `dist` is
        // UNSIGNED, so resolve which side of the player the centerline is on with one extra probe
        // — the same sign-probe trick render.js's populateRoad uses (~6645-6654).
        const px = -Math.sin(ra.angle), py = Math.cos(ra.angle)
        const probe = roadAt(p.x + px * 8, p.y + py * 8, seed)
        const sgn = probe.onRoad && probe.dist < ra.dist ? 1 : -1
        // Perpendicular correction only — the along-axis coordinate stays exactly the player's, so
        // the band's length is centered on them (not merely overlapping): the always-crosses-the-
        // player invariant survives even a full snap onto the road.
        x = p.x + px * sgn * ra.dist
        y = p.y + py * sgn * ra.dist
        angle = ra.angle + (dirRoll < 0.5 ? 0 : Math.PI)
      } else {
        const near = seed != null ? nearestCity(p.x, p.y, seed) : null
        if (near) {
          // Tier 2: off-road but inside a city — angle snaps to the grid; the van jumps the curb
          // and still comes straight for the player via the ordinary crossing offset below.
          const base = dirRoll < 0.25 ? 0 : dirRoll < 0.5 ? Math.PI : dirRoll < 0.75 ? Math.PI / 2 : -Math.PI / 2
          angle = near.city.angle + base
        } else {
          // Tier 3: no world seed, or no city nearby — today's fully-random angle, unchanged.
          angle = dirRoll * Math.PI * 2
        }
        const off = (offRoll * 2 - 1) * TRAFFIC_OFFSET
        x = p.x - Math.sin(angle) * off
        y = p.y + Math.cos(angle) * off // perpendicular offset
      }
      run.lanes.push({
        x, y, angle, len: TRAFFIC_LEN, w: TRAFFIC_W,
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
      // v6.3 Task 4: cover first — see findCover's doc above. lane._coverUsed caps it at one save
      // per lane pass, same spirit as hitIds capping enemy hits below.
      const shield = lane._coverUsed ? null : findCover(run, cx, cy, p.x, p.y)
      if (shield) {
        lane._coverUsed = true // one save per pass — and the car totals the shield
        const idx = run.obstacles.indexOf(shield)
        if (idx >= 0) run.obstacles.splice(idx, 1)
        run._crushed.add(shield._cell) // permanent — streamObstacles must never re-roll this cell
        run.events.push({ type: 'crush', x: shield.x, y: shield.y, kind: shield.kind })
        // Without this bump render keeps drawing the (now-spliced) obstacle until the next natural
        // cell crossing re-triggers streamObstacles — see stepCrush's identical line above.
        run._obstacleRev = (run._obstacleRev || 0) + 1
      } else if (hurtPlayer(run, lane.dmg)) playerDied = true
      // invuln makes "once per pass" implicit either way, the way contact damage does.
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
  const bombardEvery = sig.rate * run.mods.bombardIntervalMul // carpet-barrage anomaly shortens it
  run._bombardAcc = (run._bombardAcc ?? bombardEvery) - dt
  if (run._bombardAcc > 0) return
  run._bombardAcc += bombardEvery
  const p = run.player
  for (let i = 0; i < BOMBARDMENT_COUNT; i++) {
    if (run.bombs.length >= SHELL_MAX_LIVE) break
    const a = Math.random() * Math.PI * 2
    // sqrt = area-uniform: strike density is FLAT across the disc instead of peaking on the player
    const d = Math.sqrt(Math.random()) * BOMBARDMENT_SPREAD
    run.bombs.push({
      x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d,
      radius: BOMBARDMENT_RADIUS, fuse: BOMBARDMENT_FUSE, duration: BOMBARDMENT_FUSE,
      dmg: BOMBARDMENT_DMG,
      src: 'sky',   // v5.10.1: explicit discriminator (render no longer infers this from `duration`)
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
    const a = w.g * (1 - d / w.r) * run.mods.wellForceMul // linear to 0 at the rim; supermassive anomaly turns it up
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
    // v5.18: in the lane (beyond), the lane OWNS the y axis — the player advances at exactly
    // LANE_SCROLL_SPEED and nothing is allowed to change that, or the scroll rate stops being the
    // one predictable thing in the chapter. So an abduction beam drags you sideways only, which is
    // also the only axis you can fight it on. Everywhere else it pulls in both, unchanged.
    if (!CHAPTERS[run.chapter].lane) p.y += (dy / d) * PULL_BEAM_FORCE * dt

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
      // v5.10.1: `src: 'volatile'` lets skies tell this corpse-bomb apart from its own gun/sky bombs
      // (see render.js bombSrc) instead of both falling through the same "else" branch and detonating
      // as a fake lightning strike. Every other chapter's redrawBombs never reads `src` — inert there.
      run.bombs.push({ x: enemy.x, y: enemy.y, radius: VOLATILE_RADIUS, fuse: VOLATILE_FUSE, duration: VOLATILE_FUSE, dmg: VOLATILE_DMG, src: 'volatile' })
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
      run.pools.push({ x: enemy.x, y: enemy.y, r: ACID_R, t: ACID_DUR, dps: ACID_DPS * run.mods.acidPotencyMul }) // v6.2 toxicShock
    }
    // trailFollow flag (v5.3 garden's ants): a dying ant drops a fading pheromone node that other
    // ants follow & accelerate on (see run.trails / stepEnemyMovement). Gated on the chapter's
    // 'pheromones' signature so an ant roster in a non-pheromone chapter simply wouldn't lay trails.
    if (enemy.flags && enemy.flags.includes('trailFollow') && CHAPTERS[run.chapter].signature?.type === 'pheromones') {
      run.trails.push({ x: enemy.x, y: enemy.y, t: PHEROMONE_LIFE * run.mods.pheromoneLifeMul })
    }
    // immuneMemory mutator (v5.24 blank difficulty 3, assigned by the chapter's ladder — never
    // rolled): a slain WAVE enemy leaves brief erasing residue where it died, so clearing a wave
    // point-blank has a cost. Same acidPool shape, but through run.strips with the erase look.
    if (enemy._wave && run.mutators.includes('immuneMemory')) {
      run.strips.push({
        x: enemy.x, y: enemy.y, angle: Math.random() * Math.PI,
        len: BLANK_WAKE_LEN, w: BLANK_WAKE_W, fuse: 0.3, t: BLANK_MEMORY_T, dps: BLANK_WAKE_DPS,
        look: 'erase',
      })
    }
  }
}

/** @returns the final applied damage number (post multiplier/crit), for effects like star blast. */
function applyDamage(run, enemy, baseDmg) {
  if (damageImmune(enemy)) return 0 // v5.4 untouchable window: no crit roll, no elements either
  const p = run.player
  let dmg = baseDmg * p.damageMul * (1 + run.passives.damage) * run.mods.playerDmgMul
    * (run.rampageT > 0 ? RAMPAGE_DMG_MUL : 1)   // v5.14, read-time only (see config)
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
    * (run.rampageT > 0 ? RAMPAGE_FIRE_RATE_MUL : 1)   // v5.14, read-time only (see config)

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
    run.events.push({ type: 'shoot', weapon: 'wave', x: run.player.x, y: run.player.y, maxR: stats.radius }) // v6.2: render draws the ripple train at the cast point
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
  // v5.22 fan mode (lane): spread the arms across a forward ARC rather than a full circle, so every
  // arm covers ground the player is actually driving into. b.angle is the fan's CENTRE here, not the
  // first arm's heading — see fireTesseract.
  if (b.fan) {
    if (arms === 1) return [b.angle]
    for (let i = 0; i < arms; i++) out.push(b.angle - b.fan / 2 + (i / (arms - 1)) * b.fan)
    return out
  }
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
    // Fan mode sweeps like a wiper across a fixed forward heading instead of rotating freely — a
    // full rotation is exactly the behaviour that made this weapon useless in a scrolled level.
    if (b.fan) {
      b._sweepT = (b._sweepT ?? 0) + dt
      b.angle = b.baseAngle + Math.sin(b._sweepT * TESSERACT_FAN_RATE) * TESSERACT_FAN_SWEEP
    } else {
      b.angle += b.rotSpeed * dt
    }

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
    if (stats.knockback) shoveFromPlayer(run, e, stats.knockback) // v6.2 melee parity — roar's idiom
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
      knockback: stats.knockback,
      chain: doubleOn && run._clawRakes % CLAW_DOUBLE_EVERY === 0,
    })
  })
}

// One slash. o = { range, arc, dmg, knockback, chain } — already mod-resolved, so a doubleSlash follow-up can
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
    if (o.knockback) shoveFromPlayer(run, e, o.knockback) // v6.2 melee parity — roar's idiom
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
    run.events.push({ type: 'shriek', x: p.x, y: p.y, radius: stats.radius }) // v6.2: own event — was a generic 'shoot' the render couldn't distinguish
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
  run.events.push({ type: 'blink', x: fromX, y: fromY, tx: b.x, ty: b.y }) // v6.2: the skip is finally visible
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
  // In a lane the forward direction is the ONLY direction that matters, and it is fixed — so the
  // fan is anchored to straight-ahead rather than to aimAngle's nearest-enemy pick, which could
  // (and did) lock onto a straggler already behind the player.
  const lane = CHAPTERS[run.chapter].lane === true
  const baseAngle = lane ? -Math.PI / 2 : aimAngle(run)
  run.beams.push({
    angle: baseAngle, baseAngle, fan: lane ? TESSERACT_FAN_ARC : 0,
    life: stats.duration, duration: stats.duration, dmg: stats.dmg,
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
  // v5.18 THE LANE HAS AN UNLIMITED MAGNET (beyond). Every other chapter lets you walk back over a
  // gem you missed; this one does not — you advance forever and can only strafe, so a gem that ends
  // up behind you is gone for good, and "gone for good" applied to the XP currency means the whole
  // level-up loop quietly stops. Range is therefore infinite here rather than merely generous: a
  // radius large enough to be safe is a radius that is already effectively infinite, and picking a
  // number would only invite it to be wrong on some viewport.
  // magnetSpeed() reads the radius too — at Infinity its distance ramp collapses to 0, so gems fly
  // at the flat near-field 800px/s, comfortably above LANE_SCROLL_SPEED, and always catch up.
  const magnet = CHAPTERS[run.chapter].lane ? Infinity : p.magnet * (1 + run.passives.magnet) * run.mods.magnetMul
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
  // The lane's magnet is already Infinity (see stepPickups) — offering 'Sticky Aura' there is a
  // dead pick that burns a level-up slot doing nothing.
  const lane = CHAPTERS[run.chapter].lane
  return Object.keys(PASSIVES).filter((id) =>
    (run.passivePicks[id] ?? 0) < MAX_PASSIVE_LEVEL && !(lane && id === 'magnet'))
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
// ELEMENTS.desc carries only the combo hint, so the potency the rarity actually bought gets
// prefixed here — same shape as makePassiveCard/makeWeaponModCard, which both build desc from
// bonus. Rounding is display-only: the applied bonus stays exact so the badge can't shift balance.
function makeElementCard(run, id, rarity) {
  const cfg = ELEMENTS[id]
  const mult = RARITIES[rarity].mult
  const bonus = cfg.base * mult
  const picks = run.elementPicks[id] ?? 0
  const desc = `+${Math.round(bonus * 10) / 10} potency — ${cfg.desc}`
  return { kind: 'element', id, title: cfg.name, desc, tag: `Lv ${picks + 1}`, rarity, icon: cfg.icon, bonus }
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
