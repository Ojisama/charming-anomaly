// Scene: The Surf's SEA ROACH beside the two creatures it must not be confused with, plus the whole
// gull hazard in one frame — three telegraph shadows at fixed urgencies and the bird landing.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/surf-gulls.js --chapter surf \
//        --out /tmp/gull --frames 12 --url http://127.0.0.1:5261/
//
// Frame 0 is the still: creatures + the three shadows, no bird. Frames 1..11 replay the bird's own
// ~0.5s at 0.05s per frame (H.tickFx CLAMPS the sync dt to 0.05, exactly as main.js does, so one
// frame cannot advance the dive further than that however big a dt you hand it).
//
// WHY rosterId IS OVERRIDDEN rather than waiting for a spawn: WAVE_TABLE gates archetypes by TIME
// (tank not until t=140s), so breeding at t=0 in surf yields no shore crab at all. syncEnemies keys
// the texture off e.rosterId, and the DRAW SIZE off e.radius / look.baseR — so the radius has to be
// set with the id or the crab renders at 12/26 of its size and the whole point of the shot (relative
// silhouette) is the thing it gets wrong.
//
// EVERYTHING FORCED IS FORCED ON BOTH SIDES OF H.tickFx. A frame is captured from the state as it
// stands when the capture happens, not when this callback ends; setting the bombs only after the
// step photographs the PREVIOUS frame's bombs. Same lesson as shorecrab-guard.js.

const CAST = [
  // x, y (world offsets from the player), rosterId, radius
  [-128, -330, 'shorecrab', 26],
  [-14, -330, 'sandhopper', 16],
  [104, -330, 'searoach', 12],
  [-140, -238, 'searoach', 12],
  [-56, -246, 'searoach', 12],
  [34, -232, 'searoach', 12],
  [126, -244, 'searoach', 12],
]

H.breed(CAST.length + 2)
const cast = H.keep(CAST.length)
H.place((i) => ({ x: run.player.x + CAST[i][0], y: run.player.y + CAST[i][1] }))
cast.forEach((e, i) => {
  e.rosterId = CAST[i][2]
  e.radius = CAST[i][3]
  e.elite = false
  e.guarding = false
  e._guardT = 99
})

// The crab is drawn from `guarding`, and an unforced one flips on its own phase-randomised timer —
// which would silently change what the roach is being compared against between shots.
const facing = () => { for (const e of cast) { e.dir = 0; e.vx = 1; e.vy = 0 } }

// Three shadows at FIXED urgencies in one frame: the growth and the darkening are a comparison, and
// a comparison needs all three visible at once. urgency = 1 - fuse/duration (redrawBombs).
const SHADOWS = [[-108, -84, 0.10], [96, -78, 0.50], [-104, 100, 0.92]]
const GULL_R = 62
const DUR = 1.3
const bombs = SHADOWS.map(([dx, dy, u]) => ({
  x: run.player.x + dx, y: run.player.y + dy,
  radius: GULL_R, fuse: DUR * (1 - u), duration: DUR, dmg: 0, src: 'gull',
}))
const IMPACT = { x: run.player.x + 96, y: run.player.y + 120 }

// stepGullStrike would otherwise push its own bombs mid-capture and detonate them on top of these.
const quiet = () => {
  run._gullAcc = 9999
  run.bombs = bombs.map((b) => ({ ...b }))
  run.player.invuln = 9
  for (const e of cast) e.hitFlash = 0
}

// ONE note, at compose time. H.note appends a fresh <pre> at the same fixed corner every call, so a
// note inside the scrub stacks twelve of them on top of each other.
H.note('surf gulls — shadows u=0.10/0.50/0.92 | frame 0 still, 1..N bird at 0.05s steps')

let frame = 0
return () => {
  H.pin(); facing(); quiet()
  // ONE bird, landing on frame 1. Frame 0 is the shadows alone — the telegraph has to be judged
  // without a 400px bird sitting over it.
  if (frame === 1) run.events.push({ type: 'explode', x: IMPACT.x, y: IMPACT.y, radius: GULL_R, src: 'gull' })
  H.tickFx(frame === 0 ? 0.0005 : 0.05)
  frame++
  H.pin(); facing(); quiet()
}
