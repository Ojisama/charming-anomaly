// Scene: THE AMBIENT DUST, measured rather than admired (render.js updateDustMotes, config's
// dustVel). Runs in the page with (run, app, step, H) in scope; see the H surface in fx-probe.mjs.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-dust.js --chapter reef --out /tmp/dust --frames 3
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-dust.js --chapter surf --out /tmp/dusts --frames 3
//
// WHY A PROBE AND NOT A LOOK. A mote is a 2px grey dot at alpha 0.3 travelling tens of px a second:
// two stills a frame apart are IDENTICAL to the eye, which is exactly how a field drifting the wrong
// way survived two rounds of frames. So this measures the shipped renderer instead — it finds the
// dust container on the stage, syncs it forward in real time, and prints the net displacement of
// every mote into the frame. The suite integrates the same composition headlessly (run US.k-1); this
// is the other half, the one that proves render.js is actually WIRED to it.
//
// The dust layer hangs straight off the stage (outside the world container, so it is in screen space
// and unaffected by floorTint), which is what makes it findable without exporting anything: it is the
// stage child holding exactly DUST.count sprites.
const stage = app.stage
const cands = stage.children.filter((c) => c.children && c.children.length === 14)
const layer = cands[0]
if (!layer) throw new Error('no 14-sprite stage child — DUST.count moved, or the dust layer left the stage')

const shot = () => layer.children.map((s) => ({ x: s.position.x, y: s.position.y }))
const before = shot()
// Real seconds, driven by hand: the wrap is at ±8% of the screen, so a long step would alias a mote
// that wrapped into one that reversed. 12 x 0.25s is well inside a screen width at any speed here.
for (let n = 0; n < 12; n++) window.__renderer.sync(run, 0.25, [])
app.renderer.render(app.stage)
const after = shot()

const W = app.screen.width
const dx = after.map((p, i) => {
  let d = p.x - before[i].x
  if (d > W / 2) d -= W * 1.16          // wrapped left-to-right
  if (d < -W / 2) d += W * 1.16
  return d / 3                           // px/s over the 3s driven above
})
const dy = after.map((p, i) => (p.y - before[i].y) / 3)
const r1 = (v) => Math.round(v * 10) / 10

const span = (a) => r1(Math.min(...a)) + '..' + r1(Math.max(...a))
H.note([
  run.chapter, app.screen.width + 'x' + app.screen.height, dx.length + ' motes',
  'x ' + span(dx) + 'px/s', 'y ' + span(dy) + 'px/s',
  'rightward=' + dx.filter((d) => d > 0).length,
  'net=' + r1(dx.reduce((a, b) => a + b, 0) / dx.length),
].join('  '))
return () => { window.__renderer.sync(run, 0.25, []); app.renderer.render(app.stage) }
