// The Mantle's cast and its player: 1930s rubber-hose cartoon characters (render-only).
//
// Drawn with the brush (brush.js): flat cel paint, one soft shadow, a small cream specular, a pressure
// ink contour, pie-cut eyes, white gloves, rubber-hose limbs. Designed the Cuphead way: a big head on a
// small body, huge pie-cut eyes, a face with ATTITUDE (brows, teeth, a tongue), one clear gesture per
// creature and a silhouette nothing else in the chapter shares:
//   the imp     a devil's head on legs: V brows, a toothy grin, gold horns, a flame tuft (round + spike)
//   the toad    a wide flat pancake, eye domes on top, a smug lidded grin with its tongue out (wide + low)
//   the golem   a boulder that IS its face: a heavy brow, a lumpy nose, an underbite, white-gloved fists
//               on stone hose arms (a big square lump with fists)
//   the dragon  a chubby baby dragon: a head bigger than its belly, a cream snout breathing smoke,
//               gloved hands, stubby feet, bat wings (the only thing in the air with wings)
// The charm is in the squash and stretch: the imps BOUNCE (stretched in the air, squashed on landing),
// the toad pancakes before it hops and stretches out when it leaps, the golem knuckle-walks, the dragon
// flaps. Every body faces the camera, the way a cartoon overworld shows its characters from above
// (render.js mirrors it to face its way; it is never turned), standing on its own soft shadow.
//   TOON_CAST[id] = { baseR, frames, box: [x0, y0, x1, y1] (units round the body's centre), paint, poseOf?,
//   thumbFrame? (the frame the title card's thumbnail is painted from) }
//   paint(ctx, frame, elite) draws in units (the caller has scaled the context). render.js scales the
//   sprite by e.radius / baseR, so baseR sets how many world px one unit is drawn at.
import { CLOCK } from './palette.js'
import { resetXf, push, pop, tr, rot, sc, ell, polar, drop, tube, qb, line, cel, eye, glove, shadow, glow, puff, flame, brush, mp, INK } from './brush.js'

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
// IMP frames: one bounce, timed like a cartoon (impPose): it lands and squashes flat (held), winds up,
// springs off stretched tall, floats at the top, and drops stretched with speed lines into the next
// squash. Its flame tuft lags the body: flattened on the landing, streaming up on the way down.
const IMP_POSE = [
  { stretch: 0.86, arms: 'up', lift: 0, look: [0.4, 0.55], curl: 0.25, dust: true },               // SPLAT
  { stretch: 0.93, arms: 'up', lift: 0, look: [0.4, 0.4], curl: 0.35 },                             // wind-up
  { stretch: 1.24, arms: 'reach', lift: 2.5, look: [0.4, 0.2], curl: 0.35 },                          // launch
  { stretch: 1.12, arms: 'reach', lift: 5.5, look: [0.4, 0.2], curl: 0.5 },                           // rising
  { stretch: 1.0, arms: 'swing', lift: 7, look: [0.5, 0.3], curl: 0.7 },                              // apex
  { stretch: 1.06, arms: 'swing', lift: 5.5, look: [0.5, 0.45], curl: 0.85 },                         // falling
  { stretch: 1.2, arms: 'up', lift: 2.5, look: [0.4, 0.55], curl: 1.0, lines: true },                 // dropping fast
  { stretch: 0.92, arms: 'up', lift: 0.4, look: [0.4, 0.55], curl: 0.9 },                             // contact
]
// how long each frame is held, in parts of a bounce: the squash and the apex hang, the fall snaps
const IMP_HOLD = [0.17, 0.09, 0.08, 0.11, 0.17, 0.12, 0.1, 0.06]
const IMP_AT = IMP_HOLD.reduce((a, h) => (a.push(a[a.length - 1] + h), a), [0])
const impPose = (e) => {
  const u = (CLOCK.t * 1.7 + (e.id || 0) * 0.137) % 1
  let f = 0; while (f < 7 && u >= IMP_AT[f + 1]) f++
  return f
}
function paintImp(c, f, elite) {
  const P = IMP_POSE[f % 8]
  imp(c, { ...P, col: elite ? '#b92a30' : '#d8382a', big: elite })
  if (P.lines) { line(c, qb([-5, 13.5], [0, 15], [5, 13.5]), 0.9); line(c, qb([-3, 16], [0, 17], [3, 16]), 0.8) }
  if (P.dust) { puff(c, -10, 10, 2.2); puff(c, 10.5, 10.5, 2.5) }
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
  if (o.dust) { puff(c, -19, 9, 2.4); puff(c, 19.5, 8, 2.8); puff(c, 15, 12, 1.8) }
  if (o.leap) { line(c, qb([-7, 17], [0, 19], [7, 17]), 0.9); line(c, qb([-4, 20], [0, 21.2], [4, 20]), 0.8) }
}
// TOAD frames (toadPose, off the sim's pounce state): 0/1 sat and breathing, 2 crouching into the
// aim, 3 the leap (stretched long), 4 the second half of the aim (pancaked flat, wound tight: the
// anticipation), 5 the landing splat (flattened wider still, dust thrown out)
const TOAD_POSE = [
  { sx: 1, sy: 1, look: [0.4, 0.2] },
  { sx: 0.96, sy: 1.06, look: [0.4, 0.2] },
  { sx: 1.12, sy: 0.84, look: [0.5, 0.1] },
  { sx: 0.88, sy: 1.16, lift: 7, leap: true, look: [0.3, -0.3] },
  { sx: 1.24, sy: 0.72, look: [0.5, 0], dust: true },
  { sx: 1.28, sy: 0.7, look: [0.4, 0.3], dust: true },
]
function paintToad(c, f, elite) { toad(c, { ...TOAD_POSE[f % 6], col: elite ? '#a23c28' : '#c4562c' }) }
function toadPose(e) {
  const s = e._pounceState
  if (s === 'leap') return 3
  if (s === 'land') return 5
  // the aim winds tighter as it runs out (POUNCE_AIM_T 0.6s): crouch, then pancaked flat and quivering
  if (s === 'aim') return (e._pounceT || 0) > 0.3 ? 2 : 4
  return Math.floor(CLOCK.t * 2.2 + (e.id || 0) * 0.37) & 1
}

// ---- BASALT GOLEM: a boulder that IS its face. A heavy brow, a lumpy nose, a proud underbite, -------
// stone hose arms ending in big white-gloved fists, knuckle-walking; a little ember smouldering on top
function golem(c, o = {}) {
  const lk = o.look || [0, 0], a = o.step || 0, bob = o.bob || 0, sq = o.sq || 1, liftL = o.liftL || 0, liftR = o.liftR || 0
  shadow(c, 3, 13, 36, 14, 0.42)
  push(); tr(0, -bob); tr(0, 16); rot((o.step || 0) * -0.07); sc(1 / Math.sqrt(sq), sq); tr(0, -16)
  const st = o.col || '#7d6a66', st2 = '#5b4a4f', pale = '#a08d86', sh = 'rgba(30,8,24,0.32)'
  const rock = (cx, cy, r, sd, col = st, ink = 1.8, ry = 1) => cel(c, polar(cx, cy, (t) => r * (1 + 0.08 * Math.sin(t * 3 + sd) + 0.05 * Math.sin(t * 5 + sd * 2) + 0.025 * Math.sin(t * 9 + sd)) * (1 - (1 - ry) * Math.abs(Math.sin(t))), 54), col, { ink, shade: sh })
  // stubby feet under the boulder
  rock(-10, 17, 5.4, 9, st2, 1.4, 0.7); rock(10, 17.4, 5.4, 10, st2, 1.4, 0.7)
  // stone hose arms swinging out and down to the fists on the ground (one forward, one back)
  // a swinging fist is lifted off the ground (higher, so drawn a touch bigger and further out); a
  // planted one is pressed flat, with a puff of dust where it slammed down
  const fl = [-28 - liftL * 1.6, 9 + a * 6 + bob - liftL * 4.5], fr = [28 + liftR * 1.6, 7 - a * 6 + bob - liftR * 4.5]
  cel(c, tube(qb([-15, -6], [-27, -6 + a * 2 - liftL * 2], fl), 8.8, 7.4), st2, { ink: 1.5, shade: sh })
  cel(c, tube(qb([15, -6], [27, -6 - a * 2 - liftR * 2], fr), 8.8, 7.4), st2, { ink: 1.5, shade: sh })
  for (const [k, F, lf] of [[-1, fl, liftL], [1, fr, liftR]]) glove(c, F[0], F[1] + 1, 6.4 * (1 + lf * 0.05), Math.PI / 2 - k * (0.35 + lf * 0.12))
  if (o.slam) { const F = o.slam < 0 ? fl : fr; puff(c, F[0] - 6, F[1] + 7, 2.6); puff(c, F[0] + 6, F[1] + 7.5, 2.2) }
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
// GOLEM frames: a heavy knuckle-walk (golemPose, slow). A fist SLAMS down and the whole boulder sinks
// onto it (squashed, dust), the body heaves up and over (stretched, the other fist swinging up off the
// ground), then the other fist slams. Four beats a side, the slam held longest: weight.
const GOLEM_POSE = [
  { step: 1, bob: -1.2, sq: 0.86, slam: -1 },
  { step: 0.7, bob: 0.8, sq: 0.96, liftR: 0.8 },
  { step: 0.1, bob: 3.6, sq: 1.08, liftR: 2.0 },
  { step: -0.6, bob: 2.4, sq: 1.03, liftR: 1.2 },
  { step: -1, bob: -1.2, sq: 0.86, slam: 1 },
  { step: -0.7, bob: 0.8, sq: 0.96, liftL: 0.8 },
  { step: -0.1, bob: 3.6, sq: 1.08, liftL: 2.0 },
  { step: 0.6, bob: 2.4, sq: 1.03, liftL: 1.2 },
]
const GOLEM_HOLD = [0.2, 0.08, 0.1, 0.12, 0.2, 0.08, 0.1, 0.12]
const GOLEM_AT = GOLEM_HOLD.reduce((a, h) => (a.push(a[a.length - 1] + h), a), [0])
const golemPose = (e) => {
  const u = (CLOCK.t * 0.55 + (e.id || 0) * 0.211) % 1
  let f = 0; while (f < 7 && u >= GOLEM_AT[f + 1]) f++
  return f
}
function paintGolem(c, f, elite) { const P = GOLEM_POSE[f % 8]; golem(c, { ...P, look: [P.step * 0.25, 0.5], col: elite ? '#6a5560' : '#7d6a66' }) }

// ---- BRIMSTONE DRAGON (the elite): a chubby baby dragon on spread bat wings, flying high (its shadow
// far below). A head bigger than its belly, a cream snout puffing brimstone, a fanged grin, V brows,
// gold horns, gloved hands balled into fists, stubby feet, a spade-tipped tail.
const mix2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
function dragon(c, o = {}) {
  const lk = o.look || [0, 0.6], fl = o.flap ?? 1, bob = o.bob || 0
  shadow(c, 16, 44, 50, 20, 0.36, '50,10,20')
  push(); tr(0, -bob); sc(1.18)
  const g = '#7fb23c', g2 = '#5e8c2a', cream = '#f1dca2', mem = '#e0a83e', sh = 'rgba(28,44,8,0.48)'
  // wings: arm, three finger spars, a scalloped membrane (the flap swings the spars up and in)
  for (const k of [-1, 1]) {
    push(); sc(0.55 + 0.45 * fl, 1)
    const up = (1 - fl) * 10
    const sh0 = [k * 7, -4]
    const tips = [[k * 47, -6 - up], [k * 45, -23 - up], [k * 31, -31 - up * 0.6]]
    const elbow = [k * 25, 0 - up * 0.4]
    const memPts = [sh0, elbow, tips[0], ...qb(tips[0], [k * 38, -10 - up], tips[1], 8).slice(1), ...qb(tips[1], [k * 32, -19 - up], tips[2], 8).slice(1), ...qb(tips[2], [k * 18, -16], [k * 6, -14], 8).slice(1)]
    cel(c, memPts, mem, { ink: 1.5, shade: 'rgba(120,50,10,0.42)' })
    for (const tp of tips) { const m = mix2(elbow, tp, 0.5); line(c, qb(elbow, [m[0] + 2, m[1] + 3], tp, 14), 1.6, { taper: 0.35 }) }
    cel(c, tube([sh0, [k * 16, 2], elbow], 6.4, 4.2), g, { ink: 1.4, shade: sh })
    cel(c, tube([elbow, tips[0]], 3.6, 1.6), g, { ink: 1.2, shade: sh })
    cel(c, [[elbow[0], elbow[1] - 1.5], [elbow[0] + k * 4, elbow[1] + 3.5], [elbow[0] - k * 0.5, elbow[1] + 2]], TOOTH, { ink: 0.7, shade: null })
    pop()
  }
  // the tail, curling behind (toward -y), white spikes, a red spade
  const TL = [[0, -8], [-7, -20], [3, -32], [13, -36]]
  cel(c, tube(TL, 9, 2.4), g, { ink: 1.5, shade: sh })
  for (const [x, y, a] of [[-5, -17, -2.0], [-2, -27, -1.0], [7, -34, -0.3]]) { push(); tr(x, y); rot(a); cel(c, [[-1.4, 0], [1.4, 0], [0, -3.2]], TOOTH, { ink: 0.7, shade: null }); pop() }
  push(); tr(15, -36.5); rot(-2.2); cel(c, drop(0, 0, 3.8, 6.6), '#dc4a38', { ink: 1.1, shade: SH_RED }); pop()
  // stubby feet dangling under the belly, cream claws
  for (const k of [-1, 1]) { cel(c, ell(k * 7.5, 9, 3.6, 3.0, 0, 20), g2, { ink: 1.2, shade: sh }); for (const d of [-1.4, 0, 1.4]) cel(c, ell(k * 7.5 + d, 11.6, 0.7, 0.9, 0, 10), cream, { ink: 0.5, shade: null }) }
  // the plump belly, cream plates down its front
  cel(c, ell(0, -1, 11.5, 12.5, 0, 44), g, { ink: 2.0, shade: sh })
  cel(c, ell(0, 0.5, 4.6, 9.0, 0, 36), cream, { ink: 1.0, shade: 'rgba(150,100,40,0.35)' })
  for (const y of [-4.5, -0.8, 3.0]) line(c, qb([-3.8, y], [0, y + 1.2], [3.8, y]), 0.55, { taper: 0.3 })
  // rubber-hose arms, white-gloved fists balled at its sides (the bully's pose)
  for (const k of [-1, 1]) {
    cel(c, tube(qb([k * 9, -2], [k * 15, -4], [k * 18, 1]), 3.0, 2.6), g, { ink: 1.1, shade: sh })
    glove(c, k * 18.5, 2, 3.4, k > 0 ? 1.0 : Math.PI - 1.0)
  }
  // the big head on a short neck, toward you
  cel(c, tube([[0, 8], [0, 13]], 9, 9), g, { ink: 1.5, shade: sh })
  push(); tr(0, 22); sc(1.14)
  // horns, swept back, and frills
  for (const k of [-1, 1]) {
    cel(c, tube(qb([k * 8, -7], [k * 15, -9], [k * 16.5, -16]), 4.0, 0.8), '#f4c34a', { ink: 1.1, shade: 'rgba(150,70,10,0.45)' })
    push(); tr(k * 12.4, -1); rot(k * 1.3); cel(c, drop(0, 0, 2.6, 5.6), g2, { ink: 1.0, shade: sh }); pop()
  }
  cel(c, ell(0, -1, 13.4, 11, 0, 48), g, { ink: 2.0, shade: sh, spec: 0.14 })
  // the snout: a wide cream muzzle with two smoking nostrils
  cel(c, ell(0, 5.4, 10.2, 5.8, 0, 40), '#a9d062', { ink: 1.5, shade: sh })
  for (const k of [-1, 1]) cel(c, ell(k * 3.0, 3.0, 1.35, 1.0, k * 0.4, 14), INK, { ink: 0, shade: null })
  // the face: big pie eyes, a V of brows, a fanged grin with a forked tongue
  eye(c, -4.6, -4.0, 4.3, 5.3, lk[0], lk[1], { white: '#f8e88a', pr: 0.55, pry: 0.7 })
  eye(c, 4.6, -4.0, 4.3, 5.3, lk[0], lk[1], { white: '#f8e88a', pr: 0.55, pry: 0.7 })
  brow(c, [-10, -9.6], [-5.2, -10], [-0.6, -7.4], 2.0)
  brow(c, [10, -9.6], [5.2, -10], [0.6, -7.4], 2.0)
  blush(c, [[-8.8, 2.0, 1.8, 1.1], [8.8, 2.0, 1.8, 1.1]], '#f0886a', 0.4)
  mouth(c, [-8.8, 5.2], [8.8, 5.2], [0, 7.4], [0, 13.6], { fangs: [[-4.6, 2.8, 1.6], [4.6, 2.8, 1.6]], tongue: [0.6, 12.2, 2.8] })
  // brimstone smoke curling off the snout
  if (o.smoke) { puff(c, 10.5, 6.5, 1.8, '#9a8a8c'); puff(c, 13.5, 4.5, 2.4, '#a89a9a'); puff(c, -10.5, 7, 1.5, '#9a8a8c') }
  pop()
  pop()
}
// DRAGON frames: a flap (dragonPose). The downstroke snaps (wings from high and wide to folded under,
// the body thrown up by it, a puff of brimstone), the upstroke lifts them slowly back, the body sinking.
const DRAGON_POSE = [
  { flap: 1.0, bob: 0 }, { flap: 0.66, bob: 1.8 }, { flap: 0.3, bob: 4.2, smoke: true },
  { flap: 0.42, bob: 3.4, smoke: true }, { flap: 0.62, bob: 2.2 }, { flap: 0.84, bob: 1.0 },
]
const DRAGON_HOLD = [0.12, 0.08, 0.14, 0.2, 0.22, 0.24]
const DRAGON_AT = DRAGON_HOLD.reduce((a, h) => (a.push(a[a.length - 1] + h), a), [0])
const dragonPose = (e) => {
  const u = (CLOCK.t * 1.3 + (e.id || 0) * 0.173) % 1
  let f = 0; while (f < 5 && u >= DRAGON_AT[f + 1]) f++
  return f
}
function paintDragon(c, f) { dragon(c, DRAGON_POSE[f % 6]) }

const wrap = (fn) => (ctx, f, elite) => { resetXf(); fn(ctx, f, elite); resetXf() }
export const TOON_CAST = {
  emberImp: { baseR: 10, frames: 8, box: [-22, -32, 22, 20], paint: wrap(paintImp), poseOf: impPose, thumbFrame: 4 },
  magmaToad: { baseR: 11, frames: 6, box: [-26, -22, 26, 25], paint: wrap(paintToad), poseOf: toadPose },
  basaltGolem: { baseR: 27, frames: 8, box: [-43, -36, 43, 34], paint: wrap(paintGolem), poseOf: golemPose, thumbFrame: 1 },
  // drawn bigger than its hit radius (baseR under its radius): it flies, and a dragon must read as big
  brimstoneDragon: { baseR: 23, frames: 6, box: [-70, -64, 76, 74], paint: wrap(paintDragon), poseOf: dragonPose },
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
