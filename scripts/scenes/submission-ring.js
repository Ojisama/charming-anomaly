// Scene: SUBMISSION's ally ring, and the stray line reported from play (v7.12).
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/submission-ring.js --out /tmp/sr --frames 3
//
// The defect is a MISSING beginPath() before the ring's draining inner arc. Pixi v8's arc()
// continues the current path, so it draws a connecting line from wherever the SHARED shieldG last
// left off to the arc's start point. The bug therefore only appears when something ELSE has drawn
// on shieldG this frame — a shielded enemy — and the line's length is the distance between the
// two, which is why it read from play as "a long line to some off-screen point".
//
// So the scene needs BOTH, deliberately: a turned ally AND a shielded enemy parked far from it.
// An ally on its own does not reproduce it, which is the trap that makes this easy to "fix" and
// then not be able to tell whether it is fixed.

H.breed(6)
H.keep(6)   // freeze the cast list; NOT H.pin(), which clears _dead and would undo the kill below

const p = run.player
run.anomalies = run.anomalies || {}
run.anomalies.submission = true

const es = run.enemies
const ally = es[0]
const shielded = es[1]

// The ally: an elite, killed, so turnDeadElites converts it through the real sim path.
ally.elite = true
ally.affixes = []
ally.flags = []
ally.x = p.x - 130
ally.y = p.y + 70
ally._dead = true

// The other end of the stray line: a shielded enemy, parked far away and off toward a corner.
shielded.shieldHP = shielded.maxHP * 0.6
shielded.x = p.x + 560
shielded.y = p.y - 300

H.tick()   // stepSim -> turnDeadElites

const hold = () => {
  ally.x = p.x - 130; ally.y = p.y + 70
  ally.allyT = 14; ally.hitFlash = 0; ally._dead = false; ally.hp = ally.maxHP
  ally.kb.x = ally.kb.y = 0
  shielded.x = p.x + 560; shielded.y = p.y - 300
  shielded.shieldHP = shielded.maxHP * 0.6; shielded.hitFlash = 0
  shielded._dead = false; shielded.hp = shielded.maxHP
  shielded.kb.x = shielded.kb.y = 0
  for (let i = 2; i < es.length; i++) { es[i].x = p.x + 3000; es[i].y = p.y + 3000 }
}
hold()

H.note(JSON.stringify({
  allyT: ally.allyT,
  turned: !!ally._turned,
  shieldHP: Math.round(shielded.shieldHP || 0),
  ally: [Math.round(ally.x - p.x), Math.round(ally.y - p.y)],
  shielded: [Math.round(shielded.x - p.x), Math.round(shielded.y - p.y)],
}))

return () => { hold(); H.render() }
