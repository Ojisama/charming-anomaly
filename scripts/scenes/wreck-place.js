// Scene: DOES THE WRECK LOOK LIKE A WRECK? Everything the v7.x prey rework put on this floor, in
// one boot.
//
//   npx vite --port 5203 --strictPort &
//   node scripts/fx-probe.mjs --scene scripts/scenes/wreck-place.js --out /tmp/wk --frames 7 \
//     --chapter wreck --url 'http://127.0.0.1:5203/'
//   ...and again with --w 1280 --h 800, because the hull's size is judged against the viewport.
//
// ⚠ `--chapter wreck` IS NOT OPTIONAL AND ITS ABSENCE IS SILENT — fx-probe defaults to `city`,
// where chapterRender.hull is undefined, run.slicks is empty forever, and BIOMES.city draws the
// obstacles. Every frame would come back looking plausible and be a picture of another chapter.
// The sibling scene wreck-lust.js shipped without the flag for one commit for the same reason.
//
// WHAT EACH FRAME IS FOR:
//   1 THE FLOOR, empty. Is BIOME_WRECK its own place — silt and rust rather than The Reef's coral?
//     This is the frame that would have caught the shipped bug: the chapter drew `wreck:
//     BIOME_REEF`, so its nine "hull plates" were CORAL HEADS AND SEA WHIPS.
//   2 THE OBSTACLES, standing ON one. Are hullPlate/hullRib/drum reading as broken ship rather than
//     as rocks, and — the question a picture answers and a code read does not — are they PLAN VIEW
//     like everything around them? That is the Trash Tornado test: asking only "does it look like
//     wreckage" passes a side elevation, which is how a whole version was lost.
//   3 THE LEAK. A spill is FORCED under the player rather than hunted for: at chance 0.34 over a
//     900px cell, waiting for the streamer to hand one over is a coin flip per boot, and a scene
//     that usually works is one whose empty frame reads as "the hazard is invisible".
//   4 THE SHOAL. Does a crowd of `skittish` fish read as a school, or as a ring of enemies?
//   5-7 THE SUNKEN SHIP, at three points along a swim. It gets its own frames BECAUSE IT IS ON A
//     GRID: one cell is ~4900 world px apart, so whether one is on screen at the origin is luck,
//     and a scene that shot only the origin would report "there is no ship" on most boots. Walking
//     is the only honest way to ask "how often do I meet one, and does it read as a ship".
const p = run.player
p.hp = p.maxHP = 99999

H.note('frames: 1 floor | 2 on an obstacle | 3 a spill | 4 a shoal | 5-7 the ship, walking +6000px')

H.breed(90)
const crowd = H.keep(90)
const AWAY = (_, pl) => ({ x: pl.x + 9000, y: pl.y + 9000 })

// Move the player and let the streamers catch up — obstacles/decor/slicks only materialise within
// 1400px of the player, so a teleport without ticks lands on an empty floor and reads as a bug.
const goto = (x, y) => {
  p.x = x; p.y = y
  for (let k = 0; k < 12; k++) { H.tick(); H.place(AWAY) }
}

let i = 0
return () => {
  run.gems.length = 0
  run.coins.length = 0
  p.hitFlash = 0
  p.hp = p.maxHP
  run.slicks.length = 0
  for (const e of crowd) e.flags = []

  if (i === 0) {
    H.place(AWAY)
  } else if (i === 1) {
    // Stand on the nearest obstacle rather than hoping one drifts into frame. If the chapter ever
    // streams none at all, the note says so instead of the frame quietly showing bare floor.
    const near = run.obstacles.slice().sort((a, b) =>
      Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]
    H.note(`obstacles streamed: ${run.obstacles.length}${near ? ` nearest r=${Math.round(near.r)}` : ' — NONE, the frame below proves nothing'}`)
    if (near) goto(near.x + 90, near.y + 60)
    H.place(AWAY)
  } else if (i === 2) {
    run.slicks.push({ x: p.x + 40, y: p.y + 30, r: 190, shape: 1, rot: 0.7, _cell: 'probe' })
    H.place(AWAY)
  } else if (i === 3) {
    // Three schools laid out as stepPrey would have them — a body of fish per bucket, each on its
    // own heading. Placed rather than left to the sim because a bred crowd arrives on a spawn ring
    // and the question here is the SHAPE of a school, not where spawns come from.
    H.place((k, pl) => {
      const shoal = Math.floor(k / 30)
      const a = shoal * 2.399963
      const cx = pl.x + Math.cos(a) * 300
      const cy = pl.y + Math.sin(a) * 300
      const j = k % 30
      return {
        x: cx + Math.cos(a) * (j % 6) * 34 - Math.sin(a) * Math.floor(j / 6) * 30,
        y: cy + Math.sin(a) * (j % 6) * 34 + Math.cos(a) * Math.floor(j / 6) * 30,
      }
    })
    for (const e of crowd) e.flags = ['skittish']
  } else {
    goto(6000 * (i - 3), 0)
    H.place(AWAY)
  }
  i++
  H.render()
}
