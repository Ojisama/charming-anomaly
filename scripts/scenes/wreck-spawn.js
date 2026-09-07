// Scene: WHAT WRECK IS NEAR THE SPAWN — the hull field around (0,0), where every run starts.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/wreck-spawn.js --out /tmp/ws --frames 3 \
//     --chapter wreck --url 'http://127.0.0.1:PORT/' --w 1280 --h 800
//
// The hull field is hashed per CELL with no seed (render.js hullCandidate), so it is the same
// every run — and a player who kites near the spawn sees whatever this frame shows, every run.
// Frame 0: 1:1 at the spawn. Frame 1: map mode at zoom 0.1 centred on the spawn (a 12800x8000
// world window at 1280x800). Frame 2: the same map window centred 6000px along the tide, which
// is roughly where 300s of passive drift lands you.
//
// ⚠ `--chapter wreck` IS NOT OPTIONAL AND ITS ABSENCE IS SILENT (see wreck-place.js).
const p = run.player
p.hp = p.maxHP = 99999
const T = Math.PI / 4   // WRECK_TIDE_DEG (config.js)
const SPOTS = [[0, 0], [0, 0], [6000 * Math.cos(T), 6000 * Math.sin(T)]]
H.note('frames: 1:1 at (0,0), map mode zoom 0.1 at (0,0), map mode 6000px down the tide')
let i = 0
return () => {
  run.gems.length = 0
  run.coins.length = 0
  run.enemies.length = 0
  const [x, y] = SPOTS[i % SPOTS.length]
  const map = i >= 1
  window.__renderer.setMapMode(map, 0.1)
  document.getElementById('ui').style.display = map ? 'none' : ''
  p.x = x; p.y = y
  for (let k = 0; k < 10; k++) H.tick()
  p.x = x; p.y = y
  i++
  H.render()
}
