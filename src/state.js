// State shapes + persistent meta save/load. No Pixi, no DOM (except localStorage).
import { PLAYER, SHOP, PASSIVES, WEAPON_MODS, ELEMENTS, STARTING_WEAPON, xpForLevel, mergeMutatorMods, difficultyHpMul, difficultyCoinMul } from './config.js'

const SAVE_KEY = 'charming-anomaly-save-v1'

export function loadMeta() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) {
      const m = JSON.parse(raw)
      for (const id of Object.keys(SHOP)) m.shop[id] ??= 0
      m.difficulty ??= 1
      return m
    }
  } catch { /* corrupted save -> fresh */ }
  return {
    coins: 0,
    shop: Object.fromEntries(Object.keys(SHOP).map((id) => [id, 0])),
    best: { time: 0, kills: 0 },
    runs: 0,
    difficulty: 1,
  }
}

export function saveMeta(meta) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(meta)) } catch { /* private mode */ }
}

// Effective permanent multipliers/bonuses from shop levels.
export function shopBonus(meta, id) {
  return SHOP[id].perLevel * (meta.shop[id] ?? 0)
}

/**
 * Run state — the single mutable object the whole game shares each run.
 *
 * phase: 'playing' | 'levelup' | 'paused' | 'dead' | 'victory'
 * events: drained by main.js every frame. Event shapes:
 *   { type:'hit', x, y, dmg, crit }          weapon damaged an enemy
 *   { type:'kill', x, y, elite, etype }      enemy died
 *   { type:'shoot', weapon }                 weapon fired ('star' | 'wave'; orbit is continuous)
 *   { type:'gem', x, y }                     xp gem collected
 *   { type:'coin', x, y, value }             coin collected
 *   { type:'levelup' }                       player leveled (run.levelUpChoices is set, phase='levelup')
 *   { type:'hurt', dmg }                     player took damage
 *   { type:'dead' } / { type:'victory' }     run ended (phase already set)
 *
 * enemies[i]: { id, type, x, y, hp, maxHP, radius, speed, dmg, elite, xp,
 *               hitFlash (s remaining), orbCd (s until orbit can hit again), kb: {x,y} knockback velocity,
 *               holePull: 0..1 vortex suction strength this frame (0 = unaffected, 1 = at a black
 *               hole's core); set by stepHoles each frame an enemy is inside a hole's radius, decays
 *               back to 0 over time otherwise. Render can use it to squash/shrink sprites being sucked in.
 *
 *               affixes: array of ELITE_AFFIXES ids (see config.js) — present ONLY on elites;
 *               non-elites always carry affixes: [] (harmless to check unconditionally, but
 *               sim.js still guards elite-only affix logic behind `e.elite &&` first for cost).
 *               Elites roll 1 random affix at spawn, 2 distinct ones once run.time >=
 *               AFFIX_SECOND_AT. Render/shield contract: draw a shield bubble while `affixes`
 *               includes 'shielded' AND `hp > maxHP * SHIELD_HP_FRAC` (the shield "breaks" once
 *               hp drops under that fraction, matching the reduced-damage window in sim.js).
 *
 *               Elemental status (see ELEMENTS/COMBOS in config.js, ticked by stepStatuses):
 *               ignite (s of burn DoT remaining, 0 = none), igniteDps (current burn rate),
 *               chill (s of active slow window remaining), chillSlow (0..1 current slow
 *               fraction, applied as a speed multiplier in stepEnemyMovement), frozen (s of
 *               full-stop remaining; elites/type 'tank' never freeze — see ELITE_FREEZE_SLOW_MUL),
 *               venom (stacks 0..8), venomT (s remaining before stacks clear).
 *               Sim-internal only (not a render contract, do not rely on these): _chillStack,
 *               _freezeImmuneT, _shockCd, _comboCd. }
 * bullets[i]: { x, y, vx, vy, dmg, pierce, life, r, speed, hitIds:Set<enemyId>,
 *               _shard (true for Split Stars shards; they never re-split), _splitDone,
 *               _chainsLeft (Chain Stars jumps remaining), _ricochetsLeft (Ricochet Stars
 *               bounces remaining) }. On a spend (pierce exhausted): chain re-target is tried
 *               first, ricochet bounce only if chain isn't available/found nothing (see
 *               tryChainBullet/tryRicochetBullet in sim.js). run._chains/_ricochets are debug
 *               counters incremented each time one of those triggers (not a render contract).
 * novas[i]:   { x, y, r, maxR, dmg, knockback, life, hit:Set<enemyId> }  (r grows; render draws the ring)
 * orbs[i]:    { x, y, r } positions + effective hit radius computed by sim each frame (render
 *             just draws them; r = ORB_R × (1 + orbit.bigOrbs bonus), same for main-ring and
 *             twinRing orbs — see WEAPON_MODS.orbit in config.js)
 * gems[i]:    { x, y, xp }   coins[i]: { x, y, value }
 *
 * v2 weapon entities (all sim-owned, render-drawn):
 * boomerangs[i]: { x, y, angle, phase:'out'|'back', dmg, hit:Set, hitR }  (hit cleared at
 *               turnaround; hitR (v4.1) = BOOMERANG_HIT_R × (1 + boomerang.bigBlade bonus),
 *               snapshotted per throw — sim-internal collision radius, not required by render)
 * mines[i]:     { x, y, arm (s until armed), dmg, radius, small? }
 *               small (v4.1, optional): true for Cluster Bombs bomblets (see WEAPON_MODS.mines
 *               in config.js) — smaller/weaker mines popped from a mine's death; render draws
 *               them at a reduced scale. Absent (falsy) on ordinary player-deployed mines.
 * homingShots[i]: { x, y, vx, vy, dmg, life, pierce, hitIds:Set<enemyId> }
 *               pierce (v4.1): starts at 1 + WEAPON_MODS.homing.phantom bonus; a wisp
 *               decrements it on each hit instead of always dying on first contact, and keeps
 *               homing toward enemies not yet in hitIds (see stepHomingShots in sim.js).
 * holes[i]:     { x, y, radius, coreRadius, life, duration, dmg, tick, pull }
 *               coreRadius is the inner "consumed" zone (amplified tick damage; see stepHoles).
 *               Singularity (v4.1, see WEAPON_MODS.hole) spawns extra hole entries of this same
 *               shape at HOLE_SINGULARITY_FRAC radius/coreRadius/pull.
 * beams[i]:     { angle, life, duration, dmg, tick, width, length }  origin = player.
 *               Prismatic Split (v4.1, see WEAPON_MODS.rainbow) spawns extra beam entries of
 *               this same shape, angle offset evenly around the circle, all rotating together.
 *
 * Extra events beyond v1: {type:'explode',x,y,radius} mine pop or star-blast explosion (radius
 * from config: mine's own blast radius, or STAR_BLAST_RADIUS for star blasts) ·
 * {type:'hole'} vortex opens · {type:'beam'} beam starts.
 *
 * Shock arc visual (see applyShock in sim.js): every lightning shock arc emits exactly one of
 * the three events below — frostarc/conduct when their combo triggers on that shock, otherwise
 * the plain {type:'shockarc', points:[[x,y],…]} (polyline: source enemy, then each arc target)
 * — never more than one per shock, so the arc never double-renders.
 *
 * Combo events (see COMBOS in config.js, emitted by stepStatuses' shock/status handling):
 *   {type:'shatter', x, y, radius}       fire+cold: fire hitting a chilled/frozen enemy (or cold
 *                                        hitting an ignited one) bursts AoE damage, consuming the
 *                                        chill/freeze.
 *   {type:'frostarc', points:[[x,y],…]}  cold+lightning: a shock arc launched from a chilled
 *                                        enemy also chills every enemy it hits. points is a
 *                                        polyline (source, then each target), same shape as shockarc.
 *   {type:'overload', x, y, radius}      fire+lightning: a shock arc landing on an ignited enemy
 *                                        detonates its remaining ignite damage instantly as an
 *                                        AoE burst, consuming the ignite.
 *   {type:'conduct', points:[[x,y],…]}   lightning+venom: a shock arc launched from a venomed
 *                                        enemy copies its venom stacks onto every arc target.
 *                                        points is a polyline, same shape as shockarc.
 *   (fire+venom Acid Burn and cold+venom Brittle are passive DoT/amp modifiers with no event.)
 *
 * mutators (v4.0): run.mutators is the array of MUTATORS ids (see config.js) selected before
 * the run started — opts.mutators passed to createRun, e.g. from the Daily Anomaly
 * (dailyMutators(todayKey())) or a future free-pick screen. run.mods is the derived,
 * pre-multiplied modifier object (mergeMutatorMods(run.mutators)) that sim.js reads at fixed
 * points (spawn rate, enemy hp/speed/dmg/radius, elite cadence, contact damage taken, player
 * outgoing damage, player move speed, magnet range, xp/coin pickup value, element card weight)
 * — see sim.js's module doc for the exact list. Both are set once at createRun and never
 * mutated mid-run.
 *
 * bombs[i]: { x, y, radius, fuse, duration, dmg }  volatile-elite death bombs (v4.0). fuse
 *           counts down to 0 (duration is its starting value, kept so render can draw a
 *           growing warning telegraph from fuse/duration); when the fuse expires sim.js
 *           removes the bomb, damages the player if inside radius (same armor/
 *           contactDmgTakenMul path as contact damage) and any enemies inside radius (via
 *           dealDamage), and emits {type:'explode', x, y, radius} (same event shape as a
 *           mine pop or star blast).
 *
 * levelUpChoices[i]: { kind:'weapon'|'passive'|'mod'|'element'|'heal', id, title, desc, tag, rarity, icon, bonus, weapon? }
 *   rarity: key of RARITIES (weapons: inherent; passives/mods/elements: rolled). icon: from config.
 *   bonus: passives/mods/elements only — the pre-multiplied amount applyChoice will add.
 *   kind 'mod': weapon mod upgrades (see WEAPON_MODS in config.js), offered only while the
 *   owning weapon (choice.weapon, a weapon id) is owned. run.weaponMods[weapon][id] accumulates
 *   applied bonus; run.weaponModPicks[weapon][id] counts picks (max MAX_WEAPON_MOD_PICKS),
 *   mirroring passives/passivePicks.
 *   kind 'element': elemental infusions (see ELEMENTS/COMBOS in config.js), offered always.
 *   run.elements[id] accumulates applied potency; run.elementPicks[id] counts picks (max
 *   MAX_ELEMENT_PICKS), mirroring passives/passivePicks.
 */
export function createRun(meta, opts = {}) {
  const maxHP = PLAYER.baseHP + shopBonus(meta, 'maxHP')
  // Pre-run modifiers (see MUTATORS + difficulty consts in config.js and the doc block above):
  // opts.difficulty (1..MAX_DIFFICULTY, default 1) stacks its enemy-HP tax on top of mutators.
  const difficulty = opts.difficulty ?? 1
  const mods = mergeMutatorMods(opts.mutators ?? [])
  mods.enemyHpMul *= difficultyHpMul(difficulty)
  mods.coinMul *= difficultyCoinMul(difficulty)
  return {
    phase: 'playing',
    time: 0,
    events: [],
    difficulty,
    mutators: opts.mutators ?? [],
    mods,
    player: {
      x: 0, y: 0,
      hp: maxHP, maxHP,
      speed: PLAYER.baseSpeed * (1 + shopBonus(meta, 'moveSpeed')),
      magnet: PLAYER.baseMagnet * (1 + shopBonus(meta, 'magnet')),
      critChance: PLAYER.baseCritChance + shopBonus(meta, 'critChance'),
      critDamage: PLAYER.baseCritDamage + shopBonus(meta, 'critDamage'),
      damageMul: 1 + shopBonus(meta, 'damage'),
      fireRateMul: 1 + shopBonus(meta, 'fireRate'),
      coinGainMul: 1 + shopBonus(meta, 'coinGain'),
      xp: 0, level: 1, xpNext: xpForLevel(1),
      invuln: 0,
      facing: 1,          // 1 right, -1 left (render flips the face)
      moving: false,
    },
    weapons: [{ id: STARTING_WEAPON, level: 1 }],
    weaponTimers: {},      // id -> s until next fire
    // accumulated applied bonuses (base * rarity mult per pick) and pick counts
    passives: Object.fromEntries(Object.keys(PASSIVES).map((id) => [id, 0])),
    passivePicks: Object.fromEntries(Object.keys(PASSIVES).map((id) => [id, 0])),
    // per-weapon mods (see WEAPON_MODS in config.js), offered only while their owning weapon
    // is equipped: { [weaponId]: { [modId]: accumulatedBonus } } / { [weaponId]: { [modId]: pickCount } }
    weaponMods: Object.fromEntries(Object.keys(WEAPON_MODS).map((wid) =>
      [wid, Object.fromEntries(Object.keys(WEAPON_MODS[wid]).map((mid) => [mid, 0]))])),
    weaponModPicks: Object.fromEntries(Object.keys(WEAPON_MODS).map((wid) =>
      [wid, Object.fromEntries(Object.keys(WEAPON_MODS[wid]).map((mid) => [mid, 0]))])),
    // elemental infusions (see ELEMENTS/COMBOS in config.js), offered always
    elements: Object.fromEntries(Object.keys(ELEMENTS).map((id) => [id, 0])),
    elementPicks: Object.fromEntries(Object.keys(ELEMENTS).map((id) => [id, 0])),
    enemies: [],
    bullets: [],
    novas: [],
    orbs: [],
    boomerangs: [],
    mines: [],
    homingShots: [],
    holes: [],
    beams: [],
    gems: [],
    coins: [],
    bombs: [],
    kills: 0,
    coinsEarned: 0,
    levelUpChoices: null,
    viewRadius: 600,       // half screen diagonal, updated by main each frame; spawn enemies at viewRadius + SPAWN_RING from player
    _nextId: 1,
    _spawnAcc: 0,
    _nextEliteAt: 40,
    // Sim-internal only (not a render contract): pending Echo Wave casts (see WEAPON_MODS.wave
    // in config.js and stepWaveEchoes in sim.js) — { delay, x, y, radius, dmg, knockback }[].
    _waveEchoes: [],
    // Debug counters only (see bullets[] doc above) — not consumed by render/main.
    _chains: 0,
    _ricochets: 0,
  }
}
