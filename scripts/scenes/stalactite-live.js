// Scene: STALACTITE, played — the real stepSim in The Geode with only Stalactite (level 5), the
// player walking slowly so foes chase. One frame = 2 steps (1/30 s): dust, the fall, the shatter.
//   node scripts/fx-probe.mjs --scene scripts/scenes/stalactite-live.js --out /tmp/st/t --frames 40 --chapter geode --url 'http://127.0.0.1:5173/'
run.player.xpNext = 1e9
run.weapons = [{ id: 'stalactite', level: 5 }]
H.until(() => run.time > 60 && run.enemies.length > 25, 8000)
let n = 0
return () => {
  for (let i = 0; i < 2; i++, n++) {
    run.player.hp = run.player.maxHP
    const a = n / 60 * 0.7
    window.__stepSim(run, { x: Math.cos(a) * 0.5, y: Math.sin(a) * 0.5 }, 1 / 60)
  }
  window.__renderer.sync(run, 2 / 60, run.events.splice(0))
  window.__app.renderer.render(window.__app.stage)
}
