// FIXED-LOADOUT re-run of wreck-threat-spread.mjs (which is itself the adversarial re-run of
// wreck-threat.mjs). Same rig, same 8 seeds, same two movement policies, same immortal/mortal
// split. The ONE change: the level-up policy is no longer applyChoice(run, 0) (index-0, i.e.
// whatever the RNG happened to deal into slot 0 — an uncontrolled loadout that let seed 17072
// take `unstableCores` and own the whole `bomb` row in the spec's §1.1 table).
//
// FIXED POLICY (one sentence): never take an anomaly; among the non-anomaly cards on the screen,
// prefer kind weapon > passive > mod > element, and within a kind take the alphabetically-lowest
// id (mod cards tie-break on weapon id first); fall back to index 0 only when no such card exists
// (i.e. a heal-only screen, the only case buildLevelUpChoices can hand back with zero weapon/
// passive/mod/element cards on it).
//
// Reads against the FROZEN extraction under tmp/base, not the live worktree — src/ is being
// edited by another agent concurrently. Verify HEAD before trusting any number out of this.
const SRC = '../src'
const { createRun, ensureBookMeta, ensureChapterMeta } = await import(`${SRC}/state.js`)
const { stepSim, applyChoice } = await import(`${SRC}/sim.js`)
const { ALL_CHAPTER_IDS, BOOKS } = await import(`${SRC}/config.js`)

const CHAPTER = 'wreck', DURATION = 300, DT = 1 / 60, RUNS = 8, DIFFICULTY = 1

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
function probeMeta() {
  const meta = { schema: 99, coins: 0, runs: 0, lang: 'en', chapters: {}, books: {} }
  for (const b of Object.keys(BOOKS)) ensureBookMeta(meta, b)
  for (const id of ALL_CHAPTER_IDS) { ensureChapterMeta(meta, id); meta.chapters[id].unlocked = true; meta.chapters[id].best = 5 }
  return meta
}
const MOVES = {
  ignore: () => null,
  hunt: (run) => {
    const p = run.player
    let best = null, bd = Infinity
    for (const e of run.enemies) { if (e._dead) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e } }
    return best ? Math.atan2(best.y - p.y, best.x - p.x) : null
  },
}
// id used for the tie-break sort; mod cards sort on their weapon id first so the same weapon's
// mods stay grouped, then on the mod id.
const sortKey = (c) => (c.kind === 'mod' ? `${c.weapon}/${c.id}` : c.id)
const KIND_RANK = { weapon: 0, passive: 1, mod: 2, element: 3 }
function pickFixedChoice(choices) {
  let bestIdx = -1, bestRank = Infinity, bestKey = null
  for (let i = 0; i < choices.length; i++) {
    const c = choices[i]
    const rank = KIND_RANK[c.kind]
    if (rank === undefined) continue // anomaly, heal: never picked here
    const key = sortKey(c)
    if (rank < bestRank || (rank === bestRank && key < bestKey)) { bestRank = rank; bestKey = key; bestIdx = i }
  }
  return bestIdx // -1 => no weapon/passive/mod/element card on this screen (heal-only)
}
function play(moveAt, seed, immortal) {
  const orig = Math.random
  Math.random = mulberry32(seed)
  const run = createRun(probeMeta(), { chapter: CHAPTER, difficulty: DIFFICULTY })
  let heading = 0, steps = 0, orcaPasses = 0, wasCommitting = false, dist = 0, fallbacks = 0, healFallbacks = 0
  let px = run.player.x, py = run.player.y
  for (let t = 0; t < DURATION; t += DT) {
    heading += 0.35 * DT
    const aim = moveAt(run) ?? heading
    stepSim(run, { x: Math.cos(aim), y: Math.sin(aim), skill: false }, DT)
    run.events.length = 0
    if (run.phase === 'levelup') {
      const idx = pickFixedChoice(run.levelUpChoices)
      if (idx === -1) {
        fallbacks++
        if (run.levelUpChoices[0]?.kind === 'heal') healFallbacks++
        applyChoice(run, 0)
      } else {
        applyChoice(run, idx)
      }
      run.phase = 'playing'
    }
    if (immortal) run.player.hp = run.player.maxHP
    const committing = !!(run.orca && run.orca.state === 'committing')
    if (committing && !wasCommitting) orcaPasses++
    wasCommitting = committing
    dist += Math.hypot(run.player.x - px, run.player.y - py); px = run.player.x; py = run.player.y
    steps++
    if (run.phase !== 'playing') break
  }
  Math.random = orig
  const passives = Object.entries(run.passivePicks ?? {}).filter(([, n]) => n > 0).map(([id, n]) => `${id}x${n}`)
  const mods = Object.entries(run.weaponMods ?? {}).flatMap(([w, ms]) =>
    Object.entries(ms).filter(([, n]) => n > 0).map(([id, n]) => `${w}.${id}x${n}`))
  const elements = Object.entries(run.elementPicks ?? {}).filter(([, n]) => n > 0).map(([id, n]) => `${id}x${n}`)
  return { dmg: { ...(run.dmgBySrc ?? {}) }, killedBy: run.killedBy ?? null, secs: steps * DT,
           kills: run.kills, lv: run.level, orcaPasses, dist, fallbacks, healFallbacks,
           anoms: Object.keys(run.anomalies ?? {}).filter((k) => run.anomalies[k]),
           weps: run.weapons.map((w) => `${w.id}${w.level}`), passives, mods, elements }
}
const KEYS = ['orca', 'pool', 'slick', 'starve', 'bomb', 'trap', 'contact', 'unknown']
for (const [mname, moveAt] of Object.entries(MOVES)) {
  for (const immortal of [true, false]) {
    console.log(`\n===== ${mname} / ${immortal ? 'immortal' : 'mortal'} =====  (n=${RUNS} seeds, each printed, FIXED loadout)`)
    console.log(`seed      secs  kills  lv  orcaPass  travelPx  fbk  ` + KEYS.map((k) => k.padStart(7)).join('') + `   killedBy / build`)
    const rows = []
    for (let r = 0; r < RUNS; r++) {
      const seed = 1234 + r * 7919
      const x = play(moveAt, seed, immortal); rows.push(x)
      const other = Object.keys(x.dmg).filter((k) => !KEYS.includes(k))
      console.log(`${String(seed).padEnd(9)} ${x.secs.toFixed(0).padStart(4)}  ${String(x.kills).padStart(5)}  ${String(x.lv).padStart(2)}  ${String(x.orcaPasses).padStart(8)}  ${(x.dist / 1000).toFixed(0).padStart(7)}k  ${String(x.fallbacks).padStart(3)}  ` +
        KEYS.map((k) => (x.dmg[k] ?? 0).toFixed(0).padStart(7)).join('') +
        `   ${x.killedBy ?? (x.secs >= 299 ? 'survived' : '?')}  [${x.weps.join(' ')}] pass:[${x.passives.join(',')}] mod:[${x.mods.join(',')}] elem:[${x.elements.join(',')}]${x.anoms.length ? ' ANOM:' + x.anoms.join(',') : ''}${other.length ? ' +' + other.join(',') : ''}`)
    }
    const sum = (f) => rows.reduce((a, x) => a + f(x), 0)
    const mean = (f) => sum(f) / rows.length
    const sd = (f) => { const m = mean(f); return Math.sqrt(rows.reduce((a, x) => a + (f(x) - m) ** 2, 0) / (rows.length - 1)) }
    const grand = sum((x) => Object.values(x.dmg).reduce((a, b) => a + b, 0)) || 1
    console.log(`MEAN secs ${mean((x) => x.secs).toFixed(0)} (sd ${sd((x) => x.secs).toFixed(0)}, min ${Math.min(...rows.map((x) => x.secs)).toFixed(0)}, max ${Math.max(...rows.map((x) => x.secs)).toFixed(0)})  orcaPasses ${mean((x) => x.orcaPasses).toFixed(2)}  fallbacks-to-idx0 total ${sum((x) => x.fallbacks)} (of which heal-only ${sum((x) => x.healFallbacks)})`)
    for (const k of KEYS) {
      const per = rows.map((x) => x.dmg[k] ?? 0)
      if (!per.some((v) => v > 0)) continue
      console.log(`   ${k.padEnd(8)} mean ${(sum((x) => x.dmg[k] ?? 0) / rows.length).toFixed(0).padStart(5)}  ${((sum((x) => x.dmg[k] ?? 0) / grand) * 100).toFixed(1).padStart(5)}%   per-seed [${per.map((v) => v.toFixed(0)).join(', ')}]`)
    }
  }
}
