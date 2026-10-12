// THE MANTLE'S MECHANIC TELLS (render-only; src/toon.js calls in). Painted like the world they sit on:
// watercolour rock and gouache lava, NO INK (the ink belongs to the paper cast).
//   run.quenchCrusts   Quench Kettle's crust: one organic skin of cooled basalt, laid only where it covers
//                      lava, its cracks glowing dull red, a hot rim where it meets the lava. Poured: a
//                      flash of molten orange going dark under a puff of steam. Its last seconds: the
//                      cracks widen and glow until the skin sinks back into the lava.
//   run.lavaPools      Crack Hammer's pools: a glowing crack splits the rock and opens into a pool with a
//                      broken rim; a skin closes over it at the end
//   run.novas          look 'lavaWave' (Lava Bellows): a curling crest of lava rolling out, splashing
//   run.player         boatT / boatMax / afloat: the basalt raft under you, lava eating in over its rim
//                      as it sinks
//   enemies            strandT (a lava creature on dry rock: a crust creeps in over it from its edge until
//                      it is encased, cracks glowing as it is about to crumble), meltT (a rock creature
//                      under the tide: it slumps into a glowing puddle)
//   events             melt (an orange splash) and crumble (grey shards); both return true from event()
//   the tools          inked like the cast, read off the same fields: the kettle tipping over the digger
//                      and a ring of splashing drops (the newest crust's t), the sledgehammer slamming
//                      down with an impact star (each pool's t), the wave's curls and drops
//
// THE CRUST MATERIAL. Every basalt skin here (crust, raft, a stranded creature's shell) is one quad with
// one shader: a baked atlas of 3 shapes holds per texel the distance to the nearest seam (r), the
// relief (g), the depth into the shape from its edge (b) and a paper noise (a); uniforms say how hot it
// is (seams widen and glow), how sunk (the lava eats in at the edge and the seams), how far the skin
// has crept in, and how freshly quenched. A crust over lava is masked by a tiny per-crust texture of
// where the ground under it is lava, re-laid only when the tide's line or the pools under it move.
// ?crust=a|b|c picks the skin's pattern (a cracked plates, b ropey pahoehoe, c basalt slabs).
import { Container, Graphics, Mesh, MeshGeometry, Shader, UniformGroup, BufferImageSource, CanvasSource, Texture, Sprite } from 'pixi.js'
import { PAL, TAU, hexNum, mkCanvas } from './palette.js'
import { resetXf, sc, ell, polar, tube, qb, line, cel, glow } from './brush.js'
import { mantleHeightAt } from '../sim.js'
import { MANTLE_STRAND_STUCK_T, MANTLE_STRAND_DIE_T, MANTLE_MELT_T, DRAW_CAPS } from '../config.js'

const C = {
  ink: hexNum(PAL.ink), basalt: hexNum(PAL.basalt), basaltHi: hexNum(PAL.basaltHi), basaltLo: hexNum(PAL.basaltLo),
  lavaDeep: hexNum(PAL.lavaDeep), lava: hexNum(PAL.lava), lavaHot: hexNum(PAL.lavaHot), lavaGlow: hexNum(PAL.lavaGlow),
  lavaWhite: hexNum(PAL.lavaWhite),
  // the world's own rock, as the floor shader paints it (a dusky plum wash), for rims and scorch
  rockDusk: 0x2c2238, rockScorch: 0x1e1622, rockLip: 0x4a3550,
}
const CRUST_DEFAULT = 'b'
const VARIANT = (() => {
  try { const v = new URLSearchParams(location.search).get('crust'); return 'abc'.includes(v) && v ? v : CRUST_DEFAULT } catch { return CRUST_DEFAULT }
})()
// per pattern: the seams' half-width cool, and how much they open at full heat (normalised to the radius)
const SEAMS = { a: [0.006, 0.026], b: [0.005, 0.022], c: [0.012, 0.04] }

const ART_N = 256          // texels per shape side
const ART_A = 1.2          // the art quad's half-size, in crust radii
const SHAPES = 3
const MASK_N = 24          // nodes per side of a crust's lava mask
const MASK_SOFT = 6        // px: how soft the crust's edge is where the lava meets the shore

// a hash in [0, 1) of three integers, well mixed even for small neighbouring inputs (palette.js's
// hash is not: hash(0..4, s, k) for one s lands all five in one quarter of a turn)
function rh(a, b, c) {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x632be5ab, 0x85ebca77) ^ Math.imul((c | 0) + 0x1b873593, 0xc2b2ae3d)
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15
  return (h >>> 0) / 4294967296
}
// ---------------------------------------------------------------- noise (bake time only)
// value noise off a 256^2 lattice of hashes, made once (a hash per corner per sample was most of the bake)
let LAT = null
function vn(x, y, s) {
  if (!LAT) { LAT = new Float32Array(65536); for (let i = 0; i < 65536; i++) LAT[i] = rh(i & 255, i >> 8, 77) }
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  const X = (xi + s * 57) & 255, Y = ((yi + s * 131) & 255) << 8, X1 = (X + 1) & 255, Y1 = (Y + 256) & 65280
  const a = LAT[X | Y], b = LAT[X1 | Y], c = LAT[X | Y1], d = LAT[X1 | Y1]
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy
}
const fbm = (x, y, s) => (vn(x, y, s) * 0.5 + vn(x * 2.03, y * 2.03, s + 1) * 0.25 + vn(x * 4.1, y * 4.1, s + 2) * 0.125) / 0.875
const hyp = (x, y) => Math.sqrt(x * x + y * y)
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

// a shape's edge: radius (in crust radii) at angle a, lobed and seeded, never a circle
function edgeR(a, k) {
  const p = k * 2.399
  return 0.93 + 0.075 * Math.sin(2 * a + p) + 0.05 * Math.sin(3 * a + p * 1.7 + 1) + 0.03 * Math.sin(5 * a + p * 2.3 + 2) + 0.02 * Math.sin(8 * a + p * 3.1)
}
// distance to the nearest Voronoi bisector of a jittered grid of spacing sp (by cells: cheap at any density)
function worley(x, y, sp, s) {
  const gx = Math.floor(x / sp), gy = Math.floor(y / sp)
  let d1 = 9, d2 = 9
  for (let j = gy - 1; j <= gy + 1; j++) for (let i = gx - 1; i <= gx + 1; i++) {
    const dd = hyp(x - (i + 0.15 + 0.7 * rh(i, j, s)) * sp, y - (j + 0.15 + 0.7 * rh(i, j, s + 1)) * sp)
    if (dd < d1) { d2 = d1; d1 = dd } else if (dd < d2) d2 = dd
  }
  return (d2 - d1) / 2
}
// seeds of a jittered grid of spacing sp, as flat [x, y, tilt] triples
function seedsOf(sp, s) {
  const out = []
  const n = Math.ceil(ART_A / sp) + 1
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    out.push((i + (j & 1) * 0.5 + (rh(i, j, s) - 0.5) * 0.7) * sp, (j + (rh(i, j, s + 9) - 0.5) * 0.7) * sp, rh(i, j, s + 17) - 0.5)
  }
  out.n = n; out.sp = sp
  return out
}
// the atlas: SHAPES rows of ART_N^2 texels (r seam distance x4, g relief, b depth into the shape, a noise)
function bakeAtlas(variant) {
  const N = ART_N, data = new Uint8Array(N * N * SHAPES * 4)
  const H = new Float32Array(N * N), D = new Float32Array(N * N), S = new Float32Array(N * N), Z = new Float32Array(N * N)
  const step = (2 * ART_A) / N
  for (let k = 0; k < SHAPES; k++) {
    const sd = 101 + k * 31 + variant.charCodeAt(0) * 7
    const seeds = seedsOf(variant === 'c' ? 0.62 : variant === 'b' ? 0.8 : 0.36, sd)
    const fl = rh(k, 5, sd) * TAU, fc = Math.cos(fl), fs = Math.sin(fl)
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -ART_A + (i + 0.5) * step, y = -ART_A + (j + 0.5) * step
      const rho = hyp(x, y), s = 1 - rho / edgeR(Math.atan2(y, x), k)
      // the seams: a Voronoi of warped space, distance to the nearest bisector
      const qx = x + 0.13 * (fbm(x * 3 + 5, y * 3, sd) - 0.5), qy = y + 0.13 * (fbm(x * 3, y * 3 + 9, sd + 3) - 0.5)
      // only the seeds of the 5x5 grid cells round it can be nearest (jitter is under a cell)
      let d1 = 9, d2 = 9, tl = 0
      const sn = seeds.n, sw = 2 * sn + 1, j0 = Math.round(qy / seeds.sp)
      for (let jj = Math.max(-sn, j0 - 2); jj <= Math.min(sn, j0 + 2); jj++) {
        const i0 = Math.round(qx / seeds.sp - (jj & 1) * 0.5)
        for (let ii = Math.max(-sn, i0 - 2); ii <= Math.min(sn, i0 + 2); ii++) {
          const m = ((jj + sn) * sw + ii + sn) * 3
          const dd = hyp(qx - seeds[m], qy - seeds[m + 1])
          if (dd < d1) { d2 = d1; d1 = dd; tl = seeds[m + 2] } else if (dd < d2) d2 = dd
        }
      }
      const d = (d2 - d1) / 2
      const n = fbm(x * 9, y * 9, sd + 11)
      let h
      if (variant === 'b') {
        // ropes: folds bowed along the flow, shallow and rounded, broken by a few big cracks
        const u = x * fc + y * fs, v = -x * fs + y * fc
        const arc = u - (0.45 + 0.4 * fbm(v * 1.3, 3, sd + 6)) * v * v + 0.26 * (fbm(x * 1.6, y * 1.6, sd + 5) - 0.5)
        h = Math.pow(Math.abs(Math.sin(arc * Math.PI * 5.5)), 0.5) * 0.6 + 0.3 * smooth(0, 0.08, d) + n * 0.1
      } else if (variant === 'c') {
        // slabs: flat tops tipped this way and that, steep broken edges
        h = smooth(0, 0.045, d) * 0.8 + tl * 0.5 * (x * 0.6 + y * 0.8) + fbm(x * 6, y * 6, sd + 7) * 0.18
      } else {
        // plates: domed, sagging into their seams
        h = smooth(0, 0.13, d) * 0.75 + tl * 0.12 + fbm(x * 7, y * 7, sd + 7) * 0.15
      }
      // hairline cracks crazing the plates and slabs (relief only: they never glow)
      if (variant !== 'b') h -= 0.3 * (1 - smooth(0, 0.01, worley(qx, qy, variant === 'c' ? 0.2 : 0.15, sd + 40))) * smooth(0.01, 0.04, d)
      const o = j * N + i
      H[o] = h; D[o] = d; S[o] = s; Z[o] = n
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const o = j * N + i
      const a = H[Math.max(0, j - 1) * N + Math.max(0, i - 1)], b = H[Math.min(N - 1, j + 1) * N + Math.min(N - 1, i + 1)]
      const rel = Math.max(-1, Math.min(1, (b - a) * -4.2))   // lit from the upper left
      const w = ((k * N + j) * N + i) * 4
      data[w] = Math.round(Math.min(1, D[o] * 4) * 255)
      data[w + 1] = Math.round((rel * 0.5 + 0.5) * 255)
      data[w + 2] = Math.round(Math.max(0, Math.min(1, (S[o] + 0.25) / 1.25)) * 255)
      data[w + 3] = Math.round(Math.max(0, Math.min(1, Z[o])) * 255)
    }
  }
  return new BufferImageSource({ resource: data, width: N, height: N * SHAPES, format: 'rgba8unorm', scaleMode: 'linear', alphaMode: 'no-premultiply-alpha' })
}

const CRUST_VERT = `in vec2 aPosition;
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
const CRUST_FRAG = `precision highp float;
in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uArt;
uniform sampler2D uMask;
uniform float uRow;     // which of the atlas's shapes
uniform float uHeat;    // 0 cooled .. 1 the lava coming back through its seams
uniform float uErode;   // 0 whole .. 1 sunk back into the lava
uniform float uCover;   // how far the skin has crept in from its edge (>= 1.1: all of it)
uniform float uQuench;  // 1 the moment it is poured (still molten) .. 0
uniform float uSeam;    // the seams' half-width cooled
uniform float uGrow;    // and how much more at full heat
uniform float uAlpha;
uniform float uMaskN;
float bell(float x, float c, float w) { float q = (x - c) / w; return exp(-q * q); }
void main() {
  vec4 a = texture(uArt, vec2(vUV.x, (clamp(vUV.y, 0.002, 0.998) + uRow) / 3.0));
  float d = a.r * 0.25, rel = a.g * 2.0 - 1.0, s = a.b * 1.25 - 0.25, n = a.a;
  vec2 muv = vUV * (uMaskN - 1.0) / uMaskN + 0.5 / uMaskN;
  float lavaUnder = texture(uMask, muv).r;
  float se = s + (n - 0.5) * 0.06;
  // the lava eats in at the edge as it sinks
  float edge = smoothstep(uErode * 0.7, uErode * 0.7 + 0.03, se);
  // a skin creeping in from the edge (a stranded creature)
  float cov = 1.0 - smoothstep(uCover - 0.04, uCover + 0.02, se + (n - 0.5) * 0.12);
  // the seams: widening with the heat, swallowing the plates as it sinks
  float w = uSeam + uGrow * uHeat + uErode * 0.22;
  float dn = d + (n - 0.5) * 0.012;
  float seam = 1.0 - smoothstep(w, w + 0.006 + 0.006 * uHeat, dn);
  // the skin: a dusky plum basalt wash, lit from the upper left, the paper granulating through it
  vec3 skin = vec3(0.2, 0.155, 0.19);
  vec3 col = rel > 0.0 ? mix(skin, vec3(0.38, 0.31, 0.36), rel) : mix(skin, vec3(0.085, 0.062, 0.08), -rel);
  col *= 0.8 + 0.4 * n;
  // watercolour: the pigment pooled dark along each seam and round the edge
  col *= 1.0 - 0.38 * bell(dn, w + 0.016, 0.012);
  col *= 1.0 - 0.3 * bell(se, 0.07, 0.05);
  // the heat bleeding out of the seams into the skin round them
  float warm = exp(-max(0.0, dn - w) / (0.015 + 0.05 * uHeat)) * (0.18 + 0.82 * uHeat);
  col = mix(col, vec3(0.52, 0.15, 0.09), warm * 0.55);
  // the hot rim where it meets the lava
  float rim = 1.0 - smoothstep(0.0, 0.045 + 0.13 * uHeat, se);
  vec3 rimC = mix(vec3(0.5, 0.12, 0.07), vec3(0.96, 0.5, 0.15), 1.0 - smoothstep(0.0, 0.04 + 0.06 * uHeat, se));
  col = mix(col, rimC, rim * 0.85);
  // the lava in the seams: dull embers cooled, orange to a yellow core hot
  vec3 lavaC = mix(vec3(0.42, 0.08, 0.06), vec3(0.96, 0.5, 0.15), clamp(0.15 + uHeat, 0.0, 1.0));
  lavaC = mix(lavaC, vec3(1.0, 0.84, 0.42), (1.0 - smoothstep(0.0, w * 0.7 + 0.002, dn)) * uHeat);
  col = mix(col, lavaC, seam);
  // just poured: still molten, darkening fast
  col = mix(col, mix(vec3(0.7, 0.18, 0.08), vec3(1.0, 0.62, 0.22), uQuench), uQuench * 0.9 * (0.7 + 0.3 * n));
  // sinking: the plates going back to lava
  col = mix(col, lavaC, uErode * 0.55);
  float al = smoothstep(0.0, 0.025, se) * edge * cov * lavaUnder * uAlpha;
  finalColor = vec4(col * al, al);
}`

// steam: a soft cream watercolour puff, three of them (bake once)
function paintSteam(v) {
  const S = 128, cv = mkCanvas(S, S), x = cv.getContext('2d')
  for (let i = 0; i < 9; i++) {
    const a = rh(i, v, 3) * TAU, d = rh(i, v, 4) * 26, r = 18 + rh(i, v, 5) * 20
    const cx = S / 2 + Math.cos(a) * d, cy = S / 2 + Math.sin(a) * d
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r)
    g.addColorStop(0, 'rgba(247,241,227,0.4)'); g.addColorStop(0.55, 'rgba(236,228,214,0.22)'); g.addColorStop(1, 'rgba(230,220,210,0)')
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill()
  }
  return new Texture({ source: new CanvasSource({ resource: cv }) })
}

// ---------------------------------------------------------------- THE POOL MATERIAL
// A Crack Hammer pool painted like the tide's own lava: one quad, a tileable noise texture. Cracks
// race out from the stamp (uSplit), the ground yawns open into a jagged pool with a lit broken lip
// (uOpen), and a basalt skin closes it from the rim in (uClose).
const NOISE_N = 128
function bakeNoise() {
  const N = NOISE_N, data = new Uint8Array(N * N * 4)
  const tv = (x, y, P, s) => {   // value noise tiling every P cells
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), m = (v) => ((v % P) + P) % P
    const a = rh(m(xi), m(yi), s), b = rh(m(xi + 1), m(yi), s), c = rh(m(xi), m(yi + 1), s), d = rh(m(xi + 1), m(yi + 1), s)
    return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const o = (j * N + i) * 4
    for (let ch = 0; ch < 4; ch++) {
      const P = 4 << ch, u = (i / N) * P, v = (j / N) * P
      const f = (tv(u, v, P, ch * 13 + 1) * 0.55 + tv(u * 2, v * 2, P * 2, ch * 13 + 2) * 0.3 + tv(u * 4, v * 4, P * 4, ch * 13 + 3) * 0.15)
      data[o + ch] = Math.round(f * 255)
    }
  }
  return new BufferImageSource({ resource: data, width: N, height: N, format: 'rgba8unorm', scaleMode: 'linear', addressMode: 'repeat', alphaMode: 'no-premultiply-alpha' })
}
const POOL_A = 1.7   // the pool quad's half-size, in pool radii (room for its cracks and scorch)
const POOL_FRAG = `precision highp float;
in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uNoise;
uniform float uOpen;    // 0 a crack .. 1 a full pool
uniform float uClose;   // 0 open .. 1 skinned over
uniform float uSplit;   // 0 .. 1 the cracks racing out from the stamp
uniform float uTime;
uniform float uSeed;
void over(inout vec4 acc, vec3 c, float a) { acc = vec4(c * a + acc.rgb * (1.0 - a), a + acc.a * (1.0 - a)); }
void main() {
  vec2 p = (vUV * 2.0 - 1.0) * ${POOL_A.toFixed(2)};
  float rho = length(p), ang = atan(p.y, p.x);
  vec2 dir = p / max(rho, 1e-4);
  vec4 nA = texture(uNoise, dir * 0.21 + vec2(uSeed, uSeed * 0.7));
  vec4 nP = texture(uNoise, p * 0.33 + uSeed * 1.3);
  vec4 nF = texture(uNoise, p * 0.45 + vec2(uTime * 0.035, -uTime * 0.025) + uSeed);
  float R = uOpen * (1.0 - 0.5 * uClose) * (0.92 + (nA.g - 0.5) * 0.4 + (nA.b - 0.5) * 0.16);
  float rimD = rho - R;
  vec4 acc = vec4(0.0);
  // the scorched rock round it: a darker wash
  float scorch = (1.0 - smoothstep(R * 0.8, R * 1.45 + 0.4, rho + (nP.r - 0.5) * 0.35)) * max(uSplit, uOpen) * 0.42;
  over(acc, vec3(0.12, 0.08, 0.13), scorch);
  // the cracks: five rays zigzagging out, glowing
  float warp = (texture(uNoise, vec2(rho * 0.7, uSeed * 3.1)).r - 0.5) * 0.6;
  float dRay = abs(sin(2.5 * (ang + warp + uSeed * 6.0))) * rho;
  float len = (0.12 + 1.35 * uSplit) * (0.65 + 0.7 * nA.r);
  float cw = (0.04 + 0.035 * max(0.0, 1.0 - rho)) * (1.0 - 0.6 * uClose);
  float crack = (1.0 - smoothstep(cw, cw + 0.025, dRay)) * (1.0 - smoothstep(len * 0.75, len, rho));
  over(acc, vec3(0.16, 0.07, 0.08), crack * 0.9);
  float core = (1.0 - smoothstep(cw * 0.35, cw * 0.35 + 0.02, dRay)) * (1.0 - smoothstep(len * 0.55, len, rho));
  over(acc, mix(vec3(0.93, 0.42, 0.13), vec3(0.6, 0.15, 0.08), uClose), core);
  // the broken lip, lit from the lava below it
  float lip = (1.0 - smoothstep(0.0, 0.1 + 0.08 * nP.g, rimD)) * smoothstep(-0.02, 0.0, rimD) * step(0.02, uOpen);
  vec3 lipC = mix(vec3(0.3, 0.2, 0.28), vec3(0.86, 0.42, 0.22), (1.0 - smoothstep(0.0, 0.06, rimD)) * 0.8) * (0.85 + 0.3 * nP.g);
  over(acc, lipC, lip);
  // the lava: gouache marbled like the tide's, deep at the edge, a hot heart, churning
  float inside = 1.0 - smoothstep(-0.025, 0.0, rimD);
  float mm = mix(nF.g, nF.b, 0.5);
  vec3 lc = vec3(0.94, 0.49, 0.14);
  lc = mix(lc, vec3(0.77, 0.2, 0.09), smoothstep(0.5, 0.32, mm) * 0.85);
  lc = mix(lc, vec3(0.99, 0.73, 0.21), smoothstep(0.55, 0.68, mm) * 0.9);
  float u = rho / max(R, 1e-3);
  lc = mix(lc, vec3(0.55, 0.11, 0.07), smoothstep(0.62, 1.0, u) * 0.75);
  lc = mix(lc, vec3(1.0, 0.88, 0.56), (1.0 - smoothstep(0.0, 0.42, u)) * 0.45);
  // closing: a basalt skin creeping in from the rim, a hot seam where it meets the lava
  float sk = smoothstep(1.02 - uClose * 1.1 - 0.06, 1.02 - uClose * 1.1 + 0.04, u + (nP.b - 0.5) * 0.3) * step(0.001, uClose);
  vec3 skinC = vec3(0.21, 0.16, 0.2) * (0.8 + 0.4 * nP.r);
  float seam = sk * (1.0 - smoothstep(0.0, 0.12, u - (1.02 - uClose * 1.1)));
  lc = mix(lc, skinC, sk);
  lc = mix(lc, vec3(0.8, 0.27, 0.1), seam * 0.6);
  over(acc, lc, inside);
  finalColor = acc;
}`

// ---------------------------------------------------------------- THE TOOLS (inked like the cast)
// The weapons' own moments are cartoon props on paper, drawn with the cast's brush: a tin kettle
// tipping, a sledgehammer slamming, an impact star, the curl of a breaking lava wave, droplets.
const BRES = 3
function bake(w, h, ax, ay, paint) {
  const cv = mkCanvas(w * BRES, h * BRES), ctx = cv.getContext('2d')
  ctx.scale(BRES, BRES); ctx.translate(w * ax, h * ay)
  resetXf(); paint(ctx); resetXf()
  const tex = new Texture({ source: new CanvasSource({ resource: cv, resolution: BRES }) })
  return { tex, ax, ay }
}
const TIN = '#9fb0ab', TIN_SH = 'rgba(30,44,52,0.55)', WOOD = PAL.wood
function paintKettle() {
  return bake(64, 54, 0.45, 0.55, (c) => {
    // handle over the top, then the spout, then the body over both, the lid, its knob
    cel(c, tube(qb([-11, -6], [0, -27], [11, -6]), 2.6), PAL.inkSoft, { ink: 1.1 })
    cel(c, tube(qb([11, 6], [22, 7], [27, -6]), 5, 2.4), TIN, { ink: 1.5, shade: TIN_SH })
    cel(c, ell(0, 4, 16, 13, 0, 44, 0.02, 3), TIN, { ink: 1.7, shade: TIN_SH, spec: 0.3 })
    cel(c, ell(0, -7, 10, 3.6), '#c6d2cd', { ink: 1.3, shade: TIN_SH })
    cel(c, ell(0, -11, 3.2, 2.6), PAL.inkSoft, { ink: 1 })
    // a dent and a rivet: a well-used kettle
    line(c, [[-9, 8], [-6, 11], [-2, 10]], 0.7, { color: PAL.inkSoft })
  })
}
function paintHammer() {
  // drawn lying along +x: a fat iron head at the left, the handle's end (the pivot, the hand) at the right
  return bake(84, 44, 0.92, 0.5, (c) => {
    cel(c, [[-44, -3.6], [2, -3], [5, 0], [2, 3], [-44, 3.6]], WOOD, { ink: 1.6, shade: 'rgba(70,30,10,0.5)' })
    for (const x of [-10, -5, 0]) line(c, [[x, -3.2], [x - 2, 3.2]], 0.7, { color: PAL.inkSoft })
    cel(c, [[-68, -14], [-44, -15], [-41, -11], [-41, 11], [-44, 15], [-68, 14], [-71, 10], [-71, -10]], PAL.iron, { ink: 2, shade: 'rgba(20,14,24,0.6)', spec: 0.35 })
    cel(c, [[-68, -13], [-63, -13.5], [-63, 13.5], [-68, 13]], PAL.ironHi, { ink: 0, shade: null })
    line(c, [[-46, -12], [-46, 12]], 0.8, { color: PAL.inkSoft })
  })
}
function paintStar() {
  return bake(60, 60, 0.5, 0.5, (c) => {
    cel(c, polar(0, 0, (t) => (Math.round(t / (TAU / 18)) % 2 ? 13 : 26) * (1 + 0.12 * Math.sin(t * 5)), 18), PAL.paper, { ink: 1.8, shade: null })
    cel(c, polar(0, 0, (t) => (Math.round(t / (TAU / 18)) % 2 ? 7 : 14), 18), PAL.lavaGlow, { ink: 0, shade: null })
  })
}
// the curl of a breaking crest, seen from above: a fat tongue rolling forward (+x), its lip curled in
// the lip of a breaking crest, seen from above: a tongue of lava rolling forward (+x) and hooking back
// over itself, the hollow of the curl dark inside it
function paintCurl(v) {
  return bake(40, 36, 0.45, 0.5, (c) => {
    sc(1 + v * 0.1)
    const hook = []
    for (let i = 0; i <= 26; i++) { const a = -2.5 + (i / 26) * 4.6, r = 11 - (i / 26) * 4; hook.push([Math.cos(a) * r, Math.sin(a) * r * 0.92]) }
    for (let i = 26; i >= 0; i--) { const a = -2.5 + (i / 26) * 4.6, r = 5.6 - (i / 26) * 3.2; hook.push([Math.cos(a) * r - 0.5, Math.sin(a) * r * 0.92 + 0.6]) }
    cel(c, ell(-0.5, 0.6, 5.4, 4.8), PAL.lavaDeep, { ink: 0, shade: null })
    cel(c, hook, PAL.lavaHot, { ink: 1.6, shade: 'rgba(150,20,10,0.5)' })
    const hi = []
    for (let i = 0; i <= 12; i++) { const a = -2.2 + (i / 12) * 2.6; hi.push([Math.cos(a) * 9.2, Math.sin(a) * 8.4]) }
    line(c, hi, 1.6, { color: PAL.lavaWhite })
  })
}
function paintDrop(kind) {
  return bake(16, 16, 0.5, 0.5, (c) => {
    const col = kind === 'water' ? '#d7ece6' : kind === 'lava' ? PAL.lavaHot : PAL.basaltHi
    cel(c, polar(0, 0, (t) => 4.4 * (1 + 0.1 * Math.cos(t - 2.4)), 24), col, { ink: 1.2, shade: kind === 'water' ? 'rgba(40,80,90,0.4)' : 'rgba(120,20,10,0.5)' })
    cel(c, ell(-1.3, -1.3, 1.4, 1), PAL.white, { ink: 0, shade: null })
  })
}

// a closed outline round (x, y): radius r wobbling by `jag`, seeded so it never crawls
function blob(x, y, r, jag, seed, n = 18) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU
    const k = 1 + jag * (rh(i, seed, 7) * 2 - 1)
    pts.push(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k)
  }
  return pts
}
// a broken rim: spikes alternating in and out
function jagged(x, y, r, seed, n, amp, rot = 0) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU + (rh(i, seed, 2) - 0.5) * (TAU / n) * 0.6
    const k = 1 + amp * ((i & 1 ? 0.6 : -0.5) + (rh(i, seed, 8) - 0.5) * 0.8)
    pts.push(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k)
  }
  return pts
}

export function createMantleFx({ ground, boat, top }) {
  const poolLayer = new Container(), crustLayer = new Container(), groundG = new Graphics()
  const boatUnderG = new Graphics(), boatLayer = new Container()
  const strandLayer = new Container(), topG = new Graphics(), steamLayer = new Container(), toolLayer = new Container()
  ground.addChild(poolLayer, crustLayer, groundG, steamLayer)
  boat.addChild(boatUnderG, boatLayer)
  top.addChild(strandLayer, topG, toolLayer)
  const bursts = []   // { kind: 'melt' | 'crumble', x, y, r, t, seed }

  // ---- the crust material, made on first use (the atlas bake is a few tens of ms, once) ----
  let atlas = null, quad = null, fullMask = null
  const [seam0, seamGrow] = SEAMS[VARIANT]
  function material() {
    if (atlas) return
    atlas = bakeAtlas(VARIANT)
    quad = new MeshGeometry({
      positions: new Float32Array([-ART_A, -ART_A, ART_A, -ART_A, ART_A, ART_A, -ART_A, ART_A]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    })
    fullMask = new BufferImageSource({ resource: new Uint8Array(4 * 4 * 4).fill(255), width: 4, height: 4, format: 'rgba8unorm', scaleMode: 'linear', alphaMode: 'no-premultiply-alpha' })
  }
  function makeSkin(parent, masked) {
    material()
    const U = new UniformGroup({
      uRow: { value: 0, type: 'f32' }, uHeat: { value: 0, type: 'f32' }, uErode: { value: 0, type: 'f32' },
      uCover: { value: 2, type: 'f32' }, uQuench: { value: 0, type: 'f32' }, uSeam: { value: seam0, type: 'f32' },
      uGrow: { value: seamGrow, type: 'f32' }, uAlpha: { value: 1, type: 'f32' }, uMaskN: { value: masked ? MASK_N : 4, type: 'f32' },
    })
    let maskData = null, maskSrc = fullMask
    if (masked) {
      maskData = new Uint8Array(MASK_N * MASK_N * 4)
      maskSrc = new BufferImageSource({ resource: maskData, width: MASK_N, height: MASK_N, format: 'rgba8unorm', scaleMode: 'linear', alphaMode: 'no-premultiply-alpha' })
    }
    const mesh = new Mesh({ geometry: quad, shader: Shader.from({ gl: { vertex: CRUST_VERT, fragment: CRUST_FRAG, name: 'mantle-crust' }, resources: { crustU: U, uArt: atlas, uMask: maskSrc } }) })
    mesh.visible = false
    parent.addChild(mesh)
    return { mesh, U: U.uniforms, maskData, maskSrc, owner: null, heights: null, key: null, used: false }
  }
  const skinLook = (sk, x, y, r, sy, rotA, row) => {
    sk.mesh.visible = true
    sk.mesh.position.set(x, y); sk.mesh.scale.set(r, r * sy); sk.mesh.rotation = rotA
    sk.U.uRow = row
  }
  const crustSkins = [], strandSkins = []
  let boatSkin = null
  // growable pools of plain sprites (steam on the ground; the tools, drops and curls over the cast)
  const spritePool = (parent) => {
    const list = []
    let n = 0
    return {
      begin() { n = 0 },
      next(a) {
        let sp = list[n]
        if (!sp) { sp = new Sprite(a.tex); parent.addChild(sp); list.push(sp) }
        n++
        if (sp.texture !== a.tex) sp.texture = a.tex
        sp.anchor.set(a.ax ?? 0.5, a.ay ?? 0.5)
        sp.visible = true; sp.alpha = 1; sp.rotation = 0; sp.scale.set(1)
        return sp
      },
      end() { for (let i = n; i < list.length; i++) list[i].visible = false },
    }
  }
  const steam = spritePool(steamLayer), tools = spritePool(toolLayer)
  let ART = null
  function art() {
    if (ART) return ART
    material()
    ART = {
      steam: [0, 1, 2].map((v) => ({ tex: paintSteam(v) })), kettle: paintKettle(), hammer: paintHammer(), star: paintStar(),
      curl: [0, 1, 2].map(paintCurl), water: paintDrop('water'), lava: paintDrop('lava'), chip: paintDrop('rock'),
      noise: bakeNoise(),
      poolQuad: new MeshGeometry({
        positions: new Float32Array([-POOL_A, -POOL_A, POOL_A, -POOL_A, POOL_A, POOL_A, -POOL_A, POOL_A]),
        uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      }),
    }
    return ART
  }
  const poolMeshes = []
  function makePool() {
    const A = art()
    const U = new UniformGroup({
      uOpen: { value: 0, type: 'f32' }, uClose: { value: 0, type: 'f32' }, uSplit: { value: 0, type: 'f32' },
      uTime: { value: 0, type: 'f32' }, uSeed: { value: 0, type: 'f32' },
    })
    const mesh = new Mesh({ geometry: A.poolQuad, shader: Shader.from({ gl: { vertex: CRUST_VERT, fragment: POOL_FRAG, name: 'mantle-pool' }, resources: { poolU: U, uNoise: A.noise } }) })
    poolLayer.addChild(mesh)
    return { mesh, U: U.uniforms }
  }

  // where the ground under a crust is lava: its mask nodes, the heights sampled once per crust
  function layMask(sk, c, rotA, L, seed, line, pools) {
    const M = MASK_N, cs = Math.cos(rotA), sn = Math.sin(rotA), st = (2 * ART_A) / (M - 1)
    if (!sk.heights) {
      sk.heights = L ? new Float32Array(M * M) : null
      if (L) for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
        const lx = -ART_A + i * st, ly = -ART_A + j * st
        sk.heights[j * M + i] = mantleHeightAt(L, seed, c.x + c.r * (lx * cs - ly * sn), c.y + c.r * (lx * sn + ly * cs))
      }
    }
    const h = sk.heights, wst = st * c.r
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      let a = 0
      if (h) {
        const o = j * M + i
        const gx = (h[j * M + Math.min(M - 1, i + 1)] - h[j * M + Math.max(0, i - 1)]) / ((Math.min(M - 1, i + 1) - Math.max(0, i - 1)) * wst)
        const gy = (h[Math.min(M - 1, j + 1) * M + i] - h[Math.max(0, j - 1) * M + i]) / ((Math.min(M - 1, j + 1) - Math.max(0, j - 1)) * wst)
        const g = Math.max(1e-7, hyp(gx, gy))
        a = Math.max(0, Math.min(1, 0.5 + (line - h[o]) / (g * MASK_SOFT)))
      }
      if (a < 1 && pools.length) {
        const lx = -ART_A + i * st, ly = -ART_A + j * st
        const wx = c.x + c.r * (lx * cs - ly * sn), wy = c.y + c.r * (lx * sn + ly * cs)
        for (const q of pools) a = Math.max(a, Math.max(0, Math.min(1, 0.5 + (q.r - hyp(wx - q.x, wy - q.y)) / MASK_SOFT)))
      }
      const v = Math.round(a * 255), w = (j * M + i) * 4
      sk.maskData[w] = sk.maskData[w + 1] = sk.maskData[w + 2] = sk.maskData[w + 3] = v
    }
    sk.maskSrc.update()
  }

  function hideAll() {
    for (const s of [...crustSkins, ...strandSkins]) { s.mesh.visible = false; s.owner = null }
    if (boatSkin) boatSkin.mesh.visible = false
    for (const m of poolMeshes) m.mesh.visible = false
    steam.begin(); steam.end(); tools.begin(); tools.end()
  }
  return {
    reset() { bursts.length = 0; groundG.clear(); boatUnderG.clear(); topG.clear(); hideAll() },
    event(e) {
      if (e.type !== 'melt' && e.type !== 'crumble') return false
      bursts.push({ kind: e.type, x: e.x, y: e.y, r: e.r || 14, t: 0, seed: Math.floor(Math.abs(e.x * 7 + e.y * 13)) })
      if (bursts.length > 80) bursts.shift()
      return true
    },
    // tide = { L, T } (lavaTideOf, or the dry fallback with line -1); onScreen(x, y, r); t = animT
    sync(run, dt, tide, onScreen, t) {
      groundG.clear(); boatUnderG.clear(); topG.clear()
      const { L, T } = tide
      const line = T.line
      const livePools = (run.lavaPools ?? []).filter((q) => q.t < q.dur)

      // ---- the hammer's pools: the stamp (a sledgehammer slamming down, an impact star, chips and lava
      // flying) cracks the rock, the cracks yawn into a pool, a skin closes it ----
      const A = art()
      steam.begin(); tools.begin()
      let np = 0
      for (const q of livePools) {
        if (np >= 24 || !onScreen(q.x, q.y, q.r * POOL_A)) continue
        const pm = poolMeshes[np] ?? (poolMeshes.push(makePool()), poolMeshes[np])
        np++
        const sd = Math.floor(Math.abs(q.x * 3 + q.y * 5))
        pm.mesh.visible = true
        pm.mesh.position.set(q.x, q.y); pm.mesh.scale.set(q.r); pm.mesh.rotation = rh(sd, 1, 3) * TAU
        pm.U.uSplit = smooth(0.05, 0.2, q.t); pm.U.uOpen = smooth(0.1, 0.42, q.t); pm.U.uClose = smooth(0.9, 0, q.dur - q.t)
        pm.U.uTime = t; pm.U.uSeed = (sd % 97) / 97
        if (q.t < 0.42) {
          // the hammer: swung down from the hand (pivot), the head landing on the stamp at t = 0.06
          const phi = sd & 1 ? 0.62 : Math.PI - 0.62, sg = Math.cos(phi) > 0 ? 1 : -1, Lh = 56
          const del = q.t < 0.06 ? 1.35 * (1 - (q.t / 0.06) ** 2) : 0.28 * Math.sin(Math.PI * Math.min(1, (q.t - 0.06) / 0.34))
          const h = tools.next(A.hammer)
          h.position.set(q.x + Math.cos(phi) * Lh, q.y + Math.sin(phi) * Lh)
          h.rotation = phi + sg * del
          h.scale.set(1 + 0.3 * (del / 1.35), (sg > 0 ? 1 : -1) * (1 + 0.3 * (del / 1.35)) * (q.t > 0.06 && q.t < 0.1 ? 0.88 : 1))
          h.alpha = 1 - smooth(0.26, 0.42, q.t)
          // the impact: a star, rock chips and lava thrown up
          if (q.t > 0.05 && q.t < 0.18) {
            const k = (q.t - 0.05) / 0.13, st = tools.next(A.star)
            st.position.set(q.x, q.y); st.rotation = sd; st.scale.set(0.5 + 0.7 * k); st.alpha = 1 - k * k
          }
          const ph = (q.t - 0.06) / 0.36
          if (ph > 0) for (let i = 0; i < 9; i++) {
            const a = rh(i, sd, 11) * TAU, dd = q.r * (0.2 + (0.6 + 0.5 * rh(i, sd, 12)) * Math.sqrt(ph))
            const d = tools.next(i % 3 ? A.lava : A.chip)
            d.position.set(q.x + Math.cos(a) * dd, q.y + Math.sin(a) * dd * 0.8 - Math.sin(Math.PI * ph) * (16 + 14 * rh(i, sd, 13)))
            d.scale.set((0.6 + 0.6 * rh(i, sd, 14)) * (1 - 0.5 * ph)); d.alpha = 1 - ph * ph
          }
        }
      }
      for (let i = np; i < poolMeshes.length; i++) poolMeshes[i].mesh.visible = false

      // ---- the kettle's crusts: the newest DRAW_CAPS.quenchCrusts (the older ones still hold the
      // ground, unseen under the new) ----
      const crusts = run.quenchCrusts ?? []
      const draw = []
      for (let ci = Math.max(0, crusts.length - DRAW_CAPS.quenchCrusts); ci < crusts.length; ci++) {
        const c = crusts[ci]
        if (c.t < c.dur && onScreen(c.x, c.y, c.r * 1.2)) draw.push(c)
      }
      for (const s of crustSkins) s.used = false
      for (const c of draw) { const s = crustSkins.find((k) => k.owner === c); if (s) s.used = true }
      for (const s of crustSkins) if (!s.used) { s.owner = null; s.mesh.visible = false }
      const Lc = run.lavaTide ? L : null
      for (const c of draw) {
        let sk = crustSkins.find((k) => k.owner === c)
        if (!sk) {
          sk = crustSkins.find((k) => !k.owner) ?? (crustSkins.push(makeSkin(crustLayer, true)), crustSkins[crustSkins.length - 1])
          sk.owner = c; sk.heights = null; sk.key = null
        }
        const sd = Math.floor(Math.abs(c.x * 0.37 + c.y * 0.61))
        const rotA = rh(sd, 3, 1) * TAU
        const under = livePools.filter((q) => (q.x - c.x) ** 2 + (q.y - c.y) ** 2 < (q.r + c.r * ART_A * 1.42) ** 2)
        const key = (Lc ? Math.round(line / 0.0004) : 'dry') + '/' + under.length + '/' + under.reduce((a, q) => a + q.x * 3 + q.y, 0).toFixed(0)
        if (key !== sk.key) { layMask(sk, c, rotA, Lc, T.seed, line, under); sk.key = key }
        skinLook(sk, c.x, c.y, c.r, 1, rotA, sd % SHAPES)
        const rem = c.dur - c.t
        const hotT = Math.min(1.6, c.dur * 0.4)
        const ramp = smooth(hotT, 0, rem)
        sk.U.uQuench = 1 - smooth(0, 0.3, c.t)
        sk.U.uHeat = Math.max(0.1 + 0.12 * (1 - smooth(0, 1.3, c.t)), ramp * (0.9 + 0.1 * Math.sin(t * 14)))
        sk.U.uErode = smooth(0.5, 0, rem)
        sk.U.uCover = 2
        // the pour: steam boiling off the splash, then a few wisps while it is fresh
        if (c.t < 3) {
          const sc = c.r / 130
          for (let i = 0; i < 16; i++) {
            const big = i < 10
            const life = big ? 1.7 : 1.5
            const born = big ? i * 0.03 : 0.5 + (i - 10) * 0.35
            const a = (c.t - born) / life
            if (a <= 0 || a >= 1) continue
            const ang = rh(i, sd, 21) * TAU, rr = c.r * (big ? 0.2 + 0.65 * rh(i, sd, 22) : 0.1 + 0.6 * rh(i, sd, 22))
            const px = c.x + Math.cos(ang) * rr, py = c.y + Math.sin(ang) * rr
            if (Lc && mantleHeightAt(Lc, T.seed, px, py) >= line && !under.some((q) => (q.x - px) ** 2 + (q.y - py) ** 2 < q.r * q.r)) continue   // no steam off dry rock
            const s = steam.next(A.steam[i % 3])
            const rise = 1 - (1 - a) * (1 - a)
            s.position.set(px + Math.cos(ang) * rise * 22 * sc, py - rise * (big ? 70 : 50) * sc)
            s.scale.set((big ? 1.15 : 0.7) * (0.6 + rise * 0.9) * sc)
            s.rotation = ang + a * 0.8
            s.alpha = (big ? 0.95 : 0.6) * Math.pow(1 - a, 1.2) * Math.min(1, a * 8)
          }
        }
      }

      // the kettle itself, for the newest pour: over the digger's shoulder, tipping, a stream of water
      // running down into a ring of splashing drops
      const pour = draw.length ? draw[draw.length - 1] : null
      if (pour && pour.t < 0.7) {
        const k = pour.t, p = run.player
        const tilt = 1.05 * smooth(0, 0.12, k) * (1 - smooth(0.42, 0.62, k))
        const pop = 1.35 * (0.7 + 0.3 * smooth(0, 0.06, k))
        const kx = p.x + 16, ky = p.y - 52
        const kt = tools.next(A.kettle)
        kt.position.set(kx, ky); kt.rotation = tilt; kt.scale.set(pop); kt.alpha = 1 - smooth(0.52, 0.7, k)
        if (tilt > 0.55) {
          const cs = Math.cos(tilt), sn = Math.sin(tilt)
          const sx = kx + (27 * cs + 6 * sn) * pop, sy = ky + (27 * sn - 6 * cs) * pop
          const ex = sx + 6, ey = p.y + 16, cx = sx + 9, cy = sy + (ey - sy) * 0.3
          const w = smooth(0.55, 0.85, tilt)
          for (const [wd, col, al] of [[7.5, C.ink, 0.9], [4.6, 0xcfe8e1, 1], [1.6, 0xffffff, 0.9]]) {
            topG.moveTo(sx, sy).quadraticCurveTo(cx, cy, ex, ey).stroke({ width: wd * w, color: col, alpha: al * kt.alpha, cap: 'round' })
          }
        }
        // the splash: a ring of drops thrown out over the lava, and the foam ring it leaves
        const ph = (k - 0.08) / 0.55
        if (ph > 0 && ph < 1) {
          const e = 1 - (1 - ph) * (1 - ph)
          groundG.circle(pour.x, pour.y, pour.r * (0.2 + 0.8 * e)).stroke({ width: 7 * (1 - ph) + 1, color: 0xf3ead6, alpha: 0.55 * (1 - ph) })
          const sd = Math.floor(Math.abs(pour.x * 0.37 + pour.y * 0.61))
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * TAU + rh(i, sd, 31) * 0.35, dd = pour.r * (0.15 + (0.6 + 0.35 * rh(i, sd, 32)) * e)
            const d = tools.next(A.water)
            d.position.set(pour.x + Math.cos(a) * dd, pour.y + Math.sin(a) * dd - Math.sin(Math.PI * ph) * (12 + 10 * rh(i, sd, 33)))
            d.scale.set((0.7 + 0.5 * rh(i, sd, 34)) * (1 - 0.45 * ph)); d.alpha = 1 - ph * ph
          }
        }
      }

      // ---- creatures: a stranded lava one encased by a creeping crust, a melting rock one slumping ----
      for (const s of strandSkins) s.used = false
      let ns = 0
      for (const e of run.enemies) {
        if (e._dead || !e.habitat || !onScreen(e.x, e.y, e.radius)) continue
        if (e.meltT > 0) {
          const k = Math.min(1, e.meltT / MANTLE_MELT_T), R = e.radius
          // the puddle it slumps into, spreading
          groundG.poly(blob(e.x, e.y + R * 0.35, R * (0.8 + 0.9 * k), 0.18, e.id, 16)).fill({ color: C.lavaDeep, alpha: 0.75 })
          groundG.poly(blob(e.x, e.y + R * 0.35, R * (0.6 + 0.75 * k), 0.2, e.id + 1, 16)).fill({ color: C.lavaHot, alpha: 0.85 })
          groundG.poly(blob(e.x - R * 0.15, e.y + R * 0.25, R * (0.25 + 0.3 * k), 0.25, e.id + 2, 10)).fill({ color: C.lavaGlow, alpha: 0.7 })
          // its body going soft from the feet up: a glowing slump climbing it, drips running down
          const top = e.y + R * (0.9 - 1.5 * k)
          const pts = []
          for (let i = 0; i <= 10; i++) {
            const u = i / 10, x = e.x + (u * 2 - 1) * R * (0.55 + 0.45 * k) * Math.sqrt(1 - (u * 2 - 1) ** 2 * 0.3)
            pts.push(x, top + Math.sin(u * Math.PI * 3 + e.id + t * 4) * R * 0.1 + (1 - Math.sin(u * Math.PI)) * R * 0.45)
          }
          for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; pts.push(e.x + Math.cos(a) * R * (0.6 + 0.5 * k), e.y + R * 0.95 + Math.sin(a) * R * 0.18) }
          topG.poly(pts).fill({ color: C.lava, alpha: 0.3 + 0.55 * k })
          for (let i = 0; i < 3; i++) {
            const u = (i + 0.5) / 3, dy = ((t * 1.4 + i * 0.37 + e.id * 0.1) % 1)
            topG.ellipse(e.x - R * 0.7 + u * R * 1.4, top + dy * (e.y + R - top), 2 + k * 1.6, 3 + k * 2.5).fill({ color: C.lavaHot, alpha: 0.9 * (1 - dy * 0.6) })
          }
        }
        if (e.strandT > 0 && ns < 24) {
          const k = Math.min(1, e.strandT / MANTLE_STRAND_STUCK_T)
          const dying = smooth(MANTLE_STRAND_DIE_T - 1.5, MANTLE_STRAND_DIE_T, e.strandT)
          let sk = strandSkins[ns] ?? (strandSkins.push(makeSkin(strandLayer, false)), strandSkins[ns])
          ns++
          skinLook(sk, e.x, e.y + e.radius * 0.1, e.radius * 1.55, 0.72, 0, e.id % SHAPES)
          sk.U.uCover = 0.12 + 0.55 * k + 0.5 * dying   // creeping in from its edge, then encasing it
          sk.U.uHeat = 0.08 + dying * (0.75 + 0.25 * Math.sin(t * 16))
          sk.U.uErode = 0; sk.U.uQuench = 0
          sk.U.uAlpha = 0.93
        }
      }
      for (let i = ns; i < strandSkins.length; i++) strandSkins[i].mesh.visible = false

      // ---- the bellows' wave: a curling crest of lava rolling out, splashing ahead of it ----
      for (const n of run.novas ?? []) {
        if (n.look !== 'lavaWave' || !onScreen(n.x, n.y, n.maxR)) continue
        const k = 1 - Math.max(0, n.life / (n.lifeMax || 1))
        const R = Math.max(10, n.r || n.maxR * k)
        const half = (n.arc ?? 2) / 2, m = 28
        const fade = 1 - smooth(0.75, 1, k)
        const W = 36 * (1 - 0.3 * k)
        const sdw = Math.floor(Math.abs(n.x + n.y))
        // a band between radii r0(u) and r1(u) along the arc (u 0..1), both pinched to R at its two ends
        const band = (r0, r1, col, al) => {
          const pts = []
          const at = (u, rf) => {
            const a = n.angle - half + 2 * half * u, rr = R - (R - rf(u)) * Math.pow(Math.sin(Math.PI * u), 0.6)
            pts.push(n.x + Math.cos(a) * rr, n.y + Math.sin(a) * rr)
          }
          for (let i = 0; i <= m; i++) at(i / m, r1)
          for (let i = m; i >= 0; i--) at(i / m, r0)
          topG.poly(pts).fill({ color: col, alpha: al * fade })
        }
        const wob = (u, f) => Math.sin(u * 17 + t * 7 + sdw) * f
        // the sheet it leaves behind it, thinning
        band(() => Math.max(0, R - W * 3.2), (u) => R - W * 0.6 + wob(u, 2), C.lavaDeep, 0.35)
        band(() => Math.max(0, R - W * 1.9), (u) => R - W * 0.4 + wob(u, 2), C.lava, 0.55)
        // the crest: a fat roll of lava, its back lit, a dark wet shadow under its curling lip
        band((u) => R - W + wob(u, 3), (u) => R + 2 + wob(u, 2), C.lava, 1)
        band((u) => R - W * 0.75 + wob(u, 3), (u) => R - W * 0.35 + wob(u, 2), C.lavaHot, 0.95)
        band((u) => R - W * 0.62 + wob(u, 2), (u) => R - W * 0.48 + wob(u, 1.5), C.lavaGlow, 0.85)
        band((u) => R - 1, (u) => R + 5, C.lavaDeep, 0.8)
        // its front edge inked, like a cel of a breaking wave
        {
          let first = true
          for (let i = 0; i <= m; i++) {
            const u = i / m, a = n.angle - half + 2 * half * u, rr = R + 1.5 + wob(u, 2) * Math.pow(Math.sin(Math.PI * u), 0.6)
            const x = n.x + Math.cos(a) * rr, y = n.y + Math.sin(a) * rr
            if (first) { topG.moveTo(x, y); first = false } else topG.lineTo(x, y)
          }
          topG.stroke({ width: 2.4, color: C.ink, alpha: 0.9 * fade, cap: 'round', join: 'round' })
        }
        // the curls: tongues of lava breaking forward over the front, rolling along it
        const span = 2 * half * R, nc = Math.max(3, Math.round(span / 30))
        for (let i = 0; i < nc; i++) {
          const u = (i + 0.5 + ((t * 0.7) % 1) - 0.5) / nc
          if (u <= 0.05 || u >= 0.95) continue
          const taper = Math.pow(Math.sin(Math.PI * u), 0.7)
          const a = n.angle - half + 2 * half * u
          const cl = tools.next(A.curl[i % 3])
          cl.position.set(n.x + Math.cos(a) * (R - 2), n.y + Math.sin(a) * (R - 2))
          cl.rotation = a; cl.scale.set((0.75 + 0.7 * taper) * (0.9 + 0.2 * rh(i, sdw, 7)) * (1 - 0.2 * k)); cl.alpha = fade
        }
        // splashes: inked drops thrown ahead of the crest, arcing and falling
        for (let i = 0; i < 12; i++) {
          const u = 0.06 + 0.88 * rh(i, sdw, 4)
          const ph = (k * 1.6 + rh(i, sdw, 5)) % 1
          const a = n.angle - half + 2 * half * u
          const d = R + 8 + ph * 30, lift = Math.sin(Math.PI * ph) * 14
          const dr = tools.next(A.lava)
          dr.position.set(n.x + Math.cos(a) * d, n.y + Math.sin(a) * d - lift)
          dr.scale.set((0.55 + 0.5 * rh(i, sdw, 6)) * (1 - ph * 0.5)); dr.alpha = fade * (1 - ph * ph)
        }
      }

      // ---- melt and crumble bursts ----
      for (const b of bursts) b.t += dt
      while (bursts.length && bursts[0].t > 0.8) bursts.shift()
      for (const b of bursts) {
        if (!onScreen(b.x, b.y, b.r * 3)) continue
        const k = b.t / 0.8
        if (b.kind === 'melt') {
          groundG.poly(blob(b.x, b.y, b.r * (1 + 1.2 * k), 0.25, b.seed)).fill({ color: C.lava, alpha: 0.8 * (1 - k) })
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * TAU + b.seed, d = b.r * (0.5 + 2.2 * k)
            topG.circle(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d - 18 * Math.sin(Math.PI * k), 3.2 * (1 - k) + 1).fill({ color: C.lavaHot, alpha: 1 - k })
          }
        } else {
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU + b.seed, d = b.r * (0.4 + 2.0 * k), s = (1 - k) * 5 + 1.5
            const x = b.x + Math.cos(a) * d, y = b.y + Math.sin(a) * d
            topG.poly([x - s, y, x, y - s * 0.8, x + s, y + s * 0.3]).fill({ color: i % 2 ? C.basaltHi : C.basalt, alpha: 1 - k * 0.8 })
          }
          groundG.circle(b.x, b.y, b.r * (0.8 + k)).fill({ color: C.rockScorch, alpha: 0.3 * (1 - k) })
        }
      }

      // ---- the basalt raft under the player: lava eating in over its rim as it sinks ----
      const p = run.player
      if (p.afloat && p.boatMax > 0) {
        if (!boatSkin) boatSkin = makeSkin(boatLayer, false)
        const f = Math.max(0, Math.min(1, p.boatT / p.boatMax))   // 1 fresh, 0 gone under
        const s = 1 - f
        const wob = f < 0.3 ? Math.sin(t * 22) * (0.3 - f) * 5 : 0
        const bob = Math.sin(t * 3.1) * 1.2
        const x = p.x + wob, y = p.y + 18 + bob
        // the lava riding up round it (it sits IN the lava, not on it), and its wake
        boatUnderG.ellipse(x, y + 3, 46, 27).fill({ color: C.lavaDeep, alpha: 0.45 })
        for (let i = 0; i < 2; i++) {
          const ph = (t * 0.7 + i * 0.5) % 1
          boatUnderG.ellipse(x, y + 2, 44 + ph * 24, 25 + ph * 13).stroke({ width: 3 * (1 - ph), color: C.lavaGlow, alpha: 0.5 * (1 - ph) })
        }
        skinLook(boatSkin, x, y, 41, 0.62, Math.sin(t * 1.3) * 0.05, 1)
        boatSkin.U.uHeat = 0.12 + 0.88 * smooth(0.35, 1, s) * (0.88 + 0.12 * Math.sin(t * 14))
        boatSkin.U.uErode = 0.55 * smooth(0.3, 1, s)
        boatSkin.U.uCover = 2; boatSkin.U.uQuench = 0; boatSkin.U.uAlpha = 1
      } else if (boatSkin) boatSkin.mesh.visible = false
      steam.end(); tools.end()
    },
  }
}
