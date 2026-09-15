// Scene: the Coil winding up (P3, D3 only) — the one Kraken pattern with no parry, where the whole
// counterplay is reading the gap and moving into it. Runs in the page with (run, app, step, H).
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/kraken-coil.js --out /tmp/kc \
//        --chapter kraken --difficulty 3 --frames 1
//
// WHAT IS BEING JUDGED: can a player find the gap while the ring is rearing back, at a phone
// viewport, in a dark chapter. If this read fails the pattern is not hard, it is unfair.

H.until(() => run.script.phase === 'boss' && run.krakenArms.length > 0, 3000)
H.tick()
H.tick()

const s = run.script
const head = run.enemies.find((e) => e.rosterId === 'krakenHead' && !e._dead)
if (!head) throw new Error('no head on the field — the scene never reached a ring block')

// Put the gap somewhere the player is NOT, so the frame shows the move they have to make rather
// than the comfortable case where they happen to be standing in it already.
// THE COIL IS A VOLLEY NOW, not a ring hauling in: every live arm rears except one and they land
// together, and the spared arm's lane IS the gap. So the scene has to compose the ARMS, not just the
// clock — forcing s.coilT alone leaves six ordinary arms standing there and the frame shows nothing.
const cfg = window.__cfg
const live = run.krakenArms.filter((a) => !a.dead)
// spare the arm furthest from the player, so the frame shows the move they have to make rather than
// the comfortable case where they are already standing in the gap
let spare = live[0], far = -1
for (const a of live) {
  const d = Math.hypot(a.x - run.player.x, a.y - run.player.y)
  if (d > far) { far = d; spare = a }
}
for (const a of live) {
  a.coilArm = a !== spare
  a.tele = a === spare ? 0 : (window.__coilShut ? 0.08 : 1.1)
  a.fuse = cfg.KRAKEN_COIL_TELE
  a.open = false
}
s.coilGap = spare.ang
s.coilT = (window.__coilShut ? 0.45 : 1.4)
run.player.x = head.x + 40
run.player.y = head.y + 30

H.note(JSON.stringify({
  phase: s.phase, coilT: +s.coilT.toFixed(2), gapDeg: Math.round((s.coilGap * 180) / Math.PI),
  arms: run.krakenArms.length, armsTotal: s.armsTotal,
  volley: run.krakenArms.filter((a) => a.coilArm).length, spared: 1,
}))

// Tick so the ring actually hauls in (the reach follows coilT), then render. Interleaved because
// the arms' positions are stepped by the sim, not by the renderer.
return (age) => {
  for (let i = 0; i < 2; i++) { H.tick(); }
  H.render()
}
