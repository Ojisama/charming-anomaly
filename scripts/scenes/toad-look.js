// Scene: The Mine's Gas Toad at three fills (empty, half, full: e.toadGas 0 / 0.5 / 1) beside a pit
// rat and a kobold for scale, the player strolling. Staged (hand-set cast, no weapons): for judging
// the bake, not evidence about the playing screen.
//   node scripts/fx-probe.mjs --scene scripts/scenes/toad-look.js --chapter mine --url http://127.0.0.1:PORT/ --out /tmp/toad --frames 10
const IDS = [['gasToad', 12, 0], ['gasToad', 12, 0.5], ['gasToad', 12, 1], ['mineRat', 10, 0], ['kobold', 22, 0]]
const SPOT = [[-110, -70], [10, -120], [115, -30], [-110, 70], [60, 110]]
H.breed(8)
const cast = H.keep(IDS.length)
const p = run.player
H.place((i) => ({ x: p.x + SPOT[i][0], y: p.y + SPOT[i][1] }))
cast.forEach((e, i) => { e.rosterId = IDS[i][0]; e.radius = IDS[i][1]; e.toadGas = IDS[i][2]; e.elite = false; e.affixes = []; e.flags = []; e.speed = 6 })
run.weapons = []
run.spawnMul = 0
H.note('mine gas toad')
const simStep = window.__stepSim
let ang = 0
return () => {
  let ev = []
  for (let k = 0; k < 4; k++) {
    ang += 0.012
    simStep(run, { x: 0.3 * Math.cos(ang), y: 0.3 * Math.sin(ang) }, 1 / 60)
    ev = ev.concat(run.events.splice(0))
    run.player.hp = run.player.maxHP
  }
  cast.forEach((e, i) => { e.hitFlash = 0; e.hp = e.maxHP; e._dead = false; e.toadGas = IDS[i][2] })
  window.__renderer.sync(run, 4 / 60, ev)
  window.__app.renderer.render(window.__app.stage)
}
