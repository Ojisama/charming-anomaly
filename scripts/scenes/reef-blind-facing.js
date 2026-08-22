// Scene: WHICH WAY A BLINDED BODY IS DRAWN. One question, one frame.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/reef-blind-facing.js --chapter reef \
//     --url http://127.0.0.1:5173/ --out /tmp/blind --frames 4 --w 1280 --h 800
//
// Squid Ink's product is bodies that lose you and carry on. render.js derives every creature's
// bearing from run.player each frame, so unless the blind is on the facesOwnHeading branch the
// bodies swim away with their eyes still locked on you — the exact bug the comment above that
// branch already records in the owner's words for `skittish` ("a fleeing fish swam BACKWARDS, tail
// first, eyes on the predator ... a whole shoal read as an escort rather than an escape").
//
// NOT PINNED, and that is the whole design of this scene. The divergence between "where it is
// swimming" and "where you are" is produced by the card itself: bodies arrive from up the lane
// nosing at you, the blind freezes that heading, and then their own speed plus the +x scroll carry
// them THROUGH you and astern while the heading does not move. Pinning them freezes the geometry
// too and there is nothing left to photograph — and re-pinning them by hand re-enters the cloud,
// which re-captures the heading at the new spot (blindT hitting 0 clears _blindHx). So: ink them,
// take the jet away, and let the seam do it.
//
// SHOOT IT WIDE. laneAxis 'x' with LANE_CAMERA_FRAC 20% leaves only ~78px of lane visible behind
// the player on a 390px-wide phone, and astern is exactly where the subject ends up.
//
//   FIXED  the shoal noses down-lane, AWAY from the player, still swimming the way it was going.
//   BROKEN the shoal noses back up-lane, AT the player, crabbing sideways with its eyes on you.
H.weapon('squidInk', 5)

H.breed(14)
const crowd = H.keep(10)

// Rank up AHEAD of the player and inside the cloud's reach, so the heading the blind captures is
// genuinely "down-lane, at him" — the bearing every one of these bodies actually had.
H.place((i, p) => ({ x: p.x + 120 + (i % 2) * 70, y: p.y - 160 + Math.floor(i / 2) * 80 }))
H.until(() => run.enemies.filter((e) => (e.blindT ?? 0) > 0).length >= 6, 1500)

// THE JET OFF, so no second cloud can re-blind them and recapture the heading at their new place.
// This is the frame one second after a jet, which is the frame the card is sold on.
run.weapons = []
run.blooms.length = 0

// Unpin: from here their own swimming and the lane scroll do the work.
for (const e of crowd) { e._fx = undefined; e._fy = undefined }
for (let i = 0; i < 70; i++) H.tick()

// THE NUMBERS BESIDE THE PICTURE, so the frame is not the only evidence. For each still-blinded
// body: does sim publish the contract pair render reads (_tgtX/_tgtY), and does that pair point the
// OPPOSITE way along the lane from the bearing to the player? They must disagree — that disagreement
// IS the thing the sprite has to obey.
const p = run.player
const rows = crowd.filter((e) => !e._dead && (e.blindT ?? 0) > 0).map((e) => ({
  pub: e._tgtX === undefined ? 'MISSING' : (e._tgtX - e.x > 0 ? 'down-lane' : 'up-lane'),
  toPlayer: p.x - e.x > 0 ? 'down-lane' : 'up-lane',
  astern: e.x < p.x,
}))
H.note(JSON.stringify({
  blindedLeft: rows.length + '/' + crowd.length,
  publishing: rows.filter((r) => r.pub !== 'MISSING').length + '/' + rows.length,
  opposed: rows.filter((r) => r.pub !== 'MISSING' && r.pub !== r.toPlayer).length + '/' + rows.length,
  astern: rows.filter((r) => r.astern).length + '/' + rows.length,
}))

// THE A/B, OUT OF ONE BOOT AND ONE WORLD. Frames 0-1 are the shipped build. Frames 2-3 ablate the
// fix WITHOUT touching a line of code: zeroing blindT drops these bodies off render's
// facesOwnHeading branch, which is bit-for-bit the pre-fix drawing (before, sim published no
// _tgtX/_tgtY here at all, so the branch was unreachable for a blinded body either way).
// H.render(), never H.tickFx(), so the sim does not advance between the panels — nothing moves,
// only the sprite's chosen bearing differs, which is the only variable this scene has.
return (age) => {
  if (age > 0.5) for (const e of crowd) e.blindT = 0
  H.render()
}
