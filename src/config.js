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
// Fixed roll weights (user-tuned v4.7; no level scaling). Epic-or-better ≈ 12.3% per card,
// so a screen shows at least one epic+ on ~23% (2 cards) / ~33% (3) / ~41% (4) of level-ups.
export const RARITY_WEIGHTS = { normal: 100, rare: 50, epic: 12, legendary: 6, mythic: 3 }

// ---- Level-up choice slots (v4.8: permanent, meta-shop-unlocked) ---------------------
// A level-up screen shows meta.choiceSlots/run.choiceSlots cards (2 by default). The 3rd/4th
// slot is unlocked PERMANENTLY (applies to every future run, all modes) by sacrificing already-
// purchased SHOP levels in the meta shop — see SACRIFICE_COSTS/sacrificeCost below and
// hooks.onSacrifice in main.js. No coin refund for sacrificed levels.
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
    // v5.3: re-themed as The Garden's starter (Leaf Blade) — COPY ONLY, behavior unchanged
    // (still the boomerang weapon step/mods in sim.js, entity array run.boomerangs, and the
    // WEAPON_MODS.boomerang set below). Keeping the id 'boomerang' keeps render.js/main.js
    // (outside the v5.3 sim scope) working; the display name is what the player sees. Moved
    // from vaulted into the garden's weapon pool (see CHAPTERS.garden.weapons).
    name: 'Leaf Blade',
    desc: 'Flings a spinning leaf that slices out and curves back.',
    icon: '🍃', rarity: 'rare',
    levels: [
      { dmg: 16, interval: 1.20, count: 1, speed: 420, range: 240 },
      { dmg: 19, interval: 1.10, count: 1, speed: 450, range: 260 },
      { dmg: 23, interval: 1.00, count: 2, speed: 470, range: 280 },
      { dmg: 28, interval: 0.90, count: 2, speed: 500, range: 300 },
      { dmg: 34, interval: 0.78, count: 3, speed: 530, range: 330 },
    ],
  },
  mines: {
    // v5.0: re-themed as a pond native (Toxin Cysts) — copy only, behavior unchanged
    // (still the mines weapon step/mods in sim.js). Moved into the pond's weapon pool.
    name: 'Toxin Cysts',
    desc: 'Buds toxic cysts that burst on contact.',
    icon: '🫧', rarity: 'rare',
    levels: [
      { dmg: 30, interval: 2.2, radius: 100, maxAlive: 3 },
      { dmg: 37, interval: 2.0, radius: 115, maxAlive: 4 },
      { dmg: 45, interval: 1.8, radius: 125, maxAlive: 4 },
      { dmg: 54, interval: 1.6, radius: 140, maxAlive: 6 },
      { dmg: 65, interval: 1.4, radius: 150, maxAlive: 7 },
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
    // v5.4: re-themed as The Beyond's native (Black-Hole Vortex) — COPY ONLY, behavior/numbers
    // unchanged (still the hole weapon step/mods in sim.js, entity array run.holes). Moved from
    // vaulted into the beyond's weapon pool (see CHAPTERS.beyond.weapons) — its thematic home.
    name: 'Black-Hole Vortex',
    desc: 'Opens a vortex that swallows the swarm.',
    icon: '🕳️', rarity: 'legendary',
    levels: [
      { dmg: 4, tick: 0.25, interval: 6.5, radius: 510, duration: 1.8, pull: 260 },
      { dmg: 5, tick: 0.25, interval: 6.0, radius: 585, duration: 2.0, pull: 300 },
      { dmg: 6, tick: 0.22, interval: 5.5, radius: 675, duration: 2.2, pull: 340 },
      { dmg: 8, tick: 0.22, interval: 5.0, radius: 735, duration: 2.4, pull: 380 },
      { dmg: 9, tick: 0.20, interval: 4.5, radius: 795, duration: 2.6, pull: 420 },
    ],
  },
  rainbow: {
    // v5.4: re-themed as The City's starter (Neon Beam) — COPY ONLY, behavior/numbers unchanged
    // (still the rainbow weapon step/mods in sim.js, entity array run.beams, and the
    // WEAPON_MODS.rainbow set below). Keeping the id 'rainbow' keeps render.js/main.js working;
    // the display name is what the player sees. Moved from vaulted into the city's weapon pool.
    // NOTE its rarity stays 'mythic': a chapter's starter is GRANTED by createRun (state.js), so
    // rarity only gates how often it comes BACK as a level-up card — it never gates the start.
    name: 'Neon Beam',
    desc: 'A hard neon ray sweeps everything it touches.',
    icon: '🌈', rarity: 'mythic',
    levels: [
      { dmg: 12, tick: 0.15, interval: 8.0, duration: 2.2, rotSpeed: 2.6, width: 30, length: 380 },
      { dmg: 15, tick: 0.15, interval: 7.4, duration: 2.4, rotSpeed: 2.8, width: 32, length: 400 },
      { dmg: 18, tick: 0.14, interval: 6.8, duration: 2.6, rotSpeed: 3.0, width: 34, length: 420 },
      { dmg: 22, tick: 0.14, interval: 6.2, duration: 2.9, rotSpeed: 3.2, width: 36, length: 450 },
      { dmg: 26, tick: 0.13, interval: 5.5, duration: 3.2, rotSpeed: 3.5, width: 40, length: 480 },
    ],
  },
  // Pond chapter natives (v5.0). Minimal stat tables so the level-up pool + weapon-stat
  // pipeline (effectiveWeaponStats in sim.js) resolve — Task 4 owns their actual step logic
  // (arc sweep / toxin cloud) and mods; these numbers are placeholders it may retune.
  flagella: {
    name: 'Flagella Whip',
    desc: 'Lashes a melee arc toward the nearest enemy.',
    icon: '🧫', rarity: 'normal',
    levels: [
      { dmg: 14, rate: 0.90, range: 130, arc: 1.40 },
      { dmg: 17, rate: 0.82, range: 140, arc: 1.50 },
      { dmg: 21, rate: 0.74, range: 150, arc: 1.60 },
      { dmg: 26, rate: 0.66, range: 160, arc: 1.70 },
      { dmg: 32, rate: 0.58, range: 175, arc: 1.85 },
    ],
  },
  bloom: {
    name: 'Toxin Bloom',
    desc: 'Plants a spreading toxin cloud that ticks damage.',
    icon: '🧪', rarity: 'rare',
    levels: [
      { rate: 3.4, castRange: 260, dur: 3.0, maxR: 90,  dmgPerTick: 6 },
      { rate: 3.1, castRange: 270, dur: 3.2, maxR: 100, dmgPerTick: 7 },
      { rate: 2.8, castRange: 280, dur: 3.4, maxR: 110, dmgPerTick: 9 },
      { rate: 2.5, castRange: 300, dur: 3.6, maxR: 125, dmgPerTick: 11 },
      { rate: 2.2, castRange: 320, dur: 3.8, maxR: 140, dmgPerTick: 14 },
    ],
  },
  // Garden chapter natives (v5.3). See stepStingerWeapon/stepLureWeapon in sim.js for behavior.
  stinger: {
    name: 'Stinger',
    desc: 'Fires a tight cone of piercing needles at the nearest enemy.',
    icon: '🪡', rarity: 'normal',
    // count = needles per volley; spread = cone half-angle (rad); range/speed give a short-mid
    // reach (life = range/speed, derived at fire time). pierce is a fixed 1 (no pierce mod).
    levels: [
      { dmg: 8,  rate: 0.85, count: 3, speed: 620, range: 320, spread: 0.20 },
      { dmg: 9,  rate: 0.78, count: 3, speed: 640, range: 340, spread: 0.20 },
      { dmg: 11, rate: 0.70, count: 4, speed: 660, range: 360, spread: 0.22 },
      { dmg: 13, rate: 0.62, count: 4, speed: 690, range: 380, spread: 0.22 },
      { dmg: 16, rate: 0.54, count: 5, speed: 720, range: 410, spread: 0.24 },
    ],
  },
  lure: {
    name: 'Pheromone Lure',
    desc: 'Plants a decoy that taunts nearby foes, then bursts.',
    icon: '🌼', rarity: 'rare',
    // aggro = taunt radius (enemies within it path to the lure instead of the player); dur = s
    // before it bursts; burstR/burstDmg = the one-shot AoE on burst. castRange = plant scatter.
    levels: [
      { rate: 4.5, castRange: 240, dur: 3.0, aggro: 200, burstR: 110, burstDmg: 28 },
      { rate: 4.2, castRange: 250, dur: 3.2, aggro: 215, burstR: 118, burstDmg: 34 },
      { rate: 3.9, castRange: 260, dur: 3.4, aggro: 230, burstR: 126, burstDmg: 42 },
      { rate: 3.5, castRange: 275, dur: 3.6, aggro: 250, burstR: 136, burstDmg: 52 },
      { rate: 3.1, castRange: 290, dur: 3.8, aggro: 270, burstR: 148, burstDmg: 64 },
    ],
  },
  // Undergrowth chapter natives (v5.4). See stepPounceWeapon/stepQuillWeapon/stepShriekWeapon in sim.js.
  pounceClaws: {
    name: 'Pounce Claws',
    desc: 'Leap at the nearest foe and rake an arc on landing.',
    icon: '🐾', rarity: 'normal',
    // A cast DASHES the player up to `dash` px toward the nearest enemy (capped so you never
    // overshoot past it), then rakes every enemy whose CENTER falls in the sector (arc rad,
    // range px) centered on the dash direction — like flagella's swing, but you move with it.
    levels: [
      { dmg: 16, rate: 0.95, dash: 90,  range: 120, arc: 1.20 },
      { dmg: 19, rate: 0.88, dash: 100, range: 128, arc: 1.30 },
      { dmg: 24, rate: 0.80, dash: 110, range: 136, arc: 1.40 },
      { dmg: 29, rate: 0.72, dash: 120, range: 146, arc: 1.50 },
      { dmg: 36, rate: 0.64, dash: 135, range: 160, arc: 1.65 },
    ],
  },
  quillBurst: {
    name: 'Quill Burst',
    desc: 'Bristles a ring of quills outward in every direction.',
    icon: '🦔', rarity: 'rare',
    // count = quills per burst, fired evenly around the full circle (never aimed — this is the
    // panic button, not the sniper). Each quill is a run.bullets projectile tagged weapon:'quill'
    // (life = range/speed, derived at fire time), same as stinger's needles.
    levels: [
      { dmg: 10, rate: 1.30, count: 6,  speed: 460, range: 240, pierce: 1 },
      { dmg: 12, rate: 1.20, count: 7,  speed: 480, range: 255, pierce: 1 },
      { dmg: 14, rate: 1.10, count: 9,  speed: 500, range: 270, pierce: 2 },
      { dmg: 17, rate: 1.00, count: 10, speed: 520, range: 285, pierce: 2 },
      { dmg: 20, rate: 0.90, count: 12, speed: 540, range: 300, pierce: 2 },
    ],
  },
  chitterShriek: {
    name: 'Chitter Shriek',
    desc: 'A shrill scream that hurts, shoves, and panics the swarm.',
    icon: '📣', rarity: 'rare',
    // The utility native (slowest clear on purpose): a run.novas ring flagged `fear` — it damages,
    // knocks back, AND makes struck enemies flee for `fear` seconds (see FEAR_* below).
    levels: [
      { dmg: 14, rate: 3.2, radius: 150, knockback: 180, fear: 1.0 },
      { dmg: 17, rate: 3.0, radius: 168, knockback: 200, fear: 1.2 },
      { dmg: 21, rate: 2.8, radius: 188, knockback: 225, fear: 1.4 },
      { dmg: 25, rate: 2.6, radius: 208, knockback: 250, fear: 1.6 },
      { dmg: 30, rate: 2.4, radius: 230, knockback: 280, fear: 1.8 },
    ],
  },
  // City chapter natives (v5.4). Neon Beam = the rainbow re-theme (see WEAPONS.rainbow).
  // See stepTornadoWeapon/stepGeyserWeapon in sim.js.
  trashTornado: {
    name: 'Trash Tornado',
    desc: 'Whips up street trash to orbit and batter what it touches.',
    icon: '🌪️', rarity: 'rare',
    // Always-on orbital, like orbit: sim recomputes every chunk's position each frame into
    // run.debris ({x, y, r}) and ticks damage to whatever they overlap every `tick` seconds.
    levels: [
      { dmg: 11, chunks: 3, radius: 90,  rotSpeed: 2.6, tick: 0.5 },
      { dmg: 13, chunks: 3, radius: 98,  rotSpeed: 2.8, tick: 0.5 },
      { dmg: 16, chunks: 4, radius: 108, rotSpeed: 3.1, tick: 0.45 },
      { dmg: 20, chunks: 5, radius: 118, rotSpeed: 3.4, tick: 0.4 },
      { dmg: 26, chunks: 6, radius: 130, rotSpeed: 3.8, tick: 0.35 },
    ],
  },
  sewerGeyser: {
    name: 'Sewer Geyser',
    desc: 'Cracks the street open; scalding jets erupt where foes stand.',
    icon: '⛲', rarity: 'rare',
    // The utility native (slowest clear on purpose): plants `count` telegraphed eruption zones
    // (run.geysers) on/near random enemies within castRange; each waits `fuse` seconds (harmless
    // telegraph), then erupts ONCE for dmg in r. Enemies only — never hurts the player.
    levels: [
      { rate: 3.0, castRange: 260, fuse: 0.70, r: 90,  dmg: 34, count: 1 },
      { rate: 2.8, castRange: 270, fuse: 0.70, r: 98,  dmg: 42, count: 1 },
      { rate: 2.6, castRange: 285, fuse: 0.65, r: 106, dmg: 52, count: 2 },
      { rate: 2.3, castRange: 300, fuse: 0.65, r: 116, dmg: 64, count: 2 },
      { rate: 2.0, castRange: 320, fuse: 0.60, r: 128, dmg: 80, count: 3 },
    ],
  },
  // Skies chapter natives (v5.4). See stepRoarWeapon/stepTailWeapon/stepDebrisWeapon in sim.js.
  roar: {
    name: 'Roar',
    desc: 'A sonic cone that flattens everything in front of you.',
    icon: '🗣️', rarity: 'normal',
    // Same sector geometry as flagella/pounceClaws (arc rad, range px, aimed at the nearest enemy
    // and falling back to player.facingAngle when none exists — exactly fireFlagella's rule), but
    // longer and narrower, and it shoves what it hits. The player does NOT move (unlike pounceClaws).
    levels: [
      { dmg: 15, rate: 1.00, range: 200, arc: 0.90, knockback: 60 },
      { dmg: 18, rate: 0.92, range: 215, arc: 0.95, knockback: 70 },
      { dmg: 22, rate: 0.84, range: 230, arc: 1.05, knockback: 80 },
      { dmg: 27, rate: 0.75, range: 250, arc: 1.15, knockback: 95 },
      { dmg: 34, rate: 0.66, range: 275, arc: 1.30, knockback: 110 },
    ],
  },
  tailSwipe: {
    name: 'Tail Swipe',
    desc: 'A heavy sweep that clears the ground around you.',
    icon: '🦖', rarity: 'rare',
    // Sector geometry again, but WIDE and short: slow, hard, and it launches. Sits between roar
    // (fast chip) and debrisToss (slow burst) in the skies pool.
    levels: [
      { dmg: 26, rate: 1.60, range: 150, arc: 2.20, knockback: 140 },
      { dmg: 31, rate: 1.50, range: 160, arc: 2.35, knockback: 155 },
      { dmg: 38, rate: 1.40, range: 172, arc: 2.50, knockback: 170 },
      { dmg: 46, rate: 1.28, range: 185, arc: 2.70, knockback: 190 },
      { dmg: 58, rate: 1.15, range: 200, arc: 2.95, knockback: 220 },
    ],
  },
  debrisToss: {
    name: 'Debris Toss',
    desc: 'Hurls a chunk of the skyline that bursts where it lands.',
    icon: '🪨', rarity: 'rare',
    // Lobs `count` chunks (run.lobs) on a `flight`-second arc toward random enemies within
    // castRange, each bursting for dmg in r on landing. Enemies only — never hurts the player.
    levels: [
      { dmg: 30, rate: 2.6, castRange: 280, flight: 0.60, r: 85,  count: 1 },
      { dmg: 37, rate: 2.4, castRange: 295, flight: 0.60, r: 92,  count: 1 },
      { dmg: 45, rate: 2.2, castRange: 310, flight: 0.55, r: 100, count: 2 },
      { dmg: 55, rate: 2.0, castRange: 330, flight: 0.55, r: 110, count: 2 },
      { dmg: 70, rate: 1.8, castRange: 350, flight: 0.50, r: 122, count: 3 },
    ],
  },
  // Beyond chapter natives (v5.4). Black-Hole Vortex = the hole re-theme (see WEAPONS.hole).
  // See stepShardWeapon/stepTesseractWeapon in sim.js.
  realityShard: {
    name: 'Reality Shard',
    desc: 'Splinters of elsewhere that skip through space as they fly.',
    icon: '🔺', rarity: 'normal',
    // Fires `count` shards at the nearest enemy (fanned STAR_FAN apart, like star's volley). Each
    // shard is a run.bullets projectile tagged weapon:'shard': it flies normally, but every
    // blinkEvery seconds it TELEPORTS blinkDist px further along its own heading (skipping the
    // gap — no damage in between). life = range/speed, and a blink does NOT consume range.
    levels: [
      { dmg: 13, rate: 0.80, count: 2, speed: 380, range: 300, blinkEvery: 0.28, blinkDist: 70,  pierce: 1 },
      { dmg: 15, rate: 0.74, count: 2, speed: 395, range: 320, blinkEvery: 0.26, blinkDist: 75,  pierce: 1 },
      { dmg: 18, rate: 0.68, count: 3, speed: 410, range: 340, blinkEvery: 0.24, blinkDist: 82,  pierce: 2 },
      { dmg: 22, rate: 0.60, count: 3, speed: 430, range: 360, blinkEvery: 0.22, blinkDist: 90,  pierce: 2 },
      { dmg: 27, rate: 0.52, count: 4, speed: 450, range: 390, blinkEvery: 0.20, blinkDist: 100, pierce: 3 },
    ],
  },
  tesseractBeam: {
    name: 'Tesseract Beam',
    desc: 'Folds the arena in half and sweeps the crease.',
    icon: '🔷', rarity: 'epic',
    // A run.beams entry (same shape/step as the Neon Beam) flagged `folded: true`: the "fold" is a
    // second arm 180° opposite the first, sweeping together — i.e. one cast rakes both sides at
    // once. rate (not `interval`) is the cast cadence, matching the other v5.x natives.
    levels: [
      { dmg: 10, tick: 0.16, rate: 6.5, duration: 2.0, rotSpeed: 2.2, width: 34, length: 340 },
      { dmg: 12, tick: 0.16, rate: 6.0, duration: 2.2, rotSpeed: 2.4, width: 36, length: 360 },
      { dmg: 15, tick: 0.15, rate: 5.5, duration: 2.4, rotSpeed: 2.6, width: 38, length: 380 },
      { dmg: 18, tick: 0.15, rate: 5.0, duration: 2.7, rotSpeed: 2.8, width: 42, length: 405 },
      { dmg: 22, tick: 0.14, rate: 4.5, duration: 3.0, rotSpeed: 3.1, width: 46, length: 430 },
    ],
  },
}
export const MAX_WEAPON_LEVEL = 5
export const MAX_WEAPONS = 4 // equipped cap; new weapons stop appearing once reached

// Weapon tuning shared across levels
export const STAR_LIFE = 1.2  // s, star projectile lifetime
export const STAR_R = 10      // px, star hit radius
export const STAR_FAN = 0.15  // rad between fan shots
export const ORB_R = 12       // px, orbit spark hit radius
export const NOVA_LIFE = 0.45 // s, nova ring expansion time

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

// ---- Weapon mods (v4.1: weapon-mod parity) -------------------------------------
// Every equipped weapon gets its own mod pool (star's original six, plus a matching set for
// every other weapon) so no single weapon outscales the rest. Offered only while its owning
// weapon is equipped, joining the weapon/passive/element pool with equal footing (rolls a
// rarity like passives). run.weaponMods[weaponId][modId] accumulates the applied bonus;
// run.weaponModPicks[weaponId][modId] counts picks (max MAX_WEAPON_MOD_PICKS). Mod ids are
// globally unique across every weapon (never reused between weapons).
//
// kind 'flat' (base 1): bonus = max(1, round(base * rarityMult)) — an extra unit (orb/
// boomerang/mine slot/wisp/pierce/shard/bounce) per pick.
// kind 'pct' (base ~0.20): bonus = base * rarityMult, additive — a percent bump to a stat
// (radius/speed/damage/range/duration/...).
// kind 'tier': bonus = WEAPON_MOD_TIER_BONUS[rarity], extra "things per cast" (rings/echoes/
// bomblets/vortexes/beams/volleys/jumps) — tiered rather than rarityMult-multiplied so a
// mythic pick can't spiral a per-cast entity count out of control the way a flat rarityMult
// multiply would (a mythic pierce/blast pick multiplies fine; a mythic +6.5 beams would not).
//
// Behavioral mods (read directly off run.weaponMods.<weapon>.<mod> at their trigger site in
// sim.js, rather than folding into effectiveWeaponStats):
//   star.multishot/split/chain/ricochet: unchanged from v2/v3 (see fireStar/stepBullets).
//   orbit.twinRing:    N orbs on an inner ring at ORBIT_TWIN_RING_RADIUS_FRAC of the main
//                      ring's radius, counter-rotating, same dmg/tick as the main ring.
//   orbit.bigOrbs:     scales ORB_R (a constant, not a `levels[]` field) — read directly too.
//   wave.echo:         N echo novas queued per cast, each firing WAVE_ECHO_DELAY later than
//                      the previous, at WAVE_ECHO_DMG_FRAC damage (full radius/knockback).
//   boomerang.bigBlade: scales BOOMERANG_HIT_R (a constant) — read directly, like bigOrbs.
//   mines.cluster:     N bomblets flung outward when a (non-bomblet) mine pops — each a small
//                      mine (`small: true`) at MINE_CLUSTER_DMG_FRAC damage,
//                      MINE_CLUSTER_RADIUS_FRAC radius, MINE_CLUSTER_ARM arm time, scattered
//                      MINE_CLUSTER_SCATTER_MIN..MAX px away. Bomblets never cluster further.
//   homing.phantom:    +N pierce per wisp (added to a base pierce of 1) — a wisp survives a
//                      hit and keeps homing, excluding enemies already in its hitIds.
//   hole.singularity:  N extra vortexes per cast, at HOLE_SINGULARITY_FRAC radius/coreRadius/
//                      pull, spawned on other random in-view enemies (falls back to a random
//                      offset, like the main cast, when none are available).
//   rainbow.prismatic: N extra beams per cast, evenly spread around the circle (2 beams total
//                      = 180° apart, 3 = 120°, ...), same stats, all rotating together.
//
// v4.3 "crazy-mod pass" behavioral mods (bring every weapon to 6 mods — see sim.js for the
// exact trigger sites):
//   orbit.supernova:    when an orbit-orb hit KILLS an enemy, it splashes bonus × that hit's
//                       dealt damage to everything else in ORBIT_NOVA_RADIUS (no re-roll) + an
//                       explode event.
//   wave.undertow:      inverts nova knockback into a pull, baked into the nova at cast time;
//                       each stack (flat) adds +UNDERTOW_KB_PER_STACK magnitude on top.
//   wave.tsunami:       every TSUNAMI_EVERY-th cast (tracked by run._waveCasts) multiplies that
//                       cast's radius AND damage by (1 + bonus) — a "monster wave".
//   boomerang.backhand: boomerangs deal (1 + bonus)× damage while in their 'back' (return) phase.
//   boomerang.seeker:   outbound ('out' phase only) boomerangs steer toward the nearest enemy at
//                       SEEKER_TURN_RATE × bonus rad/s, baked into the boomerang at throw time.
//   mines.magnetic:     armed (not-yet-triggered) mines crawl toward the nearest enemy at
//                       MINE_CRAWL_SPEED × bonus px/s.
//   mines.chainReaction: when a mine explodes, up to <tier bonus> other ARMED mines within its
//                       blast radius detonate immediately too (cascading breadth-first; a mine
//                       only ever detonates once).
//   homing.wispNova:    when a wisp dies (spent its last pierce on a hit, or its lifetime
//                       expired) it pops: AoE splash = bonus × the wisp's dmg in
//                       WISP_NOVA_RADIUS + explode event. Mini-wisps (see swarm) can pop too.
//   homing.swarm:       when a (non-mini) wisp's hit KILLS an enemy, spawn <tier bonus> mini
//                       wisps at the kill spot (SWARM_DMG_FRAC × dmg, SWARM_LIFE lifetime, same
//                       speed/turn rate) flagged `_mini` — mini wisps never re-trigger swarm.
//   hole.hungry:        a hole's radius (and coreRadius, kept proportional) grows by
//                       bonus × its spawn radius per second while alive — visual-safe since
//                       render already re-reads h.radius/coreRadius every frame.
//   hole.crunch:        when a hole expires, it collapses in a detonation: damage = hole tick
//                       dmg × CRUNCH_DMG_MUL × (1 + bonus) to everything within its final
//                       radius + explode event there.
//   rainbow.focus:      a beam's damage ramps linearly from 1× at cast to (1 + bonus)× at the
//                       end of its duration (recomputed every tick from elapsed/duration).
//   rainbow.strobe:     beam tick period divided by (1 + bonus), baked in at cast time (faster
//                       ticks = more hits over the same duration).
//
// Everything else (extraOrb/wideRing/overdrive/bigWave/shove/amplitude/extraRang/longThrow/
// heavyBlade/minefield/bigBoom/heavyCharge/extraWisp/longLife/agile/biggerHole/lasting/denser/
// wideBeam/longBeam/sustain) is a plain STAT mod folded into a weapon's per-level numbers by
// effectiveWeaponStats — see sim.js.
export const WEAPON_MODS = {
  star: {
    // blast ("Exploding Stars") removed in v4.6 — star AoE splash on every hit made it a
    // no-brainer even after the v4.4 offer caps (user call: star keeps 5 mods, no explosions).
    pierce:    { name: 'Piercing Stars',  desc: 'star pierce',                    icon: '🎯', base: 1,    kind: 'flat' },
    multishot: { name: 'Multi Stars',     desc: 'stars per volley',              icon: '💫', kind: 'tier' },
    split:     { name: 'Split Stars',     desc: "shard(s) on a star's first hit", icon: '🔱', base: 1,    kind: 'flat' },
    chain:     { name: 'Chain Stars',     desc: 'chain jump(s) on spent stars',  icon: '🔗', kind: 'tier' },
    ricochet:  { name: 'Ricochet Stars',  desc: 'bounce(s) on spent stars',      icon: '🪀', base: 1,    kind: 'flat' },
  },
  orbit: {
    extraOrb:  { name: 'Extra Sparks', desc: 'orbs on your ring',                  icon: '✨', base: 1,    kind: 'flat' },
    bigOrbs:   { name: 'Big Sparks',   desc: 'orb hit radius',                     icon: '🔵', base: 0.20, kind: 'pct' },
    wideRing:  { name: 'Wide Orbit',   desc: 'ring radius',                        icon: '🪐', base: 0.20, kind: 'pct' },
    overdrive: { name: 'Overdrive',    desc: 'orbit rotation speed',               icon: '🌀', base: 0.20, kind: 'pct' },
    twinRing:  { name: 'Twin Ring',    desc: 'counter-rotating inner ring of orbs', icon: '💠', kind: 'tier' },
    supernova: { name: 'Supernova Sparks', desc: 'orb-kill splash damage',         icon: '🌟', base: 0.50, kind: 'pct' },
  },
  wave: {
    bigWave:   { name: 'Big Wave',  desc: 'nova radius',           icon: '🌊', base: 0.20, kind: 'pct' },
    shove:     { name: 'Big Shove', desc: 'nova knockback',        icon: '👊', base: 0.20, kind: 'pct' },
    amplitude: { name: 'Amplitude', desc: 'wave damage',           icon: '📢', base: 0.20, kind: 'pct' },
    echo:      { name: 'Echo Wave', desc: 'echo wave(s) per cast', icon: '🔁', kind: 'tier' },
    undertow:  { name: 'Undertow',  desc: 'knockback stack(s) (pulls in instead of pushing out)', icon: '↩️', base: 1, kind: 'flat' },
    tsunami:   { name: 'Tsunami',   desc: 'radius/damage on every 3rd (monster) wave', icon: '🌊', base: 0.60, kind: 'pct' },
  },
  // v5.3: the id stays 'boomerang' (Leaf Blade re-theme is copy-only, see WEAPONS.boomerang);
  // only the desc copy was retouched from 'boomerang' to 'leaf blade' where it named the weapon.
  boomerang: {
    extraRang:  { name: 'Extra Blades', desc: 'leaf blades per throw', icon: '🍃', base: 1,    kind: 'flat' },
    longThrow:  { name: 'Long Throw',   desc: 'leaf blade range',      icon: '📏', base: 0.20, kind: 'pct' },
    bigBlade:   { name: 'Big Blade',    desc: 'leaf blade hit radius', icon: '⚔️', base: 0.20, kind: 'pct' },
    heavyBlade: { name: 'Heavy Blade',  desc: 'leaf blade damage',     icon: '🔨', base: 0.20, kind: 'pct' },
    backhand:   { name: 'Backhand',      desc: 'leaf blade return-swing damage',      icon: '🤛', base: 0.50, kind: 'pct' },
    seeker:     { name: 'Seeker Blades', desc: 'outbound curve-toward-target strength', icon: '🧭', base: 0.50, kind: 'pct' },
  },
  mines: {
    minefield:   { name: 'Minefield',     desc: 'max mines alive',             icon: '🪤', base: 1,    kind: 'flat' },
    bigBoom:     { name: 'Big Boom',      desc: 'mine blast radius',           icon: '💥', base: 0.20, kind: 'pct' },
    heavyCharge: { name: 'Heavy Charge',  desc: 'mine damage',                 icon: '🧨', base: 0.20, kind: 'pct' },
    cluster:     { name: 'Cluster Bombs', desc: 'bomblet(s) when a mine pops', icon: '🎆', kind: 'tier' },
    magnetic:      { name: 'Magnetic Mines', desc: 'armed-mine crawl speed toward foes', icon: '🧲', base: 0.50, kind: 'pct' },
    chainReaction: { name: 'Chain Reaction', desc: 'nearby armed mine(s) detonated by a blast', icon: '⛓️', kind: 'tier' },
  },
  homing: {
    extraWisp: { name: 'Extra Wisps',   desc: 'wisps per volley', icon: '🔮', base: 1,    kind: 'flat' },
    longLife:  { name: 'Long Life',     desc: 'wisp lifetime',    icon: '⏳', base: 0.20, kind: 'pct' },
    agile:     { name: 'Agile Wisps',   desc: 'wisp turn rate',   icon: '🦋', base: 0.20, kind: 'pct' },
    phantom:   { name: 'Phantom Wisps', desc: 'pierce per wisp',  icon: '👻', base: 1,    kind: 'flat' },
    wispNova:  { name: 'Popping Wisps', desc: 'wisp death-pop splash damage',  icon: '💥', base: 0.60, kind: 'pct' },
    swarm:     { name: 'Swarm',         desc: 'mini wisp(s) spawned on a wisp kill', icon: '🐝', kind: 'tier' },
  },
  hole: {
    biggerHole:  { name: 'Bigger Hole',    desc: 'vortex radius',             icon: '🕳️', base: 0.20, kind: 'pct' },
    lasting:     { name: 'Lasting Vortex', desc: 'vortex duration',           icon: '⏱️', base: 0.20, kind: 'pct' },
    denser:      { name: 'Denser Pull',    desc: 'vortex pull',               icon: '🌌', base: 0.20, kind: 'pct' },
    singularity: { name: 'Singularity',    desc: 'extra vortex(es) per cast', icon: '🌠', kind: 'tier' },
    hungry:      { name: 'Hungry Hole', desc: 'vortex growth rate while alive',       icon: '🍽️', base: 0.40, kind: 'pct' },
    crunch:      { name: 'Big Crunch',  desc: 'vortex collapse detonation damage',    icon: '🌋', base: 1.00, kind: 'pct' },
  },
  rainbow: {
    wideBeam:  { name: 'Wide Beam',       desc: 'beam width',             icon: '📡', base: 0.20, kind: 'pct' },
    longBeam:  { name: 'Long Beam',       desc: 'beam length',            icon: '↔️', base: 0.20, kind: 'pct' },
    sustain:   { name: 'Sustain',         desc: 'beam duration',          icon: '⌛', base: 0.20, kind: 'pct' },
    prismatic: { name: 'Prismatic Split', desc: 'extra beam(s) per cast', icon: '🎇', kind: 'tier' },
    focus:     { name: 'Focus Lens', desc: 'beam damage ramp by the end of its duration', icon: '🔎', base: 0.80, kind: 'pct' },
    strobe:    { name: 'Strobe Ray', desc: 'beam tick rate',                             icon: '💡', base: 0.40, kind: 'pct' },
  },
  // Pond natives (v5.0 task 4). Percents match the contract exactly (base = the normal-rarity
  // headline; rarity scales it, like every pct mod). reach/wideArc/heavyLash fold into
  // flagella's levels[] via WEAPON_STAT_MODS (sim.js); frenzy (attack speed) is read at the
  // swing's fire site (it divides the swing interval, like the global fire-rate does — a
  // levels[] `rate` bump would slow it, so it can't ride WEAPON_STAT_MODS). cyclone/barbed are
  // behavioral (read at their trigger sites — see fireFlagella/applyBleed in sim.js).
  flagella: {
    reach:     { name: 'Long Reach',  desc: 'whip range',  icon: '📏', base: 0.35, kind: 'pct' },
    wideArc:   { name: 'Wide Arc',    desc: 'whip arc',    icon: '🪭', base: 0.30, kind: 'pct' },
    frenzy:    { name: 'Frenzy',      desc: 'whip speed',  icon: '💨', base: 0.25, kind: 'pct' },
    heavyLash: { name: 'Heavy Lash',  desc: 'whip damage', icon: '🔨', base: 0.40, kind: 'pct' },
    cyclone:   { name: 'Cyclone',     desc: 'full 360° sweep (every 3rd swing)', icon: '🌀', base: 1, kind: 'flat' },
    barbed:    { name: 'Barbed Lash', desc: 'bleed on struck foes (over 3s, dot)', icon: '🩸', base: 0.50, kind: 'pct' },
  },
  // bigBloom/lasting/virulent fold into bloom's levels[] via WEAPON_STAT_MODS; quickCast (cast
  // rate) is read at the plant site (divides the plant interval, same reason as flagella.frenzy).
  // twinBloom/sporeburst are behavioral (read at their trigger sites — see stepBloomWeapon/
  // stepBlooms in sim.js). twinBloom is a flat entity-count mod (+1 cloud/pick, like extraOrb).
  bloom: {
    bigBloom:   { name: 'Big Bloom',       desc: 'cloud radius',      icon: '🌸', base: 0.35, kind: 'pct' },
    lasting:    { name: 'Lingering Spores', desc: 'cloud duration',    icon: '⏳', base: 0.40, kind: 'pct' },
    virulent:   { name: 'Virulent',        desc: 'cloud tick damage', icon: '☣️', base: 0.35, kind: 'pct' },
    quickCast:  { name: 'Quick Cast',      desc: 'cast rate',         icon: '⏩', base: 0.25, kind: 'pct' },
    twinBloom:  { name: 'Twin Bloom',      desc: 'extra cloud(s) per cast',        icon: '🌺', base: 1, kind: 'flat' },
    sporeburst: { name: 'Sporeburst',      desc: 'mini-cloud when a foe dies inside', icon: '💥', base: 1, kind: 'flat' },
  },
  // Garden natives (v5.3 task, see stepStingerWeapon/stepLureWeapon in sim.js). sharper/volley fold
  // into stinger's levels[] via WEAPON_STAT_MODS; longNeedles (range AND speed) and rapid (attack
  // rate — dividing it into the levels[] `rate` would SLOW it, like flagella.frenzy) are read at the
  // fire site. venomTips/hive are behavioral (needle hit site / volley fire site).
  stinger: {
    sharper:     { name: 'Sharper Tips', desc: 'needle damage',        icon: '🗡️', base: 0.25, kind: 'pct' },
    volley:      { name: 'Wider Volley', desc: 'needles per volley',   icon: '🎯', base: 2,    kind: 'flat' },
    longNeedles: { name: 'Long Needles', desc: 'needle range & speed', icon: '📏', base: 0.30, kind: 'pct' },
    rapid:       { name: 'Rapid Fire',   desc: 'volley rate',          icon: '🚀', base: 0.25, kind: 'pct' },
    venomTips:   { name: 'Venom Tips',   desc: 'needles inject 1 venom stack', icon: '☠️', base: 1, kind: 'flat' },
    hive:        { name: 'Hive Mind',    desc: 'every 4th volley fires all around', icon: '🐝', base: 1, kind: 'flat' },
  },
  // widerTaunt/longerLure fold into lure's levels[] via WEAPON_STAT_MODS; bigBurst (burst dmg AND
  // radius) and fastLure (plant rate) are read at the plant/burst site. twinLure (+decoy, a flat
  // entity-count mod like twinBloom) and stickyScent are behavioral (plant/burst site).
  lure: {
    widerTaunt:  { name: 'Wider Taunt',   desc: 'lure aggro radius',     icon: '📡', base: 0.30, kind: 'pct' },
    bigBurst:    { name: 'Big Burst',     desc: 'burst damage & radius', icon: '💥', base: 0.30, kind: 'pct' },
    longerLure:  { name: 'Lasting Lure',  desc: 'lure duration',         icon: '⏳', base: 0.35, kind: 'pct' },
    fastLure:    { name: 'Quick Bait',    desc: 'plant rate',            icon: '⏩', base: 0.25, kind: 'pct' },
    twinLure:    { name: 'Twin Lure',     desc: 'extra decoy(s) per cast', icon: '🌺', base: 1, kind: 'flat' },
    stickyScent: { name: 'Sticky Scent',  desc: 'burst leaves a slow zone', icon: '🕸️', base: 1, kind: 'flat' },
  },
  // ---- Undergrowth natives (v5.4) ----
  // rend/wideRake fold into pounceClaws' levels[] via WEAPON_STAT_MODS; longPounce (dash AND
  // range) and quickPaws (attack rate — dividing it into the levels[] `rate` would SLOW it, like
  // flagella.frenzy) are read at the fire site. doublePounce/throughLine are behavioral (see
  // stepPounceWeapon in sim.js).
  pounceClaws: {
    rend:         { name: 'Rending Claws', desc: 'claw damage',        icon: '🩸', base: 0.35, kind: 'pct' },
    wideRake:     { name: 'Wide Rake',     desc: 'claw arc',           icon: '🪭', base: 0.30, kind: 'pct' },
    longPounce:   { name: 'Long Pounce',   desc: 'leap distance & reach', icon: '📏', base: 0.30, kind: 'pct' },
    quickPaws:    { name: 'Quick Paws',    desc: 'pounce rate',        icon: '💨', base: 0.25, kind: 'pct' },
    doublePounce: { name: 'Double Pounce', desc: 'every 3rd pounce chains into a second leap', icon: '🐈', base: 1, kind: 'flat' },
    throughLine:  { name: 'Through Line',  desc: 'the leap itself rakes what it passes',       icon: '➡️', base: 1, kind: 'flat' },
  },
  // sharpQuills/moreQuills/piercingQuills fold into quillBurst's levels[] via WEAPON_STAT_MODS;
  // longQuills (range AND speed) and rapidQuills (burst rate) are read at the fire site.
  // retaliate is behavioral (read in hurtPlayer's path — see QUILL_RETALIATE_CD below).
  quillBurst: {
    sharpQuills:    { name: 'Sharp Quills',   desc: 'quill damage',        icon: '🗡️', base: 0.25, kind: 'pct' },
    moreQuills:     { name: 'Bristling',      desc: 'quills per burst',    icon: '🦔', base: 2,    kind: 'flat' },
    longQuills:     { name: 'Long Quills',    desc: 'quill range & speed', icon: '📏', base: 0.30, kind: 'pct' },
    rapidQuills:    { name: 'Twitchy Spine',  desc: 'burst rate',          icon: '⏩', base: 0.25, kind: 'pct' },
    piercingQuills: { name: 'Barbed Quills',  desc: 'quill pierce',        icon: '🎯', base: 1,    kind: 'flat' },
    retaliate:      { name: 'Retaliation',    desc: 'getting hit fires a free burst', icon: '💢', base: 1, kind: 'flat' },
  },
  // terror/shockwave/shrill fold into chitterShriek's levels[] via WEAPON_STAT_MODS; rapidShriek
  // (cast rate) is read at the cast site. echoShriek/panicRout are behavioral (see stepShriekWeapon
  // and the fear handling in dealDamage/stepEnemyMovement).
  chitterShriek: {
    terror:      { name: 'Terror',       desc: 'fear duration',  icon: '😱', base: 0.35, kind: 'pct' },
    shockwave:   { name: 'Shockwave',    desc: 'shriek radius',  icon: '📡', base: 0.30, kind: 'pct' },
    shrill:      { name: 'Shrill',       desc: 'shriek damage',  icon: '📢', base: 0.30, kind: 'pct' },
    rapidShriek: { name: 'Chatterbox',   desc: 'shriek rate',    icon: '⏩', base: 0.25, kind: 'pct' },
    echoShriek:  { name: 'Echo Shriek',  desc: 'echo shriek(s) per cast',      icon: '🔁', kind: 'tier' },
    panicRout:   { name: 'Panic Rout',   desc: 'damage taken by fleeing foes',  icon: '🏃', base: 0.40, kind: 'pct' },
  },
  // ---- City natives (v5.4; Neon Beam rides the existing WEAPON_MODS.rainbow set above) ----
  // heavyTrash/wideTornado/fasterSpin/moreTrash fold into trashTornado's levels[] via
  // WEAPON_STAT_MODS. flingDebris/suction are behavioral (see stepTornadoWeapon in sim.js).
  trashTornado: {
    heavyTrash:  { name: 'Heavy Trash',   desc: 'debris damage',   icon: '🔨', base: 0.25, kind: 'pct' },
    wideTornado: { name: 'Wide Tornado',  desc: 'orbit radius',    icon: '🪐', base: 0.25, kind: 'pct' },
    fasterSpin:  { name: 'Faster Spin',   desc: 'spin speed',      icon: '🌀', base: 0.25, kind: 'pct' },
    moreTrash:   { name: 'More Trash',    desc: 'debris chunks',   icon: '🗑️', base: 1,    kind: 'flat' },
    flingDebris: { name: 'Fling Debris',  desc: 'chunk(s) hurled outward periodically', icon: '🎯', kind: 'tier' },
    suction:     { name: 'Suction',       desc: 'inward pull on nearby foes',           icon: '🌬️', base: 0.50, kind: 'pct' },
  },
  // pressure/wideGeyser/moreGeysers fold into sewerGeyser's levels[] via WEAPON_STAT_MODS;
  // rapidGeyser (cast rate) is read at the cast site. launch/chainGeyser are behavioral (see
  // stepGeysers in sim.js).
  sewerGeyser: {
    pressure:    { name: 'High Pressure', desc: 'eruption damage', icon: '💥', base: 0.30, kind: 'pct' },
    wideGeyser:  { name: 'Wide Geyser',   desc: 'eruption radius', icon: '📡', base: 0.30, kind: 'pct' },
    rapidGeyser: { name: 'Burst Main',    desc: 'cast rate',       icon: '⏩', base: 0.25, kind: 'pct' },
    moreGeysers: { name: 'Broken Mains',  desc: 'geysers per cast', icon: '⛲', base: 1,   kind: 'flat' },
    launch:      { name: 'Launch',        desc: 'eruptions fling and stun what they catch', icon: '🚀', base: 1, kind: 'flat' },
    chainGeyser: { name: 'Chain Burst',   desc: 'follow-up geyser(s) per eruption',         icon: '🎆', kind: 'tier' },
  },
  // ---- Skies natives (v5.4) ----
  // bellow/wideRoar/farRoar fold into roar's levels[] via WEAPON_STAT_MODS; rapidRoar (attack
  // rate) is read at the fire site. stagger/resonance are behavioral (see stepRoarWeapon).
  roar: {
    bellow:    { name: 'Bellow',      desc: 'roar damage', icon: '📢', base: 0.30, kind: 'pct' },
    wideRoar:  { name: 'Wide Roar',   desc: 'roar arc',    icon: '🪭', base: 0.30, kind: 'pct' },
    farRoar:   { name: 'Carrying Roar', desc: 'roar range', icon: '📏', base: 0.30, kind: 'pct' },
    rapidRoar: { name: 'Short Breath', desc: 'roar rate',   icon: '💨', base: 0.25, kind: 'pct' },
    stagger:   { name: 'Stagger',     desc: 'stun on roared foes',              icon: '💫', base: 0.50, kind: 'pct' },
    resonance: { name: 'Resonance',   desc: 'every 3rd roar goes all around',   icon: '🌀', base: 1, kind: 'flat' },
  },
  // heavyTail/longTail/broadSweep fold into tailSwipe's levels[] via WEAPON_STAT_MODS; quickTail
  // (attack rate) is read at the fire site. wreckingTail/counterSwipe are behavioral (see
  // stepTailWeapon and the counter hook in hurtPlayer).
  tailSwipe: {
    heavyTail:    { name: 'Heavy Tail',    desc: 'swipe damage', icon: '🔨', base: 0.30, kind: 'pct' },
    longTail:     { name: 'Long Tail',     desc: 'swipe reach',  icon: '📏', base: 0.30, kind: 'pct' },
    broadSweep:   { name: 'Broad Sweep',   desc: 'swipe arc',    icon: '🪭', base: 0.25, kind: 'pct' },
    quickTail:    { name: 'Quick Tail',    desc: 'swipe rate',   icon: '💨', base: 0.25, kind: 'pct' },
    wreckingTail: { name: 'Wrecking Tail', desc: 'collateral damage where launched foes land', icon: '🎳', base: 0.40, kind: 'pct' },
    counterSwipe: { name: 'Counter Swipe', desc: 'getting hit triggers a free swipe',          icon: '💢', base: 1, kind: 'flat' },
  },
  // heavyDebris/bigImpact/moreDebris fold into debrisToss' levels[] via WEAPON_STAT_MODS; longToss
  // (castRange) and rapidToss (cast rate) are read at the throw site. shrapnel is behavioral
  // (see stepLobs in sim.js).
  debrisToss: {
    heavyDebris: { name: 'Heavy Debris', desc: 'impact damage', icon: '🔨', base: 0.30, kind: 'pct' },
    bigImpact:   { name: 'Big Impact',   desc: 'burst radius',  icon: '💥', base: 0.30, kind: 'pct' },
    longToss:    { name: 'Long Toss',    desc: 'throw range',   icon: '📏', base: 0.30, kind: 'pct' },
    rapidToss:   { name: 'Quick Hands',  desc: 'throw rate',    icon: '⏩', base: 0.25, kind: 'pct' },
    moreDebris:  { name: 'Both Hands',   desc: 'chunks per throw', icon: '🪨', base: 1,  kind: 'flat' },
    shrapnel:    { name: 'Shrapnel',     desc: 'splinter(s) scattered by each impact', icon: '🎆', kind: 'tier' },
  },
  // ---- Beyond natives (v5.4; the Black-Hole Vortex rides the existing WEAPON_MODS.hole set) ----
  // keenShard/moreShards/pierceShard fold into realityShard's levels[] via WEAPON_STAT_MODS;
  // rapidShard (fire rate) is read at the fire site. riftScar/recursion are behavioral (see
  // stepShardWeapon / the shard branch of stepBullets).
  realityShard: {
    keenShard:   { name: 'Keen Shards',  desc: 'shard damage',     icon: '🗡️', base: 0.25, kind: 'pct' },
    moreShards:  { name: 'Splintering',  desc: 'shards per volley', icon: '🔺', base: 1,    kind: 'flat' },
    pierceShard: { name: 'Phase Edge',   desc: 'shard pierce',     icon: '🎯', base: 1,    kind: 'flat' },
    rapidShard:  { name: 'Quick Draw',   desc: 'volley rate',      icon: '⏩', base: 0.25, kind: 'pct' },
    riftScar:    { name: 'Rift Scar',    desc: 'each blink leaves a detonating rift', icon: '🌀', base: 0.50, kind: 'pct' },
    recursion:   { name: 'Recursion',    desc: 'shard(s) forked when one expires',    icon: '♾️', kind: 'tier' },
  },
  // wideFold/longFold/sustainFold fold into tesseractBeam's levels[] via WEAPON_STAT_MODS;
  // rapidFold (cast rate) is read at the cast site. hyperfold/collapse are behavioral (see
  // stepTesseractWeapon / the folded branch of stepBeams).
  tesseractBeam: {
    wideFold:    { name: 'Wide Fold',    desc: 'beam width',    icon: '📡', base: 0.20, kind: 'pct' },
    longFold:    { name: 'Long Fold',    desc: 'beam length',   icon: '↔️', base: 0.20, kind: 'pct' },
    sustainFold: { name: 'Held Fold',    desc: 'beam duration', icon: '⌛', base: 0.20, kind: 'pct' },
    rapidFold:   { name: 'Quick Fold',   desc: 'cast rate',     icon: '⏩', base: 0.25, kind: 'pct' },
    hyperfold:   { name: 'Hyperfold',    desc: 'extra fold arm(s) per cast',        icon: '🔷', kind: 'tier' },
    collapse:    { name: 'Collapse',     desc: 'damage when the fold snaps shut',   icon: '🌋', base: 0.80, kind: 'pct' },
  },
}
export const MAX_WEAPON_MOD_PICKS = 5
// Shared by every tier mod: a single pick's bonus is looked up by rolled rarity rather than
// base*rarityMult, so high-rarity picks stay meaningful without letting per-cast entity counts
// explode (a mythic pierce/blast pick multiplies fine; a mythic +6.5 stars-per-volley would not).
export const WEAPON_MOD_TIER_BONUS = { normal: 1, rare: 1, epic: 2, legendary: 2, mythic: 3 }
// Level-up pool cap: if more weapon-mod candidates are eligible than this (many weapons owned,
// each with several mods still under MAX_WEAPON_MOD_PICKS), uniformly sample this many per
// buildLevelUpChoices call so mods don't crowd out weapon/passive/element cards.
export const MOD_POOL_MAX = 6
// Per-weapon fairness for the level-up mod pool (v4.4): a single weapon contributes at most this
// many of its eligible mods (randomly chosen) to the candidate list per level-up. Star is the
// STARTING weapon and the only one owned early, so without this its 6 mods flooded every pool —
// ~32% of ALL early cards were star mods and ~70% of level-ups offered at least one, making
// "just take another star mod" a no-brainer. Capping per-weapon candidates cuts that flood and
// keeps the pool fair once several weapons are owned (no single one dominates).
export const MOD_CANDIDATES_PER_WEAPON = 2
// Belt-and-braces with the candidate cap: at most this many mod cards from the SAME weapon may
// land in one 3-card level-up pool, so a roll can never hand a player an all-one-weapon screen.
export const MAX_MODS_PER_WEAPON_PER_POOL = 1

// Twin Ring (orbit): inner ring radius, as a fraction of the main ring's radius.
export const ORBIT_TWIN_RING_RADIUS_FRAC = 0.6

// Echo Wave (wave): echo cadence/damage (full radius/knockback, only damage is scaled).
export const WAVE_ECHO_DELAY = 0.25   // s, delay between an Echo Wave cast and the next
export const WAVE_ECHO_DMG_FRAC = 0.6 // each echo's damage, as a fraction of the original cast's

// Cluster Bombs (mines): bomblet shape/scatter when a (non-bomblet) mine pops.
export const MINE_CLUSTER_DMG_FRAC = 0.4    // bomblet damage, as a fraction of the popped mine's
export const MINE_CLUSTER_RADIUS_FRAC = 0.6 // bomblet blast radius, as a fraction of the popped mine's
export const MINE_CLUSTER_ARM = 0.15        // s, bomblet arm time before it can trigger (short fuse)
export const MINE_CLUSTER_SCATTER_MIN = 60  // px, min scatter distance from the popped mine
export const MINE_CLUSTER_SCATTER_MAX = 120 // px, max scatter distance from the popped mine

// Singularity (black hole): extra vortex radius/coreRadius/pull, as a fraction of the main cast's.
export const HOLE_SINGULARITY_FRAC = 0.55

// Split: shard damage/angle shape (picks-per-shard count lives on WEAPON_MODS.star.split above).
// v4.4: 0.5 -> 0.4. Split/chain/ricochet all multiply a star's total hits, so their per-shard/
// per-jump damage fractions compound multiplicatively when stacked together (a heavily-invested
// star hit ~9.5x its own pierce/blast baseline — the runaway that made pouring picks into star a
// no-brainer). Trimming these fractions shaves that stacked tail while barely touching a 1-pick
// dip, so star stays a strong, fun starter without spiralling past the AoE weapons.
export const STAR_SPLIT_DMG_FRAC = 0.4                    // shard damage, as a fraction of the star's own damage
export const STAR_SPLIT_BASE_ANGLE = (35 * Math.PI) / 180 // ± half-angle used for exactly 2 shards
export const STAR_SPLIT_MAX_SPREAD = (90 * Math.PI) / 180 // total fan spread once 3+ shards are out

// Chain: when a bullet's pierce is exhausted, it re-targets the nearest not-yet-hit enemy
// within range instead of dying (falls back to ricochet if none is found or no jumps remain).
export const STAR_CHAIN_RANGE = 200       // px, re-target search radius from the last hit enemy
export const STAR_CHAIN_DMG_MUL = 0.7     // damage multiplier applied per jump (v4.4: 0.8 -> 0.7, tames stacked compounding)
export const STAR_CHAIN_EXTRA_LIFE = 0.4  // s, minimum flight time granted on a chain jump

// Ricochet: once a spent bullet has no chain jumps left, it bounces off in a random new
// direction (deflected 60-120° from its incoming heading) instead of dying.
export const STAR_RICOCHET_DMG_MUL = 0.6                      // damage multiplier applied per bounce (v4.4: 0.7 -> 0.6, tames stacked compounding)
export const STAR_RICOCHET_ANGLE_MIN = (60 * Math.PI) / 180   // min deflection from incoming heading
export const STAR_RICOCHET_ANGLE_MAX = (120 * Math.PI) / 180  // max deflection from incoming heading
export const STAR_RICOCHET_EXTRA_LIFE = 0.4                   // s, minimum flight time granted on a bounce

// ---- v4.3 "crazy-mod pass" tuning (13 new behavioral mods, one set per weapon below) --------

// Supernova Sparks (orbit): splash radius around an orb-killed enemy.
export const ORBIT_NOVA_RADIUS = 85 // px

// Undertow (wave): extra knockback magnitude per stack, on top of the inverted (pulling) nova.
export const UNDERTOW_KB_PER_STACK = 0.5 // +50% knockback magnitude per stack

// Tsunami (wave): cast cadence for a "monster wave" (radius/damage both multiplied).
export const TSUNAMI_EVERY = 3 // every 3rd wave cast

// Seeker Blades (boomerang): outbound curve-toward-target turn rate at bonus=1.
export const SEEKER_TURN_RATE = 2.5 // rad/s

// Magnetic Mines: armed-mine crawl speed toward the nearest enemy at bonus=1.
export const MINE_CRAWL_SPEED = 55 // px/s

// Popping Wisps (homing): death-pop splash radius (hit-with-no-pierce-left OR lifetime expiry).
export const WISP_NOVA_RADIUS = 70 // px

// Swarm (homing): mini-wisps spawned on a (non-mini) wisp kill.
export const SWARM_DMG_FRAC = 0.5 // mini-wisp damage, as a fraction of the source wisp's
export const SWARM_LIFE = 1.2     // s, mini-wisp lifetime

// Big Crunch (black hole): collapse-detonation damage multiplier on top of the hole's own tick dmg.
export const CRUNCH_DMG_MUL = 10

// ---- Pond weapons (v5.0 task 4: Flagella Whip + Toxin Bloom) --------------------------------
// Flagella Whip (pond starter, melee arc sweep — see WEAPONS.flagella above and stepFlagellaWeapon
// in sim.js): a swing damages every enemy whose CENTER falls in the sector (arc rad, range px)
// centered on the player's facing. cyclone (behavioral): every FLAGELLA_CYCLONE_EVERY-th swing
// opens to a full 360° instead of the arc.
export const FLAGELLA_CYCLONE_EVERY = 3
// barbed (behavioral): a struck enemy bleeds a DoT whose TOTAL = the hit's dealt damage ×
// BARBED_DMG_MUL × (accumulated barbed bonus), spread over BARBED_DURATION seconds and ticked
// dot-flagged every STATUS_TICK (like ignite). Reapplying refreshes (replaces) it. One normal
// pick (bonus 0.5) bleeds ~1.5× the hit; investment/rarity ramps it toward the 3× headline.
export const BARBED_DMG_MUL = 3
export const BARBED_DURATION = 3

// Toxin Bloom (rare AoE zoner — see WEAPONS.bloom above and stepBloomWeapon/stepBlooms in sim.js):
// a planted cloud (run.blooms, see state.js) grows 0 -> maxR over dur × BLOOM_GROW_FRAC, then holds
// maxR, ticking dot-flagged damage every BLOOM_TICK to enemies inside until t reaches dur.
export const BLOOM_GROW_FRAC = 0.35
export const BLOOM_TICK = 0.5
// sporeburst (behavioral): a foe killed by a (non-mini) cloud's own tick emits a mini-cloud at
// SPOREBURST_FRAC of the parent's maxR (same dur/dmgPerTick), flagged `_mini` so it never chains.
export const SPOREBURST_FRAC = 0.35

// ---- Garden weapons (v5.3: Stinger + Pheromone Lure; Leaf Blade = boomerang re-theme) --------
// Stinger (garden native, needle-cone — see WEAPONS.stinger + stepStingerWeapon in sim.js): each
// needle is a run.bullets projectile tagged weapon:'stinger' so stepBullets can apply stinger-only
// behaviour (venomTips) without touching star's split/chain/ricochet (disabled per-needle).
export const STINGER_R = 7            // px, needle hit radius (added to enemy radius)
export const STINGER_HIVE_EVERY = 4   // hive (behavioral): every Nth volley fires in all directions
// Pheromone Lure (garden native, taunt decoy + burst — see WEAPONS.lure + stepLureWeapon/stepLures
// in sim.js). stickyScent (behavioral) drops a slow zone into run.webs on burst:
export const LURE_STICKY_R = 80       // px, stickyScent slow-zone radius
export const LURE_STICKY_DUR = 2      // s, stickyScent slow-zone lifetime

// ---- Undergrowth weapons (v5.4: Pounce Claws + Quill Burst + Chitter Shriek) -----------------
// Pounce Claws (undergrowth starter — see WEAPONS.pounceClaws + stepPounceWeapon in sim.js). The
// cast teleport-free DASHES the player toward the nearest enemy over POUNCE_DASH_T seconds (the
// player is uncontrollable but NOT invulnerable during it; obstacles still stop them), then rakes
// the sector. Dash distance = min(levels.dash, distance to the target - its radius) so you land
// ON the foe, never past it.
export const POUNCE_DASH_T = 0.12        // s the dash itself takes (short — this reads as a hop)
export const POUNCE_DOUBLE_EVERY = 3     // doublePounce (behavioral): every Nth pounce chains a second leap
export const POUNCE_DOUBLE_DELAY = 0.15  // s between the first rake and the chained leap
export const POUNCE_DOUBLE_DMG_FRAC = 0.7 // chained leap's damage, as a fraction of the first rake's
// throughLine (behavioral): the dash path itself rakes. Every enemy whose center is within
// POUNCE_PATH_R of the dash SEGMENT takes POUNCE_PATH_DMG_FRAC of the swing's damage (once per
// pounce — the end-of-dash sector rake is applied separately and can hit the same enemy again).
export const POUNCE_PATH_R = 34
export const POUNCE_PATH_DMG_FRAC = 0.5

// Quill Burst (undergrowth — see WEAPONS.quillBurst + stepQuillWeapon in sim.js): each quill is a
// run.bullets projectile tagged weapon:'quill' so stepBullets applies quill-only behaviour without
// touching star's split/chain/ricochet (all disabled per-quill, exactly like stinger's needles).
export const QUILL_R = 8              // px, quill hit radius (added to enemy radius)
// retaliate (behavioral): a burst also fires the instant the player TAKES contact/zone damage
// (hurtPlayer), free of the weapon timer, at most once per QUILL_RETALIATE_CD seconds. Each pick
// (flat) adds another quill to the retaliation burst on top of the level's `count`.
export const QUILL_RETALIATE_CD = 1.2

// Chitter Shriek (undergrowth utility — see WEAPONS.chitterShriek + stepShriekWeapon in sim.js): a
// run.novas ring carrying an extra `fear` field (s). Enemies the ring hits get e.fearT = fear and
// flee: while e.fearT > 0, stepEnemyMovement INVERTS the seek direction (they run from the player)
// at FEAR_SPEED_MUL of their own speed and never deal contact damage. Ticks down every frame.
export const FEAR_SPEED_MUL = 1.25    // fleeing enemies scatter a bit faster than they chase
export const SHRIEK_ECHO_DELAY = 0.22 // s between an echoShriek cast and the next (cf. WAVE_ECHO_DELAY)
export const SHRIEK_ECHO_DMG_FRAC = 0.6 // each echo's damage/fear, as a fraction of the original cast's
// panicRout (behavioral): a FLEEING enemy (fearT > 0) takes (1 + bonus) × damage from EVERY source
// (applied in dealDamage, alongside the venom amp). No constant — the bonus is the whole knob.

// ---- City weapons (v5.4: Trash Tornado + Sewer Geyser; Neon Beam = the rainbow re-theme) -------
// Trash Tornado (city — see WEAPONS.trashTornado + stepTornadoWeapon in sim.js): chunks are evenly
// spaced on a ring around the player, sim rewrites run.debris ({x, y, r}) every frame (same
// contract as run.orbs), and each chunk damages enemies it overlaps every `tick` s (per-chunk,
// per-enemy cooldown — same bookkeeping orbit uses).
export const DEBRIS_R = 14            // px, base chunk hit radius (cf. ORB_R)
// flingDebris (behavioral): every TORNADO_FLING_EVERY seconds the tornado hurls <tier bonus> chunks
// straight outward as run.bullets tagged weapon:'trash', at TORNADO_FLING_DMG_FRAC of chunk damage.
export const TORNADO_FLING_EVERY = 1.5
export const TORNADO_FLING_DMG_FRAC = 0.8
export const TORNADO_FLING_SPEED = 430 // px/s
export const TORNADO_FLING_RANGE = 260 // px before a flung chunk expires (life = range/speed)
// suction (behavioral): enemies within TORNADO_SUCTION_RANGE of the player are dragged inward at
// TORNADO_SUCTION_PULL × bonus px/s (elites/tanks resist — capped at TORNADO_SUCTION_RESIST of it,
// mirroring HOLE_RESIST_CAP so the tornado can't trivially hold a tank).
export const TORNADO_SUCTION_RANGE = 220
export const TORNADO_SUCTION_PULL = 120
export const TORNADO_SUCTION_RESIST = 0.5

// Sewer Geyser (city utility — see WEAPONS.sewerGeyser + stepGeyserWeapon/stepGeysers in sim.js).
// run.geysers entries: { x, y, r, fuse, dur, dmg, _chained? } — fuse counts down (harmless
// telegraph; dur is its starting value so render can grow a warning ring from fuse/dur), then the
// geyser erupts ONCE (damaging ENEMIES only, never the player), emits {type:'explode', x, y,
// radius:r}, and is removed. _chained marks a chainGeyser follow-up so it never chains further.
export const GEYSER_LAUNCH_KB = 260   // launch (behavioral): knockback applied to caught enemies
export const GEYSER_STUN = 0.6        // launch: stun seconds × bonus (e.stunT — no seek, no contact damage)
export const GEYSER_CHAIN_FRAC = 0.6  // chainGeyser: follow-up radius/damage, as a fraction of the parent's
export const GEYSER_CHAIN_FUSE = 0.35 // s, follow-up telegraph (shorter than the parent's)
export const GEYSER_CHAIN_SCATTER_MIN = 70  // px, min scatter from the parent eruption
export const GEYSER_CHAIN_SCATTER_MAX = 150 // px, max scatter from the parent eruption

// ---- Skies weapons (v5.4: Roar + Tail Swipe + Debris Toss) ------------------------------------
// Roar (skies starter — see WEAPONS.roar + stepRoarWeapon in sim.js): the same sector test
// flagella/pounceClaws use, plus a radial shove away from the player.
export const ROAR_STUN = 0.5              // stagger (behavioral): stun seconds × bonus on roared foes (e.stunT)
export const ROAR_RESONANCE_EVERY = 3     // resonance (behavioral): every Nth roar opens to a full 360° (cf. FLAGELLA_CYCLONE_EVERY)

// Tail Swipe (skies — see WEAPONS.tailSwipe + stepTailWeapon in sim.js).
// wreckingTail (behavioral): a struck enemy is knocked back as usual, and where it ENDS UP it
// deals TAIL_COLLIDE_FRAC × bonus × the swipe's dealt damage to every OTHER enemy within
// TAIL_COLLIDE_R of it (resolved once per swipe, after all knockbacks are applied; collateral
// never re-triggers collateral).
export const TAIL_COLLIDE_R = 60
export const TAIL_COLLIDE_FRAC = 0.5
export const TAIL_COUNTER_CD = 1.5        // counterSwipe (behavioral): free swipe on taking damage, at most every N s (cf. QUILL_RETALIATE_CD)

// Debris Toss (skies utility — see WEAPONS.debrisToss + stepDebrisWeapon/stepLobs in sim.js).
// run.lobs entries: { x, y, fromX, fromY, tx, ty, t, flight, r, dmg } — t counts UP from 0 to
// flight; the chunk's drawn position lerps (fromX,fromY)->(tx,ty) with a render-side parabolic
// hop (sim only needs t/flight). On landing it bursts ONCE for dmg in r, damaging ENEMIES only
// (never the player), emits {type:'explode', x:tx, y:ty, radius:r}, and is removed. A lob is a
// projectile for gravity-well purposes (beyond bends it) but it is NOT a run.bullets entry.
export const LOB_SHRAPNEL_DMG_FRAC = 0.4   // shrapnel (behavioral): splinter damage, as a fraction of the impact's
export const LOB_SHRAPNEL_SPEED = 420      // px/s, splinters fly radially from the impact
export const LOB_SHRAPNEL_RANGE = 200      // px before a splinter expires (life = range/speed)
export const LOB_SHRAPNEL_R = 7            // px, splinter hit radius (run.bullets tagged weapon:'debris')

// ---- Beyond weapons (v5.4: Reality Shard + Tesseract Beam; Black-Hole Vortex = the hole) -------
// Reality Shard (beyond starter — see WEAPONS.realityShard + stepShardWeapon in sim.js): a
// run.bullets projectile tagged weapon:'shard' carrying _blinkCd (s until its next blink). A blink
// jumps it blinkDist px along its CURRENT heading (post gravity-well curvature) without consuming
// life, and without sweeping the gap (nothing in between is hit — that's the point).
export const SHARD_R = 9                   // px, shard hit radius (added to enemy radius)
// riftScar (behavioral): each blink leaves a rift at the shard's DEPARTURE point that detonates
// after SHARD_RIFT_FUSE for SHARD_RIFT_FRAC × bonus × the shard's damage in SHARD_RIFT_R. Rifts
// reuse run.geysers (same "telegraph then erupt, enemies only" contract) with _chained: true set
// so chainGeyser — a sewerGeyser mod — can never fire off them.
export const SHARD_RIFT_FUSE = 0.30
export const SHARD_RIFT_R = 55
export const SHARD_RIFT_FRAC = 0.8
// recursion (behavioral): when a shard's life expires (NOT when its pierce is spent) it forks into
// <tier bonus> new shards in random directions at SHARD_RECURSE_DMG_FRAC damage and
// SHARD_RECURSE_LIFE_FRAC life, flagged `_fork` so a fork never re-forks.
export const SHARD_RECURSE_DMG_FRAC = 0.5
export const SHARD_RECURSE_LIFE_FRAC = 0.6

// Tesseract Beam (beyond — see WEAPONS.tesseractBeam + stepTesseractWeapon in sim.js): a run.beams
// entry with `folded: true`. A folded beam sweeps `arms` arms evenly around the circle (2 by
// default = the fold, 180° apart; hyperfold adds more, so 3 arms = 120°, 4 = 90°, ...) — the same
// geometry rainbow.prismatic uses, but baked into ONE beam entity rather than several, so
// collapse can resolve the whole fold at once.
export const TESSERACT_ARMS = 2            // arms on a plain (unmodded) fold
// collapse (behavioral): when a folded beam expires, everything currently inside ANY of its arms
// is yanked toward the player at TESSERACT_COLLAPSE_PULL px/s and takes TESSERACT_COLLAPSE_MUL ×
// (1 + bonus) × the beam's per-tick damage, plus an {type:'explode'} at the player.
export const TESSERACT_COLLAPSE_MUL = 8
export const TESSERACT_COLLAPSE_PULL = 400

// ---- Elements (PoE2/Warframe-style elemental status + combos) ---------------------
// Offered always (not gated behind a weapon), rolls a rarity like passives: applied
// potency = base * RARITIES[rarity].mult, added per pick. run.elements[id] accumulates
// potency; run.elementPicks[id] counts picks (max MAX_ELEMENT_PICKS). desc doubles as
// the level-up card description, so it includes a short combo hint.
export const ELEMENTS = {
  fire: {
    name: 'Fire Infusion', icon: '🔥', base: 1,
    desc: 'Ignites enemies for burn damage over time. Combo: shatters chilled foes, detonates with ⚡.',
  },
  cold: {
    name: 'Cold Infusion', icon: '❄️', base: 1,
    desc: 'Chills and freezes enemies. Combo: shatters with 🔥, chilling arcs with ⚡.',
  },
  lightning: {
    name: 'Lightning Infusion', icon: '⚡', base: 1,
    desc: 'Shocks arc damage to nearby foes. Combo: detonates 🔥 ignites, spreads ❄️ chill, copies ☠️ venom.',
  },
  venom: {
    name: 'Venom Infusion', icon: '☠️', base: 1,
    desc: 'Stacking poison that amplifies all damage taken. Combo: doubled amp on ❄️, faster burn with 🔥.',
  },
}
export const MAX_ELEMENT_PICKS = 5
// Level-up pool rarity: each eligible element id only joins a level-up's candidate pool with
// this probability (rolled once per buildLevelUpChoices call, shared across all 3 card slots —
// see eligibleElementIds in sim.js). Weapons/passives/star-mods always join when eligible, so
// this makes element infusion cards appear roughly half as often as those in the level-up pool.
export const ELEMENT_CARD_WEIGHT = 0.25

// ---- Difficulty (classic runs; picked on the title screen, saved in meta) -----------
// Level 1 = the base game. Each level above 1 adds one RANDOM mutator to the run AND
// stacks +DIFFICULTY_HP_PER_LEVEL enemy HP (multiplied into run.mods.enemyHpMul on top of
// whatever the mutators themselves do). The Daily Anomaly ignores this (fixed shared seed).
export const MAX_DIFFICULTY = 5
// Winning a classic run at this difficulty (or higher) unlocks the next chapter — used by
// endRun (main.js) at victory time AND by loadMeta (state.js) retroactively, since a chapter
// can ship AFTER a player already earned its unlock (their win is encoded in the previous
// chapter's maxDifficulty ladder: winning level d sets it to d+1).
export const CHAPTER_UNLOCK_DIFFICULTY = 3
export const DIFFICULTY_HP_PER_LEVEL = 0.25
export const difficultyHpMul = (d) => 1 + DIFFICULTY_HP_PER_LEVEL * (Math.max(1, d) - 1)
// The payout matching the tax: +25% coins per level above 1 (multiplied into
// run.mods.coinMul, and applied to the end-of-run kill bonus in main.js).
export const DIFFICULTY_COIN_PER_LEVEL = 0.25
export const difficultyCoinMul = (d) => 1 + DIFFICULTY_COIN_PER_LEVEL * (Math.max(1, d) - 1)
// count distinct random mutator ids (Fisher-Yates over the full pool)
export const randomMutators = (count) => {
  const pool = Object.keys(MUTATORS)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = pool[i]
    pool[i] = pool[j]
    pool[j] = t
  }
  return pool.slice(0, Math.max(0, Math.min(count, pool.length)))
}

// ---- Build-focus nudge -------------------------------------------------------
// The more level-up picks a player invests in their arsenal (weapon upgrades + weapon
// mods), the rarer NEW-weapon cards get: each unowned weapon only joins a level-up's
// candidate pool with probability NEW_WEAPON_FADE^invested (floored). A fresh run is
// unchanged (p=1); a committed build stops getting nagged with weapons it doesn't want.
export const NEW_WEAPON_FADE = 0.85
export const NEW_WEAPON_FADE_MIN = 0.1
export const newWeaponChance = (invested) => Math.max(NEW_WEAPON_FADE_MIN, Math.pow(NEW_WEAPON_FADE, invested))
// Hard apparition floor (v4.6): if a level-up's 3 cards ended up with no New! weapon card
// (and the player can still equip one), this is the chance the last card gets swapped for a
// random unowned weapon — guarantees new weapons appear on at least ~5% of level-ups no
// matter how deep the focus-nudge fade goes.
export const NEW_WEAPON_MIN_RATE = 0.05

// Shared DoT tick period for ignite/venom (finer than 3s duration so damage reads smoothly
// without spamming a 'hit' event every single simulation frame).
export const STATUS_TICK = 0.25

// Ignite (fire): a hit deals (IGNITE_DOT_FRAC * potency) of its OWN dealt damage as a DoT
// spread over IGNITE_DURATION seconds. Reapplying refreshes (replaces) duration + DPS.
export const IGNITE_DOT_FRAC = 0.35
export const IGNITE_DURATION = 3

// Chill (cold): slow = min(CHILL_SLOW_CAP, CHILL_SLOW_BASE + CHILL_SLOW_PER_POTENCY * potency)
// for CHILL_DURATION seconds. CHILL_STACK_TO_FREEZE chilling hits landing within an
// still-active chill window freeze the enemy (full stop) for FREEZE_DURATION, followed by
// FREEZE_IMMUNITY seconds where chill still slows but can't build back toward a freeze
// (prevents a perma-freeze lock). Elites/type 'tank' never freeze; the freeze converts into
// a stronger slow instead (chillSlow multiplied by ELITE_FREEZE_SLOW_MUL, capped at 100%).
export const CHILL_SLOW_BASE = 0.30
export const CHILL_SLOW_PER_POTENCY = 0.06
export const CHILL_SLOW_CAP = 0.70
export const CHILL_DURATION = 2
export const CHILL_STACK_TO_FREEZE = 3
export const FREEZE_DURATION = 0.9
export const FREEZE_IMMUNITY = 3
export const ELITE_FREEZE_SLOW_MUL = 1.6

// Shock (lightning): a hit arcs (SHOCK_ARC_FRAC * potency) of its own dealt damage to exactly
// run.elementPicks.lightning nearest OTHER enemies within SHOCK_RANGE of the hit enemy — one
// arc target per lightning pick (not per potency point). SHOCK_CD is a per-source-enemy
// internal cooldown so continuous weapons (orbit, beam) don't spam arcs every tick.
export const SHOCK_ARC_FRAC = 0.30
export const SHOCK_RANGE = 140
export const SHOCK_CD = 0.3

// Venom: each hit adds a stack (max VENOM_MAX_STACKS), refreshing duration to VENOM_DURATION.
// Per-second DoT = VENOM_DOT_PER_STACK * potency * stacks. Damage amp = VENOM_AMP_PER_STACK
// per stack, applied to ALL damage the enemy takes (see COMBOS.brittleAmpMul for chilled foes).
export const VENOM_MAX_STACKS = 8
export const VENOM_DURATION = 4
export const VENOM_DOT_PER_STACK = 1.5
export const VENOM_AMP_PER_STACK = 0.02

// ---- Combos (element x element reactions) ------------------------------------------
// comboCd: per-enemy, per-combo internal cooldown so ticking weapons can't machine-gun
// the same reaction every frame.
export const COMBOS = {
  shatterMul: 1.2, shatterRadius: 90,     // fire+cold Shatter
  overloadRadius: 80,                     // fire+lightning Overload
  acidBurnTickMul: 1.5,                   // fire+venom Acid Burn (both DoTs tick faster)
  brittleAmpMul: 2,                       // cold+venom Brittle (venom amp doubled on chilled foes)
  comboCd: 0.5,
}

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
  [240, { drone: 1, wisp: 5, tank: 3 }], // final-minute frenzy: fastest type (wisp) dominates
  [260, { drone: 1, wisp: 6, tank: 4 }],
]
// spawns/second: linear early (unchanged for t <= SPAWN_LATE_START, so the tuned early game
// doesn't shift), then an added quadratic term after that so the rate keeps accelerating all
// the way to RUN_DURATION instead of flattening out. rate(300) ≈ 19.9/s (~2.9x the old ~6.9/s).
export const SPAWN_RATE_BASE = 0.6
export const SPAWN_RATE_LINEAR = 0.021
export const SPAWN_LATE_START = 120     // s, when the late-game acceleration kicks in
export const SPAWN_LATE_QUAD = 0.0004   // extra t^2 coefficient beyond SPAWN_LATE_START
export const spawnRate = (t) => {
  const base = SPAWN_RATE_BASE + t * SPAWN_RATE_LINEAR
  if (t <= SPAWN_LATE_START) return base
  const late = t - SPAWN_LATE_START
  return base + SPAWN_LATE_QUAD * late * late
}
// enemy HP scales with time: unchanged for t <= HP_SCALE_LATE_START, then multiplied by a
// growing late-game factor so HP keeps climbing instead of leveling off (hpScale(300) ≈ 7.6x
// vs the old formula's flat 4.3x).
export const HP_SCALE_LATE_START = 150
export const HP_SCALE_LATE_RATE = 0.005
export const hpScale = (t) => {
  const base = 1 + t / 90
  if (t <= HP_SCALE_LATE_START) return base
  return base * (1 + HP_SCALE_LATE_RATE * (t - HP_SCALE_LATE_START))
}
export const MAX_ALIVE = 400
// Elite cadence shrinks over the run: ELITE_EVERY_START seconds between elites at t=0,
// linearly down to ELITE_EVERY_END by RUN_DURATION (so multiple elites can be alive at once
// late-run — intended).
export const ELITE_EVERY_START = 45  // seconds, first elite still at t=40 (see state.js _nextEliteAt)
export const ELITE_EVERY_END = 12
export const eliteEveryAt = (t) => {
  const frac = Math.min(1, Math.max(0, t / RUN_DURATION))
  return ELITE_EVERY_START + (ELITE_EVERY_END - ELITE_EVERY_START) * frac
}
export const SPAWN_RING = 60    // px beyond the larger half-screen diagonal
// Enemy speed creep: enemies spawned later fly faster (already-spawned ones are untouched —
// applied once at spawn time, not continuously).
export const SPEED_CREEP_START = 120     // s, creep begins after this
export const SPEED_CREEP_PER_SEC = 0.0004 // +0.04%/s of base speed
export const SPEED_CREEP_CAP = 0.25       // max +25% speed
export const speedCreepMul = (t) => 1 + Math.min(SPEED_CREEP_CAP, Math.max(0, t - SPEED_CREEP_START) * SPEED_CREEP_PER_SEC)

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

// Sacrifice already-purchased SHOP levels (no coin refund) to permanently unlock the 3rd/4th
// level-up card slot (see meta.choiceSlots in state.js and hooks.onSacrifice in main.js).
export const SACRIFICE_COSTS = [20, 40]  // shop levels to give up for the 3rd, then 4th card slot
export const sacrificeCost = (slots) => SACRIFICE_COSTS[slots - 2] ?? null  // slots = current unlocked count (2..4)

// End-of-run coin bonus
export const runBonusCoins = (kills) => Math.floor(kills / 10)

// ---- Chapters (v5.0: macro progression above difficulty) ---------------------------
// Pure data — sim stays theme-agnostic and reads roster archetypes/behavior flags, weapon
// pools, and signature/obstacle config from the run's chapter snapshot (see state.js
// createRun). v5.4 completes the seven-chapter arc from the design doc — CHAPTER_ORDER is the
// single source of truth for sequencing, daily seeding, and how many chapters currently ship.
export const CHAPTER_ORDER = ['body', 'pond', 'garden', 'undergrowth', 'city', 'skies', 'beyond']
export const CHAPTERS = {
  body: {
    name: 'The Body', tagline: 'escape the host', icon: '🦠',
    weapons: ['star', 'orbit', 'wave', 'homing'], starter: 'star',
    // roster: archetype = existing spawn type ('normal'|'tank'|'fast'), muls vs current stats,
    // flags = behavior flags implemented in sim.js (Task 3)
    roster: [
      { id: 'redcell',  archetype: 'normal', name: 'Red Blood Cell',    hpMul: 1, speedMul: 1,   flags: [] },
      { id: 'wbc',      archetype: 'tank',   name: 'White Blood Cell',  hpMul: 1, speedMul: 1,   flags: [] },
      { id: 'antibody', archetype: 'fast',   name: 'Antibody',          hpMul: 1, speedMul: 1,   flags: ['latch'] },
    ],
    eliteFlags: ['acidPool'],           // pill elites dissolve into acid pools
    signature: null,                    // intro chapter has no signature mechanic
    obstacles: null,                    // keeps the open field
    // ---- render-only (v5.0 task 6; interpreted by render.js, ZERO effect on sim) ----
    // body is the baseline look: bgColor = the app's clear colour (main.js); tints are
    // multiply-identity white and there's no player tail. Enemy silhouettes are baked per
    // rosterId in render.js (v5.4 — redcell/wbc/antibody), so no per-chapter enemy map here.
    render: {
      bgColor: 0xf4efe6,   // == main.js app background
      floorTint: 0xffffff, // multiply-identity → floor sprites keep their baked pastel tints
      playerTint: 0xffffff,
      tail: false,
    },
  },
  pond: {
    name: 'The Pond', tagline: 'sink or swim', icon: '🦠→💧',
    weapons: ['flagella', 'mines', 'bloom'], starter: 'flagella',
    roster: [
      { id: 'amoeba',     archetype: 'normal', name: 'Amoeba',     hpMul: 1,   speedMul: 0.9, flags: ['split'] },
      { id: 'tadpole',    archetype: 'fast',   name: 'Tadpole',    hpMul: 1,   speedMul: 1,   flags: ['dashBurst'] },
      { id: 'tardigrade', archetype: 'tank',   name: 'Tardigrade', hpMul: 2.5, speedMul: 0.6, flags: [] },
    ],
    eliteFlags: ['soapTrail'],
    signature: { type: 'currents', strength: 55, scale: 0.0011, drift: 0.13 },
    obstacles: { count: 14, minR: 26, maxR: 44, minDist: 220 }, // minDist from spawn point
    // ---- render-only (v5.0 task 6) ---- murky teal-green water biome. render.js: multiplies
    // floorTint into every floor sprite's baked tint, sets the app clear colour to bgColor,
    // multiplies playerTint onto the blob + shows an animated flagellum tail (tailTint). Enemy
    // silhouettes are baked per rosterId (v5.4 — amoeba/tadpole/tardigrade), and statusless
    // soap-bubble elites shimmer through `eliteIridescent`. currents motes driven off signature.type.
    render: {
      bgColor: 0x2e6258,    // murky teal water showing between the floor blotches
      floorTint: 0x66c2a9,  // teal multiply — pushes the green foliage toward pond weeds
      playerTint: 0xb0f0ff, // cools the mint blob toward a saturated cyan-teal
      tail: true,
      tailTint: 0x66e0d0,
      eliteIridescent: [0xbfe8ff, 0xffd9f2, 0xd9ffe8], // pale hues soap-bubble elites cycle through
    },
  },
  garden: {
    name: 'The Garden', tagline: 'the lawn is a jungle', icon: '🐜',
    // Leaf Blade is the boomerang re-theme (id kept as 'boomerang', see WEAPONS.boomerang);
    // stinger + lure are new v5.3 natives. Starter = the leaf blade (boomerang).
    weapons: ['boomerang', 'stinger', 'lure'], starter: 'boomerang',
    roster: [
      { id: 'ant',    archetype: 'normal', name: 'Ant',    hpMul: 0.85, speedMul: 1.1, flags: ['trailFollow'] },
      { id: 'wasp',   archetype: 'fast',   name: 'Wasp',   hpMul: 1.3,  speedMul: 0.8, flags: ['diveBomb'] },
      { id: 'spider', archetype: 'tank',   name: 'Spider', hpMul: 1.5,  speedMul: 0.9, flags: ['webZone'] },
    ],
    eliteFlags: ['sprayStrip'],           // pesticide-drone elites paint telegraphed spray strips
    // Signature: dying trailFollow ants drop fading pheromone nodes (run.trails) that living ants
    // accelerate along. No field force (unlike currents) — the mechanic IS the ant behaviour, so
    // sim.js gates its trail logic on signature.type === 'pheromones' (future chapters' ants differ).
    signature: { type: 'pheromones' },
    obstacles: { count: 12, minR: 22, maxR: 40, minDist: 220 }, // grass stalks / pebbles
    // ---- render-only (v5.3; interpreted by render.js, ZERO effect on sim) ---- sunlit lawn biome.
    // Clearly brighter/cheerier than the pond's murk: warm daylight green showing between the blades,
    // a sunny grass floorTint, a bug-ish blob (tint-only skin, no tail). Enemy silhouettes are baked
    // per rosterId (v5.4 — ant/wasp/spider). render.js also draws the five garden sim systems
    // (trails/webs/strips/lures + stinger needles), all data-driven no-ops elsewhere.
    render: {
      bgColor: 0x4e8240,    // sunlit lawn green between the grass blades (brighter than pond)
      floorTint: 0xaad066,  // warm sunny grass-green multiply on the floor sprites
      playerTint: 0xc2f070, // bug-ish warm caterpillar green for the blob
      tail: false,
    },
  },
  undergrowth: {
    name: 'The Undergrowth', tagline: 'everything here eats you', icon: '🐾',
    weapons: ['pounceClaws', 'quillBurst', 'chitterShriek'], starter: 'pounceClaws',
    roster: [
      { id: 'cat', archetype: 'tank',   name: 'Cat', hpMul: 1.6,  speedMul: 0.8, flags: ['pounce'] },
      { id: 'owl', archetype: 'fast',   name: 'Owl', hpMul: 1.4,  speedMul: 0.9, flags: ['aerialStrike'] },
      { id: 'rat', archetype: 'normal', name: 'Rat', hpMul: 0.85, speedMul: 1.15, flags: [] },
    ],
    eliteFlags: ['flashlightCone'],       // exterminator elites sweep a cone that ENRAGES other enemies
    // Signature: predator telegraphs (the pounce/aerialStrike roster flags are the telegraphs
    // themselves — no extra step) PLUS a field of snap traps seeded at createRun. `traps` = how
    // many traps to scatter; every other trap number is a SNAP_TRAP_* constant below. sim.js gates
    // its trap step on signature.type === 'predators' and seeds run.traps from signature.traps.
    signature: { type: 'predators', traps: 10 },
    obstacles: { count: 15, minR: 24, maxR: 46, minDist: 220 }, // roots / bones (traps are separate, see run.traps)
    // ---- render-only (v5.4; interpreted by render.js, ZERO effect on sim) ---- dim forest floor
    // seen from ankle height: dark loam showing between leaf litter, a drab dead-leaf floorTint, a
    // furry tan critter with a tail. Deliberately the DARKEST biome so far (the garden's sunlit lawn
    // gives way to the shade under it). Enemy silhouettes are baked per rosterId (cat/owl/rat).
    render: {
      bgColor: 0x2b2417,    // dark loam/soil showing between the leaf litter
      floorTint: 0x8a7a4e,  // drab dead-leaf brown multiply on the floor sprites
      playerTint: 0xd8a86a, // warm tan fur for the blob (you're a small furry critter now)
      tail: true,
      tailTint: 0xc99a5e,   // slightly darker tan — a critter tail, not a flagellum
    },
  },
  city: {
    name: 'The City', tagline: 'mind the traffic', icon: '🏙️',
    // Neon Beam is the rainbow re-theme (id kept as 'rainbow', see WEAPONS.rainbow); trashTornado
    // + sewerGeyser are new v5.4 natives. Starter = the neon beam (rainbow).
    weapons: ['rainbow', 'trashTornado', 'sewerGeyser'], starter: 'rainbow',
    roster: [
      { id: 'vacuum',   archetype: 'tank',   name: 'Robot Vacuum',    hpMul: 1.5,  speedMul: 0.85, flags: ['lineCharge'] },
      { id: 'ratDrone', archetype: 'normal', name: 'Rat-Catcher Drone', hpMul: 1,  speedMul: 1.05, flags: [] },
      { id: 'pigeon',   archetype: 'fast',   name: 'Pigeon',          hpMul: 0.7,  speedMul: 1.2,  flags: [] },
    ],
    eliteFlags: ['spawner'],              // exterminator-van elites periodically disgorge minions
    // Signature: traffic lanes (run.lanes) — a marked band is telegraphed, then a vehicle sweeps
    // it end to end, deadly to the player AND to enemies. All tuning is in TRAFFIC_* below; the
    // per-chapter knob is how many lanes may be live at once.
    signature: { type: 'traffic', lanes: 2 },
    obstacles: { count: 16, minR: 22, maxR: 42, minDist: 220 }, // hydrants / dumpsters / cones
    // ---- render-only (v5.4) ---- night street: wet asphalt showing between concrete slabs, cold
    // grey floor, a neon-lit slime monster (no tail). Enemy silhouettes baked per rosterId
    // (vacuum/ratDrone/pigeon). render.js also draws run.lanes (hazard-striped band -> headlights).
    render: {
      bgColor: 0x2c2f38,    // wet night asphalt between the pavement slabs
      floorTint: 0x9aa0ac,  // cold concrete grey multiply on the floor sprites
      playerTint: 0x9ef0c8, // neon-sign green — an urban monster lit by the storefronts
      tail: false,
    },
  },
  skies: {
    name: 'The Skies', tagline: 'they brought the air force', icon: '🌩️',
    weapons: ['roar', 'tailSwipe', 'debrisToss'], starter: 'roar',
    roster: [
      { id: 'jet',        archetype: 'fast',   name: 'Fighter Jet', hpMul: 0.8, speedMul: 1.1,  flags: ['strafe'] },
      { id: 'helicopter', archetype: 'normal', name: 'Helicopter',  hpMul: 1.2, speedMul: 0.9,  flags: ['missileVolley'] },
      { id: 'tankColumn', archetype: 'tank',   name: 'Tank Column', hpMul: 1.8, speedMul: 0.55, flags: ['artillery'] },
    ],
    eliteFlags: ['artillery'],            // AA-turret elites shell you too, just harder (see ARTILLERY_*)
    // Signature: bombardment (area denial) — telegraphed artillery circles rain on the player's
    // area CONTINUOUSLY, independent of the artillery-flagged roster. Both feed run.bombs (the
    // existing volatile-bomb array: telegraph fuse -> explode, damages player AND enemies).
    // `rate` = seconds between bombardment volleys; the rest is BOMBARDMENT_* below.
    signature: { type: 'bombardment', rate: 2.6 },
    obstacles: { count: 13, minR: 30, maxR: 60, minDist: 240 }, // building rubble — fewer but chunkier
    // ---- render-only (v5.4) ---- you are the kaiju and the camera zoomed OUT: pale open sky
    // between shattered concrete, a bright rubble floor, a green kaiju with a heavy tail. Read as
    // the brightest, most washed-out biome (daylight at altitude). rosterId: jet/helicopter/tankColumn.
    render: {
      bgColor: 0x6f9ecf,    // open daylight sky showing between the rubble
      floorTint: 0xc9d6e4,  // pale shattered-concrete multiply on the floor sprites
      playerTint: 0x7ad07a, // classic rubber-suit kaiju green
      tail: true,
      tailTint: 0x5fb05f,   // a heavier, darker kaiju tail (tailSwipe's business end)
    },
  },
  beyond: {
    name: 'The Beyond', tagline: 'you were never local', icon: '🌌',
    // Black-Hole Vortex comes home here (id kept as 'hole', see WEAPONS.hole); realityShard +
    // tesseractBeam are new v5.4 natives. Starter = the reality shard.
    weapons: ['realityShard', 'hole', 'tesseractBeam'], starter: 'realityShard',
    roster: [
      { id: 'blinker',    archetype: 'tank',   name: 'Glitch Blinker', hpMul: 1.4,  speedMul: 0.7, flags: ['blink'] },
      { id: 'flicker',    archetype: 'normal', name: 'Phase Flicker',  hpMul: 0.9,  speedMul: 1,   flags: ['phase'] },
      { id: 'swarmDrone', archetype: 'fast',   name: 'Swarm Drone',    hpMul: 0.75, speedMul: 1.25, flags: [] },
    ],
    eliteFlags: ['pullBeam'],             // UFO elites open an abduction beam that drags the player in
    // Signature: gravity wells (run.wells) — persistent field entities that BEND every projectile
    // in flight, the player's (run.bullets/homingShots/lobs) and the enemies' (run.enemyShots)
    // alike. They never damage anything; they only curve. `wells` = how many are alive at once.
    signature: { type: 'gravity', wells: 4 },
    obstacles: { count: 11, minR: 28, maxR: 55, minDist: 240 }, // asteroid chunks
    // ---- render-only (v5.4) ---- deep space: near-black violet void between the asteroid crust,
    // a cold violet floor, a luminous cosmic blob (no tail — you're a shape, not an animal any
    // more). eliteIridescent gives UFO elites the same statusless shimmer the pond's soap bubbles
    // use. rosterId: blinker/flicker/swarmDrone.
    render: {
      bgColor: 0x120a26,    // deep violet-black void showing between the asteroid crust
      floorTint: 0x6a5fa0,  // cold violet multiply — dead rock lit only by starlight
      playerTint: 0xe0b0ff, // luminous cosmic violet-white for the blob
      tail: false,
      eliteIridescent: [0xbfffe8, 0xd9c0ff, 0xffe8bf], // pale hues UFO elites cycle through
    },
  },
}
// Drift-current visualization (v5.2, render.js): world-space flow streaks that sample the REAL
// currentForce field (sim.js) and advect along it, exaggerated for legibility over the gentle sim push.
export const CURRENT_VIS = {
  count: 40,          // streaks alive at once (world-space, pooled)
  speedMul: 3.6,      // exaggeration over the sim's gentle push so the flow direction reads
  life: 3.0,          // s a streak lives before fading out and respawning in view
  lifeJitter: 0.5,    // ± fraction randomising each streak's life so they don't pulse in unison
  fadeIn: 0.5,        // s ramp up from spawn
  fadeOut: 0.9,       // s ramp down before respawn
  margin: 90,         // px past the viewport a streak may stray before it respawns in view
  lenPx: 34,          // base streak length (long axis)
  widthPx: 7,         // base streak width
  stretchPerSpeed: 0.02, // extra length multiplier per px/s of exaggerated flow speed
  tint: 0xa8fbef,     // saturated teal-white — reads on the murky pond floor (pale washes out, dark vanishes)
  alpha: 0.5,         // peak alpha at full fade-in
  rippleEvery: 3.2,   // s between "ripple train" accents (3 streaks single-file); 0 disables
}
export const nextChapter = (id) => CHAPTER_ORDER[CHAPTER_ORDER.indexOf(id) + 1] ?? null
// Date-seeded over SHIPPED chapters (CHAPTER_ORDER); reuses the FNV-1a + mulberry32 helpers
// dailyMutators already uses (below), with a distinct salt ('chapter') so the two daily picks
// are independent draws from the same date key.
export const dailyChapter = (dateKey) => CHAPTER_ORDER[hashString(dateKey + 'chapter') % CHAPTER_ORDER.length]

// ---- Chapter behavior flags (v5.0 task 3, see sim.js) -------------------------------
// Maps a roster entry's `archetype` (config.js CHAPTERS[id].roster, see above) onto the
// existing spawn-type keys (ENEMIES above) that drive its base hp/speed/dmg/radius/xp —
// archetypes are just the theme-agnostic vocabulary spawnEnemy uses to pick a roster skin.
export const ARCHETYPE_TYPE = { normal: 'drone', tank: 'tank', fast: 'wisp' }
// The inverse (spawn type -> archetype), used by spawnEnemy to pick which roster entries a
// given wave-table spawn may wear. Do NOT index ARCHETYPE_TYPE by a type to get this: it
// silently "worked" for tank (its own inverse) and fell through to 'normal' for drone (right
// by luck) and wisp (WRONG) — which made every 'fast' roster entry unreachable by natural
// spawning until v5.5.
export const TYPE_ARCHETYPE = Object.fromEntries(Object.entries(ARCHETYPE_TYPE).map(([a, t]) => [t, a]))

// latch (e.g. body's antibody): on contact the enemy applies a move-speed debuff to the
// player then dies (spends itself) instead of dealing normal contact damage — see
// stepContactDamage in sim.js.
export const LATCH_SLOW_T = 0.9    // s, duration of the player's movement-speed debuff
export const LATCH_SLOW_MUL = 0.55 // player move speed multiplier while run.player.slowT > 0

// split (e.g. pond's amoeba): on death, spawns children at reduced hp/radius; children never
// re-split (see e._splitChild in sim.js's dealDamage death branch / spawnSplitChildren).
export const SPLIT_CHILD_COUNT = 2
export const SPLIT_HP_FRAC = 0.45     // child hp/maxHP, as a fraction of the parent's maxHP
export const SPLIT_RADIUS_FRAC = 0.7  // child radius, as a fraction of the parent's radius

// dashBurst (e.g. pond's tadpole): alternates idle (slow) <-> dash (fast) toward the
// player, both still along the normal seek direction — see stepEnemyMovement in sim.js.
export const DASH_IDLE_T = 1.1        // s, idle phase duration
export const DASH_T = 0.5             // s, dash phase duration
export const DASH_IDLE_SPEED_MUL = 0.4
export const DASH_SPEED_MUL = 2.6

// Pools (run.pools, see state.js): a shared array of {x, y, r, t, dps} zones that damage the
// PLAYER only (dot-flagged 'hurt' events), ticked every STATUS_TICK like other DoTs, and
// removed once t <= 0. Fed by two elite flags below.
// acidPool (body's pill elites): a pool left where the elite died.
export const ACID_R = 70
export const ACID_DUR = 3
export const ACID_DPS = 8
// soapTrail (pond's soap-bubble elites): pool nodes dropped periodically while alive.
export const SOAP_INTERVAL = 0.35 // s between dropped trail nodes
export const SOAP_R = 26
export const SOAP_DUR = 2.5
export const SOAP_DPS = 6

// Obstacles (run.obstacles, see state.js/createRun): circular colliders that push the player
// and enemies out (never projectiles), rejection-sampled from each chapter's `obstacles` config
// ({count, minR, maxR, minDist}, minDist measured from the run's origin) at createRun. These two
// are generic placement tunables shared by every chapter's obstacle field (not per-chapter data):
export const OBSTACLE_FIELD_RADIUS = 900       // px, obstacles scatter within this radius of the origin
export const OBSTACLE_MIN_GAP = 40             // px, min gap between two obstacles' edges (beyond their radii)
export const OBSTACLE_PLACEMENT_ATTEMPTS = 200 // rejection-sampling attempts per obstacle before giving up

// ---- Garden chapter behavior flags (v5.3, see sim.js) --------------------------------------
// pheromones signature (garden): a dying 'trailFollow' ant drops a fading node into run.trails;
// a living 'trailFollow' ant within PHEROMONE_FOLLOW_RADIUS of ANY node gets a seek-speed bonus
// (design: "others follow & accelerate on" the trail). All of this is gated on the run's chapter
// having a signature of type 'pheromones' (config CHAPTERS[id].signature) so future chapters' ants
// can differ. run.trails entries: { x, y, t } (t = seconds of life left; stepped like run.pools).
export const PHEROMONE_LIFE = 4            // s, a dropped trail node's lifetime
export const PHEROMONE_FOLLOW_RADIUS = 130 // px, node proximity that grants an ant the speed bonus
export const PHEROMONE_SPEED_MUL = 1.35    // seek-speed multiplier while following a trail

// diveBomb (garden's wasps): a hover -> telegraph -> straight accelerating dive -> recover cycle
// (state on e._diveState/_diveT/_diveDirX/_diveDirY/_diveElapsed). Every speed below is a
// multiplier of the enemy's OWN speed; the dive ramps from _START to _END (accelerating line).
export const DIVE_STANDOFF = 220        // px, hover distance held from the target
export const DIVE_HOVER_T = 1.4         // s, hover phase before a dive
export const DIVE_TELEGRAPH_T = 0.5     // s, telegraphed pause (dive aim locks at its start)
export const DIVE_T = 0.55              // s, dive phase (straight, accelerating, overshoots)
export const DIVE_RECOVER_T = 1.0       // s, recover drift before hovering again
export const DIVE_HOVER_SPEED_MUL = 0.9 // repositioning speed while hovering toward standoff
export const DIVE_SPEED_START = 2.0     // dive speed multiplier at dive start
export const DIVE_SPEED_END = 5.0       // ...ramped to this by dive end (dive distance > standoff -> overshoots)
export const DIVE_RECOVER_SPEED_MUL = 0.3
export const DIVE_HOVER_DEADZONE = 8    // px band around standoff where the wasp holds still (no jitter)

// webZone (garden's spiders): drop slow-zone web patches into run.webs while alive (NOT elite-gated,
// unlike soapTrail). Webs slow the PLAYER only (stepPlayerMovement) — they stack with the latch
// debuff via a MIN of the two multipliers (the stronger slow wins, they don't multiply together).
// run.webs entries: { x, y, r, t } (t = seconds of life left; stepped like run.pools, but no damage).
export const WEB_INTERVAL = 1.6  // s between dropped web patches
export const WEB_R = 72          // px, web patch radius
export const WEB_DUR = 4         // s, web patch lifetime
export const WEB_SLOW_MUL = 0.6  // player move-speed multiplier while standing in a web

// sprayStrip (garden's pesticide-drone elites): periodically mark a telegraphed rectangular strip
// centered on the player (run.strips), reusing the volatile-bomb telegraph idea. After `fuse`
// telegraph seconds the strip goes live and ticks dot-flagged damage to the PLAYER standing inside
// it (like run.pools) for SPRAY_ACTIVE seconds. run.strips entries:
// { x, y, angle, len, w, fuse, t, dps } (fuse counts down first, then t counts down while live).
export const SPRAY_INTERVAL = 3.5  // s between marked strips
export const SPRAY_FUSE = 0.9      // s telegraph before a strip goes live (no damage yet)
export const SPRAY_LEN = 340       // px, strip length
export const SPRAY_W = 92          // px, strip width
export const SPRAY_ACTIVE = 1.2    // s the live strip keeps ticking after its fuse
export const SPRAY_DPS = 10        // damage/second to a player standing in a live strip

// ---- Undergrowth chapter behavior flags (v5.4, see sim.js) ----------------------------------
// pounce (undergrowth's cat): a hold -> telegraph -> flat leap -> land/recover cycle, state on
// e._pounceState ('hold'|'aim'|'leap'|'land') / _pounceT (s left in the phase) / _pounceDirX,
// _pounceDirY (leap heading, LOCKED at the START of 'aim' so the leap is dodgeable) — same
// bookkeeping idiom as diveBomb's _diveState/_diveT/_diveDirX/_diveDirY.
//   hold:  seeks the player normally at POUNCE_HOLD_SPEED_MUL until within POUNCE_RANGE, then 'aim'
//   aim:   STOPS dead for POUNCE_AIM_T (the telegraph; heading locks here — render draws the arc)
//   leap:  POUNCE_LEAP_T of straight flight at POUNCE_LEAP_SPEED_MUL, ignoring the player's moves
//          (it overshoots if you dodge). Contact damage is normal during the leap — no bonus.
//   land:  POUNCE_LAND_T frozen (the punish window: it can't move or deal contact damage), then 'hold'
// Damages: the PLAYER only, and only via ordinary contact damage (stepContactDamage) — a pounce
// has no attack of its own. It reads/writes nothing on run.*.
export const POUNCE_RANGE = 260          // px, distance at which a holding cat commits to a leap
export const POUNCE_HOLD_SPEED_MUL = 0.8 // seek speed while stalking (multiplier of the cat's OWN speed)
export const POUNCE_AIM_T = 0.55         // s, telegraphed crouch (dead stop; heading locks at its start)
export const POUNCE_LEAP_T = 0.40        // s, leap phase (straight, no steering)
export const POUNCE_LEAP_SPEED_MUL = 6.0 // leap speed multiplier — fast enough that only a dodge beats it
export const POUNCE_LAND_T = 0.70        // s frozen after a leap (the free-hits window)

// aerialStrike (undergrowth's owl): circles out of reach, marks the ground, then drops. State on
// e._airState ('circle'|'mark'|'strike'|'climb') / _airT / _airAngle (its angle on the circle) /
// _airTargX, _airTargY (the marked point, LOCKED at the start of 'mark').
//   circle: orbits the player at AERIAL_RADIUS px, advancing _airAngle at AERIAL_ORBIT_SPEED rad/s
//           (position is SET on the circle, not seeked), for AERIAL_CIRCLE_T, then 'mark'
//   mark:   keeps circling for AERIAL_MARK_T while _airTargX/_airTargY hold the player's position
//           at the phase's start — this is the shadow telegraph render draws on the ground
//   strike: AERIAL_STRIKE_T of straight flight from wherever it is to the marked point at
//           AERIAL_STRIKE_SPEED_MUL of its own speed; it does NOT re-aim
//   climb:  AERIAL_CLIMB_T drifting back out to AERIAL_RADIUS, then 'circle'
// Damages: the PLAYER only, via ordinary contact damage — same as pounce, no attack of its own.
// While circling/climbing the owl is AERIAL_UNTOUCHABLE-gated: if true it takes no damage and
// deals none (it's overhead); it's only fightable during 'mark'/'strike'.
export const AERIAL_RADIUS = 240          // px, the circling standoff
export const AERIAL_ORBIT_SPEED = 1.1     // rad/s around the player while circling
export const AERIAL_CIRCLE_T = 2.0        // s of plain circling before a mark
export const AERIAL_MARK_T = 0.8          // s of telegraph (the shadow lands here)
export const AERIAL_STRIKE_T = 0.45       // s, the dive itself
export const AERIAL_STRIKE_SPEED_MUL = 5.0
export const AERIAL_CLIMB_T = 1.2         // s, recover/climb back to the circle
export const AERIAL_UNTOUCHABLE = true    // owls can't be hit (or hit you) while 'circle'/'climb'

// flashlightCone (undergrowth's exterminator elites): sweeps a cone of light that ENRAGES other
// enemies. State on e._coneAngle (current sweep heading, rad) — it sweeps back and forth across
// FLASHLIGHT_SWEEP rad centered on the direction to the player, at FLASHLIGHT_SWEEP_SPEED rad/s.
// Every frame, any OTHER enemy whose center falls in the sector (FLASHLIGHT_ARC rad,
// FLASHLIGHT_RANGE px, centered on _coneAngle, origin = the elite) gets e.enrageT =
// FLASHLIGHT_ENRAGE_T; while e.enrageT > 0 that enemy's seek speed is × FLASHLIGHT_SPEED_MUL and
// its contact damage × FLASHLIGHT_DMG_MUL. Ticks down like fearT.
// Damages: NOTHING directly — the cone hurts neither the player nor enemies. It is pure buff +
// telegraph (the threat is what it turns the swarm into). No run.* array; render reads _coneAngle.
export const FLASHLIGHT_RANGE = 320
export const FLASHLIGHT_ARC = 0.55         // rad, the cone's half-angle
export const FLASHLIGHT_SWEEP = 1.4        // rad, total sweep span (± half of this around the player-facing)
export const FLASHLIGHT_SWEEP_SPEED = 1.0  // rad/s
export const FLASHLIGHT_ENRAGE_T = 2.0     // s of enrage granted (refreshed every frame in the cone)
export const FLASHLIGHT_SPEED_MUL = 1.5
export const FLASHLIGHT_DMG_MUL = 1.4

// predators signature (undergrowth): snap traps. run.traps is seeded ONCE at createRun with
// signature.traps entries, rejection-sampled exactly like run.obstacles (same
// OBSTACLE_FIELD_RADIUS / OBSTACLE_MIN_GAP / OBSTACLE_PLACEMENT_ATTEMPTS, min SNAP_TRAP_MIN_DIST
// from the origin) — traps do NOT block movement, so they may overlap obstacles freely.
// run.traps entries: { x, y, r, armed, cd } — armed (bool) = ready to snap; cd (s) = time left
// until it re-arms (0 while armed). Every frame, an ARMED trap whose radius r contains the center
// of the player OR of any enemy snaps: it damages THAT ONE entity for SNAP_TRAP_DMG (BOTH sides —
// this is the whole point: kite the swarm over them), sets armed=false / cd=SNAP_TRAP_REARM, and
// emits {type:'explode', x, y, radius:r}. Player damage goes through the normal armor/
// contactDmgTakenMul path and respects player.invuln; enemy damage goes through dealDamage.
// Traps are permanent field furniture — they never expire, they only re-arm.
export const SNAP_TRAP_R = 30          // px, trigger radius
export const SNAP_TRAP_DMG = 24        // damage to whichever single entity trips it (player or enemy)
export const SNAP_TRAP_REARM = 4.0     // s before a sprung trap can snap again
export const SNAP_TRAP_MIN_DIST = 200  // px, min distance from the run's origin (don't spawn one under the player)

// ---- City chapter behavior flags (v5.4, see sim.js) ------------------------------------------
// lineCharge (city's robot vacuums): line up -> telegraph a straight lane -> charge down it.
// State on e._chargeState ('track'|'lock'|'charge'|'stall') / _chargeT / _chargeDirX, _chargeDirY
// (heading, LOCKED at the start of 'lock').
//   track:  seeks normally at LINE_CHARGE_TRACK_SPEED_MUL until within LINE_CHARGE_RANGE -> 'lock'
//   lock:   stops for LINE_CHARGE_LOCK_T; heading locks at its start (render draws the lane —
//           LINE_CHARGE_W wide, LINE_CHARGE_LEN long, from the vacuum along the heading)
//   charge: LINE_CHARGE_T of straight flight at LINE_CHARGE_SPEED_MUL, no steering
//   stall:  LINE_CHARGE_STALL_T motionless (spinning down; no contact damage) -> 'track'
// Damages: the PLAYER only, via ordinary contact damage. No run.* array; render reads the state.
export const LINE_CHARGE_RANGE = 340
export const LINE_CHARGE_TRACK_SPEED_MUL = 0.85
export const LINE_CHARGE_LOCK_T = 0.6
export const LINE_CHARGE_T = 0.8
export const LINE_CHARGE_SPEED_MUL = 5.5
export const LINE_CHARGE_STALL_T = 0.9
export const LINE_CHARGE_LEN = 520     // px, telegraph lane length (render-only; the charge itself is speed×time)
export const LINE_CHARGE_W = 48        // px, telegraph lane width (render-only)

// spawner (city's exterminator-van elites): every SPAWNER_INTERVAL seconds, spawns SPAWNER_COUNT
// enemies of the chapter's SPAWNER_ARCHETYPE roster entry, scattered SPAWNER_SCATTER px around
// itself (spawnEnemy's normal path, so they get the chapter's roster skin/flags and the run's
// current hp/speed scaling — they are NOT elites). Emits {type:'explode', x, y, radius} at each
// spawn point so the pop reads. Capped: a spawner won't push past MAX_ALIVE.
// Damages: nothing directly — it makes more of the things that do.
export const SPAWNER_INTERVAL = 3.5
export const SPAWNER_COUNT = 3
export const SPAWNER_ARCHETYPE = 'fast'  // which of the chapter roster's archetypes it disgorges (pigeons)
export const SPAWNER_SCATTER = 70        // px, spawn scatter around the van

// traffic signature (city): run.lanes. Up to signature.lanes are alive at once; whenever fewer
// exist, sim rolls a new one every TRAFFIC_INTERVAL seconds. A lane is a band of length
// TRAFFIC_LEN and width TRAFFIC_W at a random angle, positioned so it CROSSES the player's current
// position (center offset perpendicular by up to ±TRAFFIC_OFFSET px, so it's dodgeable and can
// never be "spawned on top of you" unavoidably).
// run.lanes entries: { x, y, angle, len, w, phase, t, carT, dmg }
//   x, y     = the lane band's CENTER; angle = its direction; len/w = its extent
//   phase    = 'warn' | 'sweep'
//   t        = seconds left in the current phase (TRAFFIC_WARN, then TRAFFIC_SWEEP)
//   carT     = 0..1, the vehicle's progress along the lane — sim advances it during 'sweep'
//              only (carT = 1 - t/TRAFFIC_SWEEP). The vehicle's center is
//              (x, y) + dir × ((carT - 0.5) × len) where dir = (cos angle, sin angle).
//   dmg      = TRAFFIC_DMG, snapshotted so a mid-run retune can't desync live lanes
//   hitIds   = Set<enemyId>, sim-internal: one hit per enemy per pass
// 'warn': the band is drawn hazard-striped, NOTHING is damaged. 'sweep': a TRAFFIC_CAR_LEN ×
// TRAFFIC_CAR_W box centered on the vehicle damages BOTH sides — the player (normal armor/
// contactDmgTakenMul path, gated by player.invuln, once per pass is implicit via invuln) and every
// enemy it touches (dealDamage, once each via hitIds) — plus TRAFFIC_KB knockback along `angle`.
// The lane is removed when t hits 0 in 'sweep'.
export const TRAFFIC_INTERVAL = 3.0   // s between lane rolls (while under signature.lanes alive)
export const TRAFFIC_WARN = 1.3       // s of harmless telegraph before the vehicle enters
export const TRAFFIC_SWEEP = 1.1      // s for the vehicle to traverse the full lane length
export const TRAFFIC_LEN = 1100       // px, lane length (comfortably longer than a screen)
export const TRAFFIC_W = 130          // px, lane band width
export const TRAFFIC_OFFSET = 90      // px, max perpendicular offset of the band from the player
export const TRAFFIC_CAR_LEN = 150    // px, the vehicle's hitbox length (along `angle`)
export const TRAFFIC_CAR_W = 110      // px, the vehicle's hitbox width (across `angle`)
export const TRAFFIC_DMG = 34         // damage to the player AND to each enemy the vehicle hits
export const TRAFFIC_KB = 420         // knockback applied along the lane to struck enemies

// ---- Skies chapter behavior flags (v5.4, see sim.js) -----------------------------------------
// strafe (skies' fighter jets): flies straight passes THROUGH the player rather than chasing.
// State on e._strafeState ('bank'|'run') / _strafeT / _strafeDirX, _strafeDirY (LOCKED at the
// start of each 'run').
//   bank: STRAFE_BANK_T of drifting toward a point STRAFE_STANDOFF px from the player on a random
//         bearing, at STRAFE_BANK_SPEED_MUL. At its END the heading locks onto the player.
//   run:  STRAFE_RUN_T of straight flight at STRAFE_RUN_SPEED_MUL, no steering (it flies past and
//         well beyond you), then back to 'bank'.
// Damages: the PLAYER only, via ordinary contact damage. No run.* array.
export const STRAFE_STANDOFF = 420
export const STRAFE_BANK_T = 1.3
export const STRAFE_BANK_SPEED_MUL = 1.6
export const STRAFE_RUN_T = 1.0
export const STRAFE_RUN_SPEED_MUL = 4.5

// missileVolley (skies' helicopters): holds a standoff and shoots. State on e._volleyT (s until
// the next volley) / e._volleyLeft (missiles remaining in the current volley) / e._volleyGapT.
//   Movement: seeks to hold MISSILE_STANDOFF px from the player at MISSILE_HOVER_SPEED_MUL
//             (in/out, with the same MISSILE_DEADZONE band diveBomb uses, so it doesn't jitter).
//   Firing:   every MISSILE_INTERVAL s it fires MISSILE_COUNT shots MISSILE_GAP apart, each a
//             run.enemyShots entry aimed at the player's CURRENT position.
// run.enemyShots entries: { x, y, vx, vy, r, dmg, life, turnRate } — the ONLY enemy-owned
// projectile array. Sim steps it: homes toward the player at turnRate rad/s, expires at life <= 0,
// and on overlapping the player (r + PLAYER.radius) damages the PLAYER only (normal armor/
// contactDmgTakenMul path, respects invuln) and emits {type:'explode', x, y, radius: MISSILE_BLAST}.
// It never damages enemies. It IS a projectile for the beyond's gravity wells (they bend it).
// Damages: the PLAYER only.
export const MISSILE_STANDOFF = 300
export const MISSILE_HOVER_SPEED_MUL = 0.9
export const MISSILE_DEADZONE = 10      // px band around the standoff where it holds still (cf. DIVE_HOVER_DEADZONE)
export const MISSILE_INTERVAL = 3.2     // s between volleys
export const MISSILE_COUNT = 3          // missiles per volley
export const MISSILE_GAP = 0.16         // s between missiles within one volley
export const MISSILE_SPEED = 240        // px/s
export const MISSILE_TURN = 1.6         // rad/s homing (slow — outrunning them is the counterplay)
export const MISSILE_LIFE = 4.0         // s before a missile fizzles (removed, no blast)
export const MISSILE_R = 8              // px, missile hit radius
export const MISSILE_DMG = 14
export const MISSILE_BLAST = 40         // px, explode-event radius on impact (visual only — no splash)

// artillery (skies' tank columns AND its AA-turret elites): a slow mover that shells the player
// from wherever it stands. State on e._shellT (s until the next shell).
// Every ARTILLERY_INTERVAL s it pushes a run.bombs entry (the EXISTING volatile-bomb array —
// { x, y, radius, fuse, duration, dmg }) at the player's PREDICTED position: player position +
// player velocity × ARTILLERY_LEAD. So it telegraphs for ARTILLERY_FUSE seconds, then explodes,
// damaging the PLAYER and ENEMIES alike (stepBombs already does exactly this — no new code path).
// Movement is otherwise a plain slow seek. Elites use the same flag with ARTILLERY_ELITE_* below.
export const ARTILLERY_INTERVAL = 3.0
export const ARTILLERY_FUSE = 1.1       // s of telegraph (stepBombs grows the warning from fuse/duration)
export const ARTILLERY_RADIUS = 95      // px, blast radius
export const ARTILLERY_DMG = 22
export const ARTILLERY_LEAD = 0.35      // s of player-velocity lead baked into the aim (strafe to beat it)
export const ARTILLERY_ELITE_INTERVAL = 1.8  // AA-turret elites shell nearly twice as often...
export const ARTILLERY_ELITE_RADIUS = 130    // ...wider...
export const ARTILLERY_ELITE_DMG = 30        // ...and harder.

// bombardment signature (skies): continuous area denial, INDEPENDENT of the artillery roster —
// this is the sky itself shelling you. Every signature.rate seconds, pushes BOMBARDMENT_COUNT
// run.bombs entries (same array/step as artillery above, so it's the same explode-both-sides
// contract) at uniformly random points within BOMBARDMENT_SPREAD px of the player.
export const BOMBARDMENT_COUNT = 2
export const BOMBARDMENT_SPREAD = 280   // px, scatter radius around the player
export const BOMBARDMENT_FUSE = 1.2     // s of telegraph
export const BOMBARDMENT_RADIUS = 85    // px, blast radius
export const BOMBARDMENT_DMG = 18

// ---- Beyond chapter behavior flags (v5.4, see sim.js) ----------------------------------------
// blink (beyond's glitch blinkers): teleports instead of closing distance. State on e._blinkT
// (s until the next blink). Moves at BLINK_CRAWL_SPEED_MUL of its own speed between blinks (it
// barely walks — the blink IS its movement). Every BLINK_INTERVAL s, if further than
// BLINK_MIN_DIST from the player, it jumps BLINK_DIST px straight toward them (clamped so it never
// lands closer than BLINK_MIN_DIST, and never inside an obstacle — retry along the same heading at
// BLINK_DIST/2, else skip this blink) and emits {type:'explode', x, y, radius: BLINK_FX_R} at BOTH
// the departure and arrival points so the pop reads.
// Damages: the PLAYER only, via ordinary contact damage. No run.* array.
export const BLINK_INTERVAL = 2.2
export const BLINK_DIST = 220
export const BLINK_MIN_DIST = 120       // px, it never blinks to closer than this (no free contact hit)
export const BLINK_CRAWL_SPEED_MUL = 0.25
export const BLINK_FX_R = 30            // px, explode-event radius at the departure/arrival points (visual only)

// phase (beyond's phase flickers): a windowed-vulnerability enemy. State on e._phaseSolid (bool) /
// e._phaseT (s left in the current window). Alternates PHASE_SOLID_T solid <-> PHASE_GHOST_T
// ghosted, forever, starting solid with _phaseT randomised across PHASE_SOLID_T at spawn so a wave
// doesn't blink in unison.
//   solid:  ordinary enemy in every respect.
//   ghost:  takes NO damage (dealDamage returns early — no numbers, no status, no crit), deals NO
//           contact damage, ignores obstacles (passes through), and moves at PHASE_GHOST_SPEED_MUL.
// Status effects already on it (ignite/venom/chill) keep ticking DOWN but deal no damage while
// ghosted. render.js reads _phaseSolid for the alpha.
// Damages: the PLAYER only (while solid), via ordinary contact damage. No run.* array.
export const PHASE_SOLID_T = 1.6
export const PHASE_GHOST_T = 1.0
export const PHASE_GHOST_SPEED_MUL = 1.4  // it hurries while it can't be punished

// pullBeam (beyond's UFO elites): an abduction beam. State on e._beamState ('idle'|'beam') /
// e._beamT. Every PULL_BEAM_INTERVAL s it opens a beam for PULL_BEAM_T seconds: while open, if the
// player is within PULL_BEAM_RANGE, they are dragged toward the UFO at PULL_BEAM_FORCE px/s
// (applied in stepPlayerMovement AFTER their own input, so you can fight it but not fully beat it
// — PULL_BEAM_FORCE is deliberately under PLAYER.baseSpeed) and take PULL_BEAM_DPS dot-flagged
// damage every STATUS_TICK (same path as run.pools). The UFO holds still while beaming.
// Damages: the PLAYER only. No run.* array; render reads _beamState/_beamT plus the UFO->player line.
export const PULL_BEAM_INTERVAL = 5.0
export const PULL_BEAM_T = 2.0
export const PULL_BEAM_RANGE = 380
export const PULL_BEAM_FORCE = 150      // px/s toward the UFO (< PLAYER.baseSpeed 220, so you can walk out)
export const PULL_BEAM_DPS = 7
export const PULL_BEAM_W = 90           // px, beam width (render-only; the pull is a radius test)

// gravity signature (beyond): run.wells. signature.wells entries are seeded ONCE at createRun,
// rejection-sampled like run.obstacles (same OBSTACLE_FIELD_RADIUS/OBSTACLE_PLACEMENT_ATTEMPTS,
// GRAVITY_MIN_DIST from the origin, GRAVITY_MIN_GAP between two wells' edges). They are permanent
// field furniture: they never expire, never move, never damage, and never block movement.
// run.wells entries: { x, y, r, g } — r = the influence radius, g = GRAVITY_FORCE.
// Every frame, for EVERY projectile in flight — the player's (run.bullets, run.homingShots,
// run.lobs) AND the enemies' (run.enemyShots) — each well within r of it applies an acceleration
// of g × (1 - dist/r) px/s² toward (x, y), added to the projectile's velocity. Speed is then
// renormalised back to the projectile's own speed, so a well BENDS a projectile's path without
// making it faster or slower (that's the whole mechanic: curvature, not chaos). Beams (run.beams),
// orbitals (run.orbs/run.debris), zones (run.pools/blooms/geysers) and novas are NOT projectiles
// and are untouched. Enemies and the player are untouched too — this bends shots, not bodies.
export const GRAVITY_FORCE = 900        // px/s² at the well's center, falling linearly to 0 at r
export const GRAVITY_WELL_R = 190       // px, influence radius
export const GRAVITY_MIN_DIST = 260     // px, min distance from the run's origin
export const GRAVITY_MIN_GAP = 120      // px, min gap between two wells' edges

// ---- Gold sinks: pre-run consumables + level-up rerolls (see run fields in state.js) ----
export const CONSUMABLES = {
  revive:    { name: 'Revive Token', icon: '💖', desc: 'Come back once at 50% HP', cost: 150 },
  headstart: { name: 'Head Start',   icon: '🧪', desc: 'Start with 2 level-ups banked', cost: 60 },
  charged:   { name: 'Charged Core', icon: '🔋', desc: 'Starting weapon begins at Lv 2', cost: 80 },
}
export const REVIVE_HP_FRAC = 0.5      // hp restored on revive, as a fraction of maxHP
export const REVIVE_INVULN = 2         // s of invulnerability after reviving
export const REVIVE_SHOVE_RADIUS = 300 // px, radial knockback zone on revive
export const REVIVE_SHOVE_KB = 500     // knockback velocity applied to enemies in the zone
export const REROLL_BASE_COST = 10     // coins, first reroll of a run
export const REROLL_COST_MUL = 1.5     // cost multiplier per reroll already used this run
export const rerollCost = (used) => Math.ceil(REROLL_BASE_COST * Math.pow(REROLL_COST_MUL, used))

// ---- Mutators (pre-run modifiers; see run.mods in state.js) ----
export const MUTATORS = {
  overtime: { name: 'Overtime Shift',    icon: '🏭', desc: 'Way more anomalies, way more XP.',            effects: { spawnMul: 1.4, xpMul: 1.3 } },
  bulky:    { name: 'Bulky Batch',       icon: '🫧', desc: 'Tougher enemies, richer coin drops.',          effects: { enemyHpMul: 1.5, coinMul: 1.6 } },
  caffeine: { name: 'Caffeinated Swarm', icon: '☕', desc: 'Faster enemies, faster leveling.',             effects: { enemySpeedMul: 1.25, xpMul: 1.25 } },
  eliterush:{ name: 'Elite Convention',  icon: '👑', desc: 'Elites arrive twice as often, drop way more.', effects: { eliteEveryMul: 0.55, coinMul: 1.5 } },
  unstable: { name: 'Unstable Physics',  icon: '🌀', desc: 'Elemental infusions everywhere, weapons hit softer.', effects: { elementWeightMul: 3, playerDmgMul: 0.85 } },
  glass:    { name: 'Glass Goo',         icon: '💔', desc: 'You hit much harder but take much more.',      effects: { contactDmgTakenMul: 1.75, playerDmgMul: 1.35 } },
  sticky:   { name: 'Sticky Floor',      icon: '🍯', desc: 'You move slower, but pickups fly to you.',     effects: { playerSpeedMul: 0.85, magnetMul: 1.7 } },
  jumbo:    { name: 'Jumbo Anomalies',   icon: '🎈', desc: 'Big squishy enemies, bonus XP and coins.',     effects: { enemyRadiusMul: 1.25, enemyHpMul: 1.25, enemySpeedMul: 0.9, xpMul: 1.2, coinMul: 1.2 } },
}
// Every key mergeMutatorMods can produce, all defaulted to 1 (neutral) before mutator effects
// multiply in. sim.js applies each of these at one specific point — see sim.js's module doc.
const MUTATOR_MOD_KEYS = [
  'spawnMul', 'enemyHpMul', 'enemySpeedMul', 'enemyDmgMul', 'enemyRadiusMul',
  'contactDmgTakenMul', 'playerDmgMul', 'playerSpeedMul', 'coinMul', 'xpMul',
  'eliteEveryMul', 'elementWeightMul', 'magnetMul',
]
// Pure helper: given a list of mutator ids (run.mutators), returns the full run.mods object —
// every key above defaulted to 1, with each selected mutator's effects multiplied in. Unknown
// ids are ignored so a stale/typo'd id in a save never throws.
export function mergeMutatorMods(ids) {
  const mods = Object.fromEntries(MUTATOR_MOD_KEYS.map((k) => [k, 1]))
  for (const id of ids ?? []) {
    const mut = MUTATORS[id]
    if (!mut) continue
    for (const [k, v] of Object.entries(mut.effects)) mods[k] *= v
  }
  return mods
}

// ---- Daily Anomaly (deterministic daily mutator pair) ------------------------------
// A fixed number of mutators are "featured" each real-world day, the same for every
// player: dailyMutators(todayKey()) hashes the date string into a PRNG seed so the
// pick is stable across repeated calls/sessions without persisting anything.
export const DAILY_MUTATOR_COUNT = 2

// Local-date YYYY-MM-DD key (not UTC, so the daily set flips at local midnight for
// the player rather than at a possibly-yesterday UTC boundary).
export function todayKey() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Tiny FNV-1a-style string hash -> 32-bit seed.
function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// mulberry32: small deterministic PRNG (same construction test/sim-test.js uses to seed
// Math.random) — kept as a private, self-contained generator here so dailyMutators never
// depends on (or perturbs) the global Math.random stream.
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Deterministic: the same dateKey always returns the same DAILY_MUTATOR_COUNT distinct
// mutator ids (order is part of the result, but callers should treat it as a set).
export function dailyMutators(dateKey) {
  const rand = mulberry32(hashString(dateKey))
  const pool = Object.keys(MUTATORS)
  const picked = []
  for (let i = 0; i < DAILY_MUTATOR_COUNT && pool.length > 0; i++) {
    const idx = Math.floor(rand() * pool.length)
    picked.push(pool[idx])
    pool.splice(idx, 1)
  }
  return picked
}

// ---- Elite affixes (rolled at elite spawn; see enemy.affixes in state.js) ----------
export const ELITE_AFFIXES = {
  shielded:  { name: 'Shielded',    icon: '🛡️' },
  splitter:  { name: 'Splitter',    icon: '🧬' },
  volatile:  { name: 'Volatile',    icon: '💥' },
  pacer:     { name: 'Cheerleader', icon: '📣' },
  anchored:  { name: 'Anchored',    icon: '⚓' },
  frenzied:  { name: 'Frenzied',    icon: '😤' },
  gilded:    { name: 'Gilded',      icon: '👑' },
}
export const AFFIX_SECOND_AT = 150   // s; elites spawned after this roll 2 distinct affixes instead of 1
export const SHIELD_HP_FRAC = 0.5    // shielded: shield active while hp > maxHP * this fraction
export const SHIELD_DMG_MUL = 0.6    // shielded: incoming damage multiplier while the shield is up
export const SPLITTER_COUNT = 4      // splitter: wisps spawned around the corpse on death
export const VOLATILE_FUSE = 0.8     // s, volatile: delay between death and the bomb's detonation
export const VOLATILE_RADIUS = 120   // px, volatile: bomb blast radius
export const VOLATILE_DMG = 20       // volatile: damage dealt to the player (and enemies) caught in the blast
export const PACER_RADIUS = 160      // px, pacer: range within which other enemies get sped up
export const PACER_SPEED_MUL = 1.3   // pacer: speed multiplier applied to enemies within PACER_RADIUS
export const FRENZY_HP_FRAC = 0.3    // frenzied: speed boost kicks in once hp drops below this fraction of maxHP
export const FRENZY_SPEED_MUL = 1.6  // frenzied: speed multiplier once below FRENZY_HP_FRAC
export const GILDED_HP_MUL = 1.3     // gilded: extra maxHP/hp multiplier at spawn (stacks with ELITE.hpMul)
export const GILDED_COIN_MUL = 2     // gilded: death coin count multiplier (on top of ELITE.coins)
