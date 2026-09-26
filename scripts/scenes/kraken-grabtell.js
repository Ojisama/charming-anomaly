// Scene: ONE GRAB'S WIND-UP, played, at fixed offsets from the moment it is announced.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/kraken-grabtell.js --out /tmp/kgt \
//        --chapter kraken --difficulty 3 --frames 9
//
// The bot holds station inside the arms' reach and never presses or dodges, so the first grab of
// the fight winds up at a fish standing on its line. Frame i is (0.05 + i * 0.1875)s after the
// grabRear event — the whole KRAKEN_GRAB_FUSE as a strip. Nothing is hand-set; for A/B-ing the
// grab's look (?gt=N) the frames match across variants because the sim stream does not depend on it.
H.until(() => run.script.phase === "boss" && run.krakenArms.length > 0, 8000)
const cfg = window.__cfg
const head = () => run.enemies.find((e) => e.rosterId === 'krakenHead' && !e._dead) || null
let since = -1   // sim frames since grabRear
function beat() {
  const p = run.player
  const h = head()
  let ix = 0, iy = 0
  if (h && since < 0) {
    const d = Math.hypot(p.x - h.x, p.y - h.y) || 1
    if (d > cfg.KRAKEN_ARM_REACH * 0.8) { ix = (h.x - p.x) / d * 0.85; iy = (h.y - p.y) / d * 0.85 }
  }
  run.player.hp = run.player.maxHP
  step(run, { x: ix, y: iy, skill: false }, 1 / 60)
  const events = run.events.splice(0)
  if (since < 0 && events.some((e) => e.type === 'grabRear')) since = 0
  else if (since >= 0) since++
  window.__renderer.sync(run, 1 / 60, events)
  if (run.phase === 'levelup') run.phase = 'playing'
}
let shot = 0
return (age) => {
  const want = Math.round((0.05 + 0.1875 * shot++) * 60)
  let guard = 0
  while (guard++ < 60 * 240 && (since < 0 || since < want)) beat()
  const g = run.krakenArms.find((a) => !a.dead && a.grabArm)
  H.note('t=' + (since / 60).toFixed(2) + 's ' + (g ? 'tele ' + g.tele.toFixed(2) : 'no grab') + ' @' + Math.round(run.time) + 's')
  app.renderer.render(app.stage)
}
