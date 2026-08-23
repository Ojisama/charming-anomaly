// Scene: the orca's COMMIT SWEEP eating the shoal. The thing to judge is the `orcaFeed` burst —
// it must NOT read like the player's own kill (killPoof ends on a white pop; this must not).
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/orca-feed.js --chapter wreck \
//     --url http://127.0.0.1:PORT/ --out /tmp/orca-feed --frames 8
//
// ⚠ THE SCRUB DRIVES H.tickFx, NOT H.render. orcaFeed is an EVENT, and handleEvents is the only
// thing that creates its particles — a scene built on tick/render captures a frame with no burst in
// it and NO ERROR, which is indistinguishable from "the effect is invisible" (fx-probe's own
// header records a claim about the roar shipped off exactly such a frame).

H.breed(30)
H.keep(30)
// A dense bar of prey laid straight across the orca's line, so the sweep meets them one after
// another and several bursts are alight at once.
H.place((i, p) => ({ x: p.x - 40 + (i % 6) * 34, y: p.y - 260 + Math.floor(i / 6) * 34 }))

const p = run.player
const START = 340

// Locked and committing, aimed up the screen through the bar. stepOrca writes this exact shape at
// the moment it breaks orbit.
run.orca = {
  state: 'committing',
  t: 1.4,
  cx: p.x, cy: p.y,
  r: 165,
  ang: 0,
  x: p.x, y: p.y + START,
  dirX: 0, dirY: -1,
  hit: true,          // the PLAYER hit already latched: this shot is about the shoal, not the strike
  alpha: 1,
}

H.note(JSON.stringify({ state: run.orca.state, prey: run.enemies.length, chapter: run.chapter }))

// Advance the real sim a fixed slice per frame so the bite, the events and the particles are all
// the shipped code doing its own work.
let last = 0
return (k) => {
  const steps = Math.max(0, Math.round((k - last) * 42))
  last = k
  for (let i = 0; i < steps; i++) H.tickFx(1 / 60)
  if (steps === 0) H.render()
}
