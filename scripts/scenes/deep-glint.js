// Scene: The Deep's starter, Glint — darts of light leaving the player toward a crowd, at the bar
// the card is actually played on (half). Question: does a dart read as LIGHT against this floor,
// and not as Spike Protein's amber star?
//   node scripts/fx-probe.mjs --scene scripts/scenes/deep-glint.js --chapter deep --out /tmp/gl --frames 8
H.weapon('glint', 3)
H.breed(12)
const crowd = H.keep(12)
H.place((i, p) => ({ x: p.x + 110 + (i % 4) * 34, y: p.y + ((i % 3) - 1) * 40 + Math.floor(i / 4) * 12 }))
run.shafts.length = 0
run.charge = run.chargeMax * 0.5
// The weapon was equipped BEFORE H.breed, so it has been casting at whatever spawned during the
// long breed-up — bullets aimed at bodies keep() then discarded. Clear that junk so H.until below
// waits for a FRESH cast at the crowd actually placed above, not a stray already mid-flight to
// nowhere (a scene bug the brief's own literal script hits; deep-glint is not special-cased here).
run.bullets.length = 0
H.until(() => run.bullets.some((b) => b.weapon === 'glint'))
H.note([run.chapter, 'glint L3, bar 50%, darts=' + run.bullets.length].join(' '))
return () => { run.charge = run.chargeMax * 0.5; for (let k = 0; k < 3; k++) H.tickFx(1 / 60); H.pin(); H.render() }
