// Scene: a row of Shore Crabs, still, for judging the two GUARD POSES side by side.
//   node scripts/fx-probe.mjs --scene scripts/scenes/shorecrab-guard.js --out /tmp/cr \
//        --chapter surf --frames 2
// Frame 0 is the whole row OPEN, frame 1 is the whole row GUARDED — one identical in-game frame
// apart from the state, which is the only way to judge whether the pair separates.
//
// The crab is this chapter's `tank`, and WAVE_TABLE does not spawn a tank until t=140s, so breeding
// at t=0 yields none at all. Rather than fast-forwarding the clock (which also changes the crowd,
// the spawn rate and the tide), breed whatever the chapter gives and re-badge it: render.js picks a
// creature's drawing from ROSTER_LOOKS[e.rosterId], so setting rosterId is enough to get the real
// shorecrab bake on a real pool entity.
H.breed(8)
const crowd = H.keep(6)
for (const e of crowd) {
  e.rosterId = 'shorecrab'
  e.archetype = 'tank'
  e.radius = 26
}

// Two rows, well apart, so a single frame shows the silhouette at its own scale AND as a pair — an
// enemy read has to survive being one of several on a phone, not just standing alone.
H.place((i, p) => ({ x: p.x + 150 + (i % 3) * 130, y: p.y - 90 + Math.floor(i / 3) * 175 }))

// FORCE the state rather than waiting on each crab's own clock: the windows are phase-randomised
// per crab on purpose (so a wave does not raise in unison), which is exactly what makes an unforced
// frame useless for comparing the two bakes. _guardT is pushed out of reach so stepSim cannot flip
// anyone back mid-frame.
//
// SET IT ON BOTH SIDES OF tickFx, and that is not belt-and-braces. A frame is captured from the
// state as it stands when the capture happens, not when the callback ends — setting the pose only
// AFTER the step produced two frames of the OPEN bake and cost a long detour bisecting render.js
// for a bug that was never there. Anything a scene forces, force it before the step as well.
const setGuard = (guarded) => {
  for (const e of crowd) {
    e.guarding = guarded
    e._guardT = 99
    if (guarded) e.guardAngle = Math.atan2(run.player.y - e.y, run.player.x - e.x)
    e.hitFlash = 0
    e.hp = e.maxHP
  }
  run.player.invuln = 0
}

return (age) => {
  const guarded = age >= 0.5
  H.pin()
  // A pinned cast being struck every frame never stops flashing, and a white silhouette cannot be
  // judged as art. Same reason the player's i-frames get cleared.
  setGuard(guarded)
  H.tickFx()
  setGuard(guarded)
  H.note(`${guarded ? 'GUARDED' : 'OPEN'} n=${crowd.length}`)
}
