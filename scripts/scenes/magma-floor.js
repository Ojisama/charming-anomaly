// Scene: THE MAGMA'S FLOOR as it is drawn: a lava river and a cooled (obsidian) flow on screen at
// once, empty of crowd. Judges how the floor's kinds READ; it is not evidence about a busy screen.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/magma-floor.js --chapter magma \
//     --url 'http://127.0.0.1:PORT/?mode=floor' --out /tmp/mf --frames 1
//   mode=floor   the floor alone (default)
//   mode=splash  a level-5 Bellows blowing at the river (no foe: it blows the way you face), the
//                sim stepped 6 frames between captures: the slag drops it splashes out of the river
//   mode=frozen  8 bred bodies pinned in a ring round you, every other one held FROZEN (the contract
//                field render reads) beside unfrozen ones: the frozen tell
const mode = new URLSearchParams(location.search).get('mode') || 'floor'
const result = { chapter: run.chapter, mode }
window.__fxResult = result
let frame = 0
return async () => {
  if (mode === 'frozen') {
    if (frame++ === 0) {
      run.weapons = []
      if (!H.breed(8)) throw new Error('never bred 8 bodies')
      H.keep(8)
      H.place((i, pl) => ({ x: pl.x + Math.cos(i * Math.PI / 4) * 150, y: pl.y + Math.sin(i * Math.PI / 4) * 150 }))
    }
    for (let i = 0; i < 30; i++) { run.enemies.forEach((e, k) => { if (k % 2 === 0) e.frozen = 3 }); run.cracks.length = 0; H.tick(); H.pin() }
    run.enemies.forEach((e, k) => { if (k % 2 === 0) e.frozen = 3 })
    result.cast = run.enemies.map((e) => e.rosterId + (e.frozen > 0 ? ':frozen' : '')).join(' ')
    H.render()
    return
  }
  const sim = await import('/src/sim.js')
  const p = run.player
  run.enemies.length = 0
  run.cracks.length = 0
  const g = (x, y) => sim.magmaGroundAt(run, x, y)
  if (frame++ === 0) {
    run.weapons = []
    // a river within 200px and a cooled flow within 220px the other way
    let best = null
    for (let d = 600; d < 40000 && !best; d += 80) for (let i = 0; i < 64 && !best; i++) {
      const x = p.x + Math.cos(i * Math.PI / 32) * d, y = p.y + Math.sin(i * Math.PI / 32) * d
      if (g(x, y) !== null) continue
      let river = null, cooled = false
      for (let k = 0; k < 16; k++) {
        const a = k * Math.PI / 8
        if (river === null && g(x + Math.cos(a) * 140, y + Math.sin(a) * 140) === 'river') river = a
        if (g(x + Math.cos(a) * 220, y + Math.sin(a) * 220) === 'cooled') cooled = true
      }
      if (river !== null && (cooled || mode === 'splash')) best = { x, y, river }
    }
    if (!best) throw new Error('no river spot found')
    p.x = best.x; p.y = best.y
    result.spot = best
    for (let i = 0; i < 240; i++) { window.__renderer.sync(run, 1 / 30, []); app.renderer.render(app.stage) }
    if (mode === 'splash') run.weapons = [{ id: 'bellows', level: 5 }]
  }
  if (mode === 'splash') {
    for (let i = 0; i < 12; i++) {
      p.x = result.spot.x; p.y = result.spot.y; p.facingAngle = result.spot.river; p.hp = p.maxHP
      if (run.phase === 'levelup') { run.phase = 'playing'; run.levelUpChoices = [] }
      run.cracks.length = 0
      window.__stepSim(run, { x: 0, y: 0 }, 1 / 60)
      for (const e of run.events) if (e.type === 'slagSplash' || (e.type === 'shoot' && e.weapon === 'bellows')) result[e.type] = (result[e.type] ?? 0) + 1
      result.lobs = Math.max(result.lobs ?? 0, run.magmaLobs.length)
      window.__renderer.sync(run, 1 / 60, run.events.splice(0))
    }
    app.renderer.render(app.stage)
  }
}
