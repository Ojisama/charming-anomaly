// round 1's breaks, back as C and D: a break is this skin dying for good
// THE BREAK, the Magma (pixel): the broken skin comes apart in this world's own medium while the next skin shows under it.
// Owner ruling 2026-10-25: 0.12 s hit-stop (the sim's), then 0.8 s; the looks below are the playground's candidates.
// The broken skin is read once into chunky cells (break-ascii.js cellsOf) and every cell is one flat square in the
// world's palette: heat walks it down the lava ramp (painters/pixel.js LV) to the chapter's basalt, never a blend.
import { stage, ease, win, hash } from '../staging.js'
import { cellsOf } from './break-ascii.js'

// white-hot -> cooled lava -> crust (painters/pixel.js LV, then its ROCK basalt)
const HEAT = ['#2c2430', '#40091a', '#7a1004', '#d8340c', '#ff6a14', '#ffa22a', '#ffd858', '#fff4c4']
const CRUST = ['#2c2430', '#463c4c', '#3a3040']   // the chapter's basalt plates (painters/pixel.js ROCK)
const heatCol = (h) => HEAT[Math.max(0, Math.min(HEAT.length - 1, Math.floor(h * HEAT.length)))]
const hex = (q) => '#' + [q.r, q.g, q.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
const under = (k, a, b) => { const r = ease(win(k.u, a, b)); k.boss.alpha = r; k.boss.scale = 0.88 + 0.12 * r }
const whole = (k, b) => { const a = 1 - win(k.u, 0, b); if (a > 0) { k.fadePx(2, a, 1, k.x, k.y); k.drawBoss(k.from, k.px(2), k.x, k.y, k.R, Math.round(k.ph0 ?? k.ph)) } }
// the boss on the floor's px2d: k.floor is in the shown world's stage px, the boss in its own slot's
const onFloor = (k) => { const S = k.S, A = k.A, q = S.k / A.k; return { x: (k.x * S.k + S.ox - A.ox) / A.k, y: (k.y * S.k + S.oy - A.oy) / A.k, R: k.R * q } }
// a square snapped to the stage px grid, so a chunk stays a chunk
const sq = (c, x, y, s) => { const w = Math.max(1, Math.round(s)); c.fillRect(Math.round(x - w / 2), Math.round(y - w / 2), w, w) }

stage('break', 'pixel:C', { world: 'pixel', label: 'C · (round 1, it dies) pixel burst: chunks fly out white-hot and cool dark', draw(k) {
  const u = k.u, c = k.px(1), P = k.R * 0.1
  under(k, 0.15, 0.75)
  whole(k, 0.05)
  // the heat under it: a short local glow on the floor round the body, gone by mid-beat
  const gl = 1 - win(u, 0, 0.5)
  if (gl > 0) {
    const F = onFloor(k), g = k.floor.createRadialGradient(F.x, F.y, 0, F.x, F.y, F.R * 1.8)
    g.addColorStop(0, 'rgba(255,162,42,0.55)'); g.addColorStop(0.5, 'rgba(216,52,12,0.25)'); g.addColorStop(1, 'rgba(216,52,12,0)')
    k.floor.globalAlpha = gl; k.floor.fillStyle = g; k.floor.fillRect(F.x - F.R * 1.8, F.y - F.R * 1.8, F.R * 3.6, F.R * 3.6); k.floor.globalAlpha = 1
  }
  const L = cellsOf(k, P)
  for (const pass of [0, 1]) for (const q of L) {
    const h1 = hash(q.i, q.j), h2 = hash(q.j + 31, q.i + 7), d = Math.hypot(q.ox, q.oy) || 1
    // the whole body flashes up the ramp in place (0-0.08), then every chunk is flung out, slowing as it skids on the floor
    const go = 1 - Math.pow(1 - win(u, 0.06 + 0.04 * h1, 0.72 + 0.1 * h2), 2.8)
    const a = Math.atan2(q.oy, q.ox) + (h2 - 0.5) * 0.6, fly = k.R * (0.35 + 0.8 * h2 * h2 + 0.2 * d / k.R) * go
    const x = k.x + q.ox + Math.cos(a) * fly, y = k.y + q.oy + Math.sin(a) * fly
    const heat = win(u, 0, 0.07) * (1 - win(u, 0.12 + 0.1 * h1, 0.7 + 0.25 * h2))
    const al = 1 - win(u, 0.78 + 0.1 * h1, 0.97)
    if (al <= 0) continue
    const s = P * (1.1 - 0.45 * go) * (h1 > 0.8 ? 1.4 : 1)
    if (pass === 0) {
      // the halo round a hot chunk, additive, only while it glows
      if (heat > 0.45 && (q.i + q.j) % 2 === 0) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.35 * (heat - 0.45) * al; c.fillStyle = '#ff6a14'; sq(c, x, y, s * 2.6); c.globalCompositeOperation = 'source-over' }
      continue
    }
    c.globalAlpha = al
    c.fillStyle = u < 0.025 ? hex(q) : heatCol(0.15 + 0.85 * heat * (0.75 + 0.25 * q.l))
    sq(c, x, y, s)
  }
  c.globalAlpha = 1
} })

stage('break', 'pixel:D', { world: 'pixel', label: 'D · (round 1, it dies) melt-down: slumps into a lava puddle that crusts', draw(k) {
  const u = k.u, c = k.px(1), P = k.R * 0.1, f = k.floor, F = onFloor(k), cx = F.x, cy = F.y + F.R * 0.1
  under(k, 0.35, 0.9)
  whole(k, 0.06)
  // THE PUDDLE, on the floor under the new skin: spreads as the body runs into it, then crusts from its rim inward with
  // glowing cracks, and is gone by the end
  const spread = ease(win(u, 0.06, 0.55)), cool = win(u, 0.38, 0.9), fade = 1 - win(u, 0.82, 1)
  const rad = F.R * (0.3 + 1.0 * spread), G = F.R * 0.11
  if (fade > 0 && spread > 0) {
    const g = f.createRadialGradient(cx, cy, 0, cx, cy, rad * 1.6)
    g.addColorStop(0, 'rgba(255,106,20,0.45)'); g.addColorStop(1, 'rgba(216,52,12,0)')
    f.globalAlpha = fade * (1 - cool * 0.8); f.fillStyle = g; f.fillRect(cx - rad * 1.6, cy - rad * 1.6, rad * 3.2, rad * 3.2)
    f.globalAlpha = fade
    const n = Math.ceil(rad / G) + 1
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
      const x = i * G, y = j * G * 0.8, d = Math.hypot(x, y), an = Math.atan2(y, x)
      // a lumpy rim: the edge's radius wobbles by angle, the same every frame
      const e = rad * (0.82 + 0.12 * Math.sin(an * 3 + 1.3) + 0.08 * Math.sin(an * 5 + 4.1))
      if (d > e) continue
      const r = d / e, crack = hash(i + 40, j + 40) < 0.2
      // the crust front: from the rim (r 1) in to the heart as it cools
      const crust = r > 1 - cool * 1.15
      let h = r < 0.35 ? 0.9 : r < 0.7 ? 0.75 : r < 0.9 ? 0.6 : 0.45
      if (crust) { f.fillStyle = crack ? heatCol(0.45 - 0.2 * cool) : CRUST[hash(i, j + 70) * 3 | 0]; sq(f, cx + x, cy + y, G + 1); continue }
      f.fillStyle = heatCol(h); sq(f, cx + x, cy + y, G + 1)
    }
    f.globalAlpha = 1
  }
  // THE BODY slumps: each chunk heats up the ramp and slides in toward the puddle's heart, swelling as it runs and
  // merging into it; the rim (the wings) goes first
  for (const q of cellsOf(k, P)) {
    const h1 = hash(q.i, q.j), rim = Math.min(1, Math.hypot(q.ox, q.oy) / (k.R * 1.3))
    const m = ease(win(u, 0.03 + 0.12 * (1 - rim) + 0.05 * h1, 0.42 + 0.12 * (1 - rim)))
    const al = 1 - win(m, 0.75, 1)
    if (al <= 0) continue
    const x = q.ox * (1 - 0.7 * m), y = q.oy * (1 - 0.7 * m) + k.R * 0.1 * m
    c.globalAlpha = al
    // its own colour, then the lava ramp by its own brightness (the skin still reads, glowing), whiter as it runs
    const hot = win(u, 0.02, 0.1)
    c.fillStyle = hot <= 0 ? hex(q) : heatCol(0.3 + 0.4 * q.l * (0.7 + 0.3 * h1) + 0.3 * m * hot)
    sq(c, k.x + x, k.y + y, P * (1 + 0.8 * m) + 1)
  }
  c.globalAlpha = 1
} })
