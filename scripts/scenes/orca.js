// Scene: The Wreck's orca stalking — the SHADOW spiralling in from underneath, which is the whole
// tension beat (owner ruling 2026-08-23: "a moment of tension build-up, like in jaws or whatever,
// where the SHADOW IS SPIRALING IN FROM UNDERNEATH, just before the impact/attack").
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/orca.js --chapter wreck \
//     --url http://127.0.0.1:PORT/ --out /tmp/orca --frames 10 --w 1400 --h 900
//
// The visit is forced rather than waited for: stepOrca does not spawn one until ORCA_FIRST_PASS
// (100s), and driving 100s of sim to see a telegraph is a probe that measures the spawner instead
// of the drawing. Building run.orca by hand is the same shape stepOrca writes.
//
// ⚠ THE SCRUB STEPS REAL SIM TIME, and since v7.x that is load-bearing rather than tidy. The coil
// render strokes is `run.orca.trail`, which stepOrca appends to once per frame — pose r/ang by hand
// (as this scene used to) and the trail stays EMPTY, so the one thing the scene exists to judge is
// invisible and the frame looks exactly like the bug it was written to prove fixed.

// A shoal to judge the ring against — an empty ocean cannot show whether the wall reads as a wall.
H.breed(26)
H.keep(26)
H.place((i, p) => ({
  x: p.x + Math.cos(i * 2.399963) * (70 + (i % 5) * 40),
  y: p.y + Math.sin(i * 2.399963) * (70 + (i % 5) * 40),
}))

const p = run.player

// Starts at the top of the ladder — the silhouette fading up out of the deep — so the captured
// sequence walks the whole build: rise, two tightening laps, then the body surfacing on the strike.
run.orca = {
  state: 'rising',
  t: 1.5,                      // ORCA_RISE_DUR; config owns the real one, this only seeds the pose
  cx: p.x, cy: p.y,
  r: 440, ang: -0.6,
  x: p.x + Math.cos(-0.6) * 440,
  y: p.y + Math.sin(-0.6) * 440,
  dirX: 0, dirY: 0, hit: false, alpha: 0, passes: 1,
}

H.note(JSON.stringify({ state: run.orca.state, prey: run.enemies.length, chapter: run.chapter }))

// Real frames from where the last call stopped — the probe calls the scrub with a rising k, so this
// is a play-through of the telegraph rather than a seek. 5.5s covers rise + spiral + the commit.
let seen = 0
return (k) => {
  const want = Math.round(k * 330)
  while (seen < want) { H.tickFx(1 / 60); seen++ }
  H.render()
}
