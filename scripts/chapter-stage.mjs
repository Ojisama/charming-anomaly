#!/usr/bin/env node
// What dev stage is a chapter REALLY at? Audits the repo; ignores anybody's claim about it.
// Usage: node scripts/chapter-stage.mjs [chapterId]   (no id = every chapter, one line each)
// The ladder is strict: a rung fails => every rung above it is "not reached", however finished
// the chapter looks. See .claude/skills/verifying-chapter-stage/SKILL.md for what each rung
// MEANS, and for the judgment calls this script deliberately cannot make.
import { readFileSync } from 'node:fs'
import { CHAPTERS, BOOKS, BOOK_ORDER, WEAPONS, WEAPON_MODS, ANOMALIES } from '../src/config.js'
import { FR } from '../src/fr.js'
import { createRun } from '../src/state.js'
import { stepSim } from '../src/sim.js'

const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')
// Comments are stripped for every "is this wired?" search. CLAUDE.md's run MB.a lesson: every id
// is discussed in prose right beside its wiring, so a raw substring hit is satisfied by the
// comment alone — delete the code, keep the sentence explaining it, and the check stays green
// while the feature is inert.
const decomment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const SIM = decomment(src('sim.js'))
const CONFIG_RAW = src('config.js')
// Signature wiring is searched across sim.js AND config.js: config.js holds pure helper fns that
// sim.js imports, and `refillSpec` — the one function that answers "where does this chapter's food
// come from" — reads `sig?.pockets` there, not in sim.js. Searching sim.js alone reports The Reef
// as an unbuilt idea.
// `CHAPTERS.reef.signature.pockets` is config.js naming its OWN field in a self-check table, not a
// consumer reading it. A real consumer takes the signature as a PARAMETER and never hardcodes a
// chapter id, so every hardcoded reference is dropped before the search — otherwise deleting the
// only real read of `.pockets` leaves the check green.
// Only a LITERAL chapter id is dropped. `CHAPTERS[run.chapter].signature?.maws` is a generic
// consumer and must survive, so a bracket access holding an expression is left alone.
const CHAPTER_IDS = Object.keys(CHAPTERS)
const WIRING = (SIM + '\n' + decomment(CONFIG_RAW))
  .replace(new RegExp(`CHAPTERS\\s*(?:\\.(?:${CHAPTER_IDS.join('|')})|\\[\\s*['"](?:${CHAPTER_IDS.join('|')})['"]\\s*\\])\\s*\\.\\s*signature`, 'g'), 'SELFREF')
const TESTS = readFileSync(new URL('../test/sim-test.js', import.meta.url), 'utf8')

// The chapter's own slab of config.js, for balance_decision hunting.
function configSlab (id) {
  const start = CONFIG_RAW.indexOf(`\n  ${id}: {`)
  if (start < 0) return ''
  let end = CONFIG_RAW.length
  for (const k of Object.keys(CHAPTERS)) {
    if (k === id) continue
    const at = CONFIG_RAW.indexOf(`\n  ${k}: {`, start + 1)
    if (at > start && at < end) end = at
  }
  return CONFIG_RAW.slice(start, end)
}

function bookOf (id) {
  for (const [bid, b] of Object.entries(BOOKS)) {
    const i = b.chapters.indexOf(id)
    if (i >= 0) return { bid, b, idx: i, hidden: false }
    if ((b.hidden || []).includes(id)) return { bid, b, idx: -1, hidden: true }
  }
  return null
}

// Mario-format position: book number from BOOK_ORDER (never key order — config.js keeps that list
// explicit for exactly this reason), chapter number from its own book's ladder. A hidden chapter
// sits on no ladder, so it gets a star rather than a number: The Blank is earned, not the 8th rung.
const mario = (id) => {
  const bk = bookOf(id)
  if (!bk) return '?-?'
  return `${BOOK_ORDER.indexOf(bk.bid) + 1}-${bk.hidden ? '\u2605' : bk.idx + 1}`
}

// Weapons only this chapter offers — the ones whose copy is this chapter's to translate.
function nativeWeapons (id) {
  const mine = CHAPTERS[id].weapons || []
  return mine.filter(w => !Object.entries(CHAPTERS).some(([o, c]) => o !== id && (c.weapons || []).includes(w)))
}

// 60s headless run. Proves it BOOTS and FIGHTS. Not a balance measurement — see the skill.
function smoke (id) {
  try {
    const run = createRun({ chapter: id, difficulty: 1 })
    let kills = 0
    for (let i = 0; i < 60 * 30; i++) {
      if (run.phase === 'levelup') { run.phase = 'playing'; continue }
      if (run.phase !== 'playing') break
      stepSim(run, { x: 0.3, y: 0.2, skill: false }, 1 / 30)
      for (const e of run.events) if (e.type === 'kill') kills++
      run.events.length = 0
    }
    if (!Number.isFinite(run.player.x)) return [false, 'player position went non-finite']
    return [kills > 0, kills > 0 ? `60s headless run: ${kills} kills, no throw` : '60s run threw nothing but killed nothing']
  } catch (e) {
    return [false, `60s headless run THREW: ${e.message}`]
  }
}

const LADDER = ['IDEATING', 'BUILDING', 'POLISHING', 'BALANCING', 'PLAYTESTING', 'PUBLISHED']

function audit (id) {
  const c = CHAPTERS[id]
  const rows = []
  const add = (stage, ok, msg, owner = false) => rows.push({ stage, ok, msg, owner })
  if (!c) return { rows: [{ stage: 'IDEATING', ok: false, msg: `no CHAPTERS.${id} — idea only` }], stage: 'IDEATING' }
  add('IDEATING', true, `CHAPTERS.${id} exists`)

  // ---- BUILDING: does it exist, is it wired, does it run ----
  const roster = c.roster || []
  const weapons = c.weapons || []
  // Owner's hard blockers on leaving ideation (2026-08-20): a chapter is not BUILDING until the
  // ideation carries three weapons, four mods on each, and an anomaly of its own. These gate the
  // SHAPE OF THE IDEA, so they run before anything about whether the code works.
  //   THEY GATE WORK IN PROGRESS ONLY. The bar postdates most of the game — applied to shipped
  // chapters it demotes 14 of 15 to IDEATING and the stage column stops meaning anything. For a
  // live chapter the same shortfall is recorded as DEBT (printed under the sweep) instead.
  const alreadyLive = (() => { const b = bookOf(id); return !!b && (b.hidden || b.b.wipFrom === undefined || b.idx < b.b.wipFrom) })()
  const debt = []
  const bar = (ok, msg, short) => {
    if (ok) return add('BUILDING', true, msg)
    if (alreadyLive) { debt.push(short); add('BUILDING', true, `${msg} — DEBT, not gated (shipped before the bar existed)`) } else add('BUILDING', false, msg)
  }
  bar(weapons.length >= 3, `${weapons.length} weapon(s) in the pool${weapons.length >= 3 ? '' : ' — the ideation owes 3'}`, `only ${weapons.length} weapons`)
  const thin = weapons.map(w => [w, Object.keys(WEAPON_MODS[w] || {}).length]).filter(([, n]) => n < 4)
  bar(thin.length === 0,
    thin.length ? `weapon(s) under 4 mods: ${thin.map(([w, n]) => `${w} has ${n}`).join(', ')}` : `all ${weapons.length} pool weapons carry 4+ mods`,
    thin.map(([w, n]) => `${w} has ${n}/4 mods`).join(', '))
  const own = Object.entries(ANOMALIES).filter(([, a]) => {
    const ch = a.chapter ?? a.chapters
    return Array.isArray(ch) ? ch.includes(id) : ch === id
  })
  bar(own.length >= 1,
    own.length ? `${own.length} anomaly of its own: ${own.map(m => m[0]).join(', ')}` : 'NO anomaly scoped to this chapter — the ideation owes 1',
    'owes 1 unique anomaly')
  add('BUILDING', roster.length > 0 && weapons.length > 0, `roster ${roster.length}, weapon pool ${weapons.length}`)
  // `starter` is a string on every normal chapter and an ARRAY on The Blank, which hands you the
  // whole arsenal at once. Both are legal; treating it as a string reports The Blank as unbuilt.
  const starters = Array.isArray(c.starter) ? c.starter : [c.starter]
  const badStart = starters.filter(s => !WEAPONS[s] || !weapons.includes(s))
  add('BUILDING', badStart.length === 0,
    badStart.length
      ? `starter(s) ${badStart.map(s => `'${s}'`).join(', ')} missing from WEAPONS or from the chapter's own pool`
      : `starter ${starters.length === 1 ? `'${starters[0]}'` : `set of ${starters.length}`} resolves and sits in the pool`)
  const flags = [...new Set(roster.flatMap(r => r.flags || []).concat(c.eliteFlags || []))]
  const deadFlags = flags.filter(f => !SIM.includes(`'${f}'`) && !SIM.includes(`"${f}"`))
  add('BUILDING', deadFlags.length === 0,
    deadFlags.length ? `flags sim.js never reads: ${deadFlags.join(', ')}` : `all ${flags.length} behaviour/elite flags are read by sim.js`)
  // A signature is wired if sim.js reads EITHER its `type` string (the `sig.type === 'currents'`
  // idiom) OR any of its payload keys (`signature?.maws`, `signature.pockets`). Checking only the
  // type string is a FALSE POSITIVE FACTORY: The Reef and The Deep are fully simulated through
  // `.pockets` and `.maws` and never branch on their type at all.
  const sig = c.signature
  const sigType = sig && (sig.kind || sig.type)
  const payload = sig ? Object.keys(sig).filter(k => k !== 'kind' && k !== 'type') : []
  const readBy = []
  if (sigType && (SIM.includes(`'${sigType}'`) || SIM.includes(`"${sigType}"`))) readBy.push(`type '${sigType}'`)
  for (const k of payload) if (new RegExp(`(signature|_?sig)\\s*\\??\\.\\s*${k}\\b`).test(WIRING)) readBy.push(`.${k}`)
  add('BUILDING', !sig || readBy.length > 0,
    !sig
      ? 'no signature mechanic (deliberate for an intro chapter)'
      : readBy.length
        ? `signature wired — sim.js reads ${readBy.join(', ')}`
        : `signature '${sigType}' is INERT — sim.js reads neither its type nor any of {${payload.join(', ')}}`)
  add('BUILDING', ...smoke(id))

  // ---- POLISHING: art + copy ----
  // Art (ROSTER_LOOKS entries + cast thumbnails on disk) is already guarded for EVERY chapter by
  // run RA in the suite, so this script defers rather than growing a second implementation.
  const raOk = TESTS.includes('run RA (roster art)')
  add('POLISHING', raOk, raOk ? 'roster art + cast thumbs: deferred to `npm test` run RA' : 'run RA is GONE from the suite — roster art is unguarded')
  const wantFR = [c.name, c.tagline, ...roster.map(r => r.name),
    ...nativeWeapons(id).flatMap(w => [WEAPONS[w] && WEAPONS[w].name, WEAPONS[w] && WEAPONS[w].desc])]
    .filter(s => typeof s === 'string' && s.trim() && /[A-Za-z]{3}/.test(s))
  const missingFR = [...new Set(wantFR.filter(s => !FR[s]))]
  add('POLISHING', missingFR.length === 0,
    missingFR.length
      ? `${missingFR.length} string(s) with no fr.js key: ${missingFR.map(s => JSON.stringify(s.slice(0, 42))).join(', ')}`
      : `all ${wantFR.length} chapter-native strings resolve in fr.js`)
  const twins = Object.entries(CHAPTERS).filter(([o, x]) => o !== id && x.render && c.render && x.render.bgColor === c.render.bgColor)
  add('POLISHING', twins.length === 0,
    twins.length ? `bgColor shared with ${twins.map(t => t[0]).join(', ')} — the render block reads as copy-pasted` : 'render block has a bgColor of its own')
  // Owner sign-offs (2026-08-20). fr.js having a key proves a translation EXISTS, never that it is
  // right — French copy is his call, not a subagent's — and no script can tell a finished animation
  // from a placeholder that happens to render. Publication is the only proof either happened.
  const liveNow = (() => { const b = bookOf(id); return !!b && (b.hidden || b.b.wipFrom === undefined || b.idx < b.b.wipFrom) })()
  add('POLISHING', liveNow, liveNow ? 'fr translations: reviewed (it is live)' : 'awaiting YOUR review of every fr translation — a key existing is not a key being right', true)
  add('POLISHING', liveNow, liveNow ? 'assets + animations: verified (it is live)' : 'awaiting YOUR verification of every asset and animation', true)

  // ---- BALANCING: are the numbers this chapter's own, and were they measured ----
  // The gate is NOT "has a balance block" — The Beyond ships with none on purpose (raw defaults
  // are what make the last chapter the hardest). The gate is that if a block EXISTS it must not
  // be a byte-identical clone of another chapter's, which is the real tell of a chapter that was
  // copy-pasted and never tuned.
  const bal = c.balance
  const balTwin = bal && Object.entries(CHAPTERS).find(([o, x]) => o !== id && x.balance && JSON.stringify(x.balance) === JSON.stringify(bal))
  add('BALANCING', !balTwin,
    !bal
      ? 'no `balance` block — raw defaults (deliberate for a final chapter, suspicious for a new one)'
      : balTwin ? `balance block is byte-identical to ${balTwin[0]} — copy-pasted, not tuned` : `balance block tuned: ${Object.keys(bal).length} knobs`)
  const hits = (TESTS.match(new RegExp(`'${id}'`, 'g')) || []).length
  add('BALANCING', hits >= 5, `${hits} sim-test reference(s) to '${id}'${hits >= 5 ? '' : ' — under 5 means no scenario really plays this chapter'}`)
  // ADVISORY, never a gate. Half the SHIPPED chapters carry no balance_decision comment, so
  // gating on it reports The City as unbalanced — the check would be measuring the comment
  // convention's age, not the chapter's state.
  const decisions = (configSlab(id).match(/balance_decision\s*:/g) || []).length
  add('BALANCING', true, `${decisions} balance_decision comment(s) in its config slab${decisions ? '' : ' (advisory only — plenty of shipped chapters have none)'}`)

  // ---- PLAYTESTING: the repo cannot see hands on a phone ----
  // Publication IS the proof it was played: nothing reaches a player without passing through him.
  // Un-published, this rung is the terminal unknown and the audit stops here on purpose.
  // `hidden` means OUTSIDE the ladder, not unreleased: The Blank is Book 1's boss chapter and is
  // very much shipped. Only wipFrom hides a chapter from players.
  const bkPre = bookOf(id)
  const live = !!bkPre && (bkPre.hidden || bkPre.b.wipFrom === undefined || bkPre.idx < bkPre.b.wipFrom)
  add('PLAYTESTING', live,
    live ? 'implied — it is live, so it went past you' : 'awaiting YOUR hands on a phone', true)

  // ---- PUBLISHED: is it actually reachable by a player ----
  const bk = bookOf(id)
  const gated = bk && !bk.hidden && bk.b.wipFrom !== undefined && bk.idx >= bk.b.wipFrom
  add('PUBLISHED', live,
    !bk
      ? 'in no book — unreachable'
      : gated ? `hidden by BOOKS.${bk.bid}.wipFrom=${bk.b.wipFrom} (this is #${bk.idx})`
        : bk.hidden ? `live: ${bk.bid}'s off-ladder chapter` : `live: ${bk.bid} chapter #${bk.idx + 1}`)

  let stage = 'IDEATING'
  for (const s of LADDER) {
    if (rows.filter(r => r.stage === s).every(r => r.ok)) stage = s
    else break
  }
  return { rows, stage, debt }
}

const ids = process.argv[2] ? [process.argv[2]] : Object.keys(CHAPTERS)
if (ids.length > 1) {
  console.log(`Auditing all ${ids.length} chapters (Object.keys(CHAPTERS) — the honest denominator).\n`)
  const allDebt = []
  // Printed in campaign order, not key order — the mario numbers make key order read as a bug.
  // The SET is still Object.keys(CHAPTERS); only the display order changes.
  const rank = (id) => { const b = bookOf(id); return b ? BOOK_ORDER.indexOf(b.bid) * 100 + (b.hidden ? 99 : b.idx) : 9999 }
  for (const id of [...ids].sort((a, b) => rank(a) - rank(b))) {
    const { stage, rows, debt } = audit(id)
    const firstFail = rows.find(r => !r.ok)
    console.log(`${mario(id).padEnd(4)} ${(CHAPTERS[id].name || id).padEnd(16)} ${stage.padEnd(12)} ${firstFail ? '<- ' + firstFail.msg : ''}`)
    if (debt.length) allDebt.push([id, debt])
  }
  if (allDebt.length) {
    console.log(`\nDEBT — ${allDebt.length} SHIPPED chapter(s) sit below the ideation bar. Not gated (they`)
    console.log('predate it), but this is the backlog if the bar is meant to hold everywhere:')
    for (const [id, d] of allDebt) console.log(`  ${id.padEnd(13)} ${d.join('; ')}`)
  }
  console.log('\nRun with an id for the full ladder: node scripts/chapter-stage.mjs <id>')
} else {
  const id = ids[0]
  const { rows, stage } = audit(id)
  const bk = bookOf(id)
  console.log(`\n${mario(id)}  ${CHAPTERS[id] ? CHAPTERS[id].name : id}  (${bk ? bk.bid : 'no book'})\n`)
  // A pending OWNER gate is not a defect — the audit ran out of evidence, it did not find a
  // fault. So the printout carries on past one to show whether the mechanical work above it is
  // done; only a real FAIL stops the display, because past that point nothing above is meaningful.
  let blocked = false
  for (const s of LADDER) {
    const here = rows.filter(r => r.stage === s)
    if (blocked) { console.log(`  ${s.padEnd(12)} -   not reached`); continue }
    for (const [i, r] of here.entries()) console.log(`  ${(i ? '' : s).padEnd(12)} ${r.ok ? 'ok  ' : r.owner ? 'YOU ' : 'FAIL'} ${r.msg}`)
    if (here.some(r => !r.ok && !r.owner)) blocked = true
  }
  console.log(`\n  => ${id} is ${stage}.`)
  const hardFail = rows.find(r => !r.ok && !r.owner)
  if (hardFail) console.log(`     Blocked on ${hardFail.stage}: ${hardFail.msg}`)
  const waiting = rows.filter(r => !r.ok && r.owner)
  if (waiting.length) console.log(`     Waiting on YOU: ${waiting.map(r => r.msg.replace(/^awaiting YOUR /, '')).join('; ')}`)
  console.log('\n  This proves only what the repo can show. The judgment calls it CANNOT make are')
  console.log('  listed in .claude/skills/verifying-chapter-stage/SKILL.md — read them before you')
  console.log('  call any stage done.\n')
}
