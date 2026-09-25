// Scene: CAN A PLAYER ANSWER THE KRAKEN'S ARMS OFF THE SCREEN ALONE? A cue-only bot plays the
// arms phase deciding ONLY from what render.js says it drew this frame (window.__tells, published
// under ?debug at the exact site each tell is drawn) plus positions. It never reads a.tele, a.role,
// gripT, the rung or any forecast field. Then every attack is GRADED against the sim's truth.
//
// Run it through scripts/kraken-cues.mjs, not by hand — that file documents usage, runs it headless
// (oracle tells built from sim truth) and in the browser (the tells render.js really drew), and
// prints the tables. Params arrive as window.__kcParams (headless) or the page URL (?secs=&seed=).
//
// THE BOT, in priority order (one answer per kind of attack):
//   hold tell                        -> WIGGLE the stick (one turn a second, ~4 flicks/s)
//   slamFlash within reach of me     -> PRESS (reach = distance to the DRAWN limb polyline)
//   lungeFlash                       -> PRESS
//   grabCharge                       -> step PERPENDICULAR off its line (tip -> aim point)
//   coil lanes                       -> walk to the widest dark gap between the lit lanes
//   limp tell                        -> go and stand on it (that is where the build does damage)
//   otherwise                        -> orbit the head at 0.9 x KRAKEN_ARM_REACH
// It is IMMORTAL (hp topped up every step) and takes no cards: this is a readability instrument,
// not a difficulty statement.
const q = (() => { try { return new URLSearchParams(location.search) } catch { return new URLSearchParams('') } })()
const P = window.__kcParams || { secs: +(q.get('secs') || 120), seed: +(q.get('seed') || 1), conflictT: +(q.get('conflictT') || 0.4) }
const C = window.__cfg
const DT = 1 / 60
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
Math.random = mulberry32(P.seed)
run.player.maxHP = run.player.hp = 1e9
run.weapons = [{ id: 'skippingShell', level: 3 }]
if (!H.until(() => run.script && run.script.phase === 'boss' && run.krakenArms.length > 0, 8000)) throw new Error('kraken-cues: the arms phase never started')

const rung = C.krakenRung(run.difficulty)
const parryW = C.KRAKEN_LASH_W * C.KRAKEN_PARRY_MARGIN
const head = () => run.enemies.find((e) => e.rosterId === 'krakenHead' && !e._dead) || null
const seg2 = (px, py, x0, y0, x1, y1) => {
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L2)) : 0
  return (px - x0 - dx * t) ** 2 + (py - y0 - dy * t) ** 2
}
const polyD = (px, py, tl) => {
  const pts = tl.poly || [[tl.x0, tl.y0], [tl.x1, tl.y1]]
  let b = Infinity
  for (let k = 1; k < pts.length; k++) b = Math.min(b, seg2(px, py, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]))
  return Math.sqrt(b)
}
const btnEl = typeof document !== 'undefined' ? document.querySelector('.skill-btn') : null

// ---------------------------------------------------------------- the cue-only bot
let wig = 0
function decide(tells) {
  const p = run.player
  const h = head()
  const has = (k) => tells.filter((t) => t.kind === k)
  let press = false, act = 'kite', ix = 0, iy = 0
  const cd = run.repulseCd ?? 0            // the button's own drawn state (its cooldown border)
  if (cd <= 0) {
    if (has('slamFlash').some((t) => polyD(p.x, p.y, t) <= parryW)) press = true
    if (has('lungeFlash').length) press = true
  }
  const toward = (x, y, k = 1) => { const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy); if (d > 6) { ix = dx / d * k; iy = dy / d * k } }
  if (has('hold').length) {
    act = 'wiggle'; wig += Math.PI * 2 * DT; ix = Math.cos(wig); iy = Math.sin(wig)
  } else if (has('grabCharge').length) {
    act = 'dodgeGrab'
    let g = null, gd = Infinity
    for (const t of has('grabCharge')) { const d = Math.sqrt(seg2(p.x, p.y, t.x0, t.y0, t.x1, t.y1)); if (d < gd) { gd = d; g = t } }
    const L = Math.hypot(g.x1 - g.x0, g.y1 - g.y0) || 1
    const nx = -(g.y1 - g.y0) / L, ny = (g.x1 - g.x0) / L
    let side = (p.x - g.x0) * nx + (p.y - g.y0) * ny
    if (Math.abs(side) < 1 && h) side = (p.x - h.x) * nx + (p.y - h.y) * ny
    ix = nx * (side >= 0 ? 1 : -1); iy = ny * (side >= 0 ? 1 : -1)
  } else if (has('coil').length && h) {
    act = 'dodgeCoil'
    const angs = has('coil').map((t) => Math.atan2(t.y0 - h.y, t.x0 - h.x)).sort((a, b) => a - b)
    let best = 0, mid = 0
    for (let k = 0; k < angs.length; k++) {
      const a0 = angs[k], a1 = k + 1 < angs.length ? angs[k + 1] : angs[0] + Math.PI * 2
      if (a1 - a0 > best) { best = a1 - a0; mid = (a0 + a1) / 2 }
    }
    toward(h.x + Math.cos(mid) * C.KRAKEN_ARM_REACH, h.y + Math.sin(mid) * C.KRAKEN_ARM_REACH)
  } else if (has('limp').length) {
    act = 'limp'
    let b = null, bd = Infinity
    for (const t of has('limp')) { const d = Math.hypot(t.x - p.x, t.y - p.y); if (d < bd) { bd = d; b = t } }
    toward(b.x, b.y, 0.85)
  } else if (h) {
    const a = Math.atan2(p.y - h.y, p.x - h.x) + 0.35
    toward(h.x + Math.cos(a) * C.KRAKEN_ARM_REACH * 0.9, h.y + Math.sin(a) * C.KRAKEN_ARM_REACH * 0.9, 0.7)
  }
  if (press && act === 'kite') act = 'parry'
  return { press, act, ix, iy }
}

// ---------------------------------------------------------------- sim truth, graded after the fact
const attacks = []
const openSlam = {}, openHold = {}
let coilRec = null, lungeRec = null
const grabTellSince = {}          // arm -> time its grabCharge tell has been continuously drawn since
let lastDodgeGrabT = -1
const conf = { frames: 0, moments: 0, pairs: {}, on: false }
let armsT = 0
const press = { n: 0, land: 0, whiff: 0 }
const glow = { frames: 0, ringNoParry: 0, parryNoRing: 0, both: 0, btnClasses: {} }
const tellCounts = {}

function parryWouldLand(p) {
  // krakenParry's own candidacy (sim.js): arm in window, on its struck line widened by the margin
  for (const a of run.krakenArms) {
    if (a.dead || a.limpT > 0 || a.gripT > 0 || a.coilArm) continue
    if (!(a.tele > 0 && a.tele <= rung.window)) continue
    if (seg2(p.x, p.y, a.lx0, a.ly0, a.lx1, a.ly1) <= parryW * parryW) return true
  }
  const h = head(), s = run.script
  const cageR = s.cageR > 0 ? s.cageR : C.KRAKEN_CAGE_R
  return !!h && s.phase === 'chase' && !(s.staggerT > 0) && h.lungeT > 0 && h.lungeT <= rung.lungeWindow &&
    (h.x - p.x) ** 2 + (h.y - p.y) ** 2 <= cageR * cageR
}

function beat(tells) {
  const s = run.script
  const p = run.player
  const t = run.time
  const d = decide(tells)
  for (const tl of tells) tellCounts[tl.kind] = (tellCounts[tl.kind] || 0) + 1
  const drawn = (i, k) => tells.some((tl) => tl.i === i && tl.kind === k)
  const inArms = s.phase === 'boss' || s.phase === 'chase'
  if (inArms) armsT += DT

  // --- what the moment REQUIRES, from truth (pre-step: the state the player is looking at)
  const needP = parryWouldLand(p)
  const needW = run.krakenArms.some((a) => !a.dead && a.gripT > 0)
  // a grab about to land: today the forecast's NEXT stage (gripSoonT = seconds to the latching turn).
  // ⚠ THE GRAB REDESIGN ADDS ITS OWN WIND-UP CLOCK: OR it in here, one line, or a dodgeable grab
  // will read as "no grab coming" and the conflict count will be low for the wrong reason.
  const grabSoon = (s.gripSoonT ?? -1) >= 0 && s.gripSoonT <= P.conflictT
  const onCoilLane = s.coilT > 0 && run.krakenArms.some((a) => !a.dead && a.coilArm && a.tele > 0 && seg2(p.x, p.y, a.lx0, a.ly0, a.lx1, a.ly1) <= C.KRAKEN_LASH_W ** 2)
  const needD = grabSoon || onCoilLane
  const need = [needP && 'P', needW && 'W', needD && 'D'].filter(Boolean)
  if (inArms && need.length >= 2) {
    conf.frames++
    const k = need.join('+')
    conf.pairs[k] = (conf.pairs[k] || 0) + DT
    if (!conf.on) conf.moments++
    conf.on = true
  } else conf.on = false

  // --- the glow: the in-world press ring drawn vs whether a press would land
  const cd = run.repulseCd ?? 0
  if (inArms) {
    const ring = tells.some((tl) => tl.kind === 'pressRing')
    const would = needP && cd <= 0
    glow.frames++
    if (ring && !would) glow.ringNoParry++
    else if (would && !ring) glow.parryNoRing++
    else if (ring && would) glow.both++
    if (btnEl) { const c = btnEl.className; glow.btnClasses[c] = (glow.btnClasses[c] || 0) + 1 }
  }

  // --- open/advance attack records off the pre-step state
  for (const a of run.krakenArms) {
    if (a.dead) continue
    if (a.tele > 0 && !a.coilArm && !openSlam[a.i]) openSlam[a.i] = { kind: 'slam', i: a.i, t0: t, band: false, flash: false, pressed: false, cdBlocked: false }
    const r = openSlam[a.i]
    if (r && a.tele > 0 && a.tele <= rung.window) {
      const band = seg2(p.x, p.y, a.lx0, a.ly0, a.lx1, a.ly1) <= parryW * parryW
      if (band && !r.band) { r.ia = t; r.ib = t + a.tele }   // the answer is DUE from now until it would land
      if (band) r.band = true
      if (band && drawn(a.i, 'slamFlash')) r.flash = true
      if (band && d.press) r.pressed = true
      if (band && cd > 0) r.cdBlocked = true
    }
    if (a.gripT > 0 && !openHold[a.i]) openHold[a.i] = { kind: 'hold', i: a.i, t0: t, frames: 0, wiggled: 0, drawn: 0 }
    const hr = openHold[a.i]
    if (hr && a.gripT > 0) { hr.frames++; if (d.act === 'wiggle') hr.wiggled++; if (drawn(a.i, 'hold')) { hr.drawn++; if (hr.firstDrawnS == null) hr.firstDrawnS = +(t - hr.t0).toFixed(2) } }
    if (drawn(a.i, 'grabCharge')) { if (grabTellSince[a.i] == null) grabTellSince[a.i] = t } else grabTellSince[a.i] = null
  }
  if (d.act === 'dodgeGrab') lastDodgeGrabT = t
  if (s.coilT > 0 && !coilRec) coilRec = { kind: 'coil', t0: t, frames: 0, dodging: 0, lanesDrawn: 0, lanes: 0, onLane: 0, hit: false }
  if (coilRec && s.coilT > 0) { coilRec.frames++; if (d.act === 'dodgeCoil') coilRec.dodging++; if (tells.some((tl) => tl.kind === 'coil')) coilRec.lanesDrawn++; if (onCoilLane) { coilRec.onLane++; if (coilRec.ia == null) coilRec.ia = t; coilRec.ib = t + DT }
    coilRec.lanes = Math.max(coilRec.lanes, run.krakenArms.filter((a) => !a.dead && a.coilArm && a.tele > 0).length) }
  const h = head()
  const lungeOpen = !!h && s.phase === 'chase' && !(s.staggerT > 0) && h.lungeT > 0 && h.lungeT <= rung.lungeWindow
  if (lungeOpen && !lungeRec) lungeRec = { kind: 'lunge', t0: t, ia: t, ib: t + h.lungeT, flash: false, pressed: false, cdBlocked: false }
  if (lungeRec && lungeOpen) { if (tells.some((tl) => tl.kind === 'lungeFlash')) lungeRec.flash = true; if (d.press) lungeRec.pressed = true; if (cd > 0) lungeRec.cdBlocked = true }
  if (d.press) press.n++

  // --- step
  const pre = run.krakenArms.map((a) => ({ tele: a.tele, gripT: a.gripT, slamT: a.slamT }))
  const preStagger = run.script.stagger ?? 0
  const preSoon = run.script.gripSoonI ?? -1   // the arm the grab forecast named (truth, for the grade only)
  step(run, { x: d.ix, y: d.iy, skill: d.press }, DT)
  const ev = run.events.splice(0)
  run.player.hp = run.player.maxHP
  if (run.phase === 'levelup') run.phase = 'playing'
  const hurtArm = ev.some((e) => e.type === 'hurt' && e.src === 'krakenArm')
  for (const e of ev) {
    if (e.type === 'parry' || e.type === 'parryPerfect') press.land++
    else if (e.type === 'parryWhiff') press.whiff++
  }

  // --- close records off the post-step state
  run.krakenArms.forEach((a, k) => {
    const r = openSlam[a.i]
    if (r && !(a.tele > 0)) {
      delete openSlam[a.i]
      const parried = a.limpT > 0 || (a.dead && !a.coilArm && pre[k].tele > 0 && a.slamT <= 0)
      const landed = !parried && a.slamT > 0
      const onMe = landed && (hurtArm || seg2(p.x, p.y, a.lx0, a.ly0, a.lx1, a.ly1) <= C.KRAKEN_LASH_W ** 2)
      if (a.coilArm || !(r.band || onMe)) return   // not a threat to this player: nothing to answer
      r.outcome = parried ? 'parried' : onMe ? 'hit' : 'missed me'
      r.correct = r.pressed
      r.ok = parried
      r.cause = r.ok ? null : !r.flash ? 'no slamFlash drawn while it was parryable here'
        : r.pressed ? 'pressed; the parry took another target or whiffed'
        : r.cdBlocked ? 'button on cooldown through the window'
        : 'flash drawn but the drawn limb did not look within reach'
      attacks.push(r)
    }
    const hr = openHold[a.i]
    if (hr && !(a.gripT > 0)) {
      delete openHold[a.i]
      hr.endEvents = [...new Set(ev.map((e) => e.type))]
      hr.outcome = ev.some((e) => e.type === 'gripBreak') ? 'escaped' : 'bitten'
      hr.correct = hr.frames > 0 && hr.wiggled / hr.frames >= 0.5
      hr.ok = hr.outcome === 'escaped'
      hr.dur = +(hr.frames * DT).toFixed(2)
      hr.ia = hr.t0; hr.ib = run.time
      hr.cause = hr.ok ? null : hr.drawn === 0 ? 'no hold drawn' : hr.firstDrawnS > 0.3 ? 'hold drawn late, the wiggle started late'
        // flicks subtract from the SAME gripT the clock ticks, so a struggle that leaves it a sliver
        // above zero is finished by the clock's branch, which bites instead of breaking
        : hr.dur < C.KRAKEN_GRIP_DUR - 0.1 ? 'BITTEN EARLY: the flicks + the clock ran gripT out on the clock side'
        : 'clock ran out while wiggling'
      attacks.push(hr)
    }
    if (a.gripT > 0 && !(pre[k].gripT > 0)) {
      // A GRAB LANDED. Its answer is a dodge; was one attempted, and could it have worked?
      const since = grabTellSince[a.i]
      const g = { kind: 'grab', i: a.i, t0: t, ia: t - P.conflictT, ib: t, tellS: since == null ? -1 : +(t - since).toFixed(2), dodging: lastDodgeGrabT >= t - 0.5, outcome: 'latched' }
      g.correct = g.dodging
      g.ok = false
      g.forecast = preSoon
      g.armWas = pre[k].slamT > 0 ? 'landing a slam' : 'idle'
      g.cause = g.tellS < 0 ? (preSoon !== a.i ? 'latched by an arm the forecast had not named (the nearest grabber changed as the player moved)' : pre[k].slamT > 0 ? 'no grabCharge drawn: the grabbing arm was still showing its landed slam' : 'no grabCharge drawn before the latch') : g.dodging ? 'dodged off the drawn line and it latched anyway' : 'tell drawn but the bot did not dodge'
      attacks.push(g)
    }
  })
  // a grab that MISSES — the redesign's event. Any of these names counts as a dodged grab.
  for (const e of ev) if (/^(grabMiss|gripMiss|grabWhiff)$/.test(e.type)) attacks.push({ kind: 'grab', i: e.i ?? -1, t0: t, ia: t - P.conflictT, ib: t, outcome: 'missed', correct: lastDodgeGrabT >= t - 0.5, ok: true, cause: null })
  if (coilRec) {
    if (s.coilHit) coilRec.hit = true
    if (!(s.coilT > 0)) {
      coilRec.outcome = coilRec.hit ? 'hit' : 'dodged'
      coilRec.correct = coilRec.dodging > 0 || coilRec.onLane === 0
      coilRec.ok = !coilRec.hit
      coilRec.cause = coilRec.ok ? null : coilRec.lanesDrawn === 0 ? 'no lanes drawn' : 'walked for the gap and was struck'
      if (coilRec.lanes > 0) attacks.push(coilRec)   // a coil with every arm limp or held has no lane to dodge
      coilRec = null
    }
  }
  if (lungeRec) {
    const hh = head()
    const still = !!hh && run.script.phase === 'chase' && !(run.script.staggerT > 0) && hh.lungeT > 0 && hh.lungeT <= rung.lungeWindow
    if (!still) {
      // a head parry is the posture filling (the event's x/y is the head BEFORE this step moved it)
      const parried = (run.script.stagger ?? 0) > preStagger || ev.some((e) => e.type === 'headStagger')
      lungeRec.outcome = parried ? 'parried' : 'landed'
      lungeRec.correct = lungeRec.pressed
      lungeRec.ok = parried
      lungeRec.cause = parried ? null : !lungeRec.flash ? 'no lungeFlash drawn' : lungeRec.pressed ? 'pressed; parry took an arm or whiffed' : lungeRec.cdBlocked ? 'button on cooldown' : 'not pressed'
      attacks.push(lungeRec)
      lungeRec = null
    }
  }
  window.__renderer.sync(run, DT, ev)
  if (window.__hud) window.__hud(run)
}

// P.secs is SECONDS OF ARMS PHASE (boss + chase), the denominator every rate is quoted against;
// the wave breaks between blocks are played through but not counted. Capped at 5x in total.
const cap = Math.round(P.secs * 5 / DT)
let played = 0
while (armsT < P.secs && played < cap && (run.phase === 'playing' || run.phase === 'levelup')) {
  beat((window.__tells || []).slice())
  played++
}
window.__fxResult = {
  seed: P.seed, difficulty: run.difficulty, chapter: run.chapter, secs: +(played * DT).toFixed(1), armsT: +armsT.toFixed(1),
  phase: run.script.phase, won: run.phase === 'victory',
  attacks: attacks.map((r) => ({ ...r, t0: +r.t0.toFixed(2) })),
  conflict: { seconds: +(conf.frames * DT).toFixed(2), moments: conf.moments, pairs: Object.fromEntries(Object.entries(conf.pairs).map(([k, v]) => [k, +v.toFixed(2)])) },
  press, glow, tellCounts, oracle: !!window.__kcOracle,
}
H.note('kraken-cues: ' + attacks.length + ' attacks graded over ' + armsT.toFixed(0) + 's of arms phase')
return () => { app && app.renderer.render(app.stage) }
