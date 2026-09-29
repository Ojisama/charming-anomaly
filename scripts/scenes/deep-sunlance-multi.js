// Scene: FOUR big Sunlances at once (Twin Lance +3, Far Reach +100%), to judge SUNLANCE_GLOW when
// several overlap, at any bar: pass `?ch=<charge>` on the url (default 50).
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/deep-sunlance-multi.js --chapter deep --url 'http://127.0.0.1:PORT/?ch=10' --out /tmp/sm
//
// Every lance is held at mid-life so each frame has all of them at full strength.
const CHARGE = Number(new URLSearchParams(location.search).get('ch') ?? 50)
H.weapon('sunlance', 5)
run.weaponMods.sunlance = { twinLance: 3, farReach: 1 }
H.breed(16)
const crowd = H.keep(16)
// four files of bodies, one per quadrant, so the four lances fan out instead of stacking
H.place((i, p) => {
  const a = (i % 4) * Math.PI / 2 + 0.5, d = 110 + Math.floor(i / 4) * 70
  return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d }
})
run.shafts.length = 0
run.beams.length = 0
run.weaponTimers.sunlance = 0
for (let i = 0; i < 900 && run.beams.filter((b) => b.look === 'sunlance').length < 4; i++) {
  run.charge = run.sightCharge = CHARGE; H.tick(1 / 60); H.pin()
}
const lances = run.beams.filter((b) => b.look === 'sunlance')
H.note(`charge=${CHARGE} lances=${lances.length} reach=${Math.round(lances[0]?.length ?? 0)} width=${Math.round(lances[0]?.width ?? 0)}`)
return () => {
  run.charge = run.sightCharge = CHARGE
  for (const l of lances) { l.life = l.duration * 0.5; if (!run.beams.includes(l)) run.beams.push(l) }
  for (const e of crowd) { e.hitFlash = 0; e.hp = e.maxHP }
  run.weaponTimers.sunlance = 99
  H.tickFx(1 / 60)
  for (const l of lances) l.life = l.duration * 0.5
  H.pin()
  H.render()
}
