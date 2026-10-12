// The Mantle: RIDING A BOAT across the lava as it sinks. At the flood, a boat is moored under the
// player in open lava and he steers it back and forth; each frame is taken further into its float (the sim's
// own clock, nothing set by hand): fresh, past half (boots under), near the end (steam, bubbles), the
// last moment. The crowd is cleared so the boat reads.
//   node scripts/fx-probe.mjs --scene scripts/scenes/mantle-boats-ride.js --chapter mantle --url http://127.0.0.1:5855/ --out /tmp/br --frames 4
H.clean()
run.mods.spawnMul = 0
run.enemies = []
H.until(() => run.lavaTide && run.lavaTide.phase === 'flood', 9000)
const lava = (x, y) => window.__mantleGround(run, x, y) === 2
// open lava with a long run east: sample round the player for a point whose next 500px east are all lava
const p = run.player
let at = null
for (let d = 0; d < 4000 && !at; d += 60) for (let k = 0; k < 24 && !at; k++) {
  const x = p.x + Math.cos(k * 0.26) * d, y = p.y + Math.sin(k * 0.26) * d
  let ok = true
  for (let s = -40; s <= 520 && ok; s += 20) for (const dy of [-60, 0, 60]) if (!lava(x + s, y + dy)) { ok = false; break }
  if (ok) at = { x, y }
}
if (!at) { H.note('no open lava', true); return }
p.x = at.x; p.y = at.y
const boat = { x: p.x, y: p.y, hx: p.x, hy: p.y, c: 0, heading: 0, cell: 'scene', floatT: 7, afloat: true, ridden: false, moved: true, vx: 0, vy: 0, seed: 7 }
run.boats.push(boat)
// back and forth across the open lava (it turns every 2.5s, so it never reaches the shore)
let fr = 0
const stick = () => ({ x: Math.floor(fr++ / 150) % 2 ? -0.55 : 0.55, y: 0 })
const go = (n) => { for (let i = 0; i < n; i++) { run.enemies = []; step(run, stick(), 1 / 60); run.events.length = 0; run.player.hp = run.player.maxHP } }
go(30)
// float left at each frame: 6.3s (fresh), 3s (past half), 1.2s (steam), 0.25s (going under), and a
// fifth (--frames 5) 0.3s after it sank: the sink burst, drawn off the boatSink event
const AT = [6.3, 3.0, 1.2, 0.25, -1]
let k = 0
const frame = () => {
  run.enemies = []
  step(run, stick(), 1 / 60)
  const events = run.events.splice(0)
  run.player.hp = run.player.maxHP
  window.__renderer.sync(run, 1 / 60, events)
  app.renderer.render(app.stage)
}
return () => {
  const want = AT[k++ % AT.length]
  let g = 0
  if (want < 0) {
    while (run.boats.includes(boat) && g++ < 800) frame()
    for (let i = 0; i < 18; i++) frame()
    H.note(`sank: boat gone ${!run.boats.includes(boat)}, afloat ${p.afloat}`)
    return
  }
  while (boat.floatT > want + 1 / 60 && g++ < 800) go(1)
  H.note(`afloat ${p.afloat}, ridden ${boat.ridden}, floatT ${boat.floatT.toFixed(2)}`)
  frame()
}
