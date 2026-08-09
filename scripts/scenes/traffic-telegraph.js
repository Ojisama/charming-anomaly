// Scene: one city traffic lane, from the first frame of its telegraph to the van leaving. The
// whole point of this hazard is TIMING — light arrives, brightens, then the van — so it can only be
// judged as a sequence; a still of the warn phase says nothing about whether the approach reads.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/traffic-telegraph.js --out /tmp/tg --frames 16
//   ffmpeg -y -framerate 6 -i /tmp/tg-%02d.png -loop 0 /tmp/tg.gif
//
// The lane is hand-built rather than waited for: rollTrafficLane needs TRAFFIC_INTERVAL seconds and
// puts the band at a random offset, so waiting gives a different frame every run. This pins it to a
// lane running straight across the player, which is the case worth looking at.
run.mods.spawnMul = 0
run.enemies.length = 0
run.weapons = []
run.player.hp = run.player.maxHP = 99999

for (let i = 0; i < 40; i++) H.tick()   // stream the street in

const WARN = 1.3, SWEEP = 1.1
const lane = {
  x: run.player.x, y: run.player.y, angle: Math.PI * 0.25,
  len: 1100, w: 130, phase: 'warn', t: WARN, warnT: WARN, carT: 0,
  dmg: 34, sweep: SWEEP, deckLen: 150, deckW: 110, kb: 420,
  squash: [], enemyFrac: 0.5, look: 'car', cover: true, hitIds: new Set(),
}
run.lanes.length = 0
run.lanes.push(lane)

// Drive the lane's own clock by hand — stepping the sim would also roll NEW lanes and move the van
// off the frame the scene is trying to hold still.
const TOTAL = WARN + SWEEP
return (age) => {
  const t = age * TOTAL
  if (t < WARN) { lane.phase = 'warn'; lane.t = WARN - t; lane.carT = 0 }
  else {
    lane.phase = 'sweep'
    lane.t = Math.max(0.001, SWEEP - (t - WARN))
    lane.carT = Math.min(1, (t - WARN) / SWEEP)
  }
  H.tick(1 / 60)   // keeps animT moving so the flicker and pulse are live
  run.lanes.length = 0
  run.lanes.push(lane)
  H.render()
}
