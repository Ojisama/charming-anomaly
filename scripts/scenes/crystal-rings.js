// Scene: RENDER COST OF A CRYSTAL-RING PILE (Geode). Measures, does not judge a look.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/crystal-rings.js --chapter geode --frames 4 \
//     --url 'http://127.0.0.1:5203/?ns=0,40,150,300' --out /tmp/cr --json /tmp/cr.json
//
// Frame i lays ns[i] echo rings and ns[i]/3 chime rings (the mix a maxed crystal build + Machine Gun
// peaks at: ~150 echo + ~45 chime) mid-life at r ~200 around the player, clears the crowd, and
// times 60 frames of sync + render. ⚠ draw ms is SwiftShader: read the growth across rows.
// &cf=0 lays echo rings only, the worst case (an echo ring carries the most strokes). Read the
// all-echo row before trusting a cap: the cost falls off a cliff past a total vertex count.
const Ns = (new URLSearchParams(location.search).get('ns') || '0,40,150,300').split(',').map(Number)
const CF = Number(new URLSearchParams(location.search).get('cf') ?? 1 / 3)   // chimes per echo; cf=0 is the worst case (echo rings carry the most strokes)
const result = { chapter: run.chapter, rows: [] }
window.__fxResult = result
let i = 0
return async () => {
  const N = Ns[Math.min(i++, Ns.length - 1)]
  const px = run.player.x, py = run.player.y
  run.enemies.length = 0
  run.novas = []
  const mk = (look, life) => ({ x: px + (Math.random() * 2 - 1) * 300, y: py + (Math.random() * 2 - 1) * 500,
    r: 120 + Math.random() * 80, maxR: 200, dmg: 0, knockback: 0, fear: 0, hit: new Set(), arc: null, angle: 0,
    carry: 0, look, heat: null, habitatSplit: false, life: 1e9, lifeMax: 2e9 })
  for (let k = 0; k < N; k++) run.novas.push(mk('echo'))
  for (let k = 0; k < Math.round(N * CF); k++) run.novas.push(mk('chime'))
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
  result.rows.push({ N, novas: run.novas.length, syncMs: mean(t.sync), drawMs: mean(t.draw) })
}
