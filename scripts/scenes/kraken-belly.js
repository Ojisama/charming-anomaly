// Scene: ONE LIMP TENTACLE, AND NOTHING ELSE MOVING (owner, 2026-09-27: "take clearer screens, the
// previous one had other tentacles attack etc polluting the visuals"). Plays d2 until the first
// parry opens an arm, then HOLDS that arm limp, parks every other arm, moves the adds off, and
// stands the fish beside the wound while its weapons work. Frame i is taken 3 frames after the hit
// that takes the arm's node below AT[i] of its health, so each frame shows a hit landing.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/kraken-belly.js --out /tmp/kb \
//        --chapter kraken --difficulty 2 --frames 3
const AT = [0.85, 0.55, 0.25]

H.until(() => run.script.phase === "boss" && run.krakenArms.length > 0, 8000)
const rung = window.__cfg.krakenRung(run.difficulty)

function frame(input) {
  step(run, input, 1 / 60)
  window.__renderer.sync(run, 1 / 60, run.events.splice(0))
  if (run.phase === 'levelup') { run.levelUpChoices = null; run.phase = 'playing' }
  run.player.hp = run.player.maxHP
}

// 1. play until an arm rears inside reach, and parry it
let arm = null
for (let g = 0; g < 60 * 120 && !arm; g++) {
  const p = run.player
  const a = run.krakenArms.find((q) => !q.dead && !q.coilArm && !q.grabArm && q.tele > 0 && q.tele <= rung.window * 0.6)
  if (a) { p.x = a.x; p.y = a.y; run.repulseCd = 0; frame({ x: 0, y: 0, skill: true }); if (a.limpT > 0) arm = a; continue }
  frame({ x: 0, y: 0, skill: false })
}
if (!arm) throw new Error('no parry landed in 120s')
run.weapons = [{ id: 'sunlance', level: 5 }]   // one beam: the Sunspear's column rings would sit on the wound
run.krakenLesson = 0; run.krakenLessonT = 0   // the tutorial banner is not the subject

// 2. the held picture: this arm limp, the rest parked, the field empty, the fish beside the wound
function hold() {
  arm.limpT = Math.max(arm.limpT, 1)
  for (const a of run.krakenArms) if (a !== arm) { a.tele = 0; a.fuse = 0; a.gripT = 0 }
  for (const e of run.enemies) if (!e._dead && e.rosterId !== 'krakenHead' && e.rosterId !== 'krakenArm') { e.x += 4000; e.y += 4000 }
  // beside the limb's MIDDLE, so the camera frames the tip and most of the length together
  const mx = arm.x + (arm.lx0 - arm.x) * 0.3, my = arm.y + (arm.ly0 - arm.y) * 0.3
  const ux = arm.lx0 - arm.x, uy = arm.ly0 - arm.y, ul = Math.hypot(ux, uy) || 1
  run.player.x = mx - uy / ul * 110; run.player.y = my + ux / ul * 110
  frame({ x: 0, y: 0, skill: false })
}
const node = () => run.enemies.find((q) => q.id === arm.nodeId && !q._dead)
for (let k = 0; k < 20; k++) hold()

let shot = 0
return (age) => {
  const want = AT[Math.min(AT.length - 1, shot++)]
  for (let g = 0; g < 60 * 90; g++) {
    const n = node()
    if (!n) break
    const before = n.hp
    hold()
    if (n.hp < before && n.hp / n.maxHP <= want) break
  }
  for (let k = 0; k < 3; k++) hold()
  const n = node()
  H.note('node ' + (n ? Math.round(n.hp / n.maxHP * 100) + '%' : 'gone') + ' @' + Math.round(run.time) + 's')
  app.renderer.render(app.stage)
}
