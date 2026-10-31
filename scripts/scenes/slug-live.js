// Scene: Topsoil PLAYED, for the slug's slime trail in a real crowd. Nothing hand-set: the player walks
// a slow circle with the starter weapon, the spawner runs, level-ups are declined. 60s of warm-up, then
// frames ~1/15 s apart. Immortal, so it says nothing about difficulty.
//   node scripts/fx-probe.mjs --scene scripts/scenes/slug-live.js --chapter topsoil --url http://127.0.0.1:PORT/ --out /tmp/sl --frames 40
const simStep = window.__stepSim
let ang = 0
const move = (dt) => {
  ang += dt * 0.35
  simStep(run, { x: Math.cos(ang), y: Math.sin(ang) }, dt)
  if (run.phase === 'levelup') run.phase = 'playing'
  run.player.hp = run.player.maxHP
}
run.player.maxHP = run.player.hp = 99999
for (let i = 0; i < 60 * 60; i++) { move(1 / 60); run.events.length = 0 }
H.note('topsoil played: slug slime')
return () => {
  let ev = []
  for (let k = 0; k < 4; k++) { move(1 / 60); ev = ev.concat(run.events.splice(0)) }
  H.note('slugs ' + run.enemies.filter((e) => e.rosterId === 'slug').length + ' slime ' + run.slime.length + ' enemies ' + run.enemies.length)
  window.__renderer.sync(run, 4 / 60, ev)
  window.__app.renderer.render(window.__app.stage)
}
