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
//   - IMMORTAL. Survival is not what this measures; a weapon that gets the player killed would
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
const SEEDS = String(arg('seeds', '1001,2002,3003,4004,5005,6006')).split(',').map(Number)
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
  let ringT = 0, limpT = 0, chaseT = 0, won = false, maxRearing = 0
  const steps = Math.round(SECS / DT)
  for (let i = 0; i < steps; i++) {
    if (run.phase === 'levelup') { levels++; run.phase = 'playing'; continue }
    if (run.phase !== 'playing') { won = run.phase === 'victory'; break }
    const p = run.player
    const s = run.script
    const head = run.enemies.find((e) => e.rosterId === 'krakenHead' && !e._dead) || null

    // --- the bot: stand on the nearest LIMP arm if there is one (that is where the damage goes),
    // otherwise hold station near the head. This is the loop the design is asking for.
    let tx = p.x, ty = p.y
    const limp = run.krakenArms.filter((a) => !a.dead && a.limpT > 0)
    if (limp.length) {
      let best = limp[0], bd = Infinity
      for (const a of limp) { const d = (a.x - p.x) ** 2 + (a.y - p.y) ** 2; if (d < bd) { bd = d; best = a } }
      tx = best.x; ty = best.y
    } else if (head) {
      const ang = Math.atan2(p.y - head.y, p.x - head.x)
      tx = head.x + Math.cos(ang) * C.KRAKEN_ARM_REACH * 1.2
      ty = head.y + Math.sin(ang) * C.KRAKEN_ARM_REACH * 1.2
    }
    const dx = tx - p.x, dy = ty - p.y, dl = Math.hypot(dx, dy)
    const inX = dl > 6 ? dx / dl : 0, inY = dl > 6 ? dy / dl : 0

    // --- the press: any arm in its window or gripping, or the head's lunge in its window
    let press = false
    if ((run.repulseCd ?? 0) <= 0) {
      for (const a of run.krakenArms) {
        if (a.dead || a.limpT > 0) continue
        if (a.gripT > 0 || (a.tele > 0 && a.tele <= rung.window)) { press = true; break }
      }
      if (!press && head && s.phase === 'chase' && !(s.staggerT > 0)) {
        if (head.lungeT > 0 && head.lungeT <= rung.window) press = true
      }
    }
    let rearing = 0
    for (const a of run.krakenArms) if (!a.dead && a.tele > 0) rearing++
    if (rearing > maxRearing) maxRearing = rearing
    if (s.phase === 'boss') ringT += DT
    if (s.phase === 'chase') chaseT += DT
    if (limp.length) limpT += DT

    run.player.hp = run.player.maxHP
    stepSim(run, { x: inX, y: inY, skill: press }, DT)
    for (const e of run.events) {
      if (e.type === 'parry' || e.type === 'parryPerfect') parries++
      else if (e.type === 'parryWhiff') whiffs++
      else if (e.type === 'armRear') limpWindows += 0
      else if (e.type === 'headStagger') staggers++
    }
    run.events.length = 0
  }
  return {
    won, t: run.time, parries, whiffs, staggers, levels, maxRearing,
    broken: run.krakenArms.filter((a) => a.dead).length, arms: run.krakenArms.length,
    ringT, limpT, chaseT, headLeft: Math.round(run.script?.headHp ?? 0),
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
console.log(`staggers       ${f('staggers')}   head hp left ${f('headLeft')}`)
console.log(`max rearing    ${f('maxRearing')}  (rung cap ${rung.rearing})`)
console.log(`ring / chase s ${f('ringT', 0)} / ${f('chaseT', 0)}`)
console.log(`s with a limb exposed ${f('limpT', 0)}`)
console.log(`level-ups      ${f('levels')}`)
