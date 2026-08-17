// Scene: the DEATH OUTRO (v7.x, DEATH_OUTRO in config.js) — the beat between the killing blow and
// the summary screen. Owner report: "the player sees the death modal almost before seeing the enemy
// last hitting you."
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/death-outro.js --out /tmp/death --frames 14 --chapter reef
//   node scripts/fx-probe.mjs --scene scripts/scenes/death-outro.js --out /tmp/death-wide --frames 14 --chapter reef --w 1280 --h 800
//
// SHOOT IT AT BOTH VIEWPORTS. The iris is a screen-fitted sprite whose whole correctness argument is
// that it never scales below the screen (see irisFrom/irisTo in config.js); the failure mode is two
// bright bands on a tall phone that a desktop capture would never show. run DO.a asserts the bound,
// this is what confirms the picture.
//
// WHY THIS SCENE DRIVES THE RENDERER DIRECTLY instead of using H.render(). The outro is a FROZEN SIM
// with a LIVE RENDERER: main.js stops calling stepSim once phase is 'dead' but keeps handing sync the
// real dt, so everything that moves during the outro moves because updateDeathOutro moved it. H.tick
// would advance the sim (wrong — the world must hold still) and H.render passes only the sim time
// tick() accumulated, which is 0 here (right for a still, useless for a rate-based bubble vent).
//
// It also SUB-STEPS at 60fps between captured frames rather than jumping deathT in `frames` hops. The
// vent is a RATE, so a 14-hop scrub emits the correct TOTAL number of bubbles in 14 clumps instead of
// 78 evenly spaced ones — the count would be right and the picture a lie. Stepping at the real frame
// rate and capturing every Nth frame gives the distribution the game actually draws.

// Must match DEATH_OUTRO.time. config.js is not in the page's scope, so this is a duplicated
// constant in a dev harness — the one place this repo tolerates one. If the outro is retuned and the
// frames look clipped or slack at the ends, this is why.
const TIME = 1.3
const STEP = 1 / 60

// A crowd to die in front of. The point of the whole feature is that you see what killed you, so a
// frame with no enemies in it cannot show whether the outro reads — and the iris closing over an
// empty sea is a different picture from the iris closing over the thing that got you.
H.breed(16)
const crowd = H.keep(16)
H.place((i, p) => {
  const a = (i / 16) * Math.PI * 2
  const r = 95 + (i % 3) * 42
  return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
})
H.pin()

H.note(JSON.stringify({ chapter: run.chapter, crowd: crowd.length, outro: TIME }))

// run.deathT is ELAPSED (see beginDeathOutro in main.js), so this walks it UP. Frame 0 is the killing
// blow, the last frame is the state the summary screen opens over — which is the frame worth looking
// at hardest, because covering that handoff is half of what the effect is for.
run.deathT = 0
return (age) => {
  const want = TIME * age
  // A rewound age restarts rather than running the clock backwards, which would ask the particle
  // pool to un-emit.
  if (want < run.deathT) run.deathT = 0
  let guard = 0
  while (run.deathT < want && guard++ < 400) {
    run.deathT = Math.min(want, run.deathT + STEP)
    window.__renderer.sync(run, STEP, [])
  }
  app.renderer.render(app.stage)
}
