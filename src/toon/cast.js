// The Mantle's cast and its player: 1930s rubber-hose cartoon characters (render-only).
//
// Drawn with the brush (brush.js): flat cel paint, one soft shadow, a small cream specular, a pressure
// ink contour, pie-cut eyes, white gloves, rubber-hose limbs. Big heads and big eyes, and the charm is
// in the squash and stretch: the imps BOUNCE (stretched in the air, squashed on landing), the toad
// pancakes before it hops and stretches out when it leaps, the golem knuckle-walks, the dragon flaps.
// Every body faces the camera, the way a cartoon overworld shows its characters from above (render.js
// mirrors it to face its way; it is never turned), standing on its own soft shadow.
//   TOON_CAST[id] = { baseR, frames, box: [x0, y0, x1, y1] (units round the body's centre), paint, poseOf? }
//   paint(ctx, frame, elite) draws in units (the caller has scaled the context). render.js scales the
//   sprite by e.radius / baseR, so baseR sets how many world px one unit is drawn at.
import { resetXf, push, pop, tr, rot, sc, ell, polar, drop, tube, qb, line, cel, eye, glove, shadow, glow, puff, flame, INK } from './brush.js'

const SH_RED = 'rgba(96,6,24,0.42)'

// ---- EMBER IMP: a red devil ball with a flame tuft, horns, a fanged grin, white gloves -------------
function imp(c, o = {}) {
  const st = o.stretch || 1, lk = o.look || [0, 0], arms = o.arms || 'swing', lift = o.lift || 0
  shadow(c, 1.5, 10, 8 * (lift > 1 ? 0.78 : 1), 3.6, lift > 1 ? 0.24 : 0.36)
  push(); tr(0, -lift)
  tr(0, 9); sc(1 / Math.sqrt(st), st); tr(0, -9)
  const body = o.col || '#d63a2c'
  // tail with a spade tip, feet
  cel(c, tube(qb([2, 6], [10, 9], [11, 1]), 2.0, 1.3), body, { ink: 1.0, shade: SH_RED })
  push(); tr(11, 0); rot(0.25); cel(c, drop(0, 0, 2.4, 4.2), body, { ink: 1.0, shade: SH_RED }); pop()
  cel(c, ell(-3, 8.2, 2.4, 1.6, 0.2, 20), '#4e1d1c', { ink: 1.0, shade: null })
  cel(c, ell(3.2, 8.4, 2.4, 1.6, -0.2, 20), '#4e1d1c', { ink: 1.0, shade: null })
  // arms (rubber hose) and gloves
  const L = arms === 'up' ? [[-4, 4], [-13, 1], [-12, -8]] : arms === 'reach' ? [[-4, 4], [-11, 5], [-14, 0]] : [[-4, 4], [-10, 8], [-13, 5]]
  const R = arms === 'up' ? [[4, 4], [13, 1], [13, -8]] : arms === 'reach' ? [[4, 4], [12, 2], [14, -4]] : [[4, 4], [10, 2], [13, -3]]
  for (const A of [L, R]) cel(c, tube(qb(A[0], A[1], A[2]), 1.9, 1.6), body, { ink: 0.95, shade: SH_RED })
  glove(c, L[2][0], L[2][1], 2.7, Math.atan2(L[2][1] - L[1][1], L[2][0] - L[1][0]))
  glove(c, R[2][0], R[2][1], 2.7, Math.atan2(R[2][1] - R[1][1], R[2][0] - R[1][0]))
  // the little body under the head
  cel(c, ell(0, 5.2, 4.4, 3.8, 0, 30), body, { ink: 1.2, shade: SH_RED })
  // the flame tuft, behind the head
  const fl = o.big ? 1.25 : 1
  cel(c, flame(0.3, -8.5, 5.4 * Math.sqrt(fl), 12 * fl, o.curl ?? 0.7), '#f07a20', { ink: 1.2, shade: 'rgba(160,36,10,0.45)' })
  cel(c, flame(0.5, -8.2, 3.0 * Math.sqrt(fl), 7.5 * fl, (o.curl ?? 0.7) - 0.1), '#ffd95e', { ink: 0, shade: null })
  // horns
  cel(c, tube(qb([-4.8, -5.5], [-7.4, -7.2], [-6.6, -10.2]), 2.4, 0.6), '#f3e4c0', { ink: 0.9, shade: 'rgba(120,80,60,0.4)' })
  cel(c, tube(qb([4.8, -5.5], [7.4, -7.2], [6.6, -10.2]), 2.4, 0.6), '#f3e4c0', { ink: 0.9, shade: 'rgba(120,80,60,0.4)' })
  // the head: the big round
  cel(c, ell(0, -1.4, 8.6, 7.8, 0, 46), body, { ink: 1.7, shade: SH_RED, spec: 0.2 })
  c.save(); c.globalAlpha = 0.4
  cel(c, ell(-5.2, 1.4, 1.6, 1.0, 0, 16), '#f59a78', { ink: 0, shade: null })
  cel(c, ell(5.2, 1.4, 1.6, 1.0, 0, 16), '#f59a78', { ink: 0, shade: null }); c.restore()
  // the face: pie eyes, angled brows, a wide fanged grin
  eye(c, -2.8, -2.4, 2.8, 3.5, lk[0], lk[1], { pr: 0.6, pry: 0.7 })
  eye(c, 2.8, -2.4, 2.8, 3.5, lk[0], lk[1], { pr: 0.6, pry: 0.7 })
  line(c, qb([-5.4, -6.6], [-3.2, -6.4], [-0.7, -5.2]), 1.25, { belly: true })
  line(c, qb([5.4, -6.6], [3.2, -6.4], [0.7, -5.2]), 1.25, { belly: true })
  const mouth = [...qb([-5.4, 1.0], [0, 3.0], [5.4, 1.0], 12), ...qb([5.4, 1.0], [0, 8.4], [-5.4, 1.0], 12).slice(1, -1)]
  cel(c, mouth, '#3a0d12', { ink: 1.1, shade: null })
  cel(c, ell(0, 5.2, 2.6, 1.1, 0, 16), '#e0564f', { ink: 0, shade: null })
  cel(c, [[-3.4, 1.9], [-1.9, 2.3], [-2.6, 4.4]], '#f8f1de', { ink: 0.5, shade: null })
  cel(c, [[3.4, 1.9], [1.9, 2.3], [2.6, 4.4]], '#f8f1de', { ink: 0.5, shade: null })
  pop()
}
// IMP frames: a bounce. 0 up and stretched, 1 coming down, 2 landed and squashed (dust), 3 springing
const IMP_POSE = [
  { stretch: 1.14, arms: 'reach', lift: 4, look: [0.4, 0.3], curl: 0.9, lines: true },
  { stretch: 1.04, arms: 'swing', lift: 2, look: [0.5, 0.4], curl: 0.6 },
  { stretch: 0.84, arms: 'up', lift: 0, look: [0.4, 0.5], curl: 0.3, dust: true },
  { stretch: 1.0, arms: 'swing', lift: 1, look: [0.5, 0.4], curl: 0.5 },
]
function paintImp(c, f, elite) {
  const P = IMP_POSE[f % 4]
  imp(c, { ...P, col: elite ? '#b92a30' : '#d63a2c', big: elite })
  if (P.lines) { line(c, qb([-5, 13.5], [0, 15], [5, 13.5]), 0.9); line(c, qb([-3, 16], [0, 17], [3, 16]), 0.8) }
  if (P.dust) { puff(c, -10, 10, 2.2); puff(c, 10.5, 10.5, 2.5) }
}

// ---- MAGMA TOAD: a squat red-brown pancake of a toad, glowing warts, eye domes on top, a smug grin -
function toad(c, o = {}) {
  const lk = o.look || [0, 0], sx = o.sx || 1, sy = o.sy || 1, lift = o.lift || 0
  shadow(c, 1.5, 6, 16 * (lift ? 0.8 : 1), 7, lift ? 0.26 : 0.38)
  push(); tr(0, -lift); tr(0, 6); sc(sx, sy); tr(0, -6)
  const skin = o.col || '#93392a', dark = '#4a1a1c', sh = 'rgba(48,4,20,0.5)'
  // hind legs: folded out flat to the sides for the squash, flung back and out for the leap
  for (const k of [-1, 1]) {
    const legs = o.leap ? [[k * 8, 4], [k * 17, 6], [k * 23, 12], [k * 21, 16]] : [[k * 8, 2], [k * 19, 0], [k * 18, 8], [k * 10, 10]]
    cel(c, tube(legs, 5.2, 3.2), skin, { ink: 1.2, shade: sh })
    const ft = o.leap ? [k * 22, 17] : [k * 10.5, 11]
    cel(c, polar(ft[0], ft[1], (t) => 2.8 * (1 + 0.3 * Math.max(0, Math.cos(t * 3))), 24), '#eac46e', { ink: 1.0, shade: 'rgba(130,60,20,0.4)' })
  }
  // front hands: white gloves splayed forward (reaching ahead on the leap)
  if (o.leap) { glove(c, -9, -10, 2.6, -2.0); glove(c, 9, -10, 2.6, -1.1) } else { glove(c, -9, -6, 2.6, -2.4); glove(c, 9, -6, 2.6, -0.7) }
  // the body: a squashed pancake
  cel(c, ell(0, 1, 15, 9.4, 0, 50, 0.02, 3), skin, { ink: 1.9, shade: sh, spec: 0.16 })
  cel(c, [...qb([-11, 1.5], [0, 10.5], [11, 1.5], 14), ...qb([11, 1.5], [0, 13], [-11, 1.5], 14).slice(1, -1)], '#ecbd5e', { ink: 1.0, shade: 'rgba(150,60,20,0.4)' })
  // magma warts (glowing pores)
  for (const [wx, wy, wr] of [[-7, 4, 1.6], [6.5, 5, 1.8], [0, 7, 1.3], [-10, -1, 1.1], [10.5, 0, 1.2], [3, 3, 1]]) {
    cel(c, ell(wx, wy, wr, wr * 0.8, 0, 16), dark, { ink: 0, shade: null })
    cel(c, ell(wx - 0.2, wy - 0.2, wr * 0.55, wr * 0.45, 0, 12), '#f7a83e', { ink: 0, shade: null })
  }
  // eye domes on top of the head, heavy smug lids
  cel(c, ell(-5.6, -6.4, 5.4, 5.0, 0, 30), skin, { ink: 1.4, shade: sh })
  cel(c, ell(5.6, -6.4, 5.4, 5.0, 0, 30), skin, { ink: 1.4, shade: sh })
  eye(c, -5.6, -7, 3.6, 3.9, lk[0], lk[1])
  eye(c, 5.6, -7, 3.6, 3.9, lk[0], lk[1])
  const lid = o.leap ? 10.4 : 9.6
  for (const k of [-1, 1]) cel(c, [...qb([k * 9.4, -8.2], [k * 5.6, -12.8], [k * 1.8, -8.2], 12), ...qb([k * 1.8, -8.2], [k * 5.6, -lid], [k * 9.4, -8.2], 10).slice(1, -1)], skin, { ink: 1.0, shade: null })
  // a wide grin along the front edge (an O of effort on the leap)
  if (o.leap) { cel(c, ell(0, 4.2, 2.6, 2.2, 0, 20), '#3a0d12', { ink: 1.1, shade: null }) } else {
    line(c, qb([-11, 1.2], [0, 6.5], [11, 1.2]), 1.6, { belly: true })
    line(c, qb([-10.5, -1.6], [-9.6, -0.4], [-9.8, 0.8]), 0.9)
    line(c, qb([10.5, -1.6], [9.6, -0.4], [9.8, 0.8]), 0.9)
  }
  pop()
  if (o.dust) { puff(c, -18, 9, 2.4); puff(c, 18.5, 8, 2.8); puff(c, 14, 12, 1.8) }
  if (o.leap) { line(c, qb([-7, 17], [0, 19], [7, 17]), 0.9); line(c, qb([-4, 20], [0, 21.2], [4, 20]), 0.8) }
}
// TOAD frames: 0/1 sat and breathing, 2 pancaked ready to spring (aim / land), 3 the leap
const TOAD_POSE = [
  { sx: 1, sy: 1, look: [0.4, 0.2] },
  { sx: 0.97, sy: 1.05, look: [0.4, 0.2] },
  { sx: 1.12, sy: 0.84, look: [0.5, 0.1], dust: true },
  { sx: 0.94, sy: 1.08, lift: 6, leap: true, look: [0.3, -0.3] },
]
function paintToad(c, f, elite) { toad(c, { ...TOAD_POSE[f % 4], col: elite ? '#7d2a2a' : '#93392a' }) }
function toadPose(e) {
  const s = e._pounceState
  if (s === 'leap') return 3
  if (s === 'aim' || s === 'land') return 2
  return Math.floor(-(e._pounceT || 0) * 3 + (e.id || 0) * 0.37) & 1
}

// ---- BASALT GOLEM: a hulking stone back with magma cracks, a small low head, huge fists ------------
function golem(c, o = {}) {
  const lk = o.look || [0, 0], a = o.step || 0, bob = o.bob || 0
  shadow(c, 3, 10, 36, 16, 0.42)
  push(); tr(0, -bob)
  const st = o.col || '#574446', st2 = '#433238', sh = 'rgba(26,6,20,0.5)'
  const rock = (cx, cy, r, sd, col = st, ink = 1.8) => cel(c, polar(cx, cy, (t) => r * (1 + 0.08 * Math.sin(t * 3 + sd) + 0.05 * Math.sin(t * 5 + sd * 2)), 50), col, { ink, shade: sh, spec: 0.12 })
  // fists, forward on the ground (knuckle-walking: one forward, one back)
  const fl = [-25, 6 + a * 3 + bob], fr = [25, 4 - a * 3 + bob]
  rock(fl[0], fl[1], 10.5, 1, st2); rock(fr[0], fr[1], 11, 2, st2)
  for (const [k, F] of [[-1, fl], [1, fr]]) { line(c, qb([F[0] - 5, F[1] - 7], [F[0] - 3, F[1] - 4], [F[0] - 5, F[1] - 1]), 1.0); line(c, qb([F[0] + 1, F[1] - 7 - (k > 0 ? 2 : 0)], [F[0] + 3, F[1] - 4], [F[0] + 1, F[1] - 1]), 1.0) }
  // arms (stacked stones)
  rock(-17, -5 + a, 6.5, 3, st2, 1.4); rock(17, -6 - a, 6.5, 4, st2, 1.4)
  // the hulking back
  rock(0, -7, 20, 5)
  // cracks with magma light
  for (const P of [[[-10, -19], [-6, -13], [-9, -7], [-4, -1]], [[8, -21], [5, -15], [10, -10]], [[1, -5], [6, -1]]]) cel(c, tube(P, 2.6, 1.4), '#ffbb4a', { ink: 0.8, shade: null })
  glow(c, -7, -10, 14, '255,130,40', 0.5); glow(c, 7, -15, 10, '255,130,40', 0.45)
  // shoulder pebbles
  rock(-11, -21, 3.2, 6, st2, 1.1); rock(13, -18, 2.6, 7, st2, 1.0)
  // the head: small, low, forward, a boulder brow
  rock(0, 9, 9.5, 8, '#6c5a5e', 1.8)
  eye(c, -3.6, 8.4, 2.9, 3.2, lk[0], lk[1], { white: '#f8d66a' })
  eye(c, 3.6, 8.4, 2.9, 3.2, lk[0], lk[1], { white: '#f8d66a' })
  cel(c, [...qb([-7.4, 4.6], [0, 1.4], [7.4, 4.6], 12), ...qb([7.4, 4.6], [0, 6.6], [-7.4, 4.6], 12).slice(1, -1)], st2, { ink: 1.3, shade: null })
  // an underbite with two square teeth
  line(c, qb([-5, 14], [0, 16.4], [5, 14]), 1.3, { belly: true })
  cel(c, [[-3.2, 14.6], [-1.2, 15.4], [-1.4, 12.8], [-3.0, 12.4]], '#f1e4c6', { ink: 0.7, shade: null })
  cel(c, [[3.2, 14.6], [1.2, 15.4], [1.4, 12.8], [3.0, 12.4]], '#f1e4c6', { ink: 0.7, shade: null })
  pop()
}
const GOLEM_POSE = [{ step: 1, bob: 0 }, { step: 0, bob: 1.2 }, { step: -1, bob: 0 }, { step: 0, bob: 1.2 }]
function paintGolem(c, f, elite) { golem(c, { ...GOLEM_POSE[f % 4], look: [0, 0.5], col: elite ? '#4b3a44' : '#574446' }) }

// ---- BRIMSTONE DRAGON (the elite): green, on spread bat wings, flying high (its shadow far below) ---
const mix2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
function dragon(c, o = {}) {
  const lk = o.look || [0, 0.6], fl = o.flap ?? 1, bob = o.bob || 0
  // its shadow on the ground, far below (it flies)
  shadow(c, 16, 40, 50, 20, 0.36, '50,10,20')
  push(); tr(0, -bob); sc(1.18)
  const g = '#6f9e3c', g2 = '#557a2c', mem = '#cfc25a', sh = 'rgba(28,44,8,0.48)'
  // wings: arm, three finger spars, a scalloped membrane (the flap swings the spars up and in)
  for (const k of [-1, 1]) {
    push(); sc(0.55 + 0.45 * fl, 1)
    const up = (1 - fl) * 10
    const sh0 = [k * 6, 0]
    const tips = [[k * 54, -10 - up], [k * 50, -26 - up], [k * 36, -32 - up * 0.6]]
    const elbow = [k * 30, 4 - up * 0.4]
    const memPts = [sh0, elbow, tips[0], ...qb(tips[0], [k * 44, -12 - up], tips[1], 8).slice(1), ...qb(tips[1], [k * 36, -22 - up], tips[2], 8).slice(1), ...qb(tips[2], [k * 18, -18], [k * 5, -14], 8).slice(1)]
    cel(c, memPts, mem, { ink: 1.5, shade: 'rgba(110,70,20,0.42)' })
    for (const tp of tips) { const m = mix2(elbow, tp, 0.5); line(c, qb(elbow, [m[0] + 2, m[1] + 3], tp, 14), 1.7, { taper: 0.35 }) }
    cel(c, tube([sh0, [k * 16, 6], elbow], 4.6, 3.4), g, { ink: 1.3, shade: sh })
    cel(c, tube([elbow, tips[0]], 3.0, 1.2), g, { ink: 1.1, shade: sh })
    cel(c, [[elbow[0], elbow[1] - 1.5], [elbow[0] + k * 4, elbow[1] + 3.5], [elbow[0] - k * 0.5, elbow[1] + 2]], '#f1e8d2', { ink: 0.7, shade: null })
    pop()
  }
  // the tail, whipping behind (toward -y), with a red spade
  cel(c, tube([[0, -10], [-6, -24], [4, -36], [12, -44]], 7, 1.4), g, { ink: 1.4, shade: sh })
  push(); tr(13, -45); rot(-2.4); cel(c, drop(0, 0, 3.6, 6.4), '#dc4a38', { ink: 1.1, shade: SH_RED }); pop()
  for (const k of [-1, 1]) cel(c, ell(k * 7.5, -9, 3, 2.2, 0, 18), g2, { ink: 1.0, shade: sh })
  // the body, spine spikes down its back
  cel(c, ell(0, -1, 10, 14, 0, 44), g, { ink: 1.9, shade: sh, spec: 0.14 })
  for (let i = 0; i < 6; i++) { const yy = -12 + i * 4.4, w = 2.0 - i * 0.12; cel(c, [[-w, yy + 1.6], [w, yy + 1.6], [0, yy - 2.6]], '#f4eedb', { ink: 0.8, shade: null }) }
  // neck and the big head, toward you
  cel(c, tube([[0, 10], [-1, 16], [1, 20]], 8, 6.5), g, { ink: 1.5, shade: sh })
  push(); tr(1, 25); sc(1.25)
  cel(c, ell(0, 6.4, 5.4, 5.6, 0, 30), '#94b956', { ink: 1.4, shade: sh })
  cel(c, ell(0, 0, 9.2, 7.4, 0, 40), g, { ink: 1.8, shade: sh, spec: 0.16 })
  for (const k of [-1, 1]) cel(c, tube(qb([k * 5.5, -4], [k * 10, -8], [k * 9, -13]), 3.0, 0.6), '#f1e5c4', { ink: 1.0, shade: 'rgba(120,80,60,0.4)' })
  eye(c, -3.5, -0.6, 3.2, 3.9, lk[0], lk[1], { white: '#f6de6c' })
  eye(c, 3.5, -0.6, 3.2, 3.9, lk[0], lk[1], { white: '#f6de6c' })
  line(c, qb([-7.5, -4.6], [-4, -3.4], [-0.8, -2.6]), 1.3, { belly: true })
  line(c, qb([7.5, -4.6], [4, -3.4], [0.8, -2.6]), 1.3, { belly: true })
  for (const k of [-1, 1]) cel(c, ell(k * 2.0, 9.6, 0.9, 0.7, 0, 10), INK, { ink: 0, shade: null })
  line(c, qb([-4.6, 5.8], [-5.6, 9], [-3.4, 11.2]), 0.9); line(c, qb([4.6, 5.8], [5.6, 9], [3.4, 11.2]), 0.9)
  cel(c, [[-3.8, 9.8], [-3.0, 12.4], [-2.4, 10.4]], '#f4eedb', { ink: 0.6, shade: null })
  cel(c, [[3.8, 9.8], [3.0, 12.4], [2.4, 10.4]], '#f4eedb', { ink: 0.6, shade: null })
  // brimstone smoke curling off the snout
  if (o.smoke) { puff(c, 6, 15, 2.2, '#9a8a8c'); puff(c, 9, 19, 1.6, '#a89a9a') }
  pop()
  pop()
}
const DRAGON_POSE = [{ flap: 1, bob: 0 }, { flap: 0.7, bob: 1.5, smoke: true }, { flap: 0.4, bob: 3 }, { flap: 0.7, bob: 1.5 }]
function paintDragon(c, f) { dragon(c, DRAGON_POSE[f % 4]) }

const wrap = (fn) => (ctx, f, elite) => { resetXf(); fn(ctx, f, elite); resetXf() }
export const TOON_CAST = {
  emberImp: { baseR: 10, frames: 4, box: [-21, -29, 21, 20], paint: wrap(paintImp) },
  magmaToad: { baseR: 11, frames: 4, box: [-25, -20, 25, 25], paint: wrap(paintToad), poseOf: toadPose },
  basaltGolem: { baseR: 27, frames: 4, box: [-41, -33, 41, 30], paint: wrap(paintGolem) },
  brimstoneDragon: { baseR: 26, frames: 4, box: [-70, -62, 76, 70], paint: wrap(paintDragon) },
}

// ---- THE PLAYER: the digger. A big head under a yellow hard hat with its lamp, red shirt, blue -----
// dungarees, white gloves, a pick over the shoulder. Units = world px / PLAYER_SCALE.
export const PLAYER_SCALE = 1.35
export const PLAYER_BOX = [-30, -32, 30, 30]   // world px round the player's centre
function digger(c, f) {
  const ph = (f / 4) * Math.PI * 2, sw = Math.sin(ph), bob = Math.abs(Math.cos(ph)) * 0.9
  const lk = [0.3, 0.2]
  shadow(c, 1.5, 13.5, 13, 5, 0.42)
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
  eye(c, -3.2, -1.8, 2.5, 3.2, lk[0], lk[1])
  eye(c, 3.2, -1.8, 2.5, 3.2, lk[0], lk[1])
  cel(c, ell(0, 1.8, 2.0, 1.6, 0, 18), '#dc5a46', { ink: 1.0, shade: 'rgba(100,10,10,0.4)', spec: 0.35 })
  const m = [...qb([-3.6, 3.4], [0, 4.4], [3.6, 3.4], 10), ...qb([3.6, 3.4], [0, 8.2], [-3.6, 3.4], 10).slice(1, -1)]
  cel(c, m, '#3a0d12', { ink: 1.0, shade: null })
  cel(c, ell(0, 6.2, 1.6, 0.8, 0, 12), '#e0564f', { ink: 0, shade: null })
  pop()
}
export function paintPlayer(ctx, f) { resetXf(); sc(PLAYER_SCALE); digger(ctx, f); resetXf() }

// a bubble with a face, peeking out of the swelling lava at the shore (the tide's tell); painted into
// the floor shader's atlas (world.js), so it rides the shore wherever the shader puts it
export function peekBubble(c, x, y, r, mood = 'peek', lk = [0, 0]) {
  glow(c, x, y, r * 1.5, '255,200,110', 0.3)
  cel(c, ell(x, y, r, r * 0.86, 0, 30), '#ec7c2c', { ink: 1.25, shade: 'rgba(150,30,14,0.5)', spec: 0.25 })
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
