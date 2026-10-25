// Scene: THE HAND — the skin swap told by the next world's hand shadow over the tell, then that world's hand coming
// down on the tell's last stretch, landing as the skin swaps, painting the new skin on and lifting over the after-beat.
// STAGED: the hand's clock (oph.tell / next / after / skin) is set by hand per frame and rendered, never stepped, so a
// frame is exactly the u it is labelled; the attacks and the real swaps are held off.
//
//   node scripts/fx-probe.mjs --scene scripts/scenes/ophan-hand.js --out /tmp/oph-shadow --frames 5 --chapter ophan --url 'http://127.0.0.1:5173/?mode=shadow&next=3'
//   node scripts/fx-probe.mjs --scene scripts/scenes/ophan-hand.js --out /tmp/oph-shadow-mock --frames 5 --chapter ophan --url 'http://127.0.0.1:5173/?mode=shadow&next=3&mock=1'
//   node scripts/fx-probe.mjs --scene scripts/scenes/ophan-hand.js --out /tmp/oph-hand --frames 5 --chapter ophan --url 'http://127.0.0.1:5173/?mode=hand&look=4&world=4'
//
// mode=shadow: frame i is the tell at pr = i/(frames-1) (pr 1: its last instant); next=k the told world. mock=1 hides the
// game's shadow and draws the mock-up's own handShadow (src2.html, canvas2D, per-frame blur) at the same pr round the
// same boss, for the A/B. mode=hand: frame i is the hand at u = U[i]; look=k the hand's world, world=j the world the
// player stands in (j = k: its own world, the boss in its pass; else pasted over a foreign one), skin=s the skin the boss
// wears before the swap (default the world after k).
const q = new URLSearchParams(location.search), MODE = q.get('mode') ?? 'hand', MOCK = q.get('mock') === '1'
const K = +(q.get('look') ?? q.get('next') ?? 3), WJ = +(q.get('world') ?? K), PREV = +(q.get('skin') ?? (K + 1) % 6)
const U = [0.1, 0.28, 0.5, 0.8, 0.95]
const cfg = window.__cfg, HD = cfg.OPHAN_HAND, WIN = { in: [0.06, 0.28], paint: [0.28, 0.84], out: [0.84, 0.97] }
run.player.xpNext = 1e9   // no level-up modal in the middle of the shot
H.until(() => !!run.script?.oph, 50)
const o = run.script.oph
const hold = () => { o.atkCd = 99; o.swapIn = 99 }
H.until(() => { hold(); return o.t > 3 }, 1200)
if (WJ !== o.world) { run._worldPress = WJ; H.until(() => { hold(); return o.world === WJ && !o.wipe }, 600) }
// the fight opens on a 30 s wave with no boss: wait for its entry (its art may hold the entry longer), then its rise
H.until(() => { hold(); return o.t > 5 && o.bossId != null }, 6000); H.until(() => { hold(); return true }, 120)
const boss = () => run.enemies.find((e) => e.rosterId === 'ophan' && !e._dead)
const wear = (k) => { if (k !== o.skin) { o.hp[o.skin] = boss().hp; o.skin = k; boss().hp = o.hp[k] } }
H.note(JSON.stringify({ mode: MODE, look: K, world: o.world, prev: PREV, mock: MOCK, t: +o.t.toFixed(2), crowd: run.enemies.filter((e) => !e._dead && e.rosterId !== 'ophan').length }))
// the mock-up's handShadow verbatim (src2.html:744-751), round the boss's screen point, at the boss's screen scale
const cv = document.createElement('canvas'), dpr = devicePixelRatio || 1
Object.assign(cv.style, { position: 'fixed', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 })
cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; document.body.appendChild(cv)
const C = cv.getContext('2d'), TAU = Math.PI * 2
function handShadow(c, pr, col, BX, BY) {
  const e = pr*pr*(3 - 2*pr), x = BX + 130 - 85*e, y = BY - 210 + 165*e, s = 1.7 - .55*e, rot = Math.atan2(BY - y, BX - x) + Math.PI/2, a = .22 + .38*e
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s); c.shadowColor = col; c.shadowBlur = 8 + 12*e
  c.fillStyle = `rgba(0,0,0,${a})`; c.strokeStyle = `rgba(0,0,0,${a})`; c.lineCap = 'round'
  c.beginPath(); c.ellipse(0, 0, 25, 29, 0, 0, TAU); c.fill()
  for (const [x0,y0,x1,y1] of [[-17,-24,-21,-60],[-6,-28,-6,-70],[6,-28,8,-68],[17,-24,21,-56],[24,4,46,-14]]){ c.lineWidth = 13; c.beginPath(); c.moveTo(x0,y0); c.lineTo(x1,y1); c.stroke() }
  c.restore()
}
// ?by=y: the boss DRAWN at world y instead (config's OPHAN_BOSS, render-side only: the sim is never stepped again), so a
// hand that comes in over the top of the screen is whole in frame for a finger count. Labelled STAGED in the note.
if (q.has('by')) { cfg.OPHAN_BOSS.y = +q.get('by'); H.note('STAGED boss y=' + q.get('by')) }
const show = () => { document.getElementById('ui').style.display = ''; window.__hud(run) }
return (age) => {
  const i = Math.round(age * 4)
  hold(); C.setTransform(1, 0, 0, 1, 0, 0); C.clearRect(0, 0, cv.width, cv.height)
  if (MODE === 'shadow') {
    const pr = i / 4
    wear(PREV)
    o.after = -1
    if (MOCK) {
      o.tell = 0; o.next = -1
      const v = cfg.ophanView(innerWidth, innerHeight), bx = (cfg.OPHAN_BOSS.x - v.camX) * v.z + innerWidth / 2, by = (cfg.OPHAN_BOSS.y - v.camY) * v.z + innerHeight / 2
      const k = cfg.OPHAN_BOSS.R * v.z / (52 * 1.35)
      C.setTransform(dpr * k, 0, 0, dpr * k, dpr * bx, dpr * by)
      handShadow(C, pr, cfg.CHAPTERS.ophan.worlds[K].col, 0, 0)
    } else { o.next = K; o.tell = Math.max(1e-4, HD.tell * (1 - pr)) }
  } else {
    const u = U[i]
    if (u < WIN.paint[0]) { wear(PREV); o.next = K; o.after = -1; o.tell = HD.inT * (1 - (u - WIN.in[0]) / (WIN.paint[0] - WIN.in[0])) }
    else { wear(K); o.next = -1; o.tell = 0; o.after = (u - WIN.paint[0]) / (WIN.out[1] - WIN.paint[0]) * HD.after }
  }
  H.render()
  show()
}
