// Scene: Topsoil's Slugs crawling after a strolling player and laying their slime, beside an earthworm
// and a mole cricket for scale, ~1/15 s apart. Staged (hand-set cast, no weapons): for judging the
// bake, its gait and the trail's look, not evidence about the playing screen.
//   node scripts/fx-probe.mjs --scene scripts/scenes/slug-look.js --chapter topsoil --url http://127.0.0.1:PORT/ --out /tmp/slug --frames 40
const IDS = [['slug', 16], ['slug', 16], ['slug', 16], ['earthworm', 14], ['moleCricket', 12]]
const SPOT = [[-150, -90], [30, -170], [170, 10], [-160, 90], [60, 160]]
H.breed(8)
const cast = H.keep(IDS.length)
const p = run.player
H.place((i) => ({ x: p.x + SPOT[i][0], y: p.y + SPOT[i][1] }))
cast.forEach((e, i) => { e.rosterId = IDS[i][0]; e.radius = IDS[i][1]; e.elite = false; e.affixes = []; e.flags = i < 3 ? ['slimeTrail'] : []; e.speed = i < 3 ? 40 : 30 })
run.weapons = []
run.spawnMul = 0
run.slime.length = 0   // the warm-up's own slugs laid some; the shot shows only the cast's
H.note('topsoil slug crawl')
const simStep = window.__stepSim
let ang = 0
return () => {
  let ev = []
  for (let k = 0; k < 4; k++) {
    ang += 0.012
    simStep(run, { x: 0.35 * Math.cos(ang), y: 0.35 * Math.sin(ang) }, 1 / 60)
    ev = ev.concat(run.events.splice(0))
    run.player.hp = run.player.maxHP
  }
  for (const e of cast) { e.hitFlash = 0; e.hp = e.maxHP; e._dead = false }
  window.__renderer.sync(run, 4 / 60, ev)
  window.__app.renderer.render(window.__app.stage)
}
