// Pure simulation. No Pixi/DOM/localStorage — mutates `run` (see state.js) and
// pushes events consumed once per frame by main.js/render.js.
// Contract: see state.js (run shape + events) and config.js (all numbers).

import {
  RUN_DURATION, PLAYER, WEAPONS, MAX_WEAPON_LEVEL,
  PASSIVES, MAX_PASSIVE_LEVEL, ENEMIES, ELITE, WAVE_TABLE,
  spawnRate, hpScale, MAX_ALIVE, ELITE_EVERY, SPAWN_RING,
  xpForLevel, GEM_VALUE,
  STAR_LIFE, STAR_R, STAR_FAN, ORB_R, NOVA_LIFE,
} from './config.js'

const KB_DECAY_RATE = 6 // per-second exponential-ish decay factor for enemy knockback

/** Advance the simulation by dt seconds. input = {x, y} normalized move vector. */
export function stepSim(run, input, dt) {
  run.time += dt
  if (run.time >= RUN_DURATION) {
    run.phase = 'victory'
    run.events.push({ type: 'victory' })
    return
  }

  stepPlayerMovement(run, input, dt)
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
    else run.weapons.push({ id: choice.id, level: 1 })
  } else if (choice.kind === 'passive') {
    run.passives[choice.id] = (run.passives[choice.id] ?? 0) + 1
    if (choice.id === 'maxHP') {
      p.maxHP += PASSIVES.maxHP.perLevel
      p.hp = Math.min(p.maxHP, p.hp + PASSIVES.maxHP.perLevel)
    }
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

  const speedMul = 1 + run.passives.moveSpeed * PASSIVES.moveSpeed.perLevel
  const speed = p.speed * speedMul
  p.x += ix * speed * dt
  p.y += iy * speed * dt

  p.moving = len > 1e-6
  if (ix > 1e-6) p.facing = 1
  else if (ix < -1e-6) p.facing = -1

  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt)
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

function pickWeightedType(weights) {
  const entries = Object.entries(weights)
  let total = 0
  for (const [, w] of entries) total += w
  let r = Math.random() * total
  for (const [type, w] of entries) {
    r -= w
    if (r <= 0) return type
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

  const type = pickWeightedType(waveWeights(run.time))
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
      p.hp -= e.dmg
      p.invuln = PLAYER.invulnTime
      run.events.push({ type: 'hurt', dmg: e.dmg })
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

function applyDamage(run, enemy, baseDmg) {
  const p = run.player
  let dmg = baseDmg * p.damageMul
  let crit = false
  if (Math.random() < p.critChance) {
    dmg *= p.critDamage
    crit = true
  }
  dmg = Math.round(dmg)

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

// ---- Weapons ------------------------------------------------------------------------

function stepWeapons(run, dt) {
  const p = run.player
  run.orbs = []
  const fireRateMul = p.fireRateMul * (1 + run.passives.fireRate * PASSIVES.fireRate.perLevel)

  for (const w of run.weapons) {
    const stats = WEAPONS[w.id].levels[w.level - 1]
    if (w.id === 'star') stepStarWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'wave') stepWaveWeapon(run, w, stats, fireRateMul, dt)
    else if (w.id === 'orbit') stepOrbitWeapon(run, stats, fireRateMul)
  }

  stepBullets(run, dt)
  stepNovas(run, dt)

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
  const rangeSq = (run.viewRadius + 100) ** 2

  let target = null
  let bestSq = Infinity
  for (const e of run.enemies) {
    const dx = e.x - p.x, dy = e.y - p.y
    const dSq = dx * dx + dy * dy
    if (dSq <= rangeSq && dSq < bestSq) { bestSq = dSq; target = e }
  }

  const baseAngle = target
    ? Math.atan2(target.y - p.y, target.x - p.x)
    : (p.facing >= 0 ? 0 : Math.PI)

  const count = stats.count
  for (let i = 0; i < count; i++) {
    const angle = baseAngle + (i - (count - 1) / 2) * STAR_FAN
    run.bullets.push({
      x: p.x, y: p.y,
      vx: Math.cos(angle) * stats.speed,
      vy: Math.sin(angle) * stats.speed,
      dmg: stats.dmg,
      pierce: stats.pierce,
      life: STAR_LIFE,
      r: STAR_R,
      hitIds: new Set(),
    })
  }
  run.events.push({ type: 'shoot', weapon: 'star' })
}

function stepBullets(run, dt) {
  const bullets = run.bullets
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
        applyDamage(run, e, b.dmg)
        b.hitIds.add(e.id)
        b.pierce--
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

// ---- Pickups ------------------------------------------------------------------------

function magnetSpeed(dist, magnet) {
  const t = magnet > 0 ? Math.min(1, Math.max(0, dist / magnet)) : 0
  return 800 - t * 300 // faster (800px/s) when close, slower (500px/s) near magnet edge
}

function stepPickups(run, dt) {
  const p = run.player
  const magnet = p.magnet * (1 + run.passives.magnet * PASSIVES.magnet.perLevel)
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
    p.xp += g.xp * GEM_VALUE
    run.events.push({ type: 'gem', x: g.x, y: g.y })
  })
  run.coins = collect(run.coins, (c) => {
    run.coinsEarned += Math.round(c.value * p.coinGainMul)
    run.events.push({ type: 'coin', x: c.x, y: c.y, value: c.value })
  })
}

// ---- Level up -----------------------------------------------------------------------

function buildLevelUpChoices(run) {
  const pool = []
  const ownedIds = new Set(run.weapons.map((w) => w.id))

  for (const id of Object.keys(WEAPONS)) {
    if (!ownedIds.has(id)) {
      pool.push({ kind: 'weapon', id, title: WEAPONS[id].name, desc: WEAPONS[id].desc, tag: 'New!' })
    }
  }
  for (const w of run.weapons) {
    if (w.level < MAX_WEAPON_LEVEL) {
      pool.push({ kind: 'weapon', id: w.id, title: WEAPONS[w.id].name, desc: WEAPONS[w.id].desc, tag: `Lv ${w.level + 1}` })
    }
  }
  for (const id of Object.keys(PASSIVES)) {
    const lvl = run.passives[id] ?? 0
    if (lvl < MAX_PASSIVE_LEVEL) {
      pool.push({ kind: 'passive', id, title: PASSIVES[id].name, desc: PASSIVES[id].desc, tag: `Lv ${lvl + 1}` })
    }
  }

  if (pool.length === 0) {
    return [{ kind: 'heal', title: 'Snack Break', desc: 'Heal 30 HP', tag: '' }]
  }

  const picks = []
  const n = Math.min(3, pool.length)
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * pool.length)
    picks.push(pool.splice(idx, 1)[0])
  }
  return picks
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
