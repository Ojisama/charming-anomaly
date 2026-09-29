// Scene: a Sunlance cast INTO THE DARK, to judge SUNLANCE_GLOW (the strip of lit water along it).
// Pair of deep-glint-dark.js: same bar (10/100), crowd strung out past the lamp along +y.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/deep-sunlance-dark.js --chapter deep --out /tmp/sd
//
// The lance is held at mid-life so every frame has it at full strength; `?tv=<lit>` overrides
// SUNLANCE_GLOW.lit for A/B shots.
const CHARGE = 10
H.weapon('sunlance', 5)
H.breed(12)
const crowd = H.keep(12)
H.place((i, p) => ({ x: p.x + ((i % 3) - 1) * 26, y: p.y + 90 + i * 40 }))
run.shafts.length = 0
run.beams.length = 0
run.charge = run.sightCharge = CHARGE
for (let i = 0; i < 900 && !run.beams.some((b) => b.look === 'sunlance'); i++) {
  run.charge = run.sightCharge = CHARGE; H.tick(1 / 60); H.pin()
}
const lance = run.beams.find((b) => b.look === 'sunlance')
H.note(`charge=${CHARGE} reach=${Math.round(lance?.length ?? 0)} width=${Math.round(lance?.width ?? 0)}`)
return () => {
  run.charge = run.sightCharge = CHARGE
  if (lance) { lance.life = lance.duration * 0.5; if (!run.beams.includes(lance)) run.beams.push(lance) }
  for (const e of crowd) { e.hitFlash = 0; e.hp = e.maxHP }
  run.weaponTimers.sunlance = 99
  H.tickFx(1 / 60)
  if (lance) lance.life = lance.duration * 0.5
  H.pin()
  H.render()
}
