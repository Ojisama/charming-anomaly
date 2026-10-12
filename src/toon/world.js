// The Mantle's world (render-only): the floor shader, the film pass, the shots and the pickups.
//
// THE FLOOR IS A WATERCOLOUR, PAINTED BY THE GPU. One fragment shader (FLOOR_FRAG) runs over chunks of
// the world; each chunk carries a texture of the ground's HEIGHT (sim.js mantleHeightAt, sampled every
// CHUNK_STEP px) and the shader is handed the tide (uLine: the height under which ground is lava). So
// the lava on screen is the sim's own lava: a body standing in what looks like lava is in it. There is
// NO INK anywhere in the world — only the cast, its shots and pickups, and the bubbles peeking out of
// the swell carry a line:
//   ROCK      slate-violet watercolour: broad washes, pigment pooling into darker granulated bloom
//             edges, dry-brush streaks dragged on the diagonal, paper tooth, a painted hillshade and
//             soft terraces. Pale on the hills (the ground the flood never reaches), darker and
//             scorched in the basins it fills every cycle.
//   LAVA      gouache: domain-warped orange marbling that churns slowly, swirl strokes along the
//             flow, deep red pools far from shore, cooled crust drifting in the deep.
//   THE SHORE a ragged soft edge (no outline), the rock lip lit hot from below, a bright yellow swell
//             band with froth and a dark bulge beyond it, and bubbles, some of them with FACES.
//   THE TELL  while run.lavaTide.swell rises (the last seconds of the ebb, and the whole climb) the
//             band widens and throbs, the froth thickens, the low ground darkens and sweats, steam
//             curls off it, little lava blisters push up through the bank and pop, and the shores
//             crowd with pie-eyed bubbles peeking at the dry ground. No glowing cracks anywhere.
//   THE DRAIN rock the lava has just left stays dark and wet for a while, then dries.
// Everything is graded in the shader as a faded 1930s print (desaturated, warm, lifted blacks, cream
// whites); the film pass (FILM_FRAG) then adds grain, dust, a scratch, flicker and an uneven vignette.
import { MANTLE_GROUND_STEP } from '../config.js'
import { PAL, TAU, mkCanvas } from './palette.js'
import { resetXf, push, pop, tr, rot, sc, ell, polar, drop, tube, qb, line, cel, glove, glow, puff, flame, brush } from './brush.js'
import { peekBubble } from './cast.js'

export const CHUNK = 1024          // world px per floor chunk
export const CHUNK_STEP = MANTLE_GROUND_STEP        // world px between the height samples a chunk's texture holds
export const CHUNK_N = CHUNK / CHUNK_STEP + 1   // samples a side (the last one is the next chunk's first)

// ---- the noise the floor paints with: one tileable texture, four independent fields --------------
// 256 texels a side, 4 octaves of value noise on a lattice of period 8..64 (so it tiles), a different
// seed per channel. The shader samples it at several world scales instead of computing noise per pixel.
export const NOISE_N = 256
export function bakeNoise() {
  const N = NOISE_N, out = new Uint8Array(N * N * 4)
  const hash = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 982451653) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296 }
  const vn = (x, y, P, s) => {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
    const w = (a) => ((a % P) + P) % P
    const a = hash(w(i), w(j), s), b = hash(w(i + 1), w(j), s), c = hash(w(i), w(j + 1), s), d = hash(w(i + 1), w(j + 1), s)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
  for (let ch = 0; ch < 4; ch++) {
    const f = new Float32Array(N * N)
    let lo = 1e9, hi = -1e9
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let t = 0, amp = 0.5, n = 0
      for (let o = 0; o < 4; o++) { const P = 8 << o; t += amp * vn((x / N) * P, (y / N) * P, P, 11 + ch * 31 + o * 7); n += amp; amp *= 0.5 }
      const v = t / n
      f[y * N + x] = v; lo = Math.min(lo, v); hi = Math.max(hi, v)
    }
    // stretch to the full range so a threshold means the same thing in every channel
    for (let k = 0; k < N * N; k++) out[k * 4 + ch] = Math.round(((f[k] - lo) / (hi - lo)) * 255)
  }
  return out
}

// ---- the bubbles the shader stamps along the shore (an atlas of BUB_COLS x BUB_ROWS cells) ---------
//  0 peeking   1 grinning   2 dozing   3 surprised   (pie-eyed, inked: they belong to the cast)
//  4, 5 plain boiling bubbles (soft, no ink)   6 a popping ring of droplets   7 a froth cluster
export const BUB_COLS = 4, BUB_ROWS = 2, BUB_CELL = 128   // a power-of-two atlas, so it can be mipmapped
export function paintBubbleAtlas() {
  const S = BUB_CELL, cv = mkCanvas(S * BUB_COLS, S * BUB_ROWS), c = cv.getContext('2d')
  const R = S * 0.3, U = R / 7          // a bubble of radius 7 units fills 0.3 of its cell
  const at = (k, fn) => { c.save(); c.translate((k % BUB_COLS) * S + S / 2, Math.floor(k / BUB_COLS) * S + S / 2); c.scale(U, U); resetXf(); fn(); resetXf(); c.restore() }
  const moods = ['peek', 'grin', 'doze', 'oh'], looks = [[0, -0.7], [0.4, -0.5], [0, 0], [-0.3, -0.6]]
  for (let k = 0; k < 4; k++) at(k, () => peekBubble(c, 0, 0, 7, moods[k], looks[k]))
  const plain = (r, x = 0, y = 0) => {
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35, 0, x, y, r * 1.05)
    g.addColorStop(0, 'rgba(255,246,208,1)'); g.addColorStop(0.5, 'rgba(255,198,80,1)'); g.addColorStop(1, 'rgba(232,104,34,0.92)')
    c.fillStyle = g; c.beginPath(); c.ellipse(x, y, r, r * 0.9, 0, 0, TAU); c.fill()
    c.beginPath(); c.arc(x + r * 0.15, y + r * 0.2, r, 0.2, 2.6); c.lineWidth = 0.55; c.strokeStyle = 'rgba(150,40,14,0.6)'; c.stroke()
  }
  at(4, () => plain(5.5))
  at(5, () => { plain(4.2, -2.5, 1); plain(2.8, 3.5, -1.5) })
  at(6, () => {
    c.beginPath(); c.ellipse(0, 0, 7, 5.6, 0, 0, TAU); c.lineWidth = 0.9; c.strokeStyle = 'rgba(140,30,10,0.75)'; c.stroke()
    c.beginPath(); c.ellipse(0, 0, 9.5, 7.6, 0, 0.5, 2.6); c.lineWidth = 0.6; c.strokeStyle = 'rgba(255,226,150,0.7)'; c.stroke()
    for (let q = 0; q < 6; q++) { const a = (q / 6) * TAU + 0.4; c.beginPath(); c.arc(Math.cos(a) * 10.5, Math.sin(a) * 8.5 - 0.8, 0.9, 0, TAU); c.fillStyle = '#fff0b8'; c.fill() }
  })
  at(7, () => {
    const g = c.createRadialGradient(-2, -2.4, 0, 0, 0, 7)
    g.addColorStop(0, '#fff4c8'); g.addColorStop(0.45, '#ffc24e'); g.addColorStop(1, '#f08a2a')
    c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, 7, 6.3, 0, 0, TAU); c.fill()
    c.lineWidth = 1.3; c.strokeStyle = 'rgba(150,44,16,0.85)'; c.beginPath(); c.ellipse(0, 0, 6.6, 5.9, 0, -0.3, Math.PI + 0.5); c.stroke()
  })
  return cv
}

export const FLOOR_VERT = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
out vec2 vWorld;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
  vWorld = aPosition;
}`

export const FLOOR_FRAG = `precision highp float;
in vec2 vUV;
in vec2 vWorld;
out vec4 finalColor;
uniform sampler2D uHeight;
uniform sampler2D uNoise;
uniform sampler2D uBub;
uniform float uLine;    // the lava's height now
uniform float uSwell;   // 0..1, the shores swelling: the climb is coming
uniform float uTime;
uniform float uPulse;   // a flash at each turn of the tide
uniform float uTexel;
uniform float uStep;
uniform float uUVW;     // height-texture uv per world px
uniform float uLo;      // the ebb's line (the lowest dry ground)
uniform float uHi;      // the hilltops
uniform float uFlood;   // the flood's line: ground under it goes under every cycle
uniform float uWet;     // the highest line of the last flood (rock the lava just left)
uniform float uWetK;    // 0..1, how fresh that is
float hh(vec2 uv) { vec2 t = texture(uHeight, uv).rg; return (t.r * 65280.0 + t.g * 255.0) / 65535.0; }
vec4 nz(vec2 w, float s) { return texture(uNoise, w / s); }
float h12(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float bell(float x, float c, float w) { float q = (x - c) / w; return exp(-q * q); }
// the noise texture is stretched to 0..1; this puts a sample back on a plain fbm scale (mean 0.5, sd 0.13)
float fb(float n) { return 0.5 + (n - 0.43) * 0.76; }

// one bubble per cell of a grid in the lava, between minD and maxD px from the shore; faces is the
// chance a bubble is one of the four with a face. Returns premultiplied colour.
vec4 bubbles(float cellS, float minD, float maxD, float dens, float faces, float rMin, float rMax, float gl, float rate, float fixK) {
  // branch-free up to the one atlas fetch, so the atlas can be mipmapped (small bubbles stay smooth)
  vec2 cell = floor(vWorld / cellS);
  float r0 = h12(cell + 3.1), r1 = h12(cell + 7.7), r2 = h12(cell + 1.3), r3 = h12(cell + 9.9);
  float rad = mix(rMin, rMax, r1);
  float jit = max(0.0, cellS * 0.5 - rad * 1.7 - 1.0);
  vec2 cc = (cell + 0.5) * cellS + (vec2(r2, r3) - 0.5) * 2.0 * jit;
  float hc = hh(vUV + (cc - vWorld) * uUVW);
  float dc = (uLine - hc) / gl;                 // px into the lava at the bubble's centre
  float ph = fract(uTime * rate * (0.6 + 0.8 * r1) + r2 * 7.0);
  float popping = step(0.86, ph);
  float face = step(r3, faces);
  float kf = floor(h12(cell + 5.5) * 3.99);
  if (kf == 2.0 && h12(cell + 6.6) > 0.3) kf = 0.0;   // most of them are awake, peeking
  float k = face > 0.5 ? kf : (popping > 0.5 ? 6.0 : (r1 > 0.5 ? 4.0 : 5.0));
  if (popping > 0.5 && k < 4.0) k = 6.0;
  if (fixK >= 0.0) k = fixK;
  float s = mix(smoothstep(0.0, 0.18, ph), 0.8 + (ph - 0.86) * 3.0, popping);
  vec2 loc = (vWorld - cc) / (rad / 0.3 * max(s, 0.05)) + 0.5;
  float ok = step(r0, dens) * step(minD + rad * 0.6, dc) * step(dc, maxD) * step(0.05, s);
  ok *= step(0.0, loc.x) * step(loc.x, 1.0) * step(0.0, loc.y) * step(loc.y, 1.0);
  vec2 uvA = (vec2(mod(k, 4.0), floor(k / 4.0)) + clamp(loc, 0.0, 1.0)) / vec2(4.0, 2.0);
  vec4 b = texture(uBub, uvA);
  return b * ok * mix(1.0, 1.0 - smoothstep(0.93, 1.0, ph), popping);
}

vec4 beads(float cs, float tgt, float rMin, float rMax, float dens, float gl, vec2 gdir) {
  vec4 acc = vec4(0.0);
  vec2 base = floor(vWorld / cs - 0.5);
  for (int i = 0; i < 4; i++) {
    vec2 cell = base + vec2(mod(float(i), 2.0), floor(float(i) / 2.0));
    float r0 = h12(cell + 2.3), r1 = h12(cell + 5.9);
    vec2 cc = (cell + 0.5) * cs + (vec2(h12(cell + 8.1), r1) - 0.5) * cs * 0.4;
    float hc = hh(vUV + (cc - vWorld) * uUVW);
    float dc = (uLine - hc) / gl;
    float mv = clamp(dc - tgt, -cs, cs);
    cc += gdir * mv;
    float rad = mix(rMin, rMax, r1) * (0.85 + 0.15 * sin(uTime * 3.0 + r0 * 30.0));
    vec2 q = (vWorld - cc) / rad;
    float dq = length(q);
    float on = step(r0, dens) * step(abs(dc - tgt), cs * 0.9) * (1.0 - smoothstep(0.85, 1.0, dq));
    vec3 bc = mix(vec3(1.0, 0.77, 0.3), vec3(1.0, 0.96, 0.8), 1.0 - smoothstep(0.0, 0.55, length(q + vec2(0.32, 0.36))));
    float rimSide = smoothstep(-0.5, 0.6, q.x * 0.6 + q.y * 0.8);
    bc = mix(bc, vec3(0.55, 0.16, 0.06), smoothstep(0.66 - 0.12 * rimSide, 0.88, dq) * (0.45 + 0.5 * rimSide));
    acc = mix(acc, vec4(bc, 1.0), on);
  }
  return acc;
}

void main() {
  vec2 W = vWorld;
  float h = hh(vUV);
  float hx = hh(vUV + vec2(uTexel, 0.0)) - hh(vUV - vec2(uTexel, 0.0));
  float hy = hh(vUV + vec2(0.0, uTexel)) - hh(vUV - vec2(0.0, uTexel));
  vec2 g = vec2(hx, hy) / (2.0 * uStep);
  float gl = max(length(g), 0.00003);
  vec2 gn2 = g / gl;                                       // uphill: toward the dry ground
  vec4 F = nz(W, 40.0);                                   // fine: froth, ragged shore
  float d = (h - uLine) / gl;                              // px from the shore, + on the dry rock
  d += (F.g - 0.5) * 4.0;                                  // a watercolour-ragged edge

  // ---- ROCK: slate-violet watercolour -----------------------------------------------------------
  vec4 B0 = nz(W, 512.0);
  vec4 C0 = nz(W, 192.0);
  float e = clamp((h - uLo) / max(uHi - uLo, 0.01), 0.0, 1.0);
  vec3 RLO = vec3(0.1, 0.1, 0.28), RMID = vec3(0.16, 0.17, 0.42), RHI = vec3(0.27, 0.28, 0.56);
  vec3 rc = e < 0.5 ? mix(RLO, RMID, e * 2.0) : mix(RMID, RHI, (e - 0.5) * 2.0);
  rc *= 1.0 + (B0.b - 0.5) * 0.4;                                        // the broad wash
  // watercolour blooms: a wash dried with its pigment pooled into a darker, granulated edge, paler inside
  float wf = B0.g + (C0.r - 0.5) * 0.06 + (F.a - 0.5) * 0.015;
  float wedge = bell(wf, 0.56, 0.02);
  rc *= 1.0 - wedge * (0.16 + 0.14 * F.b);
  rc *= 1.0 + smoothstep(0.56, 0.62, wf) * 0.1 - smoothstep(0.42, 0.36, wf) * 0.08;
  float bloom = bell(C0.r, 0.5, 0.02) + 0.6 * bell(C0.r, 0.66, 0.018);  // smaller blooms inside
  rc *= 1.0 - bloom * 0.16;
  if (C0.r > 0.5) rc = mix(rc, RMID * 1.15, 0.1);
  vec2 sr = vec2(dot(W, vec2(0.8776, 0.4794)), dot(W, vec2(-0.4794, 0.8776)));
  float streak = texture(uNoise, sr / vec2(330.0, 26.0)).b - 0.5;   // dry brush, dragged on the diagonal
  rc *= 1.0 + streak * 0.34;
  vec4 P = nz(W, 19.0);
  rc *= 1.0 + (P.a - 0.5) * 0.09;                                        // paper tooth
  float gran = step(0.9, h12(floor(W / 1.6)));                          // granulation specks
  rc *= 1.0 - gran * 0.08 * (0.5 + C0.g);
  float shd = clamp((g.x * 0.6 + g.y * 0.8) * 1800.0, -0.45, 0.45);       // hillshade, lit from the upper left
  rc *= 1.0 - shd * 0.75;
  // THE HIGH GROUND, IN PAINT (no line anywhere): the flood mark splits the rock into two washes.
  // Above it (the hills and ridges the flood never reaches) a pale, cool lilac, lit; below it (the
  // basins it fills every cycle) a darker, warmer, burnt wash. Where the two meet the burnt wash dried
  // with its pigment pooled into a broad soft dark edge on the low side, ragged, the way a watercolour
  // wash stops: a band some 20 px wide, never a contour line.
  float hasF = step(0.0, uFlood);
  float dfl = (h - uFlood) / gl + (F.g - 0.5) * 10.0 + (C0.b - 0.5) * 18.0;   // px above the flood mark
  float safe = smoothstep(-6.0, 26.0, dfl) * hasF;
  float sc0 = (1.0 - safe) * hasF;
  rc = mix(rc, rc * vec3(0.78, 0.6, 0.64) + vec3(0.045, 0.01, 0.0), sc0 * (0.62 + 0.25 * C0.b));
  rc = mix(rc, rc * vec3(1.16, 1.14, 1.12) + vec3(0.06, 0.06, 0.1), safe * (0.55 + 0.25 * B0.r));
  float pool = exp(-pow((dfl + 9.0) / 12.0, 2.0)) * hasF * (0.7 + 0.6 * F.b);
  rc = mix(rc, rc * vec3(0.62, 0.5, 0.58), clamp(pool, 0.0, 1.0) * 0.55);
  // pebbles: soft painted blots, no ink
  {
    vec2 pc = floor(W / 46.0);
    float q0 = h12(pc + 2.2);
    if (q0 < 0.22) {
      float pr = 2.5 + 5.0 * h12(pc + 4.4);
      vec2 pp = (pc + 0.5) * 46.0 + (vec2(h12(pc + 6.6), h12(pc + 8.8)) - 0.5) * (40.0 - pr * 2.6);
      vec2 dq = W - pp;
      float sh2 = length((dq - vec2(1.6, 2.0)) / vec2(pr * 1.08, pr * 0.78));
      rc = mix(rc, rc * vec3(0.5, 0.45, 0.6), 0.5 * (1.0 - smoothstep(0.7, 1.2, sh2)));
      float bd = length(dq / vec2(pr, pr * 0.78)) + (F.r - 0.5) * 0.25;
      vec3 pcol = mix(vec3(0.17, 0.15, 0.32), vec3(0.24, 0.22, 0.4), e);
      float lit = 1.0 - smoothstep(0.0, 0.7, length((dq + vec2(pr * 0.3, pr * 0.3)) / vec2(pr * 0.6, pr * 0.42)));
      pcol = mix(pcol, vec3(0.55, 0.52, 0.74), lit * 0.4);
      rc = mix(rc, pcol, 1.0 - smoothstep(0.85, 1.05, bd));
    }
  }
  float dp = max(d, 0.0);
  vec3 glowK = vec3(0.0);
  // rock the lava has just left: a damp, warm wash still drying (darker, rosier), with a soft wet sheen
  // that fades as the rock dries. A wash, never a crust and never a crack.
  float wetb = step(0.0, d) * smoothstep(0.004, -0.004, h - uWet) * uWetK;
  if (wetb > 0.0) {
    rc = mix(rc, vec3(0.17, 0.11, 0.17) + rc * 0.3, wetb * 0.5);
    rc += vec3(0.1, 0.08, 0.12) * smoothstep(0.62, 0.8, C0.b) * wetb * 0.35;
  }
  // THE TIDE COMING: the ground sweats before the lava climbs it (no glowing cracks: that is The Magma).
  //  - the low ground the flood will take darkens to a damp, warm wash and takes a sweaty sheen,
  //    deeper the closer the climb is (uSwell) and the nearer the lava's line;
  //  - soft cartoon steam curls lift off it;
  //  - and on the bank just above the shore little blisters of lava push up through the rock,
  //    swell and pop: where they rise is where the melt is coming.
  float sw = uSwell;
  float throb = 0.5 + 0.5 * sin(uTime * 5.5);
  float scorch = exp(-dp / (24.0 + 90.0 * sw)) * sw * step(0.0, d);
  float lowF = hasF * (1.0 - safe) * smoothstep(uFlood, uLine + 0.004, h);   // 1 at the lava's line, 0 at the flood mark
  float heatB = max(sw * mix(0.35, 1.0, lowF) * (1.0 - safe) * hasF, scorch) * step(0.0, d);
  rc = mix(rc, rc * vec3(0.72, 0.56, 0.6) + vec3(0.03, 0.0, 0.01), heatB * 0.55);
  // the sweat: soft glossy streaks on the damp wash, a sheen that slides as the heat throbs
  float sheen = smoothstep(0.58, 0.74, nz(W + vec2(uTime * 3.0, -uTime * 2.0), 150.0).b + (F.b - 0.5) * 0.12);
  rc += vec3(0.16, 0.09, 0.08) * sheen * heatB * (0.6 + 0.4 * throb);
  // the blisters: one per 30 px cell on the bank, in a band that widens with the swell
  {
    vec2 bc = floor(W / 30.0);
    float q0 = h12(bc + 3.7), q1 = h12(bc + 8.3);
    vec2 bp = (bc + 0.5 + (vec2(h12(bc + 1.1), h12(bc + 2.2)) - 0.5) * 0.5) * 30.0;
    float bph = fract(uTime * (0.25 + 0.3 * q1) + q0 * 9.0);
    float br = (4.5 + 5.5 * q1) * smoothstep(0.0, 0.7, bph) * (1.0 - step(0.9, bph));
    float bd = length((W - bp) / vec2(1.0, 0.82)) / max(br, 0.01) + (F.r - 0.5) * 0.3;
    // thick on the bank, and scattered over all the low ground the flood will take, thicker near the line
    float bandS = step(0.0, d) * (1.0 - smoothstep(10.0 + 40.0 * sw, 18.0 + 60.0 * sw, dp)) * smoothstep(0.08, 0.35, sw);
    float bandL = step(0.0, d) * lowF * smoothstep(0.15, 0.5, sw);
    float bon = max(step(q0, 0.55) * bandS, step(q0, 0.2 + 0.35 * lowF) * bandL) * step(0.3, br);
    vec3 bcol = mix(vec3(0.99, 0.8, 0.36), vec3(0.93, 0.42, 0.16), smoothstep(0.0, 0.85, length((W - bp + br * vec2(0.3, 0.35)) / max(br, 0.01))));
    rc = mix(rc, rc * vec3(1.25, 0.8, 0.62) + vec3(0.12, 0.03, 0.0), bon * (1.0 - smoothstep(1.0, 2.4, bd)) * 0.55);   // the rock glows warm round it
    rc = mix(rc, rc * vec3(0.55, 0.42, 0.45), bon * bell(bd, 1.12, 0.14) * 0.5);   // the wash pooled at its rim
    rc = mix(rc, bcol, bon * (1.0 - smoothstep(0.8, 1.05, bd)));
    // a pop: a ring of soft drops where a blister just burst
    float pk = step(0.9, bph) * bon * (1.0 - smoothstep(0.9, 1.0, bph));
    float pr = length(W - bp) - (4.5 + 5.5 * q1) * (1.0 + (bph - 0.9) * 12.0);
    rc = mix(rc, vec3(0.98, 0.72, 0.32), pk * (1.0 - smoothstep(0.4, 1.4, abs(pr))) * 0.6);
  }
  // steam: soft pale cartoon curls lifting off the low ground (rings of wash drifting up, no line)
  float stm = smoothstep(0.55, 0.85, nz(W + vec2(0.0, uTime * 18.0), 220.0).g * 0.7 + nz(W + vec2(uTime * 6.0, uTime * 30.0), 70.0).r * 0.45);
  rc = mix(rc, vec3(0.7, 0.62, 0.68), stm * heatB * mix(0.4, 1.0, lowF) * 0.25);
  // steam puffs: one per 64 px cell of hot ground, a soft painted cloud of vapour (three overlapping
  // blots, no line) that rises off the rock, swells and thins away
  {
    vec2 sc2 = floor(W / 64.0);
    float s0 = h12(sc2 + 5.1), s1 = h12(sc2 + 6.3);
    float sph = fract(uTime * (0.16 + 0.1 * s1) + s0 * 7.0);
    vec2 sp = (sc2 + vec2(0.15 + 0.7 * h12(sc2 + 7.9), 0.85 - sph * 0.5 - 0.2 * h12(sc2 + 2.6))) * 64.0;
    float sr = 6.0 + 4.0 * s1 + sph * 6.0;
    float blot = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi2 = float(i);
      vec2 o = vec2((fi2 - 1.0) * sr * (0.5 + 0.3 * s1), fi2 == 1.0 ? -sr * 0.25 : sr * 0.15);
      blot = max(blot, 1.0 - smoothstep(0.55, 1.15, length(W - sp - o) / (sr * (fi2 == 1.0 ? 0.95 : 0.78)) + (F.g - 0.5) * 0.35));
    }
    float son = step(s0, 0.24) * blot * sin(3.14159 * sph) * smoothstep(0.0, 0.25, heatB);
    rc = mix(rc, vec3(0.6, 0.55, 0.62), clamp(son, 0.0, 1.0) * 0.24);
  }
  // the lip, lit from the lava below, and the heat climbing the bank as the shores swell
  rc *= 1.0 - 0.3 * exp(-dp / 45.0);                                      // the wash pooled dark at the shore
  rc = mix(rc, vec3(0.42, 0.18, 0.2), (1.0 - smoothstep(0.0, 6.0, dp)) * 0.65);
  rc = mix(rc, vec3(0.93, 0.5, 0.27), exp(-dp / 16.0) * 0.42);
  float heat = exp(-dp / (14.0 + 40.0 * sw)) * sw * (0.65 + 0.35 * throb);
  rc = mix(rc, vec3(1.0, 0.56, 0.18), heat * 0.55);
  rc += glowK;

  // ---- LAVA: swirled gouache marbling (mock f's own recipe, laid on the moving melt) --------------
  // A domain-warped mottle (hot gold crests, dark red troughs), marbled swirl lines along the warp,
  // gouache strokes traced along the flow, darker pools far from shore. All of it drifts slowly.
  float Dd = -d;
  vec2 drift = vec2(uTime * 4.0, -uTime * 2.6);
  vec2 lw = W + drift;
  float wx = fb(nz(lw, 880.0).r) - 0.5, wy = fb(nz(lw + vec2(97.0, 31.0), 880.0).g) - 0.5;
  float mm = fb(nz(lw + vec2(wx, wy) * 166.0 + vec2(uTime * -1.5, uTime * 1.1), 512.0).r);
  vec3 lc = vec3(0.941, 0.494, 0.141);
  lc = mix(lc, vec3(0.769, 0.204, 0.094), smoothstep(0.5, 0.3, mm) * 0.85);
  lc = mix(lc, vec3(0.988, 0.729, 0.212), smoothstep(0.55, 0.7, mm) * 0.9);
  float swv = fb(nz(lw + vec2(wx, wy) * 224.0 + 140.0, 560.0).b) * 4.2, fr = fract(swv);
  lc = mix(lc, vec3(1.0, 0.8, 0.4), bell(fr, 0.1, 0.07) * 0.22);
  lc = mix(lc, vec3(0.627, 0.133, 0.078), bell(fr, 0.55, 0.09) * 0.3);
  // gouache strokes traced along the flow: each a soft tapered streak bending the way the melt bends
  {
    vec2 sbase = floor(lw / 64.0 - 0.5);
    for (int i = 0; i < 4; i++) {
      vec2 cs = sbase + vec2(mod(float(i), 2.0), floor(float(i) / 2.0));
      float q = h12(cs + 4.1);
      vec2 c0 = (cs + 0.5) * 64.0 + (vec2(h12(cs + 1.7), h12(cs + 2.9)) - 0.5) * 40.0;
      float a0 = fb(nz(c0, 1200.0).a) * 11.0;
      float Ls = 7.0 + 17.0 * h12(cs + 5.3);
      vec2 dir = vec2(cos(a0), sin(a0));
      float a1 = fb(nz(c0 + dir * Ls, 1200.0).a) * 11.0;
      float kc = clamp((a1 - a0) / Ls, -0.05, 0.05);
      vec2 r0 = lw - c0;
      float u = dot(r0, dir), v = dot(r0, vec2(-dir.y, dir.x)) - 0.5 * kc * u * u;
      float t = u / Ls;
      float wd = (1.6 + 3.2 * h12(cs + 7.7)) * sin(3.14159 * clamp(t * 0.5 + 0.5, 0.0, 1.0)) * 0.5 + 0.3;
      float k = (1.0 - smoothstep(0.7, 1.0, abs(t))) * (1.0 - smoothstep(wd * 0.2, wd + 2.2, abs(v)));
      // mostly warm gold and deep red strokes; a pale cream one only now and then, and faint
      vec3 scol = q < 0.08 ? vec3(1.0, 0.86, 0.52) : q < 0.5 ? vec3(1.0, 0.7, 0.26) : vec3(0.47, 0.07, 0.055);
      lc = mix(lc, scol, k * (q < 0.08 ? 0.28 : q < 0.5 ? 0.34 : 0.3) * step(q, 0.85) * smoothstep(6.0, 20.0, Dd));
    }
  }
  float dpk = smoothstep(30.0, 90.0, Dd);
  lc = mix(lc, vec3(0.588, 0.118, 0.102), dpk * 0.45 * clamp(0.6 + 0.8 * (fb(nz(lw, 480.0).a) - 0.3), 0.0, 1.0));
  // THE SWELL: a bright band hugging every shore, wider and throbbing while the tide gathers
  float bw = 9.0 + 16.0 * sw;
  float band = exp(-max(Dd, 0.0) / bw);
  lc = mix(lc, vec3(1.0, 0.8, 0.275), band * (0.8 + 0.2 * sw * throb));
  float froth = F.r * 0.6 + P.r * 0.4;
  float fw = 12.0 + 22.0 * sw;
  lc = mix(lc, vec3(1.0, 0.933, 0.659), smoothstep(0.62 - 0.1 * sw, 0.74 - 0.1 * sw, froth) * max(0.0, 1.0 - Dd / fw) * 0.8);
  // the bulge beyond: a broad soft swell of darker melt, never narrow enough to read as an old shoreline
  lc = mix(lc, vec3(0.659, 0.157, 0.094), bell(Dd, 22.0 + 18.0 * sw, 16.0 + 6.0 * sw) * (0.18 + 0.12 * sw) * (0.6 + 0.8 * fb(nz(lw, 300.0).g)));
  lc *= 1.0 + (P.g - 0.5) * 0.06;
  // bubbles: big pie-eyed faces crowding the shores when the tide is gathering, the odd pop out deep
  // two grids of them, so they crowd and overlap along the shore instead of standing in a row
  vec4 b1 = bubbles(40.0, -6.0, 7.0 + 18.0 * sw, 0.62 + 0.38 * sw, 0.6 + 0.35 * sw, 8.0, 10.2 + 1.6 * sw, gl, 0.2 + 0.25 * sw, -1.0);
  lc = lc * (1.0 - b1.a) + b1.rgb;
  vec4 b3 = bubbles(56.0, -7.0, 6.0 + 16.0 * sw, 0.5 + 0.45 * sw, 0.55 + 0.4 * sw, 9.4, 12.6 + 2.0 * sw, gl, 0.17 + 0.2 * sw, -1.0);
  lc = lc * (1.0 - b3.a) + b3.rgb;
  vec4 b0 = beads(17.0, 3.5 + 3.0 * sw, 2.9, 4.4 + 1.0 * sw, 0.9, gl, gn2);
  lc = mix(lc, b0.rgb, b0.a);
  vec4 b2 = bubbles(72.0, 40.0, 1.0e5, 0.55, 0.0, 3.0, 7.0, gl, 0.3, -1.0);
  lc = lc * (1.0 - b2.a) + b2.rgb;
  lc *= 1.0 + 0.35 * uPulse;

  // ---- the soft edge between them (no outline) and the print's grade --------------------------
  vec3 col = mix(lc, rc, smoothstep(-1.3, 1.3, d));
  float L = dot(col, vec3(0.3, 0.59, 0.11));
  // a faded 1930s Technicolor print: the colour sunk a little, warm, the blacks lifted to a plum brown
  float sat = 0.7 + 0.18 * clamp((col.r - col.b) / 0.63, 0.0, 1.0);
  col = L + (col - L) * sat;
  col = col * vec3(1.03, 0.99, 0.88) + vec3(0.034, 0.012, 0.012);
  col = vec3(0.175, 0.12, 0.13) + col * vec3(0.8, 0.79, 0.76);
  col = min(col, vec3(0.98, 0.933, 0.808));
  // the print's grain sits on the painted world at full strength (the cast keeps only the film's light
  // grain, so it stays crisp): clumped, a fresh frame 24 times a second, heaviest in the mid-tones
  float gf = mod(floor(uTime * 24.0), 997.0);
  vec2 go = vec2(h12(vec2(gf, 1.0)), h12(vec2(gf, 2.0))) * 3000.0;
  float gn = (h12(floor((W + go) / 1.1)) - 0.5) * 0.55 + (nz(W + go, 9.0).r - 0.5) * 0.9 + (nz(W + go, 30.0).g - 0.5) * 0.3;
  float Lg = dot(col, vec3(0.3, 0.59, 0.11));
  col += gn * 0.07 * mix(0.45, 1.0, smoothstep(-1.3, 1.3, d)) * (0.55 + 1.8 * Lg * (1.0 - Lg));   // the melt is smoother gouache
  finalColor = vec4(col, 1.0);
}`

// ---- the film pass: a faded print run through an old projector ------------------------------------
// Over the whole stage (the DOM HUD is not in it). A light fade (the floor already carries the heavy
// grade), clumped grain heaviest in the mid-tones, dust specks and the odd hair that change 12 times a
// second, a faint emulsion scratch that wanders, an uneven burnt vignette with an off-centre projector
// hot spot, and the flicker.
export const FILM_VERT = 'in vec2 aPosition;\nout vec2 vTextureCoord;\nout vec2 vScreen;\nuniform vec4 uInputSize;\nuniform vec4 uOutputFrame;\nuniform vec4 uOutputTexture;\n'
  + 'vec4 filterVertexPosition(void) {\n  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;\n  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;\n'
  + '  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;\n  return vec4(position, 0.0, 1.0);\n}\n'
  + 'void main(void) {\n  gl_Position = filterVertexPosition();\n  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);\n  vScreen = aPosition;\n}\n'
export const FILM_FRAG = `precision highp float;
in vec2 vTextureCoord;
in vec2 vScreen;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform float uTime;
uniform float uGrain;
uniform float uVignette;
uniform float uFlicker;
uniform float uSepia;
uniform vec2 uWeave;
uniform float uPx;      // css px per screen texel (the grain's size follows the screen, not the canvas)
float h12(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), f.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec2 lim = uOutputFrame.zw * uInputSize.zw;
  // clamped a texel and a half inside the frame: the gate weave must never sample past the picture
  vec2 uv = clamp(vTextureCoord + uWeave * uInputSize.zw, uInputSize.zw * 0.5, lim - uInputSize.zw * 1.5);
  vec4 c = texture(uTexture, uv);
  vec2 px = vScreen * uOutputFrame.zw * uPx;              // css px
  vec2 sz = uOutputFrame.zw * uPx;
  // every seed wrapped small: a hash of a large float degenerates (the grain would freeze late in a run)
  float fr = mod(floor(uTime * 24.0), 997.0), fr12 = mod(floor(uTime * 12.0), 991.0);
  // a light fade: a little desaturation, warm, lifted blacks, cream whites
  float l = dot(c.rgb, vec3(0.3, 0.59, 0.11));
  c.rgb = mix(c.rgb, vec3(l), uSepia * 0.42);
  c.rgb = c.rgb * vec3(0.97, 0.95, 0.9) + vec3(0.022, 0.014, 0.01);
  // the projector's flicker
  c.rgb *= 1.0 + uFlicker * (h12(vec2(fr, 3.7)) - 0.5) * 2.0;
  // grain: clumped, a fresh frame 24 times a second, heaviest in the mid-tones
  vec2 go = vec2(h12(vec2(fr, 1.0)), h12(vec2(fr, 2.0))) * 400.0;
  float n = (h12(floor(px) + go) - 0.5) * 0.6 + (vn((px + go) / 1.7) - 0.5) * 0.8 + (vn((px + go) / 5.0) - 0.5) * 0.25;
  c.rgb += n * uGrain * 0.8 * (0.55 + 2.0 * l * (1.0 - l));
  // the uneven burnt vignette: an off-centre fall-off and slow blotches burnt into the edges
  vec2 q = (px - sz * vec2(0.48, 0.46)) / max(sz.x, sz.y);
  float v = smoothstep(0.28, 0.85, length(q * vec2(1.0, 0.92)));
  // the burnt blotches wander slowly over the edges: nothing on the print stays put
  vec2 bw = vec2(sin(uTime * 0.11), cos(uTime * 0.083)) * 2.5 + vec2(uTime * 0.013, -uTime * 0.009);
  float blot = vn(px / 260.0 + 3.1 + bw) * 0.7 + vn(px / 90.0 - bw * 2.0) * 0.3;
  c.rgb *= 1.0 - uVignette * v * (0.75 + 0.5 * blot);
  // the projector's hot spot
  vec2 hot = vec2(0.44, 0.42) + vec2(h12(vec2(fr12, 4.1)), h12(vec2(fr12, 4.9))) * 0.012;
  c.rgb += vec3(0.05, 0.038, 0.02) * (1.0 - smoothstep(0.0, 0.42, length((px - sz * hot) / sz)));
  // dust on the print: dark and cream specks, a new handful every twelfth of a second
  vec2 dc = floor(px / 9.0);
  float dh = h12(dc + fr12 * 13.7);
  if (dh > 0.995) {
    vec2 dpos = (dc + vec2(h12(dc + fr12), h12(dc - fr12))) * 9.0;
    float ds = 0.6 + 1.8 * h12(dc * 1.3 + fr12);
    float dd = length(px - dpos) / ds;
    float dark = step(0.4, h12(dc + 77.0 + fr12));
    c.rgb = mix(c.rgb, dark > 0.5 ? vec3(0.11, 0.07, 0.05) : vec3(1.0, 0.96, 0.86), (1.0 - smoothstep(0.7, 1.0, dd)) * 0.75);
  }
  // hairs and curled lint caught in the gate: rare, each for a fraction of a second, never twice in
  // the same place (a new slot every ~0.4 s, about one slot in eight shows one)
  for (int k = 0; k < 2; k++) {
    float hs = mod(floor(uTime * (2.3 + 0.9 * float(k))), 503.0) + float(k) * 17.0;
    if (h12(vec2(hs, 9.1)) < 0.12) {
      vec2 hp = vec2(h12(vec2(hs, 1.3)), h12(vec2(hs, 2.7))) * sz;
      vec2 r = px - hp;
      // a curl: a spiral arm that winds round on itself
      float ang = atan(r.y, r.x) + h12(vec2(hs, 3.1)) * 6.28, rad = length(r);
      float sp = 3.0 + ang * 2.2 + h12(vec2(hs, 4.2)) * 4.0;
      float curl = (1.0 - smoothstep(0.3, 0.85, abs(rad - sp))) * step(rad, 15.0 + 9.0 * h12(vec2(hs, 5.4)));
      float along = r.x, off = r.y - sin(r.x / 9.0 + hs) * 6.0 - r.x * 0.4;
      float strand = (1.0 - smoothstep(0.35, 0.9, abs(off))) * step(abs(along), 24.0);
      float hl = h12(vec2(hs, 6.6)) < 0.5 ? curl : strand;
      c.rgb = mix(c.rgb, vec3(0.12, 0.07, 0.05), hl * 0.55);
    }
  }
  // now and then an emulsion scratch: it comes in short bursts (a third of a second, about one in six),
  // somewhere new each time, jittering sideways from frame to frame, running down part of the frame
  float sb = mod(floor(uTime * 3.0), 499.0);
  if (h12(vec2(sb, 5.3)) < 0.16) {
    float sx = sz.x * (0.12 + 0.76 * h12(vec2(sb, 5.0))) + (h12(vec2(fr, 6.1)) - 0.5) * 5.0 + sin(px.y / 97.0 + sb) * 2.0;
    float y0 = sz.y * h12(vec2(sb, 7.7)) * 0.6, y1 = y0 + sz.y * (0.25 + 0.5 * h12(vec2(sb, 8.3)));
    float on = smoothstep(y0, y0 + 40.0, px.y) * (1.0 - smoothstep(y1 - 40.0, y1, px.y)) * (0.6 + 0.4 * h12(vec2(fr, 9.4)));
    float dark = step(0.6, h12(vec2(sb, 4.4)));
    vec3 scol = dark > 0.5 ? vec3(0.12, 0.07, 0.05) : vec3(1.0, 0.95, 0.84);
    c.rgb = mix(c.rgb, scol, (1.0 - smoothstep(0.2, 0.9, abs(px.x - sx))) * on * 0.22);
  }
  finalColor = vec4(c.rgb, c.a);
}`

// ---- shots and pickups: inked like the cast -------------------------------------------------------
// Painted at res 3 (canvas px per world px). Each -> { canvas, ax, ay, res }.
const RES = 3
function bakeArt(w, h, ax, ay, paint) {
  const cv = mkCanvas(w * RES, h * RES)
  const ctx = cv.getContext('2d')
  ctx.scale(RES, RES); ctx.translate(w * ax, h * ay)
  resetXf(); paint(ctx); resetXf()
  return { canvas: cv, ax, ay, res: RES }
}
const SH_RED = 'rgba(96,6,24,0.42)'
// a red-hot coal: a lumpy glowing ember with a hot core
export function paintCoal(f) {
  return bakeArt(30, 30, 0.5, 0.5, (c) => {
    sc(1.25)
    glow(c, 0, 0, 11, '255,120,40', f ? 0.5 : 0.38)
    cel(c, polar(0, 0, (t) => 4.4 * (1 + 0.13 * Math.sin(t * 4 + 1) + 0.07 * Math.sin(t * 7)), 36), '#cc422a', { ink: 1.4, shade: 'rgba(60,0,10,0.6)', spec: 0.22 })
    cel(c, polar(-0.6, -0.6, (t) => 2.2 * (1 + 0.2 * Math.sin(t * 3 + f)), 20), f ? '#ffe07a' : '#f7c25a', { ink: 0, shade: null })
    line(c, [[-2.5, 1.6], [0, 2.4], [2.5, 1.2]], 0.6, { color: '#5a0a08' })
  })
}
// one puff of a ring (any nova this chapter does not draw itself)
export function paintPuff(v) {
  return bakeArt(30, 26, 0.5, 0.5, (c) => {
    const s = 0.9 + v * 0.15
    puff(c, -3.5 * s, 2, 5.6 * s, '#f5ecd6', 'rgba(120,96,110,0.36)', 1.0)
    puff(c, 4 * s, 1, 4.8 * s, '#f5ecd6', 'rgba(120,96,110,0.36)', 1.0)
    puff(c, 0, -3, 6.2 * s, '#f9f2e2', 'rgba(120,96,110,0.32)', 1.0)
  })
}
// an XP gem: a chunky cartoon cut stone, inked like the cast: flat body colour, a flat pale crown facet
// and a flat dark pavilion facet (no gradients), a thick-thin ink contour and facet lines, and a cream
// twinkle on the blink frame. Tier by colour: teal, violet, red.
export function paintGem(tier, f) {
  const s = [1.25, 1.55, 1.9][tier] ?? 1.25
  const col = ['#4fc2b4', '#8f6ad8', '#e2483c'][tier] ?? '#4fc2b4'
  const hi = ['#bff0e2', '#d9c8f6', '#ffc0a8'][tier] ?? '#bff0e2'
  const lo = ['#23786e', '#4f3592', '#8e1e22'][tier] ?? '#23786e'
  return bakeArt(24 * s, 28 * s, 0.5, 0.5, (c) => {
    sc(s * 1.5)
    const P = [[-2.2, -4.6], [2.2, -4.6], [4.2, -1.6], [0, 5.2], [-4.2, -1.6]]
    cel(c, P, col, { ink: 0, shade: null })
    cel(c, [[-2.2, -4.6], [2.2, -4.6], [4.2, -1.6], [-4.2, -1.6]], hi, { ink: 0, shade: null })
    cel(c, [[1.2, -1.6], [4.2, -1.6], [0, 5.2]], lo, { ink: 0, shade: null })
    line(c, [[-4.0, -1.6], [4.0, -1.6]], 0.55, { taper: 0.2 })
    line(c, [[-1.2, -1.6], [0, 4.6]], 0.45, { taper: 0.3 })
    line(c, [[1.2, -1.6], [0, 4.6]], 0.45, { taper: 0.3 })
    brush(c, P, true, 1.15)
    cel(c, ell(-1.6, -3.1, 0.8, 0.5, -0.3, 10), '#fffbe8', { ink: 0, shade: null })
    if (f) {
      const st = []
      for (let i = 0; i < 8; i++) { const r = i % 2 ? 0.5 : 2.4, t = (i / 8) * Math.PI * 2 - Math.PI / 2; st.push([3.4 + Math.cos(t) * r, -4.4 + Math.sin(t) * r]) }
      cel(c, st, '#fff6d6', { ink: 0.5, shade: null })
    }
  })
}
// a gold coin, spinning (frame = how edge-on it is)
export function paintCoin(f) {
  return bakeArt(22, 22, 0.5, 0.5, (c) => {
    const k = [1, 0.6, 0.2, 0.6][f % 4]
    sc(1.3)
    cel(c, ell(0, 0, 4.6 * k + 0.5, 4.6, 0, 30), '#ecb73a', { ink: 1.2, shade: 'rgba(120,60,10,0.5)', spec: 0.3 })
    if (k > 0.5) { cel(c, ell(0, 0, 2.6 * k, 2.6, 0, 22), '#f6d364', { ink: 0.7, shade: null }) }
  })
}
// a flame licking off a body standing in the lava, and a plain inked bead for any other shot
export function paintLick(f) {
  return bakeArt(22, 28, 0.5, 0.85, (c) => {
    cel(c, flame(0, -1, 3.4, 9 + f, 0.5 - f * 0.3), '#f39a2a', { ink: 1.0, shade: 'rgba(170,50,10,0.4)' })
    cel(c, flame(0.3, -0.5, 1.9, 5 + f * 0.5, 0.4 - f * 0.2), '#fde08a', { ink: 0, shade: null })
  })
}
// a little cartoon star, the kind that spins round a head that has just been hit
export function paintDaze() {
  return bakeArt(14, 14, 0.5, 0.5, (c) => {
    const st = []
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 1.5 : 3.8, t = (i / 10) * TAU - Math.PI / 2; st.push([Math.cos(t) * r, Math.sin(t) * r]) }
    cel(c, st, '#ffd94a', { ink: 1.0, shade: null })
  })
}
export function paintDot() {
  return bakeArt(16, 16, 0.5, 0.5, (c) => cel(c, ell(0, 0, 4.2, 4.2, 0, 24), '#ffc94a', { ink: 1.2, shade: 'rgba(170,60,10,0.4)', spec: 0.3 }))
}
// the lava closing over the legs of a body wading in it: a lip of lava with a bright rim riding up the
// body, rings spreading round it and a few splashed drops (drawn over the body, at its feet)
export function paintWade(f) {
  return bakeArt(40, 24, 0.5, 0.42, (c) => {
    const rx = 11, ry = 4.2
    c.save()
    c.beginPath(); c.rect(-20, -0.6, 40, 20); c.clip()
    c.fillStyle = '#e66a28'; c.beginPath(); c.ellipse(0, 0.8, rx * 1.12, ry * 1.5, 0, 0, TAU); c.fill()
    c.restore()
    c.lineCap = 'round'
    c.strokeStyle = 'rgba(253,226,150,0.95)'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(0, -0.2, rx * 1.05, ry * 0.8, 0, 0.12, Math.PI - 0.12); c.stroke()
    const k = f ? 1.12 : 1
    c.strokeStyle = 'rgba(250,196,100,0.75)'; c.lineWidth = 1.1; c.beginPath(); c.ellipse(0, 1.4, rx * 1.55 * k, ry * 1.7 * k, 0, 0.3, Math.PI - 0.3); c.stroke()
    c.strokeStyle = 'rgba(250,196,100,0.4)'; c.beginPath(); c.ellipse(0, 2.4, rx * 1.95 * k, ry * 2.3 * k, 0, 0.45, Math.PI - 0.45); c.stroke()
    c.fillStyle = 'rgba(252,214,120,0.95)'
    for (const [dx, dy, r] of (f ? [[-13, -3, 1.2], [12, -5, 1.0], [-8, -8, 0.8]] : [[-12, -5, 1.0], [13, -3, 1.2], [9, -8, 0.8]])) { c.beginPath(); c.arc(dx, dy, r, 0, TAU); c.fill() }
  })
}
// sweat drops off a body caught in the lava (the panic tell)
export function paintSweat() {
  return bakeArt(10, 12, 0.5, 0.5, (c) => cel(c, drop(0, 0, 1.6, 3.2), '#d2ebf2', { ink: 0.8, shade: 'rgba(40,60,120,0.35)' }))
}
export { PAL }
