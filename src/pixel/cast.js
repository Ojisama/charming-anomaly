// The Magma's four creatures and the player, painted one art pixel at a time, from directly overhead,
// nose to +x (ROSTER_LOOKS' lean turns them to face their heading).
//
// Each is an ALBEDO painting: the CRT pass lights it. What makes each one readable in the dark is
// painted HOT on purpose (emissive in src/pixel/crt.js): the beetle's ember seam and cinders, the
// salamander's molten blotches, the tortoise's lava seams between glass scutes, the drake's belly
// fire. Every body also carries a cool rim on its upper-left edge (Sea of Stars' rim light), so its
// silhouette holds against warm lava.
import { PAL, PixelCanvas, hash } from './canvas.js'

const P = PAL

// ---- cinder beetle ------------------------------------------------------------------------------
// A dung-beetle silhouette: round wing cases split by a glowing seam and freckled with live cinders,
// a broad pronotum, a small head with two hooked mandibles and feelers, six jointed legs.
function paintBeetle(pc, f) {
  const cy = 11
  // legs: three per side, knee out, foot swept; alternating tripods
  const legs = [[14, 1.2], [11, 0], [8, -1.2]]
  legs.forEach(([x, sweep], i) => {
    for (const side of [-1, 1]) {
      const swing = ((i + f + (side > 0 ? 1 : 0)) % 2 ? 1 : -1)
      const kx = x + sweep * 0.6, ky = cy + side * 7
      const fx = x + sweep * 2 + swing, fy = cy + side * 10
      pc.line(x, cy + side * 4, kx, ky, P.bug2)
      pc.line(x + 1, cy + side * 4, kx + 1, ky, P.bug2)
      pc.line(kx, ky, fx, fy, P.bug3)
      pc.set(fx + (sweep >= 0 ? 1 : -1), fy, P.bug3)
    }
  })
  // feelers
  pc.line(20, cy - 2, 22, cy - 5, P.bug2); pc.set(23, cy - 6, P.bug3)
  pc.line(20, cy + 2, 22, cy + 5, P.bug2); pc.set(23, cy + 6, P.bug3)
  // wing cases
  pc.ellipse(9, cy, 7.4, 6.4, P.bug1)
  pc.ellipseOn(8.2, cy - 1.2, 6, 4.6, P.bug2)
  pc.ellipseOn(7, cy - 2.6, 3.4, 2, P.bug3)
  pc.ellipseOn(7, cy + 3.4, 4.8, 2, P.bug2)
  // pronotum + head
  pc.ellipse(16, cy, 2.8, 4.6, P.bug1)
  pc.ellipseOn(15.5, cy - 1, 2, 3, P.bug2)
  pc.set(15, cy - 2, P.bug3)
  pc.ellipse(19.3, cy, 1.8, 2.6, P.bug0)
  // mandibles
  pc.set(21, cy - 2, P.bug2); pc.set(22, cy - 1, P.bug3)
  pc.set(21, cy + 2, P.bug2); pc.set(22, cy + 1, P.bug3)
  // the ember seam down the wing cases, white-hot at its root
  pc.line(2, cy, 14, cy, P.lava1)
  pc.line(6, cy, 13, cy, P.lava2)
  pc.set(13, cy, P.lava4); pc.set(12, cy, P.lava3)
  // live cinders on the wing cases
  for (const [x, y, c] of [[5, cy - 4, P.lava2], [9, cy - 3, P.lava3], [4, cy + 3, P.lava2], [10, cy + 4, P.lava1], [7, cy + 2, P.lava3], [11, cy - 5, P.lava1]]) pc.set(x, y, c)
  pc.outline()
  pc.rim(P.coolRim, [P.bug1, P.bug2, P.bug3])
  // eyes last: they must catch light, over the outline
  pc.set(20, cy - 2, P.eye); pc.set(20, cy + 2, P.eye)
}

// ---- salamander ----------------------------------------------------------------------------------
// A fire salamander: long charcoal body with two rows of molten blotches, a wide flat head with
// bulging eyes, four splayed hands, and a long tail that swings with the walk.
function paintSalamander(pc, f) {
  const cy = 9, s = f ? 1 : -1
  // the tail: a tapering wave from the hips to the tip
  for (let i = 0; i <= 13; i++) {
    const x = 12 - i
    const y = cy + Math.sin(i * 0.38 + (f ? 1.2 : -0.2)) * (i / 13) * 3.2 * s
    const w = 2.8 - i * 0.17
    pc.ellipse(x + 0.5, y + 0.5, 0.9, Math.max(0.55, w), P.sal1)
  }
  // legs: front pair at 22, back pair at 13; diagonal pairs step together
  const leg = (x, side, fwd) => {
    const ex = x + fwd * 2, ey = cy + side * 7
    pc.line(x, cy + side * 3, x + fwd, cy + side * 5, P.sal2)
    pc.line(x + 1, cy + side * 3, x + fwd + 1, cy + side * 5, P.sal2)
    pc.line(x + fwd, cy + side * 5, ex, ey, P.sal2)
    // three toes
    pc.set(ex - 1, ey + side, P.sal3); pc.set(ex + 1, ey + side, P.sal3); pc.set(ex + 1, ey, P.sal3)
  }
  leg(22, -1, s); leg(22, 1, -s); leg(13, -1, -s); leg(13, 1, s)
  // body
  pc.ellipse(18, cy, 8, 4, P.sal1)
  pc.ellipseOn(17.5, cy - 1, 7, 2.4, P.sal2)
  // head: wide and flat
  pc.ellipse(27.5, cy, 4.2, 4, P.sal1)
  pc.ellipseOn(27.2, cy - 1, 3, 2.2, P.sal2)
  pc.set(26, cy - 2, P.sal3)
  // molten blotches, two rows down the back, onto the tail and the crown of the head
  const spots = [[23, cy - 2], [20, cy - 3], [17, cy - 2], [14, cy - 2], [22, cy + 2], [19, cy + 2], [16, cy + 2],
    [11, cy + Math.round(Math.sin(0.38 + (f ? 1.2 : -0.2)) * 0.3 * s)], [7, cy + Math.round(Math.sin(5 * 0.38 + (f ? 1.2 : -0.2)) * (5 / 13) * 3.2 * s)]]
  spots.forEach(([x, y], i) => {
    pc.set(x, y, i % 3 === 0 ? P.lava4 : P.lava3)
    if (i < 7) pc.set(x + 1, y, P.lava2)
  })
  pc.set(28, cy, P.lava3); pc.set(29, cy, P.lava2)
  pc.outline()
  pc.rim(P.coolRim, [P.sal1, P.sal2, P.sal3])
  // bulging eyes on the sides of the head
  pc.set(28, cy - 4, P.eye); pc.set(29, cy - 4, P.eyeHot); pc.set(28, cy - 3, P.eye)
  pc.set(28, cy + 4, P.eye); pc.set(29, cy + 4, P.eyeHot); pc.set(28, cy + 3, P.eye)
  pc.set(31, cy - 1, P.ink); pc.set(31, cy + 1, P.ink)   // nostrils
}

// ---- obsidian tortoise ---------------------------------------------------------------------------
// A domed shell of black volcanic glass broken into hexagonal scutes, with magma glowing in every
// seam; elephant feet at the four corners, a blunt head, a stub of a tail.
const SCUTES = (() => {
  const out = [[15, 15]]
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; out.push([15 + Math.cos(a) * 5.6, 15 + Math.sin(a) * 5.2]) }
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; out.push([15 + Math.cos(a) * 10.4, 15 + Math.sin(a) * 9.6]) }
  return out
})()
function paintTortoise(pc, f) {
  const cx = 15, cy = 15, s = f ? 1 : -1
  // feet: four stumps that step in diagonal pairs, with pale claws
  for (const [fx, fy, k] of [[22, 5, 1], [22, 25, -1], [8, 5, -1], [8, 25, 1]]) {
    const x = fx + k * s
    pc.ellipse(x, fy, 2.8, 2.6, P.ash)
    pc.ellipseOn(x - 0.5, fy - 0.6, 1.8, 1.4, P.ashHi)
    pc.set(x + 2, fy - 1, P.horn); pc.set(x + 2, fy + 1, P.horn)
  }
  // tail
  pc.ellipse(3, cy, 2, 1.3, P.ash)
  // head on its neck
  pc.ellipse(28.3, cy + (f ? 0 : 0), 3.4, 3, P.ash)
  pc.ellipseOn(28, cy - 1, 2.4, 1.6, P.ashHi)
  pc.ellipse(25, cy, 1.6, 2, P.ash)
  // the shell
  pc.ellipse(cx, cy, 11.8, 10.9, P.glass0)
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const dx = (x + 0.5 - cx) / 11.8, dy = (y + 0.5 - cy) / 10.9
    const rr = dx * dx + dy * dy
    if (rr > 1) continue
    if (rr > 0.84) { pc.set(x, y, P.glass1); continue }   // the marginal rim
    let d1 = 1e9, d2 = 1e9, k1 = 0
    SCUTES.forEach(([sx, sy], k) => {
      const d = Math.hypot(x + 0.5 - sx, y + 0.5 - sy)
      if (d < d1) { d2 = d1; d1 = d; k1 = k } else if (d < d2) d2 = d
    })
    if (d2 - d1 < 1.05) { pc.set(x, y, d2 - d1 < 0.45 && hash(x, y, 3) > 0.35 ? P.lava3 : P.lava1); continue }   // magma in the seam
    const [sx, sy] = SCUTES[k1]
    // each scute is a little dome lit from the upper left, with a glassy glint
    const lx = x + 0.5 - sx, ly = y + 0.5 - sy
    const lit = -(lx + ly) / 4 - rr * 0.6
    pc.set(x, y, lit > 0.45 ? P.glass3 : lit > -0.1 ? P.glass2 : lit > -0.7 ? P.glass1 : P.glass0)
    if (Math.round(lx) === -1 && Math.round(ly) === -2 && k1 < 7) pc.set(x, y, P.glassHi)
  }
  pc.set(cx - 3, cy - 6, P.glassWhite); pc.set(cx - 2, cy - 7, P.glassHi)
  pc.outline()
  pc.rim(P.coolRim, [P.glass1, P.glass2, P.ash])
  pc.set(30, cy - 2, P.eye); pc.set(30, cy + 2, P.eye)
}

// ---- fire drake ------------------------------------------------------------------------------------
// A small dragon from above: bat wings spread across its heading (finger bones and membrane), a long
// neck and horned head, a spined back with a fire-lit belly showing, a long tail ending in a spade.
function paintDrake(pc, f) {
  const cy = 16
  const span = f ? 9 : 13          // wings spread, then half-folded on the downstroke
  // wings: a bat's hand seen from above. The arm runs out and forward to the wrist, the fingers fan
  // back from it, and the membrane sags in scallops between them back to the flank.
  for (const side of [-1, 1]) {
    const k = f ? 0.7 : 1
    const Y = (d) => cy + side * d * k
    const sh = [18, cy + side * 3], wrist = [23, Y(8)]
    const tips = [[19, Y(15)], [13, Y(15.5)], [8, Y(12)], [6, Y(6)]]
    const sag = (a, b) => [(a[0] + b[0]) / 2 + 1.2, cy + side * (Math.abs((a[1] + b[1]) / 2 - cy) - 2.2 * k)]
    const outline = [sh, wrist, tips[0], sag(tips[0], tips[1]), tips[1], sag(tips[1], tips[2]), tips[2], sag(tips[2], tips[3]), tips[3], [10, cy + side * 3]]
    pc.poly(outline, P.drkWing1)
    // the inner membrane, darker, and the bones
    pc.poly([sh, wrist, [17, Y(10)], [11, Y(8)], [10, cy + side * 3]], P.drkWing0)
    pc.line(sh[0], sh[1], wrist[0], wrist[1], P.drk2)
    for (const t of tips) pc.line(wrist[0], wrist[1], t[0], t[1], P.drk2)
    pc.set(wrist[0] + 1, wrist[1], P.horn)   // the thumb claw
  }
  // tail: tapering wave to a spade
  for (let i = 0; i <= 8; i++) {
    const x = 10 - i, y = cy + Math.round(Math.sin(i * 0.55 + (f ? 1 : 0)) * (i / 8) * 2)
    pc.ellipse(x + 0.5, y + 0.5, 0.9, Math.max(0.6, 1.8 - i * 0.14), P.drk1)
  }
  const ty = cy + Math.round(Math.sin(8 * 0.55 + (f ? 1 : 0)) * 2)
  pc.tri(0, ty - 2.5, 3, ty + 0.5, 0, ty + 3.5, P.drk2)
  // hind legs tucked under
  pc.ellipse(11.5, cy - 4, 1.4, 1.2, P.drk1); pc.ellipse(11.5, cy + 4, 1.4, 1.2, P.drk1)
  // body
  pc.ellipse(15, cy, 6.5, 4.2, P.drk1)
  pc.ellipseOn(14.6, cy - 1, 5.4, 2.6, P.drk2)
  pc.ellipseOn(13.6, cy - 2, 2.6, 1, P.drk3)
  // neck + head: a long wedge with jaws
  pc.ellipse(21.5, cy, 2.4, 1.7, P.drk1)
  pc.ellipse(26.5, cy, 3.9, 3.5, P.drk0)
  pc.ellipseOn(26.3, cy - 0.5, 3.2, 2.7, P.drk1)
  pc.ellipseOn(26, cy - 1.2, 2.2, 1.4, P.drk2)
  pc.rect(29, cy - 1, 3, 3, P.drk2)
  pc.set(31, cy - 1, P.drk1); pc.set(31, cy + 1, P.drk1)
  pc.set(25, cy - 2, P.drk3); pc.set(26, cy - 2, P.drk3)
  // horns swept back off the brow
  pc.line(25, cy - 3, 21, cy - 6, P.horn); pc.set(21, cy - 6, P.hornLo); pc.set(20, cy - 7, P.hornLo)
  pc.line(25, cy + 3, 21, cy + 6, P.horn); pc.set(21, cy + 6, P.hornLo); pc.set(20, cy + 7, P.hornLo)
  // the fire in its belly showing between the spines, and the spines
  pc.line(9, cy, 21, cy, P.lava2)
  pc.line(12, cy, 18, cy, P.lava3)
  pc.set(15, cy, P.lava4); pc.set(16, cy, P.lava4)
  for (const x of [10, 13, 16, 19]) pc.set(x, cy - 1, P.horn)
  pc.outline()
  pc.set(27, cy - 2, P.eye); pc.set(27, cy + 2, P.eye); pc.set(28, cy - 2, P.eyeHot); pc.set(28, cy + 2, P.eyeHot)
  pc.set(32, cy - 1, P.lava3); pc.set(32, cy + 1, P.lava3)   // smouldering nostrils
}

// `scale` (default 1) bakes a body at other than one art pixel per PX, so that at the radius it is
// actually shown its art pixels land on the chapter's grid: the drake (always an elite, drawn large
// by render.js) is baked smaller, the small swarming beetle a little larger.
// paint(pc, frame) draws one frame. `frames` is how many a walk cycle has; `crown` is [top, r] for the
// elite crown in WORLD px relative to the centre, like the macro cast's; `light` is the glow the body
// throws on the floor around it [radius as a multiple of the body's radius, colour, strength].
export const PIXEL_CAST = {
  cinderBeetle: { w: 25, h: 23, frames: 2, scale: 1.25, crown: [-28, 10], light: [3, 0xff7a30, 0.6], paint: paintBeetle },
  salamander: { w: 33, h: 19, frames: 2, crown: [-18, 8], light: [3.4, 0xff8a30, 0.6], paint: paintSalamander },
  obsidianTortoise: { w: 33, h: 31, frames: 2, crown: [-34, 12], light: [2.4, 0xff6a28, 0.6], paint: paintTortoise },
  fireDrake: { w: 33, h: 33, frames: 2, scale: 0.7, crown: [-20, 9], light: [3.2, 0xff7a28, 0.65], paint: paintDrake },
}

// ---- the player ----------------------------------------------------------------------------------
// The mint blob every chapter's player is, as pixel art: shaded dome, cool rim, big eyes, blush.
export function paintPlayer(pc, f) {
  const cx = 9, cy = 9.5
  const ry = f ? 7 : 7.6, rx = f ? 8.2 : 7.6
  pc.ellipse(cx, cy, rx, ry, P.mintLo)
  pc.ellipseOn(cx - 0.4, cy - 0.6, rx - 1, ry - 1.2, P.mintMid)
  pc.ellipseOn(cx - 0.8, cy - 1.4, rx - 2.2, ry - 2.6, P.mint)
  pc.ellipseOn(cx - 2.6, cy - 3.6, 2.4, 1.5, P.mintHi)
  pc.set(cx - 4, cy - 2, P.mintHi)
  // eyes
  pc.rect(cx + 1, cy - 2, 2, 3, P.white); pc.rect(cx - 4, cy - 2, 2, 3, P.white)
  pc.rect(cx + 2, cy - 1, 1, 2, P.pupil); pc.rect(cx - 3, cy - 1, 1, 2, P.pupil)
  pc.set(cx + 1, cy - 2, P.white)
  pc.set(cx - 5, cy + 2, P.blush); pc.set(cx - 6, cy + 2, P.blush)
  pc.set(cx + 4, cy + 2, P.blush); pc.set(cx + 3, cy + 2, P.blush)
  pc.set(cx - 1, cy + 2, P.mintDeep); pc.set(cx, cy + 3, P.mintDeep); pc.set(cx + 1, cy + 2, P.mintDeep)   // smile
  pc.outline(P.mintDeep)
  pc.outline(P.ink)
}
export const PLAYER_ART = [19, 19]

// One creature frame -> PixelCanvas
export function paintCreature(id, frame) {
  const M = PIXEL_CAST[id]
  const pc = new PixelCanvas(M.w, M.h)
  M.paint(pc, frame)
  return pc
}
