// Scene: The Surf's Breaker, mid-roll through a crowd. The wave is a run.novas entry carrying
// `arc` + `carry`, drawn by drawBreakers as bands of light and shadow rather than a stroked arc —
// the same rule the chapter's background swell keeps, since both are water seen from overhead.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/surf-breaker.js --out /tmp/br --frames 14 --chapter surf
//
// What the frames have to answer, in order:
//   1. is the crest READABLE as a wave, or as a ring someone cut a piece out of?
//   2. does it obviously cover only the side the player faces?
//   3. can you see bodies being CARRIED — the property that separates it from Cytokine Burst?
// Question 3 needs the sequence, not a still: a shove and a ride look identical in one frame.

H.weapon('breaker', 5)

// A real crowd from the sim, so every body is a pool entity with a real rosterId and this chapter's
// own bakes — the crest has to be judged against the sprites it actually rolls over.
H.breed(24)
const crowd = H.keep(24)

// A wedge of bodies ahead of the player, spread wider than the wave's own 126deg at L5 so the
// sector's EDGES land on the crowd. Bodies outside the arc are the control: if they move, the gate
// is not gating.
H.place((i, p) => {
  const ring = Math.floor(i / 8)          // three ranks at increasing range
  const k = (i % 8) / 7                   // 0..1 across a half-circle in front
  const a = -Math.PI / 2 + k * Math.PI
  const r = 120 + ring * 85
  return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
})

// Wait for a cast, then aim the crest along +x so the framing is the same in every variant. The
// weapon aims at nearestEnemy, which drifts with the tide — pinning the angle is what makes two
// shots comparable by eye.
H.until(() => run.novas.some((n) => n.arc != null))
for (const n of run.novas) if (n.arc != null) n.angle = 0

H.note(JSON.stringify({
  crests: run.novas.filter((n) => n.arc != null).length,
  arcDeg: Math.round((run.novas.find((n) => n.arc != null)?.arc ?? 0) * 180 / Math.PI),
  r: Math.round(run.novas.find((n) => n.arc != null)?.r ?? 0),
}))

// UNPINNED from here: the whole point of the sequence is watching bodies ride the crest, and
// H.pin() would nail them back to their marks every frame — which renders as a wave that passes
// through a crowd and moves nothing at all.
return (age) => {
  for (const n of run.novas) if (n.arc != null) n.angle = 0
  H.tickFx(1 / 60)
}
