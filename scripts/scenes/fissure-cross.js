// Scene: two Fissure L5 casts with Fragile Ground 3, the second fired after the player steps aside,
// so lines cross and branch. Staged: compares rift bakes on one identical frame, nothing more.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/fissure-cross.js --chapter magma \
//     --url 'http://127.0.0.1:PORT/' --out /tmp/cx --frames 4
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
H.weapon('fissure', 5)
run.weaponMods.fissure = { fragileGround: 3 }
run.weaponTimers.fissure = 1e-4
let steps = 0
const fired = []
const STEPS = [26, 34, 50, 110]
return (age) => {
  const want = STEPS[Math.round(age * (STEPS.length - 1))]
  while (steps < want) {
    steps++
    if (run.phase === 'levelup') { run.phase = 'playing'; run.levelUpChoices = [] }
    if (steps === 2) run.weaponTimers.fissure = 99
    if (steps === 18) { run.player.x += 60; run.player.y += 70; run.weaponTimers.fissure = 1e-4 }
    if (steps === 19) run.weaponTimers.fissure = 99
    onlyFissure()
    for (const e of H.tickFx()) if (e.type === 'fissure') fired.push(e.angle.toFixed(2))
    H.pin()
  }
  result.steps = steps
  result.lines = fired.join(' ')
  result.fissures = run.fissures.length
}
