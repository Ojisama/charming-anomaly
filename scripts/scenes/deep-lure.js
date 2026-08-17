// Scene: can you actually NAVIGATE by the lure? Four anglerfish on one axis, at ranges that
// straddle the chapter's own light radius, on a FULL bar.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/deep-lure.js --chapter deep --out /tmp/lure --frames 1
//
// drawAnglerfish's own comment sells the esca as "the only genuinely bright thing in the chapter
// and ... the thing the player crosses the screen toward". That is a claim about a sprite drawn
// INSIDE `world`, and darkLayer is a multiply scrim sitting on the stage directly above `world` —
// so every claim of that kind has to be photographed rather than reasoned about, because the scrim
// does not care how bright the thing underneath it is.
//
// SHOOT IT AT A LOW BAR AS WELL AS A FULL ONE, via `?lureCharge=N` on the probe's --url. A full bar
// is the case that cannot fail: R = radiusFull(0.50) x 844 = 422px is already the phone's screen
// half-HEIGHT, so vertically there is nothing left to hide. The case that decides whether the
// chapter has a death spiral in it is the LOW bar — the state you are in precisely when you need to
// find the only refill in the chapter. At charge 20 the same formula gives R = 125px.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/deep-lure.js --chapter deep \
//     --url 'http://127.0.0.1:5417/?lureCharge=20&lureRanges=90,180,300,420' --out /tmp/lure-low
const q = new URLSearchParams(location.search)
const CHARGE = Number(q.get('lureCharge') || 100)
const RANGES = (q.get('lureRanges') || '230,380,520,720').split(',').map(Number)

run.weapons = [{ id: 'finHit', level: 5 }]
H.breed(RANGES.length)
const crowd = H.keep(RANGES.length)

const anglers = []
for (let i = 0; i < RANGES.length; i++) {
  const e = crowd[i]
  if (!e) continue
  e.flags = ['angler', 'unshakeable']
  e.rosterId = 'anglerfish'
  // AND ITS SIZE. H.breed hands back whatever the chapter spawned, so re-flagging a hagfish gives a
  // 16px "anglerfish" and the frame silently understates the animal by 4x. The roster is
  // ENEMIES.drone.radius(16) x radiusMul(4); the scene sandbox has no config import, hence the
  // literal, same as the charge below. syncEnemies scales the sprite by e.radius / look.baseR, so
  // this is the whole of the size — there is no second drawing knob to set.
  // `?lureR=N` overrides it, which is how the SIZE itself gets A/B'd: one boot per candidate on an
  // otherwise identical frame, with no config edit between shots. radiusMul 3/4/6 = 48/64/96.
  e.radius = Number(q.get('lureR') || 64)
  e.gape = 0.45          // mouths part-open, so the gape tell is in frame at every range too
  anglers.push(e)
}

run.charge = CHARGE      // the bar the frame is judged at (see lureCharge above)

// Straight up the screen, so one column of frames reads as a distance ladder. Positions go through
// H.place and never by writing e.x/e.y — H.pin() restores _fx/_fy, which only H.place sets.
const layout = () => {
  H.place((i, p) => ({ x: p.x + (i % 2 ? 60 : -60), y: p.y - RANGES[i] }))
  anglers.forEach((e) => { e.gape = 0.45 })
}
layout()

H.note(`${run.chapter} charge=${Math.round(run.charge)} ranges=${RANGES.join('/')} ` +
  `anglers=${anglers.length} r=${Math.round(anglers[0]?.radius ?? 0)} viewR=${Math.round(run.viewRadius)}`)

return () => {
  layout()
  for (const e of crowd) e.hitFlash = 0
  run.player.invuln = 0
  run.charge = CHARGE
  H.pin()
  H.tickFx(1 / 60)
}
