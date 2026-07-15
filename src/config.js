// All balance numbers live here. Every module treats this as read-only ground truth.

export const RUN_DURATION = 300 // seconds; reaching it = victory

// ---- Rarity ------------------------------------------------------------------
// Hybrid model: passive cards ROLL a rarity that multiplies their bonus;
// weapons have an INHERENT rarity that gates how often they appear in the pool.
export const RARITIES = {
  normal:    { name: 'Normal',    color: 0x9aa0a6, mult: 1.0 },
  rare:      { name: 'Rare',      color: 0x4da3ff, mult: 1.6 },
  epic:      { name: 'Epic',      color: 0xb06cf0, mult: 2.5 },
  legendary: { name: 'Legendary', color: 0xff9d3c, mult: 4.0 },
  mythic:    { name: 'Mythic',    color: 0xff4d6d, mult: 6.5 },
}
export const RARITY_ORDER = ['normal', 'rare', 'epic', 'legendary', 'mythic']
// Roll weights shift toward high tiers as the player levels.
export const rarityWeights = (level) => ({
  normal: Math.max(24, 62 - level * 3),
  rare: 25,
  epic: 8 + Math.min(12, level),
  legendary: Math.min(12, 2 + level * 0.8),
  mythic: Math.min(6, level * 0.4),
})

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
    icon: '⭐', rarity: 'normal',
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
    icon: '💫', rarity: 'normal',
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
    icon: '🌊', rarity: 'rare',
    levels: [
      { dmg: 18, interval: 2.4, radius: 150, knockback: 140 },
      { dmg: 22, interval: 2.2, radius: 175, knockback: 160 },
      { dmg: 27, interval: 2.0, radius: 195, knockback: 180 },
      { dmg: 33, interval: 1.8, radius: 220, knockback: 200 },
      { dmg: 42, interval: 1.5, radius: 255, knockback: 240 },
    ],
  },
  boomerang: {
    name: 'Boomerang',
    desc: 'Flies out and back, slicing everything on the path.',
    icon: '🪃', rarity: 'rare',
    levels: [
      { dmg: 16, interval: 1.20, count: 1, speed: 420, range: 240 },
      { dmg: 19, interval: 1.10, count: 1, speed: 450, range: 260 },
      { dmg: 23, interval: 1.00, count: 2, speed: 470, range: 280 },
      { dmg: 28, interval: 0.90, count: 2, speed: 500, range: 300 },
      { dmg: 34, interval: 0.78, count: 3, speed: 530, range: 330 },
    ],
  },
  mines: {
    name: 'Slime Mines',
    desc: 'Drops wobbly bombs that pop on contact.',
    icon: '💣', rarity: 'rare',
    levels: [
      { dmg: 30, interval: 2.2, radius: 100, maxAlive: 3 },
      { dmg: 37, interval: 2.0, radius: 115, maxAlive: 4 },
      { dmg: 45, interval: 1.8, radius: 125, maxAlive: 4 },
      { dmg: 54, interval: 1.6, radius: 140, maxAlive: 6 },
      { dmg: 65, interval: 1.4, radius: 150, maxAlive: 7 },
    ],
  },
  zap: {
    name: 'Chain Zap',
    desc: 'Lightning arcs from drone to drone.',
    icon: '⚡', rarity: 'epic',
    levels: [
      { dmg: 22, interval: 1.70, chains: 3, chainRange: 150 },
      { dmg: 27, interval: 1.55, chains: 4, chainRange: 160 },
      { dmg: 33, interval: 1.40, chains: 4, chainRange: 170 },
      { dmg: 39, interval: 1.25, chains: 6, chainRange: 180 },
      { dmg: 45, interval: 1.10, chains: 7, chainRange: 195 },
    ],
  },
  homing: {
    name: 'Homing Wisps',
    desc: 'Curious sparks that chase whatever moves.',
    icon: '🔮', rarity: 'epic',
    levels: [
      { dmg: 14, interval: 1.00, count: 1, speed: 320, turnRate: 5.0, life: 2.5 },
      { dmg: 17, interval: 0.92, count: 2, speed: 330, turnRate: 5.4, life: 2.5 },
      { dmg: 21, interval: 0.84, count: 2, speed: 345, turnRate: 5.8, life: 2.7 },
      { dmg: 25, interval: 0.75, count: 3, speed: 360, turnRate: 6.2, life: 2.9 },
      { dmg: 28, interval: 0.65, count: 3, speed: 380, turnRate: 6.8, life: 3.1 },
    ],
  },
  hole: {
    name: 'Black Hole',
    desc: 'Opens a vortex that swallows the swarm.',
    icon: '🕳️', rarity: 'legendary',
    levels: [
      { dmg: 8,  tick: 0.25, interval: 6.5, radius: 120, duration: 1.8, pull: 260 },
      { dmg: 10, tick: 0.25, interval: 6.0, radius: 140, duration: 2.0, pull: 300 },
      { dmg: 12, tick: 0.22, interval: 5.5, radius: 160, duration: 2.2, pull: 340 },
      { dmg: 15, tick: 0.22, interval: 5.0, radius: 175, duration: 2.4, pull: 380 },
      { dmg: 18, tick: 0.20, interval: 4.5, radius: 190, duration: 2.6, pull: 420 },
    ],
  },
  rainbow: {
    name: 'Prism Beam',
    desc: 'A rainbow ray sweeps everything it touches.',
    icon: '🌈', rarity: 'mythic',
    levels: [
      { dmg: 12, tick: 0.15, interval: 8.0, duration: 2.2, rotSpeed: 2.6, width: 30, length: 380 },
      { dmg: 15, tick: 0.15, interval: 7.4, duration: 2.4, rotSpeed: 2.8, width: 32, length: 400 },
      { dmg: 18, tick: 0.14, interval: 6.8, duration: 2.6, rotSpeed: 3.0, width: 34, length: 420 },
      { dmg: 22, tick: 0.14, interval: 6.2, duration: 2.9, rotSpeed: 3.2, width: 36, length: 450 },
      { dmg: 26, tick: 0.13, interval: 5.5, duration: 3.2, rotSpeed: 3.5, width: 40, length: 480 },
    ],
  },
}
export const STARTING_WEAPON = 'star'
export const MAX_WEAPON_LEVEL = 5
export const MAX_WEAPONS = 4 // equipped cap; new weapons stop appearing once reached

// Weapon tuning shared across levels
export const STAR_LIFE = 1.2  // s, star projectile lifetime
export const STAR_R = 10      // px, star hit radius
export const STAR_FAN = 0.15  // rad between fan shots
export const ORB_R = 12       // px, orbit spark hit radius
export const NOVA_LIFE = 0.45 // s, nova ring expansion time
export const STAR_BLAST_RADIUS = 70 // px, Exploding Stars mod splash radius

// Black hole vortex shape (applies to all levels; per-level dmg/tick/radius/pull/etc above)
export const HOLE_CORE_FRAC = 0.22     // core radius as a fraction of hole radius — the "consumed" zone
export const HOLE_RIM_PULL_MUL = 0.35  // pull strength at the outer rim, as a fraction of full `pull`
export const HOLE_RESIST_CAP = 0.6     // elites/tanks: pull strength capped at this fraction of full `pull`
export const HOLE_SPIRAL_MUL = 0.6     // tangential component vs radial pull — makes enemies spiral, not beeline
export const HOLE_CORE_DMG_MUL = 3     // tick damage multiplier for enemies inside the core
export const HOLE_PULL_DECAY = 3       // /s, decay rate of e.holePull once an enemy is no longer inside a hole

// ---- In-run passives ------------------------------------------------------------
// Each pick ROLLS a rarity: applied bonus = base * RARITIES[rarity].mult.
// run.passives[id] accumulates the applied bonus; run.passivePicks[id] counts picks (max 5).
// kind 'pct' renders as +N%, 'flat' as +N <unit>.
export const PASSIVES = {
  moveSpeed:  { name: 'Zoomies',      desc: 'move speed',   base: 0.08, kind: 'pct' },
  magnet:     { name: 'Sticky Aura',  desc: 'gem magnet',   base: 0.30, kind: 'pct' },
  maxHP:      { name: 'Extra Squish', desc: 'max HP (and heals as much)', base: 20, kind: 'flat' },
  fireRate:   { name: 'Hyper Wiggle', desc: 'fire rate',    base: 0.08, kind: 'pct' },
  damage:     { name: 'Angry Goo',    desc: 'damage',       base: 0.06, kind: 'pct' },
  critChance: { name: 'Sharp Eye',    desc: 'crit chance',  base: 0.03, kind: 'pct' },
  critDamage: { name: 'Bully',        desc: 'crit damage',  base: 0.20, kind: 'pct' },
  armor:      { name: 'Thick Jelly',  desc: 'armor (flat damage block)', base: 1, kind: 'flat' },
  regen:      { name: 'Self-Goo',     desc: 'HP regen per second', base: 0.5, kind: 'flat' },
  xpGain:     { name: 'Big Brain',    desc: 'XP gain',      base: 0.08, kind: 'pct' },
}
export const MAX_PASSIVE_LEVEL = 5

// ---- Star weapon mods --------------------------------------------------------
// Offered only while the star weapon is owned; joins the weapon/passive pool with
// equal footing (rolls a rarity like passives). run.starMods[id] accumulates the
// applied bonus; run.starModPicks[id] counts picks (max MAX_STAR_MOD_PICKS).
// pierce (flat): bonus = max(1, round(base * rarityMult)) extra enemies a star can hit.
// blast (pct): bonus = base * rarityMult, additive — % of a star hit's damage dealt
// to everything else within STAR_BLAST_RADIUS of the hit enemy.
export const STAR_MODS = {
  pierce: { name: 'Piercing Stars',  desc: 'star pierce',            icon: '🎯', base: 1,    kind: 'flat' },
  blast:  { name: 'Exploding Stars', desc: 'star explosion damage',  icon: '💥', base: 0.30, kind: 'pct' },
}
export const MAX_STAR_MOD_PICKS = 5

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
