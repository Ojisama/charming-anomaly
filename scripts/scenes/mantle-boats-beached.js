// The Mantle's MOORED BOATS with the tide out: at the ebb every boat lies beached on the rock at its
// post, listing over, no lava round it. The player stands among the most boats in view. The crowd is
// cleared so the boats read.
//   node scripts/fx-probe.mjs --scene scripts/scenes/mantle-boats-beached.js --chapter mantle --url http://127.0.0.1:5855/ --out /tmp/bb --frames 1
H.clean()
run.mods.spawnMul = 0
run.enemies = []
// one full cycle, so the boats have ridden a flood and come back to their posts, then the next ebb
H.until(() => run.lavaTide && run.lavaTide.cycle >= 1 && run.lavaTide.phase === 'ebb' && run.lavaTide.t > 3, 12000)
let best = null, bestN = -1
for (const b of run.boats) {
  const n = run.boats.filter((o) => Math.abs(o.x - b.x) < 170 && Math.abs(o.y - b.y) < 380).length
  if (n > bestN) { bestN = n; best = b }
}
if (!best) { H.note('no boat', true); return }
run.player.x = best.x + 60; run.player.y = best.y + 40
for (let i = 0; i < 30; i++) { run.enemies = []; H.tick() }
H.note(`boats ${run.boats.length}, ${bestN} near, beached ${run.boats.filter((b) => !b.afloat).length}, cover ${run.lavaTide.cover.toFixed(2)}`)
return () => { run.enemies = []; H.tickFx() }
