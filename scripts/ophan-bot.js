// A headless player for The Ophan, the one scripts/ophan-probe.mjs drives. Reads the run, never
// writes it, and never draws from Math.random (the sim's stream stays the seed's alone).
// A CEILING ON DODGING: it reads each attack's exact future geometry through RIG on the sim's own
// clock. Every win rate it produces is an upper bound for a human.
//   - the arena is open (rev 2). In a phase it orbits the LIVE boss on the mock-up's 145 x 125
//     radii at 0.32 rad/s; the boss chases to OPHAN_BOSS_HOLD, so the orbit sits about at its hold
//   - kite: true (the probe's --kite arm) runs from the boss on a KITE.r ring instead of orbiting,
//     outside OPHAN_BOSS_HOLD, so the boss must chase: the only arm OPHAN_BOSS_SPEED acts on
//   - in a wave (no boss) it kites: walks a KITE.r circle round where the wave found it at KITE.v
//     of its speed, so the crowd trails it into the weapons
//   - steps out of the live attack's hit area: ophanHits one hit radius ahead (the player's radius
//     doubled), at each LOOK moment along the line it would walk, on the move closest to the orbit
//     that clears the most of them. It reads up to 1.1 s on because the blast's sheet only exists
//     from its u 0.55 and lands at the orbit's radius: a bot that cannot read the wind-up takes
//     every blast and the column measures the bot
//   - leans off crowd bodies about to touch it (SHY, below)
//   - literal: true is the brief's bot: no SHY, and the dodge tests the CURRENT shape one hit
//     radius ahead along the stick, nothing further
//   - wears the boss's skin 0.45 s after the boss changes it (a reaction time)
//   - every other tell it presses the told world inside the tell, after the same reaction time (a
//     resonance); the rest it waits for the swap. Alternating rather than a coin keeps it off
//     Math.random and exactly half.
import RIG from '../src/ophan/rig.js'
import { ophanHits } from '../src/ophan/hit.js'
import { OPHAN_ATK_SPEED, OPHAN_BOSS, OPHAN_HAND, OPHAN_HIT, PLAYER } from '../src/config.js'

const ORBIT = { rx: 145, ry: 125, w: 0.32 }
const KITE = { r: 260, v: 0.7 }
const REACT = 0.45
// s: the wind-up is the tell, so the bot reads that far on, every 50 ms: at 1.5x the blast's band
// sweeps past a point in ~0.2 s, between v9's sparser moments
const LOOK = Array.from({ length: 22 }, (_, i) => 0.05 * (i + 1))
const SHY = 40
const DIRS = Array.from({ length: 16 }, (_, i) => ({ x: Math.cos(i * Math.PI / 8), y: Math.sin(i * Math.PI / 8) }))
// run -> { off: when the boss's skin last stopped matching the worn world, atk + d: the escape
// chosen against that attack, kite: the wave circle's centre and start time }
const seen = new WeakMap()

// the attack's danger geometry `ahead` seconds on (at the sim's 1.5x progress), or null once it would be over
function geoAt(o, b, ahead) {
  const a = o.atk, R = OPHAN_BOSS.R, u = a.u + ahead * OPHAN_ATK_SPEED / a.dur * RIG.uRate(a.k, a.u)
  if (u >= 1) return null
  const t = o.t + ahead
  const pose = RIG.pose(t, o.ph, a.k, u, (a.ax - b.x) / R, (a.ay - b.y) / R)
  return RIG.attack(a.k, u, o.ph, b.x, b.y, R, a.ax, a.ay, t, pose)
}

export function ophanBot(run, { literal = false, kite = false } = {}) {
  const o = run.script?.oph, p = run.player
  if (!o) return { x: 0, y: 0, world: -1 }
  const b = o.bossId == null ? null : run.enemies.find((e) => e.id === o.bossId && !e._dead) ?? null
  const s = seen.get(run) ?? { off: -1, atk: null, d: null, kite: null }
  seen.set(run, s)

  // the target: the orbit round the live boss, or the kite circle without one; the stick toward it
  let tx, ty
  if (b) s.kite = null
  if (b && kite) {
    // run from the boss on its KITE.r ring, past the hold: tangent there, outward inside it, so the
    // boss has to chase. Holding the ring needs a radial speed equal to the boss's.
    const ax = p.x - b.x, ay = p.y - b.y, d = Math.hypot(ax, ay) || 1, out = Math.max(-1, Math.min(1, (KITE.r - d) / 50))
    tx = (-ay / d + out * ax / d * 2) * 100; ty = (ax / d + out * ay / d * 2) * 100
  } else if (b) {
    const th = ORBIT.w * o.t
    tx = b.x + Math.cos(th) * ORBIT.rx - p.x; ty = b.y + Math.sin(th) * ORBIT.ry - p.y
  } else {
    s.kite ??= { x: p.x - KITE.r, y: p.y, t: o.t }
    const th = (o.t - s.kite.t) * KITE.v * PLAYER.baseSpeed / KITE.r
    tx = s.kite.x + Math.cos(th) * KITE.r - p.x; ty = s.kite.y + Math.sin(th) * KITE.r - p.y
  }
  const tl = Math.hypot(tx, ty)
  let mx = tl > 4 ? tx / tl : 0, my = tl > 4 ? ty / tl : 0
  // SHY: leans off any crowd body within SHY px of touching. Without it every tank sits on the bot
  // and the crowd column measures the orbit's speed.
  if (!literal) {
    for (const e of run.enemies) {
      if (e._dead || e === b) continue
      const ex = p.x - e.x, ey = p.y - e.y, el = Math.hypot(ex, ey) || 1, gap = el - e.radius - PLAYER.radius
      if (gap < SHY) { const w = 2 * (1 - Math.max(0, gap) / SHY); mx += ex / el * w; my += ey / el * w }
    }
    const ml = Math.hypot(mx, my)
    if (ml > 1) { mx /= ml; my /= ml }
  }

  if (o.atk && b) {
    const v = PLAYER.baseSpeed, r = PLAYER.radius * (literal ? 1 : 2)
    // [seconds walked, the shape at that moment]
    const geos = (literal ? [[PLAYER.radius / v, geoAt(o, b, 0)]] : LOOK.map((tau) => [tau, geoAt(o, b, tau)])).filter(([, g]) => g)
    // how many of the look-ahead moments walking d at full stick would put the bot inside the shape
    const hits = (dx, dy) => geos.reduce((n, [tau, g]) =>
      n + (ophanHits(o.atk.k, g, p.x + dx * v * tau, p.y + dy * v * tau, r, OPHAN_BOSS.R, OPHAN_HIT).hit ? 1 : 0), 0)
    // a chosen escape is kept while nothing beats it: re-choosing every frame dithers between two
    // near-equal moves and walks nowhere (measured: the open arena's blast landed 62 of 69 that way)
    if (hits(mx, my)) {
      const keep = s.atk === o.atk && s.d ? hits(s.d.x, s.d.y) : Infinity
      if (keep) {
        let bn = Infinity, bd = -Infinity, best = null
        for (const d of DIRS) {
          const n = hits(d.x, d.y), dot = d.x * mx + d.y * my
          if (n < bn || (n === bn && dot > bd)) { bn = n; bd = dot; best = d }
        }
        if (bn < keep) s.d = best
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
