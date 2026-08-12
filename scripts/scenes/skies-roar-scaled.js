// Scene: the Roar at a REAL late-run build — the one the owner reported as making the game
// unplayable. Lv 5 with the mod totals off his pause sheet: +303% damage, +231% cone width,
// +381% range (1323px), +320% rate (every 0.10s), plus Resonance.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/skies-roar-scaled.js --out /tmp/scaled \
//     --frames 4 --url http://127.0.0.1:PORT/ --chapter skies
//
// See scripts/scenes/skies-roar-wave.js for the two traps this scene also depends on: the roar band
// is EVENT-spawned (use H.tickFx, not H.tick + H.render) and it is render-local (walk it in slices).
run.weapons = [{ id: 'roar', level: 5 }]
// farRoar bonus is the POST-ripple-rework value for the same number of picks: the card's base went
// 0.30 -> 0.18, so the owner's +381% sheet becomes ~+229% (range ~905px, not 1323).
// resonance is part of the reported build and belongs here: it makes every 3rd cast a full 360deg,
// which is the widest thing the ripple field ever has to draw. Dropping it makes the scene easier
// than the report, which is the wrong direction for a scene that exists to reproduce a complaint.
run.weaponMods.roar = { bellow: 3.03, wideRoar: 2.31, farRoar: 2.29, rapidRoar: 3.20, resonance: 1 }

H.breed(8)
const crowd = H.keep(8)
crowd.forEach((e) => { e.flags = [] })
H.place((i, p) => ({ x: p.x + 140 + (i % 2) * 110, y: p.y + (Math.floor(i / 2) - 1.5) * 130 }))

// Let several casts stack up: at 0.10s between casts and a 0.34s band life, the steady state is
// 3-4 overlapping roars, which is the actual complaint. One cast alone does not reproduce it.
for (let i = 0; i < 60; i++) H.tickFx(1 / 120)

// Keep the note SHORT: fx-probe paints it along the bottom of the frame and a long one is cut off
// mid-value, which cost a diagnostic round here (a debug field got truncated away mid-diagnosis).
H.note(JSON.stringify({ arc: Math.round(1.30 * 3.31 * 180 / Math.PI), rng: Math.round(275 * 3.29) }))

let last = 0
return (age) => {
  const want = age * 0.30
  if (want <= 0) { H.tickFx(0); return }
  while (last < want - 1e-9) { H.tickFx(1 / 120); last += 1 / 120 }
}
