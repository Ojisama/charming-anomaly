// The Ophan's danger geometry as pure hit tests. geo = RIG.attack(...) in world px, T = OPHAN_HIT, r = player radius.
const cl = (v) => Math.min(1, Math.max(0, v))
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by)
// distance from (x, y) to the segment a -> b
const segD = (x, y, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy
  const k = l2 ? cl(((x - ax) * dx + (y - ay) * dy) / l2) : 0
  return dist(x, y, ax + dx * k, ay + dy * k)
}

export function ophanHits(atk, geo, x, y, r, R, T) {
  const src = 'ophan' + atk[0].toUpperCase() + atk.slice(1)
  const no = { hit: false, src, dmgKey: 'dmg' }
  const yes = (extra, dmgKey = 'dmg') => ({ hit: true, src, dmgKey, ...extra })
  if (atk === 'blast') {
    const s = geo.sheet
    if (!s || !(s.fade > T.blastFade)) return no
    const dx = x - s.apex.x, dy = y - s.apex.y, d = Math.hypot(dx, dy)
    let da = Math.atan2(dy, dx) - s.dir
    da = Math.atan2(Math.sin(da), Math.cos(da))
    if (Math.abs(da) > s.half || Math.abs(d - s.front) > s.band / 2 + r) return no
    return yes({ shove: { x: d ? dx / d : 0, y: d ? dy / d : 1 } })
  }
  if (atk === 'tornado') {
    if (!(geo.alive > T.tornadoAlive)) return no
    // the drawn funnel: a base ellipse at the foot, rings widening as h^1.4 up its (collapsing) height, a top ellipse
    const H = geo.height * (1 - 0.92 * geo.collapse), dy = geo.pos.y - y
    if (dy < -0.3 * geo.foot - r || dy > H + 0.28 * geo.radius + r) return no
    if (Math.abs(x - geo.pos.x) > geo.foot + (geo.radius - geo.foot) * Math.pow(cl(dy / H), 1.4) + r) return no
    const px = geo.pos.x - x, py = geo.pos.y - y, d = Math.hypot(px, py)
    return yes(d && d < T.tornadoPullR * geo.radius ? { pull: { x: px / d, y: py / d } } : {})
  }
  if (atk === 'laser') {
    if (!(geo.fire > T.laserFire)) return no
    return geo.beams.some((b) => dist(x, y, b.end.x, b.end.y) <= T.laserHitR * R + r) ? yes({}) : no
  }
  if (atk === 'wheel') {
    return geo.roll > T.wheelRoll && dist(x, y, geo.pos.x, geo.pos.y) < geo.r + r ? yes({}) : no
  }
  if (atk === 'recall') {
    for (const f of geo.feathers) {
      if (f.state !== 3) continue
      if (segD(x, y, f.x, f.y, f.x - Math.cos(f.a) * f.len, f.y - Math.sin(f.a) * f.len) <= f.w + r) return yes({})
    }
    return no
  }
  if (atk === 'sword') {
    const i = geo.impact
    if (i && i.al > T.impactAl && dist(x, y, i.x, i.y) < i.r + r) return yes({})
    const f = geo.fire
    if (f && f.on > T.fireOn) {
      const s = f.start
      if (segD(x, y, s.x, s.y, s.x + f.dx * f.front, s.y + f.dy * f.front) <= f.w + r) return yes({}, 'fireDmg')
    }
    return no
  }
  return no
}
