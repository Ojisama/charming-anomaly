// Scene: the anglerfish maw's TWO reveal bands — what the mouth gives away on approach, against
// what it shows once you are standing in it.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/deep-maw-reveal.js --chapter deep --out /tmp/mr --frames 8
//
// WHY THIS IS NOT deep-maw.js. That scene photographs a ROW of maws at fixed gapes to judge the
// countdown, and every circle in it sits 300-726px from the player against a 270px band — i.e. at
// reveal 0, with the needles not drawn at all. It cannot see this question by construction.
//
// ⚠ THE VARIABLE HERE IS DISTANCE, AND ONLY ONE MAW CAN BE IN THE BAND AT A TIME. The band runs
// from MAW_REVEAL.far x r in to the rim, so a row of maws far enough apart to tell apart is a row
// that is all outside it; a row close enough to be inside it overlaps into one blob. So the frame
// sequence IS the axis: the scrub walks the player from `mawD0` to `mawD1` (multiples of r from the
// mouth's centre), and the frames land across 1.35r (the band opens), 1.0r (the rim, where the
// player is now inside) and 0.72r (where the needles reach full). Gape is HELD, so the only thing
// changing between frames is how far away the player is.
const q = new URLSearchParams(location.search)
const CHARGE = Number(q.get('mawCharge') || 55)
const R = Number(q.get('mawR') || 200)
const GAPE = Number(q.get('mawGape') || 0.45)
const D0 = Number(q.get('mawD0') || 1.7)    // distance at age 0, in multiples of r
const D1 = Number(q.get('mawD1') || 0.45)   // ...and at age 1

run.weapons = [{ id: 'glint', level: 5 }]
H.breed(4)
const crowd = H.keep(4)

// The mouth is anchored where the player started and never moves; the PLAYER is what travels.
const MX = run.player.x, MY = run.player.y
const maw = { x: MX, y: MY, bx: MX, by: MY, r: R, gape: GAPE, _shutT: 0, phase: 0.6, _cell: 'probe0' }
run.charge = CHARGE

// Approach from below, so the mouth sits above the player the way you walk onto one.
const put = (d) => { run.player.x = MX; run.player.y = MY + d * R }
// The crowd well clear: this frame is about the needles, not about what is standing in them.
const layout = () => { H.place((i, p) => ({ x: p.x - 200 + i * 130, y: p.y + 430 })) }

put(D0)
layout()

H.note(`${run.chapter} charge=${Math.round(run.charge)} r=${R} gape=${GAPE} ` +
  `d=${D0}->${D1} x r  viewR=${Math.round(run.viewRadius)}`)

return (age) => {
  const d = D0 + (D1 - D0) * age
  put(d)
  // REBUILT EVERY FRAME, not pushed once. streamShafts drops a hand-made shaft as soon as the cell
  // cursor moves, and the player crosses ~250px over this sequence — a scene that pushed once would
  // lose the subject partway through and read as "the teeth stopped being drawn", which is exactly
  // the result this shot exists to judge. Holding gape here too, for the same reason deep-maw.js
  // does: stepMaws is live and would otherwise close the mouth while the camera walks in.
  run.shafts = [maw]
  maw.gape = GAPE
  maw._shutT = 0
  layout()
  for (const e of crowd) e.hitFlash = 0
  run.player.invuln = 0
  run.charge = CHARGE
  H.pin()
  H.tickFx(1 / 60)
  H.note(`d=${d.toFixed(2)}x r (${Math.round(d * R)}px)  gape=${GAPE}`)
}
