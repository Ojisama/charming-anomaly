// The Mantle's world, drawn as a cartoon: the floor (its height, the lava in it, the shoreline and the
// swell that telegraphs the flood), the props on the dry ground, the shots, the pickups (render-only).
//
// THE FLOOR is one shader (FLOOR_FRAG) run over chunks of the world. Each chunk carries a texture of
// the ground's HEIGHT (sim.js mantleHeightAt, sampled every CHUNK_STEP px) and the shader is handed
// the tide (uLine: the height under which ground is lava; uSwell: the shores swelling). So the lava
// on screen is the sim's own lava: a body standing in what looks like lava is in it.
import { PAL, TAU, inkShape, ellipse, flame, mkCanvas } from './palette.js'

export const CHUNK = 1024          // world px per floor chunk
export const CHUNK_STEP = 8        // world px between the height samples a chunk's texture holds
export const CHUNK_N = CHUNK / CHUNK_STEP + 1   // samples a side (the last one is the next chunk's first)

const glc = (h) => { const n = parseInt(h.slice(1), 16); return `vec3(${((n >> 16) & 255) / 255}, ${((n >> 8) & 255) / 255}, ${(n & 255) / 255})` }

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

// The floor's look, per pixel:
//   ROCK (dry): cel bands by height, from scorched brown in the basins to cream on the hilltops, an
//     airbrushed light from the upper left off the ground's own slope, faint hand-inked contour lines,
//     and a dark scorch just above the shore where the lava has been.
//   THE SHORE: a thick ink line where the ground meets the lava, a hot lip just inside it.
//   THE SWELL (the tell): while uSwell > 0 a band of the dry ground above the shore glows hot and
//     bubbles — the lava is about to climb there.
//   LAVA: saturated orange-red, hotter by the shore and deeper red out in the basin, with slow
//     toon ripples and cartoon bubbles (ink rings) that grow and pop.
export const FLOOR_FRAG = `precision highp float;
in vec2 vUV;
in vec2 vWorld;
out vec4 finalColor;
uniform sampler2D uHeight;
uniform float uLine;
uniform float uSwell;
uniform float uTime;
uniform float uPulse;
uniform float uTexel;
uniform float uStep;
uniform float uInk;
float hh(vec2 uv) { return texture(uHeight, uv).r; }
float h12(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), f.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float h = hh(vUV);
  float hx = hh(vUV + vec2(uTexel, 0.0)) - hh(vUV - vec2(uTexel, 0.0));
  float hy = hh(vUV + vec2(0.0, uTexel)) - hh(vUV - vec2(0.0, uTexel));
  vec2 g = vec2(hx, hy) / (2.0 * uStep);
  float gl = max(length(g), 0.00004);
  // the shore, wobbled a little by hand (and harder while it swells)
  float wob = (vn(vWorld * 0.045 + uTime * 0.6) - 0.5) * (2.0 + 3.0 * uSwell);
  float dist = (h - uLine) / gl + wob;           // world px from the shoreline, + on dry ground
  vec3 col;
  if (dist > 0.0) {
    // ROCK: four cel tones by height above the lava line
    float up = clamp((h - uLine) / 0.28, 0.0, 1.0);
    float t = floor(up * 4.0 + vn(vWorld * 0.01) * 0.6) / 4.0;
    vec3 low = ${glc(PAL.rockLow)}, mid = ${glc(PAL.rockMid)}, hi = ${glc(PAL.rockHigh)}, top = ${glc(PAL.rockTop)};
    col = t < 0.25 ? low : t < 0.5 ? mid : t < 0.75 ? hi : top;
    // airbrushed light off the slope, from the upper left
    vec3 n = normalize(vec3(-g * 900.0, 1.0));
    float lit = dot(n, normalize(vec3(-0.5, -0.6, 0.62)));
    col *= 0.78 + 0.32 * smoothstep(0.2, 1.0, lit);
    // painted paper grain
    col *= 0.94 + 0.08 * vn(vWorld * 0.09);
    // hand-inked contour lines (every 0.045 of height), faint
    float cs = 0.045;
    float cd = abs(fract(h / cs + (vn(vWorld * 0.02) - 0.5) * 0.25) - 0.5) * cs / gl;
    col = mix(col, ${glc(PAL.inkSoft)}, 0.32 * (1.0 - smoothstep(0.6, 1.8, cd)));
    // scorch: the dark stain the lava leaves just above its shore
    col = mix(col, ${glc(PAL.rockLow)} * 0.7, 0.55 * (1.0 - smoothstep(0.0, 70.0, dist)));
    // THE SWELL: the band about to go under glows and bubbles
    float band = 64.0 * uSwell;
    if (dist < band) {
      float k = 1.0 - dist / max(band, 0.001);
      float scal = 0.5 + 0.5 * sin(vWorld.x * 0.11 + vWorld.y * 0.07 + uTime * 5.0);
      vec3 hot = mix(${glc(PAL.lava)}, ${glc(PAL.lavaHot)}, scal);
      // a scalloped, breathing front: the lava's edge heaving up the bank
      float front = smoothstep(0.35, 0.7, k + 0.18 * sin(vWorld.x * 0.07 - vWorld.y * 0.05 + uTime * 6.0));
      col = mix(col, ${glc(PAL.rockLow)} * 0.6, k * 0.5);
      col = mix(col, hot, front * (0.7 + 0.2 * sin(uTime * 7.0)));
      // bubbles on the bank, popping
      vec2 bc = floor(vWorld / 22.0);
      float rb = h12(bc + 11.0);
      vec2 bp = (bc + 0.5) * 22.0;
      float bph = fract(uTime * 1.3 + rb * 5.0);
      float bb = length(vWorld - bp) - 4.0 * bph;
      col = mix(col, ${glc(PAL.lavaGlow)}, step(0.6, rb) * k * (1.0 - smoothstep(-1.0, 0.0, bb)));
    }
  } else {
    // LAVA
    float deep = clamp(-dist / 220.0, 0.0, 1.0);
    col = mix(${glc(PAL.lavaHot)}, ${glc(PAL.lava)}, smoothstep(0.0, 0.35, deep));
    col = mix(col, ${glc(PAL.lavaDeep)}, smoothstep(0.45, 1.0, deep));
    // slow toon ripples: bright bands that drift
    float rip = sin(vWorld.x * 0.018 + vWorld.y * 0.011 + uTime * 1.3 + vn(vWorld * 0.006) * 9.0);
    col = mix(col, ${glc(PAL.lavaGlow)}, smoothstep(0.86, 0.95, rip) * (0.75 - 0.4 * deep));
    // crust flecks out in the deep, dark and inked
    float fl = vn(vWorld * 0.03 + vec2(uTime * 0.12, 0.0)) * 0.7 + vn(vWorld * 0.09) * 0.3;
    col = mix(col, ${glc(PAL.lavaDeep)} * 0.7, smoothstep(0.74, 0.78, fl) * smoothstep(0.3, 1.0, deep) * 0.8);
    // cartoon bubbles: one per cell, growing then popping, an ink ring round a hot bead
    vec2 cell = floor(vWorld / 80.0);
    float r0 = h12(cell);
    float ph = fract(uTime * (0.3 + 0.35 * r0) + r0 * 7.0);
    vec2 c = (cell + 0.25 + 0.5 * vec2(h12(cell + 7.1), h12(cell + 3.3))) * 80.0;
    float br = (2.5 + 5.0 * r0) * ph * (1.0 + 0.6 * uSwell);
    float bd = length(vWorld - c);
    // more bubbles near the shore while it swells
    float on = step(0.55 - 0.35 * uSwell * (1.0 - deep), r0) * step(ph, 0.9);
    col = mix(col, ${glc(PAL.lavaGlow)}, on * (1.0 - smoothstep(br - 1.5, br, bd)) * 0.8);
    col = mix(col, ${glc(PAL.ink)}, on * (1.0 - smoothstep(1.2, 2.2, abs(bd - br))));
    // the hot lip just inside the shore
    col = mix(col, ${glc(PAL.lavaGlow)}, 1.0 - smoothstep(uInk, uInk + 7.0, -dist));
    col *= 1.0 + 0.3 * uPulse;
  }
  // THE SHORE'S INK
  col = mix(col, ${glc(PAL.ink)}, 1.0 - smoothstep(uInk * 0.5, uInk, abs(dist)));
  finalColor = vec4(col, 1.0);
}`

// ---- the film pass: a print run through an old projector ------------------------------------------
// Over the whole stage (the DOM HUD is not in it). A sepia grade that spares the hot colours (fire and
// lava keep their saturation), grain, a soft vignette, the projector's flicker, and a faint gate weave.
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
float h12(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec2 lim = uOutputFrame.zw * uInputSize.zw;
  vec2 uv = clamp(vTextureCoord + uWeave * uInputSize.zw, vec2(0.0), lim);
  vec4 c = texture(uTexture, uv);
  // the grade: toward sepia, except what is hot and saturated
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float warm = step(c.b, c.r) * smoothstep(0.35, 0.65, sat);
  vec3 sep = vec3(l * 1.08, l * 0.94, l * 0.74);
  c.rgb = mix(c.rgb, sep, uSepia * (1.0 - warm));
  // the projector's flicker, frame to frame
  float fk = h12(vec2(floor(uTime * 24.0), 3.7));
  c.rgb *= 1.0 + uFlicker * (fk - 0.5) * 2.0;
  // grain, a fresh frame of it 24 times a second
  vec2 px = vScreen * uOutputFrame.zw;
  float n = h12(floor(px / 1.5) + floor(uTime * 24.0) * 17.31) - 0.5;
  c.rgb += n * uGrain;
  // now and then a speck of dust on the print
  float sp = h12(floor(px / 3.0) + floor(uTime * 12.0) * 5.1);
  c.rgb = mix(c.rgb, vec3(0.1, 0.07, 0.05), step(0.99993, sp) * 0.7);
  // the vignette
  vec2 q = vScreen - 0.5;
  q.x *= uOutputFrame.z / max(uOutputFrame.w, 1.0);
  float v = smoothstep(0.32, 0.95, length(q) * 1.15);
  c.rgb *= 1.0 - uVignette * v;
  finalColor = vec4(c.rgb, c.a);
}`

// ---- props on the dry ground: basalt boulders, little spires, a skull rock ------------------------
// Painted at res 3 (canvas px per world px). Each -> { canvas, ax, ay, res }.
const RES = 3
function bakeArt(w, h, ax, ay, paint) {
  const cv = mkCanvas(w * RES, h * RES)
  const ctx = cv.getContext('2d')
  ctx.scale(RES, RES); ctx.translate(w * ax, h * ay)
  paint(ctx)
  return { canvas: cv, ax, ay, res: RES }
}
export const PROP_KINDS = ['boulder', 'spire', 'skull']
export function paintProp(kind, v) {
  if (kind === 'boulder') return bakeArt(60, 44, 0.5, 0.7, (ctx) => {
    ctx.fillStyle = 'rgba(28,18,13,0.3)'; ctx.beginPath(); ctx.ellipse(0, 6, 26, 7, 0, 0, TAU); ctx.fill()
    const s = 0.8 + v * 0.15
    inkShape(ctx, (c) => { c.moveTo(-22 * s, 4); c.quadraticCurveTo(-24 * s, -14 * s, -6 * s, -20 * s); c.quadraticCurveTo(14 * s, -24 * s, 22 * s, -6 * s); c.quadraticCurveTo(25 * s, 6, 10 * s, 7); c.closePath() },
      PAL.basalt, 3, { shade: PAL.basaltLo, hi: PAL.basaltHi, box: [-22 * s, -24 * s, 47 * s, 31 * s] })
    ctx.beginPath(); ctx.moveTo(-6 * s, -14 * s); ctx.quadraticCurveTo(0, -8 * s, 8 * s, -12 * s); ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.2; ctx.stroke()
  })
  if (kind === 'spire') return bakeArt(36, 70, 0.5, 0.9, (ctx) => {
    ctx.fillStyle = 'rgba(28,18,13,0.3)'; ctx.beginPath(); ctx.ellipse(0, 2, 15, 5, 0, 0, TAU); ctx.fill()
    const s = 0.75 + v * 0.15
    inkShape(ctx, (c) => { c.moveTo(-11 * s, 2); c.lineTo(-7 * s, -40 * s); c.lineTo(-1 * s, -56 * s); c.lineTo(5 * s, -38 * s); c.lineTo(11 * s, 2); c.closePath() },
      PAL.basalt, 2.6, { shade: PAL.basaltLo, hi: PAL.basaltHi, box: [-11 * s, -56 * s, 22 * s, 58 * s] })
    ctx.beginPath(); ctx.moveTo(-2 * s, -46 * s); ctx.lineTo(0, -6); ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1; ctx.stroke()
  })
  return bakeArt(40, 34, 0.5, 0.75, (ctx) => {
    ctx.fillStyle = 'rgba(28,18,13,0.3)'; ctx.beginPath(); ctx.ellipse(0, 4, 16, 5, 0, 0, TAU); ctx.fill()
    inkShape(ctx, (c) => { c.ellipse(0, -8, 13, 11, 0, 0, TAU) }, PAL.paper, 2.4, { shade: PAL.paperShade, box: [-13, -19, 26, 22] })
    inkShape(ctx, (c) => c.roundRect(-7, -1, 14, 6, 2), PAL.paper, 2)
    for (const x of [-5, 5]) { ctx.beginPath(); ctx.ellipse(x, -9, 3.4, 4, 0, 0, TAU); ctx.fillStyle = PAL.ink; ctx.fill() }
    ctx.beginPath(); ctx.moveTo(-1, -3); ctx.lineTo(1, -3); ctx.lineTo(0, -5.5); ctx.closePath(); ctx.fill()
  })
}

// ---- shots and pickups ---------------------------------------------------------------------------
// A lit match, nose +x, its flame at the head
export function paintMatch(f) {
  return bakeArt(34, 22, 0.35, 0.5, (ctx) => {
    ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(8, 0); ctx.strokeStyle = PAL.ink; ctx.lineWidth = 4.4; ctx.stroke()
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(8, 0); ctx.strokeStyle = PAL.wood; ctx.lineWidth = 2.4; ctx.stroke()
    inkShape(ctx, ellipse(10, 0, 3.6, 3), PAL.matchHead, 1.4)
    ctx.save(); ctx.translate(12, 0); ctx.rotate(Math.PI / 2); flame(ctx, 0, 1, 5.5, f * 2.1); ctx.restore()
  })
}
// a red-hot coal, a lumpy black rock glowing through its cracks
export function paintCoal(f) {
  return bakeArt(26, 26, 0.5, 0.5, (ctx) => {
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 12)
    g.addColorStop(0, 'rgba(255,140,40,0.6)'); g.addColorStop(1, 'rgba(255,90,20,0)')
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill()
    inkShape(ctx, (c) => { c.moveTo(-7, -3); c.lineTo(-3, -7); c.lineTo(4, -6); c.lineTo(7, -1); c.lineTo(5, 5); c.lineTo(-2, 7); c.lineTo(-7, 3); c.closePath() }, '#2f2622', 2, { hi: '#5a4a42', box: [-7, -7, 14, 14] })
    ctx.lineCap = 'round'
    for (const [a, b, c2, d] of [[-4, -2, 1, 1], [1, 1, 4, -3], [1, 1, -1, 5]]) {
      ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c2, d); ctx.strokeStyle = f % 2 ? PAL.lavaGlow : PAL.lavaHot; ctx.lineWidth = 1.6; ctx.stroke()
    }
  })
}
// a pitchfork, tines +x
export function paintPitchfork() {
  return bakeArt(56, 26, 0.5, 0.5, (ctx) => {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    const line = (pts, w, col) => { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke() }
    const shaft = [-24, 0, 8, 0], bar = [8, -8, 8, 8]
    const tines = [[8, -8, 22, -8], [8, 0, 24, 0], [8, 8, 22, 8]]
    line(shaft, 5.5, PAL.ink); line(bar, 5, PAL.ink); for (const t of tines) line(t, 4.4, PAL.ink)
    line(shaft, 3, PAL.wood); line(bar, 2.6, PAL.iron); for (const t of tines) line(t, 2.2, PAL.ironHi)
  })
}
// one puff of the whistle's steam ring
export function paintPuff(v) {
  return bakeArt(30, 26, 0.5, 0.5, (ctx) => {
    const s = 0.8 + v * 0.15
    inkShape(ctx, (c) => { c.arc(-5 * s, 2, 7 * s, 0, TAU) }, PAL.steam, 1.6)
    inkShape(ctx, (c) => { c.arc(5 * s, 1, 6 * s, 0, TAU) }, PAL.steam, 1.6)
    inkShape(ctx, (c) => { c.arc(0, -4, 7.5 * s, 0, TAU) }, PAL.steam, 1.6, { shade: PAL.steamShade, box: [-8, -12, 16, 16] })
  })
}
// an XP gem: a teal cut stone with a shine
export function paintGem(tier, f) {
  const s = [1, 1.3, 1.65][tier] ?? 1
  return bakeArt(24 * s, 26 * s, 0.5, 0.5, (ctx) => {
    ctx.scale(s, s)
    inkShape(ctx, (c) => { c.moveTo(0, -9); c.lineTo(7, -2); c.lineTo(0, 9); c.lineTo(-7, -2); c.closePath() }, tier === 2 ? '#d9473b' : tier === 1 ? '#7d63c9' : PAL.gem, 1.8,
      { shade: PAL.gemShade, hi: PAL.gemHi, box: [-7, -9, 14, 18] })
    ctx.beginPath(); ctx.moveTo(-7, -2); ctx.lineTo(7, -2); ctx.strokeStyle = PAL.ink; ctx.lineWidth = 0.9; ctx.stroke()
    if (f) { ctx.fillStyle = PAL.white; ctx.beginPath(); ctx.moveTo(-3, -5); ctx.lineTo(-1.5, -6.5); ctx.lineTo(-0.5, -4); ctx.closePath(); ctx.fill() }
  })
}
// a gold coin with a star, seen edge-on in one frame (it spins)
export function paintCoin(f) {
  return bakeArt(22, 22, 0.5, 0.5, (ctx) => {
    const k = [1, 0.55, 0.15, 0.55][f % 4]
    inkShape(ctx, ellipse(0, 0, 7.5 * k + 0.6, 7.5), PAL.coin, 1.8, { shade: PAL.coinShade, hi: PAL.coinHi, box: [-7.5, -7.5, 15, 15] })
    if (k > 0.5) {
      ctx.beginPath()
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 1.6 : 3.8; ctx.lineTo(Math.cos(a) * r * k, Math.sin(a) * r) }
      ctx.closePath(); ctx.fillStyle = PAL.coinShade; ctx.fill()
    }
  })
}
// a flame licking off a body standing in the lava (its feet), and a generic ink-ringed shot
export function paintLick(f) { return bakeArt(22, 26, 0.5, 0.85, (ctx) => flame(ctx, 0, 0, 7, f * 1.9)) }
export function paintDot() {
  return bakeArt(16, 16, 0.5, 0.5, (ctx) => inkShape(ctx, ellipse(0, 0, 4.5, 4.5), PAL.lavaGlow, 1.6))
}
