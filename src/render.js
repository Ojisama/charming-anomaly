// "Cute Lab Pastel" renderer — PixiJS v8. Reads run state, never mutates it.
// All entity looks are baked into textures once; per-frame work is sprite pools only.
//
// Contract used by main.js:
//   const r = createRenderer(app)
//   r.reset(run|null)          new run started (build world) or back to title (clear)
//   r.sync(run, dt, events)    draw current state; dt=0 means "frozen behind a modal"
//   r.idle(dt)                 no run active (title screen background)
import { Assets, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js'
import { PLAYER, ENEMIES, WEAPONS, HOLE_CORE_FRAC, ELITE_AFFIXES, SHIELD_HP_FRAC, PACER_RADIUS, ORB_R, CHAPTERS, CURRENT_VIS, STORM_VIS, LIGHTNING, PHEROMONE_LIFE, SPRAY_FUSE, SPRAY_ACTIVE, SNAP_TRAP_REARM, TRAFFIC_WARN, TRAFFIC_CAR_LEN, TRAFFIC_CAR_W, DEBRIS_R, POUNCE_AIM_T, POUNCE_LEAP_T, POUNCE_LEAP_SPEED_MUL, AERIAL_MARK_T, FLASHLIGHT_RANGE, FLASHLIGHT_ARC, LINE_CHARGE_LOCK_T, LINE_CHARGE_LEN, LINE_CHARGE_W, PULL_BEAM_RANGE, PULL_BEAM_T, PULL_BEAM_W } from './config.js'
import { currentForce } from './sim.js'

const DARK = 0x3b3345
const MAX_PARTICLES = 200
const MAX_DMG_TEXTS = 30

// Foliage sprite sheet: white/shaded PNGs in src/props/, tinted per-instance at draw
// time. `eager: true` + `query: '?url'` resolves to plain URL strings at build time
// (no runtime dynamic-import graph), keeping this compatible with main.js's
// no-top-level-await / inlineDynamicImports constraints.
const PROP_MODULES = import.meta.glob('./props/*.png', { eager: true, query: '?url', import: 'default' })
const PROP_URLS = {}
for (const path in PROP_MODULES) {
  const name = path.match(/([^/]+)\.png$/)[1]
  PROP_URLS[name] = PROP_MODULES[path]
}

// Weapon/vfx sprite sheet: white/greyscale Kenney particle PNGs in src/fx/, tinted per-use
// (baked composites) or per-instance (live sprites). Same eager-url-glob trick as props
// above, folded into the same `ready` promise so both sheets land together.
const FX_MODULES = import.meta.glob('./fx/*.png', { eager: true, query: '?url', import: 'default' })
const FX_URLS = {}
for (const path in FX_MODULES) {
  const name = path.match(/([^/]+)\.png$/)[1]
  FX_URLS[name] = FX_MODULES[path]
}

const ENEMY_LOOKS = {
  drone: { fill: 0x8e97f2, line: 0x5560c9 },
  wisp: { fill: 0xffb3c6, line: 0xd5567d },
  tank: { fill: 0x7fa8d9, line: 0x4a6fa5 },
}

function mix(a, b, t) {
  const r = Math.round((a >> 16 & 255) + ((b >> 16 & 255) - (a >> 16 & 255)) * t)
  const g = Math.round((a >> 8 & 255) + ((b >> 8 & 255) - (a >> 8 & 255)) * t)
  const c = Math.round((a & 255) + ((b & 255) - (a & 255)) * t)
  return r << 16 | g << 8 | c
}

// Channel-wise multiply of two colours (== Pixi tint compositing) — lets a chapter's
// floorTint/playerTint modulate a sprite's already-baked tint. White (0xffffff) is the
// identity, so a body-chapter tint of 0xffffff leaves every baked colour untouched.
function tintMul(a, b) {
  const r = ((a >> 16 & 255) * (b >> 16 & 255) / 255) | 0
  const g = ((a >> 8 & 255) * (b >> 8 & 255) / 255) | 0
  const c = ((a & 255) * (b & 255) / 255) | 0
  return r << 16 | g << 8 | c
}

// Per-chapter render palette (CHAPTERS[id].render, config.js). BODY_RENDER is the neutral
// identity used for the title screen and any chapter that omits render data.
const BODY_RENDER = { bgColor: 0xf4efe6, floorTint: 0xffffff, playerTint: 0xffffff, tail: false }

// Deterministic pseudo-random in [0,1) from a numeric seed. Used for arc jitter so the
// jagged shape is stable frame-to-frame (no flicker, stays frozen when dt=0) instead of
// re-rolling with Math.random() every redraw.
function hash(n) {
  const s = Math.sin(n) * 43758.5453
  return s - Math.floor(s)
}

function lerp(a, b, t) { return a + (b - a) * t }

// Deterministic hash for a (cell, salt) triple — same trick as hash() above, extended
// to two cell indices so floor-scatter content (ground blotches + props) never changes
// as a cell re-enters view; it's a pure function of position, nothing is re-rolled.
function cellHash(i, j, salt) {
  return hash(i * 12.9898 + j * 78.233 + salt * 37.719)
}

export function createRenderer(app) {
  const R = app.renderer

  // Active chapter palette + whether this chapter's signature is drift currents. Set once per
  // reset(run); read by the floor populate* callbacks, syncPlayer, obstacle/enemy tinting and
  // updateCurrents. Defaults to the neutral body look (title screen / chapters without render).
  let chapterRender = BODY_RENDER
  let chapterHasCurrents = false
  // Whether the active chapter wears the night-thunderstorm overlay (CHAPTERS[].render.storm —
  // currently only `skies`). Same latch pattern as chapterHasCurrents; read by updateStorm.
  let chapterHasStorm = false
  // Active chapter's prop/obstacle biome (BIOMES, declared with the floor section below). Left null
  // here on purpose: BIOMES is a `const` further down, so reading it at construction time would be a
  // TDZ crash — it's seeded right after BIOMES itself and re-latched per reset(run).
  let chapterBiome = null

  // ---------------------------------------------------------------- textures
  // Bake a Graphics into a texture; return anchor so sprite.position = drawing origin.
  function bake(g, pad = 3) {
    const b = g.getLocalBounds()
    const frame = new Rectangle(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2)
    const tex = R.generateTexture({ target: g, frame, resolution: 2, antialias: true })
    g.destroy(true)
    return { tex, ax: -frame.x / frame.width, ay: -frame.y / frame.height }
  }

  // Same as bake(), but for a Container of Sprites (fx composites, e.g. glow-behind-star).
  // Must NOT destroy(true) — its children reference textures shared from T.fx and destroying
  // a Sprite with `texture: true` would kill that shared texture for every other user of it.
  function bakeComposite(container, pad = 3) {
    const b = container.getLocalBounds()
    const frame = new Rectangle(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2)
    const tex = R.generateTexture({ target: container, frame, resolution: 2, antialias: true })
    container.destroy({ children: true }) // children: true, texture left untouched
    return { tex, ax: -frame.x / frame.width, ay: -frame.y / frame.height }
  }

  // Kenney fx PNGs (src/fx/) are ~512px square canvases with the glyph centered but not
  // edge-to-edge (some transparent padding around it). FX_FILL is an eyeballed estimate of
  // how much of the canvas the glyph actually fills — used to convert a desired on-screen
  // px size into a sprite.scale factor without hand-tuning every single sprite. Nudge
  // FX_FILL (or the per-effect target sizes below) if the art reads too big/small in-game.
  const FX_FILL = 0.8
  function fxScale(tex, targetPx) { return targetPx / (tex.width * FX_FILL) }
  function fxRadius(tex) { return (tex.width * FX_FILL) / 2 }

  // Enemy body + baked kawaii face. `white` builds the hit-flash silhouette with
  // identical geometry (same bounds -> same anchor) so textures swap freely.
  function drawEnemy(g, type, elite, white) {
    const r = ENEMIES[type].radius
    // fallback keeps a new config.js enemy type renderable before it gets a look here
    let { fill, line } = ENEMY_LOOKS[type] ?? { fill: 0xcccccc, line: 0x888888 }
    if (elite) { fill = mix(fill, 0xff7a4d, 0.45); line = mix(line, 0xc94a1d, 0.4) }
    if (white) { fill = 0xffffff; line = 0xffffff }
    const lw = Math.max(2.5, r * 0.16)

    groundShadow(r, r * 0.95)

    if (type === 'drone') {
      g.beginPath().moveTo(0, -r + 2).lineTo(0, -r - 6).stroke({ width: lw * 0.8, color: line })
      g.circle(0, -r - 7, r * 0.17).fill(line)
      g.circle(0, 0, r).fill(fill).stroke({ width: lw, color: line })
    } else if (type === 'wisp') {
      g.circle(0, 0, r).fill(fill).stroke({ width: lw, color: line })
    } else {
      g.roundRect(-r, -r, r * 2, r * 2, r * 0.42).fill(fill).stroke({ width: lw, color: line })
    }

    if (elite) eliteCrown(type === 'drone' ? -r - 10 : -r - 1, r)

    if (!white) {
      const ex = r * 0.36
      const ey = -r * 0.08
      const er = r * 0.2
      g.circle(-ex, ey, er).fill(0xffffff)
      g.circle(ex, ey, er).fill(0xffffff)
      g.circle(-ex + r * 0.06, ey + er * 0.15, er * 0.5).fill(DARK)
      g.circle(ex + r * 0.06, ey + er * 0.15, er * 0.5).fill(DARK)
      if (elite || type === 'tank') {
        g.beginPath()
        g.moveTo(-ex - er, ey - er * 1.6).lineTo(-ex + er * 0.6, ey - er * 0.9)
        g.moveTo(ex + er, ey - er * 1.6).lineTo(ex - er * 0.6, ey - er * 0.9)
        g.stroke({ width: Math.max(2, r * 0.1), color: line, cap: 'round' })
      }
      if (type === 'tank') {
        g.beginPath().arc(0, r * 0.62, r * 0.2, Math.PI * 1.15, Math.PI * 1.85).stroke({ width: 2, color: DARK, cap: 'round' })
      } else {
        g.beginPath().arc(0, r * 0.28, r * 0.18, Math.PI * 0.15, Math.PI * 0.85).stroke({ width: 2, color: DARK, cap: 'round' })
      }
      g.circle(-ex - er * 0.9, ey + er * 1.7, er * 0.5).fill({ color: 0xff9eb0, alpha: 0.4 })
      g.circle(ex + er * 0.9, ey + er * 1.7, er * 0.5).fill({ color: 0xff9eb0, alpha: 0.4 })
    }
  }

  // maxLean 0: these are the archetype fallback blobs (daily/title/future chapters). They aren't drawn
  // nose-at-+x at all — the kawaii face looks straight OUT of the screen, eyes and smile symmetric
  // about the vertical — so there is nothing to aim. They mirror left/right and that's it.
  function makeEnemyLook(type, elite) {
    shadowSpec = null
    crownSpec = null
    const g = new Graphics()
    drawEnemy(g, type, elite, false)
    const normal = bake(g)
    const shadow = shadowSpec
    const crown = crownSpec
    const w = new Graphics()
    drawEnemy(w, type, elite, true)
    const white = bake(w)
    return {
      tex: normal.tex, white: white.tex, ax: normal.ax, ay: normal.ay,
      baseR: ENEMIES[type].radius, maxLean: 0, shadow, crown,
    }
  }

  // ---- Per-chapter creature silhouettes (v5.4) --------------------------------------
  // Each creature is built from FLOWING PARAMETRIC PATHS, not stacked circles: a spine plus a
  // half-width profile (`spineOutline`) for anything elongated, a radius-modulated closed loop
  // (`radialOutline`) for anything blobby, and arc-length-tapered polylines (`taperStroke`) for
  // legs / antennae / stingers. Volume comes from two low-alpha overlay passes in the same hue
  // (a darker underside crescent + a lighter dorsal highlight) plus hairline detail strokes.
  //
  // Each drawXxx(g, elite, white) draws IDENTICAL OUTLINE geometry in both variants — `white`
  // forces every body fill/stroke to 0xffffff for the hit-flash texture, so bounds (and thus the
  // baked anchor) match and textures swap freely. Interior detail (shading, organelles, eyes,
  // bands, veins) is normal-only since it never changes bounds.
  //
  // Every creature is drawn facing +x (RIGHT): heads/snouts point right and trailing bits (tadpole
  // tail, wasp stinger) go left. syncEnemies aims the sprite at the player off that +x nose, so it
  // is the contract — a creature drawn facing any other way will aim wrong. How FAR each one is
  // allowed to turn is its own business: see the `lean` column in ROSTER_LOOKS below.
  const ROSTER_BASE_R = { normal: ENEMIES.drone.radius, fast: ENEMIES.wisp.radius, tank: ENEMIES.tank.radius }

  // The ground shadow and the elite crown are NOT baked into the body (v5.6.5). They used to be, and
  // then the body started rotating: a creature facing north wore its shadow swung out to the side and
  // its crown lying on its ear. A shadow is cast by an overhead light and a crown is worn by gravity —
  // both belong to the WORLD, not to the body. So each draw fn now merely DECLARES where its footprint
  // and its crown sit, and makeRosterLook/makeEnemyLook hand those numbers to syncEnemies, which places
  // shared textures for them in enemyShadowLayer (under the crowd) and enemyCrownLayer (over it) at
  // rotation 0. Declaring instead of hardcoding a second table keeps the numbers next to the art that
  // chose them; drawing nothing keeps the white twin's bounds identical to the normal one's for free.
  let shadowSpec = null
  let crownSpec = null
  // soft ground shadow: an ellipse `halfW` wide, centred `cy` below the drawing origin
  function groundShadow(halfW, cy) {
    shadowSpec = { rx: halfW * 0.85, ry: Math.max(4, halfW * 0.3), y: cy }
  }
  // elite golden crown, centred over the silhouette's top edge (`top` = that y), sized off `r`
  function eliteCrown(top, r) {
    crownSpec = { top, r }
  }
  // The crown's own geometry, drawn with its base line on y=0 — baked once per distinct `r` by
  // crownLook() rather than baked once and scaled, so the 1.5px rim stays 1.5px on every creature.
  function crownPoly(g, r, white) {
    g.poly([-r * 0.34, 0, -r * 0.17, -r * 0.42, 0, -r * 0.14, r * 0.17, -r * 0.42, r * 0.34, 0])
      .fill(white ? 0xffffff : 0xffd93d).stroke({ width: 1.5, color: white ? 0xffffff : 0xc9a227 })
  }

  // ---- silhouette construction helpers ----
  // Closed loop from a polar radius function: fn(angle) -> radius. For blobs whose outline is one
  // continuous membrane (cells) rather than an assembly of discs.
  function radialOutline(fn, n = 48, sx = 1, sy = 1, cx = 0, cy = 0) {
    const pts = []
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const rad = fn(a)
      pts.push(cx + Math.cos(a) * rad * sx, cy + Math.sin(a) * rad * sy)
    }
    return pts
  }
  // Closed outline swept from a spine and a half-width profile: walk t0..t1 down one side, back up
  // the other. spine(t) -> [x, y]; halfW(t) -> half-thickness normal to the spine. A profile that
  // reaches 0 at an end closes to a point there (tail tips, stingers, gaster apex); one that stays
  // fat gives a blunt cap. This is what makes a body taper instead of being a chain of circles.
  function spineOutline(spine, halfW, n = 26, t0 = 0, t1 = 1) {
    const top = []
    const bot = []
    for (let i = 0; i <= n; i++) {
      const t = t0 + (t1 - t0) * (i / n)
      const [x, y] = spine(t)
      const [ax, ay] = spine(Math.max(0, t - 0.008))
      const [bx, by] = spine(Math.min(1, t + 0.008))
      const dx = bx - ax
      const dy = by - ay
      const len = Math.hypot(dx, dy) || 1
      const nx = -dy / len
      const ny = dx / len
      const w = halfW(t)
      top.push(x + nx * w, y + ny * w)
      bot.unshift(x - nx * w, y - ny * w)
    }
    return [...top, ...bot]
  }
  // Stroke a jointed polyline with a linear width profile along its arc length. Sub-segments with
  // round caps fuse into one smooth tapered limb, so legs/antennae narrow toward the tarsus/tip
  // instead of being uniform-width sticks. `pts` = [[x,y], ...] — real joints, not smooth arcs.
  function taperStroke(g, pts, w0, w1, color, sub = 3) {
    const segs = []
    let total = 0
    for (let i = 0; i < pts.length - 1; i++) {
      const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
      segs.push(d)
      total += d
    }
    if (total <= 0) return
    let done = 0
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i]
      const [x1, y1] = pts[i + 1]
      for (let s = 0; s < sub; s++) {
        const fa = s / sub
        const fb = (s + 1) / sub
        const t = (done + segs[i] * (fa + fb) * 0.5) / total
        g.beginPath()
          .moveTo(x0 + (x1 - x0) * fa, y0 + (y1 - y0) * fa)
          .lineTo(x0 + (x1 - x0) * fb, y0 + (y1 - y0) * fb)
          .stroke({ width: Math.max(0.7, w0 + (w1 - w0) * t), color, cap: 'round' })
      }
      done += segs[i]
    }
  }
  // Half-width profile primitive: a sine bulge over u in [0,1] shaped by exponent k (k<1 = blunt
  // and full-shouldered, k>1 = slender). u is clamped and the sine floored at 0 because float
  // drift at the endpoints (0.28 + 0.72 === 1.0000000000000002) would otherwise hand Math.pow a
  // negative base and silently produce NaN — one NaN point blanks the whole baked texture.
  function bulge(u, k) {
    return Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, u)))), k)
  }
  // A dark creature eye: no white sclera, just the lens + at most one pinprick specular.
  function darkEye(g, x, y, rx, ry, color, hi) {
    g.ellipse(x, y, rx, ry).fill(color)
    if (hi) g.circle(x + rx * 0.34, y - ry * 0.38, Math.max(0.6, rx * 0.3)).fill({ color: 0xffffff, alpha: 0.9 })
  }

  // --- Body chapter (warm pink interior) ---
  // The Body floor is a PALE warm pink (~0xf3e2dc, relative luminance ~0.79). Every creature here
  // must therefore separate from it by VALUE, not hue: deep/saturated fills and — where the fill has
  // to stay pale (the white cell IS white) — a thick dark membrane that carries the silhouette on
  // its own. Pale-on-pale is the failure mode; a hard dark edge is the fix.
  //
  // redcell: one tilted biconcave disc, but a FLEXED one — the outline radius carries a soft concave
  // dent on the upper-left plus a low 2-lobe wobble, so it is never a clean lozenge (real RBCs
  // deform as they squeeze through). Thick dark rim for edge contrast on pink, a bright specular
  // crescent along the upper-left rim so it reads as a solid object rather than a flat sticker.
  function drawRedcell(g, elite, white) {
    const r = 16
    const f = (c) => white ? 0xffffff : c
    const tilt = -0.13
    const ct = Math.cos(tilt)
    const st = Math.sin(tilt)
    const rot = (x, y) => [x * ct - y * st, x * st + y * ct]
    groundShadow(r, r * 0.85)
    // the fold: a gaussian bite out of the radius around a=2.35rad, plus a gentle 2-lobe wobble
    const fold = (a) => {
      let d = a - 2.35
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      return Math.exp(-(d / 0.62) * (d / 0.62))
    }
    const edge = (a) => r * (1 + 0.05 * Math.cos(a * 2 + 0.8) - 0.19 * fold(a))
    const disc = (k) => {
      const pts = []
      for (let i = 0; i < 56; i++) {
        const a = (i / 56) * Math.PI * 2
        const e = edge(a) * k
        pts.push(...rot(Math.cos(a) * e, Math.sin(a) * e * 0.71))
      }
      return pts
    }
    g.poly(disc(1)).fill(f(0xd64545)).stroke({ width: Math.max(3, r * 0.2), color: f(0x6e1a1a) })
    if (!white) {
      // volume: darker underside crescent, lighter dorsal sheen (both same hue family)
      g.ellipse(r * 0.05, r * 0.2, r * 0.8, r * 0.42).fill({ color: 0x8a2424, alpha: 0.26 })
      g.ellipse(-r * 0.12, -r * 0.24, r * 0.68, r * 0.3).fill({ color: mix(0xd64545, 0xffffff, 0.45), alpha: 0.16 })
      // rim specular: the top-left slice of the outline, inset and stroked bright — a lit edge
      const lit = []
      for (let i = 0; i <= 14; i++) {
        const a = Math.PI * (0.98 + (i / 14) * 0.62)
        const e = edge(a) * 0.9
        lit.push(...rot(Math.cos(a) * e, Math.sin(a) * e * 0.71))
      }
      g.poly(lit, false).stroke({ width: Math.max(1.6, r * 0.1), color: mix(0xd64545, 0xffffff, 0.6), alpha: 0.55, cap: 'round' })
      // the torus rim reads as a faint lighter ring around the biconcave dimple
      g.poly(disc(0.66)).stroke({ width: 2, color: mix(0xd64545, 0xffffff, 0.3), alpha: 0.32 })
      const [dx, dy] = rot(-r * 0.04, 0)
      g.ellipse(dx, dy, r * 0.42, r * 0.29).fill({ color: 0x8a2424, alpha: 0.34 })
      g.ellipse(dx, dy, r * 0.24, r * 0.16).fill({ color: 0x6e1a1a, alpha: 0.4 })
    }
    if (elite) eliteCrown(-r * 0.74, r)
  }
  // wbc: amoeboid ivory cell — ONE closed membrane with irregular lobes of varying depth (three
  // beat frequencies, no regular flower). The fill stays pale (it IS a white cell), so ALL of the
  // contrast against the pale pink floor is carried by a thick near-black-brown membrane plus a
  // ragged fringe of pseudopodia/filopodia around the leading (right) half — the fringe is both the
  // "this is hunting you" motion cue and what makes the silhouette unmistakably not a bubble.
  // Internal contrast comes from a deep saturated violet nucleus.
  function drawWbc(g, elite, white) {
    const r = 26
    const f = (c) => white ? 0xffffff : c
    const line = f(0x4a3f33)
    groundShadow(r, r * 1.0)
    const membrane = (a) => r * (0.82 + 0.085 * Math.cos(a * 3 + 0.6) + 0.06 * Math.cos(a * 5 - 2.1) + 0.045 * Math.sin(a * 8 + 1.2))
    // filopodia: fine tapered spikes, irregular in angle/length, clustered on the leading half.
    // Drawn before the membrane so their roots vanish under the body. Geometry is identical in both
    // variants (only the colour differs) so the white twin's bounds still match.
    const spikes = [[-1.15, 0.3], [-0.78, 0.19], [-0.42, 0.26], [-0.16, 0.14], [0.18, 0.31], [0.5, 0.17],
      [0.86, 0.24], [1.24, 0.13], [1.66, 0.22], [2.5, 0.16], [3.02, 0.25], [4.55, 0.15], [5.1, 0.21], [5.66, 0.12]]
    for (const [a, len] of spikes) {
      const rad = membrane(a)
      const x0 = Math.cos(a) * rad * 0.86
      const y0 = Math.sin(a) * rad * 0.94 * 0.86
      const x1 = Math.cos(a) * (rad + r * len)
      const y1 = Math.sin(a) * (rad + r * len) * 0.94
      taperStroke(g, [[x0, y0], [x1, y1]], Math.max(2, r * 0.11), 0.8, line, 4)
    }
    g.poly(radialOutline(membrane, 60, 1, 0.94)).fill(f(0xf2ead8)).stroke({ width: Math.max(3, r * 0.18), color: line })
    if (!white) {
      g.ellipse(r * 0.04, r * 0.3, r * 0.72, r * 0.44).fill({ color: 0xa89678, alpha: 0.3 })
      g.ellipse(-r * 0.1, -r * 0.3, r * 0.6, r * 0.34).fill({ color: 0xfffaf0, alpha: 0.3 })
      // multi-lobed nucleus: one path, three overlapping lobes (a real neutrophil read)
      const nucleus = (a) => r * 0.46 * (0.78 + 0.28 * Math.cos(a * 3 - 0.9))
      g.poly(radialOutline(nucleus, 44, 1, 1, -r * 0.06, r * 0.02)).fill({ color: 0x4a2a6b, alpha: 0.92 })
      g.poly(radialOutline((a) => nucleus(a) * 0.62, 44, 1, 1, -r * 0.06, r * 0.02)).fill({ color: 0x2d1745, alpha: 0.75 })
      for (const [gx, gy, gr] of [[-r * 0.5, -r * 0.34, r * 0.075], [r * 0.42, -r * 0.2, r * 0.06], [r * 0.5, r * 0.24, r * 0.05], [-r * 0.34, r * 0.46, r * 0.065], [r * 0.16, r * 0.52, r * 0.045], [-r * 0.62, r * 0.1, r * 0.05]]) {
        g.circle(gx, gy, gr).fill({ color: 0x6b5a8c, alpha: 0.5 })
      }
    }
    if (elite) eliteCrown(-r * 0.92, r)
  }
  // antibody: an immunoglobulin — two Fab arms + one Fc stem, built as ONE union outline (each limb
  // tapers from a wide hinge to a rounded tip, with a concave notch where the three meet). No face:
  // it's a protein. Bronze/amber rather than pale gold, because pale gold sat at nearly the same
  // value as the pink floor and disappeared; the arms are chunky and rooted in a hinge mass so it
  // reads as something that GRABS.
  function drawAntibody(g, elite, white) {
    const r = 12
    const f = (c) => white ? 0xffffff : c
    const hx = 0
    const hy = -r * 0.12
    // [angle, length, halfW at hinge, halfW at tip] — slight length/angle asymmetry keeps it organic
    const limbs = [
      [Math.PI * 0.5, r * 0.98, r * 0.42, r * 0.3],   // Fc stem, down
      [Math.PI * 1.32, r * 0.98, r * 0.4, r * 0.27],  // Fab, up-left
      [Math.PI * 1.72, r * 0.94, r * 0.38, r * 0.25], // Fab, up-right (a touch shorter)
    ].sort((a, b) => a[0] - b[0])
    groundShadow(r, r * 1.0)
    // hinge mass: a chunk of protein where the three limbs meet. Drawn under the union so its dark
    // ring only shows in the notches between limbs — it fills them out into a grabbing claw rather
    // than a thin letter Y. Same geometry in both variants; well inside the union's bounds.
    g.circle(hx, hy, r * 0.52).fill(f(0xb87a24)).stroke({ width: Math.max(2, r * 0.2), color: f(0x5e360b) })
    const pts = []
    for (const [th, len, wH, wT] of limbs) {
      const ux = Math.cos(th)
      const uy = Math.sin(th)
      const nx = -uy
      const ny = ux
      // base corners sit slightly BEHIND the hinge so the limbs fuse; the chord between adjacent
      // limbs' base corners becomes the subtle hinge notch.
      const bx = hx - ux * r * 0.06
      const by = hy - uy * r * 0.06
      const ex = hx + ux * len
      const ey = hy + uy * len
      pts.push(bx - nx * wH, by - ny * wH)
      for (let i = 0; i <= 6; i++) { // rounded tip cap
        const a = th - Math.PI * 0.5 + (i / 6) * Math.PI
        pts.push(ex + Math.cos(a) * wT, ey + Math.sin(a) * wT)
      }
      pts.push(bx + nx * wH, by + ny * wH)
    }
    g.poly(pts).fill(f(0xb87a24)).stroke({ width: Math.max(2.4, r * 0.2), color: f(0x5e360b) })
    if (!white) {
      g.ellipse(hx, hy + r * 0.5, r * 0.34, r * 0.44).fill({ color: 0x5e360b, alpha: 0.22 })
      g.ellipse(hx - r * 0.44, hy - r * 0.46, r * 0.3, r * 0.32).fill({ color: mix(0xb87a24, 0xffffff, 0.45), alpha: 0.2 })
      g.circle(hx, hy, r * 0.3).fill({ color: 0x8c5511, alpha: 0.5 }) // hinge core
      g.circle(hx, hy, r * 0.13).fill({ color: 0x5e360b, alpha: 0.55 })
      for (const [th] of limbs) { // a crease from the hinge core into each limb — reads as a joint
        g.beginPath().moveTo(hx + Math.cos(th) * r * 0.28, hy + Math.sin(th) * r * 0.28)
          .lineTo(hx + Math.cos(th) * r * 0.62, hy + Math.sin(th) * r * 0.62)
          .stroke({ width: 1.4, color: 0x5e360b, alpha: 0.4, cap: 'round' })
      }
    }
    if (elite) eliteCrown(-r * 1.1, r)
  }

  // --- Pond chapter (teal water) ---
  // The pond floor is a mid-dark teal (bg 0x2e6258 under blotches multiplied by floorTint 0x66c2a9).
  // The old roster was a low-saturation green/olive/tan family — i.e. the floor's own family — and
  // camouflaged itself. The three creatures are now pushed apart on BOTH value and hue, and each
  // takes a different corner so they are also mutually distinct:
  //   amoeba     = BRIGHT (luminous chartreuse, glows off the teal)
  //   tadpole    = DARK   (near-black, a silhouette on the teal)
  //   tardigrade = LIGHT-WARM (pale amber sand, the only warm thing in the water)
  // Elite pond bodies are tinted by a pale iridescent hue (mixed 50% to white first), so the tint
  // multiply is gentle — these fills all survive it without going muddy (nothing here relies on a
  // channel that a pale blue/pink/mint multiply would crush).
  //
  // amoeba: one membrane whose radius is a sum of broad blunt pseudopod bumps over a low base, so
  // 4 pods reach out further than the rest, ringed on the leading side by a ragged cilia fringe.
  // Translucent ectoplasm + solid endoplasm + a much darker nucleus for internal contrast.
  function drawAmoeba(g, elite, white) {
    const r = 16
    groundShadow(r, r * 1.0)
    // blunt pseudopods: wide gaussians in 4 directions, unequal reach (nothing bilaterally boring)
    const pods = [[0.35, 1.0, 0.85], [1.95, 0.86, 1.0], [3.4, 0.95, 0.78], [5.05, 0.72, 0.92]]
    const membrane = (a) => {
      let rad = 0.54
      for (const [dir, len, wid] of pods) {
        let d = a - dir
        while (d > Math.PI) d -= Math.PI * 2
        while (d < -Math.PI) d += Math.PI * 2
        rad += 0.44 * len * Math.exp(-(d / wid) * (d / wid))
      }
      return r * Math.min(1, rad)
    }
    const lw = Math.max(2.5, r * 0.17)
    const line = white ? 0xffffff : 0x3f6a0c
    // cilia: short irregular tapered spikes, densest on the leading (right) side. Under the membrane
    // so the roots are hidden; identical geometry in both variants.
    const cilia = [[-0.95, 0.22], [-0.6, 0.13], [-0.28, 0.24], [0.06, 0.15], [0.34, 0.26], [0.62, 0.12],
      [0.94, 0.2], [1.3, 0.14], [2.62, 0.19], [2.95, 0.11], [3.9, 0.13], [4.3, 0.2], [5.5, 0.12], [5.9, 0.18]]
    for (const [a, len] of cilia) {
      const rad = membrane(a)
      taperStroke(g, [[Math.cos(a) * rad * 0.85, Math.sin(a) * rad * 0.85], [Math.cos(a) * (rad + r * len), Math.sin(a) * (rad + r * len)]],
        Math.max(1.8, r * 0.1), 0.7, line, 4)
    }
    if (white) {
      g.poly(radialOutline(membrane, 60)).fill(0xffffff).stroke({ width: lw, color: 0xffffff })
    } else {
      g.poly(radialOutline(membrane, 60)).fill({ color: 0xd8f24a, alpha: 0.55 }).stroke({ width: lw, color: line })
      g.poly(radialOutline((a) => membrane(a) * 0.68, 60, 1, 1, -r * 0.03, r * 0.02)).fill(0xd8f24a)
      g.ellipse(r * 0.02, r * 0.3, r * 0.44, r * 0.24).fill({ color: 0x6d9414, alpha: 0.28 })
      g.ellipse(-r * 0.14, -r * 0.24, r * 0.36, r * 0.2).fill({ color: 0xf4ffb0, alpha: 0.35 })
      g.ellipse(r * 0.3, r * 0.16, r * 0.32, r * 0.27).fill({ color: 0x27400a, alpha: 0.85 }) // nucleus
      g.ellipse(r * 0.3, r * 0.16, r * 0.14, r * 0.12).fill({ color: 0x101c03, alpha: 0.7 })
      g.circle(-r * 0.3, -r * 0.02, r * 0.16).stroke({ width: 1.6, color: 0x3f6a0c, alpha: 0.75 }) // vacuoles
      g.circle(-r * 0.06, -r * 0.34, r * 0.1).stroke({ width: 1.3, color: 0x3f6a0c, alpha: 0.65 })
    }
    if (elite) eliteCrown(-r * 0.95, r)
  }
  // tadpole: head + trunk + tail are ONE tapered path (no seam) — a spine that runs right-to-left
  // with an S-wave and a sin profile that is fat at the head and closes to a point at the tail tip,
  // wrapped in a translucent caudal fin. Near-black body + a bright pale belly + pale-rimmed eyes:
  // at 24px on mid-teal water it reads as a dark darting silhouette with two visible eye points.
  function drawTadpole(g, elite, white) {
    const r = 12
    const f = (c) => white ? 0xffffff : c
    const noseX = r * 1.0
    const len = r * 3.2 // nose at +1.0r -> tail tip at -2.2r
    const R0 = r * 0.82
    const spine = (t) => [noseX - t * len, Math.sin(t * Math.PI * 1.65) * r * 0.3 * Math.pow(t, 1.25)]
    // Profile = a fat trunk lobe (gaussian, peaking just behind the nose) + a thin muscular tail
    // rod that carries on to a point. Keeping the two terms separate is what makes the trunk read
    // as a body and the tail as a TAIL — a single sin() bulge just gives you a leaf.
    const body = (t) => {
      const nose = t < 0.1 ? Math.sqrt(1 - Math.pow((0.1 - t) / 0.1, 2)) : 1
      const trunk = Math.exp(-Math.pow((t - 0.18) / 0.24, 2))
      const rod = 0.22 * Math.pow(Math.max(0, 1 - t), 0.85)
      return R0 * nose * (trunk + rod)
    }
    // caudal fin: a tall translucent membrane wrapping the tail rod, closing at the tip
    const fin = (t) => (t < 0.28 ? 0 : R0 * 0.95 * bulge((t - 0.28) / 0.72, 0.65))
    groundShadow(r * 1.5, r * 0.85)
    // fin first (behind the body); solid on the white twin so bounds match its translucent self
    g.poly(spineOutline(spine, fin, 26, 0.28, 1)).fill(white ? 0xffffff : { color: 0x2f2a20, alpha: 0.5 })
    g.poly(spineOutline(spine, body, 30)).fill(f(0x241d16)).stroke({ width: Math.max(2.2, r * 0.16), color: f(0x0b0806) })
    if (!white) {
      g.ellipse(r * 0.32, r * 0.34, r * 0.52, r * 0.28).fill({ color: 0xd9cfae, alpha: 0.85 }) // pale belly
      g.ellipse(r * 0.3, -r * 0.36, r * 0.42, r * 0.2).fill({ color: 0x8c8068, alpha: 0.3 })   // dorsal sheen
      g.beginPath()
      for (let i = 0; i < 3; i++) { // myotome creases across the trunk, where there is still width
        const t = 0.3 + i * 0.075
        const [x, y] = spine(t)
        const w = body(t)
        g.moveTo(x + r * 0.05, y - w * 0.82).lineTo(x - r * 0.05, y + w * 0.82)
      }
      g.stroke({ width: 1.1, color: 0x8c8068, alpha: 0.4 })
      for (const s of [-1, 1]) { // lateral eyes: prominent, set wide, bright pale rim carries them
        g.ellipse(r * 0.56, s * r * 0.52, r * 0.22, r * 0.2).fill(0xe8dfc2)
        darkEye(g, r * 0.56, s * r * 0.52, r * 0.14, r * 0.13, 0x000000, true)
      }
    }
    if (elite) eliteCrown(-r * 0.92, r)
  }
  // tardigrade: water bear in a slight 3/4 profile — ONE lumpy tapered outline (4 segment lumps
  // riding a rear-narrowing taper, rounded snout cap on the right), 4 prominent near-side legs with
  // claws + 3 darker far-side legs behind for depth. Pale warm sand body with dark legs and dark
  // segment creases: the only warm-LIGHT thing in the cool mid-value water, and the creases keep it
  // from being a featureless light blob.
  function drawTardigrade(g, elite, white) {
    const r = 26
    const f = (c) => white ? 0xffffff : c
    const far = white ? 0xffffff : 0x4a2c10
    const near = f(0x8a5320)
    const frontX = r * 0.95
    const len = r * 1.95 // snout +0.95r -> rear -1.0r
    const H = r * 0.66
    const spine = (t) => [frontX - t * len, Math.sin(t * Math.PI) * r * 0.03]
    const body = (t) => {
      const cap = bulge(Math.min(0.999, Math.max(0.001, t)), t < 0.5 ? 0.22 : 0.4)
      const ripple = 1 + 0.075 * Math.cos((t * 4 - 0.12) * Math.PI * 2)
      return H * cap * ripple * (1 - 0.3 * t)
    }
    groundShadow(r * 1.1, H + r * 0.32)
    const leg = (x, y, kx, ky, fx, fy, col, w) => {
      taperStroke(g, [[x, y], [kx, ky], [fx, fy]], w, w * 0.42, col)
      const ux = fx - kx
      const uy = fy - ky
      const m = Math.hypot(ux, uy) || 1
      for (const s of [-1, 1]) { // two tiny claws
        taperStroke(g, [[fx, fy], [fx + (ux / m) * r * 0.1 + s * (-uy / m) * r * 0.07, fy + (uy / m) * r * 0.1 + s * (ux / m) * r * 0.07]], w * 0.42, 0.8, col)
      }
    }
    // far side first (behind the body, darker) — shorter and higher, so the body overlaps them
    for (const t of [0.28, 0.55, 0.82]) {
      const [x, y] = spine(t)
      leg(x, y + H * 0.2, x - r * 0.14, y + H * 0.62, x - r * 0.2, y + H * 0.95, far, r * 0.13)
    }
    g.poly(spineOutline(spine, body, 40)).fill(f(0xecc888)).stroke({ width: Math.max(3, r * 0.14), color: f(0x6b4520) })
    // near side legs: stubby, jointed, splayed — angle/length varied per pair
    const nearLegs = [[0.2, 0.22, 1.0], [0.44, 0.06, 0.94], [0.68, -0.1, 1.0], [0.9, -0.2, 0.86]]
    for (const [t, sweep, scale] of nearLegs) {
      const [x, y] = spine(t)
      const oy = y + body(t) * 0.55
      leg(x, oy, x + sweep * r * 0.2, oy + r * 0.3 * scale, x + sweep * r * 0.34, oy + r * 0.58 * scale, near, r * 0.19)
    }
    if (!white) {
      g.ellipse(-r * 0.02, H * 0.42, r * 0.72, H * 0.44).fill({ color: 0x8a5320, alpha: 0.24 })
      g.ellipse(r * 0.06, -H * 0.4, r * 0.6, H * 0.3).fill({ color: 0xfff3d2, alpha: 0.4 })
      g.beginPath()
      for (const t of [0.24, 0.48, 0.72]) { // segment creases: deep and dark, the light body's detail
        const [x, y] = spine(t)
        const w = body(t)
        g.moveTo(x + r * 0.05, y - w * 0.86).lineTo(x - r * 0.04, y + w * 0.86)
      }
      g.stroke({ width: 2, color: 0x6b4520, alpha: 0.85 })
      g.beginPath() // far-side leg roots read as creases too
      g.moveTo(frontX - r * 0.02, -r * 0.12).lineTo(frontX - r * 0.02, r * 0.12)
      g.stroke({ width: 1.2, color: 0x6b4520, alpha: 0.5 })
      g.circle(r * 0.84, r * 0.02, r * 0.11).stroke({ width: 2.2, color: 0x4e2f12, alpha: 0.9 }) // terminal mouth ring
      g.circle(r * 0.84, r * 0.02, r * 0.045).fill({ color: 0x2a1806, alpha: 0.8 })
      // primitive eyespot: a pigment cup, but sat on a pale rim so the eye still lands at 24px
      g.ellipse(r * 0.6, -r * 0.16, r * 0.14, r * 0.125).fill(0xfff3d2)
      darkEye(g, r * 0.6, -r * 0.16, r * 0.085, r * 0.075, 0x1a1206, false)
      g.ellipse(r * 0.71, -r * 0.03, r * 0.055, r * 0.048).fill({ color: 0x1a1206, alpha: 0.5 })
    }
    if (elite) eliteCrown(-H * 1.05, r)
  }

  // --- Garden chapter (lawn green) ---
  // ant: head (right) + narrow thorax + a VISIBLE petiole node + a big tapered gaster (left) — three
  // separate flowing paths so the waist reads, 6 jointed legs (coxa->femur->tibia->tarsus) in
  // forward/mid/back pairs, elbowed antennae (scape then funiculus), mandibles.
  function drawAnt(g, elite, white) {
    const r = 16
    const f = (c) => white ? 0xffffff : c
    const line = f(0x5e2e18)
    const lw = Math.max(2.2, r * 0.12)
    groundShadow(r, r * 0.72)
    // legs: 3 per side, each 3 straight-ish segments to a fine tarsus; the far side (s=-1) is
    // slightly shorter/tighter so the pose is not mirror-boring.
    const legSets = [
      [[0.46, 0.16], [0.96, 0.72], [1.2, 1.02]],   // fore, angled forward
      [[0.28, 0.17], [0.44, 0.82], [0.32, 1.15]],  // mid, straight out
      [[0.04, 0.16], [-0.44, 0.76], [-0.88, 1.05]], // hind, angled back
    ]
    for (const s of [-1, 1]) {
      const ys = s < 0 ? 0.9 : 1
      const xs = s < 0 ? 1.04 : 1
      for (const set of legSets) {
        const p = set.map(([lx, ly]) => [lx * r * xs, s * ly * r * ys])
        taperStroke(g, [[p[0][0], p[0][1] * 0.4], ...p], r * 0.16, r * 0.05, line)
      }
    }
    // elbowed antennae: long scape, then a bent funiculus (different bends per side)
    taperStroke(g, [[r * 0.96, -r * 0.1], [r * 1.3, -r * 0.42], [r * 1.16, -r * 0.86]], r * 0.13, r * 0.045, line)
    taperStroke(g, [[r * 0.96, r * 0.1], [r * 1.34, r * 0.36], [r * 1.1, r * 0.8]], r * 0.13, r * 0.045, line)
    // mandibles: two small forward points
    taperStroke(g, [[r * 1.02, -r * 0.14], [r * 1.28, -r * 0.04]], r * 0.11, r * 0.035, line)
    taperStroke(g, [[r * 1.02, r * 0.14], [r * 1.26, r * 0.06]], r * 0.11, r * 0.035, line)
    // gaster: egg tapering to a rounded apex at the rear
    const gSpine = (t) => [-r * 0.35 - t * r * 1.0, t * r * 0.04]
    const gW = (t) => r * 0.5 * bulge(0.1 + 0.9 * t, 0.62)
    g.poly(spineOutline(gSpine, gW, 30)).fill(f(0x9e5230)).stroke({ width: lw, color: line })
    // petiole: the ant signature — a thin waist with a raised node
    taperStroke(g, [[-r * 0.36, 0], [-r * 0.06, 0]], r * 0.15, r * 0.17, f(0x9e5230))
    g.circle(-r * 0.22, -r * 0.03, r * 0.11).fill(f(0x9e5230)).stroke({ width: 1.4, color: line })
    // thorax: narrow, humped
    const tSpine = (t) => [-r * 0.06 + t * r * 0.62, -t * r * 0.04]
    const tW = (t) => r * 0.27 * (0.72 + 0.28 * bulge(Math.pow(t, 0.8), 1))
    g.poly(spineOutline(tSpine, tW, 20)).fill(f(0x9e5230)).stroke({ width: lw * 0.85, color: line })
    // head: egg, wider behind the eyes than at the mandibles
    g.poly(radialOutline((a) => r * 0.36 * (1 - 0.1 * Math.cos(a)), 40, 1, 0.95, r * 0.76, -r * 0.02))
      .fill(f(0x9e5230)).stroke({ width: lw, color: line })
    if (!white) {
      g.ellipse(-r * 0.8, r * 0.16, r * 0.42, r * 0.26).fill({ color: 0x5e2e18, alpha: 0.22 })
      g.ellipse(-r * 0.78, -r * 0.16, r * 0.34, r * 0.18).fill({ color: mix(0x9e5230, 0xffffff, 0.45), alpha: 0.16 })
      g.ellipse(r * 0.72, -r * 0.14, r * 0.2, r * 0.1).fill({ color: mix(0x9e5230, 0xffffff, 0.45), alpha: 0.16 })
      g.beginPath()
      for (const t of [0.34, 0.55, 0.75]) { // gaster tergite plates
        const [x, y] = gSpine(t)
        const w = gW(t)
        g.moveTo(x + r * 0.03, y - w * 0.88).lineTo(x - r * 0.03, y + w * 0.88)
      }
      g.stroke({ width: 1.2, color: 0x5e2e18, alpha: 0.5 })
      for (const s of [-1, 1]) darkEye(g, r * 0.84, s * r * 0.17, r * 0.13, r * 0.15, 0x2a1409, true)
    }
    if (elite) eliteCrown(-r * 0.52, r)
  }
  // wasp: pinched waist between a dark thorax and a TAPERED abdomen that closes into a fine stinger
  // (left); the 3 yellow/black bands are slices of the abdomen's own outline so they follow the
  // taper. Two translucent wings with hairline venation, swept back. Dark head, compound eyes.
  function drawWasp(g, elite, white) {
    const r = 12
    const f = (c) => white ? 0xffffff : c
    const lw = Math.max(2, r * 0.14)
    groundShadow(r, r * 0.8)
    const aSpine = (t) => [r * 0.18 - t * r * 1.22, t * r * 0.06]
    const aW = (t) => r * 0.62 * bulge(0.1 + 0.9 * t, 0.55)
    // wings first (behind); solid white on the twin so the translucent originals' bounds match
    const wing = (bx, by, tx, ty, W) => {
      const s = (t) => [bx + (tx - bx) * t, by + (ty - by) * t]
      const w = (t) => W * bulge(Math.pow(t, 0.55), 0.85)
      g.poly(spineOutline(s, w, 20)).fill(white ? 0xffffff : { color: 0xffffff, alpha: 0.4 })
        .stroke({ width: 1.2, color: white ? 0xffffff : 0xbcd2dd, alpha: white ? 1 : 0.8 })
      if (!white) {
        // Hairline venation. Each vein rides the wing's OWN half-width profile (offset = w(t)*v,
        // |v| <= 0.55), so it fans with the taper and can never reach past the wing's stroked
        // outline — which keeps the normal variant's bounds identical to the white twin's.
        const nx = -(ty - by)
        const ny = tx - bx
        const m = Math.hypot(nx, ny) || 1
        g.beginPath()
        for (const v of [-0.5, 0.05, 0.55]) {
          for (let i = 0; i <= 5; i++) {
            const t = 0.08 + (0.9 - 0.08) * (i / 5)
            const [sx, sy] = s(t)
            const o = w(t) * v
            const px = sx + (nx / m) * o
            const py = sy + (ny / m) * o
            if (i === 0) g.moveTo(px, py)
            else g.lineTo(px, py)
          }
        }
        g.stroke({ width: 1, color: 0x8fb0c0, alpha: 0.55 })
      }
    }
    wing(r * 0.5, -r * 0.16, -r * 0.9, -r * 0.82, r * 0.26)
    wing(r * 0.5, r * 0.16, -r * 0.78, r * 0.72, r * 0.22)
    // stinger: fine tapered spike off the abdomen apex (sets the left bound in both variants)
    taperStroke(g, [[-r * 1.02, r * 0.06], [-r * 1.36, r * 0.12]], r * 0.16, 0.7, f(0x2a2a2a))
    g.poly(spineOutline(aSpine, aW, 30)).fill(f(0xf2c93a)).stroke({ width: lw, color: f(0xb8942a) })
    if (!white) {
      for (const [t0, t1] of [[0.1, 0.26], [0.4, 0.56], [0.7, 0.86]]) {
        g.poly(spineOutline(aSpine, aW, 8, t0, t1)).fill(0x2a2a2a) // bands follow the taper
      }
      g.ellipse(-r * 0.4, r * 0.3, r * 0.5, r * 0.2).fill({ color: 0xb8942a, alpha: 0.2 })
      g.ellipse(-r * 0.4, -r * 0.3, r * 0.42, r * 0.14).fill({ color: mix(0xf2c93a, 0xffffff, 0.5), alpha: 0.18 })
    }
    // pinched waist (petiole)
    taperStroke(g, [[r * 0.14, 0], [r * 0.36, 0]], r * 0.14, r * 0.16, f(0x2a2a2a))
    // legs: 6 short danglers off the thorax
    for (const s of [-1, 1]) {
      const ys = s < 0 ? 0.88 : 1
      for (const [ox, kx, ky, fx, fy] of [[0.72, 0.98, 0.5, 1.1, 0.76], [0.55, 0.6, 0.58, 0.44, 0.84], [0.4, 0.24, 0.56, 0.02, 0.8]]) {
        taperStroke(g, [[r * ox, s * r * 0.1], [r * kx, s * r * ky * ys], [r * fx, s * r * fy * ys]], r * 0.12, r * 0.04, f(0x1c1c1c))
      }
    }
    // thorax + head
    const thSpine = (t) => [r * 0.34 + t * r * 0.5, 0]
    g.poly(spineOutline(thSpine, (t) => r * 0.36 * (0.76 + 0.24 * bulge(Math.pow(t, 0.7), 1)), 20))
      .fill(f(0x2a2a2a)).stroke({ width: lw * 0.8, color: f(0x101010) })
    g.poly(radialOutline((a) => r * 0.3 * (1 - 0.14 * Math.cos(a)), 32, 0.86, 1, r * 0.98, -r * 0.02))
      .fill(f(0x2a2a2a)).stroke({ width: lw * 0.7, color: f(0x101010) })
    if (!white) {
      g.ellipse(r * 0.58, -r * 0.14, r * 0.2, r * 0.1).fill({ color: 0x6a6a6a, alpha: 0.35 })
      for (const s of [-1, 1]) darkEye(g, r * 0.98, s * r * 0.15, r * 0.09, r * 0.13, 0x0b0b12, true)
    }
    if (elite) eliteCrown(-r * 0.9, r)
  }
  // spider: a large egg-shaped abdomen (left) + a distinctly smaller cephalothorax (right) joined at
  // a pedicel, 8 jointed legs (femur raised out to a knee, then tibia back down to a fine tarsus)
  // with the front pair reaching furthest, pedipalps, folium marking, and an 8-eye cluster.
  function drawSpider(g, elite, white) {
    const r = 26
    const f = (c) => white ? 0xffffff : c
    const line = f(0x3a2337)
    const lw = Math.max(2.5, r * 0.12)
    const farLine = white ? 0xffffff : mix(0x3a2337, 0x000000, 0.35)
    groundShadow(r, r * 0.95)
    // Abdomen as a TRUE OVOID. A spine + width-profile is the wrong primitive here: a sin^k profile
    // holds ~95% of max across its whole middle, which draws a barrel with flat parallel sides. So
    // parametrise the closed curve directly — x sweeps as cos(u) while the half-width carries an
    // asymmetry term (1 + k*cos u), k<0. That fattens the rear and narrows the front, putting the
    // widest point ~64% back from the pedicel, and every point sits on a curve: no straight runs,
    // no corner radius. NORM rescales the peak of that term back to 1.
    const AB = { cx: -r * 0.52, cy: -r * 0.02, L: r * 0.78, W: r * 0.6, k: -0.32, tilt: -0.1 }
    const NORM = 1.046
    const abPt = (u, sw = 1) => {
      const x = AB.L * Math.cos(u)
      const y = AB.W * sw * Math.sin(u) * (1 + AB.k * Math.cos(u)) / NORM
      const c = Math.cos(AB.tilt)
      const s = Math.sin(AB.tilt)
      return [AB.cx + x * c - y * s, AB.cy + x * s + y * c]
    }
    const abPath = (n = 56, sw = 1) => {
      const p = []
      for (let i = 0; i < n; i++) { const [x, y] = abPt((i / n) * Math.PI * 2, sw); p.push(x, y) }
      return p
    }
    // A band between two half-width scales over a u range. Both edges share the same x(u), so the
    // band tracks the abdomen's own curvature and cannot escape the silhouette at any tilt.
    const abBand = (u0, u1, swOut, swIn, n = 22) => {
      const p = []
      for (let i = 0; i <= n; i++) { const [x, y] = abPt(u0 + (u1 - u0) * (i / n), swOut); p.push(x, y) }
      for (let i = n; i >= 0; i--) { const [x, y] = abPt(u0 + (u1 - u0) * (i / n), swIn); p.push(x, y) }
      return p
    }
    // legs: origin on the cephalothorax -> raised femur to an outermost knee -> descending tibia ->
    // fine tarsus. Four distinct radial directions per side (forward / fwd-mid / back-mid / back)
    // so they splay instead of clustering; the front pair reaches furthest.
    const legSets = [
      [[0.85, 0.2], [1.5, 0.8], [1.95, 0.5], [2.08, 0.38]],
      [[0.7, 0.26], [1.1, 1.15], [1.35, 1.48], [1.44, 1.58]],
      [[0.52, 0.28], [0.32, 1.25], [0.26, 1.55], [0.24, 1.66]],
      [[0.36, 0.26], [-0.35, 1.05], [-0.9, 1.35], [-1.08, 1.45]],
    ]
    const legs = (s, col) => {
      const ys = s < 0 ? 0.9 : 1
      const xs = s < 0 ? 1.02 : 1
      for (const set of legSets) {
        taperStroke(g, set.map(([lx, ly]) => [lx * r * xs, s * ly * r * ys]), r * 0.15, r * 0.028, col)
      }
    }
    legs(-1, farLine) // far side first: darker and behind the body, for depth
    g.poly(abPath()).fill(f(0x5b3a52)).stroke({ width: lw, color: line })
    // pedicel + cephalothorax (clearly smaller)
    taperStroke(g, [[r * 0.16, 0], [r * 0.34, 0]], r * 0.1, r * 0.12, f(0x5b3a52))
    const cSpine = (t) => [r * 0.24 + t * r * 0.72, 0]
    const cW = (t) => r * 0.48 * bulge(0.2 + 0.7 * t, 0.5)
    g.poly(spineOutline(cSpine, cW, 24)).fill(f(0x5b3a52)).stroke({ width: lw * 0.85, color: line })
    legs(1, line) // near side on top, so the legs read as attaching to the cephalothorax
    // pedipalps
    for (const s of [-1, 1]) taperStroke(g, [[r * 0.86, s * r * 0.12], [r * 1.08, s * r * 0.3], [r * 1.2, s * r * 0.22]], r * 0.1, r * 0.04, line)
    if (!white) {
      // folium: a soft lanceolate dorsal marking that rides the abdomen's own curvature (it reuses
      // the same (1 + k*cos u) asymmetry), pointed at both ends, gently scalloped. Its half-width is
      // <=0.45 of the outline's at the same u while its x is pulled in, so it stays well inside.
      const fol = []
      for (let i = 0; i < 48; i++) {
        const u = (i / 48) * Math.PI * 2
        const su = Math.sin(u)
        const x = AB.L * 0.78 * Math.cos(u)
        const y = AB.W * 0.4 * Math.sign(su) * Math.pow(Math.abs(su), 1.45) *
          (1 + AB.k * Math.cos(u)) / NORM * (1 + 0.12 * Math.cos(u * 3))
        const c = Math.cos(AB.tilt)
        const s = Math.sin(AB.tilt)
        fol.push(AB.cx + x * c - y * s, AB.cy + x * s + y * c)
      }
      g.poly(fol).fill({ color: 0xe0b8d8, alpha: 0.26 })
      g.poly(abBand(0.12 * Math.PI, 0.92 * Math.PI, 1, 0.42)).fill({ color: 0x3a2337, alpha: 0.2 })
      g.poly(abBand(-0.85 * Math.PI, -0.25 * Math.PI, 0.86, 0.4)).fill({ color: mix(0x5b3a52, 0xffffff, 0.45), alpha: 0.15 })
      g.ellipse(r * 0.58, -r * 0.14, r * 0.24, r * 0.1).fill({ color: mix(0x5b3a52, 0xffffff, 0.5), alpha: 0.16 })
      g.beginPath()
      for (const u of [0.42 * Math.PI, 0.66 * Math.PI]) { // faint chitin ridges, across the curve
        const [x0, y0] = abPt(u, 0.82)
        const [x1, y1] = abPt(-u, 0.82)
        g.moveTo(x0, y0).lineTo(x1, y1)
      }
      g.stroke({ width: 1.1, color: 0x3a2337, alpha: 0.3 })
      // eye cluster: 2 big + 6 small, two ranks, each with a pinprick
      for (const [ex, ey, er] of [[0.85, -0.09, 0.062], [0.85, 0.09, 0.062], [0.74, -0.19, 0.036], [0.74, 0.19, 0.036], [0.93, -0.19, 0.034], [0.93, 0.19, 0.034], [0.69, -0.04, 0.032], [0.69, 0.04, 0.032]]) {
        darkEye(g, r * ex, r * ey, r * er, r * er, 0x150d16, er > 0.05)
      }
    }
    if (elite) eliteCrown(-r * 0.72, r)
  }

  // --- Undergrowth chapter (dead-leaf loam) ---
  // The undergrowth floor is the DARKEST biome yet: bg 0x2b2417 under blotches multiplied by
  // floorTint 0x8a7a4e lands around 0x514628, relative luminance ~0.06. Dark-on-dark is the failure
  // mode, and going darker still cannot win (pure black only reaches 2.3x against a floor this dim),
  // so all three predators are LIGHT — spread across the light half so they also stay mutually
  // distinct by VALUE, not just by hue and shape:
  //   cat = LIGHTEST  (pale silver tabby, 5.6x on the loam)
  //   owl = MID-LIGHT (tawny gold, 4.3x)
  //   rat = DIMMEST   (dusty grey-mauve, 2.8x — still well clear of the ~1.5x invisibility floor)
  //
  // cat: a crouched tabby in profile — ONE tapered outline carrying the whole feline back line (a
  // raised haunch, a dipped waist, a rising shoulder) as terms of its own width profile, rather than
  // a chain of discs. Real leg joints: the hind leg zigzags hip->stifle->hock->paw, which is what
  // makes it read as a cat gathering itself rather than a quadruped diagram.
  function drawCat(g, elite, white) {
    const r = 26
    const f = (c) => white ? 0xffffff : c
    const line = f(0x453b2e)
    const far = white ? 0xffffff : 0x8f8673
    const lw = Math.max(2.6, r * 0.11)
    const rearX = -r * 0.88
    const len = r * 1.58 // rump -0.88r -> chest +0.7r
    const H = r * 0.42
    const spine = (t) => [rearX + t * len, -r * 0.03 - Math.sin(t * Math.PI * 1.1 + 0.4) * r * 0.07]
    // profile = blunt end caps × (haunch bulge - waist pinch + shoulder bulge). Keeping the three
    // masses as separate gaussian terms on ONE profile is what gives the back its curve.
    const body = (t) => {
      const cap = bulge(t, 0.3)
      const haunch = 0.48 * Math.exp(-Math.pow((t - 0.15) / 0.2, 2))
      const waist = -0.22 * Math.exp(-Math.pow((t - 0.52) / 0.18, 2))
      const shoulder = 0.3 * Math.exp(-Math.pow((t - 0.86) / 0.22, 2))
      return H * cap * (1 + haunch + waist + shoulder)
    }
    groundShadow(r * 1.05, r * 0.92)
    const leg = (pts, col, w) => taperStroke(g, pts, w, w * 0.5, col)
    // far side first (behind the body, darker + tucked shorter) — depth without mirror symmetry
    leg([[-r * 0.5, r * 0.1], [-r * 0.3, r * 0.46], [-r * 0.5, r * 0.72], [-r * 0.28, r * 0.84]], far, r * 0.14)
    leg([[r * 0.34, r * 0.12], [r * 0.38, r * 0.5], [r * 0.3, r * 0.82]], far, r * 0.13)
    // tail: three real joints off the rump, tapering as it curls up (never a uniform-width arc)
    taperStroke(g, [[-r * 0.8, -r * 0.06], [-r * 1.18, -r * 0.24], [-r * 1.36, -r * 0.64], [-r * 1.16, -r * 0.98]],
      r * 0.17, r * 0.05, f(0xb9b0a0), 4)
    g.poly(spineOutline(spine, body, 40)).fill(f(0xcfc8b8)).stroke({ width: lw, color: line })
    // near legs: the hind one gathered under the haunch, the fore one planted — different poses
    leg([[-r * 0.4, r * 0.14], [-r * 0.16, r * 0.5], [-r * 0.42, r * 0.78], [-r * 0.14, r * 0.92]], f(0xbcb3a2), r * 0.19)
    leg([[r * 0.5, r * 0.14], [r * 0.46, r * 0.56], [r * 0.58, r * 0.9]], f(0xbcb3a2), r * 0.17)
    // ears: wedges, not cones — a wide base narrowing to an off-vertical tip, the near one bigger
    g.poly([r * 0.66, -r * 0.44, r * 0.58, -r * 0.9, r * 0.86, -r * 0.56]).fill(f(0xcfc8b8)).stroke({ width: lw * 0.7, color: line })
    g.poly([r * 0.92, -r * 0.46, r * 1.04, -r * 0.86, r * 1.12, -r * 0.4]).fill(f(0xcfc8b8)).stroke({ width: lw * 0.7, color: line })
    // head: egg, a touch deeper than tall, with the muzzle carried on the same outline
    g.poly(radialOutline((a) => r * 0.3 * (1 - 0.1 * Math.cos(a)), 40, 1, 0.94, r * 0.86, -r * 0.26))
      .fill(f(0xcfc8b8)).stroke({ width: lw, color: line })
    if (!white) {
      // volume: darker belly crescent, lighter dorsal sheen along the back (same hue family)
      g.ellipse(-r * 0.14, r * 0.26, r * 0.72, r * 0.24).fill({ color: 0x6b6153, alpha: 0.22 })
      g.ellipse(-r * 0.2, -r * 0.28, r * 0.6, r * 0.16).fill({ color: mix(0xcfc8b8, 0xffffff, 0.5), alpha: 0.16 })
      g.ellipse(r * 0.8, -r * 0.4, r * 0.18, r * 0.09).fill({ color: mix(0xcfc8b8, 0xffffff, 0.5), alpha: 0.18 })
      // tabby bars: slices of the body's OWN outline, so the stripes follow the taper
      for (const [t0, t1] of [[0.16, 0.24], [0.36, 0.43], [0.56, 0.62]]) {
        g.poly(spineOutline(spine, (t) => body(t) * 0.92, 6, t0, t1)).fill({ color: 0x6b6153, alpha: 0.34 })
      }
      g.beginPath() // fur tufts along the belly line — hairline, reads as texture not outline
      for (const t of [0.3, 0.45, 0.6, 0.75]) {
        const [x, y] = spine(t)
        const w = body(t)
        g.moveTo(x, y + w * 0.8).lineTo(x - r * 0.06, y + w * 1.04)
      }
      g.stroke({ width: 1.2, color: 0x8b8273, alpha: 0.6 })
      g.beginPath() // inner ear
      g.moveTo(r * 0.68, -r * 0.48).lineTo(r * 0.64, -r * 0.8).lineTo(r * 0.8, -r * 0.56)
      g.stroke({ width: 1.4, color: 0x9c8878, alpha: 0.7 })
      g.ellipse(r * 1.1, -r * 0.16, r * 0.13, r * 0.1).fill({ color: 0xb0a695, alpha: 0.9 }) // muzzle
      g.ellipse(r * 1.14, -r * 0.2, r * 0.05, r * 0.04).fill({ color: 0x5b4a3f, alpha: 0.9 })  // nose
      darkEye(g, r * 0.96, -r * 0.3, r * 0.1, r * 0.08, 0x1e2a12, true) // slit-ish predator eye
    }
    // whiskers: they reach past the ears, so they are part of the SILHOUETTE, not interior detail —
    // drawn in both variants (identical geometry) or the white twin's bounds would come up short
    g.beginPath()
    for (const s of [-1, 1]) g.moveTo(r * 1.08, -r * 0.14).lineTo(r * 1.42, -r * 0.14 + s * r * 0.16)
    g.stroke({ width: 1, color: white ? 0xffffff : 0xe8e2d4, alpha: white ? 1 : 0.5 })
    if (elite) eliteCrown(-r * 0.95, r)
  }
  // owl: seen from above-behind mid-swoop — body along x (head right), wings spread ±y and swept
  // back, each ONE tapered membrane with a scalloped trailing edge. The primaries are separate
  // tapered fingers off each tip (that splay is the owl read), and the barbs ride each wing's own
  // half-width profile — the same trick the wasp's venation uses, so they fan with the taper and can
  // never escape the outline, keeping the white twin's bounds identical.
  function drawOwl(g, elite, white) {
    const r = 12
    const f = (c) => white ? 0xffffff : c
    const line = f(0x6b4715)
    const lw = Math.max(1.8, r * 0.13)
    groundShadow(r * 1.2, r * 1.05)
    const wing = (s, tipX, tipY, W) => {
      const bx = r * 0.1
      const by = s * r * 0.3
      const sp = (t) => [bx + (tipX - bx) * t, by + (tipY - by) * t + s * Math.sin(t * Math.PI) * r * 0.16]
      // fat at the shoulder, tapering to the wrist; scalloped along the trailing half
      const w = (t) => W * bulge(Math.pow(t, 0.5), 0.8) * (1 + 0.09 * Math.cos(t * 9))
      g.poly(spineOutline(sp, w, 24)).fill(f(0xd9a959)).stroke({ width: lw * 0.8, color: line })
      // primaries: 4 tapered fingers fanning off the wingtip, each at its own angle
      for (let i = 0; i < 4; i++) {
        const a = Math.atan2(tipY - by, tipX - bx) + (i - 1.5) * 0.3
        taperStroke(g, [[tipX, tipY], [tipX + Math.cos(a) * r * 0.5, tipY + Math.sin(a) * r * 0.5]],
          W * 0.5, W * 0.14, f(0xc99447), 3)
      }
      if (!white) {
        const nx = -(tipY - by)
        const ny = tipX - bx
        const m = Math.hypot(nx, ny) || 1
        g.beginPath()
        for (const v of [-0.45, 0.5]) { // barbs, riding the wing's own half-width
          for (let i = 0; i <= 5; i++) {
            const t = 0.12 + 0.76 * (i / 5)
            const [sx, sy] = sp(t)
            const o = w(t) * v
            const px = sx + (nx / m) * o
            const py = sy + (ny / m) * o
            if (i === 0) g.moveTo(px, py)
            else g.lineTo(px, py)
          }
        }
        g.stroke({ width: 1, color: 0x8a5d1e, alpha: 0.5 })
      }
    }
    wing(-1, -r * 0.62, -r * 1.5, r * 0.34) // swept back, unequal reach per side
    wing(1, -r * 0.5, r * 1.42, r * 0.3)
    // tail fan: short tapered rectrices off the rear
    for (let i = 0; i < 3; i++) {
      const a = Math.PI + (i - 1) * 0.28
      taperStroke(g, [[-r * 0.62, 0], [-r * 0.62 + Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6]],
        r * 0.16, r * 0.07, f(0xc99447), 3)
    }
    // talons: two small hooked grabs under the body
    for (const s of [-1, 1]) {
      taperStroke(g, [[r * 0.2, s * r * 0.24], [r * 0.44, s * r * 0.5], [r * 0.66, s * r * 0.44]], r * 0.11, r * 0.035, f(0x8a6a2a))
    }
    // body: one blunt ovoid, tail-end left
    const bSpine = (t) => [-r * 0.66 + t * r * 1.4, 0]
    g.poly(spineOutline(bSpine, (t) => r * 0.44 * bulge(0.12 + 0.82 * t, 0.5), 26))
      .fill(f(0xd9a959)).stroke({ width: lw, color: line })
    // head: big and round, set forward-right, the classic owl disc
    g.poly(radialOutline((a) => r * 0.42 * (1 - 0.05 * Math.cos(a)), 36, 1, 0.96, r * 0.72, -r * 0.06))
      .fill(f(0xd9a959)).stroke({ width: lw, color: line })
    if (!white) {
      g.ellipse(0, r * 0.24, r * 0.5, r * 0.2).fill({ color: 0x7d5518, alpha: 0.24 })
      g.ellipse(-r * 0.1, -r * 0.22, r * 0.42, r * 0.14).fill({ color: mix(0xd9a959, 0xffffff, 0.5), alpha: 0.16 })
      g.beginPath() // breast barring — hairline chevrons, the owl's texture
      for (const t of [0.35, 0.5, 0.65]) {
        const [x] = bSpine(t)
        g.moveTo(x - r * 0.1, -r * 0.24).lineTo(x, -r * 0.06).lineTo(x - r * 0.1, r * 0.12)
      }
      g.stroke({ width: 1.1, color: 0x8a5d1e, alpha: 0.5 })
      // facial disc: a pale heart-shaped mask, the one light accent, carrying both eyes
      g.poly(radialOutline((a) => r * 0.34 * (1 + 0.14 * Math.cos(a * 2)), 32, 1, 1, r * 0.76, -r * 0.04))
        .fill({ color: 0xf2dcae, alpha: 0.85 })
      for (const s of [-1, 1]) darkEye(g, r * 0.78, s * r * 0.17, r * 0.11, r * 0.11, 0x120c05, true)
    }
    taperStroke(g, [[r * 0.94, -r * 0.02], [r * 1.16, r * 0.1]], r * 0.09, 0.8, f(0x3a2a10)) // beak (silhouette)
    if (elite) eliteCrown(-r * 1.62, r)
  }
  // centipede: top-down forest-floor predator — ONE tapered trunk (spineOutline) carrying an
  // S-undulation (sine in the spine) so it reads sinuous, not a stick; 16 tergite segments over a
  // LONG (~4.4r) body, ONE short leg pair per segment drawn on BOTH sides (for s of [-1,1] ->
  // symmetric about the forward axis, which is why lean 90 works), the pairs raking in a
  // metachronal wave. Head at +x with long forward antennae and prominent forward FORCIPULES (the
  // venom pincer-claws that curve inward to a point — the read that makes it a hunter, not a worm),
  // plus twin longer anal legs trailing the rear. Warm rust-amber body (0xdb7b3c, ~3.06x on the
  // loam — above the rat's 2.8x) with a dark rim.
  // ANIMATED: the 4th arg `phase` shifts the spine's sine; ROSTER_LOOKS declares `phases: 6`, so
  // makeRosterLook bakes 6 wave positions and syncEnemies flips through them — the wave travels
  // head -> tail and the centipede SLITHERS. Everything derives from spine(t), so one parameter
  // moves the outline, legs, creases and keel together.
  function drawCentipede(g, elite, white, phase = 0) {
    const r = 12
    const f = (c) => white ? 0xffffff : c
    const line = f(0x5e2e18)
    const fang = f(0x47230f)
    const lw = Math.max(2, r * 0.13)
    const frontX = r * 1.05
    const len = r * 4.4 // trunk front +1.05r -> rounded tail -3.35r: LONG, like the real thing
    const undA = r * 0.28
    // S-undulation: ~1.3 full sine cycles along the length, offset by `phase`. The whole drawing
    // (outline, legs, creases, keel) derives from this one spine, so shifting the phase slithers
    // everything coherently — makeRosterLook bakes several phases and syncEnemies flips through
    // them, making the wave TRAVEL down the body. Minus phase => crests move head -> tail, which
    // reads as the body pushing backward against the ground (forward locomotion).
    // With >= a full cycle in view, some crest is always near max, so getLocalBounds is phase-
    // invariant and the frames don't jitter against each other.
    const spine = (t) => [frontX - t * len, Math.sin(t * Math.PI * 2.6 - phase) * undA]
    // near-uniform worm width, closing to a rounded (not pointed) rear; the anal legs give the point
    const body = (t) => r * 0.4 * bulge(0.05 + 0.9 * t, 0.4)
    groundShadow(r * 2.6, r * 0.2) // long ellipse — the centipede is long along x
    // legs first, so the trunk overlaps their roots and they read as attaching underneath.
    const N = 16
    for (let i = 0; i < N; i++) {
      const t = 0.08 + 0.84 * (i / (N - 1))
      const [x, y] = spine(t)
      const w = body(t)
      const ph = Math.sin(i * 0.9 - phase)      // metachronal wave, rowing with the slither
      const reach = 1 + 0.16 * Math.sin(t * Math.PI) // mid-body legs a touch longer
      for (const s of [-1, 1]) {
        const base = [x, y + s * w * 0.6]
        const knee = [x - r * 0.12 + ph * r * 0.06, y + s * (w + r * 0.26 * reach)]
        const foot = [x - r * 0.26 + ph * r * 0.12, y + s * (w + r * 0.46 * reach)]
        taperStroke(g, [base, knee, foot], r * 0.09, r * 0.028, line)
      }
    }
    // twin anal legs: longer, trailing back and out off the tail — a centipede signature
    const [tx, ty] = spine(0.99)
    for (const s of [-1, 1]) {
      taperStroke(g, [[tx, ty + s * r * 0.1], [tx - r * 0.3, ty + s * r * 0.32], [tx - r * 0.58, ty + s * r * 0.46]], r * 0.1, r * 0.03, line)
    }
    // antennae: long, forward and out — the furthest +x reach (sets the nose bound)
    for (const s of [-1, 1]) {
      taperStroke(g, [[r * 1.3, s * r * 0.12], [r * 1.7, s * r * 0.3], [r * 2.02, s * r * 0.22]], r * 0.09, r * 0.03, line)
    }
    // forcipules: forward venom claws that curve INWARD to a point (tips converge on the midline)
    for (const s of [-1, 1]) {
      taperStroke(g, [[r * 1.24, s * r * 0.22], [r * 1.54, s * r * 0.26], [r * 1.72, s * r * 0.05]], r * 0.11, r * 0.03, fang)
    }
    // trunk: one flowing tapered outline over the legs
    g.poly(spineOutline(spine, body, 44)).fill(f(0xdb7b3c)).stroke({ width: lw, color: line })
    // head: an egg that narrows toward the front, overlapping the trunk's front
    g.poly(radialOutline((a) => r * 0.32 * (1 - 0.12 * Math.cos(a)), 36, 1, 0.92, r * 1.18, 0))
      .fill(f(0xdb7b3c)).stroke({ width: lw, color: line })
    if (!white) {
      // darker dorsal keel-ribbon, riding the same undulating spine (well inside the outline)
      g.poly(spineOutline(spine, (t) => body(t) * 0.3, 30)).fill({ color: 0x8f3f1a, alpha: 0.4 })
      g.ellipse(-r * 0.9, r * 0.02, r * 1.9, r * 0.18).fill({ color: 0x5e2e18, alpha: 0.16 }) // low flank shadow
      g.beginPath()
      for (let i = 0; i < N; i++) { // hairline tergite creases at each segment, following the wiggle
        const t = 0.12 + 0.8 * (i / (N - 1))
        const [x, y] = spine(t)
        const w = body(t)
        g.moveTo(x + r * 0.02, y - w * 0.85).lineTo(x - r * 0.02, y + w * 0.85)
      }
      g.stroke({ width: 1, color: 0x5e2e18, alpha: 0.5 })
      g.ellipse(r * 1.24, -r * 0.12, r * 0.16, r * 0.09).fill({ color: mix(0xdb7b3c, 0xffffff, 0.5), alpha: 0.2 }) // head sheen
      for (const s of [-1, 1]) darkEye(g, r * 1.3, s * r * 0.16, r * 0.06, r * 0.06, 0x1a0d05, true) // small ocelli
    }
    if (elite) eliteCrown(-r * 0.9, r)
  }
  // rat: nose to rump is ONE tapered path (fat over the hips, closing to a pointed snout on the
  // right) with a long NAKED tail — the tail is the silhouette read, so it's a separate S-curved
  // taper that keeps narrowing all the way to a whip tip, and it carries hairline scale rings
  // instead of fur.
  function drawRat(g, elite, white) {
    const r = 16
    const f = (c) => white ? 0xffffff : c
    const line = f(0x413533)
    const lw = Math.max(2.2, r * 0.13)
    const snoutX = r * 1.05
    const len = r * 1.85 // snout +1.05r -> rump -0.8r
    const spine = (t) => [snoutX - t * len, -r * 0.04 + Math.sin(t * Math.PI * 0.9) * r * 0.06]
    // snout cap on the right closes to a near-point; the mass sits over the hips at t~0.7
    const body = (t) => {
      const cap = bulge(0.04 + 0.94 * t, t < 0.4 ? 1.1 : 0.42)
      return r * 0.56 * cap * (1 + 0.22 * Math.exp(-Math.pow((t - 0.72) / 0.26, 2)))
    }
    groundShadow(r * 1.05, r * 0.72)
    // tail: an S that keeps tapering to a whip tip — three joints, drawn before the body
    const tail = [[-r * 0.72, r * 0.04], [-r * 1.3, -r * 0.14], [-r * 1.85, r * 0.16], [-r * 2.3, -r * 0.02]]
    taperStroke(g, tail, r * 0.15, r * 0.035, f(0xc2a49c), 5)
    // legs: hind gathered under the hips, fore short and forward — real joints, far side darker
    const far = white ? 0xffffff : 0x6b5a56
    taperStroke(g, [[-r * 0.42, r * 0.24], [-r * 0.24, r * 0.52], [-r * 0.44, r * 0.7]], r * 0.11, r * 0.04, far)
    taperStroke(g, [[r * 0.36, r * 0.2], [r * 0.42, r * 0.48], [r * 0.56, r * 0.62]], r * 0.1, r * 0.035, far)
    g.poly(spineOutline(spine, body, 34)).fill(f(0x9b8a86)).stroke({ width: lw, color: line })
    taperStroke(g, [[-r * 0.34, r * 0.26], [-r * 0.1, r * 0.58], [-r * 0.34, r * 0.8], [-r * 0.06, r * 0.86]], r * 0.13, r * 0.045, f(0x8d7d79))
    taperStroke(g, [[r * 0.44, r * 0.22], [r * 0.5, r * 0.54], [r * 0.66, r * 0.7]], r * 0.12, r * 0.04, f(0x8d7d79))
    // ears: big thin rounded discs, the near one larger — a rat's ears are half its head
    g.poly(radialOutline((a) => r * 0.26, 24, 1, 1, r * 0.24, -r * 0.5)).fill(f(0x9b8a86)).stroke({ width: lw * 0.7, color: line })
    g.poly(radialOutline((a) => r * 0.2, 24, 1, 1, r * 0.44, -r * 0.42)).fill(f(0x9b8a86)).stroke({ width: lw * 0.7, color: line })
    if (!white) {
      g.ellipse(-r * 0.2, r * 0.24, r * 0.6, r * 0.2).fill({ color: 0x4e4240, alpha: 0.24 })
      g.ellipse(-r * 0.3, -r * 0.26, r * 0.5, r * 0.14).fill({ color: mix(0x9b8a86, 0xffffff, 0.5), alpha: 0.16 })
      g.circle(r * 0.24, -r * 0.5, r * 0.15).fill({ color: 0xc99a96, alpha: 0.75 }) // inner ear
      g.beginPath()
      for (let i = 0; i < 5; i++) { // tail scale rings — hairline, the "naked tail" cue
        const t = 0.2 + i * 0.18
        const a = tail[0]
        const x = lerp(-r * 0.9, -r * 2.2, t)
        g.moveTo(x, -r * 0.16 + Math.sin(t * 4) * r * 0.1).lineTo(x + r * 0.04, r * 0.16 + Math.sin(t * 4) * r * 0.1)
      }
      g.stroke({ width: 1, color: 0x8a6c66, alpha: 0.45 })
      g.beginPath() // guard-hair tufts along the back
      for (const t of [0.45, 0.6, 0.75]) {
        const [x, y] = spine(t)
        const w = body(t)
        g.moveTo(x, y - w * 0.85).lineTo(x - r * 0.06, y - w * 1.1)
      }
      g.stroke({ width: 1.1, color: 0x6b5a56, alpha: 0.55 })
      g.ellipse(r * 1.0, r * 0.02, r * 0.07, r * 0.06).fill({ color: 0xd0a0a0, alpha: 0.9 }) // nose
      darkEye(g, r * 0.6, -r * 0.16, r * 0.09, r * 0.085, 0x160f0e, true)
    }
    // whiskers reach past the snout — silhouette, not detail: same geometry in both variants
    g.beginPath()
    for (const s of [-1, 1]) g.moveTo(r * 0.98, r * 0.04).lineTo(r * 1.5, r * 0.04 + s * r * 0.24)
    g.stroke({ width: 1, color: white ? 0xffffff : 0xd8ccc8, alpha: white ? 1 : 0.45 })
    if (elite) eliteCrown(-r * 0.6, r)
  }

  // --- City chapter (cold concrete) ---
  // The city floor is a dim neutral grey (bg 0x2c2f38 under floorTint 0x9aa0ac → ~0x585c5c,
  // luminance ~0.11). Everything here is a MACHINE or a city animal, so no creature eyes: lenses,
  // sensors and beaks instead. Value ladder (a grey floor gives no hue to hide behind, so value is
  // doing all the work):
  //   vacuum   = LIGHTEST (white appliance plastic, 5.6x)
  //   ratDrone = MID      (safety-amber chassis, 3.6x)
  //   pigeon   = DIMMEST  (slate blue-grey, 2.8x)
  //
  // vacuum: a disc robot in 3/4 — the silhouette is ONE closed loop (the top ellipse's upper arc,
  // then the same ellipse's lower arc dropped by the shell height), which is what draws a real
  // cylinder rather than two stacked ovals. Bumper band, sensor turret with a dark lens, panel
  // seams and rivets as hairline detail.
  function drawVacuum(g, elite, white, phase = 0) {
    const r = 26
    const f = (c) => white ? 0xffffff : c
    const line = f(0x5c5f66)
    const lw = Math.max(2.6, r * 0.1)
    const rx = r * 0.92
    const ry = r * 0.44
    const hgt = r * 0.34
    // one continuous shell loop: over the top, down the right wall, back under, up the left wall
    const shell = () => {
      const p = []
      for (let i = 0; i <= 30; i++) { const a = Math.PI + (i / 30) * Math.PI; p.push(Math.cos(a) * rx, Math.sin(a) * ry) }
      for (let i = 0; i <= 30; i++) { const a = (i / 30) * Math.PI; p.push(Math.cos(a) * rx, Math.sin(a) * ry + hgt) }
      return p
    }
    groundShadow(r * 1.05, ry + hgt + r * 0.14)
    // caster wheel peeking under the front rim (same geometry in both variants)
    g.ellipse(r * 0.5, ry + hgt * 0.9, r * 0.12, r * 0.09).fill(f(0x3f434a))
    g.poly(shell()).fill(f(0xe9eaec)).stroke({ width: lw, color: line })
    if (!white) {
      // volume: the wall in shadow under the lit top face — a cylinder, not a sticker
      g.poly(shell()).fill({ color: 0x000000, alpha: 0 })
      g.ellipse(0, hgt * 0.5, rx * 0.99, ry * 0.62).fill({ color: 0x6f747c, alpha: 0.2 })
      g.ellipse(0, 0, rx, ry).fill(0xdfe1e4).stroke({ width: 1.6, color: 0xa8adb5, alpha: 0.8 }) // top face
      g.ellipse(-r * 0.18, -r * 0.14, rx * 0.6, ry * 0.42).fill({ color: 0xffffff, alpha: 0.5 })  // dorsal sheen
      // bumper band: a slice of the shell's own lower wall, so it wraps with the curve
      const bump = []
      for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI; bump.push(Math.cos(a) * rx, Math.sin(a) * ry + hgt * 0.22) }
      for (let i = 24; i >= 0; i--) { const a = (i / 24) * Math.PI; bump.push(Math.cos(a) * rx, Math.sin(a) * ry + hgt) }
      g.poly(bump).fill({ color: 0x4a4e55, alpha: 0.85 })
      g.beginPath() // panel seams across the top face — hairline, reads as moulding
      g.ellipse(0, 0, rx * 0.72, ry * 0.72).stroke({ width: 1.2, color: 0xa8adb5, alpha: 0.7 })
      g.ellipse(0, 0, rx * 0.3, ry * 0.3).stroke({ width: 1.2, color: 0xa8adb5, alpha: 0.55 })
      for (let i = 0; i < 8; i++) { // rivets around the rim
        const a = (i / 8) * Math.PI * 2
        g.circle(Math.cos(a) * rx * 0.86, Math.sin(a) * ry * 0.86, 1.3).fill({ color: 0x8f959d, alpha: 0.8 })
      }
      // sensor turret + lens: the "face" a machine is allowed — a dark lens with one specular
      g.ellipse(r * 0.34, -r * 0.06, r * 0.2, r * 0.13).fill(0xc4c8cd).stroke({ width: 1.4, color: 0x8f959d })
      darkEye(g, r * 0.36, -r * 0.07, r * 0.1, r * 0.07, 0x14171c, true)
      g.rect(-r * 0.3, hgt * 0.62, r * 0.6, r * 0.09).fill({ color: 0x2f333a, alpha: 0.8 }) // brush slot
      // police light bar (v5.6.14, user: "police roombas"): twin domes on a dark base amidships,
      // ALTERNATING red/blue via the baked-phase mechanism (phases: 2 in ROSTER_LOOKS — the
      // centipede's slither machinery; syncEnemies strobes the two frames at ~10 flips/s). The
      // lit side gets a soft halo; halos sit well inside the shell, so bounds stay phase-invariant.
      const lit = phase >= Math.PI // phase 0 = red side on, phase pi = blue side on
      const lamp = (x, col, on) => {
        g.circle(x, -r * 0.3, r * 0.11).fill({ color: col, alpha: on ? 1 : 0.35 })
        if (on) g.circle(x, -r * 0.3, r * 0.24).fill({ color: col, alpha: 0.22 }) // glow halo
      }
      g.roundRect(-r * 0.3, -r * 0.36, r * 0.6, r * 0.14, r * 0.05).fill({ color: 0x2f333a, alpha: 0.9 })
      lamp(-r * 0.16, 0xff3040, !lit)
      lamp(r * 0.16, 0x2f7bff, lit)
    }
    if (elite) eliteCrown(-ry - r * 0.06, r)
  }
  // ratDrone: a quadrotor — small hard chassis, four arms that TAPER out to motor pods (real joints:
  // each arm elbows once), spinning rotors as low-alpha discs (solid on the white twin, the wasp-wing
  // trick, so bounds match), a forward sensor lens, and the rat-catcher's cage slung underneath.
  function drawRatDrone(g, elite, white) {
    const r = 16
    const f = (c) => white ? 0xffffff : c
    const line = f(0x6b4a10)
    const lw = Math.max(2, r * 0.12)
    groundShadow(r * 1.05, r * 0.86)
    // arms + pods first, so the chassis overlaps their roots. Front pair reaches further forward.
    const arms = [[r * 1.05, -r * 0.86], [r * 0.95, r * 0.8], [-r * 0.86, -r * 0.78], [-r * 0.8, r * 0.72]]
    for (const [px, py] of arms) {
      const ex = px * 0.45
      const ey = py * 0.62 // the elbow: arms kink, they don't sweep
      taperStroke(g, [[ex * 0.3, ey * 0.3], [ex, ey], [px, py]], r * 0.16, r * 0.08, f(0xc98f2a), 3)
      g.circle(px, py, r * 0.14).fill(f(0xa8741f)).stroke({ width: 1.4, color: line })
    }
    for (const [px, py] of arms) { // rotor discs: the blur of a blade, not a blade
      g.ellipse(px, py, r * 0.42, r * 0.4).fill(white ? 0xffffff : { color: 0xf6e3b4, alpha: 0.3 })
        .stroke({ width: 1, color: white ? 0xffffff : 0xf6e3b4, alpha: white ? 1 : 0.45 })
    }
    // chassis: a hard tapered wedge, nose right — a machine reads by its straightness
    const cSpine = (t) => [-r * 0.58 + t * r * 1.28, 0]
    const cW = (t) => r * 0.4 * (0.55 + 0.45 * bulge(Math.pow(t, 0.7), 1.3))
    g.poly(spineOutline(cSpine, cW, 22)).fill(f(0xf2b13c)).stroke({ width: lw, color: line })
    if (!white) {
      g.ellipse(0, r * 0.16, r * 0.5, r * 0.14).fill({ color: 0x8a6210, alpha: 0.24 })
      g.ellipse(-r * 0.06, -r * 0.16, r * 0.42, r * 0.1).fill({ color: mix(0xf2b13c, 0xffffff, 0.5), alpha: 0.2 })
      g.beginPath() // panel lines along the chassis — hairline
      g.moveTo(-r * 0.44, -r * 0.1).lineTo(r * 0.5, -r * 0.1)
      g.moveTo(-r * 0.44, r * 0.1).lineTo(r * 0.5, r * 0.1)
      g.stroke({ width: 1, color: 0x8a6210, alpha: 0.5 })
      g.rect(-r * 0.3, -r * 0.12, r * 0.26, r * 0.24).fill({ color: 0x2f2a1c, alpha: 0.7 }) // battery bay
      // cage: the rat-catcher's business end, slung under the nose
      g.beginPath()
      g.moveTo(r * 0.2, r * 0.16).lineTo(r * 0.2, r * 0.5).lineTo(r * 0.7, r * 0.5).lineTo(r * 0.7, r * 0.14)
      for (const cx of [r * 0.33, r * 0.46, r * 0.58]) g.moveTo(cx, r * 0.18).lineTo(cx, r * 0.5)
      g.stroke({ width: 1.2, color: 0x5c4a28, alpha: 0.85 })
      // forward sensor lens (no eyes — it's a drone)
      g.circle(r * 0.62, 0, r * 0.14).fill(0x9c6f1c)
      darkEye(g, r * 0.62, 0, r * 0.09, r * 0.09, 0x12100a, true)
      g.circle(-r * 0.5, 0, r * 0.05).fill({ color: 0xff4d5e, alpha: 0.9 }) // tail beacon
    }
    if (elite) eliteCrown(-r * 1.28, r)
  }
  // pigeon: a plump city bird in profile facing right — ONE outline that swells over the crop and
  // closes into a wedge tail on the left, a folded wing sitting inside it with hairline covert
  // edges, and the iridescent neck patch (the only saturated thing on it) as a two-pass shimmer.
  function drawPigeon(g, elite, white) {
    const r = 12
    const f = (c) => white ? 0xffffff : c
    const line = f(0x3f4a57)
    const lw = Math.max(1.9, r * 0.13)
    groundShadow(r * 1.0, r * 0.92)
    // feet: two small jointed grabs, drawn before the body so the tarsi tuck under it
    for (const s of [0, 1]) {
      const ox = s ? r * 0.42 : r * 0.16
      taperStroke(g, [[ox, r * 0.42], [ox + r * 0.04, r * 0.72], [ox + r * 0.2, r * 0.8]], r * 0.09, r * 0.035, f(0xd98a6a))
      taperStroke(g, [[ox + r * 0.04, r * 0.72], [ox - r * 0.14, r * 0.8]], r * 0.06, 0.7, f(0xd98a6a), 2)
    }
    // tail: a wedge of rectrices off the rear, tapering to a squared-off fan
    const tSpine = (t) => [-r * 0.5 - t * r * 0.9, t * r * 0.12]
    g.poly(spineOutline(tSpine, (t) => r * 0.3 * (1 - 0.45 * t), 12)).fill(f(0x7b90a6)).stroke({ width: lw * 0.7, color: line })
    // body: fat over the crop (front), closing toward the tail — a pigeon is front-heavy
    const bSpine = (t) => [r * 0.62 - t * r * 1.24, -r * 0.06 + t * r * 0.1]
    const body = (t) => r * 0.56 * bulge(0.16 + 0.74 * t, 0.55) * (1 + 0.16 * Math.exp(-Math.pow((t - 0.24) / 0.3, 2)))
    g.poly(spineOutline(bSpine, body, 28)).fill(f(0x8fa8bf)).stroke({ width: lw, color: line })
    // head + neck: one small blunt taper rising forward-right off the crop
    const hSpine = (t) => [r * 0.44 + t * r * 0.62, -r * 0.36 - t * r * 0.28]
    g.poly(spineOutline(hSpine, (t) => r * 0.3 * bulge(0.3 + 0.65 * t, 0.6), 16)).fill(f(0x8fa8bf)).stroke({ width: lw * 0.8, color: line })
    g.poly(radialOutline((a) => r * 0.28, 28, 1, 0.96, r * 0.98, -r * 0.62)).fill(f(0x8fa8bf)).stroke({ width: lw * 0.8, color: line })
    taperStroke(g, [[r * 1.16, -r * 0.6], [r * 1.5, -r * 0.5]], r * 0.1, r * 0.03, f(0x4a4a52)) // beak
    if (!white) {
      g.ellipse(-r * 0.1, r * 0.24, r * 0.5, r * 0.2).fill({ color: 0x4f6070, alpha: 0.26 })
      g.ellipse(-r * 0.06, -r * 0.3, r * 0.42, r * 0.14).fill({ color: mix(0x8fa8bf, 0xffffff, 0.5), alpha: 0.18 })
      // folded wing: a lanceolate plate riding the body's own profile, with covert hairlines
      const wg = []
      for (let i = 0; i <= 20; i++) { const t = 0.14 + 0.66 * (i / 20); const [x, y] = bSpine(t); wg.push(x, y + body(t) * 0.1) }
      for (let i = 20; i >= 0; i--) { const t = 0.14 + 0.66 * (i / 20); const [x, y] = bSpine(t); wg.push(x, y + body(t) * 0.86) }
      g.poly(wg).fill({ color: 0x6d829a, alpha: 0.9 })
      g.beginPath()
      for (const t of [0.3, 0.45, 0.6, 0.75]) {
        const [x, y] = bSpine(t)
        g.moveTo(x, y + body(t) * 0.18).lineTo(x - r * 0.08, y + body(t) * 0.8)
      }
      g.stroke({ width: 1, color: 0x46586b, alpha: 0.6 })
      g.beginPath() // the two dark wing bars every city pigeon has
      for (const t of [0.36, 0.52]) {
        const [x, y] = bSpine(t)
        g.moveTo(x + r * 0.02, y + body(t) * 0.22).lineTo(x - r * 0.06, y + body(t) * 0.82)
      }
      g.stroke({ width: 2.2, color: 0x36414e, alpha: 0.8 })
      // iridescent neck: two low-alpha passes (green over violet) on the throat only
      g.poly(spineOutline(hSpine, (t) => r * 0.3 * bulge(0.3 + 0.65 * t, 0.6) * 0.9, 12, 0.05, 0.8))
        .fill({ color: 0x3fd08a, alpha: 0.5 })
      g.poly(spineOutline(hSpine, (t) => r * 0.3 * bulge(0.3 + 0.65 * t, 0.6) * 0.55, 12, 0.3, 0.95))
        .fill({ color: 0xa06cf0, alpha: 0.45 })
      // pigeon eye: orange iris ring + dark pupil (a bird's eye, no sclera)
      g.circle(r * 1.06, -r * 0.66, r * 0.1).fill(0xf2913a)
      darkEye(g, r * 1.06, -r * 0.66, r * 0.05, r * 0.05, 0x140c06, true)
      g.circle(r * 1.2, -r * 0.56, r * 0.05).fill({ color: 0xe8e2d8, alpha: 0.8 }) // cere
    }
    if (elite) eliteCrown(-r * 0.98, r)
  }

  // --- Skies chapter (night thunderstorm) ---
  // v5.6.17: the skies floor FLIPPED DARK for the storm redesign: bg 0x2a3240 under floorTint
  // 0x717c88 → effective floor luminance ~0.07 (was ~0.38 pre-flip). That inverts the rule this
  // section used to run on — light military greys would now vanish, so every machine goes LIGHT,
  // spread across the same contrast multiples as before (just mirrored: light-on-dark, not
  // dark-on-light) so the three stay tellable apart by hue + silhouette, not just value:
  //   jet        = BRIGHTEST (pale steel-blue gunmetal, 4.8x)
  //   helicopter = MID       (bright olive drab, 3.5x)
  //   tankColumn = DIMMEST of the three (pale khaki/tan, still 2.2-4.0x across its parts)
  //
  // jet: top-down, nose right — fuselage is ONE spine tapering from a needle nose to the exhaust,
  // and the delta wings are real polygons with a swept leading edge meeting a straight trailing edge
  // at a hard angle (a fighter's read is its ANGLES; anything rounded looks like a toy).
  function drawJet(g, elite, white) {
    const r = 12
    const f = (c) => white ? 0xffffff : c
    const line = f(0x14181e)
    const lw = Math.max(1.8, r * 0.11)
    groundShadow(r * 1.1, r * 1.0)
    // delta wings: leading edge sweeps back from the shoulder, trailing edge runs straight across
    for (const s of [-1, 1]) {
      const sc = s < 0 ? 1 : 0.94 // a hair of asymmetry so it never reads as a stencil
      g.poly([
        r * 0.5, s * r * 0.16,
        -r * 0.32, s * r * 1.34 * sc,
        -r * 0.72, s * r * 1.3 * sc,
        -r * 0.66, s * r * 0.2,
      ]).fill(f(0xb6c4d2)).stroke({ width: lw * 0.8, color: line })
    }
    for (const s of [-1, 1]) { // tailplanes: the same wedge, smaller, further aft
      g.poly([-r * 0.7, s * r * 0.16, -r * 1.14, s * r * 0.66, -r * 1.32, s * r * 0.6, -r * 1.22, s * r * 0.14])
        .fill(f(0xb6c4d2)).stroke({ width: lw * 0.7, color: line })
    }
    // fuselage: needle nose right, tapering back to a blunt exhaust
    const spine = (t) => [r * 1.5 - t * r * 2.9, 0]
    const body = (t) => r * 0.3 * bulge(0.02 + 0.9 * t, t < 0.35 ? 1.4 : 0.4)
    g.poly(spineOutline(spine, body, 30)).fill(f(0xb6c4d2)).stroke({ width: lw, color: line })
    if (!white) {
      g.ellipse(-r * 0.2, r * 0.12, r * 0.7, r * 0.12).fill({ color: 0x0e1116, alpha: 0.3 })
      g.ellipse(-r * 0.2, -r * 0.1, r * 0.7, r * 0.08).fill({ color: 0x7d8b9c, alpha: 0.22 }) // dorsal sheen
      g.beginPath() // panel lines + wing spars — hairline, the whole "military hardware" texture
      g.moveTo(r * 0.9, 0).lineTo(-r * 1.2, 0)
      for (const s of [-1, 1]) {
        g.moveTo(r * 0.36, s * r * 0.18).lineTo(-r * 0.4, s * r * 1.1)
        g.moveTo(-r * 0.16, s * r * 0.2).lineTo(-r * 0.5, s * r * 1.16)
      }
      g.stroke({ width: 1, color: 0x6b7684, alpha: 0.45 })
      for (const s of [-1, 1]) { // intakes
        g.ellipse(r * 0.24, s * r * 0.26, r * 0.16, r * 0.08).fill({ color: 0x0b0e12, alpha: 0.9 })
      }
      // canopy: a glass bubble, the one bright specular on the whole airframe
      g.poly(radialOutline((a) => r * 0.2 * (1 - 0.3 * Math.cos(a)), 24, 1, 0.7, r * 0.62, 0)).fill(0x1d2b3a)
      g.ellipse(r * 0.68, -r * 0.05, r * 0.11, r * 0.05).fill({ color: 0x9fd8ff, alpha: 0.75 })
      g.ellipse(-r * 1.3, 0, r * 0.09, r * 0.14).fill({ color: 0xff8c42, alpha: 0.55 }) // afterburner
      for (const s of [-1, 1]) { // roundels
        g.circle(-r * 0.34, s * r * 0.62, r * 0.09).fill({ color: 0xd94d4d, alpha: 0.7 })
      }
    }
    if (elite) eliteCrown(-r * 1.36, r)
  }
  // helicopter: top-down, nose right — a fat cockpit tapering into a long thin tail boom is ONE
  // profile (that length ratio IS the helicopter read), with the rotor as a big low-alpha disc
  // implying spin over it. The disc is drawn solid on the white twin (wasp-wing trick) since it
  // sets the bounds, and two blade streaks inside it keep it from reading as a bubble.
  function drawHelicopter(g, elite, white) {
    const r = 16
    const f = (c) => white ? 0xffffff : c
    const line = f(0x1c2216)
    const lw = Math.max(2, r * 0.11)
    groundShadow(r * 1.1, r * 1.05)
    // tail fin + tail rotor, drawn first so the boom overlaps their roots
    g.poly([-r * 1.32, -r * 0.1, -r * 1.62, -r * 0.44, -r * 1.72, -r * 0.1, -r * 1.6, r * 0.12])
      .fill(f(0x9cae66)).stroke({ width: lw * 0.7, color: line })
    g.ellipse(-r * 1.62, -r * 0.28, r * 0.1, r * 0.34).fill(white ? 0xffffff : { color: 0xc4d0b4, alpha: 0.35 })
    for (const s of [-1, 1]) { // skids: two straight rails, offset — not a smooth arc
      g.rect(-r * 0.5, s * r * 0.46 - r * 0.04, r * 1.16, r * 0.08).fill(f(0x333c2b))
      taperStroke(g, [[r * 0.3, s * r * 0.2], [r * 0.34, s * r * 0.44]], r * 0.07, r * 0.05, f(0x333c2b), 2)
      taperStroke(g, [[-r * 0.3, s * r * 0.2], [-r * 0.34, s * r * 0.44]], r * 0.07, r * 0.05, f(0x333c2b), 2)
    }
    // fuselage: bulbous cockpit right, closing into a slender boom left — one continuous taper
    const spine = (t) => [r * 0.98 - t * r * 2.3, 0]
    const body = (t) => {
      const cab = 0.52 * Math.exp(-Math.pow((t - 0.14) / 0.24, 2))
      const boom = 0.12 * Math.pow(Math.max(0, 1 - t), 0.5)
      return r * bulge(0.04 + 0.9 * t, 0.7) * (cab + boom)
    }
    g.poly(spineOutline(spine, body, 34)).fill(f(0x9cae66)).stroke({ width: lw, color: line })
    if (!white) {
      g.ellipse(r * 0.3, r * 0.2, r * 0.5, r * 0.14).fill({ color: 0x232b1b, alpha: 0.3 })
      g.ellipse(r * 0.3, -r * 0.2, r * 0.44, r * 0.1).fill({ color: 0x93a37f, alpha: 0.22 })
      g.beginPath() // boom frames + door seam
      g.moveTo(-r * 0.4, 0).lineTo(-r * 1.3, 0)
      for (const x of [-r * 0.6, -r * 0.9, -r * 1.15]) g.moveTo(x, -r * 0.14).lineTo(x, r * 0.14)
      g.moveTo(r * 0.24, -r * 0.44).lineTo(r * 0.24, r * 0.44)
      g.stroke({ width: 1, color: 0x8d9c79, alpha: 0.45 })
      g.poly(radialOutline((a) => r * 0.3 * (1 - 0.28 * Math.cos(a)), 24, 1, 0.86, r * 0.78, 0)).fill(0x1f2c33) // canopy glass
      g.ellipse(r * 0.84, -r * 0.08, r * 0.14, r * 0.07).fill({ color: 0x9fd8ff, alpha: 0.7 })
      g.circle(r * 0.2, 0, r * 0.1).fill({ color: 0x2a3320, alpha: 0.8 }) // rotor mast head
    }
    // rotor disc LAST: the blur sits over everything it turns above. It sets the bounds, so the rim
    // stroke has to exist in BOTH variants (solid on the twin) — the wasp-wing rule.
    g.ellipse(r * 0.2, 0, r * 1.34, r * 1.26).fill(white ? 0xffffff : { color: 0xdfe8d2, alpha: 0.22 })
      .stroke({ width: 1.2, color: white ? 0xffffff : 0xdfe8d2, alpha: white ? 1 : 0.4 })
    if (!white) {
      g.beginPath() // two blade smears inside the disc — spin, not a bubble
      for (const a of [0.5, 2.6]) {
        g.moveTo(r * 0.2 - Math.cos(a) * r * 1.28, -Math.sin(a) * r * 1.2)
        g.lineTo(r * 0.2 + Math.cos(a) * r * 1.28, Math.sin(a) * r * 1.2)
      }
      g.stroke({ width: 1.5, color: 0xeef4e6, alpha: 0.3 })
    }
    if (elite) eliteCrown(-r * 1.3, r)
  }
  // tankColumn: 3/4 from the front-right — a sloped hull whose glacis, roof and rear are ONE
  // outline (a tank is a faceted box; the silhouette must have real corners, so this is a poly with
  // deliberate angles, not a sin profile), riding a track band with road wheels, turret and a
  // tapered gun barrel with a muzzle brake pointing right.
  function drawTankColumn(g, elite, white) {
    const r = 26
    const f = (c) => white ? 0xffffff : c
    const line = f(0x2b2718)
    const lw = Math.max(2.6, r * 0.1)
    groundShadow(r * 1.15, r * 0.78)
    // track band: a slab with rounded ends (idler + drive sprocket), the whole thing sits low
    const trk = []
    for (let i = 0; i <= 16; i++) { const a = -Math.PI / 2 + (i / 16) * Math.PI; trk.push(r * 0.86 + Math.cos(a) * r * 0.24, r * 0.44 + Math.sin(a) * r * 0.24) }
    for (let i = 0; i <= 16; i++) { const a = Math.PI / 2 + (i / 16) * Math.PI; trk.push(-r * 0.86 + Math.cos(a) * r * 0.24, r * 0.44 + Math.sin(a) * r * 0.24) }
    g.poly(trk).fill(f(0x8a7f5e)).stroke({ width: lw * 0.8, color: line })
    // hull: hard facets — sloped glacis on the right, flat roof, cut-back rear
    g.poly([
      r * 1.02, r * 0.3, r * 0.62, -r * 0.16, // glacis slope
      r * 0.34, -r * 0.28, -r * 0.72, -r * 0.28, // roof
      -r * 0.98, r * 0.04, -r * 0.98, r * 0.34, // rear plate
    ]).fill(f(0xb3a374)).stroke({ width: lw, color: line })
    // turret: a squat faceted mass, offset back from the glacis
    g.poly([
      r * 0.42, -r * 0.3, r * 0.26, -r * 0.66, -r * 0.28, -r * 0.72,
      -r * 0.52, -r * 0.5, -r * 0.5, -r * 0.3,
    ]).fill(f(0xc2b183)).stroke({ width: lw, color: line })
    // gun: a long taper to a muzzle brake — the reach IS the threat read
    taperStroke(g, [[r * 0.2, -r * 0.5], [r * 1.5, -r * 0.5]], r * 0.1, r * 0.07, f(0x998a5f), 4)
    g.rect(r * 1.42, -r * 0.6, r * 0.18, r * 0.2).fill(f(0x998a5f)).stroke({ width: 1.4, color: line })
    if (!white) {
      g.poly([r * 1.02, r * 0.3, r * 0.62, -r * 0.16, r * 0.34, -r * 0.28, -r * 0.72, -r * 0.28, -r * 0.98, r * 0.04, -r * 0.98, r * 0.34])
        .fill({ color: 0x000000, alpha: 0 })
      g.rect(-r * 0.98, r * 0.1, r * 2.0, r * 0.24).fill({ color: 0x3b3423, alpha: 0.3 }) // hull in shadow, low
      g.beginPath()
      g.moveTo(r * 0.62, -r * 0.16).lineTo(-r * 0.72, -r * 0.16)
      g.stroke({ width: 2, color: 0xa2966d, alpha: 0.25 }) // lit roof edge
      // road wheels + track links: hairline, the detail that sells "tracks"
      for (let i = 0; i < 5; i++) {
        const x = -r * 0.72 + i * r * 0.36
        g.circle(x, r * 0.44, r * 0.12).fill({ color: 0x2b2718, alpha: 0.55 })
        g.circle(x, r * 0.44, r * 0.05).fill({ color: 0xc2b183, alpha: 0.5 })
      }
      g.beginPath()
      for (let i = 0; i < 14; i++) {
        const x = -r * 1.08 + i * r * 0.16
        g.moveTo(x, r * 0.2).lineTo(x, r * 0.68)
      }
      g.stroke({ width: 1, color: 0x1f1c11, alpha: 0.4 })
      g.beginPath() // turret + hull panel seams
      g.moveTo(r * 0.26, -r * 0.62).lineTo(-r * 0.26, -r * 0.66)
      g.moveTo(-r * 0.5, -r * 0.34).lineTo(-r * 0.28, -r * 0.68)
      g.stroke({ width: 1.2, color: 0x9a8f66, alpha: 0.4 })
      for (const [rx, ry] of [[r * 0.5, -r * 0.24], [-r * 0.6, -r * 0.22], [-r * 0.9, r * 0.1]]) {
        g.circle(rx, ry, 1.4).fill({ color: 0x9a8f66, alpha: 0.55 }) // rivets
      }
      // vision block: a dark glass slit, a machine's "eye"
      g.rect(r * 0.28, -r * 0.56, r * 0.14, r * 0.07).fill(0x141208)
      g.rect(r * 0.29, -r * 0.555, r * 0.05, r * 0.02).fill({ color: 0x9fd8ff, alpha: 0.6 })
      g.circle(-r * 0.36, -r * 0.68, r * 0.05).fill({ color: 0x8a7f5e, alpha: 0.9 }) // hatch periscope
    }
    if (elite) eliteCrown(-r * 0.76, r)
  }

  // --- Beyond chapter (violet void) ---
  // The beyond floor is the DARKEST of all seven: bg 0x120a26 under floorTint 0x6a5fa0 → ~0x362d4e,
  // luminance ~0.03. Everything here therefore GLOWS — these are the brightest bodies in the game
  // (7-9x), which is also what makes them survive the eliteIridescent multiply: the pale hues mix
  // 50% to white before tinting, so the worst-case channel factor is ~0.87 and no body here leans on
  // a channel that could be crushed to mud.
  //   blinker    = BRIGHTEST (cyan glitch, 9.1x)
  //   swarmDrone = MID       (amber, 7.0x)
  //   flicker    = DIMMEST   (violet, 5.2x — it is the one that's half-there)
  //
  // blinker: a form that cannot hold still — a faceted crystal (hard angular radius, jittered per
  // vertex by the deterministic hash so it's irregular but stable) with two GHOST ECHOES offset
  // fore/aft of it, drawn solid on the white twin so bounds match. The echoes are the whole idea:
  // you see where it just was and where it's about to be.
  function drawBlinker(g, elite, white) {
    const r = 26
    const f = (c) => white ? 0xffffff : c
    const line = f(0x1d6e8c)
    const N = 9
    // faceted radius: a hard polygon, each vertex kicked out/in by a stable hash — never a circle
    const facet = (k) => {
      const p = []
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2 - 0.2
        const rad = r * 0.76 * k * (0.74 + hash(i * 7.13 + 2.9) * 0.5)
        p.push(Math.cos(a) * rad, Math.sin(a) * rad * 0.92)
      }
      return p
    }
    groundShadow(r * 0.95, r * 0.86)
    // ghost echoes: the same crystal displaced, low-alpha (solid on the twin so bounds hold)
    for (const [ox, oy, al] of [[-r * 0.34, r * 0.08, 0.3], [r * 0.3, -r * 0.06, 0.22]]) {
      const e = facet(0.94)
      for (let i = 0; i < e.length; i += 2) { e[i] += ox; e[i + 1] += oy }
      // the echoes set the bounds, so their rim is stroked in BOTH variants (wasp-wing rule)
      g.poly(e).fill(white ? 0xffffff : { color: 0x7fe8ff, alpha: al })
        .stroke({ width: 1.4, color: white ? 0xffffff : 0xbff4ff, alpha: white ? 1 : al * 0.9 })
    }
    g.poly(facet(1)).fill(f(0x7fe8ff)).stroke({ width: Math.max(2.6, r * 0.11), color: line })
    if (!white) {
      g.poly(facet(1)).fill({ color: 0x1d6e8c, alpha: 0 })
      g.ellipse(r * 0.04, r * 0.28, r * 0.5, r * 0.26).fill({ color: 0x1d6e8c, alpha: 0.24 })
      g.ellipse(-r * 0.1, -r * 0.28, r * 0.42, r * 0.2).fill({ color: 0xdcfaff, alpha: 0.3 })
      g.beginPath() // internal facet edges from the core to each vertex — a crystal, not a blob
      const p = facet(1)
      for (let i = 0; i < N; i++) {
        g.moveTo(0, 0).lineTo(p[i * 2] * 0.94, p[i * 2 + 1] * 0.94)
      }
      g.stroke({ width: 1.1, color: 0x2f8fb0, alpha: 0.45 })
      g.poly(facet(0.34)).fill({ color: 0xeafdff, alpha: 0.9 }) // core
      g.poly(facet(0.16)).fill({ color: 0xffffff, alpha: 0.95 })
      g.beginPath() // scan bars: the glitch tell
      for (const y of [-r * 0.4, -r * 0.06, r * 0.3]) g.moveTo(-r * 0.66, y).lineTo(r * 0.66, y)
      g.stroke({ width: 1.4, color: 0xdcfaff, alpha: 0.3 })
    }
    if (elite) eliteCrown(-r * 0.76, r)
  }
  // flicker: a shape that is only half here. ONE soft membrane, but the LEADING (right) half is
  // solid while the trailing half is a low-alpha wash cut by hairline scan gaps — it reads as a form
  // resolving out of the void rather than a translucent ball. The whole outline (both halves) is
  // drawn in the white twin so bounds match; sim's _phaseSolid drives the sprite alpha on top.
  function drawFlicker(g, elite, white) {
    const r = 16
    const f = (c) => white ? 0xffffff : c
    const membrane = (a) => r * 0.86 * (0.9 + 0.09 * Math.cos(a * 2 + 0.7) + 0.05 * Math.sin(a * 5 - 1.1))
    groundShadow(r * 0.9, r * 0.9)
    // full silhouette: on the twin it's solid white; on the normal it's the faint "not-there" wash.
    // The rim is stroked in BOTH variants — it's what sets the bounds (wasp-wing rule).
    g.poly(radialOutline(membrane, 48, 1, 0.94)).fill(white ? 0xffffff : { color: 0xb894f5, alpha: 0.3 })
      .stroke({ width: 1.6, color: white ? 0xffffff : 0xd9c0ff, alpha: white ? 1 : 0.4 })
    if (!white) {
      // the solid half: the same membrane, sampled only over the leading arc, closed back through
      // the center — same curve, so the "materialised" edge is unmistakably part of one form. Inset
      // to 0.95 so its heavier stroke still lands inside the full membrane's rim.
      const half = []
      for (let i = 0; i <= 24; i++) {
        const a = -Math.PI / 2 + (i / 24) * Math.PI
        const rad = membrane(a) * 0.95
        half.push(Math.cos(a) * rad, Math.sin(a) * rad * 0.94)
      }
      g.poly(half).fill({ color: 0xb894f5, alpha: 0.95 })
      g.poly(half).stroke({ width: 2.4, color: 0x6f4fa8, alpha: 0.9 })
      g.ellipse(r * 0.3, r * 0.28, r * 0.34, r * 0.2).fill({ color: 0x5e3f96, alpha: 0.3 })
      g.ellipse(r * 0.24, -r * 0.3, r * 0.3, r * 0.16).fill({ color: 0xf0e2ff, alpha: 0.35 })
      g.beginPath() // scan gaps: hairline slices missing out of the form
      for (let i = 0; i < 6; i++) {
        const y = -r * 0.66 + i * r * 0.26
        g.moveTo(-r * 0.76, y).lineTo(r * 0.76, y)
      }
      g.stroke({ width: 1.2, color: 0x1c0f33, alpha: 0.4 })
      // core: the part that is always real, and the one place it has an eye
      g.poly(radialOutline((a) => membrane(a) * 0.3, 24, 1, 1, r * 0.24, 0)).fill({ color: 0xf6ecff, alpha: 0.9 })
      darkEye(g, r * 0.3, 0, r * 0.11, r * 0.13, 0x1a0b33, true)
    }
    if (elite) eliteCrown(-r * 0.82, r)
  }
  // swarmDrone: small, sharp, many-eyed — a dart-shaped chitin wedge (hard poly, nose right) with
  // spines raking backward off it and a cluster of seven lenses on the leading face. Everything
  // about it is a point: at 24px it should read as an arrowhead coming at you.
  function drawSwarmDrone(g, elite, white) {
    const r = 12
    const f = (c) => white ? 0xffffff : c
    const line = f(0x8a4a08)
    const lw = Math.max(1.8, r * 0.12)
    groundShadow(r * 0.95, r * 0.72)
    // spines: raked back, unequal — drawn first so their roots vanish under the wedge
    for (const [a, len] of [[2.5, 0.95], [3.0, 1.2], [3.5, 0.9], [2.1, 0.7], [3.9, 0.75], [4.5, 0.5], [1.7, 0.45]]) {
      taperStroke(g, [[Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3], [Math.cos(a) * r * len, Math.sin(a) * r * len]],
        r * 0.14, 0.7, f(0xd98a1e), 3)
    }
    // wedge: a hard dart — nose, two swept shoulders, a notched tail
    g.poly([
      r * 1.15, 0, r * 0.1, -r * 0.62, -r * 0.5, -r * 0.5,
      -r * 0.28, 0, -r * 0.5, r * 0.5, r * 0.1, r * 0.62,
    ]).fill(f(0xffb03d)).stroke({ width: lw, color: line })
    if (!white) {
      g.poly([r * 1.15, 0, r * 0.1, r * 0.62, -r * 0.5, r * 0.5, -r * 0.28, 0]).fill({ color: 0x9c5a0c, alpha: 0.28 })
      g.poly([r * 1.15, 0, r * 0.1, -r * 0.62, -r * 0.5, -r * 0.5, -r * 0.28, 0]).fill({ color: 0xffe6b0, alpha: 0.22 })
      g.beginPath() // carapace ridges — hairline, raked like the spines
      for (const s of [-1, 1]) {
        g.moveTo(r * 0.86, s * r * 0.08).lineTo(-r * 0.16, s * r * 0.4)
        g.moveTo(r * 0.6, s * r * 0.06).lineTo(-r * 0.3, s * r * 0.24)
      }
      g.stroke({ width: 1, color: 0x8a4a08, alpha: 0.5 })
      // seven lenses, two ranks, biggest forward — many-eyed, no sclera, one specular each
      for (const [ex, ey, er] of [[0.72, 0, 0.13], [0.5, -0.19, 0.1], [0.5, 0.19, 0.1],
        [0.26, -0.3, 0.075], [0.26, 0.3, 0.075], [0.06, -0.18, 0.06], [0.06, 0.18, 0.06]]) {
        darkEye(g, r * ex, r * ey, r * er, r * er, 0x2b0f02, er > 0.07)
      }
    }
    if (elite) eliteCrown(-r * 0.66, r)
  }

  // `lean` = MAX LEAN IN DEGREES, 0..90: how far off horizontal this creature may aim its +x nose
  // at the player (syncEnemies mirrors it left/right on top of that, so lean+flip spans the circle).
  // The number falls straight out of the VIEW the art is drawn in, so judge it from the geometry:
  //   90 = TRUE TOP-DOWN. Bilaterally symmetric about the forward axis — appendages on both sides
  //        (`for (const s of [-1, 1])`), eyes in ±y pairs — so there is no "up" to lose. Rotates freely.
  //   30 = 3/4 or PROFILE. There is a distinct UP in the drawing (ears/roof at -y, every leg/track at
  //        +y), and rotating one past vertical lands it upside down with its legs in the air. It leans
  //        toward the player and mirrors, like it did before v5.6.4, but it never tips over.
  //    0 = NO FORWARD AXIS. Discs, cells, vertical cylinders. Rotating them isn't "facing", it's
  //        tumbling — and these are the ones whose art also violates the nose-at-+x contract.
  const ROSTER_LOOKS = {
    redcell: { archetype: 'normal', draw: drawRedcell, lean: 0 },      // biconcave disc, no forward axis — it would just tumble
    wbc: { archetype: 'tank', draw: drawWbc, lean: 0 },                // radial membrane, filopodia all round; no nose
    antibody: { archetype: 'fast', draw: drawAntibody, lean: 0 },      // 3-fold Y (Fc stem at +y), no +x front — a protein has no heading
    amoeba: { archetype: 'normal', draw: drawAmoeba, lean: 0 },        // radial blob, pseudopods in 4 directions; no nose
    tadpole: { archetype: 'fast', draw: drawTadpole, lean: 90 },       // top-down: nose +x, tail -x, lateral eyes in a ±y pair
    tardigrade: { archetype: 'tank', draw: drawTardigrade, lean: 30 }, // 3/4: all 7 legs at +y, eyespot at -y
    ant: { archetype: 'normal', draw: drawAnt, lean: 90 },             // top-down: 6 legs, 2 antennae, 2 eyes, all ±y mirrored
    wasp: { archetype: 'fast', draw: drawWasp, lean: 90 },             // top-down: wings/legs/eyes all in ±y pairs
    spider: { archetype: 'tank', draw: drawSpider, lean: 90 },         // top-down: 8 legs + pedipalps + 8 eyes, all ±y mirrored
    cat: { archetype: 'tank', draw: drawCat, lean: 30 },               // profile: ears at -y, all four legs at +y
    owl: { archetype: 'fast', draw: drawOwl, lean: 90 },               // PARKED (v5.6.8): aerialStrike is unkillable in a melee chapter — kept for a future ranged one
    centipede: { archetype: 'fast', draw: drawCentipede, lean: 90, phases: 6 }, // top-down, ±y mirrored; 6 baked wave phases = the slither
    rat: { archetype: 'normal', draw: drawRat, lean: 30 },             // 3/4: both ears at -y, every leg at +y
    vacuum: { archetype: 'tank', draw: drawVacuum, lean: 0, phases: 2 }, // vertical cylinder, never rotates; 2 phases strobe the police light bar
    ratDrone: { archetype: 'normal', draw: drawRatDrone, lean: 90 },   // top-down quadrotor: 4 arms + rotors in ±y pairs
    pigeon: { archetype: 'fast', draw: drawPigeon, lean: 30 },         // profile: feet at +y, head raised at -y
    jet: { archetype: 'fast', draw: drawJet, lean: 90 },               // top-down: delta wings, tailplanes, intakes, roundels all ±y
    helicopter: { archetype: 'normal', draw: drawHelicopter, lean: 90 }, // top-down: skids ±y, rotor disc centred on the hub
    tankColumn: { archetype: 'tank', draw: drawTankColumn, lean: 20 }, // 3/4: roof/turret at -y, track band and road wheels at +y
    blinker: { archetype: 'tank', draw: drawBlinker, lean: 90 },       // void crystal, no gravity-up; its ghost echoes ride the ±x travel axis
    flicker: { archetype: 'normal', draw: drawFlicker, lean: 90 },     // void phantom, no gravity-up; the solid half IS the leading (+x) half
    swarmDrone: { archetype: 'fast', draw: drawSwarmDrone, lean: 90 }, // top-down dart: nose +x, spines raked back, 7 lenses in ±y ranks
  }
  const DEG = Math.PI / 180
  function makeRosterLook(id, elite) {
    const entry = ROSTER_LOOKS[id]
    shadowSpec = null
    crownSpec = null
    // A look is 1 frame unless the entry declares `phases: n` — then the draw fn takes a 4th
    // `phase` arg (0..2pi) and we bake n of them; syncEnemies flips through look.frames to animate
    // (the centipede's slither). Normal and white twins are baked PER PHASE from identical
    // geometry, so each frame keeps the hit-flash anchor parity on its own.
    const bakePhase = (phase) => {
      const g = new Graphics()
      entry.draw(g, elite, false, phase) // records shadowSpec/crownSpec on the way past
      const normal = bake(g)
      const w = new Graphics()
      entry.draw(w, elite, true, phase)
      const white = bake(w)
      return { tex: normal.tex, white: white.tex, ax: normal.ax, ay: normal.ay }
    }
    const n = entry.phases ?? 1
    const frames = []
    for (let p = 0; p < n; p++) frames.push(bakePhase((p / n) * Math.PI * 2))
    return {
      tex: frames[0].tex, white: frames[0].white, ax: frames[0].ax, ay: frames[0].ay,
      frames: n > 1 ? frames : null,
      baseR: ROSTER_BASE_R[entry.archetype], maxLean: entry.lean * DEG,
      shadow: shadowSpec, crown: crownSpec,
    }
  }

  // Generic cute blob (title-screen ambience)
  function makeBlobTexture(fill, line, r) {
    const g = new Graphics()
    g.ellipse(0, 0, r, r * 0.9).fill(fill).stroke({ width: 3, color: line })
    const ex = r * 0.34
    const ey = -r * 0.12
    g.circle(-ex, ey, r * 0.2).fill(0xffffff)
    g.circle(ex, ey, r * 0.2).fill(0xffffff)
    g.circle(-ex, ey + r * 0.04, r * 0.1).fill(DARK)
    g.circle(ex, ey + r * 0.04, r * 0.1).fill(DARK)
    g.beginPath().arc(0, r * 0.22, r * 0.18, Math.PI * 0.15, Math.PI * 0.85).stroke({ width: 2, color: mix(line, 0x000000, 0.2), cap: 'round' })
    g.circle(-ex - r * 0.22, ey + r * 0.34, r * 0.11).fill({ color: 0xff9eb0, alpha: 0.5 })
    g.circle(ex + r * 0.22, ey + r * 0.34, r * 0.11).fill({ color: 0xff9eb0, alpha: 0.5 })
    return bake(g)
  }

  const T = {}
  // ---- lifted shadow + crown textures (see the groundShadow/eliteCrown note above) --------------
  // ONE shadow disc for the whole roster: a flat alpha fill with no stroke, so squashing it per
  // creature to (spec.rx, spec.ry) is exact — nothing to distort. Baked big (SHADOW_TEX_R) because
  // it gets scaled UP for the tanks.
  const SHADOW_TEX_R = 32
  // Crowns bake once per distinct `r` instead: the rim is a constant 1.5px in drawing space, so a
  // single scaled crown would thicken it on the big creatures and lose it on the small ones.
  const crownTexes = new Map() // r -> { tex, white, ax, ay }
  function crownLook(r) {
    let l = crownTexes.get(r)
    if (!l) {
      const g = new Graphics()
      crownPoly(g, r, false)
      const normal = bake(g)
      const w = new Graphics()
      crownPoly(w, r, true)
      const white = bake(w)
      l = { tex: normal.tex, white: white.tex, ax: normal.ax, ay: normal.ay }
      crownTexes.set(r, l)
    }
    return l
  }

  function buildTextures() {
    {
      const g = new Graphics()
      g.circle(0, 0, SHADOW_TEX_R).fill({ color: 0x000000, alpha: 0.12 })
      T.enemyShadow = bake(g)
    }

    T.enemies = {}
    for (const type of Object.keys(ENEMIES)) {
      T.enemies[type] = makeEnemyLook(type, false)
      T.enemies[type + '_elite'] = makeEnemyLook(type, true)
    }

    // Per-rosterId themed creature silhouettes (v5.4). Keyed by rosterId (+ '_elite'); syncEnemies
    // prefers these over the archetype T.enemies fallback whenever e.rosterId names one.
    T.roster = {}
    for (const id of Object.keys(ROSTER_LOOKS)) {
      T.roster[id] = makeRosterLook(id, false)
      T.roster[id + '_elite'] = makeRosterLook(id, true)
    }

    // player body (eye whites, blush, smile baked; pupils are live sprites)
    const pr = PLAYER.radius
    {
      const g = new Graphics()
      g.ellipse(0, 0, pr, pr * 0.91).fill(0x7de3c3).stroke({ width: 3.5, color: 0x3aa88a })
      g.circle(-pr * 0.36, -pr * 0.18, pr * 0.23).fill(0xffffff)
      g.circle(pr * 0.36, -pr * 0.18, pr * 0.23).fill(0xffffff)
      g.beginPath().arc(0, pr * 0.2, pr * 0.2, Math.PI * 0.15, Math.PI * 0.85).stroke({ width: 2.5, color: 0x2f7f68, cap: 'round' })
      g.circle(-pr * 0.55, pr * 0.14, pr * 0.14).fill({ color: 0xffa8b8, alpha: 0.55 })
      g.circle(pr * 0.55, pr * 0.14, pr * 0.14).fill({ color: 0xffa8b8, alpha: 0.55 })
      T.playerBody = bake(g)
    }
    {
      const g = new Graphics()
      g.ellipse(0, 0, pr, pr * 0.91).fill(0xffffff).stroke({ width: 3.5, color: 0xffffff })
      T.playerFlash = bake(g)
    }
    {
      const g = new Graphics()
      g.circle(0, 0, pr * 0.115).fill(0x2f3140)
      g.circle(-pr * 0.04, -pr * 0.04, pr * 0.04).fill(0xffffff)
      T.pupil = bake(g)
    }
    {
      const g = new Graphics()
      g.ellipse(0, 0, pr * 0.82, pr * 0.3).fill({ color: 0x000000, alpha: 0.12 })
      T.playerShadow = bake(g)
    }

    // bullet star, orbit spark, nova ring: built in buildFxTextures() below (fx sprites)
    // gems vs coins: gems flat yellow, coins gold with shine arc + inner circle
    {
      // xp gem: blue crystal — must NOT read as gold (coins are the other drop)
      const g = new Graphics()
      g.poly([0, -7, 5, 0, 0, 7, -5, 0]).fill(0x4da3ff).stroke({ width: 1.8, color: 0x2a6fd1 })
      g.poly([0, -7, 5, 0, 0, 0]).fill({ color: 0x9fd0ff, alpha: 0.9 }) // top-right facet
      g.circle(-1.5, -2.2, 1.2).fill({ color: 0xffffff, alpha: 0.9 })
      T.gem = bake(g)
    }
    {
      const g = new Graphics()
      g.circle(0, 0, 6.5).fill(0xffcf4d).stroke({ width: 2, color: 0xb9891d })
      g.circle(0, 0, 3.6).stroke({ width: 1.5, color: 0xffe9a8 })
      g.beginPath().arc(0, 0, 5, -2.3, -1.1).stroke({ width: 1.6, color: 0xffffff, alpha: 0.9, cap: 'round' })
      T.coin = bake(g)
    }
    // particles: soft white dot + 4-point sparkle (tinted per use)
    {
      const g = new Graphics()
      g.circle(0, 0, 6).fill({ color: 0xffffff, alpha: 0.45 })
      g.circle(0, 0, 3.6).fill(0xffffff)
      T.dot = bake(g)
    }
    {
      const g = new Graphics()
      g.star(0, 0, 4, 7, 2.4).fill(0xffffff)
      T.sparkle = bake(g)
    }

    // ---- v2 weapon visuals -------------------------------------------------
    // boomerang, slime mine, homing wisp: built in buildFxTextures() below (fx sprites)
    // warm nova ring (mine explosion) — same technique as the old T.nova, orange tint
    {
      const g = new Graphics()
      g.circle(0, 0, 64).stroke({ width: 10, color: 0xffb37a })
      g.circle(0, 0, 57).stroke({ width: 4, color: 0xffe0b8, alpha: 0.7 })
      T.novaWarm = bake(g)
    }
    // neutral-white ring, same geometry as novaWarm, for spawnRing's optional tint param
    // (elemental combo bursts like 'shatter' recolor this live instead of baking one per hue)
    {
      const g = new Graphics()
      g.circle(0, 0, 64).stroke({ width: 10, color: 0xffffff })
      g.circle(0, 0, 57).stroke({ width: 4, color: 0xffffff, alpha: 0.7 })
      T.novaRing = bake(g)
    }
    // black hole: dark near-black core, baked once at the weapon's max radius so most
    // instances (lower levels) scale down rather than blur up. The swirling vortex itself
    // is live counter-rotating fx sprites (see acquireHole()), not part of this bake.
    {
      const R = WEAPONS.hole.levels[WEAPONS.hole.levels.length - 1].radius
      const g = new Graphics()
      g.circle(0, 0, R * 0.16).fill(0x140a24)
      T.holeCore = bake(g)
      T.holeRefR = R
      // Giant-hole body: smooth radial gradient disc (low-frequency, upscales cleanly —
      // the twirl sprites do NOT, so they only serve as fixed-size core detail now)
      const c = document.createElement('canvas')
      c.width = c.height = 512
      const ctx = c.getContext('2d')
      const grad = ctx.createRadialGradient(256, 256, 0, 256, 256, 256)
      grad.addColorStop(0, 'rgba(38,20,84,0.55)')
      grad.addColorStop(0.55, 'rgba(58,32,122,0.34)')
      grad.addColorStop(0.85, 'rgba(90,47,176,0.14)')
      grad.addColorStop(1, 'rgba(90,47,176,0)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, 512, 512)
      T.holeDisc = Texture.from(c)
    }
    // neon beam: horizontal bar baked at the weapon's max length/width, anchored so local (0,0)
    // sits at the left edge (player origin). v5.6.13 (user art direction): a SITH SABER, not a
    // rainbow — a white-hot core sheathed in crimson inside a soft red bloom. No gradients in
    // Graphics, so the bloom is stepped sleeves of rising alpha; normal-blend (additive washes to
    // white on the city's light concrete, and a red saber that turns white has lost the point).
    {
      const len = WEAPONS.rainbow.levels[WEAPONS.rainbow.levels.length - 1].length
      const w = WEAPONS.rainbow.levels[WEAPONS.rainbow.levels.length - 1].width
      const R = w / 2
      const g = new Graphics()
      // bloom sleeves, widest first (each with round caps overhanging the emitter end a little)
      g.roundRect(-R, -R, len + R * 2, w, R).fill({ color: 0xc41220, alpha: 0.22 })
      g.roundRect(-R * 0.75, -R * 0.8, len + R * 1.5, w * 0.8, R * 0.8).fill({ color: 0xdc1f2b, alpha: 0.4 })
      // the blade
      g.roundRect(-R * 0.5, -R * 0.58, len + R, w * 0.58, R * 0.58).fill({ color: 0xff3b45, alpha: 0.95 })
      // white-hot core
      g.roundRect(-R * 0.3, -R * 0.27, len + R * 0.6, w * 0.27, R * 0.27).fill({ color: 0xfff2ef, alpha: 0.98 })
      T.beam = bake(g)
      T.beamRefLen = len
      T.beamRefWidth = w
    }

    // red vignette (canvas radial gradient, stretched over the screen)
    {
      const c = document.createElement('canvas')
      c.width = c.height = 256
      const ctx = c.getContext('2d')
      const grad = ctx.createRadialGradient(128, 128, 60, 128, 128, 182)
      grad.addColorStop(0, 'rgba(255,70,80,0)')
      grad.addColorStop(1, 'rgba(235,60,70,0.65)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, 256, 256)
      T.vignette = Texture.from(c)
    }

    // storm blob (skies overlay, v5.6.18): a plain soft white radial gradient, center to fully
    // transparent at the edge — no Graphics gradient support, same canvas trick as the vignette
    // above. One bake, tinted+scaled per instance for both the ground cloud-shadows (dark, huge,
    // slow) and the overhead parallax clouds (lighter, even bigger) — see STORM_VIS/updateStorm.
    {
      const c = document.createElement('canvas')
      c.width = c.height = 512
      const ctx = c.getContext('2d')
      const grad = ctx.createRadialGradient(256, 256, 0, 256, 256, 256)
      grad.addColorStop(0, 'rgba(255,255,255,0.9)')
      grad.addColorStop(0.5, 'rgba(255,255,255,0.45)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, 512, 512)
      T.stormBlob = Texture.from(c)
    }

    // ---- organic floor: ground blotches + hand-drawn detail bits -----------
    // soft mottling, radial-gradient canvas textures (center color -> transparent)
    {
      function blotch(r, g, b, a) {
        const c = document.createElement('canvas')
        c.width = c.height = 300
        const ctx = c.getContext('2d')
        const grad = ctx.createRadialGradient(150, 150, 0, 150, 150, 150)
        grad.addColorStop(0, `rgba(${r},${g},${b},${a})`)
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, 300, 300)
        return Texture.from(c)
      }
      T.blotches = [
        blotch(207, 216, 174, 0.55), // soft green
        blotch(233, 222, 196, 0.6),  // warm sand
        blotch(196, 214, 189, 0.45), // sage
        blotch(238, 215, 197, 0.4),  // blush
      ]
    }
    // pebble: tiny irregular rounded stone (7-gon, fixed jitter baked once)
    {
      const g = new Graphics()
      const n = 7
      const pts = []
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        const rr = 9 * (0.72 + hash(i * 13.7 + 4.21) * 0.5)
        pts.push(Math.cos(a) * rr, Math.sin(a) * rr)
      }
      g.poly(pts).fill(0xb9b0a2).stroke({ width: 1.4, color: 0x8f8778 })
      g.ellipse(-2.6, -3, 3, 1.8).fill({ color: 0xffffff, alpha: 0.55 })
      T.pebble = bake(g)
    }
    // puddle: irregular pool squashed vertically, with a pale shine arc
    {
      const g = new Graphics()
      const n = 9
      const pts = []
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        const rr = 16 * (0.8 + hash(i * 9.3 + 11.13) * 0.4)
        pts.push(Math.cos(a) * rr, Math.sin(a) * rr * 0.6)
      }
      g.poly(pts).fill({ color: 0x8db2ff, alpha: 0.28 }).stroke({ width: 1.4, color: 0x8db2ff, alpha: 0.45 })
      g.beginPath().arc(-4, -2.5, 6, Math.PI * 1.1, Math.PI * 1.7).stroke({ width: 1.4, color: 0xffffff, alpha: 0.5, cap: 'round' })
      T.puddle = bake(g)
    }
    // ---- per-chapter baked props (v5.4) ------------------------------------
    // The prop sheet (src/props/) is entirely foliage, and chapters 4-7 have no botany to scatter —
    // a city street strewn with mushrooms is the tell. So their floor furniture is hand-drawn here
    // exactly the way pebble/puddle already are: baked once in its own natural colours, then
    // multiplied by the chapter floorTint at populate time so it sits in the biome's light.
    // UPRIGHT props are drawn with their ORIGIN AT THE BASE (y=0 is the ground line) — bake() hands
    // back the matching anchor, so they plant on the floor instead of floating.
    {
      // root arch (undergrowth): knuckled roots breaking the loam. Real joints at each knuckle and a
      // taper to every tip — the same rule the creatures follow, so it never reads as bent tubing.
      const g = new Graphics()
      const bark = 0x6b5334
      taperStroke(g, [[-46, 1], [-30, -19], [-4, -27], [22, -15], [41, 2]], 11, 3.4, bark, 4)
      taperStroke(g, [[-25, 1], [-10, -11], [12, -13], [31, -1]], 7, 2.2, bark, 4)
      for (const [x0, y0, x1, y1] of [[-30, -19, -43, -33], [22, -15, 33, -29], [-4, -27, -2, -42]]) {
        taperStroke(g, [[x0, y0], [x1, y1]], 5, 1.2, bark, 3)
      }
      g.beginPath() // bark grain: hairline, follows the run of the root
      for (const [x0, y0, x1, y1] of [[-38, -6, -12, -22], [-8, -24, 18, -18], [4, -20, 28, -8]]) {
        g.moveTo(x0, y0).lineTo(x1, y1)
      }
      g.stroke({ width: 1.2, color: 0x8a6d45, alpha: 0.5 })
      T.root = bake(g)
    }
    {
      // bone (undergrowth): a long bone with two epiphyses — pale ivory, the one LIGHT thing on the
      // dark loam, so it reads as a warning about what lives here.
      const g = new Graphics()
      const ivory = 0xd8cfb8
      const line = 0x9c9078
      taperStroke(g, [[-13, 1], [13, -1]], 6.5, 6, ivory, 3)
      for (const [x, s] of [[-14, 1], [14, -1]]) { // knuckle pairs at each end
        g.circle(x, -4 * s, 5).fill(ivory).stroke({ width: 1.2, color: line })
        g.circle(x + s * 1.5, 4 * s, 4.4).fill(ivory).stroke({ width: 1.2, color: line })
      }
      g.beginPath().moveTo(-9, -2).lineTo(9, -3).stroke({ width: 1, color: line, alpha: 0.5 })
      T.bone = bake(g)
    }
    {
      // fire hydrant (city): upright, origin at the base. Dome cap, side nozzles, base flange —
      // a silhouette every player already knows, so it only needs its proportions right.
      const g = new Graphics()
      const red = 0xc4432f
      const line = 0x6e2318
      g.rect(-11, -4, 22, 4).fill(red).stroke({ width: 1.4, color: line })       // base flange
      g.poly(spineOutline((t) => [0, -5 - t * 22], (t) => 7.5 * (1 - 0.12 * Math.sin(t * Math.PI * 2)), 14))
        .fill(red).stroke({ width: 1.6, color: line })                            // barrel
      for (const s of [-1, 1]) taperStroke(g, [[s * 5, -16], [s * 11, -16]], 4, 3.2, red, 2) // nozzles
      g.circle(0, -29, 6).fill(red).stroke({ width: 1.6, color: line })          // dome cap
      g.circle(0, -33, 2.2).fill(red).stroke({ width: 1.2, color: line })        // bonnet nut
      g.ellipse(-3, -22, 2.2, 6).fill({ color: 0xf2937f, alpha: 0.45 })          // lit edge
      g.ellipse(3.5, -18, 2.4, 8).fill({ color: 0x6e2318, alpha: 0.22 })         // shaded side
      T.hydrant = bake(g)
    }
    {
      // dumpster (city, big layer): a steel bin in 3/4 — a hard trapezoid body with a lid slab,
      // corrugation as hairline ribs, small casters. Origin at the base.
      const g = new Graphics()
      const steel = 0x3f6b4a
      const line = 0x1f3a27
      for (const x of [-26, 26]) g.circle(x, -3, 3.4).fill(0x22252a) // casters
      g.poly([-34, -4, -29, -34, 29, -34, 34, -4]).fill(steel).stroke({ width: 2, color: line }) // body
      g.poly([-33, -34, -37, -41, 37, -41, 33, -34]).fill(0x4d7d58).stroke({ width: 2, color: line }) // lid
      g.beginPath() // corrugation ribs — hairline, what makes it steel and not a box
      for (let i = -3; i <= 3; i++) g.moveTo(i * 8.5, -32).lineTo(i * 8.2, -6)
      g.stroke({ width: 1.2, color: 0x2b4f36, alpha: 0.55 })
      g.poly([-34, -12, -33, -4, 34, -4, 34, -12]).fill({ color: 0x1f3a27, alpha: 0.25 }) // shaded skirt
      g.poly([-36, -40, -37, -41, 37, -41, 36, -40]).fill({ color: 0x8fbf9c, alpha: 0.3 }) // lit lid edge
      T.dumpster = bake(g)
    }
    {
      // traffic cone (city): upright, origin at the base — one tapered cone with the two reflective
      // bands taken as slices of its OWN profile, so they wrap with the taper.
      const g = new Graphics()
      const orange = 0xe8712f
      const line = 0x8a3a12
      const spine = (t) => [0, -2 - t * 24]
      const wide = (t) => 8.5 * (1 - 0.82 * t) + 1.2
      g.rect(-11, -4, 22, 4).fill(orange).stroke({ width: 1.4, color: line }) // base plate
      g.poly(spineOutline(spine, wide, 14)).fill(orange).stroke({ width: 1.5, color: line })
      for (const [t0, t1] of [[0.3, 0.46], [0.6, 0.74]]) { // reflective bands, following the cone
        g.poly(spineOutline(spine, wide, 6, t0, t1)).fill({ color: 0xf2ece0, alpha: 0.9 })
      }
      g.poly(spineOutline(spine, (t) => wide(t) * 0.34, 10, 0, 0.9)).fill({ color: 0xf7a06a, alpha: 0.35 }) // lit centre
      T.cone = bake(g)
    }
    {
      // rubble (skies): a shattered concrete slab with rebar. Value here is a three-way squeeze —
      // the floor is PALE and the whole roster is DARK, so the prop must not sit in the enemies'
      // band or a tank parked on rubble disappears (measured: 1.41x at the first pass). So the
      // chunk is drawn LIGHT, well above every aircraft (2.3-3.9x clear of them), and its read
      // against the pale floor is carried by the dark outline + rebar rather than by its fill —
      // the same trick the white blood cell uses to sit on pale pink.
      const g = new Graphics()
      const crete = 0xb5b0a2
      const line = 0x4f4a41
      for (const [x0, y0, kx, ky, x1, y1] of [[-14, -12, -18, -20, -21, -24], [6, -16, 9, -23, 13, -26], [-2, -14, -1, -20, 1, -23]]) {
        // rebar: kinked at a real joint and SHORT — long straight spikes read as antennae, not steel
        taperStroke(g, [[x0, y0], [kx, ky], [x1, y1]], 2.6, 1.1, 0x6b4a2f, 3)
      }
      g.poly([-30, 2, -24, -14, -6, -20, 16, -16, 28, -2, 20, 4]).fill(crete).stroke({ width: 1.8, color: line })
      g.poly([-24, -14, -6, -20, 16, -16, 12, -10, -12, -8]).fill({ color: 0xd6d1c2, alpha: 0.4 }) // lit top face
      g.poly([-30, 2, -12, -8, 20, 4]).fill({ color: 0x4f4a41, alpha: 0.22 })                      // shaded base
      g.beginPath() // fracture lines — hairline, the "shattered" read
      g.moveTo(-18, -12).lineTo(-8, 0)
      g.moveTo(4, -17).lineTo(10, -3)
      g.moveTo(-6, -19).lineTo(-2, -6)
      g.stroke({ width: 1.1, color: 0x5f5a50, alpha: 0.5 })
      T.rubble = bake(g)
    }
    {
      // asteroid (beyond): an irregular cratered rock. The void floor is near-black, so the rock is
      // drawn LIGHT and the cold violet floorTint pushes it back down into the dark.
      const g = new Graphics()
      const rock = 0xa9a2bb
      const line = 0x4e4763
      const shape = (a) => 26 * (0.78 + 0.14 * Math.cos(a * 3 + 0.9) + 0.09 * Math.cos(a * 5 - 2.2) + 0.06 * Math.sin(a * 8))
      g.poly(radialOutline(shape, 40, 1, 0.86)).fill(rock).stroke({ width: 1.8, color: line })
      g.ellipse(2, 6, 17, 8).fill({ color: 0x4e4763, alpha: 0.26 })   // shaded underside
      g.ellipse(-4, -7, 14, 6).fill({ color: 0xd6d0e6, alpha: 0.3 })  // lit dorsal
      for (const [cx, cy, cr] of [[-8, -3, 5], [7, 2, 3.6], [-2, 8, 2.6], [12, -6, 2.2]]) {
        g.circle(cx, cy, cr).fill({ color: 0x6f6788, alpha: 0.5 })           // craters
        g.circle(cx - cr * 0.2, cy - cr * 0.2, cr * 0.6).fill({ color: 0x8b83a4, alpha: 0.5 })
      }
      T.asteroid = bake(g)
    }
    {
      // obstacle footprint (v5.6.10): the collision contract, drawn HARD where every decor shadow is
      // soft. A subtly darkened packed-earth pad plus a crisp rim ring sitting on the collider edge,
      // so a player learns "this stops me" by eye, not only by bumping it. Baked in greyscale at a
      // reference radius and multiplied by each biome's `foot` colour (chosen for contrast, dark on
      // pale floors / pale on dark floors); syncObstacles scales it by o.r/ref so the rim lands
      // EXACTLY on o.r — what the sim tests is what the eye sees.
      const g = new Graphics()
      const REF = 100
      g.circle(0, 0, REF).fill({ color: 0xffffff, alpha: 0.30 })                       // occlusion pad
      g.circle(0, 0, REF * 0.62).fill({ color: 0xffffff, alpha: 0.16 })                // deeper toward centre
      g.circle(0, 0, REF).stroke({ width: REF * 0.14, color: 0xffffff, alpha: 1 })     // hard rim ON the edge
      T.obFoot = { ...bake(g), ref: REF }
    }
    // ---- body interior props (v5.6) ----------------------------------------
    // The Body is the intro chapter: a pale warm-cream floor (0xf4efe6) walked by soft-red cells,
    // a pale white cell and an amber antibody. Its floor furniture is anatomy, not botany — but it
    // must stay DECOR: every fill sits low-contrast on the floor (measured 1.1-1.6x WCAG luminance)
    // and far below every enemy (3.9-6.4x), in a warm pink/rose/cream band hue-clear of the red
    // cell, so a platelet is never mistaken for a cell in peripheral vision. Soft fills, no hard
    // dark outlines — a dark edge is the enemy read, so props carry themselves on value alone.
    {
      // villi mound (big): a tuft of rounded intestinal villi rising off the floor. Each finger is a
      // spine with a mild lean, a gentle taper and a ROUND cap (blunt, never a spike), over a soft
      // basal mound. Fixed per-bake jitter (like pebble) so no two fingers match. Origin at the base.
      const g = new Graphics()
      const body = 0xe8b6c1
      const hi = 0xf0cbd3
      g.ellipse(1, -4, 27, 9).fill({ color: body, alpha: 0.85 }) // basal mound, drawn first
      const fingers = [[-19, 30, 0.42], [-9, 44, 0.16], [3, 51, 0.61], [13, 42, 0.28], [22, 29, 0.53]]
      for (const [bx, h, seed] of fingers) {
        const lean = (hash(seed * 7.1 + 2.3) - 0.5) * 11
        const wob = 0.78 + hash(seed * 3.7 + 1.1) * 0.42
        const spine = (t) => [bx + lean * t * t, -t * h]
        g.poly(spineOutline(spine, (t) => 6.6 * wob * (1 - 0.34 * t), 14)).fill(body) // stalk
        g.circle(bx + lean, -h, 4.6 * wob).fill(body)                                  // round cap
        g.ellipse(bx + lean - 1.6, -h - 1.4, 2.1 * wob, 2.8 * wob).fill({ color: hi, alpha: 0.5 }) // lit tip
      }
      T.villi = bake(g)
    }
    {
      // vesicle cluster (big): a grape-bunch of translucent transport vesicles. Overlapping alpha
      // discs darken where they stack, so the bunch reads without any hard line; each carries a soft
      // pale specular. Top-down, spins freely.
      const g = new Graphics()
      const wall = 0xe3b7c2
      const hi = 0xf3dde3
      const bubs = [[0, 1, 15], [-15, 6, 11], [13, 8, 12], [-6, -13, 9], [8, -11, 9], [-19, -5, 7], [3, 16, 8], [18, -4, 7]]
      for (const [x, y, r] of bubs) {
        g.circle(x, y, r).fill({ color: wall, alpha: 0.5 }).stroke({ width: 1.1, color: wall, alpha: 0.55 })
        g.circle(x - r * 0.32, y - r * 0.34, r * 0.28).fill({ color: hi, alpha: 0.7 }) // specular
      }
      T.vesicles = bake(g)
    }
    {
      // platelet (mid/detail): a small irregular disc — a lumpy rounded plate with a paler granular
      // centre. Blunt lobed outline, no hard edge. Reused small + dimmed on the detail layer.
      const g = new Graphics()
      const fill = 0xe7bcc4
      const shape = (a) => 11 * (0.86 + 0.1 * Math.cos(a * 3 + 0.7) + 0.06 * Math.sin(a * 5 - 1.3))
      g.poly(radialOutline(shape, 34)).fill(fill)
      g.ellipse(-1.5, -1.5, 5.5, 4.5).fill({ color: 0xf3d6db, alpha: 0.6 }) // pale granular centre
      T.platelet = bake(g)
    }
    {
      // lipid droplet (mid): a soft fat globule — pale cream fill, a bright rim arc on the lit side
      // and a round specular, a soft shaded base opposite. Reads as an oily bead. Top-down.
      const g = new Graphics()
      const cream = 0xefd9c8
      const rim = 0xf6ead9
      const shape = (a) => 13 * (0.94 + 0.05 * Math.cos(a * 2 + 0.4))
      g.poly(radialOutline(shape, 32)).fill(cream)
      g.ellipse(3, 4, 6, 4).fill({ color: 0xe4c3b4, alpha: 0.35 })                                      // shaded base
      g.beginPath().arc(0, 0, 12, Math.PI * 0.85, Math.PI * 1.72).stroke({ width: 2, color: rim, alpha: 0.7, cap: 'round' }) // lit rim
      g.circle(-4, -4.5, 3).fill({ color: rim, alpha: 0.8 })                                            // specular
      T.lipid = bake(g)
    }
    {
      // capillary squiggle (mid/detail): a thin branching vessel. taperStroke narrows toward every
      // tip so it reads as a vessel and not a scribble, with a faint lighter lumen down the main run.
      const g = new Graphics()
      const vein = 0xe6b5bd
      taperStroke(g, [[-24, 6], [-10, -4], [4, 2], [16, -6], [26, -2]], 4.2, 1.4, vein, 4) // main run
      taperStroke(g, [[4, 2], [9, 12], [17, 17]], 3, 1, vein, 3)                            // lower branch
      taperStroke(g, [[-10, -4], [-13, -14], [-9, -22]], 2.6, 0.9, vein, 3)                 // upper branch
      taperStroke(g, [[-22, 5], [-9, -3], [4, 1.5], [15, -5]], 1.3, 0.6, 0xf0cbd3, 4)       // lumen
      T.capillary = bake(g)
    }
    {
      // plasma mote (detail): a tiny drifting plasma blob — a soft disc with a paler core. Kept very
      // low alpha at populate time so it barely stains the floor.
      const g = new Graphics()
      g.circle(0, 0, 6).fill({ color: 0xecc9cf, alpha: 0.75 })
      g.circle(-1.2, -1.2, 2.4).fill({ color: 0xf6ead9, alpha: 0.7 })
      T.mote = bake(g)
    }

    // ---- v5.4 signature/weapon props ---------------------------------------
    // snap traps (undergrowth signature, run.traps): they damage the PLAYER AND ENEMIES, so armed
    // vs sprung has to be readable in a glance, at speed, while being chased. The two states are
    // baked as separate textures and swapped in placeTrap rather than redrawn per frame:
    //   ARMED  = jaws SPREAD WIDE with bared teeth + a pale trigger plate. Wide + toothy + bright.
    //   SPRUNG = jaws SHUT into a single closed bar, teeth hidden, dulled. Narrow + smooth + dim.
    // The silhouettes differ (a ring vs a bar), so the read survives even at a glance in the dark.
    {
      const g = new Graphics()
      const steel = 0xa8b0ba
      const line = 0x2f333a
      g.circle(0, 0, 15).fill({ color: 0x1c1f24, alpha: 0.55 })                       // pit shadow
      for (const s of [-1, 1]) { // the two open jaws: arcs sprung back, teeth pointing IN
        g.beginPath().arc(0, 0, 15, s > 0 ? -0.3 : Math.PI - 0.3, s > 0 ? 0.3 + 0 : Math.PI + 0.3)
        g.stroke({ width: 4.5, color: steel, cap: 'round' })
        g.beginPath().arc(0, 0, 15, s > 0 ? -1.15 : Math.PI - 1.15, s > 0 ? 1.15 : Math.PI + 1.15)
        g.stroke({ width: 4, color: steel, cap: 'round' })
        for (let i = -2; i <= 2; i++) { // bared teeth, tapering inward
          const a = (s > 0 ? 0 : Math.PI) + i * 0.42
          taperStroke(g, [[Math.cos(a) * 14, Math.sin(a) * 14], [Math.cos(a) * 7.5, Math.sin(a) * 7.5]], 2.6, 0.8, steel, 2)
        }
      }
      g.circle(0, 0, 6).fill(0xd8cfb0).stroke({ width: 1.6, color: line })            // trigger plate
      g.circle(0, 0, 2.2).fill({ color: line, alpha: 0.7 })
      g.beginPath().arc(0, 0, 15, 0.5, 1.1).stroke({ width: 2, color: 0x5f666f })     // spring bridge
      g.beginPath().arc(0, 0, 15, Math.PI + 0.5, Math.PI + 1.1).stroke({ width: 2, color: 0x5f666f })
      T.trapArmed = bake(g)
    }
    {
      const g = new Graphics()
      const dull = 0x6b727c
      const g2 = 0x3a3f47
      g.circle(0, 0, 12).fill({ color: 0x1c1f24, alpha: 0.4 })
      g.poly(spineOutline((t) => [-13 + t * 26, 0], (t) => 3.4 * bulge(0.12 + 0.8 * t, 0.5), 14))
        .fill(dull).stroke({ width: 1.6, color: g2 })                                 // jaws shut: one bar
      g.beginPath().moveTo(-11, 0).lineTo(11, 0).stroke({ width: 1, color: 0x8f959d, alpha: 0.6 }) // seam
      g.circle(0, 0, 4).fill({ color: g2, alpha: 0.8 })
      T.trapSprung = bake(g)
    }
    {
      // traffic car (city signature, run.lanes): top-down, nose +x, drawn at the real
      // TRAFFIC_CAR_LEN × TRAFFIC_CAR_W hitbox so what sweeps you is what you saw coming.
      const g = new Graphics()
      const body = 0xf2c53d
      const line = 0x6b4f0e
      const L = TRAFFIC_CAR_LEN
      const W = TRAFFIC_CAR_W
      for (const s of [-1, 1]) { // tyres, under the shell
        g.rect(L * 0.16, s * W * 0.42 - W * 0.06, L * 0.16, W * 0.12).fill(0x1c1f24)
        g.rect(-L * 0.3, s * W * 0.42 - W * 0.06, L * 0.16, W * 0.12).fill(0x1c1f24)
      }
      // shell: one tapered outline, blunt at the boot and narrowing over the bonnet
      g.poly(spineOutline((t) => [-L * 0.5 + t * L, 0], (t) => W * 0.44 * bulge(0.14 + 0.8 * (1 - t), 0.34), 26))
        .fill(body).stroke({ width: 2.4, color: line })
      g.poly(spineOutline((t) => [-L * 0.24 + t * L * 0.44, 0], (t) => W * 0.3 * bulge(0.2 + 0.7 * t, 0.5), 14))
        .fill(0x2b3a4a).stroke({ width: 1.6, color: line })                            // cabin glass
      g.ellipse(-L * 0.06, -W * 0.1, L * 0.18, W * 0.08).fill({ color: 0x9fd8ff, alpha: 0.35 }) // glass sheen
      g.ellipse(0, W * 0.26, L * 0.4, W * 0.14).fill({ color: 0x8a6512, alpha: 0.2 })  // shaded flank
      g.ellipse(0, -W * 0.28, L * 0.36, W * 0.1).fill({ color: 0xfae79a, alpha: 0.3 }) // lit flank
      g.beginPath() // panel seams — hairline
      g.moveTo(L * 0.28, -W * 0.3).lineTo(L * 0.28, W * 0.3)
      g.moveTo(-L * 0.32, -W * 0.32).lineTo(-L * 0.32, W * 0.32)
      g.stroke({ width: 1.2, color: 0x8a6512, alpha: 0.5 })
      for (const s of [-1, 1]) {
        g.ellipse(L * 0.45, s * W * 0.22, L * 0.04, W * 0.08).fill(0xfff6d0)          // headlights
        g.ellipse(-L * 0.47, s * W * 0.24, L * 0.03, W * 0.07).fill(0xff5545)         // tail lights
      }
      T.car = bake(g)
    }
    {
      // trash chunk (city, run.debris): an angular scrap of junk — hard facets, nothing rounded
      const g = new Graphics()
      const pts = []
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        const rr = 11 * (0.62 + hash(i * 3.31 + 7.7) * 0.6)
        pts.push(Math.cos(a) * rr, Math.sin(a) * rr)
      }
      g.poly(pts).fill(0xb9a98f).stroke({ width: 1.8, color: 0x5f5442 })
      g.poly(pts.slice(0, 6)).fill({ color: 0xe0d4bc, alpha: 0.4 })
      g.beginPath().moveTo(-6, -3).lineTo(4, 5).stroke({ width: 1.1, color: 0x5f5442, alpha: 0.5 })
      T.trashChunk = bake(g)
    }
    {
      // rock chunk (skies, run.lobs): the kaiju's thrown masonry — chunkier and colder than trash
      const g = new Graphics()
      const pts = []
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2
        const rr = 12 * (0.68 + hash(i * 5.17 + 2.3) * 0.5)
        pts.push(Math.cos(a) * rr, Math.sin(a) * rr)
      }
      g.poly(pts).fill(0x9aa0a8).stroke({ width: 1.8, color: 0x474d55 })
      g.ellipse(-3, -3, 6, 4).fill({ color: 0xd0d6de, alpha: 0.45 })
      g.ellipse(3, 4, 6, 3).fill({ color: 0x474d55, alpha: 0.3 })
      g.beginPath().moveTo(-7, 2).lineTo(2, -5).stroke({ width: 1.1, color: 0x474d55, alpha: 0.5 })
      T.rockChunk = bake(g)
    }

    // dust mote: tiny soft blurred dot (screen-space ambience, title + gameplay)
    {
      const c = document.createElement('canvas')
      c.width = c.height = 16
      const ctx = c.getContext('2d')
      const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8)
      grad.addColorStop(0, 'rgba(255,255,255,0.9)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, 16, 16)
      T.dustMote = Texture.from(c)
    }
  }
  buildTextures()

  // Weapon-visual textures/lookups that composite fx sprites (glow-behind-star, mine
  // core, etc.) — needs T.fx, so it runs once the fx sheet is loaded (see `ready` below),
  // not from buildTextures(). Everything it sets is only ever read from sync(), which
  // main.js never calls before `await renderer.ready` resolves.
  function buildFxTextures() {
    // star bullet: soft flare glow baked behind a spinning gold star
    {
      const c = new Container()
      const glow = new Sprite(T.fx.flare_01)
      glow.anchor.set(0.5)
      glow.tint = 0xffb347
      glow.alpha = 0.8
      glow.scale.set(fxScale(T.fx.flare_01, 44))
      const star = new Sprite(T.fx.star_04)
      star.anchor.set(0.5)
      star.tint = 0xff9d1a
      star.scale.set(fxScale(T.fx.star_04, 30))
      // double-stack: Kenney glyphs are soft-alpha, one layer washes out on the light floor
      const star2 = new Sprite(T.fx.star_04)
      star2.anchor.set(0.5)
      star2.tint = 0xff9d1a
      star2.scale.set(star.scale.x)
      c.addChild(glow, star, star2)
      T.bullet = bakeComposite(c)
    }
    // orbit spark: mint/teal diamond sparkle, tinted live (see placeOrb)
    {
      const tex = T.fx.magic_05
      T.orb = { tex, ax: 0.5, ay: 0.5 }
      T.orbScale = fxScale(tex, 30)
    }
    // wave nova ring: expanding glow ring, tinted sky blue live (see placeNova)
    {
      const tex = T.fx.light_02
      T.nova = { tex, ax: 0.5, ay: 0.5 }
      T.novaTexR = fxRadius(tex)
    }
    // boomerang: warm-orange crescent slash, tinted live (see placeBoomerang)
    {
      const tex = T.fx.slash_02
      T.boomerang = { tex, ax: 0.5, ay: 0.5 }
      T.boomerangScale = fxScale(tex, 34)
    }
    // slime mine: coral glow behind a red-pink diamond core
    {
      const c = new Container()
      const glow = new Sprite(T.fx.circle_05)
      glow.anchor.set(0.5)
      glow.tint = 0xff9166
      glow.alpha = 0.55
      glow.scale.set(fxScale(T.fx.circle_05, 46))
      const core = new Sprite(T.fx.magic_04)
      core.anchor.set(0.5)
      core.tint = 0xff4f7a
      core.scale.set(fxScale(T.fx.magic_04, 26))
      c.addChild(glow, core)
      T.mine = bakeComposite(c)
    }
    // homing wisp: lavender sparkle baked double-stacked (soft alpha washes out solo)
    {
      const c = new Container()
      for (let i = 0; i < 2; i++) {
        const s = new Sprite(T.fx.magic_04)
        s.anchor.set(0.5)
        s.tint = 0x9b4fd0
        s.scale.set(fxScale(T.fx.magic_04, 30))
        c.addChild(s)
      }
      T.homing = bakeComposite(c)
      T.homingScale = 1
    }
    // stinger needle (v5.3 garden): a thin amber streak, double-stacked (soft alpha washes out solo),
    // pointing +x natively so placeBullet can rotate it to the needle's velocity. A bright tip spark
    // sells the "point". Visually distinct from the round spinning star bullet.
    {
      const c = new Container()
      for (let i = 0; i < 2; i++) {
        const s = new Sprite(T.fx.trace_05)
        s.anchor.set(0.5)
        s.tint = 0xffb347
        s.scale.set(fxScale(T.fx.trace_05, 26), fxScale(T.fx.trace_05, 6))
        c.addChild(s)
      }
      const tip = new Sprite(T.fx.spark_04)
      tip.anchor.set(0.5)
      tip.tint = 0xffe4a0
      tip.position.x = 11
      tip.scale.set(fxScale(T.fx.spark_04, 10))
      c.addChild(tip)
      T.needle = bakeComposite(c)
    }
    // enemy missile (skies helicopters, run.enemyShots): the only enemy-owned projectile, so it must
    // never be confused with the player's amber stinger needle — cold steel body, hot red exhaust
    // flare behind it, pointing +x natively so placeShot can aim it along its velocity.
    {
      const c = new Container()
      const flare = new Sprite(T.fx.flare_01)
      flare.anchor.set(0.5)
      flare.tint = 0xff5545
      flare.alpha = 0.85
      flare.position.x = -9
      flare.scale.set(fxScale(T.fx.flare_01, 16))
      c.addChild(flare)
      for (let i = 0; i < 2; i++) { // double-stacked: one soft-alpha layer washes out
        const b = new Sprite(T.fx.trace_05)
        b.anchor.set(0.5)
        b.tint = 0xd8dde4
        b.scale.set(fxScale(T.fx.trace_05, 24), fxScale(T.fx.trace_05, 7))
        c.addChild(b)
      }
      const tip = new Sprite(T.fx.spark_04)
      tip.anchor.set(0.5)
      tip.tint = 0xff8c42
      tip.position.x = 10
      tip.scale.set(fxScale(T.fx.spark_04, 9))
      c.addChild(tip)
      T.missile = bakeComposite(c)
    }
    // pond player's flagellum tail: a soft streak glyph, double-stacked (one layer washes out)
    for (const t of [tailA, tailB]) t.texture = T.fx.trace_05
  }

  // Prop + fx sprite sheets (bush/grass/.../leaf, star/flare/twirl/...) load async;
  // `ready` resolves once T.props/T.fx are populated and the fx-dependent weapon
  // textures above are baked. reset/sync/idle all guard on propsReady so it's safe to
  // call them before this settles — they just skip floor drawing until then; main.js
  // additionally awaits `ready` itself before the game loop ever calls sync()/idle().
  let propsReady = false
  const ALL_URLS = { ...PROP_URLS, ...FX_URLS }
  const ready = Assets.load(Object.values(ALL_URLS)).then((loaded) => {
    T.props = {}
    for (const name in PROP_URLS) T.props[name] = loaded[PROP_URLS[name]]
    T.fx = {}
    for (const name in FX_URLS) T.fx[name] = loaded[FX_URLS[name]]
    buildFxTextures()
    propsReady = true
  })

  function spriteOf(look) {
    const s = new Sprite(look.tex)
    s.anchor.set(look.ax, look.ay)
    return s
  }

  // ------------------------------------------------------------- stage layout
  // Organic floor (ground blotches + scattered foliage) lives in floorLayer, the
  // first child of world, so it inherits camera + shake for free — see the "organic
  // floor" section below for how its cells get populated. It stays visible in both
  // gameplay and idle (title screen); only entitiesLayer (player/enemies/bullets/...)
  // toggles with run state, so `world` itself is never hidden.
  const world = new Container()
  const floorLayer = new Container()
  const blotchLayer = new Container()
  const bigLayer = new Container()
  const midLayer = new Container()
  const detailLayer = new Container()
  floorLayer.addChild(blotchLayer, bigLayer, midLayer, detailLayer)

  const entitiesLayer = new Container()
  const idleLayer = new Container()
  const dustLayer = new Container()
  const vignette = new Sprite(T.vignette)
  vignette.alpha = 0
  // Full-field lightning flash (skies chapter, v5.7.2, LIGHTNING.flash): a flat white screen-space
  // rect, NOT the vignette's edge-only radial gradient — a strike/ambient bolt should whiten the
  // WHOLE view, briefly. Texture.WHITE is Pixi's built-in 1x1 white pixel, no bake needed. Sits
  // directly below vignette in the stage stack (see addChild below) so a same-frame damage flash
  // — the safety cue — still visibly wins.
  const lightningFlash = new Sprite(Texture.WHITE)
  lightningFlash.alpha = 0
  // v5.0 pond biome layers (empty/hidden for body): ambient current motes live on the stage
  // (screen space, like dust); obstacles + hazard pools read as ground decals under the roster;
  // toxin blooms hang over enemies but under the player; whip flashes sit over the weapons.
  // Declared BEFORE the stage addChild below — currentLayer is referenced there (TDZ otherwise).
  const currentLayer = new Container()
  const poolLayer = new Container()
  const obstacleLayer = new Container()
  const bloomLayer = new Container()
  const whipLayer = new Container()
  // Storm overlay (skies signature look, v5.6.18 — see updateStorm below). cloudShadowLayer is a
  // `world` child (floor < shadows < entities, so shadows dim the ground but sit under the roster);
  // stormCloudLayer/stormRainLayer are stage-level, drawn OVER the whole world (clouds parallax the
  // camera, rain is plain screen space) — same "declared before the addChild that uses it" rule.
  const cloudShadowLayer = new Container()
  const stormCloudLayer = new Container()
  const stormRainLayer = new Container()

  world.addChild(floorLayer, cloudShadowLayer, entitiesLayer)
  app.stage.addChild(world, currentLayer, stormCloudLayer, stormRainLayer, idleLayer, dustLayer, lightningFlash, vignette)
  entitiesLayer.visible = false // title screen shows first; reset(run) reveals entities

  // v5.3 garden field layers (empty/hidden for other chapters, driven purely by run.trails/webs/
  // lures presence — no hard chapter gate needed since createRun leaves them [] elsewhere):
  //   trailLayer/webLayer sit with the ground decals (under enemies); lureLayer floats the decoy
  //   beacon over the swarm; stripG is a telegraph Graphics like bombG (see redrawStrips).
  const trailLayer = new Container()
  const webLayer = new Container()
  const lureLayer = new Container()
  const stripG = new Graphics()
  // v5.4 chapter-4-7 field layers. Like the garden/pond layers above these need no chapter gate —
  // they're driven purely by the presence of their run.* array, which createRun leaves empty
  // elsewhere. Declared HERE, above the entitiesLayer.addChild below: the v5.0 pond crash was a
  // layer being addChild'd before its own const, which only blew up in the minified bundle.
  //   wellG/trapLayer  = permanent ground furniture, under the roster
  //   laneG/hazardG    = telegraph Graphics, same idiom as bombG/stripG
  //   teleG            = the roster's own attack telegraphs (see redrawTelegraphs), likewise
  //   debrisLayer      = the tornado's orbiting junk (player weapon, sits with the orbs)
  //   shotLayer/carLayer/lobLayer = airborne things, over the crowd
  const wellLayer = new Container()
  const wellG = new Graphics()
  const trapLayer = new Container()
  const laneG = new Graphics()
  const hazardG = new Graphics()
  const teleG = new Graphics()
  const debrisLayer = new Container()
  const shotLayer = new Container()
  const carLayer = new Container()
  const lobLayer = new Container()
  const gemLayer = new Container()
  const coinLayer = new Container()
  const holeLayer = new Container()
  const novaLayer = new Container()
  const mineLayer = new Container()
  // elite affix ground fx (bomb telegraphs + pacer auras): per-frame vector layers,
  // cleared/redrawn each sync() like arcG below — must sit under enemyLayer/playerC
  // so danger circles read as floor decals, not overlays on top of the entities
  const bombG = new Graphics()
  const pacerG = new Graphics()
  // v5.6.5: the crowd's shadows and the elites' crowns were lifted OUT of the creature textures so
  // they stop inheriting the body's rotation — see groundShadow/eliteCrown up in the art section.
  // Shadows go UNDER every enemy (they're ground decals, cast by an overhead light); crowns go OVER
  // them. Both are declared HERE, above the entitiesLayer.addChild below, for the usual reason: a
  // layer addChild'd before its own const is a TDZ crash that only ever shows in the minified bundle.
  const enemyShadowLayer = new Container()
  const enemyLayer = new Container()
  const enemyCrownLayer = new Container()
  // shield bubble overlay: drawn on top of the elite body it protects
  const shieldG = new Graphics()
  const affixLayer = new Container() // per-elite affix icon badges (Text), see syncAffixBadges
  const playerC = new Container()
  const bulletLayer = new Container()
  const boomerangLayer = new Container()
  const orbLayer = new Container()
  const homingLayer = new Container()
  const beamLayer = new Container()
  const arcG = new Graphics() // elemental shock arcs (shockarc/frostarc/conduct)
  const particleLayer = new Container()
  const textLayer = new Container()
  entitiesLayer.addChild(
    wellLayer, wellG, poolLayer, trailLayer, webLayer, obstacleLayer, trapLayer,
    gemLayer, coinLayer, holeLayer, novaLayer, mineLayer,
    bombG, stripG, laneG, hazardG, teleG, pacerG,
    enemyShadowLayer, enemyLayer, enemyCrownLayer,
    bloomLayer, lureLayer, shieldG, affixLayer, playerC,
    bulletLayer, boomerangLayer, orbLayer, debrisLayer, homingLayer, shotLayer, beamLayer, whipLayer, arcG,
    lobLayer, carLayer, particleLayer, textLayer,
  )

  // ---------------------------------------------------------- organic floor
  // Ground blotches + scattered foliage: one sprite per occupied world-space cell,
  // picked/tinted/rotated/scaled by cellHash(i, j, salt) so a cell's look never
  // changes as it re-enters view. Sprites pool/release like the enemy pool
  // (acquireFloorSprite/releaseFloorSprite), just keyed by cell instead of entity id.
  const floorCells = new Map() // "i,j,layerName" -> Sprite
  const floorFree = []

  function acquireFloorSprite(parent) {
    let s = floorFree.pop()
    if (!s) s = new Sprite(Texture.EMPTY)
    s.visible = true
    parent.addChild(s)
    return s
  }
  function releaseFloorSprite(s) {
    s.visible = false
    floorFree.push(s)
  }

  // ground blotches: effectively always-on (soft translucent mottling everywhere),
  // texture/rotation/scale/jitter vary so neighboring cells never look tiled
  function populateBlotch(s, i, j, cell) {
    const idx = Math.floor(cellHash(i, j, 1) * T.blotches.length)
    s.texture = T.blotches[idx]
    s.anchor.set(0.5)
    s.tint = chapterRender.floorTint // white for body; teal multiply recolours the pond ground
    s.alpha = 1
    s.rotation = cellHash(i, j, 2) * Math.PI * 2
    s.scale.set(lerp(0.9, 1.6, cellHash(i, j, 3)))
    const jx = (cellHash(i, j, 4) - 0.5) * cell * 0.6
    const jy = (cellHash(i, j, 5) - 0.5) * cell * 0.6
    s.position.set((i + 0.5) * cell + jx, (j + 0.5) * cell + jy)
  }

  // ---- prop kinds + per-chapter biomes (v5.4) ------------------------------------------------
  // A "kind" is one scatterable thing. Two flavours, and applyPropKind handles both:
  //   sheet prop — { name } resolves in T.props (1024px source PNGs), so `size` is a TARGET
  //                ON-SCREEN SIZE in px, converted to a scale factor; `tints` pick a baked hue.
  //   baked prop — { baked: true } resolves in T (pebble/root/hydrant/...), already drawn at its
  //                natural size, so `scale` is a plain factor range and its colours are its own.
  // `upright` props keep their footing (small rotation jitter only, anchored at the base for baked
  // ones); top-down props spin freely. Everything is multiplied by chapterRender.floorTint, so one
  // prop set reads differently under each chapter's light.
  const BUSH_TINTS = [0x86b877, 0x76a869]
  const GRASS_TINTS = [0x9ccc80, 0x8bbf76, 0xa5cb8a]
  const CLUSTER_TINTS = [0xa8d19a, 0xc2dfae, 0x9bc98f]

  function applyPropKind(s, kind, i, j) {
    if (kind.baked) {
      const look = T[kind.name]
      s.texture = look.tex
      s.anchor.set(look.ax, look.ay)
      s.tint = tintMul(kind.tint ?? 0xffffff, chapterRender.floorTint)
      s.alpha = kind.alpha ?? 1
      s.scale.set(lerp(kind.scale[0], kind.scale[1], cellHash(i, j, 4)))
    } else {
      s.texture = T.props[kind.name]
      s.anchor.set(0.5, kind.upright ? 0.9 : 0.5)
      s.tint = tintMul(kind.tints ? kind.tints[Math.floor(cellHash(i, j, 2) * kind.tints.length)] : (kind.tint ?? 0xffffff), chapterRender.floorTint)
      s.alpha = kind.alpha ?? 1
      s.scale.set(lerp(kind.size[0], kind.size[1], cellHash(i, j, 4)) / 1024)
    }
    // upright things stay upright — only top-down scatter is free to spin
    s.rotation = kind.upright ? (cellHash(i, j, 3) - 0.5) * 0.16 : cellHash(i, j, 3) * Math.PI * 2
  }

  // big: one bulky landmark per cell — bushes on the green chapters, hard furniture elsewhere
  const BIG_BUSH = [
    { name: 'bush_a', tints: BUSH_TINTS, upright: true, size: [90, 145] },
    { name: 'bush_b', tints: BUSH_TINTS, upright: true, size: [90, 145] },
  ]
  const BIG_UNDERGROWTH = [
    { name: 'root', baked: true, upright: true, scale: [0.85, 1.5] },
    { name: 'bush_a', tints: [0x6f7a4a, 0x5d6840], upright: true, size: [80, 130] },
  ]
  const BIG_CITY = [{ name: 'dumpster', baked: true, upright: true, scale: [0.9, 1.5] }]
  const BIG_SKIES = [{ name: 'rubble', baked: true, upright: true, scale: [1.1, 2.0] }]
  const BIG_BEYOND = [{ name: 'asteroid', baked: true, scale: [1.0, 1.9] }]
  // body: one substantial piece of anatomy per cell — a villi mound (upright, planted) or a
  // top-down bunch of transport vesicles. Both baked in warm pink, both low-contrast decor.
  const BIG_BODY = [
    { name: 'villi', baked: true, upright: true, scale: [0.9, 1.5] },
    { name: 'vesicles', baked: true, scale: [0.85, 1.5] },
  ]

  function populateBig(s, i, j, cell) {
    const kinds = chapterBiome.big
    applyPropKind(s, kinds[Math.floor(cellHash(i, j, 1) * kinds.length)], i, j)
    const jx = (cellHash(i, j, 5) - 0.5) * cell * 0.7
    const jy = (cellHash(i, j, 6) - 0.5) * cell * 0.7
    s.position.set((i + 0.5) * cell + jx, (j + 0.5) * cell + jy)
  }

  // mid: grass/flowers/mushroom/reed (upright, side-view) + clusters (top-down)
  const MID_GARDEN = [
    { name: 'grass_a', tints: GRASS_TINTS, upright: true, size: [28, 48] },
    { name: 'grass_b', tints: GRASS_TINTS, upright: true, size: [28, 48] },
    { name: 'grass_c', tints: GRASS_TINTS, upright: true, size: [28, 48] },
    { name: 'grass_d', tints: GRASS_TINTS, upright: true, size: [28, 48] },
    { name: 'flower_a', tints: [0xffd1e0, 0xffd93d], upright: true, size: [34, 55] },
    { name: 'flower_b', tints: [0xfff3f8], upright: true, size: [34, 55] },
    { name: 'mushroom', tints: [0xffb3c6], upright: true, size: [26, 42] },
    { name: 'reed', tints: [0x8fae7a], upright: true, size: [45, 70] },
    { name: 'cluster_a', tints: CLUSTER_TINTS, upright: false, size: [50, 78] },
    { name: 'cluster_b', tints: CLUSTER_TINTS, upright: false, size: [50, 78] },
    { name: 'cluster_c', tints: CLUSTER_TINTS, upright: false, size: [50, 78] },
  ]
  // undergrowth: shade botany only — no sunlit flowers down here, and the mushrooms go pallid
  const MID_UNDERGROWTH = [
    { name: 'grass_c', tints: [0x7f8a52, 0x6d7746], upright: true, size: [30, 52] },
    { name: 'grass_d', tints: [0x7f8a52, 0x6d7746], upright: true, size: [30, 52] },
    { name: 'mushroom', tints: [0xd8cfb0, 0xc4b294], upright: true, size: [26, 44] },
    { name: 'bone', baked: true, scale: [0.7, 1.2] },
    { name: 'cluster_b', tints: [0x6f7a4a, 0x59623a], upright: false, size: [46, 74] },
  ]
  // city: street furniture, plus weeds coming up through the cracks (the city is still alive)
  const MID_CITY = [
    { name: 'hydrant', baked: true, upright: true, scale: [0.9, 1.3] },
    { name: 'cone', baked: true, upright: true, scale: [0.85, 1.25] },
    { name: 'grass_a', tints: [0x6f8a52], upright: true, size: [22, 38] },
  ]
  // skies + beyond: nothing grows. Smaller siblings of the big layer's chunks, scattered.
  const MID_SKIES = [{ name: 'rubble', baked: true, upright: true, scale: [0.5, 0.95] }]
  const MID_BEYOND = [{ name: 'asteroid', baked: true, scale: [0.35, 0.75] }]
  // body: medium accents — platelet plates, lipid beads, capillary squiggles. Mild alpha so they
  // sit under the enemies. All top-down (spin freely).
  const MID_BODY = [
    { name: 'platelet', baked: true, alpha: 0.9, scale: [0.85, 1.5] },
    { name: 'lipid', baked: true, alpha: 0.9, scale: [0.8, 1.35] },
    { name: 'capillary', baked: true, alpha: 0.85, scale: [0.9, 1.6] },
  ]

  function populateMid(s, i, j, cell) {
    const kinds = chapterBiome.mid
    applyPropKind(s, kinds[Math.floor(cellHash(i, j, 1) * kinds.length)], i, j)
    const jx = (cellHash(i, j, 5) - 0.5) * cell * 0.7
    const jy = (cellHash(i, j, 6) - 0.5) * cell * 0.7
    s.position.set((i + 0.5) * cell + jx, (j + 0.5) * cell + jy)
  }

  // detail: scatter/leaf sprites + hand-drawn baked bits (pebble, puddle, bone, ...)
  const DETAIL_GARDEN = [
    { name: 'scatter_a', tint: 0xd9e6c0, alpha: 0.55, size: [24, 42] },
    { name: 'scatter_b', tint: 0xd9e6c0, alpha: 0.55, size: [24, 42] },
    { name: 'leaf', tint: 0xe8b28a, alpha: 0.7, size: [18, 32] },
    { name: 'pebble', baked: true, scale: [0.7, 1.4] },
    { name: 'puddle', baked: true, scale: [0.7, 1.4] },
  ]
  // undergrowth: deep leaf litter — the floor IS dead leaves, so scatter/leaf dominate
  const DETAIL_UNDERGROWTH = [
    { name: 'leaf', tint: 0xb08050, alpha: 0.8, size: [20, 36] },
    { name: 'leaf', tint: 0x8a6a3e, alpha: 0.7, size: [18, 32] },
    { name: 'scatter_a', tint: 0xa89466, alpha: 0.6, size: [24, 42] },
    { name: 'bone', baked: true, scale: [0.45, 0.8] },
    { name: 'pebble', baked: true, scale: [0.7, 1.3] },
  ]
  // city: litter and wet asphalt — the puddle earns its keep on a night street
  const DETAIL_CITY = [
    { name: 'scatter_b', tint: 0xc9c4b8, alpha: 0.45, size: [22, 38] },
    { name: 'leaf', tint: 0xb8b0a0, alpha: 0.5, size: [16, 28] },
    { name: 'puddle', baked: true, scale: [0.9, 1.7] },
    { name: 'pebble', baked: true, scale: [0.6, 1.1] },
  ]
  const DETAIL_SKIES = [
    { name: 'pebble', baked: true, scale: [0.7, 1.5] },
    { name: 'scatter_b', tint: 0xd8d2c4, alpha: 0.4, size: [22, 38] },
  ]
  const DETAIL_BEYOND = [
    { name: 'pebble', baked: true, scale: [0.5, 1.1] },
    { name: 'asteroid', baked: true, scale: [0.16, 0.3] },
  ]
  // body: small low-alpha scatter — drifting plasma motes plus tiny dimmed platelets and capillary
  // fragments. Barely stains the floor; pure background stipple.
  const DETAIL_BODY = [
    { name: 'mote', baked: true, alpha: 0.5, scale: [0.6, 1.3] },
    { name: 'platelet', baked: true, alpha: 0.6, scale: [0.4, 0.7] },
    { name: 'capillary', baked: true, alpha: 0.45, scale: [0.5, 0.85] },
  ]

  function populateDetail(s, i, j, cell) {
    const kinds = chapterBiome.detail
    applyPropKind(s, kinds[Math.floor(cellHash(i, j, 1) * kinds.length)], i, j)
    const jx = (cellHash(i, j, 5) - 0.5) * cell * 0.7
    const jy = (cellHash(i, j, 6) - 0.5) * cell * 0.7
    s.position.set((i + 0.5) * cell + jx, (j + 0.5) * cell + jy)
  }

  // Per-chapter biome: which prop kinds scatter on each floor layer, and how the chapter's
  // run.obstacles colliders are dressed. Keyed by chapter id and latched in reset(run) alongside
  // chapterRender — the CHAPTERS[].render block is data the sim shares, this is render's own.
  // `obstacle.clumps` names sheet props stacked into a mound (the pond's reed idiom);
  // `obstacle.baked` names baked props planted on the pad instead (hard furniture).
  // Every obstacle sits on a hard `foot` ring baked at T.obFoot and scaled so its rim lands EXACTLY
  // on the collider edge o.r — that ring is the collision contract, so `foot` is picked for CONTRAST
  // against each biome's floor (dark rings on pale floors, pale rings on dark floors), not for theme.
  // `tint` is the obstacle mass: denser/darker than the floor props of the same family.
  const OBSTACLE_CLUMPS = ['cluster_a', 'cluster_b', 'cluster_c']
  const BIOME_GARDEN = {
    big: BIG_BUSH, mid: MID_GARDEN, detail: DETAIL_GARDEN,
    obstacle: { clumps: OBSTACLE_CLUMPS, tint: 0x5f8f4a, foot: 0x243617 },
  }
  // The Body gets its OWN anatomy props (was reusing the Garden's bushes/grass — plants inside a
  // host organism). obstacle kept identical to the Garden's: the body has no obstacles in config,
  // so this field is inert here and another agent owns obstacle styling.
  const BIOME_BODY = {
    big: BIG_BODY, mid: MID_BODY, detail: DETAIL_BODY,
    obstacle: { clumps: OBSTACLE_CLUMPS, tint: 0x8fbf6f, glow: 0xbfe8dd, glowAlpha: 0.5 },
  }
  const BIOMES = {
    body: BIOME_BODY,
    pond: BIOME_GARDEN,
    garden: BIOME_GARDEN,
    undergrowth: {
      big: BIG_UNDERGROWTH, mid: MID_UNDERGROWTH, detail: DETAIL_UNDERGROWTH,
      // roots + bones: a knot of root arches with a bone half-buried in it
      obstacle: { baked: ['root', 'root', 'bone'], tint: 0xbfae86, foot: 0xffffff },
    },
    city: {
      big: BIG_CITY, mid: MID_CITY, detail: DETAIL_CITY,
      obstacle: { baked: ['dumpster', 'hydrant', 'cone'], tint: 0xd8d4cc, foot: 0x161a20 },
    },
    skies: {
      big: BIG_SKIES, mid: MID_SKIES, detail: DETAIL_SKIES,
      obstacle: { baked: ['rubble', 'rubble'], tint: 0xbfb8a8, foot: 0x38332b },
    },
    beyond: {
      big: BIG_BEYOND, mid: MID_BEYOND, detail: DETAIL_BEYOND,
      obstacle: { baked: ['asteroid', 'asteroid'], tint: 0xcfc8e0, foot: 0xffffff },
    },
  }
  chapterBiome = BIOMES.body // title-screen default; reset(run) latches the run's chapter

  const FLOOR_LAYERS = [
    { name: 'blotch', cell: 420, chance: 1.00, parent: blotchLayer, populate: populateBlotch },
    { name: 'big', cell: 460, chance: 0.35, parent: bigLayer, populate: populateBig },
    { name: 'mid', cell: 170, chance: 0.55, parent: midLayer, populate: populateMid },
    { name: 'detail', cell: 120, chance: 0.40, parent: detailLayer, populate: populateDetail },
  ]

  function touchFloorCell(cfg, i, j) {
    if (cellHash(i, j, 999) >= cfg.chance) return
    const key = i + ',' + j + ',' + cfg.name
    let s = floorCells.get(key)
    if (!s) {
      s = acquireFloorSprite(cfg.parent)
      cfg.populate(s, i, j, cfg.cell)
      floorCells.set(key, s)
    }
    s._seen = true
  }

  // cx,cy follow the same convention as world.position (screen = worldPos + (cx,cy));
  // call with whatever the camera offset is this frame — gameplay, idle drift, reset.
  function updateFloorLayer(cx, cy) {
    if (!propsReady) return
    const w = app.screen.width
    const h = app.screen.height
    for (const cfg of FLOOR_LAYERS) {
      const margin = cfg.cell
      const i0 = Math.floor((-cx - margin) / cfg.cell)
      const i1 = Math.floor((-cx + w + margin) / cfg.cell)
      const j0 = Math.floor((-cy - margin) / cfg.cell)
      const j1 = Math.floor((-cy + h + margin) / cfg.cell)
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) touchFloorCell(cfg, i, j)
      }
    }
    for (const [key, s] of floorCells) {
      if (s._seen) s._seen = false
      else { floorCells.delete(key); releaseFloorSprite(s) }
    }
  }

  function clearFloorLayer() {
    for (const [, s] of floorCells) releaseFloorSprite(s)
    floorCells.clear()
  }

  // player rig: shadow stays put, bodyC squashes/hops
  const pShadow = spriteOf(T.playerShadow)
  pShadow.y = PLAYER.radius * 0.95
  const bodyC = new Container()
  const pBody = spriteOf(T.playerBody)
  const pupilL = spriteOf(T.pupil)
  const pupilR = spriteOf(T.pupil)
  const pFlash = spriteOf(T.playerFlash)
  pFlash.alpha = 0
  bodyC.addChild(pBody, pupilL, pupilR, pFlash)
  // flagellum tail (pond skin only): two stacked streak glyphs behind the blob, trailing the
  // player's facingAngle with a wiggle. Textures are fx sprites so they're assigned once the fx
  // sheet loads (buildFxTextures); this rig starts hidden and is revealed by chapterRender.tail.
  const pTail = new Container()
  pTail.visible = false
  const tailA = new Sprite(Texture.EMPTY)
  const tailB = new Sprite(Texture.EMPTY)
  for (const t of [tailA, tailB]) { t.anchor.set(0.04, 0.5); pTail.addChild(t) }
  playerC.addChild(pShadow, pTail, bodyC) // tail sits above the shadow, behind the body

  // title-screen ambient blobs
  const idleBlobs = []
  {
    const specs = [
      { fill: 0x7de3c3, line: 0x3aa88a, r: 27, fx: 0.26, fy: 0.62, ph: 0 },
      { fill: 0xffb3c6, line: 0xd5567d, r: 19, fx: 0.56, fy: 0.72, ph: 2.1 },
      { fill: 0x8e97f2, line: 0x5560c9, r: 22, fx: 0.78, fy: 0.58, ph: 4.2 },
    ]
    for (const sp of specs) {
      const shadow = spriteOf(T.playerShadow)
      shadow.scale.set(sp.r / PLAYER.radius)
      const blob = spriteOf(makeBlobTexture(sp.fill, sp.line, sp.r))
      idleLayer.addChild(shadow, blob)
      idleBlobs.push({ blob, shadow, ...sp })
    }
  }

  // dust motes: fixed small set of soft dots drifting slowly up-right in SCREEN
  // space (own container directly on stage, unaffected by camera/world position).
  // Active during both gameplay and idle so the scene always feels alive.
  const DUST_COUNT = 14
  const dustMotes = []
  let dustT = 0
  for (let i = 0; i < DUST_COUNT; i++) {
    const s = new Sprite(T.dustMote)
    s.anchor.set(0.5)
    s.scale.set(lerp(0.8, 1.6, hash(i * 5.31 + 1.7)))
    dustLayer.addChild(s)
    dustMotes.push({
      s,
      x: hash(i * 3.11 + 0.4),
      y: hash(i * 7.77 + 2.2),
      vx: 8 + hash(i * 2.13 + 3.3) * 10,
      vy: 6 + hash(i * 4.87 + 5.5) * 8,
    })
  }

  function updateDustMotes(dt) {
    if (dt <= 0) return // frozen behind modals, same rule as particles
    dustT += dt
    const w = app.screen.width
    const h = app.screen.height
    for (let i = 0; i < dustMotes.length; i++) {
      const m = dustMotes[i]
      m.x += (m.vx * dt) / w
      m.y -= (m.vy * dt) / h // up = decreasing y
      if (m.x > 1.08) m.x -= 1.16
      if (m.y < -0.08) m.y += 1.16
      m.s.position.set(m.x * w, m.y * h)
      m.s.alpha = 0.2 + 0.1 * Math.sin(dustT * 2 + i)
    }
  }

  // Current streaks (pond signature): world-space flow streaks that sample the REAL drift field
  // (sim.js currentForce) and advect along it — exaggerated (CURRENT_VIS.speedMul) so the gentle
  // sim push reads as an obvious water flow. Each streak is a double-stacked soft trace glyph
  // (one layer washes out on the light floor) rotated to the local flow direction and stretched by
  // speed, in a teal-white tint. Streaks fade in, live a few seconds while advecting, then fade out
  // and respawn in view; they also respawn on straying past the viewport (+margin). Pooled — only
  // transform/alpha touched per frame. currentLayer stays on the stage; world coords are converted
  // to screen with the frame's camera offset (cx,cy: screen = world + (cx,cy)).
  const currentStreaks = []
  let currentTexReady = false
  let rippleTimer = 0
  for (let i = 0; i < CURRENT_VIS.count; i++) {
    const g = new Container()
    g.visible = false
    const a = new Sprite(Texture.EMPTY)
    const b = new Sprite(Texture.EMPTY)
    for (const s of [a, b]) { s.anchor.set(0.5); s.tint = CURRENT_VIS.tint; g.addChild(s) }
    b.alpha = 0.7 // far copy slightly softer — double-stack punches through the murky floor
    currentLayer.addChild(g)
    currentStreaks.push({ g, a, b, x: 0, y: 0, age: 0, life: 0, ang: 0, spawned: false })
  }

  // Drop a streak at a fresh world position somewhere in the current view (+ a little jitter).
  function respawnStreak(p, cx, cy, w, h, atX, atY) {
    if (atX == null) {
      p.x = -cx + Math.random() * w
      p.y = -cy + Math.random() * h
    } else { p.x = atX; p.y = atY }
    p.age = 0
    p.life = CURRENT_VIS.life * (1 + (Math.random() * 2 - 1) * CURRENT_VIS.lifeJitter)
    p.spawned = true
  }

  function updateCurrents(run, dt, cx, cy) {
    if (!chapterHasCurrents) { currentLayer.visible = false; return }
    currentLayer.visible = true
    if (!currentTexReady && T.fx && T.fx.trace_05) {
      const lx = fxScale(T.fx.trace_05, CURRENT_VIS.lenPx)
      const ly = fxScale(T.fx.trace_05, CURRENT_VIS.widthPx)
      for (const p of currentStreaks) {
        p.a.texture = p.b.texture = T.fx.trace_05
        p.a.scale.set(lx, ly)
        p.b.scale.set(lx * 0.9, ly * 0.85)
      }
      currentTexReady = true
    }
    if (!currentTexReady || dt <= 0) return
    const w = app.screen.width
    const h = app.screen.height
    const mg = CURRENT_VIS.margin

    for (const p of currentStreaks) {
      if (!p.spawned) respawnStreak(p, cx, cy, w, h)
      p.age += dt
      // advect along the exaggerated real field
      const f = currentForce(run, p.x, p.y)
      const vx = f.fx * CURRENT_VIS.speedMul
      const vy = f.fy * CURRENT_VIS.speedMul
      p.x += vx * dt
      p.y += vy * dt
      const speed = Math.hypot(vx, vy)
      if (speed > 1) p.ang = Math.atan2(vy, vx) // keep last heading in dead spots
      // screen position (world + camera)
      const sx = p.x + cx
      const sy = p.y + cy
      const off = sx < -mg || sx > w + mg || sy < -mg || sy > h + mg
      if (p.age >= p.life || off) { respawnStreak(p, cx, cy, w, h); continue }
      // fade envelope: in over fadeIn, out over the last fadeOut
      let env = 1
      if (p.age < CURRENT_VIS.fadeIn) env = p.age / CURRENT_VIS.fadeIn
      else if (p.age > p.life - CURRENT_VIS.fadeOut) env = Math.max(0, (p.life - p.age) / CURRENT_VIS.fadeOut)
      p.g.position.set(sx, sy)
      p.g.rotation = p.ang
      p.g.scale.set(1 + speed * CURRENT_VIS.stretchPerSpeed, 1) // stretch length with speed
      p.g.alpha = CURRENT_VIS.alpha * env * (p.boost || 1)
      p.g.visible = true
    }

    // Ripple-train accent: every rippleEvery seconds, restart 3 streaks single-file along one
    // streamline (seeded in view, each offset downstream) with a brief brightness boost — a moving
    // arrow emphasising flow direction. Cheap: it just re-seeds existing pooled streaks.
    for (const p of currentStreaks) if (p.boost) p.boost = Math.max(1, p.boost - dt * 1.2)
    if (CURRENT_VIS.rippleEvery > 0 && currentStreaks.length >= 3) {
      rippleTimer += dt
      if (rippleTimer >= CURRENT_VIS.rippleEvery) {
        rippleTimer = 0
        const ox = -cx + Math.random() * w
        const oy = -cy + Math.random() * h
        const f = currentForce(run, ox, oy)
        const sp = Math.hypot(f.fx, f.fy) || 1
        const dx = f.fx / sp, dy = f.fy / sp
        for (let k = 0; k < 3; k++) {
          const p = currentStreaks[(Math.floor(Math.random() * currentStreaks.length) + k) % currentStreaks.length]
          respawnStreak(p, cx, cy, w, h, ox + dx * k * CURRENT_VIS.lenPx * 0.9, oy + dy * k * CURRENT_VIS.lenPx * 0.9)
          p.boost = 2
        }
      }
    }
  }

  function clearCurrents() {
    currentLayer.visible = false
    for (const p of currentStreaks) { p.g.visible = false; p.spawned = false; p.boost = 1 }
    rippleTimer = 0
  }

  // ---------------------------------------------------------------- storm overlay
  // Night-thunderstorm overlay (skies chapter only, STORM_VIS above): three cosmetic, pooled
  // layers on the CURRENT_VIS idiom (pooled sprites, respawn-in-view, fade envelopes). Render-
  // only — reads run.chapter (via chapterHasStorm, latched in reset()) and the camera offset,
  // writes nothing back to run.
  //   cloudShadowLayer — big dark blobs, `world` child between floorLayer/entitiesLayer, so they
  //     dim the ground but sit under obstacles/enemies/player.
  //   stormCloudLayer  — the same blob texture again, lighter and bigger, stage-level and drawn
  //     OVER everything; its container is offset by only STORM_VIS.cloud.parallaxFactor of the
  //     camera move (see updateStorm) so it visibly lags the ground — the altitude/depth cue.
  //   stormRainLayer   — short streaks, plain screen-space wind-wrap (own function below).
  // ponytail: one shared wind vector (STORM_VIS.windAngle), not a turbulence field — legible and
  // cheap; nothing here asked for per-blob wind noise.
  function makeDriftPool(container, count, tex) {
    const items = []
    for (let i = 0; i < count; i++) {
      const s = new Sprite(tex)
      s.anchor.set(0.5)
      s.visible = false
      container.addChild(s)
      items.push({ s, x: 0, y: 0, age: 0, life: 0, scaleMul: 1, spawned: false })
    }
    return items
  }
  const cloudShadows = makeDriftPool(cloudShadowLayer, STORM_VIS.shadow.count, T.stormBlob)
  const stormClouds = makeDriftPool(stormCloudLayer, STORM_VIS.cloud.count, T.stormBlob)

  // Drop a drift blob at a fresh spot in the current view (viewX/viewY = world coords of the
  // screen's top-left corner this frame) — same idea as respawnStreak above.
  function respawnDrift(p, cfg, viewX, viewY, w, h) {
    p.x = viewX + Math.random() * w
    p.y = viewY + Math.random() * h
    p.age = 0
    p.life = cfg.life * (1 + (Math.random() * 2 - 1) * cfg.lifeJitter)
    p.scaleMul = 1 + (Math.random() * 2 - 1) * cfg.sizeJitter
    p.spawned = true
  }

  // Shared advect/fade loop for cloudShadows + stormClouds. camX/camY is whatever this layer's
  // sprites must add to their own (wind-drifted) local position to land on screen — used only for
  // the off-screen/respawn test, since the actual screen placement comes from the *container's*
  // position (cloudShadowLayer inherits `world`'s; stormCloudLayer gets the parallax offset set in
  // updateStorm) plus each sprite's own local (p.x, p.y).
  function updateDriftPool(items, cfg, tex, dt, dx, dy, camX, camY) {
    const w = app.screen.width
    const h = app.screen.height
    const mg = cfg.margin
    const viewX = -camX, viewY = -camY
    for (const p of items) {
      if (p.s.texture !== tex) p.s.texture = tex
      if (!p.spawned) respawnDrift(p, cfg, viewX, viewY, w, h)
      p.age += dt
      p.x += dx * dt
      p.y += dy * dt
      const sx = p.x + camX
      const sy = p.y + camY
      const off = sx < -mg || sx > w + mg || sy < -mg || sy > h + mg
      if (p.age >= p.life || off) { respawnDrift(p, cfg, viewX, viewY, w, h); continue }
      let env = 1
      if (p.age < cfg.fadeIn) env = p.age / cfg.fadeIn
      else if (p.age > p.life - cfg.fadeOut) env = Math.max(0, (p.life - p.age) / cfg.fadeOut)
      p.s.position.set(p.x, p.y)
      p.s.scale.set((cfg.sizePx / tex.width) * p.scaleMul)
      p.s.tint = cfg.tint
      p.s.alpha = cfg.alpha * env
      p.s.visible = true
    }
  }

  const rainDrops = []
  for (let i = 0; i < STORM_VIS.rain.count; i++) {
    const s = new Sprite(Texture.EMPTY)
    s.anchor.set(0.5)
    s.visible = false
    stormRainLayer.addChild(s)
    rainDrops.push({ s, x: hash(i * 3.71 + 0.6), y: hash(i * 5.93 + 1.3) })
  }
  let stormTexReady = false

  // Rain: plain SCREEN-space wind-wrap (same trick as updateDustMotes above), not world-space
  // advection like the two drift-blob layers — rain doesn't sample or need to track any world
  // position, so the respawn-in-view machinery above would be pure overhead here.
  function updateRain(dt) {
    if (!stormTexReady && T.fx && T.fx.trace_05) stormTexReady = true
    if (!stormTexReady) return
    const w = app.screen.width
    const h = app.screen.height
    const wind = STORM_VIS.windAngle
    const vx = Math.cos(wind) * STORM_VIS.rain.speed
    const vy = Math.sin(wind) * STORM_VIS.rain.speed
    const lx = fxScale(T.fx.trace_05, STORM_VIS.rain.lenPx)
    const ly = fxScale(T.fx.trace_05, STORM_VIS.rain.widthPx)
    for (const d of rainDrops) {
      if (d.s.texture !== T.fx.trace_05) { d.s.texture = T.fx.trace_05; d.s.scale.set(lx, ly) }
      d.x += (vx * dt) / w
      d.y += (vy * dt) / h
      if (d.x > 1.1) d.x -= 1.2
      if (d.x < -0.1) d.x += 1.2
      if (d.y > 1.1) d.y -= 1.2
      if (d.y < -0.1) d.y += 1.2
      d.s.position.set(d.x * w, d.y * h)
      d.s.rotation = wind
      d.s.tint = STORM_VIS.rain.tint
      d.s.alpha = STORM_VIS.rain.alpha
      d.s.visible = true
    }
  }

  function updateStorm(run, dt, cx, cy) {
    if (!chapterHasStorm) {
      cloudShadowLayer.visible = false
      stormCloudLayer.visible = false
      stormRainLayer.visible = false
      return
    }
    cloudShadowLayer.visible = true
    stormCloudLayer.visible = true
    stormRainLayer.visible = true

    const wind = STORM_VIS.windAngle
    const wx = Math.cos(wind)
    const wy = Math.sin(wind)

    // ground shadows: a `world` child, so its container already carries the full camera offset —
    // camX/camY here is only needed for the drift loop's own off-screen test.
    updateDriftPool(cloudShadows, STORM_VIS.shadow, T.stormBlob, dt,
      wx * STORM_VIS.shadow.speed, wy * STORM_VIS.shadow.speed, cx, cy)

    // overhead clouds: stage-level, so THIS container's position carries the (reduced) camera
    // offset — derived straight from the same cx,cy sync() uses for world.position, scaled by
    // parallaxFactor so the clouds visibly lag the ground as the camera pans.
    const pcx = cx * STORM_VIS.cloud.parallaxFactor
    const pcy = cy * STORM_VIS.cloud.parallaxFactor
    stormCloudLayer.position.set(pcx, pcy)
    updateDriftPool(stormClouds, STORM_VIS.cloud, T.stormBlob, dt,
      wx * STORM_VIS.cloud.speed, wy * STORM_VIS.cloud.speed, pcx, pcy)

    updateRain(dt)
    updateAmbientLightning(dt, cx, cy)
  }

  function clearStorm() {
    cloudShadowLayer.visible = false
    stormCloudLayer.visible = false
    stormRainLayer.visible = false
    for (const p of cloudShadows) { p.s.visible = false; p.spawned = false }
    for (const p of stormClouds) { p.s.visible = false; p.spawned = false }
  }

  // ------------------------------------------------------------------- pools
  const enemySprites = new Map() // id -> Sprite
  const enemyFree = []
  const bulletPool = []
  const novaPool = []
  const orbPool = []
  const gemPool = []
  const coinPool = []
  const boomerangPool = []
  const minePool = []
  const homingPool = []
  const holePool = []
  const beamPool = []
  const debrisPool = []
  const shotPool = []
  const prevCount = {
    bullet: 0, nova: 0, orb: 0, gem: 0, coin: 0,
    boomerang: 0, mine: 0, homing: 0, hole: 0, beam: 0,
    pool: 0, bloom: 0, trail: 0, web: 0, lure: 0,
    trap: 0, debris: 0, shot: 0, well: 0,
  }

  function syncPool(pool, layer, list, key, tex, apply) {
    const n = list.length
    while (pool.length < n) {
      const s = spriteOf(tex)
      layer.addChild(s)
      pool.push(s)
    }
    for (let i = 0; i < n; i++) {
      const s = pool[i]
      s.visible = true
      apply(s, list[i], i)
    }
    for (let i = n; i < prevCount[key]; i++) pool[i].visible = false
    prevCount[key] = n
  }

  // Holes and beams are multi-sprite composites (counter-rotating vortex layers, scrolling
  // beam streaks) that need independent per-frame transforms on their children, so they
  // can't be a flat syncPool() of single Sprites — each pool slot is a small Container rig
  // instead, grown/hidden with the same acquire-once/hide-tail pattern as syncPool above.
  // Hole rig: gradient disc + crisp vector rim sized to the REAL radius per frame
  // (both upscale cleanly); the twirl sprites stay near their native resolution as a
  // fixed-size spinning core — stretching them to a 700px+ radius washes them to fog.
  const HOLE_TWIRL_MAX = 460 // px, twirl detail size cap
  function acquireHole() {
    const root = new Container()
    const disc = new Sprite(T.holeDisc)
    disc.anchor.set(0.5)
    const ring = new Graphics()
    const vortexA = new Sprite(T.fx.twirl_01)
    vortexA.anchor.set(0.5)
    vortexA.tint = 0x2f1a66
    vortexA.alpha = 1
    const vortexB = new Sprite(T.fx.twirl_02)
    vortexB.anchor.set(0.5)
    vortexB.tint = 0x5a2fb0
    vortexB.alpha = 0.9
    const core = spriteOf(T.holeCore)
    root.addChild(disc, ring, vortexA, vortexB, core)
    holeLayer.addChild(root)
    return { root, disc, ring, vortexA, vortexB, core, _r: 0 }
  }

  function syncHoles(list) {
    const n = list.length
    while (holePool.length < n) holePool.push(acquireHole())
    for (let i = 0; i < n; i++) {
      const hv = holePool[i]
      hv.root.visible = true
      placeHole(hv, list[i], i)
    }
    for (let i = n; i < prevCount.hole; i++) holePool[i].root.visible = false
    prevCount.hole = n
  }

  function acquireBeam() {
    const root = new Container()
    const beamBody = new Container()
    const bar = spriteOf(T.beam)
    const streakA = new Sprite(T.fx.trace_06)
    streakA.anchor.set(0.5)
    streakA.tint = 0xffd9d4 // pale hot — shimmer INSIDE the red blade, not white paint over it
    streakA.alpha = 0.5
    streakA.rotation = Math.PI / 2 // trace_06 is a vertical streak; rotate to lie along the beam
    streakA.scale.set(fxScale(T.fx.trace_06, T.beamRefLen * 0.3), fxScale(T.fx.trace_06, T.beamRefWidth * 1.6))
    const streakB = new Sprite(T.fx.trace_06)
    streakB.anchor.set(0.5)
    streakB.tint = 0xffd9d4
    streakB.alpha = 0.5
    streakB.rotation = Math.PI / 2
    streakB.scale.set(streakA.scale.x, streakA.scale.y)
    beamBody.addChild(bar, streakA, streakB)

    // tip/muzzle sit outside beamBody so the width-squash scale doesn't distort them
    const tip = new Sprite(T.fx.flare_01)
    tip.anchor.set(0.5)
    tip.tint = 0xff5a52 // the saber's tip burns red
    const muzzle = new Sprite(T.fx.muzzle_02)
    muzzle.anchor.set(0.5)
    muzzle.tint = 0xff5a52 // emitter flash, same red as the tip

    root.addChild(beamBody, tip, muzzle)
    beamLayer.addChild(root)
    return { root, beamBody, streakA, streakB, tip, muzzle }
  }

  function syncBeams(list) {
    const n = list.length
    while (beamPool.length < n) beamPool.push(acquireBeam())
    for (let i = 0; i < n; i++) {
      const bv = beamPool[i]
      bv.root.visible = true
      placeBeam(bv, list[i])
    }
    for (let i = n; i < prevCount.beam; i++) beamPool[i].root.visible = false
    prevCount.beam = n
  }

  // ---- v5.0 pond field elements ------------------------------------------------------------
  // Obstacles (run.obstacles): each collider is dressed in its chapter's own furniture, sized to
  // the collider's radius so what you see is what you bump into. The list STREAMS with the player
  // (sim.js streamObstacles, v5.6.13), so this rebuilds when the array identity changes (new run)
  // OR run._obstacleRev bumps (cells materialized/dropped) — otherwise it's a no-op. Every obstacle sits on a HARD footprint ring (T.obFoot) whose rim lands
  // exactly on the collider edge o.r — the collision contract, drawn hard where decor shadows are
  // soft — under a denser mass than the floor props. Two mass styles:
  //   clumps (body/pond/garden) — one sheet prop stacked into a lifted mound: reeds/weeds.
  //   baked  (chapters 4-7)     — two baked props (roots+bone, dumpster/hydrant/cone, rubble,
  //                               asteroids), the big one planted on the pad and a smaller second
  //                               tucked at the rim so the pair reads as a heap, not a double-print.
  // Mass + ring are multiplied by chapterRender.floorTint, so the furniture sits in the biome's light.
  const obstacleSprites = []
  let obstacleToken = null
  let obstacleRev = -1
  function acquireObstacle() {
    const root = new Container()
    const ring = new Sprite(Texture.EMPTY) // grounded footprint, UNDER the mass, rim on the collider edge
    ring.anchor.set(0.5)
    const clumpA = new Sprite(Texture.EMPTY)
    clumpA.anchor.set(0.5)
    const clumpB = new Sprite(Texture.EMPTY)
    clumpB.anchor.set(0.5)
    root.addChild(ring, clumpA, clumpB)
    obstacleLayer.addChild(root)
    return { root, ring, clumpA, clumpB }
  }
  function syncObstacles(run) {
    const list = run.obstacles || []
    // v5.6.13: the list STREAMS as the player roams (sim.js streamObstacles mutates it in place
    // and bumps run._obstacleRev) — rebuild on either a fresh array (new run) or a rev bump.
    if (obstacleToken === list && obstacleRev === (run._obstacleRev || 0)) return
    obstacleToken = list
    obstacleRev = run._obstacleRev || 0
    while (obstacleSprites.length < list.length) obstacleSprites.push(acquireObstacle())
    const foot = T.obFoot
    const style = chapterBiome.obstacle
    const footTint = tintMul(style.foot, chapterRender.floorTint)
    for (let i = 0; i < obstacleSprites.length; i++) {
      const ov = obstacleSprites[i]
      if (i >= list.length) { ov.root.visible = false; continue }
      const o = list[i]
      ov.root.visible = true
      ov.root.position.set(o.x, o.y)
      const rot = hash(o.x + o.y * 3.3) * Math.PI * 2
      const tint = tintMul(style.tint, chapterRender.floorTint)
      // footprint ring: the hard contract. Scaled so its rim lands EXACTLY on the collider edge o.r.
      ov.ring.texture = foot.tex
      ov.ring.tint = footTint
      ov.ring.alpha = 1
      ov.ring.scale.set(o.r / foot.ref)
      if (style.baked) {
        // baked furniture: pick two pieces off the chapter's list by position hash, plant the big
        // one on the pad and tuck a smaller second at the rim. Baked props carry their own origin
        // (upright ones sit on their base), so the anchor comes from the look, not a fixed 0.5.
        const pick = (salt) => style.baked[Math.floor(hash(o.x * 1.7 + o.y * 0.31 + salt) * style.baked.length)]
        const a = T[pick(0)]
        const b = T[pick(11.3)]
        const scA = (o.r * 1.9) / Math.max(a.tex.width, a.tex.height)
        const scB = (o.r * 1.15) / Math.max(b.tex.width, b.tex.height)
        ov.clumpA.texture = a.tex; ov.clumpA.anchor.set(a.ax, a.ay); ov.clumpA.tint = tint
        ov.clumpA.scale.set(scA); ov.clumpA.rotation = 0
        ov.clumpA.position.set(0, o.r * 0.28) // base planted just past centre, sitting on the pad
        ov.clumpB.texture = b.tex; ov.clumpB.anchor.set(b.ax, b.ay); ov.clumpB.tint = tint
        ov.clumpB.scale.set(scB); ov.clumpB.rotation = (hash(o.x * 2.9 + o.y) - 0.5) * 0.5
        ov.clumpB.position.set((hash(o.x + o.y * 5.1) - 0.5) * o.r * 0.85, o.r * 0.44) // tucked at the rim
      } else {
        // foliage mound: two stacked cluster sprites sized to the collider (≈2×radius wide) and
        // lifted into a crown, denser and darker than the single floor bush. The ring, not the
        // foliage overhang, marks the true edge.
        const tex = T.props[style.clumps[Math.floor(hash(o.x * 1.7 + o.y * 0.31) * style.clumps.length)]]
        const sc = (o.r * 2.0) / 1024 // source props are 1024px; on-screen width ≈ collider diameter
        ov.clumpA.texture = tex; ov.clumpA.anchor.set(0.5); ov.clumpA.tint = tint
        ov.clumpA.scale.set(sc); ov.clumpA.rotation = rot; ov.clumpA.position.set(0, -o.r * 0.10)
        ov.clumpB.texture = tex; ov.clumpB.anchor.set(0.5); ov.clumpB.tint = tint
        ov.clumpB.scale.set(sc * 0.82); ov.clumpB.rotation = rot + 0.6; ov.clumpB.position.set(0, -o.r * 0.34)
      }
    }
  }
  function clearObstacles() {
    obstacleToken = null
    obstacleRev = -1
    for (const ov of obstacleSprites) ov.root.visible = false
  }

  // Hazard pools (run.pools, acid + soap): soft saturated-green discs. One shared readable style
  // (deep green, double-stacked for punch on the light floor); alpha fades over the pool's final
  // moments as its remaining life `t` runs down.
  const poolPool = []
  function acquirePoolDisc() {
    const root = new Container()
    const a = new Sprite(T.fx.circle_05); a.anchor.set(0.5)
    const b = new Sprite(T.fx.circle_05); b.anchor.set(0.5)
    root.addChild(a, b)
    poolLayer.addChild(root)
    return { root, a, b }
  }
  function syncPools(list) {
    const n = list.length
    while (poolPool.length < n) poolPool.push(acquirePoolDisc())
    for (let i = 0; i < n; i++) {
      const pv = poolPool[i]
      const p = list[i]
      pv.root.visible = true
      pv.root.position.set(p.x, p.y)
      const fade = Math.min(1, p.t / 0.6) // dissolve over the last 0.6s of life
      const sc = fxScale(T.fx.circle_05, Math.max(p.r, 1) * 2)
      pv.a.scale.set(sc); pv.a.tint = 0x2fbf3f; pv.a.alpha = 0.5 * fade
      pv.b.scale.set(sc * 0.68); pv.b.tint = 0x7fe86a; pv.b.alpha = 0.55 * fade
    }
    for (let i = n; i < prevCount.pool; i++) poolPool[i].root.visible = false
    prevCount.pool = n
  }

  // Toxin blooms (run.blooms): expanding venom-green clouds. Three stacked soft puffs sized to the
  // sim-grown radius `r`, alpha ramps in as the cloud forms and out as it expires (t → dur).
  const bloomPool = []
  function acquireBloom() {
    const root = new Container()
    const a = new Sprite(T.fx.circle_05); a.anchor.set(0.5)
    const b = new Sprite(T.fx.circle_05); b.anchor.set(0.5)
    const c = new Sprite(T.fx.circle_05); c.anchor.set(0.5)
    root.addChild(a, b, c)
    bloomLayer.addChild(root)
    return { root, puffs: [a, b, c] }
  }
  function syncBlooms(list) {
    const n = list.length
    while (bloomPool.length < n) bloomPool.push(acquireBloom())
    for (let i = 0; i < n; i++) {
      const bv = bloomPool[i]
      const bl = list[i]
      bv.root.visible = true
      bv.root.position.set(bl.x, bl.y)
      const dur = Math.max(0.001, bl.dur)
      const inA = Math.min(1, bl.t / (dur * 0.2))
      const outA = Math.min(1, (dur - bl.t) / (dur * 0.25))
      const alpha = Math.max(0, Math.min(inA, outA))
      const sc = fxScale(T.fx.circle_05, Math.max(bl.r, 1) * 2)
      for (let k = 0; k < 3; k++) {
        const s = bv.puffs[k]
        const off = k === 0 ? 0 : bl.r * 0.4
        const ang = animT * 0.6 + k * 2.1
        s.position.set(Math.cos(ang) * off, Math.sin(ang) * off)
        s.scale.set(sc * (k === 0 ? 1 : 0.72) * (1 + 0.05 * Math.sin(animT * 3 + k)))
        s.tint = k % 2 ? 0x6fe04a : 0x3fae2f
        s.alpha = alpha * (k === 0 ? 0.5 : 0.4)
      }
    }
    for (let i = n; i < prevCount.bloom; i++) bloomPool[i].root.visible = false
    prevCount.bloom = n
  }

  // ---- v5.3 garden field elements ----------------------------------------------------------
  // Pheromone trails (run.trails, {x,y,t}): faint amber dots dropped under dying ants that living
  // ants accelerate along. Soft ground decals, brightest when fresh, fading as t → 0 (t counts down
  // from PHEROMONE_LIFE). Amber reads on the warm lawn floor (a saturated tint, not a pale wash).
  const trailPool = []
  function acquireTrail() {
    const s = new Sprite(T.fx.circle_05)
    s.anchor.set(0.5)
    trailLayer.addChild(s)
    return s
  }
  function syncTrails(list) {
    const n = list.length
    while (trailPool.length < n) trailPool.push(acquireTrail())
    for (let i = 0; i < n; i++) {
      const s = trailPool[i]
      const tr = list[i]
      s.visible = true
      s.position.set(tr.x, tr.y)
      const fade = Math.max(0, Math.min(1, tr.t / PHEROMONE_LIFE))
      s.tint = 0xe8a23a // warm amber pheromone
      s.alpha = 0.42 * fade
      s.scale.set(fxScale(T.fx.circle_05, 26))
    }
    for (let i = n; i < prevCount.trail; i++) trailPool[i].visible = false
    prevCount.trail = n
  }

  // Spider web slow-zones (run.webs, {x,y,r,t}): a real orb web baked ONCE and scaled per patch.
  // Pale silvery-cool silk reads on the warm sunlit garden lawn (floorTint 0xaad066 — cool wins on
  // warm ground). Off-centre hub, ~10 jittered radial spokes, sagging capture rings (each ring arc
  // bows INWARD toward the hub — that catenary sag is THE thing that reads as silk, not a wheel), a
  // few broken segments for wear, and a taut outer frame ring whose spoke-tips sit at EXACTLY the
  // slow radius r (drawn extent == tested extent). Rotated per-patch so tiled webs don't look
  // stamped; dissolves over its final 0.8s; a faint interior veil fills the zone so the hazard reads.
  const WEB_BAKE_RIM = 144 // bake radius (2× WEB_R=72) so hairlines survive scaling down to r
  const webTex = (() => {
    const g = new Graphics()
    const RIM = WEB_BAKE_RIM
    const N = 10                                // radial spokes
    const HX = RIM * 0.055, HY = -RIM * 0.04    // hub, slightly off-centre
    const rings = [0.30, 0.47, 0.63, 0.80, 1.0] // capture-ring fractions hub→rim (last = frame)
    const SAG = 0.35                            // sag depth as a fraction of ring spacing
    // spoke tips on the origin-centred rim circle, with fixed angular jitter (baked once, no flicker)
    const th = [], px = [], py = []
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (hash(i * 12.9 + 3.1) - 0.5) * 0.14 // ±0.07rad jitter
      th.push(a); px.push(Math.cos(a) * RIM); py.push(Math.sin(a) * RIM)
    }
    // faint interior veil so the slow-zone reads as a filled area — geometry carries the read
    g.circle(0, 0, RIM).fill({ color: 0xdfeef6, alpha: 0.06 })
    // radial spokes, hub → tip (dimmer/cooler structural threads)
    for (let i = 0; i < N; i++) g.moveTo(HX, HY).lineTo(px[i], py[i])
    g.stroke({ width: 1.2, color: 0xcfe2ee, alpha: 0.65, cap: 'round' })
    // capture rings (inner) — concentric around the off-centre hub, each segment sagging toward it;
    // a few segments broken for wear. quad control at M + 2·sag·û gives an actual mid-arc sag of `sag`.
    for (let r = 0; r < rings.length - 1; r++) {
      const f = rings[r], fp = r === 0 ? 0 : rings[r - 1]
      for (let i = 0; i < N; i++) {
        if (hash(r * 7.3 + i * 2.9 + 1.7) < 0.12) continue // broken segment
        const j = (i + 1) % N
        const vix = HX + f * (px[i] - HX), viy = HY + f * (py[i] - HY)
        const vjx = HX + f * (px[j] - HX), vjy = HY + f * (py[j] - HY)
        const mx = (vix + vjx) / 2, my = (viy + vjy) / 2
        let ux = HX - mx, uy = HY - my; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul
        const sag = SAG * (f - fp) * Math.hypot(px[i] - HX, py[i] - HY) // frac × radial ring spacing
        g.moveTo(vix, viy).quadraticCurveTo(mx + ux * 2 * sag, my + uy * 2 * sag, vjx, vjy)
      }
    }
    g.stroke({ width: 1.0, color: 0xeef6fb, alpha: 0.85, cap: 'round' })
    // taut outer frame ring — spoke tips at EXACTLY r (= drawn rim), only a gentle bow between them
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N
      const mx = (px[i] + px[j]) / 2, my = (py[i] + py[j]) / 2
      let ux = -mx, uy = -my; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul
      const sag = RIM * 0.05
      g.moveTo(px[i], py[i]).quadraticCurveTo(mx + ux * sag, my + uy * sag, px[j], py[j])
    }
    g.stroke({ width: 1.4, color: 0xeef6fb, alpha: 0.9, cap: 'round' })
    // 2 thin anchor tethers just past the rim (clearly tethers, not web body)
    for (const i of [2, 7]) g.moveTo(px[i], py[i]).lineTo(Math.cos(th[i]) * (RIM + 7), Math.sin(th[i]) * (RIM + 7))
    g.stroke({ width: 0.9, color: 0xcfe2ee, alpha: 0.5, cap: 'round' })
    // messy hub tangle
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + 0.4, ln = RIM * 0.05
      g.moveTo(HX - Math.cos(a) * ln, HY - Math.sin(a) * ln).lineTo(HX + Math.cos(a) * ln, HY + Math.sin(a) * ln)
    }
    g.stroke({ width: 0.8, color: 0xeef6fb, alpha: 0.7, cap: 'round' })
    return bake(g)
  })()
  const webPool = []
  function acquireWeb() {
    const spr = new Sprite(webTex.tex); spr.anchor.set(webTex.ax, webTex.ay)
    webLayer.addChild(spr)
    return { root: spr, spr }
  }
  function syncWebs(list) {
    const n = list.length
    while (webPool.length < n) webPool.push(acquireWeb())
    for (let i = 0; i < n; i++) {
      const wv = webPool[i]
      const web = list[i]
      wv.root.visible = true
      wv.root.position.set(web.x, web.y)
      const fade = Math.min(1, web.t / 0.8) // dissolve over the last 0.8s of life
      const ph = hash(web.x * 0.11 + web.y * 0.07) // fixed per-patch seed (rotation + shimmer phase)
      wv.spr.rotation = ph * Math.PI * 2                        // fixed per position — no stamped tiling
      wv.spr.scale.set(Math.max(web.r, 1) / WEB_BAKE_RIM)       // spoke tips land at EXACTLY r
      wv.spr.alpha = fade * (0.86 + 0.14 * Math.sin(animT * 1.6 + ph * 6.28)) // cheap one-sprite shimmer
    }
    for (let i = n; i < prevCount.web; i++) webPool[i].root.visible = false
    prevCount.web = n
  }

  // Pheromone Lure decoys (run.lures, {x,y,t,dur,...}): a cute beacon the swarm converges on — soft
  // amber glow + a pulsing double-stacked gold star, floated over the crowd so it POPS. Fades in over
  // its first moments; the one-shot burst on expiry renders via the {type:'explode'} event elsewhere.
  const lurePool = []
  function acquireLure() {
    const root = new Container()
    const glow = new Sprite(T.fx.circle_05); glow.anchor.set(0.5)
    const ring = new Sprite(T.fx.light_02); ring.anchor.set(0.5)
    const star1 = new Sprite(T.fx.star_04); star1.anchor.set(0.5)
    const star2 = new Sprite(T.fx.star_04); star2.anchor.set(0.5)
    root.addChild(glow, ring, star1, star2)
    lureLayer.addChild(root)
    return { root, glow, ring, star1, star2 }
  }
  function syncLures(list) {
    const n = list.length
    while (lurePool.length < n) lurePool.push(acquireLure())
    for (let i = 0; i < n; i++) {
      const lv = lurePool[i]
      const lu = list[i]
      lv.root.visible = true
      lv.root.position.set(lu.x, lu.y)
      const pulse = 0.5 + 0.5 * Math.sin(animT * 6 + i * 1.3)
      const inA = Math.min(1, lu.t / 0.25) // fade in over the first 0.25s (lu.t ages up to lu.dur)
      lv.glow.tint = 0xffd36b; lv.glow.alpha = 0.5 * inA * (0.7 + 0.3 * pulse)
      lv.glow.scale.set(fxScale(T.fx.circle_05, 70 + pulse * 14))
      lv.ring.tint = 0xffe9a0; lv.ring.alpha = 0.55 * inA
      lv.ring.scale.set(fxScale(T.fx.light_02, 54 + pulse * 10))
      const ssc = fxScale(T.fx.star_04, 30 + pulse * 6)
      lv.star1.tint = lv.star2.tint = 0xff9d1a
      lv.star1.scale.set(ssc); lv.star2.scale.set(ssc)
      lv.star1.rotation = animT * 1.5; lv.star2.rotation = -animT * 1.2
      lv.star1.alpha = lv.star2.alpha = inA
    }
    for (let i = n; i < prevCount.lure; i++) lurePool[i].root.visible = false
    prevCount.lure = n
  }

  // Pesticide spray strips (run.strips): telegraphed rotated rectangles — one shared Graphics cleared/
  // redrawn per frame, same telegraph idiom as redrawBombs (Graphics is the sanctioned exception for
  // ground telegraphs). During `fuse`: a pulsing amber warning outline that ramps urgency toward 0
  // (no hazard fill yet). Once live: a filled acid-green hazard strip fading over its remaining life.
  function redrawStrips(run) {
    stripG.clear()
    for (const s of run.strips || []) {
      const cos = Math.cos(s.angle), sin = Math.sin(s.angle)
      const hx = s.len / 2, hy = s.w / 2
      const flat = []
      for (const [lx, ly] of [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]]) {
        flat.push(s.x + lx * cos - ly * sin, s.y + lx * sin + ly * cos)
      }
      if (s.fuse > 0) {
        const urgency = SPRAY_FUSE > 0 ? 1 - s.fuse / SPRAY_FUSE : 1
        const pulse = 0.5 + 0.5 * Math.sin(animT * (6 + urgency * 16))
        const fillA = 0.05 + urgency * 0.08 + pulse * 0.03
        const rimA = Math.min(1, 0.5 + urgency * 0.35 + pulse * 0.1)
        stripG.poly(flat).fill({ color: 0xffd24a, alpha: fillA })
        stripG.poly(flat).stroke({ width: 3, color: 0xffe37a, alpha: rimA })
      } else {
        const fade = Math.min(1, s.t / SPRAY_ACTIVE)
        stripG.poly(flat).fill({ color: 0x8fe04a, alpha: 0.34 * fade })
        stripG.poly(flat).stroke({ width: 2.5, color: 0xbfff6a, alpha: 0.7 * fade })
      }
    }
  }

  // ---- v5.4 chapter-4-7 field elements -----------------------------------------------------
  // Every one of these guards its run.* field (`run.traps || []`): the sim half lands in parallel,
  // and a chapter that never seeds the array must render nothing rather than throw.
  //
  // Snap traps (undergrowth signature, run.traps {x,y,r,armed,cd}): permanent furniture that bites
  // BOTH sides, so it's drawn to be read at a glance — the armed texture is a wide toothed ring, the
  // sprung one a shut bar (see the bakes). A sprung trap dims to alpha 0.45 and lifts back to full
  // as its cd runs down toward SNAP_TRAP_REARM, so "this one is about to be live again" is legible
  // without a number; an armed trap breathes so it reads as hot even when you're not looking at it.
  const trapPool = []
  function placeTrap(s, tr) {
    const look = tr.armed ? T.trapArmed : T.trapSprung
    if (s.texture !== look.tex) { s.texture = look.tex; s.anchor.set(look.ax, look.ay) }
    s.position.set(tr.x, tr.y)
    const sc = (tr.r || 30) / 15 // both traps are baked at a 15px working radius
    if (tr.armed) {
      s.tint = 0xffffff
      s.alpha = 1
      s.scale.set(sc * (1 + 0.03 * Math.sin(animT * 3 + (tr.x + tr.y) * 0.05)))
      s.rotation = 0
    } else {
      // re-arm tell: the closer cd gets to 0, the brighter/steadier the sprung trap sits
      const k = SNAP_TRAP_REARM > 0 ? 1 - Math.max(0, Math.min(1, tr.cd / SNAP_TRAP_REARM)) : 1
      s.tint = mix(0x6b727c, 0xffffff, k)
      s.alpha = 0.45 + k * 0.5
      s.scale.set(sc)
      s.rotation = 0
    }
  }

  // Traffic lanes (city signature, run.lanes): 'warn' telegraphs a hazard-striped band (the
  // redrawStrips idiom — a shared Graphics cleared and redrawn per frame), then 'sweep' runs a car
  // down it. The band stays drawn (fainter) during the sweep so you can still see where the lane is
  // while the car is in it. Chevrons point the way the car will come — a lane you can't read the
  // direction of is a coin flip, and this thing hits for TRAFFIC_DMG.
  function redrawLanes(run) {
    laneG.clear()
    for (const ln of run.lanes || []) {
      const cos = Math.cos(ln.angle)
      const sin = Math.sin(ln.angle)
      const hx = ln.len / 2
      const hy = ln.w / 2
      const flat = []
      for (const [lx, ly] of [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]]) {
        flat.push(ln.x + lx * cos - ly * sin, ln.y + lx * sin + ly * cos)
      }
      const warn = ln.phase === 'warn'
      const urgency = warn ? (TRAFFIC_WARN > 0 ? 1 - ln.t / TRAFFIC_WARN : 1) : 1
      const pulse = 0.5 + 0.5 * Math.sin(animT * (6 + urgency * 16))
      const fillA = warn ? 0.06 + urgency * 0.1 + pulse * 0.04 : 0.05
      const rimA = warn ? Math.min(1, 0.45 + urgency * 0.4 + pulse * 0.12) : 0.3
      laneG.poly(flat).fill({ color: 0xffd24a, alpha: fillA })
      laneG.poly(flat).stroke({ width: 3, color: 0xffe37a, alpha: rimA })
      // chevrons along the lane, pointing downstream — the "which way" cue
      const n = 7
      for (let i = 0; i < n; i++) {
        const d = -hx + ((i + 0.5) / n) * ln.len
        const cx = ln.x + d * cos
        const cy = ln.y + d * sin
        const tip = [cx + cos * hy * 0.5, cy + sin * hy * 0.5]
        const back = hy * 0.45
        laneG.beginPath()
        for (const s of [-1, 1]) {
          laneG.moveTo(tip[0] - cos * back - sin * s * hy * 0.55, tip[1] - sin * back + cos * s * hy * 0.55)
          laneG.lineTo(tip[0], tip[1])
        }
        laneG.stroke({ width: 3, color: 0xffe37a, alpha: (warn ? 0.3 + urgency * 0.3 : 0.16) * (0.7 + 0.3 * pulse) })
      }
    }
  }

  // The car itself: one rig per live sweep — the baked car plus a headlight wash thrown ahead of it.
  // Its centre is (x,y) + dir × ((carT - 0.5) × len), straight off the contract.
  const carPool = []
  let carCount = 0
  function acquireCar() {
    const root = new Container()
    const glow = new Sprite(T.fx.light_02)
    glow.anchor.set(0.5)
    glow.tint = 0xfff3c4
    const body = spriteOf(T.car)
    root.addChild(glow, body)
    carLayer.addChild(root)
    return { root, glow, body }
  }
  function syncCars(run) {
    const lanes = (run.lanes || []).filter((l) => l.phase === 'sweep')
    while (carPool.length < lanes.length) carPool.push(acquireCar())
    for (let i = 0; i < lanes.length; i++) {
      const ln = lanes[i]
      const cv = carPool[i]
      cv.root.visible = true
      const d = ((ln.carT ?? 0) - 0.5) * ln.len
      const cx = ln.x + Math.cos(ln.angle) * d
      const cy = ln.y + Math.sin(ln.angle) * d
      cv.root.position.set(cx, cy)
      cv.root.rotation = ln.angle
      cv.body.scale.set(1)
      // headlight wash: thrown forward along the lane, flickering just enough to feel driven
      cv.glow.position.set(TRAFFIC_CAR_LEN * 0.75, 0)
      cv.glow.scale.set(fxScale(T.fx.light_02, TRAFFIC_CAR_W * 2.4), fxScale(T.fx.light_02, TRAFFIC_CAR_W * 1.5))
      cv.glow.alpha = 0.5 + 0.08 * Math.sin(animT * 22)
      if (frameDt > 0 && Math.random() < 0.5) { // exhaust/road spray off the back
        spawnParticle(T.fx.circle_05, cx - Math.cos(ln.angle) * TRAFFIC_CAR_LEN * 0.5,
          cy - Math.sin(ln.angle) * TRAFFIC_CAR_LEN * 0.5,
          -Math.cos(ln.angle) * 40, -Math.sin(ln.angle) * 40, 0.3, 0.08, 0x8f959d, 0.1, 2)
      }
    }
    for (let i = lanes.length; i < carCount; i++) carPool[i].root.visible = false
    carCount = lanes.length
  }

  // Gravity wells (beyond signature, run.wells {x,y,r,g}): permanent, harmless, and they BEND every
  // projectile that flies through — so the field has to be legible without ever reading as damage.
  // Deliberately NOT the black hole's look (that's the player's weapon and it kills): no dark core,
  // no vortex. Instead a cold open ring with inward-drifting contour rings and CURVED streamlines
  // that show which way a shot gets bent — the animation flows inward, so the pull direction reads.
  const wellPool = []
  function syncWells(run) {
    const list = run.wells || []
    syncPool(wellPool, wellLayer, list, 'well', { tex: T.holeDisc, ax: 0.5, ay: 0.5 }, (s, w) => {
      s.position.set(w.x, w.y)
      s.tint = 0x6f7fd8
      s.alpha = 0.3
      s.scale.set((w.r * 2) / 512)
    })
    wellG.clear()
    for (let i = 0; i < list.length; i++) {
      const w = list[i]
      const r = w.r || 190
      wellG.circle(w.x, w.y, r).stroke({ width: 2, color: 0x9fb0ff, alpha: 0.3 }) // influence edge
      // contour rings drifting inward: three rings sharing one phase, respawning at the rim
      for (let k = 0; k < 3; k++) {
        const p = ((animT * 0.35 + k / 3 + i * 0.17) % 1)
        const rr = r * (1 - p)
        wellG.circle(w.x, w.y, Math.max(2, rr)).stroke({ width: 1.6, color: 0xbfc8ff, alpha: 0.32 * p })
      }
      // streamlines: short arcs spiralling in, drawn as real curves so the BEND is the message
      for (let k = 0; k < 8; k++) {
        const a0 = (k / 8) * Math.PI * 2 + animT * 0.25 + i * 0.4
        wellG.beginPath()
        for (let j = 0; j <= 8; j++) {
          const f = j / 8
          const rr = r * (0.92 - f * 0.55)
          const a = a0 + f * 0.85 // the swirl: angle advances as the radius closes
          const px = w.x + Math.cos(a) * rr
          const py = w.y + Math.sin(a) * rr
          if (j === 0) wellG.moveTo(px, py)
          else wellG.lineTo(px, py)
        }
        wellG.stroke({ width: 1.4, color: 0x9fb0ff, alpha: 0.28 })
      }
      const core = 0.5 + 0.5 * Math.sin(animT * 2 + i)
      wellG.circle(w.x, w.y, r * 0.07 + core * 2).fill({ color: 0xdfe4ff, alpha: 0.5 })
    }
  }

  // Sewer geysers + reality rifts (run.geysers {x,y,r,fuse,dur,dmg}) and Debris Toss landing rings
  // (run.lobs): both are "this circle is about to go off", so they share one telegraph Graphics.
  // Geysers damage ENEMIES ONLY, so they're drawn in a cool sewer-green that can never be mistaken
  // for the red volatile-bomb telegraph (bombG) that hurts YOU — the colour IS the safety cue.
  function redrawHazards(run) {
    hazardG.clear()
    for (const gy of run.geysers || []) {
      const dur = Math.max(0.001, gy.dur || 1)
      const urgency = 1 - Math.max(0, Math.min(1, gy.fuse / dur))
      const pulse = 0.5 + 0.5 * Math.sin(animT * (5 + urgency * 18))
      hazardG.circle(gy.x, gy.y, gy.r).fill({ color: 0x3fae7a, alpha: 0.1 + urgency * 0.14 + pulse * 0.04 })
      hazardG.circle(gy.x, gy.y, gy.r).stroke({ width: 2.5 + urgency * 2, color: 0x6fe0a8, alpha: Math.min(1, 0.5 + urgency * 0.4) })
      // the charge: an inner ring swelling toward the rim as the fuse burns down
      hazardG.circle(gy.x, gy.y, gy.r * urgency).stroke({ width: 2, color: 0xbfffe0, alpha: 0.35 + pulse * 0.2 })
      if (frameDt > 0 && Math.random() < 0.35) { // bubbles boiling up out of the grate
        const a = Math.random() * Math.PI * 2
        const d = Math.random() * gy.r * 0.7
        spawnParticle(T.fx.circle_05, gy.x + Math.cos(a) * d, gy.y + Math.sin(a) * d,
          0, -30 - urgency * 40, 0.4, 0.05, 0x6fe0a8, 0.05, 0.5)
      }
    }
    for (const lb of run.lobs || []) { // where the thrown chunk is going to land
      const k = Math.max(0, Math.min(1, lb.t / Math.max(0.001, lb.flight)))
      hazardG.circle(lb.tx, lb.ty, lb.r).stroke({ width: 2, color: 0xffb37a, alpha: 0.25 + k * 0.45 })
      hazardG.circle(lb.tx, lb.ty, lb.r * k).fill({ color: 0xffb37a, alpha: 0.12 })
    }
  }

  // ---- v5.4 roster attack telegraphs -------------------------------------------------------
  // The chapter-4-7 predators all commit to an attack they cannot steer out of, and every one of
  // them snapshots its heading/target at the START of a telegraph phase — so what render draws
  // here is not a hint, it's the literal path. Sidestepping it always works; that's the contract.
  // Read off the phase state each sim step keeps on the enemy (_pounceState/_airState/
  // _chargeState/_beamState/_coneAngle), all of which MUST be guarded: the roster flags are
  // per-chapter, and title/daily/archetype-fallback enemies carry none of them.
  //
  // The colour IS the safety cue, the same rule redrawHazards' green geysers follow. Four of these
  // five end in the player taking damage, so they speak the established amber hazard language of
  // the traffic lanes and spray strips (0xffd24a fill / 0xffe37a rim), tightening and quickening
  // as the fuse burns down. The flashlight cone is the deliberate exception — see its block.
  function redrawTelegraphs(run) {
    teleG.clear()
    const p = run.player
    for (const e of run.enemies) {
      // pounce 'aim' (undergrowth's cat): it has stopped dead and its heading is already locked, so
      // the leap is knowable before it happens — draw it and stepping aside beats it. The lane ends
      // exactly where the cat will (speed × POUNCE_LEAP_T), and it vanishes the moment it leaps:
      // during 'leap' there is nothing left to warn about, the cat itself is the thing you see.
      if (e._pounceState === 'aim') {
        const urgency = POUNCE_AIM_T > 0 ? 1 - Math.max(0, e._pounceT || 0) / POUNCE_AIM_T : 1
        const pulse = 0.5 + 0.5 * Math.sin(animT * (6 + urgency * 16))
        const ux = e._pounceDirX || 0
        const uy = e._pounceDirY || 0
        const len = e.speed * POUNCE_LEAP_SPEED_MUL * POUNCE_LEAP_T
        const ex = e.x + ux * len
        const ey = e.y + uy * len
        const hw = e.radius * 1.5
        const nx = -uy * hw
        const ny = ux * hw
        teleG.poly([e.x + nx, e.y + ny, ex + nx, ey + ny, ex - nx, ey - ny, e.x - nx, e.y - ny])
          .fill({ color: 0xffd24a, alpha: 0.05 + urgency * 0.08 + pulse * 0.03 })
        // the leap line: the spine of the arc, thickening as the crouch winds up
        teleG.moveTo(e.x, e.y)
        teleG.lineTo(ex, ey)
        teleG.stroke({ width: 2 + urgency * 2.5, color: 0xffe37a, alpha: Math.min(1, 0.45 + urgency * 0.4 + pulse * 0.1) })
        // landing ring: closes onto the impact point as it commits — a shrinking ring reads as
        // "something is arriving here", which is exactly what is about to happen
        teleG.circle(ex, ey, hw * (1.9 - urgency * 0.8))
          .stroke({ width: 2 + urgency * 2, color: 0xffe37a, alpha: Math.min(1, 0.35 + urgency * 0.5 + pulse * 0.12) })
      }

      // aerialStrike 'mark' (undergrowth's owl): the owl is overhead and untouchable, so the shadow
      // on the ground IS the attack — it's the only part of it the player can see or act on. The
      // blot swells (the owl is getting closer to the ground) while the amber ring tightens onto the
      // locked point. The point never re-aims, so walking off the mark always beats it.
      if (e._airState === 'mark') {
        const urgency = AERIAL_MARK_T > 0 ? 1 - Math.max(0, e._airT || 0) / AERIAL_MARK_T : 1
        const pulse = 0.5 + 0.5 * Math.sin(animT * (6 + urgency * 16))
        const tx = e._airTargX ?? e.x
        const ty = e._airTargY ?? e.y
        const r = e.radius * 1.4
        teleG.circle(tx, ty, r * (0.4 + urgency * 0.6)).fill({ color: 0x2a2438, alpha: 0.16 + urgency * 0.26 })
        teleG.circle(tx, ty, r * (2.4 - urgency * 1.4))
          .stroke({ width: 2 + urgency * 2.5, color: 0xffe37a, alpha: Math.min(1, 0.4 + urgency * 0.45 + pulse * 0.12) })
        teleG.circle(tx, ty, r).stroke({ width: 1.6, color: 0xffd24a, alpha: 0.25 + pulse * 0.2 })
      }

      // lineCharge 'lock' (city's robot vacuum): deliberately the SAME band-and-chevrons lane the
      // traffic signature draws (redrawLanes) — both are city hazards that run you down in a
      // straight line, so they must read as one rule rather than two things to learn. Only the
      // anchoring differs: a traffic lane is centred on its band, this one starts at the vacuum and
      // runs LINE_CHARGE_LEN forward along the heading it just locked.
      if (e._chargeState === 'lock') {
        const urgency = LINE_CHARGE_LOCK_T > 0 ? 1 - Math.max(0, e._chargeT || 0) / LINE_CHARGE_LOCK_T : 1
        const pulse = 0.5 + 0.5 * Math.sin(animT * (6 + urgency * 16))
        const cos = e._chargeDirX || 0
        const sin = e._chargeDirY || 0
        const hy = LINE_CHARGE_W / 2
        const flat = []
        for (const [lx, ly] of [[0, -hy], [LINE_CHARGE_LEN, -hy], [LINE_CHARGE_LEN, hy], [0, hy]]) {
          flat.push(e.x + lx * cos - ly * sin, e.y + lx * sin + ly * cos)
        }
        teleG.poly(flat).fill({ color: 0xffd24a, alpha: 0.06 + urgency * 0.1 + pulse * 0.04 })
        teleG.poly(flat).stroke({ width: 3, color: 0xffe37a, alpha: Math.min(1, 0.45 + urgency * 0.4 + pulse * 0.12) })
        // chevrons pointing downstream — the redrawLanes "which way" cue, same geometry
        const n = 6
        for (let i = 0; i < n; i++) {
          const d = ((i + 0.5) / n) * LINE_CHARGE_LEN
          const tipX = e.x + (d + hy * 0.5) * cos
          const tipY = e.y + (d + hy * 0.5) * sin
          const back = hy * 0.45
          teleG.beginPath()
          for (const s of [-1, 1]) {
            teleG.moveTo(tipX - cos * back - sin * s * hy * 0.55, tipY - sin * back + cos * s * hy * 0.55)
            teleG.lineTo(tipX, tipY)
          }
          teleG.stroke({ width: 3, color: 0xffe37a, alpha: (0.3 + urgency * 0.3) * (0.7 + 0.3 * pulse) })
        }
      }

      // flashlightCone (undergrowth's exterminator elite): the one telegraph here that is NOT a
      // damage cue — the cone hurts nothing at all, it ENRAGES the swarm standing in it. So it
      // breaks the amber hazard language on purpose: no rim stroke, no fuse, nothing tightening,
      // nothing to dodge. It's a soft edgeless wash in the exact orange an enraged enemy tints to
      // (0xff8a5c, see syncEnemies) — the light is the colour of the thing it makes. Three nested
      // sectors give it a lamp's falloff instead of an edge, so it can never be misread as a floor
      // hazard you must stay out of: what walks OUT of it is the threat, not the standing in it.
      if (e._coneAngle !== undefined && e._coneAngle !== null) {
        const breathe = 0.5 + 0.5 * Math.sin(animT * 3)
        for (let k = 0; k < 3; k++) {
          const f = 1 - k * 0.3 // outermost sector is the true FLASHLIGHT_RANGE/ARC extent
          teleG.moveTo(e.x, e.y)
          teleG.arc(e.x, e.y, FLASHLIGHT_RANGE * f, e._coneAngle - FLASHLIGHT_ARC * f, e._coneAngle + FLASHLIGHT_ARC * f)
          teleG.lineTo(e.x, e.y)
          teleG.fill({ color: 0xff8a5c, alpha: 0.05 + k * 0.03 + breathe * 0.015 })
        }
      }

      // pullBeam 'beam' (beyond's UFO elite): the pull is a radius test, not a shaft — so the ring
      // is the real information (inside it you are being taken) and the tether is the confirmation
      // of which way. PULL_BEAM_FORCE sits under the player's own speed, so "walk out" is always
      // the answer and the ring is what tells you how far out is out. PULL_BEAM_T is a window
      // rather than a fuse, so instead of tightening, the beam irises open and snaps shut — it
      // should never pop into existence already at full strength.
      if (e._beamState === 'beam') {
        const left = Math.max(0, e._beamT || 0)
        const k = Math.max(0, Math.min(1, Math.min(PULL_BEAM_T - left, left) / 0.18))
        const flick = 0.85 + 0.15 * Math.sin(animT * 30) // the tractor hum
        teleG.circle(e.x, e.y, PULL_BEAM_RANGE)
          .stroke({ width: 2 + k, color: 0xffd24a, alpha: 0.32 * k * flick })
        teleG.circle(e.x, e.y, (PULL_BEAM_W / 2) * 1.15 * k).fill({ color: 0xffe37a, alpha: 0.22 * k * flick })
        const dx = e.x - p.x
        const dy = e.y - p.y
        const d = Math.hypot(dx, dy)
        if (d <= PULL_BEAM_RANGE && d > 1e-6) {
          const ux = dx / d
          const uy = dy / d
          const hw = (PULL_BEAM_W / 2) * k
          const nx = -uy * hw
          const ny = ux * hw
          const band = [p.x + nx, p.y + ny, e.x + nx, e.y + ny, e.x - nx, e.y - ny, p.x - nx, p.y - ny]
          teleG.poly(band).fill({ color: 0xffd24a, alpha: 0.12 * k * flick })
          teleG.poly(band).stroke({ width: 2, color: 0xffe37a, alpha: 0.45 * k * flick })
          // motes crawling UP the tether toward the saucer: the arrows point where you are being
          // taken, scrolling so the drag is legible even while you're winning against it
          const n = Math.max(2, Math.round(d / 60))
          for (let i = 0; i < n; i++) {
            const f = ((i + (animT * 0.9) % 1) / n)
            const cx = p.x + ux * d * f
            const cy = p.y + uy * d * f
            teleG.beginPath()
            for (const s of [-1, 1]) {
              teleG.moveTo(cx - ux * hw * 0.5 - uy * s * hw * 0.6, cy - uy * hw * 0.5 + ux * s * hw * 0.6)
              teleG.lineTo(cx + ux * hw * 0.5, cy + uy * hw * 0.5)
            }
            teleG.stroke({ width: 2, color: 0xffe37a, alpha: 0.5 * k * flick * (1 - f) })
          }
        }
      }
    }
  }

  // Debris Toss lobs (run.lobs): the sim only tracks t counting UP to flight — THE ARC IS RENDER'S.
  // Ground position lerps (fromX,fromY) -> (tx,ty); the chunk lifts off it by a parabola peaking at
  // the halfway point (4k(1-k), scaled to the throw's length), and a shadow stays on the ground
  // beneath it. The shadow is what sells the height — without it a lob just slides.
  const lobPool = []
  function acquireLob() {
    const root = new Container()
    const shadow = spriteOf(T.playerShadow)
    shadow.tint = 0x000000
    const chunk = spriteOf(T.rockChunk)
    root.addChild(shadow, chunk)
    lobLayer.addChild(root)
    return { root, shadow, chunk }
  }
  let lobCount = 0
  function syncLobs(run) {
    const list = run.lobs || []
    while (lobPool.length < list.length) lobPool.push(acquireLob())
    for (let i = 0; i < list.length; i++) {
      const lb = list[i]
      const lv = lobPool[i]
      lv.root.visible = true
      const k = Math.max(0, Math.min(1, lb.t / Math.max(0.001, lb.flight)))
      const gx = lerp(lb.fromX, lb.tx, k)
      const gy = lerp(lb.fromY, lb.ty, k)
      const throwLen = Math.hypot(lb.tx - lb.fromX, lb.ty - lb.fromY)
      const hop = Math.min(160, 40 + throwLen * 0.3) * 4 * k * (1 - k) // parabola, peaks at k=0.5
      lv.root.position.set(gx, gy)
      lv.shadow.position.set(0, 0)
      lv.shadow.alpha = 0.1 + 0.2 * (1 - hop / 160)
      lv.shadow.scale.set((lb.r / PLAYER.radius) * 0.5 * (1 - 0.3 * (hop / 160)))
      lv.chunk.position.set(0, -hop)
      lv.chunk.rotation = k * 9 + i
      lv.chunk.scale.set((lb.r || 20) / 12)
    }
    for (let i = list.length; i < lobCount; i++) lobPool[i].root.visible = false
    lobCount = list.length
  }

  // Whip swings (one-off {type:'whip'} events, render-local like rings/arcs). An ANCHORED melee
  // swoosh — NOT a projectile: one big curved twirl glyph (Kenney twirl = an arc curling around a
  // center) pinned to the player, double-stacked (soft alpha needs it), deep mint over the murky
  // floor, rotating across the swept wedge over its short life with a fainter trailing ghost as
  // motion smear and a bright spark cracking at the tip. Segment-chain approaches read as
  // "concatenated blobs" (twice user-rejected) — one glyph IS the arc, don't rebuild it from parts.
  const MAX_WHIPS = 8
  const WHIP_CORE = 0x2fd6a0         // vivid spring-green swoosh — must sit clearly ABOVE the murky floor
  const WHIP_EDGE = 0x9fffd9         // lighter mint on the stacked top copy
  const WHIP_TIP = 0xcafff0          // the crack: the one light accent, tip only
  const WHIP_GHOST_LAG = 0.5         // rad the ghost swoosh trails the leading one
  const whips = []
  for (let i = 0; i < MAX_WHIPS; i++) whips.push({ live: false, x: 0, y: 0, angle: 0, range: 0, arc: 0, t: 0, dur: 0.18, root: null, lead: null, ghost: null, tip: null })
  let whipCursor = 0
  function makeSwoosh(tintA, tintB) {
    const c = new Container()
    for (const tint of [tintA, tintB]) {
      const s = new Sprite(T.fx.slash_02)
      s.anchor.set(0.5)
      s.tint = tint
      c.addChild(s)
    }
    return c
  }
  function spawnWhip(x, y, angle, range, arc) {
    const wp = whips[whipCursor]
    whipCursor = (whipCursor + 1) % MAX_WHIPS
    if (!wp.root) {
      wp.root = new Container()
      wp.ghost = makeSwoosh(WHIP_CORE, WHIP_CORE)
      wp.lead = makeSwoosh(WHIP_CORE, WHIP_EDGE)
      wp.tip = new Sprite(T.fx.spark_04)
      wp.tip.anchor.set(0.5)
      wp.tip.tint = WHIP_TIP
      wp.root.addChild(wp.ghost, wp.lead, wp.tip)
      whipLayer.addChild(wp.root)
    }
    wp.live = true
    wp.x = x; wp.y = y; wp.angle = angle; wp.range = range; wp.arc = arc || 1
    wp.t = 0
    wp.root.visible = true
    // size the swoosh so its arc reaches `range` from the player (twirl art spans ~90% of its frame)
    const sc = (range * 2) / (T.fx.slash_02.width * 0.9)
    wp.lead.scale.set(sc)
    wp.ghost.scale.set(sc)
  }
  function updateWhips(dt) {
    for (const wp of whips) {
      if (!wp.live) continue
      if (dt > 0) wp.t += dt
      if (wp.t >= wp.dur) { wp.live = false; wp.root.visible = false; continue }
      const k = wp.t / wp.dur
      wp.root.position.set(wp.x, wp.y)
      const flash = Math.sin(Math.PI * k) // ramp in then out
      // the swoosh cracks from one arc rim to the other (a full turn when arc = 2pi / cyclone)
      const sweep = wp.angle - wp.arc / 2 + wp.arc * k
      // slash_02's crescent bulge natively points DOWN (+y) in its frame — offset by -pi/2 so the
      // bulge tracks the sweep direction (the side the swing actually hits)
      wp.lead.rotation = sweep - Math.PI / 2
      wp.lead.alpha = flash
      wp.ghost.rotation = sweep - Math.PI / 2 - Math.min(wp.arc, WHIP_GHOST_LAG)
      wp.ghost.alpha = flash * 0.3
      wp.tip.position.set(wp.range * Math.cos(sweep), wp.range * Math.sin(sweep))
      wp.tip.rotation = k * 6 // a little spin on the spark
      wp.tip.alpha = Math.pow(flash, 1.6) * 0.95 // sharp pop, concentrated at full extension
      wp.tip.scale.set(fxScale(T.fx.spark_04, wp.range * 0.3))
    }
  }
  function clearWhips() {
    for (const wp of whips) { wp.live = false; if (wp.root) wp.root.visible = false }
  }

  // Claw Rake slashes (one-off {type:'clawRake'} events) — the whip's anchored-melee idiom, on a
  // deliberately different shape. The whip is slash_02: one FAT solid swoosh curling across the
  // wedge, and borrowing it made the rake read as a second whip. A rake is THREE THIN PARALLEL
  // GASHES landing together, side by side at one reach, splayed across the wedge. They flash as one
  // and drift outward as they fade — the arc reads as raked, not swung. Each tine is one drawn gash
  // (see bakeClawGash), never a chain of segments — the same "one shape IS the arc" rule as the whip.
  const MAX_CLAWS = 8
  // Each tine's reach as a fraction of the rake's range. THE GASHES MUST NOT TOUCH — the gap
  // between them is the whole claw read; the moment they overlap they fuse into one fat crescent
  // and it's a swoosh again. Two things have to hold together:
  //   - the spacing here must exceed a gash's thickness (GASH_W + rim). At range 100 these sit at
  //     72/86/100px: ~14px apart against a ~9px gash, so ~5px of floor shows between them.
  //   - the FAN must stay SMALL. A gash spans GASH_SPAN (0.92 rad) along its length, so fanning by
  //     less than that (the old +-0.24) doesn't separate them at all — it just slides overlapping
  //     arcs along each other. Separation comes from the radius; the fan is only a slight splay.
  const CLAW_TINE_R = [0.72, 0.86, 1.0]
  // The fan and the sweep both spend the SAME angular budget as the gash itself — everything drawn
  // has to fit inside arc/2 (see the q solve in updateClaws), so widening either one narrows the
  // gashes. Keep them small: the drawn rake must never claim ground the sector doesn't test.
  const CLAW_TINE_FAN = [-0.08, 0.0, 0.075] // rad (x arc): a paw's claws splay a little, not a lot
  const CLAW_FAN_MAX = 0.08                 // == max |CLAW_TINE_FAN|, kept as a const for the solve
  const CLAW_SWEEP = 0.15                   // fraction of arc the rake travels across during its life
  const CLAW_TINE_A = [0.82, 1.0, 0.78]     // outer gashes lighter — the middle claw bites deepest
  // A gash is DRAWN, not stamped from the Kenney slash glyph. That PNG's alpha falls off soft and
  // round, so it can only ever read as a fat smear — there is no needle tip anywhere in it, at any
  // scale or squash. A claw mark is the opposite shape: double-tapered, sharp at BOTH ends, fat at
  // the belly, with a hard rim. Drawing it also deletes three workarounds the glyph needed — the
  // hand-measured arc center (bake() returns the anchor), the 82°->50° squash (GASH_SPAN just IS
  // the wedge), and the stacked rim+core copies (the stroke is the rim).
  const GASH_R = 100            // baked arc radius; updateClaws scales by rad / GASH_R
  const GASH_SPAN = 0.92        // rad the gash subtends
  const GASH_W = 6.5            // width at the belly — THIN. This plus the rim must stay under the
                                // CLAW_TINE_R spacing above, or the three gashes merge into a smear.
  const GASH_BELLY = 0.85       // <1 pushes the belly toward the tip — a claw drags deepest past the bite
  const GASH_FILL = 0xf0834a    // warm rust, straight off the reference
  const GASH_RIM = 0x5c1c0a     // dark rim: what actually separates the gashes on the loam floor
  const CLAW_DRIFT = 0.10       // fraction of range the tines rake outward as they fade
  const claws = []
  for (let i = 0; i < MAX_CLAWS; i++) claws.push({ live: false, x: 0, y: 0, angle: 0, range: 0, arc: 0, t: 0, dur: 0.16, root: null, tines: null })
  let clawCursor = 0
  // One curved, double-tapered gash, baked once and shared by every tine. Drawn with the arc's
  // CENTER at the local origin, so bake()'s returned anchor puts that center on the player: then
  // rotation is just the bearing and scale is just the reach.
  let gashTex = null
  function bakeClawGash() {
    const g = new Graphics()
    const N = 44
    const left = [], right = []
    for (let i = 0; i <= N; i++) {
      const t = i / N
      const a = -GASH_SPAN / 2 + GASH_SPAN * t
      const ca = Math.cos(a), sa = Math.sin(a)
      // Belly profile: 0 at both tips, fat in the middle. Clamp the sin's argument — t can land a
      // hair outside [0,1] in float, and pow(negative, fraction) is NaN. One NaN vertex blanks the
      // whole baked texture (the v5.4 bulge() bug, same shape).
      const u = Math.min(1, Math.max(0, Math.pow(t, GASH_BELLY)))
      const w = GASH_W * Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.8) * 0.5
      left.push(GASH_R * ca + ca * w, GASH_R * sa + sa * w)   // offset along the radial: a gash
      right.push(GASH_R * ca - ca * w, GASH_R * sa - sa * w)  // thickens across its own curve
    }
    // walk out one edge and back the other — right reversed, in x,y pairs
    const back = []
    for (let i = right.length - 2; i >= 0; i -= 2) back.push(right[i], right[i + 1])
    g.poly([...left, ...back]).fill(GASH_FILL).stroke({ width: 1.5, color: GASH_RIM, join: 'round' })
    return bake(g)
  }
  function makeTine() {
    if (!gashTex) gashTex = bakeClawGash()
    const s = new Sprite(gashTex.tex)
    s.anchor.set(gashTex.ax, gashTex.ay) // the arc's center → sits on the player
    return s
  }
  function spawnClaw(x, y, angle, range, arc) {
    const cp = claws[clawCursor]
    clawCursor = (clawCursor + 1) % MAX_CLAWS
    if (!cp.root) {
      cp.root = new Container()
      cp.tines = CLAW_TINE_R.map(() => makeTine())
      cp.root.addChild(...cp.tines)
      whipLayer.addChild(cp.root)
    }
    cp.live = true
    cp.x = x; cp.y = y; cp.angle = angle; cp.range = range; cp.arc = arc || 1
    cp.t = 0
    cp.root.visible = true
  }
  function updateClaws(dt) {
    for (const cp of claws) {
      if (!cp.live) continue
      if (dt > 0) cp.t += dt
      if (cp.t >= cp.dur) { cp.live = false; cp.root.visible = false; continue }
      const k = cp.t / cp.dur
      cp.root.position.set(cp.x, cp.y)
      const flash = Math.sin(Math.PI * k) // ramp in then out, exactly like the whip's
      // The whole rake sweeps only a LITTLE across the wedge (the fan already covers it) and rakes
      // outward as it fades — a swing would re-read as the whip.
      const sweep = cp.angle + cp.arc * (k - 0.5) * CLAW_SWEEP
      // ...and it lands ON `range`, never past it: rake outward INTO the hitbox edge, don't
      // overshoot it (a plain 1 + DRIFT*k put the outer gash 10% beyond what the sector tests).
      const reach = 1 - CLAW_DRIFT + CLAW_DRIFT * k
      // The gash is baked at a FIXED GASH_SPAN, but the wedge the sim tests is cp.arc — which
      // changes with level and with wideRake. Squash across the bearing so the DRAWN wedge is the
      // TESTED wedge: scaling y by q maps a local angle a to atan(q*tan a), so the span follows q.
      // Budget the outermost drawn edge — half a gash + the fan + half the sweep travel — onto
      // exactly arc/2 and invert that exactly (the tempting q ~= budget/(SPAN/2) linearisation is
      // 4% wide at the tips, because tan is superlinear). Without this the rake drew ~50% wider
      // than its own hitbox at lv1, and enemies sat visually inside the claws taking nothing.
      const budget = cp.arc * (0.5 - CLAW_FAN_MAX - CLAW_SWEEP * 0.5)
      const q = Math.tan(budget) / Math.tan(GASH_SPAN * 0.5)
      for (let i = 0; i < cp.tines.length; i++) {
        const tine = cp.tines[i]
        const rad = cp.range * CLAW_TINE_R[i] * reach
        // Anchored at its arc's center and bulging +x from it, so rotation IS the bearing and the
        // x-scale IS the reach. Thickness is radial, so near the belly it rides sx and the squash
        // barely blunts the tips.
        const sx = rad / GASH_R
        tine.scale.set(sx, sx * q)
        tine.rotation = sweep + CLAW_TINE_FAN[i] * cp.arc
        tine.alpha = Math.pow(flash, 1.3) * 0.95 * CLAW_TINE_A[i]
      }
    }
  }
  function clearClaws() {
    for (const cp of claws) { cp.live = false; if (cp.root) cp.root.visible = false }
  }

  // Roar wavefronts (one-off {type:'roar'} events) — v5.6.16: the sim emitted this event from day
  // one and render NEVER had a case for it, so the skies starter was literally invisible ("I don't
  // see or understand what my weapon does"). A roar is pressure, not a blade: three thin arc BANDS
  // radiating through the wedge from the player, expanding INTO the hitbox edge (the last band
  // dies exactly at `range` — the drawn extent is the tested extent, per the claw rule) and fading
  // as they travel. Warm dark amber on the skies' pale cool concrete (warm-vs-cool + darker value
  // is what reads there — pale-on-pale is the chapter's documented camouflage trap).
  // Same fixed-span-bake + tan-exact y-squash as the claw: the band is baked spanning ROAR_SPAN
  // and squashed so the drawn wedge IS the cast's arc (wideRoar changes it at runtime).
  const MAX_ROARS = 6
  const ROAR_SPAN = 1.0        // rad the baked band subtends
  const ROAR_REF = 100         // baked outer radius; scaled by radius/ROAR_REF at use
  const ROAR_BANDS = 3
  const ROAR_COLORS = [0xf0a63f, 0xcf7d24, 0xb8641f] // leading edge bright, trailing bands darker
  let roarBandTex = null
  function bakeRoarBand() {
    const g = new Graphics()
    const pts = []
    const N = 26
    for (let i = 0; i <= N; i++) { const a = -ROAR_SPAN / 2 + (i / N) * ROAR_SPAN; pts.push(Math.cos(a) * ROAR_REF, Math.sin(a) * ROAR_REF) }
    for (let i = N; i >= 0; i--) { const a = -ROAR_SPAN / 2 + (i / N) * ROAR_SPAN; pts.push(Math.cos(a) * ROAR_REF * 0.86, Math.sin(a) * ROAR_REF * 0.86) }
    g.poly(pts).fill(0xffffff) // white, tinted per band
    return bake(g)
  }
  const roars = []
  for (let i = 0; i < MAX_ROARS; i++) roars.push({ live: false, x: 0, y: 0, angle: 0, range: 0, arc: 0, t: 0, dur: 0.34, root: null, bands: null })
  let roarCursor = 0
  function spawnRoar(x, y, angle, range, arc) {
    const rp = roars[roarCursor]
    roarCursor = (roarCursor + 1) % MAX_ROARS
    if (!rp.root) {
      if (!roarBandTex) roarBandTex = bakeRoarBand()
      rp.root = new Container()
      rp.bands = ROAR_COLORS.map((c) => {
        const b = new Sprite(roarBandTex.tex)
        b.anchor.set(roarBandTex.ax, roarBandTex.ay) // arc centre -> sits on the player
        b.tint = c
        return b
      })
      rp.root.addChild(...rp.bands)
      whipLayer.addChild(rp.root)
    }
    rp.live = true
    rp.x = x; rp.y = y; rp.angle = angle; rp.range = range; rp.arc = arc || 1
    rp.t = 0
    rp.root.visible = true
  }
  function updateRoars(dt) {
    for (const rp of roars) {
      if (!rp.live) continue
      if (dt > 0) rp.t += dt
      if (rp.t >= rp.dur) { rp.live = false; rp.root.visible = false; continue }
      const k = rp.t / rp.dur
      rp.root.position.set(rp.x, rp.y)
      rp.root.rotation = rp.angle
      // exact wedge fit (the claw lesson: the q ~= arc/SPAN linearisation is wide at the tips)
      const q = Math.tan(rp.arc / 2) / Math.tan(ROAR_SPAN / 2)
      for (let i = 0; i < rp.bands.length; i++) {
        const band = rp.bands[i]
        // stagger: each band launches a beat later and expands from 30% out to exactly `range`
        const ki = Math.min(1, Math.max(0, (k - i * 0.12) / 0.72))
        if (ki <= 0) { band.alpha = 0; continue }
        const radius = rp.range * (0.3 + 0.7 * ki)
        const sx = radius / ROAR_REF
        band.scale.set(sx, sx * q)
        band.alpha = Math.sin(Math.PI * ki) * (0.8 - i * 0.16)
      }
    }
  }
  function clearRoars() {
    for (const rp of roars) { rp.live = false; if (rp.root) rp.root.visible = false }
  }

  // particles: fixed-size freelist of sprites + plain data
  const particles = []
  for (let i = 0; i < MAX_PARTICLES; i++) {
    particles.push({
      s: null, live: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, scale: 1, grow: 0, drag: 0, grav: 0,
      spiral: false, cx: 0, cy: 0, ang: 0, angVel: 0, rad: 0, radVel: 0,
    })
  }
  let particleCursor = 0

  function spawnParticle(tex, x, y, vx, vy, life, scale, tint, grow = 0, drag = 0, grav = 0) {
    const p = particles[particleCursor]
    particleCursor = (particleCursor + 1) % MAX_PARTICLES
    if (!p.s) {
      p.s = new Sprite(tex)
      p.s.anchor.set(0.5)
      particleLayer.addChild(p.s)
    }
    if (p.s.texture !== tex) p.s.texture = tex
    p.live = true
    p.spiral = false
    p.x = x
    p.y = y
    p.vx = vx
    p.vy = vy
    p.life = life
    p.maxLife = life
    p.scale = scale
    p.grow = grow
    p.drag = drag
    p.grav = grav
    p.s.visible = true
    p.s.tint = tint
    p.s.rotation = Math.random() * Math.PI * 2
  }

  // Black-hole suction particles: orbit (cx,cy) at shrinking radius instead of flying in
  // a straight line — same freelist/slot as spawnParticle, just a different motion model.
  function spawnSpiralParticle(tex, cx, cy, ang, rad, angVel, life, scale, tint, grow = 0) {
    const p = particles[particleCursor]
    particleCursor = (particleCursor + 1) % MAX_PARTICLES
    if (!p.s) {
      p.s = new Sprite(tex)
      p.s.anchor.set(0.5)
      particleLayer.addChild(p.s)
    }
    if (p.s.texture !== tex) p.s.texture = tex
    p.live = true
    p.spiral = true
    p.cx = cx
    p.cy = cy
    p.ang = ang
    p.angVel = angVel
    p.rad = rad
    p.radVel = -rad / life
    p.life = life
    p.maxLife = life
    p.scale = scale
    p.grow = grow
    p.s.visible = true
    p.s.tint = tint
    p.s.rotation = ang
  }

  function updateParticles(dt) {
    if (dt === 0) return
    for (const p of particles) {
      if (!p.live) continue
      p.life -= dt
      if (p.life <= 0) { p.live = false; p.s.visible = false; continue }
      if (p.spiral) {
        p.ang += p.angVel * dt
        p.rad = Math.max(0, p.rad + p.radVel * dt)
        p.x = p.cx + Math.cos(p.ang) * p.rad
        p.y = p.cy + Math.sin(p.ang) * p.rad
        p.scale += p.grow * dt
        p.s.position.set(p.x, p.y)
        p.s.scale.set(Math.max(p.scale, 0.001))
        p.s.alpha = p.life / p.maxLife
        continue
      }
      const k = p.drag > 0 ? Math.max(0, 1 - p.drag * dt) : 1
      p.vx *= k
      p.vy = p.vy * k + p.grav * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.scale += p.grow * dt
      p.s.position.set(p.x, p.y)
      p.s.scale.set(p.scale)
      p.s.alpha = p.life / p.maxLife
    }
  }

  function clearParticles() {
    for (const p of particles) {
      p.live = false
      if (p.s) p.s.visible = false
    }
  }

  // expanding rings: small ring-buffer of one-off animated effects (mine explosions).
  // Not run-state — purely a render-local visual, same freelist idea as particles.
  const MAX_RINGS = 12
  const rings = []
  for (let i = 0; i < MAX_RINGS; i++) rings.push({ s: null, live: false, x: 0, y: 0, t: 0, dur: 0.35, maxR: 90 })
  let ringCursor = 0

  // look: baked {tex,ax,ay} to draw (defaults to the warm explosion ring); tint: applied
  // on top (defaults to white = baked colors as-is). Both optional/backward-compatible —
  // existing explosionBurst() calls are untouched; elemental bursts (e.g. 'shatter') pass
  // T.novaRing (neutral white) + a saturated tint so the same geometry can be recolored.
  function spawnRing(x, y, maxR = 90, dur = 0.35, look = T.novaWarm, tint = 0xffffff) {
    const rg = rings[ringCursor]
    ringCursor = (ringCursor + 1) % MAX_RINGS
    if (!rg.s) {
      rg.s = spriteOf(look)
      novaLayer.addChild(rg.s)
    }
    if (rg.s.texture !== look.tex) rg.s.texture = look.tex
    rg.s.tint = tint
    rg.live = true
    rg.x = x
    rg.y = y
    rg.t = 0
    rg.dur = dur
    rg.maxR = maxR
    rg.s.visible = true
  }

  function updateRings(dt) {
    if (dt === 0) return
    for (const rg of rings) {
      if (!rg.live) continue
      rg.t += dt
      if (rg.t >= rg.dur) { rg.live = false; rg.s.visible = false; continue }
      const k = rg.t / rg.dur
      rg.s.position.set(rg.x, rg.y)
      rg.s.scale.set(Math.max(k * rg.maxR, 1) / 64)
      rg.s.alpha = 1 - k
    }
  }

  function clearRings() {
    for (const rg of rings) {
      rg.live = false
      if (rg.s) rg.s.visible = false
    }
  }

  // damage numbers: pooled Text objects, reuse the oldest when full
  const dmgTexts = []
  function spawnDamage(x, y, dmg, crit, dot) {
    let d = dmgTexts.find((t) => !t.live)
    if (!d && dmgTexts.length < MAX_DMG_TEXTS) {
      const t = new Text({
        text: '',
        style: {
          fontFamily: 'Trebuchet MS, Verdana, sans-serif',
          fontSize: 17,
          fontWeight: '900',
          fill: 0xffffff,
          stroke: { color: 0x6b5847, width: 3.5, join: 'round' },
        },
      })
      t.anchor.set(0.5)
      textLayer.addChild(t)
      d = { t, live: false, age: 0, x: 0, y: 0 }
      dmgTexts.push(d)
    }
    if (!d) {
      d = dmgTexts[0]
      for (const o of dmgTexts) if (o.age > d.age) d = o
    }
    d.live = true
    d.age = 0
    d.x = x + (Math.random() * 10 - 5)
    d.y = y - 10
    d.t.text = String(Math.round(dmg))
    // DoT ticks read as small muted numbers so a status-covered crowd doesn't flood the screen
    d.t.tint = crit ? 0xff8c42 : dot ? 0xd8cbbd : 0xffffff
    d.t.visible = true
    d._base = crit ? 1.25 : dot ? 0.6 : 0.85
  }

  function updateDamage(dt) {
    for (const d of dmgTexts) {
      if (!d.live) continue
      d.age += dt
      if (d.age >= 0.75) { d.live = false; d.t.visible = false; continue }
      const k = d.age / 0.75
      const pop = 1 + 0.35 * Math.max(0, 1 - d.age * 7)
      d.t.position.set(d.x, d.y - 30 * k)
      d.t.scale.set(d._base * pop)
      d.t.alpha = k > 0.55 ? 1 - (k - 0.55) / 0.45 : 1
    }
  }

  function clearDamage() {
    for (const d of dmgTexts) {
      d.live = false
      d.t.visible = false
    }
  }

  // ------------------------------------------------------------------- state
  let animT = 0        // run animation clock (frozen when dt=0)
  let hop = 0          // player hop phase
  let breathe = 0
  let idleT = 0
  let flashT = 0       // player hurt flash
  let vignetteA = 0
  let lightningFlashA = 0 // full-field white flash alpha (skies lightning, LIGHTNING.flash), decays in sync()
  let lightningAmbientT = LIGHTNING.ambient.minInterval // s until the next ambient flash/bolt (skies only)
  let prevSkiesBombs = new Set() // last frame's run.bombs objects (skies only) — see handleEvents
  let frameDt = 0      // this frame's dt, for pool callbacks that need real elapsed time
  let playerX = 0      // player position, for pool callbacks whose entities are player-anchored (beams)
  let playerY = 0
  const homingTimers = [] // per-slot accumulator: index-aligned with homingPool, trail particle cadence
  const shotTimers = []   // per-slot accumulator: index-aligned with the enemyShots pool, smoke cadence
  const holeParticleTimers = [] // per-slot accumulator: index-aligned with holePool, suction particle cadence
  const shake = { t: 0, dur: 1, amp: 0, ox: 0, oy: 0 }

  function addShake(amp, dur) {
    const current = shake.t > 0 ? shake.amp * (shake.t / shake.dur) : 0
    if (amp < current) return
    shake.amp = amp
    shake.t = dur
    shake.dur = dur
  }

  function fitScreen() {
    const w = app.screen.width
    const h = app.screen.height
    if (vignette.width !== w || vignette.height !== h) {
      vignette.width = w
      vignette.height = h
    }
    if (lightningFlash.width !== w || lightningFlash.height !== h) {
      lightningFlash.width = w
      lightningFlash.height = h
    }
  }

  // ------------------------------------------------------------------ events
  function killPoof(x, y, etype, elite) {
    const color = elite ? 0xff9d5c : (ENEMY_LOOKS[etype]?.fill ?? 0xcccccc)
    const n = 5 + (Math.random() * 4 | 0)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 50 + Math.random() * 110
      spawnParticle(T.dot.tex, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 20,
        0.35 + Math.random() * 0.25, 0.4 + Math.random() * 0.5, color, -0.6, 3)
    }
    spawnParticle(T.dot.tex, x, y, 0, -8, 0.32, 1.3, 0xfffdf5, 3.2, 0)
  }

  function pickupSparkle(x, y, coin) {
    const tint = coin ? 0xffcf4d : 0xffd93d
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2
      spawnParticle(T.sparkle.tex, x, y, Math.cos(a) * 35, Math.sin(a) * 35 - 45,
        0.3 + Math.random() * 0.15, 0.35 + Math.random() * 0.3, i === 2 ? 0xffffff : tint, -0.5, 2)
    }
  }

  function explosionBurst(x, y, radius = 90) {
    const k = radius / 90 // visuals tuned at 90px; scale to the actual blast radius
    const n = 8 + (Math.random() * 3 | 0) // 8-10
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = (90 + Math.random() * 140) * k
      spawnParticle(T.dot.tex, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        0.3 + Math.random() * 0.2, (0.4 + Math.random() * 0.4) * k, 0xffb37a, -0.8, 4)
    }
    // scorch flash: quick scale-up + fast fade, reads as an impact flash under the ring
    spawnParticle(T.fx.scorch_01, x, y, 0, 0, 0.22, 0.05 * k, 0xffcf6b, 1.0, 0)
    // a few jagged spark shards flung outward
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = (160 + Math.random() * 120) * k
      spawnParticle(T.fx.spark_04, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        0.22 + Math.random() * 0.1, (0.06 + Math.random() * 0.03) * k, 0xff8c42, 0, 5)
    }
    spawnRing(x, y, radius, 0.35)
  }

  function beamSparkle(x, y) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      spawnParticle(T.sparkle.tex, x, y, Math.cos(a) * 70, Math.sin(a) * 70,
        0.3 + Math.random() * 0.1, 0.35 + Math.random() * 0.2, i % 2 ? 0xff8fab : 0xb06cf0, -0.6, 3)
    }
  }

  function strokePath(g, path, width, color, alpha) {
    g.moveTo(path[0][0], path[0][1])
    for (let i = 1; i < path.length; i++) g.lineTo(path[i][0], path[i][1])
    g.stroke({ width, color, alpha, join: 'round', cap: 'round' })
  }

  // Elemental shock arcs (shockarc/frostarc/conduct): jagged-polyline visuals driven by a
  // one-off render-local pool instead of run-state (these are single-shock proc events,
  // not a persisting sim list) — spawn once, fade over `dur`, then recycle. v5.7.2: also reused
  // by skies' lightning bolts (strikeLightning/updateAmbientLightning below) — same jagged glow-
  // then-core stroke IS a lightning bolt, no separate drawer needed. width/peak default to the
  // original hardcoded 7/1 so shockarc/frostarc/conduct's look is byte-for-byte unchanged.
  const MAX_ARCS = 8
  const arcs = []
  for (let i = 0; i < MAX_ARCS; i++) {
    arcs.push({ live: false, points: null, life: 0, dur: 0.25, outer: 0x6c5ce7, inner: 0xffffff, width: 7, peak: 1 })
  }
  let arcCursor = 0

  function spawnArc(points, outer, inner = 0xffffff, dur = 0.25, width = 7, peak = 1) {
    const a = arcs[arcCursor]
    arcCursor = (arcCursor + 1) % MAX_ARCS
    a.live = true
    a.points = points
    a.life = dur
    a.dur = dur
    a.outer = outer
    a.inner = inner
    a.width = width
    a.peak = peak
  }

  function updateArcs(dt) {
    if (dt <= 0) return
    for (const a of arcs) {
      if (!a.live) continue
      a.life -= dt
      if (a.life <= 0) a.live = false
    }
  }

  function clearArcs() {
    for (const a of arcs) a.live = false
    arcG.clear()
  }

  // Jagged-jitter builder used by redrawArcs: deterministic-hash trick (stable frame-to-frame,
  // freezes cleanly at dt=0).
  function jitterPath(pts, salt) {
    const path = [pts[0]]
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i]
      const [x2, y2] = pts[i + 1]
      const dx = x2 - x1
      const dy = y2 - y1
      const len = Math.hypot(dx, dy) || 1
      const nx = -dy / len
      const ny = dx / len
      const subN = 2 + (hash(x1 * 12.9898 + y1 * 78.233 + salt) > 0.5 ? 1 : 0) // 2-3 points
      for (let s = 1; s <= subN; s++) {
        const t = s / (subN + 1)
        const bx = x1 + dx * t
        const by = y1 + dy * t
        const seed = x1 * 12.9898 + y1 * 78.233 + x2 * 4.14 + y2 * 9.23 + s * 17.17 + salt
        const j = (hash(seed) - 0.5) * 18
        path.push([bx + nx * j, by + ny * j])
      }
      path.push([x2, y2])
    }
    return path
  }

  function redrawArcs() {
    arcG.clear()
    for (let ai = 0; ai < arcs.length; ai++) {
      const a = arcs[ai]
      if (!a.live) continue
      const pts = a.points
      if (!pts || pts.length < 2) continue
      const alpha = Math.max(0, Math.min(1, a.life / a.dur)) * a.peak
      const path = jitterPath(pts, ai * 3.7)
      strokePath(arcG, path, a.width, a.outer, alpha * 0.35)
      strokePath(arcG, path, Math.max(1, a.width * 2 / 7), a.inner, alpha)
    }
  }

  // Jagged vertical polyline from off the top of (x,y) cracking straight down onto it — lateral
  // jitter tapers to exactly 0 at the last point so the bolt always lands ON the strike point.
  // Feeds spawnArc (its own jitterPath pass adds a layer of finer wobble on top of this). Math.
  // random is fine here: a one-shot cosmetic shape, not on the deterministic sim path.
  function lightningBoltPath(x, y, dropPx, segments, jitterPx) {
    const pts = []
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const j = (Math.random() * 2 - 1) * jitterPx * (1 - t)
      pts.push([x + j, y - dropPx * (1 - t)])
    }
    return pts
  }

  // A REAL bombardment/artillery strike landing (skies only) — see handleEvents' 'explode' case.
  // Bolt via the shock-arc pool (LIGHTNING.strikeBolt look) + the full-field flash at strike
  // intensity.
  function strikeLightning(x, y) {
    const b = LIGHTNING.strikeBolt
    spawnArc(lightningBoltPath(x, y, b.dropPx, b.segments, b.jitterPx), b.glowColor, b.color, b.dur, b.width, b.alpha)
    triggerLightningFlash(LIGHTNING.flash.strikeAlpha)
  }

  function triggerLightningFlash(alpha) {
    lightningFlashA = Math.max(lightningFlashA, alpha)
  }

  // Ambient cosmetic lightning (skies only, called from updateStorm): occasional flash + a
  // distant, thinner, dimmer bolt somewhere in view. Pure atmosphere — no run state read beyond
  // the camera offset already passed in, no gameplay effect. Timed by lightningAmbientT, a
  // render-local accumulator (own float, reset in clearWorld) — the same idiom as every other FX
  // cadence in this file (CURRENT_VIS.rippleEvery, the storm layers' fade envelopes, ...), never
  // the seeded sim RNG.
  function updateAmbientLightning(dt, cx, cy) {
    if (dt <= 0) return
    lightningAmbientT -= dt
    if (lightningAmbientT > 0) return
    const cfg = LIGHTNING.ambient
    lightningAmbientT = cfg.minInterval + Math.random() * (cfg.maxInterval - cfg.minInterval)
    // bx/by land the bolt's base somewhere across the view's upper half, in WORLD space (cx,cy is
    // the camera offset sync() applies to `world`, i.e. world = screen - (cx,cy))
    const bx = -cx + Math.random() * app.screen.width
    const by = -cy + Math.random() * app.screen.height * 0.5
    spawnArc(lightningBoltPath(bx, by, cfg.dropPx, cfg.segments, cfg.jitterPx), cfg.color, cfg.color, cfg.dur, cfg.width, cfg.alpha)
    triggerLightningFlash(LIGHTNING.flash.ambientAlpha)
  }

  function levelupBurst(x, y) {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2
      const sp = 130 + Math.random() * 70
      spawnParticle(T.sparkle.tex, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        0.5 + Math.random() * 0.2, 0.55 + Math.random() * 0.35,
        i % 2 ? 0x7de3c3 : 0xffd93d, -0.8, 3)
    }
  }

  function handleEvents(run, events) {
    // v5.7.2: skies re-themes REAL bomb detonations (run.bombs — bombardment/artillery/volatile,
    // all of it) as lightning instead of the generic 'explode' burst below — see that case. Bomb
    // objects are created once and mutated in place until removed (stepBombs/stepBombardment in
    // sim.js: b.fuse -= dt, then run.bombs = run.bombs.filter(...) drops the dead ones), so object
    // identity is stable frame-to-frame. Diffing this frame's run.bombs against last frame's set
    // tells us exactly which bombs just went off — zero sim reads beyond the array itself, and no
    // change to run.bombs' shape or timing.
    let justStruck = null
    if (chapterHasStorm) {
      const curBombs = new Set(run.bombs)
      justStruck = []
      for (const b of prevSkiesBombs) if (!curBombs.has(b)) justStruck.push(b)
      prevSkiesBombs = curBombs
    } else if (prevSkiesBombs.size) {
      prevSkiesBombs = new Set() // left skies mid-flight (e.g. a run ended) — drop stale refs
    }

    for (const e of events) {
      switch (e.type) {
        case 'hit':
          spawnDamage(e.x, e.y, e.dmg, e.crit, e.dot)
          break
        case 'kill':
          killPoof(e.x, e.y, e.etype, e.elite)
          break
        case 'hurt':
          addShake(6, 0.25)
          vignetteA = 0.6
          flashT = 0.28
          break
        case 'levelup':
          levelupBurst(run.player.x, run.player.y)
          break
        case 'revive':
          // Revive Token fired (see CONSUMABLES in config.js): a heart-warm double ring +
          // levelup-style burst sells the second chance; the sim already shoved enemies back.
          levelupBurst(e.x, e.y)
          spawnRing(e.x, e.y, 300, 0.45, T.novaRing, 0xff8fb1)
          spawnRing(e.x, e.y, 180, 0.35, T.novaRing, 0xffd166)
          addShake(5, 0.3)
          break
        case 'gem':
          pickupSparkle(e.x, e.y, false)
          break
        case 'coin':
          pickupSparkle(e.x, e.y, true)
          break
        case 'shoot':
          if (e.weapon === 'wave') addShake(2.5, 0.12)
          break
        case 'whip':
          // flagella lash: arc sweep flash + a soft shake (melee weight)
          spawnWhip(e.x, e.y, e.angle, e.range, e.arc)
          addShake(2, 0.1)
          break
        case 'roar':
          // v5.6.16: sonic wavefronts through the wedge + a shove-weight shake (see spawnRoar)
          spawnRoar(e.x, e.y, e.angle, e.range, e.arc)
          addShake(2.5, 0.12)
          break
        case 'tail':
          // tail swipe: the whip's fat swoosh IS a heavy tail sweep — reuse it across the wide
          // arc, with a heavier shake than the lash (this launches things)
          spawnWhip(e.x, e.y, e.angle, e.range, e.arc)
          addShake(4, 0.16)
          break
        case 'toss':
          // debris toss: the lobs themselves are visible entities (syncLobs) — the event only
          // kicks the screen so the throw has weight
          addShake(1.5, 0.08)
          break
        case 'clawRake':
          // Claw Rake: three parallel gashes (spawnClaw — NOT the whip's swoosh; see there). A
          // lighter shake than the lash: it's a quick shred, and at this cadence a full-weight one
          // would rattle the screen nonstop.
          spawnClaw(e.x, e.y, e.angle, e.range, e.arc)
          addShake(1.2, 0.07)
          break
        case 'explode': {
          // A bomb detonation in skies reads as lightning (see justStruck above); every other
          // explosion source (weapon lobs/novas, mines, geysers, snap traps, other chapters'
          // bombs...) keeps the original scorch-and-shrapnel burst untouched.
          const struckIdx = justStruck
            ? justStruck.findIndex((b) => b.x === e.x && b.y === e.y && b.radius === e.radius)
            : -1
          if (struckIdx >= 0) {
            justStruck.splice(struckIdx, 1)
            strikeLightning(e.x, e.y)
          } else {
            explosionBurst(e.x, e.y, e.radius)
          }
          addShake(e.radius && e.radius < 80 ? 1.5 : 3, 0.16)
          break
        }
        case 'hole':
          // vortex opening reads fine on its own — no shake
          break
        case 'beam':
          beamSparkle(run.player.x, run.player.y)
          addShake(2, 0.12)
          break
        case 'shatter': {
          // icy burst: neutral ring recolored ice-blue + shard particles flung outward
          const radius = e.radius || 60
          spawnRing(e.x, e.y, radius, 0.35, T.novaRing, 0x9fd8ff)
          const n = 6 + (Math.random() * 3 | 0) // 6-8
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2
            const sp = 90 + Math.random() * 130
            spawnParticle(T.fx.star_08, e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp,
              0.3 + Math.random() * 0.15, 0.1 + Math.random() * 0.05, 0x9fd8ff, -0.15, 3)
          }
          addShake(2, 0.12)
          break
        }
        case 'overload':
          // fiery burst: reuse the (already radius-scaled) explosion visuals
          explosionBurst(e.x, e.y, e.radius || 90)
          addShake(e.radius && e.radius < 80 ? 1.5 : 3, 0.16)
          break
        case 'frostarc':
          if (e.points && e.points.length > 1) {
            spawnArc(e.points, 0x59b7ff, 0xffffff, 0.25)
            for (const [ax, ay] of e.points) {
              spawnParticle(T.fx.flare_01, ax, ay, 0, 0, 0.22, 0.09, 0x9fd8ff, -0.1, 0)
            }
          }
          addShake(1.5, 0.1)
          break
        case 'conduct':
          if (e.points && e.points.length > 1) {
            spawnArc(e.points, 0x4fae4f, 0xe3f7df, 0.25)
            for (const [ax, ay] of e.points) {
              spawnParticle(T.fx.circle_05, ax, ay, 0, 0, 0.22, 0.09, 0x4fae4f, -0.1, 0)
            }
          }
          addShake(1.5, 0.1)
          break
        case 'shockarc':
          // plain lightning-infusion arc (no combo): violet outer, bright yellow core
          if (e.points && e.points.length > 1) {
            spawnArc(e.points, 0x8a7bff, 0xffe94d, 0.2)
            const [lx, ly] = e.points[e.points.length - 1]
            spawnParticle(T.fx.flare_01, lx, ly, 0, 0, 0.18, 0.08, 0xffe94d, -0.1, 0)
          }
          break
      }
    }
  }

  // ------------------------------------------------------------------- reset
  function clearWorld() {
    for (const [id, s] of enemySprites) {
      s.visible = false
      hideAffixBadges(s)
      hideEnemyDecor(s)
      enemyFree.push(s)
      enemySprites.delete(id)
    }
    shieldG.clear()
    pacerG.clear()
    bombG.clear()
    stripG.clear()
    laneG.clear()
    hazardG.clear()
    teleG.clear()
    wellG.clear()
    for (const key of Object.keys(prevCount)) prevCount[key] = 0
    for (const pool of [
      bulletPool, novaPool, orbPool, gemPool, coinPool,
      boomerangPool, minePool, homingPool, trapPool, debrisPool, shotPool, wellPool,
    ]) {
      for (const s of pool) s.visible = false
    }
    for (const cv of carPool) cv.root.visible = false
    for (const lv of lobPool) lv.root.visible = false
    carCount = 0
    lobCount = 0
    for (const hv of holePool) hv.root.visible = false
    for (const bv of beamPool) bv.root.visible = false
    for (const pv of poolPool) pv.root.visible = false
    for (const bv of bloomPool) bv.root.visible = false
    for (const s of trailPool) s.visible = false
    for (const wv of webPool) wv.root.visible = false
    for (const lv of lurePool) lv.root.visible = false
    clearObstacles()
    clearWhips()
    clearClaws()
    clearRoars()
    clearCurrents()
    clearStorm()
    clearParticles()
    clearRings()
    clearArcs()
    clearDamage()
    clearFloorLayer()
    shake.t = 0
    shake.amp = 0
    shake.ox = 0
    shake.oy = 0
    flashT = 0
    vignetteA = 0
    vignette.alpha = 0
    lightningFlashA = 0
    lightningFlash.alpha = 0
    lightningAmbientT = LIGHTNING.ambient.minInterval + Math.random() * (LIGHTNING.ambient.maxInterval - LIGHTNING.ambient.minInterval)
    prevSkiesBombs = new Set()
    animT = 0
    hop = 0
    breathe = 0
  }

  // -------------------------------------------------------------------- sync
  function syncPlayer(p, dt) {
    playerC.position.set(p.x, p.y)

    // per-chapter blob tint (white = identity for body) + optional flagellum tail
    pBody.tint = chapterRender.playerTint
    if (chapterRender.tail) {
      pTail.visible = true
      const ang = (p.facingAngle == null ? Math.PI * 0.5 : p.facingAngle) + Math.PI // trail behind
      pTail.rotation = ang + Math.sin(animT * 9) * 0.35 // wiggle
      const sc = fxScale(T.fx.trace_05, PLAYER.radius * 1.6)
      const tint = chapterRender.tailTint ?? 0x66e0d0
      tailA.tint = tailB.tint = tint
      tailA.scale.set(sc, sc * 0.5)
      tailB.scale.set(sc * 0.9, sc * 0.42)
      tailB.rotation = Math.sin(animT * 9 + 1.2) * 0.25 // secondary flutter on the far segment
    } else {
      pTail.visible = false
    }

    if (dt > 0) {
      if (p.moving) hop += dt * 11
      else breathe += dt * 2.4
    }
    let sx, sy, by
    if (p.moving) {
      const w = Math.sin(hop)
      sx = 1 + 0.07 * w
      sy = 1 - 0.07 * w
      by = -Math.abs(Math.sin(hop)) * 4.5
    } else {
      const w = Math.sin(breathe)
      sx = 1 - 0.025 * w
      sy = 1 + 0.035 * w
      by = 0
    }
    bodyC.scale.set(p.facing * sx, sy)
    bodyC.y = by
    pShadow.scale.set(1 - 0.12 * Math.abs(Math.sin(hop)) * (p.moving ? 1 : 0))

    // pupil tracking (local +x flips with the body toward facing)
    const pr = PLAYER.radius
    const lookX = p.moving ? pr * 0.07 : Math.sin(animT * 0.9) * pr * 0.045
    const lookY = pr * 0.02 + Math.sin(animT * 1.3) * pr * 0.015
    pupilL.position.set(-pr * 0.36 + lookX, -pr * 0.16 + lookY)
    pupilR.position.set(pr * 0.36 + lookX, -pr * 0.16 + lookY)

    // hurt flash: white pop then red fade
    if (flashT > 0) {
      if (dt > 0) flashT = Math.max(0, flashT - dt)
      if (flashT > 0.2) {
        pFlash.tint = 0xffffff
        pFlash.alpha = 0.9
      } else {
        pFlash.tint = 0xff4d5e
        pFlash.alpha = (flashT / 0.2) * 0.45
      }
    } else {
      pFlash.alpha = 0
    }

    // invuln blink
    playerC.alpha = p.invuln > 0 ? (Math.sin(animT * 32) > 0 ? 1 : 0.4) : 1
  }

  // Elite affix badges: small Text icons floating above an elite's sprite, one per
  // affix id (side by side when there's 2). Pooled/cached on the enemy sprite slot
  // itself (s._affixTexts), same lifetime as that slot (survives enemy-id recycling
  // via enemyFree, just like s._frostT etc. above) — texts live in affixLayer, not
  // as Sprite children, so they don't inherit the enemy's tint/rotation/flip.
  const AFFIX_BADGE_SPACING = 15
  function syncAffixBadges(s, e) {
    const affixes = e.affixes
    const n = affixes ? affixes.length : 0
    if (!s._affixTexts) s._affixTexts = []
    while (s._affixTexts.length < n) {
      const t = new Text({
        text: '',
        style: { fontFamily: 'Trebuchet MS, Verdana, sans-serif', fontSize: 14 },
      })
      t.anchor.set(0.5)
      affixLayer.addChild(t)
      s._affixTexts.push(t)
    }
    const baseX = e.x - ((n - 1) * AFFIX_BADGE_SPACING) / 2
    const y = e.y - e.radius - 14
    for (let i = 0; i < s._affixTexts.length; i++) {
      const t = s._affixTexts[i]
      if (i < n) {
        const info = ELITE_AFFIXES[affixes[i]]
        t.text = info ? info.icon : '?'
        t.position.set(baseX + i * AFFIX_BADGE_SPACING, y)
        t.visible = true
      } else {
        t.visible = false
      }
    }
  }
  function hideAffixBadges(s) {
    if (!s._affixTexts) return
    for (const t of s._affixTexts) t.visible = false
  }

  // The enemy's shadow and crown, which no longer ride inside its texture (see groundShadow/
  // eliteCrown in the art section). They ride ALONGSIDE it instead: same world position, same
  // scale `k` (= radius ratio × holePull shrink), same alpha — but rotation 0, always.
  // Lifetime is the pooled enemy sprite's: created lazily on the slot, hidden by hideEnemyDecor()
  // everywhere the slot is released (the syncEnemies sweep and clearWorld), so a recycled id can
  // never inherit the previous occupant's crown. `look` changes under a slot when an enemy is
  // recycled, so the crown texture is re-latched off it every frame, not just on creation.
  function syncEnemyDecor(s, e, look, k, flash) {
    const sh = look.shadow
    if (sh) {
      if (!s._shadow) {
        s._shadow = spriteOf(T.enemyShadow)
        enemyShadowLayer.addChild(s._shadow)
      }
      s._shadow.visible = true
      s._shadow.position.set(e.x, e.y + sh.y * k)
      s._shadow.scale.set((sh.rx / SHADOW_TEX_R) * k, (sh.ry / SHADOW_TEX_R) * k)
      s._shadow.alpha = s.alpha
    } else if (s._shadow) s._shadow.visible = false
    // crown: elite-only, so look.crown is null for the rest and this whole branch never runs.
    // No tint — a hit-flash swaps to the white twin like the body does, and the elemental tints
    // multiplied a gold crown into mud anyway back when it was baked in.
    const cr = look.crown
    if (cr) {
      const ct = crownLook(cr.r)
      if (!s._crown) {
        s._crown = new Sprite(Texture.EMPTY)
        enemyCrownLayer.addChild(s._crown)
      }
      const tex = flash ? ct.white : ct.tex
      if (s._crown.texture !== tex) s._crown.texture = tex
      s._crown.anchor.set(ct.ax, ct.ay)
      s._crown.visible = true
      s._crown.position.set(e.x, e.y + cr.top * k)
      s._crown.scale.set(k)
      s._crown.alpha = s.alpha
    } else if (s._crown) s._crown.visible = false
  }
  function hideEnemyDecor(s) {
    if (s._shadow) s._shadow.visible = false
    if (s._crown) s._crown.visible = false
  }

  // Volatile bomb telegraphs (run.bombs): danger circles under enemies/player, urgency
  // (fill alpha, rim strength, pulse rate) ramping up as fuse -> 0. One shared Graphics
  // cleared/redrawn per frame, same pattern as arcG/redrawArcs above.
  // v5.7.2: skies re-skins this as an incoming-strike reticle (LIGHTNING.telegraph) — same
  // fill+rim shape and urgency math, just electric-colored, plus a core ring that COLLAPSES
  // toward the strike point as the fuse burns down instead of just pulsing in place, and a fast
  // irregular flicker on the rim so it visibly "charges" rather than breathes. Every other
  // chapter's bombs (this same array — volatile elites, body/pond/etc.) keep the plain red
  // circle exactly as before; the detonation bolt+flash itself is event-driven, see
  // handleEvents' 'explode' case / strikeLightning above.
  function redrawBombs(run) {
    bombG.clear()
    const skies = chapterHasStorm
    for (const b of run.bombs || []) {
      const urgency = b.duration > 0 ? 1 - b.fuse / b.duration : 1
      const pulse = 0.5 + 0.5 * Math.sin(animT * (5 + urgency * 16))
      if (skies) {
        const t = LIGHTNING.telegraph
        const flicker = 0.7 + 0.3 * Math.random() // electric crackle on top of the smooth pulse
        const fillA = Math.min(t.maxFillA, t.baseFillA + urgency * 0.16 + pulse * 0.05)
        const rimA = Math.min(1, (t.baseRimA + urgency * 0.35 + pulse * 0.1) * flicker)
        bombG.circle(b.x, b.y, b.radius).fill({ color: t.color, alpha: fillA })
        bombG.circle(b.x, b.y, b.radius).stroke({ width: 3 + urgency * 2, color: t.color, alpha: rimA })
        const core = Math.max(3, b.radius * (1 - urgency)) // collapses to a point as urgency -> 1
        bombG.circle(b.x, b.y, core).stroke({ width: 2, color: t.coreColor, alpha: 0.4 + pulse * 0.35 })
        continue
      }
      const fillA = Math.min(0.32, 0.12 + urgency * 0.14 + pulse * 0.04)
      const rimA = Math.min(1, 0.55 + urgency * 0.35 + pulse * 0.1)
      bombG.circle(b.x, b.y, b.radius).fill({ color: 0xff6b81, alpha: fillA })
      bombG.circle(b.x, b.y, b.radius).stroke({ width: 3 + urgency * 2, color: 0xff6b81, alpha: rimA })
    }
  }

  function syncEnemies(run) {
    const px = run.player.x
    shieldG.clear()
    pacerG.clear()
    for (const e of run.enemies) {
      let s = enemySprites.get(e.id)
      if (!s) {
        s = enemyFree.pop()
        if (!s) {
          s = new Sprite(Texture.EMPTY)
          enemyLayer.addChild(s)
        }
        s.visible = true
        s._look = null
        // per-status particle cadence timers, kept on the sprite itself (it's the stable
        // per-enemy-id slot, same idea as holeParticleTimers but keyed by id via the Map
        // rather than a flat pool index — enemies don't have one)
        s._frostT = 0
        s._igniteT = 0
        s._venomT = 0
        s._stunT = 0
        s._enrageT = 0
        enemySprites.set(e.id, s)
      }
      s._seen = true
      // prefer the per-rosterId themed silhouette; fall back to the archetype look for enemies
      // whose rosterId has no baked creature (daily/title/future chapters)
      const rkey = e.rosterId ? e.rosterId + (e.elite ? '_elite' : '') : null
      const look = (rkey && T.roster[rkey]) || T.enemies[e.elite ? e.type + '_elite' : e.type]
      // Animated looks (look.frames, e.g. the centipede's baked wave phases): flip through the
      // frames on animT, offset per enemy id so a pack doesn't slither in lockstep. Frozen/stunned
      // creatures HOLD their current pose (matching the wisp-wobble rule below) instead of
      // snapping to frame 0. Anchor rides the texture: each frame bakes its own (near-identical)
      // anchor, and the white twin of the SAME frame shares it, so hit-flash still doesn't jump.
      let frame = look
      if (look.frames) {
        const halted = (e.frozen || 0) > 0 || (e.stunT || 0) > 0
        if (!halted || s._animFrame === undefined || s._animFrame >= look.frames.length) {
          s._animFrame = Math.floor(animT * 10 + e.id * 1.7) % look.frames.length
        }
        frame = look.frames[s._animFrame]
      }
      const tex = e.hitFlash > 0 ? frame.white : frame.tex
      if (s._look !== look) s._look = look
      if (s.texture !== tex) {
        s.texture = tex
        s.anchor.set(frame.ax, frame.ay)
      }
      const k = e.radius / look.baseR
      // Aim at the player, as far as this creature's VIEW allows (look.maxLean — see ROSTER_LOOKS).
      // The roster mixes three views, so no single bearing->rotation rule serves all of them: the
      // bugs and airframes are true top-down and rotate freely, the animals are 3/4 with a distinct
      // UP that turns upside down if rotated past vertical, and the cells have no forward axis at all.
      // But those are not three code paths — they're one, with a different clamp. Split the bearing
      // into a left/right MIRROR and an ELEVATION: `flip` covers the horizontal half-plane exactly as
      // the pre-v5.6.4 code's `px < e.x ? -1 : 1` did, and `lean` — measured against |dx| so it
      // mirrors along with the body, then clamped to maxLean — tilts the nose up or down toward the
      // player. Together (flip, lean) still spans the whole circle: maxLean = 90deg reproduces full
      // facing exactly, maxLean = 0 collapses to the original pure mirror. The mirror pops at dx = 0,
      // exactly where the original flip popped, so this adds no pop that wasn't already there.
      // Scale runs BEFORE rotation, hence the flip on X.
      const dx = px - e.x
      const flip = dx < 0 ? -1 : 1
      const maxLean = look.maxLean
      const lean = Math.atan2(run.player.y - e.y, Math.abs(dx))
      const face = flip * Math.max(-maxLean, Math.min(maxLean, lean))
      // holePull (0..1, set by sim while an enemy is being sucked into a black hole) may
      // not exist on older/other enemies — guard it. Shrinks + spins the sprite as it nears.
      const pull = e.holePull || 0
      const shrink = 1 - pull * 0.45
      s.scale.set(k * flip * shrink, k * shrink)

      // Elemental status (contract fields, guarded — sim half may not have landed yet).
      const frozen = e.frozen || 0
      const chill = e.chill || 0
      const venom = e.venom || 0
      const ignite = e.ignite || 0
      // v5.4 behavioural statuses (same guarded-contract rule): enrage = the flashlight cone turned
      // this thing up, stun = it can't act, fear = it's running from you.
      const fear = e.fearT || 0
      const stun = e.stunT || 0
      const enrage = e.enrageT || 0

      // frozen and stun both halt walk/idle animation (here: the wisp's rotation wobble)
      const wobble = (e.type === 'wisp' && frozen <= 0 && stun <= 0) ? Math.sin(animT * 9 + e.id * 1.7) * 0.13 : 0
      s.rotation = face + wobble + pull * animT * 5
      s.position.set(e.x, e.y)

      // dominant tint, one status wins (frozen > chill > venom > ignite > none). The
      // hit-flash white silhouette overrides all of these so the hit pop still reads white.
      if (e.hitFlash > 0) s.tint = 0xffffff
      else if (frozen > 0) s.tint = 0x9fd8ff
      else if (chill > 0) s.tint = 0xc4e4ff
      else if (venom > 0) s.tint = 0xa8e6a0
      else if (ignite > 0) s.tint = 0xffc09a
      // Behavioural statuses rank BELOW the elemental ones (those are ticking damage — the more
      // urgent read) but above the elite shimmer. Among themselves: enrage first, because it's the
      // only one of the three that makes an enemy MORE dangerous.
      else if (enrage > 0) s.tint = 0xff8a5c
      else if (stun > 0) s.tint = 0xb9b0a2
      else if (fear > 0) s.tint = 0xcfc2ff
      else if (e.elite && chapterRender.eliteIridescent) {
        // pond soap-bubble elites shimmer through pale iridescent hues. Bodies are now baked
        // saturated, and tint multiplies, so mix the hue 50% toward white first — otherwise the
        // shimmer muddies the creature colours instead of glazing them.
        const hues = chapterRender.eliteIridescent
        const seg = ((animT * 0.4 + e.id * 0.31) % 1) * hues.length
        const a0 = Math.floor(seg) % hues.length
        s.tint = mix(mix(hues[a0], hues[(a0 + 1) % hues.length], seg - Math.floor(seg)), 0xffffff, 0.5)
      }
      else s.tint = 0xffffff

      // cheap status particles, dt-gated (no spawns while frozen behind a modal)
      if (frameDt > 0) {
        if (frozen > 0) {
          s._frostT += frameDt
          if (s._frostT >= 0.4) {
            s._frostT -= 0.4
            spawnParticle(T.fx.star_08, e.x, e.y - e.radius * 0.3, 0, -12,
              0.4, 0.1, 0xcdeeff, -0.1, 1)
          }
        } else s._frostT = 0

        if (ignite > 0) {
          s._igniteT += frameDt
          if (s._igniteT >= 0.25) {
            s._igniteT -= 0.25
            spawnParticle(T.fx.flame_05, e.x + (Math.random() * 8 - 4), e.y, 0, -34,
              0.35, 0.09, 0xff7a30, 0.15, 0.5)
          }
        } else s._igniteT = 0

        if (venom > 0) {
          s._venomT += frameDt
          if (s._venomT >= 0.4) {
            s._venomT -= 0.4
            const stacks = Math.min(venom, 8)
            spawnParticle(T.fx.circle_05, e.x, e.y + e.radius * 0.25, 0, -18 - stacks * 3,
              0.45, 0.05 + stacks * 0.006, 0x4fae4f, 0.06, 0.35)
          }
        } else s._venomT = 0

        // stun: dazed sparks circling overhead — the classic "it can't act" read
        if (stun > 0) {
          s._stunT += frameDt
          if (s._stunT >= 0.16) {
            s._stunT -= 0.16
            const a = animT * 6
            spawnParticle(T.fx.star_08, e.x + Math.cos(a) * e.radius * 0.7, e.y - e.radius - 4,
              Math.cos(a) * 20, -6, 0.35, 0.07, 0xffe94d, -0.02, 0)
          }
        } else s._stunT = 0

        // enrage: embers boiling off it. Faster cadence than any other status — this one is a
        // WARNING, and the flashlight cone can light up a whole crowd at once.
        if (enrage > 0) {
          s._enrageT += frameDt
          if (s._enrageT >= 0.18) {
            s._enrageT -= 0.18
            spawnParticle(T.fx.flame_05, e.x + (Math.random() * 10 - 5), e.y - e.radius * 0.2,
              0, -46, 0.3, 0.07, 0xff5545, 0.1, 0.4)
          }
        } else s._enrageT = 0
      }

      // phase (beyond's flickers): _phaseSolid false = ghosted, untouchable and harmless. Always
      // assigned, never left dangling — a recycled slot must not inherit a ghost's alpha.
      s.alpha = e._phaseSolid === false ? 0.35 : 1

      // shadow under it, crown over it — placed after s.alpha since they inherit it
      syncEnemyDecor(s, e, look, k * shrink, e.hitFlash > 0)

      // ---- v4 elite affixes (contract fields, guarded — sim half may not have landed yet)
      syncAffixBadges(s, e)

      if (e.affixes && e.affixes.includes('shielded') && e.hp > e.maxHP * SHIELD_HP_FRAC) {
        // soap-bubble shield: low-alpha fill + saturated rim, gentle scale pulse.
        // Vanishes the instant hp crosses the threshold (redrawn fresh every frame,
        // nothing persists once this branch stops running for the enemy).
        const pulse = 1 + 0.04 * Math.sin(animT * 5 + e.id * 1.3)
        const r = (e.radius + 6) * pulse
        shieldG.circle(e.x, e.y, r).fill({ color: 0x4da3ff, alpha: 0.10 })
        shieldG.circle(e.x, e.y, r).stroke({ width: 3, color: 0x4da3ff, alpha: 0.7 })
      }

      if (e.affixes && e.affixes.includes('pacer')) {
        // subtle warm aura ring at the affix's push/pull radius, slow pulse
        const pulse = 0.5 + 0.5 * Math.sin(animT * 1.5 + e.id * 0.7)
        pacerG.circle(e.x, e.y, PACER_RADIUS).stroke({ width: 2, color: 0xffb347, alpha: 0.18 + pulse * 0.14 })
      }
    }
    for (const [id, s] of enemySprites) {
      if (s._seen) s._seen = false
      else {
        s.visible = false
        s.alpha = 1
        s._frostT = 0
        s._igniteT = 0
        s._venomT = 0
        s._stunT = 0
        s._enrageT = 0
        hideAffixBadges(s)
        hideEnemyDecor(s)
        enemyFree.push(s)
        enemySprites.delete(id)
      }
    }
  }

  function sync(run, dt, events) {
    if (idleLayer.visible) {
      // first frame after reset(run) is handled in reset; guard anyway
      idleLayer.visible = false
      entitiesLayer.visible = true
    }
    fitScreen()
    animT += dt
    frameDt = dt
    playerX = run.player.x
    playerY = run.player.y

    handleEvents(run, events)

    // camera + shake
    if (dt > 0 && shake.t > 0) {
      shake.t = Math.max(0, shake.t - dt)
      const k = shake.amp * (shake.t / shake.dur)
      shake.ox = (Math.random() * 2 - 1) * k
      shake.oy = (Math.random() * 2 - 1) * k
      if (shake.t === 0) { shake.amp = 0; shake.ox = 0; shake.oy = 0 }
    }
    const cx = app.screen.width / 2 - run.player.x + shake.ox
    const cy = app.screen.height / 2 - run.player.y + shake.oy
    world.position.set(cx, cy)
    updateFloorLayer(cx, cy)

    // red vignette flash — keeps fading behind frozen modals/summary (dt=0)
    vignetteA = Math.max(0, vignetteA - (dt > 0 ? dt : 1 / 60) * 2.6)
    vignette.alpha = vignetteA

    // full-field lightning flash (skies) — same "keeps fading at dt=0" treatment as the vignette
    lightningFlashA = Math.max(0, lightningFlashA - (dt > 0 ? dt : 1 / 60) / LIGHTNING.flash.fadeDur)
    lightningFlash.alpha = lightningFlashA

    syncObstacles(run)
    syncWells(run)
    syncPools(run.pools || [])
    syncTrails(run.trails || [])
    syncWebs(run.webs || [])
    syncPool(trapPool, trapLayer, run.traps || [], 'trap', T.trapArmed, placeTrap)
    syncPlayer(run.player, dt)
    syncEnemies(run)
    syncBlooms(run.blooms || [])
    syncLures(run.lures || [])
    redrawBombs(run)
    redrawStrips(run)
    redrawLanes(run)
    redrawHazards(run)
    redrawTelegraphs(run)
    syncCars(run)
    syncLobs(run)

    syncPool(bulletPool, bulletLayer, run.bullets, 'bullet', T.bullet, placeBullet)
    syncPool(novaPool, novaLayer, run.novas, 'nova', T.nova, placeNova)
    syncPool(orbPool, orbLayer, run.orbs, 'orb', T.orb, placeOrb)
    syncPool(gemPool, gemLayer, run.gems, 'gem', T.gem, placeGem)
    syncPool(coinPool, coinLayer, run.coins, 'coin', T.coin, placeCoin)
    syncPool(boomerangPool, boomerangLayer, run.boomerangs, 'boomerang', T.boomerang, placeBoomerang)
    syncPool(minePool, mineLayer, run.mines, 'mine', T.mine, placeMine)
    syncPool(homingPool, homingLayer, run.homingShots, 'homing', T.homing, placeHoming)
    syncPool(debrisPool, debrisLayer, run.debris || [], 'debris', T.trashChunk, placeDebris)
    syncPool(shotPool, shotLayer, run.enemyShots || [], 'shot', T.missile, placeShot)
    syncHoles(run.holes)
    syncBeams(run.beams)
    updateArcs(dt)
    redrawArcs()

    updateWhips(dt)
    updateClaws(dt)
    updateRoars(dt)
    updateParticles(dt)
    updateRings(dt)
    updateDamage(dt)
    updateDustMotes(dt)
    updateCurrents(run, dt, cx, cy)
    updateStorm(run, dt, cx, cy)
  }

  // Hoisted syncPool callbacks (fresh closures per frame are pointless garbage)
  function placeBullet(s, b, i) {
    s.position.set(b.x, b.y)
    // Stinger needles (v5.3 garden) share run.bullets with star shots but render as thin amber
    // streaks aimed along their velocity — swap this pool slot's texture/anchor/tint on the fly.
    if (b.weapon === 'stinger') {
      if (s.texture !== T.needle.tex) { s.texture = T.needle.tex; s.anchor.set(T.needle.ax, T.needle.ay) }
      s.tint = 0xffcf6b
      s.rotation = Math.atan2(b.vy, b.vx)
      s.scale.set(1)
      return
    }
    if (s.texture !== T.bullet.tex) { s.texture = T.bullet.tex; s.anchor.set(T.bullet.ax, T.bullet.ay) }
    s.tint = 0xffffff // star tint is baked; keep white so a slot recycled from a needle resets
    s.rotation = animT * 2.2 + i * 0.9 // slow spin
    s.scale.set(1 + 0.1 * Math.sin(animT * 7 + i * 2.4)) // slight scale pulse
  }
  function placeNova(s, n) {
    s.position.set(n.x, n.y)
    s.tint = 0x59b7ff
    s.scale.set(Math.max(n.r, 1) / T.novaTexR)
    s.alpha = 0.9 * Math.max(0, 1 - n.r / n.maxR) + 0.1
  }
  function placeOrb(s, o, i) {
    s.position.set(o.x, o.y)
    s.tint = 0x2bbf9e
    s.rotation = animT * 1.6 + i * 1.1 // gentle rotation
    // v4.1 Big Orbs mod: orbs carry their effective hit radius (o.r, falls back to ORB_R)
    const sizeMul = (o.r ?? ORB_R) / ORB_R
    s.scale.set(T.orbScale * sizeMul * (1 + 0.12 * Math.sin(animT * 6 + i * 2.1)))
  }
  function placeGem(s, g) {
    s.position.set(g.x, g.y)
    s.scale.set(1 + 0.15 * Math.sin(animT * 5 + (g.x + g.y) * 0.05))
  }
  function placeCoin(s, c) {
    s.position.set(c.x, c.y)
    s.scale.set(1 + 0.1 * Math.sin(animT * 4 + (c.x - c.y) * 0.05))
  }
  function placeBoomerang(s, b, i) {
    s.position.set(b.x, b.y)
    s.tint = 0xff8c42
    s.rotation = animT * 14 + i * 1.7 // fast spin, derived from animT so dt=0 freezes it
    const sizeMul = b.hitR ? b.hitR / 14 : 1 // v4.1 Big Blade mod (14 = base BOOMERANG_HIT_R in sim.js)
    s.scale.set(T.boomerangScale * sizeMul * 1.15, T.boomerangScale * sizeMul * 0.92) // slight motion stretch
  }
  function placeMine(s, m) {
    s.position.set(m.x, m.y)
    const base = m.small ? 0.6 : 1 // v4.1 Cluster mod bomblets read smaller
    if (m.arm > 0) {
      s.alpha = 0.55
      s.scale.set(base * (1 + 0.05 * Math.sin(animT * 3 + (m.x + m.y) * 0.05))) // arming: slow pulse
    } else {
      s.alpha = 1
      s.scale.set(base * (1 + 0.1 * Math.sin(animT * 8 + (m.x + m.y) * 0.05))) // armed: faster pulse
    }
  }
  // Trash Tornado chunks (run.debris): same contract as run.orbs — the sim rewrites the ring every
  // frame. Each chunk spins on its own phase so the ring reads as tumbling junk, not a cog.
  function placeDebris(s, d, i) {
    s.position.set(d.x, d.y)
    s.tint = 0xffffff
    s.rotation = animT * 3.4 + i * 2.1
    s.scale.set(((d.r ?? DEBRIS_R) / DEBRIS_R) * (1 + 0.08 * Math.sin(animT * 7 + i)))
  }
  // Enemy missiles (run.enemyShots): aimed along velocity, trailing smoke. These are the only
  // things on screen shooting AT the player, so they get a trail — motion you can track and outrun.
  function placeShot(s, sh, i) {
    s.position.set(sh.x, sh.y)
    s.tint = 0xffffff
    s.rotation = Math.atan2(sh.vy, sh.vx)
    s.scale.set(1)
    if (shotTimers[i] === undefined) shotTimers[i] = 0
    if (frameDt > 0) {
      shotTimers[i] += frameDt
      if (shotTimers[i] >= 0.05) {
        shotTimers[i] -= 0.05
        spawnParticle(T.fx.circle_05, sh.x, sh.y, -sh.vx * 0.1, -sh.vy * 0.1,
          0.3, 0.06, 0x9aa0a8, 0.12, 2)
      }
    }
  }
  function placeHoming(s, h, i) {
    s.position.set(h.x, h.y)
    s.tint = 0xffffff // tint baked into the texture
    s.rotation = animT * 3 + i * 1.3 // tiny spin
    s.scale.set(T.homingScale)
    if (homingTimers[i] === undefined) homingTimers[i] = 0
    if (frameDt > 0) {
      homingTimers[i] += frameDt
      if (homingTimers[i] >= 0.06) {
        homingTimers[i] -= 0.06
        spawnParticle(T.fx.flare_01, h.x, h.y, -h.vx * 0.15, -h.vy * 0.15,
          0.25, 0.09, 0xc9a0f0, -0.2, 2)
      }
    }
  }
  function placeHole(hv, h, i) {
    hv.root.position.set(h.x, h.y)
    const breathe = 1 + 0.05 * Math.sin(animT * 4 + i * 1.7) // subtle scale breathing
    hv.root.scale.set(breathe)
    // children sized to the real radius (root stays ~1 so the twirl cap holds)
    hv.disc.scale.set((h.radius * 2) / 512)
    const twirlPx = Math.min(h.radius * 1.2, HOLE_TWIRL_MAX)
    hv.vortexA.scale.set(fxScale(T.fx.twirl_01, twirlPx))
    hv.vortexB.scale.set(fxScale(T.fx.twirl_02, twirlPx * 0.85))
    hv.core.scale.set((h.radius * HOLE_CORE_FRAC) / (T.holeRefR * 0.16))
    if (hv._r !== h.radius) { // crisp rim ring, redrawn only when the radius changes
      hv._r = h.radius
      hv.ring.clear()
      hv.ring.circle(0, 0, h.radius).stroke({ width: 5, color: 0x5a2fb0, alpha: 0.4 })
      hv.ring.circle(0, 0, h.radius * 0.985).stroke({ width: 2, color: 0xc9b3f5, alpha: 0.35 })
    }
    hv.vortexA.rotation = animT * 1.8 + i * 0.6
    hv.vortexB.rotation = -animT * 1.8 * 1.4 + i * 0.9 // counter-rotating, 1.4x speed
    hv.ring.rotation = animT * 0.4

    const elapsed = h.duration - h.life
    let a = elapsed < 0.2 ? elapsed / 0.2 : 1
    if (h.life < 0.3) a = Math.min(a, h.life / 0.3)
    hv.root.alpha = Math.max(0, Math.min(1, a))

    // suction particles: spawn at the rim, spiral inward toward the center, fading out
    if (holeParticleTimers[i] === undefined) holeParticleTimers[i] = 0
    if (frameDt > 0) {
      holeParticleTimers[i] += frameDt
      if (holeParticleTimers[i] >= 0.09) {
        holeParticleTimers[i] -= 0.09
        const ang = Math.random() * Math.PI * 2
        const spin = (Math.random() < 0.5 ? 1 : -1) * (6 + Math.random() * 3)
        const tex = Math.random() < 0.5 ? T.fx.star_08 : T.fx.circle_05
        spawnSpiralParticle(tex, h.x, h.y, ang, h.radius * 0.95, spin, 0.7, 0.09, 0x9a6fd0, -0.1)
      }
    }
  }
  function placeBeam(bv, b) {
    bv.root.position.set(playerX, playerY)
    bv.root.rotation = b.angle

    const spawnElapsed = b.duration - b.life
    const spawnIn = spawnElapsed < 0.12 ? Math.max(0, spawnElapsed / 0.12) : 1 // width squashes in
    const despawnOut = b.life < 0.3 ? Math.max(0, b.life / 0.3) : 1 // width shrinks with the fade
    const pulse = 0.8 + 0.15 * Math.sin(animT * 20)

    bv.beamBody.scale.set(b.length / T.beamRefLen, (b.width / T.beamRefWidth) * spawnIn * pulse)
    bv.beamBody.alpha = despawnOut

    // shimmer streaks scrolling along the beam's local (pre-scale) length
    const scrollSpeed = 300
    bv.streakA.position.x = (animT * scrollSpeed) % T.beamRefLen
    bv.streakB.position.x = (animT * scrollSpeed + T.beamRefLen / 2) % T.beamRefLen

    // end-cap flare at the live tip (outside beamBody so width-squash doesn't distort it)
    bv.tip.position.x = b.length
    bv.tip.scale.set(fxScale(T.fx.flare_01, b.width * 1.3))
    bv.tip.alpha = spawnIn * despawnOut * (0.7 + 0.2 * Math.sin(animT * 16))

    // origin flash: big pop on spawn, settles into a small idle spark, fades on despawn
    const muzzlePop = spawnIn < 1 ? lerp(0.2, 1.4, spawnIn) : 1
    bv.muzzle.scale.set(fxScale(T.fx.muzzle_02, b.width * 2.2) * muzzlePop)
    bv.muzzle.alpha = (spawnIn < 1 ? spawnIn : 0.55 + 0.15 * Math.sin(animT * 18)) * despawnOut
  }

  // -------------------------------------------------------------------- idle
  function idle(dt) {
    fitScreen()
    idleT += dt
    updateDustMotes(dt)

    // slow synthetic camera drift so the organic floor keeps feeling alive behind
    // the title screen even with no real player/camera to follow
    const cx = -idleT * 20
    const cy = -idleT * 14
    world.position.set(cx, cy)
    updateFloorLayer(cx, cy)

    const w = app.screen.width
    const h = app.screen.height
    for (const b of idleBlobs) {
      const t = idleT * 2 + b.ph
      const bounce = Math.abs(Math.sin(t))
      const squash = Math.cos(t * 2) * 0.06
      const x = w * b.fx
      const y = h * b.fy
      b.blob.position.set(x, y - bounce * 16)
      b.blob.scale.set(1 - squash, 1 + squash)
      b.shadow.position.set(x, y + b.r * 0.75)
      b.shadow.scale.set((b.r / PLAYER.radius) * (1 - bounce * 0.25))
      b.shadow.alpha = 1 - bounce * 0.35
    }
  }

  // ------------------------------------------------------------------- reset
  function reset(run) {
    // Latch the per-chapter palette BEFORE clearing/repainting so the floor repopulates and the
    // player rig tints under the new chapter. Title (run == null) falls back to the body look.
    const cfg = run ? CHAPTERS[run.chapter] : null
    chapterRender = cfg?.render ?? BODY_RENDER
    chapterHasCurrents = cfg?.signature?.type === 'currents'
    chapterHasStorm = !!chapterRender.storm
    // prop/obstacle set for this chapter — a chapter with no biome entry falls back to the green
    // one, so a future CHAPTERS id renders (bushes and all) before it gets art of its own
    chapterBiome = (run && BIOMES[run.chapter]) || BIOMES.body
    R.background.color = chapterRender.bgColor
    clearWorld()
    if (run) {
      entitiesLayer.visible = true
      idleLayer.visible = false
      fitScreen()
      // snap camera onto the player immediately
      const cx = app.screen.width / 2 - run.player.x
      const cy = app.screen.height / 2 - run.player.y
      world.position.set(cx, cy)
      updateFloorLayer(cx, cy)
      syncPlayer(run.player, 0)
    } else {
      entitiesLayer.visible = false
      idleLayer.visible = true
      idleT = 0
    }
  }

  return { reset, sync, idle, ready }
}
