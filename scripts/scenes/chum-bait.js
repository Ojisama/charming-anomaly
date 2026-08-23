// Scene: one Chum bait with a shoal gathered on it, scrubbed from a FULL bucket down to a nearly
// stripped one. The servings are the card's mechanic since v7.x, so the frames have to answer one
// question — can you tell a full bait from an empty one at a glance?
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/chum-bait.js --chapter wreck \
//     --url http://127.0.0.1:5211/ --out /tmp/chum --frames 6
//
// frame 0 = full, last frame = one serving left.
H.weapon('chum', 3)
H.breed(26)
H.keep(26)
H.until(() => run.lures.some((lu) => lu.bait))

const bait = run.lures.find((lu) => lu.bait)
// One bait, and no more casts: the shot is about ONE object's state, and a second cloud arriving
// mid-sequence would change what the frames are comparing.
run.lures = [bait]
run.weapons = []
bait.dur = 9999
bait.t = 1                       // past the 0.25s fade-in, so alpha is not part of the comparison
bait.x = run.player.x + 120
bait.y = run.player.y - 30

// The shoal, in a loose ball on the bait — the read has to hold against the creatures it sits
// among, not on empty floor.
H.place((i, p) => {
  const a = (i / 26) * Math.PI * 2 + (i % 3) * 0.4
  const d = 44 + (i % 4) * 24
  return { x: bait.x + Math.cos(a) * d, y: bait.y + Math.sin(a) * d }
})

const food0 = bait.food
H.note(JSON.stringify({ food0, aggro: bait.aggro, shape: bait.shape, crowd: run.enemies.length }))

// H.render() is MANDATORY in the scrub: fx-probe calls __fxScrub(k) and screenshots without
// rendering in between, so a scrub that only mutates state returns byte-identical frames — which
// reads as "the effect does not draw".
return (age) => {
  bait.food = Math.max(1, Math.round(food0 - (food0 - 1) * age))
  H.pin()
  H.render()
}
