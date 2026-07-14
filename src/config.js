// All balance numbers live here. Every module treats this as read-only ground truth.

export const RUN_DURATION = 300 // seconds; reaching it = victory

export const PLAYER = {
  radius: 22,
  baseHP: 100,
  baseSpeed: 220,        // px/s
  baseMagnet: 70,        // gem attraction radius, px
  pickupRadius: 26,      // actual collect radius
  baseCritChance: 0.05,
  baseCritDamage: 1.5,
  invulnTime: 0.75,      // s of invulnerability after being hit
}

// ---- Weapons ----------------------------------------------------------------
// levels[i] applies at weapon level i+1 (cumulative object replaces stats).
export const WEAPONS = {
  star: {
    name: 'Star Shooter',
    desc: 'Fires stars at the nearest drone.',
    levels: [
      { dmg: 12, interval: 0.55, count: 1, speed: 480, pierce: 1 },
      { dmg: 14, interval: 0.50, count: 2, speed: 480, pierce: 1 },
      { dmg: 16, interval: 0.45, count: 2, speed: 500, pierce: 2 },
      { dmg: 19, interval: 0.40, count: 3, speed: 520, pierce: 2 },
      { dmg: 24, interval: 0.34, count: 4, speed: 560, pierce: 3 },
    ],
  },
  orbit: {
    name: 'Orbit Sparks',
    desc: 'Sparks circle around you, zapping what they touch.',
    levels: [
      { dmg: 10, orbs: 2, radius: 80, rotSpeed: 3.0, tick: 0.5 },
      { dmg: 12, orbs: 3, radius: 85, rotSpeed: 3.2, tick: 0.5 },
      { dmg: 15, orbs: 3, radius: 95, rotSpeed: 3.5, tick: 0.45 },
      { dmg: 18, orbs: 4, radius: 105, rotSpeed: 3.8, tick: 0.4 },
      { dmg: 24, orbs: 5, radius: 115, rotSpeed: 4.2, tick: 0.35 },
    ],
  },
  wave: {
    name: 'Slime Wave',
    desc: 'A bouncy shockwave pushes everything back.',
    levels: [
      { dmg: 18, interval: 2.4, radius: 130, knockback: 140 },
      { dmg: 22, interval: 2.2, radius: 150, knockback: 160 },
      { dmg: 27, interval: 2.0, radius: 170, knockback: 180 },
      { dmg: 33, interval: 1.8, radius: 190, knockback: 200 },
      { dmg: 42, interval: 1.5, radius: 220, knockback: 240 },
    ],
  },
}
export const STARTING_WEAPON = 'star'
export const MAX_WEAPON_LEVEL = 5

// Weapon tuning shared across levels
export const STAR_LIFE = 1.2  // s, star projectile lifetime
export const STAR_R = 10      // px, star hit radius
export const STAR_FAN = 0.15  // rad between fan shots
export const ORB_R = 12       // px, orbit spark hit radius
export const NOVA_LIFE = 0.45 // s, nova ring expansion time

// ---- In-run passives (each +1 level per pick, max 5) -------------------------
export const PASSIVES = {
  moveSpeed: { name: 'Zoomies',   desc: '+8% move speed',  perLevel: 0.08 },
  magnet:    { name: 'Sticky Aura', desc: '+30% gem magnet', perLevel: 0.30 },
  maxHP:     { name: 'Extra Squish', desc: '+20 max HP (and heal 20)', perLevel: 20 },
  fireRate:  { name: 'Hyper Wiggle', desc: '+8% fire rate', perLevel: 0.08 },
}
export const MAX_PASSIVE_LEVEL = 5

// ---- Enemies -----------------------------------------------------------------
export const ENEMIES = {
  drone: { hp: 20, speed: 90,  dmg: 8,  radius: 16, xp: 1, coinChance: 0.10 },
  wisp:  { hp: 10, speed: 165, dmg: 5,  radius: 12, xp: 1, coinChance: 0.08 },
  tank:  { hp: 90, speed: 55,  dmg: 15, radius: 26, xp: 4, coinChance: 0.35 },
}
export const ELITE = { hpMul: 5, sizeMul: 1.5, dmgMul: 1.5, coins: 8, xpMul: 4 }

// Time-bracket spawn composition: [from-second, {type: weight}]
export const WAVE_TABLE = [
  [0,   { drone: 1 }],
  [40,  { drone: 3, wisp: 1 }],
  [90,  { drone: 3, wisp: 2 }],
  [140, { drone: 3, wisp: 2, tank: 1 }],
  [200, { drone: 2, wisp: 3, tank: 2 }],
  [260, { drone: 2, wisp: 4, tank: 3 }],
]
// spawns/second ramps linearly with time (gentler first minute, same late pressure)
export const spawnRate = (t) => 0.6 + t * 0.021
// enemy HP scales with time
export const hpScale = (t) => 1 + t / 90
export const MAX_ALIVE = 250
export const ELITE_EVERY = 45   // seconds, first at t=40
export const SPAWN_RING = 60    // px beyond the larger half-screen diagonal

// ---- Progression ---------------------------------------------------------------
export const xpForLevel = (level) => 5 + level * 4
export const GEM_VALUE = 1

// ---- Meta shop (permanent upgrades, cost in coins) ----------------------------
export const SHOP = {
  damage:     { name: 'Power Gel',    desc: '+5% damage',       perLevel: 0.05, base: 20 },
  fireRate:   { name: 'Twitchy',      desc: '+4% fire rate',    perLevel: 0.04, base: 20 },
  critChance: { name: 'Lucky Eye',    desc: '+2% crit chance',  perLevel: 0.02, base: 30 },
  critDamage: { name: 'Mean Streak',  desc: '+15% crit damage', perLevel: 0.15, base: 30 },
  maxHP:      { name: 'Big Mochi',    desc: '+15 max HP',       perLevel: 15,   base: 15 },
  moveSpeed:  { name: 'Slippery',     desc: '+4% move speed',   perLevel: 0.04, base: 25 },
  magnet:     { name: 'Magnetic Charm', desc: '+12% gem magnet', perLevel: 0.12, base: 15 },
  coinGain:   { name: 'Coin Nose',    desc: '+10% coins found', perLevel: 0.10, base: 40 },
}
export const MAX_SHOP_LEVEL = 10
export const shopCost = (id, level) => Math.round(SHOP[id].base * Math.pow(1.6, level))

// End-of-run coin bonus
export const runBonusCoins = (kills) => Math.floor(kills / 10)
