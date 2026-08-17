// Scene: The Surf's SHOREBREAK — the button, and the ring of bodies it ploughs out of the way.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/surf-shorebreak.js --chapter surf --out /tmp/sb --frames 20
//   node scripts/fx-probe.mjs --scene scripts/scenes/surf-shorebreak.js --chapter surf --out /tmp/sbd --frames 20 --w 1280 --h 800
//
// SHOOT IT AT BOTH VIEWPORTS. SHOREBREAK_RADIUS is 300 world px against a phone half-diagonal of 465
// and a desktop's 755 — so the crest is most of what you can see on one screen and a comfortable
// disc on the other. The rule CLAUDE.md states is that anything compared against the viewport is not
// verified until it has been shot at two of them, and a crest whose EDGE you cannot see is a
// different mechanic from one whose edge you can: the edge is where the push falls to zero.
//
// A DURATION EFFECT CANNOT BE JUDGED FROM A STILL. The whole point of this move over the Pulse it
// replaced is that it lasts, so the sequence has to span the window rather than the first moment —
// a single frame of it is indistinguishable from the shove it is supposed to have stopped being.
// 7 sim sub-steps of 1/60 per captured frame covers SHOREBREAK_DUR_AT_FULL (2.4s) in 20 frames while
// still integrating at a real frame time; stepping at 0.117 directly would put 25px of knockback
// travel into a single integration and is not the physics the game runs.
//
// THE BUTTON IS AN INPUT, and H.tick/H.tickFx do not take one — they step with {x:0,y:0} — so the
// press is hand-rolled, exactly as reef-burst.js does it.
const world = app.stage.children[0]

H.until(() => run.time > 12, 4000)
H.breed(10)
const cast = H.keep(10)

// A closed ring at 150px: inside SHOREBREAK_RADIUS (300) so every body starts in the crest, and
// tight enough that it reads as the "wall of circling enemies" the move was asked for rather than as
// a scatter that happened to be nearby.
H.place((i, p) => ({
  x: p.x + Math.cos((i / 10) * Math.PI * 2) * 150,
  y: p.y + Math.sin((i / 10) * Math.PI * 2) * 150,
}))

run.charge = 100        // a full bar: the longest crest the button has
run.repulseCd = 0
H.render()

// The radius comes off the run's own event rather than a literal: a probe that prints a hardcoded
// number is a probe that keeps printing it after the constant moves, which is the one thing a
// header is for. Filled in on the first frame, once the press has produced the event.
let notedR = '?'
H.note([
  run.chapter,
  'zoom=' + world.scale.x.toFixed(3),
  'charge=' + run.charge.toFixed(0),
  'screen=' + app.screen.width + 'x' + app.screen.height,
  'halfDiag=' + (Math.hypot(app.screen.width, app.screen.height) / 2).toFixed(0),
].join(' '))

const live = document.createElement('pre')
live.style.cssText = 'position:fixed;right:0;top:120px;z-index:99999;margin:0;padding:6px;background:#000;color:#ff8;font:11px monospace'
document.body.appendChild(live)
let frame = 0
const SUB = 7                 // sim sub-steps per captured frame
const startR = () => {
  const p = run.player
  const ds = cast.filter((e) => !e._dead).map((e) => Math.hypot(e.x - p.x, e.y - p.y))
  return ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : 0
}
const r0 = startR()

return () => {
  const events = []
  for (let s = 0; s < SUB; s++) {
    // The press, on the very first sub-step only. stepRepulse latches on the edge, so a held button
    // does nothing anyway — but pressing every frame would re-arm it the moment the cooldown lapsed
    // and photograph a permanent crest, which is not the move.
    step(run, { x: 0, y: 0, skill: frame === 0 && s === 0 }, 1 / 60)
    events.push(...run.events.splice(0))
    run.player.hp = run.player.maxHP
  }
  const cast0 = events.find((e) => e.type === 'shorebreak')
  if (cast0) notedR = cast0.r.toFixed(0)
  // A pinned cast being struck every frame never stops flashing, and a white silhouette cannot be
  // judged against the effect sitting over it.
  for (const e of cast) e.hitFlash = 0
  run.player.invuln = 0
  live.textContent = 'frame ' + frame + '  r=' + notedR + '  shorebreakT=' + (run._shorebreakT ?? 0).toFixed(2) +
    '\nmean r=' + startR().toFixed(0) + 'px (from ' + r0.toFixed(0) + ')' +
    '\ncharge=' + run.charge.toFixed(0) + '  alive=' + cast.filter((e) => !e._dead).length +
    '\nstunned=' + cast.filter((e) => (e.stunT ?? 0) > 0).length
  window.__renderer.sync(run, SUB / 60, events)
  app.renderer.render(app.stage)
  frame++
}
