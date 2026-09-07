// Scene: THE SUNKEN-SHIP FIELD, AS A FIELD — how much wreck is under you at a random spot.
//
//   npx vite --port 5241 --strictPort &
//   node scripts/fx-probe.mjs --scene scripts/scenes/wreck-field.js --out /tmp/wf --frames 3 \
//     --chapter wreck --url 'http://127.0.0.1:5241/' [--w 1280 --h 800]
//
// wreck-hull.js SOLVES for a hull and centres it, which is right for judging the bake and wrong
// for judging the field: it answers "what does one look like", never "how often is one there".
// This scene does the opposite: two FIXED world positions nobody chose for their hull, shot at
// 1:1, then the first of them again in map mode at zoom 0.1 (1280x800 -> a 12800x8000 window, a
// few cells wide) so the hulls can be counted, and once more at t=270 so the Leak's late field
// (map mode keeps slickG) can be judged too. Same positions every run, so two builds compare.
//
// ⚠ `--chapter wreck` IS NOT OPTIONAL AND ITS ABSENCE IS SILENT (see wreck-place.js).
const p = run.player
p.hp = p.maxHP = 99999

const SPOTS = [[5200, 3100], [-7300, 9800], [5200, 3100], [5200, 3100]]
H.note('frames: 1:1 at two fixed spots, then spot 1 in map mode at zoom 0.1, at t=0 and t=270')

let i = 0
return () => {
  run.gems.length = 0
  run.coins.length = 0
  run.enemies.length = 0
  const [x, y] = SPOTS[i % SPOTS.length]
  const map = i >= 2
  if (i === 3) run.time = 270
  window.__renderer.setMapMode(map, 0.1)
  document.getElementById('ui').style.display = map ? 'none' : ''
  p.x = x; p.y = y
  // The floor decor only streams near the player, and the tide moves the player every step —
  // tick at the spot, then put the player back (see wreck-hull.js).
  for (let k = 0; k < 10; k++) H.tick()
  p.x = x; p.y = y
  i++
  H.render()
}
