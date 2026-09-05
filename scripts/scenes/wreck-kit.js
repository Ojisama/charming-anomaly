// Scene: THE WRECK'S HERDING KIT, and the thing that was drawn backwards.
//
//   npx vite --port 5211 --strictPort &
//   node scripts/fx-probe.mjs --scene scripts/scenes/wreck-kit.js --out /tmp/kit --frames 4 \
//     --chapter wreck --url 'http://127.0.0.1:5211/'
//
// ⚠ `--chapter wreck` IS NOT OPTIONAL AND ITS ABSENCE IS SILENT — fx-probe defaults to `city`,
// where none of these cards is in the pool and none of this chapter's creatures exists.
//
// WHAT EACH FRAME IS FOR:
//   1 WHICH WAY ARE THEY POINTING. The one that matters most, because it is the bug the owner
//     reported: bearing is derived from run.player, so a fleeing fish drew tail-first with its eyes
//     on the predator. A shoal is placed to one side and left to run — every fish should be nose-out.
//   2 CHUM. Does the bait read as offal in the water rather than as the Pheromone Lure's amber
//     beacon with two spinning stars, which is the same pooled entity underneath?
//   3 BILGE. Does the oil read as a dark iridescent film rather than as the pond's green toxin
//     cloud, which is the same pooled entity underneath?
//   4 BOTH AT ONCE, with the shoal between them — the play the kit exists for.
const p = run.player
p.hp = p.maxHP = 99999

H.note('frames: 1 which way do they point | 2 chum | 3 bilge | 4 the kit together')

H.breed(70)
const crowd = H.keep(60)

// A block of fish off to one side, so "which way is it pointing" has an unambiguous answer: they
// are to the player's RIGHT, so every nose should be pointing further right, away from the camera's
// centre. Placed rather than bred into a ring, because a ring has no wrong answer to look for.
// ⚠ EVERYTHING IS PLACED WELL INSIDE A 390px PHONE VIEWPORT. The first cut put the shoal at +260
// and the bait at +300, i.e. past the right edge from a centred player, and all three frames came
// back looking like the cards do nothing — which is the "scene that throws renders nothing" trap
// wearing its other hat.
const shoal = (pl) => (k) => ({
  x: pl.x + 90 + (k % 8) * 22,
  y: pl.y - 150 + Math.floor(k / 8) * 24,
})

let i = 0
return () => {
  run.gems.length = 0
  run.coins.length = 0
  run.lures.length = 0
  run.blooms.length = 0
  p.hitFlash = 0
  p.hp = p.maxHP

  H.place((k, pl) => shoal(pl)(k))
  if (i === 1 || i === 3) {
    run.lures.push({ x: p.x + 110, y: p.y + 40, t: 2, dur: 99, aggro: 320, burstR: 0, burstDmg: 0, bait: true })
  }
  if (i === 2 || i === 3) {
    // dur SHORT and t past its growth window: stepBlooms recomputes r from t/(dur*BLOOM_GROW_FRAC)
    // every frame, so a long dur keeps a freshly-pushed cloud at a ~10px dot forever and the frame
    // reads as "the oil does not draw".
    run.blooms.push({ x: p.x - 40, y: p.y + 190, t: 5, r: 150, maxR: 150, dur: 8, dmgPerTick: 0, tick: 0, look: 'bilge', slow: 1 })
  }
  // Let the shoal actually MOVE for a beat, so the published heading is real rather than whatever
  // the placement left behind — the facing is derived from the player unless a body publishes
  // its own heading into _tgtX/_tgtY.
  for (let k = 0; k < 20; k++) { H.tick(); for (const e of crowd) e.hitFlash = 0 }
  H.note(`f${i}: blooms=${run.blooms.length} bilge=${run.blooms.filter(b=>b.look==="bilge").map(b=>Math.round(b.r)).join(",")} lures=${run.lures.length} slicks=${run.slicks.length}`)
  i++
  H.render()
}
