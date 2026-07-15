// State shapes + persistent meta save/load. No Pixi, no DOM (except localStorage).
import { PLAYER, SHOP, PASSIVES, STARTING_WEAPON, xpForLevel } from './config.js'

const SAVE_KEY = 'charming-anomaly-save-v1'

export function loadMeta() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) {
      const m = JSON.parse(raw)
      for (const id of Object.keys(SHOP)) m.shop[id] ??= 0
      return m
    }
  } catch { /* corrupted save -> fresh */ }
  return {
    coins: 0,
    shop: Object.fromEntries(Object.keys(SHOP).map((id) => [id, 0])),
    best: { time: 0, kills: 0 },
    runs: 0,
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
 *               back to 0 over time otherwise. Render can use it to squash/shrink sprites being sucked in. }
 * bullets[i]: { x, y, vx, vy, dmg, pierce, life, r }
 * novas[i]:   { x, y, r, maxR, dmg, knockback, life, hit:Set<enemyId> }  (r grows; render draws the ring)
 * orbs[i]:    { x, y } positions computed by sim each frame (render just draws them)
 * gems[i]:    { x, y, xp }   coins[i]: { x, y, value }
 *
 * v2 weapon entities (all sim-owned, render-drawn):
 * boomerangs[i]: { x, y, angle, phase:'out'|'back', dmg, hit:Set }  (hit cleared at turnaround)
 * mines[i]:     { x, y, arm (s until armed), dmg, radius }
 * zaps[i]:      { points:[[x,y],...], life }        transient lightning visuals; damage applied on spawn
 * homingShots[i]: { x, y, vx, vy, dmg, life }
 * holes[i]:     { x, y, radius, coreRadius, life, duration, dmg, tick, pull }
 *               coreRadius is the inner "consumed" zone (amplified tick damage; see stepHoles)
 * beams[i]:     { angle, life, duration, dmg, tick, width, length }  origin = player
 *
 * Extra events beyond v1: {type:'explode',x,y} mine pop · {type:'zap'} · {type:'hole'} vortex
 * opens · {type:'beam'} beam starts.
 *
 * levelUpChoices[i]: { kind:'weapon'|'passive'|'heal', id, title, desc, tag, rarity, icon, bonus }
 *   rarity: key of RARITIES (weapons: inherent; passives: rolled). icon: from config.
 *   bonus: passives only — the pre-multiplied amount applyChoice will add.
 */
export function createRun(meta) {
  const maxHP = PLAYER.baseHP + shopBonus(meta, 'maxHP')
  return {
    phase: 'playing',
    time: 0,
    events: [],
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
    enemies: [],
    bullets: [],
    novas: [],
    orbs: [],
    boomerangs: [],
    mines: [],
    zaps: [],
    homingShots: [],
    holes: [],
    beams: [],
    gems: [],
    coins: [],
    kills: 0,
    coinsEarned: 0,
    levelUpChoices: null,
    viewRadius: 600,       // half screen diagonal, updated by main each frame; spawn enemies at viewRadius + SPAWN_RING from player
    _nextId: 1,
    _spawnAcc: 0,
    _nextEliteAt: 40,
  }
}
