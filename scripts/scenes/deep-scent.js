// Scene: The Deep's Scent mark (the warm blush), staged — FOR COMPARING MARK LOOKS ONLY,
// not evidence about the screen in play.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/deep-scent.js --chapter deep --out /tmp/sc --url http://127.0.0.1:PORT/
//
// Eight bodies in a ring around the player at a bright bar; the right-hand half is marked.
run.weapons = []
H.breed(8)
const crowd = H.keep(8)
H.place((i, p) => {
  const a = (i / 8) * Math.PI * 2
  return { x: p.x + Math.cos(a) * 150, y: p.y + Math.sin(a) * 150 }
})
H.light(0.8)
for (let i = 0; i < 30; i++) { H.tick(); H.pin(); H.render() }
H.note(`${run.chapter} enemies=${run.enemies.length}`)
return () => {
  crowd.forEach((e, i) => { e.hitFlash = 0; e.scentT = Math.cos((i / 8) * Math.PI * 2) > 0.1 ? 8 : 0 })
  run.player.invuln = 0
  H.light(0.8)
  H.pin()
  H.tickFx(1 / 60)
}
