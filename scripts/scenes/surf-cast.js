// Scene: The Surf's three new creatures, side by side and holding still, in both their normal and
// elite bakes.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/surf-cast.js --chapter surf --out /tmp/sc --frames 2
//
// WHY IT OVERRIDES rosterId RATHER THAN WAITING FOR A SPAWN: WAVE_TABLE gates archetypes by TIME
// (tank not until t=140s, fast not until 40s — see the headless-probe section of CLAUDE.md), so a
// scene that just breeds a crowd at t=0 photographs nine copepods and reports the tank and the fast
// one as "missing". syncEnemies keys the texture off e.rosterId alone, so re-labelling a bred body
// gets the right bake without also having to fast-forward five minutes of a run.
//
// hitFlash is cleared EVERY frame, not once: a pinned cast is still inside the player's weapon
// range and is being struck continuously, and a creature that never stops flashing renders as a
// white silhouette — which is indistinguishable from a draw function that filled with white.

// ...and RADIUS has to be set with it. syncEnemies draws at k = e.radius / look.baseR, so a body
// bred at t=0 is a `drone` (radius 16) whatever you relabel it, and the tank renders at 16/26 of
// its real size — i.e. the one thing a cast shot exists to judge, relative size, is the one thing
// it gets wrong by default. These are ENEMIES.drone/wisp/tank radii, which is also what each draw
// fn was authored at, so every column comes out at k = 1.
const IDS = [['sandhopper', 16], ['shorecrab', 26], ['gull', 12]]

H.breed(6)
const cast = H.keep(6)

// column = species, row = normal / elite. The elite row exists because eliteCrown() and the elite
// tint are a SEPARATE bake (makeRosterLook bakes the pair), so a normal-only shot proves nothing
// about half of what actually ships.
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
  // A ghosted `phase` body (the jelly's flag) is drawn faded and drifts through obstacles. That is
  // correct behaviour and the wrong thing to photograph the ART through, so both jellies are held
  // SOLID here — the ghost look is a global alpha on a texture, not a different texture.
  for (const e of cast) {
    e.hitFlash = 0
    e.frozen = 0
    e._phaseGhost = false
    e._phaseT = 99
  }
  H.render()
}
