// The Mantle's cast and its player: 1930s rubber-hose cartoon characters (render-only).
//
// Drawn with the brush (brush.js) the way a 1930s cel was: a clean thick-thin ink line, FLAT paint,
// one hard shadow shape, at most one flat cream highlight. Each body is built on a few simple shapes
// (a ball, a pear, a pancake, rubber-hose tubes with no elbows) and carries a big readable face with
// attitude: pie-cut eyes, fat brows, a mouth that shows teeth. Few details, each one big enough to
// read at play size: a detail smaller than the ink line is mud, not charm.
//   the imp     a devil's head on legs: V brows, two fangs, gold horns, a flame tuft (round + spike)
//   the toad    a wide flat pancake, eye domes on top, a smug lidded grin, its tongue out (wide + low)
//   the golem   a basalt boulder that IS its face: glowing cracks, a stone brow, an underbite, two
//               rock fists it walks on (a big square lump with fists)
//   the dragon  a chubby baby dragon, 3/4 front like the rest: a head bigger than its belly, white
//               spikes, a cream snout trailing smoke, gloved fists, bat wings (the only thing with wings)
//   the eel     a magma eel SWIMMING IN the lava: only its head and two arched coils with a fin break
//               the surface, each through a collar of bright lava; the rest of it is under
// The charm is in the poses: the imps BOUNCE (stretched in the air, squashed on landing, winding up),
// the toad pancakes before it hops and stretches out when it leaps, the golem knuckle-walks with a
// sway, the dragon flaps, the eel's coils roll forward. Every body faces the camera, the way a cartoon
// overworld shows its characters from above (render.js mirrors it to face its way; it is never
// turned), standing on its own flat shadow.
//   TOON_CAST[id] = { baseR, frames, box: [x0, y0, x1, y1] (units round the body's centre), paint, poseOf?,
//   lavaBound? }   paint(ctx, frame, elite) draws in units (the caller has scaled the context).
//   render.js scales the sprite by e.radius / baseR, so baseR sets how many world px one unit is drawn
//   at. lavaBound: the body lives in the lava (it is drawn half under it), so it must never get the
//   burning-wader flames and sweat.
import { resetXf, push, pop, tr, rot, sc, ell, polar, drop, tube, qb, line, cel, eye, glove, shadow, glow, puff, flame, brush, mp, INK } from './brush.js'

const SH_RED = 'rgba(112,8,26,0.45)'
const MOUTH = '#3a0d12', TONGUE = '#e85a52', TOOTH = '#fbf4e2'

// A cartoon mouth: the opening between an upper and a lower curve (a -> b), painted dark, a tongue
// inside, fangs hanging from the top lip (fangs: [[x, len, w], ...]) or square teeth standing on the
// lower lip (lowTeeth: [[x, y, w, h], ...]), then inked.
function mouth(c, a, b, cTop, cBot, o = {}) {
  const up = qb(a, cTop, b, 18), lo = qb(b, cBot, a, 18).slice(1, -1)
  const M = [...up, ...lo]
  cel(c, M, MOUTH, { ink: 0, shade: null })
  c.save()
  const P = M.map(mp); c.beginPath(); P.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.clip()
  if (o.tongue) { const [tx, ty, r0] = o.tongue; cel(c, ell(tx, ty, r0, r0 * 0.78, 0, 26), TONGUE, { ink: 0.6, shade: null }) }
  if (o.teeth) {
    // one band of teeth along the top lip, a single gap line in the middle (never a row of ticks)
    const th = o.teeth
    cel(c, [...up, ...qb([b[0], b[1] + th * 0.6], [cTop[0], cTop[1] + th], [a[0], a[1] + th * 0.6], 18)], TOOTH, { ink: 0, shade: null })
    line(c, qb([a[0], a[1] + th * 0.6], [cTop[0], cTop[1] + th], [b[0], b[1] + th * 0.6]), 0.5, { taper: 0.25 })
    const mx = 0.25 * a[0] + 0.5 * cTop[0] + 0.25 * b[0], my = 0.25 * a[1] + 0.5 * cTop[1] + 0.25 * b[1]
    line(c, [[mx, my], [mx, my + th * 0.95]], 0.5, { taper: 0.2 })
  }
  if (o.fangs) for (const [fx, fl, fw = 1.4] of o.fangs) {
    let fy = a[1], best = 1e9; for (const p of up) if (Math.abs(p[0] - fx) < best) { best = Math.abs(p[0] - fx); fy = p[1] }
    cel(c, [[fx - fw, fy - 0.8], [fx + fw, fy - 0.8], [fx + 0.1, fy + fl]], TOOTH, { ink: 0.5, shade: null })
  }
  if (o.lowTeeth) for (const [fx, fy, fw, fh] of o.lowTeeth) cel(c, [[fx - fw, fy + 1.5], [fx + fw, fy + 1.5], [fx + fw * 0.85, fy - fh], [fx - fw * 0.85, fy - fh]], TOOTH, { ink: 0.55, shade: null })
  c.restore()
  brush(c, M, true, o.ink ?? 1.1)
}
// a fat brow: a filled wedge of ink (thick in the middle, pointed both ends), the attitude
const brow = (c, a, m, b, w = 1.6) => line(c, qb(a, m, b), w, { belly: true, taper: 0.5 })
// speed lines / landing ticks
const ticks = (c, pts, w = 0.8) => { for (const p of pts) line(c, p, w, { taper: 0.5 }) }

// ---- EMBER IMP: a devil's head on legs. Gold horns, a flame tuft, V brows, a fanged grin ----------
function imp(c, o = {}) {
  const st = o.stretch || 1, lk = o.look || [0, 0], arms = o.arms || 'swing', lift = o.lift || 0, lean = o.lean || 0
  shadow(c, 0.5, 10.4, 7.6 * (1 - lift * 0.05), 2.6, 0.34 - lift * 0.02)
  push(); tr(0, -lift)
  tr(0, 9); sc(1 / Math.sqrt(st), st); rot(lean); tr(0, -9)
  const body = o.col || '#e2402e', hoof = '#3b1618'
  // tail: one S of hose with a spade tip
  cel(c, tube(qb([3, 6], [12, 9], [11.5, 0]), 1.9, 1.3), body, { ink: 1.0, shade: SH_RED })
  push(); tr(11.4, -0.8); rot(0.15); cel(c, drop(0, 0, 2.7, 4.6), body, { ink: 1.0, shade: SH_RED }); pop()
  // two stubby legs and hooves
  const lg = o.legs || 0
  cel(c, tube([[-2.4, 6], [-3.2 - lg, 8.6]], 2.4, 2.2), body, { ink: 0.9, shade: SH_RED })
  cel(c, tube([[2.4, 6], [3.2 + lg, 8.6]], 2.4, 2.2), body, { ink: 0.9, shade: SH_RED })
  cel(c, ell(-3.4 - lg, 9.0, 2.6, 1.6, 0.15, 24), hoof, { ink: 1.0, shade: null })
  cel(c, ell(3.4 + lg, 9.0, 2.6, 1.6, -0.15, 24), hoof, { ink: 1.0, shade: null })
  // rubber-hose arms and gloves: the gesture
  const A = {
    up: [[[-5, 3.5], [-12, 3], [-12.5, -7]], [[5, 3.5], [12, 3], [12.5, -7]]],
    reach: [[[-5, 3.5], [-12, 5], [-16, 0]], [[5, 3.5], [12, 5], [16, 0]]],
    swing: [[[-5, 3.5], [-11, 9], [-14, 5.5]], [[5, 3.5], [11, 1], [13.5, -5]]],
    wind: [[[-5, 3.5], [-9, 9], [-6.5, 12]], [[5, 3.5], [9, 9], [6.5, 12]]],
  }[arms]
  for (const S of A) cel(c, tube(qb(S[0], S[1], S[2]), 2.0, 1.7), body, { ink: 0.95, shade: SH_RED })
  for (const S of A) glove(c, S[2][0], S[2][1], arms === 'up' ? 3.2 : 3.0, Math.atan2(S[2][1] - S[1][1], S[2][0] - S[1][0]))
  // the little pear of a body under the head
  cel(c, ell(0, 4.8, 4.6, 3.8, 0, 32), body, { ink: 1.2, shade: SH_RED })
  // the flame tuft, behind the head: one big S tongue, its hot core flat inside
  const fl = o.big ? 1.25 : 1, fh = (o.flameH ?? 1) * fl
  cel(c, flame(0.2, -9.0, 5.4 * Math.sqrt(fl), 12.0 * fh, o.curl ?? 0.7), '#f7862a', { ink: 1.25, shade: 'rgba(180,40,8,0.4)' })
  cel(c, flame(0.5, -8.6, 2.9 * Math.sqrt(fl), 6.6 * fh, (o.curl ?? 0.7) - 0.15), '#ffd860', { ink: 0, shade: null })
  // gold horns, short and curved
  for (const k of [-1, 1]) cel(c, tube(qb([k * 4.4, -6.6], [k * 8.2, -8.2], [k * 7.4, -12.6]), 3.2, 0.5), '#f6c544', { ink: 1.0, shade: 'rgba(160,80,10,0.4)' })
  // pointed ears
  for (const k of [-1, 1]) { push(); tr(k * 9.3, -2.2); rot(k * 1.2); cel(c, drop(0, 0, 2.3, 5.2), body, { ink: 1.0, shade: SH_RED }); pop() }
  // the head: the big round
  cel(c, ell(0, -1.4, 9.4, 8.4, 0, 56), body, { ink: 1.9, shade: SH_RED, spec: 0.17 })
  // the face: tall pie eyes pressed together, a V of brows, a cheek-to-cheek grin with two fangs
  const sq = o.squint ? 0.78 : 1
  eye(c, -2.8, -2.4, 2.8, 3.9 * sq, lk[0], lk[1])
  eye(c, 2.8, -2.4, 2.8, 3.9 * sq, lk[0], lk[1])
  brow(c, [-6.6, -7.8], [-3.8, -7.9], [-0.4, -5.6], 2.1)
  brow(c, [6.6, -7.8], [3.8, -7.9], [0.4, -5.6], 2.1)
  if (o.yell) mouth(c, [-4.8, 1.8], [4.8, 1.8], [0, 2.8], [0, 10.4], { fangs: [[-2.8, 2.4, 1.2], [2.8, 2.4, 1.2]], tongue: [0.4, 8.8, 2.6] })
  else mouth(c, [-6.8, 1.2], [6.8, 1.2], [0, 3.6], [0, 9.2], { fangs: [[-3.4, 2.6, 1.3], [3.4, 2.6, 1.3]], tongue: [1.2, 7.8, 2.4] })
  pop()
}
// IMP frames: a bounce. 0 sprung up and stretched, 1 coming down, 2 landed and squashed, 3 winding up
const IMP_POSE = [
  { stretch: 1.2, arms: 'up', lift: 4.5, look: [0.3, -0.2], curl: 0.95, flameH: 1.15, lines: true, yell: true },
  { stretch: 1.06, arms: 'reach', lift: 2.5, look: [0.5, 0.4], curl: 0.55, lean: -0.08 },
  { stretch: 0.78, arms: 'reach', lift: 0, look: [0.4, 0.6], curl: 0.2, flameH: 0.8, dust: true, squint: true, legs: 1.2 },
  { stretch: 0.92, arms: 'wind', lift: 0, look: [0.5, 0.5], curl: 0.45, lean: 0.08, legs: 0.5 },
]
function paintImp(c, f, elite) {
  const P = IMP_POSE[f % 4]
  imp(c, { ...P, col: elite ? '#c32a33' : '#e2402e', big: elite })
  if (P.lines) ticks(c, [[[-4, 13.2], [-2.5, 15.5]], [[0, 13.6], [0, 16.4]], [[4, 13.2], [2.5, 15.5]]], 0.9)
  if (P.dust) { puff(c, -10.5, 9.4, 2.4); puff(c, 10.8, 9.8, 2.6) }
}

// ---- MAGMA TOAD: a wide flat pancake of a toad, eye domes on top, a smug lidded grin, tongue out ----
function toad(c, o = {}) {
  const lk = o.look || [0, 0], sx = o.sx || 1, sy = o.sy || 1, lift = o.lift || 0
  shadow(c, 1, 8, 17 * (lift ? 0.78 : 1), 4.6, lift ? 0.22 : 0.34)
  push(); tr(0, -lift); tr(0, 7); sc(sx, sy); tr(0, -7)
  const skin = o.col || '#d4582e', sh = 'rgba(92,10,20,0.45)', belly = '#f6d27e', spot = '#ffb43a'
  // hind legs: folded flat at the sides (sat), flung out behind (leap)
  for (const k of [-1, 1]) {
    if (!o.leap) cel(c, ell(k * 14, 4, 6.2, 5.2, k * 0.35, 36), skin, { ink: 1.4, shade: sh })
    const legs = o.leap ? qb([k * 9, 5], [k * 20, 8], [k * 21, 16], 12) : qb([k * 16.5, 5.5], [k * 21, 9.5], [k * 15.5, 10.8], 12)
    cel(c, tube(legs, o.leap ? 5.0 : 4.2, 3.0), skin, { ink: 1.2, shade: sh })
    const ft = o.leap ? [k * 21, 17] : [k * 16, 11.2]
    // a webbed foot: one mitten with three round toes
    push(); tr(ft[0], ft[1]); rot(k > 0 ? 0.3 : Math.PI - 0.3)
    cel(c, [[-0.8, -1.8], ...qb([1, -3.8], [5, -2.4], [5.2, 0], 8), ...qb([5.2, 0], [5, 2.4], [1, 3.8], 8).slice(1), [-0.8, 1.8]], belly, { ink: 1.0, shade: 'rgba(150,70,20,0.38)' })
    pop()
  }
  // front hands: gloves splayed forward (reaching up on the leap)
  if (o.leap) { glove(c, -10.5, -9.5, 3.0, -2.0); glove(c, 10.5, -9.5, 3.0, -1.1) } else { glove(c, -10.5, -5, 3.0, -2.5); glove(c, 10.5, -5, 3.0, -0.65) }
  // the body: one squashed pancake, a cream belly crescent showing at its front edge
  cel(c, ell(0, 1.5, 16, 9.8, 0, 60), skin, { ink: 2.0, shade: sh, spec: 0.12 })
  cel(c, [...qb([-11.5, 4], [0, 12.2], [11.5, 4], 16), ...qb([11.5, 4], [0, 9], [-11.5, 4], 16).slice(1, -1)], belly, { ink: 0.9, shade: null })
  // two big magma spots on each flank: the lava it carries
  for (const [wx, wy, wr] of [[-11.8, -1.6, 1.9], [11.8, -1, 2.1], [-8.6, 2.6, 1.3], [8.8, 3, 1.3]]) cel(c, ell(wx, wy, wr, wr * 0.8, 0, 22), spot, { ink: 0.8, shade: null })
  // eye domes on top of the head
  for (const k of [-1, 1]) cel(c, ell(k * 6.2, -6.4, 6.0, 5.6, 0, 36), skin, { ink: 1.6, shade: sh })
  eye(c, -6.2, -6.8, 4.1, 4.4, lk[0], lk[1] + 0.3, { pr: 0.5 })
  eye(c, 6.2, -6.8, 4.1, 4.4, lk[0], lk[1] + 0.3, { pr: 0.5 })
  if (!o.leap) {
    // heavy smug lids over the top half of each eye, an ink line along their edge
    const lid = o.wide ? 0.6 : 1
    for (const k of [-1, 1]) {
      cel(c, [...qb([k * 10.4, -7.6], [k * 6.2, -13.8], [k * 2, -7.6], 14), ...qb([k * 2, -7.6], [k * 6.2, -7.6 + 1.4 * lid], [k * 10.4, -7.6], 12).slice(1, -1)], skin, { ink: 0, shade: null })
      line(c, qb([k * 10.6, -7.5], [k * 6.2, -6.2 + (1 - lid) * -1.5], [k * 1.8, -7.7]), 1.4, { belly: true })
    }
    brow(c, [-10.2, -13], [-6.5, -15.2], [-2.4, -13.4], 1.5)
  } else { brow(c, [-9.8, -13.4], [-6.2, -14.8], [-2.6, -13.2], 1.4); brow(c, [9.8, -13.4], [6.2, -14.8], [2.6, -13.2], 1.4) }
  // the grin: a wide slab of a smile cheek to cheek, the tongue lolling out of one corner
  if (o.leap) mouth(c, [-3.4, 2.4], [3.4, 2.4], [0, 0.8], [0, 8], { tongue: [0, 6.6, 2.1] })
  else {
    mouth(c, [-12, 0], [12, 0], [0, 4], [0, 9.4 * (o.gulp ? 0.75 : 1)], { teeth: 1.6, tongue: [5, 7.2, 2.9] })
    line(c, qb([-12.8, -1.4], [-11.7, -0.2], [-11.9, 1.2]), 0.9)
    line(c, qb([12.8, -1.4], [11.7, -0.2], [11.9, 1.2]), 0.9)
  }
  pop()
  if (o.dust) { puff(c, -19.5, 9.5, 2.6); puff(c, 20, 8.5, 3.0) }
  if (o.leap) ticks(c, [[[-6, 17], [-4.5, 20]], [[0, 17.5], [0, 21]], [[6, 17], [4.5, 20]]], 0.9)
}
// TOAD frames: 0/1 sat and breathing, 2 pancaked ready to spring (aim / land), 3 the leap
const TOAD_POSE = [
  { sx: 1, sy: 1, look: [0.4, 0.2] },
  { sx: 0.95, sy: 1.07, look: [0.4, 0.2], gulp: true },
  { sx: 1.18, sy: 0.78, look: [0.5, 0.1], dust: true, wide: true },
  { sx: 0.86, sy: 1.18, lift: 7, leap: true, look: [0.3, -0.4] },
]
function paintToad(c, f, elite) { toad(c, { ...TOAD_POSE[f % 4], col: elite ? '#b23e2a' : '#d4582e' }) }
function toadPose(e) {
  const s = e._pounceState
  if (s === 'leap') return 3
  if (s === 'aim' || s === 'land') return 2
  return Math.floor(-(e._pounceT || 0) * 3 + (e.id || 0) * 0.37) & 1
}

// ---- BASALT GOLEM: a boulder that IS its face. Glowing cracks, a stone brow, a proud underbite, -----
// stone hose arms ending in two rock fists it knuckle-walks on; the lava glowing through its cracks
// a rounded square (superellipse) of half-sizes rx, ry: the golem's construction, never a lumpy blob
const blk = (cx, cy, rx, ry, n = 3.2, k = 64) => { const o = []; for (let i = 0; i < k; i++) { const t = (i / k) * Math.PI * 2, c0 = Math.cos(t), s0 = Math.sin(t); o.push([cx + rx * Math.sign(c0) * Math.pow(Math.abs(c0), 2 / n), cy + ry * Math.sign(s0) * Math.pow(Math.abs(s0), 2 / n)]) } return o }
function golem(c, o = {}) {
  const lk = o.look || [0, 0], a = o.step || 0, bob = o.bob || 0
  shadow(c, 2, 16, 30, 7.5, 0.36)
  push(); tr(0, -bob)
  const st = o.col || '#7a6863', dk = '#54443f', top = '#a08c82', hot = '#ff9b2c', sh = 'rgba(22,6,30,0.42)'
  // stubby feet
  cel(c, blk(-9.5, 17, 5.6, 3.6), dk, { ink: 1.5, shade: null })
  cel(c, blk(9.5, 17.2, 5.6, 3.6), dk, { ink: 1.5, shade: null })
  // stone hose arms swinging down to the fists on the ground, one forward and one back
  const fl = [-27, 9 + a * 3.5], fr = [27, 9 - a * 3.5]
  cel(c, tube(qb([-14, -5], [-27, -6 + a * 2], fl), 9, 7.6), dk, { ink: 1.6, shade: sh })
  cel(c, tube(qb([14, -5], [27, -6 - a * 2], fr), 9, 7.6), dk, { ink: 1.6, shade: sh })
  for (const [k, F] of [[-1, fl], [1, fr]]) {
    cel(c, blk(F[0], F[1] + 2, 7, 6, 2.2), st, { ink: 1.7, shade: sh })
    for (const d of [-2.6, 1.6]) line(c, qb([F[0] + d * k - 1, F[1] + 4.6], [F[0] + d * k, F[1] + 6.4], [F[0] + d * k + 1.6, F[1] + 6.6]), 0.8)
  }
  // the boulder: one rounded block, a flat paler top plane where the light lands
  push(); rot(o.sway || 0)
  cel(c, blk(0, -1, 20.5, 18.5, 2.8), st, { ink: 2.3, shade: sh })
  cel(c, [...qb([-16, -9.5], [-13, -19], [0, -18.6], 14), ...qb([0, -18.6], [13, -19], [16, -11], 14).slice(1), ...qb([16, -11], [2, -8.6], [-16, -9.5], 14).slice(1, -1)], top, { ink: 0, shade: null })
  // glowing cracks: two bold zigzags of lava, inked
  for (const Z of [[[-15.5, 2], [-12, 5], [-14, 9], [-10.5, 12.5]], [[16, -4], [12.8, -1], [14.8, 3]]]) {
    cel(c, tube(Z, 1.9, 1.0), hot, { ink: 0.9, shade: null })
  }
  // two chips of rock knocked out of its crown (never an ember up there: a dark ball with a flame on
  // top reads as a cartoon bomb)
  line(c, qb([-9, -17.4], [-7, -14.6], [-4, -15.6]), 1.0); line(c, qb([7, -16.8], [9.4, -14.8], [12, -15.6]), 0.9)
  // the face: pie eyes under one heavy stone brow (knitted, grumpy), the underbite
  eye(c, -5.4, -3.6, 3.7, 4.4, lk[0], lk[1])
  eye(c, 5.4, -3.6, 3.7, 4.4, lk[0], lk[1])
  cel(c, [...qb([-11.5, -7.4], [-6, -11.6], [0, -7.2], 14), ...qb([0, -7.2], [6, -11.6], [11.5, -7.4], 14).slice(1), [11.5, -5.6], ...qb([11.5, -5.6], [6, -8.2], [0, -5], 14).slice(1), ...qb([0, -5], [-6, -8.2], [-11.5, -5.6], 14).slice(1)], dk, { ink: 1.5, shade: null })
  mouth(c, [-8.4, 5], [8.4, 5], [0, 6.6 + (o.grit ? 1 : 0)], [0, 12.8], { tongue: o.grit ? null : [0, 12, 2.6], lowTeeth: [[-4.2, 11, 1.9, 4.2], [4.2, 11, 1.9, 4.2]] })
  pop()
  pop()
}
const GOLEM_POSE = [
  { step: 1, bob: 0, sway: -0.05 },
  { step: 0, bob: 2, sway: 0, grit: true },
  { step: -1, bob: 0, sway: 0.05 },
  { step: 0, bob: 2, sway: 0, grit: true },
]
function paintGolem(c, f, elite) { golem(c, { ...GOLEM_POSE[f % 4], look: [0, 0.5], col: elite ? '#6a5650' : '#7a6863' }) }

// ---- BRIMSTONE DRAGON (the elite): a chubby baby dragon on spread bat wings, flying high (its shadow
// far below). Drawn 3/4 FRONT, face toward the camera like the rest of the cast, so it reads the same
// from whichever side it comes at you (render.js only mirrors it): a head bigger than its belly, gold
// horns, a cream snout trailing a steady drift of smoke, a fanged grin, V brows, white back spikes, a
// spade-tipped tail curling out behind, gloved fists, stubby feet dangling.
const mix2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
function dragon(c, o = {}) {
  const lk = o.look || [0, 0.5], fl = o.flap ?? 1, bob = o.bob || 0, u = o.u || 0
  shadow(c, 6, 50, 34 * (0.85 + 0.15 * fl), 9, 0.3, '50,10,20')
  push(); tr(0, -bob); sc(1.18)
  const g = '#84c040', g2 = '#5f9a2c', cream = '#f5e0a6', mem = '#f2a33c', sh = 'rgba(24,52,8,0.42)', spike = '#fbf4e2'
  // wings, behind everything: an arm, three finger spars, a scalloped membrane. The flap swings the
  // whole wing about its shoulder (a small, even arc: it beats, it does not shrink)
  for (const k of [-1, 1]) {
    push(); tr(k * 8, -4); rot(k * (fl - 0.85) * 0.55); tr(-k * 8, 4)
    const sh0 = [k * 8, -4], elbow = [k * 24, -14]
    const tips = [[k * 46, -6], [k * 46, -26], [k * 30, -36]]
    const memPts = [sh0, [k * 10, 2], ...qb([k * 14, 4], [k * 28, -2], tips[0], 10), ...qb(tips[0], [k * 38, -12], tips[1], 10).slice(1), ...qb(tips[1], [k * 34, -26], tips[2], 10).slice(1), elbow]
    cel(c, memPts, mem, { ink: 1.6, shade: 'rgba(150,56,10,0.38)' })
    for (const tp of tips) { const m = mix2(elbow, tp, 0.5); line(c, qb(elbow, [m[0], m[1] + 2], tp, 14), 1.4, { taper: 0.4 }) }
    cel(c, tube([sh0, [k * 16, -12], elbow, tips[2]], 4.6, 2.0), g, { ink: 1.4, shade: sh })
    pop()
  }
  // the tail, curling out behind it to one side, white spikes and a red spade
  const TL = [[4, 10], [16, 16], [24, 10], [26, 2]]
  for (const [x, y, a] of [[14, 12.6, -0.4], [21, 10.6, 0.4], [25, 4, 1.2]]) { push(); tr(x, y); rot(a); cel(c, [[-1.8, 0.5], [1.8, 0.5], [0, -3.6]], spike, { ink: 0.8, shade: null }); pop() }
  cel(c, tube(qb(TL[0], [20, 20], TL[3], 18), 7, 2.2), g, { ink: 1.5, shade: sh })
  push(); tr(26.4, -0.6); rot(0.3); cel(c, drop(0, 0, 3.6, 6.4), '#e2402e', { ink: 1.1, shade: SH_RED }); pop()
  // stubby feet dangling under the belly
  for (const k of [-1, 1]) {
    cel(c, tube([[k * 5.5, 12], [k * 6.5, 17.5 + (k > 0 ? bob * 0.3 : 0)]], 3.6, 3.4), g, { ink: 1.1, shade: sh })
    cel(c, ell(k * 6.8, 19 + (k > 0 ? bob * 0.3 : 0), 3.4, 2.3, 0, 24), g2, { ink: 1.2, shade: null })
  }
  // the plump pear of a belly, one cream plate down its front
  cel(c, ell(0, 6, 10.6, 10.4, 0, 52), g, { ink: 2.0, shade: sh })
  cel(c, ell(0, 7.6, 5.6, 7.6, 0, 40), cream, { ink: 1.0, shade: null })
  line(c, qb([-4.4, 5], [0, 6.4], [4.4, 5]), 0.6, { taper: 0.3 }); line(c, qb([-4.8, 9.4], [0, 10.8], [4.8, 9.4]), 0.6, { taper: 0.3 })
  // rubber-hose arms, white-gloved fists balled at its sides (the bully's pose)
  for (const k of [-1, 1]) {
    cel(c, tube(qb([k * 8.5, 2], [k * 14, 1 - (1 - fl) * 4], [k * 15, 7]), 3.0, 2.6), g, { ink: 1.1, shade: sh })
    glove(c, k * 15.4, 8, 3.4, k > 0 ? 1.3 : Math.PI - 1.3)
  }
  // the big head on top, toward you
  push(); tr(0, -12)
  // white spikes along the crown, horns swept up
  for (const [x, a] of [[-4, -0.35], [0, 0], [4, 0.35]]) { push(); tr(x, -10.4); rot(a); cel(c, [[-1.8, 0.5], [1.8, 0.5], [0, -3.8]], spike, { ink: 0.8, shade: null }); pop() }
  for (const k of [-1, 1]) cel(c, tube(qb([k * 8, -6], [k * 14, -8], [k * 14.5, -15.5]), 4.2, 0.6), '#f6c544', { ink: 1.1, shade: 'rgba(160,80,10,0.4)' })
  // little frill ears
  for (const k of [-1, 1]) { push(); tr(k * 12.6, -1); rot(k * 1.25); cel(c, drop(0, 0, 2.4, 5.2), g2, { ink: 1.0, shade: null }); pop() }
  cel(c, ell(0, -1, 13, 10.6, 0, 56), g, { ink: 2.1, shade: sh, spec: 0.13 })
  // the snout: a wide cream muzzle with two nostrils
  cel(c, ell(0, 5.2, 9.8, 5.6, 0, 44), cream, { ink: 1.5, shade: 'rgba(150,100,40,0.35)' })
  for (const k of [-1, 1]) cel(c, ell(k * 3.1, 2.8, 1.3, 0.95, k * 0.4, 16), INK, { ink: 0, shade: null })
  eye(c, -4.6, -4.4, 4.2, 5.2, lk[0], lk[1])
  eye(c, 4.6, -4.4, 4.2, 5.2, lk[0], lk[1])
  brow(c, [-10.2, -9.8], [-5.2, -10.6], [-0.4, -7.4], 2.2)
  brow(c, [10.2, -9.8], [5.2, -10.6], [0.4, -7.4], 2.2)
  mouth(c, [-8.2, 5.2], [8.2, 5.2], [0, 7.2], [0, 12.6 * (o.roar ? 1.1 : 1)], { fangs: [[-4.2, 2.8, 1.5], [4.2, 2.8, 1.5]], tongue: [0.6, 11.4, 2.7] })
  // brimstone smoke drifting off the nostrils and out past its cheeks: always the same puffs, each a
  // quarter-cycle further out (it never pops on and off between frames)
  for (let i = 0; i < 3; i++) {
    const t = (u + i / 3) % 1
    for (const k of [-1, 1]) {
      if ((i + (k > 0 ? 1 : 0)) % 2) continue
      puff(c, k * (10.5 + t * 10), 5 - t * 5, 1.3 + t * 1.7, t < 0.5 ? '#a3949a' : '#bcafb1', 'rgba(70,50,60,0.35)', 0.8)
    }
  }
  pop()
  pop()
}
// a steady beat: the wings sweep through a small even arc and the body rides it, no pose pops
const DRAGON_POSE = [{ flap: 1, bob: 0 }, { flap: 0.8, bob: 1.2 }, { flap: 0.62, bob: 2.2, roar: true }, { flap: 0.8, bob: 1.2 }].map((p, i) => ({ ...p, u: i / 4 }))
function paintDragon(c, f) { dragon(c, DRAGON_POSE[f % 4]) }

// ---- MAGMA EEL: lava-bound, it swims IN the tide. Only its reared-up head and two arched coils (one
// carrying a red fin) break the surface, each through a collar of bright lava; the rest is under it.
// Seen from above with its face toward you, its coils trailing up the screen behind it. Slate teal
// with a cream belly stripe: the one cool colour on the lava, so it reads against it.
const EEL = '#3f6d78', EEL_SH = 'rgba(8,26,40,0.48)', EEL_BELLY = '#f4dea2', FIN = '#e2402e', LAVA_HI = '#ffc24a', LAVA_MID = '#ff7a24'
// the lava closing round a body where it goes under: a flat ring of bright lava (far half here,
// near half drawn after the body by collarFront)
function collar(c, x, y, rx, ry) {
  cel(c, ell(x, y, rx, ry, 0, 40), LAVA_HI, { ink: 1.0, shade: null })
  cel(c, ell(x, y + ry * 0.1, rx * 0.7, ry * 0.5, 0, 36), LAVA_MID, { ink: 0, shade: null })
}
function collarFront(c, x, y, rx, ry) {
  cel(c, [...qb([x - rx, y], [x, y + ry * 2], [x + rx, y], 14), ...qb([x + rx, y], [x, y + ry * 0.7], [x - rx, y], 12).slice(1, -1)], LAVA_HI, { ink: 1.0, shade: null })
}
// one arched coil out of the lava: a hose arch between two collars (its feet hidden under them)
function coil(c, x, y, w, h, fin, thick) {
  for (const sx of [-1, 1]) collar(c, x + sx * w, y, thick * 0.78, thick * 0.34)
  const path = qb([x - w, y + 0.5], [x, y - h * 2], [x + w, y + 0.5], 24)
  if (fin) {
    // the fin rides the top of the arch: a red sail, two ink spines
    const a = path[6], b = path[18], top = path[12]
    const F = [a, ...qb([a[0] - 1.5, a[1] - fin * 0.9], [top[0], top[1] - fin * 1.9], [b[0] + 1.5, b[1] - fin * 0.9], 14), b]
    cel(c, F, FIN, { ink: 1.2, shade: 'rgba(110,8,26,0.4)' })
    for (const i of [9, 15]) line(c, [path[i], [path[i][0] + (i - 12) * 0.25, path[i][1] - fin * 1.15]], 0.6, { taper: 0.4 })
  }
  cel(c, tube(path, thick, thick), EEL, { ink: 1.6, shade: EEL_SH })
  // the cream belly shows along the arch's near (lower) side
  cel(c, tube(path.slice(4, 21).map(([px, py]) => [px, py + thick * 0.28]), thick * 0.32, thick * 0.32), EEL_BELLY, { ink: 0, shade: null })
  for (const sx of [-1, 1]) collarFront(c, x + sx * w, y, thick * 0.78, thick * 0.34)
}
function eel(c, o = {}) {
  const ph = o.ph || 0, lk = o.look || [0, 0.4]
  // the coils trail behind it (up the screen), rising and sinking in turn as it swims
  // the tail tip last, flicking up out of its own little collar
  {
    const tx = -4 + Math.sin(ph + 3) * 1.5, ty = -40, fk = Math.sin(ph + 3.4) * 3
    collar(c, tx, ty, 2.8, 1.1)
    cel(c, tube(qb([tx, ty + 0.3], [tx + fk * 0.4, ty - 4], [tx + fk, ty - 6.5], 12), 3.6, 0.9), EEL, { ink: 1.2, shade: EEL_SH })
    collarFront(c, tx, ty, 2.8, 1.1)
  }
  coil(c, 7 + Math.sin(ph + 1.5) * 1.2, -31, 4.6, 4.6 + 1.8 * Math.sin(ph + 2.4), 0, 5.4)
  coil(c, -6 + Math.sin(ph) * 1.2, -20, 5.6, 6.0 + 2.4 * Math.sin(ph + 1.2), 3.4, 6.8)
  const rise = o.rise ?? 0, tilt = o.tilt ?? 0
  collar(c, 0, 12, 9.5, 3.8)
  push(); tr(0, 12); rot(tilt); tr(0, -12 - rise)
  // the neck rearing out of its collar, the cream belly stripe up its front
  cel(c, tube(qb([0, 13 + rise], [1, 6], [0, 0]), 10, 10.5), EEL, { ink: 1.7, shade: EEL_SH })
  cel(c, tube(qb([0, 13 + rise], [1, 6], [0, 2]), 4.6, 5.4), EEL_BELLY, { ink: 0.8, shade: null })
  // two red frill fins at its cheeks
  for (const k of [-1, 1]) { push(); tr(k * 9.6, -6); rot(k * (0.35 + (o.flare || 0))); cel(c, [[0, -3.2], [k * 5.6, -5.4], [k * 4.4, -1.6], [k * 6.2, 1.2], [0, 3.2]], FIN, { ink: 1.1, shade: 'rgba(110,8,26,0.4)' }); pop() }
  // the head: a wide blunt eel's head, eyes up on top, a scowl, a toothy underbite
  cel(c, [...qb([-9.6, -4], [-10.4, -18.4], [0, -18.6], 16), ...qb([0, -18.6], [10.4, -18.4], [9.6, -4], 16).slice(1), ...qb([9.6, -4], [9.4, 3.4], [0, 3.6], 12).slice(1), ...qb([0, 3.6], [-9.4, 3.4], [-9.6, -4], 12).slice(1, -1)], EEL, { ink: 2.1, shade: EEL_SH, spec: 0.13 })
  eye(c, -4.1, -10.2, 3.7, 4.6, lk[0], lk[1], { white: '#ffe680' })
  eye(c, 4.1, -10.2, 3.7, 4.6, lk[0], lk[1], { white: '#ffe680' })
  brow(c, [-8.4, -15.6], [-4.6, -16.6], [-0.6, -13.4], 2.0)
  brow(c, [8.4, -15.6], [4.6, -16.6], [0.6, -13.4], 2.0)
  const gape = o.gape ?? 0
  mouth(c, [-8, -3.4], [8, -3.4], [0, -2.2], [0, 3 + gape * 2.6], { lowTeeth: [[-5, 0.6 + gape * 1.6, 1.1, 2.6], [-1.7, 1.6 + gape * 2.1, 1.1, 2.9], [1.7, 1.6 + gape * 2.1, 1.1, 2.9], [5, 0.6 + gape * 1.6, 1.1, 2.6]], tongue: gape > 0.5 ? [0, 3.6, 2.2] : null })
  pop()
  collarFront(c, 0, 12, 9.5, 3.8)
  // drips flicked off as it swims
  if (o.drip) for (const [x, y, r] of o.drip) cel(c, drop(x, y, r, r * 2.2), '#ffb43a', { ink: 0.8, shade: null })
}
const EEL_POSE = [
  { ph: 0, rise: 0, tilt: -0.07, gape: 0 },
  { ph: Math.PI / 2, rise: 2, tilt: 0, gape: 0.4, drip: [[-12.5, 0, 1.2]], flare: 0.1 },
  { ph: Math.PI, rise: 3, tilt: 0.07, gape: 1, flare: 0.25 },
  { ph: Math.PI * 1.5, rise: 1.2, tilt: 0, gape: 0.4, drip: [[13, -2, 1.2]], flare: 0.1 },
]
function paintEel(c, f) { eel(c, EEL_POSE[f % 4]) }

const wrap = (fn) => (ctx, f, elite) => { resetXf(); fn(ctx, f, elite); resetXf() }
export const TOON_CAST = {
  emberImp: { baseR: 10, frames: 4, box: [-22, -30, 22, 20], paint: wrap(paintImp) },
  magmaToad: { baseR: 11, frames: 4, box: [-27, -22, 27, 26], paint: wrap(paintToad), poseOf: toadPose },
  basaltGolem: { baseR: 27, frames: 4, box: [-41, -33, 41, 32], paint: wrap(paintGolem) },
  brimstoneDragon: { baseR: 26, frames: 4, box: [-70, -62, 76, 70], paint: wrap(paintDragon) },
  magmaEel: { baseR: 11, frames: 4, box: [-26, -50, 26, 22], paint: wrap(paintEel), lavaBound: true },
}

// ---- THE PLAYER: the digger. A big head under a yellow hard hat with its lamp, red shirt, blue -----
// dungarees, white gloves, a pick over the shoulder. Units = world px / PLAYER_SCALE.
export const PLAYER_SCALE = 1.35
export const PLAYER_BOX = [-30, -32, 30, 30]   // world px round the player's centre
function digger(c, f, bare) {
  const ph = (f / 4) * Math.PI * 2, sw = Math.sin(ph), bob = Math.abs(Math.cos(ph)) * 0.9
  const lk = [0.3, 0.2]
  if (!bare) shadow(c, 1.5, 13.5, 13, 5, 0.42)
  // boots, stepping
  cel(c, ell(-4.5, 13 - Math.max(0, sw) * 1.4, 3.4, 2.4, 0.2, 22), '#6b4128', { ink: 1.1, shade: 'rgba(40,16,30,0.45)' })
  cel(c, ell(4.8, 13.2 - Math.max(0, -sw) * 1.4, 3.4, 2.4, -0.2, 22), '#6b4128', { ink: 1.1, shade: 'rgba(40,16,30,0.45)' })
  push(); tr(0, -bob)
  const sh = 'rgba(30,16,60,0.42)'
  // body: blue dungarees over a red shirt, two gold buttons
  cel(c, ell(0, 7, 7.4, 6.4, 0, 36), '#3d68a3', { ink: 1.6, shade: sh })
  cel(c, ell(0, 4.4, 5, 2.6, 0, 22), '#cf4536', { ink: 0.9, shade: null })
  for (const k of [-1, 1]) cel(c, ell(k * 3.2, 6.2, 0.9, 0.9, 0, 10), '#f1d47a', { ink: 0.6, shade: null })
  // left arm swings; the right holds the pick over its shoulder
  cel(c, tube(qb([-6, 5], [-11, 8 + sw * 2], [-10.5, 12 + sw * 2]), 2.6, 2.3), '#cf4536', { ink: 1.0, shade: sh })
  glove(c, -10.5, 12.5 + sw * 2, 2.9, 1.8)
  cel(c, tube([[11, 1], [-2, -15]], 2.1), '#a8783c', { ink: 1.0, shade: 'rgba(60,30,20,0.45)' })
  push(); tr(-2.5, -15.5); rot(-0.9); cel(c, [...qb([-9, 3], [0, -5], [9, 3], 10), [6, 3], ...qb([4.5, 1.2], [0, -1], [-4.5, 1.2], 6), [-6, 3]], '#b7b3c2', { ink: 1.2, shade: 'rgba(30,30,60,0.45)', spec: 0.25 }); pop()
  cel(c, tube(qb([6, 4], [11, 5], [12, 1]), 2.6, 2.3), '#cf4536', { ink: 1.0, shade: sh })
  glove(c, 12, 0.5, 2.9, -1.4)
  // the big head, ears, the hard hat with its lamp
  cel(c, ell(0, -2.6, 9.4, 8.6, 0, 44), '#f3c69c', { ink: 1.8, shade: 'rgba(150,56,46,0.36)' })
  for (const k of [-1, 1]) cel(c, ell(k * 9.6, -1.6, 2, 2.6, 0, 18), '#f3c69c', { ink: 1.0, shade: 'rgba(150,56,46,0.36)' })
  cel(c, [...qb([-11.4, -4], [-11, -17.6], [0, -17.6], 14), ...qb([0, -17.6], [11, -17.6], [11.4, -4], 14).slice(1), ...qb([11.4, -4], [0, -7.6], [-11.4, -4], 14).slice(1, -1)], '#f0bb2c', { ink: 1.9, shade: 'rgba(150,60,8,0.45)', spec: 0.2 })
  line(c, qb([-1.4, -16.6], [-1.6, -11], [-0.8, -6.8]), 0.9)
  cel(c, ell(0, -9.6, 3.2, 2.6, 0, 22), '#fbf3cc', { ink: 1.2, shade: 'rgba(200,140,40,0.35)', spec: 0.3 })
  // the face: pie eyes, a red bulb nose, an open grin
  eye(c, -3.1, -1.9, 2.75, 3.5, lk[0], lk[1], { pr: 0.58, pry: 0.72 })
  eye(c, 3.1, -1.9, 2.75, 3.5, lk[0], lk[1], { pr: 0.58, pry: 0.72 })
  mouth(c, [-4.0, 3.3], [4.0, 3.3], [0, 4.4], [0, 8.8], { tongue: [0.3, 7.6, 1.9], ink: 1.0 })
  cel(c, ell(0, 1.8, 2.0, 1.6, 0, 18), '#dc5a46', { ink: 1.0, shade: 'rgba(100,10,10,0.4)', spec: 0.35 })
  pop()
}
// bare: without its ground shadow (the silhouette its keyline is cut from)
export function paintPlayer(ctx, f, bare = false) { resetXf(); sc(PLAYER_SCALE); digger(ctx, f, bare); resetXf() }

// a bubble with a face, peeking out of the swelling lava at the shore (the tide's tell); painted into
// the floor shader's atlas (world.js), so it rides the shore wherever the shader puts it
export function peekBubble(c, x, y, r, mood = 'peek', lk = [0, 0]) {
  glow(c, x, y, r * 1.6, '255,210,120', 0.28)
  cel(c, ell(x, y, r, r * 0.88, 0, 30), '#ffb03a', { ink: 1.0, shade: 'rgba(170,40,10,0.5)', spec: 0.22 })
  const er = r * 0.38
  if (mood === 'doze') {
    for (const sg of [-1, 1]) line(c, qb([x + sg * r * 0.36 - er, y - r * 0.05], [x + sg * r * 0.36, y + er * 0.6], [x + sg * r * 0.36 + er, y - r * 0.05]), 0.8)
  } else {
    eye(c, x - r * 0.38, y - r * 0.12, er, er * 1.25, lk[0], lk[1], { ink: 0.9 })
    eye(c, x + r * 0.38, y - r * 0.12, er, er * 1.25, lk[0], lk[1], { ink: 0.9 })
  }
  if (mood === 'grin') line(c, qb([x - r * 0.5, y + r * 0.35], [x, y + r * 0.75], [x + r * 0.5, y + r * 0.35]), 0.9, { belly: true })
  if (mood === 'oh') cel(c, ell(x, y + r * 0.45, r * 0.16, r * 0.2, 0, 16), '#3a0d12', { ink: 0.6, shade: null })
  // the lava lip it is rising through
  c.save(); c.fillStyle = 'rgba(236,140,56,0.95)'; c.beginPath(); c.ellipse(x, y + r * 0.78, r * 1.3, r * 0.3, 0, 0, 7); c.fill()
  c.strokeStyle = 'rgba(252,226,150,0.9)'; c.lineWidth = 1; c.beginPath(); c.ellipse(x, y + r * 0.74, r * 1.25, r * 0.26, 0, Math.PI + 0.2, -0.2); c.stroke(); c.restore()
}
