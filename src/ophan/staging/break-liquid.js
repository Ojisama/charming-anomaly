// THE BREAK, the Core (liquid): the broken skin comes apart in this world's own medium while the next skin shows under it.
// Owner ruling 2026-10-25: 0.12 s hit-stop (the sim's), then 0.8 s; the looks below are the playground's candidates.
// Molten iron-nickel, never rock: chrome bodies lit from the top left, white-hot cores that cool to mirror as they settle.
import { stage, ease, win, hash } from '../staging.js'

const TAU = Math.PI * 2
const out = (u) => 1 - (1 - u) * (1 - u)
// px2d c with `pre` laid on it right after the painter's own begin (drawBoss resets the context first): a transform, a clip
const under = (c, pre) => new Proxy(c, {
  get: (t, p) => p === 'begin' ? () => { t.begin(); pre(t) } : typeof t[p] === 'function' ? t[p].bind(t) : t[p],
  set: (t, p, v) => { t[p] = v; return true },
})
// a wobbly closed blob round (x, y), rx along angle a, ry across it, smoothed through its edge midpoints
function blob(c, x, y, rx, ry, a, seed, wob = 0.3, n = 14) {
  const ca = Math.cos(a), sa = Math.sin(a), P = []
  for (let j = 0; j < n; j++) {
    const t = (j / n) * TAU, r = 1 + wob * (hash(seed, j) - 0.5), lx = Math.cos(t) * rx * r, ly = Math.sin(t) * ry * r
    P.push([x + lx * ca - ly * sa, y + lx * sa + ly * ca])
  }
  const m = (i) => { const p = P[i % n], q = P[(i + 1) % n]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] }
  c.beginPath(); c.moveTo(...m(n - 1))
  for (let j = 0; j < n; j++) c.quadraticCurveTo(P[j][0], P[j][1], ...m(j))
  c.closePath()
}
// the fills: fixed stop lists (px2d bakes one texture per list), the heat carried by globalAlpha, never by the stops
const chrome = (c, x, y, r) => {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x, y, r)
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.2, '#e6ecf2'); g.addColorStop(0.55, '#8b97a6'); g.addColorStop(0.85, '#3b424d'); g.addColorStop(1, '#1b1e23')
  return g
}
// a sheet of mercury seen from above: dark, mirror-bright where it catches the lamp, a lit meniscus at its edge
const pool = (c, x, y, r) => {
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35, 0, x, y, r)
  g.addColorStop(0, '#eef2f7'); g.addColorStop(0.12, '#a3aebc'); g.addColorStop(0.4, '#535b67'); g.addColorStop(0.8, '#2b3038'); g.addColorStop(1, '#3a414b')
  return g
}
const hot = (c, x, y, r) => {
  const g = c.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, 'rgba(255,250,236,1)'); g.addColorStop(0.45, 'rgba(255,186,92,0.85)'); g.addColorStop(1, 'rgba(255,96,24,0)')
  return g
}
// heat as light: an additive glow of radius r, strength a
function glow(c, x, y, r, a) {
  if (a <= 0.01) return
  c.globalCompositeOperation = 'lighter'; c.globalAlpha = a
  c.fillStyle = hot(c, x, y, r); c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill()
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1
}
// a molten drop: chrome body stretched along a, a white-hot core over it while it is hot
function drop(c, x, y, rx, ry, a, heat, al = 1) {
  const r = Math.max(rx, ry)
  c.globalAlpha = al; c.fillStyle = chrome(c, x, y, r); c.beginPath(); c.ellipse(x, y, rx, ry, a, 0, TAU); c.fill()
  if (heat > 0.01) {
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = al * heat * 0.6
    c.fillStyle = hot(c, x, y, r); c.beginPath(); c.ellipse(x, y, rx, ry, a, 0, TAU); c.fill()
    c.globalCompositeOperation = 'source-over'
  }
  c.globalAlpha = al
  c.fillStyle = 'rgba(255,255,255,0.95)'; c.beginPath(); c.ellipse(x - rx * 0.3, y - ry * 0.38, r * 0.22, r * 0.12, -0.6, 0, TAU); c.fill()
  c.globalAlpha = 1
}
const pop = (k, a, b) => { const r = ease(win(k.u, a, b)); k.boss.alpha = r; k.boss.scale = 0.85 + 0.15 * r }

// ---- A: the skin bursts into molten chrome: drops fly out trailing heat, splash flat on the floor in crowns of beads,
// cool from white-hot to mirror and are gone
stage('break', 'liquid:A', { world: 'liquid', label: 'A · chrome splash: molten droplets burst out and splash', draw(k) {
  const { u, x, y, R } = k, c = k.px(1), f = k.floor
  pop(k, 0.12, 0.5)
  const sw = win(u, 0, 0.14)
  if (sw < 1) { k.fadePx(0, 1 - sw, 1 + 0.14 * sw, x, y); k.drawBoss(k.from, k.px(0), x, y, R, k.ph0) }
  // the burst's heat, local and quick
  const bg = win(u, 0, 0.32)
  if (bg < 1) glow(c, x, y, R * (0.8 + 0.7 * bg), 0.55 * (1 - bg) * Math.min(1, u / 0.03))
  const N = 20, fade = 1 - win(u, 0.62, 0.97)
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU + (hash(i, 1) - 0.5) * 0.4, D = R * (1.1 + 1.15 * hash(i, 2)), s = R * (i % 3 ? 0.07 + 0.05 * hash(i, 3) : 0.13 + 0.07 * hash(i, 3))
    const tl = 0.2 + 0.2 * hash(i, 4), p = win(u, 0.03, tl), heat = 1 - win(u, 0.03, 0.5)
    const ca = Math.cos(a), sa = Math.sin(a)
    if (p >= 1) {
      // the splash: a flat puddle that spreads, its crown of beads thrown out round it
      const g = win(u, tl, tl + 0.1), px = x + ca * D, py = y + sa * D, sp = out(g)
      for (let j = 0; j < 6; j++) {
        if (g >= 1) break
        const ba = a + (j / 6) * TAU + hash(i, 10 + j), br = s * (1.1 + 1.5 * sp), bs = s * 0.24 * (1 - g)
        drop(f, px + Math.cos(ba) * br, py + Math.sin(ba) * br, bs, bs, 0, heat, fade)
      }
      f.globalAlpha = fade
      blob(f, px, py, s * (1.2 + 1.3 * sp), s * (0.9 + 0.8 * sp), a, i + 40, 0.6, 14)
      f.fillStyle = pool(f, px, py, s * (1.3 + 1.2 * sp)); f.fill()
      if (heat > 0.01) { f.globalCompositeOperation = 'lighter'; f.globalAlpha = fade * heat * 0.7; f.fillStyle = hot(f, px, py, s * 1.8); f.fill(); f.globalCompositeOperation = 'source-over' }
      f.globalAlpha = fade; f.fillStyle = 'rgba(255,255,255,0.9)'; f.beginPath(); f.ellipse(px - s * 0.45, py - s * 0.35, s * 0.4, s * 0.13, -0.5, 0, TAU); f.fill()
      f.globalAlpha = 1
      glow(f, px, py, s * 2.4, 0.3 * heat * fade)
      continue
    }
    if (p <= 0) continue
    // in flight: stretched along its path, a thin hot trail behind it
    const r = R * 0.3 + (D - R * 0.3) * (1 - Math.pow(1 - p, 2.5)), px = x + ca * r, py = y + sa * r, st = 1 - p
    const L = R * 0.5 * st
    c.lineCap = 'round'; c.globalAlpha = st * 0.8
    c.strokeStyle = '#aab5c3'; c.lineWidth = s * 0.5; c.beginPath(); c.moveTo(px, py); c.lineTo(px - ca * L * 0.6, py - sa * L * 0.6); c.stroke()
    c.lineWidth = s * 0.25; c.beginPath(); c.moveTo(px, py); c.lineTo(px - ca * L, py - sa * L); c.stroke(); c.globalAlpha = 1
    glow(c, px, py, s * 2.2, 0.35 * heat)
    drop(c, px, py, s * (1 + 1.4 * st), s * (1 - 0.25 * st), a, heat)
  }
} })

// ---- B: the skin sags and runs: it slumps flat and fades while molten runnels creep out from under it and drops fall from
// its edge, all pooling into a white-hot sheet of mercury on the floor that spreads, cools to mirror and is gone
stage('break', 'liquid:B', { world: 'liquid', label: 'B · mercury drip: the skin melts into a spreading pool', draw(k) {
  const { u, x, y, R } = k, c = k.px(1), f = k.floor
  pop(k, 0.35, 0.85)
  const heat = 1 - win(u, 0.1, 0.75), fade = 1 - win(u, 0.65, 0.97), sag = ease(win(u, 0.02, 0.5))
  // the slump: wider, flatter, gone
  const al = 1 - win(u, 0.12, 0.5)
  if (al > 0) {
    k.fadePx(0, al)
    k.drawBoss(k.from, under(k.px(0), (q) => { q.save(); q.translate(x, y + R * 0.15 * sag); q.scale(1 + 0.28 * sag, 1 + 0.12 * sag); q.translate(-x, -y) }), x, y, R, k.ph0)
    k.px(0).restore()
    glow(c, x, y, R * 1.1, 0.35 * al * Math.min(1, u / 0.04))
  }
  // the pool: ONE contour, a spreading sheet with fingers running out of it (one fill, so a fade shows no seams)
  const Rp = R * (0.25 + 0.95 * out(win(u, 0.06, 0.78))), py0 = y + R * 0.1, F = []
  for (let i = 0; i < 7; i++) {
    const g = ease(win(u, 0.06 + 0.12 * hash(i, 4), 0.62 + 0.2 * hash(i, 5)))
    F.push({ a: (i / 7) * TAU + (hash(i, 1) - 0.5) * 0.6, L: R * (0.35 + 0.6 * hash(i, 3)) * g, s: 0.16 + 0.1 * hash(i, 6) })
  }
  const n = 96, P = []
  let ext = Rp
  for (let j = 0; j < n; j++) {
    const t = (j / n) * TAU
    let r = Rp * (1 + 0.1 * Math.sin(t * 3 + 1.3) + 0.06 * Math.sin(t * 5 + 0.4))
    for (const q of F) { const d = Math.atan2(Math.sin(t - q.a), Math.cos(t - q.a)) / q.s; if (d * d < 1) r += q.L * Math.pow(1 - d * d, 1.5) }
    ext = Math.max(ext, r); P.push([x + Math.cos(t) * r * 1.08, py0 + Math.sin(t) * r * 0.92])
  }
  const mid = (i) => { const p = P[i % n], q = P[(i + 1) % n]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] }
  f.globalAlpha = fade
  f.beginPath(); f.moveTo(...mid(n - 1)); for (let j = 0; j < n; j++) f.quadraticCurveTo(P[j][0], P[j][1], ...mid(j)); f.closePath()
  f.fillStyle = pool(f, x, py0, ext * 1.05); f.fill()
  // the meniscus: lit on the lamp's side, gone on the far one
  const lg = f.createLinearGradient(x - ext, py0 - ext, x + ext * 0.6, py0 + ext * 0.6)
  lg.addColorStop(0, 'rgba(236,242,248,0.95)'); lg.addColorStop(0.5, 'rgba(160,172,186,0.4)'); lg.addColorStop(1, 'rgba(20,22,26,0.6)')
  f.strokeStyle = lg; f.lineWidth = R * 0.05; f.stroke()
  if (heat > 0.01) { f.globalCompositeOperation = 'lighter'; f.globalAlpha = fade * heat * 0.5; f.fillStyle = hot(f, x, py0, ext); f.fill(); f.globalCompositeOperation = 'source-over' }
  // mirror streaks on its skin, drifting as it spreads, and a glint at each finger's tip, hot while it runs
  f.globalAlpha = fade * 0.9; f.fillStyle = '#f4f8fc'
  for (let j = 0; j < 3; j++) { f.beginPath(); f.ellipse(x - Rp * (0.38 - 0.3 * j) + Rp * 0.1 * u, py0 - Rp * (0.42 - 0.24 * j), Rp * (0.3 - 0.08 * j), Rp * 0.045, -0.4, 0, TAU); f.fill() }
  for (const q of F) {
    if (q.L < R * 0.15) continue
    const r = Rp + q.L * 0.8, tx = x + Math.cos(q.a) * r * 1.08, ty = py0 + Math.sin(q.a) * r * 0.92
    f.globalAlpha = fade * 0.9; f.fillStyle = '#f4f8fc'; f.beginPath(); f.ellipse(tx - R * 0.04, ty - R * 0.04, R * 0.07, R * 0.03, q.a, 0, TAU); f.fill()
    glow(f, tx, ty, R * 0.35, 0.4 * heat * fade)
  }
  f.globalAlpha = 1
  glow(f, x, py0, Rp * 1.25, 0.22 * heat * fade)
  // drops falling from the sagging edge: they shrink as they fall (plan view) and ring the pool where they land
  for (let i = 0; i < 6; i++) {
    const ts = 0.08 + 0.32 * hash(i, 11), a = hash(i, 12) * TAU, r0 = R * (0.75 + 0.4 * hash(i, 13)), fall = win(u, ts, ts + 0.12), rip = win(u, ts + 0.12, ts + 0.3)
    const px = x + Math.cos(a) * (r0 + R * 0.12 * fall), py = y + Math.sin(a) * (r0 + R * 0.12 * fall)
    if (fall > 0 && fall < 1) { const s = R * (0.12 - 0.05 * fall); drop(c, px, py, s, s * 1.15, a, heat) }
    if (rip > 0 && rip < 1) { f.globalAlpha = (1 - rip) * 0.8 * fade; f.strokeStyle = '#e8eef5'; f.lineWidth = R * 0.03; f.beginPath(); f.ellipse(px, py, R * (0.08 + 0.4 * rip), R * (0.07 + 0.32 * rip), a, 0, TAU); f.stroke(); f.globalAlpha = 1 }
  }
} })
export { win, hash }
