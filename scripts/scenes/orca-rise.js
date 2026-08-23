// Scene: the START of a visit — the silhouette surfacing under the player and sliding out to the
// ring, then the first of the coil, judged with the player SWIMMING. That is the condition the
// owner reported the drift under ("the start is weird, the orca drifts, maybe because the player is
// moving"), and it is the one condition scripts/scenes/orca.js cannot show: its scrub teleports the
// body around a stationary player, where the centre never chases and nothing is carried sideways.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/orca-rise.js --chapter wreck \
//     --url http://127.0.0.1:PORT/ --out /tmp/orca-rise --frames 10 --w 1280 --h 800
//
// Drives `step` itself with a real input vector — H.tick/H.tickFx hardcode `{x:0,y:0}`.

H.clean()

H.breed(20)
H.keep(20)
H.place((i, pl) => ({
  x: pl.x + Math.cos(i * 2.399963) * (80 + (i % 4) * 34),
  y: pl.y + Math.sin(i * 2.399963) * (80 + (i % 4) * 34),
}))

const p = run.player
// Exactly what stepOrca writes when it escalates past the shadows: centre on the player, ring at
// ORCA_RING_R (440), alpha climbing from 0. The rise recomputes (x, y) from its own `out` ramp, so
// the seeded position only matters for the first frame's facing.
run.orca = {
  state: 'rising', t: 1.5,
  cx: p.x, cy: p.y, r: 440, ang: -0.6,
  x: p.x, y: p.y,
  dirX: 0, dirY: 0, hit: false, alpha: 0, passes: 2,
}

H.note(JSON.stringify({ state: run.orca.state, prey: run.enemies.length, chapter: run.chapter }))

const MOVE = { x: 1, y: 0 }
const T1 = Number(new URLSearchParams(location.search).get('t1') || 3.0)
let simT = 0
return (k) => {
  const target = k * T1
  while (simT < target - 1e-6) {
    const d = Math.min(1 / 60, target - simT)
    step(run, MOVE, d)
    simT += d
    run.player.hp = run.player.maxHP
    window.__renderer.sync(run, d, run.events.splice(0))
  }
  app.renderer.render(app.stage)
}
