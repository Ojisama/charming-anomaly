// Scene: a shoal half of which has been through the oil, next to a Bilge pool it is still crossing,
// with a Chum bait on the other side holding two fish head-down. Everything phase 2 of the herding
// rework added, in one frame, against the untouched half of the same shoal as the control.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/oil-stain.js --chapter wreck \
//     --url http://127.0.0.1:5211/ --out /tmp/stain --frames 5
//
// The scrub walks the stain from clean to saturated on the LEFT column only, so the right column is
// the same fish at the same instant with nothing done to it.
run.weapons = []
H.breed(20)
const cast = H.keep(20)

const p = run.player
// The oil the shoal is crossing. t past the grow ramp so it draws at its full radius immediately —
// stepBlooms rewrites bl.r from bl.t, and a hand-built pool at t: 0 is a point.
run.blooms.push({
  x: p.x - 40, y: p.y + 130, r: 150, maxR: 150, t: 100, dur: 200,
  dmgPerTick: 0, tick: 0, look: 'bilge', slow: 1, shape: 2, rot: 0.7,
})
// And a bait, with two fish on it, so the head-down hold is in the same shot.
const bait = {
  x: p.x + 150, y: p.y - 130, t: 1, dur: 9999, aggro: 240, burstR: 0, burstDmg: 0,
  bait: true, food: 6, food0: 9, shape: 4, rot: 1.2,
}
run.lures = [bait]

// THE FEEDING PAIR HAS TO BE THE SAME CREATURE, or the frame compares two species rather than two
// states. First matching rosterId in the cast wins; if the roll gives none, the first two are used
// and the note says so — a probe that silently compared a mackerel with a copepod would read as
// "the pose does nothing".
// An ELONGATED body first: foreshortening is a change of length, so a round creature (the puffer)
// states it far worse than a mackerel does, and the frame exists to show the tell at its clearest.
let a = cast[0], b = cast[1], paired = false
for (const want of ['mackerel', 'sardine', 'damselfish', null]) {
  for (let i = 0; i < cast.length && !paired; i++) {
    for (let j = i + 1; j < cast.length; j++) {
      const id = cast[i].rosterId
      if (!id || id !== cast[j].rosterId) continue
      if (want && id !== want) continue
      a = cast[i]; b = cast[j]; paired = true; break
    }
  }
  if (paired) break
}
const feeding = a, free = b
const rest = cast.filter((e) => e !== a && e !== b)

// Held / free, side by side just under the bait and INSIDE CHUM_FEED_R of it, so the pose is being
// shown where it actually happens. Then two columns of the rest: left stained, right the control.
H.place((i, pl) => {
  const e = cast[i]
  if (e === feeding) return { x: bait.x - 34, y: bait.y + 74 }
  if (e === free) return { x: bait.x + 34, y: bait.y + 74 }
  const k = rest.indexOf(e)
  const col = k % 2
  const row = Math.floor(k / 2)
  return { x: pl.x - 90 + col * 180, y: pl.y - 40 + row * 46 }
})

const left = rest.filter((e, i) => i % 2 === 0)
const right = rest.filter((e, i) => i % 2 === 1)

H.note(JSON.stringify({ paired, pair: feeding.rosterId, left: left.length, right: right.length, baitFood: bait.food }))

return (age) => {
  for (const e of left) e.oiled = 0.2 * age
  for (const e of right) e.oiled = 0
  feeding.feedT = 9999
  free.feedT = 0
  H.pin()
  H.render()
}
