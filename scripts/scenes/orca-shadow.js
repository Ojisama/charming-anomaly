// Scene: The Wreck's OPENING SHADOW PASS — the harmless foreshadowing that runs three times before
// the first real visit. The thing to judge is that this reads as a shadow and NOT as the pre-strike
// rise: no surfaced body, no ring, deeper and fainter than the telegraph in scenes/orca.js.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/orca-shadow.js --chapter wreck \
//     --url http://127.0.0.1:PORT/ --out /tmp/orca-shadow --frames 9
//
// Forced rather than waited for, exactly as scenes/orca.js is: the first pass is ORCA_SHADOW_FIRST
// (28s) away and driving 28s of sim to see a sprite measures the spawner, not the drawing. The
// object below is the shape stepOrca's `shadow` branch writes.

// A shoal to pass under, since half the point of the pass is that it breaks the ball up.
H.breed(26)
H.keep(26)
H.place((i, p) => ({
  x: p.x + Math.cos(i * 2.399963) * (50 + (i % 5) * 30),
  y: p.y + Math.sin(i * 2.399963) * (50 + (i % 5) * 30),
}))

const p = run.player
// The pass's reach is the VIEW's half-diagonal plus ORCA_SHADOW_MARGIN, exactly as stepOrca
// derives it — a world literal here would put the shadow on-screen at spawn on a desktop viewport
// and this scene would then be shooting a look the game never produces.
const RANGE = run.viewRadius + 240
const DUR = 2.6

run.orca = {
  state: 'shadow',
  t: DUR,
  cx: p.x, cy: p.y,
  r: 300,
  ang: 0,
  x: p.x - RANGE, y: p.y,
  dirX: 1, dirY: 0,
  hit: false, alpha: 0,
}

H.note(JSON.stringify({ state: run.orca.state, prey: run.enemies.length, chapter: run.chapter }))

// Walk the pass across the frames: entry fade, straight under the player, exit fade. The alpha ramp
// is stepOrca's own arithmetic, restated here because the probe never calls it.
//
// ⚠ THE SCRUB MUST RENDER ITSELF. fx-probe's capture loop calls __fxScrub(k) and then screenshots —
// it does not render in between. A scrub that only mutates state hands back N IDENTICAL frames of
// whatever the last H.render() drew, which looks exactly like "the effect never appears".
return (k) => {
  const o = run.orca
  if (!o) return
  o.t = DUR * (1 - k)
  o.x = p.x - RANGE + (RANGE * 2) * k
  o.y = p.y
  o.cx = o.x; o.cy = o.y
  o.alpha = Math.min(1, Math.max(0, o.t) / 0.5, (DUR - o.t) / 0.5)
  H.render()
}
