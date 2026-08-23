// Scene: the orca held CLOSE and fully in frame, to judge the BAKE rather than the framing.
// Its sibling scene (orca.js) shoots the ring and the telegraph; this one exists because an animal
// cropped at the screen edge cannot tell you whether the drawing reads.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/orca-portrait.js --chapter wreck \
//     --url http://127.0.0.1:PORT/ --out /tmp/orcap --frames 1
const p = run.player
run.enemies.length = 0
run.orca = {
  state: 'circling', t: 2.0,
  cx: p.x, cy: p.y, r: 150, ang: 0,
  x: p.x + 150, y: p.y - 40,
  dirX: 1, dirY: 0, hit: false, alpha: 1,
}
H.note('orca portrait: len=220, judging the bake')
