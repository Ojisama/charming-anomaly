// Scene: the BERSERK and STILLNESS player-skin tells (v7.14).
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/buff-skins.js --out /tmp/bs --frames 6
//
// Six frames, one per state, so the ladder can be read side by side. The change is deliberately
// subtle ("very subtle" was the brief), which means it can only be judged against the base frame —
// a single shot of the buffed player proves nothing, because there is nothing to compare it to.
// Frame 0 is always the untouched blob for exactly that reason.
//
// The two constants are hardcoded because a scene file is executed as a function body and cannot
// import: STILLNESS_RAMP = 2, BERSERK_DURATION = 5 (config.js). If either moves, the ramp values
// below stop meaning 0/50/100% — they are only used to synthesise the 0..1 the renderer reads.
const RAMP = 2
const BERSERK = 5

run.anomalies = run.anomalies || {}
run.anomalies.stillness = true
run.anomalies.berserk = true

// A clean stage: the tell is on the player's own body, and a crowd standing on it makes the
// silhouette unreadable. Enemies are cleared every frame, not once, because spawning continues.
const p = run.player
p.hp = p.maxHP = 99999

const STATES = [
  { still: 0,   berserk: 0 },   // base — the control
  { still: 0.5, berserk: 0 },
  { still: 1,   berserk: 0 },
  { still: 0,   berserk: 1 },   // the instant of the hit
  { still: 0,   berserk: 0.4 }, // most of the window burnt off
  { still: 1,   berserk: 1 },   // both at once
]

let i = 0
H.note('frames: base | still 50% | still 100% | berserk hit | berserk fading | both')

return () => {
  const st = STATES[Math.min(i++, STATES.length - 1)]
  run.enemies.length = 0
  run.gems.length = 0
  run.coins.length = 0
  run._stillT = st.still * RAMP
  run._berserkT = st.berserk * BERSERK
  p.hp = p.maxHP
  p.hitFlash = 0     // a flashing player renders as a white silhouette and hides both tells
  H.render()
}
