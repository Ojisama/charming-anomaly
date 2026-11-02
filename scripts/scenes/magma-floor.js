// Scene: THE MAGMA'S FLOOR as it is drawn: a lava river and a cooled (obsidian) flow on screen at
// once, empty of crowd. Judges how the floor's kinds READ; it is not evidence about a busy screen.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/magma-floor.js --chapter magma \
//     --url 'http://127.0.0.1:PORT/' --out /tmp/mf --frames 1
const result = { chapter: run.chapter }
window.__fxResult = result
return async () => {
  const sim = await import('/src/sim.js')
  const p = run.player
  run.enemies.length = 0
  run.weapons = []
  run.cracks.length = 0
  const g = (x, y) => sim.magmaGroundAt(run, x, y)
  // a river within 250px and a cooled flow within 250px the other way
  let best = null
  for (let d = 600; d < 40000 && !best; d += 80) for (let i = 0; i < 64 && !best; i++) {
    const x = p.x + Math.cos(i * Math.PI / 32) * d, y = p.y + Math.sin(i * Math.PI / 32) * d
    if (g(x, y) !== null) continue
    let river = false, cooled = false
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8
      if (g(x + Math.cos(a) * 200, y + Math.sin(a) * 200) === 'river') river = true
      if (g(x + Math.cos(a) * 220, y + Math.sin(a) * 220) === 'cooled') cooled = true
    }
    if (river && cooled) best = { x, y }
  }
  if (!best) throw new Error('no river + cooled spot found')
  p.x = best.x; p.y = best.y
  result.spot = best
  for (let i = 0; i < 240; i++) { run.cracks.length = 0; window.__renderer.sync(run, 1 / 30, []); app.renderer.render(app.stage) }
}
