// Scene: The Reef's Air bar — the air pockets on the sea floor, and what an EMPTY bar looks like.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-air.js --chapter reef --out /tmp/ra --frames 14
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-air.js --chapter reef --out /tmp/rad --frames 14 --w 1280 --h 800
//
// SHOOT IT AT BOTH VIEWPORTS. The lane is ±laneHalfWidth(viewRadius) wide and laneHalfWidth clamps
// against the half-DIAGONAL, so a phone gets a 417px half-lane and a desktop the full 430 — which
// changes which pockets exist at all (streamShafts drops any circle wholly outside the walls).
// A field shot on one screen is not evidence about the other.
//
// Two things this scene has to do that a still cannot:
//
//   * DRIVE THE EVENTS. Drowning's whole tell is the shipped {type:'hurt', dot:true} contract, and
//     handleEvents is the only thing that turns that into the red vignette. H.tick DROPS events and
//     H.render syncs with a hardcoded [], so a scene built on those two captures a frame in which
//     nothing has ever happened — indistinguishable from "the mechanic is invisible". Every captured
//     frame here goes through a hand-rolled step that FORWARDS its events.
//   * SHOW THE HUD. H.clean() hides #ui, which is right for judging a weapon and wrong here: the
//     Air rail is half of what is being verified (a chapter declaring `resource` is supposed to grow
//     one, from ui.js, with no per-chapter code). It is put back on every frame, after clean() has
//     run.
//
// A drown tick lands every DROWN_TICK (0.5s) and its vignette decays in about 0.3s, so the frames
// are stepped at main.js's own 0.05 dt ceiling: 14 of them is 0.7s, which is one or two hits — the
// point being that some frames carry the flash and some do not, which is what the effect IS.
const world = app.stage.children[0]

// Warm up until the field exists and the player is well down the lane (the run origin has a
// minDist clearance, so a scene that shoots t=0 photographs bare floor and reports "no pockets").
H.until(() => run.shafts.length > 0 && run.time > 25, 4000)
H.breed(5)
const cast = H.keep(5)

// Park the player just short of the nearest pocket AHEAD, on its own line across the lane, so the
// frame carries the two states the mechanic has: the disc you are about to be inside, and the floor
// you are on now. Anything selected relative to the PLAYER rather than at a fixed world point,
// because the lane has already carried them a kilometre by the time the warm-up ends.
//
// THE FIELD IS SPARSE ON PURPOSE and that is what makes this placement necessary rather than lazy.
// Measured headless: one pocket per ~640px of lane, i.e. one every ~14s at laneScroll 45, and
// streamShafts only re-scans when the player crosses a cell boundary — so "wait until one is ahead
// of you" is a scene that mostly photographs bare floor and reports pockets=3, all behind. Pick the
// NEAREST one in either direction and teleport to just short of it.
const fwd = 'x', cross = 'y', dir = 1
let target = null, best = Infinity
for (const sh of run.shafts) {
  const d = Math.abs(sh[fwd] - run.player[fwd])
  if (d > best) continue
  best = d; target = sh
}
if (target) {
  run.player[fwd] = target[fwd] - dir * 210
  run.player[cross] = target[cross] - 70
} else {
  H.note('NO POCKET IN THE FIELD — this frame proves nothing about the look', true)
}
run.charge = 0   // EMPTY: the state the drowning tell exists for

// The cast, spread across the visible span ahead so the pockets are judged against the creatures
// and the coral they actually ship beside, not against an empty floor.
const fwdSpan = () => (app.screen.width - (world.position.x + run.player.x * world.scale.x)) / world.scale.x
const layout = () => {
  const span = fwdSpan()
  H.place((i, p) => ({ x: p.x + span * (0.3 + (i % 3) * 0.22), y: p.y + (i < 3 ? -150 : 150) }))
}
layout()
H.render()   // one sync so world.position is current before fwdSpan() is quoted in the note below

// Diagnostics, painted into the shot: a pocket that is off-screen and a pocket that is not drawn
// look identical in a screenshot, and only the first is the scene's fault.
H.note([
  run.chapter,
  'zoom=' + world.scale.x.toFixed(3),
  'span=' + fwdSpan().toFixed(0),
  'pockets=' + run.shafts.length,
  'rel=' + run.shafts.map((s) => '(' + (s.x - run.player.x).toFixed(0) + ',' + (s.y - run.player.y).toFixed(0) + ')r' + s.r).join(''),
  'charge=' + run.charge.toFixed(0),
  'screen=' + app.screen.width + 'x' + app.screen.height,
].join(' '))

// A REAL maxHP, and this is not cosmetic. H.breed pins the player at 99999 HP so the warm-up cannot
// kill them, and render.js's `hurt` case scales its shake/vignette/flash by the hit's FRACTION of
// maxHP — so a 2 HP drowning tick against a 99999 bar computes a vignette of 0.24 and the tell is
// invisible in every frame. Left alone, this scene would report "drowning draws nothing" about a
// player who does not exist.
run.player.maxHP = 100
run.player.hp = 100
// Land the first drowning tick on frame 2 of 14 rather than wherever DROWN_TICK's phase happens to
// fall. The vignette decays at 2.6 alpha/s, so at a 1/60 step it is legible for about 7 frames —
// stepping at main.js's 0.05 ceiling instead compresses the whole tell into one and a half frames
// and reads as "drowning draws nothing", which is a property of the capture rate, not of the game.
run._drownAcc = 0.48

const live = document.createElement('pre')
live.style.cssText = 'position:fixed;right:0;top:120px;z-index:99999;margin:0;padding:6px;background:#000;color:#ff8;font:11px monospace'
document.body.appendChild(live)
let drowned = 0

return () => {
  run.charge = 0                 // held empty: stepCharge would otherwise refill us inside a pocket
  layout()
  for (const e of cast) e.hitFlash = 0
  run.player.invuln = 0          // syncPlayer blinks playerC to 0.4 alpha while invuln runs
  step(run, { x: 0, y: 0 }, 1 / 60)
  const events = run.events.splice(0)
  for (const e of events) if (e.type === 'hurt' && e.src === 'drown') drowned++
  run.player.hp = run.player.maxHP
  for (const e of cast) e.hitFlash = 0
  run.player.invuln = 0
  live.textContent = 'drown hits so far: ' + drowned + '\nthis frame: ' + events.filter((e) => e.src === 'drown').length
  window.__renderer.sync(run, 1 / 60, events)
  const ui = document.getElementById('ui')
  if (ui) ui.style.display = ''  // H.clean() hid it; the Air rail is half of what this shot is for
  app.renderer.render(app.stage)
}
