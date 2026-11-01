// Scene: THE LANTERN, played — the real stepSim in The Mine with only the Lantern (level 3), the
// player ambling so the crowd closes in. One frame = 2 steps (1/30 s). One firedamp pocket is set
// beside the glow when capture starts, so its fuse and blast fall inside the shot.
//   node scripts/fx-probe.mjs --scene scripts/scenes/lantern-live.js --out /tmp/ln/t --frames 40 --chapter mine --url 'http://127.0.0.1:5173/'
run.player.xpNext = 1e9
run.weapons = [{ id: 'lantern', level: 3 }]
H.until(() => run.time > 45 && run.enemies.length > 18, 8000)
const p = run.player
for (const e of run.enemies) { e.hp *= 6; e.maxHP *= 6 }   // tougher, so bodies live inside the glow long enough to show the burn
run.gas.push({ x: p.x + 100, y: p.y - 30, r: 50, age: 5, seed: 7 })
let n = 0
return () => {
  for (let i = 0; i < 2; i++, n++) {
    run.player.hp = run.player.maxHP
    const a = n / 60 * 0.5
    window.__stepSim(run, { x: Math.cos(a) * 0.12, y: Math.sin(a) * 0.12 }, 1 / 60)
  }
  window.__renderer.sync(run, 2 / 60, run.events.splice(0))
  window.__app.renderer.render(window.__app.stage)
}
