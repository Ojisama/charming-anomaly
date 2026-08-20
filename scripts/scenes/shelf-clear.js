// Scene: The Shelf's CLEAR — the button, and the murk it shoves back.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/shelf-clear.js --chapter shelf --out /tmp/cl --frames 14
//   node scripts/fx-probe.mjs --scene scripts/scenes/shelf-clear.js --chapter shelf --out /tmp/cld --frames 14 --w 1280 --h 800
//
// SHOOT IT AT BOTH VIEWPORTS. The light radius is stated as a fraction of the screen's LONGEST SIDE
// (lightRadius, config.js), so "the water opens" is a claim about a ratio and not about a px count —
// a probe run at one viewport has verified the effect on one device.
//
// Fired on an EMPTY BAR on purpose, which is the opposite of surf-shorebreak.js's full-bar press.
// Two reasons, and both are the point of the button rather than a convenience:
//   - It is the most murk there is (dark.radiusEmpty 0.1), so it is the frame where "you cannot see"
//     is actually true. A press at a full bar opens water that was already half open.
//   - An empty bar spends nothing, so the shove stays at its REPULSE_RADIUS floor and the window at
//     its CLEAR_DUR_MIN floor. Everything visible here is therefore the button's guaranteed minimum,
//     not its best case — if the murk does not visibly part in these frames, it does not part.
//
// What to look for, in this order:
//   1. Frame 0 -> 1: does the water OPEN, and does it read as murk being pushed back rather than as
//      a lamp being switched on? This is the whole payload of the button (see CLEAR_* in config.js);
//      the wider shove and the longer stagger are things a player feels, not things they see.
//   2. Frames ~5-7: does it CLOSE by easing rather than snapping? A snap is the shape of a render
//      glitch, and this chapter has already shipped one complaint about clear water that "does
//      nothing and never goes away".
//   3. Does anything about the open frame read as The Twilight? The two chapters run one radius rig
//      and the far field is the only thing keeping them apart — see shelf-murk.js's own header.
//   4. The stagger count in the overlay must move on the press. A Clear that shoved nothing would
//      look identical here, because the murk opening is not evidence that the crowd was touched.
const world = app.stage.children[0]

H.until(() => run.time > 12, 4000)
H.breed(10)
const cast = H.keep(10)

// A ring at 150px — inside the empty bar's 340px shove, so every body starts in reach. Deliberately
// NOT out at the 820px full-bar reach: this scene is shot at the floor, and a ring nothing touches
// would make check 4 above vacuous.
H.place((i, p) => ({
  x: p.x + Math.cos((i / 10) * Math.PI * 2) * 150,
  y: p.y + Math.sin((i / 10) * Math.PI * 2) * 150,
}))

run.charge = 0          // the worst murk this chapter has, and the button's guaranteed minimum
run.sightCharge = 0
run.repulseCd = 0
H.render()

H.note([
  run.chapter,
  'zoom=' + world.scale.x.toFixed(3),
  'charge=0 (empty bar: the floor case)',
  'screen=' + app.screen.width + 'x' + app.screen.height,
  'longest=' + Math.max(app.screen.width, app.screen.height),
].join(' '))

const live = document.createElement('pre')
live.style.cssText = 'position:fixed;right:0;top:120px;z-index:99999;margin:0;padding:6px;background:#000;color:#ff8;font:11px monospace'
document.body.appendChild(live)
let frame = 0
const SUB = 9                 // sim sub-steps per captured frame -> 0.15s, so 14 frames span 2.1s
let notedR = '?'

return () => {
  const events = []
  for (let s = 0; s < SUB; s++) {
    // The press, on the very first sub-step only — stepRepulse latches on the edge, and pressing
    // every frame would re-arm the window the moment the cooldown lapsed and photograph a chapter
    // that had permanently lost its murk, which is the one thing this button must not be.
    step(run, { x: 0, y: 0, skill: frame === 0 && s === 0 }, 1 / 60)
    events.push(...run.events.splice(0))
    run.player.hp = run.player.maxHP
  }
  // Off the run's own event rather than a literal: a probe printing a hardcoded radius keeps
  // printing it after the constant moves, and the header is the only thing that would have said so.
  const shove = events.find((e) => e.type === 'repulse')
  if (shove) notedR = shove.r.toFixed(0)
  for (const e of cast) e.hitFlash = 0
  run.player.invuln = 0
  // sightCharge against charge is the whole mechanic in two numbers: the first is what the screen is
  // drawn from, the second is what the bar actually holds. They must differ during the window and be
  // equal outside it.
  live.textContent = 'frame ' + frame + '  shove r=' + notedR + '  clearT=' + (run._clearT ?? 0).toFixed(2) +
    '\nsightCharge=' + (run.sightCharge ?? 0).toFixed(1) + '  charge=' + run.charge.toFixed(1) +
    '\nstunned=' + cast.filter((e) => (e.stunT ?? 0) > 0).length + '/' + cast.filter((e) => !e._dead).length
  window.__renderer.sync(run, SUB / 60, events)
  app.renderer.render(app.stage)
  frame++
}
