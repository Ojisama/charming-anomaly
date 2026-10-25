// px2d: a Canvas2D-shaped context that draws into a Pixi Container as Graphics + Sprites, rebuilt every frame.
// It is how a mock-up style's per-frame painter runs on game tech unchanged: drawImage of a baked canvas becomes a
// pooled Sprite (the bake is uploaded once), paths become Graphics (the kraken's idiom, render.js), clip becomes a mask.
// Anything the game cannot do per frame (shadowBlur, ctx.filter, pixel reads/writes, exotic composite ops) is not
// emulated: it is counted in px.bad so a style that leans on it is caught, never hidden.
// ponytail: curves are flattened on the CPU every frame; cache the flattened bakes if a phone profile says so.
// Two page-wide patches, installed once before any style code runs:
//  - Path2D records its commands, so a path built once and filled per frame can be replayed as Graphics;
//  - every 2D context bumps its canvas's version when it draws, so a canvas REDRAWN per frame is re-uploaded (and
//    flagged: the game cannot afford that) instead of silently showing its first frame forever.
import { Graphics, Sprite, Texture, CanvasSource, Matrix, FillGradient, Container, Color, Rectangle } from 'pixi.js'
const F = { n: 0 }   // frames begun by any px2d: a canvas remembers the last one it was drawn in (__f)
let orig = null   // what installPatches replaced, for uninstallPatches
export function installPatches() {
  if (orig) return
  const N = window.Path2D
  class P extends N {
    constructor(a) { super(a); this.cmd = []; if (a instanceof P) this.cmd.push(['add', a, null]); else if (a) this.svg = true }
    addPath(p, m) { super.addPath(p, m); this.cmd.push(['add', p, m || null]) }
  }
  for (const k of ['moveTo', 'lineTo', 'closePath', 'rect', 'arc', 'ellipse', 'quadraticCurveTo', 'bezierCurveTo'])
    P.prototype[k] = function (...a) { N.prototype[k].apply(this, a); this.cmd.push([k, a]) }
  window.Path2D = P
  const C = CanvasRenderingContext2D.prototype
  orig = { Path2D: N, ctx: {} }
  for (const k of ['fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'drawImage', 'putImageData', 'fillText', 'strokeText']) {
    const f = (orig.ctx[k] = C[k]); C[k] = function (...a) { this.canvas.__v = (this.canvas.__v || 0) + 1; this.canvas.__f = F.n; return f.apply(this, a) }
  }
}
// The page as it was, for every other chapter's bakes. A Path2D recorded while patched keeps working after: it is a
// real Path2D subclass whose methods call the native ones, and it keeps its recorded commands for the next install.
export function uninstallPatches() {
  if (!orig) return
  window.Path2D = orig.Path2D
  Object.assign(CanvasRenderingContext2D.prototype, orig.ctx)
  orig = null
}
function makePx2D() {
  const TAU = Math.PI * 2
  const texOf = new WeakMap()
  const tex = (px, cv) => {
    let t = texOf.get(cv)
    if (!t) { t = new Texture({ source: new CanvasSource({ resource: cv }) }); t.__v = cv.__v; texOf.set(cv, t); if (px.grace <= 0 && cv.__f >= F.n - 1) px.flag('canvas created per frame') }   // an older bake's first upload is not
    else if (t.__v !== cv.__v) { t.__v = cv.__v; t.source.update(); if (px.grace <= 0) px.flag('canvas redrawn per frame') }
    return t
  }
  const colOf = new Map()
  const col = (s) => {
    let c = colOf.get(s)
    // Canvas2D reads 'rgba(11,7,20,1.1e-15)' (a fade's last frame); Pixi's Color throws on the exponent, which dropped the rest of the frame
    if (!c) {
      const k = new Color(s.replace(/(?<=[(,\s])-?[\d.]+e[-+]?\d+/gi, (n) => (+n).toFixed(6))); c = { color: k.toNumber(), alpha: k.alpha }
      if (colOf.size >= 4096) colOf.clear()   // a fade written as a raw float is a new string every frame
      colOf.set(s, c)
    }
    return c
  }
  // gradients: one texture per distinct stop list (and radial shape), placed per fill by a matrix. A glow that pulses fades
  // all its stops together: the texture is baked at full strength (each stop's alpha over the strongest, in hundredths) and
  // the fill carries the fade (this.k), so a pulse reuses one texture instead of baking one a frame. The least recently
  // used are destroyed past GRAD_MAX
  const gradTex = new Map(), GRAD_MAX = 256
  const mkTex = (cv) => new Texture({ source: new CanvasSource({ resource: cv, addressMode: 'clamp-to-edge' }) })
  class Grad {
    constructor(type, a) { this.type = type; this.a = a; this.stops = [] }
    addColorStop(o, c) { this.stops.push([o, c]) }
    key() {
      const [x0, y0, r0, x1, y1, r1] = this.a, cs = this.stops.map(([o, s]) => [o, col(s)])
      this.k = Math.max(0, ...cs.map(([, c]) => c.alpha))
      this.st = cs.map(([o, c]) => [o, c.color, this.k ? Math.round(c.alpha / this.k * 100) / 100 : 0])
      const s = this.st.join('|')
      if (this.type === 'linear') return 'L' + s
      // the radial shape in 32nds of r1: a ring that grows every frame (a blast front) reuses a texture instead of baking one
      const q = (v) => Math.round(v / r1 * 32) / 32
      this.q = [q(x0 - x1), q(y0 - y1), q(r0)]
      return 'R' + this.q + '|' + s
    }
    texture() {
      const k = this.key()
      let t = gradTex.get(k)
      if (t) { gradTex.delete(k); gradTex.set(k, t); return t }
      const cv = document.createElement('canvas'), lin = this.type === 'linear', N = lin ? 256 : 128
      cv.width = N; cv.height = lin ? 1 : N
      const g = cv.getContext('2d')
      let gr
      if (lin) gr = g.createLinearGradient(0, 0, N, 0)
      else { const [dx, dy, r0] = this.q, s = N / 2; gr = g.createRadialGradient(s + dx * s, s + dy * s, r0 * s, s, s, s) }
      const css = ([, n, a]) => 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'
      for (const s of this.st) gr.addColorStop(s[0], css(s))
      if (!lin && this.st.length) { g.fillStyle = css(this.st[this.st.length - 1]); g.fillRect(0, 0, N, N) }
      g.fillStyle = gr; g.fillRect(0, 0, N, cv.height)
      t = mkTex(cv); gradTex.set(k, t)
      if (gradTex.size > GRAD_MAX) { const [k0, t0] = gradTex.entries().next().value; gradTex.delete(k0); t0.destroy(true) }
      return t
    }
    // texture px -> user space
    local() {
      if (this.type === 'linear') {
        const [x0, y0, x1, y1] = this.a, dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1e-6, s = L / 256, cs = dx / L, sn = dy / L
        return [cs * s, sn * s, -sn, cs, x0, y0]
      }
      const [, , , x1, y1, r1] = this.a, s = 2 * r1 / 128
      return [s, 0, 0, s, x1 - r1, y1 - r1]
    }
  }
  const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]]
  const BLEND = { 'source-over': 'normal', lighter: 'add', multiply: 'multiply', screen: 'screen' }
  // evenodd as one filled contour minus every other: Canvas does not care which subpath comes first, so the outer one is
  // the widest (a rect drawn after the ellipse it frames is still the outside). The holes go in as ONE cut: Pixi's cut()
  // on a fill that already has a hole walks back and punches the instruction before it, an unrelated shape.
  // ponytail: an island inside a hole (three nested rings) fills as a hole; no painter draws one
  const area = (p) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of p) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y } return (x1 - x0) * (y1 - y0) }
  const evenodd = (g, S, st) => {
    let o = 0; for (let i = 1, a = area(S[0].p); i < S.length; i++) { const b = area(S[i].p); if (b > a) { a = b; o = i } }
    g.poly(S[o].p.flat(), true).fill(st)
    if (S.length < 2) return
    for (let i = 0; i < S.length; i++) if (i !== o) g.poly(S[i].p.flat(), true)
    g.cut()
  }

  class Px {
    // res: device px per stage px. The painter works in device px (so bakes are sized for the screen they land on);
    // the root is scaled back down, so the scene graph stays in stage px like the game's.
    constructor(root, res = 1) {
      this.root = root; this.res = res; root.scale.set(1 / res)
      this.gPool = []; this.sPool = []; this.cPool = []; this.mPool = []; this.rPool = []
      this.bad = {}
      this.grace = 4   // frames whose bakes are warm-up, not per-frame work: an owner (a look switch) may set it again
      this.begin()
    }
    begin() {
      for (const c of this.cPool) { c.mask = null; c.removeChildren() }
      this.root.removeChildren()
      this.gi = this.si = this.ci = this.mi = this.ri = 0; this.grace--; F.n++; this.imageSmoothingEnabled = true
      this.out = this.root; this.g = null
      this.m = [this.res, 0, 0, this.res, 0, 0]; this.stack = []
      this.globalAlpha = 1; this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1; this.lineCap = 'butt'; this.lineJoin = 'miter'
      this._op = 'source-over'
      this.path = []; this.sub = null
    }
    flag(k) { this.bad[k] = (this.bad[k] || 0) + 1 }
    // a bake its painter dropped: its texture (and atlas crops) leave the GPU now, not whenever Pixi's GC gets to them
    forget(cv) {
      const t = texOf.get(cv); if (!t) return
      texOf.delete(cv)
      if (t.__crops) for (const x of t.__crops.values()) x.destroy()
      t.destroy(true)
    }
    set shadowBlur(v) { if (v > 0.02) this.flag('shadowBlur') }
    get shadowBlur() { return 0 }
    set filter(v) { if (v && v !== 'none') this.flag('filter') }
    get filter() { return 'none' }
    set globalCompositeOperation(v) { if (!BLEND[v]) this.flag('composite:' + v); if (v !== this._op) this.g = null; this._op = v }
    get globalCompositeOperation() { return this._op }
    getImageData() { this.flag('getImageData'); return { data: new Uint8ClampedArray(4), width: 1, height: 1 } }
    putImageData() { this.flag('putImageData') }
    createPattern() { this.flag('createPattern'); return '#000' }
    createLinearGradient(x0, y0, x1, y1) { return new Grad('linear', [x0, y0, x1, y1]) }
    createRadialGradient(x0, y0, r0, x1, y1, r1) { return new Grad('radial', [x0, y0, r0, x1, y1, r1]) }
    // ---- state ----
    save() { this.stack.push({ m: this.m.slice(), a: this.globalAlpha, f: this.fillStyle, s: this.strokeStyle, w: this.lineWidth, c: this.lineCap, j: this.lineJoin, o: this._op, out: this.out, sm: this.imageSmoothingEnabled }) }
    restore() {
      const s = this.stack.pop(); if (!s) return
      this.m = s.m; this.globalAlpha = s.a; this.fillStyle = s.f; this.strokeStyle = s.s; this.lineWidth = s.w; this.lineCap = s.c; this.lineJoin = s.j; this.imageSmoothingEnabled = s.sm
      if (s.o !== this._op) this.g = null
      this._op = s.o
      if (s.out !== this.out) { this.out = s.out; this.g = null }
    }
    setTransform(a, b, c, d, e, f) { this.m = typeof a === 'object' ? [a.a, a.b, a.c, a.d, a.e, a.f] : [a, b, c, d, e, f] }
    resetTransform() { this.m = [1, 0, 0, 1, 0, 0] }
    getTransform() { return new DOMMatrix(this.m) }
    transform(a, b, c, d, e, f) { this.m = mul(this.m, [a, b, c, d, e, f]) }
    translate(x, y) { const m = this.m; m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y }
    scale(x, y) { const m = this.m; m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y }
    rotate(r) { this.m = mul(this.m, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]) }
    // ---- path, flattened to device px at the transform current when each point is added (Canvas2D semantics) ----
    T(x, y) { const m = this.m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] }
    ks() { const m = this.m; return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1e-6 }
    beginPath() { this.path = []; this.sub = null }
    moveTo(x, y) { this.sub = { p: [this.T(x, y)], closed: false }; this.path.push(this.sub) }
    lineTo(x, y) { if (!this.sub) this.moveTo(x, y); else this.sub.p.push(this.T(x, y)) }
    closePath() { if (this.sub) { this.sub.closed = true; const p0 = this.sub.p[0]; this.sub = { p: [p0], closed: false }; this.path.push(this.sub) } }
    rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath() }
    ellipse(cx, cy, rx, ry, rot, a0, a1, ccw) {
      let d = a1 - a0
      if (!ccw) { d = d >= TAU ? TAU : ((d % TAU) + TAU) % TAU; if (d === 0 && a1 !== a0) d = TAU }
      else { d = -d >= TAU ? -TAU : -((((-d) % TAU) + TAU) % TAU); if (d === 0 && a1 !== a0) d = -TAU }
      const n = Math.max(4, Math.min(160, Math.ceil(Math.abs(d) * Math.max(rx, ry) * this.ks() / 2.5)))
      const cr = Math.cos(rot), sr = Math.sin(rot)
      for (let i = 0; i <= n; i++) {
        const a = a0 + d * i / n, x = Math.cos(a) * rx, y = Math.sin(a) * ry, px = cx + x * cr - y * sr, py = cy + x * sr + y * cr
        if (i === 0 && !this.sub) this.moveTo(px, py); else this.lineTo(px, py)
      }
    }
    arc(cx, cy, r, a0, a1, ccw) { this.ellipse(cx, cy, r, r, 0, a0, a1, ccw) }
    last() { const m = this.m, p = this.sub.p[this.sub.p.length - 1], det = m[0] * m[3] - m[1] * m[2], x = p[0] - m[4], y = p[1] - m[5]
      return [(m[3] * x - m[2] * y) / det, (-m[1] * x + m[0] * y) / det] }
    quadraticCurveTo(qx, qy, x, y) {
      if (!this.sub) this.moveTo(qx, qy)
      const [x0, y0] = this.last(), n = Math.max(4, Math.min(48, Math.ceil((Math.hypot(qx - x0, qy - y0) + Math.hypot(x - qx, y - qy)) * this.ks() / 4)))
      for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; this.lineTo(u * u * x0 + 2 * u * t * qx + t * t * x, u * u * y0 + 2 * u * t * qy + t * t * y) }
    }
    bezierCurveTo(ax, ay, bx, by, x, y) {
      if (!this.sub) this.moveTo(ax, ay)
      const [x0, y0] = this.last(), n = Math.max(4, Math.min(64, Math.ceil((Math.hypot(ax - x0, ay - y0) + Math.hypot(bx - ax, by - ay) + Math.hypot(x - bx, y - by)) * this.ks() / 4)))
      for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t
        this.lineTo(u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x, u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y) }
    }
    // a recorded Path2D, replayed into the current path at the current transform (Canvas2D semantics)
    replay(p) {
      if (p.svg) this.flag('Path2D(svg)')
      for (const [k, a, m] of p.cmd) {
        if (k !== 'add') { this[k](...a); continue }
        if (!m) { this.replay(a); continue }
        const keep = this.m; this.m = mul(this.m, [m.a ?? 1, m.b ?? 0, m.c ?? 0, m.d ?? 1, m.e ?? 0, m.f ?? 0]); this.replay(a); this.m = keep
      }
    }
    withPath(p, f) { const P = this.path, s = this.sub; this.beginPath(); this.replay(p); f(); this.path = P; this.sub = s }
    // ---- output ----
    gfx() {
      if (this.g) return this.g
      let g = this.gPool[this.gi]
      if (!g) { g = new Graphics(); this.gPool.push(g) }
      this.gi++; g.clear(); g.blendMode = BLEND[this._op] || 'normal'
      this.out.addChild(g)
      return (this.g = g)
    }
    style(s, alpha) {
      if (typeof s === 'string') { const c = col(s); return { color: c.color, alpha: c.alpha * alpha } }
      if (s instanceof Grad) {   // a FillGradient carrying the cached texture: Pixi keeps a gradient's texture clamped
        const L = mul(this.m, s.local()), fg = new FillGradient({ type: 'linear', textureSpace: 'global' })
        fg.texture = s.texture(); fg.transform = new Matrix(L[0], L[1], L[2], L[3], L[4], L[5])
        return { fill: fg, alpha: alpha * s.k }
      }
      return { color: 0, alpha }
    }
    subs() { return this.path.filter((s) => s.p.length > 1) }
    fill(rule) {
      if (rule && typeof rule === 'object') { const r = arguments[1]; this.withPath(rule, () => this.fill(r)); return }
      const S = this.subs(); if (!S.length || this.globalAlpha <= 0) return
      const g = this.gfx(), st = this.style(this.fillStyle, this.globalAlpha)
      if (rule === 'evenodd') { evenodd(g, S, st); return }
      for (const s of S) g.poly(s.p.flat(), true)
      g.fill(st)
    }
    stroke(p) {
      if (p) { this.withPath(p, () => this.stroke()); return }
      const S = this.subs(); if (!S.length || this.globalAlpha <= 0) return
      const g = this.gfx(), st = this.style(this.strokeStyle, this.globalAlpha)
      st.width = this.lineWidth * this.ks(); st.cap = this.lineCap; st.join = this.lineJoin
      for (const s of S) g.poly(s.p.flat(), s.closed)
      g.stroke(st)
    }
    // a solid fillRect is a pooled white Sprite, tinted, at the full transform, in draw order like drawImage (its own pool:
    // drawImage's sprites would keep a rect's tint). The Magma painter stamps its effects as hundreds of 1-art-pixel rects a
    // frame, and as Graphics each was tessellated every frame (12-34 ms of a phone frame in a blast). A gradient keeps the path.
    fillRect(x, y, w, h) {
      if (typeof this.fillStyle !== 'string') { const P = this.path, s = this.sub; this.beginPath(); this.rect(x, y, w, h); this.fill(); this.path = P; this.sub = s; return }
      const c = col(this.fillStyle), al = c.alpha * this.globalAlpha
      if (al <= 0 || !w || !h) return
      let s = this.rPool[this.ri]; if (!s) { s = new Sprite(Texture.WHITE); this.rPool.push(s) }
      this.ri++; this.g = null
      s.tint = c.color; s.alpha = al; s.blendMode = BLEND[this._op] || 'normal'
      const m = this.m; s.setFromMatrix(new Matrix(m[0] * w, m[1] * w, m[2] * h, m[3] * h, m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]))
      this.out.addChild(s)
    }
    strokeRect(x, y, w, h) { const P = this.path, s = this.sub; this.beginPath(); this.rect(x, y, w, h); this.stroke(); this.path = P; this.sub = s }
    clearRect() { this.flag('clearRect') }
    clip(p, rule) {
      if (p && typeof p === 'object') { const P = this.path, s = this.sub; this.beginPath(); this.replay(p); this.clip(rule); this.path = P; this.sub = s; return }
      if (p === 'evenodd') rule = p
      const S = this.subs()
      let mk = this.mPool[this.mi]; if (!mk) { mk = new Graphics(); this.mPool.push(mk) }
      this.mi++; mk.clear()
      if (rule === 'evenodd' && S.length > 1) evenodd(mk, S, 0xffffff)
      else { for (const s of S) mk.poly(s.p.flat(), true); mk.fill(0xffffff) }
      let c = this.cPool[this.ci]; if (!c) { c = new Container(); this.cPool.push(c) }
      this.ci++
      this.out.addChild(c); c.addChild(mk); c.mask = mk
      this.out = c; this.g = null
    }
    // a real Pixi display object (a Mesh with the game's own shader, say), placed in draw order at the current transform.
    // The caller owns it and keeps it across frames; it is only re-parented here.
    place(obj) {
      const L = this.m; this.g = null
      obj.setFromMatrix(new Matrix(L[0], L[1], L[2], L[3], L[4], L[5]))
      obj.alpha = this.globalAlpha; obj.blendMode = BLEND[this._op] || 'normal'
      this.out.addChild(obj)
    }
    drawImage(cv, ...a) {
      if (this.globalAlpha <= 0) return
      let sx = 0, sy = 0, sw = cv.width, sh = cv.height, dx, dy, dw, dh
      if (a.length === 2) [dx, dy] = a, dw = sw, dh = sh
      else if (a.length === 4) [dx, dy, dw, dh] = a
      else [sx, sy, sw, sh, dx, dy, dw, dh] = a   // a crop: a sub-texture of the same source (an atlas cell), cached per rect
      if (!cv.width || !cv.height) return
      let s = this.sPool[this.si]; if (!s) { s = new Sprite(); this.sPool.push(s) }
      this.si++; this.g = null
      const base = tex(this, cv)
      if (a.length === 8) { const k = sx + ',' + sy + ',' + sw + ',' + sh, C = base.__crops || (base.__crops = new Map()); let t = C.get(k)
        if (!t) C.set(k, t = new Texture({ source: base.source, frame: new Rectangle(sx, sy, sw, sh) })); s.texture = t } else s.texture = base
      // the mode lives on the shared source, so set it both ways: a canvas drawn nearest once must not stay nearest
      const sm = this.imageSmoothingEnabled ? 'linear' : 'nearest'; if (s.texture.source.scaleMode !== sm) s.texture.source.scaleMode = sm
      const L = mul(this.m, [dw / sw, 0, 0, dh / sh, dx, dy])
      s.setFromMatrix(new Matrix(L[0], L[1], L[2], L[3], L[4], L[5]))
      s.alpha = this.globalAlpha; s.blendMode = BLEND[this._op] || 'normal'
      this.out.addChild(s)
    }
  }
  return (root, res) => new Px(root, res)
}
export const PX2D = makePx2D()
