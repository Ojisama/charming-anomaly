// THE BREAK, the Mantle (toon): the broken skin is SHED, thrown off the boss in this world's own medium, while the next
// skin stands whole under it from the first frame (never a tear, a splat or a slump: those read as its death).
// Owner ruling 2026-10-25: 0.12 s hit-stop (the sim's), then 0.8 s; the looks below are the playground's candidates.
import { ColorMatrixFilter, Sprite } from 'pixi.js'
import { stage, ease, win, hash } from '../staging.js'
import { cutSkin, drawPiece } from './break-macro.js'

const TAU = Math.PI * 2
// the toon painter's palette (src/ophan/painters/toon.js P)
const INK = '#1c120d', CREAM = '#f7efdc'
const out = (u) => 1 - (1 - u) * (1 - u)
// short inked dashes round (x, y) between radii r0 and r1: the cartoon's "pop"
function popLines(c, x, y, r0, r1, n, seed, lw, al) {
  if (al <= 0.01) return
  c.globalAlpha = al; c.strokeStyle = INK; c.lineWidth = lw; c.lineCap = 'round'
  for (let j = 0; j < n; j++) {
    const a = (j / n) * TAU + (hash(j, seed) - 0.5) * 0.4, f = 0.75 + 0.5 * hash(j, seed + 1)
    c.beginPath(); c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); c.lineTo(x + Math.cos(a) * r1 * f, y + Math.sin(a) * r1 * f); c.stroke()
  }
  c.globalAlpha = 1
}

// ---- A: the sticker peel. The skin is a cel stuck on the boss: it lifts from its right edge and flips over its left one
// like a peeled sticker (its plain paper back, inked, turning up), then is flung off to the side spinning, growing as it lifts toward
// the lens, its shadow sliding off the floor, speed lines behind it. Pixi objects kept across frames, placed per frame.
const front = new Sprite(), shade = new Sprite()
// the back: the face's silhouette in one flat colour (a colour matrix: rgb fixed, alpha hardened so the glow round the
// boss does not show as a cream haze), an ink copy a little bigger under a cream one
const backOf = (hex, sc) => {
  const s = new Sprite(), f = new ColorMatrixFilter(), [r, g, b] = [16, 8, 0].map((n) => (hex >> n & 255) / 255)
  f.matrix = [0, 0, 0, 0, r, 0, 0, 0, 0, g, 0, 0, 0, 0, b, 0, 0, 0, 1.25, -0.25]
  s.filters = [f]; return { s, sc }
}
const BACK = [backOf(0x1c120d, 1.09), backOf(0xe2c48e, 1)]   // kraft, not white: a white silhouette leaving reads as a ghost
stage('break', 'toon:A', { world: 'toon', label: 'A · sticker peel: the skin flips off like a sticker and flies away', draw(k) {
  const { u, x, y, R } = k, tx = k.snap(k.from, k.ph0), W = Math.ceil(R * 3), lw = R * 0.045, c = k.px(1)
  const al = 1 - win(u, 0.62, 0.95)
  if (al <= 0) return
  // the card's pose at u: flipped th about its hinge (its left edge), then flung up-left, spinning, lifting
  const pose = (u) => {
    const th = Math.PI * ease(win(u, 0.04, 0.34)), fl = out(win(u, 0.28, 1))
    return { cx: Math.cos(th), lift: 1 + 0.22 * Math.sin(th) + 0.35 * fl, mx: -R * 2.6 * fl, my: -R * 0.5 * fl, rot: -1.7 * fl, th }
  }
  const p = pose(u), hx = x - R * 1.4
  // sx the card's width as seen: its face's cos, or the back's |cos| (the boss is near mirror-symmetric, so its silhouette
  // reads the same unmirrored)
  const card = (ox, oy, draw, sx = p.cx) => {
    c.save(); c.translate(hx + p.mx + ox, y + p.my + oy); c.rotate(p.rot); c.scale(sx * p.lift, p.lift); c.translate(-hx, -y)
    c.translate(x - W / 2, y - W / 2); c.scale(W / tx.width, W / tx.width); draw(); c.restore()
  }
  // the shadow it casts on the floor, sliding away down-right as it lifts
  const up = Math.sin(p.th) * 0.6 + 0.4 * win(u, 0.28, 1)
  if (up > 0.02) { shade.texture = tx; shade.tint = 0x000000; c.globalAlpha = 0.35 * al * Math.min(1, up * 3); card(R * 0.35 * up, R * 0.45 * up, () => c.place(shade), Math.abs(p.cx)); c.globalAlpha = 1 }
  // the speed lines: dashes trailing the card along the way it is going
  const q = pose(Math.max(0, u - 0.05)), vx = (p.mx - q.mx) + (p.cx - q.cx) * R * 1.4, vy = p.my - q.my, sp = Math.hypot(vx, vy)
  if (sp > R * 0.06 && u > 0.05) {
    const dx = vx / sp, dy = vy / sp, ccx = hx + p.mx + R * 1.4 * p.cx * p.lift, ccy = y + p.my
    c.strokeStyle = INK; c.lineCap = 'round'; c.lineWidth = lw * 0.8; c.globalAlpha = al * Math.min(1, sp / (R * 0.4))
    for (let j = -2; j <= 2; j++) {
      const o = j * R * 0.32, b = R * (0.9 + 0.25 * hash(j + 3, 2)) * p.lift, L = Math.min(R * 1.4, sp * 2.2) * (0.6 + 0.4 * hash(j + 3, 5))
      const bx = ccx - dx * b - dy * o, by = ccy - dy * b + dx * o
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx - dx * L, by - dy * L); c.stroke()
    }
    c.globalAlpha = 1
  }
  // the card: its face while th < 90 degrees, its paper back (the face's silhouette, mirrored, cream in an ink rim) after
  c.globalAlpha = al
  if (p.cx >= 0) { front.texture = tx; front.tint = 0xffffff; card(0, 0, () => c.place(front)) }
  else card(0, 0, () => {
    for (const b of BACK) {
      c.save(); c.translate(tx.width * (1 - b.sc) / 2, tx.height * (1 - b.sc) / 2); c.scale(b.sc, b.sc)
      b.s.texture = tx; c.place(b.s); c.restore()
    }
  }, -p.cx)
  c.globalAlpha = 1
  // the tug as it lets go: an ink pop round the boss
  const pp = win(u, 0.02, 0.2)
  if (pp > 0 && pp < 1) popLines(c, x, y, R * (1.05 + 0.5 * out(pp)), R * (1.4 + 0.7 * out(pp)), 12, 7, lw * 0.9, 1 - pp)
} })

// ---- B: the armour pops off. The skin breaks into a few big inked plates that blast outward off the boss, spinning and
// growing as they lift toward the lens, an ink ring and pop lines bursting out round it, the new skin clean beneath.
const PLATES = [{ r0: 0, r1: 0.34, n: 3 }, { r0: 0.34, r1: 1, n: 7 }]
stage('break', 'toon:B', { world: 'toon', label: 'B · armour pop: inked plates blast off with an ink ring', draw(k) {
  const { u, x, y, R } = k, tx = k.snap(k.from, k.ph0), P = cutSkin('plates', PLATES, 4), U = R * 1.5, lw = R * 0.05, c = k.px(0), g = k.px(1)
  // the ring: a thick ink circle bursting out and thinning to nothing
  const r = win(u, 0.03, 0.42)
  if (r > 0 && r < 1) {
    g.globalAlpha = 1 - r; g.strokeStyle = INK; g.lineWidth = lw * 2 * (1 - r) + 1
    g.beginPath(); g.arc(x, y, R * (0.9 + 1.7 * out(r)), 0, TAU); g.stroke(); g.globalAlpha = 1
  }
  popLines(g, x, y, R * (1.2 + 1.2 * out(win(u, 0.04, 0.4))), R * (1.6 + 1.5 * out(win(u, 0.04, 0.4))), 14, 3, lw, 1 - win(u, 0.1, 0.4))
  P.forEach((pc, i) => {
    const f = win(u, 0.03 + 0.04 * hash(i, 2), 0.7), fo = 1 - Math.pow(1 - f, 3)
    // the middle plate has no direction of its own: it takes one
    const a = pc.d > 0.1 ? Math.atan2(pc.c[1], pc.c[0]) + 0.3 * (hash(i, 3) - 0.5) : hash(i, 9) * TAU
    const dist = U * (0.5 + 1.1 * pc.d + 0.5 * hash(i, 4)) * fo, dx = Math.cos(a) * dist, dy = Math.sin(a) * dist
    const rot = (hash(i, 5) - 0.5) * 2.2 * fo, sc = 1 + 0.35 * fo, al = 1 - ease(win(f, 0.45, 0.85))
    if (al <= 0.01) return
    // inked like the cast once it is loose: the plate's own paint in ink, a little bigger, under it
    if (f > 0) drawPiece(c, k, tx, pc, i + 40, dx, dy, rot, sc * 1.07, al * Math.min(1, f * 8), 0x1c120d)
    drawPiece(c, k, tx, pc, i, dx, dy, rot, sc, al)
  })
} })
export { win, hash }
