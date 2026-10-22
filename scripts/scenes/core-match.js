// Scene: THE CORE laid out to MATCH a scene of the Liquid Metal FINAL demo, for the side-by-side gauntlet
// (scripts/core-match.mjs drives both sides and crops them; run it, not this file).
//
//   ?scene=<base64 JSON>  { pole, flip, pillars: [[dx, dy, pole]], pools: [[dx, dy, rx, ry, rot, pole, seed]],
//                           foes: [[kind, dx, dy, pole, ph]], move: [mx, my] | null, warm, every, demoT }
//   offsets and sizes in the demo's units (1 unit = 667 world px) from the player; kinds are the demo's.
//   The player is moved to the demo's spot (1.5, 2.0) units, so the floor's world coordinates, the pillars'
//   seeds and the floor clock (set to 0 before the warm-up, as the demo's starts) are the demo's too.
//   Every body is pinned where the scene puts it, every tick: only their state (pole reaction, spikes,
//   the eel's heading, the pools and pillars' easing) runs on. The player stands still, or walks `move`.
//   __fxResult.frames[i] = the player's screen position (CSS px) in frame i, for the crop.
const U = 667
const sc = JSON.parse(atob(new URLSearchParams(location.search).get('scene')))
const ID = { mite: 'ferriteMite', urchin: 'needleUrchin', top: 'spinningTop', blob: 'ferroBlob', eel: 'dipoleEel', golem: 'lodestoneGolem' }
const result = { frames: [] }
window.__fxResult = result
if (run.chapter !== 'core') throw new Error('not The Core: ' + run.chapter)
const p = run.player
let flipped = false   // flip: your pole turns to -pole once the warm-up is over (the drop's tint eases across)
const setPole = () => { run.polarity.pole = flipped ? -sc.pole : sc.pole; run.polarity.poolCd = 9 }
run.weapons = []
H.tick()
setPole()
// one live body of every kind the scene needs, from the real spawner, to clone
const need = [...new Set(sc.foes.map((f) => ID[f[0]]))]
H.until(() => { setPole(); return need.every((id) => run.enemies.some((e) => !e._dead && e.rosterId === id)) }, 9000)
const tmpl = {}
for (const id of need) { tmpl[id] = run.enemies.find((e) => !e._dead && e.rosterId === id); if (!tmpl[id]) throw new Error('never spawned ' + id) }
const P0 = { x: 1.5 * U, y: 2.0 * U }
p.x = P0.x; p.y = P0.y
let nextId = 900000
const foes = sc.foes.map(([kind, dx, dy, pole, ph]) => {
  const t = tmpl[ID[kind]]
  const e = { ...t, id: nextId++, kb: { x: 0, y: 0 }, flags: t.flags, _pin: { x: P0.x + dx * U, y: P0.y + dy * U, pole } }
  e.pole = pole; e.latched = false; e.stunT = 0; e.spike = 0; e.hitFlash = 0; e._ph = e._pph = ph ?? 0; e.hx = 1; e.hy = 0
  return e
})
const pillars = sc.pillars.map(([dx, dy, pole], i) => ({ x: P0.x + dx * U, y: P0.y + dy * U, r: 21, kind: 'pillar', rot: 0, pole, _cell: 'm' + i }))
const pools = sc.pools.map(([dx, dy, rx, ry, rot, pole, seed], i) => ({ x: P0.x + dx * U, y: P0.y + dy * U, rx: rx * U, ry: ry * U, rot, pole, seed, _cell: 'q' + i }))
const pin = () => {
  run.enemies = foes.slice()   // a copy: the spawner pushes into run.enemies, and its newcomers are dropped here
  run.obstacles = pillars.slice()
  run.corePools = pools.slice()
  run.needles = []
  run.gems = []; run.coins = []
  setPole()
  for (const e of foes) { e.x = e._pin.x; e.y = e._pin.y; e.hp = e.maxHP = 99999; e._dead = false; e.latched = false; if (e.flags.includes('poleStrobe')) e._pph = e._ph - t0; else e.pole = e._pin.pole }
  p.hp = p.maxHP
}
const mv = sc.move ? { x: sc.move[0], y: sc.move[1] } : { x: 0, y: 0 }
const tick = (n, move) => {
  for (let i = 0; i < n; i++) {
    pin()
    step(run, move ? mv : { x: 0, y: 0 }, 1 / 60)
    run.events.length = 0
    pin()
    if (!move) { p.x = P0.x; p.y = P0.y }
    p.invuln = 0   // drawn unhurt, as the demo half pins its player (fx-probe syncs once more after the scene)
    window.__renderer.sync(run, 1 / 60, [])
  }
  app.renderer.render(app.stage)
  const ps = window.__renderer.playerScreen
  result.frames.push([ps.x, ps.y])
}
// the top's strobe phase on the demo's clock: run.time at the first frame reads as the demo's game time then
const t0 = run.time + (sc.warm ?? 180) / 60 - (sc.demoT ?? 3)
pin()
p.x = P0.x; p.y = P0.y
window.__liquid.S.rt = -0.05   // fx-probe's own H.render after the scene adds its last 0.05 s: the frame lands at the demo's 3.00 s
tick(sc.warm ?? 180, false)
result.frames.length = 0
flipped = !!sc.flip
let n = 0
if (new URLSearchParams(location.search).has("nopixi")) app.canvas.style.opacity = "0"   // ablation: the demo canvas alone
return () => {
  if (n > 0) tick(sc.every ?? 10, !!sc.move)
  else { app.renderer.render(app.stage); const ps = window.__renderer.playerScreen; result.frames.push([ps.x, ps.y]) }
  n++
}
