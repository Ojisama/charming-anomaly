// THE MANTLE'S MECHANIC TELLS (render-only; src/toon.js calls in). Plain, clear placeholders so every
// new sim field reaches the screen; a later art pass replaces the drawing, not the reads.
//   run.quenchCrusts   Quench Kettle's crust: basalt laid only where it covers lava, cracks glowing
//                      back to lava as it runs out, a ring of steam the moment it is poured
//   run.lavaPools      Crack Hammer's pools: a jagged ink-rimmed hole of lava, opening and closing
//   run.novas          look 'lavaWave' (Lava Bellows): a band of lava rolling out across its sector
//   run.player         boatT / boatMax / afloat: the basalt boat under you, lava rising over its rim
//                      as it sinks, a wobble in its last moments
//   enemies            strandT (a lava creature on dry rock: it greys over with crust, cracks glow red
//                      as it is about to crumble), meltT (a rock creature under the tide: an orange
//                      puddle spreading under it)
//   events             melt (an orange splash) and crumble (grey shards); both return true from event()
import { Graphics } from 'pixi.js'
import { PAL, TAU, hexNum, hash } from './palette.js'
import { mantleHeightAt } from '../sim.js'
import { MANTLE_STRAND_STUCK_T, MANTLE_STRAND_DIE_T, MANTLE_MELT_T } from '../config.js'

const C = {
  ink: hexNum(PAL.ink), basalt: hexNum(PAL.basalt), basaltHi: hexNum(PAL.basaltHi), basaltLo: hexNum(PAL.basaltLo),
  lavaDeep: hexNum(PAL.lavaDeep), lava: hexNum(PAL.lava), lavaHot: hexNum(PAL.lavaHot), lavaGlow: hexNum(PAL.lavaGlow),
  steam: hexNum(PAL.steam),
}
const CELL = 12   // px: the grid a crust is laid on (its cells over lava are drawn, the rest are not)

// a closed blobby outline round (x, y): radius r wobbling by `jag`, seeded so it never crawls
function blob(x, y, r, jag, seed, n = 18) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU
    const k = 1 + jag * (hash(i, seed, 7) * 2 - 1)
    pts.push(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k)
  }
  return pts
}

export function createMantleFx({ ground, boat, top }) {
  const groundG = new Graphics(), boatG = new Graphics(), topG = new Graphics()
  ground.addChild(groundG); boat.addChild(boatG); top.addChild(topG)
  // a crust's cells and their ground heights, sampled once (the ground never changes, the line does)
  const crustCells = new WeakMap()
  const bursts = []   // { kind: 'melt' | 'crumble', x, y, r, t, seed }
  function cellsOf(c, L, seed) {
    let cells = crustCells.get(c)
    if (cells) return cells
    cells = []
    const n = Math.ceil(c.r / CELL)
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
      const x = c.x + i * CELL, y = c.y + j * CELL
      if ((x - c.x) ** 2 + (y - c.y) ** 2 > c.r * c.r) continue
      cells.push({ x, y, h: L ? mantleHeightAt(L, seed, x, y) : 1 })
    }
    crustCells.set(c, cells)
    return cells
  }
  const inPool = (run, x, y) => {
    for (const q of run.lavaPools ?? []) if (q.t < q.dur && (x - q.x) ** 2 + (y - q.y) ** 2 <= q.r * q.r) return true
    return false
  }
  return {
    reset() { bursts.length = 0; groundG.clear(); boatG.clear(); topG.clear() },
    event(e) {
      if (e.type !== 'melt' && e.type !== 'crumble') return false
      bursts.push({ kind: e.type, x: e.x, y: e.y, r: e.r || 14, t: 0, seed: Math.floor(Math.abs(e.x * 7 + e.y * 13)) })
      if (bursts.length > 80) bursts.shift()
      return true
    },
    // tide = { L, T } (lavaTideOf, or the dry fallback with line -1); onScreen(x, y, r); t = animT
    sync(run, dt, tide, onScreen, t) {
      groundG.clear(); boatG.clear(); topG.clear()
      const { L, T } = tide
      const line = T.line
      // ---- the hammer's pools: a jagged hole of lava with an ink rim ----
      for (const q of run.lavaPools ?? []) {
        if (q.t >= q.dur || !onScreen(q.x, q.y, q.r)) continue
        const open = Math.min(1, q.t / 0.15), close = Math.min(1, (q.dur - q.t) / 0.4)
        const r = q.r * open * (0.75 + 0.25 * close)
        const sd = Math.floor(Math.abs(q.x * 3 + q.y * 5))
        groundG.poly(blob(q.x, q.y, r + 4, 0.16, sd)).fill({ color: C.ink, alpha: 0.9 })
        groundG.poly(blob(q.x, q.y, r, 0.14, sd)).fill({ color: C.lavaDeep })
        groundG.poly(blob(q.x, q.y, r * 0.78, 0.18, sd + 1)).fill({ color: C.lava })
        const pulse = 0.5 + 0.5 * Math.sin(t * 6 + sd)
        groundG.poly(blob(q.x + Math.sin(t * 2 + sd) * r * 0.1, q.y, r * (0.35 + 0.08 * pulse), 0.25, sd + 2, 12)).fill({ color: C.lavaGlow, alpha: 0.85 })
      }
      // ---- the kettle's crusts: basalt only over lava (the tide's or a pool's) ----
      for (const c of run.quenchCrusts ?? []) {
        if (c.t >= c.dur || !onScreen(c.x, c.y, c.r)) continue
        const cells = cellsOf(c, run.lavaTide ? L : null, T.seed)
        const rem = c.dur - c.t
        const glow = rem < 1 ? 1 - rem : 0   // the lava coming back through its cracks
        for (const k of cells) {
          if (!(k.h < line || inPool(run, k.x, k.y))) continue
          const v = hash(Math.round(k.x / CELL), Math.round(k.y / CELL), 3)
          groundG.rect(k.x - CELL / 2 - 0.5, k.y - CELL / 2 - 0.5, CELL + 1, CELL + 1).fill({ color: v < 0.3 ? C.basaltLo : v > 0.8 ? C.basaltHi : C.basalt })
          if (v > 0.62) {
            // a crack: a short ink stroke, glowing as the crust runs out
            const a = v * 40
            groundG.moveTo(k.x - Math.cos(a) * 5, k.y - Math.sin(a) * 5).lineTo(k.x + Math.cos(a) * 5, k.y + Math.sin(a) * 5)
              .stroke({ width: 1.6 + glow * 1.2, color: glow > 0 ? C.lavaHot : C.ink, alpha: 0.8 })
          }
        }
        // the pour: a ring of steam rising off the splash for its first moments
        if (c.t < 0.5) {
          const k = c.t / 0.5
          groundG.circle(c.x, c.y, c.r * (0.6 + 0.4 * k)).stroke({ width: 10 * (1 - k) + 2, color: C.steam, alpha: 0.7 * (1 - k) })
        }
      }
      // ---- creatures: melting rock ones spread a puddle, stranded lava ones grey over ----
      for (const e of run.enemies) {
        if (e._dead || !e.habitat || !onScreen(e.x, e.y, e.radius)) continue
        if (e.meltT > 0) {
          const k = Math.min(1, e.meltT / MANTLE_MELT_T)
          groundG.poly(blob(e.x, e.y + e.radius * 0.3, e.radius * (0.9 + 0.7 * k), 0.2, e.id)).fill({ color: C.lavaHot, alpha: 0.55 + 0.4 * k })
          for (let i = 0; i < 3; i++) {
            const a = e.id + i * 2.1, dy = ((t * 1.5 + i * 0.33) % 1) * e.radius
            topG.circle(e.x + Math.cos(a) * e.radius * 0.6, e.y - e.radius * 0.2 + dy, 2.2 + k * 1.5).fill({ color: C.lava, alpha: 0.9 })
          }
        }
        if (e.strandT > 0) {
          const k = Math.min(1, e.strandT / MANTLE_STRAND_STUCK_T)
          const dying = Math.max(0, 1 - (MANTLE_STRAND_DIE_T - e.strandT) / 1.5)
          topG.poly(blob(e.x, e.y, e.radius * 0.95, 0.12, e.id)).fill({ color: C.basalt, alpha: 0.25 + 0.5 * k })
          for (let i = 0; i < 4; i++) {
            const a = e.id * 0.7 + i * 1.6
            topG.moveTo(e.x, e.y).lineTo(e.x + Math.cos(a) * e.radius * 0.85, e.y + Math.sin(a) * e.radius * 0.85)
              .stroke({ width: 1.4 + dying * 1.6, color: dying > 0 && Math.floor(t * 10) % 2 === 0 ? C.lavaHot : C.ink, alpha: 0.4 + 0.5 * k })
          }
        }
      }
      // ---- the bellows' rolling wave ----
      for (const n of run.novas ?? []) {
        if (n.look !== 'lavaWave' || !onScreen(n.x, n.y, n.maxR)) continue
        const k = 1 - Math.max(0, n.life / (n.lifeMax || 1))
        const R = Math.max(8, n.r || n.maxR * k), w = 22 + 10 * (1 - k)
        const half = (n.arc ?? 2) / 2, m = 22
        const outer = [], inner = []
        for (let i = 0; i <= m; i++) {
          const a = n.angle - half + (2 * half * i) / m
          const bump = 1 + 0.06 * Math.sin(a * 9 + t * 8)
          outer.push(n.x + Math.cos(a) * (R * bump + 3), n.y + Math.sin(a) * (R * bump + 3))
          inner.push(n.x + Math.cos(a) * Math.max(0, R - w), n.y + Math.sin(a) * Math.max(0, R - w))
        }
        const band = (o, i2) => { const pts = [...o]; for (let i = i2.length - 2; i >= 0; i -= 2) pts.push(i2[i], i2[i + 1]); return pts }
        const fade = 1 - k * k * k
        topG.poly(band(outer, inner)).fill({ color: C.ink, alpha: 0.8 * fade })
        const mid = outer.map((v, i) => (v + inner[i]) / 2)
        topG.poly(band(outer.map((v, i) => v - (v - mid[i]) * 0.25), inner.map((v, i) => v + (mid[i] - v) * 0.1))).fill({ color: C.lava, alpha: fade })
        topG.poly(band(outer.map((v, i) => v - (v - mid[i]) * 0.3), mid)).fill({ color: C.lavaGlow, alpha: 0.8 * fade })
      }
      // ---- melt and crumble bursts ----
      for (const b of bursts) b.t += dt
      while (bursts.length && bursts[0].t > 0.8) bursts.shift()
      for (const b of bursts) {
        if (!onScreen(b.x, b.y, b.r * 3)) continue
        const k = b.t / 0.8
        if (b.kind === 'melt') {
          groundG.poly(blob(b.x, b.y, b.r * (1 + 1.2 * k), 0.25, b.seed)).fill({ color: C.lava, alpha: 0.8 * (1 - k) })
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * TAU + b.seed, d = b.r * (0.5 + 2.2 * k)
            topG.circle(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d - 18 * Math.sin(Math.PI * k), 3.2 * (1 - k) + 1).fill({ color: C.lavaHot, alpha: 1 - k })
          }
        } else {
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU + b.seed, d = b.r * (0.4 + 2.0 * k), s = (1 - k) * 5 + 1.5
            const x = b.x + Math.cos(a) * d, y = b.y + Math.sin(a) * d
            topG.poly([x - s, y, x, y - s * 0.8, x + s, y + s * 0.3]).fill({ color: i % 2 ? C.basaltHi : C.basalt, alpha: 1 - k * 0.8 })
          }
          groundG.circle(b.x, b.y, b.r * (0.8 + k)).stroke({ width: 4 * (1 - k) + 1, color: C.basaltHi, alpha: 0.6 * (1 - k) })
        }
      }
      // ---- the basalt boat under the player ----
      const p = run.player
      if (p.afloat && p.boatMax > 0) {
        const f = Math.max(0, Math.min(1, p.boatT / p.boatMax))   // 1 fresh, 0 gone under
        const wob = f < 0.3 ? Math.sin(t * 22) * (0.3 - f) * 6 : 0
        const x = p.x + wob, y = p.y + 13, rx = 25, ry = 13
        boatG.ellipse(x, y, rx + 3, ry + 3).fill({ color: C.ink })
        boatG.ellipse(x, y, rx, ry).fill({ color: C.basalt })
        boatG.ellipse(x - 4, y - 3, rx * 0.6, ry * 0.4).fill({ color: C.basaltHi, alpha: 0.6 })
        // the lava coming in over the rim: a pool inside the hull growing as it sinks
        const s = 1 - f
        if (s > 0.02) boatG.ellipse(x, y + 1, rx * (0.35 + 0.6 * s), ry * (0.3 + 0.6 * s)).fill({ color: s > 0.7 ? C.lavaHot : C.lava, alpha: 0.9 })
      }
    },
  }
}
