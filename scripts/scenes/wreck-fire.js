// Scene: THE SPILL BURNS — a shoal half in a spill, one of them already on fire, so the oil catches
// (sim.js stepSlickFire) from that body and lights the rest. Frame 0 is the instant it catches (the
// whoomp), frames 1-6 the front running to the rim at 0.1s steps, then one frame a second while
// the oil burns away (SLICK_BURN_T). --frames 12 sees the whole life of the fire.
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
  const n = frame === 0 ? 1 : frame <= 6 ? 6 : 60
  for (let k = 0; k < n; k++) { H.pin(); cast[0].ignite = Math.max(cast[0].ignite, 3); H.tickFx() }
  H.note(JSON.stringify({ frame, burn: +(sl.burn ?? -1).toFixed(2), r: Math.round(sl.r), lit: cast.filter((e) => e.ignite > 0).length }))
  frame++
}
