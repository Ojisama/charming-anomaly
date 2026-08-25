// Scene: The Reef's CIRCUIT GATES — the six checkpoints and the start/finish line, which were
// drawn by nothing at all until v7.232 (owner, playing v7.231: "the checkpoints are invisible, the
// lap line same"). Runs in the page with (run, app, step, H) in scope; see fx-probe.mjs.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-gates.js --out /tmp/gates \
//     --chapter reef --frames 3 --w 1280 --h 800 --url http://127.0.0.1:PORT/
//
// THREE FRAMES, THREE QUESTIONS, and they are not the same question at three zooms:
//   0  a checkpoint at GAMEPLAY zoom — does a gate read as a thing to aim at, from the distance a
//      driver actually sees it, against the coral it is drawn over?
//   1  the START LINE at gameplay zoom — does it read as a FINISH line and not a seventh gate?
//   2  map mode — are they spread round the lap, and is a crossed one visibly dimmer than a live
//      one? Both are properties of the whole lap and invisible in a doorstep-width frame.
//
// ⚠ THE FIRST TICK IS LOAD-BEARING. run._swims is built by stepCircuit on the frame it first runs,
// so before one tick there is nothing to place the camera against and the scene would shoot an
// empty stretch of corridor and look exactly like a gate that does not draw.

const MAP_ZOOM = 0.30
const LAP = 5040

H.tick()
const sw = run._swims || []
H.note(JSON.stringify({ chapter: run.chapter, swims: sw.length, at: sw.map((s) => Math.round(s.f)) }))

// A gate on the SECOND lap, so `done` is exercised: everything behind the player has been crossed.
const target = sw.length ? sw[2].f : 1000
let frame = 0
return () => {
  if (frame === 0) {
    run.player.x = LAP + target - 260      // lap 2, a checkpoint 260px ahead
    run._swimN = 6 + 2                     // lap 1 banked, two of lap 2 behind us
    window.__renderer.setMapMode(false, 1)
  } else if (frame === 1) {
    run.player.x = LAP * 2 - 240           // the start line 240px ahead
    run._swimN = 12
    window.__renderer.setMapMode(false, 1)
  } else {
    run.player.x = LAP + LAP / 2
    run._swimN = 6 + 3
    window.__renderer.setMapMode(true, MAP_ZOOM)
  }
  frame++
  H.tick()
  H.render()
}
