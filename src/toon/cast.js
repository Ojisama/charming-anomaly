// The Mantle's cast and its player: 1930s rubber-hose cartoon characters (render-only).
//
// The cast is PAPER CUT-OUTS, made the way the player is: painted with the brush in its paper mode
// (brush.js: flat gouache with the sheet's tooth showing through it, one flat hard-edged shade, no
// gloss, a steady ink line, each big part a separate paper piece throwing its own thin shadow on the
// piece under it), then cut out by toon.js with an uneven margin of bare paper round its ink that
// shifts a little twice a cycle. Pie-cut eyes, white gloves, rubber-hose limbs. Designed the
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
//               the surface, the rest under it (cut off at a waterline)
//   the ray     a devil ray gliding under the lava: a smug head, rolled horns and two wing tips break the
//               surface, its dark diamond of wings shows through (wide, flat, half of it under)
//   the jelly   a little fire jellyfish bobbing in a gang: a glowing bell with a cross face and a flame
//               wisp, two stinging tentacles curled up out of the lava (small, round, crowned)
// The charm is in the squash and stretch: the imps BOUNCE (stretched in the air, squashed on landing),
// the toad pancakes before it hops and stretches out when it leaps, the golem knuckle-walks, the dragon
// flaps, the eel swims. Every body faces the camera, the way a cartoon overworld shows its characters from above
// (render.js mirrors it to face its way; it is never turned), standing on its own soft shadow.
//   TOON_CAST[id] = { baseR, frames, fps? (frames a second its cycle plays at; render.js's 10 by default), box: [x0, y0, x1, y1] (units round the body's centre, room for the paper cut), paint, poseOf?, over?, sink?, cut? }
//   over(ctx, f): painted on top of the cut piece (smoke, the lava a swimmer is half under); sink(ctx, f): what to take away from the piece
//   (where it goes under); cut: the paper margin's numbers (toon.js's CAST_CUT by default).
//   paint(ctx, frame, elite) draws in units (the caller has scaled the context). render.js scales the
//   sprite by e.radius / baseR, so baseR sets how many world px one unit is drawn at.
import { resetXf, push, pop, tr, rot, sc, ell, polar, drop, tube, qb, line, cel, eye, glove, shadow, glow, puff, flame, brush, mp, INK, setPaper, ground } from './brush.js'

const SH_RED = 'rgba(96,6,24,0.42)'
const TAU_ = Math.PI * 2
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
  const st = o.stretch || 1, lk = o.look || [0, 0], arms = o.arms || 'swing', lift = o.lift || 0, lean = o.lean || 0, lg = o.legs || 0
  shadow(c, 1.5, 10, 8 * (1 - lift * 0.05), 3.6, 0.36 - lift * 0.025)
  push(); tr(0, -lift)
  tr(0, 9); sc(1 / Math.sqrt(st), st); rot(lean); tr(0, -9)
  const body = o.col || '#d8382a'
  // tail with a spade tip
  cel(c, tube(qb([2, 6], [11, 10], [12, 1]), 2.0, 1.3), body, { ink: 1.0, shade: SH_RED })
  push(); tr(12, 0); rot(0.25); cel(c, drop(0, 0, 2.6, 4.4), body, { ink: 1.0, shade: SH_RED }); pop()
  // two stubby legs and hooves: together in the air, splayed on the landing
  cel(c, tube([[-2.4, 6], [-3.2 - lg, 8.4]], 2.4, 2.2), body, { ink: 0.9, shade: SH_RED, piece: false })
  cel(c, tube([[2.4, 6], [3.2 + lg, 8.4]], 2.4, 2.2), body, { ink: 0.9, shade: SH_RED, piece: false })
  cel(c, ell(-3.4 - lg, 9.0, 2.6, 1.7, 0.2, 20), '#3e1716', { ink: 1.0, shade: null })
  cel(c, ell(3.4 + lg, 9.0, 2.6, 1.7, -0.2, 20), '#3e1716', { ink: 1.0, shade: null })
  // rubber-hose arms and gloves: the gesture (flung up on the spring, reaching out on the way down
  // and the landing, wound back down by its sides before the next one)
  const A = {
    up: [[[-5, 3.5], [-12, 3], [-12.5, -7]], [[5, 3.5], [12, 3], [12.5, -7]]],
    high: [[[-5, 3.5], [-12.5, 4], [-15, -4]], [[5, 3.5], [12.5, 4], [15, -4]]],
    rise: [[[-5, 3.5], [-11, 7], [-11.5, -1.5]], [[5, 3.5], [11, 7], [11.5, -1.5]]],
    reach: [[[-5, 3.5], [-12, 5], [-16, 0]], [[5, 3.5], [12, 5], [16, 0]]],
    swing: [[[-5, 3.5], [-11, 9], [-14, 5.5]], [[5, 3.5], [11, 1], [13.5, -5]]],
    wind: [[[-5, 3.5], [-9, 9], [-6.5, 12]], [[5, 3.5], [9, 9], [6.5, 12]]],
  }[arms]
  for (const S of A) cel(c, tube(qb(S[0], S[1], S[2]), 2.0, 1.7), body, { ink: 0.95, shade: SH_RED })
  for (const S of A) glove(c, S[2][0], S[2][1], arms === 'up' ? 3.2 : 3.0, Math.atan2(S[2][1] - S[1][1], S[2][0] - S[1][0]))
  // the little body under the head
  cel(c, ell(0, 5.6, 4.4, 3.6, 0, 30), body, { ink: 1.2, shade: SH_RED })
  // the flame tuft, behind the head: streams tall on the spring, flattens on the landing
  const fl = o.big ? 1.25 : 1, fh = (o.flameH ?? 1) * fl
  cel(c, flame(0.3, -9.2, 5.6 * Math.sqrt(fl), 12.5 * fh, o.curl ?? 0.7), '#f07a20', { ink: 1.2, shade: 'rgba(160,36,10,0.45)' })
  cel(c, flame(0.5, -8.9, 3.1 * Math.sqrt(fl), 7.8 * fh, (o.curl ?? 0.7) - 0.1), '#ffd95e', { ink: 0, shade: null })
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
  // the face: tall pie eyes crowded together, a V of brows, a cheek-to-cheek toothy grin (a yell on
  // the spring)
  const sq = o.squint ? 0.78 : 1
  eye(c, -2.75, -2.6, 2.75, 3.9 * sq, lk[0], lk[1], { pr: 0.55, pry: 0.74 })
  eye(c, 2.75, -2.6, 2.75, 3.9 * sq, lk[0], lk[1], { pr: 0.55, pry: 0.74 })
  const bl = o.yell ? -0.8 : 0
  brow(c, [-6.4, -7.6 + bl], [-3.6, -7.6 + bl * 1.4], [-0.5, -5.6], 1.9)
  brow(c, [6.4, -7.6 + bl], [3.6, -7.6 + bl * 1.4], [0.5, -5.6], 1.9)
  if (o.yell) mouth(c, [-4.8, 1.6], [4.8, 1.6], [0, 2.8], [0, 10.8], { teeth: 1.6, n: 4, tongue: [0.4, 9.0, 2.6] })
  else mouth(c, [-6.8, 1.0], [6.8, 1.0], [0, 3.4], [0, o.squint ? 8.4 : 10.6], { teeth: 1.9, n: 7, tongue: [1.2, o.squint ? 7.2 : 8.6, 2.6] })
  pop()
}
// IMP frames: a bounce. 0 sprung up and stretched (arms flung up, yelling), 1 tipping over the top,
// arms coming out, 2 coming down reaching out, 3 landed and squashed (dust, legs splayed, squinting),
// 4 winding up for the next spring, 5 springing off (arms swinging up, stretching)
const IMP_POSE = [
  { stretch: 1.22, arms: 'up', lift: 5, look: [0.3, -0.2], curl: 0.95, flameH: 1.2, lines: true, yell: true },
  { stretch: 1.14, arms: 'high', lift: 4.2, look: [0.4, 0.1], curl: 0.75, flameH: 1.1, lean: -0.05, yell: true },
  { stretch: 1.06, arms: 'reach', lift: 2.6, look: [0.5, 0.4], curl: 0.55, lean: -0.1 },
  { stretch: 0.76, arms: 'reach', lift: 0, look: [0.4, 0.6], curl: 0.2, flameH: 0.78, dust: true, squint: true, legs: 1.4 },
  { stretch: 0.9, arms: 'wind', lift: 0, look: [0.5, 0.5], curl: 0.45, lean: 0.1, legs: 0.5 },
  { stretch: 1.12, arms: 'rise', lift: 2, look: [0.4, 0.1], curl: 0.75, flameH: 1.1, lean: 0.04, legs: 0.1 },
]
function paintImp(c, f, elite) {
  const P = IMP_POSE[f % IMP_POSE.length]
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
      const lid = o.wide ? 0.55 : 1
      cel(c, [...qb([k * 10.2, -7.6], [k * 6, -13.6], [k * 1.8, -7.6], 12), ...qb([k * 1.8, -7.6], [k * 6, -7.6 + 1.2 * lid], [k * 10.2, -7.6], 10).slice(1, -1)], skin, { ink: 0, shade: null })
      line(c, qb([k * 10.4, -7.4], [k * 6, -7.4 + 1.2 * lid - (1 - lid) * 2.4], [k * 1.6, -7.8]), 1.3, { belly: true })
    }
    // one brow cocked up: the smug look
    brow(c, [-10, -12.6], [-6.5, -14.6], [-2.6, -13.2], 1.3)
  } else { brow(c, [-9.5, -13], [-6, -14.4], [-2.6, -13], 1.2); brow(c, [9.5, -13], [6, -14.4], [2.6, -13], 1.2) }
  blush(c, [[-9.6, 1.4, 2.2, 1.2], [9.6, 1.4, 2.2, 1.2]], '#f08a64', 0.4)
  // the grin: a wide slab of a smile from cheek to cheek, the tongue lolling out of one corner
  if (o.leap) { mouth(c, [-3, 2.4], [3, 2.4], [0, 0.6], [0, 7.6], { tongue: [0, 6.4, 2.0] }) } else {
    const gp = o.gulp ? 0.62 : 1
    mouth(c, [-12, -0.2], [12, -0.2], [0, 4.2 * gp], [0, 9.8 * gp], { teeth: 1.5, n: 9, tongue: [4.6, 7.4 * gp, 3.0] })
    // the gulp: its throat swells out under the grin
    if (o.gulp) cel(c, [...qb([-7, 6.6], [0, 13.4], [7, 6.6], 14), ...qb([7, 6.6], [0, 8.4], [-7, 6.6], 10).slice(1, -1)], '#f6cf7a', { ink: 1.0, shade: 'rgba(150,60,20,0.4)', piece: false })
    line(c, qb([-12.6, -1.6], [-11.6, -0.4], [-11.8, 1.0]), 0.9)
    line(c, qb([12.6, -1.6], [11.6, -0.4], [11.8, 1.0]), 0.9)
  }
  pop()
  ground(() => {
    if (o.dust) { puff(c, -19, 9, 2.4); puff(c, 19.5, 8, 2.8); puff(c, 15, 12, 1.8) }
    if (o.leap) { line(c, qb([-7, 17], [0, 19], [7, 17]), 0.9); line(c, qb([-4, 20], [0, 21.2], [4, 20]), 0.8) }
  })
}
// TOAD frames: 0/1/2 sat and breathing (2 the gulp), 3 sinking into the crouch, 4 pancaked ready to
// spring (aim / land), 5 kicking off (and touching down), 6 the leap
const TOAD_POSE = [
  { sx: 1, sy: 1, look: [0.4, 0.2] },
  { sx: 0.97, sy: 1.04, look: [0.4, 0.2] },
  { sx: 0.94, sy: 1.08, look: [0.4, 0.2], gulp: true },
  { sx: 1.1, sy: 0.88, look: [0.45, 0.15], wide: true },
  { sx: 1.2, sy: 0.76, look: [0.5, 0.1], dust: true, wide: true },
  { sx: 0.92, sy: 1.12, lift: 3.2, leap: true, look: [0.35, -0.2] },
  { sx: 0.84, sy: 1.2, lift: 7.5, leap: true, look: [0.3, -0.4] },
]
function paintToad(c, f, elite) { toad(c, { ...TOAD_POSE[f % TOAD_POSE.length], col: elite ? '#a23c28' : '#c4562c' }) }
// the pose IS the pounce state (sim.js: aim counts down from POUNCE_AIM_T 0.6s, leap from
// POUNCE_LEAP_T 0.3s, land from POUNCE_LAND_T 0.5s; hold counts down from 0); breathing loops 0 1 2 1
function toadPose(e) {
  const s = e._pounceState, t = e._pounceT || 0
  if (s === 'leap') return t > 0.22 || t < 0.06 ? 5 : 6
  if (s === 'aim') return t > 0.48 ? 3 : 4
  if (s === 'land') return t > 0.3 ? 4 : 3
  return [0, 1, 2, 1][Math.floor(-t * 6 + (e.id || 0) * 0.37) & 3]
}

// ---- BASALT GOLEM: a boulder that IS its face. A heavy brow, a lumpy nose, a proud underbite, -------
// stone hose arms ending in big white-gloved fists, knuckle-walking; a little ember smouldering on top.
// The walk: it rocks from foot to foot (the boulder tilts over the planted foot, the other lifts),
// one fist swings forward as the other plants back, and it sinks between steps, gritting its teeth.
function golem(c, o = {}) {
  const lk = o.look || [0, 0], a = o.step || 0, bob = o.bob || 0, sw = o.sway || 0
  shadow(c, 3, 13, 36, 14, 0.42)
  const st = o.col || '#7d6a66', st2 = '#5b4a4f', pale = '#a08d86', sh = 'rgba(30,8,24,0.32)'
  const rock = (cx, cy, r, sd, col = st, ink = 1.8, ry = 1) => cel(c, polar(cx, cy, (t) => r * (1 + 0.08 * Math.sin(t * 3 + sd) + 0.05 * Math.sin(t * 5 + sd * 2) + 0.025 * Math.sin(t * 9 + sd)) * (1 - (1 - ry) * Math.abs(Math.sin(t))), 54), col, { ink, shade: sh })
  // stubby feet under the boulder: the one it rocks off lifts
  rock(-10, 17 - Math.max(0, -a) * 3, 5.4, 9, st2, 1.4, 0.7); rock(10, 17.4 - Math.max(0, a) * 3, 5.4, 10, st2, 1.4, 0.7)
  // the upper body rocks about its hips (the shoulders ride the tilt), the fists stay on the ground
  const PV = [0, 14], cs = Math.cos(sw), sn = Math.sin(sw)
  const rp = (p) => [PV[0] + (p[0] - PV[0]) * cs - (p[1] - PV[1]) * sn, PV[1] + (p[0] - PV[0]) * sn + (p[1] - PV[1]) * cs - bob]
  // stone hose arms swinging out and down to the fists on the ground (one forward, one back)
  const fl = [-28 + a * 1.5, 9 + a * 5.5], fr = [28 + a * 1.5, 9 - a * 5.5]
  const sl = rp([-15, -6]), sr = rp([15, -6])
  cel(c, tube(qb(sl, [(sl[0] + fl[0]) / 2 - 7, -6 + a * 3 - bob], fl), 8.8, 7.4), st2, { ink: 1.5, shade: sh })
  cel(c, tube(qb(sr, [(sr[0] + fr[0]) / 2 + 7, -6 - a * 3 - bob], fr), 8.8, 7.4), st2, { ink: 1.5, shade: sh })
  for (const [k, F] of [[-1, fl], [1, fr]]) glove(c, F[0], F[1] + 1, 6.4, Math.PI / 2 - k * 0.35)
  push(); tr(0, -bob); tr(PV[0], PV[1]); rot(sw); tr(-PV[0], -PV[1])
  // the boulder: one big lumpy stone, a paler cap where the light lands, a few chips and pebbles
  rock(0, -2, 20.5, 5, st, 2.1, 0.92)
  cel(c, polar(-5, -10, (t) => 11 * (1 + 0.12 * Math.sin(t * 3 + 2) + 0.05 * Math.sin(t * 7)), 40), pale, { ink: 0, shade: null })
  line(c, qb([-17, 4], [-15, 9], [-10, 12]), 1.0); line(c, qb([17, 2], [16, 7], [12, 11]), 1.0)
  line(c, qb([10, -17], [12, -14], [15, -14]), 0.9)
  rock(-12, -16, 3.2, 6, st2, 1.1); rock(13.5, -11.5, 2.4, 7, st2, 1.0)
  // the ember smouldering on its crown, like a lit cigar's tip: its one warm spot, flaring on the step
  const eh = o.grit ? 0.8 : 1.15
  cel(c, flame(2, -21, 3.0, 6.2 * eh, 0.6 - sw * 4), '#f07a20', { ink: 1.0, shade: 'rgba(160,36,10,0.45)' })
  cel(c, flame(2.1, -20.8, 1.6, 3.6 * eh, 0.5 - sw * 4), '#ffd95e', { ink: 0, shade: null })
  rock(2, -19, 3.2, 3, st2, 1.1, 0.75)
  // the face: big pie eyes under one heavy stone brow (knitted, grumpy, lower when it grits), a lumpy
  // nose, the underbite
  const gb = o.grit ? 1.2 : 0, ey = o.grit ? 0.86 : 1
  eye(c, -5.4, -4.4, 3.8, 4.6 * ey, lk[0] - sw * 3, lk[1], { pr: 0.6, pry: 0.66 })
  eye(c, 5.4, -4.4, 3.8, 4.6 * ey, lk[0] - sw * 3, lk[1], { pr: 0.6, pry: 0.66 })
  for (const k of [-1, 1]) cel(c, tube(qb([k * 10.8, -9.4 + gb * 0.4], [k * 6, -11.8 + gb], [k * 0.6, -7.8 + gb]), 3.6, 2.6), '#4a3b40', { ink: 1.4, shade: null })
  cel(c, ell(0, 1.4, 3.0, 2.4, 0, 26, 0.08, 4), pale, { ink: 1.3, shade: sh })
  blush(c, [[-9.6, 2.0, 2.4, 1.3], [9.6, 2.0, 2.4, 1.3]], '#e58a72', 0.35)
  if (o.grit) mouth(c, [-8.6, 5.6], [8.6, 5.6], [0, 6.6], [0, 11.6], { lowTeeth: [[-4.2, 10.4, 1.9, 4.4], [0, 10.6, 1.9, 4.4], [4.2, 10.4, 1.9, 4.4]] })
  else mouth(c, [-8.6, 5.4], [8.6, 5.4], [0, 7.2], [0, 13.6], { tongue: [0, 12.6, 2.6], lowTeeth: [[-4.2, 11.4, 1.9, 4.2], [4.2, 11.4, 1.9, 4.2]] })
  pop()
}
// GOLEM frames: one rock from foot to foot, the four keys (0 right planted, 2 sunk between steps,
// gritting, 4 left planted, 6 sunk again) with an in-between after each
const GOLEM_POSE = Array.from({ length: 8 }, (_, f) => {
  const c = Math.cos((f / 8) * TAU_)
  return { step: c, bob: 2.6 * (1 - c * c), sway: -0.13 * c, grit: Math.abs(c) < 0.5 }
})
function paintGolem(c, f, elite) { golem(c, { ...GOLEM_POSE[f % GOLEM_POSE.length], look: [0, 0.5], col: elite ? '#6a5560' : '#7d6a66' }) }

// ---- OBSIDIAN BEETLE: a stag beetle of black volcanic glass, the rock's runner, and glass shatters:
// killed, it breaks into two little ones (the split flag; render.js draws them with this same look,
// smaller). Upright like the rest of the cast: a big glass head in a cream Felix mask, its two pincers
// grown into a waxed handlebar moustache curling up at the tips, a toothy grin, antennae with ball
// tips; a round black body with a belly glowing lava-orange through its segments, its wing-cases
// flaring out behind like the tails of a coat, rubber-hose arms pumping white-gloved fists, two hose
// legs in big round shoes.
const GLASS = '#352d4a', GLASS2 = '#4a4062', BELLY = '#ee7a34', GLINT = '#e6e0ff', SH_GLASS = 'rgba(8,2,20,0.5)', SHOE = '#5a2a1e'
function beetle(c, o = {}) {
  const lk = o.look || [0, 0.35], ph = o.ph || 0
  const sw = Math.sin(ph), bob = Math.abs(Math.cos(ph)) * 1.2
  shadow(c, 0, 15, 13, 4.6, 0.38)
  push(); tr(0, -bob)
  // legs: hose from the hips to big round shoes, one stepping up as the other plants
  for (const [hx, F] of [[-3.4, [-5 - sw * 1.2, 14 - Math.max(0, sw) * 3]], [3.4, [5 - sw * 1.2, 14 - Math.max(0, -sw) * 3]]]) {
    cel(c, tube(qb([hx, 6], [hx * 1.4, 10], [F[0], F[1] - 1.2]), 2.3, 2.0), GLASS2, { ink: 1.0, shade: null, piece: false })
    cel(c, ell(F[0] + (F[0] < 0 ? -1.2 : 1.2), F[1] + 0.4, 3.9, 2.4, 0, 26), SHOE, { ink: 1.2, shade: 'rgba(40,10,10,0.45)' })
    cel(c, ell(F[0] + (F[0] < 0 ? -2.2 : 2.2), F[1] - 0.4, 1.0, 0.6, 0, 10), '#a0604a', { ink: 0, shade: null })
  }
  // the wing-cases: two rounded glass flaps flaring out behind the body like coat tails
  for (const k of [-1, 1]) {
    push(); tr(k * 8, 5.5); rot(k * 0.55)
    cel(c, [...qb([-3.6, -6], [0, -8.4], [3.6, -6], 10), ...qb([3.6, -6], [5.4, 4], [0, 11], 12).slice(1), ...qb([0, 11], [-5.4, 4], [-3.6, -6], 12).slice(1, -1)], GLASS, { ink: 1.6, shade: SH_GLASS })
    line(c, [[0, -7.6], [0, 10]], 0.7)
    cel(c, [[-k * 2.4, -4.6], [-k * 1.2, -6.4], [-k * 0.6, 1]], GLINT, { ink: 0, shade: null })
    pop()
  }
  // the body: a round glass barrel, its segmented belly glowing
  cel(c, ell(0, 3.5, 7.6, 7.4, 0, 44), GLASS, { ink: 1.8, shade: SH_GLASS })
  cel(c, ell(0, 4.6, 4.8, 5.2, 0, 34), BELLY, { ink: 1.0, shade: 'rgba(150,30,10,0.45)' })
  cel(c, ell(-1.2, 3.2, 2.0, 1.6, 0, 18), '#ffd36a', { ink: 0, shade: null })
  for (const yy of [2.6, 5.0, 7.2]) line(c, qb([-3.8, yy], [0, yy + 1.1], [3.8, yy]), 0.7)
  // arms: hose out of the shoulders to gloved fists pumping at belly height as it runs
  const A = [[[-6, -0.5], [-11.5, 2 + sw * 2], [-11 + sw, 4.5 + sw * 3.5]], [[6, -0.5], [11.5, 2 - sw * 2], [11 - sw, 4.5 - sw * 3.5]]]
  for (const S of A) cel(c, tube(qb(S[0], S[1], S[2]), 2.1, 1.8), GLASS2, { ink: 1.0, shade: null })
  for (const S of A) glove(c, S[2][0], S[2][1], 3.0, Math.atan2(S[2][1] - S[1][1], S[2][0] - S[1][0]))
  // the head, antennae with ball tips bobbing on it
  const hy = -10
  for (const k of [-1, 1]) {
    const tip = [k * (6 + sw * k * 0.6), hy - 13 + Math.abs(sw) * 0.8]
    line(c, qb([k * 2.6, hy - 7.6], [k * 3.2, hy - 12], tip), 1.0)
    cel(c, ell(tip[0], tip[1], 1.5, 1.5, 0, 14), GLASS2, { ink: 0.9, shade: null })
  }
  cel(c, ell(0, hy, 9.8, 8.6, 0, 46), GLASS2, { ink: 2.0, shade: SH_GLASS })
  cel(c, [...qb([-7.8, hy - 4], [-5, hy - 8.4], [1, hy - 8.2], 12), ...qb([1, hy - 8.2], [-4.6, hy - 7.2], [-7.8, hy - 4], 12).slice(1, -1)], GLINT, { ink: 0, shade: null })
  // the Felix mask: two round lobes for the eyes over a muzzle, inked as three pieces, then filled
  // again a little smaller so only the outer edge keeps its ink
  const ex = 3.5, ey = hy - 1.2, er = 4.4, my = hy + 5.0, mrx = 6.4, mry = 4.4
  for (const d of [0, 0.5]) for (const p of [ell(-ex, ey, er - d, er * 1.08 - d, 0, 30), ell(ex, ey, er - d, er * 1.08 - d, 0, 30), ell(0, my, mrx - d, mry - d, 0, 34)]) {
    cel(c, p, '#f3dfc2', { ink: d ? 0 : 1.1, shade: null, dabs: 0 })
  }
  eye(c, -3.3, hy - 0.9, 2.9, 3.8, lk[0], lk[1], { pr: 0.64, pry: 0.74 })
  eye(c, 3.3, hy - 0.9, 2.9, 3.8, lk[0], lk[1], { pr: 0.64, pry: 0.74 })
  // a heavy V of brows, and the grin under the moustache: a wide row of teeth
  brow(c, [-7.4, hy - 5.6], [-4, hy - 7.2], [-0.6, hy - 5.2], 2.0)
  brow(c, [7.4, hy - 5.6], [4, hy - 7.2], [0.6, hy - 5.2], 2.0)
  mouth(c, [-5.4, hy + 5.0], [5.4, hy + 5.0], [0, hy + 6.6], [0, hy + 9.6], { teeth: 1.4, n: 6, tongue: [1.2, hy + 8.8, 1.6] })
  // the pincers as a waxed handlebar moustache curling up at the tips, a shine down each, the nose
  for (const k of [-1, 1]) {
    const P = [[k * 0.6, hy + 3.8], [k * 5, hy + 2.8], [k * 10, hy + 4.4], [k * 14.2, hy + 2.6], [k * 15, hy - 0.8], [k * 13.2, hy - 2.4], [k * 11.8, hy - 1.2]]
    cel(c, tube(P, 3.0, 0.7), GLASS, { ink: 1.4, shade: SH_GLASS })
    line(c, [[k * 2.6, hy + 3.0], [k * 6.5, hy + 2.6], [k * 10.6, hy + 3.6], [k * 13.6, hy + 1.8]], 0.7, { color: GLINT, taper: 0.5 })
    cel(c, [[k * 8.8, hy + 4.4], [k * 10.2, hy + 2.6], [k * 10.8, hy + 5.2]], GLASS, { ink: 0.9, shade: null })
  }
  cel(c, ell(0, hy + 2.8, 2.0, 1.5, 0, 18), '#2a2238', { ink: 0.8, shade: null })
  pop()
}
// BEETLE frames: the run (fists pumping, shoes stepping, a bob)
const BEETLE_POSE = Array.from({ length: 6 }, (_, f) => ({ ph: (f / 6) * TAU_ }))
function paintBeetle(c, f) { beetle(c, BEETLE_POSE[f % BEETLE_POSE.length]) }

// ---- BRIMSTONE DRAGON (the elite): a chubby baby dragon on spread bat wings, flying high (its shadow
// far below). Drawn UPRIGHT and face-on like the rest of the cast (the head on top of the belly, the
// face toward you), so it reads the same from any side it comes at you (render.js only mirrors it).
// A head bigger than its belly, a cream snout always trailing a drift of brimstone smoke (.over), a
// fanged grin, V brows, gold horns, gloved fists, stubby feet, a spade tail curling out behind. The
// wings beat in a wide, even arc about the shoulders, the body riding it.
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
    push(); tr(k * 6, -6); rot(k * (fl - 0.8) * 1.5); tr(-k * 6, 6); sc(0.86 + 0.14 * fl, 1)
    const up = (1 - fl) * 4
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
    const hy = (1 - fl) * 7
    cel(c, tube(qb([k * 8, 0], [k * 14.5, -1 - hy], [k * 16.5, 4 - hy * 0.8]), 3.0, 2.6), g, { ink: 1.1, shade: sh })
    glove(c, k * 17, 5 - hy * 0.8, 3.4, (k > 0 ? 1.0 : Math.PI - 1.0) - k * hy * 0.12)
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
  mouth(c, [-8.8, 5.0], [8.8, 5.0], [0, 7.2], [0, o.roar ? 15.4 : 13.4], { fangs: [[-4.6, 2.8, 1.6], [4.6, 2.8, 1.6]], tongue: [0.6, 12.0, 2.8] })
  pop()
  pop()
}
// THE SMOKE: three puffs a side always curling off the snout and out past the cheeks, each a third of a beat behind the last, born
// small and dense, drifting up and out, growing and thinning (drawn over the cut piece, never cut)
function dragonSmoke(c, f, bob) {
  for (let k = 0; k < 3; k++) {
    const u = ((f / DRAGON_POSE.length) + k / 3) % 1
    for (const side of [-1, 1]) {
      const x = (DRAGON_HEAD[0] + side * (10.5 + u * 11)) * DRAGON_SC, y = (DRAGON_HEAD[1] + 4.5 - u * 7 - u * u * 4) * DRAGON_SC - bob
      c.save(); c.globalAlpha = 0.95 * (1 - u * u)
      puff(c, x + side * Math.sin(u * 5 + k) * 0.8, y, (1.3 + u * 2.6) * (side < 0 ? 0.85 : 1), '#d2c6bc', 'rgba(70,50,60,0.4)', 0.7)
      c.restore()
    }
  }
}
// DRAGON frames: one wing beat, the four keys (0 spread, 2 and 6 half, 4 the downbeat with its roar)
// with an in-between after each
const DRAGON_POSE = Array.from({ length: 8 }, (_, f) => {
  const c = Math.cos((f / 8) * TAU_)
  return { flap: 0.8 + 0.2 * c, bob: 1.5 - 1.5 * c, roar: c < -0.6 }
})
function paintDragon(c, f) { dragon(c, DRAGON_POSE[f % DRAGON_POSE.length]) }
function paintDragonOver(c, f) { dragonSmoke(c, f, DRAGON_POSE[f % DRAGON_POSE.length].bob) }

// ---- MAGMA EEL: lives IN the lava. Only its head and one coil of its back ever break the surface: --
// a big grinning head on a neck rising out of a ring of ripples, one round hump of back with a red
// sail fin along it, the flick of a tail fin further back. Everything under the waterline is cut off
// the paper piece (TOON_CAST.magmaEel.sink), then a lava collar is laid round each place it breaks the
// surface (.over), so it reads as swimming, not standing. The swim: the coil and the tail rise and
// sink in turn (the coil rolling forward as it swells), the head rears up and tips from side to side,
// gaping wider at the top of its rise, its frills flaring, and the ripples spread.
const EEL_SURF = 8   // the lava's surface, in units below the body's centre
// the head's key poses round the swim: how far it rears (rise), its tip (tilt), how wide it gapes,
// its frills' flare; the EEL_FRAMES frames go round them, an in-between halfway from key to key
const EEL_KEYS = [
  { rise: 0, tilt: -0.12, gape: 0, flare: 0 },
  { rise: 2.6, tilt: 0, gape: 0.45, flare: 0.18 },
  { rise: 4.2, tilt: 0.12, gape: 1, flare: 0.4 },
  { rise: 1.6, tilt: 0, gape: 0.45, flare: 0.18 },
]
const EEL_FRAMES = 8
const EEL_HEAD = Array.from({ length: EEL_FRAMES }, (_, f) => {
  const u = (f / EEL_FRAMES) * EEL_KEYS.length, i = Math.floor(u), t = u - i
  const a = EEL_KEYS[i], b = EEL_KEYS[(i + 1) % EEL_KEYS.length], H = {}
  for (const k in a) H[k] = a[k] + (b[k] - a[k]) * t
  return H
})
function eelPose(f) {
  const ph = ((f % EEL_FRAMES) / EEL_FRAMES) * TAU_, H = EEL_HEAD[f % EEL_FRAMES]
  return {
    ph, ...H,
    hx: 12 + 1.2 * Math.sin(ph), hy: -10 - H.rise,                                              // the head
    cx: -11 + 3 * Math.cos(ph), hw: 11 - 1.4 * Math.sin(ph), hh: 12 + 4.5 * Math.sin(ph),        // the coil
    tx: -27 + 1.2 * Math.sin(ph + 3), flick: -Math.sin(ph),                                      // the tail
  }
}
// where it breaks the surface: [x, half width] of each part going under
const eelBreaks = (E) => [[12.6, 4.6], [E.cx - E.hw, 4.2], [E.cx + E.hw, 4.2], [E.tx, 2.6]]
function eel(c, o = {}) {
  const E = eelPose(o.f || 0), ph = E.ph, lk = o.look || [0.4, 0.3 - E.gape * 0.3], S = EEL_SURF
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
  const tt = [E.tx - 3 - 2.4 * E.flick, S - 9 - 3 * E.flick]
  cel(c, tube(qb([E.tx, S + 3], [E.tx + 0.5, S - 4], tt, 10), 5.0, 1.8), skin, { ink: 1.3, shade: sh })
  push(); tr(tt[0], tt[1]); rot(-0.7 - 0.45 * E.flick); cel(c, [[0, 0.6], ...qb([-3.4, -5], [0.4, -8.4], [4, -6], 8), [1.2, -0.6]], fin, { ink: 1.1, shade: fsh }); pop()
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
  push(); tr(E.hx, E.hy); rot(E.tilt)
  // the crest: a spiky red fin swept back off its crown
  cel(c, [[-9, -2], ...qb([-15, -8], [-12, -11], [-8.6, -9.4], 6), ...qb([-8.6, -9.4], [-6.4, -14.2], [-3, -10.8], 6).slice(1), ...qb([-3, -10.8], [0, -14.4], [2.6, -9], 6).slice(1), [2, -6]], fin, { ink: 1.2, shade: fsh })
  for (const [a, b] of [[[-7, -5], [-12.4, -9]], [[-4, -7], [-6.4, -13]], [[-0.5, -7], [0, -13.4]]]) line(c, [a, b], 0.7, { taper: 0.45 })
  // gill frills at its cheeks
  for (const k of [-1, 1]) { push(); tr(k * 11.6, 3.2); rot(k * (2.05 - E.flare)); cel(c, drop(0, 0, 2.6, 6.0, -k * 0.5), fin, { ink: 1.0, shade: null }); pop() }
  cel(c, ell(0, -0.6, 12.2, 8.8, 0, 48, 0.02, 2), skin, { ink: 2.0, shade: sh })
  // a long grinning jaw: a wide pale muzzle, two nostrils
  cel(c, ell(0.8, 3.8, 11.0, 4.4, 0, 36), '#6d5068', { ink: 1.3, shade: null, piece: false })
  for (const k of [-1, 1]) cel(c, ell(0.6 + k * 2.4, 1.2, 0.75, 0.55, 0, 10), INK, { ink: 0, shade: null })
  eye(c, -3.8, -4.8, 3.7, 4.6, lk[0], lk[1], { white: '#f8e88a', pr: 0.56, pry: 0.7 })
  eye(c, 4.0, -4.8, 3.7, 4.6, lk[0], lk[1], { white: '#f8e88a', pr: 0.56, pry: 0.7 })
  brow(c, [-8.6, -10.4], [-4.4, -11.4], [-0.6, -8.4], 2.0)
  brow(c, [8.8, -10.4], [4.6, -11.4], [0.8, -8.4], 2.0)
  mouth(c, [-10, 3.0], [10.6, 2.6], [0.4, 5.6 - E.gape * 0.6], [0.4, 10.6 + E.gape * 4.4], { teeth: 1.7, n: 8, fangs: [[-5.2, 2.6, 1.1], [5.6, 2.6, 1.1]], tongue: [2.6, 9.2 + E.gape * 2.6, 2.4 + E.gape * 0.6] })
  pop()
}
// what goes under: everything below the waterline (painted as the region to take away)
function eelSink(c) {
  c.fillStyle = '#000'; c.fillRect(-60, EEL_SURF + 0.4, 120, 40)
}
// the lava closing round each place it breaks the surface: a hot collar hugging the waterline, its
// near edge lit (drawn OVER the cut piece)
function eelLips(c, f) {
  const S = EEL_SURF, E = eelPose(f)
  for (const [x, w0] of eelBreaks(E)) {
    const w = w0 + 1.8
    const top = qb([x - w, S + 0.8], [x, S - 1.6], [x + w, S + 0.8], 14), bot = qb([x + w, S + 0.8], [x, S + 3.4], [x - w, S + 0.8], 14).slice(1, -1)
    cel(c, [...top, ...bot], '#f2742a', { ink: 0, shade: null })
    line(c, qb([x - w * 0.85, S + 0.5], [x, S - 1.2], [x + w * 0.85, S + 0.5], 14), 0.8, { color: '#ffe38e', taper: 0.5 })
  }
}
function paintEel(c, f, elite) { eel(c, { f, col: elite ? '#3d2638' : '#4b3447', fin: elite ? '#f0682e' : '#e2502e', big: elite }) }
function paintEelOver(c, f) { eelLips(c, f) }

// ---- LAVA RAY: a big flat devil ray gliding just under the lava. Only the top of its head (heavy-
// lidded pie eyes, a grin of upper teeth at the waterline, two rolled devil horns) and its two wing
// tips break the surface; the rest of it shows as a dark shape under the lava (.over). The glide: the
// wing tips rise out of the lava and dip back under together, the head lifting a little on the
// downstroke, the horns unrolling as it rises, the ripples spreading from every place it breaks out.
const RAY_SURF = 6
const RAY_FRAMES = 8
function rayPose(f) {
  const ph = ((f % RAY_FRAMES) / RAY_FRAMES) * TAU_, s = Math.sin(ph)
  return { ph, tip: 7 + 6.5 * s, spread: 34 + 2 * Math.cos(ph), bob: 1.4 - 1.4 * s, unroll: 0.5 + 0.5 * s }
}
const rayBreaks = (R) => [[0, 15], [-R.spread + 2, 4.2], [R.spread - 2, 4.2]]
function ray(c, o = {}) {
  const R = rayPose(o.f || 0), S = RAY_SURF, lk = o.look || [0.5, 0.45]
  const back = o.col || '#3b2a40', back2 = '#54395a', horn = o.horn || '#e2502e', sh = 'rgba(20,6,24,0.45)', fsh = 'rgba(120,10,10,0.42)'
  ground(() => {
    for (const [x, w] of rayBreaks(R)) for (let k = 0; k < 2; k++) {
      const g = ((R.ph / TAU_) + k * 0.5 + x * 0.011 + 1) % 1
      const rx = w * (1.3 + 1.0 * g)
      brush(c, ell(x, S + 0.6, rx, rx * 0.26, 0, 40), true, 1.1 * (1 - g) + 0.25, { color: 'rgba(255,220,130,' + (0.85 * (1 - g)).toFixed(2) + ')', flat: true })
    }
  })
  // the wing tips: two pointed fins curling up out of the lava, out at its sides
  for (const k of [-1, 1]) {
    const x0 = k * (R.spread - 2), h = Math.max(1, R.tip)
    const tipP = [x0 + k * (2 + h * 0.35), S - h]
    cel(c, [[x0 - k * 3.8, S + 3], ...qb([x0 - k * 3.2, S - h * 0.4], [x0 - k * 0.6, S - h * 0.95], tipP, 10), ...qb(tipP, [x0 + k * 2.4, S - h * 0.3], [x0 + k * 3.6, S + 3], 10).slice(1)], back, { ink: 1.3, shade: sh })
    line(c, qb([x0 - k * 1.6, S], [x0 - k * 0.2, S - h * 0.5], [tipP[0] - k * 0.8, tipP[1] + 1.4]), 0.6, { taper: 0.4, color: '#f2a03c' })
  }
  push(); tr(0, -R.bob)
  // the devil horns (cephalic fins): rolled up beside its face, unrolling as it rises
  for (const k of [-1, 1]) {
    const u = R.unroll
    const P = qb([k * 10, S - 4], [k * (17 + 2 * u), S - 10 - 3 * u], [k * (11 + 4 * u), S - 17 - 3 * u], 12)
    cel(c, tube(P, 4.4, 1.6), horn, { ink: 1.2, shade: fsh })
    const e = P[P.length - 1]
    cel(c, ell(e[0] - k * 1.2 * (1 - u), e[1] + 1.4 * (1 - u), 1.6, 1.6, 0, 14), horn, { ink: 1.0, shade: null })
  }
  // the head: a wide low dome of back breaking the surface, ember freckles along its ridge
  cel(c, ell(0, S - 1, 15.5, 10.5, 0, 48), back, { ink: 2.0, shade: sh })
  cel(c, ell(0, S - 6.5, 9, 3.4, 0, 30), back2, { ink: 0, shade: null })
  for (const [x, y] of [[-11, S - 4.5], [11, S - 4.5], [-7, S - 9.2], [7, S - 9.2]]) cel(c, ell(x, y, 1.1, 0.8, 0, 12), '#f2a03c', { ink: 0, shade: null })
  // the face: big pie eyes on top under heavy smug lids, a cocked brow, a grin of upper teeth at the waterline
  for (const k of [-1, 1]) {
    eye(c, k * 4.6, S - 7.6, 3.6, 4.2, lk[0], lk[1], { white: '#f8e88a', pr: 0.58, pry: 0.72 })
    const lid = 0.55 + 0.25 * (1 - R.unroll)
    cel(c, [...qb([k * 8.4, S - 7.6], [k * 4.6, S - 13.6], [k * 0.8, S - 7.6], 12), ...qb([k * 0.8, S - 7.6], [k * 4.6, S - 11.6 + 4 * lid], [k * 8.4, S - 7.6], 10).slice(1, -1)], back, { ink: 0, shade: null })
    line(c, qb([k * 8.6, S - 7.5], [k * 4.6, S - 11.6 + 4 * lid], [k * 0.6, S - 7.8]), 1.2, { belly: true })
  }
  brow(c, [-9.4, S - 12.6], [-5, S - 14.2], [-1, S - 11.6], 1.9)
  brow(c, [9.6, S - 14.4], [5, S - 13.6], [1, S - 11.2], 1.9)
  mouth(c, [-10, S - 2.6], [10, S - 2.6], [0, S - 0.8], [0, S + 7], { teeth: 2.0, n: 9, fangs: [[-6.4, 2.4, 1.1], [6.4, 2.4, 1.1]] })
  pop()
}
function raySink(c) { c.fillStyle = '#000'; c.fillRect(-60, RAY_SURF + 0.4, 120, 40) }
// the rest of it, under the lava: a dark diamond of wings in front of where it breaks out, and the
// lava's collar round every place it does
function rayOver(c, f) {
  const R = rayPose(f), S = RAY_SURF, sp = R.spread, dip = (R.tip - 7) * 0.25
  const W = [[-sp, S + 1.2], ...qb([-sp, S + 1.2], [-sp * 0.62, S + 8.5 + dip], [-5, S + 9.5], 10).slice(1), ...qb([-5, S + 9.5], [0, S + 10.6], [5, S + 9.5], 6).slice(1), ...qb([5, S + 9.5], [sp * 0.62, S + 8.5 + dip], [sp, S + 1.2], 10).slice(1), ...qb([sp, S + 1.2], [0, S + 3.4], [-sp, S + 1.2], 14).slice(1, -1)]
  cel(c, W, 'rgba(60,12,30,0.3)', { ink: 0, shade: null })
  brush(c, W, true, 0.6, { color: 'rgba(255,200,120,0.4)', flat: true })
  line(c, qb([0, S + 10], [2.4, S + 13], [-1.6, S + 16]), 0.8, { color: 'rgba(60,12,30,0.42)', taper: 0.6 })
  for (const [x, w0] of rayBreaks(R)) {
    const w = w0 + 1.8
    const top = qb([x - w, S + 0.8], [x, S - 1.6], [x + w, S + 0.8], 14), bot = qb([x + w, S + 0.8], [x, S + 3.4], [x - w, S + 0.8], 14).slice(1, -1)
    cel(c, [...top, ...bot], '#f2742a', { ink: 0, shade: null })
    line(c, qb([x - w * 0.85, S + 0.5], [x, S - 1.2], [x + w * 0.85, S + 0.5], 14), 0.8, { color: '#ffe38e', taper: 0.5 })
  }
}
function paintRay(c, f, elite) { ray(c, { f, col: elite ? '#2f2034' : '#3b2a40', horn: elite ? '#f0682e' : '#e2502e' }) }

// ---- EMBER JELLY: a little fire jellyfish bobbing in the lava, in a gang. A glowing bell with a cross
// face (V brows, a fanged pout) and a flame wisp on its crown, a frilled skirt at the waterline, two
// stinging tentacles curled up out of the lava, the rest trailing under it (.over). The pulse: the
// bell squeezes tall and narrow and kicks up, then relaxes wide and low, its tentacles whipping out
// and back.
const JELLY_SURF = 5
const JELLY_FRAMES = 8
function jellyPose(f) {
  const ph = ((f % JELLY_FRAMES) / JELLY_FRAMES) * TAU_, s = Math.sin(ph)
  return { ph, wx: 1 - 0.13 * s, hy: 1 + 0.16 * s, bob: 1.6 + 1.6 * s, whip: Math.sin(ph - 1.1) }
}
const JELLY_BREAKS = [[0, 10.4], [-9, 2], [9, 2]]
function jelly(c, o = {}) {
  const J = jellyPose(o.f || 0), S = JELLY_SURF, lk = o.look || [0.4, 0.4]
  const bell = o.col || '#f2662a', bell2 = '#ffb24a', core = '#ffe08a', sh = 'rgba(150,36,10,0.3)'
  ground(() => {
    for (const [x, w] of JELLY_BREAKS) for (let k = 0; k < 2; k++) {
      const g = ((J.ph / TAU_) + k * 0.5 + x * 0.02 + 1) % 1
      const rx = w * (1.3 + 1.1 * g)
      brush(c, ell(x, S + 0.5, rx, rx * 0.3, 0, 32), true, 0.9 * (1 - g) + 0.2, { color: 'rgba(255,225,140,' + (0.85 * (1 - g)).toFixed(2) + ')', flat: true })
    }
  })
  // the two stinging tentacles, curled up out of the lava, a spark at each tip
  for (const k of [-1, 1]) {
    const w = J.whip * k
    const tp = [k * (13 + 1.5 * J.whip), S - 7 - 2 * w]
    cel(c, tube(qb([k * 9, S + 2], [k * (14 + 2 * J.whip), S - 1], tp, 12), 2.2, 1.0), bell2, { ink: 1.0, shade: sh })
    cel(c, flame(tp[0], tp[1] + 0.6, 1.8, 3.6, k * 0.4), '#ffd95e', { ink: 0.8, shade: null })
  }
  push(); tr(0, -J.bob)
  // the bell: a round dome wider than it is tall, its rim just over the lava, a glowing core, a flame
  // wisp on its crown, a scalloped frill hanging off the rim into the lava
  const rx = 10.6 * J.wx, ry = 8.6 * J.hy, rim = S - 4.6, cy = rim - ry * 0.72
  cel(c, flame(0.4, rim - ry * 1.42, 3.0, 6.5 + 2.5 * J.hy, 0.5 + 0.3 * J.whip), '#ffd95e', { ink: 1.0, shade: 'rgba(170,60,10,0.4)' })
  cel(c, [...qb([-rx, rim], [-rx * 1.08, rim - ry * 1.62], [0, rim - ry * 1.55], 18), ...qb([0, rim - ry * 1.55], [rx * 1.08, rim - ry * 1.62], [rx, rim], 18).slice(1), ...qb([rx, rim], [0, rim + 1.6], [-rx, rim], 12).slice(1, -1)], bell, { ink: 1.5, shade: sh })
  cel(c, ell(0, rim - ry * 1.05, rx * 0.5, ry * 0.3, 0, 24), core, { ink: 0, shade: null })
  for (const [x, y] of [[-rx * 0.7, rim - ry * 0.5], [rx * 0.7, rim - ry * 0.5], [-rx * 0.4, rim - ry * 1.25], [rx * 0.4, rim - ry * 1.25]]) cel(c, ell(x, y, 0.9, 0.7, 0, 10), core, { ink: 0, shade: null })
  const frill = []
  const nS = 5
  for (let i = 0; i <= nS * 4; i++) { const t = i / (nS * 4), x = -rx * 0.98 + t * rx * 1.96; frill.push([x, rim + 1.2 + 2.4 * Math.sqrt(Math.abs(Math.sin(t * nS * Math.PI))) + 0.5 * J.whip * Math.sin(t * 9)]) }
  cel(c, [...qb([rx * 0.98, rim + 0.6], [0, rim - 0.6], [-rx * 0.98, rim + 0.6], 12), ...frill.slice(1, -1)], bell2, { ink: 0.8, shade: null })
  // the face: big pie eyes, a hard V of brows, a fanged pout
  eye(c, -3.3, cy - 1.2, 3.0, 3.8, lk[0], lk[1], { pr: 0.6, pry: 0.74 })
  eye(c, 3.3, cy - 1.2, 3.0, 3.8, lk[0], lk[1], { pr: 0.6, pry: 0.74 })
  brow(c, [-7.2, cy - 6.6], [-3.8, cy - 6.4], [-0.4, cy - 4.0], 1.7)
  brow(c, [7.2, cy - 6.6], [3.8, cy - 6.4], [0.4, cy - 4.0], 1.7)
  blush(c, [[-6.8, cy + 2.0, 1.5, 0.85], [6.8, cy + 2.0, 1.5, 0.85]], '#ff9a6a', 0.5)
  mouth(c, [-3.0, cy + 3.2], [3.0, cy + 3.2], [0, cy + 2.2 - J.whip * 0.4], [0, cy + 6.0 + J.whip * 0.8], { fangs: [[-1.5, 1.5, 0.75], [1.5, 1.5, 0.75]], tongue: [0.3, cy + 5.4, 1.3], ink: 0.9 })
  pop()
}
function jellySink(c) { c.fillStyle = '#000'; c.fillRect(-40, JELLY_SURF + 0.4, 80, 30) }
// the tentacles trailing under the lava, glowing through it, and the lava's collar round it
function jellyOver(c, f) {
  const J = jellyPose(f), S = JELLY_SURF
  for (const x0 of [-5, -1.8, 1.8, 5]) {
    const P = []
    for (let i = 0; i <= 10; i++) { const t = i / 10; P.push([x0 * (1 + t * 0.35) + Math.sin(J.ph + t * 5 + x0) * 1.4 * t, S + 1 + t * 11]) }
    line(c, P, 0.9, { color: 'rgba(255,214,120,0.55)', taper: 0.7 })
  }
  for (const [x, w0] of JELLY_BREAKS) {
    const w = w0 + 1.4
    const top = qb([x - w, S + 0.8], [x, S - 1.4], [x + w, S + 0.8], 12), bot = qb([x + w, S + 0.8], [x, S + 3], [x - w, S + 0.8], 12).slice(1, -1)
    cel(c, [...top, ...bot], '#f2742a', { ink: 0, shade: null })
    line(c, qb([x - w * 0.85, S + 0.5], [x, S - 1.1], [x + w * 0.85, S + 0.5], 12), 0.7, { color: '#ffe38e', taper: 0.5 })
  }
}
function paintJelly(c, f, elite) { jelly(c, { f, col: elite ? '#d8452a' : '#f2662a' }) }

// every cast body is painted in the brush's PAPER mode (flat paint with the sheet's tooth, separate
// pieces); the player is not, it keeps the plain brush
const wrap = (fn) => (ctx, f, elite) => { resetXf(); setPaper(true); try { fn(ctx, f, elite) } finally { setPaper(false); resetXf() } }
export const TOON_CAST = {
  emberImp: { baseR: 10, frames: IMP_POSE.length, fps: 13, box: [-28, -48, 28, 22], paint: wrap(paintImp) },
  magmaToad: { baseR: 11, frames: TOAD_POSE.length, box: [-32, -30, 32, 28], paint: wrap(paintToad), poseOf: toadPose },
  basaltGolem: { baseR: 27, frames: GOLEM_POSE.length, fps: 16, box: [-45, -35, 45, 32], paint: wrap(paintGolem) },
  brimstoneDragon: { baseR: 26, frames: DRAGON_POSE.length, fps: 16, box: [-70, -62, 76, 70], paint: wrap(paintDragon), over: wrap(paintDragonOver) },
  magmaEel: { baseR: 12, frames: EEL_FRAMES, fps: 16, box: [-40, -36, 34, 22], paint: wrap(paintEel), sink: wrap(eelSink), over: wrap(paintEelOver) },
  lavaRay: { baseR: 24, frames: RAY_FRAMES, fps: 9, box: [-48, -34, 48, 32], paint: wrap(paintRay), sink: wrap(raySink), over: wrap(rayOver) },
  obsidianBeetle: { baseR: 11, frames: BEETLE_POSE.length, fps: 14, box: [-30, -38, 30, 24], paint: wrap(paintBeetle) },
  emberJelly: { baseR: 9, frames: JELLY_FRAMES, fps: 12, box: [-22, -34, 22, 22], paint: wrap(paintJelly), sink: wrap(jellySink), over: wrap(jellyOver) },
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
