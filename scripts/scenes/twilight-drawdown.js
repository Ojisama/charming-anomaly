// Scene: a SUN SHAFT being used up (The Twilight, 2026-08-18 — see REFILL_ZONE_SPEND in config.js).
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/twilight-drawdown.js --chapter twilight --out /tmp/dd --frames 14
//   node scripts/fx-probe.mjs --scene scripts/scenes/twilight-drawdown.js --chapter twilight --out /tmp/ddd --frames 14 --w 1280 --h 800
//
// Why this exists when scripts/scenes/shelf-murk.js already shoots a drawdown: the fade was written
// for The Shelf's UPWELLING look, and the second ruling gave the same drawdown to a field drawn a
// completely different way — a warm additive sun column with a glow and a rim, which also punches a
// hole in this chapter's dark scrim. A drawdown that fades the sprite and leaves the hole (or leaves
// the glow) is a shaft that stops feeding you and never looks like it did, which is the mechanic
// deleted rather than shipped. Two consumers, one frame, so shoot it rather than reading it.
//
// Each captured frame advances 0.15s (9 sim steps), so 14 frames covers 2.1s — the whole life of a
// shaft at this chapter's 2.09s. The note carries sh.drawdown so a frame that looks unchanged can be
// told apart from a frame where the clock never ran.
const world = app.stage.children[0]

H.until(() => run.shafts.length > 0 && run.time > 12, 4000)
H.breed(4)
const cast = H.keep(4)

let target = null, best = Infinity
for (const sh of run.shafts) {
  const d = Math.hypot(sh.x - run.player.x, sh.y - run.player.y)
  if (d < best) { best = d; target = sh }
}
if (!target) H.note('NO SHAFT IN THE FIELD — this frame proves nothing about the look', true)
if (target) { run.player.x = target.x; run.player.y = target.y }
run.charge = 8   // low, so the refill has somewhere to go for the whole capture

const layout = () => H.place((i, p) => ({ x: p.x + Math.cos((i / 4) * Math.PI * 2) * 210, y: p.y + Math.sin((i / 4) * Math.PI * 2) * 210 }))
layout()
H.render()

const live = document.createElement('pre')
live.style.cssText = 'position:fixed;right:0;top:120px;z-index:99999;margin:0;padding:6px;background:#000;color:#ff8;font:11px monospace'
document.body.appendChild(live)
let frame = 0

return () => {
  layout()
  for (const e of cast) e.hitFlash = 0
  run.player.invuln = 0
  let events = []
  for (let i = 0; i < 9; i++) {            // 0.15s per captured frame
    if (target) { run.player.x = target.x; run.player.y = target.y }
    step(run, { x: 0, y: 0 }, 1 / 60)
    events = events.concat(run.events.splice(0))
  }
  for (const e of cast) e.hitFlash = 0
  live.textContent = `frame ${frame++}\ndrawdown ${(target?.drawdown ?? 0).toFixed(2)}\ncharge ${run.charge.toFixed(1)}/${run.chargeMax}`
  window.__renderer.sync(run, 0.15, events)
  const ui = document.getElementById('ui')
  if (ui) ui.style.display = ''   // H.clean() hid it; the rail and its new label are half of this shot
  app.renderer.render(app.stage)
}
