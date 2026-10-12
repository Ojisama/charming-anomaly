// The Mantle's cast and its player, painted as 1930s rubber-hose cartoon characters (render-only).
//
// Every body is drawn UPRIGHT, the way a cartoon overworld shows its characters from above: standing
// on its own soft shadow, facing right (render.js mirrors it to face the way it goes; it is never
// turned). Units: one unit = one world px at the body's base radius (TOON_CAST[id].baseR); render.js
// scales the sprite by e.radius / baseR. Each creature has a few walk FRAMES render.js flips through.
//   TOON_CAST[id] = { baseR, frames, box: [x0, y0, x1, y1] (units, round the body's centre), paint }
//   paint(ctx, frame, elite) draws at units (the caller has scaled the context).
import { PAL, TAU, inkShape, ellipse, hose, pieEye, flame, groundShadow } from './palette.js'

// the elite's mark: a little gold crown on the head, drawn in the same ink
function crown(ctx, x, y, s) {
  inkShape(ctx, (c) => {
    c.moveTo(x - s, y); c.lineTo(x - s * 1.1, y - s * 1.2); c.lineTo(x - s * 0.45, y - s * 0.55)
    c.lineTo(x, y - s * 1.45); c.lineTo(x + s * 0.45, y - s * 0.55); c.lineTo(x + s * 1.1, y - s * 1.2)
    c.lineTo(x + s, y); c.closePath()
  }, PAL.coin, s * 0.35, { hi: PAL.coinHi, box: [x - s, y - s * 1.4, s * 2, s * 1.4] })
}

// ---- EMBER IMP: a little fire imp with a flame for hair, horns, a grin and a pointed tail ----------
function paintImp(ctx, f, elite) {
  const sw = Math.sin((f / 4) * TAU), bob = Math.abs(Math.cos((f / 4) * TAU)) * 1.2
  groundShadow(ctx, 0, 17, 12, 4)
  // the tail, behind
  ctx.lineCap = 'round'
  hose(ctx, -8, 6, -18, 8, -17, -2 + sw, 2.4, PAL.impShade)
  inkShape(ctx, (c) => { c.moveTo(-17, -6 + sw); c.lineTo(-13, -1 + sw); c.lineTo(-20, 0 + sw); c.closePath() }, PAL.impShade, 1.6)
  // legs: rubber hoses swinging
  hose(ctx, -4, 9 - bob, -5 + sw * 3, 13, -6 + sw * 4, 16, 3, PAL.impShade)
  hose(ctx, 4, 9 - bob, 5 - sw * 3, 13, 6 - sw * 4, 16, 3, PAL.impShade)
  inkShape(ctx, ellipse(-6 + sw * 4, 16.5, 3.2, 1.8), PAL.ink, 0.8)
  inkShape(ctx, ellipse(6 - sw * 4, 16.5, 3.2, 1.8), PAL.ink, 0.8)
  // the body
  const by = -bob
  inkShape(ctx, ellipse(0, 2 + by, 11, 11.5), elite ? '#e2552e' : PAL.imp, 3, { shade: PAL.impShade, hi: PAL.impHi, box: [-11, -9.5 + by, 22, 23] })
  // arms
  hose(ctx, -9, 3 + by, -14, 5 - sw * 2, -14, 9 - sw * 3, 2.6, PAL.imp)
  hose(ctx, 9, 3 + by, 14, 5 + sw * 2, 15, 9 + sw * 3, 2.6, PAL.imp)
  inkShape(ctx, ellipse(-14, 10 - sw * 3, 2.6, 2.6), PAL.paper, 1.4)
  inkShape(ctx, ellipse(15, 10 + sw * 3, 2.6, 2.6), PAL.paper, 1.4)
  // horns
  inkShape(ctx, (c) => { c.moveTo(-7, -6 + by); c.quadraticCurveTo(-11, -12 + by, -8, -15 + by); c.quadraticCurveTo(-6, -10 + by, -3, -8 + by); c.closePath() }, PAL.paper, 1.6)
  inkShape(ctx, (c) => { c.moveTo(7, -6 + by); c.quadraticCurveTo(11, -12 + by, 8, -15 + by); c.quadraticCurveTo(6, -10 + by, 3, -8 + by); c.closePath() }, PAL.paper, 1.6)
  // the flame for hair
  flame(ctx, 0, -7 + by, 6.5, f * 1.7)
  // face
  pieEye(ctx, -3.5, -1 + by, 3, 3.8, 0.6, 0.2, 1.4)
  pieEye(ctx, 4.5, -1 + by, 3, 3.8, 0.6, 0.2, 1.4)
  ctx.beginPath(); ctx.moveTo(-4, 5 + by); ctx.quadraticCurveTo(1.5, 10 + by, 7, 4.5 + by)
  ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.6; ctx.stroke()
  if (elite) crown(ctx, 0, -12 + by, 4)
}

// ---- MAGMA TOAD: a squat basalt toad, glowing spots on its back, eyes on top, big mouth ---------------
function paintToad(ctx, f, elite) {
  const k = f % 2 ? 1 : 0                     // 0 sitting, 1 gathering itself for the hop
  const sq = k ? 0.85 : 1
  groundShadow(ctx, 0, 11, 16, 4.5)
  // back legs, folded at the flanks
  inkShape(ctx, ellipse(-12, 7, 6, 4.5 * sq, -0.4), PAL.toadShade, 2.2)
  inkShape(ctx, ellipse(12, 7, 6, 4.5 * sq, 0.4), PAL.toadShade, 2.2)
  // body
  const top = -8 * sq
  inkShape(ctx, (c) => c.ellipse(0, 3 - (1 - sq) * 4, 15, 10 * sq, 0, 0, TAU), elite ? '#6c4a38' : PAL.toad, 3,
    { shade: PAL.toadShade, hi: '#8a6a52', box: [-15, top, 30, 20] })
  // the belly / lower lip
  inkShape(ctx, ellipse(2, 7, 9, 3.6 * sq), PAL.toadBelly, 1.4)
  // glowing spots
  for (const [x, y, r] of [[-7, -1, 2.4], [-1, -4, 1.8], [6, -2, 2.2], [-10, 3, 1.5], [10, 2, 1.4]]) {
    ctx.beginPath(); ctx.arc(x, y * sq, r + 1.2, 0, TAU); ctx.fillStyle = 'rgba(255,138,42,0.35)'; ctx.fill()
    inkShape(ctx, ellipse(x, y * sq, r, r * 0.8), PAL.toadSpot, 0.9)
  }
  // the mouth, a long grin across the front
  ctx.beginPath(); ctx.moveTo(-6, 4); ctx.quadraticCurveTo(5, 8, 14, 2)
  ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.7; ctx.stroke()
  // eyes on top, on their bumps
  inkShape(ctx, ellipse(1, top + 1, 4.4, 4), PAL.toad, 1.8)
  inkShape(ctx, ellipse(9, top + 2, 4.4, 4), PAL.toad, 1.8)
  pieEye(ctx, 1.4, top, 3, 3.2, 0.7, 0.1, 1.2)
  pieEye(ctx, 9.4, top + 1, 3, 3.2, 0.7, 0.1, 1.2)
  // front feet
  inkShape(ctx, ellipse(4, 12, 3.5, 1.8), PAL.toadShade, 1.2)
  inkShape(ctx, ellipse(11, 11, 3.5, 1.8), PAL.toadShade, 1.2)
  if (elite) crown(ctx, 5, top - 3, 4)
}

// ---- BASALT GOLEM: a heavy stack of basalt columns, glowing seams, little burning eyes ----------------
function paintGolem(ctx, f, elite) {
  const st = [0, 1, 0, -1][f % 4]
  groundShadow(ctx, 0, 27, 24, 6)
  // legs: two stubby columns
  inkShape(ctx, (c) => c.rect(-13 + st, 13, 10, 13 - st), PAL.golemShade, 2.6)
  inkShape(ctx, (c) => c.rect(3 - st, 13, 10, 13 + st), PAL.golemShade, 2.6)
  // body: a hexagonal column, wide at the shoulder
  const body = (c) => { c.moveTo(-19, -10); c.lineTo(-10, -20); c.lineTo(10, -20); c.lineTo(19, -10); c.lineTo(16, 15); c.lineTo(-16, 15); c.closePath() }
  inkShape(ctx, body, elite ? '#55566a' : PAL.golem, 3.6, { shade: PAL.golemShade, hi: PAL.golemHi, box: [-19, -20, 38, 35] })
  // the columns' joints and the burning seams between them
  ctx.lineCap = 'round'
  for (const [x0, y0, x1, y1] of [[-6, -19, -8, 14], [6, -19, 8, 14], [-18, -2, 17, 0]]) {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.strokeStyle = PAL.ink; ctx.lineWidth = 2.6; ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.strokeStyle = PAL.golemSeam; ctx.lineWidth = 1; ctx.stroke()
  }
  // arms and fists
  hose(ctx, -17, -8, -25, 0 - st, -23, 10 - st, 6, PAL.golem)
  hose(ctx, 17, -8, 25, 0 + st, 24, 10 + st, 6, PAL.golem)
  inkShape(ctx, (c) => c.roundRect(-29, 7 - st, 11, 9, 2.5), PAL.golemHi, 2)
  inkShape(ctx, (c) => c.roundRect(18, 7 + st, 11, 9, 2.5), PAL.golemHi, 2)
  // the head: a small block on the shoulders, eyes like coals
  inkShape(ctx, (c) => c.roundRect(-8, -29, 18, 12, 2), PAL.golem, 2.6, { hi: PAL.golemHi, box: [-8, -29, 18, 12] })
  for (const x of [-3, 5]) {
    ctx.beginPath(); ctx.arc(x, -23, 3.2, 0, TAU); ctx.fillStyle = 'rgba(255,122,34,0.4)'; ctx.fill()
    pieEye(ctx, x, -23, 2.2, 2.4, 0.6, 0.2, 1)
  }
  ctx.beginPath(); ctx.moveTo(-2, -19.5); ctx.lineTo(6, -19.5); ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.6; ctx.stroke()
  if (elite) crown(ctx, 1, -30, 5)
}

// ---- BRIMSTONE DRAGON: a sulphur-yellow dragon on bat wings, smoke curling off its snout -------------
// It FLIES: its shadow lies far below it on the ground, and its body bobs.
function paintDragon(ctx, f, elite) {
  const w = [1, 0.35, -0.5, 0.35][f % 4], bob = [0, 1, 2, 1][f % 4]
  groundShadow(ctx, 0, 21, 15, 4, 0.28)
  const y0 = -bob
  // far wing
  const wing = (s, sh) => (c) => {
    c.moveTo(-2 * s, -3 + y0)
    c.quadraticCurveTo(-6 * s, -14 * w - 6 + y0, -16 * s, -16 * w - 4 + y0)
    c.quadraticCurveTo(-13 * s, -6 * w + y0, -15 * s, 2 + y0)
    c.quadraticCurveTo(-9 * s, 0 + y0, -6 * s, 5 + y0)
    c.closePath()
  }
  inkShape(ctx, wing(-1, 1), PAL.wingShade, 2)
  // the tail, a curl behind
  hose(ctx, -8, 5 + y0, -16, 10 + y0, -19, 3 + y0, 3, PAL.sulfurShade)
  inkShape(ctx, (c) => { c.moveTo(-19, -1 + y0); c.lineTo(-16, 4 + y0); c.lineTo(-23, 4 + y0); c.closePath() }, PAL.wing, 1.4)
  // body
  inkShape(ctx, ellipse(0, 3 + y0, 10, 8), elite ? PAL.sulfur : PAL.sulfur, 3, { shade: PAL.sulfurShade, hi: PAL.sulfurHi, box: [-10, -5 + y0, 20, 16] })
  inkShape(ctx, ellipse(2, 6 + y0, 6, 3.5), PAL.toadBelly, 1.2)
  // neck and head, snout forward (+x)
  hose(ctx, 5, -1 + y0, 8, -6 + y0, 11, -7 + y0, 5, PAL.sulfur)
  inkShape(ctx, (c) => { c.ellipse(13, -8 + y0, 6.5, 5, 0.1, 0, TAU) }, PAL.sulfur, 2.4, { hi: PAL.sulfurHi, box: [7, -13 + y0, 13, 10] })
  inkShape(ctx, ellipse(18, -6.5 + y0, 3.6, 2.6, 0.2), PAL.sulfurShade, 1.4)
  // horns
  inkShape(ctx, (c) => { c.moveTo(10, -12 + y0); c.quadraticCurveTo(8, -18 + y0, 5, -19 + y0); c.quadraticCurveTo(9, -15 + y0, 13, -12 + y0); c.closePath() }, PAL.paper, 1.2)
  pieEye(ctx, 13.5, -9.5 + y0, 2.4, 2.8, 0.8, 0.1, 1.1)
  // a puff of brimstone smoke off the snout
  const pf = (f % 4) / 4
  ctx.globalAlpha = 0.85 - pf * 0.5
  inkShape(ctx, ellipse(23 + pf * 5, -10 + y0 - pf * 4, 2.2 + pf * 2, 2 + pf * 1.8), PAL.steamShade, 1)
  ctx.globalAlpha = 1
  // near wing, in front
  inkShape(ctx, wing(1, 0), PAL.wing, 2.2)
  if (elite) crown(ctx, 12, -14 + y0, 3.4)
}

export const TOON_CAST = {
  emberImp: { baseR: 16, frames: 4, box: [-24, -24, 24, 22], paint: paintImp },
  magmaToad: { baseR: 12, frames: 2, box: [-22, -18, 22, 18], paint: paintToad },
  basaltGolem: { baseR: 26, frames: 4, box: [-34, -38, 34, 34], paint: paintGolem },
  brimstoneDragon: { baseR: 12, frames: 4, box: [-28, -26, 32, 26], paint: paintDragon },
}

// ---- THE PLAYER: a round cream fellow in red shorts, pie eyes and a grin, on rubber-hose legs -------
// Units = world px (PLAYER.radius is 22). Frames: a four-step walk, standing still is frame 0.
export const PLAYER_BOX = [-30, -32, 30, 34]
export function paintPlayer(ctx, f, moving = true) {
  const ph = (f / 4) * TAU
  const sw = moving ? Math.sin(ph) : 0, bob = moving ? Math.abs(Math.cos(ph)) * 1.5 : 0
  groundShadow(ctx, 0, 27, 17, 5)
  // legs
  hose(ctx, -6, 14 - bob, -7 + sw * 4, 20, -8 + sw * 6, 25, 4, PAL.hero)
  hose(ctx, 6, 14 - bob, 7 - sw * 4, 20, 8 - sw * 6, 25, 4, PAL.hero)
  inkShape(ctx, (c) => c.ellipse(-8 + sw * 6 + 1.5, 26, 5, 3, 0, 0, TAU), PAL.shorts, 1.6)
  inkShape(ctx, (c) => c.ellipse(8 - sw * 6 + 1.5, 26, 5, 3, 0, 0, TAU), PAL.shorts, 1.6)
  const y = -bob
  // shorts, then the round body over them
  inkShape(ctx, (c) => c.roundRect(-12, 6 + y, 24, 11, 4), PAL.shorts, 2.4, { shade: PAL.shortsShade, box: [-12, 6 + y, 24, 11] })
  inkShape(ctx, ellipse(0, -5 + y, 17, 16), PAL.hero, 3.6, { shade: PAL.heroShade, hi: PAL.white, box: [-17, -21 + y, 34, 32] })
  // arms with white gloves
  hose(ctx, -14, 0 + y, -21, 4 - sw * 3, -21, 10 - sw * 4, 3.4, PAL.hero)
  hose(ctx, 14, 0 + y, 21, 4 + sw * 3, 22, 10 + sw * 4, 3.4, PAL.hero)
  inkShape(ctx, ellipse(-21, 11 - sw * 4, 3.6, 3.4), PAL.white, 1.6)
  inkShape(ctx, ellipse(22, 11 + sw * 4, 3.6, 3.4), PAL.white, 1.6)
  // face
  pieEye(ctx, -4.5, -9 + y, 3.6, 5.2, 0.5, 0.15, 1.6)
  pieEye(ctx, 6, -9 + y, 3.6, 5.2, 0.5, 0.15, 1.6)
  ctx.beginPath(); ctx.arc(-9, -1 + y, 2.6, 0, TAU); ctx.fillStyle = 'rgba(240,138,116,0.6)'; ctx.fill()
  ctx.beginPath(); ctx.arc(11, -1 + y, 2.6, 0, TAU); ctx.fill()
  ctx.beginPath(); ctx.moveTo(-4, 0 + y); ctx.quadraticCurveTo(1.5, 6 + y, 7, -0.5 + y)
  ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.stroke()
  // a curl of hair
  ctx.beginPath(); ctx.moveTo(0, -21 + y); ctx.bezierCurveTo(2, -27 + y, 7, -25 + y, 5, -22 + y)
  ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.8; ctx.stroke()
}
