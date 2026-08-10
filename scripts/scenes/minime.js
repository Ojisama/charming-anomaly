// Scene: MINIMES. Is a minime drawn as a small copy of the PLAYER, or as the Pheromone Lure's
// amber beacon it inherited by sharing run.lures? That is the whole question this scene answers,
// and it is a question only a picture can answer.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/minime.js --out /tmp/mm --frames 6
//
// The comparison that matters is a minime NEXT TO the player it is supposed to be a copy of, so
// the player sits in frame and the decoys are parked at a readable distance rather than left to
// flee off-screen.

H.breed(8)
H.keep(8)
H.place((i, p) => ({ x: p.x + 150 + (i % 4) * 60, y: p.y - 90 + Math.floor(i / 4) * 180 }))

run.anomalies = run.anomalies || {}
run.anomalies.minimes = true

// Let the sim spawn them through the real path (stepAnomalies -> run.lures), then park them where
// they can be seen. Their own outward velocity is what carries them off frame in play.
H.until(() => run.lures.length > 0, 600)
H.until(() => run.lures.length >= 2, 600)

const p = run.player
run.lures.forEach((lu, i) => {
  lu.x = p.x + (i === 0 ? -110 : 110)
  lu.y = p.y + (i === 0 ? -70 : 70)
  lu.vx = i === 0 ? -1 : 1   // sign only: the body flips on it, matching the player's own rig
  lu.vy = 0
  lu.t = 1.2                 // past the 0.25s fade-in, well short of the burst
})

// A planted Pheromone Lure for contrast — same array, and it must STILL be the amber beacon.
run.lures.push({
  x: p.x, y: p.y + 150, vx: 0, vy: 0,
  t: 1.2, dur: 6, aggro: 230, burstR: 126, burstDmg: 42, sticky: false,
})

H.note(JSON.stringify({
  lures: run.lures.length,
  minimes: run.lures.filter((l) => l.minime).length,
  planted: run.lures.filter((l) => !l.minime).length,
}))

// Hold them: stepLures ages every lure and bursts it at dur, and the minimes' own dur is 4s.
return H.scrub(run.lures)
