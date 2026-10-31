// Scene: the Crystal Crab's five looks in one row — plain, glass whole, then glass cracked 1/2/3
// (render picks the stage off e.shellHp / e.shellMax).
//   node scripts/fx-probe.mjs --scene scripts/scenes/crab-glass.js --out /tmp/cg --chapter geode --frames 1
// The crab is a `tank` (none before t=140s), so the crowd is re-badged by rosterId, as shorecrab-guard.js does.
H.breed(8)
const crowd = H.keep(5)
const LEFT = [1, 1, 0.8, 0.45, 0.1]   // shellHp / shellMax per slot; slot 0 is plain
crowd.forEach((e) => { e.rosterId = 'crystalCrab'; e.archetype = 'tank'; e.radius = 26 })
H.place((i, p) => ({ x: p.x - 150 + (i % 3) * 150, y: p.y - 110 + Math.floor(i / 3) * 190 }))
const set = () => crowd.forEach((e, i) => {
  e.glassShell = i > 0; e._ate = true
  e.shellMax = 1000; e.shellHp = 1000 * LEFT[i]
  e.hitFlash = 0; e.hp = e.maxHP
  run.player.invuln = 0
})
return () => {
  H.pin(); set(); H.tickFx(); set()
  H.note('plain | glass | crack1 / crack2 | crack3')
}
