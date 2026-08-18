// Scene: BILGE, The Wreck's barrier — does the oil open OUT ON THE CROWD, or under the player?
//
//   npx vite --port 5216 --strictPort &
//   node scripts/fx-probe.mjs --scene scripts/scenes/wreck-bilge.js --out /tmp/bg --frames 3 \
//     --chapter wreck --url 'http://127.0.0.1:5216/'
//
// ⚠ THE WEAPON MUST DO THE PLACING. The kit scene next door hand-pushes a bloom onto run.blooms to
// photograph the look, which is right for judging the DRAWING and useless here: a hand-placed pool
// proves nothing about where stepBilgeWeapon decides to put one. This scene equips the card and
// lets it fire, so the frame shows the decision rather than the artist's guess.
//
// ⚠ AND IT MUST BE LET GROW. A pool opens at r = 0 and takes dur * BLOOM_GROW_FRAC to reach maxR —
// 2.2s at L5. Shooting the cast instant gives a frame with no pool in it, which is indistinguishable
// from the effect being invisible. So each frame fires, THEN runs the growth out before rendering.
//
// The note line carries the number the picture cannot: how far the pool opened from the player. At
// the feet that reads ~0; landing on a body it should read the body's distance.
const p = run.player
p.hp = p.maxHP = 99999

H.note('frames: 1 plain bilge | 2-3 OIL RING — the pen must be a ring with an empty middle')

H.breed(8)
const crowd = H.keep(4)
H.weapon('bilge', 5)

// The cast held well out in front, at the sort of gap the chapter's prey actually keep: they flee
// at PREY_SIGHT_R 340, so a pool that only ever opens underfoot never touches any of them.
H.place((i, pl) => {
  const a = (i / 4 - 0.5) * 1.1
  const r = 210 + i * 34
  return { x: pl.x + Math.cos(a) * r, y: pl.y + Math.sin(a) * r }
})

let i = 0
return () => {
  run.gems.length = 0
  run.coins.length = 0
  p.hitFlash = 0
  H.pin()
  // Frame 0 is the ordinary cast; from frame 1 the ring mod is on, so one shoot carries the
  // comparison rather than two runs whose crowds landed differently.
  if (i === 1) H.weapon('bilge', 5, { oilRing: 1 })

  let fired = false
  for (let k = 0; k < 900 && !fired; k++) {
    const evs = H.tickFx(1 / 60)
    H.pin()
    p.hitFlash = 0
    fired = evs.some((e) => e.type === 'bilge')
  }
  if (!fired) H.note(`frame ${i}: BILGE NEVER FIRED — the frame below proves nothing`)
  // Run the growth out so the frame shows a pool rather than the dot it opens as.
  for (let k = 0; k < 150; k++) { H.tickFx(1 / 60); H.pin(); p.hitFlash = 0 }

  const oil = run.blooms.filter((b) => b.look === 'bilge')
  const d = oil.map((b) => Math.round(Math.hypot(b.x - run.player.x, b.y - run.player.y))).join(',')
  // The NaN counter stays. A field of positionless bodies renders as "the effect is invisible",
  // which is indistinguishable from the effect being broken — this scene printed NaN for two rounds
  // before anyone looked at where it came from (fx-probe's pin(), now guarded).
  const nan = run.enemies.filter((e) => !Number.isFinite(e.x) || !Number.isFinite(e.y)).length
  H.note(`f${i}: ${oil.length} pool(s) ${d || '-'}px from the player | ${run.enemies.length} enemies`
    + ` | view ${run.viewW}x${run.viewH} | NaN-positioned ${nan} (MUST be 0)`)
  i++
}
