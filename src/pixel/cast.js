// The Magma's four creatures and the player, painted one art pixel at a time, from directly overhead,
// nose to +x (ROSTER_LOOKS' lean turns them to face their heading).
//
// SIMPLE SHAPES, FEW COLOURS, BOLD SILHOUETTES: each body is a flat base, one shade, one highlight and
// an ink outline. The light is not painted in: the CRT pass (src/pixel/crt.js) lights each body from
// the side facing the lava and gives every outline a faint cool rim in the dark. What keeps a body
// readable far from any lava is painted HOT on purpose (emissive): its eyes, and ONE mark of its own —
// the beetle's two cinders, the salamander's yellow blotches, the tortoise's glowing seams, the
// drake's belly fire.
import { PAL, PixelCanvas } from './canvas.js'

const P = PAL

// ---- cinder beetle ------------------------------------------------------------------------------
// Two wing cases split down the middle, a pronotum, a small head with pincers, six legs.
function paintBeetle(pc, f) {
  const cy = 10
  // legs: three per side, knee out, foot swept; alternating tripods
  ;[[7, -1], [10, 0], [13, 1]].forEach(([x, sweep], i) => {
    for (const side of [-1, 1]) {
      const swing = (i + f + (side > 0 ? 1 : 0)) % 2 ? 1 : -1
      const kx = x + sweep, ky = cy + side * 7
      pc.line(x, cy + side * 4, kx, ky, P.bt1)
      pc.line(kx, ky, kx + sweep + swing, cy + side * 9, P.bt1)
    }
  })
  // wing cases: one round shell, a highlight band on each case, the split between them
  pc.ellipse(8, cy, 7, 6, P.bt1)
  pc.ellipseOn(7.5, cy - 2.6, 5, 1.7, P.bt2)
  pc.ellipseOn(7.5, cy + 2.6, 5, 1.7, P.bt2)
  pc.line(1, cy, 14, cy, P.ink)
  // pronotum + head
  pc.ellipse(15.5, cy, 2.6, 4.4, P.bt0)
  pc.ellipse(19, cy, 2, 2.6, P.bt0)
  // pincers
  pc.set(21, cy - 2, P.bt2); pc.set(22, cy - 1, P.bt2)
  pc.set(21, cy + 2, P.bt2); pc.set(22, cy + 1, P.bt2)
  // its two cinders, at the tail end of the cases
  pc.set(3, cy - 2, P.lava3); pc.set(3, cy + 2, P.lava3)
  pc.outline()
  pc.set(19, cy - 2, P.eye); pc.set(19, cy + 2, P.eye)
}

// ---- salamander ----------------------------------------------------------------------------------
// Long black body with yellow blotches, a wide flat head, four splayed legs, a long swinging tail.
function paintSalamander(pc, f) {
  const cy = 8, s = f ? 1 : -1
  const tailY = (i) => cy + Math.sin(i * 0.4 + (f ? 1.2 : -0.2)) * (i / 12) * 3 * s
  for (let i = 0; i <= 12; i++) pc.ellipse(11.5 - i, tailY(i) + 0.5, 0.9, Math.max(0.6, 2.3 - i * 0.15), P.sl1)
  // legs: front pair at 21, back pair at 12; diagonal pairs step together
  const leg = (x, side, fwd) => {
    const ex = x + fwd * 2, ey = cy + side * 6
    pc.line(x, cy + side * 2, x + fwd, cy + side * 4, P.sl1)
    pc.line(x + 1, cy + side * 2, x + fwd + 1, cy + side * 4, P.sl1)
    pc.line(x + fwd, cy + side * 4, ex, ey, P.sl1)
    pc.set(ex - 1, ey + side, P.sl1); pc.set(ex + 1, ey + side, P.sl1)
  }
  leg(21, -1, s); leg(21, 1, -s); leg(12, -1, -s); leg(12, 1, s)
  pc.ellipse(16.5, cy, 7.5, 3.2, P.sl1)
  pc.ellipse(25.5, cy, 3.8, 3.6, P.sl1)
  pc.ellipseOn(16.5, cy + 1.6, 7, 1.2, P.sl0)          // the belly side in shade
  // blotches: bold, two rows, one on the head and one down the tail
  for (const [x, y] of [[13, cy - 1], [17, cy - 2], [21, cy - 1], [15, cy + 1], [19, cy + 1], [26, cy - 1]]) {
    pc.set(x, y, P.slSpot); pc.set(x + 1, y, P.slSpot)
  }
  pc.set(7, Math.floor(tailY(5) + 0.5), P.slSpot)
  pc.outline()
  // bulging eyes on the sides of the head
  pc.set(26, cy - 4, P.eye); pc.set(27, cy - 4, P.eye)
  pc.set(26, cy + 4, P.eye); pc.set(27, cy + 4, P.eye)
}

// ---- obsidian tortoise ---------------------------------------------------------------------------
// A domed shell of black glass split into a central plate and six around it, magma glowing in the
// seams; four stumpy legs, a blunt head, a stub of a tail.
function paintTortoise(pc, f) {
  const cx = 14, cy = 14, s = f ? 1 : -1
  for (const [fx, fy, k] of [[21, 4, 1], [21, 24, -1], [7, 4, -1], [7, 24, 1]]) {
    const x = fx + k * s
    pc.ellipse(x, fy, 3.2, 3, P.sk0)
    pc.ellipseOn(x - 0.6, fy - 0.6, 1.8, 1.5, P.sk1)
  }
  pc.ellipse(2.5, cy, 2, 1.3, P.sk0)
  pc.ellipse(23.5, cy, 1.8, 2.2, P.sk0)
  pc.ellipse(27, cy, 3.2, 3, P.sk0)
  pc.ellipseOn(26.6, cy - 0.8, 2, 1.4, P.sk1)
  // the shell: a high dome, its plates laid out like a real tortoise's — a row of three down the
  // spine, two either side, a ring of marginals round the edge — the seams glowing with magma
  pc.ellipse(cx, cy, 11, 10, P.glass0)
  pc.ellipseOn(cx, cy, 9.4, 8.4, P.glass1)
  pc.ellipseOn(cx - 2, cy - 2, 5, 3.6, P.glass2)
  const seam = P.lava1
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const dx = (x + 0.5 - cx) / 9.4, dy = (y + 0.5 - cy) / 8.4
    const r = dx * dx + dy * dy
    if (r > 1 || r < 0.84) continue
    pc.set(x, y, seam)                                    // the marginal ring
  }
  pc.line(cx - 6, cy - 3, cx + 6, cy - 3, seam); pc.line(cx - 6, cy + 3, cx + 6, cy + 3, seam)   // spine row
  pc.line(cx - 2, cy - 3, cx - 2, cy + 3, seam); pc.line(cx + 2, cy - 3, cx + 2, cy + 3, seam)   // its plates
  pc.line(cx, cy - 3, cx, cy - 8, seam); pc.line(cx, cy + 3, cx, cy + 8, seam)                   // the costals
  pc.outline()
  pc.set(28, cy - 2, P.eye); pc.set(28, cy + 2, P.eye)
}

// ---- fire drake ------------------------------------------------------------------------------------
// A small dragon from above: bat wings spread across its heading, a long neck and horned head, a fire
// glowing down its spine, a long tail ending in a spade.
function paintDrake(pc, f) {
  const cy = 17
  const k = f ? 0.72 : 1            // wings spread, then half-folded on the downstroke
  for (const side of [-1, 1]) {
    const Y = (d) => cy + side * d * k
    const sh = [17, cy + side * 3], wrist = [21, Y(9)]
    const tips = [[16, Y(16)], [10, Y(14)], [6, Y(9)]]
    const sag = (a, b) => [(a[0] + b[0]) / 2 + 1.5, cy + side * (Math.abs((a[1] + b[1]) / 2 - cy) - 2.4 * k)]
    // the membrane, in two scallops, back to the flank
    pc.poly([sh, wrist, tips[0], sag(tips[0], tips[1]), tips[1], sag(tips[1], tips[2]), tips[2], [11, cy + side * 3]], P.wing1)
    // the arm and three finger bones, bright, so the wing reads as a wing
    pc.line(sh[0], sh[1], wrist[0], wrist[1], P.dr2)
    for (const t of tips) pc.line(wrist[0], wrist[1], t[0], t[1], P.dr2)
    pc.set(wrist[0] + 1, wrist[1], P.horn)
  }
  // tail: a tapering wave to a spade
  const ty = (i) => cy + Math.round(Math.sin(i * 0.55 + (f ? 1 : 0)) * (i / 8) * 2)
  for (let i = 0; i <= 8; i++) pc.ellipse(10.5 - i, ty(i) + 0.5, 0.9, Math.max(0.6, 1.7 - i * 0.13), P.dr1)
  pc.tri(0, ty(8) - 2.5, 3, ty(8) + 0.5, 0, ty(8) + 3.5, P.dr1)
  // body, a long neck, the head
  pc.ellipse(14.5, cy, 5.5, 3.6, P.dr1)
  pc.ellipseOn(14, cy - 1, 4.4, 1.6, P.dr2)
  pc.rect(19, cy - 1, 5, 3, P.dr1)
  pc.ellipse(26, cy, 3, 2.8, P.dr1)
  pc.ellipseOn(25.6, cy - 0.8, 1.8, 1.1, P.dr2)
  pc.rect(28, cy - 1, 3, 3, P.dr1)
  // two short horns swept back off the brow
  pc.set(24, cy - 3, P.horn); pc.set(23, cy - 4, P.horn)
  pc.set(24, cy + 3, P.horn); pc.set(23, cy + 4, P.horn)
  // the fire down its spine
  pc.line(9, cy, 18, cy, P.lava2)
  pc.line(12, cy, 16, cy, P.lava3)
  pc.outline()
  pc.set(26, cy - 2, P.eye); pc.set(26, cy + 2, P.eye)
}

// `scale` bakes a body at other than one art pixel per PX, chosen so that at the radius it is shown
// in play (render.js draws it at e.radius / archetype radius) its art pixels land on the chapter's
// grid: the beetle (0.9 x a normal) a touch up, the drake (always an elite fast: 1.875 x) about half.
// paint(pc, frame) draws one frame. `frames` is how many a walk cycle has; `crown` is [top, r] for the
// elite crown in WORLD px relative to the centre; `light` is the glow the body throws on the floor
// around it [radius as a multiple of the body's radius, colour, strength]. `baseR` is the radius of
// its archetype (render.js's ROSTER_BASE_R): the body is drawn at e.radius / baseR.
export const PIXEL_CAST = {
  cinderBeetle: { baseR: 16, w: 24, h: 21, frames: 2, scale: 1.2, crown: [-24, 9], light: [2.4, 0xff8a40, 0.5], paint: paintBeetle },
  salamander: { baseR: 12, w: 32, h: 17, frames: 2, crown: [-18, 8], light: [2.6, 0xffb848, 0.55], paint: paintSalamander },
  obsidianTortoise: { baseR: 26, w: 31, h: 29, frames: 2, scale: 1, crown: [-34, 12], light: [2.2, 0xff7030, 0.55], paint: paintTortoise },
  fireDrake: { baseR: 12, w: 33, h: 35, frames: 2, scale: 0.5, crown: [-20, 9], light: [3, 0xff7a28, 0.6], paint: paintDrake },
}

// ---- the player ----------------------------------------------------------------------------------
// The mint blob every chapter's player is, as pixel art: a dome in three tones, big eyes, blush.
export function paintPlayer(pc, f) {
  const cx = 9, cy = 9.5
  const ry = f ? 7 : 7.6, rx = f ? 8.2 : 7.6
  pc.ellipse(cx, cy, rx, ry, P.mintLo)
  pc.ellipseOn(cx - 0.6, cy - 1, rx - 1.4, ry - 1.6, P.mint)
  pc.ellipseOn(cx - 2.6, cy - 3.6, 2.2, 1.3, P.mintHi)
  pc.rect(cx + 1, cy - 2, 2, 3, P.white); pc.rect(cx - 4, cy - 2, 2, 3, P.white)
  pc.rect(cx + 2, cy - 1, 1, 2, P.pupil); pc.rect(cx - 3, cy - 1, 1, 2, P.pupil)
  pc.set(cx - 5, cy + 2, P.blush); pc.set(cx + 4, cy + 2, P.blush)
  pc.set(cx - 1, cy + 2, P.mintDeep); pc.set(cx, cy + 3, P.mintDeep); pc.set(cx + 1, cy + 2, P.mintDeep)
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
