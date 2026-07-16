// "Cute Lab Pastel" renderer — PixiJS v8. Reads run state, never mutates it.
// All entity looks are baked into textures once; per-frame work is sprite pools only.
//
// Contract used by main.js:
//   const r = createRenderer(app)
//   r.reset(run|null)          new run started (build world) or back to title (clear)
//   r.sync(run, dt, events)    draw current state; dt=0 means "frozen behind a modal"
//   r.idle(dt)                 no run active (title screen background)
import { Assets, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js'
import { PLAYER, ENEMIES, WEAPONS, HOLE_CORE_FRAC, ELITE_AFFIXES, SHIELD_HP_FRAC, PACER_RADIUS, ORB_R, CHAPTERS } from './config.js'

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

    // soft shadow (kept normal on the white variant so bounds match)
    g.ellipse(0, r * 0.95, r * 0.85, r * 0.3).fill({ color: 0x000000, alpha: 0.12 })

    if (type === 'drone') {
      g.beginPath().moveTo(0, -r + 2).lineTo(0, -r - 6).stroke({ width: lw * 0.8, color: line })
      g.circle(0, -r - 7, r * 0.17).fill(line)
      g.circle(0, 0, r).fill(fill).stroke({ width: lw, color: line })
    } else if (type === 'wisp') {
      g.circle(0, 0, r).fill(fill).stroke({ width: lw, color: line })
    } else {
      g.roundRect(-r, -r, r * 2, r * 2, r * 0.42).fill(fill).stroke({ width: lw, color: line })
    }

    if (elite) {
      const top = type === 'drone' ? -r - 10 : -r - 1
      g.poly([-r * 0.34, top, -r * 0.17, top - r * 0.42, 0, top - r * 0.14, r * 0.17, top - r * 0.42, r * 0.34, top])
        .fill(white ? 0xffffff : 0xffd93d).stroke({ width: 1.5, color: white ? 0xffffff : 0xc9a227 })
    }

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

  function makeEnemyLook(type, elite) {
    const g = new Graphics()
    drawEnemy(g, type, elite, false)
    const normal = bake(g)
    const w = new Graphics()
    drawEnemy(w, type, elite, true)
    const white = bake(w)
    return { tex: normal.tex, white: white.tex, ax: normal.ax, ay: normal.ay, baseR: ENEMIES[type].radius }
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
  function buildTextures() {

    T.enemies = {}
    for (const type of Object.keys(ENEMIES)) {
      T.enemies[type] = makeEnemyLook(type, false)
      T.enemies[type + '_elite'] = makeEnemyLook(type, true)
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
    // prism beam: horizontal rainbow bar, baked at the weapon's max length/width,
    // anchored so local (0,0) sits at the left edge (player origin)
    {
      const len = WEAPONS.rainbow.levels[WEAPONS.rainbow.levels.length - 1].length
      const w = WEAPONS.rainbow.levels[WEAPONS.rainbow.levels.length - 1].width
      // more saturated than the old v1 hues — additive is off (washes to white on the
      // light floor), so normal-blend stripes need real color punch to read as "rainbow"
      const hues = [0xff5d8f, 0xffb347, 0xffe94d, 0x5ddc8f, 0x59b7ff, 0xa06cf0]
      const g = new Graphics()
      const seg = len / hues.length
      for (let i = 0; i < hues.length; i++) g.rect(i * seg, -w / 2, seg + 1, w).fill(hues[i])
      g.circle(len, 0, w / 2).fill(hues[hues.length - 1])
      g.roundRect(-2, -w / 2, len + 2, w, w * 0.3).stroke({ width: 3, color: 0xffffff, alpha: 0.55 })
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
  // v5.0 pond biome layers (empty/hidden for body): ambient current motes live on the stage
  // (screen space, like dust); obstacles + hazard pools read as ground decals under the roster;
  // toxin blooms hang over enemies but under the player; whip flashes sit over the weapons.
  // Declared BEFORE the stage addChild below — currentLayer is referenced there (TDZ otherwise).
  const currentLayer = new Container()
  const poolLayer = new Container()
  const obstacleLayer = new Container()
  const bloomLayer = new Container()
  const whipLayer = new Container()

  world.addChild(floorLayer, entitiesLayer)
  app.stage.addChild(world, currentLayer, idleLayer, dustLayer, vignette)
  entitiesLayer.visible = false // title screen shows first; reset(run) reveals entities

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
  const enemyLayer = new Container()
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
    poolLayer, obstacleLayer,
    gemLayer, coinLayer, holeLayer, novaLayer, mineLayer,
    bombG, pacerG, enemyLayer, bloomLayer, shieldG, affixLayer, playerC,
    bulletLayer, boomerangLayer, orbLayer, homingLayer, beamLayer, whipLayer, arcG,
    particleLayer, textLayer,
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

  // big: bushes. Source PNGs are 1024px square; scale is expressed as a target
  // on-screen size (px) converted to a Pixi scale factor, not used as a raw scale.
  const BUSH_TINTS = [0x86b877, 0x76a869]
  function populateBig(s, i, j, cell) {
    const name = cellHash(i, j, 1) < 0.5 ? 'bush_a' : 'bush_b'
    s.texture = T.props[name]
    s.anchor.set(0.5, 0.85)
    s.tint = tintMul(BUSH_TINTS[cellHash(i, j, 2) < 0.5 ? 0 : 1], chapterRender.floorTint)
    s.alpha = 1
    s.rotation = (cellHash(i, j, 3) - 0.5) * 0.12
    const px = lerp(90, 145, cellHash(i, j, 4)) // target on-screen size
    s.scale.set(px / 1024)
    const jx = (cellHash(i, j, 5) - 0.5) * cell * 0.7
    const jy = (cellHash(i, j, 6) - 0.5) * cell * 0.7
    s.position.set((i + 0.5) * cell + jx, (j + 0.5) * cell + jy)
  }

  // mid: grass/flowers/mushroom/reed (upright, side-view) + clusters (top-down)
  const MID_KINDS = [
    { name: 'grass_a', tints: [0x9ccc80, 0x8bbf76, 0xa5cb8a], upright: true, size: [28, 48] },
    { name: 'grass_b', tints: [0x9ccc80, 0x8bbf76, 0xa5cb8a], upright: true, size: [28, 48] },
    { name: 'grass_c', tints: [0x9ccc80, 0x8bbf76, 0xa5cb8a], upright: true, size: [28, 48] },
    { name: 'grass_d', tints: [0x9ccc80, 0x8bbf76, 0xa5cb8a], upright: true, size: [28, 48] },
    { name: 'flower_a', tints: [0xffd1e0, 0xffd93d], upright: true, size: [34, 55] },
    { name: 'flower_b', tints: [0xfff3f8], upright: true, size: [34, 55] },
    { name: 'mushroom', tints: [0xffb3c6], upright: true, size: [26, 42] },
    { name: 'reed', tints: [0x8fae7a], upright: true, size: [45, 70] },
    { name: 'cluster_a', tints: [0xa8d19a, 0xc2dfae, 0x9bc98f], upright: false, size: [50, 78] },
    { name: 'cluster_b', tints: [0xa8d19a, 0xc2dfae, 0x9bc98f], upright: false, size: [50, 78] },
    { name: 'cluster_c', tints: [0xa8d19a, 0xc2dfae, 0x9bc98f], upright: false, size: [50, 78] },
  ]
  function populateMid(s, i, j, cell) {
    const kind = MID_KINDS[Math.floor(cellHash(i, j, 1) * MID_KINDS.length)]
    s.texture = T.props[kind.name]
    s.tint = tintMul(kind.tints[Math.floor(cellHash(i, j, 2) * kind.tints.length)], chapterRender.floorTint)
    s.alpha = 1
    if (kind.upright) {
      s.anchor.set(0.5, 0.9)
      s.rotation = (cellHash(i, j, 3) - 0.5) * 0.16
    } else {
      s.anchor.set(0.5, 0.5)
      s.rotation = cellHash(i, j, 3) * Math.PI * 2
    }
    const px = lerp(kind.size[0], kind.size[1], cellHash(i, j, 4))
    s.scale.set(px / 1024)
    const jx = (cellHash(i, j, 5) - 0.5) * cell * 0.7
    const jy = (cellHash(i, j, 6) - 0.5) * cell * 0.7
    s.position.set((i + 0.5) * cell + jx, (j + 0.5) * cell + jy)
  }

  // detail: scatter/leaf sprites + 2 hand-drawn baked bits (pebble, puddle)
  const DETAIL_KINDS = [
    { name: 'scatter_a', tint: 0xd9e6c0, alpha: 0.55, size: [24, 42] },
    { name: 'scatter_b', tint: 0xd9e6c0, alpha: 0.55, size: [24, 42] },
    { name: 'leaf', tint: 0xe8b28a, alpha: 0.7, size: [18, 32] },
    { name: 'pebble', baked: true },
    { name: 'puddle', baked: true },
  ]
  function populateDetail(s, i, j, cell) {
    const kind = DETAIL_KINDS[Math.floor(cellHash(i, j, 1) * DETAIL_KINDS.length)]
    s.rotation = cellHash(i, j, 3) * Math.PI * 2
    if (kind.baked) {
      const look = T[kind.name]
      s.texture = look.tex
      s.anchor.set(look.ax, look.ay)
      s.tint = chapterRender.floorTint
      s.alpha = 1
      s.scale.set(lerp(0.7, 1.4, cellHash(i, j, 4)))
    } else {
      s.texture = T.props[kind.name]
      s.anchor.set(0.5, 0.5)
      s.tint = tintMul(kind.tint, chapterRender.floorTint)
      s.alpha = kind.alpha
      const px = lerp(kind.size[0], kind.size[1], cellHash(i, j, 4))
      s.scale.set(px / 1024)
    }
    const jx = (cellHash(i, j, 5) - 0.5) * cell * 0.7
    const jy = (cellHash(i, j, 6) - 0.5) * cell * 0.7
    s.position.set((i + 0.5) * cell + jx, (j + 0.5) * cell + jy)
  }

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

  // Current motes (pond signature): sparse teal specks drifting in a slow, spatially-coherent
  // direction to hint at the flow field WITHOUT touching sim internals — the drift angle rotates
  // gently over time with a mild per-mote spatial curl, so neighbouring motes agree (reads as
  // flow, not noise). Screen-space + low alpha = ambient, never competes with the entities.
  const CURRENT_COUNT = 20
  const currentMotes = []
  let currentT = 0
  for (let i = 0; i < CURRENT_COUNT; i++) {
    const s = new Sprite(T.dot.tex)
    s.anchor.set(0.5)
    s.visible = false
    currentLayer.addChild(s)
    currentMotes.push({ s, x: hash(i * 3.1 + 0.2), y: hash(i * 5.7 + 1.1), ph: hash(i * 2.3 + 4.4) * Math.PI * 2 })
  }

  function updateCurrents(dt) {
    if (!chapterHasCurrents) { currentLayer.visible = false; return }
    currentLayer.visible = true
    if (dt <= 0) return
    currentT += dt
    const w = app.screen.width
    const h = app.screen.height
    const base = Math.sin(currentT * 0.12) * 0.9 // whole-field drift heading, slowly rotating
    for (let i = 0; i < currentMotes.length; i++) {
      const m = currentMotes[i]
      const ang = base + Math.sin(m.y * 6 + currentT * 0.3) * 0.5 // spatial curl → coherent swirl
      const spd = 0.02 + 0.012 * Math.sin(currentT * 0.5 + m.ph)
      m.x = (m.x + Math.cos(ang) * spd * dt + 1.1) % 1.1
      m.y = (m.y + Math.sin(ang) * spd * dt + 1.1) % 1.1
      m.s.position.set(m.x * w, m.y * h)
      m.s.tint = 0x8fe8e0
      m.s.scale.set(0.7 + 0.3 * Math.sin(currentT + m.ph))
      m.s.alpha = 0.1 + 0.06 * Math.sin(currentT * 2 + m.ph)
      m.s.visible = true
    }
  }

  function clearCurrents() {
    currentLayer.visible = false
    for (const m of currentMotes) m.s.visible = false
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
  const prevCount = {
    bullet: 0, nova: 0, orb: 0, gem: 0, coin: 0,
    boomerang: 0, mine: 0, homing: 0, hole: 0, beam: 0,
    pool: 0, bloom: 0,
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
    streakA.tint = 0xffffff
    streakA.alpha = 0.5
    streakA.rotation = Math.PI / 2 // trace_06 is a vertical streak; rotate to lie along the beam
    streakA.scale.set(fxScale(T.fx.trace_06, T.beamRefLen * 0.3), fxScale(T.fx.trace_06, T.beamRefWidth * 1.6))
    const streakB = new Sprite(T.fx.trace_06)
    streakB.anchor.set(0.5)
    streakB.tint = 0xffffff
    streakB.alpha = 0.5
    streakB.rotation = Math.PI / 2
    streakB.scale.set(streakA.scale.x, streakA.scale.y)
    beamBody.addChild(bar, streakA, streakB)

    // tip/muzzle sit outside beamBody so the width-squash scale doesn't distort them
    const tip = new Sprite(T.fx.flare_01)
    tip.anchor.set(0.5)
    tip.tint = 0xffffff
    const muzzle = new Sprite(T.fx.muzzle_02)
    muzzle.anchor.set(0.5)
    muzzle.tint = 0xffffff

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
  // Obstacles (run.obstacles): reed/bubble clumps scaled to each collider's radius. The list is
  // generated once at createRun and never mutates, so this rebuilds only when the array identity
  // changes (new run) — otherwise it's a no-op. Two stacked prop clumps (deep tint for punch on
  // the light floor) over a soft bubble glow rim; tinted with the chapter floorTint.
  const obstacleSprites = []
  let obstacleToken = null
  const OBSTACLE_CLUMPS = ['cluster_a', 'cluster_b', 'cluster_c']
  function acquireObstacle() {
    const root = new Container()
    const glow = new Sprite(Texture.EMPTY)
    glow.anchor.set(0.5)
    const clumpA = new Sprite(Texture.EMPTY)
    clumpA.anchor.set(0.5)
    const clumpB = new Sprite(Texture.EMPTY)
    clumpB.anchor.set(0.5)
    root.addChild(glow, clumpA, clumpB)
    obstacleLayer.addChild(root)
    return { root, glow, clumpA, clumpB }
  }
  function syncObstacles(run) {
    const list = run.obstacles || []
    if (obstacleToken === list) return // static per run — only rebuild on a fresh array
    obstacleToken = list
    while (obstacleSprites.length < list.length) obstacleSprites.push(acquireObstacle())
    const glowTex = T.fx.circle_05
    for (let i = 0; i < obstacleSprites.length; i++) {
      const ov = obstacleSprites[i]
      if (i >= list.length) { ov.root.visible = false; continue }
      const o = list[i]
      ov.root.visible = true
      ov.root.position.set(o.x, o.y)
      const name = OBSTACLE_CLUMPS[Math.floor(hash(o.x * 1.7 + o.y * 0.31) * OBSTACLE_CLUMPS.length)]
      const tex = T.props[name]
      const rot = hash(o.x + o.y * 3.3) * Math.PI * 2
      const sc = (o.r * 2.3) / 1024 // source props are 1024px; target on-screen ≈ 2.3×radius
      const tint = tintMul(0x8fbf6f, chapterRender.floorTint)
      ov.clumpA.texture = tex; ov.clumpA.tint = tint; ov.clumpA.scale.set(sc); ov.clumpA.rotation = rot
      ov.clumpB.texture = tex; ov.clumpB.tint = tint; ov.clumpB.scale.set(sc); ov.clumpB.rotation = rot + 0.6
      ov.glow.texture = glowTex
      ov.glow.tint = tintMul(0xbfe8dd, chapterRender.floorTint)
      ov.glow.alpha = 0.5
      ov.glow.scale.set(fxScale(glowTex, o.r * 2.2))
    }
  }
  function clearObstacles() {
    obstacleToken = null
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
  let frameDt = 0      // this frame's dt, for pool callbacks that need real elapsed time
  let playerX = 0      // player position, for pool callbacks whose entities are player-anchored (beams)
  let playerY = 0
  const homingTimers = [] // per-slot accumulator: index-aligned with homingPool, trail particle cadence
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
  // not a persisting sim list) — spawn once, fade over `dur`, then recycle.
  const MAX_ARCS = 8
  const arcs = []
  for (let i = 0; i < MAX_ARCS; i++) {
    arcs.push({ live: false, points: null, life: 0, dur: 0.25, outer: 0x6c5ce7, inner: 0xffffff })
  }
  let arcCursor = 0

  function spawnArc(points, outer, inner = 0xffffff, dur = 0.25) {
    const a = arcs[arcCursor]
    arcCursor = (arcCursor + 1) % MAX_ARCS
    a.live = true
    a.points = points
    a.life = dur
    a.dur = dur
    a.outer = outer
    a.inner = inner
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
      const alpha = Math.max(0, Math.min(1, a.life / a.dur))
      const path = jitterPath(pts, ai * 3.7)
      strokePath(arcG, path, 7, a.outer, alpha * 0.35)
      strokePath(arcG, path, 2, a.inner, alpha)
    }
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
        case 'explode':
          explosionBurst(e.x, e.y, e.radius)
          addShake(e.radius && e.radius < 80 ? 1.5 : 3, 0.16)
          break
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
      enemyFree.push(s)
      enemySprites.delete(id)
    }
    shieldG.clear()
    pacerG.clear()
    bombG.clear()
    for (const key of Object.keys(prevCount)) prevCount[key] = 0
    for (const pool of [
      bulletPool, novaPool, orbPool, gemPool, coinPool,
      boomerangPool, minePool, homingPool,
    ]) {
      for (const s of pool) s.visible = false
    }
    for (const hv of holePool) hv.root.visible = false
    for (const bv of beamPool) bv.root.visible = false
    for (const pv of poolPool) pv.root.visible = false
    for (const bv of bloomPool) bv.root.visible = false
    clearObstacles()
    clearWhips()
    clearCurrents()
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

  // Volatile bomb telegraphs (run.bombs): danger circles under enemies/player, urgency
  // (fill alpha, rim strength, pulse rate) ramping up as fuse -> 0. One shared Graphics
  // cleared/redrawn per frame, same pattern as arcG/redrawArcs above.
  function redrawBombs(run) {
    bombG.clear()
    for (const b of run.bombs || []) {
      const urgency = b.duration > 0 ? 1 - b.fuse / b.duration : 1
      const pulse = 0.5 + 0.5 * Math.sin(animT * (5 + urgency * 16))
      const fillA = Math.min(0.32, 0.12 + urgency * 0.14 + pulse * 0.04)
      const rimA = Math.min(1, 0.55 + urgency * 0.35 + pulse * 0.1)
      bombG.circle(b.x, b.y, b.radius).fill({ color: 0xff6b81, alpha: fillA })
      bombG.circle(b.x, b.y, b.radius).stroke({ width: 3 + urgency * 2, color: 0xff6b81, alpha: rimA })
    }
  }

  // Per-roster pond skin lookup ({tint, scale}) by rosterId — null for body (whose rosterIds
  // aren't in chapterRender.enemies), so body enemies keep their exact baked look + scale.
  function rosterLook(e) {
    const map = chapterRender.enemies
    return (map && e.rosterId && map[e.rosterId]) || null
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
        enemySprites.set(e.id, s)
      }
      s._seen = true
      const look = T.enemies[e.elite ? e.type + '_elite' : e.type]
      const tex = e.hitFlash > 0 ? look.white : look.tex
      if (s._look !== look) {
        s._look = look
        s.anchor.set(look.ax, look.ay)
      }
      if (s.texture !== tex) s.texture = tex
      const k = e.radius / look.baseR
      const flip = px < e.x ? -1 : 1
      // holePull (0..1, set by sim while an enemy is being sucked into a black hole) may
      // not exist on older/other enemies — guard it. Shrinks + spins the sprite as it nears.
      const pull = e.holePull || 0
      const shrink = 1 - pull * 0.45
      // render-only per-roster scale nudge (pond distinction); 1 for body, so no size change
      const rl = rosterLook(e)
      const rs = rl ? rl.scale : 1
      s.scale.set(k * flip * shrink * rs, k * shrink * rs)

      // Elemental status (contract fields, guarded — sim half may not have landed yet).
      const frozen = e.frozen || 0
      const chill = e.chill || 0
      const venom = e.venom || 0
      const ignite = e.ignite || 0

      // frozen also halts walk/idle animation (here: the wisp's rotation wobble)
      const wobble = (e.type === 'wisp' && frozen <= 0) ? Math.sin(animT * 9 + e.id * 1.7) * 0.13 : 0
      s.rotation = wobble + pull * animT * 5
      s.position.set(e.x, e.y)

      // dominant tint, one status wins (frozen > chill > venom > ignite > none). The
      // hit-flash white silhouette overrides all of these so the hit pop still reads white.
      if (e.hitFlash > 0) s.tint = 0xffffff
      else if (frozen > 0) s.tint = 0x9fd8ff
      else if (chill > 0) s.tint = 0xc4e4ff
      else if (venom > 0) s.tint = 0xa8e6a0
      else if (ignite > 0) s.tint = 0xffc09a
      else if (rl) {
        // pond roster: statusless soap-bubble elites shimmer through pale iridescent hues;
        // everything else takes its flat per-roster hue.
        if (e.elite && chapterRender.eliteIridescent) {
          const hues = chapterRender.eliteIridescent
          const seg = ((animT * 0.4 + e.id * 0.31) % 1) * hues.length
          const a0 = Math.floor(seg) % hues.length
          s.tint = mix(hues[a0], hues[(a0 + 1) % hues.length], seg - Math.floor(seg))
        } else s.tint = rl.tint
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
      }

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
        s._frostT = 0
        s._igniteT = 0
        s._venomT = 0
        hideAffixBadges(s)
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

    syncObstacles(run)
    syncPools(run.pools || [])
    syncPlayer(run.player, dt)
    syncEnemies(run)
    syncBlooms(run.blooms || [])
    redrawBombs(run)

    syncPool(bulletPool, bulletLayer, run.bullets, 'bullet', T.bullet, placeBullet)
    syncPool(novaPool, novaLayer, run.novas, 'nova', T.nova, placeNova)
    syncPool(orbPool, orbLayer, run.orbs, 'orb', T.orb, placeOrb)
    syncPool(gemPool, gemLayer, run.gems, 'gem', T.gem, placeGem)
    syncPool(coinPool, coinLayer, run.coins, 'coin', T.coin, placeCoin)
    syncPool(boomerangPool, boomerangLayer, run.boomerangs, 'boomerang', T.boomerang, placeBoomerang)
    syncPool(minePool, mineLayer, run.mines, 'mine', T.mine, placeMine)
    syncPool(homingPool, homingLayer, run.homingShots, 'homing', T.homing, placeHoming)
    syncHoles(run.holes)
    syncBeams(run.beams)
    updateArcs(dt)
    redrawArcs()

    updateWhips(dt)
    updateParticles(dt)
    updateRings(dt)
    updateDamage(dt)
    updateDustMotes(dt)
    updateCurrents(dt)
  }

  // Hoisted syncPool callbacks (fresh closures per frame are pointless garbage)
  function placeBullet(s, b, i) {
    s.position.set(b.x, b.y)
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
