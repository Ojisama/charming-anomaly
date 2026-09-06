// Scene: THE MOUTH. Owner ruling 2026-09-06: "Orca attack should be a jaw opening from under and
// attacking in the 3rd circle, not a dash impossible to avoid for the player."
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/orca-jaw.js --chapter wreck \
//     --url 'http://127.0.0.1:PORT/' --out /tmp/jaw --frames 8 --w 1280 --h 800
//
// ⚠ IT STARTS PART-WAY THROUGH THE STALK, not at the rise. The subject is the third circle and the
// snap that ends it — walking the whole 4.76s coil first would spend six of eight frames on two
// laps that orca-three-circles.js already covers, and land the two frames that matter on top of
// each other. T0 skips to just before the mouth opens.
//
// ⚠ AND THE PLAYER STANDS STILL, which is the point rather than a convenience: the mark is drawn
// where the coil was, and a shot has to show it sitting UNDER the player so the question the attack
// asks ("are you still standing there?") is legible in the frame.

H.clean()

const p = run.player
run.orca = {
  state: 'rising', t: 1.5,
  cx: p.x, cy: p.y, r: 440, ang: 0,
  x: p.x + 440, y: p.y,
  dirX: 0, dirY: 0, hit: false, alpha: 0, passes: 1,
}

H.note(JSON.stringify({ state: run.orca.state, chapter: run.chapter }))

// Rise (1.5) + the close lap (2.0) + the first held lap (1.38) lands at 4.88s, which is the moment
// the mouth opens. The window runs from a beat before that to a beat past the snap.
const T0 = Number(new URLSearchParams(location.search).get('t0') || 4.6)
const T1 = Number(new URLSearchParams(location.search).get('t1') || 2.4)
let simT = 0
return (k) => {
  const target = T0 + k * T1
  while (simT < target - 1e-6) {
    const d = Math.min(1 / 60, target - simT)
    run.enemies.length = 0
    step(run, { x: 0, y: 0 }, d)
    simT += d
    run.player.hp = run.player.maxHP
    run.player.invuln = 0
    window.__renderer.sync(run, d, run.events.splice(0))
  }
  app.renderer.render(app.stage)
}
