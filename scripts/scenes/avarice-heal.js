// Scene: AVARICE's conversion tell — the pink "+N" over a coin that healed instead of paying.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/avarice-heal.js --out /tmp/av --frames 3 \
//     --url http://127.0.0.1:5199/
//
// H.render() deliberately syncs with an EMPTY event list (it drains every step, so a final sync
// does not bury the frame in the whole warm-up's damage numbers). This effect IS an event, so the
// scene syncs by hand with the events it just produced — that is the only way to photograph it.
//
// The roll is 20% per pickup and only fires below max HP, so this pushes a pile of coins onto the
// player at 40 HP down: with ~60 coins the chance of seeing no conversion at all is negligible,
// and the scene is about the LOOK of one, not the rate.
run.anomalies = run.anomalies || {}
run.anomalies.avarice = true

const p = run.player
p.maxHP = 500
H.clean()

let i = 0
H.note('frames: the +N over converted coins, 3 consecutive collections')

return () => {
  p.hp = p.maxHP - 40                 // below full, or the card correctly refuses to convert
  run.enemies.length = 0
  run.gems.length = 0
  run.events.length = 0
  for (let k = 0; k < 60; k++) run.coins.push({ x: p.x, y: p.y, value: 1 })
  step(run, { x: 0, y: 0 }, 1 / 60)
  const healed = run.events.filter((e) => e.type === 'coin' && e.healed)
  H.note(`frame ${i++}: ${healed.length} of ${run.events.filter((e) => e.type === 'coin').length} coins converted, +${healed.map((e) => e.heal).join(' +')}`)
  window.__renderer.sync(run, 1 / 60, run.events.splice(0))
  app.renderer.render(app.stage)
}
