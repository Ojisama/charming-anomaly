// Scene: The Reef's RING — the closed-loop track (v7.x), its coral walls, its six checkpoint gates
// and the start/finish line. Runs in the page with (run, app, step, H) in scope; see fx-probe.mjs.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-gates.js --out /tmp/gates \
//     --chapter reef --frames 4 --w 1280 --h 800 --url http://127.0.0.1:PORT/
//
// FOUR FRAMES, FOUR QUESTIONS, and none of them is answerable from the others:
//   0  the START LINE at gameplay zoom — does the chequered band read as a finish line?
//   1  a CHECKPOINT gate — do the posts and chevrons say "through here" against the coral?
//   2  a HAIRPIN (the tightest radius on the lap) — does the track visibly TURN, which is the whole
//      of the owner's "the track isnt a micromachine type circle lap"?
//   3  MAP MODE, wide — is the whole thing a loop rather than a corridor that happens to bend?
//
// ⚠ ONE TICK BEFORE ANYTHING. run._swims is built by stepCircuit on the frame it first runs, and
// the coral field is built by syncSpurs off the player's position ALONG the track — so before a
// tick there is nothing placed anywhere and the scene shoots empty water, which looks exactly like
// a wall that does not draw.

H.tick()
const CFG = window.__cfg

// Pull the geometry out of the run rather than restating it: the spec is the authority and a second
// copy here would drift the day r0 or lapLen moves.
const spec = CFG?.CHAPTERS?.reef?.cave || null
const LAP = spec?.lapLen ?? 5040
const R0 = spec?.ring?.r0 ?? 900

// Where the loop is tightest, sampled rather than assumed — the hairpin is a property of the seed.
let tight = 0, tightR = 1e9
if (spec) {
  for (let i = 0; i < 360; i++) {
    const f = (i / 360) * LAP
    const r = R0 - (CFG.caveAt(f, spec, run._obstacleSeed).c)
    if (r < tightR) { tightR = r; tight = f }
  }
}

const swims = run._swims || []
H.note(JSON.stringify({
  chapter: run.chapter,
  swims: swims.length,
  lapLen: LAP,
  r0: R0,
  tightestAt: Math.round(tight),
  player: [Math.round(run.player.x), Math.round(run.player.y)],
}))

const put = (f, swimN) => {
  // Straight onto the track's centreline at f. run._ringRaw/_ringT are the lap integrator's state
  // (stepCircuit); teleporting without resetting them would bank a whole lap of angle in one frame.
  const cav = CFG.caveAt(f, spec, run._obstacleSeed)
  const t = (2 * Math.PI * f) / LAP
  const r = R0 - cav.c
  run.player.x = r * Math.cos(t) - R0
  run.player.y = r * Math.sin(t)
  run._ringRaw = undefined
  run._swimN = swimN
  run.lap = Math.floor(swimN / Math.max(1, swims.length))
}

let frame = 0
return () => {
  if (!spec) { H.render(); return }
  if (frame === 0) { put(0, 6); window.__renderer.setMapMode(false, 1) }
  else if (frame === 1) { put(swims[2] ? swims[2].f : LAP / 4, 8); window.__renderer.setMapMode(false, 1) }
  else if (frame === 2) { put(tight, 10); window.__renderer.setMapMode(false, 1) }
  else { put(LAP / 2, 12); window.__renderer.setMapMode(true, 0.22) }
  frame++
  H.tick()
  H.render()
}
