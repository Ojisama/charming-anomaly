// The Mantle's MOORED BOATS along a shore: past the ebb, the moment a phone screen round some shore
// holds the most floating boats, with the player on the rock there (the camera). The tide steps on
// between frames (the boats ride it on their ropes). The crowd is cleared so the boats read; a frame
// for judging the boats' LOOK and spacing, not the screen in play.
//   node scripts/fx-probe.mjs --scene scripts/scenes/mantle-boats-shore.js --chapter mantle --url http://127.0.0.1:5855/ --out /tmp/bs --frames 2
H.clean()
run.mods.spawnMul = 0
run.enemies = []
const ground = (x, y) => window.__mantleGround(run, x, y)
// the best screen: a dry point the most floating boats lie round (within a phone view of it)
const bestView = () => {
  let best = null
  for (const b of run.boats) {
    if (!b.afloat) continue
    for (let a = 0; a < 8; a++) {
      const x = b.x + Math.cos(a * 0.785) * 120, y = b.y + Math.sin(a * 0.785) * 120
      if (ground(x, y) !== 0) continue
      const n = run.boats.filter((o) => o.afloat && Math.abs(o.x - x) < 170 && Math.abs(o.y - y) < 360).length
      if (!best || n > best.n) best = { x, y, n }
    }
  }
  return best
}
let view = null, g = 0
while (g++ < 400) {
  for (let i = 0; i < 30; i++) { run.enemies = []; H.tick() }
  if (run.lavaTide.cover < 0.3) continue
  const v = bestView()
  if (v && (!view || v.n > view.n)) { view = v; run.player.x = v.x; run.player.y = v.y }
  if (view && view.n >= 4) break
  // roam: hop round the map so new moorings stream in
  if (g % 4 === 0) { run.player.x += 900 * Math.cos(g); run.player.y += 900 * Math.sin(g) }
}
if (!view) { H.note('no floating boat', true); return }
run.player.x = view.x; run.player.y = view.y
for (let i = 0; i < 2; i++) { run.enemies = []; H.tick() }
H.note(`boats ${run.boats.length}, ${view.n} afloat in view, cover ${run.lavaTide.cover.toFixed(2)}`)
return () => { for (let i = 0; i < 20; i++) { run.enemies = []; run.player.x = view.x; run.player.y = view.y; H.tick() } H.tickFx() }
