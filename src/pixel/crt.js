// The Magma's screen pass: LAVA IS THE LIGHT, seen through a light CRT.
//
// One filter over the whole stage does four things, in this order:
//   1. SNAP: the frame is sampled once per art pixel (uPx screen px), so everything in the chapter —
//      including what render.js draws generically, damage numbers and dust — lands on ONE grid.
//   2. LIGHT: the cave is dark. Each block's colour is treated as albedo and lit by a cool ambient
//      plus the LIGHT MAP (uLightTex: one texel per block, painted by the rig from every lava pool,
//      crack, puddle, shot, bomb, creature glow and the player's own small light). The light is
//      quantised into dithered bands (Bayer 4x4), so its falloff is pixel art too, not a smooth blur.
//      Anything painted HOT (lava, embers, seams, eyes) or near-white is EMISSIVE: it keeps its own
//      colour in the dark, and spills a little glow onto its neighbours (step 3).
//   3. GLOW: hot blocks bleed a short phosphor halo (16 taps at 2 and 4.5 blocks).
//   4. CRT: fine scanlines (one per art-pixel row), a faint RGB aperture mask, a soft vignette. No
//      curvature, no blur: the owner wants it clean on a small phone screen.
export const CRT_VERT = 'in vec2 aPosition;\nout vec2 vTextureCoord;\nuniform vec4 uInputSize;\nuniform vec4 uOutputFrame;\nuniform vec4 uOutputTexture;\n'
  + 'vec4 filterVertexPosition(void) {\n  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;\n  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;\n'
  + '  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;\n  return vec4(position, 0.0, 1.0);\n}\n'
  + 'void main(void) {\n  gl_Position = filterVertexPosition();\n  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);\n}\n'

export const CRT_FRAG = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uLightTex;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform float uPx;
uniform float uScan;
uniform float uMask;
uniform float uVignette;
uniform float uGlow;
uniform float uGain;
uniform float uSteps;
uniform float uHeat;
uniform vec3 uAmbient;
uniform vec2 uLightSize;
uniform vec2 uLightOff;

// ordered dither, 4x4 Bayer, built arithmetically (WebGL1 has no array initialisers)
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

vec3 tap(vec2 px) {
  vec2 uv = px * uInputSize.zw;
  vec2 lim = uOutputFrame.zw * uInputSize.zw;
  return texture(uTexture, clamp(uv, vec2(0.0), lim - uInputSize.zw * 0.5)).rgb;
}
// how self-lit an albedo colour is: hot (red well above blue, and bright) or near-white
float heat(vec3 c) {
  float warm = smoothstep(0.38, 0.68, c.r - c.b) * smoothstep(0.42, 0.72, c.r);
  float white = smoothstep(0.80, 0.96, min(c.r, min(c.g, c.b)));
  return max(warm, white);
}
void main(void) {
  vec2 p = vTextureCoord * uInputSize.xy;                // screen px
  vec2 cell = floor(p / uPx);
  vec2 ctr = (cell + 0.5) * uPx;
  vec3 alb = tap(ctr);

  // the light map: one texel per block
  vec3 L = texture(uLightTex, (cell + uLightOff + 0.5) / uLightSize).rgb * uGain;
  L = L / (1.0 + 0.3 * L);            // many lamps saturate gently: the cave never washes out flat
  float lm = max(L.r, max(L.g, L.b));
  float b = bayer4(cell) + 0.03125;
  float lq = floor(lm * uSteps + b) / uSteps;
  L = lm > 0.0001 ? L * (lq / lm) : vec3(0.0);

  float e = heat(alb) * uHeat;
  vec3 col = alb * (uAmbient + L);
  col = mix(col, alb * (0.95 + 0.12 * min(lm, 1.5)), e);

  // phosphor glow off hot neighbours
  vec3 g = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    vec2 d = vec2(cos(a), sin(a)) * uPx;
    vec3 t1 = tap(ctr + d * 2.0);
    vec3 t2 = tap(ctr + d * 4.5);
    g += t1 * heat(t1) * 0.6 + t2 * heat(t2) * 0.4;
  }
  col += g * (uGlow / 8.0) * vec3(1.0, 0.82, 0.62) * (1.0 - 0.85 * e);

  // CRT: a scanline at the foot of every art-pixel row, a faint aperture mask, a soft vignette
  float fy = fract(p.y / uPx);
  col *= 1.0 - uScan * smoothstep(0.55, 0.95, fy);
  float m = mod(floor(gl_FragCoord.x), 3.0);
  vec3 mask = m < 1.0 ? vec3(1.0, 1.0 - uMask, 1.0 - uMask) : m < 2.0 ? vec3(1.0 - uMask, 1.0, 1.0 - uMask) : vec3(1.0 - uMask, 1.0 - uMask, 1.0);
  col *= mask * (1.0 + uMask * 0.5);
  vec2 q = p / uOutputFrame.zw - 0.5;
  col *= 1.0 - uVignette * smoothstep(0.12, 0.55, dot(q, q));
  finalColor = vec4(col, 1.0);
}
`
// the pass's knobs. They live here, with the art they were tuned against: CHAPTERS.magma.render.pixel
// only switches the look on (its numbers predate this pass and are not read).
export const CRT_LOOK = {
  scan: 0.22, mask: 0.07, vignette: 0.35, glow: 0.34, gain: 2.6, steps: 6, heat: 1,
  ambient: [0.42, 0.40, 0.60],
}
