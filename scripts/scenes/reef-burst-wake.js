// Scene: The Reef's Burst — the CAVITATION WAKE (render.js drawBurstWake, run._burstT) and the
// coral grate's grit (updateCoralGrit, run._scraping). Runs in the page with (run, app, step, H)
// in scope; see the H surface in fx-probe.mjs.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-burst-wake.js --chapter reef --out /tmp/bw --frames 14
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-burst-wake.js --chapter reef --out /tmp/bwd --frames 14 --w 1280 --h 800
//
// WHAT THIS SHOT IS FOR, and why the frames are a ramp rather than a burst. The whole of what 45
// Air buys is the dash's LENGTH: BURST_SPEED_MUL is fixed across the charge range, so an empty-bar
// press and a full-bar press differ only in lasting 0.30s against 0.75s. Before drawBurstWake
// existed those two were literally the same picture, which is the blocker this scene verifies is
// closed. So the capture walks run._burstT down from over-full to zero and prints the value into
// the frame: the 0.75 frame against the 0.30 frame IS the A/B, on one identical scene.
//
// The last frames land at _burstT = 0, which is the other half of the contract — the wake must be
// GONE, not merely faint, or a dash that ended still reads as one that is running.
//
// run._scraping is held true throughout, so the grit builds at its real rate (CORAL_CRUSH.gritEvery)
// rather than being one puff caught at the instant of a hit. The two effects share the frame on
// purpose: they are both sourced at the player and both are silt, and the question a still cannot
// answer is whether the sustained tell drowns the one-off cast.
const world = app.stage.children[0]

// Warm up until the spur field exists — the wake has to be judged against the coral it is cutting
// past, not against bare floor, and streamSpurs only materialises near the player.
H.until(() => run.spurs.length > 0 && run.time > 25, 4000)
H.breed(6)
const cast = H.keep(6)

const fwdSpan = () => (app.screen.width - (world.position.x + run.player.x * world.scale.x)) / world.scale.x
const layout = () => {
  const span = fwdSpan()
  H.place((i, p) => ({ x: p.x + span * (0.35 + (i % 3) * 0.2), y: p.y + (i < 3 ? -170 : 170) }))
}
layout()
H.render()

// Park on a groove EDGE, which is the only place both effects are true at once: inside the coral
// (so stepSpurs sets _scraping) and with clear lane behind to lay a wake down.
const near = run.spurs.reduce((b, s) => (Math.abs(s.f - run.player.x) < Math.abs(b.f - run.player.x) ? s : b), run.spurs[0])
if (near) { run.player.x = near.f; run.player.y = near.grooves[0].c + near.grooves[0].hw + 6 }

H.note([
  run.chapter,
  'zoom=' + world.scale.x.toFixed(3),
  'spurs=' + run.spurs.length,
  'screen=' + app.screen.width + 'x' + app.screen.height,
  'ridgeF=' + (near ? near.f.toFixed(0) : 'none'),
].join(' '))

const live = document.createElement('pre')
live.style.cssText = 'position:fixed;right:0;top:120px;z-index:99999;margin:0;padding:6px;background:#000;color:#ff8;font:13px monospace'
document.body.appendChild(live)

// The ramp. 0.82 down to 0 over the sequence, so a 14-frame sheet carries BOTH the 0.75 full press
// and the 0.30 empty one with several frames of daylight between them, plus the cleared end state.
const TOP = 0.82
return (age) => {
  const left = Math.max(0, TOP * (1 - age))
  layout()
  for (const e of cast) e.hitFlash = 0
  run.player.invuln = 0
  // Stepped for real so the sim keeps publishing _scraping and the smoke pool ages between frames;
  // both fields are then overwritten, because the point is to photograph a chosen _burstT rather
  // than whatever the sim's own press cycle happened to leave.
  step(run, { x: 0, y: 0 }, 1 / 30)
  const events = run.events.splice(0)
  run.player.hp = run.player.maxHP
  run._burstT = left
  run._scraping = true
  live.textContent = '_burstT = ' + left.toFixed(3) + '\nfull press = 0.75\nempty press = 0.30\n_scraping = true'
  window.__renderer.sync(run, 1 / 30, events)
  app.renderer.render(app.stage)
}
