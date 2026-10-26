// The player in the Ophan's sketch, drawn by hand in the pencil painter's graphite: every line a wobbling stroke tapered
// at both ends that overshoots where it closes, a lighter second pass, uneven hatching with a cross-hatch in the deepest
// shade, and the construction left in (faint axes, a guide oval, an outline left open). The same parts the Book 1 rig
// wears (render.js pencilPlayer, as holoPlayer): the blob with its face, the cheeks skin's body, its two jiggling cheeks
// and a foot, so the skin's jiggle and stride come along. Painted about the body's centre in world px (bakeLocal).
export const PENCIL_PLAYER_E = 40
const R = 22, TAU = Math.PI * 2, PAPER = '#f2efe6'
const G = (a) => `rgba(38,38,46,${Math.max(0, Math.min(1, a)).toFixed(3)})`
const rnd = (s) => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }

// one stroke along p(u) = [x, y, nx, ny] for u in [-over, 1 + over]: the hand wobbles along the normal and presses
// hardest mid-stroke
function hand(ctx, p, { a = 0.9, lw = 1.3, seed = 1, wob = 0.45, n = 48, over = 0.04 } = {}) {
  const f1 = 1.5 + rnd(seed) * 2.5, f2 = 4 + rnd(seed + 1) * 4, p1 = rnd(seed + 2) * TAU, p2 = rnd(seed + 3) * TAU
  ctx.lineCap = 'round'
  let px = 0, py = 0
  for (let k = 0; k <= n; k++) {
    const u = -over + (1 + 2 * over) * k / n, [x, y, nx, ny] = p(u)
    const w = wob * (Math.sin(u * f1 * Math.PI + p1) * 0.7 + Math.sin(u * f2 * Math.PI + p2) * 0.3)
    const qx = x + nx * w, qy = y + ny * w
    if (k) {
      const pr = Math.sqrt(Math.sin(Math.PI * k / n))
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy)
      ctx.lineWidth = lw * (0.3 + 0.7 * pr); ctx.strokeStyle = G(a * (0.5 + 0.5 * pr)); ctx.stroke()
    }
    px = qx; py = qy
  }
}
// an ellipse [x, y, rx, ry, rot] from angle t0 to t1, k its scale
const ellP = (s, t0, t1, k = 1) => (u) => {
  const th = t0 + (t1 - t0) * u, c = Math.cos(th), sn = Math.sin(th), lx = s[2] * k * c, ly = s[3] * k * sn, cr = Math.cos(s[4]), sr = Math.sin(s[4])
  return [s[0] + lx * cr - ly * sr, s[1] + lx * sr + ly * cr, c * cr - sn * sr, c * sr + sn * cr]
}
const ell = (ctx, s) => ctx.ellipse(s[0], s[1], s[2], s[3], s[4], 0, TAU)
// a closed shape as a hand closes it: one loop from a seeded start (open by gap radians, else overshooting its start),
// then a lighter partial re-stroke
function loop(ctx, s, a, lw, seed, { gap = 0, again = 0.6 } = {}) {
  const t0 = rnd(seed) * TAU
  hand(ctx, ellP(s, t0, t0 + TAU - gap), { a, lw, seed, over: gap ? 0 : 0.05 })
  if (again) { const t1 = rnd(seed + 9) * TAU; hand(ctx, ellP(s, t1, t1 + TAU * again, 1 + (rnd(seed + 5) - 0.5) * 0.05), { a: a * 0.45, lw: lw * 0.65, seed: seed + 50, over: 0 }) }
}
// hatching over the clipped region: strokes at angle ang, uneven in spacing, length, pressure and placement
function hatch(ctx, cx, cy, rad, ang, gap, a, lw, seed) {
  const c = Math.cos(ang), s = Math.sin(ang)
  for (let d = -rad, i = 0; d < rad; d += gap * (0.8 + 0.4 * rnd(seed + i * 3)), i++) {
    const L = rad * (0.55 + 0.45 * rnd(seed + i)), off = (rnd(seed + i * 7) - 0.5) * rad * 0.5, x0 = cx - s * d, y0 = cy + c * d
    hand(ctx, (u) => { const t = off - L + 2 * L * u; return [x0 + c * t, y0 + s * t, -s, c] }, { a: a * (0.6 + 0.4 * rnd(seed + i * 5)), lw, seed: seed * 31 + i, wob: gap * 0.3, n: 8, over: 0 })
  }
}
const line = (ctx, x0, y0, x1, y1, a, seed) => hand(ctx, (u) => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 0, 1], { a, lw: 0.5, seed, wob: 0.3, n: 10, over: 0 })
// clip to outside the ellipse s (inside whatever clip is already set)
const clipOut = (ctx, s) => { ctx.beginPath(); ctx.rect(-R * 3, -R * 3, R * 6, R * 6); ell(ctx, s); ctx.clip('evenodd') }

export function paintPencilPlayer(ctx) {
  const s = [0, 0, R, R * 0.91, 0]
  line(ctx, -R * 1.3, -R * 0.18, R * 1.3, -R * 0.18 + 1, 0.2, 3); line(ctx, 0, -R * 1.25, 1, R * 1.25, 0.2, 5)
  hand(ctx, ellP(s, 0, TAU, 1.1), { a: 0.14, lw: 0.5, seed: 3, over: 0.03 })
  ctx.beginPath(); ell(ctx, s); ctx.fillStyle = PAPER; ctx.fill()
  ctx.save(); ctx.beginPath(); ell(ctx, s); ctx.clip(); clipOut(ctx, [-R * 0.2, -R * 0.22, R * 0.95, R * 0.85, 0])
  hatch(ctx, 0, 0, R * 1.2, -0.85, 2.3, 0.55, 0.7, 4)
  hatch(ctx, R * 0.4, R * 0.45, R * 0.5, 0.6, 2.6, 0.35, 0.6, 9)
  ctx.restore()
  loop(ctx, s, 0.92, 1.45, 6, { gap: 0.6 })
  // the face where the game draws it: the eyes (r 0.23R at +-0.36R, -0.18R) with their pupils, the smile
  for (const sx of [-1, 1]) {
    const e = [sx * R * 0.36, -R * 0.18, R * 0.23, R * 0.23, 0]
    ctx.beginPath(); ell(ctx, e); ctx.fillStyle = PAPER; ctx.fill(); loop(ctx, e, 0.8, 0.9, 20 + sx, { again: 0 })
    ctx.beginPath(); ctx.arc(e[0] + R * 0.03, e[1] + R * 0.03, R * 0.11, 0, TAU); ctx.fillStyle = G(0.9); ctx.fill()
    ctx.beginPath(); ctx.arc(e[0] - R * 0.01, e[1] - R * 0.02, R * 0.035, 0, TAU); ctx.fillStyle = PAPER; ctx.fill()
  }
  hand(ctx, ellP([0, R * 0.2, R * 0.2, R * 0.2, 0], Math.PI * 0.15, Math.PI * 0.85), { a: 0.85, lw: 1.1, seed: 31, wob: 0.25, n: 16, over: 0.05 })
}
// The cheeks skin. g is the butt's geometry from render.js (blobButtGeom): g.cheeks the two cheek ellipses [x, y, rx, ry, rot].
//   part 'body' — the paper both cheeks sit on with the construction round it (its white twin is the mask the jiggling
//   cheeks are clipped by, so it must contain them);
//   part 'cheeks' — the two cheeks, hatched and outlined, the cleft between them: the layer that jiggles.
export function paintPencilButt(ctx, part, g) {
  const C = g.cheeks
  if (part === 'body') {
    line(ctx, -R * 1.25, 0, R * 1.3, -1, 0.2, 7); line(ctx, 0, -R * 1.25, 1, R * 1.25, 0.2, 9)
    for (const c of C) hand(ctx, ellP(c, 0, TAU, 1.12), { a: 0.14, lw: 0.5, seed: 11 + c[0], over: 0.03 })
    const S = g.shell, n = S.length / 2, path = () => { ctx.beginPath(); ctx.moveTo(S[0], S[1]); for (let i = 1; i < n; i++) ctx.lineTo(S[2 * i], S[2 * i + 1]); ctx.closePath() }
    path(); ctx.fillStyle = PAPER; ctx.fill()
    // the seat under the cheeks in shade, cross-hatched
    ctx.save(); path(); ctx.clip()
    hatch(ctx, 0, R * 0.5, R * 1.1, -0.85, 2.3, 0.55, 0.7, 13); hatch(ctx, 0, R * 0.6, R * 0.6, 0.6, 2.6, 0.4, 0.6, 17)
    ctx.restore()
    // its outline by hand, from a seeded point round the polygon, overshooting where it closes
    const i0 = Math.floor(rnd(19) * n)
    hand(ctx, (u) => {
      const f = ((u * n + i0) % n + n) % n, i = Math.floor(f), j = (i + 1) % n, t = f - i
      const dx = S[2 * j] - S[2 * i], dy = S[2 * j + 1] - S[2 * i + 1], d = Math.hypot(dx, dy) || 1
      return [S[2 * i] + dx * t, S[2 * i + 1] + dy * t, dy / d, -dx / d]
    }, { a: 0.92, lw: 1.45, seed: 21, n: 96, over: 0.05 })
    return
  }
  C.forEach((c, i) => {
    const sx = Math.sign(c[0]) || 1, w = Math.abs(c[3] * Math.cos(c[4] - Math.PI / 2)) + Math.abs(c[2] * Math.sin(c[4] - Math.PI / 2)), h = Math.max(c[2], c[3])
    ctx.beginPath(); ell(ctx, c); ctx.fillStyle = PAPER; ctx.fill()
    ctx.save(); ctx.beginPath(); ell(ctx, c); ctx.clip()
    // the light stays on the upper outer curve; the seat and the cleft go to shade, cross-hatched where deepest
    ctx.save(); clipOut(ctx, [c[0] - sx * R * 0.08, c[1] - h * 0.22, w * 0.95, h * 0.85, 0]); hatch(ctx, c[0], c[1] + R * 0.2, h * 1.3, -0.85, 2.3, 0.5, 0.7, 3 + sx); ctx.restore()
    ctx.restore()
    // the seat's outline is the silhouette: a cheek's own is the lighter fold inside it
    loop(ctx, c, 0.6, 1.05, 5 + i * 11, { gap: i === 0 ? 0.7 : 0, again: 0.3 })
  })
  hand(ctx, (u) => [2 * (1 - u) * u * R * 0.06, -R * 0.62 + R * 1.0 * u, 1, 0], { a: 0.85, lw: 1.1, seed: 77, over: 0.06 })
}
// one foot of the cheeks skin, about its own centre
export function paintPencilFoot(ctx, rx, ry) {
  const s = [0, 0, rx, ry, 0]
  ctx.beginPath(); ell(ctx, s); ctx.fillStyle = PAPER; ctx.fill()
  loop(ctx, s, 0.8, 1, 40, { again: 0.4 })
}
