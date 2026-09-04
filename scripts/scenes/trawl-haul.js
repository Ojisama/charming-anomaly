// Scene: Bring It In mid-reel — one catch on the cable being towed home through a crowd, which is
// the frame the corridor's wake has to be judged on. The plough damage has always happened in clear
// water; this scene exists to ask whether the drawing now says so.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/trawl-haul.js --chapter trawl \
//     --url 'http://127.0.0.1:5241/' --out /tmp/hw --frames 3
//
// SHOOT IT AT BOTH VIEWPORTS (`--w 1280 --h 800`). The wake's own geometry is world-space and
// screen-independent, but the CAST is not any more: the harpoon only hooks a body inside
// run.viewW/viewH now, so the catch's start distance is a fraction of the screen and the corridor
// it ploughs is much shorter on a phone than on a desktop. The composition below is therefore
// written in view half-extents, never in px.
//
// ⚠ THE CATCH IS SCRIPTED IN, FRAME BY FRAME. Left to the sim, a level-5 haul closes 610px/s and is
// landed and executed inside half a second — every capture after the first would be an empty frame,
// which photographs as "the wake does not draw". The closure below re-places the catch at a shrinking
// distance each frame, which is exactly what the reel does, only slow enough to see.

run.weapons = [{ id: 'bringItIn', level: 5 }]
H.breed(20)
const crowd = H.keep(20)

// Fire by TICKING, never by pushing onto run.hauls by hand: farthest-first, the on-screen gate and
// the elite/tank exclusions are the parts most likely to be wrong, and a hand-placed haul would
// photograph the composition as though it were the design.
let ticks = 0
while (run.hauls.length === 0 && ticks < 600) { H.tick(); ticks++ }
const template = run.hauls[0] ? { ...run.hauls[0] } : null
const catchE = template ? run.enemies.find((e) => e.id === template.eid) : null
// UNARM AFTER THE FIRST CAST. Left armed, the harpoon fires again during the captured frames and
// hooks one of the crowd bodies standing next to the player — and THAT haul's wake is what the
// sheet photographs, at the player's feet, while the composed one sits unhooked further out. The
// first cut of this scene shot exactly that and read as "the wake draws in the wrong place".
run.weapons = []
// ⚠ PIN THE HAUL BY ITS eid, NEVER BY run.hauls[0] OR BY A HELD REFERENCE. stepHauls REPLACES the
// array every frame (`run.hauls = run.hauls.filter(...)`), so a reference captured once goes on
// existing while no longer being in the array render walks — the scene then repositions an orphan
// and photographs a frame with no wake in it at all. Re-find it, and restore it if the sim dropped
// it (it does the moment the catch lands, which is every other frame at this travelSpeed).
const haul = () => {
  let hh = run.hauls.find((x) => x.eid === template.eid)
  if (!hh && template) { run.hauls.push({ ...template }); hh = run.hauls[run.hauls.length - 1] }
  return hh
}

// The tow runs along +y, down the screen: the longest axis of a portrait phone, so the corridor has
// somewhere to be. Written as a fraction of viewH for the reason in the header.
const REACH = () => run.viewH * 0.86
let f = 0

const layout = () => {
  if (!catchE) return
  const h = haul()
  if (!h) return
  // The catch, walked in from REACH to a third of it over the captured frames.
  const d = REACH() * (1 - f * 0.17)
  catchE.x = run.player.x
  catchE.y = run.player.y + d
  catchE.hp = catchE.maxHP           // never let it die and end the haul mid-sheet
  catchE._dead = false
  h.x = catchE.x; h.y = catchE.y
  h.snap = 0
  // The crowd IN and AROUND the corridor: half of them inside `width` of the tow line so the wake
  // has something to be pushing aside, half of them clear of it so the corridor's edge is legible.
  crowd.forEach((e, i) => {
    if (e === catchE) return
    const t = (i % 7) / 6                       // how far down the tow this body sits
    const inside = i % 2 === 0
    const across = (inside ? h.width * 0.75 : h.width * 2.1) * ((i % 4) < 2 ? 1 : -1)
    e.x = run.player.x + across
    e.y = run.player.y + d * t + (i % 3) * 14
    e.hitFlash = 0
  })
  run.player.invuln = 0
}
layout()

H.note(template
  ? `bring it in: catch at ${Math.round(REACH())}px (viewH ${Math.round(run.viewH)}), ` +
    `corridor half-width ${template.width}, crowd ${crowd.length}`
  : `NO HAUL AFTER ${ticks} TICKS — the harpoon never fired, so this frame proves nothing`)

return () => {
  f++
  layout()
  H.pin()
  // 0.05s a frame: the wake's phase is the catch's DISTANCE, so what advances it between captures is
  // the walk-in above, not the clock. The dt still has to be non-zero — animT freezes at 0 and the
  // floor and the crowd would photograph as a still.
  H.tickFx(0.05)
  layout()   // the tick reels it; put it back so the sheet steps evenly
  // ⚠ THE BIG RED BODY IN THE FRAME IS THE PLAYER, not the catch — Book 2 wears the cheeks skin, and
  // reading it as an enemy sent one round looking for the wake at the wrong end of the cable. The
  // catch is the small fish at the cable's FAR end, and the wake trails away from the player behind
  // it. Re-state the two positions in the caption so the next reader does not have to guess.
  H.note(`player=(${Math.round(run.player.x)},${Math.round(run.player.y)}) ` +
    `catch=(${Math.round(catchE.x)},${Math.round(catchE.y)}) hauls=${run.hauls.length}`)
}
