// Scene: the Deep's four creatures MOVING — the skill's "GIF of the winner moving", as a frame
// sequence (no ffmpeg on this machine; read the frames in order). The cast is NOT pinned: each body
// seeks the player from its own start, so the sequence shows the turn, the fangtooth's dash and
// the lanternfish glow travelling through the dark.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/deep-cast-move.js --chapter deep --out /tmp/dm --frames 10
const IDS = [['lanternfish', 16], ['barreleye', 16], ['fangtooth', 12], ['siphonophore', 26]]

H.breed(8)
const cast = H.keep(8)
H.place((i, p) => ({ x: p.x + Math.cos(i * 1.05) * 230, y: p.y + Math.sin(i * 1.05) * 230 }))
cast.forEach((e, i) => { e.rosterId = IDS[i % 4][0]; e.radius = IDS[i % 4][1]; e.elite = false; e.speed = 60 + (i % 4) * 25 })
for (const k of ['webs', 'pools', 'strips']) if (Array.isArray(run[k])) run[k].length = 0
run.shafts.length = 0
run.weapons = []            // nothing strikes the cast, so nothing flashes white
run.charge = run.chargeMax * 0.35
run.spawnMul = 0

H.note([run.chapter, 'winners moving, unpinned, bar at 35%'].join('\n'))

return () => {
  for (let k = 0; k < 5; k++) {
    run.charge = run.chargeMax * 0.35
    H.tickFx(1 / 60)
  }
  for (const e of cast) { e.hitFlash = 0; e.hp = e.maxHP; e._dead = false }
  H.render()
}
