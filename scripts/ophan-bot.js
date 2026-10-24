// A headless player for The Ophan, the one scripts/ophan-probe.mjs drives. Reads the run, never
// writes it, and never draws from Math.random (the sim's stream stays the seed's alone).
// A CEILING ON DODGING: it reads each attack's exact future geometry through RIG on the sim's own
// clock. Every win rate it produces is an upper bound for a human.
//   - orbits the boss on the mock-up's 145 x 125 radii at 0.32 rad/s
//   - steps out of the live attack's hit area: ophanHits one hit radius ahead (the player's radius
//     doubled), at each LOOK moment along the line it would walk, on the move closest to the orbit
//     that clears the most of them. It reads up to 1.1 s on because the blast's sheet only exists
//     from its u 0.55 (1 s in) and lands at the orbit's radius: a bot that cannot read the wind-up
//     takes every blast (measured 28 of 29 at d1) and the column measures the bot
//   - leans off crowd bodies about to touch it (SHY, below)
//   - literal: true is the brief's bot: no SHY, and the dodge tests the CURRENT shape one hit
//     radius ahead along the stick, nothing further
//   - wears the boss's skin 0.45 s after the boss changes it (a reaction time)
//   - every other tell it presses the told world inside the tell, after the same reaction time (a
//     resonance); the rest it waits for the swap. Alternating rather than a coin keeps it off
//     Math.random and exactly half.
import RIG from '../src/ophan/rig.js'
import { ophanHits } from '../src/ophan/hit.js'
import { OPHAN_BOSS, OPHAN_HAND, OPHAN_HIT, PLAYER } from '../src/config.js'

const ORBIT = { rx: 145, ry: 125, w: 0.32 }
const REACT = 0.45
const LOOK = [0.1, 0.25, 0.5, 0.8, 1.1]   // s: the wind-up is the tell, so the bot reads that far on
const SHY = 40
const DIRS = Array.from({ length: 16 }, (_, i) => ({ x: Math.cos(i * Math.PI / 8), y: Math.sin(i * Math.PI / 8) }))
// run -> { off: when the boss's skin last stopped matching the worn world, atk + d: the escape
// chosen against that attack }
const seen = new WeakMap()

// the attack's danger geometry at `ahead` seconds on, or null once it would be over
function geoAt(o, b, ahead) {
  const a = o.atk, R = OPHAN_BOSS.R, u = a.u + ahead / a.dur
  if (u >= 1) return null
  const t = o.t + ahead
  const pose = RIG.pose(t, o.ph, a.k, u, (a.ax - b.x) / R, (a.ay - b.y) / R)
  return RIG.attack(a.k, u, o.ph, b.x, b.y, R, a.ax, a.ay, t, pose)
}

export function ophanBot(run, { literal = false } = {}) {
  const o = run.script?.oph, p = run.player
  if (!o) return { x: 0, y: 0, world: -1 }
  const b = run.enemies.find((e) => e.id === o.bossId && !e._dead) ?? OPHAN_BOSS
  const s = seen.get(run) ?? { off: -1, atk: null, d: null }
  seen.set(run, s)

  // the orbit target, and the stick toward it
  const th = ORBIT.w * o.t
  const tx = b.x + Math.cos(th) * ORBIT.rx - p.x, ty = b.y + Math.sin(th) * ORBIT.ry - p.y, tl = Math.hypot(tx, ty)
  let mx = tl > 4 ? tx / tl : 0, my = tl > 4 ? ty / tl : 0
  // SHY: leans off any crowd body within SHY px of touching. The orbit's target walks at ~43 px/s
  // and a tank at 47-55, so without this every tank sits on the bot and the crowd column measures
  // the orbit's speed.
  if (!literal) {
    for (const e of run.enemies) {
      if (e._dead || e.id === o.bossId) continue
      const ex = p.x - e.x, ey = p.y - e.y, el = Math.hypot(ex, ey) || 1, gap = el - e.radius - PLAYER.radius
      if (gap < SHY) { const w = 2 * (1 - Math.max(0, gap) / SHY); mx += ex / el * w; my += ey / el * w }
    }
    const ml = Math.hypot(mx, my)
    if (ml > 1) { mx /= ml; my /= ml }
  }

  if (o.atk) {
    const v = PLAYER.baseSpeed, r = PLAYER.radius * (literal ? 1 : 2)
    // [seconds walked, the shape at that moment]
    const geos = (literal ? [[PLAYER.radius / v, geoAt(o, b, 0)]] : LOOK.map((tau) => [tau, geoAt(o, b, tau)])).filter(([, g]) => g)
    // how many of the look-ahead moments walking d at full stick would put the bot inside the shape
    const hits = (dx, dy) => geos.reduce((n, [tau, g]) =>
      n + (ophanHits(o.atk.k, g, p.x + dx * v * tau, p.y + dy * v * tau, r, OPHAN_BOSS.R, OPHAN_HIT).hit ? 1 : 0), 0)
    // a chosen escape is kept while it stays clear: re-choosing every frame dithers between two
    // near-equal moves and walks nowhere
    if (hits(mx, my)) {
      if (s.atk !== o.atk || !s.d || hits(s.d.x, s.d.y)) {
        let bn = Infinity, bd = -Infinity
        for (const d of DIRS) {
          const n = hits(d.x, d.y), dot = d.x * mx + d.y * my
          if (n < bn || (n === bn && dot > bd)) { bn = n; bd = dot; s.d = d }
        }
        s.atk = o.atk
      }
      mx = s.d.x; my = s.d.y
    }
  }

  // the world: the told one inside every other tell, else the worn skin after the reaction time
  let world = -1
  if (!o.sketch) {
    if (o.tell > 0 && o.next >= 0 && o.swaps % 2 === 0) { if (OPHAN_HAND.tell - o.tell >= REACT) world = o.next }
    else if (o.world !== o.skin) {
      if (s.off < 0) s.off = o.t
      if (o.t - s.off >= REACT) world = o.skin
    }
    if (o.world === o.skin) s.off = -1
  }
  return { x: mx, y: my, world }
}
