// Scene: THE CORE's two pole weapons, every state on one identical frame, for the look variants.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/core-weapons.js --chapter core --dpr 3 --frames 4 \
//     --url 'http://127.0.0.1:5173/?wep=moons' --out /tmp/cw/moons0 --json /tmp/cw/moons0.json
//   (FX_CHROME_ARGS as scripts/core-match.mjs sets it; one invocation at a time)
//
//   ?wep=moons  Mercury Moons L5: frames 0 orbiting (foes out of reach), 1 tugging a South blob and mite
//               (you North), 2 four ticks after you turn South (the drop mid-ease), 3 settled South.
//   ?wep=decoy  Decoy Lodestone L5, laid by hand at a fixed spot (North): --frames 5: 0 just dropped,
//               1 pulling South bodies in (you walk 150 px off), 2 the crowd on it, 3 its burst at 0.12 s
//               (the burst kills them: free bodies keep their real hp), 4 spent at 0.65 s.
//   &mode=strip six frames instead: moons every 4 ticks while tugging; decoy across its whole life.
//   &mode=gif (decoy): one frame every 0.05 s from the drop to the end of the spent puddle, --frames 95.
//   &dv= picks the lodestone's look variant (src/liquid.js reads it itself).
//   __fxResult.frames[i] = the player's screen position (CSS px) in frame i, for the crop.
const q = new URLSearchParams(location.search)
const WEP = q.get('wep') ?? 'moons', STRIP = q.get('mode') === 'strip'
const result = { frames: [] }
window.__fxResult = result
if (run.chapter !== 'core') throw new Error('not The Core: ' + run.chapter)
const p = run.player
let pole = 1
const setPole = () => { run.polarity.pole = pole; run.polarity.poolCd = 9 }
run.weapons = []
H.tick()
setPole()
H.until(() => { setPole(); return ['ferriteMite', 'ferroBlob'].every((id) => run.enemies.some((e) => !e._dead && e.rosterId === id)) }, 9000)
const tmpl = {}
for (const id of ['ferriteMite', 'ferroBlob']) tmpl[id] = run.enemies.find((e) => !e._dead && e.rosterId === id)
const P0 = { x: 1000, y: 1300 }
let nextId = 900000
const mk = (id, x, y, ep, free) => {
  const t = tmpl[id]
  const e = { ...t, id: nextId++, kb: { x: 0, y: 0 }, flags: t.flags, _pin: { x, y }, _free: !!free }
  e.pole = ep; e.hp = e.maxHP; e._dead = false; e.latched = false; e.stunT = 0; e.spike = 0; e.hitFlash = 0; e.x = x; e.y = y
  return e
}
let foes = []
const pin = () => {
  run.enemies = foes.filter((e) => !e._dead)   // the spawner's newcomers are dropped every tick
  run.obstacles = []; run.corePools = []; run.needles = []; run.enemyShots = []
  run.gems = []; run.coins = []
  setPole()
  for (const e of foes) {
    if (e._free) { e.latched = false; e.pole = e._ep; continue }   // free bodies keep their hp: the burst kills them
    e.x = e._pin.x; e.y = e._pin.y
    e.hp = e.maxHP = 99999; e._dead = false; e.latched = false; e.hitFlash = 0; e.pole = e._ep ?? e.pole
  }
  p.hp = p.maxHP; p.invuln = 0
}
let pAt = { x: P0.x, y: P0.y }
const tick = (n) => {
  for (let i = 0; i < n; i++) {
    pin()
    p.x = pAt.x; p.y = pAt.y
    step(run, { x: 0, y: 0 }, 1 / 60)
    const ev = run.events.splice(0).filter((e) => e.type === 'lodestoneBlast')   // the burst look is event-born
    pin()
    p.x = pAt.x; p.y = pAt.y
    window.__renderer.sync(run, 1 / 60, ev)
  }
}
const shot = () => {
  app.renderer.render(app.stage)
  const ps = window.__renderer.playerScreen
  result.frames.push([ps.x, ps.y])
}

if (WEP === 'moons') {
  run.weapons = [{ id: 'mercuryMoons', level: 5 }]
  // a South blob and mite just outside the orbit, a North mite on the far side; far away for frame 0
  const near = [mk('ferroBlob', P0.x + 150, P0.y + 20, -1), mk('ferriteMite', P0.x + 40, P0.y - 128, -1), mk('ferriteMite', P0.x - 135, P0.y + 50, 1)]
  for (const e of near) e._ep = e.pole
  const far = near.map((e) => ({ x: e._pin.x + (e._pin.x - P0.x) * 2.2, y: e._pin.y + (e._pin.y - P0.y) * 2.2 }))
  const place = (fr) => near.forEach((e, i) => { e._pin = fr ? far[i] : { x: e.x0 ?? e._pin.x, y: e.y0 ?? e._pin.y } })
  near.forEach((e) => { e.x0 = e._pin.x; e.y0 = e._pin.y })
  foes = near
  const reset = () => { run.moonA = 0.4 }
  let n = 0
  return () => {
    if (STRIP) { if (n === 0) { place(false); reset(); tick(90) } else tick(4) }
    else if (n === 0) { place(true); reset(); tick(90) }
    else if (n === 1) { place(false); reset(); tick(90) }
    else if (n === 2) { pole = -1; tick(4) }
    else tick(56)
    shot(); n++
  }
}

// decoy: a North lodestone at P0, you walking off east; South bodies round it (pulled), North ones still
const L = { x: P0.x, y: P0.y, pole: 1, t: 0, fuse: 3, dmg: 85, r: 140, pullR: 210, pull: 170 }
const ring = []
for (let i = 0; i < 7; i++) {
  const a = 1.9 + i * 0.42, d = 225 + (i % 3) * 30
  ring.push(mk(i % 3 ? 'ferriteMite' : 'ferroBlob', P0.x + Math.cos(a) * d, P0.y + Math.sin(a) * d, -1, true))
}
const still = [mk('ferriteMite', P0.x - 40, P0.y - 230, 1), mk('ferroBlob', P0.x + 60, P0.y + 240, 1)]
foes = [...ring, ...still]
for (const e of foes) e._ep = e.pole
run.weapons = []
const at = (t) => { pAt = { x: P0.x + 40 + 110 * Math.min(1, t), y: P0.y } }
let t = 0
const advance = (to) => {
  while (t < to - 1e-6) {
    if (t === 0) run.lodestones = [L]
    at(t)
    tick(1); t += 1 / 60
  }
}
const times = q.get('mode') === 'gif' ? Array.from({ length: 95 }, (_, i) => 0.05 * (i + 1))
  : STRIP ? [0.3, 0.5, 0.7, 2.85, 3.1, 3.6] : [0.2, 0.55, 2.6, 3.12, 3.65]
let n = 0
return () => { advance(times[Math.min(n, times.length - 1)]); shot(); n++ }
