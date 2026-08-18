// Scene: every piece of junk Lest can throw, in one frame.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/ballast-junk.js --chapter shelf \
//        --url http://127.0.0.1:5203/ --out /tmp/junk --frames 1
//
// The piece is chosen in syncLobs by hashing the THROW'S TARGET, so a normal run shows one piece
// per cast and proving all five bake would take a dozen casts. This nudges five lobs' targets until
// each resolves to a different index and lays them out in a column.
//
// THE HASH IS DUPLICATED HERE, which is normally the exact one-fact-two-places trap this repo is
// built around — it is tolerable only because the shot IS the check: if the formula drifts, two
// tiles come back wearing the same sprite and the H.note line below disagrees with the picture.
// Never copy this pattern into src/.
const hash = (n) => { const s = Math.sin(n) * 43758.5453; return s - Math.floor(s) }
const pick = (tx, ty, n) => Math.floor(hash(tx * 0.017 + ty * 0.031) * n) % n

H.weapon('ballast', 5)

// A clean frame: the junk is the subject, and a crowd would sit on top of half of it.
run.charge = 100

// One real cast first, so every field these clones carry is one the shipped weapon actually writes
// rather than a shape invented here.
H.until(() => (run.lobs || []).length > 0, 900)
const proto = (run.lobs || [])[0]
if (!proto) throw new Error('no ballast lob after 900 ticks')

const p = run.player
const N = 5
const found = []
for (let idx = 0; idx < N; idx++) {
  const ty = p.y - 300 + idx * 150
  let tx = null
  // Search a window around the column. n = tx*0.017 changes the hash completely for a 1px step, so
  // a few dozen candidates is always enough; if it is not, fail loudly rather than draw four tiles.
  for (let d = 0; d < 400 && tx === null; d++) {
    const cand = p.x + 150 + (d % 2 ? -1 : 1) * Math.floor(d / 2)
    if (pick(cand, ty, N) === idx) tx = cand
  }
  if (tx === null) throw new Error('no target hashes to junk index ' + idx)
  // t = 0 puts the sprite exactly on (fromX, fromY) with no parabola, so the layout is the layout.
  found.push({ ...proto, t: 0, fromX: tx, fromY: ty, tx, ty, r: 1 })
}
run.lobs.length = 0
run.lobs.push(...found)

H.note('junk indices: ' + found.map((l) => pick(l.tx, l.ty, N)).join(','))
