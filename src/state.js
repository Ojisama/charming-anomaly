// State shapes + persistent meta save/load. No Pixi, no DOM (except localStorage).
import {
  PLAYER, SHOP, PASSIVES, WEAPON_MODS, ELEMENTS, xpForLevel, mergeMutatorMods,
  difficultyHpMul, difficultyCoinMul, MAX_DIFFICULTY, CHAPTER_UNLOCK_DIFFICULTY, CHAPTER_ORDER, CHAPTERS,
  OBSTACLE_FIELD_RADIUS, OBSTACLE_MIN_GAP, OBSTACLE_PLACEMENT_ATTEMPTS,
  SNAP_TRAP_R, SNAP_TRAP_MIN_DIST,
  GRAVITY_WELL_R, GRAVITY_FORCE, GRAVITY_MIN_DIST, GRAVITY_MIN_GAP,
} from './config.js'

const SAVE_KEY = 'charming-anomaly-save-v1'

// ---- Meta shape (persisted save, see loadMeta/saveMeta) — contract, keep in sync ----------
// meta.chapter: selected chapter id (default 'body').
// meta.chapters[id] = { unlocked, maxDifficulty, difficulty, best: { time, kills } } — one
//   entry per CHAPTER_ORDER id (config.js), created/repaired by ensureChapterMeta below.
//   difficulty/maxDifficulty here are that chapter's OWN 1..MAX_DIFFICULTY ladder (replaces
//   the pre-v5.0 top-level meta.difficulty/meta.maxDifficulty, which no longer exist).
// meta.best: { time, kills } — all-time aggregate across every chapter, unrelated to any
//   single chapters[id].best; still updated by endRun (main.js) on every run.
// meta.coins / meta.shop / meta.choiceSlots / meta.runs: shared, chapter-agnostic, untouched
//   by the v4 -> v5 migration below.
// Migration from a pre-v5.0 (v4) save: detected by the absence of meta.chapters. chapters.body
// absorbs the save's top-level maxDifficulty/difficulty (grandfathered in as chapters.body's
// ladder, unlocked); top-level meta.best is KEPT (still updated by endRun); top-level
// meta.difficulty/meta.maxDifficulty are deleted once migrated.

// ensureChapterMeta (v5.0): fetches meta.chapters[id], creating it if missing (unlocked only
// for the 'body' chapter — every later chapter starts locked), and always clamps
// maxDifficulty into [1, MAX_DIFFICULTY] and difficulty into [1, maxDifficulty], filling in a
// missing best.{time,kills}. Called for every CHAPTER_ORDER id on every loadMeta so a save
// that predates a newly-shipped chapter (or has a corrupted/garbage entry) always resolves to
// a well-formed one. Returns the (mutated, in-place) entry.
export function ensureChapterMeta(meta, id) {
  meta.chapters ??= {}
  const entry = meta.chapters[id] ?? { unlocked: id === 'body', maxDifficulty: 1, difficulty: 1, best: { time: 0, kills: 0 } }
  entry.unlocked ??= id === 'body'
  entry.maxDifficulty = Math.max(1, Math.min(MAX_DIFFICULTY, entry.maxDifficulty ?? 1))
  entry.difficulty = Math.max(1, Math.min(entry.maxDifficulty, entry.difficulty ?? 1))
  entry.best ??= { time: 0, kills: 0 }
  entry.best.time ??= 0
  entry.best.kills ??= 0
  meta.chapters[id] = entry
  return entry
}

export function loadMeta() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) {
      const m = JSON.parse(raw)
      for (const id of Object.keys(SHOP)) m.shop[id] ??= 0
      // v4 -> v5 migration (one-time, detected by the absence of meta.chapters): the top-level
      // difficulty ladder (whatever difficulty/maxDifficulty the save already had — see the
      // v4.10 grandfathering this replaces) becomes chapters.body's ladder, then top-level
      // meta.difficulty/meta.maxDifficulty are removed. Top-level meta.best is an all-time
      // aggregate across every chapter and is KEPT untouched (endRun still updates it).
      if (!m.chapters) {
        m.chapters = { body: { unlocked: true, maxDifficulty: m.maxDifficulty ?? m.difficulty ?? 1, difficulty: m.difficulty ?? 1 } }
        delete m.difficulty
        delete m.maxDifficulty
      }
      m.chapter ??= 'body'
      for (const id of CHAPTER_ORDER) ensureChapterMeta(m, id)
      // Retroactive chapter unlocks: a chapter that shipped AFTER the player already beat the
      // previous one at CHAPTER_UNLOCK_DIFFICULTY+ unlocks on load — winning level d raises that
      // chapter's maxDifficulty to d+1, so maxDifficulty > CHAPTER_UNLOCK_DIFFICULTY proves the
      // qualifying win even though endRun couldn't unlock a chapter that didn't exist yet.
      for (let i = 1; i < CHAPTER_ORDER.length; i++) {
        const prev = m.chapters[CHAPTER_ORDER[i - 1]]
        if (prev?.maxDifficulty > CHAPTER_UNLOCK_DIFFICULTY) m.chapters[CHAPTER_ORDER[i]].unlocked = true
      }
      m.choiceSlots ??= 2
      m.choiceSlots = Math.max(2, Math.min(4, m.choiceSlots))
      return m
    }
  } catch { /* corrupted save -> fresh */ }
  const fresh = {
    coins: 0,
    shop: Object.fromEntries(Object.keys(SHOP).map((id) => [id, 0])),
    best: { time: 0, kills: 0 },
    runs: 0,
    choiceSlots: 2,
    chapter: 'body',
    chapters: {},
  }
  for (const id of CHAPTER_ORDER) ensureChapterMeta(fresh, id)
  return fresh
}

export function saveMeta(meta) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(meta)) } catch { /* private mode */ }
}

// Full new-game wipe (shop's "Reset all progress" button, see hooks.onReset in main.js) —
// erases the save outright; the caller is expected to reload the page right after.
export function resetSave() {
  try { localStorage.removeItem(SAVE_KEY) } catch { /* private mode */ }
}

// Effective permanent multipliers/bonuses from shop levels.
function shopBonus(meta, id) {
  return SHOP[id].perLevel * (meta.shop[id] ?? 0)
}

// Rejection-sample a chapter's obstacle field (v5.0, see CHAPTERS[id].obstacles in config.js
// and run.obstacles below): cfg null/undefined (e.g. body) yields []. Each obstacle's center is
// sampled at a random angle and a distance in [minDist, OBSTACLE_FIELD_RADIUS] from the run's
// origin (so minDist is automatically satisfied, not just checked), then rejected if it comes
// within OBSTACLE_MIN_GAP (edge-to-edge) of an already-placed obstacle. Plain Math.random is
// fine here (unseeded, run-to-run variety) — sim.js never depends on obstacle placement being
// deterministic. Gives up on an individual obstacle (not the whole field) after
// OBSTACLE_PLACEMENT_ATTEMPTS tries, so a tight config degrades to fewer obstacles rather than
// looping forever.
function generateObstacles(cfg) {
  if (!cfg) return []
  const { count, minR, maxR, minDist } = cfg
  const obstacles = []
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < OBSTACLE_PLACEMENT_ATTEMPTS; attempt++) {
      const r = minR + Math.random() * (maxR - minR)
      const angle = Math.random() * Math.PI * 2
      const dist = minDist + Math.random() * Math.max(0, OBSTACLE_FIELD_RADIUS - minDist)
      const x = Math.cos(angle) * dist
      const y = Math.sin(angle) * dist
      const clear = obstacles.every((o) => Math.hypot(x - o.x, y - o.y) - r - o.r >= OBSTACLE_MIN_GAP)
      if (clear) { obstacles.push({ x, y, r }); break }
    }
  }
  return obstacles
}

// Shared rejection sampler for the v5.4 fixed-radius signature fields (run.traps, run.wells —
// see below): `count` centers of radius `r`, each at a random angle and a distance in
// [minDist, OBSTACLE_FIELD_RADIUS] from the run's origin, rejected if it comes within minGap
// (edge-to-edge) of one already placed. Same unseeded-Math.random / give-up-per-entry contract
// as generateObstacles above — placement is never something sim.js depends on being deterministic.
// Unlike obstacles these fields don't block movement, so they're only spaced against THEMSELVES
// (a trap under a root is fine); one field never checks against another.
function scatterField(count, r, minDist, minGap) {
  const out = []
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < OBSTACLE_PLACEMENT_ATTEMPTS; attempt++) {
      const angle = Math.random() * Math.PI * 2
      const dist = minDist + Math.random() * Math.max(0, OBSTACLE_FIELD_RADIUS - minDist)
      const x = Math.cos(angle) * dist
      const y = Math.sin(angle) * dist
      const clear = out.every((o) => Math.hypot(x - o.x, y - o.y) - r - r >= minGap)
      if (clear) { out.push({ x, y }); break }
    }
  }
  return out
}

// Snap traps (v5.4 undergrowth 'predators' signature, see run.traps below): seeded once here from
// CHAPTERS[chapter].signature.traps. Any chapter whose signature isn't 'predators' yields [].
function generateTraps(sig) {
  if (!sig || sig.type !== 'predators' || !sig.traps) return []
  return scatterField(sig.traps, SNAP_TRAP_R, SNAP_TRAP_MIN_DIST, OBSTACLE_MIN_GAP)
    .map(({ x, y }) => ({ x, y, r: SNAP_TRAP_R, armed: true, cd: 0 }))
}

// Gravity wells (v5.4 beyond 'gravity' signature, see run.wells below): seeded once here from
// CHAPTERS[chapter].signature.wells. Any chapter whose signature isn't 'gravity' yields [].
function generateWells(sig) {
  if (!sig || sig.type !== 'gravity' || !sig.wells) return []
  return scatterField(sig.wells, GRAVITY_WELL_R, GRAVITY_MIN_DIST, GRAVITY_MIN_GAP)
    .map(({ x, y }) => ({ x, y, r: GRAVITY_WELL_R, g: GRAVITY_FORCE }))
}

/**
 * Run state — the single mutable object the whole game shares each run.
 *
 * chapter (v5.0): the run's CHAPTERS id (config.js), snapshotted at createRun (opts.chapter,
 *   default 'body') and constant for the run's duration. Picks the starting weapon
 *   (CHAPTERS[chapter].starter) and scopes sim.js's level-up weapon pool
 *   (weaponCandidates/buildLevelUpChoices) to CHAPTERS[chapter].weapons — other chapters'
 *   natives never appear as offers, though nothing stops a weapon id from being pushed onto
 *   run.weapons directly (e.g. tests) and stepping normally; only the OFFER pool is scoped.
 *   Weapon mods (WEAPON_MODS) and elements stay global systems, unscoped by chapter.
 * phase: 'playing' | 'levelup' | 'paused' | 'dead' | 'victory'
 * events: drained by main.js every frame. Event shapes:
 *   { type:'hit', x, y, dmg, crit }          weapon damaged an enemy
 *   { type:'kill', x, y, elite, etype }      enemy died
 *   { type:'shoot', weapon }                 weapon fired ('star' | 'wave'; orbit is continuous)
 *   { type:'gem', x, y }                     xp gem collected
 *   { type:'coin', x, y, value }             coin collected
 *   { type:'levelup' }                       player leveled (run.levelUpChoices is set, phase='levelup')
 *   { type:'hurt', dmg, dot? }                player took damage (dot=true for pool/DoT ticks —
 *                                            see run.pools below and hurtPlayer in sim.js; absent/
 *                                            false for ordinary contact damage and bomb blasts)
 *   { type:'revive', x, y }                  player death was prevented (see hurtPlayer in
 *                                            sim.js and run.revives below) — render draws a
 *                                            burst at (x,y), main.js plays a sfx
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
 *               flags (v5.0, see CHAPTERS[chapter].roster/eliteFlags in config.js): array of
 *               chapter-agnostic behavior-flag ids, set once at spawn by spawnEnemy (sim.js) —
 *               ARCHETYPE_TYPE maps the roster entry matching this enemy's spawn type (drone/
 *               wisp/tank) to an archetype ('normal'/'fast'/'tank'), a random roster entry of
 *               that archetype is picked (hpMul/speedMul applied to hp/maxHP/speed), and its
 *               `flags` are copied in; elites additionally get CHAPTERS[chapter].eliteFlags
 *               appended (so an elite can carry both its roster's own flags and its chapter's
 *               elite-only ones). Always present (possibly []), safe to check unconditionally.
 *               Known flags (sim.js): 'latch' (stepContactDamage: contact slows the player via
 *               player.slowT/LATCH_SLOW_MUL then the enemy dies), 'split' (dealDamage's death
 *               branch: non-`_splitChild` deaths spawn SPLIT_CHILD_COUNT children at
 *               SPLIT_HP_FRAC hp / SPLIT_RADIUS_FRAC radius, flagged `_splitChild: true` so they
 *               never re-split), 'dashBurst' (stepDashBurst: an idle -> dash state machine on
 *               sim-internal `_dashPhase`/`_dashT`/`_dashDirX`/`_dashDirY`, not a render contract.
 *               The heading LOCKS on the way out of idle and the dash never re-aims — at
 *               DASH_SPEED_MUL it outruns the player, so a homing version is undodgeable),
 *               'acidPool'/'soapTrail' (elite-only: feed run.pools — see below).
 *               v5.3 garden flags: 'trailFollow' (dealDamage: a dying ant drops a run.trails node
 *               under the 'pheromones' signature; stepEnemyMovement: living ants near a node get a
 *               PHEROMONE_SPEED_MUL boost), 'diveBomb' (stepDiveBomb: a hover -> telegraph -> dive
 *               -> recover state machine on sim-internal `_diveState`/`_diveT`/`_diveDirX`/
 *               `_diveDirY`/`_diveElapsed`, replacing the normal seek — not a render contract),
 *               'webZone' (stepEnemyMovement: drops run.webs slow-zones via `_webAcc`, NOT
 *               elite-gated), 'sprayStrip' (elite-only: marks run.strips via `_sprayAcc`).
 * rosterId (v5.0): the picked roster entry's id (config.js), or null if the chapter's roster had
 *               no entry for this enemy's archetype — reserved for render/HUD skins later, no
 *               sim.js behavior keys off it directly (flags/hpMul/speedMul already applied).
 *
 *               Elemental status (see ELEMENTS/COMBOS in config.js, ticked by stepStatuses):
 *               ignite (s of burn DoT remaining, 0 = none), igniteDps (current burn rate),
 *               chill (s of active slow window remaining), chillSlow (0..1 current slow
 *               fraction, applied as a speed multiplier in stepEnemyMovement), frozen (s of
 *               full-stop remaining; elites/type 'tank' never freeze — see ELITE_FREEZE_SLOW_MUL),
 *               venom (stacks 0..8), venomT (s remaining before stacks clear).
 *               bleed (v5.0, s of bleed DoT remaining, 0 = none), bleedDps (current bleed rate) —
 *               a plain dot-flagged DoT applied by the Flagella Whip's barbed mod (see applyBleed
 *               in sim.js), ticked like ignite with no combo/element interaction.
 *
 *               Status effects (v5.4, chapter-agnostic like the elemental ones — every reader
 *               guards them with `|| 0` since saves and other chapters never set them). All three
 *               tick down every frame in stepEnemyMovement:
 *               fearT (s of flee remaining): while > 0 the enemy INVERTS its seek (runs from the
 *                 player) at FEAR_SPEED_MUL of its own speed, overriding any behavior-flag state
 *                 machine, and deals no contact damage. Applied by a run.novas entry carrying a
 *                 `fear` field (the Chitter Shriek — see stepNovas/stepShriekWeapon in sim.js).
 *                 chitterShriek's panicRout mod amplifies ALL damage a fearT > 0 enemy takes.
 *               stunT (s of stun remaining): while > 0 the enemy neither seeks nor deals contact
 *                 damage (knockback still carries it). Applied by the Sewer Geyser's launch mod
 *                 and the Roar's stagger mod (see GEYSER_STUN/ROAR_STUN in config.js).
 *               enrageT (s of enrage remaining): while > 0 the enemy's seek speed is ×
 *                 FLASHLIGHT_SPEED_MUL and its contact damage × FLASHLIGHT_DMG_MUL. Applied by the
 *                 undergrowth's flashlightCone elites (see stepFlashlightCones in sim.js).
 *               Sim-internal only (not a render contract, do not rely on these): _chillStack,
 *               _freezeImmuneT, _shockCd, _comboCd, _bleedAcc, _debrisCd (Trash Tornado's
 *               per-enemy chunk cooldown, the run.debris analogue of orbCd). }
 * bullets[i]: { x, y, vx, vy, dmg, pierce, life, r, speed, hitIds:Set<enemyId>,
 *               _shard (true for Split Stars shards; they never re-split), _splitDone,
 *               _chainsLeft (Chain Stars jumps remaining), _ricochetsLeft (Ricochet Stars
 *               bounces remaining) }. On a spend (pierce exhausted): chain re-target is tried
 *               first, ricochet bounce only if chain isn't available/found nothing (see
 *               tryChainBullet/tryRicochetBullet in sim.js). run._chains/_ricochets are debug
 *               counters incremented each time one of those triggers (not a render contract).
 * novas[i]:   { x, y, r, maxR, dmg, knockback, life, hit:Set<enemyId> }  (r grows; render draws the ring)
 *             knockback (v4.3): Undertow (see WEAPON_MODS.wave) bakes a NEGATIVE knockback in
 *             at cast time to invert push into pull (magnitude also amplified per stack) —
 *             stepNovas' math is unchanged, it just applies whatever signed value is here.
 *             Tsunami (v4.3) similarly bakes a bigger maxR/dmg into every TSUNAMI_EVERY-th cast
 *             (tracked by run._waveCasts, a sim-internal counter, not a render contract).
 * orbs[i]:    { x, y, r } positions + effective hit radius computed by sim each frame (render
 *             just draws them; r = ORB_R × (1 + orbit.bigOrbs bonus), same for main-ring and
 *             twinRing orbs — see WEAPON_MODS.orbit in config.js)
 * gems[i]:    { x, y, xp }   coins[i]: { x, y, value }
 *
 * v2 weapon entities (all sim-owned, render-drawn):
 * boomerangs[i]: { x, y, angle, phase:'out'|'back', dmg, hit:Set, hitR, backhandMul, seekerTurnRate }
 *               (hit cleared at turnaround; hitR (v4.1) = BOOMERANG_HIT_R × (1 + boomerang.bigBlade
 *               bonus), snapshotted per throw — sim-internal collision radius, not required by
 *               render). backhandMul/seekerTurnRate (v4.3, see WEAPON_MODS.boomerang): also
 *               snapshotted per throw — backhandMul (= 1 + backhand bonus) multiplies dmg only
 *               while phase==='back'; seekerTurnRate (= SEEKER_TURN_RATE × seeker bonus, 0 = off)
 *               steers the travel angle toward the nearest enemy, 'out' phase only.
 * mines[i]:     { x, y, arm (s until armed), dmg, radius, small?, _detonate? }
 *               small (v4.1, optional): true for Cluster Bombs bomblets (see WEAPON_MODS.mines
 *               in config.js) — smaller/weaker mines popped from a mine's death; render draws
 *               them at a reduced scale. Absent (falsy) on ordinary player-deployed mines.
 *               _detonate (v4.3, sim-internal, not a render contract): set once a mine is queued
 *               to explode this frame (natural proximity trigger OR a Chain Reaction cascade from
 *               another mine's blast) — guarantees a mine only ever detonates once. Magnetic Mines
 *               (v4.3) crawls an armed (arm<=0) mine's x/y toward the nearest enemy every frame —
 *               plain position mutation, no new render contract.
 * homingShots[i]: { x, y, vx, vy, dmg, life, pierce, hitIds:Set<enemyId>, _mini? }
 *               pierce (v4.1): starts at 1 + WEAPON_MODS.homing.phantom bonus; a wisp
 *               decrements it on each hit instead of always dying on first contact, and keeps
 *               homing toward enemies not yet in hitIds (see stepHomingShots in sim.js).
 *               _mini (v4.3, optional): true for Swarm's bonus mini-wisps, spawned when a
 *               (non-mini) wisp's hit kills an enemy (see WEAPON_MODS.homing.swarm) — same shape,
 *               smaller dmg/life, never itself triggers another Swarm spawn (still eligible for
 *               a Popping Wisps death-pop, see below). Popping Wisps (wispNova, v4.3): any wisp
 *               that dies (spent its last pierce on a hit, OR its life ran out) pops an AoE
 *               splash — no new field, just an {type:'explode'} event at its (x,y).
 * holes[i]:     { x, y, radius, coreRadius, life, duration, dmg, tick, pull, spawnRadius? }
 *               coreRadius is the inner "consumed" zone (amplified tick damage; see stepHoles).
 *               Singularity (v4.1, see WEAPON_MODS.hole) spawns extra hole entries of this same
 *               shape at HOLE_SINGULARITY_FRAC radius/coreRadius/pull. spawnRadius (v4.3,
 *               optional): the hole's radius at creation — Hungry Hole (see WEAPON_MODS.hole)
 *               grows radius/coreRadius by a fraction of it per second while alive; render is
 *               already visual-safe here since it re-reads h.radius/coreRadius every frame. Big
 *               Crunch (v4.3): on expiry a hole collapses in one last detonation at its FINAL
 *               radius — an {type:'explode'} event, no new field.
 * blooms[i]:    { x, y, r, maxR, t, dur, dmgPerTick, _mini? }  Toxin Bloom clouds (v5.0 pond
 *               native, sim-owned/render-drawn). Planted by stepBloomWeapon at a random enemy
 *               within castRange (fallback: a random offset near the player); r grows 0 -> maxR
 *               over dur × BLOOM_GROW_FRAC (see config.js) then holds maxR; every BLOOM_TICK it
 *               deals dot-flagged damage (dmgPerTick, player-scaled — {type:'hit', dot:true}) to
 *               enemies within r; removed once t reaches dur. _mini (optional): true for
 *               sporeburst mini-clouds (SPOREBURST_FRAC of the parent's maxR), spawned when a
 *               non-mini cloud's own tick kills an enemy — minis never spawn further minis.
 *               twinBloom (see WEAPON_MODS.bloom) plants extra clouds per cast. Render re-reads
 *               r/maxR/t every frame (alpha/size ramp), no per-frame event.
 * beams[i]:     { angle, life, duration, dmg, tick, width, length, focusBonus? }  origin = player.
 *               Prismatic Split (v4.1, see WEAPON_MODS.rainbow) spawns extra beam entries of
 *               this same shape, angle offset evenly around the circle, all rotating together.
 *               focusBonus (v4.3, optional): Focus Lens — each tick's damage is ramped by
 *               (1 + focusBonus × elapsed/duration), recomputed fresh every tick (not baked).
 *               Strobe Ray (v4.3) instead bakes a faster `tick` period in at cast time (no new
 *               field — it's applied straight to `tick` above).
 *
 * Extra events beyond v1: {type:'explode',x,y,radius} mine pop, star-blast explosion, Supernova
 * Sparks orb-kill splash, Popping Wisps death-pop, or Big Crunch hole-collapse (radius from
 * config: mine's own blast radius, STAR_BLAST_RADIUS, ORBIT_NOVA_RADIUS, WISP_NOVA_RADIUS, or
 * the hole's own final radius, respectively) · {type:'hole'} vortex opens · {type:'beam'} beam
 * starts · {type:'bloom', x, y} a Toxin Bloom is cast (x,y = player, for a cast sfx; the clouds
 * themselves live in run.blooms above).
 *
 * v5.0 pond weapons (see WEAPONS.flagella/bloom + WEAPON_MODS in config.js, stepFlagellaWeapon/
 * stepBloomWeapon in sim.js):
 *   {type:'whip', x, y, angle, range, arc}  one per Flagella Whip swing (x,y = player origin;
 *                                           angle = arc centre, range/arc = sector size — render
 *                                           draws the sweep). Per-enemy {type:'hit'} events fire
 *                                           alongside it as usual. cyclone opens arc to 2π.
 *
 * v5.3 garden weapons (see WEAPONS.stinger/lure + WEAPON_MODS in config.js, stepStingerWeapon/
 * stepLureWeapon/stepLures in sim.js):
 *   Stinger needles are ordinary run.bullets entries (see bullets[] above) but tagged
 *   weapon:'stinger' and _venomTips (snapshot of the venomTips mod — stepBullets injects 1 venom
 *   stack per hit when set), with star's split/chain/ricochet budgets zeroed so those never apply.
 *   {type:'shoot', weapon:'stinger'}  a stinger volley fired.
 *   {type:'lure', x, y}               a Pheromone Lure decoy was planted (x,y = player, for sfx;
 *                                     the decoys live in run.lures above). A lure's burst emits an
 *                                     {type:'explode', x, y, radius} at the decoy (see stepLures).
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
 * v5.0 chapter behavior flags (see CHAPTERS in config.js and sim.js's spawnEnemy/dealDamage/
 * stepEnemyMovement/stepContactDamage/stepPools/stepCurrents/stepObstacles):
 * player.slowT: s remaining of a movement-speed debuff (0 = none) — set to LATCH_SLOW_T by a
 *   'latch'-flagged enemy's contact (stepContactDamage); while > 0, stepPlayerMovement
 *   multiplies move speed by LATCH_SLOW_MUL. Ticks down like invuln, every frame.
 * pools[i]: { x, y, r, t, dps } — circular zones that damage the PLAYER only while they stand
 *   inside (dot-flagged {type:'hurt', dmg, dot:true} events, ticked every STATUS_TICK like other
 *   DoTs — see stepPools in sim.js), removed once t <= 0. Fed by two elite-only flags: acidPool
 *   (a pool left at an elite's death spot) and soapTrail (nodes dropped periodically while the
 *   elite is alive, via sim-internal `_soapAcc` on the enemy). One shared array/step function
 *   for both — see the ACID_ and SOAP_ constants in config.js. Not gated by chapter: empty
 *   unless something pushes to it.
 * obstacles[i]: { x, y, r } — circular colliders generated once at createRun from
 *   CHAPTERS[chapter].obstacles (config.js; null/absent, e.g. body, yields []). Push the player
 *   and every enemy out of overlap every frame (stepObstacles in sim.js); projectiles are
 *   unaffected. Rendered from real sprite assets (Task 6), not drawn here.
 * _driftSeed (sim-internal, not a render contract): a random phase offset (createRun, Math.
 *   random()) folded into stepCurrents' sine-sum field so two runs of the same currents chapter
 *   don't drift identically.
 *
 * v5.3 garden chapter behavior (see CHAPTERS.garden in config.js and sim.js's stepEnemyMovement/
 * stepDiveBomb/dealDamage/stepTrails/stepWebs/stepStrips/stepPlayerMovement):
 * trails[i]: { x, y, t } — fading pheromone nodes dropped by a dying 'trailFollow' ant (dealDamage,
 *   gated on the chapter's signature.type === 'pheromones'). Living trailFollow ants within
 *   PHEROMONE_FOLLOW_RADIUS of any node get a PHEROMONE_SPEED_MUL seek-speed bonus. t counts down;
 *   removed once t <= 0 (stepTrails). No damage, no player interaction.
 * webs[i]: { x, y, r, t } — slow-zone patches dropped periodically by 'webZone' spiders
 *   (stepEnemyMovement, NOT elite-gated) and by the lure's stickyScent mod on burst. While the
 *   player stands in any web, stepPlayerMovement multiplies move speed by WEB_SLOW_MUL (stacking
 *   with the latch debuff via MIN, not multiply). t counts down; removed once t <= 0 (stepWebs).
 * strips[i]: { x, y, angle, len, w, fuse, t, dps } — telegraphed rectangular pesticide spray
 *   strips marked on the player by 'sprayStrip' elites (stepEnemyMovement). fuse (telegraph)
 *   counts down first with NO damage; once fuse <= 0 the strip is live and t counts down while it
 *   ticks dot-flagged {type:'hurt', dmg, dot:true} damage every STATUS_TICK to the player inside
 *   the rotated rectangle (stepStrips), same DoT contract as run.pools. Removed once fuse<=0 && t<=0.
 * lures[i]: { x, y, t, dur, aggro, burstR, burstDmg, sticky } — Pheromone Lure decoys (garden
 *   weapon). Enemies within `aggro` of a lure path to it instead of the player (stepEnemyMovement).
 *   t ages to dur, then the lure BURSTS: player-scaled AoE damage (applyDamage) to enemies within
 *   burstR + an {type:'explode', x, y, radius} event, and (sticky, from the stickyScent mod) a
 *   LURE_STICKY_R/DUR slow zone into run.webs (stepLures). Removed on burst. See WEAPONS.lure.
 *
 * ---- v5.4 chapters (undergrowth/city/skies/beyond) ----------------------------------------
 * Behavior flags added to the enemies[].flags vocabulary above (all documented phase by phase on
 * their tuning blocks in config.js; every one of them is chapter-agnostic, sim.js only ever reads
 * the flag): 'pounce' (undergrowth cat), 'aerialStrike' (owl, untouchable while overhead),
 * 'flashlightCone' (exterminator elites), 'lineCharge' (city vacuum), 'spawner' (van elites),
 * 'strafe' (jet), 'missileVolley' (helicopter -> run.enemyShots), 'artillery' (tank columns AND AA
 * elites -> run.bombs), 'blink' (glitch blinker), 'phase' (phase flicker), 'pullBeam' (UFO elites).
 * Their phase state lives on sim-internal `_`-prefixed fields following the diveBomb idiom; the
 * two render.js may read are `e._phaseSolid` (bool, phase's alpha) and `e._coneAngle` (rad,
 * flashlightCone's sweep heading).
 *
 * traps[i]: { x, y, r, armed, cd } — snap traps, seeded ONCE at createRun (generateTraps above)
 *   from CHAPTERS[chapter].signature.traps under the undergrowth's 'predators' signature; [] for
 *   every other chapter. Permanent field furniture: they never expire, never move, never block
 *   movement (they may overlap obstacles) — they only spring and re-arm. An ARMED trap containing
 *   the center of the player OR of any enemy snaps: it damages THAT ONE entity for SNAP_TRAP_DMG —
 *   BOTH sides, that's the mechanic (kite the swarm over them) — then armed=false / cd=
 *   SNAP_TRAP_REARM and emits {type:'explode', x, y, radius:r}. cd counts down to 0, then re-arms
 *   (cd is 0 while armed). See stepTraps in sim.js.
 * wells[i]: { x, y, r, g } — gravity wells, seeded ONCE at createRun (generateWells above) from
 *   CHAPTERS[chapter].signature.wells under the beyond's 'gravity' signature; [] elsewhere. r =
 *   influence radius, g = GRAVITY_FORCE (px/s² at the center, falling linearly to 0 at r). Permanent:
 *   never expire, never move, never damage, never block. They BEND every projectile in flight —
 *   run.bullets, run.homingShots, run.lobs, run.enemyShots — and nothing else (bodies, beams,
 *   orbitals and zones are untouched). Speed is renormalised after the bend: curvature, not
 *   acceleration. See stepGravityWells in sim.js.
 * lanes[i]: { x, y, angle, len, w, phase, t, carT, dmg, hitIds:Set<enemyId> } — traffic lanes
 *   (city's 'traffic' signature); empty elsewhere. x,y = the band's CENTER, angle = its direction,
 *   len/w = its extent. phase 'warn' (a harmless hazard-striped telegraph) for t = TRAFFIC_WARN
 *   seconds, then phase 'sweep' for t = TRAFFIC_SWEEP while a vehicle traverses the band: carT
 *   goes 0 -> 1 and the vehicle's center is (x, y) + dir × ((carT - 0.5) × len), dir =
 *   (cos angle, sin angle). A TRAFFIC_CAR_LEN × TRAFFIC_CAR_W box on that center damages BOTH the
 *   player (normal armor/contactDmgTakenMul path, gated by invuln) and every enemy it touches
 *   (dealDamage, once each — hitIds) for `dmg`, plus TRAFFIC_KB knockback along `angle`. Removed
 *   when t hits 0 in 'sweep'. See stepLanes in sim.js.
 * enemyShots[i]: { x, y, vx, vy, r, dmg, life, turnRate } — the ONLY enemy-owned projectile array,
 *   fed by 'missileVolley' helicopters. Homes toward the player at turnRate rad/s, expires at
 *   life <= 0 (removed, no blast), and on overlapping the player (r + PLAYER.radius) damages the
 *   PLAYER only (normal armor path, respects invuln) and emits {type:'explode', x, y, radius:
 *   MISSILE_BLAST}. Never damages enemies. Bent by run.wells like any other projectile. See
 *   stepEnemyShots in sim.js.
 * debris[i]: { x, y, r } — Trash Tornado chunks (city weapon). Exactly the run.orbs contract: sim
 *   REWRITES the whole array every frame from the player's position (render just draws them; r =
 *   DEBRIS_R × (1 + trashTornado.heavyTrash-independent constants) — see stepTornadoWeapon).
 * geysers[i]: { x, y, r, fuse, dur, dmg, _chained? } — telegraphed eruption zones (Sewer Geyser,
 *   city weapon; also reused by the Reality Shard's riftScar rifts). fuse counts down as a HARMLESS
 *   telegraph (dur is its starting value, so render can grow a warning ring from fuse/dur), then
 *   the zone erupts ONCE for dmg in r against ENEMIES only (never the player), emits
 *   {type:'explode', x, y, radius:r} and is removed. _chained marks a follow-up (chainGeyser's, or
 *   a riftScar rift) so chainGeyser can never fire off it. See stepGeysers in sim.js.
 * lobs[i]: { x, y, fromX, fromY, tx, ty, t, flight, r, dmg } — Debris Toss chunks (skies weapon).
 *   t counts UP from 0 to flight; x/y are the straight (fromX,fromY)->(tx,ty) lerp at t/flight,
 *   and render adds the parabolic hop (sim only needs t/flight). On landing the chunk bursts ONCE
 *   for dmg in r against ENEMIES only (never the player), emits {type:'explode', x:tx, y:ty,
 *   radius:r} and is removed. A lob is a projectile for gravity-well purposes (a well bends its
 *   landing point) but it is NOT a run.bullets entry. See stepDebrisWeapon/stepLobs in sim.js.
 *
 * v5.4 weapons (see WEAPONS/WEAPON_MODS in config.js for the per-weapon mod semantics). Entity
 * reuse rather than new arrays: Quill Burst's quills, Reality Shard's shards, the tornado's flung
 * chunks and Debris Toss' splinters are all ordinary run.bullets entries tagged weapon:'quill' /
 * 'shard' / 'trash' / 'debris' (star's split/chain/ricochet budgets zeroed, exactly like the
 * stinger's needles); the Chitter Shriek is a run.novas entry carrying `fear` (s); the Tesseract
 * Beam is a run.beams entry carrying `folded: true` + `arms` (n arms evenly around the circle,
 * sweeping together) + `collapseBonus`. New events:
 *   {type:'clawRake', x, y, angle, range, arc}      a Claw Rake slash (same shape as 'whip'; x,y =
 *                                                   the player — the rake never moves them)
 *   {type:'roar', x, y, angle, range, arc}          a Roar sector sweep (same shape as 'whip')
 *   {type:'tail', x, y, angle, range, arc}          a Tail Swipe sector sweep
 *   {type:'geyser', x, y}                           a Sewer Geyser cast (x,y = player, for sfx;
 *                                                   the zones live in run.geysers above)
 *   {type:'toss', x, y}                             a Debris Toss cast (x,y = player, for sfx)
 *   {type:'shoot', weapon:'quillBurst'|'realityShard'|'chitterShriek'}  volley/cast fired
 * player.vx/vy (v5.4): the player's own input velocity in px/s this frame (0 while standing still;
 *   drift/pull forces are NOT folded in). Written by stepPlayerMovement, read by the 'artillery'
 *   flag to lead its shells (ARTILLERY_LEAD).
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
 *
 * v4.5 gold sinks (see CONSUMABLES/REROLL_* in config.js):
 * consumables: run.consumables is the array of CONSUMABLES ids (opts.consumables passed to
 *   createRun, default []) bought pre-run and spent at run creation:
 *     'revive'    -> run.revives = 1 (see below)
 *     'headstart' -> player.xp pre-loaded to xpForLevel(1) + xpForLevel(2) so stepLevelUp
 *                    (sim.js) fires twice naturally on the first 'playing' frames, banking
 *                    two level-ups before any enemy is killed
 *     'charged'   -> the starting weapon entry (weapons[0]) begins at level 2 instead of 1
 * revives: count of revives remaining this run (1 if 'revive' was bought, else 0). Consumed
 *   by hurtPlayer (sim.js): instead of dying, the player is restored to maxHP *
 *   REVIVE_HP_FRAC, granted REVIVE_INVULN invulnerability, and every enemy within
 *   REVIVE_SHOVE_RADIUS is knocked back (a {type:'revive', x, y} event fires — see above).
 * _rerolls: count of level-up rerolls used so far this run (main.js increments this and
 *   recomputes the next reroll's price via rerollCost(run._rerolls) — see config.js).
 *   Rerolls are paid from run.coinsEarned (this run's coins), never the meta bank (v5.1).
 *   buildLevelUpChoices itself is reroll-agnostic; rerolling is just calling it again.
 * choiceSlots (v4.8): how many cards buildLevelUpChoices rolls for every level-up this run —
 *   snapshotted from meta.choiceSlots at createRun (2..4) and constant for the run's duration
 *   (unlocking a slot mid-meta-shop never retroactively changes an in-progress run). Permanently
 *   unlocked in the meta shop by sacrificing SHOP levels (see sacrificeCost in config.js and
 *   hooks.onSacrifice in main.js) — applies to every mode, including Daily.
 */
export function createRun(meta, opts = {}) {
  const maxHP = PLAYER.baseHP + shopBonus(meta, 'maxHP')
  // Pre-run modifiers (see MUTATORS + difficulty consts in config.js and the doc block above):
  // opts.difficulty (1..MAX_DIFFICULTY, default 1) stacks its enemy-HP tax on top of mutators.
  const difficulty = opts.difficulty ?? 1
  const mods = mergeMutatorMods(opts.mutators ?? [])
  mods.enemyHpMul *= difficultyHpMul(difficulty)
  mods.coinMul *= difficultyCoinMul(difficulty)
  // Pre-run consumables (see CONSUMABLES in config.js and the doc block above).
  const consumables = opts.consumables ?? []
  const hasHeadstart = consumables.includes('headstart')
  const startXp = hasHeadstart ? xpForLevel(1) + xpForLevel(2) : 0
  const startWeaponLevel = consumables.includes('charged') ? 2 : 1
  // Chapter snapshot (v5.0, see CHAPTERS in config.js): opts.chapter (default 'body') picks the
  // chapter's starter weapon and, via CHAPTERS[run.chapter].weapons, scopes sim.js's level-up
  // weapon pool (weaponCandidates/buildLevelUpChoices) to that chapter's natives for the whole
  // run. Caller (main.js) is responsible for sourcing opts.difficulty/opts.mutators from that
  // same chapter's meta.chapters[id] ladder/daily mutators — createRun itself doesn't read meta.chapters.
  const chapter = opts.chapter ?? 'body'
  return {
    phase: 'playing',
    time: 0,
    events: [],
    chapter,
    difficulty,
    mutators: opts.mutators ?? [],
    mods,
    consumables,
    revives: consumables.includes('revive') ? 1 : 0,
    _rerolls: 0,
    choiceSlots: meta.choiceSlots ?? 2,
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
      xp: startXp, level: 1, xpNext: xpForLevel(1),
      invuln: 0,
      slowT: 0,           // s remaining of the latch-flag movement debuff (see doc block above)
      facing: 1,          // 1 right, -1 left (render flips the face)
      facingAngle: null,  // v5.0: last non-zero move direction (full angle, rad); null until first
                          // move. Render orients the pond tail to it; the Flagella Whip aims at the
                          // nearest enemy and only falls back here when none exists (see fireFlagella).
      moving: false,
      vx: 0, vy: 0,       // v5.4: this frame's own input velocity, px/s (see the doc block above)
    },
    weapons: [{ id: CHAPTERS[chapter].starter, level: startWeaponLevel }],
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
    blooms: [],
    gems: [],
    coins: [],
    bombs: [],
    // v5.0 chapter behavior (see doc block above): pools fed by acidPool/soapTrail elite flags;
    // obstacles rejection-sampled once here from this chapter's config (null/absent -> []).
    pools: [],
    obstacles: generateObstacles(CHAPTERS[chapter].obstacles),
    // v5.3 garden behavior (see doc block above): trails fed by dying trailFollow ants (pheromone
    // signature), webs by webZone spiders + the lure's stickyScent mod, strips by sprayStrip elites,
    // lures by the Pheromone Lure weapon. All empty unless something pushes to them.
    trails: [],
    webs: [],
    strips: [],
    lures: [],
    // v5.4 chapter behavior (see doc block above). traps/wells are permanent signature FURNITURE,
    // seeded once here from this chapter's signature (any other signature -> []); the rest are fed
    // during the run — lanes by the city's traffic signature, enemyShots by missileVolley
    // helicopters, debris by the Trash Tornado (rewritten every frame, like orbs), geysers by the
    // Sewer Geyser (and the Reality Shard's rifts), lobs by the Debris Toss.
    traps: generateTraps(CHAPTERS[chapter].signature),
    wells: generateWells(CHAPTERS[chapter].signature),
    lanes: [],
    enemyShots: [],
    debris: [],
    geysers: [],
    lobs: [],
    kills: 0,
    coinsEarned: 0,
    levelUpChoices: null,
    viewRadius: 600,       // half screen diagonal, updated by main each frame; spawn enemies at viewRadius + SPAWN_RING from player
    _nextId: 1,
    _spawnAcc: 0,
    _nextEliteAt: 40,
    // Sim-internal only (see doc block above): random phase offset for stepCurrents' field.
    _driftSeed: Math.random() * Math.PI * 2,
    // Sim-internal only (not a render contract): pending Echo Wave casts (see WEAPON_MODS.wave
    // in config.js and stepWaveEchoes in sim.js) — { delay, x, y, radius, dmg, knockback }[].
    _waveEchoes: [],
    // Sim-internal only: count of wave casts so far this run (see WEAPON_MODS.wave.tsunami in
    // config.js and stepWaveWeapon in sim.js) — every TSUNAMI_EVERY-th cast is a "monster wave".
    _waveCasts: 0,
    // Debug counters only (see bullets[] doc above) — not consumed by render/main.
    _chains: 0,
    _ricochets: 0,
  }
}
