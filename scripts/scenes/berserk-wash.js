// Scene: BERSERK's red wash alone, at full strength, for A/B-ing the ?bv candidates.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/berserk-wash.js --out /tmp/bv --frames 2 \
//     --url 'http://127.0.0.1:5199/?bv=3'
//
// Two frames, not one: frame 0 is the UNBUFFED body and frame 1 is the wash. "Too strong" is a
// judgement about the distance between them, so a sheet of buffed-only tiles cannot answer it —
// every candidate looks red next to nothing.
//
// BERSERK = 5 (config.js BERSERK_DURATION), hardcoded because a scene file is executed as a
// function body and cannot import. It only exists to synthesise the 0..1 the renderer reads.
const BERSERK = 5

run.anomalies = run.anomalies || {}
run.anomalies.berserk = true

const p = run.player
p.hp = p.maxHP = 99999

let i = 0
H.note('frames: unbuffed | berserk at full')

return () => {
  run.enemies.length = 0
  run.gems.length = 0
  run.coins.length = 0
  run._berserkT = (i++ === 0 ? 0 : BERSERK)
  p.hp = p.maxHP
  p.hitFlash = 0   // a flashing player is a white silhouette and hides the wash entirely
  H.render()
}
