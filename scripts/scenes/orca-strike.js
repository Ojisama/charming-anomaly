// Scene: the orca's COMMIT — the strike through the centre of the coil it drew, and the splash it
// throws there. Also the scene that judges the FACING while the player is swimming, which is the
// only condition the drift shows up under.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/orca-strike.js --chapter wreck \
//     --url 'http://127.0.0.1:PORT/?t0=0.9&t1=1.3' --out /tmp/orca-strike --frames 8 --w 1280 --h 800
//
// ⚠ THE PLAYER MUST BE MOVING. H.tick/H.tickFx hardcode `{x:0,y:0}`, and a stationary player is
// exactly the case where the coil's centre never chases and the body is never carried sideways —
// i.e. the frame where a facing bug is invisible. This scene drives `step` itself for that reason.
//
// ⚠ AND IT MUST STEP THE SIM, not scrub a decaying list. The splash is spawned by an EVENT
// (orcaSplash -> spawnSplash), so it only exists if the frames are driven with H.tickFx's
// event-forwarding shape. fx-probe calls __fxScrub(k) with k rising monotonically, which is what
// makes "advance the sim to k of the way through the window" a legal scrub.

H.clean()

// A shoal to be eaten, parked on the coil's centre — where ORCA_CIRCLE_DUR of tightening coil would
// have herded it. Without prey on the aim point the strike has nothing to eat and no context.
H.breed(24)
H.keep(24)

const p = run.player
// The centre LAGS the player by 300px, which is what the loose track leaves behind once the player
// has been swimming — and it is what makes "aimed at the centre" visibly different from "aimed at
// the player" in the captured frame.
// ?lag= overrides it: 300 separates the aims clearly on a desktop shot, but a 390px phone is
// only 195px half-wide, so judging the splash AT PHONE SCALE needs a lag the real loose track
// actually produces (~180px at most, player speed over the 1.2/s lerp).
const LAG = Number(new URLSearchParams(location.search).get('lag') || 300)
const cx = p.x - LAG, cy = p.y
H.place((i) => ({
  x: cx + Math.cos(i * 2.399963) * (28 + (i % 4) * 30),
  y: cy + Math.sin(i * 2.399963) * (28 + (i % 4) * 30),
}))

// ORCA_RING_MIN_R (230) and one commit line, so the window below covers a single strike rather than
// catching the second one mid-frame. `trail: []` because render strokes it and stepOrca only seeds
// it on the rising -> circling hand-off, which a posed 'circling' object skips.
run.orca = {
  state: 'circling', t: 0.55,
  cx, cy, r: 230, ang: -1.9,
  x: cx + Math.cos(-1.9) * 230,
  y: cy + Math.sin(-1.9) * 230,
  dirX: 0, dirY: 0, hit: false, alpha: 1, passes: 1, trail: [],
}

H.note(JSON.stringify({ state: run.orca.state, cx: Math.round(cx - p.x), prey: run.enemies.length, chapter: run.chapter }))

// Full-speed swim to the right, so the coil's centre is left behind every frame.
const MOVE = { x: 1, y: 0 }
// The window the frames span, in seconds of sim from scene start. Narrow it around the impact
// (~0.95s with the fixture above) when the splash itself is the subject: the crown lives
// SPLASH_VIS.crownLife = 0.20s, so a sequence spread over the whole visit steps clean over it and
// the splash comes back looking like three thin rings and nothing else.
const T0 = Number(new URLSearchParams(location.search).get('t0') || 0)
const T1 = Number(new URLSearchParams(location.search).get('t1') || 1.9)
let simT = 0
return (k) => {
  const target = T0 + k * (T1 - T0)
  while (simT < target - 1e-6) {
    const d = Math.min(1 / 60, target - simT)
    step(run, MOVE, d)
    simT += d
    run.player.hp = run.player.maxHP
    window.__renderer.sync(run, d, run.events.splice(0))
  }
  app.renderer.render(app.stage)
}
