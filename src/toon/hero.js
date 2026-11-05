// The Mantle's hero: THE ANOMALY, in the toon look, seen from above. ALL of the toon renderer's hero
// drawing lives here (toon.js only bakes what paintHero paints, per skin, and cuts its keyline):
//   skin null      Book 1's round mint blob with its face (two eyes, a smile, blush cheeks), as a jelly
//   skin 'cheeks'  Book 1's butt (render.js drawBlobButt): two peach cheeks, the cleft opening up the
//                  screen, two little feet under it that step across the walk frames
// The personality is in the motion: the walk is a squash-and-stretch cycle, and the face rides the body's
// own transform so the eyes and smile stretch with it. +x is the way it walks (toon.js mirrors for left).
// Units = world px / HERO_SCALE, about the player's centre. f: 0 is the idle frame, 0..HERO_FRAMES-1 the
// walk cycle. bare: the pass without ground marks, the silhouette toon.js cuts the keyline from.
import { resetXf, sc, tr, push, pop, ell, polar, qb, line, cel, eye, shadow } from './brush.js'
import { blush } from './cast.js'
import { PLAYER, BUTT_FEET } from '../config.js'

export const HERO_SCALE = 1
export const HERO_BOX = [-30, -32, 30, 40]   // world px round the player's centre (room for the feet and the cut)
export const HERO_FRAMES = 4
export const HERO_SKINS = [null, 'cheeks']   // one baked set each; any other run.skin wears the plain one

const R = PLAYER.radius

// the walk, one key per frame: 0 rest (also idle), 1 STRETCH (launched, long along the walk, its back
// dragging), 2 SQUASH (landed: pressed short along the walk, splayed wide across it, its front flattened), 3 OVERSHOOT (springs back long past round before it settles)
//   sx/sy: the body's scale along/across the walk; lean: how far the face leads; tail: the dragged back;
//   flat: how much the leading edge flattens on the landing; core: where the soft core lags (inertia); sh: the ground shadow's size (small = off the ground)
const JELLY = [
  { sx: 1.00, sy: 1.00, lean: 0.00, tail: 0.00, flat: 0.00, core: 0.00, sh: 1.00 },
  { sx: 1.14, sy: 0.84, lean: 0.10, tail: 0.14, flat: 0.00, core: -0.16, sh: 0.80 },
  { sx: 0.86, sy: 1.16, lean: 0.06, tail: 0.00, flat: 0.10, core: 0.12, sh: 1.12 },
  { sx: 1.05, sy: 0.95, lean: -0.03, tail: 0.05, flat: 0.00, core: -0.04, sh: 0.94 },
]
const MINT = '#7de3c3', MINT_SH = 'rgba(14,86,72,0.45)'

function blob(c, f, bare) {
  const J = JELLY[f]
  if (!bare) shadow(c, 1.5, R * 0.5, R * 1.05 * J.sh * J.sx, R * 0.55 * J.sh, 0.42)
  push(); sc(J.sx, J.sy)
  // the gel: round, its back pulled into a soft drop while it is launched, its front flattened on the landing
  const body = polar(0, 0, (t) => R * (1 + J.tail * Math.pow(Math.max(0, -Math.cos(t)), 3) - J.flat * Math.pow(Math.max(0, Math.cos(t)), 4)), 56)
  cel(c, body, MINT, { ink: 1.8, shade: MINT_SH })
  // a lighter translucent core that lags behind the skin, and two little bubbles caught in it
  const k = R * J.core
  cel(c, ell(-R * 0.1 + k, -R * 0.08, R * 0.6, R * 0.52, 0, 32), 'rgba(214,255,240,0.42)', { ink: 0, shade: null, dabs: 0 })
  cel(c, ell(-R * 0.42 + k * 1.4, R * 0.42, R * 0.07, R * 0.07, 0, 12), 'rgba(236,255,248,0.75)', { ink: 0, shade: null, dabs: 0 })
  cel(c, ell(-R * 0.6 + k * 1.6, R * 0.24, R * 0.04, R * 0.04, 0, 10), 'rgba(236,255,248,0.7)', { ink: 0, shade: null, dabs: 0 })
  // the wet shine: a cream comma up-left that slides round the skin as it squashes
  const hx = -R * (0.5 + J.tail * 1.2 + (J.sy - 1) * 0.5), hy = -R * (0.56 + (J.sy - 1) * 0.6)
  cel(c, ell(hx, hy, R * 0.2, R * 0.1, -0.7, 18), 'rgba(255,250,236,0.92)', { ink: 0, shade: null, dabs: 0 })
  cel(c, ell(hx + R * 0.24, hy - R * 0.13, R * 0.045, R * 0.04, 0, 10), 'rgba(255,250,236,0.9)', { ink: 0, shade: null, dabs: 0 })
  // the face rides the body (it stretches with it) and leads the walk
  const L = R * J.lean, look = f ? 0.55 : 0
  for (const sg of [-1, 1]) eye(c, L + sg * R * 0.36, -R * 0.16, R * 0.22, R * 0.25, look, f === 1 ? -0.3 : 0.15, { pr: 0.52, pry: 0.56, ink: 1.15 })
  // the grin opens wider on the squash
  const mw = f === 2 ? 0.27 : 0.2, md = f === 2 ? 0.55 : f === 1 ? 0.42 : 0.5
  line(c, qb([L - R * mw, R * 0.27], [L, R * md], [L + R * mw, R * 0.27]), 1.2, { belly: true })
  blush(c, [[L - R * 0.6, R * 0.17, R * 0.15, R * 0.1], [L + R * 0.6, R * 0.17, R * 0.15, R * 0.1]], '#ff98ae', 0.62)
  pop()
}

// the butt's bounce, one key per frame: how far each cheek is UP (toward the camera, bigger) or SETTLED,
// and the whole seat's squash. Out of phase: one rises while the other settles; both land on frame 2.
const BOUNCE = [
  { l: 0, r: 0, sx: 1, sy: 1 },
  { l: 1, r: -0.6, sx: 0.97, sy: 1.04 },
  { l: -0.4, r: -0.4, sx: 1.08, sy: 0.93 },
  { l: -0.6, r: 1, sx: 0.97, sy: 1.04 },
]
// Book 1's peach tan (hue ~21), held a step LIGHTER than the lava and shaded deep umber: it parts from
// the orange by value (pale lit top, dark shadow side), never by drifting pink
const PEACH = '#f6b48a', PEACH_SH = 'rgba(96,36,12,0.58)', PEACH_LIT = 'rgba(255,230,206,0.36)', SEAT = '#8e4a2c'

function cheek(c, sg, up) {
  // UP: grows and rises a little; SETTLED: sinks and spreads
  const s = 1 + up * 0.07, x = sg * R * (0.47 + up * 0.02), y = -R * (0.04 + up * 0.09)
  push(); tr(x, y); sc(s * (up < 0 ? 1 - up * 0.04 : 1), s)
  cel(c, ell(0, 0, R * 0.55, R * 0.86, -sg * 0.1, 40), PEACH, { ink: 1.3, shade: PEACH_SH })
  // the lit top of the cheek, and its shine (a comma and a dot) slid up as it rises
  cel(c, ell(-R * 0.12, -R * (0.28 + up * 0.04), R * 0.3, R * 0.4, -0.35, 24), PEACH_LIT, { ink: 0, shade: null, dabs: 0 })
  cel(c, ell(-R * 0.2, -R * (0.42 + up * 0.06), R * 0.17, R * 0.075, -0.85, 16), 'rgba(255,252,242,1)', { ink: 0, shade: null, dabs: 0 })
  cel(c, ell(-R * 0.02, -R * (0.58 + up * 0.06), R * 0.045, R * 0.04, 0, 10), 'rgba(255,250,238,0.95)', { ink: 0, shade: null, dabs: 0 })
  blush(c, [[sg * R * 0.1, R * 0.22, R * 0.16, R * 0.11]], '#ff8a8a', 0.6)
  // the crease where the cheek sits on the thigh: a short swelling stroke curling out to the side
  line(c, qb([-sg * R * 0.06, R * 0.72], [sg * R * 0.18, R * 0.82], [sg * R * 0.38, R * 0.58]), 0.95, { belly: true, taper: 0.5 })
  pop()
}

function cheeks(c, f, bare) {
  const B = BOUNCE[f]
  const fx = R * BUTT_FEET.rx * 0.84, fy = R * BUTT_FEET.ry * 0.84   // a touch under Book 1's: the ink keyline adds the rest
  if (!bare) shadow(c, 1.5, R * 0.55, R * 1.05 * B.sx, R * 0.6, 0.42)
  // the feet first, under the cheeks: the one under the rising cheek steps forward and lifts
  for (const sg of [-1, 1]) {
    const up = sg < 0 ? B.l : B.r, lift = 1 + Math.max(0, up) * BUTT_FEET.lift * 1.6
    const x = sg * R * BUTT_FEET.offX, y = R * (BUTT_FEET.rest - up * BUTT_FEET.stride * 1.3)
    cel(c, ell(x, y, fx * lift, fy * lift, 0, 24), PEACH, { ink: 1.15, shade: PEACH_SH })
    cel(c, ell(x - fx * 0.35, y - fy * 0.35, fx * 0.28, fy * 0.18, -0.6, 10), 'rgba(255,250,238,0.9)', { ink: 0, shade: null, dabs: 0 })
    // two little toe ticks on the front edge
    for (const t of [-0.3, 0.3]) line(c, [[x + fx * t * lift, y + fy * 0.55 * lift], [x + fx * t * 1.1 * lift, y + fy * 0.95 * lift]], 0.6, { taper: 0.5 })
  }
  push(); sc(B.sx, B.sy)
  // the seat the cheeks sit in: the gap left between the two masses is the cleft
  cel(c, ell(0, R * 0.04, R * 0.98, R * 0.94, 0, 48), SEAT, { ink: 1.5, shade: null })
  // the settled cheek first, the risen one over it (nearer the camera)
  const order = B.l > B.r ? [1, -1] : [-1, 1]
  for (const sg of order) cheek(c, sg, sg < 0 ? B.l : B.r)
  // the cleft follows them: it leans toward the settled side, pushed over by the risen cheek
  const lean = (B.l - B.r) * R * 0.06, dip = R * (0.04 - Math.max(B.l, B.r) * 0.03)
  line(c, qb([lean * 0.4, -R * 0.98], [lean - R * 0.03, -R * 0.5], [lean * 0.6, dip + R * 0.24]), 1.3, { taper: 0.4 })
  pop()
}

export function paintHero(ctx, f, bare = false, skin = null) {
  // the bare silhouette sits a hair inside the body, so the keyline cut from it reads as fine as the creatures'
  resetXf(); sc(HERO_SCALE * (bare ? 0.97 : 1))
  ;(skin === 'cheeks' ? cheeks : blob)(ctx, f % HERO_FRAMES, bare)
  resetXf()
}
