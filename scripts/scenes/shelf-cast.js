// Scene: The Shelf's three creatures, side by side and holding still, normal and elite bakes.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/shelf-cast.js --chapter shelf --out /tmp/sh --frames 2
//
// The chapter's own two natives (v7.x) replaced the Sand Hopper and Sea Roach it had been borrowing
// from The Surf, so this is the shot that answers the question those loans made unanswerable: do
// three bodies read as three DIFFERENT animals on the murk floor, which is the brightest and
// lowest-contrast one below The Surf.
//
// Same two overrides as surf-cast.js, for the same reasons — read that file's header for the full
// argument, both of them produce a shot that is wrong while looking entirely plausible:
//   rosterId  WAVE_TABLE gates archetypes by TIME (tank not until t=140s), so a crowd bred at t=0
//             is nine drones and the tank simply never appears.
//   radius    syncEnemies draws at k = e.radius / look.baseR, so a body bred at t=0 is a drone at
//             radius 16 whatever it is relabelled, and the tank renders at 16/26 of its real size —
//             i.e. relative size, the one thing a cast shot exists to judge, is what it gets wrong.
// These are the ENEMIES.drone/wisp/tank radii, which is what each draw fn was authored at, so every
// column comes out at k = 1.
const IDS = [['flounder', 16], ['catfish', 12], ['jelly', 26]]

H.breed(6)
const cast = H.keep(6)

// column = species, row = normal / elite. The elite row is not decoration: eliteCrown() and the
// elite tint are a SEPARATE bake (makeRosterLook bakes the pair), so a normal-only shot proves
// nothing about half of what ships.
H.place((i, p) => ({ x: p.x + (i % 3 - 1) * 118, y: p.y + (i < 3 ? -108 : 74) }))
cast.forEach((e, i) => {
  const [id, rad] = IDS[i % 3]
  e.rosterId = id
  e.radius = rad
  e.elite = i >= 3
})

H.note([
  run.chapter,
  'cast=' + cast.map((e) => e.rosterId + '@' + e.radius + (e.elite ? '*' : '')).join(','),
].join(' '))

return () => {
  // hitFlash is cleared EVERY frame, not once: a pinned cast sits inside the player's weapon range
  // and is struck continuously, and a creature that never stops flashing renders as a white
  // silhouette — indistinguishable from a draw fn that filled with white.
  // A ghosted `phase` body (the jelly's flag) is drawn faded; correct behaviour, wrong thing to
  // photograph the ART through, so it is held solid.
  for (const e of cast) {
    e.hitFlash = 0
    e.frozen = 0
    e._phaseGhost = false
    e._phaseT = 99
  }
  H.render()
}
