// THE MANTLE'S MECHANIC TELLS (render-only; src/toon.js calls in).
// Two manners, as in the cartoons: what is PART OF THE FLOOR (a crust's skin, a pool's lava) is painted
// like the floor, with hard inked cracks and rims; every OBJECT and every effect (the kettle, its
// stream and steam, the hammer, chunks, dust, the wave, blobs, the raft) is a cel: flat two- or
// three-tone colour, a thick-thin ink line, a paper edge where it is a solid thing, and timed with
// anticipation, smears and squash.
//   run.quenchCrusts   Quench Kettle's crust: one organic skin of cooled basalt, laid only where it covers
//                      lava, a faint ember line in its inked cracks. Poured: molten orange going dark
//                      under puffs of steam. Its last second: the cracks pulse yellow, the plates bob,
//                      and the plates at its edge break off and sink one by one, edge inward.
//   run.lavaPools      Crack Hammer's pools: inked cracks wedge out from the stamp, the rock yawns into a
//                      pool with an inked rim and the shore's bubbled lip; grey plates close it, rim in
//   run.novas          look 'lavaWave' (Lava Bellows): stacked inked crests, a lip bulging and curling
//                      forward, blobs thrown ahead that land as splats, a scorched streak behind
//   run.player         boatT / boatMax / afloat: the basalt raft, the lava eating in over its rim and up
//                      over your boots as it sinks, chunks breaking off at the end
//   enemies            strandT (a lava creature on dry rock: a crust creeps in over it), meltT (a rock
//                      creature under the tide: it slumps, sweats, drips)
//   events             melt (smoke, a splat) and crumble (chunks, dust); both return true from event()
// The tools are drawn off the fields above: the kettle off the newest crust's t, the hammer off each
// pool's t (its swing is the pool's first tenth of a second), so nothing new crosses the sim boundary.
//
// THE CRUST MATERIAL (crust, raft, a stranded creature's shell): one quad and one shader over a baked
// atlas of 3 shapes holding per texel the distance to the nearest seam (r), the relief (g), the depth
// into the shape from its edge (b) and the plate's sinking order (a: edge plates first). A crust over
// lava is masked by a tiny texture of where the ground under it is lava, re-laid only when the tide's
// line or the pools under it move. ?crust=a|c picks the pattern (a cracked plates, c basalt slabs).
import { Container, Graphics, Mesh, MeshGeometry, Shader, UniformGroup, BufferImageSource, CanvasSource, Texture, Sprite } from 'pixi.js'
import { PAL, TAU, hexNum, mkCanvas } from './palette.js'
import { resetXf, ell, polar, tube, qb, line, cel, eye, drop } from './brush.js'
import { mantleHeightAt } from '../sim.js'
import { MANTLE_STRAND_STUCK_T, MANTLE_STRAND_DIE_T, MANTLE_MELT_T, DRAW_CAPS } from '../config.js'

const C = {
  ink: hexNum(PAL.ink), paper: hexNum(PAL.paper), basalt: hexNum(PAL.basalt),
  lavaDeep: hexNum(PAL.lavaDeep), lava: hexNum(PAL.lava), lavaHot: hexNum(PAL.lavaHot), lavaGlow: hexNum(PAL.lavaGlow),
  lavaWhite: hexNum(PAL.lavaWhite), trough: 0x5a1a12, scorch: 0x221520,
}
const CRUST_DEFAULT = 'c'
const VARIANT = (() => {
  try { const v = new URLSearchParams(location.search).get('crust'); return v === 'a' || v === 'c' ? v : CRUST_DEFAULT } catch { return CRUST_DEFAULT }
})()
// per pattern: the seams' half-width cooled, and how much they open at full heat (normalised to the radius)
const SEAMS = { a: [0.007, 0.024], c: [0.012, 0.034] }

const ART_N = 256          // texels per shape side
const ART_A = 1.2          // the art quad's half-size, in crust radii
const SHAPES = 3
const MASK_N = 24          // nodes per side of a crust's lava mask
const MASK_SOFT = 6        // px: how soft the crust's edge is where the lava meets the shore
const SINK_T = 1.0         // s: a crust's last second, when its plates break off
const HOT_T = 1.6          // s: the cracks start to brighten

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
const clamp01 = (x) => Math.max(0, Math.min(1, x))

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
// seeds of a jittered grid of spacing sp, as flat [x, y, tilt, order] quads; order: when the plate sinks
// (0 first), the plates whose seed is nearest the shape's edge going first
function seedsOf(sp, s, k) {
  const out = []
  const n = Math.ceil(ART_A / sp) + 1
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    const x = (i + (j & 1) * 0.5 + (rh(i, j, s) - 0.5) * 0.7) * sp, y = (j + (rh(i, j, s + 9) - 0.5) * 0.7) * sp
    const depth = 1 - hyp(x, y) / edgeR(Math.atan2(y, x), k)
    out.push(x, y, rh(i, j, s + 17) - 0.5, clamp01(depth * 1.25 + (rh(i, j, s + 23) - 0.5) * 0.18))
  }
  out.n = n; out.sp = sp
  return out
}
// the atlas: SHAPES rows of ART_N^2 texels (r seam distance x4, g relief, b depth into the shape, a order)
function bakeAtlas(variant) {
  const N = ART_N, data = new Uint8Array(N * N * SHAPES * 4)
  const H = new Float32Array(N * N), D = new Float32Array(N * N), S = new Float32Array(N * N), O = new Float32Array(N * N)
  const step = (2 * ART_A) / N
  for (let k = 0; k < SHAPES; k++) {
    const sd = 101 + k * 31 + variant.charCodeAt(0) * 7
    const seeds = seedsOf(variant === 'c' ? 0.6 : 0.36, sd, k)
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -ART_A + (i + 0.5) * step, y = -ART_A + (j + 0.5) * step
      const s = 1 - hyp(x, y) / edgeR(Math.atan2(y, x), k)
      // the seams: a Voronoi of warped space, distance to the nearest bisector; only the seeds of the
      // 5x5 grid cells round it can be nearest (the jitter is under a cell)
      const qx = x + 0.13 * (fbm(x * 3 + 5, y * 3, sd) - 0.5), qy = y + 0.13 * (fbm(x * 3, y * 3 + 9, sd + 3) - 0.5)
      let d1 = 9, d2 = 9, tl = 0, ord = 0
      const sn = seeds.n, sw = 2 * sn + 1, j0 = Math.round(qy / seeds.sp)
      for (let jj = Math.max(-sn, j0 - 2); jj <= Math.min(sn, j0 + 2); jj++) {
        const i0 = Math.round(qx / seeds.sp - (jj & 1) * 0.5)
        for (let ii = Math.max(-sn, i0 - 2); ii <= Math.min(sn, i0 + 2); ii++) {
          const m = ((jj + sn) * sw + ii + sn) * 4
          const dd = hyp(qx - seeds[m], qy - seeds[m + 1])
          if (dd < d1) { d2 = d1; d1 = dd; tl = seeds[m + 2]; ord = seeds[m + 3] } else if (dd < d2) d2 = dd
        }
      }
      const d = (d2 - d1) / 2
      let h = variant === 'c'
        // slabs: flat tops tipped this way and that, steep broken edges
        ? smooth(0, 0.045, d) * 0.8 + tl * 0.5 * (x * 0.6 + y * 0.8) + fbm(x * 6, y * 6, sd + 7) * 0.18
        // plates: domed, sagging into their seams
        : smooth(0, 0.13, d) * 0.75 + tl * 0.12 + fbm(x * 7, y * 7, sd + 7) * 0.15
      // hairline cracks crazing the plates and slabs (relief only: they never glow)
      h -= 0.3 * (1 - smooth(0, 0.01, worley(qx, qy, variant === 'c' ? 0.2 : 0.15, sd + 40))) * smooth(0.01, 0.04, d)
      const o = j * N + i
      H[o] = h; D[o] = d; S[o] = s; O[o] = ord
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const o = j * N + i
      const a = H[Math.max(0, j - 1) * N + Math.max(0, i - 1)], b = H[Math.min(N - 1, j + 1) * N + Math.min(N - 1, i + 1)]
      const rel = Math.max(-1, Math.min(1, (b - a) * -4.2))   // lit from the upper left
      const w = ((k * N + j) * N + i) * 4
      data[w] = Math.round(Math.min(1, D[o] * 4) * 255)
      data[w + 1] = Math.round((rel * 0.5 + 0.5) * 255)
      data[w + 2] = Math.round(clamp01((S[o] + 0.25) / 1.25) * 255)
      data[w + 3] = Math.round(O[o] * 255)
    }
  }
  return new BufferImageSource({ resource: data, width: N, height: N * SHAPES, format: 'rgba8unorm', scaleMode: 'linear', alphaMode: 'no-premultiply-alpha' })
}

const QUAD_VERT = `in vec2 aPosition;
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
// shared GLSL: a value noise from a hash (the paper's grain, without a texture)
const GLSL_NOISE = `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnz(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float bell(float x, float c, float w) { float q = (x - c) / w; return exp(-q * q); }`
const CRUST_FRAG = `precision highp float;
in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uArt;
uniform sampler2D uMask;
uniform float uRow;     // which of the atlas's shapes
uniform float uHeat;    // 0 cooled (a faint ember line) .. 1 the cracks pulsing bright
uniform float uErode;   // 0 whole .. 1 the lava eaten in from the rim (the raft)
uniform float uSink;    // 0 .. 1.1: its plates breaking off and sinking, edge plates first
uniform float uBob;     // 0 .. 1: the plates bobbing and tipping in the lava
uniform float uCover;   // how far the skin has crept in from its edge (>= 1.1: all of it)
uniform float uQuench;  // 1 the moment it is poured (still molten) .. 0
uniform float uSeam;    // the seams' half-width cooled
uniform float uGrow;    // and how much more at full heat
uniform float uInk;     // 1: an object (the raft): an ink line round its edge and a paper margin
uniform float uTime;
uniform float uAlpha;
uniform float uMaskN;
${GLSL_NOISE}
void main() {
  vec4 a = texture(uArt, vec2(vUV.x, (clamp(vUV.y, 0.002, 0.998) + uRow) / 3.0));
  float d = a.r * 0.25, rel = a.g * 2.0 - 1.0, s = a.b * 1.25 - 0.25, ord = a.a;
  float n = vnz(vUV * 46.0 + uRow * 17.0) * 0.6 + vnz(vUV * 13.0) * 0.4;
  vec2 muv = vUV * (uMaskN - 1.0) / uMaskN + 0.5 / uMaskN;
  float lavaUnder = texture(uMask, muv).r;
  float se = s + (n - 0.5) * 0.04 - uErode * 0.75;
  // this plate breaking off: it tips, glows round its edge, goes under
  float sp = clamp((uSink - ord) / 0.22, 0.0, 1.0);
  rel = clamp(rel + uBob * 0.55 * sin(uTime * 7.0 + ord * 53.0) + sp * 0.6 * sin(ord * 91.0), -1.0, 1.0);
  float cov = 1.0 - smoothstep(uCover - 0.04, uCover + 0.02, s + (n - 0.5) * 0.12);
  float w = uSeam + uGrow * uHeat + sp * 0.2;
  float dn = d + (n - 0.5) * 0.008;
  float seam = 1.0 - smoothstep(w, w + 0.004, dn);
  // the skin: flat basalt in three tones, lit from the upper left, the paper's grain in it
  vec3 col = rel > 0.25 ? vec3(0.36, 0.3, 0.35) : rel < -0.25 ? vec3(0.1, 0.075, 0.095) : vec3(0.2, 0.155, 0.19);
  col *= 0.88 + 0.24 * n;
  // the heat bleeding out of the seams into the skin round them
  float warm = exp(-max(0.0, dn - w) / (0.01 + 0.04 * uHeat)) * (0.12 + 0.88 * uHeat);
  col = mix(col, vec3(0.5, 0.15, 0.09), warm * 0.5);
  // the hot rim where it meets the lava
  float rim = (1.0 - smoothstep(0.0, 0.04 + 0.08 * uHeat, se)) * (1.0 - uInk);
  col = mix(col, vec3(0.86, 0.38, 0.13), rim * 0.8);
  // the cracks: an ink line either side, an ember line in them that brightens to a yellow core
  vec3 lavaC = mix(vec3(0.38, 0.07, 0.05), vec3(0.97, 0.52, 0.15), clamp(uHeat * 1.15, 0.0, 1.0));
  float core = 1.0 - smoothstep(0.0, w * 0.45 + 0.0015, dn);
  lavaC = mix(lavaC, mix(vec3(0.85, 0.32, 0.1), vec3(1.0, 0.9, 0.45), uHeat), core);
  float inkB = smoothstep(w - 0.001, w + 0.002, dn) * (1.0 - smoothstep(w + 0.009, w + 0.013, dn));
  col = mix(col, vec3(0.11, 0.07, 0.05), inkB * 0.9);
  col = mix(col, lavaC, seam);
  // just poured: still molten, darkening fast
  col = mix(col, mix(vec3(0.7, 0.18, 0.08), vec3(1.0, 0.62, 0.22), uQuench), uQuench * 0.9);
  // a plate going under: it reddens and is swallowed
  col = mix(col, vec3(0.55, 0.13, 0.07), sp * 0.6);
  float plate = 1.0 - smoothstep(0.65, 0.95, sp);
  // the raft: an ink line round its edge and the paper margin outside it
  float edgeInk = uInk * (1.0 - smoothstep(0.03 + 0.025 * max(0.0, rel), 0.045 + 0.025 * max(0.0, rel), se));
  col = mix(col, vec3(0.11, 0.07, 0.05), edgeInk * step(0.0, se));
  float paper = uInk * (1.0 - step(0.0, se)) * smoothstep(-0.075, -0.06, se);
  col = mix(col, vec3(0.95, 0.9, 0.78), paper);
  float al = max(smoothstep(0.0, 0.02, se) * plate, paper) * cov * lavaUnder * uAlpha;
  finalColor = vec4(col * al, al);
}`

// ---------------------------------------------------------------- THE POOL MATERIAL
// A Crack Hammer pool, part of the floor: lava marbled like the tide's, an inked rim (thick on the
// shadow side), the rock lip lit by it, and, closing, grey plates sliding in from the rim. Its rim is
// a sum of three harmonics (uPh), the same function poolRim() gives the bubbles on its lip.
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
      data[o + ch] = Math.round((tv(u, v, P, ch * 13 + 1) * 0.55 + tv(u * 2, v * 2, P * 2, ch * 13 + 2) * 0.3 + tv(u * 4, v * 4, P * 4, ch * 13 + 3) * 0.15) * 255)
    }
  }
  return new BufferImageSource({ resource: data, width: N, height: N, format: 'rgba8unorm', scaleMode: 'linear', addressMode: 'repeat', alphaMode: 'no-premultiply-alpha' })
}
const POOL_A = 1.5   // the pool quad's half-size, in pool radii (room for its lip and scorch)
const poolRim = (a, p) => 0.92 + 0.07 * Math.sin(3 * a + p[0]) + 0.05 * Math.sin(5 * a + p[1]) + 0.035 * Math.sin(7 * a + p[2])
const POOL_FRAG = `precision highp float;
in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uNoise;
uniform float uOpen;    // 0 shut .. 1 a full pool
uniform float uClose;   // 0 open .. 1 plated over
uniform float uTime;
uniform float uSeed;
uniform vec3 uPh;
${GLSL_NOISE}
void over(inout vec4 acc, vec3 c, float a) { acc = vec4(c * a + acc.rgb * (1.0 - a), a + acc.a * (1.0 - a)); }
vec2 hh2(vec2 p) { return vec2(h21(p), h21(p + 17.3)); }
void main() {
  vec2 p = (vUV * 2.0 - 1.0) * ${POOL_A.toFixed(2)};
  float rho = length(p), ang = atan(p.y, p.x);
  vec4 nP = texture(uNoise, p * 0.33 + uSeed * 1.3);
  vec4 nF = texture(uNoise, p * 0.45 + vec2(uTime * 0.035, -uTime * 0.025) + uSeed);
  float R = uOpen * (0.92 + 0.07 * sin(3.0 * ang + uPh.x) + 0.05 * sin(5.0 * ang + uPh.y) + 0.035 * sin(7.0 * ang + uPh.z));
  float rimD = rho - R;
  vec4 acc = vec4(0.0);
  // the scorched rock round it
  float scorch = (1.0 - smoothstep(R * 0.9, R * 1.3 + 0.2, rho + (nP.r - 0.5) * 0.25)) * uOpen * 0.38;
  over(acc, vec3(0.12, 0.08, 0.13), scorch);
  // the rock lip, lit from the lava below it
  float lip = (1.0 - smoothstep(0.05, 0.13 + 0.05 * nP.g, rimD)) * step(0.01, uOpen);
  over(acc, mix(vec3(0.42, 0.26, 0.34), vec3(0.88, 0.45, 0.22), 1.0 - smoothstep(0.0, 0.1, rimD)), lip);
  // the ink round the rim: thick on the shadow side (lower right), thin toward the light
  float iw = 0.025 + 0.035 * max(0.0, cos(ang - 0.98));
  float inkR = (1.0 - smoothstep(iw, iw + 0.012, rimD)) * smoothstep(-0.012, 0.0, rimD) * step(0.01, uOpen);
  over(acc, vec3(0.11, 0.07, 0.05), inkR);
  // the lava: marbled like the tide's, deep at the edge, a hot heart, churning
  float inside = 1.0 - smoothstep(-0.012, 0.0, rimD);
  float mm = mix(nF.g, nF.b, 0.5);
  vec3 lc = vec3(0.94, 0.49, 0.14);
  lc = mix(lc, vec3(0.77, 0.2, 0.09), smoothstep(0.5, 0.32, mm) * 0.85);
  lc = mix(lc, vec3(0.99, 0.73, 0.21), smoothstep(0.55, 0.68, mm) * 0.9);
  float u = rho / max(R, 1e-3);
  lc = mix(lc, vec3(0.6, 0.13, 0.07), smoothstep(0.7, 1.0, u) * 0.7);
  // closing: grey basalt plates sliding in from the rim, an ink line round each and lava between
  if (uClose > 0.0) {
    vec2 g = p * 3.2 + uSeed * 7.0, n0 = floor(g), f0 = fract(g);
    float d1 = 9.0, d2 = 9.0; vec2 cc = vec2(0.0);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j)), r = o + 0.15 + 0.7 * hh2(n0 + o) - f0;
      float dd = dot(r, r);
      if (dd < d1) { d2 = d1; d1 = dd; cc = n0 + o + 0.15 + 0.7 * hh2(n0 + o); } else if (dd < d2) d2 = dd;
    }
    float sd = (sqrt(d2) - sqrt(d1)) * 0.5;
    float cu = length((cc - uSeed * 7.0) / 3.2) / max(R, 1e-3);
    float on = smoothstep(1.06 - uClose * 1.25, 1.0 - uClose * 1.25, cu);
    float slide = clamp((cu - (1.0 - uClose * 1.25)) * 4.0, 0.0, 1.0);
    vec3 pc = mix(vec3(0.44, 0.4, 0.44), vec3(0.6, 0.56, 0.6), step(0.5, h21(cc)));
    pc *= 0.85 + 0.25 * vnz(p * 20.0);
    pc = mix(pc, vec3(0.11, 0.07, 0.05), 1.0 - smoothstep(0.03, 0.05, sd));
    float plate = on * smoothstep(0.012, 0.02, sd) * (0.6 + 0.4 * slide);
    lc = mix(lc, pc, step(0.5, plate) * on);
  }
  over(acc, lc, inside);
  finalColor = acc;
}`

// ---------------------------------------------------------------- THE CELS (bake once)
// Drawn with the cast's own brush, flat (no dabs, no airbrushed shade), then given a paper margin.
const BRES = 3
function paperEdge(cv, w) {
  if (!(w > 0)) return cv
  const g = mkCanvas(cv.width, cv.height), c = g.getContext('2d')
  for (let i = 0; i < 20; i++) { const a = (i / 20) * TAU; c.drawImage(cv, Math.cos(a) * w, Math.sin(a) * w) }
  c.globalCompositeOperation = 'source-in'; c.fillStyle = PAL.paper; c.fillRect(0, 0, g.width, g.height)
  c.globalCompositeOperation = 'source-over'; c.drawImage(cv, 0, 0)
  return g
}
function bake(w, h, ax, ay, paint, paper = 1.5) {
  const cv = mkCanvas(w * BRES, h * BRES), ctx = cv.getContext('2d')
  ctx.scale(BRES, BRES); ctx.translate(w * ax, h * ay)
  resetXf(); paint(ctx); resetXf()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const tex = new Texture({ source: new CanvasSource({ resource: paperEdge(cv, paper * BRES), resolution: BRES }) })
  return { tex, ax, ay }
}
const FLAT = { shade: null, dabs: 0 }
const flat = (c, pts, col, ink) => cel(c, pts, col, { ...FLAT, ink })
// a cloud's outline: the outer silhouette of overlapping round lobes [x, y, r]
function lobes(L, n = 72) {
  return polar(0, 0, (t) => {
    const ux = Math.cos(t), uy = Math.sin(t)
    let best = 0
    for (const [x, y, r] of L) {
      const b = x * ux + y * uy, q = r * r - (x * x + y * y - b * b)
      if (q >= 0) best = Math.max(best, b + Math.sqrt(q))
    }
    return best
  }, n)
}
const COPPER = '#d07a3a', COPPER_LO = '#8e4220', COPPER_HI = '#f2b779'
// the Quench Kettle: a fat copper kettle with a face, spout to the right (+x); the spout's tip is KETTLE_TIP
const KETTLE_TIP = [48, -15]
function paintKettle() {
  return bake(104, 86, 0.42, 0.56, (c) => {
    flat(c, tube(qb([-17, -10], [0, -44], [17, -10]), 4.2), PAL.inkSoft, 1.4)
    flat(c, tube(qb([18, 12], [38, 15], [46, -12]), 11, 5), COPPER, 2.2)
    flat(c, ell(46.5, -13, 4.2, 2.6, -0.5, 20), PAL.ink, 0)
    flat(c, ell(0, 8, 25, 21, 0, 48), COPPER_LO, 2.4)
    flat(c, ell(-3, 5, 21, 17, 0, 44), COPPER, 0)
    flat(c, ell(-9, -2, 7, 4.5, -0.5, 24), COPPER_HI, 0)
    flat(c, ell(0, -11, 16, 5.5, 0, 36), '#e9a466', 1.8)
    flat(c, ell(0, -17, 5, 4, 0, 24), PAL.inkSoft, 1.2)
    eye(c, -8, 7, 4.4, 5.6, 0.5, 0.2)
    eye(c, 5, 7, 4.4, 5.6, 0.5, 0.2)
    line(c, [[-6, 17], [0, 20], [7, 16]], 1.3, {})
    flat(c, ell(-15, 15, 3.4, 2.2, 0, 16), PAL.blush, 0)
  })
}
// the Crack Hammer: a fat red mallet with a face, a bent rubber-hose handle, drawn lying along +x with
// the head at the left and the hand's end (the pivot) at the origin; HAMMER_L from the pivot to the head
const HAMMER_L = 82
function paintHammer() {
  return bake(150, 72, 0.88, 0.5, (c) => {
    flat(c, tube(qb([-66, 0], [-34, -9], [0, 0]), 4.6), PAL.wood, 1.8)
    flat(c, tube([[-14, -1], [0, 0]], 5.6), PAL.shorts, 1.4)
    // the head: a barrel, its striking faces lighter, two iron bands
    flat(c, [[-104, -22], [-62, -22], [-58, -16], [-58, 16], [-62, 22], [-104, 22], [-108, 16], [-108, -16]], '#c8322a', 2.4)
    flat(c, [[-104, -18], [-66, -18], [-66, -9], [-104, -9]], '#e0563e', 0)
    flat(c, ell(-108, 0, 4.5, 21, 0, 28), '#e9b98a', 1.8)
    flat(c, ell(-58, 0, 4.5, 21, 0, 28), '#e9b98a', 1.8)
    flat(c, [[-98, -23], [-93, -23], [-93, 23], [-98, 23]], PAL.iron, 1.2)
    flat(c, [[-73, -23], [-68, -23], [-68, 23], [-73, 23]], PAL.iron, 1.2)
    eye(c, -87, -6, 4.2, 5.4, -0.5, 0.3)
    eye(c, -79, -6, 4.2, 5.4, -0.5, 0.3)
    line(c, [[-90, 9], [-83, 6], [-76, 10]], 1.4, {})
    line(c, [[-92, -14], [-85, -12]], 1.1, {})
    line(c, [[-81, -12], [-74, -14]], 1.1, {})
  })
}
// an impact: a hard yellow star, white at its heart
function paintStar() {
  return bake(110, 110, 0.5, 0.5, (c) => {
    const spikes = (r0, r1, k) => polar(0, 0, (t) => { const f = (t / TAU) * 14; const u = f - Math.floor(f); return r0 + (r1 - r0) * (1 - Math.abs(u * 2 - 1)) * (0.8 + 0.2 * Math.sin(t * 5 + k)) }, 112)
    flat(c, spikes(24, 50, 0), PAL.lavaGlow, 2.4)
    flat(c, spikes(13, 27, 2), PAL.white, 0)
  }, 0)
}
// a puff: a round cel cloud of lobes, a base tone and a lit one, inked, with a curl of ink in it
function paintPuff(v, base, lit) {
  return bake(72, 64, 0.5, 0.55, (c) => {
    const L = []
    const n = 4 + (v % 3)
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + v; L.push([Math.cos(a) * 13, Math.sin(a) * 10, 10 + rh(i, v, 3) * 6]) }
    L.push([0, 0, 15])
    flat(c, lobes(L), base, 1.8)
    flat(c, lobes(L.map(([x, y, r]) => [x - 2.5, y - 3, r * 0.78])), lit, 0)
    line(c, [[-6, 4], [-2, 7], [3, 6]], 0.9, {})
  }, 0)
}
// a rock chunk (or a basalt one): an angular lump, a lit top facet
function paintChunk(v, base, top) {
  return bake(30, 30, 0.5, 0.5, (c) => {
    const P = polar(0, 0, (t) => 7 + 3.5 * rh(Math.floor(t * 1.1), v, 4), 7)
    flat(c, P, base, 1.6)
    flat(c, P.map(([x, y]) => [x * 0.6 - 1.5, y * 0.55 - 2]), top, 0)
  })
}
// a teardrop of lava or water: tip toward -y (rotate it to its flight)
function paintDrop(base, lit) {
  return bake(24, 30, 0.5, 0.55, (c) => {
    flat(c, drop(0, 0, 6.5, 13), base, 1.5)
    flat(c, ell(-1.8, 2.5, 1.8, 2.6, 0.3, 16), lit, 0)
  }, 0)
}
// a splat of lava where a blob lands
function paintSplat(v) {
  return bake(56, 44, 0.5, 0.5, (c) => {
    // a flattened puddle with a few round lumps where it spread, and two drops thrown clear of it
    const P = polar(0, 0, (t) => 11 * (1 + 0.16 * Math.sin(t * 4 + v) + 0.1 * Math.sin(t * 7 + v * 2)), 60)
    flat(c, P.map(([x, y]) => [x * 1.45, y]), PAL.lava, 1.6)
    flat(c, ell(21, -7, 2.6, 2.2, 0, 16), PAL.lava, 1.2)
    flat(c, ell(-22, 6, 2, 1.7, 0, 16), PAL.lava, 1.2)
    flat(c, ell(-2, -1.5, 7, 4, 0, 24), PAL.lavaHot, 0)
    flat(c, ell(-4, -3, 2.6, 1.6, 0, 16), PAL.lavaWhite, 0)
  }, 0)
}
// the crown of a splash where the kettle's stream lands
function paintCrown() {
  // a cartoon splash crown: a ring of round-ended tongues of water thrown up, a white heart
  return bake(64, 50, 0.5, 0.72, (c) => {
    const T = [[-20, -4, -2.2], [-11, -12, -1.9], [0, -15, -1.57], [11, -12, -1.25], [20, -4, -0.9]]
    for (const [x, y, a] of T) flat(c, drop(x, y, 4.6, 11), '#8cc6d2', 1.6)
    flat(c, ell(0, 4, 23, 8, 0, 36), '#8cc6d2', 1.8)
    flat(c, ell(-2, 2.5, 15, 4.5, 0, 28), '#eef9f8', 0)
  }, 0)
}
// a curl breaking over the wave's lip, seen from above: a tongue of lava rolling forward (+x) and hooking
// back over its own dark hollow; three of them, of different builds
function paintCurl(v) {
  return bake(48, 44, 0.42, 0.5, (c) => {
    const turn = [4.4, 5.0, 3.8][v], R0 = [11, 13, 9.5][v], thin = [0.45, 0.4, 0.5][v]
    const hook = []
    for (let i = 0; i <= 28; i++) { const a = -2.6 + (i / 28) * turn, r = R0 * (1 - (i / 28) * 0.35); hook.push([Math.cos(a) * r, Math.sin(a) * r * 0.9]) }
    for (let i = 28; i >= 0; i--) { const a = -2.6 + (i / 28) * turn, r = R0 * thin * (1 - (i / 28) * 0.5); hook.push([Math.cos(a) * r - 0.6, Math.sin(a) * r * 0.9 + 0.8]) }
    flat(c, ell(-0.5, 0.8, R0 * 0.5, R0 * 0.44, 0, 24), '#7a1c10', 0)
    flat(c, hook, PAL.lavaHot, 1.8)
    const hi = []
    for (let i = 0; i <= 12; i++) { const a = -2.3 + (i / 12) * 2.6; hi.push([Math.cos(a) * R0 * 0.82, Math.sin(a) * R0 * 0.74]) }
    line(c, hi, 1.8, { color: PAL.lavaWhite })
  }, 1.2)
}
// a bubble of the shore's lip (the floor draws its own the same warm cream)
function paintBubble() {
  return bake(14, 14, 0.5, 0.5, (c) => {
    flat(c, ell(0, 0, 4, 3.6, 0, 20), '#f2b04a', 1)
    flat(c, ell(-1, -1, 2.4, 2, 0, 16), '#ffe6a0', 0)
  }, 0)
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
// a shape inked the cartoon way in a Graphics: a paper margin, the fill, a thick-thin ink line (the
// line drawn twice, the second pass offset down-right so it is heavier on the shadow side)
function celPoly(g, pts, fill, o = {}) {
  const { ink = 2.2, paper = 0, alpha = 1 } = o
  if (paper > 0) g.poly(pts).stroke({ width: ink + paper * 2, color: C.paper, alpha, join: 'round' })
  g.poly(pts).fill({ color: fill, alpha })
  if (ink > 0) {
    g.poly(pts).stroke({ width: ink * 0.7, color: C.ink, alpha, join: 'round' })
    g.poly(pts.map((v, i) => v + (i & 1 ? ink * 0.3 : ink * 0.22))).stroke({ width: ink * 0.7, color: C.ink, alpha, join: 'round' })
  }
}

export function createMantleFx({ ground, boat, top }) {
  const poolLayer = new Container(), crackG = new Graphics(), crustLayer = new Container(), groundG = new Graphics()
  const groundFx = new Container()
  const boatUnderG = new Graphics(), boatLayer = new Container()
  const strandLayer = new Container(), topG = new Graphics(), toolLayer = new Container(), topG2 = new Graphics()
  ground.addChild(groundG, crackG, poolLayer, crustLayer, groundFx)
  boat.addChild(boatUnderG, boatLayer)
  top.addChild(strandLayer, topG, toolLayer, topG2)
  const bursts = []   // { kind: 'melt' | 'crumble', x, y, r, t, seed }
  const waves = new Map()   // nova -> its trail { x, y, angle, arc, maxR, life, k, endAt, seed }
  let clock = 0

  // ---- the crust material and the cels, made on first use (a few hundred ms, once, at the first frame) ----
  let atlas = null, quad = null, fullMask = null, A = null
  const [seam0, seamGrow] = SEAMS[VARIANT]
  function art() {
    if (A) return A
    atlas = bakeAtlas(VARIANT)
    const quadOf = (h) => new MeshGeometry({ positions: new Float32Array([-h, -h, h, -h, h, h, -h, h]), uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) })
    quad = quadOf(ART_A)
    fullMask = new BufferImageSource({ resource: new Uint8Array(4 * 4 * 4).fill(255), width: 4, height: 4, format: 'rgba8unorm', scaleMode: 'linear', alphaMode: 'no-premultiply-alpha' })
    A = {
      kettle: paintKettle(), hammer: paintHammer(), star: paintStar(), crown: paintCrown(), bubble: paintBubble(),
      steam: [0, 1, 2].map((v) => paintPuff(v, '#d9cfc0', '#f8f1e2')),
      dust: [0, 1, 2].map((v) => paintPuff(v + 3, '#8f7a8a', '#b8a6b2')),
      smoke: [0, 1, 2].map((v) => paintPuff(v + 6, '#4a3c46', '#6d5c68')),
      chunk: [0, 1, 2].map((v) => paintChunk(v, '#5d4a5c', '#8d7889')),
      basalt: [0, 1, 2].map((v) => paintChunk(v + 3, '#3a3138', '#665a62')),
      lavaDrop: paintDrop(PAL.lavaHot, PAL.lavaGlow), waterDrop: paintDrop('#8cc6d2', '#eef9f8'),
      splat: [0, 1].map(paintSplat), curl: [0, 1, 2].map(paintCurl),
      noise: bakeNoise(), poolQuad: quadOf(POOL_A),
    }
    return A
  }
  function makeSkin(parent, masked) {
    art()
    const U = new UniformGroup({
      uRow: { value: 0, type: 'f32' }, uHeat: { value: 0, type: 'f32' }, uErode: { value: 0, type: 'f32' },
      uSink: { value: 0, type: 'f32' }, uBob: { value: 0, type: 'f32' }, uCover: { value: 2, type: 'f32' },
      uQuench: { value: 0, type: 'f32' }, uSeam: { value: seam0, type: 'f32' }, uGrow: { value: seamGrow, type: 'f32' },
      uInk: { value: 0, type: 'f32' }, uTime: { value: 0, type: 'f32' }, uAlpha: { value: 1, type: 'f32' },
      uMaskN: { value: masked ? MASK_N : 4, type: 'f32' },
    })
    let maskData = null, maskSrc = fullMask
    if (masked) {
      maskData = new Uint8Array(MASK_N * MASK_N * 4)
      maskSrc = new BufferImageSource({ resource: maskData, width: MASK_N, height: MASK_N, format: 'rgba8unorm', scaleMode: 'linear', alphaMode: 'no-premultiply-alpha' })
    }
    const mesh = new Mesh({ geometry: quad, shader: Shader.from({ gl: { vertex: QUAD_VERT, fragment: CRUST_FRAG, name: 'mantle-crust' }, resources: { crustU: U, uArt: atlas, uMask: maskSrc } }) })
    mesh.visible = false
    parent.addChild(mesh)
    return { mesh, U: U.uniforms, maskData, maskSrc, owner: null, heights: null, key: null, used: false }
  }
  const skinLook = (sk, x, y, r, sy, rotA, row, o) => {
    sk.mesh.visible = true
    sk.mesh.position.set(x, y); sk.mesh.scale.set(r, r * sy); sk.mesh.rotation = rotA
    const U = sk.U
    U.uRow = row; U.uHeat = o.heat ?? 0; U.uErode = o.erode ?? 0; U.uSink = o.sink ?? 0; U.uBob = o.bob ?? 0
    U.uCover = o.cover ?? 2; U.uQuench = o.quench ?? 0; U.uInk = o.ink ?? 0; U.uAlpha = o.alpha ?? 1; U.uTime = clock
  }
  const crustSkins = [], strandSkins = []
  let boatSkin = null
  // growable pools of plain sprites
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
  const low = spritePool(groundFx), tools = spritePool(toolLayer)
  const poolMeshes = []
  function makePool() {
    art()
    const U = new UniformGroup({
      uOpen: { value: 0, type: 'f32' }, uClose: { value: 0, type: 'f32' }, uTime: { value: 0, type: 'f32' },
      uSeed: { value: 0, type: 'f32' }, uPh: { value: new Float32Array(3), type: 'vec3<f32>' },
    })
    const mesh = new Mesh({ geometry: A.poolQuad, shader: Shader.from({ gl: { vertex: QUAD_VERT, fragment: POOL_FRAG, name: 'mantle-pool' }, resources: { poolU: U, uNoise: A.noise } }) })
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
        a = clamp01(0.5 + (line - h[o]) / (Math.max(1e-7, hyp(gx, gy)) * MASK_SOFT))
      }
      if (a < 1 && pools.length) {
        const lx = -ART_A + i * st, ly = -ART_A + j * st
        const wx = c.x + c.r * (lx * cs - ly * sn), wy = c.y + c.r * (lx * sn + ly * cs)
        for (const q of pools) a = Math.max(a, clamp01(0.5 + (q.r - hyp(wx - q.x, wy - q.y)) / MASK_SOFT))
      }
      const v = Math.round(a * 255), w = (j * M + i) * 4
      sk.maskData[w] = sk.maskData[w + 1] = sk.maskData[w + 2] = sk.maskData[w + 3] = v
    }
    sk.maskSrc.update()
  }
  // a crack wedging out of a stamp: a zigzag wedge of ink, lava glowing down its middle
  function crackWedge(g, x, y, a, len, w0, seed, hot) {
    const seg = 5, L = [], R = [], M = []
    let px = x, py = y
    for (let k = 0; k <= seg; k++) {
      const u = k / seg, aa = a + (k ? (rh(k, seed, 3) - 0.5) * 0.9 : 0)
      if (k) { px += Math.cos(aa) * len / seg; py += Math.sin(aa) * len / seg }
      const w = w0 * (1 - u) * (0.8 + 0.4 * rh(k, seed, 5)), nx = -Math.sin(aa), ny = Math.cos(aa)
      L.push(px + nx * w, py + ny * w); R.unshift(px - nx * w, py - ny * w); M.push(px, py, w)
    }
    g.poly([...L, ...R]).fill({ color: C.ink })
    const I = [], J = []
    for (let k = 0; k < M.length; k += 3) {
      const w = M[k + 2] * 0.45, kk = k / 3, aa = a + (kk ? (rh(kk, seed, 3) - 0.5) * 0.9 : 0), nx = -Math.sin(aa), ny = Math.cos(aa)
      I.push(M[k] + nx * w, M[k + 1] + ny * w); J.unshift(M[k] - nx * w, M[k + 1] - ny * w)
    }
    g.poly([...I, ...J]).fill({ color: hot ? C.lavaHot : C.lavaDeep })
  }

  function hideAll() {
    for (const s of [...crustSkins, ...strandSkins]) { s.mesh.visible = false; s.owner = null }
    if (boatSkin) boatSkin.mesh.visible = false
    for (const m of poolMeshes) m.mesh.visible = false
    low.begin(); low.end(); tools.begin(); tools.end()
  }
  return {
    reset() { bursts.length = 0; waves.clear(); for (const g of [groundG, crackG, boatUnderG, topG, topG2]) g.clear(); hideAll() },
    event(e) {
      if (e.type !== 'melt' && e.type !== 'crumble') return false
      bursts.push({ kind: e.type, x: e.x, y: e.y, r: e.r || 14, t: 0, seed: Math.floor(Math.abs(e.x * 7 + e.y * 13)) })
      if (bursts.length > 80) bursts.shift()
      return true
    },
    // tide = { L, T } (lavaTideOf, or the dry fallback with line -1); onScreen(x, y, r); t = animT
    sync(run, dt, tide, onScreen, t) {
      clock += dt
      for (const g of [groundG, crackG, boatUnderG, topG, topG2]) g.clear()
      const P = art()
      low.begin(); tools.begin()
      const { L, T } = tide
      const line = T.line
      const p = run.player
      const livePools = (run.lavaPools ?? []).filter((q) => q.t < q.dur)

      // ---- the hammer's pools: the stamp, the cracks, the pool ----
      let np = 0
      for (const q of livePools) {
        if (np >= 24 || !onScreen(q.x, q.y, q.r * 2.2)) continue
        const pm = poolMeshes[np] ?? (poolMeshes.push(makePool()), poolMeshes[np])
        np++
        const sd = Math.floor(Math.abs(q.x * 3 + q.y * 5))
        const ph = [rh(sd, 1, 1) * TAU, rh(sd, 2, 1) * TAU, rh(sd, 3, 1) * TAU]
        const open = smooth(0.1, 0.36, q.t), close = smooth(0.9, 0, q.dur - q.t)
        pm.mesh.visible = open > 0.001
        pm.mesh.position.set(q.x, q.y); pm.mesh.scale.set(q.r)
        const U = pm.U
        U.uOpen = open; U.uClose = close; U.uTime = t; U.uSeed = (sd % 97) / 97
        U.uPh[0] = ph[0]; U.uPh[1] = ph[1]; U.uPh[2] = ph[2]
        // the cracks it was struck open by: inked wedges, dimming as it closes
        const split = smooth(0.08, 0.2, q.t)
        if (split > 0) for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU + rh(i, sd, 1) * 0.9
          crackWedge(crackG, q.x, q.y, a, q.r * (0.9 + 0.7 * rh(i, sd, 2)) * split * (1 - 0.3 * close), 9 * (1 - 0.4 * close), sd + i * 7, close < 0.5)
        }
        // the shore's bubbled lip round it
        if (open > 0.4) {
          const nb = Math.round(q.r * TAU / 11)
          for (let i = 0; i < nb; i++) {
            const a = (i / nb) * TAU + rh(i, sd, 9) * 0.2, rr = q.r * open * poolRim(a, ph) + 2
            const b = low.next(P.bubble)
            b.position.set(q.x + Math.cos(a) * rr, q.y + Math.sin(a) * rr)
            b.scale.set((0.7 + 0.6 * rh(i, sd, 10)) * (0.9 + 0.1 * Math.sin(t * 4 + i)))
            b.alpha = smooth(0.4, 0.7, open) * (1 - close)
          }
        }
        if (q.t < 0.42) {
          // THE SWING: wind-up overhead, a smear, the head landing at t = 0.09 and held two frames squashed,
          // then a recoil. The hand (pivot) sits down-right or down-left of the stamp.
          const phi = sd & 1 ? 0.55 : Math.PI - 0.55, sg = Math.cos(phi) > 0 ? 1 : -1
          const px = q.x + Math.cos(phi) * HAMMER_L, py = q.y + Math.sin(phi) * HAMMER_L
          let del, sx = 1, sy = 1, al = 1
          if (q.t < 0.05) { del = 1.8 + 0.12 * (q.t / 0.05); sx = sy = 1.3 }                      // wound up overhead
          else if (q.t < 0.09) { const u = (q.t - 0.05) / 0.04; del = 1.9 * (1 - u * u); sx = 1.35 - 0.2 * u; sy = 1.1 }   // the swing
          else if (q.t < 0.13) { del = 0; sx = 1.14; sy = 0.78 }                                     // the impact, held
          else { const u = (q.t - 0.13) / 0.29; del = 0.4 * Math.sin(Math.PI * Math.min(1, u * 1.2)); al = 1 - smooth(0.6, 1, u) }
          if (q.t >= 0.05 && q.t < 0.11) {
            // the smear: the arc the head swept, a hard pale wedge inked round
            const a0 = phi + Math.PI + sg * 1.85, a1 = phi + Math.PI + sg * Math.max(0, del)
            const S = [], n = 10, r0 = HAMMER_L * 0.62, r1 = HAMMER_L * 1.32
            for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); S.push(px + Math.cos(a) * r1, py + Math.sin(a) * r1) }
            for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * (i / n) ** 0.6; S.push(px + Math.cos(a) * r0, py + Math.sin(a) * r0) }
            celPoly(topG, S, 0xfff6e0, { ink: 2, alpha: 0.95 })
          }
          const h = tools.next(P.hammer)
          h.position.set(px, py); h.rotation = phi + sg * del
          h.scale.set(sx, sy * sg); h.alpha = al
          // the impact: a star half again the head, chunks of rock flung out, a ring of dust, all shaking
          const shake = q.t >= 0.09 && q.t < 0.16 ? (Math.floor(q.t * 60) & 1 ? 3 : -3) : 0
          if (q.t >= 0.09 && q.t < 0.17) {
            // speed lines bursting out of the blow (the Fleischer impact): hard tapered streaks
            const u = (q.t - 0.09) / 0.08
            for (let i = 0; i < 11; i++) {
              const a = (i / 11) * TAU + rh(i, sd, 70) * 0.4, r0 = 34 + 50 * u, r1 = r0 + 26 + 30 * rh(i, sd, 71), w = 3.4 * (1 - u) + 1
              const nx = -Math.sin(a) * w, ny = Math.cos(a) * w, cx = q.x + shake, cy = q.y
              celPoly(topG2, [cx + Math.cos(a) * r0 + nx, cy + Math.sin(a) * r0 + ny, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, cx + Math.cos(a) * r0 - nx, cy + Math.sin(a) * r0 - ny], C.lavaGlow, { ink: 1.4 })
            }
          }
          if (q.t >= 0.09 && q.t < 0.2) {
            const u = (q.t - 0.09) / 0.11, st = tools.next(P.star)
            st.position.set(q.x + shake, q.y - shake * 0.5); st.rotation = sd + u * 0.3
            st.scale.set(0.95 + 0.35 * u); st.alpha = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3
          }
          const fl = (q.t - 0.09) / 0.33
          if (fl > 0) for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU + rh(i, sd, 11) * 0.6, e = 1 - (1 - fl) * (1 - fl)
            const dd = q.r * (0.3 + (0.9 + 0.5 * rh(i, sd, 12)) * e)
            const ch = tools.next(P.chunk[i % 3])
            ch.position.set(q.x + Math.cos(a) * dd + shake, q.y + Math.sin(a) * dd * 0.85 - Math.sin(Math.PI * fl) * (22 + 18 * rh(i, sd, 13)))
            ch.rotation = a + fl * 6 * (i & 1 ? 1 : -1); ch.scale.set((0.9 + 0.6 * rh(i, sd, 14)) * (1 - 0.3 * fl)); ch.alpha = 1 - smooth(0.75, 1, fl)
          }
          if (fl > 0) for (let i = 0; i < 9; i++) {
            const a = (i / 9) * TAU + rh(i, sd, 15), dd = q.r * (0.5 + 0.7 * Math.sqrt(fl))
            const du = low.next(P.dust[i % 3])
            du.position.set(q.x + Math.cos(a) * dd, q.y + Math.sin(a) * dd * 0.8)
            du.scale.set((0.45 + 0.4 * fl) * (1 - smooth(0.6, 1, fl))); du.rotation = a
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
      const lavaAt = (x, y, under) => !Lc || mantleHeightAt(Lc, T.seed, x, y) < line || under.some((q) => (q.x - x) ** 2 + (q.y - y) ** 2 < q.r * q.r)
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
        const rem = c.dur - c.t
        const ramp = smooth(Math.min(HOT_T, c.dur * 0.4), 0, rem), last = smooth(SINK_T, 0, rem)
        const pulse = last > 0 ? 0.5 + 0.5 * Math.sin(clock * 16) : 0
        skinLook(sk, c.x, c.y, c.r, 1, rotA, sd % SHAPES, {
          quench: 1 - smooth(0, 0.3, c.t),
          heat: Math.max(0.06, ramp * 0.75 + last * 0.25 * pulse),
          sink: last * 1.15, bob: last,
        })
        // the pour: puffs of steam boiling up off the splash, then a few small ones while it is fresh
        if (c.t < 2.2) {
          const s0 = c.r / 130
          for (let i = 0; i < 11; i++) {
            const big = i < 7
            const born = big ? 0.06 + i * 0.05 : 0.6 + (i - 7) * 0.35, life = big ? 1.3 : 1.1
            const a = (c.t - born) / life
            if (a <= 0 || a >= 1) continue
            const ang = rh(i, sd, 21) * TAU, rr = c.r * (big ? 0.2 + 0.6 * rh(i, sd, 22) : 0.15 + 0.55 * rh(i, sd, 22))
            const x0 = c.x + Math.cos(ang) * rr, y0 = c.y + Math.sin(ang) * rr
            if (!lavaAt(x0, y0, under)) continue   // no steam off dry rock
            const s = low.next(P.steam[i % 3])
            const rise = 1 - (1 - a) * (1 - a)
            s.position.set(x0 + Math.cos(ang) * rise * 14 * s0, y0 - rise * (big ? 62 : 44) * s0)
            // a cartoon puff: it swells, then shrinks away to nothing (never a fade)
            const grow = a < 0.25 ? 0.4 + 2.4 * a : 1 - smooth(0.55, 1, a) * 0.95
            s.scale.set((big ? 1.25 : 0.75) * grow * s0 * (0.9 + 0.2 * rh(i, sd, 23)))
            s.rotation = (rh(i, sd, 24) - 0.5) * 0.8
          }
        }
      }
      // the kettle itself, for the newest pour: over the digger's shoulder, anticipation, a tip with a
      // stretch, the pour held, a squash back, and a fat stream into a splash crown
      const pour = draw.length ? draw[draw.length - 1] : null
      if (pour && pour.t < 0.72) {
        const k = pour.t
        let tilt, sx = 1, sy = 1, pop = 1
        if (k < 0.08) { const u = k / 0.08; pop = u < 0.6 ? u / 0.6 * 1.15 : 1.15 - 0.15 * (u - 0.6) / 0.4; tilt = -0.28 * u; sx = 1.1; sy = 0.9 }
        else if (k < 0.15) { const u = (k - 0.08) / 0.07; tilt = -0.28 + 1.48 * u * u; sx = 1 + 0.18 * Math.sin(Math.PI * u); sy = 1 - 0.1 * Math.sin(Math.PI * u) }
        else if (k < 0.5) { tilt = 1.2 + 0.06 * Math.sin((k - 0.15) * 30) }
        else if (k < 0.6) { const u = (k - 0.5) / 0.1; tilt = 1.2 * (1 - u); sx = 1 - 0.12 * Math.sin(Math.PI * u); sy = 1 + 0.12 * Math.sin(Math.PI * u) }
        else { const u = (k - 0.6) / 0.12; tilt = 0; pop = 1 - u * u }
        const kx = p.x + 22, ky = p.y - 58
        const kt = tools.next(P.kettle)
        kt.position.set(kx, ky); kt.rotation = tilt; kt.scale.set(sx * pop, sy * pop)
        if (k > 0.12 && k < 0.57) {
          const cs = Math.cos(tilt), sn = Math.sin(tilt), tx = KETTLE_TIP[0] * sx * pop, ty = KETTLE_TIP[1] * sy * pop
          const sx0 = kx + tx * cs - ty * sn, sy0 = ky + tx * sn + ty * cs
          const ex = sx0 + 16, ey = p.y + 22
          const head = smooth(0.12, 0.18, k), tail = smooth(0.5, 0.57, k)
          const f0 = tail, f1 = head, n = 12
          const cx = (f) => sx0 + 4 + (ex - sx0 - 4) * (1 - (1 - f) * (1 - f)), cy = (f) => sy0 + (ey - sy0) * f
          const wd = (f) => (8 - 2.5 * f) * (1 + 0.28 * Math.max(0, Math.sin((f - k * 7) * 9)))
          const Lp = [], Rp = []
          for (let i = 0; i <= n; i++) {
            const f = f0 + (f1 - f0) * (i / n), x = cx(f), y = cy(f), w = wd(f)
            Lp.push(x - w, y); Rp.unshift(x + w, y)
          }
          // round ends: a cap at the falling head
          const hx = cx(f1), hy = cy(f1), hw = wd(f1)
          const cap = []
          for (let i = 1; i < 8; i++) { const a = Math.PI - (i / 8) * Math.PI; cap.push(hx + Math.cos(a) * hw, hy + Math.sin(a) * hw * 0.9) }
          celPoly(topG2, [...Lp, ...cap, ...Rp], 0x8cc6d2, { ink: 2.6 })
          const HL = []
          for (let i = 0; i <= n; i++) { const f = f0 + (f1 - f0) * (i / n); HL.push(cx(f) - wd(f) * 0.55, cy(f)) }
          for (let i = n; i >= 0; i--) { const f = f0 + (f1 - f0) * (i / n); HL.push(cx(f) - wd(f) * 0.15, cy(f)) }
          topG2.poly(HL).fill({ color: 0xeef9f8 })
          if (head >= 1 && tail < 1) {
            const cr = tools.next(P.crown)
            cr.position.set(ex, ey); cr.scale.set(0.9 + 0.15 * Math.sin(k * 60), 0.85 + 0.2 * Math.sin(k * 47))
            for (let i = 0; i < 4; i++) {
              const u = ((k * 4 + i * 0.25) % 1), a = -Math.PI / 2 + (i - 1.5) * 0.7
              const d = tools.next(P.waterDrop)
              d.position.set(ex + Math.cos(a) * 26 * u, ey - 6 + Math.sin(a) * 22 * u + 30 * u * u)
              d.rotation = a + Math.PI / 2 + u; d.scale.set(0.7 * (1 - 0.4 * u))
            }
          }
        }
      }

      // ---- creatures: a stranded lava one encased by a creeping crust, a melting rock one slumping ----
      let ns = 0
      for (const e of run.enemies) {
        if (e._dead || !e.habitat || !onScreen(e.x, e.y, e.radius)) continue
        const R = e.radius
        if (e.meltT > 0) {
          const k = Math.min(1, e.meltT / MANTLE_MELT_T), sd = e.id | 0
          // the lava climbing its body from the feet: the lower part of its silhouette gone molten, the
          // melt line inked with drips hanging off it, drops running down, sweat flying off its head
          const rx = R * 1.05, ry = R * 1.15, cy = e.y + R * 0.05
          const top = cy + ry * (0.85 - 1.5 * k)
          const th = Math.asin(Math.max(-0.98, Math.min(0.98, (top - cy) / ry)))
          const edgeX = rx * Math.cos(th)
          const lineP = []
          for (let i = 0; i <= 14; i++) {
            const u = i / 14, x = e.x - edgeX + 2 * edgeX * u
            lineP.push(x, top + Math.max(0, Math.sin(u * Math.PI * 3.5 + sd)) ** 4 * R * 0.32 + Math.sin(u * 9 + t * 5) * R * 0.03)
          }
          const S = [...lineP]
          for (let i = 1; i <= 10; i++) { const a = th + (Math.PI - 2 * th) * (i / 10); S.push(e.x + rx * Math.cos(a), cy + ry * Math.sin(a)) }
          topG.poly(S).fill({ color: C.lava })
          topG.moveTo(lineP[0], lineP[1] + 3); for (let i = 2; i < lineP.length; i += 2) topG.lineTo(lineP[i], lineP[i + 1] + 3.5)
          topG.stroke({ width: 2.2, color: C.lavaGlow, cap: 'round' })
          topG.moveTo(lineP[0], lineP[1]); for (let i = 2; i < lineP.length; i += 2) topG.lineTo(lineP[i], lineP[i + 1])
          topG.stroke({ width: 2.4, color: C.ink, cap: 'round', join: 'round' })
          for (let i = 0; i < 3; i++) {
            const u = (i + 0.5) / 3, dy = (t * 1.3 + i * 0.37 + sd * 0.1) % 1
            const d = tools.next(P.lavaDrop)
            d.position.set(e.x + (u * 2 - 1) * R * 0.6, top + dy * (e.y + R - top) * 0.9); d.rotation = Math.PI; d.scale.set(0.55 + 0.35 * k)
          }
          for (let i = 0; i < 2; i++) {
            const u = (t * 1.8 + i * 0.5 + sd * 0.13) % 1, sg = i ? 1 : -1
            const d = tools.next(P.waterDrop)
            d.position.set(e.x + sg * R * (0.7 + u * 0.8), e.y - R * (1.1 + u * 0.4) + u * u * 14)
            d.rotation = sg * (0.6 + u); d.scale.set(0.55); d.alpha = 1 - u
          }
        }
        if (e.strandT > 0 && ns < 24) {
          const k = Math.min(1, e.strandT / MANTLE_STRAND_STUCK_T)
          const dying = smooth(MANTLE_STRAND_DIE_T - 1.5, MANTLE_STRAND_DIE_T, e.strandT)
          const sk = strandSkins[ns] ?? (strandSkins.push(makeSkin(strandLayer, false)), strandSkins[ns])
          ns++
          skinLook(sk, e.x, e.y + R * 0.1, R * 1.55, 0.72, 0, e.id % SHAPES, {
            cover: 0.12 + 0.55 * k + 0.5 * dying, heat: 0.06 + dying * (0.7 + 0.3 * Math.sin(clock * 16)), alpha: 0.95,
          })
        }
      }
      for (let i = ns; i < strandSkins.length; i++) strandSkins[i].mesh.visible = false

      // ---- the bellows' wave: stacked inked crests, a fat lip curling forward, blobs flung ahead that
      // land as splats, a molten trough and a scorched streak left on the rock behind ----
      const seen = new Set()
      for (const n of run.novas ?? []) {
        if (n.look !== 'lavaWave') continue
        seen.add(n)
        let w = waves.get(n)
        if (!w) { w = { x: n.x, y: n.y, angle: n.angle, arc: n.arc ?? 2, maxR: n.maxR, life: n.lifeMax || 0.5, k: 0, endAt: null, seed: Math.floor(Math.abs(n.x * 3 + n.y)) }; waves.set(n, w) }
        w.k = 1 - Math.max(0, n.life / (n.lifeMax || 1)); w.R = Math.max(10, n.r || n.maxR * w.k); w.endAt = null
      }
      for (const [n, w] of waves) {
        if (!seen.has(n) && w.endAt === null) w.endAt = clock
        if (w.endAt !== null && clock - w.endAt > 1.2) waves.delete(n)
      }
      for (const w of waves.values()) {
        if (!onScreen(w.x, w.y, w.maxR + 80)) continue
        const alive = w.endAt === null, age = alive ? w.k * w.life : w.life + (clock - w.endAt)
        const half = w.arc / 2, m = 30, sdw = w.seed
        const R = alive ? w.R : w.maxR
        const at = (u, r) => { const a = w.angle - half + 2 * half * u, pin = Math.pow(Math.sin(Math.PI * u), 0.5); return [w.x + Math.cos(a) * (R - (R - Math.max(6, r)) * pin), w.y + Math.sin(a) * (R - (R - Math.max(6, r)) * pin)] }
        const band = (r0, r1) => { const S = []; for (let i = 0; i <= m; i++) S.push(...at(i / m, r1(i / m))); for (let i = m; i >= 0; i--) S.push(...at(i / m, r0(i / m))); return S }
        // the scorched streak and the molten trough behind the crest, fading over a second after it ends
        const fadeT = alive ? 1 : 1 - (clock - w.endAt) / 1.2
        if (fadeT > 0) {
          // a molten trough just behind where the crest is (or ended), a scorched rim of rock behind it
          groundG.poly(band(() => Math.max(8, R - 64), () => Math.max(8, R - 24))).fill({ color: C.trough, alpha: 0.9 * fadeT })
          groundG.poly(band(() => Math.max(8, R - 92), () => Math.max(8, R - 60))).fill({ color: C.scorch, alpha: 0.55 * fadeT })
          for (let i = 0; i < 14; i++) {
            const u = 0.08 + 0.84 * rh(i, sdw, 30), r = 30 + (R - 60) * rh(i, sdw, 31)
            if (r < 30) continue
            const [ex, ey] = at(u, r)
            groundG.ellipse(ex, ey, 3 + 3 * rh(i, sdw, 32), 1.6).fill({ color: C.lavaHot, alpha: 0.8 * fadeT * (0.5 + 0.5 * Math.sin(clock * 6 + i)) })
          }
        }
        if (alive) {
          const W = 30 * (1 - 0.25 * w.k), fade = 1 - smooth(0.8, 1, w.k)
          const bump = (u, s, amp) => amp * (0.55 * Math.sin(u * 11 + s + t * 3) + 0.3 * Math.sin(u * 23 + s * 2.1 - t * 4) + 0.15 * Math.sin(u * 41 + s))
          // three stacked crests, back to front, each inked along its rolling top, foam on the middle one
          celPoly(topG, band(() => R - W * 2.6, (u) => R - W * 1.25 + bump(u, sdw, 5)), C.lavaDeep, { ink: 2.2, alpha: fade })
          celPoly(topG, band(() => R - W * 1.7, (u) => R - W * 0.45 + bump(u, sdw + 3, 6)), C.lava, { ink: 2.4, alpha: fade })
          for (let i = 0; i < 9; i++) {
            const u = 0.08 + 0.84 * ((i + 0.5) / 9 + (rh(i, sdw, 40) - 0.5) * 0.06), r = R - W * 0.55 + bump(u, sdw + 3, 6)
            const [fx, fy] = at(u, r), [gx, gy] = at(u + 0.025, r - 5)
            topG.poly([fx, fy, gx, gy, ...at(u + 0.012, r - 2)]).fill({ color: C.lavaGlow, alpha: fade })
          }
          // the lip: a fat roll bulging forward unevenly, a paper edge, its lit top
          const lipF = (u) => R + 6 + bump(u, sdw + 7, 9) + 7 * Math.sin(Math.PI * u)
          celPoly(topG, band(() => R - W * 0.95, lipF), C.lavaHot, { ink: 2.8, paper: 2.2, alpha: fade })
          topG.poly(band((u) => R - W * 0.6 + bump(u, sdw + 7, 4), (u) => R - W * 0.28 + bump(u, sdw + 7, 5))).fill({ color: C.lavaGlow, alpha: fade })
          // curls breaking over it, of different builds and sizes, irregularly spaced
          let u = 0.05 + 0.06 * rh(0, sdw, 50)
          for (let i = 0; u < 0.95 && i < 16; i++) {
            const pin = Math.pow(Math.sin(Math.PI * u), 0.7), sz = (0.7 + 0.8 * rh(i, sdw, 51)) * (0.5 + 0.6 * pin)
            const a = w.angle - half + 2 * half * u, [cx, cy] = at(u, lipF(u) - 6)
            const cl = tools.next(P.curl[Math.floor(rh(i, sdw, 52) * 3)])
            cl.position.set(cx, cy); cl.rotation = a + (rh(i, sdw, 53) - 0.5) * 0.4; cl.scale.set(sz, sz * (rh(i, sdw, 54) < 0.5 ? 1 : -1)); cl.alpha = fade
            u += (0.07 + 0.09 * rh(i, sdw, 55)) * (0.6 + 0.4 * sz)
          }
        }
        // blobs flung off the lip: they arc forward, then land as splats that cool away
        for (let i = 0; i < 5; i++) {
          const k0 = 0.12 + 0.14 * i + 0.04 * rh(i, sdw, 60), t0 = k0 * w.life, fly = 0.26
          const u = 0.12 + 0.76 * rh(i, sdw, 61), a = w.angle - half + 2 * half * u
          const r0 = w.maxR * k0 + 10, r1 = r0 + 44 + 30 * rh(i, sdw, 62)
          const f = (age - t0) / fly
          if (f <= 0) continue
          if (f < 1) {
            const d = r0 + (r1 - r0) * f, b = tools.next(P.lavaDrop)
            b.position.set(w.x + Math.cos(a) * d, w.y + Math.sin(a) * d - Math.sin(Math.PI * f) * 26)
            b.rotation = a + Math.PI / 2 - (f - 0.5) * 1.6; b.scale.set(1.4 + 0.5 * rh(i, sdw, 63), 1.4 + 0.5 * rh(i, sdw, 63) + 0.4 * Math.sin(Math.PI * f))
          } else {
            const g = (age - t0 - fly) / 0.8
            if (g >= 1) continue
            const s = low.next(P.splat[i & 1])
            s.position.set(w.x + Math.cos(a) * r1, w.y + Math.sin(a) * r1)
            s.rotation = a; s.scale.set((0.8 + 0.4 * rh(i, sdw, 64)) * (g < 0.1 ? 0.6 + 4 * g : 1) * (1 - 0.5 * smooth(0.6, 1, g)))
            s.alpha = 1 - smooth(0.6, 1, g)
          }
        }
      }

      // ---- melt and crumble bursts ----
      for (const b of bursts) b.t += dt
      while (bursts.length && bursts[0].t > 0.9) bursts.shift()
      for (const b of bursts) {
        if (!onScreen(b.x, b.y, b.r * 3)) continue
        const k = b.t / 0.9
        if (b.kind === 'melt') {
          // gone under with a splat, a puff of smoke and drops flung up
          const s = low.next(P.splat[b.seed & 1])
          s.position.set(b.x, b.y + b.r * 0.4); s.scale.set((b.r / 14) * (0.7 + 0.5 * Math.min(1, k * 5))); s.alpha = 1 - smooth(0.6, 1, k)
          for (let i = 0; i < 3; i++) {
            const sm = tools.next(P.smoke[i])
            sm.position.set(b.x + (i - 1) * b.r * 0.6, b.y - b.r * (0.3 + 1.6 * k) - i * 4)
            sm.scale.set((b.r / 18) * (k < 0.2 ? 0.3 + 3 * k : 0.9 * (1 - smooth(0.55, 1, k)) + 0.05))
          }
          for (let i = 0; i < 5; i++) {
            const a = -Math.PI / 2 + (i - 2) * 0.55, d = b.r * (0.5 + 2.2 * k)
            const dr = tools.next(P.lavaDrop)
            dr.position.set(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d * 0.6 + 40 * k * k); dr.rotation = a + Math.PI / 2 + k * 2; dr.scale.set(0.8 * (1 - 0.4 * k)); dr.alpha = 1 - smooth(0.7, 1, k)
          }
        } else {
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * TAU + b.seed, d = b.r * (0.4 + 2.0 * k)
            const ch = tools.next(P.basalt[i % 3])
            ch.position.set(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d - 16 * Math.sin(Math.PI * k)); ch.rotation = a + k * 5; ch.scale.set(0.9 * (1 - 0.4 * k)); ch.alpha = 1 - smooth(0.7, 1, k)
          }
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * TAU + b.seed * 0.3, du = low.next(P.dust[i % 3])
            du.position.set(b.x + Math.cos(a) * b.r * (0.4 + k), b.y + Math.sin(a) * b.r * (0.3 + 0.8 * k))
            du.scale.set((b.r / 22) * (k < 0.2 ? 0.3 + 3 * k : 0.9 * (1 - smooth(0.5, 1, k)) + 0.05))
          }
        }
      }

      // ---- the basalt raft under the player: the lava creeping in over its rim and up over your boots ----
      if (p.afloat && p.boatMax > 0) {
        if (!boatSkin) boatSkin = makeSkin(boatLayer, false)
        const f = clamp01(p.boatT / p.boatMax)   // 1 fresh, 0 gone under
        const s = 1 - f
        const wob = f < 0.3 ? Math.sin(t * 22) * (0.3 - f) * 5 : 0
        const x = p.x + wob, y = p.y + 18 + Math.sin(t * 3.1) * 1.2 + s * 3
        // the lava riding up round it and a wake of ripples
        boatUnderG.ellipse(x, y + 4, 50 - 8 * s, 29 - 5 * s).fill({ color: C.lavaDeep, alpha: 0.35 })
        for (let i = 0; i < 3; i++) {
          const ph = (t * 0.8 + i / 3) % 1, rx = 48 + ph * 30, ry = 27 + ph * 16
          for (let j = 0; j < 2; j++) {
            const a0 = (j / 2) * TAU + i * 1.3 + 0.4, a1 = a0 + 0.55
            boatUnderG.moveTo(x + Math.cos(a0) * rx, y + 3 + Math.sin(a0) * ry)
            for (let q = 1; q <= 6; q++) { const a = a0 + (a1 - a0) * (q / 6); boatUnderG.lineTo(x + Math.cos(a) * rx, y + 3 + Math.sin(a) * ry) }
          }
          boatUnderG.stroke({ width: 5 * (1 - ph) + 1, color: C.lavaGlow, alpha: 1 - ph * ph, cap: 'round' })
        }
        skinLook(boatSkin, x, y, 44, 0.6, Math.sin(t * 1.3) * 0.05 + s * 0.08 * Math.sin(t * 5), 1, {
          heat: 0.06 + 0.9 * s * (0.85 + 0.15 * Math.sin(clock * 12)), erode: 0.62 * s, ink: 1, sink: smooth(0.75, 1, s) * 0.5,
        })
        // the lava over your boots: a flat cel of lava, inked along its line, climbing as it sinks
        if (s > 0.08) {
          const lw = 20 + 14 * s, ly = p.y + 22 - 10 * smooth(0.08, 1, s), S = []
          for (let i = 0; i <= 10; i++) { const u = i / 10; S.push(p.x + (u * 2 - 1) * lw, ly + Math.sin(u * 9 + t * 6) * 1.5 - Math.sin(Math.PI * u) * 3) }
          for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI; S.push(p.x + Math.cos(a) * lw, ly + 4 + Math.sin(a) * (6 + 4 * s)) }
          topG.poly(S).fill({ color: C.lava })
          topG.moveTo(S[0], S[1]); for (let i = 2; i <= 20; i += 2) topG.lineTo(S[i], S[i + 1])
          topG.stroke({ width: 2.2, color: C.ink, cap: 'round', join: 'round' })
          topG.moveTo(p.x - lw * 0.7, ly + 2); for (let i = 1; i <= 8; i++) { const u = i / 8; topG.lineTo(p.x + (u * 1.4 - 0.7) * lw, ly + 2 + Math.sin(u * 9 + t * 6) * 1.5 - Math.sin(Math.PI * u) * 2.5) }
          topG.stroke({ width: 2.4, color: C.lavaGlow, cap: "round" })
        }
        // chunks breaking off its rim at the end
        if (s > 0.72) {
          const u = (s - 0.72) / 0.28
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * TAU + 0.6, d = 38 + 26 * u
            const ch = low.next(P.basalt[i % 3])
            ch.position.set(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6 + 6 * u); ch.rotation = a + u * 2; ch.scale.set(1.1 * (1 - 0.6 * u)); ch.alpha = 1 - smooth(0.6, 1, u)
          }
        }
      } else if (boatSkin) boatSkin.mesh.visible = false
      low.end(); tools.end()
    },
  }
}
