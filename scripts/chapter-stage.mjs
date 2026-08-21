#!/usr/bin/env node
// What is LEFT on a chapter? Audits the repo; ignores anybody's claim about it.
// Usage: node scripts/chapter-stage.mjs [chapterId]   (no id = every chapter, one row each)
// Seven independent axes, printed side by side. There is NO ladder and no single stage word —
// see the AXES comment below for why one was removed, and
// .claude/skills/verifying-chapter-stage/SKILL.md for the judgment calls this script cannot make.
import { readFileSync, existsSync } from 'node:fs'
import { CHAPTERS, BOOKS, BOOK_ORDER, WEAPONS, WEAPON_MODS, ANOMALIES, MUTATORS } from '../src/config.js'
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
// Comments count as evidence NOWHERE, including here. The sim-test reference count used to run
// over the raw file, so a chapter could clear the bar on prose alone: 'reef' appears 19 times in
// the suite and 3 of those are comment lines. Same MB.a lesson as the wiring searches above.
const TESTS_CODE = decomment(TESTS)
// The roster-art table, parsed exactly as run RA parses it (entries sit one indent level inside
// the object literal). This replaces a check that read `TESTS.includes('run RA (roster art)')` —
// a string existing in a file, byte-identical for all 15 chapters, which never looked at the
// chapter being audited and never ran the assertion it was named after.
const LOOKS = (() => {
  const RENDER = src('render.js')
  const start = RENDER.indexOf('const ROSTER_LOOKS = {')
  if (start < 0) return null
  const end = RENDER.indexOf('\n  }\n', start)
  if (end < start) return null
  return new Set([...RENDER.slice(start, end).matchAll(/^ {4}(\w+):\s*\{/gm)].map(m => m[1]))
})()

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

// SEVEN INDEPENDENT AXES, DELIBERATELY NOT A LADDER (owner, 2026-08-21).
// This script used to report one word per chapter: the lowest failing rung of a strict ladder.
// Two things were wrong with it. (1) That word could only ever be IDEATING, BUILDING or
// PUBLISHED — every un-published chapter trips a pending owner gate early and stops there, so no
// work-in-progress chapter could report POLISHING or BALANCING however finished it was, and the
// two rungs anybody ever argued about were unreachable labels. (2) It flattened facts that are
// genuinely independent into one, which is the reverse of how the work actually goes here: The
// Reef carries finished art, finished French, a tuned balance block and a shipped terrain field
// while its pool is still three weapons, and reported "IDEATING" for it.
// The bill is the artefact. The word was noise on top of the bill.
const AXES = ['ideation', 'wiring', 'played', 'art', 'fr', 'numbers', 'reachable']

function audit (id) {
  const c = CHAPTERS[id]
  const rows = []
  const add = (axis, ok, msg, owner = false, debt = false) => rows.push({ axis, ok, msg, owner, debt })
  if (!c) return { rows: [{ axis: 'ideation', ok: false, msg: `no CHAPTERS.${id} — idea only` }], debt: [], live: false }

  // `hidden` means OUTSIDE its book's ladder, not unreleased: The Blank is Book 1's boss chapter
  // and is very much shipped. Only wipFrom hides a chapter from players.
  const bk = bookOf(id)
  const live = !!bk && (bk.hidden || bk.b.wipFrom === undefined || bk.idx < bk.b.wipFrom)
  const roster = c.roster || []
  const weapons = c.weapons || []

  // ---- ideation: is the SHAPE of the idea complete ----
  // Owner's bar (2026-08-20): four weapons, four mods on each, an anomaly of its own, a mutator of
  // its own. The bar postdates most of the game — 9 of the 15 shipped chapters sit under it — so
  // for a live chapter the shortfall is recorded as DEBT rather than as a failure. Nothing is
  // gated on it either way now; this column is a backlog, not a verdict.
  add('ideation', true, `CHAPTERS.${id} exists`)
  const debt = []
  const bar = (ok, msg, short) => {
    if (ok) return add('ideation', true, msg)
    if (live) { debt.push(short); add('ideation', true, `${msg} — DEBT (shipped before the bar existed)`, false, true) } else add('ideation', false, msg)
  }
  bar(weapons.length >= 4, `${weapons.length} weapon(s) in the pool${weapons.length >= 4 ? '' : ' — the ideation owes 4'}`, `only ${weapons.length}/4 weapons`)
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
  // Unique = scoped to this chapter and no other. `springtide` lists six Undertow chapters, so it
  // is the book's mutator and none of the six may count it as its own.
  const ownMut = Object.entries(MUTATORS).filter(([, m]) => {
    const ch = m.chapter ?? m.chapters
    const list = Array.isArray(ch) ? ch : (ch === undefined ? [] : [ch])
    return list.length === 1 && list[0] === id
  })
  bar(ownMut.length >= 1,
    ownMut.length ? `${ownMut.length} mutator of its own: ${ownMut.map(m => m[0]).join(', ')}` : 'NO mutator scoped to this chapter ALONE — the ideation owes 1',
    'owes 1 unique mutator')

  // ---- wiring: does it exist, is it read, does it run ----
  add('wiring', roster.length > 0 && weapons.length > 0, `roster ${roster.length}, weapon pool ${weapons.length}`)
  // `starter` is a string on every normal chapter and an ARRAY on The Blank, which hands you the
  // whole arsenal at once. Both are legal; treating it as a string reports The Blank as unbuilt.
  const starters = Array.isArray(c.starter) ? c.starter : [c.starter]
  const badStart = starters.filter(s => !WEAPONS[s] || !weapons.includes(s))
  add('wiring', badStart.length === 0,
    badStart.length
      ? `starter(s) ${badStart.map(s => `'${s}'`).join(', ')} missing from WEAPONS or from the chapter's own pool`
      : `starter ${starters.length === 1 ? `'${starters[0]}'` : `set of ${starters.length}`} resolves and sits in the pool`)
  const flags = [...new Set(roster.flatMap(r => r.flags || []).concat(c.eliteFlags || []))]
  const deadFlags = flags.filter(f => !SIM.includes(`'${f}'`) && !SIM.includes(`"${f}"`))
  add('wiring', deadFlags.length === 0,
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
  add('wiring', !sig || readBy.length > 0,
    !sig
      ? 'no signature mechanic (deliberate for an intro chapter)'
      : readBy.length
        ? `signature wired — sim.js reads ${readBy.join(', ')}`
        : `signature '${sigType}' is INERT — sim.js reads neither its type nor any of {${payload.join(', ')}}`)
  add('wiring', ...smoke(id))

  // ---- played: the repo cannot see hands on a phone ----
  // Publication IS the proof it was played: nothing reaches a player without passing through him.
  // Owner, 2026-08-21: play it before you dress it. This axis is independent of every other one —
  // a chapter that runs can be played the same day, and art and tuning are worth spending only on
  // something that survived that.
  add('played', live, live ? 'implied — it is live, so it went past you' : 'awaiting YOUR hands on a phone', true)

  // ---- art: can this chapter's creatures actually be DRAWN ----
  // Per chapter, not per suite: every roster id and every title-card cast id must have a
  // ROSTER_LOOKS entry, or it renders as a generic archetype blob with nothing to say so.
  const artIds = [...new Set([...roster.map(r => r.id), ...(c.render?.cast ?? [])])]
  const noLook = LOOKS ? artIds.filter(a => !LOOKS.has(a)) : artIds
  add('art', LOOKS !== null && noLook.length === 0,
    LOOKS === null
      ? 'could not parse ROSTER_LOOKS out of render.js — the regex has drifted from the file'
      : noLook.length
        ? `no ROSTER_LOOKS entry for ${noLook.join(', ')} — they render as generic blobs, silently`
        : `all ${artIds.length} roster + cast ids have a baked look`)
  const noThumb = (c.render?.cast ?? []).filter(cid => !existsSync(new URL(`../src/cast/${cid}.png`, import.meta.url)))
  add('art', noThumb.length === 0,
    noThumb.length
      ? `title-card thumb missing: ${noThumb.map(t => `src/cast/${t}.png`).join(', ')} — re-run node scripts/bake-cast.mjs`
      : `${(c.render?.cast ?? []).length} title-card thumb(s) on disk`)
  const twins = Object.entries(CHAPTERS).filter(([o, x]) => o !== id && x.render && c.render && x.render.bgColor === c.render.bgColor)
  add('art', twins.length === 0,
    twins.length ? `bgColor shared with ${twins.map(t => t[0]).join(', ')} — the render block reads as copy-pasted` : 'render block has a bgColor of its own')
  // No script tells a finished animation from a placeholder that happens to render.
  add('art', live, live ? 'assets + animations: verified (it is live)' : 'awaiting YOUR verification of every asset and animation', true)

  // ---- fr: its own copy, in French ----
  // Separate from art on purpose: they move independently, and the fr review is the one gate that
  // can block a chapter for a reason that has nothing to do with whether the game is right.
  const wantFR = [c.name, c.tagline, ...roster.map(r => r.name),
    ...nativeWeapons(id).flatMap(w => [WEAPONS[w] && WEAPONS[w].name, WEAPONS[w] && WEAPONS[w].desc])]
    .filter(s => typeof s === 'string' && s.trim() && /[A-Za-z]{3}/.test(s))
  const missingFR = [...new Set(wantFR.filter(s => !FR[s]))]
  add('fr', missingFR.length === 0,
    missingFR.length
      ? `${missingFR.length} string(s) with no fr.js key: ${missingFR.map(s => JSON.stringify(s.slice(0, 42))).join(', ')}`
      : `all ${wantFR.length} chapter-native strings resolve in fr.js`)
  // A key existing proves a translation EXISTS, never that it is right. French copy is his call.
  add('fr', live, live ? 'translations: reviewed (it is live)' : 'awaiting YOUR review of every fr translation — a key existing is not a key being right', true)

  // ---- numbers: are they this chapter's own ----
  // The gate is NOT "has a balance block" — The Beyond ships with none on purpose (raw defaults
  // are what make the last chapter the hardest). The gate is that if a block EXISTS it must not
  // be a byte-identical clone of another chapter's, which is the real tell of a chapter that was
  // copy-pasted and never tuned. It cannot tell you a number was MEASURED; nothing in the repo
  // can, which is why the skill sends you to the probes.
  const bal = c.balance
  const balTwin = bal && Object.entries(CHAPTERS).find(([o, x]) => o !== id && x.balance && JSON.stringify(x.balance) === JSON.stringify(bal))
  add('numbers', !balTwin,
    !bal
      ? 'no `balance` block — raw defaults (deliberate for a final chapter, suspicious for a new one)'
      : balTwin ? `balance block is byte-identical to ${balTwin[0]} — copy-pasted, not tuned` : `balance block tuned: ${Object.keys(bal).length} knobs`)
  const hits = (TESTS_CODE.match(new RegExp(`'${id}'`, 'g')) || []).length
  add('numbers', hits >= 5, `${hits} sim-test reference(s) to '${id}', comments excluded${hits >= 5 ? '' : ' — under 5 means no scenario really plays this chapter'}`)
  // ADVISORY, never a gate. Half the SHIPPED chapters carry no balance_decision comment, so
  // gating on it reports The City as unbalanced — the check would be measuring the comment
  // convention's age, not the chapter's state.
  const decisions = (configSlab(id).match(/balance_decision\s*:/g) || []).length
  add('numbers', true, `${decisions} balance_decision comment(s) in its config slab${decisions ? '' : ' (advisory only — plenty of shipped chapters have none)'}`)

  // ---- reachable: can a player get to it at all ----
  const gated = bk && !bk.hidden && bk.b.wipFrom !== undefined && bk.idx >= bk.b.wipFrom
  add('reachable', live,
    !bk
      ? 'in no book — unreachable'
      : gated ? `hidden by BOOKS.${bk.bid}.wipFrom=${bk.b.wipFrom} (this is #${bk.idx})`
        : bk.hidden ? `live: ${bk.bid}'s off-ladder chapter` : `live: ${bk.bid} chapter #${bk.idx + 1}`)

  return { rows, debt, live }
}

// One token per axis, same vocabulary in the table and in the machine-readable line, so a
// mutation harness and a human read the same thing. `reachable` answers a different question
// from the rest, so it says live/wip rather than pretending to be a pass or a fail.
function cell (rows, axis) {
  const here = rows.filter(r => r.axis === axis)
  if (!here.length) return '-'
  if (axis === 'reachable') return here[0].ok ? 'live' : 'wip'
  const fails = here.filter(r => !r.ok && !r.owner).length
  const you = here.filter(r => !r.ok && r.owner).length
  const dbt = here.filter(r => r.debt).length
  if (axis === 'ideation') return fails ? `owes${fails}` : dbt ? `debt${dbt}` : 'ok'
  return fails ? 'FAIL' : you ? 'YOU' : 'ok'
}

const W = { ideation: 9, wiring: 7, played: 7, art: 6, fr: 5, numbers: 8, reachable: 5 }

const ids = process.argv[2] ? [process.argv[2]] : Object.keys(CHAPTERS)
if (ids.length > 1) {
  console.log(`\nAuditing all ${ids.length} chapters (Object.keys(CHAPTERS) — the honest denominator).`)
  console.log('Seven independent axes. No ladder: a chapter is routinely drawn before its pool is full.\n')
  console.log(`${''.padEnd(4)} ${'chapter'.padEnd(17)}${AXES.map(a => a.padEnd(W[a])).join('')}`)
  const allDebt = []
  const broken = []
  // Printed in campaign order, not key order — the mario numbers make key order read as a bug.
  // The SET is still Object.keys(CHAPTERS); only the display order changes.
  const rank = (id) => { const b = bookOf(id); return b ? BOOK_ORDER.indexOf(b.bid) * 100 + (b.hidden ? 99 : b.idx) : 9999 }
  for (const id of [...ids].sort((a, b) => rank(a) - rank(b))) {
    const { rows, debt } = audit(id)
    console.log(`${mario(id).padEnd(4)} ${(CHAPTERS[id].name || id).padEnd(17)}${AXES.map(a => cell(rows, a).padEnd(W[a])).join('')}`)
    if (debt.length) allDebt.push([id, debt])
    // ideation and reachable have their own column and their own list below; repeating them here
    // buried the three rows that are actually surprising under sixteen that are not.
    for (const r of rows) if (!r.ok && !r.owner && r.axis !== 'reachable' && r.axis !== 'ideation') broken.push([id, r])
  }
  if (broken.length) {
    console.log(`\nBROKEN — ${broken.length} row(s) the repo can prove, the ideation column aside:`)
    for (const [id, r] of broken) console.log(`  ${id.padEnd(13)} ${r.axis.padEnd(9)} ${r.msg}`)
  }
  if (allDebt.length) {
    console.log(`\nIDEATION DEBT — ${allDebt.length} SHIPPED chapter(s) sit under the four-bar ideation`)
    console.log('rule, which postdates them. This is a backlog, not a set of bugs:')
    for (const [id, d] of allDebt) console.log(`  ${id.padEnd(13)} ${d.join('; ')}`)
  }
  console.log('\nRun with an id for the full bill: node scripts/chapter-stage.mjs <id>\n')
} else {
  const id = ids[0]
  const { rows, debt } = audit(id)
  const bk = bookOf(id)
  console.log(`\n${mario(id)}  ${CHAPTERS[id] ? CHAPTERS[id].name : id}  (${bk ? bk.bid : 'no book'})\n`)
  // Every axis prints, always. Nothing is ever "not reached": an unfinished pool does not make a
  // finished art pass invisible, and pretending otherwise is exactly what the stage word did.
  for (const a of AXES) {
    const here = rows.filter(r => r.axis === a)
    for (const [i, r] of here.entries()) {
      const mark = a === 'reachable' ? (r.ok ? 'live' : 'wip ') : r.debt ? 'debt' : r.ok ? 'ok  ' : r.owner ? 'YOU ' : 'FAIL'
      console.log(`  ${(i ? '' : a).padEnd(10)} ${mark} ${r.msg}`)
    }
  }
  const left = rows.filter(r => !r.ok)
  console.log(`\n  WHAT IS LEFT on ${id}:`)
  if (!left.length && !debt.length) console.log('    nothing the repo can see')
  for (const r of left) console.log(`    - ${r.owner ? 'YOU: ' : `${r.axis}: `}${r.msg.replace(/^awaiting YOUR /, '')}`)
  for (const d of debt) console.log(`    - ideation debt: ${d}`)
  // One greppable line: the mutation harness reads this, and so does anyone asking "where is it".
  console.log(`\n  axes: ${AXES.map(a => `${a}=${cell(rows, a)}`).join(' ')}`)
  console.log('\n  This proves only what the repo can show. The judgment calls it CANNOT make are')
  console.log('  listed in .claude/skills/verifying-chapter-stage/SKILL.md — read them before you')
  console.log('  call any axis done.\n')
}
