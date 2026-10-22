// THE CORE'S RENDERER: the owner-approved Liquid Metal FINAL (docs/superpowers/specs/assets/core-liquid-final.html),
// its WebGL2 passes copied as they stand: the floor (sea, pools, pillar reflections, field rings) with the
// raymarched levitators drawn into it, the body field splatted into two float targets, and the liquid-chrome
// composite. It draws on its OWN canvas under Pixi's (src/liquid.js places it and feeds it the run as the
// demo's shapes, in the demo's world units); Pixi stays transparent over it and draws everything else.
// What differs from the demo, all in frame() and its callers: the world is endless (no arena-edge meniscus),
// there is no Nexus glow, the pillar and pool reaction states are keyed by the game's objects, and the
// player's chrome orb (the demo's pass 4) is the game's mint blob, drawn by Pixi.
// createCoreGL(canvas) -> null without WebGL2, else { resize(cssW, cssH, dpr), frame(S) }
//   S = { cam: {x, y}, VW, VH, rt, rdt, warn, pole, p: {x, y, r, R, hurt}, foes, pools, pillars, sparks } (units)
//   foes: { key, kind: mite|urchin|top|blob|small|eel|golem, x, y, r, pole, latched: {x, y} | null, stun, spike, ph, hx, hy, sw }
//   pools: { key, x, y, rx, ry, rot, pole, seed }   pillars: { key, x, y, r, pole }
//   sparks: { x, y, age, opp, dead, big } (hit droplets and death beads)
const NORTH = 1;
const eelHeadPole = f => NORTH * f.sw;
export function createCoreGL(glc) {
let G = null, POOLS = [], PILLARS = [], VW = 1, VH = 1, rt = 0, rdt = 0;
const eelLeadsHead = f => eelHeadPole(f) !== G.pole;
function eelSegs(f) { const sp = 0.036; return [{ x: f.x, y: f.y, pole: eelHeadPole(f), head: true }, { x: f.x - f.hx * sp, y: f.y - f.hy * sp, pole: -eelHeadPole(f), head: false }]; }
const gl = glc.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
if (!gl) return null;
const FLOAT = !!gl.getExtension('EXT_color_buffer_float');
const mkRnd = s => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
const sst = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
// tileable value noise, CPU-baked (no hash on the GPU)
function tileNoise(S, P, rnd) {
  const g = new Float32Array(P * P).map(() => rnd()), o = new Float32Array(S * S);
  for (let y = 0; y < S; y++) { const fy = y / S * P, iy = fy | 0, ty = sst(fy - iy), y0 = iy % P * P, y1 = (iy + 1) % P * P;
    for (let x = 0; x < S; x++) { const fx = x / S * P, ix = fx | 0, tx = sst(fx - ix), x0 = ix % P, x1 = (ix + 1) % P;
      const a = g[y0 + x0] + (g[y0 + x1] - g[y0 + x0]) * tx, b = g[y1 + x0] + (g[y1 + x1] - g[y1 + x0]) * tx; o[y * S + x] = a + (b - a) * ty; } }
  return o;
}
const F32 = new Float32Array(1), U32 = new Uint32Array(F32.buffer);
const f2h = v => { F32[0] = v; const x = U32[0], sg = (x >> 16) & 0x8000, e = ((x >> 23) & 0xff) - 112; return e <= 0 ? sg : e >= 31 ? sg | 0x7c00 : sg | (e << 10) | ((x >> 13) & 0x3ff); };
function tex(unit, w, h, data, fmt, repeat, mip) {
  const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  if (data instanceof HTMLCanvasElement) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, data);
  else if (fmt === 16) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, data);
  else gl.texImage2D(gl.TEXTURE_2D, 0, fmt === 1 ? gl.R8 : gl.RGBA8, w, h, 0, fmt === 1 ? gl.RED : gl.RGBA, gl.UNSIGNED_BYTE, data);
  const wr = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (mip) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  return t;
}
// unit 0: the heat field of the melt (512, tiles every 2 world units): G heat (hot upwellings high), BA its slope,
// baked as half floats: it is magnified 4-8x on screen, and 8-bit steps showed as stepped river edges and a faint mosaic
{ const S = 512, rnd = mkRnd(7), M = S - 1;
  const h1 = tileNoise(S, 4, rnd), h2 = tileNoise(S, 7, rnd), phi = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) phi[i] = 0.7 * h1[i] + 0.3 * h2[i];
  let pmin = 9, pmax = -9; for (const v of phi) { pmin = Math.min(pmin, v); pmax = Math.max(pmax, v); }
  const d = new Uint16Array(S * S * 4), gxa = new Float32Array(S * S), gya = new Float32Array(S * S); let gm = 1e-6;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const k = y * S + x; gxa[k] = phi[y * S + ((x + 1) & M)] - phi[y * S + ((x - 1) & M)]; gya[k] = phi[((y + 1) & M) * S + x] - phi[((y - 1) & M) * S + x]; gm = Math.max(gm, Math.abs(gxa[k]), Math.abs(gya[k])); }
  for (let k = 0; k < S * S; k++) { d[k * 4 + 1] = f2h((phi[k] - pmin) / (pmax - pmin)); d[k * 4 + 2] = f2h(0.5 + 0.5 * gxa[k] / gm); d[k * 4 + 3] = f2h(0.5 + 0.5 * gya[k] / gm); }
  tex(0, S, S, d, 16, true, false); }
// unit 1: smooth noise (256): RG warp, B clouds for the reflections
{ const S = 256, rnd = mkRnd(41), a = tileNoise(S, 6, rnd), b = tileNoise(S, 6, rnd), c = tileNoise(S, 12, rnd), d = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) { d[i * 4] = a[i] * 255; d[i * 4 + 1] = b[i] * 255; d[i * 4 + 2] = c[i] * 255; d[i * 4 + 3] = 255; }
  tex(1, S, S, d, 4, true, true); }
// unit 3: falloff atlas for the splats (1024, 4x4 cells of 256: magnified bilinear contours showed kinks). Field 0.5 at the body edge, 0 by the cell border.
const SHAPES = [
  [(r, a) => r - 0.5, 1],                                                                        // 0 round
  [(r, a) => r - (0.43 + 0.13 * (0.5 + 0.5 * Math.cos(5 * a)) ** 2), 0.8],                       // 1 mite: five soft points
  [(r, a) => r - (0.36 + 0.42 * (0.5 + 0.5 * Math.cos(14 * a)) ** 12), 0.5],                     // 2 urchin: fourteen spines
  [(r, a) => r - (0.42 + 0.1 * Math.cos(4 * a)), 0.8],                                           // 3 top: quatrefoil
  [(r, a) => r - (0.38 + 0.2 * Math.max(0, Math.cos(a)) ** 5), 0.9],                             // 4 eel end, pointing +x
  [(r, a) => r - (0.46 + 0.04 * Math.cos(3 * a + 1) + 0.03 * Math.cos(5 * a + 2) + 0.025 * Math.cos(7 * a)), 1], // 5 lumpy
];
function fan(n, spread, L, w0) {
  return (x, y) => { let s = 9;
    for (let k = 0; k < n; k++) { const an = -spread + 2 * spread * k / (n - 1), c = Math.cos(an), sn = Math.sin(an), u = x * c + y * sn, v = -x * sn + y * c, Lk = L * (0.72 + 0.28 * Math.cos(an * 1.5));
      s = Math.min(s, u < 0 ? Math.hypot(u, v) - w0 : u > Lk ? Math.hypot(u - Lk, v) : Math.abs(v) - w0 * (1 - u / Lk)); }
    return s; };
}
const FANS = [[fan(5, 0.8, 0.95, 0.12), 0.3], [fan(6, 0.75, 0.95, 0.07), 0.25],         // 6 blob spikes, 7 golem spikes (unused)
  [(x, y) => x < 0 ? Math.hypot(x, y) - 0.15 : x > 0.88 ? Math.hypot(x - 0.88, y) : Math.abs(y) - 0.15 * Math.pow(1 - x / 0.88, 1.4), 0.22]]; // 8 one cone
{ const S = 1024, d = new Uint8Array(S * S);
  for (let ci = 0; ci < 9; ci++) { const ox = ci % 4 * 256, oy = (ci / 4 | 0) * 256;
    for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
      const x = (i + 0.5) / 128 - 1, y = (j + 0.5) / 128 - 1, r = Math.hypot(x, y), a = Math.atan2(y, x);
      // shapes shrunk by Z inside the cell so the falloff tail reaches twice the body radius: neighbours neck and fuse early
      const Z = 0.8, [fn, wf] = ci < 6 ? SHAPES[ci] : FANS[ci - 6], s = (ci < 6 ? fn(r / Z, a) : fn(x / Z, y / Z)) * Z;
      d[(oy + j) * S + ox + i] = 255 * sst(0.5 - s / (wf * 1.25)) * (1 - sst((r - 0.84) / 0.14));
    } }
  tex(3, S, S, d, 1, false, true); }
// unit 4: the player orb's normal map (the demo's atlas cell 1 alone). A: 0 outside, 0.33 dark outline, 0.66 chrome
{ const S = 256, d = new Uint8Array(S * S * 4), hg = new Float32Array(S * S);
  const orb = (x, y) => { const r = Math.hypot(x, y / 0.91); if (r > 0.84) return [0, 0]; return [Math.sqrt(Math.max(0, 0.76 * 0.76 - r * r)), r > 0.75 ? 0.33 : 0.66]; };
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const [h, reg] = orb((i + 0.5) / 128 - 1, (j + 0.5) / 128 - 1); hg[j * S + i] = h; d[(j * S + i) * 4 + 3] = reg * 255; }
  const H0 = (a, b) => hg[Math.min(S - 1, Math.max(0, b)) * S + Math.min(S - 1, Math.max(0, a))];
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const dx = (H0(i + 1, j) - H0(i - 1, j)) * 64, dy = (H0(i, j + 1) - H0(i, j - 1)) * 64, k = 1 / Math.hypot(dx, dy, 1), o = (j * S + i) * 4;
    d[o] = (0.5 - 0.5 * dx * k) * 255; d[o + 1] = (0.5 - 0.5 * dy * k) * 255; d[o + 2] = (0.5 + 0.5 * k) * 255; }
  tex(4, S, S, d, 4, false, true); }
// ---------- shaders ----------
const HDR = '#version 300 es\nprecision highp float; precision highp sampler2D;\n';
const ENV = `
const vec3 NC = vec3(1.25, 0.2, 0.22), SC = vec3(0.25, 0.6, 1.0), SILV = vec3(0.6, 0.64, 0.7), MINT = vec3(0.49, 0.89, 0.76);
// mirror chrome seen from straight above: the reflected ray looks at a pole-tinted sky (r.z > 0)
// or down at the molten floor (r.z < 0); the horizon between them is a hard hot line
vec3 chrome(vec3 n, vec3 tint, vec3 ground, float cloud) {
  vec3 r = vec3(2.0 * n.z * n.xy, 2.0 * n.z * n.z - 1.0);
  float e = dot(r, normalize(vec3(0.3, 0.75, 0.6))) + (cloud - 0.5) * 0.32;
  vec3 sky = mix(tint * 1.7, tint * 0.18 + vec3(0.02, 0.024, 0.03), smoothstep(0.15, 0.8, e)) * (0.45 + 1.1 * cloud * cloud);
  vec3 col = mix(ground, sky, smoothstep(-0.025, 0.025, e));
  col += vec3(1.0, 0.94, 0.86) * exp(-abs(e) * 30.0) * 0.85;
  col += vec3(1.0) * pow(max(dot(r, normalize(vec3(-0.5, -0.6, 0.62))), 0.0), 36.0) * 2.4;
  col += vec3(1.0, 0.6, 0.3) * pow(max(dot(r, normalize(vec3(0.55, 0.5, 0.66))), 0.0), 40.0) * 0.6;
  return col;
}
// wet black ferrofluid seen from above: the skin itself is ink-black, everything you see is reflection. Overhead is a
// dim pole-tinted dome, the horizon a hot ring of the pool's own pole light (so slopes, the meniscus and every spike
// flank glow red or blue), plus a broad white softbox and a sharp key glint that stretch and slide as the skin moves
vec3 ferro(vec3 n, vec3 pc, float cloud, float ink) {
  vec3 r = vec3(2.0 * n.z * n.xy, 2.0 * n.z * n.z - 1.0);
  // overhead: a near-black dome; low all round: the pool's own pole light, so the steeper the skin (the meniscus,
  // each spike toward its tip) the brighter it glows red or blue, and the flat skin stays black
  float hor = smoothstep(0.45, -0.35, r.z) * (1.0 - 0.6 * smoothstep(-0.35, -0.85, r.z));
  vec3 col = vec3(0.006, 0.007, 0.01) + pc * (0.05 + 1.25 * hor * (1.0 - 0.85 * ink) * (0.75 + 0.5 * cloud));
  // a broad pole-tinted softbox overhead, set so the flat skin sits right on its edge: the slow swells push that edge
  // back and forth, so coloured sheens slide and stretch across the black puddle even at rest
  float wb = dot(r, normalize(vec3(0.35, 0.25, 0.9))) + (cloud - 0.5) * 0.03, bw = fwidth(wb) + 0.003;
  col += pc * smoothstep(0.86 - bw, 0.95 + bw, wb) * 0.4 * (1.0 - ink);
  // a big pale softbox low on the upper-left horizon: every spike flank (and the rim) facing it carries a long bright streak,
  // which is what makes a black spike read as a raised cone from straight above
  float sd = dot(r.xy / (length(r.xy) + 1e-4), vec2(-0.6, -0.8)), sdw = fwidth(sd) + 0.01;
  col += mix(vec3(0.9, 0.93, 1.0), pc, 0.2) * smoothstep(0.6 - sdw, 0.85 + sdw, sd) * smoothstep(-0.95, -0.5, r.z) * (1.0 - smoothstep(0.5, 0.78, r.z)) * 1.2;
  col *= 1.0 - 0.6 * smoothstep(0.2, 0.8, -sd) * hor;                         // the flank turned away falls into shadow
  float wn = dot(r, normalize(vec3(-0.38, -0.5, 0.78))) + (cloud - 0.5) * 0.04, ww = fwidth(wn) + 0.003;
  col += vec3(0.92, 0.95, 1.0) * smoothstep(0.958 - ww, 0.972 + ww, wn) * 0.75;
  col += vec3(1.0) * pow(max(dot(r, normalize(vec3(-0.5, -0.6, 0.62))), 0.0), 90.0) * 2.6;
  return col;
}`;
const VS_FULL = HDR + 'in vec2 aP; void main(){ gl_Position = vec4(aP, 0.0, 1.0); }';
const VS_Q = HDR + 'in vec2 aP; in vec2 aU; in vec4 aK; out vec2 vU; out vec4 vK; void main(){ vU = aU; vK = aK; gl_Position = vec4(aP, 0.0, 1.0); }';
const PIL = `
// PILLAR (raymarched): world x,y + height z. The camera ray through a screen point s runs (s.x, s.y + z*PK, z), so a body
// lifts up the screen by PK per unit of height while every footprint stays true on the floor; the sea mirrors it downward
const float PK = 0.55, PZT = 0.19, RB = 0.035;
// the pillar's reaction to the nearest opposite (k > 0, pull) or same-pole (k < 0, push) body, eased on the CPU; D points at it
vec2 pilD = vec2(1.0, 0.0); float pilK = 0.0, pilPh = 0.0;
float pilSeed(vec2 c) { return fract(c.x * 7.31 + c.y * 3.17); }
float pilSmin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
// chrome seen along the oblique camera: the normal goes into the view frame, then the same sky/horizon/glint as every body
vec3 pilChrome(vec3 n, vec3 p, vec3 tint, float t, float refl) {
  vec3 E = normalize(vec3(0.0, PK, 1.0)), Y = normalize(vec3(0.0, 1.0, 0.0) - E * E.y);
  vec3 m = refl > 0.5 ? vec3(n.xy, -n.z) : n;
  vec3 v = normalize(vec3(m.x, dot(m, Y), max(dot(m, E), 0.04)));
  float cl = textureLod(uN, p.xy * 3.0 + vec2(p.z * 4.0 + t * 0.02, 0.0), 0.0).b;
  vec3 ground = vec3(0.05, 0.052, 0.06) + vec3(0.55, 0.2, 0.05) * exp(-max(p.z, 0.0) * 70.0);
  return chrome(v, tint, ground, cl);
}

// LEVITATOR: a short polished plinth standing in the sea (its foot is the collision edge), a thread of liquid metal on
// the axis, and a CONVEYOR of three chrome rings always evenly spaced along it: each condenses out of the thread at the
// top, slides down and sinks into the plinth (a flash of pole light round its top as it is absorbed), over and over.
// The conveyor's phase is integrated on the CPU (pilPh): at rest it drifts slowly down; an opposite pole speeds the flow
// down; a same pole reverses it, rings born out of the plinth and rising to dissolve at the top. The whole column also
// bends toward the body (opposite) or away (same), the rings riding the bent axis and tilting with it
const float HP = 0.022, LZT = 0.135;
float levZ(float u) { return HP - 0.0075 + u * (LZT - HP + 0.0075); }
vec2 levAx(float z, float sd, float t) { float u = clamp((z - HP) / (LZT - HP), 0.0, 1.0); vec2 b = pilD * pilK * (0.085 * u * u + 0.024 * sin(3.1416 * u));
  return vec2(b.x, b.y > 0.0 ? b.y * 0.5 : b.y); }   // a lean toward the camera is halved so the stack never folds onto its own foot
vec2 pilMap(vec3 p, float pl, float sd, float t) {
  float r = length(p.xy);
  vec2 q = vec2(r - RB + 0.0035, abs(p.z - (HP - 0.02) * 0.5) - (HP + 0.02) * 0.5 + 0.0035);
  float d = min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - 0.0035;
  d = max(d, -(length(vec2(r, p.z - HP - 0.0105)) - 0.012));                 // a shallow lens dish in the top
  vec2 res = vec2(d, 0.0);
  float cz = clamp(p.z, HP - 0.004, LZT), u = (cz - HP) / (LZT - HP);
  float wr = 0.0026 + 0.0011 * (0.5 + 0.5 * sin(p.z * 190.0 + t * 2.0 + sd * 6.0)) + 0.0012 * (1.0 - u) + 0.0012 * max(pilK, 0.0);
  float dc = (length(vec2(length(p.xy - levAx(cz, sd, t)), p.z - cz)) - wr) * 0.7;
  float dj = pilSmin(res.x, dc, 0.006); res = vec2(dj, dc < d ? 2.0 : 0.0);
  vec2 dp = vec2(-pilD.y, pilD.x);
  for (int i = 0; i < 3; i++) { float fi = float(i), uf = 1.0 - fract(pilPh + fi / 3.0), hz = levZ(uf);
    float gr = smoothstep(1.0, 0.8, uf);                                     // born from nothing at the top (or dissolving there)
    vec3 rp = p - vec3(levAx(hz, sd, t), hz);
    float ph = t * (0.22 + 0.05 * fi) * pl + fi * 2.1 + sd * 6.28;
    rp.z -= 0.12 * (1.0 - abs(pilK)) * dot(rp.xy, vec2(cos(ph), sin(ph)));  // a slow precessing wobble, held still while it reacts
    float ta = pilK * (0.3 + 0.2 * uf), uu = dot(rp.xy, pilD), vv = dot(rp.xy, dp), ca = cos(ta), sa = sin(ta);
    rp = vec3((uu * ca - rp.z * sa) * pilD + vv * dp, uu * sa + rp.z * ca);  // tilted with the bend: toward the body (k > 0) or away
    float Rm = (0.0265 - 0.0075 * uf) * (0.6 + 0.4 * gr), tr = 0.0058 * gr + 0.0002;
    float an = atan(rp.y, rp.x), sp = t * 0.35 * pl;
    tr *= 1.0 - 0.16 * smoothstep(0.82, 0.97, cos(4.0 * an + sp + fi * 2.0)); // four machined grooves show the ring turning
    float dt = length(vec2(length(rp.xy) - Rm, rp.z * 1.15)) - tr;
    if (dt < res.x) res = vec2(dt, 1.0);
  }
  return res;
}
// pole light leaking round the (bent) axis: brighter when it pulls, dimmer when it pushes
float pilGlow(vec3 p, float pl, float sd, float t) {
  float r = length(p.xy - levAx(p.z, sd, t));
  return 0.14 * (1.0 + 1.6 * max(pilK, 0.0) - 0.5 * max(-pilK, 0.0)) * exp(-r / 0.008) * smoothstep(0.012, 0.022, p.z) * (1.0 - smoothstep(LZT - 0.02, LZT, p.z)) * (0.85 + 0.15 * sin(t * 1.3 + sd * 9.0));
}
vec4 pilFloor(vec3 e, float pl, float sd, float t, vec3 pc) { return vec4(0.0); }
// the rings' soft shadow on the plinth top (lamp up-left, as every glint): the gap between ring and shadow IS the height
float pilShadow(vec3 p, float pl, float sd, float t) {
  vec3 L = normalize(vec3(-0.4, -0.5, 0.75)); float res = 1.0, tt = 0.002;
  for (int i = 0; i < 18; i++) { float h = pilMap(p + L * tt, pl, sd, t).x; res = min(res, 9.0 * h / tt); tt += clamp(h, 0.002, 0.012); if (res < 0.02 || tt > 0.16) break; }
  return 0.3 + 0.7 * clamp(res, 0.0, 1.0);
}
// the flash round the plinth top as a ring sinks into it (or is born out of it): a bright pole-lit ripple at the ring's radius
float levFlash(float r) {
  float f = 0.0;
  for (int i = 0; i < 3; i++) { float uf = 1.0 - fract(pilPh + float(i) / 3.0), a = smoothstep(0.13, 0.0, uf);
    f += a * exp(-pow((r - 0.026) / 0.0045, 2.0)); }
  return f;
}
vec3 pilSurf(vec3 p, vec3 n, float mat, float pl, float sd, float t, float refl, vec3 pc) {
  vec2 ax = levAx(p.z, sd, t); float r = length(p.xy), ra = length(p.xy - ax);
  vec3 tint = mix(SILV, pc, mat > 1.5 ? 0.6 : 0.18);
  vec3 col = pilChrome(n, p, tint, t, refl) * (mat > 0.5 && mat < 1.5 ? 0.9 : 0.78);
  if (mat < 0.5 && refl < 0.5) col *= pilShadow(p + n * 0.0015, pl, sd, t);
  if (mat < 0.5) col = mix(col, pc * (0.55 + 0.35 * n.z) * (1.0 + 0.5 * max(pilK, 0.0)) + vec3(0.03), smoothstep(0.0125, 0.008, r) * step(0.0125, p.z) * 0.85);   // the lens: pole light
  if (mat < 0.5) col += (pc * 0.9 + vec3(0.25)) * levFlash(r) * step(HP - 0.004, p.z) * (1.0 - 0.5 * refl);
  if (mat > 0.5 && mat < 1.5) col += pc * 0.75 * (1.0 + 1.3 * max(pilK, 0.0) - 0.5 * max(-pilK, 0.0)) * max(0.0, -dot(n.xy, (p.xy - ax) / max(ra, 1e-4))) * (1.0 - 0.5 * n.z) * (1.0 - 0.4 * refl);   // inner faces lit by the axis
  // the side facing you burns brighter when it pulls (drawing you in); when it pushes the light flees to the far side
  if (mat > 0.5 && mat < 1.5) col += pc * 0.9 * abs(pilK) * smoothstep(0.1, 0.9, dot((p.xy - ax) / max(ra, 1e-4), pilD * sign(pilK))) * (1.0 - 0.5 * refl);
  if (mat > 1.5) col += pc * (0.3 + 0.3 * max(pilK, 0.0));
  if (refl > 0.5) col = col * 0.42 + pc * 0.06;
  return col;
}
vec3 pilNorm(vec3 p, float pl, float sd, float t) {
  const vec2 e = vec2(0.0005, -0.0005);
  return normalize(e.xyy * pilMap(p + e.xyy, pl, sd, t).x + e.yyx * pilMap(p + e.yyx, pl, sd, t).x + e.yxy * pilMap(p + e.yxy, pl, sd, t).x + e.xxx * pilMap(p + e.xxx, pl, sd, t).x);
}
// refl 0: the camera ray; 1: the same ray mirrored in the sea (what the reflection shows). rgb + coverage
vec4 pilView(vec2 s, float plk, float ang, float sd, float t, float pix, float refl) {
  if (abs(s.x) > 0.2 || s.y > 0.165 + 0.085 * refl || s.y < -0.235 + 0.07 * refl) return vec4(0.0);
  float pl = sign(plk); pilK = abs(plk) - 2.0; float an0 = floor(ang) / 1024.0 * 6.2832 - 3.1416; pilPh = fract(ang); pilD = vec2(cos(an0), sin(an0));
  float L = sqrt(1.0 + PK * PK);
  vec3 dr = vec3(0.0, -PK, refl > 0.5 ? 1.0 : -1.0) / L, o = refl > 0.5 ? vec3(s, 0.0) : vec3(s.x, s.y + PZT * PK, PZT);
  float tmax = PZT * L, tt = 0.0, dm = 1.0, tm = 0.0, mat = 0.0, gw = 0.0;
  for (int i = 0; i < 60; i++) {
    vec3 p = o + dr * tt; vec2 m = pilMap(p, pl, sd, t);
    float st = max(m.x * 0.75, pix * 0.4);
    gw += pilGlow(p, pl, sd, t) * min(st, 0.006);
    if (m.x < dm) { dm = m.x; tm = tt; mat = m.y; }
    if (m.x < pix * 0.25 || tt > tmax) break;
    tt += st;
  }
  float a = 1.0 - smoothstep(pix * 0.25, pix * 1.2, dm);
  vec3 pc = pl > 0.0 ? NC : SC, col = vec3(0.0);
  if (a > 0.0) { vec3 p = o + dr * tm; col = pilSurf(p, pilNorm(p, pl, sd, t), mat, pl, sd, t, refl, pc); }
  vec4 fl = refl > 0.5 ? vec4(0.0) : pilFloor(o + dr * tmax, pl, sd, t, pc);
  col = mix(fl.rgb, col, a); a = max(a, fl.a);
  col += pc * gw; a = max(a, min(1.0, gw * 3.0));
  return vec4(col, a);
}
`;
const FS_FLOOR = HDR + ENV + `
uniform sampler2D uC, uN, uV, uNM; uniform vec2 uRes, uCam, uView, uPl; uniform float uT, uPole, uNex, uPix; uniform vec2 uSh;
uniform vec4 uPool[8]; uniform vec2 uPoolB[8]; uniform vec4 uPoolR[8]; uniform vec4 uPoolF[8]; uniform int uNP; uniform vec4 uPil[8]; uniform int uNPil; uniform vec3 uGol[4]; uniform int uNG;
out vec4 o;
uniform vec4 uWk[32]; uniform int uNW;
${PIL}

// a ferrofluid puddle as a HEIGHT FIELD (world units), in the pool's own frame l. rad = radii, al = the pull point
// (the player, eased and held near the shore), kO = opposite-pole stand-up, kS = same-pole recoil (both eased on the CPU,
// fast up and slow down, so spikes slump back heavily). spk returns the spike part, for the trough light.
uint hsh(ivec2 c) { uint h = uint(c.x) * 73856093u ^ uint(c.y) * 19349663u; h ^= h >> 13; h *= 1274126177u; return h ^ (h >> 16); }
// the SPILL, an INK BLOT of black ferrofluid: the outline is the threshold of a sum of soft blobs in the ellipse-normalised
// frame e = l / rad: a fat core, six blot lobes, satellite beads and a spatter of droplets, plus nine capillary fingers that
// creep out of the shore like ink wicking into paper (curled, some forked), and a fine bitten edge. All seeded per pool
// and drifting slowly. THE EDGE IS THE MAGNET'S: gM = the magnet (you) in e-space + the field (z: + attract, - repel,
// ~1/d^2, eased fast on the CPU). Attracted, the fingers facing you straighten along the field and race out as sharp
// tongues (thin, up to ~0.6 R past the shore), the body draws out into a comet with a neck, the bitten edge boils, the
// droplets crawl toward you and the far shore pulls in; repelled, the near shore caves in a bite and the mass heaps up
// behind. F.xy = the slow bulk flow, F.z = the pool's seed. Returns the signed distance to the shore in world units.
float kern(vec2 e, vec2 c, float r, float a, inout vec2 g) {
  vec2 d = (e - c) / r; float x2 = dot(d, d); if (x2 >= 1.0) return 0.0;
  float m = 1.0 - x2; g -= a * 6.0 * m * m / r * d; return a * m * m * m;
}
// a tapered capsule (a finger segment from a to b, radius wa -> wb), as a soft blob round the nearest point on its axis
float seg(vec2 e, vec2 a, vec2 b, float wa, float wb, float amp, inout vec2 g) {
  vec2 ab = b - a; float s = clamp(dot(e - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  return kern(e, a + ab * s, mix(wa, wb, s), amp, g);
}
float rnd(uint h, uint b) { return float((h >> b) & 1023u) / 1023.0; }
vec2 prp(vec2 v) { return vec2(-v.y, v.x); }
// the texture-driven part of the spill (the warp octaves and the bitten edge) is sampled ONCE per pixel and held for the
// three height samples: bilinear noise has creased derivatives, and differencing through it drew ridges
vec3 gW; vec3 gM;
vec3 spillWarp(vec2 l, vec2 rad, vec3 F) {
  vec2 e = l / rad; vec2 sd = F.z * vec2(0.173, 0.291);
  float T = max(gM.z, 0.0), fc = max(dot(normalize(e + 1e-5), normalize(gM.xy + 1e-5)), 0.0);
  float boil = uT * (0.01 + 0.09 * T * fc);                                    // the edge facing the magnet boils
  float bite = (textureLod(uN, e * 0.17 + sd.yx + vec2(boil, -boil * 0.7), 0.0).b - 0.5) * 0.1
             + (textureLod(uN, e * 0.43 + sd - vec2(boil * 1.3, boil), 0.0).b - 0.5) * 0.06 * (1.0 + 1.5 * T * fc);
  return vec3((textureLod(uN, e * 0.2 + sd + uT * vec2(0.004, -0.003), 0.0).rg - 0.5) * 0.24
            + (textureLod(uN, e * 0.55 + sd.yx - uT * vec2(0.006, 0.004), 0.0).gr - 0.5) * 0.09, bite);
}
float body(vec2 l, vec2 rad, vec3 F, out float fw, out float fv) {
  vec2 e = l / rad; float fm = length(F.xy); vec2 fd = F.xy / rad; fd /= length(fd) + 1e-6;
  fw = smoothstep(-0.7, 1.1, dot(e, fd));                                     // 0 on the back shore, 1 on the front
  e -= fd * fm * (0.1 + 0.05 * fw);                                           // the bulk only leans; the tongues do the running
  e += gW.xy;
  vec2 m = gM.xy; float T = gM.z, Ta = max(T, 0.0), Tr = max(-T, 0.0); vec2 nm = m / (length(m) + 1e-5);
  int s = int(F.z) * 7 + 3; uint h0 = hsh(ivec2(s, 99)); vec2 g = vec2(0.0);
  float f = kern(e, (vec2(rnd(h0, 10u), rnd(h0, 20u)) - 0.5) * 0.15 + nm * 0.08 * Ta, 1.36, 1.0, g), sa = rnd(h0, 0u) * 6.283;
  for (int k = 0; k < 6; k++) { uint h = hsh(ivec2(s, k)); float r1 = rnd(h, 0u), r2 = rnd(h, 10u), r3 = rnd(h, 20u);
    float th = sa + (float(k) + (r1 - 0.5) * 0.7) * 1.0472 + 0.25 * sin(uT * (0.05 + 0.05 * r2) + r3 * 6.28);
    vec2 u = vec2(cos(th), sin(th)); float fc = dot(u, nm);
    float rho = (0.6 + 0.2 * r2 + 0.05 * sin(uT * 0.09 + r1 * 6.28)) * (1.0 + 0.12 * Ta * fc - 0.15 * Tr * max(fc, 0.0));
    f += kern(e, rho * u, 0.36 + 0.25 * r3, 0.8 + 0.6 * r1, g); }
  // satellite beads and spatter droplets round the blot; under an attracting field they crawl toward you along the shore
  for (int k = 0; k < 8; k++) { uint h = hsh(ivec2(s, k + 10)); float r1 = rnd(h, 0u), r2 = rnd(h, 10u), r3 = rnd(h, 20u);
    float th = sa + 2.4 * float(k) + r1 * 1.5 + 0.12 * sin(uT * 0.04 + r2 * 6.28);
    float big = k < 3 ? 1.0 : 0.0, rho = (1.12 + 0.25 * (1.0 - big) * r2) + 0.13 * sin(uT * (0.06 + 0.06 * r3) + r1 * 6.28);
    vec2 c = rho * vec2(cos(th), sin(th)); c += (m - c) * 0.22 * Ta * smoothstep(-0.2, 0.9, dot(normalize(c), nm));
    f += kern(e, c, mix(0.07 + 0.05 * r3, 0.2 + 0.08 * r3, big), mix(0.62, 0.56, big), g); }
  // capillary fingers wicking out of the shore, bent and dragged by the field
  for (int k = 0; k < 9; k++) { uint h = hsh(ivec2(s, k + 30)), h2 = hsh(ivec2(s, k + 60));
    float r1 = rnd(h, 0u), r2 = rnd(h, 10u), r3 = rnd(h, 20u), r4 = rnd(h2, 0u), r5 = rnd(h2, 10u);
    float th = sa + (float(k) + (r1 - 0.5) * 0.8) * 0.6981;
    vec2 u = vec2(cos(th), sin(th)), b = u * (0.72 + 0.08 * r4);
    float fc = dot(u, nm), gain = pow(Ta, 0.7) * smoothstep(-0.25, 0.85, fc), back = Ta * smoothstep(0.0, -0.8, fc);
    float L = (0.1 + 0.2 * r2) * (0.75 + 0.25 * sin(uT * (0.07 + 0.05 * r3) + r1 * 6.28));      // the slow creep at rest
    L *= (1.0 - 0.7 * back) * (1.0 - Tr * smoothstep(-0.3, 0.6, fc)) * (1.0 + 0.6 * Tr * smoothstep(0.2, -0.8, fc));
    vec2 tm = m - b; float tl = length(tm);
    L += gain * (0.7 + 0.6 * r2) * (1.0 + 0.1 * sin(uT * 5.0 + r3 * 6.28));            // tongues racing out
    L = min(L, max(tl - 0.3, 0.05));                                                    // stop just short of you
    if (length(e - b) > L + 0.3) continue;
    vec2 d = normalize(mix(u, tm / (tl + 1e-5), clamp(gain * 1.4, 0.0, 0.95)));
    d = normalize(d - prp(nm) * dot(prp(nm), d) * 0.6 * Tr * smoothstep(-0.2, 0.7, fc));  // repelled: swept aside
    float cu = (r3 - 0.5) * 0.9 * (1.0 - 0.8 * clamp(gain * 1.5, 0.0, 1.0));            // ink curls; the field straightens it
    float w0 = (0.12 + 0.07 * r5) * (1.0 + 0.3 * gain);
    vec2 mid = b + d * L * 0.5 + prp(d) * L * cu * 0.35, tip = mid + normalize(d + prp(d) * cu) * L * 0.5;
    f += seg(e, b, mid, w0, w0 * 0.7, 1.15, g) + seg(e, mid, tip, w0 * 0.7, 0.05, 1.15, g);
    if (r4 > 0.45) { vec2 bd = normalize(d + prp(d) * (r4 > 0.72 ? 0.9 : -0.9) * (1.0 - 0.6 * gain));   // a forked capillary
      f += seg(e, mid, mid + bd * L * (0.3 + 0.2 * r5), w0 * 0.55, 0.045, 1.0, g); }
  }
  // attracted: the body draws out into a comet toward you, necking where it leaves the blot
  if (Ta > 0.02) f += seg(e, nm * 0.45, nm * (0.6 + 1.0 * Ta), 0.55 * Ta + 0.05, 0.2 * Ta + 0.05, 0.9, g);
  // repelled: a concave bite in the near shore, the mass heaped up behind
  if (Tr > 0.02) { f += kern(e, nm * 1.0, 0.45 + 0.55 * Tr, -2.6 * Tr, g); f += kern(e, -nm * 0.55, 0.75, 0.35 * Tr, g); }
  f += gW.z;
  fv = f;
  return (f - 0.25) / max(length(g / rad), 1.0);
}
float poolH(vec2 l, vec2 rad, vec2 al, float kO, float kS, vec3 F, out float spk) {
  float fw, fv, s = body(l, rad, F, fw, fv), fm = length(F.xy);
  float pile = 1.0 + fm * (0.6 * fw - 0.45 * (1.0 - fw)) + 0.5 * max(-gM.z, 0.0) * (1.0 - fw);  // heaped where it ran or was pushed
  float t = clamp((fv - 0.25) / (0.45 * pile), 0.0, 1.0);                     // the meniscus rides the blob field: fat where lobes meet
  float h = 0.011 * pile * sqrt(t * (2.0 - t));                              // a thick round meniscus all the way round
  vec2 sw = textureLod(uN, l * 1.7 + vec2(uT * 0.03, -uT * 0.022), 0.0).rg + textureLod(uN, l * 3.1 - vec2(uT * 0.018, uT * 0.027), 0.0).gr * 0.6 - 0.8;
  h += (sw.x + sw.y * 0.5) * 0.0065 * t * (1.0 - 0.8 * kS);                  // slow heavy swells, stilled by a same-pole field
  spk = 0.0;
  if (kO > 0.01) {
    // Rosensweig spikes, no lattice: one per jittered cell (some cells empty), random size, wandering slowly; each stands
    // up when the field AT IT crosses a threshold, so they appear first on the shore facing you (tongue tips included)
    // and spread inward as you near, tallest nearest you, leaning toward you, their feet summing into smooth valleys
    const float LS = 0.021;
    vec2 cb = floor(l / LS);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 c = cb + vec2(float(i), float(j)); uint hh = hsh(ivec2(c) + ivec2(int(F.z) * 131, 7));
      float r1 = rnd(hh, 0u), r2 = rnd(hh, 10u), r3 = rnd(hh, 20u);
      if (r3 < 0.2) continue;
      vec2 ce = (c + 0.5 + (vec2(r1, r2) - 0.5) * 0.8) * LS + 0.0025 * vec2(sin(uT * 0.7 + r1 * 6.28), cos(uT * 0.55 + r2 * 6.28));
      float dm = length(ce - al), bl = kO * pow(0.06 / (dm + 0.06), 1.5);
      float kc = smoothstep(0.1, 0.65, bl);
      if (kc < 0.004) continue;
      float sz = 0.6 + 0.8 * fract(r3 * 7.31 + r1 * 3.17), R = LS * 0.6 * sz * (0.8 + 0.4 * kc);
      vec2 e = l - ce; if (dot(e, e) > R * R * 2.5) continue;
      vec2 ld = (al - ce) / (dm + 0.01);                                       // tips lean toward you
      float t0 = min(length(e) / R, 1.0); e -= ld * R * 0.55 * kc * (1.0 - t0);
      float tt = length(e) / R; if (tt >= 1.0) continue;
      float g = (1.0 - tt * tt); g *= g * exp(-(0.3 + 5.0 * kc) * tt);        // round dome slumped, a sharp tip stood up
      spk += 0.05 * kc * sz * g;
    }
    spk *= smoothstep(-0.001, 0.01, s);                                         // they stand right up to the shore
  }
  return h + spk;
}
// a field ring pattern: three rings sliding inward (dir -1) or outward over [r0, r0 + span]
float ring(float d, float r0, float span, float speed, float dir) {
  float x = (d - r0) / span; if (x < 0.0 || x > 1.0) return 0.0;
  float g = fract(3.0 * x - 3.0 * speed * dir * uT), dw = min(g, 1.0 - g) * span / 3.0;
  return (1.0 - smoothstep(uPix * 0.6, uPix * 2.2, dw)) * (1.0 - x);
}
const vec2 CUR = vec2(0.857, 0.514), CRP = vec2(-0.514, 0.857);
const float AR = 0.035;
vec3 iron(vec3 n) {
  // the gunmetal mirror's vault: dark iron overhead, one soft bright side, two long strip lamps and one hard lamp.
  // From straight above every swell and ripple bends these, so the sharp highlights ARE the liquid's shape
  vec3 r = vec3(2.0 * n.z * n.xy, 2.0 * n.z * n.z - 1.0);
  vec3 c = mix(vec3(0.06, 0.065, 0.075), vec3(0.3, 0.305, 0.32), smoothstep(-0.32, 0.38, dot(r.xy, vec2(-0.6, -0.8))));
  float fa = dot(r.xy, vec2(0.8, -0.6)) - 0.2, fwa = fwidth(fa) + 1e-4;
  c += vec3(0.2, 0.205, 0.22) * exp(-fa * fa * 500.0) * smoothstep(0.8, 0.25, abs(dot(r.xy, vec2(0.6, 0.8)) + 0.15)) + vec3(0.32, 0.32, 0.34) * (1.0 - smoothstep(0.007 - fwa, 0.007 + fwa, abs(fa))) * smoothstep(0.6, 0.2, abs(dot(r.xy, vec2(0.6, 0.8)) + 0.15));
  float fb = dot(r.xy, vec2(0.25, 0.97)) + 0.34, fwb = fwidth(fb) + 1e-4;
  c += vec3(0.1, 0.105, 0.12) * exp(-fb * fb * 700.0) * smoothstep(0.7, 0.1, abs(dot(r.xy, vec2(0.97, -0.25)) - 0.1));
  float lk = dot(r, normalize(vec3(-0.38, -0.52, 0.76))), fwl = fwidth(lk) + 1e-4;
  c += vec3(1.0, 0.95, 0.86) * (smoothstep(0.993 - fwl, 0.993 + fwl, lk) * 0.9 + pow(max(lk, 0.0), 70.0) * 0.22);
  return c;
}
void main() {
  vec2 sv = vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y), w = uCam + sv * uView;
  vec4 nz = texture(uN, w * 0.45 + vec2(uT * 0.01, -uT * 0.007));
  vec2 hz = (texture(uN, w * 2.4 + vec2(0.0, uT * 0.07)).rg - 0.5) * 0.004;
  // FLOOR MIRROR: a heavy sea of liquid iron with a dark gunmetal mirror skin, carried by one slow current. Every pillar
  // parts that current: potential flow past a cylinder bends the coordinates the current advects, so swells and ripple
  // trains split round the base and close up behind it; a meniscus collar, a bow of standing ripples and a V wake ride on it
  vec2 wf = w, sl = vec2(0.0);
  for (int i = 0; i < 8; i++) { if (i >= uNPil) break;
    vec2 rel = w - uPil[i].xy; float d = max(length(rel), 1e-4); if (d > 0.34) continue;
    float s = dot(rel, CUR), t = dot(rel, CRP), a2 = AR * AR / max(d * d, AR * AR), fall = 1.0 - smoothstep(0.2, 0.34, d);
    wf += (CUR * s - CRP * t) * a2 * fall;
    vec2 dir = rel / d; float x = (d - AR) / 0.0045, cb = exp(-x * x);
    sl += dir * (-2.0 * x / 0.0045) * cb * 0.005;                              // the collar: liquid wetting up the iron
    float up = smoothstep(0.4, -0.8, dot(dir, CUR)), dx = d - AR;
    sl += dir * sin(dx * 170.0 - 0.6 * sin(uT * 0.9)) * 0.05 * exp(-dx * 20.0) * (0.12 + 0.88 * up) * smoothstep(0.004, 0.03, dx);
    if (s > 0.0) { float ta = abs(t), arm = (ta - s * 0.36) / (0.01 + s * 0.12);
      sl += CRP * sign(t) * sin((ta - s * 0.36) * 230.0 - s * 90.0 + uT * 0.8) * 0.08 * exp(-arm * arm) * exp(-s * 6.0) * smoothstep(0.0, 0.03, s);
      vec2 ed = textureLod(uN, vec2(s - uT * 0.035, t) * 7.0, 0.0).rg - 0.5;
      sl += ed * 0.32 * exp(-pow(t / (0.018 + s * 0.09), 2.0)) * exp(-s * 7.0) * smoothstep(0.0, 0.05, s - AR * 0.5);
    }
  }
  // big slow swells drifting down the current, two layers crossing
  vec2 q1 = wf * 0.2 - CUR * uT * 0.011 + hz, q2 = wf.yx * 0.33 + vec2(-uT * 0.006, uT * 0.008) + hz;
  vec4 c1 = texture(uC, q1), c2 = texture(uC, q2);
  sl += (c1.ba - 0.5) * 0.62 + (c2.ab - 0.5) * 0.3;
  float hgt = c1.g * 0.65 + c2.g * 0.35;
  // long rolling ripple trains: one runs down the current in packets, a fainter one crosses it
  float pk1 = smoothstep(0.35, 0.8, texture(uN, wf * 0.3 - CUR * uT * 0.03).r), pk2 = smoothstep(0.4, 0.85, nz.g);
  sl += CUR * cos(dot(wf, CUR) * 30.0 - uT * 1.0) * 0.05 * pk1 + vec2(-0.47, 0.88) * cos(dot(wf, vec2(-0.47, 0.88)) * 47.0 + uT * 0.75) * 0.022 * pk2;
  for (int i = 0; i < 32; i++) { if (i >= uNW) break;
    vec4 E = uWk[i]; vec2 d = w - E.xy; float dl = length(d) + 1e-4, x = dl - (0.015 + E.z * 0.17);
    sl += d / dl * sin(x * 180.0) * exp(-x * x * 1400.0) * E.w * exp(-E.z * 2.2);
  }
  vec2 gn = (texture(uN, w * 3.1 + vec2(uT * 0.02, -uT * 0.014)).rg - 0.5) * 0.4;
  vec3 n = normalize(vec3(-sl * 1.25 - gn * 0.03, 1.0));
  vec3 r = vec3(2.0 * n.z * n.xy, 2.0 * n.z * n.z - 1.0);
  vec3 col = iron(n);
  // faint vault texture so the dark of the mirror is never a flat fill
  vec2 e = w * vec2(0.22, 0.12) + r.xy * 0.9 + vec2(uT * 0.004, 0.0);
  col += vec3(0.07, 0.068, 0.066) * smoothstep(0.5, 0.95, texture(uN, e * vec2(0.6, 1.9)).b);
  // pillars in the mirror: each tower hangs upside down in the sea below its foot, wobbling on the ripples and fading
  // with depth; a soft contact shadow falls down-right (same lamp as every chrome glint); heat wells up round the foot;
  // the collar's rim is one crisp bright wetting line exactly at the iron's edge
  for (int i = 0; i < 8; i++) { if (i >= uNPil) break;
    vec4 P = uPil[i]; vec2 rel = w - P.xy; float d = length(rel); if (d > 0.31) continue;
    vec3 pc = P.z > 0.0 ? NC : SC;
    float ds = distance(w, P.xy + vec2(0.008, 0.01));
    col *= 1.0 - 0.5 * exp(-pow(max(ds - 0.03, 0.0) * 70.0, 2.0));
    float tt = clamp(rel.y / 0.15, 0.0, 1.0);
    vec2 rq = rel + vec2(sin(rel.y * 95.0 - uT * 2.0 + nz.r * 2.0) * 0.003 * tt + sl.x * 0.012 * tt, sl.y * 0.006);
    if (d > RB * 0.9) { vec4 rf = pilView(rq, P.z, P.w, pilSeed(P.xy), uT, uPix, 1.0); col = mix(col, rf.rgb + col * 0.25, rf.a * (0.82 - 0.4 * tt)); }
    col += vec3(1.0, 0.4, 0.1) * exp(-pow((d - AR - 0.0025) / 0.006, 2.0)) * (0.05 + 0.3 * smoothstep(0.3, 0.75, textureLod(uN, rel * 6.0 + vec2(uT * 0.05, 0.0), 0.0).g));
    float wl = 1.0 - smoothstep(uPix * 0.6, uPix * 1.8, abs(d - AR));
    // the pull drawn on the sea: a faint pole-coloured stream of dashes running from you into the plinth (outward when it pushes)
    { float kk = abs(P.z) - 2.0, a0 = floor(P.w) / 1024.0 * 6.2832 - 3.1416; vec2 dd = vec2(cos(a0), sin(a0));
      float L = clamp(dot(uPl - P.xy, dd), 0.06, 0.2), al = dot(rel, dd), cr = abs(dot(rel, vec2(-dd.y, dd.x))), hw = 0.005 + 0.16 * max(al - RB, 0.0);
      float band = smoothstep(RB, RB + 0.012, al) * smoothstep(L + 0.01, L - 0.03, al) * smoothstep(hw, hw * 0.3, cr);
      float dash = smoothstep(0.4, 0.8, fract(al / 0.022 + (uT * 1.4 - cr * 40.0) * sign(kk))) * (0.6 + 0.4 * smoothstep(0.5, 0.0, cr / hw));
      col += pc * band * dash * abs(kk) * 0.55 * smoothstep(0.8, 0.97, dot(normalize(uPl - P.xy), dd)); }   // only while it is aimed at YOU (a creature pull bends the pillar but draws no stream)
    col = mix(col, vec3(1.0, 0.9, 0.74), wl * 0.75);
  }
  for (int i = 0; i < 8; i++) { if (i >= uNP) break;
    vec4 P = uPool[i], Rq = uPoolR[i], Fq = uPoolF[i]; vec2 B = uPoolB[i], d = w - P.xy; float cs = cos(B.x), sn = sin(B.x);
    vec2 l = vec2(d.x * cs + d.y * sn, -d.x * sn + d.y * cs); float lr = length(l / P.zw);
    if (lr > 1.7 + 0.7 * max(Fq.w, 0.0)) continue;
    vec2 ad = Rq.xy - P.xy, al = vec2(ad.x * cs + ad.y * sn, -ad.x * sn + ad.y * cs);
    vec3 F = vec3(Fq.x * cs + Fq.y * sn, -Fq.x * sn + Fq.y * cs, Fq.z);
    vec3 pc = B.y > 0.0 ? NC * 0.8 : SC * 1.15;
    vec2 pd = uPl - P.xy; gM = vec3(vec2(pd.x * cs + pd.y * sn, -pd.x * sn + pd.y * cs) / P.zw, Fq.w);
    // a blot of black ferrofluid: a height field (ink-blot outline the field drags, thick round meniscus, slow swells, the
    // spikes) shaded as a wet black mirror whose reflections are the pool's own pole light
    gW = spillWarp(l, P.zw, F);
    float fw0, fv0, sb = body(l, P.zw, F, fw0, fv0);
    float inside = smoothstep(0.0, uPix * 1.2, sb);
    float cont = smoothstep(0.0, uPix * 0.8, -sb) * (1.0 - smoothstep(uPix * 1.6, uPix * 2.6, -sb));
    // the pole light the wet skin throws onto the melt right round its shore
    col += pc * 0.3 * exp(-max(-sb, 0.0) / 0.006) * (1.0 - inside);
    if (inside > 0.0) {
      float s0, s1, s2, e = max(uPix * 0.8, 0.0004);
      float h0 = poolH(l, P.zw, al, Rq.z, Rq.w, F, s0), hx = poolH(l + vec2(e, 0.0), P.zw, al, Rq.z, Rq.w, F, s1), hy = poolH(l + vec2(0.0, e), P.zw, al, Rq.z, Rq.w, F, s2);
      vec2 g = vec2(hx - h0, hy - h0) / e; g = vec2(g.x * cs - g.y * sn, g.x * sn + g.y * cs);
      // pole light pooled in the troughs between the spikes
      float kl = Rq.z * (1.0 - smoothstep(0.02, 0.16, length(l - al)));
      float sh = s0 / (0.05 * kl + 1e-4);
      // the puddle floats IN the iron sea: the sea's swells, ripple trains and wakes run on under its skin too, and its
      // black mirror reflects the same vault (strip lamps, bright side, key lamp) as the sea round it
      vec3 pn = normalize(vec3(-g - sl * 0.45, 1.0));
      vec3 pcol = ferro(pn, pc, nz.b, smoothstep(0.03, 0.22, sh) * smoothstep(0.05, 0.3, kl));   // the spikes ink-black under their glints
      pcol += max(iron(pn) - vec3(0.12), 0.0) * 0.35;
      pcol += pc * kl * (1.0 - smoothstep(0.0, 0.2, sh)) * 0.7;
      col = mix(col * (1.0 - 0.7 * cont), pcol, inside);
    } else col *= 1.0 - 0.7 * cont;
  }
  for (int i = 0; i < 8; i++) { if (i >= uNPil) break;
    vec4 P = uPil[i]; float d = distance(w, P.xy) + (nz.r - 0.5) * 0.012;
    col += (P.z > 0.0 ? NC : SC) * ring(d, 0.06, 0.2, 0.25, sign(P.z) != uPole ? -1.0 : 1.0) * 0.26;
  }
  for (int i = 0; i < 4; i++) { if (i >= uNG) break;
    vec3 P = uGol[i]; float d = distance(w, P.xy) + (nz.g - 0.5) * 0.015;
    col += (P.z > 0.0 ? NC : SC) * ring(d, 0.06, 0.3, 0.15, P.z != uPole ? -1.0 : 1.0) * 0.45;
  }
  o = vec4(col, 1.0);
}`;
const FS_SPLAT = HDR + 'uniform sampler2D uA; in vec2 vU; in vec4 vK; out vec4 o; void main(){ o = vK * texture(uA, vU).r * 0.5; }';
const FS_COMP = HDR + ENV + `
uniform sampler2D uS, uX, uF, uN; uniform vec2 uRes, uFT, uCam, uView, uPl; uniform float uT, uWarn, uRip, uFP;
out vec4 o;
const float K = 0.65, TH = 0.25, SG = 2.6;
float fld(vec2 uv) { vec4 a = textureLod(uS, uv, 0.0), b = textureLod(uX, uv, 0.0); return max(b.r - K * (a.r - b.r), 0.0) + max(b.g - K * (a.g - b.g), 0.0) + a.b + a.a; }
float hh(vec2 uv) { return pow(max(fld(uv) - TH, 0.0), 0.6); }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec4 a = texture(uS, uv), b = texture(uX, uv);
  float eN = max(b.r - K * (a.r - b.r), 0.0), eS = max(b.g - K * (a.g - b.g), 0.0), F = eN + eS + a.b + a.a, fw = max(fwidth(F), 1e-4);
  // a tight contact shadow cast down-right onto the melt, so a body sits in the liquid instead of on a dark disc
  vec3 fl = texture(uF, uv).rgb * (1.0 - 0.55 * smoothstep(TH * 0.5, TH * 1.1, fld(uv + vec2(-0.0045, 0.0045 * uRes.x / uRes.y))));
  if (F < TH * 0.3) { o = vec4(fl, 1.0); return; }
  vec2 dx = vec2(uFT.x, 0.0), dy = vec2(0.0, uFT.y);
  float gx = hh(uv + dx) - hh(uv - dx), gy = hh(uv - dy) - hh(uv + dy);
  vec2 w = uCam + vec2(uv.x, 1.0 - uv.y) * uView;
  // the slope comes from how deep inside the body we are (so a mite and a golem are both round), its direction from the gradient
  float rho = pow(1.0 - clamp((F - TH) / 0.25, 0.0, 1.0), 0.6), nzz = sqrt(max(1.0 - rho * rho, 0.0));
  vec2 gd = vec2(gx, gy); float gl = length(gd);
  vec3 n = gl > 1e-5 ? normalize(vec3(-gd / gl * sqrt(1.0 - nzz * nzz), nzz) + vec3(-gd * SG, 0.0)) : vec3(0.0, 0.0, 1.0);
  if (uWarn > 0.0) { vec2 dp = w - uPl; float dd = length(dp) + 1e-4; n = normalize(n + vec3(dp / dd * sin(dd * 300.0 - uRip) * 0.5 * uWarn * exp(-dd * 28.0), 0.0)); }
  float nb = a.b * 0.6, tot = eN + eS + nb + 1e-4, ff = a.a / (tot + a.a);
  vec3 tint = (NC * eN + SC * eS + SILV * nb) / tot;
  // the reflection is looked up in WORLD space, so the horizon and the mirrored melt slide and warp across a body as it moves
  float cloud = textureLod(uN, w * 4.5 + n.xy * 0.3 + vec2(uT * 0.03, uT * 0.02), 0.0).b;
  vec3 r = vec3(2.0 * n.z * n.xy, 2.0 * n.z * n.z - 1.0);
  vec3 ground = textureLod(uF, uv + vec2(r.x, -r.y) * 0.09, 0.0).rgb; ground = mix(ground, vec3(dot(ground, vec3(0.4, 0.4, 0.2))), 0.45) * 1.15 + vec3(0.03, 0.025, 0.02);
  ground = mix(ground, ground * tint * 2.0, 0.25 * (1.0 - nb / tot));
  vec3 col = chrome(n, tint, ground, cloud);
  col += tint * pow(1.0 - n.z, 1.6) * 0.45 * (1.0 - nb / tot);
  col = mix(col, ferro(n, uFP > 0.0 ? NC * 0.8 : SC * 1.15, cloud, 0.0), ff);   // pool arms: the same wet black ferrofluid as their pool
  col *= 1.0 - 0.8 * (1.0 - 0.75 * ff) * (1.0 - smoothstep(TH, TH + fw * 3.0, F));
  o = vec4(mix(fl, col, smoothstep(TH - fw, TH + fw, F)), 1.0);
}`;
// the demo's FS_SPRITE with only its player branch: the mint orb, lit and mirroring the floor like the chrome bodies.
// vK.xy its rotation, vK.z the pole push (-1..1; the game passes 0: the player stays mint, its pole is the Pixi rim)
const FS_PLAYER = HDR + ENV + `
uniform sampler2D uNM, uF, uN; uniform vec2 uRes; uniform float uT, uWarn, uHurt, uRip;
in vec2 vU; in vec4 vK; out vec4 o;
void main() {
  vec4 t = texture(uNM, vU);
  float m = smoothstep(0.1, 0.24, t.a); if (m < 0.003) discard;
  vec3 n = normalize(t.rgb * 2.0 - 1.0); n.xy = vec2(n.x * vK.x - n.y * vK.y, n.x * vK.y + n.y * vK.x);
  float dark = 1.0 - smoothstep(0.36, 0.45, t.a);
  if (uWarn > 0.0) { float l = length(n.xy) + 1e-4; n = normalize(n + vec3(n.xy / l * sin(l * 16.0 - uRip) * 0.35 * uWarn, 0.0)); }
  float pk = smoothstep(0.0, 1.0, abs(vK.z));
  vec3 mintP = mix(MINT, vK.z > 0.0 ? vec3(1.0, 0.3, 0.3) : vec3(0.3, 0.6, 1.0), 0.92 * pk);
  mintP = max(mix(vec3(dot(mintP, vec3(0.3, 0.55, 0.15))), mintP, 1.0 + 0.45 * pk), 0.0);
  vec3 r = vec3(2.0 * n.z * n.xy, 2.0 * n.z * n.z - 1.0); vec2 suv = gl_FragCoord.xy / uRes;
  vec3 ground = textureLod(uF, suv + vec2(r.x, -r.y) * 0.05, 0.0).rgb * 1.20 + vec3(0.05, 0.04, 0.035);
  ground = mix(ground, vec3(dot(ground, vec3(0.3, 0.5, 0.2))) * 1.3 + 0.06, 0.7);
  ground = ground * mintP * 1.4;
  float cloud = textureLod(uN, suv * 1.3 + n.xy * 0.2 + vec2(uT * 0.01), 0.0).b;
  vec3 col = chrome(n, mintP, ground, cloud);
  col = mix(col, col * 0.5 + mintP * (0.25 + 0.62 * n.z), 0.75);
  col += vec3(1.0) * (1.0 - dark) * smoothstep(0.9, 0.95, dot(n, normalize(vec3(-0.42, -0.5, 0.76)))) * 0.85;
  col += vec3(1.0, 0.25, 0.1) * uHurt * (1.0 - dark) * (1.0 - n.z) * 0.8;
  col = mix(col, col * 0.62, dark);
  o = vec4(col, m);
}`;
const FS_PIL = HDR + 'uniform sampler2D uN; uniform float uT, uPix; in vec2 vU; in vec4 vK; out vec4 o;\n' + ENV + PIL + `
void main() { vec4 c = pilView(vU * 0.2 + vec2(0.0, -0.035), vK.x, vK.w, pilSeed(vK.yz), uT, uPix, 0.0); if (c.a < 0.003) discard; o = c; }`;
function shader(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
function program(vs, fs) {
  const p = gl.createProgram(); gl.attachShader(p, shader(gl.VERTEX_SHADER, vs)); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name.replace('[0]', ''); u[name] = gl.getUniformLocation(p, name); }
  return { p, u, aP: gl.getAttribLocation(p, 'aP'), aU: gl.getAttribLocation(p, 'aU'), aK: gl.getAttribLocation(p, 'aK') };
}
const PF = program(VS_FULL, FS_FLOOR), PSP = program(VS_Q, FS_SPLAT), PC = program(VS_FULL, FS_COMP), PPL = program(VS_Q, FS_PIL), PS = program(VS_Q, FS_PLAYER);
gl.useProgram(PF.p); gl.uniform1i(PF.u.uC, 0); gl.uniform1i(PF.u.uN, 1);
gl.useProgram(PSP.p); gl.uniform1i(PSP.u.uA, 3);
gl.useProgram(PC.p); gl.uniform1i(PC.u.uS, 6); gl.uniform1i(PC.u.uX, 7); gl.uniform1i(PC.u.uF, 5); gl.uniform1i(PC.u.uN, 1);
gl.useProgram(PPL.p); gl.uniform1i(PPL.u.uN, 1);
gl.useProgram(PS.p); gl.uniform1i(PS.u.uNM, 4); gl.uniform1i(PS.u.uF, 5); gl.uniform1i(PS.u.uN, 1);
const fullBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, fullBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
const QMAX = 2400, QF = 8, qbuf = new Float32Array(QMAX * 6 * QF), quadBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.bufferData(gl.ARRAY_BUFFER, qbuf.byteLength, gl.DYNAMIC_DRAW);
const CORNERS = [-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1];
let qn = 0, CX = 0, CY = 0, GW = 0, GH = 0, FW = 0, FH = 0, floorT = null, fA = null, fB = null;
function target(unit, w, h, float) {
  const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, float ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  return { t, fb };
}
function glResize(w, h) {
  GW = w; GH = h; FW = GW; FH = GH; glc.width = GW; glc.height = GH;
  for (const o of [floorT, fA, fB]) if (o) { gl.deleteTexture(o.t); gl.deleteFramebuffer(o.fb); }
  floorT = target(5, GW, GH, false); fA = target(6, FW, FH, FLOAT); fB = target(7, FW, FH, FLOAT);
}
// one quad: centre, half-size R (world), rotation (c, s), atlas rect, 4 extra floats
function quad(x, y, R, c, s, u0, v0, du, dv, k0, k1, k2, k3) {
  if (qn >= QMAX) return;
  let o = qn * 6 * QF; qn++;
  for (let i = 0; i < 6; i++) {
    const u = CORNERS[i * 2], v = CORNERS[i * 2 + 1], wx = x + (u * c - v * s) * R, wy = y + (u * s + v * c) * R;
    qbuf[o++] = (wx - CX) / VW * 2 - 1; qbuf[o++] = 1 - (wy - CY) / VH * 2; qbuf[o++] = u0 + (u + 1) / 2 * du; qbuf[o++] = v0 + (v + 1) / 2 * dv;
    qbuf[o++] = k0; qbuf[o++] = k1; qbuf[o++] = k2; qbuf[o++] = k3;
  }
}
// a body's falloff into channel 0 North, 1 South, 2 neutral (fuses with anything)
// ferrofluid cones fanned round ang: uneven lengths and angles from a per-body seed, lengths breathing
function spikes(x, y, ang, n, L, spread, seed, w) {
  for (let i = 0; i < n; i++) { const h1 = (seed * 977 + i * 131) % 97 / 97, h2 = (seed * 571 + i * 313) % 89 / 89;
    const a = ang + (n > 1 ? (i / (n - 1) - 0.5) * 2 * spread : 0) + (h1 - 0.5) * 0.4, len = L * (0.55 + 0.45 * h2) * (0.85 + 0.15 * Math.sin(rt * 3.3 + i * 2.1 + seed));
    sp(x, y, len / 0.88, a, 8, 2, w); }
}
// a ferrofluid ARM: a tapering neck of neutral metal (fuses with the body it grows from) that curls as it reaches,
// ending in a sharp cone. L = reach length, wd = root radius
// pinch: the arm strains out and back on its own cycle, and at full stretch its tip bead necks off and drains away
function arm(x, y, ang, L, wd, seed, pinch, ch = 2) {
  if (L < 0.004) return;
  const N = 4, path = (Lx, draw) => { const sl = Lx * 0.72 / N; let a = ang, px = x, py = y;
    for (let i = 1; i <= N; i++) { const t = i / N; a = ang + Math.sin(rt * 2.4 + seed * 1.7 + t * 2.5) * 0.32 * t;
      px += Math.cos(a) * sl; py += Math.sin(a) * sl; if (draw) sp(px, py, wd * 2 * (1 - 0.55 * t), 0, 0, ch, 1); }
    return [px + Math.cos(a) * Lx * 0.36, py + Math.sin(a) * Lx * 0.36, a]; };
  if (pinch) { const ph = ((rt * 0.5 + seed * 0.37) % 1 + 1) % 1;
    if (ph > 0.6) { const v = (ph - 0.6) / 0.4, [tx, ty, ta] = path(L, false), g = wd * (0.5 + 0.9 * v), rb = wd * 1.3 * (1 - v * v);
      if (rb > 0.0008) sp(tx + Math.cos(ta) * g, ty + Math.sin(ta) * g, rb * 2, 0, 0, ch, 1); }
    L *= 0.6 + 0.4 * (ph < 0.6 ? sst(ph / 0.6) : 1 - sst((ph - 0.6) / 0.4)); }
  const [tx, ty, a] = path(L, true);
  sp(tx - Math.cos(a) * L * 0.36, ty - Math.sin(a) * L * 0.36, L * 0.36 / 0.88, a, 8, ch, 1);
}
// how far a body reaches for the player: 0 beyond 0.36, full by 0.12 (draw only; opposite poles only)
const reachK = d => sst((0.36 - d) / 0.24);
function sp(x, y, R, ang, cell, ch, w) { quad(x, y, R * 1.25,Math.cos(ang), Math.sin(ang), cell % 4 * 0.25, (cell / 4 | 0) * 0.25, 0.25, 0.25, ch === 0 ? w : 0, ch === 1 ? w : 0, ch === 2 ? w : 0, ch === 3 ? w : 0); }
const chOf = pole => pole === NORTH ? 0 : 1;
function drawQuads(P) {
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, qbuf.subarray(0, qn * 6 * QF));
  const st = QF * 4; for (const [loc, n, off] of [[P.aP, 2, 0], [P.aU, 2, 8], [P.aK, 4, 16]]) if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, st, off); }
  gl.drawArrays(gl.TRIANGLES, 0, qn * 6);
}
function drawFull(P) { gl.bindBuffer(gl.ARRAY_BUFFER, fullBuf); for (let i = 0; i < 3; i++) gl.disableVertexAttribArray(i); gl.enableVertexAttribArray(P.aP); gl.vertexAttribPointer(P.aP, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLES, 0, 3); }
// each pillar's reaction (draw-only): k > 0 pulled toward the nearest opposite body (you first, else a creature within 0.17),
// k < 0 pushed by you when you share its pole; it swells in over ~0.3 s and settles over ~0.7 s, and its aim swings smoothly
const PRM = new WeakMap(), prm = q => { let s = PRM.get(q.key); if (!s) PRM.set(q.key, s = { k: 0, dx: 0, dy: 1, ph: 0 }); return s; };
// direction (1024 steps) and conveyor phase packed in one float: floor = angle step, fract = phase
const pilW = s => Math.min(1023, Math.floor((Math.atan2(s.dy, s.dx) + Math.PI) / (2 * Math.PI) * 1024)) + Math.min(0.9999, s.ph);
function pilReact(p) {
  for (const q of PILLARS) { const s = prm(q), ex = p.x - q.x, ey = p.y - q.y, d = Math.hypot(ex, ey) || 1;
    let tk = q.pole !== G.pole ? sst((0.36 - d) / 0.26) : -sst((0.3 - d) / 0.22), tx = ex / d, ty = ey / d;
    if (tk < 0.3 && tk > -0.05) { let bd = 0.17, bo = null;
      for (const o of G.foes) { if (o.pole === q.pole || o.kind === 'eel' || o.kind === 'top') continue; const dd = Math.hypot(o.x - q.x, o.y - q.y); if (dd < bd) { bd = dd; bo = o; } }
      if (bo) { const kc = 0.6 * (1 - bd / 0.17); if (kc > tk) { tk = kc; tx = (bo.x - q.x) / bd; ty = (bo.y - q.y) / bd; } } }
    s.k += (tk - s.k) * (1 - Math.exp(-rdt / (Math.abs(tk) > Math.abs(s.k) ? 0.3 : 0.7)));
    const kd = 1 - Math.exp(-rdt / 0.25); s.dx += (tx - s.dx) * kd; s.dy += (ty - s.dy) * kd;
    // the ring conveyor: a slow idle drift down, faster down when pulled, reversed (up) when pushed
    const spd = s.k >= 0 ? 0.11 + 0.55 * s.k : 0.11 - 0.66 * -s.k; s.ph = ((s.ph + rdt * spd) % 1 + 1) % 1; }
}
const POOLR = new Float32Array(32), PVM = new WeakMap(), PV = [];
const POOLF = new Float32Array(32), POOLU = new Float32Array(32), POOLB = new Float32Array(16), PILU = new Float32Array(32), GOLU = new Float32Array(12);
const SH = [0.05, 0.3];
// wakes: rings dropped in the iron sea where bodies pass (draw-only: read from positions, never written to the game)
const WAKES = [], WAKEU = new Float32Array(128), wakeLast = new WeakMap(); let pBob = 0;
function wake(x, y, amp) { WAKES.push({ x, y, age: 0, amp }); if (WAKES.length > 32) WAKES.shift(); }
function wakesTick(c, p) {
  for (const k of WAKES) k.age += rdt; while (WAKES.length && WAKES[0].age > 1.6) WAKES.shift();
  const near = (x, y) => x > c.x - 0.2 && x < c.x + VW + 0.2 && y > c.y - 0.2 && y < c.y + VH + 0.2;
  for (const b of [p, ...G.foes]) { if (b !== p && !near(b.x, b.y)) continue; const l = wakeLast.get(b.key || b);
    if (!l) { wakeLast.set(b.key || b, { x: b.x, y: b.y }); continue; }
    if (Math.hypot(b.x - l.x, b.y - l.y) > (b === p ? 0.06 : 0.08)) { wake(b.x, b.y, b === p ? 0.12 : Math.min(0.1, b.r * 3)); l.x = b.x; l.y = b.y; } }
  // a resting drop still breathes: one slow small ring now and then
  pBob += rdt; if (pBob > 1.4) { pBob = 0; wake(p.x, p.y, 0.06); }
  WAKEU.fill(0); WAKES.forEach((k, i) => WAKEU.set([k.x, k.y, k.age, k.amp], i * 4));
}
function glFrame(c, warn) {
  const p = G.p; CX = c.x; CY = c.y;
  const vis = (x, y, m) => x > c.x - m && x < c.x + VW + m && y > c.y - m && y < c.y + VH + m;
  const PILS = [...PILLARS].sort((a, b) => a.y - b.y);
  PV.length = 0;
  for (const q of POOLS) { let v = PVM.get(q.key); if (!v) PVM.set(q.key, v = { x: q.x, y: q.y, o: 0, s: 0, fx: 0, fy: 0, b: 0, t: 0 }); PV.push(v); }
  wakesTick(c, p);
  // pass 1: floor
  let np = 0, npl = 0, ng = 0;
  // each pool's reaction, eased: it stands up fast and slumps back slowly and heavily; the pull point follows you but
  // stays held near the shore, so when you leave the spikes sag where they stood instead of chasing you off
  POOLS.forEach((q, i) => { const v = PV[i], dx = p.x - q.x, dy = p.y - q.y, dm = Math.hypot(dx, dy) || 1, lim = Math.min(1, (Math.max(q.rx, q.ry) + 0.05) / dm);
    const cs = Math.cos(q.rot), sn = Math.sin(q.rot), lx = dx * cs + dy * sn, ly = -dx * sn + dy * cs, de = (Math.hypot(lx / q.rx, ly / q.ry) - 1) * Math.min(q.rx, q.ry);
    const to = q.pole !== G.pole ? sst((0.22 - de) / 0.2) : 0, ts = q.pole === G.pole ? sst((0.16 - de) / 0.16) : 0;
    const ta = q.pole !== G.pole ? sst((0.12 - de) / 0.1) : 0;   // the separate arms only bridge the last gap: the edge itself reaches first
    v.o += (ta - v.o) * (1 - Math.exp(-rdt / (ta > v.o ? 0.22 : 1.1))); v.s += (ts - v.s) * (1 - Math.exp(-rdt / (ts > v.s ? 0.25 : 0.9)));
    const kf = 1 - Math.exp(-rdt / 0.15); v.x += (q.x + dx * lim - v.x) * kf; v.y += (q.y + dy * lim - v.y) * kf;
    // the whole spill flows: toward an opposite pole, away from the same pole; heavy and viscous, it runs out in ~0.6 s
    // and takes ~1.8 s to settle back into its rest outline
    const fa = to - 0.85 * ts, tfx = dx / dm * fa, tfy = dy / dm * fa, kv = 1 - Math.exp(-rdt / (Math.hypot(tfx, tfy) > Math.hypot(v.fx, v.fy) ? 0.6 : 1.8));
    v.fx += (tfx - v.fx) * kv; v.fy += (tfy - v.fy) * kv;
    // the magnetic field at the shore, ~1/d^2: a faint wobble far off, dramatic up close. b drives the spikes (up fast, slump
    // slowly); t drives the edge (+ attract / - repel) and is quick, so the tongues race out in ~0.3 s and drain back in ~1 s
    const B = Math.min(1, (0.16 / (Math.max(de, 0) + 0.06)) ** 2) * sst((0.45 - de) / 0.25), tb = q.pole !== G.pole ? B : 0, tt = q.pole !== G.pole ? B : -B;
    v.b += (tb - v.b) * (1 - Math.exp(-rdt / (tb > v.b ? 0.2 : 1.1))); v.t += (tt - v.t) * (1 - Math.exp(-rdt / (Math.abs(tt) > Math.abs(v.t) ? 0.1 : 0.9))); });
  POOLS.forEach((q, i) => { if (np < 8 && vis(q.x, q.y, 0.3)) { const v = PV[i]; POOLU.set([q.x, q.y, q.rx, q.ry], np * 4); POOLB.set([q.rot, q.pole], np * 2); POOLR.set([v.x, v.y, v.b, v.s], np * 4); POOLF.set([v.fx, v.fy, q.seed, v.t], np * 4); np++; } });
  pilReact(p); for (const q of PILLARS) if (npl < 8 && vis(q.x, q.y, 0.34)) { const s = prm(q); PILU.set([q.x, q.y, q.pole * (2 + s.k), pilW(s)], npl * 4); npl++; }
  for (const f of G.foes) if (f.kind === 'golem' && ng < 4 && vis(f.x, f.y, 0.46)) { GOLU.set([f.x, f.y, f.pole], ng * 3); ng++; }
  gl.bindFramebuffer(gl.FRAMEBUFFER, floorT.fb); gl.viewport(0, 0, GW, GH); gl.disable(gl.BLEND);
  gl.useProgram(PF.p); const U = PF.u;
  gl.uniform2f(U.uRes, GW, GH); gl.uniform2f(U.uCam, c.x, c.y); gl.uniform2f(U.uView, VW, VH); gl.uniform2f(U.uPl, p.x, p.y);
  gl.uniform1f(U.uT, rt); gl.uniform2f(U.uSh, SH[0], SH[1]); gl.uniform1f(U.uPole, G.pole); gl.uniform1f(U.uPix, VW / GW);
  gl.uniform4fv(U.uPool, POOLU); gl.uniform2fv(U.uPoolB, POOLB); gl.uniform4fv(U.uPoolR, POOLR); gl.uniform4fv(U.uPoolF, POOLF); gl.uniform1i(U.uNP, np); gl.uniform4fv(U.uPil, PILU); gl.uniform1i(U.uNPil, npl); gl.uniform3fv(U.uGol, GOLU); gl.uniform1i(U.uNG, ng); gl.uniform4fv(U.uWk, WAKEU); gl.uniform1i(U.uNW, WAKES.length);
  drawFull(PF);
  gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  qn = 0; for (const q of PILS) if (vis(q.x, q.y, 0.24)) { const s = prm(q); quad(q.x, q.y - 0.035, 0.2, 1, 0, -1, -1, 2, 2, q.pole * (2 + s.k), q.x, q.y, pilW(s)); }
  if (qn) { gl.useProgram(PPL.p); gl.uniform1f(PPL.u.uT, rt); gl.uniform1f(PPL.u.uPix, VW / GW); drawQuads(PPL); }
  // pass 2: body field
  qn = 0;
  // pool ferrofluid: the spike lattice itself is the height field in the floor shader; here the near shore grows three
  // SEPARATE fat arms of the same black fluid from three points along the meniscus, each straining toward you on its own
  // rhythm, necking and pinching off a droplet at full stretch; tips stop just short of you; they sag back as the pool slumps
  POOLS.forEach((q, qi) => { const k = PV[qi].o; if (k < 0.02 || !vis(q.x, q.y, 0.2)) return;
    const cs = Math.cos(q.rot), sn = Math.sin(q.rot), ex = p.x - q.x, ey = p.y - q.y, lx = ex * cs + ey * sn, ly = -ex * sn + ey * cs;
    const a = Math.atan2(ly / q.ry, lx / q.rx), ar = 0.9 + 0.45 * Math.max(PV[qi].t, 0);   // the arms leave from the tongue tips
    for (let i = -1; i <= 1; i++) { const ai = a + i * 0.034 / Math.min(q.rx, q.ry), ex2 = Math.cos(ai) * q.rx * ar, ey2 = Math.sin(ai) * q.ry * ar;
      const sx = q.x + ex2 * cs - ey2 * sn, sy = q.y + ex2 * sn + ey2 * cs, dx = p.x - sx, dy = p.y - sy, d = Math.hypot(dx, dy);
      const nx = Math.cos(ai) / q.rx, ny = Math.sin(ai) / q.ry, wnx = nx * cs - ny * sn, wny = nx * sn + ny * cs;   // shore normal
      const ad = Math.atan2(dy, dx), an = Math.atan2(wny, wnx), a0 = ad + Math.atan2(Math.sin(an - ad), Math.cos(an - ad)) * 0.25;
      arm(sx, sy, a0, k * Math.max(0, Math.min(0.12 * (1 - Math.abs(i) * 0.3), d - p.r - 0.024)), 0.011 * (1 - Math.abs(i) * 0.2), q.x * 9 + i * 2.7, true, 3); } });
  for (const f of G.foes) {
    if (!vis(f.x, f.y, 0.12)) continue;
    const dx = p.x - f.x, dy = p.y - f.y, ch = f.kind === 'mite' && f.stun > 0 ? 2 : chOf(f.pole);
    if (f.kind === 'mite') { sp(f.x, f.y, f.r * 2.8, 0, 0, ch, 1);
      if (f.latched) sp(p.x + f.latched.x * 0.55, p.y + f.latched.y * 0.55, f.r * 1.9, 0, 0, 2, 0.75);
      else if (f.stun > 0) { const d = Math.hypot(dx, dy); if (d < 0.11) for (let k = 1; k < 5; k++) sp(p.x - dx * k / 5, p.y - dy * k / 5, 0.0075 * (0.4 + f.stun) * (1 - Math.abs(k / 5 - 0.5)), 0, 0, 2, 1); } }
    else if (f.kind === 'urchin') sp(f.x, f.y, f.r * 2.7, rt * 0.5, 2, ch, 1);
    else if (f.kind === 'top') sp(f.x, f.y, f.r * 2.3, rt * 9, 3, ch, 1);
    else if (f.kind === 'blob' || f.kind === 'small') { sp(f.x, f.y, f.r * 2.2, rt * 0.6 + f.ph, 5, ch, 1); if (f.spike > 0.03) spikes(f.x, f.y, Math.atan2(dy, dx), 5, f.r * 2.3 * f.spike, 0.75, (f.ph * 100) | 0, 1); }
    else if (f.kind === 'golem') {
      sp(f.x, f.y, f.r * 2.5, f.ph + rt * 0.2, 5, ch, 1);
      // ferrofluid spikes toward the nearest opposite pole: you, or an opposite tower
      let tx = 0, ty = 0, td = f.pole !== G.pole ? 0.5 : 0; if (td) { tx = dx; ty = dy; td = sst((0.5 - Math.hypot(dx, dy)) / 0.3); if (td < 0.05) td = 0; }
      if (!td) { let bd = 0.4; for (const q of PILLARS) if (q.pole !== f.pole) { const d = Math.hypot(q.x - f.x, q.y - f.y); if (d < bd) { bd = d; tx = q.x - f.x; ty = q.y - f.y; td = 1; } } }
      if (td) spikes(f.x, f.y, Math.atan2(ty, tx), 7, f.r * 2.1 * td, 0.85, (f.ph * 100) | 0, 1);
    } else if (f.kind === 'eel') { const s = eelSegs(f), a = Math.atan2(f.hy, f.hx); sp(s[0].x, s[0].y, f.r * 2.3, a, 4, chOf(s[0].pole), 1); sp(s[1].x, s[1].y, f.r * 2.3, a + Math.PI, 4, chOf(s[1].pole), 1); }
    // ferrofluid reach: an opposite body grows arms toward you as you near, the tips stopping just short of you, and pulls them back as you leave
    if (f.kind !== 'top' && !f.latched && f.stun <= 0) {
      const [na, maxL, wd] = { mite: [1, 0.06, 0.008], urchin: [2, 0.05, 0.007], small: [2, 0.07, 0.009], blob: [3, 0.1, 0.012], golem: [3, 0.14, 0.016], eel: [1, 0.07, 0.008] }[f.kind];
      let ox = f.x, oy = f.y, pole = f.pole;
      if (f.kind === 'eel') { const s = eelSegs(f), lead = eelLeadsHead(f) ? s[0] : s[1]; ox = lead.x; oy = lead.y; pole = lead.pole; }
      const ex = p.x - ox, ey = p.y - oy, d = Math.hypot(ex, ey), k = pole !== G.pole ? reachK(d) : 0;
      if (k > 0.02) { const L = k * Math.min(maxL + f.r, d - p.r - 0.008), a0 = Math.atan2(ey, ex);
        for (let i = 0; i < na; i++) { const c = na > 1 ? i / (na - 1) - 0.5 : 0; arm(ox, oy, a0 + c * 0.9, L * (1 - Math.abs(c) * 0.5), wd, f.ph * 10 + i * 2.3); } }
    }
  }
  // opposite-pole creatures reach for each other: each grows ONE arm toward its nearest opposite neighbour within 0.13,
  // tips stopping short so the pair reads as two bodies straining together, not one merged lump
  // ponytail: O(n^2) over on-screen foes; a grid bucket if crowds pass a few hundred visible
  { const FV = G.foes.filter(f => f.kind !== 'top' && f.kind !== 'eel' && !f.latched && f.stun <= 0 && vis(f.x, f.y, 0.1));
    for (const f of FV) { let best = null, bd = 0.13;
      for (const o of FV) { if (o.pole === f.pole) continue; const d = Math.hypot(o.x - f.x, o.y - f.y); if (d < bd) { bd = d; best = o; } }
      if (!best) continue;
      const k = sst((0.13 - bd) / 0.07), gap = bd - f.r - best.r;
      const L = k * Math.min(0.05 + f.r, f.r + gap * 0.5 - 0.004);
      if (L > f.r + 0.002) arm(f.x, f.y, Math.atan2(best.y - f.y, best.x - f.x), L, Math.min(0.009, f.r * 0.45), f.ph * 10 + 5.1); } }
  // the player's own liquid is neutral chrome tucked under the orb: its pole lives in the orb's tint, not in a ring
  sp(p.x, p.y, p.r * 2.0, 0, 0, 2, 1);
  // hit droplets fly out and crawl back into the body; a death bursts into beads that shrink into the floor
  for (const s of G.sparks) {
    if (s.flipT || !vis(s.x, s.y, 0.1)) continue; const a = Math.min(1, s.age / 0.5), big = s.big ? 1.5 : 1;
    if (s.dead) { for (let i = 0; i < 9; i++) { const an = i / 9 * 6.283 + s.x * 9, d = (0.01 + 0.055 * (1 - (1 - a) ** 2)) * big, rb = 0.0055 * (1 - a) * big * (0.7 + 0.15 * (i % 3)); if (rb > 0.0008) sp(s.x + Math.cos(an) * d, s.y + Math.sin(an) * d, rb * 2, 0, 0, 2, 1); } }
    else { const n = s.opp ? 5 : 2, d = (s.opp ? 0.032 : 0.016) * big * 4 * a * (1 - a); for (let i = 0; i < n; i++) { const an = i / n * 6.283 + s.x * 9; sp(s.x + Math.cos(an) * d, s.y + Math.sin(an) * d, (s.opp ? 0.0048 : 0.0036) * 2, 0, 0, 2, 1); } }
  }
  gl.useProgram(PSP.p); gl.blendFunc(gl.ONE, gl.ONE); gl.clearColor(0, 0, 0, 0);
  for (const [t, eq] of [[fA, gl.FUNC_ADD], [fB, gl.MAX]]) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.viewport(0, 0, FW, FH); gl.clear(gl.COLOR_BUFFER_BIT); gl.blendEquation(eq); if (qn) drawQuads(PSP); }
  gl.blendEquation(gl.FUNC_ADD);
  // pass 3: liquid chrome over the floor
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, GW, GH); gl.disable(gl.BLEND);
  gl.useProgram(PC.p); const V = PC.u;
  gl.uniform2f(V.uRes, GW, GH); gl.uniform2f(V.uFT, 2 / FW, 2 / FH); gl.uniform2f(V.uCam, c.x, c.y); gl.uniform2f(V.uView, VW, VH); gl.uniform2f(V.uPl, p.x, p.y);
  gl.uniform1f(V.uT, rt); gl.uniform1f(V.uFP, POOLS.reduce((m, q, i) => PV[i].o > m[0] ? [PV[i].o, q.pole] : m, [0, -G.pole])[1]);   // the arms wear the pole of the pool that grows them, also while they drain after a flip gl.uniform1f(V.uWarn, warn ? 1 : 0); gl.uniform1f(V.uRip, rt * 30 % 6.2832);
  drawFull(PC);
  // pass 4: the player orb, above every latched mite (p.R: the orb's half-size, its rim at 0.84 of it)
  qn = 0; quad(p.x, p.y, p.R, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0);
  gl.useProgram(PS.p); const W4 = PS.u;
  gl.uniform2f(W4.uRes, GW, GH); gl.uniform1f(W4.uT, rt); gl.uniform1f(W4.uWarn, warn ? 1 : 0); gl.uniform1f(W4.uRip, rt * 30 % 6.2832); gl.uniform1f(W4.uHurt, p.hurt || 0);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); drawQuads(PS);
}
return {
  // the canvas in CSS px and its device pixel ratio (the demo's own cap: 3)
  resize(w, h, dpr) {
    const W = Math.round(w * dpr), Hh = Math.round(h * dpr);
    if (W !== GW || Hh !== GH) glResize(W, Hh);
  },
  frame(S) {
    G = S; POOLS = S.pools; PILLARS = S.pillars; VW = S.VW; VH = S.VH; rt = S.rt; rdt = S.rdt;
    if (GW) glFrame(S.cam, S.warn);
  },
};
}
