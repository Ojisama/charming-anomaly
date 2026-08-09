// Scene: a quiet stretch of city street — no cast, no weapons, nothing but the road surface.
// Exists to judge the CARRIAGEWAY itself (kerb straightness, seams between stamps, marking
// alignment through a junction), which every other city capture buries under enemies and FX.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/city-street.js --out /tmp/rd --frames 6
//
// Each frame walks the player TRAVEL px along +x and re-streams, so one run samples six different
// tiles of the same grid instead of six copies of the spawn block. Set MAP=1 below (or shoot a
// second run with it) for the wide view CLAUDE.md asks layout questions at.
const MAP = 0
const TRAVEL = 420

run.mods.spawnMul = 0
run.enemies.length = 0
run.weapons = []
run.player.hp = run.player.maxHP = 99999

if (MAP) window.__renderer.setMapMode(true, 0.3)

// Stream the surrounding cells in before the first capture — obstacles only materialise within
// 1400px of the player, and a bare road with no buildings reads as a different bug.
for (let i = 0; i < 40; i++) H.tick()

return (age) => {
  run.player.x += TRAVEL
  for (let i = 0; i < 20; i++) H.tick()
  H.render()
}
