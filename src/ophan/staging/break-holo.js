// THE BREAK, Geode (holo): the broken skin comes apart in this world's own medium while the next skin shows under it.
// Owner ruling 2026-10-25: 0.12 s hit-stop (the sim's), then 0.8 s; the looks below are the playground's candidates.
// Drawn like the Geode's cast (src/ophan/painters/holo.js): crisp near-black ink, thin-film foil colour, white ridges.
import { Container, Graphics, Sprite } from 'pixi.js'
import { stage, ease, win, hash, clamp01 } from '../staging.js'
import { cutSkin, drawPiece, piecePath } from './break-macro.js'

const TAU = Math.PI * 2
const INK = '#0b0714'
// the game's cosine thin-film palette (painters/holo.js film())
const cl = (v) => Math.max(0, Math.min(255, Math.round(v)))
const filmA = (t, k = 0.45, b = 0.55) => [0, 0.33, 0.67].map((o) => cl(255 * (b + k * Math.cos(TAU * (t + o)))))
const film = (t, k, b, a = 1) => { const [r, g, bl] = filmA(t, k, b); return `rgba(${r},${g},${bl},${a})` }
const filmHex = (t, k, b) => { const [r, g, bl] = filmA(t, k, b); return r << 16 | g << 8 | bl }
// a foil glint: bright only while the facet faces the light (its turn near one angle), the hue sliding with the turn
const glint = (rot, ph) => Math.pow(Math.max(0, Math.cos(rot * 1.5 + ph)), 8)

// a small cut crystal, the hands' foil shard (hands/holo.js shard()): a long rhomb in foil colour, inked, a white ridge
function crystal(c, x, y, r, sp, hue, al, lw) {
  if (al <= 0.01 || r < 0.5) return
  const cs = Math.cos(sp) * r, sn = Math.sin(sp) * r
  c.globalAlpha = al
  c.beginPath(); c.moveTo(x + cs, y + sn); c.lineTo(x - sn * 0.35, y + cs * 0.35); c.lineTo(x - cs * 0.8, y - sn * 0.8); c.lineTo(x + sn * 0.35, y - cs * 0.35); c.closePath()
  c.fillStyle = film(hue, 0.3, 0.78); c.fill(); c.strokeStyle = INK; c.lineWidth = lw; c.stroke()
  c.beginPath(); c.moveTo(x + cs, y + sn); c.lineTo(x - cs * 0.8, y - sn * 0.8); c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = lw * 0.6; c.stroke()
  c.globalAlpha = 1
}

// ---- A: prism shatter. The skin bursts into big crystal-cut shards of itself that fly out spinning, inked like the
// cast, each flashing a band of thin-film colour as its facet turns through the light, with small foil chips between them.
const PRISM = [{ r0: 0, r1: 0.3, n: 4 }, { r0: 0.3, r1: 0.65, n: 7 }, { r0: 0.65, r1: 1, n: 10 }]
stage('break', 'holo:A', { world: 'holo', label: 'A · prism shatter: spinning foil shards fly out', draw(k) {
  const tx = k.snap(k.from, k.ph0), P = cutSkin('prism', PRISM, 11), U = k.R * 1.5, c = k.px(0), g = k.px(1), lw = 1.6 * k.z
  k.boss.alpha = ease(win(k.u, 0.05, 0.55)); k.boss.scale = 0.85 + 0.15 * ease(win(k.u, 0.05, 0.6))
  P.forEach((pc, i) => {
    const f = win(k.u, 0.03 * hash(i, 2), 0.9), fo = 1 - (1 - f) * (1 - f) * (1 - f)   // fast out, slowing
    const a = Math.atan2(pc.c[1], pc.c[0]) + 0.3 * (hash(i, 3) - 0.5), dist = U * (0.15 + 0.45 * pc.d + 0.2 * hash(i, 4)) * fo
    const dx = Math.cos(a) * dist, dy = Math.sin(a) * dist, rot = (hash(i, 5) - 0.5) * 2.6 * fo + (hash(i, 5) > 0.5 ? 0.3 : -0.3) * fo
    const sc = 1 - 0.3 * fo, al = 1 - ease(win(f, 0.55, 1))
    if (al <= 0.01) return
    drawPiece(c, k, tx, pc, i, dx, dy, rot, sc, al)
    // the facet's flash: the shard again, added in a band of thin-film colour while it turns through the light (added, so
    // it lights the skin's own paint and never the air round it)
    const gl = glint(rot, hash(i, 6) * TAU) * al * Math.min(1, f * 6)
    if (gl > 0.02) { g.globalCompositeOperation = 'lighter'; drawPiece(g, k, tx, pc, i, dx, dy, rot, sc, 0.85 * gl, filmHex(hash(i, 7) + rot * 0.15, 0.4, 0.6)); g.globalCompositeOperation = 'source-over' }
    c.globalAlpha = 1; g.globalAlpha = 1
  })
  // the chips: small foil crystals thrown farther than the shards, gone by the end
  for (let i = 0; i < 16; i++) {
    const f = win(k.u, 0.02 + 0.05 * hash(i, 21), 0.8)
    if (f <= 0 || f >= 1) continue
    const fo = 1 - (1 - f) * (1 - f), a = hash(i, 22) * TAU, d = U * (0.3 + (1 + 0.5 * hash(i, 23)) * fo)
    crystal(g, k.x + Math.cos(a) * d, k.y + Math.sin(a) * d, k.R * (0.1 + 0.06 * hash(i, 24)) * (1 - 0.4 * f), a + 6 * f * (hash(i, 25) - 0.5), hash(i, 26), 1 - ease(win(f, 0.5, 1)), lw)
  }
} })

// ---- B: crack, then it falls apart. Bright foil cracks race out from the middle across the still skin, a web of spokes
// and rings drawn only on the skin's own paint (masked by it); then the pieces drop away from the lens one by one from
// the middle out, flashing film colour as they come loose and darkening as they fall, and the new skin is clean under them.
const WEB = [{ r0: 0, r1: 0.26, n: 5 }, { r0: 0.26, r1: 0.55, n: 8 }, { r0: 0.55, r1: 1, n: 11 }]
// the cracks: one Graphics masked by the broken skin's own snap, so a crack never runs through the air between wings
const web = new Container(), webG = web.addChild(new Graphics()), webM = web.addChild(new Sprite())
webG.mask = webM
stage('break', 'holo:B', { world: 'holo', label: 'B · cracks spread across it, then it falls apart', draw(k) {
  const tx = k.snap(k.from, k.ph0), P = cutSkin('web', WEB, 5), U = k.R * 1.5, W = Math.ceil(k.R * 3), c = k.px(0), g = k.px(1), lw = 1.6 * k.z
  k.boss.alpha = ease(win(k.u, 0.35, 0.85)); k.boss.scale = 0.88 + 0.12 * ease(win(k.u, 0.35, 0.9))
  const front = 1.05 * ease(win(k.u, 0, 0.36)), fall = (pc, i) => 0.34 + 0.3 * pc.d + 0.05 * hash(i, 2)
  P.forEach((pc, i) => {
    const t0 = fall(pc, i), f = win(k.u, t0, Math.min(1, t0 + 0.3)), fe = 0.5 * (f + f * f)
    const a = Math.atan2(pc.c[1], pc.c[0]), dx = Math.cos(a) * U * 0.22 * fe, dy = Math.sin(a) * U * 0.22 * fe + U * 0.06 * fe
    const rot = (hash(i, 3) - 0.5) * 0.9 * fe, sc = 1 - 0.45 * fe, al = 1 - ease(win(f, 0.4, 1))
    if (al <= 0.01) return
    drawPiece(c, k, tx, pc, i, dx, dy, rot, sc, al, f > 0 ? filmHex(0.62, 0.25, 0.75 - 0.4 * f) : 0xffffff)
    // it comes loose with a flash of film colour on its paint
    const fl = f > 0 ? Math.sin(Math.PI * Math.min(1, f * 2.5)) : 0
    if (fl > 0.02) { g.globalCompositeOperation = 'lighter'; drawPiece(g, k, tx, pc, i, dx, dy, rot, sc, 0.7 * fl * al, filmHex(hash(i, 7), 0.4, 0.6)); g.globalCompositeOperation = 'source-over' }
  })
  // the web: every edge of a piece still in place whose ends the front has passed, inked and lit along its middle
  const lit = 1 - ease(win(k.u, 0.45, 0.75))
  if (lit <= 0) return
  webG.clear()
  for (const pass of [0, 1]) {
    P.forEach((pc, i) => {
      if (k.u >= fall(pc, i)) return
      const p = pc.p
      for (let n = 0; n < p.length; n++) {
        const A = p[n], B = p[(n + 1) % p.length]
        if (Math.max(Math.hypot(A[0], A[1]), Math.hypot(B[0], B[1])) > front) continue
        webG.moveTo(k.x + A[0] * U, k.y + A[1] * U).lineTo(k.x + B[0] * U, k.y + B[1] * U)
      }
    })
    if (pass === 0) webG.stroke({ width: lw * 3.4, color: 0x0b0714, alpha: lit, cap: 'round', join: 'round' })
    else webG.stroke({ width: lw * 1.5, color: filmHex(0.5 + 0.4 * k.u, 0.12, 0.93), alpha: lit, cap: 'round', join: 'round' })
  }
  webM.texture = tx; webM.position.set(k.x - W / 2, k.y - W / 2); webM.scale.set(W / tx.width)
  c.save(); c.globalAlpha = 1; c.place(web); c.restore()
} })
export { win, hash, clamp01 }
