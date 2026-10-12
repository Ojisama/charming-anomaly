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
//             band widens and throbs, the froth thickens, the bank above the lava heats to orange and
//             the shores crowd with pie-eyed bubbles peeking at the dry ground.
//   THE DRAIN rock the lava has just left stays dark and wet, glowing cracks cooling in it.
// Everything is graded in the shader as a faded 1930s print (desaturated, warm, lifted blacks, cream
// whites); the film pass (FILM_FRAG) then adds grain, dust, a scratch, flicker and an uneven vignette.
import { PAL, TAU, mkCanvas } from './palette.js'
import { resetXf, push, pop, tr, rot, sc, ell, polar, drop, tube, qb, line, cel, glove, glow, puff, flame, brush } from './brush.js'
import { peekBubble } from './cast.js'

export const CHUNK = 1024          // world px per floor chunk
export const CHUNK_STEP = 8        // world px between the height samples a chunk's texture holds
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
  float k = face > 0.5 ? floor(h12(cell + 5.5) * 3.99) : (popping > 0.5 ? 6.0 : (r1 > 0.5 ? 4.0 : 5.0));
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
  float sw = uSwell;
  float throb = 0.5 + 0.5 * sin(uTime * 5.5);

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
  float stp = B0.a * 5.0 + h * 14.0, sf = fract(stp);                    // soft painted terraces
  rc *= 1.0 - bell(sf, 0.5, 0.12) * 0.08 + bell(sf, 0.15, 0.08) * 0.06;
  float shd = clamp((g.x * 0.6 + g.y * 0.8) * 1800.0, -0.45, 0.45);       // hillshade, lit from the upper left
  rc *= 1.0 - shd * 0.6;
  // scorched: the basins the flood fills every cycle are darker, warmer, stained
  float sc0 = smoothstep(0.004, -0.03, h - uFlood);
  rc = mix(rc, rc * vec3(0.8, 0.62, 0.66) + vec3(0.05, 0.01, 0.0), sc0 * (0.6 + 0.3 * C0.b));
  // the high-water mark: a ragged rusty crust left where the flood stops, ringing the high ground
  float dfl = (h - uFlood) / gl + (F.g - 0.5) * 6.0;
  float hwm = (bell(dfl, 2.0, 2.2) * 0.8 + bell(dfl, 8.0, 1.6) * 0.35) * smoothstep(0.3, 0.55, F.r + C0.b * 0.4) * step(0.0, uFlood);
  rc = mix(rc, vec3(0.38, 0.15, 0.12), hwm * 0.75);
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
  // rock the lava has just left: dark, wet, its cracks still glowing as they cool
  float wetb = step(0.0, d) * smoothstep(0.004, -0.004, h - uWet) * uWetK;
  if (wetb > 0.0) {
    rc = mix(rc, vec3(0.13, 0.08, 0.12) + vec3(0.06, 0.02, 0.0) * C0.g, wetb * 0.7);
    float crack = bell(C0.g, 0.5, 0.018) * smoothstep(0.3, 0.6, B0.r);
    rc = mix(rc, vec3(0.95, 0.38, 0.12), crack * wetb * uWetK * 0.8);
    rc += vec3(0.2, 0.18, 0.26) * smoothstep(0.6, 0.85, C0.b) * wetb * 0.35;   // the wet sheen
  }
  // the lip, lit from the lava below, and the heat climbing the bank as the shores swell
  float dp = max(d, 0.0);
  rc *= 1.0 - 0.3 * exp(-dp / 45.0);                                      // the wash pooled dark at the shore
  rc = mix(rc, vec3(0.42, 0.18, 0.2), (1.0 - smoothstep(0.0, 6.0, dp)) * 0.65);
  rc = mix(rc, vec3(0.93, 0.5, 0.27), exp(-dp / 16.0) * 0.42);
  float heat = exp(-dp / (14.0 + 40.0 * sw)) * sw * (0.65 + 0.35 * throb);
  rc = mix(rc, vec3(1.0, 0.56, 0.18), heat * 0.55);

  // ---- LAVA: churning gouache -------------------------------------------------------------------
  float Dd = -d;
  vec2 drift = vec2(uTime * 5.0, -uTime * 3.0);
  vec4 A = nz(W + drift, 880.0);
  vec2 wq = W + (A.rg - 0.5) * 2.6 * 64.0 * 2.0;
  vec4 B1 = nz(wq - drift * 0.6, 512.0);
  float m = B1.r;
  vec3 lc = vec3(0.95, 0.48, 0.13);
  lc = mix(lc, vec3(0.77, 0.2, 0.09), smoothstep(0.54, 0.3, m) * 0.8);
  lc = mix(lc, vec3(0.99, 0.72, 0.2), smoothstep(0.6, 0.78, m) * 0.8);
  float swl = B1.g * 3.0 + A.b * 1.5, fr = fract(swl);                   // swirl strokes along the flow
  float smask = smoothstep(0.38, 0.66, nz(wq + 77.0, 300.0).r);
  lc = mix(lc, vec3(1.0, 0.82, 0.43), bell(fr, 0.1, 0.045) * 0.6 * smask);
  lc = mix(lc, vec3(0.63, 0.13, 0.08), bell(fr, 0.55, 0.07) * 0.3 * smask);
  float deep = smoothstep(30.0, 110.0, Dd);
  lc = mix(lc, vec3(0.62, 0.13, 0.1), deep * 0.42 * (0.6 + 0.8 * (A.a - 0.3)));
  // gouache comma strokes laid along the flow, cream and dark red, drifting with it
  {
    vec2 fw = W - drift * 1.4;
    vec2 cs = floor(fw / 58.0);
    float q = h12(cs + 4.1);
    if (q < 0.75) {
      vec2 sc0 = (cs + 0.5) * 58.0 + (vec2(h12(cs + 1.7), h12(cs + 2.9)) - 0.5) * 20.0;
      float ang = nz(sc0, 1400.0).r * 9.0;
      vec2 r0 = fw - sc0;
      vec2 r1 = vec2(dot(r0, vec2(cos(ang), sin(ang))), dot(r0, vec2(-sin(ang), cos(ang))));
      float Ls = 9.0 + 14.0 * h12(cs + 5.3), bend = (h12(cs + 6.1) - 0.5) * 0.06;
      r1.y -= bend * r1.x * r1.x;
      float u = r1.x / Ls;
      float wd = (1.2 + 2.0 * h12(cs + 7.7)) * max(0.0, 1.0 - u * u) * (0.6 + 0.4 * (u + 1.0));
      float k = (1.0 - smoothstep(0.7, 1.0, abs(u))) * (1.0 - smoothstep(wd * 0.5, wd + 0.8, abs(r1.y)));
      vec3 scol = q < 0.55 ? vec3(1.0, 0.86, 0.52) : vec3(0.5, 0.08, 0.06);
      lc = mix(lc, scol, k * (q < 0.55 ? 0.55 : 0.3) * smoothstep(8.0, 24.0, Dd));
    }
  }
  float cdeep = smoothstep(60.0, 160.0, Dd);                                   // cooled crust drifting
  float crust = smoothstep(0.66, 0.78, B1.b) * cdeep;
  lc = mix(lc, vec3(0.5, 0.15, 0.1), crust * 0.5);
  lc = mix(lc, vec3(0.4, 0.1, 0.08), bell(B1.b, 0.67, 0.02) * cdeep * 0.35);   // its edge, pooled darker
  // THE SWELL: a bright band hugging every shore, wider and throbbing while the tide gathers
  float bw = 9.0 + 16.0 * sw;
  float band = exp(-max(Dd, 0.0) / bw);
  lc = mix(lc, vec3(1.0, 0.8, 0.27), band * (0.8 + 0.2 * sw * throb));
  float froth = F.r * 0.6 + P.r * 0.4;
  float fw = 12.0 + 22.0 * sw;
  lc = mix(lc, vec3(1.0, 0.93, 0.66), smoothstep(0.62 - 0.1 * sw, 0.74 - 0.1 * sw, froth) * max(0.0, 1.0 - Dd / fw) * 0.8);
  lc = mix(lc, vec3(0.66, 0.16, 0.094), bell(Dd, 17.0 + 22.0 * sw, 4.5 + 3.0 * sw) * (0.38 + 0.2 * sw));   // the bulge beyond
  lc *= 1.0 + (P.g - 0.5) * 0.06;
  // bubbles: a crowd of faces along the shores when the tide is gathering, the odd pop out deep
  vec4 b1 = bubbles(32.0, 0.0, 12.0 + 22.0 * sw, 0.3 + 0.55 * sw, 0.25 + 0.55 * sw, 6.0, 7.6 + 1.6 * sw, gl, 0.2 + 0.25 * sw, -1.0);
  lc = lc * (1.0 - b1.a) + b1.rgb;
  vec4 b0 = beads(17.0, 3.5 + 3.0 * sw, 2.9, 4.4 + 1.0 * sw, 0.9, gl, gn2);
  lc = mix(lc, b0.rgb, b0.a);
  vec4 b2 = bubbles(128.0, 50.0, 1.0e5, 0.5, 0.0, 6.0, 11.0, gl, 0.35, -1.0);
  lc = lc * (1.0 - b2.a) + b2.rgb;
  lc *= 1.0 + 0.35 * uPulse;

  // ---- the soft edge between them (no outline) and the print's grade --------------------------
  vec3 col = mix(lc, rc, smoothstep(-1.3, 1.3, d));
  float L = dot(col, vec3(0.3, 0.59, 0.11));
  float sat = 0.76 + 0.16 * clamp((col.r - col.b) / 0.63, 0.0, 1.0);
  col = L + (col - L) * sat;
  col = col * vec3(1.02, 0.99, 0.9) + vec3(0.031, 0.008, 0.016);
  col = vec3(0.157, 0.106, 0.125) + col * vec3(0.82, 0.82, 0.8);
  col = min(col, vec3(0.98, 0.933, 0.808));
  // the print's grain sits on the painted world at full strength (the cast keeps only the film's light
  // grain, so it stays crisp): clumped, a fresh frame 24 times a second, heaviest in the mid-tones
  float gf = floor(uTime * 24.0);
  vec2 go = vec2(h12(vec2(gf, 1.0)), h12(vec2(gf, 2.0))) * 3000.0;
  float gn = (h12(floor((W + go) / 1.1)) - 0.5) * 0.55 + (nz(W + go, 9.0).r - 0.5) * 0.9 + (nz(W + go, 30.0).g - 0.5) * 0.3;
  float Lg = dot(col, vec3(0.3, 0.59, 0.11));
  col += gn * 0.13 * (0.55 + 1.8 * Lg * (1.0 - Lg));
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
  vec2 uv = clamp(vTextureCoord + uWeave * uInputSize.zw, vec2(0.0), lim);
  vec4 c = texture(uTexture, uv);
  vec2 px = vScreen * uOutputFrame.zw * uPx;              // css px
  vec2 sz = uOutputFrame.zw * uPx;
  float fr = floor(uTime * 24.0), fr12 = floor(uTime * 12.0);
  // a light fade: a little desaturation, warm, lifted blacks, cream whites
  float l = dot(c.rgb, vec3(0.3, 0.59, 0.11));
  c.rgb = mix(c.rgb, vec3(l), uSepia * 0.5);
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
  float blot = vn(px / 260.0 + 3.1) * 0.7 + vn(px / 90.0) * 0.3;
  c.rgb *= 1.0 - uVignette * v * (0.75 + 0.5 * blot);
  // the projector's hot spot
  c.rgb += vec3(0.05, 0.038, 0.02) * (1.0 - smoothstep(0.0, 0.42, length((px - sz * vec2(0.44, 0.42)) / sz)));
  // dust on the print: dark and cream specks, a new handful every twelfth of a second
  vec2 dc = floor(px / 9.0);
  float dh = h12(dc + fr12 * 13.7);
  if (dh > 0.9965) {
    vec2 dpos = (dc + vec2(h12(dc + fr12), h12(dc - fr12))) * 9.0;
    float ds = 0.6 + 1.8 * h12(dc * 1.3 + fr12);
    float dd = length(px - dpos) / ds;
    float dark = step(0.4, h12(dc + 77.0 + fr12));
    c.rgb = mix(c.rgb, dark > 0.5 ? vec3(0.11, 0.07, 0.05) : vec3(1.0, 0.96, 0.86), (1.0 - smoothstep(0.7, 1.0, dd)) * 0.75);
  }
  // a hair caught in the gate, now and then
  float hs = floor(uTime * 0.7);
  if (h12(vec2(hs, 9.1)) < 0.35) {
    vec2 hp = vec2(h12(vec2(hs, 1.3)), h12(vec2(hs, 2.7))) * sz;
    vec2 r = px - hp;
    float along = r.x, off = r.y - sin(r.x / 9.0 + hs) * 6.0 - r.x * 0.4;
    float hl = (1.0 - smoothstep(0.35, 0.9, abs(off))) * step(abs(along), 22.0);
    c.rgb = mix(c.rgb, vec3(0.12, 0.07, 0.05), hl * 0.6);
  }
  // one long faint emulsion scratch, wandering
  float sx = sz.x * (0.25 + 0.5 * h12(vec2(floor(uTime * 0.4), 5.0))) + sin(px.y / 97.0 + uTime) * 1.6;
  c.rgb += vec3(1.0, 0.95, 0.84) * (1.0 - smoothstep(0.2, 0.8, abs(px.x - sx))) * 0.16;
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
// a lit match in flight, nose +x: its stick, its red head, the flame streaming back, speed lines
export function paintMatch(f) {
  return bakeArt(56, 26, 0.6, 0.5, (c) => {
    sc(1.15)
    for (const [yy, l] of [[-3, 12], [0, 17], [3, 10]]) line(c, [[-8 - l, yy], [-8 - l * 0.5, yy], [-8, yy]], 0.9, { taper: 0.5 })
    cel(c, tube([[-7, 0], [3, 0]], 1.9), '#ecd6a4', { ink: 0.9, shade: 'rgba(120,80,40,0.4)' })
    push(); tr(6.5, 0); rot(-Math.PI / 2 - 0.12 + (f - 1) * 0.12)
    cel(c, drop(0, -4.5, 3.6, 15, -0.5 + (f - 1) * 0.2), '#f5861e', { ink: 1.0, shade: 'rgba(170,50,10,0.42)' })
    cel(c, drop(0, -3.2, 2.0, 8.5, -0.4), '#fbe28a', { ink: 0, shade: null })
    pop()
    cel(c, ell(4.2, 0, 2.6, 2.2, 0, 18), '#c83b33', { ink: 1.0, shade: SH_RED, spec: 0.3 })
  })
}
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
// a pitchfork, tines +x
export function paintPitchfork() {
  return bakeArt(60, 30, 0.5, 0.5, (c) => {
    cel(c, tube([[-25, 0], [8, 0]], 2.6), '#b98a4a', { ink: 1.1, shade: 'rgba(80,40,10,0.45)' })
    cel(c, tube(qb([9, -8], [6, 0], [9, 8]), 2.4), '#8e8a98', { ink: 1.1, shade: 'rgba(30,30,60,0.45)' })
    for (const y of [-8, 0, 8]) {
      cel(c, tube([[8.5, y], [22, y * 0.85]], 2.0, 1.4), '#c9c5d2', { ink: 1.0, shade: 'rgba(30,30,60,0.4)' })
      cel(c, [[21, y * 0.85 - 1.8], [26, y * 0.85], [21, y * 0.85 + 1.8]], '#c9c5d2', { ink: 0.9, shade: null })
    }
  })
}
// one puff of the whistle's steam ring
export function paintPuff(v) {
  return bakeArt(30, 26, 0.5, 0.5, (c) => {
    const s = 0.9 + v * 0.15
    puff(c, -3.5 * s, 2, 5.6 * s, '#f5ecd6', 'rgba(120,96,110,0.36)', 1.0)
    puff(c, 4 * s, 1, 4.8 * s, '#f5ecd6', 'rgba(120,96,110,0.36)', 1.0)
    puff(c, 0, -3, 6.2 * s, '#f9f2e2', 'rgba(120,96,110,0.32)', 1.0)
  })
}
// an XP gem: a cut stone with a shine (tier by colour: teal, violet, red)
export function paintGem(tier, f) {
  const s = [1.05, 1.35, 1.7][tier] ?? 1
  const col = ['#5cc6c0', '#8a6ad4', '#e0483e'][tier] ?? '#5cc6c0'
  return bakeArt(22 * s, 26 * s, 0.5, 0.5, (c) => {
    sc(s * 1.5)
    const P = [[0, -4.4], [3.3, 0], [0, 4.4], [-3.3, 0]]
    cel(c, P, col, { ink: 0, shade: 'rgba(10,30,60,0.5)' })
    cel(c, [[0, -4.4], [3.3, 0], [0, 0]], 'rgba(255,255,255,0.45)', { ink: 0, shade: null })
    cel(c, [[0, 4.4], [-3.3, 0], [0, 0]], 'rgba(20,20,60,0.28)', { ink: 0, shade: null })
    brush(c, P, true, 0.9)
    if (f) cel(c, ell(-1.2, -1.8, 0.9, 0.6, -0.6, 10), '#fffbe8', { ink: 0, shade: null })
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
