// Scene: THE OIL ON YOU — the player standing in a spill. Frame 0 clean, frame 1 in the oil (the
// skin stained, the border of the screen filmed), frame 2 a second after leaving (both fading with
// the fouling). Shoot at 390x844 AND 1280x800: the border wash reads the viewport.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/wreck-oil-glass.js --chapter wreck \
//     --url http://127.0.0.1:5271/ --out /tmp/oil --frames 3 [--w 1280 --h 800]
//
// ⚠ `--chapter wreck` IS NOT OPTIONAL AND ITS ABSENCE IS SILENT (see wreck-place.js).
run.weapons = []
H.breed(10)
const cast = H.keep(10)
const p = run.player
H.place((i, pl) => ({ x: pl.x + Math.cos(i * 0.63) * 180, y: pl.y + Math.sin(i * 0.63) * 150 }))
const sl = { x: p.x, y: p.y, r: 190, shape: 1, rot: 0.2, _cell: 'fx' }

let frame = 0
return () => {
  run.gems.length = 0; run.coins.length = 0
  run.slicks.length = 0
  if (frame === 1) run.slicks.push(sl)
  if (frame === 0) run._foulT = 0
  // Tick AND render for a second: the border wash eases in inside sync() at 5/s, and a scene
  // that only renders once shoots it at a quarter strength.
  const n = frame === 2 ? 30 : 60
  for (let k = 0; k < n; k++) { H.pin(); p.x = sl.x; p.y = sl.y; H.tick(); H.render() }
  H.note(JSON.stringify({ frame, foulT: +(run._foulT || 0).toFixed(2) }))
  H.render()
  frame++
}
