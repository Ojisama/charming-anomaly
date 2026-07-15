// Pure simulation. No Pixi/DOM/localStorage — mutates `run` (see state.js) and
// pushes events consumed once per frame by main.js/render.js.
// Contract: see state.js (run shape + events) and config.js (all numbers).

import {
  RUN_DURATION, PLAYER, WEAPONS, MAX_WEAPON_LEVEL, MAX_WEAPONS,
  PASSIVES, MAX_PASSIVE_LEVEL, STAR_MODS, MAX_STAR_MOD_PICKS,
  RARITIES, RARITY_ORDER, rarityWeights,
  ENEMIES, ELITE, WAVE_TABLE,
  spawnRate, hpScale, MAX_ALIVE, ELITE_EVERY, SPAWN_RING,
  xpForLevel, GEM_VALUE,
  STAR_LIFE, STAR_R, STAR_FAN, STAR_BLAST_RADIUS, ORB_R, NOVA_LIFE,
  HOLE_CORE_FRAC, HOLE_RIM_PULL_MUL, HOLE_RESIST_CAP, HOLE_SPIRAL_MUL,
  HOLE_CORE_DMG_MUL, HOLE_PULL_DECAY,
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
  run.time += dt
  if (run.time >= RUN_DURATION) {
    run.phase = 'victory'
    run.events.push({ type: 'victory' })
    return
  }

  stepPlayerMovement(run, input, dt)
  stepRegen(run, dt)
  stepSpawning(run, dt)
  stepEnemyMovement(run, dt)

  if (stepContactDamage(run)) return // phase is now 'dead'

  stepWeapons(run, dt)
  stepPickups(run, dt)
  stepLevelUp(run)
}

/** Apply run.levelUpChoices[i] to the run (weapon add/level, passive, heal). */
export function applyChoice(run, i) {
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
      p.maxHP += choice.bonus
      p.hp = Math.min(p.maxHP, p.hp + choice.bonus)
    }
  } else if (choice.kind === 'mod') {
    run.starMods[choice.id] = (run.starMods[choice.id] ?? 0) + choice.bonus
    run.starModPicks[choice.id] = (run.starModPicks[choice.id] ?? 0) + 1
  } else if (choice.kind === 'heal') {
    p.hp = Math.min(p.maxHP, p.hp + 30)
  }
}

// ---- Player -------------------------------------------------------------------

function stepPlayerMovement(run, input, dt) {
  const p = run.player
  let ix = input?.x || 0
  let iy = input?.y || 0
  const len = Math.hypot(ix, iy)
  if (len > 1) { ix /= len; iy /= len } // clamp to unit circle, keep sub-unit analog magnitude

  const speed = p.speed * (1 + run.passives.moveSpeed)
  p.x += ix * speed * dt
  p.y += iy * speed * dt

  p.moving = len > 1e-6
  if (ix > 1e-6) p.facing = 1
  else if (ix < -1e-6) p.facing = -1

  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt)
}

function stepRegen(run, dt) {
  const p = run.player
  if (run.passives.regen > 0) {
    p.hp = Math.min(p.maxHP, p.hp + run.passives.regen * dt)
  }
}

// ---- Spawning -------------------------------------------------------------------

function waveWeights(t) {
  let table = WAVE_TABLE[0][1]
  for (const [from, weights] of WAVE_TABLE) {
    if (t >= from) table = weights
    else break
  }
  return table
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
  run._spawnAcc += spawnRate(run.time) * dt
  while (run._spawnAcc >= 1 && run.enemies.length < MAX_ALIVE) {
    run._spawnAcc -= 1
    spawnEnemy(run)
  }
}

function spawnEnemy(run) {
  const isElite = run.time >= run._nextEliteAt
  if (isElite) run._nextEliteAt += ELITE_EVERY

  const type = pickWeighted(waveWeights(run.time))
  const base = ENEMIES[type]
  const p = run.player

  const angle = Math.random() * Math.PI * 2
  const dist = run.viewRadius + SPAWN_RING
  const x = p.x + Math.cos(angle) * dist
  const y = p.y + Math.sin(angle) * dist

  const hp = base.hp * hpScale(run.time) * (isElite ? ELITE.hpMul : 1)

  run.enemies.push({
    id: run._nextId++,
    type,
    x, y,
    hp, maxHP: hp,
    radius: base.radius * (isElite ? ELITE.sizeMul : 1),
    speed: base.speed,
    dmg: base.dmg * (isElite ? ELITE.dmgMul : 1),
    elite: isElite,
    xp: base.xp,
    hitFlash: 0,
    orbCd: 0,
    kb: { x: 0, y: 0 },
    holePull: 0,
  })
}

// ---- Enemy movement -------------------------------------------------------------

// ponytail: naive O(enemies) seek + O(bullets/orbs/novas × enemies) collision below.
// Upgrade path if profiling ever demands it: bucket enemies into a spatial hash
// (grid keyed by floor(x/cell),floor(y/cell)) and only test nearby cells/pairs.
function stepEnemyMovement(run, dt) {
  const p = run.player
  const kbDecay = Math.max(0, 1 - dt * KB_DECAY_RATE)
  for (const e of run.enemies) {
    const dx = p.x - e.x, dy = p.y - e.y
    const d = Math.hypot(dx, dy)
    if (d > 1e-6) {
      e.x += (dx / d) * e.speed * dt
      e.y += (dy / d) * e.speed * dt
    }

    e.x += e.kb.x * dt
    e.y += e.kb.y * dt
    e.kb.x *= kbDecay
    e.kb.y *= kbDecay
    if (Math.abs(e.kb.x) < 0.5) e.kb.x = 0
    if (Math.abs(e.kb.y) < 0.5) e.kb.y = 0

    if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt)
    if (e.orbCd > 0) e.orbCd = Math.max(0, e.orbCd - dt)
  }
}

// ---- Contact damage ---------------------------------------------------------------

/** @returns true if the player died this frame (phase set to 'dead'). */
function stepContactDamage(run) {
  const p = run.player
  if (p.invuln > 0) return false

  for (const e of run.enemies) {
    const dx = e.x - p.x, dy = e.y - p.y
    const rad = PLAYER.radius + e.radius
    if (dx * dx + dy * dy < rad * rad) {
      const dmg = Math.max(1, e.dmg - run.passives.armor)
      p.hp -= dmg
      p.invuln = PLAYER.invulnTime
      run.events.push({ type: 'hurt', dmg })
      if (p.hp <= 0) {
        run.phase = 'dead'
        run.events.push({ type: 'dead' })
        return true
      }
      return false // one hit per frame; invuln now active
    }
  }
  return false
}

// ---- Damage application (shared by all weapons) -----------------------------------

// Shared tail: apply a final (already-multiplied) damage number to an enemy, push the
// 'hit' event, and handle death/xp/coin drops. Used by applyDamage after it rolls the
// player's multipliers/crit, and directly by effects (like star blasts) that derive
// their damage from an already-rolled hit and shouldn't re-roll crit/multipliers.
function dealDamage(run, enemy, dmg, crit) {
  enemy.hp -= dmg
  enemy.hitFlash = 0.12
  run.events.push({ type: 'hit', x: enemy.x, y: enemy.y, dmg, crit })

  if (enemy.hp <= 0 && !enemy._dead) {
    enemy._dead = true
    run.kills++
    run.events.push({ type: 'kill', x: enemy.x, y: enemy.y, elite: enemy.elite, etype: enemy.type })

    const xp = enemy.xp * (enemy.elite ? ELITE.xpMul : 1)
    run.gems.push({ x: enemy.x, y: enemy.y, xp })

    if (enemy.elite) {
      for (let i = 0; i < ELITE.coins; i++) {
        const a = Math.random() * Math.PI * 2
        const d = Math.random() * 20
        run.coins.push({ x: enemy.x + Math.cos(a) * d, y: enemy.y + Math.sin(a) * d, value: 1 })
      }
    } else if (Math.random() < ENEMIES[enemy.type].coinChance) {
      run.coins.push({ x: enemy.x, y: enemy.y, value: 1 })
    }
  }
}

/** @returns the final applied damage number (post multiplier/crit), for effects like star blast. */
function applyDamage(run, enemy, baseDmg) {
  const p = run.player
  let dmg = baseDmg * p.damageMul * (1 + run.passives.damage)
  let crit = false
  if (Math.random() < p.critChance + run.passives.critChance) {
    dmg *= (p.critDamage + run.passives.critDamage)
    crit = true
  }
  dmg = Math.round(dmg)
  dealDamage(run, enemy, dmg, crit)
  return dmg
}

// Nearest enemy within (viewRadius + pad), or null. Shared by weapons that target on fire.
function nearestEnemy(run, pad = 100) {
  const p = run.player
  const rangeSq = (run.viewRadius + pad) ** 2
  let target = null
  let bestSq = Infinity
  for (const e of run.enemies) {
    const dx = e.x - p.x, dy = e.y - p.y
    const dSq = dx * dx + dy * dy
    if (dSq <= rangeSq && dSq < bestSq) { bestSq = dSq; target = e }
  }
  return target
}

// ---- Weapons ------------------------------------------------------------------------

function stepWeapons(run, dt) {
  const p = run.player
  run.orbs = []
  const fireRateMul = p.fireRateMul * (1 + run.passives.fireRate)

  for (const w of run.weapons) {
    const stats = WEAPONS[w.id].levels[w.level - 1]
    if (w.id === 'star') stepStarWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'wave') stepWaveWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'orbit') stepOrbitWeapon(run, stats, fireRateMul)
    else if (w.id === 'boomerang') stepBoomerangWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'mines') stepMinesWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'zap') stepZapWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'homing') stepHomingWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'hole') stepHoleWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'rainbow') stepBeamWeapon(run, w, stats, fireRateMul, dt)
  }

  stepBullets(run, dt)
  stepNovas(run, dt)
  stepBoomerangs(run, dt)
  stepMines(run, dt)
  stepZaps(run, dt)
  stepHomingShots(run, dt)
  stepHoles(run, dt)
  stepBeams(run, dt)

  if (run.enemies.some((e) => e._dead)) run.enemies = run.enemies.filter((e) => !e._dead)
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

  const count = stats.count
  const pierce = stats.pierce + (run.starMods?.pierce ?? 0)
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
      hitIds: new Set(),
    })
  }
  run.events.push({ type: 'shoot', weapon: 'star' })
}

// Exploding Stars mod: splash a % of the hit's dealt damage onto everything else within
// STAR_BLAST_RADIUS of the hit enemy (the hit enemy itself already took full damage).
function starBlast(run, hitEnemy, dmgDealt, blastPct) {
  const blastDmg = Math.round(dmgDealt * blastPct)
  if (blastDmg <= 0) return
  const radSq = STAR_BLAST_RADIUS * STAR_BLAST_RADIUS
  for (const e of run.enemies) {
    if (e._dead || e.id === hitEnemy.id) continue
    const dx = e.x - hitEnemy.x, dy = e.y - hitEnemy.y
    if (dx * dx + dy * dy <= radSq) dealDamage(run, e, blastDmg, false)
  }
  run.events.push({ type: 'explode', x: hitEnemy.x, y: hitEnemy.y, radius: STAR_BLAST_RADIUS })
}

function stepBullets(run, dt) {
  const bullets = run.bullets
  const blastPct = run.starMods?.blast ?? 0
  for (const b of bullets) {
    b.x += b.vx * dt
    b.y += b.vy * dt
    b.life -= dt
    if (b.life <= 0 || b.pierce <= 0) continue

    for (const e of run.enemies) {
      if (b.pierce <= 0) break
      if (e._dead || b.hitIds.has(e.id)) continue
      const dx = e.x - b.x, dy = e.y - b.y
      const rad = b.r + e.radius
      if (dx * dx + dy * dy <= rad * rad) {
        const dmgDealt = applyDamage(run, e, b.dmg)
        b.hitIds.add(e.id)
        b.pierce--
        if (blastPct > 0) starBlast(run, e, dmgDealt, blastPct)
      }
    }
  }
  run.bullets = bullets.filter((b) => b.life > 0 && b.pierce > 0)
}

function stepOrbitWeapon(run, stats, fireRateMul) {
  const p = run.player
  for (let i = 0; i < stats.orbs; i++) {
    const angle = (i / stats.orbs) * Math.PI * 2 + run.time * stats.rotSpeed
    const ox = p.x + Math.cos(angle) * stats.radius
    const oy = p.y + Math.sin(angle) * stats.radius
    run.orbs.push({ x: ox, y: oy })

    for (const e of run.enemies) {
      if (e._dead || e.orbCd > 0) continue
      const dx = e.x - ox, dy = e.y - oy
      const rad = ORB_R + e.radius
      if (dx * dx + dy * dy <= rad * rad) {
        applyDamage(run, e, stats.dmg)
        e.orbCd = stats.tick / fireRateMul
      }
    }
  }
}

function stepWaveWeapon(run, w, stats, fireRateMul, dt) {
  const p = run.player
  fireOnTimer(run, w.id, stats.interval / fireRateMul, dt, () => {
    run.novas.push({
      x: p.x, y: p.y, r: 0, maxR: stats.radius,
      dmg: stats.dmg, knockback: stats.knockback,
      life: NOVA_LIFE, hit: new Set(),
    })
    run.events.push({ type: 'shoot', weapon: 'wave' })
  })
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
        const kdx = dist > 1e-6 ? dx / dist : 1
        const kdy = dist > 1e-6 ? dy / dist : 0
        e.kb.x += kdx * n.knockback
        e.kb.y += kdy * n.knockback
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

  const count = stats.count
  const step = count > 1 ? (2 * BOOMERANG_FAN) / (count - 1) : 0
  for (let i = 0; i < count; i++) {
    const angle = count > 1 ? baseAngle - BOOMERANG_FAN + i * step : baseAngle
    run.boomerangs.push({
      x: p.x, y: p.y, ox: p.x, oy: p.y,
      angle, phase: 'out',
      dmg: stats.dmg, hit: new Set(),
      speed: stats.speed, range: stats.range,
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
      const rad = BOOMERANG_HIT_R + e.radius
      if (dx * dx + dy * dy <= rad * rad) {
        applyDamage(run, e, b.dmg)
        b.hit.add(e.id)
      }
    }
  }
  run.boomerangs = run.boomerangs.filter((b) => !b._done)
}

// -- Mines --------------------------------------------------------------------------

function stepMinesWeapon(run, w, stats, fireRateMul, dt) {
  fireOnTimer(run, w.id, stats.interval / fireRateMul, dt, () => {
    if (run.mines.length >= stats.maxAlive) return
    const p = run.player
    run.mines.push({
      x: p.x - p.facing * 20, y: p.y,
      arm: 0.4, dmg: stats.dmg, radius: stats.radius,
    })
  })
}

function stepMines(run, dt) {
  for (const m of run.mines) {
    if (m.arm > 0) { m.arm = Math.max(0, m.arm - dt); continue }

    let triggered = false
    for (const e of run.enemies) {
      if (e._dead) continue
      const dx = e.x - m.x, dy = e.y - m.y
      const trig = MINE_TRIGGER_R + e.radius
      if (dx * dx + dy * dy <= trig * trig) { triggered = true; break }
    }
    if (!triggered) continue

    for (const e of run.enemies) {
      if (e._dead) continue
      const dx = e.x - m.x, dy = e.y - m.y
      if (dx * dx + dy * dy <= m.radius * m.radius) applyDamage(run, e, m.dmg)
    }
    run.events.push({ type: 'explode', x: m.x, y: m.y, radius: m.radius })
    m._dead = true
  }
  run.mines = run.mines.filter((m) => !m._dead)
}

// -- Chain zap ------------------------------------------------------------------------

function stepZapWeapon(run, w, stats, fireRateMul, dt) {
  fireOnTimer(run, w.id, stats.interval / fireRateMul, dt, () => fireZap(run, stats))
}

function fireZap(run, stats) {
  const p = run.player
  const viewRangeSq = (run.viewRadius + 100) ** 2
  const chainRangeSq = stats.chainRange * stats.chainRange
  const hitIds = new Set()
  const points = [[p.x, p.y]]
  let last = { x: p.x, y: p.y }

  for (let i = 0; i < stats.chains; i++) {
    const maxSq = i === 0 ? viewRangeSq : chainRangeSq
    let target = null
    let bestSq = Infinity
    for (const e of run.enemies) {
      if (e._dead || hitIds.has(e.id)) continue
      const dx = e.x - last.x, dy = e.y - last.y
      const dSq = dx * dx + dy * dy
      if (dSq <= maxSq && dSq < bestSq) { bestSq = dSq; target = e }
    }
    if (!target) break
    applyDamage(run, target, stats.dmg)
    hitIds.add(target.id)
    points.push([target.x, target.y])
    last = target
  }

  if (points.length > 1) {
    run.zaps.push({ points, life: 0.25 })
    run.events.push({ type: 'zap' })
  }
}

function stepZaps(run, dt) {
  for (const z of run.zaps) z.life -= dt
  run.zaps = run.zaps.filter((z) => z.life > 0)
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

  const count = stats.count
  for (let i = 0; i < count; i++) {
    const angle = count > 1 ? baseAngle + (i - (count - 1) / 2) * HOMING_FAN : baseAngle
    run.homingShots.push({
      x: p.x, y: p.y,
      vx: Math.cos(angle) * stats.speed,
      vy: Math.sin(angle) * stats.speed,
      dmg: stats.dmg, life: stats.life,
      speed: stats.speed, turnRate: stats.turnRate,
    })
  }
  run.events.push({ type: 'shoot', weapon: 'homing' })
}

function stepHomingShots(run, dt) {
  for (const h of run.homingShots) {
    h.life -= dt
    if (h.life <= 0) continue

    let target = null
    let bestSq = Infinity
    for (const e of run.enemies) {
      if (e._dead) continue
      const dx = e.x - h.x, dy = e.y - h.y
      const dSq = dx * dx + dy * dy
      if (dSq < bestSq) { bestSq = dSq; target = e }
    }
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
      if (e._dead) continue
      const dx = e.x - h.x, dy = e.y - h.y
      const rad = HOMING_HIT_R + e.radius
      if (dx * dx + dy * dy <= rad * rad) {
        applyDamage(run, e, h.dmg)
        h.life = 0
        break
      }
    }
  }
  run.homingShots = run.homingShots.filter((h) => h.life > 0)
}

// -- Black hole -------------------------------------------------------------------------

function stepHoleWeapon(run, w, stats, fireRateMul, dt) {
  fireOnTimer(run, w.id, stats.interval / fireRateMul, dt, () => fireHole(run, stats))
}

function fireHole(run, stats) {
  const p = run.player
  const viewSq = run.viewRadius * run.viewRadius
  const inView = run.enemies.filter((e) => {
    if (e._dead) return false
    const dx = e.x - p.x, dy = e.y - p.y
    return dx * dx + dy * dy <= viewSq
  })

  let x, y
  if (inView.length > 0) {
    const e = inView[Math.floor(Math.random() * inView.length)]
    x = e.x; y = e.y
  } else {
    const a = Math.random() * Math.PI * 2
    const d = 250 + Math.random() * 150
    x = p.x + Math.cos(a) * d
    y = p.y + Math.sin(a) * d
  }

  run.holes.push({
    x, y, radius: stats.radius, coreRadius: stats.radius * HOLE_CORE_FRAC,
    life: stats.duration, duration: stats.duration,
    dmg: stats.dmg, tick: stats.tick, pull: stats.pull, acc: 0,
  })
  run.events.push({ type: 'hole' })
}

// Runs after stepEnemyMovement, so the vortex always wins the tug-of-war near the core
// instead of enemies "escaping" on the same frame they were pulled in.
function stepHoles(run, dt) {
  const pulled = new Set() // enemy ids affected by a hole this frame; rest decay e.holePull toward 0

  for (const h of run.holes) {
    h.life -= dt
    if (h.life <= 0) continue

    for (const e of run.enemies) {
      if (e._dead) continue
      const dx = h.x - e.x, dy = h.y - e.y
      const d = Math.hypot(dx, dy)
      if (d > 1e-6 && d <= h.radius) {
        // Suction ramps from HOLE_RIM_PULL_MUL at the rim up to full strength at the core,
        // so enemies near the edge can still resist while anything close in gets locked down.
        const span = Math.max(1e-6, h.radius - h.coreRadius)
        const t = d <= h.coreRadius ? 1 : Math.max(0, 1 - (d - h.coreRadius) / span)
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
  const angle = target
    ? Math.atan2(target.y - p.y, target.x - p.x)
    : (p.facing >= 0 ? 0 : Math.PI)

  run.beams.push({
    angle, life: stats.duration, duration: stats.duration, dmg: stats.dmg,
    tick: stats.tick, width: stats.width, length: stats.length,
    rotSpeed: stats.rotSpeed, acc: 0,
  })
  run.events.push({ type: 'beam' })
}

function stepBeams(run, dt) {
  const p = run.player
  for (const b of run.beams) {
    b.life -= dt
    if (b.life <= 0) continue
    b.angle += b.rotSpeed * dt

    b.acc += dt
    while (b.acc >= b.tick) {
      b.acc -= b.tick
      const cos = Math.cos(b.angle), sin = Math.sin(b.angle)
      for (const e of run.enemies) {
        if (e._dead) continue
        const dx = e.x - p.x, dy = e.y - p.y
        const along = dx * cos + dy * sin           // distance projected onto the beam axis
        const perp = -dx * sin + dy * cos            // perpendicular distance from the axis
        if (along >= 0 && along <= b.length && Math.abs(perp) < b.width / 2 + e.radius) {
          applyDamage(run, e, b.dmg)
        }
      }
    }
  }
  run.beams = run.beams.filter((b) => b.life > 0)
}

// ---- Pickups ------------------------------------------------------------------------

function magnetSpeed(dist, magnet) {
  const t = magnet > 0 ? Math.min(1, Math.max(0, dist / magnet)) : 0
  return 800 - t * 300 // faster (800px/s) when close, slower (500px/s) near magnet edge
}

function stepPickups(run, dt) {
  const p = run.player
  const magnet = p.magnet * (1 + run.passives.magnet)
  const magnetSq = magnet * magnet
  const pickupSq = PLAYER.pickupRadius * PLAYER.pickupRadius

  const collect = (list, onPickup) => {
    const kept = []
    for (const it of list) {
      const dx = p.x - it.x, dy = p.y - it.y
      const distSq = dx * dx + dy * dy
      if (distSq <= pickupSq) { onPickup(it); continue }
      if (distSq <= magnetSq) {
        const dist = Math.sqrt(distSq)
        const spd = magnetSpeed(dist, magnet)
        it.x += (dx / dist) * spd * dt
        it.y += (dy / dist) * spd * dt
      }
      kept.push(it)
    }
    return kept
  }

  run.gems = collect(run.gems, (g) => {
    p.xp += g.xp * GEM_VALUE * (1 + run.passives.xpGain)
    run.events.push({ type: 'gem', x: g.x, y: g.y })
  })
  run.coins = collect(run.coins, (c) => {
    run.coinsEarned += Math.round(c.value * p.coinGainMul)
    run.events.push({ type: 'coin', x: c.x, y: c.y, value: c.value })
  })
}

// ---- Level up -----------------------------------------------------------------------

// Weapon candidates: new (unowned, only if under MAX_WEAPONS) + upgrades (below max level).
// Each carries its inherent config rarity; passives are added per-card once a rarity is rolled.
function weaponCandidates(run) {
  const ownedIds = new Set(run.weapons.map((w) => w.id))
  const list = []

  if (run.weapons.length < MAX_WEAPONS) {
    for (const id of Object.keys(WEAPONS)) {
      if (!ownedIds.has(id)) {
        const cfg = WEAPONS[id]
        list.push({ kind: 'weapon', id, title: cfg.name, desc: cfg.desc, tag: 'New!', rarity: cfg.rarity, icon: cfg.icon })
      }
    }
  }
  for (const w of run.weapons) {
    if (w.level < MAX_WEAPON_LEVEL) {
      const cfg = WEAPONS[w.id]
      list.push({ kind: 'weapon', id: w.id, title: cfg.name, desc: cfg.desc, tag: `Lv ${w.level + 1}`, rarity: cfg.rarity, icon: cfg.icon })
    }
  }
  return list
}

function eligiblePassiveIds(run) {
  return Object.keys(PASSIVES).filter((id) => (run.passivePicks[id] ?? 0) < MAX_PASSIVE_LEVEL)
}

// Star mods are offered only while the star weapon is owned, and only up to their pick cap.
function eligibleStarModIds(run) {
  if (!run.weapons.some((w) => w.id === 'star')) return []
  return Object.keys(STAR_MODS).filter((id) => (run.starModPicks[id] ?? 0) < MAX_STAR_MOD_PICKS)
}

// A passive card adopts whatever rarity was rolled for its slot.
function makePassiveCard(run, id, rarity) {
  const cfg = PASSIVES[id]
  const mult = RARITIES[rarity].mult
  let bonus = cfg.base * mult
  if (cfg.kind === 'flat') bonus = Math.round(bonus * 10) / 10
  const picks = run.passivePicks[id] ?? 0
  const desc = cfg.kind === 'pct'
    ? `+${Math.round(bonus * 100)}% ${cfg.desc}`
    : `+${bonus} ${cfg.desc}`
  return { kind: 'passive', id, title: cfg.name, desc, tag: `Lv ${picks + 1}`, rarity, icon: '💪', bonus }
}

// A star-mod card adopts whatever rarity was rolled for its slot, same as passives.
// pierce (flat) rounds to a whole extra hit (min 1); blast (pct) is additive %.
function makeStarModCard(run, id, rarity) {
  const cfg = STAR_MODS[id]
  const mult = RARITIES[rarity].mult
  const bonus = cfg.kind === 'flat'
    ? Math.max(1, Math.round(cfg.base * mult))
    : cfg.base * mult
  const desc = cfg.kind === 'pct'
    ? `+${Math.round(bonus * 100)}% ${cfg.desc}`
    : `+${bonus} ${cfg.desc}`
  return { kind: 'mod', id, title: cfg.name, desc, tag: 'Star upgrade', rarity, icon: cfg.icon, bonus }
}

// Roll one card: pick a rarity weighted by player level, gather candidates at that rarity
// (inherent-rarity weapons + all eligible passives/star-mods adopting the roll), and walk
// down RARITY_ORDER if that tier is empty. Excludes ids already used by earlier cards this pool.
function rollCard(run, weaponPool, passiveIds, modIds, pickedIds) {
  let idx = RARITY_ORDER.indexOf(pickWeighted(rarityWeights(run.player.level)))
  while (idx >= 0) {
    const rarity = RARITY_ORDER[idx]
    const options = []
    for (const wc of weaponPool) {
      if (wc.rarity === rarity && !pickedIds.has(wc.id)) options.push(wc)
    }
    for (const pid of passiveIds) {
      if (!pickedIds.has(pid)) options.push(makePassiveCard(run, pid, rarity))
    }
    for (const mid of modIds) {
      if (!pickedIds.has(mid)) options.push(makeStarModCard(run, mid, rarity))
    }
    if (options.length > 0) return options[Math.floor(Math.random() * options.length)]
    idx--
  }
  return null
}

function buildLevelUpChoices(run) {
  const weaponPool = weaponCandidates(run)
  const passiveIds = eligiblePassiveIds(run)
  const modIds = eligibleStarModIds(run)

  if (weaponPool.length === 0 && passiveIds.length === 0 && modIds.length === 0) {
    return [{ kind: 'heal', title: 'Snack Break', desc: 'Heal 30 HP', tag: '', rarity: 'normal', icon: '🍡' }]
  }

  const pickedIds = new Set()
  const cards = []
  for (let i = 0; i < 3; i++) {
    const card = rollCard(run, weaponPool, passiveIds, modIds, pickedIds)
    if (!card) break
    cards.push(card)
    pickedIds.add(card.id)
  }

  if (cards.length === 0) {
    return [{ kind: 'heal', title: 'Snack Break', desc: 'Heal 30 HP', tag: '', rarity: 'normal', icon: '🍡' }]
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
  run.levelUpChoices = buildLevelUpChoices(run)
  run.phase = 'levelup'
  run.events.push({ type: 'levelup' })
}

// Exported for test/sim-test.js only (rarity distribution sanity checks); main.js does
// not use this directly — it just drives stepSim/applyChoice.
export { buildLevelUpChoices }
