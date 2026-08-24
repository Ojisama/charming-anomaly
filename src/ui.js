// DOM overlay inside #ui: title, shop, HUD, level-up, pause, summary. No Pixi.
import { shopCost, refundValue, REFUND_RATE, shopLines, shopLineUnlocked, chaptersMastered, lineMax, SHOP_FAMILY, RUN_DURATION, RARITIES, WEAPONS, WEAPON_MODS, PASSIVES, ELEMENTS, MUTATORS, MUTATOR_EFFECT_LABELS, CONSUMABLES, MAX_DIFFICULTY, DIFFICULTY_COIN_PER_LEVEL, sacrificeCost, SACRIFICE_COSTS, ANOMALY_REROLL_COST, CHAPTER_ENDINGS, CHAPTER_UNLOCK_LINES, BOOK_UNLOCK_LINES, chapterNumber, CHAPTERS, CHAPTER_ORDER, nextChapter, chapterMaxDifficulty, resolveChapterId, playableChapterId, chapterAvailable, titleBookshelf, spineName, chaosStatus, PULSE_CHARGE_COST, elementCodex, ELEMENT_CODEX_INTRO, STAT_KEYS, bookOf, BOOK_ORDER, BOOKS, BOOK_UNLOCKS, unlockCost, unlockLevel, unlockMax, dmgSrcName, dmgSrcArt } from './config.js'
import { playSfx } from './audio.js'
import { t, tt, getLang, LANGS } from './i18n.js'
import { SAVE_SLOTS, activeSlot, slotSummary, saveSummary, exportSlot, NAME_MAX, bookMeta, ensureBookMeta, bookProgress } from './state.js'
// The leaderboard's read side. ui.js fetching its own boards is deliberate — see the comment on
// loadPodium for where the line between "hook" and "direct import" is drawn.
import { fetchBoards, validNick, NICK_MIN, NICK_MAX } from './scores.js'

// ---- Shop line icons (v7.x) --------------------------------------------------------------
// DRAWN, NOT EMOJI (owner ruling, 2026-08-17), in the same 24px stroke idiom as ICO_REROLL and
// LOCK_SVG below — one visual language for every icon this UI draws. The emoji set they replace
// failed the only job an icon has at 19px: 💥 damage and 💢 crit damage were the same small
// starburst, ⚡ fire rate and 💨 move speed were the same "fast" smear, and 🕯️ rendered as a
// near-invisible sliver. A stroke glyph is legible at row size because it is six strokes, not a
// colour photograph shrunk to nothing.
//
// The three RESOURCE lines share a vessel so they read as one system rather than three unrelated
// buys: a tank that grows, a glass that runs slow, a vessel being poured into.
//
// `config.icon` (the emoji) stays on every line as the FALLBACK below — a line added without an
// entry here still renders something rather than a blank box, which is the failure mode a lookup
// table like this otherwise ships silently.
//
// FILLED AND THREE-TONE, NOT HAIRLINE OUTLINES (owner, 2026-08-17: "icon colors and more
// stylised"). A 1.9px stroke glyph is the productivity-app idiom and it sat wrong on a screen of
// chunky cream cards with 3px navy borders and a hard drop shadow. These are solid bodies in the
// family's `ico`, outlined in its `edge`, with the details punched out in `lite` — the same
// weight as the cards they sit on. Two classes, both painted from the shared palette in
// config.js (SHOP_FAMILY): `.f` = body in the family colour, `.l` = detail in the light tone.
// Both carry the same darker `edge` outline — colour alone has nowhere near enough contrast at
// 22px on cream, which is exactly how the emoji set failed.
//
// EVERY GLYPH FILLS ~20 OF THE 24 BOX. Drawing inside the middle third is the difference between
// an icon and a smudge at 21px, and it is invisible while you are reading paths — judged by
// cloning the rendered SVGs out of a live capture at 84px.
const SHOP_ICONS = {
  // cheeks: the skin's own silhouette at row size, generated from the SAME three-ellipse union
  // drawButt uses (render.js) so the glyph and the body on screen cannot drift apart. ONE closed
  // path for the outline plus one lit poly per cheek: .f and .l both carry a dark stroke here
  // (styles.css), so overlapping shapes would show every internal seam - a hand-drawn cut did
  // exactly that and read as a mask. The gap between the two lit cheeks IS the cleft, and the
  // whole glyph is WIDER THAN TALL, which is most of what makes it read as a butt at 22px.
  cheeks: '<path class="f" d="M12 19.4 L10.8 19.3 L9.7 19.1 L8.6 18.7 L7.6 18.1 L6.1 17.9 L4.6 17.4 L3.4 16.4 L2.4 15.1 L1.8 13.6 L1.6 12 L1.8 10.4 L2.4 8.9 L3.4 7.6 L4.6 6.6 L6.1 6.1 L7.6 5.9 L9.1 6.3 L10.4 6.9 L11.3 7.8 L12 8.8 L12.7 7.8 L13.6 6.9 L14.9 6.3 L16.4 5.9 L17.9 6.1 L19.4 6.6 L20.6 7.6 L21.6 8.9 L22.2 10.4 L22.4 12 L22.2 13.6 L21.6 15.1 L20.6 16.4 L19.4 17.4 L17.9 17.9 L16.4 18.1 L15.4 18.7 L14.3 19.1 L13.2 19.3Z"/>'
    + '<path class="l" d="M16.5 16.1 L15.4 15.6 L14.4 14.9 L13.6 13.9 L13.2 12.7 L13.1 11.5 L13.3 10.2 L13.9 9.1 L14.8 8.2 L15.9 7.6 L17.1 7.3 L18.3 7.4 L19.4 7.8 L20.4 8.5 L21.2 9.5 L21.6 10.7 L21.7 11.9 L21.5 13.2 L20.9 14.3 L20 15.2 L18.9 15.8 L17.7 16.1Z"/>'
    + '<path class="l" d="M7.5 16.1 L6.3 16.1 L5.1 15.8 L4 15.2 L3.1 14.3 L2.5 13.2 L2.3 11.9 L2.4 10.7 L2.8 9.5 L3.6 8.5 L4.6 7.8 L5.7 7.4 L6.9 7.3 L8.1 7.6 L9.2 8.2 L10.1 9.1 L10.7 10.2 L10.9 11.5 L10.8 12.7 L10.4 13.9 L9.6 14.9 L8.6 15.6Z"/>',
  // sword, not a burst: the burst shape belongs to critDamage's star, and two starbursts side by
  // side is exactly the 💥/💢 collision this whole set exists to end.
  damage: '<path class="f" d="M12 1.4 15 6.6v7.9H9V6.6z"/><path class="l" d="M12 3.6 13.6 7v6.2h-3.2V7z"/>'
    + '<rect class="f" x="6.2" y="14.2" width="11.6" height="2.9" rx="1.4"/>'
    + '<rect class="f" x="10.4" y="16.8" width="3.2" height="4" rx="1.2"/>'
    + '<circle class="f" cx="12" cy="21.4" r="1.9"/>',
  fireRate: '<path class="f" d="M13.6 1.2 4.6 13.4h5.6l-1.2 9.4 9.4-12.6h-5.6z"/>'
    + '<path class="l" d="M12.4 4.6 7.9 11.5h3.5l-.6 4.7 4.6-6.4h-3.2z"/>',
  // concentric target = the CHANCE of a crit; the star below = its SIZE. The two crit lines were
  // 🎯 and 💢, which at row size were one red starburst twice.
  critChance: '<circle class="f" cx="12" cy="12" r="10.4"/><circle class="l" cx="12" cy="12" r="6.8"/>'
    + '<circle class="f" cx="12" cy="12" r="3.2"/>',
  critDamage: '<path class="f" d="m12 1.2 3.2 7 7.6.9-5.7 5.1 1.6 7.5-6.7-3.8-6.7 3.8 1.6-7.5-5.7-5.1 7.6-.9z"/>'
    + '<path class="l" d="m12 5.6 1.7 3.7 4 .5-3 2.7.8 3.9-3.5-2-3.5 2 .8-3.9-3-2.7 4-.5z"/>',
  maxHP: '<path class="f" d="M12 22.2S1.8 16 1.8 9.4A5.6 5.6 0 0 1 12 6.2a5.6 5.6 0 0 1 10.2 3.2c0 6.6-10.2 12.8-10.2 12.8z"/>'
    + '<path class="l" d="M6.6 7.2a2.6 2.6 0 0 1 2.6 1.5c.4.9-.6 1.6-1.3 1-.6-.5-1.4-.4-1.8.2-.5.7-1.6.1-1.3-.8a2.6 2.6 0 0 1 1.8-1.9z"/>',
  moveSpeed: '<path class="f" d="M8.4 2.6 21.4 12 8.4 21.4z"/><path class="l" d="M10.8 7.3 17.2 12l-6.4 4.7z"/>'
    + '<rect class="f" x="1.2" y="6.4" width="6" height="2.9" rx="1.4"/>'
    + '<rect class="f" x="1.2" y="10.6" width="4.4" height="2.9" rx="1.4"/>'
    + '<rect class="f" x="1.2" y="14.8" width="6" height="2.9" rx="1.4"/>',
  // Horseshoe, poles UP, with the tips in the light tone — that banded tip is the one detail that
  // makes a U read as a magnet. A previous outline cut capped the tips and fused the outer and
  // inner curves into a solid letter with no poles at all.
  magnet: '<path class="f" d="M3 2.4h6.4v10.1a2.6 2.6 0 0 0 5.2 0V2.4H21v10.1a9 9 0 0 1-18 0z"/>'
    + '<rect class="l" x="3" y="2.4" width="6.4" height="3.6" rx="1"/>'
    + '<rect class="l" x="14.6" y="2.4" width="6.4" height="3.6" rx="1"/>',
  // TWO COINS, offset. A single disc is the target above with its rings removed, and the stacked
  // ellipses an earlier cut used are the universal "database" glyph — storage, not money.
  coinGain: '<circle class="f" cx="14.6" cy="9.4" r="8"/><circle class="l" cx="14.6" cy="9.4" r="4.6"/>'
    + '<circle class="f" cx="9.4" cy="14.6" r="8"/><circle class="l" cx="9.4" cy="14.6" r="4.6"/>',
  // The resource trio share a VESSEL so they read as one system rather than three unrelated buys:
  // a tank that holds more, a glass that runs slower, a basin being poured into.
  // a CANISTER with a neck and a fill level, not a bare rounded rect — that read as a battery,
  // which is a container of the wrong kind and the only icon in the set that needed its label.
  // The light band is the EMPTY headroom, so the coloured part below it is what you own.
  deepLungs: '<rect class="f" x="9.5" y="1.2" width="5" height="4.4" rx="1.5"/>'
    + '<rect class="f" x="4.4" y="4.6" width="15.2" height="18.2" rx="4.6"/>'
    + '<rect class="l" x="6.6" y="6.8" width="10.8" height="5.8" rx="2.4"/>',
  slowBurn: '<rect class="f" x="4.4" y="1.2" width="15.2" height="2.8" rx="1.2"/>'
    + '<rect class="f" x="4.4" y="20" width="15.2" height="2.8" rx="1.2"/>'
    + '<path class="f" d="M6.6 4h10.8c0 5-4.4 6.6-4.4 8s4.4 3 4.4 8H6.6c0-5 4.4-6.6 4.4-8s-4.4-3-4.4-8z"/>'
    + '<path class="l" d="M8.9 5.9h6.2c0 3-3.1 4.6-3.1 6.1s3.1 3.1 3.1 6.1H8.9c0-3 3.1-4.6 3.1-6.1S8.9 8.9 8.9 5.9z"/>'
    + '<path class="f" d="M9.4 20h5.2c0-2.4-2.6-3.6-2.6-3.6s-2.6 1.2-2.6 3.6z"/>',
  bigGulp: '<path class="f" d="M12 .8s4.6 5.4 4.6 8.2a4.6 4.6 0 0 1-9.2 0C7.4 6.2 12 .8 12 .8z"/>'
    + '<path class="l" d="M10.4 8.6c0-1.1.9-2.6.9-2.6s-2.5 2.1-2.5 3.6a1 1 0 0 0 2 0z"/>'
    + '<path class="f" d="M2.6 13.2h18.8v2.4a7 7 0 0 1-7 7h-4.8a7 7 0 0 1-7-7z"/>'
    + '<path class="l" d="M5 15.4h14c0 3.2-2.4 5-5 5h-4c-2.6 0-5-1.8-5-5z"/>',
  // An ANCHOR: ring, stock, stock-in-the-light, crossbar, and the two flukes as one curved sweep.
  // Not the vessel the three resource icons share — this line does not touch the bar, and borrowing
  // their glyph would say it did.
  currentResist: '<circle class="f" cx="12" cy="3.4" r="3"/><circle class="l" cx="12" cy="3.4" r="1.2"/>'
    + '<rect class="f" x="10.6" y="5.4" width="2.8" height="16.4" rx="1.2"/>'
    + '<rect class="f" x="5.2" y="7.6" width="13.6" height="2.4" rx="1.2"/>'
    + '<path class="f" d="M3.6 13.4a8.4 8.4 0 0 0 8.4 8.4 8.4 8.4 0 0 0 8.4-8.4h-2.8a5.6 5.6 0 0 1-11.2 0z"/>'
    + '<path class="l" d="M2 12.2h4.4l-2.2 3.4zM17.6 12.2H22l-2.2 3.4z"/>',
  // sacrifice targets (BOOK_UNLOCKS + the card-slot ladder), same screen, same language
  slot: '<rect class="f" x="1.4" y="3.4" width="9" height="17.2" rx="2.6"/>'
    + '<rect class="l" x="3.4" y="5.6" width="5" height="12.8" rx="1.4"/>'
    + '<rect class="f" x="13.6" y="3.4" width="9" height="17.2" rx="2.6"/>'
    + '<path class="l" d="M17.1 7.6h2v3.4h3.4v2h-3.4v3.4h-2V13h-3.4v-2h3.4z"/>',
}
// COLOUR BY FAMILY, NOT BY LINE. Eleven hues is a swatch book; four is a grouping the player can
// learn, and it says something true — what a line is FOR. The family is DECLARED on the line in
// config.js (SHOP.family) rather than mapped here, so this file cannot disagree with the table
// about which block a row belongs to. `slot` is the card-slot ladder, which ui.js synthesises and
// so is the one id with no config row of its own.
// The three tones ride CSS custom properties, so a row's own state still reaches the glyph.
const shopIcon = (id, emoji, family) => {
  if (!SHOP_ICONS[id]) return emoji ?? ''
  const fam = family ?? (id === 'slot' ? 'vit' : 'atk')
  const p = SHOP_FAMILY[fam] ?? SHOP_FAMILY.atk
  return `<svg class="shop-ico" viewBox="0 0 24 24" aria-hidden="true"`
    + ` style="--ico:${p.ico};--ico-edge:${p.edge};--ico-lite:${p.lite}">${SHOP_ICONS[id]}</svg>`
}

// Chapter-card cast thumbnails, keyed by rosterId: './cast/tardigrade.png' -> 'tardigrade'.
// See the castArt note in initUI for where they come from and why they are files.
const CAST_ART = Object.fromEntries(
  Object.entries(import.meta.glob('./cast/*.png', { eager: true, query: '?url', import: 'default' }))
    .map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]),
)

const SCREEN_NAMES = ['title', 'shop', 'brief', 'hud', 'levelup', 'pause', 'summary', 'dev', 'codex']
const CHOICE_ICONS = { weapon: '⭐', passive: '💪', mod: '⭐', element: '✨', heal: '🍡' }
// v6.6.18 mis-tap guard: the level-up modal appears mid-fight, right where a thumb is already
// reaching for the joystick, so a tap in the first instants is a stray press far more often than
// a choice. Cards and Reroll stay inert this long after the modal renders.
// v6.6.22 (owner directive): 300 -> 500. 300 matched the .lv-card pop-in exactly, which made it
// tidy but too short in practice — a thumb already travelling when the modal lands is still
// arriving well after the animation has settled. The gate now OUTLASTS the pop-in by 200ms, so
// there is a beat where the cards look ready and are not; that is the intended trade, and it is
// why the cost of a wrong tap (a spent level-up you cannot undo) sets this number, not the CSS.
// Input-guard timing, not sim balance, so it lives here rather than in config.js.
const LEVELUP_GRACE_MS = 500
// v7.5 BLIND FAITH: how long the row stays face UP after a blind pick, before the level-up is
// actually spent. Pure chrome, so it lives here and not in config.js — it moves no balance number.
// Long enough to read three cards, short enough not to become a loading screen every level.
const BLIND_REVEAL_MS = 2200
// v7.12 hidden dev menu: the tap gesture that opens it, on the HUD coin badge. Input-guard timing
// like the two above, so it lives here rather than in config.js — it moves no balance number.
const DEV_TAPS_TO_OPEN = 7
const DEV_TAP_WINDOW_MS = 1000
// ...but the hold is DISMISSIBLE after this, and that distinction is the whole design. An
// unskippable 1.5s hold on every level-up from ~8 to ~24 is 15-24s of dead modal per 300s run:
// frustration is a spike, boredom is a wait, and the card is selling the former. The short arm only
// stops the tap that took the card from also dismissing the reveal it just opened.
const BLIND_REVEAL_ARM_MS = 260

// v5.17 build stamp: "vX.Y.Z · <short sha>", substituted by vite.config.js's `define` from the git
// HEAD at BUILD time — so it identifies the bundle you are actually running, not what the source
// tree says it should be. Shown on the title screen and in the pause modal (see buildStampHtml).
// The typeof guard survives substitution (`typeof "v5.17 · abc1234"` is just "string") and keeps
// the module importable outside a Vite build, e.g. from a plain node script.
const BUILD_STAMP = typeof __BUILD_STAMP__ !== 'undefined' ? __BUILD_STAMP__ : 'dev'
const buildStampHtml = () => `<div class="build-stamp" title="build actually running">${BUILD_STAMP}</div>`

// v6.6.12: this file's FIRST HTML escape, and it needs to exist now for a reason that did not apply
// before. Until now every value interpolated into a template here was a number or a trusted
// config/i18n string — which is why a helper was never needed and why `grep` finds none. meta.name
// is the first player-authored free text in the codebase, and once saves sync it is also the first
// value that arrives FROM ANOTHER DEVICE. Escape at the render site, not at the parse site:
// state.js's cleanName clamps length and strips control characters, which is a LAYOUT fix, and
// truncating a string has never made it safe to interpolate.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// v5.0: difficulty pips/hints/gating read the SELECTED chapter's ladder (meta.chapters[id],
// see state.js's meta.chapters doc block) rather than the pre-v5.0 top-level
// meta.difficulty/meta.maxDifficulty (removed at migration).
function selectedChapterMeta(meta) {
  return meta.chapters?.[meta.chapter] ?? { maxDifficulty: 1, difficulty: 1 }
}

// v7.x title: the chapter picker is a BOOKCASE. One ÉTAGE per Book, one VOLUME per chapter —
// Book 1's seven chapters standing together on the top board, Undertow's on the second — so the
// whole game is one screen with no carousel to scroll and no drill-in. Tap a spine, the detail
// panel below fills in, Play. Three volume states (bookcaseHtml / etageHtml / volHtml, inside
// initUI):
//   - unlocked: a SPINE in its Book's binding cloth (BOOKS[].cloth), carrying the chapter icon, its
//     name set VERTICALLY in foil, and one gold star per difficulty won. The chapter you last
//     played stands proud of the row with a pink ribbon in it. A volume's HEIGHT is how far up its
//     difficulty ladder you have got (volH) — shortest never won, tallest cleared.
//   - locked, in a Book you have started: the volume is turned FORE-EDGE OUT — its boards seen
//     edge-on framing a recessed page block, with a padlock printed across the leaves. You can see
//     a book is there without being told which one.
//   - a Book with nothing unlocked: one dust sheet over the whole étage, because for a Book you
//     have never opened the chapter COUNT is the tease.
// Volume width is FLEX with a cap, never fixed px: Book 1 is seven chapters today and eight once
// The Blank is earned, and a width tuned for seven puts the eighth off the shelf.
// The shelf model itself lives in config.js (titleBookshelf) — a pure function of the save with no
// DOM in it, which is what lets the suite assert the WIP gate for real rather than by grepping
// this file.
// A chapter's name, tagline and cast faces live in the panel BELOW the shelf (detailHeadHtml) —
// a spine has no room for them, and that panel is the only consumer of CAST_ART left, so it is
// what keeps the scripts/bake-cast.mjs thumbnails reachable.

// The furthest-progressed chapter this save has unlocked (last CHAPTER_ORDER id whose
// chapters[id].unlocked is true) — used to phrase the "win X at difficulty 3+" hint under the
// chapter selector for the next (locked) chapter, if any.
function furthestUnlockedChapterId(meta) {
  let furthest = CHAPTER_ORDER[0]
  for (const id of CHAPTER_ORDER) {
    if (meta.chapters?.[id]?.unlocked) furthest = id
  }
  return furthest
}

function fmtTime(s) {
  const t = Math.max(0, Math.floor(s))
  const m = String(Math.floor(t / 60)).padStart(2, '0')
  return `${m}:${String(t % 60).padStart(2, '0')}`
}

// Interpolates two '#rrggbb' colors at t (0..1) — used for the sacrifice modal's counter,
// which reads from ink-soft toward the danger red as the offered total climbs.
function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16)
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255
  const k = Math.max(0, Math.min(1, t))
  const r = Math.round(ar + (br - ar) * k)
  const g = Math.round(ag + (bg - ag) * k)
  const b2 = Math.round(ab + (bb - ab) * k)
  return `rgb(${r}, ${g}, ${b2})`
}

// Formats a book's shop-line total bonus at a given level the same way its shop-row desc reads
// (e.g. "+25%" for percentage stats, "+150" for flat ones like maxHP) — used by the sacrifice
// modal's per-row "current -> after" preview. `reduction` lines (slowBurn) store a POSITIVE
// perLevel and display as a decrease — storing -0.04 instead would render "+-40%" here and invert
// the `per < 1` percent test one line down.
function formatShopBonus(bookId, id, levels) {
  const line = shopLines(bookId)[id]
  const per = line.perLevel
  const sign = line.reduction ? '-' : '+'
  return per < 1 ? `${sign}${Math.round(per * levels * 100)}%` : `${sign}${Math.round(per * levels)}`
}

/**
 * Contract used by main.js:
 *   const ui = initUI({ meta, onPlay(mode), onBuy(id, bookId)->bool, onChoose(i),
 *                       onPauseToggle, onQuit, onDifficulty(d), onChapter(id), onReroll(), onSkill(),
 *                       onSacrifice(picks, target, bookId)->bool, onRefund(ids, bookId)->coins,
 *                       onReset(), onSlot(n) })
 *     - onRefund(ids, bookId): sells the named upgrade lines back at REFUND_RATE, whole lines
 *       only, and returns the coins paid back (0 if none were owned). One call takes the LIST so
 *       "refund everything" is one transaction — see the refund sheet below.
 *     - onChapter(id): title screen's bookcase (v7.x — see bookcaseHtml/volHtml).
 *       Fires only for unlocked CHAPTER_ORDER ids as the scroll SETTLES a card under the viewport
 *       centre (the locked preview card never calls it) — main.js re-guards via
 *       ensureChapterMeta(meta, id).unlocked, sets meta.chapter, saveMeta, plays 'click'. ui.js
 *       then surgically updates the parts BELOW the carousel (dots + difficulty row + Play state)
 *       without rebuilding the carousel DOM (a full renderTitle would reset the scroll position) —
 *       main.js never calls showScreen for it.
 *     - onDifficulty(d): title-screen difficulty pips (1..MAX_DIFFICULTY); persists to the
 *       SELECTED chapter's ladder, meta.chapters[meta.chapter].difficulty (v5.0 — see
 *       selectedChapterMeta below and state.js's meta.chapters doc block). Pips above that
 *       chapter's maxDifficulty render locked (🔒, disabled) and never fire this at all — level
 *       d+1 only unlocks by winning a classic run at level d in that same chapter (see endRun in
 *       main.js). Chapter selection itself is the onChapter hook right above.
 *     - onBriefStart(consumableIds): fired by the classic pre-run summary's Start button (v6.0.2 —
 *       see renderBrief). main.js stages the rolled anomalies in onPlay and only creates the run
 *       here. consumableIds (v6.7) is the booster bottom-sheet's session-local selection, an array
 *       of CONSUMABLES ids — the picking moved off the title onto this screen, so THIS is the hook
 *       that carries it (the selection is cleared as soon as it fires). The 'brief' screen
 *       (ui.showScreen('brief', { chapterId, difficulty, mutators, reroll })) is shown for every
 *       classic run now, including difficulty 1 where mutators is empty: the boosters live here.
 *     - onBriefReroll(i): fired by an anomaly card's own 🎲 button (v6.0.4; per-card since v6.6.19,
 *       shown when data.reroll — classic non-blank only). i is that card's index in data.mutators.
 *       main.js spends ANOMALY_REROLL_COST to replace THAT ONE anomaly and re-shows the brief; the
 *       buttons render disabled when bm.coins can't cover it. Rerolling the whole set is still
 *       free — back out to the title and press Play — which is exactly why the paid one is targeted.
 *     - onPlay(): fires from the title
 *       Play button and from the summary "Play again" button (which replays whatever mode the
 *       It carries no boosters: since v6.7 classic boosters are picked one screen later, on the
 *       pre-run summary, and arrive via onBriefStart.
 *     - onChoose(i, subject): a level-up card tap (or its digit/enter key). `subject` is a WEAPON
 *       ID and is only ever non-null for a SUBJECTED anomaly card (v7.5 SPECIALIST), which opens a
 *       chooser before the pick is spent. NOT fired for the first
 *       LEVELUP_GRACE_MS after the modal renders — the modal lands under a thumb already reaching
 *       for the joystick, so an instant tap is a stray press, not a pick. Same gate on onReroll.
 *       Nothing tells main.js a tap was swallowed; the player simply taps again.
 *     - onReroll(): level-up screen's Reroll button (or the 'R' key). main.js is expected to
 *       no-op silently on the wrong phase and otherwise hand the whole purchase to sim.js's
 *       rerollLevelUpChoices — which deducts RUN coins (run.coinsEarned, the HUD counter, not the
 *       meta bank), steps run._rerolls and run._screenRerolls, rebuilds run.levelUpChoices, and
 *       returns false unchanged when it is unaffordable — then call showScreen('levelup', ...)
 *       again with fresh data.
 *     - onSacrifice(picks, target, bookId): fired by the sacrifice view's "Confirm sacrifice"
 *       button. picks is { [statId]: count }, the shop levels offered per stat. `target` (v7.x)
 *       names WHAT the offer buys — 'slot' for the 3rd/4th level-up card slot (sum === sacrificeCost(
 *       bm.choiceSlots)) or a BOOK_UNLOCKS[bookId] key (that table is empty today — see config.js)
 *       (sum === that entry's cost). A book-specific target only ever appears once that book is
 *       REACHABLE — an Undertow target needs an Undertow chapter browsable, which needs the book
 *       unlocked, which needs meta.dev while it is wip (see sacTargets, and unlockBook in state.js)
 *       — so sacTargets carries no separate meta.dev check of its own. `bookId` is shopBookId() —
 *       same reasoning as onBuy above.
 *       Returns true/false; the UI closes the modal and re-renders the shop either way (main.js
 *       already validates, so false should only happen if the two ever disagree).
 *     - onReset(): shop's "🗑 Reset all progress" button, after its own confirm modal. Full
 *       new-game wipe — main.js is expected to clear the save and reload the page; the UI has
 *       nothing left to re-render after that.
 *     - onSlot(n): title's 💾 save-slot picker (v6.4.6 — see slotsOpen/slotsModalHtml), fired
 *       when tapping an inactive slot row. main.js writes the slot pointer and reloads the page,
 *       same "nothing left to re-render" idiom as onReset — never fires for the already-active slot.
 *   ui.showScreen('title' | 'shop' | 'hud' | 'levelup' | 'pause' | 'summary', data?)
 *     - 'levelup' data: { choices, rerollCost, rerollCurrency, coins, hp } — choices is
 *       run.levelUpChoices (run.choiceSlots cards, all shown); the rest drive the Reroll button.
 *       rerollCurrency is 'coins' or (under the BLOOD MONEY anomaly, v7.2) 'hp', and it decides
 *       both the label's icon and which wallet the disabled check reads. Both come from sim.js's
 *       rerollPrice, never computed here — see that function for why.
 *     - 'pause' data: { mutators: string[], build: object }
 *       mutators = run.mutators (omit/empty for classic runs); mode = the run mode chip;
 *       build = buildReadout(run) — the pause sheet's weapon/passive/element/Rupture sections,
 *       and `build.anomalies` is what the Rupture section reads. See main.js's pause hook.
 *       It also opens ON TOP of a level-up — the build you already have is what "is this worth
 *       rerolling?" is asking about. onPauseToggle fires with the run still in the 'levelup'
 *       phase and Resume goes back to the same undealt cards, which is why main.js needs
 *       ui.activeScreen() to tell those two directions apart.
 *     - 'summary' data: { victory, time, kills, level, earned, bonus, mutators?, mode,
 *       nextDifficulty?, unlockedDifficulty?, unlockedChapter?, unlockedHiddenChapter?,
 *       unlockedBook?, killedBy?, dmgBySrc? }
 *       killedBy / dmgBySrc (v7.x) are run.killedBy and run.dmgBySrc verbatim — the `src` LABEL of
 *       the fatal hit, and a { label: hpTotal } tally of everything that landed. Labels, not copy:
 *       config.js's dmgSrcName resolves both (an enemy label is a roster id, and its name already
 *       lives in CHAPTERS[].roster), and renderSummary/damageBlock must not keep a second mapping.
 *       killedBy renders as the .summary-killer line on DEATHS only and is skipped when the label
 *       does not resolve; dmgBySrc renders as .summary-damage on wins too, since where a winning
 *       run's health went is just as much a build report. Both absent/empty renders nothing.
 *       nextDifficulty (v6.4.4) is the difficulty a classic win just advanced the chapter's saved
 *       selection to (endRun bumps chMeta.difficulty when below the cap), else null — it flips the
 *       main button's label from "Play again" to "Next level"; the button's onPlay flow is
 *       unchanged either way (it reads chMeta.difficulty). unlockedDifficulty is the newly-unlocked level
 *       number when this win just raised the run's chapter's maxDifficulty (see endRun in
 *       main.js), else null — rendered as a mint .summary-unlock badge. unlockedChapter (v5.0)
 *       is the newly-unlocked NEXT chapter's name when this win (classic, difficulty 3+) just
 *       unlocked it, else null — rendered as a second, violet .summary-unlock--chapter badge.
 *       unlockedHiddenChapter (v5.24) is CHAPTERS.blank.name the one time a classic Beyond win at
 *       difficulty 5 just unlocked The Blank, else null/absent — rendered as a third,
 *       .summary-unlock--hidden badge. unlockedBook (v7.x) is the book id a finale win just
 *       OPENED, else null — rendered as a fourth, .summary-unlock--book badge whose copy and
 *       welcome-purse figure come from BOOK_UNLOCK_LINES + BOOKS[id].startCoins. A book with no
 *       BOOK_UNLOCK_LINES row renders no badge at all (run BU asserts every unlockable book has
 *       one), deliberately: a half-translated announcement is worse than the silence it replaced.
 *       All four can and do appear together. renderSummary itself
 *       resolves which chapter was just
 *       played (meta.chapter — the data object
 *       doesn't carry it) purely to show its icon/name in the header, unrelated to these unlocks.
 *   ui.updateHUD(run, events)   called every frame while playing — renders run.mutators as HUD
 *     chips. events is this frame's drained run.events array. v6.9 removed its only consumer
 *     (the "pest control dispatched" banner); the parameter stays for the next one.
 *   ui.activeScreen()   the name last passed to showScreen. One caller: main.js's pause hook,
 *     which needs to know whether ⏸ during a level-up means "open the sheet" or "go back".
 */
export function initUI(hooks) {
  const root = document.getElementById('ui')
  const { meta } = hooks
  const screens = {}
  let active = 'title'

  for (const name of SCREEN_NAMES) {
    const el = document.createElement('div')
    // The two MENU screens share one room (.room-oak, styles.css). Gameplay screens must not
    // have it: the hud sits over the live canvas and an opaque background would hide the game.
    const ROOM = ['title', 'shop']
    el.className = `screen screen--${name}${ROOM.includes(name) ? ' room-oak' : ''}`
    el.dataset.ui = ''            // keeps input.js from anchoring the joystick on menu touches
    root.appendChild(el)
    screens[name] = el
  }

  // Every screen re-renders by rewriting its innerHTML wholesale, which destroys and rebuilds any
  // modal open inside it — and a brand-new element REPLAYS its CSS entrance animation. That is why
  // the settings sheet, the save-slot picker, the reset confirm and the pause sheet all popped in
  // again on every tap INSIDE them. Boxes tagged data-pop are matched by key across the rewrite: a
  // key that was already on screen gets .no-pop (styles.css), so only a box that genuinely just
  // opened animates. showScreen clears the memory on a screen change, so re-opening one still pops.
  // Surgical updates (updateTitleBelow, updateHUD) must NOT go through here — they rewrite a
  // subtree that holds no modal, and would wrongly forget the sheet still open beside it.
  let popShown = new Set()
  function setHtml(el, html) {
    el.innerHTML = html
    const next = new Set()
    for (const n of el.querySelectorAll('[data-pop]')) {
      next.add(n.dataset.pop)
      if (popShown.has(n.dataset.pop)) n.classList.add('no-pop')
    }
    popShown = next
  }

  // ---- title -----------------------------------------------------------
  // Session-local pre-run booster selection (v4.5). Not saved to meta — plain in-memory Set,
  // scoped to this initUI() call. Only applies to classic runs (see onBriefStart hook doc above);
  // cleared as soon as a run actually starts (see the 'play' click case below).
  let selectedConsumables = new Set()

  // v5.2 title redesign — UI-local browse state (not persisted, scoped to this initUI call):
  //   browseChapterId: which carousel card is currently centred. Starts at the saved meta.chapter;
  //     tapping a volume moves it across the bookcase (see the data-vol case in the click
  //     handler). Selecting an unlocked chapter persists via hooks.onChapter (so meta.chapter
  //     tracks it); a turned-around locked volume only browses, and its Play button is disabled.
  //   boostersOpen: whether the booster bottom-sheet is up (replaces the v5.0.1 run-options panel).
  //   R1 (resolveChapterId, config.js): meta.chapter is a pointer into CHAPTERS, so a save from a
  //     build that shipped a chapter this one lacks can name one that isn't here. main.js resolves
  //     it before launching; browse it the same way or titleBelowHtml reads that chapter's ledger
  //     entry and lights pips off ITS longer ladder while Play starts CHAPTER_ORDER[0] at its own
  //     level — pips that disagree with the run. (The pip COUNT is the same either way:
  //     chapterMaxDifficulty returns MAX_DIFFICULTY for an unknown id. It is the unlocked state
  //     that lies.) No card exists for that id either, so the carousel would centre on nothing.
  // playableChapterId, not resolveChapterId: with the gate OFF, a save still pointing at a WIP
  // chapter must browse a shipped one. resolveChapterId would happily return it (it is a real
  // chapter) and the below-carousel block would then describe a card the carousel is not showing.
  let browseChapterId = playableChapterId(meta)
  // Which book's shop is on screen. The shop is reached from the bottom nav with no chapter
  // argument, so it follows whatever the carousel last settled on — which is also what the coin
  // badge reads, so the two can never disagree.
  const shopBookId = () => bookOf(browseChapterId) ?? BOOK_ORDER[0]
  let boostersOpen = false

  // v6.7.2 cast art: rosterId -> URL of that creature's thumbnail, resolved at BUILD time from
  // src/cast/*.png (baked by scripts/bake-cast.mjs out of render.js's own textures — re-run it when
  // creature art changes). The eager ?url glob is the same idiom render.js uses for props/fx, and
  // the same one CLAUDE.md requires: no runtime dynamic-import graph, just strings.
  // This replaced extracting the textures live at boot. That was always in sync but cost a GPU
  // readback per creature before the first paint, which on a slow context was seconds of black.

  // Volume height is PROGRESS: 94% for a chapter whose ladder you have never beaten, 100% once you
  // have won its LAST difficulty — so a finished shelf stands even and a gap in the row is a
  // chapter still owing you something. Normalised by the chapter's own cap (The Blank's is 3), or
  // it could never reach full height.
  // Kept within 6 points, as the old positional cycle was: the tallest name ('Undergrowth') has to
  // fit the SHORTEST spine, and a wider spread starves it.
  const VOL_H_MIN = 94, VOL_H_SPAN = 6
  function volH(id) {
    const won = Math.max(0, Number(meta.chapters?.[id]?.won) || 0)
    return VOL_H_MIN + VOL_H_SPAN * Math.min(1, won / chapterMaxDifficulty(id))
  }

  // Printed on the page edges of a turned-around volume. Inline SVG, not the 🔒 emoji: a colour
  // emoji on a page edge reads as a sticker stuck to the book rather than as fore-edge printing.
  const LOCK_SVG = '<svg class="vol-lock" viewBox="0 0 24 24" aria-hidden="true">'
    + '<path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'
    + '<rect x="4" y="10.5" width="16" height="11" rx="2.6" fill="currentColor"/></svg>'

  // One volume. A locked one is still a BUTTON and still selectable — tapping it puts its unlock
  // condition in the detail panel, which is what the old locked "???" hero card did. It carries no
  // name and no icon, so selecting it reveals nothing the shelf was hiding.
  function volHtml(vol) {
    const sel = vol.id === browseChapterId
    const h = volH(vol.id)
    if (!vol.unlocked) {
      return `<button class="vol vol--turned${sel ? ' vol--sel' : ''}" data-vol="${vol.id}"
          style="--vh:${h}%" aria-label="${t('locked chapter')}">
          <span class="vol-pg">${LOCK_SVG}</span>
        </button>`
    }
    const chapter = CHAPTERS[vol.id]
    const chMeta = meta.chapters?.[vol.id] ?? {}
    const cap = chapterMaxDifficulty(vol.id)
    // `won` (state.js), not maxDifficulty - 1: maxDifficulty is the highest UNLOCKED level, so
    // winning a ladder's last level leaves nothing to unlock and the old expression could never
    // fill any chapter's final star.
    const filled = Math.max(0, Number(chMeta.won) || 0)
    const stars = Array.from({ length: cap }, (_, s) =>
      `<i class="vol-star${s < filled ? ' vol-star--on' : ''}">★</i>`).join('')
    return `<button class="vol${sel ? ' vol--sel' : ''}" data-vol="${vol.id}" style="--vh:${h}%"
        aria-label="${t(chapter.name)}"${sel ? ' aria-current="true"' : ''}>
        ${vol.id === meta.chapter ? '<i class="vol-rib" aria-hidden="true"></i>' : ''}
        <span class="vol-ico" aria-hidden="true">${chapter.icon}</span>
        <span class="vol-nm">${t(spineName(vol.id))}</span>
        <span class="vol-stars" aria-hidden="true">${stars}</span>
      </button>`
  }

  // One étage: its row of volumes and the board they stand on, with the Book's brass plate.
  // The plate is a LABEL, not a control — nothing on the shelf is tappable except a volume.
  function etageHtml(shelf, n) {
    const row = shelf.started
      ? shelf.volumes.map((v) => volHtml(v)).join('')
      : '<span class="dust-sheet" aria-hidden="true"></span>'
    const label = shelf.started
      ? `${tt('Book {n}', { n })} · ${t(shelf.name)}`
      : `${tt('Book {n}', { n })} · ? ? ?`
    const stars = shelf.started ? ` <b class="shelf-stars">★ ${shelf.stars}</b>` : ''
    return `
      <section class="etage" style="--cloth:${shelf.cloth}" aria-label="${label}">
        <div class="shelf-row">${row}</div>
        <div class="shelf-board"><span class="shelf-plate">${label}${stars}</span></div>
      </section>`
  }

  // The room takes the SELECTED chapter's colour. CHAPTERS[id].render.bgColor is a Pixi int
  // (0xrrggbb), so it needs the two-line conversion the hero card's gradient used to do.
  // Set on the ROOT, not on a screen: the tint has to survive both renderTitle's innerHTML rewrite
  // AND a tab change, so the Shop stands in the light of the chapter you just picked. Anything set
  // inside the rebuilt markup would also give the CSS transition nothing to interpolate from.
  // A locked volume tints nothing: you have not seen that chapter, so the room stays neutral.
  function paintRoom() {
    const int = chapterAvailable(meta, browseChapterId) ? CHAPTERS[browseChapterId]?.render?.bgColor : null
    const hex = int == null ? 'transparent' : '#' + (int & 0xffffff).toString(16).padStart(6, '0')
    document.documentElement.style.setProperty('--tint', hex)
    // The open panel wears the BINDING of the volume you tapped, so it reads as that book pulled
    // off the shelf rather than as a separate card. Set on the root for the same reason --tint is:
    // it has to outlive renderTitle's innerHTML rewrite and follow you into the Shop tab.
    document.documentElement.style.setProperty('--cloth-sel', BOOKS[shopBookId()]?.cloth ?? '#3d5c47')
  }

  function bookcaseHtml() {
    const shelves = titleBookshelf(meta)
    // --shelves is the row-height DIVISOR (see .shelf-row, styles.css): the case fills the screen
    // whatever the Book count, instead of being sized for two and leaving one standing in bare desk.
    return `<div class="bookcase" style="--shelves:${shelves.length}">${shelves.map((s, i) => etageHtml(s, i + 1)).join('')}</div>`
  }

  // 3 booster slots: session-selected consumables fill left-to-right, the rest show ＋. Any slot
  // opens the booster bottom-sheet. Boosters are classic-only, and since v6.7 they live on the
  // pre-run BRIEF screen (renderBrief), not the title — the title was carrying too much.
  function boosterSlotsHtml() {
    const selected = [...selectedConsumables]
    const slots = Array.from({ length: 3 }, (_, i) => {
      const id = selected[i]
      if (!id) return `<button class="booster-slot booster-slot--empty" data-act="boosters-open" aria-label="${t('add booster')}">＋</button>`
      const item = CONSUMABLES[id]
      return `
        <button class="booster-slot booster-slot--filled" data-act="boosters-open" aria-label="${t(item.name)}">
          <span class="booster-slot-icon">${item.icon}</span>
          <span class="booster-slot-cost">${item.cost}🪙</span>
        </button>`
    }).join('')
    return `<div class="booster-row">${slots}</div>`
  }

  // Bottom sheet (same .modal-backdrop idiom as the sacrifice modal): the 3 CONSUMABLES as toggle
  // rows. A row is greyed (disabled) when adding it would push the running selection cost past
  // the PLAYED chapter's own book purse (bookId — cheapest-first affordability still finally
  // resolved in main.js's onBriefStart, off the same bookOf(chapter) resolution).
  function boosterSheetHtml(bookId) {
    if (!boostersOpen) return ''
    const bm = bookMeta(meta, bookId) ?? ensureBookMeta(meta, bookId)
    const selectedCost = [...selectedConsumables].reduce((sum, id) => sum + (CONSUMABLES[id]?.cost ?? 0), 0)
    const rows = Object.entries(CONSUMABLES).map(([id, item]) => {
      const selected = selectedConsumables.has(id)
      const otherCost = selectedCost - (selected ? item.cost : 0)
      const afford = selected || (bm.coins - otherCost) >= item.cost
      return `
        <button class="booster-item${selected ? ' booster-item--on' : ''}" data-consumable="${id}" ${afford ? '' : 'disabled'}>
          <span class="booster-item-icon">${item.icon}</span>
          <span class="booster-item-body">
            <span class="booster-item-name">${t(item.name)}</span>
            <span class="booster-item-desc">${t(item.desc)}</span>
          </span>
          <span class="booster-item-cost">${item.cost}🪙</span>
          <span class="booster-item-check">${selected ? '✓' : ''}</span>
        </button>`
    }).join('')
    return `
      <div class="modal-backdrop sheet-backdrop" data-act="boosters-close" data-pop="boosters">
        <div class="bottom-sheet">
          <div class="sheet-handle"></div>
          <h3 class="sheet-title">${t('Boosters')} <span class="sheet-note">${t('this run only')}</span></h3>
          <div class="sheet-list">${rows}</div>
          <button class="btn btn--soft btn--small sheet-done" data-act="boosters-close">${t('Done')}</button>
        </div>
      </div>`
  }

  // The detail panel's head — the chapter's identity, which the hero card used to carry and a 47px
  // spine cannot. This is the only place the cast thumbnails (CAST_ART, baked by
  // scripts/bake-cast.mjs from render.js's own creature textures) still appear, so deleting it
  // would quietly orphan them.
  function detailHeadHtml() {
    const id = browseChapterId
    if (!chapterAvailable(meta, id)) {
      // Named neither by the volume nor here: a locked chapter's identity is the thing the turned
      // volume exists to withhold.
      const line = id === 'blank'
        ? t('win The Beyond at level 5 — something has been counting')
        : tt('win {name} at difficulty 3+', { name: t(CHAPTERS[furthestUnlockedChapterId(meta)].name) })
      return `
        <div class="detail-head">
          <span class="detail-ico">🔒</span>
          <span class="detail-name"><b>???</b><small>${line}</small></span>
        </div>`
    }
    const chapter = CHAPTERS[id]
    const chMeta = meta.chapters?.[id] ?? {}
    // A named face with no baked file is skipped rather than drawn as an empty disc — that only
    // happens when bake-cast.mjs has not been re-run for a newly added id, and a short row reads as
    // a small cast where a blank disc reads as broken.
    const cast = (chapter.render.cast ?? [])
      .filter((rid) => CAST_ART[rid])
      .map((rid) => `<span class="detail-face"><img src="${CAST_ART[rid]}" alt="" draggable="false"></span>`)
      .join('')
    const best = chMeta.best?.time ? `<span class="detail-best">${t('best')} ${fmtTime(chMeta.best.time)}</span>` : ''
    return `
      <div class="detail-head">
        <span class="detail-ico">${chapter.icon}</span>
        <span class="detail-name"><b>${t(chapter.name)}</b><small>${t(chapter.tagline)}</small></span>
        ${cast ? `<span class="detail-cast" aria-hidden="true">${cast}</span>` : ''}
        ${best}
      </div>`
  }

  // The Shop door's two numbers: the book's purse, and how far through the book's permanent upgrades
  // it is. The percentage is bookProgress (state.js), which is where the arithmetic lives and where
  // the suite can reach it — sacrifices are counted on both sides of it, see the note there.
  function shopDoor(bookId) {
    const bm = bookMeta(meta, bookId) ?? ensureBookMeta(meta, bookId)
    return { coins: bm.coins, pct: bookProgress(bm, bookId).pct }
  }

  // ---- the podium: the level preview's other page ---------------------------------------------
  // The leaderboard lives on the TITLE's open-book spread, turned to like a page. That panel is the
  // level preview — it names the chapter, its cast, your record, and it is where the difficulty is
  // chosen — so it is the one place where "what is a good score here?" is already the question
  // being asked. It shipped on the pre-run brief first, one screen further in, and the owner could
  // not find it; his own words were "a podium icon on the preview of the level, that should turn
  // the page of the preview", and the brief has no pages while this thing is literally a book.
  //
  // ONE BOARD PER PAGE (owner's pick): kills on the verso, and on the recto the level you reached —
  // except on a BOSS chapter, where the recto is your kill time and the shortest one wins (owner,
  // 2026-08-19). A scripted chapter has no survival clock and no reason to grind levels: it ends
  // when the boss dies, so how long that took is the only score its second board can be about.
  // That is what
  // keeps the panel's height EXACTLY as it is — measured, and the reason it matters: .spread is
  // 324x168 with the bookcase above it holding 0px of scroll headroom, so any growth here squeezes
  // the shelf, which is the failure the .spread comment already records (33px of overflow once ate
  // the second shelf's brass plate).
  //
  // ui.js fetches this itself instead of going through a main.js hook, which is the seam every
  // other cross-module fact uses. The line: hooks exist for things main.js OWNS — the run, meta
  // writes, spending coins. A read-only board belongs to nobody, needs no game state, and routing
  // it through main.js would add a hook, a callback and a re-render trigger to move data that has
  // exactly one consumer, the screen it is drawn on.
  let podiumOpen = false
  let podiumState = null   // null = loading, 'error', or { kills: [...], level: [...], time: [...] }
  let podiumReq = 0        // monotonic; only the newest request may paint (see loadPodium)
  // ONE-SHOT: true only for the render a page-turn causes. It cannot live on the spread
  // unconditionally, because updateTitleBelow runs for a dozen unrelated reasons — every difficulty
  // pip, every board arriving — and each would spin the whole panel. Set by the two turn actions,
  // consumed by the next render.
  let podiumTurn = false

  // A SESSION CACHE, and it exists for the LEADER LINE on the closed page, not for the podium.
  // Turning the page still always re-reads — a board that has not moved costs one small request and
  // a board that HAS moved is the entire point of turning to it — but the leader is drawn on every
  // title render and every difficulty pip tap, and fetching there would mean a request on every
  // boot plus five more on a walk up the ladder. The limiter is 10/60s per IP and a household
  // shares one, so that is a real way to 429 your own friends into a blank line.
  // ONE cache for both paths, deliberately: separate freshness would let the front page name
  // someone the back page does not have at the top.
  const podiumCache = new Map()   // 'chapter:difficulty' -> boards
  const podiumPending = new Set() // keys with a fetch in flight, so a render cannot start a second
  const boardKey = (chapterId, difficulty) => `${chapterId}:${difficulty}`

  // The recto's board, and the ONE place that decides it. Keyed off CHAPTERS[].scripted — the same
  // flag the HUD reads to drop the survival countdown — so a future boss chapter gets the time
  // board by being a boss chapter, with nothing here to remember to update. The Worker returns all
  // three boards regardless (it knows no chapter ids); choosing between them is a game fact and
  // lives on this side.
  const secondBoard = (chapterId) => (CHAPTERS[chapterId]?.scripted ? 'time' : 'level')

  // Dropped when a run PLACES. Not after every run: a score that missed the top 3 moved no board,
  // and re-reading then is a request that can only return what is already held.
  function forgetBoard(chapterId, difficulty) {
    podiumCache.delete(boardKey(chapterId, difficulty))
  }

  // Fills the cache for the closed page's leader line. Never touches podiumState — that belongs to
  // the turned page, and a background read must not drop it into its loading skeleton.
  function ensureBoards(chapterId, difficulty) {
    const key = boardKey(chapterId, difficulty)
    if (podiumCache.has(key) || podiumPending.has(key)) return
    podiumPending.add(key)
    fetchBoards(chapterId, difficulty).then((boards) => {
      podiumPending.delete(key)
      if (!boards) return // an unreachable board shows NOTHING on the title, never a message
      podiumCache.set(key, boards)
      if (active === 'title' && !podiumOpen) updateTitleBelow()
    })
  }

  function loadPodium(chapterId, difficulty) {
    const mine = ++podiumReq
    podiumState = null
    fetchBoards(chapterId, difficulty).then((boards) => {
      if (boards) podiumCache.set(boardKey(chapterId, difficulty), boards)
      // Late answers must not paint over what the player is looking at — two turns in a row is
      // enough to race this. A monotonic token rather than the board's key, because the key cannot
      // separate two in-flight requests for the SAME board: turn, turn back, turn again to the same
      // chapter and difficulty while the first is still out, and both pass a key comparison — so if
      // the first settles last and failed, an already-painted board flips to the error state.
      if (podiumReq !== mine) return
      podiumState = boards ?? 'error'
      if (active === 'title' && podiumOpen) updateTitleBelow()
    })
  }

  // A DRAWN medal, and the ribbon is the whole point: a coloured disc alone reads as a list index
  // (which is what it was), while two straps above it read as a placing before you have read the
  // number at all. Emoji medals were not an option — same ruling as the shop icons, the glyph is a
  // different drawing on every platform and gold/silver/bronze are the one thing that must not be.
  // THE DIGIT STAYS, and that was shot rather than argued: a bare disc and an embossed star were
  // built alongside this and both read better zoomed in than at the size they ship at. The disc is
  // 13px on a phone, where a star is four grey pixels and a number is still a number — so the medal
  // says the rank twice, once in metal and once in ink, and a screen reader gets it before the name.
  const medalHtml = (n) => `<span class="podium-rank podium-rank--${n}">
      <svg class="medal" viewBox="0 0 22 30" aria-hidden="true">
        <path class="medal-rib" d="M2.5 0h5.5l6 13.5-5 2z"/>
        <path class="medal-rib" d="M19.5 0h-5.5l-6 13.5 5 2z"/>
        <circle class="medal-disc" cx="11" cy="20.5" r="8.4"/>
      </svg><b class="medal-n">${n}</b></span>`

  // STACKED, name over score, and that is the whole reason one board fits a half-page. A spread
  // page is 162px wide and 142px of it is content: a rank disc, a nickname and a score on ONE line
  // leaves about 80px for the name, which truncates every nickname past ~11 characters — and the
  // cap is 15. Stacked, the name gets the full width and 15 characters fit with room over.
  // role="listitem" rather than a real <li>: the rows are a grid and an <ul> would bring list
  // styling and a second box to undo, but a screen reader on a flat run of names and numbers has
  // nothing to tell it where one entry ends and the next begins.
  //
  // THE WEAPON RIDES ON THE FIGURE'S LINE, not on one of its own, and that is the layout talking:
  // the .spread is 324x168 with 0px of scroll headroom above it, so a fourth line per row grows the
  // panel and eats the bookcase's brass plate (the failure .spread's own comment records). Beside
  // the score it costs the row nothing — the icon sits on a line that is already there.
  //
  // Drawn ONLY when the row carries one, which main.js sends only for a chapter that ROLLS its
  // starter. So the check here is `r.starter`, not a chapter test: a board where every run began on
  // the same weapon would otherwise print the same glyph three times and say nothing.
  // The HUD's own icon for that weapon, deliberately — the chip a player watches for a whole run is
  // the one thing that can name a weapon here without a word, and this leaf has no room for a word.
  // The NAME still reaches a screen reader through aria-label, which is the only reader a `title`
  // tooltip would never serve on the phone this ships to.
  const podiumWeaponHtml = (id) => {
    const w = WEAPONS[id]
    if (!w) return '' // a build that has never heard of this weapon draws nothing, not a '❔'
    return `<span class="podium-weapon" role="img" aria-label="${esc(t(w.name))}">${w.icon}</span>`
  }
  const podiumRowHtml = (r, i) => `
    <div class="podium-row${r.nick === meta.nick ? ' podium-row--me' : ''}" role="listitem">
      ${medalHtml(i + 1)}
      <span class="podium-entry">
        <span class="podium-nick">${esc(r.nick)}</span>
        <span class="podium-figure">
          <b class="podium-score">${r.score}</b>
          ${r.starter ? podiumWeaponHtml(r.starter) : ''}
        </span>
      </span>
    </div>`

  // Three dashed placeholders rather than a spinner: the row count is known before the data is, so
  // the page holds its own shape and only the numbers arrive.
  // aria-hidden: the placeholder carries no information, and a screen reader announcing an
  // unlabelled three-item list while the real one is still loading is worse than silence.
  const podiumSkeleton = () =>
    '<div class="podium-rows" aria-hidden="true">' + [0, 1, 2].map((i) => `
      <div class="podium-row podium-row--wait">
        ${medalHtml(i + 1)}
        <span class="podium-bone"></span>
      </div>`).join('') + '</div>'

  // The empty branch sits OUTSIDE role="list": a <p> inside one is an ARIA violation.
  const podiumBoardHtml = (rows) => (rows.length
    ? `<div class="podium-rows" role="list">${rows.map(podiumRowHtml).join('')}</div>`
    : `<p class="diff-hint podium-empty">${t('No scores yet — be the first.')}</p>`)

  // The whole inside of a turned spread. A state with nothing to rank — no scores yet, or no
  // network — gets ONE page across both leaves rather than a message on the verso and a blank
  // recto, which read as half the panel having failed to load.
  function podiumSpreadHtml() {
    if (podiumState === 'error') {
      // A BUTTON, not a caption. The failure is almost always transient (a phone between cells), the
      // fetch has an 8s timeout and there is no cache, so "turn back, turn again, wait again" was
      // the whole recovery path for a tap that just needed repeating.
      return `<div class="page page--board page--solo">
        <button class="btn btn--soft btn--small podium-retry" data-act="podium-open">${
          t('Could not reach the podium. Tap to try again.')}</button>
      </div>`
    }
    // Nobody has played this board at all — which on launch day is every board in the game. Against
    // THIS chapter's own two boards, not all three: on a boss chapter the level board fills up like
    // anywhere else and is simply not shown, so testing it here would keep a genuinely empty spread
    // out of this branch and draw two blank leaves instead.
    const second = secondBoard(browseChapterId)
    if (podiumState && !podiumState.kills.length && !podiumState[second].length) {
      return `<div class="page page--board page--solo">
        <p class="diff-hint podium-empty">${t('No scores yet — be the first.')}</p>
      </div>`
    }
    return `
      <div class="page page--verso page--board">${podiumPageHtml('kills')}</div>
      <div class="page page--recto page--board">${podiumPageHtml(second)}</div>`
  }

  // Who holds this board's kills record, under the Podium button on the CLOSED page — so the panel
  // answers "is anyone ahead of me here?" without being asked, and the button below it stops being
  // a door to an unknown room.
  //
  // RENDERS NOTHING when there is no answer (owner's call): no scores yet, offline, rate-limited,
  // still loading. Every one of those is a state the player can do nothing about, and a placeholder
  // or an error on a title screen is worse than a panel that simply looks like it did before. It
  // also means this can never make the panel taller than the 34px of slack measured under the
  // button, because the only thing it ever draws is one line.
  //
  // Kills, not level: the two boards disagree often (they did in every screenshot of this feature),
  // and one line has to pick. Kills is the number the chapter is about.
  //
  // The gold disc rather than a medal emoji — it is the SAME element the podium's first row uses,
  // so the closed page and the turned page name first place with one mark. A cross-platform emoji
  // could not do that (see the drawn shop icons, same ruling).
  function leaderLine(chapterId, difficulty) {
    ensureBoards(chapterId, difficulty)
    const top = podiumCache.get(boardKey(chapterId, difficulty))?.kills?.[0]
    if (!top) return ''
    return `<div class="spread-leader">
      ${medalHtml(1)}
      <span class="podium-nick">${esc(top.nick)}</span>
    </div>`
  }

  // ONE leaf of the turned spread: the metric's name, then its three rows.
  function podiumPageHtml(which) {
    // NO "top 3" CHIP HERE, and it is the layout that decided that rather than taste. The chip was
    // added when the boards were stacked full-screen, where three rows could read as a whole list.
    // On a spread leaf the label has 142px: "NIVEAU ATTEINT" plus the chip is 147px, so French
    // wrapped the eyebrow to two lines — which pushed the recto's rows down, broke the alignment of
    // the two boards across the gutter, and grew the panel the whole layout was chosen to preserve.
    // The form now answers the question the chip did: two side-by-side ranked lists of exactly
    // three, reached from a control that says Podium.
    // 'Best time' and not 'Fastest kill' for the reason above: the eyebrow gets 142px, and the
    // French for the longer one wraps to two lines, which drops the recto's rows out of line with
    // the verso's across the gutter and grows the panel. 'Meilleur temps' is exactly as long as
    // 'Niveau atteint', the label already measured to fit.
    const label = { kills: 'Kills', level: 'Level reached', time: 'Best time' }[which]
    const eyebrow = `<div class="brief-eyebrow podium-eyebrow">${t(label)}</div>`
    if (podiumState === null) return `${eyebrow}${podiumSkeleton()}`
    // Each board is scored by its OWN metric. Passing rows through with a `score` field rather than
    // teaching podiumRowHtml which board it is drawing keeps one row renderer for all three — and
    // the time board is the reason that indirection now earns its keep, since its score is the only
    // one that is not the raw number (mm:ss, off milliseconds).
    const score = { kills: (r) => r.kills, level: (r) => r.level, time: (r) => fmtTime(r.timeMs / 1000) }[which]
    const rows = podiumState[which].map((r) => ({ ...r, score: score(r) }))
    return `${eyebrow}${podiumBoardHtml(rows)}`
  }

  function titleBelowHtml() {
    const heroUnlocked = chapterAvailable(meta, browseChapterId)
    const chMeta = meta.chapters?.[browseChapterId] ?? { maxDifficulty: 1, difficulty: 1 }
    const cap = chapterMaxDifficulty(browseChapterId)
    // The ladder's whole reward, as a chip on the label rather than the four-line paragraph this
    // used to be. The +HP/+damage percentages are gone on purpose: the pip number already says
    // "harder", and the anomaly COUNT is level - 1, which the lit pips also say. What no pip can
    // say is the payout, so that is the one thing kept.
    const coinPct = Math.round(((chMeta.difficulty - 1) * DIFFICULTY_COIN_PER_LEVEL) * 100)
    const rewardChip = chMeta.difficulty > 1 ? `<b class="diff-reward-chip">+${coinPct}% 🪙</b>` : ''
    const playBlock = heroUnlocked ? `
      <div class="diff-row">
        <span class="diff-label">${t('Difficulty')}${rewardChip}</span>
        ${Array.from({ length: cap }, (_, i) => {
          const d = i + 1
          if (d > chMeta.maxDifficulty) return `<button class="diff-pip diff-pip--locked" data-act="diff" data-diff="${d}" disabled>🔒</button>`
          return `<button class="diff-pip${d <= chMeta.difficulty ? ' diff-pip--on' : ''}" data-act="diff" data-diff="${d}">${d}</button>`
        }).join('')}
      </div>
      <!-- IN THE RECTO'S OWN SLACK, which is why it costs the panel nothing. Measured on the live
           build: the spread is 324x168, and this page's content (label + pips) uses 112 of its 168,
           so 56px sit empty under the pips while the VERSO — icon, name, tagline, cast, record —
           sets the height. A row on the foot line instead would push the panel, and the bookcase
           above has 0px of scroll headroom (the .spread comment records 33px of overflow once
           eating the second shelf's brass plate).
           It also belongs beside the pips on meaning, not just on space: a board is scoped to ONE
           difficulty, and this is where difficulty is chosen. -->
      <button class="spread-podium" data-act="podium-open">
        ${ICO_PODIUM}<span>${t('Podium')}</span><i>→</i>
      </button>
      ${leaderLine(browseChapterId, chMeta.difficulty)}
      ` : ''
    // Across the FOOT of the spread, not on the recto: at half width this sentence wraps to two
    // lines in both languages, and those two lines were most of why the panel still pushed the
    // bookcase past its scroll box. Full width it is one line.
    const ladderHint = heroUnlocked && chMeta.maxDifficulty < cap
      ? `<p class="diff-hint diff-hint--locked">${tt('win level {n} to unlock {m}', { n: chMeta.maxDifficulty, m: chMeta.maxDifficulty + 1 })}</p>`
      : ''
    // A two-page SPREAD, not a stack: the volume you tapped, opened. Verso carries the chapter's
    // identity, recto the run you are about to start. It exists for a measured reason as much as a
    // thematic one — stacked, this panel was 255px of a 745px phone and the bookcase overflowed by
    // 33px, which silently ate the whole second shelf's brass plate (its only "Book 2" label).
    // Side by side the panel is ~170px, so the shelf clears at every viewport this game ships to.
    // The Shop door carries the BOOK's purse and the BOOK's completion, because that is the only
    // thing on this screen that says which shop it is: the coins you see here are the ones it
    // spends, and the meter fills for this book alone. That is also why the header no longer shows
    // a coin badge — one balance, on the door it belongs to, instead of the same number twice.
    const { coins, pct } = shopDoor(shopBookId())
    // TURNED: the same two leaves, carrying one board each. The spread keeps its height because the
    // pages keep their count — that is the whole reason this layout was chosen over stacking both
    // boards on one wide page (owner's pick), and it is what leaves the bookcase above untouched.
    // The foot line, which normally carries the ladder hint, becomes the way back and the only
    // thing that says WHICH board you are reading: the pips are on the leaf now showing scores.
    const turn = podiumTurn ? ' spread--turn' : ''
    podiumTurn = false
    if (podiumOpen) {
      return `
        <div class="spread${turn}">${podiumSpreadHtml()}</div>
        <!-- WHOSE and WHICH DIFFICULTY, because those are the two facts a turned leaf cannot imply.
             The chapter is not repeated: the bookcase directly above has this volume ringed,
             ribboned and open, so it is the one piece of context the page gets for free — and the
             full sentence this replaces ("The best runs by everyone playing.") does not fit a foot
             line that also has to be the way back. Without it, three unfamiliar names arriving
             where the verso's own "record 05:00" used to be read as a personal-best list that has
             gone wrong.
             NO BACKTICKS IN HERE. This comment is inside a template literal, so one would close it
             and the next word becomes code — which is exactly how it shipped a blank page for a
             minute, with node --check clean because the check ran before the comment was added. -->
        <button class="diff-hint podium-foot" data-act="podium-close">
          ←&nbsp; ${tt('all players · difficulty {n}', { n: chMeta.difficulty })}
        </button>
        <div class="volume-acts">
          <button class="btn btn--big btn--play" data-act="play" ${heroUnlocked ? '' : 'disabled'}>▶&nbsp; ${t('Play')}</button>
          <button class="btn btn--shop" data-act="shop" style="--shop-pct:${pct}%" aria-label="${t('Shop')}">
            <span class="shop-btn-label">🛒&nbsp; ${t('Shop')}</span>
            <small class="shop-btn-purse">🪙 ${coins}</small>
            <span class="shop-btn-meter"><i></i><b>${pct}%</b></span>
          </button>
        </div>`
    }
    return `
      <div class="spread${turn}">
        <div class="page page--verso">${detailHeadHtml()}</div>
        <div class="page page--recto">${playBlock}</div>
      </div>
      ${ladderHint}
      <div class="volume-acts">
        <button class="btn btn--big btn--play" data-act="play" ${heroUnlocked ? '' : 'disabled'}>▶&nbsp; ${t('Play')}</button>
        <button class="btn btn--shop" data-act="shop" style="--shop-pct:${pct}%" aria-label="${t('Shop')}">
          <span class="shop-btn-label">🛒&nbsp; ${t('Shop')}</span>
          <small class="shop-btn-purse">🪙 ${coins}</small>
          <span class="shop-btn-meter"><i></i><b>${pct}%</b></span>
        </button>
      </div>`
  }

  // Surgical update after a difficulty pip is tapped: rebuild only the panel under the bookcase.
  // Selecting a different VOLUME goes through renderTitle instead — the shelf itself has to
  // re-render to move the selection ring and the ribbon, and unlike the carousel it has no scroll
  // offset to lose, which is what forced the surgical path in the first place.
  function updateTitleBelow() {
    const below = screens.title.querySelector('.title-below')
    if (below) below.innerHTML = titleBelowHtml()
  }

  // Centre the browsed card in the carousel WITHOUT animation. Must run while the title screen is
  // visible (a display:none element measures as zero-width) — hence it's also called from
  // showScreen right after the screen is shown, not only from renderTitle.
  function renderTitle() {
    // resolveChapterId, not raw meta.chapter: this fires when the browsed chapter has no ledger
    // entry — reachable for 'blank', which lives outside CHAPTER_ORDER so ensureChapterMeta never
    // creates one — and falling back to an unvalidated pointer would put the alien id straight back
    // (R1, config.js).
    if (!meta.chapters?.[browseChapterId]) browseChapterId = playableChapterId(meta)
    setHtml(screens.title, `
      <header class="title-bar">
        <button class="pill-btn" data-act="settings" aria-label="${t('Settings')}">⚙</button>
        <!-- data-act="dev-tap-wip": seven quick taps toggle the WIP gate (meta.dev), which is what
             reveals work-in-progress chapters. Same gesture as the HUD badge's hidden dev menu and
             the same two constants, but its own counter and its own case — see 'dev-tap-wip'.
             It sat on the header's coin badge until the balance moved onto the Shop door; the LOGO
             is the replacement because it is the only other thing up here that is not a control,
             so seven taps on it cannot also fire something else. -->
        <h1 class="title-logo" data-act="dev-tap-wip"><span>Charming</span> <span>Anomaly</span></h1>
        ${meta.dev ? '<span class="dev-pill">DEV</span>' : ''}
      </header>
      ${bookcaseHtml()}
      ${syncNoticeHtml()}
      <div class="title-below">${titleBelowHtml()}</div>
      ${settingsSheetHtml()}
      ${slotsModalHtml()}
      ${renameSheetHtml()}
      ${nickSheetHtml()}
      ${syncSheetHtml()}
      ${conflictSheetHtml()}
    `)
    paintRoom()
    // THE MANDATORY SHEET, MADE ACTUALLY MANDATORY. A modal backdrop blocks the pointer and nothing
    // else — Tab order is untouched by a `position: fixed` div — so keyboard focus walked onto Play
    // behind it. The click guard stops the run starting, but focus still LANDED there and Enter did
    // nothing with no explanation. `inert` removes the rest of the screen from the tab order and
    // from hit-testing in one attribute; the click guard stays as the floor for a browser that does
    // not support it. Cleared on every render, so it cannot outlive the sheet.
    // The conflict prompt joins the mandatory nickname here for the same reason and one more:
    // §7.2 must disable Play and the nav while it is up. It cannot use `case 'play'`'s
    // force-close escape (the sheet is not dismissible), and ui.js already documents that
    // keyboard focus reaches Play behind a backdrop — so Tab-then-Enter would start a run under
    // an unresolved prompt whose held cloud row then goes stale.
    const blocked = nickPrompted() || conflictPending()
    for (const n of screens.title.children) {
      n.toggleAttribute('inert', blocked && !n.classList.contains('nick-sheet') && !n.classList.contains('conflict-sheet'))
    }
    // After the wholesale innerHTML rewrite, never before it.
    focusRenameField()
    armSyncNotice()
    markBookcaseScroll()
  }

  // A clipped shelf and a short shelf look identical, and the thing that goes first is the brass
  // plate — the only place a Book's name and star total are written. So when the case really does
  // not fit, its bottom edge fades to say there is more below. Measured, not inferred from the
  // number of Books: two Books overflow a 375x667 phone and three fit a tall one.
  // rAF because the class is decided from a layout that the innerHTML rewrite one line up has not
  // produced yet; `resize` because the answer changes on rotation with no re-render of its own.
  function markBookcaseScroll() {
    requestAnimationFrame(() => {
      const bc = screens.title.querySelector('.bookcase')
      if (bc) bc.classList.toggle('bookcase--more', bc.scrollHeight - bc.clientHeight > 2)
    })
  }
  addEventListener('resize', markBookcaseScroll)

  // v6.7 settings sheet. The title used to float four separate things over the artwork — 🌐, 💾, the
  // coins badge and the build stamp — which is most of what "there's a lot on the page" meant, and
  // the stamp was drawn straight through the 🌐 pill. Everything except the coins badge now lives
  // behind one ⚙, including the build stamp, which is a diagnostic and belongs where you go looking
  // for it. Save slots keep their own modal (slotsModalHtml) and open FROM here.
  let settingsOpen = false
  function settingsSheetHtml() {
    if (!settingsOpen) return ''
    const langRows = LANGS.map(([id, label]) => `
      <button class="settings-lang${id === getLang() ? ' settings-lang--on' : ''}" data-act="lang-pick" data-lang="${id}">${label}</button>`).join('')
    // Which side the skill button sits on. Reuses the language row's picker markup verbatim — same
    // two-of-N shape, so it needs no CSS of its own. The label's ☉ is the button's OWN glyph
    // (skill-btn-glyph), not a lookalike, so the row names the thing it moves.
    const sideRows = [['left', t('Left')], ['right', t('Right')]].map(([id, label]) => `
      <button class="settings-lang${id === meta.skillSide ? ' settings-lang--on' : ''}" data-act="side-pick" data-side="${id}">${label}</button>`).join('')
    return `
      <div class="modal-backdrop sheet-backdrop" data-act="settings-close" data-pop="settings">
        <div class="bottom-sheet">
          <div class="sheet-handle"></div>
          <h3 class="sheet-title">⚙ ${t('Settings')}</h3>
          <div class="settings-row">
            <span class="settings-label">🌐 ${t('language')}</span>
            <span class="settings-langs">${langRows}</span>
          </div>
          <div class="settings-row">
            <span class="settings-label">☉ ${t('skill button')}</span>
            <span class="settings-langs">${sideRows}</span>
          </div>
          <!-- The rename lives here rather than beside the podium it feeds, because a name is
               changed once and read constantly: putting it on the board would cost every visit a
               control nobody wants. It shows the current name so the row answers "what am I called
               again?" without opening anything. -->
          <button class="btn btn--soft btn--small settings-slots" data-act="nick-edit">${ICO_PODIUM} ${t('Nickname')} <i>${esc(meta.nick || '—')}</i></button>
          <button class="btn btn--soft btn--small settings-slots" data-act="slots">💾 ${t('Save slots')} <i>${activeSlot()}/${SAVE_SLOTS}</i></button>
          ${syncRowHtml()}
          ${buildStampHtml()}
          <button class="btn btn--soft btn--small sheet-done" data-act="settings-close">${t('Done')}</button>
        </div>
      </div>`
  }

  // Save-slot picker modal (v6.4.6) — same backdrop/confirm-sheet idiom as the reset-all-progress
  // modal below (resetOpen/resetModalHtml): a ui-local boolean, not persisted, opened from the
  // settings sheet (v6.7; it was the title's own 💾 button before) and by the slot rows themselves.
  let slotsOpen = false

  // v6.6.12 save names. The row is now a WRAPPER holding two real sibling buttons — the picker and
  // a ✏️ — because buttons cannot nest, the same wall this codebase already hit and documented at
  // the booster row ("A div, not a button: the row holds two real buttons now"). Two sibling
  // buttons also fix the thing that made an earlier design's in-row glyph unbuildable: the picker
  // for the CURRENT slot is `disabled`, so anything inside it is unclickable, and renaming the save
  // you are actually playing is the single most likely thing a player wants. As a separate element
  // the ✏️ stays live. It is a full 44px target rather than a ~24px glyph, which matters because a
  // miss on this row reloads the page into a different save.
  // `rename` renders the ✏️ COLUMN, disabled when the slot is empty rather than omitted: dropping the
  // button lets that row stretch into the column and the sheet's right edge goes ragged. Disabled
  // also says the true thing — there is no save here to name yet.
  function slotRowHtml(n, { act = 'slot-pick', disabled = false, rename = true } = {}) {
    const summary = slotSummary(n)
    const named = summary?.name
    const line1 = `${named || `${t('Slot')} ${n}`}${n === activeSlot() ? ` — ${t('Current')}` : ''}`
    // The slot NUMBER moves to the small line once a name replaces it on the headline: the reset
    // confirm and the sync copy both say "Slot 2", so the number has to stay visible somewhere.
    const line2 = summary
      ? `${named ? `${t('Slot')} ${n} · ` : ''}🪙 ${summary.coins} · ${summary.unlocked}/${summary.total}`
      : t('Empty — new game')
    return `
      <div class="slot-row-wrap">
        <button class="btn btn--soft slot-row" data-act="${act}" data-slot="${n}" ${disabled ? 'disabled' : ''}>
          <span class="slot-row-name">${esc(line1)}</span>
          <small class="slot-row-summary">${esc(line2)}</small>
        </button>
        ${rename ? `<button class="btn btn--soft slot-rename" data-act="slot-rename" data-slot="${n}"
          ${summary ? '' : 'disabled'} aria-label="${t('Name this save')}">✏️</button>` : ''}
      </div>`
  }

  // Which slot the rename sheet is editing (null = closed), and the in-progress text. The draft
  // lives OUT here on purpose: renderTitle() replaces screens.title.innerHTML wholesale and the
  // sheet is inside that template, so any re-render — the 🌐 toggle, a booster tap, Cancel —
  // destroys the live <input> and everything typed into it. Holding the value here and restoring it
  // (plus the caret) after each render is what makes a text field survive this render model at all.
  // This is the codebase's first <input>, and the pairing field will reuse exactly this machinery.
  let renameSlot = null
  let renameDraft = ''

  function renameSheetHtml() {
    if (renameSlot == null) return ''
    return `
      <div class="modal-backdrop" data-act="rename-cancel" data-pop="rename">
        <div class="confirm-sheet">
          <h2 class="confirm-sheet-title">✏️ ${t('Name this save')}</h2>
          <p class="confirm-sheet-body">${tt('Slot {n} — leave it empty to go back to a number.', { n: renameSlot })}</p>
          <input class="text-field" id="rename-field" type="text" value="${esc(renameDraft)}"
            maxlength="${NAME_MAX}" autocapitalize="sentences" autocorrect="off" autocomplete="off"
            spellcheck="false" enterkeyhint="done" aria-label="${t('Save name')}">
          <div class="confirm-sheet-actions">
            <button class="btn btn--soft btn--small" data-act="rename-cancel">${t('Cancel')}</button>
            <button class="btn btn--small" data-act="rename-save">${t('Done')}</button>
          </div>
        </div>
      </div>`
  }

  // ---- leaderboard nickname ---------------------------------------------------------------
  // The name other players read on the podium (meta.nick), which is NOT meta.name — that one names
  // the save slot and never leaves the device. Reuses the rename sheet's machinery exactly: the
  // same out-of-render draft (renderTitle rewrites innerHTML wholesale and would otherwise destroy
  // the live <input> on every keystroke that triggers a redraw), the same restore-and-focus.
  //
  // Mandatory by the owner's ruling. It has no Cancel until a nickname exists, so the very first
  // load cannot get past it — which is the point: a board where half the entries are blank is not
  // a board. Afterwards the same sheet is the rename, and then it does have a Cancel.
  let nickEditing = false
  let nickDraft = ''
  const nickPrompted = () => nickEditing || !meta.nick

  // A NEW SLOT SHOULD NOT RE-ASK A QUESTION THIS DEVICE HAS ALREADY ANSWERED. meta is per-slot, so
  // creating slot 2 lands on the mandatory prompt again — same person, same device, same name — and
  // makes them retype it, or worse, mistype it and become two people on the board. Offering the
  // nickname another slot already carries turns that into one tap on an already-enabled Done.
  // Not applied to a RENAME: there the draft is your current name, which is the thing you came to
  // change. First non-empty wins; slots are equal and there is no "primary" to prefer.
  function nickFromAnySlot() {
    for (let n = 1; n <= SAVE_SLOTS; n++) {
      const found = validNick(slotSummary(n)?.nick)
      if (found) return found
    }
    return ''
  }

  function nickSheetHtml() {
    if (!nickPrompted()) return ''
    const first = !meta.nick
    // Seeded once, on the render that opens the sheet, and only for the mandatory prompt — after
    // that nickDraft is whatever the player is typing and must not be overwritten under them.
    if (first && !nickDraft) nickDraft = nickFromAnySlot()
    const ok = validNick(nickDraft) != null
    return `
      <div class="modal-backdrop nick-sheet"${first ? '' : ' data-act="nick-cancel"'} data-pop="nick">
        <div class="confirm-sheet">
          <h2 class="confirm-sheet-title">${ICO_PODIUM} ${t(first ? 'Pick a nickname' : 'Your nickname')}</h2>
          <!-- Says it is PUBLIC, which is the fact a player needs before typing and the one the
               first wording left out — "it appears on the podium" reads just as easily as a local
               scoreboard, and forward-references a screen they have not seen yet. -->
          <p class="confirm-sheet-body">${t('Other players see this name on the podium.')}</p>
          <!-- ABOVE the input, not below it. A soft keyboard covers the bottom of this sheet (the
               keydown handler's own comment says so), and below the field it hid both the reason
               Done was disabled AND Done itself — so the keyboard's own Done key would fire
               nick-save, which breaks silently on an invalid name, and nothing on screen said why.
               It is a hint at rest and becomes the reason the button is dead, so there is only ever
               one line here saying one thing. -->
          <p class="confirm-sheet-body nick-rule${ok || !nickDraft ? '' : ' nick-rule--bad'}">${
            tt('{min}-{max} characters', { min: NICK_MIN, max: NICK_MAX })}</p>
          <input class="text-field" id="nick-field" type="text" value="${esc(nickDraft)}"
            maxlength="${NICK_MAX}" autocapitalize="off" autocorrect="off" autocomplete="off"
            spellcheck="false" enterkeyhint="done" aria-label="${t('Nickname')}">
          <div class="confirm-sheet-actions">
            ${first ? '' : `<button class="btn btn--soft btn--small" data-act="nick-cancel">${t('Cancel')}</button>`}
            <button class="btn btn--small" data-act="nick-save" ${ok ? '' : 'disabled'}>${t('Done')}</button>
          </div>
        </div>
      </div>`
  }

  // Restores what the wholesale innerHTML rewrite just destroyed. Caret to the end rather than a
  // preserved offset: the only thing that re-renders mid-rename is a full sheet redraw, after which
  // "carry on typing" is the right place to be.
  // The title screen has two text fields now (save rename and nickname). The nickname sheet is
  // rendered LAST and therefore sits on top, so it wins when both are up — which the plain
  // "whichever .text-field is here" query got backwards, since renameSheetHtml comes first in the
  // markup and querySelector returns document order. Focusing the buried field would move focus out
  // of the sheet the player is actually typing into on every render.
  function focusRenameField() {
    const el = screens.title.querySelector('#nick-field')
      ?? screens.title.querySelector('#sync-code')
      ?? screens.title.querySelector('.text-field')
    if (!el) return
    el.focus()
    try { el.setSelectionRange(el.value.length, el.value.length) } catch { /* not all input types support it */ }
  }

  function slotsModalHtml() {
    if (!slotsOpen) return ''
    const rows = Array.from({ length: SAVE_SLOTS }, (_, i) => i + 1)
      .map((n) => slotRowHtml(n, { disabled: n === activeSlot() })).join('')
    return `
      <div class="modal-backdrop" data-act="slots-cancel" data-pop="slots">
        <div class="confirm-sheet">
          <h2 class="confirm-sheet-title">💾 ${t('Save slots')}</h2>
          ${rows}
          <div class="confirm-sheet-actions">
            <button class="btn btn--soft btn--small" data-act="slots-cancel">${t('Cancel')}</button>
          </div>
        </div>
      </div>`
  }

  // ---- cloud sync (design §9; plan docs/superpowers/plans/2026-08-24-save-sync-slice-3.md) -----
  //
  // THE ENTRY POINT IS A ⚙ SETTINGS ROW, NOT A ROW IN THE SLOTS SHEET the design first chose (§9.1).
  // v6.7 moved the title's floating controls behind one ⚙ and gave that sheet a row component whose
  // right-aligned <i> is exactly the ambient status field §9.7 asked for — so the signal costs no new
  // glyph and no new tap target, and the slots sheet's height budget, which §9.1's arithmetic showed
  // had nothing left to give, is untouched.
  //
  // ui.js NEVER IMPORTS sync.js. main.js hands the module in as `sync`, the same seam every other
  // hook here uses: this file owns every pixel and none of the protocol.
  //
  // `syncView` is the FLOW step, not the link state — the link state is sync.status(). It lives out
  // here with syncDraft for the reason renameDraft does: renderTitle() rewrites innerHTML wholesale,
  // so a half-typed code and a half-finished pairing would both die on any unrelated re-render.
  let syncOpen = false
  let syncView = 'home' // 'home' | 'uploading' | 'ready' | 'enter' | 'pick'
  let syncDraft = ''
  let syncCloud = null  // the row a lookup returned, held for the destination picker
  let syncMsg = ''      // last failure tag; one line, cleared by the next action
  let syncCopied = false
  // When the conflict sheet first drew. §7.2's tap shield: it appears UNBIDDEN over the title while
  // a thumb may already be travelling toward Play, and two of its three buttons destroy a save.
  let conflictShownAt = 0
  const CONFLICT_SHIELD_MS = 400

  // §8: AN ADOPT IS ANNOUNCED, NEVER SILENT. The page reloads under the player and every number
  // on it changes; with no text that is indistinguishable from a crash or a corrupted save, and
  // is the most likely source of a "the game deleted my save" report.
  // READ ONCE HERE, not per render: it must survive exactly one reload, and renderTitle runs
  // many times before the player has finished reading anything.
  let syncNotice = ''
  try {
    syncNotice = sessionStorage.getItem('ca-sync-adopted') ?? ''
    if (syncNotice) sessionStorage.removeItem('ca-sync-adopted')
  } catch { /* private mode */ }

  function syncNoticeHtml() {
    if (!syncNotice) return ''
    const st = syncState()
    const text = syncNotice === 'linked'
      ? tt('Linked. Slot {n} now follows you between devices.', { n: st.slot ?? activeSlot() })
      : t('Loaded your latest save from the cloud.')
    return `<p class="sync-notice">${esc(text)}</p>`
  }

  // Cleared after ~3s and re-rendered once. A timer rather than a CSS animation because the
  // string has to leave the DOM: it is not interactive, but a stale "Linked." sitting under the
  // bookcase two minutes later is a claim about right now.
  let syncNoticeTimer = 0
  function armSyncNotice() {
    if (!syncNotice || syncNoticeTimer) return
    syncNoticeTimer = setTimeout(() => { syncNotice = ''; syncNoticeTimer = 0; if (active === 'title') renderTitle() }, 3000)
  }
  const conflictPending = () => !!syncState().conflict

  const syncOn = () => !!hooks.sync
  const syncState = () => (hooks.sync ? hooks.sync.status() : { on: false, available: false, reason: 'disabled' })

  // Every failure §8 enumerates, one sentence each. They are NOT collapsed into a single "sync
  // failed": "Offline" is a lie when the wifi is fine and the server is down, and a player who reads
  // it goes looking at their router instead of waiting.
  function syncMsgText(tag) {
    switch (tag) {
      case 'offline': return t('Offline — your progress is safe here.')
      case 'network': case 'timeout': return t('Not uploaded yet — waiting for a connection.')
      case 'serverError': return t('Sync is down right now. Nothing is lost.')
      case 'rateLimited': return t('Too many tries. Wait a minute and try again.')
      case 'badCode': return t('That code is not valid.')
      // Both causes, because §6.1 documents both and the earlier copy asserted only the mistype —
      // which was also wrong on its face, since Crockford base32 is letters AND digits.
      case 'notFound': return t('No save under that code yet. Check the code, and make sure the other device says Ready.')
      case 'refused-schema': return t('That cloud save was written by a newer version of the game.')
      case 'refused-shape': return t('That cloud save could not be read. Your save here is untouched.')
      case 'no-storage': return t('Unavailable in private browsing.')
      case 'no-save': return t('There is nothing saved in this slot yet.')
      // §9.3: unlinking here does NOT unlink there. The other device keeps the old code and
      // keeps pushing to a row this one no longer reads — 200s all the way, and the handoff
      // silently dead. Saying so is the only warning that state ever gets.
      case 'unlinked': return t('Your other devices are still using the old code. Unlink there too.')
      default: return ''
    }
  }

  // Relative when it is recent enough to mean something, absolute beyond a day. In the active
  // language, because a French player reading "2 days ago" inside a French sheet is a seam.
  function whenText(ms) {
    if (!ms) return t('unknown')
    const secs = Math.round((ms - Date.now()) / 1000) // negative = in the past
    const abs = Math.abs(secs)
    try {
      const rtf = new Intl.RelativeTimeFormat(getLang(), { numeric: 'auto' })
      if (abs < 60) return rtf.format(Math.min(0, secs), 'second')
      if (abs < 3600) return rtf.format(Math.min(0, Math.round(secs / 60)), 'minute')
      if (abs < 86400) return rtf.format(Math.min(0, Math.round(secs / 3600)), 'hour')
      // A DAY TIER, and it is not cosmetic. Without it a 26-hour-old save renders as an
      // absolute date beside a relative one — shot at 320px, the conflict prompt read
      // "8 minutes ago" against "8/23/2026", on the one screen whose whole job is comparing
      // those two values. numeric:'auto' also turns -1 into "yesterday", which is what the
      // design's own mock of this card shows.
      if (abs < 7 * 86400) return rtf.format(Math.min(0, Math.round(secs / 86400)), 'day')
      return new Date(ms).toLocaleDateString(getLang())
    } catch { return new Date(ms).toLocaleDateString() }
  }

  // §9.3 STATUS IS EVIDENCE, NOT INTENT. "Synced · 2 minutes ago" derived from the last successful
  // handshake reads reassuringly while every push has failed for an hour, and survives a broken
  // pairing entirely — unlink on the phone and re-pair it, and the laptop keeps pushing happily to
  // the orphaned row, 200s all the way, status green, handoff silently dead. Silence is the only
  // symptom of that, so silence is what this surfaces.
  const QUIET_MS = 3 * 24 * 3600 * 1000
  function syncRowValue() {
    const st = syncState()
    if (!st.available) return t('Off')
    if (!st.on) return t('Off')
    const quiet = Date.now() - (st.pulledAt || 0)
    if (quiet > QUIET_MS) return t('quiet')
    return tt('Slot {n}', { n: st.slot })
  }

  function syncStatusLine() {
    const st = syncState()
    if (!st.available) {
      return st.reason === 'no-storage' ? t('Unavailable in private browsing.') : t('Cloud sync is off in this build.')
    }
    if (!st.on) return t('Off — this save stays on this device')
    if (st.dirty) return t('Not uploaded yet — waiting for a connection.')
    const quiet = Date.now() - (st.pulledAt || 0)
    if (quiet > QUIET_MS) return tt('On — nothing new in {when}', { when: whenText(st.pulledAt) })
    return tt('On — Slot {n}, updated {when}', { n: st.slot, when: whenText(st.pulledAt) })
  }

  // The ⚙ row. Same component as 💾 Save slots and 🏆 Nickname above it.
  function syncRowHtml() {
    if (!syncOn()) return ''
    const st = syncState()
    // NOT PUBLIC YET. In a production build the entry point sits behind meta.dev — the same one
    // switch the card list uses, and deliberately not a second one: CLAUDE.md records that two
    // dev switches gave the game two different answers to "is this a dev run" and put a WIP
    // chapter's score on the public board (v7.161.0).
    //
    // The point of gating rather than shipping dark: the Worker is live, so seven taps on the
    // wordmark make the whole flow walkable ON A PHONE AGAINST THE DEPLOYED URL. Pairing two real
    // devices is the one part of slice 4 that localhost cannot do, and a feature nobody can reach
    // in production cannot be walked there at all.
    //
    // ONLY THE ENTRY POINT IS GATED, NEVER THE MECHANISM. Once a device is paired the record is on
    // disk and main.js's triggers fire regardless of meta.dev — so turning dev back off leaves a
    // paired device syncing, which is the intended behaviour and not an oversight.
    if (!import.meta.env.DEV && !meta.dev) return ''
    // A dev build with no SYNC_URL still renders the disabled preview (§8), because `npm run dev`
    // sets none and that is the layout the phone-on-the-LAN check is meant to judge.
    if (st.reason === 'disabled' && !import.meta.env.DEV) return ''
    return `<button class="btn btn--soft btn--small settings-slots" data-act="sync-open"
      ${st.available ? '' : 'disabled'}>☁️ ${t('Cloud sync')} <i>${esc(syncRowValue())}</i></button>`
  }

  function syncSheetHtml() {
    if (!syncOpen || !syncOn()) return ''
    const st = syncState()
    const msg = syncMsg ? `<p class="confirm-sheet-body sync-msg">${esc(syncMsgText(syncMsg))}</p>` : ''
    return `
      <div class="modal-backdrop" data-act="sync-close" data-pop="sync">
        <div class="confirm-sheet">
          <h2 class="confirm-sheet-title">☁️ ${t('Cloud sync')}</h2>
          ${syncBodyHtml(st)}
          ${msg}
          <div class="confirm-sheet-actions">
            <button class="btn btn--soft btn--small" data-act="sync-close">${t('Done')}</button>
          </div>
        </div>
      </div>`
  }

  function syncBodyHtml(st) {
    if (!st.available) return `<p class="confirm-sheet-body">${esc(syncStatusLine())}</p>`

    // FIRST RUN MUST EXPLAIN ITSELF, and it must offer BOTH branches. One unpaired device is
    // indistinguishable from another, so the client cannot know whether this is the first device or
    // the second — an earlier draft assumed it could, and the missing branch was a whole screen.
    // The slot number is interpolated into the button rather than left implicit: §5.3 goes to real
    // trouble to stop device B adopting into "whatever slot happens to be active", and a device A
    // that designates one silently undoes that.
    if (!st.on && syncView === 'home') {
      return `
        <p class="confirm-sheet-body">${t('Keep one save in step across your phone and computer. No account — you type a code once.')}</p>
        <div class="sync-actions">
          <button class="btn btn--small" data-act="sync-link">${tt('Sync Slot {n}', { n: activeSlot() })}</button>
          <button class="btn btn--soft btn--small" data-act="sync-enter">${t('I have a code')}</button>
        </div>`
    }

    if (syncView === 'uploading') return `<p class="confirm-sheet-body">${t('Uploading…')}</p>`

    // §5.1: the code appears ONLY after the upload is ACKed. Show it earlier and the player walks
    // to the laptop, types all sixteen characters correctly, and is told the code is wrong.
    if (syncView === 'ready') {
      return `
        <p class="confirm-sheet-body">${t('Ready — enter this code on your other device')}</p>
        <p class="sync-code">${esc(codeLinesHtml(st.code))}</p>
        <div class="sync-actions">
          <button class="btn btn--small" data-act="sync-copy">${syncCopied ? t('Copied') : t('Copy code')}</button>
        </div>
        <p class="confirm-sheet-body sync-fine">${t('Anyone with this code can read and change this save.')}</p>`
    }

    // LINKED, STEADY. The code is behind a tap rather than on the face of the sheet: it is a
    // bearer token with no revocation short of re-pairing (§10), and the everyday reason to open
    // this sheet is to check that sync is working, not to read the code out. Revealing it is also
    // §9.5's fifth cost paid — a player whose pairing was interrupted by a tab switch gets the
    // code back rather than restarting the flow, because it has been on disk since link().
    if (st.on) {
      return `
        <p class="confirm-sheet-body">${esc(syncStatusLine())}</p>
        <div class="sync-actions">
          <button class="btn btn--soft btn--small" data-act="sync-reveal">${t('Show code')}</button>
          <button class="btn btn--soft btn--small sync-danger" data-act="sync-unlink">${t('Unlink')}</button>
        </div>`
    }

    if (syncView === 'enter') {
      return `
        <p class="confirm-sheet-body">${t('Type the code shown on your other device.')}</p>
        <input class="text-field" id="sync-code" type="text" value="${esc(syncDraft)}"
          maxlength="19" inputmode="text" autocapitalize="characters" autocorrect="off"
          autocomplete="off" spellcheck="false" enterkeyhint="go" aria-label="${t('Pairing code')}">
        <div class="sync-actions">
          <button class="btn btn--small" data-act="sync-lookup" ${syncDraft.replace(/[\s-]/g, '').length === 16 ? '' : 'disabled'}>${t('Continue')}</button>
        </div>`
    }

    // §5.3 destination picker — slotRowHtml with a different heading and a different action, so the
    // rows a player already knows keep behaving the way they already do.
    if (syncView === 'pick') {
      const rows = Array.from({ length: SAVE_SLOTS }, (_, i) => i + 1)
        .map((n) => slotRowHtml(n, { act: 'sync-pick', rename: false })).join('')
      return `<p class="confirm-sheet-body">${t('Where should this save go?')}</p>${rows}`
    }
    return ''
  }

  // Display grouping lives here rather than in sync.js's groupCode because this is presentation.
  const groupCodeText = (code) => String(code ?? '').replace(/(.{4})(?=.)/g, '$1-')

  // TWO LINES OF TWO GROUPS, decided here rather than left to the browser. Shot at 320px the
  // single line wrapped as "A7K3-9WQM-2FTX-" / "B4NE", which breaks a group across a line ending
  // in a hyphen — on the one string in this game that gets transcribed by hand or read aloud
  // across a room, and where a dropped character costs the player the whole flow.
  function codeLinesHtml(code) {
    const g = groupCodeText(code).split('-')
    return g.length === 4 ? `${g[0]}-${g[1]}\n${g[2]}-${g[3]}` : groupCodeText(code)
  }

  // ---- the conflict prompt (§7.2) --------------------------------------------------------------
  // ONE COMPONENT, TWO ENTRY CONTEXTS. They differ only in heading — the rows, the data, the buttons
  // and the consequences are identical, which is the point: the choice a player makes about their
  // progress should look the same wherever it reaches them.
  //
  // TWO STACKED CARDS, NOT THREE COLUMNS. At 320px .confirm-sheet gives 235.6px of content; three
  // columns with a label column leave ~14 characters a side, and `The Undergrowth` is 15 before the
  // difficulty suffix. Each card owning its own button also removes the "which button belongs to
  // which column" ambiguity.
  function conflictSheetHtml() {
    const st = syncState()
    const c = st.conflict
    if (!c) { conflictShownAt = 0; return '' }
    if (!conflictShownAt) conflictShownAt = Date.now()
    const slot = c.context === 'pairing' ? c.slot : st.slot
    let local = null
    let cloud = null
    // §4.2 promises saveSummary is total, but this modal renders an UNTRUSTED blob from the network
    // and a half-drawn irreversible choice is the worst possible failure here. The fallback keeps
    // the local save and says so, rather than offering two buttons over a blank card.
    try {
      local = saveSummary(JSON.parse(exportSlot(slot) ?? 'null'))
      cloud = saveSummary(JSON.parse(c.blob ?? 'null'))
    } catch { local = null; cloud = null }
    const body = (local && cloud)
      ? `${conflictCardHtml(t('THIS DEVICE'), local, 'local')}${conflictCardHtml(t('THE CLOUD'), cloud, 'cloud')}
         <p class="confirm-sheet-body sync-fine">${t('The other one is deleted.')}</p>`
      : `<p class="confirm-sheet-body">${t('That cloud save could not be read. Your save here is untouched.')}</p>`
    return `
      <div class="modal-backdrop conflict-sheet" data-pop="conflict">
        <div class="confirm-sheet">
          <h2 class="confirm-sheet-title">${c.context === 'pairing'
            ? esc(tt('Slot {n} already has a save', { n: slot }))
            : t('Two versions of this save')}</h2>
          ${body}
          <div class="confirm-sheet-actions">
            <button class="btn btn--soft btn--small" data-act="sync-later">${t('Decide later')}</button>
          </div>
        </div>
      </div>`
  }

  function conflictCardHtml(label, s, which) {
    const ch = CHAPTERS[s.chapterId]
    // The hero card's own ★ field and the same fallback, so the card and this prompt can never state
    // two different numbers. "beat 3" is vocabulary this game has never used.
    const stars = Array.from({ length: MAX_DIFFICULTY }, (_, i) =>
      `<i class="vol-star${i < s.beaten ? ' vol-star--on' : ''}">★</i>`).join('')
    return `
      <div class="sync-card">
        <div class="sync-card-head"><b>${esc(label)}</b><small>${esc(whenText(s.savedAt))}</small></div>
        <div class="sync-card-line">${esc(ch ? t(ch.name) : s.chapterId)} <span class="sync-card-stars">${stars}</span></div>
        <!-- Coins and upgrades on ONE line so the trade reads as a trade: §7.1 proves coins get
             SPENT, so the more advanced save routinely shows the SMALLER number, and stacking them
             as peers invites the player to pick the save that is behind. The run count is the best
             "which is my main save" tiebreaker in the blob. -->
        <div class="sync-card-line sync-card-sub">${tt('{r} runs', { r: s.runs })} · ${tt('{u} upgrades', { u: s.upgrades })} · 🪙 ${s.coins}</div>
        <button class="btn btn--small" data-act="sync-keep" data-which="${which}">${t('Use this one')}</button>
      </div>`
  }

  // ---- shop ------------------------------------------------------------
  // Sacrifice modal (v4.9 rework): ui-local, not persisted — sacrificeOpen toggles a full-screen
  // modal (rendered as a backdrop node appended into screens.shop's own innerHTML, not a new
  // SCREEN_NAMES entry) over the shop grid; sacrificePicks tracks the running per-stat offer
  // counts for that session. sacrificeBounceId names the one row that just changed (for a
  // one-shot CSS pulse, the .card--bounce idiom below applied to a single stat row instead of
  // a whole card). All three reset on Cancel, backdrop tap, Confirm, or leaving the shop screen.
  let sacrificeOpen = false
  let sacrificePicks = {} // statId -> levels offered so far this sacrifice session
  let sacrificeBounceId = null
  let sacrificeTarget = null // which unlock the offer is FOR — see sacTargets/activeTarget below
  // WHICH ECONOMY THE SHOP IS SHOWING. The shop spends two currencies — coins buy upgrade levels,
  // and upgrade LEVELS buy the permanent unlocks — and until v7.x the second one was a single pill
  // in the footer naming only the CHEAPEST target. That hid every other target completely: when
  // Undertow still sold a 5-level unlock, its 3rd card slot at 20 was not on the screen at all, and
  // neither was the one line saying what the cheap one did (it existed, in the modal). Two labelled
  // halves instead, each naming its own currency, each listing everything it sells.
  let shopTab = 'upgrades' // 'upgrades' | 'sacrifices'
  // Reset-all-progress confirmation: a backdrop + a small confirm/cancel sheet. Still a modal (a
  // destructive yes/no genuinely wants to block), unlike the sacrifice list which is a view now.
  // Opened from the DEV screen (renderDev), not the shop — nothing else can reach it, so nothing
  // has to clear the flag: the backdrop covers Resume, and both its buttons close it.
  let resetOpen = false
  // The refund sheet (v7.x): same ui-local, not-persisted shape as resetOpen above.
  // refundAllAsk is the second tap on "refund everything" — the one control here that can empty a
  // whole book's shop in one hit.
  let refundOpen = false
  let refundAllAsk = false

  function sacrificeOffered() {
    return Object.values(sacrificePicks).reduce((sum, n) => sum + n, 0)
  }

  // What a sacrifice can BUY (v7.x): the book's OWN BOOK_UNLOCKS entries plus the universal next
  // level-up card slot. BOOK_UNLOCKS IS EMPTY TODAY (Scavenger, its only entry, was removed), so
  // this loop contributes nothing and every book's screen sells the card-slot ladder alone — keep
  // it anyway, it is the seam the next unlock arrives through.
  //
  // The emitted `id` is the BOOK_UNLOCKS key ITSELF, never a UI-invented label — a hand-rolled id
  // here is exactly the bug that made the old unlock unpurchasable: onSacrifice resolves a
  // non-'slot' target via BOOK_UNLOCKS[bookId], so a mismatched id resolves to a null cost and the
  // purchase can never succeed. The already-bought gate reads bm.unlocks?.[id] for the same reason.
  //
  // Cheapest first, which is also the order the toggles appear in the view.
  function sacTargets(bookId) {
    const bm = bookMeta(meta, bookId) ?? ensureBookMeta(meta, bookId)
    const out = []
    for (const [id, u] of Object.entries(BOOK_UNLOCKS[bookId] ?? {})) {
      // The NEXT rung's price, and null once the ladder is finished — which is also the
      // already-bought gate, so a maxed unlock drops out of the list without a second test.
      const cost = unlockCost(bookId, id, unlockLevel(bm, bookId, id))
      if (cost == null) continue
      // The unlock list shows the rung on its own line now (sacTargetRowsHtml), so `label` is the
      // bare name — a name reading "Something 2/3" was the only way to say which rung you were
      // buying back when the target lived in a 202px pill.
      // `family` rides along or the icon silently paints in shopIcon's fallback hue — the old
      // unlock was declared `res` and drew ATK red on the offer header, which is the taxonomy
      // contradicting itself on the one screen that shows an unlock alone. Declare it on the row.
      out.push({ id, cost, icon: u.icon, family: u.family, label: t(u.name), does: t(u.desc) })
    }
    const slots = bm.choiceSlots ?? 2
    const slotCost = sacrificeCost(slots)
    if (slotCost != null) {
      const nth = slots === 2 ? t('3rd') : t('4th')
      out.push({
        id: 'slot', cost: slotCost, icon: '🩸', family: 'vit', label: tt('{nth} upgrade slot', { nth }),
        does: t('One more choice at every level-up.'),
      })
    }
    return out.sort((a, b) => a.cost - b.cost) // cheapest first, as today
  }
  // The full sentence, for the offer view: what it does, then what it costs. Composed here rather
  // than stored in config so the effect line can be shown on its own wherever the price is already
  // on screen — see BOOK_UNLOCKS in config.js.
  // TWO SENTENCES, not a dash-joined clause: `does` already ends in a full stop (it has to — the
  // unlock list shows it alone), so " — " after it renders as "…level-up. — sacrifice 20 levels".
  const sacTargetSentence = (x) =>
    `${x.does} ${tt('Sacrifice {n} upgrade levels (no coin refund).', { n: x.cost })}`
  // The target currently being offered toward. Resolved rather than stored, so a target that stops
  // existing mid-session (bought in another tab, or the dev gate switched off under it) can never
  // leave the view pointing at a purchase that cannot happen.
  function activeTarget(bookId) {
    const list = sacTargets(bookId)
    return list.find((x) => x.id === sacrificeTarget) ?? list[0] ?? null
  }

  // v6.6 shop redesign: the sacrifice explainer used to be a permanent ~170px panel under the
  // grid — a paragraph of standing text for something a save does twice, which is most of why the
  // shop scrolled on a small phone. It is now one two-line pill (label + progress toward the
  // cost); the paragraph moved inside the modal the pill opens, so nothing is lost, and the
  // refund pill lives in .shop-foot, a fixed-height flex row, which is what lets .shop-rows own
  // every remaining pixel (see styles.css).
  // The foot is the refund pill alone. The sacrifice pill that used to share this row is gone: it
  // was one control standing in for a whole list (see shopTab above), and the list is on the screen
  // proper. The 🗑 erase-everything square is on the DEV screen (renderDev): a wipe is a developer
  // action, and it sat one mis-tap away from the upgrade grid every player uses.
  //   The refund control is LABELLED, because there is no glyph that reads as "sell it back" — and
  // the coin is the one emoji this file is allowed (the glyph IS the thing). It only opens the
  // sheet; nothing is spent from here.
  function shopFootHtml() {
    return `
      <div class="shop-foot">
        <button class="reset-link refund-link" data-act="refund-start">🪙 ${t('Refund')}</button>
      </div>`
  }

  // The two halves of the shop, each naming its own currency and how much of itself is done. The
  // counts are what make this more than navigation: "34 / 110 niveaux" and "1 sur 5" are the only
  // place either economy states its own size.
  function purseSwitchHtml(bookId) {
    const bm = bookMeta(meta, bookId) ?? ensureBookMeta(meta, bookId)
    const levels = Object.values(bm.shop).reduce((sum, l) => sum + l, 0)
    const buyable = Object.keys(shopLines(bookId)).reduce((sum, id) => sum + lineMax(id), 0)
    // RUNGS, not rows: a laddered unlock is ONE row on the list — sacTargets only ever offers its
    // next step — but as many purchases as it has rungs. So `done` must be summed from what has
    // been PAID, never derived as rungs minus rows: with a 3-rung unlock that reads 3 of 5 on a
    // save that has bought nothing, because its two other unbought rungs are not rows yet either.
    // Inert while BOOK_UNLOCKS is empty (unlockIds is []), and correct again the day it is not.
    const unlockIds = Object.keys(BOOK_UNLOCKS[bookId] ?? {})
    const rungs = SACRIFICE_COSTS.length + unlockIds.reduce((n, id) => n + unlockMax(bookId, id), 0)
    const done = Math.max(0, (bm.choiceSlots ?? 2) - 2)
      + unlockIds.reduce((n, id) => n + unlockLevel(bm, bookId, id), 0)
    const on = shopTab === 'sacrifices'
    return `
      <div class="purse-switch">
        <button class="purse-tab${on ? '' : ' purse-tab--on'}" data-act="shop-tab" data-tab="upgrades">
          <b>🪙 ${t('Upgrades')}</b><small>${tt('{n} / {m} levels', { n: levels, m: buyable })}</small>
        </button>
        <button class="purse-tab purse-tab--levels${on ? ' purse-tab--on' : ''}" data-act="shop-tab" data-tab="sacrifices">
          <b>🩸 ${t('Sacrifices')}</b><small>${tt('{n} of {m}', { n: done, m: rungs })}</small>
        </button>
      </div>`
  }

  // EVERY TARGET, ALWAYS, WITH WHAT IT DOES. The desc has existed in config since the ladder
  // shipped and is already translated; it was simply never rendered outside the offer view, and
  // then only for whichever target was selected. A row you cannot afford stays on the list and
  // carries a meter toward its price, because "what is there to work toward" is the question this
  // screen exists to answer.
  function sacTargetRowsHtml(bookId) {
    const bm = bookMeta(meta, bookId) ?? ensureBookMeta(meta, bookId)
    const levels = Object.values(bm.shop).reduce((sum, l) => sum + l, 0)
    const targets = sacTargets(bookId)
    if (!targets.length) return `<div class="sac-all-done">🩸 ${t('Everything in this book is unlocked.')}</div>`
    // THE ONLY PLACE THE GAME EXPLAINS ITS SECOND CURRENCY. Everything else on this half states a
    // price in "levels" and trusts the player to work out that those are levels they already bought
    // and will lose. It is also what this list stands in: a ladder offers one rung at a time, so
    // there are two or three rows on an 844px screen.
    const lead = `<p class="sac-lead">${t('Paid with upgrade levels you already own. They are spent, not refunded.')}</p>`
    return lead + targets.map((x) => {
      const afford = levels >= x.cost
      const pct = Math.min(100, Math.round((levels / x.cost) * 100))
      // `rung` only when the ladder has more than one — "palier 1 sur 1" is noise on a
      // single-purchase unlock, which is what both card slots are.
      const max = x.id === 'slot' ? 1 : unlockMax(bookId, x.id)
      const rung = max > 1 ? tt('step {n} of {m}', { n: unlockLevel(bm, bookId, x.id) + 1, m: max }) : ''
      return `
        <div class="sac-offer${afford ? '' : ' sac-offer--short'}">
          <button class="sac-offer-top" data-act="sacrifice-start" data-id="${x.id}" ${afford ? '' : 'disabled'}>
            <span class="sac-offer-ico">${shopIcon(x.id, x.icon, x.family)}</span>
            <span class="sac-offer-name">
              <b>${x.label}</b>
              ${rung ? `<small>${rung}</small>` : ''}
            </span>
            <span class="sac-offer-price">${afford ? tt('give up {n}', { n: x.cost }) : tt('{n} levels', { n: x.cost })}</span>
          </button>
          <p class="sac-offer-does">${x.does}</p>
          ${afford ? '' : `
            <div class="sac-offer-bank">
              <i><span style="width:${pct}%"></span></i>
              <b>${levels}/${x.cost}</b>
            </div>`}
        </div>`
    }).join('')
  }

  // v6.6.3: the sacrifice list is a VIEW, not a modal. It used to be a 523px sheet floating inside
  // a 568px phone, which meant paying for two sets of chrome (the sheet's own header and footer on
  // top of the screen's) and left less room for the eight rows than the screen itself has. It now
  // replaces the shop's contents in place, and the bottom nav is withheld while it is up — you are
  // in a committed Cancel/Confirm flow, so wandering off to Battle mid-offer should take an
  // explicit cancel. Same header/rows/footer skeleton as the upgrade list.
  function sacrificeViewHtml(target, bookId) {
    const bm = bookMeta(meta, bookId) ?? ensureBookMeta(meta, bookId)
    const lines = shopLines(bookId)
    const cost = target.cost
    const offered = sacrificeOffered()
    const ready = offered === cost
    const full = offered >= cost
    const counterColor = ready ? 'var(--mint-dark)' : lerpColor('#7a7a90', '#c23a52', offered / cost)

    // v6.6.3: the altar's chip strip is GONE. Its only job was taking a level back off the altar,
    // and every row now carries its own ↺ button — so the strip was a second control for something
    // you can do where you did it, costing ~40px on the one screen that must show eight rows.
    // What's on the altar is legible from the rows themselves: red notches on each row's rail.

    // v6.6.3: these are literally the shop's rows — same .shop-row/.shop-rail component, same icon
    // and effect, so the eight things you are choosing between look identical on both screens
    // (they were "Power Gel" here and "💥 +5% damage" one tap away). The rail does double duty
    // that the pips could not: mint = levels you keep, red = levels on the altar, plain = empty.
    // A cosmetic has no per-level bonus, so it has nothing to say on a screen whose rows are
    // literally "what one level of this gives you" — left in, an offered level reads "+0% -> +0%".
    const rows = Object.entries(lines).filter(([id, l]) => (bm.shop[id] ?? 0) > 0 && !l.cosmetic).map(([id, item]) => {
      const level = bm.shop[id]
      const picked = sacrificePicks[id] ?? 0
      const kept = level - picked
      const canOffer = picked < level && !full
      const notches = Array.from({ length: lineMax(id) }, (_, i) => {
        const cls = i < kept ? 'notch notch--on' : i < level ? 'notch notch--lost' : 'notch'
        return `<i class="${cls}"></i>`
      }).join('')
      // The middle slot answers whichever question is live: normally "what does one level give
      // me", and once you have offered some, "what am I about to lose" (total now → total after).
      // Swapping in place is what keeps this a one-line row instead of the old four-line block.
      const mid = picked > 0
        ? `<span class="sac-row-before">${formatShopBonus(bookId, id, level)}</span> → <span class="sac-row-after">${formatShopBonus(bookId, id, kept)}</span>`
        : t(item.desc)
      // A div, not a button: the row holds two real buttons now and buttons cannot nest. Offering
      // and taking back are both per-row, which is why the altar no longer needs its chip strip.
      return `
        <div class="card shop-row sac-row${id === sacrificeBounceId ? ' card--bounce' : ''}">
          <span class="shop-row-in">
            <span class="shop-row-icon">${shopIcon(id, item.icon, item.family)}</span>
            <span class="shop-row-effect">${mid}</span>
            <button class="sac-btn sac-btn--offer" data-act="sacrifice-offer" data-id="${id}" ${canOffer ? '' : 'disabled'}
                    aria-label="${t('Offer')} — ${t(item.name)}">🩸<b>+</b></button>
            <button class="sac-btn sac-btn--undo" data-act="sacrifice-unoffer" data-id="${id}" ${picked > 0 ? '' : 'disabled'}
                    aria-label="${t('Undo')} — ${t(item.name)}">↺</button>
          </span>
          <span class="shop-rail">${notches}</span>
        </div>`
    }).join('')

    // No target STRIP any more: you chose the target by tapping its row on the unlock list, which
    // is a screen that shows all of them with their descriptions rather than two abbreviated
    // buttons sharing 288px. The header names the one you picked instead.
    return `
      <header class="shop-head shop-head--sac">
        <span class="sacrifice-counter${ready ? ' sacrifice-counter--ready' : ''}" style="color:${counterColor}">🩸 ${tt('Offered {offered}/{cost}', { offered, cost })}</span>
      </header>
      <p class="sacrifice-for">${shopIcon(target.id, target.icon, target.family)} <b>${target.label}</b></p>
      <p class="sacrifice-desc">${sacTargetSentence(target)}</p>
      <div class="shop-rows shop-rows--sac">${rows}</div>
      <footer class="shop-foot shop-foot--sac">
        <button class="btn btn--soft btn--small" data-act="sacrifice-cancel">${t('Cancel')}</button>
        <button class="btn btn--danger btn--small" data-act="sacrifice-confirm" ${ready ? '' : 'disabled'}>${t('Confirm sacrifice')}</button>
      </footer>`
  }

  function resetModalHtml() {
    if (!resetOpen) return ''
    return `
      <div class="modal-backdrop reset-modal" data-act="reset-cancel" data-pop="reset">
        <div class="confirm-sheet">
          <h2 class="confirm-sheet-title">${t('Erase everything?')}</h2>
          <p class="confirm-sheet-body">${t('Coins, upgrades, slots and best scores will be permanently erased.')}</p>
          <div class="confirm-sheet-actions">
            <button class="btn btn--soft btn--small" data-act="reset-cancel">${t('Cancel')}</button>
            <button class="btn btn--danger btn--small" data-act="reset-confirm">${t('Erase everything')}</button>
          </div>
        </div>
      </div>`
  }

  // REFUNDING (v7.x). A SHEET, not a mode on the rows: a shop row is already a <button>, and a
  // second control inside a button is invalid markup that iOS renders unpredictably. Rows here are
  // the SAME .card.shop-row as the buy list on purpose — same row, other direction — with the
  // notch rail dropped (there is nothing to buy) and the price chip reading what it pays back.
  //   THE RATE IS STATED IN WORDS, ONCE, ABOVE THE ROWS, and each row still prints its own number:
  // a percentage alone makes the player do the arithmetic on a price ladder they never saw.
  function refundSheetHtml(bookId) {
    if (!refundOpen) return ''
    const bm = bookMeta(meta, bookId) ?? ensureBookMeta(meta, bookId)
    const lines = shopLines(bookId)
    const owned = Object.keys(lines).filter((id) => (bm.shop[id] ?? 0) > 0)
    const total = owned.reduce((sum, id) => sum + refundValue(id, bm.shop[id]), 0)
    const lead = `<p class="confirm-sheet-body">${tt('You get back {pct}% of what you paid.', { pct: Math.round(REFUND_RATE * 100) })}</p>`
    const allBtn = (act) => `<button class="btn btn--danger btn--small" data-act="${act}">${tt('Refund all : 🪙 {n}', { n: total })}</button>`
    const rows = owned.map((id) => {
      const item = lines[id]
      const level = bm.shop[id]
      const depth = tt('{n} / {m} levels', { n: level, m: lineMax(id) })
      return `
        <button class="card shop-row" data-act="refund-line" data-id="${id}"
                aria-label="${t(item.name)} — ${depth} · 🪙 ${refundValue(id, level)}">
          <span class="shop-row-in">
            <span class="shop-row-icon">${shopIcon(id, item.icon, item.family)}</span>
            <span class="shop-row-effect shop-row-stack"><b>${t(item.name)}</b><small>${depth}</small></span>
            <span class="shop-row-buy">+🪙 ${refundValue(id, level)}</span>
          </span>
        </button>`
    }).join('')
    // ONE ROW IS ITS OWN CONFIRMATION — it names the line and the payout on the tap target itself.
    // "Everything" is not: it is one tap that empties a book, so it asks.
    const body = refundAllAsk
      ? `
        <h2 class="confirm-sheet-title">${t('Refund everything?')}</h2>
        <p class="confirm-sheet-body">${t('Every level in this book goes back to zero.')}</p>
        ${lead}
        <div class="confirm-sheet-actions">
          <button class="btn btn--soft btn--small" data-act="refund-cancel">${t('Cancel')}</button>
          ${allBtn('refund-all-confirm')}
        </div>`
      : `
        <h2 class="confirm-sheet-title">${t('Refund')}</h2>
        ${lead}
        ${owned.length ? rows : `<p class="confirm-sheet-body">${t('Nothing to refund.')}</p>`}
        <div class="confirm-sheet-actions">
          <button class="btn btn--soft btn--small" data-act="refund-cancel">${t('Cancel')}</button>
          ${owned.length ? allBtn('refund-all') : ''}
        </div>`
    return `
      <div class="modal-backdrop" data-act="refund-cancel" data-pop="refund">
        <div class="confirm-sheet">${body}</div>
      </div>`
  }

  function renderShop(bounceId) {
    const bookId = shopBookId()
    const bm = bookMeta(meta, bookId) ?? ensureBookMeta(meta, bookId)
    const slots = bm.choiceSlots ?? 2
    const cost = sacrificeCost(slots)
    // v7.x: gated on a TARGET existing rather than on the slot cost alone — with all 4 slots
    // unlocked, sacrificeCost is null while a BOOK_UNLOCKS ladder could still be buyable.
    const target = activeTarget(bookId)
    // The sacrifice list takes over the shop screen rather than floating above it (see
    // sacrificeViewHtml). --sac drops the bottom-nav padding reservation, since the nav is not
    // rendered while a Cancel/Confirm flow is up.
    screens.shop.classList.toggle('screen--sac', sacrificeOpen && target != null)
    if (sacrificeOpen && target != null) {
      setHtml(screens.shop, sacrificeViewHtml(target, bookId))
      return
    }
    // The card carries NAME over EFFECT, with the price as a gold chip and the level meter riding
    // the bottom edge. The name is on the face because the icon cannot carry a row's identity on
    // its own: for two versions the row was the effect alone, which left eleven emoji to say which
    // upgrade you were looking at, and two of them were the same small starburst. Both halves are
    // stacked in ONE column so neither competes with the other for horizontal room — that is the
    // scarce axis at 320px, and every attempt that put a second thing ON the line lost a label.
    // v6.6.2 (owner picked this shape over the two-column cards): ONE COLUMN of rows (eight for
    // book 1, more for a book with its own lines — see shopLines). The meter is likewise not on
    // the line: discrete notches ride the row's bottom edge, one per level the LINE sells, and
    // reading down the column shows the whole build at once.
    // One count for every locked row on the screen (there is one today), read once rather than per
    // row: it walks the book's whole chapter list.
    const mastered = chaptersMastered(meta, bookId)
    const cards = Object.entries(shopLines(bookId)).map(([id, item]) => {
      // LOCKED ROWS KEEP THEIR PLACE AND LOSE THEIR WORDS. The name and the effect are the thing
      // being played for, so they are masked; the hint that replaces them states the count and the
      // target, because "locked" on its own tells the player nothing about how to open it.
      if (!shopLineUnlocked(meta, bookId, id)) {
        const hint = tt('chapters finished at max difficulty {n}/{max}', { n: mastered, max: item.needsMastery })
        const rail = Array.from({ length: lineMax(id) }, () => '<i class="notch"></i>').join('')
        return `
        <button class="card shop-row card--disabled" disabled aria-label="${hint}">
          <span class="shop-row-in">
            <span class="shop-row-icon">${shopIcon(id, item.icon, item.family)}</span>
            <span class="shop-row-effect shop-row-stack"><b>???</b><small>${hint}</small></span>
            <span class="shop-row-buy">🔒</span>
          </span>
          <span class="shop-rail">${rail}</span>
        </button>`
      }
      const level = bm.shop[id] ?? 0
      // Per LINE, not the global cap: Book 2's three bar lines sell 5 deeper levels, so the rail
      // must draw 5 notches and MAX must land on the 5th. A rail sized by the global would show a
      // line as half-bought forever, with a buy chip that stopped responding.
      const max = lineMax(id)
      const maxed = level >= max
      const buyCost = maxed ? 0 : shopCost(id, level)
      const afford = !maxed && bm.coins >= buyCost
      const notches = Array.from({ length: max },
        (_, i) => `<i class="notch${i < level ? ' notch--on' : ''}"></i>`).join('')
      const label = `${t(item.name)} — ${t(item.desc)} · ${level}/${max} · ${maxed ? 'MAX' : `🪙 ${buyCost}`}`
      return `
        <!-- maxed is NOT disabled-looking: a finished upgrade is an achievement, not a dead
             control. It gets the gold treatment instead of the grey one (onBuy already no-ops on
             a maxed id, so the tap is safe). Only unaffordable rows fade. -->
        <button class="card shop-row${afford || maxed ? '' : ' card--disabled'}${maxed ? ' shop-row--maxed' : ''}${id === bounceId ? ' card--bounce' : ''}"
                data-buy="${id}" aria-label="${label}">
          <!-- v6.0.2: layout lives on an inner span, NOT the button — iOS Safari doesn't reliably
               grow a flex <button> around its content. The button is a plain block. -->
          <span class="shop-row-in">
            <span class="shop-row-icon">${shopIcon(id, item.icon, item.family)}</span>
            <span class="shop-row-effect shop-row-stack"><b>${t(item.name)}</b><small>${t(item.desc)}</small></span>
            <span class="shop-row-buy">${maxed ? 'MAX' : tt('buy : 🪙 {n}', { n: buyCost })}</span>
          </span>
          <span class="shop-rail">${notches}</span>
        </button>`
    }).join('')
    // Nav (below) replaces the old "← Back" header. Every book the shelf shows gets a SPINE TAB
    // beside the balance, in that book's own cloth. There is one shop screen but one shop PER BOOK
    // — separate purse, separate levels, and Undertow has three lines book 1 does not — and until
    // v7.x the only sign of that was this book's name in grey text: the tab silently served
    // whichever book the title carousel last settled on, with nothing here to say so and no way to
    // switch without going back and tapping a spine. Reading titleBookshelf rather than BOOK_ORDER
    // is what keeps a tab from appearing for a book whose shelf is hidden (the wip gate).
    const books = titleBookshelf(meta).filter((s) => s.started)
    const tabs = books.map((s) => `
      <button class="book-tab${s.book === bookId ? ' book-tab--on' : ''}" data-book="${s.book}"
              style="--cloth:${s.cloth}"${s.book === bookId ? ' aria-current="true"' : ''}>${t(s.name)}</button>`).join('')
    // THE BALANCE SWAPS WITH THE TAB, and it is the one gesture that teaches the second economy:
    // the same pill, in the other currency, showing what THIS half of the shop spends. A gold
    // coin count standing over a list priced in levels is the shape that made the sacrifices read
    // as an oddity bolted onto the shop rather than as half of it.
    const onSac = shopTab === 'sacrifices'
    const levels = Object.values(bm.shop).reduce((sum, l) => sum + l, 0)
    const balance = onSac
      ? `<span class="shop-balance shop-balance--levels">🩸 <b>${levels}</b></span>`
      : `<span class="shop-balance">🪙 <b>${bm.coins}</b></span>`
    // grid-auto-rows: minmax(max-content, 1fr) grows 8-11 coin rows to fill a tall screen (v6.6).
    // An unlock list is 2-5 rows and 1fr would make each a fifth of the screen, so it opts out.
    setHtml(screens.shop, `
      <header class="shop-head">
        ${balance}
        <span class="shop-books">${tabs}</span>
        <button class="pill-btn shop-close" data-act="shop-close" aria-label="${t('Close')}">✕</button>
      </header>
      ${purseSwitchHtml(bookId)}
      <div class="shop-rows${onSac ? ' shop-rows--targets' : ''}">${onSac ? sacTargetRowsHtml(bookId) : cards}</div>
      ${shopFootHtml()}
      ${refundSheetHtml(bookId)}
    `)
  }

  // ---- hud (built once; updateHUD mutates in place) ---------------------
  // v5.8 kaiju redesign: the rampage bar markup below always exists (screens.hud.innerHTML is
  // built once here, before any chapter is chosen — see updateHUD's crushChapter gate), and its
  // grid-row:2/grid-column:1 placement (styles.css) is what pins it under the HP bar rather than
  // markup order — nesting it inside .hp-wrap instead would grow that box and break hp-text's
  // `inset:0` overlay, which is sized against .hp-wrap, not .hp-bar.
  screens.hud.innerHTML = `
    <div class="hud-top">
      <div class="hp-wrap">
        <div class="hp-bar"><div class="hp-fill"></div></div>
        <span class="hp-text"></span>
      </div>
      <div class="hud-timer">${fmtTime(RUN_DURATION)}</div>
      <div class="hud-right">
        <!-- data-act="dev-tap": opens the hidden dev menu, and does nothing whatsoever unless the
             title's DEV toggle is on (see the 'dev-tap' click case). The badge is otherwise inert,
             and styles.css has to give it pointer-events:auto — the whole HUD is pointer-events:none
             so it cannot eat gameplay touches. -->
        <span class="hud-coins" data-act="dev-tap">🪙 0</span>
        <button class="btn-pause" data-act="pause" aria-label="Pause">⏸</button>
      </div>
      <div class="rampage-wrap rampage-wrap--hidden">
        <div class="rampage-bar"><div class="rampage-fill"></div></div>
      </div>
      <!-- CHAOS PACT countdown (v7.12): a VERTICAL rail on the right edge.
           The horizontal bar this replaces was var(--gold) directly above the gold full-width xp
           bar and read as a second xp track, and its label had no CSS rule at all so it inherited
           the HUD's dark ink and vanished on every dark floor. A 90-degree turn is what makes the
           confusion structurally impossible rather than merely unlikely — the xp bar is horizontal
           by definition — and vacating this row lets the xp bar move up.
           Lives OUTSIDE .hud-top's grid (position:fixed, see styles.css), parked in the gap
           between the pause button above and the skill button below (right:22px bottom:34px,
           78px square) so it collides with neither. -->
      <div class="chaos-wrap" data-chaos style="display:none;">
        <span class="chaos-vrail">
          <b class="chaos-vrail-num" data-chaos-text></b>
          <span class="chaos-vrail-track"><i data-chaos-fill></i></span>
          <b class="chaos-vrail-bonus" data-chaos-bonus></b>
        </span>
      </div>
      <!-- v7.x Book 2: the chapter RESOURCE rail (CHAPTERS[].resource — The Shelf's Light). Reuses
           the chaos rail's markup and CSS wholesale, which is the owner's call: the game already
           has one vertical battery and a second one should read as the same kind of object rather
           than a new invention. It sits on the LEFT, opposite chaos, because that is the side the
           skill button is on by default — the bar is that button's ammo and nothing else, so
           putting them on the same thumb says so without a label. (meta.skillSide can move the
           button to the right; the rail stays put, since it is a readout, not a control, and it is
           parked well above the button either way.) -->
      <div class="chaos-wrap" data-charge style="display:none;">
        <span class="chaos-vrail chaos-vrail--charge">
          <!-- v7.x (owner, 2026-08-18): WHICH bar this is. Two vertical batteries ship on the same
               screen and the chapter's resource is a different noun in every chapter (Hydration,
               Pollution, Light, Air, Bloodlust, Feed) — a bare number and a colour cannot say which,
               and the number is the one thing a new player has no name for. Same chip as the count
               below it, so the two read as one object: name, value, bar.
               ABOVE the rail rather than under it: an x-lane parks this column at top:56% (see
               .charge--lanex), which puts its BOTTOM edge ~30px above the skill button — a word
               sitting there reads as that button's caption, and the rail is a readout, not a
               control. The ~24px the chip adds to the column is paid back in styles.css (the track
               drops 24vh -> 21vh) so every clearance the lane tune was measured against still
               holds: track bottom 700, button top 732, on a 390x844 phone. -->
          <b class="chaos-vrail-num chaos-vrail-label" data-charge-label></b>
          <b class="chaos-vrail-num" data-charge-text></b>
          <span class="chaos-vrail-track"><i data-charge-fill></i></span>
        </span>
      </div>
      <!-- v5.24: The Blank's boss HP bar; v6.0.0 it spans the full hud-top row (grid-column
           1/-1) and IS the phase readout — the timer slot goes blank while a boss is up. Reuses
           .rampage-bar/.rampage-fill classes for chrome (border/radius/background); ui.js doesn't
           own styles.css so positioning/size/color overrides live inline. -->
      <!-- Violet fill, NOT var(--gold): gold is the xp bar one row down (and rampage's active
           state) — a gold boss bar reads as a second xp/rampage strip. #8a5fe0 is the antibody's
           own FX accent (render.js), so the bar reads as "the boss's" at a glance. -->
      <div class="boss-bar-wrap" data-boss-bar style="display:none; grid-column:1 / -1; grid-row:2;">
        <div class="rampage-bar" style="height:14px;"><div class="rampage-fill" style="background:#8a5fe0;"></div></div>
      </div>
    </div>
    <div class="xp-row">
      <span class="lv-badge">${t('Lv')} 1</span>
      <div class="xp-bar"><div class="xp-fill"></div></div>
    </div>
    <div class="weapon-row"></div>
    <button class="skill-btn skill-btn--hidden" data-act="skill" aria-label="Pulse">
      <span class="skill-btn-glyph">☉</span>
      <span class="skill-btn-cd"></span>
    </button>
  `
  const hud = {
    hpFill: screens.hud.querySelector('.hp-fill'),
    hpText: screens.hud.querySelector('.hp-text'),
    timer: screens.hud.querySelector('.hud-timer'),
    coins: screens.hud.querySelector('.hud-coins'),
    lv: screens.hud.querySelector('.lv-badge'),
    xpFill: screens.hud.querySelector('.xp-fill'),
    weaponRow: screens.hud.querySelector('.weapon-row'),
    rampageWrap: screens.hud.querySelector('.rampage-wrap'),
    rampageBar: screens.hud.querySelector('.rampage-bar'),
    rampageFill: screens.hud.querySelector('.rampage-fill'),
    skillBtn: screens.hud.querySelector('.skill-btn'),
    skillCd: screens.hud.querySelector('.skill-btn-cd'),
    bossBarWrap: screens.hud.querySelector('[data-boss-bar]'),
    bossBarFill: screens.hud.querySelector('[data-boss-bar] .rampage-fill'),
    chaosWrap: screens.hud.querySelector('[data-chaos]'),
    chargeWrap: screens.hud.querySelector('[data-charge]'),
  }
  // The button's side is a PREFERENCE, not per-frame state, so it is applied once at boot and again
  // when the setting changes — deliberately NOT from updateHUD, which runs every frame and already
  // caches everything it touches (see `last` below).
  const applySkillSide = () => hud.skillBtn.classList.toggle('skill-btn--right', meta.skillSide === 'right')
  applySkillSide()
  const last = {
    hp: NaN, maxHP: NaN, remain: NaN, coins: NaN, level: NaN, xpPct: NaN, weaponsSig: '',
    // v5.8 kaiju redesign: undefined (not NaN/false) so the very first updateHUD call always
    // writes once, same trick as the rest of this cache — see the block below for why crushChapter
    // is gated separately from rampagePct/rampageActive.
    crushChapter: undefined, rampagePct: -1, rampageActive: undefined,
    laneChapter: undefined, repulseCd: -1,
    // v5.24: The Blank — scriptedChapter mirrors the crush/lane cache-gate pattern above (a
    // per-chapter constant, checked once per change rather than every frame); bossBarShown/Pct
    // gate the new boss HP bar the same way rampagePct/rampageActive gate the rampage meter.
    scriptedChapter: undefined, bossBarShown: undefined, bossBarPct: -1,
    // CHAOS PACT: the seconds tick once a second and the bonus only on a surviving a wave, so both
    // are cached and only the rail's height is repainted every frame — a per-frame textContent
    // write is the expensive half.
    chaosShown: undefined, chaosSecs: -1, chaosBonus: -1,
    chargeShown: undefined, chargeNum: -1, chargeArmed: undefined, chargeLaneX: undefined, chargeName: undefined,
  }

  function updateHUD(run, events) {
    const p = run.player
    if (p.hp !== last.hp || p.maxHP !== last.maxHP) {
      last.hp = p.hp
      last.maxHP = p.maxHP
      const ratio = Math.max(0, Math.min(1, p.hp / p.maxHP))
      hud.hpFill.style.width = `${ratio * 100}%`
      hud.hpFill.classList.toggle('hp-fill--low', ratio < 0.35)
      hud.hpText.textContent = `${Math.max(0, Math.ceil(p.hp))}/${p.maxHP}`
    }
    // v5.8 kaiju redesign: run.rampage/rampageT exist on every run (state.js createRun) but only
    // MEAN anything for chapters with CHAPTERS[chapter].crush (stepRampage no-ops elsewhere, so
    // rampage sits pinned at 0) — gate the bar's visibility on the chapter flag, not on rampage > 0,
    // so it doesn't flicker on for a chapter that merely hasn't crushed anything yet.
    const crushChapter = CHAPTERS[run.chapter].crush === true
    if (crushChapter !== last.crushChapter) {
      last.crushChapter = crushChapter
      hud.rampageWrap.classList.toggle('rampage-wrap--hidden', !crushChapter)
    }
    if (crushChapter) {
      const rampagePct = Math.round(run.rampage * 100)
      if (rampagePct !== last.rampagePct) {
        last.rampagePct = rampagePct
        hud.rampageFill.style.width = `${rampagePct}%`
      }
      const rampageActive = run.rampageT > 0
      if (rampageActive !== last.rampageActive) {
        last.rampageActive = rampageActive
        hud.rampageFill.classList.toggle('rampage-fill--active', rampageActive)
        hud.rampageBar.classList.toggle('rampage-bar--active', rampageActive)
      }
    }
    // v5.21: the Repulsion button, shown only for `lane` chapters. Gated on the chapter flag rather
    // than on repulseCd for the same reason the rampage bar above is — a cooldown that merely
    // happens to be 0 is not a signal that the chapter HAS the skill.
    // v7.x: the button belongs to any chapter with the cast, which is now lane chapters AND any
    // chapter declaring a resource (sim.js's stepRepulse gates on exactly this same pair — if the
    // two ever disagree you get a button with no cast, or a cast with no button).
    const laneChapter = CHAPTERS[run.chapter].lane === true || !!CHAPTERS[run.chapter].resource
    if (laneChapter !== last.laneChapter) {
      last.laneChapter = laneChapter
      hud.skillBtn.classList.toggle('skill-btn--hidden', !laneChapter)
    }
    if (laneChapter) {
      // Whole seconds only: this is a cache key as well as the label, so ticking it 60x a second
      // would defeat the whole point of the `last` comparison guarding every other write here.
      const cd = Math.ceil(run.repulseCd)
      if (cd !== last.repulseCd) {
        last.repulseCd = cd
        hud.skillBtn.classList.toggle('skill-btn--ready', cd <= 0)
        hud.skillCd.textContent = cd > 0 ? String(cd) : ''
      }
    }
    // v5.24: scripted chapters (The Blank) have no survival countdown — stepSpawning/the victory
    // timer are both off (see sim.js), so the HUD timer slot instead reads run.script's stage
    // machine: "WAVE n" (1-3, position within the current 3-wave block) on even stages; on odd
    // (boss) stages the slot goes BLANK — the full-width boss HP bar below is the whole readout
    // (v6.0.0, no more "PHASE k/3" text). scriptedChapter is cached like crushChapter/laneChapter
    // above — a per-chapter constant, not something that flips mid-run.
    const scriptedChapter = CHAPTERS[run.chapter].scripted === true
    if (scriptedChapter !== last.scriptedChapter) last.scriptedChapter = scriptedChapter
    // TIME DEBT marks the clock it is accelerating (v7.15). The card changes the RATE, never the
    // number, so at the instant you take it the timer reads exactly what it read before — measured,
    // 4:01 either way — and one real second later both still read 3:59. It works (run.time advances
    // x1.5 and every system downstream of it comes along), but nothing on screen said so and it
    // read as a dead card in play. COLOUR, not a glyph: a '⏳' inside the pill widens it enough to
    // wrap the coin badge onto a second line at 390px, which the harness shot caught.
    const debtOn = !!run.anomalies?.timeDebt
    if (debtOn !== last.debtOn) {
      last.debtOn = debtOn
      hud.timer.classList.toggle('hud-timer--debt', debtOn)
    }
    if (scriptedChapter) {
      const script = run.script
      const label = script.stage % 2 === 0 ? `${t('WAVE')} ${script.waveIdx + 1}` : ''
      if (label !== last.remain) {
        last.remain = label
        hud.timer.textContent = label
      }
    } else {
      const remain = Math.max(0, Math.ceil(RUN_DURATION - run.time))
      if (remain !== last.remain) {
        last.remain = remain
        hud.timer.textContent = fmtTime(remain)
      }
    }
    // Boss HP bar: gated on scriptedChapter too (not just run.bossBar) so leaving the chapter mid-
    // session — Play again into a different chapter reuses this same hud object — hides it again
    // rather than leaving the last boss's bar stuck on screen.
    const bossBarShown = scriptedChapter && !!run.bossBar
    if (bossBarShown !== last.bossBarShown) {
      last.bossBarShown = bossBarShown
      hud.bossBarWrap.style.display = bossBarShown ? '' : 'none'
    }
    if (bossBarShown) {
      const pct = Math.round(Math.max(0, Math.min(1, run.bossBar.hp / run.bossBar.max)) * 100)
      if (pct !== last.bossBarPct) {
        last.bossBarPct = pct
        hud.bossBarFill.style.width = `${pct}%`
      }
    }
    if (run.coinsEarned !== last.coins) {
      last.coins = run.coinsEarned
      hud.coins.textContent = `🪙 ${run.coinsEarned}`
    }
    if (p.level !== last.level) {
      last.level = p.level
      hud.lv.textContent = `${t('Lv')} ${p.level}`
    }
    const xpPct = Math.max(0, Math.min(100, Math.round((p.xp / p.xpNext) * 100)))
    if (xpPct !== last.xpPct) {
      last.xpPct = xpPct
      hud.xpFill.style.width = `${xpPct}%`
    }
    const elementEntries = Object.entries(run.elementPicks || {}).filter(([, n]) => n > 0)
    const mutatorIds = run.mutators || []
    const weaponsSig = run.weapons.map((w) => `${w.id}${w.level}`).join(',')
      + '|' + elementEntries.map(([id, n]) => `${id}${n}`).join(',')
      + '|' + mutatorIds.join(',')
    if (weaponsSig !== last.weaponsSig) {
      last.weaponsSig = weaponsSig
      const weaponChips = run.weapons.map((w) => `
        <span class="weapon-chip">
          <span class="weapon-chip-icon">${WEAPONS[w.id]?.icon ?? '❔'}</span>
          <span class="weapon-chip-lv">${w.level}</span>
        </span>`).join('')
      const elementChips = elementEntries.map(([id, n]) => `
        <span class="weapon-chip weapon-chip--element">
          <span class="weapon-chip-icon">${ELEMENTS[id]?.icon ?? '❔'}</span>
          <span class="weapon-chip-lv">${n}</span>
        </span>`).join('')
      // mutator chips are run-wide rules, not gameplay progress — icon-only, never change mid-run
      const mutatorChips = mutatorIds.map((id) => `
        <span class="weapon-chip weapon-chip--mutator" title="${t(MUTATORS[id]?.name ?? id)}">
          <span class="weapon-chip-icon">${MUTATORS[id]?.icon ?? '❔'}</span>
        </span>`).join('')
      hud.weaponRow.innerHTML = weaponChips + elementChips + mutatorChips
    }
    // v6.9 (owner: "remove the pest control alert"). The "📋 REPORTED — pest control dispatched"
    // HUD banner is gone; the {type:'dispatch'} event itself STAYS, because render.js's red strobe
    // at the spawn point and main.js's siren are the telegraph that an elite just arrived, and that
    // is worth keeping. `events` is still in the signature for the next consumer.
    // ---- CHAOS PACT countdown -------------------------------------------------------------
    // Shown for the whole run once the card is held: the complaint this answers is that the surge
    // was invisible, and a readout that came and went would be its own version of that problem.
    const chaosOn = !!run.anomalies?.chaosPact
    if (chaosOn !== last.chaosShown) {
      last.chaosShown = chaosOn
      hud.chaosWrap.style.display = chaosOn ? '' : 'none'
    }
    if (chaosOn) paintChaos(chaosStatus(run.time))

    // ---- chapter RESOURCE rail (v7.x Book 2) ---------------------------------------------
    // Shown only for a chapter that declares one, so every shipped chapter's HUD is untouched.
    const res = CHAPTERS[run.chapter].resource
    if (!!res !== last.chargeShown) {
      last.chargeShown = !!res
      hud.chargeWrap.style.display = res ? '' : 'none'
    }
    // An x-lane parks the player 20% from the LEFT rather than from the bottom, which is exactly
    // where this rail lives — see the charge--lanex rule in styles.css for the measured overlap.
    // Latched rather than set per frame: it can only change between runs.
    const laneX = CHAPTERS[run.chapter].laneAxis === 'x'
    if (laneX !== last.chargeLaneX) {
      last.chargeLaneX = laneX
      hud.chargeWrap.querySelector('.chaos-vrail--charge').classList.toggle('charge--lanex', laneX)
    }
    // run.chargeMax (v7.x Book 2 Task 9 fix round), not res.max: Deep Lungs raises the run's own
    // ceiling, and painting against the OLD config max pins this bar at full and motionless for
    // the whole band above it. Falls back to res.max for a run object that predates the field (or
    // any chapter with no resource, where it is moot — this call is already gated on `res`).
    if (res) paintCharge(run.charge, run.chargeMax ?? res.max, res.name, !!res.invert)
  }

  // The RESOURCE rail's per-frame paint, modelled on paintChaos below — refs looked up once (the
  // HUD markup is written exactly once at boot, so they cannot go stale) and every text write
  // guarded by a cache, because the textContent write is the expensive half of a per-frame readout.
  let chargeRefs = null
  function paintCharge(charge, max, name, invert) {
    if (!chargeRefs) {
      const q = (sel) => hud.chargeWrap.querySelector(sel)
      chargeRefs = { text: q('[data-charge-text]'), fill: q('[data-charge-fill]'), label: q('[data-charge-label]') }
    }
    const frac = max > 0 ? Math.max(0, Math.min(1, charge / max)) : 0
    // An INVERTED bar (CHAPTERS[].resource.invert — The Shelf's Pollution) fills as the run goes
    // wrong instead of emptying. The rail is the complement of the sim's value, height and number
    // both, so a full bar means the water is ruined rather than that you are stocked up.
    chargeRefs.fill.style.height = `${(invert ? 1 - frac : frac) * 100}%`
    // Two readouts from one bar, because the quantity alone does not answer the only question the
    // player actually asks: the NUMBER is how much light is left, and the ARMED state is whether
    // the next press is a full-strength Pulse or the floor shove. A player reading only the height
    // cannot tell where the threshold is, and PULSE_CHARGE_COST is not a round fraction of max.
    const armed = charge >= PULSE_CHARGE_COST
    if (armed !== last.chargeArmed) {
      last.chargeArmed = armed
      hud.chargeWrap.classList.toggle('charge--armed', armed)
    }
    const n = Math.round(invert ? Math.max(0, max - charge) : charge)
    if (n !== last.chargeNum) { last.chargeNum = n; chargeRefs.text.textContent = `${n}` }
    // Latched, because re-translating a word that can only change between runs is a t() call and a
    // textContent write every frame. The LANG is in the key, not just the name: the HUD markup is
    // written once at boot and `last` outlives a title-screen language switch, so latching on the
    // English source alone would leave the previous language's word on the rail for the rest of the
    // session — the same run reading `Lumière` under an English HUD.
    const key = name + '|' + getLang()
    if (key !== last.chargeName) { last.chargeName = key; chargeRefs.label.textContent = t(name) }
  }

  // The CHAOS PACT rail's per-frame paint. Refs are looked up once — the HUD markup is written
  // exactly once at boot (screens.hud.innerHTML above), so they can never go stale.
  let chaosRefs = null
  function paintChaos(c) {
    if (!chaosRefs) {
      const q = (sel) => hud.chaosWrap.querySelector(sel)
      chaosRefs = { text: q('[data-chaos-text]'), bonus: q('[data-chaos-bonus]'), fill: q('[data-chaos-fill]') }
    }
    const R = chaosRefs
    // CHARGE, then DISCHARGE. frac runs 1 -> 0 within each phase, so:
    //   waiting — height is 1 - frac, i.e. the rail FILLS as the wave approaches. Full = it lands.
    //   live    — height is frac, i.e. the rail DRAINS across the 10s the wave lasts. Empty = over.
    // Two directions on purpose (owner's call): the rail is a battery, and "filling" and "emptying"
    // say which of the two states you are in without reading the colour at all.
    const fill = c.active ? c.frac : 1 - c.frac
    R.fill.style.height = `${Math.max(0, Math.min(1, fill)) * 100}%`
    // No sentence: the rail has no room for one, so the seconds ARE the label and the state comes
    // from colour (violet incoming, red live — see .chaos--on). Both chips are opaque, which is the
    // half of this the old readout got wrong: its label had no CSS rule at all, inherited the HUD's
    // dark ink, and was invisible on every dark chapter floor.
    const secs = Math.ceil(c.left)
    hud.chaosWrap.classList.toggle('chaos--on', c.active)
    if (secs !== last.chaosSecs) { last.chaosSecs = secs; R.text.textContent = `${secs}s` }
    const bonus = Math.round(c.bonus * 100)
    if (bonus !== last.chaosBonus) { last.chaosBonus = bonus; R.bonus.textContent = `+${bonus}%` }
  }

  // ---- level-up modal ----------------------------------------------------
  let lvCards = []
  let lvFocus = 0
  // Every path that SPENDS the level-up (card pick, reroll) checks this; arrow/digit focus nav
  // stays live throughout, so the modal never feels frozen.
  let lvArmAt = 0
  const lvArmed = () => performance.now() >= lvArmAt
  // v7.5 BLIND FAITH state. `lvData` is kept so the reveal can repaint the same screen without a
  // round-trip to main.js; `lvRevealing` locks every input path for the length of the reveal, and
  // the timer id exists so leaving the screen mid-reveal cannot fire onChoose into a dead modal.
  let lvData = {}
  let lvBlind = false
  let lvRevealing = false
  let lvRevealTimer = 0
  let lvRevealAt = 0      // when the reveal becomes dismissible
  let lvRevealIdx = -1    // the card taken, held until the reveal resolves
  // v7.5 SPECIALIST: while the weapon chooser is open, `lvChoosing` holds the card index whose pick
  // is waiting on a subject. The level-up is NOT spent until a weapon is named.
  let lvChoosing = -1

  // Level-up card descs/tags arrive COMPOSED from sim.js ('+6% damage', '+1 potency — …',
  // 'Lv 2', 'Star Shooter upgrade') — translate the parts, never the composite: the numeric
  // prefix stays, the tail is a plain dictionary string (config desc), word order via tt.
  function tCardDesc(s) {
    const m = /^(\+[\d.]+%? )(.*)$/.exec(s)
    if (!m) return t(s)
    const potency = /^potency — (.*)$/.exec(m[2])
    if (potency) return `${m[1]}${t('potency')} — ${t(potency[1])}`
    return m[1] + t(m[2])
  }
  function tCardTag(s) {
    if (/^Lv \d+$/.test(s)) return s.replace('Lv', t('Lv'))
    const up = /^(.*) upgrade$/.exec(s)
    if (up) return tt('{name} upgrade', { name: t(up[1]) })
    return t(s)
  }

  // v7.5 BLIND FAITH. The screen is painted TWICE under this card: face down while the player
  // chooses, then face up for BLIND_REVEAL_MS so they see what they passed on — which is the whole
  // emotion the card was asked for ("the ones you don't chose are revealed somehow to make you
  // frustrated"). The data is kept so the second paint needs no round-trip to main.js.
  function renderLevelup(data = {}) {
    lvData = data
    lvBlind = !!data.blind
    lvRevealing = false
    lvRevealIdx = -1
    lvChoosing = -1
    if (lvRevealTimer) { clearTimeout(lvRevealTimer); lvRevealTimer = 0 }
    paintLevelup()
  }

  // The INSIDE of one level-up card. Extracted because the BLIND FAITH reveal swaps a card's
  // contents in place (see revealLvRow) rather than re-rendering the row — two copies of this
  // markup would drift, and the drift would only ever show on the reveal.
  function cardFaceHtml(c, hidden) {
    if (!c) return ''
    const rarity = c.rarity ?? 'normal'
    // A card whose rarity is not a RARITIES key shows NO chip — that is how a weapon UPGRADE card
    // carries no tier (UPGRADE_RARITY in config.js). Do not fall back to 'Normal' here: printing a
    // tier the roll never granted is exactly the promise the chip must not make.
    const tier = RARITIES[rarity]
    const chip = tier ? `<i class="rarity-chip">${t(tier.name)}</i>` : ''
    if (hidden) {
      return `${chip}
        <span class="lv-card-icon">❓</span>
        <span class="lv-card-body">
          <span class="lv-card-title">${t('Face down')}</span>
          <span class="lv-card-desc">${t('Take it on faith.')}</span>
        </span>`
    }
    return `${chip}
        <span class="lv-card-icon">${c.icon ?? CHOICE_ICONS[c.kind] ?? '✨'}</span>
        <span class="lv-card-body">
          <span class="lv-card-title">${t(c.title)}
            ${c.tag ? `<i class="tag ${c.tag === 'New!' ? 'tag--new' : 'tag--lv'}">${tCardTag(c.tag)}</i>` : ''}
          </span>
          <span class="lv-card-desc">${c.subject && WEAPONS[c.subject]
            ? tt('{name} — {text}', { name: t(WEAPONS[c.subject].name), text: tCardDesc(c.desc) })
            : cardDescHtml(c)}</span>
          ${c.from ? `<span class="lv-card-from">${t(c.from)}</span>` : ''}
        </span>`
  }

  // The face-down (or ordinary) deal. The face-UP state is not painted here — revealLvRow mutates
  // the row in place, for the animation reasons documented there.
  function paintLevelup() {
    // v7.2: `rerollCurrency` is 'coins' normally and 'hp' under the BLOOD MONEY anomaly, which
    // replaces the reroll's wallet. The button prints whichever it will actually take — a footer
    // reading 🪙 while sim.js charges HP is a hidden rule the player cannot trade against.
    const { choices = [], rerollCost: rerollN = 0, rerollCurrency = 'coins', coins = 0, hp = 0, canReroll = true } = lvData
    const onHP = rerollCurrency === 'hp'
    const facedown = lvBlind
    const cards = choices.map((c, i) => {
      const rarity = c.rarity ?? 'normal'
      // An ANOMALY is never dealt face down, however blind the screen. The spec's own limit on the
      // rarest tier is "the player reads the card before taking it… what stays forbidden is
      // catastrophe the player could neither foresee nor act on", and MAX_ANOMALIES_PER_RUN allows
      // a second card alongside BLIND FAITH — which would mean blind-drawing BRITTLE (maxHP -> 1).
      // Its teal breathing border already identified it with 100% reliability anyway, so hiding the
      // text bought no blindness and cost the one thing the tier promises.
      const hidden = facedown && c.kind !== 'anomaly'
      return `
      <button class="card lv-card${hidden ? ' lv-card--blind' : ''}" data-choose="${i}" data-rarity="${rarity}" style="animation-delay:${i * 90}ms">${cardFaceHtml(c, hidden)}</button>`
    }).join('')
    // On HP the gate is STRICT: paying your last 10 HP would kill you on a modal screen, which is
    // not a trade the player agreed to when they took the card (sim.js rerollLevelUpChoices floors
    // it the same way — this only stops the button lying about being available).
    // v7.5: BLIND FAITH removes the purchase entirely (it is the card's whole price), so the button
    // prints the reason rather than greying out an affordable-looking price the sim will refuse.
    const rerollDisabled = !canReroll || (onHP ? hp <= rerollN : coins < rerollN)
    const rerollLabel = !canReroll
      ? t('No rerolls')
      : onHP ? tt('Reroll ({n}❤️)', { n: rerollN }) : tt('Reroll ({n}🪙)', { n: rerollN })
    setHtml(screens.levelup, `
      <div class="modal" data-pop="levelup">
        <h2 class="modal-title">${t('LEVEL UP!')}</h2>
        <div class="lv-cards">${cards}</div>
        <p class="lv-hint">${tt('1-{n} · arrows · enter · R reroll', { n: choices.length })}</p>
        <div class="lv-footer">
          <button class="btn btn--soft btn--small lv-reroll" data-act="reroll" ${rerollDisabled ? 'disabled' : ''}>🔄 ${rerollLabel}</button>
          <span class="lv-coins">${onHP ? `❤️ ${hp}` : `🪙 ${coins}`}</span>
        </div>
      </div>
    `)
    lvCards = Array.from(screens.levelup.querySelectorAll('.lv-card'))
    lvArmAt = performance.now() + LEVELUP_GRACE_MS
    setLvFocus(0)
  }

  // ---- level-up keyboard nav (only wired while the level-up screen shows) ----
  function setLvFocus(i) {
    if (lvCards.length === 0) return
    lvFocus = ((i % lvCards.length) + lvCards.length) % lvCards.length
    lvCards.forEach((el, idx) => el.classList.toggle('card--focused', idx === lvFocus))
  }

  function chooseLvCard(i) {
    // During a reveal ANY press ends it rather than being eaten — the cards are disabled, so this
    // is reached from the keyboard and from a tap on the modal.
    if (lvRevealing) { if (performance.now() >= lvRevealAt) finishLvReveal(); return }
    if (i < 0 || i >= lvCards.length) return
    if (!lvArmed()) return
    // BLIND FAITH: flip the whole row face up, mark what was taken and what was passed, and hold it
    // there before spending the level-up. The pick is already made — this is the card's payoff, so
    // it must not be skippable, which is why every input path checks lvRevealing above.
    if (lvBlind) {
      revealLvRow(i)
      return
    }
    takeLvCard(i)
  }

  // Flip the row face up IN PLACE. paintLevelup would rewrite the container's innerHTML, which
  // replaces every <button> — so `.lv-card--passed`'s opacity/transform transition has no start
  // state and never runs, and `pop-in`'s `backwards` fill plus the inline per-card animation-delay
  // makes the second card invisible for 90ms and then pop. The row visibly RE-DEALS itself instead
  // of flipping, and for the first 300ms the replayed animation outranks the dim in the cascade.
  // Swapping only each button's contents keeps the elements, so both animations behave.
  function revealLvRow(taken) {
    lvRevealing = true
    lvRevealAt = performance.now() + BLIND_REVEAL_ARM_MS
    lvRevealIdx = taken
    const choices = lvData.choices ?? []
    lvCards.forEach((el, i) => {
      el.innerHTML = cardFaceHtml(choices[i], false)
      // ...AND DROP THE FACE-DOWN CLASS. The contents flip face up, but `.lv-card--blind` lives on
      // the BUTTON, and swapping innerHTML cannot reach it — so every revealed card kept
      // `grayscale(1)` on its icon and `--ink-soft` on its text. The card you took stayed grey at
      // the exact moment it is supposed to be the one thing in colour, which is the whole payoff of
      // the reveal. Reported from play; shipped greyed since v7.5.
      el.classList.remove('lv-card--blind')
      el.disabled = true                       // no silent swallowing: the row is visibly inert
      el.classList.remove('card--focused')
    })
    const reroll = screens.levelup.querySelector('.lv-reroll')
    if (reroll) reroll.disabled = true
    // Next frame, so the browser has painted the face-up state before the dim/sink transition
    // starts from it. Same frame and there is no start value to interpolate away from.
    requestAnimationFrame(() => {
      lvCards.forEach((el, i) => el.classList.add(i === taken ? 'lv-card--taken' : 'lv-card--passed'))
    })
    lvRevealTimer = setTimeout(finishLvReveal, BLIND_REVEAL_MS)
  }

  // The reveal ends on its own, or on any input once armed — see BLIND_REVEAL_ARM_MS.
  function finishLvReveal() {
    if (!lvRevealing) return
    if (lvRevealTimer) { clearTimeout(lvRevealTimer); lvRevealTimer = 0 }
    lvRevealing = false
    const i = lvRevealIdx
    lvRevealIdx = -1
    takeLvCard(i)
  }

  // Spend the pick — unless the card wants a SUBJECT first, in which case the chooser opens and the
  // level-up stays unspent until a weapon is named. Placed after the BLIND FAITH reveal on purpose:
  // under that card the row is face down, so choosing the weapon before the flip would mean naming
  // a permanent weapon-specific rule for a card you had not been shown yet.
  function takeLvCard(i) {
    const card = (lvData.choices ?? [])[i]
    if (card?.subjects?.length > 1) {
      lvChoosing = i
      paintSubjectChooser(card)
      return
    }
    hooks.onChoose(i, card?.subjects?.[0] ?? null)
  }

  // One button per weapon the card may be pointed at. Reuses the level-up card grammar (and its
  // keyboard nav) rather than inventing a second modal language.
  function paintSubjectChooser(card) {
    const rows = card.subjects.map((id, n) => `
      <button class="card lv-card" data-subject="${id}" data-rarity="anomaly" style="animation-delay:${n * 90}ms">
        <span class="lv-card-icon">${WEAPONS[id]?.icon ?? '✨'}</span>
        <span class="lv-card-body">
          <span class="lv-card-title">${t(WEAPONS[id]?.name ?? id)}</span>
          <span class="lv-card-desc">${tt('{n} upgrades taken', { n: card.subjectPicks?.[id] ?? 0 })}</span>
        </span>
      </button>`).join('')
    // Same data-pop key as the card row above: this is the SAME box changing its contents (you
    // picked an anomaly, now you pick its weapon), not a second modal opening over the first.
    setHtml(screens.levelup, `
      <div class="modal" data-pop="levelup">
        <h2 class="modal-title">${t(card.title)}</h2>
        <p class="lv-ask">${t('Which weapon?')}</p>
        <div class="lv-cards">${rows}</div>
      </div>
    `)
    lvCards = Array.from(screens.levelup.querySelectorAll('.lv-card'))
    lvArmAt = performance.now() + LEVELUP_GRACE_MS
    setLvFocus(0)
  }

  // Keyboard picks arrive as an INDEX into the chooser's rows; taps arrive as a weapon id. One
  // translation here keeps both on the single gated path below.
  function pickSubjectAt(n) {
    const subs = (lvData.choices ?? [])[lvChoosing]?.subjects ?? []
    if (n >= 0 && n < subs.length) chooseLvSubject(subs[n])
  }

  function chooseLvSubject(id) {
    if (lvChoosing < 0 || !lvArmed()) return
    const i = lvChoosing
    lvChoosing = -1
    hooks.onChoose(i, id)
  }

  function onLevelupKeydown(e) {
    if (e.repeat) return
    const digit = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[e.code]
    if (digit !== undefined) {
      e.preventDefault()
      e.stopPropagation()
      // v7.5: while SPECIALIST's chooser is open the same keys pick a WEAPON, not a card. Routing
      // them back to chooseLvCard would re-enter a pick that has already been made — and with the
      // level-up unspent, that is a second card taken for one level.
      if (lvChoosing >= 0) pickSubjectAt(digit)
      else chooseLvCard(digit)
      return
    }
    switch (e.code) {
      case 'ArrowUp': case 'KeyW': case 'ArrowLeft': case 'KeyA':
        e.preventDefault(); e.stopPropagation()
        setLvFocus(lvFocus - 1)
        break
      case 'ArrowDown': case 'KeyS': case 'ArrowRight': case 'KeyD':
        e.preventDefault(); e.stopPropagation()
        setLvFocus(lvFocus + 1)
        break
      case 'Enter': case 'Space':
        e.preventDefault(); e.stopPropagation()
        if (lvChoosing >= 0) pickSubjectAt(lvFocus)
        else chooseLvCard(lvFocus)
        break
      case 'KeyR':
        e.preventDefault(); e.stopPropagation()
        // No reroll once a card has been taken and only its subject is outstanding: the pick is
        // already spent from the player's point of view, and rerolling would deal a fresh screen
        // while `lvChoosing` still points at an index on the old one.
        if (lvArmed() && !lvRevealing && lvChoosing < 0) hooks.onReroll()
        break
    }
  }

  // ---- anomaly effect chips (shared by the pre-run brief and the pause/summary recaps) ----
  // The labels moved to config.js (MUTATOR_EFFECT_LABELS) so run XX's config-table walk demands
  // French for them — as a bare const here they were exempt from it, and two shipped in English.

  // One chip per effect key, tagged with whether it helps the player — the brief screen needs the
  // split (costs on one side of the trade, gains on the other), everything else just joins it.
  function effectChipList(effects) {
    return Object.entries(effects).map(([key, v]) => {
      const [label, goodUp] = MUTATOR_EFFECT_LABELS[key] ?? [key, true]
      const pct = Math.round((v - 1) * 100)
      const good = (pct > 0) === goodUp
      return { good, html: `<span class="fx-chip ${good ? 'fx-chip--good' : 'fx-chip--bad'}">${pct > 0 ? '+' : ''}${pct}% ${t(label)}</span>` }
    })
  }

  function effectChips(effects) {
    return effectChipList(effects).map((c) => c.html).join('')
  }

  // ---- classic pre-run summary (v6.0.2 briefing, widened v6.7) ---------------
  // Shown between the title's Play and actual gameplay for EVERY classic run — it explains the
  // rolled anomalies (a new player otherwise meets "Riptide" as an unexplained icon chip in the
  // HUD) and, since v6.7, owns the booster slots that used to crowd the title screen. That is why
  // it now shows even when the roll produced nothing: at difficulty 1 there are no anomalies but
  // there are still boosters to pick, so the page has to exist. The run does NOT exist yet: main.js
  // stages the rolled ids and only creates/starts the run from this screen's Start button
  // (backing out via the bottom nav costs nothing — boosters aren't spent either).
  // lastBriefData mirrors the data showScreen was called with, so a booster tap can re-render this
  // screen in place (the sheet lives here now, and re-rendering needs the same chapter/anomalies).
  let lastBriefData = null

  // One anomaly, as the trade it actually is: what it costs you on the left, what it pays back on
  // the right. Every MUTATORS entry mixes costs and gains (see the table), so the split is a fact
  // about the data, not decoration — and it is the judgement the reroll button is asking for.
  // The Blank's ladder modifiers carry no effects at all; they fall back to their sentence, which
  // is the only thing that explains them.
  // The reroll price lives once, in the ANOMALIES rule — repeating it on every row said the same
  // number three times on one screen.
  const ICO_REROLL = '<svg class="rr-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 9.6A7.6 7.6 0 0 0 5.6 8.5"/><path d="M5 14.4A7.6 7.6 0 0 0 18.4 15.5"/><path d="M19.6 4.6 19 9.9l-5.2-.7"/><path d="m4.4 19.4.6-5.3 5.2.7"/></svg>'
  // Three blocks, tallest in the middle: the podium silhouette itself, which reads as "ranking" at
  // 19px where a trophy does not — a trophy is a prize, and this button opens a list. Same hairline
  // stroke language as ICO_REROLL above so the two read as one set, and drawn rather than 🏆 for
  // the reason the shop icons are: an emoji cannot inherit the button's colour, and its glyph is a
  // different picture on every platform.
  //
  // Two things the first cut got wrong, both only visible at the size it is actually used. The
  // blocks ran short-tall-medium, i.e. 3rd-1st-2nd — a real podium is 2nd-1st-3rd and the wrong
  // order is exactly the tell of a glyph assembled rather than drawn. And a small cross floated
  // above the middle block as a "star": two ~2px strokes crossing, in round caps, with nothing
  // connecting them to the shape below — at 19px that is a smudge, not a star. The blocks alone
  // ARE the podium, so it is gone rather than redrawn.
  const ICO_PODIUM = '<svg class="rr-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.4 8.6h5.2v11.5H9.4z"/><path d="M3.4 12.4h6v7.7h-6z"/><path d="M14.6 15.2h6v4.9h-6z"/></svg>'
  function briefAnomHtml(id, i, reroll) {
    const m = MUTATORS[id]
    const chips = effectChipList(m?.effects ?? {})
    const cost = chips.filter((c) => !c.good).map((c) => c.html).join('')
    const gain = chips.filter((c) => c.good).map((c) => c.html).join('')
    const label = esc(tt('Reroll this anomaly ({n}🪙)', { n: ANOMALY_REROLL_COST }))
    return `
      <div class="brief-anom">
        <span class="brief-anom-icon">${m?.icon ?? '❔'}</span>
        <span class="brief-anom-body">
          <span class="brief-anom-name">${t(m?.name ?? id)}</span>
          ${chips.length
            ? `<span class="brief-trade"><span class="brief-tg">${cost}</span><span class="brief-tg"><i class="brief-vs">⇄</i>${gain}</span></span>`
            : `<span class="brief-anom-desc">${t(m?.desc ?? '')}</span>`}
        </span>
        ${reroll ? `<button class="brief-rr" data-act="brief-reroll" data-i="${i}" ${reroll.afford ? '' : 'disabled'} aria-label="${label}" title="${label}">${ICO_REROLL}</button>` : ''}
      </div>`
  }

  function renderBrief(d) {
    lastBriefData = d
    const chapter = CHAPTERS[d.chapterId] ?? CHAPTERS.body
    // The purse this screen spends from is the CHAPTER ABOUT TO BE PLAYED's own book — not
    // shopBookId() (the title carousel's browse state). Resolving it the same way main.js's
    // startClassic/onBriefReroll do (bookOf(chapter) ?? BOOK_ORDER[0]) is what keeps the balance
    // shown here, the reroll affordability, and the coins actually spent from ever disagreeing.
    const briefBookId = bookOf(d.chapterId) ?? BOOK_ORDER[0]
    const briefBm = bookMeta(meta, briefBookId) ?? ensureBookMeta(meta, briefBookId)
    const ids = d.mutators ?? []
    const reroll = d.reroll && ids.length ? { afford: briefBm.coins >= ANOMALY_REROLL_COST } : null
    const eyebrow = (txt, note) => `<div class="brief-eyebrow">${t(txt)}${note ? `<i>${note}</i>` : ''}</div>`
    setHtml(screens.brief, `
      <div class="modal brief-panel brief" data-pop="brief">
        <div class="brief-head">
          <!-- Backing out of the brief used to be a tap on the bottom nav's Battle tab. With the
               nav gone this button is the ONLY way back, and nothing is spent yet either way. -->
          <button class="pill-btn" data-act="brief-back" aria-label="${t('Back')}">←</button>
          <div class="brief-headtext">
            <h2 class="brief-title">${chapter.icon} ${t(chapter.name)}</h2>
            <div class="brief-diff">${t('difficulty')} <b>${d.difficulty ?? 1}</b></div>
          </div>
          <div class="coins-badge">🪙 <b>${briefBm.coins}</b></div>
        </div>
        ${ids.length ? `
          ${eyebrow('Anomalies', reroll ? tt('reroll {n}', { n: ANOMALY_REROLL_COST }) : '')}
          <div class="brief-anoms">${ids.map((id, i) => briefAnomHtml(id, i, reroll)).join('')}</div>
          ${d.chapterId === 'blank' ? `<p class="brief-note">${t('The Blank\'s ladder is fixed — each difficulty adds its named modifier.')}</p>` : ''}
        ` : `<p class="brief-note">${t('the base game')}</p>`}
        ${eyebrow('Boosters', t('this run only'))}
        ${boosterSlotsHtml()}
        <button class="btn btn--big" data-act="brief-start">▶&nbsp; ${t('Start')}</button>
      </div>
      ${boosterSheetHtml(briefBookId)}
    `)
  }


  // ---- pause modal -------------------------------------------------------
  // ---- pause: the build readout -------------------------------------------------------------
  // Design 2 (a weapon's real current numbers) inside design 3's collapsible rows, per the owner's
  // pick. Collapsed, every section still states its headline figures, so the sheet answers "what am
  // I running" without a single tap; opening one gives the full spec plus the picks behind it.
  // Sections stay open across re-renders (openBuild), because toggling one re-renders the modal.
  const openBuild = new Set()
  let lastPauseData = null
  // Weapon stat keys the readout may carry, in display order, with their labels. A weapon only
  // shows the ones it actually has, capped so the sheet cannot be pushed past the buttons.
  // Derived from config's STAT_KEYS, which is the single ordered table sim.js also reads for WHICH
  // stats become rows. The words used to live here and the order there, so a new stat needed both
  // and was silently absent from the sheet if it got one.
  const STAT_LABEL = Object.fromEntries(STAT_KEYS.map((s) => [s.key, s.label]))
  const STAT_MAX_ROWS = 5
  // French writes 1,00 s — comma decimal, NBSP before the unit. The dictionary cannot fix a number,
  // so the formatter has to know the language. (Raised by the FR review of this panel.) Declared
  // ABOVE its callers: this file has been bitten before by an initialiser reaching for a const
  // below it, and that class of fault only ever shows up in the minified prod bundle.
  const dec = (n, digits) => (getLang() === 'fr' ? n.toFixed(digits).replace('.', ',') : n.toFixed(digits))
  // Whole numbers for anything big enough that a decimal is noise — the sim rounds damage on the
  // way out anyway, so "32.20 dmg" was reporting a precision the player never experiences.
  const fmtNum = (n) => {
    if (Math.abs(n - Math.round(n)) < 0.05 || Math.abs(n) >= 10) return String(Math.round(n))
    return dec(Math.round(n * 10) / 10, 1)
  }
  const fmtStat = (key, v) => (key === 'every' ? `${dec(v, 2)}${getLang() === 'fr' ? '\u00a0s' : 's'}` : fmtNum(v))
  // What the player's picks added to this stat, as the shortest true statement: a percent when the
  // change is multiplicative, a count when it is not. Empty when the level alone got you here.
  function statDelta(key, value, base) {
    if (base == null || Math.abs(value - base) < 0.005) return ''
    if (key === 'every') return `−${Math.round((1 - value / base) * 100)}%`
    if (Number.isInteger(base) && Number.isInteger(value) && base < 40) return `+${fmtNum(value - base)}`
    return `+${Math.round((value / base - 1) * 100)}%`
  }
  // A mod's accumulated effect, composed exactly the way its level-up card was (see
  // makeWeaponModCard in sim.js) — so the pause sheet and the card that sold it agree word for word.
  // THE one composer for a weapon mod's effect line. Both surfaces that show a mod — the level-up
  // card and the pause build sheet — go through this, because they used to compose "+N <phrase>"
  // separately (sim.js's makeWeaponModCard and modLine below) and "they agree word for word" was a
  // promise kept by hand rather than by construction.
  //
  // A desc carrying {n} PLACES THE AMOUNT ITSELF, anywhere in the sentence, and each language
  // places it independently — the dict key is the English template, exactly the contract tt() is
  // built on (see i18n.js). French wants the number mid-sentence far more often than English does
  // (« 1 volée sur 4 », « les piquants font 2 aller-retours »), and before this it could only ever
  // be prefixed. A desc with no {n} keeps the old "+N " head, which is still most of them.
  function modEffectText(cfg, bonus) {
    if (cfg.kind === 'switch') return t(cfg.desc)
    const n = cfg.kind === 'pct' ? `${Math.round(bonus * 100)}%` : fmtNum(bonus)
    return cfg.desc.includes('{n}') ? tt(cfg.desc, { n }) : `+${n} ${t(cfg.desc)}`
  }
  // The level-up card's desc line. A mod recomposes from its config so it gets {n} support and
  // stays identical to the pause sheet; everything else uses the string sim.js already composed.
  function cardDescHtml(c) {
    const cfg = c.kind === 'mod' ? WEAPON_MODS[c.weapon]?.[c.id] : null
    if (cfg && !cfg.descFor) return modEffectText(cfg, c.bonus)
    // An element card under the redesign carries its TEMPLATE and numbers (see elementCardDesc in
    // config.js) rather than a finished sentence, so the dictionary has one key per card instead of
    // one per value the numbers can take. c.desc holds the composed English for everything that
    // wants a plain string, and is the fallback for the old element system's cards.
    if (c.descT) return elDescHtml(c.descT)
    return tCardDesc(c.desc)
  }
  // An element upgrade shows what the pick MOVES: the figure the player has now, struck through,
  // then the one they would have. Compared per placeholder rather than per sentence, so only the
  // numbers that actually change get the treatment — the window seconds, and lightning's arc count
  // on a step that does not add one, stay plain. Substituted INTO the template, which means the
  // French decides where they land; `prev` is absent on a first pick (see makeElementCard).
  // Numbers only — every value here comes from elementFacts, so there is no user text to escape.
  function elDescHtml({ s, p, prev }) {
    const shown = Object.fromEntries(Object.entries(p).map(([k, v]) => [k,
      prev && prev[k] !== v ? `<s class="lv-was">${prev[k]}</s>&nbsp;→&nbsp;${v}` : v]))
    return tt(s, shown)
  }
  function modLine(weaponId, m) {
    const cfg = WEAPON_MODS[weaponId]?.[m.id]
    if (!cfg) return ''
    // v6.7.6: a mod with `descFor` (Beam Prism) writes its own whole line, prefix included, because
    // its wording CHANGES with the amount rather than just its number — so composing it here from
    // cfg.desc would quietly drop half the sentence and break the "word for word" promise above.
    // It already returns the "+N <phrase>" shape, so tCardDesc splits and translates it identically
    // to the level-up card.
    if (cfg.descFor) {
      return `<div class="bd-eff"><span class="bd-eff-i">${cfg.icon ?? '•'}</span><span class="bd-eff-t">${esc(tCardDesc(cfg.descFor(m.bonus)))}</span></div>`
    }
    // Split the "+N " head off only when there IS one — a {n} desc has the amount inside the
    // sentence, so there is nothing to bold and nothing to split.
    const text = modEffectText(cfg, m.bonus)
    const head = /^(\+[\d.]+%? )/.exec(text)
    return head
      ? `<div class="bd-eff"><span class="bd-eff-i">${cfg.icon ?? '•'}</span><span class="bd-eff-t"><b>${esc(head[1])}</b>${esc(text.slice(head[1].length))}</span></div>`
      : `<div class="bd-eff"><span class="bd-eff-i">${cfg.icon ?? '•'}</span><span class="bd-eff-t">${esc(text)}</span></div>`
  }
  function sectionHtml(key, icon, name, headline, bodyHtml, badge = '') {
    const open = openBuild.has(key)
    return `
      <div class="bd-sec${open ? ' bd-sec--open' : ''}">
        <button class="bd-row" data-act="build-toggle" data-key="${esc(key)}" aria-expanded="${open}">
          <span class="bd-ic">${icon}</span>
          <span class="bd-nm">${esc(name)}</span>
          ${badge ? `<span class="bd-lvl">${esc(badge)}</span>` : ''}
          <span class="bd-head">${esc(headline)}</span>
          <span class="bd-caret">${open ? '▾' : '▸'}</span>
        </button>
        ${open ? `<div class="bd-body">${bodyHtml}</div>` : ''}
      </div>`
  }
  function buildBlockHtml(build) {
    if (!build || !build.weapons) return ''
    const secs = []
    for (const w of build.weapons) {
      const cfg = WEAPONS[w.id]
      if (!cfg) continue
      const rows = w.stats.slice(0, STAT_MAX_ROWS)
      const dmg = w.stats.find((s) => s.key === 'dmg')
      const cnt = w.stats.find((s) => s.key === 'count' || s.key === 'orbs' || s.key === 'chunks')
      // Not every weapon has damage or a projectile count (the Pheromone Lure has neither), and a
      // blank headline reads as a broken row — fall back to whatever stat it does lead with.
      let headline = [dmg ? `${fmtNum(dmg.value)} ${t('dmg')}` : '', cnt ? `×${fmtNum(cnt.value)}` : ''].filter(Boolean).join(' ')
      if (!headline && rows.length) headline = `${t(STAT_LABEL[rows[0].key] ?? rows[0].key)} ${fmtStat(rows[0].key, rows[0].value)}`
      const table = `<table class="bd-tbl">${rows.map((s) => {
        const d = statDelta(s.key, s.value, s.base)
        return `<tr><td class="bd-k">${esc(t(STAT_LABEL[s.key] ?? s.key))}</td><td class="bd-v">${esc(fmtStat(s.key, s.value))}</td><td class="bd-d">${esc(d)}</td></tr>`
      }).join('')}</table>`
      const lines = w.mods.map((m) => modLine(w.id, m)).join('')
      secs.push(sectionHtml(`w:${w.id}`, cfg.icon ?? '⭐', t(cfg.name), headline, table + lines, `${t('LV')} ${w.level}`))
    }
    if (build.passives.length) {
      const body = build.passives.map((ps) => {
        const cfg = PASSIVES[ps.id]
        if (!cfg) return ''
        const head = cfg.kind === 'pct' ? `+${Math.round(ps.bonus * 100)}% ` : `+${fmtNum(ps.bonus)} `
        return `<div class="bd-eff"><span class="bd-eff-i">💪</span><span class="bd-eff-t"><b>${esc(head)}</b>${esc(t(cfg.desc))}</span></div>`
      }).join('')
      const n = build.passives.reduce((s, x) => s + x.picks, 0)
      secs.push(sectionHtml('you', '🧍', t('You'), tt('{n} picks', { n }), body))
    }
    if (build.elements.length) {
      const body = build.elements.map((el) => {
        const cfg = ELEMENTS[el.id]
        if (!cfg) return ''
        return `<div class="bd-eff"><span class="bd-eff-i">${cfg.icon ?? '✨'}</span><span class="bd-eff-t"><b>${esc(fmtNum(el.potency))} </b>${esc(t(cfg.name))}</span></div>`
      }).join('')
      const head = build.elements.map((el) => `${ELEMENTS[el.id]?.icon ?? '✨'}${fmtNum(el.potency)}`).join(' ')
      secs.push(sectionHtml('elements', '✨', t('Elements'), head, body))
    }
    // v6.7.7: the sixth tier, in the one place a player can check what they are running. An
    // anomaly is a RULE — it moves no stat, so no other row in this sheet can hint at it, and its
    // effects are deliberately indistinguishable from things the base game already does (Unstable
    // Cores' bomb is the same corpse bomb the `volatile` elite affix rolls on its own). Without
    // this section, taking the card and not taking it look identical from the pause screen.
    // Heading = RARITIES.anomaly.name so the sheet and the card's chip say the same word.
    if (build.anomalies?.length) {
      // v7.5: SPECIALIST carries a `subject` weapon, and its desc says "Its upgrades…" — so the
      // weapon has to be named here or the row is unreadable.
      const aName = (a) => a.subject && WEAPONS[a.subject]
        ? tt('{name}: {sub}', { name: t(a.name), sub: t(WEAPONS[a.subject].name) })
        : t(a.name)
      const body = build.anomalies.map((a) => `<div class="bd-eff"><span class="bd-eff-i">${a.icon ?? '💠'}</span><span class="bd-eff-t"><b>${esc(aName(a))} </b>${esc(t(a.desc))}</span></div>`).join('')
      const head = build.anomalies.map((a) => aName(a)).join(', ')
      secs.push(sectionHtml('anomalies', '💠', t(RARITIES.anomaly.name), head, body))
    }
    if (!secs.length) return ''
    return `<div class="bd">${secs.join('')}</div>`
  }

  function renderPause(d) {
    lastPauseData = d
    const mutatorIds = d.mutators || []
    const mutatorBlock = mutatorIds.length ? `
      <div class="pause-mutators">
        <div class="pause-mutators-head">🌀 ${t('Anomalies')}</div>
        ${mutatorIds.map((id) => `
          <div class="pause-mutator-line">
            <span class="pause-mutator-icon">${MUTATORS[id]?.icon ?? '❔'}</span>
            <span class="pause-mutator-body">
              <span class="pause-mutator-name">${t(MUTATORS[id]?.name ?? id)}</span>
              <span class="pause-mutator-desc">${t(MUTATORS[id]?.desc ?? '')}</span>
            </span>
          </div>`).join('')}
      </div>` : ''
    setHtml(screens.pause, `
      <div class="modal modal--pause" data-pop="pause">
        <h2 class="modal-title">${t('Paused')}</h2>
        ${mutatorBlock}
        ${buildBlockHtml(d.build)}
        <!-- Entry to the element Codex (see renderCodex), carrying this run's own potency so its
             pages print "yours" alongside the rule. data-from tells the close button which screen
             to land back on — see the 'codex-open'/'codex-close' cases. -->
        <button class="btn btn--soft" data-act="codex-open" data-from="pause">📖 ${t('Codex')}</button>
        <button class="btn btn--big" data-act="resume">▶&nbsp; ${t('Resume')}</button>
        <button class="btn btn--soft" data-act="quit">${t('Quit to menu')}</button>
        ${buildStampHtml()}
      </div>
    `)
  }

  // ---- hidden dev menu (v7.12) ---------------------------------------------
  // Seven taps on the HUD coin badge pauses the run and opens this. It exists to answer "what does
  // THIS card actually do", which is otherwise a matter of replaying until the pool offers it —
  // several of the 20 anomalies are gated behind conditions (an elite kill, a level floor) that
  // take most of a run to reach.
  //
  // Deliberately NOT translated. Every string here is a literal, not a t() call: fr.js is keyed by
  // the English source string, so routing dev chrome through it would add rows to the translation
  // surface for a screen only the developer ever sees. The CARDS inside it still translate — they
  // go through cardFaceHtml, the same function the level-up screen uses.
  let devList = []          // the flat card list main.js handed us, in devCards() order
  let devFilter = ''
  let devListEl = null      // repainted alone on every keystroke, so the filter field keeps focus
  // The title wordmark's seven-tap counter, and the ONLY dev gesture left in the game. The HUD
  // coin badge had its own identical burst until 2026-08-19; what killed it was not duplication but
  // that two dev switches make two different answers to "is this a dev run", and the leaderboard
  // needs one.
  let wipTaps = 0
  let wipTapAt = 0

  // Card rows, grouped by kind with a sticky header per group. Filtering matches the title, the
  // description and the kind, so "anom" finds the whole tier and "fire" finds what it reads like.
  function paintDevList() {
    if (!devListEl) return
    const q = devFilter.trim().toLowerCase()
    const rows = devList
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => !q || `${c.kind} ${t(c.title)} ${t(c.desc ?? '')}`.toLowerCase().includes(q))
    let lastKind = null
    devListEl.innerHTML = rows.map(({ c, i }) => {
      const head = c.kind === lastKind ? '' : `<div class="dev-kind">${c.kind}</div>`
      lastKind = c.kind
      return `${head}<button class="card lv-card" data-dev="${i}" data-rarity="${c.rarity ?? 'normal'}">${cardFaceHtml(c, false)}</button>`
    }).join('')
    const count = root.querySelector('.dev-count')
    if (count) count.textContent = `${rows.length} / ${devList.length} cards · tap to add`
  }

  // `d.cards` is absent when the erase-confirm re-renders this screen from its own handler — keep
  // the list main.js last handed us rather than blanking it.
  function renderDev(d) {
    devList = d.cards ?? devList
    // main.js re-shows this screen after every take (the list is rebuilt against the changed run).
    // Without carrying the scroll across, testing the third anomaly means scrolling back down to it
    // every single time.
    const scroll = devListEl ? devListEl.scrollTop : 0
    setHtml(screens.dev, `
      <div class="modal modal--dev" data-pop="dev">
        <h2 class="modal-title">DEV</h2>
        <input class="dev-filter" id="dev-filter" type="text" placeholder="name, or anomaly / mod / passive…" autocomplete="off" value="${devFilter.replace(/"/g, '&quot;')}">
        <p class="dev-count"></p>
        <div class="dev-list"></div>
        <div class="shop-foot">
          <button class="btn btn--big" data-act="dev-close">▶&nbsp; Resume</button>
          <button class="reset-link" data-act="reset-start" aria-label="Reset all progress" title="Reset all progress">🗑</button>
        </div>
      </div>
      ${resetModalHtml()}
    `)
    devListEl = screens.dev.querySelector('.dev-list')
    paintDevList()
    devListEl.scrollTop = scroll
  }

  // ---- element codex ------------------------------------------------
  // Explains the elements-redesign rule (config.js's "Elements REDESIGN" block) in plain language.
  // Two opt-in entry points (title's ⚙ sheet, pause's build sheet) hand this the SAME `elements`
  // shape: a { fire, cold, venom, lightning } potency map, or null with no run in progress. Every
  // number on the page comes from elementFacts/elementCodex/ELEMENT_CODEX_INTRO (config.js) — this
  // function only lays the paragraphs out, never composes one.
  // The Close button carries data-from so main.js (the only module that knows whether a run
  // exists to go back to) can resolve the right destination — same data-* idiom as data-key on
  // build-toggle above, rather than a second piece of module state to keep in sync with the render.
  function renderCodex(d) {
    const from = d.from ?? 'title'
    const elements = d.elements ?? null
    const introHtml = ELEMENT_CODEX_INTRO.map((p) => `<p class="codex-p">${esc(t(p))}</p>`).join('')
    const sections = Object.keys(ELEMENTS).map((id) => {
      const cfg = ELEMENTS[id]
      const P = elements?.[id] ?? 0
      const body = elementCodex(id, P)
        .map((p) => `<p class="codex-p${p.mine ? ' codex-p--mine' : ''}">${esc(tt(p.s, p.p))}</p>`).join('')
      return `
        <section class="codex-sec">
          <h3 class="codex-sec-title">${cfg.icon} ${esc(t(cfg.name))}</h3>
          ${body}
        </section>`
    }).join('')
    setHtml(screens.codex, `
      <div class="modal modal--codex" data-pop="codex">
        <h2 class="modal-title">📖 ${t('Codex')}</h2>
        <div class="codex-scroll">
          <div class="codex-intro">${introHtml}</div>
          ${sections}
        </div>
        <button class="btn btn--big" data-act="codex-close" data-from="${from}">${t('Back')}</button>
      </div>
    `)
  }

  // ---- "what happened to me" (v7.x) ----------------------------------------
  // Owner ask, alongside the death outro: say what killed you, and where the run's damage actually
  // went. Both read the same tally (run.dmgBySrc / run.killedBy — see state.js's doc block), and
  // both resolve labels through config.js's dmgSrcName, which is the ONE resolver. Do not add a
  // second lookup here: enemy labels are roster ids whose names live in CHAPTERS[].roster, and a
  // local copy of that mapping is the drift this project's cross-file lint scenarios exist to catch.
  //
  // SHARES OF DAMAGE TAKEN, not of max HP. The denominator is the tally's own total, so the rows
  // always add to 100% of the HP this run actually cost — healing, revives and a rising maxHP all
  // make "% of your health" meaningless over 300 seconds, while "of everything that hurt me" stays
  // true whatever the build did.
  // FOLDED BY DEFAULT (owner ask): the full breakdown is six rows with portraits and it pushed the
  // coin total and both buttons down the modal. The recap is something you consult, not something you
  // are shown — so it costs one row until you ask for it. Same disclosure idiom as the pause build
  // sheet's sections (bd-caret, `▾`/`▸`, aria-expanded), and the same flag-plus-re-render mechanism
  // as the brief screen's booster sheet, which is why lastSummaryData exists below.
  let dmgOpen = false
  const DMG_ROWS_MAX = 5
  function damageBlock(d) {
    const tally = d.dmgBySrc || {}
    const rows = Object.entries(tally).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    if (!rows.length) return ''
    const total = rows.reduce((s, [, v]) => s + v, 0)
    // Top N, with the remainder lumped into one honest "Other" row rather than dropped. A silent
    // truncation would read as "these were all the things that hurt me", which is a different and
    // false statement — the same reason the probe harnesses print their denominators.
    const shown = rows.slice(0, DMG_ROWS_MAX)
    const restTotal = rows.slice(DMG_ROWS_MAX).reduce((s, [, v]) => s + v, 0)
    // `src` is the tally key, and dmgSrcArt maps it to the CAST_ART key — normally itself. Every
    // thumbnail in src/cast/ is baked from render.js's own drawing (scripts/bake-cast.mjs): creatures
    // from their roster textures, hazards from the very draw functions that paint them in-world. So a
    // row shows THE GAME'S ART rather than a lookalike, which is why the chapter cards stopped using
    // emoji — v6.7.1 shipped 🐻 for the tardigrade while drawTardigrade sat in render.js.
    // A few sources still show an EMPTY slot of the same width, and that is now a decision with a
    // written reason rather than a stand-in: see DMG_SRC_NO_ART in config.js, which run DA.g holds to
    // partition DMG_SRC_NAME exactly. The slot stays fixed-width so every name starts in one column.
    const line = (src, label, v) => {
      const pct = Math.round((v / total) * 100)
      const art = src ? CAST_ART[dmgSrcArt(src)] : null
      // The bar is the row's own background, sized by the share — no extra element, and it degrades
      // to a plain labelled percentage if the style ever fails to load.
      return `<div class="dmg-row"><span class="dmg-bar" style="width:${pct}%"></span>` +
        (art ? `<img class="dmg-art" src="${art}" alt="">` : '<span class="dmg-art"></span>') +
        `<span class="dmg-name">${esc(label)}</span><b>${pct}%</b></div>`
    }
    const body = shown.map(([src, v]) => line(src, t(dmgSrcName(src) ?? src), v)).join('') +
      (restTotal > 0 ? line(null, t('Other'), restTotal) : '')
    return `
      <div class="summary-damage${dmgOpen ? ' summary-damage--open' : ''}">
        <button class="dmg-toggle" data-act="dmg-toggle" aria-expanded="${dmgOpen}">
          <span class="dmg-toggle-i">💔</span>
          <span class="dmg-toggle-t">${t('Run Damage Recap')}</span>
          <span class="bd-caret">${dmgOpen ? '▾' : '▸'}</span>
        </button>
        ${dmgOpen ? `<div class="dmg-body">${body}</div>` : ''}
      </div>`
  }

  // ---- summary modal -------------------------------------------------------
  // Mirrors the data showScreen was called with, so folding the damage recap open can re-render this
  // screen without main.js re-sending a run that has already ended. Exactly lastBriefData's job for
  // the booster sheet, for exactly the same reason.
  let lastSummaryData = null
  // A podium finish is announced ON the number that earned it, not as a line of its own: the
  // summary already prints Kills and Level reached, so the rank has a home where the eye is
  // already looking and the screen grows by nothing. `#1` rather than "1st" because an ordinal
  // needs translating and a numeral does not.
  // Carries ICO_PODIUM, so the three surfaces the feature has — the brief's Podium row, the
  // nickname sheet, and this — share one visual key. Without it "#1" beside a number is as easily
  // a footnote marker as a rank, to a player who has never opened the board it refers to.
  // data-pop, so setHtml's existing bookkeeping owns the entrance: NEW on the render where the rank
  // lands (it animates), already-seen on any later one (it does not). Without it the chips replay
  // their arrival every time the damage recap is folded — an entrance firing for something the
  // player did not cause, which is the exact defect the whole .no-pop mechanism exists for. A blanket
  // `.no-pop .rank-chip { animation: none }` looks like the fix and is not: the rank ALWAYS arrives
  // on a re-render, so the box already carries .no-pop by then and the chip would never animate at all.
  const rankChip = (n, board) => (n ? `<i class="rank-chip rank-chip--${n}" data-pop="rank-${board}">${ICO_PODIUM}#${n}</i>` : '')

  // Filled in after the fact: the score is submitted as the summary appears, so the rank always
  // arrives late. Re-rendering from lastSummaryData is the same path the damage recap's fold uses.
  //
  // `forData` IS THE GUARD, and it is the same one loadPodium has. Without it the rank lands on
  // whatever summary happens to be showing when the request returns — so dying, tapping Play again
  // and dying a second time inside the 8s window paints run 1's ranks onto run 2's numbers. Object
  // identity rather than a counter: main.js passes back the very object it handed to showScreen, so
  // there is no second thing to keep in step.
  function setPodiumResult(forData, res) {
    if (!res || lastSummaryData !== forData) return
    lastSummaryData.podium = res
    if (active === 'summary') renderSummary(lastSummaryData)
  }

  function renderSummary(d) {
    lastSummaryData = d
    const mutatorIds = d.mutators || []
    // The data object doesn't carry which chapter was played (see the header contract above) —
    // reconstruct it: classic runs play whatever's currently selected (meta.chapter can't have
    // changed mid-run, the chapter row only lives on the title screen).
    const chapterId = meta.chapter
    const chapter = CHAPTERS[chapterId] ?? CHAPTERS[CHAPTER_ORDER[0]]
    const mutatorBlock = mutatorIds.length ? `
      <div class="summary-mutators">
        <div class="summary-mutators-head">🌀 ${t('Anomalies')}</div>
        ${mutatorIds.map((id) => `<div class="summary-mutator-line">${MUTATORS[id]?.icon ?? '❔'} ${t(MUTATORS[id]?.name ?? id)}</div>`).join('')}
      </div>` : ''
    // Deaths only, and only when the label resolves: a win has no killer, and printing a raw
    // internal id at the player would be worse than the silence. tt(), not a composed string — the
    // key has to be the TEMPLATE so one dictionary entry covers every killer and French can put the
    // name where French wants it (see the tt/elText rule in CLAUDE.md).
    const killerName = d.victory ? null : dmgSrcName(d.killedBy)
    const killedByLine = killerName
      ? `<p class="summary-killer">☠️ ${tt('Killed by {name}', { name: t(killerName) })}</p>`
      : ''
    setHtml(screens.summary, `
      <div class="modal" data-pop="summary">
        <h2 class="modal-title">${d.victory
          ? t(CHAPTER_ENDINGS[chapterId]?.victory ?? 'You escaped! 🎉')
          : t(CHAPTER_ENDINGS[chapterId]?.death ?? 'Squished… 💦')}</h2>
        <p class="summary-chapter">${chapter.icon} ${t(chapter.name)}</p>
        ${killedByLine}
        <div class="stats">
          <div class="stat-row"><span>${t('Time')}</span><b>${fmtTime(d.time)}${rankChip(d.podium?.time, 'time')}</b></div>
          <div class="stat-row"><span>${t('Kills')}</span><b>${d.kills}${rankChip(d.podium?.kills, 'kills')}</b></div>
          <!-- The level chip is suppressed on a boss chapter even though the level board still
               takes its score: that board is not drawn anywhere for a scripted chapter, so a rank
               on it points at a page the player cannot open. The time chip needs no such guard —
               podium.time only exists for a WON boss run in the first place. -->
          <div class="stat-row"><span>${t('Level reached')}</span><b>${d.level}${
            CHAPTERS[chapterId]?.scripted ? '' : rankChip(d.podium?.level, 'level')}</b></div>
        </div>
        ${damageBlock(d)}
        ${mutatorBlock}
        ${typeof d.unlockedDifficulty === 'number' ? `<div class="summary-unlock">🔓 ${tt('Difficulty {d} unlocked!', { d: d.unlockedDifficulty })}</div>` : ''}
        ${d.unlockedChapter ? `<div class="summary-unlock summary-unlock--chapter">🔓 ${CHAPTER_UNLOCK_LINES[d.unlockedChapterId]
          ? t(CHAPTER_UNLOCK_LINES[d.unlockedChapterId])
          : tt('New level unlocked: {n} {name}', { n: chapterNumber(d.unlockedChapterId), name: t(d.unlockedChapter) })}</div>` : ''}
        ${d.unlockedHiddenChapter ? `<div class="summary-unlock summary-unlock--hidden">⬜ ${t('THE BLANK — the antibody that let you go wants you back')}</div>` : ''}
        ${BOOK_UNLOCK_LINES[d.unlockedBook] ? `<div class="summary-unlock summary-unlock--book">📖 ${tt(BOOK_UNLOCK_LINES[d.unlockedBook], { n: BOOKS[d.unlockedBook]?.startCoins ?? 0 })}</div>` : ''}
        <div class="earned">🪙 +${d.earned}
          ${d.bonus > 0 ? `<span class="earned-bonus">+${d.bonus} ${t('finish bonus')}</span>` : ''}
        </div>
        <button class="btn btn--big" data-act="play">▶&nbsp; ${d.nextDifficulty ? t('Next level') : t('Play again')}</button>
        <button class="btn btn--soft" data-act="quit">${t('Menu')}</button>
      </div>
    `)
  }

  // ---- screen switching -----------------------------------------------------
  function showScreen(name, data) {
    // Arriving on a DIFFERENT screen is a genuine open, so forget what setHtml saw last: the pause
    // sheet you closed and re-open must pop in again. Re-showing the screen you are already on (a
    // level-up reroll) is a re-render, and keeps the memory.
    if (name !== active) popShown.clear()
    // The damage recap re-folds whenever we NAVIGATE, so the next death opens closed — but not on a
    // re-render of the summary itself, which is how the fold toggles at all. Guarding on the name
    // rather than on `active` is what draws that line: a toggle re-render goes straight to
    // renderSummary and never reaches showScreen.
    if (name !== 'summary') dmgOpen = false
    // The level preview always opens on its FRONT page. Here rather than in switchTab because the
    // title is left several ways — Play, Shop, the Codex — and only this is on every path. Coming
    // back from a run to a panel showing scores instead of the chapter you were about to replay is
    // a screen nobody asked for, and the difficulty pips are not on that leaf.
    if (name !== 'title') podiumOpen = false
    if (name === 'title') renderTitle()
    else if (name === 'shop') renderShop()
    else if (name === 'brief') renderBrief(data ?? {})
    else if (name === 'levelup') renderLevelup(data ?? {})
    else if (name === 'pause') renderPause(data ?? {})
    else if (name === 'summary') renderSummary(data ?? {})
    else if (name === 'dev') renderDev(data ?? {})
    else if (name === 'codex') renderCodex(data ?? {})
    const hudUnder = name === 'levelup' || name === 'pause'   // hud stays visible under these modals
    // The level-up screen passes taps through to that HUD so its ⏸ works (styles.css). The
    // SKILL button is under there too and must stay dead — pressSkill latches (input.js), so a
    // stray tap beside the cards would fire the skill the instant the modal closes.
    root.classList.toggle('lv-open', name === 'levelup')
    for (const [n, el] of Object.entries(screens)) {
      el.classList.toggle('screen--visible', n === name || (hudUnder && n === 'hud'))
    }
    // keyboard nav for the level-up cards is only live while that screen shows
    document.removeEventListener('keydown', onLevelupKeydown)
    if (name === 'levelup') document.addEventListener('keydown', onLevelupKeydown)
    // v7.5: a BLIND FAITH reveal in flight must not land onChoose on a screen that is no longer the
    // level-up (death mid-modal, a quit). Dropping the timer here is what makes leaving the screen
    // authoritative over it.
    else if (lvRevealTimer) { clearTimeout(lvRevealTimer); lvRevealTimer = 0; lvRevealing = false; lvRevealIdx = -1 }
    active = name
  }

  // Menu screen switch. `target` is 'title' or 'shop'; switching to the screen already showing is
  // inert. Leaving the shop resets its transient modal state (sacrifice / refund) — the cleanup the
  // old '← Back' case used to own, and the reason both doors route through here rather than
  // calling showScreen directly.
  function resetShopModals() {
    sacrificeOpen = false
    sacrificePicks = {}
    sacrificeBounceId = null
    sacrificeTarget = null
    refundOpen = false
    refundAllAsk = false
    // Back to coins on re-entry: buying an upgrade is the everyday visit and a sacrifice is
    // something a save does a handful of times, so the common case gets the opening screen.
    shopTab = 'upgrades'
  }
  function switchTab(target) {
    if (active === target) return
    if (active === 'shop') resetShopModals()
    // don't strand a sheet open on return. nickEditing belongs in this list for the same reason —
    // the RENAME sheet, which reopens on the title with no way to tell it from the mandatory one.
    // (The mandatory prompt is not stranded by this: it is driven by !meta.nick, not by the flag.)
    // §9.5's fifth cost: a player who checks the shop mid-pairing loses the sheet. The typed
    // code is gone, but the CODE ITSELF is not — it is on disk the moment link() succeeds, so
    // reopening the sheet shows it again rather than restarting the flow.
    if (active === 'title') { slotsOpen = false; settingsOpen = false; nickEditing = false; syncOpen = false }
    if (active === 'brief') boostersOpen = false // v6.7: same, for the booster sheet that lives there now
    playSfx('click')
    showScreen(target)
  }

  // v6.6.12: the text-field pair that keeps a value alive across renderTitle()'s wholesale innerHTML
  // rewrite. Delegated, so it survives the field being destroyed and recreated on every re-render.
  root.addEventListener('input', (e) => {
    if (e.target.id === 'rename-field') renameDraft = e.target.value
    // The nickname's Done button is enabled by what is typed, so something has to change per
    // keystroke — but NOT by re-rendering. renderTitle() destroys and rebuilds the live <input>,
    // and focusRenameField puts the caret back at the END, which is right after a full sheet
    // redraw and wrong here: put the caret in the middle of "Aurelien", type one character, and
    // the next one lands at the end instead. Patch the two things that actually change, exactly as
    // the dev filter's comment below says to.
    else if (e.target.id === 'nick-field') {
      nickDraft = e.target.value
      const ok = validNick(nickDraft) != null
      root.querySelector('[data-act="nick-save"]')?.toggleAttribute('disabled', !ok)
      // The rule line turns red only once there is something to be wrong ABOUT — an empty field is
      // not yet a mistake, and colouring it on open would greet every player with an error.
      root.querySelector('.nick-rule')?.classList.toggle('nick-rule--bad', !ok && nickDraft.length > 0)
    }
    // Repaint the LIST only, never the modal: rewriting screens.dev.innerHTML on every keystroke
    // would destroy the field being typed into and drop focus after one character.
    else if (e.target.id === 'sync-code') {
      const el = e.target
      const atEnd = el.selectionStart === el.value.length
      // Regroup only while the caret is at the END — i.e. while typing, which is how sixteen
      // characters actually get in. Reformatting during a mid-string edit would move the caret
      // to the end after every keystroke, which is the exact bug the nickname field's comment
      // warns about one branch up.
      if (atEnd) {
        const grouped = el.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 16).replace(/(.{4})(?=.)/g, '$1-')
        if (grouped !== el.value) { el.value = grouped; try { el.setSelectionRange(grouped.length, grouped.length) } catch { /* unsupported */ } }
      }
      syncDraft = el.value
      // Patch the one thing that changes, never re-render: the field being typed into would be
      // destroyed and focus dropped after a single character.
      root.querySelector('[data-act="sync-lookup"]')?.toggleAttribute('disabled', syncDraft.replace(/[\s-]/g, '').length !== 16)
    }
    else if (e.target.id === 'dev-filter') { devFilter = e.target.value; paintDevList() }
  })
  root.addEventListener('keydown', (e) => {
    if (e.target.id === 'sync-code') {
      const go = () => root.querySelector('[data-act="sync-lookup"]')
      if (e.key === 'Enter') { e.preventDefault(); go()?.click() }
      else if (e.key === 'Escape') { e.preventDefault(); root.querySelector('[data-act="sync-close"]')?.click() }
      return
    }
    const nick = e.target.id === 'nick-field'
    if (!nick && e.target.id !== 'rename-field') return
    // Enter commits and Escape cancels, because a soft keyboard's "done" key is the only obvious
    // exit once it covers the buttons — which on iOS it does, since the sheet is centred in a
    // position:fixed backdrop and the visual viewport shrinks under it without moving the layout.
    // Escape on the FIRST nickname finds no cancel button and correctly does nothing: that sheet
    // has no way out by design.
    const act = (name) => root.querySelector(`[data-act="${name}"]`)
    if (e.key === 'Enter') { e.preventDefault(); (nick ? act('nick-save') : act('rename-save'))?.click() }
    else if (e.key === 'Escape') { e.preventDefault(); (nick ? act('nick-cancel') : act('rename-cancel'))?.click() }
  })

  // ---- one delegated click handler for every screen ---------------------------
  // ---- THE IN-RUN CONTROLS CANNOT RIDE THE DELEGATED CLICK (v7.x, multitouch bug report) --------
  // "when using the joystick to control I can't use the action button."
  //
  // `click` on a touch device is a COMPATIBILITY event synthesised from the touch sequence, and the
  // joystick calls preventDefault() on its own touchstart (input.js — it has to, or the page pans
  // and text-selects under the thumb). That suppresses the compatibility mouse events for the rest
  // of that touch session, so a SECOND finger on the skill button lands its touchstart on the button
  // and no click is ever generated. Measured over CDP with two real touch points on a 390x844 phone:
  //
  //     button alone            -> touchstart 1, click 1
  //     joystick held, button   -> touchstart 1, click 0
  //
  // The joystick itself is not at fault and was already multitouch-aware: it ignores a second finger
  // and skips any touch that starts on a button. The break is entirely on the receiving side.
  //
  // So the two controls you press WHILE STEERING listen for the touch directly. preventDefault here
  // is doing a second job as well as stopping the page scrolling: it suppresses the compatibility
  // click that WOULD have fired in the single-finger case, so el.click() below cannot double-fire.
  // Firing on press rather than on release is also simply better for a game button.
  //
  // Delegated off the HUD rather than bound per element so a future in-run control is covered by
  // construction. Everything else — menus, cards, the shop — keeps the click path, where fire-on-
  // release is the correct behaviour and no joystick is ever held.
  //
  // The level-up guard still holds: `#ui.lv-open .skill-btn` is pointer-events:none (styles.css), so
  // a stray tap beside the cards cannot reach this handler either.
  screens.hud.addEventListener('touchstart', (e) => {
    const el = e.target.closest('.skill-btn, [data-act="pause"]')
    if (!el) return
    e.preventDefault()
    el.click()
  }, { passive: false })

  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act], [data-buy], [data-choose], [data-consumable], [data-subject], [data-dev], [data-vol], [data-book]')
    if (!el) return
    // THE NICKNAME SHEET IS A MODAL BACKDROP, WHICH BLOCKS THE POINTER AND NOTHING ELSE. Tab order
    // is untouched by a `position: fixed` div, so on a keyboard you can walk straight past it onto
    // Play and start a run — and this codebase already knows: `case 'play'` carries the comment
    // "keyboard focus can reach Play behind a backdrop". The run then ends with meta.nick still
    // empty, endRun submits nothing, and no screen anywhere says why.
    // One guard rather than a clause on every case: while the sheet is up, the only live controls
    // are the ones inside it. Cheaper than a focus trap and it cannot be forgotten by a case added
    // later.
    // Matched on .nick-sheet rather than on the data-pop key: run MP greps this file for
    // `data-pop="…"` literals to prove every modal key is unique, and a SELECTOR spelled that way
    // reads to it as a second modal declaring the same key.
    // `active === 'title'` is not redundant — it makes an invariant explicit that was otherwise
    // load-bearing and unwritten. nickPrompted() knows nothing about screens, so without it this is
    // a whole-app click kill switch that happens to be safe only because the title is the boot
    // screen and no screen change is reachable without a click.
    if (nickPrompted() && active === 'title' && !el.closest('.nick-sheet')) return
    // Same shape, same reasoning, for the conflict prompt (§7.2). Two of its three buttons
    // destroy a save, so nothing outside it may fire while it is open.
    if (conflictPending() && active === 'title' && !el.closest('.conflict-sheet')) return
    if (el.dataset.dev !== undefined) {
      // The screen stays open — testing a card usually means stacking two or three of them, and
      // re-showing rebuilds the list against the run that just changed (a weapon card that read
      // "New!" now reads "Lv 2").
      hooks.onDevTake?.(Number(el.dataset.dev))
      playSfx('buy')
      return
    }
    if (el.dataset.vol !== undefined) {
      const id = el.dataset.vol
      if (id === browseChapterId) return
      browseChapterId = id
      // Back to the preview's front face: a different volume asks "what is this chapter?", and a
      // podium left open answers with another chapter's scores.
      podiumOpen = false
      // Unlocked + a real change persists via onChapter (which plays 'click' itself); a locked
      // volume only browses, so click here instead. Then re-render the whole title: the shelf has
      // to redraw to move the selection ring and the ribbon.
      if (chapterAvailable(meta, id) && id !== meta.chapter) hooks.onChapter(id)
      else playSfx('click')
      renderTitle()
      return
    }
    // A shop spine tab. It moves browseChapterId — the same one pointer the shelf, the coin badge
    // and shopBookId all read — so the two screens still cannot disagree about which book you are
    // in. It does NOT call onChapter: switching purses to compare prices is browsing, and it must
    // not overwrite the chapter you last chose to PLAY (the ribbon on the shelf).
    if (el.dataset.book !== undefined) {
      const b = el.dataset.book
      if (bookOf(browseChapterId) === b) return
      browseChapterId = BOOKS[b].chapters.find((id) => chapterAvailable(meta, id)) ?? BOOKS[b].chapters[0]
      playSfx('click')
      paintRoom()
      renderShop()
      return
    }
    if (el.dataset.buy !== undefined) {
      if (hooks.onBuy(el.dataset.buy, shopBookId())) renderShop(el.dataset.buy)
      return
    }
    if (el.dataset.choose !== undefined) {
      chooseLvCard(Number(el.dataset.choose))   // one gated path for taps and keys alike
      return
    }
    if (el.dataset.subject !== undefined) {     // v7.5 SPECIALIST's weapon chooser
      chooseLvSubject(el.dataset.subject)
      return
    }
    if (el.dataset.consumable !== undefined) {
      const id = el.dataset.consumable
      if (selectedConsumables.has(id)) selectedConsumables.delete(id)
      else selectedConsumables.add(id)
      playSfx('click')
      renderBrief(lastBriefData ?? {})
      return
    }
    switch (el.dataset.act) {
      case 'play': {
        // v6.7: boosters are picked on the pre-run brief now, so Play never carries any. The
        // summary screen's "Play again" reaches this case too and takes the same path.
        selectedConsumables.clear()
        boostersOpen = false
        slotsOpen = false // keyboard focus can reach Play behind a backdrop — don't strand the modal open on return
        settingsOpen = false
        hooks.onPlay()
        break
      }
      // The summary's damage recap. One act for both directions (unlike the booster sheet's
      // open/close pair) because this is an inline fold with no backdrop to disambiguate a tap
      // against — the button is the only thing that can be hit.
      case 'dmg-toggle':
        dmgOpen = !dmgOpen
        playSfx('click')
        renderSummary(lastSummaryData ?? {})
        break
      case 'boosters-open':
        boostersOpen = true
        playSfx('click')
        renderBrief(lastBriefData ?? {})
        break
      case 'boosters-close':
        // Tapping inside the sheet also resolves to the backdrop (nothing stops propagation), so
        // only the Done button or a *direct* backdrop hit closes it (same guard as the modals).
        if (el.classList.contains('modal-backdrop') && el !== e.target) break
        boostersOpen = false
        playSfx('click')
        renderBrief(lastBriefData ?? {})
        break
      // The Shop is a page of the volume you have open, reached from its cover and closed back
      // to the shelf; the brief backs out the same way. Both go through switchTab, which is what
      // resets the shop's transient sacrifice/reset state on the way out.
      case 'shop': switchTab('shop'); break
      case 'shop-close': case 'brief-back': switchTab('title'); break
      // v6.7 settings sheet — the one ⚙ that replaced the title's floating 🌐 / 💾 / build stamp.
      case 'settings':
        playSfx('click')
        settingsOpen = true
        renderTitle()
        break
      case 'settings-close':
        // Same direct-backdrop-hit guard as every other sheet: a tap inside also resolves here.
        if (el.classList.contains('modal-backdrop') && el !== e.target) break
        playSfx('click')
        settingsOpen = false
        renderTitle()
        break
      case 'lang-pick': {
        // v6.1 i18n, v6.7: pick the language outright instead of cycling — with a list on screen,
        // a cycle makes the player tap a row and watch a DIFFERENT one light up.
        const next = el.dataset.lang
        if (next && next !== getLang()) hooks.onLang?.(next)
        renderTitle()
        break
      }
      case 'side-pick': {
        const side = el.dataset.side
        if (side && side !== meta.skillSide) {
          hooks.onSkillSide?.(side)     // persists; meta is the same object, so the class read below is current
          applySkillSide()
        }
        renderTitle()
        break
      }
      // v6.4.6 save slots: the settings sheet's 💾 row opens the picker, backdrop/Cancel closes it, tapping
      // an inactive slot row hands off to main.js (which reloads — see hooks.onSlot). Same
      // direct-backdrop-hit guard as reset-cancel/boosters-close below.
      case 'slots':
        playSfx('click')
        slotsOpen = true
        renderTitle()
        break
      case 'slots-cancel':
        if (el.classList.contains('modal-backdrop') && el !== e.target) break
        playSfx('click')
        slotsOpen = false
        renderTitle()
        break
      case 'slot-pick': {
        const n = Number(el.dataset.slot)
        if (n !== activeSlot()) hooks.onSlot?.(n)
        break
      }
      // v6.6.12 save names. Opens over the slots sheet rather than replacing it, so Cancel lands
      // back where the player was instead of dumping them on the title screen.
      case 'slot-rename': {
        renameSlot = Number(el.dataset.slot)
        renameDraft = slotSummary(renameSlot)?.name ?? ''
        playSfx('click')
        renderTitle()
        break
      }
      case 'rename-cancel':
        if (el.classList.contains('modal-backdrop') && el !== e.target) break
        renameSlot = null
        playSfx('click')
        renderTitle()
        break
      case 'rename-save': {
        // Read the LIVE field, not renameDraft: `input` fires per keystroke but a soft keyboard's
        // autocomplete or a paste can commit text without one, and the value in the DOM is the only
        // thing the player has actually seen.
        const field = screens.title.querySelector('#rename-field')
        hooks.onRename?.(renameSlot, field ? field.value : renameDraft)
        renameSlot = null
        playSfx('click')
        renderTitle()
        break
      }
      // ---- leaderboard nickname ----
      // Opens OVER the settings sheet and deliberately leaves it open, exactly as slot-rename does
      // over the slots sheet ("so Cancel lands back where the player was instead of dumping them on
      // the title screen"). Closing it here meant changing your mind about your name cost you the
      // settings sheet as well, and the language row you were on the way to.
      case 'nick-edit':
        nickEditing = true
        nickDraft = meta.nick ?? ''
        playSfx('click')
        renderTitle()
        break
      case 'nick-cancel':
        // Backdrop taps land here too; ignore the ones that bubbled from inside the sheet. There is
        // no data-act on the backdrop at all while the nickname is still unset, so this cannot be
        // the escape hatch out of the first-load prompt.
        if (el.classList.contains('modal-backdrop') && el !== e.target) break
        nickEditing = false
        playSfx('click')
        renderTitle()
        break
      case 'nick-save': {
        // The LIVE field, for the same reason rename-save reads it: a paste or an autocomplete can
        // commit text without ever firing `input`.
        const field = screens.title.querySelector('#nick-field')
        const chosen = validNick(field ? field.value : nickDraft)
        if (!chosen) break // Done is disabled in this state; a stray Enter must not close the sheet
        hooks.onNick?.(chosen)
        nickEditing = false
        playSfx('click')
        renderTitle()
        break
      }
      // ---- cloud sync (design §9) ----
      // Opening the sheet is a deliberate act, so it pulls past the 10s throttle: a player who came
      // here to check whether sync is working is the one person entitled to a fresh answer.
      case 'sync-open':
        syncOpen = true
        syncView = 'home'
        syncMsg = ''
        syncCopied = false
        playSfx('click')
        renderTitle()
        hooks.sync?.evaluate({ force: true })
        break
      case 'sync-close':
        if (el.classList.contains('modal-backdrop') && el !== e.target) break
        syncOpen = false
        syncView = 'home'
        syncDraft = ''
        syncCloud = null
        playSfx('click')
        renderTitle()
        break
      case 'sync-reveal':
        syncView = 'ready'
        syncCopied = false
        playSfx('click')
        renderTitle()
        break
      case 'sync-enter':
        syncView = 'enter'
        syncDraft = ''
        syncMsg = ''
        playSfx('click')
        renderTitle()
        break
      // §5.1: uploading → ready are real states, not decoration. link() resolves only once the push
      // is ACKed, and the code is rendered only in 'ready' — show it earlier and the player types
      // sixteen correct characters into the other device and is told the code is wrong.
      case 'sync-link':
        syncView = 'uploading'
        syncMsg = ''
        playSfx('click')
        renderTitle()
        Promise.resolve(hooks.sync?.link(activeSlot())).then((tag) => {
          syncView = tag === 'ok' ? 'ready' : 'home'
          syncMsg = tag === 'ok' ? '' : tag
          renderTitle()
        })
        break
      case 'sync-lookup': {
        // The LIVE field, for the same reason rename-save and nick-save read it: a paste or an
        // autocomplete can commit text without ever firing `input`.
        const field = screens.title.querySelector('#sync-code')
        const typed = field ? field.value : syncDraft
        syncMsg = ''
        playSfx('click')
        Promise.resolve(hooks.sync?.lookup(typed)).then((r) => {
          if (!r || r.tag !== 'ok') { syncMsg = r?.tag ?? 'network'; renderTitle(); return }
          // A tombstone is a row with no save in it, so "no save under that code" is literally true
          // and is the message the player needs. (No player-reachable path writes one in this build
          // — plan D1 — but a dev-erased row is still a row this can meet.)
          if (r.body?.blob == null) { syncMsg = 'notFound'; renderTitle(); return }
          syncCloud = { ...r.body, code: r.code }
          syncView = 'pick'
          renderTitle()
        })
        break
      }
      // §5.3. An EMPTY destination adopts outright and nothing is destroyed; an OCCUPIED one raises
      // the §7.2 prompt, so an overwrite is one the player steered into rather than a side effect of
      // linking two devices.
      case 'sync-pick': {
        if (!syncCloud) break
        const n = Number(el.dataset.slot)
        playSfx('click')
        const tag = hooks.sync?.joinInto({ code: syncCloud.code, slot: n, cloud: syncCloud })
        if (tag === 'conflict') syncOpen = false      // the prompt takes the screen
        else if (tag !== 'adopted') syncMsg = tag     // 'adopted' is already reloading
        renderTitle()
        break
      }
      case 'sync-copy': {
        // §5.1 estimated "about fifteen seconds of typing"; with shift-per-character on a soft
        // keyboard and one retry it is 30-60s, and this turns phone→laptop into a paste.
        playSfx('click')
        try { navigator.clipboard?.writeText(groupCodeText(syncState().code))?.catch(() => {}) } catch { /* no clipboard */ }
        syncCopied = true
        renderTitle()
        break
      }
      case 'sync-unlink':
        playSfx('click')
        hooks.sync?.unlink()
        syncView = 'home'
        // Never silent: the other devices keep the old code and keep pushing to a row this one no
        // longer reads, which is §9.3's confident-but-false state seen from the other side.
        syncMsg = 'unlinked'
        renderTitle()
        break
      // ---- the conflict prompt (§7.2) ----
      case 'sync-keep': {
        // The tap shield. This sheet appears UNBIDDEN over the title while a thumb may already be
        // travelling toward Play. Note pop-in is disabled under prefers-reduced-motion, which
        // renders both destructive buttons instantly — so the shield is a clock, not an animation
        // callback.
        if (Date.now() - conflictShownAt < CONFLICT_SHIELD_MS) break
        const which = el.dataset.which === 'cloud' ? 'cloud' : 'local'
        playSfx('click')
        Promise.resolve(hooks.sync?.resolveConflict(which)).then((tag) => {
          conflictShownAt = 0
          syncCloud = null
          if (tag === 'adopted') return              // a reload is already on its way
          syncOpen = true
          syncView = 'home'
          if (tag && tag !== 'ok') syncMsg = tag
          renderTitle()
        })
        break
      }
      case 'sync-later':
        // Deliberately NOT behind the shield: it writes nothing, both saves survive either way, and
        // it is therefore the only one of the three that is safe to reach by accident.
        playSfx('click')
        hooks.sync?.resolveConflict('later')
        conflictShownAt = 0
        // At pairing, "later" almost always means "I aimed at the wrong row" — so go back to the
        // picker rather than dumping the player on the title with sixteen characters to retype.
        // In steady state there is nothing to go back to and it simply dismisses.
        if (syncCloud) { syncOpen = true; syncView = 'pick' }
        renderTitle()
        break
      // ---- the level preview's podium page ----
      // updateTitleBelow, not renderTitle: only the panel under the bookcase changes, and rebuilding
      // the shelf would throw away its scroll offset — the same reason the difficulty pips use the
      // surgical path.
      // Also the RETRY: the error state re-uses this action, so a failed board is one tap from
      // another attempt rather than two taps and two turns.
      case 'podium-open':
        podiumTurn = !podiumOpen // a retry redraws the page it is already on; it must not re-turn it
        podiumOpen = true
        loadPodium(browseChapterId, meta.chapters?.[browseChapterId]?.difficulty ?? 1)
        playSfx('click')
        updateTitleBelow()
        break
      case 'podium-close':
        podiumTurn = true
        podiumOpen = false
        playSfx('click')
        updateTitleBelow()
        break
      case 'brief-start': {
        // The booster picks are made on THIS screen (v6.7), so Start is what hands them over —
        // and clears them, exactly like the title's Play used to.
        const ids = [...selectedConsumables]
        selectedConsumables.clear()
        boostersOpen = false
        hooks.onBriefStart?.(ids)
        break
      }
      case 'brief-reroll': hooks.onBriefReroll?.(Number(el.dataset.i)); break
      case 'diff': {
        const d = Number(el.dataset.diff)
        if (d > selectedChapterMeta(meta).maxDifficulty) break // belt-and-braces: locked pips are disabled already
        hooks.onDifficulty(d)
        updateTitleBelow() // surgical: keep the carousel's scroll position (a full renderTitle would reset it)
        break
      }
      // The HUD's ⏸ is reachable during a level-up (styles.css lets taps outside that modal
      // fall through), so the build sheet answers "is this worth rerolling?". NOT while a pick is
      // in flight, though: leaving the screen clears the BLIND FAITH reveal timer and re-paints the
      // card row, so pausing during a reveal or SPECIALIST's chooser would hand back a pick the
      // player has already made — a second card for one level.
      case 'pause':
        if (active === 'levelup' && (lvRevealing || lvChoosing >= 0)) break
        playSfx('click'); hooks.onPauseToggle(); break
      case 'resume': playSfx('click'); hooks.onPauseToggle(); break
      // The hidden dev menu, opened from the HUD coin badge — and ONLY while the title's DEV toggle
      // is on. There used to be a second seven-tap burst here, independent of that toggle, and TWO
      // dev switches meant a run could be a dev run by one of them and a scoring run by the other:
      // DEV on to reach a WIP chapter still submitted to the public board (owner, 2026-08-19: "i've
      // done a run in dev, and it still recorded my high score?"). One switch now, and main.js
      // refuses to submit anything played under it. The badge is inert with DEV off, so the gesture
      // it used to need is gone with it.
      case 'dev-tap':
        if (!meta.dev) break
        playSfx('buy'); hooks.onDevOpen?.(); break
      case 'dev-close': playSfx('click'); hooks.onDevClose?.(); break
      // Opt-in element Codex (see renderCodex): opened from the title's ⚙ sheet or the pause build
      // sheet, data-from says which so Close can return to it — main.js resolves the destination
      // (it's the only module that knows whether a run exists to go back to).
      case 'codex-open': playSfx('click'); hooks.onCodexOpen?.(el.dataset.from || 'title'); break
      case 'codex-close': playSfx('click'); hooks.onCodexClose?.(el.dataset.from || 'title'); break
      // The WIP gate, on the TITLE wordmark. Seven taps flips meta.dev, which is what makes
      // work-in-progress chapters visible at all. renderTitle() repaints so the DEV pill appears
      // or vanishes on the same tap — a hidden flag with no tell is how WIP content reaches
      // players by accident. Same constants as 'dev-tap' above, separate counter (see wipTaps).
      case 'dev-tap-wip': {
        const now = performance.now()
        wipTaps = now - wipTapAt < DEV_TAP_WINDOW_MS ? wipTaps + 1 : 1
        wipTapAt = now
        if (wipTaps >= DEV_TAPS_TO_OPEN) {
          wipTaps = 0
          playSfx('buy')
          hooks.onDev?.(!meta.dev)   // persists; meta is the same object, so renderTitle reads it fresh
          renderTitle()
        }
        break
      }
      case 'build-toggle': {
        const key = el.dataset.key
        if (openBuild.has(key)) openBuild.delete(key)
        else openBuild.add(key)
        playSfx('click')
        if (lastPauseData) {
          renderPause(lastPauseData)
          // The re-render replaces the modal's DOM, so the row that was just activated no longer
          // exists and focus falls back to <body> — put it back on the row's replacement, or a
          // keyboard user loses their place in the list on every toggle.
          screens.pause.querySelector(`[data-act="build-toggle"][data-key="${CSS.escape(key)}"]`)?.focus()
        }
        break
      }
      case 'quit': playSfx('click'); hooks.onQuit(); break
      case 'skill': hooks.onSkill(); break
      case 'reroll': if (lvArmed() && !lvRevealing) hooks.onReroll(); break
      // Which half of the shop is on screen — coins, or upgrade levels. See shopTab.
      case 'shop-tab': {
        const tab = el.dataset.tab
        if (tab !== shopTab) {
          shopTab = tab
          playSfx('click')
          renderShop()
        }
        break
      }
      case 'sacrifice-start': {
        // The target comes from the ROW that was tapped, not from a cheapest-first guess: the
        // unlock list shows every target, so which one you meant is no longer ambiguous. Still
        // validated against sacTargets — a row can go stale between render and tap (bought in
        // another tab, the dev gate switched off under it). A stale id opens NOTHING rather than
        // falling through to activeTarget's list[0], which would silently start an offer toward a
        // different purchase than the one the player pressed.
        const wanted = sacTargets(shopBookId()).find((x) => x.id === el.dataset.id)
        if (!wanted) { renderShop(); break }
        sacrificeOpen = true
        sacrificePicks = {}
        sacrificeBounceId = null
        sacrificeTarget = wanted.id
        playSfx('click')
        renderShop()
        break
      }
      case 'sacrifice-cancel':
        sacrificeOpen = false
        sacrificePicks = {}
        sacrificeBounceId = null
        sacrificeTarget = null
        playSfx('click')
        renderShop()
        break
      case 'sacrifice-offer': {
        // whole-row tap: offer ONE more level of this stat onto the altar, capped at both the
        // stat's owned level and the sacrifice's total cost
        const id = el.dataset.id
        const bookId = shopBookId()
        // The ACTIVE target's cost, not the slot's — a BOOK_UNLOCKS rung and the next card slot
        // are priced apart, and reading the slot's number here would cap the altar at the wrong
        // total. Only 'slot' is reachable today; this stays right the day an unlock is added back.
        const cost = activeTarget(bookId)?.cost ?? null
        const have = sacrificePicks[id] ?? 0
        const bm = bookMeta(meta, bookId) ?? ensureBookMeta(meta, bookId)
        if (cost != null && sacrificeOffered() < cost && have < (bm.shop[id] ?? 0)) {
          sacrificePicks[id] = have + 1
          sacrificeBounceId = id
          playSfx('click')
          renderShop()
        }
        break
      }
      case 'sacrifice-unoffer': {
        // tap an altar chip: take ONE level back off the altar (drop the key at zero so no empty
        // chip lingers and picks stays clean for the onSacrifice contract)
        const id = el.dataset.id
        const have = sacrificePicks[id] ?? 0
        if (have > 0) {
          if (have - 1 === 0) delete sacrificePicks[id]
          else sacrificePicks[id] = have - 1
          sacrificeBounceId = id
          playSfx('click')
          renderShop()
        }
        break
      }
      case 'sacrifice-confirm': {
        // main.js plays the 'buy' sfx itself on success; nothing extra to do here either way.
        const target = activeTarget(shopBookId())
        if (target != null && sacrificeOffered() === target.cost) hooks.onSacrifice(sacrificePicks, target.id, shopBookId())
        sacrificeOpen = false
        sacrificePicks = {}
        sacrificeBounceId = null
        sacrificeTarget = null
        renderShop()
        break
      }
      // The sheet is opened, closed and rebuilt here; main.js owns the coins. It plays the 'buy'
      // sfx itself on a paid refund, same as onBuy — so these cases only click.
      case 'refund-start':
        refundOpen = true
        refundAllAsk = false
        playSfx('click')
        renderShop()
        break
      case 'refund-cancel':
        // A tap INSIDE the sheet bubbles to the backdrop; only the backdrop itself dismisses.
        if (el.classList.contains('modal-backdrop') && el !== e.target) break
        refundOpen = false
        refundAllAsk = false
        playSfx('click')
        renderShop()
        break
      case 'refund-line':
        // Stays open: refunding one line is rarely the whole errand, and the sheet rebuilds
        // without the row that just went to zero.
        if (!hooks.onRefund([el.dataset.id], shopBookId())) playSfx('click')
        renderShop()
        break
      case 'refund-all':
        refundAllAsk = true
        playSfx('click')
        renderShop()
        break
      case 'refund-all-confirm': {
        const bookId = shopBookId()
        const bm = bookMeta(meta, bookId) ?? ensureBookMeta(meta, bookId)
        hooks.onRefund(Object.keys(shopLines(bookId)).filter((id) => (bm.shop[id] ?? 0) > 0), bookId)
        refundOpen = false
        refundAllAsk = false
        renderShop()
        break
      }
      case 'reset-start':
        resetOpen = true
        playSfx('click')
        renderDev({})
        break
      case 'reset-cancel':
        if (el.classList.contains('modal-backdrop') && el !== e.target) break
        resetOpen = false
        playSfx('click')
        renderDev({})
        break
      case 'reset-confirm':
        playSfx('click')
        hooks.onReset()
        break
    }
  })

  // Escape/KeyP from input.js — only meaningful while in a run. 'levelup' included so the build
  // sheet is reachable mid-choice; same in-flight guard as the ⏸ button above, same reason.
  window.addEventListener('game-pause', () => {
    if (active === 'levelup' && (lvRevealing || lvChoosing >= 0)) return
    if (active === 'hud' || active === 'pause' || active === 'levelup') hooks.onPauseToggle()
  })

  showScreen('title')
  // forgetBoard is public because main.js owns the run and is therefore the only thing that knows a
  // board just changed. It is called when a submitted run PLACED — the title's leader line is drawn
  // from a session cache, so without it you beat the record, back out to the title, and it still
  // names whoever you just overtook for the rest of the session.
  // sync.js calls this through main.js whenever its state moves (a push ACKed, a conflict
  // arrived, a pull adopted). Only the title carries sync pixels, so anywhere else it is inert
  // rather than a re-render of a screen the player is mid-way through.
  function syncChanged() { if (active === 'title') renderTitle() }

  return { showScreen, updateHUD, activeScreen: () => active, setPodiumResult, forgetBoard, syncChanged }
}
