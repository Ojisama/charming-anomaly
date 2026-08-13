// Pure simulation. No Pixi/DOM/localStorage — mutates `run` (see state.js) and
// pushes events consumed once per frame by main.js/render.js.
// Contract: see state.js (run shape + events) and config.js (all numbers).
//
// Mutators (v4.0, see MUTATORS/mergeMutatorMods in config.js): run.mods is applied at exactly
// these points, nowhere else —
//   spawnMul            stepSpawning (spawn rate)
//   enemyHpMul/enemySpeedMul/enemyDmgMul/enemyRadiusMul   spawnEnemy (per-enemy stats — dmg also
//                        carries dmgScale(run.time) at spawn; the difficulty damage tax folds
//                        into enemyDmgMul once, at createRun — see difficultyDmgMul in config.js)
//   eliteEveryMul        spawnEnemy (elite cadence step)
//   contactDmgTakenMul   hurtPlayer (contact damage + volatile bomb blasts)
//   playerDmgMul         applyDamage (player-side outgoing damage only, not raw DoT/combo ticks)
//   playerSpeedMul       stepPlayerMovement
//   magnetMul            stepPickups (magnet range)
//   xpMul/coinMul        stepPickups (gem xp / coin value, at pickup time)
//   elementWeightMul     rollCard (multiplies BUCKET_WEIGHTS.element — the level-up pool weight)
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
  MOD_CANDIDATES_PER_WEAPON, maxModsPerWeaponPerPool, WEAPON_RATE_MODS, WEAPON_COUNT_MODS, WEAPON_COUNT_KEYS,
  ELEMENTS, MAX_ELEMENT_PICKS, COMBOS,
  // RARITY_ORDER came back in v7.5 for BLIND_FAITH_FLOOR, and the reason it left still stands:
  // it must NEVER be used to WALK the ladder. A failed roll deflecting onto the next tier is what
  // measured 16.1% legendary in the shim's first draft (F1). The floor only ever REMOVES keys from
  // a weight table and lets pickWeighted renormalise the survivors — it never redirects a roll.
  RARITY_ORDER, RARITIES, RARITY_WEIGHTS, UPGRADE_RARITY,
  BUCKET_WEIGHTS, DEFENSIVE_PASSIVES, WEAPON_UP_WEIGHT, REROLL_RARITY_DECAY, REROLL_RARITY_CAP,
  ANOMALIES, ANOMALY_BASE_WEIGHT, ANOMALY_PITY_PER_SCREEN, ANOMALY_PITY_CAP, ANOMALY_REROLL_MUL, ANOMALY_REROLL_PITY_REFUND,
  MAX_ANOMALIES_PER_RUN, ANOMALY_MIN_LEVEL,
  // v7.2 anomaly slate. Every number these cards use lives in config.js (the standing rule); the
  // trigger sites below read run.anomalies.<id> and reach for the constant, never a literal.
  TIME_DEBT_MUL, TIME_DEBT_XP_MUL, BRITTLE_MAX_HP, BRITTLE_DMG_MUL,
  BERSERK_DURATION, BERSERK_DMG_MUL,
  OVERLOAD_FIRE_MUL, OVERLOAD_DMG_MUL, OVERLOAD_HP_PER_SEC,
  AVARICE_HEAL_CHANCE, AVARICE_HEAL_HP, AVARICE_COIN_DROP_MUL,
  BLOOD_PACT_PER_KILL, BLOOD_PACT_PER_ELITE, BLOOD_MONEY_HP, BLOOD_MONEY_ESCALATION,
  SUBMISSION_ELITE_EVERY_MUL, SUBMISSION_DURATION, SUBMISSION_DMG_FRAC, SUBMISSION_HIT_EVERY,
  SUBMISSION_STRIP_FLAGS,
  STILLNESS_RAMP, STILLNESS_MAX_MUL, MARTYR_DMG_MUL, MARTYR_RADIUS,
  CHAOS_PACT_SPAWN_MUL, CHAOS_PACT_DMG_PER_WAVE, chaosSurgeActive, chaosWavesSurvived,
  ALIGNMENT_POTENCY_MUL, DEADFALL_REARM_MUL, SOY_MILK_FIRE_MUL, SOY_MILK_DMG_MUL, SOY_MILK_CC_MUL,
  WILDFIRE_JUMPS, WILDFIRE_JUMP_R,
  MINIME_INTERVAL, MINIME_LIFE, MINIME_SPEED, MINIME_AGGRO, MINIME_BURST_R, MINIME_BURST_DMG,
  SPECIALIST_FOCUS_MUL, SPECIALIST_OTHER_PENALTY, modPickCap, weaponModPickCount,
  BLIND_FAITH_NO_REROLL, BLIND_FAITH_FLOOR,
  IPECAC_COUNT_MUL, IPECAC_FIRE_MUL,
  ENEMIES, ELITE, WAVE_TABLE,
  spawnRate, hpScale, lateRateFor, dmgScale, maxAliveFor, eliteEveryAt, lateEliteFor, SPAWN_RING, speedCreepMul,
  KITE_DROP_MUL, KITE_MIN_SPEED, KITE_AHEAD_ARC,
  OBSTACLE_CELL, OBSTACLE_STREAM_RADIUS, OBSTACLE_DROP_RADIUS, OBSTACLE_FIELD_RADIUS,
  xpForLevel, GEM_VALUE,
  STAR_LIFE, STAR_R, STAR_FAN, ORB_R, NOVA_LIFE,
  STAR_SPLIT_DMG_FRAC, STAR_SPLIT_BASE_ANGLE, STAR_SPLIT_MAX_SPREAD,
  STAR_CHAIN_RANGE, STAR_CHAIN_DMG_MUL, STAR_CHAIN_EXTRA_LIFE,
  HOLE_CORE_FRAC, HOLE_RIM_PULL_MUL, HOLE_RESIST_CAP, HOLE_SPIRAL_MUL,
  HOLE_CORE_DMG_MUL, HOLE_PULL_DECAY,
  ORBIT_TWIN_RING_RADIUS_FRAC, WAVE_ECHO_DELAY, WAVE_ECHO_DMG_FRAC,
  MINE_CLUSTER_DMG_FRAC, MINE_CLUSTER_RADIUS_FRAC, MINE_CLUSTER_ARM,
  MINE_CLUSTER_SCATTER_MIN, MINE_CLUSTER_SCATTER_MAX, MINE_STUN, HOLE_SINGULARITY_FRAC,
  ORBIT_NOVA_RADIUS, UNDERTOW_VAC_RADIUS_PER_STACK, TSUNAMI_EVERY,
  MINE_CRAWL_SPEED, WISP_NOVA_RADIUS, SWARM_DMG_FRAC, SWARM_LIFE, CRUNCH_DMG_MUL,
  STATUS_TICK, IGNITE_DOT_FRAC, IGNITE_DURATION,
  CHILL_SLOW_BASE, CHILL_SLOW_PER_POTENCY, CHILL_SLOW_CAP, CHILL_DURATION,
  CHILL_STACK_TO_FREEZE, FREEZE_DURATION, FREEZE_IMMUNITY, ELITE_FREEZE_SLOW_MUL,
  SHOCK_ARC_FRAC, SHOCK_RANGE, SHOCK_CD,
  VENOM_MAX_STACKS, VENOM_DURATION, VENOM_DOT_PER_STACK, VENOM_AMP_PER_STACK,
  ELITE_AFFIXES, AFFIX_SECOND_AT, SHIELD_HP_FRAC, SHIELD_DMG_MUL, SPLITTER_COUNT,
  VOLATILE_FUSE, VOLATILE_RADIUS, VOLATILE_DMG, CORE_BLAST_ENEMY_MUL, PACER_RADIUS, PACER_SPEED_MUL,
  FRENZY_HP_FRAC, FRENZY_SPEED_MUL, GILDED_HP_MUL, GILDED_COIN_MUL,
  newWeaponChance, NEW_WEAPON_MIN_RATE,
  REVIVE_HP_FRAC, REVIVE_INVULN, REVIVE_SHOVE_RADIUS, REVIVE_SHOVE_KB, HURT_CAP_FRAC,
  ARCHETYPE_TYPE, TYPE_ARCHETYPE, LATCH_SLOW_T, LATCH_SLOW_MUL,
  SPLIT_CHILD_COUNT, SPLIT_HP_FRAC, SPLIT_RADIUS_FRAC,
  DASH_IDLE_T, DASH_T, DASH_IDLE_SPEED_MUL, DASH_SPEED_MUL,
  ACID_R, ACID_DUR, ACID_DPS, SOAP_INTERVAL, SOAP_R, SOAP_DUR, SOAP_DPS,
  FLAGELLA_CYCLONE_EVERY, BARBED_DMG_MUL, BARBED_DURATION,
  BLOOM_GROW_FRAC, BLOOM_TICK, SPOREBURST_FRAC, BLOOM_SLOW, BLOOM_SLOW_T, TIDE_DMG_BONUS,
  STINGER_R, STINGER_HIVE_EVERY, LURE_STICKY_R, LURE_STICKY_DUR,
  PHEROMONE_LIFE, PHEROMONE_FOLLOW_RADIUS, PHEROMONE_SPEED_MUL,
  DIVE_STANDOFF, DIVE_HOVER_T, DIVE_TELEGRAPH_T, DIVE_T, DIVE_RECOVER_T,
  canCommitFrom, visibleStandoff,
  DIVE_HOVER_SPEED_MUL, DIVE_SPEED_START, DIVE_SPEED_END, DIVE_RECOVER_SPEED_MUL, DIVE_HOVER_DEADZONE,
  WEB_INTERVAL, WEB_R, WEB_DUR, WEB_SLOW_MUL,
  // v5.4 undergrowth
  POUNCE_RANGE, POUNCE_HOLD_SPEED_MUL, POUNCE_AIM_T, POUNCE_AIM_TRACK_T, POUNCE_LEAP_T, POUNCE_LEAP_DIST, POUNCE_LAND_T,
  POUNCE_TRAP_HP_FRAC, AMBUSH_R,
  AERIAL_RADIUS, AERIAL_ORBIT_SPEED, AERIAL_CIRCLE_T, AERIAL_MARK_T, AERIAL_STRIKE_T,
  AERIAL_STRIKE_SPEED_MUL, AERIAL_CLIMB_T, AERIAL_STRIKE_MAX_LIVE,
  FLASHLIGHT_RANGE, FLASHLIGHT_ARC, FLASHLIGHT_SWEEP, FLASHLIGHT_SWEEP_SPEED,
  FLASHLIGHT_ENRAGE_T, FLASHLIGHT_SPEED_MUL, FLASHLIGHT_DMG_MUL,
  SNAP_TRAP_R, SNAP_TRAP_DMG, SNAP_TRAP_REARM,
  CLAW_BASE_CRIT, CLAW_DOUBLE_EVERY, CLAW_DOUBLE_DELAY, CLAW_DOUBLE_DMG_FRAC,
  WEAVE_AMP, WEAVE_FREQ,
  QUILL_R, QUILL_RETALIATE_CD, QUILL_REBOUND_DMG_MUL, QUILL_REBOUND_SPEED_MUL,
  FEAR_SPEED_MUL, FEAR_REFRACTORY, CC_DR_STEP, CC_DR_RECOVER, CC_DR_FLOOR,
  SHRIEK_ECHO_DELAY, SHRIEK_ECHO_DMG_FRAC,
  SHRIEK_SPINE_DMG_FRAC, SHRIEK_SPINE_SPEED, SHRIEK_SPINE_RANGE_MUL,
  // v5.4 city
  LINE_CHARGE_RANGE, LINE_CHARGE_TRACK_SPEED_MUL, LINE_CHARGE_LOCK_T, LINE_CHARGE_T,
  LINE_CHARGE_SPEED_MUL, LINE_CHARGE_STALL_T,
  SPAWNER_INTERVAL, SPAWNER_COUNT, SPAWNER_ARCHETYPE, SPAWNER_SCATTER,
  TRAFFIC_INTERVAL, TRAFFIC_WARN, TRAFFIC_SWEEP, TRAFFIC_LEN, TRAFFIC_W, TRAFFIC_OFFSET, TRAFFIC_SNAP_R,
  TRAFFIC_CAR_LEN, TRAFFIC_CAR_W, TRAFFIC_DMG, TRAFFIC_KB, TRAFFIC_ENEMY_HP_FRAC, TRAFFIC_ROADKILL, COVER_MIN_R,
  MOWER_FIRST_T, MOWER_GAP_MIN, MOWER_GAP_MAX, MOWER_WARN, MOWER_SWEEP, MOWER_LEN, MOWER_W, MOWER_OFFSET,
  MOWER_DECK_LEN, MOWER_DECK_W, MOWER_ENEMY_HP_FRAC, mowerDmgAt, MOWER_KB,
  DEBRIS_R,
  TORNADO_SWEEP_R, TORNADO_RESPACE,
  HYDRANT_LAUNCH_KB, HYDRANT_STUN,
  HYDRANT_SPRAY_FRAC, HYDRANT_IDLE_FRAC, HYDRANT_JET_PUSH, ZONE_MAX_LIVE, HYDRANT_STAGGER, HYDRANT_STREAMS_FALLBACK, HYDRANT_STREAMS_MAX,
  // v5.4 skies
  STRAFE_STANDOFF, STRAFE_BANK_T, STRAFE_BANK_SPEED_MUL, STRAFE_TELEGRAPH_T, STRAFE_RUN_T, STRAFE_RUN_SPEED_MUL,
  MISSILE_STANDOFF, MISSILE_HOVER_SPEED_MUL, MISSILE_DEADZONE, MISSILE_FIRE_RANGE, MISSILE_REACQUIRE_T, MISSILE_MAX_LIVE, MISSILE_INTERVAL, MISSILE_COUNT,
  MISSILE_GAP, MISSILE_SPEED, MISSILE_TURN, MISSILE_LIFE, MISSILE_R, MISSILE_DMG, MISSILE_BLAST,
  ARTILLERY_INTERVAL, ARTILLERY_FUSE, ARTILLERY_RADIUS, ARTILLERY_DMG, ARTILLERY_LEAD,
  ARTILLERY_ELITE_INTERVAL, ARTILLERY_ELITE_RADIUS, ARTILLERY_ELITE_DMG, ARTILLERY_FIRE_RANGE, SHELL_MAX_LIVE,
  BOMBARDMENT_COUNT, BOMBARDMENT_SPREAD, BOMBARDMENT_FUSE, BOMBARDMENT_RADIUS, BOMBARDMENT_DMG,
  ROAR_RESONANCE_EVERY, LASH_COUNTER_CD,
  LASH_PULL_T, LASH_DRAG_FRAC, LASH_DRAG_R, BREATH_CHARGE_T, BREATH_JUMP_DMG_MUL,
  LOB_SHRAPNEL_DMG_FRAC, LOB_SHRAPNEL_SPEED, LOB_SHRAPNEL_RANGE, LOB_SHRAPNEL_R,
  // v5.8 kaiju redesign (skies crushing + rampage)
  STRUCTURE_KINDS, CRUSH_XP, RAMPAGE_GAIN, RAMPAGE_DECAY, RAMPAGE_DURATION, RAMPAGE_CRUSH_MUL, RAMPAGE_GRACE_T,
  RAMPAGE_SPEED_MUL, RAMPAGE_DMG_MUL, RAMPAGE_FIRE_RATE_MUL,
  // v5.9 top-down region overhaul (skies roads + districts)
  roadAt, nearestCity, districtAt, terrainAt, DISTRICT_STRUCTURE_KINDS, BIOME_BUILD_DENSITY, blockSnap, STRUCTURE_SETBACK,
  // v5.9.2 (per-kind structure radius — see STRUCTURE_RADIUS's doc in config.js)
  STRUCTURE_RADIUS,
  // v5.4 beyond
  PHASE_SOLID_T, PHASE_GHOST_T, PHASE_GHOST_SPEED_MUL,
  LANE_SCROLL_SPEED, LANE_STRAFE_MUL, LANE_LEAK_BEHIND_PX, LANE_LEAK_DMG, laneHalfWidth,
  MARCH_SPEED_MUL, MARCH_SWAY_PX, MARCH_SWAY_RATE, MARCH_HOME_MUL,
  FORMATION_INTERVAL, FORMATION_COLS, FORMATION_AHEAD_MUL, FORMATION_AHEAD_MIN, FORMATION_ROW_PX, LANE_SPAWN_MUL, LANE_CONTACT_MUL, laneEarlyMul,
  REPULSE_CD, REPULSE_RADIUS, REPULSE_FORCE, REPULSE_STUN, PULSE_CHARGE_COST, PULSE_RADIUS_AT_FULL, PULSE_FORCE_AT_FULL, darkness, refillSpec, resourceDamageMul,
  ROCK_INTERVAL, ROCK_MAX_LIVE, ROCK_MIN_R, ROCK_MAX_R, ROCK_SPEED, ROCK_DRIFT_X, ROCK_SPIN, ROCK_SPREAD_MUL, ROCK_DMG, ROCK_TICK, ROCK_TICK_DMG,
  PULL_BEAM_INTERVAL, PULL_BEAM_T, PULL_BEAM_RANGE, PULL_BEAM_FORCE, PULL_BEAM_DPS,
  SHARD_R, SHARD_RIFT_FUSE, SHARD_RIFT_W, SHARD_RIFT_FRAC,
  SHARD_RECURSE_DMG_FRAC, SHARD_RECURSE_LIFE_FRAC,
  PULSAR_ARMS, PULSAR_COLLAPSE_MUL, PULSAR_COLLAPSE_PULL,
  PRISM_DMG_MUL, PRISM_LEN_MUL, PRISM_SPREAD, PRISM_FLASH_T, prismLadder,
  PULSAR_FAN_ARC, PULSAR_FAN_SWEEP, PULSAR_FAN_RATE,
  // v7.55 The Surf: the Pincer's held claw (see stepPincerWeapon/stepGuards)
  PINCER_HOLD_FRAC,
  // v5.24 The Blank (scripted boss chapter — see stepBossScript)
  BLANK_SCRIPT, BLANK_WAVE_TIMEOUT, BLANK_BOSS_HP, BLANK_BOSS_R, BLANK_BOSS_SPEED, BLANK_BOSS_XP,
  BLANK_STANDOFF_MIN, BLANK_STANDOFF_MAX, BLANK_TRAIL_DT, BLANK_TRAIL_MAX,
  BLANK_READ1_T, BLANK_READ1_K, BLANK_READ1_FUSE, BLANK_READ1_STAGGER, BLANK_READ1_R, BLANK_READ1_DMG,
  BLANK_PASTSEEK_LAG, BLANK_NODE_MAX, BLANK_NODE_T, BLANK_NODE_HP, BLANK_NODE_RING, BLANK_NODE_SLOW,
  BLANK_YANK_T, BLANK_YANK_DIST, BLANK_YANK_DMG, BLANK_SHOT_T, BLANK_SHOT_N, BLANK_SHOT_SPEED, BLANK_SHOT_DMG,
  BLANK_SHOT_R, BLANK_SHOT_LIFE, BLANK_SHOT_TURN, BLANK_STANDOFF_DRIFT_MUL, BLANK_BOSS_DMG,
  BLANK_STANDOFF_CATCHUP_D, BLANK_STANDOFF_CATCHUP_MUL,
  BLANK_READ3_T, BLANK_LEAD, BLANK_BAND_LEN, BLANK_BAND_W, BLANK_BAND_FUSE, BLANK_BAND_T, BLANK_BAND_DPS,
  BLANK_BAND_GROW,
  BLANK_DESPERATE_FRAC, BLANK_DESPERATE_MUL, BLANK_WAKE_DT, BLANK_WAKE_LEN, BLANK_WAKE_W, BLANK_WAKE_T,
  BLANK_WAKE_DPS, BLANK_MEMORY_T, BLANK_RECRUIT_T, BLANK_RECRUIT_N, BLANK_ACCEL_MUL,
  BLANK_BOSS_SPEED_P3, BLANK_PHASE_LEVELS, BLANK_FAN_N, BLANK_FAN_SPREAD, BLANK_FAN_SPEED,
  // v6.3.1 difficulty pass: 4x HP/faster P1/doubled waves + crossReactive (d2+)/affinityMature (d3)
  BLANK_BOSS_SPEED_P1, BLANK_MAX_ALIVE, BLANK_CATCHUP_MAX, BLANK_WAVE_XP_MUL, BLANK_WAVE_GAP,
  BLANK_XREACT_READ1_MUL, BLANK_XREACT_READ3_K, BLANK_XREACT_STRIDE,
  BLANK_READ1_K_MATURE, BLANK_NODE_MAX_MATURE, BLANK_FAN_N_MATURE,
  BLANK_BAND_ANGLES, BLANK_BAND_ANGLES_MATURE, BLANK_READ3_DESPERATE_MUL,
  // v6.4.2 (owner directive): per-run coin cap
  COIN_CAP_PER_RUN,
  // v6.4.3 (owner directive): opening spawn credit
  SPAWN_OPENING_CREDIT,
  // v6.5.1 (owner directive): enemy separation — no more 100% stacks
  ENEMY_SEP_FRAC, ENEMY_SEP_RESOLVE, ENEMY_SEP_CELL,
  // v6.7.11: the level-up reroll's price ladder — rerollLevelUpChoices owns the whole purchase
  rerollCost,
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
  // TIME DEBT (v7.2) is one line because every consumer already derives from run.time — hpScale,
  // dmgScale, spawnRate, eliteEvery and the victory check below all read it, so inflating the
  // advance compresses the WHOLE run rather than speeding one system up. CHAOS_PACT's cycle reads
  // run.time too, which is why the two cards interact: the beats arrive 1.5x as often in real
  // seconds. Intended, and said on the card.
  if (run.anomalies?.timeDebt) run.time += dt * TIME_DEBT_MUL
  else run.time += dt
  // REAL seconds elapsed, which under TIME DEBT is not run.time. The persistent best-time record
  // reads this: banking run.time let the card claim a 300s survival for 200 real seconds of play,
  // and a death at 200 real seconds recorded as a full run. Every gameplay system deliberately
  // keeps reading run.time — accelerating the whole world IS the card — but a record kept across
  // runs has to be in a unit that means the same thing in all of them.
  run._realTime = (run._realTime ?? 0) + dt
  // v5.24: a scripted chapter (The Blank) has no timer victory at all — killing the script's last
  // boss IS the win (see stepBossScript), so the survival clock below never fires there.
  if (!CHAPTERS[run.chapter].scripted && run.time >= RUN_DURATION) {
    run.phase = 'victory'
    run.events.push({ type: 'victory' })
    return
  }

  if (stepAnomalies(run, dt)) return  // v7.2: OVERLOAD's drain can kill — phase is now 'dead'
  stepPlayerMovement(run, input, dt)
  stepRegen(run, dt)
  stepRepulse(run, input, dt) // v5.21 lane: the active shove (ticks its cooldown even when unused)
  stepSpawning(run, dt)
  stepStragglers(run)     // v6.0.1 anti-kite: chasers shed behind a runner recycle onto the ring ahead
  if (stepBossScript(run, dt)) return // v5.24 blank: the scripted chapter's ONLY spawner (phase may be 'dead' — P2 yank)
  stepFormations(run, dt) // v5.18 beyond lane: ranks of marchers, alongside the seeking swarm above
  stepEnemyMovement(run, dt)
  stepSubmission(run, dt) // SUBMISSION: the loan's clock, and the ally's contact attack
  stepFlashlightCones(run, dt) // v5.4 undergrowth: elite cones that enrage the swarm (damages nothing)
  stepCurrents(run, dt)   // v5.0 signature mechanic: drift field (no-op unless the chapter has one)
  stepTide(run, dt)       // Book 2 surf signature: alternating surge/backwash (no-op elsewhere)
  stepBombardment(run, dt) // v5.4 skies signature: rain telegraphed bombs on the player's area
  streamEddies(run)       // v6.4 pond identity: materialize/drop eddy cells (no-op outside pond)
  streamShafts(run)       // v7.x Book 2: materialize/drop sun-shaft cells (no-op outside The Shelf)
  stepShafts(run)         // ...and DRIFT them; the streamer above only decides existence (see its doc)
  streamSandbars(run)     // Book 2 surf: materialize/drop dry patches (no-op elsewhere)
  stepCharge(run, dt)     // v7.x Book 2: the resource bar (no-op unless the chapter declares one)
  streamTraps(run)        // v6.5 undergrowth identity: materialize/drop snap traps (no-op outside predators)
  streamObstacles(run)    // v5.6.13: materialize/drop obstacle cells as the player roams
  stepEnemySeparation(run) // v6.5.1: push overlapping enemies apart (owner directive: no 100% stacks)
  stepObstacles(run)      // v5.0: push player/enemies out of this chapter's obstacle field (if any) — terrain snaps last and wins

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

  stepMartyr(run)         // v7.2: resolve the anomaly's queued blasts — after every hurtPlayer caller above
  stepGravityWells(run, dt) // v5.4 beyond signature: bend every projectile in flight (damages nothing)
  stepWeapons(run, dt)
  stepStatuses(run, dt)
  stepPickups(run, dt)
  stepLevelUp(run)
}

/** Apply run.levelUpChoices[i] to the run (weapon add/level, passive, heal). */
// `subject` (v7.5) is the weapon the player named on a SUBJECTED anomaly card — SPECIALIST is the
// only one today. Optional, and VALIDATED here rather than trusted: ui.js is the caller, so an
// unvalidated id would let a UI bug (or a console) focus a weapon the run does not own.
export function applyChoice(run, i, subject = null) {
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
      // BRITTLE (v7.2) holds the ceiling for the whole run. Without this the card is repairable:
      // take it for x4 damage, then buy maxHP back to ~110 over five passive picks and keep the
      // multiplier. That is not the run-ender the rarity licence is paying for — the card reads
      // "your max HP BECOMES 1", so it has to stay 1. The pick is not wasted silently: `maxHP` is
      // still recorded in run.passives, so the build sheet shows what was spent.
      if (!run.anomalies?.brittle) {
        p.maxHP += choice.bonus
        // BLOOD PACT blocks the top-up but never the ceiling: the pool grows, you just cannot fill
        // it. That is the card working — "you can never heal again", not "you can never grow".
        healPlayer(run, choice.bonus)
      }
    }
  } else if (choice.kind === 'mod') {
    const mods = run.weaponMods[choice.weapon]
    const picks = run.weaponModPicks[choice.weapon]
    mods[choice.id] = (mods[choice.id] ?? 0) + choice.bonus
    picks[choice.id] = (picks[choice.id] ?? 0) + 1
  } else if (choice.kind === 'element') {
    run.elements[choice.id] = (run.elements[choice.id] ?? 0) + choice.bonus
    run.elementPicks[choice.id] = (run.elementPicks[choice.id] ?? 0) + 1
  } else if (choice.kind === 'anomaly') {
    // No stat growth and no level: an anomaly is a RULE, read at its trigger site elsewhere in
    // sim.js (unstableCores -> rollAffixes). Recording it is also what removes it from every
    // future pool (eligibleAnomalyIds). `??=` because a hand-built run — the probe harness, a
    // test fixture — may predate the field; a missing one must not throw inside the ticker.
    // v7.5: a SUBJECTED anomaly (SPECIALIST) banks the weapon id the player named instead of
    // `true`. Still truthy, so every `run.anomalies?.x` read in this file keeps working unchanged;
    // only the sites that care about WHICH weapon test for a string.
    // The fallback is the FIRST legal subject, not `true`: a caller that forgets to pass one (the
    // probe harness, a test, a UI path that never opened the chooser) must still get a working
    // card rather than a silent no-op that reads as "focused on the weapon named true".
    let banked = true
    if (choice.subjects?.length) {
      const legal = new Set(choice.subjects)
      banked = subject && legal.has(subject) ? subject : choice.subjects[0]
    }
    ;(run.anomalies ??= {})[choice.id] = banked
    applyAnomalyOnTake(run, choice.id)
  } else if (choice.kind === 'heal') {
    healPlayer(run, 30)
  }
}

// ---- Anomalies (v7.2 slate) --------------------------------------------------------------
// An anomaly is a RULE, not a stat, so almost all of them are read at a trigger site. The two
// exceptions are here: a card whose whole effect is a PERMANENT multiplier is applied ONCE, when
// it is taken, onto the same player fields the meta shop writes. Read-time would work too and is
// strictly worse — it puts a branch in the hottest loops in the file to express a constant.
//
// The dividing line is whether the multiplier can change during the run. BRITTLE, OVERLOAD and
// SOY MILK cannot; BERSERK, STILLNESS, CHAOS PACT and BLOOD PACT can, and live in
// anomalyDamageMul below.
function applyAnomalyOnTake(run, id) {
  const p = run.player
  if (id === 'brittle') {
    // Order matters: clamp hp AFTER maxHP, or a player at full HP keeps their old pool and the
    // card is a pure damage buff until the next hit.
    p.maxHP = BRITTLE_MAX_HP
    p.hp = Math.min(p.hp, p.maxHP)
    p.damageMul *= BRITTLE_DMG_MUL
  } else if (id === 'overload') {
    p.fireRateMul *= OVERLOAD_FIRE_MUL
    p.damageMul *= OVERLOAD_DMG_MUL
  } else if (id === 'ipecac') {
    p.fireRateMul *= IPECAC_FIRE_MUL
  } else if (id === 'soyMilk') {
    p.fireRateMul *= SOY_MILK_FIRE_MUL
    p.damageMul *= SOY_MILK_DMG_MUL
    // ...AND ITS CROWD CONTROL IS PRICED THE SAME WAY (v7.17). Without this the card's x5 rate buys
    // five times the knockback, fear, chill and stun for free — measured as a 112px ring nothing
    // crosses (see the CC_DR_* block in config.js). x0.2 here means the trade is honest in control
    // as well as in dps: five times as many applications, each worth a fifth.
    p.ccMul = (p.ccMul ?? 1) * SOY_MILK_CC_MUL
  }
}

// SPECIALIST's named weapon, or null. It is the ONE anomaly that banks a weapon id where every
// other banks `true`, so the string test is load-bearing: a plain truthiness read would compare
// mod candidates against the boolean `true` and focus nothing, silently.
// IPECAC (v7.5): a per-cast count, tripled. Every weapon that HAS a count routes through here, so
// "how much is three of it" is answered in exactly one place. Rounded and floored at 1 so a
// fractional or zero stat can never produce a nonsense loop bound.
function ipecacN(run, n) {
  return run.anomalies?.ipecac ? Math.max(1, Math.round(n * IPECAC_COUNT_MUL)) : n
}

// ...and the angles a MELEE SECTOR sweeps, for the weapons with no count to multiply. Evenly spaced
// over the full circle, which is what makes this a genuine x3 of output rather than a x3 of damage
// on one enemy: overkill eats surplus poured into something already dying and cannot touch a hit
// that landed somewhere else. Callers de-duplicate per cast (one enemy, at most one sector) so a
// weapon whose arc is wider than the spacing — tailLash is 126-169 degrees — cannot quietly become
// the x3 damage card this one was written to replace.
// The RADIAL equivalent of ipecacAngles, for the weapons that are already 360 degrees and so have
// no angle left to spread across. Bands, not one thicker ring: an inner, the original, and an outer.
function ipecacRadii(run, radius) {
  if (!run.anomalies?.ipecac) return [radius]
  return [radius * 0.55, radius, radius * 1.45]
}

function ipecacAngles(run, angle) {
  if (!run.anomalies?.ipecac) return [angle]
  const step = (Math.PI * 2) / IPECAC_COUNT_MUL
  return Array.from({ length: IPECAC_COUNT_MUL }, (_, i) => angle + i * step)
}

function specialistFocus(run) {
  const f = run.anomalies?.specialist
  return typeof f === 'string' ? f : null
}

// ALIGNMENT. Read at the sites that CONSUME potency (ignite, chill, shock arc, venom DoT), never
// banked onto run.elements: potency keeps growing, so a take-time doubling would skip every
// element card picked after the anomaly. The `> 0` guards there test RAW potency — this scales an
// element you own, it never grants one you don't.
const alignmentMul = (run) => (run.anomalies?.alignment ? ALIGNMENT_POTENCY_MUL : 1)

// BLIND FAITH (v7.5): the rarity table with every tier below BLIND_FAITH_FLOOR removed. Handed the
// table the caller was ABOUT to roll on rather than RARITY_WEIGHTS, so the reroll decay and the
// floor compose instead of one silently replacing the other. pickWeighted normalises over whatever
// keys it gets, so removing entries renormalises the rest by construction.
function rarityTableFor(run, base) {
  if (!run.anomalies?.blindFaith) return base
  const floor = RARITY_ORDER.indexOf(BLIND_FAITH_FLOOR)
  const out = {}
  for (const k of Object.keys(base)) if (RARITY_ORDER.indexOf(k) >= floor) out[k] = base[k]
  return out
}

// How many cards this screen deals. BLIND FAITH used to cut this, and it was a no-op at the default
// slot count (see config.js) — the card's price is the reroll now, so nothing reduces it and this
// exists only so the two readers below cannot drift apart.
export function effectiveSlots(run) {
  return run.choiceSlots ?? 2
}

// Every anomaly damage multiplier that can CHANGE during a run, folded into one number for
// applyDamage. Kept as one function rather than four reads at the call site so the composition is
// visible: these MULTIPLY, and a run holding two of them is meant to be extreme (the rarity
// licence). MAX_ANOMALIES_PER_RUN = 2 is what bounds it.
// The per-frame half of the slate: timers that tick and costs that are paid by the second.
// Returns true when the player died paying one, exactly like the other stepX guards in stepSim.
function stepAnomalies(run, dt) {
  const a = run.anomalies
  if (!a) return false
  if (a.berserk && run._berserkT > 0) run._berserkT = Math.max(0, run._berserkT - dt)
  if (a.overload) {
    // PER SECOND, never per shot. Weapon cadence spans 0.5/s (a city beam) to 3.8/s (body) across
    // chapters — a 7.6x lottery — and "per shot" is undefined for a beam at all, so a per-fire cost
    // would price the card completely differently in every chapter. Measured, this is the same
    // error the Ipecac count table exists to avoid.
    // The `dot` path is deliberate: it skips invulnTime, HURT_CAP_FRAC and armor subtraction, so
    // the cost cannot be turtled away. It is still suppressed by run.rampageT, which makes skies'
    // rampage a free-fire window — a good emergent beat, not a bug.
    //
    // ACCUMULATE, then spend whole HP. hurtPlayer's dot branch is Math.max(1, Math.round(raw)), so
    // handing it 0.75 * dt (0.0125 at 60fps) rounds to 0 and is FLOORED BACK UP TO 1 — the card
    // would cost 60 HP/s instead of 0.75 and kill a full-health player in two seconds. Every
    // per-second cost in this file has to bank the fraction; the floor exists so a real DoT tick
    // can never do nothing, and it turns any sub-1 drain into a catastrophe.
    // x dmgScale: the cost tracks the damage the card is preventing. See OVERLOAD_HP_PER_SEC.
    //
    // AND x TIME_DEBT_MUL, on the RUN clock rather than the real one (v7.15). Without this the two
    // cards anti-combo: TIME DEBT ends the run in 200 real seconds instead of 300, so a drain
    // charged per REAL second collects only two thirds of the HP it would over a full run — the
    // pair was a DISCOUNT on the card whose whole point is a cost. Charging per run-second makes
    // the total identical to an undebted run and the per-real-second bite 1.5x, which is what
    // "everything arrives 50% sooner" says on the TIME DEBT card. BERSERK's window above is
    // deliberately NOT scaled: it is a 5s reward for being hit, not a cost, and shortening it is a
    // nerf nobody asked for.
    const clockDt = a.timeDebt ? dt * TIME_DEBT_MUL : dt
    run._overloadAcc = (run._overloadAcc ?? 0) + OVERLOAD_HP_PER_SEC * dmgScale(run.time) * clockDt
    if (run._overloadAcc >= 1) {
      const spend = Math.floor(run._overloadAcc)
      run._overloadAcc -= spend
      if (hurtPlayer(run, spend, true, 'overload')) return true
    }
  }
  // MINIMES: one decoy every MINIME_INTERVAL, launched outward on a random heading. Reuses the
  // `lure` weapon's entity wholesale (run.lures) — enemies inside `aggro` already path to a lure
  // instead of the player, and stepLures already bursts it for player-scaled AoE at expiry. What
  // the lure does NOT have is movement, so these carry vx/vy and stepLures moves anything that
  // does; a lure with no velocity behaves exactly as before.
  if (a.minimes) {
    run._minimeT = (run._minimeT ?? MINIME_INTERVAL) - dt
    if (run._minimeT <= 0) {
      run._minimeT += MINIME_INTERVAL
      const ang = Math.random() * Math.PI * 2
      run.lures.push({
        x: run.player.x, y: run.player.y,
        vx: Math.cos(ang) * MINIME_SPEED, vy: Math.sin(ang) * MINIME_SPEED,
        t: 0, dur: MINIME_LIFE, aggro: MINIME_AGGRO,
        burstR: MINIME_BURST_R, burstDmg: MINIME_BURST_DMG,
        sticky: false, minime: true,
      })
      run.events.push({ type: 'lure', x: run.player.x, y: run.player.y })
    }
  }
  return false
}

// MARTYR's detonations, resolved. Called from stepSim AFTER every path that can call hurtPlayer
// (contact, bombs, pools, strips, traps, lanes, enemy shots, pull beams) and BEFORE stepWeapons,
// so it is same-frame — the blast still lands the instant you are hit — while sitting outside
// every one of those functions' array walks. See the queue site in hurtPlayer for the two bugs
// that bought this indirection.
// The target list is SNAPSHOT before any damage is dealt, so children spawned by a splitter or a
// `split` enemy inside this loop are not eligible for the burst that created them.
function stepMartyr(run) {
  const q = run._martyrBursts
  if (!q || q.length === 0) return
  const radSq = MARTYR_RADIUS * MARTYR_RADIUS
  for (const b of q) {
    const targets = []
    for (const e of run.enemies) {
      if (e._dead) continue
      const dx = e.x - b.x, dy = e.y - b.y
      if (dx * dx + dy * dy <= radSq) targets.push(e)
    }
    // dealDamage, not applyDamage: this is not a weapon hit, so it must not re-roll crit,
    // re-apply elements, or take the damage passives a second time (they are already in `dmg`).
    for (const e of targets) if (!e._dead) dealDamage(run, e, b.dmg, false)
    run.events.push({ type: 'explode', x: b.x, y: b.y, radius: MARTYR_RADIUS })
  }
  q.length = 0
}

function anomalyDamageMul(run) {
  const a = run.anomalies
  if (!a) return 1
  let mul = 1
  // BERSERK: a window, refreshed by every non-dot hit (hurtPlayer) and ticked down in stepAnomalies.
  if (a.berserk && run._berserkT > 0) mul *= BERSERK_DMG_MUL
  // STILLNESS: a ramp over run._stillT, which stepPlayerMovement resets on any INPUT (never on
  // velocity — pond's currents shove the player, so a velocity test would hard-counter the card in
  // exactly one chapter).
  if (a.stillness) {
    const ramp = Math.min(1, (run._stillT ?? 0) / STILLNESS_RAMP)
    mul *= 1 + (STILLNESS_MAX_MUL - 1) * ramp
  }
  // CHAOS PACT: the ramp. Every wave SURVIVED is worth CHAOS_PACT_DMG_PER_WAVE, kept for the rest
  // of the run — so this is read from the clock rather than accumulated on `run`, and a wave can
  // never be double-counted by a paused or repeated frame.
  if (a.chaosPact) mul *= 1 + chaosWavesSurvived(run.time) * CHAOS_PACT_DMG_PER_WAVE
  // BLOOD PACT: the snowball, accumulated in stepSim's kill accounting.
  if (a.bloodPact) mul *= 1 + (run._bloodPact ?? 0)
  return mul
}

// BLOOD PACT suppresses every heal in the run, and before v7.2 there was no funnel to put that in
// — unlike damage, which has exactly one. This IS the funnel, and adding it is most of what makes
// the card shippable. Four callers: the level-up heal card, the `maxHP` passive's top-up, stepRegen
// and AVARICE. Avarice going through it is the correct reading of both cards — taking Blood Pact
// after Avarice turns your coins back into nothing, and the player can see that coming.
//
// The REVIVE token is deliberately NOT routed here. It is a shop consumable with its own resource
// and its own HP fraction (hurtPlayer, REVIVE_HP_FRAC); blocking it would make Blood Pact silently
// void 150 coins the player spent before the run began — a cost paid outside the card's reading.
//
// If you add a heal, add it HERE. A direct `p.hp = ...` write compiles, runs, and quietly makes
// Blood Pact a lie; grep for `p.hp =` before assuming there is another one (there are three writes
// in this file: the BRITTLE clamp, this, and the revive).
function healPlayer(run, amount) {
  if (run.anomalies?.bloodPact) return
  const p = run.player
  p.hp = Math.min(p.maxHP, p.hp + amount)
}

// ---- Player -------------------------------------------------------------------

function stepPlayerMovement(run, input, dt) {
  const p = run.player
  let ix = input?.x || 0
  let iy = input?.y || 0
  const len = Math.hypot(ix, iy)
  if (len > 1) { ix /= len; iy /= len } // clamp to unit circle, keep sub-unit analog magnitude

  // STILLNESS (v7.2) reads INPUT, deliberately, and this is the only place the raw stick is known.
  // A velocity test would be wrong in exactly one chapter and invisibly so: pond's currents shove
  // the player every frame (currentForceMul), the beyond lane advances you whether you ask or not,
  // and both would hold the ramp at zero forever. `len` is pre-clamp, so a half-pushed analog stick
  // still counts as moving. Ticked here rather than in stepAnomalies because that runs before this
  // one and would read the previous frame's input.
  if (run.anomalies?.stillness) {
    run._stillT = len > 0 ? 0 : (run._stillT ?? 0) + dt
  }

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
  // THE DARK (v7.x Book 2): a chapter declaring `resource.dark` slows the player as its bar empties,
  // on the same curve that dims the screen (darkness(), config.js) so the two cues are one fact.
  // Joins the MIN rather than multiplying in, for the reason the block above gives — and here that
  // is the load-bearing choice, not just consistency: the dark is CONTINUOUS once you are under the
  // threshold, so multiplying would make every web and every latch in this chapter strictly nastier
  // than the same web anywhere else, which is a difficulty change nobody asked for.
  const _dres = CHAPTERS[run.chapter].resource
  const darkMul = _dres?.dark ? 1 - (1 - _dres.dark.speedFloor) * darkness(run.charge, _dres) : 1
  // THE SANDBARS (Book 2 / The Surf): dry ground is a floor on speed, same MIN composition as the
  // dark above and for the same reason — multiplying would silently stack with latch/web/the dark.
  const _sig = CHAPTERS[run.chapter].signature
  const sandMul = _sig && _sig.type === 'tide' && onSandbar(run) ? _sig.bars.slowMul : 1
  const slowMul = Math.min(latchMul, webMul, run._bindSlow ?? 1, darkMul, sandMul)
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
    // Through healPlayer so BLOOD PACT reaches it. This is the site that makes that card a real
    // trade rather than a flavour line — regen is the passive it forbids, and BLOOD MONEY's whole
    // design argument is that it forces you to buy regen, which Blood Pact then makes worthless.
    healPlayer(run, run.passives.regen * dt)
  }
}

// ---- Spawning -------------------------------------------------------------------

// The spawn-type mix at time t. `mul` is the chapter's optional CHAPTERS[].archetypeMul — the only
// lever that can thin ONE creature in a chapter whose roster maps it 1:1 onto an archetype. A
// roster `weight` cannot: spawnEnemy picks the type FIRST and only then narrows to the roster
// entries wearing it, so weighting garden's spider (its only `tank`) would be a weighted pick over
// a one-item pool — a silent no-op. Weights are relative, so thinning one archetype hands its share
// to the others; the total spawn count is untouched (that is spawnMul's job, tuned in v6.6.23).
//
// Keyed by ARCHETYPE (normal/fast/tank — the vocabulary a chapter's roster is written in), NOT by
// the drone/wisp/tank spawn types WAVE_TABLE uses. That translation is the whole reason
// TYPE_ARCHETYPE exists: `tank` is its own inverse, so keying this on the raw table would have
// worked for the one case shipped here and silently done NOTHING for a future
// `archetypeMul: { fast: 0.8 }`. That precise mistake already shipped once — see the warning above
// TYPE_ARCHETYPE in config.js, where indexing the wrong way made every 'fast' roster entry
// unreachable until v5.5. Run SP asserts every key is a real archetype.
function waveWeights(t, mul) {
  let table = WAVE_TABLE[0][1]
  for (const [from, weights] of WAVE_TABLE) {
    if (t >= from) table = weights
    else break
  }
  if (!mul) return table
  const out = {}
  for (const [type, w] of Object.entries(table)) out[type] = w * (mul[TYPE_ARCHETYPE[type]] ?? 1)
  return out
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
  // v6.4.3 opening credit (see SPAWN_OPENING_CREDIT in config.js): bank the first few spawns so
  // the run opens with enemies walking in, not dead air. One-time; spawnMul 0 = stay quiet.
  if (!run._openingSpawned) {
    run._openingSpawned = true
    if (run.mods.spawnMul > 0) run._spawnAcc += SPAWN_OPENING_CREDIT
  }
  // v5.18: in the lane the ranks (stepFormations) are a second, concurrent spawner aimed down the
  // same narrow corridor — the ordinary stream yields so the two together read as pressure rather
  // than a wall. See LANE_SPAWN_MUL.
  // laneEarlyMul is the +33% opening (see LANE_EARLY_BOOST) — it also compresses the rank cadence in
  // stepFormations, because the ranks are the majority of this chapter's early arrivals.
  const laneMul = CHAPTERS[run.chapter].lane ? LANE_SPAWN_MUL * laneEarlyMul(run.time) : 1
  // CHAOS PACT (v7.2): the danger half of the cycle. Read-time, never written into run.mods —
  // that table is the run's MUTATOR product, chosen before the run, and folding a per-second
  // oscillation into it would corrupt it permanently (the same reason RAMPAGE's multipliers are
  // read-time). The payoff half is the damage multiplier in anomalyDamageMul.
  const chaosMul = run.anomalies?.chaosPact && chaosSurgeActive(run.time) ? CHAOS_PACT_SPAWN_MUL : 1
  run._spawnAcc += spawnRate(run.time) * run.mods.spawnMul * laneMul * chaosMul * dt
  // SUBMISSION: your allies must not eat the swarm's spawn budget. They live in run.enemies,
  // so without this the cap counts them and the game quietly spawns FEWER hostiles while an ally is
  // out — a second, invisible buff on top of the card, and one that corrupts any kills-per-run
  // measurement used to price it. Counted once here rather than inside the loop: the cap check runs
  // per spawn, and an O(n) scan in there would make saturated frames O(n^2).
  const cap = maxAliveFor(run.mods) + allyCount(run) // per-chapter density cap (v6.6.4) — see maxAliveFor
  while (run._spawnAcc >= 1 && run.enemies.length < cap) {
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
  // Divided by the opening boost, so ranks arrive 33% more often at t=0 and settle back to exactly
  // FORMATION_INTERVAL by LANE_EARLY_UNTIL. Read at fire time, so the cadence eases as the run goes.
  run._formationT += FORMATION_INTERVAL / laneEarlyMul(run.time)

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
      if (run.enemies.length >= maxAliveFor(run.mods)) return
      const x = -hw + pitch * (col + 0.5) + offset
      const y = p.y - Math.max(FORMATION_AHEAD_MIN, run.viewRadius * FORMATION_AHEAD_MUL) - row * FORMATION_ROW_PX
      // rosterId: a rank is rank-and-file invaders, never whatever the archetype pool happens to
      // roll. Elites arrive on their own timer through the ordinary spawn path, where they get the
      // chapter's eliteFlags and read as the exception they are.
      spawnEnemy(run, { type: ARCHETYPE_TYPE.normal, x, y, forceNormal: true, rosterId: 'invader' })
    }
  }
}

// -- The boss script (v5.24, The Blank; v6.3.1 difficulty pass) ---------------------------------
// The scripted chapter's ONLY spawner and its whole win condition. run.script ({ stage, waveIdx,
// waveT, spawned, bossId } — see state.js) walks BLANK_SCRIPT (config.js): even stages are wave
// blocks, odd stages are boss phases (stage 1/3/5 = phase 1/2/3, one run.enemies entry each so
// every weapon hits it with zero new plumbing). BLANK_MAX_ALIVE (not the global MAX_ALIVE) caps
// every spawn here except the boss itself (spawnBlankEnemy) — the doubled waves below need the
// headroom.
//   Wave block: 3 discrete ring-burst waves (doubled in v6.3.1), each tagged e._wave. The next
//     wave arrives on clear OR after BLANK_WAVE_TIMEOUT — leftovers linger and stack pressure
//     (they still count against the NEXT wave's clear, which is the point). After the block's
//     last wave: stage++.
//   Boss phase: one antibody spawned through the normal path, then overridden post-spawn (hp ×4
//     over v5.24 via BLANK_BOSS_HP/speed/xp pinned by BLANK_BOSS_*, affixes ['anchored'] =
//     knockback/pull immune; P1 alone runs at BLANK_BOSS_SPEED_P1, ~70% faster than P2). It ends
//     ONLY on the boss's death — detected by id-absence from run.enemies on a later frame, same as
//     every kill (kill events carry no id; corpses are filtered at stepWeapons' tail). A
//     non-final phase kill also force-kills any surviving binding nodes (dealDamage) so their slow
//     can't bleed into the next block or P3's chase. Death of the LAST phase IS the victory; no
//     timer victory exists here (see stepSim's gate).
// The boss learns you — past, present, future, each phase's OWN read, plus (d2+, crossReactive)
// one read borrowed from a neighboring phase, plus (d3, affinityMature) its own read running
// deeper:
//   P1 reads your PAST: run.trail (sampled every BLANK_TRAIL_DT below) is periodically detonated
//     via detonateTrail — the most recent BLANK_READ1_K points (BLANK_READ1_K_MATURE at d3) become
//     run.bombs (src:'trail'), fuses staggered so the oldest blows first and the blast chases you
//     along your own path. At d2+ it also fires P2's homing shot on its own timer.
//   P2 holds your PRESENT: killable 'bindnode' enemies extruded near the player (cap
//     BLANK_NODE_MAX, BLANK_NODE_MAX_MATURE at d3); while alive they MIN-stack a slow
//     (run._bindSlow, read by stepPlayerMovement next frame — one frame of lag nobody can see) and
//     a node that survives BLANK_YANK_T (8s, was 5 — 5s spent all nodes before a 3rd could spawn)
//     drags the player toward the boss, spending ALL nodes. Plus slow aimed shots through the
//     existing run.enemyShots machinery. At d2+ it also borrows P1's trail read, but detonated as
//     a SPREAD field (every BLANK_XREACT_STRIDE-th sample) so a stationary player doesn't eat a
//     stacked blast.
//   P3 takes your FUTURE: erasure bands (run.strips, look:'erase') pre-fired at the player's
//     extrapolated position (p.vx/vy × BLANK_LEAD) — a CROSS (BLANK_BAND_ANGLES), an 8-arm STAR
//     (BLANK_BAND_ANGLES_MATURE) at d3. At d2+ it also borrows a short trail echo
//     (BLANK_XREACT_READ3_K points).
// Desperation is FIGHT-WIDE (v6.3.1, was P3-only): any phase below BLANK_DESPERATE_FRAC hp
// accelerates its read/shot/node timers ×BLANK_DESPERATE_MUL; P3's cross alone uses the milder
// BLANK_READ3_DESPERATE_MUL (the shared mul made two 8-arm stars overlap permanently).
// Each phase also drip-recruits its wave minion (BLANK_RECRUIT_*) so AoE builds and the XP economy
// never starve during the duel. All spawns pass forceNormal — no elites exist in this chapter.
// The accelResponse mutator (difficulty 2+, assigned not rolled) shortens every read timer,
// telegraph fuse and the wave timeout by BLANK_ACCEL_MUL.
// immuneMemory (d3) residue is no longer wave-only: every scripted-chapter corpse leaves erase
// residue (dealDamage's on-death block below), tagged variant:'residue' so render.js can dim it
// against the boss's own (untagged) bands/wakes — the eraser's wake residue is tagged the same way.
// @returns true if the run ENDED this frame — the P2 yank can kill (phase 'dead'), and the final
// boss's death wins (phase 'victory'); either way the rest of stepSim must not run.
function stepBossScript(run, dt) {
  if (!CHAPTERS[run.chapter].scripted) return false
  const p = run.player
  const s = run.script
  const accel = run.mutators.includes('accelResponse') ? BLANK_ACCEL_MUL : 1
  const xreact = run.mutators.includes('crossReactive')
  const mature = run.mutators.includes('affinityMature')

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
      // The door (owner directive): a wave of 128-256 lands as a closed ring with nowhere to run,
      // so every wave leaves one BLANK_WAVE_GAP-wide wedge empty. Re-rolled per wave — the opening
      // is something you read and commit to, not a fixed corner you park in.
      const gapDir = Math.random() * Math.PI * 2
      for (let i = 0; i < wave.n; i++) {
        const e = spawnBlankEnemy(run, wave.ids[i % wave.ids.length], false, { gapDir, gapArc: BLANK_WAVE_GAP })
        if (!e) break // BLANK_MAX_ALIVE — leftovers already saturate the field
        e._wave = true
        e.xp *= BLANK_WAVE_XP_MUL // v6.3.3: the horde is pressure, not a leveling shortcut (gems are float-safe)
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
    e.hp = e.maxHP = roundHP(BLANK_BOSS_HP[phase - 1] * run.mods.enemyHpMul)
    e.radius = BLANK_BOSS_R
    // v6.3.1: P1 gets its own (faster) speed — closes and circles the standoff band ~70% quicker.
    e.speed = phase === 3 ? BLANK_BOSS_SPEED_P3 : phase === 1 ? BLANK_BOSS_SPEED_P1 : BLANK_BOSS_SPEED
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
    // xreact (d2+): P2's borrowed trail read runs on ITS OWN timer (not _read1T — that stays P1's
    // cadence when P1 reforms) at BLANK_XREACT_READ1_MUL × BLANK_READ1_T; P3's borrowed echo reuses
    // the base BLANK_READ1_T. Armed here regardless of xreact so a later-enabled mutator never reads stale 0.
    run._xreadT = phase === 2 ? BLANK_READ1_T * BLANK_XREACT_READ1_MUL * accel : BLANK_READ1_T * accel
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
      // v6.3.1 [panel/bugs]: a dead boss's nodes die with it — otherwise a surviving binding node's
      // slow (or a live yank timer) bleeds into the next block, or worse, into P3's 170 px/s chase.
      for (const n of nodes) dealDamage(run, n, n.hp, false)
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
  // v6.3.1: desperation is fight-wide now, not P3-only — a 4x-hp boss with a flat cadence would be
  // a pure damage sponge, so any phase below BLANK_DESPERATE_FRAC accelerates its read/shot/node
  // timers ×BLANK_DESPERATE_MUL. P3's cross keeps a MILDER BLANK_READ3_DESPERATE_MUL instead (see
  // that constant's config comment — the shared mul made two 8-arm stars overlap permanently).
  const desperate = boss.hp < boss.maxHP * BLANK_DESPERATE_FRAC
  const dmul = desperate ? BLANK_DESPERATE_MUL : 1
  let playerDied = false

  if (phase === 1) {
    // P1 — reads your past: detonate the recent trail as staggered bombs, oldest first, so the
    // blast front chases the player along their own path. A turner escapes; a straight-liner dies.
    // affinityMature (d3) reads BLANK_READ1_K_MATURE points deep instead of the base K.
    run._read1T -= dt
    if (run._read1T <= 0) {
      run._read1T += BLANK_READ1_T * accel * dmul
      detonateTrail(run, mature ? BLANK_READ1_K_MATURE : BLANK_READ1_K, 1, accel)
    }
    // crossReactive (d2+): P1 borrows P2's homing shot on its own timer (_shotT — P1 never uses it
    // otherwise) so a later phase-2 reform still arms at the correct cadence.
    if (xreact) {
      run._shotT -= dt
      if (run._shotT <= 0) {
        run._shotT += BLANK_SHOT_T * accel * dmul
        const base = Math.atan2(p.y - boss.y, p.x - boss.x)
        for (let i = 0; i < BLANK_SHOT_N; i++) {
          const a = base + (i - (BLANK_SHOT_N - 1) / 2) * BLANK_FAN_SPREAD
          run.enemyShots.push({
            x: boss.x, y: boss.y, vx: Math.cos(a) * BLANK_SHOT_SPEED, vy: Math.sin(a) * BLANK_SHOT_SPEED,
            r: BLANK_SHOT_R, dmg: BLANK_SHOT_DMG, life: BLANK_SHOT_LIFE, turnRate: BLANK_SHOT_TURN,
          })
        }
      }
    }
  } else if (phase === 2) {
    // P2 — holds your present: extrude killable binding nodes near the player. Target-switching
    // discipline is the counterplay — a node that survives BLANK_YANK_T fires the yank.
    // affinityMature (d3) raises the node cap to BLANK_NODE_MAX_MATURE (slow table floor unchanged
    // — mutator-gated so d1/d2 never silently get a 4th node).
    run._nodeT -= dt
    if (run._nodeT <= 0) {
      run._nodeT += BLANK_NODE_T * accel * dmul
      if (nodes.length < (mature ? BLANK_NODE_MAX_MATURE : BLANK_NODE_MAX)) {
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
    // Slow aimed shots (the existing enemy-projectile machinery — outrunnable, but you're slowed),
    // fired BLANK_SHOT_N at a time as a pair straddling the aim line: both halves home, so the
    // gap down the middle closes as they travel.
    run._shotT -= dt
    if (run._shotT <= 0) {
      run._shotT += BLANK_SHOT_T * accel * dmul
      const base = Math.atan2(p.y - boss.y, p.x - boss.x)
      for (let i = 0; i < BLANK_SHOT_N; i++) {
        const a = base + (i - (BLANK_SHOT_N - 1) / 2) * BLANK_FAN_SPREAD
        run.enemyShots.push({
          x: boss.x, y: boss.y,
          vx: Math.cos(a) * BLANK_SHOT_SPEED, vy: Math.sin(a) * BLANK_SHOT_SPEED,
          r: BLANK_SHOT_R, dmg: BLANK_SHOT_DMG, life: BLANK_SHOT_LIFE, turnRate: BLANK_SHOT_TURN,
        })
      }
    }
    // crossReactive (d2+): P2 borrows P1's trail read, but as a SPREAD field (every
    // BLANK_XREACT_STRIDE-th sample) so a stationary player — P2's own correct play — gets a
    // spread field, not a stacked blast.
    if (xreact) {
      run._xreadT -= dt
      if (run._xreadT <= 0) {
        run._xreadT += BLANK_READ1_T * BLANK_XREACT_READ1_MUL * accel
        detonateTrail(run, BLANK_READ1_K, BLANK_XREACT_STRIDE, accel)
      }
    }
  } else {
    // P3 — takes your future, and comes to collect it: the antibody itself chases (no standoff
    // flag, BLANK_BOSS_SPEED_P3) while pre-firing an erasure CROSS (an 8-arm STAR at d3, via
    // BLANK_BAND_ANGLES_MATURE) at the extrapolated position (p.vx/vy are stepPlayerMovement's
    // input-only snapshot), so both the straight-ahead escape and the sideline are cut. Feinting —
    // breaking your own pattern — is still the counterplay; now it must be done at a run.
    run._read3T -= dt
    if (run._read3T <= 0) {
      run._read3T += BLANK_READ3_T * accel * (desperate ? BLANK_READ3_DESPERATE_MUL : 1)
      const speed = Math.hypot(p.vx, p.vy)
      const a = speed > 1 ? Math.atan2(p.vy, p.vx) + Math.PI / 2 : Math.random() * Math.PI * 2
      const cx = p.x + p.vx * BLANK_LEAD, cy = p.y + p.vy * BLANK_LEAD
      for (const da of (mature ? BLANK_BAND_ANGLES_MATURE : BLANK_BAND_ANGLES)) {
        run.strips.push({
          x: cx, y: cy, angle: a + da,
          len: BLANK_BAND_LEN, w: BLANK_BAND_W, fuse: BLANK_BAND_FUSE * accel, t: BLANK_BAND_T,
          dps: BLANK_BAND_DPS, look: 'erase', grow: BLANK_BAND_GROW,
        })
      }
    }
    // Straight aimed fans on the P2 shot timer — no homing (turnRate 0), BLANK_FAN_N_MATURE shots
    // at d3: from a boss already on your heels the threat is the spread, and sidestepping it
    // steers you toward the cross.
    run._shotT -= dt
    if (run._shotT <= 0) {
      run._shotT += BLANK_SHOT_T * accel * dmul
      const base = Math.atan2(p.y - boss.y, p.x - boss.x)
      const fanN = mature ? BLANK_FAN_N_MATURE : BLANK_FAN_N
      for (let i = 0; i < fanN; i++) {
        const a = base + (i - (fanN - 1) / 2) * BLANK_FAN_SPREAD
        run.enemyShots.push({
          x: boss.x, y: boss.y,
          vx: Math.cos(a) * BLANK_FAN_SPEED, vy: Math.sin(a) * BLANK_FAN_SPEED,
          r: BLANK_SHOT_R, dmg: BLANK_SHOT_DMG, life: BLANK_SHOT_LIFE, turnRate: 0,
        })
      }
    }
    // crossReactive (d2+): P3 borrows a short trail echo (BLANK_XREACT_READ3_K points) rather
    // than the fuller P1 read — a reminder, not a second read.
    if (xreact) {
      run._xreadT -= dt
      if (run._xreadT <= 0) {
        run._xreadT += BLANK_READ1_T * accel
        detonateTrail(run, BLANK_XREACT_READ3_K, BLANK_XREACT_STRIDE, accel)
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

// v6.3.1: detonate k points of the player's trail as staggered telegraph bombs (oldest first,
// same shape as P1's own read). Borrowed (cross-reactive) reads pass stride > 1: every stride-th
// sample, so a stationary player yields a spread field, not a stacked blast. Stagger scales with
// accel like the base fuse does.
function detonateTrail(run, k, stride, accel) {
  const src = stride > 1 ? run.trail.filter((_, i) => i % stride === 0) : run.trail
  const pts = src.slice(-k)
  for (let i = 0; i < pts.length; i++) {
    const fuse = BLANK_READ1_FUSE * accel + i * BLANK_READ1_STAGGER * accel
    run.bombs.push({ x: pts[i].x, y: pts[i].y, radius: BLANK_READ1_R, fuse, duration: fuse, dmg: BLANK_READ1_DMG, src: 'trail' })
  }
}

// Spawn one blank-roster enemy by id through the normal spawnEnemy path — never elite, base stats
// from its roster archetype, default ring placement unless opts gives (x,y) — and return it (spawnEnemy
// exposes the spawn only as the run.enemies tail, same as the spawner elite flag reads it). Returns
// null at BLANK_MAX_ALIVE (v6.3.1: the blank's own, higher cap — not the global MAX_ALIVE), EXCEPT
// for the boss (essential = true): a script whose boss never arrives soft-locks the chapter, so the
// antibody ignores the cap the way nothing else does.
function spawnBlankEnemy(run, rosterId, essential = false, opts = {}) {
  // v6.3.1: the blank gets its own (higher) cap, not the global MAX_ALIVE — doubled waves' worst-case
  // zero-clear leftover count would otherwise starve nodes/recruits at the shared ceiling.
  if (!essential && run.enemies.length >= BLANK_MAX_ALIVE) return null
  const roster = CHAPTERS[run.chapter].roster.find((r) => r.id === rosterId)
  spawnEnemy(run, { type: ARCHETYPE_TYPE[roster.archetype], forceNormal: true, rosterId, ...opts })
  const e = run.enemies[run.enemies.length - 1]
  // Re-pin hp/speed/dmg WITHOUT hpScale/dmgScale/speedCreep: those curves ramp toughness against
  // the 300s survival clock, but a scripted fight has no clock — its difficulty is the ladder's
  // job, and a slow clear must not quietly toughen wave 7 (or up-damage it) against the player
  // who most needs it not to. Blank fights routinely run past 300s, so leaving dmgScale live
  // would silently inflate late waves; the ladder-driven enemyDmgMul stays.
  const base = ENEMIES[ARCHETYPE_TYPE[roster.archetype]]
  e.hp = e.maxHP = roundHP(base.hp * (roster.hpMul ?? 1) * run.mods.enemyHpMul)
  e.speed = base.speed * (roster.speedMul ?? 1) * run.mods.enemySpeedMul
  e.dmg = base.dmg * run.mods.enemyDmgMul
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
  const ch = CHAPTERS[run.chapter]
  // v7.x: lane chapters have always had this; a chapter declaring a `resource` gets it too, and
  // spends that resource to amplify it. Both gates on one line so no chapter can have the button
  // without the cast, or the cast without the button (ui.js unhides on exactly this pair).
  if (!ch.lane && !ch.resource) return
  run.repulseCd = Math.max(0, (run.repulseCd ?? 0) - dt)
  if (!input.skill || run.repulseCd > 0) return
  run.repulseCd = REPULSE_CD
  const p = run.player
  // The amplification. `spend` is capped by what the bar actually holds, so an EMPTY bar leaves
  // t = 0 and the shipped v5.21 shove fires unchanged - the floor that stops the spiral where
  // having no charge prevents you from earning charge. Lane chapters declare no resource, so their
  // t is 0 forever and The Beyond's pulse is byte-identical to what it was.
  const res = ch.resource
  const spend = res ? Math.min(run.charge, PULSE_CHARGE_COST) : 0
  const t = res ? spend / PULSE_CHARGE_COST : 0
  if (spend > 0) run.charge -= spend
  const radius = REPULSE_RADIUS + (PULSE_RADIUS_AT_FULL - REPULSE_RADIUS) * t
  const force = REPULSE_FORCE + (PULSE_FORCE_AT_FULL - REPULSE_FORCE) * t
  // The SCALED radius, not the constant. render.js draws both rings at e.r under a comment saying
  // the radius is pushed rather than fixed because "a burst that lies about its reach makes the
  // cooldown feel arbitrary" - pushing REPULSE_RADIUS here would draw the 340px floor ring around
  // a 620px shove, which is that exact complaint with a bigger gap.
  run.events.push({ type: 'repulse', x: p.x, y: p.y, r: radius, charged: t })
  const radSq = radius * radius
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
    const falloff = 1 - d / radius
    e.kb.x += ux * force * falloff
    e.kb.y += uy * force * falloff
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
  // ANOMALIES.unstableCores (config.js): every elite dies volatile. Pushed onto the affix ARRAY
  // rather than set as enemy.volatile — 'volatile' is only ever read as
  // enemy.affixes.includes('volatile') (dealDamage's death path), so a boolean would be a dead
  // store nothing reads and no test catches. It is granted ON TOP of the rolled affixes rather
  // than replacing one: the anomaly adds a rule, it does not take the elite's own teeth away.
  if (run.anomalies?.unstableCores && !picked.includes('volatile')) picked.push('volatile')
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
    fearT: 0, fearCd: 0, _ccDR: 1, stunT: 0, enrageT: 0,
    bloomSlowT: 0, // v6.4: a plain speed debuff (folds into slowMul), refreshed by stepBlooms
    _chillStack: 0, _freezeImmuneT: 0, _shockCd: 0, _comboCd: {},
  }
}

// opts: { type, x, y, forceNormal } — lets splitter deaths spawn wisps at a fixed position
// (never elite, but still time-scaled like any other spawn). Called with no opts by the
// normal spawn-timer path in stepSpawning.
function spawnEnemy(run, opts = {}) {
  const isElite = !opts.forceNormal && run.time >= run._nextEliteAt
  // SUBMISSION brings its own elites (config: SUBMISSION_ELITE_EVERY_MUL). Read-time, never
  // written into run.mods — that table is the run's mutator product and must stay fixed.
  if (isElite) {
    run._nextEliteAt += eliteEveryAt(run.time, lateEliteFor(run.chapter)) * run.mods.eliteEveryMul
      * (run.anomalies?.submission ? SUBMISSION_ELITE_EVERY_MUL : 1)
  }

  const type = opts.type ?? pickWeighted(waveWeights(run.time, CHAPTERS[run.chapter].archetypeMul))
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
      // opts.gapArc/gapDir (the blank's wave rings): leave ONE wedge of the ring empty — a door.
      // Drawing from the allowed arc and rotating it past the gap keeps the rest of the ring
      // uniform; rejection-sampling would have the same distribution but an unbounded loop.
      const arc = opts.gapArc ?? 0
      const angle = arc > 0
        ? opts.gapDir + arc / 2 + Math.random() * (Math.PI * 2 - arc)
        : Math.random() * Math.PI * 2
      const dist = run.viewRadius + SPAWN_RING
      x = p.x + Math.cos(angle) * dist
      y = p.y + Math.sin(angle) * dist
    }
  }

  // v6.9.2 BUGFIX — enemy HP IS AN INTEGER. Every factor here is fractional (hpScale, the difficulty
  // and mutator muls, roster hpMul), so maxHP used to come out at e.g. 21.00388888888889, while the
  // ONLY thing that ever subtracts from hp is dealDamage, which rounds. The fractional part is
  // therefore immortal: the enemy lands on hp = 0.0038, `hp <= 0` is false, and it lives on a
  // sliver no amount of chip damage can clear.
  // Harmless for most weapons (they deal their own number and overshoot), FATAL for the city taxi:
  // its squash branch deals a light enemy EXACTLY its remaining hp, so 0.0038 rounds to 0, the van
  // deals nothing, hitIds blocks a second try, and the pigeon strolls out from under it with a
  // floating "0". Measured over 10 five-minute city runs: 1193 of 13515 taxi hits (8.8%) dealt zero.
  // Rounding at every point hp is ASSIGNED keeps it integral forever, which kills the whole class.
  // v7.1: the tail rate is PER CHAPTER (lateRateFor). This is the only site that passes one — the
  // two enemy-side damage sites keep hpScale's default, since scaling those with a difficulty knob
  // would buff the player. Read once at spawn, like the rest of this line.
  let hp = base.hp * hpScale(run.time, lateRateFor(run.chapter)) * (isElite ? ELITE.hpMul : 1) * run.mods.enemyHpMul * (roster?.hpMul ?? 1)
  const speed = base.speed * speedCreepMul(run.time) * run.mods.enemySpeedMul * (roster?.speedMul ?? 1)
  const dmg = base.dmg * dmgScale(run.time) * (isElite ? ELITE.dmgMul : 1) * run.mods.enemyDmgMul
  const radius = base.radius * (isElite ? ELITE.sizeMul : 1) * run.mods.enemyRadiusMul * (roster?.radiusMul ?? 1)

  const affixes = isElite ? rollAffixes(run) : []
  if (isElite && affixes.includes('gilded')) hp *= GILDED_HP_MUL
  hp = roundHP(hp)   // LAST, after every multiplier — gilded lands after the base roll and a x1.5
                     // on an odd number puts the .5 straight back (caught by run VD.a)

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
  // v6.3 dispatch beat (CHAPTERS[].dispatch, currently city only): a REAL elite birth here — never
  // a spawner's minions, which always pass forceNormal and so never reach isElite — fires the
  // "pest control has been reported" fiction beat. render.js draws the strobe, main.js plays the
  // siren, ui.js shows the HUD line.
  if (isElite && CHAPTERS[run.chapter].dispatch) run.events.push({ type: 'dispatch', x, y })
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
    if (e._dead || isAlly(e) || (e.affixes && e.affixes.includes('anchored'))) continue   // SUBMISSION: never yank an ally off its fight
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
    const hp = roundHP(parent.maxHP * SPLIT_HP_FRAC)
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
    // SUBMISSION — THE RETARGET SEAM. This one line is what every movement machine below reads;
    // they are handed a POINT and never see run.player, which is why pointing an ally at the
    // nearest hostile makes seek, dash, charge, strafe, standoff, dive and pounce all aim correctly
    // for one edit. The Pheromone Lure override just below is the existing precedent for an enemy
    // seeking something that is not the player.
    //   `_tgtX/_tgtY` is also what render reads to face the sprite: bearing is otherwise recomputed
    // from run.player every frame, so an ally charging the swarm would draw walking BACKWARDS
    // in all 32 roster looks, silently.
    if (isAlly(e)) {
      const foe = nearestHostile(run, e)
      if (foe) { tx = foe.x; ty = foe.y }
      e._tgtX = tx; e._tgtY = ty
      // Your OWN Chitter Shriek applies fear to everything in run.enemies, which would send your
      // ally running from the swarm you sent it into; the stun does the same in miniature. Both are
      // read a few lines below, so clearing them here is the whole fix. Knockback and chill are
      // deliberately left alone — a shove and a slow are what your nova visibly does.
      e.fearT = 0; e.stunT = 0
      // An ally is not tempted by your own decoys, and the straggler recycler must not yank it
      // back to you mid-fight (stepStragglers exempts it the way `anchored` is exempted).
    } else if (hasLures) {
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
    // chill/freeze/bloom slow the seek movement only. // ponytail: movement state machines that
    // bypass slowMul entirely (dashBurst's dash, diveBomb's dive, pounce's leap, etc.) keep full
    // speed while bloomSlowT is up — the same ceiling chill/freeze already have here; not worth a
    // second guard in every one of those machines for a debuff this soft.
    const bloomMul = (e.bloomSlowT || 0) > 0 ? (1 - BLOOM_SLOW) : 1
    const slowMul = e.frozen > 0 ? 0 : (1 - (e.chillSlow || 0)) * bloomMul

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
      // stunned (hydrant launch / roar stagger): no seek at all — knockback still carries it below.
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
      stepDiveBomb(run, e, tx, ty, dt, slowMul)
    } else if (e.flags && e.flags.includes('pounce')) {
      stepPounce(run, e, tx, ty, dt, slowMul, enrageMul)
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
    } else if (e.elite && e.flags && e.flags.includes('pullBeam') && e._beamState === 'beam') {
      // pullBeam (v5.4 beyond's UFO elites): the UFO holds still while its beam is open. The beam
      // itself (drag + DoT) is stepPullBeams' business — this branch is only its movement.
    } else if (d > 1e-6 && slowMul > 0) {
      const step = e.speed * affixSpeedMul * flagSpeedMul * slowMul * dt
      let ux = dx / d
      let uy = dy / d
      // weave (v6.6.29, undergrowth's centipede): a serpentine lateral drift ON the seek heading.
      // It is the LAST branch on purpose — a weave is a modifier to walking, not a movement machine
      // that replaces it, so it must not sit up with dashBurst/pounce/blink in the override chain.
      // Deliberately not a burst of any kind: v6.6.28 removed dashBurst from this chapter because
      // an untelegraphed lunge reads as teleporting, and re-adding rhythm here must not re-add that.
      // The offset rides the enemy's OWN clock (phase seeded off e.id) so a pack does not slither in
      // lockstep, and it is applied as a rotation of the heading rather than as extra displacement —
      // the enemy still closes at exactly e.speed, so this changes the PATH and not the pressure.
      if (e.flags && e.flags.includes('weave')) {
        e._weaveT = (e._weaveT ?? 0) + dt
        const a = Math.sin(e._weaveT * WEAVE_FREQ + e.id * 1.7) * WEAVE_AMP
        const c = Math.cos(a)
        const s = Math.sin(a)
        const rx = ux * c - uy * s
        uy = ux * s + uy * c
        ux = rx
      }
      e.x += ux * step
      e.y += uy * step
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
    if (e.fearT > 0) {
      e.fearT = Math.max(0, e.fearT - dt)
      // Armed on the frame it EXPIRES, not on the frame it lands: arming at application would let a
      // ring that re-fears at 99% of the duration keep the lock alive forever.
      if (e.fearT === 0) e.fearCd = FEAR_REFRACTORY
    } else if ((e.fearCd ?? 0) > 0) {
      e.fearCd = Math.max(0, e.fearCd - dt)
    }
    // CC diminishing returns climb back to full over CC_DR_RECOVER seconds of not being controlled.
    if ((e._ccDR ?? 1) < 1) e._ccDR = Math.min(1, (e._ccDR ?? 1) + dt / CC_DR_RECOVER)
    if (e.stunT > 0) e.stunT = Math.max(0, e.stunT - dt)
    if (e.enrageT > 0) e.enrageT = Math.max(0, e.enrageT - dt)
    if (e.bloomSlowT > 0) e.bloomSlowT = Math.max(0, e.bloomSlowT - dt) // v6.4: refreshed by stepBlooms while inside a cloud

    // soapTrail elite flag (v5.0, e.g. pond's soap-bubble elites): drops a damaging pool node
    // into the shared run.pools array every SOAP_INTERVAL while alive (see stepPools below).
    // v6.4: `e._phaseSolid !== false` — the phase contract is "eats nothing, deals nothing"; an
    // untouchable ghosted elite must not keep laying damaging pools either.
    if (e.elite && e.flags && e.flags.includes('soapTrail') && !e._dead && e._phaseSolid !== false) {
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
          look: 'erase', variant: 'residue', // v6.3.1: dimmed by render.js so it stays legible against boss bands
        })
      }
    }

    // v6.6.14: the `sprayStrip` flag lived here — it marked a rectangle ON the player, from an
    // elite that could be anywhere on screen, so the hazard had no visible cause. It is now the
    // `mower` flag, and it does not act per-enemy at all: one run-level timer, armed while any
    // such elite lives, drives a single mower pass. See rollMowerLane.

    // artillery flag (v5.4 skies' tank columns AND its AA-turret elites): a plain slow seek (above)
    // that shells the player's PREDICTED position from wherever it stands. It pushes the EXISTING
    // volatile-bomb array (run.bombs), so it inherits that telegraph -> explode contract for free —
    // and with it, the fact that a shell damages the player and the enemies around it alike.
    if (e.flags && e.flags.includes('artillery') && !e._dead) {
      const interval = e.elite ? ARTILLERY_ELITE_INTERVAL : ARTILLERY_INTERVAL
      e._shellT = (e._shellT ?? interval) - dt
      // out of range: hold the timer near-ready (same shape as missileVolley's on-station gate) —
      // only tanks close enough to be a visible threat get to shell, however many exist on the map
      // v7.22 (owner: "shooting at me from outside the screen"): the radial gate cannot express
      // that. ARTILLERY_FIRE_RANGE 640 exceeds a portrait phone's half-diagonal (~465) outright,
      // and the horizontal half-view is only ~195 — so a tank 400px to the side was in range and
      // off the edge of the screen, shelling from nowhere. canCommitFrom is the SAME viewport-
      // rectangle rule v6.6.24 gave the wasps ("if it's not displayed on the screen, it should not
      // be able to jump on you"), which is a shell just as much as a dive: a threat may be
      // impossible to ignore, never impossible to trace. The radius stays as the desktop backstop —
      // on a wide screen the rectangle alone would let a tank shell from 1000px away.
      if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 > ARTILLERY_FIRE_RANGE * ARTILLERY_FIRE_RANGE ||
          !canCommitFrom(run, e) ||
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
        for (let i = 0; i < SPAWNER_COUNT && run.enemies.length < maxAliveFor(run.mods); i++) {
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
function stepDiveBomb(run, e, tx, ty, dt, slowMul) {
  if (e._diveState === undefined) { e._diveState = 'hover'; e._diveT = DIVE_HOVER_T }
  e._diveT -= dt
  const dx = tx - e.x, dy = ty - e.y
  const d = Math.hypot(dx, dy) || 1
  const ux = dx / d, uy = dy / d
  let vx = 0, vy = 0
  if (e._diveState === 'hover') {
    // Hold the standoff: close in if too far, back off if too near, hold still within the deadzone.
    // v6.6.24: the held distance is DIVE_STANDOFF clamped to what is actually on screen along this
    // approach — off the side of a phone that is nearer than 220, and holding station out there is
    // what let a wasp wind up unseen. Coming from above/below nothing changes.
    const standoff = visibleStandoff(run, ux, uy, DIVE_STANDOFF)
    const diff = d - standoff
    if (Math.abs(diff) > DIVE_HOVER_DEADZONE) {
      const dir = diff > 0 ? 1 : -1
      const spd = e.speed * DIVE_HOVER_SPEED_MUL
      vx = ux * dir * spd; vy = uy * dir * spd
    }
    // The rule: it may only wind up if the player can see it. Off-screen the timer simply does not
    // fire — it keeps hovering (and, thanks to the clamp above, keeps closing to somewhere visible)
    // rather than launching out of nowhere. Not a reset: the wait already served is kept, so a wasp
    // that drifts back into view commits promptly instead of restarting its whole cycle.
    if (e._diveT <= 0 && canCommitFrom(run, e)) {
      e._diveState = 'telegraph'; e._diveT = DIVE_TELEGRAPH_T; e._diveDirX = ux; e._diveDirY = uy
    }
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
// and stepContactDamage won't let it hurt you there). It has no attack of its own — a pouncer that
// lands on you damages you through ordinary contact damage, like any other enemy.
// (tx,ty) is the seek target; spdMul folds in enrage. slowMul folds in chill/freeze (0 = frozen).
function stepPounce(run, e, tx, ty, dt, slowMul, spdMul) {
  if (e._pounceState === undefined) { e._pounceState = 'hold'; e._pounceT = 0 }
  e._pounceT -= dt
  const dx = tx - e.x, dy = ty - e.y
  const d = Math.hypot(dx, dy) || 1
  const ux = dx / d, uy = dy / d
  let vx = 0, vy = 0
  if (e._pounceState === 'hold') {
    const spd = e.speed * spdMul * POUNCE_HOLD_SPEED_MUL
    vx = ux * spd; vy = uy * spd
    // v6.6.24: same rule as the wasp — a pouncer may not crouch to leap from off-screen. POUNCE_RANGE
    // (260) also exceeds a phone's horizontal half-view, so one closing from the side used to
    // commit while still undrawn. No clamp is needed here, unlike the wasp: 'hold' KEEPS SEEKING,
    // so one held off by this gate walks into view on its own and pounces a moment later.
    if (d <= POUNCE_RANGE && canCommitFrom(run, e)) {
      e._pounceState = 'aim'; e._pounceT = POUNCE_AIM_T; e._pounceDirX = ux; e._pounceDirY = uy
    }
  } else if (e._pounceState === 'aim') {
    // Dead stop. v6.7.4: the crouch has two halves. For the first POUNCE_AIM_TRACK_T it keeps
    // lining up on you — moving during that window buys nothing, it just follows — and after that
    // the heading is frozen and the attack is committed. The player's cue is the telegraph lane
    // (drawn straight off _pounceDir) coming to a stop: from that instant the dodge is live.
    if (e._pounceT > POUNCE_AIM_T - POUNCE_AIM_TRACK_T) { e._pounceDirX = ux; e._pounceDirY = uy }
    if (e._pounceT <= 0) { e._pounceState = 'leap'; e._pounceT = POUNCE_LEAP_T }
  } else if (e._pounceState === 'leap') {
    // v6.6.30: a fixed DISTANCE over a fixed time, not a multiple of the pouncer's own 44 px/s — see
    // the POUNCE_* block in config.js for the trace this replaces. spdMul (enrage) still scales it,
    // so a flashlight-enraged toad leaps further, which is what enrage is for.
    const spd = (POUNCE_LEAP_DIST / POUNCE_LEAP_T) * spdMul
    vx = e._pounceDirX * spd; vy = e._pounceDirY * spd
    if (e._pounceT <= 0) {
      // The landing slams any armed trap under the toad (combined radius — the pounce IS the
      // trigger weight). One per landing; gated on the chapter's 'predators' signature like
      // stepTraps, because 'pounce' is a chapter-agnostic flag and a future chapter's run.traps
      // could mean something else. The leap itself flew OVER traps untouched (stepTraps skips
      // any enemy mid-'leap') — this is the deliberate reversal of an earlier draft that let a
      // leap's center spring a trap for plain damage before landing, cannibalizing this slam.
      const sig = CHAPTERS[run.chapter].signature
      if (sig?.type === 'predators') {
        for (const tr of run.traps) {
          if (!tr.armed) continue
          const rr = tr.r + e.radius
          if ((e.x - tr.x) ** 2 + (e.y - tr.y) ** 2 > rr * rr) continue
          springTrap(run, tr)
          dealDamage(run, e, Math.max(SNAP_TRAP_DMG * 2, e.maxHP * POUNCE_TRAP_HP_FRAC), false)
          break
        }
      }
      e._pounceState = 'land'; e._pounceT = POUNCE_LAND_T
    }
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
    // Past CATCHUP_D the boss pursues, but never faster than BLANK_CATCHUP_MAX: fleeing always
    // works (config's contract) — P1's 120 base would otherwise outrun every build at ×2.8.
    const spd2 = d > BLANK_STANDOFF_CATCHUP_D ? Math.min(spd * BLANK_STANDOFF_CATCHUP_MUL, BLANK_CATCHUP_MAX) : spd
    e.x += (dx / d) * spd2 * dt
    e.y += (dy / d) * spd2 * dt
  } else if (d < BLANK_STANDOFF_MIN) {
    e.x -= (dx / d) * spd * dt
    e.y -= (dy / d) * spd * dt
  } else {
    if (e._driftDir === undefined) e._driftDir = Math.random() < 0.5 ? -1 : 1
    e.x += (-dy / d) * e._driftDir * spd * BLANK_STANDOFF_DRIFT_MUL * dt
    e.y += (dx / d) * e._driftDir * spd * BLANK_STANDOFF_DRIFT_MUL * dt
  }
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
// `src` (v7.2) names WHO did this, for the renderer only — the sim never branches on it. It exists
// because OVERLOAD's drain is a `hurt` every 1.33s for the whole run (~150 of them), and the
// renderer's hurt reaction is a screen shake, a red vignette and a white flash. Unlabelled, a
// self-inflicted running cost is indistinguishable from being hit, and the card turns the last
// three minutes of a run into a strobe. Only the anomaly passes one; every existing caller keeps
// `src: undefined` and behaves exactly as before.
function hurtPlayer(run, rawDmg, dot = false, src = null) {
  const p = run.player
  // v5.14: RAMPAGE = INVULNERABLE. Every player-damage path in this file funnels through here
  // (contact, pools, spray strips, snap traps, traffic lanes, enemy shots, pull beams, bombs), so
  // this one guard is the whole feature — and it covers `dot` too, which deliberately bypasses the
  // normal invuln window. Derived from run.rampageT, never assigned onto the player: see
  // RAMPAGE_CRUSH_MUL's doc block in config.js for why that distinction is load-bearing.
  if (run.rampageT > 0) return false
  const dmg = dot
    ? Math.max(1, Math.round(rawDmg))
    // v6.3.4 anti-turtle: HURT_CAP_FRAC caps a single non-dot hit so multiplicative sources
    // (glass, difficulty, late-run dmgScale, enrage) can't compose past a one-shot.
    : Math.min(Math.round(p.maxHP * HURT_CAP_FRAC), Math.max(1, Math.round((rawDmg - run.passives.armor) * run.mods.contactDmgTakenMul)))
  p.hp -= dmg
  if (!dot) p.invuln = PLAYER.invulnTime
  run.events.push({ type: 'hurt', dmg, dot, src })
  // v7.2 anomaly slate. This is the one funnel every player-damage path already goes through, so
  // it is where "you got hit" means anything. The counter gates BERSERK and MARTYR's `when`
  // predicates — both cards are about taking damage, so neither should be offered to a player the
  // run has not yet hit. Counts real hits only: the OVERLOAD drain is self-inflicted and would
  // otherwise open both gates on a timer instead of on play.
  if (!dot) run._hitsTaken = (run._hitsTaken ?? 0) + 1
  if (run.anomalies?.berserk && !dot) run._berserkT = BERSERK_DURATION
  // MARTYR turns HP into ammunition: the damage that got through detonates around you. Rides
  // hpScale for the reason UNSTABLE CORES' bombs had to — its input is PLAYER HP, which does not
  // scale, while enemy HP climbs 7.6x-33.6x over a run, so a flat conversion is a panic button
  // early and confetti late. dealDamage (not applyDamage) deliberately: this is not a weapon hit,
  // so it must not re-roll crit, re-apply elements, or be multiplied by the damage passives a
  // second time. Includes DoT damage — OVERLOAD's drain becoming a permanent aura is the intended
  // combo, and it is the reason the two cards were designed together.
  // QUEUED, NOT RESOLVED HERE. Detonating inline was wrong twice over, and both were measured:
  //   1. It iterated run.enemies while dealDamage APPENDED to it. A `splitter` elite or a `split`
  //      enemy killed by the burst spawns its children mid-loop, and for…of visits them — so the
  //      children took the blast they were born into (measured: 4 wisps at 10/16 hp, and 2 split
  //      children at 2244/2250, against full HP for the same kill delivered by a weapon). Under a
  //      real mid-run burst they die on arrival, silently deleting the splitter affix and the
  //      `split` behaviour flag for as long as MARTYR is up.
  //   2. hurtPlayer is itself called from inside `for (const b of run.bombs)` (stepBombs), so a
  //      volatile elite killed by the burst pushed its corpse-bomb into the very array being
  //      walked — measured coming out at fuse 0.7833 against VOLATILE_FUSE 0.8, having burned a
  //      frame of its own telegraph inside the loop that created it.
  // stepBombs already solved exactly this with its `chained` buffer, and says why in a comment.
  // Same idea, one level up: bank the burst and resolve it in stepMartyr, which runs after every
  // hurtPlayer caller in the frame and so cannot be inside anyone's iteration.
  if (run.anomalies?.martyr && dmg > 0) {
    (run._martyrBursts ??= []).push({ x: p.x, y: p.y, dmg: dmg * MARTYR_DMG_MUL * hpScale(run.time) })
  }
  // v5.4 reaction mods: taking damage (contact OR zone — every path routes through here) fires a
  // free Quill Burst / Tail Lash off the weapon timer, each on its own internal cooldown. No-ops
  // unless the weapon is equipped AND the mod is picked.
  tryQuillRetaliate(run)
  tryCounterLash(run)
  if (p.hp <= 0) {
    // Revive Token (v4.5, see CONSUMABLES.revive in config.js): consume one revive instead of
    // dying — restore hp, grant a longer invuln window, and radially shove every nearby enemy
    // off the player so they aren't instantly re-hit the next frame.
    if (run.revives > 0) {
      run.revives -= 1
      // Floored at 1: under BRITTLE, maxHP is 1 and REVIVE_HP_FRAC 0.5 revives you on HALF a hit
      // point, i.e. dead again on the next tick. The revive is a 150-coin shop consumable bought
      // BEFORE the run, and healPlayer's doc block already explains why BLOOD PACT must not be
      // allowed to void it — Brittle was voiding it anyway, through a different door.
      p.hp = Math.max(1, p.maxHP * REVIVE_HP_FRAC)
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
// SUBMISSION (v7.x): an ally is an ELITE THAT TURNED. It stays in run.enemies — that is the
// whole point of the card's form ("the elite, turned"): every behaviour machine, telegraph, affix
// and bake keeps working on it for free, because it is still the same entity in the same array.
// `e.elite` deliberately STAYS TRUE. Clearing it to disable elite-only logic silently swaps the
// texture (render.js swaps ant_elite -> ant) and pops the gold crown off mid-life.
export function isAlly(e) { return (e.allyT ?? 0) > 0 }

// How many of run.enemies are yours. Cheap and only ever non-zero under the anomaly, so the scan
// costs nothing in a normal run.
function allyCount(run) {
  if (!run.anomalies?.submission) return 0
  let n = 0
  for (const e of run.enemies) if (isAlly(e) && !e._dead) n++
  return n
}

function damageImmune(e) {
  if (e._phaseSolid === false) return true
  // An ally takes nothing from anyone. This ONE clause buys two of the owner's rulings at
  // once, because damageImmune is checked by dealDamage (3514), applyDamage (3659) AND
  // contactHarmless (2186): your weapons cannot hurt your ally, and your ally cannot hurt you.
  // Doing it here rather than at 26 separate damage loops is also what makes it impossible to
  // miss one — a missed loop would not throw, it would just kill your ally and read as "the card
  // does nothing".
  if (isAlly(e)) return true
  return false
}

// The ally's target picker. Deliberately NOT nearestEnemy: that one is the PLAYER's aim
// helper and is measured from the player, while an ally hunts from where IT stands.
// ponytail: naive O(allies x enemies) scan, same shape and same ceiling as the seek at
// stepEnemyMovement — upgrade path is the spatial hash that note already names.
function nearestHostile(run, from) {
  let best = null, bestSq = Infinity
  for (const e of run.enemies) {
    if (e._dead || isAlly(e) || e === from) continue
    const dx = e.x - from.x, dy = e.y - from.y
    const dSq = dx * dx + dy * dy
    if (dSq < bestSq) { bestSq = dSq; best = e }
  }
  return best
}

// SUBMISSION: the loan's clock, and the ally's only attack.
//
// CONTACT IS THE WHOLE ARSENAL, and that is not a simplification — it is what the roster actually
// is. Pounce, dive, charge and strafe all resolve to stepContactDamage; of the four
// run.enemyShots push sites three belong to The Blank's scripted boss, which has no elites at all.
// So "it keeps its own attacks" comes down to this loop for every ally in the game bar one.
//
// Damage goes through applyDamage, not dealDamage: the spec grants 100% of your crit and the
// player's damage scaling, and dealDamage skips the crit roll and the multipliers entirely — a
// ally wired to it would deal flat unscaled damage and still look like it worked. Elements
// ride along with applyDamage; that is deliberate (it fights with YOUR damage, elements included)
// and worth knowing, because the spec does not mention it.
//
// EXPIRY DOES NOT ROUTE THROUGH THE DEATH BRANCH. It retires the body here instead, because that
// branch would pay the elite's entire reward a second time. The volatile core is re-fired by hand
// because it is the one gift that already damages the swarm — that is the Unstable Cores
// interaction the spec names as this card's headline.
// ponytail: splitter wisps, `split` children and the acid pool are NOT re-fired on expiry — they
// spawn HOSTILE and would make your ally's death a gift to the swarm. Upgrade path is an allied
// spawn (children inheriting allyT), which is a system, not a card.
function stepSubmission(run, dt) {
  if (!run.anomalies?.submission) return
  // Snapshot the length: applyDamage below can kill a splitter/split enemy, which APPENDS to
  // run.enemies mid-loop. That is the hazard MARTYR's queue and stepBombs' `chained` buffer both
  // exist to dodge — children took the blast they were born into.
  const n = run.enemies.length
  for (let i = 0; i < n; i++) {
    const e = run.enemies[i]
    if (!e || e._dead || !isAlly(e)) continue
    e.allyT -= dt
    if (e.allyT <= 0) {
      e.allyT = 0
      e._dead = true
      // The loan ending reuses `explode`, which already has a render case and an SFX entry —
      // a bespoke `submissionend` was a dead event: nothing drew it and nothing played it.
      run.events.push({ type: 'explode', x: e.x, y: e.y, radius: e.radius * 1.5 })
      if (e.elite && e.affixes && e.affixes.includes('volatile')) {
        run.bombs.push(volatileBomb(run, e.x, e.y))
      }
      continue
    }
    e._allyHitT = (e._allyHitT ?? 0) - dt
    if (e._allyHitT > 0) continue
    for (let j = 0; j < n; j++) {
      const foe = run.enemies[j]
      if (!foe || foe._dead || isAlly(foe) || foe === e) continue
      const dx = foe.x - e.x, dy = foe.y - e.y
      const rad = e.radius + foe.radius
      if (dx * dx + dy * dy > rad * rad) continue
      applyDamage(run, foe, e.dmg * SUBMISSION_DMG_FRAC)
      e._allyHitT = SUBMISSION_HIT_EVERY
      break
    }
  }
}

// v7.16: does this enemy shrug off weapon crowd control — the sector sweeps' knockback, a nova's
// knockback, and fear? Two sources, one meaning: the `anchored` ELITE AFFIX (which already had
// every knockback immunity and now gains fear) and the `unshakeable` ROSTER FLAG carried by one
// tank per chapter. Deliberately narrower than `anchored`'s other uses — this does NOT exempt an
// enemy from hole pull, the straggler teleport, traffic or a hydrant launch, which are hazards
// rather than the crowd control the machine-gun lock was built out of. See FEAR_REFRACTORY.
function resistsCC(e) {
  return !!(e.affixes && e.affixes.includes('anchored')) ||
         !!(e.flags && e.flags.includes('unshakeable'))
}

// GLOBAL CROWD-CONTROL PRICING (v7.17) — see the CC_DR_* block in config.js for the measurements
// and the argument. Two multipliers, read together at every player-sourced CC site:
//   ccScale(run, e) — the price of controlling THIS enemy right now (per-enemy diminishing returns
//     x the player's own ccMul). Read it ONCE per hit and scale every effect of that hit by it, so
//     a nova that both fears and knocks back charges one application rather than two.
//   spendCC(run, e) — call once, after applying, to charge for it.
// A hit that lands with the enemy fully recovered is at FULL strength: this taxes CADENCE, not
// weapons. resistsCC enemies are already excluded upstream and never reach these.
function ccScale(run, e) {
  // Every effect landing on the same enemy on the same frame reads the SAME pre-spend value. Order
  // within a cast is otherwise load-bearing: the roar's shove spent first, so its stagger read the
  // already-halved resistance and staggered for half as long as the shove shoved.
  const dr = e._ccSpentAt === run.time ? (e._ccDRPre ?? 1) : (e._ccDR ?? 1)
  return dr * (run.player.ccMul ?? 1)
}
// ONCE PER FRAME PER ENEMY, not once per effect. A single cast often lands several controls on the
// same enemy on the same frame — a roar shoves AND staggers, a shriek ring fears AND knocks back —
// and charging each one separately halved the resistance two or three times for one swing. That is
// not a cadence tax, it is a tax on having a rich weapon: the roar's stagger mod measured 0.04s of
// stun and the suite caught it. Same-frame calls after the first are free.
function spendCC(run, e) {
  if (e._ccSpentAt === run.time) return
  e._ccSpentAt = run.time
  e._ccDRPre = e._ccDR ?? 1
  e._ccDR = Math.max(CC_DR_FLOOR, (e._ccDR ?? 1) * CC_DR_STEP)
}

// v5.4: is this enemy harmless to touch right now? The mirror of damageImmune (an enemy that can't
// be hit can't hit you either), plus the phases and statuses that disarm an enemy without making it
// invulnerable: a landed toad and a stalled vacuum are punish windows, and a stunned or fleeing
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
  // v7.16: STUN still disarms, FEAR no longer does. A feared enemy runs from you, but one pinned
  // against the crowd behind it is still a threat — half of the machine-gun lock was that a
  // permanent field-wide fear made every enemy on screen literally unable to touch you.
  if ((e.stunT || 0) > 0) return true
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
  let ffx = fx * k, ffy = fy * k

  // v6.4 pond identity: eddies (run.eddies, streamed by streamEddies below) add a local inward
  // pull + tangential swirl on top of the ambient drift above. Squared-distance cull first — this
  // runs per player+enemy+tideCarried-cloud, per frame.
  if (sig.eddies) {
    for (const ed of run.eddies) {
      const dx = ed.x - x, dy = ed.y - y
      const dSq = dx * dx + dy * dy
      if (dSq >= ed.r * ed.r) continue
      const d = Math.sqrt(dSq)
      if (d < 1e-3) continue // at the exact core: no direction to push, skip rather than divide by ~0
      const q = 1 - d / ed.r
      const ux = dx / d, uy = dy / d       // inward unit vector, toward the eddy's center
      const tx = -uy * ed.dir, ty = ux * ed.dir // tangential unit vector, swirl sign per ed.dir
      // pull: deliberately NOT multiplied by run.mods.currentForceMul — the escape invariant
      // `pull + 2√2·k·2 < PLAYER.baseSpeed` must hold even under Riptide; riptide doubles the
      // ambient shove and the swirl spectacle, never the trap vector.
      const pull = sig.eddies.pull * q
      const swirl = sig.eddies.swirl * Math.sin(Math.PI * d / ed.r) * run.mods.currentForceMul
      ffx += ux * pull + tx * swirl
      ffy += uy * pull + ty * swirl
    }
  }
  return { fx: ffx, fy: ffy }
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

// The Surf's tide (Book 2 chapter 1). A chapter-gated no-op exactly like stepCurrents above: a
// chapter that is not the tide returns on the second line.
//
// run._realTime, NOT run.time — the same reason stepShafts gives: the Time Debt anomaly advances
// run.time at TIME_DEBT_MUL (1.5x) and its `chapter` is null, so deriving the phase from run.time
// would multiply the surge by 1.5 and break the ceiling the number was chosen against.
//
// It moves the ENEMIES too. Water that shoves only the player is a control tax; water that shoves
// everything is weather, and it is also the only thing that makes the backwash readable — the crowd
// drifting with you is the tell that you are not simply being nerfed.
// The instantaneous surge, in px/s, as a vector — currentForce's counterpart for this chapter, and
// exported for the same reason currentForce is: render.js samples it to advect the flow streaks and
// to rock the crowd, so "the water is moving" on screen and "the water moved me" in the sim are one
// number rather than two that can drift apart. {fx:0, fy:0} for any chapter that is not the tide,
// so a caller needs no chapter branch of its own.
export function tideForce(run) {
  const sig = CHAPTERS[run.chapter].signature
  if (!sig || sig.type !== 'tide') return { fx: 0, fy: 0 }
  const s = Math.sin((run._realTime / sig.period) * Math.PI * 2)
  return { fx: Math.cos(sig.axis) * sig.surge * s, fy: Math.sin(sig.axis) * sig.surge * s }
}

export function stepTide(run, dt) {
  const sig = CHAPTERS[run.chapter].signature
  if (!sig || sig.type !== 'tide') return
  const { fx: sx, fy: sy } = tideForce(run)
  const fx = sx * dt
  const fy = sy * dt
  const p = run.player
  p.x += fx; p.y += fy
  for (const e of run.enemies) {
    if (e._dead) continue
    e.x += fx; e.y += fy
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
  // v6.9.5: city's grid repeats over the whole plane instead of ending at the urban falloff, so
  // every roadAt/blockSnap call in this function has to be asked the same way the renderer asks it,
  // or buildings would be placed by one map and drawn against another.
  const endless = !!CHAPTERS[run.chapter].endlessGrid
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
      if (roadsOn && roadAt(x, y, worldSeed, endless).onRoad) continue

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
      if (worldSeed != null && (endless || biome === 'downtown' || biome === 'suburbs')) {
        const snapped = blockSnap(x, y, worldSeed, cfg.maxR + STRUCTURE_SETBACK, endless)
        if (snapped) {
          // The snap clears the CITY GRID, which is the only geometry it knows about — a highway
          // running through the same city is a separate segment, and pushing a building off a side
          // street can push it onto one. (Caught by run DD.c: one tower in 147 landed on a highway.)
          // Re-checking after the move is both the cheapest and the most honest fix: it is the same
          // predicate the pre-snap gate already used, so "no structure stands on roadway" holds for
          // every road class without blockSnap having to learn about highways at all.
          if (roadsOn && roadAt(snapped.x, snapped.y, worldSeed, endless).onRoad) continue
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

// -- Eddies (v6.4 pond identity: streamed vortices) -----------------------------------
// Exact copy of streamObstacles' streaming idiom above — own cell size (sig.eddies.cell), own
// _eddyCellI/_eddyCellJ cell cursor (so it re-scans independently of streamObstacles' own
// _obCellI/_obCellJ), same run._obstacleSeed, same OBSTACLE_STREAM_RADIUS/OBSTACLE_DROP_RADIUS —
// but its own function rather than folded into streamObstacles, which already carries a
// chapter's `obstacles` config plus the STRUCTURE_KINDS/road/district machinery an eddy has no
// use for. Own hash salts (11 occupancy, 12 x jitter, 13 y jitter, 14 swirl direction) so an
// eddy's roll never collides with an obstacle's roll at the same cell. ZERO Math.random() at
// step time — same hard rule as streamObstacles (the AA.c/runStarOnly scar).
// Gated on the chapter's signature actually declaring an eddies block (currently pond only) —
// every other chapter, and any chapter before its first obstacle-seeded step, no-ops.
function streamEddies(run) {
  const sig = CHAPTERS[run.chapter].signature
  if (!sig || sig.type !== 'currents' || !sig.eddies) return
  if (run._obstacleSeed == null) return
  const cfg = sig.eddies
  const p = run.player
  const cs = cfg.cell
  const ci = Math.floor(p.x / cs), cj = Math.floor(p.y / cs)
  if (ci === run._eddyCellI && cj === run._eddyCellJ) return // same cell as last scan — field unchanged
  run._eddyCellI = ci; run._eddyCellJ = cj

  for (let k = run.eddies.length - 1; k >= 0; k--) {
    const ed = run.eddies[k]
    if (Math.hypot(ed.x - p.x, ed.y - p.y) > OBSTACLE_DROP_RADIUS) run.eddies.splice(k, 1)
  }
  const live = new Set()
  for (const ed of run.eddies) live.add(ed._cell)

  const seed = run._obstacleSeed
  const span = Math.ceil(OBSTACLE_STREAM_RADIUS / cs)
  for (let i = ci - span; i <= ci + span; i++) {
    for (let j = cj - span; j <= cj + span; j++) {
      const key = i + ',' + j
      if (live.has(key)) continue
      // chance is a DIRECT per-cell occupancy probability (see config.js's doc on signature.eddies).
      if (obstacleCellHash(i, j, seed, 11) >= cfg.chance) continue
      const slack = Math.max(0, cs / 2 - cfg.r - 20) // same jitter-slack formula obstacles uses
      const x = (i + 0.5) * cs + (obstacleCellHash(i, j, seed, 12) - 0.5) * 2 * slack
      const y = (j + 0.5) * cs + (obstacleCellHash(i, j, seed, 13) - 0.5) * 2 * slack
      if (Math.hypot(x, y) < cfg.minDist) continue // spawn-ring clearance from the run ORIGIN
      if (Math.hypot(x - p.x, y - p.y) > OBSTACLE_STREAM_RADIUS) continue
      const dir = obstacleCellHash(i, j, seed, 14) < 0.5 ? -1 : 1 // swirl sign
      run.eddies.push({ x, y, r: cfg.r, dir, _cell: key })
    }
  }
}

// -- Refill circles (v7.x Book 2: The Shelf's sun shafts, The Surf's tide pools) -------
// The fourth copy of streamObstacles' streaming idiom (obstacles -> eddies -> traps -> here): own
// cell size (spec.cell), own _shaftCellI/_shaftCellJ cursor independent of the other three, same
// run._obstacleSeed, same OBSTACLE_STREAM_RADIUS/OBSTACLE_DROP_RADIUS. Own hash salts (20
// occupancy, 21 x jitter, 22 y jitter, 23 drift phase) so a roll here can never collide with an
// obstacle's (0-4), an eddy's (11-14) or a trap's (15-17) at the same cell. ZERO Math.random() at
// step time - the same hard rule all three others state (the AA.c/runStarOnly scar).
//
// GENERALISED (v7.x, run US.c) to feed run.shafts from either chapter's signature via refillSpec()
// (config.js): The Shelf's shafts ARE its signature (refillSpec returns it unchanged — asserted by
// identity, because the Shelf's tune was measured against that exact object), while The Surf's tide
// pools live at signature.pools. Same cell/hash-salt geometry either way, so a pool and a shaft are
// mechanically the same circle with a different name; only The Shelf's own signature carries drift
// (driftAmp/driftHz), which is why stepShafts below still gates on sig.type === 'shafts'.
//
// THIS FUNCTION DECIDES EXISTENCE ONLY. It early-returns whenever the player has not crossed a cell
// boundary, exactly like streamEddies, so anything it computes is computed ONCE per materialization
// and never again - it structurally cannot make a shaft drift. stepShafts below does that, every
// frame. An earlier draft of the plan specified "a direct copy of streamEddies" plus drift and gave
// the drift no per-frame home: shafts would have been frozen except at cell crossings, and nothing
// would have LOOKED broken, because render re-places from the list every frame and would have
// faithfully drawn the frozen field.
//
// Jitter slack subtracts driftAmp, which the other three streamers have no reason to do: their
// objects never move, so they may spend the whole cs/2 - r - 20 budget on jitter. Here jitter and
// drift share it, and the sum has to stay inside the cell or a shaft's collider reaches into the
// neighbour and overlaps that cell's own shaft. (A density artifact, not a correctness break - the
// cell bookkeeping keys `live` on _cell, which drift never touches, so a drifted shaft can neither
// duplicate nor be re-rolled. But it is free to be correct here.) The Surf's pools declare no
// driftAmp, so `amp` below is 0 there and the whole slack budget goes to jitter, exactly like the
// three non-drifting streamers.
export function streamShafts(run) {
  const sig = CHAPTERS[run.chapter].signature
  const spec = refillSpec(sig)
  if (!spec) return
  if (run._obstacleSeed == null) return
  const p = run.player
  const cs = spec.cell
  const ci = Math.floor(p.x / cs), cj = Math.floor(p.y / cs)
  if (ci === run._shaftCellI && cj === run._shaftCellJ) return // same cell as last scan - field unchanged
  run._shaftCellI = ci; run._shaftCellJ = cj

  for (let k = run.shafts.length - 1; k >= 0; k--) {
    const sh = run.shafts[k]
    if (Math.hypot(sh.bx - p.x, sh.by - p.y) > OBSTACLE_DROP_RADIUS) run.shafts.splice(k, 1)
  }
  const live = new Set()
  for (const sh of run.shafts) live.add(sh._cell)

  const seed = run._obstacleSeed
  const span = Math.ceil(OBSTACLE_STREAM_RADIUS / cs)
  const amp = spec.driftAmp ?? 0
  for (let i = ci - span; i <= ci + span; i++) {
    for (let j = cj - span; j <= cj + span; j++) {
      const key = i + ',' + j
      if (live.has(key)) continue
      if (obstacleCellHash(i, j, seed, 20) >= spec.chance) continue
      const slack = Math.max(0, cs / 2 - spec.r - 20 - amp) // see the driftAmp note above
      const bx = (i + 0.5) * cs + (obstacleCellHash(i, j, seed, 21) - 0.5) * 2 * slack
      const by = (j + 0.5) * cs + (obstacleCellHash(i, j, seed, 22) - 0.5) * 2 * slack
      if (Math.hypot(bx, by) < spec.minDist) continue // spawn-ring clearance from the run ORIGIN
      if (Math.hypot(bx - p.x, by - p.y) > OBSTACLE_STREAM_RADIUS) continue
      // Drift phase from the cell hash, so two neighbouring shafts are never in lockstep and the
      // whole field does not pulse in unison. Stored, not re-derived, because x/y are recomputed
      // every frame and a per-frame hash would be the one avoidable cost in that loop.
      const phase = obstacleCellHash(i, j, seed, 23) * Math.PI * 2
      run.shafts.push({ x: bx, y: by, bx, by, r: spec.r, phase, _cell: key })
    }
  }
}

// Shaft drift (v7.x). Pure function of run._realTime and the shaft's own phase: stores no state,
// consumes no RNG, and is therefore identical across a reload or a re-run of the same seed.
//
// run._realTime, NOT run.time. The Time Debt anomaly advances run.time at TIME_DEBT_MUL (1.5x, see
// the step order above) and its `chapter` is null so it rolls in The Shelf - deriving drift from
// run.time would multiply peak drift speed by 1.5 and push the shipped tune (63 px/s) to 95, within
// a rounding error of the KITE_MIN_SPEED ceiling the number was chosen to sit under. _realTime
// exists precisely to be a unit that means the same thing in every run.
//
// x uses cos and y uses sin of the SAME angle, so a shaft travels a small circle at a CONSTANT
// speed of driftAmp x driftHz rather than easing to a halt at each end of a line. A shaft that
// stops dead twice a cycle reads as a stutter, and the number checked against the ceiling would
// then be a peak rather than the speed it actually holds.
function stepShafts(run) {
  const sig = CHAPTERS[run.chapter].signature
  if (!sig || sig.type !== 'shafts' || !run.shafts.length) return
  const amp = sig.driftAmp ?? 0
  if (!amp) return
  const a = run._realTime * (sig.driftHz ?? 0)
  for (const sh of run.shafts) {
    sh.x = sh.bx + Math.cos(a + sh.phase) * amp
    sh.y = sh.by + Math.sin(a + sh.phase) * amp
  }
}

// Sandbars (Book 2 / The Surf). The FIFTH copy of streamObstacles' streaming idiom (obstacles ->
// eddies -> traps -> shafts -> here): own cell size (sig.bars.cell), own _sandCellI/_sandCellJ
// cursor, same run._obstacleSeed, same OBSTACLE_STREAM_RADIUS/OBSTACLE_DROP_RADIUS. Own hash salts
// (30 occupancy, 31 x jitter, 32 y jitter) so a sandbar's roll can never collide with an obstacle's
// (0-4), an eddy's (11-14), a trap's (15-17) or a shaft's (20-23) at the same cell.
//
// ZERO Math.random() at step time — the same hard rule the other four state, and run US.b asserts it
// by making Math.random throw. A sandbar never moves, so unlike a shaft it spends the whole jitter
// budget and has no per-frame step of its own.
export function streamSandbars(run) {
  const sig = CHAPTERS[run.chapter].signature
  const spec = sig && sig.type === 'tide' ? sig.bars : null
  if (!spec) return
  if (run._obstacleSeed == null) return
  const p = run.player
  const cs = spec.cell
  const ci = Math.floor(p.x / cs), cj = Math.floor(p.y / cs)
  if (ci === run._sandCellI && cj === run._sandCellJ) return
  run._sandCellI = ci; run._sandCellJ = cj

  for (let k = run.sandbars.length - 1; k >= 0; k--) {
    if (Math.hypot(run.sandbars[k].x - p.x, run.sandbars[k].y - p.y) > OBSTACLE_DROP_RADIUS) run.sandbars.splice(k, 1)
  }
  const live = new Set()
  for (const b of run.sandbars) live.add(b._cell)

  const seed = run._obstacleSeed
  const span = Math.ceil(OBSTACLE_STREAM_RADIUS / cs)
  for (let i = ci - span; i <= ci + span; i++) {
    for (let j = cj - span; j <= cj + span; j++) {
      const key = i + ',' + j
      if (live.has(key)) continue
      if (obstacleCellHash(i, j, seed, 30) >= spec.chance) continue
      const slack = Math.max(0, cs / 2 - spec.r - 20)
      const x = (i + 0.5) * cs + (obstacleCellHash(i, j, seed, 31) - 0.5) * 2 * slack
      const y = (j + 0.5) * cs + (obstacleCellHash(i, j, seed, 32) - 0.5) * 2 * slack
      if (Math.hypot(x, y) < spec.minDist) continue
      if (Math.hypot(x - p.x, y - p.y) > OBSTACLE_STREAM_RADIUS) continue
      run.sandbars.push({ x, y, r: spec.r, _cell: key })
    }
  }
}

// Is the player standing on dry ground? Centre-to-centre against the patch radius, exactly like
// stepCharge's shaft test — standing ON it, not brushing its edge.
export function onSandbar(run) {
  const p = run.player
  for (const b of run.sandbars) if (Math.hypot(b.x - p.x, b.y - p.y) <= b.r) return true
  return false
}

// The chapter resource bar (v7.x Book 2). A chapter-gated no-op exactly like stepCurrents and
// streamTraps - a chapter that declares no `resource` returns on the first line and its run.charge
// stays the 0 createRun gave it, which is what lets this live in main from day one with no flag.
//
// Drains passively and refills while the player stands in a shaft (or, on The Surf, a tide pool —
// both live in run.shafts, see streamShafts' generalisation). Kill refills arrive separately, at the
// kill site, because they are not a per-frame quantity.
//
// dryMul (v7.x, run US.c): The Surf's sandbars multiply the drain while you stand on one, via
// signature.bars.drainMul — onSandbar(run) is the same position test streamSandbars/stepPlayer use.
// Gated on sig.type === 'tide' so The Shelf (no sandbars, no `bars` block) never reads this at all.
export function stepCharge(run, dt) {
  const res = CHAPTERS[run.chapter].resource
  if (!res) return
  const sig = CHAPTERS[run.chapter].signature
  const dryMul = sig && sig.type === 'tide' && onSandbar(run) ? sig.bars.drainMul : 1
  let c = run.charge - res.drain * dryMul * dt
  const p = run.player
  for (const sh of run.shafts) {
    // Centre-to-centre against the shaft radius: standing IN the light, not brushing its edge.
    if (Math.hypot(sh.x - p.x, sh.y - p.y) <= sh.r) { c += res.refill * dt; break }
  }
  run.charge = Math.max(0, Math.min(res.max, c))
}

// -- Snap traps (v6.5 undergrowth identity: streamed) ---------------------------------
// Exact copy of streamEddies' idiom above (itself a copy of streamObstacles') — own cell size
// (sig.traps.cell), own _trapCellI/_trapCellJ cell cursor (independent of streamObstacles' and
// streamEddies' cursors), same run._obstacleSeed, same OBSTACLE_STREAM_RADIUS/OBSTACLE_DROP_RADIUS.
// Own hash salts (15 occupancy, 16 x jitter, 17 y jitter) so a trap's roll never collides with an
// obstacle's (0-4) or an eddy's (11-14) roll at the same cell. ZERO Math.random() at step time —
// same hard rule as streamObstacles/streamEddies (the AA.c/runStarOnly scar).
// v6.5: this REPLACES the old createRun-time scatterField seeding (state.js's generateTraps) —
// that field was a fixed set of entries around the run's ORIGIN, so a run that walked away from
// (0,0) walked out of the entire signature mechanic ("the signature is dead 15 seconds in", the
// defect this rework exists to kill). Streaming means the field is everywhere, always.
// Jitter slack uses the SNAP_TRAP_R CONSTANT directly, not a cfg.r read — unlike sig.eddies, the
// traps config block carries no radius (every trap is SNAP_TRAP_R); reading cfg.r here would NaN
// every coordinate.
// Sprung state survives streaming via run._trapRearm (a Map, state.js): a cell that streams out
// past OBSTACLE_DROP_RADIUS and is later re-scanned looks up its OWN rearmAt (keyed by cell) rather
// than defaulting back to armed — a trap that snapped 1s before you turned around shouldn't forget
// it did the instant it leaves render range. The ledger entry is deleted once the trap is read back
// as armed (lazy expiry — nothing needs to sweep it separately).
function streamTraps(run) {
  const sig = CHAPTERS[run.chapter].signature
  if (!sig || sig.type !== 'predators' || !sig.traps) return
  if (run._obstacleSeed == null) return
  const cfg = sig.traps
  const p = run.player
  const cs = cfg.cell
  const ci = Math.floor(p.x / cs), cj = Math.floor(p.y / cs)
  if (ci === run._trapCellI && cj === run._trapCellJ) return // same cell as last scan — field unchanged
  run._trapCellI = ci; run._trapCellJ = cj

  for (let k = run.traps.length - 1; k >= 0; k--) {
    const tr = run.traps[k]
    if (Math.hypot(tr.x - p.x, tr.y - p.y) > OBSTACLE_DROP_RADIUS) run.traps.splice(k, 1)
  }
  const live = new Set()
  for (const tr of run.traps) live.add(tr._cell)

  const seed = run._obstacleSeed
  const span = Math.ceil(OBSTACLE_STREAM_RADIUS / cs)
  for (let i = ci - span; i <= ci + span; i++) {
    for (let j = cj - span; j <= cj + span; j++) {
      const key = i + ',' + j
      if (live.has(key)) continue
      // chance is a DIRECT per-cell occupancy probability (see config.js's doc on signature.traps),
      // widened by trapCountMul (Trap Season anomaly — see MUTATOR_MOD_KEYS' doc in config.js).
      if (obstacleCellHash(i, j, seed, 15) >= cfg.chance * (run.mods.trapCountMul ?? 1)) continue
      const slack = Math.max(0, cs / 2 - SNAP_TRAP_R - 20) // same jitter-slack formula obstacles/eddies use
      const x = (i + 0.5) * cs + (obstacleCellHash(i, j, seed, 16) - 0.5) * 2 * slack
      const y = (j + 0.5) * cs + (obstacleCellHash(i, j, seed, 17) - 0.5) * 2 * slack
      if (Math.hypot(x, y) < cfg.minDist) continue // spawn-ring clearance from the run ORIGIN
      if (Math.hypot(x - p.x, y - p.y) > OBSTACLE_STREAM_RADIUS) continue
      const at = run._trapRearm.get(key) ?? 0
      const armed = run.time >= at
      if (armed && at > 0) run._trapRearm.delete(key) // lazy expiry
      run.traps.push({ x, y, r: SNAP_TRAP_R, armed, rearmAt: armed ? 0 : at, _cell: key })
    }
  }
}

// v6.5.1 enemy separation (owner directive, all chapters): "enemies should not stack perfectly —
// in the boss level the larvae stack 50 on top of each other and you only see one. 80% stack, not
// 100%." — tuned to a 60% stack on the owner's live follow-up. Two enemies may overlap until
// their centers are within ENEMY_SEP_FRAC of their combined radii. Each overlapping pair is pushed apart by
// ENEMY_SEP_RESOLVE of the intrusion this frame — 1 in practice, i.e. snapped to minSep, the
// stepObstacles idiom. It MUST be a full snap: enemies converging on the player's exact point
// close faster per frame than a soft resolve pushes back out, so a partial resolve equilibrates
// a dense knot at sub-pixel spread — the one-sprite pile this pass exists to prevent (see
// ENEMY_SEP_RESOLVE's doc in config.js). Contradicting pair fixes in a crowd cost only a few px
// of residual jitter, invisible at sprite scale.
// Pairs are found via a spatial hash (module-scope reusable Map, cleared per call — no per-frame
// Map allocation) instead of the naive O(n^2) scan: the blank boss fight alone can hold ~700 live
// enemies, and 700^2/2 ≈ 244k pair checks/frame is not a phone-friendly budget. Bucketing by
// ENEMY_SEP_CELL and only visiting each enemy's own cell plus the 4 "forward" neighbor cells
// (the standard half-neighborhood trick) checks every unordered pair exactly once.
// Excluded outright: `_dead` corpses, `_phaseSolid === false` ghosted phase-flicker enemies (same
// rule stepObstacles uses, above), `rosterId === 'bindnode'` (the blank's stationary binding
// nodes — speedMul 0 by design, nothing to separate), and any `affixes.includes('anchored')`
// enemy — the blank boss's own marker ("knockback/pull immune — checked by every kb site", see
// spawnBlankEnemy) — separation is morally a knockback site: shoving the boss off its scripted
// band/phase movement would be exactly the bug anchored exists to prevent.
const _sepBuckets = new Map() // cellKey ('ci,cj') -> array of run.enemies INDICES, rebuilt every call
const SEP_NEIGHBOR_OFFSETS = [[1, 0], [-1, 1], [0, 1], [1, 1]]
function stepEnemySeparation(run) {
  const buckets = _sepBuckets
  buckets.clear()

  // Pass 1: bucket every eligible enemy by its cell.
  for (let i = 0; i < run.enemies.length; i++) {
    const e = run.enemies[i]
    if (e._dead) continue
    if (e._phaseSolid === false) continue // v5.4: a ghosted phase flicker passes through everything
    if (e.rosterId === 'bindnode') continue // v5.24: stationary by design, nothing to separate
    if (e.affixes && e.affixes.includes('anchored')) continue // knockback/pull immune — checked by every kb site; separation is morally a kb site
    const ci = Math.floor(e.x / ENEMY_SEP_CELL)
    const cj = Math.floor(e.y / ENEMY_SEP_CELL)
    const key = ci + ',' + cj
    let bucket = buckets.get(key)
    if (!bucket) { bucket = []; buckets.set(key, bucket) }
    bucket.push(i)
  }
  if (buckets.size === 0) return

  // Pass 2: within each bucket, resolve against later entries in the SAME bucket (each intra-cell
  // pair once) and against the 4 forward neighbor buckets (each inter-cell pair once — the usual
  // half-neighborhood trick: the other 4 of the 8 neighbors are covered when THEY are the "own"
  // bucket being processed).
  for (const [key, bucket] of buckets) {
    const comma = key.indexOf(',')
    const ci = Number(key.slice(0, comma))
    const cj = Number(key.slice(comma + 1))

    for (let a = 0; a < bucket.length; a++) {
      for (let b = a + 1; b < bucket.length; b++) {
        resolveSeparationPair(run, bucket[a], bucket[b])
      }
    }
    for (const [di, dj] of SEP_NEIGHBOR_OFFSETS) {
      const nBucket = buckets.get((ci + di) + ',' + (cj + dj))
      if (!nBucket) continue
      for (const ia of bucket) {
        for (const ib of nBucket) {
          resolveSeparationPair(run, ia, ib)
        }
      }
    }
  }
}

// Push one pair of enemy INDICES (into run.enemies) apart if they're stacked past ENEMY_SEP_FRAC
// of their combined radii. i, j are run.enemies indices, i < j (see the two call sites above).
function resolveSeparationPair(run, i, j) {
  const a = run.enemies[i], b = run.enemies[j]
  const dx = b.x - a.x, dy = b.y - a.y
  const minSep = ENEMY_SEP_FRAC * (a.radius + b.radius)
  const distSq = dx * dx + dy * dy
  if (distSq >= minSep * minSep) return // squared-distance early-out, like every other pair loop in the file
  const d = Math.sqrt(distSq)
  let nx, ny, push
  if (d > 1e-6) {
    nx = dx / d; ny = dy / d
    push = (minSep - d) / 2 * ENEMY_SEP_RESOLVE
  } else {
    // Exactly coincident (the stacked-spawn case) — no direction to normalize. Deterministic
    // per-PAIR angle (golden-angle by i, golden-ratio offset by j); ZERO Math.random() (this runs
    // every frame on tested paths). It MUST vary with BOTH indices: keyed on i alone, every
    // partner of the same first enemy gets pushed along the SAME direction — a 6-deep knot's
    // members B..F all land on one new shared point and the pile never disperses (found live in
    // the blank's probe swarm; two-enemy tests can't see it).
    const ang = (i * 2.399963 + j * 1.618034) % (Math.PI * 2)
    nx = Math.cos(ang); ny = Math.sin(ang)
    push = minSep / 2 * ENEMY_SEP_RESOLVE
  }
  a.x -= nx * push; a.y -= ny * push
  b.x += nx * push; b.y += ny * push
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
    // flyover (v6.9, city's pigeon): it is a BIRD — buildings are not terrain to it. This is the
    // whole of the flag; it does not change speed, seek or contact damage, so a flyover enemy is an
    // ordinary chaser that happens to take the straight line while everything else goes around.
    if (e.flags && e.flags.includes('flyover')) continue
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
    // `grow` (the blank's P3 star, BLANK_BAND_GROW): the strip reaches its authored length over
    // `grow` seconds from the moment it goes live, expanding from its centre. The hitbox below IS
    // the current length, so the arms SWEEP — the far end arrives a second after the near end,
    // which is the whole point (a star that lands at full extent hits everyone at once). _lenFull
    // is captured on the first live frame, so the length stays authored in exactly one place and
    // the telegraph still draws at full extent during the fuse.
    if (s.grow) {
      s._lenFull ??= s.len
      s._grown = (s._grown ?? 0) + dt
      s.len = s._lenFull * Math.min(1, s._grown / s.grow)
    }
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

// -- Predators signature mechanic (v5.4, e.g. undergrowth; v6.5 streamed) -------------
// Snap traps (run.traps, STREAMED by streamTraps above — no longer seeded once at createRun, see
// that function's doc for why). Permanent field furniture: they never expire, they only spring and
// re-arm. An ARMED trap containing the center of the player OR of any enemy snaps on THAT ONE
// entity and goes on cooldown (rearmAt, an absolute run.time — see run._trapRearm's doc, state.js,
// for how this survives a sprung trap streaming out of range and back).
// It damages BOTH sides, and that IS the mechanic: the trap field is only a hazard until you learn
// to kite the swarm across it. Gated on the chapter's 'predators' signature so a trap array in a
// future chapter could mean something else.
// v6.5 panel: enemy-side damage now scales by hpScale(run.time) — a flat SNAP_TRAP_DMG on both
// sides looks symmetric but isn't, against enemy HP that climbs 7.6x by late-run; the player side
// stays flat because the player's own toughness doesn't scale the same way. The enemy loop skips
// any enemy mid-'leap' (pounce's airborne phase, Task 2) — it flies OVER traps on the way in;
// this is the deliberate reversal of an earlier draft that let a leap's center cross a trap and
// spring it for plain damage before landing, which cannibalized the land-slam (Task 2 stepPounce)
// that's supposed to own the interaction.
// @returns true if the player died this frame (phase set to 'dead').
function stepTraps(run, dt) {
  if (!run.traps || run.traps.length === 0) return false
  const sig = CHAPTERS[run.chapter].signature
  if (!sig || sig.type !== 'predators') return false
  const p = run.player
  let playerDied = false

  for (const tr of run.traps) {
    if (!tr.armed) {
      if (run.time >= tr.rearmAt) {
        tr.armed = true
        if (tr._cell != null) run._trapRearm.delete(tr._cell)
      }
      continue
    }
    const rSq = tr.r * tr.r
    // The player trips it first when they're standing in it — but an invulnerable player walks over
    // a trap without springing it (it would otherwise be spent for free, on nothing).
    // DEADFALL (v7.2) uses the same door: the traps stop noticing you entirely, so the field turns
    // from something you route AROUND into furniture you kite enemies ACROSS. Skipping the branch
    // (rather than zeroing the damage) is what keeps the trap armed for the pack behind you —
    // springing it on the player would spend it on nothing, which is the case this guard exists for.
    if (p.invuln <= 0 && !run.anomalies?.deadfall) {
      const dx = p.x - tr.x, dy = p.y - tr.y
      if (dx * dx + dy * dy <= rSq) {
        springTrap(run, tr)
        if (!playerDied && hurtPlayer(run, SNAP_TRAP_DMG)) playerDied = true
        continue
      }
    }
    for (const e of run.enemies) {
      if (e._dead) continue
      if (e._pounceState === 'leap') continue // airborne — the landing owns the interaction (Task 2)
      const dx = e.x - tr.x, dy = e.y - tr.y
      if (dx * dx + dy * dy > rSq) continue
      springTrap(run, tr)
      dealDamage(run, e, SNAP_TRAP_DMG * hpScale(run.time), false)
      break // one entity per snap
    }
  }
  return playerDied
}

function springTrap(run, tr) {
  tr.armed = false
  // DEADFALL's second half: the field cycles ~5x faster, which is what makes it a weapon rather
  // than merely a hazard you are immune to. Without this the card is "one fewer thing hurts you",
  // which is a stat in a costume.
  tr.rearmAt = run.time + SNAP_TRAP_REARM * (run.anomalies?.deadfall ? DEADFALL_REARM_MUL : 1)
  if (tr._cell != null) run._trapRearm.set(tr._cell, tr.rearmAt) // hand-placed test traps carry no _cell — stay ledger-free
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
  rollTrafficLane(run, dt)
  rollMowerLane(run, dt)
  return stepLanePasses(run, dt)
}

/** City's traffic signature rolling its own lanes. A no-op in every other chapter. */
function rollTrafficLane(run, dt) {
  const sig = CHAPTERS[run.chapter].signature
  if (!sig || sig.type !== 'traffic') return
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
      const ra = seed != null ? roadAt(p.x, p.y, seed, !!CHAPTERS[run.chapter].endlessGrid) : { onRoad: false }
      let x, y, angle
      if (ra.onRoad && ra.dist <= TRAFFIC_SNAP_R) {
        // Tier 1: on/near a road — snap the lane fully onto its centerline, using roadAt's SIGNED
        // `off`. v6.9.1: this used to recover the sign by re-querying roadAt 8px to one side and
        // seeing whether `dist` shrank, which is wrong for exactly the case the snap exists for —
        // a player standing ON the line. Within 8px the probe crosses the centreline, `dist` does
        // not shrink, the sign comes back negative, and the band is laid 2*dist off the road it was
        // supposed to snap to. (Same bug, same fix, as render.js's carriageway.)
        const px = -Math.sin(ra.angle), py = Math.cos(ra.angle)
        // Perpendicular correction only — the along-axis coordinate stays exactly the player's, so
        // the band's length is centered on them (not merely overlapping): the always-crosses-the-
        // player invariant survives even a full snap onto the road.
        x = p.x - px * ra.off
        y = p.y - py * ra.off
        angle = ra.angle + (dirRoll < 0.5 ? 0 : Math.PI)
      } else {
        const near = seed != null ? nearestCity(p.x, p.y, seed) : null
        if (near) {
          // Tier 2: off-road but inside a city — angle snaps to the grid; the van jumps the curb
          // and still comes straight for the player via the ordinary crossing offset below.
          // v6.9.2: the grid is the WORLD's and axis-aligned, so the four headings are simply the
          // four axes — a city no longer carries a rotation to add them to.
          angle = dirRoll < 0.25 ? 0 : dirRoll < 0.5 ? Math.PI : dirRoll < 0.75 ? Math.PI / 2 : -Math.PI / 2
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
        phase: 'warn', t: TRAFFIC_WARN, warnT: TRAFFIC_WARN, carT: 0,
        // v6.6.14: every number the stepper needs is snapshotted ON THE LANE — originally just
        // `dmg`, so a mid-run retune couldn't desync a live lane, and now the rest of it too so a
        // second vehicle (the garden's mower) can ride the same stepper with its own dimensions
        // instead of the stepper reaching for TRAFFIC_* module constants behind its back.
        dmg: TRAFFIC_DMG, sweep: TRAFFIC_SWEEP, deckLen: TRAFFIC_CAR_LEN, deckW: TRAFFIC_CAR_W,
        kb: TRAFFIC_KB, enemyFrac: TRAFFIC_ENEMY_HP_FRAC,
        look: 'car', cover: true,
        hitIds: new Set(),
      })
    }
  }
}

// -- The Mower (v6.6.14, garden's `mower` elite flag — see the MOWER_* block in config.js) -------
// One pass at a time, on a RUN-level timer that is armed while any mower-flagged elite is alive.
// Deliberately not per-elite: elite cadence falls to ~12s late while garden tanks pass 4000 HP, so
// concurrent elites are routine and a per-elite timer (what sprayStrip did) would have stacked
// independent 96px sweeps from different angles with no ceiling. The city caps this with
// signature.lanes; here the single timer IS the cap.
function rollMowerLane(run, dt) {
  if (!CHAPTERS[run.chapter].mower) return
  if (run.time < MOWER_FIRST_T) return                    // the opening minute stays calm
  run._mowerAcc = (run._mowerAcc ?? 0) - dt
  if (run._mowerAcc > 0) return
  // Re-roll the gap every time, so passes never settle into a rhythm you can tune out.
  run._mowerAcc = MOWER_GAP_MIN + Math.random() * (MOWER_GAP_MAX - MOWER_GAP_MIN)
  if (run.lanes.length > 0) return                        // one mower at a time, chapter-wide
  const p = run.player
  // Traffic's tier-3 shape — random heading, then a perpendicular offset — but MOWER_OFFSET is
  // deliberately UNDER the deck half-width, so unlike the taxi this always crosses a standing
  // player: the offset varies WHERE across you it passes, not WHETHER. Escaping is the player's
  // job and MOWER_WARN is generous about it (286px of travel at base speed, for 48px of clearance).
  // Two draws, and no existing seeded test reaches this — see the panel's RNG-budget note.
  const angle = Math.random() * Math.PI * 2
  const off = (Math.random() * 2 - 1) * MOWER_OFFSET
  run.lanes.push({
    x: p.x - Math.sin(angle) * off,
    y: p.y + Math.cos(angle) * off,
    angle, len: MOWER_LEN, w: MOWER_W,
    phase: 'warn', t: MOWER_WARN, warnT: MOWER_WARN, carT: 0,
    // Snapshotted at roll time like every other lane number: the player's flat damage ramps with
    // run.time, so a pass hits for what it was worth when it started, not when it lands.
    dmg: mowerDmgAt(run.time), sweep: MOWER_SWEEP, deckLen: MOWER_DECK_LEN, deckW: MOWER_DECK_W,
    kb: MOWER_KB, enemyFrac: MOWER_ENEMY_HP_FRAC, look: 'mower', dot: true,
    mows: true,   // v6.6.25: this deck clears foliage/webs/trails — see stepLanePasses

    cover: false, // a grass stalk does not stop a mower — and render must not ring one as if it did
    hitIds: new Set(),
  })
}

/**
 * Steps every live lane, whatever pushed it: telegraph, then a vehicle crosses and flattens both
 * sides. Runs in ANY chapter — the signature gate lives on the traffic ROLL, not here, so the
 * garden's mower gets the whole contract (telegraph, one hit per enemy per pass, knockback) free.
 * @returns true if the player died this frame.
 */
function stepLanePasses(run, dt) {
  const p = run.player
  let playerDied = false
  for (const lane of run.lanes) {
    // Every lane field below falls back to the city's constant when absent, so the hand-built
    // lane literals in the test suite keep meaning exactly what they meant before v6.6.14.
    const sweepT = lane.sweep ?? TRAFFIC_SWEEP
    lane.t -= dt
    if (lane.phase === 'warn') {
      if (lane.t <= 0) { lane.phase = 'sweep'; lane.t = sweepT; lane.carT = 0 }
      continue // telegraph: nothing is damaged
    }
    lane.carT = Math.min(1, Math.max(0, 1 - lane.t / sweepT))
    const cos = Math.cos(lane.angle), sin = Math.sin(lane.angle)
    const cx = lane.x + cos * (lane.carT - 0.5) * lane.len
    const cy = lane.y + sin * (lane.carT - 0.5) * lane.len

    // The vehicle's hitbox: a deckLen × deckW box on (cx, cy), aligned to the lane. The mower's
    // deck is short and wide where the taxi is long and narrow, so these ride the lane.
    const deckLen = lane.deckLen ?? TRAFFIC_CAR_LEN
    const deckW = lane.deckW ?? TRAFFIC_CAR_W
    const inCar = (x, y, pad) => {
      const dx = x - cx, dy = y - cy
      const along = dx * cos + dy * sin
      const perp = -dx * sin + dy * cos
      return Math.abs(along) <= deckLen / 2 + pad && Math.abs(perp) <= deckW / 2 + pad
    }

    // v6.6.14: a lane may hurt the player as an ordinary hit (the taxi) or as a dot (the mower).
    // The mower is dot-flagged to hold EXACT parity with the spray strip it replaces: dot bypasses
    // armour and grants no invulnerability. That second half is the load-bearing one — a normal hit
      // hands out PLAYER.invulnTime, so a guaranteed pass on every gap would give a standing
    // armoured player ~21% uptime of blanket immunity from the swarm, measurably undoing v6.3.4's
    // anti-turtle work (run MM.c: the turtle kept 25 more hp with the mower as a normal hit).
    // A dot grants no invuln, so "once per pass" stops being implicit and needs saying out loud.
    const dotHit = lane.dot === true
    const mayHit = dotHit ? !lane._hitPlayer : p.invuln <= 0
    if (!playerDied && mayHit && inCar(p.x, p.y, 0)) {
      // v6.3 Task 4: cover first — see findCover's doc above. lane._coverUsed caps it at one save
      // per lane pass, same spirit as hitIds capping enemy hits below.
      const shield = (lane._coverUsed || lane.cover === false) ? null : findCover(run, cx, cy, p.x, p.y)
      if (shield) {
        lane._coverUsed = true // one save per pass — and the car totals the shield
        const idx = run.obstacles.indexOf(shield)
        if (idx >= 0) run.obstacles.splice(idx, 1)
        run._crushed.add(shield._cell) // permanent — streamObstacles must never re-roll this cell
        // v6.3 Task 4b: the event's kind is forced to 'dumpster', NOT shield.kind — o.kind is one of
        // the uniform STRUCTURE_KINDS (tower/house/tree/pier/barn/silo), so an unmodified emit could
        // have a shielding bin explode into "pier" harbour-timber dust. shield.kind ITSELF is left
        // untouched (streamObstacles/syncObstacles still own its shape/baked-prop pick).
        run.events.push({ type: 'crush', x: shield.x, y: shield.y, kind: 'dumpster' })
        // Without this bump render keeps drawing the (now-spliced) obstacle until the next natural
        // cell crossing re-triggers streamObstacles — see stepCrush's identical line above.
        run._obstacleRev = (run._obstacleRev || 0) + 1
      } else {
        lane._hitPlayer = true // for a dot lane this IS the once-per-pass guard
        if (hurtPlayer(run, lane.dmg, dotHit)) playerDied = true
      }
      // For a normal hit, invuln makes "once per pass" implicit, the way contact damage does.
    }
    for (const e of run.enemies) {
      if (e._dead || isAlly(e) || lane.hitIds.has(e.id)) continue   // SUBMISSION: pass THROUGH an ally — immune, but blocks nothing
      if (!inCar(e.x, e.y, e.radius)) continue
      lane.hitIds.add(e.id) // one hit per enemy per pass
      // EVERY enemy takes lane.enemyFrac of its OWN max hp — drones, rats and elites alike — so a
      // vehicle keeps mattering as hpScale climbs (see TRAFFIC_ENEMY_HP_FRAC / MOWER_ENEMY_HP_FRAC
      // in config.js). Falls back to the flat lane.dmg only for a lane that declares no fraction at
      // all, which is the hand-built lane literals in the test suite.
      //
      // v6.9.3 (owner: "car one shots drones. it should do 50% hp damage"). There used to be a
      // TRAFFIC_SQUASH roadkill list — non-elite ratDrone/pigeon/rat/patrolDrone were dealt their
      // REMAINING hp instead, i.e. one-shot — which is where both halves of the reported damage bug
      // came from: the number on screen was "whatever was left", never 50%, and rounding it was what
      // produced the 0s. The list is gone rather than tuned; one rule for the whole roster is also
      // the only version anyone can predict from the card text.
      // v6.10.3: the light street life never survives a vehicle (TRAFFIC_ROADKILL — pigeons and
      // rats, non-elite only). Dealt as MAX hp rather than remaining hp so the number that pops is
      // the same every time; see the constant's comment for why "remaining" was a bug.
      const roadkill = !e.elite && TRAFFIC_ROADKILL.includes(e.rosterId)
      const toEnemy = roadkill ? e.maxHP
        : lane.enemyFrac > 0 ? Math.max(1, e.maxHP * lane.enemyFrac) : lane.dmg
      dealDamage(run, e, toEnemy, false)
      const kb = lane.kb ?? TRAFFIC_KB
      e.kb.x += cos * kb
      e.kb.y += sin * kb
    }
    // v6.6.25 (owner: "when a grass is cut by the lawnmower, the bush/herb/leaves/obstacles/
    // spiderwebs etc should disappear"): the deck clears the ground it drives over. Only a lane
    // that says so does this — the taxi drives on asphalt and must not defoliate a street.
    // The two collections use DIFFERENT tests on purpose:
    //   - an obstacle is a solid thing, so the blade touching any part of it fells the whole
    //     (o.r pad — the same overlap rule stepCrush uses for a crushed structure), and it is
    //     removed the same permanent way, or streamObstacles re-rolls the identical bush back in
    //     from its pure hash the next time the player crosses a cell boundary.
    //   - a web (and a pheromone trail) is a flat PATCH of ground, ~1.5x wider than the deck
    //     itself. Overlap there would shred a 240px swath for a 96px cut, so these go only when
    //     the deck passes over their CENTRE. Neither is permanent: spiders spin new webs and ants
    //     lay new trails immediately, which is exactly the intended loop.
    if (lane.mows) {
      if (run.obstacles && run.obstacles.length > 0) {
        let cut = false
        for (let i = run.obstacles.length - 1; i >= 0; i--) {
          const o = run.obstacles[i]
          if (!inCar(o.x, o.y, o.r)) continue
          run.obstacles.splice(i, 1)
          run._crushed.add(o._cell)
          cut = true
          run.events.push({ type: 'mow', x: o.x, y: o.y, r: o.r })
        }
        // render's syncObstacles only rebuilds when this changes — without the bump it keeps
        // drawing the bush that is no longer there (same line stepCrush and the cover path carry).
        if (cut) run._obstacleRev = (run._obstacleRev || 0) + 1
      }
      if (run.webs && run.webs.length > 0) {
        const kept = run.webs.filter((w) => !inCar(w.x, w.y, 0))
        if (kept.length !== run.webs.length) {
          for (const w of run.webs) if (inCar(w.x, w.y, 0)) run.events.push({ type: 'mow', x: w.x, y: w.y, r: w.r })
          run.webs = kept
        }
      }
      if (run.trails && run.trails.length > 0) run.trails = run.trails.filter((tr) => !inCar(tr.x, tr.y, 0))
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

// A volatile corpse bomb. `core` marks the ones ANOMALIES.unstableCores grants (v6.7.7): those
// scale their ENEMY-side damage with hpScale and chain off whatever they kill — see
// CORE_BLAST_ENEMY_MUL in config.js for why only the enemy side scales. `src` stays 'volatile'
// either way: render.js's bombSrc knows that value and nothing else, and an unknown src falls
// through to the generic RED telegraph, which is exactly the v5.10.1 P0 this shape fixed.
function volatileBomb(run, x, y) {
  return {
    x, y, radius: VOLATILE_RADIUS, fuse: VOLATILE_FUSE, duration: VOLATILE_FUSE,
    dmg: VOLATILE_DMG, src: 'volatile', core: !!run.anomalies?.unstableCores,
  }
}

/** @returns true if the player died this frame (phase set to 'dead'). */
function stepBombs(run, dt) {
  const p = run.player
  let playerDied = false
  // Chained cores are collected and pushed AFTER the loop: `for…of` over an array visits items
  // appended during iteration, and a chained bomb would then burn a frame of its own fuse before
  // the player has seen it arm.
  const chained = []
  for (const b of run.bombs) {
    b.fuse -= dt
    if (b.fuse > 0) continue

    if (!playerDied && p.invuln <= 0) {
      const dx = p.x - b.x, dy = p.y - b.y
      // The player side is FLAT, core or not (config.js CORE_BLAST_ENEMY_MUL): the card's cost is
      // priced against player maxHP, which does not ride hpScale.
      if (dx * dx + dy * dy <= b.radius * b.radius && hurtPlayer(run, b.dmg)) playerDied = true
    }

    const radSq = b.radius * b.radius
    const dmg = b.core ? b.dmg * hpScale(run.time) * CORE_BLAST_ENEMY_MUL : b.dmg
    for (const e of run.enemies) {
      if (e._dead) continue
      const dx = e.x - b.x, dy = e.y - b.y
      if (dx * dx + dy * dy > radSq) continue
      dealDamage(run, e, dmg, false)
      // The cascade, uncapped (owner's call). A bomb can never kill an ELITE — elite HP is
      // base * ELITE.hpMul * hpScale, so the blast is ~20-30% of it at every t — so without this
      // the "packs chain-detonate" the card is sold on could not happen at all.
      if (b.core && e._dead) chained.push(e)
    }

    run.events.push({ type: 'explode', x: b.x, y: b.y, radius: b.radius })
    b._dead = true
  }
  for (const e of chained) run.bombs.push(volatileBomb(run, e.x, e.y))
  run.bombs = run.bombs.filter((b) => !b._dead)
  return playerDied
}

// Every enemy HP value in this file goes through here. See the doc at spawnEnemy's `hp` for why:
// dealDamage subtracts integers, so a fractional maxHP leaves an unkillable sub-1 remainder.
// Floor of 1 because an enemy that rounds to 0 hp would spawn already dead.
function roundHP(v) { return Math.max(1, Math.round(v)) }

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
    // v7.x Book 2: kills feed the bar - but only for a player who BOUGHT that. Owner ruling: "none
    // by default, only via the shop" (Light Thief, LIGHT_THIEF_COST in config.js). run.killRefill is
    // the snapshot createRun already took, and is 0 on an unbought save - so sim.js never reads meta
    // and the chapter's baseline tune is the unbought one. Clamped, and a no-op without a resource.
    const _res = CHAPTERS[run.chapter].resource
    if (_res && run.killRefill > 0) run.charge = Math.min(_res.max, run.charge + run.killRefill)
    run.events.push({ type: 'kill', x: enemy.x, y: enemy.y, elite: enemy.elite, etype: enemy.type })

    const xp = enemy.xp * (enemy.elite ? ELITE.xpMul : 1)
    run.gems.push({ x: enemy.x, y: enemy.y, xp })

    // WILDFIRE (v7.2): a burning enemy passes its fire on when it dies. The BUDGET is what stops
    // the cascade the spec warned about — in a 200-enemy field an unbudgeted jump-on-every-death
    // never terminates. It rides on the ENEMY, so one weapon application travels WILDFIRE_JUMPS
    // deep and no further however dense the crowd, and a fresh hit re-arms it (see applyIgnite).
    // Carries the same igniteDps rather than re-deriving one: the jump is the SAME fire moving,
    // which is also why it cannot be used to launder a bigger number out of a small hit.
    if (run.anomalies?.wildfire && enemy.ignite > 0) {
      const budget = enemy._fireJumps ?? 0
      if (budget > 0) {
        let best = null, bestSq = WILDFIRE_JUMP_R * WILDFIRE_JUMP_R
        for (const e of run.enemies) {
          if (e._dead || isAlly(e) || e === enemy || e.ignite > 0) continue   // already lit (or yours): spend the jump on new ground
          const dx = e.x - enemy.x, dy = e.y - enemy.y
          const dSq = dx * dx + dy * dy
          if (dSq < bestSq) { bestSq = dSq; best = e }
        }
        if (best) {
          best.ignite = IGNITE_DURATION
          best.igniteDps = enemy.igniteDps
          best._fireJumps = budget - 1
          run.events.push({ type: 'ignitejump', x: enemy.x, y: enemy.y, tx: best.x, ty: best.y })
        }
      }
    }
    // BLOOD PACT (v7.2): the snowball, uncapped, read back through anomalyDamageMul. Two clauses
    // because they do OPPOSITE jobs, and that is measured, not assumed: kills/run vary 3.3x across
    // chapters (570 body to 1902 city) so the per-kill clause is a chapter lottery (+57% to +190%),
    // while eliteEvery is a TIME cadence so elites land 8.6-10.6/run everywhere and the per-elite
    // clause is chapter-fair. An elite pays BOTH clauses — it is a kill as well.
    if (run.anomalies?.bloodPact) {
      run._bloodPact = (run._bloodPact ?? 0) + BLOOD_PACT_PER_KILL
        + (enemy.elite ? BLOOD_PACT_PER_ELITE : 0)
    }
    // AVARICE thins the drops themselves, not just the payout: the card has to be felt at the
    // source or it is a wallet edit the player never sees. Rolled per coin so an elite's pile
    // thins probabilistically rather than losing a fixed slice.
    const coinDropMul = run.anomalies?.avarice ? AVARICE_COIN_DROP_MUL : 1
    if (enemy.elite) {
      // Anomaly predicates read this (ANOMALIES in config.js): "have you met an elite yet" is a
      // hidden condition a card can teach itself with, and run.kills cannot answer it.
      run._eliteKills = (run._eliteKills ?? 0) + 1
      const gilded = enemy.affixes && enemy.affixes.includes('gilded')
      const coinCount = gilded ? Math.round(ELITE.coins * GILDED_COIN_MUL) : ELITE.coins
      for (let i = 0; i < coinCount; i++) {
        if (Math.random() >= coinDropMul) continue
        const a = Math.random() * Math.PI * 2
        const d = Math.random() * 20
        run.coins.push({ x: enemy.x + Math.cos(a) * d, y: enemy.y + Math.sin(a) * d, value: 1 })
      }
    } else if (Math.random() < ENEMIES[enemy.type].coinChance * coinDropMul) {
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
      run.bombs.push(volatileBomb(run, enemy.x, enemy.y))
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
    // rolled): a slain cell of the scripted chapter leaves brief erasing residue where it died, so
    // clearing enemies point-blank has a cost. v6.3.1 [panel]: widened from wave-only to every
    // scripted-chapter corpse — at d3 the P3 recruit faucet now seeds residue too ("slain cells
    // leave erasing residue" finally means all of them). Same acidPool shape, but through
    // run.strips with the erase look; tagged variant:'residue' (like the eraser's wake) so
    // render.js can dim both against the boss's OWN bands, which stay untagged/full-strength.
    if ((enemy._wave || CHAPTERS[run.chapter].scripted) && run.mutators.includes('immuneMemory')) {
      run.strips.push({
        x: enemy.x, y: enemy.y, angle: Math.random() * Math.PI,
        len: BLANK_WAKE_LEN, w: BLANK_WAKE_W, fuse: 0.3, t: BLANK_MEMORY_T, dps: BLANK_WAKE_DPS,
        look: 'erase', variant: 'residue',
      })
    }

    // SUBMISSION: an elite under this card dies completely normally here — its kill, its 4x xp gem,
    // its 8 coins, its _eliteKills, its blood-pact stacks and every on-death affix (the volatile
    // core, the splitter wisps, the acid pool). The whole card is what happens NEXT.
    //   THE TURN ITSELF IS NOT HERE. It runs in turnDeadElites, at the very end of the frame —
    // see there for why clearing _dead inside this branch was wrong.
  }
}

/**
 * @param critBonus v6.6.28: extra crit CHANCE in percentage points, added to the player's own for
 *   this hit only. The one caller is slashClaws (CLAW_BASE_CRIT — see config.js for why points and
 *   not a relative scale). Defaults to 0, so every other call site is bit-for-bit unchanged; it is
 *   the LAST parameter for the same reason — a 3-arg call cannot accidentally acquire one.
 * @returns the final applied damage number (post multiplier/crit), for effects like star blast.
 */
function applyDamage(run, enemy, baseDmg, critBonus = 0) {
  if (damageImmune(enemy)) return 0 // v5.4 untouchable window: no crit roll, no elements either
  const p = run.player
  let dmg = baseDmg * p.damageMul * (1 + run.passives.damage) * run.mods.playerDmgMul * anomalyDamageMul(run)
    * (run.rampageT > 0 ? RAMPAGE_DMG_MUL : 1)   // v5.14, read-time only (see config)
    * resourceDamageMul(run.charge, CHAPTERS[run.chapter].resource)   // v7.55 §5.3 owner ruling: Humidity only
  let crit = false
  if (Math.random() < p.critChance + run.passives.critChance + critBonus) {
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

// Unconditional, and load-bearing: shatter consumes the chill AND the freeze stack, so a shatter
// on every hit is a freeze that never lands.
function triggerCombo(enemy, name) {
  enemy._comboCd[name] = COMBOS.comboCd
}

function applyIgnite(enemy, potency, dmgDealt) {
  enemy.ignite = IGNITE_DURATION
  enemy.igniteDps = (IGNITE_DOT_FRAC * potency * dmgDealt) / IGNITE_DURATION
  // WILDFIRE's jump budget is re-armed by a real weapon hit, and only here. That is the whole
  // difference between "engage the pack and let it propagate" and an eternal chain: a fire that
  // has spent its jumps keeps burning and keeps killing, it just stops travelling until you light
  // something yourself. Set unconditionally (not behind the anomaly) so the field is already
  // correct on every enemy alive when the card is taken mid-run.
  enemy._fireJumps = WILDFIRE_JUMPS
}

// Shared by the primary hit and Frost Arc's arc targets.
function applyChill(run, enemy, potency) {
  const wasChilling = enemy.chill > 0 && enemy.frozen <= 0
  // v7.17: the SLOW is diminished like every other control (owner's call — it is what stops the
  // crowd closing the gap between two knockbacks, so leaving it out leaves most of the ring
  // standing). The chill WINDOW is not scaled: a shorter window would just re-arm the freeze
  // stack faster. `resistsCC` enemies take the damage and the DoT and no slow at all.
  if (resistsCC(enemy)) return
  const k = ccScale(run, enemy)
  const slow = Math.min(CHILL_SLOW_CAP, CHILL_SLOW_BASE + CHILL_SLOW_PER_POTENCY * potency) * k
  enemy.chill = CHILL_DURATION
  if (enemy.frozen > 0) return // already frozen; window refreshed, no restacking needed
  spendCC(run, enemy)

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
      enemy.frozen = FREEZE_DURATION * k
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
      applyChill(run, t, potency)
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

  const am = alignmentMul(run)
  if (pot.fire > 0) applyIgnite(enemy, pot.fire * am, dmgDealt)
  if (pot.cold > 0) applyChill(run, enemy, pot.cold * am)
  if (pot.venom > 0) applyVenomStack(enemy)   // stacks, not potency — the DoT reads it in stepStatuses
  if (pot.lightning > 0) applyShock(run, enemy, pot.lightning * am, dmgDealt)
}

// Ticks ignite/venom DoTs (fire+venom Acid Burn speeds both up together), decays chill/freeze
// and their windows/cooldowns. Chill/freeze's movement effect lives in stepEnemyMovement.
function stepStatuses(run, dt) {
  const potVenom = run.elements.venom * alignmentMul(run)
  for (const e of run.enemies) {
    if (e._dead || isAlly(e)) continue   // SUBMISSION: chain slot: an ally next to the shocked body is the nearest thing there is

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
    // SUBMISSION: never aim at your own ally. THIS IS THE CHOKE POINT — seven weapon aim
    // sites plus aimAngle come through here, so the alternative is seven edits that each fail
    // silently ("my weapons stopped shooting the swarm", no error).
    if (isAlly(e)) continue
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
  // v6.7.6: wideBeam moves BOTH width and length — Long Beam merged into it (see WEAPON_MODS).
  rainbow:   { wideBeam: [['width', 'length'], 'pct'], sustain: ['duration', 'pct'] },
  // v5.0 pond natives: frenzy/quickCast (attack-speed mods) are NOT here — folding them into the
  // `rate` field would SLOW the weapon (rate is the interval); they divide the interval at the
  // fire site instead (see stepFlagellaWeapon/stepBloomWeapon), like the global fire rate.
  flagella:  { reach: ['range', 'pct'], wideArc: ['arc', 'pct'], heavyLash: ['dmg', 'pct'] },
  bloom:     { bigBloom: ['maxR', 'pct'], lasting: ['dur', 'pct'], virulent: ['dmgPerTick', 'pct'] },
  // v5.3 garden natives: rapid/fastLure (attack rate) and longNeedles (range AND speed)/bigBurst
  // (burst dmg AND radius) are NOT here — they'd need to divide `rate` or touch two fields, so
  // they're read at the fire/plant/burst site instead (see stepStingerWeapon/stepLureWeapon).
  stinger:   { sharper: ['dmg', 'pct'], volley: ['count', 'flat'], piercingNeedles: ['pierce', 'flat'] },
  lure:      { widerTaunt: ['aggro', 'pct'], longerLure: ['dur', 'pct'] },
  // v5.4 natives. Same two exclusions as above, applied uniformly: every attack-RATE mod
  // (quickPaws/rapidQuills/rapidShriek/rapidHydrant/rapidRoar/quickTail/rapidToss/rapidShard/
  // rapidSweep) divides the interval at its fire site rather than folding into `rate` — folding it
  // in would SLOW the weapon — and so does every mod that has to touch two fields at once
  // (longQuills = range AND speed, longToss = castRange at the throw site). The rest is plain stat
  // folding.
  clawRake:      { rend: ['dmg', 'pct'], wideRake: ['arc', 'pct'], longClaws: ['range', 'pct'] },
  quillBurst:    { sharpQuills: ['dmg', 'pct'], moreQuills: ['count', 'flat'] },
  chitterShriek: { terror: ['fear', 'pct'], shockwave: ['radius', 'pct'], shrill: ['dmg', 'pct'] },
  trashTornado:  { heavyTrash: ['dmg', 'pct'], wideHunt: ['hunt', 'pct'], fastWinds: ['travelSpeed', 'pct'], moreTrash: ['chunks', 'flat'] },
  burstHydrant:   { pressure: ['dmg', 'pct'], longHose: ['r', 'pct'], moreStreams: ['streams', 'flat'], deepMain: ['jetDur', 'pct'] },
  roar:          { bellow: ['dmg', 'pct'], wideRoar: ['arc', 'pct'], farRoar: ['range', 'pct'] },
  tailLash:      { heavyTail: ['dmg', 'pct'], longTail: ['range', 'pct'] },
  atomicBreath:  { overcharge: ['dmg', 'pct'], arcReach: ['arcRange', 'pct'], heldBreath: ['duration', 'pct'] },
  debrisToss:    { heavyDebris: ['dmg', 'pct'], bigImpact: ['r', 'pct'], moreDebris: ['count', 'flat'] },
  realityShard:  { keenShard: ['dmg', 'pct'], moreShards: ['count', 'flat'], pierceShard: ['pierce', 'flat'] },
  pulsarSweep: { wideSweep: [['width', 'length'], 'pct'], sustainSweep: ['duration', 'pct'] },
  // v7.55 surf native. All three of the Pincer's stat mods fold plainly; backClaw is behavioral
  // (read where the claws are laid out, stepPincerWeapon). There is no rate mod because there is no
  // rate — see WEAPONS.pincer in config.js.
  pincer:        { crusher: ['dmg', 'pct'], longArm: ['r', 'pct'], backwash: ['knock', 'pct'] },
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
      // v6.7.6: `field` may be an ARRAY, for a mod that honestly moves two numbers at once (the
      // merged Big Beam / Big Fold). Everything else still passes a single string and behaves
      // bit-identically. This is the same shape stinger.longNeedles and lure.bigBurst wanted and
      // could not have — they are read at their fire site precisely because this loop only did one
      // field. They are NOT moved here: doing so is a separate change with its own risk, and the
      // comment above this table still describes where they live.
      for (const f of Array.isArray(field) ? field : [field]) {
        stats[f] = kind === 'flat' ? Math.round(stats[f] + bonus) : stats[f] * (1 + bonus)
      }
    }
  }
  return stats
}

/**
 * Read-only projection of the player's whole build, for the pause screen. Lives here because this
 * is where weapon maths lives: effectiveWeaponStats folds the stat mods, and the two maps in
 * config.js cover the mods that deliberately do NOT fold (rate mods divide at their fire site,
 * the star's multishot is read at its own). A readout built anywhere else would quietly report a
 * weapon's paper numbers instead of the ones it is actually firing.
 *
 * Returns plain numbers and ids only — no copy, no formatting. ui.js owns both, and does not
 * import this module; main.js passes the result through. Never mutates `run`.
 */
export function buildReadout(run) {
  const p = run.player
  // The global multiplier every weapon's cadence already divides by (see stepWeapons).
  const globalRate = p.fireRateMul * (1 + run.passives.fireRate)
  const weapons = run.weapons.map((w) => {
    const cfg = WEAPONS[w.id]
    const base = cfg.levels[Math.min(cfg.levels.length, Math.max(1, w.level)) - 1] ?? {}
    const eff = effectiveWeaponStats(run, w)
    const mods = run.weaponMods[w.id] ?? {}
    const countMod = WEAPON_COUNT_MODS[w.id]
    const countKey = WEAPON_COUNT_KEYS[w.id] ?? 'count'
    if (countMod && eff[countKey] != null) eff[countKey] += mods[countMod] ?? 0
    const rateMod = WEAPON_RATE_MODS[w.id]
    const rateDiv = globalRate * (1 + (rateMod ? (mods[rateMod] ?? 0) : 0))
    const stats = []
    // ORDERED, and ui.js slices to STAT_MAX_ROWS (5) after appending the cadence row `every` — so
    // where a key sits decides what falls off the sheet. jetDur goes after 'r': the Burst Hydrant
    // then emits dmg, count, r, jetDur + every = exactly 5. `streams` is deliberately NOT here — a
    // sixth row would push `every` (the cadence) off, and Split Nozzle already shows up in the mod
    // list below the table, the same way every behavioural mod does.
    // v7.23: jumps/arcRange/duration added for Atomic Breath, placed so the breath emits exactly
    // dmg, jumps, duration, arcRange + every = 5 rows. `duration` is shared: it also surfaces
    // rainbow's Sustain and pulsarSweep's Held Sweep, which were invisible on the sheet before —
    // both weapons sit at 4 rows today, so gaining one costs neither of them a row.
    // v7.26: `arcRange` is deliberately NOT here. The breath now carries both `range` (how far it
    // reaches for its first target) and `arcRange` (how far it jumps after that), which would make
    // six rows and push `every` — the cadence — off the bottom. Range is the one a player acts on;
    // Arc Reach still appears in the picked-mods list under the table, the same treatment `streams`
    // gets above.
    // v7.55: `knock` and `cd` added for the Pincer, right after `r` so it emits dmg, r, knock, cd
    // and stops — it has no `rate`/`interval`, so it is the one weapon with no cadence row, which is
    // the point of it (see WEAPONS.pincer). Both keys are unique to the Pincer's levels[] (every
    // other knockback stat in the game is spelled `knockback`), so no other weapon gains a row here.
    for (const key of ['dmg', 'count', 'hooks', 'jumps', 'orbs', 'chunks', 'maxAlive', 'radius', 'hunt', 'travelSpeed', 'r', 'knock', 'cd', 'jetDur', 'duration', 'maxR', 'range', 'length', 'width', 'pierce']) {
      if (base[key] == null || eff[key] == null) continue
      stats.push({ key, value: eff[key], base: base[key] })
    }
    const interval = base.rate ?? base.interval
    if (interval != null && rateDiv > 0) stats.push({ key: 'every', value: interval / rateDiv, base: interval })
    // Every mod the player has actually picked, with the bonus it accumulated. The table above
    // covers the ones that fold into a stat; these carry the rest (behavioural mods and switches).
    const picks = run.weaponModPicks[w.id] ?? {}
    const modList = Object.keys(WEAPON_MODS[w.id] ?? {})
      .filter((id) => (picks[id] ?? 0) > 0)
      .map((id) => ({ id, bonus: mods[id] ?? 0, picks: picks[id] ?? 0, kind: WEAPON_MODS[w.id][id].kind }))
    return { id: w.id, level: w.level, maxLevel: cfg.levels.length, stats, mods: modList }
  })
  const passives = Object.keys(run.passives)
    .filter((id) => (run.passivePicks[id] ?? 0) > 0)
    .map((id) => ({ id, bonus: run.passives[id], picks: run.passivePicks[id] }))
  const elements = Object.keys(run.elements)
    .filter((id) => (run.elementPicks[id] ?? 0) > 0)
    .map((id) => ({ id, potency: run.elements[id], picks: run.elementPicks[id] }))
  // v6.7.7: anomalies belong here for the same reason weapon mods do — this readout is the ONE
  // place a player can check what they are actually running, and an anomaly is a rule with no
  // number anywhere else in the HUD to betray it. Unstable Cores' bombs are visually the same
  // corpse bomb the `volatile` elite affix already rolls on ~29% of late elites, so without this
  // line a player has no way at all to tell the card is on.
  const anomalies = Object.keys(run.anomalies ?? {})
    .filter((id) => ANOMALIES[id])
    // `subject` is SPECIALIST's named weapon (v7.5). Without it the sheet would print "Specialist —
    // Its upgrades come up ×2.5 as often" with no way at all to learn WHICH weapon "its" is, which
    // is the same hidden-rule failure this whole section exists to close.
    .map((id) => ({
      id, name: ANOMALIES[id].name, desc: ANOMALIES[id].desc, icon: ANOMALIES[id].icon,
      subject: typeof run.anomalies[id] === 'string' ? run.anomalies[id] : null,
    }))
  return { weapons, passives, elements, anomalies }
}

function stepWeapons(run, dt) {
  const p = run.player
  run.orbs = []
  // run.debris is NOT cleared here. v6.8: a tornado carries its own position between frames
  // because it leaves the ring to hunt, so stepTornadoWeapon resizes the list instead of
  // rebuilding it. (run.orbs above is still the rewrite-every-frame contract.)
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
    else if (w.id === 'burstHydrant') stepHydrantWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'roar') stepRoarWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'tailLash') stepLashWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'atomicBreath') stepBreathWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'debrisToss') stepDebrisWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'realityShard') stepShardWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'pulsarSweep') stepPulsarWeapon(run, w, stats, fireRateMul, dt)
    // The one weapon that takes no fireRateMul, and the omission is deliberate and visible here
    // rather than swallowed by an ignored parameter — see stepPincerWeapon.
    else if (w.id === 'pincer') stepPincerWeapon(run, w, stats)
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
  stepZones(run, dt)
  stepLobs(run, dt)
  // v7.23 skies. stepDrags moves bodies, so it runs BEFORE the dead sweep below and before
  // stepArcs, whose fork is rebuilt from live positions — a hooked aircraft should already be at
  // its new spot when the breath decides where to jump.
  stepDrags(run, dt)
  stepArcs(run, dt)
  // v7.55 surf: the Pincer's trigger. Runs AFTER stepPincerWeapon has placed the claws this frame,
  // so a snap is tested against where the guard actually is, and after stepDrags for the same reason
  // that moves bodies first — the scan must see this frame's positions, not last frame's.
  stepGuards(run, dt)

  turnDeadElites(run) // SUBMISSION: elites killed this frame get up, just before the sweep
  if (run.enemies.some((e) => e._dead)) run.enemies = run.enemies.filter((e) => !e._dead)
}

// SUBMISSION: THE BODY GETS UP — at the END OF THE FRAME, not inside dealDamage.
//
// THIS PLACEMENT IS THE WHOLE FIX, and the obvious placement was wrong in a way that broke OTHER
// cards. Resurrecting inside dealDamage's death branch meant clearing `enemy._dead` while the
// killing blow was still unwinding, and three on-kill weapon mods test `e._dead` AFTER the damage
// call returns — Supernova Sparks (sim.js ~4513), Swarm (~4993) and Sporeburst (~5532). Taking
// Submission silently switched all three OFF for elites, the single biggest kill in the game.
// applyDamage's own `if (!enemy._dead) applyElements(...)` had the same problem in reverse: it
// infused the brand-new ally with the killing blow's ignite/chill.
//   Running here instead, after every weapon has finished with the corpse and immediately before
// the once-per-frame sweep that would delete it, means `_dead` stays true for the entire frame —
// so every one of those call sites behaves exactly as it does without the card, with no guards.
//
// `_turned` is the idempotence guard and it is load-bearing: without it the ally's own fall
// re-enters this pass and pays the elite reward a second time (a gem and coin fountain, not an
// exception). Expiry is handled in stepSubmission, which retires the body itself.
// hp goes back through roundHP: a fractional maxHP leaves an immortal sub-1 sliver (v6.9.2).
function turnDeadElites(run) {
  if (!run.anomalies?.submission) return
  for (const e of run.enemies) {
    if (!e._dead || !e.elite || e._turned) continue
    e._dead = false
    e._turned = true
    e.hp = roundHP(e.maxHP)
    e.allyT = SUBMISSION_DURATION
    e.hitFlash = 0            // it is not being struck, it is changing sides
    // STRIP THE FLAGS THAT ONLY EVER POINT AT THE PLAYER. One line and one config list instead of a
    // seven-row suppress-or-retarget table: every chapter's eliteFlags is in here, so without it a
    // turned elite keeps shelling you (skies), laying soap pools under you (pond), abducting you
    // (beyond), disgorging hostile minions (city) or enraging the swarm it should be fighting
    // (undergrowth). Contact is the whole arsenal for the rest of the roster anyway.
    //   .filter() AND NOT AN IN-PLACE SPLICE, and that is not style: spawnSplitChildren assigns
    // `flags: parent.flags` BY REFERENCE while spawnEnemy copies, and a splitter elite spawns its
    // children in the death branch that just ran — mutating in place would strip the children's
    // flags too. Reassigning the filter result gives the required copy for free.
    if (e.flags && e.flags.length) e.flags = e.flags.filter((f) => !SUBMISSION_STRIP_FLAGS.includes(f))
    run.events.push({ type: 'submission', x: e.x, y: e.y, elite: true })
  }
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
  const count = ipecacN(run, stats.count + (run.weaponMods.star?.multishot ?? 0))
  const pierce = stats.pierce + (run.weaponMods.star?.pierce ?? 0)
  const chainsLeft = run.weaponMods.star?.chain ?? 0
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
      speed: stats.speed, // kept so a chain redirect preserves the original travel speed
      hitIds: new Set(),
      _shard: false,
      _splitDone: false,
      _chainsLeft: chainsLeft,
    })
  }
  run.events.push({ type: 'shoot', weapon: 'star' })
}

// Split Stars: actual shard count = run.weaponMods.star.split + 1 (0 picks = no split; see
// WEAPON_MODS doc in config.js). Shards are plain bullets flagged _shard so they never re-split, but they
// still carry a fresh chain budget off run.weaponMods.star, same as any other bullet.
function splitCountFor(run) {
  const picks = run.weaponMods.star?.split ?? 0
  return picks > 0 ? picks + 1 : 0
}

function spawnSplitShards(run, b, hitEnemy, shardCount) {
  const baseAngle = Math.atan2(b.vy, b.vx)
  const spreadTotal = shardCount <= 2 ? STAR_SPLIT_BASE_ANGLE * 2 : STAR_SPLIT_MAX_SPREAD
  const chainsLeft = run.weaponMods.star?.chain ?? 0
  const shardDmg = b.dmg * STAR_SPLIT_DMG_FRAC
  for (let i = 0; i < shardCount; i++) {
    const offset = shardCount > 1 ? -spreadTotal / 2 + i * (spreadTotal / (shardCount - 1)) : 0
    const angle = baseAngle + offset
    run.bullets.push({
      x: hitEnemy.x, y: hitEnemy.y,
      vx: Math.cos(angle) * b.speed,
      vy: Math.sin(angle) * b.speed,
      dmg: shardDmg,
      pierce: 1, // shards die on their first hit unless chain picks keep them alive
      life: STAR_LIFE,
      r: STAR_R,
      speed: b.speed,
      hitIds: new Set([hitEnemy.id]), // don't let a shard immediately re-hit the enemy it spawned from
      _shard: true,
      _splitDone: true,
      _chainsLeft: chainsLeft,
    })
  }
}

// Chain Stars: when a bullet's pierce is exhausted, re-target the nearest not-yet-hit enemy
// within STAR_CHAIN_RANGE of the last hit and keep flying (damage decays per jump).
function tryChainBullet(run, b, fromEnemy) {
  const rangeSq = STAR_CHAIN_RANGE * STAR_CHAIN_RANGE
  let target = null
  let bestSq = Infinity
  for (const e of run.enemies) {
    if (e._dead || isAlly(e) || b.hitIds.has(e.id)) continue   // SUBMISSION: pass THROUGH an ally — immune, but blocks nothing
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
      // reboundQuills (v6.6.28): a quill that ran out of FLIGHT turns around instead of expiring.
      // Same frame as the shard branch above and for the same reason — the end-of-loop filter drops
      // anything still at life <= 0, so the reversal has to happen HERE or it never happens.
      if (b.weapon === 'quill' && b._reboundsLeft > 0) reboundQuill(run, b)
      if (b.life <= 0) continue
    }
    if (b.pierce <= 0) continue

    let justHit = null
    for (const e of run.enemies) {
      if (b.pierce <= 0) break
      if (e._dead || isAlly(e) || b.hitIds.has(e.id)) continue   // SUBMISSION: pass THROUGH an ally — immune, but blocks nothing
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

    // A spent bullet re-targets if it has a chain jump left and something to jump to; otherwise
    // it dies at the end of the loop like any other.
    if (justHit && b.pierce <= 0 && b._chainsLeft > 0) tryChainBullet(run, b, justHit)
    // ... and a quill that ran out of PIERCE turns around, the same as one that ran out of flight.
    // It has to be caught HERE, after the hit scan and before the end-of-loop filter, because that
    // filter drops `pierce <= 0` just as surely as it drops `life <= 0` — checking at the top of the
    // next iteration is a frame too late and the quill is already gone. Getting this wrong is not a
    // small miss: measured, the share of quills that die on life rather than pierce falls from 98%
    // in a run's first minute to 56% at t=180-240, so a life-only rebound is a ~20x multiplier when
    // 12 enemies are alive and a ~1.2x one when 337 are — exactly backwards for a card whose text
    // promises a return sweep through a crowd.
    if (b.weapon === 'quill' && b.pierce <= 0 && b.life > 0 && b._reboundsLeft > 0) reboundQuill(run, b)
  }
  run.bullets = bullets.filter((b) => b.life > 0 && b.pierce > 0)
}

// reboundQuills (v6.6.28): turn one quill around for a return sweep. Called from BOTH ends of a
// quill's life in stepBullets — flight expired, or pierce budget spent — because the end-of-loop
// filter drops either condition and a rebound that only caught one of them would fire when the
// screen was empty and never when it was full.
//
// Three details that are all load-bearing:
//  1. DAMAGE DECAYS TO ZERO, and a quill that would come back for 0 damage does not come back at
//     all. The decay is not just a damage cap: every rebound hit is a full applyDamage, so it also
//     applies elements. Measured with two cold picks, an uncapped rebound chain took the share of
//     the field chilled/frozen from 13% to 46% — a mod card that advertises no crowd control at all
//     silently becoming the best freeze engine in the game. Terminating the chain on damage, not
//     just on the pick count, is what prices that.
//  2. SPEED IS SET, NOT MULTIPLIED. `_reboundSpeed` is a fire-time constant, so trip 12 is the same
//     speed as trip 1. Multiplying `b.vx` by 0.85 each turn instead compounds: by the 15th trip the
//     quill is at 10% of range, vibrating in place over a ~30px arc for 0.65s at a time.
//  3. The hit set is cleared — EXCEPT for whatever the quill is still overlapping at the instant it
//     turns. Without that carve-out a quill that hit something on its last frame would hit it again
//     on the next one without having travelled anywhere: a free double-hit, not a sweep. This is the
//     whole reason the pierce-spent path above is safe.
function reboundQuill(run, b) {
  // floor, not round: Math.round(1 * 0.7) is 1, so a rounded chain parks at 1 damage and rebounds
  // forever — the exact opposite of the termination this guard exists to provide.
  const nextDmg = Math.floor(b.dmg * QUILL_REBOUND_DMG_MUL)
  if (nextDmg <= 0) return
  b._reboundsLeft--
  const spd = Math.hypot(b.vx, b.vy) || 1
  const k = -b._reboundSpeed / spd
  b.vx *= k
  b.vy *= k
  b.life = b._reboundLife
  b.pierce = b._reboundPierce
  b.dmg = nextDmg
  b.speed = b._reboundSpeed
  b.hitIds.clear()
  for (const e of run.enemies) {
    if (e._dead) continue
    const dx = e.x - b.x
    const dy = e.y - b.y
    const rad = b.r + e.radius
    if (dx * dx + dy * dy <= rad * rad) b.hitIds.add(e.id)
  }
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

  const orbs = ipecacN(run, stats.orbs)
  for (let i = 0; i < orbs; i++) {
    const angle = (i / orbs) * Math.PI * 2 + run.time * stats.rotSpeed
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
    const knockback = stats.knockback
    for (const r of ipecacRadii(run, radius)) spawnNova(run, p.x, p.y, r, dmg, knockback)
    // Chemotaxis: main cast only — echoes re-cast at a stale spot and re-marking there would reel
    // loot toward a place the player left. `radius` is already tsunami-adjusted here (deliberate:
    // a monster wave reels wider too). Marked items home to the player in stepPickups regardless
    // of magnet range, until collected.
    if (undertowStacks > 0) {
      const vacR = radius * (1 + UNDERTOW_VAC_RADIUS_PER_STACK * undertowStacks)
      const vacRSq = vacR * vacR
      for (const it of run.gems) {
        const dx = it.x - p.x, dy = it.y - p.y
        if (dx * dx + dy * dy <= vacRSq) it._vac = true
      }
      for (const it of run.coins) {
        const dx = it.x - p.x, dy = it.y - p.y
        if (dx * dx + dy * dy <= vacRSq) it._vac = true
      }
    }
    run.events.push({ type: 'shoot', weapon: 'wave', x: run.player.x, y: run.player.y, maxR: stats.radius }) // v6.2: render draws the ripple train at the cast point
    // Echo Wave: queue N delayed re-casts at the same spot, each WAVE_ECHO_DELAY later than the
    // previous, at WAVE_ECHO_DMG_FRAC damage (full radius/knockback, tsunami-adjusted but never
    // vacuum — see Chemotaxis comment above).
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
        // FEAR IS NO LONGER REFRESHABLE (v7.16). It runs its full duration, then FEAR_REFRACTORY of
        // immunity, and only then can land again — so uptime is capped by the enemy's own timer at
        // any fire rate. The `fearT <= 0` half is the load-bearing one: gating on the cooldown ALONE
        // still lets a ring re-apply while fear is already up, and a Math.max refresh every frame
        // then holds fearT at full forever, so it never expires and the cooldown never arms. That
        // reads as a working refractory and measures 100% uptime — the lock, untouched.
        // ONE scale for the whole hit — the fear and the shove are the same application.
        const k = ccScale(run, e)
        if ((n.fear ?? 0) > 0 && (e.fearT ?? 0) <= 0 && (e.fearCd ?? 0) <= 0 && !resistsCC(e)) {
          e.fearT = n.fear * k
        }
        // Anchored/unshakeable: still takes the damage above, just never gets knocked back.
        if (!resistsCC(e)) {
          const kdx = dist > 1e-6 ? dx / dist : 1
          const kdy = dist > 1e-6 ? dy / dist : 0
          e.kb.x += kdx * n.knockback * k
          e.kb.y += kdy * n.knockback * k
          spendCC(run, e)
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

  const count = ipecacN(run, stats.count)
  const step = count > 1 ? (2 * BOOMERANG_FAN) / (count - 1) : 0
  // bigBlade scales BOOMERANG_HIT_R, a constant, not a levels[] field — read directly and
  // snapshotted per boomerang at throw time, like bigOrbs is for orbit.
  const hitR = BOOMERANG_HIT_R * (1 + (run.weaponMods.boomerang?.bigBlade ?? 0))
  // Backhand/Seeker: also snapshotted per boomerang at throw time (same reasoning as Undertow —
  // mid-run picks shouldn't retroactively change blades already in flight).
  const backhandMul = 1 + (run.weaponMods.boomerang?.backhand ?? 0)
  for (let i = 0; i < count; i++) {
    const angle = count > 1 ? baseAngle - BOOMERANG_FAN + i * step : baseAngle
    run.boomerangs.push({
      x: p.x, y: p.y, ox: p.x, oy: p.y,
      angle, phase: 'out',
      dmg: stats.dmg, hit: new Set(),
      speed: stats.speed, range: stats.range, hitR,
      backhandMul,
    })
  }
  run.events.push({ type: 'shoot', weapon: 'boomerang' })
}

function stepBoomerangs(run, dt) {
  const p = run.player
  for (const b of run.boomerangs) {
    if (b.phase === 'out') {
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
    // IPECAC (v7.5): three cysts per cast, scattered — and maxAlive tripled with them. Lifting the
    // count without lifting the ceiling would deploy one and silently refuse the other two, which is
    // the card paying its half-fire-rate cost for nothing.
    if (deployed >= ipecacN(run, stats.maxAlive)) return
    const p = run.player
    // SCATTERED, not stacked. Three cysts dropped on the same tile is one cyst with three times the
    // damage — precisely the shape this card was rewritten to stop being. They go out on a ring
    // behind the player, reusing the bomblet scatter distance so the spacing already matches
    // something the player has seen.
    const n = ipecacN(run, 1)
    for (let i = 0; i < n; i++) {
      const a = n > 1 ? (i / n) * Math.PI * 2 : 0
      const d = n > 1 ? MINE_CLUSTER_SCATTER_MIN : 0
      run.mines.push({
        x: p.x - p.facing * 20 + Math.cos(a) * d, y: p.y + Math.sin(a) * d,
        arm: 0.4, dmg: stats.dmg, radius: stats.radius,
      })
    }
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
      if (e._dead || isAlly(e)) continue   // SUBMISSION: a mine must not seek your ally
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
// v6.4 pond identity: every enemy caught in the blast is also stunned (MINE_STUN), same
// damageImmune guard applyDamage already uses internally — a ghosted phase flicker takes no
// damage AND gets no stun, exactly like it eats nothing else.
function detonateMine(run, m) {
  for (const e of run.enemies) {
    if (e._dead || isAlly(e)) continue   // SUBMISSION: an ally would trip the whole field for zero damage
    const dx = e.x - m.x, dy = e.y - m.y
    if (dx * dx + dy * dy <= m.radius * m.radius) {
      applyDamage(run, e, m.dmg)
      if (!damageImmune(e) && !resistsCC(e)) { e.stunT = Math.max(e.stunT || 0, MINE_STUN * ccScale(run, e)); spendCC(run, e) }
    }
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

  const count = ipecacN(run, stats.count)
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
// v6.9.3: applyDamage, not dealDamage. h.dmg is the RAW config stat (fireHoming stores stats.dmg
// unscaled; the wisp's own hit is what runs it through applyDamage), so dealing it directly made
// the pop a flat constant that ignored damage passives/shop/mutators entirely — cf. orbitSupernova,
// which is correct because it derives from an already-rolled applyDamage RETURN value.
function wispPop(run, h, bonus) {
  const dmg = h.dmg * bonus
  if (dmg <= 0) return
  const radSq = WISP_NOVA_RADIUS * WISP_NOVA_RADIUS
  for (const e of run.enemies) {
    if (e._dead) continue
    const dx = e.x - h.x, dy = e.y - h.y
    if (dx * dx + dy * dy <= radSq) applyDamage(run, e, dmg)
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
  // IPECAC (v7.5): SEEKERS DO NOT SHARE A TARGET WHILE THERE IS ANOTHER ONE FREE. The rule, in the
  // owner's words: cover three different enemies if three exist; if there are fewer, fall back to
  // the one or two closest and double up on them.
  // This is the load-bearing line of the whole card — the spec names it as such — because every
  // seeker re-picks the nearest live enemy every frame, so three of them converge on the same body
  // and the x3 is eaten whole by overkill. That is exactly the x3 DAMAGE card this one was
  // rewritten to replace, arriving again through the back door.
  // Claimed first-come per frame, borrowing trashTornado's idiom ("whoever is free takes the
  // nearest UNCLAIMED enemy"), and gated on the card so an ordinary homing volley keeps its shipped
  // behaviour bit for bit. Not capped at three: with two volleys in the air, six seekers spreading
  // over six enemies is the same rule, not a different one.
  const spread = !!run.anomalies?.ipecac
  const claimed = spread ? new Set() : null
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
      if (e._dead || isAlly(e) || h.hitIds.has(e.id)) continue   // SUBMISSION: pass THROUGH an ally — immune, but blocks nothing
      if (claimed?.has(e.id)) continue
      const dx = e.x - h.x, dy = e.y - h.y
      const dSq = dx * dx + dy * dy
      if (dSq < bestSq) { bestSq = dSq; target = e }
    }
    // FEWER ENEMIES THAN SEEKERS: every live one is already spoken for, so this seeker takes the
    // closest regardless of the claim. One straggler is hunted by all three; two are covered by two
    // and the third doubles up on whichever is nearer. Never leave a seeker flying blind.
    if (!target && claimed) {
      for (const e of run.enemies) {
        if (e._dead || isAlly(e) || h.hitIds.has(e.id)) continue   // SUBMISSION: pass THROUGH an ally — immune, but blocks nothing
        const dx = e.x - h.x, dy = e.y - h.y
        const dSq = dx * dx + dy * dy
        if (dSq < bestSq) { bestSq = dSq; target = e }
      }
    }
    if (target && claimed) claimed.add(target.id)
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
      if (e._dead || isAlly(e) || h.hitIds.has(e.id)) continue   // SUBMISSION: pass THROUGH an ally — immune, but blocks nothing
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
    // SUBMISSION: an ally is never a valid MARK. This is aim dilution, not friendly fire —
    // the spot is picked uniformly at random, so N allies among M hostiles waste N/(N+M) of every
    // cast, and stacking is uncapped by design.
    if (e._dead || isAlly(e) || excludeIds.has(e.id)) return false
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
  // The main vortex is unconditional, so IPECAC's x3 is expressed as extras on top of it — one
  // vortex becomes three, each landing on a DIFFERENT enemy via pickHoleSpot's exclusion set.
  const singularity = ipecacN(run, 1 + (run.weaponMods.hole?.singularity ?? 0)) - 1
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
// v6.9.3: applyDamage, not dealDamage — h.dmg is the raw config tick stat (see wispPop's note).
function holeCrunch(run, h, bonus) {
  const dmg = h.dmg * CRUNCH_DMG_MUL * (1 + bonus)
  if (dmg <= 0) return
  const radSq = h.radius * h.radius
  for (const e of run.enemies) {
    if (e._dead) continue
    const dx = e.x - h.x, dy = e.y - h.y
    if (dx * dx + dy * dy <= radSq) applyDamage(run, e, dmg)
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
  const beamCount = ipecacN(run, 2 + (run.weaponMods.rainbow?.prismatic ?? 0))
  const angleStep = (2 * Math.PI) / beamCount
  // Strobe Ray: bake the faster tick period in at cast time (mid-run picks shouldn't retroactively
  // speed up an already-live beam). Focus Lens's ramp is recomputed every tick instead (see below).
  const strobeBonus = run.weaponMods.rainbow?.strobe ?? 0
  const tick = stats.tick / (1 + strobeBonus)
  const focusBonus = run.weaponMods.rainbow?.focus ?? 0
  // Beam Prism: snapshot the ladder at cast time, same rule as Strobe above — a mod picked mid-run
  // must not retroactively re-cut a beam that is already in the air. A beam with no prism carries
  // an empty ladder and stepBeams' refraction branch never opens (this is also what keeps the
  // Pulsar out of it: run.beams is shared, and only fireBeam ever sets this).
  const prismLadderCast = prismLadder(run.weaponMods.rainbow?.prism ?? 0)
  for (let i = 0; i < beamCount; i++) {
    run.beams.push({
      angle: baseAngle + i * angleStep, life: stats.duration, duration: stats.duration, dmg: stats.dmg,
      tick, width: stats.width, length: stats.length,
      rotSpeed: stats.rotSpeed, acc: 0, focusBonus,
      prism: prismLadderCast.length > 0 ? prismLadderCast : null,
    })
  }
  run.events.push({ type: 'beam' })
}

// How far along the ray from (ox,oy) heading `angle` does `e` sit, or -1 if it isn't on it?
// The ray is `len` long and `width` wide; a body counts if its DISC touches the axis, which is why
// e.radius pads the perpendicular test and not the along one.
// v6.7.6: extracted from inBeamArm so the prism can cast the identical test from a refraction point
// that is NOT the player. Returning the distance rather than a bool is what lets the prism pick the
// NEAREST body on a ray — the one light would actually meet first.
function alongRay(ox, oy, angle, len, width, e) {
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const dx = e.x - ox, dy = e.y - oy
  const along = dx * cos + dy * sin           // distance projected onto the beam axis
  const perp = -dx * sin + dy * cos            // perpendicular distance from the axis
  if (along < 0 || along > len || Math.abs(perp) >= width / 2 + e.radius) return -1
  return along
}

// Is an enemy inside the beam arm at `angle`? Shared by the tick loop and Collapse. A beam arm is
// just a ray anchored at the player.
function inBeamArm(run, b, e, angle) {
  return alongRay(run.player.x, run.player.y, angle, b.length, b.width, e) >= 0
}

// The nearest live body on a ray, skipping anything already struck by this refraction. Returns
// null if the ray reaches its full length without meeting one.
function firstOnRay(run, ox, oy, angle, len, width, hit) {
  let best = null
  let bestD = Infinity
  for (const e of run.enemies) {
    if (e._dead || isAlly(e) || hit.has(e.id)) continue   // SUBMISSION: light must not bend off your ally ("blocks nothing")
    const d = alongRay(ox, oy, angle, len, width, e)
    if (d < 0 || d >= bestD) continue
    bestD = d
    best = e
  }
  return best
}

/**
 * One refraction: throw `ladder[depth]` sub-beams forward from (ox,oy), fanned across PRISM_SPREAD
 * and centred on `angle`. Each ray stops at the first body it meets, damages it, and — if the
 * ladder goes deeper — refracts again from there at PRISM_DMG_MUL damage and PRISM_LEN_MUL reach.
 * See the PRISM_* block in config.js for the ladder and for the three things bounding this tree.
 * `hit` is shared across the WHOLE tree, so one cast can never damage a body twice and two rays
 * can never bounce between the same pair.
 */
function castPrism(run, ox, oy, angle, dmg, len, width, depth, ladder, hit) {
  const n = ladder[depth]
  if (!n || len < 1 || dmg < 1) return
  const step = PRISM_SPREAD / (n - 1) // n >= 2 always (prismLadder stops at 2)
  for (let i = 0; i < n; i++) {
    const a = angle - PRISM_SPREAD / 2 + i * step
    const e = firstOnRay(run, ox, oy, a, len, width, hit)
    // Drawn to where it actually ended: at the body it stopped on, or out to its full reach.
    const reach = e ? Math.hypot(e.x - ox, e.y - oy) : len
    // `d` is the generation (0 = straight off the beam), so render can taper each one thinner and
    // dimmer than its parent — without it every ray in a 40-wide mythic tree draws identically and
    // the fan reads as noise rather than as light losing energy at each surface.
    run.prisms.push({ x: ox, y: oy, x2: ox + Math.cos(a) * reach, y2: oy + Math.sin(a) * reach, d: depth, life: PRISM_FLASH_T })
    if (!e) continue
    hit.add(e.id)
    applyDamage(run, e, dmg)
    castPrism(run, e.x, e.y, a, dmg * PRISM_DMG_MUL, len * PRISM_LEN_MUL, width, depth + 1, ladder, hit)
  }
}

// A beam's arms: 1 for the Neon Beam, or `arms` evenly around the circle for a swept Pulsar
// Sweep (2 = the pair itself, 180° apart; hyperSweep adds more). One entity rakes them all, so
// Collapse can resolve every arm at once — that's why the pair isn't N separate beams.
function beamArmAngles(b) {
  if (!b.swept) return [b.angle]
  const arms = b.arms ?? PULSAR_ARMS
  const out = []
  // v5.22 fan mode (lane): spread the arms across a forward ARC rather than a full circle, so every
  // arm covers ground the player is actually driving into. b.angle is the fan's CENTRE here, not the
  // first arm's heading — see firePulsar.
  if (b.fan) {
    if (arms === 1) return [b.angle]
    for (let i = 0; i < arms; i++) out.push(b.angle - b.fan / 2 + (i / (arms - 1)) * b.fan)
    return out
  }
  for (let i = 0; i < arms; i++) out.push(b.angle + (i / arms) * Math.PI * 2)
  return out
}

// Collapse (pulsarSweep): when the sweep ends, everything inside ANY arm is yanked toward
// the player and takes a multiple of the beam's per-tick damage, plus one explode at the player.
// v6.9.3: applyDamage, not dealDamage — b.dmg is the raw config tick stat (see wispPop's note).
function collapseSweep(run, b) {
  const p = run.player
  const dmg = b.dmg * PULSAR_COLLAPSE_MUL * (1 + b.collapseBonus)
  const angles = beamArmAngles(b)
  for (const e of run.enemies) {
    if (e._dead) continue
    if (!angles.some((a) => inBeamArm(run, b, e, a))) continue
    const dx = p.x - e.x, dy = p.y - e.y
    const d = Math.hypot(dx, dy)
    if (d > 1e-6 && !(e.affixes && e.affixes.includes('anchored'))) {
      e.kb.x += (dx / d) * PULSAR_COLLAPSE_PULL
      e.kb.y += (dy / d) * PULSAR_COLLAPSE_PULL
    }
    if (dmg > 0) applyDamage(run, e, dmg)
  }
  run.events.push({ type: 'explode', x: p.x, y: p.y, radius: b.length })
}

function stepBeams(run, dt) {
  const p = run.player
  for (const b of run.beams) {
    b.life -= dt
    if (b.life <= 0) {
      if (b.swept && (b.collapseBonus ?? 0) > 0) collapseSweep(run, b)
      continue
    }
    // Fan mode sweeps like a wiper across a fixed forward heading instead of rotating freely — a
    // full rotation is exactly the behaviour that made this weapon useless in a scrolled level.
    if (b.fan) {
      b._sweepT = (b._sweepT ?? 0) + dt
      b.angle = b.baseAngle + Math.sin(b._sweepT * PULSAR_FAN_RATE) * PULSAR_FAN_SWEEP
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
        // Beam Prism (v6.7.6): the arm refracts off the NEAREST body it crosses — light bends at
        // the first surface it meets, and refracting off every body in the arm would square a tree
        // that is already 40 rays wide at mythic. The sub-beams take the arm's LIVE per-tick damage
        // (so Focus Lens's ramp carries into them), and the body that bent the light is seeded into
        // `hit` so the first sub-beam does not immediately strike it again.
        if (b.prism) {
          const src = firstOnRay(run, p.x, p.y, angle, b.length, b.width, EMPTY_HIT)
          if (src) {
            castPrism(run, src.x, src.y, angle, dmg * PRISM_DMG_MUL, b.length * PRISM_LEN_MUL,
              b.width, 0, b.prism, new Set([src.id]))
          }
        }
      }
    }
  }
  run.beams = run.beams.filter((b) => b.life > 0)

  // Refraction segments are render-only: no damage, no collision, they just linger PRISM_FLASH_T so
  // a split cast on a tick frame is actually visible at 60fps instead of existing for 16ms.
  if (run.prisms.length > 0) {
    for (const s of run.prisms) s.life -= dt
    run.prisms = run.prisms.filter((s) => s.life > 0)
  }
}
// The prism's "already struck" set starts empty when we are only LOOKING for the refraction point
// (nothing has been struck yet). Hoisted so the tick loop doesn't allocate one per arm per tick.
const EMPTY_HIT = new Set()

// -- Flagella Whip (v5.0 pond starter) --------------------------------------------------
// A melee arc sweep: every `rate` seconds (frenzy divides that interval, like the global fire
// rate) it damages every enemy whose BODY falls in the sector (arc rad, range px) centered on
// the nearest enemy — inSector, the same test clawRake/roar/tailLash use. It was a centre-only
// test until the swing's DRAWING was fixed to cover the sector it damages, at which point the
// boundary disagreement it had always had became visible: a foe the fan plainly swept, whose
// centre sat a few px past the edge, took nothing. cyclone opens every 3rd swing to a full
// circle; barbed adds a bleed DoT.
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
  const barbedBonus = run.weaponMods.flagella?.barbed ?? 0

  // IPECAC (v7.5): three lashes at 120 degrees instead of one. `struck` is what keeps that a x3 of
  // AREA rather than a x3 of damage — an enemy is hit by at most one lash per swing, so surplus
  // output can only ever land on something the first lash did not reach. Without it a cyclone swing
  // (full circle) would hit the same body three times and the card degenerates into the x3 damage
  // version that measured as a wash.
  const struck = new Set()
  for (const swing of ipecacAngles(run, angle)) {
    for (const e of run.enemies) {
      if (e._dead || struck.has(e)) continue
      if (!inSector(p.x, p.y, swing, stats.range, arc, e, fullCircle)) continue
      struck.add(e)
      const dealt = applyDamage(run, e, stats.dmg)
      if (barbedBonus > 0 && !e._dead) applyBleed(e, dealt, barbedBonus)
      if (stats.knockback) shoveFromPlayer(run, e, stats.knockback) // v6.2 melee parity — roar's idiom
    }
    run.events.push({ type: 'whip', x: p.x, y: p.y, angle: swing, range: stats.range, arc })
  }
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
  const cloudCount = ipecacN(run, 1 + (run.weaponMods.bloom?.twinBloom ?? 0)) // twinBloom: +1 cloud per pick
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
    if (e._dead || isAlly(e)) return false   // SUBMISSION: never mark your own ally
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
  const dmg = baseDmg * p.damageMul * (1 + run.passives.damage) * run.mods.playerDmgMul * anomalyDamageMul(run)
    * resourceDamageMul(run.charge, CHAPTERS[run.chapter].resource)   // v7.55 §5.3 owner ruling: Humidity only
  dealDamage(run, enemy, dmg, false, true)
}

// Grows each cloud 0 -> maxR over dur × BLOOM_GROW_FRAC (then holds maxR), ticks dot-flagged
// damage every BLOOM_TICK to enemies inside, and expires once t reaches dur. sporeburst: a foe
// killed by a (non-mini) cloud's own tick emits a mini-cloud (SPOREBURST_FRAC maxR, flagged
// `_mini` so it never chains). New minis are collected and appended after the pass so they don't
// perturb the in-progress iteration.
// v6.4 pond identity, both read live off run.weaponMods.bloom (no per-cloud baking, so a mini
// reacts to whatever's currently held exactly like its parent):
//   bloom slow: every frame (not gated on the BLOOM_TICK timer below — the debuff is continuous,
//     only the damage is metered), any non-immune enemy inside the cloud gets e.bloomSlowT
//     refreshed to BLOOM_SLOW_T (stepEnemyMovement folds it into slowMul; decays like fearT/
//     stunT/enrageT). damageImmune-guarded: a ghosted phase flicker ignores this like it ignores
//     everything else.
//   tideCarried: with picks held, the cloud drifts by currentForce(x,y) × dt × picks every frame
//     — the SAME field that pushes the player/enemies/eddies — and each tick's damage is
//     multiplied by (1 + TIDE_DMG_BONUS × picks). The sporeburst inheritance below stays on the
//     BASE dmgPerTick (not the tide-boosted tick damage), so a mini isn't silently born hotter
//     than its parent was at plant time — it picks up the live tide bonus itself once it starts
//     ticking, same as any other cloud.
function stepBlooms(run, dt) {
  if (run.blooms.length === 0) return
  const sporeOn = (run.weaponMods.bloom?.sporeburst ?? 0) > 0
  const tide = run.weaponMods.bloom?.tideCarried ?? 0
  const minis = []
  for (const bl of run.blooms) {
    bl.t += dt
    const growT = bl.dur * BLOOM_GROW_FRAC
    bl.r = bl.t >= growT ? bl.maxR : bl.maxR * (bl.t / Math.max(1e-6, growT))

    if (tide > 0) {
      const f = currentForce(run, bl.x, bl.y)
      bl.x += f.fx * dt * tide
      bl.y += f.fy * dt * tide
    }

    const slowRSq = bl.r * bl.r
    for (const e of run.enemies) {
      if (e._dead || damageImmune(e)) continue
      const sdx = e.x - bl.x, sdy = e.y - bl.y
      if (sdx * sdx + sdy * sdy <= slowRSq) e.bloomSlowT = BLOOM_SLOW_T
    }

    const tickDmg = tide > 0 ? bl.dmgPerTick * (1 + TIDE_DMG_BONUS * tide) : bl.dmgPerTick
    bl._tickAcc = (bl._tickAcc ?? 0) + dt
    while (bl._tickAcc >= BLOOM_TICK) {
      bl._tickAcc -= BLOOM_TICK
      const rSq = bl.r * bl.r
      for (const e of run.enemies) {
        if (e._dead) continue
        const dx = e.x - bl.x, dy = e.y - bl.y
        if (dx * dx + dy * dy > rSq) continue
        applyDotDamage(run, e, tickDmg)
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
// chain budgets so star's mods never touch them. longNeedles scales range AND speed; venomTips
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
  const count = ipecacN(run, stats.count) // volley (+needles) already folded in via effectiveWeaponStats
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
      // v6.6.26: from the levels[] ladder + piercingNeedles, not the old hard-coded 1 — see the
      // note on WEAPONS.stinger.levels in config.js for why the 1 was the whole problem. Written
      // bare, like quillBurst's and realityShard's: every level defines pierce, so a `?? 1` would
      // be an unreachable branch that reads as if the hard-coded 1 were still a live fallback.
      pierce: stats.pierce,
      life,
      r: STINGER_R,
      speed,
      hitIds: new Set(),
      weapon: 'stinger',
      _venomTips: venomOn,
      // Disable star's bullet behaviours on needles (they share run.bullets/stepBullets).
      _shard: false, _splitDone: true, _chainsLeft: 0,
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
  const decoyCount = ipecacN(run, 1 + (run.weaponMods.lure?.twinLure ?? 0)) // twinLure: +1 decoy per pick
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
    // v7.2: a MINIME flees outward; a planted Pheromone Lure has no vx/vy and does not move, so
    // this is a no-op for the weapon. Fleeing is what makes the card about SPACE — the decoy drags
    // its share of the swarm away from where you are standing, rather than parking it next to you.
    if (lu.vx || lu.vy) { lu.x += lu.vx * dt; lu.y += lu.vy * dt }
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

// v7.23 Tail Lash: aim at the FARTHEST enemy within `range`, preferring `crushable` ones (aircraft,
// the only thing the lash can actually drag — see the LASH_* block in config.js). This is the
// inverse of aimAngle above, and it is the whole design: the skies' enemies are built to stand off
// (jet at STRAFE_STANDOFF 420, helicopter at its missile standoff), so a weapon that reaches past
// the crowd to the thing shooting at you is the counterplay the chapter never had. Returns null
// when nothing is in reach — the lash simply does not swing rather than flailing at empty ground.
function farthestAimAngle(run, range) {
  const p = run.player
  const rangeSq = range * range
  let best = null, bestSq = -1, bestCrushable = false
  for (const e of run.enemies) {
    if (e._dead || isAlly(e)) continue
    const dx = e.x - p.x, dy = e.y - p.y
    const dSq = dx * dx + dy * dy
    if (dSq > rangeSq) continue
    const crushable = !!(e.flags && e.flags.includes('crushable'))
    // Any aircraft outranks any ground target; among equals, farthest wins.
    if (crushable !== bestCrushable ? !crushable : dSq <= bestSq) continue
    bestSq = dSq; best = e; bestCrushable = crushable
  }
  if (!best) return null
  return Math.atan2(best.y - p.y, best.x - p.x)
}

// Shared by every sector sweep (clawRake, roar, tailLash): is the enemy's CENTER inside
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
  // ambushPredator (v6.5): evaluated ONCE per slash, off the PLAYER's position — not baked into
  // o.dmg, so a queued doubleSlash follow-up re-evaluates at its own moment/position. Counts an
  // armed OR sprung trap (any trap at all) within AMBUSH_R: see config.js for why armed-only lost.
  const ambush = run.weaponMods.clawRake?.ambushPredator ?? 0
  let ambushMul = 1
  if (ambush > 0) {
    for (const tr of run.traps) {
      if ((tr.x - p.x) ** 2 + (tr.y - p.y) ** 2 <= AMBUSH_R * AMBUSH_R) { ambushMul = 1 + ambush; break }
    }
  }
  // IPECAC: three rakes at 120 degrees, de-duplicated per slash — see fireFlagella for why the set
  // is load-bearing rather than tidy.
  const struck = new Set()
  for (const swing of ipecacAngles(run, angle)) {
    for (const e of run.enemies) {
      if (e._dead || struck.has(e)) continue
      if (!inSector(p.x, p.y, swing, o.range, o.arc, e, false)) continue
      struck.add(e)
      // CLAW_BASE_CRIT (v6.6.28): the rake's own +10 points of crit chance, on top of whatever the
      // build carries. The doubleSlash follow-up re-enters slashClaws, so it inherits this too.
      const dealt = applyDamage(run, e, o.dmg * ambushMul, CLAW_BASE_CRIT)
      // bleedClaws: flagella's barbed bleed, verbatim (same DoT, re-themed as claw wounds).
      if (bleedBonus > 0 && !e._dead) applyBleed(e, dealt, bleedBonus)
      if (o.knockback) shoveFromPlayer(run, e, o.knockback) // v6.2 melee parity — roar's idiom
    }
    run.events.push({ type: 'clawRake', x: p.x, y: p.y, angle: swing, range: o.range, arc: o.arc })
  }
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
// chain budgets zeroed, exactly like the stinger's needles. longQuills scales range AND speed;
// rapidQuills divides the interval; retaliate fires a free (bigger) burst whenever the player is hit.
function stepQuillWeapon(run, w, stats, fireRateMul, dt) {
  if (run._quillRetalCd > 0) run._quillRetalCd = Math.max(0, run._quillRetalCd - dt)
  const rapid = run.weaponMods.quillBurst?.rapidQuills ?? 0
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + rapid)), dt, () => fireQuills(run, stats, ipecacN(run, stats.count)))
}

function fireQuills(run, stats, count) {
  const p = run.player
  const speed = stats.speed
  const life = stats.range / speed
  // reboundQuills (v6.6.28): snapshotted onto the bullet at fire time, like every other per-bullet
  // budget here. Snapshot, not a read from run.weaponMods in stepBullets, so a quill already in
  // flight when the card is picked keeps the budget it was fired with — and so a quill fired by
  // ANYTHING ELSE (chitterSpines) can never acquire quillBurst's rebounds by accident.
  const rebounds = run.weaponMods.quillBurst?.reboundQuills ?? 0
  // Every burst used to leave on the SAME absolute bearings — `(i/count)*2pi`, no offset — so
  // consecutive rings retraced each other's rays and, with reboundQuills, the return sweep covered
  // exactly zero new angular ground. Rotating each burst by half a ray-spacing interleaves them.
  // Measured dps-neutral (it is a coverage change, not a throughput one); it exists so the ring
  // reads as a ring rather than as twelve fixed spokes.
  run._quillSpin = ((run._quillSpin ?? 0) + 1) % 2
  const base = (run._quillSpin * Math.PI) / count
  for (let i = 0; i < count; i++) {
    const angle = base + (i / count) * Math.PI * 2
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
      _reboundsLeft: rebounds,
      _reboundPierce: stats.pierce,   // what each return trip refunds the budget TO
      _reboundLife: life / QUILL_REBOUND_SPEED_MUL,  // same DISTANCE back, at the slower speed
      _reboundSpeed: speed * QUILL_REBOUND_SPEED_MUL,
      // Disable star's bullet behaviours on quills (they share run.bullets/stepBullets).
      _shard: false, _splitDone: true, _chainsLeft: 0,
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
  fireQuills(run, stats, ipecacN(run, stats.count + bonus))
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
  const spineCount = ipecacN(run, mods?.chitterSpines ?? 0)
  const p = run.player
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + rapid)), dt, () => {
    for (const r of ipecacRadii(run, stats.radius)) spawnNova(run, p.x, p.y, r, stats.dmg, stats.knockback, stats.fear)
    run.events.push({ type: 'shriek', x: p.x, y: p.y, radius: stats.radius }) // v6.2: own event — was a generic 'shoot' the render couldn't distinguish
    if (spineCount > 0) fireShriekSpines(run, stats, spineCount)
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

// chitterSpines (v6.6.28): the shriek spits `count` quills evenly around the circle. Deliberately
// NOT a call into fireQuills — these are the SHRIEK's spines, fired from the shriek's own stats,
// and routing them through the quill weapon's fire path would silently hand them quillBurst's
// count/pierce/rebound mods (and require owning quillBurst at all). They carry no `fear`: fear is
// carried by the nova, and a fear-bearing 360-degree ring is the exact design this mod was placed
// on the shriek to AVOID — see WEAPON_MODS.chitterShriek in config.js.
// Three things here are corrections to the first draft, and each was worth ~0 dps on its own:
//  - the spines SPAWN ON THE NOVA'S RIM, not at the player. Fired from the centre they travelled
//    outward through the disc the nova had just emptied — 280 knockback plus 1.8s of fear — and at
//    SHRIEK_SPINE_SPEED 500 against the L5 nova front's own 511 px/s they rode just inside the ring
//    for their whole useful life, reaching fresh ground only after the ring had already cleared it.
//    Measured that way, 66-73% of spines never touched anything and the median spine flew 358 of
//    its 368px untouched: +0.0% dps at one pick. Starting at the rim puts them straight into the
//    band the rout has NOT cleared, and it is also the reading the name promises — spines shedding
//    off the ring, not a second weapon firing from inside the player.
//  - they FAN AROUND aimAngle, not around world 0. `(i / count) * 2pi` at count 1 is angle 0, i.e.
//    due east in world space on every cast for the rest of the run.
//  - pierce 2, not 1: a spine that starts at the rim is already past the ring's own kill zone, so
//    stopping on the first body wastes the only thing this card adds, which is reach.
function fireShriekSpines(run, stats, count) {
  const p = run.player
  const range = stats.radius * SHRIEK_SPINE_RANGE_MUL
  const life = range / SHRIEK_SPINE_SPEED
  const aim = aimAngle(run)
  for (let i = 0; i < count; i++) {
    const angle = aim + (i / count) * Math.PI * 2
    const cx = Math.cos(angle)
    const cy = Math.sin(angle)
    run.bullets.push({
      x: p.x + cx * stats.radius, y: p.y + cy * stats.radius,
      vx: cx * SHRIEK_SPINE_SPEED,
      vy: cy * SHRIEK_SPINE_SPEED,
      dmg: Math.max(1, Math.round(stats.dmg * SHRIEK_SPINE_DMG_FRAC)),
      pierce: 2,
      life,
      r: QUILL_R,
      speed: SHRIEK_SPINE_SPEED,
      hitIds: new Set(),
      weapon: 'quill',
      // Never a rebound, whatever quillBurst is carrying: these are the SHRIEK's spines, fired from
      // the shriek's stats, and reboundQuill()'s snapshot fields are deliberately absent here.
      _reboundsLeft: 0,
      // Disable star's bullet behaviours (they share run.bullets/stepBullets).
      _shard: false, _splitDone: true, _chainsLeft: 0,
    })
  }
  // No event: the cast already pushed {type:'shriek'}, which SFX_FOR_EVENT maps to the 'shoot'
  // voice, so a second beat on the same frame would double-trigger it. ponytail: the spines are
  // visible bullets on an already-audible cast — give them their own event only if they get their
  // own voice in audio.js.
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

// -- Trash Tornado (v5.4 city; v6.8 hunters) ------------------------------------------------
// A pack of funnels, not an orbital. run.debris entries PERSIST between frames ({x, y, r, tgt})
// and this function moves them: each picks an enemy inside `hunt` px of the PLAYER, flies at it at
// travelSpeed and parks on it; with nothing in reach it spirals back into a ring of `radius`
// around the player and circles at rotSpeed — the pre-v6.8 look, now the idle state. Damage is
// unchanged, ticking on the per-enemy cooldown orbit uses (e._debrisCd, the run.orbs/orbCd
// bookkeeping). sweepLoot marks nearby gems/coins `_vac` so stepPickups reels them home past
// magnet range.
function stepTornadoWeapon(run, stats, fireRateMul, dt) {
  const p = run.player
  const mods = run.weaponMods.trashTornado
  const list = run.debris

  // Resize to `chunks` (moreTrash). A newcomer is seeded on its evenly-spaced ring slot rather
  // than on the player, so picking the card doesn't spit a funnel out of your own feet.
  const chunks = ipecacN(run, stats.chunks)
  while (list.length > chunks) list.pop()
  while (list.length < chunks) {
    const a = (list.length / chunks) * Math.PI * 2 + run.time * stats.rotSpeed
    list.push({ x: p.x + Math.cos(a) * stats.radius, y: p.y + Math.sin(a) * stats.radius, r: DEBRIS_R, tgt: null })
  }

  const huntSq = stats.hunt * stats.hunt
  const leashed = (e) => {
    const dx = e.x - p.x, dy = e.y - p.y
    return dx * dx + dy * dy <= huntSq
  }
  // Targets are STICKY while alive and still inside the leash: re-picking from scratch every frame
  // makes a funnel dither between two enemies that are near-equidistant and never reach either.
  // A held target is checked against the LIVE list rather than just its `_dead` flag — today
  // stepSim's filter is the only thing that ever removes an enemy, but a funnel that outlives its
  // prey by any other route would otherwise sit on the corpse's last coordinates forever, and that
  // failure mode is invisible until someone adds a despawn. One Set beats an includes() per funnel.
  const live = new Set(run.enemies)
  const claimed = new Set()
  for (const t of list) {
    if (t.tgt && (t.tgt._dead || !live.has(t.tgt) || !leashed(t.tgt))) t.tgt = null
    if (t.tgt) claimed.add(t.tgt)
  }
  // Whoever is free takes the nearest UNCLAIMED enemy — nearest to itself, not to the player, so a
  // ring of funnels fans out across a crowd. Without the claim they all pile onto the single
  // closest enemy, which looks like one blob and wastes most of the damage: the tick cooldown is
  // per ENEMY, so the second funnel on a target contributes nothing until the first one's expires.
  for (const t of list) {
    if (t.tgt) continue
    let best = null, bestD = Infinity
    for (const e of run.enemies) {
      if (e._dead || claimed.has(e) || !leashed(e)) continue
      const dx = e.x - t.x, dy = e.y - t.y
      const d = dx * dx + dy * dy
      if (d < bestD) { bestD = d; best = e }
    }
    if (best) { t.tgt = best; claimed.add(best) }
  }

  const step = stats.travelSpeed * dt
  for (let i = 0; i < list.length; i++) {
    const t = list[i]
    if (t.tgt) {
      const dx = t.tgt.x - t.x, dy = t.tgt.y - t.y
      const d = Math.hypot(dx, dy)
      if (d > 0.5) {
        const m = Math.min(step, d)
        t.x += (dx / d) * m
        t.y += (dy / d) * m
      }
    } else {
      // Nothing to hunt: spiral home. Integrated in POLAR — the angle advances at rotSpeed and the
      // radius closes on `radius` at travelSpeed — rather than flying at the funnel's rotating ring
      // slot in cartesian, which never converges: that slot travels rotSpeed × radius px/s, on the
      // order of the funnel's own top speed, so it would trail its own place around you forever.
      const dx = t.x - p.x, dy = t.y - p.y
      const cur = Math.hypot(dx, dy)
      let a = (cur < 1 ? (i / list.length) * Math.PI * 2 : Math.atan2(dy, dx)) + stats.rotSpeed * dt
      // ...and drift back toward this funnel's evenly-spaced slot while you're at it. Two hunts in
      // a row otherwise leave the pack bunched wherever it broke off, and the idle state stops
      // reading as an orbit at all — which is the half of this weapon that was already right.
      // `slot` is the pre-v6.8 ring formula verbatim, so a pack left alone settles into exactly the
      // spacing the orbital had.
      const slot = (i / list.length) * Math.PI * 2 + run.time * stats.rotSpeed
      let err = (slot - a) % (Math.PI * 2)
      if (err > Math.PI) err -= Math.PI * 2
      if (err < -Math.PI) err += Math.PI * 2
      a += err * Math.min(1, TORNADO_RESPACE * dt)
      const rad = cur + Math.max(-step, Math.min(step, stats.radius - cur))
      t.x = p.x + Math.cos(a) * rad
      t.y = p.y + Math.sin(a) * rad
    }

    for (const e of run.enemies) {
      if (e._dead || (e._debrisCd || 0) > 0) continue
      const dx = e.x - t.x, dy = e.y - t.y
      const rad = t.r + e.radius
      if (dx * dx + dy * dy > rad * rad) continue
      applyDamage(run, e, stats.dmg)
      e._debrisCd = stats.tick / fireRateMul
    }
  }

  // Street Sweeper (v6.9, replaces the enemy-pulling `suction`): every gem and coin within
  // TORNADO_SWEEP_R of ANY funnel is marked `_vac` — the same flag wave.undertow sets — and
  // stepPickups then homes it to the player ignoring magnet range. Marking is one-way and sticky,
  // so a funnel only has to touch a drop once for it to come home; nothing needs un-marking,
  // because collection removes the item.
  if (mods?.sweepLoot) {
    const sweepSq = TORNADO_SWEEP_R * TORNADO_SWEEP_R
    for (const t of list) {
      for (const it of run.gems) {
        if (it._vac) continue
        const dx = it.x - t.x, dy = it.y - t.y
        if (dx * dx + dy * dy <= sweepSq) it._vac = true
      }
      for (const it of run.coins) {
        if (it._vac) continue
        const dx = it.x - t.x, dy = it.y - t.y
        if (dx * dx + dy * dy <= sweepSq) it._vac = true
      }
    }
  }
}

// Is (x,y) inside ANY live lane's band — warn (telegraph) OR sweep, the band is "live" the moment
// it's telegraphed? Same rotated-rect along/perp idiom as stepLanes' own `inCar` (and inBeamArm):
// the lane's REST-FRAME band (lane.x/y/angle/len/w), not the moving car hitbox. Read-only, used by
// trafficMain (below). v6.6.14: run.lanes is NO LONGER city-only — the garden's mower feeds it too
// — so this scans lanes of both kinds. Harmless today (trafficMain rides burstHydrant, and a
// chapter can only offer its own weapons, so a garden run can never hold that mod), but do not
// re-assume "lanes implies city" here: filter on lane.look if a future reader needs one kind.
function pointInLane(run, x, y) {
  for (const lane of run.lanes) {
    const cos = Math.cos(lane.angle), sin = Math.sin(lane.angle)
    const dx = x - lane.x, dy = y - lane.y
    const along = dx * cos + dy * sin
    const perp = -dx * sin + dy * cos
    if (Math.abs(along) <= lane.len / 2 && Math.abs(perp) <= lane.w / 2) return true
  }
  return false
}

// -- Burst Hydrant (v5.4 city utility) ------------------------------------------------------
// Plants telegraphed eruption zones (run.zones) on/near random enemies within castRange; each
// waits out its harmless fuse, then erupts ONCE against ENEMIES only. The utility native — slowest
// rapidHydrant divides the interval; launch flings and stuns what the eruption catches; trafficMain
// (v6.3) biases placement onto lane-covered foes (below) and hits harder there (stepZones).
function stepHydrantWeapon(run, w, stats, fireRateMul, dt) {
  const rapid = run.weaponMods.burstHydrant?.rapidHydrant ?? 0
  const p = run.player
  const zones = ipecacN(run, stats.count)
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + rapid)), dt, () => {
    for (let i = 0; i < zones; i++) {
      // Each zone in a cast arrives a little later than the last. The wait is a DELAY that holds the
      // zone dormant, NOT extra fuse: fuse is the hydrant's rattle-and-blow animation and every
      // hydrant should play the same one. Folding the stagger into the fuse (v6.10 did) gave the
      // third hydrant of a cast a 0.76s telegraph against the first's 0.20s — visibly different
      // spawn animations for identical objects.
      //
      // The lead still has to cover the WHOLE wait (delay + fuse), because that is when this mark
      // resolves; leading by the fuse alone would plant a late zone where the target already was.
      const delay = i * HYDRANT_STAGGER
      const spot = pickHydrantSpot(run, stats.castRange, delay + stats.fuse)
      run.zones.push({
        x: spot.x, y: spot.y, r: stats.r, fuse: stats.fuse, dur: stats.fuse, dmg: stats.dmg,
        delay, jetDur: stats.jetDur, tick: stats.tick, nStreams: stats.streams,
      })
    }
    run.events.push({ type: 'hydrant', x: p.x, y: p.y })
  })
}

// trafficMain's placement bias: when held, prefer a foe already standing in a live lane — filter
// candidates to those BOTH in castRange and in a lane, and pick among them FIRST; only fall back to
// the ordinary (unbiased) pickBloomSpot pick when none qualify (mod absent, or no lane-covered foe
// right now). RNG shape: the biased branch draws exactly ONE random, same as pickBloomSpot's own
// enemy-hit branch; the fallback calls pickBloomSpot verbatim, so "mod held, no lane" draws exactly
// what "mod absent" draws. This runs inside fireOnTimer's cast callback — event-timed, not
// per-frame-stable like createRun's boot sequence — so an occasional extra draw here never shifts a
// frame-stable stream; no seeded test asserts RNG-stream state across a hydrant cast (checked against
// every AA.e burstHydrant assertion: they check zone existence/damage/timing, never exact position
// or a cross-run stream comparison).
function pickHydrantSpot(run, castRange, fuse) {
  const p = run.player
  const rangeSq = castRange * castRange
  const tm = run.weaponMods.burstHydrant?.trafficMain ?? 0
  if (tm > 0) {
    const inLane = run.enemies.filter((e) => {
      if (e._dead || isAlly(e)) return false   // SUBMISSION: never mark your own ally
      const dx = e.x - p.x, dy = e.y - p.y
      return dx * dx + dy * dy <= rangeSq && pointInLane(run, e.x, e.y)
    })
    if (inLane.length > 0) {
      const e = inLane[Math.floor(Math.random() * inLane.length)]
      // Lead ONLY if the led point is still in a lane. Leading pulls the mark toward the player,
      // who is usually off the carriageway — so an unguarded lead drags the zone out of the very
      // band that earns trafficMain its (1+tm)x, i.e. the mod would sabotage itself. In-lane
      // placement is worth more here than the lead: a lane is a moving hazard, so a foe standing in
      // one is about to be shoved around regardless.
      const led = leadSpot(run, e, fuse)
      return pointInLane(run, led.x, led.y) ? led : { x: e.x, y: e.y }
    }
  }
  // Deliberately NOT pickBloomSpot, though the RNG shape is identical to it (one draw to choose an
  // enemy, two for the no-enemy fallback) so seeded streams are unchanged: the lead needs the ENEMY,
  // not just its position, because how far to lead depends on how fast that particular thing moves.
  const inRange = run.enemies.filter((e) => {
    if (e._dead || isAlly(e)) return false   // SUBMISSION: never mark your own ally
    const dx = e.x - p.x, dy = e.y - p.y
    return dx * dx + dy * dy <= rangeSq
  })
  if (inRange.length > 0) return leadSpot(run, inRange[Math.floor(Math.random() * inRange.length)], fuse)
  // Nothing in reach. Plant close to the player rather than anywhere in castRange — whatever arrives
  // next is arriving HERE, so a mark out at the rim is a zone that expires in empty street.
  const a = Math.random() * Math.PI * 2
  const d = Math.random() * castRange * HYDRANT_IDLE_FRAC
  return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d }
}

// Plant on the path, not on the target: the fuse resolves 0.6-0.7s after the cast, and pre-v6.10
// 27% of eruptions caught nothing while standing still cut that by 2.4x — the weapon was marking
// where the swarm had been.
//
// The lead is a DISTANCE (how far this enemy travels while the fuse burns), not a fraction of the
// gap to the player. The fraction version was the first attempt and it overshoots badly: a foe 300px
// out led 40% of the way moves the mark 120px, when a drone only covers 54px in a 0.6s fuse — the
// mark lands ahead of the swarm instead of on it, and 37.7% of jets caught nothing over their whole
// life. Scaling by e.speed self-tunes per archetype (wisp 99px, drone 54px, tank 33px) and is the
// same quantity the whiff was made of in the first place.
//
// Direction is straight at the player. That is exactly right for an ordinary seeker and merely
// approximate for the flagged movers (pastSeek, orbiters, divers) — they are the minority, and a
// persistent jet's 3s life absorbs the error. Draws no randoms.
function leadSpot(run, e, fuse) {
  const p = run.player
  const dx = p.x - e.x, dy = p.y - e.y
  const dist = Math.hypot(dx, dy)
  if (dist < 1e-6) return { x: e.x, y: e.y }
  const lead = Math.min((e.speed ?? 0) * (fuse ?? 0), dist)
  return { x: e.x + (dx / dist) * lead, y: e.y + (dy / dist) * lead }
}


// Shared by the Burst Hydrant and the Reality Shard's tornSeam. Never touches the player.
//
// Two lifecycles, chosen by whether the zone carries a jetDur (see the run.zones block in
// config.js). A Burst Hydrant erupts and then STAYS OPEN, spraying on a per-(enemy, jet) cooldown; a
// tornSeam rift erupts once and is gone, exactly as before v6.10. The rift path is load-bearing —
// making rifts persistent would silently rebalance a weapon in another chapter.
function stepZones(run, dt) {
  if (!run.zones || run.zones.length === 0) return
  const launchBonus = run.weaponMods.burstHydrant?.launch ?? 0

  for (const g of run.zones) {
    if (g.jet > 0) { stepOpenJet(run, g, dt); continue }   // already erupted, still spraying
    // Dormant: planted but not yet arrived (the cast's stagger). Nothing is drawn for it and
    // nothing can touch it — its fuse has not started.
    if (g.delay > 0) { g.delay -= dt; continue }

    g.fuse -= dt
    if (g.fuse > 0) continue // telegraph — harmless

    // ---- eruption ----
    const dmg = zoneDmg(run, g)
    const rSq = g.r * g.r
    for (const e of run.enemies) {
      if (e._dead) continue
      // A zone carrying `d` is a SEAM, not a disc: it cuts within g.r of the LINE from (g.x, g.y)
      // to d px along g.a — the gap the shard skipped. Everything else (every Burst Hydrant) keeps
      // the historical disc, which is what the d=0 case degenerates to anyway.
      const dx = e.x - g.x, dy = e.y - g.y
      if (g.d > 0) {
        const t = Math.max(0, Math.min(1, (dx * Math.cos(g.a) + dy * Math.sin(g.a)) / g.d))
        const ox = dx - Math.cos(g.a) * g.d * t, oy = dy - Math.sin(g.a) * g.d * t
        if (ox * ox + oy * oy > rSq) continue
      } else if (dx * dx + dy * dy > rSq) continue
      applyDamage(run, e, dmg)
      // launch: the eruption throws them clear and leaves them stunned (see e.stunT in state.js).
      // Eruption frame only — the gentle continuous drift of an open jet is baseline (stepOpenJet),
      // and this stays the hard one-shot fling that the mod sells.
      if (launchBonus > 0 && !e._dead) {
        const d = Math.hypot(dx, dy)
        const ux = d > 1e-6 ? dx / d : 1
        const uy = d > 1e-6 ? dy / d : 0
        if (!(e.affixes && e.affixes.includes('anchored'))) {
          e.kb.x += ux * HYDRANT_LAUNCH_KB
          e.kb.y += uy * HYDRANT_LAUNCH_KB
        }
        if (!resistsCC(e)) { e.stunT = Math.max(e.stunT || 0, HYDRANT_STUN * launchBonus * ccScale(run, e)); spendCC(run, e) }
      }
    }
    // `rift` tells render.js this is a seam closing rather than a detonation — it draws the zip
    // along (a, d) instead of explosionBurst's orange scorch. a/d are the same numbers the capsule
    // above was tested against, so the art and the hitbox cannot drift apart.
    run.events.push({ type: 'explode', x: g.x, y: g.y, radius: g.r, rift: g._chained, a: g.a, d: g.d })

    if (g.jetDur > 0) {
      g.jet = g.jetDur                   // the main is open; spray from here
      g._cd = new Map()                  // per-(enemy, jet) tick cooldown, keyed by enemy id
    } else {
      g._done = true                     // tornSeam: one pop, gone
    }
  }
  run.zones = run.zones.filter((g) => !g._done)
  // The cap is a render/readability guard as much as a balance one (the rim is the hitbox now), so
  // it drops the OLDEST zones: killing the newest would silently eat the cast the player just made.
  if (run.zones.length > ZONE_MAX_LIVE) run.zones = run.zones.slice(-ZONE_MAX_LIVE)
}

// trafficMain (v6.3): a zone centered inside a live lane hits (1+tm)x harder. Resolved at the zone's
// own (g.x, g.y) — panicRout's "multiply at the damage site" pattern, applied to the baseDmg fed
// into applyDamage. Re-resolved per tick on purpose: a lane sweeps past a live jet mid-life, and the
// jet should start hitting harder when it does.
function zoneDmg(run, g) {
  const tm = run.weaponMods.burstHydrant?.trafficMain ?? 0
  return tm > 0 && pointInLane(run, g.x, g.y) ? g.dmg * (1 + tm) : g.dmg
}

// An open hydrant: hose the nearest few foes, shove them along the stream, and damage each on its
// own cooldown. The cooldown map belongs to THIS hydrant, so a foe caught in two overlapping
// hydrants' streams takes both.
function stepOpenJet(run, g, dt) {
  g.jet -= dt
  if (g.jet <= 0) { g._done = true; return }

  const tm = run.weaponMods.burstHydrant?.trafficMain ?? 0
  const spray = zoneDmg(run, g) * HYDRANT_SPRAY_FRAC
  const tick = g.tick > 0 ? g.tick : 0.4
  const rSq = g.r * g.r

  // TURRET, not a zone. The hydrant locks the nearest `g.streams` foes in range and hoses each
  // one; nothing else in the radius is touched. A radial zone was the readable-ness problem the
  // owner called out — a 128px circle of damage has to be drawn as a 128px circle of art, several
  // overlap, and the screen turns to soup. Aimed streams put the damage exactly where the art is,
  // so what is being hit is legible at a glance and the space between streams stays clear.
  //
  // Nearest-N by insertion, not by sorting the whole candidate list: this runs per hydrant per
  // frame with up to ZONE_MAX_LIVE hydrants live, and N is 3.
  // Clamped to HYDRANT_STREAMS_MAX: the render rig has that many stream sprites and no more.
  const maxStreams = Math.min(HYDRANT_STREAMS_MAX, Math.max(1, Math.round(g.nStreams ?? HYDRANT_STREAMS_FALLBACK)))
  const picks = []
  for (const e of run.enemies) {
    if (e._dead || isAlly(e)) continue   // SUBMISSION: an ally would eat one of GEYSER_STREAMS_MAX stream slots
    const dx = e.x - g.x, dy = e.y - g.y
    const d2 = dx * dx + dy * dy
    if (d2 > rSq) continue
    if (picks.length < maxStreams) {
      picks.push({ e, d2 })
      picks.sort((a, b) => a.d2 - b.d2)          // at most 3 entries
    } else if (d2 < picks[picks.length - 1].d2) {
      picks[picks.length - 1] = { e, d2 }
      picks.sort((a, b) => a.d2 - b.d2)
    }
  }

  // Render reads this to draw one stream per target (see syncJets). Positions, not ids: the stream
  // is drawn where the water is actually going, and an enemy that dies this frame should not leave
  // render chasing a stale id.
  g.streams = picks.map((p) => ({ x: p.e.x, y: p.e.y }))

  for (const { e } of picks) {
    // Shoved along the stream, away from the hydrant. Only what is actually being hosed gets
    // pushed — the drift used to apply to everything in the radius, which no longer has meaning
    // now that the radius is a range rather than a damage area.
    if (!(e.affixes && e.affixes.includes('anchored'))) {
      const dx = e.x - g.x, dy = e.y - g.y
      const d = Math.hypot(dx, dy)
      const ux = d > 1e-6 ? dx / d : 1
      const uy = d > 1e-6 ? dy / d : 0
      e.kb.x += ux * HYDRANT_JET_PUSH * dt
      e.kb.y += uy * HYDRANT_JET_PUSH * dt
    }
    if ((g._cd.get(e.id) ?? -1) > run.time) continue
    g._cd.set(e.id, run.time + tick)
    applyDamage(run, e, spray)
  }

  // trafficMain also extends a street hydrant's life — it hits harder AND lasts longer. Applied
  // once, when the jet first crosses mid-life, so it cannot compound frame over frame.
  if (!g._midLife && g.jet <= g.jetDur * 0.5) {
    g._midLife = true
    if (tm > 0 && pointInLane(run, g.x, g.y)) g.jet += g.jetDur * tm
  }
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

  // IPECAC: front, left and right — the spec's own reading of "three of it" for a cone.
  const struck = new Set()
  for (const swing of ipecacAngles(run, angle)) {
    for (const e of run.enemies) {
      if (e._dead || struck.has(e)) continue
      if (!inSector(p.x, p.y, swing, stats.range, arc, e, fullCircle)) continue
      struck.add(e)
      applyDamage(run, e, stats.dmg)
      if (e._dead) continue
      shoveFromPlayer(run, e, stats.knockback)
      // staggerBonus IS the stun in seconds (STAGGER_STUN_PER_PICK per normal pick) — no second
      // constant multiplying it, so the number on the card is the number applied here. Math.max,
      // not +=: casts REFRESH the timer rather than accumulating, which is what stops a fire-rate
      // build from chain-locking the screen (the same reason the CC_DR_* pricing exists).
      if (staggerBonus > 0 && !resistsCC(e)) { e.stunT = Math.max(e.stunT || 0, staggerBonus * ccScale(run, e)); spendCC(run, e) }
    }
    run.events.push({ type: 'roar', x: p.x, y: p.y, angle: swing, range: stats.range, arc })
  }
}

// Radial shove away from the player (the sector sweeps' knockback). Anchored elites take the
// damage and stand their ground, exactly as they do against a nova.
function shoveFromPlayer(run, e, knockback) {
  if (resistsCC(e)) return
  const p = run.player
  const dx = e.x - p.x, dy = e.y - p.y
  const d = Math.hypot(dx, dy)
  const ux = d > 1e-6 ? dx / d : 1
  const uy = d > 1e-6 ? dy / d : 0
  const k = ccScale(run, e)
  e.kb.x += ux * knockback * k
  e.kb.y += uy * knockback * k
  spendCC(run, e)
}

// -- Tail Lash (v7.23 skies, replaces the v5.4 Tail Swipe) -----------------------------------
// A long THIN line, not a sector. It aims at the FARTHEST crushable enemy in reach — the inverse of
// every other weapon in the game, all of which aim at the nearest — and drags it back to be crushed
// underfoot. See WEAPONS.tailLash + the LASH_* block in config.js for why only aircraft get pulled.
// quickTail divides the interval; counterLash fires a free lash when the player is hit; doubleHook
// hooks more aircraft at once; wreckingBall makes a dragged body hurt what it plows through.
function stepLashWeapon(run, w, stats, fireRateMul, dt) {
  if (run._lashCounterCd > 0) run._lashCounterCd = Math.max(0, run._lashCounterCd - dt)
  const quick = run.weaponMods.tailLash?.quickTail ?? 0
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + quick)), dt, () => fireLash(run, stats))
}

// Is `e` on the ray from the player heading `angle`, and how far along? -1 if not.
// firstOnRay/rayHit already implement exactly this test for the beams; reuse it rather than
// writing a second thin-line geometry that can drift out of agreement with the first.
function lashTargets(run, angle, stats) {
  const p = run.player
  const out = []
  for (const e of run.enemies) {
    if (e._dead || isAlly(e)) continue
    const along = alongRay(p.x, p.y, angle, stats.range, stats.width, e)
    if (along >= 0) out.push({ e, along })
  }
  return out
}

function fireLash(run, stats) {
  const p = run.player
  const wrecking = run.weaponMods.tailLash?.wreckingBall ?? 0
  const hooks = (stats.hooks ?? 1) + (run.weaponMods.tailLash?.doubleHook ?? 0)

  // Aim at the FARTHEST crushable enemy in reach, falling back to the farthest enemy of any kind
  // when no aircraft is up (the lash still swings, it just has nothing to drag). `aimAngle`'s
  // nearest-enemy rule is deliberately NOT used — reaching past the crowd is the whole weapon.
  const angle = farthestAimAngle(run, stats.range)
  if (angle == null) return

  // IPECAC: three lashes instead of one, 120 degrees apart. The line is thin, so unlike the old
  // sector there is no overlap to dedupe — but a body CAN sit on two rays at once near the player,
  // so `hit` still guards against one enemy eating the same cast twice.
  const hit = new Set()
  for (const swing of ipecacAngles(run, angle)) {
    const onLine = lashTargets(run, swing, stats)
    for (const { e } of onLine) {
      if (e._dead || hit.has(e)) continue
      hit.add(e)
      applyDamage(run, e, stats.dmg)
    }
    // Hook the farthest crushable bodies IN REACH — deliberately not "on the line". The line is
    // what the tail SWEEPS THROUGH (it damages that); the hooks are what it comes back with, and
    // requiring all of them to sit on one thin ray made `hooks` a stat that read 3 and delivered 1
    // in almost every real cast (probe frame: hooks 3 at L5, one tether). A card whose number the
    // player cannot see happening is the exact defect this whole rework exists to remove.
    // A hooked body dies on ARRIVAL through stepEnemies' crushable branch — this never kills it.
    const catchable = run.enemies
      .filter((e) => !e._dead && !isAlly(e) && e.flags && e.flags.includes('crushable') &&
                     (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= stats.range * stats.range &&
                     !run.drags.some((d) => d.id === e.id))
      .sort((a, b) => ((b.x - p.x) ** 2 + (b.y - p.y) ** 2) - ((a.x - p.x) ** 2 + (a.y - p.y) ** 2))
      .slice(0, hooks)
      .map((e) => ({ e }))
    for (const { e } of catchable) {
      run.drags.push({ id: e.id, t: 0, dur: LASH_PULL_T, hitIds: new Set([e.id]),
                       dmg: wrecking > 0 ? Math.round(stats.dmg * LASH_DRAG_FRAC * wrecking) : 0 })
    }
    run.events.push({ type: 'tail', x: p.x, y: p.y, angle: swing, range: stats.range,
                      hooked: catchable.length })
  }
}

// Reels every hooked aircraft toward the player. wreckingBall makes the travelling body damage what
// it passes (once per victim per drag — hitIds), which is the visible version of the old
// wreckingTail: a 340-460px journey you watch, not a 37px nudge into an invisible 60px disc.
function stepDrags(run, dt) {
  if (run.drags.length === 0) return
  const p = run.player
  for (const d of run.drags) {
    const e = run.enemies.find((x) => x.id === d.id)
    if (!e || e._dead) { d.t = d.dur; continue }
    d.t += dt
    const k = Math.min(1, dt / Math.max(1e-6, d.dur - (d.t - dt)))  // fraction of the REMAINING gap
    e.x += (p.x - e.x) * k
    e.y += (p.y - e.y) * k
    e.kb.x = 0; e.kb.y = 0    // the reel owns this body's motion; a leftover shove would fight it
    if (d.dmg > 0) {
      for (const other of run.enemies) {
        if (other._dead || d.hitIds.has(other.id) || isAlly(other)) continue
        const dx = other.x - e.x, dy = other.y - e.y
        if (dx * dx + dy * dy > LASH_DRAG_R * LASH_DRAG_R) continue
        d.hitIds.add(other.id)
        dealDamage(run, other, d.dmg, false)
      }
    }
  }
  run.drags = run.drags.filter((d) => d.t < d.dur)
}

// counterLash: getting hurt lashes for free, at most every LASH_COUNTER_CD (cf. retaliate).
function tryCounterLash(run) {
  const bonus = run.weaponMods.tailLash?.counterLash ?? 0
  if (bonus <= 0 || (run._lashCounterCd ?? 0) > 0) return
  const w = run.weapons.find((x) => x.id === 'tailLash')
  if (!w) return
  run._lashCounterCd = LASH_COUNTER_CD
  fireLash(run, effectiveWeaponStats(run, w))
}

// -- Atomic Breath (v7.23 skies) -------------------------------------------------------------
// Charges, then burns while FORKING from body to body. The fork is REBUILT on every damage tick
// (buildFork), so dead branches drop out and fresh targets snap in mid-burn — that is what makes it
// read as lightning rather than as a ray, and it is also the mechanic.
function stepBreathWeapon(run, w, stats, fireRateMul, dt) {
  const quick = run.weaponMods.atomicBreath?.quickBreath ?? 0
  // v7.25 (owner: "it should charge even if no enemies around ... then start charging again as soon
  // as it finished firing"). The breath is a CYCLE, not a cadence: wind up, discharge, wind up
  // again, with no dead air between. `interval` is set to charge + duration in config so the timer
  // comes ready exactly as the previous breath expires.
  //
  // Charging never depends on there being a target — fireBreath does not look at run.enemies at all,
  // so the plates light on schedule in an empty street and the discharge simply finds whatever has
  // arrived by the time it fires.
  //
  // The live-arc guard is what makes this safe rather than merely fast: quickBreath and the global
  // fire-rate divide `interval`, so without it a fast build would start a second breath ON TOP of
  // one still burning. Two overlapping forks are double damage from one weapon, and they draw as
  // one thicker fork — the "same hit, bigger" shape, invisible in a screenshot.
  if (run.arcs.length > 0) { run.weaponTimers[w.id] = 0; return }
  fireOnTimer(run, w.id, stats.interval / (fireRateMul * (1 + quick)), dt, () => fireBreath(run, stats))
}

function fireBreath(run, stats) {
  const p = run.player
  // IPECAC has no angle to fan here — a fork is not a ray. The honest analogue is N forks that ROOT
  // ON DIFFERENT BODIES (rootRank skips the k nearest when picking a root), so the extra output
  // covers new ground instead of stacking three identical chains on the same chain of enemies —
  // which would be the x3 DAMAGE card this anomaly was rewritten to escape.
  // ONE local for the count, used as both the loop bound and the rank spread: writing the count
  // twice is exactly how v7.6.0 shipped fifteen phages in five positions.
  const casts = ipecacAngles(run, 0).length
  for (let k = 0; k < casts; k++) {
    // Snapshot the mod-derived numbers at cast, the same rule fireBeam applies to Strobe and Beam
    // Prism: a mod picked mid-burn must not retune a breath that is already in the air.
    run.arcs.push({
      life: stats.duration + BREATH_CHARGE_T, duration: stats.duration, charge: BREATH_CHARGE_T,
      tick: stats.tick, acc: 0, dmg: stats.dmg,
      jumps: stats.jumps + (run.weaponMods.atomicBreath?.forked ?? 0),
      arcRange: stats.arcRange, castRange: stats.range, rootRank: k,
      falloutBonus: run.weaponMods.atomicBreath?.fallout ?? 0,
      // x/y track the fork's ROOT body (not the player), so two forks anchored on different enemies
      // are distinguishable — by render, and by anything asking where this arc actually is.
      x: p.x, y: p.y, nodes: [],
    })
  }
  run.events.push({ type: 'breath', x: p.x, y: p.y })
}

// The fork, rebuilt from scratch: root at the NEAREST enemy (owner's spec), then repeatedly jump to
// the nearest not-yet-taken enemy within arcRange of the last one. Returns the chain of enemies.
function buildFork(run, a) {
  const p = run.player
  const chain = []
  const taken = new Set()
  let fx = p.x, fy = p.y
  // The root reaches as far as one jump does, so a breath cast with nothing adjacent still lights.
  for (let i = 0; i <= a.jumps; i++) {
    // The ROOT reaches the closest enemy within the weapon's own `range`; arcRange governs how far
    // the fork JUMPS between bodies and nothing else. v7.23 used arcRange for both, so an enemy at
    // 250px was invisible and the breath discharged into empty ground; v7.25 fixed that by opening
    // the root to the whole viewport, which was too much initial reach (owner). a.castRange is the
    // middle: comfortably past arcRange, well under the screen.
    const reach = i === 0 ? a.castRange : a.arcRange
    // The ROOT skips the `rootRank` nearest, so IPECAC's extra forks anchor on different bodies.
    // Clamped by availability: a crowd smaller than the rank falls back to the nearest, not nothing.
    const skip = i === 0 ? (a.rootRank ?? 0) : 0
    const ranked = []
    for (const e of run.enemies) {
      if (e._dead || isAlly(e) || taken.has(e.id)) continue
      const dx = e.x - fx, dy = e.y - fy
      const dSq = dx * dx + dy * dy
      if (dSq <= reach * reach) ranked.push({ e, dSq })
    }
    if (ranked.length === 0) break
    ranked.sort((m, n) => m.dSq - n.dSq)
    const best = ranked[Math.min(skip, ranked.length - 1)].e
    taken.add(best.id)
    chain.push(best)
    fx = best.x; fy = best.y
  }
  return chain
}

function stepArcs(run, dt) {
  const p = run.player
  for (const a of run.arcs) {
    a.life -= dt
    if (a.charge > 0) {
      a.charge = Math.max(0, a.charge - dt)
      a.nodes = []          // nothing is lit while it winds up — the charge is dead time on purpose
      continue
    }
    if (a.life <= 0) continue
    a.acc += dt
    let ticked = false
    while (a.acc >= a.tick) {
      a.acc -= a.tick
      ticked = true
      const chain = buildFork(run, a)
      a.nodes = [{ x: p.x, y: p.y }, ...chain.map((e) => ({ x: e.x, y: e.y }))]
      if (chain.length > 0) { a.x = chain[0].x; a.y = chain[0].y }
      let dmg = a.dmg
      for (const e of chain) {
        const dealt = applyDamage(run, e, dmg)
        if (a.falloutBonus > 0 && dealt > 0 && !e._dead) applyIgnite(e, a.falloutBonus, dealt)
        dmg *= BREATH_JUMP_DMG_MUL
      }
      if (chain.length > 0) run.events.push({ type: 'arc', nodes: a.nodes })
    }
    // Between ticks the fork still has to FOLLOW the bodies it is attached to, or a 0.12s-tick beam
    // visibly lags every moving target by up to a tick. Cheap: re-read the same nodes' positions.
    if (!ticked && a.nodes.length > 1) a.nodes[0] = { x: p.x, y: p.y }
  }
  run.arcs = run.arcs.filter((a) => a.life > 0)
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
  const chunks = ipecacN(run, stats.count)
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + rapid)), dt, () => {
    for (let i = 0; i < chunks; i++) {
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
        _shard: false, _splitDone: true, _chainsLeft: 0,
      })
    }
  }
  run.lobs = run.lobs.filter((lo) => !lo._done)
}

// -- Reality Shard (v5.4 beyond starter) ---------------------------------------------------
// Fans `count` shards at the nearest enemy (star's STAR_FAN volley shape). Each is a run.bullets
// entry tagged weapon:'shard' that flies normally but TELEPORTS along its own heading every
// blinkEvery seconds — skipping the gap entirely, which is the point (nothing in between is hit).
// rapidShard divides the interval; tornSeam splits the skipped gap open along its whole length;
// recursion forks a shard that outlives its range (see the shard branch of stepBullets).
function stepShardWeapon(run, w, stats, fireRateMul, dt) {
  const rapid = run.weaponMods.realityShard?.rapidShard ?? 0
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + rapid)), dt, () => fireShards(run, stats))
}

function fireShards(run, stats) {
  const p = run.player
  const baseAngle = aimAngle(run)
  const life = stats.range / stats.speed
  // Both the bound AND the fan's centring divisor — see the orbit bug above for what happens when
  // only one of them moves.
  const shards = ipecacN(run, stats.count)
  for (let i = 0; i < shards; i++) {
    const angle = baseAngle + (i - (shards - 1) / 2) * STAR_FAN
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
      _shard: false, _splitDone: true, _chainsLeft: 0,
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
  // tornSeam (v7.29): the gap the shard just skipped does not close cleanly — it splits open
  // along the whole skip and cuts what stands in it. The zone spans departure -> arrival, so `a`
  // and `d` are LOAD-BEARING, not decoration: stepZones hit-tests a `d` zone as a capsule about
  // that line, and render.js draws exactly the same line. Until v7.29 this was a 55px disc at the
  // departure point that erupted like a grenade, which described neither the skip nor the weapon.
  // Rifts reuse run.zones (the same "telegraph then erupt, enemies only" contract) flagged
  // _chained, the "not a Burst Hydrant cast" marker.
  const seam = run.weaponMods.realityShard?.tornSeam ?? 0
  if (seam > 0) {
    run.zones.push({
      x: fromX, y: fromY, r: SHARD_RIFT_W,
      fuse: SHARD_RIFT_FUSE, dur: SHARD_RIFT_FUSE,
      dmg: b.dmg * SHARD_RIFT_FRAC * seam, _chained: true,
      a: Math.atan2(b.vy, b.vx), d: b._blinkDist,
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
      _shard: false, _splitDone: true, _chainsLeft: 0,
    })
  }
}

// -- Pulsar Sweep (v5.4 beyond) ----------------------------------------------------------
// One run.beams entry flagged `swept`: a second arm sits 180° opposite the first and sweeps with
// it, so a cast rakes both sides at once (hyperSweep adds arms — 3 = 120° apart, 4 = 90°...).
// Baking every arm into ONE entity (rather than N beams, the way rainbow.prismatic does) is
// what lets collapse resolve it as a single event. rapidSweep divides the cast interval.
function stepPulsarWeapon(run, w, stats, fireRateMul, dt) {
  const rapid = run.weaponMods.pulsarSweep?.rapidSweep ?? 0
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + rapid)), dt, () => firePulsar(run, stats))
}

function firePulsar(run, stats) {
  const mods = run.weaponMods.pulsarSweep
  // In a lane the forward direction is the ONLY direction that matters, and it is fixed — so the
  // fan is anchored to straight-ahead rather than to aimAngle's nearest-enemy pick, which could
  // (and did) lock onto a straggler already behind the player.
  const lane = CHAPTERS[run.chapter].lane === true
  const baseAngle = lane ? -Math.PI / 2 : aimAngle(run)
  run.beams.push({
    angle: baseAngle, baseAngle, fan: lane ? PULSAR_FAN_ARC : 0,
    life: stats.duration, duration: stats.duration, dmg: stats.dmg,
    tick: stats.tick, width: stats.width, length: stats.length,
    rotSpeed: stats.rotSpeed, acc: 0,
    swept: true,
    arms: ipecacN(run, PULSAR_ARMS + (mods?.hyperSweep ?? 0)),
    collapseBonus: mods?.collapse ?? 0,
  })
  run.events.push({ type: 'beam' })
}

// -- Pincer (v7.55 surf starter — THE PARRY) --------------------------------------------------
// Read this before changing anything here: THIS WEAPON HAS NO TIMER, AND THAT IS THE FEATURE.
// The other 23 weapons all run through fireOnTimer — an interval elapses, something is emitted, and
// the player's only input into that is where they are standing. The Pincer holds a claw out toward
// the nearest enemy and does NOTHING until something comes inside it. Its output is therefore a
// function of what the crowd does, and a player who kites perfectly gets nothing from it at all.
//
// The two halves are split the way the bloom's and the lure's are — a placement site called from
// the weapon dispatch, and a stepper called from the entity block below it:
//   stepPincerWeapon  lays the claws out (this frame's aim, position, reach) and NOTHING else. It
//                     never damages, never arms, never disarms.
//   stepGuards        the trigger: a proximity scan over run.enemies, plus the re-arm countdown.
//
// If you are here to add a `fireOnTimer` call, or an accumulator that snaps when it fills: that is
// weapon #24 of the kind this one exists not to be, and run US.e part (b) is the assertion that
// catches it (a stationary enemy far away must leave the guard armed for as long as it sits there).
function stepPincerWeapon(run, w, stats) {
  const p = run.player
  // NO fireRateMul. Every other step function takes it and divides its interval by it; there is no
  // interval here to divide, and folding it into `cd` would make "attack speed" a stat on a weapon
  // with no attack cadence — and would silently make the build sheet's `cd` row (which divides by
  // nothing, unlike the `every` row) wrong. The Pincer's cadence is set by the enemy, and the knobs
  // that move it are reach and re-arm, both on the card.
  const target = nearestEnemy(run)
  // fireFlagella's hard-won aim rule (v5.1.2): the nearest enemy first, because a kiting player's
  // heading points AWAY from the swarm; the last move direction only as a fallback.
  let angle
  if (target) angle = Math.atan2(target.y - p.y, target.x - p.x)
  else if (p.facingAngle != null) angle = p.facingAngle
  else angle = p.facing >= 0 ? 0 : Math.PI

  // backClaw: a second claw at your back. The list is one shared LOCAL count used for both the
  // layout loop AND the angle it spaces them by — the two-sites-one-count rule in CLAUDE.md; three
  // claws laid out on one angle would render exactly like no change at all.
  const backClaw = (run.weaponMods.pincer?.backClaw ?? 0) > 0
  const angles = []
  for (const a of ipecacAngles(run, angle)) {
    angles.push(a)
    if (backClaw) angles.push(a + Math.PI)
  }

  // RESIZED IN PLACE, never rebuilt: `armed` and `cd` are the whole state of this weapon, and a
  // fresh object every frame is a claw that forgets it ever snapped, i.e. no cooldown at all.
  while (run.guards.length < angles.length) run.guards.push({ x: p.x, y: p.y, angle: 0, r: 0, armed: true, cd: 0, rearm: 0, dmg: 0, knock: 0 })
  if (run.guards.length > angles.length) run.guards.length = angles.length

  for (let i = 0; i < angles.length; i++) {
    const g = run.guards[i]
    g.angle = angles[i]
    g.r = stats.r
    g.dmg = stats.dmg
    g.knock = stats.knock
    // The re-arm DURATION, snapshotted alongside dmg/knock so the scan below is self-contained.
    // `cd` is the live countdown; `rearm` is what it is reset to. Two fields because a claw that is
    // currently closed still has to know how long its own cooldown was.
    g.rearm = stats.cd
    // Held OUT, between the player and what is coming — not centred on them. The offset scales with
    // the claw's own radius (PINCER_HOLD_FRAC) so Long Arm buys reach, not just a fatter blob.
    const hold = stats.r * PINCER_HOLD_FRAC
    g.x = p.x + Math.cos(g.angle) * hold
    g.y = p.y + Math.sin(g.angle) * hold
  }
}

// The trigger and the re-arm. A claw closes on EVERYTHING whose centre is inside it, not on the one
// nearest body — the claw is a shield, and a guard that removes one enemy from a pack of eight while
// the other seven walk past it is not guarding anything. It is also what makes the weapon's damage
// survive contact with a crowd: measured single-target, the pincer threw away 56% of every snap as
// overkill on a body that was already dying (weapon-census, surf L5), which is what a big number on
// a long cooldown always does. `r` is small (50-66px) and offset forward, so in a sparse field this
// is still exactly one body and in a crush it is three or four — the weapon scales with the thing it
// exists to answer, without ever becoming a nova on a timer.
// `cd` is the only clock in it, and it does not start until a snap has happened, so an armed claw
// over an empty beach stays armed indefinitely.
function stepGuards(run, dt) {
  if (run.guards.length === 0) return
  for (const g of run.guards) {
    if (!g.armed) {
      g.cd -= dt
      if (g.cd <= 0) { g.cd = 0; g.armed = true }
      continue
    }
    const rSq = g.r * g.r
    let caught = 0
    for (const e of run.enemies) {
      if (e._dead || isAlly(e)) continue   // SUBMISSION: never pinch your own ally
      const dx = e.x - g.x, dy = e.y - g.y
      if (dx * dx + dy * dy > rSq) continue
      applyDamage(run, e, g.dmg)
      // Away from the PLAYER, not from the claw — "it gets yanked away" means away from you, and a
      // shove along the claw's own axis would fling a body that came in from the side sideways past
      // you. shoveFromPlayer is also what makes an anchored elite take the hit and hold its ground,
      // the same contract every other knockback in the game keeps.
      shoveFromPlayer(run, e, g.knock)
      caught++
    }
    if (caught === 0) continue
    g.armed = false
    g.cd = g.rearm
    run.events.push({ type: 'pinch', x: g.x, y: g.y, angle: g.angle, r: g.r })
  }
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
      // Chemotaxis-marked loot (_vac) homes in regardless of magnet range — it rides the same
      // speed ramp as a normal magnet pull (magnetSpeed clamps at dist >= magnet either way).
      if (it._vac || distSq <= magnetSq) {
        const dist = Math.sqrt(distSq)
        const spd = magnetSpeed(dist, magnet)
        it.x += (dx / dist) * spd * dt
        it.y += (dy / dist) * spd * dt
      }
      kept.push(it)
    }
    return kept
  }

  // TIME DEBT's compensation (v7.2). The clock costs you LEVELS, not survival — measured at 1.5x
  // the run ends ~3 levels lower — so the card pays it back in the currency it took. Applied at
  // pickup rather than to the level curve because xpForLevel is a module-level import that no
  // per-run field can reach; this is the same lever the harness measured through (run.mods.xpMul).
  const xpMul = run.anomalies?.timeDebt ? TIME_DEBT_XP_MUL : 1
  run.gems = collect(run.gems, (g) => {
    p.xp += g.xp * GEM_VALUE * (1 + run.passives.xpGain) * run.mods.xpMul * xpMul
    run.events.push({ type: 'gem', x: g.x, y: g.y })
  })
  run.coins = collect(run.coins, (c) => {
    // AVARICE (v7.2): a share of the coins you collect heal instead of paying out. Rolled at
    // PICKUP, which is what makes the card immune to every coinMul mutator — every coin is
    // value 1, so the pickup count is the quantity converted, measured at 593/run in city d2.
    // Deliberately NOT gated by COIN_CAP_PER_RUN: the cap bounds the META payout, runs already
    // measure 791/999 against it, and a card that silently switches off in the last minute of a
    // long run is a card the player cannot reason about.
    // CONVERTS ONLY WHEN THE HEAL CAN LAND. `healPlayer` clamps to maxHP and returns early under
    // BLOOD PACT, so converting unconditionally CONSUMED the coin for nothing in two reachable
    // cases: at full HP (the card is then a pure coin tax, and it gets worse the better you play —
    // a perverse incentive nobody can read off the text) and under BLOOD PACT (which suppresses
    // every heal, so the pair destroyed 20% of the run's coins outright). Both are invisible: the
    // card says "heal 5 HP INSTEAD OF paying out", from which every player infers that a coin
    // which cannot heal still pays. It does now.
    const canHeal = run.player.hp < run.player.maxHP && !run.anomalies?.bloodPact
    if (run.anomalies?.avarice && canHeal && Math.random() < AVARICE_HEAL_CHANCE) {
      // Carry the HP that ACTUALLY LANDED, not AVARICE_HEAL_HP. healPlayer clamps to maxHP, so a
      // pickup at maxHP-2 heals 2 — and the renderer prints this number. Sending the nominal 5
      // would put a figure on screen that the HP bar visibly contradicts, which is worse than the
      // silence it replaces.
      const before = run.player.hp
      healPlayer(run, AVARICE_HEAL_HP)
      run.events.push({ type: 'coin', x: c.x, y: c.y, value: c.value, healed: true, heal: Math.round(run.player.hp - before) })
      return
    }
    // v6.4.2: clamp at COIN_CAP_PER_RUN (config.js) — pickups past the cap still sparkle
    // (the event still fires below), they just stop paying out.
    run.coinsEarned = Math.min(COIN_CAP_PER_RUN, run.coinsEarned + Math.round(c.value * p.coinGainMul * run.mods.coinMul))
    run.events.push({ type: 'coin', x: c.x, y: c.y, value: c.value })
  })
}

// ---- Level up -----------------------------------------------------------------------

// Weapon candidates: new (unowned, only if under MAX_WEAPONS) + upgrades (below max level).
// A `New!` entry carries its weapon's inherent config rarity (that IS the jackpot moment); an
// UPGRADE carries UPGRADE_RARITY, which is deliberately not a RARITIES key so ui.js prints no chip
// — see the note at the push site below. Passives are not touched here at all: bucket-first picks
// them in their own bucket, before any rarity is rolled.
// Build-focus nudge (see NEW_WEAPON_FADE in config.js): arsenal investment = every pick
// spent upgrading an owned weapon or buying a weapon mod. Derived from state, no counter.
// v6.7 (Track B): the nudge is applied by rollCard as a WEIGHT on each `New!` entry, not here as
// a pre-filter. Under bucket-first the weapon bucket has a fixed share whenever it is non-empty,
// so dropping `New!` entries from this list would only reshuffle which weapon card you get.
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
    // New-weapon offers are scoped to the run's chapter (see CHAPTERS in config.js) — the other
    // chapters' natives simply never appear in this run's pool.
    for (const id of CHAPTERS[run.chapter].weapons) {
      if (!ownedIds.has(id)) {
        const cfg = WEAPONS[id]
        list.push({ kind: 'weapon', id, title: cfg.name, desc: cfg.desc, tag: 'New!', rarity: cfg.rarity, icon: cfg.icon })
      }
    }
  }
  for (const w of run.weapons) {
    if (w.level < MAX_WEAPON_LEVEL) {
      const cfg = WEAPONS[w.id]
      // An upgrade shows NO tier (UPGRADE_RARITY, not a RARITIES key — see config.js). The weapon
      // you already own is not a jackpot, and under bucket-first its card fires on
      // BUCKET_WEIGHTS.weapon percent of rolls (22% when this was written, 17% since v7.7)
      // whatever the tier table says, so wearing cfg.rarity here put a Mythic border on 8.9% of
      // city's cards — every one of them a Neon Beam level.
      list.push({ kind: 'weapon', id: w.id, title: cfg.name, desc: cfg.desc, tag: `Lv ${w.level + 1}`, rarity: UPGRADE_RARITY, icon: cfg.icon })
    }
  }
  return list
}

function eligiblePassiveIds(run) {
  // The lane's magnet is already Infinity (see stepPickups) — offering 'Sticky Aura' there is a
  // dead pick that burns a level-up slot doing nothing.
  const lane = CHAPTERS[run.chapter].lane
  // BRITTLE (v7.2) does the same thing to the whole DEFENSIVE bucket, and at far greater cost.
  // At maxHP 1 all three defensive passives are exactly dead: `maxHP` is skipped by applyChoice
  // (the ceiling has to hold, or the run-ender is refundable), `regen` heals up to a ceiling of 1,
  // and `armor` cannot save a hit that hurtPlayer floors at 1 damage against 1 HP. Left in the
  // pool they are not a curiosity — DEFENSIVE_PASSIVES is all three of them and B2 weights them 4
  // against the other passives' 1, so ~17% of every card offered for the rest of the run would be
  // guaranteed to do nothing, with no chip and no grey-out. Ending your run is what BRITTLE is
  // for; quietly voiding a sixth of your remaining level-ups is the "catastrophe the player could
  // neither foresee nor act on" the slate's own bar forbids.
  // BLIND FAITH (v7.5): a `values` passive declares its own tier table, and the floor may leave it
  // only ONE legal key — armor and regen both declare {normal, rare, legendary}, so under an epic
  // floor every single one of them would deal LEGENDARY. Measured x2.80 on armor and x2.34 on
  // regen per card, which puts armor at a flat 20 at MAX_PASSIVE_LEVEL. BERSERK's shipped safety
  // argument is licensed word for word on "armor measures 2.4-3.7 in real runs… blocks 10-20% of a
  // hit, not 100%", and BLIND FAITH + BERSERK is a legal pair under MAX_ANOMALIES_PER_RUN — so a
  // rarity FLOOR would have become a rarity CEILING on the two cards that block damage, and taken
  // another card's balance with it.
  // A card with one legal tier is also not a ROLL any more: its border would say the same word
  // every time regardless of what was rolled, which is a lie on the one screen where the border is
  // all the player has. So it leaves the pool instead. That is the honest reading of the card's own
  // text — you cannot pick carefully in the dark — and `maxHP` has no values table, so the defence
  // bucket never empties.
  const floored = run.anomalies?.blindFaith
  const floorIdx = RARITY_ORDER.indexOf(BLIND_FAITH_FLOOR)
  const brittle = !!run.anomalies?.brittle
  // BLOOD PACT kills `regen` by the same argument and it is not a small slice: regen measures
  // 6.4% of every card offered, and under that card healPlayer refuses it outright. The card is
  // supposed to RE-PRICE the passive pool, not quietly keep selling you the one pick it voided.
  const noHeal = !!run.anomalies?.bloodPact
  return Object.keys(PASSIVES).filter((id) =>
    (run.passivePicks[id] ?? 0) < MAX_PASSIVE_LEVEL
    && !(lane && id === 'magnet')
    && !(brittle && DEFENSIVE_PASSIVES.includes(id))
    && !(noHeal && id === 'regen')
    && !(floored && PASSIVES[id].values
      && Object.keys(PASSIVES[id].values).filter((r) => RARITY_ORDER.indexOf(r) >= floorIdx).length < 2))
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
// starting/only weapon (star) can't flood every early pool with all 5 of its mods, and no single
// weapon dominates once several are owned. If the combined list still exceeds MOD_POOL_MAX
// (several weapons owned), uniformly sample MOD_POOL_MAX. NOTE what that sample does NOT do any
// more: under bucket-first (v6.7.4) the mod bucket carries BUCKET_WEIGHTS.mod flat whenever it has
// any candidate at all, so the sample decides WHICH mods are offered, never HOW OFTEN. It can no
// longer crowd out weapon/passive/
// element cards.
function eligibleWeaponModCandidates(run) {
  const candidates = []
  // SPECIALIST (v7.5) widens its named weapon HERE as well as at the per-screen cap, and the pool
  // ceiling with it. Lifting only the cap is inert: MOD_CANDIDATES_PER_WEAPON = 2 means a weapon
  // never HAS a third distinct mod on the screen to place, and `pickedIds` forbids repeating one.
  // The three numbers have to move together or the card is a rate the player cannot see.
  const focus = specialistFocus(run)
  const blind = !!run.anomalies?.blindFaith
  for (const w of run.weapons) {
    const modCfgs = WEAPON_MODS[w.id]
    if (!modCfgs) continue
    const picks = run.weaponModPicks[w.id]
    // v6.6.15: a 'switch' mod is an on/off unlock, so it is eligible ONCE. It used to sit in the
    // pool for MAX_WEAPON_MOD_PICKS picks, offering the player a card that did nothing.
    // v6.6.27 (owner: "reduce the number of redundant mods") generalises that: a mod may declare
    // its own `maxPicks` when its marginal value collapses well before the global cap. Same defect
    // as the switch case, one step softer — a card that is still legal but no longer worth taking.
    const owned = Object.keys(modCfgs).filter((modId) =>
      // BLIND FAITH (v7.5): a `switch` is offered ONLY at normal rarity (makeWeaponModCard declines
      // every tier above it), so under the epic floor it could only ever arrive through rollCard's
      // all-declined fallback — printing a normal-bordered card on a screen that promised none.
      // Drop the class outright instead. Losing rule-change mods is the honest price of the floor.
      !(blind && modCfgs[modId].kind === 'switch')
      // SPECIALIST (v7.5) is expressed ENTIRELY inside modPickCap: the focused weapon's mods stay
      // eligible SPECIALIST_EXTRA_PICKS past the global ceiling. One function, so the pause sheet
      // and the pool can never disagree about what a weapon's cap is.
      && (picks?.[modId] ?? 0) < modPickCap(w.id, modId, focus))
    shuffleInPlace(owned)
    // SPECIALIST's price: every weapon that is NOT the focus puts one fewer mod in the pool. Only
    // charged when a focus actually exists, and floored at 1 so a weapon is never silenced.
    const per = focus && w.id !== focus
      ? Math.max(1, MOD_CANDIDATES_PER_WEAPON - SPECIALIST_OTHER_PENALTY)
      : MOD_CANDIDATES_PER_WEAPON
    for (const modId of owned.slice(0, per)) candidates.push({ weapon: w.id, mod: modId })
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

// Elements are offered always (no weapon prerequisite), up to their pick cap. v6.7 (Track B):
// the ELEMENT_CARD_WEIGHT pre-filter that used to thin this list is gone — how often an element
// card appears is BUCKET_WEIGHTS.element and nothing else, so the declared 18% is deliverable.
// (Dropping all four ids on 31.6% of pools capped the bucket at ~12%.)
function eligibleElementIds(run) {
  return Object.keys(ELEMENTS).filter((id) => (run.elementPicks[id] ?? 0) < MAX_ELEMENT_PICKS)
}

// A passive card adopts whatever rarity was rolled for its slot — UNLESS it carries a `values`
// table (armor/regen, v6.3.4): then it rolls only the listed rarities, at the listed exact
// amounts, and returns null at any other rarity (epic/mythic) so the card just isn't offered at
// that tier, and never a bug. The caller (rollCard) does NOT drop the card: having already chosen
// the passive bucket, it re-rolls the rarity across this passive's own `values` keys and offers the
// card anyway — dropping it would silently convert a defensive roll into no card at all.
function makePassiveCard(run, id, rarity) {
  const cfg = PASSIVES[id]
  let bonus
  if (cfg.values) {
    if (!(rarity in cfg.values)) return null
    bonus = cfg.values[rarity]
  } else {
    const mult = RARITIES[rarity].mult
    bonus = cfg.base * mult
    if (cfg.kind === 'flat') bonus = Math.round(bonus * 10) / 10
  }
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
  // v6.6.15: a switch has no magnitude, so there is nothing for rarity to scale. It declines to
  // roll above normal (the makePassiveCard idiom — returning null just means "not a candidate at
  // this tier"), and its card states the effect rather than a meaningless "+N".
  if (cfg.kind === 'switch' && rarity !== 'normal') return null
  // v6.7.6: `values` on a weapon mod works exactly as it does on a passive (makePassiveCard, and
  // its doc comment) — the mod rolls ONLY the rarities the table lists, at the exact amounts it
  // lists, and returns null everywhere else, which the caller already treats as "no candidate at
  // this tier" rather than as a bug. Beam Prism uses it to have no normal-rarity card at all: its
  // whole design is that the rarity you rolled IS the stat, and there is no meaningful split
  // smaller than into 2.
  if (cfg.values) {
    if (!(rarity in cfg.values)) return null
    const bonus = cfg.values[rarity]
    return { kind: 'mod', id: modId, weapon: weaponId, title: cfg.name,
      desc: cfg.descFor ? cfg.descFor(bonus) : cfg.desc.includes('{n}') ? cfg.desc.replaceAll('{n}', `${bonus}`) : `+${bonus} ${cfg.desc}`,
      tag: `${WEAPONS[weaponId].name} upgrade`, rarity, icon: cfg.icon, bonus }
  }
  const mult = RARITIES[rarity].mult
  let bonus
  if (cfg.kind === 'switch') bonus = 1
  // v6.6.28: `perTier` scales a tier mod's step without touching the shared ladder. One entity per
  // rarity step is the right granularity when the entity is a whole nova or a whole blade, and much
  // too fine when it is one bullet out of a ring — chitterSpines at a bare tier bonus fired ONE
  // spine at a normal pick, and fireShriekSpines spaces its spines by `i / count`, so that single
  // spine left at angle 0, due east, on every cast for the rest of the run. Multiplying HERE rather
  // than at the fire site is what keeps the card honest: applyChoice banks this bonus verbatim, so
  // the number the card promises is the number the weapon fires. `?? 1` leaves every existing tier
  // mod bit-identical.
  else if (cfg.kind === 'tier') bonus = WEAPON_MOD_TIER_BONUS[rarity] * (cfg.perTier ?? 1)
  else if (cfg.kind === 'flat') bonus = Math.max(1, Math.round(cfg.base * mult))
  // 'secs' banks a DURATION, which is the one kind whose raw product reaches the player as text: a
  // legendary Stagger is 0.35 × 4 = 1.4000000000000001, and {n} would print every digit of it.
  // Rounded to 2dp here so the banked value and the card agree exactly, rather than only on screen.
  else if (cfg.kind === 'secs') bonus = Math.round(cfg.base * mult * 100) / 100
  else bonus = cfg.base * mult
  // A desc carrying {n} places the amount ITSELF, anywhere in the sentence, instead of taking the
  // usual "+N " head — see modEffectText in ui.js, which is what actually renders it (and which
  // each language re-places independently, the number being interpolated after translation).
  const nStr = cfg.kind === 'pct' ? `${Math.round(bonus * 100)}%` : `${bonus}`
  const desc = cfg.kind === 'switch'
    ? cfg.desc
    : cfg.desc.includes('{n}')
      ? cfg.desc.replaceAll('{n}', nStr)
      : `+${nStr} ${cfg.desc}`
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

// Which anomaly cards may be offered right now. Computed BEFORE the tier's roll (see
// rollAnomalyCard): an empty eligible list means the tier simply does not roll, never that its
// weight deflects onto legendary — deflection is what measured 16.1% legendary in the shim's
// first draft (F1) — and it costs zero Math.random calls, which is what keeps every seeded test
// whose run cannot see the tier bit-identical.
function eligibleAnomalyIds(run) {
  if (Object.keys(run.anomalies ?? {}).length >= MAX_ANOMALIES_PER_RUN) return []
  const level = run.player.level ?? 1
  return Object.keys(ANOMALIES).filter((id) => {
    if (run.anomalies?.[id]) return false   // no levels: taken once, gone from the pool
    const a = ANOMALIES[id]
    // Per-card floor over the table default (config.js ANOMALY_MIN_LEVEL): F10's argument is
    // about COST cards, and applying it to a no-cost jackpot only delays the card past the point
    // where it can still change how the run is played.
    if (level < (a.minLevel ?? ANOMALY_MIN_LEVEL)) return false
    if (a.chapter && a.chapter !== run.chapter) return false
    try { return a.when(run) } catch { return false }  // a bad predicate loses its card, not the screen
  })
}

// The weight the anomaly tier competes at on THIS screen, exported so the suite can pin the
// arithmetic exactly rather than infer it from a rate (a 1-point weight step is a 0.9-point rate
// step, which no affordable sample size can separate — v6.7.8 shipped the `- 1` below with the
// whole suite still green when it was deleted).
//   count - 1  because run._screensSinceAnomaly INCLUDES the screen being built: stepLevelUp
//              advances it before calling the builder, so the DRY screens behind this one are
//              count - 1. That is what makes the FIRST screen the tier is eligible on roll at
//              exactly ANOMALY_BASE_WEIGHT, i.e. what keeps that constant's documented share a
//              rate the game really rolls at. The clamp covers a caller that never went through
//              stepLevelUp (the probe harness, a test fixture).
//   no slots   the term must not read run.choiceSlots, directly or through the counter: pity that
//              scales with slots is the meta-shop lottery the per-screen roll exists to close,
//              arriving through the pity term instead of the base rate.
export function anomalyWeightFor(run) {
  const dryScreens = Math.max(0, (run._screensSinceAnomaly ?? 0) - 1)
  return Math.min(ANOMALY_PITY_CAP, ANOMALY_BASE_WEIGHT + ANOMALY_PITY_PER_SCREEN * dryScreens)
}

// The anomaly tier's roll: ONCE PER DEAL — including every paid re-deal, at ANOMALY_REROLL_MUL of
// the weight (v7.20; it used to be memoised per screen, see that constant) — against the ordinary
// table's TOTAL rather than as an entry inside RARITY_WEIGHTS. Rolling against the total is what makes it a parallel
// tier: its share reads directly as weight/(total + weight), it never perturbs the rarity ladder,
// and a failed roll simply leaves the screen as rolled.
function rollAnomalyCard(run) {
  const eligible = eligibleAnomalyIds(run)
  if (eligible.length === 0) return null
  // RARITY_WEIGHTS, UNDECAYED — never the reroll-decayed table rollCard builds. Summing the
  // decayed one would shrink the denominator the tier competes against every time the player paid
  // for a reroll: 8.6% -> 11.6% of screens at REROLL_RARITY_CAP, +35% relative, i.e. coins buying
  // the rarest tier through the back door after v6.7.9 closed the front one (spec B6). Still
  // load-bearing under v7.20, and more so: the tier is rolled on every re-deal now, so a decayed
  // denominator would compound across rerolls instead of being settled once by the old memo.
  const ordinaryTotal = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0)
  // x ANOMALY_REROLL_MUL on any deal the player PAID for (v7.20). The tier is an ordinary card now —
  // a reroll can find it and can lose it — and this is the whole of what stops coins farming it.
  const paid = (run._screenRerolls ?? 0) > 0
  const anomalyWeight = anomalyWeightFor(run) * (paid ? ANOMALY_REROLL_MUL : 1)
  if (Math.random() * (ordinaryTotal + anomalyWeight) >= anomalyWeight) return null
  // RESET WHEN THE TIER IS OFFERED — the credit buys the screen carrying the card, not the card
  // being kept. Resetting on the PICK instead would put the tier back on screen every ~5 level-ups
  // until the player accepted it, which turns declining one of the slate's COST cards into a nag
  // rather than a decision. Declining costs the credit, and costs it once per screen for free (see
  // the reset below). NOTE the consequence of v7.20, which is real and deliberate: a re-deal can
  // now lose a Rupture that was already offered, and the credit stays spent — you had your offer.
  // That is F5's second clause arriving by the front door instead of the back, and it is the price
  // of the tier being an ordinary card.
  // The other half of that contract lives downstream: the NEW_WEAPON_MIN_RATE swap is guarded on
  // !placedAnomaly precisely so a reset can never be followed by the card being overwritten (F4).
  // v7.5: the assignment moved DOWN to the return, so that a card which bails after this point
  // (the subject branch below) cannot spend the credit and hand back nothing — that is F5's first
  // clause, arriving through a new door.
  const w = {}
  for (const id of eligible) w[id] = ANOMALIES[id].weight
  const id = pickWeighted(w)
  const a = ANOMALIES[id]
  // A SUBJECTED card (SPECIALIST) carries the LIST of weapons it may be pointed at, and the PLAYER
  // picks — ui.js opens a chooser when the card is taken. It is not weighted or auto-assigned here,
  // because both auto-assignments that were tried measured as the same card: "first past the gate"
  // and "most invested" both name the starter 86-94% of the time, and the spec's whole conclusion
  // was that the choice is the product ("point it at the geyser you are building, not the rainbow
  // you are not"). No Math.random is drawn for it, deliberately.
  const subjects = a.subjects ? a.subjects(run) : null
  // What the chooser needs to be a DECISION rather than a list of names: how much this run has
  // already put into each candidate. Travels on the card so ui.js needs no second data channel and
  // main.js stays glue.
  const subjectPicks = subjects
    ? Object.fromEntries(subjects.map((wid) => [wid, weaponModPickCount(run, wid)]))
    : null
  // No `bonus` key at all: applyChoice's anomaly branch banks a rule, not a number, and a bonus
  // here would be silently ignored (or, worse, silently applied by a future branch). `from` is its
  // OWN field, not the `tag`: tag is a nowrap pill sized for "Lv 3"/"New!", and a sentence in it
  // overflows the card (the modal is min(92vw, 390px)). ui.js renders `from` as its own wrapping
  // line under the description.
  // Charged ONCE PER SCREEN for free, without a flag: zeroing is idempotent and nothing raises
  // _screensSinceAnomaly again until stepLevelUp opens the next screen, so a second offer on a
  // re-deal cannot re-spend a credit that is already at 0. (v7.20 briefly carried a
  // _screenAnomalyPaid guard for this; it could never fire.)
  // The pre-spend value is stashed so a reroll that DISCARDS this offer can hand half of it back —
  // see refundPityOnReroll. Without the stash the credit is unrecoverable the instant it is spent.
  run._pityBeforeAnomaly = run._screensSinceAnomaly
  run._screensSinceAnomaly = 0
  return { kind: 'anomaly', id, title: a.name, desc: a.desc, from: a.from, tag: '', rarity: 'anomaly', icon: a.icon, subjects, subjectPicks }
}

// ---- dev menu (v7.12) --------------------------------------------------------------------
// EVERY card the game can produce, flat, in the ordinary card shape — for the hidden dev screen
// (ui.js gates it behind seven taps on the HUD coin badge). Deliberately ignores every
// eligibility rule the real pools enforce: chapter weapon pool, PASSIVE/anomaly minLevel, an
// anomaly's `when` gate, MAX_ANOMALIES_PER_RUN, and already-picked dedup. The point is to TEST a
// card, and half the slate is gated behind conditions that take a real run to reach — SUBMISSION
// alone needs an elite kill first.
//
// Rarity: `rarity` is the tier PREFERRED, not the tier forced. The make*Card factories return
// null for a tier a card does not offer (a `switch` mod is normal-only; Beam Prism's `values` is
// epic-only; see makeWeaponModCard), so each candidate walks the ladder and takes the first tier
// that yields a card. Without that walk the dev list silently omits exactly the cards whose
// rarity rules are unusual — i.e. the ones most worth testing.
export function devCards(run, rarity = 'rare') {
  const tiers = [rarity, ...RARITY_ORDER]
  const firstTier = (make) => {
    for (const r of tiers) { const c = make(r); if (c) return c }
    return null
  }
  const out = []
  for (const id of Object.keys(WEAPONS)) {
    const cfg = WEAPONS[id]
    const owned = run.weapons.find((w) => w.id === id)
    // Same two shapes buildLevelUpChoices deals: a NEW weapon carries its own rarity, an upgrade
    // carries UPGRADE_RARITY (not a RARITIES key, so ui.js prints no tier chip).
    out.push({ kind: 'weapon', id, title: cfg.name, desc: cfg.desc,
      tag: owned ? `Lv ${owned.level + 1}` : 'New!',
      rarity: owned ? UPGRADE_RARITY : cfg.rarity, icon: cfg.icon })
  }
  for (const id of Object.keys(PASSIVES)) {
    const c = firstTier((r) => makePassiveCard(run, id, r))
    if (c) out.push(c)
  }
  for (const wid of Object.keys(WEAPON_MODS)) {
    for (const mid of Object.keys(WEAPON_MODS[wid])) {
      const c = firstTier((r) => makeWeaponModCard(run, wid, mid, r))
      if (c) out.push(c)
    }
  }
  for (const id of Object.keys(ELEMENTS)) {
    const c = firstTier((r) => makeElementCard(run, id, r))
    if (c) out.push(c)
  }
  for (const id of Object.keys(ANOMALIES)) {
    const a = ANOMALIES[id]
    // This list ignores every eligibility rule (see the header), so a SUBJECTED card can arrive
    // with nothing legal to point at. An empty list is not inert but WRONG: applyChoice banks
    // `true`, specialistFocus reads that as "no focus", and the card silently does nothing while
    // the pause sheet still lists it. Fall back to the whole loadout — any owned weapon is a legal
    // thing to specialise in, and the point of this menu is to test the card.
    // ponytail: no CHOOSER here, so this takes weapon [0]; add one if picking the subject from the
    // dev menu turns out to matter.
    const subj = a.subjects?.(run)
    const subjects = subj ? (subj.length ? subj : run.weapons.map((w) => w.id)) : null
    out.push({ kind: 'anomaly', id, title: a.name, desc: a.desc, from: a.from, tag: '',
      rarity: 'anomaly', icon: a.icon, subjects,
      subjectPicks: subjects ? Object.fromEntries(subjects.map((w) => [w, weaponModPickCount(run, w)])) : null })
  }
  return out
}

// Hand one of those cards to the ORDINARY pick path. Routing through run.levelUpChoices instead
// of duplicating applyChoice's branches is the whole point of the dev menu: a card added here
// takes exactly the code path a card taken from a level-up screen takes, so what you are testing
// is the shipped behaviour and not a second implementation of it.
export function devTake(run, card, subject = null) {
  run.levelUpChoices = [card]
  applyChoice(run, 0, subject)
}

// Roll ONE card: bucket first (BUCKET_WEIGHTS), then a rarity inside it. Never walks the rarity
// ladder — an empty bucket is dropped and the remainder renormalized, because deflecting a failed
// roll onto the next tier down is what produced 16.1% legendary in the shim's first draft (F1).
// Rarity is a BONUS SCALAR; it has no business choosing the KIND of card, which is what rolling it
// first did: the weapon bucket vanished on every roll no available weapon happened to carry, and
// its 22 points silently went to whatever was left (weapon share measured 9.6% against a declared
// 22%, worst chapter 4.9%). Excludes ids already used by earlier cards this pool.
// The anomaly tier is NOT rolled here — it is one roll per SCREEN in buildLevelUpChoices, which
// is what keeps its rate independent of choiceSlots. Rolling it per slot delivered
// 1-(1-p)^slots: measured 2.40 anomalies/run at 2 slots against 3.60 at 4, i.e. a lottery on
// meta-shop spending.
function rollCard(run, weaponPool, passiveIds, modCandidates, elementIds, pickedIds, modWeaponCounts) {
  // Build each bucket's live option list ONCE, so "is this bucket empty" and "pick from it" can
  // never disagree.
  const buckets = {}
  const modCap = maxModsPerWeaponPerPool(effectiveSlots(run))

  // The weapon bucket's members are weighted here rather than at pick time, because the
  // build-focus fade has to be able to thin the RATE of `New!` cards and not just their share of
  // the bucket. An UPGRADE competes at the flat WEAPON_UP_WEIGHT; a `New!` card competes at its
  // weapon's inherent rarity weight times newWeaponChance (see NEW_WEAPON_FADE in config.js).
  // Inherent rarity is a WEIGHT on `New!` only, never a filter, and never applied to upgrades —
  // rarity gates ACQUISITION (that IS the jackpot moment), never LEVELLING.
  // A weight inside the bucket can only decide WHICH weapon card you get, never how often you get
  // one — so when every owned weapon is already MAXED the bucket holds nothing but `New!` entries
  // and the fade has to gate the bucket itself. Without that, a fully committed build measured
  // MORE discovery than a fresh one (357 `New!` cards against 254): the nudge running backwards.
  // With an upgrade available the bucket is full weight, because an upgrade is always a card
  // worth offering; the fade then only thins discovery's share of it.
  const weaponOpts = weaponPool.filter((wc) => !pickedIds.has(wc.id))
  const weaponW = {}
  if (weaponOpts.length > 0) {
    const pNew = newWeaponChance(arsenalInvestment(run))
    let hasUpgrade = false
    for (let i = 0; i < weaponOpts.length; i++) {
      const isNew = weaponOpts[i].tag === 'New!'
      if (!isNew) hasUpgrade = true
      // RARITY_WEIGHTS here, never the reroll-decayed table: this weight decides WHICH weapon is
      // offered, not how big a card is, and rerolling is a promise about size. Decaying it would
      // quietly turn coins into rarer *acquisitions* — a discovery lever nobody named, stacked on
      // top of the fade this same line already applies.
      weaponW[i] = isNew ? (RARITY_WEIGHTS[weaponOpts[i].rarity] ?? 1) * pNew : WEAPON_UP_WEIGHT
    }
    buckets.weapon = BUCKET_WEIGHTS.weapon * (hasUpgrade ? 1 : pNew)
  }

  // Defence and utility are separate buckets (BUCKET_WEIGHTS), not one passive bucket with a
  // weight inside it: the survivability share and the seven-other-passives share are two
  // different design numbers, and a weight inside one bucket leaves the second one implicit —
  // it can then halve without any test or any config line noticing.
  const passiveOpts = passiveIds.filter((pid) => !pickedIds.has(pid))
  const defenseOpts = passiveOpts.filter((pid) => DEFENSIVE_PASSIVES.includes(pid))
  const utilityOpts = passiveOpts.filter((pid) => !DEFENSIVE_PASSIVES.includes(pid))
  if (defenseOpts.length > 0) buckets.defense = BUCKET_WEIGHTS.defense
  if (utilityOpts.length > 0) buckets.utility = BUCKET_WEIGHTS.utility

  // SPECIALIST's focus is read here for the WEIGHT below only. It deliberately does NOT touch this
  // filter, nor MOD_POOL_MAX: `modOpts.length > 0` is what decides whether the mod BUCKET exists at
  // all, so lifting either lets the card keep the bucket alive on screens that would have dropped
  // it — measured +17.8% mod share at two slots, i.e. the card CREATING deliverability, which is
  // exactly what the spec forbids. Focus may decide which weapon wins a mod card; never whether one
  // is dealt.
  const focus = specialistFocus(run)
  const modOpts = modCandidates.filter((mc) =>
    !pickedIds.has(mc.mod)
    && (modWeaponCounts.get(mc.weapon) ?? 0) < modCap)
  if (modOpts.length > 0) buckets.mod = BUCKET_WEIGHTS.mod

  const elementOpts = elementIds.filter((eid) => !pickedIds.has(eid))
  // MUTATORS.unstable's elementWeightMul keeps its reader here now that ELEMENT_CARD_WEIGHT is
  // gone: it scales the bucket, which is the one place element frequency is decided. It is
  // applied EXACTLY once — folding it in here AND keeping a per-id gate double-counts. The
  // multiplier itself was re-priced against this reader (config.js): the same x3 that saturated
  // against the old per-id filter measures 38.6% of all cards elemental against this one.
  if (elementOpts.length > 0) buckets.element = BUCKET_WEIGHTS.element * (run.mods?.elementWeightMul ?? 1)

  if (Object.keys(buckets).length === 0) return null

  const bucket = pickWeighted(buckets)
  // Rerolling THIS screen decays the `normal` weight and nothing else, so every other tier's share
  // rises proportionally without a second knob (config.js REROLL_RARITY_DECAY/CAP). Rerolling buys
  // BIGGER NUMBERS — never a different KIND of card. Three separate places enforce that half, and
  // each has its own assertion in run PB4, because "size, not kind" is what makes the purchase
  // honest rather than a lever on the pool's composition:
  //   - the BUCKET roll above is untouched (a reroll that reshaped the buckets would be a
  //     different screen, not a better one),
  //   - the weapon bucket's `New!` weights stay on RARITY_WEIGHTS (which weapon, not how big),
  //   - the mod bucket rolls CANDIDACY on RARITY_WEIGHTS too, because `normal` is the only tier a
  //     rule-change mod is offered at — see the mod branch below.
  // ...and never more of the sixth tier, which rolls against the UNDECAYED total in
  // rollAnomalyCard.
  // The counter is the reroll PURCHASE's (rerollLevelUpChoices at the bottom of this file; see
  // _screenRerolls in state.js): it counts rerolls paid for on the open screen, never builds.
  // Clamped both ways — below 0 because the shipped samplers pin it at -1 to mean "base rate",
  // above REROLL_RARITY_CAP because the decay is geometric.
  const rr = Math.min(REROLL_RARITY_CAP, Math.max(0, run._screenRerolls ?? 0))
  // BLIND FAITH's floor is applied LAST, over the decayed table, so a blind player who also pays
  // for a reroll gets the decay applied to a `normal` weight that is then removed — i.e. the two
  // compose to "the floor wins", which is the promise the card printed.
  const rarityWeights = rarityTableFor(run, rr === 0
    ? RARITY_WEIGHTS
    : { ...RARITY_WEIGHTS, normal: RARITY_WEIGHTS.normal * Math.pow(REROLL_RARITY_DECAY, rr) })
  const rarity = pickWeighted(rarityWeights)

  if (bucket === 'weapon') {
    // A weapon card keeps its inherent rarity for its chip rather than adopting the rolled one —
    // applyChoice's weapon branch never reads rarity, so an adopted colour would mean nothing.
    // weaponCandidates already gave UPGRADE entries UPGRADE_RARITY (no tier at all): the chip is
    // the acquisition jackpot, and re-firing it for a weapon you own spends it for nothing.
    const wc = weaponOpts[Number(pickWeighted(weaponW))]
    // BLIND FAITH (v7.5): a weapon card's rarity is not a rolled tier at all — a `New!` card carries
    // its WEAPON's inherent rarity (which can be below the floor) and an UPGRADE carries
    // UPGRADE_RARITY, which is not a RARITIES key and so prints no chip.
    // BOTH ARE TELLS, and the second is the worse one. Stamping every weapon card UPGRADE_RARITY
    // was the first fix here and it made 23.5% of all blind cards a chipless beige border that
    // identified its kind with 100% reliability — 40.9% of screens carried at least one. The floor
    // was satisfied and blindness, which is the card's actual product, was not.
    // So a weapon card adopts the screen's ROLLED (floor-legal) tier while blind. It means nothing
    // — applyChoice's weapon branch never reads rarity, as the note above says — which is precisely
    // what makes it safe to use as camouflage. The WEIGHT is untouched, so inherent rarity still
    // decides WHICH weapon is offered; it just stops being broadcast.
    if (run.anomalies?.blindFaith) return { ...wc, rarity }
    return wc
  }

  if (bucket === 'defense' || bucket === 'utility') {
    const opts = bucket === 'defense' ? defenseOpts : utilityOpts
    const pid = opts[Math.floor(Math.random() * opts.length)]
    const card = makePassiveCard(run, pid, rarity)
    if (card) return card
    // null = a values-passive (armor/regen) rolled outside its own table. Re-roll the rarity on
    // RARITY_WEIGHTS RESTRICTED to the tiers that table declares — never a fixed ladder. Walking
    // [rarity, 'legendary', …] sent every epic AND mythic roll (8.8% of the table) to the TOP
    // tier, measured 12.2% legendary armor against a declared 3.5% and +15% mean armor per card;
    // walking down to 'normal' is the same unnamed change in the other direction. Renormalising
    // the passive's own keys is neutral by construction (normal 64.1 / rare 32.1 / legendary 3.9).
    // It renormalises rarityWeights, not RARITY_WEIGHTS: this IS the rarity roll for this card, so
    // it has to read the same table the roll it replaces did, or a reroll's promise quietly
    // evaporates for armor and regen — the two cards a player rerolling a bad screen is most often
    // hoping to improve, and at the cap the fall-through path takes 12.3% of them (8.8% at base).
    // Renormalise the passive's OWN declared keys — never a fixed ladder walk. `rarityWeights`, not
    // RARITY_WEIGHTS, so a reroll's promise reaches armor and regen too; and only keys that table
    // still carries, because `?? 1` would hand a tier BLIND FAITH's floor removed a live weight.
    // Under that floor a values-passive is guaranteed to have at least two surviving keys, because
    // eligiblePassiveIds drops the ones that do not (see the note there — it is what stops the
    // floor turning into a CEILING for the two passives that block damage).
    const w = {}
    for (const r of Object.keys(PASSIVES[pid].values)) if (rarityWeights[r]) w[r] = rarityWeights[r]
    return makePassiveCard(run, pid, pickWeighted(w))
  }

  if (bucket === 'mod') {
    // A switch mod declines every rarity above normal (makeWeaponModCard returns null), so it is
    // only a CANDIDATE on a normal roll — restricting the pick preserves that. Picking first and
    // coercing the rarity down instead let a switch win its pick at any tier: measured 1.72x the
    // shipped offer rate, against config.js's own "offered AT MOST ONCE, only at normal rarity".
    // CANDIDACY IS ROLLED ON THE UNDECAYED TABLE, SIZE ON THE DECAYED ONE (v6.7.11). They are the
    // same roll at zero rerolls (`rr === 0` reuses it, so nothing about an unrerolled screen moves
    // and no extra random is drawn) and they must NOT be the same roll at any other count: `normal`
    // is the only tier a rule-change card is offered at, so decaying it to buy bigger numbers was
    // measured DELETING rule-change cards — pond 6.04% -> 4.25% of mod cards, garden 9.11% ->
    // 6.61%, skies 6.65% -> 4.50%, undergrowth 2.78% -> 1.94% at REROLL_RARITY_CAP (20000 screens
    // per arm, 3 weapons at lv3), a 27-32% relative cut on the one card class this game's standing
    // complaint is that it has too few of. Rolling candidacy at base holds the switch rate flat
    // (garden 9.01% -> 9.43%, inside a 0.45pt six-seed spread; run PB4 asserts the invariance)
    // while every numeric mod keeps the full nudge.
    const candRarity = rr === 0 ? rarity : pickWeighted(rarityTableFor(run, RARITY_WEIGHTS))
    const ok = modOpts.filter((mc) => makeWeaponModCard(run, mc.weapon, mc.mod, candRarity))
    // Every candidate declined (an all-switch bucket): the bucket was counted non-empty, so it owes a card even if every candidate declined the
    // rolled tier. Under BLIND FAITH that fallback tier must be the FLOOR, not 'normal' — and a
    // `values` mod (trashTornado.sweepLoot declares {epic:1}) can decline BOTH, in which case
    // makeWeaponModCard returns null, rollCard returns null and buildLevelUpChoices BREAKS out of
    // the slot loop. Measured: 40% of such blind screens collapsed to a single card.
    const floorTier = run.anomalies?.blindFaith ? BLIND_FAITH_FLOOR : 'normal'
    const from = ok.length > 0 ? ok : modOpts
    // SPECIALIST's actual effect: the named weapon's candidates compete at SPECIALIST_FOCUS_MUL,
    // everything else at 1. Strictly a REDISTRIBUTION — the mod bucket's own share is untouched, so
    // the card cannot create deliverability, only aim it (which is exactly what the spec says it is
    // and is not). The un-focused path keeps the original uniform expression VERBATIM rather than
    // routing through pickWeighted with flat weights: both draw one random, but not the same
    // mapping from it, and every seeded fixture in the suite would shift for a card nobody took.
    const mc = focus
      ? from[Number(pickWeighted(Object.fromEntries(
        from.map((c, i) => [i, c.weapon === focus ? SPECIALIST_FOCUS_MUL : 1]))))]
      : from[Math.floor(Math.random() * from.length)]
    if (ok.length === 0) {
      // ...and if even the floor declines it, hunt the whole surviving table before giving up, so a
      // declining mod shortens nobody's screen.
      const built = makeWeaponModCard(run, mc.weapon, mc.mod, floorTier)
        ?? Object.keys(rarityWeights).map((r) => makeWeaponModCard(run, mc.weapon, mc.mod, r)).find(Boolean)
      if (built) return built
    }
    // A switch has no magnitude for a reroll to enlarge, so it is built at the only tier it accepts
    // — which is also the tier its candidacy roll came up at. Everything else takes the decayed one.
    const isSwitch = WEAPON_MODS[mc.weapon][mc.mod].kind === 'switch'
    return makeWeaponModCard(run, mc.weapon, mc.mod, isSwitch ? 'normal' : rarity)
  }

  const eid = elementOpts[Math.floor(Math.random() * elementOpts.length)]
  return makeElementCard(run, eid, rarity)
}

// The pool-exhaustion card's tier. It is not a rolled tier at all, but it PRINTS one — and hard
// -coding 'normal' put a grey chip literally reading "Normal" on a BLIND FAITH screen whose text
// says nothing below the floor is rolled. Measured: with every pool exhausted, 100% of blind
// screens were this card. The floor is the honest answer; it promises no more than the card gives.
function healRarity(run) {
  return run.anomalies?.blindFaith ? BLIND_FAITH_FLOOR : 'normal'
}

function buildLevelUpChoices(run) {
  const weaponPool = weaponCandidates(run)
  const passiveIds = eligiblePassiveIds(run)
  const modCandidates = eligibleWeaponModCandidates(run)
  const elementIds = eligibleElementIds(run)

  if (weaponPool.length === 0 && passiveIds.length === 0 && modCandidates.length === 0 && elementIds.length === 0) {
    return [{ kind: 'heal', title: 'Snack Break', desc: 'Heal 30 HP', tag: '', rarity: healRarity(run), icon: '🍡' }]
  }

  const pickedIds = new Set()
  const modWeaponCounts = new Map() // weaponId -> mod cards already placed this pool (per-weapon cap)
  const cards = []
  // Roll exactly run.choiceSlots cards (2..4, permanently unlocked in the meta shop — see
  // choiceSlots in state.js and sacrificeCost in config.js).
  const slots = effectiveSlots(run)
  for (let i = 0; i < slots; i++) {
    const card = rollCard(run, weaponPool, passiveIds, modCandidates, elementIds, pickedIds, modWeaponCounts)
    if (!card) break
    cards.push(card)
    pickedIds.add(card.id)
    if (card.kind === 'mod') modWeaponCounts.set(card.weapon, (modWeaponCounts.get(card.weapon) ?? 0) + 1)
  }

  if (cards.length === 0) {
    return [{ kind: 'heal', title: 'Snack Break', desc: 'Heal 30 HP', tag: '', rarity: healRarity(run), icon: '🍡' }]
  }

  // The anomaly tier: ONE roll per SCREEN, replacing a rolled card rather than extending the
  // screen. Three properties fall out of doing it here rather than inside rollCard:
  //   - the rate does not scale with choiceSlots. Per-slot rolling delivered 1-(1-p)^slots:
  //     measured, same rig and seeds, 2.40 anomalies/run at 2 slots against 3.60 at 4 — 1.5x as
  //     much of the tier whose whole design licence is scarcity, for a player who had spent 60 of
  //     the 80 meta-shop levels buying slots. That is a lottery on shop spending, not on play, and
  //     ANOMALY_BASE_WEIGHT now reads as the FLOOR of the per-screen rate — the rate on a screen
  //     with no dry ones behind it. NOT the share of screens carrying one: pity is where the run
  //     actually spends its screens, and config.js's rate block carries the measured share.
  //   - B5's "never a screen's ONLY offer" holds BY CONSTRUCTION (`cards.length > 1`, and a
  //     replacement cannot grow the anomaly count past one), instead of by a fallback that had to
  //     choose between deleting the tier's roll and shipping a curse-only screen.
  //   - the slot is uniform, so no shuffle is needed and no other pool's RNG stream moves.
  // An ineligible run costs zero Math.random calls (eligibleAnomalyIds is checked first), which is
  // why every seeded scenario that cannot see the tier is bit-identical.
  // ONE ROLL PER DEAL (v7.20), at a halved weight when the deal was paid for. Was ONE PER SCREEN
  // (v6.7.9). main.js's onReroll calls this function
  // again on the same screen, so a roll made here was a fresh, independent draw at the current
  // pitied weight every time the player paid: measured, a player who rerolls until the tier shows
  // took anomaly-on-screen from 20.1% to 75.5% over 5 rerolls at a saturated counter, and from
  // 6.8% to 33.9% at base pity — 133 coins against ~370 earned in a body/2 run. Coins buying the
  // tier whose entire design licence is scarcity, which spec B6 says must not happen (it guarded
  // the WEIGHT; the mechanism was repeated draws). What is left of
  // that memo is ANOMALY_REROLL_MUL — the halved weight on a paid deal, which is the whole of what
  // stops coins farming the tier. The CARD is no longer frozen: a reroll can find a Rupture and can
  // lose one, because the owner's rule (v7.20) is that it is an ordinary card.
  // SAMPLER HAZARD, the same one _screenRerolls carries: a test loop that reuses one run and calls
  // this directly is re-dealing ONE screen, so it must reset _screenRerolls per iteration or every
  // sample after the first is measured at the halved reroll weight.
  let placedAnomaly = false
  if (cards.length > 1) {
    const anomaly = rollAnomalyCard(run)
    if (anomaly) {
      cards[Math.floor(Math.random() * cards.length)] = anomaly
      placedAnomaly = true
    }
  }

  // Hard new-weapon apparition floor (see NEW_WEAPON_MIN_RATE in config.js): if the pool has
  // room for a new weapon but none made it into the cards, occasionally force one in so the
  // focus nudge can never fade discovery out entirely.
  const ownedIds = new Set(run.weapons.map((w) => w.id))
  const unowned = CHAPTERS[run.chapter].weapons.filter((id) => !ownedIds.has(id))
  const hasNewCard = cards.some((c) => c.kind === 'weapon' && c.tag === 'New!')
  // F4: the swap overwrites cards[length - 1] UNCONDITIONALLY, so without `!placedAnomaly` it
  // would delete the anomaly the roll had just placed — and (once pity lands) delete it AFTER the
  // pity counter was already reset by the roll, i.e. spend the tier and hand back nothing.
  // The floor is a discovery guarantee for a screen that has no new weapon on it; a screen with an
  // anomaly on it is not a screen that needs rescuing.
  if (!hasNewCard && !placedAnomaly && unowned.length > 0 && run.weapons.length < MAX_WEAPONS && Math.random() < NEW_WEAPON_MIN_RATE) {
    const id = unowned[Math.floor(Math.random() * unowned.length)]
    const cfg = WEAPONS[id]
    // Swap into the LAST slot — every rolled card is visible now (no purchasable extras), so
    // the guarantee just needs a slot that always exists.
    const slot = cards.length - 1
    // v7.5: this path builds a card BYPASSING rollCard, so BLIND FAITH's chip rule has to be
    // applied here too — otherwise the discovery guarantee is the one hole through which a
    // below-floor border reaches a face-down screen. Same reasoning as the weapon branch of
    // rollCard: the tier is WHICH weapon, not how big, and under a blind deal the border is the
    // only information there is.
    const rarity = run.anomalies?.blindFaith ? UPGRADE_RARITY : cfg.rarity
    cards[slot] = { kind: 'weapon', id, title: cfg.name, desc: cfg.desc, tag: 'New!', rarity, icon: cfg.icon }
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
  // (v7.20: the per-screen anomaly memo that used to be cleared here is gone — the tier is rolled
  // fresh on every deal, at ANOMALY_REROLL_MUL of its weight on the paid ones. The pity counter
  // below is now the only per-screen anomaly state.)
  // Same reason, for the rarity decay: this screen has been paid for exactly once, so it is dealt
  // at the undecayed table and only the replacements the player buys step up (rerollLevelUpChoices
  // does the stepping — see _screenRerolls in state.js for why the BUILDER must not).
  run._screenRerolls = 0
  // Anomaly pity advances HERE, once per screen, and not inside buildLevelUpChoices — the reroll
  // purchase (rerollLevelUpChoices) re-deals a screen by calling the builder again, so a counter
  // kept there would step on every re-deal and let coins buy the rarest tier (F5).
  // The unit is the SCREEN, not the card: the tier is rolled once per screen, so a
  // per-card step would give a 4-slot player twice the accrual of a 2-slot one — the meta-shop
  // lottery v6.7.7 closed on the base rate, walked back in through pity.
  // ONLY WHERE IT CAN BE SPENT (v6.7.9): a screen the tier is INELIGIBLE for banks nothing. It
  // used to accrue through those too, and since ANOMALY_MIN_LEVEL gates almost every card, the
  // ineligible stretch is the same fixed stretch in every run — so the credit was earned on a
  // schedule and spent the instant the gate opened. Measured (400 immortal body runs, decline
  // everything, first OFFER after the tier first becomes eligible), share landing within three
  // screens of the gate: 37.0% -> 23.5% with every card at the table floor of 8, and 28.8% ->
  // 22.3% on the shipped table whose one card floors at 3. A timing tell, not agency: the gate it
  // clustered behind is a level floor, not something the player did. It also kept the base weight
  // off the table — a mortal body/2 run opens ~15.7 screens of which only ~8.1 are tier-eligible,
  // so a run used to reach eligibility with about half a run of credit already banked, and the
  // rate ANOMALY_BASE_WEIGHT documents was never the rate any screen rolled at.
  if (eligibleAnomalyIds(run).length > 0) run._screensSinceAnomaly = (run._screensSinceAnomaly ?? 0) + 1
  run.levelUpChoices = buildLevelUpChoices(run)
  run.phase = 'levelup'
  run.events.push({ type: 'levelup' })
}

// Exported for the two out-of-band readers: test/sim-test.js (rarity distribution sanity checks)
// and scripts/pool-probe.mjs (the balance harness). main.js does not use it directly — it drives
// stepSim/applyChoice and rerollLevelUpChoices below.
export { buildLevelUpChoices }

// THE WHOLE REROLL PURCHASE, in sim.js rather than in main.js's onReroll (v6.7.11). It lives here
// because it is state, not glue: it prices the reroll, spends the RUN's coins, steps both counters
// and re-deals the screen. main.js keeps only what is genuinely glue — the phase guard it shares
// with every other UI hook, the sfx, and re-showing the screen.
// The move is what makes the feature TESTABLE. While the counter bump lived in main.js it was the
// one production write to run._screenRerolls, and test/sim-test.js never imports main.js — so
// deleting that line left the entire suite green (PB4 included, since PB4 supplied the increment
// itself) while every reroll in the shipped game silently rolled at the undecayed table. Run PB4
// drives THIS function now, so the feature dies red.
// It counts PURCHASES, not builds: buildLevelUpChoices stays reroll-agnostic because ~15 sampling
// loops in test/sim-test.js and the survival rig in scripts/pool-probe.mjs reuse one run across
// thousands of builds, and a build-counting field would saturate at REROLL_RARITY_CAP after three
// iterations and then report the 3-reroll distribution as the base rate (it turns run PB1 red —
// city/2 rare 33.4%). See _screenRerolls in state.js.
// Returns false and changes NOTHING when the run cannot afford it, so the caller's only job is to
// decide whether it is allowed to ask.
/**
 * What the next reroll of THIS screen costs, and in what currency. Exported so the button can
 * print the truth: BLOOD MONEY changes the wallet, and a footer still reading `🔄 Reroll (23🪙)`
 * while the transaction below silently takes 10 HP is the worst kind of hidden rule — the player
 * cannot make the trade the card is selling if the trade is not on screen.
 * Lives here, next to the transaction it describes, for the reason v6.7.11 moved the purchase out
 * of main.js: a price computed in the UI layer can drift from the one that is charged, and nothing
 * would go red.
 */
export function rerollPrice(run) {
  // BLIND FAITH (v7.5) is the card's whole price: you cannot reroll a screen you cannot read. It is
  // checked BEFORE BLOOD MONEY so the pair cannot produce a purchasable HP price for a purchase
  // that does not exist. `available: false` is what ui.js prints — the button says why rather than
  // silently refusing, because a dead control with no explanation reads as a bug.
  if (run.anomalies?.blindFaith && BLIND_FAITH_NO_REROLL) return { cost: 0, currency: 'coins', available: false }
  if (run.anomalies?.bloodMoney) {
    // Escalates on the RUN counter, exactly like rerollCost does for coins — see
    // BLOOD_MONEY_ESCALATION for the measurement that says a flat price deletes the ladder rather
    // than discounting it. Rounded so the button prints a whole number of HP.
    const n = run._rerolls ?? 0
    return { cost: Math.round(BLOOD_MONEY_HP * Math.pow(BLOOD_MONEY_ESCALATION, n)), currency: 'hp', available: true }
  }
  return { cost: rerollCost(run._rerolls ?? 0), currency: 'coins', available: true }
}

// A reroll that throws away a screen showing a Rupture hands back ANOMALY_REROLL_PITY_REFUND of the
// dry-streak credit the offer had just spent (v7.30). Called before the re-deal, on the OUTGOING
// screen — after it, run.levelUpChoices is the new one and the question cannot be asked any more.
// Taking a card instead still costs the credit in full: declining has to cost something, or the
// tier re-offers every few level-ups until accepted (the nag rollAnomalyCard's own note rules out).
function refundPityOnReroll(run) {
  if (!run.levelUpChoices?.some((c) => c.kind === 'anomaly')) return
  const before = run._pityBeforeAnomaly ?? 0
  run._screensSinceAnomaly = Math.floor(before * ANOMALY_REROLL_PITY_REFUND)
  run._pityBeforeAnomaly = run._screensSinceAnomaly
}

export function rerollLevelUpChoices(run) {
  // BLOOD MONEY (v7.2) replaces the currency. Both counters still step, so the per-screen rarity
  // decay is unchanged — but the PRICE LADDER is not: rerollCost escalates 10/15/23/34/... over the
  // run, and the HP price is FLAT at every reroll. That is the card's whole shape (the budget is
  // your health bar, not an escalating toll), and it is why the two branches cannot share a line.
  // FLAT, and the owner overruled a maxHP proposal to keep it so. The objection that flat HP does
  // not bind ("~23 rerolls") priced it against regen AVERAGED across runs (0.41/s), and regen is
  // bimodal — most runs never pick it, so the real budget is maxHP alone, about 11 rerolls. The
  // card's actual cost is that it RE-PRICES THE PASSIVE POOL: it makes regen the enabler of an
  // offensive strategy, which is opportunity cost paid in level-up picks, the currency this whole
  // redesign is about.
  // FLOORED, not fatal: below the cost the button simply refuses. Dying on a modal screen to a
  // button press is not a trade the player agreed to. A max-regen build (2.5 HP/s = 750 HP/run)
  // rerolling nearly every screen is the known ceiling — a legitimate build bought with 5 passive
  // picks, and it should be a consequence someone can predict, not a discovery.
  // BLIND FAITH (v7.5): the reroll is the card's price, so it is refused HERE and not only greyed
  // out in ui.js. A UI-only gate is a rule the console can walk around, and this one is the whole
  // cost of the strongest card on the slate.
  if (!rerollPrice(run).available) return false
  if (run.anomalies?.bloodMoney) {
    const p = run.player
    const cost = rerollPrice(run).cost
    if (p.hp <= cost) return false
    // THROUGH hurtPlayer, not a bare `p.hp -=`. A raw subtraction made config.js's own MARTYR note
    // ("BLOOD MONEY turns a reroll into a bomb") a claim the code could not honour — measured with
    // both cards taken, the reroll dealt 0 damage and emitted no `hurt` event at all, so MARTYR saw
    // nothing and BERSERK's window never opened. Routing it here makes both documented combos real
    // and costs nothing: the guard above means it can never be the hit that kills you.
    // `dot` because the price is not an attack — it must skip armor and the invuln window, exactly
    // like OVERLOAD's drain. `src` keeps it out of the renderer's damped self-inflicted branch: a
    // reroll is one discrete deliberate purchase and SHOULD land with the full weight of a hit.
    hurtPlayer(run, cost, true, 'bloodMoney')
    run._rerolls = (run._rerolls ?? 0) + 1
    run._screenRerolls = (run._screenRerolls ?? 0) + 1
    refundPityOnReroll(run)
    run.levelUpChoices = buildLevelUpChoices(run)
    return true
  }
  const cost = rerollCost(run._rerolls ?? 0)
  // Rerolls spend the RUN's coins (the HUD counter), not the meta bank — spending mid-run shrinks
  // the end-of-run payout, and the number next to the button matches what the HUD shows (v5.1 fix;
  // players read the two same-icon wallets as one).
  if ((run.coinsEarned ?? 0) < cost) return false
  run.coinsEarned -= cost
  // The RUN counter prices the NEXT reroll (rerollCost escalates over the whole run)...
  run._rerolls = (run._rerolls ?? 0) + 1
  // ...and the SCREEN counter is the same purchase scoped to the open screen: rollCard decays the
  // `normal` rarity weight by REROLL_RARITY_DECAY ^ it, and stepLevelUp zeroes it on the next one.
  run._screenRerolls = (run._screenRerolls ?? 0) + 1
  refundPityOnReroll(run)
  run.levelUpChoices = buildLevelUpChoices(run)
  return true
}
