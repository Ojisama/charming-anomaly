// Scene: the Pincer's whole cycle — ARMED, the snap, and the spent claw recovering. Runs in the
// page with (run, app, step, H) in scope; see the H surface documented in scripts/fx-probe.mjs.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/pincer.js --out /tmp/pincer --chapter surf --frames 14
//
// SHOOTING THE TELEGRAPH IS HALF THE POINT. This weapon spends most of its life ARMED and doing
// nothing — that held-out open claw IS the effect, and a frame sequence that only catches the burst
// would say nothing at all about whether a player can read the thing they are holding. So the
// timeline below is deliberately front-loaded: roughly the first third of the frames are the armed
// claw tracking a crowd that has not reached it yet, then a body walks in, then the rest is the
// spent claw brightening back toward live.
//
// tickFx, NOT tick: the snap burst is spawned by the {type:'pinch'} EVENT, and H.tick drops events
// on the floor. A scene built on tick() captures the claw with no burst at all and no error, which
// is indistinguishable from "the effect is invisible" — the exact trap fx-probe's own header
// documents for the roar.

H.weapon('pincer', 5, { backClaw: 1 })   // two claws: front and back, so the layout reads too

// Real pool entities with real rosterIds, so the claw is judged against the crowd it ships beside.
H.breed(14)
const crowd = H.keep(14)

// Ranks standing WELL OUTSIDE the claw's reach (L5 r = 80, held 60 out, so 140px of total reach).
// They are the reason the guard has an angle at all, and they must not trip it before the scene
// says so.
// (The front rank sits at +165: on a 390px-wide phone the camera only shows ±195px, so a crowd
// staged past that is off-frame entirely and the claw has nothing to be judged against.)
H.place((i, p) => ({
  x: p.x + 165 + Math.floor(i / 5) * 58 + (i % 2) * 14,
  y: p.y + ((i % 5) - 2) * 44,
}))

// Let the guard settle onto its aim, then confirm it is actually armed before spending frames on it.
H.until(() => run.guards.length > 0 && run.guards[0].armed)
const g0 = run.guards[0]
H.note(JSON.stringify({
  claws: run.guards.length,
  armed: run.guards.map((g) => g.armed),
  r: Math.round(g0.r),
  holdPx: Math.round(Math.hypot(g0.x - run.player.x, g0.y - run.player.y)),
  reachPx: Math.round(Math.hypot(g0.x - run.player.x, g0.y - run.player.y) + g0.r),
  nearestEnemyPx: Math.round(Math.min(...crowd.map((e) => Math.hypot(e.x - run.player.x, e.y - run.player.y)))),
}))

// One volunteer walks into the claw at the scripted moment. It is STEERED by rewriting its pin
// target (_fx/_fy), never by splicing it out of `crowd`: H.keep makes run.enemies and the pinned
// list THE SAME ARRAY, so removing it from the cast deletes it from the sim — the first cut of this
// scene did exactly that and shot six frames of a snap that could never happen, with no error.
const walker = crowd[7]

const ARM_FRAC = 0.30   // share of the sequence spent on the armed telegraph before anything happens
let stepped = 0
return (age) => {
  // Frames are requested in order, so this advances the sim monotonically rather than rewinding a
  // decay field the way beam-prism.js does — there is no single list to scrub here: the claw's state
  // lives on run.guards, the burst lives in the particle pool, and only real time joins them.
  if (age >= ARM_FRAC && walker) {
    const g = run.guards[0]
    walker._fx = g.x + Math.cos(g.angle) * g.r * 0.3
    walker._fy = g.y + Math.sin(g.angle) * g.r * 0.3
    walker.maxHP = 99999   // it must survive the pinch, or the shot loses its subject
  }
  const want = Math.round(age * 34)
  while (stepped < want) { H.tickFx(); H.pin(); stepped++ }
  if (stepped === 0) H.tickFx()
}
