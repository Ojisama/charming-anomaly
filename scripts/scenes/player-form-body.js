// Scene: the player's own chapter-specific body (playerForm — kaiju/worm/generic blob), held clean
// and idle with a forced facing, for judging the body art or A/B-ing it against a pre-change tree.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/player-form-body.js --chapter skies --out /tmp/sk --frames 3
//   node scripts/fx-probe.mjs --scene scripts/scenes/player-form-body.js --chapter surf  --out /tmp/su --frames 3
//
// Run the SAME scene file against two dev servers (one on the pre-refactor tree, one on the
// post-refactor tree) with `--chapter skies` and diff the frames by eye — that is the only thing
// that can catch a Pixi regression, since render.js is not importable by test/sim-test.js.
//
// A clean stage: the body is the one thing being judged, and a crowd standing on it (or a hit-flash
// pop, cleared every frame since spawning continues) makes the silhouette unreadable.
const p = run.player
p.hp = p.maxHP = 99999

const FACINGS = [null, 0, Math.PI / 2]   // idle (rig default) | facing east (+x) | facing south (+y)
let i = 0
H.note(run.chapter + ' — frames: idle | facing east | facing south')

return () => {
  run.enemies.length = 0
  run.gems.length = 0
  run.coins.length = 0
  p.hp = p.maxHP
  p.hitFlash = 0
  const f = FACINGS[Math.min(i, FACINGS.length - 1)]
  p.facingAngle = f
  p.moving = f !== null
  i++
  H.render()
}
