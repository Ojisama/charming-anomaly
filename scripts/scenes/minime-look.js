// Scene: MINIMES, played — the real stepSim with the Minimes anomaly on, the player standing still, until a
// copy has walked a little way out. Judge: does each copy look exactly like the player, in this chapter's look?
//   node scripts/fx-probe.mjs --scene scripts/scenes/minime-look.js --out /tmp/mm/mine --frames 1 --chapter mine --url 'http://127.0.0.1:5173/'
run.player.xpNext = 1e9
run.anomalies = { ...(run.anomalies || {}), minimes: true }
run._minimeT = 0.1
H.until(() => {
  run.player.hp = run.player.maxHP
  return (run.lures || []).some((l) => l.minime && l.t > 0.7)
}, 4000)
return () => {
  run.player.hp = run.player.maxHP
  window.__stepSim(run, { x: 0, y: 0 }, 1 / 60)
  window.__renderer.sync(run, 1 / 60, run.events.splice(0))
  window.__app.renderer.render(window.__app.stage)
}
