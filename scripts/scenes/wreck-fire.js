// Scene: THE SPILL BURNS — a shoal half in a spill, one of them already on fire, so the oil catches
// (sim.js stepSlickFire) and lights the rest. Frame 0 is the instant it catches (the whoomp),
// later frames the steady burn with the flames over the film.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/wreck-fire.js --chapter wreck \
//     --url http://127.0.0.1:5271/ --out /tmp/fire --frames 5
//
// ⚠ `--chapter wreck` IS NOT OPTIONAL AND ITS ABSENCE IS SILENT (see wreck-place.js).
run.weapons = []
H.breed(16)
const cast = H.keep(16)
const p = run.player
// The spill, above the player and clear of them (r is rewritten to ~190 by streamSlicks every
// frame, so 260 keeps the player out of the oil — a player IN it would carry the skin stain and
// the border wash into every frame and confound the fire's own look). `_cell` keeps streamSlicks
// from culling it.
const sl = { x: p.x, y: p.y - 260, r: 190, shape: 2, rot: 0.7, _cell: 'fx' }
run.slicks.push(sl)
// Eight fish in the oil, eight out of it (below the player), the first one carrying a burn.
H.place((i, pl) => i < 8
  ? { x: sl.x + Math.cos(i * 0.8) * 90, y: sl.y + Math.sin(i * 0.8) * 70 }
  : { x: pl.x - 140 + (i - 8) * 40, y: pl.y + 120 })
cast[0].ignite = 3; cast[0].igniteDps = 0.01

let frame = 0
return () => {
  run.gems.length = 0; run.coins.length = 0
  if (!run.slicks.includes(sl)) run.slicks.push(sl)
  // The first frame: one step, so the ignition's own event reaches the renderer.
  const n = frame === 0 ? 1 : 8
  for (let k = 0; k < n; k++) { H.pin(); cast[0].ignite = Math.max(cast[0].ignite, 3); H.tickFx() }
  H.note(JSON.stringify({ frame, fireT: +(sl.fireT || 0).toFixed(2), lit: cast.filter((e) => e.ignite > 0).length }))
  frame++
}
