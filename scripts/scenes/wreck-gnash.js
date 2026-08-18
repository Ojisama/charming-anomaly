// Scene: GNASH, The Wreck's native — does the bite read as a MOUTH CLOSING?
//
//   npx vite --port 5203 --strictPort &
//   node scripts/fx-probe.mjs --scene scripts/scenes/wreck-gnash.js --out /tmp/gn --frames 6 \
//     --chapter wreck --url 'http://127.0.0.1:5203/'
//
// ⚠ H.tickFx, NOT H.tick. The whole of this weapon's output is a `{type:'gnash'}` EVENT — it spawns
// no entity in any run.* array — and handleEvents is the only thing that creates the drawing. A
// scene built on H.tick syncs with a hardcoded [], so the event never reaches the renderer and every
// frame comes back with no bite in it AND NO ERROR, which is indistinguishable from "the effect is
// invisible". v7.27 shipped a claim about the roar's appearance off exactly such a frame, and run
// PB7 caught the same weapon from the other side on the day it landed.
//
// WHAT IS BEING JUDGED, and it is a comparison rather than a look: gnash shares the claw rake's pool
// and its baked gash, and differs only by the BITE_* tables — two arcs at one reach closing onto the
// bearing, against three at staggered reaches splaying outward. If those two read the same on
// screen then the tables are not earning their keep and the weapon is a re-tinted rake. So the
// frames alternate: bite, bite, bite, then the RAKE for comparison in the same fixture.
//
// The cast is pinned in a forward arc at the falloff's two ends — one body at the jaw, one at the
// tip — so the frame also shows whether the drawn wedge agrees with the sector the sim tests.
const p = run.player
p.hp = p.maxHP = 99999

H.note('frames: 1-4 gnash closing | 5-6 clawRake, same fixture, for comparison')

H.breed(6)
const crowd = H.keep(3)
H.weapon('gnash', 5)

// A fan in FRONT of the player. aimAngle picks the nearest body, so the whole cast sits inside the
// bite's own wedge and the drawing has something to be measured against.
// THREE bodies, not twelve, and that is a legibility decision about the FRAME rather than about the
// weapon: every landed hit throws a damage number, and twelve of them at this cadence buried the
// drawing under a wall of orange digits — the documented "final sync handed the whole warm-up's
// events" trap, arrived at from the other direction. Three still spans the wedge.
H.place((i, pl) => {
  const a = (i / 3 - 0.5) * 0.9
  const r = 46 + i * 24
  return { x: pl.x + Math.cos(a) * r, y: pl.y + Math.sin(a) * r }
})

let i = 0
return () => {
  run.gems.length = 0
  run.coins.length = 0
  p.hitFlash = 0
  H.pin()
  if (i === 4) H.weapon('clawRake', 5)
  // Step until the weapon actually fires, forwarding events, so every captured frame has a cast in
  // it rather than whatever phase the fixed cadence happened to land on.
  let fired = false
  for (let k = 0; k < 240 && !fired; k++) {
    const evs = H.tickFx(1 / 60)
    H.pin()
    p.hitFlash = 0
    fired = evs.some((e) => e.type === 'gnash' || e.type === 'clawRake')
  }
  if (!fired) H.note(`frame ${i}: THE WEAPON NEVER FIRED — the frame below proves nothing`)
  i++
}
