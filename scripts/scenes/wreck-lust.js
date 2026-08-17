// Scene: The Wreck's Bloodlust wash across the bar, plus berserk for comparison.
//
//   npx vite --port 5203 --strictPort &
//   node scripts/fx-probe.mjs --scene scripts/scenes/wreck-lust.js --out /tmp/lust --frames 5 \
//     --chapter wreck --url 'http://127.0.0.1:5203/'
//
// ⚠ `--chapter wreck` IS NOT OPTIONAL AND ITS ABSENCE IS SILENT. fx-probe defaults to `city`, where
// chapterRender.lustTell is undefined and run.charge/chargeMax are both 0 — so playerBuffs returns
// null, pHot.alpha is 0, and all five frames come back as a City player with no wash whatsoever.
// That reads as "the tell is invisible", which is a conclusion about this chapter drawn from a
// picture of a different one. The header of this file shipped without the flag for one commit.
//
// FIVE FRAMES, AND THE FIRST AND LAST ARE THE CONTROLS. This chapter's bar drives damage and fire
// rate, which are invisible on screen by construction — the owner picked that over visible growth,
// so the wash is the ONLY thing telling the player which state they are in. "Is it readable" is a
// judgement about the DISTANCE between bar levels, so a sheet of full-bar tiles cannot answer it;
// every one of them looks red next to nothing. Hence 0 / 50 / 100 in a row.
//
// The last frame is BERSERK at full over an empty bar, because the design claim is that bloodlust
// is capped BELOW berserk so a berserk window still reads as the berserk. That claim is about two
// reds next to each other and can only be checked by putting them next to each other.
//
// A scene file is executed as a function body and cannot import, so BERSERK_DURATION (5) is
// hardcoded here purely to synthesise the 0..1 the renderer reads.
const BERSERK = 5

const p = run.player
p.hp = p.maxHP = 99999

const STOPS = [0, 0.5, 1]
let i = 0
H.note('frames: bar 0 | bar 50 | bar 100 | bar 100 + berserk | bar 0 + berserk')

return () => {
  run.enemies.length = 0
  run.gems.length = 0
  run.coins.length = 0
  // A pinned cast being struck every frame never stops flashing, and a flashing player is a WHITE
  // silhouette that hides the wash completely — the documented trap for judging anything drawn over
  // the player.
  p.hitFlash = 0
  p.hp = p.maxHP
  if (i < STOPS.length) {
    run.charge = run.chargeMax * STOPS[i]
    run._berserkT = 0
  } else {
    // The two-reds comparison. Same berserk, opposite ends of the bar.
    run.charge = run.chargeMax * (i === STOPS.length ? 1 : 0)
    run._berserkT = BERSERK
  }
  i++
  H.render()
}
