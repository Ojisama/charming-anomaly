// Scene: do The Reef's air-pocket bubbles ever STOP? Owner, 2026-08-25: "refill bubbles don't
// disappear when they stop refilling."
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-bubbles.js --chapter reef --out /tmp/rb --frames 6
//
// Frame 0: sitting in a pocket, bar empty (it IS refilling).
// Frame 1-2: same spot, bar pinned at max (it has STOPPED refilling — clamped).
// Frame 3-5: teleported a lap away, several seconds later — anything still drawn at the old spot is
// a leaked particle rather than a live vent.
H.tick()
H.until(() => run.shafts.length > 0 && run.time > 12, 6000)

let target = null, best = Infinity
for (const sh of run.shafts) {
  const d = Math.hypot(sh.x - run.player.x, sh.y - run.player.y)
  if (d < best) { best = d; target = sh }
}
if (!target) H.note('NO POCKET — this scene proves nothing', true)
else { run.player.x = target.x; run.player.y = target.y }

let frame = 0
return () => {
  if (frame === 0) run.charge = 0
  if (frame === 1 || frame === 2) run.charge = run.chargeMax
  if (frame === 3 && target) { run.player.x = target.x + 4000; run.player.y = target.y + 4000 }
  for (let i = 0; i < 12; i++) {
    const events = run.events.splice(0)
    step(run, { x: 0, y: 0 }, 0.05)
    window.__renderer.sync(run, 0.05, events)
  }
  H.note([
    'frame=' + frame,
    'charge=' + run.charge.toFixed(0) + '/' + run.chargeMax,
    'pockets=' + run.shafts.length,
    'nearest=' + (run.shafts.length ? Math.round(Math.min(...run.shafts.map((s) => Math.hypot(s.x - run.player.x, s.y - run.player.y)))) : '-'),
  ].join(' '))
  frame++
  app.renderer.render(app.stage)
}
