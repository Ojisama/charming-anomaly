// Scene: Bilge with Trailing Slick, swum in a LINE and in an ARC. Since v7.x the trail is laid by
// distance travelled rather than on the cast timer, and the whole question these frames answer is
// whether the chain reads as one continuous film or as a row of puddles.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/bilge-trail.js --chapter wreck \
//     --url http://127.0.0.1:5211/ --out /tmp/trail --frames 6
//
// `turn` is the arc's rate in rad/s: 0 draws a straight line. Set it from the query string so the
// two shots are the same file — ?fxturn=1.22 gives a ~180px radius, which fits a phone viewport.
const turn = Number(new URLSearchParams(location.search).get('fxturn') || 0)

// L1 deliberately: the smallest pools the card ever lays, so it is the hardest case for continuity.
run.weapons = [{ id: 'bilge', level: 1 }]
run.weaponMods.bilge = { slickTrail: 1 }
// A crowd on the floor for scale, and because prey refusing to cross the oil is half the card.
H.breed(18)

// SWIM. H.tick drives a zero input, so the player would never move and the trail would never lay —
// the step function is called directly here for that reason. Events are dropped exactly as
// H.tick does, or the final render arrives buried under the whole warm-up.
const DT = 1 / 60
const FRAMES = 120   // ~440px of travel: the whole ribbon stays inside a phone's half-diagonal
for (let i = 0; i < FRAMES; i++) {
  const a = turn * i * DT
  step(run, { x: Math.cos(a), y: Math.sin(a) }, DT)
  run.events.length = 0
  run.player.hp = run.player.maxHP
}

const chain = run.blooms.filter((b) => b.look === 'bilge')
let worst = 0
for (let k = 1; k < chain.length; k++) {
  const g = Math.hypot(chain[k].x - chain[k - 1].x, chain[k].y - chain[k - 1].y) / (chain[k].r + chain[k - 1].r)
  if (g > worst) worst = g
}
H.note(JSON.stringify({ turn, pools: chain.length, r: Math.round(chain[0]?.r ?? 0), worstJoinPctOfRadii: Math.round(worst * 100) }))

// The chain is static once laid, so every frame would be identical; the scrub keeps swimming
// instead, which is also the only way to see whether the head of the trail keeps up with the
// player. H.render() is mandatory — fx-probe screenshots without rendering between scrub calls.
return () => {
  for (let i = 0; i < 8; i++) {
    const a = turn * (FRAMES + i) * DT
    step(run, { x: Math.cos(a), y: Math.sin(a) }, DT)
    run.events.length = 0
    run.player.hp = run.player.maxHP
  }
  H.render()
}
