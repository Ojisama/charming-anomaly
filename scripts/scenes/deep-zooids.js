// Scene: The Deep's siphonophore coming apart. Question: does a killed colony read as a SWARM of
// little pink zooids swimming at you, or as the two fat halves it used to leave?
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/deep-zooids.js --chapter deep --out /tmp/zo --frames 8
//
// A REAL SPAWNED COLONY, not a dressed-up bred body. WAVE_TABLE gates `tank` to t=140s, so the
// scene winds run.time forward and lets stepSpawning produce one: every number the picture depends
// on — the parent's speed, its radius, the `split` override sim.js reads — then comes from the
// shipped path instead of being retyped here. The first cut of this scene forced the fields onto
// whatever H.breed had made, and reported a zooid speed of 324px/s off a parent that was really a
// drone; the honest figure is a quarter of that.
//   THE WEAPON IS TAKEN AWAY the moment the colony dies, or the Glint eats the swarm during the
// frames this exists to photograph.
run.time = 210
H.weapon('glint', 5)

const colonyOf = () => run.enemies.find((e) => e.rosterId === 'siphonophore' && !e._splitChild)
H.until(() => colonyOf() != null)
const colony = colonyOf()
if (colony) {
  colony.x = run.player.x + 210
  colony.y = run.player.y
  colony.hp = colony.maxHP = 260   // mortal and soft, so the Glint gets there inside the budget
}
run.shafts.length = 0
run.charge = run.sightCharge = run.chargeMax   // a full bar: this is a shape question, not a dark one

const split = H.until(() => run.enemies.some((e) => e._splitChild))
run.weapons = []
// EVERYTHING ELSE OFF THE FRAME. Winding to t=210 buys a real tank and, with it, a real 210-second
// crowd: the first shot of this came back with the swarm buried under nine other bodies, two elite
// crowns and a pickup. The question here is the SWARM's shape, so the swarm is all that is left.
const kids = run.enemies.filter((e) => e._splitChild)
run.enemies = kids
run.gems = []; run.coins = []; run.bullets = []
H.note(`${run.chapter} split=${split} zooids=${kids.length} r=${kids[0] ? Math.round(kids[0].radius) : -1}px ` +
  `speed=${kids[0] ? Math.round(kids[0].speed) : -1} vs colony r=${colony ? Math.round(colony.radius) : -1} ` +
  `speed=${colony ? Math.round(colony.speed) : -1}`)

return () => {
  run.charge = run.sightCharge = run.chargeMax
  for (let k = 0; k < 5; k++) H.tickFx(1 / 60)
  H.render()
}
