// Scene: THE FISSURE (The Magma) tearing at a pinned crowd, fired for real by a level-3 Fissure
// (two lines: the nearest foe and one other). With --frames 10, frame k is shot STEPS[k] sim steps
// after the tear (0.03s .. 2.5s): the crack running out, opening wide, open, and cooled dark. Staged cast: it
// compares looks on one identical frame and is not evidence about a busy screen.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/fissure.js --chapter magma \
//     --url 'http://127.0.0.1:PORT/' --out /tmp/fis --frames 10
const result = { chapter: run.chapter }
window.__fxResult = result
const onlyFissure = () => { run.cracks = run.cracks.filter((c) => c.by === 'fissure') }
run.weapons = []
if (!H.breed(8)) throw new Error('never bred 8 bodies')
H.keep(8)
const SPOTS = [[90, 6], [170, -8], [250, 10], [-150, 120], [-200, -60], [40, -190], [120, 180], [-60, 210]]
H.place((i, pl) => ({ x: pl.x + SPOTS[i][0], y: pl.y + SPOTS[i][1] }))
for (let i = 0; i < 60; i++) { onlyFissure(); H.tick(); H.pin(); if (i > 50) H.render() }
run.cracks = []
H.weapon('fissure', 3)
run.weaponTimers.fissure = 1e-4
let steps = 0
const fired = []
const STEPS = [2, 4, 6, 9, 14, 20, 30, 45, 90, 150]
return (age) => {
  const want = STEPS[Math.round(age * (STEPS.length - 1))]
  while (steps < want) {
    steps++
    if (run.phase === 'levelup') { run.phase = 'playing'; run.levelUpChoices = [] }
    if (steps > 1) run.weaponTimers.fissure = 99   // one tear only
    onlyFissure()
    for (const e of H.tickFx()) if (e.type === 'fissure') fired.push(e.angle.toFixed(2))
    H.pin()
  }
  result.steps = steps
  result.lines = fired.join(' ')
  result.cracks = run.cracks.length
}
