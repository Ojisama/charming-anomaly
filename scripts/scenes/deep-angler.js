// Scene: The Deep's two tells on one frame — an anglerfish with its mouth part-open beside one
// about to bite, a pack marked by Scent, and the chapter's own dark closing in around all of it.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/deep-angler.js --chapter deep --out /tmp/dp --frames 3
//
// SHOOT IT AT BOTH VIEWPORTS (`--w 1280 --h 800` for the second). This chapter has a genuine
// screen-relative quantity in it — `resource.dark.radiusFull` is a multiple of the SCREEN'S LONGEST
// SIDE — so the amount of chapter a player can see is different on a phone and a desktop by
// construction, and the phone is the one that has to work. That is the trap v7.58 shipped with The
// Shelf's light: measured on a phone, where it was right, and wrong on a desktop.
//
// ⚠ THE GAPE IS THE ONLY THING THE PLAYER IS WARNED BY, so the frame has to show it at more than
// one value. A single anglerfish photographed at whatever gape it happened to be at says nothing
// about whether the tell READS — the question is whether "safe" and "about to bite" are
// distinguishable at a glance, in the dark, which needs both in one image.

run.weapons = [{ id: 'finHit', level: 5 }]
H.breed(14)
const crowd = H.keep(14)

// Everything after the breed, the ordering trawl-net.js documents: H.breed ticks the sim for
// hundreds of frames and anything placed before it has moved by capture time.

// A ROW OF ANGLERFISH AT RISING GAPES. Built by hand rather than by waiting for the chapter to
// spawn them — `gape` is a published field the sim owns, and the point of this frame is to compare
// the drawn tell across its whole range in one shot, which no single moment of play would give.
// Note this is the ONE thing here that is faked: everything else is the shipped code path.
const GAPES = [0, 0.3, 0.6, 0.9]
const anglers = []
for (let i = 0; i < GAPES.length; i++) {
  const e = crowd[i]
  if (!e) continue
  e.flags = ['angler', 'unshakeable']
  e.rosterId = 'anglerfish'
  e.gape = GAPES[i]
  anglers.push(e)
}

// A pack marked by Scent, pushed through the sim's own field rather than the event, so the drawn
// outline is read from exactly what dealDamage reads for the amp.
const marked = crowd.slice(4, 10)
for (const e of marked) e.scentT = 3

// Bar near full, so the light radius is at its widest and the frame is judgeable at all. At an
// empty bar this chapter is almost entirely black, which is correct and unphotographable.
run.charge = 92        // of a 100 max; the scene sandbox has no CHAPTERS import, hence the literal

const layout = () => {
  const p = run.player
  // The anglerfish in a row across the front, spaced wider than ANGLER_FEED_R so their gapes read
  // as four separate animals rather than as one cluster.
  anglers.forEach((e, i) => {
    e.x = p.x - 330 + i * 220
    e.y = p.y - 250
    e.gape = GAPES[i]          // re-pinned: stepAnglers closes a mouth whose player is not near it
  })
  marked.forEach((e, i) => {
    const a = (i / marked.length) * Math.PI * 2
    e.x = p.x + Math.cos(a) * 210
    e.y = p.y + 190 + Math.sin(a) * 110
    e.scentT = 3
  })
}
layout()

H.note(`${run.chapter} charge=${Math.round(run.charge)} gapes=${GAPES.join('/')} ` +
  `marked=${marked.length} viewR=${Math.round(run.viewRadius)} ` +
  `light radius = 0.62 x the screen's longest side at a full bar`)

return () => {
  layout()
  // A pinned cast being struck every frame never stops flashing, and a field of white silhouettes
  // cannot be judged against the tells drawn over it.
  for (const e of crowd) e.hitFlash = 0
  run.player.invuln = 0
  run.charge = 92        // of a 100 max; the scene sandbox has no CHAPTERS import, hence the literal
  H.pin()
  H.tickFx(1 / 60)
}
