// Scene: HOW LONG ONE spurG REBUILD BLOCKS THE MAIN THREAD.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-rebuild-cost.js --chapter reef --out /tmp/rc --frames 2
//
// The coral field rebuilds when run._spurRev changes, which is once per ridge crossing (210px /
// 90px/s = 2.33s). Everything in that rebuild is SYNCHRONOUS Graphics work, so its duration is a
// hitch the player feels directly -- and at 88k branch segments plus 45k tip circles it was long
// enough to hang the tab. A segment count is not the measurement; this is.
//
// Measured by forcing the rebuild rather than waiting for one: bump _spurRev and time the sync
// that redraws off it. The first call after a clear is the honest one; a warm call reuses nothing
// here because syncSpurs clears and re-paths the whole field.
const t = []
run.player.x = 4200
H.tick()

for (let i = 0; i < 6; i++) {
  run.player.x = 4200 + i * 210
  H.tick()                       // let streamSpurs move its cursor
  run._spurRev = (run._spurRev ?? 0) + 1000 + i
  const t0 = performance.now()
  window.__renderer.sync(run, 1 / 60, [])
  app.renderer.render(app.stage)
  t.push(performance.now() - t0)
}

t.sort((a, b) => a - b)
const med = t[Math.floor(t.length / 2)]
H.note([
  'spurG rebuild + render, ' + t.length + ' forced rebuilds',
  'median ' + med.toFixed(1) + 'ms',
  'worst ' + t[t.length - 1].toFixed(1) + 'ms',
  'best ' + t[0].toFixed(1) + 'ms',
  'ridges in window ' + run.spurs.length,
  med > 100 ? 'HITCH: over 100ms is a visible freeze' : med > 33 ? 'over two frames' : 'under two frames',
].join('  '))

return () => {
  window.__renderer.sync(run, 1 / 60, [])
  app.renderer.render(app.stage)
}
