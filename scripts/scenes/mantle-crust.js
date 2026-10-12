// Scene: THE MANTLE'S QUENCH CRUSTS on the lava at a shore, with the digger. Staged (crusts laid by
// hand at chosen ages), so it compares LOOKS and costs; it is not evidence about a busy screen.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/mantle-crust.js --chapter mantle \
//     --url 'http://127.0.0.1:PORT/?mode=shore' --out /tmp/mc
//   mode=shore  4 crusts of different ages on the lava just off the shore the digger stands on
//   mode=life   3 frames of ONE crust: fresh, mid-life, being eaten back at its end
//   mode=cost   times the FLOOR alone (every other layer hidden) drawn 120 times, with no crust and
//               with FX_N crusts on screen; leaves { none, crusts } ms/frame on window.__fxResult
//               (pass --json). GPU ms: compare rows of one machine, never across machines.
const mode = new URLSearchParams(location.search).get('mode') || 'shore'
const result = { mode, chapter: run.chapter }
window.__fxResult = result
let frame = 0
return async () => {
  const sim = await import('/src/sim.js')
  const shape = await import('/src/mantle-shape.js')
  const p = run.player
  run.enemies.length = 0
  run.weapons = []
  run.lavaPools = []
  if (run.lavaTide) run.lavaTide.swell = 0
  const lava = (x, y) => sim.mantleGroundAt(run, x, y) === 2
  // the digger on rock, the lava's shore a little to one side: scan rings for rock with lava 160px east
  if (frame === 0) {
    let best = null
    for (let d = 0; d < 3000 && !best; d += 40) for (let i = 0; i < 48 && !best; i++) {
      const x = p.x + Math.cos(i * Math.PI / 24) * d, y = p.y + Math.sin(i * Math.PI / 24) * d
      if (!lava(x, y) && lava(x + 150, y) && lava(x + 330, y) && lava(x + 230, y - 220) && lava(x + 230, y + 220)) best = { x, y }
    }
    if (!best) throw new Error('no shore found near the player')
    p.x = best.x; p.y = best.y
    result.shore = best
    run.quenchCrusts = []
    for (let i = 0; i < 240; i++) window.__renderer.sync(run, 1 / 30, [])   // the camera settles on the digger
  }
  const mk = (x, y, r, t, dur) => {
    const seq = (run.groundSeq = (run.groundSeq ?? 0) + 1)
    return { x, y, r, t, dur, line: run.lavaTide ? run.lavaTide.line : -Infinity, under: [], seq, ...shape.crustShapeOf(x, y, seq), gnaw: 0 }
  }
  const step = () => { window.__renderer.sync(run, 1 / 60, []); app.renderer.render(app.stage) }
  if (mode === 'shore') {
    run.quenchCrusts = [mk(p.x + 130, p.y - 300, 100, 2.6, 5), mk(p.x + 150, p.y - 10, 105, 1.2, 5), mk(p.x + 140, p.y + 300, 112, 0.25, 5), mk(p.x - 40, p.y - 390, 95, 3.3, 5.5)]
    for (let i = 0; i < 20; i++) step()
  } else if (mode === 'life') {
    const ages = [0.15, 2.4, 4.3]
    run.quenchCrusts = [mk(p.x + 120, p.y - 90, 92, ages[frame % 3], 5)]
    run.quenchCrusts[0].shape = 123456789; run.quenchCrusts[0].rot = 0.7   // the SAME splash in every frame
    for (let i = 0; i < 20; i++) step()
  } else {
    const floor = [...window.__toon.chunks.values()][0].mesh.parent
    // hide everything that is not on the floor's own path to the stage
    const hidden = []
    for (let n = floor; n && n.parent; n = n.parent) for (const s of n.parent.children) if (s !== n && s.visible) { s.visible = false; hidden.push(s) }
    const gl = app.renderer.gl
    const px = new Uint8Array(4)
    const time = (crusts) => {
      run.quenchCrusts = crusts
      window.__renderer.sync(run, 1 / 60, []); app.renderer.render(app.stage); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
      const N = 120, t0 = performance.now()
      for (let i = 0; i < N; i++) app.renderer.render(app.stage)
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
      return +((performance.now() - t0) / N).toFixed(3)
    }
    const eight = []
    for (let i = 0; i < 8; i++) eight.push(mk(p.x + (i % 2 ? 110 : -110), p.y - 330 + Math.floor(i / 2) * 220, 130, 1 + i * 0.4, 5.5))
    const rows = { none: [], crusts: [] }
    for (let k = 0; k < 5; k++) { rows.none.push(time([])); rows.crusts.push(time(eight)) }
    const med = (a) => [...a].sort((x, y) => x - y)[2]
    result.none = med(rows.none); result.crusts = med(rows.crusts); result.rows = rows
    result.nc = window.__toon.floorU.uniforms.uNC
    for (const s of hidden) s.visible = true
    run.quenchCrusts = eight
    step()
  }
  frame++
}
