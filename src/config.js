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
    desc: 'A searing crimson ray sweeps everything it touches.',
    icon: '🚨', rarity: 'mythic',
    // v5.6.13 (user): intervals lowered — L1 was 8.0s with a 2.2s beam, i.e. 5.8s of dead air per
    // cycle, which is unbearable as a STARTER (a starter is the player's only weapon for minutes).
    // Now 3.8s of downtime at L1, tightening to 1.4s at L5. Also re-skinned red (sith saber, not
    // rainbow) — that half lives in render.js's T.beam bake; id stays 'rainbow' everywhere.
    // v5.6.14 (user): DOUBLE-ENDED, Darth Maul style — every cast is 2 arms 180° apart (fireBeam),
    // so `length` is ONE blade and the full staff spans 2x it; lengths are shorter than the old
    // single beam's (240 vs 380 at L1) because the staff carries twice the coverage.
    levels: [
      { dmg: 12, tick: 0.15, interval: 6.0, duration: 2.2, rotSpeed: 2.6, width: 30, length: 240 },
      { dmg: 15, tick: 0.15, interval: 5.6, duration: 2.4, rotSpeed: 2.8, width: 32, length: 275 },
      { dmg: 18, tick: 0.14, interval: 5.2, duration: 2.6, rotSpeed: 3.0, width: 34, length: 310 },
      { dmg: 22, tick: 0.14, interval: 4.9, duration: 2.9, rotSpeed: 3.2, width: 36, length: 350 },
      { dmg: 26, tick: 0.13, interval: 4.6, duration: 3.2, rotSpeed: 3.5, width: 40, length: 400 },
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
  // Undergrowth chapter natives (v5.4). See stepClawRake/stepQuillWeapon/stepShriekWeapon in sim.js.
  clawRake: {
    name: 'Claw Rake',
    desc: 'Rake a fast arc at the nearest foe.',
    icon: '🐾', rarity: 'normal',
    // A cast rakes every enemy whose CENTER falls in the sector (arc rad, range px) centered on the
    // nearest enemy — flagella's swing geometry exactly, and like flagella it NEVER moves the player
    // (see the CLAW_* block below for why). The two melee starters are separated by shape, not by a
    // gimmick: the whip is a WIDE, SLOW, long single sweep (arc 1.40-1.85, rate 0.90-0.58, range
    // 130-175); the rake is HALF the arc at ~1.6x the cadence and shorter reach — a narrow, rapid
    // shred you must point at one foe, against a lazy crowd-clearing lash.
    levels: [
      { dmg: 11, rate: 0.42, range: 100, arc: 0.70 },
      { dmg: 13, rate: 0.39, range: 106, arc: 0.75 },
      { dmg: 16, rate: 0.35, range: 112, arc: 0.82 },
      { dmg: 20, rate: 0.31, range: 120, arc: 0.88 },
      { dmg: 25, rate: 0.27, range: 130, arc: 0.95 },
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
    // Same sector geometry as flagella/clawRake (arc rad, range px, aimed at the nearest enemy
    // and falling back to player.facingAngle when none exists — exactly fireFlagella's rule), but
    // longer and narrower, and it shoves what it hits.
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
      // v5.6.15: castRange raised — this is the skies' designated ANTI-AIR pick, so it must
      // comfortably outrange anything that hovers (missile standoff, strafe bank arcs), not tie it.
      { dmg: 30, rate: 2.6, castRange: 340, flight: 0.60, r: 85,  count: 1 },
      { dmg: 37, rate: 2.4, castRange: 360, flight: 0.60, r: 92,  count: 1 },
      { dmg: 45, rate: 2.2, castRange: 380, flight: 0.55, r: 100, count: 2 },
      { dmg: 55, rate: 2.0, castRange: 400, flight: 0.55, r: 110, count: 2 },
      { dmg: 70, rate: 1.8, castRange: 420, flight: 0.50, r: 122, count: 3 },
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
  // rend/wideRake/longClaws fold into clawRake's levels[] via WEAPON_STAT_MODS; quickPaws (attack
  // rate — dividing it into the levels[] `rate` would SLOW it, like flagella.frenzy) is read at the
  // fire site. doubleSlash/bleedClaws are behavioral (see stepClawRake/applyBleed in sim.js).
  clawRake: {
    rend:        { name: 'Rending Claws', desc: 'claw damage', icon: '🩸', base: 0.35, kind: 'pct' },
    wideRake:    { name: 'Wide Rake',     desc: 'claw arc',    icon: '🪭', base: 0.30, kind: 'pct' },
    longClaws:   { name: 'Long Claws',    desc: 'claw reach',  icon: '📏', base: 0.30, kind: 'pct' },
    quickPaws:   { name: 'Quick Paws',    desc: 'rake rate',   icon: '💨', base: 0.25, kind: 'pct' },
    doubleSlash: { name: 'Double Slash',  desc: 'every 3rd rake slashes twice',        icon: '🐈', base: 1, kind: 'flat' },
    bleedClaws:  { name: 'Bleeding Claws', desc: 'bleed on raked foes (over 3s, dot)', icon: '🩹', base: 0.50, kind: 'pct' },
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

// ---- Undergrowth weapons (v5.5: Claw Rake + Quill Burst + Chitter Shriek) --------------------
// Claw Rake (undergrowth starter — see WEAPONS.clawRake + stepClawRake in sim.js): a plain sector
// rake at the nearest enemy, on flagella's geometry. It does NOT move the player, and must not.
//
// v5.5 — this weapon USED to be "Pounce Claws": the cast dashed the player onto the nearest foe and
// raked on landing. It is gone, and nothing like it should come back as an AUTO-cast. Two reasons,
// the second decisive:
//   1. It fed the player into contact damage. The dash landed you ON a foe and the player is not
//      invulnerable during it; post-hit invuln (0.75s) was SHORTER than the cast interval (0.95s),
//      so the starter reliably damaged its own owner once per cast.
//   2. It stole movement agency. Moving is the ONLY input this game has. An auto-cast on a timer
//      that yanks the player toward the swarm takes the game away from them at an interval they
//      never chose. I-frames would have fixed (1) and not touched (2) — the concept is simply wrong
//      for an auto-attack game. A dash belongs on a button the player presses, and there is no
//      button. Note the enemy 'pounce' below is the SAME verb done right: the CAT leaps, telegraphs
//      it, and the player dodges — that reads as a predator because the player still gets to answer.
// If you are here to re-add a dash, re-read (2) first.
export const CLAW_DOUBLE_EVERY = 3       // doubleSlash (behavioral): every Nth rake slashes a second time
export const CLAW_DOUBLE_DELAY = 0.12    // s between the first slash and its follow-up (reads as one flurry)
export const CLAW_DOUBLE_DMG_FRAC = 0.7  // follow-up slash's damage, as a fraction of the first's
// bleedClaws (behavioral) reuses flagella's barbed bleed verbatim (applyBleed / BARBED_DMG_MUL /
// BARBED_DURATION above) — same DoT, re-themed as claw wounds. No constants of its own.

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
// flagella/clawRake use, plus a radial shove away from the player.
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
    weapons: ['clawRake', 'quillBurst', 'chitterShriek'], starter: 'clawRake',
    roster: [
      { id: 'cat', archetype: 'tank',   name: 'Cat', hpMul: 1.6,  speedMul: 0.8, flags: ['pounce'] },
      // Centipede replaces the Owl (v5.6.8). The owl used 'aerialStrike' — circles overhead at
      // AERIAL_RADIUS, dives to a marked spot — which is un-killable in a MELEE-ONLY chapter: it
      // circles past every short-range weapon and dives to where a kiting player WAS, so a
      // clawRake loadout cleared 0% of owls. aerialStrike / drawOwl are kept parked (see sim.js /
      // render.js) for a future chapter that hands out a ranged weapon. The centipede is a plain
      // fast ground predator — it closes into rake range and dies there, like every ground enemy.
      { id: 'centipede', archetype: 'fast', name: 'Centipede', hpMul: 1.15, speedMul: 1.05, flags: [] },
      { id: 'rat', archetype: 'normal', name: 'Rat', hpMul: 0.85, speedMul: 1.15, flags: [] },
    ],
    eliteFlags: ['flashlightCone'],       // exterminator elites sweep a cone that ENRAGES other enemies
    // Signature: predator telegraphs (the cat's 'pounce' is the telegraph — it crouches, aims, then
    // leaps and lands in a punish window) PLUS a field of snap traps seeded at createRun. `traps` = how
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
      // v5.6.15: hpMul 1.2 -> 0.75 — aircraft are FRAGILE; the tank column is this chapter's
      // armor. At 1.2 the roar cone cleared ~0.7 helis/s against ~1.6/s spawning, so they
      // accumulated into a missile hell (217 alive at t=180) regardless of standoff.
      { id: 'helicopter', archetype: 'normal', name: 'Helicopter',  hpMul: 0.75, speedMul: 0.9,  flags: ['missileVolley'] },
      { id: 'tankColumn', archetype: 'tank',   name: 'Tank Column', hpMul: 1.8, speedMul: 0.55, flags: ['artillery'] },
    ],
    eliteFlags: ['artillery'],            // AA-turret elites shell you too, just harder (see ARTILLERY_*)
    // Signature: bombardment (area denial) — telegraphed artillery circles rain on the player's
    // area CONTINUOUSLY, independent of the artillery-flagged roster. Both feed run.bombs (the
    // existing volatile-bomb array: telegraph fuse -> explode, damages player AND enemies).
    // `rate` = seconds between bombardment volleys; the rest is BOMBARDMENT_* below.
    signature: { type: 'bombardment', rate: 2.6 },
    // v5.8 kaiju redesign: cell 420->260, count 13->34, minR/maxR 30/60->10/28, minDist 240->160.
    // BOTH cell and count had to move together — count is a density reference over
    // OBSTACLE_FIELD_RADIUS and is invariant under cell size alone (see STRUCTURE_KINDS' comment
    // above); shrinking just `cell` would have left the live obstacle count unchanged. Smaller,
    // denser structures are the whole point: the player is now bigger than the city, not smaller
    // than the debris (see the design doc's Problem section). minDist drops with it — at this
    // density the old 240px spawn-clear ring reads as a conspicuous bald crater, not a starting
    // clearing. `cell` is a new per-chapter override (see OBSTACLE_CELL's doc above); every other
    // chapter still falls back to the shared OBSTACLE_CELL and is untouched by this.
    // v5.9 top-down region overhaul: count 34->40. Streets now carve ~17% of the world out of the
    // buildable area (roadAt/ROAD_* above), so the same count-34 field that gave test/sim-test.js's
    // run CC.e density guard 102 live obstacles WITHOUT roads only reached 76 WITH them — legal
    // (its accepted band is 70-170) but thin, and a real step down from the v5.8 density goal this
    // number exists to serve. 40 pushes streamObstacles' fill probability past 1.0 (see its `prob`
    // formula) so every non-road cell in range gets a structure — the field is now AS dense as the
    // street grid allows, not merely dense enough to scrape past a test floor. (This saturates
    // rather than overflows: `prob` is clamped implicitly by the per-cell hash compare, so count
    // any higher than the ~38 needed to reach 1.0 buys nothing further — most other chapters'
    // fields are already at or past this same saturation point at their own `count`, e.g. city and
    // undergrowth; skies just used to sit under it.)
    // v5.9.2: minR/maxR 10/28 -> 8/32 — no longer the band every structure rolls from (see
    // STRUCTURE_RADIUS, below the STRUCTURE_KINDS section). Every kind now has its OWN band there;
    // these two fields are kept only as the overall [min, max] across all of them, for
    // test/sim-test.js's run CC.c3 (reads .minR directly to size a synthetic structure) and as
    // streamObstacles' conservative worst-case radius for position-jitter slack before a cell's
    // kind is known (see that function's comment) — not as a roll range in their own right anymore.
    obstacles: { count: 40, minR: 8, maxR: 32, minDist: 160, cell: 260 }, // buildings — small, dense, crushable; per-kind sizing in STRUCTURE_RADIUS
    // crush (v5.8 kaiju redesign): gates BOTH halves of the new mechanic in sim.js — stepObstacles
    // skips the player-push loop for this chapter's obstacles (they're crushable, not terrain, for
    // the player only; enemies still collide with them normally) and stepCrush destroys any
    // structure overlapping the player's crush radius outright (see CRUSH_XP/RAMPAGE_* below).
    // Chapter-level, not per-obstacle-entry: every skies obstacle is a crushable structure, so one
    // flag on the chapter is the whole contract (no per-entry HP/crushable field to keep in sync).
    crush: true,
    // roads (v5.9 top-down region overhaul): gates streamObstacles' road-rejection check (sim.js)
    // so the street grid ONLY affects skies — every other chapter with an `obstacles` config
    // (city/pond/garden/undergrowth/beyond) streams exactly as before. Chapter-level for the same
    // reason `crush` is: one flag is the whole contract, no per-obstacle-entry field to keep in
    // sync. See roadAt above for the grid itself and sim.js's streamObstacles for the ponytail
    // note on why roads key off _obstacleSeed independently of the district map.
    roads: true,
    // ---- render-only (v5.6.17) ---- you are the kaiju rampaging under a NIGHT THUNDERSTORM: dark
    // indigo sky between shattered concrete, a wet-asphalt rubble floor, a green kaiju with a heavy
    // tail. Read as a dark, storm-lit ground (effective floor luminance ~0.07 — darker than city/
    // pond/garden, just shy of undergrowth) instead of the old washed-out daylight-at-altitude.
    // rosterId: jet/helicopter/tankColumn — see their re-lit fills at the top of the Skies section
    // in render.js (the floor flip forced a matching contrast re-pass on all three).
    render: {
      bgColor: 0x2a3240,    // dark storm indigo-grey sky showing between the rubble
      floorTint: 0x717c88,  // wet-asphalt cool grey multiply — rain-slicked night wreckage
      playerTint: 0x7ad07a, // classic rubber-suit kaiju green
      tail: true,
      tailTint: 0x5fb05f,   // a heavier, darker kaiju tail (tailSwipe's business end)
      storm: true,          // v5.6.18: gates the night-thunderstorm overlay (cloud-shadows,
                             // parallax clouds, rain — STORM_VIS below, render.js updateStorm)
      districts: true,      // v5.7.x: gates the per-cell Voronoi district floor/prop system
                             // (DISTRICTS/districtAt/districtTintAt below, render.js syncObstacles
                             // + the floor populate* callbacks) — a separate flag from `storm`
                             // because it's a distinct concern (ground skin vs. sky overlay) that
                             // only happens to also be skies-only today.
      // v5.8 kaiju redesign: render-only draw-scale on enemy sprites (jets/helis/tanks read as
      // specks under a kaiju) — deliberately NOT a sim radius change. Rev.1 of this redesign tried
      // an `enemyScale` sim knob and it silently rebalanced the chapter: e.radius is an addend in
      // ~12 hit tests (all three body tests inside inSector, sim.js — added in v5.6.3 specifically
      // so sector sweeps test the enemy's BODY, not its centre). Shrinking the sim radius would
      // have shrunk the roar/tailSwipe hit window along with the sprite. render.js reads this and
      // scales the sprite only; sim.js never sees it (not in this file's exports, not imported by
      // sim.js — grep confirms).
      enemyDrawScale: 0.55,
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

// Night-thunderstorm overlay (skies chapter, v5.6.18, render.js updateStorm): three cosmetic,
// pooled, world-space layers built on the CURRENT_VIS idiom above (pooled sprites, respawn in
// view, fade envelopes). windAngle/speed drive one shared wind vector so the ground shadows,
// the overhead clouds and the rain all lean the same way. Keep shadow/cloud alphas conservative
// — this sits over live gameplay (enemies, telegraphs) and must stay readable.
export const STORM_VIS = {
  windAngle: 2.35, // rad — shared gust direction (down-and-left); every layer drifts/falls along it
  shadow: {         // ground cloud-shadows: big dark blobs UNDER entities, dimming the floor
    count: 6,
    sizePx: 900,     // blob diameter, px
    sizeJitter: 0.35, // ± fraction randomising each blob's size so they don't read as one stamp
    speed: 34,       // px/s drift along windAngle
    tint: 0x05070c,
    alpha: 0.24,     // peak alpha at full fade-in — dims the floor, doesn't blacken it
    life: 26,        // s alive before fading out and respawning in view
    lifeJitter: 0.3,
    fadeIn: 3.5,
    fadeOut: 4.5,
    margin: 300,     // px past the viewport before a (huge) blob's center may respawn
  },
  cloud: {          // overhead parallax clouds: OVER everything, lag the camera (altitude cue)
    count: 5,
    sizePx: 1050,
    sizeJitter: 0.4,
    speed: 14,       // px/s of the cloud's OWN drift, on top of the parallaxed camera offset
    tint: 0x2e3644,
    alpha: 0.26,     // translucent — sparse enough to still read enemies/telegraphs underneath
    life: 34,
    lifeJitter: 0.3,
    fadeIn: 4,
    fadeOut: 5,
    margin: 350,
    parallaxFactor: 0.3, // fraction of the camera's move this layer follows — <1 reads as distant
  },
  rain: {           // foreground rain streaks: plain screen-space wind-wrap, no world tracking
    count: 140,
    speed: 950,      // px/s fall speed along windAngle
    lenPx: 26,
    widthPx: 2.2,
    tint: 0xaebdd0,
    alpha: 0.14,     // subtle — a haze of motion, not a whiteout
  },
}

// Lightning (skies chapter, v5.7.2, render.js): re-themes the EXISTING bombardment/artillery
// telegraph -> explode contract (run.bombs, untouched — see stepBombs/stepBombardment in sim.js)
// as an electric strike instead of the generic red bomb, plus purely cosmetic ambient lightning.
// Zero sim effect: every number below only feeds render.js draw calls and render-local timers.
export const LIGHTNING = {
  // Full-field white flash (render.js `lightningFlash`, a screen-space Sprite sitting just below
  // the red damage vignette so a real hit still visibly wins if both land the same frame). One
  // fade duration for both triggers; the peak alpha is what tells a real strike from ambient weather.
  flash: {
    strikeAlpha: 0.55,  // peak alpha when an actual bombardment/artillery shell lands
    ambientAlpha: 0.2,  // peak alpha for cosmetic ambient lightning — noticeable, not blinding
    fadeDur: 0.16,       // s from peak back to 0
  },
  // Telegraph re-skin (render.js redrawBombs, skies only): same fill-then-stroke circle as the
  // default red bomb telegraph, just electric-colored, plus a core ring that COLLAPSES toward the
  // strike point as the fuse burns down (a converging target, not a swelling one).
  // v5.10 (art direction spec §2 palette law 3 + §8 kill-list item 12): these two colours were
  // ELECTRIC ICE-BLUE (0x8fd8ff / 0xeaf9ff) and that exact pair is what render.js also reached for
  // when it drew the JET STRAFE lane (updateStrafeLocks) — "the dash telegraph for planes is the
  // same colour as everything" in the user's report, literally true and traceable to this object.
  // Ice blue-white is now reserved for SEARCHLIGHT LIGHT ONLY (SKIES_LIGHT.cone below); the sky's
  // own strike goes VIOLET, which nothing else in the chapter wears. Values are the spec's
  // (SKIES_FX.sky mirrors them for the new descent-vector drawer, which is the drawer that should
  // survive — this object is kept ONLY so the existing circle telegraph's alpha ramp keeps working
  // until that drawer lands, and must end up referenced by exactly ONE drawer, per the spec's §9
  // grep audit). Render-only, skies-only: no other chapter reads LIGHTNING at all.
  telegraph: {
    color: 0xc8b4ff,     // violet descent/impact colour — the sky is firing, and only the sky is violet
    coreColor: 0xffffff, // the collapsing "about to crack" core ring, now pure white (spec: brackets/core)
    baseFillA: 0.12,
    maxFillA: 0.32,
    baseRimA: 0.55,
  },
  // Detonation bolt for a REAL strike (render.js handleEvents' 'explode' case): a jagged vertical
  // polyline cracking down into the strike point, drawn through the elemental-shock-arc pool
  // (spawnArc/redrawArcs) so it gets that system's glow-then-core double stroke for free.
  strikeBolt: {
    dropPx: 560,          // how far above the strike point the bolt's top sits
    segments: 7,          // anchor points along the drop — the big zigzag's jaggedness
    jitterPx: 50,         // max lateral wobble per anchor, tapering to 0 at the strike point
    width: 11,            // glow-stroke width (the core stroke is a fixed fraction of this)
    color: 0xf4fbff,      // near-white core stroke (unchanged — the spec's bolt core is this exact value)
    glowColor: 0xb79bff,  // v5.10: was 0x8fd8ff (ice blue). Violet glow, matching the telegraph above
                          // and SKIES_FX.sky.boltGlow — a bolt and its own warning must share a hue
    dur: 0.22,            // s the bolt stays visible before fading
    alpha: 1,              // peak stroke alpha
  },
  // Ambient cosmetic lightning (render.js updateAmbientLightning, called from updateStorm): an
  // occasional flash + a distant, thinner, dimmer bolt — pure weather, damages/reads nothing,
  // timed by its own render-local accumulator (never the seeded sim RNG).
  ambient: {
    minInterval: 6,   // s between ambient strikes, lower bound
    maxInterval: 14,  // s between ambient strikes, upper bound
    dropPx: 700,
    segments: 6,
    jitterPx: 70,
    width: 4,          // thinner than a real strike
    // v5.10.1: was 0xc8b4ff — the EXACT strikeBolt/telegraph violet. A reviewer verified that made
    // harmless cosmetic weather indistinguishable from an incoming strike, which is a legibility bug,
    // not just an art one (the ambient bolt has no telegraph, no ground scar and a dimmer/thinner
    // flash, but colour is what a player reads first). Ice blue-white stays searchlight-only (law 3)
    // and violet stays the strike's alone (law-adjacent), so ambient gets a THIRD hue: a desaturated
    // slate blue-grey — distant cloud-glow, not an armed threat, and not reserved by any other law.
    color: 0x8a94b8,
    dur: 0.18,
    alpha: 0.55,       // dimmer than a real strike's peak (1)
  },
}

// Procedural Voronoi districts (skies chapter, v5.7.x, render.js + sim.js; grown from 4 types to 6
// by the v5.9 top-down region overhaul): a seeded ground map over world-XY so roaming any direction
// crosses downtown -> suburbs -> parks -> farms -> hills -> sea and back. districtAt/districtTintAt
// are pure functions of (x, y, run._districtSeed) — no RNG stream, no run mutation — so either side
// of the sim/render boundary can call them. floorTint is RENDER-ONLY (what actually reaches the
// floor sprites — render.js multiplies it in like every other chapter's single floorTint); weight
// sets how much of the map each type gets (districtCellType below).
// v5.9.1 bugfix: districtAt is now ALSO called from sim.js's streamObstacles, to pick a structure's
// `kind` from the district-appropriate subset (DISTRICT_STRUCTURE_KINDS, below STRUCTURE_KINDS)
// instead of the full list — fixes the reported "houses in the sea" bug. run._districtSeed's own
// doc (state.js) has the full case for why this is safe for the seeded test suite; short version:
// it's drawn once at createRun same as always, and sim reading an EXISTING value costs nothing from
// the shared Math.random stream at step time. districtTintAt (the floor-tint half) stays
// render-only — sim still never reads a floor color, and still never branches game LOGIC on district.
export const DISTRICTS = {
  downtown: { floorTint: 0x717c88, weight: 3 }, // the chapter's original wet-asphalt grey — kept as the anchor district
  suburbs:  { floorTint: 0x9a8a72, weight: 2 }, // warmer, lighter grey-tan — v5.9: 3->2, ceding a share to farms/hills
  parks:    { floorTint: 0x5f7a5f, weight: 2 }, // muted storm-lit green
  sea:      { floorTint: 0x53687c, weight: 2 }, // desaturated storm blue
  farms:    { floorTint: 0x7c8a52, weight: 2 }, // v5.9: khaki-olive crop rows — region-biased, see DISTRICT_REGION_BIAS below
  hills:    { floorTint: 0x8a7a6a, weight: 1 }, // v5.9: warm heather-taupe moorland — a rarer accent, deliberately NOT region-biased
  // all six land within ~0.06-0.09 effective floor luminance under the skies bg (0x2a3240) —
  // verified with scripts/obstacle-contrast.mjs's effFloor model (mean blotch x floorTint,
  // composited over bgColor at ~0.5 mean blotch coverage): downtown .073, suburbs .088, parks
  // .067, sea .057, farms .081, hills .075. Same dark range as the original four — this is a
  // night storm, not daylight.
}
const DISTRICT_TYPES = Object.keys(DISTRICTS)

// v5.9.2 ("the fuck is this?" bug report — one of four compounding causes): DISTRICT_GRID was 2000
// against OBSTACLE_STREAM_RADIUS's 1400 — a region was LARGER than the streamed field around the
// player, so the field (and the screen) was almost always a single district; downtown/parks/farms/
// sea/hills all exist in the data and essentially never reached the same view at once. Measured with
// a standalone replica of districtAt (nearestDistrictSeeds et al.) sampling 400 points across a
// disc of radius 600 (state.js createRun's `viewRadius: 600` default, half a typical screen
// diagonal, updated live by main.js) around 30 random far-apart player positions: at GRID=2000 a
// viewport saw on average 1.87 distinct districts (min 1, max 3) — i.e. usually exactly one. GRID=600
// raises that to an average of 3.90 (min 1, max 5), squarely in the "2-4 visible at once" target,
// while OBSTACLE_STREAM_RADIUS (1400, unchanged) now spans multiple district cells instead of
// sitting inside one. Coherent-belt check (DISTRICT_REGION_BIAS below): a long-scanline measurement
// of sea/farms' overall world-area share came out ~37-39%/~19-20% at BOTH GRID=2000 and GRID=600 —
// the region math is grid-size-invariant in aggregate, only each belt's PHYSICAL width shrinks with
// the grid (sea's average contiguous run: ~2437px at 2000, ~1502px at 600 — ~2.5 grid cells, still a
// contiguous coastline, not confetti; DISTRICT_REGION_BLOCK below is a cell COUNT, so it needed no
// change to keep working the same way at the smaller cell size).
export const DISTRICT_GRID = 600        // px per Voronoi seed cell
// v5.9.2: 200 -> 90, alongside DISTRICT_GRID above. The original 200 was 10% of the old 2000 grid;
// keeping that exact ratio here would give 60, but 90 (15%) reads better at the smaller scale
// without ever blending across more than the two adjacent districts (it stays well under half the
// ~600px average distance between neighboring seed points, so a blend still only ever involves a
// cell's nearest and 2nd-nearest seed, same as before).
export const DISTRICT_BLEND_PX = 90     // px either side of a border the floor tint lerps across

// Low-frequency block size (in grid cells) sharing one "which region is this" roll, and how hard
// that roll skews a cell's type toward the rolled region's district — see districtCellType.
// Without this, a region-biased type would just be its flat `weight` share scattered confetti-thin
// across every cell; the block bias makes whole neighborhoods of cells roll that type together so
// the region reads as one contiguous area (a coastline, a farm belt) instead of scattered dots.
// v5.9 top-down region overhaul: generalised from the v5.7.x sea-only mechanism (a single
// `seaRegion` bool) into DISTRICT_REGION_BIAS below, a per-type {chance, boost} map — rather than
// copy-pasting a second bespoke `farmRegion` bool next to it. Farms read better as contiguous
// belts than as confetti (the same reason sea did), so they get an entry too. A block rolls AT
// MOST ONE active region (mutually exclusive: sea-region OR farm-region OR neither — see
// districtRegionAt) so two biases never compound on the same block.
const DISTRICT_REGION_BLOCK = 3
export const DISTRICT_REGION_BIAS = {
  // unchanged from v5.7.x (0.32 chance x 6x boost). Coverage math below is recomputed for 6
  // district types — it was ~42% back when sea was the only biased type sharing the map with 3
  // flat-weight neighbours.
  sea:   { chance: 0.32, boost: 6 },
  // v5.9: a lighter touch than sea (lower chance, lower boost) — enough for farms to read as
  // belts without farm-dominating the map alongside sea's already-large share. hills deliberately
  // has NO entry here: it's meant to read as a rare accent, and parks (also unbiased) already
  // proves a flat-weight district reads fine without contiguous-region help.
  farms: { chance: 0.14, boost: 4 },
}
// Effective world coverage with the CURRENT weights (downtown 3, suburbs 2, parks 2, sea 2,
// farms 2, hills 1 = 12 total) and the biases above, worked the same way v5.7.x's comment did:
// sea ~38%, farms ~20%, downtown ~16%, suburbs/parks ~10% each, hills ~5%. Re-derive by hand
// before changing any weight or bias number — two biased types compound fast: a first draft of
// this table used farms {chance:0.22, boost:5} and that alone pushed sea+farms to ~63% of the
// map, crushing downtown to ~14% even though its own weight never moved.

// Which region (if any) block (bi, bj) rolls — a single roll shared by every DISTRICT_REGION_BIAS
// entry so a block is at most one region (see the comment above). Returns a DISTRICTS key or null.
function districtRegionAt(bi, bj, seed) {
  const roll = hash01(bi, bj, seed, 'region')
  let acc = 0
  for (const type of Object.keys(DISTRICT_REGION_BIAS)) {
    acc += DISTRICT_REGION_BIAS[type].chance
    if (roll < acc) return type
  }
  return null
}

// Deterministic [0,1) from any number of parts, reusing the FNV hashString below (string-keyed — this
// runs a handful of times per floor cell/obstacle, nowhere near a hot per-frame loop).
function hash01(...parts) {
  return hashString(parts.join(',')) / 0xffffffff
}

// Which DISTRICTS type a grid cell rolls, weighted by DISTRICTS[].weight and biased toward the
// block's region (if any, see districtRegionAt) via DISTRICT_REGION_BIAS.
function districtCellType(ci, cj, seed) {
  const bi = Math.floor(ci / DISTRICT_REGION_BLOCK)
  const bj = Math.floor(cj / DISTRICT_REGION_BLOCK)
  const region = districtRegionAt(bi, bj, seed)
  let total = 0
  const weights = DISTRICT_TYPES.map((k) => {
    let w = DISTRICTS[k].weight
    if (region) w = k === region ? w * DISTRICT_REGION_BIAS[region].boost : w / DISTRICT_REGION_BIAS[region].boost
    total += w
    return w
  })
  let roll = hash01(ci, cj, seed, 'type') * total
  for (let i = 0; i < DISTRICT_TYPES.length; i++) {
    roll -= weights[i]
    if (roll < 0) return DISTRICT_TYPES[i]
  }
  return DISTRICT_TYPES[DISTRICT_TYPES.length - 1]
}

// One Voronoi seed point per grid cell, jittered within it (+-40% of a cell) and typed by
// districtCellType. // ponytail: seed points come from a grid + hash, not real Poisson-disk
// sampling — upgrade only if district sizes read too uniform in practice.
function districtCellSeed(ci, cj, seed) {
  const jx = (hash01(ci, cj, seed, 'jx') - 0.5) * 0.8
  const jy = (hash01(ci, cj, seed, 'jy') - 0.5) * 0.8
  return {
    x: (ci + 0.5 + jx) * DISTRICT_GRID,
    y: (cj + 0.5 + jy) * DISTRICT_GRID,
    type: districtCellType(ci, cj, seed),
  }
}

// Nearest + 2nd-nearest seed points to (x, y), searching the 3x3 grid cells around it — wide
// enough since the +-40%-cell jitter above can never put a cell's own seed point outside its
// immediate neighbors.
function nearestDistrictSeeds(x, y, seed) {
  const ci = Math.floor(x / DISTRICT_GRID)
  const cj = Math.floor(y / DISTRICT_GRID)
  let first = null, second = null, d1 = Infinity, d2 = Infinity
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const p = districtCellSeed(ci + di, cj + dj, seed)
      const d = (p.x - x) ** 2 + (p.y - y) ** 2
      if (d < d1) { second = first; d2 = d1; first = p; d1 = d }
      else if (d < d2) { second = p; d2 = d }
    }
  }
  return { first, second, d1: Math.sqrt(d1), d2: Math.sqrt(d2) }
}

// Which district (x, y) sits in this run (seed = run._districtSeed). Pure + deterministic.
export function districtAt(x, y, seed) {
  return nearestDistrictSeeds(x, y, seed).first.type
}

function lerpColorInt(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t)
}

// The floor tint at (x, y): the nearest district's floorTint, lerped toward the 2nd-nearest's
// within DISTRICT_BLEND_PX of the border between them so the floor doesn't hard-cut at a district
// line. // ponytail: a 2-nearest lerp, not a true multi-cell blend — revisit if 3-district corners
// look wrong.
export function districtTintAt(x, y, seed) {
  const { first, second, d1, d2 } = nearestDistrictSeeds(x, y, seed)
  if (first.type === second.type) return DISTRICTS[first.type].floorTint
  const t = Math.max(0, Math.min(0.5, 0.5 - (d2 - d1) / (2 * DISTRICT_BLEND_PX)))
  return lerpColorInt(DISTRICTS[first.type].floorTint, DISTRICTS[second.type].floorTint, t)
}

// ---- District SURFACES (v5.10 art direction, spec §4.5) — render-only, skies-only ---------------
// The district system shipped in v5.7.3 gives each district a floor TINT and nothing else, so six
// "different" regions are six colours of the same ground. What actually makes an overhead view read
// as a PLACE is a signature PATTERN per region — the thing you recognise in a satellite photo before
// you recognise anything else. One bake each (T.districtGround keeps its "bake white-alpha, let
// floorTint carry the hue" contract, so these are shape/geometry data, not colour data, EXCEPT where
// a `lit*` colour appears below).
//
// `lit*` COLOURS BYPASS THE FLOOR TINT. Chlorine-blue pool water, shipping-container red, fresh
// crosswalk paint: multiply those by a district floorTint and they turn to mud. render.js is
// expected to honour a `litTint: true` prop-kind flag (`s.tint = kind.litTint ? kind.tint :
// tintMul(..., floorTint)`) — see spec §4.5's last paragraph. Saturated accents are also the
// chapter's scarcest resource: the threats own saturation (SKIES_FX), so the ONLY saturated ground
// in the region is the container yard and a suburban pool.
export const DISTRICT_SURFACE = {
  // parks: today this district has NO T.districtGround entry at all and falls through to T.blotches
  // — the same four soft radial blobs the body/pond/garden chapters use (kill list §8.10, and one
  // of the "reusing too much" complaints, literally). MOWN STRIPES are the single most recognisable
  // overhead pattern that exists (nothing else in the world looks like a mown field from above) and
  // they are one bake. Angle comes from the field's own hashed row angle — reuse farmRowSnap's
  // shared-angle machinery so a park's stripes are coherent across cells instead of per-cell noise.
  parks: {
    stripePx: 26,             // band width — a real mower deck read, wide enough to survive minification
    stripeAlphaA: 0.10, stripeAlphaB: 0.20,   // alternating, white; the tint carries the green
  },
  // farms: keeps its furrows, gains the OTHER instantly-recognisable overhead farm shape — the
  // centre-pivot irrigation circle. A perfect circle in a field of straight rows is unmistakable.
  farms: {
    pivotRadius: 520, pivotAlpha: 0.18, pivotArm: true,   // on the `big` floor layer
    headlandPx: 34,           // turn-strip at field edges, where the tractor comes about
  },
  // sea: a CONTAINER YARD — tiny dense saturated rectangles against dark water. Highest
  // detail-density per line of code in the whole redesign, and the only place in the chapter where
  // hue does the talking. Hues are deliberately UNTINTED (litTint) and deliberately the primary
  // colours of real shipping lines: a tinted container yard is just a grey grid.
  sea: {
    yardCols: 4, yardRows: 9, boxW: 14, boxH: 9,
    boxHues: [0xc0392b, 0x2e86c1, 0xe0a800, 0x2e8b57, 0x8e44ad, 0xd35400], litTint: true,
    riprap: true,             // breakwater arm: a chain of angular boulder polys, NOT a smooth curve
    // Kill list §8.6: T.foam is currently `T.fx.trace_05` — the sea's breaking wave IS the POND's
    // current-streak sprite, reused again by populateEdge for coastlines. A real wave crest is two
    // parallel arcs and a speckle band; there is no excuse for it being a borrowed streak.
    crestArcs: 2, crestAlpha: 0.42, foamSpeckle: 22, foam: 0xdfe9f0, litTint2: true,
  },
  // downtown: a painted parking lot. Parked cars ALIGN TO THE STALL ANGLE — random rotation is the
  // loudest possible tell that props were scattered by an algorithm rather than placed by a city.
  downtown: {
    bayRows: 2, baysPerRow: 6, bayPitch: 8,
    paint: 0xd8d4c8, paintAlpha: 0.55, litTint: true,
    loadingBayHatch: true,
  },
  // hills: keeps T.contour, gains a switchback dirt track — the one man-made line in open moorland,
  // and a zigzag is the only shape that says "slope" on a camera with no horizon.
  hills: { trackColor: 0x6b5a44, trackSegments: 3, trackW: 7 },
  // suburbs: its lot furniture (driveway, lawn, hedge L, shed, deck, bins, pool) is baked INTO the
  // house structure itself rather than scattered as separate floor props — see SKIES_STRUCTURE_ART
  // below. A driveway that doesn't touch its house is worse than no driveway.
  suburbs: null,
}

// District SEAMS (spec §8, kill list item 11): populateEdge currently draws T.fence — a picket
// fence — at EVERY land/land district border, including the one between a farm and a moor. A seam
// is a chance to say what the two regions are; three seam kinds cost three bakes.
export const DISTRICT_EDGE = {
  hedge:  { color: 0x4e6640, lobes: 7, pitchPx: 26 },     // suburb/park seams
  wall:   { color: 0x9a9184, tickPx: 9, pitchPx: 14 },    // farm/hill seams — dry-stone, tick-row
  shore:  { riprap: true, surf: true },                   // any coastline — riprap + the new crest
  // Which seam a border gets, keyed by the two districts either side (order-independent; render
  // sorts the pair). Anything not listed falls back to `hedge` on land and `shore` against sea.
  pairs: {
    'parks|suburbs': 'hedge', 'downtown|suburbs': 'hedge', 'downtown|parks': 'hedge',
    'farms|hills': 'wall', 'farms|parks': 'wall', 'hills|parks': 'wall', 'farms|suburbs': 'wall',
  },
}

// ---- The darkening (spec §4.1) — STAGE 4, GATED ON MEASUREMENT, NOT WIRED IN --------------------
// The light layer (SKIES_LIGHT, below) only reads as light if the ground is dark. But the six tints
// above are already tuned to a documented 0.06-0.09 effective-luminance band (see DISTRICTS' comment)
// that keeps the three enemy silhouettes readable (jet 0xb6c4d2, heli 0x9cae66, tank 0xb3a374), and
// enemy readability is the one thing this chapter cannot lose. So the order is fixed and not
// negotiable: BUILD THE LIGHT LAYER AT TODAY'S TINTS FIRST, see how much of the effect comes free,
// and only then consider swapping DISTRICTS[x].floorTint for the value here and STORM_VIS.shadow.alpha
// (0.24) for STORM_SHADOW_ALPHA_DARK. Re-run `node scripts/obstacle-contrast.mjs` and re-verify enemy
// contrast BEFORE committing that swap; if the numbers refuse, keep the current tints and let the
// light carry all the contrast. The chapter survives losing the darkening. It does not survive
// losing enemy readability. Exported (rather than left in the doc) so the swap is a one-line data
// change with the audit numbers attached, not a re-derivation.
export const DISTRICT_FLOOR_TINT_DARK = {
  downtown: 0x5c6672, suburbs: 0x7d7160, parks: 0x4e6650,
  sea: 0x445666, farms: 0x677245, hills: 0x736659,
}
export const STORM_SHADOW_ALPHA_DARK = 0.16   // pairs with the above (STORM_VIS.shadow.alpha 0.24 today):
                                              // darker ground needs a lighter cloud shadow or the
                                              // floor goes to black and the shadows stop reading at all

// Roads (skies only, v5.9 top-down region overhaul): a coarse, deterministic street grid, PURE in
// (x, y, seed) exactly like districtAt above — same reason (sim AND render both need it: sim to
// keep streamObstacles from planting a building mid-street, render to draw pavement/markings/edges
// — config.js is the only place both are allowed to import from). Unlike districtAt, the seed here
// is run._obstacleSeed, NOT run._districtSeed — see CHAPTERS.skies.roads' comment for why that
// choice is load-bearing, not incidental.
//
// The grid itself is a plain axis-aligned Manhattan lattice (no rotation, no per-street jitter):
// every ROAD_SPACING px is a street on both axes, and every ROAD_MAJOR_EVERYth one of those is a
// wider avenue. A per-seed offset (ox, oy below) keeps different runs' grids from all sitting on
// literally the same world-space lines without needing anything fancier. Kept deliberately boring
// — "coarse grid of streets" is the whole ask, and a real road NETWORK (branches, dead ends, curves)
// is a render/level-design project this data layer has no business inventing.
export const ROAD_SPACING = 480      // px between adjacent streets, both axes
export const ROAD_MINOR_WIDTH = 34   // px, ordinary street width
export const ROAD_MAJOR_EVERY = 3    // every Nth street (either axis) is a wider avenue
export const ROAD_MAJOR_WIDTH = 62   // px, avenue width

// Cheap 32-bit hash (Math.imul mix, no string allocation or hashString/hash01 call) — roadAt is
// documented to run per obstacle cell AND per floor cell, which is a much hotter path than
// hash01's "a handful of times per obstacle" (see hash01's own comment above); the string-join
// allocation that's fine there would not be fine here.
function roadHash(a, b, seed) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + (seed | 0)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// Is (x, y) roadway, and if so: which way does the street run, how far off-centreline is this
// point, and is it a major avenue? seed = run._obstacleSeed (see this section's header comment).
// Returns { onRoad: false } off any street, or { onRoad: true, angle, dist, half, major }:
//   angle — 0 for an east-west street (runs along x), PI/2 for a north-south one (runs along y)
//   dist  — px from the street's centreline (>= 0), for drawing a fading edge or lane markings
//   half  — the street's own half-width (dist/half is a handy 0..1 "how far toward the curb")
//   major — true on a ROAD_MAJOR_EVERYth avenue (render can draw it wider/differently)
// At an intersection (or a near-miss on both axes at once) the closer centreline wins, since
// that's the one anything distance-based should key off.
export function roadAt(x, y, seed) {
  const ox = (roadHash(1, 0, seed) - 0.5) * ROAD_SPACING
  const oy = (roadHash(0, 1, seed) - 0.5) * ROAD_SPACING
  const gx = x - ox, gy = y - oy

  const vi = Math.round(gx / ROAD_SPACING)
  const hi = Math.round(gy / ROAD_SPACING)
  const vDist = Math.abs(gx - vi * ROAD_SPACING)
  const hDist = Math.abs(gy - hi * ROAD_SPACING)
  const vMajor = ((vi % ROAD_MAJOR_EVERY) + ROAD_MAJOR_EVERY) % ROAD_MAJOR_EVERY === 0
  const hMajor = ((hi % ROAD_MAJOR_EVERY) + ROAD_MAJOR_EVERY) % ROAD_MAJOR_EVERY === 0
  const vHalf = (vMajor ? ROAD_MAJOR_WIDTH : ROAD_MINOR_WIDTH) / 2
  const hHalf = (hMajor ? ROAD_MAJOR_WIDTH : ROAD_MINOR_WIDTH) / 2
  const onV = vDist <= vHalf
  const onH = hDist <= hHalf
  if (!onV && !onH) return { onRoad: false }
  if (onV && (!onH || vDist <= hDist)) return { onRoad: true, angle: Math.PI / 2, dist: vDist, half: vHalf, major: vMajor }
  return { onRoad: true, angle: 0, dist: hDist, half: hHalf, major: hMajor }
}

// ---- Road ART (v5.10 art direction, spec §4.2-§4.3) — render-only, skies-only -------------------
// "A road is a dashed yellow line on grass. It reads as a wireframe, not a place." The fix is not
// more lines, it is a MARKING FAMILY plus VARIATION ALONG THE STREET, split across three mechanisms
// for one blunt geometric reason:
//
// T.roadMinor/T.roadMajor are stamped by populateRoad with a NON-UNIFORM scale
// (`scale.set((cell*1.6)/ref, (half*2)/ref)` — x factor 0.48, y factor 0.34 minor / 0.62 major).
// ANYTHING baked into the carriageway tile is stretched by a different factor on each axis AND by a
// different factor per road class: circles come out as ovals, zebra bars come out at the wrong pitch,
// and the pitch is wrong by a DIFFERENT amount on a minor street than on an avenue. So the tile only
// ever carries shapes that survive that (bands and lines parallel to the axes, pre-compensated), and
// everything with a shape — manholes, patches, arrows — becomes a separate, UNIFORMLY scaled decal.
export const ROAD_PAINT = {
  // Baked INTO the carriageway tile (stretched; pre-compensate the pitch by the factors above).
  asphaltMinor: 0x33383f, asphaltMajor: 0x2b2f36,   // unchanged from what ships today
  kerb: 0x4a515b, kerbW: 2,                          // both long edges — the single strongest "this
                                                     // is a built road, not a painted strip" cue
  sheen: 0x8fa8c4, sheenAlpha: 0.10,                 // wet crown reflection down the centreline: a
                                                     // STATIC overhead reflection of the storm sky.
                                                     // ponytail: no dynamic sheen sprite — the
                                                     // full-field lightning flash already whitens it,
                                                     // and a per-road-cell additive sheen would be
                                                     // ~1000 extra sprites at ROAD_CELL = 30. Revisit
                                                     // only if the road floor layer is ever coarsened.
  polish: 0x22262c, polishAlpha: 0.25, polishAt: 0.45,  // two darker wheel-polish bands at ±0.45 of
                                                        // the half-width — where tyres actually run
  centreline: 0xd8d4c8, centrelineAlpha: 0.55,       // minor streets: dashed white
  doubleYellow: 0xdccf86, doubleYellowGap: 4, doubleYellowW: 2,   // avenues: two lines, 4px apart
  stretchX: 0.48, stretchYMinor: 0.34, stretchYMajor: 0.62,       // the known constant aspect to
                                                                  // pre-compensate against (above)
}

// The decal layer: `{ name: 'roadDecal', cell: 160, chance: 1.00, populate: populateRoadDecal }`,
// self-gating on roadAt + render.js's ROAD_VISIBLE_DISTRICTS exactly like populateRoad. ONE decal
// per cell, picked by cellHash(i, j, salt) from `kinds`. VARIATION ALONG A STREET IS WHAT STOPS A
// ROAD READING AS A WIREFRAME; one stamped tile repeated forever is what got us here.
export const ROAD_DECAL = {
  cell: 160, chance: 1.00,
  kinds: {
    manhole: { color: 0x3a3f47, r: 7, rimTicks: 6 },
    patch:   { color: 0x3d434b, sides: 5, px: 26 },     // irregular repair polygon, never a rectangle
    drain:   { color: 0x2a2f36, slotW: 11, slotH: 3, pairGap: 7 },  // kerb slots, at the kerb line
    arrow:   { color: 0xd8d4c8, alpha: 0.34, lenPx: 30 },           // faded painted turn arrow
  },
}

// Junctions (spec §4.3) — ENUMERATED, NOT STAMPED. ROAD_CELL is 30 and ROAD_SPACING is 480, so a
// junction is ~16 road cells across on each axis: "stamp a crosswalk when onV && onH" lays a dozen
// overlapping zebras on one junction. Instead render.js recovers the per-seed road grid origin ONCE
// per run (roadAt's onV depends only on x and onH only on y, so <= `latchProbes` probes along each
// axis at `latchStepPx` finds it), after which junction centres are exactly (ox + m*ROAD_SPACING,
// oy + n*ROAD_SPACING) — <= 6 on a 1280x720 view. Each gets ONE composite sprite from a pool of
// `pool`, drawn from four variants baked AT TRUE WORLD SIZE so they are never scaled at all (which
// is what lets a junction carry circles and zebra pitch that the stretched carriageway tile cannot).
export const ROAD_JUNCTION = {
  latchStepPx: 6, latchProbes: 80, pool: 8,
  variants: ['minorMinor', 'minorMajor', 'majorMinor', 'majorMajor'],
  zebraBars: 7, zebraColor: 0xd8d4c8, zebraAlpha: 0.55, zebraWornAlpha: 0.30, zebraWornEvery: 3,
  stopBarW: 3, manholes: 2, arrowsOnMajor: true,
  stalledCar: 'majorMajor',   // a sedan slewed across the box on the biggest junctions — everyone
                              // fled, and one abandoned car says that better than any effect. It is
                              // also the ONLY survivor of the cut "emergency vehicles" proposal
                              // (spec §11): a driving vehicle needs a pathfinder over roadAt, which
                              // is a point query with no graph.
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
// v5.6.13: obstacles STREAM with the player instead of being seeded once around the origin — the
// old field left the entire world beyond OBSTACLE_FIELD_RADIUS obstacle-free ("obstacles are only
// in the beginning zone", user). sim.js's streamObstacles rolls one obstacle per OBSTACLE_CELL
// grid cell from a pure hash of (cell, run seed): deterministic per run, so walking away and back
// finds the same rock; no RNG stream is consumed (seeded tests stay stable). The chapter config's
// `count` keeps its old meaning — expected obstacles within the old origin field — and is
// converted to a per-cell probability, so density matches what the origin field used to feel like.
export const OBSTACLE_FIELD_RADIUS = 900       // px, the density reference area (and traps/wells scatter radius)
export const OBSTACLE_CELL = 420               // px, streaming grid cell — at most one obstacle per cell
export const OBSTACLE_STREAM_RADIUS = 1400     // px, cells within this of the player materialize (beyond any screen edge)
export const OBSTACLE_DROP_RADIUS = 1900       // px, obstacles beyond this are dropped (hysteresis vs pop-in churn)
export const OBSTACLE_MIN_GAP = 40             // px, min edge-to-edge gap (traps/wells scatterField spacing)
export const OBSTACLE_PLACEMENT_ATTEMPTS = 200 // rejection-sampling attempts per entry (traps/wells scatterField)
// Per-chapter override of the streaming grid cell above (OBSTACLE_CELL) — absent everywhere except
// skies (v5.8 kaiju redesign): see CHAPTERS.skies.obstacles.cell and sim.js's streamObstacles,
// `cs = cfg.cell ?? OBSTACLE_CELL`. NOTE `count` is a density reference over OBSTACLE_FIELD_RADIUS
// and is invariant under cell size by construction (streamObstacles' `prob` formula) — shrinking
// `cell` alone changes NOTHING; a smaller cell needs a bigger `count` to actually read denser.

// Structure kind (v5.8 kaiju redesign; grown 4 -> 6 by the v5.9 top-down region overhaul): a purely
// cosmetic classification stamped on every streamed obstacle entry (run.obstacles[i].kind), derived
// from obstacleCellHash(i, j, seed, 4) — a FIFTH salt on the same pure hash that already picks the
// cell's position/radius (sim.js). Sim itself never branches on `kind` (crushing/pushing treat every
// obstacle the same); render.js just maps kind -> a sprite.
// v5.9.1 bugfix ("houses appear in the sea", playtest report): kind used to be picked UNIFORMLY
// across this entire list regardless of where the cell actually sat, so a downtown tower and a sea
// pier were equally likely to land in the middle of the ocean. Skies (the only chapter with a
// district map — run._districtSeed, see its doc in state.js) now picks from
// DISTRICT_STRUCTURE_KINDS[district] instead, below — see streamObstacles in sim.js. Every OTHER
// chapter (_districtSeed always null there) still picks uniformly across this full list, unchanged.
// `kind` itself is still stamped for every chapter's obstacles, not just skies' (the hash is free,
// no RNG stream, no branch cost worth gating) — only the SUBSET it's drawn from is district-gated.
// v5.9: adding barn/silo reshuffles which roll maps to which kind for EVERY existing cell in EVERY
// chapter (Math.floor(kindRoll * STRUCTURE_KINDS.length) now divides by 6, not 4) — this is fine:
// `kind` was never asserted against a specific literal value anywhere (grep confirms; the closest
// is test/sim-test.js's run CC.d, which checks kind is STABLE per (cell, seed) — its OTHER
// assertion, that kind is independent of _districtSeed, is exactly the bug fixed above, so that
// specific assertion no longer holds for skies as of v5.9.1), and no other chapter reads o.kind at
// all (only skies sets CHAPTERS[x].crush/render.js's district-skin lookup, both skies-only). Run
// `npm test` after any STRUCTURE_KINDS edit regardless — test/sim-test.js's run DD.d pins this
// array's LENGTH at exactly 6 (a tripwire against silently shrinking the ladder), so a real new
// kind needs that test updated by whoever owns test/; this file alone can't grow the vocabulary.
export const STRUCTURE_KINDS = ['tower', 'house', 'tree', 'pier', 'barn', 'silo']

// Structure kind × district (v5.9.1 bugfix, see STRUCTURE_KINDS' comment above): which kinds a
// structure may roll INSIDE a given DISTRICTS type, so a district actually reads as itself — towers
// downtown, houses in the suburbs, no land buildings poking out of the sea. parks/hills share
// 'tree' (both read as open, unbuilt land — see render.js's STRUCTURE_SKINS for how hills still gets
// its OWN silhouette without a new kind); farms gets two silhouettes (barn/silo) so a farm belt
// doesn't read as monotonous. Consulted by sim.js's streamObstacles ONLY when run._districtSeed is
// set (skies today, via CHAPTERS[chapter].render.districts — see that field's doc in state.js for
// why sim reading it is safe). Every DISTRICTS key should have an entry; streamObstacles falls back
// to the full STRUCTURE_KINDS list if one is ever missing (defensive, not expected in practice).
export const DISTRICT_STRUCTURE_KINDS = {
  downtown: ['tower'],
  suburbs:  ['house'],
  parks:    ['tree'],
  hills:    ['tree'],
  sea:      ['pier'],          // no land buildings — sea reads as sea, not a bald patch of ocean
  farms:    ['barn', 'silo'],
}

// Per-kind collider radius (v5.9.2, px) — THE fix for the "the fuck is this?" bug report's headline
// cause: a tower used to be drawn at PROP_SCALE.tower (134-172px) around a 10-28px collider rolled
// from one chapter-wide CHAPTERS.skies.obstacles.minR/maxR band shared by every kind, so a
// max-radius house could out-collide a min-radius tower — visible structures overlapping while
// their colliders sat far apart, which IS the reported soup of blobs. sim.js's streamObstacles now
// rolls a structure's `o.r` from THIS table (keyed by the same `kind` DISTRICT_STRUCTURE_KINDS
// picks), only for the chapter that actually has per-kind structures (run._districtSeed != null,
// skies today — same gate streamObstacles already uses for kind subsetting); every other chapter's
// obstacles keep rolling from their own chapter-wide obstacles.minR/maxR, untouched.
// render.js draws each structure proportional to o.r again (the pre-existing `o.r * 1.9`/`o.r * 2.0`
// idioms) instead of an absolute PROP_SCALE target — see PROP_SCALE's own doc below for why that
// table is floor-decor-only now. Bands stay small on purpose: the whole point of the v5.8 kaiju
// redesign is a player BIGGER than the city, not a city of skyscrapers — tower is still merely "the
// largest structure in a field of small ones," not large in absolute terms.
// CHAPTERS.skies.obstacles.minR/maxR are kept as the overall [min, max] across every band below
// (8 and 32) — test/sim-test.js's run CC.c3 reads .minR directly to size a synthetic structure, and
// sim.js's streamObstacles uses .maxR as the conservative worst-case radius for position-jitter
// slack BEFORE a cell's kind (and thus its real band) is known — see that function's comment.
export const STRUCTURE_RADIUS = {
  tree:  [8, 13],   // parks/hills — a scattered trunk/boulder accent, not a building
  house: [11, 16],  // suburbs
  pier:  [11, 16],  // sea — same tier as house, a dock structure, not a skyscraper
  barn:  [16, 22],
  silo:  [16, 22],  // same tier as barn
  tower: [21, 32],  // downtown — the largest structure in the field, not a real skyscraper
}

// PROP_SCALE — the single source of truth for a FLOOR-DECOR prop CLASS's absolute on-screen
// footprint, in px (v5.9 top-down region overhaul). Fixes the reported "cars bigger than houses"
// bug: render.js's prop tables mixed TWO sizing systems — `scale: [min,max]` (a multiplier on each
// texture's OWN arbitrary baked size) and `size: [min,max]` (absolute px) — with nothing enforcing
// that one class's scale range times its baked size couldn't exceed another's. Concretely: T.car is
// baked from TRAFFIC_CAR_LEN = 150 (below) and drawn at scale [0.55, 0.75] = 82-112px; T.house is
// hand-drawn at 48px baked and drawn at scale [0.9, 1.4] = 43-67px — a car outsizing a house by up
// to 2x, because the two scale ranges were tuned independently against two unrelated baked sizes.
// render.js is expected to look a class up here and fit its baked texture to an ABSOLUTE px target
// instead — ordering is then enforced by construction (disjoint bands), not by every prop table's
// author independently getting scale-times-bake-size arithmetic right.
//
// v5.9.2: this table is FLOOR DECOR ONLY (FLOOR_LAYERS' big/mid/detail populate callbacks below —
// bushes, litter, parked cars, crop rows, ...) — it does NOT size the crushable structures a chapter
// streams into run.obstacles (o.r). It used to (render.js's syncObstacles read PROP_SCALE[o.kind] to
// pick a structure's draw size, independent of its actual collider radius o.r), and that was exactly
// the "the fuck is this?" bug report's headline cause: a tower drawn at this table's 134-172px band
// around a 10-28px collider, so visible structures overlapped while their colliders sat far apart.
// Structures now size from o.r itself (STRUCTURE_RADIUS above, sim.js's streamObstacles; render.js
// draws proportional to o.r again) — see STRUCTURE_RADIUS's own doc for the full fix. Don't reuse
// this table for a structure's silhouette again; that reintroduces the bug.
//
// Bands are DISJOINT and ORDERED: max(class) < min(next class) for every row below, so nothing in
// a later row can ever render smaller than everything in an earlier one, however the two flanking
// values happen to land inside their own bands. Rows that are genuinely the same size TIER
// (fence/hedge, house/pier, barn/silo) intentionally share one band — that isn't an overlap, it's
// one class with two names.
//
// These are NOT real-world proportions, and must not be "corrected" toward them: PLAYER.radius is
// 22 (44px across), so literal realism (a real car is ~4.5m, a real house ~10m) would put half
// these classes at sub-pixel sizes next to the player. What the redesign needs is legibility and
// STRICT RELATIVE ordering — a car unmistakably reads smaller than a house — not literal scale.
// Bare `scale:` multipliers on an arbitrary baked size are the bug this table replaces; don't
// reintroduce them for any class listed here.
export const PROP_SCALE = {
  debris: [8, 18],    // rubble chunks — the smallest read
  crop:   [8, 18],    // farm crop rows — same tier as debris, different name
  car:    [20, 30],
  fence:  [32, 42],
  hedge:  [32, 42],   // same tier as fence
  tree:   [46, 60],
  house:  [64, 82],
  pier:   [64, 82],   // same tier as house — a dock structure, not a skyscraper
  barn:   [92, 128],
  silo:   [92, 128],  // same tier as barn
  tower:  [134, 172], // tower blocks — the tallest read
}

// Floor-decor density trim (v5.9.2, skies only) — the fourth of four compounding causes behind the
// "the fuck is this?" bug report: on top of the crushable structure field, render.js's shared
// FLOOR_LAYERS (big/mid/detail — bushes, hedges, litter, ...) scatter freely over EVERY chapter's
// ground, at a cell/chance shared by every chapter, so lowering them would thin every chapter's
// grass/leaf-litter, not just skies' cities. This is a skies-only EXTRA keep-fraction multiplied on
// top of each layer's existing chance (render.js's touchFloorCell, gated on chapterHasDistricts,
// same "self-gating predicate, no-op outside its own scope" idiom the road/clutter/border floor
// layers already use) — every other chapter's identical layers are read with no `skiesKeep` set and
// are bit-identical to before. `big` is cut hardest: it's the BULKIEST tier (90-175px tree/bush
// clumps for parks/hills) and the single biggest contributor to the reported green-blob wall; `mid`
// less so; `detail`'s small leaf/pebble specks are left mostly alone — fine texture, not "blobs".
// What's left to carry each district's read is its GROUND SURFACE (T.districtGround, render.js's
// populateBlotch — a per-district signature pattern already drawn at chance 1.0, unaffected by any
// of this): sparse, deliberate decor on top of a surface that already reads as itself.
export const SKIES_FLOOR_KEEP = { big: 0.22, mid: 0.45, detail: 0.75 }

// ---- Structure ART (v5.10 art direction, spec §5-§6) — render-only, skies-only ------------------
// "A house is a box plus a triangle." Correct, and the cause is structural, not stylistic: T.house /
// T.barn / T.silo are SIDE-VIEW, upright, base-anchored bakes sitting under a TOP-DOWN camera. A
// side-view house drawn from above can only ever be a box plus a triangle. All six kinds are redrawn
// as TOP-DOWN PLANS, which is what makes room for the detail this chapter's scale actually needs
// (in kaiju fiction, scale is communicated by the DENSITY OF SMALL DETAIL around the monster — that
// is why the counts below are so specific; "some windows" bakes as a smear, "a 4x6 grid, 11 lit"
// bakes as a building).
//
// THE SHADOW LAW. Every structure and every floor prop in this chapter bakes its OWN cast shadow at
// ONE CONSTANT OFFSET FOR THE WHOLE REGION. One light direction across an entire region is the
// cheapest, strongest "this is a photograph of a place" cue available, and it costs nothing per
// frame. It also SHIFTS EVERY PROP'S BOUNDS and therefore every anchor — which is exactly the
// v5.9.2 "the fuck is this?" bug class (sprites sitting off their colliders). Mandatory in every
// shadowed bake: a symmetric zero-alpha bounds keeper drawn first,
// `g.rect(-R, -R, 2*R, 2*R).fill({ color: 0x000000, alpha: 0 })`, so ax/ay stay at 0.5.
export const SKIES_SHADOW = { dx: 0.22, dy: 0.28, color: 0x000000, alpha: 0.35 }
// Bake canvas size for a structure plan. syncObstacles draws at `o.r * 1.9 / max(tex.w, tex.h)`, so
// a tower (STRUCTURE_RADIUS.tower 21-32) lands at 40-61px ON SCREEN. Draw on 128px (-> 256px texture
// at bake()'s resolution: 2) so a 4px window survives the minification instead of dissolving.
export const SKIES_BAKE_PX = 128

// Per-kind plan palettes and DETAIL COUNTS. The counts are the spec's and are not decorative
// suggestions — they are the difference between "a roof" and "a roof with six shingle courses".
// Structures are MASS-CENTRED, not base-anchored (spec §5.1.3): render.js's STRUCTURE_SKINS entries
// for these gain `topDown: true`, clumpA sits at (0, 0) instead of (0, o.r * 0.28), and clumpB
// becomes the LOT detail tucked at the rim. T.obFoot's rim-lands-exactly-on-o.r contract is what the
// sim actually tests — re-verify it by eye after the switch (spec §9.8).
export const SKIES_STRUCTURE_ART = {
  // downtown's landmark building is currently STRUCTURE_SKINS.tower = ['rubble','rubble'] — the
  // GENERIC RUBBLE PROP, which is also downtown's floor debris (kill list §8.8).
  tower: {
    deck: 0x6d7480, edge: 0x2b3038, parapet: 0x878e99,
    gravel: 0x7d838d, gravelFlecks: 44, gravelAlpha: 0.5, gravelPx: 1.5,
    hvac: 0x9aa1ab, hvacBase: 0x3a4048, hvacUnits: 2, hvacFins: 5,
    stairwell: 0x848b96, stairDoor: 0x2a2f36,
    waterTank: 0xb0a08a, tankRungs: 6,
    mast: 0x2f343c, mastPx: 22, guyWires: 3, lampDark: 0x5a1a16,   // the LIT aviation lamp is a
                                                                   // separate pooled blink sprite —
                                                                   // see SKIES_LIGHT.aviation
    flank: 0x3c424c, windowCols: 4, windowRows: 6, windowsLit: 11, windowsDark: 13,
    windowLit: 0xffd08a, windowDark: 0x1a1f28,   // palette law 1: a <=5px static lit rectangle, the
                                                 // ONLY form warm gold is allowed to take
    fireEscape: 0x2f343c, escapeTicks: 4, escapeLandings: 3,
    chamferPx: 10,          // two corners chamfered — a chamfer reads as a designed building; a
                            // rounded blob reads as rubble, which is precisely the bug being fixed
    variantB: { helipad: true, helipadR: 16, helipadAlpha: 0.7, hvacUnits: 3, windowsLit: 7 },
                            // two variants is how "window flicker" is faked with ZERO per-frame Graphics
  },
  house: {
    roofLit: 0x8a5c46, roofShade: 0x7a4e3b, ridge: 0x5f3c2d,
    shingleCourses: 6, shingleAlpha: 0.15,
    gutter: 0xb9ae9c, chimney: 0x8f7a68, dormerPane: 0xffd08a, skylight: 0x9fc3d8, skylightAlpha: 0.6,
    garagePanels: 5,
    lot: { drive: 0x9a958a, lawn: 0x4e5f42, lawnAlpha: 0.3, hedgeLobes: 7, deckPlanks: 7,
           bins: [0x2e6f4a, 0x2b4a7a] },        // the lot is baked INTO the same texture as the
                                                // house — a driveway that doesn't touch its house
                                                // is worse than no driveway
    variantB: { pool: 0x2f6f9e, litTint: true, coping: 0xf0efe9 },  // chlorine blue must bypass the
                                                                    // floor tint or it goes to mud
    porchLamp: 0xffd08a,
  },
  barn: {
    roofLit: 0x9c3f30, roofShade: 0x74302a, battens: 9, rust: 0x7a4a2c, rustAlpha: 0.5,
    cupola: true, hayDoor: 0x2e1a14, paddockPosts: 8, muck: 0x5a4a34, bales: 3, mudTrack: 0x6b5a44,
  },
  silo: {
    body: 0xc7c9cc,         // galvanised steel — DELIBERATELY the brightest object in a farm belt at
                            // night, which is what makes a farm district legible at a glance
    facets: 16,             // conical cap as radial facet lines converging on an OFF-CENTRE apex —
                            // the off-centre apex is the ENTIRE reason it reads as a cone, not a disc
    apexOffset: 0.22,       // fraction of the radius the apex sits off centre
    seams: 4, seamAlpha: 0.35, ladderRungs: 9, spill: 0xdcc98a, spillAlpha: 0.4,
  },
  pier: {
    boards: 14, gaps: 3,    // 3 ACTUAL GAPS through which the dark water shows — a hole in the fill,
                            // not a dark line. That single detail is what sells wood over water.
    pilings: 6, bollards: 4, crane: true,
    shackRoofArcs: 9, lantern: 0xffb45a, tyre: 0x2a2c30, dinghy: true, waveLines: 2,
  },
  tree: {
    lobes: 6, scallops: 12,          // scalloped radial edge, NEVER a smooth circle
    canopyLit: 0x7f9a6a, canopyShade: 0x3d4c36, branchSpokes: 7, trunk: 0x3a2e24,
  },
  // hills' CRUSHABLE structures are currently STRUCTURE_SKINS.rock = the hills FLOOR-DECOR boulders
  // at a bigger scale (kill list §8.7). A dedicated bake, at the same cost.
  outcrop: {
    facets: 3, facetLum: [1.0, 0.78, 0.58],   // three flat planes at differing luminance
    body: 0x8c8377, lichen: 0x7f8f6a, lichenDots: 12, screeChips: 5,   // scree fans DOWNSLOPE, in
                                                                       // the SKIES_SHADOW direction
  },
}

// Ruins (spec §5.9) — swapped in PERMANENTLY at a crush site by the render-local crush ledger
// (SKIES_LIGHT.ledger below), keyed by WORLD POSITION, not obstacle identity: by the time this
// draws, the obstacle is already gone from run.obstacles. A KIND-SPECIFIC ruin beats a generic scar
// for the same cost, and it is the only thing in the chapter that records what you did.
export const SKIES_RUIN = {
  scar: 0x0e1116, scarAlpha: 0.5, rebarTicks: 6,   // the universal foundation scar under all six
  byKind: {
    tower: { slabSteps: 3, rubbleChunks: 5, rebar: 4, cornerColumn: true, scorchRing: true },
    house: { timberX: 4, chimneyStack: true, shingles: 9, flattenedCar: true },   // a SURVIVING
                                                                                  // CHIMNEY says
                                                                                  // "house" instantly
    silo:  { splitWallArc: true, grainFan: 0xdcc98a },
    barn:  { collapsedV: true, hayDownwind: true },   // hay strewn along STORM_VIS.windAngle, so the
                                                      // wreckage agrees with the weather
    pier:  { plankRaft: 7, oilSlick: true },
    tree:  { stump: true, splinterRing: true, branches: 5 },
  },
}

// Vehicles (spec §6) — "you must be able to tell a bus from a sedan" is literally the brief.
// CLUTTER_BY_DISTRICT.suburbs currently uses T.car: the CITY chapter's yellow traffic taxi, baked
// from TRAFFIC_CAR_LEN = 150 (kill list §8.9). Three silhouettes from one bake set instead.
// Dimensions are in px at PROP_SCALE.car's band; the length ratios (26/32/54) are what carry the
// read, not the absolute size.
export const SKIES_VEHICLE = {
  sedan: { len: 26, w: 12, windows: 2, wheels: 4, mirrors: 2, seams: 2 },
  van:   { len: 32, w: 13, windows: 1, wheels: 4, roofVent: true, sliderSeam: true },  // no rear screen
  bus:   { len: 54, w: 14, windowBays: 6, wheels: 6, roofHatches: 2, destBoard: true },
  glass: 0x1e2733, glassAlpha: 0.85, wheel: 0x15181c, tail: 0xff5545, head: 0xfff6d0,
  // Deliberately DESATURATED: the saturated hues in this chapter belong to the threats (SKIES_FX)
  // and to the container yard (DISTRICT_SURFACE.sea). litTint so a parked car doesn't inherit the
  // grass green of a park or the khaki of a farm.
  bodyTints: [0x8f97a3, 0x6f7f8f, 0xa8a094, 0x7a5b52, 0x4f6b78, 0x8a8f7a], litTint: true,
  alignToKerb: true,   // PARKED CARS ALIGN TO THE KERB ANGLE (roadAt returns it) OR TO THE PAINTED
                       // STALL ANGLE. NEVER random rotation — random rotation is the single loudest
                       // tell that a scene was scattered by an algorithm.
}

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
// v5.6.14 (user): a car ONE-SHOTS the light roster — a pigeon or a cardboard drone does not
// survive being run over; only elites (and the vacuum, which is street furniture itself) take
// TRAFFIC_DMG like everyone else. rosterIds, checked non-elite-only in stepTraffic.
export const TRAFFIC_SQUASH = ['ratDrone', 'pigeon']

// ---- Skies chapter behavior flags (v5.4, see sim.js) -----------------------------------------
// strafe (skies' fighter jets): flies straight passes THROUGH the player rather than chasing.
// State on e._strafeState ('bank'|'telegraph'|'run') / _strafeT / _strafeDirX, _strafeDirY (LOCKED
// at the end of 'bank' and held through 'telegraph').
//   bank:       STRAFE_BANK_T of drifting toward a point STRAFE_STANDOFF px from the player on a
//               random bearing, at STRAFE_BANK_SPEED_MUL. At its END the heading locks onto the
//               player and a {type:'strafeLock'} event fires (state.js's event-contract doc).
//   telegraph:  STRAFE_TELEGRAPH_T of holding that locked position — the wind-up the player reacts
//               to (see below).
//   run:        STRAFE_RUN_T of straight flight at STRAFE_RUN_SPEED_MUL, no steering (it flies past
//               and well beyond you), then back to 'bank'.
// Damages: the PLAYER only, via ordinary contact damage. No run.* array.
// v5.9.1 bugfix ("jets are unavoidable when they cross the screen", playtest report): STRAFE_
// TELEGRAPH_T and the 'telegraph' state are new — there used to be NO gap between the heading
// locking and the fast run starting, so a jet crossing the screen was the first thing the player
// saw AS it hit them. 0.5s mirrors DIVE_TELEGRAPH_T (garden's wasp dive, an even faster relative
// speed multiplier that already ships with exactly this kind of pause) and is enough to dodge: the
// jet locks STRAFE_STANDOFF (420px) from the player, who moves at PLAYER.baseSpeed (220px/s) — 0.5s
// buys up to 110px of lateral clearance, over 3x the ~34px (PLAYER.radius + jet radius) needed to
// step off the dead-straight line it committed to. STRAFE_RUN_SPEED_MUL and jet contact damage
// (ENEMIES.wisp.dmg=5, ~5% of PLAYER.baseHP) are deliberately UNCHANGED: the bug was avoidability,
// not power, and jet is ~55% of late spawns (WAVE_TABLE) — a per-hit or speed nerf here would move
// overall chapter difficulty far more than this fix calls for.
export const STRAFE_STANDOFF = 420
export const STRAFE_BANK_T = 1.3
export const STRAFE_BANK_SPEED_MUL = 1.6
export const STRAFE_TELEGRAPH_T = 0.5   // s of held-position wind-up between lock and run (see above)
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
// v5.6.15: was 300 — OUTSIDE every skies weapon's reach (roar L1 ~216 incl. body, tailSwipe 200,
// debrisToss L1 280), so the chapter's COMMON spawn was effectively unkillable and accumulated:
// measured 217 helicopters alive at t=180 on a kiting starter run, 2796 damage taken vs the
// garden's 969 — the user called the chapter impossible and was right. 180 sits inside the
// starter cone: still a hovering standoff ship, no longer a safe one. (The owl lesson, chapter-
// scale: every enemy must be killable by the chapter's own kit.)
export const MISSILE_STANDOFF = 180
export const MISSILE_HOVER_SPEED_MUL = 0.9
export const MISSILE_DEADZONE = 10      // px band around the standoff where it holds still (cf. DIVE_HOVER_DEADZONE)
export const MISSILE_INTERVAL = 6.0     // s between volleys (v5.6.17: was 4.0 — each heli shoots
                                        // occasionally; the THREAT is the pack, not any one ship)
export const MISSILE_COUNT = 2          // missiles per volley (v5.6.17: was 3 — volume, see FIRE_RANGE)
export const MISSILE_GAP = 0.16         // s between missiles within one volley
// v5.6.15: 240 -> 200. The comment below has ALWAYS said outrunning is the counterplay, but at
// 240 vs PLAYER.baseSpeed 220 the missile was strictly faster — the stated counterplay was
// mathematically impossible (the pull-beam rule again: impossible to IGNORE is fine, impossible
// to ESCAPE is not). Attribution probe: missiles were 81% of all damage taken in the chapter.
export const MISSILE_SPEED = 200        // px/s — under PLAYER.baseSpeed, so running works
// v5.6.17: 1.6 -> 0. Homing was the design smell: every fast attack in this game TELEGRAPHS AND
// COMMITS (pounce "ignoring the player's moves", lineCharge/strafe "no steering", artillery's
// telegraphed shell) — the missile was the lone tracking exception, and tracking is why the swarm
// read as unfair even after the volume cuts. A rocket now flies STRAIGHT at where you were when
// it fired: sidestep it like everything else. Speed stays under PLAYER.baseSpeed on top (Y.f
// pins that), so both escapes work — step out of the line, or simply outrun it.
export const MISSILE_TURN = 0           // rad/s — rockets COMMIT; dodging is the counterplay
export const MISSILE_LIFE = 2.6         // s before a missile fizzles (v5.6.15: was 4.0 — a dodged
                                        // missile is GONE, not circling back for another pass)
export const MISSILE_R = 8              // px, missile hit radius
// v5.6.17: only helicopters ON STATION fire — beyond this range of the player the volley timer
// still ticks but the volley is held (no shot). The accumulated far pack (50-85 alive by late
// run) was multiplying volleys from OFF-SCREEN into a wall of shots; "still too many missiles".
// 620 ≈ just past a phone screen's half-diagonal: everything that shoots you is visible.
export const MISSILE_FIRE_RANGE = 620
// v5.6.17: hard ceiling on rockets in flight, game-wide. Helis bunch at the standoff ring, so
// per-ship cadence alone can't bound the on-screen volume — measured 94 concurrent at late run
// ("still too many missiles"). A full volley is held (not queued) while the sky is saturated.
export const MISSILE_MAX_LIVE = 18
export const MISSILE_DMG = 14
export const MISSILE_BLAST = 40         // px, explode-event radius on impact (visual only — no splash)

// artillery (skies' tank columns AND its AA-turret elites): a slow mover that shells the player
// from wherever it stands. State on e._shellT (s until the next shell).
// Every ARTILLERY_INTERVAL s it pushes a run.bombs entry (the EXISTING volatile-bomb array —
// { x, y, radius, fuse, duration, dmg }) at the player's PREDICTED position: player position +
// player velocity × ARTILLERY_LEAD. So it telegraphs for ARTILLERY_FUSE seconds, then explodes,
// damaging the PLAYER and ENEMIES alike (stepBombs already does exactly this — no new code path).
// Movement is otherwise a plain slow seek. Elites use the same flag with ARTILLERY_ELITE_* below.
// v5.7.5: a tank only shells while within ARTILLERY_FIRE_RANGE of the player (out of range its
// timer holds near-ready, like MISSILE_FIRE_RANGE). Without the gate every tank on the MAP fires,
// and since tanks are near-unkillable while kiting they accumulate into a full-screen barrage
// (probe: 77 concurrent telegraphs at 5 min) that reads as "the sky wants ME dead", not weather.
export const ARTILLERY_FIRE_RANGE = 640
// Hard cap on live shell/strike telegraphs (artillery + bombardment; volatile death-bombs exempt —
// that's an elite affix, not shelling). The range gate alone fails late-game: tanks are near-
// unkillable while kiting, so 150+ accumulate AROUND the player and the barrage rebuilds inside
// the gate (probe: still 77 concurrent telegraphs). Same backstop shape as MISSILE_MAX_LIVE.
export const SHELL_MAX_LIVE = 6
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
// contract) at AREA-uniform random points within BOMBARDMENT_SPREAD px of the player.
// v5.7.5: spread 280 → 620 and sqrt-radius sampling. The old numbers put every strike in a tight
// disc centered on the player, density peaking AT the player — targeted fire, not a storm. Wide +
// area-uniform makes lightning mostly ambient (~3% of strikes threaten), with tanks in
// ARTILLERY_FIRE_RANGE carrying the aimed pressure.
export const BOMBARDMENT_COUNT = 2
export const BOMBARDMENT_SPREAD = 620   // px, scatter radius around the player (≈ full screen)
export const BOMBARDMENT_FUSE = 1.2     // s of telegraph
export const BOMBARDMENT_RADIUS = 85    // px, blast radius
export const BOMBARDMENT_DMG = 18

// ---- Crushing & rampage (v5.8 kaiju redesign, skies-only — gated on CHAPTERS[chapter].crush,
// see sim.js's stepCrush/stepRampage) ------------------------------------------------------------
// A structure overlapping the player's crush radius is destroyed OUTRIGHT: no HP, no per-hit
// damage, no partial-crush state — it either overlaps this frame or it doesn't. Rev.1 of this
// redesign gave structures HP and that was cut on review: a structure with HP is a pocket where
// contact enemies get pushed out (stepObstacles' enemy loop) and the player doesn't (the whole
// point of `crush`) — i.e. free shelter every ~260px (CHAPTERS.skies.obstacles.cell), and "high
// HP" would just read as "longer invulnerability" while it whittles down. Instant pop removes the
// exploit by removing the structure (see the design doc §2).
//
// CRUSH_XP: xp awarded per crushed structure, via the same run.gems.push({x,y,xp}) path a kill
// uses (dealDamage, sim.js:1599) — so it rides every existing xp multiplier (passives.xpGain,
// mods.xpMul, GEM_VALUE=1) for free. MUST stay small: stepLevelUp (sim.js) fires at most one
// level per FRAME and hands control to a blocking modal, so crushing a dense run of structures in
// a single rampage would otherwise queue back-to-back level-up screens at exactly the moment the
// design wants uninterrupted momentum (the "XP flooding" hazard, design doc §2). 1 matches the
// smallest per-kill xp in the game (ENEMIES.drone/wisp.xp, both 1) — a crush is worth exactly as
// much as the cheapest kill, never a shortcut past it.
export const CRUSH_XP = 1

// Rampage meter (run.rampage, 0..1; run.rampageT, s of the buff remaining — see state.js). Fills
// on crush (RAMPAGE_GAIN per structure), bleeds continuously at RAMPAGE_DECAY/s the rest of the
// time (after a RAMPAGE_GRACE_T grace window since the last crush, see below) — the decay IS the
// design: a bank filled at leisure rewards patience, a streak that bleeds unless you keep wrecking
// rewards momentum (the kaiju verb, design doc §3). At a FULL bar, RAMPAGE activates for
// RAMPAGE_DURATION s: the crush radius widens from PLAYER.radius to PLAYER.radius *
// RAMPAGE_CRUSH_MUL (stepCrush) — you flatten a swath without touching it. That is the ENTIRE buff:
// no speed/damage multiplier. Rev.1 granted those too and both were cut — p.speed and p.damageMul
// are never assigned anywhere in sim.js (set once in createRun, read through multipliers at
// spawnEnemy/stepPlayerMovement/applyDamage), so mutating them in place would leak permanently on
// re-trigger or on death mid-buff. A radius is one number, re-derived fresh every frame from
// rampageT, and can't leak.
//
// v5.9.1 retune ("the meter is unfillable and drains too fast", playtest report — exactly the
// failure design doc §3's "open tuning risk" flagged and deferred to a play pass). The shipped
// numbers (GAIN 0.05, DECAY 0.05/s) needed a sustained >1 crush/SECOND just to break even; nothing
// in the actual field supports that. Derived from the real streaming geometry instead of guessed:
//
//   - CHAPTERS.skies.obstacles is {count:40, cell:260, minDist:160} — streamObstacles' `prob`
//     formula already exceeds 1.0 at this count/cell pair (see CHAPTERS.skies.obstacles' own
//     comment, above), so structures saturate: effectively ONE per 260px cell, minus the ~17%
//     roads carve out.
//   - Committed rate — a player deliberately routing/weaving through a dense block, one structure
//     roughly every cell crossed: 260px / PLAYER.baseSpeed (220px/s) ≈ 1.18s/structure ≈ 0.85/s.
//   - Passive rate — walking a straight line with NO routing effort (crushables don't block
//     movement, so this is the true floor): swept corridor width 2*(PLAYER.radius + avg structure
//     radius) = 2*(22+19) = 82px, structure density ~0.83/(260*260)px² (saturated fill minus
//     roads) ⇒ 82 * 220 * 0.83/67600 ≈ 0.22 structures/s.
//
//   GAIN=0.15, DECAY=0.03/s: committed net rate = 0.85*0.15 - 0.03 ≈ 0.0975/s ⇒ ~9 crushes over
//   ~10.3s to fill a bar from empty — inside the target 8-15s "satisfying, committed stretch".
//   Passive net rate = 0.22*0.15 - 0.03 ≈ +0.003/s ⇒ ~300s (a full RUN_DURATION) to fill from pure
//   aimless walking — i.e. it effectively never fills without deliberately routing, which is the
//   point (raising GAIN alone without lowering DECAY would have kept the passive case net-positive
//   too, at 0.22*0.15=0.033 > the old 0.05 decay's near-miss).
export const RAMPAGE_GAIN = 0.15        // meter fraction added per crushed structure
export const RAMPAGE_DECAY = 0.03       // meter fraction lost per second while NOT in an active rampage (and past the grace window)
// v5.9.1: a couple of seconds between structures (crossing a gap, sidestepping an enemy) at the
// committed ~0.85/s crush rate above is normal cadence, not abandoning the rampage — hold decay off
// for this long after the LAST crush so ordinary gaps don't quietly bleed progress (design doc §3's
// grace-period suggestion). Set by stepCrush on every crush, ticked down by stepRampage.
export const RAMPAGE_GRACE_T = 1.5      // s of no decay after the most recent crush
export const RAMPAGE_DURATION = 5       // s the widened crush radius stays active once triggered
export const RAMPAGE_CRUSH_MUL = 3      // crush radius multiplier while rampageT > 0 (PLAYER.radius * this)

// ================================================================================================
// SKIES ART DIRECTION (v5.10) — docs/superpowers/specs/2026-07-25-skies-art-direction.md
// ================================================================================================
// WHY THIS SECTION EXISTS. The playtest verdict on the shipped chapter was "the designs are very
// ugly", "you are getting lazy with effects, reusing too much, the dash telegraph for planes is the
// same colour as everything, the storm hit, the tank hit, even other chapters". That was not a
// judgement call, it was a measurable fact about the data: every skies threat drew from ONE palette
// object (LIGHTNING.telegraph, above) and two shared Kenney particle textures, so six different
// things that can kill you were rendered in the same electric blue with the same soft round burst.
//
// Everything below is RENDER-ONLY, SKIES-ONLY DATA. Nothing here is imported by sim.js, nothing
// here changes a hitbox, a timing that damage keys off, or any other chapter (grep: no other
// chapter reads a SKIES_*/DISTRICT_SURFACE/ROAD_PAINT/SKIES_LIGHT key). Where an FX timing must
// line up with a real sim timing it REFERENCES the existing sim constant (STRAFE_TELEGRAPH_T,
// ARTILLERY_FUSE, BOMBARDMENT_FUSE, MISSILE_LIFE, RAMPAGE_DURATION) rather than restating it — the
// spec's "arrival clock" rule (an FX clock that finishes early or late is a bug) is only enforceable
// if the clock and the fuse are literally the same number. THAT is why this section sits down here,
// after the skies sim block, instead of up beside LIGHTNING/STORM_VIS where it thematically belongs:
// an object literal is evaluated when the module is, so referencing STRAFE_TELEGRAPH_T from above its
// declaration throws `Cannot access 'STRAFE_TELEGRAPH_T' before initialization` (const TDZ) — i.e. a
// blank page in prod, verified the hard way while writing this. Anything added here that references a
// sim constant must stay BELOW that constant's declaration.
//
// THE THREE PALETTE LAWS (spec §2) — enforce these in review, they are the whole point:
//   1. WARM SODIUM GOLD IS AMBIENCE AND IS NEVER A THREAT. Soft fill at alpha <= 0.16 or a static
//      <= 5px lit rectangle. It never strokes, never moves, never pulses.
//   2. ATOMIC CYAN-GREEN IS THE PLAYER AND IS NEVER A THREAT. If it is on screen, YOU are the danger.
//   3. ICE BLUE-WHITE IS SEARCHLIGHT LIGHT ONLY — taken away from the jet lane and the bomb
//      telegraph, both of which wore it (see LIGHTNING.telegraph's v5.10 note above).
export const SKIES_PALETTE = {
  sodium: 0xffb45a,      // law 1: street-lamp light
  sodiumLit: 0xffd08a,   // law 1: a lit window pane
  sodiumSpill: 0xffc46a, // law 1: interior spill from a structure as it collapses (ONE beat, then dark)
  sodiumMaxAlpha: 0.16,  // law 1's hard ceiling for any soft gold fill
  player: 0x4bffc8,      // law 2: atomic cyan-green — the kaiju and nothing else
  playerHot: 0xd8fff4,   // law 2: the charged/hot end of the same ramp
  searchlight: 0xdfefff, // law 3: ice blue-white, military light, exclusively
  alert: 0xff3b30,       // RED IS RESERVED FOR ALERT (klaxon rings, aviation lamps, the rampage
                         // searchlight flip) — never a telegraph. A red telegraph is what made the
                         // old chapter read as "everything is a bomb".
}

// The shadow-stroke rule (spec §2). Every threat stroke is drawn TWICE: this near-black at
// `width + widen` under the colour on top. That is what lets six SATURATED threat palettes stay
// legible over six district floor tints without raising alpha — the alternative is the mid-tint
// mush the chapter ships today. One helper in render.js (`inkStroke`), used by every telegraph.
export const SKIES_INK = { color: 0x080c14, widen: 2.5, alpha: 0.5 }

// Beyond this distance from the player a telegraph glyph degrades to its impact mark alone (drop
// the rails, the graduations, the trajectory ghost, the designation line). SHELL_MAX_LIVE (6) +
// MAX_STRAFE_LOCKS telegraphs of graduated ticks drawn live do not hold on a phone; the far ones
// carry no information a distant player can act on anyway.
export const SKIES_TELEGRAPH_LOD_PX = 700

// Full-field flash budget (spec §1.3) — CENTRAL, not per-effect. Photosensitivity, and legibility:
// LIGHTNING.flash.strikeAlpha is 0.55 and a late-run barrage lands several strikes a second.
// render.js keeps `flashCooldown`: a flash inside the window is admitted at `suppressedMul` of its
// requested alpha instead of being dropped (a strike you can't see is worse than a dim one), and
// the rampage screen bloom is forced to alpha 0 on any frame where the flash is above `bloomCutoff`
// — the two never co-render.
export const SKIES_FLASH = { minGap: 0.9, suppressedMul: 0.4, bloomCutoff: 0.05 }

// The second particle pool (spec §1.2). MAX_PARTICLES is ONE global 200-slot ring buffer in
// render.js and `particleCursor` wraps silently — adding persistent missile smoke, crush dust and
// artillery clods to it would evict every hit/kill/pickup particle in the GAME, with no error.
// Only three effects use this pool. The cap is derived, not guessed: `emitters` nearest live
// missiles x (puffLife / puffEvery) = 6 x 14 = 84 live puffs worst case, under `max`.
export const SKIES_SMOKE = { max: 90, emitters: 6, puffEvery: 0.10, puffLife: 1.4 }

// Rampage jamming (spec §3, rampage row): while run.rampageT > 0 every ENEMY telegraph glyph
// visibly breaks up — you are not just stronger, their targeting is failing. Per-frame, per glyph
// segment: drop the segment with probability `dropout`, and scale its alpha by
// `alphaMin + alphaJitter * random()`. Lock diamonds re-snap to a random offset for `resnapFrames`
// frames every ~`resnapEvery` s. On rampage END the dropout decays to 0 over `recoverT` so the
// picture RE-ACQUIRES rather than snapping back (a hard snap reads as a rendering bug).
export const SKIES_JAM = {
  dropout: 0.22, alphaMin: 0.55, alphaJitter: 0.45,
  resnapEvery: 0.5, resnapFrames: 2, resnapPx: 14, recoverT: 0.6,
}

// ---- THE THREAT TABLE (spec §3) ----------------------------------------------------------------
// Six threats separated on THREE AXES AT ONCE — colour family, shape language, motion verb — with
// NO TWO SHARING MORE THAN ONE AXIS. That constraint is the entire fix for "everything looks the
// same"; it is also an acceptance test (spec §9.4/§9.5: a reviewer who has never played must name
// each threat from a still frame, and again from that frame in GREYSCALE — which is what proves the
// separation is carried by shape and composition, not by hue).
//
//   threat     | colour            | shape                        | motion
//   -----------|-------------------|------------------------------|--------------------------------
//   strafe     | halogen + orange  | parallel hairlines + ellipse | travels ALONG a line
//   missile    | magenta           | rotating diamond + helix     | flies AT you, trail persists
//   artillery  | dull olive/ochre  | square box + diagonal hatch  | FALLS; opposed shrink/grow
//   sky        | violet            | leaning vector + chevron ring| DESCENDS, then cracks; sparks rise
//   crush      | grey/material     | squashed skirt + hard shards | SLOW settle; adds geometry
//   rampage    | atomic cyan       | rings + dorsal plates        | sustained pulse OUT FROM YOU
//
// Every INCOMING threat also carries exactly ONE travelling element that arrives on the exact frame
// damage lands (the "arrival clock"), so the player reads four clocks at four speeds instead of "the
// circle got brighter". Each clock's duration below is the SIM fuse itself, by reference.
export const SKIES_FX = {
  // JET STRAFE — the only threat whose damage point TRANSLATES across the screen, and the only one
  // with NO FILLED AREA AT ALL. Orange appears nowhere else in the chapter. Kills the shipped lane's
  // filled electric-blue band + chevrons outright (it was lineCharge's telegraph in a blue coat).
  strafe: {
    // The lane is drawn at the TRUE contact half-width, so what you see is exactly what hits you —
    // PLAYER.radius + the jet's own radius (jets are the 'wisp' archetype, ARCHETYPE_TYPE above).
    // render.js's enemyDrawScale (0.55) shrinks the SPRITE only and must NOT be applied here.
    halfW: PLAYER.radius + ENEMIES.wisp.radius,   // = 34 px
    // Lane length, derived from the sim so the drawn lane is the flight path and not a guess:
    // wisp speed 165 x skies jet speedMul 1.1 x STRAFE_RUN_SPEED_MUL 4.5 x STRAFE_RUN_T 1.0 ≈ 817.
    // (Derived here, not given in the spec — flagged in the handover.)
    laneLen: 820,
    railColor: 0xffffff, railAlpha: 0.45, railW: 1.5,  // two HAIRLINE rails, no fill between them
    poolColor: 0xfff6e2,                               // halogen landing-light pool, ADDITIVE
    poolAlphaMin: 0.10, poolAlphaMax: 0.26,            // ramps as it travels the lane
    poolAspect: 0.22,                                  // long : narrow — the T.landingPool bake ratio
    // ARRIVAL CLOCK: the halogen pool races from the jet's end of the lane to the player's end over
    // STRAFE_TELEGRAPH_T and arrives on the frame the run begins.
    telegraphT: STRAFE_TELEGRAPH_T,                    // 0.5 s (sim constant, above)
    runT: STRAFE_RUN_T,                                // 1.0 s of the run itself
    // The damage is then a STITCH: paired dashes walking the lane at STRAFE_RUN_SPEED_MUL.
    tracer: 0xff6a10, tracerCore: 0xfff2c0,            // tracer orange — unique to this threat
    dashLen: 9, dashW: 3,
    dashPitch: 30,        // px between dash pairs along the lane (derived: ~3x dashLen reads as a
                          // stitch rather than a dotted line — not specified in the spec)
    gritColor: 0x8f8a7c, gritPx: 6, scorchPx: 3,       // each dash pops a grit puff + a scorch tick
    navRed: 0xff2d2d, navGreen: 0x2dff6a,              // the jet's own nav lights (port/starboard)
  },

  // HELICOPTER MISSILE — the only travelling PHYSICAL projectile, the only SPIRAL in the game, the
  // only mark anchored to the PLAYER, and the only magenta in any of the seven chapters.
  missile: {
    designator: 0xff2d6f,   // the lock diamond + designation line: signal magenta
    reticleCore: 0xffd7e6,  // the pale core of the reticle, and the impact star
    exhaustHot: 0xfff2c0, exhaustCool: 0xffb35c,       // dart exhaust, hot core -> cooler flare
    smokeNear: 0x6a4a5e, smokeFar: 0x3a2c33,           // ribbon fades along this ramp as a puff ages
    impactCore: 0xffd7e6, impactSoot: 0x2a2620,        // magenta star over black smoke ring — NOT
                                                        // explosionBurst's orange spark_04 (kill list §8.5)
    // ARRIVAL CLOCK: a bead crawls the designation line from the helicopter's nose and reaches the
    // diamond on the LAUNCH frame; the diamond shrinks in DISCRETE SNAP STEPS, never a smooth lerp
    // (a mechanical reticle, not an organic pulse — and it reads at 4 fps of information, which
    // survives being one of eighteen on screen).
    lockT: 0.6,             // s of lock before each volley (spec §3; the sim's own cadence is MISSILE_INTERVAL)
    snapSteps: 4,           // discrete shrink steps per second
    diamondPx: 48,          // REF size of the T.lockDiamond bake
    life: MISSILE_LIFE,     // 2.6 s — the dart's own flight (sim constant, above)
    ribbonLife: 1.4,        // s the smoke helix persists AFTER the dart is gone (= SKIES_SMOKE.puffLife)
    // The dart is DEAD STRAIGHT (MISSILE_TURN = 0, a deliberate v5.6.17 sim decision); the SMOKE is
    // what curls. Lateral sine offset that GROWS as the puff ages = a corkscrew seen from above.
    helixAmpPx: 7,          // px of lateral offset at puff birth...
    helixGrowPx: 16,        // ...growing to this by end of life
    helixTurns: 2.4,        // sine cycles over the ribbon's length
  },

  // TANK ARTILLERY (run.bombs, src: 'gun') — the only SQUARE telegraph, the only HATCHED fill in the
  // game, the only DESATURATED telegraph, and the only one that draws a curved line back to a ground
  // origin. That last one is the mass-read (spec §9.7): a screenful of shells visibly RADIATES from
  // scattered tanks, where a screenful of sky strikes is all-parallel.
  artillery: {
    bracket: 0xc9b26a,      // dull ordnance ochre — the L corner brackets + ranging graduations
    hatchBar: 0x0a0d12, hatchFill: 0xc9b26a, hatchAlpha: 0.18,   // the sweeping clock hand
    shellShadow: 0x0a0c10, shellShadowAlpha: 0.55,               // the falling shell's OWN shadow
    ghost: 0xc9b26a, ghostAlpha: 0.28,                           // trajectory arc back to (ox, oy)
    eliteTick: 0x7fffb0,    // radar-green tick on the bracket — AA-turret elites only
    muzzle: 0xffd98a, muzzleT: 0.06,                             // s, the firing tank's flash
    fireball: 0xe8641e, fireballCore: 0x16120e,                  // BLACK-cored fireball: ordnance,
                                                                  // not a cartoon pop
    clod: 0x6b4a2a, clodCount: 10, clodSplashAlpha: 0.35,        // angular clods on real parabolas
    // ARRIVAL CLOCK: the hatched hand sweeps exactly 360 degrees over the fuse and completes ON
    // IMPACT, while the brackets shrink inward AND the shell shadow grows from `shadowStartPx` to
    // the full blast radius — TWO OPPOSED MOTIONS locking on the same frame.
    fuse: ARTILLERY_FUSE,   // 1.1 s (sim constant, above) — the clock IS the fuse
    shadowStartPx: 4,
    graduations: 7, gradEveryLong: 3,                            // ticks per edge; every 3rd is long
  },

  // SKY BOMBARDMENT / LIGHTNING (run.bombs, src: 'sky') — the only VIOLET, the only MASS-PARALLEL
  // telegraph, the only BRANCHING FRACTAL, and the only telegraph whose particles RISE.
  // Parallelism is the whole composition: a screenful of leaning vectors all at STORM_VIS.windAngle
  // says THE SKY IS FIRING; rings radiating from scattered points says THE GUNS ARE FIRING.
  sky: {
    descent: 0xc8b4ff,      // the descent vector dropped from off-frame
    ring: 0xffffff,         // v5.10.1: was `bracket` — the impact ring is now inward-pointing
                            // CHEVRONS (T.skyChevrons), not the artillery's corner brackets. See the
                            // P0 fix note on T.skyChevrons in render.js for why the shared shape was
                            // a real bug, not just a naming one: at TELEGRAPH LOD both threats used to
                            // degrade to "a bracket + a soft disc", which a greyscale reviewer cannot
                            // tell apart from gun vs sky (spec §9.5's own acceptance test).
    ionisation: 0x9d8cff, ionisationAlpha: 0.10,                 // the wash inside the ring
    boltCore: 0xf4fbff, boltGlow: 0xb79bff,                      // matches LIGHTNING.strikeBolt
    scar: 0xe6dcff, scarLife: 2.5,                               // dendritic Lichtenberg burn-in
    sparkTicks: 20,         // discrete crackling ticks on the perimeter — they travel UP, always
    // ARRIVAL CLOCK: a triple chevron slides DOWN the leaning vector, ACCELERATING, and touches
    // ground exactly at fuse = 0. Impact is instantaneous: zero travel, no heading, nothing to dodge
    // sideways — which is exactly why its clock has to be vertical and legible.
    fuse: BOMBARDMENT_FUSE, // 1.2 s (sim constant, above)
    chevrons: 3, chevronGapPx: 26, chevronAccel: 2.2,            // exponent on the descent easing
    dropPx: 560,            // where off-frame the vector starts (matches LIGHTNING.strikeBolt.dropPx)
    boltDur: 0.22,
    branchTrees: 4,         // pre-computed Lichtenberg bakes to pick from, so no two scars match
  },

  // VOLATILE ELITE BOMB (run.bombs, src: 'volatile') — v5.10.1 P0 fix. `ELITE_AFFIXES.volatile` is a
  // chapter-agnostic mechanic (config.js, rolled the same way in every chapter): a timed bomb arms
  // where the elite died. Before this fix skies had NO drawer for it at all — `bombSrc` (render.js)
  // only recognised 'gun'/'sky' and fell everything else through to the generic RED circle telegraph
  // (the exact shape the spec's palette law 3 forbids: "RED IS RESERVED FOR ALERT... a red telegraph
  // is what made the old chapter read as everything is a bomb"), and its detonation fell through
  // handleEvents' `else` branch straight into skyDetonation — a dead elite's corpse-bomb was
  // LITERALLY INDISTINGUISHABLE from the sky's own lightning strike, full-field flash included, in
  // the one chapter whose entire premise is telling the sky apart from the ground. This threat gets
  // its own colour family (sickly acid-green — unclaimed by any of the six main threats, the alert
  // red, the ambience gold or the player/searchlight reservations) and its own shape (a toothed ring
  // that grows and destabilises, the opposite motion of gun/sky's inward-closing brackets) and its
  // own detonation (a hard spike burst, not a fireball and not a bolt).
  volatile: {
    ring: 0xb6e84a, core: 0xe8ff9a,             // acid-green ring + a paler unstable core
    fuse: 0.8,   // = VOLATILE_FUSE below (chapter-agnostic, elite-affix-timed — NOT referenced by
                 // name: VOLATILE_FUSE is declared further down this file, after SKIES_FX, and this
                 // object literal evaluates at module load, so reading it here throws "Cannot access
                 // 'VOLATILE_FUSE' before initialization" — the exact blank-page-in-prod class this
                 // file's own header comment warns about for every other sim constant referenced above)
    spikeCount: 9,                              // detonation: hard acid-green spikes, not a fireball
  },

  // CRUSH ({type:'crush', x, y, kind}) — the ANTI-TELEGRAPH: no warning iconography at all, because
  // it already happened and YOU did it. The only DESATURATED event, the only SLOW one, the only one
  // that REMOVES light (windows snap dark), and the only one that adds PERMANENT geometry.
  // Replaces crushBurst's soft round Kenney circle_05/scorch_01 puff (kill list §8.4) — soft round
  // particles are precisely what makes a collapsing building read as a cartoon dust cloud.
  crush: {
    burstT: 0.9, dustT: 2.5,          // s: shard burst, then the dust skirt lingering and sinking
    skirtAspect: 0.45,                // LOW and squashed, hugging the ground — not a mushroom
    shardMin: 8, shardMax: 10,        // angular hard-edged slabs/tiles/planks with VISIBLE EDGES
    shardGravity: 900,                // px/s^2, fake gravity — shards arc back down and STOP
    scar: 0x0e1116, scarAlpha: 0.5,   // the universal foundation scar under every ruin
    spill: SKIES_PALETTE.sodiumSpill, spillT: 0.35,   // ONE beat of warm interior spill, then dark
    // Material-specific by the crush event's `kind` — the point of the whole redesign in one field:
    // brick does not fall like grain and neither falls like a pier into water.
    byKind: {
      tower: { dust: 0xc9c2b0, dustDark: 0x8d8577 },   // concrete
      house: { dust: 0xa85f45, dustDark: 0x7a4436 },   // brick
      barn:  { dust: 0xc4a06a, dustDark: 0x8f7449 },   // timber
      pier:  { dust: 0x9fc3d8, dustDark: 0xc4a06a },   // harbour spray over splintered timber
      silo:  { dust: 0xdcc98a, dustDark: 0xa8935c },   // spilled grain
      tree:  { dust: 0x6f8a5c, dustDark: 0x46583b },   // leaf litter
    },
  },

  // RAMPAGE (run.rampageT > 0) — a REGIME CHANGE, not an object added to the scene. The only
  // sustained rhythmic effect, the only one sourced AT THE PLAYER, the only cyan, and the only one
  // that changes the LIGHTING STATE of the whole region rather than drawing something new.
  rampage: {
    plateHot: SKIES_PALETTE.playerHot, plateCool: SKIES_PALETTE.player,   // seven dorsal plates,
                                                        // chain-charging tail->head
    plates: 7, chainT: 0.28,                           // s for the charge to run the length of the spine
    bloom: 0x2fe0b4, bloomAlpha: 0.10,                 // screen bloom (suppressed on any flash frame,
                                                        // see SKIES_FLASH.bloomCutoff)
    beat: 0.6,                                         // s per heartbeat ring — the ONLY looping effect
    ringMul: RAMPAGE_CRUSH_MUL,                        // the ring is rolled out to the TRUE widened
                                                        // crush radius (PLAYER.radius * this), so the
                                                        // prettiest effect is also the honest hitbox
    rimLight: 0x4bffc8, rimAlpha: 0.5,                 // cyan rim on every structure inside the ring
    alert: 0xff3b30,                                   // searchlights + klaxons flip to ALERT red...
    alertWaveSpeed: 900,                               // ...as a WAVE at px/s, never a single frame
    reacquireT: 0.6,                                   // s for the lights to come back after it ends
    duration: RAMPAGE_DURATION,                        // 5 s (sim constant, above)
  },
}

// ---- THE LIGHT LAYER (spec §7) — the chapter's identity -----------------------------------------
// "TOKUSATSU NIGHT — the lights are looking for you." This is the only part of the redesign whose
// art direction is also a VERB: the prettiest thing on screen (a searchlight) is anchored to a real,
// CRUSHABLE structure. Crush the anchor and the cone dies mid-sweep. Palette decision and gameplay
// decision are the same decision, and it needs ZERO sim change — render.js already receives
// {type:'crush', x, y, kind} and can read run.obstacles.
//
// blendMode appears NOWHERE in render.js today, so additive is a new concept for that file and it is
// a CORRECTNESS requirement, not a perf note: every child of the light layer sets blendMode 'add',
// and each sub-container must draw from exactly ONE texture or Pixi v8's batcher breaks on every
// blend-mode/texture transition. Two sub-containers (lamps, cones) = two draw calls. The layer sits
// between the cloud shadows and the entities, so light cuts THROUGH cloud shadow.
export const SKIES_LIGHT = {
  // Kerb lamps — the strongest "this is a city at night" signal available, and the cheapest.
  // Placed by ENUMERATION along each street centreline in view (same origin latch as ROAD_JUNCTION),
  // NOT by an 8th FLOOR_LAYERS entry: updateFloorLayer already runs seven nested i x j sweeps per
  // frame and the road layer alone touches ~1000 cells at ROAD_CELL = 30. Enumeration is exact,
  // cheaper, and cannot drift off the grid.
  lamp: {
    spacingPx: 120,        // along the centreline
    kerbInset: 4,          // px in from `half` — the lamp stands ON the kerb
    alternateSides: true,  // per index, so a street is lit from both sides
    pool: 64, mast: 0x2f343c, mastPx: 3,
    poolW: 90, poolH: 150, // the T.lampPool bake: long axis ACROSS the road, like a real luminaire
    tint: SKIES_PALETTE.sodium, alpha: 0.13,   // palette law 1: soft, warm, well under sodiumMaxAlpha
  },
  // Searchlights — at most 5 live cones, each anchored to a real obstacle within `anchorRange` whose
  // kind is in `anchorKinds`, chosen DETERMINISTICALLY by o._cell (sort by roadHash(cell)) so the set
  // does not flicker frame to frame.
  cone: {
    max: 5, lenPx: 900, arcDeg: 26,
    color: SKIES_PALETTE.searchlight,           // palette law 3: this colour, and ONLY this, is light
    alpha: 0.30, lockAlpha: 0.42,
    sweepSpeed: 0.35, sweepSpan: 1.1,           // rad/s, and ± rad about a per-anchor hashed bearing
    rim: 0xffffff, rimAlpha: 0.5,               // hard 1px rim down both cone edges ON LOCK ONLY —
                                                // the difference between "a light" and "it sees you"
    anchorKinds: ['tower', 'silo', 'pier'], anchorRange: 900,
    // HYSTERESIS IS MANDATORY, or the headline system reads as a bug: hold an anchor until it is
    // crushed or leaves OBSTACLE_DROP_RADIUS, fade cones in and out over `fadeT`, NEVER cut. Anchors
    // must survive run._obstacleRev churn — key the anchor set by o._cell and re-resolve positions on
    // each rebuild, never by array index or object identity.
    dropRange: OBSTACLE_DROP_RADIUS, fadeT: 0.8,
    // Klaxon on lock: two concentric expanding rings from the ANCHOR (not the player) in ALERT red.
    klaxon: SKIES_PALETTE.alert, klaxonPeriod: 1.2, klaxonRings: 2, klaxonW: 4,
  },
  // Blinking aviation lamps — the one element that CANNOT be baked, and worth its own pooled sprite
  // because a skyline that blinks is instantly a skyline. Towers only; the per-tower phase offset is
  // hashed from o._cell so a skyline does not blink in unison (which reads as a shader, not a city).
  aviation: { color: SKIES_PALETTE.alert, px: 2.5, period: 1.4, onFrac: 0.18 },
  // Lightning reveal: while the full-field flash is up, multiply the whole light layer's alpha by
  // (1 + gain * lightningFlashA) for the flash's 0.16 s, so a bolt momentarily reveals every
  // structure silhouette and every cast shadow in view. One alpha channel, free drama.
  reveal: { gain: 2.2 },
  // The crush ledger — ONE render-local structure serving THREE features, which is why it is worth
  // having at all: `const crushLedger = new Map()` keyed `${round(x/8)},${round(y/8)}` -> {x,y,kind,t}.
  // Over cap, evict the entry farthest from the player; always evict beyond `dropPx`. Cleared in
  // reset(). NEVER WRITTEN BACK TO `run` — render.js does not mutate sim state, and a ledger is
  // exactly the kind of "just this once" that would break that rule permanently.
  //   1. the ruin + scar sprites (SKIES_RUIN), pooled, <= cap;
  //   2. the LAMP BLACKOUT — any kerb lamp within `blackoutPx` of an entry renders at alpha 0, so
  //      ploughing an avenue leaves a DEAD BLACK CORRIDOR through a lit grid. That corridor is the
  //      chapter's whole fantasy expressed as a lighting state, and it costs one distance test;
  //   3. searchlight anchor invalidation.
  ledger: { cap: 96, cellPx: 8, dropPx: 2200, blackoutPx: 220 },
}


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
