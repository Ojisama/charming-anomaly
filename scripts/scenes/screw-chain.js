// Scene: THE SCREW, swum in a LINE and in an ARC. The card's whole premise is that the chain goes
// taut behind you and swings wide through a turn, so a straight-line frame alone would show the one
// pose that says nothing — the two shots together are the argument.
//
//   npx vite --port 5211 --strictPort
//   node scripts/fx-probe.mjs --scene scripts/scenes/screw-chain.js --chapter wreck \
//     --url 'http://127.0.0.1:5211/?fxturn=0'    --out /tmp/screw-line --frames 6
//   node scripts/fx-probe.mjs --scene scripts/scenes/screw-chain.js --chapter wreck \
//     --url 'http://127.0.0.1:5211/?fxturn=1.22' --out /tmp/screw-arc  --frames 6
//
// `turn` is the arc's rate in rad/s: 0 draws a straight line, and 1.22 a ~180px radius that fits a
// phone viewport. Same file for both shots, exactly as bilge-trail.js does it.
const turn = Number(new URLSearchParams(location.search).get('fxturn') || 0)
// Twin Screw off by default so the base card is what is judged; ?fxtwin=1 hangs the second one.
const twin = Number(new URLSearchParams(location.search).get('fxtwin') || 0)

// L5, because the bake is judged at the LARGEST size it ever draws — a sprite that reads at 48px
// and falls apart at 34 is a bake problem, and shooting the small one first hides it.
run.weapons = [{ id: 'screw', level: 5 }]
run.weaponMods.screw = twin ? { twinScrew: 1 } : {}
// A crowd for scale and for the floor to have something on it besides silt.
H.breed(18)

// SWIM. H.tick drives a zero input, so the player would never move and the chain would never go
// taut — the step function is called directly for that reason, exactly as the bilge trail does.
const DT = 1 / 60
const FRAMES = 120
for (let i = 0; i < FRAMES; i++) {
  const a = turn * i * DT
  step(run, { x: Math.cos(a), y: Math.sin(a) }, DT)
  run.events.length = 0
  run.player.hp = run.player.maxHP
  // The crowd is scenery here: a body that dies mid-warm-up leaves a gap in the frame, and a
  // pinned cast struck every frame never stops flashing white over the thing being judged.
  for (const e of run.enemies) { e.hp = e.maxHP; e.hitFlash = 0 }
}
run.player.invuln = 0

const p = run.player
H.note(JSON.stringify({
  turn,
  screws: run.screws.length,
  chainPx: run.screws.map((s) => Math.round(Math.hypot(s.x - p.x, s.y - p.y))),
  bladeR: Math.round(run.screws[0]?.r ?? 0),
}))

// Keep swimming between captures: the pose IS the subject, and a still frame cannot show whether
// the chain stays taut or the blade turns. H.render() is mandatory — fx-probe screenshots without
// rendering between scrub calls.
return () => {
  for (let i = 0; i < 8; i++) {
    const a = turn * (FRAMES + i) * DT
    step(run, { x: Math.cos(a), y: Math.sin(a) }, DT)
    run.events.length = 0
    run.player.hp = run.player.maxHP
    for (const e of run.enemies) { e.hp = e.maxHP; e.hitFlash = 0 }
  }
  run.player.invuln = 0
  H.render()
}
