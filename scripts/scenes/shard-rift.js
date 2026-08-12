// Scene: Reality Shard at Lv5 — the teleport seams tornSeam cuts, opening and zipping shut.
// `?seam=N` picks the mod depth; `?seam=0` is the control that proves the bare weapon draws none.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/shard-rift.js --out /tmp/seam \
//     --chapter beyond --frames 16 --wait 70000 --url 'http://127.0.0.1:5199/?seam=3'
//
// NOTE this does NOT use H.scrub. A seam's close is an EVENT, and H.tick drains run.events without
// handing them to sync — so a scrubbed sequence would show every open seam and not one close. The
// returned stepper drives real frames and forwards the events, exactly as main.js does.

const seam = Number(new URLSearchParams(location.search).get('seam') ?? 3)
H.weapon('realityShard', 5, seam > 0 ? { tornSeam: seam, rapidShard: 1 } : { rapidShard: 1 })

// The Beyond is the game's one LANE chapter: forward is -y and the camera keeps the player low, so
// a cast parked to the RIGHT is simply off-frame (the first take of this scene shot empty space).
// Two ranks straight ahead, far enough that the shards blink across open ground on the way — the
// seams are the subject, and one landing on top of a sprite cannot be judged.
H.breed(10)
H.keep(10)
H.place((i, p) => ({
  x: p.x + ((i % 5) - 2) * 52,
  y: p.y - 330 - Math.floor(i / 5) * 46,
}))

// Warm up until the weapon has actually cut seams, so frame 00 already has something in it. With
// seam=0 there is nothing to wait for — wait for shards in flight instead, or the control hangs.
if (seam > 0) H.until(() => (run.zones || []).length >= 2, 900)
else H.until(() => run.bullets.some((b) => b.weapon === 'shard'), 900)

H.note(JSON.stringify({
  chapter: run.chapter,
  shards: run.bullets.filter((b) => b.weapon === 'shard').length,
  seams: (run.zones || []).length,
  mod: seam,
}))

return () => {
  for (let i = 0; i < 2; i++) {
    step(run, { x: 0, y: 0 }, 1 / 60)
    run.player.hp = run.player.maxHP
    H.pin()
    window.__renderer.sync(run, 1 / 60, run.events.splice(0))
  }
  app.renderer.render(app.stage)
}
