// Scene: the WHOLE STALK, so the three circles can be counted. Owner ruling 2026-09-06: "three
// circle and the third one is the same as the second one so the player can escape during the 3rd
// one" — the claim is about the SHAPE OF THE PATH over several seconds, which no single frame and
// no still of the payoff can show. This walks the full ORCA_CIRCLE_DUR and lets the published coil
// (run.orca.trail) accumulate, so each captured frame carries every turn drawn so far.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/orca-three-circles.js --chapter wreck \
//     --url 'http://127.0.0.1:PORT/' --out /tmp/orca3 --frames 9 --w 1280 --h 800
//
// ⚠ THE PLAYER STANDS STILL, which is the opposite of orca-strike.js's rule and for the opposite
// reason. There the subject is the strike's AIM, which only separates from the player once the coil
// centre has been left behind; here the subject is whether two of the turns are the SAME CIRCLE,
// and a centre sliding under a swimming player smears concentric turns into a drifting scribble
// that cannot be read either way.
//
// ⚠ AND IT STARTS AT `rising`, not at a posed 'circling'. stepOrca seeds o.trail on the
// rising -> circling hand-off; a hand-built circling object skips that, and the coil — the entire
// subject of this scene — then depends on the `??=` guard rather than on the shipped path.

H.clean()

const p = run.player
run.orca = {
  state: 'rising', t: 1.5,
  cx: p.x, cy: p.y, r: 440, ang: 0,
  x: p.x + 440, y: p.y,
  dirX: 0, dirY: 0, hit: false, alpha: 0, passes: 1,
}

H.note(JSON.stringify({ state: run.orca.state, chapter: run.chapter }))

// Seconds of sim the frames span. The default covers the rise plus the whole stalk, so frame 1 is
// the shadow surfacing underneath and the last is the moment it breaks orbit.
const T0 = Number(new URLSearchParams(location.search).get('t0') || 1.5)
const T1 = Number(new URLSearchParams(location.search).get('t1') || 6.26)
let simT = 0
return (k) => {
  const target = T0 + k * (T1 - T0)
  while (simT < target - 1e-6) {
    const d = Math.min(1 / 60, target - simT)
    run.enemies.length = 0
    step(run, { x: 0, y: 0 }, d)
    simT += d
    run.player.hp = run.player.maxHP
    window.__renderer.sync(run, d, run.events.splice(0))
  }
  app.renderer.render(app.stage)
}
