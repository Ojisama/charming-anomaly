// Scene: The Magma's Lava Ants walking at a strolling player, dripping lava, beside a cinder beetle and a salamander
// for scale. Staged (hand-set cast, no weapons): for judging the bake, not evidence about the playing
// screen.
//   node scripts/fx-probe.mjs --scene scripts/scenes/ant-look.js --chapter magma --url http://127.0.0.1:PORT/ --out /tmp/ant --frames 10
const IDS = [['lavaAnt', 12], ['lavaAnt', 12], ['lavaAnt', 12], ['cinderBeetle', 11], ['salamander', 10]]
const SPOT = [[-150, -110], [30, -170], [170, -40], [-110, 70], [70, 100]]
H.breed(8)
const cast = H.keep(IDS.length)
const p = run.player
H.place((i) => ({ x: p.x + SPOT[i][0], y: p.y + SPOT[i][1] }))
cast.forEach((e, i) => { e.rosterId = IDS[i][0]; e.radius = IDS[i][1]; e.elite = false; e.affixes = []; e.flags = []; e.speed = i < 3 ? 60 : 8 })
run.weapons = []
run.spawnMul = 0
H.note('magma lava ant')
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
  for (const e of cast) { e.hitFlash = 0; e.hp = e.maxHP; e._dead = false }
  window.__renderer.sync(run, 4 / 60, ev)
  window.__app.renderer.render(window.__app.stage)
}
