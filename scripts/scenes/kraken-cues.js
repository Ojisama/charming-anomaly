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
//   wiggle prompt (drawKrakenCues)   -> WIGGLE the stick (one turn a second, ~4 flicks/s). NOT the
//                                       limb's own 'hold' tell: that says HELD, not what to do about it.
//                                       ?wiggleOn=hold restores the old key for comparison.
//   slamFlash within reach of me     -> PRESS (reach = distance to the DRAWN limb polyline)
//   slamNow (the glyph AT the fish)  -> PRESS (it is drawn only for a slam a press would reach)
//   lungeFlash                       -> PRESS
//   grabCharge                       -> step PERPENDICULAR off its line (tip -> aim point)
//   coil lanes                       -> walk to the widest dark gap between the lit lanes
//   headBite (the chase head's jaws) -> step straight out of the head's reach
//   limp tell                        -> go and stand on it (that is where the build does damage)
//   otherwise                        -> orbit the head at 0.9 x KRAKEN_ARM_REACH
// It is IMMORTAL (hp topped up every step) and takes no cards: this is a readability instrument,
// not a difficulty statement.
const q = (() => { try { return new URLSearchParams(location.search) } catch { return new URLSearchParams('') } })()
const P = window.__kcParams || { secs: +(q.get('secs') || 120), seed: +(q.get('seed') || 1), conflictT: +(q.get('conflictT') || 0.4), missGrab: +(q.get('missGrab') || 0), hug: +(q.get('hug') || 0), wiggleOn: q.get('wiggleOn') || 'wiggle', dodgeBite: q.get('dodgeBite') !== '0' }
// --missGrab F: the bot ignores that fraction of grab wind-ups (decided once per wind-up, off its OWN
// stream so the game's Math.random is not re-phased), so it gets HELD and the hold's wiggle is graded.
// --hug F: in the chase the bot orbits the head at F x KRAKEN_HEAD_R instead of 0.9 x reach — the
// real player's habit of staying in the head's face, where its contact tax lands.
const botRng = ((sd) => () => { sd |= 0; sd = (sd + 0x6d2b79f5) | 0; let t = Math.imul(sd ^ (sd >>> 15), 1 | sd); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 })((P.seed ^ 0x51ed) >>> 0)
const ignoreGrab = {}
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
let pinnedF = 0   // consecutive frames a full stick moved the fish under 1px (pinned on an obstacle)
function decide(tells) {
  const p = run.player
  const h = head()
  const has = (k) => tells.filter((t) => t.kind === k)
  let press = false, act = 'kite', ix = 0, iy = 0
  const cd = run.repulseCd ?? 0            // the button's own drawn state (its cooldown border)
  if (cd <= 0) {
    if (has('slamFlash').some((t) => polyD(p.x, p.y, t) <= parryW)) press = true
    if (has('slamNow').length) press = true
    if (has('lungeFlash').length) press = true
  }
  const toward = (x, y, k = 1) => { const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy); if (d > 6) { ix = dx / d * k; iy = dy / d * k } }
  if (has(P.wiggleOn || 'wiggle').length) {
    act = 'wiggle'; wig += Math.PI * 2 * DT; ix = Math.cos(wig); iy = Math.sin(wig)
  } else if (has('grabCharge').filter((t) => { if (!(t.i in ignoreGrab)) ignoreGrab[t.i] = botRng() < (P.missGrab || 0); return !ignoreGrab[t.i] }).length) {
    act = 'dodgeGrab'
    let g = null, gd = Infinity
    for (const t of has('grabCharge').filter((t) => !ignoreGrab[t.i])) { const d = Math.sqrt(seg2(p.x, p.y, t.x0, t.y0, t.x1, t.y1)); if (d < gd) { gd = d; g = t } }
    const L = Math.hypot(g.x1 - g.x0, g.y1 - g.y0) || 1
    const nx = -(g.y1 - g.y0) / L, ny = (g.x1 - g.x0) / L
    // THE DRAWN CHEVRON SAYS WHICH WAY (grabSafe: x0,y0 = the lock point, x1,y1 = the chevron's tip).
    // Without one, fall back to "the side I am already on".
    const safe = has('grabSafe').find((t) => t.i === g.i)
    if (safe) {
      const dx = safe.x1 - safe.x0, dy = safe.y1 - safe.y0, dl = Math.hypot(dx, dy) || 1
      ix = dx / dl; iy = dy / dl
    } else {
      let side = (p.x - g.x0) * nx + (p.y - g.y0) * ny
      if (Math.abs(side) < 1 && h) side = (p.x - h.x) * nx + (p.y - h.y) * ny
      ix = nx * (side >= 0 ? 1 : -1); iy = ny * (side >= 0 ? 1 : -1)
    }
  } else if (has('coil').length && h) {
    act = 'dodgeCoil'
    const angs = has('coil').map((t) => Math.atan2(t.y0 - h.y, t.x0 - h.x)).sort((a, b) => a - b)
    let best = 0, mid = 0
    for (let k = 0; k < angs.length; k++) {
      const a0 = angs[k], a1 = k + 1 < angs.length ? angs[k + 1] : angs[0] + Math.PI * 2
      if (a1 - a0 > best) { best = a1 - a0; mid = (a0 + a1) / 2 }
    }
    toward(h.x + Math.cos(mid) * C.KRAKEN_ARM_REACH, h.y + Math.sin(mid) * C.KRAKEN_ARM_REACH)
  } else if (P.dodgeBite !== false && has('headBite').length && h) {
    // the head's jaws are winding up on me: step straight out of its reach
    act = 'dodgeBite'
    // OUT ALONG THE HEAD->FISH RAY, BENT AWAY FROM THE NEAREST OBSTACLE. Straight out can be pinned
    // between the head and a seabed obstacle (a pier post, traced: 220px/s of stick, ~0.5px a frame
    // of travel) or slide along one at a crawl; a thumb steers off it, so the bot adds a push away
    // from the nearest collider within 90px of the fish's edge, weighted by how close it is.
    const dx = p.x - h.x, dy = p.y - h.y, dl = Math.hypot(dx, dy) || 1
    let ox = dx / dl, oy = dy / dl
    for (const o of run.obstacles || []) {
      const ex = p.x - o.x, ey = p.y - o.y, el = Math.hypot(ex, ey) || 1
      const gap = el - (o.r ?? 0) - C.PLAYER.radius
      if (gap < 90) { const w = 1.4 * (1 - Math.max(0, gap) / 90); ox += ex / el * w; oy += ey / el * w }
    }
    // ...but never so bent that it stops getting OUT: at least 0.6 of the stick stays on the
    // head->fish ray (traced d3 3@105.9: a 1.4-weight push off a post sent the fish round the head
    // at the same radius for the whole wind-up)
    let ol = Math.hypot(ox, oy) || 1
    let vx = ox / ol, vy = oy / ol
    const ax = dx / dl, ay = dy / dl, c = vx * ax + vy * ay
    if (c < 0.6) {
      let tx = vx - c * ax, ty = vy - c * ay
      const tl = Math.hypot(tx, ty) || 1
      tx /= tl; ty /= tl
      vx = 0.6 * ax + 0.8 * tx; vy = 0.6 * ay + 0.8 * ty
    }
    ix = vx; iy = vy
    if (pinnedF >= 2) {
      const sd = Math.floor(pinnedF / 20) % 2 ? -1 : 1
      const tx = 0.35 * ix - sd * iy, ty = 0.35 * iy + sd * ix, tl = Math.hypot(tx, ty)
      ix = tx / tl; iy = ty / tl
    }
  } else if (has('limp').length) {
    act = 'limp'
    let b = null, bd = Infinity
    for (const t of has('limp')) { const d = Math.hypot(t.x - p.x, t.y - p.y); if (d < bd) { bd = d; b = t } }
    toward(b.x, b.y, 0.85)
  } else if (h) {
    const a = Math.atan2(p.y - h.y, p.x - h.x) + 0.35
    const R = P.hug > 0 && run.script.phase === 'chase' ? C.KRAKEN_HEAD_R * P.hug : C.KRAKEN_ARM_REACH * 0.9
    toward(h.x + Math.cos(a) * R, h.y + Math.sin(a) * R, 0.7)
  }
  // a grab wind-up that has gone (latched or missed) is forgotten, so the arm's NEXT one rolls again
  for (const k of Object.keys(ignoreGrab)) if (!tells.some((t) => t.kind === 'grabCharge' && String(t.i) === k)) delete ignoreGrab[k]
  if (press && act === 'kite') act = 'parry'
  return { press, act, ix, iy }
}

// ---------------------------------------------------------------- sim truth, graded after the fact
const attacks = []
const openSlam = {}, openHold = {}
let coilRec = null, lungeRec = null
const grabTellSince = {}          // arm -> time its grabCharge tell has been continuously drawn since
let lastDodgeGrabT = -1
let lastDodgeBiteT = -1
const conf = { frames: 0, moments: 0, pairs: {}, on: false }
let armsT = 0
const press = { n: 0, land: 0, whiff: 0 }
const glow = { frames: 0, ringNoParry: 0, parryNoRing: 0, both: 0, btnClasses: {} }
const tellCounts = {}
const grabOpen = {}   // arm -> { hurt } while its grab winds up
const lastGrabTrace = {}
const safeStat = { grabs: 0, sideRight: 0, sideRightAny: 0, oneClear: 0, contested: 0, savedByIt: 0, steppedIntoThreat: 0 }
// EVERY HIT, AND WHETHER ITS SOURCE WAS ON SCREEN. A hurt event's src is matched against the tells
// that could have warned of it; "sourced" = one of them was drawn in the last HIT_LOOKBACK s. Adds
// (graveyard dead, any other src) are sprites render always draws, so they count as sourced by body.
const HIT_LOOKBACK = 0.5
const HIT_TELLS = { krakenArm: ['slamCharge', 'slamFlash', 'grabCharge', 'hold', 'coil'], 'krakenHead:lunge': ['lungeCharge', 'lungeFlash'], 'krakenHead:touch': ['headBite'] }
const tellSeen = {}
const hits = []

function parryWouldLand(p) {
  // krakenParry's own candidacy (sim.js): arm in window, on its struck line widened by the margin
  for (const a of run.krakenArms) {
    if (a.dead || a.limpT > 0 || a.gripT > 0 || a.coilArm || a.grabArm) continue   // krakenParryTarget skips a grab wind-up too
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
  for (const tl of tells) { tellCounts[tl.kind] = (tellCounts[tl.kind] || 0) + 1; tellSeen[tl.kind] = t }
  const drawn = (i, k) => tells.some((tl) => tl.i === i && tl.kind === k)
  const inArms = s.phase === 'boss' || s.phase === 'chase'
  if (inArms) armsT += DT

  // --- what the moment REQUIRES, from truth (pre-step: the state the player is looking at)
  const needP = parryWouldLand(p)
  const needW = run.krakenArms.some((a) => !a.dead && a.gripT > 0)
  // a grab about to land: today the forecast's NEXT stage (gripSoonT = seconds to the latching turn).
  // ⚠ THE GRAB REDESIGN ADDS ITS OWN WIND-UP CLOCK: OR it in here, one line, or a dodgeable grab
  // will read as "no grab coming" and the conflict count will be low for the wrong reason.
  const grabSoon = ((s.gripSoonT ?? -1) >= 0 && s.gripSoonT <= P.conflictT) || run.krakenArms.some((a) => !a.dead && a.grabArm && a.tele > 0 && a.tele <= P.conflictT)
  const onCoilLane = s.coilT > 0 && run.krakenArms.some((a) => !a.dead && a.coilArm && a.tele > 0 && seg2(p.x, p.y, a.lx0, a.ly0, a.lx1, a.ly1) <= C.KRAKEN_LASH_W ** 2)
  // ...or the head's jaws are winding up on the fish (the bite: step out)
  const hB = head()
  const biteOn = !!hB && s.phase === 'chase' && hB.biteT != null
  const needD = grabSoon || onCoilLane
  const need = [needP && 'P', needW && 'W', needD && 'D', biteOn && 'B'].filter(Boolean)
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
    if (a.tele > 0 && !a.coilArm && !a.grabArm && !openSlam[a.i]) openSlam[a.i] = { kind: 'slam', i: a.i, t0: t, band: false, flash: false, pressed: false, cdBlocked: false }
    const r = openSlam[a.i]
    if (r && a.tele > 0 && a.tele <= rung.window) {
      const band = seg2(p.x, p.y, a.lx0, a.ly0, a.lx1, a.ly1) <= parryW * parryW
      if (band && !r.band) { r.ia = t; r.ib = t + a.tele }   // the answer is DUE from now until it would land
      if (band) r.band = true
      // what was on this arm the first frame it was due, for a failure's post-mortem in the json
      if (band && !r.dbg) r.dbg = { tells: tells.filter((tl) => tl.i === a.i).map((tl) => tl.kind), tele: +a.tele.toFixed(3), fuse: a.fuse, slamT: a.slamT, hitT: a.hitT, lesson: run.krakenLesson, phase: s.phase, hitStop: run.hitStop }
      if (band && (drawn(a.i, 'slamFlash') || drawn(a.i, 'slamNow'))) r.flash = true
      if (band && d.press) r.pressed = true
      if (band && cd > 0) r.cdBlocked = true
    }
    if (a.gripT > 0 && !openHold[a.i]) openHold[a.i] = { kind: 'hold', i: a.i, t0: t, frames: 0, wiggled: 0, drawn: 0 }
    const hr = openHold[a.i]
    if (hr && a.gripT > 0) { hr.frames++; if (d.act === 'wiggle') hr.wiggled++; if (drawn(a.i, 'hold')) { hr.drawn++; if (hr.firstDrawnS == null) hr.firstDrawnS = +(t - hr.t0).toFixed(2) } }
    if (drawn(a.i, 'grabCharge')) { if (grabTellSince[a.i] == null) grabTellSince[a.i] = t } else grabTellSince[a.i] = null
  }
  if (d.act === 'dodgeGrab') lastDodgeGrabT = t
  if (d.act === 'dodgeBite') lastDodgeBiteT = t
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
  const bx0 = p.x, by0 = p.y
  step(run, { x: d.ix, y: d.iy, skill: d.press }, DT)
  pinnedF = (d.ix || d.iy) && Math.hypot(p.x - bx0, p.y - by0) < 1 ? pinnedF + 1 : 0
  const ev = run.events.splice(0)
  run.player.hp = run.player.maxHP
  if (run.phase === 'levelup') run.phase = 'playing'
  const hurtArm = ev.some((e) => e.type === 'hurt' && e.src === 'krakenArm')
  // THE GRAB'S SAFE SIDE, GRADED. While a grab winds up: did the bot, dodging it, get struck by
  // ANOTHER arm (i.e. step into a threat)? And was the published side actually clear — judged at the
  // spot sim published for each side (a.grabSpotX/Y, a.grabAltX/Y: the step a player really takes in
  // the fuse, speed x (fuse - KRAKEN_GRAB_REACT), capped by the cage wall), against threats this
  // grader tests for itself: a side the wall cuts shorter than KRAKEN_GRAB_MIN_STEP is blocked, and a
  // side is hot if another arm's struck line lies within KRAKEN_LASH_W of its spot.
  // Judged against the threats live WHEN THE GRAB STARTED (what the chevron could know): a slam that
  // starts later aims at wherever the fish has stepped to, i.e. at the safe side by construction.
  // timed: only threats that land while the fish would still be out there (before the grab strikes
  // + KRAKEN_BEAT_BREATH + 0.3s). untimed (any=true): every live lane, the stricter reading.
  const spotOf = (a, sd) => (sd === a.grabSafeSide ? { x: a.grabSpotX, y: a.grabSpotY } : { x: a.grabAltX, y: a.grabAltY })
  const sideHot = (a, sd, any = false) => {
    const { x, y } = spotOf(a, sd)
    if (!(Number.isFinite(x) && Number.isFinite(y))) return true
    if (Math.hypot(x - a.aimX, y - a.aimY) < C.KRAKEN_GRAB_MIN_STEP) return true
    return run.krakenArms.some((o) => o !== a && !o.dead && o.tele > 0 && o.limpT <= 0 && (any || o.tele <= C.KRAKEN_GRAB_FUSE + C.KRAKEN_BEAT_BREATH + 0.3) && seg2(x, y, o.lx0, o.ly0, o.lx1, o.ly1) <= C.KRAKEN_LASH_W ** 2)
  }
  // why the OTHER side was not picked when it was the clear one (diagnostic)
  const sideWhy = (a, sd) => {
    const { x, y } = spotOf(a, sd)
    const hh = head()
    const dh = hh ? Math.hypot(x - hh.x, y - hh.y) : 0
    return Math.hypot(x - a.aimX, y - a.aimY) < C.KRAKEN_GRAB_MIN_STEP ? 'clear side was walled off' : dh < C.KRAKEN_HEAD_R * 1.8 ? 'clear side was on the head' : 'scored threats'
  }
  for (const a of run.krakenArms) {
    if (a.grabArm && a.tele > 0) {
      const r = grabOpen[a.i] || (grabOpen[a.i] = { hurt: false, safeHot: sideHot(a, a.grabSafeSide), otherHot: sideHot(a, -a.grabSafeSide), safeHotAny: sideHot(a, a.grabSafeSide, true), why: sideWhy(a, -a.grabSafeSide) })
      if (d.act === 'dodgeGrab' && ev.some((e) => e.type === 'lash' && !e.coil) && hurtArm) r.hurt = true
      if (typeof process !== 'undefined' && process.env.KC_WHY) { r.trace = r.trace || []; if ((r.trace.length % 1) === 0 && Math.round(a.tele * 60) % 12 === 0) r.trace.push([+a.tele.toFixed(2), d.act, Math.round(Math.sqrt(seg2(p.x, p.y, a.lx0, a.ly0, a.lx1, a.ly1))), Math.round(p.x), Math.round(p.y), +d.ix.toFixed(2), +d.iy.toFixed(2)]) }
    }
  }
  for (const e of ev) {
    if (!(e.type === 'grabMiss' || e.type === 'gripLatch') || e.i == null) continue
    const a = run.krakenArms[e.i]
    const r = grabOpen[e.i] || { hurt: false }
    delete grabOpen[e.i]
    lastGrabTrace[e.i] = r.trace
    if (!a || !(a.grabSafeSide === 1 || a.grabSafeSide === -1)) continue
    safeStat.grabs++
    if (r.hurt) safeStat.steppedIntoThreat++
    const safeHot = !!r.safeHot, otherHot = !!r.otherHot
    if (safeHot || otherHot) safeStat.contested++
    if (!safeHot) safeStat.sideRight++
    if (!r.safeHotAny) safeStat.sideRightAny++
    if (!safeHot && otherHot) safeStat.savedByIt++
    if (safeHot !== otherHot) safeStat.oneClear++
    if (safeHot && !otherHot) { safeStat.wrong = safeStat.wrong || {}; const k = r.why || '?'; safeStat.wrong[k] = (safeStat.wrong[k] || 0) + 1 }
  }
  for (const e of ev) {
    if (e.type !== 'hurt') continue
    // by what it BILLED: the burst flag is set after head.dmg in stepKrakenChase, so it is off by a frame at both ends
    const lunge = e.src === 'krakenHead' && (e.dmg ?? 0) > C.KRAKEN_HEAD_TOUCH_DMG * 1.5
    const src = e.src + (e.src === 'krakenHead' ? (lunge ? ':lunge' : ':touch') : '')
    const kinds = HIT_TELLS[src]
    // a lunge lands up to its 0.5s burst after the flash, so it gets the burst on top of the lookback
    const look = HIT_LOOKBACK + (src === 'krakenHead:lunge' ? 0.5 : 0)
    const by = kinds ? kinds.filter((k) => tellSeen[k] != null && tellSeen[k] >= t - look) : ['body']
    const hh = head()
    hits.push({ t: +t.toFixed(2), src, dmg: e.dmg, phase: s.phase, sourced: by.length > 0, by, d: hh ? Math.round(Math.hypot(p.x - hh.x, p.y - hh.y)) : null, riseT: s.riseT ?? null, staggerT: s.staggerT ?? null })
  }
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
      // 'released': the hold ended with no break and no bite — the head hid, or the arm broke under it
      hr.outcome = ev.some((e) => e.type === 'gripBreak') ? 'escaped' : hurtArm ? 'bitten' : 'released'
      hr.correct = hr.frames > 0 && hr.wiggled / hr.frames >= 0.5
      hr.ok = hr.outcome !== 'bitten'
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
      g.cause = g.tellS < 0 ? (preSoon !== a.i ? 'latched by an arm the forecast had not named (the nearest grabber changed as the player moved)' : pre[k].slamT > 0 ? 'no grabCharge drawn: the grabbing arm was still showing its landed slam' : 'no grabCharge drawn before the latch') : g.dodging ? 'dodged off the drawn line and it latched anyway' + (typeof process !== 'undefined' && process.env.KC_WHY ? ' [' + JSON.stringify({ dLane: Math.round(Math.sqrt(seg2(run.player.x, run.player.y, a.lx0, a.ly0, a.lx1, a.ly1))), dHead: Math.round(Math.hypot(run.player.x - (head()?.x ?? 0), run.player.y - (head()?.y ?? 0))), cage: Math.round(run.script.cageR), side: a.grabSafeSide, L: Math.round(Math.hypot(a.lx1 - a.lx0, a.ly1 - a.ly0)), trace: lastGrabTrace[a.i] }) + ']' : '') : 'tell drawn but the bot did not dodge'
      attacks.push(g)
    }
  })
  // THE BITE: one record per snap, graded by what it billed. correct = the bot was stepping out of
  // the reach in the 0.6s before the snap.
  for (const e of ev) if (e.type === 'headBite') attacks.push({ kind: 'bite', i: -1, t0: t, ia: t - C.KRAKEN_BITE_WINDUP_T, ib: t, outcome: e.hit ? 'bitten' : 'dodged', d: Math.round(Math.hypot(e.px - e.x, e.py - e.y)), spd: Math.round(Math.hypot(run.player.vx ?? 0, run.player.vy ?? 0)), held: run.krakenArms.some((a) => !a.dead && a.gripT > 0), walled: (s.cageT ?? 0) > 0, slowed: (run.player.slowT ?? 0) > 0, correct: lastDodgeBiteT >= t - 0.6, ok: !e.hit, cause: e.hit ? (lastDodgeBiteT >= t - 0.6 ? 'stepped out and was bitten anyway' : 'did not step out') : null })
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
  press, glow, tellCounts, safe: safeStat, hits, oracle: !!window.__kcOracle, parryCd: C.KRAKEN_PARRY_CD,
}
H.note('kraken-cues: ' + attacks.length + ' attacks graded over ' + armsT.toFixed(0) + 's of arms phase')
return () => { app && app.renderer.render(app.stage) }
