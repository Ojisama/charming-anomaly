// The Mantle's cast and its player: 1930s rubber-hose cartoon characters (render-only).
//
// The cast is PAPER CUT-OUTS, made the way the player is: painted with the brush in its paper mode
// (brush.js: flat gouache with the sheet's tooth showing through it, one flat hard-edged shade, no
// gloss, a steady ink line, each big part a separate paper piece throwing its own thin shadow on the
// piece under it), then cut out by toon.js with an uneven margin of bare paper round its ink that
// shifts a little from frame to frame. Pie-cut eyes, white gloves, rubber-hose limbs. Designed the
// Cuphead way: a big head on a
// small body, huge pie-cut eyes, a face with ATTITUDE (brows, teeth, a tongue), one clear gesture per
// creature and a silhouette nothing else in the chapter shares:
//   the imp     a devil's head on legs: V brows, a toothy grin, gold horns, a flame tuft (round + spike)
//   the toad    a wide flat pancake, eye domes on top, a smug lidded grin with its tongue out (wide + low)
//   the golem   a boulder that IS its face: a heavy brow, a lumpy nose, an underbite, white-gloved fists
//               on stone hose arms (a big square lump with fists)
//   the dragon  a chubby baby dragon, upright and face-on: a head bigger than its belly, a snout
//               trailing smoke, gloved hands, stubby feet, bat wings (the only thing in the air)
//   the eel     lives IN the lava: a grinning head on a neck and one sail-finned coil of back above
//               the surface, the rest under it (the one body that is cut off at a waterline)
// The charm is in the squash and stretch: the imps BOUNCE (stretched in the air, squashed on landing),
// the toad pancakes before it hops and stretches out when it leaps, the golem knuckle-walks, the dragon
// flaps, the eel swims. Every body faces the camera, the way a cartoon overworld shows its characters from above
// (render.js mirrors it to face its way; it is never turned), standing on its own soft shadow.
//   TOON_CAST[id] = { baseR, frames, box: [x0, y0, x1, y1] (units round the body's centre, room for the paper cut), paint, poseOf?, over?, sink?, cut? }
//   over(ctx, f): painted on top of the cut piece (smoke, the lava a swimmer is half under); sink(ctx, f): what to take away from the piece
//   (where it goes under); cut: the paper margin's numbers (toon.js's CAST_CUT by default).
//   paint(ctx, frame, elite) draws in units (the caller has scaled the context). render.js scales the
//   sprite by e.radius / baseR, so baseR sets how many world px one unit is drawn at.
import { resetXf, push, pop, tr, rot, sc, ell, polar, drop, tube, qb, line, cel, eye, glove, shadow, glow, puff, flame, brush, mp, INK, setPaper, ground } from './brush.js'

const SH_RED = 'rgba(96,6,24,0.42)'
const MOUTH = '#3a0d12', TONGUE = '#e0564f', TOOTH = '#f8f1de'

// A cartoon mouth: the opening between an upper and a lower curve (x0,y0 -> x1,y1), painted dark, a
// tongue inside, a row of teeth hanging from the top lip (teeth: band depth, n: how many) or fangs
// (fangs: [[x, len], ...]) or square teeth standing on the lower lip (lowTeeth), then inked.
function mouth(c, a, b, cTop, cBot, o = {}) {
  const up = qb(a, cTop, b, 16), lo = qb(b, cBot, a, 16).slice(1, -1)
  const M = [...up, ...lo]
  cel(c, M, MOUTH, { ink: 0, shade: null, dabs: 0 })
  c.save()
  const P = M.map(mp); c.beginPath(); P.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.clip()
  if (o.tongue) { const [tx, ty, tr0] = o.tongue; cel(c, ell(tx, ty, tr0, tr0 * 0.75, 0, 24), TONGUE, { ink: 0.7, shade: 'rgba(120,10,20,0.45)', dabs: 0 }) }
  if (o.teeth) {
    const th = o.teeth, n = o.n || 6
    const band = [...up, ...qb([b[0], b[1] + th * 0.7], [cTop[0], cTop[1] + th], [a[0], a[1] + th * 0.7], 16)]
    cel(c, band, TOOTH, { ink: 0, shade: null, dabs: 0 })
    for (let k = 1; k < n; k++) {
      const t = k / n, u = 1 - t
      const x = u * u * a[0] + 2 * u * t * cTop[0] + t * t * b[0], y = u * u * a[1] + 2 * u * t * cTop[1] + t * t * b[1]
      line(c, [[x, y - 0.4], [x + (t - 0.5) * 0.6, y + th * 0.95]], 0.5, { taper: 0.2 })
    }
    line(c, qb([a[0], a[1] + th * 0.7], [cTop[0], cTop[1] + th], [b[0], b[1] + th * 0.7]), 0.55, { taper: 0.25 })
  }
  if (o.fangs) for (const [fx, fl, fw = 1.4] of o.fangs) {
    // a fang hanging from the top lip at x = fx: find the lip's y there
    let fy = a[1], best = 1e9; for (const p of up) if (Math.abs(p[0] - fx) < best) { best = Math.abs(p[0] - fx); fy = p[1] }
    cel(c, [[fx - fw, fy - 0.6], [fx + fw, fy - 0.6], [fx + 0.15, fy + fl]], TOOTH, { ink: 0.55, shade: null, dabs: 0 })
  }
  if (o.lowTeeth) for (const [fx, fy, fw, fh] of o.lowTeeth) cel(c, [[fx - fw, fy + 1], [fx + fw, fy + 1], [fx + fw * 0.9, fy - fh], [fx - fw * 0.9, fy - fh]], TOOTH, { ink: 0.6, shade: null, dabs: 0 })
  c.restore()
  brush(c, M, true, o.ink ?? 1.15)
}
// a fat tapered brow stroke (the attitude)
const brow = (c, a, m, b, w = 1.6) => line(c, qb(a, m, b), w, { belly: true, taper: 0.45 })
// rosy cheeks, brushed thin
function blush(c, pts, col = '#f59a78', a = 0.45) { c.save(); c.globalAlpha = a; for (const [x, y, rx, ry] of pts) cel(c, ell(x, y, rx, ry, 0, 16), col, { ink: 0, shade: null, dabs: 0 }); c.restore() }

// ---- EMBER IMP: a devil's head on legs. Gold horns, a flame tuft, V brows, a wide toothy grin ------
function imp(c, o = {}) {
  const st = o.stretch || 1, lk = o.look || [0, 0], arms = o.arms || 'swing', lift = o.lift || 0
  shadow(c, 1.5, 10, 8 * (lift > 1 ? 0.78 : 1), 3.6, lift > 1 ? 0.24 : 0.36)
  push(); tr(0, -lift)
  tr(0, 9); sc(1 / Math.sqrt(st), st); tr(0, -9)
  const body = o.col || '#d8382a'
  // tail with a spade tip, little hooves
  cel(c, tube(qb([2, 6], [11, 10], [12, 1]), 2.0, 1.3), body, { ink: 1.0, shade: SH_RED })
  push(); tr(12, 0); rot(0.25); cel(c, drop(0, 0, 2.6, 4.4), body, { ink: 1.0, shade: SH_RED }); pop()
  cel(c, ell(-3, 8.4, 2.5, 1.7, 0.2, 20), '#3e1716', { ink: 1.0, shade: null })
  cel(c, ell(3.2, 8.6, 2.5, 1.7, -0.2, 20), '#3e1716', { ink: 1.0, shade: null })
  // rubber-hose arms and gloves: the gesture (fists up for the bounce, grabbing out on the way down)
  const L = arms === 'up' ? [[-5, 4], [-14, 2], [-13, -8]] : arms === 'reach' ? [[-5, 4], [-12, 6], [-15, 0]] : [[-5, 4], [-11, 9], [-14, 5]]
  const R = arms === 'up' ? [[5, 4], [14, 2], [14, -8]] : arms === 'reach' ? [[5, 4], [13, 2], [15, -5]] : [[5, 4], [11, 2], [14, -3]]
  for (const A of [L, R]) cel(c, tube(qb(A[0], A[1], A[2]), 2.0, 1.7), body, { ink: 0.95, shade: SH_RED })
  glove(c, L[2][0], L[2][1], 3.0, Math.atan2(L[2][1] - L[1][1], L[2][0] - L[1][0]))
  glove(c, R[2][0], R[2][1], 3.0, Math.atan2(R[2][1] - R[1][1], R[2][0] - R[1][0]))
  // the little body under the head
  cel(c, ell(0, 5.6, 4.4, 3.6, 0, 30), body, { ink: 1.2, shade: SH_RED })
  // the flame tuft, behind the head
  const fl = o.big ? 1.25 : 1
  cel(c, flame(0.3, -9.2, 5.6 * Math.sqrt(fl), 12.5 * fl, o.curl ?? 0.7), '#f07a20', { ink: 1.2, shade: 'rgba(160,36,10,0.45)' })
  cel(c, flame(0.5, -8.9, 3.1 * Math.sqrt(fl), 7.8 * fl, (o.curl ?? 0.7) - 0.1), '#ffd95e', { ink: 0, shade: null })
  // gold devil horns, ringed
  for (const k of [-1, 1]) {
    cel(c, tube(qb([k * 4.6, -6.4], [k * 7.8, -8.6], [k * 6.6, -12.4]), 3.0, 0.7), '#f4c34a', { ink: 1.0, shade: 'rgba(150,70,10,0.45)' })
    line(c, [[k * 5.3, -8.6], [k * 7.4, -8.0]], 0.5, { taper: 0.3 })
  }
  // pointed ears
  for (const k of [-1, 1]) { push(); tr(k * 9.4, -2.6); rot(k * 1.15); cel(c, drop(0, 0, 2.2, 5.4), body, { ink: 1.0, shade: SH_RED }); pop() }
  // the head: the big round
  cel(c, ell(0, -1.4, 9.4, 8.4, 0, 48), body, { ink: 1.8, shade: SH_RED, spec: 0.18 })
  blush(c, [[-6.2, 1.6, 1.7, 1.0], [6.2, 1.6, 1.7, 1.0]])
  // the face: tall pie eyes crowded together, a V of brows, a cheek-to-cheek toothy grin
  const sq = o.squint ? 0.82 : 1
  eye(c, -2.75, -2.6, 2.75, 3.9 * sq, lk[0], lk[1], { pr: 0.55, pry: 0.74 })
  eye(c, 2.75, -2.6, 2.75, 3.9 * sq, lk[0], lk[1], { pr: 0.55, pry: 0.74 })
  brow(c, [-6.4, -7.6], [-3.6, -7.6], [-0.5, -5.6], 1.9)
  brow(c, [6.4, -7.6], [3.6, -7.6], [0.5, -5.6], 1.9)
  mouth(c, [-6.8, 1.0], [6.8, 1.0], [0, 3.4], [0, 10.6], { teeth: 1.9, n: 7, tongue: [1.2, 8.6, 2.6] })
  pop()
}
// IMP frames: a bounce. 0 up and stretched, 1 coming down, 2 landed and squashed (dust), 3 springing
const IMP_POSE = [
  { stretch: 1.16, arms: 'reach', lift: 4, look: [0.4, 0.3], curl: 0.9, lines: true },
  { stretch: 1.04, arms: 'swing', lift: 2, look: [0.5, 0.4], curl: 0.6 },
  { stretch: 0.82, arms: 'up', lift: 0, look: [0.4, 0.5], curl: 0.3, dust: true, squint: true },
  { stretch: 1.0, arms: 'swing', lift: 1, look: [0.5, 0.4], curl: 0.5 },
]
function paintImp(c, f, elite) {
  const P = IMP_POSE[f % 4]
  imp(c, { ...P, col: elite ? '#b92a30' : '#d8382a', big: elite })
  // the bounce lines and the landing dust lie on the ground, outside the cut-out
  ground(() => {
    if (P.lines) { line(c, qb([-5, 13.5], [0, 15], [5, 13.5]), 0.9); line(c, qb([-3, 16], [0, 17], [3, 16]), 0.8) }
    if (P.dust) { puff(c, -10, 10, 2.2); puff(c, 10.5, 10.5, 2.5) }
  })
}

// ---- MAGMA TOAD: a wide flat pancake of a toad, eye domes on top, a smug lidded grin, tongue out ----
function toad(c, o = {}) {
  const lk = o.look || [0, 0], sx = o.sx || 1, sy = o.sy || 1, lift = o.lift || 0
  shadow(c, 1.5, 6, 17 * (lift ? 0.8 : 1), 7, lift ? 0.26 : 0.38)
  push(); tr(0, -lift); tr(0, 6); sc(sx, sy); tr(0, -6)
  const skin = o.col || '#c4562c', dark = '#5a1e18', sh = 'rgba(60,6,16,0.5)', belly = '#f2c166'
  // hind legs: folded out flat to the sides for the squash, flung back and out for the leap
  for (const k of [-1, 1]) {
    // a fat haunch folded at its side, the shin tucked under it
    if (!o.leap) cel(c, ell(k * 14.5, 3.5, 6.4, 5.4, k * 0.3, 32), skin, { ink: 1.3, shade: sh })
    const legs = o.leap ? [[k * 8, 4], [k * 17, 6], [k * 23, 12], [k * 21, 16]] : qb([k * 17, 4], [k * 21, 9], [k * 15, 10.5], 10)
    cel(c, tube(legs, o.leap ? 5.6 : 4.4, 3.2), skin, { ink: 1.2, shade: sh })
    const ft = o.leap ? [k * 22, 17] : [k * 15.5, 11]
    // a webbed three-toed foot fanned out to the side, a round pad on each toe
    push(); tr(ft[0], ft[1]); rot(k > 0 ? 0.35 : Math.PI - 0.35)
    cel(c, [[-1, -1.6], ...qb([1.2, -3.6], [4.4, -1.8], [4.6, 0], 6), ...qb([4.6, 0], [4.8, 2.0], [1.2, 3.6], 6).slice(1), [-1, 1.6]], belly, { ink: 1.0, shade: 'rgba(130,60,20,0.4)' })
    for (const ag of [-0.75, 0, 0.75]) cel(c, ell(Math.cos(ag) * 4.6, Math.sin(ag) * 3.6, 1.1, 1.0, 0, 12), belly, { ink: 0.7, shade: null, dabs: 0 })
    pop()
  }
  // front hands: white gloves splayed forward (reaching ahead on the leap)
  if (o.leap) { glove(c, -10, -10, 2.9, -2.0); glove(c, 10, -10, 2.9, -1.1) } else { glove(c, -10, -6, 2.9, -2.4); glove(c, 10, -6, 2.9, -0.7) }
  // the body: a squashed pancake with a cream belly showing at its front edge
  cel(c, ell(0, 1, 16, 9.8, 0, 52, 0.02, 3), skin, { ink: 2.0, shade: sh, spec: 0.14 })
  cel(c, [...qb([-12, 2.5], [0, 11.5], [12, 2.5], 14), ...qb([12, 2.5], [0, 13.6], [-12, 2.5], 14).slice(1, -1)], belly, { ink: 1.0, shade: 'rgba(150,60,20,0.4)' })
  // magma warts (glowing pores) on its back
  for (const [wx, wy, wr] of [[-11.5, -2, 1.3], [11.8, -1.2, 1.4], [-13, 3, 1.0], [13.2, 3.6, 1.1]]) {
    cel(c, ell(wx, wy, wr, wr * 0.8, 0, 16), dark, { ink: 0, shade: null })
    cel(c, ell(wx - 0.2, wy - 0.2, wr * 0.55, wr * 0.45, 0, 12), '#f7a83e', { ink: 0, shade: null })
  }
  // eye domes on top of the head
  cel(c, ell(-6, -6.6, 5.9, 5.4, 0, 30), skin, { ink: 1.5, shade: sh })
  cel(c, ell(6, -6.6, 5.9, 5.4, 0, 30), skin, { ink: 1.5, shade: sh })
  eye(c, -6, -7, 4.0, 4.3, lk[0], lk[1] + 0.3, { pr: 0.58, pry: 0.62 })
  eye(c, 6, -7, 4.0, 4.3, lk[0], lk[1] + 0.3, { pr: 0.58, pry: 0.62 })
  if (!o.leap) {
    // heavy smug lids, drooping over the top half of each eye, with an ink lash line
    for (const k of [-1, 1]) {
      cel(c, [...qb([k * 10.2, -7.6], [k * 6, -13.6], [k * 1.8, -7.6], 12), ...qb([k * 1.8, -7.6], [k * 6, -6.4], [k * 10.2, -7.6], 10).slice(1, -1)], skin, { ink: 0, shade: null })
      line(c, qb([k * 10.4, -7.4], [k * 6, -6.2], [k * 1.6, -7.8]), 1.3, { belly: true })
    }
    // one brow cocked up: the smug look
    brow(c, [-10, -12.6], [-6.5, -14.6], [-2.6, -13.2], 1.3)
  } else { brow(c, [-9.5, -13], [-6, -14.4], [-2.6, -13], 1.2); brow(c, [9.5, -13], [6, -14.4], [2.6, -13], 1.2) }
  blush(c, [[-9.6, 1.4, 2.2, 1.2], [9.6, 1.4, 2.2, 1.2]], '#f08a64', 0.4)
  // the grin: a wide slab of a smile from cheek to cheek, the tongue lolling out of one corner
  if (o.leap) { mouth(c, [-3, 2.4], [3, 2.4], [0, 0.6], [0, 7.6], { tongue: [0, 6.4, 2.0] }) } else {
    mouth(c, [-12, -0.2], [12, -0.2], [0, 4.2], [0, 9.8], { teeth: 1.5, n: 9, tongue: [4.6, 7.4, 3.0] })
    line(c, qb([-12.6, -1.6], [-11.6, -0.4], [-11.8, 1.0]), 0.9)
    line(c, qb([12.6, -1.6], [11.6, -0.4], [11.8, 1.0]), 0.9)
  }
  pop()
  ground(() => {
    if (o.dust) { puff(c, -19, 9, 2.4); puff(c, 19.5, 8, 2.8); puff(c, 15, 12, 1.8) }
    if (o.leap) { line(c, qb([-7, 17], [0, 19], [7, 17]), 0.9); line(c, qb([-4, 20], [0, 21.2], [4, 20]), 0.8) }
  })
}
// TOAD frames: 0/1 sat and breathing, 2 pancaked ready to spring (aim / land), 3 the leap
const TOAD_POSE = [
  { sx: 1, sy: 1, look: [0.4, 0.2] },
  { sx: 0.97, sy: 1.05, look: [0.4, 0.2] },
  { sx: 1.14, sy: 0.82, look: [0.5, 0.1], dust: true },
  { sx: 0.92, sy: 1.1, lift: 6, leap: true, look: [0.3, -0.3] },
]
function paintToad(c, f, elite) { toad(c, { ...TOAD_POSE[f % 4], col: elite ? '#a23c28' : '#c4562c' }) }
function toadPose(e) {
  const s = e._pounceState
  if (s === 'leap') return 3
  if (s === 'aim' || s === 'land') return 2
  return Math.floor(-(e._pounceT || 0) * 3 + (e.id || 0) * 0.37) & 1
}

// ---- BASALT GOLEM: a boulder that IS its face. A heavy brow, a lumpy nose, a proud underbite, -------
// stone hose arms ending in big white-gloved fists, knuckle-walking; a little ember smouldering on top
function golem(c, o = {}) {
  const lk = o.look || [0, 0], a = o.step || 0, bob = o.bob || 0
  shadow(c, 3, 13, 36, 14, 0.42)
  push(); tr(0, -bob)
  const st = o.col || '#7d6a66', st2 = '#5b4a4f', pale = '#a08d86', sh = 'rgba(30,8,24,0.32)'
  const rock = (cx, cy, r, sd, col = st, ink = 1.8, ry = 1) => cel(c, polar(cx, cy, (t) => r * (1 + 0.08 * Math.sin(t * 3 + sd) + 0.05 * Math.sin(t * 5 + sd * 2) + 0.025 * Math.sin(t * 9 + sd)) * (1 - (1 - ry) * Math.abs(Math.sin(t))), 54), col, { ink, shade: sh })
  // stubby feet under the boulder
  rock(-10, 17, 5.4, 9, st2, 1.4, 0.7); rock(10, 17.4, 5.4, 10, st2, 1.4, 0.7)
  // stone hose arms swinging out and down to the fists on the ground (one forward, one back)
  const fl = [-28, 9 + a * 3 + bob], fr = [28, 7 - a * 3 + bob]
  cel(c, tube(qb([-15, -6], [-27, -6 + a * 2], fl), 8.8, 7.4), st2, { ink: 1.5, shade: sh })
  cel(c, tube(qb([15, -6], [27, -6 - a * 2], fr), 8.8, 7.4), st2, { ink: 1.5, shade: sh })
  for (const [k, F] of [[-1, fl], [1, fr]]) glove(c, F[0], F[1] + 1, 6.4, Math.PI / 2 - k * 0.35)
  // the boulder: one big lumpy stone, a paler cap where the light lands, a few chips and pebbles
  rock(0, -2, 20.5, 5, st, 2.1, 0.92)
  cel(c, polar(-5, -10, (t) => 11 * (1 + 0.12 * Math.sin(t * 3 + 2) + 0.05 * Math.sin(t * 7)), 40), pale, { ink: 0, shade: null })
  line(c, qb([-17, 4], [-15, 9], [-10, 12]), 1.0); line(c, qb([17, 2], [16, 7], [12, 11]), 1.0)
  line(c, qb([10, -17], [12, -14], [15, -14]), 0.9)
  rock(-12, -16, 3.2, 6, st2, 1.1); rock(13.5, -11.5, 2.4, 7, st2, 1.0)
  // the ember smouldering on its crown, like a lit cigar's tip: its one warm spot
  cel(c, flame(2, -21, 3.0, 6.2, 0.6), '#f07a20', { ink: 1.0, shade: 'rgba(160,36,10,0.45)' })
  cel(c, flame(2.1, -20.8, 1.6, 3.6, 0.5), '#ffd95e', { ink: 0, shade: null })
  rock(2, -19, 3.2, 3, st2, 1.1, 0.75)
  // the face: big pie eyes under one heavy stone brow (knitted, grumpy), a lumpy nose, the underbite
  eye(c, -5.4, -4.4, 3.8, 4.6, lk[0], lk[1], { pr: 0.6, pry: 0.66 })
  eye(c, 5.4, -4.4, 3.8, 4.6, lk[0], lk[1], { pr: 0.6, pry: 0.66 })
  for (const k of [-1, 1]) cel(c, tube(qb([k * 10.8, -9.4], [k * 6, -11.8], [k * 0.6, -7.8]), 3.6, 2.6), '#4a3b40', { ink: 1.4, shade: null })
  cel(c, ell(0, 1.4, 3.0, 2.4, 0, 26, 0.08, 4), pale, { ink: 1.3, shade: sh })
  blush(c, [[-9.6, 2.0, 2.4, 1.3], [9.6, 2.0, 2.4, 1.3]], '#e58a72', 0.35)
  mouth(c, [-8.6, 5.4], [8.6, 5.4], [0, 7.2], [0, 13.6], { tongue: [0, 12.6, 2.6], lowTeeth: [[-4.2, 11.4, 1.9, 4.2], [4.2, 11.4, 1.9, 4.2]] })
  pop()
}
const GOLEM_POSE = [{ step: 1, bob: 0 }, { step: 0, bob: 1.4 }, { step: -1, bob: 0 }, { step: 0, bob: 1.4 }]
function paintGolem(c, f, elite) { golem(c, { ...GOLEM_POSE[f % 4], look: [0, 0.5], col: elite ? '#6a5560' : '#7d6a66' }) }

// ---- BRIMSTONE DRAGON (the elite): a chubby baby dragon on spread bat wings, flying high (its shadow
// far below). Drawn UPRIGHT and face-on like the rest of the cast (the head on top of the belly, the
// face toward you), so it reads the same from any side it comes at you (render.js only mirrors it).
// A head bigger than its belly, a cream snout always trailing a drift of brimstone smoke (.over), a
// fanged grin, V brows, gold horns, gloved fists, stubby feet, a spade tail curling out behind. The
// wings flap in a small, even beat.
const mix2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const DRAGON_SC = 1.18, DRAGON_HEAD = [0, -15]
function dragon(c, o = {}) {
  const lk = o.look || [0.3, 0.45], fl = o.flap ?? 1, bob = o.bob || 0
  shadow(c, 4, 46, 46, 18, 0.36, '50,10,20')
  push(); tr(0, -bob); sc(DRAGON_SC)
  const g = '#7fb23c', g2 = '#5e8c2a', cream = '#f1dca2', mem = '#e0a83e', sh = 'rgba(28,44,8,0.48)'
  // wings, behind everything: arm, three finger spars, a scalloped membrane. The beat swings the
  // spars up a little and draws the span in a little (never a big breath)
  for (const k of [-1, 1]) {
    push(); sc(0.86 + 0.14 * fl, 1)
    const up = (1 - fl) * 7
    const sh0 = [k * 6, -6]
    const tips = [[k * 50, -12 + up * 0.6], [k * 46, -32 - up], [k * 28, -40 - up * 0.7]]
    const elbow = [k * 25, -8 - up * 0.3]
    const memPts = [sh0, elbow, tips[0], ...qb(tips[0], [k * 40, -16], tips[1], 8).slice(1), ...qb(tips[1], [k * 34, -28], tips[2], 8).slice(1), ...qb(tips[2], [k * 16, -22], [k * 5, -16], 8).slice(1)]
    cel(c, memPts, mem, { ink: 1.5, shade: 'rgba(120,50,10,0.42)' })
    for (const tp of tips) { const m = mix2(elbow, tp, 0.5); line(c, qb(elbow, [m[0] + k * 1.5, m[1] + 3], tp, 14), 1.6, { taper: 0.35 }) }
    cel(c, tube([sh0, [k * 15, -2], elbow], 6.0, 4.0), g, { ink: 1.4, shade: sh })
    cel(c, tube([elbow, tips[0]], 3.4, 1.6), g, { ink: 1.2, shade: sh })
    cel(c, [[elbow[0], elbow[1] - 1.5], [elbow[0] + k * 4, elbow[1] - 5], [elbow[0] - k * 0.5, elbow[1] - 2.4]], TOOTH, { ink: 0.7, shade: null })
    pop()
  }
  // the tail, curling out from behind it, white spikes, a red spade
  const TL = [[2, 6], [12, 15], [22, 14], [27, 5]]
  cel(c, tube(TL, 7, 2.4), g, { ink: 1.5, shade: sh })
  for (const [x, y, a] of [[11, 12, -0.6], [18, 12.6, 0.1], [24, 9, 0.7]]) { push(); tr(x, y); rot(a); cel(c, [[-1.3, 0], [1.3, 0], [0, -3]], TOOTH, { ink: 0.7, shade: null }); pop() }
  push(); tr(28, 3); rot(0.5); cel(c, drop(0, 0, 3.8, 6.6), '#dc4a38', { ink: 1.1, shade: SH_RED }); pop()
  // stubby feet dangling under the belly, cream claws
  for (const k of [-1, 1]) { cel(c, ell(k * 6.5, 13, 3.4, 2.8, 0, 20), g2, { ink: 1.2, shade: sh }); for (const d of [-1.3, 0, 1.3]) cel(c, ell(k * 6.5 + d, 15.4, 0.7, 0.9, 0, 10), cream, { ink: 0.5, shade: null }) }
  // the plump belly, cream plates down its front
  cel(c, ell(0, 3, 10.5, 11, 0, 44), g, { ink: 2.0, shade: sh })
  cel(c, ell(0, 4.5, 5.2, 8.4, 0, 36), cream, { ink: 1.0, shade: 'rgba(150,100,40,0.35)', piece: false })
  for (const y of [1, 4.6, 8.2]) line(c, qb([-4.2, y], [0, y + 1.2], [4.2, y]), 0.55, { taper: 0.3 })
  // rubber-hose arms, white-gloved fists balled at its sides (the bully's pose)
  for (const k of [-1, 1]) {
    cel(c, tube(qb([k * 8, 0], [k * 14, -1], [k * 16.5, 4]), 3.0, 2.6), g, { ink: 1.1, shade: sh })
    glove(c, k * 17, 5, 3.4, k > 0 ? 1.0 : Math.PI - 1.0)
  }
  // the big head on top, face on
  push(); tr(DRAGON_HEAD[0], DRAGON_HEAD[1])
  // horns swept up and back, and cheek frills
  for (const k of [-1, 1]) {
    cel(c, tube(qb([k * 7, -7], [k * 13, -10], [k * 13.5, -17]), 4.0, 0.8), '#f4c34a', { ink: 1.1, shade: 'rgba(150,70,10,0.45)' })
    push(); tr(k * 12.6, 1); rot(k * 1.5); cel(c, drop(0, 0, 2.6, 5.6), g2, { ink: 1.0, shade: sh }); pop()
  }
  cel(c, ell(0, -1, 13.4, 11, 0, 48), g, { ink: 2.0, shade: sh })
  // the snout: a wide muzzle toward you with two smoking nostrils
  cel(c, ell(0, 5.0, 10.2, 5.6, 0, 40), '#a9d062', { ink: 1.5, shade: null, piece: false })
  for (const k of [-1, 1]) cel(c, ell(k * 3.0, 2.8, 1.35, 1.0, k * 0.4, 14), INK, { ink: 0, shade: null })
  eye(c, -4.6, -4.4, 4.3, 5.3, lk[0], lk[1], { white: '#f8e88a', pr: 0.55, pry: 0.7 })
  eye(c, 4.6, -4.4, 4.3, 5.3, lk[0], lk[1], { white: '#f8e88a', pr: 0.55, pry: 0.7 })
  brow(c, [-10, -10], [-5.2, -10.4], [-0.6, -7.8], 2.0)
  brow(c, [10, -10], [5.2, -10.4], [0.6, -7.8], 2.0)
  blush(c, [[-8.8, 2.0, 1.8, 1.1], [8.8, 2.0, 1.8, 1.1]], '#f0886a', 0.4)
  mouth(c, [-8.8, 5.0], [8.8, 5.0], [0, 7.2], [0, 13.4], { fangs: [[-4.6, 2.8, 1.6], [4.6, 2.8, 1.6]], tongue: [0.6, 12.0, 2.8] })
  pop()
  pop()
}
// THE SMOKE: three puffs a side always curling off the snout and out past the cheeks, each a third of a beat behind the last, born
// small and dense, drifting up and out, growing and thinning (drawn over the cut piece, never cut)
function dragonSmoke(c, f, bob) {
  for (let k = 0; k < 3; k++) {
    const u = ((f / 4) + k / 3) % 1
    for (const side of [-1, 1]) {
      const x = (DRAGON_HEAD[0] + side * (10.5 + u * 11)) * DRAGON_SC, y = (DRAGON_HEAD[1] + 4.5 - u * 7 - u * u * 4) * DRAGON_SC - bob
      c.save(); c.globalAlpha = 0.95 * (1 - u * u)
      puff(c, x + side * Math.sin(u * 5 + k) * 0.8, y, (1.3 + u * 2.6) * (side < 0 ? 0.85 : 1), '#d2c6bc', 'rgba(70,50,60,0.4)', 0.7)
      c.restore()
    }
  }
}
const DRAGON_POSE = [{ flap: 1, bob: 0 }, { flap: 0.84, bob: 1.2 }, { flap: 0.7, bob: 2.2 }, { flap: 0.84, bob: 1.2 }]
function paintDragon(c, f) { dragon(c, DRAGON_POSE[f % 4]) }
function paintDragonOver(c, f) { dragonSmoke(c, f, DRAGON_POSE[f % 4].bob) }

// ---- MAGMA EEL: lives IN the lava. Only its head and one coil of its back ever break the surface: --
// a big grinning head on a neck rising out of a ring of ripples, one round hump of back with a red
// sail fin along it, the flick of a tail fin further back. Everything under the waterline is cut off
// the paper piece (TOON_CAST.magmaEel.sink), then a lava collar is laid round each place it breaks the
// surface (.over), so it reads as swimming, not standing. The swim: the head bobs, the coil rolls
// forward and swells, the tail flicks, the ripples spread.
const TAU_ = Math.PI * 2
const EEL_SURF = 8   // the lava's surface, in units below the body's centre
function eelPose(ph) {
  return {
    hx: 12 + 0.6 * Math.sin(ph), hy: -10 + 1.4 * Math.sin(ph),                     // the head
    cx: -11 + 1.8 * Math.cos(ph), hw: 11, hh: 12 + 1.6 * Math.sin(ph + 1.6),        // the coil
    tx: -27 + 0.6 * Math.sin(ph + 3), flick: Math.sin(ph + 3),                        // the tail
  }
}
// where it breaks the surface: [x, half width] of each part going under
const eelBreaks = (E) => [[12.6, 4.6], [E.cx - E.hw, 4.2], [E.cx + E.hw, 4.2], [E.tx, 2.6]]
function eel(c, o = {}) {
  const ph = o.ph || 0, lk = o.look || [0.4, 0.3], S = EEL_SURF, E = eelPose(ph)
  const skin = o.col || '#4b3447', belly = '#f2a03c', fin = o.fin || '#e2502e', sh = 'rgba(20,6,24,0.45)', fsh = 'rgba(120,10,10,0.42)'
  // the ripples it leaves on the lava, spreading out of each place it breaks the surface
  ground(() => {
    for (const [x, w] of eelBreaks(E)) for (let k = 0; k < 2; k++) {
      const g = ((ph / TAU_) + k * 0.5 + x * 0.013) % 1
      const rx = w * (1.5 + 1.3 * g)
      brush(c, ell(x, S + 0.6, rx, rx * 0.3, 0, 40), true, 1.1 * (1 - g) + 0.25, { color: 'rgba(255,220,130,' + (0.9 * (1 - g)).toFixed(2) + ')', flat: true })
    }
  })
  // the tail: a fin flicking up out of the lava behind the coil
  const tt = [E.tx - 3 - 1.6 * E.flick, S - 9 + E.flick]
  cel(c, tube(qb([E.tx, S + 3], [E.tx + 0.5, S - 4], tt, 10), 5.0, 1.8), skin, { ink: 1.3, shade: sh })
  push(); tr(tt[0], tt[1]); rot(-0.7 + 0.3 * E.flick); cel(c, [[0, 0.6], ...qb([-3.4, -5], [0.4, -8.4], [4, -6], 8), [1.2, -0.6]], fin, { ink: 1.1, shade: fsh }); pop()
  // the coil: one round hump of back out of the lava, a scalloped sail fin fanned off its crest
  const arch = [], sail = []
  for (let i = 0; i <= 28; i++) {
    const t = Math.PI + (i / 28) * Math.PI, ca = Math.cos(t), sa = Math.sin(t)
    const p = [E.cx + ca * E.hw, S + 3 + sa * (E.hh + 3)]
    arch.push(p)
    let nx = ca / E.hw, ny = sa / (E.hh + 3); const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l
    const u = i / 28, ht = (u > 0.18 && u < 0.86) ? (o.big ? 7.5 : 6.2) * Math.sin(((u - 0.18) / 0.68) * Math.PI) * (i % 4 === 1 ? 1.12 : 0.82) + 3.7 : 0
    sail.push([p[0] + nx * ht, p[1] + ny * ht])
  }
  {
    const lo = 5, hi = 24
    const crest = arch.slice(lo, hi + 1), top = sail.slice(lo, hi + 1)
    cel(c, [...crest.slice().reverse(), ...top], fin, { ink: 1.2, shade: fsh })
    for (let i = 2; i < crest.length - 1; i += 4) line(c, [crest[i], top[i]], 0.8, { taper: 0.45 })
  }
  cel(c, tube(arch, 7.0, 7.0), skin, { ink: 1.8, shade: sh })
  // ember spots glowing along its back
  for (const u of [0.32, 0.5, 0.68]) {
    const p = arch[Math.round(u * 28)]
    cel(c, ell(p[0], p[1] + 1.2, 1.4, 1.0, 0, 14), belly, { ink: 0, shade: null })
  }
  // the neck rising out of the lava, its ember-orange throat toward you, ringed
  cel(c, tube(qb([12.6, S + 3], [13.6, (S + E.hy) / 2], [E.hx, E.hy + 4], 12), 9.2, 8.2), skin, { ink: 1.7, shade: sh })
  cel(c, tube(qb([13.2, S + 3], [14.4, (S + E.hy) / 2 + 1], [E.hx + 0.6, E.hy + 6], 12), 4.0, 3.2), belly, { ink: 0.8, shade: null, piece: false })
  for (const y of [S - 2.5, S - 6]) line(c, qb([11.6, y], [13.8, y + 1], [15.8, y - 0.2]), 0.55, { taper: 0.3 })
  // the head
  push(); tr(E.hx, E.hy); rot(0.07 * Math.sin(ph))
  // the crest: a spiky red fin swept back off its crown
  cel(c, [[-9, -2], ...qb([-15, -8], [-12, -11], [-8.6, -9.4], 6), ...qb([-8.6, -9.4], [-6.4, -14.2], [-3, -10.8], 6).slice(1), ...qb([-3, -10.8], [0, -14.4], [2.6, -9], 6).slice(1), [2, -6]], fin, { ink: 1.2, shade: fsh })
  for (const [a, b] of [[[-7, -5], [-12.4, -9]], [[-4, -7], [-6.4, -13]], [[-0.5, -7], [0, -13.4]]]) line(c, [a, b], 0.7, { taper: 0.45 })
  // gill frills at its cheeks
  for (const k of [-1, 1]) { push(); tr(k * 11.6, 3.2); rot(k * 2.05); cel(c, drop(0, 0, 2.6, 6.0, -k * 0.5), fin, { ink: 1.0, shade: null }); pop() }
  cel(c, ell(0, -0.6, 12.2, 8.8, 0, 48, 0.02, 2), skin, { ink: 2.0, shade: sh })
  // a long grinning jaw: a wide pale muzzle, two nostrils
  cel(c, ell(0.8, 3.8, 11.0, 4.4, 0, 36), '#6d5068', { ink: 1.3, shade: null, piece: false })
  for (const k of [-1, 1]) cel(c, ell(0.6 + k * 2.4, 1.2, 0.75, 0.55, 0, 10), INK, { ink: 0, shade: null })
  eye(c, -3.8, -4.8, 3.7, 4.6, lk[0], lk[1], { white: '#f8e88a', pr: 0.56, pry: 0.7 })
  eye(c, 4.0, -4.8, 3.7, 4.6, lk[0], lk[1], { white: '#f8e88a', pr: 0.56, pry: 0.7 })
  brow(c, [-8.6, -10.4], [-4.4, -11.4], [-0.6, -8.4], 2.0)
  brow(c, [8.8, -10.4], [4.6, -11.4], [0.8, -8.4], 2.0)
  mouth(c, [-10, 3.0], [10.6, 2.6], [0.4, 5.6], [0.4, 10.6], { teeth: 1.7, n: 8, fangs: [[-5.2, 2.6, 1.1], [5.6, 2.6, 1.1]], tongue: [2.6, 9.2, 2.4] })
  pop()
}
// what goes under: everything below the waterline (painted as the region to take away)
function eelSink(c) {
  c.fillStyle = '#000'; c.fillRect(-60, EEL_SURF + 0.4, 120, 40)
}
// the lava closing round each place it breaks the surface: a hot collar hugging the waterline, its
// near edge lit (drawn OVER the cut piece)
function eelLips(c, ph) {
  const S = EEL_SURF, E = eelPose(ph)
  for (const [x, w0] of eelBreaks(E)) {
    const w = w0 + 1.8
    const top = qb([x - w, S + 0.8], [x, S - 1.6], [x + w, S + 0.8], 14), bot = qb([x + w, S + 0.8], [x, S + 3.4], [x - w, S + 0.8], 14).slice(1, -1)
    cel(c, [...top, ...bot], '#f2742a', { ink: 0, shade: null })
    line(c, qb([x - w * 0.85, S + 0.5], [x, S - 1.2], [x + w * 0.85, S + 0.5], 14), 0.8, { color: '#ffe38e', taper: 0.5 })
  }
}
function paintEel(c, f, elite) { eel(c, { ph: (f / 4) * TAU_, col: elite ? '#3d2638' : '#4b3447', fin: elite ? '#f0682e' : '#e2502e', big: elite }) }
function paintEelOver(c, f) { eelLips(c, (f / 4) * TAU_) }

// every cast body is painted in the brush's PAPER mode (flat paint with the sheet's tooth, separate
// pieces); the player is not, it keeps the plain brush
const wrap = (fn) => (ctx, f, elite) => { resetXf(); setPaper(true); try { fn(ctx, f, elite) } finally { setPaper(false); resetXf() } }
export const TOON_CAST = {
  emberImp: { baseR: 10, frames: 4, box: [-24, -38, 24, 22], paint: wrap(paintImp) },
  magmaToad: { baseR: 11, frames: 4, box: [-31, -24, 31, 27], paint: wrap(paintToad), poseOf: toadPose },
  basaltGolem: { baseR: 27, frames: 4, box: [-41, -33, 41, 32], paint: wrap(paintGolem) },
  brimstoneDragon: { baseR: 26, frames: 4, box: [-70, -62, 76, 70], paint: wrap(paintDragon), over: wrap(paintDragonOver) },
  magmaEel: { baseR: 12, frames: 4, box: [-40, -36, 34, 22], paint: wrap(paintEel), sink: wrap(eelSink), over: wrap(paintEelOver) },
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
