// THE BREAK, Topsoil (macro): the broken skin comes apart in this world's own medium while the next skin shows under it.
// Owner ruling 2026-10-25: 0.12 s hit-stop (the sim's), then 0.8 s; the looks below are the playground's candidates.
import { Sprite } from 'pixi.js'
import { stage, ease, win, hash, clamp01 } from '../staging.js'

const TAU = Math.PI * 2
// ---- the cut: the broken skin's snap (k.snap, R*3 wide) split into pieces by jagged rings and spokes, in units of 1.5 R
// round the boss. Neighbours share every edge (the same fn of the same ids), so the pieces tile the skin with no gap.
// rings: [{ r0, r1, n }] inner to outer. Each piece: { p: [[x, y]] unit, c: [x, y] its centroid, ring, j, d its distance }
const cuts = new Map()
export function cutSkin(key, rings, seed = 1) {
  if (cuts.has(key)) return cuts.get(key)
  const G = 72   // samples round a ring's jagged boundary
  const edgeR = (b, i) => b.r * (b.last ? 1 : 1 + 0.16 * (hash(b.id * 31 + (i % G), seed) - 0.5))
  const ang = (ri, j, n) => ((j + (ri % 2) * 0.5 + 0.55 * (hash(ri * 17 + (j % n), seed + 3) - 0.5)) / n) * TAU
  const out = []
  rings.forEach(({ r0, r1, n }, ri) => {
    const bi = { id: ri, r: r0, last: false }, bo = { id: ri + 1, r: r1, last: ri === rings.length - 1 }
    // a point on boundary b at angle a, interpolated between its fixed samples (the same for both rings it divides)
    const on = (b, a) => { const s = ((a / TAU) * G % G + G) % G, i = Math.floor(s), f = s - i, r = edgeR(b, i) * (1 - f) + edgeR(b, i + 1) * f; return [Math.cos(a) * r, Math.sin(a) * r] }
    const arc = (b, a0, a1) => { const P = [on(b, a0)]; for (let s = Math.ceil((a0 / TAU) * G); s < (a1 / TAU) * G; s++) P.push(on(b, (s / G) * TAU)); P.push(on(b, a1)); return P }
    // a spoke between the two boundaries, kinked at mid-radius
    const spoke = (j) => { const a = ang(ri, j, n), m = a + 0.35 * (hash(ri * 7 + (j % n), seed + 9) - 0.5) / n * TAU, rm = (r0 + r1) / 2; return [on(bi, a), [Math.cos(m) * rm, Math.sin(m) * rm], on(bo, a)] }
    for (let j = 0; j < n; j++) {
      const a0 = ang(ri, j, n), a1 = ang(ri, j + 1, n) + (j === n - 1 ? 0 : 0)
      const A1 = a1 < a0 ? a1 + TAU : a1
      const s0 = spoke(j), s1 = spoke(j + 1)
      const p = r0 === 0 ? [[0, 0], s0[1], ...arc(bo, a0, A1), s1[1]] : [s0[0], s0[1], ...arc(bo, a0, A1), s1[1], ...arc(bi, a0, A1).reverse()]
      let cx = 0, cy = 0; for (const q of p) { cx += q[0]; cy += q[1] } cx /= p.length; cy /= p.length
      out.push({ p, c: [cx, cy], ring: ri, j, d: Math.hypot(cx, cy) })
    }
  })
  cuts.set(key, out)
  return out
}
// one piece of the snap tx into px2d c: clipped to its polygon, moved by (dx, dy) stage px, turned rot and scaled sc about
// its centroid; tint multiplies it (a sprite tint). Each (px2d, i) owns a sprite kept across frames (px2d.place re-parents)
const spr = new Map()
export function drawPiece(c, k, tx, pc, i, dx, dy, rot, sc, alpha, tint = 0xffffff) {
  if (alpha <= 0.002 || sc <= 0.01) return
  let L = spr.get(c); if (!L) spr.set(c, L = [])
  const s = L[i] ?? (L[i] = new Sprite())
  s.texture = tx; s.tint = tint
  const U = k.R * 1.5, W = Math.ceil(k.R * 3), cx = k.x + pc.c[0] * U, cy = k.y + pc.c[1] * U
  c.save()
  c.globalAlpha = alpha
  c.translate(cx + dx, cy + dy); c.rotate(rot); c.scale(sc, sc); c.translate(-cx, -cy)
  c.beginPath(); pc.p.forEach(([x, y], n) => (n ? c.lineTo(k.x + x * U, k.y + y * U) : c.moveTo(k.x + x * U, k.y + y * U))); c.closePath()
  c.clip()
  c.translate(k.x - W / 2, k.y - W / 2); c.scale(W / tx.width, W / tx.width)
  c.place(s)
  c.restore()
}
// the polygon of a piece as it is drawn by drawPiece, for an outline over it
export function piecePath(c, k, pc, dx, dy, rot, sc, shrink = 1) {
  const U = k.R * 1.5, cx = k.x + pc.c[0] * U, cy = k.y + pc.c[1] * U, cs = Math.cos(rot) * sc, sn = Math.sin(rot) * sc
  c.beginPath()
  pc.p.forEach(([x, y], n) => {
    const lx = (k.x + (pc.c[0] + (x - pc.c[0]) * shrink) * U) - cx, ly = (k.y + (pc.c[1] + (y - pc.c[1]) * shrink) * U) - cy
    const X = cx + dx + lx * cs - ly * sn, Y = cy + dy + lx * sn + ly * cs
    n ? c.lineTo(X, Y) : c.moveTo(X, Y)
  })
  c.closePath()
}

// ---- Topsoil's palette (src/macro.js: the tile's crumbs) and its light, raking from the top left
const SOILS = [0x3e2a18, 0x5a3e26, 0x6e4c2e, 0x7a5a3a, 0x4a321e, 0x8a6a48]
const LX = -0.62, LY = -0.78
const mixc = (a, b, t) => { const f = (s) => Math.round((a >> s & 255) + ((b >> s & 255) - (a >> s & 255)) * t) & 255; return f(16) << 16 | f(8) << 8 | f(0) }
const css = (h, a = 1) => `rgba(${h >> 16 & 255},${h >> 8 & 255},${h & 255},${a})`
// a clod of soil, plan view: a lumpy blob lit from the top left (dark rim, base, lit crown, a wet glint), its shadow down-right
function clod(c, x, y, r, seed, a) {
  if (a <= 0.01 || r < 0.5) return
  const base = SOILS[Math.floor(hash(seed, 41) * SOILS.length)], n = 9
  const P = []; for (let i = 0; i < n; i++) { const t = (i / n) * TAU + hash(seed, i) * 0.4; P.push([Math.cos(t) * (0.72 + 0.4 * hash(seed, i + 20)), Math.sin(t) * (0.72 + 0.4 * hash(seed, i + 30))]) }
  const blob = (ox, oy, k) => { c.beginPath(); P.forEach(([px, py], i) => (i ? c.lineTo(x + ox + px * r * k, y + oy + py * r * k) : c.moveTo(x + ox + px * r * k, y + oy + py * r * k))); c.closePath() }
  c.globalAlpha = 0.45 * a; c.fillStyle = '#0a0503'; blob(r * 0.35, r * 0.45, 1.05); c.fill()
  c.globalAlpha = a
  c.fillStyle = css(mixc(base, 0, 0.45)); blob(0, 0, 1); c.fill()
  c.fillStyle = css(base); blob(LX * r * 0.12, LY * r * 0.12, 0.78); c.fill()
  c.fillStyle = css(mixc(base, 0xe8d8b8, 0.22)); blob(LX * r * 0.28, LY * r * 0.28, 0.45); c.fill()
  c.globalAlpha = 0.55 * a; c.fillStyle = '#fff4e0'; c.beginPath(); c.arc(x + LX * r * 0.42, y + LY * r * 0.42, r * 0.11, 0, TAU); c.fill()
  c.globalAlpha = 1
}
// a puff of dry soil dust: a soft disc, its gradient fixed (alpha comes from globalAlpha, so it bakes once)
function puff(c, x, y, r, a, col = 'rgba(150,118,84,') {
  if (a <= 0.005 || r < 1) return
  const g = c.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, col + '0.9)'); g.addColorStop(0.5, col + '0.45)'); g.addColorStop(1, col + '0)')
  c.globalAlpha = a; c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.globalAlpha = 1
}

// ---- A: it crumbles. The skin breaks into clods from its rim inward; each drops to the soil below (shrinking away from
// the lens, its shadow closing in), scatters a little, turns to a lit clod where it lands and sinks into the floor.
const CRUMB = [{ r0: 0, r1: 0.22, n: 4 }, { r0: 0.22, r1: 0.45, n: 8 }, { r0: 0.45, r1: 0.7, n: 12 }, { r0: 0.7, r1: 1, n: 16 }]
stage('break', 'macro:A', { world: 'macro', label: 'A · crumbles into soil clods that drop and settle', draw(k) {
  const tx = k.snap(k.from, k.ph0), P = cutSkin('crumb', CRUMB, 3), U = k.R * 1.5, c = k.px(0), fl = k.floor
  k.boss.alpha = ease(win(k.u, 0.1, 0.65)); k.boss.scale = 0.9 + 0.1 * ease(win(k.u, 0.1, 0.7))
  P.forEach((pc, i) => {
    // the rim goes first: it starts at t0, falls for 0.28 of the beat, lands at t1
    const t0 = 0.02 + 0.32 * (1 - pc.d) + 0.08 * hash(i, 5), t1 = t0 + 0.28
    const f = win(k.u, t0, t1), ang = Math.atan2(pc.c[1], pc.c[0]) + 0.6 * (hash(i, 7) - 0.5)
    const reach = U * (0.25 + 0.55 * pc.d + 0.25 * hash(i, 8)), ex = Math.cos(ang) * reach, ey = Math.sin(ang) * reach
    const px = k.x + pc.c[0] * U, py = k.y + pc.c[1] * U
    const rC = U * Math.min(0.15, 0.06 + 0.12 * Math.sqrt(pc.d / (CRUMB[pc.ring].n / 4))) * (0.7 + 0.5 * hash(i, 9))
    if (f < 1) {
      // in the air: the piece of skin, browning as it crumbles, drifts out and shrinks toward the floor
      const fe = f * f, ox = ex * (1 - (1 - f) * (1 - f)), oy = ey * (1 - (1 - f) * (1 - f))
      const sc = 1 - 0.55 * fe, tint = mixc(0xffffff, 0x9a7650, ease(clamp01(f * 1.6)))
      if (f > 0) { c.globalAlpha = 0.35 * f; c.fillStyle = '#0a0503'; c.beginPath(); c.arc(px + ox + U * 0.12 * (1 - f), py + oy + U * 0.16 * (1 - f), rC * (1.4 - 0.4 * f), 0, TAU); c.fill(); c.globalAlpha = 1 }
      drawPiece(c, k, tx, pc, i, ox, oy, (hash(i, 6) - 0.5) * 1.6 * fe, sc, 1 - 0.5 * fe, tint)
      // the piece balls into a clod as it falls
      clod(c, px + ox, py + oy, rC * (1.3 - 0.3 * f), i, ease(win(f, 0.45, 1)))
    } else {
      // landed: a clod on the soil, a small dust kick, then it sinks into the floor
      const land = win(k.u, t1, t1 + 0.12), gone = ease(win(k.u, 0.78 + 0.1 * hash(i, 4), 1))
      const bx = px + ex * (1 + 0.12 * land), by = py + ey * (1 + 0.12 * land)
      puff(fl, bx, by, rC * (1.2 + 2.2 * land), 0.35 * (1 - land))
      clod(fl, bx, by, rC * (1 - 0.35 * gone), i, 1 - gone)
    }
  })
} })

// ---- B: it slumps. The skin sags in on itself, its pieces sinking (shrinking, browning, going soft) one after another
// from the middle out, while a cloud of dry soil dust billows off it, drifts down-wind and thins away.
const SLUMP = [{ r0: 0, r1: 0.3, n: 5 }, { r0: 0.3, r1: 0.65, n: 9 }, { r0: 0.65, r1: 1, n: 13 }]
stage('break', 'macro:B', { world: 'macro', label: 'B · slumps into a dust cloud that drifts and thins', draw(k) {
  const tx = k.snap(k.from, k.ph0), P = cutSkin('slump', SLUMP, 7), U = k.R * 1.5, c = k.px(0), d = k.px(1)
  k.boss.alpha = ease(win(k.u, 0.2, 0.75)); k.boss.scale = 0.92 + 0.08 * ease(win(k.u, 0.2, 0.8))
  // the drift: down-wind (right, a little down), slowing
  const wind = ease(win(k.u, 0, 1)), wx = U * 0.55 * wind, wy = U * 0.18 * wind
  P.forEach((pc, i) => {
    const t0 = 0.0 + 0.18 * pc.d + 0.06 * hash(i, 3), f = win(k.u, t0, t0 + 0.42)
    const sc = 1 - 0.5 * ease(f), toward = 0.35 * ease(f)   // sags toward the middle
    const tint = mixc(0xffffff, 0x8c6a48, ease(clamp01(f * 1.4)))
    drawPiece(c, k, tx, pc, i, -pc.c[0] * U * toward + wx * 0.3 * f, -pc.c[1] * U * toward + U * 0.08 * f, 0, sc, 1 - ease(win(f, 0.35, 1)), tint)
  })
  // the dust: puffs born round the skin's body as it gives, swelling, drifting and thinning by the end
  for (let i = 0; i < 26; i++) {
    const t0 = 0.04 + 0.3 * hash(i, 11), f = win(k.u, t0, 1)
    if (f <= 0) continue
    const a = hash(i, 12) * TAU, r0 = U * (0.15 + 0.6 * Math.sqrt(hash(i, 13)))
    const x = k.x + Math.cos(a) * r0 * (1 + 0.5 * ease(f)) + wx * (0.6 + 0.6 * hash(i, 14))
    const y = k.y + Math.sin(a) * r0 * (1 + 0.5 * ease(f)) + wy * (0.6 + 0.6 * hash(i, 14))
    const r = U * (0.22 + 0.2 * hash(i, 15)) * (0.6 + 0.9 * ease(f))
    const al = 0.55 * win(f, 0, 0.12) * (1 - ease(win(f, 0.25, 1)))
    puff(d, x, y, r, al, hash(i, 16) < 0.5 ? 'rgba(150,118,84,' : 'rgba(186,156,118,')
  }
} })
export { win, hash }
