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
  MOD_CANDIDATES_PER_WEAPON, maxModsPerWeaponPerPool, DUO_PITY_SCREENS, WEAPON_RATE_MODS, WEAPON_COUNT_MODS, WEAPON_COUNT_KEYS, STAT_ROW_KEYS,
  ELEMENTS, MAX_ELEMENT_PICKS,
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
  ELITE_SURGE_EVERY_MUL, SUBMISSION_DURATION, SUBMISSION_DMG_FRAC, SUBMISSION_HIT_EVERY,
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
  spawnRate, spawnTiltMul, hpScale, lateRateFor, dmgScale, maxAliveFor, eliteEveryAt, lateEliteFor, SPAWN_RING, speedCreepMul,
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
  STATUS_TICK, IGNITE_DOT_FRAC, IGNITE_DURATION, NECROTIC_BLEED_FRAC,
  SHOCK_RANGE, SHOCK_CD,
  // The element system — see the EL_* block in config.js.
  EL_WINDOW, EL_BUCKETS, EL_FIRE_SHARE, EL_COLD_MUL, EL_FREEZE_T, EL_FREEZE_RESIST,
  EL_FREEZE_RESIST_T, EL_VENOM_MUL, EL_LIGHT_SHARE, EL_LIGHT_RANGE, EL_LIGHT_FORWARD,
  EL_VALUES, EL_BURN_TICK, EL_BURN_MIN, elScale, elementCardDesc, elText,
  ELITE_AFFIXES, AFFIX_SECOND_AT, ANCHORED_CHANCE, SHIELD_HP_FRAC, SHIELD_DMG_MUL, SPLITTER_COUNT,
  VOLATILE_FUSE, VOLATILE_RADIUS, VOLATILE_DMG, CORE_BLAST_ENEMY_MUL, PACER_RADIUS, PACER_SPEED_MUL,
  FRENZY_HP_FRAC, FRENZY_SPEED_MUL, GILDED_HP_MUL, GILDED_COIN_MUL,
  newWeaponChance, NEW_WEAPON_MIN_RATE,
  REVIVE_HP_FRAC, REVIVE_INVULN, REVIVE_SHOVE_RADIUS, REVIVE_SHOVE_KB, HURT_CAP_FRAC,
  ARCHETYPE_TYPE, TYPE_ARCHETYPE, LATCH_SLOW_T, LATCH_SLOW_MUL, TANK_KB_REFRACTORY,
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
  FEAR_SPEED_MUL, FEAR_REFRACTORY, SILT_DAZE_REFRACTORY, SILT_VEIL_ARC, UNSHAKEABLE_CC_MUL, CC_DR_STEP, CC_DR_RECOVER, CC_DR_FLOOR,
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
  DOWNWASH_PLUNGE_N, DOWNWASH_PLUNGE_FRAC, DOWNWASH_PLUNGE_ARM, DOWNWASH_CAST_FRAC, drawdownSecsFor,
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
  PHASE_SOLID_T,
  GULL_RATE,
  GULL_FUSE,
  GULL_RADIUS,
  GULL_DMG,
  GULL_PLAYER_SHARE,
  CRAB_GUARD_T,
  CRAB_OPEN_T,
  CRAB_GUARD_ARC, PHASE_GHOST_T, PHASE_GHOST_SPEED_MUL,
  LANE_SCROLL_SPEED, laneScrollFor, LANE_STRAFE_MUL, LANE_LEAK_BEHIND_PX, LANE_LEAK_DMG, LANE_CAMERA_FRAC, laneHalfWidth, laneAxes,
  caveAt, CAVE_BOUNCE_PX, CAVE_HIT_DPS, CAVE_HIT_TICK,
  LANE_CRUSH_DPS, LANE_CRUSH_TICK,
  MARCH_SPEED_MUL, MARCH_SWAY_PX, MARCH_SWAY_RATE, MARCH_HOME_MUL,
  FORMATION_INTERVAL, FORMATION_COLS, FORMATION_AHEAD_MUL, FORMATION_AHEAD_MIN, FORMATION_ROW_PX, LANE_SPAWN_MUL, LANE_CONTACT_MUL, laneEarlyMul,
  REPULSE_CD, REPULSE_RADIUS, REPULSE_FORCE, REPULSE_STUN, PULSE_CHARGE_COST, PULSE_RADIUS_AT_FULL, PULSE_FORCE_AT_FULL, CLEAR_DUR_MIN, CLEAR_DUR_AT_FULL, CLEAR_SIGHT_FADE, CLEAR_RADIUS_AT_FULL, CLEAR_STUN, darkness, refillSpec, resourceDamageMul, pollutionFrac, RUNOFF_MAX_DMG_MUL, RUNOFF_SPEED_FLOOR, FOUL_SPRING_FOUL_T, SILT_PLUME_SPREAD, SILT_FLUSH_MUL, LOBE_SHAPES, inLobe, lobeFactor, SEPARATION_SAMPLES,
  SUNSPEAR_FALL, SUNSPEAR_SPREAD, FOXFIRE_GLOOM, SUNLANCE_REACH_MIN, BUBBLE_COVER_MAX, BUBBLE_ARC_MAX, BALLAST_FLIGHT, BALLAST_BLIND_THROW, BALLAST_REACH_PAD,
  BALLAST_TANK_MUL, BALLAST_DRAG, BALLAST_DRAG_T,
  BURST_SPEED_MUL, BURST_DUR_MIN, BURST_DUR_AT_FULL, DROWN_TICK,
  SPUR_DPS, SPUR_TICK, SPUR_SLOW_MUL,
  FIRE_CORAL_LEAD, SNAP_BACKBLAST_FRAC, SNAP_BACKBLAST_FULL_FRAC, SNAP_BACKBLAST_LEN, INK_BLIND_REACH, INK_JET_SPREAD, TANK_SHOVE_KB,
  LAST_BREATH_MAX_DMG_MUL, LAST_BREATH_DROWN_TAKEN_MUL,
  resourceRateMul, STARVE_TICK, LUNGE_SPEED, LUNGE_DUR_AT_FULL, LUNGE_BITE_MUL, LUNGE_ARM_DIST, LUNGE_DMG, LUNGE_KILL_REFILL,
  GNASH_MAW_MUL, GNASH_BASE_CRIT, GNASH_FINISH_FRAC, GNASH_CARRY_FRAC, RUSH_DUR, RUSH_MAX_STACKS,
  CHUM_PULL_MUL, CHUM_PANIC_R, CHUM_FEED_R, CHUM_FEED_HOLD,
  BILGE_AVOID_PAD, BILGE_AVOID_BLEND, BILGE_TRAIL_STEP_FRAC, BILGE_TRAIL_R_MUL, BILGE_TRAIL_GROW,
  PREY_PANIC_BLIND_R, OIL_STAIN_RATE, OIL_STAIN_MAX,
  RING_N, RING_R_MUL, RING_POOL_MUL,
  PREY_SIGHT_R, PREY_FLEE_MUL, PREY_DRIFT_MUL, PREY_TURN_RATE, PREY_SHOAL_SIZE, PREY_FLEE_BLEND,
  PREY_COHESION_BLEND, PREY_COHESION_MIN_N, PREY_PREDATOR_FEAR_R, PREY_PREDATOR_BLEND,
  BALL_R, BALL_TIGHT_N, FEED_R, FEED_FULL_N, FEED_DRAIN_MIN,
  INK_TRIGGER_R, INK_COOLDOWN, INK_R, INK_DUR, INK_SLOW_MUL,
  PUFFER_TRIGGER_R, PUFFER_PUFF_T, PUFFER_COOL_T, PUFFER_DRIFT_MUL,
  TIGHT_COHESION_BLEND,
  ORCA_INTERVAL, ORCA_RISE_DUR, ORCA_CIRCLE_DUR, ORCA_LEAVE_DUR,
  ORCA_RING_R, ORCA_RING_MIN_R, ORCA_RING_BAND, ORCA_PUSH, ORCA_ORBIT_RATE,
  ORCA_COMMIT_SPEED, ORCA_OVERSHOOT, ORCA_HIT_R, ORCA_DMG_FRAC,
  ORCA_SHADOW_PASSES, ORCA_SHADOW_FIRST, ORCA_SHADOW_GAP, ORCA_SHADOW_LAST_GAP,
  ORCA_SHADOW_DUR, ORCA_SHADOW_MARGIN, ORCA_SHADOW_FADE, ORCA_SHADOW_FEAR_R, ORCA_SHADOW_FEAR_T,
  ORCA_DENSITY_RUSH, ORCA_BAIT_PULL, ORCA_BAIT_FULL_FOOD, ORCA_RUSH_MAX, ORCA_BITE_R,
  ORCA_COMMITS, ORCA_WAKE_R, ORCA_WAKE_FORCE, ORCA_WAKE_PLAYER,
  ORCA_SPIRAL_ACCEL, ORCA_SPIRAL_EASE, ORCA_TRAIL_MAX,
  SLICK_TICK, SLICK_DPS, SLICK_SLOW_MUL, SLICK_SLOW_T, resistFrac, passiveEffectText,
  SHOREBREAK_DUR_MIN, SHOREBREAK_DUR_AT_FULL, SHOREBREAK_RADIUS, SHOREBREAK_FORCE, SHOREBREAK_STAGGER,
  TRAWL_SPEED, TRAWL_INTERVAL, TRAWL_FIRST_PASS, TRAWL_HALF, TRAWL_LEAD_MUL, TRAWL_TICK, TRAWL_DMG, TRAWL_ENEMY_DMG, TRAWL_WAKE_DEPTH,
  BREACH_R_MIN, BREACH_R_AT_FULL, BREACH_REACH, BREACH_MAX_HOLES, tiredness,
  ROCK_INTERVAL, ROCK_MAX_LIVE, ROCK_MIN_R, ROCK_MAX_R, ROCK_SPEED, ROCK_DRIFT_X, ROCK_SPIN, ROCK_SPREAD_MUL, ROCK_DMG, ROCK_TICK, ROCK_TICK_DMG,
  PULL_BEAM_INTERVAL, PULL_BEAM_T, PULL_BEAM_RANGE, PULL_BEAM_FORCE, PULL_BEAM_DPS,
  SHARD_R, SHARD_RIFT_FUSE, SHARD_RIFT_W, SHARD_RIFT_FRAC,
  SHARD_RECURSE_DMG_FRAC, SHARD_RECURSE_LIFE_FRAC,
  PULSAR_ARMS, PULSAR_COLLAPSE_MUL, PULSAR_COLLAPSE_PULL,
  PRISM_DMG_MUL, PRISM_LEN_MUL, PRISM_SPREAD, PRISM_FLASH_T, prismLadder,
  PULSAR_FAN_ARC, PULSAR_FAN_SWEEP, PULSAR_FAN_RATE,
  // The Surf's three natives (see stepBreakerWeapon / stepShellWeapon / stepBarnacleWeapon)
  BREAKER_BACKWASH_DMG_FRAC,
  SHELL_RETARGET_R, SHELL_SPLASH_LIFE, SHELL_R,
  BARNACLE_JUMP_R, BARNACLE_FAN, BARNACLE_LARVA_R,
  LONGLINE_HALF_W, LONGLINE_SNAG, LONGLINE_TWIN_GAP, LONGLINE_MAX_LIVE,
  MAW_GAPE_T, MAW_CLOSE_MUL, MAW_DEVOUR_FRAC, MAW_SHUT_T,
  SCENT_R, SCENT_DUR_MIN, SCENT_DUR_AT_FULL, SCENT_DMG_MUL, SCENT_SPEED_MUL,
  FINHIT_SPEED_CAP, FINHIT_TURN_MIN, FINHIT_SWEEP_BIAS,
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
  // Enemies born during the PREVIOUS step join the world here, at a point where nothing is
  // mid-iteration over run.enemies. Flushed at the TOP rather than at the bottom on purpose: this
  // function has eleven `if (stepX(...)) return` early exits, and a bottom flush would be skipped
  // by every one of them. See spawnSplitChildren for what queues them and why.
  flushSpawns(run)
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
  stepTrail(run, dt)      // must precede stepBossScript: a scripted chapter returns out of stepSim below
  if (stepBossScript(run, dt)) return // v5.24 blank: the scripted chapter's ONLY spawner (phase may be 'dead' — P2 yank)
  stepFormations(run, dt) // v5.18 beyond lane: ranks of marchers, alongside the seeking swarm above
  // v7.x The Wreck: shoal centroids, prey-around-the-player and the predator list, in one O(n) walk.
  // MUST precede stepEnemyMovement — stepPrey runs inside it and reads all three. No-op in any
  // chapter with no skittish roster (the loop finds nothing to bucket).
  stepShoals(run)
  stepEnemyMovement(run, dt)
  stepSubmission(run, dt) // SUBMISSION: the loan's clock, and the ally's contact attack
  stepFlashlightCones(run, dt) // v5.4 undergrowth: elite cones that enrage the swarm (damages nothing)
  stepCurrents(run, dt)   // v5.0 signature mechanic: drift field (no-op unless the chapter has one)
  stepTide(run, dt)       // Book 2 surf signature: alternating surge/backwash (no-op elsewhere)
  stepBombardment(run, dt) // v5.4 skies signature: rain telegraphed bombs on the player's area
  stepGullStrike(run, dt) // Book 2 surf: gulls plunge on whatever is alive (no-op elsewhere)
  streamEddies(run)       // v6.4 pond identity: materialize/drop eddy cells (no-op outside pond)
  streamShafts(run)       // v7.x Book 2: materialize/drop refill cells (no-op in a chapter with no refill field)
  streamSlicks(run)       // v7.x The Wreck: materialize/drop pollution-spill cells (no-op elsewhere)
  streamSpurs(run)        // v7.x The Reef: materialize the spur field along the lane (no-op elsewhere)
  stepShafts(run, dt)     // ...and DRIFT them; the streamer above only decides existence (see its doc)
  streamSandbars(run)     // Book 2 surf: materialize/drop dry patches (no-op elsewhere)
  stepCharge(run, dt)     // v7.x Book 2: the resource bar (no-op unless the chapter declares one)
  // v7.x The Deep. AFTER stepCharge and BEFORE the weapons, because the mark it refreshes is read
  // by every damage site this frame — marking after the weapons had fired would give the player a
  // window one frame short and, on a 1.3s minimum duration, that is a visible fraction of the card.
  stepScent(run, dt)
  // v7.x The Surf. BEFORE stepEnemySeparation and stepEnemyMovement, because both of the things it
  // writes are read downstream this same frame: e.kb is integrated in stepEnemyMovement, and e.stunT
  // is checked there above every behavior flag. Pushing after movement would land the whole wave one
  // frame late, which on the 0.9s floor is a measurable slice of the move.
  stepShorebreak(run, dt)
  streamTraps(run)        // v6.5 undergrowth identity: materialize/drop snap traps (no-op outside predators)
  streamObstacles(run)    // v5.6.13: materialize/drop obstacle cells as the player roams
  stepEnemySeparation(run) // v6.5.1: push overlapping enemies apart (owner directive: no 100% stacks)
  stepObstacles(run)      // v5.0: push player/enemies out of this chapter's obstacle field (if any) — terrain snaps last and wins

  stepBite(run)           // v7.x The Wreck: the Lunge's bite, after the dash has moved the player
  stepCrush(run)          // v5.8 skies kaiju: destroy any structure overlapping the crush radius
  stepRampage(run, dt)    // v5.8 skies kaiju: rampage meter decay/trigger/drain (crush-gated, no-op elsewhere)
  stepTrails(run, dt)     // v5.3 garden: expire dropped pheromone nodes (no-op unless any exist)
  stepWebs(run, dt)       // v5.3 garden: expire spider web slow-zones (no-op unless any exist)

  if (stepRocks(run, dt)) return // v5.21 lane: drifting asteroids (phase may be 'dead')
  // BEFORE stepLeaks, which measures "behind" against the player this may still be moving, and
  // before the sweep reads the same viewport expression.
  if (stepCaveWall(run, dt)) return // v7.x reef: touched the cave wall (phase may be 'dead')
  if (stepLaneFront(run, dt)) return // v7.x reef: pinned against the back edge (phase may be 'dead')
  if (stepLeaks(run)) return // v5.18 beyond lane: invaders that got past you (phase may be 'dead')
  if (stepContactDamage(run)) return // phase is now 'dead'
  if (stepBombs(run, dt)) return // phase is now 'dead' (volatile-elite death bomb blast)
  if (stepPools(run, dt)) return // phase is now 'dead' (acid/soap pool DoT — v5.0)
  if (stepSpurs(run, dt)) return // phase is now 'dead' (The Reef: scraping through coral, v7.x)
  if (stepDrown(run, dt)) return // phase is now 'dead' (The Reef: an empty Air bar, v7.x)
  if (stepStarve(run, dt)) return // phase is now 'dead' (The Wreck: an empty Bloodlust bar, v7.x)
  if (stepSlick(run, dt)) return // phase is now 'dead' (The Wreck: standing in the leak, v7.x)
  if (stepTrawl(run, dt)) return // phase is now 'dead' (The Trawl: the net wall, v7.x)
  if (stepOrca(run, dt)) return // phase is now 'dead' (The Wreck: the orca's strike, v7.x)
  if (stepMaws(run, dt)) return // phase is now 'dead' (The Deep: an anglerfish swallowed you, v7.x)
  if (stepStrips(run, dt)) return // phase is now 'dead' (The Blank's erasure-strip DoT — v5.3)
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
  // RUNOFF: The Shelf's bar as a ramp. pollutionFrac, not darkness() — the card says "your
  // Pollution", and that is the rail end to end, which is also what the Scour and Foul Water mods
  // read. run.chargeMax, never res.max, for the Deep Lungs reason barRamp's own block gives.
  //   THE chargeMax > 0 GUARD IS LOAD-BEARING. A chapter declaring no resource leaves both fields
  // at 0 (createRun), and pollutionFrac(0, 0) is 1, not 0 — so without it the card reads as FULLY
  // polluted and pays a flat cap anywhere. Unreachable from the real pool, which is chapter-scoped,
  // but devCards ignores every eligibility rule on purpose and ships in the production bundle.
  if (a.runoff && run.chargeMax > 0) mul *= 1 + (RUNOFF_MAX_DMG_MUL - 1) * pollutionFrac(run.charge, run.chargeMax)
  // LAST BREATH: The Reef's bar as a ramp, running the OTHER way from Runoff's — this one pays for
  // an EMPTY bar, which is the state CHAPTERS.reef.resource measures a centre-line player spending
  // 76% of a run in. `1 - charge/max` and not pollutionFrac: that helper is The Shelf's murk
  // derivation and belongs to that chapter's copy, and a shared name would tie two cards' meanings
  // together for no gain.
  //   THE chargeMax > 0 GUARD IS LOAD-BEARING, verbatim Runoff's reason: a chapter with no resource
  // leaves charge and chargeMax at 0, so without it an empty bar would read as fully empty and pay
  // the cap anywhere. Unreachable from the real pool, which is chapter-scoped, but devCards ignores
  // every eligibility rule on purpose and ships in the production bundle.
  if (a.lastBreath && run.chargeMax > 0) {
    mul *= 1 + (LAST_BREATH_MAX_DMG_MUL - 1) * (1 - Math.min(1, Math.max(0, run.charge) / run.chargeMax))
  }
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
  // run.chargeMax (v7.x Book 2 Task 9 fix round), not _dres.max — Deep Lungs raises the run's OWN
  // ceiling, and darkness() defaults to the config max only when it isn't told a better one.
  // RUNOFF DEEPENS THIS FLOOR rather than joining the MIN below as a sixth term: a second slow
  // would stack with latch and web and could stop the player outright, where a deeper floor cannot.
  const darkFloor = run.anomalies?.runoff ? RUNOFF_SPEED_FLOOR : _dres?.dark?.speedFloor
  const darkMul = _dres?.dark ? 1 - (1 - darkFloor) * darkness(run.charge, _dres, run.chargeMax) : 1
  // THE SANDBARS (Book 2 / The Surf): dry ground is a floor on speed, same MIN composition as the
  // dark above and for the same reason — multiplying would silently stack with latch/web/the dark.
  const _sig = CHAPTERS[run.chapter].signature
  const sandMul = _sig && _sig.type === 'tide' && onSandbar(run) ? _sig.bars.slowMul : 1
  // TIRED (Book 2 / The Trawl): the bottom of the Feed bar takes your speed, on tiredness() — the
  // same ramp the dark above runs on, deliberately sharing barRamp() so the two curves cannot drift.
  // Same MIN composition as its two neighbours, and for the same reason: multiplying would make
  // every latch, web and sandbar in this chapter strictly nastier than the same one elsewhere.
  // The consequence is the chapter — at the floor you still move faster than the net, so running dry
  // is a squeeze rather than a death sentence (spec §8.2), but the margin all but disappears.
  const tireMul = _dres?.tire ? 1 - (1 - _dres.tire.speedFloor) * tiredness(run.charge, _dres) : 1
  // FOULED (v7.x / The Wreck): oil sticks to you. Set by stepSlick while you are in a spill and for
  // SLICK_SLOW_T after you leave — the lingering half is the point, because a slow that ends at the
  // rim is just a wider slick. Same MIN composition as its four neighbours above and for the same
  // reason they give: multiplying would make every latch and web in this chapter strictly nastier
  // than the identical one anywhere else.
  const foulMul = (run._foulT ?? 0) > 0 ? SLICK_SLOW_MUL : 1
  // INKED (v7.x / The Wreck's squid): the one slow in the game that a CREATURE put there, and the
  // only one you walk into by choosing to chase. Scanned off run.blooms rather than a new array —
  // the ink is a bloom tagged look:'inkjet' (see the INK_* block) — and shaped exactly like the web
  // scan above, which is the same question about a different patch on the floor.
  //   Same MIN composition as its five neighbours and for the reason they all give: multiplying
  // would make every latch, web and spill in this chapter strictly nastier than the identical one
  // anywhere else. It is also why ink and oil together cost the oil's 0.62 and never the product.
  let inkMul = 1
  for (const bl of run.blooms) {
    if (bl.look !== 'inkjet' || bl.r <= 0) continue
    const idx = p.x - bl.x, idy = p.y - bl.y
    if (idx * idx + idy * idy <= bl.r * bl.r) { inkMul = INK_SLOW_MUL; break }
  }
  // SCRAPING (v7.x, The Reef): coral takes your STEERING and never the scroll. In the lane branch
  // below `speed` reaches the cross axis only — the forward component is laneScrollFor — so slowing
  // it here is the whole of that promise. Published by stepSpurs, which runs later in the step, so
  // it is one frame old in exactly the way run._bindSlow is. Same MIN composition as its six
  // neighbours and for the same reason; it sits ABOVE LATCH_SLOW_MUL on purpose, so a latched moray
  // in coral is still the worst case in the chapter rather than the coral swallowing the moray.
  const scrapeMul = run._scraping ? SPUR_SLOW_MUL : 1
  const composedSlowMul = Math.min(latchMul, webMul, run._bindSlow ?? 1, darkMul, sandMul, tireMul, foulMul, inkMul, scrapeMul)
  // SLEEK (v7.x, The Wreck): lifts the composed floor toward 1 (no slow) by the passive's resist
  // fraction, run through resistFrac's diminishing returns (never reaches 1, so the toll never
  // reaches zero), and the `1 - (1-x)(1-y)` shape means it can never drop below the raw composed
  // floor either.
  const sleekResist = resistFrac(run.passives.sleek)
  const slowMul = 1 - (1 - composedSlowMul) * (1 - sleekResist)
  const rampMul = run.rampageT > 0 ? RAMPAGE_SPEED_MUL : 1   // v5.14, read-time only (see config)
  // SCENT (v7.x, The Deep): "or move faster towards your prey" — the owner's own framing for the
  // button. MULTIPLIED, not MIN-composed with the three slows above, and the asymmetry is right:
  // those three are floors on how slow the world may make you, while this is a bonus you BOUGHT.
  // Folding it into the MIN would mean spending a full bar did nothing whenever a web was underfoot.
  // Note also that this chapter's own dark is the one that does NOT slow (resource.dark.speedFloor
  // is 1 here), so in The Deep light is what makes you fast rather than dark being what makes you
  // slow — see CHAPTERS.deep's header.
  const scentMul = (run._scentT ?? 0) > 0 ? SCENT_SPEED_MUL : 1
  // BLOODRUSH (v7.x, gnash): momentum from landed bites. Multiplied for the same reason scentMul is
  // — it is bought, not imposed. The stack count is the whole magnitude; the mod's own value is the
  // per-stack fraction, so one fact lives in one place and the card's number IS the number applied.
  const rushMul = (run._rushT ?? 0) > 0
    ? 1 + (run.weaponMods.gnash?.bloodrush ?? 0) * (run._rushN ?? 0)
    : 1
  const speed = p.speed * (1 + run.passives.moveSpeed) * run.mods.playerSpeedMul * slowMul * rampMul * scentMul * rushMul

  // v5.18 THE LANE (see CHAPTERS.beyond.lane). You do not roam here: you advance up the lane at a
  // fixed rate forever and the joystick gives you nothing but the two directions across it. Because
  // the camera already tracks the player in every chapter, advancing the player IS the auto-scroll —
  // the world slides past while you hold station on screen, for the cost of this branch and nothing
  // else. The forward rate is LANE_SCROLL_SPEED and not `speed`, so move-speed upgrades buy a faster
  // strafe and never a faster scroll.
  // v7.x: WHICH axis is forward comes from laneAxes (config.js) — The Beyond runs -y, The Reef +x.
  // No early return: the lane only changes the three expressions below, so it is folded into them
  // rather than branching past the per-frame ticks at the bottom of this function. (Rev.1 DID
  // return early and re-implemented those ticks, which is the classic trap — the next per-frame
  // player timer someone appends down there would silently never fire in this chapter.)
  const lane = CHAPTERS[run.chapter].lane === true
  const ax = lane ? laneAxes(CHAPTERS[run.chapter]) : null
  if (ax) {
    // THE BURST (v7.x, The Reef). The one thing allowed to touch the scroll rate, and it is allowed
    // because it is the player's own button rather than a force acting on them — every other site
    // in this file that could move the player along the lane (the obstacle push-out, the UFO's pull
    // beam) is forbidden from doing so, because the scroll is what the mode guarantees. run._burstT
    // is set by stepRepulse and ticked at the bottom of this branch; it is 0 for every chapter that
    // does not declare `burst`, so this multiplier is 1 everywhere else including The Beyond.
    const burstMul = (run._burstT ?? 0) > 0 ? BURST_SPEED_MUL : 1
    // THE THROTTLE (v7.x, The Reef — CHAPTERS[].laneThrottle). The stick's FORWARD component, which
    // a lane has always thrown away, now leans on the scroll: push the way you are travelling and
    // the level runs at you faster, ease back and it slows. Published on run._laneThrottle because
    // stepLaneFront has to advance the crush edge and the camera at the SAME rate — see the field's
    // block in config.js. Absent on a chapter that does not declare one, so The Beyond keeps its
    // golden master by construction.
    //   The two ends are separate multipliers (see the field's block) because they are not
    // symmetric: full push is thr.max and full ease-off is thr.min, and the low one may never reach
    // 0 — a lane that can be stopped is not a lane.
    const thr = CHAPTERS[run.chapter].laneThrottle
    const fwdIn = Math.max(-1, Math.min(1, (ax.fwd === 'x' ? ix : iy) * ax.dir))
    run._laneThrottle = thr ? 1 + fwdIn * (fwdIn >= 0 ? thr.max - 1 : 1 - thr.min) : 1
    p[ax.vCross] = (ax.cross === 'x' ? ix : iy) * speed * LANE_STRAFE_MUL
    p[ax.vFwd] = ax.dir * laneScrollFor(CHAPTERS[run.chapter], run.mods) * burstMul * run._laneThrottle
    if (run._burstT > 0) run._burstT = Math.max(0, run._burstT - dt)
  } else if ((run._lungeT ?? 0) > 0) {
    // THE LUNGE (v7.x, The Wreck). The free-roaming twin of the burst above, and it has to live in
    // this function for the same reason: whatever owns the player's velocity owns the dash. The
    // Reef's version multiplies a scroll the lane already provides; here there is no scroll, so the
    // direction is latched at press time (run._lungeX/_lungeY, set by stepRepulse) and REPLACES the
    // stick for as long as it lasts. Replacing rather than adding is deliberate — a lunge you can
    // steer is a speed boost, and the whole cost of this button is that you commit to a line.
    p.vx = run._lungeX * LUNGE_SPEED
    p.vy = run._lungeY * LUNGE_SPEED
    run._lungeT = Math.max(0, run._lungeT - dt)
    // How far THIS dash has actually carried you. stepBite refuses to land until it is non-zero,
    // and that is not a nicety: stepRepulse runs AFTER this function and stepBite runs later in the
    // SAME step, so on the press frame the player has not moved yet and a body already standing in
    // reach was bitten instantly — 45 charge spent, 0 of the advertised 270px travelled, one nibble.
    // In a chapter that pays you for standing in a crowd that is the common case, not the corner.
    run._lungeMoved = (run._lungeMoved ?? 0) + LUNGE_SPEED * dt
  } else {
    p.vx = ix * speed
    p.vy = iy * speed
  }
  p.x += p.vx * dt
  p.y += p.vy * dt
  // The walls, ACROSS the lane. Clamped to a lane that shrinks to fit a narrow viewport, so a rank
  // spanning the lane is always fully on screen — see laneHalfWidth's doc in config.js for why that
  // is load-bearing (and for what it still only approximates).
  if (ax) {
    const hw = laneHalfWidth(run.viewRadius, CHAPTERS[run.chapter])
    p[ax.cross] = Math.max(-hw, Math.min(hw, p[ax.cross]))
  }
  // p.vx/p.vy above ARE the snapshot the skies' artillery flag leads its shells with
  // (ARTILLERY_LEAD). Deliberately input-only: drift/pull forces aren't something a tank can read —
  // and in the lane the forward component is the scroll, which is exactly what a shell should lead.

  // `_lungeT` is the third term for the same reason `lane` is the second: both are ways of moving
  // that the STICK knows nothing about. render.js reads p.moving at four sites (the hop cycle, the
  // shadow squash, the eye look), so without it the fish holds a full idle pose while crossing
  // 270px at 900px/s — the same publish-into-the-contract-field fix p.facingAngle needed at the
  // press site, and invisible for exactly the same reason.
  p.moving = lane || len > 1e-6 || (run._lungeT ?? 0) > 0   // in the lane you are never stationary
  if (ix > 1e-6) p.facing = 1
  else if (ix < -1e-6) p.facing = -1
  // v5.0: last non-zero move direction as a full angle — render orients the pond tail to it, and
  // the Flagella Whip falls back to it only when no enemy exists to aim at (see fireFlagella).
  // Stays null until the player first moves. In the lane you always face up it, so a weapon with
  // nothing to shoot at fires forward rather than at wherever you last strafed.
  if (ax) p.facingAngle = ax.angle
  else if (len > 1e-6) p.facingAngle = Math.atan2(iy, ix)

  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt)
  if (p.slowT > 0) p.slowT = Math.max(0, p.slowT - dt)
  if ((run._rushT ?? 0) > 0) {
    run._rushT = Math.max(0, run._rushT - dt)
    if (run._rushT === 0) run._rushN = 0
  }
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
  run._spawnAcc += spawnRate(run.time) * run.mods.spawnMul * spawnTiltMul(run.mods.spawnTilt ?? 0, run.time) * laneMul * chaosMul * dt
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
  // Columns are spread ACROSS the lane and anchored to the world's cross axis, not to the player.
  // That is what makes a strafe a decision: the gaps are always in the same places, so you are
  // choosing which gap to be in rather than watching a wall re-centre on you (which is what rev.1
  // did). Rows stack back up the lane, AHEAD of the player — `ahead` is that first row's distance.
  const ax = laneAxes(CHAPTERS[run.chapter])
  const hw = laneHalfWidth(run.viewRadius, CHAPTERS[run.chapter])
  const pitch = (hw * 2) / FORMATION_COLS
  const ahead = Math.max(FORMATION_AHEAD_MIN, run.viewRadius * FORMATION_AHEAD_MUL)
  for (let row = 0; row < rows; row++) {
    // Alternate rows are offset by half a column — a brick pattern, so holding one gap all the way
    // through a multi-row wave never works.
    const offset = (row % 2) * pitch * 0.5
    for (let col = 0; col < FORMATION_COLS; col++) {
      if (run.enemies.length >= maxAliveFor(run.mods)) return
      const cross = -hw + pitch * (col + 0.5) + offset
      const fwd = p[ax.fwd] + ax.dir * ahead + ax.dir * (row * FORMATION_ROW_PX)
      // rosterId: a rank is rank-and-file invaders, never whatever the archetype pool happens to
      // roll. Elites arrive on their own timer through the ordinary spawn path, where they get the
      // chapter's eliteFlags and read as the exception they are. A lane chapter with no 'invader'
      // entry (The Reef, until it has a marcher of its own) falls through spawnEnemy's ordinary
      // roster pick, so the rank arrives as that chapter's own `normal` — still a block from ahead.
      spawnEnemy(run, {
        type: ARCHETYPE_TYPE.normal, forceNormal: true, rosterId: 'invader',
        [ax.cross]: cross, [ax.fwd]: fwd,
      })
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
// The trail: the ring buffer of recent player positions. TWO consumers, in two different chapters —
// The Blank's P1 detonates it (detonateTrail) and every `pastSeek` creature aims at a sample behind
// its newest end.
//
// ⚠ IT USED TO BE SAMPLED INSIDE stepBossScript, WHICH RETURNS EARLY FOR EVERY UNSCRIPTED CHAPTER.
// That made `pastSeek` INERT everywhere but The Blank, and inert in the quietest possible way: the
// read is guarded (`if (pt)`), so with an empty buffer the flag silently falls through to seeking
// the live player. A creature carrying it behaved as a plain chaser, nothing threw, and no test
// went red — the flag would simply have been decoration. Sampling here, before that early return,
// is what makes it a real behaviour outside the scripted chapter.
//
// The BLANK_ prefix on the two constants is now a misnomer: they govern any chapter with a pastSeek
// creature. Left alone deliberately — a rename reaches config.js, state.js's doc block and two
// sim-test scenarios for no behaviour change. // ponytail: rename through `renaming-safely` if a
// third consumer ever lands.
function stepTrail(run, dt) {
  const p = run.player
  run._trailT = (run._trailT ?? BLANK_TRAIL_DT) - dt
  if (run._trailT <= 0) {
    run._trailT += BLANK_TRAIL_DT
    run.trail.push({ x: p.x, y: p.y })
    if (run.trail.length > BLANK_TRAIL_MAX) run.trail.shift()
  }
}

function stepBossScript(run, dt) {
  if (!CHAPTERS[run.chapter].scripted) return false
  const p = run.player
  const s = run.script
  const accel = run.mutators.includes('accelResponse') ? BLANK_ACCEL_MUL : 1
  const xreact = run.mutators.includes('crossReactive')
  const mature = run.mutators.includes('affinityMature')

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
      if (hurtPlayer(run, BLANK_YANK_DMG, false, 'yank')) playerDied = true
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
  const e = spawnEnemy(run, { type: ARCHETYPE_TYPE[roster.archetype], forceNormal: true, rosterId, ...opts })
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
// TWO EXITS, because a seeker CAN be behind and the first cut of this said it could not.
// Rev.1: "the seeking swarm chases you and is therefore never behind in any meaningful sense."
// That is false wherever the roster is slower than the scroll, which is not an edge case -- The
// Reef's moray moves 39px/s against a 45px/s advance, so it falls behind BY CONSTRUCTION and can
// never return. Measured on the reef before this existed (scripts/reef-pileup.mjs): 34% of every
// live body sat off-screen astern, 52 per second-sample, 454 still alive at t=300s with a median
// age of 69s. They were still stepped, still counted against the alive cap, and so still thinning
// the crowd AHEAD -- the chapter's own difficulty leaking out of the back of the screen.
//
//   march  -> LANE_LEAK_BEHIND_PX, costs LANE_LEAK_DMG, emits 'leak'. "They must not pass" is a
//             FAILURE, and unchanged here: The Beyond is shipped and run LN is its golden master.
//   seeker -> seekerBack(), silent. No kill, no xp, no coin, no event -- the player never saw it,
//             and paying for it would make running away the best way to farm the chapter.
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
  // THE SHOREBREAK (v7.x, The Surf — CHAPTERS[].shorebreak). Same press, same cooldown, same `t`
  // as the burst, the breach and the scent — and then it RETURNS, which is the one thing none of
  // those three do. A `wave` chapter does not also fire the shove: no `repulse` event, no impulse
  // loop below, no 'hole' sample. The wave IS the button here, sustained by stepWave for a duration
  // the spend bought, and the SHOREBREAK_* block in config.js has the argument for why firing both would
  // cancel rather than compound. Returning here also means a chapter can never end up with two
  // second verbs at once, which is the design's own "one gimmick, one button" rule made structural
  // rather than a thing you have to remember while adding the fifth one.
  if (ch.shorebreak) {
    run._shorebreakT = SHOREBREAK_DUR_MIN + (SHOREBREAK_DUR_AT_FULL - SHOREBREAK_DUR_MIN) * t
    run.events.push({ type: 'shorebreak', x: p.x, y: p.y, r: SHOREBREAK_RADIUS, charged: t, dur: run._shorebreakT })
    return
  }
  // THE CLEAR reaches further and staggers longer, off the SAME floor and the same `t` — an empty
  // bar throws exactly the shipped 340px shove in every chapter, this one included, so the widening
  // is something the bar buys rather than something the chapter is given. See CLEAR_* in config.js.
  const reachAtFull = ch.clear ? CLEAR_RADIUS_AT_FULL : PULSE_RADIUS_AT_FULL
  const stun = ch.clear ? CLEAR_STUN : REPULSE_STUN
  const radius = REPULSE_RADIUS + (reachAtFull - REPULSE_RADIUS) * t
  const force = REPULSE_FORCE + (PULSE_FORCE_AT_FULL - REPULSE_FORCE) * t
  // The SCALED radius, not the constant. render.js draws both rings at e.r under a comment saying
  // the radius is pushed rather than fixed because "a burst that lies about its reach makes the
  // cooldown feel arbitrary" - pushing REPULSE_RADIUS here would draw the 340px floor ring around
  // a 620px shove, which is that exact complaint with a bigger gap.
  run.events.push({ type: 'repulse', x: p.x, y: p.y, r: radius, charged: t })
  // THE BURST (v7.x, The Reef — CHAPTERS[].burst). The same press, the same cooldown and the same
  // `t`: a chapter declaring `burst` gets a forward dash on top of the shove, its DURATION bought
  // with the charge that was already spent above. Set here rather than in stepPlayerMovement so the
  // whole cast is one place, and read there because the lane owns the forward velocity — see the
  // burstMul line in that function, and BURST_* in config.js for why the length and not the speed
  // is what the bar buys. At t = 0 this is still BURST_DUR_MIN, never 0: spec §8.2's no-spiral floor
  // says an empty bar may leave the player slower, never structurally trapped, and in a lane where
  // the coral is solid "trapped" is a thing that can actually happen.
  // THE CLEAR (v7.x, The Shelf — CHAPTERS[].clear). Same press, same cooldown, same `t` again, and
  // the shove above still fires. All this line arms is the SIGHT window; the wider reach and the
  // longer stagger were already folded in above, because they are the shove rather than a second
  // cast. Published as a plain timer for the same reason _burstT and _shorebreakT are: stepCharge
  // reads it to compute run.sightCharge, and render.js reads only that.
  //
  // NO EVENT IS PUSHED, deliberately. The press already emits `repulse` carrying the widened radius,
  // so the ring render.js draws is the Clear's real reach — a second event would draw a second ring
  // on the same frame and play the shove's sample twice, which is the exact complaint run SK.e pins
  // for The Surf. The murk visibly opening is the tell, and it is a bigger one than any ring.
  if (ch.clear) run._clearT = CLEAR_DUR_MIN + (CLEAR_DUR_AT_FULL - CLEAR_DUR_MIN) * t
  // UNLIKE CLEAR, THE BURST NEEDS ITS OWN EVENT: Clear's tell is the murk visibly opening, but a
  // dash through open water has no other visible sign the shove's own ring didn't already cover —
  // `_burstT` had zero render.js consumer before this line (grep `_burstT` src/render.js was empty).
  if (ch.burst) {
    run._burstT = BURST_DUR_MIN + (BURST_DUR_AT_FULL - BURST_DUR_MIN) * t
    run.events.push({ type: 'burst', x: p.x, y: p.y })
  }
  // THE LUNGE (v7.x, The Wreck — CHAPTERS[].lunge). Same press, same cooldown, same `t`, and the
  // shove above still fires — this is additive like the burst, not a replacement like the shorebreak.
  //
  // THE FLOOR IS THE SHOVE ITSELF, and `LUNGE_DUR_AT_FULL * t` is the ONE thing that delivers it.
  // Every other chapter's second verb has a non-zero floor (BURST_DUR_MIN, BREACH_R_MIN,
  // SCENT_DUR_MIN) so an empty bar is weaker and never structurally trapped; here the duration goes
  // to zero instead, which is the same rule reaching its limit rather than an exception to it. A
  // lunge exists to buy a kill that refills the bar, so a free one on an empty bar would be a free
  // refill, and this chapter's whole premise is that the bar is only ever paid for in kills. A
  // starving player still gets the full v5.21 Pulse.
  //
  // ⚠ THERE WAS A `t > 0` GATE HERE AND IT IS DELIBERATELY GONE. It was a second, independent guard
  // for that same rule, and a mutation run showed exactly what two guards for one fact buy you:
  // each one MASKS a defect in the other, so flooring the duration to BURST_DUR_MIN's shape — the
  // plausible mistake, since every other button has such a floor — was invisible to the suite.
  // One mechanism, one test that can see it. Do not re-add the gate as an optimisation; the cost it
  // saved was a single nearestEnemy scan on a press this chapter's player has no reason to make.
  //
  // Aimed at the NEAREST ENEMY, falling back to facingAngle — fireFlagella's shipped rule, because a
  // bite that goes where the stick points is a bite you miss with. The direction is latched here and
  // read by stepPlayerMovement for the life of the dash.
  if (ch.lunge) {
    // `nearestEnemy(run)` — ONE argument. Its signature is (run, pad = 100) and it measures from
    // the player itself; passing (run, p.x, p.y) put the player's world X into `pad` and discarded
    // p.y, making the acquisition radius |viewRadius + player.x|. That is a dead band centred on
    // x = -viewRadius, two target-distances wide, in which the button silently stopped aiming at
    // all — and an unbounded range at large +x, where it would launch at an off-screen body.
    // Every other call site but the Lest's passes (run) alone; that one passes a deliberate
    // NEGATIVE pad (BALLAST_REACH_PAD) to aim short of the screen edge.
    // AIMED AT PREY, NOT AT WHATEVER IS NEAREST. Owner ruling 2026-08-18: "the action button should
    // be a dash to a nearby non-tank enemy."
    //   The moray is the one body in this chapter you cannot eat on demand — it is `guard`-windowed,
    // so a Lunge that picks it spends the bar on a body that may simply refuse the damage, and
    // LUNGE_KILL_REFILL never pays out. Since the moray is also the SLOWEST thing here, it is very
    // often the nearest, so the untargeted button spent itself on the one wrong answer most of the
    // time. Preferring prey makes the press mean "go eat that" instead of "go forward-ish".
    //   Falls back to nearestEnemy when there is no prey in range, so the button never goes dead —
    // an empty press that still shoves is the shipped floor and it stays.
    const tgt = nearestPrey(run) ?? nearestEnemy(run)
    const ang = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : (p.facingAngle ?? 0)
    run._lungeX = Math.cos(ang)
    run._lungeY = Math.sin(ang)
    run._lungeT = LUNGE_DUR_AT_FULL * t
    run._lungeMoved = 0
    // PUBLISH THE FACING, or the fish swims sideways through its own signature move. render.js
    // rotates the body off `p.facingAngle` and nothing else, and that field is written only from
    // the STICK (stepPlayerMovement) — so a dash deliberately aimed somewhere other than the stick
    // is invisible to the renderer, which is the freeze scar's shape exactly: sim knows the
    // direction, render is never told, and on screen it reads as a bug rather than as a lunge.
    // The Reef's Burst never needed this because a lane pins facingAngle to the lane's own heading.
    p.facingAngle = ang
    p.facing = Math.cos(ang) >= 0 ? 1 : -1
  }
  // THE BREACH (v7.x, The Trawl — CHAPTERS[].breach). The same press, the same cooldown and the same
  // `t` again: this chapter's answer to its own wall, and never a second button or a second bar. You
  // tear the hole where YOU are on the net, and it lasts for the rest of that pass — a door you made,
  // which the crowd will also use, because inNetHole does not ask who is standing in it.
  //
  // Gated on the net being in REACH, which is what stops the button being free: pressed on cooldown
  // from anywhere, the wall would never be a decision. With the gate, breaching means turning back
  // toward the thing that is killing you while it is still 500px out.
  //
  // The floor is the RADIUS, not the existence of the hole (BREACH_R_MIN, and see its block): this
  // chapter's other half makes an empty bar SLOW, so a bar that also could not cut would let the two
  // halves conspire into the structural trap spec §8.2 forbids.
  // THE SCENT (v7.x, The Deep — CHAPTERS[].scent). The same press, the same cooldown and the same
  // `t` a third time. Ungated, unlike the breach: there is no "in reach" condition to meet because
  // the smell is cast from the player and finds whatever is out there — in a chapter where you
  // cannot see, a button with a targeting requirement would be a button you cannot aim.
  // SCENT_DUR_MIN, never 0, on the same no-spiral floor argument as BURST_DUR_MIN and BREACH_R_MIN:
  // an empty bar may leave you weaker, never structurally unable to act.
  if (ch.scent) {
    run._scentT = SCENT_DUR_MIN + (SCENT_DUR_AT_FULL - SCENT_DUR_MIN) * t
    run.events.push({ type: 'scent', x: p.x, y: p.y, r: SCENT_R, charged: t, dur: run._scentT })
  }
  if (ch.breach && run.net && run.net.holes.length < BREACH_MAX_HOLES) {
    const nt = run.net
    if (Math.abs(p.x * nt.nx + p.y * nt.ny - nt.pos) <= BREACH_REACH) {
      const r = BREACH_R_MIN + (BREACH_R_AT_FULL - BREACH_R_MIN) * t
      nt.holes.push({ t: p.x * -nt.ny + p.y * nt.nx, r })
      run.events.push({ type: 'breach', x: p.x, y: p.y, r, charged: t })
    }
  }
  const radSq = radius * radius
  const lax = laneAxes(ch)
  for (const e of run.enemies) {
    if (e._dead) continue
    const dx = e.x - p.x, dy = e.y - p.y
    const dsq = dx * dx + dy * dy
    if (dsq > radSq) continue
    const d = Math.sqrt(dsq)
    // Dead centre has no direction to push along; shove it up-lane rather than picking a random one,
    // so an enemy sitting exactly on the player still goes the way everything else does. laneAxes
    // reads 'y' for the non-lane `resource` chapters that also have this button, which is exactly
    // the (0, -1) this line hardcoded before them.
    const ux = d > 1e-6 ? dx / d : lax.fx
    const uy = d > 1e-6 ? dy / d : lax.fy
    const falloff = 1 - d / radius
    e.kb.x += ux * force * falloff
    e.kb.y += uy * force * falloff
    e.stunT = Math.max(e.stunT || 0, stun)
  }
}

// Asteroids (v5.21, lane chapters). Neutral drifting hazard: hurts the player on contact AND grinds
// any enemy overlapping it. Not destructible — see ROCK_INTERVAL's block in config.js.
// Returns true if the player died, matching stepLeaks/stepContactDamage's contract.
//
// `lane` AND an OPT-OUT, because `lane` alone made this The Beyond's hazard in every scroller ever
// written: The Reef inherited cratered space rocks it never asked for, ~88 a run, and a death screen
// that read "Killed by Asteroids". A chapter turns them off with `rocks: false` (CHAPTERS.reef).
// Opt-out and not opt-in on purpose — The Beyond is shipped and golden-mastered (run LN), so the
// default has to be the behaviour it already has.
function stepRocks(run, dt) {
  const ch = CHAPTERS[run.chapter]
  if (!ch.lane || ch.rocks === false) return false
  const p = run.player
  const ax = laneAxes(ch)
  // Signed "how far up the lane", whichever axis this chapter runs on: bigger = further ahead.
  // Multiplying by ±1 is exact, so on The Beyond's -y lane every comparison below is the same
  // comparison it has always been, with both sides negated.
  const along = (o) => o[ax.fwd] * ax.dir
  run._rockAcc = (run._rockAcc ?? ROCK_INTERVAL) - dt
  if (run._rockAcc <= 0) {
    run._rockAcc += ROCK_INTERVAL
    if (run.rocks.length < ROCK_MAX_LIVE) {
      const hw = laneHalfWidth(run.viewRadius, CHAPTERS[run.chapter]) * ROCK_SPREAD_MUL
      const cross = -hw + Math.random() * hw * 2
      const fwd = p[ax.fwd] + ax.dir * Math.max(FORMATION_AHEAD_MIN, run.viewRadius * FORMATION_AHEAD_MUL)
      run.rocks.push({
        [ax.cross]: cross,
        [ax.fwd]: fwd,
        r: ROCK_MIN_R + Math.random() * (ROCK_MAX_R - ROCK_MIN_R),
        // vCross, not vx: the wander is ACROSS the lane, which is y in an x-lane chapter.
        vCross: (Math.random() - 0.5) * 2 * ROCK_DRIFT_X,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 2 * ROCK_SPIN,
        _acc: 0,
      })
    }
  }
  let died = false
  for (const rk of run.rocks) {
    rk[ax.cross] += rk.vCross * dt
    // DOWN the lane, i.e. against the player's own advance — which is what makes a rock overtake.
    rk[ax.fwd] += -ax.dir * ROCK_SPEED * dt
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
      if (hurtPlayer(run, ROCK_DMG, false, 'rock')) died = true
    }
  }
  // Drop rocks once they are well behind — same threshold a leaked marcher uses.
  run.rocks = run.rocks.filter((rk) => along(rk) > along(p) - LANE_LEAK_BEHIND_PX - rk.r)
  return died
}

// HOW FAR ASTERN IS OUT OF THE GAME, for a seeker. It must be past the last pixel the player can
// see, or bodies pop out of existence on screen; it must not be much further, or the dead zone the
// cull exists to drain simply moves. render.js's lane camera states the visible half exactly --
// (1 - LANE_CAMERA_FRAC) of the viewport ALONG THE FORWARD AXIS -- so this is that, plus the same
// SPAWN_RING margin the front of the lane uses, and it MOVES WITH THE VIEWPORT rather than being
// correct on one phone (78px astern on a 390px phone, 256px on a 1280px desktop: a constant tuned
// on either one vanishes bodies mid-screen on the other).
//
// NOT floored at LANE_LEAK_BEHIND_PX, and that constant is the trap this avoids. 260 was tuned on
// The Beyond, a y-lane, where a portrait phone shows 169px astern -- so it sits 91px past the edge.
// Rotate the lane onto x and the same 260 sits 182px past a 78px strip: a dead zone more than
// twice the size of what the player can see, which is the pile-up in a smaller form. The axis
// changes what the number MEANS, exactly as LANE_SCROLL_SPEED's own block says it does for scroll.
function seekerBack(run, ax) {
  return laneBehindPx(run, ax) + SPAWN_RING
}

// THE LANE FRONT AND THE BACK EDGE (v7.x, The Reef).
//
// Until now "the camera already tracks the player, so advancing the player IS the auto-scroll" was
// the whole of the lane, and it is why being blocked could not cost anything: stop the player and
// you stop the world with them. Solid coral needs the two to come apart, so the lane now has a
// FRONT that advances on its own clock and a camera anchored to it (render.js reads _laneFront and
// writes nothing). Keep up and you sit where you always did; get stopped and the lane leaves.
//
// The front is also PULLED by the player -- max(front + scroll dt, player) -- so a burst that
// carries you past it is progress rather than a camera you have outrun.
//
// And it is CLAMPED to the player's own position plus the visible strip, which is what keeps you on
// screen while stuck. That is why the world appears to stall when you are pinned: it has, because
// the alternative is watching your own fish leave the frame. The reef grinds while it waits, and
// the moment you strafe into a groove the front is free to run again.
function stepLaneFront(run, dt) {
  const ch = CHAPTERS[run.chapter]
  if (!ch.lane) return false
  const ax = laneAxes(ch)
  const p = run.player
  const along = (v) => v * ax.dir
  const solid = ch.spurs && ch.spurs.solid
  // x run._laneThrottle: the player's own hand on the scroll (stepPlayer, one call earlier this
  // step). The front is the crush edge and the camera anchor, so easing off has to slow IT or the
  // level would not slow down at all — you would simply be left behind by a lane still running 90.
  let front = Math.max(along(run._laneFront ?? 0) + laneScrollFor(ch, run.mods) * (run._laneThrottle ?? 1) * dt, along(p[ax.fwd]))
  // A chapter with nothing that can stop the player never separates from them, so it keeps exactly
  // the old behaviour by construction rather than by a flag: The Beyond's front IS its player.
  if (!solid) { run._laneFront = front * ax.dir; run._crushing = false; return false }
  const maxLag = Math.max(0, laneBehindPx(run, ax) - PLAYER.radius)
  const lag = front - along(p[ax.fwd])
  const crushing = lag >= maxLag - 1e-6
  if (lag > maxLag) front = along(p[ax.fwd]) + maxLag
  run._laneFront = front * ax.dir
  run._crushing = crushing            // the tell, read by render.js
  run._crushAcc = (run._crushAcc ?? 0) + dt
  if (!crushing) { run._crushAcc = Math.min(run._crushAcc, LANE_CRUSH_TICK); return false }
  let died = false
  while (run._crushAcc >= LANE_CRUSH_TICK) {
    run._crushAcc -= LANE_CRUSH_TICK
    // `dot: true` and a named src, exactly as the scrape and the drown are: main.js silences the
    // per-tick audio on e.dot and render.js keys its hurt reaction off the source name.
    if (!died && hurtPlayer(run, LANE_CRUSH_DPS * LANE_CRUSH_TICK, true, 'crush')) died = true
  }
  return died
}

function stepLeaks(run) {
  const ch = CHAPTERS[run.chapter]
  if (!ch.lane) return false
  const p = run.player
  const ax = laneAxes(ch)
  // OPT-IN, and the direction is the point. The seeker sweep is NEW behaviour, and The Beyond is
  // shipped with a golden master over its exact positions -- turning it on by default moved that
  // chapter's strafe from x=-392.214 to x=-81.723, because thinning the crowd astern frees
  // alive-cap for a denser crowd AHEAD and the player is then latched a different amount of the
  // time. Same argument the chapter-level rocks opt-out settled the other way round: whichever
  // side is already shipped keeps the default. The Beyond can adopt this by re-capturing its
  // golden master with a stated reason.
  const sweep = ch.sweepAstern === true
  // See stepRocks: signed distance up the lane, so "behind the player" is one comparison whichever
  // axis the chapter runs on.
  const along = (o) => o[ax.fwd] * ax.dir
  for (const e of run.enemies) {
    if (e._dead) continue
    const marcher = e.flags && e.flags.includes('march')
    if (!marcher) {
      // isAlly: a summoned ally trails the player and is not the crowd. Culling one would delete
      // a card the player paid for, silently, whenever they outran it.
      if (sweep && !isAlly(e) && along(e) < along(p) - seekerBack(run, ax)) e._dead = true
      continue
    }
    if (along(e) > along(p) - LANE_LEAK_BEHIND_PX) continue
    e._dead = true
    run.events.push({ type: 'leak', x: e.x, y: e.y })
    // THE INVULNERABILITY GATE, and it has to be HERE rather than inside hurtPlayer: hurtPlayer
    // SETS p.invuln but never CHECKS it — every caller does its own gating (stepContactDamage's is
    // the model). Rev.1 of this function omitted the check and looped, so a rank arriving together
    // removed FORMATION_COLS x LANE_LEAK_DMG in a single frame out of 100 max HP, and the chapter
    // killed the player in 15 seconds without an enemy ever touching them.
    if (p.invuln > 0) continue
    if (hurtPlayer(run, LANE_LEAK_DMG, false, 'leak')) return true
  }
  return false
}

// Rolls equal-weight distinct affix ids from every ELITE_AFFIXES entry EXCEPT `anchored`: 1
// normally, 2 once run.time >= AFFIX_SECOND_AT. Called only for elites.
function rollAffixes(run) {
  const count = run.time >= AFFIX_SECOND_AT ? 2 : 1
  const pool = Object.keys(ELITE_AFFIXES).filter((id) => id !== 'anchored')
  const picked = []
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length)
    picked.push(pool.splice(idx, 1)[0])
  }
  // `anchored` is an OVERLAY, not one of the rolled affixes — it is filtered out of the pool above
  // so ANCHORED_CHANCE is the rate as written, and every elite still carries its own teeth
  // underneath it. Same idiom as unstableCores below: the rule is added, nothing is taken away.
  if (Math.random() < ANCHORED_CHANCE) picked.push('anchored')
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
    // Elemental status (see ELEMENTS in config.js; ticked by stepStatuses). `chill` and `venom`
    // are PUBLISHED here for render.js, derived every step from the windows below — they are not
    // state anything writes to directly.
    ignite: 0, igniteDps: 0,
    chill: 0, frozen: 0,
    venom: 0,
    // Bleed DoT (v5.0, flagella's barbed mod — see applyBleed): dot-flagged, ticks like ignite.
    bleed: 0, bleedDps: 0,
    // Status effects (v5.4, see the enemies[] contract in state.js): fear inverts the seek, stun
    // freezes it, enrage speeds it up and hardens its contact damage. Ticked in stepEnemyMovement.
    fearT: 0, fearCd: 0, dazeCd: 0, dragT: 0, _ccDR: 1, stunT: 0, enrageT: 0,
    bloomSlowT: 0, // v6.4: a plain speed debuff (folds into slowMul), refreshed by stepBlooms
    // v7.x The Reef, PUBLISHED for render.js (see the status block there): seconds of blindness
    // left. While > 0 the retarget seam hands this body a point down its own held heading instead
    // of the player's position. Refreshed by stepBlooms, decayed in stepEnemyMovement.
    blindT: 0,
    // v7.x The Deep, both PUBLISHED for render.js (see the status block there):
    //   scentT  seconds left on the Scent mark. Amplifies every source of damage (dealDamage) and
    //           is what render outlines the body with. Refreshed by stepScent, decayed above.
    //   gape    0..1, how far an anglerfish's mouth is open, i.e. how close it is to biting. On
    //           every enemy rather than only on anglers so the shape of a body never changes shape
    //           mid-run, which is the same reason bloomSlowT sits here.
    scentT: 0, gape: 0, _biteCd: 0,
    _shockCd: 0,
    // Two rolling windows of PLAYER damage as a share of this enemy's own maxHP: cold clears its
    // own on freeze, which is exactly why they are not shared. `_elFrozen` / `_elResist` are the
    // freeze and its aftermath.
    _elCold: newElWindow(), _elVenom: newElWindow(), _elFrozen: 0, _elResist: 0,
  }
}

// ---- Elements redesign: the rolling window --------------------------------------------------
// `total` is the sum of everything added in the last EL_WINDOW seconds, each contribution expiring
// on its own clock. A single decaying float cannot do this: exponential decay is proportional to
// the running total, so one crit makes every small contribution beside it evaporate early while the
// crit itself outlives its own window — and this game has crits and mixed weapon weights.
// Exported so test fixtures can build a REAL window instead of a literal of the same shape:
// the two drifted (`head` vs `i`) and the copy produced NaN totals, which reads as "venom does
// nothing" rather than as an error.
export function newElWindow() { return { total: 0, b: [0, 0, 0, 0, 0, 0], head: 0, acc: 0 } }

// Null-safe on purpose: the suite hand-builds enemy fixtures that never went through
// freshEnemyFields, and a status helper must not be the thing that throws on one.
function elAdd(w, x) { if (!w) return; w.b[w.head] += x; w.total += x }

// ADVANCE FIRST, then clear what is NOW the oldest bucket. Subtracting before advancing evicts the
// bucket just written, which silently shortens the window to one bucket (0.5s instead of 3s) and
// makes every threshold in the design unreachable by 6x. Run EL.a guards this.
function elStep(w, dt) {
  if (!w) return
  w.acc += dt
  const per = EL_WINDOW / EL_BUCKETS
  while (w.acc >= per) {
    w.acc -= per
    w.head = (w.head + 1) % EL_BUCKETS
    w.total -= w.b[w.head]
    w.b[w.head] = 0
  }
  if (w.total < 0) w.total = 0        // float residue only
}

function elClear(w) { if (!w) return; w.b.fill(0); w.total = 0; w.acc = 0 }

const elP = (run, id) => (run.elements?.[id] ?? 0)

// ALIGNMENT IS POTENCY, SO IT GOES INSIDE elScale — `elScale(P * am)`, never `elScale(P) * am`.
// The card says "x2 potency", and under a sqrt ladder that is x1.41 on the output, not x2. Three
// of the four elements had it outside and were therefore x1.41 too strong under the card while
// lightning was correct; nothing caught it because the only test of it ran on the old element
// system, where potency was linear and the two forms agreed. Any element added later reads this.

/** Cold's slow, 0..1. 1 IS frozen — there is no separate threshold. */
function elSlow(run, e) {
  if ((e._elFrozen ?? 0) > 0) return 1
  const P = elP(run, 'cold')
  if (P <= 0) return 0
  return Math.min(1, (e._elCold?.total ?? 0) * EL_COLD_MUL * elScale(P * alignmentMul(run)))
}

/** Venom's damage-taken amp. Venom deals no damage of its own; this is the whole card. */
function elVenomAmp(run, e) {
  const P = elP(run, 'venom')
  if (P <= 0) return 0
  return (e._elVenom?.total ?? 0) * EL_VENOM_MUL * elScale(P * alignmentMul(run))
}

// Only ANCHORED elites can never be frozen (owner ruling 2026-08-13). `unshakeable` tanks are
// ordinary heavy enemies here — they resist by having more health, which is the entire point of
// normalising by maxHP, and giving them a second exemption would re-create the special case the
// redesign exists to delete.
function elNeverFreezes(e) { return !!(e.affixes && e.affixes.includes('anchored')) }

// opts: { type, x, y, forceNormal } — lets splitter deaths spawn wisps at a fixed position
// (never elite, but still time-scaled like any other spawn). Called with no opts by the
// normal spawn-timer path in stepSpawning.
function spawnEnemy(run, opts = {}) {
  const isElite = !opts.forceNormal && run.time >= run._nextEliteAt
  // BOTH ELITE JACKPOTS BRING THEIR OWN ELITES (config: ELITE_SURGE_EVERY_MUL). Read-time, never
  // written into run.mods — that table is the run's mutator product and must stay fixed.
  //
  // ONCE, not once per card. `||` and not a product: holding Submission and Unstable Cores
  // together is intended and they are specced to combine, but compounding the cadence would be
  // 9x elites rather than 3x, and a jackpot pair should not quietly become a difficulty setting.
  if (isElite) {
    const eliteSurge = run.anomalies?.submission || run.anomalies?.unstableCores
    run._nextEliteAt += eliteEveryAt(run.time, lateEliteFor(run.chapter)) * run.mods.eliteEveryMul
      * (eliteSurge ? ELITE_SURGE_EVERY_MUL : 1)
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
  // v7.x `maxAlive`: a HARD CEILING on how many of one roster entry may exist at once, filtered
  // exactly like minT above and with the same "never empty the pool" fallback.
  //
  // It exists because The Deep's anglerfish is STATIONARY (speedMul 0.18, unshakeable) and is
  // therefore the first roster entry in the game that never walks into the player and never dies.
  // Every one that spawns is still there five minutes later, so an ordinary spawn weight does not
  // control its density — it controls its ACCUMULATION RATE. Measured before the cap:
  // charge-probe reported the refill reachable 82.7% of the run under the DO-NOTHING control and
  // 96.7% under a greedy one, %DARK at 0, and a hoarding player pinned at a full bar — i.e. the
  // chapter's whole resource was decoration, in the chapter whose premise is that light is scarce.
  // Any future roster entry that does not chase the player will need this too.
  const capped = eligiblePool.filter((r) => {
    if (r.maxAlive == null) return true
    let n = 0
    for (const e of run.enemies) if (!e._dead && e.rosterId === r.id && ++n >= r.maxAlive) return false
    return true
  })
  const pool = capped.length > 0 ? capped : (eligiblePool.length > 0 ? eligiblePool : rosterPool)
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
      const ax = laneAxes(CHAPTERS[run.chapter])
      const hw = laneHalfWidth(run.viewRadius, CHAPTERS[run.chapter])
      const cross = -hw + Math.random() * hw * 2
      const fwd = p[ax.fwd] + ax.dir * (run.viewRadius + SPAWN_RING)
      x = ax.fwd === 'x' ? fwd : cross
      y = ax.fwd === 'y' ? fwd : cross
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
  // roster.dmgMul (v7.x): the per-creature damage term, added last and in the same shape as the
  // hpMul/speedMul/radiusMul/xpMul lines around it. Until it existed, the only ways to make ONE
  // roster entry hit softer were the archetype base in ENEMIES (which moves that archetype in every
  // chapter) or the chapter's own balance.enemyDmgMul (which moves every creature in the chapter) —
  // neither of which can say "this one enemy is too harsh", which is the note it was added for.
  // CHAPTERS[].passiveCrowd (v7.x, The Reef): the chapter-wide twin of roster.dmgMul, and it is a
  // FACTOR on this same line rather than a branch in stepContactDamage for the reason that line's
  // own block gives -- contactHarmless already reads 0 as harmless, so one term here disarms every
  // path that reaches the player (plain contact, the latch clause, the formation ranks) with
  // nothing else to keep in step. See CHAPTERS.reef.passiveCrowd for the other half.
  const dmg = base.dmg * dmgScale(run.time) * (isElite ? ELITE.dmgMul : 1) * run.mods.enemyDmgMul * (roster?.dmgMul ?? 1)
    * (CHAPTERS[run.chapter].passiveCrowd ? 0 : 1)
  const radius = base.radius * (isElite ? ELITE.sizeMul : 1) * run.mods.enemyRadiusMul * (roster?.radiusMul ?? 1)

  const affixes = isElite ? rollAffixes(run) : []
  if (isElite && affixes.includes('gilded')) hp *= GILDED_HP_MUL
  hp = roundHP(hp)   // LAST, after every multiplier — gilded lands after the base roll and a x1.5
                     // on an odd number puts the .5 straight back (caught by run VD.a)

  const flags = roster ? [...roster.flags] : []
  if (isElite) flags.push(...CHAPTERS[run.chapter].eliteFlags)

  const born = {
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
    // roster.dash (v7.x): per-creature overrides for the dashBurst timings, or null to take the
    // shared DASH_* globals. Carried as ONE object rather than two loose fields so an enemy does not
    // grow a column per knob, and so stepDashBurst's reader can see at a glance that the whole
    // override is optional. null on every enemy in the game except The Surf's Sea Roach.
    dash: roster?.dash ?? null,
    // roster.phase (v7.x): the same shape as `dash` above, for the `phase` flag's windows.
    // null on every enemy but The Shelf's Moon Jelly.
    phase: roster?.phase ?? null,
    // roster.trailLag (v7.x): how many trail samples behind the player a `pastSeek` creature aims,
    // or null to take the shared BLANK_PASTSEEK_LAG. Third instance of the same idiom as `dash` and
    // `phase`, and it exists for the same reason: The Blank's Probe is tuned as a SHADOW (lag 1,
    // ~0.35s, paired with speedMul 1.3 so it hangs just off your shoulder), and a chapter that wants
    // a creature to arrive somewhere you have actually left must not drag the boss's number with it.
    trailLag: roster?.trailLag ?? null,
    // xpMul is the roster's third stat lever, alongside hpMul/speedMul above: what a kill of
    // this creature is WORTH, independent of how much health it has. They are separate on
    // purpose — a chapter can make something cheaper to kill and still pay well for it.
    xp: base.xp * (roster?.xpMul ?? 1),
    ...freshEnemyFields(),
  }
  // `deferred` is mandatory for any caller running INSIDE a walk of run.enemies — see the long
  // measurement in spawnSplitChildren for what an immediate push does there. It is not the
  // default because three callers need the enemy to exist right now: stepSpawning's `while
  // (run.enemies.length < cap)` counts the array to stop, and spawnBlankEnemy/the spawner flag
  // read the newborn straight back. Those three take the RETURN VALUE instead, so no caller has
  // to index run.enemies to find what it just made.
  if (opts.deferred) (run._spawnQueue ??= []).push(born)
  else run.enemies.push(born)
  // v6.3 dispatch beat (CHAPTERS[].dispatch, currently city only): a REAL elite birth here — never
  // a spawner's minions, which always pass forceNormal and so never reach isElite — fires the
  // "pest control has been reported" fiction beat. render.js draws the strobe, main.js plays the
  // siren, ui.js shows the HUD line.
  if (isElite && CHAPTERS[run.chapter].dispatch) run.events.push({ type: 'dispatch', x, y })
  return born
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
// Move anything queued during the last step into the world. Tolerates an older save/probe that
// built a run without the field, since createRun is not the only thing that ever makes one.
function flushSpawns(run) {
  const q = run._spawnQueue
  if (!q || q.length === 0) return
  for (const e of q) run.enemies.push(e)
  q.length = 0
}

function spawnSplitChildren(run, parent, count) {
  if (!run._spawnQueue) run._spawnQueue = []
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const d = Math.random() * 20
    const hp = roundHP(parent.maxHP * SPLIT_HP_FRAC)
    // QUEUED, not pushed. 63 loops in this file walk `run.enemies` with for...of while dealing
    // damage, and a for...of re-reads the array's length every step — so an enemy appended during
    // one of them is visited by that very loop. The parent dies mid-sweep, its children are
    // appended behind the cursor, and the SAME cast strikes them before they have existed for a
    // frame. Measured over 3 seeded 300s Shelf runs with the whip alone: 495 of 657 children were
    // struck by the swing that spawned them and 378 of 526 child deaths happened in their birth
    // frame — the `split` flag inert 72% of the time, and on screen three damage numbers inside
    // 20px in one instant, which is what got reported as the whip hitting one enemy several times.
    run._spawnQueue.push({
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
      // XP TRACKS HEALTH, exactly as hp and radius above do. Inheriting the parent's FULL xp on a
      // SPLIT_HP_FRAC body made one splitter worth 3 kills of xp for 1.9 kills of health — 1.58x
      // the xp-per-point-of-health of every other enemy in the game, and the only place that ratio
      // is not 1. Measured: split children were 45% of the xp in both chapters that field them
      // (pond, shelf), and the effect was a FRONT LOAD rather than a bigger total — The Twilight ran
      // level 10.5 at 180s against undergrowth's 8.5 and city's 8.0, then finished 5 levels behind
      // them. At this fraction its 180s level is 8.5, level with the pack. Zeroing it instead put
      // the chapter below body, the poorest in the game, at every mark.
      xp: parent.xp * SPLIT_HP_FRAC,
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
  // v7.x: which way is "down the lane" for the `march` machine below. Hoisted out of the per-enemy
  // loop — it is one frozen lookup per frame, and non-lane chapters simply never reach the branch.
  const laneAx = laneAxes(CHAPTERS[run.chapter])
  // v7.x: CHAPTERS[].passiveCrowd -- this chapter's creatures never seek. Hoisted beside laneAx for
  // the same reason: one frozen lookup per frame.
  const passiveCrowd = CHAPTERS[run.chapter].passiveCrowd === true

  for (const e of run.enemies) {
    // Seek target: the player by default, or the nearest Pheromone Lure decoy (v5.3 garden) whose
    // aggro radius this enemy sits inside — lured foes path to the decoy instead of the player.
    let tx = p.x, ty = p.y
    let baited = false
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
        // `baited` (v7.x, The Wreck's Chum): WHICH decoy won, not merely that one did. stepPrey
        // inverts its response to the seek target, so a bait that did not say so would be read as a
        // thing to run from — the card doing the exact opposite of its own text, silently.
        if (lsq <= lu.aggro * lu.aggro && lsq < bestSq) { bestSq = lsq; tx = lu.x; ty = lu.y; baited = !!lu.bait }
      }
    }
    // pastSeek flag (v5.24 blank's probes, v7.x The Shelf's dogfish): hunt where the player WAS — a
    // trail sample `lag` behind the newest, falling back to the live player while the trail is still
    // short. Keep moving and it forever arrives where you no longer are; stop and it closes.
    // The lag is per-creature (e.trailLag, see spawnEnemy) because the two users want opposite
    // things from it: the Probe shadows at 1 sample (~0.35s), the dogfish trails much further back.
    // The buffer itself is filled by stepTrail, which is NOT inside stepBossScript — see the note
    // there for how this flag spent its whole life inert outside the scripted chapter.
    if (e.flags && e.flags.includes('pastSeek')) {
      const lag = e.trailLag ?? BLANK_PASTSEEK_LAG
      const pt = run.trail && run.trail[run.trail.length - 1 - lag]
      if (pt) { tx = pt.x; ty = pt.y }
    }
    // SQUID INK'S BLIND (v7.x, The Reef). LAST at this seam, so it overrides a lure and a trail
    // sample alike: a body that cannot see the player cannot see a decoy of them either.
    //
    // It hands the machines a point INK_BLIND_REACH down the heading the body already had, which is
    // what "loses you and keeps going" means in a file where every machine reads a point. The
    // heading is captured ONCE, on the first frame of the blind, and held for its whole length —
    // recomputing it per frame off (tx - e.x) would re-derive the player's bearing every frame and
    // the blind would do nothing at all, silently.
    //   The capture is deliberately taken from the seek target as it stands HERE, after the lure
    // and pastSeek branches, so a body blinded while chasing a decoy carries on toward the decoy's
    // last position rather than snapping onto the player's.
    if ((e.blindT ?? 0) > 0) {
      if (e._blindHx === undefined) {
        const bl = Math.hypot(tx - e.x, ty - e.y) || 1
        e._blindHx = (tx - e.x) / bl
        e._blindHy = (ty - e.y) / bl
      }
      tx = e.x + e._blindHx * INK_BLIND_REACH
      ty = e.y + e._blindHy * INK_BLIND_REACH
      // ...and into `_tgtX/_tgtY`, the shipped "face this instead of the player" pair, for exactly
      // the reason SUBMISSION's allies and The Wreck's skittish prey write it: render derives every
      // bearing from run.player each frame, so without this a blinded body swims away with its eyes
      // still on you and the card's whole product — bodies LOSING you — is undrawn.
      e._tgtX = tx; e._tgtY = ty
    }
    const dx = tx - e.x, dy = ty - e.y
    const d = Math.hypot(dx, dy)
    // chill/freeze/bloom slow the seek movement only. // ponytail: movement state machines that
    // bypass slowMul entirely (dashBurst's dash, diveBomb's dive, pounce's leap, etc.) keep full
    // speed while bloomSlowT is up — the same ceiling chill/freeze already have here; not worth a
    // second guard in every one of those machines for a debuff this soft.
    const bloomMul = (e.bloomSlowT || 0) > 0 ? (1 - BLOOM_SLOW) : 1
    // Ballast's drag. Its OWN field rather than a magnitude on bloomSlowT: that window is refreshed
    // every frame a body stands in a cloud, so a shared field would let any bloom hold the heavier
    // ballast number alive for the cloud's whole duration.
    const dragMul = (e.dragT || 0) > 0 ? (1 - BALLAST_DRAG) : 1
    // THE OIL STAIN (v7.x, The Wreck). Unlike every other term here it is not a WINDOW — `oiled`
    // is a fraction the body keeps for the rest of its life, capped at OIL_STAIN_MAX. Applied at
    // this one site rather than in stepPrey so it reaches every movement machine at once; a
    // stained moray is as slow as a stained mackerel, which is what "the oil got on it" means.
    const oilMul = 1 - Math.min(OIL_STAIN_MAX, e.oiled || 0)
    const slowMul = (1 - elSlow(run, e)) * bloomMul * dragMul * oilMul  // 1.0 slow IS the freeze; no separate branch

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
    // guard flag (The Surf's Shore Crab): windows it guarded <-> open. Nothing about its MOVEMENT
    // changes — unlike a ghost, a guarding crab keeps walking at you — so this site only advances
    // the clock. The damage refusal lives in dealDamage, keyed off e.guarding.
    if (e.flags && e.flags.includes('guard')) stepCrabGuard(run, e, dt)
    // inkjet / puffup (v7.x The Wreck's squid and pufferfish). Both sit here beside `guard` for the
    // same reason it does: they advance a CLOCK and nothing about the movement resolution below
    // changes shape. The squid's cloud is laid from here; the puffer's refusal lives in guardBlocks
    // and its drift is one multiplier inside stepPrey, both keyed off the published `puffT`.
    if (e.flags && e.flags.includes('inkjet')) stepInkjet(run, e, dt)
    if (e.flags && e.flags.includes('puffup')) stepPuffUp(run, e, dt)
    // Status effects (v5.4, see state.js): enrage is a plain speed multiplier; fear and stun
    // REPLACE the movement outright below. All guarded — other chapters never set these.
    const enrageMul = (e.enrageT || 0) > 0 ? FLASHLIGHT_SPEED_MUL : 1
    flagSpeedMul *= enrageMul

    // Movement resolution, most-overriding first. stun/fear beat every behavior flag (a panicking
    // or stunned animal doesn't run its hunting routine); the flag machines REPLACE the normal
    // seek for everyone else; the plain seek runs for the rest. slowMul (chill/freeze) applies
    // throughout. Machines take the seek target, so lured foes run their routine at the decoy.
    if ((e.stunT || 0) > 0) {
      // stunned (hydrant launch / roar stagger / the Vase's daze): no seek at all — knockback still
      // carries it below.
      //
      // A COMMITTED DASH IS CANCELLED HERE, NOT PAUSED, and that distinction is the whole bug this
      // branch used to have. Suppressing the movement is not enough: stepDashBurst simply stops
      // being CALLED while the stun holds, so _dashPhase stays 'dash' and _dashT freezes wherever
      // it was. Measured against a Silt Veil daze on The Shelf's flounder, back when it carried
      // dashBurst (it walks as of 2026-08-22, so re-measure on any other carrier) -- 1.4s stunned with
      // dashT pinned at 0.350, then the body resumed the FULL 0.35s lunge at 299px/s on the heading
      // it had locked before the daze, closing 280px. The daze delayed the hit and never denied it,
      // which is the owner's report from play (2026-08-22): "the stilt cloud doesn't stun dashers
      // during their dash. It should stop their dash."
      //   Rewound to a FULL idle rather than to 0, so the cost is the whole wind-up: the daze buys
      // the player the dodge AND the re-approach, which is what a control card is sold as.
      // `restMul` is read the same way stepDashBurst reads it -- taking DASH_IDLE_T bare here would
      // be the silent half-override its own comment warns about.
      //   ⚠ ONLY dashBurst. The five other commit machines (diveBomb, pounce, lineCharge, strafe,
      // aerialStrike) have the identical pause-and-resume behaviour and are LEFT ALONE on purpose:
      // cancelling those is a stun buff in five other chapters that nobody has measured. If that is
      // wanted, it is one line each here and a census run per chapter, not a drive-by.
      if (e._dashPhase === 'dash') {
        e._dashPhase = 'idle'
        e._dashT = DASH_IDLE_T * (e.dash?.restMul ?? 1)
      }
    } else if ((e.fearT || 0) > 0) {
      // feared (chitter shriek): flee — the seek direction, inverted, at FEAR_SPEED_MUL.
      if (d > 1e-6 && slowMul > 0) {
        e.x -= (dx / d) * e.speed * FEAR_SPEED_MUL * slowMul * dt
        e.y -= (dy / d) * e.speed * FEAR_SPEED_MUL * slowMul * dt
      }
    } else if (passiveCrowd) {
      // THE CROWD IGNORES YOU (v7.x, The Reef -- CHAPTERS[].passiveCrowd). It does not know you are
      // there: no seek, no machine, just its own swim DOWN the lane while you advance up it, so it
      // streams past and the astern sweep takes it out the back. Closing speed is the scroll PLUS
      // its own, which is the whole of "pass by" -- a body that merely stopped seeking would sit
      // still in the water and read as dead.
      //   ABOVE every behaviour machine and below stun/fear, exactly where skittish sits and for
      // the same reason: a fish that is not hunting you is not running its hunting routine either.
      // That placement is what makes the roster's latch and pounce inert here without deleting
      // them -- the chapter is one boolean away from its combative self.
      if (slowMul > 0) e[laneAx.fwd] -= laneAx.dir * e.speed * slowMul * dt
      //   AND THE POINT THE DRAWING READS. render.js derives every body's bearing from run.player
      // unless _tgtX/_tgtY says otherwise, so without these two lines the whole crowd swims down
      // the lane with its eyes locked on you — crabbing sideways, tail first, which is precisely
      // the picture the ally, the prey and the blind each needed this same pair to fix. Publishing
      // into the shipped contract field rather than teaching render a new one (CLAUDE.md), and
      // render's facesOwnHeading gains the chapter so it knows to read it.
      e._tgtX = e.x - (laneAx.fwd === 'x' ? laneAx.dir * 100 : 0)
      e._tgtY = e.y - (laneAx.fwd === 'y' ? laneAx.dir * 100 : 0)
    } else if (e.flags && e.flags.includes('skittish')) {
      // PREY (v7.x, The Wreck). The one branch in this chain that walks AWAY from the player.
      // Sits directly under fear because it is the same motion for a different reason — fear is a
      // status a weapon applied, this is what the animal IS — and above every behaviour machine
      // because a fish that is running is not also running its hunting routine.
      stepPrey(run, e, dx, dy, d, dt, slowMul, baited)
    } else if (e.flags && e.flags.includes('dashBurst')) {
      // affixSpeedMul is passed through (unlike the other machines, which take enrageMul alone)
      // because dashBurst used to ride the plain seek and therefore honoured pacer/frenzy. Keeping
      // it means this change commits the DIRECTION and nothing else — no silent balance shift.
      stepDashBurst(run, e, tx, ty, dt, slowMul, affixSpeedMul * enrageMul)
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
      stepMarch(e, tx, ty, dt, slowMul, enrageMul, laneAx)
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
    // Silt Veil's daze window. Armed at APPLICATION (see SILT_DAZE_REFRACTORY) rather than at
    // expiry, because e.stunT is shared with three other sources and none of them is this one.
    if ((e.dazeCd ?? 0) > 0) e.dazeCd = Math.max(0, e.dazeCd - dt)
    // CC diminishing returns climb back to full over CC_DR_RECOVER seconds of not being controlled.
    if ((e._ccDR ?? 1) < 1) e._ccDR = Math.min(1, (e._ccDR ?? 1) + dt / CC_DR_RECOVER)
    // A tank's knockback window (see claimKb). Armed on APPLICATION, unlike fear's — the thing being
    // capped here is how often a shove may LAND, and a shove is instantaneous, so there is no
    // duration to expire at.
    if ((e._kbCd ?? 0) > 0) e._kbCd = Math.max(0, e._kbCd - dt)
    if (e.stunT > 0) e.stunT = Math.max(0, e.stunT - dt)
    if (e.enrageT > 0) e.enrageT = Math.max(0, e.enrageT - dt)
    if (e.bloomSlowT > 0) e.bloomSlowT = Math.max(0, e.bloomSlowT - dt) // v6.4: refreshed by stepBlooms while inside a cloud
    // Squid Ink's blind. Refreshed by stepBlooms while inside the ink, decayed here for the reason
    // scentT's note below gives: stepBlooms only walks the bodies currently in a cloud, so a body
    // that swims out would otherwise keep the mark for the rest of the run.
    //   THE HELD HEADING IS CLEARED ON THE FRAME THE BLIND EXPIRES, and that line is the whole
    // re-blind story: without it a second cloud would resume the FIRST cloud's heading, and a body
    // blinded twice would swim a direction it has not had for ten seconds.
    if (e.blindT > 0) {
      e.blindT = Math.max(0, e.blindT - dt)
      if (e.blindT === 0) { e._blindHx = undefined; e._blindHy = undefined }
    }
    if (e.dragT > 0) e.dragT = Math.max(0, e.dragT - dt) // Ballast's impact drag; set once at the landing, never refreshed
    // The Wreck's Chum. Set ONCE when a serving is taken (stepLures) and never refreshed by
    // standing in the cloud — a hold that re-armed every frame would pin the shoal on the bait
    // for the bait's whole duration, which is a stasis field, not a mouthful.
    if (e.feedT > 0) e.feedT = Math.max(0, e.feedT - dt)
    // v7.x The Deep: refreshed by stepScent while inside the smell, exactly as bloomSlowT is by
    // stepBlooms. The decay HAS to live here and not in stepScent — stepScent only walks the bodies
    // currently in range, so a body that swims OUT of the radius would otherwise keep the mark, and
    // its damage amp, for the rest of the run.
    if (e.scentT > 0) e.scentT = Math.max(0, e.scentT - dt)

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
        // DEFERRED: this runs inside stepEnemyMovement's own `for (const e of run.enemies)`, so an
        // immediate push is visited by that very walk and the minion moves on its birth frame.
        // The cap counts the queue as well, or a van would re-fill it every frame from behind.
        for (let i = 0; i < SPAWNER_COUNT
             && run.enemies.length + (run._spawnQueue?.length ?? 0) < maxAliveFor(run.mods); i++) {
          const a = Math.random() * Math.PI * 2
          const sd = Math.random() * SPAWNER_SCATTER
          const sx = e.x + Math.cos(a) * sd
          const sy = e.y + Math.sin(a) * sd
          const spawned = spawnEnemy(run, { type: ARCHETYPE_TYPE[SPAWNER_ARCHETYPE], x: sx, y: sy, forceNormal: true, deferred: true })
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
          dealDamage(run, e, Math.max(SNAP_TRAP_DMG * 2, e.maxHP * POUNCE_TRAP_HP_FRAC), false, false, true)
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
function stepDashBurst(run, e, tx, ty, dt, slowMul, spdMul) {
  // Resolved ONCE, at the top, and used at all FOUR places a phase timer is set below. The globals
  // are the default; a roster entry may soften its own creature without touching the other four
  // chapters' dashers (see e.dash in spawnEnemy, and the Sea Roach's entry in config.js). Reading
  // DASH_IDLE_T directly anywhere in here would be a silent half-override — the off-screen rewind
  // in particular, which is the one furthest from the declaration and the easiest to miss.
  const idleT = DASH_IDLE_T * (e.dash?.restMul ?? 1)
  const dashT = DASH_T * (e.dash?.lenMul ?? 1)
  // spdMul softens the LUNGE ITSELF, and only the lunge — never the idle, and never the off-screen
  // walk-in below, which has to stay at full speed or the crowd crawls out of sight for seconds (the
  // DASH_* block in config.js measures that). It multiplies with lenMul rather than replacing it, so
  // a creature carrying both travels lenMul x spdMul of the distance, not lenMul of it.
  const dashSpdMul = DASH_SPEED_MUL * (e.dash?.spdMul ?? 1)
  if (e._dashPhase === undefined) { e._dashPhase = 'idle'; e._dashT = idleT }
  e._dashT -= dt
  const dx = tx - e.x, dy = ty - e.y
  const d = Math.hypot(dx, dy) || 1
  const ux = dx / d, uy = dy / d
  let vx = 0, vy = 0
  if (e._dashPhase === 'idle') {
    // Off screen it does not idle and it does not commit — it WALKS IN, at full speed, and the idle
    // clock is wound back to the top so the whole wind-up happens where the player can see it. See
    // the DASH_* block in config.js for both halves of why (the v6.6.24 visibility rule, and why
    // idling out of sight at 0.4x would be worse than the bug it fixes).
    const seen = canCommitFrom(run, e)
    const spd = e.speed * spdMul * (seen ? DASH_IDLE_SPEED_MUL : 1)
    vx = ux * spd; vy = uy * spd
    if (!seen) {
      // HELD at the top of the clock while out of view, not merely rewound when it expires there.
      // The difference is the whole tell. Rewinding on expiry leaves an arbitrary remainder on the
      // timer, so a body that walks into view with 0.02s left lunges essentially on arrival — which
      // is the "arrives already on you" complaint the gate was added to answer, surviving the gate.
      // Holding it means entering view always buys the player a FULL wind-up to read.
      e._dashT = idleT
    } else if (e._dashT <= 0) {
      // lock the heading on the way OUT of idle — this is the last moment it looks at you
      e._dashPhase = 'dash'; e._dashT += dashT; e._dashDirX = ux; e._dashDirY = uy
    }
  } else {
    const spd = e.speed * spdMul * dashSpdMul
    vx = e._dashDirX * spd; vy = e._dashDirY * spd
    if (e._dashT <= 0) { e._dashPhase = 'idle'; e._dashT += idleT }
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
// CROSS coordinate (not its id and not Math.random), so every invader in a rank spawned across the
// same row shares a phase relationship and the block reads as ONE marching formation rather than a
// crowd of individuals wobbling.
// v5.19: it now also CONVERGES on the player ACROSS the lane, but at MARCH_HOME_MUL of its march
// speed — roughly a seventh of the player's strafe. That keeps the original contract intact: a rank
// is still always dodgeable by anyone who commits to a gap (which is what makes LANE_LEAK_DMG a fair
// punishment), it just no longer slides harmlessly past a player who stands still. The homing is
// deliberately CROSS-only; steering the descent too would make ranks converge into a column and
// destroy the formation read.
// v7.x: `ax` (laneAxes, config.js) is which axis all of that runs on — 'down the lane' is -ax.dir.
function stepMarch(e, tx, ty, dt, slowMul, spdMul, ax) {
  const tCross = ax.cross === 'x' ? tx : ty
  if (e._marchPhase === undefined) e._marchPhase = e[ax.cross] * 0.01
  e._marchPhase += MARCH_SWAY_RATE * dt
  const spd = e.speed * spdMul * MARCH_SPEED_MUL
  e[ax.fwd] += -ax.dir * spd * slowMul * dt
  const hx = tCross - e[ax.cross]
  // Deadband: without it a rank sitting on the player's column jitters across it every frame.
  if (Math.abs(hx) > 1) e[ax.cross] += Math.sign(hx) * spd * MARCH_HOME_MUL * slowMul * dt
  e[ax.cross] += Math.cos(e._marchPhase) * MARCH_SWAY_PX * MARCH_SWAY_RATE * slowMul * dt
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
  // roster.phase.solidMul (config.js): per-creature override of the SOLID half only, because the
  // constants are shared with the pond's Tardigrade. Used at BOTH sites — the spawn scatter as
  // well as the flip — since scattering across the old window would bunch a long-solid wave into
  // the first third of its own cycle.
  const solidT = PHASE_SOLID_T * (e.phase?.solidMul ?? 1)
  if (e._phaseSolid === undefined) { e._phaseSolid = true; e._phaseT = Math.random() * solidT }
  e._phaseT -= dt
  if (e._phaseT <= 0) {
    e._phaseSolid = !e._phaseSolid
    e._phaseT += e._phaseSolid ? solidT : PHASE_GHOST_T
  }
}

// guard (The Surf's Shore Crab): alternates guarded <-> open forever on guarding/_guardT, phase
// randomised at spawn so a pack does not raise in unison. See the CRAB_GUARD_* block in config.js
// for the rulings this implements.
//
// `guarding` and `guardAngle` are PUBLISHED CONTRACT FIELDS, not private state, and that is why
// they are named without an underscore: render.js reads both by name — `guarding` picks the pose
// through ROSTER_LOOKS.shorecrab.poseOf, `guardAngle` turns the body through faceDir. A guard kept
// in a private `_guarding` would step, refuse damage, and be completely invisible on screen, which
// is indistinguishable from the weapon being broken. (The v7.5x elements redesign shipped exactly
// that bug with `_elFrozen`.)
//
// The bearing is LATCHED on the raise and held for the window — see the arc note in config.js for
// why an arc that re-aims every frame is not an arc at all.
function stepCrabGuard(run, e, dt) {
  if (e.guarding === undefined) {
    // Always start OPEN: a crab that spawned mid-guard would be untouchable from the instant it
    // appeared, before the player could even read it.
    e.guarding = false
    // ...but randomise the first window across the WHOLE CYCLE, not across the open window alone.
    // Offsets drawn from [0, CRAB_OPEN_T) span only half the period, so every crab's state is the
    // same function of time shifted by less than half a cycle — and the pack RE-SYNCHRONISES on a
    // timer: at t = CRAB_OPEN_T every one of them is guarded together, whatever it drew. Run US.i
    // part (e) caught exactly that, sampling at 10s. Drawing from the full cycle is the fix, and
    // costs one longer opening window.
    // The tardigrade's `phase` flag has this same shape (`_phaseT = Math.random() * PHASE_SOLID_T`
    // against a SOLID_T + GHOST_T cycle) and therefore the same periodic lockstep. Left alone here
    // deliberately — it is a different chapter's tuned creature and not this change's business.
    e._guardT = Math.random() * (CRAB_GUARD_T + CRAB_OPEN_T)
  }
  e._guardT -= dt
  if (e._guardT > 0) return
  e.guarding = !e.guarding
  e._guardT += e.guarding ? CRAB_GUARD_T : CRAB_OPEN_T
  // Latched on the raise, and only on the raise.
  if (e.guarding) e.guardAngle = Math.atan2(run.player.y - e.y, run.player.x - e.x)
  // No event for the raise itself: the pose swap and the body squaring up ARE the telegraph, and an
  // event nothing consumes is dead weight. `guardblock` (dealDamage) is the one that must exist,
  // because a shot that produces nothing at all reads as a broken weapon.
  // NO SOUND for either, deliberately: a block fires on every refused hit, which for a fast weapon
  // is several a second, and SFX_FOR_EVENT is for events rare enough to bear one.
}

// inkjet (v7.x The Wreck's squid): a cloud laid at the squid's own position when the player closes
// inside INK_TRIGGER_R, on a per-fish cooldown. See the INK_* block in config.js for why it slows
// the PLAYER and nothing else, and why the cooldown rather than the radius is what stops a field of
// squid becoming a wall.
//
// ⚠ IT IS A run.blooms ENTRY, NOT A NEW ARRAY. Everything the cloud needs — the grow curve, the
// expiry filter, a per-look tint and a pool reset() already clears — is on that array, which is
// also why nothing has to be added to clearWorld or to syncPool for this (run CP).
//   `slow: 0` opts OUT of stepBlooms' enemy slow, deliberately: an ink that also held the shoal
// still would be a gift to the player, and the whole point is that it costs them the fish they were
// already going to reach.
function stepInkjet(run, e, dt) {
  e._inkCd = (e._inkCd ?? 0) - dt
  if (e._inkCd > 0) return
  const dx = run.player.x - e.x, dy = run.player.y - e.y
  if (dx * dx + dy * dy > INK_TRIGGER_R * INK_TRIGGER_R) return
  e._inkCd = INK_COOLDOWN
  run.blooms.push({
    x: e.x, y: e.y, t: 0, r: 0, maxR: INK_R, dur: INK_DUR,
    dmgPerTick: 0, tick: 0, look: 'inkjet', slow: 0,
  })
  // The cloud fades UP over BLOOM_GROW_FRAC of its life, which is far too slow to read as a squirt.
  // The event is the squirt; the bloom is what is left of it.
  run.events.push({ type: 'inkjet', x: e.x, y: e.y, r: INK_R })
}

// puffup (v7.x The Wreck's pufferfish): inflate when the player closes, refuse ONE bite, then drift
// deflating for PUFFER_COOL_T. See the PUFFER_* block in config.js for the two ways the moray's
// `guard` failed in this chapter and how each is answered here.
//
// `puffT` IS A PUBLISHED CONTRACT FIELD — no underscore, exactly as `guarding` carries none — and
// ROSTER_LOOKS.pufferfish.poseOf (render.js) reads it by name to swap to the inflated ball. A
// private `_puffT` would refuse a bite with nothing whatsoever on screen, which is the `_elFrozen`
// failure CLAUDE.md records shipping to the live URL.
//   THE INFLATION IS A CAP, NOT A DURATION. The first refused hit ends it early (guardBlocks), so
// this timer only covers the puffer nobody bit — without it a fish that inflated once would be a
// ball forever while the player stood near it.
function stepPuffUp(run, e, dt) {
  if ((e.puffT ?? 0) > 0) {
    e.puffT = Math.max(0, e.puffT - dt)
    if (e.puffT === 0) e._puffCd = PUFFER_COOL_T
    return
  }
  e._puffCd = (e._puffCd ?? 0) - dt
  if (e._puffCd > 0) return
  const dx = run.player.x - e.x, dy = run.player.y - e.y
  if (dx * dx + dy * dy > PUFFER_TRIGGER_R * PUFFER_TRIGGER_R) return
  e.puffT = PUFFER_PUFF_T
}

// Is this enemy refusing direct damage right now?
//
// THE SOURCE OF A HIT IS THE PLAYER'S OWN POSITION, not the projectile's. dealDamage has no source
// argument and threading one through all 26 damage sites would be a far larger and riskier change
// than this mechanic is worth — but more importantly the player's position is the RIGHT source,
// because it is the thing the player controls and the thing the counter is about. "Get round its
// side" has to be answerable by moving, and a shot fired from where you used to be standing is an
// edge case nobody can see. Where a weapon's projectile physically is does not enter into it.
function guardBlocks(run, e, dot) {
  // Hoisted above the crab test so the pufferfish can share it. Behaviour-neutral for the crab:
  // both orders answer false for a DoT tick on an open crab, which is the only case that moves.
  if (dot) return false          // burns, bleeds and poisons go straight through — the counter
  // THE PUFFERFISH, AND IT REFUSES EXACTLY ONE HIT (v7.x The Wreck). Ending the inflation HERE
  // rather than on stepPuffUp's timer is what keeps this a beat instead of a shield, and it is the
  // direct answer to the moray `guard` post-mortem in CHAPTERS.wreck.roster: a body that can only
  // ever eat one bite before it is food again cannot soak a third of the jaw's aim.
  //   `guardAngle` is published as the bearing the refusal happened on, which is the field the
  // `guardblock` event already carries and render.js already throws its sparks along. A second
  // angle field would be one fact in two places for a three-particle burst.
  if ((e.puffT ?? 0) > 0) {
    e.puffT = 0
    e._puffCd = PUFFER_COOL_T
    e.guardAngle = Math.atan2(run.player.y - e.y, run.player.x - e.x)
    return true
  }
  if (!e.guarding) return false
  if (e.guardAngle == null) return false
  const d = Math.atan2(run.player.y - e.y, run.player.x - e.x) - e.guardAngle
  return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) <= CRAB_GUARD_ARC
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
  // LAST BREATH's other half (v7.x, The Reef). Every player-damage path in this file funnels here,
  // which is the whole reason the card is two lines instead of a multiplier at sixteen call sites —
  // and it is also why the DROWN tick is doubled along with everything else. That is deliberate,
  // not an oversight: the card sells damage for an empty bar, and exempting the drowning would make
  // it a free ramp for the exact play it exists to make dangerous.
  //   Applied to rawDmg, BEFORE armor, contactDmgTakenMul and HURT_CAP_FRAC, so it composes the way
  // every other incoming multiplier does and stays under the one-shot cap on the non-dot side.
  if (run.anomalies?.lastBreath && run.chargeMax > 0 && run.charge <= 0) rawDmg *= LAST_BREATH_DROWN_TAKEN_MUL
  const dmg = dot
    ? Math.max(1, Math.round(rawDmg))
    // v6.3.4 anti-turtle: HURT_CAP_FRAC caps a single non-dot hit so multiplicative sources
    // (glass, difficulty, late-run dmgScale, enrage) can't compose past a one-shot.
    : Math.min(Math.round(p.maxHP * HURT_CAP_FRAC), Math.max(1, Math.round((rawDmg - run.passives.armor) * run.mods.contactDmgTakenMul)))
  p.hp -= dmg
  if (!dot) p.invuln = PLAYER.invulnTime
  run.events.push({ type: 'hurt', dmg, dot, src })
  // v7.x damage attribution (run.dmgBySrc / run.killedBy — see state.js's doc block). This is the
  // one funnel EVERY player-damage path already goes through, which is why the whole feature is
  // three lines here rather than an accumulator at each of the sixteen call sites.
  // TALLIES `dmg`, NEVER `rawDmg`: armor, contactDmgTakenMul and HURT_CAP_FRAC have all already been
  // applied above, so this is HP the player actually lost and the summary's percentages add up to
  // what the health bar really did. The enemy-side `hit` event does the opposite — it carries the raw
  // swing and credits overkill in full, which is the documented reason weapon-census diffs hp
  // instead (CLAUDE.md). Do not "fix" this to match it.
  // `?? 'unknown'` is a real bucket, not a guard: it means a caller was added without a label, and a
  // visible "Unknown" row on the summary screen is the cheapest possible way to notice that. Run DA
  // asserts the bucket stays empty over a full run, so it cannot rot quietly.
  if (dmg > 0) {
    const tally = (run.dmgBySrc ??= {})
    const srcKey = src ?? 'unknown'
    tally[srcKey] = (tally[srcKey] ?? 0) + dmg
  }
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
    // v7.x: what killed you, for the summary screen. Set HERE and only here — below the revive
    // branch above, so surviving on a Revive Token does not record a death, and on the same
    // statement as the phase flip, so nothing landing later in the frame can overwrite it (several
    // step functions deliberately keep going after a death to finish their own iteration).
    run.killedBy = src ?? 'unknown'
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

// Does this enemy shrug off weapon crowd control OUTRIGHT — the sector sweeps' knockback, a nova's
// knockback, and fear? ONE source: the `anchored` ELITE AFFIX. A roster tank is never immune; it
// resists, through ccResist below (owner ruling 2026-08-17, see UNSHAKEABLE_CC_MUL in config.js —
// the same ruling elNeverFreezes already applies to freeze). Deliberately narrower than
// `anchored`'s other uses — this does NOT exempt an enemy from hole pull, the straggler teleport,
// traffic or a hydrant launch, which are hazards rather than crowd control. See FEAR_REFRACTORY.
function resistsCC(e) {
  return !!(e.affixes && e.affixes.includes('anchored'))
}

// The `unshakeable` ROSTER FLAG, one tank per chapter: how much of a landed control is it worth?
// A per-enemy property of the creature, NOT a charge against the CC-DR budget — which is why it is
// a plain multiplier readable at any site, including the nova carry that deliberately opts out of
// ccScale. Never returns 0: that is the whole ruling.
function ccResist(e) {
  return (e.flags && e.flags.includes('unshakeable')) ? UNSHAKEABLE_CC_MUL : 1
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
  return dr * ccResist(e) * (run.player.ccMul ?? 1)
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

// May this tank be MOVED right now? TEST-AND-ARM: it opens the window as it grants it, so the two
// halves cannot drift apart at a second call site. Knockback only — a tank inside its window still
// takes the damage, the fear and the stun of every hit that lands on it.
//
// This is FEAR_REFRACTORY's shape applied to the second status, and for the same reason: CC_DR
// prices each application but nothing prices the CADENCE, so a shove small enough to be "fair" per
// hit still walks a slow body off the screen when it lands often enough. Capping by the ENEMY's own
// timer is what makes the fix independent of fire rate. See TANK_KB_REFRACTORY for the measurements.
//
// TANKS ONLY, and that is the whole scope: the threshold this defends is shove-px / speed, and only
// the tank archetype is slow enough to lose the race at a cadence a player can actually reach.
function claimKb(e) {
  if (TYPE_ARCHETYPE[e.type] !== 'tank') return true
  if ((e._kbCd ?? 0) > 0) return false
  e._kbCd = TANK_KB_REFRACTORY
  return true
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
  // PREY (v7.x, The Wreck). The other half of `skittish`, and it is one design fact rather than two:
  // this is food. It runs from you (stepPrey) and it cannot hurt you, ever, in any state.
  // THIS LINE IS WHY THE ROSTER'S `dmgMul: 0` IS NOT ENOUGH ON ITS OWN — hurtPlayer floors a hit at
  // Math.max(1, ...), so a zero-damage fish would still take 1 HP off you every time you swam
  // through one, and this chapter puts 600 of them on the map.
  // Contrast the fear clause below, which was DELETED in v7.16 for making a machine-gun lock: a
  // status any build could apply field-wide had to stop disarming, but a roster flag cannot be
  // stacked, refreshed or spread, so the same rule does not apply to it.
  if (e.flags && e.flags.includes('skittish')) return true
  // ZERO CONTACT DAMAGE MEANS ZERO. hurtPlayer floors every hit at Math.max(1, ...), so a roster
  // that declares `dmgMul: 0` still took 1 HP per touch — the moray did 204 damage across three
  // 300s runs that way, against the leak's 234, in the chapter built on the leak being the only
  // thing that can kill you. `dmgMul: 0` is declared by nothing outside The Wreck's roster, so this
  // changes that chapter and no other.
  if ((e.dmg ?? 0) <= 0) return true
  // v7.16: STUN still disarms, FEAR no longer does. A feared enemy runs from you, but one pinned
  // against the crowd behind it is still a threat — half of the machine-gun lock was that a
  // permanent field-wide fear made every enemy on screen literally unable to touch you.
  if ((e.stunT || 0) > 0) return true
  // Anything the WATER COLUMN has hold of. Owner from play, 2026-08-22. The Downwash lands on the
  // densest clump within DOWNWASH_CAST_FRAC of the viewport and drags it inward, so the card's own
  // gather was scraping the player who cast it — a weapon that hurts you for using it correctly.
  // Scoped by _holeLook and NOT by holePull alone: the Black Hole shares run.holes, and disarming
  // everything inside one would turn a Book 1 weapon into a safe bubble nobody asked for.
  // THE TELL IS THE COLUMN, not the body: the drawn zone is what says nothing in here can reach
  // you, which is why this reaches the rim (any pull at all) instead of waiting for the sprite's
  // ragdoll spin to be visibly fast.
  if ((e.holePull || 0) > 0 && e._holeLook === 'downwash') return true
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
    // v7.x: the src label is the ENEMY'S OWN roster id, which is what makes "killed by a Sea Roach"
    // possible at all. Falls back to the archetype ('normal'|'fast'|'tank'|'wisp') for a spawn with
    // no roster entry — chapter rosters are complete today, but formations and the scripted chapter
    // can both put an enemy on the field, and an honest "Tank" beats an "Unknown" row. Elite status
    // is deliberately NOT in the key: it would double every bucket to distinguish a modifier the
    // player already saw, and the summary wants "what killed me", not a damage-source taxonomy.
    return hurtPlayer(run, dmg, false, e.rosterId ?? e.type) // one hit per frame; invuln now active either way
  }
  return false
}

// -- Pools: acidPool/soapTrail elite flags (v5.0) -------------------------------------
// Shared array + step for both flags (see run.pools in state.js) — pools only ever damage the
// PLAYER, ticked at STATUS_TICK cadence like the enemy DoTs (see applyIgnite below).
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
      if (!playerDied && hurtPlayer(run, pool.dps * STATUS_TICK, true, 'pool')) playerDied = true
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
  const tide = CHAPTERS[run.chapter].tide
  if (!tide) return { fx: 0, fy: 0 }
  const s = Math.sin((run._realTime / tide.period) * Math.PI * 2)
  // Spring Tide turns the whole field up (tideSurgeMul), the same way Riptide does the pond's.
  // Applied HERE and nowhere else: stepTide and render.js both read this function, so one multiply
  // keeps "the water moved me" and "the water is moving" the same number under the mutator too.
  const surge = tide.surge * run.mods.tideSurgeMul
  return { fx: Math.cos(tide.axis) * surge * s, fy: Math.sin(tide.axis) * surge * s }
}

export function stepTide(run, dt) {
  if (!CHAPTERS[run.chapter].tide) return
  const { fx: sx, fy: sy } = tideForce(run)
  const fx = sx * dt
  const fy = sy * dt
  // The PLAYER's share only (BOOK_SHOP.undertow.currentResist, "Current Resistance"). The crowd
  // below keeps the full push on purpose: water that shoves only the player is a control tax, and
  // the crowd drifting with you is the tell that the water did it. A player who has bought the line
  // holds their line through a surge the swarm is still riding — which is the fantasy, and it is
  // also why this multiply is here and not inside tideForce, where render.js would read it and the
  // streaks would slow down to match a purchase nobody made to the water.
  const p = run.player
  p.x += fx * run.currentResistMul; p.y += fy * run.currentResistMul
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
// THE SALT REGISTRY. Every streamed field takes its own block, and a collision is SILENT — two
// fields land in exactly the same cells, which reads as "the mechanic spawns on top of the other
// one" and never as an error. Claimed so far:
//   0-4   streamObstacles (occupancy, radius, x, y, kind)
//   11-14 streamEddies     15-17 streamTraps
//   20-23 refill circles: The Twilight's shafts, The Surf's tide pools (streamShafts' default)
//   30-32 streamSandbars
//   40-43 refill circles: The Reef's air pockets (CHAPTERS.reef.signature.pockets.salt)
//   44-46 The Reef's spur field (CHAPTERS.reef.spurs.salt): 44/45 the two channel widths, 46 the
//         ridge's own thickness (spurs.thickVar).
// Next free block: 47+ (5-10, 18-19, 24-29 and 33-39 are free too, between claimed ranges).
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

// -- Refill circles (v7.x Book 2: Shelf sun shafts, Surf tide pools, Reef air pockets) -
// The fourth copy of streamObstacles' streaming idiom (obstacles -> eddies -> traps -> here): own
// cell size (spec.cell), own _shaftCellI/_shaftCellJ cursor independent of the other three, same
// run._obstacleSeed, same OBSTACLE_STREAM_RADIUS/OBSTACLE_DROP_RADIUS. Its salt block comes from
// the SPEC (spec.salt, default 20 — see the s0 note below): 20-23 for the shafts and the pools,
// 40-43 for the air pockets, so a roll here can never collide with an obstacle's (0-4), an eddy's
// (11-14), a trap's (15-17) or a sandbar's (30-32) at the same cell. ZERO Math.random() at step
// time - the same hard rule all three others state (the AA.c/runStarOnly scar).
//
// GENERALISED (v7.x, run US.c) to feed run.shafts from any chapter's signature via refillSpec()
// (config.js): a `shafts` signature IS its own refill spec (refillSpec returns it unchanged — asserted by
// identity, because the Shelf's tune was measured against that exact object), while The Surf's tide
// pools live at signature.pools and The Reef's air pockets at signature.pockets. Same cell/hash-salt
// geometry every time, so a pool, a pocket and a shaft are mechanically the same circle with
// different names and different art; only a `shafts` signature carries drift, and TWO chapters
// declare one now — The Twilight and The Shelf
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
// WHERE A REFILL CIRCLE IS, AS A PURE FUNCTION OF ITS CELL — the single definition of the field's
// geometry, so a second field can ask about it without materialising it. Returns null when the cell
// holds no circle at all (occupancy roll, or the spawn-ring clearance), which is why the caller can
// treat "no return value" as "nothing here" rather than having to re-run the gates itself.
//
// THE SALT BLOCK IS THE SPEC'S, NOT THIS FUNCTION'S (v7.x, The Reef). One streamer serves three
// chapters' refill circles, and a salt is what keeps a field from landing in the same cells as
// another field — so it has to be a property of the FIELD, not of whichever function happens to
// materialise it. Defaults to 20 so the shaft fields and The Surf's pools keep the exact block the
// registry above records for them (and their tunes, which were measured against those hashes, come
// out bit-identical); The Reef's air pockets declare 40, the block reserved for them.
//
// The two gates it does NOT apply are the two that are about the OBSERVER rather than the field:
// the lane clamp (which needs the run's viewRadius) and the streaming radius (which needs the
// player). Both live in streamShafts. So a circle this returns is one that exists in the world; the
// caller decides whether it is close enough to care about.
export function refillCircleAt(i, j, seed, spec) {
  const s0 = spec.salt ?? 20
  if (obstacleCellHash(i, j, seed, s0) >= spec.chance) return null
  const cs = spec.cell
  // Jitter slack subtracts driftAmp, which the non-drifting fields have no reason to do: their
  // circles never move, so they may spend the whole cs/2 - r - 20 budget on jitter. Where a field
  // drifts, jitter and drift share it, and the sum has to stay inside the cell.
  const slack = Math.max(0, cs / 2 - spec.r - 20 - (spec.driftAmp ?? 0))
  const x = (i + 0.5) * cs + (obstacleCellHash(i, j, seed, s0 + 1) - 0.5) * 2 * slack
  const y = (j + 0.5) * cs + (obstacleCellHash(i, j, seed, s0 + 2) - 0.5) * 2 * slack
  if (Math.hypot(x, y) < spec.minDist) return null // spawn-ring clearance from the run ORIGIN
  // Drift phase from the cell hash, so two neighbouring shafts are never in lockstep and the whole
  // field does not pulse in unison. Stored by the caller, not re-derived, because x/y are recomputed
  // every frame and a per-frame hash would be the one avoidable cost in that loop.
  const c = { x, y, r: spec.r, phase: obstacleCellHash(i, j, seed, s0 + 3) * Math.PI * 2 }
  // Lobed outline, opt-in per FIELD (see LOBE_SHAPES). The Twilight's sun shafts and The Reef's air
  // pockets stay circles deliberately — a column of light and a trapped bubble are both round
  // things. The Surf's tide pools are a hole in the ground and The Shelf's upwellings are clean
  // water pushing through silt, and neither has an edge a circle would describe. Both fields are
  // stored, never re-derived: render draws the outline from them and the sim tests position against
  // them, and a second derivation is how the two would drift apart.
  if (spec.blob) {
    c.shape = Math.floor(obstacleCellHash(i, j, seed, s0 + 4) * LOBE_SHAPES.length) % LOBE_SHAPES.length
    c.rot = obstacleCellHash(i, j, seed, s0 + 5) * Math.PI * 2
  }
  return c
}

export function streamShafts(run) {
  const sig = CHAPTERS[run.chapter].signature
  const spec0 = refillSpec(sig)
  if (!spec0) return
  // DEAD WATER (the shelf's mutator) thins the field, and it has to do it HERE rather than at
  // refillCircleAt's own roll: the occupancy hash is a pure function of (cell, seed) and taking a
  // run-state multiplier into it would make the field's geometry depend on which mutators were
  // picked, which is exactly the impurity the five streaming fields are all written to avoid.
  // A shallow copy, so cell/r/drawdownSecs stay the spec's own; identity is preserved at x1 so
  // every chapter without the mutator is byte-for-byte unchanged.
  const chanceMul = run.mods?.refillChanceMul ?? 1
  const spec = chanceMul === 1 ? spec0 : { ...spec0, chance: spec0.chance * chanceMul }
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
  // A LANE HAS WALLS, AND A REFILL CIRCLE OUTSIDE THEM IS A LIE (v7.x, The Reef). The streaming
  // grid covers a 1400px disc around the player; the lane is only ~860px wide, so two whole cell
  // rows either side of it materialise circles the player is CLAMPED away from and can only watch
  // scroll past. On the one chapter whose bar has a single refill source that is not scenery, it is
  // the picture of "the bar cannot be filled" — the exact misreading the Surf's own tune block was
  // rewritten to avoid, arrived at from the geometry instead of from the rate. Dropped when WHOLLY
  // outside, so a circle the player can reach the rim of still exists and still counts.
  // Inert for every non-lane chapter, and no lane chapter but this one declares a refill spec.
  const laneCh = CHAPTERS[run.chapter].lane === true
  const lax = laneCh ? laneAxes(CHAPTERS[run.chapter]) : null
  const laneHW = laneCh ? laneHalfWidth(run.viewRadius, CHAPTERS[run.chapter]) : 0
  for (let i = ci - span; i <= ci + span; i++) {
    for (let j = cj - span; j <= cj + span; j++) {
      const key = i + ',' + j
      if (live.has(key)) continue
      const c = refillCircleAt(i, j, seed, spec)
      if (!c) continue
      let bx = c.x, by = c.y
      // A POCKET INSIDE THE WALL IS NOT A POCKET. The refill fields are placed on their own cell
      // grid, which was right when the lane was open water either side of some bars; in a cave most
      // of the cross axis is solid rock, so an unsnapped pocket is simply unreachable and the bar
      // starves. Measured before this: 9.4% of a run spent in a pocket, against a fixture that
      // wants a field worth working.
      //
      // Snapped ONTO the passage at its own position along the lane, and free to sit anywhere
      // across it (owner, 2026-08-24: "they don't have to be touching coral"). It used to be shoved
      // out against a wall so that breathing cost a commitment to one side; the bar is now a
      // pacing device rather than a puzzle, so the pocket takes a hashed cross position and the
      // only clamp is that it stays off the rock.
      const caveSpec = lax && CHAPTERS[run.chapter].cave
      if (caveSpec) {
        const along = lax.fwd === 'x' ? bx : by
        const cav = caveAt(along, caveSpec, seed)
        // Slack, not a fixed offset: at the narrowest squeeze the field makes this collapses to 0
        // and the pocket simply sits on the passage centre, which is the widest it can be and still
        // be swimmable. The centre it is measured against is the one at the POCKET's own position
        // along the lane, and that centre wanders by up to 1.29px per px travelled -- so a pocket
        // near the edge of its slack can still touch a wall a moment later. That is cosmetic now.
        const slack = Math.max(0, cav.hw - spec.r)
        const cross = cav.c + (obstacleCellHash(i, j, seed, (spec.salt ?? 40) + 7) - 0.5) * 2 * slack
        if (lax.cross === 'x') bx = cross; else by = cross
      }
      if (!caveSpec && lax && Math.abs(lax.cross === 'x' ? bx : by) - spec.r > laneHW) continue // see the lane note above
      if (Math.hypot(bx - p.x, by - p.y) > OBSTACLE_STREAM_RADIUS) continue
      run.shafts.push({ x: bx, y: by, bx, by, r: spec.r, phase: c.phase, shape: c.shape, rot: c.rot, _cell: key })
    }
  }
}

// -- Spur and groove (v7.x, The Reef) ------------------------------------------------------------
// THE REEF FRONT, AS THE LEVEL. Spurs are the coral ridges; grooves the sand channels cut through
// them. Both are the real words for the formation, and from directly overhead — this game's only
// camera — that formation IS this chapter's level design (spec 2026-08-20 §2).
//
// A RIDGE IS NOT A WALL. It grates: stepSpurs charges SPUR_DPS while you are inside one and slows
// your strafe, but never touches the forward scroll, so the lane keeps its one promise. Enemies
// pass straight through — that is what makes coral strictly worse than a channel on every axis at
// once (damage, no steering, and the crowd is still on you), which is the whole tension. Rev 3 of
// the spec funnelled the crowd out of the coral instead and INVERTED it: the scrape is under 2 dps
// against a soap trail's 6, so steering the crowd away made coral the cheapest place in the chapter.
//
// ⚠ INDEXED ALONG THE LANE ONLY, and that is not a simplification. A 2-D grid at this spacing is
// 3.98 cells across the lane, and you cannot cut a 140px channel out of a 210px cell. One index
// gives the field a 1-D cursor as well, instead of a full rescan every time a 275+ px/s strafe
// crosses a cross-axis boundary.
//
// PURE, so a second consumer (the air pockets, which ride their groove — spec §5.2) can ask where a
// channel is without materialising anything. Same rule refillCircleAt states for the refill fields.
export function spurAt(i, spec, seed) {
  const f = i * spec.spacing
  // EVERY RIDGE ITS OWN THICKNESS, off the field's third salt. The band this returns is the band the
  // grate charges over (stepSpurs), the band Fire Coral burns (stepPolyps) and the band render.js
  // draws — one number, three consumers — so the reef front can be ragged without the art and the
  // collider ever parting company. Uniform about 1, so the MEAN is exactly spec.thick and §7's cost
  // table still reads; see CHAPTERS.reef.spurs for the ceiling this may not cross.
  const thick = spec.thick * (1 + (obstacleCellHash(i, 0, seed, spec.salt + 2) - 0.5) * 2 * (spec.thickVar ?? 0))
  // The braid. One sine over the lane index, the two channels symmetric about the centre line, so
  // they cross (and swap sides) wherever it passes through zero. See CHAPTERS.reef.spurs for why
  // the period is 6 ridges and why the amplitude is a constant rather than a viewport read.
  const c = (spec.braidSep / 2) * Math.sin((2 * Math.PI * i) / spec.braidSpurs)
  const span = spec.grooveMax - spec.grooveMin
  const w1 = spec.grooveMin + obstacleCellHash(i, 0, seed, spec.salt) * span
  const w2 = spec.grooveMin + obstacleCellHash(i, 0, seed, spec.salt + 1) * span
  // MERGED: the two channels have closed onto each other and the ridge has ONE way through, the
  // narrowest point in the level. Not their union — a merge that got WIDER would be the easiest
  // ridge in the chapter rather than the hardest, and spec §4.1 bans every feature here precisely
  // because it is already the dangerous one.
  const merged = 2 * Math.abs(c) < (w1 + w2) / 2
  const grooves = merged
    ? [{ c: 0, hw: Math.max(w1, w2) / 2 }]
    : [{ c, hw: w1 / 2 }, { c: -c, hw: w2 / 2 }]
  return { i, f, thick, grooves, merged }
}

// The 1-D cursor. Rebuilds the whole window on a ridge crossing rather than doing the live/drop
// bookkeeping the four cell streamers do: OBSTACLE_STREAM_RADIUS over a 210px spacing is fifteen
// entries, spurAt is pure, and a rebuild that cheap cannot go stale.
// ponytail: full rebuild on every crossing. Needs the live/drop dance only once a crushed ridge
// has to survive one (spec §3.2 — the spur-owned registry, still to come).
export function streamSpurs(run) {
  const spec = CHAPTERS[run.chapter].spurs
  if (!spec) return
  if (run._obstacleSeed == null) return
  const ax = laneAxes(CHAPTERS[run.chapter])
  const i0 = Math.round(run.player[ax.fwd] / spec.spacing)
  if (i0 === run._spurIdx) return       // same ridge as the last scan — the field is unchanged
  run._spurIdx = i0
  const span = Math.ceil(OBSTACLE_STREAM_RADIUS / spec.spacing)
  run.spurs.length = 0
  for (let i = i0 - span; i <= i0 + span; i++) run.spurs.push(spurAt(i, spec, run._obstacleSeed))
  run._spurRev = (run._spurRev || 0) + 1  // render rebuilds only on this, exactly as _obstacleRev
}

// ONE definition of 'this cross position is coral and not a channel', read by the grate (the
// player) and by Fire Coral (the crowd, stepPolyps). It takes the spurAt entry the caller already
// has and only the CROSS coordinate — the forward band test stays with each caller, because they
// bound it differently (the player against the streamed window, a lit ridge against its own
// stored f). Splitting the groove test out is what stops the burn band and the scrape band from
// drifting apart, which is the one-fact-in-two-places class CLAUDE.md names as the largest
// defect source in this repo.
// The tightest form, kept for the callers that ask about a ridge's own cross-section (Fire Coral
// burns the ridge line itself, and the fixtures aim at grooves). Same predicate at w = 1.
const onCoral = (sp, c) => !sp.grooves.some((g) => Math.abs(c - g.c) <= g.hw)

// HOW FAR BEHIND THE LANE FRONT THE PLAYER CAN GET BEFORE THEY ARE OFF THE BACK OF THE SCREEN.
// render.js anchors the lane camera so the front sits at LANE_CAMERA_FRAC along the view, which
// leaves (1 - LANE_CAMERA_FRAC) of it astern -- 78px on the 390px phone this ships to. Shared by
// the crush (which begins at that edge) and by seekerBack (which drops bodies just past it), so
// the distance the player may fall back and the distance a body survives are one expression.
const laneBehindPx = (run, ax) => (1 - LANE_CAMERA_FRAC) * 2 * (ax.fwd === 'x' ? run.viewW : run.viewH)

// SOLID CORAL (v7.x, spurs.solid). Owner, 2026-08-23, having played it: the ridges "should block
// you". Pushed back out ALONG the lane and never across it -- shoving the player sideways would
// pick which groove they take, and picking the groove is the entire decision this field exists to
// pose. So you stop dead at the face and must strafe to a channel yourself.
//
// The BURST passes through, which is the same ruling that already waives the scrape (see stepSpurs)
// carried into a world where the ridge is a wall: the dash is now the button that gets you through
// one, which is a far better reason to spend the bar than shaving a little damage. It also removes
// the only tunnelling case -- at BURST_SPEED_MUL the player covers more than a ridge's thickness
// in a frame, and a solve that assumed otherwise would put them out the FAR side for free.
// THE CAVE WALL, AND WHAT TOUCHING IT COSTS.
//
// Replaces a solid-ridge solver that ASSIGNED the player an absolute position -- from a graze that
// was a jump of a hundred pixels or more, which read on a phone as the level throwing you
// somewhere, and could deposit you past the trailing edge to be crushed. Owner saw exactly that.
//
// What happens now, in the order it matters:
//   1. clamp ACROSS to the wall face you touched, and no further. The correction is bounded by how
//      far you had already gone in, so a graze moves you a graze's worth.
//   2. nudge a little back DOWN the lane (CAVE_BOUNCE_PX), which is the "bounces you back on
//      track" half -- you lose ground, you are not relocated.
//   3. publish contact so the damage tick and the render tell can both read it.
// Returns true if the player died.
function stepCaveWall(run, dt) {
  const ch = CHAPTERS[run.chapter]
  const spec = ch.cave
  if (!spec) { run._caveHit = false; return false }
  const ax = laneAxes(ch)
  const p = run.player
  const cav = caveAt(p[ax.fwd], spec, run._obstacleSeed)
  // The BURST passes through, the same ruling that waived the old scrape: the dash is the button
  // that gets you out of trouble, and a wall that stops it is a wall that ends runs on a spend.
  if ((run._burstT ?? 0) > 0) { run._caveHit = false; return false }
  const off = p[ax.cross] - cav.c
  const lim = cav.hw - PLAYER.radius
  // THE ISLAND (caveAt's `ph`): where the passage forks, the middle of it is coral. Same contact,
  // same bounce, same tick — the only new thing is that the free band is an ANNULUS for those few
  // hundred px, so a player holding the centre line is now in the wall rather than in the safest
  // place in the chapter. Clamped at `lim` so an island that ever grew wider than its passage
  // would pin the player against the outer wall instead of trapping them in coral with no exit.
  const inner = cav.ph > 0 ? Math.min(cav.ph + PLAYER.radius, lim) : 0
  const a = Math.abs(off)
  if (a <= lim && a >= inner) {
    run._caveHit = false
    run._caveAcc = Math.min(run._caveAcc ?? 0, CAVE_HIT_TICK)
    return false
  }
  // Out through the nearer face: pushed off the island the way you were already leaning, held
  // against the wall face you touched.
  p[ax.cross] = cav.c + (off >= 0 ? 1 : -1) * (a > lim ? lim : inner)
  p[ax.fwd] -= ax.dir * CAVE_BOUNCE_PX * dt * 60 / 60 * 1
  run._caveHit = true
  run._caveAcc = (run._caveAcc ?? 0) + dt
  let died = false
  while (run._caveAcc >= CAVE_HIT_TICK) {
    run._caveAcc -= CAVE_HIT_TICK
    // `dot: true` and a named src, as the drown is: main.js silences the per-tick audio on e.dot
    // and render.js keys its hurt reaction off the source name.
    if (!died && hurtPlayer(run, CAVE_HIT_DPS * CAVE_HIT_TICK, true, 'scrape')) died = true
  }
  return died
}


// THE GRATE. What makes a ridge a decision instead of scenery: you are either in a groove, or in
// coral where it costs HP and your steering while the crowd is still on you. Never a wall — the
// scroll is untouched, so the lane keeps its one promise and there is nowhere the reef is shut.
//
// TESTED AGAINST THE GROOVES spurAt ALREADY RETURNED, which is the same object render.js draws the
// channel from — one definition, two consumers, and the only reason the gap you can see is the gap
// you can swim through.
//
// A POINT TEST, like every other DoT in this file (the pools, the slicks, inLobe). The spec prices
// the MEAN ridge (spurs.thick 90px) at the 2.0s a 45px/s scroll takes to carry a point through it;
// adding the body radius would make it 3.0s and every number in §7's table wrong by half. Ridges
// vary about that mean now (spurs.thickVar), so a single crossing costs 1.56-2.44s and the table
// reads as the expectation it always was.
//
// ⚠ THE ACCUMULATOR IS CARRIED, and that is an exploit fix rather than a detail. Zeroing it on exit
// (stepDrown/stepSlick do, correctly, for a bar you are simply in or out of) makes clipping a groove
// edge for under half a second free. Ticking on ENTRY from a zeroed accumulator is worse the other
// way: it charges a full tick per crossing with no cooldown, so a player oscillating on an edge — or
// shoved across one — pays 5 ticks/s against a stated 4 dps. Carried, and merely CAPPED at one tick
// while you are out, the entry tick is exact arithmetic with neither hole: an oscillator can never
// pay more per second than a player who committed. createRun seeds it AT the cap (state.js), so the
// first ridge of a run bites on entry exactly like every ridge after it.
//
// THE CHARGE IS FLAT, NEVER x dmgScale. Every DoT SPUR_DPS is priced against is flat — drowning 4,
// SLICK/SOAP 6 — so a ramping scrape would cross the soap trail at t=150s and invert the one thing
// that makes a groove a choice. See SPUR_DPS' block for the whole of that argument.
//
// @returns true if the player died.
function stepSpurs(run, dt) {
  const spec = CHAPTERS[run.chapter].spurs
  if (!spec) return false
  // A CHAPTER WITH A CAVE HAS NO SEPARATE SCRAPE. stepCaveWall owns contact there -- it charges the
  // same 'scrape' source when the player touches a wall -- and running both would bill twice for
  // one touch. Left in place rather than deleted because the spur field is still a legitimate thing
  // for another chapter to declare without a cave around it.
  if (CHAPTERS[run.chapter].cave) { run._scraping = false; return false }
  const ax = laneAxes(CHAPTERS[run.chapter])
  const p = run.player
  const f = p[ax.fwd], c = p[ax.cross]
  // ON THE CORAL MEANS TOUCHING IT ONCE THE CORAL IS SOLID, and without this line the entire scrape
  // system is dead code. blockOnCoral holds the player's CENTRE at thick/2 + PLAYER.radius from the
  // ridge centre -- flush against the face, which is where they visually belong -- and that is
  // strictly outside the band this used to test, so `inside` was false on every frame of contact.
  // SPUR_DPS, SPUR_SLOW_MUL, the grit tell and the whole 'scrape' damage source became unreachable
  // the moment the ridges became walls, with nothing thrown and (until run RS.b) nothing red.
  //
  // So the two hazards layer instead of replacing each other: grinding along a face costs you the
  // scrape and your steering, and only being left behind by the lane costs you the crush.
  const spec0 = CHAPTERS[run.chapter].spurs || {}
  const reach = spec0.solid ? PLAYER.radius : 0
  let inside = false
  for (const sp of run.spurs) {
    // The band reaches a PLAYER.radius past the ridge on a solid field, so a player held flush
    // against the face is inside it rather than a hair outside and paying nothing.
    if (Math.abs(f - sp.f) > sp.thick / 2 + (spec0.pinchSpan ?? 0) + reach) continue
    // onCoral is the file's single definition of "this cross position is coral and not a channel",
    // shared with Fire Coral's burn band -- which is the point of it existing at all, since the two
    // drifting apart is the one-fact-in-two-places class CLAUDE.md names as the largest defect
    // source here. It reads the CROSS coordinate only; the forward band above is this caller's half.
    inside = onCoral(sp, c)
    break
  }
  // balance_decision : the burst crosses coral free, strafe slow lifts too [2026-08-22]
  //  - clears _scraping ITSELF, so the grit tell and SPUR_SLOW_MUL go with the damage
  if ((run._burstT ?? 0) > 0) inside = false
  run._scraping = inside   // the strafe slow, read by stepPlayerMovement (see SPUR_SLOW_MUL)
  run._spurAcc += dt
  if (!inside) { run._spurAcc = Math.min(run._spurAcc, SPUR_TICK); return false }
  let died = false
  while (run._spurAcc >= SPUR_TICK) {
    run._spurAcc -= SPUR_TICK
    // `dot: true` and a named src, as drowning and the slick are: the renderer's hurt reaction is
    // keyed off both, and main.js's `if (e.dot) continue` already silences the audio.
    if (!died && hurtPlayer(run, SPUR_DPS * SPUR_TICK, true, 'scrape')) died = true
  }
  return died
}

// -- The leak (v7.x, The Wreck's signature) ------------------------------------------------------
// THE FIFTH FIELD THROUGH refillCircleAt AND THE FIRST THAT HURTS. Same pure cell->circle geometry
// as The Shelf's shafts, The Surf's pools and The Reef's pockets, on its own salt block (50) so a
// slick can never land on the same roll as an obstacle (0-4), an eddy (11-14) or a trap (15-17).
//
// ⚠ IT IS DELIBERATELY NOT IN run.shafts, and the temptation to put it there is real — the array
// exists, the streamer exists, and `refillSpec` is two characters from finding it. stepCharge loops
// run.shafts handing out RESOURCE. A poison the bloodlust bar thanked you for standing in is a
// one-word semantic collision of exactly the kind this repo keeps shipping, and it would not throw.
//
// No drift and no lane clamp: a spill does not move, and no lane chapter declares a leak. The cell
// cursor is its own (_slickCellI/J) so it scans independently of the other four streamers.
export function streamSlicks(run) {
  const sig = CHAPTERS[run.chapter].signature
  const spec = sig && sig.type === 'leak' ? sig.slicks : null
  if (!spec) return
  if (run._obstacleSeed == null) return
  const p = run.player
  const cs = spec.cell
  const ci = Math.floor(p.x / cs), cj = Math.floor(p.y / cs)
  if (ci === run._slickCellI && cj === run._slickCellJ) return  // field unchanged since the last scan
  run._slickCellI = ci; run._slickCellJ = cj

  for (let k = run.slicks.length - 1; k >= 0; k--) {
    const sl = run.slicks[k]
    if (Math.hypot(sl.x - p.x, sl.y - p.y) > OBSTACLE_DROP_RADIUS) run.slicks.splice(k, 1)
  }
  const live = new Set()
  for (const sl of run.slicks) live.add(sl._cell)

  const seed = run._obstacleSeed
  const span = Math.ceil(OBSTACLE_STREAM_RADIUS / cs)
  for (let i = ci - span; i <= ci + span; i++) {
    for (let j = cj - span; j <= cj + span; j++) {
      const key = i + ',' + j
      if (live.has(key)) continue
      const c = refillCircleAt(i, j, seed, spec)
      if (!c) continue
      if (Math.hypot(c.x - p.x, c.y - p.y) > OBSTACLE_STREAM_RADIUS) continue
      // shape/rot STORED, never re-derived — render draws the outline from these and this file tests
      // position against them, and re-deriving in one place is how the two drift apart.
      run.slicks.push({ x: c.x, y: c.y, r: spec.r, shape: c.shape, rot: c.rot, _cell: key })
    }
  }
}

// Standing in a spill. Structurally stepDrown/stepStarve — a fixed-cadence DoT that returns true on
// death — plus the fouling, which is the half that makes a slick a decision instead of a tax: you
// come out slower than you went in, so a shortcut through one costs you the fish as well as the HP.
// @returns true if the player died.
function stepSlick(run, dt) {
  if (run._foulT > 0) run._foulT = Math.max(0, run._foulT - dt)
  if (!run.slicks.length) return false
  // THE LEAK STAINS THE SHOAL, NOT ONLY YOU (v7.x). Until this loop existed the chapter's own
  // hazard was invisible to every body but the player's — enemies swam through a spill and came
  // out unchanged, so the map's most obvious terrain feature was terrain for one participant.
  // Same `oiled` field and same cap as the player's own bilge: it is the same oil.
  for (const e of run.enemies) {
    if (e._dead || damageImmune(e) || (e.oiled || 0) >= OIL_STAIN_MAX) continue
    for (const sl of run.slicks) {
      if (!inLobe(sl, e.x, e.y)) continue
      e.oiled = Math.min(OIL_STAIN_MAX, (e.oiled || 0) + OIL_STAIN_RATE * dt)
      break
    }
  }
  const p = run.player
  let inside = false
  for (const sl of run.slicks) if (inLobe(sl, p.x, p.y)) { inside = true; break }
  if (!inside) { run._slickAcc = 0; run._slickDmgCarry = 0; return false }
  run._foulT = SLICK_SLOW_T
  run._slickAcc = (run._slickAcc ?? 0) + dt
  let died = false
  // OILSKIN (v7.x, The Wreck): scales the raw tick down by resistFrac, the same as Sleek. A plain
  // per-tick round quantises brutally against a 3-damage tick (SLICK_DPS * SLICK_TICK): one normal
  // pick scales it to 2.5, which Math.round takes back UP to 3 — an INERT CARD, indistinguishable
  // from no resist at all. So the resisted damage is banked as a float in run._slickDmgCarry and
  // only spent through hurtPlayer once it clears a whole point, keeping the remainder — that makes
  // every resist magnitude eventually visible (even a near-total one, just slowly) and survives
  // SLICK_DPS/SLICK_TICK being retuned later (SLICK_DPS is a documented unmeasured first cut).
  const oilResist = resistFrac(run.passives.oilskin)
  while (run._slickAcc >= SLICK_TICK) {
    run._slickAcc -= SLICK_TICK
    run._slickDmgCarry = (run._slickDmgCarry ?? 0) + SLICK_DPS * SLICK_TICK * (1 - oilResist)
    const whole = Math.floor(run._slickDmgCarry)
    if (whole < 1) continue
    run._slickDmgCarry -= whole
    // `dot: true` and a named src, exactly as drowning and starving are: the renderer's hurt
    // reaction is keyed off both, and main.js's `if (e.dot) continue` already silences the audio.
    if (!died && hurtPlayer(run, whole, true, 'slick')) died = true
  }
  return died
}

// Shaft drift (v7.x). Pure function of run._realTime and the shaft's own phase: stores no state,
// consumes no RNG, and is therefore identical across a reload or a re-run of the same seed.
//
// run._realTime, NOT run.time. The Time Debt anomaly advances run.time at TIME_DEBT_MUL (1.5x, see
// the step order above) and its `chapter` is null so it rolls in The Twilight - deriving drift from
// run.time would multiply peak drift speed by 1.5 and push the shipped tune (63 px/s) to 95, within
// a rounding error of the KITE_MIN_SPEED ceiling the number was chosen to sit under. _realTime
// exists precisely to be a unit that means the same thing in every run.
//
// x uses cos and y uses sin of the SAME angle, so a shaft travels a small circle at a CONSTANT
// speed of driftAmp x driftHz rather than easing to a halt at each end of a line. A shaft that
// stops dead twice a cycle reads as a stutter, and the number checked against the ceiling would
// then be a peak rather than the speed it actually holds.
function stepShafts(run, dt) {
  const sig = CHAPTERS[run.chapter].signature
  if (!sig || sig.type !== 'shafts' || !run.shafts.length) return
  // FOUL SPRING's fouling clock, and it runs AHEAD of the drift early-out below on purpose: a
  // refill field may declare no drift at all (The Surf's pools and The Reef's pockets do not), and
  // the animation still has to run down wherever the mod can reach. Seconds REMAINING, so render
  // gets `fouled / FOUL_SPRING_FOUL_T` as a 1 -> 0 progress with no second clock to disagree with.
  for (const sh of run.shafts) if (sh.fouled > 0) sh.fouled = Math.max(0, sh.fouled - dt)
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
//
// DRY SAND AND A TIDE POOL CANNOT BE THE SAME GROUND (owner, 2026-08-15). The two fields are
// independent grids with their own cell sizes (620 vs 700) and their own hash salts, which is what
// keeps their ROLLS from colliding — and says nothing whatever about where the circles land. They
// overlapped constantly, and an overlap is not a cosmetic blemish here: the sand multiplies the
// Humidity drain by 24 while a pool refills it at 20/s, so the overlap region is the one patch of
// the chapter where the two halves of the mechanic are fighting over the same pixel and the player
// cannot tell from the floor which one they are standing in.
//
// THE SANDBAR YIELDS, NEVER THE POOL. The pools are the refill, and the entire Humidity tune in
// CHAPTERS.surf.resource was measured against that exact field (see its block: 300s x 3 seeds x
// three spend policies x four movement rows). Thinning it would invalidate every one of those
// numbers. Thinning the sandbars only makes the hazard rarer, which is a knob — `bars.chance` —
// that can be turned back up, and was: see its comment for the measured before/after.
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
      // Salts 33/34 for the outline, in the sandbar's own reserved block (see the registry above
      // obstacleCellHash) — the rotation is drawn HERE rather than in render, where it used to be
      // hashed off the patch's world position, because it is now part of the collider and not just
      // of the picture. Two independent derivations of one shape is exactly the drift this whole
      // change exists to prevent. Built BEFORE the separation test, which needs the outline.
      const bar = {
        x, y, r: spec.r, _cell: key,
        shape: Math.floor(obstacleCellHash(i, j, seed, 33) * LOBE_SHAPES.length) % LOBE_SHAPES.length,
        rot: obstacleCellHash(i, j, seed, 34) * Math.PI * 2,
      }
      if (overlapsPool(bar, sig, seed)) continue // see the block above this function
      run.sandbars.push(bar)
    }
  }
}

// Would a sandbar of radius `r` centred here touch any tide pool? See the block above
// streamSandbars for why the sandbar is the one that gives way.
//
// The cell range is EXACT rather than a guessed 3x3, and that is worth the two lines: refillCircleAt
// bounds a pool's jitter by cs/2 - poolR - 20, so a pool circle lies wholly inside its own cell, so
// any pool reaching this point sits in a cell that the disc of radius (r + poolR) touches. Deriving
// the range from the radii means the test cannot silently start missing pools if either radius or
// the pool cell size is ever retuned — the failure mode a hardcoded neighbourhood would have, and a
// quiet one, since it would only reappear as the occasional overlap this exists to remove.
//
// Consumes no Math.random and materialises nothing: it re-derives the pool field from the same seed
// and hashes streamShafts uses, so it agrees with the pools the player actually sees whether or not
// those cells have been streamed in yet.
function overlapsPool(bar, sig, seed) {
  const pools = sig && sig.pools
  if (!pools) return false
  const x = bar.x, y = bar.y
  // The SEARCH radius stays the plain sum, because the profile never exceeds r — so anything that
  // could possibly touch is inside this box, whatever shape either patch turns out to wear.
  const reach = bar.r + pools.r
  const cs = pools.cell
  const i0 = Math.floor((x - reach) / cs), i1 = Math.floor((x + reach) / cs)
  const j0 = Math.floor((y - reach) / cs), j1 = Math.floor((y + reach) / cs)
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const c = refillCircleAt(i, j, seed, pools)
      if (!c) continue
      const dx = c.x - x, dy = c.y - y
      const d = Math.hypot(dx, dy)
      if (d >= reach) continue
      // THE TEST ITSELF READS BOTH OUTLINES. Comparing plain radii instead would be conservative and
      // wrong in a way that shows: a lobed patch pulls in from r over most of its circumference, so
      // the radius test rejects a great many pairs that visibly do not touch, and it rejects them
      // from the SANDBAR side only. Measured, it cost the beach a third of its dry ground on top of
      // what the lobes themselves cost, and the density would have had to be bought back by pushing
      // the occupancy roll to nearly 1 — i.e. by making every cell hold a bar and then throwing most
      // of them away, which is a field with no gaps left in it to be a field.
      //
      // SAMPLED, NOT MEASURED ALONG THE CENTRE LINE. The centre-line version — each patch's reach
      // toward the other — is exact for CONVEX outlines and these are not convex: a lobe on one can
      // reach past a notch on the other while the line between the centres passes through clear
      // water. That is not theoretical, it shipped for the length of one test run and run US.k's
      // point sampler found it immediately (one point in ~30k, which is exactly the size of hole a
      // by-eye check never finds). Walking both outlines through the other's own containment test
      // catches it, and reuses inLobe so the rule is enforced by the same function that decides
      // where the player is standing.
      for (let k = 0; k < SEPARATION_SAMPLES; k++) {
        const a = (k / SEPARATION_SAMPLES) * Math.PI * 2
        const br = bar.r * lobeFactor(bar.shape, a, bar.rot)
        if (inLobe(c, bar.x + Math.cos(a) * br, bar.y + Math.sin(a) * br)) return true
        const pr = c.r * lobeFactor(c.shape, a, c.rot)
        if (inLobe(bar, c.x + Math.cos(a) * pr, c.y + Math.sin(a) * pr)) return true
      }
    }
  }
  return false
}

// Is the player standing on dry ground? Centre-to-centre against the patch radius, exactly like
// stepCharge's shaft test — standing ON it, not brushing its edge.
export function onSandbar(run) {
  const p = run.player
  for (const b of run.sandbars) if (inLobe(b, p.x, p.y)) return true
  return false
}

// -- The Trawl (v7.x Book 2 ch 4): a net wall that aims at nothing ---------------------------
// See the TRAWL_* block in config.js for the design and for why the speed has a derived band. The
// geometry, once, here: the net is an INFINITE LINE carried as a unit normal `n` and a signed offset
// `pos`, and it sweeps by advancing `pos`. A point is ON the mesh when |dot(point, n) - pos| is
// under the half-thickness, BEHIND it when that signed distance is negative, and its position ALONG
// the wall is dot(point, tangent) where tangent = (-ny, nx).
//
// A line rather than an entity with ends, because the world is streamed and unbounded: at 300s the
// player can be 20,000px from the origin, so "a wall that crosses the map" has no edges to span, and
// a wall you can walk round is not a wall. Every test below is one dot product, so the cost is flat
// in how far the player has roamed.
//
// ⚠ THE THREE FUNCTIONS BELOW ARE THE ONLY PLACE THAT ARITHMETIC IS WRITTEN. Everything else —
// contact, the wake, Breach, the renderer — calls these. That is deliberate: a sign error in "which
// side has the net already crossed" is invisible (the wake simply appears on the wrong side of a
// wall, which looks like a tuning choice), and duplicating the expression is how it would get one.
const netDist = (net, x, y) => x * net.nx + y * net.ny - net.pos   // signed: <0 = already crossed
const netAlong = (net, x, y) => x * -net.ny + y * net.nx           // position ALONG the wall
// Is this point in a torn hole? Same test for the player and for the crowd, which is the whole point
// of Breach: the hole is a gap in a line, and the line does not know who is standing in it.
const inNetHole = (net, x, y) => {
  const t = netAlong(net, x, y)
  for (const h of net.holes) if (Math.abs(t - h.t) <= h.r) return true
  return false
}

// Is this point in the churned wake — the ONLY place Feed comes from? Behind the mesh (the water the
// net has already been through) and within TRAWL_WAKE_DEPTH of it. Exported because stepCharge asks
// it in place of the shaft loop every other Book 2 chapter uses, and render.js draws the same band.
export function inWake(run, x, y) {
  const net = run.net
  if (!net) return false
  const d = netDist(net, x, y)
  return d < -TRAWL_HALF && d >= -(TRAWL_HALF + TRAWL_WAKE_DEPTH)
}

// How much faster than real time the orca's countdown runs, given how packed the water around the
// player is. `run._feedN` is stepShoals' own count (prey inside FEED_R that are part of a real ball
// — see BALL_TIGHT_N), so this is the SAME density the Bloodlust drain-slow rewards, read a second
// time rather than counted a second time. Live chum baits add to it because chum in the water is
// what an orca actually comes for.
// ⚠ CAPPED. Uncapped, a chapter that stays dense is a chapter the orca never leaves.
// A bait counts for HOW MUCH FOOD IS LEFT IN IT, not for existing: `food` over ORCA_BAIT_FULL_FOOD,
// clamped, so a fresh L5 bucket rings the bell and one the shoal has already stripped does not.
// That is the owner's ruling ("the more there is the more it attacks") in the one term that can
// express it — the bait's own servings, which is the same number the drawing counts out in chunks.
function orcaRush(run) {
  let baits = 0
  if (run.lures) for (const lu of run.lures) if (lu.bait) baits += Math.min(1, (lu.food || 0) / ORCA_BAIT_FULL_FOOD)
  const dens = Math.min(1, (run._feedN || 0) / FEED_FULL_N) + baits * ORCA_BAIT_PULL
  return Math.min(ORCA_RUSH_MAX, 1 + ORCA_DENSITY_RUSH * dens)
}

// THE UNCREDITED DEATH. Prey caught by the sweep just stops existing: `_dead` plus an event and
// nothing else, which is stepLeaks' shipped idiom for a body the player did not kill. It therefore
// pays NO run.kills, no gem, no Bloodlust refill and no on-kill proc — all of which live inside
// dealDamage, and none of which is reachable from here. That is the whole point of ruling 3: the
// orca eats your food and you get nothing for it.
// ⚠ PREY ONLY, AND NEVER AN ELITE. A moray is a threat you cleared and an elite is a reward you
// were part-way through earning; deleting either for free is a theft, not a tax.
function orcaBite(run, o) {
  const b2 = ORCA_BITE_R * ORCA_BITE_R
  for (const e of run.enemies) {
    if (e._dead || e.elite || isAlly(e)) continue
    if (!e.flags || !e.flags.includes('skittish')) continue
    const dx = e.x - o.x, dy = e.y - o.y
    if (dx * dx + dy * dy > b2) continue
    e._dead = true
    run.events.push({ type: 'orcaFeed', x: e.x, y: e.y })
  }
}

// THE BOW WAVE. Everything within ORCA_WAKE_R of the body during a commit is thrown PERPENDICULAR
// to the locked line, to whichever side it already sits on - owner ruling 2026-08-23, "it should
// have a massive impact on the battlefield, like pushing everything to each side". What the strike
// leaves behind is therefore a cleared corridor with the crowd banked along both edges, which is a
// battlefield the player has to read, rather than a few fish quietly missing.
//   PERPENDICULAR, NOT RADIAL, and that is the same correction the ring itself already carries: a
// radial shove off a body moving at ORCA_COMMIT_SPEED spends most of its budget pushing bodies
// BACKWARD along a line the orca has already left. Only the normal component opens a corridor.
// ⚠ EVERYTHING, not just prey - the bite is prey-only because an uncredited elite death is theft,
// but being shoved costs nothing. Only `anchored` (resistsCC) is exempt, the shipped rule for every
// other shove in the game.
// ⚠ NOT CC-BUDGETED. claimKb/spendCC exist so a weapon cannot chain-lock a crowd; this is water
// moving, it happens twice a visit, and running it through the budget would let an orca pass
// silently eat the player's next nova knockback.
function orcaWake(run, o, dt) {
  const nx = -o.dirY, ny = o.dirX   // unit normal to the locked line
  const r2 = ORCA_WAKE_R * ORCA_WAKE_R
  for (const e of run.enemies) {
    if (e._dead || isAlly(e) || resistsCC(e)) continue
    const dx = e.x - o.x, dy = e.y - o.y
    const d2 = dx * dx + dy * dy
    if (d2 > r2) continue
    // A body dead on the line has no side to be thrown to. Sign the zero rather than leaving it
    // sitting in the path - `>= 0` picks one deterministically, which the suite's seeding needs.
    const sg = dx * nx + dy * ny >= 0 ? 1 : -1
    const falloff = 1 - Math.sqrt(d2) / ORCA_WAKE_R
    e.kb.x += nx * sg * ORCA_WAKE_FORCE * falloff * dt
    e.kb.y += ny * sg * ORCA_WAKE_FORCE * falloff * dt
  }
  // The player rides it too, as a plain velocity: nothing decays p.x, so an acceleration here
  // would launch them. Away from the line by construction, so it can only ever help the dodge.
  const p = run.player
  const dx = p.x - o.x, dy = p.y - o.y
  const d2 = dx * dx + dy * dy
  if (d2 > r2) return
  const sg = dx * nx + dy * ny >= 0 ? 1 : -1
  const falloff = 1 - Math.sqrt(d2) / ORCA_WAKE_R
  p.x += nx * sg * ORCA_WAKE_PLAYER * falloff * dt
  p.y += ny * sg * ORCA_WAKE_PLAYER * falloff * dt
}

// Returns true if the player died, matching stepRocks/stepPools' contract — it is called from
// stepSim's `if (stepX(...)) return` group for that reason.
// -- The Orca (v7.x, The Wreck — chapters declaring `orca: true`) --------------------------------
// Four telegraphed visits from t=100s. Rises as a shadow on the deep parallax layer, surfaces,
// closes a ring around you, commits along one locked line, overshoots and leaves. UNKILLABLE by
// design (owner ruling): there is no health pool and no vulnerability window, and the reward for
// surviving is the crowd its ring leaves compressed on your position.
//
// run.orca is a SINGLE NULLABLE OBJECT with a run._orcaAcc countdown, and stepOrca returns true if
// the player died — the shipped run.net idiom, not a pool. See the ORCA_* block in config.js for
// the closing-ring geometry and for why an orbiting POINT measurably evacuates the shoal.
//
// FIVE STATES, AND THE FIRST THREE VISITS ARE HARMLESS. `shadow` is the opening foreshadowing —
// a silhouette that slides under the player, scatters the shoal and clears itself without ever
// escalating. run._orcaShadows counts them down; once it hits zero the real ladder starts.
//
// HOW SOON IT COMES IS THE PLAYER'S DOING. orcaRush accelerates the countdown with the density of
// the water around the player, so the visit is bought by hoarding rather than handed out by a clock.
function stepOrca(run, dt) {
  if (!CHAPTERS[run.chapter].orca) return false
  const p = run.player
  const o = run.orca
  if (!o) {
    // `??` seeds the FIRST wait at ORCA_SHADOW_FIRST and every later one at ORCA_SHADOW_GAP /
    // ORCA_INTERVAL, matching what createRun writes — the same shape stepTrawl's _netAcc uses.
    run._orcaAcc = (run._orcaAcc ?? ORCA_SHADOW_FIRST) - dt * orcaRush(run)
    if (run._orcaAcc > 0) return false
    // THE OPENING SHADOW PASSES, before anything can hurt you. Same `??` seeding as _orcaAcc, so a
    // run object assembled by hand (a probe, a test fixture) gets the shipped ladder rather than
    // `undefined > 0` quietly skipping the whole opening.
    const left = run._orcaShadows ?? ORCA_SHADOW_PASSES
    if (left > 0) {
      run._orcaShadows = left - 1
      run._orcaAcc = left > 1 ? ORCA_SHADOW_GAP : ORCA_SHADOW_LAST_GAP
      const heading = Math.random() * Math.PI * 2
      const dirX = Math.cos(heading), dirY = Math.sin(heading)
      // Starts a full off-screen range BEHIND the player along the heading and travels through
      // them, so it enters off one side of the screen and leaves by the other. The range is the
      // VIEW's, not a world literal — see ORCA_SHADOW_MARGIN for the viewport it would otherwise
      // pop into existence on.
      const range = run.viewRadius + ORCA_SHADOW_MARGIN
      run.orca = {
        state: 'shadow', t: ORCA_SHADOW_DUR,
        cx: p.x, cy: p.y, r: ORCA_RING_R, ang: heading,
        x: p.x - dirX * range,
        y: p.y - dirY * range,
        dirX, dirY, hit: false, alpha: 0,
      }
      return false
    }
    run._orcaAcc = ORCA_INTERVAL
    const bearing = Math.random() * Math.PI * 2
    run.orca = {
      state: 'rising', t: ORCA_RISE_DUR,
      cx: p.x, cy: p.y, r: ORCA_RING_R, ang: bearing,
      x: p.x + Math.cos(bearing) * ORCA_RING_R,
      y: p.y + Math.sin(bearing) * ORCA_RING_R,
      dirX: 0, dirY: 0, hit: false, alpha: 0, passes: ORCA_COMMITS,
    }
    run.events.push({ type: 'orcaRise', x: p.x, y: p.y })
    return false
  }
  o.t -= dt
  if (o.state === 'shadow') {
    // A straight line under the player at a constant speed — no ring, no collision, no death. The
    // ONLY consequence is that the shoal breaks: published into e.fearT, the contract field
    // render.js already tints and poses off, so the tell costs nothing (CLAUDE.md, "a new mechanic
    // is invisible until it reaches a contract field"). Math.max rather than a bare assign, and
    // never refreshed after the pass ends, so the fear expires and FEAR_REFRACTORY can arm — the
    // trap chitterShriek's own site documents.
    // Re-derived every frame rather than banked on the object at spawn: one fewer field on a
    // documented shape, and a resize mid-pass is worth tens of px over 2.6s.
    const sp = ((run.viewRadius + ORCA_SHADOW_MARGIN) * 2) / ORCA_SHADOW_DUR
    o.x += o.dirX * sp * dt
    o.y += o.dirY * sp * dt
    o.cx = o.x; o.cy = o.y
    o.alpha = Math.min(1, Math.max(0, o.t) / ORCA_SHADOW_FADE, (ORCA_SHADOW_DUR - o.t) / ORCA_SHADOW_FADE)
    const fr2 = ORCA_SHADOW_FEAR_R * ORCA_SHADOW_FEAR_R
    for (const e of run.enemies) {
      if (e._dead || isAlly(e) || resistsCC(e)) continue
      const ex = e.x - o.x, ey = e.y - o.y
      if (ex * ex + ey * ey < fr2) e.fearT = Math.max(e.fearT || 0, ORCA_SHADOW_FEAR_T)
    }
    // The whoosh fires at CLOSEST APPROACH, not at spawn: the pass takes ORCA_SHADOW_DUR and the
    // shape is only under you halfway through. `hit` latches it, exactly as it latches the strike.
    if (!o.hit && o.t <= ORCA_SHADOW_DUR / 2) {
      o.hit = true
      run.events.push({ type: 'orcaShadow', x: o.x, y: o.y })
    }
    if (o.t <= 0) run.orca = null
    return false
  }
  if (o.state === 'rising') {
    // IT SURFACES UNDERNEATH YOU AND SLIDES OUT TO THE RING, rather than fading up already parked
    // on it. Owner: "very telegraph with a big shadow underneath you", and again 2026-08-23, "the
    // SHADOW IS SPIRALING IN FROM UNDERNEATH". No collision in this state.
    //   ⚠ THIS IS A PHONE FIX AS MUCH AS A STAGING ONE, and it was shot before it was written. The
    // ring is 440px and a 390x844 screen is 195px half-wide, so a silhouette parked out on the ring
    // is OFF SCREEN for the sideways part of every lap — and in the first second there is no coil
    // drawn yet either, so the opening of the build was a completely empty frame on the device the
    // game is played on. Starting it at the ring's centre puts the biggest thing in the chapter
    // directly under the player for the one beat that had nothing in it at all.
    o.cx += (p.x - o.cx) * Math.min(1, dt * 2.5)
    o.cy += (p.y - o.cy) * Math.min(1, dt * 2.5)
    o.ang += ORCA_ORBIT_RATE * 0.5 * dt
    const out = 1 - Math.max(0, o.t) / ORCA_RISE_DUR
    o.x = o.cx + Math.cos(o.ang) * o.r * out
    o.y = o.cy + Math.sin(o.ang) * o.r * out
    o.alpha = out
    if (o.t <= 0) { o.state = 'circling'; o.t = ORCA_CIRCLE_DUR; o.alpha = 1; o.trail = [] }
    return false
  }
  if (o.state === 'circling') {
    // The ring tracks the player, but LOOSELY: outrunning it entirely has to be possible or the
    // commit is not a dodge, it is a scheduled hit.
    o.cx += (p.x - o.cx) * Math.min(1, dt * 1.2)
    o.cy += (p.y - o.cy) * Math.min(1, dt * 1.2)
    const k = 1 - Math.max(0, o.t) / ORCA_CIRCLE_DUR
    // THE COIL TIGHTENS AND QUICKENS AT ONCE, which is the whole difference between a spiral and a
    // corner — see the ORCA_ORBIT_RATE block for the three reasons the first cut read as circling.
    // The rate RAMPS to x(1 + ORCA_SPIRAL_ACCEL) and the radius holds wide before plunging, so the
    // last second is a whip rather than the same lap done smaller.
    o.ang += ORCA_ORBIT_RATE * (1 + ORCA_SPIRAL_ACCEL * k) * dt
    o.r = ORCA_RING_MIN_R + (ORCA_RING_R - ORCA_RING_MIN_R) * (1 - Math.pow(k, ORCA_SPIRAL_EASE))
    o.x = o.cx + Math.cos(o.ang) * o.r
    o.y = o.cy + Math.sin(o.ang) * o.r
    // THE SWEPT PATH, published for render to stroke. A coil you can SEE is a coil; the ring tell
    // this replaces drew a circle at the current radius, which reads as a circle whatever moves
    // inside it. Sim owns positions and render only reads them, the same split every other tell
    // here uses — render cannot re-derive this without a second copy of the two curves above.
    // `??=` because a hand-built fixture (run OR.c, the fx-probe scenes) poses a 'circling' orca
    // without one, and `undefined.push` would take the whole chapter down.
    const tr = (o.trail ??= [])
    tr.push(o.x, o.y)
    if (tr.length > ORCA_TRAIL_MAX * 2) tr.splice(0, tr.length - ORCA_TRAIL_MAX * 2)
    if (o.t <= 0) {
      // THROUGH THE CENTRE OF THE COIL IT JUST DREW. Owner ruling 2026-08-23: "the orca attack
      // should always be on the center of the spiral" — and the spiral is a thing the player can
      // SEE now (o.trail, stroked by render), so its centre is a place they can read and stand off.
      // The line is locked HERE, at the moment it breaks orbit, and never re-aimed: the centre lags
      // the player through the loose track above, and that lag is the room the player bought by
      // swimming. It still eats the shoal, for a better reason than aiming at it did — the coil has
      // spent ORCA_CIRCLE_DUR herding the ball into exactly this point.
      o.tx = o.cx; o.ty = o.cy
      const dx = o.tx - o.x, dy = o.ty - o.y
      const d = Math.hypot(dx, dy) || 1
      o.dirX = dx / d; o.dirY = dy / d
      o.state = 'committing'
      o.t = (d + ORCA_OVERSHOOT) / ORCA_COMMIT_SPEED
      o.hit = false
      o.splashed = false
      run.events.push({ type: 'orcaStrike', x: o.x, y: o.y, angle: Math.atan2(dy, dx) })
    }
    return false
  }
  if (o.state === 'committing') {
    o.x += o.dirX * ORCA_COMMIT_SPEED * dt
    o.y += o.dirY * ORCA_COMMIT_SPEED * dt
    orcaBite(run, o)
    // THE BIG SPLASH, where it was AIMED and not where the frame happened to land — latched like
    // the hit below, and tested as "has the body passed the target's plane" so a slow frame cannot
    // step clean over the point at ORCA_COMMIT_SPEED.
    if (!o.splashed && (o.x - o.tx) * o.dirX + (o.y - o.ty) * o.dirY >= 0) {
      o.splashed = true
      run.events.push({ type: 'orcaSplash', x: o.tx, y: o.ty })
    }
    // ONCE PER PASS, not a DoT — `hit` latches so a slow frame cannot bill the same strike twice.
    if (!o.hit) {
      const hx = p.x - o.x, hy = p.y - o.y
      const rr = ORCA_HIT_R + PLAYER.radius
      if (hx * hx + hy * hy < rr * rr) {
        o.hit = true
        run.events.push({ type: 'orcaHit', x: p.x, y: p.y })
        if (hurtPlayer(run, p.maxHP * ORCA_DMG_FRAC, false, 'orca')) return true
      }
    }
    // AFTER the contact check on purpose: the shove must not be able to carry the player out of a
    // hit they were already standing in, only out of the one coming next frame.
    orcaWake(run, o, dt)
    if (o.t <= 0) { o.state = 'leaving'; o.t = ORCA_LEAVE_DUR }
    return false
  }
  o.x += o.dirX * ORCA_COMMIT_SPEED * 0.4 * dt
  o.y += o.dirY * ORCA_COMMIT_SPEED * 0.4 * dt
  o.alpha = Math.max(0, o.t) / ORCA_LEAVE_DUR
  if (o.t > 0) return false
  // ORCA_COMMITS LINES PER VISIT. One line is one sidestep and then the visit is over, which is
  // half of why it read as easy to avoid. It does not end at the first overshoot: it fades out,
  // comes back up on a fresh bearing and re-aims at wherever the shoal has RE-FORMED - which after
  // a pass is usually the bank its own wake just made.
  //   REBUILT THROUGH THE SAME FIELDS THE SPAWN WRITES, and re-entering `rising` rather than
  // `circling` is load-bearing: leaving has already faded alpha to 0 and rising ramps it back from
  // 0, so the body never teleports across the ring on a visible frame. The second telegraph is
  // therefore identical to the first, which is what keeps it a dodge and not a scheduled hit.
  const left = (o.passes ?? ORCA_COMMITS) - 1
  if (left <= 0) { run.orca = null; return false }
  const bearing = Math.random() * Math.PI * 2
  o.passes = left
  o.state = 'rising'; o.t = ORCA_RISE_DUR; o.alpha = 0
  o.cx = p.x; o.cy = p.y; o.r = ORCA_RING_R; o.ang = bearing
  o.x = p.x + Math.cos(bearing) * ORCA_RING_R
  o.y = p.y + Math.sin(bearing) * ORCA_RING_R
  o.dirX = 0; o.dirY = 0; o.hit = false; o.splashed = false; o.trail = null
  run.events.push({ type: 'orcaRise', x: p.x, y: p.y })
  return false
}

function stepTrawl(run, dt) {
  if (CHAPTERS[run.chapter].signature?.type !== 'trawl') return false
  const p = run.player
  const net = run.net
  if (!net) {
    // The gap between passes is measured from the last pass CLEARING, not from its arrival, so a
    // slow sweep across a wide desktop viewport does not eat its own downtime.
    // The `??` fallback is TRAWL_FIRST_PASS and not TRAWL_INTERVAL, matching what createRun writes:
    // it only fires for a run object someone assembled by hand (a probe, a test fixture), and an
    // undefined countdown means "this run has not had a pass yet", which is the first-pass case. With
    // the interval here instead, a hand-built rig would silently measure a different opening to the
    // chapter than the game gives — the two-places-one-fact shape, in miniature.
    run._netAcc = (run._netAcc ?? TRAWL_FIRST_PASS) - dt
    if (run._netAcc > 0) return false
    // A NEW DIRECTION EVERY PASS, and that is what stops "swim that way forever" being a strategy:
    // outrunning one net is meant to work (spec §6.4 — outrunnable but not ignorable), and it costs
    // you the wake, i.e. the whole chapter's food supply. The next pass then comes from somewhere
    // else, so the price of never being caught is never eating.
    const a = Math.random() * Math.PI * 2
    const nx = Math.cos(a), ny = Math.sin(a)
    // Screen-relative, never world px: the warning IS the mechanic, and a world-px lead would be a
    // different amount of warning on a phone than on a desktop. See TRAWL_LEAD_MUL.
    const lead = run.viewRadius * TRAWL_LEAD_MUL
    const d0 = p.x * nx + p.y * ny
    // Starts on the -n side and advances through the player. `end` is fixed at spawn rather than
    // trailing the player, so a player who outruns the wall ends the pass early instead of towing it.
    run.net = { nx, ny, pos: d0 - lead, end: d0 + lead, holes: [], _acc: 0 }
    return false
  }
  net.pos += TRAWL_SPEED * dt
  if (net.pos > net.end) { run.net = null; run._netAcc = TRAWL_INTERVAL; return false }

  // Contact, on a tick rather than per frame — for the same reason stepRocks grinds on ROCK_TICK:
  // 60 fractional hits a second is unreadable and floods the event stream.
  net._acc += dt
  let ticks = 0
  while (net._acc >= TRAWL_TICK) { net._acc -= TRAWL_TICK; ticks++ }
  if (ticks === 0) return false

  // BOTH SIDES, in the same pass, on the same tick — the mechanic, not a side effect. Precedent is
  // shipped twice: stepRocks and the undergrowth's snap traps, whose config block says outright
  // "it damages BOTH sides, and that IS the mechanic".
  for (const e of run.enemies) {
    if (e._dead) continue
    if (Math.abs(netDist(net, e.x, e.y)) > TRAWL_HALF + e.radius) continue
    if (inNetHole(net, e.x, e.y)) continue
    dealDamage(run, e, TRAWL_ENEMY_DMG * ticks, false, false, true)   // hazard: the player did not deal it
  }
  if (Math.abs(netDist(net, p.x, p.y)) > TRAWL_HALF + PLAYER.radius) return false
  if (inNetHole(net, p.x, p.y)) return false
  // dot: true, which bypasses the invulnerability window on purpose. The net is a place you are
  // standing in, like an acid pool or a spray strip, not a thing that hits you once — and an
  // i-frame window would make swimming through the mesh free, which is the opposite of the chapter.
  // The tell is the shipped one: hurtPlayer pushes {type:'hurt', dot:true}, which render.js already
  // turns into a red vignette and shake and main.js already silences for audio. Publishing into a
  // contract field render.js reads is the whole of the lesson the freeze scar taught.
  return hurtPlayer(run, TRAWL_DMG * ticks, true, 'trawl')
}

// -- The Deep's anglerfish: the refill IS the trap (v7.x) --------------------------------------
//
// A maw is a run.shafts entry, not an enemy — see the MAW_* block in config.js for the owner's
// framing and CHAPTERS.deep.signature.maws for the field. What that buys here is that this function
// owns exactly ONE thing (what happens if you stay) and inherits streaming, the refill and the
// in-circle test from the machinery every other Book 2 chapter already uses.
//
// ONE AUTHORITY FOR "AM I IN THE MOUTH", and it has to be one. The gape below and the refill in
// stepCharge are the two halves of the same promise — "stand here and you are being fed, and the
// mouth opening is how long you have left" — and if those two tests were written separately the
// mouth would open at a range the bar does not fill at. That is the single largest defect class in
// this repo: one fact authored in two places, neither of them an import, so nothing throws. Both
// call inLobe, which is the same test every other refill circle in the game is checked with.
export const inMaw = (sh, x, y) => (sh._shutT ?? 0) <= 0 && inLobe(sh, x, y)

/** The maw currently feeding the point (x, y), or null. Read by stepCharge for the refill. */
export function mawFeeding(run, x, y) {
  if (!CHAPTERS[run.chapter].signature?.maws) return null
  for (const sh of run.shafts) if (inMaw(sh, x, y)) return sh
  return null
}

// Ages every maw's gape and lets the ones that reach a full mouth swallow.
// Returns true if the player died, matching stepTrawl/stepRocks/stepPools' contract.
//
// `gape` (0..1) and `_shutT` are PUBLISHED ON THE SHAFT, deliberately, because render.js draws this
// chapter's whole tell off them (updateShafts' maw branch) and never learns a new field on its own.
// A gape kept private would be a mouth that never opens — and the chapter's entire risk/reward is a
// countdown drawn on an animal's face, so an invisible gape is not a missing polish item, it is the
// mechanic silently deleted. Same lesson as the v7.5x freeze that shipped with no ice tint.
//
// TIME IN THIS MOUTH, NOT THE BAR'S LEVEL. Driving the gape off run.charge was the first design and
// it is strictly worse: the bar is already on the HUD, so the tell would be a second copy of what
// the player is looking at anyway, and every maw in the chapter would open and shut in unison.
// Per-maw and per-visit means the tell is something you can only learn by LOOKING AT THE ANIMAL,
// moving to a different one genuinely resets the gamble, and "one more second" is one more second.
function stepMaws(run, dt) {
  if (!CHAPTERS[run.chapter].signature?.maws) return false
  const p = run.player
  let died = false
  for (const sh of run.shafts) {
    sh._shutT = Math.max(0, (sh._shutT ?? 0) - dt)
    // A maw that has just swallowed is shut: it feeds nobody and its lure is out, which is also the
    // visible signal that this one is spent and you should go and find another.
    const feeding = inMaw(sh, p.x, p.y)
    const rate = feeding ? 1 / MAW_GAPE_T : -MAW_CLOSE_MUL / MAW_GAPE_T
    sh.gape = Math.max(0, Math.min(1, (sh.gape ?? 0) + rate * dt))
    if (sh.gape < 1) continue
    // THE DEVOUR. The whole circle is the mouth, so reaching a full gape while inside it IS being
    // swallowed — there is no second radius to have escaped to, only the seconds you did not take.
    sh.gape = 0
    sh._shutT = MAW_SHUT_T
    run.events.push({ type: 'devour', x: sh.x, y: sh.y, r: sh.r })
    // IT TAKES THE LIGHT TOO, and that is the half that reads as being eaten. Zeroed BEFORE the
    // damage, so a devour that kills you still shows an empty bar on the summary rather than the
    // one you died holding.
    run.charge = 0
    // NOT dot: one discrete swallow, so it respects the invulnerability window like any other hit.
    // The Trawl's net is the opposite case (a place you are standing in) and passes dot: true for
    // exactly that reason — the two are worth reading together.
    if (!died && hurtPlayer(run, p.maxHP * MAW_DEVOUR_FRAC, false, 'devour')) died = true
  }
  return died
}

// -- The Deep's Scent (v7.x) -------------------------------------------------------------------
// Fired from stepRepulse like The Reef's burst and The Trawl's breach — same press, same cooldown,
// same `t`. This is only the part that has to happen every frame afterwards: age the window, and
// keep the mark on everything inside the radius.
//
// RE-MARKED EVERY FRAME rather than stamped once at the press. The alternative reads as a smaller
// change than it is: a one-shot stamp marks the bodies that happened to be in range on the frame
// the button went down, so a body that swims INTO the smell is untouched by it, and the card
// becomes "damage the crowd you already had" instead of "hunt for a few seconds". It also means the
// radius keeps up with the player, which is what "close on them faster" is for.
//
// `scentT` is published on the enemy for render.js to outline, for the same reason `gape` above is.
function stepScent(run, dt) {
  if (!CHAPTERS[run.chapter].scent) return
  run._scentT = Math.max(0, (run._scentT ?? 0) - dt)
  if (run._scentT <= 0) return
  const p = run.player
  const rSq = SCENT_R * SCENT_R
  for (const e of run.enemies) {
    if (e._dead) continue
    const dx = e.x - p.x, dy = e.y - p.y
    if (dx * dx + dy * dy > rSq) continue
    e.scentT = run._scentT
  }
}

// -- The Surf's Wave (v7.x) ---------------------------------------------------------------------
// Fired from stepRepulse like the burst, the breach and the scent — same press, same cooldown, same
// `t` — and this is the part that has to happen every frame afterwards: age the window, then push
// and stagger whatever is still inside it.
//
// IT RIDES THE PLAYER, not the position the button was pressed at. stepScent above makes the same
// choice for the same reason: a window anchored where the press happened is a window you walk out
// of, which would turn a 2.4s move into a 2.4s reason to stand still. The whole ask is about
// CROSSING something, so the wave has to travel with the thing doing the crossing.
//
// The push is an ACCELERATION (note the `* dt`) rather than an impulse, which is the difference
// between a plough and the old shove fired 60 times a second — see SHOREBREAK_FORCE in config.js for the
// terminal-speed maths. It is the same idiom stepNodes uses for its carry.
//
// ALLIES ARE SKIPPED, which is a deliberate divergence from the Pulse's own loop (that one shoves
// everything in run.enemies, allies included). Shoving your own summon is a shrug; a stagger
// REFRESHED every frame for up to 2.4s would disable it for the whole window, and a button that
// turns off your allies is a button you learn not to press next to them.
function stepShorebreak(run, dt) {
  if (!CHAPTERS[run.chapter].shorebreak) return
  run._shorebreakT = Math.max(0, (run._shorebreakT ?? 0) - dt)
  if (run._shorebreakT <= 0) return
  const p = run.player
  const rSq = SHOREBREAK_RADIUS * SHOREBREAK_RADIUS
  const lax = laneAxes(CHAPTERS[run.chapter])
  for (const e of run.enemies) {
    if (e._dead || isAlly(e)) continue
    const dx = e.x - p.x, dy = e.y - p.y
    const dsq = dx * dx + dy * dy
    if (dsq > rSq) continue
    const d = Math.sqrt(dsq)
    // Dead centre has no direction to push along; laneAxes gives the same up-lane fallback the
    // Pulse's loop uses, so a body sitting exactly on the player still goes the way the rest do.
    const ux = d > 1e-6 ? dx / d : lax.fx
    const uy = d > 1e-6 ? dy / d : lax.fy
    const falloff = 1 - d / SHOREBREAK_RADIUS
    e.kb.x += ux * SHOREBREAK_FORCE * falloff * dt
    e.kb.y += uy * SHOREBREAK_FORCE * falloff * dt
    e.stunT = Math.max(e.stunT || 0, SHOREBREAK_STAGGER)
  }
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
// Gated on sig.type === 'tide' so a shaft chapter (no sandbars, no `bars` block) never reads this at all.
export function stepCharge(run, dt) {
  const res = CHAPTERS[run.chapter].resource
  if (!res) return
  const sig = CHAPTERS[run.chapter].signature
  const dryMul = sig && sig.type === 'tide' && onSandbar(run) ? sig.bars.drainMul : 1
  // A DRAIN THAT RIDES THE RUN CLOCK (v7.x, The Wreck). Every other chapter's bar is fed by a PLACE,
  // whose availability does not change over a run, so a constant drain is the right shape for them
  // and `drainPerSpawn` is absent — this reads res.drain exactly as it always did.
  //
  // A bar fed by KILLS is different in kind, because the kill rate is not a constant: measured over
  // 6 seeded 300s runs it spans roughly 0.5/s at t=0 to 15/s at t=280, about 30x. Against a constant
  // drain that means the bar is floored while you are weakest and pinned once you are strong — the
  // pressure curve running backwards against the difficulty curve. Two independent sweeps
  // (drain 5..45 x killBase 0.5..5) found NO constant pair that works: the share of the run the bar
  // spends actually being managed never cleared ~31%, and for a player who hunts the crowd, which
  // is what this chapter asks for, it was 11%.
  //
  // spawnRate(t) is the curve the crowd itself arrives on (0.81/s -> 17.5/s over a run), so scaling
  // the drain by it holds break-even at roughly a fixed FRACTION of the achievable kill rate at
  // every point in the run, instead of at one moment of it. One expression, one existing curve, no
  // new machinery — and it is opt-in per chapter, so nothing else in the game can see it.
  const drainRate = res.drainPerSpawn != null ? res.drainPerSpawn * spawnRate(run.time) : res.drain
  // v7.x Book 2 Task 9: Slow Burn (chargeDrainMul) and Big Gulp (chargeRefillMul) scale the drain
  // and the in-circle refill respectively — both default to 1 (no-op) unbought, and both are 1 in
  // every chapter with no resource, so this is inert wherever it always was.
  // FEED — the drain-slow (v7.x, The Wreck's `resource.feedSlow`). Being INSIDE the food slows the
  // bar's fall; a straight line across the map is never inside anything.
  //
  // ⚠ IT IS A RATE, NOT A REFILL, AND THAT IS THE WHOLE POINT. Bloodlust is clamped at chargeMax,
  // so a multiplier on refill is worth most to whoever is furthest from the clamp — i.e. the player
  // doing worst. Measured, a killBase multiplier paid a straight-line player +167% against a
  // hunter's +31% and collapsed the separation between them from 2.69x to 1.33x: it HALVED the
  // reward for engaging. A rate cannot be clamped, so this pays the same whether the bar is full or
  // empty, and it pays for a POSITION rather than for a kill rate that a straight line already
  // maximises. Opt-in per chapter, so nothing else in the game can see it.
  const feedMul = res.feedSlow
    ? 1 - (1 - FEED_DRAIN_MIN) * Math.min(1, (run._feedN || 0) / FEED_FULL_N)
    : 1
  const p = run.player
  // OXYGEN TANK'S BOIL (v7.x, The Reef). It PAUSES the drain and can never add to the bar: the
  // whole effect is this multiplier, and there is no branch anywhere that writes `c` for a boil.
  // Written as a factor on the drain term rather than as `if (boiling) { ... }` deliberately —
  // WEAPONS.oxygenTank's block says why a second refill source is forbidden (the chapter's measured
  // pocket economy is denominated in pockets being the only one), and a factor of zero is the shape
  // a future editor cannot accidentally turn into a refill by adding a line.
  const airHold = (run.blooms ?? []).some((bl) => {
    if (!bl.airHold || bl.r <= 0) return false
    const dx = p.x - bl.x, dy = p.y - bl.y
    return dx * dx + dy * dy <= bl.r * bl.r
  }) ? 0 : 1
  let c = run.charge - drainRate * dryMul * run.chargeDrainMul * feedMul * airHold * dt
  // Opt-in per FIELD, read through refillSpec() so this asks the streamer's own question rather
  // than a second one that could disagree. 0/undefined everywhere but The Shelf.
  // drawdownSecsFor, not a bare refillSpec read: Dead Water multiplies this clock and all three
  // of its readers (here, foulUpwelling, render.js) must move together or the circle the player
  // watches fade is running a different clock from the one feeding them.
  const drawdownSecs = drawdownSecsFor(run)
  for (const sh of run.shafts) {
    // Inside the circle's own outline: standing IN the light, not brushing its edge. inMaw is that
    // same centre-to-centre test for a round field (every one but The Surf's pools), following the
    // drawn lobes where a field has them — so the water you can see is the water that refills you.
    //
    // ONE TEST FOR ALL FOUR FIELDS, INCLUDING THE DEEP'S MAWS. inMaw is inLobe plus "and this mouth
    // is not shut", and `_shutT` is a field only stepMaws ever writes — so for a sun shaft, a tide
    // pool and an air pocket it is undefined, reads 0, and this is byte-for-byte the old inLobe
    // call. Using the stricter test everywhere is what keeps "the circle that feeds you" and "the
    // circle whose mouth is counting down" from becoming two different circles: a maw that has just
    // swallowed you must not still be topping you up while its jaws are visibly closed.
    if (!inMaw(sh, p.x, p.y)) continue
    // DRAWDOWN (The Shelf's upwellings — signature.drawdownSecs). Standing in one USES IT UP: the
    // occupancy clock runs only while you are inside, and at `drawdownSecs` the circle stops being
    // food. `continue` rather than `break`, so a spent circle you are standing in does not mask a
    // live one you are also touching — two upwellings overlap often enough at chance 0.62.
    //
    // `drawdown` is PUBLISHED ON THE CIRCLE, deliberately, for the same reason the maw's `gape` is:
    // render.js fades the drawing off this exact number, so the five seconds the player watches are
    // the five seconds stepCharge is counting rather than a parallel animation that can disagree.
    // Undefined for every other field, which reads as 0 and leaves those byte-for-byte unchanged.
    const life = drawdownSecs
    if (life > 0) {
      if ((sh.drawdown ?? 0) >= life) continue
      sh.drawdown = (sh.drawdown ?? 0) + dt
    }
    c += res.refill * run.chargeRefillMul * dt
    break
  }
  // THE TRAWL'S REFILL IS NOT A PLACE (see CHAPTERS.trawl.signature). Every other Book 2 chapter's
  // food is a circle on the map that streamShafts materialises into run.shafts, so the loop above
  // finds all four; this chapter's is the churn behind a wall moving at 75 px/s, and there is
  // nowhere on the map to stand. run.shafts is empty here, so this is the only branch that can fire.
  if (inWake(run, p.x, p.y)) c += res.refill * dt
  // v7.x Book 2 Task 9: run.chargeMax, not res.max — Deep Lungs raises the RUN's own ceiling, and
  // this is one of TWO sites that must clamp against it (the other is the per-kill `killBase`,
  // below in dealDamage's kill branch). Missing either one is a flicker: the bar would refill past
  // its cap on a kill and snap back down on the very next tick through whichever site still reads
  // the config max. The Trawl's wake refill feeds `c` too, so it is clamped by this line as well.
  run.charge = Math.max(0, Math.min(run.chargeMax, c))
  // WHAT THE PLAYER CAN SEE, which is the bar in every chapter but this one and during this
  // chapter's own button. render.js's updateDark reads run.sightCharge and nothing else, so the
  // Clear's window lives entirely on the sim side and the renderer learns one field instead of a
  // mechanic — CLAUDE.md's rule after the frozen-enemies scar, where sim knew and render was never
  // told. Every chapter without `clear` writes run.charge here, unchanged, forever.
  //
  // Math.max, not an assignment: a bar that REFILLS past the window's level during the window must
  // keep the better number, or standing in an upwelling mid-Clear would make the water darker.
  run._clearT = Math.max(0, (run._clearT ?? 0) - dt)
  const open = run._clearT > 0 ? Math.min(1, run._clearT / CLEAR_SIGHT_FADE) : 0
  run.sightCharge = Math.max(run.charge, run.chargeMax * open)
}

// -- Drowning (v7.x, The Reef) --------------------------------------------------------
// The Reef's second job for its bar: an EMPTY bar hurts, on a clock, until you breathe. Gated on
// resource.drown so every other chapter returns on line two, like stepCharge itself.
//
// Returns true if the player died, matching stepPools/stepTraps/stepLeaks' contract — it is called
// from stepSim's `if (stepX(...)) return` group for that reason, and NOT folded into stepCharge,
// which has no way to report a death and runs long before the damage steps.
//
// The accumulator lives on the run rather than on an entity because there is only ever one drowning
// player, and it is RESET the moment the bar comes off zero: a partial tick banked before you
// reached a pocket must not be spent on the next time you run dry, minutes later.
//
// THE TELL IS THE SHIPPED ONE, deliberately. hurtPlayer pushes {type:'hurt', dmg, dot:true}, which
// render.js's `hurt` case already turns into a red vignette + shake + flash scaled by the hit's
// share of maxHP, and which main.js already silences for audio (`if (e.dot) continue`). Publishing
// into a contract field render.js already reads is the whole of the fix the freeze scar taught —
// a new {type:'drown'} event would have needed a consumer in two files to be anything but silence.
function stepDrown(run, dt) {
  const res = CHAPTERS[run.chapter].resource
  if (!res || !res.drown) return false
  if (run.charge > 0) { run._drownAcc = 0; return false }
  run._drownAcc = (run._drownAcc ?? 0) + dt
  let died = false
  while (run._drownAcc >= DROWN_TICK) {
    run._drownAcc -= DROWN_TICK
    if (!died && hurtPlayer(run, res.drown.dps * DROWN_TICK, true, 'drown')) died = true
  }
  return died
}

// -- Starving (v7.x, The Wreck) -------------------------------------------------------
// stepDrown's shape, gated on `resource.starve`, and the duplication is deliberate rather than
// unfactored. They are the same MECHANISM answering opposite PROBLEMS, and folding them into one
// `dot` block would hide the only thing worth knowing about either: an empty Air bar is a ROUTING
// failure — you did not cross the lane to a pocket, and the fix is somewhere on the map — where an
// empty Bloodlust bar is a TEMPO failure, you stopped killing, and the fix is the body in front of
// you. Same red pulse, different sentence, and a future editor who reads one should not have to
// discover the other is welded to it.
//
// `src` is 'starve', which is what puts it in the death screen's damage recap under its own name
// rather than inside drowning's row.
//
// Same contract as stepDrown/stepPools/stepTraps: returns true if the player died, so it belongs in
// stepSim's `if (stepX(...)) return` group and never inside stepCharge, which cannot report a death
// and runs long before the damage steps.
function stepStarve(run, dt) {
  const res = CHAPTERS[run.chapter].resource
  if (!res || !res.starve) return false
  if (run.charge > 0) { run._starveAcc = 0; return false }
  run._starveAcc = (run._starveAcc ?? 0) + dt
  let died = false
  while (run._starveAcc >= STARVE_TICK) {
    run._starveAcc -= STARVE_TICK
    if (!died && hurtPlayer(run, res.starve.dps * STARVE_TICK, true, 'starve')) died = true
  }
  return died
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
// THE CELL KEY IS AN INTEGER, NOT 'ci,cj'. This is the hottest function in the sim — 27% of all
// step time in a profiled 300s city run — and it was spending a large share of that on strings:
// one concatenation per live enemy per frame to build the key, four more per bucket to look up
// neighbours, and then indexOf/slice/Number to parse ci and cj back OUT of the key it had just
// built. Packing the pair into one number removes every one of those, and the cells are carried
// alongside their buckets so pass 2 never has to recover them at all.
//
// Range: ENEMY_SEP_CELL is 64px and the offset is 2^19 cells, i.e. ±33.5 MILLION px from the
// origin before two distinct cells could collide. A 300s run at the player's 220px/s tops out
// around 66k px, so this has ~500x headroom; SEP_KEY_SPAN is asserted against SEP_KEY_OFFSET
// below so the two can never drift apart.
const _sepBuckets = new Map()  // packed cell key -> array of run.enemies INDICES, rebuilt every call
const _sepCells = []           // parallel [ci, cj, bucket] triples, so pass 2 needs no key parsing
const SEP_NEIGHBOR_OFFSETS = [[1, 0], [-1, 1], [0, 1], [1, 1]]
const SEP_KEY_OFFSET = 1 << 19
const SEP_KEY_SPAN = 1 << 20
const sepKey = (ci, cj) => (ci + SEP_KEY_OFFSET) * SEP_KEY_SPAN + (cj + SEP_KEY_OFFSET)
function stepEnemySeparation(run) {
  const buckets = _sepBuckets
  buckets.clear()
  _sepCells.length = 0

  // Pass 1: bucket every eligible enemy by its cell.
  for (let i = 0; i < run.enemies.length; i++) {
    const e = run.enemies[i]
    // v7.x The Wreck: local-density accumulators, zeroed for EVERY body before the exclusions below
    // so an excluded one cannot carry a stale count forward. Pass 2 refills them; stepPrey reads
    // them on the NEXT frame, which is why they are not zeroed anywhere earlier in the step.
    e._shoalN = 0
    e._nbrX = 0
    e._nbrY = 0
    if (e._dead) continue
    if (e._phaseSolid === false) continue // v5.4: a ghosted phase flicker passes through everything
    if (e.rosterId === 'bindnode') continue // v5.24: stationary by design, nothing to separate
    if (e.affixes && e.affixes.includes('anchored')) continue // knockback/pull immune — checked by every kb site; separation is morally a kb site
    const ci = Math.floor(e.x / ENEMY_SEP_CELL)
    const cj = Math.floor(e.y / ENEMY_SEP_CELL)
    const key = sepKey(ci, cj)
    let bucket = buckets.get(key)
    if (!bucket) { bucket = []; buckets.set(key, bucket); _sepCells.push(ci, cj, bucket) }
    bucket.push(i)
  }
  if (buckets.size === 0) return

  // Pass 2: within each bucket, resolve against later entries in the SAME bucket (each intra-cell
  // pair once) and against the 4 forward neighbor buckets (each inter-cell pair once — the usual
  // half-neighborhood trick: the other 4 of the 8 neighbors are covered when THEY are the "own"
  // bucket being processed).
  for (let c = 0; c < _sepCells.length; c += 3) {
    const ci = _sepCells[c]
    const cj = _sepCells[c + 1]
    const bucket = _sepCells[c + 2]

    for (let a = 0; a < bucket.length; a++) {
      for (let b = a + 1; b < bucket.length; b++) {
        resolveSeparationPair(run, bucket[a], bucket[b])
      }
    }
    for (let n = 0; n < SEP_NEIGHBOR_OFFSETS.length; n++) {
      const nBucket = buckets.get(sepKey(ci + SEP_NEIGHBOR_OFFSETS[n][0], cj + SEP_NEIGHBOR_OFFSETS[n][1]))
      if (!nBucket) continue
      for (let a = 0; a < bucket.length; a++) {
        for (let b = 0; b < nBucket.length; b++) {
          resolveSeparationPair(run, bucket[a], nBucket[b])
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
  // LOCAL DENSITY (v7.x, The Wreck), and it is counted HERE — before the overlap early-out below —
  // on purpose. After it, `_shoalN` would mean "bodies touching me", which the 2D kissing number
  // caps at SIX, so any threshold above six is unreachable with nothing thrown; it would also be
  // measuring the very overlap this pass exists to destroy. BALL_R is bounded by ENEMY_SEP_CELL so
  // the half-neighbourhood walk above is guaranteed to have visited every pair inside it.
  //   Free of a new loop: this pair has already been found and its squared distance already taken.
  //   `|| 0` rather than a bare ++: flushSpawns can add a body AFTER stepShoals has zeroed the
  // field but BEFORE this pass runs, and ++ on undefined is NaN — which would then poison every
  // multiplier reading it, silently and for that body's whole life.
  //   The neighbour SUMS ride along, and they are what cohesion steers toward. A per-shoal centroid
  // was the first cut and it did not work: shoals are id buckets (floor(id/PREY_SHOAL_SIZE)) whose
  // membership is fixed at spawn and never re-clustered, so at early spawn rates one bucket spans
  // tens of seconds of arrivals scattered across the map — measured mean pairwise distance inside a
  // "shoal" was ~700px, wider than a phone viewport. The centroid of that is not a place, and
  // steering toward it scattered fish (prey within 200px FELL for every policy). A shared drift
  // HEADING only has to be shared; a centroid has to be spatially real. Neighbours are.
  if (distSq < BALL_R * BALL_R) {
    a._shoalN = (a._shoalN || 0) + 1
    b._shoalN = (b._shoalN || 0) + 1
    a._nbrX = (a._nbrX || 0) + b.x; a._nbrY = (a._nbrY || 0) + b.y
    b._nbrX = (b._nbrX || 0) + a.x; b._nbrY = (b._nbrY || 0) + a.y
  }
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
  // v7.x: BOTH are still true of The Reef, whose coral is the spur field (stepSpurs) rather than a
  // collider — a ridge grates and slows the strafe and never pushes, so nothing in a lane is solid
  // to anything and this return stays bare.
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
// -- The bite (v7.x, The Wreck) --------------------------------------------------------
// The half of the Lunge that is not movement. Runs after the player has moved (stepSim's order), so
// it tests where the dash actually is this frame rather than where it started.
//
// ONE BODY, AND THE BITE ENDS THE DASH. Both halves of that are the design rather than an
// optimisation: a dash that keeps going after connecting would sweep a crowd, which is the Pulse
// with damage on it, and this chapter's bar is trying to make you CHOOSE a target. Stopping on
// contact also gives the move a readable ending — you lunge, you connect, you stop — where a lunge
// that carried on through would read as the bite having missed.
//
// A KILL BY THE BITE IS THE ONLY THING IN THE GAME THAT PAYS THE BUTTON BACK. LUNGE_KILL_REFILL
// against a PULSE_CHARGE_COST spend is what makes committing the correct play and hoarding the
// mistake — the loop the chapter exists for, as one line. It is clamped against run.chargeMax like
// the other two charge-writing sites (stepCharge and the kill refill in dealDamage); a third site
// that forgot would show up as the bar overfilling on a bite and snapping back on the next tick.
//
// NO NEW EVENT TYPE. dealDamage already pushes {type:'hit'} and, on a kill, {type:'kill'} — both of
// which render.js and SFX_FOR_EVENT already consume — and the dash itself is 900px/s of player
// movement, which is not subtle. A {type:'lunge'} would have needed a consumer in two files to be
// anything but silence, which is the freeze scar exactly.
function stepBite(run) {
  const ch = CHAPTERS[run.chapter]
  // `_lungeMoved` — the dash must have CARRIED you LUNGE_ARM_DIST before the bite can land. See that
  // constant's block for both halves of why: the step-ordering bug it fixes, and the division of
  // labour it settles between the shove (what is on top of you) and the dash (what is out there).
  if (!ch.lunge || (run._lungeT ?? 0) <= 0 || (run._lungeMoved ?? 0) < LUNGE_ARM_DIST) return
  const p = run.player
  const reach = LUNGE_BITE_MUL * PLAYER.radius
  let best = null, bestD = Infinity
  for (const e of run.enemies) {
    if (e._dead || damageImmune(e)) continue
    const d = Math.hypot(e.x - p.x, e.y - p.y)
    if (d <= reach + e.radius && d < bestD) { best = e; bestD = d }
  }
  if (!best) return
  run._lungeT = 0
  // applyDamage, NOT dealDamage. dealDamage is the raw path sim.js reserves for DoT ticks and arc
  // damage, precisely so those do not re-roll crit or re-apply elements — and hand-multiplying
  // p.damageMul on the way in reproduced exactly one of the six factors the real pipeline applies.
  // A 45-charge signature button belongs on the pipeline: it should crit, it should carry the
  // player's elements (ignite, freeze, venom), it should read passives, shop damage, anomalies and
  // rampage. Above all it must read resourceDamageMul — without it, THIS CHAPTER'S OWN 1.0->1.8
  // Bloodlust damage line did not apply to THIS CHAPTER'S OWN signature verb.
  // MINIME_BURST_DMG, cited as the precedent for a flat number, reaches the enemy this way too.
  applyDamage(run, best, LUNGE_DMG)
  // `_dead` rather than `hp <= 0`: dealDamage sets it on the kill branch, and it is the flag every
  // other consumer in this file reads. A shield can also eat the whole bite (SHIELD_HP_FRAC), in
  // which case nothing died and nothing is owed.
  if (best._dead) run.charge = Math.min(run.chargeMax, run.charge + LUNGE_KILL_REFILL)
}

function stepCrush(run) {
  const ch = CHAPTERS[run.chapter]
  if (!ch.crush) return
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

// -- Erasure strips (v5.3; the garden's sprayStrip elites are long gone — v6.6.14) -----
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
      // 'erase', NOT 'spray'. The garden's pesticide strips were deleted in v6.6.14 and every
      // producer left pushes look:'erase' (the boss's bands, the eraser's wake, immuneMemory
      // residue) — so the label went on telling a player killed by The Blank that Pesticide did it.
      // Read the push sites, not the label: `grep -n "strips.push" src/sim.js` is the whole check.
      if (!playerDied && hurtPlayer(run, s.dps * STATUS_TICK, true, 'erase')) playerDied = true
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
        if (!playerDied && hurtPlayer(run, SNAP_TRAP_DMG, false, 'trap')) playerDied = true
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
        // THE LANE ALREADY CARRIES ITS OWN IDENTITY — take the label off `look` rather than off the
        // stepper, which serves two vehicles. run.lanes is pushed by the city's taxi (look:'car')
        // and by the garden's mower (look:'mower'), and one shared 'traffic' label told a player
        // mown down in a flowerbed that TRAFFIC killed them. Same class of bug as 'spray' above,
        // and the same fix: the discriminator was already on the entity, unread.
        if (hurtPlayer(run, lane.dmg, dotHit, lane.look === 'mower' ? 'mower' : 'traffic')) playerDied = true
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
      dealDamage(run, e, toEnemy, false, false, true)   // hazard: never feeds the element window
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

// -- The Surf's gulls (v7.x): a hazard, not an enemy -----------------------------------
// Every GULL_RATE seconds a gull picks something ALIVE on the beach and drops on it. It rides
// run.bombs for the same reason the sky's thunder does — the telegraph -> blast contract already
// exists, and stepBombs already damages the player AND every enemy inside the radius, which is
// exactly the owner's rule that a gull "targets any enemy or you, they want to feed". Nothing here
// aims at the player as such: it picks a TARGET, and most of what is alive on that beach is not you.
//
// Aimed at where the target IS, with no lead. A gull that predicted your movement would be a
// homing attack wearing a bird costume; this is a thing that commits to a spot and can be walked
// out of, which is what makes the shadow a telegraph rather than a countdown to an unavoidable hit.
function stepGullStrike(run, dt) {
  if (!CHAPTERS[run.chapter].gulls) return
  run._gullAcc = (run._gullAcc ?? GULL_RATE) - dt
  if (run._gullAcc > 0) return
  run._gullAcc += GULL_RATE
  if (run.bombs.length >= SHELL_MAX_LIVE) return
  // Pick the prey. Allies are excluded: SUBMISSION's ally is yours, and a hazard that eats it would
  // be a card silently destroying itself. Elites are fair game — a gull does not check.
  const prey = []
  for (const e of run.enemies) if (!e._dead && !isAlly(e)) prey.push(e)
  const p = run.player
  const target = (prey.length === 0 || Math.random() < GULL_PLAYER_SHARE) ? p : prey[Math.floor(Math.random() * prey.length)]
  run.bombs.push({
    x: target.x, y: target.y,
    radius: GULL_RADIUS, fuse: GULL_FUSE, duration: GULL_FUSE,
    dmg: GULL_DMG,
    src: 'gull',   // render branches on this — the shadow, and the bird that lands on it
  })
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
    if (!playerDied && p.invuln <= 0 && hurtPlayer(run, s.dmg, false, 'missile')) playerDied = true
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
  // null outside a lane chapter — see the drag below, which is the only thing that reads it.
  const ax = CHAPTERS[run.chapter].lane ? laneAxes(CHAPTERS[run.chapter]) : null
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
    // v5.18: in a lane the lane OWNS the FORWARD axis — the player advances at exactly
    // LANE_SCROLL_SPEED and nothing is allowed to change that, or the scroll rate stops being the
    // one predictable thing in the chapter. So an abduction beam drags you ACROSS the lane only,
    // which is also the only axis you can fight it on. Everywhere else it pulls in both, unchanged.
    if (!ax || ax.cross === 'x') p.x += (dx / d) * PULL_BEAM_FORCE * dt
    if (!ax || ax.cross === 'y') p.y += (dy / d) * PULL_BEAM_FORCE * dt

    e._beamAcc = (e._beamAcc ?? 0) + dt
    while (e._beamAcc >= STATUS_TICK) {
      e._beamAcc -= STATUS_TICK
      if (!playerDied && hurtPlayer(run, PULL_BEAM_DPS * STATUS_TICK, true, 'beam')) playerDied = true
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

    // balance_decision : an active shorebreak blocks a gull blast on the player 2026-08-17
    //  - `src === 'gull'` is load-bearing: run.bombs is shared with the skies' bombardment and
    //    every volatile elite core, which must NOT gain an immunity window. Enemy side untouched.
    const shielded = b.src === 'gull' && (run._shorebreakT ?? 0) > 0
    if (!playerDied && p.invuln <= 0 && !shielded) {
      const dx = p.x - b.x, dy = p.y - b.y
      // The player side is FLAT, core or not (config.js CORE_BLAST_ENEMY_MUL): the card's cost is
      // priced against player maxHP, which does not ride hpScale.
      if (dx * dx + dy * dy <= b.radius * b.radius && hurtPlayer(run, b.dmg, false, 'bomb')) playerDied = true
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

    // `src` rides the event (additive). The skies already recover it by diffing last frame's
    // run.bombs against this one; carrying it here is what lets a chapter that is NOT the skies
    // theme its own detonation — The Surf's gull has to know it was a gull to draw the bird.
    run.events.push({ type: 'explode', x: b.x, y: b.y, radius: b.radius, src: b.src })
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
// `hazard` marks damage the PLAYER did not deal — chapter vehicles, the pounce trap. Under the
// elements redesign it is excluded from the damage window: those sources deal a fixed fraction of
// the target's OWN maxHP (traffic and the mower 0.5, roadkill 1.0, the trap 0.25), so the
// denominator cancels and one car pass would hand every enemy in the chapter half a freeze meter,
// elites included, for free. Measured before the flag existed: 23.7% of city's damage events remove
// >=25% of an enemy's maxHP in a single step, against 6.3% in undergrowth.
function dealDamage(run, enemy, dmg, crit, dot = false, hazard = false) {
  // Untouchable windows (v5.4): an owl overhead / a ghosted flicker eats nothing at all — no
  // number, no flash, no status, no death. Checked before everything else, including DoT ticks.
  if (damageImmune(enemy)) return
  // Shielded (elite affix): while above SHIELD_HP_FRAC of maxHP, the shield absorbs part
  // of every hit. Checked before venom amp per spec (shield softens the raw hit first).
  if (enemy.elite && enemy.affixes && enemy.affixes.includes('shielded') && enemy.hp > enemy.maxHP * SHIELD_HP_FRAC) {
    dmg *= SHIELD_DMG_MUL
  }
  // Venom amplifies ALL damage the enemy takes. Derived from the damage window, not stored as
  // stacks — which is why it responds to every source rather than only to weapon hits.
  const amp = elVenomAmp(run, enemy)
  if (amp > 0) dmg *= (1 + amp)
  // panicRout (v5.4 chitterShriek mod): a FLEEING enemy takes amplified damage from EVERY source —
  // applied here alongside the venom amp, so DoT ticks and combo bursts get it too.
  if ((enemy.fearT || 0) > 0) {
    const rout = run.weaponMods.chitterShriek?.panicRout ?? 0
    if (rout > 0) dmg *= (1 + rout)
  }
  // SCENT (v7.x, The Deep): a marked body takes amplified damage from EVERY source, which is why
  // it sits here beside the venom amp and panicRout rather than inside a weapon. The button is sold
  // as "see them better, so you can do more damage" — a bonus that only applied to direct weapon
  // hits would quietly exclude burns, arcs and hazards, i.e. exactly the damage a player who just
  // spent their whole bar is relying on.
  if ((enemy.scentT || 0) > 0) dmg *= SCENT_DMG_MUL
  dmg = Math.round(dmg)

  // THE SHORE CRAB'S GUARD. Only the HP removal is refused; everything below still runs, and that
  // is the mechanic rather than an oversight. The element WINDOW keeps filling (so cold and venom
  // build on a guarded crab), and applyDamage calls applyElements with the full pre-block `dmg`
  // regardless of what came off — so a shot into a raised claw still lights the fire that kills it.
  // Zeroing the window here instead would leave the advertised counter reachable only in theory.
  const blocked = guardBlocks(run, enemy, dot)
  if (!blocked) enemy.hp -= dmg
  // EVERY player damage source feeds the window — weapon hits, burn ticks, arc damage, allies.
  // That is deliberate and load-bearing: feeding it only from applyDamage let a fire build kill
  // enemies without filling any window, which stopped a fire+cold build freezing anything at all.
  // The numerator is HP actually removed, after the shield affix, the venom amp and the rounding.
  if (!hazard && enemy.maxHP > 0) {
    const frac = dmg / enemy.maxHP
    elAdd(enemy._elVenom, frac)
    // Cold accumulates at a reduced rate while the enemy is resisting, and not at all while it is
    // already frozen. Reducing the INTAKE is what makes the resist window a delay rather than an
    // impossibility — scaling the threshold instead means "cannot freeze at any rarity".
    if ((enemy._elFrozen ?? 0) <= 0) {
      elAdd(enemy._elCold, frac * ((enemy._elResist ?? 0) > 0 ? EL_FREEZE_RESIST : 1))
    }
  }
  // DoT ticks don't white-flash: with ignite/venom up they fire every STATUS_TICK and
  // the enemy would strobe white permanently
  if (!dot && !blocked) enemy.hitFlash = 0.12
  // A blocked hit gets its OWN event, not a `hit` carrying dmg. Pushing `hit` would float the
  // damage number the player did not deal — the single most misleading thing this could do, and
  // measuring damage off `hit` events is already a documented trap in this repo. It also has to be
  // SOME event: a shot that vanishes silently reads as the weapon being broken, which is exactly
  // the failure the elements redesign shipped. render.js and SFX_FOR_EVENT both consume this.
  if (blocked) run.events.push({ type: 'guardblock', x: enemy.x, y: enemy.y, angle: enemy.guardAngle })
  else run.events.push({ type: 'hit', x: enemy.x, y: enemy.y, dmg, crit, dot })

  if (enemy.hp <= 0 && !enemy._dead) {
    enemy._dead = true
    run.kills++
    // v7.x: `killBase` (The Wreck) is the ONLY thing a kill adds to a bar. Every chapter whose bar
    // is refilled by a PLACE gets nothing here — a free kill refill would be a second source
    // competing with the chapter's own geometry, which is what abolished The Reef's bar when the
    // Scavenger unlock still existed. The Wreck has no place: it declares `refill: 0` and no
    // signature field, so with no per-kill baseline its bar would have no refill at all. Undefined
    // in every other chapter -> `?? 0` -> those chapters come out unchanged.
    //
    // Clamped against run.chargeMax (Task 9), NOT CHAPTERS[chapter].resource.max — this is the
    // SECOND of the two clamp sites Deep Lungs needs (see stepCharge's own note above); missing this
    // one lets the bar refill past its cap on a kill, only to be clamped back down by stepCharge's
    // own (correct) clamp on the next tick.
    const _res = CHAPTERS[run.chapter].resource
    const _gain = _res?.killBase ?? 0
    if (_res && _gain > 0) run.charge = Math.min(run.chargeMax, run.charge + _gain)
    // GORGE (v7.x, gnash): "eating elites replenish full hunger bar". Placed here rather than at a
    // bite site on purpose — the card says EATING an elite, so it must pay however the elite died,
    // including to the oil, the leak or a Lunge. Guarded by the mod, which only gnash carries, so
    // every chapter without it is bit-for-bit unchanged.
    if (_res && enemy.elite && (run.weaponMods.gnash?.gorge ?? 0) > 0) run.charge = run.chargeMax
    // tankRefill (v7.x, The Wreck): a moray is worth breaking off a chase for. Chapter-scoped by
    // the field being absent everywhere else, and stacked on killBase rather than replacing it.
    if (_res?.tankRefill && enemy.type === 'tank') {
      run.charge = Math.min(run.chargeMax, run.charge + _res.tankRefill)
    }
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
    // DEFERRED for the same reason the `split` flag below queues — this whole branch runs from
    // dealDamage, i.e. from inside whichever weapon sweep landed the killing blow, and an
    // immediate push puts the wisps behind that sweep's cursor where the same cast kills them
    // before they have lived a frame. The two paths were asymmetric until now: the flag was
    // fixed in v7.62 and the affix, thirteen lines above it, was not.
    if (enemy.elite && enemy.affixes && enemy.affixes.includes('splitter')) {
      for (let i = 0; i < SPLITTER_COUNT; i++) {
        const a = Math.random() * Math.PI * 2
        const d = Math.random() * 20
        spawnEnemy(run, { type: 'wisp', x: enemy.x + Math.cos(a) * d, y: enemy.y + Math.sin(a) * d, forceNormal: true, deferred: true })
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
    // v7.55 §5.3 owner ruling: Humidity only. run.chargeMax (Task 9 fix round): Deep Lungs' own
    // ceiling, not the config max — see resourceDamageMul's own note.
    * resourceDamageMul(run.charge, CHAPTERS[run.chapter].resource, run.chargeMax)
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

// ---- Elemental status ------------------------------------------------------------------
// Applied once per real weapon hit (from applyDamage), using that hit's final dealt damage as
// the basis. DoT ticks and arc damage deal their damage via dealDamage directly (not
// applyDamage) so they don't re-roll crit/player multipliers or recursively re-apply elements.

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

// ---- Elements: what a hit does -------------------------------------------------------
// Only fire and lightning act ON THE HIT. Cold and venom are read from the damage window, which
// dealDamage already filled — so they need no application step at all, and they respond to every
// damage source rather than only to weapon hits.
function applyElements(run, enemy, dmgDealt) {
  const am = alignmentMul(run)
  const fire = elP(run, 'fire')
  if (fire > 0) {
    // The strongest burn wins. A chip hit landing after a crit must not downgrade the fire, and
    // owner's call: heavy hits burn deep, fast weapons burn many things shallowly.
    const dps = (EL_FIRE_SHARE * elScale(fire * am) * dmgDealt) / EL_WINDOW
    if (dps > (enemy.igniteDps ?? 0)) { enemy.igniteDps = dps; enemy.ignite = EL_WINDOW }
    enemy._fireJumps = WILDFIRE_JUMPS   // unconditional, exactly as the original path does
  }
  const light = elP(run, 'lightning')
  if (light > 0) elArc(run, enemy, light * am, dmgDealt)
}

// Lightning: arcs to the nearest enemies for a share of the hit, and rolls to forward whatever the
// source is suffering. Chill and venom are deliberately NOT forwarded — the arc's own damage lands
// in each target's window against ITS maxHP, so they spread correctly and automatically. Copying
// them instead would carry a magnitude computed against one health bar onto a different one.
function elArc(run, source, P, dmgDealt) {
  if (source._shockCd > 0) return
  const k = elScale(P)
  const arcs = 1 + Math.floor(k)
  const range = SHOCK_RANGE * (1 + EL_LIGHT_RANGE * k)
  const rangeSq = range * range
  const near = []
  for (const e of run.enemies) {
    if (e === source || e._dead || isAlly(e)) continue
    const dx = e.x - source.x, dy = e.y - source.y
    const dSq = dx * dx + dy * dy
    if (dSq <= rangeSq) near.push({ e, dSq })
  }
  if (near.length === 0) return
  source._shockCd = SHOCK_CD
  near.sort((a, b) => a.dSq - b.dSq)
  const targets = near.slice(0, arcs).map((n) => n.e)

  const arcDmg = Math.round(EL_LIGHT_SHARE * k * dmgDealt)
  const fwd = Math.min(1, EL_LIGHT_FORWARD * k)
  for (const t of targets) {
    if (arcDmg > 0) dealDamage(run, t, arcDmg, false)
    // Forward the DAMAGE-shaped afflictions only. Both are absolute dps, so they carry across
    // without needing to be re-derived against the target's health.
    if (Math.random() < fwd) {
      if ((source.igniteDps ?? 0) > (t.igniteDps ?? 0)) { t.igniteDps = source.igniteDps; t.ignite = EL_WINDOW }
      if ((source.bleedDps ?? 0) > (t.bleedDps ?? 0)) { t.bleedDps = source.bleedDps; t.bleed = source.bleed }
    }
  }
  run.events.push({ type: 'shockarc', points: [[source.x, source.y], ...targets.map((t) => [t.x, t.y])] })
}

// Entry point called by applyDamage after every real weapon hit lands.
// Ages both damage windows, runs the freeze, and ticks the burn and bleed DoTs. Cold's movement
// effect lives in stepEnemyMovement; venom has no tick at all, because it deals no damage.
function stepStatuses(run, dt) {
  for (const e of run.enemies) {
    if (e._dead || isAlly(e)) continue   // SUBMISSION: an ally next to a shocked body is the nearest thing there is

    if (e._shockCd > 0) e._shockCd = Math.max(0, e._shockCd - dt)

    elStep(e._elCold, dt)
    elStep(e._elVenom, dt)
    if (e._elFrozen > 0) {
      e._elFrozen = Math.max(0, e._elFrozen - dt)
      if (e._elFrozen <= 0) e._elResist = EL_FREEZE_RESIST_T
    } else {
      if (e._elResist > 0) e._elResist = Math.max(0, e._elResist - dt)
      // 100% slow IS frozen — there is no second threshold to cross.
      if (!elNeverFreezes(e) && elSlow(run, e) >= 1) {
        e._elFrozen = EL_FREEZE_T
        elClear(e._elCold)          // consume it outright; a scalar "spent" marker ratchets
        run.events.push({ type: 'freeze', x: e.x, y: e.y })
      }
    }

    // PUBLISH TO THE CONTRACT FIELDS render.js reads (`frozen`, `chill`, `venom` — see the
    // "Elemental status" block there). These three are DERIVED, not stored: nothing else writes
    // them. Miss one and that status becomes invisible, which on screen is indistinguishable from
    // the mechanic being broken — it has happened twice, to freeze and then to venom.
    // `chill` carries the SLOW FRACTION and `venom` the damage-taken AMP, both 0..1-ish; render
    // scales its tint by them, so they are the thing a tell wants, not a countdown.
    e.frozen = e._elFrozen ?? 0
    e.chill = e.frozen > 0 ? 0 : elSlow(run, e)
    e.venom = elVenomAmp(run, e)

    if (e.ignite > 0) {
      // The burn has its own tick (EL_BURN_TICK, twice STATUS_TICK) and its own floor. At the
      // shared 0.25s a burn was 12 ticks of ~4% of the hit — "1" on a median hit, and 3.1% of
      // ticks rounded to nothing at all. Fewer, bigger ticks print the same total in numbers a
      // player can read; the floor stops a small burn silently dealing zero.
      e.ignite = Math.max(0, e.ignite - dt)
      e._igniteAcc = (e._igniteAcc || 0) + dt
      while (!e._dead && e._igniteAcc >= EL_BURN_TICK) {
        e._igniteAcc -= EL_BURN_TICK
        dealDamage(run, e, Math.max(EL_BURN_MIN, e.igniteDps * EL_BURN_TICK), false, true)
      }
      if (e.ignite <= 0) { e.igniteDps = 0; e._igniteAcc = 0 }
    }

    // Bleed (v5.0, flagella's barbed mod): a plain dot-flagged DoT, no element potency, just
    // BARBED_DURATION seconds of bleedDps. Lightning can forward it (see elArc).
    if (e.bleed > 0) {
      e.bleed = Math.max(0, e.bleed - dt)
      e._bleedAcc = (e._bleedAcc || 0) + dt
      while (!e._dead && e._bleedAcc >= STATUS_TICK) {
        e._bleedAcc -= STATUS_TICK
        dealDamage(run, e, e.bleedDps * STATUS_TICK, false, true)
      }
      if (e.bleed <= 0) { e.bleedDps = 0; e._bleedAcc = 0 }
    }
  }
}

// Nearest enemy within (viewRadius + pad), or null. Shared by weapons that target on fire.
// The nearest body that is FOOD — anything not mapped onto the `tank` archetype. Written against
// the archetype rather than against `skittish` on purpose: a chapter could field a non-fleeing prey
// animal, and what the Lunge must avoid is the thing that shrugs the bite off, which is the tank.
// Returns null when there is none in range; every caller falls back to nearestEnemy.
function nearestPrey(run, pad = 100) {
  const p = run.player
  const rangeSq = (run.viewRadius + pad) ** 2
  let target = null
  let bestSq = Infinity
  for (const e of run.enemies) {
    if (isAlly(e) || e._dead) continue
    if (e.type === 'tank') continue
    const dx = e.x - p.x, dy = e.y - p.y
    const dSq = dx * dx + dy * dy
    if (dSq <= rangeSq && dSq < bestSq) { bestSq = dSq; target = e }
  }
  return target
}

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

// A UNIFORMLY RANDOM enemy that is actually ON SCREEN, or null. Owner, 2026-08-18: "this targets
// the closest enemy, which will be bitten in the next .5s. it should target a random visible
// enemy". The nearest body is the one gnash's jaw and the Lunge are BOTH already pointed at, so a
// zone planted there spends itself on something that was about to die either way — the card looks
// like it fired and does nothing you had not already bought.
//
// THE RECTANGLE, NOT THE RADIUS. run.viewRadius is the screen's half-DIAGONAL: on a portrait phone
// it reaches ~465px while the horizontal half-view is only ~195, so picking by radius would plant
// zones off the side of the screen — an effect arriving from nowhere, which is worse than one
// arriving too close. run.viewW/viewH are the half-extents main.js keeps in step with the real
// canvas (state.js), and they are what "visible" means here.
//
// ONE random draw rather than one per candidate: reservoir sampling would burn a crowd-sized number
// of randoms on every cast, and this project's suite seeds Math.random once per scenario — a draw
// count that moves with the crowd size re-phases every sampled statistic downstream of it.
function randomVisibleEnemy(run) {
  const p = run.player
  const hw = run.viewW ?? run.viewRadius ?? 0
  const hh = run.viewH ?? run.viewRadius ?? 0
  const seen = []
  for (const e of run.enemies) {
    if (e._dead || isAlly(e)) continue
    // A body with no position must never be a target: a zone planted at NaN renders nothing at all,
    // which is a silent no-op rather than an error. nearestEnemy gets this free — its `dSq <=
    // rangeSq` is false for NaN, so such a body is simply never nearest — but a filter phrased as
    // "outside, so skip" is false for NaN too, and therefore KEEPS it. Same data, opposite outcome,
    // and it cost two probe rounds to see.
    if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) continue
    if (Math.abs(e.x - p.x) > hw || Math.abs(e.y - p.y) > hh) continue
    seen.push(e)
  }
  return seen.length ? seen[Math.floor(Math.random() * seen.length)] : null
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
  // The Shelf's Downwash. `secondFall` (the count) and `plunge` (the trigger) are read at their own
  // sites, like every other count and every other behavioural mod — a count folded here would grow
  // the stat and leave the loop bound alone, which renders identically to no mod at all.
  downwash:  { suction: ['pull', 'pct'], widePour: ['radius', 'pct'], lingering: ['duration', 'pct'], deluge: [['dmg', 'burst'], 'pct'] },
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
  // v7.x The Wreck. No `range` entry and that is deliberate — see WEAPON_MODS.gnash for why a reach
  // mod would make the weapon worse, and no `arc` or rate entry either: gnash sells behaviour
  // (bloodrush, gorge, bloodInTheWater, deathRoll) rather than its own two most generic numbers.
  gnash:         { deepBite: ['dmg', 'pct'] },
  // v7.x The Wreck's herding kit. deepChum/slickTrail are behavioral and read at their own sites.
  chum:          { widerChum: ['aggro', 'pct'], longerChum: ['dur', 'pct'] },
  bilge:         { wideBilge: ['maxR', 'pct'], thickOil: ['dur', 'pct'] },
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
  // The Surf's three natives. Every count mod here folds as 'flat' rather than going through
  // WEAPON_COUNT_MODS: that map exists for counts read at a fire site, and a count that lives in
  // levels[] is folded correctly by effectiveWeaponStats — which also means the build sheet reports
  // it without a second registration. `backwash` and `fastSkim` are the exceptions and both are
  // registered elsewhere (a switch read at the cast site, and WEAPON_RATE_MODS respectively).
  breaker:       { swell: ['dmg', 'pct'], longshore: ['radius', 'pct'], broadCrest: ['arc', 'pct'] },
  // The Shelf's starter. `flare` folds onto `arc` exactly as broadCrest does, which also means the
  // pause build sheet reports the WIDENED cone rather than the base one.
  // NOTHING FOLDS ONTO `r` HERE, deliberately -- reach is level-only on this weapon (see the fence
  // over WEAPON_MODS.bubblePuff, and run LL.a2). `scour` and `backblow` are read at the cast site
  // (one scales damage by the pollution bar, the other spawns a second nova) and
  // `quickBreak`/`quickWinch` are rate mods in WEAPON_RATE_MODS, since folding one into an interval
  // would SLOW the weapon.
  bubblePuff:    { froth: ['dmg', 'pct'], flare: ['arc', 'pct'] },
  skippingShell: { skimmer: ['dmg', 'pct'], flatStone: ['skips', 'flat'], wideSplash: ['r', 'pct'], sidearm: ['speed', 'pct'] },
  barnacles:     { grinder: ['dmg', 'pct'], encrust: ['crustDur', 'pct'], spawnfall: ['count', 'flat'], seedbed: ['jumps', 'flat'], broadcast: ['castRange', 'pct'] },
  // The Shelf's other two. Both count mods fold as 'flat' onto a real `count` key in levels[], so
  // effectiveWeaponStats reports the modified number without a second registration in
  // WEAPON_COUNT_MODS -- that map is only for counts read at a fire site with no levels[] key.
  // `foulSpring` is behavioural and `foulWater` is a RATE mod that ramps with the pollution bar;
  // both are read at their own fire sites, which is why neither is here nor in WEAPON_RATE_MODS.
  siltVeil:      { grit: ['dmgPerTick', 'pct'], billow: ['maxR', 'pct'], roil: ['clouds', 'flat'] },
  ballast:       { deadweight: ['dmg', 'pct'], jetsam: ['weights', 'flat'] },
  // The Trawl's two natives. `twinSet` and `doubleHaul` are absent for the reason the block above
  // gives: they are per-cast COUNTS with no key in levels[], so they are read at the fire site like
  // hole's `singularity`. Everything else folds, which is also what puts the modified number (not
  // the base one) on the pause build sheet.
  longline:      { barbed: ['dmg', 'pct'], longSet: ['length', 'pct'], deepSet: ['setDur', 'pct'] },
  netToss:       { wideNet: ['r', 'pct'], heavyMesh: ['hold', 'pct'], weighted: ['dmg', 'pct'] },
  // The Twilight's three natives. `secondSun` folds as 'flat' rather than going through
  // WEAPON_COUNT_MODS for the reason the Surf block above gives: `count` is a real key in levels[],
  // so effectiveWeaponStats folds it and the pause sheet reports it without a second registration —
  // and sunspearSpots reads the folded number as BOTH its loop bound and its padding divisor.
  // `quickKindle` is absent here and registered in WEAPON_RATE_MODS instead: folding a rate pick
  // into `interval` would SLOW the weapon.
  sunspear:      { highNoon: ['dmg', 'pct'], broadBeam: ['r', 'pct'], zenith: ['castRange', 'pct'], secondSun: ['count', 'flat'] },
  foxfire:       { emberfeed: ['dmg', 'pct'], gloaming: ['maxR', 'pct'], longBurn: ['glowDur', 'pct'] },
  sunlance:      { whetted: ['dmg', 'pct'], farReach: ['length', 'pct'], broadEdge: ['width', 'pct'], heldLance: ['duration', 'pct'] },
  // The Reef's two natives. `quickSnap`/`quickWake` are rate mods registered in
  // WEAPON_RATE_MODS (folding one into an interval would SLOW the weapon), and `backblast` and
  // `overgrowth` are switches read at their own fire sites. `moreRidges` folds as 'flat' onto a
  // real levels[] key rather than going through WEAPON_COUNT_MODS, for the reason the Surf block
  // above gives — which also means the fire site reads the MODIFIED count off one local.
  pistolShrimp:  { overpressure: ['dmg', 'pct'], longCrack: ['length', 'pct'], wideCrack: ['width', 'pct'] },
  fireCoral:     { hotPolyps: ['dmg', 'pct'], emberBed: ['duration', 'pct'], moreRidges: ['ridges', 'flat'] },
  // The Reef's other two. Same split: three folds apiece, one rate mod in WEAPON_RATE_MODS, and one
  // switch read at its own site (`pressureWave`, at the landing in stepLobs). `secondJet` folds as
  // 'flat' onto a real levels[] key so fireInk's ONE local is both the loop bound and the spacing
  // divisor — and so the pause sheet reports the modified count with no second registration.
  squidInk:      { blackout: ['maxR', 'pct'], deepDark: ['blind', 'pct'], lingering: ['dur', 'pct'], secondJet: ['clouds', 'flat'] },
  oxygenTank:    { overfilled: ['dmg', 'pct'], wideRupture: ['r', 'pct'], longBoil: ['boil', 'pct'] },
  // The Deep's native. `thrash` is absent for the reason the pond block above gives: it is an
  // attack-RATE mod, and folding one into `interval` would slow the weapon down. It divides the
  // interval at the fire site instead and is registered in WEAPON_RATE_MODS.
  finHit:        { serrated: ['dmg', 'pct'], broadFin: ['arc', 'pct'], longFin: ['range', 'pct'] },
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

// The global fire-rate multiplier every weapon's cadence divides by. ONE function because this
// expression was authored TWICE — once in stepWeapons and once in buildReadout, which exists
// precisely so the pause screen does not report a weapon's paper numbers. Two copies of the term
// that decides "the numbers you are actually firing" is the one-fact-two-places drift this
// project's whole test strategy is built around, and it was one edit away from the pause sheet
// quietly disagreeing with the game.
//
// resourceRateMul is a no-op for every chapter that declares no `resource.rate` block — which is
// every chapter but The Wreck — so this is byte-identical everywhere it already ran.
//
// RAMPAGE IS NOT IN HERE, deliberately: buildReadout must not fold a transient window into a
// build sheet the player reads while paused, so stepWeapons multiplies it on at its own call site
// exactly as it always did.
function globalFireRate(run) {
  return run.player.fireRateMul * (1 + run.passives.fireRate)
    * resourceRateMul(run.charge, CHAPTERS[run.chapter].resource, run.chargeMax)
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
  const globalRate = globalFireRate(run)
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
    // ORDERED — and the order, the membership and the words now all live in ONE table,
    // STAT_KEYS in config.js, which is also where the reasoning behind each slot is written down.
    // This used to be a hardcoded array here and a separate STAT_LABEL map in ui.js, and a stat
    // needed both or it was silently missing from the build sheet.
    for (const key of STAT_ROW_KEYS) {
      if (base[key] == null || eff[key] == null) continue
      stats.push({ key, value: eff[key], base: base[key] })
    }
    const interval = base.rate ?? base.interval
    // A WEAPON WITH NO CADENCE MUST NOT REPORT ONE. Bilge under Trailing Slick fires by DISTANCE
    // TRAVELLED, not on its timer (stepBilgeWeapon), so `base.rate` is a number the game no longer
    // reads — and this sheet exists precisely so the pause screen never prints a weapon's paper
    // numbers. Without the guard a player who picks the mod still sees "Every 4.2s" for a card
    // that has no interval at all, which is the one-fact-two-places drift with nothing to throw.
    const noCadence = w.id === 'bilge' && (mods.slickTrail ?? 0) > 0
    if (interval != null && rateDiv > 0 && !noCadence) stats.push({ key: 'every', value: interval / rateDiv, base: interval })
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
  const fireRateMul = globalFireRate(run)
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
    else if (w.id === 'breaker') stepBreakerWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'skippingShell') stepShellWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'barnacles') stepBarnacleWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'longline') stepLonglineWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'netToss') stepNetTossWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'sunspear') stepSunspearWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'bubblePuff') stepBubblePuffWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'siltVeil') stepSiltVeilWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'ballast') stepBallastWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'downwash') stepDownwashWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'foxfire') stepFoxfireWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'sunlance') stepSunlanceWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'finHit') stepFinHitWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'gnash') stepGnashWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'chum') stepChumWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'bilge') stepBilgeWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'pistolShrimp') stepSnapWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'fireCoral') stepFireCoralWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'squidInk') stepSquidInkWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'oxygenTank') stepTankWeapon(run, w, stats, fireRateMul, dt)
  }

  stepBullets(run, dt)
  stepNovas(run, dt)
  stepBoomerangs(run, dt)
  stepMines(run, dt)
  stepHomingShots(run, dt)
  stepHoles(run, dt)
  stepBeams(run, dt)
  stepBlooms(run, dt)
  stepPolyps(run, dt)
  stepLures(run, dt)
  stepClawSlashes(run, dt)
  stepZones(run, dt)
  stepLobs(run, dt)
  stepLonglines(run, dt)
  // v7.23 skies. stepDrags moves bodies, so it runs BEFORE the dead sweep below and before
  // stepArcs, whose fork is rebuilt from live positions — a hooked aircraft should already be at
  // its new spot when the breath decides where to jump.
  stepDrags(run, dt)
  stepArcs(run, dt)
  // The Surf's Barnacles. LAST of the steppers on purpose — see stepBarnacles for why: it has to
  // run after everything that can kill a crusted body this frame, and before the dead sweep below
  // that removes it, or the spread narrows to "only when the crust itself lands the kill".
  stepBarnacles(run, dt)

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
    // Elements redesign: an ally is skipped by stepStatuses, so nothing would ever age its damage
    // windows or tick its freeze down. An elite killed quickly dies with a nearly-full cold window,
    // which reads as 100% slow — the card's product is an ally that REACHES the swarm, so it would
    // hand you a statue for the whole 20s loan. Clear the element state as it changes sides.
    elClear(e._elCold); elClear(e._elVenom); e._elFrozen = 0; e._elResist = 0
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
    // The Surf's two CARRIERS. Both deliver something other than a contact hit — the shell leaves a
    // splash at each touch-down, the larva attaches a crust — so both run their own business here
    // and then skip the contact scan below (see the `_carrier` guard).
    if (b.weapon === 'shell' && b.life > 0) stepShellSkip(run, b, dt)
    if (b.weapon === 'barnacle' && b.life > 0) stepBarnacleFlight(run, b)
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
    // A carrier deals NO contact damage: every point of the Skipping Shell's is in its splashes,
    // and a barnacle larva delivers a status rather than a hit. Skipping the scan is what stops the
    // shell being paid for twice on a body it merely flew through, and it costs nothing else —
    // neither carrier has pierce, chain or rebound behaviour to fall through to below.
    if (b._carrier) continue

    let justHit = null
    for (const e of run.enemies) {
      if (b.pierce <= 0) break
      if (e._dead || isAlly(e) || b.hitIds.has(e.id)) continue   // SUBMISSION: pass THROUGH an ally — immune, but blocks nothing
      const dx = e.x - b.x, dy = e.y - b.y
      const rad = b.r + e.radius
      if (dx * dx + dy * dy <= rad * rad) {
        applyDamage(run, e, b.dmg)
        // Necrotic Tips (stinger switch mod, snapshotted as b._necrotic at fire time): the needle
        // leaves flagella's bleed behind. Reuses applyBleed verbatim rather than growing a second
        // DoT — which also means lightning can forward it, since elArc carries bleed.
        if (b._necrotic && !e._dead) applyBleed(e, b.dmg, NECROTIC_BLEED_FRAC)
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
//
// `opts` carries the two fields The Surf's Breaker needs, and BOTH default to the behaviour every
// other caller already had, so a ring spawned without them is bit-identical to before:
//   arc/angle  limit the ring to a SECTOR (full cone angle in radians, centred on `angle`), the
//              same convention inSector uses for roar/flagella/clawRake. Absent = full circle.
//   carry      px/s^2 of continued outward push on a body the front has already hit, applied while
//              that body is still inside the live ring. Absent = 0, i.e. the one-shot shove every
//              other nova deals. This is the field that makes a wave a wave rather than a
//              ring-shaped bat, and it is bounded by the ring's own life, not by a second knob.
function spawnNova(run, x, y, maxR, dmg, knockback, fear = 0, opts = null) {
  run.novas.push({
    x, y, r: 0, maxR, dmg, knockback, fear, hit: new Set(),
    arc: opts?.arc ?? null, angle: opts?.angle ?? 0, carry: opts?.carry ?? 0,
    // A render-only tag. sim does not branch on it; it exists so the renderer can tell a Skipping
    // Shell's splash from a Cytokine Burst without inferring it from the radius, which is the kind
    // of guess that silently starts being wrong the first time either weapon is retuned.
    look: opts?.look ?? null,
    // `lifeMax` beside `life` so a ring can expand over something other than NOVA_LIFE, and so
    // stepNovas can still work out how far along it is. The Skipping Shell's splash needs it: a
    // 46px ring on the default 0.45s life deals its damage nearly half a second after the shell
    // visibly landed, which on screen reads as the splash missing.
    life: opts?.life ?? NOVA_LIFE, lifeMax: opts?.life ?? NOVA_LIFE,
  })
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

    const progress = Math.min(1, Math.max(0, 1 - n.life / (n.lifeMax ?? NOVA_LIFE)))
    n.r = n.maxR * progress

    for (const e of run.enemies) {
      if (e._dead) continue
      // v5.4: a ghosted phase flicker passes through everything. applyDamage already refuses it,
      // but the shove, the fear and n.hit did not — a ghosted moon jelly was shoved by a ring that
      // could not hurt it, AND burned its slot in n.hit so it stayed untouched once it resolidified.
      if (e._phaseSolid === false) continue
      const dx = e.x - n.x, dy = e.y - n.y
      const dist = Math.hypot(dx, dy)
      // The Breaker's sector gate. Normalised through atan2(sin, cos) rather than by subtracting
      // and comparing: a raw difference wraps at ±pi, so a front facing just past that seam would
      // silently stop catching the bodies directly in front of it. A body at the apex is inside
      // every sector — its bearing from a point inside itself is arbitrary — which is the same
      // carve-out inSector makes and for the same reason.
      if (n.arc != null && dist > e.radius) {
        const da = Math.atan2(dy, dx) - n.angle
        const off = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)))
        // A body merely CLIPPED by the wedge's edge counts: it subtends asin(r/d) either side of
        // its centre's bearing. Same rule as inSector, so the two cone tests agree.
        if (off > n.arc / 2 + Math.asin(Math.min(1, e.radius / dist))) continue
      }
      // CARRY: a body the front has already hit rides it outward for as long as the crest is on
      // it. Gated on the BAND rather than just on `hit`, so the push stops the moment the wave has
      // passed — without that, one hit would shove a body for the nova's whole life no matter how
      // far behind the crest it fell, which is a tractor beam, not surf. `carry` is an
      // acceleration and e.kb a velocity that decays at KB_DECAY_RATE, so the ride reaches a
      // terminal speed instead of flinging bodies off the map.
      if (n.hit.has(e.id)) {
        // NOT ccScale'd, and that is the same argument the CC pricing block itself makes: the carry
        // is the back half of ONE application — the shove this body already paid for on the frame
        // the crest reached it — not a fresh control landing 27 more times. Scaling it per frame
        // charges one wave the diminishing-returns price of a whole cast every frame, which
        // measured the ride down from 183px/s of terminal speed to 137 and made the weapon's one
        // distinguishing property nearly invisible. resistsCC still gates it, so an anchored elite
        // takes the damage and never moves, exactly as it does for every other shove in the game.
        // ccResist is read DIRECTLY here rather than through ccScale: opting out of the per-frame
        // DR charge is the argument above, but a heavy body still rides a wave less than a light
        // one, and this is the one shove in the game that ccScale never reaches.
        if (n.carry > 0 && dist > 1e-6 && !resistsCC(e)) {
          const cr = ccResist(e)
          e.kb.x += (dx / dist) * n.carry * cr * dt
          e.kb.y += (dy / dist) * n.carry * cr * dt
        }
        continue
      }
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
        // Anchored: still takes the damage above, just never gets knocked back. An `unshakeable`
        // tank IS shoved and IS feared, at ccResist's share of both (see UNSHAKEABLE_CC_MUL).
        if (!resistsCC(e) && claimKb(e)) {
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

// -- Downwash (The Shelf's clean-water native) ---------------------------------------------------
// A run.holes entry with three fields the Black Hole never sets: `look` (the drawing, and the tag
// that keeps the two weapons' mods apart in stepHoles), `burst` (the payoff, paid on expiry) and
// `trigger` (the Plunge mod's early detonation). The pull, the spiral, the coin sweep and the
// per-tick damage are the rig that already existed.
//
// NO NEW SOUND AND NO NEW RENDER CASE FOR THE CAST. `downwash` maps to the 'hole' vortex whoosh in
// SFX_FOR_EVENT, which is the borrow chum, bilge, shorebreak and snare already make; the column is
// drawn every frame by syncHoles, so a cast flash would be a second telling of what is already on
// screen. The burst reuses `explode`, which every consumer already handles.
function stepDownwashWeapon(run, w, stats, fireRateMul, dt) {
  const quickPour = run.weaponMods.downwash?.quickPour ?? 0
  fireOnTimer(run, w.id, stats.interval / (fireRateMul * (1 + quickPour)), dt, () => fireDownwash(run, stats))
}

// WHERE THE COLUMN LANDS, and the one thing this weapon does not share with the Black Hole: the
// body with the most company inside a column's radius. A gather card that casts at a random
// straggler wastes that cast, and the waste is INVISIBLE — a column pulling one enemy looks exactly
// like a column that is working.
// ponytail: O(n²) over the bodies in view — tens of them, once every ~4s. If this ever runs against
//   hundreds, bucket them on a grid; not before.
function pickDownwashSpot(run, radius, excludeIds) {
  const p = run.player
  // DOWNWASH_CAST_FRAC of the viewport, not the whole of it: a column placed on the densest clump
  // anywhere in view lands two thirds of a screen away often enough to be the owner's complaint.
  const viewSq = (run.viewRadius * DOWNWASH_CAST_FRAC) ** 2
  const inView = run.enemies.filter((e) => {
    // An ally is never a mark, for the reason pickHoleSpot states: this is aim dilution.
    if (e._dead || isAlly(e) || excludeIds.has(e.id)) return false
    const dx = e.x - p.x, dy = e.y - p.y
    return dx * dx + dy * dy <= viewSq
  })
  if (inView.length === 0) {
    const a = Math.random() * Math.PI * 2
    const d = 250 + Math.random() * 150
    return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, id: null }
  }
  const rSq = radius * radius
  let best = inView[0], bestN = -1
  for (const e of inView) {
    let n = 0
    for (const o of inView) {
      const dx = o.x - e.x, dy = o.y - e.y
      if (dx * dx + dy * dy <= rSq) n++
    }
    if (n > bestN) { bestN = n; best = e }
  }
  return { x: best.x, y: best.y, id: best.id }
}

function fireDownwash(run, stats) {
  const usedIds = new Set()
  const extra = ipecacN(run, 1 + (run.weaponMods.downwash?.secondFall ?? 0)) - 1
  for (let i = 0; i <= extra; i++) {
    // FULL SIZE, unlike Singularity's HOLE_SINGULARITY_FRAC shrink. This card's payoff is the burst,
    // so a shrunken second column would gather less AND burst for the same number in a smaller
    // circle — twice the casts for less than twice the card. Second Fall buys a second PLACE.
    const spot = pickDownwashSpot(run, stats.radius, usedIds)
    if (spot.id != null) usedIds.add(spot.id)
    run.holes.push({
      x: spot.x, y: spot.y, radius: stats.radius, coreRadius: stats.radius * HOLE_CORE_FRAC,
      life: stats.duration, duration: stats.duration,
      dmg: stats.dmg, tick: stats.tick, pull: stats.pull, acc: 0,
      look: 'downwash', burst: stats.burst,
      trigger: run.weaponMods.downwash?.plunge ? DOWNWASH_PLUNGE_N : 0,
    })
    run.events.push({ type: 'downwash', x: spot.x, y: spot.y })
  }
}

// The burst — one hit to everything inside the column, plus the `explode` picture. Deliberately NOT
// holeCrunch: that is the Black Hole's Big Crunch mod and reads its damage through CRUNCH_DMG_MUL,
// so sharing it would move this weapon's whole payoff whenever that unrelated card is retuned.
//
// IT DOES NOT GUARD AGAINST FIRING TWICE, and that is on purpose: the ONE thing that retires a
// column is `h.life = 0` plus the filter at the bottom of stepHoles. A second guard here would be
// unreachable code that also disarms the only mutation able to prove the first one works.
function downwashBurst(run, h) {
  if (!(h.burst > 0)) return
  const dmg = h.burst
  const radSq = h.radius * h.radius
  for (const e of run.enemies) {
    if (e._dead) continue
    const dx = e.x - h.x, dy = e.y - h.y
    if (dx * dx + dy * dy <= radSq) applyDamage(run, e, dmg)
  }
  run.events.push({ type: 'explode', x: h.x, y: h.y, radius: h.radius })
  // SILT FLUSH (the duo boon): the burst blows a huge cloud of silt out of the column's own
  // footprint. Sized off h.radius rather than off the veil, so Wide Pour widens the flush for
  // free and the cloud always covers the circle the player just watched land. No `look` guard is
  // needed here that stepHoles has not already applied -- this function is only ever called for
  // a column, never for a Black Hole.
  if (run.weaponMods.downwash?.siltFlush) spawnSiltCloud(run, h.x, h.y, h.radius * SILT_FLUSH_MUL)
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
      // A Downwash pays its own burst and never Big Crunch's: `hungryBonus`/`crunchBonus` are read
      // off run.weaponMods.hole, so without the `look` test every column in the array would inherit
      // the Black Hole's mods the moment a player held both cards.
      if (h.look === 'downwash') downwashBurst(run, h)
      else if (crunchBonus > 0) holeCrunch(run, h, crunchBonus)
      continue
    }

    // Hungry Hole: radius (and coreRadius, kept proportional) grows while alive. Render is
    // visual-safe here — it already re-reads h.radius/coreRadius every frame.
    if (hungryBonus > 0 && h.spawnRadius && h.look !== 'downwash') {
      h.radius += hungryBonus * h.spawnRadius * dt
      h.coreRadius = h.radius * HOLE_CORE_FRAC
    }

    let inside = 0 // bodies dragged into the MIDDLE of the column this frame — Plunge's trigger.
                   // Counted before the anchored skip, because an anchored elite standing in the
                   // middle IS the crowd arriving; it just got there without being pulled.
    const plungeSq = (h.radius * DOWNWASH_PLUNGE_FRAC) ** 2
    for (const e of run.enemies) {
      if (e._dead) continue
      const dx0 = h.x - e.x, dy0 = h.y - e.y
      if (dx0 * dx0 + dy0 * dy0 <= plungeSq) inside++
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
        // WHICH hole has hold of it, for contactHarmless: a body a water column is ragdolling
        // cannot touch you, a body in a Black Hole still can. Last writer wins if the two overlap,
        // which is the same fuzziness holePull's Math.max already carries across holes.
        e._holeLook = h.look ?? null
        pulled.add(e.id)
      }
    }

    // PLUNGE (the downwash mod): the column goes off once the crowd has been dragged into its
    // middle, AND KEEPS POURING — so the card adds a burst instead of trading the gather away for
    // an earlier one. `h.trigger = 0` is the whole guard: the condition below stays true for the
    // rest of the pour, so without disarming it the column detonates on EVERY frame. Run MB.i
    // counts the bursts for that reason, and it is now counting for two.
    //   It used to set `h.life = 0` here instead. Measured before the change
    //   (scripts/plunge-probe.mjs): 69% of columns fired, each serving a median 1.00s of a 2.00s
    //   pour for exactly one burst — the mod was a strictly worse column with no tell.
    const armed = h.duration - h.life >= h.duration * DOWNWASH_PLUNGE_ARM
    if (h.trigger > 0 && armed && inside >= h.trigger) {
      downwashBurst(run, h)
      h.trigger = 0
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
          // A COLUMN OF WATER HAS NO SINGULARITY. HOLE_CORE_DMG_MUL is x3 on the Black Hole's
          // crushed centre, and applying it here made the POUR out-damage the burst 147 to 92 on a
          // body standing dead centre — i.e. the card quietly became the vortex it is meant not to
          // be, for exactly the player who lets the column finish. The core radius still shapes the
          // PULL (holePullT), because water genuinely runs fastest down the middle; it just does not
          // crush. Caught by run MB.i, which is the only thing that could have caught it.
          const inCore = h.look !== 'downwash' && distSq <= h.coreRadius * h.coreRadius
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
    // v7.55 §5.3 owner ruling: Humidity only. run.chargeMax (Task 9 fix round), not the config max.
    * resourceDamageMul(run.charge, CHAPTERS[run.chapter].resource, run.chargeMax)
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
    // PER-CLOUD GROW TIME, defaulting to the shared fraction — the same shape `tick` already has
    // above it. slickTrail's pools are the only user: on the shared ramp a chain laid at speed is
    // half-grown for its whole visible length, which draws as dots however tightly it is spaced.
    const growT = bl.grow > 0 ? bl.grow : bl.dur * BLOOM_GROW_FRAC
    bl.r = bl.t >= growT ? bl.maxR : bl.maxR * (bl.t / Math.max(1e-6, growT))

    // run.blooms is shared with The Twilight's Foxfire, which tags itself `look`. `sporeOn` and `tide`
    // are read ONCE for the whole list off run.weaponMods.bloom, so without this gate a build
    // holding both would drift a foxfire on the tide and spore-burst it — the same cross-weapon leak
    // stepLobs guards between Net Toss and Debris Toss' shrapnel, and just as silent.
    const pondTide = tide > 0 && !bl.look

    if (pondTide) {
      const f = currentForce(run, bl.x, bl.y)
      bl.x += f.fx * dt * tide
      bl.y += f.fy * dt * tide
    }

    // SQUID INK'S BLIND (The Reef). Refreshed EVERY FRAME a body is inside the cloud, exactly as
    // bloomSlowT is one branch down and for the same reason: the decay lives in stepEnemyMovement,
    // so a body that swims out keeps the mark for `blind` seconds and no longer. It is its own
    // pass rather than a line inside the tick loop because the tick is metered on BLOOM_TICK and a
    // status the player watches has to arrive on the frame the body enters the ink.
    //   NOT through resistsCC, on Ballast's dragT rule: that budget guards HOLDS, and this stops
    // nobody — a blinded body keeps its full speed and simply keeps going. damageImmune-guarded
    // like the slow, so a ghosted phase flicker ignores it like it ignores everything else.
    if ((bl.blind ?? 0) > 0) {
      const bSq = bl.r * bl.r
      for (const e of run.enemies) {
        if (e._dead || damageImmune(e) || isAlly(e)) continue
        const bdx = e.x - bl.x, bdy = e.y - bl.y
        if (bdx * bdx + bdy * bdy > bSq) continue
        e.blindT = bl.blind
      }
    }

    // `slow: 0` opts a cloud out entirely (Foxfire does). The Twilight already slows the player in the
    // dark; a card whose text never mentions a slow must not quietly add a second one.
    if (bl.slow !== 0) {
      const slowRSq = bl.r * bl.r
      for (const e of run.enemies) {
        if (e._dead || damageImmune(e)) continue
        // The wedge gate, on BOTH passes. Silt sets slow: 0 so this branch cannot reach a cone
        // today -- it is here so that the day a cone-shaped bloom does slow, the slow and the
        // damage cover the same ground. Two loops testing one entity with two different shapes is
        // the one-fact-in-two-places class CLAUDE.md names as the largest defect source here.
        if (bl.arc != null) { if (!inSector(bl.x, bl.y, bl.angle, bl.r, bl.arc, e, false)) continue }
        else {
          const sdx = e.x - bl.x, sdy = e.y - bl.y
          if (sdx * sdx + sdy * sdy > slowRSq) continue
        }
        e.bloomSlowT = BLOOM_SLOW_T
        // AND OIL STAINS PERMANENTLY. Gated on look:'bilge' and nothing else — this loop also
        // walks Toxin Bloom, Silt Veil and Ballast's stain, and only one of them is oil. (The
        // squid's ink cannot reach here at all: it carries slow: 0.)
        if (bl.look === 'bilge') e.oiled = Math.min(OIL_STAIN_MAX, (e.oiled || 0) + OIL_STAIN_RATE * dt)
      }
    }

    const tickDmg = pondTide ? bl.dmgPerTick * (1 + TIDE_DMG_BONUS * tide) : bl.dmgPerTick
    // PER-CLOUD CADENCE, defaulting to the shared one. Silt Veil sets it from its level (the same
    // shape `hole` uses for its own tick); Toxin Bloom, Foxfire and sporeburst minis carry none and
    // keep BLOOM_TICK. `> 0` rather than `!= null`: a zero would spin this while-loop forever.
    const tickEvery = bl.tick > 0 ? bl.tick : BLOOM_TICK
    bl._tickAcc = (bl._tickAcc ?? 0) + dt
    while (bl._tickAcc >= tickEvery) {
      bl._tickAcc -= tickEvery
      const rSq = bl.r * bl.r
      for (const e of run.enemies) {
        if (e._dead) continue
        // `arc` MAKES THE BLOOM A WEDGE (Silt Veil, the only one today). inSector tests the enemy's
        // BODY against the sector and treats a body sitting on the apex as inside it, so a cone
        // cast with the crowd already on top of you still bites -- which is exactly the moment the
        // card is for. A disc keeps the cheaper squared-distance test.
        if (bl.arc != null) { if (!inSector(bl.x, bl.y, bl.angle, bl.r, bl.arc, e, false)) continue }
        else {
          const dx = e.x - bl.x, dy = e.y - bl.y
          if (dx * dx + dy * dy > rSq) continue
        }
        // A CLOUD THAT DEALS NO DAMAGE EMITS NO HIT. Two blooms on this array carry dmgPerTick 0
        // and exist for something other than damage — the Oxygen Tank's boil (it pauses Air) and
        // the bilge — and a {type:'hit', dmg: 0} draws a floating "0" over the body and evicts a
        // real number from the shared dmgTexts pool. Everything below still runs — the daze and
        // sporeburst are not damage.
        if (tickDmg > 0) applyDotDamage(run, e, tickDmg)
        // SILT VEIL's daze, published into the e.stunT contract field render.js already reads.
        // The window is the whole guard: gating on "is it stunned" alone lets a persistent cloud
        // re-stun on the frame the last hold lapses, which measures as 100% uptime while reading
        // like a working refractory. dazeCd covers the hold AND the gap after it.
        if ((bl.daze ?? 0) > 0 && (e.dazeCd ?? 0) <= 0 && !resistsCC(e)) {
          const hold = bl.daze * ccScale(run, e)
          e.stunT = Math.max(e.stunT || 0, hold)
          e.dazeCd = hold + SILT_DAZE_REFRACTORY
          spendCC(run, e)
        }
        if (sporeOn && !bl.look && !bl._mini && e._dead) {
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
// chain budgets so star's mods never touch them. longNeedles scales range AND speed; hive fires
// the whole volley in all directions every STINGER_HIVE_EVERY-th cast; necroticTips leaves a bleed
// on every needle hit (stepBullets).
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
  const necroticOn = (run.weaponMods.stinger?.necroticTips ?? 0) > 0

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
      _necrotic: necroticOn,
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
    // CHUM (v7.x, The Wreck): A BAIT IS EATEN, NOT ONLY AGED OUT. Everything that reaches it takes
    // one serving and is then done with THIS bait (`_fedBait` holds the bait object, so the same
    // fish may eat again at a different one). Without that memory a single fish sitting in the
    // cloud would drain the whole bucket in one frame.
    //   The bait dies the instant the food does, whatever `dur` had left — that is the ruling: a
    // shoal strips it in seconds, a bait nobody found lasts its full duration.
    if (lu.bait) {
      const fr2 = CHUM_FEED_R * CHUM_FEED_R
      for (const e of run.enemies) {
        if (lu.food <= 0) break
        if (e._dead || isAlly(e) || e._fedBait === lu) continue
        const fdx = e.x - lu.x, fdy = e.y - lu.y
        if (fdx * fdx + fdy * fdy > fr2) continue
        e._fedBait = lu
        lu.food -= 1
        // AND IT STOPS TO EAT IT. `feedT` is the contract field stepPrey pins the body on and
        // render.js draws nose-down off — one write here, because "took a serving" and "is eating"
        // are the same instant and splitting them is how they drift.
        //   `skittish` only: the hold is honoured in stepPrey, which nothing else reaches, so
        // setting it on a moray would be a field with a tell and no behaviour.
        //   THE PUFF RULE IS NOT REPEATED HERE, deliberately. stepPrey clears feedT on any body it
        // finds mid-inflation, so a second guard on this line would enforce the same fact in two
        // places and be unreachable — and an unreachable guard is one no mutation can prove and no
        // reader can trust. Reaching the bait takes a serving; whether the body then stops for it
        // is the movement machine's business.
        if (e.flags && e.flags.includes('skittish')) e.feedT = CHUM_FEED_HOLD
      }
      if (lu.food <= 0) { lu._burst = true; run.events.push({ type: 'chumOut', x: lu.x, y: lu.y }); continue }
    }
    if (lu.t < lu.dur) continue
    lu._burst = true
    // A bait disperses, it does not detonate. burstR/burstDmg are 0 for chum, so the shipped
    // expiry path below was a radius-0 {type:'explode'} — an explosion sound over nothing.
    if (lu.bait) { run.events.push({ type: 'chumOut', x: lu.x, y: lu.y }); continue }
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
// THE BITE PREFERS FOOD IN REACH (v7.x, owner: "prefer food, like the dash does"). aimAngle takes
// the nearest body full stop, and in this chapter that is very often the moray: every fish flees
// while the moray neither flees nor hurries, so it parks in your face and the bite follows it.
// Measured at 32.8% of frames — a third of the chapter's only damage source, pointed away from the
// thing the player is chasing.
//
// WITHIN THE JAW, NOT WITHIN SIGHT, and that gate is the whole reason a moray stays huntable. When
// you break off to eat one the shoal has already run, so nothing else is in reach and the bite goes
// where you aimed it. A sight-wide preference would point at a fish 300px away while the moray you
// deliberately closed on sat 60px in front of you — which is the owner's other answer ("a prize
// worth hunting") undone by his first one.
function biteAim(run, range) {
  const p = run.player
  const rSq = range * range
  let bestSq = Infinity
  let target = null
  for (const e of run.enemies) {
    if (e._dead || isAlly(e) || e.type === 'tank') continue
    const dx = e.x - p.x, dy = e.y - p.y
    const dSq = dx * dx + dy * dy
    if (dSq <= rSq && dSq < bestSq) { bestSq = dSq; target = e }
  }
  if (target) return Math.atan2(target.y - p.y, target.x - p.x)
  return aimAngle(run)
}

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
// -- Prey (v7.x, The Wreck's `skittish` flag) ----------------------------------------------------
// TWO STATES AND NO STATE VARIABLE. Outside PREY_SIGHT_R the fish has not seen you and mills along
// its school's heading; inside it, it runs. Both headings are PURE FUNCTIONS of the fish's id and
// run._realTime, which is what keeps this cheap enough to run on 600 bodies: no per-enemy stored
// heading, no neighbour queries, no RNG, and nothing to reset when a fish streams out and back.
//
// THE SCHOOL IS A MODULO. Consecutive ids arrive in the same spawn burst, so bucketing by id gives
// fish that appeared together one drift heading and one escape heading — they mill as a body and
// they break as a body, which is the whole silhouette the chapter is for.
// ponytail: id buckets, not boids. If schools ever need to MERGE, SPLIT or avoid each other, that
// is when this becomes a real flocking pass — and not one line before.
//
// run._realTime, NOT run.time, for exactly the reason stepShafts uses it: the Time Debt anomaly
// advances run.time at TIME_DEBT_MUL and would otherwise make every school in the chapter turn 50%
// faster for the rest of that run.
// -- The shoal pass (v7.x, The Wreck) ------------------------------------------------------------
// ONE O(n) WALK FEEDING THREE READERS, because all three want the same scan and none wants a pair
// loop: the per-shoal CENTROID the cohesion term steers toward, the count of prey around the PLAYER
// the drain-slow reads, and the hoisted list of PREDATORS prey flees.
//
// HOISTING THE PREDATORS IS NOT TIDINESS. stepPrey is called per skittish body from inside
// stepEnemyMovement's own walk of run.enemies, so finding them inline would be a nested scan —
// ~577 prey x 620 bodies at this chapter's own cap, which is the magnitude stepEnemySeparation's
// comment rejects in writing ("700^2/2 ~ 244k pair checks/frame is not a phone-friendly budget").
// The separation grid cannot help here: it is built AFTER movement, so it is stale and too late.
//
// Module-scope and reused, cleared per call — no per-frame Map or array allocation, the same idiom
// _sepBuckets uses for the same reason.
const _predators = []          // what prey runs from: alive, not skittish, not an ally
function stepShoals(run) {
  _predators.length = 0
  run._feedN = 0
  const p = run.player
  for (const e of run.enemies) {
    if (e._dead) continue
    if (e.flags && e.flags.includes('skittish')) {
      // FEED COUNTS TIGHTNESS, NOT QUANTITY, and the first cut of this counted quantity and failed.
      // At spawnMul 2.2 (620 concurrent bodies) a straight line across the map sits inside FEED_R
      // about as often as a deliberate hunter does — measured 5.3-5.5 prey within 200px mowing
      // against 5.9-6.2 hunting, a 1.1x spread. A reward keyed on that pays both alike, so the bar
      // separation NARROWED (1.96x -> 1.48x): the same failure the killBase multiplier had, by a
      // different route. `_shoalN` at the kill site DOES separate them — 2.57 mowing against 5.45
      // circling, 2.1x — because ambient crowding is free and TIGHTNESS is not.
      if (e._shoalN >= BALL_TIGHT_N) {
        const fx = e.x - p.x, fy = e.y - p.y
        if (fx * fx + fy * fy < FEED_R * FEED_R) run._feedN++
      }
    } else if (!isAlly(e)) {
      // Not prey, not on your side -> something prey runs from. A SUBMISSION-converted moray is
      // non-skittish and yours, and would otherwise scatter the very balls you are building.
      _predators.push(e)
    }
  }
}

function stepPrey(run, e, dx, dy, d, dt, slowMul, baited = false) {
  if (slowMul <= 0) return
  const shoal = Math.floor(e.id / PREY_SHOAL_SIZE)
  // 2.399963 rad is the golden angle: consecutive shoals get headings as far apart as a sequence
  // can make them, so two schools spawned back to back never set off in the same direction.
  // Alternating the turn sign by shoal parity stops the whole field rotating in unison.
  const drift = shoal * 2.399963 + run._realTime * PREY_TURN_RATE * (shoal % 2 ? 1 : -1)
  let ux = Math.cos(drift)
  let uy = Math.sin(drift)
  let mul = PREY_DRIFT_MUL
  if (d < PREY_SIGHT_R && d > 1e-6) {
    // Seen you. The escape heading is BLENDED with the school's own rather than being straight
    // away from you — at a pure radial the shoal explodes like a firework, which is the one
    // silhouette a bait ball never makes. See PREY_FLEE_BLEND.
    ux = (-dx / d) * PREY_FLEE_BLEND + ux * (1 - PREY_FLEE_BLEND)
    uy = (-dy / d) * PREY_FLEE_BLEND + uy * (1 - PREY_FLEE_BLEND)
    const m = Math.hypot(ux, uy) || 1
    ux /= m; uy /= m
    mul = PREY_FLEE_MUL
  }
  // CHUM (v7.x). `dx,dy` is the seek vector, and when the winning seek target was BAIT it points at
  // the food rather than at the predator — so the fish swims down it instead of away. This is the
  // one branch in the game where a skittish animal closes on something.
  //   The panic override is what stops the card being an off-switch for the chapter: inside
  // CHUM_PANIC_R of the PLAYER a baited fish bolts regardless, so you cannot park in your own bait
  // ball and have dinner hold still — you have to come in from outside it. deepChum buys that
  // radius down, never to zero.
  // The vector to the PLAYER, hoisted: the chum branch, the feeding hold and the panic-blind
  // clause on the bilge loop all need it, and it was being derived three times.
  const pdx = run.player.x - e.x, pdy = run.player.y - e.y
  const pd = Math.hypot(pdx, pdy)
  const nerve = 1 - Math.min(0.85, run.weaponMods.chum?.deepChum ?? 0)

  // HEAD DOWN, EATING (v7.x). A fish that reached a bait took a serving and stopped for it
  // (stepLures sets feedT); for that long it is a body sitting still in open water, which is the
  // whole reason to cast the card. Returning here is the hold: nothing below runs, so it does not
  // steer, does not flee, does not tighten — and `_tgtX/_tgtY` keep the heading it arrived on, so
  // it stays nose-on to the food rather than snapping to face you.
  //   TWO THINGS BREAK IT, and both have to, or this is a stasis field. Coming inside CHUM_PANIC_R
  // (the same radius the gather already respects) and inflating: a puffing fish is reacting to the
  // predator, and a pufferfish frozen in a bite would eat its own punish window.
  if ((e.feedT ?? 0) > 0) {
    if (pd > CHUM_PANIC_R * nerve && (e.puffT ?? 0) <= 0) return
    e.feedT = 0
  }

  if (baited) {
    if (pd > CHUM_PANIC_R * nerve && d > 1e-6) {
      ux = dx / d
      uy = dy / d
      mul = CHUM_PULL_MUL
    } else if (pd > 1e-6) {
      // BOLT FROM THE PLAYER, NOT FROM THE BAIT, and this branch has to exist explicitly. While a
      // chum is up, `dx,dy` points at the CHUM for every fish in its radius — that is what the lure
      // override does — so falling through to the ordinary flee above would have a panicking fish
      // run from the food rather than from the predator, which on the far side of a bait ball means
      // running straight AT the player. The bug reads as "the fish charge me sometimes".
      ux = -pdx / pd
      uy = -pdy / pd
      mul = PREY_FLEE_MUL
    }
  }

  // PREDATORS (v7.x). A moray is a predator and prey did not care, which is what made the roster's
  // one non-fleeing body a sponge that did nothing but steal the bite's aim. Same "blend, don't
  // pivot" form the bilge loop below uses, over the list stepShoals hoisted — never a nested scan.
  //   Threat is measured against the PLAYER directly rather than off `d`, because `d` is the seek
  // vector and a baited fish's seek target is the chum: reading it here would make a fish inside a
  // bait ball register as unthreatened and refuse to tighten.
  let threatened = pd < PREY_SIGHT_R
  for (const q of _predators) {
    const qx = e.x - q.x, qy = e.y - q.y
    const qd = Math.hypot(qx, qy)
    if (qd >= PREY_PREDATOR_FEAR_R || qd < 1e-6) continue
    threatened = true
    const w = PREY_PREDATOR_BLEND * (1 - qd / PREY_PREDATOR_FEAR_R)
    ux = ux * (1 - w) + (qx / qd) * w
    uy = uy * (1 - w) + (qy / qd) * w
    const m = Math.hypot(ux, uy) || 1
    ux /= m; uy /= m
  }

  // THE ORCA'S RING (v7.x). The fear is the RING, not the animal, and it pushes INWARD — a fish at
  // or beyond the wall turns toward the ring's centre rather than away from the orca's body.
  //   That inversion is the whole mechanism. Two point-repulsors (you and it) cancel for a fish
  // between them and ADD for a fish on your far side, so an orbiting point drives the shoal out
  // through your own position; a closing wall drives it in. This is also why it composes with the
  // player's repulsion instead of fighting it: both push the same way once the fish is inside.
  //   run.orca is NOT in run.enemies, so the predator loop above cannot see it — it needs this
  // explicit term. Circling only: during the rise the ring is a shadow, not yet a wall.
  const orca = run.orca
  if (orca && orca.state === 'circling') {
    const rx = e.x - orca.cx, ry = e.y - orca.cy
    const rd = Math.hypot(rx, ry)
    if (rd > orca.r - ORCA_RING_BAND && rd > 1e-6) {
      threatened = true
      ux = ux * (1 - ORCA_PUSH) + (-rx / rd) * ORCA_PUSH
      uy = uy * (1 - ORCA_PUSH) + (-ry / rd) * ORCA_PUSH
      const m = Math.hypot(ux, uy) || 1
      ux /= m; uy /= m
    }
  }

  // THE SELFISH HERD (v7.x). The one attracting force in the chapter — see PREY_COHESION_BLEND for
  // why the chapter did not work without it. A frightened fish swims toward the middle of its own
  // school as well as away from the threat; one repulsor alone can only ever make a ring, and it is
  // this inward pull that closes the ring into a ball.
  //   THREAT-GATED, which is what preserves the shipped look: an unaware school mills exactly as
  // loosely as it always did, and only a school that can see something tightens.
  //   NEIGHBOURS, NOT THE ID BUCKET. The centroid is of the bodies actually within BALL_R of this
  // fish, accumulated by the previous frame's separation pass — one frame stale, which is invisible
  // in a steering term and costs no pass of its own.
  //   `tight` (v7.x, the sardine) IS THIS ONE NUMBER AND NOTHING ELSE — same radius, same minimum,
  // same accumulate pass, a stronger blend. That is the whole flag: a ball that holds together
  // under a repulsor a mackerel school would have burst, so the payout is a dozen at once or none.
  const n = e._shoalN || 0
  const cohesion = e.flags && e.flags.includes('tight') ? TIGHT_COHESION_BLEND : PREY_COHESION_BLEND
  if (threatened && n >= PREY_COHESION_MIN_N) {
    const cx = e._nbrX / n - e.x, cy = e._nbrY / n - e.y
    const cd = Math.hypot(cx, cy)
    if (cd > 1e-6) {
      ux = ux * (1 - cohesion) + (cx / cd) * cohesion
      uy = uy * (1 - cohesion) + (cy / cd) * cohesion
      const m = Math.hypot(ux, uy) || 1
      ux /= m; uy /= m
    }
  }

  // BILGE (v7.x). A skittish fish will not swim into the oil. Steering, not a wall it bounces off:
  // the avoidance heading is BLENDED with whatever it was already doing (BILGE_AVOID_BLEND), so a
  // shoal driven at a slick peels along it instead of pivoting on the spot, which is what makes the
  // card a fence you herd against rather than a force field.
  //   Only `skittish` reads this. Everything else swims in and slows, which is the other half of
  // the card and the reason it is not purely a barrier.
  //
  // ⚠ PANIC BEATS AVOIDANCE (owner ruling, 2026-08-23), and it is what makes the card OFFENSIVE.
  // Without it the two halves genuinely fight: prey refuse to enter oil, so the only bodies the
  // slow ever caught were the ones that are not prey, and a player could not drive a shoal into
  // their own wall however hard they chased it. `watching` ramps the whole avoidance to zero inside
  // PREY_PANIC_BLIND_R of the PLAYER — a fish being run down at close range is not looking where it
  // is going. The wall is untouched everywhere the player is not, which is where a fence is for.
  const watching = Math.min(1, Math.max(0, (pd / PREY_PANIC_BLIND_R - 0.5) * 2))
  for (const bl of run.blooms) {
    if (bl.look !== 'bilge' || bl.r <= 0) continue
    const bx = e.x - bl.x, by = e.y - bl.y
    const bd = Math.hypot(bx, by)
    const edge = bl.r + BILGE_AVOID_PAD
    if (bd >= edge || bd < 1e-6) continue
    // Push out along the radius, weighted by how far in it already is — a fish at the rim barely
    // deflects, one that got inside turns hard to get out.
    const w = BILGE_AVOID_BLEND * (1 - bd / edge) * watching
    ux = ux * (1 - w) + (bx / bd) * w
    uy = uy * (1 - w) + (by / bd) * w
    const m = Math.hypot(ux, uy) || 1
    ux /= m; uy /= m
  }

  // A BALL DOES NOT SWIM (v7.x, the pufferfish). Applied for the inflation AND for the deflating
  // window after it, which is what makes the punish window generous enough to be a rhythm: the fish
  // that just bounced your jaw is still there when you swing again. It keeps steering — a puffer
  // that froze would read as stunned, and would be the aim sponge the moray's `guard` was.
  const puffMul = ((e.puffT ?? 0) > 0 || (e._puffCd ?? 0) > 0) ? PUFFER_DRIFT_MUL : 1
  const step = e.speed * mul * slowMul * puffMul * dt
  e.x += ux * step
  e.y += uy * step
  // FACE WHERE YOU ARE SWIMMING, NOT AT THE THING CHASING YOU. Owner, 2026-08-18: "the fish you can
  // eat should not face you, they should run away from you in a school."
  //   render.js derives every creature's bearing from run.player every frame, so by default a
  // fleeing fish swims backwards — tail first, eyes on the predator, in all 48 roster looks. The
  // fix publishes the heading into `_tgtX/_tgtY`, which is the SHIPPED contract field for "face
  // this instead of the player" (SUBMISSION's allies already use it) rather than a new one render
  // would have to be taught. 100px ahead is arbitrary and only its DIRECTION is read.
  e._tgtX = e.x + ux * 100
  e._tgtY = e.y + uy * 100
}

// -- Gnash (v7.x, The Wreck's native) ------------------------------------------------------------
// A short forward bite whose damage RISES the closer the body is. Structurally slashClaws with a
// falloff and no knockback; see WEAPONS.gnash and the GNASH_* block in config.js for both design
// decisions, and note in particular that the missing knockback is the design rather than an
// oversight — this chapter's crowd is running away and shoving it is a downgrade.
function stepGnashWeapon(run, w, stats, fireRateMul, dt) {
  fireOnTimer(run, w.id, stats.rate / fireRateMul, dt, () => biteGnash(run, stats))
}

// -- Chum (v7.x, The Wreck) ----------------------------------------------------------------------
// A run.lures entry with `bait: true` — the shipped decoy entity, tagged. See WEAPONS.chum for why
// this is the same object as a Pheromone Lure and not a fourth kind of zone, and note that WITHOUT
// the tag it would repel: stepPrey flees the seek target, and the lure override IS the seek target.
function stepChumWeapon(run, w, stats, fireRateMul, dt) {
  // ipecacN, like every other planted-zone weapon (stepBloomWeapon is the model): IPECAC triples
  // what a cast puts on the map, and a weapon that ignores it fails run PB7 with a message about
  // the fire site never being patched. Three baits, three separate spots — NOT one bait three times
  // in the same place, which is the divisor half of that same assertion.
  const baits = ipecacN(run, 1)
  // fullBucket: whole extra servings on every bait (kind 'tier', read here — the count is an
  // integer the drawing lays out as chunks, so it cannot fold into levels[] as a fraction).
  const food = stats.food + (run.weaponMods.chum?.fullBucket ?? 0)
  fireOnTimer(run, w.id, stats.rate / fireRateMul, dt, () => {
    const p = run.player
    for (let k = 0; k < baits; k++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.random() * stats.castRange
    run.lures.push({
      x: p.x + Math.cos(a) * r,
      y: p.y + Math.sin(a) * r,
      t: 0, dur: stats.dur, aggro: stats.aggro,
      // HOW MUCH FOOD IS IN IT, and `food0` beside it so render can draw the bait THINNING rather
      // than only shrinking — a full L1 bucket and a stripped L5 one hold the same 5 otherwise.
      food, food0: food,
      // The cloud's outline, stored at cast exactly as a bilge pool's and a spill's are, so two
      // baits are never the same drawing turned a different way and neither one ever flickers.
      shape: Math.floor(Math.random() * LOBE_SHAPES.length) % LOBE_SHAPES.length,
      rot: Math.random() * Math.PI * 2,
      // No burst at all: this card is the gather. burstR/burstDmg 0 keeps it in the same array as
      // the Pheromone Lure without inheriting its detonation, which would scatter the very ball it
      // just spent four seconds forming.
      burstR: 0, burstDmg: 0,
      bait: true,
    })
    run.events.push({ type: 'chum', x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, r: stats.aggro })
    }
  })
}

// -- Bilge (v7.x, The Wreck) ---------------------------------------------------------------------
// A run.blooms entry tagged look: 'bilge' — the fourth card on that array. `dmgPerTick: 0` and
// `slow` ON: this is a wall and a drag, not a damage zone. slickTrail lays it at the player's feet
// as they swim instead of ahead, which is what turns a series of circles into a drawn fence.
function stepBilgeWeapon(run, w, stats, fireRateMul, dt) {
  const pools = ipecacN(run, 1)
  // slickTrail: smaller pools, laid by DISTANCE TRAVELLED rather than on the cast timer — see the
  // BILGE_TRAIL_* block for why a timer cannot draw a line in a chapter you cross at 220px/s.
  const trail = (run.weaponMods.bilge?.slickTrail ?? 0) > 0
  // oilRing: lay the cast as a circle of pools around the target instead of one pool on it. Stands
  // down under slickTrail — a fence drawn behind you and a ring thrown around a fish are two
  // different answers to "where did the oil go", and silently doing both would be neither.
  const ring = !trail && (run.weaponMods.bilge?.oilRing ?? 0) > 0
  const maxR = stats.maxR * (trail ? BILGE_TRAIL_R_MUL : 1)
  const cast = () => {
    const p = run.player
    // WHERE THE OIL LANDS (owner, 2026-08-18: "it should spawn under an enemy" — then "this targets
    // the closest enemy, which will be bitten in the next .5s. it should target a random visible
    // enemy"). Two separate failures, and the second is the subtler one:
    //   - at the player's FEET, a pool in a chapter you cross at 220 px/s is behind you before it
    //     has finished growing. BLOOM_GROW_FRAC gives it 1.6-2.2s, in which the player travels
    //     twice its diameter.
    //   - on the NEAREST body, it lands on the one thing the jaw and the Lunge are already aimed
    //     at. The zone reads as free because it is: that fish dies inside half a second whatever
    //     the oil does, so the card spends a whole cast buying a kill you had already bought.
    // A random VISIBLE body is the one that opens ground the player has not already taken.
    //   With nothing on screen it falls back to the player's feet, so the card still fires rather
    // than silently skipping a cast.
    //   slickTrail is the deliberate exception, and this is what finally makes that mod distinct
    // rather than just "smaller and more often": a fence is drawn BEHIND a swimming player, so the
    // trail keeps laying at the feet.
    const tgt = trail ? null : randomVisibleEnemy(run)
    const ox = tgt ? tgt.x : p.x
    const oy = tgt ? tgt.y : p.y
    // ONE POOL, LAID ONCE. Extracted because the ring needs to lay six of them and a second copy
    // of this object literal is the one-fact-two-places trap this file is built around — the
    // `shape`/`rot`/`slow` triple in particular has to be identical or a ring pool would draw as
    // something other than oil.
    const lay = (bx, by, r) => {
      run.blooms.push({
        x: bx, y: by, t: 0, r: 0, maxR: r, dur: stats.dur,
        dmgPerTick: 0, tick: 0, look: 'bilge',
        // A LOBED OUTLINE, stored at cast and never re-derived, exactly as the chapter's own hazard
        // spills carry one (streamSlicks). render draws the player's oil through the SAME function
        // that draws the leak's, so the card and the thing it is imitating are one drawing — which is
        // the point of the card. A round blob would read as a light, and this has to read as a film.
        shape: Math.floor(Math.random() * LOBE_SHAPES.length) % LOBE_SHAPES.length,
        rot: Math.random() * Math.PI * 2,
        // `slow: 1` opts INTO stepBlooms' slow branch, which Foxfire opts out of with 0. The magnitude
        // is BILGE_SLOW, applied where bloomSlowT is read — this field is only the switch.
        slow: 1,
        // A TRAIL POOL SAYS SO, and both halves matter. `grow` overrides the shared BLOOM_GROW_FRAC
        // ramp so a pool is full-size before the player has swum past it — on the shared ramp the
        // newest half-dozen are still points and the ribbon is dotted exactly where it is watched.
        // `trail` is what render reads to draw the chain as one film instead of rimmed circles.
        ...(trail ? { grow: BILGE_TRAIL_GROW, trail: true } : null),
      })
      run.events.push({ type: 'bilge', x: bx, y: by, r })
    }
    // IPECAC's extra pools are SPREAD around the centre rather than stacked on it — three slicks
    // in one spot is one slick, which is the failure run PB7 asserts distinct positions to catch.
    // At pools === 1 the offset is zero.
    for (let k = 0; k < pools; k++) {
      const a = (k / pools) * Math.PI * 2
      const off = pools > 1 ? maxR * 0.9 : 0
      const bx = ox + Math.cos(a) * off, by = oy + Math.sin(a) * off
      // OIL RING: the same cast spent as RING_N smaller pools on a circle instead of one big pool
      // on the spot, so the target ends up INSIDE rather than under. Ipecac multiplies RINGS, not
      // the pools within one — three rings is three pens, where 18 pools on one circle is the same
      // pen drawn three times.
      if (ring) {
        const pr = maxR * RING_POOL_MUL
        const rr = pr * RING_R_MUL
        for (let j = 0; j < RING_N; j++) {
          const t = (j / RING_N) * Math.PI * 2
          lay(bx + Math.cos(t) * rr, by + Math.sin(t) * rr, pr)
        }
      } else {
        lay(bx, by, maxR)
      }
    }
  }
  // THE TRAIL IS TRIGGERED BY DISTANCE, THE THROW BY THE TIMER. Two different questions: a thrown
  // pool is a cast you spend, a poured one is a thing that happens because you moved. Laying one
  // every BILGE_TRAIL_STEP_FRAC x radius of travel is the only trigger that cannot come apart at
  // speed — and a player who stops moving stops pouring, which removes the carpet-the-map risk
  // the timed version had to be tuned around.
  //   `stats.rate` and the global fire rate are deliberately NOT read here: neither of them is a
  // distance, and folding one in would make a fast build's fence thicker rather than longer.
  if (trail) {
    const p = run.player
    const step = maxR * BILGE_TRAIL_STEP_FRAC
    const lx = run._bilgeTrailX, ly = run._bilgeTrailY
    if (lx != null && (p.x - lx) * (p.x - lx) + (p.y - ly) * (p.y - ly) < step * step) return
    run._bilgeTrailX = p.x
    run._bilgeTrailY = p.y
    cast()
    return
  }
  fireOnTimer(run, w.id, stats.rate / fireRateMul, dt, cast)
}

function biteGnash(run, stats) {
  const p = run.player
  const angle = biteAim(run, stats.range)
  const mods = run.weaponMods.gnash
  const finish = mods?.bloodInTheWater ?? 0
  const hold = mods?.deathRoll ?? 0
  // IPECAC: three bites at 120 degrees, de-duplicated across the set — fireFlagella's idiom, and
  // the `struck` set is load-bearing there for the same reason (overlapping sectors would otherwise
  // let one body eat three bites from one cast).
  const struck = new Set()
  for (const swing of ipecacAngles(run, angle)) {
    // Overkill carry, reset PER SWING: an ipecac cast is three separate mouths, and pooling the
    // spillover across all three would quietly turn that mod into a damage multiplier.
    let carry = 0
    for (const e of run.enemies) {
      if (e._dead || struck.has(e)) continue
      if (!inSector(p.x, p.y, swing, stats.range, stats.arc, e, false)) continue
      struck.add(e)
      // THE FALLOFF, and it runs backwards to every other reach number in this file: x1 at the tip
      // of the sweep, xGNASH_MAW_MUL at the jaw. Measured on CENTRE distance, the same quantity
      // inSector just tested, so a body that qualified cannot then score above 1 through rounding.
      const d = Math.hypot(e.x - p.x, e.y - p.y)
      const near = 1 - Math.min(1, d / stats.range)
      let mul = 1 + near * (GNASH_MAW_MUL - 1)
      const hpBefore = e.hp
      // bloodInTheWater: the finisher. Read off CURRENT hp before the bite lands, so the card is
      // "bite what is already hurt" and never "the last hit of every kill is bigger".
      if (finish > 0 && e.maxHP > 0 && e.hp / e.maxHP < GNASH_FINISH_FRAC) mul *= 1 + finish
      const nominal = stats.dmg * mul + carry
      applyDamage(run, e, nominal, GNASH_BASE_CRIT)
      // OVERKILL CARRY (v7.x). Excess from a body that DIED rolls on to the next one this sweep
      // reaches. Measured off nominal-minus-remaining-HP, so a crit never inflates the carry and a
      // body that survived carries nothing — it can never manufacture damage against a lone target.
      // See GNASH_CARRY_FRAC for why this exists rather than a density damage multiplier: every
      // prey here dies to one bite with an order of magnitude spare, so there is nothing to hit
      // harder and the only honest expression of "deeper into the mass" is what spills over.
      carry = e.hp <= 0 ? Math.max(0, nominal - hpBefore) * GNASH_CARRY_FRAC : 0
      // deathRoll: hold what you bit. Same one-line stun idiom as the mine, the hydrant and the
      // longline — through ccScale/spendCC so it takes diminishing returns, and published to the
      // `stunT` contract field render.js already reads.
      if (hold > 0 && !e._dead && !resistsCC(e)) {
        e.stunT = Math.max(e.stunT || 0, hold * ccScale(run, e))
        spendCC(run, e)
      }
    }
    if (struck.size > 0 && (mods?.bloodrush ?? 0) > 0) {
      run._rushT = RUSH_DUR
      run._rushN = Math.min(RUSH_MAX_STACKS, (run._rushN ?? 0) + 1)
    }
    run.events.push({ type: 'gnash', x: p.x, y: p.y, angle: swing, range: stats.range, arc: stats.arc })
  }
}

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

  // The leash reaches to a foe's BODY, not its centre — `hunt + e.radius`, the same compensation
  // inSector uses, and for the same reason: what the eye judges is funnel-touches-hide. On normal
  // bodies (r ~10-20) it is noise; on a big one it is the whole weapon. The Blank's antibody has
  // radius 80 and holds a 240px standoff band (BLANK_STANDOFF_MIN), so its CENTRE sits outside
  // every hunt tier there is (190-270) while its hide sits 160px from you — measured 0.0 dps at
  // L1 and 7.7 at L5, i.e. the pack circled the player while the boss stood in plain sight.
  const leashed = (e) => {
    const dx = e.x - p.x, dy = e.y - p.y
    const reach = stats.hunt + e.radius
    return dx * dx + dy * dy <= reach * reach
  }
  // Targets are STICKY while alive and still inside the leash: re-picking from scratch every frame
  // makes a funnel dither between two enemies that are near-equidistant and never reach either.
  // A held target is checked against the LIVE list rather than just its `_dead` flag — today
  // stepSim's filter is the only thing that ever removes an enemy, but a funnel that outlives its
  // prey by any other route would otherwise sit on the corpse's last coordinates forever, and that
  // failure mode is invisible until someone adds a despawn. One Set beats an includes() per funnel.
  const live = new Set(run.enemies)
  const claimed = new Map() // foe -> how many funnels are already committed to it
  for (const t of list) {
    if (t.tgt && (t.tgt._dead || !live.has(t.tgt) || !leashed(t.tgt))) t.tgt = null
    if (t.tgt) claimed.set(t.tgt, (claimed.get(t.tgt) ?? 0) + 1)
  }
  // Whoever is free takes the nearest UNCLAIMED enemy — nearest to itself, not to the player, so a
  // ring of funnels fans out across a crowd. Without the claim they all pile onto the single
  // closest enemy, which looks like one blob and wastes most of the damage: the tick cooldown is
  // per ENEMY, so the second funnel on a target contributes nothing until the first one's expires.
  // ...but the claim is a PREFERENCE, not a veto. With fewer foes in reach than funnels there is
  // nothing left to fan out over, and refusing to double up sent the rest of the pack home to
  // circle you while one lone funnel worked a boss — "only one attacks at a time". A funnel takes
  // the nearest unclaimed foe, and failing that the nearest foe that will SURVIVE what is already
  // committed to it. That hp test is what keeps the fallback from being a crowd nerf: without it
  // the pack converges on the last drone in the leash and spends six ticks on a body one kills
  // (measured over a city run: waste 11% -> 18%, kills/min 228 -> 203).
  for (const t of list) {
    if (t.tgt) continue
    let best = null, bestD = Infinity
    let spare = null, spareD = Infinity
    for (const e of run.enemies) {
      if (e._dead || !leashed(e)) continue
      const dx = e.x - t.x, dy = e.y - t.y
      const d = dx * dx + dy * dy
      const on = claimed.get(e) ?? 0
      if (on === 0) { if (d < bestD) { bestD = d; best = e } }
      else if (e.hp > stats.dmg * on && d < spareD) { spareD = d; spare = e }
    }
    const pick = best ?? spare
    if (pick) { t.tgt = pick; claimed.set(pick, (claimed.get(pick) ?? 0) + 1) }
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
  }

  // Damage. Still ONE tick per enemy per `tick` (the per-enemy cooldown orbs use, e._debrisCd) —
  // but that tick is now worth every funnel standing on the body, not whichever one the loop
  // reached first. Enemy-outer/funnel-inner rather than the reverse, same O(n x m), so the count
  // is known before the tick is spent.
  //
  // The old order made the 2nd..6th funnel on a target free of charge: P3 of The Blank measured
  // 4.16 funnels inside the boss delivering 68 dps of the 309 they visibly stood for, which is
  // what "only one attacks at a time" looks like once they DO all arrive. Spread over a crowd
  // this changes nothing — each foe has one funnel on it and the count is 1 — so the scaling is
  // paid out exactly where the pack converges, which is the case `moreTrash` never covered.
  for (const e of run.enemies) {
    if (e._dead || (e._debrisCd || 0) > 0) continue
    let n = 0
    for (const t of list) {
      const dx = e.x - t.x, dy = e.y - t.y
      const rad = t.r + e.radius
      if (dx * dx + dy * dy <= rad * rad) n++
    }
    if (!n) continue
    applyDamage(run, e, stats.dmg * n)
    e._debrisCd = stats.tick / fireRateMul
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
  if (resistsCC(e) || !claimKb(e)) return
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
  // The duo boon, read once for the list like `shrapnel` above and used ONLY inside the ballast
  // branch -- which is what keeps it off the Sunspear's and Net Toss's lobs sharing this array.
  const siltPlume = run.weaponMods.ballast?.siltPlume ?? 0

  for (const lo of run.lobs) {
    lo.t += dt
    const f = Math.min(1, lo.t / lo.flight)
    lo.x = lo.fromX + (lo.tx - lo.fromX) * f
    lo.y = lo.fromY + (lo.ty - lo.fromY) * f
    if (lo.t < lo.flight) continue
    lo._done = true

    // A NET TOSS lands here, not a chunk of debris: same flight, a hold instead of a burst.
    // THIS BRANCH MUST STAY ABOVE THE SHRAPNEL BLOCK BELOW. `shrapnel` is read once off
    // run.weaponMods for every lob in the list regardless of which weapon made it, so a build
    // holding Debris Toss and Net Toss together would otherwise spray Debris Toss splinters out of
    // the player's fishing nets — a cross-weapon leak that nothing throws on and no test would see.
    if (lo.snare > 0) {
      const rSq = lo.r * lo.r
      let caught = 0
      for (const e of run.enemies) {
        if (e._dead || isAlly(e)) continue
        const dx = e.x - lo.tx, dy = e.y - lo.ty
        if (dx * dx + dy * dy > rSq) continue
        applyDamage(run, e, lo.dmg)
        // Through the CC-DR budget like every other control in the game. Without it a rare weapon
        // holding a whole pack for 1.75s on a 2.6s cadence is a permanent lock, and elites — which
        // resistsCC exists to protect — would be trivialised by the one card that stops them.
        if (!e._dead && !resistsCC(e)) {
          e.stunT = Math.max(e.stunT || 0, lo.snare * ccScale(run, e))
          spendCC(run, e)
          caught++
        }
      }
      run.events.push({ type: 'snare', x: lo.tx, y: lo.ty, radius: lo.r, hold: lo.snare, caught })
      continue
    }

    // A SUNSPEAR column landing. Above the shrapnel block for exactly the reason the net is: a build
    // holding Debris Toss alongside it would otherwise spray splinters out of a shaft of sunlight.
    // The column never moved (fromX/fromY are its target), so lo.t crossing lo.flight is the whole
    // of its fall.
    if (lo.column) {
      const rSq = lo.r * lo.r
      for (const e of run.enemies) {
        if (e._dead || isAlly(e)) continue
        const dx = e.x - lo.tx, dy = e.y - lo.ty
        if (dx * dx + dy * dy <= rSq) applyDamage(run, e, lo.dmg)
      }
      run.events.push({ type: 'sunfall', x: lo.tx, y: lo.ty, radius: lo.r })
      continue
    }

    // AN OXYGEN TANK RUPTURING. Above the shrapnel block for exactly the reason the net and the
    // column are: `shrapnel` is read ONCE off run.weaponMods for every lob in the list whatever
    // weapon made it, so a build holding Debris Toss alongside this would spray splinters out of a
    // scuba tank — a cross-weapon leak nothing throws on.
    //
    // THE BOIL PAUSES THE DRAIN AND NEVER REFILLS. It is a run.blooms entry with dmgPerTick 0 and
    // slow 0 — a marked patch of water and nothing else — and the ONLY thing that reads `airHold`
    // is stepCharge, where it multiplies the drain by zero. See WEAPONS.oxygenTank for why a second
    // refill source is forbidden here rather than merely unwanted.
    if (lo.tank) {
      const rSq = lo.r * lo.r
      for (const e of run.enemies) {
        if (e._dead || isAlly(e)) continue
        const dx = e.x - lo.tx, dy = e.y - lo.ty
        if (dx * dx + dy * dy > rSq) continue
        applyDamage(run, e, lo.dmg)
        // Pressure Wave. A flat shove out of the blast (see TANK_SHOVE_KB) and NOT a hold, so it
        // runs outside the CC-DR budget like Ballast's drag: resistsCC guards holds, and this
        // stops nobody — it moves them. `anchored` elites are kb-immune everywhere, so they are
        // exempt here the way the revive shove exempts them.
        if (!lo.shove || (e.affixes && e.affixes.includes('anchored'))) continue
        const d = Math.hypot(dx, dy)
        e.kb.x += (d > 1e-6 ? dx / d : 1) * TANK_SHOVE_KB
        e.kb.y += (d > 1e-6 ? dy / d : 0) * TANK_SHOVE_KB
      }
      run.blooms.push({
        x: lo.tx, y: lo.ty, t: 0, r: 0, maxR: lo.r, dur: lo.boil,
        dmgPerTick: 0, look: 'boil', slow: 0, airHold: true,
      })
      run.events.push({ type: 'rupture', x: lo.tx, y: lo.ty, radius: lo.r, shove: !!lo.shove })
      continue
    }

    // A BALLAST landing: impact damage in lo.r, then a DRAG in a wider ring around it.
    //
    // NO STAIN. It used to push a run.blooms entry tagged look: 'silt' — Silt Veil's own cloud,
    // drawn Silt Veil's way — and the owner cut it from play (2026-08-21) because a rare card
    // producing the normal card's whole picture for free is a normal card nobody takes. See
    // WEAPONS.ballast for the argument; e.dragT is what replaced it.
    //
    // TANKS TAKE BALLAST_TANK_MUL. Against a Moon Jelly, whose `phase` flag makes it immune half
    // the time, this is the pool's only card that answers the chapter's one damage sponge. The
    // multiplier rides the impact only, never the drag — a slow does not care how heavy you are.
    if (lo.look === 'ballast') {
      // ONE ring: the drag catches exactly what the crush catches. It carried a `dragMul` until
      // v7.x, when Foul Water stopped widening the ring and became a cadence card instead.
      const bSq = lo.r * lo.r
      for (const e of run.enemies) {
        if (e._dead || isAlly(e)) continue
        const dx = e.x - lo.tx, dy = e.y - lo.ty
        const dSq = dx * dx + dy * dy
        if (dSq <= bSq) applyDamage(run, e, lo.dmg * (e.type === 'tank' ? BALLAST_TANK_MUL : 1))
        // Refreshed, not stacked, and NOT through the CC-DR budget: this is a plain speed debuff
        // like bloomSlowT, not a control that stops a body — resistsCC guards holds, not drags.
        if (!e._dead && dSq <= bSq) e.dragT = Math.max(e.dragT || 0, BALLAST_DRAG_T)
      }
      run.events.push({ type: 'ballast', x: lo.tx, y: lo.ty, radius: lo.r })
      // SILT PLUME: the weight slams the bottom and throws the silt up around the crater. RINGED
      // at SILT_PLUME_SPREAD, never stacked on the impact point -- three clouds sharing one
      // centre render identically to one cloud, which is the count-mod failure this repo has
      // already shipped once. The clouds are Silt Veil's own; this decides only where they land.
      for (let i = 0; i < siltPlume; i++) {
        const a = (i / siltPlume) * Math.PI * 2
        spawnSiltCloud(run, lo.tx + Math.cos(a) * lo.r * SILT_PLUME_SPREAD,
          lo.ty + Math.sin(a) * lo.r * SILT_PLUME_SPREAD)
      }
      continue
    }

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

// -- The Shelf's three natives (v7.x, Le Large) -------------------------------------------
// All three reuse an existing entity array rather than introducing a fourth kind of zone:
// run.novas (Bubble Puff), run.blooms (Silt Veil, and Ballast's stain), run.lobs (Ballast). That
// is not only cheaper — it is what keeps them out of render.js's reset() hazard, where a pool in
// the wrong list sets a dead property on a plain object and last run's entities stay on screen.

// BUBBLE PUFF (starter). A ring on the player: spawnNova already carries `knockback` and a `look`
// tag, so this is the Cytokine Burst's entity with the chapter's numbers and its own drawing.
// BUBBLE PUFF. A cone, not a ring — owner, 2026-08-18. The sector gate and the once-per-body hit
// set are spawnNova's and stepNovas', the same ones The Surf's Breaker rides on.
//
// ⚠ THE PUFF NEVER CLOSES THE CIRCLE. BUBBLE_COVER_MAX is a ceiling on TOTAL coverage — front cone
// plus rear cone — and its block in config.js carries the owner's reason and the two separate paths
// that used to reach 360 degrees. Both are shut by the same two lines below.
//
// It replaces a `full` branch that handed a fully-widened puff `arc: null` (spawnNova's "no
// sector", i.e. a complete ring) and a Backblow gate of `stats.arc < Math.PI`. That gate was about
// OVERLAP, not coverage: each nova carries its own once-per-body hit set, so two sectors that
// intersect pay for the same body twice. Clamping to half the ceiling when Backblow is held keeps
// that property for free — two 135-degree cones on opposite bearings cannot intersect — so the old
// gate is not lost, it is subsumed.
//
// The clamp is deliberately NOT a reason to delete Flare's ladder above it: the card still buys
// width all the way to the ceiling, and it buys it twice as fast once Backblow is held, since the
// second cone is coverage the first one never had.
function stepBubblePuffWeapon(run, w, stats, fireRateMul, dt) {
  const scour = run.weaponMods.bubblePuff?.scour ?? 0
  const backblow = (run.weaponMods.bubblePuff?.backblow ?? 0) > 0
  // NO RATE MOD AND NO KNOCKBACK MOD, and that is enforced by there being none to read -- see the
  // fenced balance_decision on WEAPON_MODS.bubblePuff. The weapon has no `knockback` stat at all
  // now, so a knockback mod would be folding onto a key that does not exist. Do not add one here.
  fireOnTimer(run, w.id, stats.rate / fireRateMul, dt, () => {
    const p = run.player
    // Backblow doubles what one cast covers, so it halves what one cone may be. Half the total
    // ceiling is BELOW the single-cone ceiling, which is what keeps the mod worth taking at maxed
    // Flare: 240 contiguous degrees becomes 135 front + 135 back.
    const arc = Math.min(stats.arc, backblow ? BUBBLE_COVER_MAX / 2 : BUBBLE_ARC_MAX)
    const angle = aimAngle(run)
    // SCOUR. The chapter's bar as damage, and it pays for CLEAN water: `scour` at a spotless bar,
    // nothing at full Pollution. Owner ruling 2026-08-20, inverting what shipped in v7.163.
    // `1 - pollutionFrac(...)` rather than a second helper reading run.charge directly: one
    // derivation, so the card and the rail can never come apart. It also makes the degenerate case
    // safe — a chapter with no bar has chargeMax 0, pollutionFrac returns 1, and this resolves to
    // no bonus instead of the maximum one the old direction handed out there.
    const dmg = stats.dmg * (1 + scour * (1 - pollutionFrac(run.charge, run.chargeMax)))
    for (const r of ipecacRadii(run, stats.r)) {
      // knockback 0, WRITTEN AS A LITERAL. The stat is gone from levels[] (see the ladder in
      // config.js for why), and `stats.knockback` would be `undefined` here — which spawnNova banks
      // verbatim and stepNovas multiplies into e.kb, so every shoved body's position becomes NaN and
      // simply stops rendering. A zero says the same thing and cannot rot into that.
      spawnNova(run, p.x, p.y, r, dmg, 0, 0, { look: 'bubble', arc, angle })
      // BACKBLOW. A second cone on the opposite bearing, the Breaker's Backwash idiom. It ALWAYS
      // fires now — the clamp above is what keeps the two sectors from ever intersecting, so there
      // is no width at which this has to switch itself off. A mod that silently stops working as
      // you level its own weapon's other card is the inert-card failure run MB.a exists to catch.
      if (backblow) {
        spawnNova(run, p.x, p.y, r, dmg, 0, 0, { look: 'bubble', arc, angle: angle + Math.PI })
      }
    }
  })
}

// SILT VEIL. A cone off the player. `slow: 0` opts out of BLOOM_SLOW_T the way Foxfire does
// — the murk chapter does not slow the player and must not quietly slow the crowd either — and
// `daze` is the card, applied in stepBlooms against its own dazeCd window so it cannot pin.
// FOUL SPRING (the siltVeil mod). Is (x,y) inside an upwelling that has not been spent yet, and if
// so, spend it and say so. `drawdown` is the field stepCharge counts occupancy into and render.js
// fades the circle off, so setting it here retires the circle through the tell the player has been
// reading all along instead of inventing a second, silent one.
//
// The drawdown clock is per-FIELD (refillSpec().drawdownSecs) and 0 on every field but The Shelf's.
// Where it is 0 a circle can never be spent at all, so the mod finds one, is paid, and leaves it
// standing -- which is the honest behaviour for a chapter whose upwellings do not draw down.
// THE SILT VEIL'S CLOUD, SPAWNED BY SOMETHING THAT IS NOT THE SILT VEIL. Three callers: Foul
// Spring's fouled patch below, and the two duo boons (WEAPON_MODS.ballast.siltPlume,
// WEAPON_MODS.downwash.siltFlush). Damage, duration and daze are read off the veil's CURRENT
// stats, so a cloud another weapon makes is exactly the cloud the player is already casting and
// neither boon needs retuning when the veil does. Only the RADIUS is the caller's, because each
// of the three has a different picture to fill (a patch, a crater, a column); omit it for the
// veil's own reach.
//
// A FULL DISC: no `arc`, which is what stepBlooms tests to choose the sector path over the radius
// one. The wedge belongs to the veil's own cast and to nothing else.
//
// The veil's ABSENCE is not an error. `needs` gates the OFFER, and devCards ignores every
// eligibility rule on purpose — so a card taken off the dev list can arrive without it. Level-1
// numbers then, rather than no cloud at all, which on screen is indistinguishable from a card
// that does not work.
function spawnSiltCloud(run, x, y, maxR) {
  const w = run.weapons.find((wp) => wp.id === 'siltVeil')
  const s = w ? effectiveWeaponStats(run, w) : WEAPONS.siltVeil.levels[0]
  run.blooms.push({
    x, y, r: 0, maxR: maxR ?? s.maxR, t: 0, dur: s.dur,
    dmgPerTick: s.dmgPerTick, look: 'silt', slow: 0, daze: s.daze, tick: s.tick,
  })
}

// Returns the SHAFT it fouled (or null), not a boolean: the caller turns that circle into a silt
// cloud of its own radius, and needs its centre to do it.
function foulUpwelling(run, x, y) {
  const life = drawdownSecsFor(run)
  for (const sh of run.shafts) {
    // inMaw, not a bare distance test: it follows the drawn lobes and skips a shut maw, so "clean
    // water" means the water the player can SEE, the same test stepCharge feeds the bar from.
    if (!inMaw(sh, x, y)) continue
    if (life > 0 && (sh.drawdown ?? 0) >= life) continue
    if (life > 0) sh.drawdown = life
    // The picture, not the mechanic -- the line above is what actually spends it. render.js reads
    // this to draw the silt taking the patch instead of the circle blinking out in one frame.
    sh.fouled = FOUL_SPRING_FOUL_T
    return sh
  }
  return null
}

function stepSiltVeilWeapon(run, w, stats, fireRateMul, dt) {
  const foulSpring = run.weaponMods.siltVeil?.foulSpring ?? 0
  const quickStir = run.weaponMods.siltVeil?.quickStir ?? 0
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + quickStir)), dt, () => {
    const p = run.player
    // A CONE OFF THE PLAYER, aimed at the nearest body (owner from play, 2026-08-21). aimAngle is
    // the Bubble Puff's own chooser, so both of this chapter's front-facing cards point the same
    // way in the same situation; while kiting the nearest body is whatever is chasing you, which
    // is the case the card exists for. It falls back to facing when the screen is empty rather
    // than refusing to fire -- a silt cone into open water is the honest picture of a whiff.
    const clouds = ipecacN(run, Math.max(1, Math.round(stats.clouds)))
    // ONE local for the fan: `clouds` is the loop bound AND the divisor that centres the spread,
    // the eight-site trap CLAUDE.md documents. Roil's extra cones tile OUTWARD by a full arc each
    // -- overlapping them would render identically to no change at all, which is the inert-card
    // failure run MB.a exists to catch.
    const aim = aimAngle(run)
    for (let i = 0; i < clouds; i++) {
      const angle = aim + (i - (clouds - 1) / 2) * SILT_VEIL_ARC
      // FOUL SPRING, sampled at the cone's MID-DEPTH rather than at the player's feet: the wedge is
      // what fouls the water, and its apex is a point the player is standing on, so testing there
      // would make the mod fire only while parked in a patch. Per cone, not per cast -- a fanned
      // volley can foul several patches at once. Short-circuits on foulSpring 0 so an unmodded
      // veil never walks run.shafts at all.
      const patch = foulSpring > 0 ? foulUpwelling(run,
        p.x + Math.cos(angle) * stats.maxR * 0.5, p.y + Math.sin(angle) * stats.maxR * 0.5) : null
      const mul = patch ? 1 + foulSpring : 1
      // ONE multiplier across all three of the cone's numbers, which is exactly what the card
      // promises. Splitting it -- size and duration but not damage, as this first shipped -- makes
      // the card and the code two different cards.
      run.blooms.push({
        x: p.x, y: p.y,
        r: 0, maxR: stats.maxR * mul, t: 0, dur: stats.dur * mul,
        // `mul` (Foul Spring) is NOT applied to the tick: the card promises more power and more
        // size, and a cadence buff hidden inside it would be a fourth thing it never says.
        dmgPerTick: stats.dmgPerTick * mul, look: 'silt', slow: 0, daze: stats.daze, tick: stats.tick,
        arc: SILT_VEIL_ARC, angle,
      })
      // THE PATCH ITSELF TURNS TO SILT (owner, 2026-08-22: "foul spring should be turning the
      // whole clean water patch to silt cloud instead of consuming it"). The spend above is
      // unchanged -- the circle is still drawn down and still stops feeding you, which is the
      // card's cost -- but what it leaves behind is now a cloud the size of the whole patch
      // instead of nothing. AFTER the cone, deliberately: the cone is what the cast made and
      // stays blooms[0] for anything reading the volley in order.
      if (patch) spawnSiltCloud(run, patch.x, patch.y, patch.r)
    }
  })
}

// BALLAST. A lob at the nearest body, landing for `dmg` in `r` and leaving a stain. `column` is NOT
// set: that flag is the Sunspear's hanging telegraph, and this one actually travels.
function stepBallastWeapon(run, w, stats, fireRateMul, dt) {
  const quickWinch = run.weaponMods.ballast?.quickWinch ?? 0
  const foulWater = run.weaponMods.ballast?.foulWater ?? 0
  // FOUL WATER: the filthier the water, the faster the winch turns. Read here and re-read every
  // frame -- it is the live bar and not a banked value, so the cadence rises as the run fouls.
  // `quickWinch` and this multiply rather than add: one is a flat pick and the other is a ramp,
  // and a player holding both should not have the ramp diluted by the pick.
  const foulRate = 1 + foulWater * pollutionFrac(run.charge, run.chargeMax)
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + quickWinch) * foulRate), dt, () => {
    const p = run.player
    // THE ONE AIM SITE IN THE GAME THAT PASSES A PAD, and it passes a NEGATIVE one: this weapon
    // reaches viewRadius - 100 where everything else reaches viewRadius + 100 (see
    // BALLAST_REACH_PAD). A body further out is not a held cast -- nearestEnemy returns null, which
    // is the empty-screen branch, and the blind throw below takes it.
    const target = nearestEnemy(run, BALLAST_REACH_PAD)
    const tx = target ? target.x : p.x + (p.facing >= 0 ? BALLAST_BLIND_THROW : -BALLAST_BLIND_THROW)
    const ty = target ? target.y : p.y
    // ONE local, bound and divisor both -- see stepSiltVeilWeapon above for what splitting it costs.
    const drops = ipecacN(run, Math.max(1, Math.round(stats.weights)))
    // THE FIRST WEIGHT LANDS ON THE BODY, the extras ring around it. Spreading EVERY drop put the
    // target in the hole between them: at 1.15r from a blast of radius r, a two-weight cast threw
    // one to each side of an enemy and hit nothing at all (owner from play, 2026-08-20).
    const spread = stats.r * 1.15
    for (let i = 0; i < drops; i++) {
      const a = (i / drops) * Math.PI * 2
      const off = i === 0 ? 0 : spread
      run.lobs.push({
        fromX: p.x, fromY: p.y,
        tx: tx + Math.cos(a) * off, ty: ty + Math.sin(a) * off,
        t: 0, flight: BALLAST_FLIGHT,
        dmg: stats.dmg, r: stats.r, look: 'ballast',
      })
    }
  })
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
  const baseAngle = lane ? laneAxes(CHAPTERS[run.chapter]).angle : aimAngle(run)
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

// -- The Surf's three natives -------------------------------------------------------------------
// All three fire on a timer through fireOnTimer, take no resource, and read nothing about how the
// player is moving. What separates them is the SHAPE each claims (see the block above
// WEAPONS.breaker in config.js), and each one is built out of an entity the game already has:
//   breaker        a run.novas ring carrying `arc` + `carry` — a sector-limited front that keeps
//                  pushing what it has already caught. See spawnNova/stepNovas.
//   skippingShell  a run.bullets carrier (no contact damage) that leaves a splash nova at every
//                  touch-down and re-aims from where it landed.
//   barnacles      run.bullets carriers that attach `e.barnacle` — a published contract field, so
//                  render.js can draw the crust — which then ticks and spreads on its host's death.
// None of them needed a new run.* array, which is the same argument The Twilight's doc block makes
// about reusing run.bombs and run.strips.

// Every one of the three aims the same way, and it is fireFlagella's hard-won rule (v5.1.2): the
// NEAREST ENEMY first, and the last move direction only as a fallback. A kiting player's heading
// points away from the swarm, so aiming by facing alone fires every cast into empty sand.

// -- Breaker (the chapter's starter) --------------------------------------------------------
// A wave that rolls out ahead of you and drags what it catches along with it. The front is a nova
// limited to a sector, so the whole expand-and-damage machine — including the once-per-body `hit`
// set that stops a growing ring re-hitting as it passes — is the shipped one. The two fields that
// make it a wave rather than a cone-shaped Cytokine Burst are `arc` and `carry`, both documented at
// spawnNova.
//
// Backwash sends a second, weaker front out the other way. It goes through ipecacAngles like the
// first, so Bazooka multiplies BOTH — the alternative (front only) would make the mod quietly
// worthless to a build that took the anomaly.
function stepBreakerWeapon(run, w, stats, fireRateMul, dt) {
  const p = run.player
  const backwash = (run.weaponMods.breaker?.backwash ?? 0) > 0
  // Divided here rather than folded into `interval` through WEAPON_STAT_MODS: folding a rate pick
  // into an interval multiplies the WAIT, i.e. it would slow the weapon down.
  const quickBreak = run.weaponMods.breaker?.quickBreak ?? 0
  fireOnTimer(run, w.id, stats.interval / (fireRateMul * (1 + quickBreak)), dt, () => {
    const aim = aimAngle(run)
    for (const a of ipecacAngles(run, aim)) {
      spawnNova(run, p.x, p.y, stats.radius, stats.dmg, stats.knockback, 0,
        { look: 'breaker', arc: stats.arc, angle: a, carry: stats.carry })
      if (backwash) {
        spawnNova(run, p.x, p.y, stats.radius, stats.dmg * BREAKER_BACKWASH_DMG_FRAC, stats.knockback, 0,
          { look: 'breaker', arc: stats.arc, angle: a + Math.PI, carry: stats.carry })
      }
    }
    // render.js draws the crest from this event, so it carries the geometry rather than making the
    // renderer re-derive an aim that has already moved by the time it runs.
    run.events.push({ type: 'shoot', weapon: 'breaker', x: p.x, y: p.y, angle: aim, maxR: stats.radius, arc: stats.arc, back: backwash })
  })
}

// -- Skipping Shell -------------------------------------------------------------------------
// ONE rule produces both halves of the read. The shell flies, and every `skipEvery` seconds it
// TOUCHES DOWN: a splash where it lands, and a re-aim at the nearest body it has not already
// skipped toward. So it visibly bounces along a path AND visibly changes course to chase — a
// ricochet — out of a single mechanic with a single tuning surface.
//
// It is a CARRIER: `_carrier` makes stepBullets skip the contact scan entirely, because every point
// of this weapon's damage is in the splash. Without that the shell would be paid for twice on any
// body it happened to fly through, and the two numbers would have to be tuned against each other.
function stepShellWeapon(run, w, stats, fireRateMul, dt) {
  const p = run.player
  const fast = run.weaponMods.skippingShell?.fastSkim ?? 0
  fireOnTimer(run, w.id, stats.interval / (fireRateMul * (1 + fast)), dt, () => {
    const aim = aimAngle(run)
    const skips = Math.max(1, Math.round(stats.skips))
    for (const a of ipecacAngles(run, aim)) {
      run.bullets.push({
        weapon: 'shell', _carrier: true,
        x: p.x, y: p.y,
        vx: Math.cos(a) * stats.speed, vy: Math.sin(a) * stats.speed,
        dmg: stats.dmg, r: stats.r,
        // `life` is a backstop, not the shell's real end: it dies when its skips run out. Sized so
        // a shell that somehow never touches down still cannot outlive its own flight budget.
        life: stats.skipEvery * (skips + 1),
        pierce: 1, hitIds: new Set(),
        skips, skipEvery: stats.skipEvery, skipT: stats.skipEvery,
      })
    }
    run.events.push({ type: 'shoot', weapon: 'shell', x: p.x, y: p.y, angle: aim })
  })
}

// One touch-down. Called from stepBullets on the frame the timer expires, before the contact scan
// that carriers skip.
function stepShellSkip(run, b, dt) {
  b.skipT -= dt
  // A touch-down fires on the TIMER *or* on reaching a body, whichever comes first, and the second
  // half is not optional. The stride between periodic touch-downs is speed x skipEvery — 103px at
  // L1 — against a 46px splash, so a purely periodic shell lands NEAR its target far more often
  // than on it: measured, three skips at 160 / 62 / 89px from a body that needed 62, i.e. a throw
  // that visibly chased its target and then damaged nothing at all. The card promises a hit at
  // every touch, so a touch has to be able to happen when the shell ARRIVES.
  let arrived = null
  for (const e of run.enemies) {
    if (e._dead || isAlly(e) || b.hitIds.has(e.id)) continue
    const dx = e.x - b.x, dy = e.y - b.y
    // SHELL_R, not b.r: b.r is how far the SPLASH reaches, and using it here declares arrival
    // from outside the range the splash can actually cover.
    const rad = SHELL_R + e.radius
    if (dx * dx + dy * dy <= rad * rad) { arrived = e; break }
  }
  if (b.skipT > 0 && !arrived) return
  // Marked before the re-aim scan below, so the shell bounces ON to something else rather than
  // sitting on the body it just landed on.
  if (arrived) b.hitIds.add(arrived.id)
  // The splash is a plain nova — no sector, no carry — with a SHORT life, because a 46px ring
  // expanding over the default NOVA_LIFE would deal its damage nearly half a second after the
  // shell visibly landed. See spawnNova's `life` option.
  spawnNova(run, b.x, b.y, b.r, b.dmg, 0, 0, { life: SHELL_SPLASH_LIFE, look: 'foam' })
  run.events.push({ type: 'skip', x: b.x, y: b.y, r: b.r })
  b.skips--
  if (b.skips <= 0) { b.life = 0; return }
  b.skipT = b.skipEvery
  // Re-aim, nearest-first, within SHELL_RETARGET_R of where it LANDED (not of the player) — that
  // cap is what keeps it a skimmed stone instead of a fourth homing weapon. `hitIds` is the set of
  // bodies it has already skipped toward: a carrier never runs the contact scan, so the field is
  // free and this is the only thing that reads it.
  let best = null, bestSq = SHELL_RETARGET_R * SHELL_RETARGET_R
  for (const e of run.enemies) {
    if (e._dead || isAlly(e) || b.hitIds.has(e.id)) continue
    const dx = e.x - b.x, dy = e.y - b.y
    const dSq = dx * dx + dy * dy
    if (dSq < bestSq) { bestSq = dSq; best = e }
  }
  // Nothing in range: it keeps its heading, so a shell thrown into empty sand still skips out and
  // expires rather than stopping dead where it landed.
  if (!best) return
  // NOT marked here. `hitIds` means "already splashed on", and marking a body when the shell merely
  // AIMS at it spends the target without ever reaching it: the next touch-down then skips straight
  // past the thing it was flying at, which measured as a throw that visibly chased its target and
  // damaged nothing. Only arrival marks (see the `arrived` branch above).
  const a = Math.atan2(best.y - b.y, best.x - b.x)
  const speed = Math.hypot(b.vx, b.vy) || 1
  b.vx = Math.cos(a) * speed
  b.vy = Math.sin(a) * speed
}

// -- Barnacles --------------------------------------------------------------------------------
// The one weapon that rewards walking INTO a pack. A crust does nothing on a body that was dying
// anyway; in a crowd, every death re-seeds the next one and the pack grinds itself down.
//
// The larvae are carriers too, for the same reason as the shell: they deliver a status, not a hit,
// so they must not also deal contact damage on the way in.
function stepBarnacleWeapon(run, w, stats, fireRateMul, dt) {
  const p = run.player
  fireOnTimer(run, w.id, stats.interval / fireRateMul, dt, () => {
    const aim = aimAngle(run)
    // ONE local, used as the loop bound AND as the divisor that spaces what the loop spawns. Two
    // separate expressions here is the failure CLAUDE.md documents across eight weapon sites: the
    // extra larvae stack on one bearing and it renders identically to no change at all.
    const count = Math.max(1, Math.round(stats.count))
    for (const a0 of ipecacAngles(run, aim)) {
      for (let i = 0; i < count; i++) {
        const a = a0 + (i - (count - 1) / 2) * BARNACLE_FAN
        run.bullets.push({
          weapon: 'barnacle', _carrier: true,
          x: p.x, y: p.y,
          vx: Math.cos(a) * stats.speed, vy: Math.sin(a) * stats.speed,
          dmg: 0, r: BARNACLE_LARVA_R,
          life: stats.castRange / stats.speed,
          pierce: 1, hitIds: new Set(),
          _crust: { dur: stats.crustDur, dmg: stats.dmg, tick: stats.tick, jumps: Math.round(stats.jumps) },
        })
      }
    }
    run.events.push({ type: 'shoot', weapon: 'barnacle', x: p.x, y: p.y, angle: aim })
  })
}

// A larva looking for a host. Called from stepBullets in the carrier branch.
function stepBarnacleFlight(run, b) {
  for (const e of run.enemies) {
    if (e._dead || isAlly(e)) continue   // SUBMISSION: never crust your own ally
    const dx = e.x - b.x, dy = e.y - b.y
    const rad = b.r + e.radius
    if (dx * dx + dy * dy > rad * rad) continue
    applyBarnacle(run, e, b._crust)
    b.life = 0
    return
  }
}

// PUBLISHED INTO A CONTRACT FIELD ON THE ENEMY. render.js reads status off a fixed named list of
// enemy fields (frozen/chill/venom/ignite/fearT/stunT and now `barnacle`) and never learns a new one
// on its own — a crust kept in a private field is a weapon that grinds bodies down invisibly, which
// is indistinguishable on screen from a weapon that does nothing. sim owns the field, render only
// reads it.
function applyBarnacle(run, e, crust) {
  // REFRESHED, NEVER STACKED. A second larva on the same body resets the clock and keeps the
  // stronger tick, but two crusts never tick side by side: stacking turns a slow grind into an
  // execute, which is the opposite of what this card is for. `next` is deliberately carried over
  // from the existing crust so a stream of larvae cannot reset the tick timer forever and hold the
  // damage at zero — the mirror of the bug the fear refractory exists to prevent.
  const cur = e.barnacle
  e.barnacle = {
    t: Math.max(cur?.t ?? 0, crust.dur),
    // TWO FIELDS, not one: `t` is the live countdown and `dur` is what a full crust is worth. A
    // crust about to expire still has to know the full figure, or the body it seeds on death
    // inherits whatever fraction of a second happened to be left on its parent — and the infection
    // then dies out on timing rather than on its jump budget.
    dur: Math.max(cur?.dur ?? 0, crust.dur),
    dmg: Math.max(cur?.dmg ?? 0, crust.dmg),
    tick: crust.tick,
    next: cur?.next ?? crust.tick,
    jumps: Math.max(cur?.jumps ?? 0, crust.jumps),
  }
  if (!cur) run.events.push({ type: 'crust', x: e.x, y: e.y })
}

// The tick and the spread.
//
// RUNS LAST AMONG THE WEAPON STEPPERS, immediately before the dead sweep, and that placement is
// load-bearing: a host killed by ANY source this frame — this crust's own tick, another weapon, a
// hazard — is still in run.enemies with `_dead` set, so it can still seed the next body. Move this
// call up and the spread silently narrows to "only when the crust itself lands the kill", which is
// a different and much weaker weapon that no test asserting a timer moved would notice.
function stepBarnacles(run, dt) {
  const seeds = []
  for (const e of run.enemies) {
    const c = e.barnacle
    if (!c) continue
    if (e._dead) { seeds.push({ host: e, c }); e.barnacle = null; continue }
    c.t -= dt
    c.next -= dt
    if (c.next <= 0) {
      c.next += c.tick
      applyDamage(run, e, c.dmg)
      if (e._dead) { seeds.push({ host: e, c }); e.barnacle = null; continue }
    }
    if (c.t <= 0) e.barnacle = null
  }
  // QUEUED, not applied inside the walk above. A for...of over run.enemies visits entries appended
  // during it, and applyBarnacle writes to bodies in that same array — seeding a new host mid-walk
  // lets the fresh crust tick on the very frame it landed.
  for (const s of seeds) spreadBarnacle(run, s.host, s.c)
}

// One death's worth of spread. NEAREST-FIRST, so a crust walks THROUGH a pack rather than
// teleporting to its edge, and only onto bodies that are not already crusted.
//
// THE CHAIN IS BOUNDED BY DESCENT: each child inherits `jumps - 1`, so a cast's infection is at most
// jumps deep however dense the crowd is. Letting children inherit the full count instead reads as
// the same card and is unbounded — one lucky pack would crust the entire field. It is also gated on
// KILLS rather than on time, so the infection can only advance as fast as the player is actually
// killing, which is what keeps it from running away from the damage that earned it.
function spreadBarnacle(run, host, c) {
  let left = Math.max(0, Math.round(c.jumps))
  if (left <= 0) return
  const rSq = BARNACLE_JUMP_R * BARNACLE_JUMP_R
  const near = []
  for (const e of run.enemies) {
    if (e._dead || isAlly(e) || e.barnacle) continue
    const dx = e.x - host.x, dy = e.y - host.y
    const dSq = dx * dx + dy * dy
    if (dSq <= rSq) near.push({ e, dSq })
  }
  near.sort((a, b) => a.dSq - b.dSq)
  for (const n of near) {
    if (left <= 0) break
    applyBarnacle(run, n.e, { dur: c.dur, dmg: c.dmg, tick: c.tick, jumps: c.jumps - 1 })
    left--
  }
}

// -- The Trawl's two natives (v7.97) ------------------------------------------------------------
// Both are the humans' gear pointed back at the water, and between them they do the two jobs the
// chapter actually needs: keep the pack OFF you, and hold it STILL for the net to arrive into.
// Neither of them executes, because the chapter's own wall already does that.
//   longline  a SEGMENT that is set and left — run.longlines, the one new array. Nothing else in
//             the game is a static line: every other area denial is a disc (holes, mines, zones,
//             blooms) or a moving front (novas).
//             ⚠ It is deliberately NOT a swept beam. run.beams already carries `swept`+`rotSpeed`+
//             `arms` and that IS Pulsar Sweep; a longline rotating about the player would have been
//             a third rotating rake with a new name on it.
//   netToss   a thrown GROUP HOLD, riding run.lobs for the flight and adding no array at all (the
//             `snare` branch in stepLobs). Pincer answers one approach; this stops a pack.
// Both aim through aimAngle — nearest enemy first, facing only as the fallback. A kiting player's
// heading points AWAY from the swarm, which in this chapter is most of the time, so aiming by
// facing alone would fire every cast into empty water (fireFlagella's rule, v5.1.2).

function stepLonglineWeapon(run, w, stats, fireRateMul, dt) {
  fireOnTimer(run, w.id, stats.interval / fireRateMul, dt, () => fireLongline(run, stats))
}

// Sets the line PERPENDICULAR to the aim, `offset` px along it — a fence between the player and the
// pack. It does not follow the player afterwards and is not anchored to them: it is gear that was
// set and is left, which is the whole reason the weapon rewards a chapter spent running.
function fireLongline(run, stats) {
  const p = run.player
  const aim = aimAngle(run)
  // (nx, ny) is the line's NORMAL, so it points along the aim and the rope lies across it.
  const nx = Math.cos(aim), ny = Math.sin(aim)
  // ONE local for the count, used as both the loop bound AND the spacing divisor below. Written
  // twice with different values, the extra ropes stack on the first one — and three ropes sharing a
  // position render identically to one rope, i.e. to no change at all (see the Ipecac orbit bug).
  const lines = ipecacN(run, 1 + (run.weaponMods.longline?.twinSet ?? 0))
  for (let i = 0; i < lines; i++) {
    const d = stats.offset + (i - (lines - 1) / 2) * LONGLINE_TWIN_GAP
    run.longlines.push({
      x: p.x + nx * d, y: p.y + ny * d, nx, ny,
      half: LONGLINE_HALF_W, len: stats.length,
      dmg: stats.dmg, tick: stats.tick, acc: 0,
      life: stats.setDur, duration: stats.setDur,
      snagged: new Set(),
    })
  }
  run.events.push({ type: 'longline', x: p.x, y: p.y, angle: aim, count: lines })
  // Drops the OLDEST, like ZONE_MAX_LIVE: cutting the newest would eat the cast just made.
  if (run.longlines.length > LONGLINE_MAX_LIVE) run.longlines = run.longlines.slice(-LONGLINE_MAX_LIVE)
}

// Ages every set line and grinds whatever is lying across it.
//
// The hit test is the net wall's netDist/netAlong pair, in that order: distance ACROSS the rope
// first (the cheap reject), then distance ALONG it against half the length. Getting the second test
// wrong is the silent failure here — drop it and the line is infinite, which looks exactly like a
// correct line as long as the crowd happens to be in front of you.
function stepLonglines(run, dt) {
  if (run.longlines.length === 0) return
  for (const l of run.longlines) {
    l.life -= dt
    l.acc += dt
    const ticks = Math.floor(l.acc / l.tick)
    if (ticks <= 0) continue
    l.acc -= ticks * l.tick
    const halfLen = l.len / 2
    for (const e of run.enemies) {
      if (e._dead || isAlly(e)) continue
      const dx = e.x - l.x, dy = e.y - l.y
      const across = dx * l.nx + dy * l.ny
      if (Math.abs(across) > l.half + e.radius) continue
      const along = dx * -l.ny + dy * l.nx
      if (Math.abs(along) > halfLen) continue
      applyDamage(run, e, l.dmg * ticks)
      // THE CATCH — once per body per THIS line, never per tick. LONGLINE_SNAG (0.5s) against a
      // 0.40s tick is longer than the interval between applications, so a per-tick refresh is a
      // permanent lock: the fence would stop being a fence and become an invulnerability field.
      // Buying more catches is what Twin Set is for.
      if (!e._dead && !l.snagged.has(e.id) && !resistsCC(e)) {
        l.snagged.add(e.id)
        e.stunT = Math.max(e.stunT || 0, LONGLINE_SNAG * ccScale(run, e))
        spendCC(run, e)
      }
    }
  }
  run.longlines = run.longlines.filter((l) => l.life > 0)
}

// Net Toss. The throw is a run.lobs entry carrying `snare` — see the branch at the top of stepLobs
// for the landing, and state.js's lobs[] doc for why that branch sits ABOVE the shrapnel block.
function stepNetTossWeapon(run, w, stats, fireRateMul, dt) {
  const p = run.player
  const nets = ipecacN(run, 1 + (run.weaponMods.netToss?.doubleHaul ?? 0))
  fireOnTimer(run, w.id, stats.interval / fireRateMul, dt, () => {
    for (let i = 0; i < nets; i++) {
      // pickBloomSpot lands on a real body when there is one in range and scatters when there is
      // not, which is what makes a second net go somewhere useful rather than on top of the first.
      const spot = pickBloomSpot(run, stats.castRange)
      run.lobs.push({
        x: p.x, y: p.y, fromX: p.x, fromY: p.y, tx: spot.x, ty: spot.y,
        t: 0, flight: stats.flight, r: stats.r, dmg: stats.dmg,
        snare: stats.hold,
      })
    }
    run.events.push({ type: 'toss', x: p.x, y: p.y })
  })
}

// ---- The Twilight's three natives (v7.x) ------------------------------------------------
// See the block at the end of WEAPONS in config.js for the design, and in particular for why the
// two rares are allowed to read run.charge when resourceDamageMul's own block says Book 2 spent
// that licence on The Surf. None of the three adds a run.* array.

/** Where this cast's columns land. `count` DISTINCT spots: the nearest bodies within castRange
 * first, then — if the field holds fewer bodies than the cast has columns — a ring of surplus
 * columns around the last real target.
 *
 * ⚠ THE PADDING RING IS WHY THIS IS A FUNCTION. A per-cast count is written twice in this codebase
 * (as the loop bound and as the divisor that spaces what the loop spawns), and multiplying one
 * without the other stacks the extra output on a single point — which renders identically to not
 * having fired it. Here both readings come off `count` and `pad`, each declared once. The suite
 * asserts DISTINCT POSITIONS rather than a count, because a count is exactly what passes when three
 * columns share a spot. */
function sunspearSpots(run, count, castRange) {
  const p = run.player
  const rangeSq = castRange * castRange
  const near = run.enemies
    .filter((e) => {
      if (e._dead || isAlly(e)) return false   // SUBMISSION: never call the sun down on your own ally
      const dx = e.x - p.x, dy = e.y - p.y
      return dx * dx + dy * dy <= rangeSq
    })
    .sort((a, b) => ((a.x - p.x) ** 2 + (a.y - p.y) ** 2) - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2))

  const spots = near.slice(0, count).map((e) => ({ x: e.x, y: e.y }))
  if (spots.length === 0) return spots        // nothing in reach: the cast is a dud, like any aimed weapon's

  const pad = count - spots.length
  const base = spots[spots.length - 1]
  for (let i = 0; i < pad; i++) {
    const a = (i / pad) * Math.PI * 2
    spots.push({ x: base.x + Math.cos(a) * SUNSPEAR_SPREAD, y: base.y + Math.sin(a) * SUNSPEAR_SPREAD })
  }
  return spots
}

// Sunspear. Each column is a run.lobs entry whose `fromX/fromY` ARE its target, so the shared lerp
// in stepLobs moves it nowhere: it hangs at the spot for SUNSPEAR_FALL as a telegraph and lands.
// `column: true` is what picks the branch out of stepLobs — see there for why that branch, like the
// net's, must sit above the shrapnel block.
function stepSunspearWeapon(run, w, stats, fireRateMul, dt) {
  const p = run.player
  // IPECAC multiplies CASTS here, not headings. ipecacAngles is the wrong tool for this weapon: a
  // column falls straight down and has no heading to spread across, so the extra casts are pushed
  // off onto the same ring the padding uses instead of being rotated to nowhere.
  const casts = ipecacN(run, 1)
  fireOnTimer(run, w.id, stats.interval / fireRateMul, dt, () => {
    // ONE local, read by sunspearSpots as both its loop bound and its padding divisor. It is already
    // mod-folded: `secondSun` is ['count','flat'] in WEAPON_STAT_MODS, so a picked column is a real
    // extra spot rather than a second cast landing on the first.
    const count = Math.max(1, Math.round(stats.count))
    const spots = sunspearSpots(run, count, stats.castRange)
    for (let c = 0; c < casts; c++) {
      // `casts` again as the divisor, for the same reason `count` is: the offsets have to SPREAD
      // over however many casts there are, or IPECAC's extra output lands on the original's spots.
      const a = (c / casts) * Math.PI * 2
      const ox = c === 0 ? 0 : Math.cos(a) * SUNSPEAR_SPREAD
      const oy = c === 0 ? 0 : Math.sin(a) * SUNSPEAR_SPREAD
      for (const s of spots) {
        const tx = s.x + ox, ty = s.y + oy
        run.lobs.push({
          x: tx, y: ty, fromX: tx, fromY: ty, tx, ty,
          t: 0, flight: SUNSPEAR_FALL, r: stats.r, dmg: stats.dmg,
          column: true,
        })
      }
    }
    run.events.push({ type: 'sunspear', x: p.x, y: p.y, count: spots.length * casts })
  })
}

// Foxfire. A run.blooms entry, with the radius the dark buys BAKED IN AT CAST — see FOXFIRE_GLOOM.
// Snapshot rather than per-tick, for the same reason fireBeam snapshots Strobe and the prism ladder:
// a fire you lit while you were dark keeps the hold it took, so the cast is a decision instead of a
// number that wobbles under a bar the player is also spending on the Pulse.
function stepFoxfireWeapon(run, w, stats, fireRateMul, dt) {
  const p = run.player
  const quickKindle = run.weaponMods.foxfire?.quickKindle ?? 0
  const clouds = ipecacN(run, 1)
  fireOnTimer(run, w.id, stats.interval / (fireRateMul * (1 + quickKindle)), dt, () => {
    const gloom = 1 + (FOXFIRE_GLOOM - 1) * darkness(run.charge, CHAPTERS[run.chapter].resource, run.chargeMax)
    for (let i = 0; i < clouds; i++) {
      const spot = pickBloomSpot(run, stats.castRange)
      run.blooms.push({
        x: spot.x, y: spot.y, r: 0, maxR: stats.maxR * gloom, t: 0,
        dur: stats.glowDur, dmgPerTick: stats.dmg,
        // `look` keeps the Spore Bloom's own mods off this cloud (stepBlooms reads sporeburst and
        // tideCarried once for the whole list, exactly like stepLobs reads shrapnel — the same
        // cross-weapon leak, guarded the same way). `slow` keeps the pond's slow off it: the one
        // chapter that already slows you must not hand out a second slow on a card that never
        // mentions one.
        look: 'foxfire', slow: 0,
      })
    }
    // `gloom` rides the event so the renderer can burn the cast brighter when the dark bought it
    // something — the tell for a bonus the player otherwise only sees as a slightly wider circle.
    run.events.push({ type: 'foxfire', x: p.x, y: p.y, gloom })
  })
}

// Sunlance. A run.beams entry with rotSpeed 0 — it is a stab held on one bearing, never a sweep.
// (run.beams already carries `swept` + `arms`, and that is Pulsar Sweep; a third rotating rake is
// the shape CLAUDE.md warns every new weapon away from.) Reach is the bar: full length at a full
// bar, SUNLANCE_REACH_MIN of it at an empty one, linear in between.
//
// RAW charge, not darkness(), and that is the same split the chapter's own two schedules take (see
// THE DARK in config.js): darkness() is flat above half a bar, which would make the top half of
// this weapon's whole read do nothing. A continuous readout wants the raw bar.
function stepSunlanceWeapon(run, w, stats, fireRateMul, dt) {
  fireOnTimer(run, w.id, stats.interval / fireRateMul, dt, () => {
    const frac = run.chargeMax > 0 ? Math.min(1, Math.max(0, run.charge) / run.chargeMax) : 1
    const reach = stats.length * (SUNLANCE_REACH_MIN + (1 - SUNLANCE_REACH_MIN) * frac)
    const aim = aimAngle(run)
    for (const a of ipecacAngles(run, aim)) {
      run.beams.push({
        angle: a, life: stats.duration, duration: stats.duration, dmg: stats.dmg,
        tick: stats.tick, width: stats.width, length: reach,
        rotSpeed: 0, acc: 0, focusBonus: 0, prism: null,
        look: 'sunlance',
      })
    }
    run.events.push({ type: 'sunlance', angle: aim, reach })
  })
}

// -- The Reef's natives (v7.x) ------------------------------------------------------------------
// The chapter denies you the forward axis, so neither of these reads nearestEnemy at ALL — the
// one is welded to the lane's heading and the other to the lane's terrain. aimAngle is the
// function to keep out of this block.

// PISTOL SHRIMP. A run.beams entry with rotSpeed 0, the Sunlance's idiom (a stab held on one
// bearing, never a sweep), tagged look: 'snap'. The claw TRACKS: the crack goes at the nearest body
// on screen (aimAngle, owner 2026-08-24), so what a level buys — width — is how many of a pack one
// bolt lines up once it is already pointed at them.
//
// aimAngle is the same call every other tracking weapon makes, which is what keeps this ONE weapon
// in both places that can hold it (The Reef's pool, and blank/devCards, which ignore every
// eligibility rule). With nothing on screen it falls through to p.facingAngle, and
// stepPlayerMovement pins that to laneAxes().angle inside a lane — so an empty lane still cracks
// straight ahead without this function naming the lane at all.
function stepSnapWeapon(run, w, stats, fireRateMul, dt) {
  const quick = run.weaponMods.pistolShrimp?.quickSnap ?? 0
  fireOnTimer(run, w.id, stats.interval / (fireRateMul * (1 + quick)), dt, () => fireSnap(run, stats))
}

function fireSnap(run, stats) {
  const p = run.player
  const heading = aimAngle(run)
  // THE REAR CRACK IS BASELINE (v7.x). A snapping shrimp's claw collapses a cavity, and a cavity
  // collapses both ways; the mod below buys its STRENGTH rather than its existence.
  //   It is what the chapter's own geometry asks for. Measured over 6 seeded 300s runs at d3 on a
  // phone (scripts/reef-pileup.mjs): 53% of live bodies sit ASTERN of the player, because
  // laneScroll 90 ties the drone's own 90px/s and a damselfish can neither catch you nor fall
  // behind. The aim points at ONE of them, so the crack opposite it is what keeps the other side of
  // the corridor covered — shorter and softer (SNAP_BACKBLAST_LEN, backFrac), because a full-length
  // second bolt would make the aim decide nothing.
  const backFrac = (run.weaponMods.pistolShrimp?.backblast ?? 0) > 0 ? SNAP_BACKBLAST_FULL_FRAC : SNAP_BACKBLAST_FRAC
  const push = (angle, dmg, length = stats.length) => run.beams.push({
    // `snapT` and not `duration`: the levels[] key is deliberately outside STAT_KEYS (see
    // WEAPONS.pistolShrimp) and is mapped onto the beam's own field here, once, at the cast.
    angle, life: stats.snapT, duration: stats.snapT, dmg,
    tick: stats.tick, width: stats.width, length,
    rotSpeed: 0, acc: 0, focusBonus: 0, prism: null,
    look: 'snap',
  })
  for (const a of ipecacAngles(run, heading)) {
    push(a, stats.dmg)
    // The rear crack goes through ipecacAngles with the first one rather than being added after
    // it, so an Ipecac build multiplies BOTH — the alternative (forward only) would make the
    // anomaly quietly halve this weapon's coverage, which is fireBreaker's own ruling.
    //   ⚠ IT IS SHORTER THAN THE FORWARD CRACK, AND THAT IS THE CARD'S PRICE, NOT A ROUNDING. At
    // the full 340 the pair covers a 680px line through the player and the aim stops mattering:
    // measured at that length the census read 155.9 kills/min at L1 against a pool topping out at
    // 126.5, i.e. the starter as the chapter's best killer. Cut short, the back crack is a mop and
    // the front one is the shot.
    push(a + Math.PI, stats.dmg * backFrac, SNAP_BACKBLAST_LEN)
  }
  // The event carries the geometry the renderer needs for the cavitation puff, rather than making
  // it re-derive a heading — main.js gives it the throttled 'shoot' voice. `backFrac` and not a
  // boolean: the muzzle boils both ways on every cast now, so the only thing left for Backblast to
  // SHOW at the origin is how hard the rear one boils.
  run.events.push({ type: 'snap', x: p.x, y: p.y, angle: heading, reach: stats.length, backFrac })
}

// FIRE CORAL. Lights the coral of the next `ridges` ridges ahead of the player, and everything
// that crosses a lit one burns.
//
// ⚠ IT OWNS ITS ENTITIES AND MAY NOT BORROW A SPUR'S. run.spurs is emptied and rebuilt in full
// (length = 0, then refilled) every time the player crosses a ridge index — see streamSpurs — so
// state hung off an entry there survives at most 4.7s of lane and vanishes without a trace. A
// polyp is instead a SNAPSHOT of the pure spurAt() geometry plus a timer, which costs one object
// per lit ridge and makes the band that burns identical, to the pixel, to the band that grates.
// (The persistent per-ridge registry the spec defers would let this hang off the field itself;
// until it exists, this is the honest shape.)
function stepFireCoralWeapon(run, w, stats, fireRateMul, dt) {
  const spec = CHAPTERS[run.chapter].spurs
  if (!spec || run._obstacleSeed == null) return   // no ridges to light — see WEAPONS.fireCoral
  const quick = run.weaponMods.fireCoral?.quickWake ?? 0
  fireOnTimer(run, w.id, stats.interval / (fireRateMul * (1 + quick)), dt, () => fireCoral(run, spec, stats))
}

function fireCoral(run, spec, stats) {
  const ax = laneAxes(CHAPTERS[run.chapter])
  const spill = (run.weaponMods.fireCoral?.overgrowth ?? 0) > 0
  // ONE local for the count, used as the loop BOUND and as the index STEP — the eight-site trap
  // CLAUDE.md documents. Because the targets are consecutive ridge INDICES they are distinct by
  // construction; there is no chooser here to pick the same spot twice (run RN.e asserts it).
  const n = ipecacN(run, Math.max(1, Math.round(stats.ridges)))
  // FROM THE NEAREST RIDGE, NOT FROM THE ONE JUST PASSED — the same cursor streamSpurs uses, and
  // it is a rounding choice with a real consequence. Counting from floor() makes the lead depend
  // on where in the 210px gap the cast happened to land: a cast fired just before a ridge lights
  // the one 2px in front of the player, i.e. a band the crowd is already standing in. Rounding
  // first floors the lead at half a gap: the residual is in [-105, 105), so the lit ridge is
  // 105-315px ahead (2.3-7.0s of scroll at laneScroll 45) however the interval phases.
  const first = Math.round(run.player[ax.fwd] / spec.spacing) + ax.dir * FIRE_CORAL_LEAD
  for (let k = 0; k < n; k++) {
    const i = first + ax.dir * k
    // A ridge already burning is REFRESHED, never doubled: two entries on one index would tick
    // the same band twice a beat, which is a silent damage doubling at a fire rate the player
    // can buy (run RN.f asserts one entry per index and single-cast damage across a refresh).
    // `spill` LATCHES: a refresh ORs the current build's Overgrowth onto the entry, so a ridge lit
    // before the pick widens to wall-to-wall on its next re-cast and never narrows again.
    const live = run.polyps.find((pl) => pl.i === i)
    // A REFRESH TOPS THE CLOCK UP AND NEVER TOUCHES `lit`. That field is the AGE of the fire: it only
    // ever counts up (stepPolyps), and syncPolyps runs the ignition ramp off it, so a ridge that has
    // been alight for two seconds stays alight through a re-cast. An ignition ramp derived from the
    // REMAINING time instead resets to zero right here, which blanked a burning band for the whole
    // FIRE_CORAL_VIS.igniteT on every refresh — common with Quick Wake, near-certain with More Reef,
    // and on screen it is a weapon doing full damage while looking switched off.
    if (live) { live.t = stats.duration; live.dmg = stats.dmg; live.spill = live.spill || spill; continue }
    run.polyps.push({
      ...spurAt(i, spec, run._obstacleSeed),
      t: stats.duration, lit: 0, dmg: stats.dmg, tick: stats.tick, acc: 0, spill,
    })
  }
}

// The lit ridges, ticking. Structurally stepBlooms — a world-anchored, enemies-only, dot-flagged
// zone on its own accumulator — and it shares onCoral with the grate, so the coral that burns the
// crowd is exactly the coral that grates the player. `spill` (Overgrowth) drops the groove test
// and leaves the forward band, which is the whole ridge wall to wall.
function stepPolyps(run, dt) {
  if (run.polyps.length === 0) return
  const ax = laneAxes(CHAPTERS[run.chapter])
  for (const pl of run.polyps) {
    pl.t -= dt
    pl.lit += dt   // monotone age, never reset by a refresh — syncPolyps' ignition ramp reads it
    pl.acc += dt
    while (pl.acc >= pl.tick) {
      pl.acc -= pl.tick
      for (const e of run.enemies) {
        if (e._dead) continue
        if (Math.abs(e[ax.fwd] - pl.f) > pl.thick / 2) continue
        if (!pl.spill && !onCoral(pl, e[ax.cross])) continue
        applyDotDamage(run, e, pl.dmg)
      }
    }
  }
  run.polyps = run.polyps.filter((pl) => pl.t > 0)
}

// SQUID INK. A run.blooms entry carrying `blind`, planted ON the player. The cloud does not move —
// it is world-anchored like every other bloom — so in a lane the scroll carries it astern while
// the crowd swims into it, which is the picture and also the mechanic: what is blinded is behind
// you within a second or two.
//
// ⚠ THE PERCEPTION HALF IS NOT HERE. It is at the retarget seam in stepEnemyMovement, where lure,
// pastSeek and ally already live, and the whole reason it is one edit is that every movement
// machine below that seam reads a POINT and never run.player.
function stepSquidInkWeapon(run, w, stats, fireRateMul, dt) {
  const quick = run.weaponMods.squidInk?.quickInk ?? 0
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + quick)), dt, () => fireInk(run, stats))
}

function fireInk(run, stats) {
  const p = run.player
  const ax = laneAxes(CHAPTERS[run.chapter])
  // ONE local for the count, used as the loop BOUND and as the spacing divisor — the eight-site
  // trap CLAUDE.md documents, where multiplying only the bound stacks the extra jets on one point
  // and renders identically to no change at all. Run SQ.d asserts DISTINCT cross positions.
  const n = ipecacN(run, Math.max(1, Math.round(stats.clouds)))
  const step = stats.maxR * INK_JET_SPREAD
  for (let k = 0; k < n; k++) {
    // Spread ACROSS the lane, so a picked-up count draws a curtain over the corridor rather than a
    // deeper blot on one spot. In a non-lane chapter laneAxes reads 'y'/'x' as it always did and the
    // jets spread along that cross axis, which is still a line and still distinct.
    const off = (k - (n - 1) / 2) * step
    run.blooms.push({
      x: p.x + (ax.cross === 'x' ? off : 0),
      y: p.y + (ax.cross === 'y' ? off : 0),
      t: 0, r: 0, maxR: stats.maxR, dur: stats.dur,
      dmgPerTick: stats.dmgPerTick, look: 'ink',
      // `slow: 0` opts OUT of stepBlooms' bloom-slow branch, Foxfire's idiom. A cloud that also
      // slowed would keep the blinded bodies inside itself, which is the exact opposite of the
      // card: the whole payoff is watching the lane carry them past you.
      slow: 0,
      // The tag stepBlooms reads. Seconds of blindness, refreshed every frame a body is inside.
      blind: stats.blind,
    })
  }
  run.events.push({ type: 'ink', x: p.x, y: p.y, r: stats.maxR })
}

// OXYGEN TANK. A run.lobs entry tagged `tank`, thrown at a point on the lane AHEAD of the player
// rather than at a body — the one throw in the game whose target is a place the thrower is going.
// The scroll closes the gap, so the throw and the oncoming stream keep the same appointment.
//
// ⚠ THE NON-LANE BRANCH IS A FALLBACK, NOT A SECOND DESIGN, for the reason fireSnap's block gives:
// the card is scoped to The Reef's pool, but devCards ignores every eligibility rule and ships in
// the production bundle. There 'up the lane' has no meaning, so it takes p.facingAngle — the
// direction you last MOVED — which keeps the throw untargeted. Deliberately not aimAngle.
function stepTankWeapon(run, w, stats, fireRateMul, dt) {
  const quick = run.weaponMods.oxygenTank?.quickTank ?? 0
  fireOnTimer(run, w.id, stats.rate / (fireRateMul * (1 + quick)), dt, () => fireTank(run, stats))
}

function fireTank(run, stats) {
  const ch = CHAPTERS[run.chapter]
  const p = run.player
  const heading = ch.lane === true
    ? laneAxes(ch).angle
    : (p.facingAngle ?? (p.facing >= 0 ? 0 : Math.PI))
  const shove = (run.weaponMods.oxygenTank?.pressureWave ?? 0) > 0
  // ipecacAngles is what every other angle-carrying cast in this file uses for the anomaly, so a
  // Reef run that took Ipecac throws a fan of tanks rather than three stacked on one point.
  for (const a of ipecacAngles(run, heading)) {
    run.lobs.push({
      x: p.x, y: p.y, fromX: p.x, fromY: p.y,
      tx: p.x + Math.cos(a) * stats.range, ty: p.y + Math.sin(a) * stats.range,
      t: 0, flight: stats.flight, r: stats.r, dmg: stats.dmg,
      // The two fields the `tank` branch in stepLobs reads. `boil` is banked AT THE THROW, so a
      // Long Boil picked while a tank is in the air does not lengthen the one already thrown.
      tank: true, boil: stats.boil, shove,
    })
  }
  run.events.push({ type: 'toss', x: p.x, y: p.y })
}

// -- Fin Hit (v7.x, The Deep's native) ---------------------------------------------------------
// The only movement-coupled weapon in the game. Both halves read the player's own motion and
// neither reads where the enemies are, which is what makes it feel like the animal's body rather
// than a weapon the animal is carrying.
//
// It reuses run.novas with an `arc` — the Breaker's sector machinery, including the once-per-body
// `hit` set that stops an expanding front re-hitting as it passes. No new entity, no new array.
function stepFinHitWeapon(run, w, stats, fireRateMul, dt) {
  const thrash = run.weaponMods.finHit?.thrash ?? 0
  fireOnTimer(run, w.id, stats.interval / (fireRateMul * (1 + thrash)), dt, () => fireFinHit(run, stats))
}

function fireFinHit(run, stats) {
  const p = run.player
  // p.vx/p.vy are stepPlayerMovement's own velocity in px/s — the same snapshot the skies' artillery
  // leads its shells with, so this reads the player's REAL speed after every slow, floor and boost
  // rather than re-deriving it from the input.
  const speed = Math.hypot(p.vx, p.vy)
  const power = Math.min(FINHIT_SPEED_CAP, speed / PLAYER.baseSpeed)
  // THE ZERO AT A STANDSTILL IS THE CARD, not an edge case to paper over — see WEAPONS.finHit, and
  // the ANOMALIES.stillness interaction its description states out loud. Returning early also means
  // a stationary player emits no event, so the fin does not visibly swing while doing nothing.
  if (power <= 0) return

  const heading = Math.atan2(p.vy, p.vx)
  // The signed turn since the last sweep, wrapped into (-pi, pi] so that crossing the ±pi seam
  // reads as a small turn rather than a full reversal.
  const prev = run._finPrevA
  const turn = prev == null ? 0 : Math.atan2(Math.sin(heading - prev), Math.cos(heading - prev))
  run._finPrevA = heading

  // OUTSIDE OF THE TURN when you are turning, ALTERNATING when you are not. The second half is what
  // stops the weapon being dead on a straight line, and together they are the "damage where you
  // turn" the spec asks for: swim straight and the body beats side to side, cut a corner and the
  // whole sweep goes to the outside of it.
  let side
  if (Math.abs(turn) > FINHIT_TURN_MIN) side = Math.sign(turn)
  else side = run._finSide = -(run._finSide || 1)
  // Square to the heading, then biased BACKWARD — see FINHIT_SWEEP_BIAS for the measurement that
  // put it there. The sweep still reads as "out to the side", it just covers the shoulder.
  const angle = heading + side * (Math.PI / 2 + FINHIT_SWEEP_BIAS)

  for (const a of ipecacAngles(run, angle)) {
    spawnNova(run, p.x, p.y, stats.range, stats.dmg * power, stats.knockback, 0, { look: 'finHit', arc: stats.arc, angle: a })
  }
  // `power` rides the event so render can swing a harder-looking fin when the shark is moving fast —
  // the card's whole claim is that speed matters, and a sweep drawn identically at 0.3 and at 1.6
  // would be that claim being invisible.
  run.events.push({ type: 'finHit', x: p.x, y: p.y, angle, arc: stats.arc, range: stats.range, power })
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
  // CHAPTER-SCOPED PASSIVES (v7.x, The Wreck): an entry may declare `chapters: [...]` to restrict
  // where the real pool offers it. devCards calls makePassiveCard directly and never reaches this
  // function, so a chapter-scoped card stays testable from the dev menu in every chapter.
  return Object.keys(PASSIVES).filter((id) =>
    (run.passivePicks[id] ?? 0) < MAX_PASSIVE_LEVEL
    && !(lane && id === 'magnet')
    && !(brittle && DEFENSIVE_PASSIVES.includes(id))
    && !(noHeal && id === 'regen')
    && !(PASSIVES[id].chapters && !PASSIVES[id].chapters.includes(run.chapter))
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
// THE DUO BOONS LIVE RIGHT NOW, AND THE ONLY PLACE THAT GATE IS AUTHORED. Two readers depend on
// agreeing screen for screen: eligibleWeaponModCandidates RESERVES a pool slot for each of these,
// and stepLevelUp banks a dry screen against each one it did not offer. A second copy of the gate
// would let them disagree — pity accruing on screens the pool could never spend it on, which is
// this repo's largest defect class (one fact in two places, no import between them).
// `needs` is the whole scarcity of the card: it is a mod on weapon A that pays out through weapon
// B, so it cannot exist until the run holds both. Everything else here is the ordinary pick cap.
function liveDuoMods(run) {
  const focus = specialistFocus(run)
  const live = []
  for (const w of run.weapons) {
    const modCfgs = WEAPON_MODS[w.id]
    if (!modCfgs) continue
    for (const modId of Object.keys(modCfgs)) {
      const needs = modCfgs[modId].needs
      if (!needs || !run.weapons.some((o) => o.id === needs)) continue
      if ((run.weaponModPicks[w.id]?.[modId] ?? 0) >= modPickCap(w.id, modId, focus)) continue
      live.push({ weapon: w.id, mod: modId })
    }
  }
  return live
}

// Exported for run DB in test/sim-test.js only: the reserved slot is a property of the POOL, and
// asserting it through buildLevelUpChoices would only ever be a rate with a band around it.
export function eligibleWeaponModCandidates(run) {
  const candidates = []
  // A DUO BOON IS RESERVED, NOT DRAWN (2026-08-23). It holds one of its weapon's
  // MOD_CANDIDATES_PER_WEAPON slots outright from the moment the pair is complete, instead of
  // taking its chances in the shuffle below with every ordinary mod — Silt Flush was competing for
  // 2 of Downwash's 8 slots, so it was absent from three pools in four before the rarity roll had
  // even looked at it. Reserved WITHIN the weapon's budget rather than on top of it, so the pool's
  // size is untouched and this cannot become a stealth widening of the mod bucket.
  const reserved = liveDuoMods(run)
  const reservedFor = new Map()
  for (const d of reserved) reservedFor.set(d.weapon, [...(reservedFor.get(d.weapon) ?? []), d.mod])
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
      && (picks?.[modId] ?? 0) < modPickCap(w.id, modId, focus)
      // A DUO BOON declares the OTHER weapon it is made of (`needs`, see the WEAPON_MODS header
      // in config.js) and is not drawn here AT ALL — liveDuoMods above owns its gate, and the
      // reserved slot below places it. Excluding the whole class rather than filtering it in is
      // what keeps that gate authored once: devCards still ignores eligibility by design, and the
      // fire sites still fall back to the veil's level-1 numbers.
      && !modCfgs[modId].needs)
    shuffleInPlace(owned)
    // SPECIALIST's price: every weapon that is NOT the focus puts one fewer mod in the pool. Only
    // charged when a focus actually exists, and floored at 1 so a weapon is never silenced.
    const per = focus && w.id !== focus
      ? Math.max(1, MOD_CANDIDATES_PER_WEAPON - SPECIALIST_OTHER_PENALTY)
      : MOD_CANDIDATES_PER_WEAPON
    const duo = reservedFor.get(w.id) ?? []
    for (const modId of duo) candidates.push({ weapon: w.id, mod: modId })
    for (const modId of owned.slice(0, Math.max(0, per - duo.length))) candidates.push({ weapon: w.id, mod: modId })
  }
  if (candidates.length <= MOD_POOL_MAX) return candidates

  // The trim samples the ORDINARY candidates only. A reserved boon that survived the per-weapon
  // budget and was then dropped here would leave pity armed with nothing in the pool to spend it
  // on — the counter would keep climbing and the guarantee would silently slip a screen at a time.
  const keep = candidates.filter((c) => WEAPON_MODS[c.weapon][c.mod].needs)
  const pool = candidates.filter((c) => !WEAPON_MODS[c.weapon][c.mod].needs)
  const sampled = keep
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
  // passiveEffectText (config.js) is the ONE place a passive's magnitude becomes text — the pause
  // build sheet (ui.js) calls the same function, so the two can no longer drift apart.
  if (cfg.kind === 'resist') {
    // RESIST PASSIVES (Sleek, Oilskin, v7.x): print what the player will HAVE after the pick, not
    // the raw increment — resistFrac's diminishing returns mean the same base no longer buys the
    // same thing twice, so a "+N%" desc would overstate every pick after the first (owner ruling:
    // "do like infusions, the before -> after number"). Exactly the element idiom
    // (elementCardDesc/elText, config.js): descT carries the template + its numbers, desc is the
    // same sentence composed in English for consumers that want a plain string (dev-menu filter,
    // buildReadout, tests), and ui.js's cardDescHtml dispatches on descT EXISTING, not on kind —
    // so this gets the before->after strikethrough for free.
    const now = run.passives[id]
    const descT = passiveEffectText(cfg, now + bonus)
    // `prev` is the same template's number at the potency the player has right now — absent on a
    // first pick (now === 0), exactly as elements leave it off.
    if (now > 0) descT.prev = passiveEffectText(cfg, now).p
    return { kind: 'passive', id, title: cfg.name, desc: elText(descT), descT, tag: `Lv ${picks + 1}`, rarity, icon: cfg.icon ?? '💪', bonus }
  }
  const desc = passiveEffectText(cfg, bonus)
  return { kind: 'passive', id, title: cfg.name, desc, tag: `Lv ${picks + 1}`, rarity, icon: cfg.icon ?? '💪', bonus }
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
function makeElementCard(run, id, rarity) {
  const cfg = ELEMENTS[id]
  const picks = run.elementPicks[id] ?? 0
  {
    // The ladder is a flat integer one and DECLINES `normal` — an element card is always rare or
    // better, which is most of how total potency comes down. Returning null for a tier the card
    // does not offer is the makePassiveCard idiom; rollCard re-rolls on this table.
    const bonus = EL_VALUES[rarity]
    if (bonus == null) return null
    // The card states what the player will HAVE after taking it, not what the tier is worth.
    // `descT` is the template + its numbers (config.js), which is what ui.js translates through
    // tt(); `desc` is the same sentence composed in English, for every consumer that wants a plain
    // string — the dev-menu filter, buildReadout, the tests.
    const now = run.elements?.[id] ?? 0
    const descT = elementCardDesc(id, now + bonus)
    // `prev` is the SAME template's numbers at the potency the player has right now, so the card can
    // strike the old figure through and show the new one beside it. Only on an upgrade: at potency 0
    // there is no old value, and elScale(0) is 0, which makes cold's threshold divide by zero.
    // Which numbers moved is left to the renderer — it compares per placeholder, so a figure the
    // pick does not change (the 3s window, lightning's arc count on a small step) stays plain.
    if (now > 0) descT.prev = elementCardDesc(id, now).p
    return { kind: 'element', id, title: cfg.name, desc: elText(descT), descT, tag: `Lv ${picks + 1}`, rarity, icon: cfg.icon, bonus }
  }
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
  // The leaderboard's only integrity rule (owner: "dev runs don't count"). Set on TAKE rather than
  // on opening the menu, because opening it changes nothing about the run — and set here rather
  // than in main.js because this is the single path by which a dev card reaches a run, so a future
  // caller cannot bypass it. main.js reads it in endRun and submits nothing.
  run._devUsed = true
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
  // Under the redesign an element card is a FIND, not routine: 18 -> 7.5. The freed weight is not
  // redistributed by hand — pickWeighted normalises over whatever it is given, so the other buckets
  // (defence and utility, the base attributes) absorb it in proportion for free.
  if (elementOpts.length > 0) {
    buckets.element = BUCKET_WEIGHTS.element * (run.mods?.elementWeightMul ?? 1)
  }

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
    // PITY FIRST, before any rarity is consulted. A duo boon that has been live for
    // DUO_PITY_SCREENS screens without being offered simply takes this card. It has to jump the
    // rarity roll rather than be weighted into it, because the rarity roll IS the thing that was
    // hiding it: `values: { epic: N }` makes the boon a candidate on 7% of mod rolls, and no
    // weight inside the other 93% can reach a card that is not in `ok` at all.
    // It draws NO Math.random on the ordinary path (the filter alone decides), so every seeded
    // fixture in the suite is untouched on a screen with nothing armed.
    const armed = modOpts.filter((mc) => (run._duoDry?.[mc.mod] ?? 0) >= DUO_PITY_SCREENS)
    if (armed.length > 0) {
      const mc = armed.length === 1 ? armed[0] : armed[Math.floor(Math.random() * armed.length)]
      const cfg = WEAPON_MODS[mc.weapon][mc.mod]
      // Built at a tier the card ACCEPTS, renormalised over its own `values` keys — the
      // makePassiveCard idiom, and for its reason: a fixed ladder walk would hand every future
      // two-tier boon the same tier forever. A boon with no `values` takes the screen's own roll.
      let tier = rarity
      if (cfg.values) {
        const w = {}
        for (const r of Object.keys(cfg.values)) if (rarityWeights[r]) w[r] = rarityWeights[r]
        if (Object.keys(w).length > 0) tier = pickWeighted(w)
      }
      const built = makeWeaponModCard(run, mc.weapon, mc.mod, tier)
      // No fallback if it declines even its own table (BLIND FAITH's floor could strip every key):
      // the credit stays banked and the boon takes the next mod card instead. Forcing a card here
      // would mean inventing a tier the mod never declared.
      if (built) return built
    }
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
    const built = makeWeaponModCard(run, mc.weapon, mc.mod, isSwitch ? 'normal' : rarity)
    // CANDIDACY AND SIZE ARE TWO DIFFERENT ROLLS ONCE A REROLL HAS BEEN PAID FOR (candRarity above
    // is rolled on the undecayed table, `rarity` on the decayed one), and a `values` mod accepts
    // only the tiers it lists. So a boon can win its slot at epic and then decline the tier it is
    // BUILT at — makeWeaponModCard returns null, rollCard returns null, and buildLevelUpChoices
    // breaks out of the slot loop: the reroll the player just bought hands back a SHORTER screen.
    // Fall back to the tier it actually won on, which is the only tier it is known to accept.
    // Latent since v6.7.11 and rare (0.35% of rerolled shelf screens) while a `values` mod had to
    // survive the candidate draw first; reserving the duo boons puts one in EVERY shelf pool and
    // took it to 1.36%. Same defect the element branch carries its own guard for.
    return built ?? makeWeaponModCard(run, mc.weapon, mc.mod, candRarity)
  }

  const eid = elementOpts[Math.floor(Math.random() * elementOpts.length)]
  // The element declines `normal`, which is 58.5% of rarity rolls — and the element branch is the
  // one branch with no fallback, so without this the slot returns null and buildLevelUpChoices
  // BREAKS out of the loop, truncating the screen. Re-roll on the card's own table, renormalised,
  // exactly as the passive branch does for armor/regen.
  return makeElementCard(run, eid, rarity)
    ?? makeElementCard(run, eid, pickWeighted(
      Object.fromEntries(Object.keys(EL_VALUES).map((r) => [r, rarityWeights[r] ?? 0]))))
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

  // DUO PITY IS SPENT WHEN THE BOON IS OFFERED, not when it is kept — the anomaly tier's contract,
  // and for the same reason: resetting on the PICK would put the card back on screen every level
  // until the player accepted it, which turns declining it into a nag rather than a decision.
  // Read off the FINAL cards, below both the anomaly swap and the new-weapon floor, because either
  // can overwrite the slot the boon landed in — a boon that was rolled and then deleted was never
  // offered, and must not be charged for it. Zeroing here rather than in rollCard is what makes
  // that reading possible at all.
  for (const c of cards) {
    if (c.kind === 'mod' && WEAPON_MODS[c.weapon]?.[c.id]?.needs && run._duoDry) run._duoDry[c.id] = 0
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
  // Duo-boon pity, on the same terms and HERE for the same reason: a reroll re-deals the screen by
  // calling the builder again, so a counter kept there would step on every paid re-deal and let
  // coins buy the guarantee early. Credit accrues ONLY on screens the boon was live on — a run
  // that completes the pair at level 20 starts its count at level 20, rather than arriving with
  // twenty screens already banked and the boon on the very next card.
  run._duoDry ??= {}
  for (const d of liveDuoMods(run)) run._duoDry[d.mod] = (run._duoDry[d.mod] ?? 0) + 1
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
