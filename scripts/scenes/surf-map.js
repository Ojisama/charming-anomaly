// Scene: The Surf's MAP — a tide pool, a sandbar and the surge, in one frame, across a full tide
// cycle. Runs in the page with (run, app, step, H) in scope; see the H surface in fx-probe.mjs.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/surf-map.js --out /tmp/surf --chapter surf --frames 14
//
// WHY IT SEARCHES FOR ITS OWN SPOT: both fields are STREAMED from a per-run cell hash and both keep
// a clearance ring around the run ORIGIN (pools 420px, sandbars 380px), so a probe that just breeds
// a crowd at the spawn point photographs bare sand and concludes the renderers do not work. The
// scan below walks the player over a grid of cell-sized hops, re-streaming at each, until it finds a
// stop with one of each nearby, then parks between them.
//
// THE TIDE NEEDS TIME, NOT TICKS. tideForce is a sine of run._realTime with a 14s period, so a
// 14-frame sequence stepped at 1/60 covers a quarter of a second and every frame looks identical —
// which reads exactly like "the streaks do not move". Each frame instead JUMPS run._realTime to its
// share of one full period and then runs a short burst of real steps so the streak field can
// re-align to that phase. Frames 0 and 7 are therefore opposite halves of the cycle: the streaks
// must point opposite ways, and that reversal is the whole thing being judged.

// A spot with both a pool and a sandbar in view. 700 is the pool cell pitch; hopping by it lands on
// a different cell every time rather than re-rolling the same one.
let spot = null
for (let gx = -4; gx <= 4 && !spot; gx++) {
  for (let gy = -4; gy <= 4 && !spot; gy++) {
    run.player.x = gx * 700
    run.player.y = gy * 700
    H.tick(); H.tick()
    const near = (l, d) => l.find((o) => Math.hypot(o.x - run.player.x, o.y - run.player.y) < d)
    const pool = near(run.shafts, 500)
    const bar = near(run.sandbars, 500)
    if (pool && bar) spot = { pool, bar }
  }
}
if (!spot) H.note('NO SPOT: no cell in the scanned grid holds both a pool and a sandbar', true)

// Park midway between the two so both are on screen at once, and remember it: the tide shoves the
// player every step, and a drifting camera would slide the subjects out of frame over 14 frames.
const px = (spot.pool.x + spot.bar.x) / 2
const py = (spot.pool.y + spot.bar.y) / 2
run.player.x = px
run.player.y = py
H.tick()

H.breed(8)
const crowd = H.keep(8)
H.place((i, p) => ({ x: p.x + Math.cos(i * 1.4) * 150, y: p.y + Math.sin(i * 1.4) * 150 }))

H.note(JSON.stringify({
  chapter: run.chapter,
  pools: run.shafts.length,
  sandbars: run.sandbars.length,
  poolPx: Math.round(Math.hypot(spot.pool.x - px, spot.pool.y - py)),
  barPx: Math.round(Math.hypot(spot.bar.x - px, spot.bar.y - py)),
  poolR: spot.pool.r,
  barR: spot.bar.r,
  charge: Math.round(run.charge),
}))

const PERIOD = 14
return (age) => {
  run._realTime = age * PERIOD
  for (let k = 0; k < 26; k++) {
    H.tickFx()
    H.pin()
    run.player.x = px       // hold the camera: stepTide moves the player every step
    run.player.y = py
  }
}
