// Scene: The Surf's FLOOR, with both of its circles in one frame — a sandbar (dry, bright, slows
// you, burns Humidity) and a tide pool (dark, wet, refills it). Nothing is cast; the subject is the
// ground itself.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/surf-floor.js --out /tmp/sf --frames 1 --chapter surf
//
// It exists to answer three things a gameplay screenshot answers badly, because a screenshot lands
// wherever the run happened to be:
//   1. do the two kinds of circle read as DIFFERENT ground, or as two shades of the same blob?
//   2. does either of them sit on top of the other? (They must not — see streamSandbars' block.)
//   3. how strong is the water wash before the sand stops reading as sand? Shoot it against
//      `?wa=<alpha>&wt=<hex>` to compare strengths on one identical frame.
//
// The hunt below is the whole scene. Both fields are streamed per cell from the run seed, so the
// spot where they are both in view is found by walking rather than chosen — placing the player at a
// hardcoded x/y would frame a different part of the beach on every seed.

H.breed(14)
const crowd = H.keep(14)

// Walk until a sandbar and a tide pool are both within a phone's half-diagonal (465px), so the
// frame carries both at ANY viewport rather than only on a desktop. Diagonal steps, because the
// two grids are 620 and 700 across and a walk along one axis alone samples a stripe of the plane.
let found = null
for (let i = 0; i < 600 && !found; i++) {
  run.player.x += 110
  run.player.y += 47
  H.tick()
  const p = run.player
  const bar = run.sandbars.find((b) => Math.hypot(b.x - p.x, b.y - p.y) < 430)
  const pool = run.shafts.find((s) => Math.hypot(s.x - p.x, s.y - p.y) < 430)
  if (bar && pool) found = { bar, pool }
}

// A scene that finds nothing renders a bare floor, which looks exactly like "the fields are gone" —
// the failure this whole change was about. Say so in the frame instead of letting it be read as art.
H.note(found
  ? JSON.stringify({
    bar: [Math.round(found.bar.x - run.player.x), Math.round(found.bar.y - run.player.y)],
    pool: [Math.round(found.pool.x - run.player.x), Math.round(found.pool.y - run.player.y)],
    gap: Math.round(Math.hypot(found.bar.x - found.pool.x, found.bar.y - found.pool.y) - found.bar.r - found.pool.r),
    bars: run.sandbars.length, pools: run.shafts.length,
  })
  : 'NO SPOT FOUND — a sandbar and a tide pool never came into view together')

// The crowd stands off to the sides, clear of both circles: the floor is the subject, and a body
// parked on a sandbar is the one thing that would stop you seeing its edge.
H.place((i, p) => {
  const a = (i / 14) * Math.PI * 2
  return { x: p.x + Math.cos(a) * 330, y: p.y + Math.sin(a) * 330 }
})

return () => {
  H.pin()
  H.tickFx(1 / 60)
}
