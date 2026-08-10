// Scene: the Flagella Whip's DRAWN swoosh against the sector the sim actually damages.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/flagella-hitbox.js --out /tmp/fw \
//        --chapter pond --frames 12
//
// The cast is a survey grid, not a crowd: one enemy per (radius, bearing) sample across the tested
// sector, plus two controls just OUTSIDE it. Every enemy the sim hits shows a damage number, so a
// single frame answers "which of these does the swoosh look like it touched?" without measuring a
// single pixel.
//
// Unlike beam-prism.js this cannot use H.tick/H.render: those DROP run.events, and the whip is a
// pure event effect (`{type:'whip'}` -> spawnWhip). The frame fn below is main.js's own loop —
// step, drain, sync with the drained events — which is the only way the swoosh renders at all.

H.weapon('flagella', 5)          // range 175, arc 1.85 rad (half 0.925)
const RANGE = 175, HALF = 0.925

H.breed(9)
H.keep(9)

// Pinning the player too: pond currents push it every step, and the whole point is a fixed origin
// to measure radii from.
const PX = run.player.x, PY = run.player.y

// i=0 is the aim anchor — nearest enemy decides the swing bearing, so one unambiguous closest
// enemy dead ahead pins the sector to bearing 0 and makes the layout readable.
const SPOTS = [
  [40, 0],                                   // aim anchor
  [90, -0.75], [90, 0], [90, 0.75],          // mid ring, inside the sector
  [160, -0.75], [160, 0], [160, 0.75],       // outer ring, inside the sector
  [90, 1.35],                                // control: inside range, OUTSIDE the arc
  [240, 0],                                  // control: on the bearing, OUTSIDE range
]
H.place((i) => ({ x: PX + SPOTS[i][0] * Math.cos(SPOTS[i][1]), y: PY + SPOTS[i][0] * Math.sin(SPOTS[i][1]) }))

const R = window.__renderer
function frame(dt = 1 / 60) {
  step(run, { x: 0, y: 0 }, dt)
  run.player.x = PX; run.player.y = PY
  run.player.hp = run.player.maxHP
  H.pin()
  const ev = run.events.splice(0)
  R.sync(run, dt, ev)
  app.renderer.render(app.stage)
  return ev
}

// Warm up to the frame the first swing lands on, so capture 0 IS the swing.
let swings = 0
for (let i = 0; i < 400 && swings === 0; i++) swings = frame().filter((e) => e.type === 'whip').length

H.note(JSON.stringify({ swings, range: RANGE, half: HALF, enemies: run.enemies.length }))

return () => frame()
