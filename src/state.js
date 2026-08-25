// State shapes + persistent meta save/load. No Pixi, no DOM (except localStorage).
import {
  PLAYER, PASSIVES, WEAPON_MODS, ELEMENTS, xpForLevel, mergeMutatorMods,
  difficultyHpMul, difficultyDmgMul, difficultyCoinMul, MAX_DIFFICULTY, CHAPTER_UNLOCK_DIFFICULTY, CHAPTER_ORDER, ALL_CHAPTER_IDS, CHAPTERS,
  chapterMaxDifficulty, resolveChapterId,
  EARLY_CALM, MAX_CHOICE_SLOTS,
  OBSTACLE_FIELD_RADIUS, OBSTACLE_PLACEMENT_ATTEMPTS,
  GRAVITY_WELL_R, GRAVITY_FORCE, GRAVITY_MIN_DIST, GRAVITY_MIN_GAP,
  pickWorldSeed, usesObstacleSeed, TRAWL_FIRST_PASS, ORCA_SHADOW_FIRST, ORCA_SHADOW_PASSES,
  BOOKS, BOOK_ORDER, shopLines, bookOf, isWipChapter, SLOW_BURN_FLOOR, CURRENT_RESIST_FLOOR, unlockLevel, unlockMax,
  lineMax, SACRIFICE_COSTS, BOOK_UNLOCKS, unlockCost, SPUR_TICK } from './config.js'

const SAVE_KEY = 'charming-anomaly-save-v1'

// v6.4.6 save slots: SAVE_SLOTS independent profiles, switchable from the title screen.
// SLOT_PTR_KEY holds which one is active ('1'|'2'|'3', see activeSlot/setActiveSlot). Slot 1 is
// the LEGACY SAVE_KEY unchanged (slotKey below) — every pre-existing save silently becomes slot
// 1 with zero migration code.
export const SAVE_SLOTS = 3
const SLOT_PTR_KEY = 'charming-anomaly-slot'

function slotKey(n) {
  return n === 1 ? SAVE_KEY : `${SAVE_KEY}:${n}`
}

// Active slot number, clamped into [1, SAVE_SLOTS]; defaults to 1 on a missing/invalid pointer
// or a throw (private-mode localStorage), same try/catch idiom as loadMeta/saveMeta below.
export function activeSlot() {
  try {
    const n = parseInt(localStorage.getItem(SLOT_PTR_KEY), 10)
    if (Number.isInteger(n) && n >= 1 && n <= SAVE_SLOTS) return n
  } catch { /* private mode */ }
  return 1
}

// Writes ONLY the slot pointer — never touches save data. The caller (main.js's onSlot hook)
// reloads the page right after, so every module re-reads loadMeta() against the new slot rather
// than reconciling in-memory state (same idiom as onReset).
export function setActiveSlot(n) {
  try { localStorage.setItem(SLOT_PTR_KEY, String(n)) } catch { /* private mode */ }
}

// Display-only peek at slot n for the slot-picker modal — reads its raw save without going
// through loadMeta (no migration, no ensureChapterMeta, no mutation). null when the slot is
// empty or corrupted; otherwise a small summary. A save that predates meta.chapters (pre-v5.0)
// reports unlocked:1 since chapter 1 ('body') is always unlocked.
export function slotSummary(n) {
  try {
    const raw = localStorage.getItem(slotKey(n))
    if (!raw) return null
    const m = JSON.parse(raw)
    const unlocked = m.chapters
      ? CHAPTER_ORDER.filter((id) => m.chapters?.[id]?.unlocked).length
      : 1
    // Number() both normalizes odd shapes and defuses a tampered string coins ("<img onerror=…>")
    // that the slot modal would otherwise interpolate into innerHTML.
    // `name` and `nick` are ADDED, never substituted — the shape asserted by SS.e stays valid.
    // `nick` is here so a NEW SLOT can offer the nickname this device already answered with: the
    // prompt is mandatory and meta is per-slot, so without it a second slot re-blocks the same
    // person and makes them retype a name they have already chosen. Raw, because ui.js runs it
    // through validNick before showing it — state.js must not learn the leaderboard's rules.
    return { coins: Number(m.coins) || 0, unlocked, total: CHAPTER_ORDER.length, name: cleanName(m.name), nick: typeof m.nick === 'string' ? m.nick : '' }
  } catch { return null }
}

// The save's display name (design §4.1) — the FIRST player-authored free text in this codebase, and
// the only value in a save that can arrive from another device. 14 characters, not the 24 an earlier
// draft chose from an abuse ceiling: `.slot-row` has 193.6px of inner width and the line must also
// carry `Slot 2`, `— Current` and a status glyph, which leaves about twelve.
export const NAME_MAX = 14

// Clamped and stripped ON PARSE, never on adopt: the conflict prompt renders the CLOUD's name
// BEFORE adopting it — that is the modal's entire purpose — so an adopt-time clamp would let a 4 KB
// name reach the one screen the player cannot dismiss (§7.2 disables backdrop-tap and Escape).
// Strips C0/C1 control characters, which survive HTML-escaping and can still break a row's layout.
// This is a LAYOUT and legibility clamp, not the injection defence — that is esc() at the render
// site, because escaping is what makes a value safe to interpolate and truncation never is.
export function cleanName(v) {
  // eslint-disable-next-line no-control-regex
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, NAME_MAX) : ''
}

// Per-side data for the conflict prompt's two cards (§4.2), for the local blob and the downloaded
// cloud one alike.
//
// TOTAL BY CONSTRUCTION. It runs on a RAW blob that never went through loadMeta — §3.4 has the
// Worker storing bytes it never parses, so both sides are derived client-side from whatever
// arrives. An earlier draft wrote this as plain property accesses and each one threw on a REALISTIC
// blob: `chapters: {}` is a legitimately fresh save, a missing `shop` is reachable from a truncated
// response with no attacker at all, and `savedAt` is absent on every save not rewritten since the
// upgrade. A throw mid-render leaves the modal half-drawn over the title screen — and §7.2
// deliberately makes that modal undismissable — so the player would have to clear site data,
// destroying all three slots, to get back into the game. Every access is guarded and every numeric
// goes through Number()||0 for that reason, not for tidiness.
export function saveSummary(meta) {
  const m = (meta && typeof meta === 'object' && !Array.isArray(meta)) ? meta : {}
  const chapters = (m.chapters && typeof m.chapters === 'object' && !Array.isArray(m.chapters)) ? m.chapters : {}
  // The same walk as ui.js's furthestUnlockedChapterId, plus the one id it structurally cannot see:
  // The Blank lives OUTSIDE CHAPTER_ORDER (config.js) so no loop over it can reach it, yet it is
  // unambiguously the furthest a save can get. It therefore wins outright when unlocked — which
  // also makes §4.2's "beaten is 5 for beyond when blank is unlocked" exception unreachable by
  // construction, since that override has already moved chapterId off 'beyond'. Left out rather
  // than written as dead code: `beaten` stays each chapter's OWN ladder, exactly as the hero card's
  // ★ row reads it, so the card and the prompt can never state two different numbers.
  let chapterId = CHAPTER_ORDER[0]
  for (const id of CHAPTER_ORDER) if (chapters[id]?.unlocked) chapterId = id
  if (chapters.blank?.unlocked) chapterId = 'blank'
  const entry = (chapters[chapterId] && typeof chapters[chapterId] === 'object') ? chapters[chapterId] : {}
  const shop = (m.shop && typeof m.shop === 'object' && !Array.isArray(m.shop)) ? m.shop : {}
  return {
    name: cleanName(m.name),
    coins: Number(m.coins) || 0,
    // The idiom shopFootHtml's `owned` already uses (ui.js), so the shop's sacrifice meter and the
    // prompt can never disagree about what "upgrades owned" means — with the coercion it is missing,
    // since Object.values of a tampered shop otherwise concatenates into "0<b>X</b>00000000".
    upgrades: Object.values(shop).reduce((s, l) => s + (Number(l) || 0), 0),
    // The best "which of these is my main save?" tiebreaker in the whole blob — better than coins,
    // which run BACKWARDS (§7.1: the more advanced save routinely shows fewer, because coins get spent).
    runs: Number(m.runs) || 0,
    chapterId,
    // The same field and the same fallback as the hero card's ★ row, so the card and the prompt can
    // never state two different numbers. `won` is read directly when present; the `?? maxDifficulty - 1`
    // is the backfill ensureChapterMeta applies on load, repeated here because this function runs on
    // a RAW blob that never passed through it.
    beaten: Math.max(0, Number(entry.won ?? ((Number(entry.maxDifficulty) || 1) - 1)) || 0),
    savedAt: Number(m.savedAt) || 0,
  }
}

// Which slot's key the CURRENT in-memory meta was loaded from/saves to. Set at the top of
// loadMeta(); saveMeta/resetSave fall back to slotKey(activeSlot()) only when nothing has been
// loaded yet. Race guard: after setActiveSlot(n) fires (title's slot-switch button), the page
// hasn't reloaded yet — any save that fires in that window (e.g. an in-flight autosave) must
// still land in the slot the in-memory meta actually came from, never bleed into the new slot.
let boundKey = null
// The same binding as a slot NUMBER, set on the same line of loadMeta. The §3.2 save hook receives
// this rather than boundKey so sync.js never learns the shape of a save key — it compares the number
// against the slot it syncs and ignores everything else.
let boundSlot = null

// ---- Meta shape (persisted save, see loadMeta/saveMeta) — contract, keep in sync ----------
// meta.chapter: selected chapter id (default 'body').
// meta.chapters[id] = { unlocked, maxDifficulty, difficulty, won, best: { time, kills } } — one
//   entry per CHAPTER_ORDER id (config.js), created/repaired by ensureChapterMeta below.
//   difficulty/maxDifficulty here are that chapter's OWN 1..MAX_DIFFICULTY ladder (replaces
//   the pre-v5.0 top-level meta.difficulty/meta.maxDifficulty, which no longer exist).
//   maxDifficulty is floored at 1 but NOT capped on load (R3 — see ensureChapterMeta): a save
//   written by a build that shipped a LONGER ladder keeps its number. Only `difficulty`, the
//   level actually launched, is clamped to what this build can play.
//   won (v6.6.12): the highest difficulty actually BEATEN in that chapter, 0 for none. Distinct
//   from maxDifficulty, which is the highest level UNLOCKED and stops moving once the last one is
//   unlocked — so it can never express "beat the hardest level" and the hero card's final star was
//   unreachable. Stamped by endRun on every classic victory, backfilled from maxDifficulty - 1 on
//   load, floored but never capped (R3). Read by the ★ row (ui.js) and saveSummary's `beaten`.
//   bestRaceTime (v7.x): seconds of the FASTEST completed race, 0 for none — a circuit chapter's
//   score, and the opposite comparison from `best.time` beside it, which is a max. Written only on
//   a circuit victory; stays 0 for every other chapter forever. See ensureChapterMeta for why it is
//   its own field rather than a reused one.
// meta.best: { time, kills } — all-time aggregate across every chapter, unrelated to any
//   single chapters[id].best; still updated by endRun (main.js) on every run.
// meta.nick: the leaderboard name, 3-10 chars, '' until chosen (scores.js owns the rule via
//   validNick). NOT meta.name, which names the save SLOT and never leaves the device. '' is
//   load-bearing: renderTitle shows the mandatory prompt for exactly that value, and endRun
//   submits no score without it.
// meta.coins / meta.shop / meta.choiceSlots / meta.runs: BOOK 1's own purse (v7.x per-book
//   progression) — the fields it has always used, at the top level, UNCHANGED. choiceSlots is
//   floored at 2 and, like maxDifficulty above, NOT capped on load — createRun clamps what this
//   build actually deals (MAX_CHOICE_SLOTS). Untouched by the v4 -> v5 migration below.
// meta.unlocks: book 1's permanent-unlock flags ({ [id]: true }), read the same way as
//   meta.books[id].unlocks below — see bookMeta/ensureBookMeta. Empty today (BOOK_UNLOCKS has no
//   book1 entries yet); it exists so a book-1 unlock, if one ever ships, needs no new field.
// meta.books[bookId] = { coins, shop: {ONE PER shopLines(bookId) id}, choiceSlots, unlocks } —
//   book 2+'s own purse, entirely separate from book 1's above (see bookMeta/ensureBookMeta,
//   config.js's BOOK_ORDER/shopLines/BOOK_UNLOCKS). Absent until a book is actually reached —
//   ensureBookMeta creates it AT ZERO on first use, never as a payout; the coin GRANT on unlocking
//   a book goes through grantBook/unlockBook below. Repaired in place, keyed by id, on every read
//   (R3: a future build's extra shop line or extra book must survive an older build touching this
//   save).
// meta.grants[bookId] = true — the monotone record of the 100-coin welcome (grantBook below).
//   Absent means "never granted", regardless of what the purse currently holds: a purse's
//   existence and balance are NOT proof of a grant (a UI read can create one at 0, a player can
//   spend it to 0), so this is the one fact that decides whether the payout still happens. Set
//   once, in the unlock path only (endRun's book-finale branch in main.js, or loadMeta's
//   retroactive chain below), and never unset.

// meta.schema: save-format version (see SCHEMA below). A brand-new save is stamped with SCHEMA;
//   a save that PREDATES the field is by definition format 1, so loadMeta fills in 1 rather than
//   SCHEMA — an old blob must never be relabelled as this build's format. Nothing reads it yet.
// Migration from a pre-v5.0 (v4) save: detected by the absence of meta.chapters. chapters.body
// absorbs the save's top-level maxDifficulty/difficulty (grandfathered in as chapters.body's
// ladder, unlocked); top-level meta.best is KEPT (still updated by endRun); top-level
// meta.difficulty/meta.maxDifficulty are deleted once migrated.
// v6.4.6 save slots: SAVE_SLOTS independent metas, each its own localStorage key (slotKey), a
// pointer key (SLOT_PTR_KEY) says which is active, slot 1 IS the legacy SAVE_KEY (no migration
// needed for existing saves), and module-level boundKey pins every save fired before the next
// reload to the slot the in-memory meta was actually loaded from (see boundKey's own comment).

// Save-format version written into meta.schema. It lives here and not in config.js because it
// versions the save SHAPE — state.js's job — rather than balance or content, and because the only
// correct way to bump it is together with the loadMeta migration branch that produces the new
// shape: that branch must ALSO stamp `m.schema = SCHEMA`, the way the v4 -> v5 migration rewrites
// the save it upgrades (`??= 1` alone can never produce a 2). Bump ONLY for a change an older
// build genuinely cannot survive — an additive field, a new chapter and a widened range are all
// survivable and must NOT bump it (R2/R3 below).
// Nothing reads SCHEMA yet: the comparison that refuses to adopt a save written by a newer build
// belongs to the cross-device sync module (rule R4, docs/superpowers/specs/2026-08-04-cross-
// device-save-sync-tech-strategy.md §2.4). The field ships AHEAD of its reader on purpose — a
// build already in the wild without it can never be taught to refuse — so neither the constant nor
// the field is dead code to sweep.
export const SCHEMA = 1

// ensureChapterMeta (v5.0): fetches meta.chapters[id], creating it if missing (unlocked only
// for the 'body' chapter — every later chapter starts locked), sanitises that chapter's ladder,
// and fills in a missing best.{time,kills}. Called for every CHAPTER_ORDER id on every loadMeta
// so a save that predates a newly-shipped chapter (or has a corrupted/garbage entry) always
// resolves to a well-formed one. Returns the (mutated, in-place) entry.
//
// R3 — CLAMP ON USE, NEVER ON LOAD (see the tech strategy cited above, §2.4). maxDifficulty is
// floored at 1 and deliberately NOT capped at chapterMaxDifficulty: a save written by a FUTURE
// build that shipped a longer ladder legitimately carries a bigger number, and capping it here
// would hand the smaller value straight to the next saveMeta — silent, permanent progression loss
// for anyone who opens an older build (routine once saves sync between devices). What this build
// can actually PLAY is clamped instead: here for `difficulty` (the level launched), and
// independently at every other consumer — ui.js renders exactly chapterMaxDifficulty(id) pips,
// main.js's onDifficulty and endRun's next-level bump both cap with chapterMaxDifficulty, and
// endRun's unlock bump only ever raises maxDifficulty toward that same cap.
// Number(x) || fallback rather than `?? fallback` (same idiom as loadMeta's v6.6.10 coercion) so a
// tampered non-numeric ladder resolves to 1 instead of NaN — `d > NaN` is false, so a NaN
// maxDifficulty used to leave every difficulty pip reading as unlocked.
export function ensureChapterMeta(meta, id) {
  meta.chapters ??= {}
  const entry = meta.chapters[id] ?? { unlocked: id === 'body', maxDifficulty: 1, difficulty: 1, best: { time: 0, kills: 0 } }
  entry.unlocked ??= id === 'body'
  entry.maxDifficulty = Math.max(1, Number(entry.maxDifficulty) || 1)
  entry.difficulty = Math.max(1, Math.min(chapterMaxDifficulty(id), entry.maxDifficulty, Number(entry.difficulty) || 1))
  // v6.6.12: the highest difficulty actually WON, which the save could not express before. It is not
  // derivable from maxDifficulty: that field is the highest UNLOCKED level and winning the last one
  // has nothing left to unlock, so it stops moving. The hero card's ★ row read `maxDifficulty - 1`,
  // which therefore capped one short — every chapter's final star was unreachable by construction.
  // Backfilled from the old rule, so an existing save keeps exactly the stars it already showed.
  entry.won ??= entry.maxDifficulty - 1
  // R3: floored, never capped. A future build with a longer ladder legitimately stores a bigger
  // number here and capping would hand the smaller value straight to the next saveMeta.
  entry.won = Math.max(0, Number(entry.won) || 0)
  // The one retroactive repair, and it is a widening rather than a clamp so R3 permits it:
  // chapters.blank.unlocked is the save's only genuine "won The Beyond at level 5" fact (endRun's
  // third unlock block), and it predates this field. Applied here rather than at each render site so
  // the hero card and saveSummary cannot state two different numbers.
  if (id === 'beyond' && meta.chapters?.blank?.unlocked) entry.won = Math.max(entry.won, MAX_DIFFICULTY)
  entry.best ??= { time: 0, kills: 0 }
  entry.best.time ??= 0
  entry.best.kills ??= 0
  // A RACE'S BEST IS THE LOWEST, AND IT CANNOT SHARE `best.time`. That field is a MAX written
  // unconditionally by endRun for every chapter — "survived longest" — so on a lap race it records
  // your SLOWEST finish and puts it on the chapter card under the word `best`. A wrong number, not
  // a missing one, which is why this is a fix rather than a feature.
  //   A SEPARATE FIELD RATHER THAN A REPURPOSED ONE, per R2 (meta is additive-only): an older build
  // is always still out there and still writes max() into best.time, and whichever build saves last
  // wins. bestRaceTime is a slot no shipped build touches, so the two can never fight.
  //   0 means "never finished a race here", which is why every read is guarded on `> 0` rather than
  // on the field existing — a chapter that has one races against it, a chapter that does not shows
  // nothing. Flat number, not a `{ time }` object: there is one fact here.
  entry.bestRaceTime = Math.max(0, Number(entry.bestRaceTime) || 0)
  meta.chapters[id] = entry
  return entry
}

export function loadMeta() {
  boundSlot = activeSlot()
  boundKey = slotKey(boundSlot) // v6.4.6: bind this in-memory meta to its slot's key up front
  try {
    const raw = localStorage.getItem(boundKey)
    if (raw) {
      const m = JSON.parse(raw)
      // v6.6.10: coerce every numeric that reaches innerHTML. slotSummary hardened `coins` in
      // v6.4.7 (test SS.g) but loadMeta never did — and loadMeta is what feeds the title coins
      // badge (ui.js), the shop balance (:717) and the reroll button (:1132), so a tampered
      // localStorage value arrived at all three as a raw string. Number()||0 also subsumes the
      // `??= 0` this replaces on shop levels, whose sum is interpolated by shopFootHtml (:560).
      m.coins = Number(m.coins) || 0
      m.runs = Number(m.runs) || 0
      // Book 1's OWN top-level `meta.shop` — never `meta.books[…].shop` — so this reads book 1's
      // line table via shopLines(BOOK_ORDER[0]), same as every other consumer, rather than the
      // universal table directly. Provably identical today (BOOK_SHOP.book1 must not exist — run
      // BP asserts it), but reading the universal table's keys straight would silently stop
      // covering a future book1-specific line while every other call site already had it — the
      // exact hazard run BP's source-text lint exists to catch.
      for (const id of Object.keys(shopLines(BOOK_ORDER[0]))) m.shop[id] = Number(m.shop[id]) || 0
      // v4 -> v5 migration (one-time, detected by the absence of meta.chapters): the top-level
      // difficulty ladder (whatever difficulty/maxDifficulty the save already had — see the
      // v4.10 grandfathering this replaces) becomes chapters.body's ladder, then top-level
      // meta.difficulty/meta.maxDifficulty are removed. Top-level meta.best is an all-time
      // aggregate across every chapter and is KEPT untouched (endRun still updates it).
      if (!m.chapters) {
        m.chapters = { body: { unlocked: true, maxDifficulty: m.maxDifficulty ?? m.difficulty ?? 1, difficulty: m.difficulty ?? 1 } }
        delete m.difficulty
        delete m.maxDifficulty
      }
      m.chapter ??= 'body'
      // ALL_CHAPTER_IDS, not CHAPTER_ORDER: every book's ladder gets an entry, so toggling the WIP
      // gate on needs no migration and cannot produce a chapter with no ledger. Harmless for a
      // player — ensureChapterMeta defaults `unlocked` to `id === 'body'`, so a WIP entry is created
      // locked and nothing on the title reads it unless meta.dev is on.
      // v7.x THE SHELF -> THE TWILIGHT (2026-08-17). The light chapter kept its whole mechanic and
      // moved from slot 2 to slot 5 under a new id, and a NEW chapter took the id `shelf` at slot 2.
      // Without this, the ledger silently MISATTRIBUTES rather than losing anything, which is worse:
      // `chapters.shelf` (five wins, best times) would be read as the murk chapter's, so a
      // never-played chapter shows five gold stars on the bookcase, while `twilight` is created by
      // ensureChapterMeta below as `unlocked: id === 'body'` — i.e. LOCKED, holding none of the
      // progress it actually earned.
      //
      // Runs at most once, guarded on `twilight` being absent, and MOVES rather than copies: the
      // entry belongs to the light, which is now called twilight, and slot 2 is a genuinely new
      // chapter that should start where every new chapter starts. Deleting the old key is safe under
      // R2 (additive-only) because the key is not being removed from the SCHEMA — it is immediately
      // recreated by ensureChapterMeta on the next line, fresh.
      if (m.chapters && m.chapters.shelf && !m.chapters.twilight) {
        m.chapters.twilight = m.chapters.shelf
        delete m.chapters.shelf
      }
      for (const id of ALL_CHAPTER_IDS) ensureChapterMeta(m, id)
      // Retroactive chapter unlocks: a chapter that shipped AFTER the player already beat the
      // previous one at CHAPTER_UNLOCK_DIFFICULTY+ unlocks on load — winning level d raises that
      // chapter's maxDifficulty to d+1, so maxDifficulty > CHAPTER_UNLOCK_DIFFICULTY proves the
      // qualifying win even though endRun couldn't unlock a chapter that didn't exist yet.
      //
      // EVERY BOOK'S LADDER, not CHAPTER_ORDER's. This loop read `CHAPTER_ORDER` (which is
      // BOOKS.book1.chapters) until 2026-08-17, so it had never run for Book 2 at all — a chapter
      // inserted into the middle of the Undertow ladder left a LOCKED rung sitting under an unlocked
      // one, re-openable only by re-beating the chapter before it. Found in adversarial review of
      // the murk-chapter change; the fix is worth more than the change that prompted it.
      for (const book of Object.values(BOOKS)) {
        for (let i = 1; i < book.chapters.length; i++) {
          const prev = m.chapters[book.chapters[i - 1]]
          if (prev?.maxDifficulty > CHAPTER_UNLOCK_DIFFICULTY) m.chapters[book.chapters[i]].unlocked = true
        }
      }
      // R3 (see ensureChapterMeta above): floor only. A future build's higher choiceSlots is kept
      // exactly as stored — clamping it here would persist the smaller number — and createRun
      // clamps what this build actually deals (MAX_CHOICE_SLOTS, config.js). Number()||2 subsumes
      // the `??= 2` this replaces and turns a tampered value into 2 rather than NaN.
      m.choiceSlots = Math.max(2, Number(m.choiceSlots) || 2)
      m.lang ??= 'en' // v6.1 i18n: display language, read once at boot (main.js -> i18n.setLang)
      // Which side of the screen the skill button sits on. 'left' is the right-handed default —
      // see the .skill-btn block in styles.css for why the button goes to the OFF hand.
      m.skillSide = m.skillSide === 'right' ? 'right' : 'left'
      // WIP gate (Book 2). Work-in-progress chapters are hidden from players behind this, and the
      // title's coin badge toggles it with seven taps (ui.js). Coerced to a real boolean rather
      // than `??=`: every gate reads `meta.dev === true`, so a hand-edited or imported save
      // carrying 'yes' or 1 would be truthy everywhere EXCEPT those tests and the flag would
      // disagree with itself. This never reaches sim.js — see the plan's R1.
      m.dev = m.dev === true
      // Scavenger (Book 2): the "kills give back resource" unlock, REMOVED FROM THE GAME in v7.x.
      // The field stays and stays coerced — R2 is additive-only, an older build still writes it, and
      // a save that round-trips through this build must come back out the shape it went in. Nothing
      // reads it for gameplay any more; see BOOK_UNLOCKS (config.js), which is now empty.
      m.lightThief = m.lightThief === true
      // Retroactive BOOK unlock, exactly the same argument as the chapter chain above: a book
      // that shipped AFTER the player already beat the previous book's finale at
      // CHAPTER_UNLOCK_DIFFICULTY+ unlocks on load, because endRun could not unlock a book that
      // did not exist yet. Without this, every veteran is locked out of Book 2 permanently —
      // including everyone holding The Blank, which requires a Beyond win at 5. unlockBook still
      // refuses a WIP book unless meta.dev is on (its own gate, read here already coerced above),
      // so a real player sees and gets nothing until Book 2 actually ships.
      for (let i = 1; i < BOOK_ORDER.length; i++) {
        const prevFinale = BOOKS[BOOK_ORDER[i - 1]].chapters.at(-1)
        const prev = m.chapters?.[prevFinale]
        const beat = Math.max(Number(prev?.won) || 0, (Number(prev?.maxDifficulty) || 1) - 1)
        if (beat >= CHAPTER_UNLOCK_DIFFICULTY) unlockBook(m, BOOK_ORDER[i])
      }
      // meta.lightThief (Book 1-shaped legacy) copies forward ONCE into bookMeta(m,'undertow')
      // .unlocks.lightThief. BOTH ARE DEAD DATA since Scavenger was removed — no reader is left —
      // and the copy stays anyway, because R2 makes this migration part of the save's shape: an
      // older build still writes the old field, and dropping the forward-copy now would mean a save
      // that survived a downgrade-then-upgrade comes back a different shape than one that did not.
      // Never deletes the old field, and never writes back the other way: copy only when the new
      // location is UNSET, so a value already written there is never clobbered.
      if (m.lightThief === true) {
        const ut = ensureBookMeta(m, 'undertow')
        if (ut.unlocks.lightThief === undefined) ut.unlocks.lightThief = true
      }
      m.schema ??= 1 // R4: absent means written BEFORE the field existed, so it IS format 1 (not SCHEMA)
      // Both additive, both `??=` repairs, so an older build round-trips a newer save untouched.
      // Deliberately NOT baked to an English default like 'Save 1': the i18n contract (v6.1) is that
      // English source strings ARE the French dictionary's keys and translation happens at render
      // time, so a name written into the blob on a French device would be a stale English literal
      // travelling to every other device forever. An empty string has no language, and ui.js renders
      // the numbered fallback.
      m.name ??= ''
      m.savedAt ??= 0 // stamped by saveMeta below; 0 means "never written by a build that had this field"
      // Leaderboard nickname (v7.x). Additive per R2, and NOT the same thing as `name`, which names
      // the save slot: `name` is private to the device, `nick` is what other players read on the
      // podium. An empty string means "never chosen", which is what makes the first-load prompt
      // fire — so it must not be repaired into a placeholder here.
      m.nick ??= ''
      return m
    }
  } catch (e) {
    // Corrupted save -> fresh, but never SILENTLY: a hand-built probe meta missing `shop` throws
    // here (the repair above writes into it), and the old bare catch turned that into a title
    // screen at difficulty 1 in English with no clue why. Prod behaviour is unchanged.
    console.warn('[loadMeta] save unreadable, starting fresh:', e?.message)
  }
  const fresh = {
    coins: 0,
    shop: Object.fromEntries(Object.keys(shopLines(BOOK_ORDER[0])).map((id) => [id, 0])), // book 1's own field — see the loadMeta repair above
    best: { time: 0, kills: 0 },
    runs: 0,
    choiceSlots: 2,
    chapter: 'body',
    chapters: {},
    lang: 'en', // v6.1 i18n (see the loadMeta migration above)
    skillSide: 'left', // right-handed default (see the loadMeta migration above)
    // WIP gate, off for every real player (see the loadMeta migration above). It is ALSO the
    // leaderboard's integrity rule: endRun (main.js) submits no score from a run played with this
    // on, because unlocking unfinished chapters and opening the dev card list are the same switch.
    dev: false,
    lightThief: false, // dead since v7.x (Scavenger removed); kept per R2 — see the migration above
    schema: SCHEMA, // R4: a brand-new save really IS this build's format (loadMeta's repair says 1)
    // loadMeta's repairs are IN-MEMORY ONLY and never written back, so a save that has not been
    // re-saved since the upgrade has no `name`/`savedAt` key ON DISK — and §3.2 pushes exportSlot,
    // "exactly what is on disk". Hence the defaults live in this literal too, and saveSummary
    // tolerates both being absent.
    name: '',
    savedAt: 0,
    nick: '', // leaderboard name; '' is "never chosen" and fires the first-load prompt (see above)
  }
  for (const id of ALL_CHAPTER_IDS) ensureChapterMeta(fresh, id)  // see the loadMeta sweep above
  return fresh
}

// --- sync seam (design §3.2). Everything below is inert until sync.js installs a hook. ---

// The observer that tells sync.js a save happened. There are eight saveMeta call sites in main.js;
// adding a push line to each is eight edits a ninth call site would silently skip, so saveMeta
// announces instead — the same shape as the sim/main event contract that already runs this codebase.
// It is a NUDGE, not the truth: it says "re-evaluate", never "this needs pushing". §6.2 derives that
// from the save's content hash precisely so a write the hook never announced (a second tab, an old
// cached bundle serving the previous build, a future call site) cannot go unnoticed.
let saveHook = null
export function setSaveHook(fn) { saveHook = fn }

// One-way latch, taken immediately before an adopt commits (§3.3). location.reload() QUEUES a
// navigation — it does not stop script execution, and this repo has no beforeunload/pagehide/unload
// handler anywhere, so live handlers keep firing for tens to hundreds of ms afterwards. The chapter
// carousel's settle() alone fires from its own 130ms setTimeout with no new tap required, and it
// calls saveMeta with the STALE in-memory meta — writing the pre-adopt save straight over the blob
// we just adopted, and then announcing that write to sync. Never unlatched: the only exit is the
// reload that is already on its way.
let frozen = false
export function freezeSaves() { frozen = true }

export function saveMeta(meta) {
  if (frozen) return
  let ok = false
  // The device's own clock, stamped on every write and shown to the human — NEVER used to order two
  // saves. Ordering is the generation counter's job, always (§6.2): clock skew between a phone and a
  // laptop is normal, and a sync design that resolves conflicts by comparing wall clocks loses a
  // session whenever a device's clock is wrong. Stamped BEFORE stringify so what lands on disk is
  // what the push uploads.
  meta.savedAt = Date.now()
  try {
    localStorage.setItem(boundKey ?? slotKey(activeSlot()), JSON.stringify(meta))
    ok = true
  } catch { /* private mode */ }
  // Only on a successful write: a device whose localStorage is refusing writes must never upload
  // state it is about to forget. Wrapped in its own catch because saveMeta is called by endRun from
  // inside the Pixi ticker (main.js), and Pixi does not catch listener exceptions — a throwing hook
  // would take down the frame loop in the one path that has just banked a run's coins. Two catches,
  // so a storage failure stays distinguishable from a sync failure.
  if (ok) { try { saveHook?.(boundSlot ?? activeSlot()) } catch { /* sync is best-effort */ } }
}

// The raw accessors sync.js needs. It reaches slots ONLY through these and never constructs a save
// key itself, which is what keeps key construction entirely inside state.js.

// What gets pushed — the bytes on disk, not JSON.stringify(meta) of the live in-memory object,
// which may have been mutated since the last save. What we promise the cloud is what is stored.
export function exportSlot(n) {
  try { return localStorage.getItem(slotKey(n)) } catch { return null }
}

// Validates SHAPE, not syntax, then writes. Returns true if it wrote, false if it refused.
// A parse check alone does not prevent the wipe this exists to prevent: loadMeta recovers to a
// FRESH SAVE, silently, via its `catch { /* corrupted save -> fresh */ }`, for any blob whose shape
// it does not expect — and `{}`, `null`, `{"coins":5,"chapters":{}}` (no shop key) and
// `{"coins":5,"shop":"x"}` are all valid JSON that wipe the slot. The mechanism is loadMeta's
// `for (const id of Object.keys(shopLines(BOOK_ORDER[0]))) …` throwing a TypeError when `shop` is
// absent or not an object, and the catch swallowing it. Reachable with no attacker at all: a truncated response
// body, or a blob written by a build that changed the shape. A refused import is reported to the
// player, never silent (§8).
export function importSlot(n, json) {
  let m
  try { m = JSON.parse(json) } catch { return false }
  if (typeof m !== 'object' || m === null || Array.isArray(m)) return false
  if (typeof m.shop !== 'object' || m.shop === null || Array.isArray(m.shop)) return false
  if (m.chapters != null && (typeof m.chapters !== 'object' || Array.isArray(m.chapters))) return false
  try { localStorage.setItem(slotKey(n), json); return true } catch { return false }
}

// Renames a slot that is NOT the one currently loaded, by patching its raw blob in place. The
// active slot never comes through here — main.js sets meta.name and calls saveMeta instead, because
// a disk patch would be overwritten by the very next save from the live in-memory object.
// Returns false for an empty or unreadable slot, which is also why ui.js hides ✏️ on empty rows:
// there is no save to name yet. Deliberately does NOT touch savedAt — that stamp means "this device
// played this save", and naming another slot from the title screen is not a session.
export function setSlotName(n, name) {
  try {
    const raw = localStorage.getItem(slotKey(n))
    if (!raw) return false
    const m = JSON.parse(raw)
    if (typeof m !== 'object' || m === null || Array.isArray(m)) return false
    m.name = cleanName(name)
    localStorage.setItem(slotKey(n), JSON.stringify(m))
    return true
  } catch { return false }
}

// Erases slot n outright (the slots sheet's delete button). resetSave's per-slot sibling, and the
// reason it is a second function rather than an argument: resetSave writes through `boundKey` — the
// key loadMeta actually read — so it can only ever erase the slot being PLAYED. This one takes the
// number, which is what a row in the picker has.
export function deleteSlot(n) {
  try { localStorage.removeItem(slotKey(n)); return true } catch { return false }
}

// Full new-game wipe (shop's "Reset all progress" button, see hooks.onReset in main.js) —
// erases the save outright; the caller is expected to reload the page right after.
export function resetSave() {
  try { localStorage.removeItem(boundKey ?? slotKey(activeSlot())) } catch { /* private mode */ }
}

// The one place that knows where a book's progression lives. Book 1's purse is the top-level
// meta.coins/meta.shop/meta.choiceSlots it has always used — NOT moved, because R2 forbids
// deleting a field an older build reads (see the spec's revision history: rev 1 moved them and
// wiped every save that a pre-change bundle touched). Books 2+ nest under meta.books.
//
// It returns `meta` itself for book 1, which is mildly leaky — a caller could reach bm.runs —
// and that leak is the entire price of never migrating anything.
export const bookMeta = (meta, bookId) =>
  bookId === BOOK_ORDER[0] ? meta : (meta.books?.[bookId] ?? null)

// Creates and repairs, mirroring ensureChapterMeta — but note it is NOT swept over every book on
// load, and it NEVER grants coins. The 100-coin grant is an explicit, monotone act of the unlock
// path (main.js); tying it to creation makes every accidental read a payout.
// Repairs IN PLACE, keyed by id: rebuilding the map would delete a future build's book or line
// (R3 — clamp on use, never on load).
export function ensureBookMeta(meta, bookId) {
  if (bookId === BOOK_ORDER[0]) {
    meta.unlocks ??= {}
    return meta
  }
  // ??= does not fire for a non-nullish non-object (e.g. a tampered/foreign blob's `books: 5`),
  // and the next line would then assign a property onto a primitive — a TypeError, thrown inside
  // loadMeta's own `catch { corrupted save -> fresh }` (WIPING the whole save, not just books).
  // No shipped writer produces this shape, but importSlot validates shop+chapters and NOT this
  // field, so a synced foreign/tampered blob reaches here untouched. Mirrors the same hardening
  // already applied to entry.shop/.unlocks three lines below.
  if (!meta.books || typeof meta.books !== 'object' || Array.isArray(meta.books)) meta.books = {}
  const entry = (meta.books[bookId] ??= { coins: 0, shop: {}, choiceSlots: 2, unlocks: {} })
  entry.coins = Number(entry.coins) || 0
  entry.shop = (entry.shop && typeof entry.shop === 'object' && !Array.isArray(entry.shop)) ? entry.shop : {}
  for (const id of Object.keys(shopLines(bookId))) entry.shop[id] = Number(entry.shop[id]) || 0
  entry.choiceSlots = Math.max(2, Number(entry.choiceSlots) || 2)
  entry.unlocks = (entry.unlocks && typeof entry.unlocks === 'object' && !Array.isArray(entry.unlocks)) ? entry.unlocks : {}
  return entry
}

// The 100-coin welcome, recorded rather than inferred. meta.grants[bookId] is monotone and
// additive: it survives the purse being spent, rebuilt, or created early by an incidental read.
// Returns true only on the payout, so callers can gate the announcement on the grant itself.
export function grantBook(meta, bookId) {
  // Same hazard and same fix as ensureBookMeta's meta.books guard above: ??= does not fire for a
  // non-nullish non-object, so a tampered/foreign `grants: "x"` would otherwise throw on the next
  // line, inside loadMeta's save-wipe catch.
  if (!meta.grants || typeof meta.grants !== 'object' || Array.isArray(meta.grants)) meta.grants = {}
  if (meta.grants[bookId]) return false
  const amount = BOOKS[bookId]?.startCoins ?? 0
  meta.grants[bookId] = true
  if (amount > 0) ensureBookMeta(meta, bookId).coins += amount
  return true
}

// Unlock a book: its first chapter, plus the grant. Idempotent. Refuses a book whose FIRST chapter
// is still WIP unless the save is a dev save — which is what kept Book 2 invisible until it shipped.
//
// The gate asks about the first chapter rather than the book because `wipFrom` is per chapter now
// (config.js): a book is openable the moment its opener is written, and the chapters below it stay
// gated on their own. Testing the book as a whole would have kept Undertow shut with The Surf live.
export function unlockBook(meta, bookId) {
  // Exported — a bookId absent from BOOKS must refuse rather than throw reading .chapters off
  // undefined. Optional-chain all the way to the element, and let the falsy `first` be the refusal.
  const first = BOOKS[bookId]?.chapters?.[0]
  if (!bookId || !first) return false
  if (isWipChapter(first) && meta.dev !== true) return false
  const chMeta = ensureChapterMeta(meta, first)
  const granted = grantBook(meta, bookId)
  if (chMeta.unlocked && !granted) return false
  chMeta.unlocked = true
  return true
}

// Effective permanent multipliers/bonuses from ONE BOOK's shop levels. The book id is passed
// explicitly rather than stashed on the entry: bookMeta returns `meta` itself for book 1, so a
// `_bookId` field would be written onto the save blob.
// CLAMPS TO lineMax ON USE, NEVER ON LOAD (R3). A line's level cap can FALL — Book 2's three bar
// lines went 10 -> 5 in v7.x — and a save holding the old count must keep its number on disk (an
// older build still reads it, and a future build may raise the cap back) while this build pays out
// only what it sells today. Without the clamp a legacy 10 of deepLungs reads as +120%.
export function shopLevel(bm, id) {
  return Math.min(lineMax(id), Math.max(0, Number(bm.shop?.[id]) || 0))
}
function shopBonus(bm, bookId, id) {
  return (shopLines(bookId)[id]?.perLevel ?? 0) * shopLevel(bm, id)
}

// How far through ONE BOOK's permanent upgrades a save is, counted in UPGRADE LEVELS: every level of
// every line is one unit, so a line is worth its own depth. Summed through lineMax rather than the
// global cap, so a line selling 5 contributes 5 — counting every line at MAX_SHOP_LEVEL prints a
// denominator the player can never reach, and 100% would stop meaning "spent out".
//
// SACRIFICES COUNT ON BOTH SIDES. They are bought with shop LEVELS rather than coins — which makes
// them upgrades you buy like any other, so they belong in `total` — and crediting only `total` would
// be worse than leaving them out: buying the 3rd card slot deletes 20 levels out of bm.shop, so the
// meter would run BACKWARDS at the exact moment the player made progress. Credited both sides it is
// monotone, and 100% means the book is spent out: every line maxed, both card slots, every rung of
// every BOOK_UNLOCKS ladder.
//
// Lives here rather than in ui.js because it is a number derived from a bm and the config tables,
// like shopBonus above — and because ui.js is not importable by the test suite, so the arithmetic
// would have had no guard at all.
export function bookProgress(bm, bookId) {
  // `owned` clamps per line for the same reason shopBonus does: a legacy save holding 10 of a line
  // that now sells 5 would otherwise credit levels the denominator does not count, and the meter
  // would read over 100%.
  let owned = Object.entries(bm?.shop ?? {})
    .reduce((sum, [id, l]) => sum + Math.min(lineMax(id), Math.max(0, Number(l) || 0)), 0)
  let total = Object.keys(shopLines(bookId)).reduce((sum, id) => sum + lineMax(id), 0)
  // choiceSlots counts slots OWNED and starts at 2, so slots - 2 is how many rungs are paid for.
  // Needs no clamp at either end and had one until a mutation test proved it dead: the forEach below
  // bounds `i` to the ladder, so a tampered slot count credits nothing extra, and a negative makes
  // `i < slotsPaid` false for every rung. `|| 2` is what keeps a junk value out, not the arithmetic.
  const slotsPaid = (Number(bm?.choiceSlots) || 2) - 2
  SACRIFICE_COSTS.forEach((cost, i) => { total += cost; if (i < slotsPaid) owned += cost })
  for (const id of Object.keys(BOOK_UNLOCKS[bookId] ?? {})) {
    const paid = unlockLevel(bm, bookId, id)   // resolves the legacy `true` to the top rung
    for (let i = 0; i < unlockMax(bookId, id); i++) {
      const cost = unlockCost(bookId, id, i) ?? 0
      total += cost
      if (i < paid) owned += cost
    }
  }
  return { owned, total, pct: total > 0 ? Math.round((owned / total) * 100) : 0 }
}

// Obstacles STREAM around the player (v5.6.13, sim.js streamObstacles) instead of being
// rejection-sampled once here — the old origin field left everything beyond
// OBSTACLE_FIELD_RADIUS obstacle-free. createRun only rolls the run's obstacle seed: an unseeded
// Math.random here keeps the old run-to-run variety contract, while every cell WITHIN a run hashes
// deterministically off this seed (no RNG stream consumed at step time — seeded tests stay
// stable). A null seed disables streaming entirely; tests that blank run.obstacles set it null.

// Shared rejection sampler for v5.4 fixed-radius signature fields seeded ONCE at createRun:
// run.wells (below) — run.traps used to be one too (generateTraps) until v6.5 moved traps to
// sim.js's streamTraps, the same cell-hash streaming idiom obstacles/eddies use, so the field
// never goes dead as a run walks away from the origin. `count` centers of radius `r`, each at a
// random angle and a distance in [minDist, OBSTACLE_FIELD_RADIUS] from the run's origin, rejected
// if it comes within minGap (edge-to-edge) of one already placed. Unseeded-Math.random, give-up-
// per-entry — placement is never something sim.js depends on being deterministic. (These stay
// origin-seeded setpieces, unlike obstacles, which stream — a signature field is the arena's
// opening hand, not terrain.) Unlike obstacles these fields don't block movement, so they're only
// spaced against THEMSELVES (a well under a root is fine); one field never checks against another.
function scatterField(count, r, minDist, minGap) {
  const out = []
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < OBSTACLE_PLACEMENT_ATTEMPTS; attempt++) {
      const angle = Math.random() * Math.PI * 2
      const dist = minDist + Math.random() * Math.max(0, OBSTACLE_FIELD_RADIUS - minDist)
      const x = Math.cos(angle) * dist
      const y = Math.sin(angle) * dist
      const clear = out.every((o) => Math.hypot(x - o.x, y - o.y) - r - r >= minGap)
      if (clear) { out.push({ x, y }); break }
    }
  }
  return out
}

// Gravity wells (v5.4 beyond 'gravity' signature, see run.wells below): seeded once here from
// CHAPTERS[chapter].signature.wells. Any chapter whose signature isn't 'gravity' yields [].
function generateWells(sig) {
  if (!sig || sig.type !== 'gravity' || !sig.wells) return []
  return scatterField(sig.wells, GRAVITY_WELL_R, GRAVITY_MIN_DIST, GRAVITY_MIN_GAP)
    .map(({ x, y }) => ({ x, y, r: GRAVITY_WELL_R, g: GRAVITY_FORCE }))
}

/**
 * Run state — the single mutable object the whole game shares each run.
 *
 * chapter (v5.0): the run's CHAPTERS id (config.js), snapshotted at createRun (opts.chapter,
 *   default 'body') and constant for the run's duration. Picks the starting weapon
 *   (CHAPTERS[chapter].starter — an ARRAY there, as The Blank has, means one is rolled per
 *   run) and scopes sim.js's level-up weapon pool
 *   (weaponCandidates/buildLevelUpChoices) to CHAPTERS[chapter].weapons — other chapters'
 *   natives never appear as offers, though nothing stops a weapon id from being pushed onto
 *   run.weapons directly (e.g. tests) and stepping normally; only the OFFER pool is scoped.
 *   Weapon mods (WEAPON_MODS) and elements stay global systems, unscoped by chapter.
 * starterId (v7.x): the weapon id this run began on — the ROLLED one on a chapter whose
 *   `starter` is an array (The Blank), and simply that chapter's fixed starter otherwise.
 *   Constant for the run. Read by main.js when it submits a score, so a podium row on a
 *   rolled-starter chapter can say which weapon the record was set with.
 * phase: 'playing' | 'levelup' | 'paused' | 'dead' | 'victory'
 * skin (v7.x): 'cheeks' | null — a COSMETIC, snapshotted from this book's shop at createRun.
 *   sim.js never reads it. render.js latches it in reset() beside playerForm and picks the
 *   cheeks bake instead of the face for whichever body the chapter uses (blob, fish or kaiju);
 *   the bakes are built in PAIRS at boot rather than branched at bake time, because the shop sits
 *   between RUNS and not between page loads.
 *
 * deathT (v7.x): seconds ELAPSED in the DEATH OUTRO — the beat between the killing blow and the
 *   summary screen (DEATH_OUTRO in config.js). OWNED BY main.js, NOT BY THE SIM: sim.js never reads
 *   or writes it, and stepSim does not run while it is counting (phase is already 'dead'). It is on
 *   `run` rather than being main.js-local for exactly one reason — render.js needs the outro's
 *   progress to draw it, and a second timer inside render.js would be the same fact in two files.
 *   0 for every run that has not died, and stays 0 for a chapter with no outro (Book 1), which is
 *   what makes the old instant-modal path the untouched default.
 *   ELAPSED RATHER THAN REMAINING, and the distinction is a bug fix rather than a style choice: a
 *   remaining-time clock must reach 0 to be finished, 0 is also the "not dying" value every other
 *   run carries, and the renderer therefore cleared the whole effect on the last frame — the summary
 *   opened over a fully-lit world, defeating the half of the outro that exists to cover that
 *   handoff. Counting up, the value passes DEATH_OUTRO.time and simply STAYS there, so render.js's
 *   progress saturates at 1 and the dark holds until the next run. Nothing resets it mid-run;
 *   createRun's 0 and render.js's clearWorld are the whole lifecycle.
 * killedBy (v7.x): the `src` label of the FATAL hit (see the hurt event's src below), or null while
 *   alive. Written once, in hurtPlayer, on the branch that sets phase 'dead' — so a revive does not
 *   set it, and the field cannot be overwritten by anything landing later in the same frame.
 * dmgBySrc (v7.x): { [src]: hpTotal } tally of damage that actually LANDED on the player, keyed by
 *   the same labels. Post-mitigation and post-cap (the value added is hurtPlayer's own `dmg`, not
 *   its `rawDmg`), so this is HP the player really lost and the shares on the summary screen add up
 *   to what the run's health bar actually did. Overheal is impossible here — unlike the enemy-side
 *   `hit` event, which credits overkill in full and is the reason weapon-census diffs hp instead
 *   (see CLAUDE.md). Damage prevented by RAMPAGE invulnerability is not tallied because it never
 *   happened: hurtPlayer returns before this line.
 * events: drained by main.js every frame. Event shapes:
 *   { type:'hit', x, y, dmg, crit }          weapon damaged an enemy
 *   { type:'kill', x, y, elite, etype }      enemy died
 *   { type:'shoot', weapon }                 weapon fired ('star' | 'wave'; orbit is continuous)
 *   { type:'gem', x, y }                     xp gem collected
 *   { type:'coin', x, y, value, healed? }    coin collected (healed=true when the AVARICE
 *                                            anomaly converted it to HP instead of paying —
 *                                            render tints the sparkle, see pickupSparkle)
 *   { type:'levelup' }                       player leveled (run.levelUpChoices is set, phase='levelup')
 *   { type:'submission', x, y, elite:true }  SUBMISSION anomaly: an elite you just killed got back
 *                                            up as YOURS (turnDeadElites, end of frame). The
 *                                            ordinary {type:'kill'} fires too, one statement
 *                                            earlier — the elite really does die first, and that
 *                                            is what keeps pool-probe's elite counter working.
 *                                            The loan ENDING reuses {type:'explode'} rather than a
 *                                            bespoke event, so it needs no new render or sfx case.
 *   { type:'hurt', dmg, dot?, src? }         player took damage (dot=true for pool/DoT ticks —
 *                                            see run.pools below and hurtPlayer in sim.js; absent/
 *                                            false for ordinary contact damage and bomb blasts).
 *                                            src (v7.2) names WHAT DID THIS. Originally for the
 *                                            renderer alone (a self-inflicted cost must not look
 *                                            like being hit): 'overload' is a scheduled drain ~150x
 *                                            a run, so render damps it to a faint vignette instead
 *                                            of the full shake-and-flash, which would otherwise
 *                                            strobe for the whole run. 'bloodMoney' is a reroll
 *                                            purchase and is NOT damped — one deliberate press
 *                                            should land like a hit.
 *                                            v7.x: now populated by EVERY caller, because the same
 *                                            label is what run.dmgBySrc/run.killedBy tally (below).
 *                                            An enemy source is that enemy's ROSTER id ('searoach' —
 *                                            lower case, the ids are not camelCased), falling back to
 *                                            e.TYPE for a spawn that found no roster entry, which is
 *                                            ARCHETYPE_TYPE's value and so 'drone'|'wisp'|'tank' and
 *                                            NOT the archetype names 'normal'|'fast'|'tank'. (Every
 *                                            chapter roster covers every archetype today, so that
 *                                            fallback is unreachable — run DA.h holds it that way.)
 *                                            Every other source is a hazard/cost id ('drown', 'trap',
 *                                            'traffic', 'mower', 'erase', …) resolved to copy by
 *                                            DMG_SRC_NAME. The same label also picks the summary's
 *                                            THUMBNAIL, via dmgSrcArt -> src/cast/<id>.png; a source
 *                                            with no picture must say why in DMG_SRC_NO_ART.
 *   { type:'revive', x, y }                  player death was prevented (see hurtPlayer in
 *                                            sim.js and run.revives below) — render draws a
 *                                            burst at (x,y), main.js plays a sfx
 *   { type:'dead' } / { type:'victory' }     run ended (phase already set)
 *
 * _spawnQueue[i]: an enemy built DURING a step and held back until the next one begins (sim.js
 *   flushSpawns, called at the top of stepSim). Only the `split` flag fills it today. It exists
 *   because 63 loops in sim.js walk run.enemies with for...of while dealing damage, and for...of
 *   re-reads the array's length every iteration — so anything appended mid-loop is visited by that
 *   same loop. A splitter's children were therefore struck by the cast that killed their parent:
 *   measured at 495 of 657 children over 3 seeded 300s Twilight runs, with 378 of 526 child deaths
 *   landing in the birth frame. Anything else that ever spawns an enemy mid-step belongs here too.
 *
 * enemies[i]: { id, type, x, y, hp, maxHP, radius, speed, dmg, elite, xp,
 *               hitFlash (s remaining), orbCd (s until orbit can hit again), kb: {x,y} knockback velocity,
 *               holePull: 0..1 vortex suction strength this frame (0 = unaffected, 1 = at a black
 *               hole's core); set by stepHoles each frame an enemy is inside a hole's radius, decays
 *               back to 0 over time otherwise. Render can use it to squash/shrink sprites being sucked in.
 *               _holeLook: which KIND of hole last had hold of it — the `look` of that run.holes
 *               entry ('downwash' for The Shelf's water column, null for the Black Hole). Written
 *               beside holePull and read only by contactHarmless, which disarms a body a water
 *               column is ragdolling. Sim-internal (underscore): the tell is holePull, which render
 *               already reads.
 *
 *               affixes: array of ELITE_AFFIXES ids (see config.js) — present ONLY on elites;
 *               non-elites always carry affixes: [] (harmless to check unconditionally, but
 *               sim.js still guards elite-only affix logic behind `e.elite &&` first for cost).
 *               Elites roll 1 random affix at spawn, 2 distinct ones once run.time >=
 *               AFFIX_SECOND_AT. `anchored` is never in that roll: it is layered on top at
 *               ANCHORED_CHANCE, so ~half of elites carry it as well as their rolled affix(es). Render/shield contract: draw a shield bubble while `affixes`
 *               includes 'shielded' AND `hp > maxHP * SHIELD_HP_FRAC` (the shield "breaks" once
 *               hp drops under that fraction, matching the reduced-damage window in sim.js).
 *
 *               flags (v5.0, see CHAPTERS[chapter].roster/eliteFlags in config.js): array of
 *               chapter-agnostic behavior-flag ids, set once at spawn by spawnEnemy (sim.js) —
 *               ARCHETYPE_TYPE maps the roster entry matching this enemy's spawn type (drone/
 *               wisp/tank) to an archetype ('normal'/'fast'/'tank'), a random roster entry of
 *               that archetype is picked (hpMul/speedMul applied to hp/maxHP/speed, xpMul to xp
 *               — what the kill is WORTH, which moves independently of how tough it is, and
 *               v7.x's dmgMul to contact damage — the per-CREATURE damage lever, as against
 *               ENEMIES[type].dmg which moves that archetype in every chapter and
 *               balance.enemyDmgMul which moves every creature in this one), and its
 *               `flags` are copied in; elites additionally get CHAPTERS[chapter].eliteFlags
 *               appended (so an elite can carry both its roster's own flags and its chapter's
 *               elite-only ones). Always present (possibly []), safe to check unconditionally.
 *               Known flags (sim.js): 'latch' (stepContactDamage: contact slows the player via
 *               player.slowT/LATCH_SLOW_MUL then the enemy dies), 'crushable' (v5.14, skies'
 *               aircraft — stepContactDamage: the enemy dies outright on touching the player and
 *               deals NO contact damage and spends no invuln window; like 'latch' it sits before
 *               the p.invuln gate and continues the scan, so a whole flight dies in one frame.
 *               Its threat is its telegraphed attack, not its airframe), 'split' (dealDamage's death
 *               branch: non-`_splitChild` deaths spawn SPLIT_CHILD_COUNT children at
 *               SPLIT_HP_FRAC hp / SPLIT_RADIUS_FRAC radius, flagged `_splitChild: true` so they
 *               never re-split), 'dashBurst' (stepDashBurst: an idle -> dash state machine on
 *               sim-internal `_dashPhase`/`_dashT`/`_dashDirX`/`_dashDirY`, not a render contract.
 *               The heading LOCKS on the way out of idle and the dash never re-aims — at
 *               DASH_SPEED_MUL it outruns the player, so a homing version is undodgeable),
 *               'acidPool'/'soapTrail' (elite-only: feed run.pools — see below).
 *               v5.3 garden flags: 'trailFollow' (dealDamage: a dying ant drops a run.trails node
 *               under the 'pheromones' signature; stepEnemyMovement: living ants near a node get a
 *               PHEROMONE_SPEED_MUL boost), 'diveBomb' (stepDiveBomb: a hover -> telegraph -> dive
 *               -> recover state machine on sim-internal `_diveState`/`_diveT`/`_diveDirX`/
 *               `_diveDirY`/`_diveElapsed`, replacing the normal seek — not a render contract),
 *               'webZone' (stepEnemyMovement: drops run.webs slow-zones via `_webAcc`, NOT
 *               elite-gated). v6.6.16: there is no mower FLAG any more — the lawnmower became an
 *               ambient chapter hazard (CHAPTERS[id].mower), rolling itself into run.lanes every
 *               MOWER_GAP_MIN..MAX seconds once run.time passes MOWER_FIRST_T, one pass at a time.
 *               It was briefly an elite flag (v6.6.14) and before that 'sprayStrip', which marked a
 *               rectangle on the player from an elite that could be anywhere — no visible cause.
 * dash (v7.x): the picked roster entry's optional `dash` object, `{restMul, lenMul, spdMul}`, or
 *               null — per-CREATURE overrides for the dashBurst machine, multiplying DASH_IDLE_T,
 *               DASH_T and DASH_SPEED_MUL respectively. spdMul reaches the LUNGE only: the idle and
 *               the off-screen walk-in keep their own speeds, and a creature carrying both spdMul
 *               and lenMul lunges lenMul x spdMul as far.
 *               Read only by stepDashBurst, which resolves all three once at the
 *               top and uses the resolved values at all four places it sets a phase timer (reading
 *               a global at any one of them is a silent half-override; the off-screen rewind is the
 *               easiest to miss and run RO.d exists for it). null on every enemy in the game except
 *               The Surf's Sea Roach and The Twilight's Krill — the point of the field is that a
 *               chapter can soften ONE of its creatures without moving DASH_* for the other
 *               chapters that share them. run RO.b pins the exact set that carries an override.
 * trailLag (v7.x): the picked roster entry's optional `trailLag`, or null to take the shared
 *               BLANK_PASTSEEK_LAG. How many `run.trail` samples behind the player a `pastSeek`
 *               creature aims — same per-creature-override idiom as `dash` and `phase`, and here
 *               because the two users want opposite things: The Blank's Probe SHADOWS you (lag 1,
 *               ~0.35s, at speedMul 1.3), while The Shelf's dogfish is meant to arrive somewhere
 *               you have genuinely left. Read only by the pastSeek branch of stepEnemyMovement.
 * rosterId (v5.0): the picked roster entry's id (config.js), or null if the chapter's roster had
 *               no entry for this enemy's archetype — reserved for render/HUD skins later, no
 *               sim.js behavior keys off it directly (flags/hpMul/speedMul already applied).
 *
 *               Elemental status (see ELEMENTS + the EL_* block in config.js, ticked by
 *               stepStatuses): ignite (s of burn DoT remaining, 0 = none), igniteDps (current
 *               burn rate).
 *               chill, frozen and venom are DERIVED, not stored — stepStatuses publishes them
 *               every step from the enemy's own damage windows, and nothing else writes them.
 *               chill (0..1 slow FRACTION, applied as a speed multiplier in stepEnemyMovement),
 *               frozen (s of full-stop remaining; only `anchored` elites can never freeze — a
 *               big enemy resists by having more health, not by exemption), venom (0..~1
 *               damage-taken AMP, deals no damage of its own). render.js tints and spawns status
 *               particles off exactly these three names, and scales the tint by the last two —
 *               a status that is computed but not published here is invisible on screen, which
 *               has read as "the mechanic is broken" twice (freeze, then venom).
 *               bleed (v5.0, s of bleed DoT remaining, 0 = none), bleedDps (current bleed rate) —
 *               a plain dot-flagged DoT applied by the Flagella Whip's barbed mod (see applyBleed
 *               in sim.js), ticked like ignite with no combo/element interaction.
 *
 *               Status effects (v5.4, chapter-agnostic like the elemental ones — every reader
 *               guards them with `|| 0` since saves and other chapters never set them). All four
 *               tick down every frame in stepEnemyMovement:
 *               fearT (s of flee remaining): while > 0 the enemy INVERTS its seek (runs from the
 *                 player) at FEAR_SPEED_MUL of its own speed, overriding any behavior-flag state
 *                 machine. It STILL DEALS CONTACT DAMAGE (v7.16 — it used to be disarmed too,
 *                 which is half of what made a permanent fear an untouchable wall). Applied by a
 *                 run.novas entry carrying a `fear` field (the Chitter Shriek — see
 *                 stepNovas/stepShriekWeapon in sim.js).
 *                 chitterShriek's panicRout mod amplifies ALL damage a fearT > 0 enemy takes.
 *               _ccDR / _ccDRPre / _ccSpentAt (v7.17, GLOBAL CROWD-CONTROL PRICING): the enemy's
 *                 resistance to being controlled, 1 down to CC_DR_FLOOR. Every player-sourced CC —
 *                 knockback, fear, chill slow, freeze, stun — multiplies by it (times the player's
 *                 own p.ccMul) and then spends it, ONCE PER FRAME per enemy however many effects
 *                 landed; it recovers to 1 over CC_DR_RECOVER seconds. _ccDRPre holds the pre-spend
 *                 value so every effect of one cast is priced identically regardless of call order.
 *                 This is what stops a fire-rate card buying unlimited control — see the CC_DR_*
 *                 block in config.js for the measurements. Chapter hazards (traffic, hydrant jets,
 *                 the lane's repulse) are deliberately NOT scaled.
 *               fearCd (s of fear IMMUNITY remaining, v7.16): armed to FEAR_REFRACTORY on the frame
 *                 fearT expires; while > 0 no ring can fear this enemy again. Caps fear uptime by
 *                 the enemy's own timer instead of by the weapon's cadence — without it any fire
 *                 rate shorter than the duration pins fear at 100%. ONLY the `anchored` elite affix
 *                 resists crowd control outright — it is never feared or knocked back at all (see
 *                 resistsCC). The `unshakeable` roster flag on one tank per chapter is a RESISTANCE,
 *                 not an immunity: it is feared and shoved for UNSHAKEABLE_CC_MUL of the usual, and
 *                 never for none (see ccResist).
 *               stunT (s of stun remaining): while > 0 the enemy neither seeks nor deals contact
 *                 damage (knockback still carries it). Applied by the Burst Hydrant's launch mod,
 *                 the Roar's stagger mod (HYDRANT_STUN, and STAGGER_STUN_PER_PICK — the stagger
 *                 bonus IS the duration in seconds, there is no second multiplier), and (v6.4) a
 *                 detonating mine (MINE_STUN, sim.js's detonateMine) against every non-ghosted
 *                 enemy in its blast radius.
 *               allyT (s of loan remaining) — SUBMISSION anomaly: while > 0 this enemy is YOURS.
 *                 It stays in run.enemies and `elite` stays TRUE (clearing it would swap the
 *                 texture and pop the crown off mid-life), but isAlly(e) in sim.js makes it
 *                 damageImmune — which also makes it contactHarmless, so it can neither be hurt by
 *                 you nor hurt you — excludes it from every targeting/claim/consumption loop, and
 *                 points it at the nearest hostile instead of the player. Set by turnDeadElites,
 *                 counted down in stepSubmission, which retires the body when it reaches 0.
 *               _turned (bool) — SUBMISSION: this elite has already had its loan. The idempotence
 *                 guard; without it the ally's own fall re-enters the turn and pays the elite's
 *                 whole reward again (a gem and coin fountain).
 *               _allyHitT (s) — SUBMISSION: cooldown on the ally's contact attack
 *                 (SUBMISSION_HIT_EVERY). Contact is its ONLY attack: the player-directed flags are
 *                 stripped at the turn (SUBMISSION_STRIP_FLAGS), and for the rest of the roster
 *                 pounce/dive/charge/strafe all resolve to contact damage anyway.
 *               _tgtX/_tgtY (px) — SUBMISSION: the seek point stepEnemyMovement chose for an ally,
 *                 published so RENDER can face the sprite. render derives every other enemy's
 *                 bearing from run.player each frame, so without this an ally charging the swarm
 *                 draws walking backwards in all 32 roster looks. Render-only; sim never reads it.
 *               enrageT (s of enrage remaining): while > 0 the enemy's seek speed is ×
 *                 FLASHLIGHT_SPEED_MUL and its contact damage × FLASHLIGHT_DMG_MUL. Applied by the
 *                 undergrowth's flashlightCone elites (see stepFlashlightCones in sim.js).
 *               dazeCd (s): Silt Veil's daze window. While > 0 no silt cloud may daze this body
 *                 again. Armed at APPLICATION to (the hold + SILT_DAZE_REFRACTORY), unlike fearCd's
 *                 expiry-armed window -- the daze publishes into the SHARED e.stunT, so no frame
 *                 here can be identified as "the daze ended" rather than "the net/roar/hydrant
 *                 stun ended". Without it a persistent cloud re-stuns on the frame the hold lapses.
 *               dragT (s of Ballast drag remaining): while > 0, stepEnemyMovement's slowMul is
 *                 multiplied by (1 - BALLAST_DRAG). Set once by a ballast landing (Math.max, so a
 *                 second weight refreshes rather than stacks) and never refreshed after -- which is
 *                 why it is not bloomSlowT with a magnitude: that field IS refreshed every frame a
 *                 body stands in a cloud, and sharing it would let any bloom hold the heavier
 *                 ballast number alive for the cloud's whole duration.
 *               blindT (v7.x The Reef, s of blindness remaining): while > 0 the retarget seam in
 *                 stepEnemyMovement hands this body a point INK_BLIND_REACH down the heading it
 *                 held when the blind landed, instead of run.player -- so it "loses you and keeps
 *                 going", and a lane's scroll carries it past you. Refreshed every frame a body is
 *                 inside a run.blooms entry carrying `blind` (Squid Ink), decayed in
 *                 stepEnemyMovement. render.js tints an inked body dark and sheds ink off it.
 *                 The held heading itself is _blindHx/_blindHy, sim-internal, cleared on expiry --
 *                 without that clear a second cloud would resume the FIRST cloud's bearing.
 *                 NOT routed through the CC-DR budget: resistsCC guards holds, and a blinded body
 *                 keeps its full speed.
 *               bloomSlowT (v6.4, s of bloom-slow remaining): while > 0, stepEnemyMovement's
 *                 slowMul is multiplied by (1 - BLOOM_SLOW) — a plain speed debuff, stacking with
 *                 chill/freeze rather than replacing the seek like fearT/stunT do. Refreshed to
 *                 BLOOM_SLOW_T every frame stepBlooms finds the enemy inside a cloud's radius
 *                 (guarded by damageImmune — a ghosted phase flicker ignores the cloud like it
 *                 ignores everything else); decays like the other three once outside.
 *               feedT (v7.x The Wreck, s of a mouthful remaining): the fish reached a Chum bait,
 *                 took one serving and STOPPED for it. While > 0 stepPrey returns before it steers,
 *                 so the body sits still in open water — that hold, not the gather, is what the
 *                 card is bought for. Set ONCE, in stepLures, on the frame the serving is taken
 *                 (never refreshed by standing in the cloud: a re-arming hold would pin the shoal
 *                 for the bait's whole duration), `skittish` only, and not at all on a fish that is
 *                 mid-puff. TWO things break it early: the player closing inside
 *                 CHUM_PANIC_R x nerve, and inflating. render.js reads it as a CONTRACT FIELD and
 *                 squashes the body along its own forward axis by CHUM_VIS.feedSquash — the camera
 *                 looks straight down, so nose-first into the food is foreshortening, and no
 *                 roster bake needs a head-down frame.
 *               oiled (v7.x The Wreck, 0..OIL_STAIN_MAX): PERMANENT, and the only field in this
 *                 list that is. A body in oil accumulates OIL_STAIN_RATE per second and never gets
 *                 it back; stepEnemyMovement's slowMul is multiplied by (1 - oiled). BOTH oils
 *                 stain — the player's look:'bilge' blooms (stepBlooms) and the chapter's own
 *                 ambient run.slicks (stepSlick) — because it is the same substance. The squid's
 *                 look:'inkjet' cloud does NOT: it carries slow: 0 and never enters that branch.
 *                 render.js reads it as a contract field and tints the body toward oil-black,
 *                 ramped by oiled / OIL_STAIN_MAX. The cap is the safety: uncapped, a shoal herded
 *                 over the same slick repeatedly would stop dead.
 *               Sim-internal only (not a render contract, do not rely on these): _elCold/_elVenom
 *               (the rolling damage windows the three derived fields above are computed from),
 *               _elFrozen/_elResist (the freeze and its aftermath),
 *               _shockCd, _bleedAcc, _debrisCd (Trash Tornado's
 *               per-enemy funnel cooldown, the run.debris analogue of orbCd). }
 * bullets[i]: { x, y, vx, vy, dmg, pierce, life, r, speed, hitIds:Set<enemyId>,
 *               _shard (true for Split Stars shards; they never re-split), _splitDone,
 *               _chainsLeft (Chain Stars jumps remaining) }. On a spend (pierce exhausted) a
 *               bullet re-targets the nearest not-yet-hit enemy if it has a jump left and finds
 *               one (tryChainBullet in sim.js); otherwise it dies. run._chains is a debug counter
 *               incremented on each jump (not a render contract).
 * novas[i]:   { x, y, r, maxR, dmg, knockback, life, hit:Set<enemyId> }  (r grows; render draws the ring)
 *             knockback (v4.3): always the weapon's normal positive value — novas push enemies
 *             back regardless of mods. (v6.4.8: Chemotaxis/wave.undertow no longer inverts this
 *             into a pull; it instead reels in loot — see gems/coins _vac below and sim.js's
 *             stepWaveWeapon.) Tsunami (v4.3) bakes a bigger maxR/dmg into every TSUNAMI_EVERY-th
 *             cast (tracked by run._waveCasts, a sim-internal counter, not a render contract).
 * orbs[i]:    { x, y, r } positions + effective hit radius computed by sim each frame (render
 *             just draws them; r = ORB_R × (1 + orbit.bigOrbs bonus), same for main-ring and
 *             twinRing orbs — see WEAPON_MODS.orbit in config.js)
 * gems[i]:    { x, y, xp, _vac? }   coins[i]: { x, y, value, _vac? }
 *             _vac (v6.4.8, optional): set by Chemotaxis (WEAPON_MODS.wave.undertow) on every
 *             gem/coin within its reel radius at nova cast time — stepPickups then homes it to
 *             the player every frame regardless of magnet range, until collected.
 *
 * v2 weapon entities (all sim-owned, render-drawn):
 * boomerangs[i]: { x, y, angle, phase:'out'|'back', dmg, hit:Set, hitR, backhandMul }
 *               (hit cleared at turnaround; hitR (v4.1) = BOOMERANG_HIT_R × (1 + boomerang.bigBlade
 *               bonus), snapshotted per throw — sim-internal collision radius, not required by
 *               render). backhandMul (v4.3, see WEAPON_MODS.boomerang): also snapshotted per
 *               throw — (= 1 + backhand bonus) multiplies dmg only while phase==='back'.
 *               (Seeker Leaves, which steered the outbound leg, was cut on the owner's call.)
 * mines[i]:     { x, y, arm (s until armed), dmg, radius, small?, _detonate? }
 *               small (v4.1, optional): true for Cluster Bombs bomblets (see WEAPON_MODS.mines
 *               in config.js) — smaller/weaker mines popped from a mine's death; render draws
 *               them at a reduced scale. Absent (falsy) on ordinary player-deployed mines.
 *               _detonate (v4.3, sim-internal, not a render contract): set once a mine is queued
 *               to explode this frame (natural proximity trigger OR a Chain Reaction cascade from
 *               another mine's blast) — guarantees a mine only ever detonates once. Magnetic Mines
 *               (v4.3) crawls an armed (arm<=0) mine's x/y toward the nearest enemy every frame —
 *               plain position mutation, no new render contract.
 * homingShots[i]: { x, y, vx, vy, dmg, life, pierce, hitIds:Set<enemyId>, _mini? }
 *               pierce (v4.1): starts at 1 + WEAPON_MODS.homing.phantom bonus; a wisp
 *               decrements it on each hit instead of always dying on first contact, and keeps
 *               homing toward enemies not yet in hitIds (see stepHomingShots in sim.js).
 *               _mini (v4.3, optional): true for Swarm's bonus mini-wisps, spawned when a
 *               (non-mini) wisp's hit kills an enemy (see WEAPON_MODS.homing.swarm) — same shape,
 *               smaller dmg/life, never itself triggers another Swarm spawn (still eligible for
 *               a Popping Wisps death-pop, see below). Popping Wisps (wispNova, v4.3): any wisp
 *               that dies (spent its last pierce on a hit, OR its life ran out) pops an AoE
 *               splash — no new field, just an {type:'explode'} event at its (x,y).
 * holes[i]:     { x, y, radius, coreRadius, life, duration, dmg, tick, pull, spawnRadius? }
 *               coreRadius is the inner "consumed" zone (amplified tick damage; see stepHoles).
 *               Singularity (v4.1, see WEAPON_MODS.hole) spawns extra hole entries of this same
 *               shape at HOLE_SINGULARITY_FRAC radius/coreRadius/pull. spawnRadius (v4.3,
 *               optional): the hole's radius at creation — Hungry Hole (see WEAPON_MODS.hole)
 *               grows radius/coreRadius by a fraction of it per second while alive; render is
 *               already visual-safe here since it re-reads h.radius/coreRadius every frame. Big
 *               Crunch (v4.3): on expiry a hole collapses in one last detonation at its FINAL
 *               radius — an {type:'explode'} event, no new field.
 * blooms[i]:    { x, y, r, maxR, t, dur, dmgPerTick, tick?, _mini? }  Toxin Bloom clouds (v5.0 pond
 *               native, sim-owned/render-drawn). Planted by stepBloomWeapon at a random enemy
 *               within castRange (fallback: a random offset near the player); r grows 0 -> maxR
 *               over dur × BLOOM_GROW_FRAC (see config.js) then holds maxR; every BLOOM_TICK it
 *               deals dot-flagged damage (dmgPerTick, player-scaled — {type:'hit', dot:true}) to
 *               enemies within r; removed once t reaches dur. _mini (optional): true for
 *               sporeburst mini-clouds (SPOREBURST_FRAC of the parent's maxR), spawned when a
 *               non-mini cloud's own tick kills an enemy — minis never spawn further minis.
 *               OPTIONAL `look` tags a cloud as another weapon's (see the Foxfire and Silt Veil
 *               notes below) — or as a CREATURE's: look:'inkjet' is The Wreck's squid, the one entry
 *               on this array no weapon casts, and the only one that slows the PLAYER (read in
 *               stepPlayerMovement's MIN, not here — see INK_SLOW_MUL). It carries `slow: 0`, so
 *               the enemy slow below never touches it. NOT to be confused with The Reef's Squid
 *               Ink WEAPON, which is a `blind` bloom and a different mechanic entirely;
 *               OPTIONAL `slow: 0` opts it out of BLOOM_SLOW_T entirely; OPTIONAL
 *               `blind` (seconds, v7.x Squid Ink) refreshes e.blindT on every body inside, every
 *               frame; OPTIONAL `airHold: true` (v7.x Oxygen Tank's boil) is read by stepCharge
 *               ALONE, where it multiplies the chapter bar's drain by zero while the PLAYER stands
 *               in it -- it can never add to the bar, and CHAPTERS.reef.resource records why that
 *               is a constraint rather than a tuning choice; OPTIONAL
 *               `daze` (seconds) is Silt Veil's, published into e.stunT against the enemy's own
 *               dazeCd window (see SILT_DAZE_REFRACTORY). It replaced a `fear` field in v7.x --
 *               fear scattered the crowd out of the cloud that was damaging it.
 *               OPTIONAL `grow` (seconds) overrides dur x BLOOM_GROW_FRAC as the 0 -> maxR ramp for
 *               this cloud alone; OPTIONAL `trail: true` marks a Bilge pool laid by slickTrail, so
 *               render can draw the chain of them as one continuous film rather than as a row of
 *               separately rimmed circles (see BILGE_TRAIL_* in config.js — both fields exist for
 *               that mod and nothing else).
 *               OPTIONAL `tick` (seconds) overrides BLOOM_TICK for this cloud alone. Silt Veil
 *               sets it from its LEVEL (0.75s at Lv1 down to 0.4s at Lv5), which is why the veil's
 *               dps curve is far steeper than its dmgPerTick ladder alone suggests; Toxin Bloom,
 *               Foxfire and sporeburst minis carry none and keep the shared 0.5s. Note the daze
 *               rides this same tick, so a low-level cloud also re-dazes more slowly.
 *               OPTIONAL `arc` (full cone angle, rad) + `angle` (its bearing) make the bloom a
 *               WEDGE instead of a disc, apex at (x, y): Silt Veil's, and the only one today.
 *               ⚠ A look:'silt' bloom is NOT always the Silt Veil's own cast. Three other sites
 *               push one (spawnSiltCloud in sim.js): Foul Spring turns a whole clean-water
 *               patch into a disc of its radius, and the two DUO BOONS -- ballast.siltPlume
 *               (three around a landing) and downwash.siltFlush (one huge one on the burst).
 *               All three are DISCS with no `arc`, all three carry the veil's live
 *               dmgPerTick/dur/daze, and that is how they are told apart from a cast cone.
 *               Both passes in stepBlooms route through inSector when `arc` is present, so a
 *               cone hits exactly what the whip and the claw would hit; render.js rotates the
 *               puff rig to `angle` and marches its puffs down the axis. A cone NEVER moves
 *               (owner's ruling: planted where cast, not stuck to the player), which is what
 *               keeps render.js's position-derived puff hash stable -- see the note there.
 *               twinBloom (see WEAPON_MODS.bloom) plants extra clouds per cast. Render re-reads
 *               r/maxR/t every frame (alpha/size ramp), no per-frame event.
 *               tideCarried (v6.4, see WEAPON_MODS.bloom): with picks currently held, stepBlooms
 *               drifts EVERY live cloud's x/y by currentForce(x,y) × dt × picks every frame — same
 *               field the pond's ambient current/eddies push the player and enemies with — and
 *               multiplies its tick damage by (1 + TIDE_DMG_BONUS × picks). Read live off
 *               run.weaponMods.bloom, not baked in at plant time, so a sporeburst mini (which
 *               inherits only the parent's plain dmgPerTick, nothing tide-specific) drifts and
 *               ticks hot too whenever tide picks are currently held — it's an ordinary bloom in
 *               every other respect.
 * beams[i]:     { angle, life, duration, dmg, tick, width, length, focusBonus? }  origin = player.
 *               Prismatic Split (v4.1, see WEAPON_MODS.rainbow) spawns extra beam entries of
 *               this same shape, angle offset evenly around the circle, all rotating together.
 *               focusBonus (v4.3, optional): Focus Lens — each tick's damage is ramped by
 *               (1 + focusBonus × elapsed/duration), recomputed fresh every tick (not baked).
 *               Strobe Ray (v4.3) instead bakes a faster `tick` period in at cast time (no new
 *               field — it's applied straight to `tick` above).
 *               prism (v6.7.6, optional): Beam Prism's split ladder, e.g. [4,3,2] at mythic —
 *               baked at cast time like Strobe, and null on any beam without the mod (which
 *               includes every Pulsar Sweep, since only fireBeam ever sets it). See the PRISM_*
 *               block in config.js. Its sub-beams are NOT entries here — they resolve inside the
 *               tick that cast them and leave only the render-only segments below.
 * prisms[i]:    { x, y, x2, y2, d, life }  v6.7.6, RENDER-ONLY — one drawn refraction segment.
 *               Damage is already resolved by the time one of these exists; they linger
 *               PRISM_FLASH_T purely so a split cast on a tick frame is visible for longer than one
 *               16ms frame. `d` is the generation (0 = straight off the beam, 1 = a sub-beam of a
 *               sub-beam...), which render tapers on. Nothing collides with them, nothing reads
 *               them but render.js. Stepped (aged and filtered) at the end of stepBeams.
 *
 * Extra events beyond v1: {type:'explode',x,y,radius} mine pop, star-blast explosion, Supernova
 * Sparks orb-kill splash, Popping Wisps death-pop, or Big Crunch hole-collapse (radius from
 * config: mine's own blast radius, STAR_BLAST_RADIUS, ORBIT_NOVA_RADIUS, WISP_NOVA_RADIUS, or
 * the hole's own final radius, respectively) · {type:'hole'} vortex opens · {type:'beam'} beam
 * starts · {type:'bloom', x, y} a Toxin Bloom is cast (x,y = player, for a cast sfx; the clouds
 * themselves live in run.blooms above).
 *
 * v5.0 pond weapons (see WEAPONS.flagella/bloom + WEAPON_MODS in config.js, stepFlagellaWeapon/
 * stepBloomWeapon in sim.js):
 *   {type:'whip', x, y, angle, range, arc}  one per Flagella Whip swing (x,y = player origin;
 *                                           angle = arc centre, range/arc = sector size — render
 *                                           draws the sweep). Per-enemy {type:'hit'} events fire
 *                                           alongside it as usual. cyclone opens arc to 2π.
 *
 * v5.3 garden weapons (see WEAPONS.stinger/lure + WEAPON_MODS in config.js, stepStingerWeapon/
 * stepLureWeapon/stepLures in sim.js):
 *   Stinger needles are ordinary run.bullets entries (see bullets[] above) but tagged
 *   weapon:'stinger' and _necrotic (snapshot of the necroticTips mod — stepBullets leaves a bleed
 *   per hit when set), with star's split/chain budgets zeroed so those never apply.
 *   {type:'shoot', weapon:'stinger'}  a stinger volley fired.
 *   {type:'lure', x, y}               a Pheromone Lure decoy was planted (x,y = player, for sfx;
 *                                     the decoys live in run.lures above). A lure's burst emits an
 *                                     {type:'explode', x, y, radius} at the decoy (see stepLures).
 *
 * Shock arc visual (see elArc in sim.js): every lightning arc emits exactly one
 *   {type:'shockarc', points:[[x,y],…]} (polyline: source enemy, then each arc target) — one per
 *   shock, so the arc never double-renders.
 *   {type:'freeze', x, y}                cold: the moment an enemy's chill gauge fills and it
 *                                        locks. Deliberately has NO sfx entry — freezes fire
 *                                        dozens of times a minute on a cold build.
 *
 * There are no element x element COMBO events. The old system's shatter/frostarc/overload/conduct
 * were deleted with it: elements now compose through one shared number (how much of an enemy's own
 * health you have just removed), so a pair interacts by both reading a fuller window rather than by
 * a special case per pair. `overload` survives as an ANOMALY id, which is unrelated — it reaches
 * render as `e.src === 'overload'` on a hurt event, never as an event type.
 *
 * mutators (v4.0): run.mutators is the array of MUTATORS ids (see config.js) selected before
 * the run started — opts.mutators passed to createRun (the difficulty ladder's roll, or a
 * future free-pick screen). run.mods is the derived,
 * pre-multiplied modifier object (mergeMutatorMods(run.mutators)) that sim.js reads at fixed
 * points (spawn rate, concurrent-enemy cap, enemy hp/speed/dmg/radius, elite cadence, contact
 * damage taken, player outgoing damage, player move speed, magnet range, xp/coin pickup value,
 * element card weight) — see sim.js's module doc for the exact list. Difficulty, EARLY_CALM and
 * CHAPTERS[id].balance all multiply into this same object below, so a chapter-wide knob is set
 * once here and read wherever that key is consumed. Both are set once at createRun and never
 * mutated mid-run.
 *
 * bombs[i]: { x, y, radius, fuse, duration, dmg, src?, core? }  volatile-elite death bombs
 *           (v4.0). fuse counts down to 0 (duration is its starting value, kept so render can
 *           draw a growing warning telegraph from fuse/duration); when the fuse expires sim.js
 *           removes the bomb, damages the player if inside radius (same armor/
 *           contactDmgTakenMul path as contact damage) and any enemies inside radius (via
 *           dealDamage), and emits {type:'explode', x, y, radius} (same event shape as a
 *           mine pop or star blast).
 *           core (v6.7.7): this bomb came from ANOMALIES.unstableCores rather than from the
 *           rolled `volatile` elite affix. Two differences, both enemy-side only: its damage to
 *           ENEMIES is dmg * hpScale(run.time) * CORE_BLAST_ENEMY_MUL (the player still takes the
 *           flat dmg), and every enemy it kills drops a core of its own — the cascade, uncapped.
 *           `src` stays 'volatile' on both so render.js's bombSrc keeps its drawer; a new src
 *           value falls through to the generic red telegraph (the v5.10.1 P0).
 *
 * v5.0 chapter behavior flags (see CHAPTERS in config.js and sim.js's spawnEnemy/dealDamage/
 * stepEnemyMovement/stepContactDamage/stepPools/stepCurrents/stepObstacles):
 * player.slowT: s remaining of a movement-speed debuff (0 = none) — set to LATCH_SLOW_T by a
 *   'latch'-flagged enemy's contact (stepContactDamage); while > 0, stepPlayerMovement
 *   multiplies move speed by LATCH_SLOW_MUL. Ticks down like invuln, every frame.
 * pools[i]: { x, y, r, t, dps } — circular zones that damage the PLAYER only while they stand
 *   inside (dot-flagged {type:'hurt', dmg, dot:true} events, ticked every STATUS_TICK like other
 *   DoTs — see stepPools in sim.js), removed once t <= 0. Fed by two elite-only flags: acidPool
 *   (a pool left at an elite's death spot) and soapTrail (nodes dropped periodically while the
 *   elite is alive, via sim-internal `_soapAcc` on the enemy). One shared array/step function
 *   for both — see the ACID_ and SOAP_ constants in config.js. Not gated by chapter: empty
 *   unless something pushes to it.
 * obstacles[i]: { x, y, r, _cell, kind } — circular colliders STREAMED around the player by
 *               sim.js's streamObstacles (v5.6.13; deterministic per _obstacleSeed cell hash) from
 *   CHAPTERS[chapter].obstacles (config.js; null/absent, e.g. body, yields []). Push the player
 *   and every enemy out of overlap every frame (stepObstacles in sim.js); projectiles are
 *   unaffected. Rendered from real sprite assets (Task 6), not drawn here. kind (v5.8 kaiju
 *   redesign): one of STRUCTURE_KINDS (config.js: 'tower'|'house'|'tree'|'pier'|'barn'|'silo'),
 *   derived from a fifth salt on the same pure obstacleCellHash that picks position/radius —
 *   deterministic, render-facing only (sim never branches on it; crushing/pushing treat every
 *   obstacle the same). Assigned for every chapter's obstacles, not just skies'. v5.9.1 bugfix: for
 *   a chapter with a district map (run._districtSeed != null, skies only) the salt now picks WITHIN
 *   the district-appropriate subset (DISTRICT_STRUCTURE_KINDS, config.js) instead of the full list
 *   — see _districtSeed's doc below and sim.js's streamObstacles. CHAPTERS[chapter].obstacles.cell
 *   (v5.8, optional): per-chapter override of the shared OBSTACLE_CELL streaming grid size — absent
 *   everywhere but skies.
 * eddies[i]: { x, y, r, dir, _cell } — v6.4 pond identity: streamed vortices, same _obstacleSeed
 *   streaming idiom as obstacles[] above (sim.js's streamEddies), gated on CHAPTERS[chapter].
 *   signature.eddies (currently pond only; [] everywhere else). dir is the swirl's sign (±1),
 *   picked from its own cell hash salt. Zero RNG at step time, like obstacles. Read every frame by
 *   currentForce (sim.js) — see that function's own doc for the pull/swirl math — not by any
 *   dedicated stepEddies (there's nothing to step: the force IS the effect, applied where the
 *   force is already applied, to the player and every enemy, and to a tideCarried bloom cloud).
 * spurs[i]: { i, f, thick, grooves: [{ c, hw }], merged } — v7.x The Reef: the CORAL RIDGES, the
 *   chapter's level design (spec 2026-08-20). `i` is the lane index, `f` its centre on the lane's
 *   FORWARD axis (x here, since the Reef is an x-lane) and `thick` its OWN extent along it — every
 *   ridge takes a different one off the field's third salt (spurs.thickVar), which is what makes the
 *   reef front ragged, and it is the number BOTH the grate and the renderer measure; a groove is
 *   a gap in it at cross position `c` with half-width `hw`. Two grooves normally, ONE when `merged`
 *   — the braid has closed them onto each other and the ridge has a single way through, which is the
 *   narrowest point in the level. Everything here is a pure function of `i` and run._obstacleSeed
 *   (spurAt, sim.js), so nothing is rolled at step time and a second consumer can ask where a groove
 *   is without materialising the field. streamSpurs rebuilds the whole window whenever the player
 *   crosses a ridge, on the _spurIdx cursor, and bumps _spurRev for render.
 *   A ridge is NOT solid: it grates (SPUR_DPS) and slows the strafe, never the scroll, and enemies
 *   pass straight through — which is what makes coral strictly worse than a groove on every axis.
 * _spurAcc: number — the scrape's part-tick accumulator (stepSpurs). _drownAcc's twin with ONE
 *   difference that is the whole design: it is CARRIED across a groove rather than zeroed on exit,
 *   and merely capped at SPUR_TICK while outside, so the tick fires on ENTRY and an oscillating
 *   player still pays no more per second than one who committed. See stepSpurs for both exploits.
 *   It starts AT SPUR_TICK, not at 0, because that cap is what the entry tick is: seeded at zero the
 *   first ridge of a run alone would take half a second to bite.
 * _laneFront: number — how far up the lane the CHAPTER has got, on its own forward axis, which is
 *   not the same as how far the player has got. Advances at laneScrollFor() every frame whatever
 *   the player is doing, is PULLED forward by a player who gets ahead of it (a burst), and is
 *   CLAMPED so the player can never fall further behind it than the visible strip astern. Owned by
 *   stepLaneFront; render.js anchors the lane camera to it and writes nothing.
 *   Only separates from the player where a chapter can STOP one — CHAPTERS[].spurs.solid. Without
 *   that it tracks the player exactly, which is how The Beyond keeps its pre-front behaviour.
 * _laneThrottle: number — the player's own hand on the scroll, off the stick's FORWARD component,
 *   which every other lane throws away. 1 at neutral, CHAPTERS[].laneThrottle.max at full push and
 *   .min at full ease-off (The Reef: 3 and 0.5) — two multipliers rather than one ± fraction,
 *   because the low end may never reach 0 and 3x on the high end would take it past -1.
 *   READ BY TWO CLOCKS: the player's forward velocity (stepPlayerMovement) and the lane front
 *   (stepLaneFront, the crush edge and the camera anchor). Throttling only the first would leave
 *   the level running at full speed while the player fell into the back edge.
 *   Stays 1 for a chapter that declares no laneThrottle, which is every chapter but The Reef.
 * _laneSpeed: number — the throttle with WEIGHT, and the only one of this family the player can
 *   feel. _laneThrottle is where the stick is; this is where the fish actually is, easing toward
 *   `laneScrollFor x _laneThrottle` at CIRCUIT_DEFAULTS.accel px/s². Exists only in a `circuit`
 *   chapter — elsewhere the throttle reaches the velocity in one frame and this stays null.
 *   SEEDED AT THE CHAPTER'S NOMINAL SCROLL, never 0, or the first second of every race is spent
 *   accelerating from a standstill the design never asked for.
 *   Read by stepLaneFront as well as stepPlayerMovement: the front must advance at the speed the
 *   player is TRAVELLING, not the speed they are asking for, or accelerating bills you for ground
 *   you have not covered.
 * ---- The circuit (v7.x, The Reef). All four exist only where CHAPTERS[id].circuit is set. ----
 * lap: number — completed laps, 0..circuit.laps. A DISTANCE, not a counter: the track repeats every
 *   cave.lapLen, so this is floor(along / lapLen) and nothing can desynchronise it from the world.
 *   Reaching circuit.laps ends the run in victory.
 * raceClock: number — seconds of race left. The chapter's whole failure condition: it falls at 1s/s,
 *   is topped up by circuit.swimTime at every swimthrough and CAPPED at circuit.clockCap, and at 0
 *   the run is dead (killedBy 'clock'). Counts DOWN where run.time counts up, and the HUD's timer
 *   slot renders this instead of the 300s survival countdown for a circuit chapter.
 * raceTime: number — the SCORE, in real seconds, stamped once when the last lap lands. Undefined
 *   until then, which is what makes "did this run finish" a field test rather than a phase test.
 *   run._realTime and NEVER run.time: Time Debt advances run.time at 1.5x, and a race time is
 *   compared across runs on a board sorted fastest-first, so banking the inflated one would let an
 *   anomaly shave real seconds off a record. See stepCircuit's own block.
 * _swims / _swimN: the lap's checkpoints (swimthroughsFor, computed once from the obstacle seed) and
 *   a RUNNING count of how many have been crossed since the run began. The count never resets at a
 *   lap boundary, which is what lets laps and checkpoints share one arithmetic and never disagree.
 * _lapAt: number — run._realTime at the last lap line, so the `lap` event can carry its own split.
 * lapSplit: number — the last COMPLETED lap's duration in seconds, undefined before lap 1. The same
 *   value the `lap` event carries, published so the HUD's split flash can be derived from state
 *   (run.lap, this, and _realTime - _lapAt for the window) instead of from an event subscription —
 *   which is what lets it survive a dropped frame and a paused one.
 * _crushing: boolean — the player is pinned against the lane's trailing edge THIS frame, i.e. the
 *   lane has left without them. Published by stepLaneFront; the tell render.js draws off.
 * _crushAcc: number — the crush's part-tick accumulator (LANE_CRUSH_TICK). _spurAcc's twin.
 * _scraping: boolean — the player is inside coral THIS frame. Published by stepSpurs and read one
 *   frame later by stepPlayerMovement, where it joins the MIN of the speed floors as SPUR_SLOW_MUL
 *   (the strafe only — in the lane the forward component is the scroll and never `speed`), and
 *   every frame by render.js's updateCoralGrit, which is the grate's only tell.
 *   FORCED FALSE WHILE _burstT IS LIVE (owner, 2026-08-22): a dash crosses a ridge free, and this
 *   one field carries all three halves of that — no damage, no slow, and no grit — so a bought
 *   crossing is visibly not a paid one without render.js learning a second field.
 * polyps[i]: { i, f, thick, grooves, merged, t, lit, dmg, tick, acc, spill } — v7.x The Reef:
 *   LIT RIDGES (WEAPONS.fireCoral). Everything before `t` is a verbatim SNAPSHOT of spurAt(i, ...),
 *   copied at cast time rather than referenced: run.spurs is emptied and rebuilt in full on every
 *   ridge crossing (streamSpurs), so an entry there is not a place state can live. Because spurAt
 *   is pure the snapshot can never disagree with the field it was taken from, and stepPolyps tests
 *   it with the same onCoral() the grate tests the player with — the coral that burns the crowd is
 *   the coral that grates you. `t` counts the burn down, `acc` is the part-tick accumulator, and
 *   `spill` (Overgrowth) drops the groove test so the ridge burns wall to wall. `lit` is the AGE of
 *   the fire and is RENDER-ONLY: it only ever counts up, is never reset by the refresh that tops
 *   `t` back up, and exists so syncPolyps' ignition ramp cannot blank a ridge that is still
 *   burning. Enemies only: nothing in here can touch the player. render.js draws the band
 *   straight off this list.
 * shafts[i]: { x, y, bx, by, r, phase, _cell, gape?, _shutT?, drawdown?, fouled? } — v7.x Book 2: streamed REFILL
 *   CIRCLES the player stands in to refill `charge`. ONE list fed from any of FOUR places, decided
 *   by refillSpec() (config.js): The Twilight's sun shafts (its signature IS the refill spec:
 *   cell/chance/r/minDist/driftAmp/driftHz sit directly on it), The Surf's tide pools
 *   (CHAPTERS.surf.signature.pools — no drift, since a pool is a hole in the sand rather than
 *   something that moves), The Reef's air pockets (CHAPTERS.reef.signature.pockets — no drift
 *   either, and the ONLY thing that refills Air), and The Deep's anglerfish MAWS
 *   (CHAPTERS.deep.signature.maws).
 *     THE MAWS ARE THE ONE THAT IS NOT A PLACE — it is an animal, and it is the only refill circle
 *   that can kill you. Owner, 2026-08-17: "the anglerfishes dont move, they are not enemies, they
 *   are traps." `gape` (0..1) is how far its mouth has closed on the player standing in it and
 *   `_shutT` (s) is how long it stays spent after it swallows; both are written ONLY by stepMaws
 *   and read by stepCharge (a shut mouth feeds nobody, via inMaw) and by render.js's updateShafts
 *   maw branch, which IS the tell — the teeth reaching in and the rim going from cold to hot are
 *   drawn straight off `gape`. Undefined on every other chapter's circles, where inMaw's `_shutT`
 *   guard reads 0 and the test collapses to the plain inLobe it always was.
 *     `drawdown` (s of occupancy, The Shelf) is how long the player has stood in this circle; at
 *   signature.drawdownSecs it stops being food. Written by stepCharge and read by render.js, which
 *   fades the circle off this exact number so the seconds watched are the seconds counted.
 *     `fouled` (s REMAINING) is Foul Spring's animation clock, set to FOUL_SPRING_FOUL_T when a Silt
 *   Veil cloud lands in a live circle and counted down by stepShafts. It is the PICTURE only —
 *   `drawdown` is slammed to full in the same breath, so the circle stops feeding the player at
 *   once and this just buys the silt a moment to take it over. Undefined everywhere else, which
 *   reads as 0 and leaves every other field's drawing untouched.
 *   Same _obstacleSeed cell-hash idiom as eddies above and own _shaftCellI/_shaftCellJ cursor
 *   — shared by every chapter's refill circles, since only one of them is ever streaming at a time.
 *   The SALT BLOCK is the spec's, not the streamer's (spec.salt, default 20): 20-23 for the shafts
 *   and the pools, 40-43 for the pockets. A salt is what stops two streamed fields landing in
 *   identical cells, so it belongs to the field rather than to whichever function materialises it —
 *   and a collision is silent, reading as "the mechanic spawns on top of the other one".
 *   UNLIKE eddies there IS a dedicated stepper: streamShafts decides existence only and
 *   early-returns unless the player crossed a cell boundary, so it structurally cannot move
 *   anything — stepShafts does that every frame, gated on signature.type === 'shafts', which BOTH
 *   The Twilight (sun shafts) and The Shelf (clean-water upwellings) declare, so both fields drift. bx/by are the streamed BASE position and x/y the drifted (or, on The
 *   Surf, identical) one; drift is a pure function of run._realTime and `phase`, storing no state
 *   and consuming no RNG. _realTime and NOT run.time, which the Time Debt anomaly advances at 1.5x.
 * sandbars[i]: { x, y, r, _cell } — Book 2 / The Surf: streamed dry patches (CHAPTERS.surf.signature
 *   .bars) the player slows on. The FIFTH copy of the same _obstacleSeed streaming idiom (obstacles
 *   -> eddies -> traps -> shafts -> here), own salts (30 occupancy, 31 x jitter, 32 y jitter) and own
 *   _sandCellI/_sandCellJ cursor. Gated on CHAPTERS[chapter].signature.type === 'tide' && .bars
 *   ([] everywhere else). A sandbar never moves, so unlike a shaft it has no drift and no per-frame
 *   stepper — sim.js's onSandbar reads the list directly, centre-to-centre against `r`, exactly like
 *   stepCharge's shaft test. Zero RNG at step time, like every streamer above.
 * charge: number — the chapter resource bar (CHAPTERS[chapter].resource — The Twilight's 'Light', The
 *   Surf's 'Humidity' and The Reef's 'Air'). Drains passively, refills inside a refill circle
 *   (run.shafts: a shaft here, a tide pool there, an air pocket in the third, an anglerfish's open
 *   mouth in the fourth), and on The Wreck alone per kill (`killBase`), clamped to [0, run.chargeMax].
 *   The Deep also SPENDS it involuntarily: being devoured by a maw zeroes the bar outright, which
 *   is the only place in the game a hazard is priced in the chapter's own resource.
 *   0 and untouched in every chapter without a resource.
 *   It drives FOUR things, and each arrived separately:
 *     1. the Pulse's strength (PULSE_* in config.js; an empty bar still fires the shipped
 *        REPULSE_* shove, which is the floor that keeps the resource from being self-denying).
 *        Every chapter with a resource. NOTE that on The Surf this now competes with (3) for the
 *        same bar — PULSE_CHARGE_COST is 45 of 100 — which is a live design question, not a
 *        settled one; see the branch's final-fix report;
 *     2. THE DARK — below resource.dark.from the LIGHT YOU EMIT closes in from resource.dark
 *        .coreFull to .coreEmpty, both MULTIPLES OF THE SCREEN'S HALF-DIAGONAL rather than px
 *        (render.js updateDark subtracts a stamp of that radius from a per-frame lightmap it then
 *        paints at .dim), and the player slows toward resource.dark.speedFloor (sim.js
 *        stepPlayer). Both read the ONE curve darkness(charge, res) in config.js — lightCore()
 *        interpolates on it rather than on raw charge for exactly that reason — so the closing
 *        light and the slow start at the same instant and bottom out together, and the player can
 *        read their condition off the screen without consulting the rail. The first cut ramped the
 *        alpha of a uniform screen-wide sheet instead; owner: "you are the source light, you emit
 *        the light, but the less light you have, the less far you emit". Gated on `resource.dark`,
 *        which The Shelf (murk), The Twilight (dark) and The Deep (dark) all declare;
 *     3. YOUR DAMAGE, on the chapters whose `resource` declares a `damage` block — currently The
 *        Surf's Humidity alone. resourceDamageMul(charge, res) (config.js) scales linearly from
 *        `damage.floor` at an empty bar to 1.0 at a full one, and both player-damage sites in sim.js
 *        multiply by it; it returns 1 for every chapter with no `damage` block, so this is inert
 *        elsewhere. THIS OVERRIDES THE RULE THE FIELD SHIPPED UNDER. The first cut of this doc said
 *        the bar "scales no damage and no fire rate — deliberately, because those cut the kill rate",
 *        and that reasoning is still correct for Light. The Surf is an explicit owner ruling,
 *        recorded in the design at §5.3 of
 *        docs/superpowers/specs/2026-08-13-book-2-undertow-design.md, which also names what the
 *        original rule was protecting and the mitigations the exception is conditional on: a TUNED
 *        floor constant (HUMIDITY_DMG_FLOOR), and a drain tied to the SANDBARS rather than to the
 *        clock so the player can always see the cause and step off it. Do not "restore" the old
 *        sentence — read §5.3 first, and if the ruling is ever reversed it is reversed there;
 *     4. DROWNING, on the chapters whose `resource` declares a `drown` block — currently The Reef's
 *        Air alone. At an EMPTY bar, stepDrown (sim.js) takes drown.dps as damage over time on a
 *        DROWN_TICK cadence until the bar comes off zero, and reports a death like every other DoT
 *        step. Deliberately the opposite SHAPE from (3): §5.3 spends the book's one licence for a
 *        bar that scales damage on The Surf, whose cause is a place you can step off; empty air is
 *        a state, so it hurts on a clock and stops the instant you breathe. It publishes into the
 *        SHIPPED {type:'hurt', dot:true} contract — no new event — so render.js's existing red
 *        vignette/shake/flash is the tell and main.js's `if (e.dot) continue` keeps it silent.
 * chargeMax: number — the bar's ceiling, as a RUN field (v7.x Book 2 Task 9). Used to be read
 *   straight from CHAPTERS[chapter].resource.max at both of sim.js's clamp sites (the drain in
 *   stepCharge and the per-kill `killBase` at the kill site); now both sites read run.chargeMax
 *   instead, which is what lets BOOK_SHOP.undertow.deepLungs ("Resource Capacity") raise it. Set
 *   once at createRun from the SAME hoisted local `charge` starts at, so the two can never drift
 *   apart into "the bar refills past its cap on a kill, then snaps back on the next drain tick" (a
 *   flicker, not a throw, if only one of the two clamp sites gets the new field). 0 in every
 *   chapter that declares no resource, same as `charge`.
 * chargeDrainMul: number — the drain-rate multiplier (BOOK_SHOP.undertow.slowBurn, "Resource Drain",
 *   -4%/level), applied in stepCharge to CHAPTERS[chapter].resource.drain. slowBurn stores a
 *   POSITIVE perLevel and is SUBTRACTED here (`reduction: true` on the line only flips how
 *   formatShopBonus, ui.js, prints it — it does not touch the sign of the math); floored at
 *   SLOW_BURN_FLOOR (config.js) so a future higher MAX_SHOP_LEVEL cannot invert drain into refill.
 *   1 (no-op) unbought, and 1 in every chapter with no resource.
 * currentResistMul: number — the share of The Tide's push (config.js TIDE) that reaches the player,
 *   applied in stepTide (sim.js). BOOK_SHOP.undertow.currentResist ("Current Resistance", -8%/level,
 *   5 levels) lowers it; floored at CURRENT_RESIST_FLOOR. Enemies are NEVER multiplied by it — they
 *   take the full push, which is what makes the surge read as weather. 1 outside Undertow.
 * chargeRefillMul: number — the refill-rate multiplier (BOOK_SHOP.undertow.bigGulp, "Resource Refill",
 *   +10%/level), applied in stepCharge to CHAPTERS[chapter].resource.refill at the same site the
 *   in-shaft/pool/pocket refill already runs. 1 (no-op) unbought. Does NOT reach The Wreck's
 *   `killBase` — a kill is not "a refill pickup".
 * _burstT: number — seconds of Reef Burst dash remaining (CHAPTERS[chapter].burst). Set by
 *   stepRepulse on the same press, cooldown and charge spend as the Pulse, to BURST_DUR_MIN +
 *   (BURST_DUR_AT_FULL - BURST_DUR_MIN) * t, so an EMPTY bar still dashes — the no-spiral floor.
 *   Read in three places. stepPlayerMovement's lane branch multiplies the forward scroll by
 *   BURST_SPEED_MUL while it is positive (the ONLY thing in the file allowed to change the lane's
 *   scroll rate, because it is the player's own button and not a force acting on them); stepSpurs
 *   forces _scraping false while it is live, which is R13's free crossing; and render.js's
 *   drawBurstWake draws the tail at what is LEFT of it, which is the only cast the duration has.
 *   0 on every run of every other chapter.
 * _shorebreakT: number — seconds of Surf Shorebreak left (CHAPTERS[chapter].shorebreak). Set by
 *   stepRepulse on the same press, cooldown and charge spend as everything else on that button, to
 *   SHOREBREAK_DUR_MIN + (SHOREBREAK_DUR_AT_FULL - SHOREBREAK_DUR_MIN) * t — an EMPTY bar still
 *   gets a crest, the same no-spiral floor _burstT has.
 *   THE ONE THAT IS NOT ADDITIVE: a `shorebreak` chapter's press fires this INSTEAD of the Pulse's
 *   shove, so stepRepulse returns straight after setting it and The Surf emits no `repulse` event
 *   at all. Read only by stepShorebreak, which each frame pushes (an acceleration into e.kb) and
 *   re-stamps e.stunT to SHOREBREAK_STAGGER on every non-ally body within SHOREBREAK_RADIUS of the
 *   player — so the window rides with you rather than staying where the button went down.
 *   render.js reads it directly to draw the crest for as long as it lasts (drawShorebreak).
 *   0 on every run of every other chapter.
 * _clearT: number — seconds of Shelf Clear left (CHAPTERS[chapter].clear). Set by stepRepulse on
 *   the same press, cooldown and charge spend as everything else on that button, to
 *   CLEAR_DUR_MIN + (CLEAR_DUR_AT_FULL - CLEAR_DUR_MIN) * t — an EMPTY bar still parts the murk,
 *   the same no-spiral floor _burstT and _shorebreakT have. ADDITIVE like _burstT: the Pulse's
 *   shove still fires, and the press emits its usual `repulse` event and NO event of its own,
 *   because the widened radius is already carried on that one (see stepRepulse's comment).
 *   Ticked down in stepCharge, which is also the only thing that reads it — it turns it into
 *   `sightCharge` below, and render.js never sees this field at all.
 *   0 on every run of every other chapter.
 * sightCharge: number — WHAT THE PLAYER CAN SEE, in the same units as `charge`, published every
 *   frame by stepCharge and read by exactly one thing: render.js's updateDark, which feeds it to
 *   lightRadius() in place of the raw bar. Equal to `charge` on every frame of every chapter
 *   except the ones where The Shelf's Clear is live, where it is held at chargeMax and then eased
 *   back over the window's last CLEAR_SIGHT_FADE seconds. It exists so the Clear can lend sight
 *   without moving the bar — the alternative, teaching render.js the button, is the shape of the
 *   frozen-enemies scar (sim knew, render was never told). Never lower than `charge`: an upwelling
 *   that refills you mid-window must not make the water darker.
 * _drownAcc: number — the part-tick accumulator for the DoT above, reset to 0 the moment `charge`
 *   comes off zero so a partial tick banked before you reached a pocket is never spent minutes
 *   later. 0 and untouched everywhere else.
 * _lungeT: number — seconds of Wreck Lunge dash left (CHAPTERS[chapter].lunge). Set by stepRepulse
 *   on the same press, cooldown and charge spend as the Pulse, to LUNGE_DUR_AT_FULL * t — and
 *   UNLIKE _burstT/_shorebreakT there is deliberately NO floor term, so an empty bar gets 0 and
 *   falls back to the shipped shove. That is the same no-spiral rule reaching its limit rather than
 *   an exception to it: a lunge exists to buy a kill that refills the bar, so a free one would be a
 *   free refill in the one chapter whose bar is only ever paid for in kills. There was once a
 *   second `t > 0` guard beside it; it was deleted because two guards for one rule mask each
 *   other's defects (see stepRepulse). Read in two places: stepPlayerMovement's non-lane branch
 *   REPLACES the stick with _lungeX/_lungeY * LUNGE_SPEED while it is positive, and stepBite ends
 *   the dash by zeroing it on contact. 0 on every run of every other chapter.
 * _lungeMoved: number — px this dash has carried the player so far, reset to 0 at the press.
 *   stepBite refuses to land while it is 0, and that is a STEP-ORDERING fix rather than a nicety:
 *   stepRepulse runs after stepPlayerMovement and stepBite runs later in the same step, so on the
 *   press frame the player has not moved yet and a body already standing in reach was bitten
 *   instantly — 45 charge for 0px of dash. In a chapter that pays you for standing in a crowd that
 *   is the common case. 0 and untouched everywhere else.
 * _lungeX, _lungeY: number — the unit direction that dash travels, latched at press time from
 *   nearestEnemy (falling back to facingAngle) rather than from the stick, because a bite that goes
 *   where the stick points is a bite you miss with. The press also publishes the angle into
 *   p.facingAngle, which is the field render.js actually rotates the body off — without that the
 *   fish swims sideways through the move. 0 and untouched everywhere else.
 * _starveAcc: number — the Wreck's part-tick accumulator, the exact twin of _drownAcc above and
 *   reset on the same rule. Two fields rather than one because the two DoTs answer opposite
 *   problems (a routing failure vs a tempo failure) and a shared accumulator would let a chapter
 *   declaring both bank one's part-tick into the other. 0 and untouched everywhere else.
 * slicks[i]: { x, y, r, shape, rot, _cell } — v7.x The Wreck: streamed POLLUTION SPILLS, the
 *   chapter's signature (`{ type: 'leak', slicks: {...} }`) and the only thing in it that can kill
 *   you, the roster being food. Same refillCircleAt geometry as run.shafts above, on salt block 50
 *   and its own _slickCellI/_slickCellJ cursor; `blob: true` in the spec, so shape/rot carry a
 *   LOBE_SHAPES outline that sim tests against (inLobe) and render draws from — stored, never
 *   re-derived. A SEPARATE ARRAY from run.shafts deliberately: those are refill circles and
 *   stepCharge loops them handing out resource. Empty in every other chapter.
 * _slickAcc: number — the slick DoT's part-tick accumulator; _drownAcc/_starveAcc's third twin,
 *   separate for the same reason they are separate from each other.
 * _foulT: number — s of oil still on the player. Refreshed to SLICK_SLOW_T every frame inside a
 *   spill and ticked down after leaving, exactly as bloomSlowT/fearT decay. Read in stepPlayer,
 *   where it joins the MIN of the speed floors rather than multiplying into them (see the block
 *   there). The LINGER is the design: a slow that ends at the rim is just a wider slick.
 * orca: null | { state, t, cx, cy, r, ang, x, y, tx, ty, dirX, dirY, hit, splashed, alpha, passes } — The Wreck's apex
 *   predator, in chapters declaring `orca: true`. A SINGLE NULLABLE OBJECT with a countdown, the
 *   same idiom as `net` above and never a pool: there is only ever one, and it is UNKILLABLE (no
 *   hp field, no vulnerability window). `state` walks 'shadow' | 'rising' | 'circling' |
 *   'committing' | 'leaving'; `t` is the seconds left in the current state; (cx, cy)/r are the
 *   closing ring's centre and radius (stepPrey reads them — the wall the shoal will not cross);
 *   (x, y) is the body; ang is its bearing around the ring; (tx, ty) is the point the commit was
 *   aimed at — the coil's own centre, snapshotted at break-orbit and never re-aimed; (dirX, dirY)
 *   is the locked commit heading; `hit` latches the once-per-pass player hit (and, in 'shadow', the
 *   once-per-pass whoosh); `splashed` latches the orcaSplash at (tx, ty); alpha is the fade render
 *   draws with. null between visits and in every other chapter.
 *   'shadow' IS THE OPENING AND IT IS HARMLESS: a silhouette that slides under the player, scatters
 *   the shoal by publishing e.fearT, and clears itself without escalating. No ring, no contact,
 *   no death — foreshadowing, so the shape is learned before it can hurt.
 *   `passes` is the strike lines still owed this visit, ORCA_COMMITS down to 0 — a 'leaving' that
 *   still has one left re-enters 'rising' on a fresh bearing instead of clearing the object, so one
 *   visit is two telegraphed lines. Absent on a 'shadow' object, which never commits at all.
 * _orcaAcc: number — seconds until the next orca event. Seeded at ORCA_SHADOW_FIRST (the first
 *   SHADOW, not the first real visit), then ORCA_SHADOW_GAP / ORCA_SHADOW_LAST_GAP / ORCA_INTERVAL.
 *   ⚠ IT DOES NOT TICK IN REAL TIME. stepOrca's orcaRush multiplies dt by how packed the water
 *   around the player is (run._feedN plus live chum baits WEIGHTED BY THE FOOD LEFT IN THEM, capped
 *   at ORCA_RUSH_MAX), so hoarding a bait ball is what buys the visit — owner: "the more there is
 *   the more it attacks". A bait the shoal has stripped no longer rings the bell.
 * _orcaShadows: number — opening shadow passes still owed, ORCA_SHADOW_PASSES down to 0. While
 *   above zero the countdown produces a harmless pass; at zero the real ladder starts.
 * {type:'orcaShadow', x, y}: an opening pass at its closest approach to the player — fired ONCE per
 *   pass, latched on o.hit, at the midpoint rather than at spawn so the whoosh lands when the shape
 *   is actually underneath you. SFX only (`hole`): the shadow itself is the visual.
 * {type:'orcaSplash', x, y}: the commit passing through (tx, ty), the centre of the coil it just
 *   broke out of — fired ONCE per commit (so ORCA_COMMITS times a visit), latched on o.splashed,
 *   and carrying the AIMED point rather than the body's, so the water goes up where the spiral
 *   closed. Render-only (a big spawnSplash, a T.nova core and droplets); no SFX entry, because
 *   orcaStrike's whoosh is still sounding a quarter-second in front of it.
 * {type:'orcaFeed', x, y}: one prey body eaten by the commit sweep. THE DEATH IS UNCREDITED —
 *   `_dead` and this event, and nothing else (stepLeaks' idiom), so it pays no run.kills, no gem,
 *   no XP, no Bloodlust and no on-kill proc. All of those live inside dealDamage, which this path
 *   never enters. Render-only, no SFX entry: a commit eats a dozen fish in under a second, so a
 *   sound per fish would machine-gun — the strike already has one (`orcaStrike` -> `hole`).
 * _rushT, _rushN: number — BLOODRUSH (gnash's `bloodrush` mod, The Wreck). _rushT is the window in
 *   seconds, refreshed to RUSH_DUR by every bite that actually LANDS; _rushN is how many bites have
 *   stacked, capped at RUSH_MAX_STACKS. Read in stepPlayerMovement, where the pair become a speed
 *   MULTIPLIER (bought, so multiplied — unlike the chapter slows, which MIN-compose). Both drop to
 *   0 together when the window lapses rather than decaying one stack at a time: losing the shoal is
 *   meant to cost the whole run-up, which is what gives the card a failure state.
 * (removed v7.x) killRefill — was light per kill from the Scavenger unlock. Nothing refills a bar
 *   on a kill now except CHAPTERS.wreck.resource.killBase, which sim.js reads straight from config
 *   and no run field mirrors. The save key bm.unlocks.lightThief survives, unread, per R2.
 *   Undertow's own bookMeta entry — see BOOK_UNLOCKS.undertow in config.js). 0 unbought, and 0
 *   in every chapter with no resource. It exists as a RUN field, rather than sim.js consulting
 *   meta, because sim.js must never see meta — see the plan's R1.
 * _driftSeed (sim-internal, not a render contract): a random phase offset (createRun, Math.
 *   random()) folded into stepCurrents' sine-sum field so two runs of the same currents chapter
 *   don't drift identically.
 * _districtSeed (v5.7.x; PROMOTED v5.9.1 to a READ-ONLY sim contract; became THE WORLD SEED in
 *   v5.11): the single seed the entire skies world derives from — elevation, moisture, rivers,
 *   cities, roads, biomes and structure placement (src/terrain.js, re-exported through config.js).
 *   Null for chapters without CHAPTERS[chapter].render.districts AND without CHAPTERS[chapter].
 *   roads (every chapter but skies and, since v6.3, city — see the v6.3 paragraph below for city's
 *   derivation, which differs from skies').
 *
 *   v5.11 replaced the Voronoi district map this used to seed. That map was an independent weighted
 *   die roll per 600px cell, which cannot produce geography — and roads ran on a SEPARATE seed
 *   (_obstacleSeed) as a global infinite lattice, which is why streets used to cross open water and
 *   why render had to gate road drawing per district cell, chopping every street into 600px stubs
 *   ("roads are 10 meters long", playtest report). Everything now shares THIS seed, which is what
 *   lets each layer see the one below it: cities are placed by consulting elevation, streets are
 *   placed by consulting cities. Read terrain.js's header before changing any of it.
 *
 *   createRun passes the raw Math.random() draw through terrain.js's pickWorldSeed, which walks
 *   forward until the world origin is buildable land — the run spawns at (0,0) and terrain.js puts
 *   the home city there unconditionally, so without it a run could open with downtown underwater.
 *   pickWorldSeed is pure, so this still costs exactly ONE draw from the shared Math.random stream,
 *   in the same order as before, and no seeded test can shift. v5.9.1 bugfix ("houses in the sea", playtest report): sim.js's streamObstacles now
 *   READS this field (via districtAt) to pick a new structure's `kind` from the district-
 *   appropriate subset (DISTRICT_STRUCTURE_KINDS, config.js) instead of the full STRUCTURE_KINDS
 *   list — kind used to be a hash roll fully independent of the district, so a suburb house could
 *   land in open water. This is still safe for the seeded test suite: _districtSeed is drawn ONCE
 *   in createRun (unchanged), already spent from the shared Math.random stream at RUN START — sim
 *   reading an EXISTING field costs nothing from that stream and can't shift any later seeded draw
 *   (the AA.c/runStarOnly incident this project keeps citing is about NEW draws mid-step, not about
 *   reading old ones). sim.js still never computes the district map itself, never reads
 *   DISTRICTS or any floor-tint value, and still never branches game LOGIC on which biome it got.
 *   v5.11 widened what sim reads it FOR — a structure's build DENSITY (BIOME_BUILD_DENSITY) and, in
 *   a city, its position and rotation (blockSnap, so buildings line the streets) — but all of that
 *   is still placement and cosmetics: no rule, damage number or spawn depends on the biome.
 *
 *   v6.3 (roads-only chapters, i.e. CHAPTERS.city): DERIVED from _obstacleSeed instead of drawing
 *   its own Math.random() — `pickWorldSeed((obstacleSeed ^ 0x9e3779b9) | 0)`. A skies-style fresh
 *   draw here would desync every seeded test between reseed checkpoints (the AA.c/runStarOnly
 *   scar, third time). _obstacleSeed is already drawn earlier in createRun for any chapter with
 *   `obstacles`, so this costs nothing further from the shared stream. City keeps its dumpster/
 *   hydrant/cone obstacle look (streamObstacles' perKindRadius stays keyed on render.districts,
 *   not on _districtSeed != null) while gaining road exclusion, blockSnap curb alignment and
 *   biome build-density from the same world this seed now describes.
 *
 * v5.8 kaiju redesign — crushing & rampage (skies only, gated on CHAPTERS[chapter].crush; see
 * CRUSH_XP/RAMPAGE_* in config.js and sim.js's stepCrush/stepRampage):
 * rampage: 0..1 meter. Fills by RAMPAGE_GAIN per crushed structure, decays by RAMPAGE_DECAY/s
 *   otherwise — except for a RAMPAGE_GRACE_T-second grace window after the last crush (see
 *   _rampageGraceT below), during which it holds instead of decaying. At 1.0 (and rampageT <= 0)
 *   triggers RAMPAGE: rampageT is set to RAMPAGE_DURATION and the meter itself drains back to 0
 *   across that same window (see stepRampage). Stays 0 forever for any chapter without `crush` —
 *   stepRampage no-ops for them.
 * rampageT: seconds of active rampage remaining; 0 = inactive. The ONLY effect of rampageT > 0 is
 *   that stepCrush's crush radius widens from PLAYER.radius to PLAYER.radius * RAMPAGE_CRUSH_MUL —
 *   player.speed/damageMul are deliberately never touched (see RAMPAGE_CRUSH_MUL's doc in
 *   config.js: both are set once in createRun and read through multipliers elsewhere in sim.js, so
 *   mutating them in place would leak permanently on re-trigger or on death mid-buff).
 * _rampageGraceT (v5.9.1 bugfix, sim-internal, not a render contract): seconds left of "just
 *   crushed something" grace before RAMPAGE_DECAY resumes — reset to RAMPAGE_GRACE_T by stepCrush
 *   on every crush, ticked down (and otherwise ignored) by stepRampage. Exists so a couple of
 *   seconds spent crossing a gap between clusters, or dodging an enemy mid-rampage, doesn't quietly
 *   erase progress the way continuous decay would (design doc §3's "open tuning risk").
 * A structure overlapping the player's crush radius is destroyed OUTRIGHT (no HP, no partial-crush
 * state): spliced from obstacles[] (bumping _obstacleRev), permanently recorded in _crushed (see
 * below), an xp gem dropped via the same run.gems.push path a kill uses (CRUSH_XP, small by design
 * — see its doc in config.js for the xp-flooding hazard this avoids), and one event emitted:
 *   {type:'mow', x, y, r}        the garden mower cut something down (a foliage obstacle, or a web
 *                                it drove the middle of) — x,y = its center, r its radius, which
 *                                only scales the burst. Render throws grass clippings, the mower's
 *                                own particle. A SEPARATE event from 'crush' below on purpose: that
 *                                one is the skies' masonry treatment (brick dust + a permanent ruin
 *                                decal), and a mown shrub must not leave rubble on a lawn. Silent —
 *                                the pass already has its engine noise, and one sfx per felled bush
 *                                would machine-gun the graph exactly as design doc §2 warns.
 *                                See `mows` under lanes[i] below, and stepLanePasses in sim.js.
 *   {type:'crush', x, y, kind}   a structure was destroyed (x,y = its center, kind = the obstacle's
 *                                STRUCTURE_KINDS tag) — render draws collapse + dust, audio maps it
 *                                to a crush sfx (throttled like shoot/hit/zap; see design doc §2).
 *                                v6.3 Task 4: also emitted by city traffic when a car destroys the
 *                                obstacle shielding the player (cover) — see sim.js's findCover and
 *                                stepLanes' sweep branch. Same event shape, same _crushed bookkeeping
 *                                below, reused rather than duplicated; NOT gated on CHAPTERS[..].crush
 *                                (that flag is skies' whole-structure kaiju crush, a separate thing).
 *                                v6.3 Task 4b: that cover-emit's `kind` is forced to 'dumpster',
 *                                NOT the shielding obstacle's own o.kind (still one of the uniform
 *                                STRUCTURE_KINDS) — a shield always bakes as the dumpster prop
 *                                (city's big-prop pick, render.js syncObstacles), so the crush FX
 *                                and the permanent ruin decal (chapterHasRuins) should match what
 *                                was actually standing there, not a random structure silhouette.
 * _crushed (v5.9.1 bugfix, sim-internal, not a render contract): a Set of obstacle `_cell` keys
 *   ('i,j', matching run.obstacles[i]._cell) that have been crushed at least once THIS RUN — added
 *   by stepCrush alongside the splice (v6.3: also by stepLanes' cover branch, sim.js's findCover —
 *   same contract), consulted by streamObstacles (skip any cell in this set,
 *   alongside the existing "still live" skip) so a flattened block stays flattened. Fixes "crushed
 *   buildings reappear after ~1 second" (playtest report): streamObstacles used to rebuild its
 *   `live` set from run.obstacles on every scan and only skip cells STILL present there — a crush's
 *   splice removes the cell from `live`, so the very NEXT cell-boundary crossing (~1.2s at
 *   PLAYER.baseSpeed/OBSTACLE_CELL, unrelated to OBSTACLE_DROP_RADIUS/distance) re-rolled the
 *   identical building right back in. Permanent for the run's duration, never cleared; grows by one
 *   short string per crush. // ponytail: unbounded — a few thousand crushes in an unusually long
 *   run costs a few thousand short strings in a Set, which is fine. Cap it (e.g. evict the oldest
 *   entries past some N) only if a run ever gets long enough for this to matter in practice.
 *
 * v5.3 garden chapter behavior (see CHAPTERS.garden in config.js and sim.js's stepEnemyMovement/
 * stepDiveBomb/dealDamage/stepTrails/stepWebs/stepStrips/stepPlayerMovement):
 * trails[i]: { x, y, t } — fading pheromone nodes dropped by a dying 'trailFollow' ant (dealDamage,
 *   gated on the chapter's signature.type === 'pheromones'). Living trailFollow ants within
 *   PHEROMONE_FOLLOW_RADIUS of any node get a PHEROMONE_SPEED_MUL seek-speed bonus. t counts down;
 *   removed once t <= 0 (stepTrails). No damage, no player interaction.
 * webs[i]: { x, y, r, t } — slow-zone patches dropped periodically by 'webZone' spiders
 *   (stepEnemyMovement, NOT elite-gated) and by the lure's stickyScent mod on burst. While the
 *   player stands in any web, stepPlayerMovement multiplies move speed by WEB_SLOW_MUL (stacking
 *   with the latch debuff via MIN, not multiply). t counts down; removed once t <= 0 (stepWebs).
 * strips[i]: { x, y, angle, len, w, fuse, t, dps, look:'erase', variant?, grow? } — telegraphed
 *   rectangular hazard strips. v6.6.14: the Blank is now the ONLY producer (P3's erasure bands, the
 *   eraser flag's wake, and immuneMemory death residue — the last two tagged variant:'residue'),
 *   so every live strip carries look:'erase'. The garden's pesticide spray used to feed this too
 *   and no longer does; see the 'mower' flag above. fuse (telegraph)
 *   counts down first with NO damage; once fuse <= 0 the strip is live and t counts down while it
 *   ticks dot-flagged {type:'hurt', dmg, dot:true} damage every STATUS_TICK to the player inside
 *   the rotated rectangle (stepStrips), same DoT contract as run.pools. Removed once fuse<=0 && t<=0.
 *   `grow` (seconds, optional — P3's star passes BLANK_BAND_GROW) makes the strip REACH its authored
 *   len over that long once live, expanding from its centre: stepStrips stashes the authored value
 *   in _lenFull on the first live frame and rewrites len every frame after, so both the hitbox and
 *   render.js's rectangle sweep outward. Anything reading len to identify a strip must therefore
 *   read (_lenFull ?? len) — a live growing band is shorter than the constant it was authored with.
 * lures[i]: { x, y, t, dur, aggro, burstR, burstDmg, sticky } — Pheromone Lure decoys (garden
 *   weapon). Enemies within `aggro` of a lure path to it instead of the player (stepEnemyMovement).
 *   t ages to dur, then the lure BURSTS: player-scaled AoE damage (applyDamage) to enemies within
 *   burstR + an {type:'explode', x, y, radius} event, and (sticky, from the stickyScent mod) a
 *   LURE_STICKY_R/DUR slow zone into run.webs (stepLures). Removed on burst. See WEAPONS.lure.
 *   OPTIONAL `bait: true` (The Wreck's Chum) makes it the same object pointed at fleeing animals:
 *   stepPrey inverts its response to the seek target, so a baited fish swims TO it. A bait also
 *   carries `food` (servings left) and `food0` (what it was cast with). Every enemy that reaches
 *   within CHUM_FEED_R takes one serving, once per bait — the fish remembers which bait it ate at
 *   in `_fedBait` (the lure object itself), so a second bait feeds it again. At food 0 the bait is
 *   removed on the spot with a {type:'chumOut'} event, whatever `dur` had left; a bait that ages
 *   out emits the same event rather than the burst path, since burstR/burstDmg are 0 for chum.
 *   render sizes the cloud off `aggro` and counts out one chunk per remaining serving, and
 *   orcaRush weights the orca's arrival by `food` (ORCA_BAIT_FULL_FOOD).
 * {type:'chumOut', x, y}: a chum bait gone — stripped by the shoal or aged out. Render-only, no
 *   SFX entry: it is the quiet end of a zone, and the chapter already sounds the cast.
 *
 * ---- v5.4 chapters (undergrowth/city/skies/beyond) ----------------------------------------
 * Behavior flags added to the enemies[].flags vocabulary above (all documented phase by phase on
 * their tuning blocks in config.js; every one of them is chapter-agnostic, sim.js only ever reads
 * the flag): 'pounce' (undergrowth cat), 'aerialStrike' (owl, untouchable while overhead),
 * 'flashlightCone' (exterminator elites), 'lineCharge' (city vacuum), 'spawner' (van elites),
 * 'strafe' (jet — bank -> telegraph -> run; fires {type:'strafeLock'} once per pass, see below),
 * 'missileVolley' (helicopter -> run.enemyShots), 'artillery' (tank columns AND AA
 * elites -> run.bombs), 'flyover' (city pigeon — passes straight through run.obstacles and nothing
 * else; see stepObstacles), 'phase' (phase flicker), 'pullBeam' (UFO elites),
 * 'guard' (The Surf's Shore Crab: alternates guarded <-> open, refusing DIRECT damage inside a
 * 120-degree arc while guarded — see stepCrabGuard/guardBlocks in sim.js and the CRAB_GUARD_*
 * block in config.js),
 * 'inkjet' (The Wreck's Squid: lays a run.blooms cloud tagged look:'inkjet' at its own position when
 * the player closes inside INK_TRIGGER_R, on a per-fish INK_COOLDOWN. The cloud slows the PLAYER
 * only — see stepInkjet and the INK_* block),
 * 'puffup' (The Wreck's Pufferfish: inflates when the player closes inside PUFFER_TRIGGER_R and
 * refuses EXACTLY ONE direct hit, which pops it; it then drifts at PUFFER_DRIFT_MUL, bitable, for
 * PUFFER_COOL_T before it may inflate again — see stepPuffUp/guardBlocks and the PUFFER_* block),
 * 'tight' (The Wreck's Sardine: read inside stepPrey, it swaps PREY_COHESION_BLEND for
 * TIGHT_COHESION_BLEND and buys nothing else — the ball that will not break).
 * RETIRED v6.9: 'blink' (a crawl punctuated by a burst — it read as teleporting through two
 * rewrites; see the retirement note in config.js before reaching for that shape again).
 * Their phase state lives on sim-internal `_`-prefixed fields following the diveBomb idiom; the
 * ones render.js may read are `e._phaseSolid` (bool, phase's alpha), `e._coneAngle` (rad,
 * flashlightCone's sweep heading), and the guard's PUBLISHED pair `e.guarding` (bool) /
 * `e.guardAngle` (rad, the bearing the guard was raised at and holds for that window). Those two
 * carry no underscore precisely because they are a render contract, not internals: ROSTER_LOOKS
 * .shorecrab reads `guarding` through poseOf to pick the bake and `guardAngle` through faceDir to
 * turn the body. A guard kept private would step, refuse damage, and never appear on screen.
 * `e.puffT` (s, The Wreck's Pufferfish) is published for the same reason and read the same way:
 * ROSTER_LOOKS.pufferfish takes poseOf off it to swap to the inflated ball. guardBlocks also writes
 * `guardAngle` when a puffer pops, so the guardblock spark below is thrown at the player rather
 * than due east. Its cooldown `e._puffCd` and the squid's `e._inkCd` stay private — neither is
 * drawn.
 * {type:'guardblock', x, y, angle}: a direct hit refused by a Shore Crab's raised claw. Pushed
 *   INSTEAD OF {type:'hit'}, never alongside it — a blocked shot removed no HP, and floating its
 *   damage number would be a lie about the one thing the player needs to read. angle = the guard's
 *   held bearing, so the spark can be thrown back along the side that is covered. No SFX entry, and
 *   that is deliberate: it fires on every refused hit, which for a fast weapon is several a second.
 *   The Wreck's Pufferfish pushes this same event when it pops (guardBlocks) — one refusal, one
 *   tell, and the ball deflating on the very next frame is the rest of it.
 * {type:'inkjet', x, y, r} (v7.x, The Wreck's Squid): a cloud squirted. The bloom it leaves fades UP
 *   over BLOOM_GROW_FRAC of its life, which is far too slow to read as a squirt, so this event is
 *   the burst and the bloom is what is left of it. No SFX entry, for the guardblock reason above:
 *   at this chapter's density several squid within INK_TRIGGER_R at once is ordinary.
 * {type:'strafeLock', x, y, angle, len} (v5.9.1 bugfix, see sim.js's stepStrafe): fired ONCE, the
 *   instant a 'strafe' jet's bank ends and its heading locks — the start of STRAFE_TELEGRAPH_T s of
 *   holding position before the fast run. x,y = the jet's (stationary, for the telegraph's
 *   duration) position; angle = the locked heading (rad); len = the nominal distance the run will
 *   travel (px), for render to draw an accurately-scaled incoming-attack line during the wind-up.
 *   Before this event existed the run had no warning at all — see the bug/arithmetic writeup on
 *   stepStrafe in sim.js for why STRAFE_TELEGRAPH_T (0.5s) is enough to actually dodge it.
 * ---- THE CIRCUIT'S THREE EVENTS (v7.x, The Reef) — pushed only where CHAPTERS[id].circuit is set.
 * {type:'swimthrough', x, y, n}: a checkpoint crossed, and the only thing that puts seconds back on
 *   run.raceClock. n is the RUNNING count since the run began, not the index within the lap, so it
 *   keeps climbing past lapLen — the same number stepCircuit counts with, deliberately, so a tell
 *   drawn off the event can never disagree with the clock that banked it.
 * {type:'lap', lap, x, y, split, total}: a lap line crossed. split = seconds since the previous one,
 *   total = run._realTime at the crossing. THE EVENT CARRIES THE READ because the art cannot: at
 *   270px/s the lap line is on screen for about 1.2s and looks like every other stretch of reef.
 * {type:'crash', x, y, speed}: driving INTO the wall hard enough to be billed for it, fired on the
 *   entry frame only. speed is the inward component in px/s — the overshoot DEPTH, not sustained
 *   contact, so grazing along a wall is free and a hard corner is not. Costs circuit.crashMul of
 *   your momentum; the damage is a separate, pre-existing path.
 *
 * traps[i]: { x, y, r, armed, rearmAt, _cell } — v6.5: snap traps, STREAMED by sim.js's
 *   streamTraps (the same _obstacleSeed cell-hash idiom as obstacles/eddies, own salts 15-17) from
 *   CHAPTERS[chapter].signature.traps under the undergrowth's 'predators' signature; [] for every
 *   other chapter, and for a null _obstacleSeed. Never seeded here (generateTraps deleted) — the
 *   old createRun-time scatter went dead the moment a run walked away from the origin. Permanent
 *   field furniture: they never expire, never move, never block movement (they may overlap
 *   obstacles) — they only spring and re-arm. An ARMED trap containing the center of the player OR
 *   of any enemy snaps: it damages THAT ONE entity — BOTH sides, that's the mechanic (kite the
 *   swarm over them) — then armed=false / rearmAt=run.time+SNAP_TRAP_REARM and emits
 *   {type:'explode', x, y, radius:r}. rearmAt is the absolute run.time the trap re-arms (0 while
 *   armed); _cell is the streaming cell key (null for hand-placed test fixtures, which springTrap's
 *   ledger write guards against). See stepTraps/streamTraps in sim.js.
 * _trapRearm (v6.5, Map<cellKey, rearmAt>): persists a sprung trap's re-arm time for cells that
 *   stream OUT of range (see streamTraps' doc in sim.js for why: without this a cell that scrolls
 *   back in would forget it was ever sprung). Materialization reads this ledger to derive a
 *   rematerialized trap's armed state, deleting the entry once it's no longer needed (armed again).
 *   Always present (every chapter) but only ever written/read when the signature is 'predators'.
 * _trapCellI/_trapCellJ (sim-internal, created lazily by sim.js like _eddyCellI/_eddyCellJ): the
 *   last-scanned cell coordinates streamTraps used to skip re-scanning every frame the player stays
 *   in the same cell.
 * wells[i]: { x, y, r, g } — gravity wells, seeded ONCE at createRun (generateWells above) from
 *   CHAPTERS[chapter].signature.wells under the beyond's 'gravity' signature; [] elsewhere. r =
 *   influence radius, g = GRAVITY_FORCE (px/s² at the center, falling linearly to 0 at r). Permanent:
 *   never expire, never move, never damage, never block. They BEND every projectile in flight —
 *   run.bullets, run.homingShots, run.lobs, run.enemyShots — and nothing else (bodies, beams,
 *   orbitals and zones are untouched). Speed is renormalised after the bend: curvature, not
 *   acceleration. See stepGravityWells in sim.js.
 * lanes[i]: { x, y, angle, len, w, phase, t, carT, dmg, sweep, deckLen, deckW, kb, enemyFrac, look,
 *   cover, dot?, hitIds:Set<enemyId> } — a vehicle pass. TWO sources since v6.6.14: the city's
 *   'traffic' signature (look:'car') and the garden's 'mower' elite flag (look:'mower'); empty in
 *   every other chapter. x,y = the band's CENTER, angle = its direction, len/w = its extent.
 *   phase 'warn' (a harmless telegraph) for t seconds, then phase 'sweep' for t = `sweep` while the
 *   vehicle traverses the band: carT goes 0 -> 1 and the vehicle's center is
 *   (x, y) + dir × ((carT - 0.5) × len), dir = (cos angle, sin angle). A deckLen × deckW box on
 *   that center damages BOTH the player and every enemy it touches (dealDamage, once each —
 *   hitIds), plus `kb` knockback along `angle`. An ENEMY takes `enemyFrac` of its OWN maxHP —
 *   every enemy, elites included, so hpScale can never outrun a vehicle. (v6.9.3 retired the taxi's
 *   TRAFFIC_SQUASH roadkill list, which used to one-shot four light rosterIds by dealing them their
 *   remaining hp instead; one rule for the whole roster.) The PLAYER always takes `dmg`. EVERY ONE OF THOSE IS SNAPSHOTTED ON THE LANE — the stepper never
 *   reads the TRAFFIC_ or MOWER_ constants itself, so the two vehicles can differ and a retune
 *   desync a live pass (fields absent => the city's values, which keeps hand-built test lanes
 *   meaning what they always meant). `cover:false` opts out of findCover (a grass stalk does not
 *   stop a mower; render must not ring one as cover either). `dot:true` makes the player hit
 *   dot-flagged — armour-bypassing and granting NO invulnerability, which is why such a lane also
 *   carries its own once-per-pass guard (_hitPlayer) instead of leaning on the invuln window.
 *   `mows:true` (v6.6.25, the mower alone) also CLEARS THE GROUND the deck drives over: obstacles
 *   it touches are felled permanently (spliced + _crushed + _obstacleRev, exactly as stepCrush
 *   does — without the _crushed entry streamObstacles re-rolls the identical bush straight back),
 *   while webs and pheromone trails whose CENTRE it passes over are simply dropped. Those two are
 *   NOT permanent: spiders spin new webs and ants lay new trails, so the lawn stays alive.
 *   Each felled obstacle/web emits {type:'mow', x, y, r} for the clipping burst.
 *   Removed when t hits 0 in 'sweep'. See stepLanes / rollTrafficLane / rollMowerLane in sim.js.
 * v6.3 dispatch beat: {type:'dispatch', x, y} — fired once, at spawnEnemy's own push, the instant a
 *   REAL elite is born (isElite true; never a spawner's forceNormal minions) in a chapter with
 *   CHAPTERS[chapter].dispatch (currently city only) — x,y = the elite's spawn position. No `run`
 *   field, no sim-side follow-up: render draws a brief red strobe there, audio plays a siren, and
 *   ui.js shows a ~2.5s HUD banner ("pest control dispatched") — the tagline finally landing
 *   in-run. See spawnEnemy in sim.js.
 * enemyShots[i]: { x, y, vx, vy, r, dmg, life, turnRate } — the ONLY enemy-owned projectile array,
 *   fed by 'missileVolley' helicopters. Homes toward the player at turnRate rad/s, expires at
 *   life <= 0 (removed, no blast), and on overlapping the player (r + PLAYER.radius) damages the
 *   PLAYER only (normal armor path, respects invuln) and emits {type:'explode', x, y, radius:
 *   MISSILE_BLAST}. Never damages enemies. Bent by run.wells like any other projectile. See
 *   stepEnemyShots in sim.js.
 * debris[i]: { x, y, r, tgt } — Trash Tornado funnels (city weapon). v6.8: NOT the run.orbs
 *   contract any more — these PERSIST between frames, because a funnel hunts and so carries its
 *   own position. stepTornadoWeapon resizes the array to `chunks` and moves each entry: toward
 *   `tgt` (the enemy object it has claimed, sticky while that enemy is alive and its BODY is
 *   inside `hunt` px of the PLAYER — the leash is `hunt + e.radius`, so a big foe is reachable by
 *   its hide rather than its centre) at travelSpeed, or spiralling back into a ring of `radius`
 *   around the player at rotSpeed when tgt is null. Funnels prefer one target each, but double up
 *   on a foe that survives what is already on it rather than idling, and a damage tick is worth
 *   every funnel standing on the body. r = DEBRIS_R. `tgt` is sim-internal — render draws x/y/r.
 * zones[i]: { x, y, r, fuse, dur, dmg, delay?, jetDur?, tick?, nStreams?, jet?, streams?, _cd?,
 *   _chained?, a?, d? }
 *   — telegraphed zones (Burst Hydrant, city weapon; also reused by the Reality Shard's tornSeam
 *   rifts). `delay` (if set) holds the zone DORMANT first — planted but not yet arrived, drawn by
 *   nothing, its fuse not started; that is how one cast staggers its zones without giving them
 *   different-length spawn animations. Then fuse counts down as a HARMLESS telegraph (dur is its
 *   starting value, so render can grow a warning ring from fuse/dur), and the zone erupts for dmg
 *   in r against ENEMIES only (never the player), emitting {type:'explode', x, y, radius:r}.
 *
 *   SHAPE is decided by `d` (v7.29). Without it the zone is a DISC of radius r about (x, y).
 *   With it the zone is a CAPSULE — everything within r of the segment running d px from (x, y)
 *   along heading `a`. Only tornSeam sets a/d, and the eruption event carries them on
 *   {rift, a, d} so render.js draws the identical segment: the seam cuts exactly what it looks
 *   like it cuts.
 *
 *   What happens after the eruption depends on jetDur, and BOTH paths are live:
 *     jetDur > 0  a Burst Hydrant hydrant. It stays up for jetDur (`jet` counts the remaining time)
 *                 as a TURRET: each step it locks the nearest `nStreams` foes within r and hoses
 *                 them, damaging each on its own `tick` cooldown. Nothing else in r is touched —
 *                 r is a RANGE, not a damage area. `_cd` is that cooldown map (enemy id -> next
 *                 time), per HYDRANT, so a foe hosed by two hydrants takes both. `streams` is the
 *                 current target POSITIONS ([{x,y}], sim-written, render-read) — positions and not
 *                 ids so a target dying mid-frame cannot leave render chasing a stale entity.
 *     jetDur nil  a tornSeam seam: one pop and gone. Seams must keep this — a jet field that
 *                 quietly made them persistent would rebalance a weapon in another chapter.
 *   _chained marks a seam. Nothing reads it since v6.10 dropped chainHydrant (`d` is what decides
 *   the shape); it is kept as the "not a Burst Hydrant cast" marker. See stepZones in sim.js.
 * lobs[i]: { x, y, fromX, fromY, tx, ty, t, flight, r, dmg } — Debris Toss chunks (skies weapon).
 *   t counts UP from 0 to flight; x/y are the straight (fromX,fromY)->(tx,ty) lerp at t/flight,
 *   and render adds the parabolic hop (sim only needs t/flight). On landing the chunk bursts ONCE
 *   for dmg in r against ENEMIES only (never the player), emits {type:'explode', x:tx, y:ty,
 *   radius:r} and is removed. A lob is a projectile for gravity-well purposes (a well bends its
 *   landing point) but it is NOT a run.bullets entry. See stepDebrisWeapon/stepLobs in sim.js.
 *   OPTIONAL `snare: hold` (seconds) makes it a NET TOSS instead: same flight, but on landing it
 *   holds everything in r (e.stunT, through the CC-DR budget) and emits {type:'snare'} rather than
 *   {type:'explode'}. The branch sits ABOVE the debrisToss shrapnel block in stepLobs on purpose —
 *   `shrapnel` is read off run.weaponMods for EVERY lob, so a build holding both weapons would
 *   otherwise spray Debris Toss splinters out of the player's fishing nets.
 *   OPTIONAL `look: 'ballast'` makes it a BALLAST drop (The Shelf) instead: the landing deals dmg
 *   in r (x BALLAST_TANK_MUL against e.type === 'tank') and sets e.dragT = BALLAST_DRAG_T on
 *   everything in that same r. It carried a `dragMul` until v7.x, when Foul Water stopped widening
 *   that ring and became a cadence card read at the fire site instead.
 *   It pushed a run.blooms stain until v7.x; the owner cut it because that stain was
 *   Silt Veil's whole card, drawn Silt Veil's way, given away free on a rare.
 *   OPTIONAL `tank: true` makes it an OXYGEN TANK (The Reef) instead: the throw is aimed down the
 *   LANE rather than at a body (fireTank), so the scroll carries the player to their own landing
 *   point; the rupture deals dmg in r, optionally shoves everything in r by TANK_SHOVE_KB
 *   (`shove`, Pressure Wave), plants a run.blooms entry with `airHold` for `boil` seconds, and
 *   emits {type:'rupture'}. Both `boil` and `shove` are banked AT THE THROW. Its branch sits above
 *   the shrapnel block for the same reason the net's and the column's do.
 *   ⚠ run.lobs has THREE render consumers (syncLobs, redrawHazards' amber landing ring, and
 *   drawColumns) and nothing about the array says so -- `look` is what each one filters on.
 * longlines[i]: { x, y, nx, ny, half, len, dmg, tick, acc, life, duration, snagged } — Longline's
 *   set lines (trawl weapon). A SEGMENT, not a disc: (x,y) is the centre, (nx,ny) the unit NORMAL,
 *   `len` the full length and `half` the hit thickness either side. A body is on the line when its
 *   perpendicular distance is <= half AND its distance along the line is <= len/2 — the same two
 *   tests, in that order, as the net wall's netDist/netAlong pair.
 *   The line does not move and is not anchored to the player: it is gear that was SET and is left.
 *   `snagged` is a Set of enemy ids that have already been caught by THIS line — the catch is once
 *   per body per line, never per tick, or a 0.5s stun on a 0.40s tick is a permanent lock (see
 *   LONGLINE_SNAG). `acc` accumulates dt and spends it in whole `tick`s, the run.holes idiom.
 * drags[i]: { id, t, dur, dmg, hitIds } — an aircraft the Tail Lash has hooked and is reeling in
 *   (v7.23 skies). `id` is the enemy's id; t counts UP to dur (LASH_PULL_T). stepDrags moves the
 *   body toward the player and CLEARS its e.kb, so the reel owns that body's motion outright. It
 *   never kills: the hooked aircraft dies on ARRIVAL through stepEnemies' existing `crushable`
 *   branch, which is also why ONLY crushable enemies are ever hooked — a tank dragged to your feet
 *   would just deal contact damage (owner directive). dmg > 0 only with the wreckingBall mod, and
 *   is dealt once per victim per drag (hitIds). See fireLash/stepDrags in sim.js.
 * arcs[i]: { life, duration, charge, tick, acc, dmg, jumps, arcRange, rootRank, falloutBonus,
 *   x, y, nodes } — a live Atomic Breath fork (v7.23 skies). `charge` counts DOWN through
 *   BREATH_CHARGE_T and nothing is struck while it is > 0 (the wind-up is a real telegraph, and
 *   `life` includes it). `nodes` is the polyline [player, body, body, ...] REBUILT on every damage
 *   tick by buildFork, so dead branches drop out and fresh targets snap in mid-burn — that is the
 *   mechanic, not just the look, and it is why this cannot be a run.beams entry (a beam is one
 *   angle and one length; a fork is a chain of segments between bodies, all live at once). x/y
 *   track the ROOT body so IPECAC's extra forks — which anchor on different enemies via rootRank —
 *   are distinguishable. Damage decays BREATH_JUMP_DMG_MUL per jump. See fireBreath/stepArcs.
 *
 * THE SURF's three natives add NO run.* array. Each is built from an entity the game already had,
 * which is the same argument The Twilight's block below makes about reusing run.bombs/run.strips:
 *   - Breaker: a run.novas entry carrying `arc` (full cone angle, radians, centred on `angle`) and
 *     `carry` (px/s^2 of continued outward push). A nova WITHOUT those two behaves exactly as every
 *     nova always has — the sector gate and the carry are both skipped — so no other weapon moved.
 *     `carry` is applied only while a body already in the ring's `hit` set sits within
 *     the ring is alive — which is what makes it a crest carrying a body along rather than a single
 *     bat. The ride is bounded by the front's own NOVA_LIFE and by knockback's decay, so a body
 *     caught point-blank simply rides further than one caught at the crest's edge, which is what a
 *     wave does.
 *     Novas also now carry `lifeMax` beside `life`, so a ring can expand over something other than
 *     NOVA_LIFE (the Skipping Shell's splash needs a much shorter one).
 *   - Skipping Shell and Barnacles: ordinary run.bullets entries tagged weapon:'shell'/'barnacle',
 *     both flagged `_carrier`. A CARRIER DEALS NO CONTACT DAMAGE — stepBullets skips its hit scan
 *     entirely — because the shell's damage is all in the splash novas it leaves at each touch-down
 *     and a larva delivers a status rather than a hit. A shell carries { skips, skipEvery, skipT, r }
 *     and reuses `hitIds` to mean "already skipped toward" (nothing else reads it on a carrier); a
 *     larva carries `_crust`, the crust it will apply.
 *
 * enemy.barnacle: { t, dur, dmg, tick, next, jumps } — A CONTRACT FIELD, published by applyBarnacle
 *   and read by render.js to draw the crust, exactly like frozen/chill/venom/ignite/fearT/stunT. A
 *   status kept in a private field is invisible on screen, and invisible is indistinguishable from
 *   broken. `t` is the live countdown and `dur` a full crust's worth, kept separately so a body
 *   seeded by a nearly-expired parent still gets a full crust. REFRESHED, NEVER STACKED: a second
 *   larva takes the max of each field and carries `next` over, so a stream of larvae can neither
 *   double the tick rate nor hold the tick timer at zero forever. stepBarnacles ticks it, and on the
 *   host's death spreadBarnacle seeds up to `jumps` uncrusted bodies within BARNACLE_JUMP_R —
 *   nearest first, each child inheriting `jumps - 1`, so the chain is bounded by descent however
 *   dense the crowd is. stepBarnacles runs LAST of the weapon steppers, before the dead sweep, so a
 *   host killed by any source this frame still seeds.
 *   {type:'crust', x, y}   a larva has taken hold on a fresh body (not on a refresh).
 *   {type:'skip', x, y, r} one Skipping Shell touch-down. x,y is where it LANDED, r the splash.
 *
 * THE SHELF's three natives add NO run.* array either, on the same argument. Each is an existing
 * entity carrying one extra field, and that field is what the renderer branches on:
 *   - Sunspear: a run.lobs entry carrying `column: true`, whose `fromX/fromY` ARE its `tx/ty` — so
 *     stepLobs' shared lerp moves it nowhere and it simply hangs for SUNSPEAR_FALL and lands. THREE
 *     drawers read run.lobs, and a column must be excluded from two of them: syncLobs (the thrown-
 *     object rig, whose parabola and shadow would make a shaft of light into a thrown rock) and
 *     redrawHazards (the amber Debris Toss landing ring, which double-telegraphs it). drawColumns
 *     owns the look. The landing branch in stepLobs sits ABOVE the shrapnel block for the same
 *     reason the net's does.
 *   - Foxfire: a run.blooms entry carrying `look: 'foxfire'` and `slow: 0`. `look` keeps the Spore
 *     Bloom's own mods off it — stepBlooms reads sporeburst/tideCarried ONCE for the whole list, so
 *     without the gate a build holding both would spore-burst and tide-drift a foxfire — and drives
 *     the cold near-white tint in syncBlooms. `slow: 0` opts it out of the pond's continuous slow.
 *     Its `maxR` is the DARK BONUS ALREADY APPLIED: FOXFIRE_GLOOM is snapshot at cast, so the cloud
 *     keeps the size the bar bought it however the bar moves afterwards.
 *   - Sunlance: a run.beams entry carrying `look: 'sunlance'` with `rotSpeed: 0`. It is NOT `swept`,
 *     which is why `swept` alone could no longer choose the palette — an unswept beam fell into the
 *     Neon Beam's crimson. It takes the third blade bake (T.beamSun). Its `length` is the reach the
 *     bar bought at cast (SUNLANCE_REACH_MIN at empty, full at full) and is never re-read.
 *   {type:'sunspear', x, y, count}  a cast; x,y is the PLAYER (the columns are elsewhere), `count`
 *                                   how many columns it called. Sfx only — the columns draw
 *                                   themselves from run.lobs every frame.
 *   {type:'sunfall', x, y, radius}  one column LANDING. Deliberately no sfx: at L5 that is three of
 *                                   them 0.26s after one cast.
 *   {type:'foxfire', x, y, gloom}   a foxfire kindled. `gloom` is 1 in full light up to
 *                                   FOXFIRE_GLOOM at an empty bar, and drives the spark burst's
 *                                   count and reach — the one moment the dark's bonus is visible as
 *                                   an event rather than as a quietly wider circle.
 *   {type:'sunlance', angle, reach} a lance cast. Carries no x,y: the beam is anchored on the
 *                                   player and drawn from run.beams.
 *
 * THE REEF's two natives (v7.x). One adds no array and one adds the only array Book 2 has needed:
 *   - Pistol Shrimp: a run.beams entry carrying `look: 'snap'` with `rotSpeed: 0`, the Sunlance's
 *     shape. What is new is the ANGLE: it is laneAxes(chapter).angle, the lane's own forward
 *     heading, and never aimAngle — the weapon has no targeting at all and the cross stick is the
 *     aim. Outside a lane chapter it falls back to p.facingAngle (still aimless, still steerable).
 *     `tick` clears `duration`/2, so a body on the line is struck exactly ONCE per snap.
 *   - Fire Coral: run.polyps (see the field above) — the one weapon in the book that could not
 *     reuse an entity, because its band IS a piece of terrain and run.spurs is rebuilt from
 *     scratch on every ridge crossing.
 *   {type:'snap', x, y, angle, reach, backFrac}  one Pistol Shrimp cast. x,y is the PLAYER (the
 *                                   beam is anchored there and drawn from run.beams); `angle` is
 *                                   the lane heading, so the cavitation puff does not re-derive a
 *                                   heading that has already moved. `backFrac` is the REAR crack's
 *                                   damage as a fraction of the forward one — baseline
 *                                   SNAP_BACKBLAST_FRAC, full with Backblast — and render scales
 *                                   the rear puff by it, which is the only place that card shows
 *                                   itself now the rear crack always exists. Takes the throttled
 *                                   'shoot' voice.
 *   Fire Coral emits NO event, deliberately: a whole ridge of the level lighting up is a larger
 *   tell than any burst could add, and at one cast every 3.4-4.4s for a whole run a bespoke voice
 *   is the metronome the 'longline'/'ballast' entries in SFX_FOR_EVENT are both denied for.
 *
 * v5.4 weapons (see WEAPONS/WEAPON_MODS in config.js for the per-weapon mod semantics). Entity
 * reuse rather than new arrays: Quill Burst's quills, Reality Shard's shards, the tornado's flung
 * chunks and Debris Toss' splinters are all ordinary run.bullets entries tagged weapon:'quill' /
 * 'shard' / 'trash' / 'debris' (star's split/chain budgets zeroed, exactly like the
 * stinger's needles); the Chitter Shriek is a run.novas entry carrying `fear` (s); the Pulsar
 * Beam is a run.beams entry carrying `swept: true` + `arms` (n arms evenly around the circle,
 * sweeping together) + `collapseBonus`. New events:
 *   {type:'clawRake', x, y, angle, range, arc}      a Claw Rake slash (same shape as 'whip'; x,y =
 *                                                   the player — the rake never moves them)
 *   {type:'roar', x, y, angle, range, arc}          a Roar sector sweep (same shape as 'whip')
 *   {type:'tail', x, y, angle, range, hooked}       a Tail Lash (v7.23). NOT a sector: `range` is
 *                                                   the LINE's length along `angle`, there is no
 *                                                   arc, and `hooked` is how many aircraft this
 *                                                   cast caught (render lands a heavier shake
 *                                                   when it caught something).
 *   {type:'breath', x, y}                            an Atomic Breath cast — the wind-up ring and
 *                                                   the fork are drawn from run.arcs, so this is
 *                                                   only the screen kick + sfx beat.
 *   {type:'arc', nodes}                              one Atomic Breath damage tick; `nodes` is the
 *                                                   fork polyline it struck along (sfx + render).
 *   {type:'hydrant', x, y}                           a Burst Hydrant cast (x,y = player, for sfx;
 *                                                   the zones live in run.zones above)
 *   {type:'toss', x, y}                             a Debris Toss cast (x,y = player, for sfx)
 *   {type:'shoot', weapon:'quillBurst'|'realityShard'|'chitterShriek'}  volley/cast fired
 * player.vx/vy (v5.4): the player's own input velocity in px/s this frame (0 while standing still;
 *   drift/pull forces are NOT folded in). Written by stepPlayerMovement, read by the 'artillery'
 *   flag to lead its shells (ARTILLERY_LEAD).
 *
 * levelUpChoices[i]: { kind:'weapon'|'passive'|'mod'|'element'|'anomaly'|'heal', id, title, desc, tag, rarity, icon, bonus, weapon? }
 *   rarity: key of RARITIES (a `New!` weapon: inherent; passives/mods/elements: rolled). icon: from
 *   config. v6.7.5: a weapon UPGRADE card carries UPGRADE_RARITY ('upgrade'), which is NOT a
 *   RARITIES key — ui.js renders no chip for it, because levelling a weapon you own is not a
 *   jackpot and applyChoice's weapon branch never reads rarity anyway.
 *   bonus: passives/mods/elements only — the pre-multiplied amount applyChoice will add. v6.3.4:
 *   a passive with a PASSIVES[id].values table (armor/regen) uses fixed per-rarity amounts instead
 *   of base*mult, and only ever rolls normal/rare/legendary — it never appears at epic/mythic.
 *   kind 'mod': weapon mod upgrades (see WEAPON_MODS in config.js), offered only while the
 *   owning weapon (choice.weapon, a weapon id) is owned. run.weaponMods[weapon][id] accumulates
 *   applied bonus; run.weaponModPicks[weapon][id] counts picks (max MAX_WEAPON_MOD_PICKS),
 *   mirroring passives/passivePicks.
 *   kind 'element': elemental infusions (see ELEMENTS in config.js), offered always.
 *   run.elements[id] accumulates applied potency; run.elementPicks[id] counts picks (max
 *   MAX_ELEMENT_PICKS), mirroring passives/passivePicks.
 *   kind 'anomaly' (v6.7.6, see ANOMALIES in config.js): the sixth rarity tier. Carries NO bonus
 *   key at all — it buys a rule change, not a number — and has no levels, so applyChoice only
 *   records it and eligibleAnomalyIds filters it out of every later pool. At most one per screen,
 *   and never a screen's only card (a forced pick may not be "take a curse or take a curse").
 *   It is the only kind carrying `from`: the fiction line naming why this card appeared now,
 *   rendered by ui.js on its own wrapping row (tag is empty — that pill does not wrap).
 *
 * anomalies (v6.7.6): {id: true} for each anomaly taken this run, read at trigger sites in sim.js
 *   (unstableCores -> rollAffixes gives every elite the `volatile` affix). Never serialized —
 *   `run` is not saved — and never migrated for the same reason.
 *   v7.5: the value is `true` for every card EXCEPT `specialist`, which stores the WEAPON ID it
 *   named (a string). Both are truthy, so `run.anomalies?.x` reads are unaffected; anything that
 *   needs the weapon tests `typeof === 'string'` (sim.js specialistFocus).
 * _eliteKills (v6.7.6): elites killed this run. Gates anomaly `when` predicates; run.kills counts
 *   every enemy and so cannot answer "has this player met an elite yet".
 * _hitsTaken (v7.2): real hits taken this run — incremented in hurtPlayer's NON-dot branch only.
 *   Gates BERSERK (>0) and MARTYR (>=3): both cards are about being hit, so neither should be
 *   offered to a player the run has not yet hit. DoT is excluded on purpose — OVERLOAD's own drain
 *   is self-inflicted and would otherwise open both gates on a timer rather than on play.
 * _berserkT (v7.2): seconds left on BERSERK's damage window. Set to BERSERK_DURATION by every
 *   non-dot hit (no cooldown, no threshold — owner ruling) and ticked down in stepAnomalies.
 * _stillT (v7.2): seconds of continuous NO MOVEMENT INPUT, for STILLNESS's damage ramp. Reset by
 *   stepPlayerMovement on any stick deflection at all. Reads INPUT, never velocity: pond's
 *   currents shove the player every frame and the beyond lane advances them regardless, so a
 *   velocity test would pin the ramp at zero in exactly two chapters and nowhere else.
 * _bloodPact (v7.2): BLOOD PACT's accumulated damage bonus, as a fraction (0.15 = +15%). Grows by
 *   BLOOD_PACT_PER_KILL on every kill and additionally by BLOOD_PACT_PER_ELITE on an elite.
 *   Uncapped by design; read back through anomalyDamageMul.
 * _overloadAcc (v7.2): the fractional HP OVERLOAD has drained but not yet spent. The cost is
 *   0.75 HP/s and hurtPlayer's dot branch floors at 1 HP, so the fraction MUST be banked and paid
 *   in whole points — handing it a per-frame 0.0125 would round to 0 and be floored back to 1,
 *   costing 60 HP/s.
 * _screensSinceAnomaly (v6.7.8): anomaly pity. Level-up SCREENS the tier was ELIGIBLE on since the
 *   last one its roll fired on, INCLUDING the screen currently being built — stepLevelUp advances
 *   it once per screen, before calling buildLevelUpChoices, so the count is 1 on a screen with no
 *   dry screens behind it and sim.js's weight term is (count - 1) * ANOMALY_PITY_PER_SCREEN (see
 *   anomalyWeightFor). Advancing it in stepLevelUp rather than in the builder is what stops a
 *   REROLL pumping it: the reroll purchase (sim.js's rerollLevelUpChoices, see below) re-deals the
 *   screen by calling the builder again, so a counter kept in the builder would step on every
 *   re-deal and let coins buy the rarest tier. v6.7.9: a screen
 *   the tier is ineligible for (level floor, `when` false, all cards taken) does NOT advance it —
 *   credit is earned only where it can be spent, or the first Rupture of every run clusters on the
 *   screens right after ANOMALY_MIN_LEVEL. Zeroed by rollAnomalyCard when the roll fires — when
 *   the tier is OFFERED, not when the card is kept — and capped in weight by ANOMALY_PITY_CAP.
 *   Never serialized.
 * _duoDry (2026-08-23): duo-boon pity, as { [modId]: screens }. A DUO BOON is a weapon mod carrying
 *   `needs: '<weaponId>'` (config.js's WEAPON_MODS header) — a mod on weapon A that pays out
 *   through weapon B, so it cannot exist until the run holds both. That gate is already the card's
 *   whole scarcity, so the pool stops charging it the ordinary lottery on top: it holds a RESERVED
 *   candidate slot (eligibleWeaponModCandidates), and once it has been live for DUO_PITY_SCREENS
 *   screens without being offered it takes the next mod card outright (rollCard's mod branch,
 *   before any rarity is consulted — the rarity roll is what was hiding it, `values: { epic: N }`
 *   admitting it on 7% of mod rolls).
 *   Which boons are live is liveDuoMods (sim.js) and nowhere else, because this counter and the
 *   pool must agree screen for screen about which screens are dry. Advanced by stepLevelUp, once
 *   per screen, so a paid re-deal cannot pump it; zeroed by buildLevelUpChoices for every duo boon
 *   on the FINAL card list — after the anomaly swap and the new-weapon floor, since either can
 *   overwrite the slot, and a boon that was deleted was never offered. Spent on the OFFER, not the
 *   pick, so declining costs the credit and the boon returns DUO_PITY_SCREENS later.
 *   Never serialized.
 *   (v7.20 REMOVED _screenAnomaly, the per-screen memo that used to sit here. It froze the tier's
 *   answer for a whole screen so a reroll could neither draw a Rupture nor lose one — which stopped
 *   coins farming the tier but left an unwanted Rupture occupying a slot through every paid
 *   re-deal. The tier is an ordinary card now: rolled fresh on every deal, at ANOMALY_REROLL_MUL of
 *   its weight on the paid ones. Measured, undergrowth d3, rerolling until it shows: base pity
 *   5.8% -> 21.9% over 5 rerolls, saturated 20.7% -> 57.9%, against the pre-v6.7.9 leak's 75.5%.)
 * _screenRerolls (v6.7.10): rerolls PAID FOR on the screen currently open. rollCard multiplies the
 *   `normal` rarity weight by REROLL_RARITY_DECAY ^ min(this, REROLL_RARITY_CAP), so rerolling
 *   buys bigger numbers; it never reaches the anomaly tier (which rolls against the sum of the
 *   UNDECAYED table — see rollAnomalyCard), the weapon bucket's `New!` weights, or a `switch`
 *   mod's offer rate. Zeroed by stepLevelUp when a screen opens, stepped by sim.js's
 *   rerollLevelUpChoices — the whole reroll purchase, which main.js's onReroll calls and which owns
 *   the _rerolls bump beside it (v6.7.11: while that bump lived in main.js it was the one
 *   production write to this field, and since test/sim-test.js never imports main.js the entire
 *   feature could be deleted with the suite green). Never serialized.
 *   IT COUNTS PURCHASES, NOT BUILDS — deliberately, and this is the field's whole hazard. Counting
 *   builds (incrementing inside buildLevelUpChoices) reads identically on the shipped path and is
 *   wrong everywhere else: ~15 sampling loops in test/sim-test.js and the survival rig in
 *   scripts/pool-probe.mjs reuse one run across thousands of builds, so each would saturate at
 *   REROLL_RARITY_CAP after three iterations and then measure the 3-reroll distribution while
 *   reporting it as the base rate. That is not hypothetical: forcing the cap on turns run PB1 red
 *   (city/2 rare 33.4% overtaking normal-tier share). So a test or harness that wants the decayed
 *   pool sets this field (scripts/pool-probe.mjs --rerolls=N does exactly that) or calls
 *   rerollLevelUpChoices; one that wants the base rate need do nothing.
 *   ITS UNIT IS THE SCREEN AND THE PRICE'S UNIT IS THE RUN. rerollCost escalates on _rerolls, so
 *   reaching REROLL_RARITY_CAP costs 48 coins on a run's first rerolled screen, 161 after three
 *   prior rerolls and 542 after six, against ~251 coins earned in a whole mortal body/2 d3 run.
 *   The mismatch is deliberate-but-open — see the REROLL_RARITY_DECAY block in config.js.
 *
 * v4.5 gold sinks (see CONSUMABLES/REROLL_* in config.js):
 * consumables: run.consumables is the array of CONSUMABLES ids (opts.consumables passed to
 *   createRun, default []) bought pre-run and spent at run creation:
 *     'revive'    -> run.revives = 1 (see below)
 *     'headstart' -> player.xp pre-loaded to xpForLevel(1) + xpForLevel(2) so stepLevelUp
 *                    (sim.js) fires twice naturally on the first 'playing' frames, banking
 *                    two level-ups before any enemy is killed
 *     'charged'   -> the starting weapon entry (weapons[0]) begins at level 2 instead of 1
 * revives: count of revives remaining this run (1 if 'revive' was bought, else 0). Consumed
 *   by hurtPlayer (sim.js): instead of dying, the player is restored to maxHP *
 *   REVIVE_HP_FRAC, granted REVIVE_INVULN invulnerability, and every enemy within
 *   REVIVE_SHOVE_RADIUS is knocked back (a {type:'revive', x, y} event fires — see above).
 * _devUsed: true once devTake (sim.js) has put a hidden-dev-menu card into this run. Absent on a
 *   normal run — it is never initialised in createRun, because the honest default is "this field
 *   was never set" and every reader is a truthiness test. endRun (main.js) submits no leaderboard
 *   score when it is true; nothing else reads it and it affects no simulation. It is no longer the
 *   whole of the "dev runs don't count" rule — meta.dev is the other half, and the bigger one: the
 *   card list only opens while that toggle is on, so this flag cannot be true without it.
 * _rerolls: count of level-up rerolls used so far this run (sim.js's rerollLevelUpChoices steps it
 *   and prices the next reroll off it via rerollCost(run._rerolls) — see config.js; main.js only
 *   reads it back to label the button).
 *   Rerolls are paid from run.coinsEarned (this run's coins), never the meta bank (v5.1).
 *   coinsEarned is clamped to COIN_CAP_PER_RUN (config.js, v6.4.2) on every pickup — see
 *   coinsEarned's own field doc below.
 *   Rerolling is just calling buildLevelUpChoices again — with one thing carried across the call:
 *   the purchase also steps _screenRerolls (above), which is the only state that makes the rebuilt
 *   screen differ in distribution from the one it replaced.
 * choiceSlots (v4.8): how many cards buildLevelUpChoices rolls for every level-up this run —
 *   snapshotted from bm.choiceSlots (the run's own book — meta itself for book 1, meta.books[id]
 *   for book 2+, see bookMeta) at createRun and clamped THERE into [2, MAX_CHOICE_SLOTS]
 *   (config.js) — R3 clamp-on-use, since a book's own entry may legitimately store a higher
 *   ceiling written by a future build (see ensureBookMeta) — then constant for the run's duration
 *   (unlocking a slot mid-meta-shop never retroactively changes an in-progress run). Permanently
 *   unlocked in the meta shop by sacrificing SHOP levels (see sacrificeCost in config.js and
 *   hooks.onSacrifice in main.js).
 *
 * v5.24 — The Blank (hidden scripted boss chapter, gated on CHAPTERS[chapter].scripted; see
 * BLANK_* in config.js and sim.js's stepBossScript, the chapter's ONLY spawner). v6.3.1 doubled
 * its waves, quadrupled boss HP (BLANK_BOSS_HP), gave P1 its own faster speed
 * (BLANK_BOSS_SPEED_P1), made desperation fight-wide (not P3-only), and added two difficulty-ladder
 * mutators built entirely from this existing machinery: crossReactive (d2+, each phase also runs a
 * SECOND, borrowed read from a neighboring phase — no longer "one read per phase") and
 * affinityMature (d3, each phase's own read runs deeper: more trail points, more bind nodes, more
 * fan shots, an 8-arm star instead of a cross).
 * script: null for every ordinary chapter; for a scripted one, { stage, waveIdx, waveT, spawned,
 *   bossId }, the whole state machine driving BLANK_SCRIPT (config.js). stage indexes the script
 *   (even = wave block, odd = boss phase); waveIdx/waveT track progress through a wave block's 3
 *   ring-spawned waves (advance on clear OR BLANK_WAVE_TIMEOUT, whichever first); spawned marks
 *   whether the current stage's enemies/boss have gone out yet; bossId is the current phase's
 *   run.enemies id (or null), used to detect its death by absence next frame — same pattern the
 *   design already uses for every kill (kill events carry no id). A non-final phase kill also
 *   force-kills any binding nodes still alive so their slow can't bleed into the next block.
 * trail: the ring buffer of recent player positions, {x,y} sampled every BLANK_TRAIL_DT and capped
 *   at BLANK_TRAIL_MAX entries (shift on overflow). SAMPLED IN EVERY CHAPTER, by stepTrail — it
 *   lived inside stepBossScript until v7.x, which returns early for anything unscripted and so left
 *   the buffer permanently empty outside The Blank. Two consumers: P1's (and, at d2+, P2/P3's
 *   borrowed) reads detonate it, and every `pastSeek` creature aims at a sample behind its newest
 *   end. The pastSeek read is guarded, so an empty buffer degrades that flag to a plain seek in
 *   silence — which is exactly what it did everywhere but The Blank for the whole life of the flag.
 * bossBar: null whenever no scripted boss is alive; while one is, { hp, max, stage } mirrors the
 *   current phase entity so ui.js can render a boss HP bar without reaching into run.enemies
 *   (rampage pattern: the field always exists, stays inert for every non-scripted chapter).
 * The chapter reuses two existing generic entities rather than adding new run arrays: run.bombs
 *   (telegraph->blast) carries `src:'trail'` for every trail detonation (P1's own read, and at
 *   d2+ P2's borrowed spread read / P3's borrowed echo — all through sim.js's shared
 *   detonateTrail helper), and run.strips (telegraph->active rotated rect, PLAYER-only damage)
 *   carries a render-only `look:'erase'` for P3's erasure bands/star, the eraser flag's wake, and
 *   the immuneMemory mutator's death residue — the latter two also carry `variant:'residue'`
 *   (render.js dims them) so they read as distinct from the boss's own untagged bands. immuneMemory
 *   (d3) residue is no longer wave-only: any scripted-chapter corpse leaves it, including P3's
 *   recruit faucet.
 * New events: {type:'bossSpawn', x, y, stage} (stage 1 = first arrival, 2/3 = a phase reforming),
 *   {type:'bossDead', x, y} (the final phase's kill only — this IS the win, run.phase='victory'
 *   follows), {type:'yank', x, y} (a P2 binding-node timeout dragging the player toward the boss).
 * v6.2 events: {type:'shriek', x, y, radius} (chitterShriek cast — was a generic 'shoot'; violet
 *   panic rings), {type:'blink', x, y, tx, ty} (a realityShard bullet skipped from (x,y) to (tx,ty)).
 */
export function createRun(meta, opts = {}) {
  // createRun(meta, 'undergrowth', 3) used to be silent: opts is a string, opts.chapter is
  // undefined, and you measure `body` at difficulty 1 while believing otherwise.
  if (typeof opts !== 'object' || opts === null)
    throw new TypeError(`createRun(meta, opts): opts must be an options object, got ${typeof opts}`)
  // Hoisted above every shopBonus call: the book decides which purse those bonuses come from,
  // and shopBonus at the old first-statement position ran 31 lines before `chapter` existed
  // (see R1's note below, unchanged in meaning — only moved).
  const chapter = resolveChapterId(opts.chapter)
  const bookId = bookOf(chapter) ?? BOOK_ORDER[0]
  const bm = ensureBookMeta(meta, bookId)
  const maxHP = PLAYER.baseHP + shopBonus(bm, bookId, 'maxHP')
  // Pre-run modifiers (see MUTATORS + difficulty consts in config.js and the doc block above):
  // opts.difficulty (1..MAX_DIFFICULTY, default 1) stacks its enemy-HP AND enemy-damage tax on
  // top of mutators (v6.3.4 anti-turtle: HP-only difficulty made runs longer, not more dangerous).
  // v6.4.1/v6.4.3: explicit difficulty 1 of the onboarding chapters (EARLY_CALM in config.js) also
  // thins the swarm and fattens xp per kill, per chapter — see early-calm gate below. v6.4.5: some
  // chapters additionally carry a CHAPTERS[id].balance block that eases spawn/damage at EVERY
  // difficulty (dailies included) — see the chapter-balance block below, which stacks on top.
  const difficulty = opts.difficulty ?? 1
  const mods = mergeMutatorMods(opts.mutators ?? [])
  mods.enemyHpMul *= difficultyHpMul(difficulty)
  mods.enemyDmgMul *= difficultyDmgMul(difficulty)
  mods.coinMul *= difficultyCoinMul(difficulty)
  // Chapter snapshot (v5.0, see CHAPTERS in config.js): opts.chapter (default 'body') picks the
  // chapter's starter weapon and, via CHAPTERS[run.chapter].weapons, scopes sim.js's level-up
  // weapon pool (weaponCandidates/buildLevelUpChoices) to that chapter's natives for the whole
  // run. Caller (main.js) is responsible for sourcing opts.difficulty/opts.mutators from that
  // same chapter's meta.chapters[id] ladder — createRun itself doesn't read
  // meta.chapters. main.js keeps that contract across the fallback below by resolving meta.chapter
  // through the SAME helper before it reads any ladder (see resolveChapterId in config.js).
  //
  // R1 — VALIDATE TABLE-BACKED POINTERS AT THE CONSUMER (docs/superpowers/specs/2026-08-04-cross-
  // device-save-sync-tech-strategy.md §2.4). opts.chapter comes from meta.chapter, which is a
  // POINTER INTO CHAPTERS rather than data, and loadMeta only defaults it when MISSING. So a save
  // written by a build that shipped a chapter this one lacks used to hand an unknown id straight to
  // CHAPTERS[id].balance below -> TypeError out of the Play handler. The guard belongs here, at the
  // consumer, exactly like i18n.js's setLang and ui.js's `CHAPTERS[x] ?? CHAPTERS.body` — NEVER as
  // a repair inside loadMeta, because an old build saves on every chapter switch, run end and
  // purchase, so a load-time repair would be written back over the newer save. resolveChapterId
  // documents why it tests CHAPTERS membership with Object.hasOwn rather than CHAPTER_ORDER
  // membership or truthiness ('blank' is a real chapter outside the order; '__proto__' is not one).
  // (chapter itself is resolved above, hoisted ahead of the book/shopBonus lookups it now feeds.)
  // v6.4.1/v6.4.3 early-calm (see EARLY_CALM in config.js): explicit-difficulty-1 runs of the
  // onboarding chapters thin the swarm and fatten each kill's xp, per chapter. opts.difficulty
  // (not the defaulted local) on purpose — tests omit it and must keep baseline.
  // Keyed on the VALIDATED id so an unknown chapter degrades to a real body run, easing included.
  const calm = opts.difficulty === 1 ? EARLY_CALM[chapter] : null
  if (calm) {
    mods.spawnMul *= calm.spawnMul
    mods.xpMul *= calm.xpMul
  }
  // v6.4.5 chapter-wide balance (CHAPTERS[id].balance): body/pond run gentler at every
  // difficulty, dailies included — unlike EARLY_CALM this has no explicit-difficulty gate.
  const bal = CHAPTERS[chapter].balance
  if (bal) {
    mods.spawnMul *= bal.spawnMul ?? 1
    mods.enemyDmgMul *= bal.enemyDmgMul ?? 1
    mods.enemyHpMul *= bal.enemyHpMul ?? 1
    mods.xpMul *= bal.xpMul ?? 1
    mods.maxAliveMul *= bal.maxAliveMul ?? 1
    // NOT a multiply: this one is a tilt around 0, read by spawnTiltMul in stepSpawning. Absent
    // everywhere but The Shelf, and 0 there means the shipped flat curve.
    mods.spawnTilt = bal.spawnTilt ?? 0
  }
  // Pre-run consumables (see CONSUMABLES in config.js and the doc block above).
  const consumables = opts.consumables ?? []
  const hasHeadstart = consumables.includes('headstart')
  const startXp = hasHeadstart ? xpForLevel(1) + xpForLevel(2) : 0
  const startWeaponLevel = consumables.includes('charged') ? 2 : 1
  // v6.3: hoisted out of the object literal below so _districtSeed can derive city's world seed
  // from the SAME draw _obstacleSeed uses, rather than spending a second Math.random() call — no
  // draw happens between here and where _obstacleSeed used to sit, so the order this consumes the
  // shared stream in is unchanged (see _districtSeed's doc block above).
  const obstacleSeed = usesObstacleSeed(CHAPTERS[chapter]) ? (Math.random() * 0x7fffffff) | 0 : null
  // A chapter's starter is normally one weapon id; The Blank's is an ARRAY, and the run rolls one
  // out of it. Drawn AFTER obstacleSeed so every string-starter chapter's random stream is unchanged.
  const starter = CHAPTERS[chapter].starter
  const starterId = Array.isArray(starter) ? starter[(Math.random() * starter.length) | 0] : starter
  // v7.x Book 2 Task 9 (deepLungs): the chapter resource bar's ceiling, hoisted into a local so it
  // is authored ONCE and shared by both `chargeMax` and the starting `charge` below — a value this
  // repo's own CLAUDE.md documents as its single largest silently-drifting defect class when
  // written twice. Used to be read straight from config at both of sim.js's clamp sites (the drain
  // in stepCharge and the per-kill `killBase`); now it is a RUN field so deepLungs can raise
  // it, and sim.js reads run.chargeMax at both sites instead of CHAPTERS[chapter].resource.max.
  const chargeMax = (CHAPTERS[chapter].resource?.max ?? 0) * (1 + shopBonus(bm, bookId, 'deepLungs'))
  return {
    phase: 'playing',
    time: 0,
    events: [],
    chapter,
    difficulty,
    // COSMETIC ONLY - nothing in sim.js reads it. render.js latches it in reset() beside playerForm
    // and swaps the player's baked body for the cheeks one; the skin is bought per BOOK, like every
    // other shop line, so it dresses whichever body this book uses. DEV wears it outright, same
    // permission-is-the-flag idea as the WIP chapters — the point of dev mode is to see it.
    skin: shopLevel(bm, 'cheeks') > 0 || meta?.dev === true ? 'cheeks' : null,
    mutators: opts.mutators ?? [],
    mods,
    consumables,
    revives: consumables.includes('revive') ? 1 : 0,
    _rerolls: 0,
    // R3 clamp-on-use: bm.choiceSlots (this run's book — see bookMeta above) may legitimately
    // store a future build's higher ceiling (loadMeta/ensureBookMeta no longer cap it), but
    // sim.js's buildLevelUpChoices must never deal more cards than the level-up screen is laid out for.
    choiceSlots: Math.max(2, Math.min(MAX_CHOICE_SLOTS, Number(bm.choiceSlots) || 2)),
    player: {
      x: 0, y: 0,
      hp: maxHP, maxHP,
      speed: PLAYER.baseSpeed * (1 + shopBonus(bm, bookId, 'moveSpeed')),
      magnet: PLAYER.baseMagnet * (1 + shopBonus(bm, bookId, 'magnet')),
      critChance: PLAYER.baseCritChance + shopBonus(bm, bookId, 'critChance'),
      critDamage: PLAYER.baseCritDamage + shopBonus(bm, bookId, 'critDamage'),
      damageMul: 1 + shopBonus(bm, bookId, 'damage'),
      // v7.17: the player's own crowd-control price. Its OWN stat rather than a read of damageMul,
      // so damage passives cannot launder a card's discount away and a damage-UP card (BRITTLE, x4)
      // cannot inherit a control buff. Cards set it explicitly — see applyAnomalyOnTake.
      ccMul: 1,
      fireRateMul: 1 + shopBonus(bm, bookId, 'fireRate'),
      coinGainMul: 1 + shopBonus(bm, bookId, 'coinGain'),
      xp: startXp, level: 1, xpNext: xpForLevel(1),
      invuln: 0,
      slowT: 0,           // s remaining of the latch-flag movement debuff (see doc block above)
      facing: 1,          // 1 right, -1 left (render flips the face)
      facingAngle: null,  // v5.0: last non-zero move direction (full angle, rad); null until first
                          // move. Render orients the pond tail to it; the Flagella Whip aims at the
                          // nearest enemy and only falls back here when none exists (see fireFlagella).
      moving: false,
      vx: 0, vy: 0,       // v5.4: this frame's own input velocity, px/s (see the doc block above)
    },
    // A chapter with no `starter` starts UNARMED, and the empty array is the whole point: a
    // `{ id: null }` entry is not "no weapon", it is a corpse that every consumer dereferences.
    // effectiveWeaponStats reads `WEAPONS[w.id].levels` from stepWeapons EVERY FRAME, so a null id
    // throws on frame 1 — and test/sim-test.js's `run()` has no try/catch, so that one TypeError
    // ends the whole synchronous suite: every scenario after it never runs and never reports. A
    // genuinely empty array is already safe and already exercised (dozens of scenarios disarm the
    // player with `run.weapons = []` mid-test), and render.js never reads run.weapons at all.
    weapons: starterId ? [{ id: starterId, level: startWeaponLevel }] : [],
    // Which weapon this run STARTED on, published rather than inferred. It is weapons[0] today —
    // nothing removes or reorders that array — but that is an ordering accident, not a contract,
    // and the one consumer is a LEADERBOARD row: read positionally, the first mechanic that drops
    // or re-sorts a weapon would credit a public record to the wrong one, with nothing thrown.
    starterId,
    weaponTimers: {},      // id -> s until next fire
    // accumulated applied bonuses (base * rarity mult per pick) and pick counts
    passives: Object.fromEntries(Object.keys(PASSIVES).map((id) => [id, 0])),
    passivePicks: Object.fromEntries(Object.keys(PASSIVES).map((id) => [id, 0])),
    // per-weapon mods (see WEAPON_MODS in config.js), offered only while their owning weapon
    // is equipped: { [weaponId]: { [modId]: accumulatedBonus } } / { [weaponId]: { [modId]: pickCount } }
    weaponMods: Object.fromEntries(Object.keys(WEAPON_MODS).map((wid) =>
      [wid, Object.fromEntries(Object.keys(WEAPON_MODS[wid]).map((mid) => [mid, 0]))])),
    weaponModPicks: Object.fromEntries(Object.keys(WEAPON_MODS).map((wid) =>
      [wid, Object.fromEntries(Object.keys(WEAPON_MODS[wid]).map((mid) => [mid, 0]))])),
    // elemental infusions (see ELEMENTS in config.js), offered always
    // TEST GATE: the elements redesign runs only while this is true. Per-run and OFF by
    // default — seven taps on the HUD coin badge opens the dev screen, whose first row toggles it.
    // Deliberately not persisted: a flag that survives a reload is one you forget is on.
    // ponytail: temporary. When the redesign is accepted or dropped, this field and the loser's
    // code path both go — see the EL_* block in config.js.
    elements: Object.fromEntries(Object.keys(ELEMENTS).map((id) => [id, 0])),
    elementPicks: Object.fromEntries(Object.keys(ELEMENTS).map((id) => [id, 0])),
    // v6.7.6 anomalies (see ANOMALIES in config.js and the doc block above): {id: true} for every
    // anomaly taken this run. No accumulator twin — an anomaly is a rule, not a number, and has no
    // levels, so the presence of the key IS the whole state.
    anomalies: {},
    // Elites killed this run. Gates anomaly predicates ("you have met an elite"), which run.kills
    // cannot answer. Incremented in dealDamage's elite death branch.
    _eliteKills: 0,
    // v7.2 anomaly slate state. All five are plain run scalars for the same reason `anomalies` is
    // a flat map: an anomaly is a rule read at a trigger site, so its state is whatever that site
    // needs and nothing more. See the doc block above for what each one gates.
    _hitsTaken: 0,
    _berserkT: 0,
    _stillT: 0,
    _bloodPact: 0,
    _overloadAcc: 0,
    // Real seconds elapsed. Identical to run.time in every run EXCEPT under TIME DEBT, whose whole
    // effect is to advance run.time faster — so the persistent best-time record reads this instead
    // (main.js endRun), or the card banks a 300s survival for 200 real seconds of play. Gameplay
    // deliberately keeps reading run.time: accelerating the world IS the card.
    _realTime: 0,
    // MARTYR's pending detonations, queued by hurtPlayer and drained by stepMartyr in the same
    // frame. A queue rather than an inline blast because hurtPlayer runs INSIDE other functions'
    // array walks (stepBombs' `for (const b of run.bombs)`). The same reasoning is why a split's
    // children go through _spawnQueue above rather than straight into run.enemies.
    _martyrBursts: [],
    // MINIMES' spawn countdown, and WILDFIRE's per-enemy jump budget lives on the enemy
    // (_fireJumps), re-armed by applyIgnite on every real weapon hit.
    _minimeT: 0,
    // v6.7.8 anomaly pity: level-up SCREENS THE TIER WAS ELIGIBLE ON since the last one that rolled
    // an anomaly, counting the screen being built. Advanced by stepLevelUp (never by
    // buildLevelUpChoices, or a reroll would pump it) and zeroed by the roll itself. See
    // ANOMALY_PITY_PER_SCREEN in config.js.
    _screensSinceAnomaly: 0,
    // Duo-boon pity (2026-08-23): modId -> level-up SCREENS THAT BOON WAS LIVE ON since it was last
    // offered. Advanced by stepLevelUp (never by buildLevelUpChoices, or a reroll would pump it)
    // and zeroed by the builder for every duo boon on the FINAL card list. See DUO_PITY_SCREENS in
    // config.js.
    _duoDry: {},
    // v6.7.10: rerolls PAID FOR on the screen currently open — they decay the `normal` rarity
    // weight (REROLL_RARITY_DECAY in config.js). Zeroed by stepLevelUp when a screen opens and
    // stepped by sim.js's rerollLevelUpChoices, beside the _rerolls bump that prices the next one.
    // It counts PURCHASES, never builds: see the note on the field in the doc block above.
    _screenRerolls: 0,
    enemies: [],
    // Enemies born DURING a step, held back until the next one begins. See flushSpawns (sim.js).
    _spawnQueue: [],
    bullets: [],
    novas: [],
    orbs: [],
    boomerangs: [],
    mines: [],
    homingShots: [],
    holes: [],
    beams: [],
    prisms: [],
    blooms: [],
    gems: [],
    coins: [],
    bombs: [],
    // v5.21 The Beyond: drifting asteroids that damage the player AND grind enemies, and the
    // cooldown on the active Repulsion shove. Repulsion is a no-op outside a `lane` chapter; the
    // rocks want BOTH `lane` and no `rocks: false` opt-out, which is how The Reef has none (owner,
    // 2026-08-22) while The Beyond is untouched. rocks entries are
    // { x, y, r, vCross, rot, spin, _acc }; rot/spin are render-only tumble. vCross (v7.x, was `vx`)
    // is the wander ACROSS the lane, which is the y axis in a `laneAxis: 'x'` chapter — the drift
    // along the lane is not stored at all, it is ROCK_SPEED against the chapter's own direction.
    rocks: [],
    repulseCd: 0,
    // v5.0 chapter behavior (see doc block above): pools fed by acidPool/soapTrail elite flags;
    // obstacles stream in around the player (sim.js streamObstacles, keyed on _obstacleSeed) —
    // starts empty, populated on the first step. null seed (no chapter config, or tests) = none.
    pools: [],
    obstacles: [],
    // v6.4 pond identity: streamed vortices (sim.js streamEddies), same _obstacleSeed idiom as
    // obstacles above. Unconditional — currentForce loops run.eddies every pond frame — so every
    // chapter carries the field, but only a 'currents' signature with a sig.eddies block ever
    // populates it.
    eddies: [],
    // v7.x Book 2: REFILL CIRCLES (sim.js streamShafts/stepShafts), the same _obstacleSeed streaming
    // idiom as obstacles/eddies above with its OWN salts and its OWN cell cursor. Unconditional
    // like eddies, so every chapter carries the field, but only a signature refillSpec() recognises
    // ever fills it — The Twilight's sun shafts, The Surf's tide pools and The Reef's air pockets,
    // which are the same circle with three names and three looks (render.js's refillLook draws
    // whichever). Kept as `shafts` rather than renamed: the field name is quoted as a string in the
    // test suite and in this doc block, which is one of the two silent failure modes CLAUDE.md's
    // rename rule describes.
    shafts: [],
    // v7.x The Wreck: POLLUTION SPILLS (sim.js streamSlicks/stepSlick). The same refillCircleAt
    // geometry as `shafts` above on its own salt block (50) and its own cell cursor, and a SEPARATE
    // ARRAY on purpose: stepCharge loops run.shafts handing out resource, and a poison the bar
    // thanked you for standing in would be a semantic collision that never throws. Unconditional
    // like every field above it, so runs have one shape (R2); only a `leak` signature fills it.
    slicks: [],
    _slickCellI: null,     // streaming cursor, independent of every other streamer's
    _slickCellJ: null,
    // v7.x The Reef: THE SPUR FIELD (sim.js spurAt/streamSpurs). The coral ridges the lane runs
    // through, and the only streamed field in the game indexed along ONE axis — see spurAt for why
    // a grid cannot hold a 140px channel at this spacing. Unconditional like every field above it,
    // so runs keep one shape (R2); only CHAPTERS[].spurs fills it.
    spurs: [],
    _spurIdx: null,        // 1-D streaming cursor: the lane index nearest the player at the last scan
    _spurRev: 0,           // bumped on any change; render rebuilds only on this, exactly as _obstacleRev
    _spurAcc: SPUR_TICK,   // the scrape's part-tick accumulator — CARRIED across a groove, see stepSpurs
    _scraping: false,      // inside coral this frame; stepPlayerMovement reads it as SPUR_SLOW_MUL
    // SEEDED AT 0, NOT LEFT UNDEFINED, and the frame it saves is a real one: stepLaneFront runs
    // AFTER stepPlayerMovement, so a front lazily initialised from the player would seed itself
    // from an already-advanced position and then advance again — 181.5px over the first 2s of a
    // 90px/s lane instead of 180.0. Every lane chapter starts the player at 0 on its forward axis.
    _laneFront: 0,         // the lane's own advance; render.js anchors the camera here, never mutates
    _laneThrottle: 1,      // the stick's forward lean on the scroll (The Reef); 1 until stepPlayerMovement says otherwise
    _crushing: false,      // pinned against the trailing edge this frame — render.js reads it as the tell
    _crushAcc: 0,          // the crush's part-tick accumulator, LANE_CRUSH_TICK's twin of _spurAcc
    polyps: [],            // Fire Coral's lit ridges — snapshots of spurAt, never references into run.spurs
    _slickAcc: 0,          // part-tick accumulator, the exact twin of _drownAcc/_starveAcc
    _foulT: 0,             // s of oil still on you — lingers SLICK_SLOW_T past the rim (see sim.js)
    _rushT: 0,             // s left on BLOODRUSH's window (gnash's bloodrush mod)
    _rushN: 0,             // bites stacked on it, capped at RUSH_MAX_STACKS
    sandbars: [],          // Book 2 surf: streamed dry patches (signature.bars) — see streamSandbars
    _sandCellI: null,      // streaming cursor, independent of the obstacle/eddy/trap/shaft cursors
    _sandCellJ: null,
    // The chapter's resource bar (CHAPTERS[chapter].resource — The Twilight's Light, The Surf's
    // Humidity, The Reef's Air; see the charge doc above for what each one drives). Starts FULL, at
    // the (possibly Deep-Lungs-raised) ceiling below: the first minute of a run should teach the
    // drain, not open on an empty bar the player has not been shown how to fill. 0 for every
    // chapter that declares no resource, and stepCharge early-outs there, so the field is inert
    // rather than absent (R2 — one shape for all runs).
    charge: chargeMax,
    // v7.x Book 2 Task 9: the ceiling itself, as a RUN field — see the hoisted `chargeMax` local
    // above for why it is authored once. 0 in every chapter that declares no resource, same as
    // `charge`. BOOK_SHOP.undertow.deepLungs is the only thing that ever raises it
    // above CHAPTERS[chapter].resource.max.
    chargeMax,
    // v7.x Book 2 Task 9: slowBurn's drain-rate multiplier, applied in stepCharge (sim.js) to
    // CHAPTERS[chapter].resource.drain. shopBonus is SUBTRACTED (slowBurn stores a positive
    // perLevel; `reduction: true` is only a UI sign flag — see ui.js's formatShopBonus), floored at
    // SLOW_BURN_FLOOR (config.js) so a future MAX_SHOP_LEVEL raise cannot invert drain into refill.
    // 1 (no-op) unbought, and 1 in every chapter with no resource — stepCharge never reads it there.
    chargeDrainMul: Math.max(SLOW_BURN_FLOOR, 1 - shopBonus(bm, bookId, 'slowBurn')),
    // v7.x Book 2 Task 9: bigGulp's refill-rate multiplier, applied in stepCharge (sim.js) to
    // CHAPTERS[chapter].resource.refill while the player stands in a shaft/pool/pocket. 1 (no-op)
    // unbought. Does NOT touch The Wreck's per-kill `killBase` — that is not "a refill pickup".
    chargeRefillMul: 1 + shopBonus(bm, bookId, 'bigGulp'),
    // BOOK_SHOP.undertow.currentResist ("Current Resistance"): how much of the tide's push actually
    // reaches the player, applied in stepTide (sim.js). Subtracted like slowBurn's — the line stores
    // a POSITIVE perLevel and reads as a decrease (see `reduction` in BOOK_SHOP) — and floored so a
    // future maxLevel raise cannot invert the push into a pull. 1 in every book but Undertow.
    currentResistMul: Math.max(CURRENT_RESIST_FLOOR, 1 - shopBonus(bm, bookId, 'currentResist')),
    // v7.x The Reef (see the doc block above): seconds of Burst dash left, and the drowning DoT's
    // part-tick accumulator. The rampage pattern again — every run carries both, and only a chapter
    // declaring `burst` / a `resource.drown` block ever moves them off 0.
    _burstT: 0,
    _drownAcc: 0,
    // v7.x The Wreck: seconds of Lunge dash left, the unit direction it travels, and the starving
    // DoT's part-tick accumulator. Same pattern as every line around it — every run carries all
    // four, and only a chapter declaring `lunge` / a `resource.starve` block ever moves them off 0.
    _lungeT: 0,
    _lungeX: 0,
    _lungeY: 0,
    _lungeMoved: 0,
    _starveAcc: 0,
    // v7.x The Surf: seconds of Shorebreak left. Same pattern — every run carries it, and only a
    // chapter declaring `shorebreak` ever moves it off 0.
    _shorebreakT: 0,
    // v7.x The Shelf: seconds of Clear left, and the sight the bar is worth right now. Same pattern
    // for the timer; `sightCharge` is the one field here that is NOT inert elsewhere — stepCharge
    // writes it in every chapter with a resource, where it is simply `charge`. It starts at the
    // same full bar `charge` does so the very first frame of a run is lit before stepCharge has
    // ever run (render.js falls back to run.charge if it is missing, but a run must not open dark).
    _clearT: 0,
    sightCharge: chargeMax,
    // v7.x The Trawl: the net wall, and the countdown to the next pass. `net` is a single OBJECT and
    // not an array, because there is only ever one wall and it is an infinite LINE rather than an
    // entity with a position — { nx, ny, pos, end, holes, _acc }, where (nx, ny) is the unit normal
    // it advances along, `pos` the signed offset of the line, `end` the offset at which the pass is
    // dropped, and `holes` the Breach cuts, each { t, r } on the wall's own tangent axis. See
    // stepTrawl in sim.js for the arithmetic — it is written in exactly one place on purpose.
    // null between passes, and null forever in every chapter whose signature is not `trawl`.
    net: null,
    _netAcc: TRAWL_FIRST_PASS,   // NOT the interval — see its block for why the first pass is early
    // v7.x The Wreck. Same single-nullable-object idiom as `net` above: the orca is one body with a
    // countdown, never a pool. `{state,t,cx,cy,r,ang,x,y,dirX,dirY,hit,alpha}` — see stepOrca.
    orca: null,
    // The countdown seeds at the first SHADOW pass, not at the first real visit: the ladder is
    // three harmless silhouettes and then the danger, and _orcaShadows is what says which is due.
    // Its speed is not real time — stepOrca's orcaRush accelerates it with the crowd around you.
    _orcaAcc: ORCA_SHADOW_FIRST,
    // Where slickTrail last laid a pool. null until the first one; the mod lays by DISTANCE from
    // this point rather than on a timer (stepBilgeWeapon, BILGE_TRAIL_STEP_FRAC).
    _bilgeTrailX: null,
    _bilgeTrailY: null,
    _orcaShadows: ORCA_SHADOW_PASSES,
    // v7.x The Deep. _scentT: seconds left on the Scent window the skill button bought; while it
    // is up, stepScent keeps every body inside SCENT_R marked and the player moves at
    // SCENT_SPEED_MUL. _finPrevA / _finSide are Fin Hit's memory of which way you were last
    // swimming and which side the fin last swung — see fireFinHit for why both are needed.
    _scentT: 0,
    _finPrevA: null,
    _finSide: 1,
    _obstacleSeed: obstacleSeed,
    _obstacleRev: 0,
    // v5.9.1 bugfix (see obstacles[]/_crushed doc above): permanent per-run memory of which
    // streamed cells have already been crushed, so streamObstacles never re-rolls one back in.
    // Always present (every chapter) but only ever written by stepCrush, which is gated on
    // CHAPTERS[chapter].crush (skies only) — a non-skies run carries an empty Set forever.
    _crushed: new Set(),
    // v5.8 kaiju redesign (see doc block above): starts empty/inactive for every chapter, including
    // skies — stepRampage/stepCrush only ever move these away from 0 when CHAPTERS[chapter].crush
    // is set, so a non-skies run carries these three fields but nothing ever touches them.
    rampage: 0,
    rampageT: 0,
    _rampageGraceT: 0,  // v5.9.1 bugfix (see doc block above): s left before RAMPAGE_DECAY resumes
    // v7.x death outro + damage attribution (see the doc block above). deathT is main.js's clock and
    // the sim never touches it; killedBy/dmgBySrc are written by hurtPlayer and read by ui.js on the
    // summary screen. Declared for EVERY run, not just Undertow's — the tally is chapter-agnostic
    // (it is just "what hit me"), and only the OUTRO is book-scoped.
    deathT: 0,
    killedBy: null,
    dmgBySrc: {},
    // v5.24 The Blank (see doc block above): rampage pattern again — these three fields exist on
    // every run but stepBossScript (sim.js) is the only thing that ever writes them, and it early-
    // returns unless CHAPTERS[chapter].scripted, so a non-blank run carries them inert forever.
    script: CHAPTERS[chapter].scripted ? { stage: 0, waveIdx: 0, waveT: 0, spawned: false, bossId: null } : null,
    trail: [],
    bossBar: null,
    // v5.9.1 bugfix: PROMOTED from render-only to a real, READ-ONLY sim contract — see the full
    // explanation on _districtSeed in the doc block above. sim.js's streamObstacles reads this
    // (skies only) to pick a district-appropriate structure `kind`; still drawn exactly once here,
    // so this doesn't change what the shared Math.random stream consumes or in what order.
    // v5.11: the WORLD seed — biomes, rivers, cities, roads and structure placement now all derive
    // from this one value (src/terrain.js). pickWorldSeed walks it forward until the world origin is
    // buildable land, because the run spawns at (0,0) and terrain.js unconditionally puts the home
    // city there; without the check a run could open with downtown underwater. It consumes no extra
    // Math.random draw (it is a pure function of the one drawn here), so the shared random stream
    // and every seeded test that depends on its ORDER are untouched.
    // v6.3: districts-chapters (skies) keep their own Math.random draw above (unchanged stream).
    // roads-only chapters (city) DERIVE it from obstacleSeed instead — a fresh draw here would
    // shift every seeded test's RNG stream (the AA.c/runStarOnly scar, third time).
    _districtSeed: CHAPTERS[chapter].render?.districts
      ? pickWorldSeed((Math.random() * 0x7fffffff) | 0)
      : CHAPTERS[chapter].roads
        ? pickWorldSeed((obstacleSeed ^ 0x9e3779b9) | 0)
        : null,
    // v5.3 garden behavior (see doc block above): trails fed by dying trailFollow ants (pheromone
    // signature), webs by webZone spiders + the lure's stickyScent mod, lures by the Pheromone Lure
    // weapon. v6.6.14: garden no longer feeds run.strips at all — its elite drives a mower into
    // run.lanes. All empty unless something pushes to them.
    trails: [],
    webs: [],
    strips: [],
    lures: [],
    // v5.4 chapter behavior (see doc block above). wells are permanent signature FURNITURE, seeded
    // once here from this chapter's signature (any other signature -> []); the rest are fed during
    // the run — lanes by the city's traffic signature, enemyShots by missileVolley helicopters,
    // debris by the Trash Tornado (persistent since v6.8 — the funnels hunt), zones by the Burst Hydrant
    // (and the Reality Shard's rifts), lobs by the Debris Toss.
    // v6.5: traps are no longer seeded here (generateTraps deleted) — sim.js's streamTraps
    // materializes them around the player the same way streamObstacles/streamEddies do, keyed off
    // _obstacleSeed. Starts empty, populated on the first step; [] forever for a non-predators
    // chapter or a null seed (tests that blank the field).
    traps: [],
    // v6.5: cell key -> absolute run.time a sprung trap re-arms. Lets a trap's armed/disarmed state
    // survive streaming out of range and back in (see streamTraps' doc in sim.js) — without this a
    // player could kite a swarm out past OBSTACLE_DROP_RADIUS and back to find every trap in the
    // field freshly re-armed regardless of how recently it sprang.
    _trapRearm: new Map(),
    wells: generateWells(CHAPTERS[chapter].signature),
    lanes: [],
    enemyShots: [],
    debris: [],
    zones: [],
    lobs: [],
    // v7.97 trawl. longlines: set lines of hooks — { x, y, nx, ny, half, dmg, tick, acc, life,
    // duration, snagged }. A lob carrying `snare` is a Net Toss in flight and lands as a hold
    // rather than a burst (stepLobs), so Net Toss adds no array of its own.
    longlines: [],
    // v7.23 skies. drags: aircraft being reeled in by the Tail Lash — { id, t, dur, dmg, hitIds }.
    // arcs: live Atomic Breath forks — { life, duration, charge, tick, acc, dmg, jumps, arcRange,
    // falloutBonus, nodes }, where `nodes` is the polyline player->body->body rebuilt every tick.
    drags: [],
    arcs: [],
    kills: 0,
    coinsEarned: 0, // clamped to COIN_CAP_PER_RUN (config.js, v6.4.2) by stepPickups on every coin collect
    levelUpChoices: null,
    viewRadius: 600,       // half screen diagonal, updated by main each frame; spawn enemies at viewRadius + SPAWN_RING from player
    // v6.6.24: the half-EXTENTS of the same viewport, updated by main alongside viewRadius. The
    // diagonal alone cannot answer "can the player see this": on a portrait phone viewRadius is
    // ~465 while the horizontal half-view is only ~195, so a wasp 220px to the side is well inside
    // the radius and completely off the screen. Defaults are the 960x720 that gives viewRadius 600,
    // so a headless run (tests) frames the same world main.js would.
    viewW: 480,
    viewH: 360,
    _nextId: 1,
    _spawnAcc: 0,
    // _openingSpawned (v6.4.3, sim-internal, not a render contract): NOT initialized here —
    // stepSpawning (sim.js) lazily sets it true on a run's first ordinary-spawn step, after
    // banking SPAWN_OPENING_CREDIT (config.js) into _spawnAcc once. undefined reads falsy, so
    // omitting it here is equivalent to false and keeps createRun untouched otherwise.
    _nextEliteAt: 40,
    // Sim-internal only (see doc block above): random phase offset for stepCurrents' field.
    _driftSeed: Math.random() * Math.PI * 2,
    // Sim-internal only (not a render contract): pending Echo Wave casts (see WEAPON_MODS.wave
    // in config.js and stepWaveEchoes in sim.js) — { delay, x, y, radius, dmg, knockback }[].
    _waveEchoes: [],
    // Sim-internal only: count of wave casts so far this run (see WEAPON_MODS.wave.tsunami in
    // config.js and stepWaveWeapon in sim.js) — every TSUNAMI_EVERY-th cast is a "monster wave".
    _waveCasts: 0,
    // Debug counters only (see bullets[] doc above) — not consumed by render/main.
    _chains: 0,
  }
}
