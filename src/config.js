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
export const rarityWeights = () => RARITY_WEIGHTS

// ---- Level-up choice slots (v4.8: permanent, meta-shop-unlocked) ---------------------
// A level-up screen shows meta.choiceSlots/run.choiceSlots cards (2 by default). The 3rd/4th
// slot is unlocked PERMANENTLY (applies to every future run, all modes) by sacrificing already-
// purchased SHOP levels in the meta shop — see SACRIFICE_COSTS/sacrificeCost below and
// hooks.onSacrifice in main.js. No coin refund for sacrificed levels.
export const LEVELUP_MAX_CHOICES = 4

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
    name: 'Black Hole',
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
// createRun). Later chapters (garden, undergrowth, city, skies, beyond) append here in
// v5.1+; CHAPTER_ORDER is the single source of truth for sequencing, daily seeding, and
// how many chapters currently ship.
export const CHAPTER_ORDER = ['body', 'pond', 'garden']
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
}
// ---- Chapter teasers (v5.3, DISPLAY-ONLY) ------------------------------------------
// The title carousel shows [unlocked chapters] + [first real locked CHAPTERS entry] + [all teasers].
// Teasers are future chapters with NO CHAPTERS entry yet — pure "coming soon" cards. Their ids MUST
// NEVER reach createRun/onChapter/dailyChapter: they're never unlocked (so onChapter/Play skip them),
// they're not in CHAPTER_ORDER (so dailyChapter never picks them), and every CHAPTERS[id] lookup on
// the card/dot/select paths is guarded (ui.js). icon = a dim greyscale silhouette on the teaser card.
export const CHAPTER_TEASERS = [
  { id: 'undergrowth', icon: '🐾' },
  { id: 'city', icon: '🏙️' },
  { id: 'skies', icon: '🌩️' },
  { id: 'beyond', icon: '🌌' },
]
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
