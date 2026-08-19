// Scene: THE WATER MOVING, in a Book 2 chapter that is not The Surf.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/tide-flow.js --chapter wreck --out /tmp/tf --frames 8
//
// The tide runs in every Undertow chapter but The Reef since v7.x, and the render side of that is
// ONE line: flowKind used to be gated on `signature.type === 'tide'`, which only The Surf has. Six
// chapters would have been pushed by water with nothing on screen moving — the exact shape of the
// _elFrozen scar in CLAUDE.md, where a shipped mechanic had no tell and "cold does nothing" is what
// it looked like. A frame is the only thing that can prove the streaks are there, because the sim
// tests pass whichever way that line reads.
//
// What to look for:
//   1. ARE THERE STREAKS AT ALL? They are the pooled flow field (TIDE_VIS), pale blue dashes
//      drifting over the floor. None = the render gate is back on the signature.
//   2. Do they run along THIS chapter's bearing rather than The Surf's? Every chapter has its own
//      (the TIDE block in config.js) — The Wreck is 120 degrees, The Deep 150, The Surf 0.
//   3. Do they REVERSE across the sequence? The surge is a sine and the backwash is the tell that
//      this is weather rather than a one-way current. The frames span most of one 14s period.

// A small crowd, so the streaks are judged against the sprites they sit under rather than on an
// empty floor — and because stepTide moves the CROWD by the same vector, which is the whole reason
// the surge is meant to read as weather.
H.breed(9)
H.keep(9)
H.place((i, p) => {
  const a = (i / 9) * Math.PI * 2
  const r = 150 + (i % 3) * 70
  return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
})

const p0 = { x: run.player.x, y: run.player.y }
H.note(JSON.stringify({ chapter: run.chapter, realTime: run._realTime }))

// Walk _realTime across most of one tide period, so the sequence catches surge, slack water and
// backwash. run.time is deliberately untouched: stepTide reads _realTime (Time Debt would otherwise
// scale the surge), so that is the field which actually phases the sine. The player is re-pinned
// each frame because the tide has been moving them the whole time the crowd was being placed.
const PERIOD = 14
return (age) => {
  run._realTime = age * PERIOD * 0.9
  run.player.x = p0.x
  run.player.y = p0.y
  H.render()
}
