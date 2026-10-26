// The Ophan's beats past its arrival (src/ophan/staging.js): its returns, its leaving, a resonance, the sketch rising and
// its death. Owner rulings 2026-10-25; the variants are the playground's (ophan-stage.html), a pick is one STAGE_PICK entry.
import { stage, ease, win, hash } from '../staging.js'
import { OPHAN_STAGE, ophanScribbleAt } from '../../config.js'

const TAU = Math.PI * 2
const PENCIL = '#3a3a3a'
// how far (world px) the screen's farthest corner is from (x, y): a circle that wide covers it
const reach = (v, x, y) => Math.hypot(Math.max(x - v.left, v.left + v.w / v.zoom - x), Math.max(y - v.top, v.top + v.h / v.zoom - y))

// ---- THE RESONANCE: a hand pressed in the right world; it flinches and the next world's colour rings off it
const rings = (k, n, w0, al) => {
  const c = k.px(1)
  for (let i = 0; i < n; i++) {
    const f = ease(win(k.u, i * 0.15, 0.7 + i * 0.15)); if (f <= 0 || f >= 1) continue
    c.globalAlpha = al * (1 - f); c.strokeStyle = k.col(k.S); c.lineWidth = w0 * (1 - 0.5 * f) * k.z
    c.beginPath(); c.arc(k.x, k.y, k.R * (0.8 + 1.8 * f), 0, TAU); c.stroke()
  }
  c.globalAlpha = 1
}
stage('resonance', 'B', { label: 'B · the wings buckle back, two rings', draw(k) {
  const s = Math.sin(Math.PI * win(k.u, 0, 0.45))
  k.boss.scale = 1 - 0.12 * s; k.boss.dy = -8 * k.z * s
  rings(k, 2, 6, 1)
} })

// ---- INTO THE SKETCH (3 s, harmless): the paper drains in from the boss, the crowd is scribbled out where it stood, the
// last skin fades and the sketch draws itself
const SK_DRAIN = 0.35
const drain = (q) => {
  if (!q.world || q.u >= SK_DRAIN || !q.slots.pencil) return null
  return { A: q.world, B: q.slots.pencil, x: q.x, y: q.y, r: ease(win(q.u, 0.02, SK_DRAIN)) * reach(q.view, q.x, q.y), col: PENCIL, w: 2, a: 0.7 }
}
// when (u of the sketch) the paper reaches a crowd body d world px from the boss and its scribble starts; it takes SCRIBBLE
export const scribbleAt = ophanScribbleAt, SCRIBBLE = OPHAN_STAGE.scribble.dur   // the sim removes each body on the same clock
// the crowd it swept off, scribbled over where each stood (e.gone, world px), as the paper reaches it
function scribbles(k) {
  const g = k.e.gone ?? [], c = k.px(1), you = k.you
  if (!g.length) return
  // the player stays clear of the cross-outs: a body touching you is scribbled round you, not across you
  if (you) { c.save(); c.beginPath(); c.rect(-1e4, -1e4, 2e4, 2e4); c.moveTo(you.x + you.r * 1.3, you.y); c.arc(you.x, you.y, you.r * 1.3, 0, Math.PI * 2); c.clip('evenodd') }
  c.strokeStyle = PENCIL; c.lineWidth = 1.4 * k.z; c.lineCap = 'round'
  for (let i = 0; i < g.length; i += 3) {
    const p = k.at(g[i], g[i + 1]), r = g[i + 2] * k.z * 1.3, j = i / 3
    const s0 = scribbleAt(Math.hypot(p.x - k.x, p.y - k.y) / k.z), on = win(k.u, s0, s0 + SCRIBBLE)
    if (on <= 0) continue
    c.globalAlpha = 0.85 * (1 - win(k.u, 0.5, 0.7)); if (c.globalAlpha <= 0) continue
    // a tight zigzag across the body, drawn in as on grows, then a cross-out stroke
    const n = 9, a = hash(j, 7) * Math.PI
    c.beginPath()
    for (let m = 0; m <= n * on; m++) {
      const v = m / n * 2 - 1, side = m % 2 ? 1 : -1, w = Math.sqrt(Math.max(0, 1 - v * v)) * r
      const lx = side * w + (hash(j, m) - 0.5) * r * 0.3, ly = v * r
      const X = p.x + lx * Math.cos(a) - ly * Math.sin(a), Y = p.y + lx * Math.sin(a) + ly * Math.cos(a)
      m ? c.lineTo(X, Y) : c.moveTo(X, Y)
    }
    c.stroke()
  }
  c.globalAlpha = 1
  if (you) c.restore()
}
// the skin it was wearing when the last one broke, fading off the paper
function lastSkin(k) {
  const a = 1 - ease(win(k.u, 0.04, 0.28))
  if (!k.from || k.from === k.S || a <= 0) return
  k.fadePx(2, a, 1, k.x, k.y)
  k.drawBoss(k.from, k.px(2), k.x, k.y, k.R, Math.max(1, Math.round(k.ph0)))
}
stage('sketch', 'A', { label: 'A · the paper drains in, the sketch draws itself wing by wing, the eyes open last', scene: drain, draw(k) {
  lastSkin(k); scribbles(k)
  k.boss.hide = true
  const rv = win(k.u, 0.25, 0.92)
  if (rv > 0) k.drawBoss(k.S, k.px(0), k.x, k.y, k.R, 4, null, { reveal: rv })
} })
// ---- THE DEATH (6 s, skippable after 1): the eraser rubs the sketch off the paper, the great eye last; then the six
// worlds bloom back, the Core first. render.js lays the banner and the fade over it
const RUB = [0.06, 0.56], BLOOM = [0.6, 0.88]
const bloom = (q) => {
  const order = [5, 4, 3, 2, 1, 0], n = order.length, s = win(q.u, BLOOM[0], BLOOM[1]) * n
  if (s <= 0 || !q.slots.pencil) return null
  const i = Math.min(n - 1, Math.floor(s)), f = s >= n ? 1 : ease(s - i)
  const A = i ? q.look(order[i - 1]) : q.slots.pencil, B = q.look(order[i])
  if (f >= 1) return { A: B }
  return { A, B, x: q.x, y: q.y, r: f * reach(q.view, q.x, q.y), col: q.worlds[order[i]].col, w: 3, a: 1 - f }
}
// a pink rubber eraser seen from above, centred on (x, y), worn on its leading edge
function eraser(c, x, y, a, R, z) {
  const w = 0.62 * R, h = 0.3 * R
  c.save(); c.translate(x, y); c.rotate(a)
  c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.rect(-w / 2 + 5 * z, -h / 2 + 6 * z, w, h); c.fill()
  c.fillStyle = '#d97f91'; c.beginPath(); c.rect(-w / 2, -h / 2, w, h); c.fill()
  c.fillStyle = '#f0a9b6'; c.beginPath(); c.rect(-w / 2 + 0.03 * R, -h / 2 + 0.03 * R, w - 0.06 * R, h - 0.06 * R); c.fill()
  c.fillStyle = 'rgba(70,60,62,0.45)'; c.beginPath(); c.rect(-w / 2, -h / 2, 0.06 * R, h); c.fill()   // the graphite it has picked up
  c.restore()
}
// rubbings: grey-pink crumbs left on the paper, fixed per index, fading after they fall
function crumbs(c, k, n, at) {
  for (let i = 0; i < n; i++) {
    const p = at(i); if (!p) continue
    c.globalAlpha = p.a; c.fillStyle = hash(i, 9) < 0.5 ? '#c99aa2' : '#8d8586'
    c.save(); c.translate(p.x, p.y); c.rotate(hash(i, 10) * Math.PI); c.beginPath(); c.ellipse(0, 0, (2 + 2.5 * hash(i, 11)) * k.z, 1.2 * k.z, 0, 0, TAU); c.fill(); c.restore()
  }
  c.globalAlpha = 1
}
const lift = (k) => 1 - ease(win(k.u, RUB[1], RUB[1] + 0.05))
stage('death', 'A', { label: 'A · the eraser scrubs it off in oblique zigzag strokes, top to bottom, back for the great eye last', scene: bloom, draw(k) {
  k.boss.hide = true
  // a right hand's strokes: slanted bands rubbed back and forth, top to bottom, skipping the eye's (the middle) and coming
  // back for it. Each stroke starts with the eraser carried from where the last one ended to where this one starts
  const N = 7, order = [0, 1, 2, 4, 5, 6, 3], du = (RUB[1] - RUB[0]) / N, CARRY = 0.25
  const th = -0.5, cu = Math.cos(th), su = Math.sin(th), L = 3.4 * k.R, H = 4 * k.R, bh = H / N, amp = 0.28 * k.R, TEETH = 3
  const W = (u, v) => ({ x: k.x + u * cu - v * su, y: k.y + u * su + v * cu })   // band frame (u along, v across) to stage px
  const t0 = (o) => RUB[0] + o * du
  const p = order.map((_, o) => win(k.u, t0(o) + CARRY * du, t0(o + 1))), dir = (o) => (o % 2 ? -1 : 1)
  const tri = (s) => Math.abs((((s * TEETH) % 1) + 1) % 1 * 2 - 1)
  // the rubbed front of stroke o at progress q, s (0..1 across the band): ragged, the zigzag the rubbing leaves
  const front = (q, s) => -L / 2 - amp + q * (L + 2 * amp) + amp * (tri(s) - 0.5) * 2
  const vOf = (j, s) => -H / 2 + (j + s) * bh
  const clip = (c) => order.forEach((j, o) => {
    if (p[o] >= 1) return
    const d = dir(o), M = 12
    for (let m = 0; m <= M; m++) { const s = m / M, q = W(d * front(p[o], s), vOf(j, s)); m ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y) }
    const e1 = W(d * (L / 2 + amp), vOf(j, 1)), e0 = W(d * (L / 2 + amp), vOf(j, 0))
    c.lineTo(e1.x, e1.y); c.lineTo(e0.x, e0.y); c.closePath()
  })
  if (p[N - 1] < 1) k.drawBoss(k.S, k.px(0), k.x, k.y, k.R, k.ph0 ?? 4, clip)
  const c = k.px(1)
  crumbs(c, k, 80, (i) => {
    const o = i % N, q = p[o]; if (q <= hash(i, 1)) return null
    const age = (q - hash(i, 1)) * du, a = 0.8 * (1 - win(k.u, RUB[1] + 0.1, RUB[1] + 0.3)) * Math.min(1, age * 40)
    return { ...W(dir(o) * (-L / 2 + L * hash(i, 1)), vOf(order[o], 0.1 + 0.8 * hash(i, 2))), a }
  })
  const o = Math.min(N - 1, Math.floor(win(k.u, RUB[0], RUB[1]) * N)), l = lift(k)
  if (l > 0 && k.u >= RUB[0]) {
    // scrubbing: a smooth sweep up and down the band (a sine, no corners) along the middle of the rubbed edge, leaning into
    // each sweep. Carried: it glides, lifted, from the last stroke's end
    const ph = k.age * Math.PI * 2 * 1.3, s = 0.5 - 0.5 * Math.cos(ph), carry = win(k.u, t0(o), t0(o) + CARRY * du)
    const mid = (oo, q) => W(dir(oo) * (-L / 2 - amp + q * (L + 2 * amp)), vOf(order[oo], s))
    let at = mid(o, p[o]), up = 0
    if (o > 0 && carry < 1) {
      const from = mid(o - 1, 1), e = ease(carry)
      at = { x: from.x + (at.x - from.x) * e, y: from.y + (at.y - from.y) * e }; up = Math.sin(Math.PI * carry) * 0.25 * k.R
    }
    const dd = o > 0 && carry < 1 ? dir(o - 1) + (dir(o) - dir(o - 1)) * ease(carry) : dir(o)
    const ang = th + Math.PI / 2 + 0.25 * dd + 0.06 * Math.sin(ph)
    c.globalAlpha = l; eraser(c, at.x, at.y - up - (1 - l) * k.R, ang, k.R, k.z); c.globalAlpha = 1
  }
} })
