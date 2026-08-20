// Builds a shareable save LINK — the '#save=' URL main.js imports at boot. Prints one line.
//
//   node scripts/make-save.mjs                     # book 1 fully starred, shop at 75%, 4 slots
//   node scripts/make-save.mjs http://localhost:5173/
//
// Why a link and not a console paste: a save lives in localStorage, and a phone has no console.
// The blob is validated here the only way that matters — by running it back through the SHIPPED
// loadMeta, which recovers to a FRESH SAVE (silently) for any shape it does not expect. A hand
// written meta that trips that path is a link that wipes the friend it was made for.

import { shopLines, lineMax, BOOK_ORDER, CHAPTER_ORDER, CHAPTER_UNLOCK_DIFFICULTY } from '../src/config.js'

// state.js touches localStorage only inside function bodies, so a stub set up here (after the
// import, before any call) is enough to run loadMeta/importSlot in plain node.
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
const { loadMeta, importSlot, SCHEMA } = await import('../src/state.js')

const BASE = process.argv[2] ?? 'https://ojisama.github.io/charming-anomaly/'
const SHOP_PCT = 0.75
const STARS = 3 // difficulty won in every book-1 chapter

// Every book-1 line at 75% of its own ladder — except the cosmetic, which is the one thing a
// gifted save should not choose for the person receiving it.
const shop = Object.fromEntries(Object.keys(shopLines(BOOK_ORDER[0]))
  .map((id) => [id, id === 'cheeks' ? 0 : Math.round(SHOP_PCT * lineMax(id))]))

// `won` is what fills the spine's gold stars (ui.js); `maxDifficulty` is the highest level
// UNLOCKED, so a chapter beaten at 3 sits at 4 — and that is also what unlocks the next one
// (loadMeta: prev.maxDifficulty > CHAPTER_UNLOCK_DIFFICULTY). The hidden boss chapter is simply
// absent: ensureChapterMeta creates it locked on load.
const chapters = Object.fromEntries(CHAPTER_ORDER.map((id) => [id, {
  unlocked: true,
  maxDifficulty: STARS + 1,
  difficulty: STARS,
  won: STARS,
  best: { time: 0, kills: 0 },
}]))

const meta = {
  coins: 0,
  shop,
  best: { time: 0, kills: 0 },
  runs: 0,
  choiceSlots: 4,
  chapter: 'body',
  chapters,
  lang: 'en',
  skillSide: 'left',
  dev: false, // never true in a gifted save: it is also the leaderboard's integrity gate (main.js)
  lightThief: false,
  schema: SCHEMA,
  name: '',
  savedAt: 0,
  nick: '', // '' means "never chosen", which is what makes the receiver pick their own
}

const json = JSON.stringify(meta)

// The check: import it, load it back through the real thing, assert what the link promises.
if (!importSlot(1, json)) throw new Error('importSlot refused the blob — shape is wrong')
const back = loadMeta()
const assert = (ok, what) => { if (!ok) throw new Error(`round-trip lost ${what}`) }
assert(back.choiceSlots === 4, 'choiceSlots')
assert(back.shop.damage === Math.round(SHOP_PCT * lineMax('damage')), 'shop levels')
assert(back.shop.cheeks === 0, 'the cheeks line staying unbought')
for (const id of CHAPTER_ORDER) {
  assert(back.chapters[id]?.won === STARS, `${id}'s stars`)
  assert(back.chapters[id]?.unlocked === true, `${id} being unlocked`)
}
assert(back.chapters.blank?.unlocked !== true, 'the boss chapter staying locked')
assert(CHAPTER_UNLOCK_DIFFICULTY === STARS, 'the unlock threshold still being 3')

console.log(`${BASE}#save=${Buffer.from(json, 'utf8').toString('base64url')}`)
