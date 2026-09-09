// Scene: a Glint cast INTO THE DARK — sparks leaving the player toward a crowd that is past the
// lamp, on the bar the chapter is actually played on (20/100).
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/deep-glint-dark.js --chapter deep --out /tmp/gd
//
// deep-glint.js asks the COLOUR question at half a bar with the crowd 110px out — inside the lamp,
// where nothing is multiplied down. This asks the one that scene cannot: owner, from play, "the
// glint itself is not visible enough". A spark is drawn inside `world` and the dark is a MULTIPLY
// scrim on the stage above it, so at 20/100 the lamp reaches ~125px on a phone and every spark past
// that is multiplied toward the chapter's tint. The pair is deep-foxfire.js / deep-foxfire-dark.js
// by design: same effect, same question, one frame inside the light and one outside it.
//
// run.shafts is emptied so no maw's LURE_GLOW lights the corridor the sparks fly down, and
// run.sightCharge is set beside run.charge — updateDark reads `run.sightCharge ?? run.charge`, and a
// scene that sets only the latter renders at a near-full lamp while claiming a dark one.
const CHARGE = 20
const AT = 300   // crowd range: well past the ~125px lamp this bar buys on a phone

H.weapon('glint', 3)
H.breed(10)
const crowd = H.keep(10)
H.place((i, p) => ({ x: p.x + AT + (i % 3) * 30, y: p.y + ((i % 5) - 2) * 44 }))
run.shafts.length = 0
run.bullets.length = 0   // junk cast during the breed-up, aimed at bodies since discarded

run.charge = run.sightCharge = CHARGE
H.until(() => run.bullets.some((b) => b.weapon === 'glint'))
run.charge = run.sightCharge = CHARGE

H.note(`${run.chapter} charge=${CHARGE}/${run.chargeMax} crowd=${AT}px ` +
  `lampR=${Math.round(844 * (0.06 + 0.44 * CHARGE / 100))}px sparks=${run.bullets.length}`)

return () => {
  run.charge = run.sightCharge = CHARGE
  for (const e of crowd) e.hitFlash = 0
  for (let k = 0; k < 3; k++) H.tickFx(1 / 60)
  H.pin()
  H.render()
}
