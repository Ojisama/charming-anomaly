// "Cute Lab Pastel" renderer — PixiJS v8. Reads run state, never mutates it.
// All entity looks are baked into textures once; per-frame work is sprite pools only.
//
// Contract used by main.js:
//   const r = createRenderer(app)
//   r.reset(run|null)          new run started (build world) or back to title (clear)
//   r.sync(run, dt, events)    draw current state; dt=0 means "frozen behind a modal"
//   r.idle(dt)                 no run active (title screen background)
import { Assets, Container, Graphics, Mesh, MeshGeometry, Rectangle, Shader, Sprite, Text, Texture, UniformGroup } from 'pixi.js'
import { PLAYER, ENEMIES, WEAPONS, HOLE_CORE_FRAC, ELITE_AFFIXES, SHIELD_HP_FRAC, PACER_RADIUS, ORB_R, CHAPTERS, CURRENT_VIS, STORM_VIS, LIGHTNING, districtAt, districtTintAt, PHEROMONE_LIFE, SPRAY_FUSE, SPRAY_ACTIVE, SNAP_TRAP_REARM, TRAFFIC_WARN, TRAFFIC_CAR_LEN, TRAFFIC_CAR_W, DEBRIS_R, POUNCE_AIM_T, POUNCE_LEAP_T, POUNCE_LEAP_SPEED_MUL, AERIAL_MARK_T, FLASHLIGHT_RANGE, FLASHLIGHT_ARC, LINE_CHARGE_LOCK_T, LINE_CHARGE_LEN, LINE_CHARGE_W, PULL_BEAM_RANGE, PULL_BEAM_T, PULL_BEAM_W, RAMPAGE_DURATION, PROP_SCALE, roadAt, ROAD_MINOR_WIDTH, STRAFE_TELEGRAPH_T, DISTRICT_BLEND_PX, SKIES_FLOOR_KEEP, LANE_CAMERA_FRAC,
  // ---- v5.10 skies art direction (docs/superpowers/specs/2026-07-25-skies-art-direction.md) ----
  // All render-only, skies-only data. See config.js's "SKIES ART DIRECTION" section header.
  SKIES_PALETTE, SKIES_INK, SKIES_TELEGRAPH_LOD_PX, SKIES_FLASH, SKIES_SMOKE, SKIES_JAM, SKIES_FX,
  SKIES_LIGHT, DISTRICT_SURFACE, DISTRICT_EDGE, ROAD_PAINT, ROAD_DECAL, ROAD_JUNCTION,
  SKIES_SHADOW, SKIES_BAKE_PX, SKIES_STRUCTURE_ART, SKIES_RUIN, SKIES_VEHICLE, SKIES_KAIJU,
  // sim constants the FX clocks key off (the spec's "arrival clock" rule is only enforceable if
  // the clock and the fuse are literally the same number — see SKIES_FX's own doc)
  ARTILLERY_FUSE, BOMBARDMENT_FUSE, ARTILLERY_ELITE_RADIUS, MISSILE_FIRE_RANGE,
  ROAD_MAJOR_WIDTH, cityAt, nearestCity, CITY_GRID, STREET_SPACING_MAJOR_EVERY, parcelAt, PARCEL, terrainAt, clumpAt,
} from './config.js'
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
// v5.21: planet surface spin, rad/s. Read in syncObstacles (outside buildTextures' block scope),
// so it lives here rather than beside the other PLANET_* bake constants.
const PLANET_SPIN_MAX = 0.18

// v5.23 — planets are real spheres now. Direction TO the star, in the shader's y-UP space, shared by
// every planet so the chapter agrees about where the light is. Up and to the left, matching the
// baked directional cues on every other prop in the beyond set.
// z is deliberately the SMALLEST component: a star sitting behind the camera lights the whole
// visible hemisphere evenly and the sphere flattens into a disc. Pushing the light sideways is what
// puts a terminator across the body, which is the strongest 3D cue there is.
const PLANET_LIGHT = (() => {
  const v = [-0.52, 0.58, 0.42], m = Math.hypot(...v)
  return new Float32Array(v.map((n) => n / m))
})()

// Quad in [-1,1]. The SPHERE is entirely in the fragment shader — the geometry is just the square
// that bounds it, so every planet shares one geometry and costs one draw call.
const PLANET_VERT = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}`

// Reconstruct the sphere normal from the quad, rotate it into texture space by a full 3x3, then
// read the equirectangular map at that lat/long. Because the rotation is a real matrix and not a
// 2D `sprite.rotation`, the axis can point anywhere — which is the entire point of this shader.
// Lighting is per-pixel N.L, so the terminator is computed rather than painted, and it stays put
// while the surface turns underneath it.
const PLANET_FRAG = `
precision highp float;
in vec2 vUV;
uniform sampler2D uMap;
uniform sampler2D uEmit;
uniform vec3 uRot0;
uniform vec3 uRot1;
uniform vec3 uRot2;
uniform vec3 uLight;
uniform vec3 uAtmo;
uniform vec3 uTint;
void main() {
  vec2 p = vUV * 2.0 - 1.0;
  p.y = -p.y;                       // canvas is y-down, the sphere is y-up
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;            // outside the disc there is no planet
  float z = sqrt(max(0.0, 1.0 - r2));
  vec3 n = vec3(p, z);              // unit normal, +z toward the camera
  vec3 m = mat3(uRot0, uRot1, uRot2) * n;
  vec2 uv = vec2(atan(m.x, m.z) * 0.15915494 + 0.5, 0.5 - asin(clamp(m.y, -1.0, 1.0)) * 0.31830989);
  vec3 col = texture2D(uMap, uv).rgb * uTint;
  float day = smoothstep(-0.25, 0.85, dot(n, uLight));
  col *= mix(0.12, 1.16, day);
  // Emissive burns THROUGH the night side and is washed out by day — city lights and lava behave
  // the way the archetypes that own them were designed around.
  col += texture2D(uEmit, uv).rgb * (1.0 - day * 0.88);
  // Rim: atmosphere is thickest where the line of sight grazes the limb, and it is lit by the same
  // star, so it fades out on the night side instead of ringing the whole silhouette.
  col += uAtmo * pow(1.0 - z, 3.0) * (0.25 + 0.75 * day);
  // Antialias the limb by fading over a fixed slice of r2 rather than a derivative: Pixi compiles
  // this program as WebGL1, where fwidth needs GL_OES_standard_derivatives and fails to link
  // without it. 0.988 is r=0.994, so the fade is ~1.5px on a 230px-radius planet.
  float a = 1.0 - smoothstep(0.988, 1.0, r2);
  gl_FragColor = vec4(col * a, a);
}`

let planetGeom = null
function makePlanetMesh() {
  planetGeom ||= new MeshGeometry({
    positions: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  })
  const uniforms = new UniformGroup({
    uRot0: { value: new Float32Array([1, 0, 0]), type: 'vec3<f32>' },
    uRot1: { value: new Float32Array([0, 1, 0]), type: 'vec3<f32>' },
    uRot2: { value: new Float32Array([0, 0, 1]), type: 'vec3<f32>' },
    uLight: { value: PLANET_LIGHT, type: 'vec3<f32>' },
    uAtmo: { value: new Float32Array([0, 0, 0]), type: 'vec3<f32>' },
    uTint: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
  })
  const shader = Shader.from({
    gl: { vertex: PLANET_VERT, fragment: PLANET_FRAG },
    resources: { uniforms, uMap: Texture.WHITE.source, uEmit: Texture.WHITE.source },
  })
  return new Mesh({ geometry: planetGeom, shader })
}

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
  // v5.11 kaiju redesign: whether the active chapter draws the dedicated kaiju body/tail rig
  // (CHAPTERS[].render.kaiju — currently only `skies`) instead of the generic cross-chapter blob.
  // Same latch pattern as chapterHasStorm; read by syncPlayer/updateRampage. Every other chapter
  // (including pond/undergrowth, which also set `tail: true`) never sees this flag flip true, so
  // their rig is byte-identical to before this pass.
  let chapterHasKaiju = false
  let chapterHasLane = false   // v5.18 beyond: bottom-anchored camera (CHAPTERS[].lane)
  // Whether the active chapter's ground is a per-cell Voronoi district map (CHAPTERS[].render.
  // districts — currently only `skies`, piece 4). districtSeed mirrors run._districtSeed so the
  // floor populate* callbacks and syncObstacles don't need `run` threaded through every call.
  let chapterHasDistricts = false
  let districtSeed = 0
  // Whether the active chapter has a street grid to draw (CHAPTERS[].roads — currently only
  // `skies`). v5.11: roadSeed now mirrors run._districtSeed, the ONE world seed. The old split
  // (roads on run._obstacleSeed, terrain on run._districtSeed) is exactly what let streets run
  // through open sea, and forced this file to gate road DRAWING per district cell to hide it —
  // which is what chopped every street into 600px stubs. Roads are generated from cities now, so
  // there is nothing to hide and nothing to gate.
  let chapterHasRoads = false
  let roadSeed = 0
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
  // invader (v5.18, The Beyond's lane): the Space Invaders half. Seen almost exclusively IN RANK —
  // six abreast, marching down the lane — so it is authored for the block, not the close-up. That
  // means one hard, symmetrical silhouette with a wide flat shoulder line: six of these side by side
  // read as a WALL with gaps in it, which is the only thing the player actually needs to see. A
  // rounded or busy shape would blur into the neighbouring columns at rank spacing.
  // Nose at +x like every other look here (ROSTER_LOOKS lean rotates it to travel).
  function drawInvader(g, elite, white) {
    const r = 12
    const f = (c) => white ? 0xffffff : c
    const line = f(0x2a1a52)
    const lw = Math.max(1.8, r * 0.12)
    groundShadow(r * 0.9, r * 0.8)
    // two down-swept mandibles, drawn first so their roots hide under the hull
    for (const s of [-1, 1]) {
      taperStroke(g, [[r * 0.1, s * r * 0.55], [r * 0.85, s * r * 0.95], [r * 1.1, s * r * 0.6]],
        r * 0.17, 0.55, f(0x7f6adf), 3)
    }
    // hull: a flat-shouldered hexagon — the wide ±y edge is what makes a rank read as a line
    g.poly([
      r * 1.0, 0, r * 0.45, -r * 0.85, -r * 0.55, -r * 0.85,
      -r * 0.95, 0, -r * 0.55, r * 0.85, r * 0.45, r * 0.85,
    ]).fill(f(0xa78bfa)).stroke({ width: lw, color: line })
    if (!white) {
      // lit from the star side (-y): a pale crown and a shadowed belly, same one-light rule the
      // planets use, so every object in the chapter agrees about where the sun is
      g.poly([r * 1.0, 0, r * 0.45, -r * 0.85, -r * 0.55, -r * 0.85, -r * 0.95, 0])
        .fill({ color: 0xe4dcff, alpha: 0.26 })
      g.poly([r * 1.0, 0, r * 0.45, r * 0.85, -r * 0.55, r * 0.85, -r * 0.95, 0])
        .fill({ color: 0x3d2a7a, alpha: 0.3 })
      // a single wide eye band — one bright horizontal slot, legible at rank distance
      g.roundRect(r * 0.05, -r * 0.3, r * 0.6, r * 0.6, r * 0.16).fill(f(0x1a1030))
      g.roundRect(r * 0.16, -r * 0.19, r * 0.34, r * 0.38, r * 0.1).fill(0x6ff0ff)
      g.circle(r * 0.3, -r * 0.06, r * 0.09).fill({ color: 0xffffff, alpha: 0.85 })
    }
  }

  // hulk (v5.18): the rank's anchor. Same silhouette language as the invader so they read as one
  // army, but slab-sided and plated — it is the column you route AROUND rather than through.
  function drawHulk(g, elite, white) {
    const r = 12
    const f = (c) => white ? 0xffffff : c
    const line = f(0x241546)
    const lw = Math.max(2, r * 0.14)
    groundShadow(r * 1.05, r * 0.95)
    // shoulder plates, outboard, squared off
    for (const s of [-1, 1]) {
      g.poly([r * 0.15, s * r * 0.7, r * 0.8, s * r * 0.85, r * 0.7, s * r * 1.15, -r * 0.1, s * r * 1.0])
        .fill(f(0x6b5ab8)).stroke({ width: lw * 0.8, color: line })
    }
    // slab hull — blunter and squarer than the invader's, no taper to the nose
    g.poly([
      r * 0.95, -r * 0.5, r * 0.95, r * 0.5, r * 0.2, r * 0.95,
      -r * 0.9, r * 0.8, -r * 0.9, -r * 0.8, r * 0.2, -r * 0.95,
    ]).fill(f(0x8b79d6)).stroke({ width: lw, color: line })
    if (!white) {
      g.poly([r * 0.95, -r * 0.5, r * 0.2, -r * 0.95, -r * 0.9, -r * 0.8, -r * 0.9, 0, r * 0.95, 0])
        .fill({ color: 0xe4dcff, alpha: 0.2 })
      g.poly([r * 0.95, r * 0.5, r * 0.2, r * 0.95, -r * 0.9, r * 0.8, -r * 0.9, 0, r * 0.95, 0])
        .fill({ color: 0x2f1f63, alpha: 0.34 })
      // armour seams
      g.beginPath()
      for (const s of [-1, 1]) g.moveTo(r * 0.7, s * r * 0.3).lineTo(-r * 0.7, s * r * 0.5)
      g.stroke({ width: 1.2, color: 0x2a1a52, alpha: 0.5 })
      // two narrow slit eyes — meaner than the invader's single band
      for (const s of [-1, 1]) {
        g.roundRect(r * 0.3, s * r * 0.34 - r * 0.11, r * 0.42, r * 0.22, r * 0.08).fill(f(0x140b26))
        g.roundRect(r * 0.36, s * r * 0.34 - r * 0.06, r * 0.28, r * 0.12, r * 0.05).fill(0xff8a5c)
      }
    }
  }

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
    // v5.18 The Beyond. The chapter's roster ids changed (blinker/flicker -> the five below) and a
    // missing key here is SILENT — syncEnemies falls through to the generic archetype blob, so the
    // enemies simply render as Chapter 1's kawaii cells with no error anywhere. Every id in
    // CHAPTERS.beyond.roster must have an entry.
    // The two SEEKERS reuse the void art already authored for this chapter rather than adding more:
    // the crystal and the phantom were drawn for beyond and were orphaned by the roster change, so
    // they come back as the swarm half of the merge instead of being deleted and re-drawn.
    warden: { archetype: 'tank', draw: drawBlinker, lean: 90 },        // void crystal, no gravity-up
    drifter: { archetype: 'normal', draw: drawFlicker, lean: 90 },     // void phantom, no gravity-up
    // The two MARCHERS are new, and authored to be read in rank rather than close up.
    invader: { archetype: 'normal', draw: drawInvader, lean: 90 },     // flat-shouldered hex; a rank of six reads as one wall
    hulk: { archetype: 'tank', draw: drawHulk, lean: 90 },             // slab + shoulder plates; the column you route around
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
    // ---- district ground SIGNATURE patterns (skies only, v5.9.1 render fix) -------------------
    // "the biomes are not clear enough" (playtest report): DISTRICTS' floorTint (config.js) is
    // deliberately squeezed into a ~0.06-0.09 luminance band (a night storm, not daylight — see
    // that constant's own comment) so hue alone was never going to carry six districts, but the
    // OTHER half of the bug is that every district paints the exact same shape as its base ground
    // texture — T.blotches right above, four soft round radial-gradient blobs, reused everywhere.
    // Downtown pavement and a park lawn were literally the same mottling, just recoloured. These
    // five bakes give five of the six districts (parks keeps the original blotch: soft organic
    // mottling already reads as "wild/unmanicured," and it isn't one of this task's named examples)
    // their own PATTERN, not just their own tint: asphalt slab seams, a mown-lawn tick hatch,
    // parallel crop furrows, a rocky stipple, gentle water ripples.
    // Baked WHITE (alpha alone carries the shape) so floorTint (districtTintAt, below) is STILL the
    // only thing setting hue — exactly like T.blotches' own tint path (populateBlotch) — these only
    // add a silhouette on top of it, never a second competing colour. bake()'s default pad crops
    // tightly to whatever's drawn (unlike T.blotches' fixed 300px canvas), which is fine: populate-
    // Blotch's scale math is a relative multiplier on the texture's OWN size either way, and its
    // anchor comes from bake()'s own {ax,ay}, not a hardcoded 0.5 — see that function below.
    {
      function groundTile(draw) {
        const g = new Graphics()
        draw(g)
        return bake(g)
      }
      // downtown: asphalt slab — a hard rounded-rect block (not a soft round blotch) with 1-2
      // engraved seam gaps (low-alpha cuts through the fill) reading as pavement joints. Two
      // variants (seam position/slab size differ) so a paved block doesn't repeat visibly.
      T.districtGround = {}
      T.districtGround.downtown = [
        groundTile((g) => {
          g.roundRect(-135, -95, 270, 190, 12).fill({ color: 0xffffff, alpha: 0.48 })
          g.rect(-135, -14, 270, 8).fill({ color: 0x000000, alpha: 0.32 })  // horizontal joint
          g.rect(-24, -95, 8, 190).fill({ color: 0x000000, alpha: 0.32 })  // vertical joint
        }),
        groundTile((g) => {
          g.roundRect(-115, -125, 230, 250, 10).fill({ color: 0xffffff, alpha: 0.44 })
          g.rect(-115, 30, 230, 7).fill({ color: 0x000000, alpha: 0.3 })
          g.rect(45, -125, 7, 250).fill({ color: 0x000000, alpha: 0.3 })
        }),
      ]
      // suburbs: mown lawn — a dense, evenly-fanned hatch of short ticks (grass blades). The
      // REGULARITY is the "manicured" read (versus parks' loose organic blotch below) — each tile
      // still lands at a random rotation like every other blotch, so the hatch direction still
      // varies yard to yard; it's the density/uniformity that reads as "lawn," not a global grain.
      T.districtGround.suburbs = [
        groundTile((g) => {
          for (let row = -5; row <= 5; row++) {
            for (let col = -5; col <= 5; col++) {
              const x = col * 22 + (hash(row * 7.1 + col * 3.7) - 0.5) * 11
              const y = row * 22 + (hash(row * 2.3 + col * 9.9 + 4) - 0.5) * 11
              if (x * x + y * y * 1.6 > 125 * 125) continue // round off the tile's corners
              const a = 1.35 + (hash(row * 5.3 + col * 1.7 + 8) - 0.5) * 0.7
              g.moveTo(x, y).lineTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8)
                .stroke({ width: 2.4, color: 0xffffff, alpha: 0.4, cap: 'round' })
            }
          }
        }),
      ]
      // farms: parallel furrow lines — populateBlotch (below) rotates this to the FIELD's own row
      // angle (farmRowSnap, shared with the cropTuft prop) instead of a random spin, so every cell
      // in one field shares the SAME line direction and the belt reads as cultivated rows, not
      // scattered dashes. Two variants (line spacing/count differ) for a little texture variety.
      T.districtGround.farms = [
        groundTile((g) => {
          for (let k = -4; k <= 4; k++) g.rect(-150, k * 24 - 3, 300, 6).fill({ color: 0xffffff, alpha: 0.4 })
        }),
        groundTile((g) => {
          for (let k = -5; k <= 5; k++) g.rect(-150, k * 20 - 2, 300, 4).fill({ color: 0xffffff, alpha: 0.44 })
        }),
      ]
      // hills: rocky stipple — a scatter of small hard-edged fleck polygons (same fixed-jitter n-gon
      // idiom as the T.rockChunk/pebble bakes elsewhere), grittier than every other district's soft
      // blotch. Two variants (fleck count/placement differ).
      T.districtGround.hills = [
        groundTile((g) => {
          for (let n = 0; n < 20; n++) {
            const a = hash(n * 3.7 + 1.1) * Math.PI * 2
            const d = hash(n * 5.3 + 2.9) * 115
            const x = Math.cos(a) * d, y = Math.sin(a) * d * 0.75
            const r = 4 + hash(n * 7.1 + 0.4) * 7
            const pts = []
            for (let k = 0; k < 6; k++) {
              const pa = (k / 6) * Math.PI * 2
              const pr = r * (0.7 + hash(n * 11 + k * 2.3) * 0.5)
              pts.push(x + Math.cos(pa) * pr, y + Math.sin(pa) * pr)
            }
            g.poly(pts).fill({ color: 0xffffff, alpha: 0.3 + hash(n * 2.1) * 0.18 })
          }
        }),
        groundTile((g) => {
          for (let n = 0; n < 15; n++) {
            const a = hash(n * 4.3 + 9.1) * Math.PI * 2
            const d = hash(n * 6.1 + 3.7) * 108
            const x = Math.cos(a) * d, y = Math.sin(a) * d * 0.8
            const r = 5 + hash(n * 8.3 + 1.2) * 9
            const pts = []
            for (let k = 0; k < 6; k++) {
              const pa = (k / 6) * Math.PI * 2
              const pr = r * (0.7 + hash(n * 13 + k * 3.1) * 0.5)
              pts.push(x + Math.cos(pa) * pr, y + Math.sin(pa) * pr)
            }
            g.poly(pts).fill({ color: 0xffffff, alpha: 0.28 + hash(n * 3.3) * 0.2 })
          }
        }),
      ]
      // sea: gentle ripple bands — soft parallel curves, lower alpha than every land pattern above
      // (water reads calmer/flatter, not busy). Two variants (curve bow/spacing differ).
      // v5.11: open water was reading as a flat dead-navy plane between the sparse foam/container
      // props (kill list-adjacent complaint: "large areas of flat dead navy"). More ripple bands
      // (5, was 3) plus a scatter of tiny moonlit glint flecks — still one bake, still white-alpha
      // so floorTintAt still carries all the hue, just enough incident texture that the water reads
      // as a surface instead of empty canvas.
      T.districtGround.sea = [
        groundTile((g) => {
          for (const yOff of [-110, -55, 0, 55, 110]) {
            g.moveTo(-150, yOff).quadraticCurveTo(0, yOff - 24, 150, yOff)
              .stroke({ width: 5, color: 0xffffff, alpha: 0.2, cap: 'round' })
          }
          for (let k = 0; k < 14; k++) {
            const gx = (hash(k * 4.1 + 0.7) - 0.5) * 280
            const gy = (hash(k * 6.7 + 1.9) - 0.5) * 190
            g.circle(gx, gy, 1.3).fill({ color: 0xffffff, alpha: 0.22 + hash(k * 2.3) * 0.18 })
          }
        }),
        groundTile((g) => {
          for (const yOff of [-95, -40, 20, 75, 120]) {
            g.moveTo(-150, yOff).quadraticCurveTo(0, yOff + 22, 150, yOff)
              .stroke({ width: 4.5, color: 0xffffff, alpha: 0.18, cap: 'round' })
          }
          for (let k = 0; k < 12; k++) {
            const gx = (hash(k * 5.3 + 2.4) - 0.5) * 280
            const gy = (hash(k * 3.9 + 4.1) - 0.5) * 190
            g.circle(gx, gy, 1.2).fill({ color: 0xffffff, alpha: 0.2 + hash(k * 1.7) * 0.18 })
          }
        }),
      ]
    }

    // ---- TERRAIN TILES (v5.11) — the ground is a surface, not a scatter -----------------------
    // "the backgrounds is still bad... some white lines are crossing everything i dont know what is
    // it, maybe crops but it's so ugly it doesnt resemble anything" (playtest report).
    //
    // The white lines were T.districtGround.farms, above: nine 300px stripes per tile, stamped at a
    // random 1.1-1.7x scale on a 420px cell and rotated to the field angle. Farmland was being drawn
    // as INDIVIDUAL CROP STROKES, which is the wrong level of abstraction for a camera this high —
    // from above you cannot resolve a furrow, you resolve a FIELD. So the strokes never read as
    // crops; they read as hatching scribbled over the whole map, including over biomes that have no
    // crops at all, because a 420px blotch cell samples its district at its own centre and lands
    // wherever it likes.
    //
    // The replacement is a different kind of layer. Every tile here is a FULL SQUARE covering its
    // whole cell edge-to-edge, at a fixed position, with no jitter, no random scale and no random
    // rotation. That single change is what turns the floor from "things scattered on a void" into a
    // continuous SURFACE — which is what a satellite view is.
    //
    // Farmland is now a PATCHWORK OF PARCELS: one flat field per cell, its own crop colour, its own
    // row direction, bordered by a headland strip so neighbouring fields visibly abut. That is the
    // actual overhead signature of agriculture, and it is the reason parcels are axis-aligned — real
    // surveyed farmland follows section lines, and an axis-aligned lattice also tiles a square cell
    // grid perfectly, so fields meet with no gaps and no overlap.
    //
    // COLOUR STILL COMES FROM THE TINT. Each tile is baked WHITE (alpha carries the shape only), so
    // districtTintAt — which v5.11 made continuous in the raw elevation/moisture/urban fields —
    // remains the only thing setting hue. This matters at coastlines: the TEXTURE changes abruptly
    // at a cell boundary, but the COLOUR does not, so a shoreline reads as a smooth curve instead of
    // a 280px staircase. Texture popping is nearly invisible; colour popping is not.
    {
      const TT = 256   // bake reference size; populateTerrain scales this to the cell
      const H = TT / 2
      // v5.12: a terrain tile carries TEXTURE ONLY — no fill, no colour. Colour is a continuous
      // field drawn underneath by updateGroundField; see its header for why the two were separated.
      // The square here is a ZERO-ALPHA BOUNDS KEEPER (the same idiom skiesPlan uses): it fixes
      // bake()'s tight crop to exactly TTxTT so every biome's tile scales alike, while contributing
      // nothing visible. `baseAlpha` is gone — a tile that paints no colour cannot quantise one.
      function terrainTile(draw) {
        const g = new Graphics()
        g.rect(-H, -H, TT, TT).fill({ color: 0x000000, alpha: 0 })
        if (draw) draw(g)
        // bake() returns {tex, ax, ay} and NOTHING else — it has no `ref`. Carrying the reference
        // size explicitly is what lets populateTerrain scale a tile to its cell; reading a
        // non-existent look.ref silently yields NaN, which Pixi renders as an invisible sprite.
        return { ...bake(g), ref: TT + 6 }
      }
      // Farmland is the ONE exception that keeps an opaque, coloured, hard-edged tile — a surveyed
      // field really is a flat rectangle of one crop with a sharp boundary, and the patchwork is the
      // whole point. Applying that logic to a coastline is what produced the staircase; applying it
      // to a parcel is just correct. populateTerrain uses these only where a cell is SOLIDLY
      // farmland (all four corners too), so a parcel can never cut a square edge into a shoreline.
      function parcelTile(draw) {
        const g = new Graphics()
        g.rect(-H, -H, TT, TT).fill({ color: 0xffffff, alpha: 1 })
        if (draw) draw(g)
        return { ...bake(g), ref: TT + 6 }
      }
      // Rows for a cultivated parcel: thin, low-contrast, and CLOSE together. The v5.10 furrows
      // failed by being wide, bright and far apart, which reads as stripes rather than as texture.
      function rows(g, vertical, pitch, alpha) {
        for (let k = -8; k <= 8; k++) {
          const o = k * pitch - 1
          if (vertical) g.rect(o, -H, 2, TT).fill({ color: 0xffffff, alpha })
          else g.rect(-H, o, TT, 2).fill({ color: 0xffffff, alpha })
        }
      }
      // The headland: the turn-strip at a field's edge where the tractor comes about. Drawn as an
      // inset darker border, it is what makes one parcel legibly a DIFFERENT parcel from its
      // neighbour — without it a patchwork of similar greens is just noise.
      function headland(g) {
        g.rect(-H + 1.5, -H + 1.5, TT - 3, TT - 3).stroke({ width: 3, color: 0x000000, alpha: 0.22 })
      }
      T.terrainTile = {}
      // Solid-interior farm parcels: opaque, crop-coloured, hard-edged (see parcelTile).
      T.parcelTile = [
        parcelTile((g) => { rows(g, false, 15, 0.11); headland(g) }),
        parcelTile((g) => { rows(g, true, 15, 0.11); headland(g) }),
        parcelTile((g) => { rows(g, false, 22, 0.09); headland(g) }),
        parcelTile((g) => { rows(g, true, 22, 0.09); headland(g) }),
        // centre-pivot irrigation: a perfect circle in a field of straight lines is the single most
        // recognisable thing in an overhead photograph of farmland.
        parcelTile((g) => {
          g.circle(0, 0, H * 0.92).fill({ color: 0xffffff, alpha: 0.13 })
          g.circle(0, 0, H * 0.92).stroke({ width: 2.5, color: 0xffffff, alpha: 0.20 })
          g.rect(-1.5, -H * 0.92, 3, H * 0.92).fill({ color: 0xffffff, alpha: 0.16 })   // the arm
          headland(g)
        }),
      ]
      // ...and the texture-only version used on a farm cell that touches another biome, so a
      // parcel's hard edge never lands on a shoreline.
      T.terrainTile.farms = [
        terrainTile((g) => rows(g, false, 15, 0.10)),
        terrainTile((g) => rows(g, true, 15, 0.10)),
        terrainTile((g) => rows(g, false, 22, 0.08)),
        terrainTile((g) => rows(g, true, 22, 0.08)),
      ]
      // Desert: wind-blown dune ripples — long, shallow, near-parallel arcs at very low contrast.
      // An arid surface is defined by how LITTLE is on it, so this is the sparsest tile here.
      T.terrainTile.desert = [
        terrainTile((g) => {
          for (let k = -4; k <= 4; k++) {
            g.moveTo(-H, k * 30)
            g.bezierCurveTo(-H / 2, k * 30 - 13, H / 2, k * 30 + 13, H, k * 30)
            g.stroke({ width: 2.5, color: 0xffffff, alpha: 0.07 })
          }
        }),
        terrainTile((g) => {
          for (let n = 0; n < 14; n++) {
            const x = (hash(n * 3.1 + 0.7) - 0.5) * TT
            const y = (hash(n * 5.9 + 2.2) - 0.5) * TT
            g.circle(x, y, 1.4 + hash(n * 2.3) * 1.6).fill({ color: 0xffffff, alpha: 0.10 })
          }
        }),
      ]
      // Beach: wet sand, with the swash lines the tide leaves parallel to the water.
      T.terrainTile.beach = [
        terrainTile((g) => {
          for (let k = -3; k <= 3; k++) {
            g.moveTo(-H, k * 36 + 6)
            g.bezierCurveTo(-H / 3, k * 36 - 9, H / 3, k * 36 + 15, H, k * 36 + 2)
            g.stroke({ width: 2, color: 0xffffff, alpha: 0.13 })
          }
          for (let n = 0; n < 26; n++) {
            g.circle((hash(n * 4.7 + 1.3) - 0.5) * TT, (hash(n * 6.1 + 3.9) - 0.5) * TT, 1)
              .fill({ color: 0xffffff, alpha: 0.16 })
          }
        }),
      ]
      // Water: broad, calm, low-contrast ripple banding. Deliberately the flattest tile — water is
      // the one surface that should NOT compete for attention, since the threats fly over it.
      T.terrainTile.sea = [
        terrainTile((g) => {
          for (let k = -4; k <= 4; k++) {
            g.moveTo(-H, k * 32)
            g.bezierCurveTo(-H / 2, k * 32 + 9, H / 2, k * 32 - 9, H, k * 32)
            g.stroke({ width: 3, color: 0xffffff, alpha: 0.06 })
          }
        }),
        terrainTile((g) => {
          for (let k = -3; k <= 3; k++) {
            g.moveTo(-H, k * 40 + 12)
            g.bezierCurveTo(-H / 2, k * 40 + 2, H / 2, k * 40 + 22, H, k * 40 + 10)
            g.stroke({ width: 3, color: 0xffffff, alpha: 0.05 })
          }
        }),
      ]
      // Woodland: overlapping canopy crowns. Irregular, clustered, and the only tile whose detail
      // is meant to read as individual OBJECTS from above — because tree crowns actually do.
      // Parks: MOWN STRIPES. v5.13 — this tile used to be 22 soft white discs per 256px cell, and
      // in a park-sized region that is ~260 overlapping pale circles on screen at once: the "bokeh"
      // haze the user reported as visual clutter, and (kill list §8.10) the exact soft-radial-blob
      // idiom the art direction spec set out to remove. The stripe bake that was written to replace
      // it has existed since v5.10 as T.districtGround.parks — but populateBlotch, its only caller,
      // returns early for any chapter with a terrain map, so skies has never once drawn it. Moving
      // it here, into the tile populateTerrain actually reads, is the whole fix.
      // ONE variant, no random rotation (populateTerrain pins rotation 0): a mown field has a single
      // grain, and v5.12's lesson was that per-cell randomness is what reads as lattice noise.
      // Pitch divides TT evenly (256 / 32 = 8, an even count) so the A/B alternation meets itself
      // across a cell boundary instead of seaming.
      T.terrainTile.parks = [
        terrainTile((g) => {
          const st = DISTRICT_SURFACE.parks
          for (let k = -4; k <= 3; k++) {
            g.rect(-H, k * st.stripePx, TT, st.stripePx)
              .fill({ color: 0xffffff, alpha: (k & 1) ? st.stripeAlphaA : st.stripeAlphaB })
          }
        }),
      ]
      // High ground: contour banding. A contour line is the one mark that says "slope" to a camera
      // with no horizon, which is the whole problem with drawing terrain relief from directly above.
      T.terrainTile.hills = [
        terrainTile((g) => {
          for (let k = 0; k < 5; k++) {
            g.ellipse(10, -6, H * (0.28 + k * 0.19), H * (0.20 + k * 0.16))
              .stroke({ width: 2.5, color: 0xffffff, alpha: 0.09 })
          }
        }),
        terrainTile((g) => {
          for (let n = 0; n < 16; n++) {
            const x = (hash(n * 3.7 + 6.1) - 0.5) * TT
            const y = (hash(n * 5.3 + 2.9) - 0.5) * TT
            const r = 4 + hash(n * 7.1 + 0.4) * 7
            const pts = []
            for (let k = 0; k < 6; k++) {
              const pa = (k / 6) * Math.PI * 2
              const pr = r * (0.7 + hash(n * 11 + k * 2.3) * 0.5)
              pts.push(x + Math.cos(pa) * pr, y + Math.sin(pa) * pr)
            }
            g.poly(pts).fill({ color: 0xffffff, alpha: 0.13 })
          }
        }),
      ]
      // Built ground. Downtown is a paved slab with expansion joints; suburbs is lawn plus the lot
      // lines that divide one garden from the next. Both keep their v5.10 character — those two
      // patterns were never the problem — but as full tiles rather than floating blobs.
      // NO STRAIGHT LINES IN A TILE THAT REPEATS. The first cut of these two drew slab seams and lot
      // lines as full-width rects at fixed offsets — which, stamped on every cell, tiled into a
      // hard 280px lattice across the whole city. The floor grew its own visible grid, competing
      // with the actual street grid drawn on top of it. Only the farm parcel is allowed a border,
      // because there the repetition IS the subject; everywhere else the detail has to be
      // hash-scattered so no two neighbouring tiles line up.
      T.terrainTile.downtown = [
        terrainTile((g) => {
          // worn asphalt: irregular patches and old repairs, never a seam that reaches an edge
          for (let n = 0; n < 9; n++) {
            const x = (hash(n * 3.3 + 1.4) - 0.5) * TT * 0.8
            const y = (hash(n * 5.7 + 2.8) - 0.5) * TT * 0.8
            const w = 14 + hash(n * 2.1) * 34, h2 = 10 + hash(n * 4.4) * 26
            g.rect(x, y, w, h2).fill({ color: 0x000000, alpha: 0.06 + hash(n * 7.7) * 0.06 })
          }
        }),
        terrainTile((g) => {
          for (let n = 0; n < 30; n++) {
            const x = (hash(n * 4.9 + 3.1) - 0.5) * TT
            const y = (hash(n * 6.3 + 0.6) - 0.5) * TT
            g.circle(x, y, 2 + hash(n * 3.7) * 5).fill({ color: 0x000000, alpha: 0.07 })
          }
        }),
      ]
      T.terrainTile.suburbs = [
        terrainTile((g) => {
          for (let n = 0; n < 90; n++) {
            const x = (hash(n * 2.7 + 0.9) - 0.5) * TT
            const y = (hash(n * 4.1 + 5.7) - 0.5) * TT
            g.rect(x, y, 1.6, 5).fill({ color: 0xffffff, alpha: 0.11 })
          }
        }),
        terrainTile((g) => {
          for (let n = 0; n < 70; n++) {
            const x = (hash(n * 3.9 + 2.3) - 0.5) * TT
            const y = (hash(n * 5.7 + 1.1) - 0.5) * TT
            g.rect(x, y, 1.6, 5).fill({ color: 0xffffff, alpha: 0.10 })
          }
          // one hedge stub, hash-placed and well short of any edge, so it cannot line up with a
          // neighbouring tile's
          g.rect(-40 + hash(9.1) * 60, -20 + hash(4.4) * 40, 54, 3).fill({ color: 0x000000, alpha: 0.13 })
        }),
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
    // planet (v5.18, The Beyond): the chapter's largest object by far and the thing that sells
    // "star system". It gets its OWN bake rather than reusing T.asteroid, which is authored at a
    // ~51-unit content radius: at the new collider sizes (up to r 260) that rock was being magnified
    // ~9.7x into a blurred smear of torn paper, and a second copy of it was stamped at the rim.
    // Baked ONCE at a high reference radius and scaled DOWN per planet, so it stays crisp.
    // Lit from -y, the direction of the distant star, and every other object in the chapter agrees
    // with that (see drawInvader's crown/belly). A sphere is a disc plus a terminator, and the
    // terminator is the only thing that makes it read as a ball rather than a coin.
    {
      // PLANETS (beyond) — v5.20. Seven baked archetypes instead of one repeated sphere.
      //
      // Why seven complete bakes rather than one texture re-tinted per instance: Pixi's tint is a
      // MULTIPLY, so it can only cool/warm/darken. It cannot turn a banded violet gas giant into a
      // grey cratered moon. Rotation is no help either — this chapter has an explicit one-light
      // direction (see the kaiju/prop bakes: everything agrees where the sun is), and spinning a lit
      // sphere moves its terminator. Tint survives as a SECONDARY axis only: 7 bakes x 5 hues.
      //
      // Sizing reality, which is what drives the art: world.scale is 1, so an o.r=260 planet is a
      // 520px sprite on a ~430px-wide phone. You usually see a LIMB AND A SLICE, never a whole disc.
      // So every archetype's identifying mark repeats across the whole surface — no single centred
      // motif — and the limb/halo colour matters most, because it enters the screen first.
      const PLANET_R = 256
      // Body disc as a fraction of PLANET_R. Was 0.985, which put the halo stroke (centred 0.995R,
      // width 0.06R) out to 1.025R on a canvas whose half-extent IS 1.0R — so the halo was shaved
      // flat at the four cardinal points. 0.90 gives every archetype room for its halo AND its rings.
      const PLANET_BODY = 0.90
      // Near-white on purpose. Two gas giants side by side should read as two gas giants, not as a
      // gas giant and a bruise — the archetype's real palette is baked, this only nudges hue.
      const PLANET_TINTS = [0xffffff, 0xffe4cc, 0xd8e2ff, 0xffd8e8, 0xd8fff0]
      // rad/s. Deliberately tiny — see skin.planetSpinRate where it is used.

      const RING_TILT = -0.2
      const RING_BANDS = [[0.98, 0.86, 'rgba(228,214,186,0.55)'], [0.84, 0.74, 'rgba(255,244,220,0.75)'],
        [0.72, 0.63, 'rgba(190,172,142,0.45)']]
      // A ring is drawn TWICE — once under the body (far half) and once over it (near half, clipped
      // to its own lower half-plane, hence rotate-then-clip). That sandwich is the only thing that
      // makes a ring pass BEHIND a planet. It is also why the ringed archetype's body is 0.58R: the
      // ring has to fit the same centred square every other planet uses, or syncObstacles' "texture
      // width == collider diameter" contract stops holding for exactly one entry.
      function ringAnnulus(ctx, c, R, half) {
        ctx.save(); ctx.translate(c, c); ctx.rotate(RING_TILT)
        if (half === 'near') { ctx.beginPath(); ctx.rect(-R * 1.5, 0, R * 3, R * 1.5); ctx.clip() }
        for (const [ro, ri, col] of RING_BANDS) {
          ctx.beginPath()
          ctx.ellipse(0, 0, R * ro, R * ro * 0.3, 0, 0, Math.PI * 2)
          ctx.ellipse(0, 0, R * ri, R * ri * 0.3, 0, 0, Math.PI * 2, true) // anticlockwise -> hole
          ctx.fillStyle = col; ctx.fill()
        }
        ctx.restore()
      }
      // Soft-edged pool, used for lava lakes and city conurbations alike.
      function glowBlob(ctx, x, y, r, inner, outer) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, inner); g.addColorStop(1, outer)
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
      }
      // Closed blob from normalised points — continents, for the ocean and night-side worlds.
      // Curved, not straight: at gameplay scale a planet is ~500px, and straight-edged polygons read
      // as green paper cutouts glued to the sphere. Each source point becomes a quadratic control
      // point and the curve passes through edge midpoints, so a 4-point list gives a rounded blob.
      function landmass(ctx, c, br, pts, fill, stroke) {
        const px = (i) => c + br * pts[(i + pts.length) % pts.length][0]
        const py = (i) => c + br * pts[(i + pts.length) % pts.length][1]
        ctx.beginPath()
        ctx.moveTo((px(-1) + px(0)) / 2, (py(-1) + py(0)) / 2)
        for (let i = 0; i < pts.length; i++) {
          ctx.quadraticCurveTo(px(i), py(i), (px(i) + px(i + 1)) / 2, (py(i) + py(i + 1)) / 2)
        }
        ctx.closePath(); ctx.fillStyle = fill; ctx.fill()
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = br * 0.016; ctx.stroke() }
      }

      // The shared scaffold, in the same order the single planet used: body gradient, clipped
      // surface, terminator, optional emissive ON TOP of the terminator, rim arc, halo.
      // v5.21 SPLIT: surface and lighting are now TWO textures, because planets rotate.
      //
      // Rotating a fully-lit sphere drags its terminator and rim light around with it, so a spinning
      // planet reads as a planet whose SUN is orbiting it — and this chapter's whole prop set agrees
      // on one light direction. So the archetype bake keeps only rotation-INVARIANT content (a
      // CONCENTRIC body gradient, the surface features, the halo) and every directional cue moves
      // into one shared shell drawn unrotated on top, in the pooled sprite (clumpB) the planet branch
      // was already leaving empty. Surface spins underneath; the light never moves.
      // v5.23 — THE RE-PROJECTION. This used to bake a flat DISC; the sphere shader wants a lat/long
      // MAP. Every archetype's surface()/emissive() already draws into a [-1,1] square, so the whole
      // conversion is one transform: that square becomes the full 360x180 map. Belts stay belts, the
      // ice world's caps land on the actual poles, and PLANET_ARCHETYPES did not change at all.
      // ponytail: 1024x512 per archetype (~2MB) is 2x the old disc bake. Halve it if the beyond
      // chapter ever shows memory pressure on a phone — the visible hemisphere is only half the map.
      const MAP_W = 1024, MAP_H = 512
      const planetMapTex = (a, emissive) => {
        const t = canvasTex(MAP_W, MAP_H, (ctx, w, h) => {
          // Flat albedo, NOT the old centre-bright radial: that gradient was a hand-painted sphere
          // shade, and the shader computes the real one per pixel now — baking it in would darken
          // every limb twice. The emissive map starts transparent: it is ADDED, never lit.
          if (!emissive) { ctx.fillStyle = a.body[1][1]; ctx.fillRect(0, 0, w, h) }
          ctx.save()
          ctx.translate(w / 2, h / 2); ctx.scale(w / 2, h / 2)
          const draw = emissive ? a.emissive : a.surface
          if (draw) draw(ctx, 0, 1)
          ctx.restore()
        })
        // Longitude wraps, latitude does not: repeat on U kills the seam where -180 meets +180,
        // clamp on V stops the north pole bleeding into the south one.
        t.source.style.addressModeU = 'repeat'
        t.source.style.addressModeV = 'clamp-to-edge'
        return t
      }

      // Everything that is NOT on the sphere: the atmosphere glow, which extends past the limb, and
      // the ringed world's annulus, which has to straddle it. Both are rotation-invariant, so they
      // stay ordinary sprites — `behind` under the mesh, `front` over it.
      // The halo is a radial FADE, not a stroke: a constant-width constant-alpha ring reads as a
      // hard outline, which against this chapter's near-black background is the most artificial
      // thing on screen. 1.10 is the ceiling, not a taste call — PLANET_BODY is 0.90, so the halo
      // reaches 0.99 of the canvas half-extent; past 1.11 it comes back shaved at the four cardinals.
      const planetOverlayTex = (a, front) => canvasTex(PLANET_R * 2, PLANET_R * 2, (ctx, w) => {
        const R = PLANET_R, c = w / 2, br = R * (a.bodyR ?? PLANET_BODY)
        if (!front) { a.behind(ctx, c, R, br); return }
        if (a.halo) {
          const hg = ctx.createRadialGradient(c, c, br * 0.94, c, c, br * 1.1)
          hg.addColorStop(0, `rgba(${a.halo},0)`)
          hg.addColorStop(0.35, `rgba(${a.halo},${a.haloA})`)
          hg.addColorStop(1, `rgba(${a.halo},0)`)
          ctx.beginPath(); ctx.arc(c, c, br * 1.1, 0, Math.PI * 2); ctx.fillStyle = hg; ctx.fill()
        }
        if (a.front) a.front(ctx, c, R, br)
      })

      // The lighting shell is GONE (v5.23). Day-side lift, terminator and rim light were three
      // painted gradients faking a sphere under a fixed sun, and they are now three lines of the
      // fragment shader computed from the real normal. That is also what unlocked all-axis rotation:
      // the old surface could only spin because none of its lighting lived in the same texture.

      const PLANET_ARCHETYPES = [
        { // A. gas giant — eight irregular belts + one storm oval. Readable from any fragment.
          body: [[0, '#ffe6bd'], [0.45, '#e0a55f'], [0.82, '#8a5330'], [1, '#3a2317']],
          halo: '255,190,120', haloA: 0.2,
          surface(ctx, c, br) {
            // Deliberately irregular widths — the old four near-symmetric belts read as a test pattern.
            for (const [oy, ry, al, col] of [[-0.72, 0.07, 0.22, '#fff2d8'], [-0.5, 0.11, 0.18, '#7d4a2a'],
              [-0.28, 0.09, 0.2, '#ffdaa6'], [-0.08, 0.14, 0.16, '#6b3d22'], [0.14, 0.08, 0.22, '#ffe4b8'],
              [0.34, 0.12, 0.18, '#5e3520'], [0.56, 0.07, 0.16, '#ffd39a'], [0.74, 0.1, 0.2, '#4a2a19']]) {
              ctx.beginPath(); ctx.ellipse(c, c + br * oy, br, br * ry, 0, 0, Math.PI * 2)
              ctx.fillStyle = col; ctx.globalAlpha = al; ctx.fill()
            }
            ctx.globalAlpha = 1
            ctx.beginPath(); ctx.ellipse(c + br * 0.26, c + br * 0.2, br * 0.24, br * 0.13, -0.12, 0, Math.PI * 2)
            ctx.fillStyle = '#b9432a'; ctx.fill()
            ctx.beginPath(); ctx.ellipse(c + br * 0.26, c + br * 0.2, br * 0.13, br * 0.065, -0.12, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(255,190,140,0.55)'; ctx.fill()
          },
        },
        { // B. cratered moon — the ONLY body with no halo. Airlessness is the fastest discriminator.
          body: [[0, '#e8e4dc'], [0.45, '#a8a29a'], [0.82, '#585349'], [1, '#241f1c']],
          halo: null,
          surface(ctx, c, br) {
            // Fixed table, not hashed: this bakes ONCE, so there is nothing to vary, and a literal
            // list is legible where a seeded loop is not (same reasoning as T.asteroid's craters).
            for (const [cx, cy, cr] of [[-0.42, -0.2, 0.17], [0.18, -0.44, 0.11], [0.4, 0.12, 0.2],
              [-0.14, 0.34, 0.13], [0.06, -0.06, 0.08], [-0.55, 0.3, 0.09], [0.55, -0.22, 0.07],
              [-0.28, -0.55, 0.06], [0.24, 0.52, 0.1], [-0.66, -0.02, 0.06], [0.68, 0.36, 0.05]]) {
              const x = c + br * cx, y = c + br * cy, r = br * cr
              ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
              ctx.fillStyle = 'rgba(52,46,40,0.32)'; ctx.fill()
              ctx.beginPath(); ctx.arc(x, y, r * 0.94, Math.PI * 0.95, Math.PI * 1.95)
              ctx.strokeStyle = 'rgba(255,250,240,0.45)'; ctx.lineWidth = r * 0.22; ctx.stroke()
              ctx.beginPath(); ctx.arc(x, y, r * 0.94, Math.PI * 0.05, Math.PI * 0.9)
              ctx.strokeStyle = 'rgba(30,26,22,0.35)'; ctx.lineWidth = r * 0.18; ctx.stroke()
            }
            ctx.beginPath(); ctx.ellipse(c - br * 0.12, c + br * 0.08, br * 0.46, br * 0.38, 0.5, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(60,54,48,0.3)'; ctx.fill()
          },
        },
        { // C. ice world — brightest thing in a chapter whose background is 0x120a26.
          body: [[0, '#ffffff'], [0.45, '#cfe6ff'], [0.82, '#5f86bd'], [1, '#1d2f55']],
          halo: '150,220,255', haloA: 0.26,
          surface(ctx, c, br) {
            // Caps ride BOTH limbs, so a top-of-screen fragment still names the planet.
            ctx.beginPath(); ctx.ellipse(c, c - br * 0.78, br * 0.78, br * 0.3, 0, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill()
            ctx.beginPath(); ctx.ellipse(c, c + br * 0.86, br * 0.62, br * 0.24, 0, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill()
            ctx.lineCap = 'round'
            for (const [x0, y0, qx, qy, x1, y1] of [[-1, -0.3, -0.1, -0.52, 1, -0.1], [-1, 0.1, 0.05, 0.34, 1, 0.02],
              [-0.62, -1, -0.3, 0.05, -0.05, 1], [0.3, -1, 0.52, 0.1, 0.24, 1], [-1, 0.46, 0.1, 0.62, 1, 0.4]]) {
              ctx.beginPath(); ctx.moveTo(c + br * x0, c + br * y0)
              ctx.quadraticCurveTo(c + br * qx, c + br * qy, c + br * x1, c + br * y1)
              ctx.strokeStyle = 'rgba(46,74,122,0.42)'; ctx.lineWidth = br * 0.028; ctx.stroke()
              ctx.strokeStyle = 'rgba(236,248,255,0.5)'; ctx.lineWidth = br * 0.01; ctx.stroke()
            }
          },
        },
        { // D. molten — the only planet whose detail SURVIVES the terminator. That inversion is the read.
          body: [[0, '#8a4326'], [0.45, '#4a1f16'], [0.82, '#241009'], [1, '#0e0605']],
          halo: '255,110,40', haloA: 0.22,
          surface(ctx, c, br) {
            for (const [x, y, r] of [[-0.3, -0.25, 0.42], [0.32, 0.1, 0.46], [-0.05, 0.48, 0.34]]) {
              ctx.beginPath(); ctx.ellipse(c + br * x, c + br * y, br * r, br * r * 0.8, 0.4, 0, Math.PI * 2)
              ctx.fillStyle = 'rgba(12,7,6,0.45)'; ctx.fill()  // basalt plates give the crust scale
            }
          },
          emissive(ctx, c, br) {
            ctx.lineCap = 'round'; ctx.lineJoin = 'round'
            for (const path of [[[-0.95, -0.12], [-0.5, -0.28], [-0.12, -0.05], [0.3, -0.22], [0.9, -0.06]],
              [[-0.7, 0.5], [-0.28, 0.3], [0.1, 0.42], [0.55, 0.28], [0.92, 0.44]],
              [[-0.2, -0.9], [-0.05, -0.5], [-0.22, -0.1], [0, 0.35], [-0.1, 0.92]],
              [[0.45, -0.85], [0.6, -0.4], [0.42, 0], [0.66, 0.5]]]) {
              ctx.beginPath()
              path.forEach(([x, y], k) => (k ? ctx.lineTo(c + br * x, c + br * y) : ctx.moveTo(c + br * x, c + br * y)))
              ctx.strokeStyle = 'rgba(255,96,20,0.85)'; ctx.lineWidth = br * 0.038; ctx.stroke()
              ctx.strokeStyle = 'rgba(255,222,150,0.9)'; ctx.lineWidth = br * 0.012; ctx.stroke()
            }
            for (const [x, y, r] of [[-0.12, -0.06, 0.28], [0.52, 0.3, 0.22], [-0.5, 0.44, 0.18]]) {
              glowBlob(ctx, c + br * x, c + br * y, br * r, 'rgba(255,220,140,0.95)', 'rgba(255,80,20,0)')
            }
          },
        },
        { // E. ocean world — the only CURVED WHITE marks in the set, plus a specular sun glint.
          body: [[0, '#bff0ff'], [0.45, '#2f8fd8'], [0.82, '#124a86'], [1, '#07203f']],
          halo: '120,200,255', haloA: 0.28,
          surface(ctx, c, br) {
            for (const pts of [[[-0.55, -0.35], [-0.15, -0.5], [0.12, -0.28], [-0.1, -0.02], [-0.45, 0.02]],
              [[0.15, 0.08], [0.6, 0], [0.72, 0.3], [0.4, 0.52], [0.1, 0.36]],
              [[-0.7, 0.3], [-0.35, 0.28], [-0.2, 0.6], [-0.6, 0.72]]]) {
              landmass(ctx, c, br, pts, 'rgba(74,124,72,0.9)', 'rgba(180,220,150,0.35)')
            }
            ctx.lineCap = 'round'
            for (const [x, y, r, a0, a1] of [[-0.3, -0.1, 0.3, 0.4, 3.4], [-0.36, -0.1, 0.16, 1.2, 4.4],
              [0.36, 0.34, 0.26, 2.2, 5.2], [0.3, 0.3, 0.13, 3, 6], [0.1, -0.62, 0.34, 0.2, 2.6]]) {
              ctx.beginPath(); ctx.arc(c + br * x, c + br * y, br * r, a0, a1)
              ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = br * 0.07; ctx.stroke()
            }
            // Specular glint at the light focus — only a LIQUID surface does this.
            glowBlob(ctx, c - br * 0.3, c - br * 0.42, br * 0.26, 'rgba(255,255,255,0.65)', 'rgba(255,255,255,0)')
          },
        },
        { // F. night side — every other planet is alive TOWARD the star. This one is alive away from it.
          body: [[0, '#8fa8a0'], [0.45, '#3d5a55'], [0.82, '#17282c'], [1, '#070f14']],
          halo: '255,190,110', haloA: 0.16,
          surface(ctx, c, br) {
            for (const pts of [[[-0.6, -0.3], [-0.1, -0.46], [0.3, -0.2], [0.1, 0.12], [-0.5, 0.06]],
              [[0.2, 0.2], [0.66, 0.12], [0.78, 0.44], [0.34, 0.62]],
              [[-0.72, 0.36], [-0.3, 0.34], [-0.16, 0.72], [-0.66, 0.8]]]) {
              landmass(ctx, c, br, pts, 'rgba(18,32,34,0.55)', null)
            }
          },
          emissive(ctx, c, br) {
            // Gate every light on its distance from the light FOCUS rather than clipping a second
            // hemisphere — that way the lit half and the terminator can never disagree about where
            // the sun is, which a separate clip path would eventually drift out of sync with.
            const fx = c - br * 0.42, fy = c - br * 0.55
            const dot = (x, y) => {
              const px = c + br * x, py = c + br * y
              if (Math.hypot(px - fx, py - fy) < br * 1.05) return    // still in daylight
              ctx.fillRect(px, py, br * 0.014, br * 0.014)            // >= 11 device px magnified
            }
            for (const [x, y, r] of [[0.34, 0.3, 0.16], [0.58, -0.05, 0.12], [0.16, 0.62, 0.13],
              [0.62, 0.46, 0.09], [-0.05, 0.8, 0.1]]) {
              glowBlob(ctx, c + br * x, c + br * y, br * r, 'rgba(255,196,110,0.45)', 'rgba(255,160,60,0)')
            }
            ctx.fillStyle = 'rgba(255,214,150,0.95)'
            // Cities crowd coastlines, so walk fixed polylines and scatter perpendicular to them.
            for (const line of [[[0.05, 0.1], [0.3, 0.24], [0.55, 0.2], [0.72, 0.4]],
              [[0.4, -0.4], [0.56, -0.12], [0.5, 0.14], [0.62, 0.44]],
              [[-0.1, 0.5], [0.16, 0.62], [0.44, 0.66], [0.66, 0.56]],
              [[0.2, -0.66], [0.44, -0.5], [0.62, -0.2]]]) {
              for (let s = 0; s < line.length - 1; s++) {
                const [ax, ay] = line[s], [bx, by] = line[s + 1]
                for (let k = 0; k < 8; k++) {
                  const t = k / 8, jx = (k % 3 - 1) * 0.035, jy = (k % 2 ? 1 : -1) * 0.028
                  dot(ax + (bx - ax) * t + jx, ay + (by - ay) * t + jy)
                }
              }
            }
          },
        },
        { // G. ringed — the only broken silhouette, and the ring enters the screen BEFORE the planet,
          // which on a phone is the most valuable property in the set. Body shrinks to make room.
          bodyR: 0.58,
          body: [[0, '#f0e0bd'], [0.45, '#c9a86a'], [0.82, '#7a5a34'], [1, '#2e2014']],
          halo: '255,220,160', haloA: 0.16,
          surface(ctx, c, br) {
            for (const [oy, ry, al, col] of [[-0.5, 0.12, 0.14, '#ffeccb'], [-0.16, 0.15, 0.12, '#8a6740'],
              [0.2, 0.13, 0.14, '#ffe0ae'], [0.56, 0.11, 0.12, '#6d5030']]) {
              ctx.beginPath(); ctx.ellipse(c, c + br * oy, br, br * ry, 0, 0, Math.PI * 2)
              ctx.fillStyle = col; ctx.globalAlpha = al; ctx.fill()
            }
            ctx.globalAlpha = 1
          },
          behind(ctx, c, R) { ringAnnulus(ctx, c, R, 'far') },
          front(ctx, c, R, br) {
            ringAnnulus(ctx, c, R, 'near')
            ctx.save(); ctx.beginPath(); ctx.arc(c, c, br, 0, Math.PI * 2); ctx.clip()
            ctx.beginPath(); ctx.ellipse(c, c + br * 0.1, R * 0.98, R * 0.055, RING_TILT, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(6,4,14,0.45)'; ctx.fill()   // the ring's own shadow on the body
            ctx.restore()
          },
        },
        { // H. rust desert — the driest thing here: no water, no ice, one dust-hazed sky.
          body: [[0, '#f0c396'], [0.5, '#b8703f'], [0.84, '#6d3c22'], [1, '#33190f']],
          halo: '255,170,110', haloA: 0.14,
          surface(ctx, c, br) {
            for (const [x, y, rx, ry, rot, al] of [[-0.3, -0.3, 0.5, 0.3, 0.4, 0.22],
              [0.34, 0.1, 0.42, 0.26, -0.3, 0.18], [-0.1, 0.52, 0.46, 0.22, 0.2, 0.2]]) {
              ctx.beginPath(); ctx.ellipse(c + br * x, c + br * y, br * rx, br * ry, rot, 0, Math.PI * 2)
              ctx.fillStyle = '#8c4d29'; ctx.globalAlpha = al; ctx.fill()
            }
            ctx.globalAlpha = 1
            ctx.lineCap = 'round'
            // Canyons: the one hard-edged mark on an otherwise hazy body, so it still reads as rock.
            for (const path of [[[-0.9, 0.1], [-0.4, 0.02], [0.1, 0.22], [0.7, 0.12]],
              [[-0.5, -0.6], [-0.2, -0.3], [-0.3, 0.1]],
              [[0.2, -0.8], [0.42, -0.4], [0.3, 0.04], [0.5, 0.5]]]) {
              ctx.beginPath()
              path.forEach(([x, y], k) => (k ? ctx.lineTo(c + br * x, c + br * y) : ctx.moveTo(c + br * x, c + br * y)))
              ctx.strokeStyle = 'rgba(74,35,18,0.55)'; ctx.lineWidth = br * 0.035; ctx.stroke()
              ctx.strokeStyle = 'rgba(255,206,160,0.3)'; ctx.lineWidth = br * 0.012; ctx.stroke()
            }
          },
        },
        { // I. toxic — the sickly one. Sulphur yellows nothing else in the set uses.
          body: [[0, '#e8ff9e'], [0.45, '#93b83c'], [0.82, '#43601f'], [1, '#1a2810']],
          halo: '180,255,90', haloA: 0.3,
          surface(ctx, c, br) {
            ctx.lineCap = 'round'
            // Churning cloud bands, drawn as thick open arcs so the whole surface looks like it moves.
            for (const [x, y, r, a0, a1, col, lw] of [[-0.2, -0.3, 0.5, 0.2, 3.6, 'rgba(226,255,150,0.45)', 0.12],
              [0.3, 0.2, 0.44, 2.4, 5.6, 'rgba(120,160,50,0.5)', 0.14], [-0.1, 0.55, 0.4, 3.4, 6.1, 'rgba(226,255,150,0.35)', 0.1],
              [0.1, -0.68, 0.36, 0.6, 3.0, 'rgba(140,190,60,0.45)', 0.11]]) {
              ctx.beginPath(); ctx.arc(c + br * x, c + br * y, br * r, a0, a1)
              ctx.strokeStyle = col; ctx.lineWidth = br * lw; ctx.stroke()
            }
            for (const [x, y, r] of [[0.24, -0.22, 0.16], [-0.42, 0.28, 0.12]]) {
              glowBlob(ctx, c + br * x, c + br * y, br * r, 'rgba(238,255,170,0.6)', 'rgba(200,255,120,0)')
            }
          },
        },
        { // J. storm — deep blue with white cyclones. The only body whose features are SPIRALS.
          body: [[0, '#cfe0ff'], [0.45, '#3f5db8'], [0.82, '#1b2a63'], [1, '#0a1030']],
          halo: '150,180,255', haloA: 0.24,
          surface(ctx, c, br) {
            ctx.lineCap = 'round'
            for (const [cx, cy, rr] of [[-0.28, -0.24, 0.34], [0.34, 0.22, 0.28], [0.06, 0.66, 0.2], [0.5, -0.44, 0.18]]) {
              // Each cyclone is three tightening arcs — a spiral without a spiral primitive.
              for (let k = 0; k < 3; k++) {
                ctx.beginPath()
                ctx.arc(c + br * cx, c + br * cy, br * rr * (1 - k * 0.28), k * 1.9, k * 1.9 + 4.1)
                ctx.strokeStyle = `rgba(238,246,255,${0.28 + k * 0.16})`
                ctx.lineWidth = br * (0.05 - k * 0.008); ctx.stroke()
              }
              glowBlob(ctx, c + br * cx, c + br * cy, br * rr * 0.3, 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0)')
            }
          },
        },
      ]
      // Parallel arrays indexed by variant: the lat/long albedo, its emissive twin, the two
      // off-sphere overlays, the body radius the mesh scales to, and the rim colour.
      // `spin` is gone — every archetype turns now, the ringed one included: a ring does not follow
      // its planet's rotation, so the annulus simply stays a still sprite while the body turns
      // inside it, which is what a real ringed world does.
      T.planetMaps = PLANET_ARCHETYPES.map((a) => planetMapTex(a, false))
      T.planetEmitNone = canvasTex(1, 1, () => {})   // fully transparent: adds nothing
      T.planetEmits = PLANET_ARCHETYPES.map((a) => (a.emissive ? planetMapTex(a, true) : T.planetEmitNone))
      T.planetBehind = PLANET_ARCHETYPES.map((a) => (a.behind ? planetOverlayTex(a, false) : null))
      T.planetFront = PLANET_ARCHETYPES.map((a) => (a.halo || a.front ? planetOverlayTex(a, true) : null))
      T.planetBodyR = PLANET_ARCHETYPES.map((a) => a.bodyR ?? PLANET_BODY)
      // Rim colour comes straight off the archetype's own atmosphere, so the limb glow and the halo
      // sprite around it are the same hue. The moon has no atmosphere and gets a black rim — which
      // is correct, not a gap: an airless body has no limb glow, and that is its whole read.
      T.planetAtmo = PLANET_ARCHETYPES.map((a) => {
        if (!a.halo) return new Float32Array([0, 0, 0])
        const k = a.haloA * 2.2   // haloA is tuned for a 2D alpha fade; the rim is an ADD, so it needs lifting
        return new Float32Array(a.halo.split(',').map((n) => (Number(n) / 255) * k))
      })
      T.planetTints = PLANET_TINTS
    }
    {
      // house (suburbs district, skies — v5.7.x): the one hand-drawn suburbs prop besides the
      // fence (the district's "car" reuses T.car below, already drawn for the city's traffic
      // lanes). Low box + pitched roof, one door, one window. Upright, origin at the base.
      const g = new Graphics()
      const wall = 0xc9b08a
      const roof = 0x7a4a3a
      const line = 0x3a2a1e
      g.rect(-20, -26, 40, 26).fill(wall).stroke({ width: 2, color: line })          // wall block
      g.poly([-24, -26, 0, -44, 24, -26]).fill(roof).stroke({ width: 2, color: line }) // pitched roof
      g.rect(-5, -14, 10, 14).fill(0x4a3324).stroke({ width: 1.4, color: line })     // door
      g.rect(9, -20, 8, 8).fill(0x8fc4e0).stroke({ width: 1.2, color: line })        // window
      g.rect(-24, -26, 48, 3).fill({ color: 0x000000, alpha: 0.18 })                 // eave shadow
      g.poly([-24, -26, 0, -44, -12, -40]).fill({ color: 0x9a6a52, alpha: 0.35 })    // lit roof face
      T.house = bake(g)
    }
    {
      // picket fence (suburbs district, skies): three posts + two rails, origin at the base.
      const g = new Graphics()
      const wood = 0xc4b190
      const line = 0x5a4c34
      for (const x of [-18, 0, 18]) g.rect(x - 2, -20, 4, 20).fill(wood).stroke({ width: 1.4, color: line })
      g.rect(-20, -16, 40, 4).fill(wood).stroke({ width: 1.2, color: line })
      g.rect(-20, -7, 40, 4).fill(wood).stroke({ width: 1.2, color: line })
      T.fence = bake(g)
    }
    // ---- pier kind props (sea district, skies — v5.8 kaiju redesign) ----------------------------
    // Sea's obstacle skin used to be a plain rock (a low-effort placeholder — see the sea entry's
    // ponytail note in DISTRICT_BIOMES below); now it's crushable dock furniture, same "flat baked
    // vector" idiom as every other structure kind. All three are drawn top-down and MASS-CENTRED —
    // like rubble/rockChunk/asteroid, not base-anchored like house/hydrant — because they read as
    // things floating/sitting ON open water, not planted upright on ground.
    {
      // jetty: a short wooden dock plank on pilings.
      const g = new Graphics()
      const wood = 0xa9835a
      const line = 0x4a3420
      g.poly([-26, -7, 20, -9, 26, -1, 22, 8, -22, 9, -27, 1]).fill(wood).stroke({ width: 1.8, color: line }) // deck planking
      g.beginPath() // plank seams
      for (let x = -16; x <= 12; x += 8) g.moveTo(x, -8).lineTo(x - 1.5, 8.5)
      g.stroke({ width: 1, color: line, alpha: 0.4 })
      for (const [x, y] of [[-19, 8], [0, 9], [17, 6]]) g.rect(x - 2, y, 4, 7).fill({ color: 0x2e2216, alpha: 0.65 }) // pilings, dipping below the deck into the water
      g.poly([-24, -8, 18, -9, 22, -2, -20, -1]).fill({ color: 0xceac7f, alpha: 0.35 }) // lit top face
      T.jetty = bake(g)
    }
    {
      // boat: a small wooden rowboat, drifted loose.
      const g = new Graphics()
      const hull = 0x8a5a3a
      const line = 0x3f2a18
      g.poly(spineOutline((t) => [-19 + t * 38, 0], (t) => 9.5 * bulge(0.05 + 0.9 * t, 0.55), 20))
        .fill(hull).stroke({ width: 1.8, color: line })                                          // hull
      g.poly(spineOutline((t) => [-12 + t * 24, 0], (t) => 5.2 * bulge(0.08 + 0.84 * t, 0.5), 14))
        .fill({ color: 0x5f6f52, alpha: 0.85 }).stroke({ width: 1.2, color: line })               // open well
      g.beginPath().moveTo(0, -5.2).lineTo(0, 5.2).stroke({ width: 1.4, color: line, alpha: 0.6 }) // centre thwart
      g.ellipse(-2, -3, 8, 2.6).fill({ color: 0xc9a578, alpha: 0.4 })                              // lit gunwale
      T.boat = bake(g)
    }
    {
      // buoy: a small striped mooring float bobbing on the water.
      const g = new Graphics()
      const red = 0xd8452f
      const line = 0x6e2318
      g.circle(0, 0, 9).fill(red).stroke({ width: 1.6, color: line })
      g.poly([-9, -2, 9, -2, 9, 2, -9, 2]).fill({ color: 0xf2ece0, alpha: 0.9 }) // white stripe band
      g.circle(0, -9, 2.4).fill(red).stroke({ width: 1.2, color: line })        // top nub
      g.ellipse(-3, -3, 3, 2).fill({ color: 0xffffff, alpha: 0.4 })             // sheen
      T.buoy = bake(g)
    }
    // ---- barn/silo kind props (farms district, skies — v5.9 top-down region overhaul) ----------
    // Same hand-drawn baked-vector idiom as T.house right above: solid fill, dark outline, one lit
    // face. Upright, base-anchored (STRUCTURE_KINDS' 'barn'/'silo', config.js).
    {
      // barn: a low wall block under a gambrel roof, hay-loft door on the gable end.
      const g = new Graphics()
      const wall = 0x9c3f30
      const roof = 0x5a3226
      const line = 0x2e1a14
      g.rect(-26, -30, 52, 30).fill(wall).stroke({ width: 2.2, color: line })                       // wall block
      g.poly([-30, -30, -14, -46, 0, -38, 14, -46, 30, -30]).fill(roof).stroke({ width: 2.2, color: line }) // gambrel roof
      g.rect(-8, -16, 16, 16).fill(0x2e1a14).stroke({ width: 1.6, color: line })                    // hay-loft door
      g.rect(-30, -30, 60, 3).fill({ color: 0x000000, alpha: 0.2 })                                 // eave shadow
      g.poly([-30, -30, -14, -46, -20, -42]).fill({ color: 0xc06a52, alpha: 0.35 })                 // lit roof face
      T.barn = bake(g)
    }
    {
      // silo: a narrow cylinder under a faceted dome, ring seams down the body.
      const g = new Graphics()
      const metal = 0xc7c9cc
      const line = 0x53565a
      g.rect(-11, -40, 22, 40).fill(metal).stroke({ width: 2, color: line })                        // body
      g.poly([-11, -40, 0, -54, 11, -40]).fill(0xa7aaad).stroke({ width: 2, color: line })           // domed cap
      for (let y = -34; y <= -6; y += 8) {
        g.beginPath().moveTo(-11, y).lineTo(11, y).stroke({ width: 1, color: line, alpha: 0.35 })    // ring seams
      }
      g.rect(-11, -40, 6, 40).fill({ color: 0xffffff, alpha: 0.22 })                                 // lit left flank
      g.rect(5, -40, 6, 40).fill({ color: 0x000000, alpha: 0.18 })                                   // shaded right flank
      T.silo = bake(g)
    }
    {
      // tractor (farms): a boxy cab + oversized rear wheels, nose +x — same top-down vehicle
      // idiom as T.car (below) but boxier, slower-looking, farm green. Reuses PROP_SCALE.car's
      // band (a working vehicle, same tier as a parked car) rather than getting its own class.
      const g = new Graphics()
      const body = 0x5a8f3d
      const line = 0x2e4a1e
      g.rect(-6, -9, 20, 18).fill(body).stroke({ width: 2, color: line })                            // body/cab block
      g.rect(10, -6, 8, 12).fill({ color: 0x2b3a4a, alpha: 0.85 }).stroke({ width: 1.4, color: line }) // cab glass
      for (const s of [-1, 1]) {
        g.circle(-8, s * 10, 6).fill(0x232323).stroke({ width: 1.6, color: line })                   // big rear wheels
        g.circle(12, s * 7, 3.4).fill(0x232323).stroke({ width: 1.2, color: line })                  // small front wheels
      }
      g.ellipse(0, -3, 10, 4).fill({ color: 0x86c25a, alpha: 0.3 })                                  // lit flank
      T.tractor = bake(g)
    }
    {
      // crop tuft (farms): the "crop row" signature prop — a tiny fan of blades drawn ALONG +x so
      // applyPropKind's cropRow branch (rotation locked to the field's shared row angle, see
      // farmRowSnap below) lays it flat along the furrow instead of spinning freely like every
      // other top-down scatter prop. Filled white so kind.tints drives the colour per instance
      // (golden wheat / green leaf-row / tilled-brown row — CROP_TINTS below, darkened v5.11 —
      // see that array's own comment).
      // v5.11: a low-alpha soil patch drawn FIRST, visible only in the gaps BETWEEN the opaque
      // blades — that two-tone (bright blade / dark soil peeking through) is the actual "furrow"
      // texture a single flat-alpha silhouette never had, at zero extra draw calls per instance
      // (still one bake). Bring-the-value-down half of the fix is CROP_TINTS itself.
      const g = new Graphics()
      g.ellipse(0, 1, 7, 3.4).fill({ color: 0x000000, alpha: 0.22 })
      for (const [dy, len] of [[-2.6, 9], [0, 11], [2.6, 8.5]]) {
        taperStroke(g, [[-len * 0.4, dy], [len * 0.6, dy * 0.4]], 2.4, 0.6, 0xffffff, 3)
      }
      g.ellipse(-3, 0, 3, 2).fill({ color: 0xffffff, alpha: 0.55 }) // base clump
      T.cropTuft = bake(g)
    }
    {
      // hay bale (farms): a round baled bundle, top-down — a filled disc with wrap-line chords.
      // Spins freely (not upright), like puddle/asteroid.
      const g = new Graphics()
      const straw = 0xc9a94a
      const line = 0x8a6f2e
      g.circle(0, 0, 11).fill(straw).stroke({ width: 1.6, color: line })
      for (const a of [-0.6, 0, 0.6]) {
        g.beginPath().moveTo(Math.cos(a + 1.2) * 11, Math.sin(a + 1.2) * 11)
        g.lineTo(Math.cos(a - 1.9) * 11, Math.sin(a - 1.9) * 11).stroke({ width: 1, color: line, alpha: 0.5 })
      }
      g.ellipse(-3, -3, 4, 3).fill({ color: 0xe8cf8a, alpha: 0.5 })
      T.hayBale = bake(g)
    }
    {
      // elevation contour (hills district, skies): elevation read from directly overhead as soft
      // concentric shading bands, NOT a side-view hill silhouette — a bump drawn in profile would
      // read as floating debris from this camera angle. Same "value over silhouette" trick the
      // rockChunk/asteroid props already use for their lit/shaded faces, just pushed further: soft
      // alpha ellipses, lightest at the crest, a darker downslope shadow on one side.
      const g = new Graphics()
      const hi = 0xcabb96
      const lo = 0x6b5a44
      g.ellipse(0, 0, 90, 62).fill({ color: hi, alpha: 0.16 })
      g.ellipse(-6, -5, 62, 42).fill({ color: hi, alpha: 0.20 })
      g.ellipse(-10, -8, 34, 22).fill({ color: hi, alpha: 0.26 })
      g.ellipse(18, 20, 46, 28).fill({ color: lo, alpha: 0.18 }) // shaded downslope
      T.contour = bake(g)
    }
    // ---- road strips (skies only, v5.9 top-down region overhaul) --------------------------------
    // A plain asphalt bar baked at a REF=100 unit square, long axis along +x, pad=0 so the bake's
    // bounds are EXACTLY the REF square (no stroke overhang to pad for) — that's what lets
    // populateRoad below set scale.set(len/REF, width/REF) and land on an EXACT target length/width,
    // same "bake at a reference measurement, scale to a live target" idiom as T.obFoot's footprint
    // ring above. roadAt (config.js) returns angle 0 for an east-west street (runs along x), PI/2
    // for north-south — matching this bar's own "long axis = +x, rotate by `angle`" convention.
    // v5.10 art direction (spec §4.2): the two carriageway tiles are now baked by
    // buildSkiesTextures() below — kerb lines, wet crown sheen, wheel-polish bands, a dashed
    // centreline at a pitch pre-compensated for the tile's non-uniform stamp scale, double yellow
    // on avenues — with everything that has a SHAPE (manholes, patches, arrows, crosswalks) split
    // out onto uniformly-scaled decal/junction sprites. They are declared there and nowhere else.
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
    // ---- voxel boulder (hills district, skies — v5.9.1 art experiment) ------------------------
    // "the 'rocks'?? asset is just ugly" (playtest report). T.rockChunk right above is kept EXACTLY
    // as-is — it still does its other job (run.lobs, the kaiju's thrown masonry) untouched — this
    // is a SEPARATE bake, used ONLY by the hills district's BIG_HILLS/MID_HILLS/DETAIL_HILLS tables
    // below, so reverting this experiment (if it doesn't earn its keep) is a small diff: those three
    // array entries plus deleting this block, nothing else in the file to touch.
    // Hand-drawn faux-voxel, not an imported/generated asset (the ask): blocky cube-like forms,
    // flat colour fills with NO gradients, hard-stroked edges between every face, and ONE light
    // direction reused byte-for-byte on every cube in every variant — the bare top-face fill is
    // lightest, a thin RIGHT-edge strip one step darker (a lit side face), a thin BOTTOM-edge strip
    // darkest (the face in full shadow). Light-from-upper-left matches this file's other upright
    // buildings (T.silo's lit-left/shaded-right flank, T.house/T.barn's lit-left roof face, all
    // above) — the closest thing this codebase has to an established sun direction. Top-down, not
    // isometric: the bevel strips are thin slivers of the SAME top-down rect, not a rotated 3/4 view
    // — this is the same "mostly the top face, a thin flank strip for volume" convention T.silo/
    // T.house/T.barn already use, just with hard flat facets instead of soft alpha shading.
    // Consistency demands every cube stay AXIS-ALIGNED (no per-cube rotation): the shading is
    // computed in this shape's own local space, so rotating a cube would rotate its shading with it
    // — exactly the "inconsistent lighting reads as wrong" trap the brief warns about. Irregularity
    // instead comes from varying each cube's size/offset only, several overlapping per variant. For
    // the same reason the district tables below mark every voxelRock kind `upright: true` — NOT
    // because a boulder is base-anchored (it's mass-centred, like every other top-down scatter rock
    // here), but because `upright` is applyPropKind's only lever for "small rotation jitter, not a
    // full spin" — seeing this whole field with every boulder's lighting pointing the same way is
    // the entire point, so full spin (this file's default for top-down scatter) is not an option.
    {
      function voxelCube(g, cx, cy, w, h, top, mid, dark, line) {
        const bevel = Math.min(w, h) * 0.22 // side-face thickness — thin: mostly-overhead, not a side view
        g.rect(cx - w / 2, cy - h / 2, w, h).fill(top).stroke({ width: 1.6, color: line })
        g.rect(cx + w / 2 - bevel, cy - h / 2, bevel, h).fill(mid).stroke({ width: 1.2, color: line })  // right face: lit side
        g.rect(cx - w / 2, cy + h / 2 - bevel, w, bevel).fill(dark).stroke({ width: 1.2, color: line }) // bottom face: shadow side
      }
      function bakeVoxel(draw) {
        const g = new Graphics()
        draw(g)
        return bake(g)
      }
      const ROCK_TOP = 0x9aa0a8, ROCK_MID = 0x7d838c, ROCK_DARK = 0x565c64, ROCK_LINE = 0x363b41
      // A: one big single block, with a smaller chip stacked at a corner to break up the rectangle
      T.voxelRockA = bakeVoxel((g) => {
        voxelCube(g, 0, 0, 46, 40, ROCK_TOP, ROCK_MID, ROCK_DARK, ROCK_LINE)
        voxelCube(g, 16, -14, 16, 14, ROCK_TOP, ROCK_MID, ROCK_DARK, ROCK_LINE)
      })
      // B: two merged blocks, an L-shaped pair
      T.voxelRockB = bakeVoxel((g) => {
        voxelCube(g, -10, 0, 34, 30, ROCK_TOP, ROCK_MID, ROCK_DARK, ROCK_LINE)
        voxelCube(g, 16, 10, 26, 22, ROCK_TOP, ROCK_MID, ROCK_DARK, ROCK_LINE)
      })
      // C: three small blocks, a loose scattered pile
      T.voxelRockC = bakeVoxel((g) => {
        voxelCube(g, -14, -6, 22, 20, ROCK_TOP, ROCK_MID, ROCK_DARK, ROCK_LINE)
        voxelCube(g, 10, -10, 18, 16, ROCK_TOP, ROCK_MID, ROCK_DARK, ROCK_LINE)
        voxelCube(g, 2, 14, 20, 17, ROCK_TOP, ROCK_MID, ROCK_DARK, ROCK_LINE)
      })
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

  // ==============================================================================================
  // SKIES ART DIRECTION (v5.10) — bakes
  // docs/superpowers/specs/2026-07-25-skies-art-direction.md
  // ==============================================================================================
  // Everything in here is baked ONCE and pooled as sprites; nothing below is ever constructed per
  // frame. It is also entirely skies-scoped: every texture is read only from a code path gated on
  // chapterHasStorm / chapterHasDistricts / chapterHasRoads, so no other chapter can see it.
  //
  // THE SHADOW LAW (spec §5.1.2). Every structure plan bakes its own cast shadow at ONE constant
  // offset for the whole region (SKIES_SHADOW). One light direction across an entire region is the
  // cheapest, strongest "this is a photograph of a place" cue there is. It also SHIFTS the bake's
  // bounds, and therefore bake()'s returned anchor — which is exactly the v5.9.2 "sprites sitting
  // off their colliders" bug class. skiesPlan() below draws a symmetric zero-alpha BOUNDS KEEPER
  // first, so ax/ay come out at exactly 0.5 no matter what the shadow does.
  const SKB = SKIES_BAKE_PX / 2      // 64 — half the plan canvas; the bounds keeper's half-extent
  const SKR = 46                     // content half-extent: SKR + shadow offset must stay under SKB
  const SH_DX = SKIES_SHADOW.dx * SKR
  const SH_DY = SKIES_SHADOW.dy * SKR
  const SH_COL = SKIES_SHADOW.color
  const SH_A = SKIES_SHADOW.alpha
  // How wide a plan's CONTENT (2 x SKR) is drawn, as a multiple of the collider radius o.r. The
  // spec's starting point was 1.9 x o.r measured across the whole 128px canvas, which put a house
  // at ~24px on screen — too small for six shingle courses and a lit dormer pane to survive, i.e.
  // it threw away the detail this whole pass exists to add. 2.6 puts a house at 29-42px, a barn or
  // silo at 48-66 and a tower at 63-96, against a 44px player: you still tower over a house, which
  // is the v5.8 kaiju premise, but a downtown block is genuinely big enough to look at. 3.0 is also
  // the ceiling: streamObstacles keeps structure centres >= 2*maxR + 40 = 104px apart, so a bigger
  // multiplier would let the largest towers visibly overlap — the v5.9.2 "wall of blobs" report.
  const SKIES_PLAN_SCALE = 3.0

  function skiesPlan(draw) {
    const g = new Graphics()
    g.rect(-SKB, -SKB, SKB * 2, SKB * 2).fill({ color: 0x000000, alpha: 0 }) // bounds keeper (see above)
    draw(g)
    return bake(g, 0)
  }
  // A canvas-gradient texture (the T.blotches / stormBlob idiom): the only way to get a real
  // feathered falloff, which is what an additive light needs to not look like a cardboard cutout.
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    draw(c.getContext('2d'), w, h)
    return Texture.from(c)
  }

  function buildSkiesTextures() {
    // ---- structure plans (spec §5) -----------------------------------------------------------
    // All six kinds redrawn as TOP-DOWN PLANS. They were side-view, upright, base-anchored bakes
    // under a top-down camera, which is the whole reason "a house is a box plus a triangle".
    // Detail counts come from SKIES_STRUCTURE_ART and are not decorative: in kaiju fiction scale is
    // communicated by the DENSITY OF SMALL DETAIL around the monster, so "some windows" bakes as a
    // smear and "a 4x6 grid, 11 lit" bakes as a building.
    const A = SKIES_STRUCTURE_ART

    // window run helper: lays `n` 3x4 panes along a flank strip, `lit` of them warm. The lit/dark
    // split is a fixed pattern, not a roll, so the two variants differ by DESIGN (that is how
    // "window flicker" is faked with zero per-frame Graphics — spec §5.2).
    function panes(g, x0, y0, dx, dy, n, litEvery, art) {
      for (let k = 0; k < n; k++) {
        const lx = x0 + dx * k, ly = y0 + dy * k
        const lit = (k % litEvery) === 0
        g.rect(lx, ly, 3, 4).fill(lit ? art.windowLit : art.windowDark)
      }
    }

    // v5.11 ("no building etc", playtest report). The v5.10 tower had exactly two variants and BOTH
    // used the same fixed 36x30 footprint, so a whole downtown block was one silhouette repeated —
    // at a glance the city read as tiled wallpaper rather than as buildings. Variety in ROOF
    // FURNITURE alone could not fix that: from directly overhead the thing that distinguishes one
    // building from the next is its FOOTPRINT, because that is the shape you actually see. So a
    // variant now carries its own proportions (a narrow slab, a wide low block, a square tower) as
    // well as its own roof, and there are five of them instead of two.
    //
    // Every plan still bakes into the same 128px canvas through skiesPlan's bounds keeper, so a
    // smaller footprint genuinely reads as a smaller building on screen rather than being rescaled
    // back up to fill the frame.
    const TOWER_VARIANTS = [
      { W: 36, H: 30, roof: 'tank',      litEvery: 2 },   // the v5.10 variant A, unchanged
      { W: 36, H: 30, roof: 'helipad',   litEvery: 3 },   // the v5.10 variant B, unchanged
      { W: 22, H: 44, roof: 'cooling',   litEvery: 2 },   // narrow slab, long axis N-S
      { W: 45, H: 21, roof: 'skylights', litEvery: 4 },   // wide low block — a warehouse or a mall
      { W: 30, H: 31, roof: 'garden',    litEvery: 3 },   // square, with a planted roof
    ]

    function towerPlan(v) {
      const vb = A.tower.variantB
      return skiesPlan((g) => {
        const W = v.W, H = v.H, ch = A.tower.chamferPx * 0.55
        // roof deck outline, TWO corners chamfered — a chamfer reads as a designed building; a
        // rounded blob reads as rubble, which is precisely the bug being fixed.
        const deck = [
          -W + ch, -H, W, -H, W, H - ch, W - ch, H, -W, H, -W, -H + ch,
        ]
        const shadow = deck.map((val, i) => val + (i % 2 ? SH_DY : SH_DX))
        g.poly(shadow).fill({ color: SH_COL, alpha: SH_A })
        // flank walls: the +x and +y sides, carrying the window grid (a top-down building shows a
        // sliver of its own facade on the two faces the light does not reach)
        g.poly([W, -H, W + 12, -H + 7, W + 12, H - ch + 7, W, H - ch]).fill(A.tower.flank)
        g.poly([-W, H, -W + 7, H + 12, W - ch + 7, H + 12, W - ch, H]).fill(A.tower.flank)
        g.poly(deck).fill(A.tower.deck).stroke({ width: 1.6, color: A.tower.edge })
        g.poly([-W + ch + 3, -H + 3, W - 3, -H + 3, W - 3, H - ch - 3, -W + 3, H - 3])
          .stroke({ width: 1.2, color: A.tower.parapet, alpha: 0.75 })   // inner parapet ledge
        // gravel flecks — fixed-hash, the texture that says "tar-and-gravel roof". Count scales
        // with the deck area so a wide block is not sparser than a narrow one.
        const flecks = Math.round(A.tower.gravelFlecks * (W * H) / (36 * 30))
        for (let k = 0; k < flecks; k++) {
          const gx = (hash(k * 3.71 + 0.9) - 0.5) * (W - 5) * 2
          const gy = (hash(k * 5.13 + 2.7) - 0.5) * (H - 5) * 2
          g.circle(gx, gy, A.tower.gravelPx / 2).fill({ color: A.tower.gravel, alpha: A.tower.gravelAlpha })
        }
        // HVAC units: box on a dark plinth, 5 fin hairlines, a fan disc with 4 blade ticks. Placed
        // in deck-relative fractions so they land on the roof whatever its proportions are.
        const units = [[-0.55, -0.5, 0.6, 0.45], [0.1, 0.35, 0.45, 0.36]]
        for (const [fx0, fy0, fw, fh] of units) {
          const ux = fx0 * W, uy = fy0 * H, uw = Math.max(10, fw * W), uh = Math.max(8, fh * H * 0.8)
          g.rect(ux - 1.5, uy - 1.5, uw + 3, uh + 3).fill(A.tower.hvacBase)
          g.rect(ux, uy, uw, uh).fill(A.tower.hvac).stroke({ width: 0.8, color: A.tower.hvacBase })
          for (let f = 1; f <= A.tower.hvacFins; f++) {
            const fx = ux + (uw * f) / (A.tower.hvacFins + 1)
            g.moveTo(fx, uy + 1.5).lineTo(fx, uy + uh - 1.5).stroke({ width: 0.7, color: A.tower.hvacBase, alpha: 0.8 })
          }
          g.circle(ux + uw - 5, uy + uh / 2, 4).fill(A.tower.hvacBase)
          for (let b = 0; b < 4; b++) {
            const ba = (b / 4) * Math.PI * 2 + 0.4
            g.moveTo(ux + uw - 5, uy + uh / 2)
              .lineTo(ux + uw - 5 + Math.cos(ba) * 3.4, uy + uh / 2 + Math.sin(ba) * 3.4)
              .stroke({ width: 0.7, color: A.tower.hvac })
          }
        }
        // stairwell penthouse, with its OWN cast shadow at the region offset
        const sw = Math.min(20, W * 0.55), sh = Math.min(16, H * 0.5)
        g.rect(W * 0.28 + 3, -H * 0.2 + 4, sw, sh).fill({ color: SH_COL, alpha: SH_A * 0.8 })
        g.rect(W * 0.28, -H * 0.2, sw, sh).fill(A.tower.stairwell).stroke({ width: 1, color: A.tower.edge })
        g.rect(W * 0.28 + 3, -H * 0.2 + sh * 0.5, 6, sh * 0.45).fill(A.tower.stairDoor)

        if (v.roof === 'helipad') {
          // white circle + an 'H' of three bars. Nothing else on a roof looks like this.
          g.circle(-W * 0.33, H * 0.27, vb.helipadR).stroke({ width: 2, color: 0xffffff, alpha: vb.helipadAlpha })
          g.rect(-W * 0.5, H * 0.03, 2.4, 14).fill({ color: 0xffffff, alpha: vb.helipadAlpha })
          g.rect(-W * 0.22, H * 0.03, 2.4, 14).fill({ color: 0xffffff, alpha: vb.helipadAlpha })
          g.rect(-W * 0.5, H * 0.23, W * 0.28, 2.4).fill({ color: 0xffffff, alpha: vb.helipadAlpha })
        } else if (v.roof === 'tank') {
          // water tank on legs, with a rung ladder up its flank
          for (const lx of [-W * 0.83, -W * 0.5]) for (const ly of [H * 0.13, H * 0.47]) g.rect(lx, ly, 2, 4).fill(A.tower.edge)
          g.circle(-W * 0.66, H * 0.2, 9).fill(A.tower.waterTank).stroke({ width: 1.2, color: A.tower.edge })
          for (let r = 0; r < A.tower.tankRungs; r++) {
            g.rect(-W * 0.75, -1 + r * 2.2, 6, 0.8).fill({ color: A.tower.edge, alpha: 0.75 })
          }
        } else if (v.roof === 'cooling') {
          // three cooling drums in a row down the slab's long axis — the industrial read, and the
          // only roof here whose furniture is repeated identical units, which is what plant is.
          for (let k = 0; k < 3; k++) {
            const cy2 = -H * 0.5 + k * H * 0.42
            g.circle(-W * 0.25 + 4, cy2 + 4, 7).fill({ color: SH_COL, alpha: SH_A * 0.8 })
            g.circle(-W * 0.25, cy2, 7).fill(A.tower.hvac).stroke({ width: 1, color: A.tower.edge })
            for (let f = 0; f < 6; f++) {
              const fa = (f / 6) * Math.PI * 2
              g.moveTo(-W * 0.25 + Math.cos(fa) * 3, cy2 + Math.sin(fa) * 3)
                .lineTo(-W * 0.25 + Math.cos(fa) * 6.4, cy2 + Math.sin(fa) * 6.4)
                .stroke({ width: 0.8, color: A.tower.hvacBase })
            }
          }
        } else if (v.roof === 'skylights') {
          // a grid of pale glazed panels, faintly lit from inside — the wide-block signature, and
          // the one roof that puts light INSIDE the footprint instead of at its edge.
          for (let r = 0; r < 2; r++) {
            for (let k = 0; k < 4; k++) {
              const gx = -W * 0.62 + k * W * 0.35, gy = -H * 0.3 + r * H * 0.5
              g.rect(gx + 2, gy + 2, 13, 8).fill({ color: SH_COL, alpha: SH_A * 0.7 })
              g.rect(gx, gy, 13, 8).fill({ color: A.tower.windowLit, alpha: 0.5 }).stroke({ width: 0.9, color: A.tower.edge })
            }
          }
        } else {
          // planted roof: irregular canopy patches and a pale path threading them. Green on a roof
          // is rare enough that one of these per block reads instantly as a different building.
          for (let k = 0; k < 7; k++) {
            const gx = (hash(k * 4.3 + 1.7) - 0.5) * (W - 8) * 1.7
            const gy = (hash(k * 6.1 + 3.3) - 0.5) * (H - 8) * 1.7
            g.circle(gx, gy, 4 + hash(k * 2.9) * 5).fill({ color: 0x4e6b46, alpha: 0.85 })
          }
          g.moveTo(-W * 0.7, H * 0.3).bezierCurveTo(-W * 0.2, -H * 0.1, W * 0.2, H * 0.35, W * 0.6, -H * 0.2)
            .stroke({ width: 3, color: A.tower.parapet, alpha: 0.55 })
        }

        // antenna mast + 3 guy wires + the DARK aviation-lamp bead (the LIT lamp is a separate
        // pooled blink sprite — a blinking light is the one thing that cannot bake; see §7.4)
        const mx = W - 8, my = -H + 6
        g.moveTo(mx, my).lineTo(mx, my - A.tower.mastPx).stroke({ width: 1.5, color: A.tower.mast })
        for (let w = 0; w < A.tower.guyWires; w++) {
          const wa = -Math.PI * 0.85 + (w / (A.tower.guyWires - 1)) * Math.PI * 0.7
          g.moveTo(mx, my - A.tower.mastPx)
            .lineTo(mx + Math.cos(wa) * 14, my + Math.sin(wa) * 6 + 8)
            .stroke({ width: 0.7, color: A.tower.mast, alpha: 0.7 })
        }
        g.circle(mx, my - A.tower.mastPx, 1.6).fill(A.tower.lampDark)
        // window grid on the two flank slivers — palette law 1's ONLY permitted form for warm gold
        // (a static <= 5px lit rectangle). Run lengths follow the flank they sit on, so a wide block
        // gets a long row of windows on its south face and a short one on its east.
        const vRun = Math.max(3, Math.round((H * 2 - 12) / 7))
        const hRun = Math.max(3, Math.round((W * 2 - 12) / 8))
        panes(g, W + 2, -H + 9, 0, 7, vRun, v.litEvery, A.tower)
        panes(g, W + 6.5, -H + 12, 0, 7, vRun - 1, v.litEvery + 1, A.tower)
        panes(g, -W + 9, H + 3, 8, 0, hRun, v.litEvery, A.tower)
        panes(g, -W + 13, H + 7.5, 8, 0, hRun - 1, v.litEvery + 1, A.tower)
        // fire escape on the +y flank: diagonal ticks + landing bars
        const escTicks = Math.max(3, Math.round(A.tower.escapeTicks * W / 36))
        for (let e = 0; e < escTicks; e++) {
          const ex = -W + 4 + e * 6
          g.moveTo(ex, H + 2).lineTo(ex + 5, H + 10).stroke({ width: 1, color: A.tower.fireEscape })
        }
        for (let l = 0; l < A.tower.escapeLandings; l++) {
          g.rect(-W + 2, H + 3 + l * 3.4, Math.min(26, W * 0.72), 0.9).fill({ color: A.tower.fireEscape, alpha: 0.85 })
        }
      })
    }
    T.skTowerA = towerPlan(TOWER_VARIANTS[0])
    T.skTowerB = towerPlan(TOWER_VARIANTS[1])
    T.skTowerC = towerPlan(TOWER_VARIANTS[2])
    T.skTowerD = towerPlan(TOWER_VARIANTS[3])
    T.skTowerE = towerPlan(TOWER_VARIANTS[4])

    function housePlan(variantB) {
      const h = A.house
      return skiesPlan((g) => {
        // THE LOT IS BAKED INTO THE SAME TEXTURE (spec §5.3): a driveway that doesn't touch its
        // house is worse than no driveway, and suburbs' "lot furniture" as separate scattered floor
        // props is exactly what produced a yard with a fence in the middle of it.
        g.rect(-40, -34, 80, 68).fill({ color: h.lot.lawn, alpha: h.lot.lawnAlpha })   // lot pad
        if (variantB) {
          g.ellipse(-24, 18, 11, 7).fill(A.house.variantB.pool)                        // kidney pool
          g.ellipse(-19, 20, 6, 4.5).fill(A.house.variantB.pool)
          g.ellipse(-24, 18, 11, 7).stroke({ width: 1.5, color: A.house.variantB.coping })
          g.beginPath().arc(-26, 16, 6, Math.PI * 1.1, Math.PI * 1.7)
            .stroke({ width: 1.1, color: 0xffffff, alpha: 0.5 })                       // highlight crescent
          g.rect(-16, 14, 3, 1).fill(A.house.variantB.coping)                          // ladder tick
        } else {
          for (let k = 0; k < h.lot.hedgeLobes; k++) {                                 // L of hedge
            g.circle(-38 + k * 5, -30, 4).fill({ color: 0x4e6640, alpha: 0.9 })
          }
          for (let k = 0; k < 4; k++) g.circle(-38, -26 + k * 5, 4).fill({ color: 0x4e6640, alpha: 0.9 })
        }
        g.rect(18, -34, 12, 30).fill(h.lot.drive)                                       // driveway to the rim
        g.rect(-36, 22, 18, 12).fill({ color: 0x7a6a58, alpha: 0.85 })                   // rear deck pad
        for (let k = 0; k < h.lot.deckPlanks; k++) {
          g.rect(-36, 22 + k * 1.7, 18, 0.7).fill({ color: 0x000000, alpha: 0.2 })
        }
        g.rect(24, 20, 10, 10).fill({ color: 0x7d7266, alpha: 0.95 }).stroke({ width: 1, color: 0x4a4238 })
        g.moveTo(24, 25).lineTo(34, 25).stroke({ width: 1.2, color: 0x4a4238 })          // shed + its ridge
        g.rect(8, 26, 4, 6).fill(h.lot.bins[0])
        g.rect(13, 26, 4, 6).fill(h.lot.bins[1])
        g.beginPath().arc(30, -12, 4, 0, Math.PI * 1.6).stroke({ width: 1.2, color: 0x3a5a3a, alpha: 0.9 }) // hose loop

        const W = 21, H = 15
        g.rect(-W + SH_DX * 0.5, -H + SH_DY * 0.5, W * 2, H * 2).fill({ color: SH_COL, alpha: SH_A })
        // hipped roof: two facing slopes at two tones, meeting a ridge, with hip diagonals
        g.poly([-W, -H, W, -H, 11, -4, -11, -4]).fill(h.roofLit)
        g.poly([-W, H, W, H, 11, -4, -11, -4]).fill(h.roofShade)
        g.poly([-W, -H, -W, H, -11, -4]).fill(h.roofShade)
        g.poly([W, -H, W, H, 11, -4]).fill(h.roofLit)
        for (let c = 1; c <= h.shingleCourses; c++) {                                    // shingle courses
          const t = c / (h.shingleCourses + 1)
          g.moveTo(-W + t * 10, lerp(-H, -4, t)).lineTo(W - t * 10, lerp(-H, -4, t))
            .stroke({ width: 0.7, color: 0x000000, alpha: h.shingleAlpha })
          g.moveTo(-W + t * 10, lerp(H, -4, t)).lineTo(W - t * 10, lerp(H, -4, t))
            .stroke({ width: 0.7, color: 0x000000, alpha: h.shingleAlpha })
        }
        g.moveTo(-11, -4).lineTo(11, -4).stroke({ width: 2, color: h.ridge })            // ridge cap
        for (const ey of [-H, H]) g.moveTo(-W, ey).lineTo(W, ey).stroke({ width: 1, color: h.gutter, alpha: 0.8 })
        g.rect(W - 1, H - 5, 1.4, 5).fill(h.gutter)                                       // downpipe tick
        g.rect(-14 + 2.5, -12 + 3, 9, 9).fill({ color: SH_COL, alpha: SH_A })              // chimney's own shadow
        g.rect(-14, -12, 9, 9).fill(h.chimney).stroke({ width: 0.8, color: h.ridge })
        g.rect(-12, -10, 5, 3).fill(0x2a2018)                                              // flue
        g.rect(2, -11, 8, 7).fill(h.roofShade).stroke({ width: 0.8, color: h.ridge })       // dormer
        g.rect(4, -9.5, 4, 4).fill(h.dormerPane)
        g.moveTo(6, -9.5).lineTo(6, -5.5).stroke({ width: 0.5, color: h.ridge })
        g.rect(-4, 4, 7, 5).fill({ color: h.skylight, alpha: h.skylightAlpha })             // skylight
        g.rect(W - 2, -4, 24, 18).fill({ color: SH_COL, alpha: SH_A * 0.7 })
        g.rect(W - 4, -6, 24, 18).fill(h.roofShade).stroke({ width: 1.2, color: h.ridge })  // garage wing
        for (let p = 1; p <= h.garagePanels; p++) {
          g.moveTo(W - 4, -6 + (18 * p) / (h.garagePanels + 1)).lineTo(W + 20, -6 + (18 * p) / (h.garagePanels + 1))
            .stroke({ width: 0.7, color: 0x000000, alpha: 0.22 })
        }
        g.circle(W - 6, 12, 1.6).fill(h.porchLamp)                                          // porch lamp
      })
    }
    T.skHouseA = housePlan(false)
    T.skHouseB = housePlan(true)

    T.skBarn = skiesPlan((g) => {
      const b = A.barn
      // attached paddock, drawn first (ground furniture under the building)
      g.rect(-42, 6, 40, 34).fill({ color: 0x5f6a48, alpha: 0.35 })
      g.rect(-40, 12, 34, 20).fill({ color: b.muck, alpha: 0.55 })
      for (let p = 0; p < b.paddockPosts; p++) {
        g.rect(-42 + p * 5.6, 6, 1.6, 4).fill(0x6b5a44)
        g.rect(-42 + p * 5.6, 38, 1.6, 4).fill(0x6b5a44)
      }
      for (let k = 0; k < b.bales; k++) {                                                    // hay bales
        g.circle(-34 + k * 11, 34, 4.5).fill(0xc9a94a).stroke({ width: 0.8, color: 0x8a6f2e })
        g.beginPath().arc(-34 + k * 11, 34, 4.5, 0.6, 3.2).stroke({ width: 0.6, color: 0x8a6f2e, alpha: 0.7 })
      }
      g.moveTo(6, 24).quadraticCurveTo(20, 32, 34, 26).stroke({ width: 5, color: b.mudTrack, alpha: 0.6 }) // mud track
      const W = 26, H = 16
      g.rect(-W + SH_DX * 0.6, -H + SH_DY * 0.6, W * 2, H * 2).fill({ color: SH_COL, alpha: SH_A })
      // gambrel roof: two shallow upper slopes + two steep lower ones, ridge down the middle
      g.rect(-W, -H, W * 2, H).fill(b.roofLit)
      g.rect(-W, 0, W * 2, H).fill(b.roofShade)
      g.moveTo(-W, -6).lineTo(W, -6).stroke({ width: 1, color: 0x000000, alpha: 0.3 })        // hip break
      g.moveTo(-W, 6).lineTo(W, 6).stroke({ width: 1, color: 0x000000, alpha: 0.3 })
      for (let k = 1; k <= b.battens; k++) {                                                   // batten seams
        const bx = -W + (W * 2 * k) / (b.battens + 1)
        g.moveTo(bx, -H).lineTo(bx, H).stroke({ width: 0.7, color: 0x000000, alpha: 0.24 })
      }
      g.poly([4, -14, 16, -12, 14, -4, 2, -6]).fill({ color: b.rust, alpha: b.rustAlpha })      // rust patch
      g.rect(-W, -1.4, W * 2, 2.8).fill(0xd8d0bc)                                               // painted ridge vent
      g.rect(-4, -4, 8, 8).fill(0xb8b0a0).stroke({ width: 0.9, color: 0x4a3a28 })                // cupola
      g.moveTo(-4, 0).lineTo(4, 0).stroke({ width: 0.8, color: 0x4a3a28 })
      g.moveTo(0, -4).lineTo(0, 4).stroke({ width: 0.8, color: 0x4a3a28 })                       // weathervane cross
      g.rect(W - 9, -8, 9, 16).fill(b.hayDoor)                                                   // X-braced hay door
      g.moveTo(W - 9, -8).lineTo(W, 8).stroke({ width: 1, color: 0x8a6a4a })
      g.moveTo(W, -8).lineTo(W - 9, 8).stroke({ width: 1, color: 0x8a6a4a })
    })

    T.skSilo = skiesPlan((g) => {
      const s = A.silo
      const R = 24
      g.circle(SH_DX * 0.7, SH_DY * 0.7, R).fill({ color: SH_COL, alpha: SH_A })
      // pale fan of spilled grain at the base — the one soft shape on an otherwise hard object
      g.poly([R - 4, 6, R + 20, 2, R + 22, 18, R - 2, 14]).fill({ color: s.spill, alpha: s.spillAlpha })
      g.circle(0, 0, R).fill(s.body).stroke({ width: 1.6, color: 0x53565a })
      // the cap as radial facet lines converging on an OFF-CENTRE apex. That off-centre apex is the
      // ENTIRE reason a circle reads as a cone from directly above rather than as a disc.
      const ax = -R * s.apexOffset, ay = -R * s.apexOffset * 0.7
      for (let f = 0; f < s.facets; f++) {
        const fa = (f / s.facets) * Math.PI * 2
        g.moveTo(ax, ay).lineTo(Math.cos(fa) * R, Math.sin(fa) * R)
          .stroke({ width: 0.8, color: 0x8f9296, alpha: 0.8 })
      }
      g.circle(ax, ay, 2.6).fill(0x8f9296)
      // the cone's SHADED side: a crescent on the flank away from the light. Radial facet lines
      // alone read as a manhole cover from above; it is the value break that says "cone".
      g.beginPath()
      g.arc(0, 0, R, -0.35, 2.2)
      g.arc(ax, ay, R * 0.92, 2.2, -0.35, true)
      g.fill({ color: 0x000000, alpha: 0.22 })
      for (let r = 1; r <= s.seams; r++) {                                                    // corrugation rings
        g.circle(ax * (1 - r / (s.seams + 1)), ay * (1 - r / (s.seams + 1)), (R * r) / (s.seams + 1))
          .stroke({ width: 0.8, color: 0x53565a, alpha: s.seamAlpha })
      }
      g.rect(ax + 5, ay - 8, 6, 6).fill(0xa7aaad).stroke({ width: 0.7, color: 0x53565a })       // cap hatch
      // ladder cage down one flank: two rails and nine rungs
      g.moveTo(-3, 2).lineTo(-3, R - 1).stroke({ width: 0.9, color: 0x53565a })
      g.moveTo(3, 2).lineTo(3, R - 1).stroke({ width: 0.9, color: 0x53565a })
      for (let r = 0; r < s.ladderRungs; r++) {
        const ry = 3 + (r * (R - 5)) / s.ladderRungs
        g.moveTo(-3, ry).lineTo(3, ry).stroke({ width: 0.7, color: 0x53565a, alpha: 0.9 })
      }
      g.rect(-R - 20, -3, 20, 5).fill(0x9aa0a8).stroke({ width: 0.8, color: 0x53565a })          // auger arm
      g.rect(-R - 27, -6, 8, 11).fill(0x7d838c).stroke({ width: 0.8, color: 0x53565a })          // hopper box
    })

    T.skPier = skiesPlan((g) => {
      const p = A.pier
      // three deck sections with REAL GAPS between them — a hole in the fill, not a dark line.
      // That single detail is what sells wood over water (spec §5.6).
      const segs = [[-40, -12, 24, 26], [-13, -12, 26, 26], [12, -12, 28, 26]]
      for (const [sx, sy, sw, sh] of segs) {
        g.rect(sx + SH_DX * 0.5, sy + SH_DY * 0.5, sw, sh).fill({ color: SH_COL, alpha: SH_A * 0.8 })
      }
      for (const [sx, sy, sw, sh] of segs) {
        g.rect(sx, sy, sw, sh).fill(0xa9835a).stroke({ width: 1.2, color: 0x4a3420 })
        const n = Math.round((p.boards * sw) / 78)
        for (let k = 1; k <= n; k++) {
          g.moveTo(sx, sy + (sh * k) / (n + 1)).lineTo(sx + sw, sy + (sh * k) / (n + 1))
            .stroke({ width: 0.7, color: 0x4a3420, alpha: 0.5 })
        }
      }
      for (let k = 0; k < p.pilings; k++) {                                                    // pilings + halo
        const px = -36 + k * 15, py = k % 2 ? -9 : 9
        g.circle(px, py, 4.4).fill({ color: 0x000000, alpha: 0.3 })
        g.circle(px, py, 3).fill(0x6b4a2c).stroke({ width: 0.8, color: 0x2e2216 })
      }
      for (let k = 0; k < p.bollards; k++) {                                                   // bollards + rope
        const bx = -32 + k * 20
        g.circle(bx, -15, 2.6).fill(0x3f4348).stroke({ width: 0.7, color: 0x1c1e22 })
        if (k < 2) {
          g.circle(bx, -15, 4.4).stroke({ width: 0.8, color: 0xb8a888, alpha: 0.8 })
          g.circle(bx, -15, 6).stroke({ width: 0.7, color: 0xb8a888, alpha: 0.6 })
        }
      }
      g.rect(2, 14, 8, 1.6).fill(0x3f4348)                                                     // cleat T-glyph
      g.rect(5, 12, 1.6, 5).fill(0x3f4348)
      // crane rig at the head: mast, jib, hanging hook line
      g.rect(34, -10, 3, 16).fill(0x6d7480).stroke({ width: 0.7, color: 0x2b3038 })
      g.moveTo(35, -10).lineTo(35, -22).stroke({ width: 2, color: 0x6d7480 })
      g.moveTo(35, -22).lineTo(16, -18).stroke({ width: 1.6, color: 0x6d7480 })
      g.moveTo(16, -18).lineTo(16, -9).stroke({ width: 0.7, color: 0x9aa1ab })
      // shack with a corrugated roof of parallel ridge arcs, and one lit lantern
      g.rect(-38, -10, 18, 16).fill(0x8a8378).stroke({ width: 1, color: 0x3a352e })
      for (let k = 0; k < p.shackRoofArcs; k++) {
        g.beginPath().arc(-37 + k * 2, -2, 8, Math.PI * 1.05, Math.PI * 1.95)
          .stroke({ width: 0.7, color: 0x5a544a, alpha: 0.75 })
      }
      g.rect(-24, -6, 3, 3).fill(p.lantern)
      g.circle(-30, 8, 3).fill({ color: p.tyre, alpha: 0.9 }).stroke({ width: 1, color: 0x15181c }) // tyre fender
      // moored dinghy with a baked static V-wake, and two wave-crest lines along the base
      g.poly([-2, 22, 12, 20, 16, 25, 10, 30, -2, 28]).fill(0x8a5a3a).stroke({ width: 0.9, color: 0x3f2a18 })
      g.moveTo(-2, 22).lineTo(-16, 16).stroke({ width: 0.9, color: 0xdfe9f0, alpha: 0.4 })
      g.moveTo(-2, 28).lineTo(-16, 33).stroke({ width: 0.9, color: 0xdfe9f0, alpha: 0.4 })
      for (let k = 0; k < p.waveLines; k++) {
        g.moveTo(-42, 32 + k * 6).quadraticCurveTo(0, 27 + k * 6, 42, 33 + k * 6)
          .stroke({ width: 1.4, color: 0xdfe9f0, alpha: 0.3 })
      }
    })

    T.skTree = skiesPlan((g) => {
      const t = A.tree
      const R = 26
      // scalloped radial edge, NEVER a smooth circle — a smooth green disc is the single most
      // "programmer art" shape available and parks was made of them.
      const edge = []
      for (let k = 0; k < t.scallops * 4; k++) {
        const a = (k / (t.scallops * 4)) * Math.PI * 2
        const rr = R * (0.86 + 0.14 * Math.cos(a * t.scallops)) * (0.94 + hash(k * 3.1) * 0.12)
        edge.push(Math.cos(a) * rr, Math.sin(a) * rr)
      }
      g.poly(edge.map((v, i) => v + (i % 2 ? SH_DY : SH_DX))).fill({ color: SH_COL, alpha: SH_A })
      for (let s = 0; s < t.branchSpokes; s++) {                                     // spokes seen through the gaps
        const sa = (s / t.branchSpokes) * Math.PI * 2 + 0.3
        g.moveTo(0, 0).lineTo(Math.cos(sa) * R * 0.95, Math.sin(sa) * R * 0.95)
          .stroke({ width: 1.4, color: 0x2e2620, alpha: 0.85 })
      }
      g.poly(edge).fill(t.canopyShade)
      for (let l = 0; l < t.lobes; l++) {                                            // overlapping lit lobes
        const la = (l / t.lobes) * Math.PI * 2 + 0.7
        g.circle(Math.cos(la) * R * 0.42 - 3, Math.sin(la) * R * 0.42 - 4, R * 0.42)
          .fill({ color: t.canopyLit, alpha: 0.82 })
      }
      g.circle(0, 0, 3.4).fill(t.trunk)                                              // trunk at the centre of mass
    })

    T.skOutcrop = skiesPlan((g) => {
      const o = A.outcrop
      const facets = [
        [[-22, -14], [4, -20], [10, -2], [-16, 4]],
        [[4, -20], [24, -8], [18, 8], [10, -2]],
        [[-16, 4], [10, -2], [16, 14], [-10, 16]],
      ]
      g.poly(facets[2].flat().map((v, i) => v + (i % 2 ? SH_DY : SH_DX)))
        .fill({ color: SH_COL, alpha: SH_A })                                        // downslope shadow skirt
      for (let f = 0; f < facets.length; f++) {
        const lum = o.facetLum[f]
        const c = mix(0x000000, o.body, lum)
        g.poly(facets[f].flat()).fill(c).stroke({ width: 1.2, color: 0x4a453e })
      }
      for (let k = 0; k < o.lichenDots; k++) {                                       // lichen on the LIT facets only
        const lx = -20 + hash(k * 4.7 + 1.3) * 26
        const ly = -18 + hash(k * 6.1 + 2.9) * 20
        g.circle(lx, ly, 1.1).fill({ color: o.lichen, alpha: 0.7 })
      }
      for (let k = 0; k < o.screeChips; k++) {                                       // scree tail, downslope
        const sx = 14 + k * 6 + hash(k * 3.3) * 5
        const sy = 12 + k * 5 + hash(k * 5.9) * 5
        g.poly([sx, sy, sx + 4, sy - 2, sx + 5, sy + 3, sx + 1, sy + 4]).fill({ color: 0x6f675c, alpha: 0.85 })
      }
    })

    // ---- v5.11 kaiju redesign — the PLAYER's own body/tail (spec: "the one thing on screen the
    // player looks at constantly" was still the generic cross-chapter blob, ~44px on screen next to
    // a tower drawing up to 96px). Gated on CHAPTERS.skies.render.kaiju (chapterHasKaiju below);
    // every other chapter's rig — including pond/undergrowth, which also set `tail: true` — never
    // reads any of this and stays byte-identical.
    //
    // Same "identical geometry between the coloured and white bakes" contract drawEnemy/roster use:
    // `white` forces every fill to 0xffffff so the two textures share bounds (and therefore bake()'s
    // anchor), letting T.kaijuFlash swap onto pFlash for the hurt-flash pop without the silhouette
    // shifting under it. Unlike a structure plan there is no live per-instance radius to scale
    // against (PLAYER.radius never changes) so these bake AT THEIR FINAL ON-SCREEN SIZE directly —
    // no runtime scale factor, the same way T.playerBody itself already works.
    //
    // Limb polys are drawn FIRST with their socket end tucked well inside the torso's silhouette, so
    // the torso poly drawn on top of them hides the join and only the distal limb protrudes — the
    // same "flank sliver under the main deck" trick towerPlan uses above (this file, ~line 2748).
    const K = SKIES_KAIJU
    // Right-side torso profile, HEAD to TAIL-ROOT (top to bottom); mirrorShape closes it into a
    // symmetric polygon by appending the reversed, x-negated list — see its own comment.
    function mirrorShape(rightPts) {
      const left = rightPts.slice().reverse().map(([x, y]) => [-x, y])
      return rightPts.concat(left).flat()
    }
    function drawKaijuBody(g, white) {
      const bodyLit = white ? 0xffffff : K.bodyLit
      const bodyMid = white ? 0xffffff : K.bodyMid
      const bodyShade = white ? 0xffffff : K.bodyShade
      const plateBase = white ? 0xffffff : K.plateBase
      const plateEdge = white ? 0xffffff : K.plateEdge
      const scute = white ? 0xffffff : K.scute
      const band = white ? 0xffffff : K.band
      const jawDark = white ? 0xffffff : K.jawDark
      const teeth = white ? 0xffffff : K.teeth
      const claw = white ? 0xffffff : K.claw
      const horn = white ? 0xffffff : K.horn
      const eyeWhite = white ? 0xffffff : K.eyeWhite

      // forelimbs + hindlimbs: socket point first (hidden under the torso), a couple of knuckle
      // points, then the visible paw/foot with three claw ticks fanning off it. Filled a shade
      // LIGHTER than the plain body (mix toward bodyLit) — at the small size a limb actually
      // reads at, the plain bodyMid fill plus a dark stroke plus three dark claw ticks read as a
      // near-black stub, not "a green limb with dark claws"; the lighter fill keeps the green
      // identity legible even where the claw ticks cover a good fraction of the small shape.
      const limbFill = white ? 0xffffff : mix(bodyMid, bodyLit, 0.55)
      function limb(pts, clawAt, side) {
        const p = pts.map(([x, y]) => [x * side, y])
        g.poly(p.flat()).fill(limbFill).stroke({ width: 2, color: bodyShade, alpha: 0.75 })
        const cx = clawAt[0] * side, cy = clawAt[1]
        const base = Math.atan2(cy, cx)
        for (let c = -1; c <= 1; c++) {
          const a = base + c * 0.55
          g.moveTo(cx, cy).lineTo(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10)
            .stroke({ width: 2.2, color: claw, cap: 'round' })
        }
      }
      for (const side of [-1, 1]) {
        limb([[46, -8], [84, 0], [116, 20], [98, 30], [70, 10]], [116, 20], side)     // forelimb
        limb([[44, 76], [80, 92], [88, 122], [66, 128], [42, 102]], [88, 122], side)  // hindlimb
      }

      // torso: broad shoulders tapering to the hips, MASS-CENTRED (0,0 sits mid-back, not the base)
      const torsoR = [
        [20, -58], [30, -44], [52, -24], [76, -2], [70, 24], [60, 52], [56, 80], [40, 104], [16, 122],
      ]
      g.poly(mirrorShape(torsoR)).fill(bodyMid).stroke({ width: 2.4, color: bodyShade })
      // volume: a lit top-plane biased upper-left (this chapter's ONE light direction — see
      // SKIES_SHADOW), a shaded flank biased lower-right. Same two-pass "volume" convention every
      // other creature in this file already uses (radialOutline's own doc comment), just biased by
      // the region's light law instead of a generic top/underside split.
      g.ellipse(-22, -8, 58, 70).fill({ color: bodyLit, alpha: 0.30 })
      g.ellipse(26, 38, 54, 62).fill({ color: bodyShade, alpha: 0.26 })

      // spine banding — surface detail, not silhouette
      for (let i = 0; i < K.bandCount; i++) {
        const by = lerp(-4, 80, i / (K.bandCount - 1))
        const hw = by < 10 ? 48 : by < 40 ? 34 : by < 65 ? 22 : 12
        g.moveTo(-hw, by).quadraticCurveTo(0, by + 6, hw, by).stroke({ width: 3, color: band, alpha: 0.28 })
      }
      // flank scutes: small overlapping bumps along both outer edges, each a 2-tone bump (a darker
      // base + a small lit fleck) so the flank reads as plated, not smooth
      for (let i = 0; i < K.scuteRows; i++) {
        const sy = lerp(-28, 94, i / (K.scuteRows - 1))
        for (const side of [-1, 1]) {
          const sx = (54 - Math.abs(sy) * 0.06) * side * 0.94
          g.ellipse(sx, sy, 9, 6).fill({ color: scute, alpha: 0.55 })
          g.ellipse(sx - side * 1.6, sy - 1.6, 4, 2.4).fill({ color: bodyLit, alpha: 0.28 })
        }
      }

      // DORSAL PLATES — BAKED ANATOMY FIRST. SKIES_FX.rampage's chain-charge glow (render.js
      // updateRampage) lands on these SAME (0, plateY) points SECOND, rather than an arc that used
      // to rotate with facingAngle regardless of this (non-rotating) body — see that function.
      const plateN = SKIES_FX.rampage.plates
      for (let i = 0; i < plateN; i++) {
        const f = i / (plateN - 1)
        const py = lerp(-44, 92, f)
        const bump = Math.max(0, 1 - Math.abs(f - 0.42) * 1.5)
        const h = lerp(8, 19, bump)
        g.poly([0, py - h, h * 0.6, py, 0, py + h * 0.8, -h * 0.6, py])
          .fill(plateBase).stroke({ width: 1.2, color: plateEdge, alpha: 0.7 })
      }

      // head: skull tapering to a point between two small brow horns, a jaw with jagged teeth, and
      // two white-sclera eyes (pupils are the existing pooled T.pupil sprites — see syncPlayer)
      const headW = 42
      g.poly([-headW, -60, headW, -60, headW * 0.85, -108, 0, -134, -headW * 0.85, -108])
        .fill(bodyMid).stroke({ width: 2.2, color: bodyShade })
      g.ellipse(-13, -100, 25, 29).fill({ color: bodyLit, alpha: 0.28 })   // skull top-plane
      for (const side of [-1, 1]) {
        g.poly([26 * side, -112, 14 * side, -140, 6 * side, -114]).fill(horn)   // brow horn
      }
      g.poly([-34, -60, 34, -60, 28, -44, 0, -36, -28, -44])
        .fill(jawDark).stroke({ width: 1.6, color: 0x0d1410 })                  // jaw
      for (let t = 0; t < K.jawTeeth; t++) {
        const tx = lerp(-26, 26, t / (K.jawTeeth - 1))
        g.poly([tx - 3, -50, tx + 3, -50, tx, -42]).fill(teeth)
      }
      for (const side of [-1, 1]) {
        g.circle(22 * side, -96, 13).fill(eyeWhite).stroke({ width: 1.4, color: bodyShade })
      }
      // pale chest hint just under the jaw — the one belly-toned accent on an otherwise back/flank
      // palette (cheap, and it keeps the head from reading as glued straight onto a solid green wall)
      g.ellipse(0, -30, 15, 19).fill({ color: eyeWhite, alpha: 0.16 })
    }
    T.kaijuBody = (() => { const g = new Graphics(); drawKaijuBody(g, false); return bake(g) })()
    T.kaijuFlash = (() => { const g = new Graphics(); drawKaijuBody(g, true); return bake(g) })()

    // ground shadow: the kaiju's own bigger disc (T.playerShadow, the generic blob's, is far too
    // small once the silhouette above is this big) — see syncPlayer for the SKIES_SHADOW-direction
    // offset this is placed at, instead of the generic blob's straight-down one.
    T.kaijuShadow = (() => {
      const g = new Graphics()
      g.ellipse(0, 0, K.shadowRx, K.shadowRy).fill({ color: 0x000000, alpha: 0.32 })
      return bake(g)
    })()

    // the articulated tail: ONE tapering, banded segment (reused for all three chain links at
    // decreasing scale — same "one texture, several instances" idiom tailA/tailB already used with
    // the plain T.fx.trace_05 streak) instead of the generic translucent flagellum every other
    // `tail: true` chapter still shows. Small dorsal-spike nubs continue the body's plate ridge onto
    // the tail so the two don't read as two unrelated systems.
    const TAIL_SEG_REF = 140
    // "a heavier, darker kaiju tail" (CHAPTERS.skies.render.tailTint's old doc, when the tail was
    // still the generic flagellum): baked a shade darker than the body itself, not tinted darker at
    // runtime — this bake carries its own final palette, same as the body (see drawKaijuBody above).
    const TAIL_FILL = mix(K.bodyMid, K.bodyShade, 0.4)
    T.kaijuTailSeg = (() => {
      const g = new Graphics()
      const L = TAIL_SEG_REF, W = 32
      g.poly([0, -W / 2, L * 0.5, -W * 0.32, L, 0, L * 0.5, W * 0.32, 0, W / 2])
        .fill(TAIL_FILL).stroke({ width: 2, color: K.bodyShade })
      g.poly([0, -W * 0.28, L * 0.55, -W * 0.16, L * 0.88, -2, L * 0.2, -W * 0.1])
        .fill({ color: K.bodyLit, alpha: 0.3 })   // top-plane highlight, biased along the same taper
      for (let k = 1; k <= 4; k++) {               // banding rings, tapering with the tail itself
        const x = (L * k) / 5
        const w = (W / 2) * (1 - x / L) * 0.92
        g.moveTo(x, -w).lineTo(x, w).stroke({ width: 2, color: K.band, alpha: 0.35 })
      }
      for (let k = 0; k < 3; k++) {                 // small dorsal-spike nubs continuing the ridge
        const x = 12 + (L * 0.68 * k) / 2
        const h = 8 * (1 - x / L)
        g.poly([x - 4, -W * 0.2, x + 4, -W * 0.2, x, -W * 0.2 - h]).fill(K.plateBase)
      }
      return { ...bake(g), ref: L }
    })()

    // ---- ruins (spec §5.9) — permanent geometry left where a structure was --------------------
    // Kind-specific, at the same cost as a generic scar, and the only thing in the chapter that
    // RECORDS what you did. Keyed by world position (the obstacle is gone from run.obstacles by
    // the time this draws) via the render-local crush ledger.
    function ruinBase(g, R) {
      g.circle(0, 0, R).fill({ color: SKIES_RUIN.scar, alpha: SKIES_RUIN.scarAlpha })
      for (let k = 0; k < SKIES_RUIN.rebarTicks; k++) {
        const a = (k / SKIES_RUIN.rebarTicks) * Math.PI * 2 + 0.4
        g.moveTo(Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.7)
          .lineTo(Math.cos(a) * R * 1.05, Math.sin(a) * R * 1.05 - 3)
          .stroke({ width: 1.1, color: 0x6b6357, alpha: 0.9 })
      }
    }
    T.skRuin = {}
    T.skRuin.tower = skiesPlan((g) => {
      ruinBase(g, 32)
      for (let s = 0; s < SKIES_RUIN.byKind.tower.slabSteps; s++) {         // stepped floor-plate edges
        g.rect(-26 + s * 5, -20 + s * 6, 44 - s * 10, 5).fill({ color: 0x8d8577, alpha: 0.9 })
      }
      for (let c = 0; c < SKIES_RUIN.byKind.tower.rubbleChunks; c++) {
        const cx = -14 + c * 8 + hash(c * 3.3) * 6, cy = 4 + hash(c * 5.7) * 12
        g.poly([cx, cy, cx + 7, cy - 3, cx + 9, cy + 4, cx + 2, cy + 6]).fill(0xc9c2b0).stroke({ width: 0.8, color: 0x5a544a })
      }
      g.rect(16, -24, 9, 14).fill(0xc9c2b0).stroke({ width: 1, color: 0x5a544a })  // surviving corner column
      g.circle(0, 0, 30).stroke({ width: 4, color: 0x1a1712, alpha: 0.35 })        // scorch ring
    })
    T.skRuin.house = skiesPlan((g) => {
      ruinBase(g, 20)
      for (let k = 0; k < SKIES_RUIN.byKind.house.timberX; k++) {
        const cx = -14 + k * 9, cy = -6 + hash(k * 2.7) * 12
        g.moveTo(cx - 6, cy - 5).lineTo(cx + 6, cy + 5).stroke({ width: 2, color: 0xa8865c })
        g.moveTo(cx + 6, cy - 5).lineTo(cx - 6, cy + 5).stroke({ width: 2, color: 0x8a6a44 })
      }
      g.rect(8 + 2, -18 + 2.5, 9, 11).fill({ color: SH_COL, alpha: SH_A })
      g.rect(8, -18, 9, 11).fill(0x8f7a68).stroke({ width: 1, color: 0x5f3c2d })    // THE SURVIVING CHIMNEY
      g.rect(10, -16, 5, 3).fill(0x2a2018)
      for (let k = 0; k < SKIES_RUIN.byKind.house.shingles; k++) {
        const sx = -20 + hash(k * 4.1) * 40, sy = -14 + hash(k * 6.3) * 30
        g.rect(sx, sy, 4, 2.5).fill({ color: 0x7a4e3b, alpha: 0.85 })
      }
      g.rect(-20, 10, 14, 7).fill(0x6f7f8f).stroke({ width: 0.8, color: 0x2b3038 })  // flattened car
      g.rect(-18, 11.5, 10, 4).fill({ color: 0x1e2733, alpha: 0.8 })
    })
    T.skRuin.silo = skiesPlan((g) => {
      ruinBase(g, 24)
      g.beginPath().arc(0, 0, 20, Math.PI * 0.7, Math.PI * 1.9)
        .stroke({ width: 5, color: 0xc7c9cc })                                       // split cylinder wall arc
      g.poly([-6, 4, 26, 0, 30, 20, -2, 18]).fill({ color: SKIES_RUIN.byKind.silo.grainFan, alpha: 0.5 })
    })
    T.skRuin.barn = skiesPlan((g) => {
      ruinBase(g, 26)
      g.poly([-24, -14, 0, 6, 24, -14, 24, -6, 0, 14, -24, -6]).fill(0x74302a).stroke({ width: 1.2, color: 0x2e1a14 })
      const wa = STORM_VIS.windAngle
      for (let k = 0; k < 9; k++) {                                                  // hay strewn DOWNWIND
        const d = 10 + k * 4
        const hx = Math.cos(wa) * d + (hash(k * 3.7) - 0.5) * 10
        const hy = Math.sin(wa) * d + (hash(k * 5.1) - 0.5) * 10
        g.rect(hx, hy, 5, 1.6).fill({ color: 0xc9a94a, alpha: 0.75 })
      }
    })
    T.skRuin.pier = skiesPlan((g) => {
      ruinBase(g, 20)
      g.ellipse(4, 4, 26, 15).fill({ color: 0x5a4a6a, alpha: 0.32 })                 // iridescent oil slick
      g.ellipse(0, 2, 17, 10).fill({ color: 0x3a5a6a, alpha: 0.28 })
      for (let k = 0; k < SKIES_RUIN.byKind.pier.plankRaft; k++) {
        const px = -20 + hash(k * 3.9) * 38, py = -12 + hash(k * 6.7) * 26
        const pa = hash(k * 8.1) * Math.PI
        const dx = Math.cos(pa) * 8, dy = Math.sin(pa) * 8
        g.moveTo(px - dx, py - dy).lineTo(px + dx, py + dy)
          .stroke({ width: 2.6, color: 0xa9835a, cap: 'square' })
      }
    })
    T.skRuin.tree = skiesPlan((g) => {
      ruinBase(g, 14)
      g.circle(0, 0, 7).fill(0x5a4a38).stroke({ width: 1.2, color: 0x2e2620 })       // stump
      for (let k = 0; k < 10; k++) {                                                  // splintered crown ring
        const a = (k / 10) * Math.PI * 2
        g.moveTo(Math.cos(a) * 5, Math.sin(a) * 5).lineTo(Math.cos(a) * 9, Math.sin(a) * 9)
          .stroke({ width: 1.2, color: 0xc9b48a })
      }
      for (let k = 0; k < SKIES_RUIN.byKind.tree.branches; k++) {
        const a = hash(k * 4.3) * Math.PI * 2, d = 12 + hash(k * 7.1) * 14
        g.moveTo(Math.cos(a) * d, Math.sin(a) * d)
          .lineTo(Math.cos(a) * d + 8, Math.sin(a) * d + 3)
          .stroke({ width: 1.6, color: 0x46583b })
      }
    })

    // ---- vehicles (spec §6) — "you must be able to tell a bus from a sedan" -------------------
    // Replaces T.car (the CITY chapter's yellow traffic taxi, baked from TRAFFIC_CAR_LEN) for skies
    // use. Bodies bake WHITE so SKIES_VEHICLE.bodyTints drives the colour per instance and litTint
    // keeps the floor tint out of it; glass/wheels bake as low-value greys so they multiply DOWN
    // under any body colour and the hierarchy holds.
    const V = SKIES_VEHICLE
    function vehicle(spec, kind) {
      const g = new Graphics()
      const L = spec.len / 2, W = spec.w / 2
      g.roundRect(-L + SH_DX * 0.12, -W + SH_DY * 0.12, spec.len, spec.w, 2.5)
        .fill({ color: SH_COL, alpha: SH_A })
      for (const s of [-1, 1]) {                                                    // wheels peeking at the corners
        const n = spec.wheels / 2
        for (let k = 0; k < n; k++) {
          const wx = -L + 3 + (k * (spec.len - 7)) / Math.max(1, n - 1)
          g.rect(wx - 2, s * W - 1.2, 4, 2.5).fill(V.wheel)
        }
      }
      g.roundRect(-L, -W, spec.len, spec.w, 2.5).fill(0xffffff).stroke({ width: 1, color: 0x6a6f76 })
      g.rect(-L + 2, -W + 1.4, spec.len - 4, 1.6).fill({ color: 0xffffff, alpha: 0.55 })  // roof highlight streak
      if (kind === 'bus') {
        for (let k = 0; k < spec.windowBays; k++) {                                 // 6 window bays per flank
          const bx = -L + 5 + k * ((spec.len - 10) / spec.windowBays)
          for (const s of [-1, 1]) {
            g.rect(bx, s * (W - 3.4) - 1.2, (spec.len - 10) / spec.windowBays - 2, 2.6)
              .fill({ color: V.glass, alpha: V.glassAlpha })
          }
        }
        g.rect(L - 5, -3, 3.5, 6).fill(0xd8d4c8)                                     // destination board
        for (let k = 0; k < spec.roofHatches; k++) g.rect(-6 + k * 9, -2, 5, 4).fill(0x7a7f86)
        g.moveTo(-2, -W).lineTo(-2, W).stroke({ width: 0.9, color: 0x5a5f66 })        // double-door seam
        g.moveTo(1, -W).lineTo(1, W).stroke({ width: 0.9, color: 0x5a5f66 })
      } else {
        g.poly([L - 8, -W + 1.5, L - 3, -W + 3.4, L - 3, W - 3.4, L - 8, W - 1.5])
          .fill({ color: V.glass, alpha: V.glassAlpha })                              // windshield trapezoid
        if (kind === 'sedan') {
          g.poly([-L + 8, -W + 1.5, -L + 3, -W + 3.4, -L + 3, W - 3.4, -L + 8, W - 1.5])
            .fill({ color: V.glass, alpha: V.glassAlpha })                            // rear screen
          for (const s of [-1, 1]) g.rect(L - 10, s * (W + 0.4) - 0.7, 2, 1.4).fill(0x6a6f76) // mirror nubs
          for (const sx of [-3, 4]) g.moveTo(sx, -W).lineTo(sx, W).stroke({ width: 0.7, color: 0x6a6f76, alpha: 0.6 })
        } else {
          g.rect(-2, -2.5, 5, 4).fill(0x7a7f86)                                       // roof vent
          g.moveTo(2, -W).lineTo(2, W).stroke({ width: 0.9, color: 0x6a6f76 })         // sliding-door seam
        }
      }
      for (const s of [-1, 1]) {
        g.circle(L - 1.4, s * (W - 2.6), 1.1).fill(V.head)
        g.circle(-L + 1.4, s * (W - 2.6), 1).fill(V.tail)
      }
      return bake(g, 1)
    }
    T.vehSedan = vehicle(V.sedan, 'sedan')
    T.vehVan = vehicle(V.van, 'van')
    T.vehBus = vehicle(V.bus, 'bus')

    // ---- district surfaces (spec §4.5) --------------------------------------------------------
    function groundTile(draw) { const g = new Graphics(); draw(g); return bake(g) }
    // v5.13: T.districtGround.parks (the mown-stripe bake) is deleted from here — it was written in
    // v5.10 for populateBlotch, which returns early for every chapter that has a terrain map, so it
    // was never drawn once. The stripes now live in T.terrainTile.parks, which populateTerrain
    // actually reads.
    // farms: a CENTRE-PIVOT IRRIGATION CIRCLE. A perfect circle in a field of straight rows is
    // unmistakable from overhead and exists nowhere else in nature.
    T.pivotCircle = groundTile((g) => {
      const f = DISTRICT_SURFACE.farms
      const R = f.pivotRadius / 2
      g.circle(0, 0, R).stroke({ width: 5, color: 0xffffff, alpha: f.pivotAlpha })
      g.circle(0, 0, R * 0.62).stroke({ width: 3, color: 0xffffff, alpha: f.pivotAlpha * 0.7 })
      g.moveTo(0, 0).lineTo(R, -R * 0.12).stroke({ width: 3.5, color: 0xffffff, alpha: f.pivotAlpha * 1.4 }) // pivot arm
      g.circle(0, 0, 6).fill({ color: 0xffffff, alpha: f.pivotAlpha * 2 })
      g.rect(-R, R - f.headlandPx, R * 2, f.headlandPx).fill({ color: 0xffffff, alpha: 0.08 })       // headland strip
    })
    // sea: a CONTAINER YARD. Tiny dense saturated rectangles against dark water is the highest
    // detail-density-per-line-of-code in the whole redesign, and the only place in the chapter
    // where hue does the talking (litTint — a tinted container yard is just a grey grid).
    T.containerYard = (() => {
      const g = new Graphics()
      const s = DISTRICT_SURFACE.sea
      g.rect(-s.yardCols * 9 - 6, -s.yardRows * 6 - 6, s.yardCols * 18 + 12, s.yardRows * 12 + 12)
        .fill({ color: 0x3a4048, alpha: 0.7 })                                        // the hardstand
      for (let c = 0; c < s.yardCols; c++) {
        for (let r = 0; r < s.yardRows; r++) {
          const bx = -s.yardCols * 9 + c * 18, by = -s.yardRows * 6 + r * 12
          const hue = s.boxHues[Math.floor(hash(c * 7.7 + r * 3.1) * s.boxHues.length)]
          g.rect(bx + SH_DX * 0.06, by + SH_DY * 0.06, s.boxW, s.boxH).fill({ color: SH_COL, alpha: SH_A })
          g.rect(bx, by, s.boxW, s.boxH).fill(hue).stroke({ width: 0.6, color: 0x1a1d22 })
          for (let k = 1; k < 4; k++) {
            g.moveTo(bx + (s.boxW * k) / 4, by).lineTo(bx + (s.boxW * k) / 4, by + s.boxH)
              .stroke({ width: 0.4, color: 0x000000, alpha: 0.28 })                    // corrugation
          }
        }
      }
      return bake(g)
    })()
    T.riprap = (() => {                                                                // breakwater arm
      const g = new Graphics()
      for (let k = 0; k < 14; k++) {
        const bx = -90 + k * 13 + (hash(k * 2.7) - 0.5) * 5
        const by = Math.sin(k * 0.42) * 12 + (hash(k * 5.1) - 0.5) * 6
        const r = 7 + hash(k * 3.3) * 4
        const pts = []
        for (let s = 0; s < 5; s++) {
          const a = (s / 5) * Math.PI * 2
          const rr = r * (0.7 + hash(k * 11 + s * 2.1) * 0.5)
          pts.push(bx + Math.cos(a) * rr, by + Math.sin(a) * rr)
        }
        g.poly(pts).fill(0x7d838c).stroke({ width: 1, color: 0x3a3f47 })
      }
      return bake(g)
    })()
    // a REAL wave crest: two parallel crest arcs and a foam speckle band. Kill list §8.6 — T.foam
    // is `T.fx.trace_05`, i.e. the sea's breaking wave IS the POND's current-streak sprite, reused
    // again by populateEdge for coastlines.
    T.waveCrest = (() => {
      const g = new Graphics()
      const s = DISTRICT_SURFACE.sea
      for (let a = 0; a < s.crestArcs; a++) {
        g.moveTo(-60, a * 7).quadraticCurveTo(0, -9 + a * 7, 60, a * 7)
          .stroke({ width: 2.6 - a * 0.8, color: s.foam, alpha: s.crestAlpha - a * 0.12, cap: 'round' })
      }
      for (let k = 0; k < s.foamSpeckle; k++) {
        const fx = -58 + hash(k * 3.7) * 116
        const fy = -6 + hash(k * 6.1) * 16
        g.circle(fx, fy, 0.9 + hash(k * 9.3) * 1.2).fill({ color: s.foam, alpha: 0.3 + hash(k * 2.3) * 0.3 })
      }
      return bake(g)
    })()
    // downtown: a painted parking lot. Cars park ALIGNED TO THE STALL ANGLE — random rotation is
    // the loudest possible tell that props were scattered by an algorithm, not placed by a city.
    T.parkingLot = (() => {
      const g = new Graphics()
      const d = DISTRICT_SURFACE.downtown
      const bayW = 13, bayL = 26
      g.rect(-d.baysPerRow * bayW / 2 - 8, -bayL - 10, d.baysPerRow * bayW + 16, bayL * 2 + 20)
        .fill({ color: 0x2b2f36, alpha: 0.8 })
      for (let r = 0; r < d.bayRows; r++) {
        for (let b = 0; b <= d.baysPerRow; b++) {
          const bx = -d.baysPerRow * bayW / 2 + b * bayW
          const by = r === 0 ? -bayL - 4 : 4
          g.rect(bx, by, 1.6, bayL).fill({ color: d.paint, alpha: d.paintAlpha })
        }
      }
      for (let k = 0; k < 7; k++) {                                                    // one hatched loading bay
        g.moveTo(-d.baysPerRow * bayW / 2 - 6, -bayL - 8 + k * 5)
          .lineTo(-d.baysPerRow * bayW / 2 + 12, -bayL - 16 + k * 5)
          .stroke({ width: 1.4, color: d.paint, alpha: 0.4 })
      }
      return bake(g)
    })()
    // hills: dirt track. v5.10.1: was three flat strokes of one colour at up to 250px — "exactly the
    // simple squares and lines" the user rejected for a landmark-sized bake. Now: a shadowed bed (the
    // track sits IN the terrain), TWIN tire ruts rather than one flat band, and a scatter of gravel.
    T.switchback = (() => {
      const g = new Graphics()
      const h = DISTRICT_SURFACE.hills
      const pts = [[-80, 40], [30, 14], [-40, -14], [70, -42]]
      for (let k = 0; k < pts.length - 1; k++) {
        g.moveTo(pts[k][0], pts[k][1]).lineTo(pts[k + 1][0], pts[k + 1][1])
          .stroke({ width: h.trackW + 5, color: 0x000000, alpha: 0.18, cap: 'round', join: 'round' })
      }
      for (const side of [-1, 1]) {
        for (let k = 0; k < pts.length - 1; k++) {
          const [x0, y0] = pts[k], [x1, y1] = pts[k + 1]
          const dx = x1 - x0, dy = y1 - y0
          const len = Math.hypot(dx, dy) || 1
          const nx = (-dy / len) * side * h.trackW * 0.28, ny = (dx / len) * side * h.trackW * 0.28
          g.moveTo(x0 + nx, y0 + ny).lineTo(x1 + nx, y1 + ny)
            .stroke({ width: h.trackW * 0.36, color: h.trackColor, alpha: 0.75, cap: 'round', join: 'round' })
        }
      }
      for (let i = 0; i < 14; i++) {                                              // scattered gravel
        const seg = Math.floor(hash(i * 3.7) * (pts.length - 1))
        const t = hash(i * 5.1 + 1)
        const [x0, y0] = pts[seg], [x1, y1] = pts[seg + 1]
        const gx = x0 + (x1 - x0) * t + (hash(i * 7.3) - 0.5) * h.trackW * 0.9
        const gy = y0 + (y1 - y0) * t + (hash(i * 2.9) - 0.5) * h.trackW * 0.9
        g.circle(gx, gy, 1 + hash(i * 4.1) * 1.4).fill({ color: 0x4a3f30, alpha: 0.5 + hash(i * 6.6) * 0.3 })
      }
      return bake(g)
    })()
    // district SEAMS (kill list §8.11): populateEdge draws T.fence — a picket fence — at EVERY
    // land/land border, including between a farm and a moor. A seam is a chance to say what the two
    // regions are; three seam bakes cost the same as one reused one.
    T.hedgeSeam = (() => {
      const g = new Graphics()
      const h = DISTRICT_EDGE.hedge
      for (let k = 0; k < h.lobes; k++) {
        const hx = (k - (h.lobes - 1) / 2) * h.pitchPx * 0.55
        g.circle(hx, (hash(k * 3.1) - 0.5) * 4, 8 + hash(k * 5.3) * 3).fill(h.color)
      }
      g.rect(-h.lobes * h.pitchPx * 0.3, 5, h.lobes * h.pitchPx * 0.6, 3).fill({ color: 0x000000, alpha: 0.25 })
      return bake(g)
    })()
    // v5.10.1: was a filled rect + 16 IDENTICAL 2px ticks — no stone outlines, no cap course. Now a
    // running-bond course of individually-outlined stone blocks (two staggered rows, joints offset
    // like a real dry-stone wall) plus a lighter cap-stone line along the top.
    T.wallSeam = (() => {
      const g = new Graphics()
      const w = DISTRICT_EDGE.wall
      g.rect(-70, -4, 140, 8).fill({ color: w.color, alpha: 0.9 })
      const blockW = w.pitchPx * 0.62
      for (const row of [0, 1]) {
        const y0 = -4 + row * 4
        const offset = row ? blockW * 0.5 : 0
        for (let x = -70 - offset; x < 70; x += blockW) {
          const bx0 = Math.max(-70, x), bx1 = Math.min(70, x + blockW)
          if (bx1 <= bx0) continue
          g.rect(bx0, y0, bx1 - bx0, 4).stroke({ width: 0.9, color: 0x000000, alpha: row ? 0.28 : 0.32 })
        }
      }
      g.rect(-70, -4, 140, 1.6).fill({ color: 0xffffff, alpha: 0.12 })   // cap course: a lighter lid line
      g.rect(-70, 4, 140, 2.5).fill({ color: 0x000000, alpha: 0.3 })     // ground-contact shadow
      return bake(g)
    })()

    // ---- threat glyphs (spec §3.2) -----------------------------------------------------------
    // "Everything STATIC in a telegraph is a BAKED TEXTURE scaled to the live radius; only the
    // MOVING element is per-frame Graphics." This is not a mitigation, it is the design —
    // SHELL_MAX_LIVE (6) and MAX_STRAFE_LOCKS (10) telegraphs of graduated ticks drawn live would
    // not hold on a phone. All of these bake WHITE so one glyph can be tinted per threat.
    const TREF = 100
    // ARTILLERY: the only SQUARE telegraph in the game. Four L corner brackets + ranging
    // graduations on two edges (every 3rd long) — a surveyor's target box, not a circle.
    T.tgSquare = (() => {
      const g = new Graphics()
      const a = SKIES_FX.artillery
      const arm = TREF * 0.34
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          g.moveTo(sx * TREF, sy * TREF - sy * arm).lineTo(sx * TREF, sy * TREF)
            .lineTo(sx * TREF - sx * arm, sy * TREF)
            .stroke({ width: 5, color: 0xffffff, join: 'miter', cap: 'butt' })
        }
      }
      for (let k = 0; k < a.graduations; k++) {                      // ranging ticks on two edges
        const t = -TREF * 0.55 + (k / (a.graduations - 1)) * TREF * 1.1
        const long = k % a.gradEveryLong === 0
        g.rect(t - 1.5, -TREF, 3, long ? 13 : 7).fill({ color: 0xffffff, alpha: 0.9 })
        g.rect(-TREF, t - 1.5, long ? 13 : 7, 3).fill({ color: 0xffffff, alpha: 0.9 })
      }
      return { ...bake(g, 0), ref: TREF }
    })()
    // the sweeping hand, in two parts so the dark HATCH BARS and the ochre wedge FILL can be
    // tinted independently (the only hatched fill in the game, per the threat table)
    T.tgHandFill = (() => {
      const g = new Graphics()
      g.poly([0, 0, TREF, -TREF * 0.17, TREF, TREF * 0.17]).fill(0xffffff)
      return { ...bake(g, 0), ref: TREF }
    })()
    T.tgHandBars = (() => {
      const g = new Graphics()
      for (let k = 0; k < 6; k++) {
        const x0 = TREF * (0.16 + k * 0.14)
        const hw = x0 * 0.17
        g.moveTo(x0 - 6, -hw).lineTo(x0 + 6, hw).stroke({ width: 3.2, color: 0xffffff, cap: 'butt' })
      }
      return { ...bake(g, 0), ref: TREF }
    })()
    // the falling shell's OWN shadow — hard-ish edge (a shadow, not a glow). ARTILLERY ONLY (v5.10.1:
    // this used to also serve sky's ionisation wash and crush's warm interior spill — three unrelated
    // threats sharing one texture, tinted differently, which a reviewer correctly called out as "not
    // actually differentiated" — see T.skyIonWash and T.crushSpill below for their own dedicated bakes.
    T.shellShadow = { tex: canvasTex(128, 128, (ctx, w) => {
      const gr = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
      gr.addColorStop(0, 'rgba(255,255,255,1)')
      gr.addColorStop(0.7, 'rgba(255,255,255,0.92)')
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gr; ctx.fillRect(0, 0, w, w)
    }), ax: 0.5, ay: 0.5, ref: 64 }
    // sky's OWN ionisation wash — a soft, no-hard-edge diffuse haze (reads as ENERGY, not MASS),
    // unlike T.shellShadow's opaque disc with a hard-ish 0.7 cutoff (reads as a solid falling object).
    T.skyIonWash = { tex: canvasTex(128, 128, (ctx, w) => {
      const gr = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
      gr.addColorStop(0, 'rgba(255,255,255,0.8)')
      gr.addColorStop(0.4, 'rgba(255,255,255,0.4)')
      gr.addColorStop(1, 'rgba(255,255,255,0)')     // pure soft falloff, no hard edge anywhere
      ctx.fillStyle = gr; ctx.fillRect(0, 0, w, w)
    }), ax: 0.5, ay: 0.5, ref: 64 }
    // SKY: the impact mark is a ring of INWARD-POINTING CHEVRONS closing on the strike point — NOT
    // corner brackets. v5.10.1 P0 fix: T.skyBrackets used to be T.tgSquare's four L corners
    // copy-pasted with different arm/width numbers (both shrink inward over the fuse, both sat on the
    // SAME shellShadow disc) — two of the spec's three separation axes shared, and past
    // SKIES_TELEGRAPH_LOD_PX the `far` gate strips everything else, leaving "a bracket + a disc" as
    // literally the same picture in different tints (fails the spec's own greyscale test, §9.5). A
    // ring of chevrons is a fundamentally different silhouette from a square of L corners even in
    // greyscale, at any distance, and it echoes the descent vector's own sliding chevrons (§3 sky row)
    // instead of borrowing artillery's language.
    T.skyChevrons = (() => {
      const g = new Graphics()
      const n = 6
      const arm = TREF * 0.24
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        const cx = Math.cos(a) * TREF, cy = Math.sin(a) * TREF
        const ux = -Math.cos(a), uy = -Math.sin(a)          // inward, toward the strike point
        const px2 = -uy, py2 = ux
        g.moveTo(cx + px2 * arm * 0.55, cy + py2 * arm * 0.55)
          .lineTo(cx + ux * arm, cy + uy * arm)
          .lineTo(cx - px2 * arm * 0.55, cy - py2 * arm * 0.55)
          .stroke({ width: 7, color: 0xffffff, join: 'round', cap: 'round' })
      }
      return { ...bake(g, 0), ref: TREF }
    })()
    // Lichtenberg trees — dendritic branches burned into the ground by a strike. Pre-computed
    // (4 variants so no two scars match), recursive, 3 generations, tapering.
    T.branchTree = []
    for (let v = 0; v < SKIES_FX.sky.branchTrees; v++) {
      const g = new Graphics()
      const grow = (x, y, ang, len, w, gen, salt) => {
        const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len
        g.moveTo(x, y).lineTo(ex, ey).stroke({ width: w, color: 0xffffff, cap: 'round' })
        if (gen <= 0) return
        const n = 2 + (hash(salt * 3.1) > 0.6 ? 1 : 0)
        for (let k = 0; k < n; k++) {
          const spread = (hash(salt * 5.7 + k * 2.3) - 0.5) * 1.5
          grow(ex, ey, ang + spread, len * (0.52 + hash(salt * 7.3 + k) * 0.25), w * 0.55, gen - 1, salt * 1.7 + k * 4.1 + 3)
        }
      }
      for (let s = 0; s < 5; s++) {
        const a = (s / 5) * Math.PI * 2 + v * 0.4
        grow(0, 0, a, 46 + hash(v * 3.3 + s) * 20, 4.5, 2, v * 11 + s * 2.7 + 1)
      }
      T.branchTree.push({ ...bake(g), ref: 200 })
    }
    // MISSILE: a rotating lock diamond — four corner ticks on a 45-degree square, anchored on YOU.
    // The only mark in the game that lives on the player.
    T.lockDiamond = (() => {
      const g = new Graphics()
      const R = SKIES_FX.missile.diamondPx / 2
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4
        const cx = Math.cos(a) * R, cy = Math.sin(a) * R
        const ta = a + Math.PI / 2
        g.moveTo(cx - Math.cos(ta) * R * 0.42, cy - Math.sin(ta) * R * 0.42)
          .lineTo(cx, cy).lineTo(cx + Math.cos(ta) * R * 0.42, cy + Math.sin(ta) * R * 0.42)
          .stroke({ width: 3, color: 0xffffff, join: 'miter' })
      }
      return { ...bake(g, 0), ref: R }
    })()
    T.missileDart = (() => {                                    // the physical projectile itself
      const g = new Graphics()
      g.poly([9, 0, 2, -3, -8, -3, -8, 3, 2, 3]).fill(0xd8d4cc).stroke({ width: 1, color: 0x2a2620 })
      g.poly([-4, -3, -9, -7, -6, -3]).fill(0x8a8f96)
      g.poly([-4, 3, -9, 7, -6, 3]).fill(0x8a8f96)
      g.rect(-2, -1.2, 6, 2.4).fill({ color: 0xff2d6f, alpha: 0.9 })   // signal-magenta band
      return bake(g)
    })()
    T.magentaStar = (() => {                                    // missile impact: a hard star
      const g = new Graphics()
      const pts = []
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2
        const r = k % 2 ? 8 : 26
        pts.push(Math.cos(a) * r, Math.sin(a) * r)
      }
      g.poly(pts).fill(0xffffff)
      return bake(g)
    })()
    T.sootRing = { tex: canvasTex(128, 128, (ctx, w) => {
      const gr = ctx.createRadialGradient(w / 2, w / 2, w * 0.18, w / 2, w / 2, w / 2)
      gr.addColorStop(0, 'rgba(255,255,255,0)')
      gr.addColorStop(0.45, 'rgba(255,255,255,0.85)')
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gr; ctx.fillRect(0, 0, w, w)
    }), ax: 0.5, ay: 0.5 }
    // JET: the halogen landing-light pool, additive, aspect 1 : 0.22
    T.landingPool = canvasTex(512, 112, (ctx, w, h) => {
      ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(1, h / w)
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, w / 2)
      gr.addColorStop(0, 'rgba(255,255,255,1)')
      gr.addColorStop(0.5, 'rgba(255,255,255,0.42)')
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore()
    })
    // CRUSH: angular hard-edged shards with VISIBLE EDGES (slab / roof tile / plank). This is what
    // replaces crushBurst's soft round Kenney circle_05 puffs — soft round particles are precisely
    // what makes a collapsing building read as a cartoon dust cloud (kill list §8.4).
    T.shard = [
      (() => { const g = new Graphics(); g.poly([-7, -5, 8, -6, 7, 5, -6, 6]).fill(0xffffff).stroke({ width: 1.4, color: 0x7a7a7a }); return bake(g) })(),
      (() => { const g = new Graphics(); g.poly([-5, -4, 6, -6, 4, 5, -6, 3]).fill(0xffffff).stroke({ width: 1.2, color: 0x707070 }); g.moveTo(-4, 0).lineTo(4, -1).stroke({ width: 0.8, color: 0x8a8a8a }); return bake(g) })(),
      (() => { const g = new Graphics(); g.poly([-11, -2.5, 11, -3.5, 11, 2.5, -11, 3.5]).fill(0xffffff).stroke({ width: 1.1, color: 0x757575 }); return bake(g) })(),
    ]
    T.dustSkirt = canvasTex(256, 128, (ctx, w, h) => {
      ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(1, h / w)
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, w / 2)
      gr.addColorStop(0, 'rgba(255,255,255,0.55)')
      gr.addColorStop(0.55, 'rgba(255,255,255,0.26)')
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore()
    })
    T.clod = (() => {
      const g = new Graphics()
      g.poly([-4, -3, 4, -4, 5, 2, -2, 4]).fill(0xffffff).stroke({ width: 1, color: 0x6a6a6a })
      return bake(g)
    })()
    T.smokePuff = canvasTex(64, 64, (ctx, w) => {
      const gr = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
      gr.addColorStop(0, 'rgba(255,255,255,0.85)')
      gr.addColorStop(0.6, 'rgba(255,255,255,0.32)')
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gr; ctx.fillRect(0, 0, w, w)
    })
    // v5.10.1: a denser, harder-edged core than T.smokePuff's fully-gauzy falloff — grit is solid
    // debris, smoke is gas, and they should not read as the same particle at different sizes.
    T.gritPuff = canvasTex(32, 32, (ctx, w) => {
      const gr = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
      gr.addColorStop(0, 'rgba(255,255,255,1)')
      gr.addColorStop(0.55, 'rgba(255,255,255,0.9)')
      gr.addColorStop(0.75, 'rgba(255,255,255,0.3)')
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gr; ctx.fillRect(0, 0, w, w)
    })
    // JET stitch: the small dark ground-scorch mark the tracer dash leaves. This glyph's "home".
    T.scorchTick = (() => {
      const g = new Graphics()
      g.poly([-3, -1.4, 3, -1.8, 3.4, 1.4, -2.6, 1.8]).fill(0xffffff)
      return bake(g)
    })()
    // v5.10.1: T.scorchTick used to also serve sky's rising sparks and missile's impact sparks —
    // three unrelated threats sharing one small glyph. Each gets its own shape now: sky's sparks
    // RISE (a thin vertical streak, not a ground-hugging flag) and missile's are a radiating fleck.
    T.sparkTick = (() => {                                     // SKY: a thin rising spark streak
      const g = new Graphics()
      g.poly([0, 3.2, 0.7, -3.2, 0, -4, -0.7, -3.2]).fill(0xffffff)
      return bake(g)
    })()
    T.impactFleck = (() => {                                   // MISSILE: a small radiating diamond
      const g = new Graphics()
      g.poly([0, -3.4, 2.3, 0, 0, 3.4, -2.3, 0]).fill(0xffffff)
      return bake(g)
    })()
    T.artFireball = (() => {                                   // BLACK-CORED fireball: ordnance, not a pop
      const g = new Graphics()
      g.circle(0, 0, 30).fill({ color: SKIES_FX.artillery.fireball, alpha: 0.85 })
      g.circle(0, 0, 20).fill({ color: SKIES_FX.artillery.fireball, alpha: 1 })
      g.circle(2, 1, 11).fill(SKIES_FX.artillery.fireballCore)
      return bake(g)
    })()
    // v5.10.1 P0 fix: warm interior-spill glow (crush's ONE beat of ambience gold, spec palette law
    // 1) used to reuse T.shellShadow — a hard-edged FALLING-OBJECT shadow tinted gold. A soft square
    // glow (matching the palette law's "static <=5px lit rectangle" language) is a genuinely different
    // read: light bleeding from a window, not a shadow cast by something overhead.
    T.crushSpill = canvasTex(96, 96, (ctx, w) => {
      const gr = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
      gr.addColorStop(0, 'rgba(255,255,255,0.9)')
      gr.addColorStop(0.5, 'rgba(255,255,255,0.4)')
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gr
      ctx.fillRect(w * 0.28, w * 0.28, w * 0.44, w * 0.44)   // a soft SQUARE spill, not a disc
    })
    // VOLATILE ELITE BOMB (spec-adjacent P0 fix, config.js SKIES_FX.volatile) — a toothed ring that
    // GROWS unstable rather than closing inward like gun/sky, so its motion axis differs from both.
    // Acid-green, never red (palette law: red is alert-only), never violet or ochre.
    T.voltRing = (() => {
      const g = new Graphics()
      const teeth = 10
      for (let i = 0; i < teeth; i++) {
        const a = (i / teeth) * Math.PI * 2
        const x0 = Math.cos(a) * TREF * 0.86, y0 = Math.sin(a) * TREF * 0.86
        const x1 = Math.cos(a) * TREF * 1.08, y1 = Math.sin(a) * TREF * 1.08
        g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 6, color: 0xffffff, cap: 'round' })
      }
      g.circle(0, 0, TREF * 0.86).stroke({ width: 3, color: 0xffffff, alpha: 0.7 })
      return { ...bake(g, 0), ref: TREF }
    })()
    T.voltSpike = (() => {                                     // detonation: a hard acid spike, not
      const g = new Graphics()                                  // a fireball and not a bolt
      g.poly([0, -10, 2.6, -1.5, 0, 0, -2.6, -1.5]).fill(0xffffff)
      return bake(g)
    })()
    T.voltCore = canvasTex(48, 48, (ctx, w) => {                // the small pulsing unstable core —
      const gr = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)   // its own dedicated
      gr.addColorStop(0, 'rgba(255,255,255,1)')                                   // glow, not T.dot
      gr.addColorStop(0.5, 'rgba(255,255,255,0.5)')
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gr; ctx.fillRect(0, 0, w, w)
    })
    T.plate = (() => {                                         // rampage dorsal plate
      const g = new Graphics()
      g.poly([0, -9, 6, 0, 0, 8, -6, 0]).fill(0xffffff)
      return bake(g)
    })()
    // v5.10.1: the rampage heartbeat ring used to reuse T.novaRing — the SAME plain double-ring
    // shared with revive and shatter (both also 0.35-0.45s). T.novaRing stays exactly as-is (it is
    // cross-chapter shared machinery, "the same neutral ring, recolored", used well beyond skies —
    // touching it would be an unrequested change to every other chapter). Rampage gets its own
    // notched pulse ring instead, so its "only looping effect" is not a recolor of two other systems.
    T.rampagePulse = (() => {
      const g = new Graphics()
      g.circle(0, 0, 64).stroke({ width: 6, color: 0xffffff, alpha: 0.55 })
      const teeth = 10
      for (let i = 0; i < teeth; i++) {
        const a = (i / teeth) * Math.PI * 2
        g.moveTo(Math.cos(a) * 58, Math.sin(a) * 58).lineTo(Math.cos(a) * 76, Math.sin(a) * 76)
          .stroke({ width: 3, color: 0xffffff })
      }
      return bake(g)
    })()
    // v5.10.1: the rampage screen bloom used to be a bare `T.fx.circle_05` — the same Kenney particle
    // geyser bubbles, conduct arcs and traffic exhaust all reuse verbatim. A screen bloom's shape IS
    // correctly a soft radial gradient (that is what a glow is), so the fix here is giving rampage its
    // OWN hand-authored bake rather than sharing the literal asset three unrelated effects use.
    T.rampageBloom = canvasTex(256, 256, (ctx, w) => {
      const gr = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
      gr.addColorStop(0, 'rgba(255,255,255,0.9)')
      gr.addColorStop(0.35, 'rgba(255,255,255,0.55)')
      gr.addColorStop(0.7, 'rgba(255,255,255,0.18)')
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gr; ctx.fillRect(0, 0, w, w)
    })
    // v5.10.1: artillery's muzzle flash and missile's exhaust used to both reuse the generic
    // T.fx.flare_01 (shared, elsewhere in this file, by frostarc/shockarc/homing/beam — fine for
    // those, since they are not one of this chapter's own six threats). These two ARE, so they get
    // their own small bakes: a muzzle flash is a hard angular burst, an exhaust is a soft trailing
    // comet, and neither is the shared round flare.
    T.muzzleFlash = (() => {
      const g = new Graphics()
      const pts = []
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2
        const r = k % 2 ? 4 : 11
        pts.push(Math.cos(a) * r, Math.sin(a) * r)
      }
      g.poly(pts).fill(0xffffff)
      return bake(g)
    })()
    T.exhaustPuff = canvasTex(48, 48, (ctx, w) => {
      const gr = ctx.createRadialGradient(w * 0.6, w / 2, 0, w * 0.6, w / 2, w * 0.5)
      gr.addColorStop(0, 'rgba(255,255,255,0.9)')
      gr.addColorStop(0.5, 'rgba(255,255,255,0.4)')
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gr; ctx.fillRect(0, 0, w, w)
    })

    // v5.16: the LIGHT LAYER is gone — searchlight cones, kerb lamps, klaxon rings and the
    // blinking aviation beacons, plus their four bakes (T.lightCone/T.lampPool/T.klaxonRing/
    // T.lampMast) and every pool and update that drove them. It was the chapter's stated identity
    // ("the lights are looking for you") and it was also, by volume, the largest source of moving
    // pale shapes on the floor. Removed on the same call as the rest of the declutter pass.
    // NOTE: this retires the one gameplay hook it carried — a cone was anchored to a CRUSHABLE
    // structure, so flattening the anchor killed the cone mid-sweep. Nothing else read that link.

    // ---- road markings + decals + junctions (spec §4.2-§4.3) ----------------------------------
    // The carriageway tile is stamped at a NON-UNIFORM scale (x 0.48, y 0.34 minor / 0.62 major),
    // so anything baked into it is stretched by a different factor on each axis AND per road class.
    // Only shapes that survive that go in here, pre-compensated; everything with a shape becomes a
    // separate, uniformly-scaled decal below.
    {
      const RP = ROAD_PAINT
      const REF = 100
      function carriageway(major) {
        const g = new Graphics()
        const sy = major ? RP.stretchYMajor : RP.stretchYMinor
        const px = (v) => v / RP.stretchX      // world px -> REF units along the road
        const py = (v) => v / sy               // world px -> REF units across the road
        g.rect(-REF / 2, -REF / 2, REF, REF).fill(major ? RP.asphaltMajor : RP.asphaltMinor)
        // wet crown sheen: a static overhead reflection of the storm sky down the centreline.
        // ponytail (spec §11): no dynamic sheen sprite — the full-field lightning flash already
        // whitens it, and a per-road-cell additive sheen would be ~1000 extra sprites at cell 30.
        g.rect(-REF / 2, -py(6), REF, py(12)).fill({ color: RP.sheen, alpha: RP.sheenAlpha })
        for (const s of [-1, 1]) {             // wheel-polish bands where tyres actually run
          const c = s * REF / 2 * RP.polishAt
          g.rect(-REF / 2, c - py(3.5), REF, py(7)).fill({ color: RP.polish, alpha: RP.polishAlpha })
        }
        for (const s of [-1, 1]) {             // kerb line, both long edges
          g.rect(-REF / 2, s * (REF / 2 - py(RP.kerbW)) - (s < 0 ? 0 : py(RP.kerbW)) + (s < 0 ? 0 : 0), REF, py(RP.kerbW))
            .fill(RP.kerb)
        }
        if (major) {
          for (const s of [-1, 1]) {           // double yellow
            g.rect(-REF / 2, s * py(RP.doubleYellowGap / 2) - py(RP.doubleYellowW / 2), REF, py(RP.doubleYellowW))
              .fill({ color: RP.doubleYellow, alpha: 0.9 })
          }
        } else {
          // ONE dash, centred. The tile is stamped every ROAD_CELL (30) world px and is 1.6 cells
          // wide, so neighbouring stamps overlap — a baked dash PATTERN would double-print into
          // mush. One dash per tile centre lands them at an exact 30px pitch along the street.
          g.rect(-px(7), -py(1.4), px(14), py(2.8)).fill({ color: RP.centreline, alpha: RP.centrelineAlpha })
        }
        return { ...bake(g, 0), ref: REF }
      }
      T.roadMinor = carriageway(false)
      T.roadMajor = carriageway(true)
    }
    T.rdManhole = (() => {
      const g = new Graphics()
      const k = ROAD_DECAL.kinds.manhole
      g.circle(0, 0, k.r).fill(k.color).stroke({ width: 1.2, color: 0x22262c })
      for (let t = 0; t < k.rimTicks; t++) {
        const a = (t / k.rimTicks) * Math.PI * 2
        g.moveTo(Math.cos(a) * k.r * 0.55, Math.sin(a) * k.r * 0.55)
          .lineTo(Math.cos(a) * k.r * 0.9, Math.sin(a) * k.r * 0.9)
          .stroke({ width: 1, color: 0x22262c, alpha: 0.8 })
      }
      return bake(g, 1)
    })()
    T.rdPatch = (() => {
      const g = new Graphics()
      const k = ROAD_DECAL.kinds.patch
      const pts = []
      for (let s = 0; s < k.sides; s++) {
        const a = (s / k.sides) * Math.PI * 2
        const r = (k.px / 2) * (0.68 + hash(s * 7.3 + 1.9) * 0.55)
        pts.push(Math.cos(a) * r, Math.sin(a) * r)
      }
      g.poly(pts).fill(k.color).stroke({ width: 1.2, color: 0x22262c, alpha: 0.7 })
      return bake(g, 1)
    })()
    // v5.10.1: was two bare rects — no grate bars, no kerb lip. Now each slot gets a stroked kerb
    // lip and internal grate bars (a storm drain, not a hole).
    T.rdDrain = (() => {
      const g = new Graphics()
      const k = ROAD_DECAL.kinds.drain
      for (const s of [-1, 1]) {
        const y0 = s * k.pairGap / 2 - k.slotH / 2
        g.rect(-k.slotW / 2 - 1, y0 - 1, k.slotW + 2, k.slotH + 2).stroke({ width: 1, color: 0x4a4f57, alpha: 0.6 })
        g.rect(-k.slotW / 2, y0, k.slotW, k.slotH).fill(k.color)
        const bars = 4
        for (let b = 1; b < bars; b++) {
          const bx = -k.slotW / 2 + (b / bars) * k.slotW
          g.moveTo(bx, y0 + 0.4).lineTo(bx, y0 + k.slotH - 0.4).stroke({ width: 0.8, color: 0x14171b, alpha: 0.8 })
        }
      }
      return bake(g, 1)
    })()
    // v5.10.1: was one rectangle plus one triangle. Now a single tapered-shaft, winged-head polygon
    // with a thin outline — a real painted turn-arrow silhouette, not two primitives glued together.
    T.rdArrow = (() => {
      const g = new Graphics()
      const k = ROAD_DECAL.kinds.arrow
      const L = k.lenPx
      g.poly([
        -L / 2, -1.6,
        L * 0.05, -1.6,
        L * 0.05, -5,
        L / 2, 0,
        L * 0.05, 5,
        L * 0.05, 1.6,
        -L / 2, 1.6,
      ]).fill({ color: k.color, alpha: k.alpha }).stroke({ width: 1, color: 0x000000, alpha: 0.15 })
      return bake(g, 1)
    })()
    // JUNCTIONS — enumerated, not stamped, and baked AT TRUE WORLD SIZE so they are never scaled
    // at all (which is what lets a junction carry circles and a zebra pitch the stretched
    // carriageway tile cannot).
    T.junction = {}
    for (const variant of ROAD_JUNCTION.variants) {
      const J = ROAD_JUNCTION
      const vMajor = variant.startsWith('major')
      const hMajor = variant.endsWith('Major')
      const vh = (vMajor ? ROAD_MAJOR_WIDTH : ROAD_MINOR_WIDTH) / 2
      const hh = (hMajor ? ROAD_MAJOR_WIDTH : ROAD_MINOR_WIDTH) / 2
      const g = new Graphics()
      const zebraDepth = 22
      g.rect(-vh, -hh, vh * 2, hh * 2).fill(vMajor || hMajor ? ROAD_PAINT.asphaltMajor : ROAD_PAINT.asphaltMinor)
      // four approach zebra crosswalks: 7 bars, every 3rd worn
      for (const [ax, ay] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const along = ax ? hh : vh          // half-width of the street being crossed
        const outAt = ax ? vh : hh
        for (let b = 0; b < J.zebraBars; b++) {
          const t = -along + 3 + (b * (along * 2 - 6)) / (J.zebraBars - 1)
          const worn = b % J.zebraWornEvery === 0
          const alpha = worn ? J.zebraWornAlpha : J.zebraAlpha
          if (ax) g.rect(ax * outAt + (ax > 0 ? 3 : -3 - zebraDepth), t - 2, zebraDepth, 4).fill({ color: J.zebraColor, alpha })
          else g.rect(t - 2, ay * outAt + (ay > 0 ? 3 : -3 - zebraDepth), 4, zebraDepth).fill({ color: J.zebraColor, alpha })
        }
        // stop bar behind each crossing
        if (ax) g.rect(ax * (outAt + zebraDepth + 5), -along, J.stopBarW, along * 2).fill({ color: J.zebraColor, alpha: 0.5 })
        else g.rect(-along, ay * (outAt + zebraDepth + 5), along * 2, J.stopBarW).fill({ color: J.zebraColor, alpha: 0.5 })
      }
      if (J.arrowsOnMajor && (vMajor || hMajor)) {   // painted turn arrow on each major approach
        const k = ROAD_DECAL.kinds.arrow
        if (hMajor) {
          g.rect(-vh - 46, -hh * 0.5 - 2, 18, 4).fill({ color: k.color, alpha: k.alpha })
          g.poly([-vh - 26, -hh * 0.5, -vh - 38, -hh * 0.5 - 6, -vh - 38, -hh * 0.5 + 6]).fill({ color: k.color, alpha: k.alpha })
        }
        if (vMajor) {
          g.rect(vh * 0.5 - 2, hh + 28, 4, 18).fill({ color: k.color, alpha: k.alpha })
          g.poly([vh * 0.5, hh + 26, vh * 0.5 - 6, hh + 38, vh * 0.5 + 6, hh + 38]).fill({ color: k.color, alpha: k.alpha })
        }
      }
      for (let m = 0; m < J.manholes; m++) {
        g.circle((m - 0.5) * vh * 0.9, (0.5 - m) * hh * 0.7, 7).fill(ROAD_DECAL.kinds.manhole.color)
          .stroke({ width: 1.2, color: 0x22262c })
      }
      if (variant === J.stalledCar) {
        // one abandoned sedan slewed across the box — everyone fled. The only survivor of the cut
        // "emergency vehicles" proposal (a driving vehicle needs a pathfinder over roadAt).
        const V2 = SKIES_VEHICLE.sedan
        const ca = 0.7, cs = Math.sin(ca), cc = Math.cos(ca)
        const quad = (lx, ly) => [lx * cc - ly * cs + 6, lx * cs + ly * cc - 4]
        const corners = [[-V2.len / 2, -V2.w / 2], [V2.len / 2, -V2.w / 2], [V2.len / 2, V2.w / 2], [-V2.len / 2, V2.w / 2]]
        g.poly(corners.map(([lx, ly]) => quad(lx, ly)).flat()).fill(0x6f7f8f).stroke({ width: 1.2, color: 0x2b3038 })
        g.poly([[-4, -V2.w / 2 + 1.5], [6, -V2.w / 2 + 2.5], [6, V2.w / 2 - 2.5], [-4, V2.w / 2 - 1.5]].map(([lx, ly]) => quad(lx, ly)).flat())
          .fill({ color: SKIES_VEHICLE.glass, alpha: SKIES_VEHICLE.glassAlpha })
      }
      T.junction[variant] = bake(g, 2)
    }
  }
  buildSkiesTextures()

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
    // v5.10 (kill list §8.6): T.foam used to live here — `T.fx.trace_05`, i.e. the sea district's
    // breaking-wave prop WAS the pond's current-streak sprite, reused a third time by populateEdge
    // for coastlines. It is gone; skies draws T.waveCrest, a real crest (two parallel arcs and a
    // foam speckle band), baked in buildSkiesTextures.
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
  const roadLayer = new Container()   // skies only (v5.9) — sits over the district floor tint, under every prop
  const roadDecalLayer = new Container() // skies only (v5.10) — manholes/patches/drains/arrows, uniformly scaled
  const junctionLayer = new Container()  // skies only (v5.10) — enumerated crosswalk composites, true world size
  const ruinLayer = new Container()      // skies only (v5.10) — permanent crush ruins, from the render-local ledger
  const bigLayer = new Container()
  const midLayer = new Container()
  const detailLayer = new Container()
  const clutterLayer = new Container() // skies-urban only (v5.9) — extra furniture, see populateClutter
  const edgeLayer = new Container() // skies districts only (v5.9.1) — border markers, see populateEdge
  // v5.12: groundLayer sits UNDER everything and carries the terrain's COLOUR as a continuous field
  // (see updateGroundField). blotchLayer above it now carries only texture. Separating the two is the
  // fix for the checkerboard — see updateGroundField's header for the full account.
  const groundLayer = new Container()
  floorLayer.addChild(groundLayer, blotchLayer, roadLayer, roadDecalLayer, junctionLayer, ruinLayer,
    bigLayer, midLayer, detailLayer, clutterLayer, edgeLayer)

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

  // ---- the light layer (v5.10, spec §7) — the chapter's identity -------------------------------
  // "TOKUSATSU NIGHT — the lights are looking for you." Sits between the cloud shadows and the
  // entities so light cuts THROUGH cloud shadow. blendMode appears nowhere else in this file:
  // additive is a new concept here and it is a CORRECTNESS requirement, not a perf note. Each
  // sub-container draws from exactly ONE texture, or Pixi v8's batcher breaks on every
  // blend-mode/texture transition — three sub-containers, three draw calls.
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
  // v5.10 skies: the jet strafe's halogen landing-light pool is the one telegraph element that must
  // be ADDITIVE (a light on wet asphalt, not a painted band) — its own single-texture container, so
  // the blend-mode switch costs exactly one batch break. rampG carries the rampage rim-lights and
  // heartbeat ring; smokeLayer is the second particle pool (spec §1.2).
  const strafePoolLayer = new Container()
  strafePoolLayer.blendMode = 'add'
  const shellLayer = new Container()   // baked artillery glyphs (box / hatched hand / shell shadow)
  const skyLayer = new Container()     // baked sky-strike glyphs (chevron ring / ionisation wash)
  const voltLayer = new Container()    // baked volatile-elite-bomb glyph (P0 fix, its own drawer)
  const scarLayer = new Container()    // Lichtenberg ground scars, fading
  const lockLayer = new Container()    // the missile lock diamond — the only mark anchored to YOU
  const rampG = new Graphics()
  const smokeLayer = new Container()
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
  const rockLayer = new Container()   // v5.21 lane: drifting asteroids (run.rocks)
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
    scarLayer, bombG, shellLayer, skyLayer, voltLayer, stripG, laneG, hazardG, teleG, strafePoolLayer, rampG, pacerG,
    rockLayer,
    enemyShadowLayer, enemyLayer, enemyCrownLayer,
    bloomLayer, lureLayer, shieldG, affixLayer, lockLayer, playerC,
    bulletLayer, boomerangLayer, orbLayer, debrisLayer, homingLayer, shotLayer, beamLayer, whipLayer, arcG,
    lobLayer, carLayer, smokeLayer, particleLayer, textLayer,
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
  // Floor tint at a WORLD position: the single chapterRender.floorTint everywhere except skies,
  // where it's the blended per-district tint (config.js districtTintAt) sampled at that spot —
  // this is what makes the ground shift smoothly as the player roams across a Voronoi border.
  function floorTintAt(wx, wy) {
    return chapterHasDistricts ? districtTintAt(wx, wy, districtSeed) : chapterRender.floorTint
  }

  // Per-district on-screen size band for the ground pattern below (v5.9.1) — the "pattern
  // density" half of the ask: downtown reads tighter/denser (a paved grid), farms/sea read
  // broader/sparser (a wide field, calm open water). Districts absent here (parks) fall through
  // to the original chapter-wide [0.9, 1.6] blotch band, unchanged.
  const DISTRICT_GROUND_SCALE = {
    downtown: [0.65, 1.0],
    suburbs:  [0.9, 1.4],
    farms:    [1.1, 1.7],
    hills:    [0.8, 1.3],
    sea:      [1.2, 1.9],
  }
  // ---- THE GROUND COLOUR FIELD (v5.12) ----------------------------------------------------------
  // "You still don't understand how to do procedural layout coherent... layout coherence is just
  // awful" (playtest report, with wide-area captures).
  //
  // v5.11's populateTerrain put ONE OPAQUE SPRITE PER 280px CELL and tinted it from a SINGLE sample
  // of districtTintAt taken at the cell's centre. districtTintAt is continuous everywhere by
  // construction — that was the whole point of building it out of the raw elevation/moisture/urban
  // fields — and then this layer threw all of that away by point-sampling it onto an axis-aligned
  // lattice. One decision, three separate symptoms in the captures:
  //
  //   * the whole map reads as a CHECKERBOARD of flat 280px squares;
  //   * every biome boundary is an axis-aligned STAIRCASE, so a coastline comes out as a straight
  //     horizontal line — the single most obvious "this is generated" tell in the whole image;
  //   * where a field hovers near a threshold (elevation near SEA_LEVEL), neighbouring cells land on
  //     opposite sides of it and the ground breaks into SALT-AND-PEPPER — isolated blue squares
  //     stranded in dry land, which is what the report was pointing at.
  //
  // The fix is to stop making one layer do two jobs. COLOUR is a continuous field and is drawn here,
  // as a low-resolution bilinear-filtered texture per chunk: sample districtTintAt on a coarse grid,
  // upload it as a tiny canvas texture, and let the GPU's linear filtering reconstruct a smooth
  // gradient across the whole chunk. TEXTURE (crop rows, ripples, canopy) stays on the tile layer
  // below, but carries no colour at all, so its grid has nothing to quantise and becomes invisible.
  // This is the standard terrain split — a smooth blend/splat map plus tiled detail — and it is why
  // real terrain renderers do not have this problem.
  //
  // SEAMS. A texture drawn with linear filtering clamps at its outer half-texel, so two adjacent
  // chunks would disagree along their shared edge and leave a visible line — the same class of
  // artefact this is meant to remove. Each chunk therefore samples ONE EXTRA TEXEL OF PADDING on
  // every side and is drawn one texel larger, so texel centres land exactly on the chunk boundary
  // and a neighbour's edge texel holds the identical value. The interpolation is then continuous
  // across the join by construction, not by tuning.
  //
  // COST. districtTintAt is ~1.7us, so a chunk is GROUND_FIELD_N^2 x that, paid ONCE when the chunk
  // is created and then cached: at 24x24 over 512px that is ~0.6ms, and crossing a chunk boundary
  // creates about four. Nothing is recomputed per frame.
  const GROUND_CHUNK = 512      // world px covered by one chunk
  const GROUND_FIELD_N = 24     // samples across a chunk (world px per sample = 512/24 ≈ 21)
  const groundChunks = new Map()   // "i,j" -> Sprite
  const groundFree = []

  function buildGroundChunk(ci, cj) {
    const N = GROUND_FIELD_N
    const ts = GROUND_CHUNK / N            // world px per texel
    const c = document.createElement('canvas')
    c.width = c.height = N + 2             // +1 texel of padding each side, see SEAMS above
    const ctx = c.getContext('2d')
    const img = ctx.createImageData(N + 2, N + 2)
    const ox = ci * GROUND_CHUNK, oy = cj * GROUND_CHUNK
    for (let ty = 0; ty < N + 2; ty++) {
      for (let tx = 0; tx < N + 2; tx++) {
        // texel (tx,ty) centre in world space — matches where the sprite below places it
        const wx = ox + (tx - 0.5) * ts
        const wy = oy + (ty - 0.5) * ts
        const t = districtTintAt(wx, wy, districtSeed)
        const i = (ty * (N + 2) + tx) * 4
        img.data[i] = (t >> 16) & 255
        img.data[i + 1] = (t >> 8) & 255
        img.data[i + 2] = t & 255
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    const tex = Texture.from(c)
    tex.source.scaleMode = 'linear'      // the bilinear reconstruction IS the feature
    return tex
  }

  function updateGroundField(cx, cy) {
    if (!chapterHasDistricts) {
      for (const [, s] of groundChunks) { s.visible = false; groundFree.push(s) }
      groundChunks.clear()
      return
    }
    const N = GROUND_FIELD_N
    const ts = GROUND_CHUNK / N
    const i0 = Math.floor(-cx / GROUND_CHUNK) - 1, i1 = Math.floor((-cx + viewW()) / GROUND_CHUNK) + 1
    const j0 = Math.floor(-cy / GROUND_CHUNK) - 1, j1 = Math.floor((-cy + viewH()) / GROUND_CHUNK) + 1
    for (const [, s] of groundChunks) s._seen = false
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const key = i + ',' + j
        let s = groundChunks.get(key)
        if (!s) {
          s = groundFree.pop()
          if (!s) { s = new Sprite(Texture.EMPTY); s.anchor.set(0); groundLayer.addChild(s) }
          s.visible = true
          s.texture = buildGroundChunk(i, j)
          // drawn one texel larger on every side, anchored one texel back — this is what puts texel
          // centres on the chunk boundary (see SEAMS)
          s.position.set(i * GROUND_CHUNK - ts, j * GROUND_CHUNK - ts)
          s.width = GROUND_CHUNK + 2 * ts
          s.height = GROUND_CHUNK + 2 * ts
          groundChunks.set(key, s)
        }
        s._seen = true
      }
    }
    for (const [key, s] of groundChunks) {
      if (s._seen) continue
      s.visible = false
      if (s.texture && s.texture !== Texture.EMPTY) s.texture.destroy(true)
      s.texture = Texture.EMPTY
      groundFree.push(s)
      groundChunks.delete(key)
    }
  }

  function clearGroundField() {
    for (const [, s] of groundChunks) {
      s.visible = false
      if (s.texture && s.texture !== Texture.EMPTY) s.texture.destroy(true)
      s.texture = Texture.EMPTY
      groundFree.push(s)
    }
    groundChunks.clear()
  }

  // ---- the terrain layer (v5.11) ---------------------------------------------------------------
  // One full-cell tile per cell, no jitter, no random scale, no random rotation — see T.terrainTile's
  // header for why that is the whole point. This runs INSTEAD of populateBlotch on a chapter with a
  // terrain map (skies); every other chapter keeps the scattered-blotch floor unchanged.
  //
  // Per-parcel crop colour. Farmland's patchwork only reads if adjacent fields differ in HUE, and
  // the biome tint alone gives every field the same olive. Each parcel picks a crop from a small
  // palette and the tile tint is pulled most of the way toward it — "most of", not all, so the
  // region's one light still governs and a field cannot escape the chapter's luminance band.
  const PARCEL_CROP_TINTS = [
    0x8f9a53,   // young cereal, green
    0xa8a259,   // ripening barley
    0xb8a765,   // wheat, near harvest
    0x6f7f46,   // dense root crop, dark
    0x9c8f6b,   // stubble
    0x7d6f52,   // ploughed / fallow earth
  ]
  function populateTerrain(s, i, j, cell) {
    if (!chapterHasDistricts || !T.terrainTile) { s.visible = false; return }
    const wx = (i + 0.5) * cell, wy = (j + 0.5) * cell
    const biome = districtAt(wx, wy, districtSeed)

    // FARM PARCELS are the one place a hard-edged coloured rectangle is right (see parcelTile). Only
    // on a cell whose four corners are ALSO farmland, so a parcel edge can never land on a shoreline
    // and cut a square notch into it — which is exactly the artefact the rest of this rewrite exists
    // to remove.
    if (biome === 'farms') {
      const h = cell / 2
      const solid = districtAt(wx - h, wy - h, districtSeed) === 'farms'
        && districtAt(wx + h, wy - h, districtSeed) === 'farms'
        && districtAt(wx - h, wy + h, districtSeed) === 'farms'
        && districtAt(wx + h, wy + h, districtSeed) === 'farms'
      if (solid) {
        const parcel = parcelAt(wx, wy, districtSeed)
        const pats = T.parcelTile
        const idx = parcel.pivot ? pats.length - 1 : (parcel.rows * 2 + (parcel.shade > 0.5 ? 1 : 0)) % (pats.length - 1)
        const look = pats[Math.min(pats.length - 1, idx)]
        s.visible = true
        s.texture = look.tex
        s.anchor.set(look.ax, look.ay)
        s.alpha = 1
        s.rotation = 0
        s.scale.set((cell * 1.03) / look.ref)
        s.position.set(wx, wy)
        // The crop hue is blended over the ground field's own colour at this spot, so a parcel still
        // belongs to its region's light instead of being an unrelated swatch dropped on top.
        s.tint = lerpTint(floorTintAt(wx, wy), PARCEL_CROP_TINTS[parcel.crop], 0.55)
        return
      }
    }

    // Every other cell: TEXTURE ONLY. No fill and no tint — the colour under it is a continuous
    // field (updateGroundField), and the entire point of this layer no longer carrying colour is
    // that its 280px grid has nothing to quantise, so the grid itself becomes invisible.
    const pats = T.terrainTile[biome]
    if (!pats) { s.visible = false; return }
    const look = pats[Math.floor(cellHash(i, j, 1) * pats.length)]
    s.visible = true
    s.texture = look.tex
    s.anchor.set(look.ax, look.ay)
    s.alpha = 1
    s.rotation = 0
    s.scale.set((cell * 1.03) / look.ref)
    s.position.set(wx, wy)
    s.tint = 0xffffff
  }

  // Blend two packed RGB ints. (lerpColorInt lives in config.js and isn't exported; this is the
  // same three-channel mix, kept local rather than widening config's surface for one caller.)
  function lerpTint(a, b, t) {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255
    return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t)
  }

  function populateBlotch(s, i, j, cell) {
    // v5.11: a chapter with a terrain map draws populateTerrain's full-cell surface instead. The
    // scattered-blotch floor below is what every other chapter still uses.
    if (chapterHasDistricts) { s.visible = false; return }
    const jx = (cellHash(i, j, 4) - 0.5) * cell * 0.6
    const jy = (cellHash(i, j, 5) - 0.5) * cell * 0.6
    const wx = (i + 0.5) * cell + jx
    const wy = (j + 0.5) * cell + jy
    // v5.9.1: skies picks a per-district SIGNATURE pattern (T.districtGround, buildTextures above)
    // instead of the generic T.blotches every other chapter (and skies' own parks) still uses below
    // — see that block's header comment for why. farms is the one district that overrides the
    // random spin: its furrows share farmRowSnap's per-FIELD angle (same helper the cropTuft prop
    // uses) so a whole field's tiles read as one set of rows, not scattered dashes.
    if (chapterHasDistricts) {
      const dtype = districtAt(wx, wy, districtSeed)
      const pats = T.districtGround[dtype]
      if (pats) {
        const pat = pats[Math.floor(cellHash(i, j, 1) * pats.length)]
        s.texture = pat.tex
        s.anchor.set(pat.ax, pat.ay)
        s.alpha = 1
        s.rotation = dtype === 'farms' ? farmRowSnap(wx, wy).angle : cellHash(i, j, 2) * Math.PI * 2
        const [lo, hi] = DISTRICT_GROUND_SCALE[dtype] || [0.9, 1.6]
        s.scale.set(lerp(lo, hi, cellHash(i, j, 3)))
        s.position.set(wx, wy)
        s.tint = floorTintAt(wx, wy)
        return
      }
    }
    const idx = Math.floor(cellHash(i, j, 1) * T.blotches.length)
    s.texture = T.blotches[idx]
    s.anchor.set(0.5)
    s.alpha = 1
    s.rotation = cellHash(i, j, 2) * Math.PI * 2
    s.scale.set(lerp(0.9, 1.6, cellHash(i, j, 3)))
    s.position.set(wx, wy)
    s.tint = floorTintAt(wx, wy) // white for body; teal multiply recolours the pond ground
  }

  // ---- prop kinds + per-chapter biomes (v5.4) ------------------------------------------------
  // A "kind" is one scatterable thing. Two flavours, and applyPropKind handles both:
  //   sheet prop — { name } resolves in T.props (1024px source PNGs), so `size` is a TARGET
  //                ON-SCREEN SIZE in px, converted to a scale factor; `tints` pick a baked hue.
  //   baked prop — { baked: true } resolves in T (pebble/root/hydrant/...). Two sizing modes:
  //     `size`  — v5.9 top-down region overhaul: a TARGET ON-SCREEN SIZE in px, exactly like the
  //               sheet-prop path above, fit to the baked texture's OWN intrinsic bounds instead of
  //               a fixed 1024. Every skies district table (DISTRICT_BIOMES below) uses this —
  //               config.js's PROP_SCALE supplies the actual bands. This is the fix for the
  //               reported "cars bigger than houses" bug: `scale` (below) is a bare multiplier on
  //               each texture's OWN arbitrary baked size, so nothing stopped one class's
  //               scale-range times its baked size from exceeding another's (T.car baked from
  //               TRAFFIC_CAR_LEN=150 at scale [0.55,0.75] used to render at 82-112px — BIGGER than
  //               T.house, hand-drawn at 48px baked, at scale [0.9,1.4] = 43-67px). PROP_SCALE's
  //               bands are disjoint and ordered by construction, so `size` can't repeat that bug.
  //     `scale` — the ORIGINAL plain factor range, unchanged. Still used by every chapter-wide
  //               BIOMES entry outside DISTRICT_BIOMES (body/pond/garden/undergrowth/city/beyond) —
  //               none of those are in scope for this pass and must render bit-identical to before.
  // `upright` props keep their footing (small rotation jitter only, anchored at the base for baked
  // ones); top-down props spin freely. `cropRow` (farms district only) overrides BOTH the rotation
  // and the position — see farmRowSnap below. Everything is multiplied by chapterRender.floorTint,
  // so one prop set reads differently under each chapter's light.
  const BUSH_TINTS = [0x86b877, 0x76a869]
  const GRASS_TINTS = [0x9ccc80, 0x8bbf76, 0xa5cb8a]
  const CLUSTER_TINTS = [0xa8d19a, 0xc2dfae, 0x9bc98f]

  // Crop rows (farms district, skies — v5.9 top-down region overhaul): cultivated fields read as
  // top-down ONLY if the rows are straight and regular, which a per-sprite random jitter/rotation
  // can never produce — so cropRow props snap onto a per-FIELD lattice instead of scattering freely.
  // A "field" is its own coarse grid (FARM_FIELD px, deliberately independent of the prop-cell
  // grids in FLOOR_LAYERS) sharing ONE row angle, hashed from the field's own cell so it's
  // deterministic and stable (never re-rolls as the player walks the same field twice). Within a
  // field, (wx,wy) is rotated into row-aligned (u,v) space; only the CROSS-row coordinate v is
  // quantized to FARM_ROW_SPACING (snapping onto one of a few parallel row lines) — the ALONG-row
  // coordinate u is left as-is (already jittered by the caller's per-cell placement), so individual
  // crop clumps still scatter naturally along their row instead of forming a dotted grid.
  const FARM_FIELD = 360        // px per field — one shared row angle per field
  const FARM_ROW_SPACING = 26   // px between adjacent crop rows within a field
  function farmRowSnap(wx, wy) {
    const fi = Math.floor(wx / FARM_FIELD), fj = Math.floor(wy / FARM_FIELD)
    const fieldAngle = hash(fi * 12.9898 + fj * 78.233 + districtSeed * 0.0173 + 91.7) * Math.PI
    const ca = Math.cos(fieldAngle), sa = Math.sin(fieldAngle)
    const u = wx * ca + wy * sa
    const v = -wx * sa + wy * ca
    const vs = Math.round(v / FARM_ROW_SPACING) * FARM_ROW_SPACING
    return { x: u * ca - vs * sa, y: u * sa + vs * ca, angle: fieldAngle }
  }

  // Returns the position the sprite should actually be placed at ({x,y} — normally just the
  // (wx,wy) the caller already computed, EXCEPT cropRow props, which override it via farmRowSnap).
  // v5.10 (spec §4.5): `litTint: true` BYPASSES the floor tint. Chlorine-blue pool water, shipping
  // container red, fresh crosswalk paint and a car's body colour all turn to mud when multiplied by
  // a district floorTint. Saturated accents are the chapter's scarcest resource — the threats own
  // saturation — so the handful of props allowed to keep theirs must opt in explicitly.
  // A neutral night tone for litTint props. `litTint` means "keep your own HUE" — it does not mean
  // "ignore that it is 3am in a thunderstorm". Without this a parked hatchback is the brightest
  // object in the region, outshining the building it is parked next to.
  const SKIES_NIGHT_TINT = 0x9aa0a8
  function propTint(kind, i, j, floorTint) {
    const base = kind.tints ? kind.tints[Math.floor(cellHash(i, j, 2) * kind.tints.length)] : (kind.tint ?? 0xffffff)
    return tintMul(base, kind.litTint ? SKIES_NIGHT_TINT : floorTint)
  }

  function applyPropKind(s, kind, i, j, wx, wy) {
    const floorTint = floorTintAt(wx, wy)
    if (kind.baked) {
      const look = T[kind.name]
      s.texture = look.tex
      s.anchor.set(look.ax, look.ay)
      s.tint = propTint(kind, i, j, floorTint)
      s.alpha = kind.alpha ?? 1
      if (kind.size) {
        const targetPx = lerp(kind.size[0], kind.size[1], cellHash(i, j, 4))
        s.scale.set(targetPx / Math.max(look.tex.width, look.tex.height))
      } else {
        s.scale.set(lerp(kind.scale[0], kind.scale[1], cellHash(i, j, 4)))
      }
    } else {
      s.texture = T.props[kind.name]
      s.anchor.set(0.5, kind.upright ? 0.9 : 0.5)
      s.tint = propTint(kind, i, j, floorTint)
      s.alpha = kind.alpha ?? 1
      s.scale.set(lerp(kind.size[0], kind.size[1], cellHash(i, j, 4)) / 1024)
    }
    if (kind.cropRow) {
      const snap = farmRowSnap(wx, wy)
      s.rotation = snap.angle
      return { x: snap.x, y: snap.y }
    }
    // v5.10 (SKIES_VEHICLE.alignToKerb): a parked vehicle, a parking lot's stall stripes and a
    // tractor all line up with the STREET GRID, never a random spin. Random rotation is the single
    // loudest tell that a scene was scattered by an algorithm rather than laid out by a city.
    if (kind.alignRoad) {
      s.rotation = nearestStreetAngle(wx, wy) + (cellHash(i, j, 3) - 0.5) * 0.06
      return { x: wx, y: wy }
    }
    // upright things stay upright — only top-down scatter is free to spin
    s.rotation = kind.upright ? (cellHash(i, j, 3) - 0.5) * 0.16 : cellHash(i, j, 3) * Math.PI * 2
    return { x: wx, y: wy }
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
  // downtown (skies district, v5.9 top-down region overhaul): rubble is loose GROUND debris here
  // (the actual "tower" landmark comes from the crushable obstacle field, STRUCTURE_SKINS.tower
  // below) — sized from PROP_SCALE.debris, the smallest class, not a bare scale multiplier on
  // rubble's own baked size (that used to render 64-116px, bigger than a house — see PROP_SCALE's
  // doc in config.js for the full bug). 'car' added for item-5 density: downtown streets read as
  // abandoned/wrecked, and the texture already exists (T.car, shared with suburbs/traffic).
  // v5.10 (spec §6, kill list §8.9): the skies car set replaces T.car, the CITY chapter's yellow
  // traffic taxi baked from TRAFFIC_CAR_LEN. Three silhouettes you can tell apart at a glance, all
  // `litTint` (their desaturated body hues must not inherit a park's grass green or a farm's khaki)
  // and all `alignRoad` — parked cars align to the street grid's angle, NEVER a random rotation,
  // which is the single loudest tell that a scene was scattered by an algorithm.
  const SKIES_CARS = [
    // Sized in PROPORTION to their own baked lengths (26 / 32 / 54 px) so the length ratios that
    // carry the read survive — sedan < van < bus — but pegged UNDER PROP_SCALE.car's band rather
    // than across it: a crushable tower's silhouette is only ~2.2 x STRUCTURE_RADIUS.tower (46-70
    // px on screen) in this chapter, because the whole v5.8 premise is a player BIGGER than the
    // city. A bus at PROP_SCALE.car's full 30px x (54/26) would be tower-sized, which is the
    // "cars bigger than houses" bug wearing new art.
    { name: 'vehSedan', baked: true, litTint: true, alignRoad: true, tints: SKIES_VEHICLE.bodyTints, size: [15, 21] },
    { name: 'vehVan', baked: true, litTint: true, alignRoad: true, tints: SKIES_VEHICLE.bodyTints, size: [18, 26] },
    { name: 'vehBus', baked: true, litTint: true, alignRoad: true, tints: SKIES_VEHICLE.bodyTints, size: [31, 43] },
  ]
  const BIG_SKIES = [
    { name: 'rubble', baked: true, upright: true, size: PROP_SCALE.debris },
    { name: 'parkingLot', baked: true, alignRoad: true, litTint: true, size: [150, 190] },
    ...SKIES_CARS,
  ]
  const BIG_BEYOND = [{ name: 'asteroid', baked: true, scale: [1.0, 1.9] }]
  // body: one substantial piece of anatomy per cell — a villi mound (upright, planted) or a
  // top-down bunch of transport vesicles. Both baked in warm pink, both low-contrast decor.
  const BIG_BODY = [
    { name: 'villi', baked: true, upright: true, scale: [0.9, 1.5] },
    { name: 'vesicles', baked: true, scale: [0.85, 1.5] },
  ]

  // Prop biome at a WORLD position: chapterBiome everywhere except skies, where each cell's
  // big/mid/detail set is picked by which district (config.js districtAt) sits under it.
  function biomeAt(wx, wy) {
    return chapterHasDistricts ? DISTRICT_BIOMES[districtAt(wx, wy, districtSeed)] : chapterBiome
  }

  function populateBig(s, i, j, cell) {
    // 0.7 -> 0.94: at 0.7 a prop could only move +-35% of a cell, so the underlying cell pitch was
    // still legible as a grid even once clumping thinned it. 0.94 lets a prop reach almost to its
    // cell's edge, which is what actually erases the lattice.
    const jx = (cellHash(i, j, 5) - 0.5) * cell * 0.94
    const jy = (cellHash(i, j, 6) - 0.5) * cell * 0.94
    const wx = (i + 0.5) * cell + jx
    const wy = (j + 0.5) * cell + jy
    const kinds = biomeAt(wx, wy).big
    const pos = applyPropKind(s, kinds[Math.floor(cellHash(i, j, 1) * kinds.length)], i, j, wx, wy)
    s.position.set(pos.x, pos.y)
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
  const MID_SKIES = [
    { name: 'rubble', baked: true, upright: true, size: PROP_SCALE.debris },
    ...SKIES_CARS,
  ]
  const MID_BEYOND = [{ name: 'asteroid', baked: true, scale: [0.35, 0.75] }]
  // body: medium accents — platelet plates, lipid beads, capillary squiggles. Mild alpha so they
  // sit under the enemies. All top-down (spin freely).
  const MID_BODY = [
    { name: 'platelet', baked: true, alpha: 0.9, scale: [0.85, 1.5] },
    { name: 'lipid', baked: true, alpha: 0.9, scale: [0.8, 1.35] },
    { name: 'capillary', baked: true, alpha: 0.85, scale: [0.9, 1.6] },
  ]

  function populateMid(s, i, j, cell) {
    // 0.7 -> 0.94: at 0.7 a prop could only move +-35% of a cell, so the underlying cell pitch was
    // still legible as a grid even once clumping thinned it. 0.94 lets a prop reach almost to its
    // cell's edge, which is what actually erases the lattice.
    const jx = (cellHash(i, j, 5) - 0.5) * cell * 0.94
    const jy = (cellHash(i, j, 6) - 0.5) * cell * 0.94
    const wx = (i + 0.5) * cell + jx
    const wy = (j + 0.5) * cell + jy
    const kinds = biomeAt(wx, wy).mid
    const pos = applyPropKind(s, kinds[Math.floor(cellHash(i, j, 1) * kinds.length)], i, j, wx, wy)
    s.position.set(pos.x, pos.y)
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
    { name: 'pebble', baked: true, size: PROP_SCALE.debris },
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
    // 0.7 -> 0.94: at 0.7 a prop could only move +-35% of a cell, so the underlying cell pitch was
    // still legible as a grid even once clumping thinned it. 0.94 lets a prop reach almost to its
    // cell's edge, which is what actually erases the lattice.
    const jx = (cellHash(i, j, 5) - 0.5) * cell * 0.94
    const jy = (cellHash(i, j, 6) - 0.5) * cell * 0.94
    const wx = (i + 0.5) * cell + jx
    const wy = (j + 0.5) * cell + jy
    const kinds = biomeAt(wx, wy).detail
    const pos = applyPropKind(s, kinds[Math.floor(cellHash(i, j, 1) * kinds.length)], i, j, wx, wy)
    s.position.set(pos.x, pos.y)
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
      // v5.18: `planet` swaps in a dedicated sphere bake AND hides the footprint ring (see the
      // planet branch in syncObstacles). v5.20: that bake became SEVEN archetypes — gas giant, moon,
      // ice, molten, ocean, night side, ringed — chosen per obstacle by position hash in the skin
      // cache, so `planet: true` now means "pick from PLANET_ARCHETYPES", not one fixed texture.
      // That ring is documented as the COLLISION CONTRACT —
      // "this stops me, learned by eye" — and in the lane it stops nothing: stepObstacles skips this
      // chapter entirely now, so a 36px-wide contract ring around a body you fly straight past would
      // be the art telling a lie the sim doesn't back. `foot` stays a real colour because the skin
      // cache tint-multiplies it unconditionally; the ring is hidden by alpha, not by a null.
      obstacle: { baked: ['asteroid', 'asteroid'], planet: true, tint: 0xcfc8e0, foot: 0x8f86b8 },
    },
  }
  chapterBiome = BIOMES.body // title-screen default; reset(run) latches the run's chapter

  // ---- district biomes (skies chapter only, v5.7.x piece 4) ----------------------------------
  // Same {big, mid, detail, obstacle} shape as BIOMES above, keyed by DISTRICTS type (config.js)
  // instead of chapter id — syncObstacles and the floor populate* callbacks pick one of these BY
  // WORLD POSITION (districtAt) instead of chapterBiome when chapterHasDistricts. downtown reuses
  // the chapter's original look unchanged; parks/sea lean on existing foliage/puddle/streak
  // assets re-tinted for the storm night; suburbs is the one hand-drawn set (house/fence baked
  // above — its car reuses T.car, already drawn for the city's traffic lanes, so no second car
  // gets drawn).
  // v5.8 kaiju redesign: `obstacle` here now supplies ONLY the PALETTE (tint/foot) for a district's
  // structures — the SHAPE is o.kind (config.js STRUCTURE_KINDS: 'tower'/'house'/'tree'/'pier'),
  // looked up in STRUCTURE_SKINS right after this table. kind is independent of district (sim.js
  // derives it from its own hash salt, not from districtAt — design doc §2/§5), so it does NOT
  // track 1:1 with whichever district an obstacle happens to land in; syncObstacles combines the
  // two — this table's tint/foot at the obstacle's world position, STRUCTURE_SKINS' silhouette
  // for its kind.
  const PARK_TINTS = [0x3f5a3a, 0x32492e]        // dark hedge/tree-clump green — the daylight
  const PARK_GRASS_TINTS = [0x4a6640, 0x3d5636]  // BUSH_TINTS/GRASS_TINTS would wash out on a dark floor
  const BIG_PARKS = [
    { name: 'bush_a', tints: PARK_TINTS, upright: true, size: [110, 175] }, // tree clumps, bigger than the garden's hedges
    { name: 'root', baked: true, upright: true, size: PROP_SCALE.tree },   // a gnarled trunk/roots poking up
  ]
  const MID_PARKS = [
    { name: 'bush_b', tints: PARK_TINTS, upright: true, size: [70, 110] }, // hedges
    { name: 'grass_c', tints: PARK_GRASS_TINTS, upright: true, size: [30, 52] },
    { name: 'reed', tints: PARK_GRASS_TINTS, upright: true, size: [45, 70] },
  ]
  const DETAIL_PARKS = [
    { name: 'grass_d', tints: PARK_GRASS_TINTS, upright: true, size: [22, 38] },
    { name: 'leaf', tint: 0x3a4f34, alpha: 0.6, size: [18, 32] },
    { name: 'pebble', baked: true, size: PROP_SCALE.debris },
  ]
  // v5.9 top-down region overhaul: every baked prop below is sized off PROP_SCALE (config.js) via
  // applyPropKind's `size` path, not `scale` — see that function's doc comment for the "car bigger
  // than house" bug this replaces. car appears in BOTH big and mid at the SAME absolute band
  // (PROP_SCALE.car): unlike the old scale-multiplier system, "which layer" no longer implies "how
  // big" — it only changes how OFTEN a cell rolls a car vs. a house/fence (see FLOOR_LAYERS' cell/
  // chance per layer), which is exactly the density knob item 5 asked for.
  // v5.10: the side-view T.house/T.fence floor props are gone from suburbs. The crushable
  // structures now ARE detailed top-down houses with their whole lot (driveway, lawn or pool,
  // hedge L, shed, deck, bins) baked into the same texture, so scattering a second, cruder house
  // silhouette next to them is what made the district read as a wireframe suburb.
  const BIG_SUBURBS = [
    { name: 'hedgeSeam', baked: true, size: PROP_SCALE.hedge },
    ...SKIES_CARS,
  ]
  const MID_SUBURBS = [
    { name: 'hedgeSeam', baked: true, size: PROP_SCALE.hedge },
    ...SKIES_CARS,
  ]
  const DETAIL_SUBURBS = [
    { name: 'pebble', baked: true, size: PROP_SCALE.debris },
    { name: 'scatter_a', tint: 0xd8c9a0, alpha: 0.4, size: [20, 34] },
  ]
  // sea's puddle/foam stay `scale`-based, deliberately: they're a WATER/TERRAIN feature (open water,
  // breaking-wave lines), not one of PROP_SCALE's enumerated prop classes (crop/debris/car/fence/
  // hedge/tree/house/pier/barn/silo/tower) — there's no absolute band for them to pull from, and no
  // ordering-invariant claim to honour ("reused at landmark scale" is the intended read, not a bug).
  const SEA_FOAM_TINTS = [0x9fd0ea, 0xbfe6f7] // pale foam-white/cyan, darkened by the sea floorTint multiply
  // v5.10 (spec §4.5, kill list §8.6): T.foam was `T.fx.trace_05` — the sea's breaking wave WAS the
  // pond's current-streak sprite, reused a third time by populateEdge for coastlines. T.waveCrest
  // is a real crest (two parallel arcs + a foam speckle band). The container yard is the district's
  // signature: tiny dense SATURATED rectangles against dark water, `litTint` so the floor tint
  // can't turn a shipping line's red into grey.
  // containerYard is listed twice on purpose: SKIES_FLOOR_KEEP thins the `big` layer to 22%, so a
  // single entry among three put a yard on screen roughly never and the district read as empty
  // water. litTint everywhere here — foam that inherits the sea's own floorTint is invisible
  // against the sea, which is exactly how T.foam managed to hide for two versions.
  const BIG_SEA = [
    { name: 'puddle', baked: true, scale: [3.2, 5.5] }, // the puddle prop's own blue, reused at landmark scale — open water
    { name: 'containerYard', baked: true, litTint: true, size: [170, 210] },
    { name: 'containerYard', baked: true, litTint: true, size: [150, 190] },
    { name: 'riprap', baked: true, litTint: true, size: [150, 190] },
  ]
  const MID_SEA = [
    { name: 'waveCrest', baked: true, litTint: true, tint: SEA_FOAM_TINTS[0], alpha: 0.75, size: [70, 120] },
    { name: 'waveCrest', baked: true, litTint: true, tint: SEA_FOAM_TINTS[1], alpha: 0.6, size: [90, 140] },
    { name: 'puddle', baked: true, scale: [1.4, 2.4] },
  ]
  const DETAIL_SEA = [
    { name: 'waveCrest', baked: true, litTint: true, tint: SEA_FOAM_TINTS[1], alpha: 0.55, size: [40, 70] },
  ]
  // // ponytail: sea's "waves" are static per-cell foam scatter (the CURRENT_VIS/rain streak
  // texture, reused as a floor prop), not a moving wave-advection layer — upgrade to a proper
  // pooled foam-streak system (CURRENT_VIS idiom) if flat/static water reads badly in playtesting.

  // ---- farms district (skies, v5.9 top-down region overhaul) ---------------------------------
  // The headline "more crops" ask: cultivated fields read as top-down ONLY as regular parallel
  // rows, which farmRowSnap (above, near applyPropKind) provides — cropTuft is the one prop in this
  // file with `cropRow: true`. It appears in BOTH mid and detail (two independent cell grids
  // sampled at different phases/frequencies) so rows read as continuous furrows, not a sparse
  // dotted line. big carries the landmark farm furniture — barn/silo (new baked art; STRUCTURE_
  // SKINS below reuses the SAME textures for the crushable buildings, PROP_SCALE-sized there too)
  // plus the odd tractor (T.tractor, pegged to PROP_SCALE.car's band — a working vehicle, same
  // tier as a parked car, not worth its own PROP_SCALE class).
  // v5.11: darkened from [0xd9c76a, 0x8a9a4a, 0x6b5a3a] — bare, they were the brightest, flattest
  // thing on screen, out-shouting the (much darker, night-lit) buildings and searchlights. Same
  // hues, brought down in value; T.cropTuft's own bake (above) adds the actual furrow texture.
  const CROP_TINTS = [0x988b4a, 0x687438, 0x5b4d31] // golden wheat / green leaf-row / tilled-brown row
  // v5.10: the side-view T.barn/T.silo floor props are gone (the crushable structures carry the
  // real top-down plans now). What replaces them is the OTHER instantly-recognisable overhead farm
  // shape — a centre-pivot irrigation circle. A perfect circle in a field of straight rows is
  // unmistakable, and it exists nowhere else in the region.
  const BIG_FARMS = [
    { name: 'pivotCircle', baked: true, size: [340, 460] },
    { name: 'tractor', baked: true, alignRoad: true, size: PROP_SCALE.car },
  ]
  const MID_FARMS = [
    // v5.11: the two cropTuft entries that stood here are GONE, along with the one in DETAIL_FARMS.
    // They scattered individual crop strokes across the field on top of the furrows baked into
    // T.districtGround.farms — two independent hatchings over the same ground, which together are
    // what the playtest report saw as "white lines crossing everything". Rows are now part of the
    // parcel tile itself (T.terrainTile.farms), drawn once, at the field's own scale, and bounded by
    // the field's headland. A field does not need props sprinkled on it to look cultivated.
    { name: 'wallSeam', baked: true, size: PROP_SCALE.fence },             // dry-stone field boundary
    { name: 'hayBale', baked: true, size: [32, 42] },                      // not an enumerated PROP_SCALE class — pegged to the fence/hedge tier by eye
  ]
  const DETAIL_FARMS = [
    { name: 'pebble', baked: true, size: PROP_SCALE.debris },
  ]

  // ---- hills district (skies, v5.9 top-down region overhaul) ---------------------------------
  // Elevation from directly overhead reads as soft contour shading (T.contour above), never a
  // side-view hill silhouette — see that bake's own doc for why. Scattered trees reuse T.root at
  // PROP_SCALE.tree, the same class/size as the parks district's trunk accent.
  // Boulders (v5.9.1 art experiment): T.voxelRockA/B/C (baked above, right after T.rockChunk) —
  // three faux-voxel silhouettes, PROP_SCALE-sized like every other discrete object in these
  // district tables (tree for the big landmark tier, fence for mid, debris for scattered detail —
  // all three bands already fit, no new PROP_SCALE class needed). `upright: true` here is NOT about
  // footing (a boulder is mass-centred, not base-anchored) — it's the only lever applyPropKind has
  // for "small rotation jitter, not a full spin," which these need to keep every cube's baked
  // shading pointing the same way across the whole field (see the bake's own comment for why a
  // full-spin rotation would break that). contour stays `scale`-based like sea's puddle above — it
  // isn't an enumerated PROP_SCALE class (a soft translucent contour patch doesn't compete in the
  // car/house/tower size hierarchy the way a discrete built object does).
  const BIG_HILLS = [
    { name: 'contour', baked: true, scale: [1.3, 2.1] },
    { name: 'switchback', baked: true, size: [190, 250] }, // v5.10: the one man-made line in open
                                                           // moorland — a zigzag is the only shape
                                                           // that says "slope" to a camera with no
                                                           // horizon (spec §4.5)
    { name: 'voxelRockA', baked: true, upright: true, size: PROP_SCALE.tree },
    { name: 'voxelRockB', baked: true, upright: true, size: PROP_SCALE.tree },
  ]
  const MID_HILLS = [
    { name: 'contour', baked: true, scale: [0.7, 1.2] },
    { name: 'voxelRockB', baked: true, upright: true, size: PROP_SCALE.fence },
    { name: 'voxelRockC', baked: true, upright: true, size: PROP_SCALE.fence },
    { name: 'grass_c', tints: PARK_GRASS_TINTS, upright: true, size: [28, 46] },
  ]
  const DETAIL_HILLS = [
    { name: 'voxelRockC', baked: true, upright: true, size: PROP_SCALE.debris },
    { name: 'grass_d', tints: PARK_GRASS_TINTS, upright: true, size: [20, 34] },
  ]

  const DISTRICT_BIOMES = {
    downtown: BIOMES.skies, // unchanged: the chapter's original tall shattered-building rubble
    suburbs: {
      big: BIG_SUBURBS, mid: MID_SUBURBS, detail: DETAIL_SUBURBS,
      obstacle: { tint: 0xcfc0a0, foot: 0x2e2418 },
    },
    parks: {
      big: BIG_PARKS, mid: MID_PARKS, detail: DETAIL_PARKS,
      obstacle: { tint: 0x3f5a3a, foot: 0x1c2a18 },
    },
    sea: {
      big: BIG_SEA, mid: MID_SEA, detail: DETAIL_SEA,
      // v5.8 kaiju redesign: sea's obstacles used to be a plain rock (visual-only placeholder);
      // now they're real crushable dock furniture (STRUCTURE_SKINS.pier, T.jetty/T.boat/T.buoy
      // baked above). Still no swim/slow here — that would be a sim change, out of scope.
      obstacle: { tint: 0x8fa0ac, foot: 0xdaf3ff },
    },
    farms: {
      big: BIG_FARMS, mid: MID_FARMS, detail: DETAIL_FARMS,
      obstacle: { tint: 0xb8a860, foot: 0x2e2712 },
    },
    hills: {
      big: BIG_HILLS, mid: MID_HILLS, detail: DETAIL_HILLS,
      // v5.9.2: hills' structures still roll kind='tree' (config.js DISTRICT_STRUCTURE_KINDS —
      // growing a real 7th kind needs test/sim-test.js's run DD.d, which pins STRUCTURE_KINDS at
      // exactly 6, updated by whoever owns test/), but syncObstacles below special-cases exactly
      // this district to draw STRUCTURE_SKINS.rock instead of 'tree''s usual foliage clump — see
      // that override's own comment. This palette (a stony taupe) still applies either way.
      obstacle: { tint: 0x8a7a62, foot: 0x2e2a20 },
    },
    // v5.11 biomes. Neither gets a bespoke prop set: what defines both is EMPTINESS, and the
    // parcel/dune/swash texture is already in the terrain tile. Desert borrows the hills scatter
    // (boulders and debris are exactly right for a stony arid plain) at a twelfth the build density
    // (BIOME_BUILD_DENSITY, terrain.js); beach borrows sea's shoreline furniture, which is what a
    // beach has on it. Reusing these tables is the correct call rather than a shortcut — inventing
    // two more prop sets would add clutter to the two biomes whose whole job is to be bare.
    desert: {
      big: BIG_HILLS, mid: MID_HILLS, detail: DETAIL_HILLS,
      obstacle: { tint: 0xb09872, foot: 0x35291a },
    },
    beach: {
      big: BIG_SEA, mid: MID_SEA, detail: DETAIL_SEA,
      obstacle: { tint: 0xb0a482, foot: 0x33301f },
    },
  }
  // Structure silhouette per o.kind (v5.8 kaiju redesign, config.js STRUCTURE_KINDS; barn/silo added
  // v5.9): the district table above supplies the PALETTE, this supplies the SHAPE — see its doc
  // comment. Same {baked}/{clumps} shapes syncObstacles already knew how to draw (BIOMES/
  // DISTRICT_BIOMES' `obstacle` used to carry both in one object; kind splits them so a suburb can
  // have a park's stray tree and vice versa, matching the fact that kind and district roll
  // independently).
  //   tower — today's shattered-rubble pair, unchanged (the design doc calls it "a fine starting
  //           point"; downtown's original obstacle look already looked like a small ruin).
  //   house — the suburbs' own hand-drawn house, baked twice: a plain low pitched-roof silhouette
  //           doesn't need a second distinct prop the way tower's rubble pairing does.
  //   tree  — the same OBSTACLE_CLUMPS foliage-mound idiom every organic obstacle already uses
  //           (garden's bushes, the old parks obstacle) — no new art needed for "a park tree/hedge".
  //   pier  — new baked art (jetty/boat/buoy above), for the sea district's dock furniture.
  //   barn/silo — new baked art (above), for the farms district's crushable buildings.
  //   rock  — v5.9.2: the faux-voxel boulder trio (T.voxelRockA/B/C, already baked for the hills
  //           FLOOR layers above), reused as a crushable structure. NOT one of o.kind's own values
  //           (STRUCTURE_KINDS stays at 6 — see this table's own header) — syncObstacles substitutes
  //           it in for kind='tree' obstacles specifically in the hills district, so hills reads as
  //           rocky high ground instead of sharing 'tree''s forest-clump silhouette with parks (the
  //           "the fuck is this?" bug report: the two districts used to render identically).
  // v5.10 art direction (spec §5): every entry now points at a TOP-DOWN PLAN baked by
  // buildSkiesTextures (T.skTower*/skHouse*/skBarn/skSilo/skPier/skTree/skOutcrop), replacing the
  // side-view, base-anchored bakes that a top-down camera could only ever render as "a box plus a
  // triangle". `topDown: true` is read by syncObstacles: the plan is MASS-CENTRED at (0,0) rather
  // than planted at (0, o.r*0.28), it is NOT re-tinted by the district palette (these carry their
  // own night palette, including palette-law-1 lit windows that a tint multiply would turn to mud),
  // and clumpB is suppressed — the lot/paddock/yard detail is baked INTO the same texture, because
  // a driveway that doesn't touch its house is worse than no driveway.
  // This also closes kill-list items §8.7 (hills' crushable structures were the hills FLOOR-DECOR
  // boulders at a bigger scale) and §8.8 (downtown's landmark building was literally the generic
  // rubble prop, which is also downtown's floor debris).
  const STRUCTURE_SKINS = {
    tower: { baked: ['skTowerA', 'skTowerB', 'skTowerC', 'skTowerD', 'skTowerE'], topDown: true },
    house: { baked: ['skHouseA', 'skHouseB'], topDown: true },
    tree: { baked: ['skTree', 'skTree'], topDown: true },
    pier: { baked: ['skPier', 'skPier'], topDown: true },
    barn: { baked: ['skBarn', 'skBarn'], topDown: true },
    silo: { baked: ['skSilo', 'skSilo'], topDown: true },
    rock: { baked: ['skOutcrop', 'skOutcrop'], topDown: true }, // hills override only — see comment above and syncObstacles
  }
  // Which ruin bake a crushed structure leaves behind, by o.kind (SKIES_RUIN, spec §5.9). 'rock'
  // is the hills override above, and reuses tree's stump-and-splinter ruin.
  const RUIN_FOR_KIND = { tower: 'tower', house: 'house', barn: 'barn', silo: 'silo', pier: 'pier', tree: 'tree', rock: 'tree' }

  // ---- roads (skies only, v5.9 top-down region overhaul) --------------------------------------
  // Draws config.js's roadAt() street grid as a floor decal — a pooled per-cell prop layer (below),
  // NOT per-frame Graphics: FLOOR_LAYERS already runs one pass over every visible cell each frame
  // (touchFloorCell), so this reuses that exact machinery with a deterministic PREDICATE (roadAt)
  // standing in for the usual random `chance` roll, same as every other layer's populate callback.
  //
  // ROAD_CELL must be <= ROAD_MINOR_WIDTH: consecutive probe points are ROAD_CELL apart, so a
  // street ROAD_MINOR_WIDTH px wide is GUARANTEED to contain at least one probe (pigeonhole) for
  // ANY per-seed grid offset — render.js never learns that offset directly (config.js keeps it
  // private), it only ever calls the exported roadAt. -4 is a safety margin.
  const ROAD_CELL = ROAD_MINOR_WIDTH - 4
  // roadAt's `angle` is 0 for an east-west street (runs along x) or PI/2 for north-south — the
  // perpendicular unit vector (the direction `dist` is measured along) is (sin(angle), cos(angle)).
  // The unit normal to a road running at heading `angle`. The heading vector is (cos, sin), so the
  // normal is (-sin, cos).
  //
  // v5.12 BUGFIX — this returned (+sin, cos), the MIRROR of the normal. Its dot product with the
  // heading is 2*sin*cos = sin(2*angle), which is zero only when the angle is a multiple of PI/2 —
  // so on the v5.10 global axis-aligned lattice the bug was exactly invisible, and it became visible
  // the moment v5.11 gave every city its own rotation. Every consumer resolves a road's centreline
  // by stepping `dist` along this vector, so on an oblique street they all stepped off at the wrong
  // angle: 74% of carriageway tiles landed off the centreline (median 3.8px, p90 8.5px on a 30px
  // road), which is a serrated kerb and a snaking centre line. This is literally the reported
  // "you can't even do oblique streets".
  function roadPerp(angle) { return { x: -Math.sin(angle), y: Math.cos(angle) } }

  // ---- MAP MODE (v5.12, dev/debug) -------------------------------------------------------------
  // Renders the world zoomed OUT, with the player, enemies, projectiles and weather hidden, so the
  // procedural layout can be inspected over a wide area as a layout rather than judged through a
  // gameplay viewport. Screenshotting the game as it plays shows roughly one city block, which is
  // far too small a window to see whether a coastline is straight, whether blocks agree with their
  // streets, or whether a road network goes anywhere — every one of those is a property of an area
  // several thousand px across.
  //
  // The whole mechanism is `mapZoom` plus ONE rule: every culling test in this file measures the
  // viewport in WORLD px (viewW/viewH), never in screen px. At zoom 1 those are identical, so
  // normal play is bit-identical to before; at zoom 0.2 the same code streams five times as much
  // world into the same canvas. The camera then applies the zoom once, in sync().
  let mapZoom = 1
  let mapMode = false
  const viewW = () => app.screen.width / mapZoom
  const viewH = () => app.screen.height / mapZoom

  // ---- the city street FRAME (v5.11) ----------------------------------------------------------
  // This replaces latchRoadOrigin, which recovered a single GLOBAL grid offset by probing roadAt
  // along each axis. That worked only because the old grid was one infinite axis-aligned lattice
  // shared by the whole world. Streets now belong to individual cities, each with its OWN origin,
  // rotation and block size — so there is nothing global left to latch, and nothing needs latching:
  // the city objects carry all three numbers directly (terrain.js cityAt), which is both exact and
  // cheaper than the probe ever was.
  //
  // Everything that used to key off the latched origin — junctions, kerb lamps, parked-car
  // alignment — now enumerates in the relevant city's frame instead.
  function visibleCities(cx, cy, pad) {
    const w = viewW(), h = viewH()
    const x0 = -cx - pad, y0 = -cy - pad, x1 = -cx + w + pad, y1 = -cy + h + pad
    const out = []
    // +-1 lattice cell of slack: a city's centre can sit outside the view while its streets reach in.
    const i0 = Math.floor(x0 / CITY_GRID) - 1, i1 = Math.floor(x1 / CITY_GRID) + 1
    const j0 = Math.floor(y0 / CITY_GRID) - 1, j1 = Math.floor(y1 / CITY_GRID) + 1
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const c = cityAt(i, j, districtSeed)
        if (c) out.push(c)
      }
    }
    return { cities: out, x0, y0, x1, y1 }
  }

  // The view rectangle expressed in one city's rotated frame, clamped to that city's own radius so
  // a caller never enumerates grid nodes out in the countryside where the city has no streets.
  function cityViewBounds(c, x0, y0, x1, y1) {
    const cos = Math.cos(-c.angle), sin = Math.sin(-c.angle)
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity
    for (const [px, py] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      const dx = px - c.x, dy = py - c.y
      const u = dx * cos - dy * sin
      const v = dx * sin + dy * cos
      if (u < uMin) uMin = u; if (u > uMax) uMax = u
      if (v < vMin) vMin = v; if (v > vMax) vMax = v
    }
    return {
      uMin: Math.max(uMin, -c.r), uMax: Math.min(uMax, c.r),
      vMin: Math.max(vMin, -c.r), vMax: Math.min(vMax, c.r),
    }
  }

  // (u, v) in a city's frame back to world space.
  function cityToWorld(c, u, v) {
    const cos = Math.cos(c.angle), sin = Math.sin(c.angle)
    return { x: c.x + u * cos - v * sin, y: c.y + u * sin + v * cos }
  }

  // Which way does the nearest street run at (wx, wy)? Used to align parked vehicles and painted
  // lots to the grid. Answers in the nearest city's frame; 0 outside any city, where there is no
  // grid to align to and the caller's own jitter is the whole answer.
  function nearestStreetAngle(wx, wy) {
    if (!chapterHasRoads) return 0
    const ra = roadAt(wx, wy, roadSeed)
    if (ra.onRoad) return ra.angle
    const near = nearestCity(wx, wy, roadSeed)
    return near ? near.city.angle : 0
  }

  function populateRoad(s, i, j, cell) {
    if (!chapterHasRoads) { s.visible = false; return }
    const wx = (i + 0.5) * cell, wy = (j + 0.5) * cell
    const ra = roadAt(wx, wy, roadSeed)
    if (!ra.onRoad) { s.visible = false; return }
    // Resolve the EXACT centreline point: roadAt's `dist` is unsigned, so nudge along the
    // perpendicular and see whether that grew or shrank it, then step the full `dist` the way that
    // shrank it. One extra roadAt call, and exact (roadAt's distance math has no error to
    // accumulate — only the sign was ambiguous), so segments from neighbouring cells land on the
    // same line and read as one continuous strip instead of a cell-quantized staircase.
    const perp = roadPerp(ra.angle)
    const probe = roadAt(wx + perp.x * 4, wy + perp.y * 4, roadSeed)
    const sign = (probe.onRoad && probe.dist < ra.dist) ? 1 : -1
    const cx = wx + perp.x * ra.dist * sign
    const cy = wy + perp.y * ra.dist * sign
    // v5.11: NO DISTRICT GATE. This is the line that produced "roads are 10 meters long" — a
    // street was a continuous infinite line being drawn only where it crossed an urban district
    // cell, so it appeared for a few hundred px and vanished. Every road roadAt now returns already
    // belongs somewhere (a city's own grid, or a highway between two cities), so drawing all of it
    // is correct: a highway crossing farmland SHOULD be drawn, and one crossing water reads as the
    // causeway it is.
    const look = ra.major ? T.roadMajor : T.roadMinor
    s.texture = look.tex
    s.anchor.set(look.ax, look.ay)
    s.tint = 0xffffff
    s.alpha = 1
    s.rotation = ra.angle
    s.scale.set((cell * 1.6) / look.ref, (ra.half * 2) / look.ref) // *1.6 overlaps neighbours so segments never gap
    s.position.set(cx, cy)
  }

  // ---- road decals (v5.10, spec §4.2) ---------------------------------------------------------
  // "VARIATION ALONG A STREET IS WHAT STOPS A ROAD READING AS A WIREFRAME; one stamped tile
  // repeated forever is what got us here." Anything with a SHAPE cannot live in the carriageway
  // tile — that tile is stamped at a non-uniform scale (x 0.48, y 0.34 minor / 0.62 major), so a
  // baked circle comes out an oval and by a DIFFERENT amount on an avenue than on a side street.
  // These are separate, uniformly-scaled sprites on their own 160px cell: one decal per cell,
  // picked by cellHash, self-gating on roadAt exactly like populateRoad.
  function populateRoadDecal(s, i, j, cell) {
    if (!chapterHasRoads) { s.visible = false; return }
    const wx = (i + 0.5) * cell, wy = (j + 0.5) * cell
    const ra = roadAt(wx, wy, roadSeed)
    if (!ra.onRoad) { s.visible = false; return }
    const perp = roadPerp(ra.angle)
    const probe = roadAt(wx + perp.x * 4, wy + perp.y * 4, roadSeed)
    const sign = (probe.onRoad && probe.dist < ra.dist) ? 1 : -1
    const cx = wx + perp.x * ra.dist * sign
    const cy = wy + perp.y * ra.dist * sign
    const along = { x: Math.cos(ra.angle), y: Math.sin(ra.angle) }
    const pick = ['manhole', 'patch', 'drain', 'arrow'][Math.floor(cellHash(i, j, 21) * 4)]
    const slide = (cellHash(i, j, 22) - 0.5) * cell * 0.7
    let look = T.rdManhole, across = 0, rot = 0, alpha = 1
    if (pick === 'manhole') { across = (cellHash(i, j, 23) - 0.5) * ra.half * 1.1 }
    else if (pick === 'patch') { look = T.rdPatch; across = (cellHash(i, j, 23) - 0.5) * ra.half * 1.3; rot = cellHash(i, j, 24) * Math.PI }
    else if (pick === 'drain') { look = T.rdDrain; across = (cellHash(i, j, 23) > 0.5 ? 1 : -1) * (ra.half - 3); rot = ra.angle }
    else { look = T.rdArrow; rot = ra.angle; alpha = 1; across = ra.major ? (cellHash(i, j, 23) > 0.5 ? 1 : -1) * ra.half * 0.45 : 0 }
    s.visible = true
    s.texture = look.tex
    s.anchor.set(look.ax, look.ay)
    s.tint = 0xffffff
    s.alpha = alpha
    s.rotation = rot
    s.scale.set(1)   // baked at TRUE world size — never scaled, which is the whole point
    s.position.set(cx + along.x * slide + perp.x * across, cy + along.y * slide + perp.y * across)
  }

  // ---- extra urban clutter (skies only, v5.9 top-down region overhaul, item 5) ----------------
  // FLOOR_LAYERS' cell/chance are shared by every chapter, so raising them would raise density
  // everywhere, not just skies' cities — out of bounds for a one-file, one-chapter pass. This adds
  // a SEPARATE, self-gated layer instead (same "predicate populate, no-op elsewhere" trick roads
  // use above): extra small furniture for downtown/suburbs/parks only, on its own cell grid so it's
  // genuinely additional instances, not a reshuffle of the existing mid/detail counts. No new art —
  // pure reuse. Cell 150 keeps the per-frame cost in the same ballpark as the existing detail layer
  // (cell 120) rather than the much finer road layer above.
  const CLUTTER_BY_DISTRICT = {
    downtown: [
      { name: 'rubble', baked: true, upright: true, size: PROP_SCALE.debris },
      ...SKIES_CARS,
    ],
    suburbs: [
      { name: 'hedgeSeam', baked: true, size: PROP_SCALE.hedge },
      ...SKIES_CARS,
    ],
    parks: [{ name: 'bush_b', tints: PARK_TINTS, upright: true, size: [55, 90] }],
  }
  function populateClutter(s, i, j, cell) {
    if (!chapterHasDistricts) { s.visible = false; return }
    // v5.12 BUGFIX: this layer had NO JITTER AT ALL — every prop sat exactly on its cell centre, on a
    // 150px lattice, at chance 1.00. This layer draws the tree canopy, so every wood in the world
    // came out as a perfect square orchard of identical discs (measured: autocorrelation peaks at
    // exactly 150 world px on both axes, 98% cell occupancy). The other three scatter layers have
    // had this offset since v5.4; clutter was simply missed. Salts 12/13 — 1 is the kind pick above
    // and 4/5 belong to applyPropKind.
    const jx = (cellHash(i, j, 12) - 0.5) * cell * 0.9
    const jy = (cellHash(i, j, 13) - 0.5) * cell * 0.9
    const wx = (i + 0.5) * cell + jx, wy = (j + 0.5) * cell + jy
    const kinds = CLUTTER_BY_DISTRICT[districtAt(wx, wy, districtSeed)]
    if (!kinds) { s.visible = false; return }
    const kind = kinds[Math.floor(cellHash(i, j, 1) * kinds.length)]
    const pos = applyPropKind(s, kind, i, j, wx, wy)
    s.position.set(pos.x, pos.y)
  }

  // ---- district borders (skies only, v5.9.1 render fix) ---------------------------------------
  // "a coastline or a field edge wants to read as an edge" (playtest report) — districtTintAt
  // (config.js) already lerps the floor colour across DISTRICT_BLEND_PX either side of a border,
  // but a colour lerp alone reads as a blur, not a boundary. This adds an actual EDGE MARKER: a
  // self-gated predicate layer (same "populate no-ops outside its own case" trick as road/clutter
  // above) that fires only within roughly one DISTRICT_BLEND_PX of a border and orients a marker
  // ALONG it — a picket fence for a land/land seam (reusing T.fence, already baked for suburbs — a
  // field boundary is exactly what a fence already reads as) or a foam streak for any seam touching
  // sea. v5.10 replaced BOTH with real seam art — see the seam pick in populateEdge itself.
  // districtAt is the only border-relevant primitive config.js exports (nearestDistrictSeeds' exact
  // border distance is NOT exported, and this file only owns render.js) — so "near a border" is
  // approximated by sampling districtAt at 4 points BORDER_PROBE px out from this cell (a plain
  // Sobel-style edge test): if any of the four differs from the centre, a border is close, and
  // WHICH ones differ gives a rough outward direction to orient the marker perpendicular to (i.e.
  // running ALONG the border, the way a fence or a shoreline actually would). BORDER_PROBE reuses
  // DISTRICT_BLEND_PX so the marker sits right where the tint is already mid-blend, not offset from
  // it. This is an approximation (a true corner where 3+ districts meet can give a noisy direction),
  // never exact geometry — acceptable for a decorative accent, not for anything sim-relevant.
  const BORDER_PROBE = DISTRICT_BLEND_PX
  function populateEdge(s, i, j, cell) {
    if (!chapterHasDistricts) { s.visible = false; return }
    const jx = (cellHash(i, j, 7) - 0.5) * cell * 0.5
    const jy = (cellHash(i, j, 8) - 0.5) * cell * 0.5
    const wx = (i + 0.5) * cell + jx, wy = (j + 0.5) * cell + jy
    const here = districtAt(wx, wy, districtSeed)
    const east = districtAt(wx + BORDER_PROBE, wy, districtSeed)
    const west = districtAt(wx - BORDER_PROBE, wy, districtSeed)
    const south = districtAt(wx, wy + BORDER_PROBE, districtSeed)
    const north = districtAt(wx, wy - BORDER_PROBE, districtSeed)
    const nx = (east !== here ? 1 : 0) - (west !== here ? 1 : 0)
    const ny = (south !== here ? 1 : 0) - (north !== here ? 1 : 0)
    if (nx === 0 && ny === 0) { s.visible = false; return } // most cells, most of the time — no border nearby
    // v5.10 (spec §4.5, kill list §8.11): a seam is a chance to SAY WHAT THE TWO REGIONS ARE. This
    // used to draw T.fence — a suburban picket fence — at every land/land border, including the
    // one between a farm and a moor. Three seam bakes: a hedge line for suburb/park seams, a
    // dry-stone tick-row for farm/hill seams, and riprap + a real wave crest for any coastline.
    const other = [east, west, south, north].find((d) => d !== here) || here
    const isCoast = here === 'sea' || other === 'sea'
    const seam = isCoast ? 'shore' : (DISTRICT_EDGE.pairs[[here, other].sort().join('|')] || 'hedge')
    const kind = seam === 'shore'
      ? { name: 'waveCrest', baked: true, litTint: true, tints: SEA_FOAM_TINTS, alpha: 0.75, size: [80, 130] }
      : seam === 'wall'
        ? { name: 'wallSeam', baked: true, alpha: 0.8, size: PROP_SCALE.fence }
        : { name: 'hedgeSeam', baked: true, alpha: 0.9, size: PROP_SCALE.hedge }
    const pos = applyPropKind(s, kind, i, j, wx, wy) // handles texture/tint/scale/anchor; rotation overridden next
    s.position.set(pos.x, pos.y)
    s.rotation = Math.atan2(nx, -ny) // perpendicular to the (nx,ny) outward normal — runs ALONG the border
  }

  // road/clutter run over EVERY chapter's cells (touchFloorCell has no chapter gate) but their
  // populate callbacks no-op (s.visible = false) outside skies/urban — see their own doc comments
  // above for why a self-gating predicate layer was the only way to add chapter-scoped density
  // without touching the shared cell/chance numbers every other chapter also uses.
  // v5.9.2 ("the fuck is this?" bug report): big/mid/detail carry an extra `skiesKeep` — see
  // touchFloorCell below and SKIES_FLOOR_KEEP's doc in config.js. blotch/road/clutter/edge have none
  // (undefined), so touchFloorCell's extra gate never fires for them at all, chapter or no.
  const FLOOR_LAYERS = [
    { name: 'blotch', cell: 420, chance: 1.00, parent: blotchLayer, populate: populateBlotch },
    // v5.11 terrain surface (skies only — populateTerrain self-gates on chapterHasDistricts). Its
    // cell is PARCEL so one cell is exactly one farm field; at ~280px a 1900x1000 view is about 50
    // sprites, cheaper than the 420px blotch layer it stands in for.
    { name: 'terrain', cell: PARCEL, chance: 1.00, parent: blotchLayer, populate: populateTerrain },
    { name: 'road', cell: ROAD_CELL, chance: 1.00, parent: roadLayer, populate: populateRoad },
    { name: 'roadDecal', cell: ROAD_DECAL.cell, chance: ROAD_DECAL.chance, parent: roadDecalLayer, populate: populateRoadDecal },
    { name: 'big', cell: 460, chance: 0.35, parent: bigLayer, populate: populateBig, skiesKeep: SKIES_FLOOR_KEEP.big, clump: true },
    { name: 'mid', cell: 170, chance: 0.55, parent: midLayer, populate: populateMid, skiesKeep: SKIES_FLOOR_KEEP.mid, clump: true },
    { name: 'detail', cell: 120, chance: 0.40, parent: detailLayer, populate: populateDetail, skiesKeep: SKIES_FLOOR_KEEP.detail, clump: true },
    { name: 'clutter', cell: 150, chance: 1.00, parent: clutterLayer, populate: populateClutter, clump: true },
    { name: 'edge', cell: 170, chance: 1.00, parent: edgeLayer, populate: populateEdge },
  ]

  function touchFloorCell(cfg, i, j) {
    if (cellHash(i, j, 999) >= cfg.chance) return
    // Skies-only extra thinning (config.js SKIES_FLOOR_KEEP): a second, independent chance roll on
    // top of cfg.chance so big/mid/detail can be cut hard for skies alone, without lowering the
    // cfg.chance every other chapter's identical layer also reads. `cfg.skiesKeep` is undefined for
    // every layer that doesn't opt in (blotch/road/clutter/edge) and for every OTHER chapter's cells
    // this same layer still gets touched for (chapterHasDistricts is skies-only), so neither ever
    // sees this line do anything.
    if (chapterHasDistricts && cfg.skiesKeep != null && cellHash(i, j, 998) >= cfg.skiesKeep) return
    // v5.12 CLUMPING. cfg.chance is a flat per-cell roll, so scatter came out statistically even —
    // and even spacing is exactly what a LATTICE looks like: the wide-area captures showed woodland
    // as a regular grid of dots. clumpAt (terrain.js) is a contrast-stretched low-frequency mask;
    // multiplying occupancy by it gives dense copses with ragged edges and real clearings, which is
    // what natural cover actually does. Only the scatter layers opt in (cfg.clump) — roads,
    // junctions and the terrain surface must stay deterministic and complete.
    if (chapterHasDistricts && cfg.clump && cellHash(i, j, 997) >= clumpAt((i + 0.5) * cfg.cell, (j + 0.5) * cfg.cell, districtSeed)) return
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
    const w = viewW()
    const h = viewH()
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
  // v5.8 kaiju redesign (skies only): a soft halo behind the whole rig, lit up while a rampage is
  // active (run.rampageT > 0 — see syncPlayer) so the widened crush radius (stepCrush's entire
  // rampage payoff, config.js RAMPAGE_CRUSH_MUL) reads as "I am currently dangerous" at a glance.
  // Built as Texture.EMPTY, like pTail's tailA/tailB below — this rig is constructed synchronously
  // right after buildTextures(), before the fx sheet (T.fx, loaded via Assets) is ready; syncPlayer
  // latches the real circle_05 texture onto it the first time it's actually needed.
  const pRampageGlow = new Sprite(Texture.EMPTY)
  pRampageGlow.anchor.set(0.5)
  pRampageGlow.visible = false
  const pShadow = spriteOf(T.playerShadow)
  pShadow.y = PLAYER.radius * 0.95
  const bodyC = new Container()
  const pBody = spriteOf(T.playerBody)
  const pupilL = spriteOf(T.pupil)
  const pupilR = spriteOf(T.pupil)
  const pFlash = spriteOf(T.playerFlash)
  pFlash.alpha = 0
  bodyC.addChild(pBody, pupilL, pupilR, pFlash)
  // flagellum tail (pond/undergrowth skins): two stacked streak glyphs behind the blob, trailing
  // the player's facingAngle with a wiggle. Textures are fx sprites so they're assigned once the fx
  // sheet loads (buildFxTextures); this rig starts hidden and is revealed by chapterRender.tail.
  // v5.11: tailC is the kaiju rig's third chain link ONLY (see syncPlayer) — pond/undergrowth never
  // show it (it starts and stays invisible, texture never assigned, for any non-kaiju chapter).
  const pTail = new Container()
  pTail.visible = false
  const tailA = new Sprite(Texture.EMPTY)
  const tailB = new Sprite(Texture.EMPTY)
  const tailC = new Sprite(Texture.EMPTY)
  for (const t of [tailA, tailB, tailC]) { t.anchor.set(0.04, 0.5); pTail.addChild(t) }
  playerC.addChild(pRampageGlow, pShadow, pTail, bodyC) // glow sits furthest back, tail above the shadow, behind the body

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
  }

  function clearStorm() {
    cloudShadowLayer.visible = false
    stormCloudLayer.visible = false
    stormRainLayer.visible = false
    for (const p of cloudShadows) { p.s.visible = false; p.spawned = false }
    for (const p of stormClouds) { p.s.visible = false; p.spawned = false }
  }

  // ==============================================================================================
  // SKIES v5.10 — the crush ledger, the light layer, and the second particle pool
  // ==============================================================================================

  // ---- the second particle pool (spec §1.2) ----------------------------------------------------
  // MAX_PARTICLES is ONE global 200-slot ring buffer and particleCursor wraps SILENTLY. Adding
  // persistent missile smoke, crush dust and artillery clods to it would evict every hit/kill/
  // pickup particle in the game, with no error and no way to notice but by eye. Same shape, own
  // cap, own layer, and ONLY those three effects may use it.
  const smokeParticles = []
  for (let i = 0; i < SKIES_SMOKE.max; i++) {
    smokeParticles.push({ s: null, live: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, scale: 1, grow: 0, drag: 0, grav: 0, spin: 0, fade: 1, tintB: null })
  }
  let smokeCursor = 0
  function spawnSmoke(tex, x, y, vx, vy, life, scale, tint, grow = 0, drag = 0, grav = 0, spin = 0, fade = 1, tintB = null) {
    const p = smokeParticles[smokeCursor]
    smokeCursor = (smokeCursor + 1) % SKIES_SMOKE.max
    if (!p.s) { p.s = new Sprite(tex); p.s.anchor.set(0.5); smokeLayer.addChild(p.s) }
    if (p.s.texture !== tex) p.s.texture = tex
    p.live = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy
    p.life = life; p.maxLife = life; p.scale = scale; p.grow = grow; p.drag = drag; p.grav = grav
    p.spin = spin; p.fade = fade; p.tintB = tintB
    p.s.visible = true; p.s.tint = tint; p.s.rotation = Math.random() * Math.PI * 2
    p.tintA = tint
  }
  function updateSmoke(dt) {
    if (dt === 0) return
    for (const p of smokeParticles) {
      if (!p.live) continue
      p.life -= dt
      if (p.life <= 0) { p.live = false; p.s.visible = false; continue }
      const k = p.drag > 0 ? Math.max(0, 1 - p.drag * dt) : 1
      p.vx *= k
      p.vy = p.vy * k + p.grav * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.scale += p.grow * dt
      p.s.position.set(p.x, p.y)
      p.s.scale.set(Math.max(0.001, p.scale))
      p.s.rotation += p.spin * dt
      const age = 1 - p.life / p.maxLife
      // a smoke ribbon COOLS as it ages: near-tint -> far-tint, which is what makes a corkscrew
      // read as one continuous trail rather than a row of identical dots
      if (p.tintB !== null) p.s.tint = mix(p.tintA, p.tintB, age)
      p.s.alpha = Math.min(1, (p.life / p.maxLife) * p.fade)
    }
  }
  function clearSmoke() {
    for (const p of smokeParticles) { p.live = false; if (p.s) p.s.visible = false }
  }

  // ---- the crush ledger (spec §7.5) ------------------------------------------------------------
  // ONE render-local structure serving THREE features, which is what makes it worth having:
  //   1. the permanent kind-specific ruin + foundation scar left at the site (§5.9);
  //   2. the LAMP BLACKOUT — kerb lamps near an entry render at alpha 0, so ploughing an avenue
  //      leaves a DEAD BLACK CORRIDOR through a lit grid. That corridor is this chapter's whole
  //      fantasy expressed as a lighting state, and it costs one distance test;
  //   3. searchlight anchor invalidation — crush the tower, kill the light.
  // NEVER written back to `run`: render.js does not mutate sim state, and the obstacle is gone from
  // run.obstacles by the time any of this draws, so the ledger is keyed by WORLD POSITION.
  const crushLedger = new Map()
  function ledgerKey(x, y) {
    const c = SKIES_LIGHT.ledger.cellPx
    return Math.round(x / c) + ',' + Math.round(y / c)
  }
  function ledgerAdd(x, y, kind, r) {
    const L = SKIES_LIGHT.ledger
    crushLedger.set(ledgerKey(x, y), { x, y, kind: RUIN_FOR_KIND[kind] || 'tower', r })
    if (crushLedger.size <= L.cap) return
    // over cap: evict the entry farthest from the player (and anything past dropPx outright)
    let worstKey = null, worstD = -1
    for (const [k, e] of crushLedger) {
      const d = (e.x - playerX) ** 2 + (e.y - playerY) ** 2
      if (d > L.dropPx * L.dropPx) { crushLedger.delete(k); continue }
      if (d > worstD) { worstD = d; worstKey = k }
    }
    if (crushLedger.size > L.cap && worstKey) crushLedger.delete(worstKey)
  }
  // The crushed structure's radius, for sizing its ruin. By the time the event reaches us the
  // obstacle is already out of run.obstacles — but syncObstacles has not rebuilt yet this frame
  // (sync() drains events first), so the sprite rig still holds last frame's x/y/r.
  function radiusAtCrush(x, y) {
    for (const ov of obstacleSprites) {
      if (!ov.root.visible) continue
      if (Math.abs(ov.x - x) < 2 && Math.abs(ov.y - y) < 2) return ov.r
    }
    return 16
  }
  const ruinSprites = []
  function updateRuins(cx, cy) {
    let n = 0
    if (chapterHasStorm) {
      const w = viewW(), h = viewH()
      for (const e of crushLedger.values()) {
        const sx = e.x + cx, sy = e.y + cy
        if (sx < -160 || sx > w + 160 || sy < -160 || sy > h + 160) continue
        while (ruinSprites.length <= n) {
          const s = new Sprite(Texture.EMPTY); s.anchor.set(0.5); ruinLayer.addChild(s); ruinSprites.push(s)
        }
        const look = T.skRuin[e.kind] || T.skRuin.tower
        const s = ruinSprites[n++]
        s.visible = true
        s.texture = look.tex
        s.anchor.set(look.ax, look.ay)
        s.tint = 0xffffff
        s.alpha = 1
        s.rotation = 0
        s.scale.set((e.r * SKIES_PLAN_SCALE) / (SKR * 2))
        s.position.set(e.x, e.y)
      }
    }
    for (let i = n; i < ruinSprites.length; i++) ruinSprites[i].visible = false
  }

  // ---- junctions (spec §4.3) — enumerated from the latched grid origin -------------------------
  const junctionSprites = []
  for (let i = 0; i < ROAD_JUNCTION.pool; i++) {
    const s = new Sprite(Texture.EMPTY); s.anchor.set(0.5); s.visible = false
    junctionLayer.addChild(s); junctionSprites.push(s)
  }
  function updateJunctions(cx, cy) {
    let n = 0
    if (chapterHasRoads && T.junction) {
      const { cities, x0, y0, x1, y1 } = visibleCities(cx, cy, 90)
      for (const c of cities) {
        if (n >= junctionSprites.length) break
        const b = cityViewBounds(c, x0, y0, x1, y1)
        for (let ui = Math.ceil(b.uMin / c.blockU); ui * c.blockU <= b.uMax && n < junctionSprites.length; ui++) {
          for (let vi = Math.ceil(b.vMin / c.blockV); vi * c.blockV <= b.vMax && n < junctionSprites.length; vi++) {
            const p = cityToWorld(c, ui * c.blockU, vi * c.blockV)
            // A grid node inside the radius can still fall outside the street area — the urban
            // falloff is noise-wobbled, so the outermost nodes have no pavement under them. Asking
            // roadAt is the one check guaranteed to agree with what populateRoad actually drew.
            if (!roadAt(p.x, p.y, roadSeed).onRoad) continue
            // Class comes straight from the grid index, the same test roadAt itself uses — no probe.
            const E = STREET_SPACING_MAJOR_EVERY
            const uMajor = ((ui % E) + E) % E === 0
            const vMajor = ((vi % E) + E) % E === 0
            const look = T.junction[(uMajor ? 'major' : 'minor') + (vMajor ? 'Major' : 'Minor')]
            const s = junctionSprites[n++]
            s.visible = true
            s.texture = look.tex
            s.anchor.set(look.ax, look.ay)
            s.tint = 0xffffff
            s.alpha = 1
            // Baked axis-aligned, so it has to turn with the city it belongs to.
            s.rotation = c.angle
            s.scale.set(1)   // baked at TRUE world size
            s.position.set(p.x, p.y)
          }
        }
      }
    }
    for (let i = n; i < junctionSprites.length; i++) junctionSprites[i].visible = false
  }


  // ==============================================================================================
  // SKIES v5.10 — THE SIX THREAT SIGNATURES (spec §3)
  // ==============================================================================================
  // Six threats separated on THREE AXES AT ONCE — colour family, shape language, motion verb — with
  // NO TWO SHARING MORE THAN ONE AXIS. That constraint is the whole fix for "everything looks the
  // same", and it is also the acceptance test: a reviewer who has never played must be able to name
  // each threat from a still frame, and again from that frame in GREYSCALE.
  //
  //   strafe    | halogen + orange  | parallel hairlines + ellipse | travels ALONG a line
  //   missile   | magenta           | rotating diamond + helix     | flies AT you, trail persists
  //   artillery | dull olive/ochre  | square box + diagonal hatch  | FALLS; opposed shrink/grow
  //   sky       | violet            | leaning vector + chevron ring| DESCENDS then cracks; sparks rise
  //   crush     | grey/material     | squashed skirt + hard shards | SLOW settle; adds geometry
  //   rampage   | atomic cyan       | rings + dorsal plates        | sustained pulse OUT FROM YOU
  //
  // Every INCOMING threat also carries exactly ONE travelling element that arrives on the exact
  // frame damage lands (the ARRIVAL CLOCK), so the player reads four clocks at four speeds instead
  // of "the circle got brighter". Each clock's duration IS the sim fuse, by reference.

  // The shadow-stroke rule (spec §2): draw every threat stroke TWICE — near-black underneath at
  // width + widen, then the colour on top. This is what lets six SATURATED palettes stay legible
  // over six district floor tints without raising alpha; the alternative is mid-tint mush.
  function inkStroke(g, path, width, color, alpha) {
    path(); g.stroke({ width: width + SKIES_INK.widen, color: SKIES_INK.color, alpha: SKIES_INK.alpha * (alpha ?? 1), join: 'round', cap: 'round' })
    path(); g.stroke({ width, color, alpha, join: 'round', cap: 'round' })
  }
  // Telegraph LOD (spec §3.2): beyond this distance a glyph degrades to its impact mark alone. The
  // far ones carry no information a distant player can act on anyway, and SHELL_MAX_LIVE +
  // MAX_STRAFE_LOCKS glyphs of graduated ticks drawn live do not hold on a phone.
  function farFromPlayer(x, y) {
    const dx = x - playerX, dy = y - playerY
    return dx * dx + dy * dy > SKIES_TELEGRAPH_LOD_PX * SKIES_TELEGRAPH_LOD_PX
  }

  // RAMPAGE JAMMING (spec §3, rampage row): while you are rampaging, every ENEMY telegraph visibly
  // breaks up — you are not merely stronger, their targeting is failing. On rampage END the dropout
  // decays to 0 so the picture RE-ACQUIRES; a hard snap back reads as a rendering bug.
  function jamDrop() { return jamT > 0 && Math.random() < SKIES_JAM.dropout * jamT }
  function jamAlpha(a) { return jamT > 0 ? a * (SKIES_JAM.alphaMin + SKIES_JAM.alphaJitter * Math.random()) : a }

  // ---- 1. TANK ARTILLERY + 2. SKY BOMBARDMENT + 3. VOLATILE ELITE BOMB (run.bombs) --------------
  // v5.10.1 P0 fix: sim.js now pushes an explicit `src: 'gun'|'sky'|'volatile'` on every run.bombs
  // entry (the three push sites, additive fields only — see sim.js). bombSrc used to INFER the
  // source from `duration` matching one of two known fuses and silently treated anything else
  // (volatile elites) as "keep the generic drawer" — which routed a dead elite's corpse-bomb through
  // the FORBIDDEN red telegraph (config.js SKIES_PALETTE.alert is reserved for alert-only) and then,
  // on detonation, through the `else` branch of the explode handler straight into skyDetonation: a
  // volatile elite's death was drawn as the sky's own lightning strike, full-field flash included, in
  // the one chapter whose whole premise is telling the two apart. Reading `b.src` directly instead of
  // guessing from a timing coincidence fixes both halves at once.
  function bombSrc(b) {
    if (!chapterHasStorm) return null
    return b.src === 'gun' || b.src === 'sky' || b.src === 'volatile' ? b.src : null
  }
  // Artillery's trajectory ghost now reads `b.ox`/`b.oy` — the firing tank's own position, set by sim
  // the instant the shell is pushed (sim.js:570). This used to be a render-side heuristic
  // (`latchBombOrigin`, scanning every artillery enemy for whichever currently held the globally
  // highest `e._shellT`) that a reviewer caught attaching the trajectory ghost + muzzle flash to the
  // wrong, sometimes off-screen, tank whenever an idle tank's timer simply outranked the one that had
  // actually just fired, or whenever two tanks fired the same frame. A per-bomb field sim already has
  // is authoritative; render no longer needs to guess. `firedMuzzle` only tracks "have we already
  // popped this bomb's one-shot muzzle flash", not the origin itself.
  const firedMuzzle = new WeakSet()
  function maybeSpawnMuzzleFlash(b) {
    if (b.src !== 'gun' || firedMuzzle.has(b)) return
    firedMuzzle.add(b)
    spawnParticle(T.muzzleFlash.tex, b.ox, b.oy, 0, 0, SKIES_FX.artillery.muzzleT,
      0.10, SKIES_FX.artillery.muzzle, 0.4, 0)     // muzzle flash: 0.06 s, at the gun that fired
  }

  const shellRigs = []
  function acquireShellRig() {
    const box = new Sprite(T.tgSquare.tex); box.anchor.set(T.tgSquare.ax, T.tgSquare.ay)
    const fill = new Sprite(T.tgHandFill.tex); fill.anchor.set(T.tgHandFill.ax, T.tgHandFill.ay)
    const bars = new Sprite(T.tgHandBars.tex); bars.anchor.set(T.tgHandBars.ax, T.tgHandBars.ay)
    const shadow = new Sprite(T.shellShadow.tex); shadow.anchor.set(0.5)
    shellLayer.addChild(shadow, fill, bars, box)
    const rig = { box, fill, bars, shadow }
    shellRigs.push(rig)
    return rig
  }
  const skyRigs = []
  function acquireSkyRig() {
    const wash = new Sprite(T.skyIonWash.tex); wash.anchor.set(0.5)
    const ring = new Sprite(T.skyChevrons.tex); ring.anchor.set(T.skyChevrons.ax, T.skyChevrons.ay)
    skyLayer.addChild(wash, ring)
    const rig = { wash, ring }
    skyRigs.push(rig)
    return rig
  }
  const voltRigs = []
  function acquireVoltRig() {
    const ring = new Sprite(T.voltRing.tex); ring.anchor.set(T.voltRing.ax, T.voltRing.ay)
    const core = new Sprite(T.voltCore); core.anchor.set(0.5)   // small pulsing unstable core
    voltLayer.addChild(core, ring)
    const rig = { ring, core }
    voltRigs.push(rig)
    return rig
  }

  function drawSkiesBombs(run) {
    const AF = SKIES_FX.artillery
    const SF = SKIES_FX.sky
    const VF = SKIES_FX.volatile
    let si = 0, ki = 0, vi = 0
    for (const b of run.bombs) {
      const src = bombSrc(b)
      if (src === null) continue
      const k = b.duration > 0 ? 1 - Math.max(0, b.fuse) / b.duration : 1   // 0 -> 1 over the fuse
      const far = farFromPlayer(b.x, b.y)
      if (src === 'volatile') {
        // ==== P0 fix: volatile elites used to fall through to the generic RED bomb circle (the
        // forbidden telegraph colour) and then detonate as a re-tinted lightning strike. This threat
        // now has its own colour (acid green — unclaimed by any of the six main threats, the alert
        // red or the ambience gold), its own shape (a toothed ring), and its own motion: it GROWS and
        // destabilises rather than closing inward like gun/sky, so the motion axis differs too.
        const rig = voltRigs[vi++] || acquireVoltRig()
        const pulseHz = 6 + k * 18   // pulses faster as it nears detonation — "going unstable"
        const pulse = 0.5 + 0.5 * Math.sin(animT * pulseHz)
        const jitter = k > 0.6 ? (Math.random() - 0.5) * (k - 0.6) * 30 : 0
        rig.ring.visible = true
        rig.ring.tint = VF.ring
        rig.ring.alpha = jamAlpha(0.4 + 0.45 * k + 0.15 * pulse)
        rig.ring.scale.set((b.radius * (0.5 + 0.55 * k)) / T.voltRing.ref)   // GROWS, not shrinks
        rig.ring.rotation = k * Math.PI * 0.6
        rig.ring.position.set(b.x + jitter, b.y + jitter)
        rig.core.visible = !far
        rig.core.tint = VF.core
        rig.core.alpha = jamAlpha(0.5 + 0.5 * pulse)
        const coreR = 8 + 16 * k
        rig.core.scale.set((coreR * 2) / 48)
        rig.core.position.set(b.x, b.y)
        continue
      }
      if (src === 'gun') {
        // ==== the only SQUARE telegraph, the only HATCHED fill, the only DESATURATED one, and the
        // only one that draws a curved line back to a GROUND ORIGIN. That last part is the
        // mass-read: a screenful of shells visibly RADIATES from scattered tanks, where a screenful
        // of sky strikes is all-parallel.
        const rig = shellRigs[si++] || acquireShellRig()
        const elite = b.radius >= ARTILLERY_ELITE_RADIUS - 1
        // ARRIVAL CLOCK, part 1: the brackets SHRINK INWARD onto the impact point...
        const boxR = b.radius * (1.55 - 0.55 * k)
        rig.box.visible = true
        rig.box.tint = AF.bracket
        rig.box.alpha = jamAlpha(0.55 + 0.4 * k)
        rig.box.scale.set(boxR / T.tgSquare.ref)
        rig.box.position.set(b.x, b.y)
        rig.box.rotation = 0
        // ...part 2: the hatched hand sweeps EXACTLY 360 degrees over the fuse and completes on
        // impact. Two opposed motions locking on the same frame is the whole read.
        const hand = k * Math.PI * 2 - Math.PI / 2
        for (const [sp, tint, alpha] of [[rig.fill, AF.hatchFill, AF.hatchAlpha], [rig.bars, AF.hatchBar, 0.75]]) {
          sp.visible = !far
          sp.tint = tint
          sp.alpha = jamAlpha(alpha)
          sp.rotation = hand
          sp.scale.set(b.radius / T.tgHandFill.ref)
          sp.position.set(b.x, b.y)
        }
        // ...part 3: the falling shell's OWN shadow grows from 4px to the full blast radius
        rig.shadow.visible = true
        rig.shadow.tint = AF.shellShadow
        rig.shadow.alpha = AF.shellShadowAlpha * (0.35 + 0.65 * k)
        const shR = lerp(AF.shadowStartPx, b.radius * 0.9, k * k)
        rig.shadow.scale.set(shR / T.shellShadow.ref)
        rig.shadow.position.set(b.x, b.y)
        if (elite) {   // AA-turret elites: a radar-green tick on the bracket, nothing else changes
          bombG.circle(b.x, b.y - boxR, 3.2).fill({ color: AF.eliteTick, alpha: 0.9 })
        }
        maybeSpawnMuzzleFlash(b)   // one-shot, gated by the firedMuzzle WeakSet
        // the trajectory ghost, arcing back to the gun that fired it — b.ox/b.oy are the ACTUAL
        // shooter (sim.js sets them at spawn), not a render-side guess
        if (!far && !jamDrop() && b.ox != null && b.oy != null) {
          const mx = (b.ox + b.x) / 2, my = (b.oy + b.y) / 2 - Math.hypot(b.x - b.ox, b.y - b.oy) * 0.28
          inkStroke(bombG, () => { bombG.moveTo(b.ox, b.oy); bombG.quadraticCurveTo(mx, my, b.x, b.y) },
            1.6, AF.ghost, jamAlpha(AF.ghostAlpha))
        }
      } else {
        // ==== the only VIOLET thing, the only MASS-PARALLEL telegraph, the only BRANCHING fractal,
        // and the only telegraph whose particles RISE. Parallelism is the whole composition: a
        // screenful of vectors all leaning at STORM_VIS.windAngle says THE SKY IS FIRING.
        const rig = skyRigs[ki++] || acquireSkyRig()
        rig.ring.visible = true
        rig.ring.tint = SF.ring
        rig.ring.alpha = jamAlpha(0.22 + 0.48 * k)   // v5.13: dimmer early, so a strike EARNS its
                                                      // attention as the fuse burns down instead of
                                                      // announcing itself at full strength on frame 1
        rig.ring.scale.set((b.radius * (1.7 - 0.7 * k)) / T.skyChevrons.ref)   // closing inward
        rig.ring.position.set(b.x, b.y)
        rig.wash.visible = true
        rig.wash.tint = SF.ionisation
        rig.wash.alpha = SF.ionisationAlpha * (0.4 + 0.6 * k)
        rig.wash.scale.set((b.radius * 0.95) / T.skyIonWash.ref)
        rig.wash.position.set(b.x, b.y)
        if (!far) {
          // the descent vector, LEANED ALONG THE WIND so every simultaneous strike is parallel
          const wa = STORM_VIS.windAngle
          const ux = -Math.cos(wa), uy = -Math.sin(wa)
          const topX = b.x + ux * SF.dropPx, topY = b.y + uy * SF.dropPx
          if (!jamDrop()) {
            inkStroke(bombG, () => { bombG.moveTo(topX, topY); bombG.lineTo(b.x, b.y) },
              1.8, SF.descent, jamAlpha(0.30 + 0.35 * k))
          }
          // ARRIVAL CLOCK: a triple chevron slides DOWN the vector, ACCELERATING, and touches
          // ground exactly at fuse = 0
          const ease = Math.pow(k, SF.chevronAccel)
          for (let c = 0; c < SF.chevrons; c++) {
            if (jamDrop()) continue
            const d = SF.dropPx * (1 - ease) + c * SF.chevronGapPx
            if (d > SF.dropPx) continue
            const cx = b.x + ux * d, cy = b.y + uy * d
            const px2 = -uy, py2 = ux
            // arms trail back UP the vector so the chevron's tip points DOWN, at the ground it is
            // about to hit — an arrow pointing back at the sky says exactly the wrong thing
            inkStroke(bombG, () => {
              bombG.moveTo(cx + px2 * 9 + ux * 11, cy + py2 * 9 + uy * 11)
              bombG.lineTo(cx, cy)
              bombG.lineTo(cx - px2 * 9 + ux * 11, cy - py2 * 9 + uy * 11)
            }, 2.4, SF.descent, jamAlpha(0.85 - c * 0.22))
          }
        }
        // crackling spark ticks on the perimeter — they travel UP, always. Nothing else in the
        // chapter has particles that rise, which is the whole point of the axis.
        if (!far) {
          const tick = Math.floor(animT * 14)
          for (let s = 0; s < SF.sparkTicks; s++) {
            if ((s % 3) !== (tick % 3)) continue
            const a = (s / SF.sparkTicks) * Math.PI * 2 + k * 1.5
            const rr = b.radius * (0.9 + 0.12 * hash(s * 3.1 + tick))
            const lift = 5 + 11 * hash(s * 7.7 + tick * 1.3)
            const sx = b.x + Math.cos(a) * rr, sy = b.y + Math.sin(a) * rr
            bombG.moveTo(sx, sy)
            bombG.lineTo(sx + (hash(s * 2.3 + tick) - 0.5) * 4, sy - lift)
            bombG.stroke({ width: 2.2, color: SF.boltCore, alpha: jamAlpha(0.35 + 0.55 * k), cap: 'round' })
          }
        }
      }
    }
    for (let i = si; i < shellRigs.length; i++) {
      const r = shellRigs[i]; r.box.visible = false; r.fill.visible = false; r.bars.visible = false; r.shadow.visible = false
    }
    for (let i = ki; i < skyRigs.length; i++) { skyRigs[i].wash.visible = false; skyRigs[i].ring.visible = false }
    for (let i = vi; i < voltRigs.length; i++) { voltRigs[i].ring.visible = false; voltRigs[i].core.visible = false }
  }
  function clearSkiesBombs() {
    for (const r of shellRigs) { r.box.visible = false; r.fill.visible = false; r.bars.visible = false; r.shadow.visible = false }
    for (const r of skyRigs) { r.wash.visible = false; r.ring.visible = false }
    for (const r of voltRigs) { r.ring.visible = false; r.core.visible = false }
  }

  // Detonations. THREE completely separate drawers (v5.10.1 adds volatile) — a colour swap on one
  // drawer is exactly the bug.
  function artilleryDetonation(x, y, radius) {
    // BLACK-CORED fireball: ordnance, not a cartoon pop
    spawnParticle(T.artFireball.tex, x, y, 0, 0, 0.26, (radius / 90) * 0.9, 0xffffff, 1.2, 0)
    // ten ANGULAR clods on real parabolas, landing and leaving splash decals (they use the smoke
    // pool, so they cannot evict the game's hit/kill particles — spec §1.2)
    for (let i = 0; i < SKIES_FX.artillery.clodCount; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 130 + Math.random() * 180
      spawnSmoke(T.clod.tex, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 120,
        0.5 + Math.random() * 0.25, 0.7 + Math.random() * 0.5, SKIES_FX.artillery.clod,
        0, 0.6, SKIES_FX.crush.shardGravity, (Math.random() - 0.5) * 12)
    }
    addShake(3, 0.16)
  }
  function skyDetonation(x, y, radius) {
    const SF = SKIES_FX.sky
    const b = LIGHTNING.strikeBolt
    // the bolt itself keeps the shared spawnArc machinery (a jagged glow-then-core polyline
    // genuinely IS a bolt — shared MACHINERY, not a shared LOOK; it is retinted violet here)
    spawnArc(lightningBoltPath(x, y, b.dropPx, b.segments, b.jitterPx), SF.boltGlow, SF.boltCore, SF.boltDur, b.width, b.alpha)
    triggerLightningFlash(LIGHTNING.flash.strikeAlpha)
    // dendritic Lichtenberg branches BURNED INTO the ground — the only branching fractal in the game
    const look = T.branchTree[Math.floor(Math.random() * T.branchTree.length)]
    let s = null
    for (const c of scarSprites) if (!c.live) { s = c; break }
    if (!s && scarSprites.length < 12) {
      const sp = new Sprite(Texture.EMPTY); sp.anchor.set(0.5); scarLayer.addChild(sp)
      s = { sp, live: false, t: 0 }; scarSprites.push(s)
    }
    if (s) {
      s.live = true; s.t = SF.scarLife
      s.sp.visible = true
      s.sp.texture = look.tex
      s.sp.anchor.set(look.ax, look.ay)
      s.sp.tint = SF.scar
      s.sp.rotation = Math.random() * Math.PI * 2
      s.sp.scale.set((radius * 1.5) / look.ref)
      s.sp.position.set(x, y)
    }
    // sparks that RISE — T.sparkTick, a thin vertical streak (v5.10.1: was T.scorchTick, the same
    // small glyph missile's impact and the jet's ground scorch also used)
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2
      spawnParticle(T.sparkTick.tex, x + Math.cos(a) * radius * 0.6, y + Math.sin(a) * radius * 0.6,
        (Math.random() - 0.5) * 40, -80 - Math.random() * 110, 0.4 + Math.random() * 0.2,
        0.8, SF.boltCore, -0.6, 1.2, 40)
    }
    addShake(3.4, 0.18)
  }
  // VOLATILE detonation (P0 fix): a hard acid-green spike burst + a fast-collapsing ring echo of its
  // own telegraph shape — NOT the artillery fireball (ochre/black) and NOT the sky bolt+scar+flash
  // (violet/white, full-field flash). No lightning, no fireball: a corpse going unstable, not ordnance
  // and not weather.
  function volatileDetonation(x, y, radius) {
    const VF = SKIES_FX.volatile
    for (let i = 0; i < VF.spikeCount; i++) {
      const a = (i / VF.spikeCount) * Math.PI * 2 + Math.random() * 0.3
      const sp = 160 + Math.random() * 140
      spawnParticle(T.voltSpike.tex, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        0.32 + Math.random() * 0.12, 1.0, VF.ring, -1.0, 0)
    }
    spawnParticle(T.voltCore, x, y, 0, 0, 0.22, 1.6, VF.core, 2.4, 0)
    addShake(2.6, 0.14)
  }
  const scarSprites = []
  function updateScars(dt) {
    for (const s of scarSprites) {
      if (!s.live) continue
      if (dt > 0) s.t -= dt
      if (s.t <= 0) { s.live = false; s.sp.visible = false; continue }
      s.sp.alpha = Math.min(1, s.t / SKIES_FX.sky.scarLife) * 0.55
    }
  }
  function clearScars() { for (const s of scarSprites) { s.live = false; s.sp.visible = false } }

  // ---- 3. HELICOPTER MISSILE (spec §3, missile row) --------------------------------------------
  // The only travelling PHYSICAL projectile, the only SPIRAL in the game, the only mark anchored to
  // the PLAYER, and the only magenta in any of the seven chapters.
  const lockDiamond = new Sprite(Texture.EMPTY)
  lockDiamond.anchor.set(0.5)
  lockDiamond.visible = false
  lockLayer.addChild(lockDiamond)
  function drawMissileLocks(run) {
    const M = SKIES_FX.missile
    if (!chapterHasStorm) { lockDiamond.visible = false; return }
    const p = run.player
    let locking = false
    let tightest = 1
    for (const e of run.enemies) {
      if (e._dead || !e.flags || !e.flags.includes('missileVolley')) continue
      const d = Math.hypot(p.x - e.x, p.y - e.y)
      if (d > MISSILE_FIRE_RANGE) continue
      const firing = (e._volleyLeft || 0) > 0
      const left = firing ? 0 : (e._volleyT ?? 99)
      if (left > M.lockT && !firing) continue
      locking = true
      const k = firing ? 1 : 1 - left / M.lockT       // 0 -> 1, reaching 1 on the LAUNCH frame
      tightest = Math.min(tightest, 1 - k)
      if (farFromPlayer(e.x, e.y) || jamDrop()) continue
      // the designation line from the helicopter's nose, with a BEAD crawling it — the arrival
      // clock: the bead reaches the diamond on the launch frame
      const ux = (p.x - e.x) / (d || 1), uy = (p.y - e.y) / (d || 1)
      const dash = 14
      for (let t = 0; t < d - 20; t += dash * 2) {
        if (jamDrop()) continue
        teleG.moveTo(e.x + ux * t, e.y + uy * t)
        teleG.lineTo(e.x + ux * Math.min(t + dash, d - 20), e.y + uy * Math.min(t + dash, d - 20))
      }
      teleG.stroke({ width: 1.4, color: M.designator, alpha: jamAlpha(0.5 + 0.3 * k) })
      const bd = d * k
      teleG.circle(e.x + ux * bd, e.y + uy * bd, 3.4).fill({ color: M.reticleCore, alpha: jamAlpha(0.95) })
    }
    lockDiamond.visible = locking
    if (!locking) return
    if (lockDiamond.texture !== T.lockDiamond.tex) {
      lockDiamond.texture = T.lockDiamond.tex
      lockDiamond.anchor.set(T.lockDiamond.ax, T.lockDiamond.ay)
    }
    // DISCRETE SNAP STEPS, never a smooth lerp — a mechanical reticle, not an organic pulse, and it
    // reads at 4 fps of information, which survives being one of eighteen things on screen
    const steps = M.snapSteps
    const snapped = Math.round(tightest * steps) / steps
    const jitterX = jamT > 0 && (jamSnapT % SKIES_JAM.resnapEvery) < 0.05 ? (Math.random() - 0.5) * SKIES_JAM.resnapPx : 0
    const jitterY = jitterX ? (Math.random() - 0.5) * SKIES_JAM.resnapPx : 0
    lockDiamond.tint = M.designator
    lockDiamond.alpha = jamAlpha(0.9)
    lockDiamond.rotation = animT * 0.9
    lockDiamond.scale.set(lerp(0.7, 2.1, snapped))
    lockDiamond.position.set(run.player.x + jitterX, run.player.y + jitterY)
  }
  // the corkscrew smoke helix: MISSILE_TURN is 0, so the dart is dead straight and the SMOKE is
  // what curls. Lateral sine offset that GROWS as the puff ages = a corkscrew seen from above.
  const missileTrailT = []
  function updateMissileTrails(run, dt) {
    if (!chapterHasStorm || dt <= 0) return
    const M = SKIES_FX.missile
    const list = run.enemyShots || []
    // cap emission to the nearest live missiles — the pool budget is derived from exactly this
    const order = list.map((s, i) => [i, (s.x - playerX) ** 2 + (s.y - playerY) ** 2]).sort((a, b) => a[1] - b[1])
    for (let n = 0; n < Math.min(SKIES_SMOKE.emitters, order.length); n++) {
      const i = order[n][0]
      const sh = list[i]
      missileTrailT[i] = (missileTrailT[i] ?? 0) + dt
      if (missileTrailT[i] < SKIES_SMOKE.puffEvery) continue
      missileTrailT[i] -= SKIES_SMOKE.puffEvery
      const sp = Math.hypot(sh.vx, sh.vy) || 1
      const ux = sh.vx / sp, uy = sh.vy / sp
      const phase = animT * M.helixTurns * 6
      const side = Math.sin(phase)
      spawnSmoke(T.smokePuff, sh.x - ux * 8 + -uy * side * M.helixAmpPx, sh.y - uy * 8 + ux * side * M.helixAmpPx,
        -uy * side * M.helixGrowPx, ux * side * M.helixGrowPx, M.ribbonLife, 0.22, M.smokeNear,
        0.30, 0.7, 0, 0.6, M.smokeFar)
      // v5.10.1: was T.fx.flare_01, the same generic flare frostarc/shockarc/homing/beam reuse — one
      // of this chapter's own six threats gets its own dedicated exhaust bake instead.
      spawnParticle(T.exhaustPuff, sh.x - ux * 6, sh.y - uy * 6, 0, 0, 0.14, 0.07, M.exhaustHot, -0.15, 0)
    }
  }
  function missileImpact(x, y) {
    const M = SKIES_FX.missile
    spawnParticle(T.magentaStar.tex, x, y, 0, 0, 0.22, 1.0, M.impactCore, 1.6, 0)
    spawnSmoke(T.sootRing.tex, x, y, 0, 0, 0.9, 0.35, M.impactSoot, 0.7, 1.2, 0, 0.85)
    // T.impactFleck — a small radiating diamond (v5.10.1: was T.scorchTick, shared with sky's rising
    // sparks and the jet's ground scorch)
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2
      spawnParticle(T.impactFleck.tex, x, y, Math.cos(a) * 150, Math.sin(a) * 150,
        0.22, 0.7, M.designator, 0, 4)
    }
    addShake(1.6, 0.1)
  }

  // ---- 4. CRUSH (spec §3, crush row) -----------------------------------------------------------
  // The ANTI-TELEGRAPH: no warning iconography at all, because it already happened and YOU did it.
  // The only DESATURATED event, the only SLOW one, the only one that REMOVES light, and the only
  // one that adds PERMANENT geometry. Replaces crushBurst's soft round Kenney circle_05/scorch_01
  // puff — soft round particles are precisely what makes a collapsing building read as a cartoon
  // dust cloud (kill list §8.4) — and drops the "fleeing figures" dots (spec §11).
  function skiesCrush(x, y, kind) {
    const C = SKIES_FX.crush
    const mat = C.byKind[kind] || C.byKind.tower
    const n = C.shardMin + Math.floor(Math.random() * (C.shardMax - C.shardMin + 1))
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 90 + Math.random() * 150
      const tex = T.shard[Math.floor(Math.random() * T.shard.length)]
      // ANGULAR, hard-edged, with visible edges — and they arc back DOWN under fake gravity and
      // stop, rather than drifting away like smoke
      spawnSmoke(tex.tex, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 90,
        C.burstT, 0.7 + Math.random() * 0.5, Math.random() < 0.4 ? mat.dustDark : mat.dust,
        0, 1.1, C.shardGravity, (Math.random() - 0.5) * 9)
    }
    // a LOW SQUASHED dust skirt hugging the ground (ratio 1 : 0.45), expanding then SINKING, and
    // then drifting downwind — not a mushroom
    const wa = STORM_VIS.windAngle
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 26 + Math.random() * 38
      // Sized against the BUILDING, not against the screen: T.dustSkirt is a 256px canvas, so the
      // scale here has to stay small or a collapsing house throws a 380px cloud that whites out
      // half the view — which is exactly the soft-round-puff failure this rewrite exists to fix.
      spawnSmoke(T.dustSkirt, x, y, Math.cos(a) * sp + Math.cos(wa) * 12, Math.sin(a) * sp * C.skirtAspect + Math.sin(wa) * 12,
        C.dustT, 0.13 + Math.random() * 0.07, i % 2 ? mat.dustDark : mat.dust, 0.09, 0.9, 0, 0, 0.5)
    }
    // ONE beat of warm interior spill, then the site goes dark — the only time this chapter's
    // ambience colour appears anywhere near an event, and it lasts 0.35 s. T.crushSpill (v5.10.1: was
    // T.shellShadow, artillery's own falling-object shadow tinted gold — a soft SQUARE glow reads as
    // light bleeding from a window, which is what this beat actually represents)
    spawnParticle(T.crushSpill, x, y, 0, 0, C.spillT, 0.55, C.spill, -0.5, 0)
    addShake(1.2, 0.07) // light — crush can fire several times a second mid-rampage
  }

  // ---- 5. RAMPAGE (spec §3, rampage row) -------------------------------------------------------
  // A REGIME CHANGE, not an object added to the scene: the only sustained rhythmic effect, the only
  // one sourced AT THE PLAYER, the only cyan, and the only one that changes the LIGHTING STATE of
  // the whole region rather than drawing something new.
  const platePool = []
  for (let i = 0; i < SKIES_FX.rampage.plates; i++) {
    const s = new Sprite(Texture.EMPTY); s.anchor.set(0.5); s.visible = false
    // v5.11: children of bodyC, not playerC — bodyC now ROTATES to face the kaiju's facingAngle
    // (see syncPlayer), so a plate positioned in bodyC's own local "head-up" space (matching
    // drawKaijuBody's coordinate system exactly) automatically lands on the right spine point
    // no matter which way the kaiju is currently facing, with no extra transform math needed here.
    bodyC.addChild(s); platePool.push(s)
  }
  function updateRampage(run, dt) {
    const R = SKIES_FX.rampage
    rampG.clear()
    const active = chapterHasStorm && (run.rampageT || 0) > 0
    if (dt > 0) {
      jamSnapT += dt
      if (active) jamT = 1
      else jamT = Math.max(0, jamT - dt / SKIES_JAM.recoverT)
      if (active) rampBeatT += dt
    }
    // v5.16: the alert-red WAVE that flipped every searchlight to klaxon red went with the light
    // layer, and so did rampWaveR — the wave had exactly one consumer and it was those cones. The
    // rim-light sweep below is a separate thing: it keys off the crush radius, not the wave.
    if (!active) {
      for (const s of platePool) s.visible = false
      rampBeatT = 0
      return
    }
    const p = run.player
    const ringR = PLAYER.radius * R.ringMul
    // the HEARTBEAT: a ring rolled out to the TRUE widened crush radius, so the prettiest effect on
    // screen is also the honest hitbox. 0.6 s loop — the only looping effect in the chapter.
    // T.rampagePulse (v5.10.1: was T.novaRing — the SAME plain double-ring shared with revive and
    // shatter, both also 0.35-0.45s; rampage's "only looping effect" deserves a ring of its own, not a
    // recolor of two unrelated bursts. T.novaRing itself is untouched — it's cross-chapter machinery).
    if (rampBeatT >= R.beat) { rampBeatT -= R.beat; spawnRing(p.x, p.y, ringR, 0.45, T.rampagePulse, R.plateCool) }
    const beat = 1 - (rampBeatT / R.beat)
    rampG.circle(p.x, p.y, ringR).stroke({ width: 2 + 2 * beat, color: R.plateCool, alpha: 0.25 + 0.3 * beat })
    // a cyan RIM LIGHT on every structure inside the ring — the region lights up around you
    for (const ov of obstacleSprites) {
      if (!ov.root.visible) continue
      const d = Math.hypot(ov.x - p.x, ov.y - p.y)
      if (d > ringR + 30) continue
      rampG.circle(ov.x, ov.y, ov.r + 2).stroke({ width: 2, color: R.rimLight, alpha: R.rimAlpha * (1 - d / (ringR + 30)) })
    }
    // Seven dorsal plates chain-charging TAIL -> HEAD, landing on the EXACT SAME fixed spine points
    // drawKaijuBody bakes as anatomy (py = lerp(-44, 92, f), the same bump curve — see that
    // function's own comment). v5.11 fix: this used to be an arc that rotated with facingAngle
    // while the (non-rotating) body underneath it didn't, so "the plates light up" and "the plates
    // exist" were two unrelated systems that only ever agreed by coincidence (the old body had no
    // baked plates to compare against at all). Now children of bodyC (see platePool's own comment),
    // positioned in the SAME local "head-up" space drawKaijuBody draws in — bodyC's own rotation
    // (syncPlayer, facing the kaiju's facingAngle) carries these along automatically, including its
    // hop-bounce squash, with no extra transform needed here.
    const K = SKIES_KAIJU
    const chargeT = ((animT % R.chainT) / R.chainT)
    for (let i = 0; i < platePool.length; i++) {
      const s = platePool[i]
      const f = i / (platePool.length - 1)
      const charge = Math.max(0, 1 - Math.abs(((f + chargeT) % 1) - 0.5) * 3)
      const py = lerp(-44, 92, f)
      const bump = Math.max(0, 1 - Math.abs(f - 0.42) * 1.5)
      s.visible = true
      if (s.texture !== T.plate.tex) { s.texture = T.plate.tex; s.anchor.set(T.plate.ax, T.plate.ay) }
      s.tint = mix(R.plateCool, R.plateHot, charge)
      s.alpha = 0.6 + 0.4 * charge
      s.scale.set(lerp(0.9, 1.7, bump) * (0.9 + 0.3 * charge) * K.plateGlowScale)
      s.rotation = 0   // plates sit upright on the centreline, not tangential to an arc anymore
      s.position.set(0, py)
    }
  }
  function clearRampage() {
    rampG.clear()
    jamT = 0; rampBeatT = 0
    kaijuSwipeT = 0
    for (const s of platePool) s.visible = false
    lockDiamond.visible = false
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

  function expandBeamArms(beams) {
    const out = []
    for (const b of beams) {
      const arms = b.folded ? (b.arms ?? 2) : 1
      if (arms <= 1) { out.push(b); continue }
      for (let k = 0; k < arms; k++) {
        const angle = b.fan
          ? b.angle - b.fan / 2 + (k / (arms - 1)) * b.fan
          : b.angle + (k / arms) * Math.PI * 2
        out.push({ ...b, angle })   // a COPY: render never writes to run
      }
    }
    return out
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
  // v5.8 kaiju redesign: resolved {tint, foot} per obstacle, keyed by the stable o._cell (sim.js
  // streamObstacles' "i,j" grid key — unique per live obstacle, and deterministic for the cell's
  // whole existence since obstacleCellHash is a pure function of (cell, seed): the same cell always
  // rerolls the identical x/y/r/kind if it pops back after being crushed and re-streamed, so a
  // cached entry never goes stale within a run, only unused once the cell drops out of the field).
  // Exists purely to skip districtAt/districtTintAt (config.js: ~36 hash01 calls EACH, "nowhere
  // near a hot per-frame loop" by that file's own comment) on a rebuild that doesn't need them.
  // Crushing bumps run._obstacleRev every frame it's crushing (sim.js stepCrush) and the field is
  // now ~150 obstacles instead of ~58 (see obstacles.cell/count in config.js), so a full recompute
  // on every such rebuild would be exactly the hot loop that comment warns against. Cleared on
  // reset(run) (see clearObstacles) — a new run rerolls both _obstacleSeed and _districtSeed, so a
  // previous run's cached resolution would be wrong, not just stale.
  const obstacleSkinCache = new Map()
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
    return { root, ring, clumpA, clumpB, mesh: null, x: 0, y: 0, r: 0 }
  }
  // v5.21/v5.22/v5.23: planets that turn. Held outside syncObstacles because that function is
  // rebuild-gated and this has to run every frame.
  const planetSpinners = []
  function tickPlanetSpin() {
    for (const ps of planetSpinners) {
      // Rodrigues: rotation of `angle` about the planet's own unit axis, written straight into the
      // shader's three column vectors. This is the whole reason the redesign happened — a 2D
      // sprite.rotation is a rotation about +z and nothing else, so an arbitrary axis is simply not
      // expressible until the sphere is real.
      const [x, y, z] = ps.axis
      const th = ps.phase + animT * ps.rate
      const c = Math.cos(th), s = Math.sin(th), t = 1 - c
      ps.u.uRot0.set([t * x * x + c, t * x * y + s * z, t * x * z - s * y])
      ps.u.uRot1.set([t * x * y - s * z, t * y * y + c, t * y * z + s * x])
      ps.u.uRot2.set([t * x * z + s * y, t * y * z - s * x, t * z * z + c])
      ps.g.update()   // Float32Arrays were mutated in place; without this the GPU keeps last frame's matrix
    }
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
    const style = chapterBiome.obstacle // non-skies chapters: one style for every obstacle
    const liveCells = new Set() // this rebuild's obstacle set, for the cache prune below
    planetSpinners.length = 0   // rebuilt below; stale sprite refs would spin a released pool slot
    for (let i = 0; i < obstacleSprites.length; i++) {
      const ov = obstacleSprites[i]
      if (i >= list.length) { ov.root.visible = false; continue }
      const o = list[i]
      ov.root.visible = true
      if (ov.mesh) ov.mesh.visible = false   // pool slots are reused across chapters; only the planet branch re-enables it
      ov.root.position.set(o.x, o.y)
      ov.x = o.x; ov.y = o.y; ov.r = o.r
      liveCells.add(o._cell)
      // v5.11: a building INSIDE A CITY is squared to its block. sim's streamObstacles stamps
      // o.rot from the city's own street angle when it snaps the structure off the carriageway
      // (blockSnap, terrain.js); everything in open country keeps the free hashed spin, which is
      // right — a barn in a field answers to nothing, but a row of towers at independent random
      // angles is the loudest possible tell that nobody planned the street they stand on.
      const rot = o.rot ? o.rot + (hash(o.x + o.y * 3.3) - 0.5) * 0.08 : hash(o.x + o.y * 3.3) * Math.PI * 2
      // districts (skies only): each obstacle's PALETTE follows WHERE it sits (districtAt at its
      // own x,y), not one chapter-wide style — see DISTRICT_BIOMES above. Cached per o._cell (see
      // obstacleSkinCache's doc) so a rebuild only pays the district hash chain once per obstacle
      // for its whole lifetime, not once per rebuild.
      let skin = obstacleSkinCache.get(o._cell)
      if (!skin) {
        const structDistrict = chapterHasDistricts ? districtAt(o.x, o.y, districtSeed) : null
        const obStyle = chapterHasDistricts ? DISTRICT_BIOMES[structDistrict].obstacle : style
        const floorAt = floorTintAt(o.x, o.y)
        skin = { tint: tintMul(obStyle.tint, floorAt), foot: tintMul(obStyle.foot, floorAt), district: structDistrict, planet: obStyle.planet === true }
        if (skin.planet) {
          // Which of the seven archetypes, and which hue nudge. Hashed off o.x/o.y — the same idiom
          // the baked-furniture `pick` below uses — because sim's streamObstacles guarantees x/y/r
          // regenerate identically for a cell (test/sim-test.js run V.g walks 20000px away and back
          // and asserts exactly that), so a planet keeps its identity when it re-enters view.
          // NOT hashed off o.kind: STRUCTURE_KINDS is pinned at 6 entries by run DD.d, so a future
          // kind edit would silently reshuffle the planet mix, and pier -> ice world means nothing.
          skin.planetVariant = Math.floor(hash(o.x * 1.7 + o.y * 0.31 + 23.7) * T.planetMaps.length)
          skin.planetTint = T.planetTints[Math.floor(hash(o.x * 1.7 + o.y * 0.31 + 41.1) * T.planetTints.length)]
          skin.planetRot = hash(o.x * 1.7 + o.y * 0.31 + 57.3) * Math.PI * 2
          // Signed, and slow: PLANET_SPIN_MAX is ~1 revolution every 35s at the fastest, which is
          // motion you notice only if you stop and look — the intent is life, not a spinning top.
          skin.planetSpinRate = (hash(o.x * 1.7 + o.y * 0.31 + 71.9) - 0.5) * 2 * PLANET_SPIN_MAX
          // v5.23: THE AXIS. A random unit vector, so no two worlds tumble alike — this is the thing
          // a 2D `sprite.rotation` could never express, because that only ever spins about +z.
          // z is squashed to +-0.6: an axis pointing straight at the camera turns the sphere into a
          // flat pinwheel, which is exactly the look the shader exists to get away from.
          const ax = hash(o.x * 1.7 + o.y * 0.31 + 88.3) * 2 - 1
          const ay = hash(o.x * 1.7 + o.y * 0.31 + 95.1) * 2 - 1
          const az = (hash(o.x * 1.7 + o.y * 0.31 + 103.7) - 0.5) * 1.2
          const am = Math.hypot(ax, ay, az) || 1
          skin.planetAxis = [ax / am, ay / am, az / am]
        }
        obstacleSkinCache.set(o._cell, skin)
      }
      // structure SHAPE (v5.8, kinds grown by v5.9): o.kind (config.js STRUCTURE_KINDS —
      // tower/house/tree/pier/barn/silo) picks the silhouette via STRUCTURE_SKINS, independent of
      // the district palette above — see that table's doc comment. Non-skies chapters have no
      // kind-driven table entry to find (chapterHasDistricts is false there), so they fall through
      // to the one chapter-wide `style` exactly as before this redesign — untouched.
      // v5.9.2 override ("the fuck is this?" bug report): parks and hills BOTH roll kind='tree'
      // (config.js DISTRICT_STRUCTURE_KINDS — a real 7th kind would need test/sim-test.js's run
      // DD.d, which pins STRUCTURE_KINDS at exactly 6, updated by whoever owns test/), so the two
      // districts rendered IDENTICALLY: the same foliage-clump silhouette, just re-tinted. Rather
      // than grow the data model, hills' 'tree' obstacles render with the rock skin instead — reusing
      // `skin.district` (cached above, so this costs nothing extra) to catch exactly that one
      // combination. Every other kind/district combination is untouched.
      const shape = chapterHasDistricts
        ? (o.kind === 'tree' && skin.district === 'hills' ? STRUCTURE_SKINS.rock : (STRUCTURE_SKINS[o.kind] || style))
        : style
      // footprint ring: the hard contract. Scaled so its rim lands EXACTLY on the collider edge o.r.
      ov.ring.texture = foot.tex
      // v5.10: under a top-down plan the footprint pad becomes a CONTACT SHADOW in the region's one
      // ink tone, not the district's high-contrast ring colour. A pale ring under a pier over dark
      // water read as a coin the jetty was standing on, which is the opposite of "this is a place".
      ov.ring.tint = (chapterHasDistricts && STRUCTURE_SKINS[o.kind]?.topDown) ? 0x121722 : skin.foot
      // v5.10: for a skies top-down PLAN the ring drops to a contact shadow. At full alpha it is a
      // hard dark disc under every building, which from overhead reads as a coin the structure is
      // standing on — and it is not telling the player anything here anyway, since in this chapter
      // EVERY structure is crushable. The rim still lands exactly on o.r; only its weight changes.
      ov.ring.alpha = (chapterHasDistricts && STRUCTURE_SKINS[o.kind]?.topDown) ? 0.45 : 1
      ov.ring.scale.set(o.r / foot.ref)
      if (shape.baked) {
        // baked furniture: pick two pieces off the kind's list by position hash, plant the big
        // one on the pad and tuck a smaller second at the rim. Baked props carry their own origin
        // (upright ones sit on their base), so the anchor comes from the look, not a fixed 0.5.
        const pick = (salt) => shape.baked[Math.floor(hash(o.x * 1.7 + o.y * 0.31 + salt) * shape.baked.length)]
        const a = T[pick(0)]
        const b = T[pick(11.3)]
        // v5.9.2 ("the fuck is this?" bug report): sized from o.r again, for EVERY chapter — no more
        // chapterHasDistricts branch here. The v5.9 top-down region overhaul had this reading an
        // ABSOLUTE px band off PROP_SCALE[o.kind] instead, independent of o.r; since o.r and `kind`
        // were independent hash rolls (sim.js streamObstacles), a max-radius house could render
        // bigger than a min-radius tower — visible structures overlapping while their colliders sat
        // far apart, exactly the reported wall of blobs. The real fix is upstream: sim.js now rolls
        // o.r itself from a per-kind band (config.js STRUCTURE_RADIUS), so drawing proportional to
        // o.r here is enough to make a tower's silhouette genuinely bigger than a house's — no
        // second, independent sizing system needed on the render side at all.
        if (shape.topDown) {
          // v5.10 (spec §5.1.3): a top-down PLAN is MASS-CENTRED, not base-anchored, and carries
          // its own lot/yard detail plus its own cast shadow — so clumpB (the "second piece tucked
          // at the rim" that made a heap out of two side-view props) is suppressed outright.
          // Sized so the plan's CONTENT half-extent (SKR, the bake's own content radius) lands just
          // past the collider rim: the T.obFoot ring, not the silhouette, is still the contract.
          ov.clumpA.texture = a.tex; ov.clumpA.anchor.set(a.ax, a.ay)
          ov.clumpA.tint = 0xffffff  // plans carry their OWN palette — see STRUCTURE_SKINS' comment
          ov.clumpA.scale.set((o.r * SKIES_PLAN_SCALE) / (SKR * 2))
          ov.clumpA.rotation = 0
          ov.clumpA.position.set(0, 0)
          // v5.12 BUGFIX: `rot` (computed above from o.rot, which sim.js stamps with the owning
          // city's street angle in blockSnap) was being thrown away here, so EVERY structure in the
          // chapter drew as a perfect world-axis rectangle — a diamond block full of rectangles that
          // ignore it. Rotating the ROOT, not clumpA: the tower's aviation lamp is a SIBLING of
          // clumpA positioned in unrotated plan coordinates, so turning clumpA alone would slide the
          // beacon off its mast. The footprint ring is a disc, so rotating root is a no-op for it.
          ov.root.rotation = rot
          ov.clumpB.texture = Texture.EMPTY
          ov.clumpB.scale.set(1)
          continue
        }
        ov.root.rotation = 0   // pooled sprite may have come from a rotated top-down plan
        // v5.18 PLANET (beyond): one centred body, scaled 1:1 to its collider, and NO clumpB. The
        // generic path below is written for base-planted SIDE-VIEW props — it plants the art at
        // o.r * 0.28 (so a tree sits on its pad) and stamps a second smaller copy at the rim (so a
        // rock reads as a heap). Applied to a 260px planet that produced a body offset ~93px below
        // its own centre with a second planet growing out of its edge. A sphere is neither planted
        // nor heaped: it is centred, and it is one object.
        if (skin.planet) {
          // v5.23: THREE layers, in draw order — clumpA is whatever sits BEHIND the sphere (only the
          // ringed world's far annulus), the Mesh is the sphere itself, clumpB is the atmosphere
          // halo plus anything crossing in FRONT. The mesh is inserted at index 2 so it lands
          // between them; created lazily, so pool slots that never hold a planet never pay for a
          // shader. o.r stays cosmetic in this chapter (stepObstacles early-returns on `lane`, no
          // `crush`, no `blink` in the roster) — a chapter reusing `planet: true` with real colliders
          // would need this branch reworked, not just a new archetype.
          if (!ov.mesh) { ov.mesh = makePlanetMesh(); ov.root.addChildAt(ov.mesh, 2) }
          const v = skin.planetVariant
          const behind = T.planetBehind[v], front = T.planetFront[v]
          const res = ov.mesh.shader.resources
          res.uMap = T.planetMaps[v].source
          res.uEmit = T.planetEmits[v].source
          const u = res.uniforms.uniforms
          u.uAtmo.set(T.planetAtmo[v])
          u.uTint.set([(skin.planetTint >> 16 & 255) / 255, (skin.planetTint >> 8 & 255) / 255, (skin.planetTint & 255) / 255])
          ov.mesh.visible = true
          // The quad spans [-1,1], so scaling it by the body radius makes the sphere exactly as wide
          // as the old disc bake was — the ringed world still shrinks to 0.58 to leave room.
          ov.mesh.scale.set(o.r * T.planetBodyR[v])
          // Registered for the per-frame pass below. The matrix CANNOT be advanced here:
          // syncObstacles early-returns unless the obstacle list streams (see its guard), so anything
          // written in this loop is written once when the planet materialises and then never again —
          // which is exactly why the first cut of the v5.21 spin did not rotate in real time.
          planetSpinners.push({ u, g: res.uniforms, axis: skin.planetAxis, phase: skin.planetRot, rate: skin.planetSpinRate })
          ov.clumpA.texture = behind || Texture.EMPTY
          ov.clumpA.anchor.set(0.5)
          ov.clumpA.tint = 0xffffff
          ov.clumpA.rotation = 0
          ov.clumpA.position.set(0, 0)
          ov.clumpA.scale.set(behind ? (o.r * 2) / behind.width : 1)
          ov.clumpB.texture = front || Texture.EMPTY
          ov.clumpB.anchor.set(0.5)
          ov.clumpB.tint = 0xffffff
          ov.clumpB.rotation = 0          // the sun does not orbit the planet
          ov.clumpB.position.set(0, 0)
          ov.clumpB.scale.set(front ? (o.r * 2) / front.width : 1)
          ov.ring.alpha = 0   // no collision contract to draw — see BIOMES.beyond.obstacle
          continue
        }
        const scA = (o.r * 1.9) / Math.max(a.tex.width, a.tex.height)
        const scB = (o.r * 1.15) / Math.max(b.tex.width, b.tex.height)
        ov.clumpA.texture = a.tex; ov.clumpA.anchor.set(a.ax, a.ay); ov.clumpA.tint = skin.tint
        ov.clumpA.scale.set(scA); ov.clumpA.rotation = 0
        ov.clumpA.position.set(0, o.r * 0.28) // base planted just past centre, sitting on the pad
        ov.clumpB.texture = b.tex; ov.clumpB.anchor.set(b.ax, b.ay); ov.clumpB.tint = skin.tint
        ov.clumpB.scale.set(scB); ov.clumpB.rotation = (hash(o.x * 2.9 + o.y) - 0.5) * 0.5
        ov.clumpB.position.set((hash(o.x + o.y * 5.1) - 0.5) * o.r * 0.85, o.r * 0.44) // tucked at the rim
      } else {
        // foliage mound: two stacked cluster sprites lifted into a crown, denser and darker than
        // the single floor bush. The ring, not the foliage overhang, marks the true edge. Sized from
        // o.r again, for every chapter (see the baked branch's comment above for the full story of
        // why the PROP_SCALE.tree-based branch this replaced was the bug, not a deliberate split).
        const tex = T.props[shape.clumps[Math.floor(hash(o.x * 1.7 + o.y * 0.31) * shape.clumps.length)]]
        const sc = (o.r * 2.0) / 1024 // source props are 1024px; on-screen width ≈ collider diameter
        ov.clumpA.texture = tex; ov.clumpA.anchor.set(0.5); ov.clumpA.tint = skin.tint
        ov.clumpA.scale.set(sc); ov.clumpA.rotation = rot; ov.clumpA.position.set(0, -o.r * 0.10)
        ov.clumpB.texture = tex; ov.clumpB.anchor.set(0.5); ov.clumpB.tint = skin.tint
        ov.clumpB.scale.set(sc * 0.82); ov.clumpB.rotation = rot + 0.6; ov.clumpB.position.set(0, -o.r * 0.34)
      }
    }
    // Evict cells that dropped out of the streamed field (crushed, or walked past
    // OBSTACLE_DROP_RADIUS) so the cache tracks the live field's size instead of growing for
    // the whole run — see obstacleSkinCache's doc above.
    if (obstacleSkinCache.size > liveCells.size) {
      for (const key of obstacleSkinCache.keys()) if (!liveCells.has(key)) obstacleSkinCache.delete(key)
    }
  }
  function clearObstacles() {
    obstacleToken = null
    obstacleRev = -1
    obstacleSkinCache.clear()
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
  // v5.21 lane: an asteroid. Reuses T.asteroid — the same rock already scattered as this chapter's
  // baked obstacle furniture, which is the point: the hazard IS the local debris, not a new species.
  // Tumble comes from rk.rot (sim-owned, so it survives a pause and matches across a re-render).
  const rockPool = []
  function placeRock(s, rk) {
    if (s.texture !== T.asteroid.tex) { s.texture = T.asteroid.tex; s.anchor.set(T.asteroid.ax, T.asteroid.ay) }
    s.position.set(rk.x, rk.y)
    s.rotation = rk.rot
    s.scale.set((rk.r * 2) / Math.max(T.asteroid.tex.width, T.asteroid.tex.height))
    // Warm stone, deliberately OFF the chapter's lilac. The ambient debris drifting past is
    // 0xcfc8e0-ish, and a hazard that shares a palette with scenery is a hazard nobody dodges.
    s.tint = 0xc9a887
    s.alpha = 1
  }

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

  // ---- 6. JET STRAFE (spec §3, jet row) --------------------------------------------------------
  // sim fires a one-off {type:'strafeLock', x, y, angle, len} the instant a jet's heading locks
  // (stepStrafe), then the jet HOLDS for STRAFE_TELEGRAPH_T before flying the pass at
  // STRAFE_RUN_SPEED_MUL. render remembers x/y/angle/len in its own small pool rather than
  // re-deriving `len` from live enemy fields (that math is sim's, spdMul/enrage and all).
  //
  // v5.10 — KILL LIST §8.1 AND §8.2, the literal bug in the user's report. This drew in
  // LIGHTNING.telegraph, i.e. the SAME electric blue as the bomb telegraph ("the dash telegraph for
  // planes is the same colour as everything"), using lineCharge's filled band-and-chevrons lane,
  // i.e. the same SHAPE as the city chapter's robot vacuum. Both are gone. The jet is now:
  //   colour — halogen white + tracer ORANGE, which appears nowhere else in any chapter;
  //   shape  — two HAIRLINE RAILS at the exact contact half-width and NO FILL AT ALL, plus a long
  //            narrow additive light ellipse riding between them. Zero brackets, zero chevrons,
  //            zero circles;
  //   motion — the only threat whose DAMAGE POINT TRANSLATES ACROSS THE SCREEN.
  // ARRIVAL CLOCK: the halogen pool races down the lane and arrives at the jet on the frame the run
  // begins. The damage itself is then a STITCH — paired orange dashes walking the lane at the run
  // speed, each popping a grit puff and a scorch tick.
  // v5.13: 10 -> 4. This was sized as PERFORMANCE headroom and turned out to be the chapter's worst
  // source of visual clutter. Every live lock draws two 820px hairline rails THROUGH the player's
  // area (a jet locks from STRAFE_STANDOFF and flies at you), so ten locks is twenty full-screen
  // lines meeting at one point — the starburst in the report. It is a BUDGET now, not headroom:
  // spawnStrafeLock's cursor wraps, so the four most recent locks are the four drawn, which are the
  // four about to matter. A jet whose lane is not drawn still flies and still hurts — but you can
  // see the jet, and four readable lanes beat ten unreadable ones.
  const MAX_STRAFE_LOCKS = 4
  const strafeLocks = []
  const strafePools = []
  for (let i = 0; i < MAX_STRAFE_LOCKS; i++) {
    strafeLocks.push({ live: false, x: 0, y: 0, angle: 0, len: 0, t: 0, stitch: 0 })
    const s = new Sprite(Texture.EMPTY); s.anchor.set(0.5); s.visible = false
    strafePoolLayer.addChild(s); strafePools.push(s)
  }
  let strafeLockCursor = 0
  function spawnStrafeLock(x, y, angle, len) {
    const sp = strafeLocks[strafeLockCursor]
    strafeLockCursor = (strafeLockCursor + 1) % MAX_STRAFE_LOCKS
    sp.live = true; sp.x = x; sp.y = y; sp.angle = angle; sp.len = len; sp.t = 0; sp.stitch = 0
  }
  // Advances every live lock's own clock AND draws it, straight into teleG — called right after
  // redrawTelegraphs (which already cleared+filled teleG this frame, see sync()), so this only ever
  // ADDS to it, never re-clears. dt=0 (paused/frozen behind a modal) holds it exactly where it was.
  function updateStrafeLocks(dt) {
    // (SKIES_FX.strafe.laneLen is the DERIVED length of a nominal pass; the drawer uses sp.len,
    // the length sim actually committed to for THIS jet — spdMul and enrage folded in. The config
    // value stays as the documented reference the lane was designed against.)
    const F = SKIES_FX.strafe
    const total = F.telegraphT + F.runT
    for (let i = 0; i < strafeLocks.length; i++) {
      const sp = strafeLocks[i]
      const poolS = strafePools[i]
      if (!sp.live) { poolS.visible = false; continue }
      if (dt > 0) sp.t += dt
      if (sp.t >= total) { sp.live = false; poolS.visible = false; continue }
      const cos = Math.cos(sp.angle), sin = Math.sin(sp.angle)
      const nx = -sin * F.halfW, ny = cos * F.halfW
      const telegraphing = sp.t < F.telegraphT
      const k = telegraphing ? sp.t / F.telegraphT : (sp.t - F.telegraphT) / F.runT
      const far = farFromPlayer(sp.x, sp.y)
      // the two HAIRLINE RAILS, at the true contact corridor (PLAYER.radius + the jet's own radius,
      // which is what stepContactDamage actually tests) — what you see is exactly what hits you
      if (!far) {
        for (const s of [-1, 1]) {
          if (jamDrop()) continue
          inkStroke(teleG, () => {
            teleG.moveTo(sp.x + nx * s, sp.y + ny * s)
            teleG.lineTo(sp.x + cos * sp.len + nx * s, sp.y + sin * sp.len + ny * s)
          }, F.railW, F.railColor, jamAlpha(F.railAlpha * (telegraphing ? 0.5 + 0.5 * k : 1)))
        }
      }
      if (telegraphing) {
        // ARRIVAL CLOCK: the halogen landing-light pool races from the far end of the lane back to
        // the jet, arriving on the frame the run begins. Additive — a light on wet asphalt.
        const d = sp.len * (1 - k)
        poolS.visible = true
        if (poolS.texture !== T.landingPool) poolS.texture = T.landingPool
        poolS.tint = F.poolColor
        poolS.alpha = lerp(F.poolAlphaMin, F.poolAlphaMax, k)
        poolS.rotation = sp.angle
        // v5.10.1: this used to hardcode the height as `F.halfW * 2` — unrelated to `F.poolAspect`
        // (the config value the spec's "long : narrow, 1 : 0.22" jet-row language actually names) and
        // fatter than the baked texture's own aspect (112/512 = 0.22): the pool rendered at ~1:0.37, a
        // dead config key contradicted by the number actually drawn. Deriving height from poolAspect
        // keeps the drawn shape, the baked texture and the documented value all in agreement.
        const poolLen = F.halfW * 5.4
        poolS.scale.set(poolLen / T.landingPool.width, (poolLen * F.poolAspect) / T.landingPool.height)
        poolS.position.set(sp.x + cos * d, sp.y + sin * d)
        // the jet's own nav lights, port red / starboard green — two 2px dots, the smallest
        // possible "that is an aircraft" cue and the only red allowed near a telegraph
        teleG.circle(sp.x + nx * 0.55, sp.y + ny * 0.55, 2).fill({ color: F.navRed, alpha: jamAlpha(0.85) })
        teleG.circle(sp.x - nx * 0.55, sp.y - ny * 0.55, 2).fill({ color: F.navGreen, alpha: jamAlpha(0.85) })
      } else {
        // THE STITCH: paired orange tracer dashes walking the lane at the run speed. This is the
        // damage, travelling — the one thing no other threat in the chapter does.
        // v5.13, two declutter fixes:
        //  1. It was ungated by `far`, unlike the rails above — so a jet strafing off at the edge of
        //     the world still laid a full-length orange dashed line across the view.
        //  2. It drew EVERY dash from the lane's origin to the head, so by the end of a 1.0s run it
        //     was an 820px streak that had stopped travelling and just sat there. Drawing only the
        //     dashes within `stitchTailPx` behind the head is what the design note above actually
        //     describes — damage in motion, with a tail, not a completed stripe.
        poolS.visible = false
        if (!far) {
          const head = sp.len * k
          const tail = Math.max(head % F.dashPitch, head - F.stitchTailPx)
          for (let d = tail; d < head; d += F.dashPitch) {
            const bx = sp.x + cos * d, by = sp.y + sin * d
            for (const s of [-1, 1]) {
              teleG.moveTo(bx + nx * s * 0.6 - cos * F.dashLen * 0.5, by + ny * s * 0.6 - sin * F.dashLen * 0.5)
              teleG.lineTo(bx + nx * s * 0.6 + cos * F.dashLen * 0.5, by + ny * s * 0.6 + sin * F.dashLen * 0.5)
            }
          }
          teleG.stroke({ width: F.dashW + 2.5, color: SKIES_INK.color, alpha: SKIES_INK.alpha })
          for (let d = tail; d < head; d += F.dashPitch) {
            const bx = sp.x + cos * d, by = sp.y + sin * d
            for (const s of [-1, 1]) {
              teleG.moveTo(bx + nx * s * 0.6 - cos * F.dashLen * 0.5, by + ny * s * 0.6 - sin * F.dashLen * 0.5)
              teleG.lineTo(bx + nx * s * 0.6 + cos * F.dashLen * 0.5, by + ny * s * 0.6 + sin * F.dashLen * 0.5)
            }
          }
          teleG.stroke({ width: F.dashW, color: F.tracer, alpha: 0.95, cap: 'butt' })
          teleG.circle(sp.x + cos * head, sp.y + sin * head, 3).fill({ color: F.tracerCore, alpha: 0.9 })
        }
        // each newly-walked dash pops a grit puff and a scorch tick where it struck
        if (dt > 0 && !far) {
          sp.stitch += (sp.len / F.runT) * dt
          while (sp.stitch >= F.dashPitch) {
            sp.stitch -= F.dashPitch
            const d = sp.len * k
            const px2 = sp.x + cos * d, py2 = sp.y + sin * d
            spawnParticle(T.gritPuff, px2, py2, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60,
              0.3, F.gritPx / 32, F.gritColor, 0.4, 3)
            spawnParticle(T.scorchTick.tex, px2, py2, 0, 0, 0.55, F.scorchPx / 6, 0x1a1712, 0, 0)
          }
        }
      }
    }
  }
  function clearStrafeLocks() {
    for (const sp of strafeLocks) sp.live = false
    for (const s of strafePools) s.visible = false
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
  // v5.11 kaiju redesign: 0->1 pulse set by the `tail` sim event (WEAPONS.tailSwipe/stepTailWeapon),
  // decaying over SKIES_KAIJU.swipeDecay seconds — see syncPlayer's kaiju tail branch. The event
  // already drives spawnWhip's arc-swoosh at the hit site (handleEvents); this makes the anatomical
  // tail itself visibly crack at the same moment, instead of only an effect appearing where it
  // lands. Harmless outside skies: tailSwipe isn't in any other chapter's weapon pool, so the `tail`
  // event never fires there and this timer just sits at 0, unread (chapterHasKaiju gates its use).
  let kaijuSwipeT = 0
  let vignetteA = 0
  let lightningFlashA = 0 // full-field white flash alpha (skies lightning, LIGHTNING.flash), decays in sync()
  let prevSkiesBombs = new Set() // last frame's run.bombs objects (skies only) — see handleEvents
  let prevSkiesShots = new Set() // ditto for run.enemyShots — tells a missile that IMPACTED from one
                                 // that merely fizzled, without a sim change (spec §1.1's problem,
                                 // solved render-side by object-identity diffing)
  let flashCooldown = 0          // s left in the full-field flash budget (spec §1.3)
  let jamT = 0                   // rampage telegraph-jamming strength, 1 while rampaging then
                                 // decaying over SKIES_JAM.recoverT so the picture RE-ACQUIRES
  let jamSnapT = 0               // lock-diamond re-snap cadence
  let rampBeatT = 0              // heartbeat-ring accumulator
  // v5.8 kaiju redesign: last frame's run.rampageT, render-local memory only — NEVER written back
  // to run (render must not mutate it). RAMPAGE's trigger is a LEVEL (rampageT jumps 0 ->
  // RAMPAGE_DURATION in one frame, sim.js stepRampage), not an event, so it's detected the same way
  // justStruck above diffs bomb identity: compare this frame's value against last frame's copy —
  // see handleEvents. Stays 0 forever for any chapter without `crush` (state.js: rampageT never
  // moves off 0 there), so this is inert everywhere but skies.
  let prevRampageT = 0
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

  // Crush collapse (skies only — sim.js's stepCrush, {type:'crush',x,y,kind}). v5.10 replaced this
  // outright: see skiesCrush above for the shard/dust/ruin treatment and kill list §8.4 for what it
  // reused (T.fx.circle_05 + T.fx.scorch_01 + T.dot — the same two Kenney textures explosionBurst
  // uses, just tinted grey, plus the same soft dot as kill-poofs and pickup sparkles). The "fleeing
  // figures" dots are gone too (spec §11: the lights-going-out beat carries the same implication
  // better and abstractly).

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
  // by skies' lightning bolts (strikeLightning below) — same jagged glow-
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

  // v5.10: the single strikeLightning() drawer that served BOTH the tank shell and the sky strike
  // is gone — that shared drawer is kill-list §8.3 in its purest form. See artilleryDetonation and
  // skyDetonation, which share nothing but the screen shake.

  // v5.10 (spec §1.3): the photosensitivity budget is CENTRAL, not per-effect —
  // LIGHTNING.flash.strikeAlpha is 0.55 and a late-run barrage lands several strikes a second. A
  // flash inside the cooldown window is ADMITTED at a fraction of its requested alpha rather than
  // dropped (a strike you cannot see is worse than a dim one). The paired rule lives in syncPlayer:
  // the rampage screen bloom is forced to 0 on any frame where the flash is up, so the two never
  // co-render. flashCooldown is drained in sync().
  function triggerLightningFlash(alpha) {
    if (flashCooldown > 0) { lightningFlashA = Math.max(lightningFlashA, alpha * SKIES_FLASH.suppressedMul); return }
    lightningFlashA = Math.max(lightningFlashA, alpha)
    flashCooldown = SKIES_FLASH.minGap
  }

  // v5.13: updateAmbientLightning is DELETED ("too much animation"). It fired a full-field white
  // flash plus a bolt every 6-14s that meant nothing, damaged nothing and could not be acted on —
  // and v5.10.1 had already had to give it a THIRD hue purely so players would stop reading it as
  // an incoming strike. An effect that has to be redesigned to be ignorable is an effect that
  // should not be drawn. The real strike bolt (strikeLightning, still live) keeps every bit of
  // this idiom; the sky is not quieter when something is actually falling on you.

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
    let justFizzled = null
    if (chapterHasStorm) {
      const curBombs = new Set(run.bombs)
      justStruck = []
      for (const b of prevSkiesBombs) if (!curBombs.has(b)) justStruck.push(b)
      prevSkiesBombs = curBombs
      // same trick for run.enemyShots: a missile that IMPACTED emits an explode event this frame
      // and is gone from the array, which is how the magenta impact drawer knows it is a missile
      // and not a weapon nova that happened to land on the same pixel
      const curShots = new Set(run.enemyShots || [])
      justFizzled = []
      for (const sh of prevSkiesShots) if (!curShots.has(sh)) justFizzled.push(sh)
      prevSkiesShots = curShots
    } else if (prevSkiesBombs.size || prevSkiesShots.size) {
      prevSkiesBombs = new Set() // left skies mid-flight (e.g. a run ended) — drop stale refs
      prevSkiesShots = new Set()
    }

    // v5.8 kaiju redesign: RAMPAGE activating is a level, not an event (sim.js stepRampage jumps
    // run.rampageT from 0 straight to RAMPAGE_DURATION the frame the meter fills) — catch the 0 ->
    // active transition here the same way justStruck above catches a bomb detonating, then hand the
    // sustained glow to syncPlayer (it reads run.rampageT itself every frame; this only needs the
    // ONE-TIME entry pulse). prevRampageT is render-local memory, never written back to run.
    if (run.rampageT > 0 && prevRampageT <= 0) addShake(5, 0.3) // the widened crush radius just landed
    prevRampageT = run.rampageT

    for (const e of events) {
      switch (e.type) {
        case 'hit':
          spawnDamage(e.x, e.y, e.dmg, e.crit, e.dot)
          break
        case 'kill':
          killPoof(e.x, e.y, e.etype, e.elite)
          break
        case 'crush': {
          // v5.10: e.kind IS read now — it is the point. Brick does not fall like grain and neither
          // falls like a pier into water (SKIES_FX.crush.byKind), and the site keeps a kind-specific
          // baked RUIN afterwards: the only thing in the chapter that records what you did.
          const cr = radiusAtCrush(e.x, e.y)
          skiesCrush(e.x, e.y, e.kind)
          ledgerAdd(e.x, e.y, e.kind, cr)
          break
        }
        case 'hurt':
          addShake(6, 0.25)
          vignetteA = 0.6
          flashT = 0.28
          break
        case 'levelup':
          levelupBurst(run.player.x, run.player.y)
          break
        // v5.21 lane: the Repulsion shove. Two concentric rings expanding to the REAL sim radius
        // (e.r, pushed by stepRepulse) rather than a fixed size — the player has to be able to learn
        // where the edge is, and a burst that lies about its reach makes the cooldown feel arbitrary.
        case 'repulse':
          spawnRing(e.x, e.y, e.r, 0.42, T.novaWarm, 0xbca8ff)
          spawnRing(e.x, e.y, e.r * 0.62, 0.28, T.novaWarm, 0xe8dcff)
          break
        case 'rockhit':
          spawnRing(e.x, e.y, 70, 0.26, T.novaWarm, 0xc9bda4)
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
          kaijuSwipeT = SKIES_KAIJU.swipeKick   // the anatomical tail itself cracks (syncPlayer)
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
        case 'strafeLock':
          // Jet strafe wind-up (v5.9.1, see updateStrafeLocks above) — a WARNING, not an impact, so
          // no screen shake here (nothing has hit anything yet; the shake for the actual pass is
          // just the jet's own contact damage, same as any other enemy).
          spawnStrafeLock(e.x, e.y, e.angle, e.len)
          break
        case 'explode': {
          // v5.10.1: THREE separate detonation drawers in skies, not one re-tinted burst. Which one
          // is decided by object identity, not by guessing from timing: justStruck holds the
          // run.bombs entries that vanished this frame (with `src` still on them, set explicitly by
          // sim.js — see bombSrc), and justFizzled holds the run.enemyShots that vanished. Volatile
          // used to fall through the `else` here straight into skyDetonation (a dead elite reading as
          // a lightning strike) — now it gets its own branch and its own drawer.
          const struckIdx = justStruck
            ? justStruck.findIndex((b) => b.x === e.x && b.y === e.y && b.radius === e.radius)
            : -1
          if (struckIdx >= 0) {
            const b = justStruck[struckIdx]
            justStruck.splice(struckIdx, 1)
            const bsrc = bombSrc(b)
            if (bsrc === 'gun') artilleryDetonation(e.x, e.y, e.radius)
            else if (bsrc === 'volatile') volatileDetonation(e.x, e.y, e.radius)
            else skyDetonation(e.x, e.y, e.radius)
            break                                   // all three drawers set their own shake
          }
          const fizzIdx = justFizzled
            ? justFizzled.findIndex((sh) => Math.abs(sh.x - e.x) < 1.5 && Math.abs(sh.y - e.y) < 1.5)
            : -1
          if (fizzIdx >= 0) {
            justFizzled.splice(fizzIdx, 1)
            missileImpact(e.x, e.y)                  // magenta star + black soot ring, NOT
            break                                    // explosionBurst's orange spark_04 (§8.5)
          }
          explosionBurst(e.x, e.y, e.radius)
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
    clearStrafeLocks()
    clearCurrents()
    clearStorm()
    clearSkiesBombs()
    clearScars()
    clearRampage()
    clearSmoke()
    crushLedger.clear()
    for (const s of ruinSprites) s.visible = false
    for (const s of junctionSprites) s.visible = false
    prevSkiesShots = new Set()
    flashCooldown = 0
    jamSnapT = 0
    clearParticles()
    clearRings()
    clearArcs()
    clearDamage()
    clearFloorLayer()
    // the colour field is keyed to the run's world seed, so it has to go too
    clearGroundField()
    shake.t = 0
    shake.amp = 0
    shake.ox = 0
    shake.oy = 0
    flashT = 0
    vignetteA = 0
    vignette.alpha = 0
    lightningFlashA = 0
    lightningFlash.alpha = 0
    prevSkiesBombs = new Set()
    prevRampageT = 0
    animT = 0
    hop = 0
    breathe = 0
  }

  // -------------------------------------------------------------------- sync
  function syncPlayer(p, dt, rampageT = 0) {
    playerC.position.set(p.x, p.y)

    // v5.11 kaiju redesign: swap the whole body/flash/shadow onto the dedicated kaiju bake for
    // skies (chapterHasKaiju) and back onto the generic cross-chapter blob for every other chapter —
    // same texture-swap-if-changed idiom pRampageGlow uses below. The anchor travels WITH the
    // texture (bake()'s own {ax,ay}) since the kaiju's silhouette isn't centred the way the round
    // blob is; guard on pBody alone (all three always swap together) to keep this a single check.
    if (chapterHasKaiju) {
      if (pBody.texture !== T.kaijuBody.tex) {
        pBody.texture = T.kaijuBody.tex; pBody.anchor.set(T.kaijuBody.ax, T.kaijuBody.ay)
        pFlash.texture = T.kaijuFlash.tex; pFlash.anchor.set(T.kaijuFlash.ax, T.kaijuFlash.ay)
        pShadow.texture = T.kaijuShadow.tex; pShadow.anchor.set(T.kaijuShadow.ax, T.kaijuShadow.ay)
      }
      // the region's ONE light direction (SKIES_SHADOW), scaled off the shadow's own reference
      // size (SKIES_KAIJU.shadowRx), instead of the generic blob's small straight-down disc (the
      // `else` branch below, unchanged). +20 nudges it toward the tail/hip so it settles under the
      // creature's mass rather than dead-centre.
      const shOff = SKIES_KAIJU.shadowRx * SKIES_KAIJU.bodyScale
      pShadow.position.set(SKIES_SHADOW.dx * shOff, SKIES_SHADOW.dy * shOff + 20 * SKIES_KAIJU.bodyScale)
    } else {
      if (pBody.texture !== T.playerBody.tex) {
        pBody.texture = T.playerBody.tex; pBody.anchor.set(T.playerBody.ax, T.playerBody.ay)
        pFlash.texture = T.playerFlash.tex; pFlash.anchor.set(T.playerFlash.ax, T.playerFlash.ay)
        pShadow.texture = T.playerShadow.tex; pShadow.anchor.set(T.playerShadow.ax, T.playerShadow.ay)
      }
      pShadow.position.set(0, PLAYER.radius * 0.95)
    }

    // per-chapter blob tint (white = identity for body) + optional tail. The kaiju bake carries its
    // OWN final palette (SKIES_KAIJU) rather than a tint-multiplied base — same "plans carry their
    // own palette, tint bypassed" rule the top-down structure bakes use (STRUCTURE_SKINS' topDown
    // entries set clumpA.tint = 0xffffff, above) — otherwise a uniform multiply by playerTint
    // (0x7ad07a) would push the pale cyan sclera toward the same green as the body fill, right when
    // eye contrast matters most.
    pBody.tint = chapterHasKaiju ? 0xffffff : chapterRender.playerTint
    if (chapterRender.tail) {
      pTail.visible = true
      if (chapterHasKaiju) {
        // the articulated kaiju tail (T.kaijuTailSeg): three CHAINED segments, each rooted at the
        // previous one's tip (not all fanned from one point the way the generic flagellum's tailA/
        // tailB share pTail's own origin below) — see T.kaijuTailSeg's own comment.
        const K = SKIES_KAIJU
        if (dt > 0) kaijuSwipeT = Math.max(0, kaijuSwipeT - dt / K.swipeDecay)
        const kick = kaijuSwipeT
        // `ang` (facing + PI, the REAR direction) uses the SAME 0-fallback as bodyC's own rotation
        // above, so the tail's root and the body's actual rear always agree — the root offset
        // rotates with it too (K.tail.rootY away from centre, in the rear direction), instead of a
        // fixed straight-down offset that only matched the body's rear when facing was also "down".
        const ang = (p.facingAngle == null ? 0 : p.facingAngle) + Math.PI // trail behind
        pTail.position.set(Math.cos(ang) * K.tail.rootY, Math.sin(ang) * K.tail.rootY)
        // TAIL SWIPE WHIP: a faster, wider base sway right when the `tail` event fires (kick decays
        // to 0 over K.swipeDecay), so the weapon's own limb visibly cracks, not just spawnWhip's arc.
        pTail.rotation = ang + Math.sin(animT * (9 + kick * 9)) * (0.32 + kick * 0.85)
        if (tailA.texture !== T.kaijuTailSeg.tex) {
          for (const t of [tailA, tailB, tailC]) { t.texture = T.kaijuTailSeg.tex; t.anchor.set(0, 0.5) }
        }
        tailA.visible = tailB.visible = tailC.visible = true
        // T.kaijuTailSeg carries its own final palette (a shade darker than the body — see its own
        // comment), so — like pBody above — the sprite tint is bypassed rather than multiplying
        // chapterRender.tailTint on top of an already-final colour.
        tailA.tint = tailB.tint = tailC.tint = 0xffffff
        const ref = T.kaijuTailSeg.ref
        tailA.scale.set(K.tail.lenA / ref)
        tailA.rotation = 0
        tailA.position.set(0, 0)
        const rotB = Math.sin(animT * 9 + 1.1) * (0.22 + kick * 0.5)
        tailB.scale.set(K.tail.lenB / ref)
        tailB.rotation = rotB
        tailB.position.set(K.tail.lenA, 0)
        const rotC = rotB + Math.sin(animT * 9 + 2.3) * (0.30 + kick * 0.7)
        tailC.scale.set(K.tail.lenC / ref)
        tailC.rotation = rotC
        tailC.position.set(K.tail.lenA + Math.cos(rotB) * K.tail.lenB, Math.sin(rotB) * K.tail.lenB)
      } else {
        // flagellum tail (pond/undergrowth, unchanged): two stacked streak glyphs behind the blob.
        // Restores T.fx.trace_05 explicitly (harmless no-op unless a PRIOR run this session was
        // skies — see the kaiju branch above swapping tailA/B/C onto T.kaijuTailSeg instead).
        pTail.position.set(0, 0)
        const ang = (p.facingAngle == null ? Math.PI * 0.5 : p.facingAngle) + Math.PI // trail behind
        pTail.rotation = ang + Math.sin(animT * 9) * 0.35 // wiggle
        const sc = fxScale(T.fx.trace_05, PLAYER.radius * 1.6)
        if (tailA.texture !== T.fx.trace_05) { tailA.anchor.set(0.04, 0.5); tailB.anchor.set(0.04, 0.5) }
        tailA.texture = T.fx.trace_05
        tailB.texture = T.fx.trace_05
        const tint = chapterRender.tailTint ?? 0x66e0d0
        tailA.tint = tailB.tint = tint
        tailA.scale.set(sc, sc * 0.5)
        tailB.scale.set(sc * 0.9, sc * 0.42)
        tailB.rotation = Math.sin(animT * 9 + 1.2) * 0.25 // secondary flutter on the far segment
        tailC.visible = false // v5.11: the kaiju rig's third chain link only — never shown here
      }
    } else {
      pTail.visible = false
    }

    // v5.8 kaiju redesign: RAMPAGE glow (see pRampageGlow's doc above). Ramped by rampageT /
    // RAMPAGE_DURATION so it's brightest right after triggering (handleEvents' shake pulse lands
    // the same frame) and fades out in step with the buff's own countdown — sim.js's stepRampage
    // drains run.rampage to 0 across that identical window, so the glow and the meter bar (ui.js)
    // hit zero together. A fast pulse on top keeps it reading as "active" rather than a static tint;
    // the storm overlay and lightning flash already own full-field white (see LIGHTNING.flash), so
    // this stays a warm, player-local halo instead of competing for the same visual register.
    if (rampageT > 0) {
      // T.rampageBloom (v5.10.1: was the bare Kenney T.fx.circle_05 — the same particle geyser
      // bubbles, conduct arcs and traffic exhaust all reuse verbatim; the chapter's largest sustained
      // effect gets its own hand-authored bake instead of sharing that literal asset).
      if (pRampageGlow.texture !== T.rampageBloom) pRampageGlow.texture = T.rampageBloom
      const frac = Math.min(1, rampageT / RAMPAGE_DURATION)
      const pulse = 0.75 + 0.25 * Math.sin(animT * 10)
      pRampageGlow.visible = true
      // v5.10 palette law 2: ATOMIC CYAN-GREEN IS THE PLAYER AND IS NEVER A THREAT. The old warm
      // orange sat directly on artillery's fireball; cyan is now yours alone, learned in one run.
      pRampageGlow.tint = SKIES_FX.rampage.bloom
      // spec §1.3's paired rule: the full-field flash and the rampage bloom NEVER co-render
      const suppressed = lightningFlashA > SKIES_FLASH.bloomCutoff
      pRampageGlow.alpha = suppressed ? 0 : 0.55 * frac * pulse
      // v5.11: scaled up again for the kaiju's own bigger silhouette — sized off PLAYER.radius like
      // before, this used to be a halo well outside the OLD ~44px body; against the new one it would
      // read as swallowed inside it instead of surrounding it.
      const glowMul = chapterHasKaiju ? SKIES_KAIJU.bloomScale : 1
      pRampageGlow.scale.set(fxScale(T.rampageBloom, PLAYER.radius * (2.6 + 0.3 * pulse) * glowMul))
    } else {
      pRampageGlow.visible = false
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
    if (chapterHasKaiju) {
      // v5.11: the kaiju body ROTATES to face p.facingAngle instead of just flipping L/R — a
      // directional silhouette (head, jaw, limbs, a tail rooted at the rear) needs an actual
      // facing, unlike the round symmetric blob every other chapter's flip-only rig was built for.
      // drawKaijuBody draws the head pointing local "up" (-y); + PI/2 is the fixed offset that
      // turns "up" into "facingAngle" once rotated (see this block's own tail comment below for the
      // same rotation applied to where the tail ROOTS). No p.facing flip: rotation alone now
      // supplies the facing, and the silhouette is symmetric enough (deliberately) that a flip on
      // top would only double-transform, not add anything a rotation doesn't already give it.
      // v5.11: x SKIES_KAIJU.bodyScale — the one knob that resizes the whole creature (see that
      // field's comment in config.js). It lives on the CONTAINER so body, flash, dorsal plates and
      // the three-segment tail chain all scale together; scaling the sprites individually would
      // leave the tail rooted at an unscaled hip offset.
      bodyC.scale.set(sx * SKIES_KAIJU.bodyScale, sy * SKIES_KAIJU.bodyScale)
      bodyC.rotation = (p.facingAngle == null ? 0 : p.facingAngle) + Math.PI / 2
    } else {
      bodyC.scale.set(p.facing * sx, sy)
      bodyC.rotation = 0   // restores the flip-only rig's implicit "never rotates" if a PRIOR run
                           // this session was skies (chapterHasKaiju's rig rotates bodyC above)
    }
    bodyC.y = by
    // The shadow is a sibling of bodyC, not a child, so it needs the same bodyScale applied by hand
    // — otherwise shrinking the kaiju would leave it standing on its old, much larger shadow.
    const shadowSquash = 1 - 0.12 * Math.abs(Math.sin(hop)) * (p.moving ? 1 : 0)
    pShadow.scale.set(chapterHasKaiju ? shadowSquash * SKIES_KAIJU.bodyScale : shadowSquash)

    // pupil tracking (local +x flips with the body toward facing)
    if (chapterHasKaiju) {
      // bigger head, further-set eyes (drawKaijuBody's sclera circles, radius 13 at ±22,-96) — same
      // tracking motion, just rescaled off the kaiju's own eye geometry instead of PLAYER.radius.
      const eyeR = 13, eyeOffX = 22, eyeOffY = -96
      const pupilScale = (eyeR * 0.5) / (PLAYER.radius * 0.115)
      pupilL.scale.set(pupilScale)
      pupilR.scale.set(pupilScale)
      const lookX = p.moving ? eyeR * 0.5 : Math.sin(animT * 0.9) * eyeR * 0.32
      const lookY = eyeR * 0.15 + Math.sin(animT * 1.3) * eyeR * 0.1
      pupilL.position.set(-eyeOffX + lookX, eyeOffY + lookY)
      pupilR.position.set(eyeOffX + lookX, eyeOffY + lookY)
    } else {
      pupilL.scale.set(1)
      pupilR.scale.set(1)
      const pr = PLAYER.radius
      const lookX = p.moving ? pr * 0.07 : Math.sin(animT * 0.9) * pr * 0.045
      const lookY = pr * 0.02 + Math.sin(animT * 1.3) * pr * 0.015
      pupilL.position.set(-pr * 0.36 + lookX, -pr * 0.16 + lookY)
      pupilR.position.set(pr * 0.36 + lookX, -pr * 0.16 + lookY)
    }

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
  // v5.10 (kill list §8.3): this drew artillery and sky bombardment IDENTICALLY, because run.bombs
  // carried no discriminator — one drawer, one colour, two completely different threats.
  // v5.10.1: they now go through three SEPARATE drawers (drawSkiesBombs above), and the source is
  // an explicit `b.src` stamped by sim at the push site (sim.js:581/1589/1826), NOT inferred from
  // `duration` as the first pass did. That inference is why volatile-elite corpses used to fall
  // through to the red circle below AND detonate as the sky's signature bolt — an elite's death was
  // indistinguishable from a lightning strike, in the one chapter built around telling the sky apart
  // from the guns. Only bombs with no `src` at all — i.e. every OTHER chapter's — reach the red
  // circle now; in skies, all three sources are claimed by drawSkiesBombs.
  function redrawBombs(run) {
    bombG.clear()
    for (const b of run.bombs || []) {
      if (bombSrc(b) !== null) continue
      const urgency = b.duration > 0 ? 1 - b.fuse / b.duration : 1
      const pulse = 0.5 + 0.5 * Math.sin(animT * (5 + urgency * 16))
      const fillA = Math.min(0.32, 0.12 + urgency * 0.14 + pulse * 0.04)
      const rimA = Math.min(1, 0.55 + urgency * 0.35 + pulse * 0.1)
      bombG.circle(b.x, b.y, b.radius).fill({ color: 0xff6b81, alpha: fillA })
      bombG.circle(b.x, b.y, b.radius).stroke({ width: 3 + urgency * 2, color: 0xff6b81, alpha: rimA })
    }
    if (chapterHasStorm) drawSkiesBombs(run)
    else clearSkiesBombs()
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
      // v5.8 kaiju redesign: chapterRender.enemyDrawScale (skies only, default 1 everywhere else)
      // shrinks the DRAWN size on top of the ordinary radius ratio — jets/helis/tanks read as
      // specks under a kaiju without a single hit test moving. This is the only thing `k` feeds
      // (body scale below + the shadow/crown scale handed to syncEnemyDecor) — e.radius itself,
      // and every hit test that reads it, is untouched. Do NOT thread this into anything that
      // isn't a pure draw dimension (see config.js's enemyDrawScale doc for why rev.1's sim-side
      // `enemyScale` knob was cut).
      const k = (e.radius / look.baseR) * (chapterRender.enemyDrawScale ?? 1)
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
    // cx/cy are the camera offset in WORLD px (screen = (world + c) * mapZoom), which is what every
    // culling test below assumes. At mapZoom 1 this is exactly the old expression.
    const cx = viewW() / 2 - run.player.x + shake.ox
    // v5.18 THE LANE SITS THE PLAYER AT THE BOTTOM (beyond). Every other chapter centres the camera,
    // which is right when threats come from all sides. Here they come from ONE side, so a centred
    // camera spends the bottom half of the screen on space you have already flown through and gives
    // you only half a screen of warning about the thing you are actually fighting. Space Invaders
    // puts you at the bottom and fills everything above you with descending aliens — that framing IS
    // the genre, not decoration. LANE_CAMERA_FRAC of the viewport is therefore ahead of you.
    const cy = (chapterHasLane ? viewH() * LANE_CAMERA_FRAC : viewH() / 2) - run.player.y + shake.oy
    world.scale.set(mapZoom)
    world.position.set(cx * mapZoom, cy * mapZoom)
    updateGroundField(cx, cy)
    updateFloorLayer(cx, cy)
    // v5.10 skies ground enumeration (spec §4.3): junctions and crush ruins are placed
    // ANALYTICALLY from the road grid + the render-local crush ledger, not by an extra
    // FLOOR_LAYERS sweep. (v5.16: updateLamps went with the light layer.)
    updateJunctions(cx, cy)
    updateRuins(cx, cy)

    // red vignette flash — keeps fading behind frozen modals/summary (dt=0)
    vignetteA = Math.max(0, vignetteA - (dt > 0 ? dt : 1 / 60) * 2.6)
    vignette.alpha = vignetteA

    // full-field lightning flash (skies) — same "keeps fading at dt=0" treatment as the vignette
    lightningFlashA = Math.max(0, lightningFlashA - (dt > 0 ? dt : 1 / 60) / LIGHTNING.flash.fadeDur)
    lightningFlash.alpha = lightningFlashA
    if (dt > 0) flashCooldown = Math.max(0, flashCooldown - dt)   // the photosensitivity budget
    // v5.16: the LIGHTNING REVEAL (spec §7.3) went with the light layer — it was one alpha channel
    // on that container, and there is no longer a container to brighten.

    syncObstacles(run)
    tickPlanetSpin()   // must follow syncObstacles: a rebuild repopulates the spinner list
    syncWells(run)
    syncPools(run.pools || [])
    syncTrails(run.trails || [])
    syncWebs(run.webs || [])
    syncPool(trapPool, trapLayer, run.traps || [], 'trap', T.trapArmed, placeTrap)
    syncPool(rockPool, rockLayer, run.rocks || [], 'rock', T.asteroid, placeRock)
    syncPlayer(run.player, dt, run.rampageT || 0)
    syncEnemies(run)
    syncBlooms(run.blooms || [])
    syncLures(run.lures || [])
    redrawBombs(run)
    redrawStrips(run)
    redrawLanes(run)
    redrawHazards(run)
    redrawTelegraphs(run)
    updateStrafeLocks(dt) // draws INTO teleG, on top of what redrawTelegraphs just drew — see its own comment
    if (chapterHasStorm) {
      drawMissileLocks(run)          // also draws into teleG
      updateMissileTrails(run, dt)
      updateScars(dt)
    }
    updateRampage(run, dt)           // clears rampG itself; no-ops (and decays the jamming) elsewhere
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
    // v5.22: expand a FOLDED beam into one drawn arm per damaging arm. syncBeams draws a single
    // sprite per run.beams entry, so the fold's opposite arm has never been drawn at all — it dealt
    // damage down a line with nothing on screen. Fan mode made that visible rather than causing it:
    // b.angle is the fan's CENTRE there, so the one sprite pointed where no arm actually was.
    // The angle math mirrors sim.js's beamArmAngles. render can't import sim, and the beam entity
    // carries everything needed to derive it — but the two must stay in step, so change them together.
    syncBeams(expandBeamArms(run.beams))
    updateArcs(dt)
    redrawArcs()

    updateWhips(dt)
    updateClaws(dt)
    updateRoars(dt)
    updateParticles(dt)
    updateSmoke(dt)   // the second, separately-capped pool (missile ribbon, crush dust, clods)
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
    // v5.10 skies: a hard finned DART, not the generic soft missile glyph — this is the only
    // travelling physical projectile in the game and it carries the chapter's signal magenta. Its
    // corkscrew smoke ribbon is emitted by updateMissileTrails on the separate smoke pool, so the
    // grey circle_05 puff below (every other chapter's enemy shot) is skipped here.
    if (chapterHasStorm) {
      if (s.texture !== T.missileDart.tex) { s.texture = T.missileDart.tex; s.anchor.set(T.missileDart.ax, T.missileDart.ay) }
      s.scale.set(1.15)
      return
    }
    if (s.texture !== T.missile.tex) { s.texture = T.missile.tex; s.anchor.set(T.missile.ax, T.missile.ay) }
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
    chapterHasKaiju = !!chapterRender.kaiju
    // Read `cfg`, not CHAPTERS[run.chapter] — `run` is null on the quit-to-title path (main.js
    // onQuit), and dereferencing it here threw before ui.showScreen('title') could run, softlocking
    // the player on the Paused screen. Every other line in this block already guards for that.
    chapterHasLane = cfg?.lane === true
    chapterHasDistricts = !!chapterRender.districts
    districtSeed = run?._districtSeed ?? 0
    // roads is a chapter-TOP-LEVEL flag (config.js CHAPTERS.skies.roads), not under `render` like
    // the others above — it's sim-relevant (streamObstacles keeps buildings off streets) as well as
    // render-relevant, so it lives next to `crush`/`obstacles`, not inside the render-only block.
    chapterHasRoads = !!cfg?.roads
    // v5.12 BUGFIX — this was `run?._obstacleSeed`, i.e. render drew the street network from a
    // DIFFERENT Math.random() draw than the one the terrain, cities and buildings come from
    // (state.js draws the two independently). v5.11 moved sim's own roadAt call to the world seed
    // and rewrote the comment here to say roads had been unified — but never changed this line, so
    // the road graph and everything it is supposed to belong to described two different planets.
    // That is the single largest cause of "layout coherence is just awful": streets ran across
    // farmland where the urban falloff makes a street geometrically impossible, downtown blocks
    // carried forty buildings and no road at all, and crosswalks landed mid-block at the angle of a
    // grid that was not there. Measured over eight wide captures: matched seeds put 0.0% of street
    // area on farms/parks/desert and leave 0.0% of downtown roadless; the split seeds put up to 20%
    // and 75%.
    roadSeed = run?._districtSeed ?? 0
    // v5.10: recover the per-seed road grid origin ONCE per run, before anything that enumerates
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
      const cx = viewW() / 2 - run.player.x
      const cy = viewH() / 2 - run.player.y
      world.scale.set(mapZoom)
      world.position.set(cx * mapZoom, cy * mapZoom)
      updateGroundField(cx, cy)
      playerX = run.player.x
      playerY = run.player.y
      updateFloorLayer(cx, cy)
      updateJunctions(cx, cy)
      syncPlayer(run.player, 0)
    } else {
      entitiesLayer.visible = false
      idleLayer.visible = true
      idleT = 0
    }
  }

  // Dev/debug entry point for MAP MODE (see mapZoom's comment above). Zoom < 1 pulls the camera
  // back; `bare` hides everything that is not the procedural world — the player rig, all entities,
  // projectiles and FX, the storm's cloud shadows and rain, and the additive light layer — leaving
  // ground, roads, junctions, kerb furniture, props and buildings. Not reachable from gameplay;
  // main.js only wires it up behind a URL flag.
  function setMapMode(on, zoom) {
    mapMode = !!on
    mapZoom = on ? (zoom || 0.25) : 1
    // entitiesLayer is NOT hidden wholesale: obstacleLayer lives inside it, and the BUILDINGS are
    // half of what a layout view exists to show (the first capture hid them and produced a map of
    // bare roads on flat ground). Hide every child of it EXCEPT the structures, plus the weather and
    // cloud shadows are big soft shapes that wash over exactly the boundaries this view is meant
    // to make legible. (v5.16: the additive light layer they were listed beside is gone.)
    for (const child of entitiesLayer.children) child.visible = on ? child === obstacleLayer : true
    entitiesLayer.visible = true
    cloudShadowLayer.visible = !on
    stormRainLayer.visible = !on
    stormCloudLayer.visible = !on
    // A zoomed-out world streams far more cells than the pools were sized for at 1:1, and every
    // cached floor sprite is positioned for the old viewport — drop them so the next frame
    // repopulates against the new one.
    clearFloorLayer()
    clearGroundField()
  }

  return { reset, sync, idle, ready, setMapMode }
}
