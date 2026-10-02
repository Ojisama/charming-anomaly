// Scene: RENDER COST OF A FLOOR PILE. Measures, does not judge a look.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/pickup-pile.js --chapter undergrowth --frames 4 \
//     --url 'http://127.0.0.1:5203/?ns=0,10000,40000,75000' --out /tmp/pp --json /tmp/pp.json
//
// Frame i lays ns[i] pickups (3 gems : 2 coins, the undergrowth mix at 30 min) in a +-6000px box
// around the player, clears the crowd, and times 60 frames of sync + render with the sim frozen,
// so only the pile changes between rows. Endless floors reach ~74k by minute 30, and lag-probe
// (sim only) cannot see what they cost to DRAW — before v7.415 this scene read 78ms/frame at 75k.
// ⚠ draw ms is SwiftShader: read the growth across rows, not the absolute.
const Ns = (new URLSearchParams(location.search).get('ns') || '0,10000,40000,75000').split(',').map(Number)
const result = { chapter: run.chapter, rows: [] }
window.__fxResult = result
let i = 0
return async () => {
  const N = Ns[Math.min(i++, Ns.length - 1)]
  const px = run.player.x, py = run.player.y
  run.enemies.length = 0
  run.gems = []; run.coins = []
  for (let k = 0; k < N; k++) {
    const x = px + (Math.random() * 2 - 1) * 6000, y = py + (Math.random() * 2 - 1) * 6000
    if (k % 5 < 3) run.gems.push({ x, y, xp: 1 }); else run.coins.push({ x, y, value: 1 })
  }
  window.__renderer.sync(run, 0, [])
  app.renderer.render(app.stage)
  const t = { sync: [], draw: [] }
  for (let f = 0; f < 60; f++) {
    const b = performance.now()
    window.__renderer.sync(run, 1 / 30, [])
    const c = performance.now()
    app.renderer.render(app.stage)
    app.renderer.gl?.finish?.()
    const d = performance.now()
    t.sync.push(c - b); t.draw.push(d - c)
  }
  const mean = (xs) => +(xs.reduce((p, x) => p + x, 0) / xs.length).toFixed(2)
  result.rows.push({ N, gems: run.gems.length, coins: run.coins.length, syncMs: mean(t.sync), drawMs: mean(t.draw) })
}
