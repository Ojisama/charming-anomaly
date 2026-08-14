// Scene: the Pincer's whole cycle — the guard ARMED with a crowd outside it, then bodies pressed
// against the player being caught, then the spent claw. Runs in the page with (run, app, step, H) in
// scope; see the H surface documented in scripts/fx-probe.mjs.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/pincer.js --out /tmp/pincer --chapter surf --frames 4
//
// SHOOTING THE TELEGRAPH IS HALF THE POINT. This weapon spends most of its life ARMED and doing
// nothing — that open claw IS the effect, and a sequence that only catches the burst says nothing
// about whether a player can read the thing they are holding.
//
// THE FRAME THAT MATTERS IS A BODY TOUCHING YOU. The guard is an arc anchored to the player
// (2026-08-14 redesign); the shape it replaced was a disc held 1.35r out toward the nearest enemy,
// and of the enemies actually OVERLAPPING the player it covered only 55-67%. "Can't touch enemies on
// you" was the bug report. So this scene walks two bodies right onto the player rather than staging
// them politely at range, because that is the case the old shape got wrong.
//
// tickFx, NOT tick: the snap burst is spawned by the {type:'pinch'} EVENT, and H.tick drops events
// on the floor. A scene built on tick() captures the claw with no burst at all and no error, which
// is indistinguishable from "the effect is invisible" — the trap fx-probe's own header documents.
H.weapon('pincer', 5)
H.breed(12)
const crowd = H.keep(12)

// A rank standing OUTSIDE the guard's reach (L5 r = 110), so the armed claw has something to face
// without being tripped by it before the scene says so. The camera shows about ±195px on a 390px
// phone, so a crowd staged past that is off-frame entirely and the claw has nothing to be read
// against.
H.place((i, p) => ({
  x: p.x + 150 + Math.floor(i / 4) * 46,
  y: p.y + ((i % 4) - 1.5) * 52,
}))

return (age) => {
  const g = run.guards[0]
  H.pin()
  if (age > 0.45 && g) {
    crowd[0]._fx = run.player.x + Math.cos(g.angle) * 30
    crowd[0]._fy = run.player.y + Math.sin(g.angle) * 30
    crowd[1]._fx = run.player.x + Math.cos(g.angle + 0.7) * 46
    crowd[1]._fy = run.player.y + Math.sin(g.angle + 0.7) * 46
    H.pin()
  }
  // syncPlayer blinks playerC to 0.4 alpha while invuln runs, and a pinned cast being struck every
  // frame never stops flashing white — both make the sprite unjudgeable. Cleared either side of the
  // step, since the step itself sets them.
  run.player.invuln = 0
  for (const e of crowd) e.hitFlash = 0
  const evs = H.tickFx()
  run.player.invuln = 0
  for (const e of crowd) e.hitFlash = 0
  H.note(`age=${age.toFixed(2)} reach=${g ? g.r : '-'} arc=${g ? g.arc?.toFixed(2) : '-'} `
    + `armed=${g ? g.armed : '-'} pinch=${evs.filter((e) => e.type === 'pinch').length}`)
}
