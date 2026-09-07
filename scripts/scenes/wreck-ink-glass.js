// Scene: THE SQUID'S INK ON THE GLASS — the player inside an inkjet cloud. Frame 0 clean, frame 1
// in the ink (splats on the screen's outer band, centre clear), frame 2 ~3s after leaving (gone),
// frame 3 inked AGAIN — a different set of splats, because every fresh inking re-rolls them
// (render.js inkSeed). Shoot at 390x844 AND 1280x800: the splats are laid out on the viewport.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/wreck-ink-glass.js --chapter wreck \
//     --url http://127.0.0.1:5271/ --out /tmp/ink --frames 4 [--w 1280 --h 800]
//
// ⚠ `--chapter wreck` IS NOT OPTIONAL AND ITS ABSENCE IS SILENT (see wreck-place.js).
run.weapons = []
H.breed(10)
const cast = H.keep(10)
const p = run.player
H.place((i, pl) => ({ x: pl.x + Math.cos(i * 0.63) * 180, y: pl.y + Math.sin(i * 0.63) * 150 }))
const x0 = p.x, y0 = p.y
// t past the grow ramp so it draws at full radius at once (stepBlooms rewrites r from t).
const ink = () => ({ x: x0, y: y0, r: 110, maxR: 110, t: 100, dur: 400, dmgPerTick: 0, tick: 0, look: 'inkjet', slow: 0 })

let frame = 0
return () => {
  run.gems.length = 0; run.coins.length = 0
  run.blooms = run.blooms.filter((b) => b.look !== 'inkjet')
  run.slicks.length = 0
  if (frame === 1 || frame === 3) run.blooms.push(ink())
  if (frame === 0) run._inkT = 0
  // Tick AND render: the splats ease in inside sync() at 5/s (see wreck-oil-glass.js). Frame 2
  // runs long enough for _inkT to reach 0, so frame 3 is a NEW inking and not the old stain.
  const n = frame === 2 ? 200 : 60
  for (let k = 0; k < n; k++) { H.pin(); p.x = x0; p.y = y0; H.tick(); H.render() }
  H.note(JSON.stringify({ frame, inkT: +(run._inkT || 0).toFixed(2) }))
  H.render()
  frame++
}
