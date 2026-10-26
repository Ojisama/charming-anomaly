// THE BREAK, Geode (holo): the broken skin comes apart in this world's own medium while the next skin shows under it.
// Owner ruling 2026-10-25: 0.12 s hit-stop (the sim's), then 0.8 s; the look below is the one STAGE_PICK picked.
// Drawn like the Geode's cast (src/ophan/painters/holo.js): crisp near-black ink, thin-film foil colour, white ridges.
import { Container, Graphics, Sprite } from 'pixi.js'
import { stage, ease, win, hash, clamp01 } from '../staging.js'
import { cutSkin, drawPiece } from './break-macro.js'

const TAU = Math.PI * 2
// the game's cosine thin-film palette (painters/holo.js film())
const cl = (v) => Math.max(0, Math.min(255, Math.round(v)))
const filmA = (t, k = 0.45, b = 0.55) => [0, 0.33, 0.67].map((o) => cl(255 * (b + k * Math.cos(TAU * (t + o)))))
const filmHex = (t, k, b) => { const [r, g, bl] = filmA(t, k, b); return r << 16 | g << 8 | bl }
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
