// Scene: THE LANTERN with Draught, played — The Mine, Lantern level 3 + Draught, the player walking
// steadily one way with the crowd behind; a firedamp pocket is set ahead of you every 1.2 s so the
// draw-in, the blue lamp and the puff-out behind you all fall inside the shot. A LOOK comparison only.
//   node scripts/fx-probe.mjs --scene scripts/scenes/lantern-draught.js --out /tmp/ld/t --frames 60 --chapter mine --url 'http://127.0.0.1:5173/'
run.player.xpNext = 1e9
run.weapons = [{ id: 'lantern', level: 3 }]
run.weaponMods.lantern = { ...(run.weaponMods.lantern || {}), draught: 1 }
H.until(() => run.time > 45 && run.enemies.length > 18, 8000)
const p = run.player
for (const e of run.enemies) { e.hp *= 6; e.maxHP *= 6 }   // tougher, so the chasers live into the trail
let n = 0
return () => {
  for (let i = 0; i < 2; i++, n++) {
    run.player.hp = run.player.maxHP
    if (n % 54 === 0) run.gas.push({ x: p.x + 150, y: p.y + (n % 108 ? 25 : -25), r: 50, age: 5, seed: n })
    window.__stepSim(run, { x: 0.35, y: 0 }, 1 / 60)
  }
  window.__renderer.sync(run, 2 / 60, run.events.splice(0))
  window.__app.renderer.render(window.__app.stage)
}
