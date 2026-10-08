// Scene: THE SWEEP'S MOVEMENT, staged. One arm sweeps past the fish while the others have sunk away;
// render.js leaves its wake behind it (drawKrakenSweep, s.sweepArmI). STAGED: for comparing the
// two movements, NOT evidence about how the real fight reads.
//   ?mv=clock  pinned at the head (in view, at the top), turning round it like a clock hand
//   ?mv=wipe   lying straight across the whole screen, sliding sideways down it
//   ?mv=slap   a big backhand: cocks back up the left side, then swings across the whole screen
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/kraken-sweep-look.js --chapter kraken \
//        --difficulty 3 --frames 40 --url 'http://127.0.0.1:PORT/?mv=clock' --out /tmp/sw/f
const C = window.__cfg
const MV = new URLSearchParams(location.search).get('mv') || 'clock'
H.until(() => run.script.phase === 'boss' && run.krakenArms.length > 0, 8000)
run.krakenLesson = 0
for (let i = 0; i < 120; i++) { run.player.hp = run.player.maxHP; H.tick() }
const head = run.enemies.find((e) => e.rosterId === 'krakenHead' && !e._dead)
const live = run.krakenArms.filter((a) => !a.dead)
for (const a of live) { a.tele = 0; a.slamT = 0; a.gripT = 0; a.limpT = 0; a.coilArm = false }
run.script.coilT = 0
// the fish 250px straight below the head, so the head sits in the top of the frame
run.player.x = head.x; run.player.y = head.y + 250
const arm = live[0]
for (const a of live) if (a !== arm) { a.dead = true; a.breakT = 0 }
run.enemies = run.enemies.filter((e) => e.rosterId === 'krakenHead' || e.rosterId === 'krakenArm')
run.script.sweepArmI = arm.i
const RING = C.KRAKEN_RING_R, TIP_R = 540
function place(ang, tx, ty) {
  arm.ang = ang; arm.angNow = ang
  arm.lx0 = head.x + Math.cos(ang) * RING; arm.ly0 = head.y + Math.sin(ang) * RING
  arm.x = tx; arm.y = ty; arm.lx1 = tx; arm.ly1 = ty
}
// ?mv=slap: A BIG BACKHAND. Root fixed on the ring off the bottom-left of the screen; the limb cocks
// back up the left side and trembles (the tell), then swings round in one fast arc across the whole
// screen, and settles. The drawn tip lags the swing on its own easing, which is the whip.
const SL_ANG = 2.2, SL_L = 900, TH0 = -1.0, THC = -1.22, TH1 = 0.25
const slS = { x: head.x + Math.cos(SL_ANG) * RING, y: head.y + Math.sin(SL_ANG) * RING }
const ease = (u) => u * u * (3 - 2 * u)
function pose(age) {
  if (MV === 'slap') {
    let th
    if (age < 0.55) th = TH0 + (THC - TH0) * ease(age / 0.55) + 0.02 * Math.sin(age * 90)
    else if (age < 0.66) th = THC + (TH1 + 0.1 - THC) * ease((age - 0.55) / 0.11)
    else th = TH1 + 0.1 * (1 - ease(Math.min(1, (age - 0.66) / 0.2)))
    place(SL_ANG, slS.x + Math.cos(th) * SL_L, slS.y + Math.sin(th) * SL_L)
    // the wind-up's clock, so render lights the suckers like any other attack: the window (the
    // white flash) opens as the swing starts. 40 frames x 0.05s.
    const t = age * 39 * 0.05, swingAt = 0.55 * 39 * 0.05, win = C.krakenRung(run.difficulty).window
    arm.fuse = swingAt + win
    arm.tele = Math.max(0, arm.fuse - t)
  } else if (MV === 'wipe') {
    // a horizontal line, from just under the head down past the fish: shoulder on the ring at the
    // right, tip off the left of the screen
    const Y = head.y + 150 + age * 420, dy = Y - head.y
    const sx = head.x + Math.sqrt(RING * RING - dy * dy)
    place(Math.atan2(dy, sx - head.x), head.x - Math.sqrt(TIP_R * TIP_R - dy * dy), Y)
  } else {
    // round the head, tip just outside its mouth, passing the fish (straight below it)
    const A = Math.PI / 2 - 1.1 + age * 2.2, r = C.KRAKEN_HEAD_R + 30
    place(A, head.x + Math.cos(A) * r, head.y + Math.sin(A) * r)
  }
}
let first = true
return (age) => {
  pose(age)
  for (let i = 0; i < (first ? 240 : 6); i++) window.__renderer.sync(run, 1 / 120, [])
  first = false
  H.note('Sweep ?mv=' + MV)
  app.renderer.render(app.stage)
}
