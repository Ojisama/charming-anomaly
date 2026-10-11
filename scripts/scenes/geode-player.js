// The Geode's player IN PLAY: a bot walks to a cavern edge (pale opal floor on one side, dark shard
// floor on the other) and kites back and forth across it with the chapter's own crowd and weapons
// live, then frames are captured on the move. Nothing about the player is hand-set but where it walks.
//   node scripts/fx-probe.mjs --scene scripts/scenes/geode-player.js --chapter geode --frames 4 \
//        --url 'http://127.0.0.1:5416/?ex=56&ey=-638&skin=cheeks&state=moving' --out /tmp/gp
// ex,ey: a point on a cavern edge (pale to the west, dark to the east; HOLO.cavernAt ~ 1 there).
// side: dark (default) | pale.  state: idle | moving | hurt (the white pop) | hurtfade (the red fade).  skin: none | cheeks.
// mini=1 turns on the MINIMES anomaly so the decoys are in the frame.
const qs = new URLSearchParams(location.search)
const ex = Number(qs.get('ex') ?? 56), ey = Number(qs.get('ey') ?? -638)
if (qs.get('skin')) { run.skin = qs.get('skin') === 'none' ? null : qs.get('skin'); window.__renderer.reset(run) }
if (qs.get('mini') === '1') run.anomalies.minimes = true
const state = qs.get('state') ?? 'moving'
// side: which floor the player is on when the frames are taken (the other is in view either way)
const side = qs.get('side') ?? 'dark', park = ex + (side === 'pale' ? -110 : 20)
const p = run.player
p.hp = p.maxHP = 99999
// one step of play toward (tx, ty); input is what the sim moves the player by
const walk = (tx, ty, dt = 1 / 60) => {
  const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy)
  step(run, d > 4 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 }, dt)
  run.events.length = 0
  p.hp = p.maxHP
}
// get there, then 25s of kiting across the edge so the crowd gathers round it
for (let i = 0; i < 3600 && Math.hypot(p.x - ex, p.y - ey) > 8; i++) walk(ex, ey)
let leg = 1
for (let i = 0; i < 1500; i++) {
  if (Math.abs(p.x - (ex + leg * 70)) < 8) leg = -leg
  walk(ex + leg * 70, ey + Math.sin(i / 90) * 30)
}
// park exactly on the seam, last leg heading east
for (let i = 0; i < 400 && Math.hypot(p.x - park, p.y - ey) > 6; i++) walk(park, ey)
H.note('geode player @ edge ' + ex + ',' + ey + ' skin=' + (run.skin ?? 'none') + ' side=' + side + ' state=' + state + ' minimes=' + !!run.anomalies.minimes + ' enemies=' + run.enemies.length)
let k = 0
return () => {
  // eight frames of play per capture; the player keeps crossing the seam unless idle
  for (let i = 0; i < 8; i++, k++) {
    const moving = state !== 'idle'
    const tx = moving ? park + 60 : p.x, ty = ey
    const dx = tx - p.x, d = Math.abs(dx)
    step(run, moving && d > 4 ? { x: Math.sign(dx), y: 0 } : { x: 0, y: 0 }, 1 / 60)
    const evs = run.events.splice(0).filter((e) => e.type !== 'hurt')
    p.hp = p.maxHP
    if ((state === 'hurt' && i === 5) || (state === 'hurtfade' && i === 1)) {
      p.invuln = 0.6; p.hp = p.maxHP = 100
      evs.push({ type: 'hurt', dmg: 25, src: 'olm', x: p.x, y: p.y })
    }
    window.__renderer.sync(run, 1 / 60, evs)
    if (state === 'hurt' || state === 'hurtfade') p.hp = p.maxHP = 99999
  }
  app.renderer.render(app.stage)
}
