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
import { CanvasSource, Container, Rectangle, Sprite, Texture } from 'pixi.js'

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
function glyphTex(ch, font = 0, glow = false) {
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

// Immediate-mode sprite batch: begin(), put() as many glyphs as this frame needs, end() hides the rest.
function makeBatch(parent) {
  const sprites = []
  let n = 0
  return {
    begin() { n = 0 },
    put(ch, x, y, color, alpha = 1, size = 16, rot = 0, add = false, font = 0, glow = false) {
      if (alpha <= 0.01) return
      let s = sprites[n]
      if (!s) { s = new Sprite(); s.anchor.set(0.5); parent.addChild(s); sprites.push(s) }
      n++
      const t = glyphTex(ch, font, glow)
      if (s.texture !== t) s.texture = t
      s.visible = true
      s.position.set(x, y)
      s.tint = color
      s.alpha = alpha > 1 ? 1 : alpha
      s.scale.set(size / EM)
      s.rotation = rot
      const bm = add ? 'add' : 'normal'
      if (s.blendMode !== bm) s.blendMode = bm
    },
    end() { for (let i = n; i < sprites.length; i++) sprites[i].visible = false; n = 0 },
    clear() { n = 0; for (const s of sprites) s.visible = false },
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
const VIS = 1.35   // creatures are drawn a little larger than their hit body: an illustration needs room

// ---- materials: a density ramp of characters (lit -> shadow) and a colour ramp ------------------
const MAT = {
  fur:   { chars: ['@', '%', '#', '&', '*', '+', '=', ':', ',', '.'], dark: 0x2a1a14, mid: 0x7a5a44, lit: 0xe6cfae },
  pink:  { chars: ['~', '~', '-', '-', '.', '.'], dark: 0x3a2224, mid: 0x9a6a68, lit: 0xf0b4a8 },
  chit:  { chars: ['@', '0', 'O', 'Q', 'o', '°', ':', '.'], dark: 0x140c1c, mid: 0x5a3a6a, lit: 0xc8a4e0 },
  scale: { chars: ['M', 'W', '&', 'w', 'v', 'v', ',', '.'], dark: 0x14200e, mid: 0x5a7a2a, lit: 0xd8e08a },
  brass: { chars: ['@', 'O', 'O', 'o', 'o', '°', '.'], dark: 0x3a2408, mid: 0xa8742a, lit: 0xffe2a0 },
  stone: { chars: ['#', '@', '&', '%', 'X', 'x', '=', '-', '.'], dark: 0x16181c, mid: 0x5e646e, lit: 0xd2d6dc },
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
  rat: {
    baseR: 12,
    parts: [part(-2, 0, 13, 8.5, 'fur', 4.6, 7.5, 11), part(11, 0, 6, 4.8, 'fur', 4, 6.5, 12)],
  },
  caveSpider: {
    baseR: 13,
    parts: [part(-7, 0, 10, 8.5, 'chit', 4.6, 8, 21), part(6, 0, 5.5, 4.5, 'chit', 4, 6.5, 22)],
  },
  kobold: {
    baseR: 22,
    parts: [part(-3, 0, 14, 10, 'scale', 5.2, 8.5, 31), part(12, 0, 7.5, 7, 'brass', 4.6, 8, 32)],
  },
  golem: {
    baseR: 28,
    parts: [part(-2, 0, 24, 22, 'stone', 7, 12, 41), part(13, -25, 9, 8, 'stone', 5.6, 10, 42), part(13, 25, 9, 8, 'stone', 5.6, 10, 43)],
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
  const amb = 0.22 + 0.12 * (1 - reach)
  for (const P of look.parts) {
    const m = P.mat
    for (const q of P.pts) {
      const nd = q.nx * Lx + q.ny * Ly + q.nz * Lz
      let I = amb + Math.max(0, nd) * (0.3 + 0.55 * reach) + (q.h - 0.5) * 0.16 - (1 - q.nz) * 0.12
      I = clamp01(I)
      const ch = m.chars[shadeIdx(m, I)]
      const wx = X + (q.x * cos - q.y * sin) * sc, wy = Y + (q.x * sin + q.y * cos) * sc
      let col = matColor(m, I)
      if (flash > 0) col = mixHex(col, 0xffffff, flash)
      out(ch, wx, wy, col, 0.3 + 0.7 * I, P.size * sc * (0.62 + 0.6 * I) * sizeMul, q.rot, false, 2, false)
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
  if (id === 'rat') {
    // tail: a long tapering S of '~' '-' '.', swaying from the root
    let px = -14, py = 0
    const n = 12
    for (let i = 1; i <= n; i++) {
      const k = i / n
      const x = -14 - k * 26, y = Math.sin(t * 5 + ph * 0.5 - k * 3.2) * 6 * k
      const ch = k < 0.35 ? '~' : k < 0.7 ? '-' : '.'
      const [wx, wy] = at(X, Y, cos, sin, sc, x, y)
      out(ch, wx, wy, mixHex(MAT.pink.mid, MAT.pink.dark, k * 0.6), (0.85 - k * 0.5) * lit + 0.15, (8 - k * 4) * sc, Math.atan2(y - py, x - px) + heading, false, 0, false)
      px = x; py = y
    }
    // feet scurrying
    for (const [fx, fy, o] of [[7, 8, 0], [7, -8, Math.PI], [-9, 8, Math.PI], [-9, -8, 0]]) {
      const [wx, wy] = at(X, Y, cos, sin, sc, fx + Math.sin(ph + o) * 3, fy * (1 + 0.1 * Math.cos(ph + o)))
      out(',', wx, wy, MAT.pink.mid, 0.7 * lit + 0.2, 6 * sc, heading, false, 0, false)
    }
    shadeParts(out, look, X, Y, cos, sin, sc, lx, ly, reach, flash)
    // ears, snout, eyes, whiskers
    for (const s of [-1, 1]) {
      let [wx, wy] = at(X, Y, cos, sin, sc, 9, 6 * s)
      out('o', wx, wy, mixHex(MAT.pink.mid, MAT.pink.lit, reach), 0.9, 6 * sc, heading, false, 0, false)
      ;[wx, wy] = at(X, Y, cos, sin, sc, 14, 2.6 * s)
      out('•', wx, wy, 0xff4a3a, 1, 4.5 * sc, 0, true, 0, false)
      out('•', wx, wy, 0xff3020, 0.5, 7 * sc, 0, true, 0, true)
      stroke(out, X, Y, cos, sin, sc, 18, 1.5 * s, 25, (5 + Math.sin(t * 9) * 0.8) * s, 3.5, 2.5, 0xd8c8b0, 0x6a5a4a, 0.8, 0.2, 2.6)
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
        const L1 = 10 * (1 - Math.abs(curl) * 0.35), L2 = 11 * (1 - Math.max(0, curl) * 0.5)
        const rx = 5 - i * 2.4, ry = 2.5 * s
        const kx = rx + Math.cos(th) * L1, ky = ry + Math.sin(th) * L1
        const th2 = th - s * (1.5 - i) * 0.3 + s * 0.35
        const fx = kx + Math.cos(th2) * L2, fy = ky + Math.sin(th2) * L2
        stroke(out, X, Y, cos, sin, sc, rx, ry, kx, ky, 7, 5.5, 0x8a6aa0, 0xb08ac8, 0.85 * lit + 0.15, 0.9 * lit + 0.1, 2.6)
        const [jx, jy] = at(X, Y, cos, sin, sc, kx, ky)
        out('°', jx, jy, MAT.chit.lit, 0.7 * lit + 0.2, 4.5 * sc, 0, false, 0, false)
        stroke(out, X, Y, cos, sin, sc, kx, ky, fx, fy, 5.5, 3, 0xb08ac8, 0x4a3a5a, 0.85 * lit + 0.1, 0.3, 2.6)
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
    stroke(out, X, Y, cos, sin, sc, 6, -8, -12 + sw, -18, 6, 6, 0x9a6a3a, 0x6a4422, 0.95 * lit + 0.05, 0.9 * lit + 0.05, 3)
    {
      const [wx, wy] = at(X, Y, cos, sin, sc, -13 + sw, -19)
      out('T', wx, wy, mixHex(0x8a949e, 0xe4ecf2, reach), 0.95, 12 * sc, heading + Math.atan2(-10, -18) + Math.PI / 2, false, 0, false)
    }
    // the helmet lamp and its little beam of motes
    const [lpx, lpy] = at(X, Y, cos, sin, sc, 19, 0)
    out('*', lpx, lpy, 0xfff2b0, 1, 9 * sc, t * 2, true, 0, false)
    out('*', lpx, lpy, 0xffc050, 0.6, 16 * sc, t * 2, true, 0, true)
    for (let i = 0; i < 6; i++) {
      const k = ((t * 0.9 + i / 6) % 1)
      const [wx, wy] = at(X, Y, cos, sin, sc, 22 + k * 22, (hash2(i, 3, 71) - 0.5) * k * 18)
      out(i % 2 ? '·' : '`', wx, wy, 0xffd890, 0.45 * (1 - k), 5 * sc, 0, true, 1, false)
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
        const col = elite ? 0x8ff4ff : 0xffa040
        out(ch, wx, wy, mixHex(col, 0xffffff, 0.3 * glowK), 0.6 + 0.4 * glowK, 7 * sc, heading, true, 1, false)
        if (i % 2 === 0) out(ch, wx, wy, col, 0.35 * glowK, 12 * sc, heading, true, 1, true)
      }
    }
    for (const s of [-1, 1]) {
      const [wx, wy] = at(X, Y, cos, sin, sc, 17, 6 * s)
      const col = elite ? 0x9cf6ff : 0xffc060
      out('•', wx, wy, col, 1, 6 * sc, 0, true, 0, false)
      out('•', wx, wy, col, 0.55, 13 * sc, 0, true, 0, true)
    }
  }
  if (elite && id !== 'golem') {
    // a slow halo of gold sparks: an elite reads at a glance
    const R = (CAST[id].baseR + 9) * sc
    for (let i = 0; i < 7; i++) {
      const a = t * 1.3 + (i / 7) * TAU
      out(i % 2 ? '✦' : '·', X + Math.cos(a) * R, Y + Math.sin(a) * R, 0xffd76a, 0.85, (i % 2 ? 6 : 7) * sc, a, true, 0, i % 2 === 1)
    }
  }
}
const GOLEM_CRACKS = [
  [[4, -10, '/'], [1, -6, '\''], [-2, -2, '/'], [-5, 2, ','], [-9, 4, '`'], [-13, 8, '/']],
  [[-6, -14, '`'], [-10, -12, '\''], [-14, -9, ','], [-18, -8, '.']],
  [[8, 6, '\\'], [10, 10, '\''], [7, 14, ','], [3, 16, '`']],
]

// ---- the cast export (static bakes for render.js's pool and the title-card thumbnails) ---------
export const ASCII_CAST = {
  rat: { baseR: 12 },
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

// ---- the renderer ------------------------------------------------------------------------------
const PRE = '@%#&*+=:-.,`\'·•°~≈∿oO0Q◇◆✦$!|/\\_TvwWM▓X^<>()[]{}"' + "'"
export function createAsciiRenderer(host) {
  const floorC = new Container(), gasC = new Container(), dropC = new Container(), mobC = new Container()
  const objC = new Container(), meC = new Container(), fxC = new Container()
  host.under.addChild(floorC, gasC, dropC, mobC)
  host.over.addChild(objC, meC, fxC)
  const floor = makeBatch(floorC), gas = makeBatch(gasC), drops = makeBatch(dropC), mob = makeBatch(mobC)
  const obj = makeBatch(objC), me = makeBatch(meC), fxB = makeBatch(fxC)
  const all = [floor, gas, drops, mob, obj, me, fxB]
  for (const ch of PRE) { glyphTex(ch, 0); glyphTex(ch, 1); glyphTex(ch, 2); glyphTex(ch, 0, true) }
  let clock = 0
  let frame = 0
  // per-creature memory: heading eases, stride phase from distance walked
  const mem = new Map()
  // transient glyph particles
  const fx = []
  const MAX_FX = 1400
  const spawn = (p) => { if (fx.length < MAX_FX) fx.push({ t: 0, vx: 0, vy: 0, rot: 0, vr: 0, add: false, a0: 1, font: 0, glow: false, grav: 0, ...p }) }
  const clearAll = () => { fx.length = 0; mem.clear(); for (const b of all) b.clear() }
  let bgSaved = null

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
    hide: ['floor', 'dust', 'gems', 'coins', 'bullets', 'novas', 'player', 'particles', 'shadows', 'crowns', 'enemies', 'text', 'telegraphs', 'affixes', 'obstacles'],
    enter() { clearAll() },
    exit() {
      clearAll()
      if (bgSaved != null && host.app?.renderer?.background) host.app.renderer.background.color = bgSaved
      bgSaved = null
    },
    filters() { return null },
    event(e) {
      switch (e.type) {
        case 'gasBlast': boomBurst(e.x, e.y, e.r, false); return true
        case 'dynamite': boomBurst(e.x, e.y, e.r, true); return true
        case 'pickaxe': {
          // the swing: a steel 'T' sweeping through an arc, a trail of strokes behind it, chips flying
          const a0 = (e.angle ?? 0) - 1.1
          for (let i = 0; i < 7; i++) {
            const a = a0 + i * 0.36, rr = (e.r ?? 30) * 0.9
            spawn({ ch: i === 6 ? 'T' : (i % 2 ? '-' : '~'), x: e.x - Math.cos(e.angle ?? 0) * rr * 0.5 + Math.cos(a) * rr, y: e.y - Math.sin(e.angle ?? 0) * rr * 0.5 + Math.sin(a) * rr,
              life: 0.12 + i * 0.03, c0: i === 6 ? 0xffffff : 0xe8f0f8, c1: 0x6a7480, size: i === 6 ? 18 : 10, rot: a + Math.PI / 2, add: i !== 6, a0: 0.4 + i * 0.09 })
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
      if (R?.background) { if (bgSaved == null) bgSaved = R.background.color?.toNumber?.() ?? 0x0a0806; R.background.color = 0x000000 }
      if (dt > 0) clock += dt
      frame++
      const p = run.player
      const pr = p.radius ?? 14
      const time = run.time ?? clock
      const BOOM_T = 0.55
      // ---- this frame's lights ----
      const lantern = run.lanternR ?? 0
      const lights = [{ x: p.x, y: p.y, r: 300 + lantern * 0.6, i: 1.05, g: 0 }]
      if (lantern > 0) lights.push({ x: p.x, y: p.y, r: lantern * 1.25, i: 0.55 + 0.05 * Math.sin(clock * 7), g: 0 })
      for (const g of run.gas ?? []) lights.push({ x: g.x, y: g.y, r: g.r * 1.5, i: 0.22, g: 1 })
      for (const L of run.gasLit ?? []) lights.push({ x: L.x, y: L.y, r: L.r * 1.9, i: 0.7 + 0.3 * Math.sin(clock * 40 + L.seed), g: 0 })
      for (const b of run.booms ?? []) {
        const k = (time - b.at) / BOOM_T
        if (k >= 0 && k < 1) lights.push({ x: b.x, y: b.y, r: b.r * 1.7, i: 0.9 * (1 - k) * (1 - k), g: 0 })
      }
      const lightAt = (x, y) => {
        let li = 0, gi = 0
        for (const L of lights) {
          const dx = x - L.x, dy = y - L.y, d2 = dx * dx + dy * dy
          if (d2 > L.r * L.r) continue
          const k = 1 - Math.sqrt(d2) / L.r
          const w = k * Math.sqrt(k) * L.i
          li += w; if (L.g) gi += w
        }
        return [li, gi]
      }

      // ---- the floor: dark rock as sparse dim characters, denser and warmer where the lamp falls ----
      floor.begin()
      const C = 15
      const i0 = Math.floor(view.left / C) - 1, i1 = Math.ceil(view.right / C) + 1
      const j0 = Math.floor(view.top / C) - 1, j1 = Math.ceil(view.bottom / C) + 1
      const FL = ['.', '`', ',', '·', '.', ':', '-', ',', ';', '~', ':', '=']
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const h = hash2(i, j, 1)
          const x = (i + 0.15 + 0.7 * hash2(i, j, 2)) * C, y = (j + 0.15 + 0.7 * hash2(i, j, 3)) * C
          const [li, gi] = lightAt(x, y)
          const rock = vnoise(x / 170, y / 170, 5)      // ridges of heavier rock: the gallery walls
          const wall = clamp01((rock - 0.58) * 5)
          const l = Math.min(1.3, li)
          if (h > 0.03 + 0.95 * Math.min(1, l * 1.2)) {
            // the dark: a rare ore glint survives
            if (hash2(i, j, 9) < 0.004) {
              const tw = 0.5 + 0.5 * Math.sin(clock * 2 + h * 40)
              floor.put('◇', x, y, hash2(i, j, 10) < 0.5 ? 0xffd27a : 0x9fe0e8, 0.12 + 0.25 * tw, 6, 0, true, 0, false)
            }
            continue
          }
          const v = clamp01(Math.min(1, l) * (0.4 + 0.6 * hash2(i, j, 4)) * 0.85 + wall * 0.15)
          let ch = FL[Math.min(FL.length - 1, Math.floor(v * FL.length))]
          if (wall > 0.3 && v > 0.25 && hash2(i, j, 6) < wall * 0.35) ch = hash2(i, j, 7) < 0.5 ? '%' : '#'
          let col = mixHex(0x33261c, 0xd8a468, v)
          if (wall > 0.3) col = mixHex(col, 0x6a6458, 0.5)
          if (gi > 0) col = mixHex(col, 0x9ad890, Math.min(0.6, gi / (li + 0.001) * 0.9))
          const isOre = hash2(i, j, 9) < 0.01
          if (isOre) {
            const tw = 0.5 + 0.5 * Math.sin(clock * 2.5 + h * 40)
            const oc = hash2(i, j, 10) < 0.5 ? 0xffd27a : 0x9fe0e8
            floor.put(hash2(i, j, 11) < 0.5 ? '◇' : '*', x, y, oc, 0.35 + 0.6 * v * tw, 7 + 4 * v, 0, true, 0, false)
            if (v > 0.35) floor.put('*', x, y, oc, 0.35 * v * tw, 14, 0, true, 0, true)
            continue
          }
          floor.put(ch, x, y, col, 0.15 + 0.85 * v + wall * 0.1, 7 + 8 * v + wall * 4, (hash2(i, j, 8) - 0.5) * 0.7, false, v > 0.6 ? 0 : 1, false)
        }
      }
      floor.end()

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
            const wl = 0.45 + Math.min(0.55, pl)
            col = mixHex(mixHex(0x2c5a3c, 0xbff0a0, 1 - f), 0xffe8b0, Math.min(0.25, pl * 0.2))
            al = (0.95 - f * 0.65) * wl * (0.75 + 0.25 * Math.sin(clock * 1.7 + k))
            sz = (f < 0.18 ? 15 : f < 0.4 ? 12 : f < 0.8 ? 9 : 7) * (1.05 - f * 0.25)
            gas.put(ch, x, y, col, al, sz, a + Math.PI / 2, false, f < 0.4 ? 0 : 1, false)
            if (f < 0.12) gas.put(ch, x, y, 0x9ef090, 0.18 * wl, sz * 1.6, a + Math.PI / 2, true, 0, true)
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
      const out = mob.put
      const AIM_T = 0.6
      for (const e of run.enemies ?? []) {
        if (e._dead) continue
        const id = CAST[e.rosterId] ? e.rosterId : null
        if (!id) continue
        const m0 = mem.get(e)
        const sc = VIS * (e.radius ?? CAST[id].baseR) / CAST[id].baseR
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
        let dA = ((want - m.heading + Math.PI) % TAU + TAU) % TAU - Math.PI
        const turn = pose === 'aim' ? 14 : id === 'golem' ? 3 : 7
        if (dt > 0) m.heading += dA * Math.min(1, dt * turn)
        m.phase += mv / (id === 'golem' ? 14 : id === 'kobold' ? 8 : 5) * 1.2
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
        // the pounce, telegraphed in characters: a dotted line of '·' and '›' to a '×' where it lands
        if (pose === 'aim' && e._pounceDirX != null) {
          const L = 188, nDots = 14
          const ux = e._pounceDirX, uy = e._pounceDirY
          for (let k = 1; k <= nDots; k++) {
            const f = k / nDots
            if (f > aimK * 1.15 + 0.1) break
            const last = k === nDots
            const pulse = 0.6 + 0.4 * Math.sin(clock * 18 - k * 0.8)
            out(last ? '×' : k % 3 === 0 ? '›' : '·', e.x + ux * L * f, e.y + uy * L * f, last ? 0xff4a3a : mixHex(0xffb070, 0xff3a2a, f),
              (0.35 + 0.65 * aimK) * pulse, last ? 16 : 9, Math.atan2(uy, ux), true, 0, last)
          }
        }
        composeCreature(out, id, X, Y, m.heading, sc, lx, ly, reach, flash, { phase: m.phase, t: clock + (m.phase % 7), pose, aimK }, !!e.elite)
      }
      for (const [k, m] of mem) if (frame - m.seen > 30 || m.dead) mem.delete(k)
      mob.end()

      // ---- the Mine's weapons ----
      obj.begin()
      for (const st of run.sticks ?? []) {
        // dynamite: a red stick of '(==)' tumbling through the air, its fuse spitting sparks
        const k = Math.min(1, st.t / st.flight)
        const x = lerp(st.fromX, st.x, k), y = lerp(st.fromY, st.y, k) - Math.sin(k * Math.PI) * 60
        const rot = k < 1 ? k * 11 : 0.4
        const ux = Math.cos(rot), uy = Math.sin(rot)
        const parts = [['(', -7], ['=', -2.5], ['=', 2.5], [')', 7]]
        for (const [ch, o] of parts) obj.put(ch, x + ux * o, y + uy * o, 0xd8402a, 1, 12, rot, false, 0, false)
        obj.put('~', x + ux * 11, y + uy * 11, 0xc8a878, 0.9, 8, rot, false, 0, false)
        const fl = 0.6 + 0.4 * Math.sin(clock * 60)
        obj.put('*', x + ux * 14, y + uy * 14, 0xfff2a0, fl, 9 + (k >= 1 ? 4 * fl : 0), clock * 20, true, 0, false)
        obj.put('*', x + ux * 14, y + uy * 14, 0xffa030, 0.5 * fl, 18, clock * 20, true, 0, true)
        if (dt > 0 && Math.random() < 0.6) {
          spawn({ ch: Math.random() < 0.5 ? '`' : '\'', x: x + ux * 14, y: y + uy * 14, vx: (Math.random() - 0.5) * 90, vy: -30 - Math.random() * 50, life: 0.3, c0: 0xffe070, c1: 0xff4010, size: 6, add: true, grav: 200 })
        }
      }
      for (const c of run.carts ?? []) {
        // the minecart: a box of '=' and '|' heaped with glinting ore, iron wheels, rails behind
        const ux = Math.cos(c.angle), uy = Math.sin(c.angle), vx = -uy, vy = ux
        const w = c.w ?? 18, L = w * 1.15
        const P = (a, b) => [c.x + ux * a + vx * b, c.y + uy * a + vy * b]
        for (const s of [-1, 1]) {
          for (let a = -L; a <= L + 0.1; a += 5) { const [x, y] = P(a, s * w); obj.put('=', x, y, 0xb88a4a, 1, 10, c.angle, false, 0, false) }
          for (let b = -w + 5; b <= w - 4.9; b += 5) { const [x, y] = P(s * L, b); obj.put('|', x, y, 0x9a6a34, 1, 10, c.angle, false, 0, false) }
          for (const f of [-1, 1]) { const [x, y] = P(f * L * 0.7, s * (w + 3)); obj.put('o', x, y, 0x8a9098, 1, 9, clock * 12, false, 0, false) }
        }
        for (let i = 0; i < 9; i++) {
          const [x, y] = P((hash2(i, 1, 81) - 0.5) * L * 1.5, (hash2(i, 2, 81) - 0.5) * w * 1.5)
          const gold = i % 3 !== 0
          obj.put(i % 2 ? '◇' : '*', x, y, gold ? 0xffd27a : 0x9fe0e8, 0.95, 8 + (i % 3) * 2, 0, true, 0, i % 4 === 0)
        }
        if (dt > 0 && frame % 3 === 0) {
          for (const s of [-1, 1]) { const [x, y] = P(-L - 4, s * w * 0.7); spawn({ ch: '=', x, y, life: 0.9, c0: 0x8a6a48, c1: 0x1a1410, size: 9, rot: c.angle, a0: 0.6 }) }
          const [x, y] = P(-L - 4, 0); spawn({ ch: '|', x, y, life: 0.9, c0: 0x6a4a30, c1: 0x140e0a, size: 11, rot: c.angle, a0: 0.5 })
        }
      }
      for (const b of run.bullets ?? []) {
        if (b.x < view.left || b.x > view.right || b.y < view.top || b.y > view.bottom) continue
        const a = Math.atan2(b.vy, b.vx)
        if (b.weapon === 'chip') {
          // pickaxe chips: tumbling flakes of rock with a two-glyph trail
          const sp = Math.hypot(b.vx, b.vy) || 1
          obj.put('•', b.x, b.y, 0xf0dcb8, 1, 9, clock * 15, false, 0, false)
          obj.put(',', b.x - b.vx / sp * 6, b.y - b.vy / sp * 6, 0xb89a70, 0.6, 7, a, false, 0, false)
          obj.put('.', b.x - b.vx / sp * 11, b.y - b.vy / sp * 11, 0x7a6448, 0.35, 6, a, false, 0, false)
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
        const m = Math.round(lantern / 7)
        for (let k = 0; k < m; k++) {
          const a = (k / m) * TAU + clock * 0.35 + Math.sin(clock + k) * 0.05
          const rr = lantern * (0.96 + 0.05 * Math.sin(clock * 2 + k * 1.3))
          const big = k % 4 === 0
          obj.put(big ? '*' : '·', p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr, big ? 0xffc860 : 0xffe0a0, big ? 0.7 : 0.5, big ? 9 : 8, a, true, 0, big)
        }
      }
      obj.end()

      // ---- you: a miner from above, brass helmet and lamp, the brightest thing in the mine ----
      me.begin()
      {
        const heading = p.facingAngle ?? (p.facing < 0 ? Math.PI : 0)
        const sc = pr / PLAYER_LOOK.baseR
        const cos = Math.cos(heading), sin = Math.sin(heading)
        const blink = (p.invuln ?? 0) > 0 && Math.floor(clock * 16) % 2 === 0
        const A = blink ? 0.35 : 1
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
        pout('@', p.x + cos * 2 * sc, p.y + sin * 2 * sc, 0xffd890, 0.45, 30 * sc, 0, true, 0, true)
        pout('@', p.x + cos * 2 * sc, p.y + sin * 2 * sc, flash ? 0xffffff : 0xfff4d8, 1, 25 * sc, 0, false, 0, false)
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
      if (getAtlas().dirty) { getAtlas().source.update(); getAtlas().dirty = false }
    },
  }
}
