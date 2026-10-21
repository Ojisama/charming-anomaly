// THE CORE'S SHADERS: the owner-approved Liquid Metal FINAL (docs/superpowers/specs/assets/core-liquid-final.html)
// ported to Pixi v8 meshes (GLSL ES 3, no #version line: Pixi prepends it). Everything runs in the
// demo's own WORLD UNITS (1 unit = U px, the spec's scale), so every constant below is the demo's.
//   FLOOR_*   the mirror sea of liquid iron, the ink-blot ferrofluid pools (with their arms), the
//             pillars' wakes, collars, reflections and streams, the pillar and golem field rings, and
//             the wakes bodies drop: one full-view quad (src/liquid.js keeps it on the camera).
//   PIL_*     one levitator pillar (plinth, liquid thread, the three-ring conveyor), raymarched in its
//             own quad. uPS scales the demo's levitator so its plinth IS the sim's collision radius.
// Uniform counts are floats (Pixi's uniform groups), arrays are indexed by loop index.
export const U = 667
export const NPIL = 8, NPOOL = 8, NGOL = 4, NWAKE = 32, NARM = 18

const ENV = `
const vec3 NC = vec3(1.25, 0.2, 0.22), SC = vec3(0.25, 0.6, 1.0), SILV = vec3(0.6, 0.64, 0.7);
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
// wet black ferrofluid seen from above: everything you see is reflection, the horizon a hot ring of
// the pool's own pole light
vec3 ferro(vec3 n, vec3 pc, float cloud, float ink) {
  vec3 r = vec3(2.0 * n.z * n.xy, 2.0 * n.z * n.z - 1.0);
  float hor = smoothstep(0.45, -0.35, r.z) * (1.0 - 0.6 * smoothstep(-0.35, -0.85, r.z));
  vec3 col = vec3(0.006, 0.007, 0.01) + pc * (0.05 + 1.25 * hor * (1.0 - 0.85 * ink) * (0.75 + 0.5 * cloud));
  float wb = dot(r, normalize(vec3(0.35, 0.25, 0.9))) + (cloud - 0.5) * 0.03, bw = fwidth(wb) + 0.003;
  col += pc * smoothstep(0.86 - bw, 0.95 + bw, wb) * 0.4 * (1.0 - ink);
  float sd = dot(r.xy / (length(r.xy) + 1e-4), vec2(-0.6, -0.8)), sdw = fwidth(sd) + 0.01;
  col += mix(vec3(0.9, 0.93, 1.0), pc, 0.2) * smoothstep(0.6 - sdw, 0.85 + sdw, sd) * smoothstep(-0.95, -0.5, r.z) * (1.0 - smoothstep(0.5, 0.78, r.z)) * 1.2;
  col *= 1.0 - 0.6 * smoothstep(0.2, 0.8, -sd) * hor;
  float wn = dot(r, normalize(vec3(-0.38, -0.5, 0.78))) + (cloud - 0.5) * 0.04, ww = fwidth(wn) + 0.003;
  col += vec3(0.92, 0.95, 1.0) * smoothstep(0.958 - ww, 0.972 + ww, wn) * 0.75;
  col += vec3(1.0) * pow(max(dot(r, normalize(vec3(-0.5, -0.6, 0.62))), 0.0), 90.0) * 2.6;
  return col;
}`

// THE LEVITATOR, raymarched (the demo's PIL block, unchanged but for its uniforms): world x,y + height
// z, the camera ray through screen point s runs (s.x, s.y + z*PK, z); the sea mirrors it downward.
const PIL = `
const float PK = 0.55, PZT = 0.19, RB = 0.035;
vec2 pilD = vec2(1.0, 0.0); float pilK = 0.0, pilPh = 0.0;
float pilSeed(vec2 c) { return fract(c.x * 7.31 + c.y * 3.17); }
float pilSmin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
vec3 pilChrome(vec3 n, vec3 p, vec3 tint, float t, float refl) {
  vec3 E = normalize(vec3(0.0, PK, 1.0)), Y = normalize(vec3(0.0, 1.0, 0.0) - E * E.y);
  vec3 m = refl > 0.5 ? vec3(n.xy, -n.z) : n;
  vec3 v = normalize(vec3(m.x, dot(m, Y), max(dot(m, E), 0.04)));
  float cl = textureLod(uN, p.xy * 3.0 + vec2(p.z * 4.0 + t * 0.02, 0.0), 0.0).b;
  vec3 ground = vec3(0.05, 0.052, 0.06) + vec3(0.55, 0.2, 0.05) * exp(-max(p.z, 0.0) * 70.0);
  return chrome(v, tint, ground, cl);
}
const float HP = 0.022, LZT = 0.135;
float levZ(float u) { return HP - 0.0075 + u * (LZT - HP + 0.0075); }
vec2 levAx(float z, float sd, float t) { float u = clamp((z - HP) / (LZT - HP), 0.0, 1.0); vec2 b = pilD * pilK * (0.085 * u * u + 0.024 * sin(3.1416 * u));
  return vec2(b.x, b.y > 0.0 ? b.y * 0.5 : b.y); }
vec2 pilMap(vec3 p, float pl, float sd, float t) {
  float r = length(p.xy);
  vec2 q = vec2(r - RB + 0.0035, abs(p.z - (HP - 0.02) * 0.5) - (HP + 0.02) * 0.5 + 0.0035);
  float d = min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - 0.0035;
  d = max(d, -(length(vec2(r, p.z - HP - 0.0105)) - 0.012));
  vec2 res = vec2(d, 0.0);
  float cz = clamp(p.z, HP - 0.004, LZT), u = (cz - HP) / (LZT - HP);
  float wr = 0.0026 + 0.0011 * (0.5 + 0.5 * sin(p.z * 190.0 + t * 2.0 + sd * 6.0)) + 0.0012 * (1.0 - u) + 0.0012 * max(pilK, 0.0);
  float dc = (length(vec2(length(p.xy - levAx(cz, sd, t)), p.z - cz)) - wr) * 0.7;
  float dj = pilSmin(res.x, dc, 0.006); res = vec2(dj, dc < d ? 2.0 : 0.0);
  vec2 dp = vec2(-pilD.y, pilD.x);
  for (int i = 0; i < 3; i++) { float fi = float(i), uf = 1.0 - fract(pilPh + fi / 3.0), hz = levZ(uf);
    float gr = smoothstep(1.0, 0.8, uf);
    vec3 rp = p - vec3(levAx(hz, sd, t), hz);
    float ph = t * (0.22 + 0.05 * fi) * pl + fi * 2.1 + sd * 6.28;
    rp.z -= 0.12 * (1.0 - abs(pilK)) * dot(rp.xy, vec2(cos(ph), sin(ph)));
    float ta = pilK * (0.3 + 0.2 * uf), uu = dot(rp.xy, pilD), vv = dot(rp.xy, dp), ca = cos(ta), sa = sin(ta);
    rp = vec3((uu * ca - rp.z * sa) * pilD + vv * dp, uu * sa + rp.z * ca);
    float Rm = (0.0265 - 0.0075 * uf) * (0.6 + 0.4 * gr), tr = 0.0058 * gr + 0.0002;
    float an = atan(rp.y, rp.x), sp = t * 0.35 * pl;
    tr *= 1.0 - 0.16 * smoothstep(0.82, 0.97, cos(4.0 * an + sp + fi * 2.0));
    float dt = length(vec2(length(rp.xy) - Rm, rp.z * 1.15)) - tr;
    if (dt < res.x) res = vec2(dt, 1.0);
  }
  return res;
}
float pilGlow(vec3 p, float pl, float sd, float t) {
  float r = length(p.xy - levAx(p.z, sd, t));
  return 0.14 * (1.0 + 1.6 * max(pilK, 0.0) - 0.5 * max(-pilK, 0.0)) * exp(-r / 0.008) * smoothstep(0.012, 0.022, p.z) * (1.0 - smoothstep(LZT - 0.02, LZT, p.z)) * (0.85 + 0.15 * sin(t * 1.3 + sd * 9.0));
}
float pilShadow(vec3 p, float pl, float sd, float t) {
  vec3 L = normalize(vec3(-0.4, -0.5, 0.75)); float res = 1.0, tt = 0.002;
  for (int i = 0; i < 18; i++) { float h = pilMap(p + L * tt, pl, sd, t).x; res = min(res, 9.0 * h / tt); tt += clamp(h, 0.002, 0.012); if (res < 0.02 || tt > 0.16) break; }
  return 0.3 + 0.7 * clamp(res, 0.0, 1.0);
}
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
  if (mat < 0.5) col = mix(col, pc * (0.55 + 0.35 * n.z) * (1.0 + 0.5 * max(pilK, 0.0)) + vec3(0.03), smoothstep(0.0125, 0.008, r) * step(0.0125, p.z) * 0.85);
  if (mat < 0.5) col += (pc * 0.9 + vec3(0.25)) * levFlash(r) * step(HP - 0.004, p.z) * (1.0 - 0.5 * refl);
  if (mat > 0.5 && mat < 1.5) col += pc * 0.75 * (1.0 + 1.3 * max(pilK, 0.0) - 0.5 * max(-pilK, 0.0)) * max(0.0, -dot(n.xy, (p.xy - ax) / max(ra, 1e-4))) * (1.0 - 0.5 * n.z) * (1.0 - 0.4 * refl);
  if (mat > 0.5 && mat < 1.5) col += pc * 0.9 * abs(pilK) * smoothstep(0.1, 0.9, dot((p.xy - ax) / max(ra, 1e-4), pilD * sign(pilK))) * (1.0 - 0.5 * refl);
  if (mat > 1.5) col += pc * (0.3 + 0.3 * max(pilK, 0.0));
  if (refl > 0.5) col = col * 0.42 + pc * 0.06;
  return col;
}
vec3 pilNorm(vec3 p, float pl, float sd, float t) {
  const vec2 e = vec2(0.0005, -0.0005);
  return normalize(e.xyy * pilMap(p + e.xyy, pl, sd, t).x + e.yyx * pilMap(p + e.yyx, pl, sd, t).x + e.yxy * pilMap(p + e.yxy, pl, sd, t).x + e.xxx * pilMap(p + e.xxx, pl, sd, t).x);
}
// refl 0: the camera ray; 1: the same ray mirrored in the sea. rgb + coverage. plk = pole * (2 + k),
// ang = the aim (floor, 1024 steps) + the conveyor phase (fract)
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
  col += pc * gw; a = max(a, min(1.0, gw * 3.0));
  return vec4(col, a);
}
`

// Both meshes: aPosition is a unit quad laid over uRect (world px: x, y, w, h).
export const QUAD_VERT = `
in vec2 aPosition;
out vec2 vWorld;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uRect;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vWorld = uRect.xy + aPosition * uRect.zw;
}`

export const FLOOR_FRAG = `#version 300 es
precision highp float;
in vec2 vWorld;
out vec4 finalColor;
uniform sampler2D uC;     // the melt's heat field (G) and its slope (BA), half floats, tiles every 2 units
uniform sampler2D uN;     // smooth noise: RG warp, B clouds
uniform vec4 uRect;
uniform vec2 uPl;         // the player (units)
uniform float uT, uPole, uPix, uPS, uPilR0, uPilR1, uGolR1;
uniform float uNP, uNPil, uNG, uNW, uNA, uArmPool;
uniform vec4 uPool[${NPOOL}]; uniform vec2 uPoolB[${NPOOL}]; uniform vec4 uPoolR[${NPOOL}]; uniform vec4 uPoolF[${NPOOL}];
uniform vec4 uPil[${NPIL}];
uniform vec4 uGol[${NGOL}];
uniform vec4 uWk[${NWAKE}];
uniform vec4 uArmS[${NARM}]; uniform vec2 uArmW[${NARM}];
${ENV}
${PIL}
uint hsh(ivec2 c) { uint h = uint(c.x) * 73856093u ^ uint(c.y) * 19349663u; h ^= h >> 13; h *= 1274126177u; return h ^ (h >> 16); }
float kern(vec2 e, vec2 c, float r, float a, inout vec2 g) {
  vec2 d = (e - c) / r; float x2 = dot(d, d); if (x2 >= 1.0) return 0.0;
  float m = 1.0 - x2; g -= a * 6.0 * m * m / r * d; return a * m * m * m;
}
float seg(vec2 e, vec2 a, vec2 b, float wa, float wb, float amp, inout vec2 g) {
  vec2 ab = b - a; float s = clamp(dot(e - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  return kern(e, a + ab * s, mix(wa, wb, s), amp, g);
}
// a capsule in the pool's ROTATED world frame l (isotropic), its gradient handed back in the
// ellipse-normalised frame e = l / rad that body() sums in: the pool's arms
float segL(vec2 l, vec2 a, vec2 b, float wa, float wb, float amp, vec2 rad, inout vec2 g) {
  vec2 ab = b - a; float s = clamp(dot(l - a, ab) / max(dot(ab, ab), 1e-9), 0.0, 1.0);
  float r = mix(wa, wb, s); vec2 d = (l - a - ab * s) / r; float x2 = dot(d, d); if (x2 >= 1.0) return 0.0;
  float m = 1.0 - x2; g -= amp * 6.0 * m * m / r * d * rad; return amp * m * m * m;
}
float rnd(uint h, uint b) { return float((h >> b) & 1023u) / 1023.0; }
vec2 prp(vec2 v) { return vec2(-v.y, v.x); }
vec3 gW; vec3 gM; bool gArm;
vec3 spillWarp(vec2 l, vec2 rad, vec3 F) {
  vec2 e = l / rad; vec2 sd = F.z * vec2(0.173, 0.291);
  float T = max(gM.z, 0.0), fc = max(dot(normalize(e + 1e-5), normalize(gM.xy + 1e-5)), 0.0);
  float boil = uT * (0.01 + 0.09 * T * fc);
  float bite = (textureLod(uN, e * 0.17 + sd.yx + vec2(boil, -boil * 0.7), 0.0).b - 0.5) * 0.1
             + (textureLod(uN, e * 0.43 + sd - vec2(boil * 1.3, boil), 0.0).b - 0.5) * 0.06 * (1.0 + 1.5 * T * fc);
  return vec3((textureLod(uN, e * 0.2 + sd + uT * vec2(0.004, -0.003), 0.0).rg - 0.5) * 0.24
            + (textureLod(uN, e * 0.55 + sd.yx - uT * vec2(0.006, 0.004), 0.0).gr - 0.5) * 0.09, bite);
}
// THE SPILL, an ink blot of black ferrofluid whose edge is the magnet's (the demo's body(), plus the
// pool's arms when this is the pool reaching for you). Returns the signed distance to the shore.
float body(vec2 l, vec2 rad, vec3 F, out float fw, out float fv) {
  vec2 e = l / rad; float fm = length(F.xy); vec2 fd = F.xy / rad; fd /= length(fd) + 1e-6;
  fw = smoothstep(-0.7, 1.1, dot(e, fd));
  e -= fd * fm * (0.1 + 0.05 * fw);
  e += gW.xy;
  vec2 m = gM.xy; float T = gM.z, Ta = max(T, 0.0), Tr = max(-T, 0.0); vec2 nm = m / (length(m) + 1e-5);
  int s = int(F.z) * 7 + 3; uint h0 = hsh(ivec2(s, 99)); vec2 g = vec2(0.0);
  float f = kern(e, (vec2(rnd(h0, 10u), rnd(h0, 20u)) - 0.5) * 0.15 + nm * 0.08 * Ta, 1.36, 1.0, g), sa = rnd(h0, 0u) * 6.283;
  for (int k = 0; k < 6; k++) { uint h = hsh(ivec2(s, k)); float r1 = rnd(h, 0u), r2 = rnd(h, 10u), r3 = rnd(h, 20u);
    float th = sa + (float(k) + (r1 - 0.5) * 0.7) * 1.0472 + 0.25 * sin(uT * (0.05 + 0.05 * r2) + r3 * 6.28);
    vec2 u = vec2(cos(th), sin(th)); float fc = dot(u, nm);
    float rho = (0.6 + 0.2 * r2 + 0.05 * sin(uT * 0.09 + r1 * 6.28)) * (1.0 + 0.12 * Ta * fc - 0.15 * Tr * max(fc, 0.0));
    f += kern(e, rho * u, 0.36 + 0.25 * r3, 0.8 + 0.6 * r1, g); }
  for (int k = 0; k < 8; k++) { uint h = hsh(ivec2(s, k + 10)); float r1 = rnd(h, 0u), r2 = rnd(h, 10u), r3 = rnd(h, 20u);
    float th = sa + 2.4 * float(k) + r1 * 1.5 + 0.12 * sin(uT * 0.04 + r2 * 6.28);
    float big = k < 3 ? 1.0 : 0.0, rho = (1.12 + 0.25 * (1.0 - big) * r2) + 0.13 * sin(uT * (0.06 + 0.06 * r3) + r1 * 6.28);
    vec2 c = rho * vec2(cos(th), sin(th)); c += (m - c) * 0.22 * Ta * smoothstep(-0.2, 0.9, dot(normalize(c), nm));
    f += kern(e, c, mix(0.07 + 0.05 * r3, 0.2 + 0.08 * r3, big), mix(0.62, 0.56, big), g); }
  for (int k = 0; k < 9; k++) { uint h = hsh(ivec2(s, k + 30)), h2 = hsh(ivec2(s, k + 60));
    float r1 = rnd(h, 0u), r2 = rnd(h, 10u), r3 = rnd(h, 20u), r4 = rnd(h2, 0u), r5 = rnd(h2, 10u);
    float th = sa + (float(k) + (r1 - 0.5) * 0.8) * 0.6981;
    vec2 u = vec2(cos(th), sin(th)), b = u * (0.72 + 0.08 * r4);
    float fc = dot(u, nm), gain = pow(Ta, 0.7) * smoothstep(-0.25, 0.85, fc), back = Ta * smoothstep(0.0, -0.8, fc);
    float L = (0.1 + 0.2 * r2) * (0.75 + 0.25 * sin(uT * (0.07 + 0.05 * r3) + r1 * 6.28));
    L *= (1.0 - 0.7 * back) * (1.0 - Tr * smoothstep(-0.3, 0.6, fc)) * (1.0 + 0.6 * Tr * smoothstep(0.2, -0.8, fc));
    vec2 tm = m - b; float tl = length(tm);
    L += gain * (0.7 + 0.6 * r2) * (1.0 + 0.1 * sin(uT * 5.0 + r3 * 6.28));
    L = min(L, max(tl - 0.3, 0.05));
    if (length(e - b) > L + 0.3) continue;
    vec2 d = normalize(mix(u, tm / (tl + 1e-5), clamp(gain * 1.4, 0.0, 0.95)));
    d = normalize(d - prp(nm) * dot(prp(nm), d) * 0.6 * Tr * smoothstep(-0.2, 0.7, fc));
    float cu = (r3 - 0.5) * 0.9 * (1.0 - 0.8 * clamp(gain * 1.5, 0.0, 1.0));
    float w0 = (0.12 + 0.07 * r5) * (1.0 + 0.3 * gain);
    vec2 mid = b + d * L * 0.5 + prp(d) * L * cu * 0.35, tip = mid + normalize(d + prp(d) * cu) * L * 0.5;
    f += seg(e, b, mid, w0, w0 * 0.7, 1.15, g) + seg(e, mid, tip, w0 * 0.7, 0.05, 1.15, g);
    if (r4 > 0.45) { vec2 bd = normalize(d + prp(d) * (r4 > 0.72 ? 0.9 : -0.9) * (1.0 - 0.6 * gain));
      f += seg(e, mid, mid + bd * L * (0.3 + 0.2 * r5), w0 * 0.55, 0.045, 1.0, g); }
  }
  if (Ta > 0.02) f += seg(e, nm * 0.45, nm * (0.6 + 1.0 * Ta), 0.55 * Ta + 0.05, 0.2 * Ta + 0.05, 0.9, g);
  if (Tr > 0.02) { f += kern(e, nm * 1.0, 0.45 + 0.55 * Tr, -2.6 * Tr, g); f += kern(e, -nm * 0.55, 0.75, 0.35 * Tr, g); }
  if (gArm) for (int k = 0; k < ${NARM}; k++) { if (float(k) >= uNA) break; f += segL(l, uArmS[k].xy, uArmS[k].zw, uArmW[k].x, uArmW[k].y, 1.15, rad, g); }
  f += gW.z;
  fv = f;
  return (f - 0.25) / max(length(g / rad), 1.0);
}
float poolH(vec2 l, vec2 rad, vec2 al, float kO, float kS, vec3 F, out float spk) {
  float fw, fv, s = body(l, rad, F, fw, fv), fm = length(F.xy);
  float pile = 1.0 + fm * (0.6 * fw - 0.45 * (1.0 - fw)) + 0.5 * max(-gM.z, 0.0) * (1.0 - fw);
  float t = clamp((fv - 0.25) / (0.45 * pile), 0.0, 1.0);
  float h = 0.011 * pile * sqrt(t * (2.0 - t));
  vec2 sw = textureLod(uN, l * 1.7 + vec2(uT * 0.03, -uT * 0.022), 0.0).rg + textureLod(uN, l * 3.1 - vec2(uT * 0.018, uT * 0.027), 0.0).gr * 0.6 - 0.8;
  h += (sw.x + sw.y * 0.5) * 0.0065 * t * (1.0 - 0.8 * kS);
  spk = 0.0;
  if (kO > 0.01) {
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
      vec2 ld = (al - ce) / (dm + 0.01);
      float t0 = min(length(e) / R, 1.0); e -= ld * R * 0.55 * kc * (1.0 - t0);
      float tt = length(e) / R; if (tt >= 1.0) continue;
      float g = (1.0 - tt * tt); g *= g * exp(-(0.3 + 5.0 * kc) * tt);
      spk += 0.05 * kc * sz * g;
    }
    spk *= smoothstep(-0.001, 0.01, s);
  }
  return h + spk;
}
// three rings sliding inward (dir -1) or outward over [r0, r1]
float ring(float d, float r0, float r1, float speed, float dir) {
  float span = r1 - r0, x = (d - r0) / span; if (x < 0.0 || x > 1.0) return 0.0;
  float g = fract(3.0 * x - 3.0 * speed * dir * uT), dw = min(g, 1.0 - g) * span / 3.0;
  return (1.0 - smoothstep(uPix * 0.6, uPix * 2.2, dw)) * (1.0 - x);
}
// SEA: the melt's own scale against the sim's unit, so the sea reads as calm and broad as the demo's
// at the game's (wider) camera
const float SEA = 0.6;
// GLOW: how hot the melt shows through the skin (the demo's 1.0 filled the game's wider view with orange)
const float GLOW = 0.55;
const vec2 CUR = vec2(0.857, 0.514), CRP = vec2(-0.514, 0.857);
const float AR = 0.035;
vec3 iron(vec3 n) {
  vec3 r = vec3(2.0 * n.z * n.xy, 2.0 * n.z * n.z - 1.0);
  vec3 c = mix(vec3(0.06, 0.065, 0.075), vec3(0.3, 0.305, 0.32), smoothstep(-0.32, 0.38, dot(r.xy, vec2(-0.6, -0.8))));
  float fa = dot(r.xy, vec2(0.8, -0.6)) - 0.2, fwa = fwidth(fa) + 1e-4;
  c += vec3(0.2, 0.205, 0.22) * exp(-fa * fa * 500.0) * smoothstep(0.8, 0.25, abs(dot(r.xy, vec2(0.6, 0.8)) + 0.15)) + vec3(0.32, 0.32, 0.34) * (1.0 - smoothstep(0.007 - fwa, 0.007 + fwa, abs(fa))) * smoothstep(0.6, 0.2, abs(dot(r.xy, vec2(0.6, 0.8)) + 0.15));
  float fb = dot(r.xy, vec2(0.25, 0.97)) + 0.34;
  c += vec3(0.1, 0.105, 0.12) * exp(-fb * fb * 700.0) * smoothstep(0.7, 0.1, abs(dot(r.xy, vec2(0.97, -0.25)) - 0.1));
  float lk = dot(r, normalize(vec3(-0.38, -0.52, 0.76))), fwl = fwidth(lk) + 1e-4;
  c += vec3(1.0, 0.95, 0.86) * (smoothstep(0.993 - fwl, 0.993 + fwl, lk) * (1.0 - smoothstep(0.996, 0.998 + fwl, lk)) * 0.9 + pow(max(lk, 0.0), 70.0) * 0.22);
  return c;
}
void main() {
  vec2 w = vWorld / ${U}.0;
  vec4 nz = texture(uN, w * SEA * 0.45 + vec2(uT * 0.01, -uT * 0.007));
  vec2 hz = (texture(uN, w * SEA * 2.4 + vec2(0.0, uT * 0.07)).rg - 0.5) * 0.004;
  // the current parts round every pillar (potential flow past a cylinder), with a collar, a bow of
  // standing ripples and a V wake; pillar-relative distances are in the levitator's frame (x uPS)
  vec2 wf = w, sl = vec2(0.0);
  for (int i = 0; i < ${NPIL}; i++) { if (float(i) >= uNPil) break;
    vec2 rel = (w - uPil[i].xy) * uPS; float d = max(length(rel), 1e-4); if (d > 0.34) continue;
    float s = dot(rel, CUR), t = dot(rel, CRP), a2 = AR * AR / max(d * d, AR * AR), fall = 1.0 - smoothstep(0.2, 0.34, d);
    wf += (CUR * s - CRP * t) * a2 * fall / uPS;
    vec2 dir = rel / d; float x = (d - AR) / 0.0045, cb = exp(-x * x);
    sl += dir * (-2.0 * x / 0.0045) * cb * 0.005;
    float up = smoothstep(0.4, -0.8, dot(dir, CUR)), dx = d - AR;
    sl += dir * sin(dx * 170.0 - 0.6 * sin(uT * 0.9)) * 0.05 * exp(-dx * 20.0) * (0.12 + 0.88 * up) * smoothstep(0.004, 0.03, dx);
    if (s > 0.0) { float ta = abs(t), arm = (ta - s * 0.36) / (0.01 + s * 0.12);
      sl += CRP * sign(t) * sin((ta - s * 0.36) * 230.0 - s * 90.0 + uT * 0.8) * 0.08 * exp(-arm * arm) * exp(-s * 6.0) * smoothstep(0.0, 0.03, s);
      vec2 ed = textureLod(uN, vec2(s - uT * 0.035, t) * 7.0, 0.0).rg - 0.5;
      sl += ed * 0.32 * exp(-pow(t / (0.018 + s * 0.09), 2.0)) * exp(-s * 7.0) * smoothstep(0.0, 0.05, s - AR * 0.5);
    }
  }
  // big slow swells drifting down the current, two layers crossing
  vec2 ws = wf * SEA;
  vec2 q1 = ws * 0.2 - CUR * uT * 0.011 + hz, q2 = ws.yx * 0.33 + vec2(-uT * 0.006, uT * 0.008) + hz;
  vec4 c1 = texture(uC, q1), c2 = texture(uC, q2);
  sl += ((c1.ba - 0.5) * 0.62 + (c2.ab - 0.5) * 0.3) * SEA;   // a broader swell of the same height is a gentler slope
  float hgt = c1.g * 0.65 + c2.g * 0.35;
  float pk1 = smoothstep(0.35, 0.8, texture(uN, ws * 0.3 - CUR * uT * 0.03).r), pk2 = smoothstep(0.4, 0.85, nz.g);
  sl += CUR * cos(dot(ws, CUR) * 30.0 - uT * 1.0) * 0.05 * pk1 + vec2(-0.47, 0.88) * cos(dot(ws, vec2(-0.47, 0.88)) * 47.0 + uT * 0.75) * 0.022 * pk2;
  for (int i = 0; i < ${NWAKE}; i++) { if (float(i) >= uNW) break;
    vec4 E = uWk[i]; vec2 d = w - E.xy; float dl = length(d) + 1e-4, x = dl - (0.015 + E.z * 0.17);
    sl += d / dl * sin(x * 180.0) * exp(-x * x * 1400.0) * E.w * exp(-E.z * 2.2);
  }
  vec2 gn = (texture(uN, w * SEA * 3.1 + vec2(uT * 0.02, -uT * 0.014)).rg - 0.5) * 0.4;
  vec3 n = normalize(vec3(-sl * 1.25 - gn * 0.03, 1.0));
  vec3 r = vec3(2.0 * n.z * n.xy, 2.0 * n.z * n.z - 1.0);
  vec3 col = iron(n);
  vec2 e = w * SEA * vec2(0.22, 0.12) + r.xy * 0.9 + vec2(uT * 0.004, 0.0);
  col += vec3(0.07, 0.068, 0.066) * smoothstep(0.5, 0.95, texture(uN, e * vec2(0.6, 1.9)).b);
  // the molten core under the skin: a deep, slow, refracted glow, brightest in the troughs
  float hd = texture(uC, ws * 0.42 - CUR * uT * 0.008 + sl * 0.04).g;
  float glow = smoothstep(0.36, 0.1, hd) * (0.5 + 0.5 * smoothstep(0.62, 0.25, hgt)), core = smoothstep(0.2, 0.04, hd) * (0.4 + 0.6 * smoothstep(0.55, 0.25, hgt));
  col += (vec3(0.5, 0.17, 0.03) * glow + vec3(1.0, 0.5, 0.16) * core * 0.6) * GLOW * max(1.25 - 1.5 * dot(col, vec3(0.3, 0.5, 0.2)), 0.0) * (0.75 + 0.25 * nz.b);
  // pillars in the mirror, their contact shadows, the heat round each foot, the wetting line and the
  // stream of the pull drawn on the sea (only while a pillar is aimed at YOU)
  float pixS = uPix * uPS;
  for (int i = 0; i < ${NPIL}; i++) { if (float(i) >= uNPil) break;
    vec4 P = uPil[i]; vec2 rel = (w - P.xy) * uPS; float d = length(rel); if (d > 0.31) continue;
    vec3 pc = P.z > 0.0 ? NC : SC;
    float ds = distance(rel, vec2(0.008, 0.01));
    col *= 1.0 - 0.5 * exp(-pow(max(ds - 0.03, 0.0) * 70.0, 2.0));
    float tt = clamp(rel.y / 0.15, 0.0, 1.0);
    vec2 rq = rel + vec2(sin(rel.y * 95.0 - uT * 2.0 + nz.r * 2.0) * 0.003 * tt + sl.x * 0.012 * tt, sl.y * 0.006);
    if (d > RB * 0.9) { vec4 rf = pilView(rq, P.z, P.w, pilSeed(P.xy), uT, pixS, 1.0); col = mix(col, rf.rgb + col * 0.25, rf.a * (0.82 - 0.4 * tt)); }
    col += vec3(1.0, 0.4, 0.1) * exp(-pow((d - AR - 0.0025) / 0.006, 2.0)) * (0.05 + 0.3 * smoothstep(0.3, 0.75, textureLod(uN, rel * 6.0 + vec2(uT * 0.05, 0.0), 0.0).g));
    float wl = 1.0 - smoothstep(pixS * 0.6, pixS * 1.8, abs(d - AR));
    { float kk = abs(P.z) - 2.0, a0 = floor(P.w) / 1024.0 * 6.2832 - 3.1416; vec2 dd = vec2(cos(a0), sin(a0)), pl = (uPl - P.xy) * uPS;
      float L = clamp(dot(pl, dd), 0.06, 0.2), al = dot(rel, dd), cr = abs(dot(rel, vec2(-dd.y, dd.x))), hw = 0.005 + 0.16 * max(al - RB, 0.0);
      float band = smoothstep(RB, RB + 0.012, al) * smoothstep(L + 0.01, L - 0.03, al) * smoothstep(hw, hw * 0.3, cr);
      float dash = smoothstep(0.4, 0.8, fract(al / 0.022 + (uT * 1.4 - cr * 40.0) * sign(kk))) * (0.6 + 0.4 * smoothstep(0.5, 0.0, cr / hw));
      col += pc * band * dash * abs(kk) * 0.55 * smoothstep(0.8, 0.97, dot(normalize(pl), dd)); }
    col = mix(col, vec3(1.0, 0.9, 0.74), wl * 0.75);
  }
  for (int i = 0; i < ${NPOOL}; i++) { if (float(i) >= uNP) break;
    vec4 P = uPool[i], Rq = uPoolR[i], Fq = uPoolF[i]; vec2 B = uPoolB[i], d = w - P.xy; float cs = cos(B.x), sn = sin(B.x);
    vec2 l = vec2(d.x * cs + d.y * sn, -d.x * sn + d.y * cs); float lr = length(l / P.zw);
    gArm = abs(float(i) - uArmPool) < 0.5;
    if (lr > 1.7 + 0.7 * max(Fq.w, 0.0) + (gArm ? 0.22 / min(P.z, P.w) : 0.0)) continue;
    vec2 ad = Rq.xy - P.xy, al = vec2(ad.x * cs + ad.y * sn, -ad.x * sn + ad.y * cs);
    vec3 F = vec3(Fq.x * cs + Fq.y * sn, -Fq.x * sn + Fq.y * cs, Fq.z);
    vec3 pc = B.y > 0.0 ? NC * 0.8 : SC * 1.15;
    vec2 pd = uPl - P.xy; gM = vec3(vec2(pd.x * cs + pd.y * sn, -pd.x * sn + pd.y * cs) / P.zw, Fq.w);
    gW = spillWarp(l, P.zw, F);
    float fw0, fv0, sb = body(l, P.zw, F, fw0, fv0);
    float inside = smoothstep(0.0, uPix * 1.2, sb);
    float cont = smoothstep(0.0, uPix * 0.8, -sb) * (1.0 - smoothstep(uPix * 1.6, uPix * 2.6, -sb));
    col += pc * 0.3 * exp(-max(-sb, 0.0) / 0.006) * (1.0 - inside);
    if (inside > 0.0) {
      float s0, s1, s2, ep = max(uPix * 0.8, 0.0004);
      float h0 = poolH(l, P.zw, al, Rq.z, Rq.w, F, s0), hx = poolH(l + vec2(ep, 0.0), P.zw, al, Rq.z, Rq.w, F, s1), hy = poolH(l + vec2(0.0, ep), P.zw, al, Rq.z, Rq.w, F, s2);
      vec2 g = vec2(hx - h0, hy - h0) / ep; g = vec2(g.x * cs - g.y * sn, g.x * sn + g.y * cs);
      float kl = Rq.z * (1.0 - smoothstep(0.02, 0.16, length(l - al)));
      float sh = s0 / (0.05 * kl + 1e-4);
      vec3 pn = normalize(vec3(-g - sl * 0.45, 1.0));
      vec3 pcol = ferro(pn, pc, nz.b, smoothstep(0.03, 0.22, sh) * smoothstep(0.05, 0.3, kl));
      pcol += max(iron(pn) - vec3(0.12), 0.0) * 0.35;
      pcol += pc * kl * (1.0 - smoothstep(0.0, 0.2, sh)) * 0.7;
      col = mix(col * (1.0 - 0.7 * cont), pcol, inside);
    } else col *= 1.0 - 0.7 * cont;
  }
  for (int i = 0; i < ${NPIL}; i++) { if (float(i) >= uNPil) break;
    vec4 P = uPil[i]; float d = distance(w, P.xy) + (nz.r - 0.5) * 0.012;
    col += (P.z > 0.0 ? NC : SC) * ring(d, uPilR0, uPilR1, 0.25, sign(P.z) != uPole ? -1.0 : 1.0) * 0.26;
  }
  for (int i = 0; i < ${NGOL}; i++) { if (float(i) >= uNG) break;
    vec4 P = uGol[i]; float d = distance(w, P.xy) + (nz.g - 0.5) * 0.015;
    col += (P.z > 0.0 ? NC : SC) * ring(d, P.w, uGolR1, 0.15, P.z != uPole ? -1.0 : 1.0) * 0.45;
  }
  finalColor = vec4(col, 1.0);
}`

export const PIL_FRAG = `#version 300 es
precision highp float;
in vec2 vWorld;
out vec4 finalColor;
uniform sampler2D uN;
uniform float uT, uPix, uPS;
uniform vec4 uP;     // x, y (units), pole * (2 + k), aim + conveyor phase
${ENV}
${PIL}
void main() {
  vec2 s = (vWorld / ${U}.0 - uP.xy) * uPS;
  vec4 c = pilView(s, uP.z, uP.w, pilSeed(uP.xy), uT, uPix * uPS, 0.0);
  if (c.a < 0.003) discard;
  finalColor = vec4(c.rgb * c.a, c.a);
}`

// ---- the CPU-baked textures the floor reads (the demo's units 0 and 1) --------------------------
const mkRnd = (s) => () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
const sst = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))
function tileNoise(S, P, rnd) {
  const g = new Float32Array(P * P).map(() => rnd()), o = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    const fy = (y / S) * P, iy = fy | 0, ty = sst(fy - iy), y0 = (iy % P) * P, y1 = ((iy + 1) % P) * P
    for (let x = 0; x < S; x++) {
      const fx = (x / S) * P, ix = fx | 0, tx = sst(fx - ix), x0 = ix % P, x1 = (ix + 1) % P
      const a = g[y0 + x0] + (g[y0 + x1] - g[y0 + x0]) * tx, b = g[y1 + x0] + (g[y1 + x1] - g[y1 + x0]) * tx
      o[y * S + x] = a + (b - a) * ty
    }
  }
  return o
}
const F32 = new Float32Array(1), U32 = new Uint32Array(F32.buffer)
const f2h = (v) => { F32[0] = v; const x = U32[0], sg = (x >> 16) & 0x8000, e = ((x >> 23) & 0xff) - 112; return e <= 0 ? sg : e >= 31 ? sg | 0x7c00 : sg | (e << 10) | ((x >> 13) & 0x3ff) }
// the heat field of the melt (512, half floats: 8-bit steps showed as stepped river edges): G heat, BA its slope
export const HEAT_N = 512
export function bakeHeat() {
  const S = HEAT_N, rnd = mkRnd(7), M = S - 1
  const h1 = tileNoise(S, 4, rnd), h2 = tileNoise(S, 7, rnd), phi = new Float32Array(S * S)
  for (let i = 0; i < S * S; i++) phi[i] = 0.7 * h1[i] + 0.3 * h2[i]
  let pmin = 9, pmax = -9
  for (const v of phi) { pmin = Math.min(pmin, v); pmax = Math.max(pmax, v) }
  const d = new Uint16Array(S * S * 4), gxa = new Float32Array(S * S), gya = new Float32Array(S * S)
  let gm = 1e-6
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const k = y * S + x
    gxa[k] = phi[y * S + ((x + 1) & M)] - phi[y * S + ((x - 1) & M)]; gya[k] = phi[((y + 1) & M) * S + x] - phi[((y - 1) & M) * S + x]
    gm = Math.max(gm, Math.abs(gxa[k]), Math.abs(gya[k]))
  }
  const one = f2h(1)
  for (let k = 0; k < S * S; k++) { d[k * 4 + 1] = f2h((phi[k] - pmin) / (pmax - pmin)); d[k * 4 + 2] = f2h(0.5 + (0.5 * gxa[k]) / gm); d[k * 4 + 3] = f2h(0.5 + (0.5 * gya[k]) / gm); d[k * 4] = one }
  return d
}
// smooth noise (256): RG warp, B clouds
export const NOISE_N = 256
export function bakeNoise() {
  const S = NOISE_N, rnd = mkRnd(41), a = tileNoise(S, 6, rnd), b = tileNoise(S, 6, rnd), c = tileNoise(S, 12, rnd), d = new Uint8Array(S * S * 4)
  for (let i = 0; i < S * S; i++) { d[i * 4] = a[i] * 255; d[i * 4 + 1] = b[i] * 255; d[i * 4 + 2] = c[i] * 255; d[i * 4 + 3] = 255 }
  return d
}
