// Scene: THE SUNKEN SHIP ON THE PARALLAX LAYER — the backdrop wreck, framed on purpose.
//
//   npx vite --port 5241 --strictPort &
//   node scripts/fx-probe.mjs --scene scripts/scenes/wreck-hull.js --out /tmp/wh --frames 6 \
//     --chapter wreck --url 'http://127.0.0.1:5241/'
//   ...and again with --w 1280 --h 800, because a backdrop's size is judged against the viewport.
//
// ⚠ `--chapter wreck` IS NOT OPTIONAL AND ITS ABSENCE IS SILENT (see wreck-place.js).
//
// WHY IT SOLVES FOR THE PLAYER POSITION INSTEAD OF WALKING: the hulls sit on a 3800px grid in
// PARALLAX space at 0.45, so they repeat every 3800/0.45 = 8444 WORLD px and not every cell holds
// one. A walking scene therefore returns mostly empty water, and an empty frame reads as
// "there is no ship" rather than as "you did not walk far enough" — the failure wreck-place.js's
// own header warns about. This reproduces updateWreckHull's cell hash, picks cells that DO hold a
// hull, and inverts the parallax transform so the chosen one lands in the middle of the frame:
//
//   screen = cx * parallax + P,  cx = viewW/2 - player.x   =>   player.x = (P - viewW/2 * (1-p)) / p
//
// The viewport terms are read from app.screen, so the same scene frames correctly at 390 and 1280.
// If updateWreckHull's hash or transform ever changes, this scene goes back to shooting open water
// — that is the tell, not an error.
//
// A shoal is kept in frame ON PURPOSE: the hull's whole job is to be a big deep thing, and "big" is
// only legible against a body whose size the player already knows.
const p = run.player
p.hp = p.maxHP = 99999

const hash = (n) => { const s = Math.sin(n) * 43758.5453; return s - Math.floor(s) }
// ⚠ ONLY CELLS THAT ACTUALLY HOLD A HULL. updateWreckHull skips a cell when
// hash(i*3.7 + j*11.3 + 5.1) > chance, so naming a cell that fails that test shoots open water and
// reads as "the ship is invisible" — the exact false report this scene exists to prevent. Re-derive
// this list if `chance` moves. At chance 0.90 every cell in the -2..2 block holds one.
const CELLS = [[0, 0], [-1, -1], [-2, -2], [-1, 1], [0, 1], [-2, 0]]
// ⚠ MIRRORS CHAPTERS.wreck.render.hull.{cell,parallax}. They are literals here because the page
// does not expose the config object, and when they go stale this scene silently shoots OPEN WATER
// rather than erroring — which is exactly the "the ship is invisible" false report it exists to
// prevent. If a frame comes back empty, check these two numbers FIRST.
// ⚠ AND CS_JITTER MUST BE `HULL_JITTER * 2`, NOT THE OLD 0.5. This scene was written in the same
// commit that moved HULL_JITTER 0.25 -> 0.13 and it kept the old factor, so "one hull centred per
// frame" was false by up to 326px — 84% of a phone width — while the header claimed otherwise. A
// rig that lies about its own framing turns every art judgement into an argument about the rig.
const CS = 3800, PX = 0.45, CS_JITTER = 0.26

H.note('frames: one hull centred per frame, six different cells (rotation is hashed per cell)')

H.breed(24)
H.keep(24)

let i = 0
return () => {
  run.gems.length = 0
  run.coins.length = 0
  run.slicks.length = 0
  p.hitFlash = 0
  p.hp = p.maxHP

  const [ci, cj] = CELLS[i % CELLS.length]
  const hx = (ci + 0.5) * CS + (hash(ci * 7.1 + cj * 2.9 + 13.3) - 0.5) * CS * CS_JITTER
  const hy = (cj + 0.5) * CS + (hash(ci * 2.3 + cj * 5.7 + 29.7) - 0.5) * CS * CS_JITTER
  const tx = (hx - (app.screen.width / 2) * (1 - PX)) / PX
  const ty = (hy - (app.screen.height / 2) * (1 - PX)) / PX
  p.x = tx
  p.y = ty

  for (let k = 0; k < 10; k++) {
    H.tick()
    H.place((j, pl) => ({
      x: pl.x + Math.cos(j * 2.4) * (130 + j * 10),
      y: pl.y + Math.sin(j * 2.4) * (130 + j * 10),
    }))
  }
  // ⚠ RE-PIN AFTER THE TICKS. The chapter's TIDE moves the player every step, so ten warm-up ticks
  // carry it a few hundred px off the position that was solved for — and the frame comes back with
  // the hull half out of shot, which reads as a placement bug in the renderer rather than as drift
  // in the rig. The ticks are still needed at the target (the floor decor only streams within
  // 1400px of the player), so the fix is to solve, tick there, then put the player back.
  p.x = tx
  p.y = ty
  i++
  H.render()
}
