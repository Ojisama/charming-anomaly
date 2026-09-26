// THE KRAKEN, MEASURED. The only probe that can play this chapter, and for a while the only one
// that existed at all: an adversarial review of rev 2 found that NO kraken or parry probe had ever
// been committed, so every number quoted about this fight — win rates, open-window shares, the
// whole balance table in the design doc — could not be re-run by anyone, including me.
//
//   node scripts/kraken-probe.mjs --diff 3 --level 3 --weapon skippingShell
//   node scripts/kraken-probe.mjs --diff 1 --level 1 --seeds 11,22,33
//
// WHY scripts/weapon-census.mjs CANNOT DO THIS. Its bot does not parry, and under rev 3 a parry is
// the only thing that exposes an arm — so every weapon would score zero for the rig's reasons
// rather than its own, which is indistinguishable from a real bug and has cost a debugging round
// here twice before.
//
// THE RIG, stated so a number is never quoted without it:
//   - IMMORTAL, AND IT TAKES NO LEVEL-UP CARDS. Every number off this rig is therefore a CEILING,
//     never a difficulty statement: two adversarial reviews in a row had to point that out before it
//     was written down. A mortal rig that also takes cards is the other end of the bracket, and the
//     truth is between them. Quote both or neither.
//   - Survival is not what this measures; a weapon that gets the player killed would
//     otherwise score its own short run as low output for entirely the wrong reason.
//   - It parries EVERY window it is offered, so it is a CEILING on player skill, not a model of
//     one. Fight lengths off this rig are the fastest a human could manage, never the median.
//   - It stands on whatever limb its last parry opened, which is rev 3's actual loop: the parry
//     opens the limb and the player's own build kills it.
//   - Every distance is measured off KRAKEN_ARM_REACH and PRINTED. This boss has twice had a rig
//     park the player outside weapon range off a balance constant that moved underneath it, and
//     both times it reported zero damage, which reads exactly like a broken damage gate.
//   - 6 seeds by default and EVERY ONE IS PRINTED. Two seeds lie.

const SRC = new URL('../src/', import.meta.url).href
const { createRun, ensureChapterMeta, ensureBookMeta } = await import(SRC + 'state.js')
const { stepSim } = await import(SRC + 'sim.js')
const C = await import(SRC + 'config.js')

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] }
const DIFF = Number(arg('diff', 3))
const LEVEL = Number(arg('level', 3))
const SECS = Number(arg('secs', 300))
const WEAPON = arg('weapon', 'skippingShell')
// --parry P: the bot answers each arm's wind-up with probability P, decided once per wind-up on its
// own RNG so the sim's stream is not re-phased by it. 1 = the ceiling rig; below 1 slams LAND, which
// is the only way to measure the slam's own hitbox (at 1 nearly every plain slam is parried).
const PARRY_P = Number(arg('parry', 1))
// --lungeParry P: the same for the chase head's LUNGE (default: the --parry value), decided once per
// lunge window. At 1 every lunge is parried and the lunge's damage never enters the number at all.
const LUNGE_P = Number(arg('lungeParry', PARRY_P))
if (!(LUNGE_P >= 0 && LUNGE_P <= 1)) { console.error('ABORT: --lungeParry must be 0..1, got ' + arg('lungeParry')); process.exit(1) }
if (!(PARRY_P >= 0 && PARRY_P <= 1)) { console.error('ABORT: --parry must be 0..1, got ' + arg('parry')); process.exit(1) }
const DODGE = process.argv.includes('--dodge')
// --cadence S: override this rung's ring cadence for the run (sweeps without editing config.js)
if (arg('cadence', null) != null) {
  const cad = Number(arg('cadence'))
  if (!(cad > 0)) { console.error('ABORT: --cadence must be > 0, got ' + arg('cadence')); process.exit(1) }
  C.krakenRung(Number(arg('diff', 3))).cadence = cad
}
const DODGE_T = Number(arg('dodgeT', 0.35))
const SEEDS = String(arg('seeds', '1001,2002,3003,4004,5005,6006')).split(',').map(Number)
// --bite dodge|ignore: what the bot does about the chase head's BITE (head.biteT, the jaws winding
// up). 'ignore' (the default, and the only behaviour on a build without the bite) plays on as if
// nothing were drawn; 'dodge' steps out along the head->fish ray bent away from the nearest
// collider, and slides round whatever it is pinned against (a pier post) when a frame of full stick
// moves it under 1px.
const BITE = arg('bite', 'ignore')
if (!['dodge', 'ignore'].includes(BITE)) { console.error('ABORT: --bite must be dodge or ignore, got ' + BITE); process.exit(1) }
// --hug F: in the chase, hold station at F x KRAKEN_HEAD_R from the head instead of 1.2 x the arm
// reach — a player who stays in the head's face. 0 = off.
const HUG = Number(arg('hug', 0))
if (!(HUG >= 0)) { console.error('ABORT: --hug must be >= 0'); process.exit(1) }
if (![DIFF, LEVEL, SECS].every(Number.isFinite)) { console.error('ABORT: bad numeric arg'); process.exit(1) }
const DT = 1 / 60

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function makeMeta() {
  const m = { coins: 0, shop: {}, best: { time: 0, kills: 0 }, runs: 0, chapters: {} }
  ensureChapterMeta(m, 'kraken'); m.chapters.kraken.unlocked = true
  ensureBookMeta(m, 'undertow')
  return m
}

function fight(seed) {
  Math.random = mulberry32(seed)
  const run = createRun(makeMeta(), { chapter: 'kraken', difficulty: DIFF })
  if (run.chapter !== 'kraken') { console.error('ABORT: got ' + run.chapter); process.exit(1) }
  run.player.maxHP = run.player.hp = 1e9
  run.weapons = [{ id: WEAPON, level: LEVEL }]
  const rung = C.krakenRung(DIFF)

  let parries = 0, whiffs = 0, limpWindows = 0, staggers = 0, levels = 0
  let ringT = 0, limpT = 0, chaseT = 0, won = false, maxRearing = 0, enraged = -1, coilWind = 0, coilClose = 0, ringParries = 0, ringBreaks = 0, ringBlazes = 0
  let slamRears = 0, dmg = 0, coilDmg = 0, coilLash = 0, slamLands = 0, slamHits = 0, grabs = 0, grips = 0, grabMiss = 0, gripDmg = 0
  const botRnd = mulberry32(seed ^ 0x5bd1e995)
  let pinned = false, chaseDmg = 0
  const bySrc = {}
  const steps = Math.round(SECS / DT)
  for (let i = 0; i < steps; i++) {
    if (run.phase === 'levelup') { levels++; run.phase = 'playing'; continue }
    if (run.phase !== 'playing') { won = run.phase === 'victory'; break }
    const p = run.player
    const s = run.script
    const head = run.enemies.find((e) => e.rosterId === 'krakenHead' && !e._dead) || null

    // --- the bot: stand on the nearest LIMP arm if there is one (that is where the damage goes),
    // otherwise hold station near the head. This is the loop the design is asking for.
    // THE LOOP, IN PRIORITY ORDER — and the middle rung is the one that matters. The parry has a
    // RANGE now, so a bot that holds station while an arm winds up on the far side of the ring
    // simply never presses: measured at 8 parries in 300 SECONDS, which reads as the fight stalling
    // and is really the rig refusing to walk. A player goes to the thing they intend to answer.
    //   1. a limb you already opened — that is where your damage goes
    //   2. the arm winding up — you have to be next to it to parry it
    //   3. otherwise hold near the head
    let tx = p.x, ty = p.y
    const limp = run.krakenArms.filter((a) => !a.dead && a.limpT > 0)
    const winding = run.krakenArms.filter((a) => !a.dead && a.limpT <= 0 && (a.tele > 0 || a.gripT > 0))
    if (limp.length) {
      let best = limp[0], bd = Infinity
      for (const a of limp) { const d = (a.x - p.x) ** 2 + (a.y - p.y) ** 2; if (d < bd) { bd = d; best = a } }
      tx = best.x; ty = best.y
    } else if (winding.length) {
      let best = winding[0], bt = Infinity
      for (const a of winding) { const t = a.gripT > 0 ? -1 : a.tele; if (t < bt) { bt = t; best = a } }
      tx = best.x; ty = best.y
    } else if (head) {
      const ang = Math.atan2(p.y - head.y, p.x - head.x)
      const R = HUG > 0 && s.phase === 'chase' ? C.KRAKEN_HEAD_R * HUG : C.KRAKEN_ARM_REACH * 1.2
      tx = head.x + Math.cos(ang) * R
      ty = head.y + Math.sin(ang) * R
    }
    const dx = tx - p.x, dy = ty - p.y, dl = Math.hypot(dx, dy)
    let inX = dl > 6 ? dx / dl : 0, inY = dl > 6 ? dy / dl : 0
    // HELD BY A GRIP: it is not parryable, it is WIGGLED out of, so the bot swings the stick — the
    // only thing stickFlicks can see. A bot walking a straight line at a target never swings, so
    // without this every grip runs its clock out and bites, and the fight measures harder than it
    // is. One full turn a second is ~4 flicks/s, a rate a thumb can hold.
    const held = run.krakenArms.find((a) => !a.dead && a.gripT > 0)
    const biting = BITE === 'dodge' && head && s.phase === 'chase' && head.biteT != null
    if (biting && !held) {
      // out along the head->fish ray, bent away from the nearest collider within 90px (the same
      // rule as scripts/scenes/kraken-cues.js's bot), sliding tangentially if still pinned
      const bx = p.x - head.x, by = p.y - head.y, bl = Math.hypot(bx, by) || 1
      let ox = bx / bl, oy = by / bl
      for (const o of run.obstacles || []) {
        const ex = p.x - o.x, ey = p.y - o.y, el = Math.hypot(ex, ey) || 1
        const gap = el - (o.r ?? 0) - C.PLAYER.radius
        if (gap < 90) { const w = 1.4 * (1 - Math.max(0, gap) / 90); ox += ex / el * w; oy += ey / el * w }
      }
      {  // at least 0.6 of the stick stays on the head->fish ray (the same rule as the cue bot's)
        const l0 = Math.hypot(ox, oy) || 1, vx = ox / l0, vy = oy / l0, ax = bx / bl, ay = by / bl, c = vx * ax + vy * ay
        if (c < 0.6) { let tx = vx - c * ax, ty = vy - c * ay; const tl = Math.hypot(tx, ty) || 1; ox = 0.6 * ax + 0.8 * tx / tl; oy = 0.6 * ay + 0.8 * ty / tl }
      }
      if (pinned) { const sd = (i >> 5) & 1 ? 1 : -1; const l0 = Math.hypot(ox, oy) || 1; const ux = ox / l0, uy = oy / l0; ox = ux * 0.35 - sd * uy; oy = uy * 0.35 + sd * ux }
      const ol = Math.hypot(ox, oy) || 1
      inX = ox / ol; inY = oy / ol
    } else if (held) { held._botA = (held._botA ?? 0) + Math.PI * 2 * DT; inX = Math.cos(held._botA); inY = Math.sin(held._botA) }
    // --dodge: an arm the bot chose NOT to answer is side-stepped instead — for its last DODGE_T
    // seconds the bot walks straight off the struck line (perpendicular to it, away from its axis).
    // Without this a skipped slam lands on a player parked on its tip, and the hitbox's width never
    // enters the number.
    else if (DODGE) {
      const d = run.krakenArms.find((a) => !a.dead && (a._botSkip || a.grabArm) && !a.coilArm && a.tele > 0 && a.tele <= DODGE_T && a.lx1 != null)
      const m = d && d.grabArm && d.jawX != null ? run.krakenArms[d.pinchMate] : null
      if (m && m.jawX != null) {
        // a PINCH: out of the V, off the jaws' chord on the side away from them
        const L = Math.hypot(m.jawX - d.jawX, m.jawY - d.jawY) || 1
        let nx = -(m.jawY - d.jawY) / L, ny = (m.jawX - d.jawX) / L
        if (nx * ((d.jawX + m.jawX) / 2 - d.pinchCX) + ny * ((d.jawY + m.jawY) / 2 - d.pinchCY) > 0) { nx = -nx; ny = -ny }
        inX = nx; inY = ny
      } else if (d) {
        const L = Math.hypot(d.lx1 - d.lx0, d.ly1 - d.ly0) || 1
        const nx = -(d.ly1 - d.ly0) / L, ny = (d.lx1 - d.lx0) / L
        const side = (p.x - d.lx0) * nx + (p.y - d.ly0) * ny >= 0 ? 1 : -1
        inX = nx * side; inY = ny * side
      }
    }

    // --- the press: any arm in its window or gripping, or the head's lunge in its window
    // THE BOT ONLY PRESSES AT SOMETHING IT COULD ACTUALLY ANSWER. The parry has a range gate — you
    // cannot deflect a swing that was never going to reach you — so a bot that ignores range spends
    // its cooldown on whiffs and reports the fight as harder than it is. Mirrors krakenParry.
    const reach2 = (C.KRAKEN_LASH_R * 1.6) ** 2
    for (const a of run.krakenArms) {
      if (a.tele > 0 && !a._botSeen) { a._botSeen = true; a._botSkip = botRnd() >= PARRY_P }
      else if (!(a.tele > 0)) a._botSeen = false
    }
    let press = false
    if ((run.repulseCd ?? 0) <= 0) {
      // THE HEAD FIRST, mirroring krakenParry. A lunge is rare and is the only route to a stagger,
      // which is the only way the head takes damage at all; an arm is always available and comes
      // round again. A bot that checked arms first never pressed at the head once in a whole fight.
      if (head && s.phase === 'chase' && !(s.staggerT > 0)) {
        const near = (head.x - p.x) ** 2 + (head.y - p.y) ** 2 <= C.KRAKEN_CAGE_R ** 2
        const inWin = head.lungeT > 0 && head.lungeT <= rung.lungeWindow
        if (inWin && !head._botSeen) { head._botSeen = true; head._botSkip = botRnd() >= LUNGE_P }
        else if (!inWin) head._botSeen = false
        if (near && inWin && !head._botSkip) press = true
      }
      if (!press) {
        for (const a of run.krakenArms) {
          if (a.dead || a.limpT > 0 || a.coilArm || a.grabArm) continue   // krakenParry skips a Coil arm and a grab too
          if (a._botSkip) continue
          if ((a.x - p.x) ** 2 + (a.y - p.y) ** 2 > reach2) continue
          if (a.tele > 0 && a.tele <= rung.window) { press = true; break }
        }
      }
    }
    let rearing = 0
    for (const a of run.krakenArms) if (!a.dead && a.tele > 0) rearing++
    if (rearing > maxRearing) maxRearing = rearing
    if (s.phase === 'boss') ringT += DT
    if (s.phase === 'chase') chaseT += DT
    if (limp.length) limpT += DT

    run.player.hp = run.player.maxHP
    const px0 = p.x, py0 = p.y
    const burstPre = !!head && (head._lungeBurst ?? 0) > 0
    stepSim(run, { x: inX, y: inY, skill: press }, DT)
    pinned = (inX || inY) && Math.hypot(p.x - px0, p.y - py0) < 1
    // damage TAKEN this step (the rig is immortal, so this is what a mortal player would have lost)
    const lost = Math.max(0, run.player.maxHP - run.player.hp)
    dmg += lost
    if (s.phase === 'chase') chaseDmg += lost
    for (const e of run.events) {
      if (e.type !== 'hurt') continue
      // a head hit while its lunge burst runs (before or after the step) is the lunge; any other is its
      // touch (v7.361) or bite. NOT by amount: a bite tuned near KRAKEN_LUNGE_DMG would be misfiled.
      const burstNow = burstPre || (!!head && (head._lungeBurst ?? 0) > 0)
      const k = e.src === 'krakenHead' ? (burstNow ? 'lunge' : 'head touch/bite') : e.src === 'krakenArm' ? 'arms' : 'adds+other'
      bySrc[k] = (bySrc[k] || 0) + e.dmg
    }
    if (run.events.some((e) => e.type === 'lash' && e.coil)) coilDmg += lost
    for (const e of run.events) {
      if (e.type === 'lash' && e.coil) coilLash++
      if (e.type === 'lash' && !e.coil) slamLands++
      if (e.type === 'grabRear') grabs++   // one per pinch (it names both jaws)
      if (e.type === 'gripLatch') grips++
      if (e.type === 'grabMiss') grabMiss++
      if (e.type === 'hurt' && e.src === 'krakenArm' && !run.events.some((q) => q.type === 'lash')) gripDmg += e.dmg
      if (e.type === 'hurt' && e.src === 'krakenArm' && run.events.some((q) => q.type === 'lash' && !q.coil) && !run.events.some((q) => q.type === 'lash' && q.coil)) slamHits++
      if (e.type === 'parry' || e.type === 'parryPerfect') parries++
      else if (e.type === 'parryWhiff' || e.type === 'parryEarly') whiffs++
      else if (e.type === 'armRear') slamRears++
      else if (e.type === 'headStagger') staggers++
      else if (e.type === 'krakenEnrage') enraged = e.n
      else if (e.type === 'coilWind') coilWind++
      else if (e.type === 'coilClose') coilClose++
      if (s.phase === 'boss' && (e.type === 'parry' || e.type === 'parryPerfect')) ringParries++
      if (s.phase === 'boss' && e.type === 'tentacleBreak') ringBreaks++
      if (s.phase === 'boss' && e.type === 'blaze') ringBlazes++
    }
    run.events.length = 0
  }
  return {
    won, t: run.time, slamRears, parries, whiffs, staggers, levels, maxRearing, enraged, coilWind, coilClose, ringParries, ringBreaks, ringBlazes, dmg, coilDmg, coilLash, slamLands, slamHits, grabs, grips, grabMiss, gripDmg,
    broken: run.krakenArms.filter((a) => a.dead).length, arms: run.krakenArms.length,
    chaseDmg, bySrc, ringT, limpT, chaseT, headLeft: Math.round(run.script?.headHp ?? 0),
  }
}

const rung = C.krakenRung(DIFF)
console.log(`REV 3 — d${DIFF}, ${WEAPON} L${LEVEL}, ${SECS}s cap, ${SEEDS.length} seeds`)
console.log(`rung: ${rung.arms} arms, <=${rung.rearing} rearing at once, window ${rung.window}s, limp ${rung.limp}s, cadence ${rung.cadence}s, staggerNeed ${rung.staggerNeed}`)
console.log(`pools: arm ${C.KRAKEN_ARM_HP}hp x${rung.arms}, head ${Math.round(C.KRAKEN_HEAD_HP * rung.headHpMul)}hp\n`)
const rs = SEEDS.map(fight)
const f = (k, d = 0) => `[${rs.map((r) => (+r[k]).toFixed(d)).join(' ')}]`
console.log(`won            ${rs.filter((r) => r.won).length}/${rs.length}`)
console.log(`fight (s)      ${f('t', 0)}`)
console.log(`arms broken    ${f('broken')} of ${rs[0].arms}`)
console.log(`parries        ${f('parries')}   whiffs ${f('whiffs')}`)
// A SEED THAT WON HAS NO HEAD LEFT, so it prints a dash rather than a number. s.headHp is only
// written while the head EXISTS, so a victory leaves the last live reading standing and the row
// reads `head hp left [700 34 34 ...]` under `won 6/6` — a confident wrong number beside a correct
// one, which is worse than printing nothing. (v7.333.0's chore commit says it fixed this and its
// diff never touched the line.)
const headCol = `[${rs.map((r) => (r.won ? '-' : Math.round(r.headLeft))).join(' ')}]`
console.log(`staggers       ${f('staggers')}   head hp left ${headCol}`)
console.log(`max rearing    ${f('maxRearing')}  (rung cap ${rung.rearing})`)
console.log(`ring / chase s ${f('ringT', 0)} / ${f('chaseT', 0)}`)
console.log(`s with a limb exposed ${f('limpT', 0)}`)
console.log(`level-ups      ${f('levels')}`)
console.log(`arms hauled back at the enrage ${f('enraged')}   (-1 = the enrage never fired)`)
// A COIL THAT WINDS AND NEVER CLOSES is the shape of this chapter's worst bug class: the siren
// fires, the gap wedge goes up, and nothing ever resolves it. Counted so it cannot hide again.
console.log(`coils wound / closed  ${f('coilWind')} / ${f('coilClose')}`)
console.log(`ring: arm parries / arms broken  ${f('ringParries')} / ${f('ringBreaks')}   of them by blaze ${f('ringBlazes')}   parries per break ` + (rs.reduce((q, r) => q + r.ringParries, 0) / Math.max(1, rs.reduce((q, r) => q + r.ringBreaks, 0))).toFixed(2))
console.log(`coil lashes landed    ${f('coilLash')}`)
console.log(`damage taken          ${f('dmg')}   of it on a coil's landing ${f('coilDmg')}`)
// THE SLAM'S OWN HITBOX: plain (non-Coil) slams that landed unparried, and how many of them hurt.
console.log(`parry answer rate     ${PARRY_P}${DODGE ? `   dodging the rest (last ${DODGE_T}s, straight off the line)` : "   the rest land on a bot standing at the tip"}`)
// THE GRAB: wind-ups started (0 on a build where a grab latches on its turn with no wind-up), grips
// that took hold, grabs that missed, and what the grips cost (the full-hold bite, KRAKEN_GRIP_DMG).
console.log(`grabs wound / gripped / missed  ${f('grabs')} / ${f('grips')} / ${f('grabMiss')}   grips/min [${rs.map((r) => (r.grips / (r.t / 60)).toFixed(2)).join(' ')}]   grip damage ${f('gripDmg')}`)
console.log(`plain slams landed    ${f('slamLands')}   of them hit ${f('slamHits')}   hits/min [${rs.map((r) => (r.slamHits / (r.t / 60)).toFixed(2)).join(' ')}]`)
// THE RING'S THROUGHPUT, per minute of the whole fight: slam wind-ups, grab wind-ups, parries landed.
const pm = (k) => '[' + rs.map((r) => (r[k] / (r.t / 60)).toFixed(1)).join(' ') + ']  mean ' + (rs.reduce((q, r) => q + r[k] / (r.t / 60), 0) / rs.length).toFixed(2)
console.log('per minute     slams ' + pm('slamRears') + '   grabs ' + pm('grabs') + '   parries ' + pm('parries'))
console.log('arm attacks per minute of ring [' + rs.map((r) => ((r.slamRears + r.grabs + r.coilWind) / (r.ringT / 60)).toFixed(1)).join(' ') + ']  mean ' + (rs.reduce((q, r) => q + (r.slamRears + r.grabs + r.coilWind) / (r.ringT / 60), 0) / rs.length).toFixed(2)
  + '  pooled ' + (rs.reduce((q, r) => q + r.slamRears + r.grabs + r.coilWind, 0) / (rs.reduce((q, r) => q + r.ringT, 0) / 60)).toFixed(2))
console.log('fight mean     ' + (rs.reduce((q, r) => q + r.t, 0) / rs.length).toFixed(1) + 's')
// WHAT HURT, whole fight, by source; and the CHASE's own damage per minute of chase
const srcs = [...new Set(rs.flatMap((r) => Object.keys(r.bySrc)))].sort()
console.log(`bite: ${BITE}   hug: ${HUG || 'off'}   lunge parry ${LUNGE_P}   lunge dmg ${C.KRAKEN_LUNGE_DMG}   bite dmg ${C.KRAKEN_HEAD_TOUCH_DMG}${C.KRAKEN_BITE_REACH != null ? '   bite reach +' + C.KRAKEN_BITE_REACH : ''}`)
for (const k of srcs) console.log(`damage by source  ${k.padEnd(16)} [${rs.map((r) => Math.round(r.bySrc[k] || 0)).join(' ')}]`)
const cpm = rs.map((r) => (r.chaseT > 0 ? r.chaseDmg / (r.chaseT / 60) : 0))
console.log(`chase damage/min  [${cpm.map((v) => v.toFixed(0)).join(' ')}]  mean ${(cpm.reduce((a, b) => a + b, 0) / cpm.length).toFixed(1)}`)
