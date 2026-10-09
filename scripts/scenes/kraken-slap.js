// Scene: THE BACKHAND SLAP IN REAL PLAY (d3). The fight plays hands-off — the fish holds a spot
// 280px from the head, wiggles out of any grab, never presses — until an arm takes the slap's turn;
// then every frame is 3 sim steps (20fps) through the wind-up, the swing and the follow-through.
// Nothing is hand-set but the fish's spot, so the frame is the fight's own.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/kraken-slap.js --chapter kraken \
//        --difficulty 3 --frames 40 --url 'http://127.0.0.1:PORT/' --out /tmp/ksl/f
//   ?sp=1 presses the parry on the first frame of the slap's window instead
const PRESS = new URLSearchParams(location.search).get('sp') === '1'
H.until(() => run.script.phase === 'boss' && run.krakenArms.length > 0, 8000)
run.krakenLesson = 0
// the slap waits for the second ring block (like the Coil); a fish that never parries never breaks
// an arm and so never leaves the first one — the one hand-set field
run.script.bossIdx = 2
const head = () => run.enemies.find((e) => e.rosterId === 'krakenHead' && !e._dead) || null
const rung = window.__cfg.krakenRung(run.difficulty)
function beat(press) {
  const h = head()
  if (h) { run.player.x = h.x + Math.cos(1.0) * 280; run.player.y = h.y + Math.sin(1.0) * 280 }
  for (const a of run.krakenArms) if (a.gripT > 0) { a.gripT = 0; a.gripClock = a.gripWiggle = undefined }
  run.player.hp = run.player.maxHP
  if (press) run.repulseCd = 0
  step(run, { x: 0, y: 0, skill: press }, 1 / 60)
  if (run.phase === 'levelup') run.phase = 'playing'
  return run.events.splice(0)
}
let guard = 0
while (!run.krakenArms.some((a) => a.slapArm) && guard++ < 60 * 400) { beat(false); if (guard % 6 === 0) window.__renderer.sync(run, 0.1, []) }
const slap = run.krakenArms.find((a) => a.slapArm)
H.note(slap ? 'slap at ' + Math.round(run.time) + 's' + (PRESS ? ' (parry)' : '') : 'NO SLAP IN 400s')
let pressed = false
return () => {
  for (let i = 0; i < 3; i++) {
    const press = PRESS && !pressed && !!slap && slap.slapArm && slap.tele > 0 && slap.tele <= rung.window
    if (press) pressed = true
    window.__renderer.sync(run, 1 / 60, beat(press))
  }
  app.renderer.render(app.stage)
}
