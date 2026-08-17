// Scene: The Deep's anglerfish maws — a refill circle that is an animal with its mouth open.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/deep-maw.js --chapter deep --out /tmp/maw --frames 1
//
// SHOOT IT AT BOTH VIEWPORTS (`--w 1280 --h 800`). This chapter's light is a multiple of the
// SCREEN'S LONGEST SIDE, so how much of a 200px-radius maw fits inside the lit disc is a different
// number on a phone and a desktop by construction. The phone is the one that has to work.
//
// ⚠ THE GAPE IS THE ONLY WARNING THE PLAYER GETS, so the frame has to show it at more than one
// value. A maw photographed at whatever gape it happened to be at says nothing about whether the
// tell READS — the question is whether "just arrived" and "about to be swallowed" are
// distinguishable at a glance, in the dark, which needs both in one image.
//
// `?mawCharge=N` sets the bar (and so the light radius); `?mawGapes=a,b,c` the row of gapes, where
// a value > 1 means SHUT (the spent state stepMaws leaves behind after it swallows you).
const q = new URLSearchParams(location.search)
const CHARGE = Number(q.get('mawCharge') || 55)
const GAPES = (q.get('mawGapes') || '0,0.55,1,2').split(',').map(Number)

run.weapons = [{ id: 'finHit', level: 5 }]
H.breed(6)
const crowd = H.keep(6)

// THE MAWS ARE BUILT BY HAND ONTO run.shafts, not waited for. streamShafts materialises them off
// the terrain seed wherever the player happens to be, and this frame needs a KNOWN row at KNOWN
// gapes — which no single moment of play would hold still. Everything else here is shipped code:
// the drawing reads sh.r/sh.gape/sh._shutT exactly as it does in a run.
const R = Number(q.get('mawR') || 200)
run.shafts.length = 0
GAPES.forEach((gp, i) => {
  run.shafts.push({
    x: run.player.x - 330 + i * 330, y: run.player.y - 300,
    bx: run.player.x - 330 + i * 330, by: run.player.y - 300,
    r: R, gape: Math.min(1, gp), _shutT: gp > 1 ? 3 : 0,
    phase: 0.6 + i * 1.4, _cell: 'probe' + i,
  })
})

run.charge = CHARGE

const layout = () => {
  // The crowd shoved well clear: this frame is about the maw, and a hagfish parked in one of them
  // is a different question (and one the chapter answers on its own).
  H.place((i, p) => ({ x: p.x - 240 + i * 96, y: p.y + 420 }))
}
layout()

H.note(`${run.chapter} charge=${Math.round(run.charge)} maws=${run.shafts.length} r=${R} ` +
  `gapes=${GAPES.join('/')} (>1 = shut) viewR=${Math.round(run.viewRadius)}`)

return () => {
  layout()
  for (const e of crowd) e.hitFlash = 0
  run.player.invuln = 0
  run.charge = CHARGE
  // stepMaws closes a mouth the player is not standing in, and streamShafts would drop a hand-made
  // shaft the moment the cell cursor moves. Both are the shipped code doing its job — this scene is
  // photographing a range of states that no single moment of play would hold.
  GAPES.forEach((gp, i) => {
    const sh = run.shafts[i]
    if (!sh) return
    sh.gape = Math.min(1, gp)
    sh._shutT = gp > 1 ? 3 : 0
  })
  H.pin()
  H.tickFx(1 / 60)
}
