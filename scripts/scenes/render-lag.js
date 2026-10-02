// Scene: RENDER LAG over an endless run. Measures, does not judge a look.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/render-lag.js --chapter city --frames 4 \
//     --url 'http://127.0.0.1:5203/?mins=5,10,20,30' --out /tmp/rl --json /tmp/rl.json \
//     --meta '{"chapters":{"body":{"unlocked":true,"won":3,"difficulty":1,"best":{"time":0,"kills":0}},"city":{"unlocked":true,"won":3,"difficulty":1,"endlessPicked":true,"best":{"time":0,"kills":0}}}}'
//
// The --meta is load-bearing: endlessPicked + won>=3 is what makes main.js start an ENDLESS run
// (the scene aborts if it did not). Frame i fast-forwards the real dev autopilot
// (sim.fastForwardEndless — same module instance main.js uses) to mins[i], then plays 60 frames of
// sim + sync + render with real events, timing each part, and counts the visible display objects
// under app.stage. The screenshot taken after each frame call shows that crowd.
// ⚠ chrome-headless-shell renders WebGL in software (SwiftShader): `render` ms are CPU-for-GPU and
// not a phone number. Read the GROWTH between minutes and the sync column (pure JS), not absolutes.
const mins = (new URLSearchParams(location.search).get('mins') || '5,10,20,30').split(',').map(Number)
if (!run.endless) throw new Error('run is not endless — pass the --meta in this file\'s header')
const result = { chapter: run.chapter, rows: [] }
window.__fxResult = result

const countVisible = (o) => {
  if (!o.visible || o.alpha === 0) return 0
  let n = o.children?.length ? 0 : 1
  for (const c of o.children ?? []) n += countVisible(c)
  return n
}
let i = 0
return async () => {
  const sim = await import('/src/sim.js')
  const target = mins[Math.min(i++, mins.length - 1)] * 60
  sim.fastForwardEndless(run, target)
  run.events.length = 0
  window.__renderer.sync(run, 0, [])
  const t = { step: [], sync: [], draw: [] }
  for (let f = 0; f < 60; f++) {
    const a = performance.now()
    step(run, { x: Math.cos(f / 20), y: Math.sin(f / 20) }, 1 / 30)
    const events = run.events.splice(0)
    if (run.phase === 'levelup') { sim.applyChoice(run, sim.autopilotPick(run, run.levelUpChoices)); run.phase = 'playing' }
    run.player.hp = run.player.maxHP
    const b = performance.now()
    window.__renderer.sync(run, 1 / 30, events)
    const c = performance.now()
    app.renderer.render(app.stage)
    const d = performance.now()
    t.step.push(b - a); t.sync.push(c - b); t.draw.push(d - c)
  }
  const stat = (xs) => { const s = [...xs].sort((x, y) => x - y); return { mean: +(s.reduce((p, x) => p + x, 0) / s.length).toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2) } }
  result.rows.push({
    min: Math.round(run.time / 60), level: run.player.level, enemies: run.enemies.length,
    visible: countVisible(app.stage),
    build: run.weapons.map((w) => w.id + ':' + w.level).join(' '),
    step: stat(t.step), sync: stat(t.sync), draw: stat(t.draw),
  })
}
