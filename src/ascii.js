// THE MINE, AS TYPOGRAPHIC SCULPTURE (CHAPTERS.mine.render.ascii). Render-only, like macro.js and
// holo.js: it reads `run`, never writes it, and nothing in sim.js knows it exists.
//
// EVERY VISUAL OF THE MINE IS DECIDED IN THIS FILE (and in src/ascii/*, if it grows). render.js only
// calls in while CHAPTERS[run.chapter].render.ascii is set and draws nothing of the chapter's own.
//
// ==== THE SURFACE render.js USES ===================================================================
//
//   ASCII_CAST                { [rosterId]: entry } — the creatures this module draws.
//   bakeCreature(id, elite)   -> { frames: [{ canvas, white, ax, ay, res }], baseR, upright, lean,
//                             poseOf, faceDir, turnRate } — painted ONCE at boot (render.js's enemy
//                             pool and scripts/bake-cast.mjs). In the mine itself the pool is hidden
//                             and the creatures are composed live, glyph by glyph, in sync().
//   paintHazard(src)          -> canvas | null — the summary's damage-recap thumbnail ('firedamp').
//   createAsciiRenderer(host) -> renderer { hide, enter, exit, sync, event, filters }
//     host = { app, world, under, over, screen }   (see render.js's syncAscii)
//
// What the sim publishes for this chapter (state.js's doc block is the authority): run.gas, run.gasLit,
// run.booms, run.sticks, run.carts, run.lanternR, run.bullets (weapon 'chip'), and the events
// gasBlast / pickaxe / dynamite / kill.
//
// THE LOOK. Every creature is an ASCII-art illustration freed from the grid: a few soft ellipsoids
// (body, head, fists, abdomen) are packed with glyphs at authored body-relative positions, and each
// glyph is SHADED LIVE by the player's lamp — the surface normal at that glyph against the direction
// to the player picks the character from a density ramp ('@%#*+=:-.'), its size, colour and alpha.
// Lit flanks are dense heavy glyphs, the far side frays into dots. Legs, tails, whiskers, picks and
// cracks are strokes: glyphs laid along a segment, chosen by the segment's on-screen angle
// ('-' '\' '|' '/') so a leg is drawn the way an ASCII artist would draw it. Light on the floor is
// character density and warmth, never a fill. Darkness is black.
import { CanvasSource, Container, Graphics, Particle, ParticleContainer, Rectangle, RenderTexture, Sprite, Texture } from 'pixi.js'
import { PACER_RADIUS, SHIELD_HP_FRAC } from './config.js'

// ---- glyph atlas -------------------------------------------------------------------------------
// One canvas, one texture source: every glyph sprite in the mine batches into the same draw call.
const FONTS = [
  'bold 44px Georgia, "Noto Serif", "DejaVu Serif", "Times New Roman", serif',
  '44px Georgia, "Noto Serif", "DejaVu Serif", "Times New Roman", serif',
  'bold 44px "DejaVu Sans Mono", Menlo, Consolas, "Courier New", monospace',
]
const EM = 44, CELL = 64, ATLAS = 2048
const mkCanvas = (w, h) => {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h))
  return c
}
let atlas = null
function getAtlas() {
  if (atlas) return atlas
  const canvas = mkCanvas(ATLAS, ATLAS)
  const ctx = canvas.getContext('2d')
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  atlas = { canvas, ctx, source: new CanvasSource({ resource: canvas }), map: new Map(), n: 0, dirty: false }
  return atlas
}
// glow = the same glyph, blurred and translucent (drawn additively BEHIND the crisp one)
// per (font, glow) a plain object keyed by the character: thousands of lookups a frame, no string building
const texFast = [{}, {}, {}, {}, {}, {}]
function glyphTex(ch, font = 0, glow = false) {
  const F = texFast[font * 2 + (glow ? 1 : 0)]
  const hit = F[ch]
  if (hit) return hit
  return (F[ch] = glyphTexSlow(ch, font, glow))
}
function glyphTexSlow(ch, font, glow) {
  const A = getAtlas()
  const key = ch + '|' + font + (glow ? 'g' : '')
  let t = A.map.get(key)
  if (t) return t
  const per = ATLAS / CELL
  if (A.n >= per * per) return A.map.values().next().value
  const cx = (A.n % per) * CELL, cy = Math.floor(A.n / per) * CELL
  A.n++
  const x = A.ctx
  x.save()
  x.beginPath(); x.rect(cx, cy, CELL, CELL); x.clip()
  x.font = FONTS[font]
  x.fillStyle = '#fff'
  if (glow) {
    // only the blurred shadow lands in the cell: the glyph itself is drawn far off to the left
    x.shadowColor = 'rgba(255,255,255,0.9)'; x.shadowBlur = 9; x.shadowOffsetX = 4000
    x.fillText(ch, cx + CELL / 2 - 4000, cy + CELL / 2)
    x.fillText(ch, cx + CELL / 2 - 4000, cy + CELL / 2)
  } else {
    x.fillText(ch, cx + CELL / 2, cy + CELL / 2)
  }
  x.restore()
  t = new Texture({ source: A.source, frame: new Rectangle(cx, cy, CELL, CELL) })
  A.map.set(key, t)
  A.dirty = true
  return t
}

// Immediate-mode glyph batch: begin(), put() as many glyphs as this frame needs, end() drops the rest.
// Particles, not Sprites: thousands of glyphs a frame, and a Sprite pays a transform, a scene-graph
// update and a colour parse for each. Two ParticleContainers per batch — the normal glyphs, then the
// additive ones (glows, sparks, eyes) over them — since one container has one blend mode.
const PC_PROPS = { position: true, rotation: true, vertex: true, color: true, uvs: true }
function makeBatch(parent) {
  const tex0 = glyphTex('.', 0)
  const side = (blendMode) => {
    const pc = new ParticleContainer({ dynamicProperties: PC_PROPS, texture: tex0 })
    pc.blendMode = blendMode
    parent.addChild(pc)
    return { pc, pool: [], n: 0 }
  }
  const N = side('normal'), A = side('add')
  const fin = (S) => {
    const kids = S.pc.particleChildren
    if (kids.length !== S.n) { kids.length = 0; for (let i = 0; i < S.n; i++) kids.push(S.pool[i]); S.pc.update() }
    S.n = 0
  }
  return {
    begin() { N.n = 0; A.n = 0 },
    put(ch, x, y, color, alpha = 1, size = 16, rot = 0, add = false, font = 0, glow = false) {
      if (alpha <= 0.01) return
      const S = add ? A : N
      let p = S.pool[S.n]
      if (!p) { p = new Particle({ texture: tex0, anchorX: 0.5, anchorY: 0.5 }); S.pool.push(p) }
      S.n++
      p.texture = glyphTex(ch, font, glow)
      p.x = x; p.y = y
      p.scaleX = p.scaleY = size / EM
      p.rotation = rot
      // Particle's own tint/alpha setters parse a Color each call; write the packed bgr + alpha directly
      p.color = (((color & 0xff) << 16) | (color & 0xff00) | ((color >> 16) & 0xff)) + (((alpha > 1 ? 1 : alpha) * 255 | 0) << 24)
    },
    end() { fin(N); fin(A) },
    clear() { N.n = 0; A.n = 0; fin(N); fin(A) },
  }
}

// ---- small maths -------------------------------------------------------------------------------
const lerp = (a, b, k) => a + (b - a) * k
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
function mixHex(a, b, k) {
  k = clamp01(k)
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, k))
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, k))
  const bl = Math.round(lerp(a & 255, b & 255, k))
  return (r << 16) | (g << 8) | bl
}
function ramp3(a, b, c, k) { return k < 0.5 ? mixHex(a, b, k * 2) : mixHex(b, c, k * 2 - 1) }
const hash2 = (i, j, s = 0) => {
  let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
function vnoise(x, y, s) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  return lerp(lerp(hash2(i, j, s), hash2(i + 1, j, s), ux), lerp(hash2(i, j + 1, s), hash2(i + 1, j + 1, s), ux), uy)
}
const TAU = Math.PI * 2
const VIS = 2.0    // creatures are drawn well larger than their hit body: a galaxy of glyphs needs room to read on a phone

// ---- materials: a density ramp of characters (lit -> shadow) and a colour ramp ------------------
const MAT = {
  fur:   { chars: ['@', '%', '#', '&', '*', '+', '=', ':', ',', '.'], dark: 0x6a4428, mid: 0xc8945c, lit: 0xf6d09a },
  pink:  { chars: ['~', '~', '-', '-', '.', '.'], dark: 0x6a3a34, mid: 0xd08a7c, lit: 0xffc8b8 },
  chit:  { chars: ['@', '0', 'O', 'Q', 'o', '°', ':', '.'], dark: 0x4a2470, mid: 0xa060e8, lit: 0xeed2ff },
  scale: { chars: ['M', 'W', '&', 'w', 'v', 'v', ',', '.'], dark: 0x2c4a14, mid: 0x7cc038, lit: 0xe0f890 },
  brass: { chars: ['@', 'O', 'O', 'o', 'o', '°', '.'], dark: 0x7a3c08, mid: 0xf08a24, lit: 0xffd890 },
  stone: { chars: ['#', '@', '&', '%', 'X', 'x', '=', '-', '.'], dark: 0x2e3a4c, mid: 0x6e82a0, lit: 0xb8cae4 },
  wool:  { chars: ['@', 'M', 'W', '#', '%', '*', '+', ':', '.'], dark: 0x2a2620, mid: 0x9a8c76, lit: 0xfff6e2 },
}

// ---- creature tables (body-relative px, facing +x, for a body of radius baseR) ------------------
// ellipsoid parts: [cx, cy, rx, ry, material, spacing, glyph size, heightScale]
// The point packing is authored once (a jittered hex lattice inside each ellipse, with its normal).
function packEllipsoid(cx, cy, rx, ry, sp, seed) {
  const pts = []
  const rowH = sp * 0.86
  let row = 0
  for (let y = -ry; y <= ry + 0.01; y += rowH, row++) {
    for (let x = -rx + (row % 2 ? sp / 2 : 0); x <= rx + 0.01; x += sp) {
      const jx = x + (hash2(row, Math.round(x * 7), seed) - 0.5) * sp * 0.45
      const jy = y + (hash2(row, Math.round(x * 7), seed + 1) - 0.5) * sp * 0.45
      const u = jx / rx, v = jy / ry, d = u * u + v * v
      if (d > 1.02) continue
      const nz = Math.sqrt(Math.max(0, 1 - d))
      pts.push({ x: cx + jx, y: cy + jy, nx: u, ny: v, nz, rot: (hash2(row, Math.round(x * 13), seed + 2) - 0.5) * 0.3, h: hash2(row, Math.round(x * 5), seed + 3) })
    }
  }
  // shade far side first, lit side on top: sort by the glyph's height so the dome reads
  pts.sort((a, b) => a.nz - b.nz)
  return pts
}
function part(cx, cy, rx, ry, mat, sp, size, seed) {
  return { cx, cy, rx, ry, mat: MAT[mat], size, pts: packEllipsoid(cx, cy, rx, ry, sp, seed) }
}

const CAST = {
  mineRat: {
    baseR: 12,
    parts: [part(-2, 0, 13, 8.5, 'fur', 3.3, 7, 11), part(11, 0, 6, 4.8, 'fur', 3, 6, 12)],
  },
  caveSpider: {
    baseR: 13,
    parts: [part(-7, 0, 10, 8.5, 'chit', 3.3, 7, 21), part(6, 0, 5.5, 4.5, 'chit', 3, 6, 22)],
  },
  kobold: {
    baseR: 22,
    parts: [part(-3, 0, 14, 10, 'scale', 3.7, 7.5, 31), part(12, 0, 7.5, 7, 'brass', 3.4, 7, 32)],
  },
  golem: {
    baseR: 28,
    parts: [part(-2, 0, 24, 22, 'stone', 5, 10, 41), part(13, -25, 9, 8, 'stone', 4.2, 8.5, 42), part(13, 25, 9, 8, 'stone', 4.2, 8.5, 43)],
  },
}
const PLAYER_LOOK = {
  baseR: 14,
  parts: [part(-3, 0, 8, 14, 'wool', 4.8, 8, 51)],
}

// ---- the composer: one creature -> a list of placed glyphs --------------------------------------
// out(ch, x, y, colour, alpha, size, rot, add, font, glow). Everything is in WORLD px.
const STROKE_CH = ['-', '\\', '|', '/']
function strokeGlyph(a) {
  // screen angle of a segment -> the character that draws it, and the leftover rotation
  let t = ((a % Math.PI) + Math.PI) % Math.PI
  const k = Math.round(t / (Math.PI / 4)) % 4
  return [STROKE_CH[k], t - k * (Math.PI / 4)]
}
function shadeIdx(mat, I) { return Math.min(mat.chars.length - 1, Math.max(0, Math.floor((1 - I) * mat.chars.length))) }
function matColor(mat, I) { return ramp3(mat.dark, mat.mid, mat.lit, I) }

// lx, ly: unit direction from the body to the lamp, in BODY space; reach 0..1 how lit it is
function shadeParts(out, look, X, Y, cos, sin, sc, lx, ly, reach, flash, sizeMul = 1) {
  const L = Math.hypot(lx * 0.8, ly * 0.8, 0.6) || 1
  const L2 = Math.hypot(lx, ly, 0.45) || 1
  const Lx = lx / L2, Ly = ly / L2, Lz = 0.45 / L2
  // every creature carries a little of its own light, so it reads even at the edge of the lamp
  const amb = 0.38 + 0.08 * (1 - reach)
  let gi = 0
  for (const P of look.parts) {
    const m = P.mat
    for (const q of P.pts) {
      const nd = q.nx * Lx + q.ny * Ly + q.nz * Lz
      let I = amb + Math.max(0, nd) * (0.35 + 0.45 * reach) + (q.h - 0.5) * 0.16 - (1 - q.nz) * 0.1
      I = clamp01(I)
      const ch = m.chars[shadeIdx(m, I)]
      const wx = X + (q.x * cos - q.y * sin) * sc, wy = Y + (q.x * sin + q.y * cos) * sc
      let col = matColor(m, I)
      if (flash > 0) col = mixHex(col, 0xffffff, flash)
      const sz = P.size * sc * (0.7 + 0.5 * I) * sizeMul
      out(ch, wx, wy, col, 0.5 + 0.5 * I, sz, q.rot, false, 2, false)
      // the brightest glyphs of the dome breathe a faint glow of their own colour
      if (I > 0.7 && (gi++ % 3) === 0) out(ch, wx, wy, matColor(m, 1), 0.12 * I, sz * 1.4, q.rot, true, 0, true)
    }
  }
}
// a stroke in body space from (ax,ay) to (bx,by): glyphs chosen by on-screen angle, tapering
function stroke(out, X, Y, cos, sin, sc, ax, ay, bx, by, s0, s1, c0, c1, a0, a1, step = 3.2) {
  const wax = X + (ax * cos - ay * sin) * sc, way = Y + (ax * sin + ay * cos) * sc
  const wbx = X + (bx * cos - by * sin) * sc, wby = Y + (bx * sin + by * cos) * sc
  const len = Math.hypot(wbx - wax, wby - way)
  const n = Math.max(1, Math.round(len / (step * sc)))
  const [ch, r] = strokeGlyph(Math.atan2(wby - way, wbx - wax))
  for (let i = 0; i <= n; i++) {
    const k = i / n
    out(ch, lerp(wax, wbx, k), lerp(way, wby, k), mixHex(c0, c1, k), lerp(a0, a1, k), lerp(s0, s1, k) * sc, r, false, 0, false)
  }
}
const at = (X, Y, cos, sin, sc, x, y) => [X + (x * cos - y * sin) * sc, Y + (x * sin + y * cos) * sc]

// st = { phase (stride, rad), sway, pose ('walk'|'aim'|'leap'|'land'), aimK 0..1, t (clock) }
function composeCreature(out, id, X, Y, heading, sc, lx, ly, reach, flash, st, elite) {
  const look = CAST[id]
  const cos = Math.cos(heading), sin = Math.sin(heading)
  const ph = st.phase, t = st.t
  const lit = 0.4 + 0.6 * reach
  if (id === 'mineRat') {
    // tail: a long tapering S of '~' '-' '.', swaying from the root
    // a long whip of a tail: '~' at the root fraying to '-' and '.', sweeping in an S
    let px = -14, py = 0
    const n = 22
    for (let i = 1; i <= n; i++) {
      const k = i / n
      const x = -14 - k * 40, y = Math.sin(t * 5 + ph * 0.5 - k * 4) * 8 * k
      const ch = k < 0.3 ? '~' : k < 0.7 ? '-' : '.'
      const [wx, wy] = at(X, Y, cos, sin, sc, x, y)
      out(ch, wx, wy, mixHex(MAT.pink.lit, MAT.pink.mid, k), (0.95 - k * 0.45) * (0.6 + 0.4 * lit), (7 - k * 3) * sc, Math.atan2(y - py, x - px) + heading, false, 0, false)
      px = x; py = y
    }
    // feet scurrying
    for (const [fx, fy, o] of [[7, 8, 0], [7, -8, Math.PI], [-9, 8, Math.PI], [-9, -8, 0]]) {
      const [wx, wy] = at(X, Y, cos, sin, sc, fx + Math.sin(ph + o) * 3, fy * (1 + 0.1 * Math.cos(ph + o)))
      out(',', wx, wy, MAT.pink.lit, 0.8, 5.5 * sc, heading, false, 0, false)
    }
    shadeParts(out, look, X, Y, cos, sin, sc, lx, ly, reach, flash)
    // ears, snout, eyes, whiskers
    for (const s of [-1, 1]) {
      let [wx, wy] = at(X, Y, cos, sin, sc, 9, 6 * s)
      out('o', wx, wy, MAT.pink.lit, 0.95, 5.5 * sc, heading, false, 0, false)
      ;[wx, wy] = at(X, Y, cos, sin, sc, 14, 2.6 * s)
      out('•', wx, wy, 0xff5a40, 1, 4 * sc, 0, true, 0, false)
      out('•', wx, wy, 0xff2010, 0.85, 9 * sc, 0, true, 0, true)
      out('·', wx, wy, 0xffffff, 0.9, 3 * sc, 0, true, 0, false)
      stroke(out, X, Y, cos, sin, sc, 18, 1.5 * s, 26, (6 + Math.sin(t * 9) * 0.8) * s, 3, 2, 0xffecd0, 0x8a7a64, 0.9, 0.3, 2)
    }
    const [sx, sy] = at(X, Y, cos, sin, sc, 18, 0)
    out('·', sx, sy, MAT.pink.lit, 0.95, 7 * sc, 0, false, 0, false)
  } else if (id === 'caveSpider') {
    // eight jointed legs of '/' '\' '|', tapering; drawn in during the aim, flung back on the leap
    const curl = st.pose === 'aim' ? 0.45 + 0.1 * Math.sin(t * 40) * st.aimK : st.pose === 'leap' ? -0.35 : st.pose === 'land' ? 0.15 : 0
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const swing = st.pose === 'walk' ? Math.sin(ph + i * Math.PI / 2 + (s > 0 ? Math.PI : 0)) * 0.28 : 0
        const base = Math.PI / 2 - (1.5 - i) * 0.62 + swing + curl * (i < 2 ? -0.5 : 0.5)
        const th = s > 0 ? base : -base
        const L1 = 12 * (1 - Math.abs(curl) * 0.35), L2 = 14 * (1 - Math.max(0, curl) * 0.5)
        const rx = 5 - i * 2.4, ry = 2.5 * s
        const kx = rx + Math.cos(th) * L1, ky = ry + Math.sin(th) * L1
        const th2 = th - s * (1.5 - i) * 0.3 + s * 0.35
        const fx = kx + Math.cos(th2) * L2, fy = ky + Math.sin(th2) * L2
        stroke(out, X, Y, cos, sin, sc, rx, ry, kx, ky, 5, 4.2, 0xb47ae8, 0xdcb8ff, 0.95, 0.95, 1.9)
        const [jx, jy] = at(X, Y, cos, sin, sc, kx, ky)
        out('°', jx, jy, 0xf4e4ff, 0.95, 4 * sc, 0, true, 0, false)
        stroke(out, X, Y, cos, sin, sc, kx, ky, fx, fy, 4.2, 2.6, 0xdcb8ff, 0x7a4ab0, 0.95, 0.45, 1.9)
      }
    }
    shadeParts(out, look, X, Y, cos, sin, sc, lx, ly, reach, flash)
    // gloss: the specular glint sits where the abdomen faces the lamp
    {
      const gx = -7 + lx * 5, gy = ly * 4
      const [wx, wy] = at(X, Y, cos, sin, sc, gx, gy)
      out('✦', wx, wy, 0xf4e8ff, 0.5 + 0.5 * reach, 5 * sc, 0, true, 0, false)
      out('✦', wx, wy, 0xd0b0ff, 0.35 * reach, 8 * sc, 0, true, 0, true)
    }
    for (const [ex, ey] of [[10, 1.3], [10, -1.3], [9, 3], [9, -3]]) {
      const [wx, wy] = at(X, Y, cos, sin, sc, ex, ey)
      const hot = st.pose === 'aim' ? 1 : 0.6
      out('•', wx, wy, 0xff3a4a, hot, 3.5 * sc, 0, true, 0, false)
      if (st.pose === 'aim') out('•', wx, wy, 0xff2030, 0.6 * st.aimK, 8 * sc, 0, true, 0, true)
    }
  } else if (id === 'kobold') {
    // tail of scales, tapering
    let px = -16, py = 0
    for (let i = 1; i <= 9; i++) {
      const k = i / 9
      const x = -16 - k * 20, y = Math.sin(t * 3.5 + ph * 0.5 - k * 2.4) * 5 * k
      const [wx, wy] = at(X, Y, cos, sin, sc, x, y)
      out(k < 0.5 ? 'v' : k < 0.8 ? '~' : '.', wx, wy, mixHex(MAT.scale.mid, MAT.scale.dark, k * 0.7), (0.9 - k * 0.5) * lit + 0.1, (9 - k * 5) * sc, Math.atan2(y - py, x - px) + heading - Math.PI / 2, false, 0, false)
      px = x; py = y
    }
    // stubby clawed legs
    for (const [lxp, s, o] of [[6, 1, 0], [6, -1, Math.PI], [-10, 1, Math.PI], [-10, -1, 0]]) {
      const sw = Math.sin(ph + o) * 4
      stroke(out, X, Y, cos, sin, sc, lxp, 7 * s, lxp + 3 + sw, 14 * s, 6.5, 5, MAT.scale.mid, MAT.scale.dark, 0.85 * lit + 0.15, 0.7 * lit + 0.1, 3)
      const [wx, wy] = at(X, Y, cos, sin, sc, lxp + 4 + sw, 15.5 * s)
      out(',', wx, wy, 0xe8dcc0, 0.7, 5 * sc, heading, false, 0, false)
    }
    shadeParts(out, look, X, Y, cos, sin, sc, lx, ly, reach, flash)
    // the pick over its shoulder: a '/' haft and a steel 'T' head
    const sw = Math.sin(ph * 0.5) * 2
    stroke(out, X, Y, cos, sin, sc, 6, -8, -12 + sw, -18, 5.5, 5.5, 0xe0a060, 0xa86a34, 1, 0.95, 2.4)
    {
      const [wx, wy] = at(X, Y, cos, sin, sc, -13 + sw, -19)
      const r = heading + Math.atan2(-10, -18) + Math.PI / 2
      out('T', wx, wy, 0xc8f0ff, 0.35, 15 * sc, r, true, 0, true)
      out('T', wx, wy, 0xeef8ff, 1, 12 * sc, r, false, 0, false)
    }
    // the helmet lamp and its little beam of motes
    const [lpx, lpy] = at(X, Y, cos, sin, sc, 19, 0)
    out('*', lpx, lpy, 0xfffad0, 1, 10 * sc, t * 2, true, 0, false)
    out('*', lpx, lpy, 0xffb030, 0.85, 20 * sc, t * 2, true, 0, true)
    for (let i = 0; i < 8; i++) {
      const k = ((t * 0.9 + i / 8) % 1)
      const [wx, wy] = at(X, Y, cos, sin, sc, 22 + k * 26, (hash2(i, 3, 71) - 0.5) * k * 20)
      out(i % 2 ? '·' : '`', wx, wy, 0xffd890, 0.7 * (1 - k), 5 * sc, 0, true, 1, false)
    }
  } else if (id === 'golem') {
    // fists swing with its lumbering gait (they are parts 1 and 2: offset them before shading)
    const sw = Math.sin(ph) * 5
    const P = look.parts
    P[1]._dx = sw; P[2]._dx = -sw
    for (let k = 0; k < 3; k++) {
      const p0 = P[k]
      if (!p0._dx) continue
      for (const q of p0.pts) { q.x += p0._dx; }
    }
    shadeParts(out, look, X, Y, cos, sin, sc, lx, ly, reach, flash)
    for (let k = 1; k < 3; k++) { const p0 = P[k]; for (const q of p0.pts) q.x -= p0._dx; p0._dx = 0 }
    // the cracks: fine glyphs that glow from inside, breathing
    const glowK = 0.55 + 0.45 * Math.sin(t * 2.2 + ph * 0.3)
    for (const C of GOLEM_CRACKS) {
      for (let i = 0; i < C.length; i++) {
        const [cx, cy, ch] = C[i]
        const [wx, wy] = at(X, Y, cos, sin, sc, cx, cy)
        const col = 0x6ad8f0
        out(ch, wx, wy, mixHex(col, 0xffffff, 0.3 * glowK), 0.45 + 0.35 * glowK, 6 * sc, heading, true, 1, false)
        if (i % 2 === 0) out(ch, wx, wy, col, 0.25 * glowK, 10 * sc, heading, true, 1, true)
      }
    }
    for (const s of [-1, 1]) {
      const [wx, wy] = at(X, Y, cos, sin, sc, 17, 6 * s)
      out('•', wx, wy, 0xc8ffff, 1, 6 * sc, 0, true, 0, false)
      out('•', wx, wy, 0x40e8ff, 0.9, 14 * sc, 0, true, 0, true)
    }
  }
  if (elite) {
    // a gold sparkle crown floating over the body (screen-up, whatever the heading): elite at a glance
    // (a fixed size in world px: the crown is a mark, not part of the body, so it does not grow with a golem)
    const R = CAST[id].baseR * sc * 0.9
    const cy = Y - R - 12
    const half = 15
    for (let i = 0; i < 5; i++) {
      const u = (i - 2) / 2
      const tw = 0.7 + 0.3 * Math.sin(t * 6 + i * 1.7)
      const big = i % 2 === 0
      const x = X + u * half, y = cy - (big ? 6 : 0) + Math.abs(u) * 3
      out('✦', x, y, 0xfff4c0, tw, big ? 11 : 7, 0, true, 0, false)
      out('✦', x, y, 0xffb020, 0.65 * tw, big ? 20 : 13, 0, true, 0, true)
    }
    for (let i = 0; i < 7; i++) {
      const u = (i - 3) / 3
      out('·', X + u * half * 1.05, cy + 5 + Math.abs(u) * 3, 0xffd76a, 0.95, 9, 0, true, 0, false)
    }
  }
}
const GOLEM_CRACKS = [
  [[4, -10, '/'], [1, -6, '\''], [-2, -2, '/'], [-5, 2, ','], [-9, 4, '`'], [-13, 8, '/']],
  [[-6, -14, '`'], [-10, -12, '\''], [-14, -9, ','], [-18, -8, '.']],
  [[8, 6, '\\'], [10, 10, '\''], [7, 14, ','], [3, 16, '`']],
]

// ---- statuses: render.js's "Elemental status (contract fields)" tells, re-published on the glyphs.
// Same fields, same ranking as its tint chain (frozen > chill > venom > ignite > enrage > stun > fear);
// `hold` freezes the creature's pose the way render.js holds a frozen or stunned sprite's animation.
function statusLook(e, clock) {
  if ((e.frozen || 0) > 0) return { kind: 'frozen', tint: 0x9fd8ff, k: 0.72, hold: true }
  if ((e.chill || 0) > 0) return { kind: 'chill', tint: 0xc4e4ff, k: 0.45 }
  if ((e.venom || 0) > 0) return { kind: 'venom', tint: mixHex(0xa8e6a0, 0x46a52f, clamp01(e.venom)), k: 0.62 }
  if ((e.ignite || 0) > 0) return { kind: 'ignite', tint: 0xff9440, k: 0.42 + 0.22 * Math.sin(clock * 23 + (e.id ?? 0)) }
  if ((e.enrageT || 0) > 0) return { kind: 'enrage', tint: 0xff8a5c, k: 0.5 }
  if ((e.stunT || 0) > 0) return { kind: 'stun', tint: 0xb9b0a2, k: 0.6, hold: true }
  if ((e.fearT || 0) > 0) return { kind: 'fear', tint: 0xcfc2ff, k: 0.5 }
  return null
}
// Elite affixes, one glyph each, in a row over the crown (render.js's emoji badges are hidden here).
const AFFIX_GLYPH = {
  shielded: ['O', 0x6ab8ff], splitter: ['%', 0xc89aff], volatile: ['*', 0xff4a3a], pacer: ['»', 0xffb347],
  anchored: ['‡', 0x9ab0c8], frenzied: ['!', 0xff7a3a], gilded: ['$', 0xffd24a],
}

// ---- the cast export (static bakes for render.js's pool and the title-card thumbnails) ---------
export const ASCII_CAST = {
  mineRat: { baseR: 12 },
  caveSpider: { baseR: 13, poseOf: (e) => ({ hold: 0, aim: 1, leap: 2, land: 0 })[e._pounceState] ?? 0 },
  kobold: { baseR: 22 },
  golem: { baseR: 28 },
}
const RES = 3
function paintGlyphs(list, white) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const g of list) { x0 = Math.min(x0, g[1] - g[5]); x1 = Math.max(x1, g[1] + g[5]); y0 = Math.min(y0, g[2] - g[5]); y1 = Math.max(y1, g[2] + g[5]) }
  const pad = 2, w = x1 - x0 + pad * 2, h = y1 - y0 + pad * 2
  const c = mkCanvas(w * RES, h * RES)
  const x = c.getContext('2d')
  x.scale(RES, RES)
  x.textAlign = 'center'; x.textBaseline = 'middle'
  for (const [ch, gx, gy, col, a, size, rot, add, font, glow] of list) {
    x.save()
    x.translate(gx - x0 + pad, gy - y0 + pad); x.rotate(rot)
    x.font = FONTS[font].replace('44px', `${size}px`)
    x.globalAlpha = glow ? a * 0.5 : a
    x.globalCompositeOperation = add ? 'lighter' : 'source-over'
    if (glow) { x.shadowColor = '#' + col.toString(16).padStart(6, '0'); x.shadowBlur = size * 0.3 }
    x.fillStyle = white ? '#fff' : '#' + col.toString(16).padStart(6, '0')
    x.fillText(ch, 0, 0)
    x.restore()
  }
  return { canvas: c, ax: (-x0 + pad) / w, ay: (-y0 + pad) / h }
}
function staticGlyphs(id, elite, pose) {
  const list = []
  const out = (...g) => list.push(g)
  composeCreature(out, id, 0, 0, -Math.PI / 2, 1, 0.3, 0.6, 0.9, 0, { phase: pose * 1.6, t: pose * 0.4, pose: pose === 1 && id === 'caveSpider' ? 'aim' : 'walk', aimK: 1 }, elite)
  return list
}
export function bakeCreature(id, elite) {
  if (!CAST[id]) return null
  const frames = [0, 1, 2].map((pose) => {
    const list = staticGlyphs(id, elite, pose)
    const a = paintGlyphs(list, false), b = paintGlyphs(list, true)
    return { canvas: a.canvas, white: b.canvas, ax: a.ax, ay: a.ay, res: RES }
  })
  const M = ASCII_CAST[id]
  return { frames, baseR: M.baseR, upright: true, lean: 0, poseOf: M.poseOf ?? null, faceDir: null, turnRate: null }
}
export function paintHazard(src) {
  if (src !== 'firedamp') return null
  const list = []
  for (let k = 0; k < 40; k++) {
    const rr = 18 * Math.sqrt(k / 40), a = k * 2.39996
    const ch = rr < 7 ? '≈' : rr < 13 ? '~' : '.'
    list.push([ch, Math.cos(a) * rr, Math.sin(a) * rr, mixHex(0xcfeea0, 0x3e7a52, rr / 18), 0.9 - rr / 30, 9, a, false, 0, false])
  }
  list.push(['*', 4, 2, 0xffe08a, 1, 16, 0, true, 0, false])
  return paintGlyphs(list, false).canvas
}

// ---- the floor's cells ---------------------------------------------------------------------------
// One glyph per 12px cell, everything about it but its light fixed by the cell's hashes. The floor is
// drawn three ways (see sync): BAKED into world-anchored chunk textures under the slow lights (the
// gas pockets), LIVE for the cells a fast light reaches (the lamp, the lantern, a lit pocket, a blast),
// and the ORE cells live always (they twinkle). Same rule for all three: floorCell.
const FC = 12, FCH = 16, FCPX = FC * FCH
const FL = ['.', ',', '\'', ':', '-', '~', ';', '=', '^', '~', '"', '+']
function cellStatics(i, j) {
  const x = (i + 0.15 + 0.7 * hash2(i, j, 2)) * FC, y = (j + 0.15 + 0.7 * hash2(i, j, 3)) * FC
  const rock = vnoise(x / 170, y / 170, 5)      // ridges of heavier rock: the gallery walls
  return {
    x, y, h: hash2(i, j, 1), h4: hash2(i, j, 4), h6: hash2(i, j, 6), h7: hash2(i, j, 7), h8: hash2(i, j, 8),
    h9: hash2(i, j, 9), h10: hash2(i, j, 10), h12: hash2(i, j, 12), wall: clamp01((rock - 0.58) * 5),
  }
}
// li, gi: the light (and the gas's share of it) on the floor at the cell
function floorCell(put, c, li, gi, clock) {
  const l = Math.min(1, li)
  if (c.h > 0.9 + 0.1 * l) {
    // the dark: a rare dull ore fleck survives
    if (c.h9 < 0.004) put('◇', c.x, c.y, c.h10 < 0.5 ? 0x6a5a3a : 0x4a6266, 0.35, 5, 0, false, 1, false)
    return
  }
  const wall = c.wall
  const v = clamp01(0.3 + l * (0.35 + 0.5 * c.h4) + wall * 0.25)
  if (c.h9 < 0.01) {
    // ore in the lamp: a dull fleck that only just catches the light
    const tw = 0.5 + 0.5 * Math.sin(clock * 2.5 + c.h * 40)
    put('◇', c.x, c.y, c.h10 < 0.5 ? 0x9a8458 : 0x6a8a8e, 0.3 + 0.3 * v * tw, 5 + 3 * v, 0, false, 1, false)
    return
  }
  let ch = FL[Math.min(FL.length - 1, Math.floor((0.75 * c.h12 + 0.3 * v) * FL.length))]
  if (wall > 0.3 && c.h6 < wall * 0.35) ch = c.h7 < 0.5 ? '%' : '#'
  let col = ramp3(0x4e473e, 0x766c5e, 0x9a8e7c, v)
  if (gi > 0) col = mixHex(col, 0x4a6a4c, Math.min(0.5, gi / (li + 0.001) * 0.8))
  put(ch, c.x, c.y, col, 0.5 + 0.25 * v, 12 + 4 * v + wall * 2, (c.h8 - 0.5) * 0.7, false, 1, false)
}
// floorCell's output for one live cell, memoised on the cell (mch null = it draws nothing)
let memoCell = null
const memoPut = (ch, x, y, col, al, size, rot) => { const s = memoCell; s.mch = ch; s.mcol = col; s.mal = al; s.msz = size; s.mrot = rot }
// sum of the floor light at (x, y) over a list of lights; the gas's share lands in lightGi
let lightGi = 0
function floorLight(list, x, y) {
  let li = 0, gi = 0
  for (let n = 0; n < list.length; n++) {
    const L = list[n], R = L.fr
    const dx = x - L.x, dy = y - L.y, d2 = dx * dx + dy * dy
    if (d2 > R * R) continue
    const k = 1 - Math.sqrt(d2) / R
    const w = k * Math.sqrt(k) * L.i
    li += w; if (L.g) gi += w
  }
  lightGi = gi
  return li
}

// ---- the renderer ------------------------------------------------------------------------------
const PRE = '@%#&*+=:-.,`\'·•°~≈∿oO0Q◇◆✦$!|/\\_TvwWM▓X^<>()[]{}"»‡0123456789' + "'"
export function createAsciiRenderer(host) {
  const floorC = new Container(), gasC = new Container(), warnC = new Container(), dropC = new Container(), mobC = new Container()
  const objC = new Container(), meC = new Container(), fxC = new Container(), numC = new Container(), scrC = new Container()
  // labelled so a probe scene can show one layer at a time (background vs foreground luminance)
  floorC.label = 'ascii-floor'; gasC.label = 'ascii-gas'; warnC.label = 'ascii-warn'; dropC.label = 'ascii-drops'; mobC.label = 'ascii-mob'
  objC.label = 'ascii-obj'; meC.label = 'ascii-me'; fxC.label = 'ascii-fx'; numC.label = 'ascii-num'; scrC.label = 'ascii-screen'
  host.under.addChild(floorC, gasC, warnC, dropC, mobC)
  host.over.addChild(objC, meC, fxC, numC)
  host.screen.addChild(scrC)
  // the floor: baked chunks outside the fast lights, live cells inside them (complementary stencil
  // masks of the same discs, so every pixel comes from exactly one), ore cells live on top
  const bakedC = new Container(), liveC = new Container(), oreC = new Container()
  const maskOut = new Graphics(), maskIn = new Graphics()
  floorC.addChild(bakedC, liveC, oreC, maskOut, maskIn)
  bakedC.setMask({ mask: maskOut, inverse: true })
  liveC.setMask({ mask: maskIn })
  const floor = makeBatch(liveC), ores = makeBatch(oreC)
  const bakeC = new Container(), bakeB = makeBatch(bakeC)
  const chunks = new Map()   // "ci,cj" -> { ci, cj, grid, ores, rt, spr, at, gas, res, seen }
  const gas = makeBatch(gasC), warn = makeBatch(warnC), drops = makeBatch(dropC), mob = makeBatch(mobC)
  const obj = makeBatch(objC), me = makeBatch(meC), fxB = makeBatch(fxC), numB = makeBatch(numC), scr = makeBatch(scrC)
  const all = [floor, ores, gas, warn, drops, mob, obj, me, fxB, numB, scr]
  for (const ch of PRE) { glyphTex(ch, 0); glyphTex(ch, 1); glyphTex(ch, 2); glyphTex(ch, 0, true) }
  let clock = 0
  let frame = 0
  // per-creature memory: heading eases, stride phase from distance walked
  const mem = new Map()
  // transient glyph particles
  const fx = []
  const MAX_FX = 1400
  const spawn = (p) => { if (fx.length < MAX_FX) fx.push({ t: 0, vx: 0, vy: 0, rot: 0, vr: 0, add: false, a0: 1, font: 0, glow: false, grav: 0, ...p }) }
  // damage numbers: small dim digits, the floor's own thin serif, gone in half a second
  const nums = []
  const MAX_NUMS = 90
  // the hurt tell: red glyphs flaring in from the screen edge (hurtT counts down from hurt0)
  let hurtT = 0, hurt0 = 1, hurtK = 0
  const dropChunk = (k, c) => { if (c.spr) { bakedC.removeChild(c.spr); c.spr.destroy(); c.rt.destroy(true) } chunks.delete(k) }
  const clearAll = () => {
    fx.length = 0; nums.length = 0; hurtT = 0; mem.clear(); for (const b of all) b.clear()
    for (const [k, c] of chunks) dropChunk(k, c)
  }
  // a chunk's cells (its own 16x16, plus a one-cell rim of its neighbours whose glyphs reach into it)
  function chunkAt(ci, cj) {
    const key = ci + ',' + cj
    let c = chunks.get(key)
    if (c) return c
    // grid: (FCH + 2)^2 cells row-major from (ci*FCH - 1, cj*FCH - 1); ores: this chunk's own ore cells
    const grid = [], oreCells = []
    for (let j = cj * FCH - 1; j <= (cj + 1) * FCH; j++) {
      for (let i = ci * FCH - 1; i <= (ci + 1) * FCH; i++) {
        const s = cellStatics(i, j)
        const own = i >= ci * FCH && i < (ci + 1) * FCH && j >= cj * FCH && j < (cj + 1) * FCH
        if (own && s.h9 < 0.01) oreCells.push(s)
        grid.push(s)
      }
    }
    c = { ci, cj, grid, ores: oreCells, rt: null, spr: null, at: -1e9, gas: false, res: 0, seen: frame }
    chunks.set(key, c)
    return c
  }
  // bake a chunk under the slow lights only (outside every fast light, that is the whole light)
  function bakeChunk(c, slow, res, R) {
    if (!c.rt || c.res !== res) {
      if (c.rt) { bakedC.removeChild(c.spr); c.spr.destroy(); c.rt.destroy(true) }
      c.rt = RenderTexture.create({ width: FCPX, height: FCPX, resolution: res })
      c.spr = new Sprite(c.rt)
      c.spr.position.set(c.ci * FCPX, c.cj * FCPX)
      bakedC.addChild(c.spr)
      c.res = res
    }
    const ox = c.ci * FCPX, oy = c.cj * FCPX
    // only the gas pockets that can reach this chunk
    const near = slow.filter((L) => L.x + L.fr > ox - FC && L.x - L.fr < ox + FCPX + FC && L.y + L.fr > oy - FC && L.y - L.fr < oy + FCPX + FC)
    bakeB.begin()
    const put = (ch, x, y, col, al, size, rot, add, font, glow) => bakeB.put(ch, x - ox, y - oy, col, al, size, rot, add, font, glow)
    for (const s of c.grid) if (s.h9 >= 0.01) floorCell(put, s, near.length ? floorLight(near, s.x, s.y) : 0, near.length ? lightGi : 0, 0)
    bakeB.end()
    if (getAtlas().dirty) { getAtlas().source.update(); getAtlas().dirty = false }
    R.render({ container: bakeC, target: c.rt, clear: true })
    c.gas = near.length > 0
  }

  function scatter(m) {
    // a death: the creature's own glyphs fly apart and fade
    const list = []
    composeCreature((...g) => list.push(g), m.id, m.x, m.y, m.heading, m.sc, 0, 0, 0.6, 0.4, { phase: m.phase, t: clock, pose: 'walk', aimK: 0 }, m.elite)
    const step = Math.max(1, Math.floor(list.length / 60))
    for (let i = 0; i < list.length; i += step) {
      const g = list[i]
      const dx = g[1] - m.x, dy = g[2] - m.y, d = Math.hypot(dx, dy) || 1
      const sp = 40 + Math.random() * 90
      spawn({ ch: g[0], x: g[1], y: g[2], vx: dx / d * sp, vy: dy / d * sp, life: 0.45 + Math.random() * 0.4, c0: g[3], c1: 0x1a1210, size: g[5], rot: g[6], vr: (Math.random() - 0.5) * 8, a0: g[4] })
    }
  }

  function boomBurst(x, y, r, dyn) {
    // the loose smoke and grit that outlive the blast (the blast itself is drawn from run.booms)
    const n = dyn ? 22 : 16
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, d = r * (0.5 + Math.random() * 0.5)
      spawn({ ch: ['.', ',', '°', '`', ':'][i % 5], x: x + Math.cos(a) * d * 0.6, y: y + Math.sin(a) * d * 0.6, vx: Math.cos(a) * 50, vy: Math.sin(a) * 50 - 18,
        life: 1.0 + Math.random() * 0.7, c0: 0x8a7a68, c1: 0x201814, size: 7 + Math.random() * 6, a0: 0.55, vr: (Math.random() - 0.5) * 2 })
    }
    for (let i = 0; i < (dyn ? 10 : 6); i++) {
      const a = Math.random() * TAU, sp = r * (2.5 + Math.random() * 2)
      spawn({ ch: Math.random() < 0.5 ? '\'' : '`', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35 + Math.random() * 0.25, c0: 0xfff0b0, c1: 0xff5a1a, size: 8, add: true, rot: a, a0: 1 })
    }
  }

  return {
    hide: ['floor', 'dust', 'gems', 'coins', 'bullets', 'novas', 'player', 'particles', 'shadows', 'crowns', 'enemies', 'text', 'telegraphs', 'affixes', 'obstacles', 'vignette'],
    enter() { clearAll() },
    // nothing to restore on the way out: render.js's reset() has already set the next chapter's
    // background before it calls setAscii, and the black below is re-asserted on every mine frame
    exit() { clearAll() },
    filters() { return null },
    // 'hit' and 'hurt' return false: render.js still shakes the camera for them, and everything it
    // would DRAW for them (the text layer, the red vignette) is hidden above.
    event(e, run) {
      switch (e.type) {
        case 'hit': {
          if (!(e.dmg > 0)) return false
          if (nums.length >= MAX_NUMS) nums.shift()
          nums.push({ s: String(Math.round(e.dmg)), x: e.x + (Math.random() - 0.5) * 10, y: e.y - 8, t: 0, crit: !!e.crit, dot: !!e.dot })
          return false
        }
        case 'hurt': {
          const p = run?.player
          const k = e.src === 'overload' ? 0.2 : 0.45 + 0.55 * Math.min(1, ((e.dmg ?? 0) / Math.max(1, p?.maxHP ?? 100)) * 5)
          if (k >= hurtK * (hurtT / hurt0)) { hurt0 = 0.2 + 0.35 * k; hurtT = hurt0; hurtK = k }
          if (p && e.src !== 'overload') {
            // a spray of red chips off the miner
            for (let i = 0; i < 10; i++) {
              const a = (i / 10) * TAU + Math.random() * 0.5, sp = 90 + Math.random() * 70
              spawn({ ch: i % 3 ? '*' : '+', x: p.x + Math.cos(a) * 10, y: p.y + Math.sin(a) * 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                life: 0.3 + 0.12 * k, c0: 0xff5a40, c1: 0x6a0806, size: 9 + 4 * k, add: true, rot: a, a0: 0.95 })
            }
          }
          return false
        }
        case 'explode': {
          // a corpse bomb going off: a ring of '*' '+' racing out to its reach, and the grit after it
          const r = e.radius ?? 100
          for (let i = 0; i < 28; i++) {
            const a = (i / 28) * TAU
            spawn({ ch: i % 2 ? '*' : '+', x: e.x, y: e.y, vx: Math.cos(a) * r * 4.2, vy: Math.sin(a) * r * 4.2, life: 0.4, c0: 0xfff0c0, c1: 0xff3a10, size: 12, add: true, rot: a })
          }
          boomBurst(e.x, e.y, r, true)
          return false
        }
        case 'gasBlast': boomBurst(e.x, e.y, e.r, false); return true
        case 'dynamite': boomBurst(e.x, e.y, e.r, true); return true
        case 'pickaxe': {
          // the swing: a steel 'T' sweeping through an arc, a trail of strokes behind it, chips flying
          const a0 = (e.angle ?? 0) - 1.1
          for (let i = 0; i < 7; i++) {
            const a = a0 + i * 0.36, rr = (e.r ?? 30) * 0.9
            spawn({ ch: i === 6 ? 'T' : (i % 2 ? '-' : '~'), x: e.x - Math.cos(e.angle ?? 0) * rr * 0.5 + Math.cos(a) * rr, y: e.y - Math.sin(e.angle ?? 0) * rr * 0.5 + Math.sin(a) * rr,
              life: 0.16 + i * 0.035, c0: i === 6 ? 0xffffff : 0xe8f8ff, c1: 0x3a7aa8, size: i === 6 ? 22 : 14, rot: a + Math.PI / 2, add: i !== 6, a0: 0.55 + i * 0.075, glow: i % 2 === 0 && i !== 6 })
          }
          for (let i = 0; i < 6; i++) {
            const a = (e.angle ?? 0) + (Math.random() - 0.5) * 2, sp = 60 + Math.random() * 90
            spawn({ ch: ['.', ',', '\'', '°'][i % 4], x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35, c0: 0xe8d2b0, c1: 0x4a3a2a, size: 7, grav: 120 })
          }
          return true
        }
        case 'kill': {
          let best = null, bd = 40 * 40
          for (const m of mem.values()) {
            const d = (m.x - e.x) ** 2 + (m.y - e.y) ** 2
            if (d < bd) { bd = d; best = m }
          }
          if (best) { scatter(best); best.dead = true }
          return true
        }
        default:
          return false
      }
    },
    sync(run, dt, view) {
      const R = host.app?.renderer
      if (R?.background && R.background.color?.toNumber?.() !== 0) R.background.color = 0x000000
      if (dt > 0) clock += dt
      frame++
      const p = run.player
      const pr = p.radius ?? 14
      const time = run.time ?? clock
      const BOOM_T = 0.55
      // ---- this frame's lights ----
      const lantern = run.lanternR ?? 0
      // fr = how far the light reaches ON THE FLOOR: the lamp lights the creatures far out, but the
      // floor it shows is a small, quiet pool (the background must never compete with the crowd)
      const lights = [{ x: p.x, y: p.y, r: 300 + lantern * 0.6, fr: 210 + lantern * 0.4, i: 1.05, g: 0 }]
      if (lantern > 0) lights.push({ x: p.x, y: p.y, r: lantern * 1.25, fr: lantern * 0.8, i: 0.55 + 0.05 * Math.sin(clock * 7), g: 0 })
      for (const g of run.gas ?? []) lights.push({ x: g.x, y: g.y, r: g.r * 1.5, i: 0.22, g: 1 })
      for (const L of run.gasLit ?? []) lights.push({ x: L.x, y: L.y, r: L.r * 1.9, i: 0.7 + 0.3 * Math.sin(clock * 40 + L.seed), g: 0 })
      for (const b of run.booms ?? []) {
        const k = (time - b.at) / BOOM_T
        if (k >= 0 && k < 1) lights.push({ x: b.x, y: b.y, r: b.r * 1.7, i: 0.9 * (1 - k) * (1 - k), g: 0 })
      }
      const lightAt = (x, y, onFloor = false) => {
        let li = 0, gi = 0
        for (const L of lights) {
          const R = onFloor ? (L.fr ?? L.r) : L.r
          const dx = x - L.x, dy = y - L.y, d2 = dx * dx + dy * dy
          if (d2 > R * R) continue
          const k = 1 - Math.sqrt(d2) / R
          const w = k * Math.sqrt(k) * L.i
          li += w; if (L.g) gi += w
        }
        return [li, gi]
      }

      // ---- the floor: THE BACKGROUND LAYER. Small thin serif glyphs in a desaturated warm grey, no glow,
      // never brighter than about a quarter of white: it is the rock the crowd walks on, and it must
      // never read as part of the crowd. The lamp's pool on it is small and sparse.
      // Slow lights (the gas pockets, drifting at 16px/s) are baked into the chunks and re-baked every
      // REBAKE_T; fast lights are live. A light's floor reach is `fr`.
      const slow = [], fast = []
      for (const L of lights) { if (L.fr == null) L.fr = L.r; (L.g ? slow : fast).push(L) }
      const res = (R?.resolution ?? 1) * (view.zoom || 1)
      const ci0 = Math.floor(view.left / FCPX), ci1 = Math.floor(view.right / FCPX)
      const cj0 = Math.floor(view.top / FCPX), cj1 = Math.floor(view.bottom / FCPX)
      // bake every chunk new to the view now; refresh at most two gas-touched chunks a frame
      const REBAKE_T = 0.4
      const vis = []
      for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
        const c = chunkAt(ci, cj)
        c.seen = frame
        if (c.res !== res || c.at < -1e8) { bakeChunk(c, slow, res, R); c.at = clock } else vis.push(c)
        c.spr.visible = true
      }
      let rebakes = 0
      vis.sort((a, b) => a.at - b.at)
      for (const c of vis) {
        if (rebakes >= 2 || clock - c.at < REBAKE_T) break
        const ox = c.ci * FCPX, oy = c.cj * FCPX
        const gasNear = slow.some((L) => L.x + L.fr > ox - FC && L.x - L.fr < ox + FCPX + FC && L.y + L.fr > oy - FC && L.y - L.fr < oy + FCPX + FC)
        if (gasNear || c.gas) { bakeChunk(c, slow, res, R); rebakes++ }
        c.at = clock
      }
      for (const [k, c] of chunks) {
        if (c.seen !== frame) { if (c.spr) c.spr.visible = false; if (frame - c.seen > 120) dropChunk(k, c) }
      }
      // the fast lights' discs: the live cells inside, the baked chunks outside
      maskIn.clear(); maskOut.clear()
      for (const L of fast) { maskIn.circle(L.x, L.y, L.fr); maskOut.circle(L.x, L.y, L.fr) }
      if (fast.length) { maskIn.fill(0xffffff); maskOut.fill(0xffffff) }
      floor.begin()
      const E = 1   // cells whose ink can reach into a disc: centre within fr + E cells (a glyph's ink reaches < 10px)
      for (const L of fast) {
        const rr = L.fr + E * FC
        // only the lights that reach this disc can light a cell in it
        const near = lights.filter((M) => Math.abs(M.x - L.x) < M.fr + rr && Math.abs(M.y - L.y) < M.fr + rr)
        const a0 = Math.floor((L.x - rr) / FC), a1 = Math.floor((L.x + rr) / FC)
        const b0 = Math.floor((L.y - rr) / FC), b1 = Math.floor((L.y + rr) / FC)
        for (let cj = Math.floor(b0 / FCH); cj <= Math.floor(b1 / FCH); cj++) for (let ci = Math.floor(a0 / FCH); ci <= Math.floor(a1 / FCH); ci++) {
          const c = chunkAt(ci, cj), g = c.grid
          const ja = Math.max(b0, cj * FCH), jb = Math.min(b1, cj * FCH + FCH - 1)
          const ia = Math.max(a0, ci * FCH), ib = Math.min(a1, ci * FCH + FCH - 1)
          for (let j = ja; j <= jb; j++) {
            const row = (j - cj * FCH + 1) * (FCH + 2) + 1 - ci * FCH
            for (let i = ia; i <= ib; i++) {
              const s = g[row + i]
              if (s.stamp === frame || s.h9 < 0.01) continue
              const dx = s.x - L.x, dy = s.y - L.y
              if (dx * dx + dy * dy > rr * rr) continue
              s.stamp = frame
              // the cell's glyph is a function of its light alone: recompute only when that moved
              // by more than 1/256 (a lamp walking past changes a fraction of the pool per frame)
              const qi = Math.round(floorLight(near, s.x, s.y) * 256), qg = Math.round(lightGi * 256)
              if (s.qi !== qi || s.qg !== qg) { s.qi = qi; s.qg = qg; memoCell = s; s.mch = null; floorCell(memoPut, s, qi / 256, qg / 256, clock) }
              if (s.mch !== null) floor.put(s.mch, s.x, s.y, s.mcol, s.mal, s.msz, s.mrot, false, 1, false)
            }
          }
        }
      }
      floor.end()
      // the ore cells twinkle, so they are never baked
      ores.begin()
      for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
        for (const s of chunkAt(ci, cj).ores) floorCell(ores.put, s, floorLight(lights, s.x, s.y), lightGi, clock)
      }
      ores.end()

      // ---- firedamp: soft clouds shaded with '≈' '∿' '~' 'o' '.', slowly turning ----
      gas.begin()
      const live = []
      for (const g of run.gas ?? []) live.push([g, false])
      for (const g of run.gasLit ?? []) live.push([g, true])
      for (const [g, lit] of live) {
        if (g.x < view.left - g.r * 1.5 || g.x > view.right + g.r * 1.5 || g.y < view.top - g.r * 1.5 || g.y > view.bottom + g.r * 1.5) continue
        const n = Math.round(24 + g.r * 1.3)
        const seed = g.seed ?? 1
        const breathe = 1 + 0.06 * Math.sin(clock * 1.3 + seed)
        // a lit pocket draws in and boils, white-hot at the heart
        const left = lit ? clamp01((g.at - time) / 0.35) : 1
        const shrink = lit ? 0.7 + 0.3 * left : 1
        const [pl] = lightAt(g.x, g.y)
        for (let k = 0; k < n; k++) {
          const f = (k + 0.5) / n
          const rr = g.r * Math.sqrt(f) * breathe * shrink * (0.9 + 0.2 * hash2(seed, k, 3))
          const a = k * 2.39996 + clock * (0.12 + 0.35 * (1 - f)) * (seed % 2 ? 1 : -1) + Math.sin(clock * 0.7 + k) * 0.15
          const x = g.x + Math.cos(a) * rr, y = g.y + Math.sin(a) * rr * 0.92
          let ch, col, al, sz
          if (lit) {
            const fl = 0.6 + 0.4 * Math.sin(clock * 50 + k * 1.7)
            ch = f < 0.3 ? '@' : f < 0.6 ? '*' : f < 0.85 ? '+' : '\''
            col = ramp3(0xfffbe0, 0xffd060, 0xff7a20, f)
            al = (1 - f * 0.5) * fl
            sz = (f < 0.3 ? 12 : 9) * (1.1 - f * 0.3)
            gas.put(ch, x + (Math.random() - 0.5) * 2, y + (Math.random() - 0.5) * 2, col, al, sz, a, true, 0, f < 0.25 && k % 4 === 0)
          } else {
            ch = f < 0.18 ? '≈' : f < 0.4 ? '∿' : f < 0.62 ? '~' : f < 0.8 ? 'o' : '.'
            // a hazard, so it stays clearly green and visible, but a step below the creatures in brightness
            const wl = 0.55 + Math.min(0.45, pl)
            col = mixHex(0x234a32, 0x8ccc7c, 1 - f)
            al = (0.8 - f * 0.5) * wl * (0.75 + 0.25 * Math.sin(clock * 1.7 + k))
            sz = (f < 0.18 ? 15 : f < 0.4 ? 12 : f < 0.8 ? 9 : 7) * (1.05 - f * 0.25)
            gas.put(ch, x, y, col, al, sz, a + Math.PI / 2, false, f < 0.4 ? 0 : 1, false)
            if (f < 0.12) gas.put(ch, x, y, 0x6ac070, 0.12 * wl, sz * 1.6, a + Math.PI / 2, true, 0, true)
          }
        }
      }
      // the chain: a running spark crawls from the last blast to the next pocket of the seam
      for (const L of run.gasLit ?? []) {
        if (!(L.chain > 0)) continue
        let src = null, bd = Infinity
        for (const b of run.booms ?? []) {
          if (b.kind !== 'gas' || b.at > time) continue
          const d = (b.x - L.x) ** 2 + (b.y - L.y) ** 2
          if (d < bd && d > 1) { bd = d; src = b }
        }
        if (!src) continue
        const span = Math.max(0.05, L.at - src.at)
        const k = clamp01((time - src.at) / span)
        const dx = L.x - src.x, dy = L.y - src.y, len = Math.hypot(dx, dy)
        const m = Math.max(3, Math.round(len / 9))
        const [ch, r] = strokeGlyph(Math.atan2(dy, dx))
        for (let s = 0; s <= m; s++) {
          const f = s / m
          if (f > k) break
          const age = k - f
          gas.put(age < 0.15 ? '*' : ch, src.x + dx * f, src.y + dy * f, age < 0.15 ? 0xfff2c0 : mixHex(0xffa040, 0x5a2a10, age * 1.6), age < 0.15 ? 1 : 0.8 * (1 - age), age < 0.15 ? 11 : 8, age < 0.15 ? clock * 9 : r, true, 0, age < 0.12)
        }
      }
      gas.end()

      // ---- pickups: gems '◆', coins '$', twinkling ----
      drops.begin()
      let nd = 0
      for (const g of run.gems ?? []) {
        if (g.x < view.left || g.x > view.right || g.y < view.top || g.y > view.bottom) continue
        if (++nd > 400) break
        const col = g.xp >= 5 ? 0xff8ae0 : g.xp >= 2 ? 0x9cf07a : 0x7ad8ff
        const tw = 0.5 + 0.5 * Math.sin(clock * 3 + g.x * 0.1)
        drops.put('◆', g.x, g.y, col, 0.95, 8 + (g.xp >= 5 ? 3 : 0), 0, false, 0, false)
        drops.put('◆', g.x, g.y, col, 0.25 + 0.2 * tw, 14, 0, true, 0, true)
      }
      nd = 0
      for (const c of run.coins ?? []) {
        if (c.x < view.left || c.x > view.right || c.y < view.top || c.y > view.bottom) continue
        if (++nd > 250) break
        drops.put('$', c.x, c.y, 0xffd24a, 1, 11, 0, false, 0, false)
        drops.put('$', c.x, c.y, 0xffb030, 0.3, 16, 0, true, 0, true)
      }
      drops.end()

      // ---- the creatures, composed glyph by glyph ----
      mob.begin()
      // the miner stays the clearest thing on screen: creature glyphs thin out right around the '@'
      const CLR = 40, CLR2 = CLR * CLR
      const out = (ch, x, y, col, al, size, rot, add, font, glow) => {
        const dx = x - p.x, dy = y - p.y, d2 = dx * dx + dy * dy
        if (d2 < CLR2) { const k = d2 / CLR2; al *= 0.05 + 0.95 * k * k }
        mob.put(ch, x, y, col, al, size, rot, add, font, glow)
      }
      const AIM_T = 0.6
      const marks = []   // elites / affixed bodies on screen: their affix tells are drawn after the crowd
      for (const e of run.enemies ?? []) {
        if (e._dead) continue
        const id = CAST[e.rosterId] ? e.rosterId : null
        if (!id) continue
        const m0 = mem.get(e)
        const sc = VIS * (id === 'golem' ? 0.8 : 1) * (e.radius ?? CAST[id].baseR) / CAST[id].baseR
        const pad = 50 * sc
        if (e.x < view.left - pad || e.x > view.right + pad || e.y < view.top - pad || e.y > view.bottom + pad) { if (m0) m0.seen = frame; continue }
        let m = m0
        if (!m) { m = { id, x: e.x, y: e.y, heading: Math.atan2(p.y - e.y, p.x - e.x), phase: Math.random() * TAU, seen: frame }; mem.set(e, m) }
        const mvx = e.x - m.x, mvy = e.y - m.y, mv = Math.hypot(mvx, mvy)
        let want = mv > 0.15 ? Math.atan2(mvy, mvx) : Math.atan2(p.y - e.y, p.x - e.x)
        let pose = 'walk', aimK = 0
        if (id === 'caveSpider' && e._pounceState && e._pounceState !== 'hold') {
          pose = e._pounceState
          if (e._pounceDirX != null) want = Math.atan2(e._pounceDirY, e._pounceDirX)
          if (pose === 'aim') aimK = clamp01(1 - (e._pounceT ?? 0) / AIM_T)
        }
        const stat = statusLook(e, clock)
        const hold = !!stat?.hold
        let dA = ((want - m.heading + Math.PI) % TAU + TAU) % TAU - Math.PI
        const turn = pose === 'aim' ? 14 : id === 'golem' ? 3 : 7
        if (dt > 0 && !hold) m.heading += dA * Math.min(1, dt * turn)
        if (!hold) m.phase += mv / (id === 'golem' ? 14 : id === 'kobold' ? 8 : 5) * 1.2
        // a held pose keeps the clock it was caught at (a frozen tail stops mid-swish)
        if (hold) { if (m.tHold == null) m.tHold = clock + (m.phase % 7) } else m.tHold = null
        m.x = e.x; m.y = e.y; m.sc = sc; m.elite = !!e.elite; m.seen = frame
        // the lamp, seen from the body
        const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1
        const c = Math.cos(-m.heading), s = Math.sin(-m.heading)
        const lx = (dx * c - dy * s) / d, ly = (dx * s + dy * c) / d
        const [li] = lightAt(e.x, e.y)
        const reach = clamp01(li * 1.1)
        const flash = (e.hitFlash ?? 0) > 0 ? clamp01(e.hitFlash / 0.12) * 0.85 : 0
        let X = e.x, Y = e.y
        if (pose === 'aim') { X += (Math.random() - 0.5) * 1.6 * aimK; Y += (Math.random() - 0.5) * 1.6 * aimK }
        // trembling: fear, and the Burrow's quake (quakeT), harder as the moment comes
        if (stat?.kind === 'fear') { X += Math.sin(clock * 61 + m.phase) * 1.3; Y += Math.cos(clock * 53 + m.phase) * 1.3 }
        if ((e.quakeT || 0) > 0) {
          const qk = 1.5 + 3.5 * (1 - Math.min(1, e.quakeT / 1.2))
          X += Math.sin(clock * 71 + m.phase) * qk; Y += Math.cos(clock * 83 + m.phase) * qk
        }
        const R = CAST[id].baseR * sc
        if (stat && dt > 0) {
          // the status's own glyph particles, on a per-creature clock
          m.sT = (m.sT ?? 0) + dt
          const every = { frozen: 0.32, chill: 0.6, venom: 0.22, ignite: 0.07 }[stat.kind]
          while (every && m.sT >= every) {
            m.sT -= every
            const ox = (Math.random() - 0.5) * R * 1.4, oy = (Math.random() - 0.5) * R * 1.2
            if (stat.kind === 'frozen' || stat.kind === 'chill') spawn({ ch: Math.random() < 0.5 ? '*' : '+', x: X + ox, y: Y + oy, vy: -14, life: 0.7, c0: 0xf0fbff, c1: 0x4a8ac0, size: stat.kind === 'frozen' ? 9 : 7, add: true, a0: stat.kind === 'frozen' ? 0.95 : 0.6, rot: Math.random() })
            else if (stat.kind === 'venom') spawn({ ch: Math.random() < 0.5 ? ',' : '.', x: X + ox, y: Y + oy, vy: 12, grav: 70, life: 0.6, c0: 0xb8f890, c1: 0x1e4a12, size: 10, a0: 0.9 })
            else spawn({ ch: ['\'', '^', '`'][Math.floor(Math.random() * 3)], x: X + ox, y: Y + oy, vx: (Math.random() - 0.5) * 20, vy: -45 - Math.random() * 30, life: 0.4, c0: 0xfff0a0, c1: 0xff3a08, size: 9, add: true, a0: 0.95 })
          }
        } else m.sT = 0
        // the pounce, telegraphed in characters: a dotted line of '·' and '›' to a '×' where it lands
        if (pose === 'aim' && e._pounceDirX != null) {
          const L = 188, nDots = 14
          const ux = e._pounceDirX, uy = e._pounceDirY
          for (let k = 1; k <= nDots; k++) {
            const f = k / nDots
            if (f > aimK * 1.15 + 0.1) break
            const last = k === nDots
            const pulse = 0.65 + 0.35 * Math.sin(clock * 18 - k * 0.8)
            const chev = k % 2 === 0
            const ch = last ? '×' : chev ? '›' : '·'
            const col = last ? 0xff4a3a : mixHex(0xffc080, 0xff3a2a, f)
            const al = (0.45 + 0.55 * aimK) * pulse
            const sz = last ? 26 : chev ? 15 : 11
            // (straight to mob.put: the mark it lands on is usually the miner, and must not thin out there)
            mob.put(ch, e.x + ux * L * f, e.y + uy * L * f, col, al, sz, Math.atan2(uy, ux), true, 0, false)
            if (last || chev) mob.put(ch, e.x + ux * L * f, e.y + uy * L * f, 0xff2a1a, al * 0.6, sz * 1.6, Math.atan2(uy, ux), true, 0, true)
          }
        }
        // a status tints every glyph of the body toward its colour (a hit flash still wins: white)
        const sout = stat && !flash ? (ch, x, y, col, al, size, rot, add, font, glow) => out(ch, x, y, mixHex(col, stat.tint, stat.k), al, size, rot, add, font, glow) : out
        composeCreature(sout, id, X, Y, m.heading, sc, lx, ly, reach, flash, { phase: m.phase, t: hold ? m.tHold : clock + (m.phase % 7), pose, aimK }, !!e.elite)
        if (stat?.kind === 'stun') {
          // stunned: three little stars wheeling over its head
          for (let i = 0; i < 3; i++) {
            const a = clock * 5 + i * TAU / 3
            out('*', X + Math.cos(a) * R * 0.55, Y - R * 0.95 + Math.sin(a) * R * 0.18, 0xfff0a0, 0.95, 10, a, true, 0, false)
          }
        }
        if (e.elite || (e.affixes && e.affixes.length)) marks.push({ e, X, Y, R })
      }
      for (const [k, m] of mem) if (frame - m.seen > 30 || m.dead) mem.delete(k)

      // ---- elite affixes, in characters (render.js's badges, shield bubble and pacer ring are hidden) ----
      warn.begin()
      for (const { e, X, Y, R } of marks) {
        const aff = e.affixes ?? []
        if (aff.includes('shielded') && e.hp > e.maxHP * SHIELD_HP_FRAC) {
          // the shield: a drawn circle of '|' '/' '-' '\' strokes hugging the body, breathing
          const rr = R * 1.08 * (1 + 0.04 * Math.sin(clock * 5 + (e.id ?? 0)))
          const n = Math.max(14, Math.round(TAU * rr / 7))
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU
            const [ch, r] = strokeGlyph(a + Math.PI / 2)
            mob.put(ch, X + Math.cos(a) * rr, Y + Math.sin(a) * rr, 0x8ac8ff, 0.8, 10, r, true, 2, false)
            if (i % 3 === 0) mob.put(ch, X + Math.cos(a) * rr, Y + Math.sin(a) * rr, 0x3a8aff, 0.3, 16, r, true, 0, true)
          }
        }
        if (aff.includes('pacer')) {
          // its reach: a slow ring of faint amber dots on the floor
          const n = Math.round(TAU * PACER_RADIUS / 16)
          const pulse = 0.5 + 0.5 * Math.sin(clock * 1.5 + (e.id ?? 0) * 0.7)
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + clock * 0.15
            warn.put(i % 4 ? '·' : '»', e.x + Math.cos(a) * PACER_RADIUS, e.y + Math.sin(a) * PACER_RADIUS, 0xffb347, 0.45 + 0.25 * pulse, i % 4 ? 9 : 10, a + Math.PI / 2, true, 0, false)
          }
        }
        // the badges: one glyph per affix in a row over the crown
        const shown = aff.filter((a) => AFFIX_GLYPH[a])
        const by = Y - R * 0.9 - 36
        for (let i = 0; i < shown.length; i++) {
          const [ch, col] = AFFIX_GLYPH[shown[i]]
          const bx = X + (i - (shown.length - 1) / 2) * 14
          mob.put(ch, bx, by, col, 0.45, 20, 0, true, 0, true)
          mob.put(ch, bx, by, mixHex(col, 0xffffff, 0.35), 1, 14, 0, false, 2, false)
        }
      }
      // corpse bombs (volatile elites, Unstable Cores): a red circle drawn in strokes at the blast's
      // real reach, filling with sparks as the fuse burns down, a '!' swelling at its heart
      for (const b of run.bombs ?? []) {
        if (b.x < view.left - b.radius || b.x > view.right + b.radius || b.y < view.top - b.radius || b.y > view.bottom + b.radius) continue
        const u = b.duration > 0 ? clamp01(1 - b.fuse / b.duration) : 1
        const pulse = 0.5 + 0.5 * Math.sin(clock * (5 + u * 16))
        const n = Math.max(16, Math.round(TAU * b.radius / 9))
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU
          const [ch, r] = strokeGlyph(a + Math.PI / 2)
          warn.put(ch, b.x + Math.cos(a) * b.radius, b.y + Math.sin(a) * b.radius, mixHex(0xff7a6a, 0xff2a1a, u), 0.45 + 0.4 * u + 0.12 * pulse, 11, r, true, 2, false)
        }
        const seed = Math.round(b.x * 7 + b.y * 13)
        const fill = Math.round(10 + 50 * u)
        for (let i = 0; i < fill; i++) {
          const rr = b.radius * 0.92 * Math.sqrt(hash2(seed, i, 1)), a = hash2(seed, i, 2) * TAU
          warn.put(hash2(seed, i, 3) < 0.5 ? '·' : ':', b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr, 0xff5a40, (0.18 + 0.3 * u) * (0.6 + 0.4 * pulse), 9, 0, true, 1, false)
        }
        warn.put('!', b.x, b.y, 0xffe0c0, 0.7 + 0.3 * pulse, 16 + 14 * u, 0, true, 2, false)
        warn.put('!', b.x, b.y, 0xff3020, 0.5 * (0.5 + pulse), 28 + 18 * u, 0, true, 0, true)
      }
      warn.end()
      mob.end()

      // ---- the Mine's weapons ----
      obj.begin()
      for (const st of run.sticks ?? []) {
        // dynamite: a red stick of '(==)' tumbling through the air, its fuse spitting sparks
        const k = Math.min(1, st.t / st.flight)
        const arcAt = (kk) => [lerp(st.fromX, st.x, kk), lerp(st.fromY, st.y, kk) - Math.sin(kk * Math.PI) * 60]
        const [x, y] = arcAt(k)
        // its flight: a dotted arc of red-hot sparks hanging in the air behind it
        // the whole arc back to the thrower, so the throw reads even at a glance
        if (k < 1) {
          const N = 26
          for (let i = 1; i <= N; i++) {
            const kk = k - i * 0.04
            if (kk <= 0) break
            const [tx, ty] = arcAt(kk)
            const f = i / N
            const star = i % 4 === 0
            obj.put(star ? '*' : i % 2 ? '·' : '-', tx, ty, mixHex(0xfff0a0, 0xc02008, f), 1 - f * 0.75, (star ? 12 : 10) * (1 - f * 0.45), star ? clock * 6 + i : Math.atan2(ty - arcAt(kk + 0.02)[1], tx - arcAt(kk + 0.02)[0]), true, star ? 0 : 2, star && i < 13)
          }
        }
        const rot = k < 1 ? k * 11 : 0.4
        const ux = Math.cos(rot), uy = Math.sin(rot)
        const parts = [['(', -9], ['=', -3], ['=', 3], [')', 9]]
        for (const [ch, o] of parts) obj.put(ch, x + ux * o, y + uy * o, 0xff3a24, 0.4, 22, rot, true, 0, true)
        for (const [ch, o] of parts) obj.put(ch, x + ux * o, y + uy * o, 0xff5a3a, 1, 15, rot, false, 0, false)
        obj.put('~', x + ux * 14, y + uy * 14, 0xf0d0a0, 1, 10, rot, false, 0, false)
        const fl = 0.6 + 0.4 * Math.sin(clock * 60)
        obj.put('*', x + ux * 18, y + uy * 18, 0xfff6c0, fl, 12 + (k >= 1 ? 6 * fl : 0), clock * 20, true, 0, false)
        obj.put('*', x + ux * 18, y + uy * 18, 0xffa030, 0.8 * fl, 24, clock * 20, true, 0, true)
        if (dt > 0 && Math.random() < 0.6) {
          spawn({ ch: Math.random() < 0.5 ? '`' : '\'', x: x + ux * 18, y: y + uy * 18, vx: (Math.random() - 0.5) * 90, vy: -30 - Math.random() * 50, life: 0.3, c0: 0xffe070, c1: 0xff4010, size: 6, add: true, grav: 200 })
        }
        // in flight, the fuse leaves embers hanging along its whole path: a long fading comet
        if (dt > 0 && k < 1) {
          for (let i = 0; i < 2; i++) spawn({ ch: i ? '·' : '*', x: x + (Math.random() - 0.5) * 4, y: y + (Math.random() - 0.5) * 4, vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.5) * 12, life: 0.7, c0: 0xffe890, c1: 0xb02008, size: i ? 11 : 12, add: true, rot: Math.random() * TAU, a0: 0.95, glow: !i })
        }
      }
      for (const c of run.carts ?? []) {
        // the minecart: a compact SOLID tub packed with glyphs like the creatures are, never an outline:
        // a rim of heavy rust-orange '#' '=' planks, a heaped load of gold and blue ore glinting inside,
        // four iron 'o' wheels, sparks off the rails
        const ux = Math.cos(c.angle), uy = Math.sin(c.angle), vx = -uy, vy = ux
        const L = Math.min(30, (c.w ?? 18) * 0.8), w = L * 0.68
        const P = (a, b) => [c.x + ux * a + vx * b, c.y + uy * a + vy * b]
        for (const s2 of [-1, 1]) for (const f2 of [-1, 1]) {
          const [x, y] = P(f2 * L * 0.62, s2 * (w + 4))
          obj.put('o', x, y, 0xc8d4e0, 1, 11, clock * 12, false, 2, false)
          if (f2 < 0) obj.put('*', x - ux * 6, y - uy * 6, 0xfff0a0, 0.6 + 0.4 * Math.sin(clock * 50 + s2), 9, clock * 30, true, 0, true)
        }
        const sp = 4.4
        let n = 0
        for (let yy = -w; yy <= w + 0.01; yy += sp * 0.86) {
          const row = Math.round((yy + w) / (sp * 0.86))
          for (let xx = -L + (row % 2 ? sp / 2 : 0); xx <= L + 0.01; xx += sp) {
            n++
            const rim = Math.abs(xx) > L - sp * 0.9 || Math.abs(yy) > w - sp * 0.8
            const [x, y] = P(xx + (hash2(n, 1, 83) - 0.5) * 1.5, yy + (hash2(n, 2, 83) - 0.5) * 1.5)
            if (rim) {
              obj.put(hash2(n, 3, 83) < 0.5 ? '#' : '=', x, y, mixHex(0xc06a30, 0x7a3c18, hash2(n, 4, 83)), 0.9, 8, c.angle, false, 2, false)
            } else {
              // the load: heaped higher (bigger, brighter) toward the middle
              const rr = Math.min(1, Math.hypot(xx / L, yy / w))
              const gold = hash2(n, 5, 83) < 0.68
              const ch = ['*', '◇', 'o', '%', '@', '°'][Math.floor(hash2(n, 6, 83) * 6)]
              const tw = 0.75 + 0.25 * Math.sin(clock * 9 + n)
              obj.put(ch, x, y, gold ? mixHex(0xffe890, 0xc07a28, rr) : mixHex(0xc8f6ff, 0x3a8ab8, rr), tw, 13 - rr * 4, hash2(n, 7, 83) * TAU, false, 0, false)
              if (hash2(n, 8, 83) < 0.18) obj.put(ch, x, y, gold ? 0xffc040 : 0x60d0ff, 0.35 * tw, 18, 0, true, 0, true)
            }
          }
        }
        if (dt > 0 && frame % 3 === 0) {
          // the rails it leaves: two bright '=' lines and '#' ties, cooling to dark
          for (const s of [-1, 1]) { const [x, y] = P(-L - 4, s * w * 0.7); spawn({ ch: '=', x, y, life: 1.1, c0: 0xffd08a, c1: 0x2a1810, size: 11, rot: c.angle, a0: 0.9 }) }
          if (frame % 6 === 0) { const [x, y] = P(-L - 4, 0); spawn({ ch: '#', x, y, life: 1.1, c0: 0xc88a50, c1: 0x1a100a, size: 12, rot: c.angle, a0: 0.8 }) }
          for (const s of [-1, 1]) { const [x, y] = P(-L * 0.7, s * (w + 3)); spawn({ ch: '\'', x, y, vx: -ux * 60 + (Math.random() - 0.5) * 60, vy: -uy * 60 + (Math.random() - 0.5) * 60, life: 0.3, c0: 0xfff0a0, c1: 0xff5010, size: 7, add: true }) }
        }
      }
      for (const b of run.bullets ?? []) {
        if (b.x < view.left || b.x > view.right || b.y < view.top || b.y > view.bottom) continue
        const a = Math.atan2(b.vy, b.vx)
        if (b.weapon === 'chip') {
          // pickaxe chips: a spinning spark of struck blue quartz ('*'), dragging a long tapering
          // comet of '=' '-' '·' that cools from ice to deep blue
          const sp = Math.hypot(b.vx, b.vy) || 1
          const ux = b.vx / sp, uy = b.vy / sp
          for (let i = 10; i >= 1; i--) {
            const f = i / 10
            obj.put(i < 4 ? '=' : i < 7 ? '-' : '·', b.x - ux * (3 + i * 4.2), b.y - uy * (3 + i * 4.2), mixHex(0xbff2ff, 0x1a4aa0, f), 1 - f * 0.8, 11 - f * 5, a, true, 2, false)
          }
          const spin = clock * 14 + b.x * 0.05
          obj.put('*', b.x, b.y, 0x30a8ff, 0.75, 26, spin, true, 2, true)
          obj.put('*', b.x, b.y, 0x9ae8ff, 1, 17, spin, false, 2, false)
          obj.put('·', b.x, b.y, 0xffffff, 1, 10, 0, true, 0, false)
        } else obj.put('*', b.x, b.y, 0xffe28a, 1, 10, a, true, 0, false)
      }
      for (const n of run.novas ?? []) {
        if (!(n.life > 0) || !(n.r > 2)) continue
        const m = Math.max(10, Math.round(n.r / 9))
        const k0 = 1 - n.life / (n.lifeMax || 0.45)
        for (let k = 0; k < m; k++) {
          const a = (k / m) * TAU + clock * 0.6
          obj.put(k % 3 ? '·' : '*', n.x + Math.cos(a) * n.r, n.y + Math.sin(a) * n.r, mixHex(0xffe8a0, 0xff7a20, k0), 0.8 * (1 - k0), k % 3 ? 8 : 10, a, true, 0, false)
        }
      }
      if (lantern > 0) {
        // the lantern's reach: a slow ring of drifting motes, warm
        const m = Math.round(lantern / 5)
        for (let k = 0; k < m; k++) {
          const a = (k / m) * TAU + clock * 0.35 + Math.sin(clock + k) * 0.05
          const rr = lantern * (0.96 + 0.05 * Math.sin(clock * 2 + k * 1.3))
          const big = k % 4 === 0
          const x = p.x + Math.cos(a) * rr, y = p.y + Math.sin(a) * rr
          if (big) obj.put('✦', x, y, 0xffd070, 1, 10, 0, true, 0, false)
          else obj.put('-', x, y, 0xffe2a0, 0.6, 9, a + Math.PI / 2, true, 0, false)
          if (big) obj.put('✦', x, y, 0xffa030, 0.6, 20, 0, true, 0, true)
          // each spark drags a short comet tail of '·' along the turning ring
          if (big) for (let j = 1; j <= 4; j++) {
            const aa = a - j * 0.045
            obj.put('·', p.x + Math.cos(aa) * rr, p.y + Math.sin(aa) * rr, 0xffc060, 0.75 * (1 - j / 5), 8 - j, 0, true, 0, false)
          }
        }
        // a second, finer ring turning the other way, half as far in
        const m2 = Math.round(lantern / 9)
        for (let k = 0; k < m2; k++) {
          const a = (k / m2) * TAU - clock * 0.6
          const rr = lantern * 0.55
          obj.put('°', p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr, 0xffe0a0, 0.35, 7, 0, true, 0, false)
        }
      }
      obj.end()

      // ---- you: a miner from above, brass helmet and lamp, the brightest thing in the mine ----
      me.begin()
      {
        const heading = p.facingAngle ?? (p.facing < 0 ? Math.PI : 0)
        const sc = 1.35 * pr / PLAYER_LOOK.baseR
        const cos = Math.cos(heading), sin = Math.sin(heading)
        const blink = (p.invuln ?? 0) > 0 && Math.floor(clock * 16) % 2 === 0
        const A = blink ? 0.75 : 1   // the i-frame tell is a colour flicker on the '@' (below), never a dimmed miner
        const flash = (p.hitFlash ?? 0) > 0 ? 0.6 : 0
        const pout = (ch, x, y, col, al, size, rot, add, font, glow) => me.put(ch, x, y, col, al * A, size, rot, add, font, glow)
        // arms swinging as you walk
        const sw = Math.sin(clock * 9) * ((Math.abs(p.vx ?? 0) + Math.abs(p.vy ?? 0)) > 1 ? 3 : 0.5)
        for (const s of [-1, 1]) stroke(pout, p.x, p.y, cos, sin, sc, 0, 11 * s, 8 + sw * s, 14 * s, 7, 6, 0xe8dcc4, 0xb8a888, 1, 0.9, 3)
        for (let i = 0; i <= 8; i++) {
          const a = Math.PI * (0.6 + 0.8 * i / 8)
          const rr = 13.5 + Math.sin(i / 8 * Math.PI) * 1.5
          const [wx, wy] = at(p.x, p.y, cos, sin, sc, Math.cos(a) * rr, Math.sin(a) * rr * 1.05)
          const [ch, r] = strokeGlyph(heading + a + Math.PI / 2)
          const edge = Math.abs(i - 4) / 4
          pout(ch, wx, wy, mixHex(0xfff0d0, 0xa89070, edge), 1 - edge * 0.4, (11 - edge * 3) * sc, r, false, 2, false)
          if (i % 2 === 0 && i > 0 && i < 8) {
            const [ix, iy] = at(p.x, p.y, cos, sin, sc, Math.cos(a) * 8.5, Math.sin(a) * 8.5)
            pout(':', ix, iy, 0xd8c4a0, 0.7, 7 * sc, 0, false, 2, false)
          }
        }
        me.put('@', p.x + cos * 2 * sc, p.y + sin * 2 * sc, blink ? 0xff8a60 : 0xffd890, 0.75, 34 * sc, 0, true, 0, true)
        me.put('@', p.x + cos * 2 * sc, p.y + sin * 2 * sc, flash ? 0xffffff : blink ? 0xffc8a8 : 0xfff4d8, 1, 25 * sc, 0, false, 0, false)
        const [lx, ly] = at(p.x, p.y, cos, sin, sc, 13, 0)
        pout('✦', lx, ly, 0xffffff, 1, 10 * sc, 0, true, 0, false)
        pout('✦', lx, ly, 0xffd070, 0.7, 20 * sc, 0, true, 0, true)
        // the lamp's beam: motes drifting forward, widening
        for (let i = 0; i < 10; i++) {
          const k = (clock * 0.7 + i / 10) % 1
          const [wx, wy] = at(p.x, p.y, cos, sin, sc, 16 + k * 70, (hash2(i, 5, 91) - 0.5) * (8 + k * 46))
          pout(i % 3 ? '·' : '`', wx, wy, 0xffe6a8, 0.5 * (1 - k) * (0.6 + 0.4 * Math.sin(k * 9)), 7, 0, true, 1, false)
        }
      }
      me.end()

      // ---- blasts and transient glyphs ----
      if (dt > 0) {
        const damp = Math.pow(0.2, dt)
        for (const q of fx) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= damp; q.vy = q.vy * damp + q.grav * dt; q.rot += q.vr * dt }
        let w = 0
        for (let i = 0; i < fx.length; i++) if (fx[i].t < fx[i].life) fx[w++] = fx[i]
        fx.length = w
      }
      fxB.begin()
      for (const q of fx) {
        const k = q.t / q.life
        fxB.put(q.ch, q.x, q.y, mixHex(q.c0, q.c1, k), q.a0 * (1 - k * k), q.size, q.rot, q.add, q.font, q.glow)
      }
      for (const b of run.booms ?? []) {
        const k = (time - b.at) / BOOM_T
        if (!(k >= 0 && k < 1)) continue
        const dyn = b.kind === 'dynamite'
        const out2 = 1 - (1 - k) * (1 - k) * (1 - k)
        const seed = Math.round(b.at * 997) + Math.round(b.x)
        // the heart: dense heavy '@#*' that swells and burns down
        const nc = dyn ? 16 : 12
        for (let i = 0; i < nc; i++) {
          const f = (i + 0.5) / nc
          const rr = b.r * 0.38 * Math.sqrt(f) * (0.4 + 0.8 * out2)
          const a = i * 2.39996 + seed + k * 2
          const heat = clamp01(1 - k * 1.4 - f * 0.3)
          fxB.put(['@', '#', '*', '%'][i % 4], b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr, ramp3(0x7a2a10, dyn ? 0xff7030 : 0xffa040, 0xfffbe8, heat), (1 - k) * 0.95, (dyn ? 15 : 13) * (1.2 - k * 0.5), a, true, 2, false)
        }
        // the ring of '*' '+' racing out
        const nr = dyn ? 26 : 20
        for (let i = 0; i < nr; i++) {
          const a = (i / nr) * TAU + hash2(seed, i, 3) * 0.3
          const rr = b.r * out2 * (0.85 + 0.25 * hash2(seed, i, 4))
          fxB.put(i % 2 ? '*' : '+', b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr, ramp3(0xff4a10, 0xffb040, 0xfff0c0, 1 - k), (1 - k * k) * 0.95, 11 * (1.1 - k * 0.4), a, true, 0, false)
        }
        // the smoke edge of '.' ',' behind it
        for (let i = 0; i < nr; i++) {
          const a = (i / nr) * TAU + 0.15 + hash2(seed, i, 5) * 0.3
          const rr = b.r * out2 * 1.12 + 4
          fxB.put(i % 2 ? '.' : ',', b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr, mixHex(0xc0a888, 0x403028, k), 0.7 * (1 - k), 9, a, false, 1, false)
        }
        if (k < 0.3) { fxB.put('*', b.x, b.y, 0xfff8e0, 0.9 * (1 - k / 0.3), 30, k * 3, true, 0, false); fxB.put('*', b.x, b.y, 0xffc060, 0.35 * (1 - k / 0.3), 40, k * 3, true, 0, true) }
      }
      fxB.end()

      // ---- damage numbers: small, dim like the floor, quick to go ----
      if (dt > 0) {
        let w = 0
        for (const q of nums) { q.t += dt; if (q.t < 0.5) nums[w++] = q }
        nums.length = w
      }
      numB.begin()
      for (const q of nums) {
        const k = q.t / 0.5
        const size = q.crit ? 15 : q.dot ? 9 : 12
        const al = (q.crit ? 0.85 : q.dot ? 0.4 : 0.7) * (1 - k * k)
        const col = q.crit ? 0xd0b078 : 0xaa9c86
        const y = q.y - 14 * Math.sqrt(k)
        const adv = size * 0.62
        const x0 = q.x - (q.s.length - 1) * adv / 2
        for (let i = 0; i < q.s.length; i++) numB.put(q.s[i], x0 + i * adv, y, col, al, size, 0, false, 1, false)
      }
      numB.end()

      // ---- hurt: red glyphs flaring in from the edge of the screen, never a fill ----
      scr.begin()
      if (hurtT > 0) {
        if (dt > 0) hurtT = Math.max(0, hurtT - dt)
        const f = hurtK * Math.pow(hurtT / hurt0, 0.7)
        const SC = 15, D = 4
        const nx = Math.ceil(view.w / SC), ny = Math.ceil(view.h / SC)
        const flick = Math.floor(clock * 24)
        const HURT_CH = ['#', '%', '*', '+', ':', '.']
        const cell = (i, j, depth) => {
          const h = hash2(i, j, flick)
          const dens = f * (1 - depth / D) * 1.25
          if (h > dens) return
          const ch = HURT_CH[Math.min(HURT_CH.length - 1, depth + Math.floor(hash2(i, j, 77) * 2.5))]
          const x = (i + 0.5) * SC + (hash2(i, j, flick + 1) - 0.5) * 4, y = (j + 0.5) * SC + (hash2(i, j, flick + 2) - 0.5) * 4
          scr.put(ch, x, y, mixHex(0xff4a30, 0x8a1008, depth / D), Math.min(1, f * 1.3) * (1 - depth / (D + 0.5)), 15 - depth * 1.5, 0, true, 2, false)
        }
        for (let i = 0; i < nx; i++) for (let d = 0; d < D; d++) { cell(i, d, d); cell(i, ny - 1 - d, d) }
        for (let j = D; j < ny - D; j++) for (let d = 0; d < D; d++) { cell(d, j, d); cell(nx - 1 - d, j, d) }
      }
      scr.end()
      if (getAtlas().dirty) { getAtlas().source.update(); getAtlas().dirty = false }
    },
  }
}
