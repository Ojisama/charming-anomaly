// Scene: THE PICKAXE THROW, played — the real stepSim in the Ophan's opening crowd, before the boss is out, so the
// picks fly at bodies some way off. One frame = 4 steps (1/15 s).
//   node scripts/fx-probe.mjs --scene scripts/scenes/pick-throw.js --out /tmp/pk/t --frames 30 --chapter ophan --url 'http://127.0.0.1:5173/?world=0'
run.player.xpNext = 1e9
H.until(() => run.time > 4 && run.enemies.length > 4, 3000)
let n = 0
return () => {
  for (let i = 0; i < 4; i++, n++) { run.player.hp = run.player.maxHP; window.__stepSim(run, { x: 0, y: 0 }, 1 / 60) }
  window.__renderer.sync(run, 4 / 60, run.events.splice(0))
  window.__app.renderer.render(window.__app.stage)
}
