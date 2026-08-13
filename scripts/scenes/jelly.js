// Scene: the Moon Jelly alone, normal and elite, held still and un-ghosted.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/jelly.js --chapter shelf --out /tmp/j --frames 1
//
// Same two gotchas as shelf-cast.js and for the same reasons: rosterId is overridden because
// WAVE_TABLE does not release `tank` until t=140s, and RADIUS has to move with it (syncEnemies
// draws at k = e.radius / look.baseR, so a body bred at t=0 is a drone at radius 16 and the jelly
// renders at 16/26 of its size). ENEMIES.tank.radius is 26, which is also what drawJelly was
// authored at, so k = 1 and this is the bake at ship size.
H.breed(2)
const cast = H.keep(2)
H.place((i, p) => ({ x: p.x + (i === 0 ? -70 : 70), y: p.y - 40 }))
cast.forEach((e, i) => { e.rosterId = 'jelly'; e.radius = 26; e.elite = i === 1 })

H.note(run.chapter + ' jelly@26 normal+elite')

return () => {
  // phase ghosting is a global alpha on the sprite, not a second texture — correct behaviour, and
  // the wrong thing to photograph the ART through. Held solid.
  for (const e of cast) { e.hitFlash = 0; e.frozen = 0; e._phaseGhost = false; e._phaseT = 99 }
  H.render()
}
