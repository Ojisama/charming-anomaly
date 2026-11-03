// Scene: LAVA ANTS CRAWLING OUT of the lava (The Magma, lavaAntEmerge), shot from the moment they
// surface. Played, not staged: the sim lays the lava and picks the spot; the scene only makes ants
// the likely spawn and moves the camera (the player) next to the first group that comes up.
// With --frames 7, frame k is STEPS[k] sim steps after they surface. For a GIF add ?n=26 to the
// url and pass --frames 26: one frame every 2 steps.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/lava-ant-rise.js --chapter magma \
//     --url 'http://127.0.0.1:PORT/' --out /tmp/ant --frames 7
const result = { chapter: run.chapter }
window.__fxResult = result
const ant = window.__cfg.CHAPTERS.magma.roster.find((r) => r.id === 'lavaAnt')
ant.weight = 60
ant.minT = 0
run.weapons = []
run.time = 40
const p = run.player
let g = 0, born = null
const walk = () => { p.x += Math.cos(g / 90) * 3; p.y += Math.sin(g / 90) * 3 }
while (!born && g++ < 3000) {
  walk()
  if (run.phase === 'levelup') { run.phase = 'playing'; run.levelUpChoices = [] }
  const ev = g < 200 ? (H.tick(), []) : H.tickFx()
  born = ev.find((e) => e.type === 'lavaAntEmerge')
}
if (!born) throw new Error('no ant surfaced in ' + g + ' steps')
result.found = g
// stand still beside them, the rest of the crowd gone
p.x = born.x - 20; p.y = born.y + 130
run.enemies = run.enemies.filter((e) => e.rosterId === 'lavaAnt' && Math.hypot(e.x - born.x, e.y - born.y) < 90)
result.ants = run.enemies.length
// let the camera catch up with the moved player before the first frame (renders only: no sim step)
for (let i = 0; i < 90; i++) window.__renderer.sync(run, 1 / 30, [])
let steps = 0
const STEPS = [0, 3, 6, 10, 15, 22, 40]
const FRAMES = Number(new URLSearchParams(location.search).get('n') || 7)   // ?n=26 with --frames 26
return (age) => {
  // more than 7 frames: one every 2 steps (30 fps of game time), for a GIF
  const want = FRAMES > 7 ? Math.round(age * (FRAMES - 1)) * 2 : STEPS[Math.round(age * (STEPS.length - 1))]
  while (steps < want) {
    steps++
    if (run.phase === 'levelup') { run.phase = 'playing'; run.levelUpChoices = [] }
    H.tickFx()
  }
  result.steps = steps
  // where each ant is and how long it has left climbing: the hold is checkable from the json
  ;(result.track ??= []).push(run.enemies.map((e) => [Math.round(e.x), Math.round(e.y), +(e.emergeT || 0).toFixed(2)]))
}
