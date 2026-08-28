// Scene: The Reef's RAM — a dash through the crowd, and the +10 it pays (v7.x).
// Runs in the page with (run, app, step, H) in scope; see fx-probe.mjs.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-ram.js --out /tmp/ram \
//     --chapter reef --frames 6 --w 390 --h 844 --url http://127.0.0.1:PORT/
//
// WHAT THESE FRAMES ARE FOR, and it is not "does the ram work" — run RF.g answers that, headlessly
// and in both directions. The only thing a shot can answer is whether the PAYOUT is legible: every
// coin in this game was worth 1 until BURST_RAM_COINS, and a coin worth ten draws exactly the same
// sparkle as a coin worth one. The number floating off the pickup is the whole of the difference,
// so the question each frame has to settle is: can you read +10 off it, at the size it ships?
//
// ⚠ H.tickFx, NEVER H.tick. The number is spawned by the {type:'coin'} EVENT — handleEvents is the
// only thing that creates it — and H.tick drops the frame's events on the floor. A scene built on
// tick() shoots a frame with no number and no error, which is indistinguishable from a tell that
// does not draw. Same trap reef-cutback.js and reef-impact.js document.
//
// ⚠ AND THE DASH IS ARMED BY HAND. H.tick/H.tickFx step with a hardcoded { x: 0, y: 0 } and no
// `skill`, so the button can never be pressed from a scene. run._burstT IS the dash as far as
// stepRam is concerned (it reads nothing else), so setting it directly is the shipped path rather
// than a simulation of it.

H.tick()
H.clean()

// Drive for a second so the player has a heading to plant the crowd along: at t=0 the circuit has
// no _headX/_headY worth reading, and bodies laid out on a stale heading are simply not in front.
for (let i = 0; i < 60; i++) H.tick()

// Real bred enemies rather than hand-rolled objects — they carry the roster's own look, so the
// frame before they die is the chapter's actual crowd and not a placeholder blob.
H.breed(6)
const cast = H.keep(6)
const hx = run._headX ?? 1
const hy = run._headY ?? 0
H.place((i, p) => ({ x: p.x + hx * (24 + i * 16), y: p.y + hy * (24 + i * 16), hp: 40 }))

let frame = 0
let paid = 0
return () => {
  if (frame === 0) {
    // Arm the dash and run until a coin worth more than one has been COLLECTED. The kill is not the
    // moment worth shooting — the corpse burst is the ordinary kill vocabulary, already shipped —
    // the pickup is, because that is where the number is spawned.
    run._burstT = 0.75
    for (let i = 0; i < 120 && !paid; i++) {
      for (const e of H.tickFx()) if (e.type === 'coin' && e.value > 1) paid = e.value
    }
    H.note(JSON.stringify({ chapter: run.chapter, cast: cast.length, paid, dead: cast.filter((e) => e._dead).length }))
  } else {
    // Let the number rise and fade. One frame apart is useless: it drifts a couple of pixels and
    // every shot looks like the last.
    H.tickFx(); H.tickFx(); H.tickFx()
  }
  frame++
  H.render()
}
