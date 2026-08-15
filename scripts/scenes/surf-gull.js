// Scene: a gull strike hitting the water. The bird is a HAZARD, not an enemy — sim's stepGullStrike
// pushes a run.bombs entry with src:'gull' and render turns the detonation into the bird plus the
// splash — so the only way to shoot it on demand is to push that entry by hand.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/surf-gull.js --out /tmp/gu --frames 12 --chapter surf
//
// The two things it exists to check, both of which are about the WATER and neither of which a single
// frame can answer:
//   1. is the bird EXEMPT from the chapter's blue wash? It is above the surface, so it must keep its
//      own white while its shadow — cast on the sea floor, seen through the water — does not. The
//      bird and the shadow are the same texture, so any tint difference between them is the answer.
//   2. does the impact throw a splash: a crown, then rings spreading and slowing?
// Frame 0 is the moment of contact; the rings only exist across the sequence.

H.breed(10)
H.keep(10)

// Bodies well clear of the impact point — the splash rings have to be readable against plain floor,
// and a crowd standing in them is the one thing that would hide the rings' far edge.
H.place((i, p) => {
  const a = (i / 10) * Math.PI * 2
  return { x: p.x + Math.cos(a) * 420, y: p.y + Math.sin(a) * 420 }
})

// Drop the gull just off the player so both the bird and the player are in frame at a phone
// viewport. A fuse of one step means it detonates on the first captured frame rather than during the
// warm-up, where the burst would expire before anything was shot.
const px = run.player.x, py = run.player.y
run.bombs.length = 0
run.bombs.push({
  x: px + 150, y: py - 120,
  radius: 74, fuse: 1 / 60, duration: 1 / 60,
  dmg: 0,          // 0 so the cast survives the shot: a dead crowd is a different picture
  src: 'gull',
})

H.note(JSON.stringify({ bombs: run.bombs.length, at: [150, -120], radius: 74 }))

return () => {
  H.pin()
  H.tickFx(1 / 60)
}
