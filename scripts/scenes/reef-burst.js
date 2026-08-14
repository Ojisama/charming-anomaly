// Scene: The Reef's BURST — the dash, and the coral head it goes through.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-burst.js --chapter reef --out /tmp/rb --frames 20
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-burst.js --chapter reef --out /tmp/rbd --frames 20 --w 1280 --h 800
//
// SHOOT IT AT BOTH VIEWPORTS. The dash covers BURST_SPEED_MUL x laneScroll x its duration — 304 world
// px at a full bar — against a forward span of 312px on a phone and 1024px on a desktop. The same
// dash is therefore "the whole visible corridor" on one screen and "a third of it" on the other, and
// only shooting both says which the effect was judged on.
//
// THE BUTTON IS AN INPUT, and H.tick/H.tickFx do not take one — they step with {x:0,y:0} — so the
// press has to be hand-rolled. Same for the events: the coral shattering is a {type:'crush'} that
// only handleEvents turns into anything, so a scene built on H.tick + H.render captures a coral
// silently vanishing between two frames, which is exactly what "the effect is invisible" looks like.
//
// The frames step at 1/60 rather than main.js's 0.05 ceiling on purpose: the whole cast is 0.33s
// (BURST_DUR_AT_FULL 0.75s of dash, with the shatter about a third of the way in), and at 0.05 the
// player moves 182px per frame — the burst FX would be born and gone inside one step.
const world = app.stage.children[0]

H.until(() => run.obstacles.length > 2 && run.time > 20, 4000)
H.breed(4)
const cast = H.keep(4)

// Line the player up behind the nearest coral that is INSIDE the lane. A bommie poking past the
// wall is scenery (CHAPTERS.reef.laneSolid), so aiming at one would photograph a dash straight
// through something that was never solid, and prove the opposite of what this scene is for.
const fwd = 'x', cross = 'y', dir = 1
const hw = 430
let target = null, best = Infinity
for (const o of run.obstacles) {
  if (Math.abs(o[cross]) + o.r > hw) continue
  const d = Math.abs(o[fwd] - run.player[fwd])
  if (d > best) continue
  best = d; target = o
}
if (target) {
  // Just outside the crush reach (PLAYER.radius 22 x BURST_CRUSH_MUL 2.5 = 55), so the first frames
  // are the approach and the shatter lands mid-sequence with room after it for the burst to be read.
  run.player[fwd] = target[fwd] - dir * (target.r + 55 + 70)
  run.player[cross] = target[cross]
} else {
  H.note('NO IN-LANE CORAL — this frame proves nothing about the Burst', true)
}
run.charge = 100   // a full bar: the longest dash the button has

const fwdSpan = () => (app.screen.width - (world.position.x + run.player.x * world.scale.x)) / world.scale.x
const layout = () => {
  const span = fwdSpan()
  H.place((i, p) => ({ x: p.x + span * (0.45 + (i % 2) * 0.3), y: p.y + (i < 2 ? -190 : 190) }))
}
layout()
H.render()

H.note([
  run.chapter,
  'zoom=' + world.scale.x.toFixed(3),
  'span=' + fwdSpan().toFixed(0),
  'coral r=' + (target ? target.r.toFixed(0) : 'none'),
  'gap=' + (target ? ((target[fwd] - run.player[fwd]) * dir).toFixed(0) : '-'),
  'charge=' + run.charge.toFixed(0),
  'screen=' + app.screen.width + 'x' + app.screen.height,
].join(' '))

const live = document.createElement('pre')
live.style.cssText = 'position:fixed;right:0;top:120px;z-index:99999;margin:0;padding:6px;background:#000;color:#ff8;font:11px monospace'
document.body.appendChild(live)
let frame = 0, crushes = 0

return () => {
  layout()
  for (const e of cast) e.hitFlash = 0
  run.player.invuln = 0          // syncPlayer blinks playerC to 0.4 alpha while invuln runs
  // The press, on frame 0 only. stepRepulse latches on the edge, so holding it does nothing anyway.
  step(run, { x: 0, y: 0, skill: frame === 0 }, 1 / 60)
  const events = run.events.splice(0)
  crushes += events.filter((e) => e.type === 'crush').length
  run.player.hp = run.player.maxHP
  for (const e of cast) e.hitFlash = 0
  run.player.invuln = 0
  live.textContent = 'frame ' + frame + '  burstT=' + (run._burstT ?? 0).toFixed(2) +
    '\ncrushes=' + crushes + '  coral=' + run.obstacles.length + '  charge=' + run.charge.toFixed(0)
  window.__renderer.sync(run, 1 / 60, events)
  app.renderer.render(app.stage)
  frame++
}
