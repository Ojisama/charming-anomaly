// Scene: The Deep as PLAYED — a REAL streamed maw at a known range, nothing placed by hand.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/deep-hunt.js --chapter deep --out /tmp/hunt
//
// deep-maw.js answers "does the gape tell read" off a hand-built row. This answers the question
// that one cannot: CAN YOU SEE ONE FROM ACROSS THE WATER. The maw here is wherever streamShafts put
// it off the terrain seed, at the density CHAPTERS.deep.signature.maws actually ships.
//
// `?huntCharge=N` sets the bar and `?huntAt=N` how far away the player stands. Together they are
// the whole experiment, because the two quantities fight: the bar sets the lamp (at 25 of 100 it is
// ~143px on a phone) while the lure's punch through the dark scrim does not depend on the bar at
// all. If the lure works, the maw is findable at ranges the lamp cannot reach — which is the only
// thing standing between "a dark chapter" and a death spiral.
// SHOOT THE DESKTOP TOO (`--w 1280 --h 800`): the light is a multiple of the screen's LONGEST SIDE,
// so how far a player can search from one spot is a different number per device by construction.
const q = new URLSearchParams(location.search)
const CHARGE = Number(q.get('huntCharge') || 25)
const AT = Number(q.get('huntAt') || 520)

run.weapons = [{ id: 'finHit', level: 5 }]
H.breed(10)
const crowd = H.keep(10)

// STAND AT A KNOWN RANGE FROM A REAL MAW. The player is moved rather than the maw, because moving
// the maw would mean hand-placing it and the point of this scene is that it was streamed. Stepping
// afterwards matters: streamShafts early-returns unless the player crossed a cell boundary, so the
// field is only rescanned once the move is fed through the sim.
const nearest = () => {
  let best = null, bd = Infinity
  for (const sh of run.shafts) {
    const d = Math.hypot(sh.x - run.player.x, sh.y - run.player.y)
    if (d < bd) { bd = d; best = sh }
  }
  return best
}
let target = nearest()
if (target) {
  // Straight below it, so the frame reads as a distance up the screen.
  run.player.x = target.x
  run.player.y = target.y + AT
  // H.tick and NOT the sandbox's third argument: that one is stepSim itself, so calling it with a
  // frame count throws "Cannot create property 'time' on number".
  for (let i = 0; i < 4; i++) H.tick()
  target = nearest() || target
}

// The bred hagfish lay a slime patch every few seconds, so a warmed-up field is CARPETED in them —
// honest, and it buries the one thing this frame exists to judge. Two is enough to see slime beside
// a lure without the lure being under it.
if (run.webs) run.webs.length = Math.min(run.webs.length, 2)

run.charge = CHARGE

const d = target ? Math.round(Math.hypot(target.x - run.player.x, target.y - run.player.y)) : -1
H.note(`${run.chapter} charge=${Math.round(run.charge)} maws=${run.shafts.length} ` +
  `nearest=${d}px lampR=${Math.round(844 * (0.06 + 0.44 * run.charge / 100))}px ` +
  `enemies=${run.enemies.length} viewR=${Math.round(run.viewRadius)}`)

return () => {
  if (run.webs) run.webs.length = Math.min(run.webs.length, 2)
  for (const e of crowd) e.hitFlash = 0
  run.player.invuln = 0
  run.charge = CHARGE
  H.pin()
  H.tickFx(1 / 60)
}
