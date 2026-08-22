// Scene: The Reef's MAP — the spur field, wide, in map mode. Runs in the page with
// (run, app, step, H) in scope; see the H surface in fx-probe.mjs.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-map.js --out /tmp/reef --chapter reef \
//     --frames 2 --w 1280 --h 800
//
// MAP MODE OR NOTHING. The braid is the whole level design and it has a period of eight ridges =
// 1680 world px along the lane; a gameplay frame on a phone shows 312px ahead of the player, i.e.
// one ridge and a half. Judging "does this read as a braid" from that frame is judging a coastline
// from a doorstep. setMapMode(true, z) is the wide view, and spurG rides with obstacleLayer through
// it deliberately (render.js) — the ridges ARE the layout here.
//
// THE FIELD ONLY EXISTS NEAR THE PLAYER. streamSpurs materialises OBSTACLE_STREAM_RADIUS (1400px)
// either side, so fifteen ridges = 3150px of lane, which is what the zoom below is chosen to frame.
// Zooming further out does not show more reef, it shows more empty water — the same trap the map
// recipe in CLAUDE.md names for buildings.

const MAP_ZOOM = 0.36     // 1280x800 / 0.36 = 3556 x 2222 world px: the whole streamed window
const START_X = 4200      // clear of the run origin's spawn ring, so the field is ordinary lane

run.player.x = START_X
run.player.y = 0
H.tick(); H.tick()

// Second hop, one ridge along, so the cursor has actually MOVED and _spurRev has been bumped by a
// real crossing rather than only by the first scan. A field that streams once and never again looks
// identical in a still, and that is exactly the failure the cursor could have.
run.player.x = START_X + 210
H.tick()

// ?map=0 shoots the SAME field at gameplay zoom instead. Both readings are needed and they answer
// different questions: map mode says whether the braid is a braid, and 1:1 on a phone says whether
// a ridge you are about to hit reads as terrain rather than as decor.
const MAP = new URLSearchParams(location.search).get('map') !== '0'
if (MAP) window.__renderer.setMapMode(true, MAP_ZOOM)

const seps = run.spurs.map((s) => (s.merged ? 0 : Math.round(Math.abs(s.grooves[0].c - s.grooves[1].c))))
H.note(JSON.stringify({
  chapter: run.chapter,
  spurs: run.spurs.length,
  merged: run.spurs.filter((s) => s.merged).length,
  rev: run._spurRev,
  widths: run.spurs.flatMap((s) => s.grooves.map((g) => Math.round(g.hw * 2))),
  seps,
}))

return () => { H.render() }
