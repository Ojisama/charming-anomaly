// THE BREAK, the Magma (pixel): the broken skin comes apart in this world's own medium while the next skin shows under it.
// Owner ruling 2026-10-25: 0.12 s hit-stop (the sim's), then 0.8 s; the look below is the one STAGE_PICK picked.
// The broken skin is read once into chunky cells (break-ascii.js cellsOf) and every cell is one flat square in the
// world's palette: heat walks it down the lava ramp (painters/pixel.js LV) to the chapter's basalt, never a blend.
import { stage, ease, win, hash } from '../staging.js'
import { cellsOf } from './break-ascii.js'

// white-hot -> cooled lava -> crust (painters/pixel.js LV, then its ROCK basalt)
const HEAT = ['#2c2430', '#40091a', '#7a1004', '#d8340c', '#ff6a14', '#ffa22a', '#ffd858', '#fff4c4']
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

