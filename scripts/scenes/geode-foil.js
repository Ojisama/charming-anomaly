// The Geode: the player parked on a crystal cavern's wall, for judging the foil pass against the
// cavern floor and the player's look over both. Staged (no crowd): a bake comparison, not evidence
// about a busy screen.
//   node scripts/fx-probe.mjs --scene scripts/scenes/geode-foil.js --chapter geode --url 'http://127.0.0.1:5412/?px=640&py=400&skin=cheeks&state=moving' --out /tmp/gf
// state: idle | moving | hurt
const qs = new URLSearchParams(location.search)
const px = Number(qs.get('px') ?? 640), py = Number(qs.get('py') ?? 400)
// skin=none | cheeks (the seeded save's own choice when absent)
if (qs.get('skin')) { run.skin = qs.get('skin') === 'none' ? null : qs.get('skin'); window.__renderer.reset(run) }
const p = run.player
p.hp = p.maxHP = 99999
const state = qs.get('state') ?? 'idle'
H.note('geode foil @ ' + px + ',' + py + ' skin=' + (run.skin ?? 'none') + ' state=' + state)
return () => {
  for (let i = 0; i < 8; i++) {
    H.tick()
    run.enemies.length = 0; run.gems.length = 0; run.coins.length = 0; run.bullets && (run.bullets.length = 0)
    p.x = px; p.y = py
    p.moving = state === 'moving'
    p.vx = p.moving ? 150 : 0; p.vy = 0
    p.facing = 1
    // hurt: the white pop (hit on the 6th of 8 frames); hurtfade: the red fade (hit on the 2nd)
    if ((state === 'hurt' && i === 5) || (state === 'hurtfade' && i === 1)) {
      // a full-size hit (>= 20% of maxHP), so the renderer gives it its full flash
      p.invuln = 0.6; p.hp = p.maxHP = 100
      window.__renderer.sync(run, 1 / 60, [{ type: 'hurt', dmg: 25, src: 'olm', x: px, y: py }])
    } else H.render()
  }
}
