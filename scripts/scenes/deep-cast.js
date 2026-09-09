// Scene: The Deep's four creatures, side by side and holding still, normal and elite bakes, then the
// same four in the DARK — the lanternfish's own-light punch is half of its design and a lit shot
// cannot see it.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/deep-cast.js --chapter deep --out /tmp/dc --frames 2
//
// rosterId is overridden rather than waiting for a spawn, and RADIUS with it — see twilight-cast.js
// (now gone) for why: WAVE_TABLE gates the tank to t=140s, and syncEnemies draws at
// e.radius / look.baseR, so a bred drone relabelled as the tank renders at 16/26 of its size.
const IDS = [['lanternfish', 16], ['barreleye', 16], ['fangtooth', 12], ['siphonophore', 26]]

H.breed(8)
const cast = H.keep(8)
H.place((i, p) => ({ x: p.x + (i % 4 - 1.5) * 92, y: p.y + (i < 4 ? -120 : 90) }))
cast.forEach((e, i) => { e.rosterId = IDS[i % 4][0]; e.radius = IDS[i % 4][1]; e.elite = i >= 4; e.facing = 1 })
for (const k of ['webs', 'pools', 'strips']) if (Array.isArray(run[k])) run[k].length = 0
run.shafts.length = 0

H.note([
  run.chapter,
  'cast=' + cast.map((e) => e.rosterId + '@' + e.radius + (e.elite ? '*' : '')).join(','),
  'frame 0 lit, frame 1 dark',
].join(' '))

return (age) => {
  run.charge = age < 0.5 ? run.chargeMax : 0
  run.sightCharge = run.charge
  for (const e of cast) { e.hitFlash = 0; e.frozen = 0 }
  H.pin()
  H.render()
}
