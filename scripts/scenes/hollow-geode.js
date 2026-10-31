// Scene: Hollow Geodes ROLLING at you, with crystal mites and a Crystal Crab
// for scale. Unpinned: each body seeks the player, so the frames show the roll. ~1/15 s apart.
//   node scripts/fx-probe.mjs --scene scripts/scenes/hollow-geode.js --out /tmp/hg --chapter geode --frames 30
// Re-badged by rosterId (tanks do not spawn before t=140s), as shorecrab-guard.js does.
const IDS = [['hollowGeode', 26], ['hollowGeode', 26], ['hollowGeode', 26], ['hollowGeode', 26], ['crystalCrab', 26], ['crystalMite', 7.8], ['crystalMite', 7.8], ['crystalMite', 7.8]]
H.breed(10)
const cast = H.keep(IDS.length)
H.place((i, p) => ({ x: p.x + Math.cos(i * 0.785 + 0.3) * 165, y: p.y + Math.sin(i * 0.785 + 0.3) * 165 }))
cast.forEach((e, i) => { e.rosterId = IDS[i][0]; e.radius = IDS[i][1]; e.elite = false; e.speed = i < 4 ? 54 : i === 4 ? 30 : 60 })
run.weapons = []
run.spawnMul = 0
H.note('hollow geodes | crab + mites')
return () => {
  for (let k = 0; k < 4; k++) H.tickFx(1 / 60)
  for (const e of cast) { e.hitFlash = 0; e.hp = e.maxHP; e._dead = false }
  H.render()
}
