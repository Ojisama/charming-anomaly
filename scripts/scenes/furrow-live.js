// Topsoil's Furrow, PLAYED: the player walks a loop with the Furrow at L5 and the chapter's own crowd
// chasing, so the pits open on the line behind it. Add ?sd=1 to the url for Sundown (render-side
// dusk only: it sets run.anomalies.sundown and lets the renderer ease into it).
//   node scripts/fx-probe.mjs --scene scripts/scenes/furrow-live.js --chapter topsoil --url http://127.0.0.1:5931/ --out /tmp/fu --frames 6
const dusk = new URLSearchParams(location.search).get('sd') === '1'
run.weapons = [{ id: 'furrow', level: 5 }]
if (dusk) run.anomalies = { ...(run.anomalies ?? {}), sundown: true }
const walk = () => ({ x: Math.cos(run.time * 0.8), y: Math.sin(run.time * 0.8) })
const go = (render) => {
  window.__stepSim(run, walk(), 1 / 60)
  if (run.phase === 'levelup') { run.phase = 'playing'; run.levelUpChoices = [] }
  run.player.hp = run.player.maxHP
  const ev = run.events.splice(0)
  if (render) { window.__renderer.sync(run, 1 / 60, ev); app.renderer.render(app.stage) }
}
for (let i = 0; i < 20 * 60; i++) go(false)
for (let i = 0; i < 6 * 60; i++) go(true)   // the dusk and the pit fades ease inside sync
H.note('furrow L5' + (dusk ? ' + sundown' : '') + ', pits ' + run.pits.length + ', t ' + run.time.toFixed(0))
return () => { for (let i = 0; i < 12; i++) go(true) }
