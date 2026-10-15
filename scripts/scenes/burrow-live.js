// A Book 3 chapter, PLAYED: the chapter's starter + the next pool weapon at ?lv= (default 3), the player walking a slow loop with
// the chapter's own crowd chasing, for ?t= seconds (default 120) before the frames. Nothing hand-set
// but the arsenal and immortality, so the frame carries everything a real run puts on screen.
//   node scripts/fx-probe.mjs --scene scripts/scenes/burrow-live.js --chapter mine --url 'http://127.0.0.1:5931/?t=150' --out /tmp/mi --frames 3
const q = new URLSearchParams(location.search)
const warm = Number(q.get('t') || 120)
const lv = Number(q.get('lv') || 3)
const ch = window.__cfg.CHAPTERS[run.chapter]
const pool = [ch.starter, ch.weapons.find((id) => id !== ch.starter)]
run.weapons = pool.map((id) => ({ id, level: lv }))
const walk = () => ({ x: Math.cos(run.time * 0.35), y: Math.sin(run.time * 0.35) })
const go = (render) => {
  window.__stepSim(run, walk(), 1 / 60)
  if (run.phase === 'levelup') { run.phase = 'playing'; run.levelUpChoices = [] }
  run.player.hp = run.player.maxHP
  const ev = run.events.splice(0)
  if (render) { window.__renderer.sync(run, 1 / 60, ev); app.renderer.render(app.stage) }
}
for (let i = 0; i < (warm - 2) * 60; i++) go(false)
for (let i = 0; i < 2 * 60; i++) go(true)
window.__hud?.(run)
H.note(run.chapter + ' t ' + run.time.toFixed(0) + ' foes ' + run.enemies.length + ' [' + pool.join(',') + ']')
return () => { for (let i = 0; i < 45; i++) go(true) }
