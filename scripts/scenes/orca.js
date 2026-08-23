// Scene: The Wreck's orca, mid-visit. Shoots the two states that actually have to be judged —
// the RISING shadow (the telegraph) and the CIRCLING animal inside its closing ring.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/orca.js --chapter wreck \
//     --url http://127.0.0.1:PORT/ --out /tmp/orca --frames 8
//
// The visit is forced rather than waited for: stepOrca does not spawn one until ORCA_FIRST_PASS
// (100s), and driving 100s of sim to see a sprite is a probe that measures the spawner instead of
// the drawing. Building run.orca by hand is the same shape stepOrca writes.

// A shoal to judge the ring against — an empty ocean cannot show whether the wall reads as a wall.
H.breed(26)
H.keep(26)
H.place((i, p) => ({
  x: p.x + Math.cos(i * 2.399963) * (60 + (i % 5) * 34),
  y: p.y + Math.sin(i * 2.399963) * (60 + (i % 5) * 34),
}))

const p = run.player

// CIRCLING: the animal has surfaced and the ring is most of the way closed. t is set so the tell
// is near its brightest without being at the instant it commits, which is the frame a player
// actually has to read and act on.
run.orca = {
  state: 'circling',
  t: 1.2,
  cx: p.x, cy: p.y,
  r: 210,
  ang: -0.6,
  x: p.x + Math.cos(-0.6) * 210,
  y: p.y + Math.sin(-0.6) * 210,
  dirX: 0, dirY: 0, hit: false, alpha: 1,
}

H.note(JSON.stringify({
  state: run.orca.state,
  ringR: run.orca.r,
  prey: run.enemies.length,
  chapter: run.chapter,
}))

// Sweep the ring closed across the captured frames: r tightens and the tell brightens, which is
// the whole read. Returning a scrub gives the sequence without re-booting per frame.
return (k) => {
  const o = run.orca
  if (!o) return
  o.t = 1.6 - k * 1.4
  o.r = 300 + (165 - 300) * k
  o.ang = -0.6 + k * 1.9
  o.x = o.cx + Math.cos(o.ang) * o.r
  o.y = o.cy + Math.sin(o.ang) * o.r
}
