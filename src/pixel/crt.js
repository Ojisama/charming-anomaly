// The Magma's screen pass: LAVA IS THE LIGHT, seen through a light CRT.
//
// Simple art, real light (owner: "SIMPLER PIXEL ART but REALISTIC LIGHTING"). The art is flat albedo
// with few colours; everything that makes the picture is done here, once per art pixel:
//   1. SNAP: the frame is sampled once per art pixel (uPx screen px), so everything in the chapter —
//      including what render.js draws generically, damage numbers and dust — lands on ONE grid.
//   2. LIGHT: the cave is near black. Each block's colour is albedo, lit by a faint cool ambient plus
//      the LIGHT MAP (uLightTex: one texel per block, painted by the rig from every lava pool, crack,
//      shot, bomb, creature glow and the player's own small light). A warm light FALLS OFF IN COLOUR as
//      well as strength — pale gold at its heart, orange, then a deep red edge into the dark — and is
//      quantised into dithered bands (Bayer 4x4), so the falloff is pixel art too.
//   3. FACING: the light map's gradient says where the light comes from. A block whose neighbour
//      TOWARD the light is an outline is an edge facing the lava: it takes a bright rim. A block whose
//      neighbour AWAY from it is an outline is the far side: it falls into shade. So every outlined
//      body is lit from the side facing the lava, without a normal map. In the dark, a faint cool rim
//      on every outline's upper-left keeps silhouettes readable.
//   4. EMISSIVE + BLOOM: anything painted HOT (lava, embers, seams, eyes) keeps its own colour in the
//      dark and blooms onto its neighbours (24 taps at 2, 4 and 7 blocks, so a pool has a wide halo).
//   5. CRT: fine scanlines (one per art-pixel row), a faint RGB aperture mask, a soft vignette. No
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
uniform float uRim;
uniform vec3 uAmbient;
uniform vec3 uAmbRim;
uniform vec2 uLightSize;
uniform vec2 uLightOff;

// ordered dither, 4x4 Bayer, built arithmetically (WebGL1 has no array initialisers)
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

vec3 tap(vec2 px) {
  vec2 uv = px * uInputSize.zw;
  vec2 lim = uOutputFrame.zw * uInputSize.zw;
  return texture(uTexture, clamp(uv, vec2(0.0), lim - uInputSize.zw * 0.5)).rgb;
}
vec3 lightAt(vec2 cell) { return texture(uLightTex, (cell + uLightOff + 0.5) / uLightSize).rgb * uGain; }
// how self-lit an albedo colour is: hot (red well above blue, and bright), or near-white (a hit flash)
float hot(vec3 c) { return smoothstep(0.38, 0.68, c.r - c.b) * smoothstep(0.42, 0.72, c.r); }
float heat(vec3 c) { return max(hot(c), smoothstep(0.84, 0.97, min(c.r, min(c.g, c.b)))); }
float isInk(vec3 c) { return 1.0 - step(0.055, lum(c)); }
void main(void) {
  vec2 p = vTextureCoord * uInputSize.xy;                // screen px
  vec2 cell = floor(p / uPx);
  vec2 ctr = (cell + 0.5) * uPx;
  vec3 alb = tap(ctr);

  // the light, and its colour falling off from gold through orange to a deep red edge
  vec3 L = lightAt(cell);
  float lm = max(L.r, max(L.g, L.b));
  float warm = clamp((L.r - L.b) / max(lm, 0.0001) * 1.3, 0.0, 1.0);
  vec3 fall = mix(vec3(1.0, 0.30, 0.12), vec3(1.0, 0.90, 0.72), smoothstep(0.05, 1.6, lm));
  L *= mix(vec3(1.0), fall * 1.12, warm);
  L = L / (1.0 + 0.22 * L);
  lm = max(L.r, max(L.g, L.b));
  float b = bayer4(cell) + 0.03125;
  float lq = floor(lm * uSteps + b) / uSteps;
  L = lm > 0.0001 ? L * (lq / lm) : vec3(0.0);

  vec3 col = alb * (uAmbient + L);

  // FACING: which side of a body looks at the light
  float ink = isInk(alb);
  float gx = lum(lightAt(cell + vec2(2.0, 0.0))) - lum(lightAt(cell - vec2(2.0, 0.0)));
  float gy = lum(lightAt(cell + vec2(0.0, 2.0))) - lum(lightAt(cell - vec2(0.0, 2.0)));
  float gl = length(vec2(gx, gy));
  if (ink < 0.5 && gl > 0.015) {
    vec2 d = vec2(gx, gy) / gl;
    vec2 o = floor(d * 1.3 + 0.5);
    float lit = isInk(tap(ctr + o * uPx));
    float shade = isInk(tap(ctr - o * uPx));
    float k = min(gl * 5.0, 1.0);
    col += alb * L * lit * uRim * k + lit * k * 0.06 * L;
    col *= 1.0 - shade * 0.45 * k;
  }
  // the faint cool rim on every outline's upper-left: the dark is never empty of shapes
  if (ink < 0.5) {
    float up = isInk(tap(ctr + vec2(0.0, -uPx))) * isInk(tap(ctr + vec2(-uPx, 0.0)));
    float either = max(isInk(tap(ctr + vec2(0.0, -uPx))), isInk(tap(ctr + vec2(-uPx, 0.0))));
    col += (0.35 + 0.65 * lum(alb)) * uAmbRim * (either * 0.6 + up * 0.4);
  }

  float e = heat(alb) * uHeat;
  col = mix(col, alb * (1.0 + 0.12 * min(lm, 1.5)), e);

  // bloom off hot neighbours: a short bright halo and a wide soft one (a white hit flash does not)
  vec3 g = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398 + 0.3927;
    vec2 d = vec2(cos(a), sin(a)) * uPx;
    vec3 t1 = tap(ctr + d * 2.0);
    vec3 t2 = tap(ctr + d * 4.0);
    vec3 t3 = tap(ctr + d * 7.0);
    g += t1 * hot(t1) * 0.5 + t2 * hot(t2) * 0.32 + t3 * hot(t3) * 0.2;   // only HEAT blooms
  }
  col += g * (uGlow / 8.0) * vec3(1.0, 0.74, 0.5) * (1.0 - 0.8 * e);

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
  scan: 0.2, mask: 0.06, vignette: 0.3, glow: 0.42, gain: 2.4, steps: 10, heat: 1, rim: 1.1,
  ambient: [0.27, 0.25, 0.38], ambRim: [0.1, 0.12, 0.2],
}
