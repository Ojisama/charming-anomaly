// DOM overlay inside #ui: title, shop, HUD, level-up, pause, summary. No Pixi.
import { shopCost, shopLines, MAX_SHOP_LEVEL, RUN_DURATION, RARITIES, WEAPONS, WEAPON_MODS, PASSIVES, ELEMENTS, MUTATORS, CONSUMABLES, dailyMutators, todayKey, MAX_DIFFICULTY, DIFFICULTY_HP_PER_LEVEL, DIFFICULTY_DMG_PER_LEVEL, DIFFICULTY_COIN_PER_LEVEL, sacrificeCost, ANOMALY_REROLL_COST, CHAPTER_ENDINGS, CHAPTER_UNLOCK_LINES, CHAPTERS, CHAPTER_ORDER, nextChapter, dailyChapter, chapterMaxDifficulty, resolveChapterId, playableChapterId, chapterAvailable, titleBookshelf, spineName, chaosStatus, PULSE_CHARGE_COST, elementCodex, ELEMENT_CODEX_INTRO, STAT_KEYS, bookOf, BOOK_ORDER, BOOKS, BOOK_UNLOCKS, unlockCost, unlockLevel, unlockMax } from './config.js'
import { playSfx } from './audio.js'
import { t, tt, getLang, LANGS } from './i18n.js'
import { SAVE_SLOTS, activeSlot, slotSummary, NAME_MAX, bookMeta, ensureBookMeta } from './state.js'

// Chapter-card cast thumbnails, keyed by rosterId: './cast/tardigrade.png' -> 'tardigrade'.
// See the castArt note in initUI for where they come from and why they are files.
const CAST_ART = Object.fromEntries(
  Object.entries(import.meta.glob('./cast/*.png', { eager: true, query: '?url', import: 'default' }))
    .map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]),
)

const SCREEN_NAMES = ['title', 'shop', 'daily', 'brief', 'hud', 'levelup', 'pause', 'summary', 'dev', 'codex']
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
//     played stands proud of the row with a pink ribbon in it.
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
// modal's per-row "current -> after" preview. `reduction` lines (Slow Burn) store a POSITIVE
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
 *                       onSacrifice(picks, target, bookId)->bool, onReset(), onSlot(n) })
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
 *     - onPlay(mode): mode is 'classic' | 'daily'. 'classic' fires from the title
 *       Play button and from the summary "Play again" button (which replays whatever mode the
 *       just-ended run used). 'daily' fires from the daily briefing screen's Start button.
 *       It carries no boosters: since v6.7 classic boosters are picked one screen later, on the
 *       pre-run summary, and arrive via onBriefStart. Boosters never applied to daily runs at all.
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
 *       bm.choiceSlots)) or a BOOK_UNLOCKS[bookId] key, e.g. 'lightThief' for Book 2's Light Thief
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
 *   ui.showScreen('title' | 'shop' | 'daily' | 'hud' | 'levelup' | 'pause' | 'summary', data?)
 *     - 'levelup' data: { choices, rerollCost, rerollCurrency, coins, hp } — choices is
 *       run.levelUpChoices (run.choiceSlots cards, all shown); the rest drive the Reroll button.
 *       rerollCurrency is 'coins' or (under the BLOOD MONEY anomaly, v7.2) 'hp', and it decides
 *       both the label's icon and which wallet the disabled check reads. Both come from sim.js's
 *       rerollPrice, never computed here — see that function for why.
 *     - 'pause' data: { mutators: string[], mode: string, build: object }
 *       mutators = run.mutators (omit/empty for classic runs); mode = the run mode chip;
 *       build = buildReadout(run) — the pause sheet's weapon/passive/element/Rupture sections,
 *       and `build.anomalies` is what the Rupture section reads. See main.js's pause hook.
 *       It also opens ON TOP of a level-up — the build you already have is what "is this worth
 *       rerolling?" is asking about. onPauseToggle fires with the run still in the 'levelup'
 *       phase and Resume goes back to the same undealt cards, which is why main.js needs
 *       ui.activeScreen() to tell those two directions apart.
 *     - 'summary' data: { victory, time, kills, level, earned, bonus, mutators?, mode,
 *       nextDifficulty?, unlockedDifficulty?, unlockedChapter?, unlockedHiddenChapter? }
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
 *       .summary-unlock--hidden badge. All three can and do appear together. renderSummary itself
 *       resolves which chapter was just
 *       played (meta.chapter for classic, dailyChapter(todayKey()) for daily — the data object
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
    // The three MENU tabs share one room (.room-oak, styles.css). Gameplay screens must not
    // have it: the hud sits over the live canvas and an opaque background would hide the game.
    const ROOM = ['title', 'shop', 'daily']
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
  // cleared as soon as a run actually starts (see the 'play'/'daily-start' click cases below).
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

  // Volume heights, cycled by position so a shelf is not a bar chart but never reshuffles between
  // renders either. Offset per Book so two étages do not share a silhouette.
  // Kept within 6 points: the tallest name ('Undergrowth') has to fit the SHORTEST spine it can
  // land on, and a wider spread starves it.
  const VOL_H = [100, 96, 99, 94, 98, 95, 100, 97]

  // Printed on the page edges of a turned-around volume. Inline SVG, not the 🔒 emoji: a colour
  // emoji on a page edge reads as a sticker stuck to the book rather than as fore-edge printing.
  const LOCK_SVG = '<svg class="vol-lock" viewBox="0 0 24 24" aria-hidden="true">'
    + '<path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'
    + '<rect x="4" y="10.5" width="16" height="11" rx="2.6" fill="currentColor"/></svg>'

  // One volume. A locked one is still a BUTTON and still selectable — tapping it puts its unlock
  // condition in the detail panel, which is what the old locked "???" hero card did. It carries no
  // name and no icon, so selecting it reveals nothing the shelf was hiding.
  function volHtml(vol, i, off) {
    const sel = vol.id === browseChapterId
    const h = VOL_H[(i + off) % VOL_H.length]
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
        <i class="vol-band" aria-hidden="true"></i>
        <span class="vol-ico" aria-hidden="true">${chapter.icon}</span>
        <span class="vol-nm">${t(spineName(vol.id))}</span>
        <span class="vol-stars" aria-hidden="true">${stars}</span>
        <i class="vol-band" aria-hidden="true"></i>
      </button>`
  }

  // One étage: its row of volumes and the board they stand on, with the Book's brass plate.
  // The plate is a LABEL, not a control — nothing on the shelf is tappable except a volume.
  function etageHtml(shelf, n, i) {
    const row = shelf.started
      ? shelf.volumes.map((v, k) => volHtml(v, k, i * 3)).join('')
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
  }

  function bookcaseHtml() {
    return `<div class="bookcase">${titleBookshelf(meta).map((s, i) => etageHtml(s, i + 1, i)).join('')}</div>`
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

  // Fixed bottom nav, shared by every menu screen (v5.2): Shop | Battle | Daily. `active` is one of
  // 'shop' | 'battle' | 'daily' — that tab renders highlighted + inert (see switchTab). The Daily
  // tab badges today's dailyChapter icon.
  function navHtml(active) {
    const dailyIcon = CHAPTERS[dailyChapter(todayKey())]?.icon ?? '🌀'
    const tab = (act, icon, label, extra = '') => {
      const on = active === act
      return `<button class="nav-tab${on ? ' nav-tab--active' : ''}" data-act="${act}"${on ? ' aria-current="page"' : ''}>
          <span class="nav-tab-icon">${icon}${extra}</span><span class="nav-tab-label">${label}</span>
        </button>`
    }
    return `
      <nav class="menu-nav">
        ${tab('shop', '🛒', t('Shop'))}
        ${tab('battle', '⚔️', t('Battle'))}
        ${tab('daily', '🌀', t('Daily'), `<sup class="nav-tab-badge">${dailyIcon}</sup>`)}
      </nav>`
  }

  // Everything BELOW the carousel: the difficulty row + hint + booster slots (unlocked chapters
  // only) and the Play button. Split out so scroll-driven selection can rebuild JUST this part
  // (via updateTitleBelow) without touching the carousel node and resetting its scroll position.
  // v5.24: blank's ladder has no random anomalies — instead each level names its cumulative
  // CHAPTERS.blank.modsByDifficulty entries (MUTATORS[id].name), same +HP/+coins tail as everyone
  // else. Level 1 is always 'the base game' below, same as any chapter, since modsByDifficulty[1]
  // is empty.
  function diffHintLead(id, level) {
    if (id === 'blank') {
      return (CHAPTERS.blank.modsByDifficulty[level] ?? []).map((mid) => t(MUTATORS[mid]?.name ?? mid)).join(' + ')
    }
    return level === 2 ? t('+1 random anomaly') : tt('+{n} random anomalies', { n: level - 1 })
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

  function titleBelowHtml() {
    const heroUnlocked = chapterAvailable(meta, browseChapterId)
    const chMeta = meta.chapters?.[browseChapterId] ?? { maxDifficulty: 1, difficulty: 1 }
    const cap = chapterMaxDifficulty(browseChapterId)
    const playBlock = heroUnlocked ? `
      <div class="diff-row">
        <span class="diff-label">${t('Difficulty')}</span>
        ${Array.from({ length: cap }, (_, i) => {
          const d = i + 1
          if (d > chMeta.maxDifficulty) return `<button class="diff-pip diff-pip--locked" data-act="diff" data-diff="${d}" disabled>🔒</button>`
          return `<button class="diff-pip${d <= chMeta.difficulty ? ' diff-pip--on' : ''}" data-act="diff" data-diff="${d}">${d}</button>`
        }).join('')}
      </div>
      <p class="diff-hint">${chMeta.difficulty === 1
        ? t('the base game')
        : `${diffHintLead(browseChapterId, chMeta.difficulty)} · +${Math.round(((chMeta.difficulty - 1) * DIFFICULTY_HP_PER_LEVEL) * 100)}% ${t('enemy HP')} · +${Math.round(((chMeta.difficulty - 1) * DIFFICULTY_DMG_PER_LEVEL) * 100)}% ${t('enemy damage')} · <b class="diff-hint-reward">+${Math.round(((chMeta.difficulty - 1) * DIFFICULTY_COIN_PER_LEVEL) * 100)}% ${t('coins')}</b>`}</p>
      ${chMeta.maxDifficulty < cap ? `<p class="diff-hint diff-hint--locked">${tt('win level {n} to unlock {m}', { n: chMeta.maxDifficulty, m: chMeta.maxDifficulty + 1 })}</p>` : ''}` : ''
    return `
      ${detailHeadHtml()}
      ${playBlock}
      <button class="btn btn--big btn--play" data-act="play" ${heroUnlocked ? '' : 'disabled'}>▶&nbsp; ${t('Play')}</button>`
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
    // The badge reads the BROWSED book's purse (shopBookId — same resolution the shop and onBuy
    // use), not always meta.coins: once a Book 2 chapter is a browsable preview card, showing
    // book 1's coins here while Play/onBuy spend book 2's would be silently wrong.
    const titleBm = bookMeta(meta, shopBookId()) ?? ensureBookMeta(meta, shopBookId())
    setHtml(screens.title, `
      <header class="title-bar">
        <button class="pill-btn" data-act="settings" aria-label="${t('Settings')}">⚙</button>
        <h1 class="title-logo"><span>Charming</span> <span>Anomaly</span></h1>
        ${meta.dev ? '<span class="dev-pill">DEV</span>' : ''}
        <!-- data-act="dev-tap-wip": seven quick taps toggle the WIP gate (meta.dev), which is what
             reveals work-in-progress chapters. Same gesture as the HUD badge's hidden dev menu and
             the same two constants, but its own counter and its own case — see 'dev-tap-wip'. -->
        <div class="coins-badge" data-act="dev-tap-wip">🪙 <b>${titleBm.coins}</b></div>
      </header>
      ${bookcaseHtml()}
      <div class="title-below">${titleBelowHtml()}</div>
      ${navHtml('battle')}
      ${settingsSheetHtml()}
      ${slotsModalHtml()}
      ${renameSheetHtml()}
    `)
    paintRoom()
    // After the wholesale innerHTML rewrite, never before it.
    focusRenameField()
  }

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
          <button class="btn btn--soft btn--small settings-slots" data-act="slots">💾 ${t('Save slots')} <i>${activeSlot()}/${SAVE_SLOTS}</i></button>
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

  // Restores what the wholesale innerHTML rewrite just destroyed. Caret to the end rather than a
  // preserved offset: the only thing that re-renders mid-rename is a full sheet redraw, after which
  // "carry on typing" is the right place to be.
  function focusRenameField() {
    if (renameSlot == null) return
    const el = screens.title.querySelector('#rename-field')
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
  // Reset-all-progress confirmation: a backdrop + a small confirm/cancel sheet. Still a modal (a
  // destructive yes/no genuinely wants to block), unlike the sacrifice list which is a view now.
  let resetOpen = false

  function sacrificeOffered() {
    return Object.values(sacrificePicks).reduce((sum, n) => sum + n, 0)
  }

  // What a sacrifice can BUY (v7.x): the book's OWN BOOK_UNLOCKS entries (Light Thief today, more
  // later) plus the universal next level-up card slot. The emitted `id` is the BOOK_UNLOCKS key
  // itself (e.g. 'lightThief'), not a UI-invented label — a hand-rolled id here ('thief') is
  // exactly the bug that made Light Thief unpurchasable: onSacrifice resolves a non-'slot' target
  // via BOOK_UNLOCKS[bookId]?.[target]?.cost, so a mismatched id resolves to a null cost and the
  // purchase can never succeed. The already-bought gate reads bm.unlocks?.[id], not a Book
  // 1-shaped meta.lightThief, for the same reason.
  //
  // No meta.dev gate here — that job now belongs to reachability. An Undertow target only ever
  // appears when bookId is 'undertow', which only happens when the title carousel is browsing an
  // Undertow chapter, which requires the book unlocked, which requires meta.dev while the book is
  // wip (see unlockBook, state.js). With the book locked, sacTargets(bookId) simply has no
  // BOOK_UNLOCKS[bookId] to iterate, so book 1 is byte-identical to before.
  //
  // Cheapest first, which is also the order the toggles appear in the view: Light Thief's first
  // rung is 5 against the 3rd slot's 20 (see LIGHT_THIEF_COSTS in config.js), so it reads first.
  function sacTargets(bookId) {
    const bm = bookMeta(meta, bookId) ?? ensureBookMeta(meta, bookId)
    const out = []
    for (const [id, u] of Object.entries(BOOK_UNLOCKS[bookId] ?? {})) {
      // The NEXT rung's price, and null once the ladder is finished — which is also the
      // already-bought gate, so a maxed unlock drops out of the list without a second test.
      const cost = unlockCost(bookId, id, unlockLevel(bm, bookId, id))
      if (cost == null) continue
      const lv = unlockLevel(bm, bookId, id), max = unlockMax(bookId, id)
      // The name carries the rung once there is more than one, so the sacrifice screen says which
      // level you are buying rather than offering the same row three times over.
      const label = max > 1 ? `${t(u.name)} ${lv + 1}/${max}` : t(u.name)
      out.push({ id, cost, icon: u.icon, label, short: label, desc: tt(u.desc, { cost }) })
    }
    const slots = bm.choiceSlots ?? 2
    const slotCost = sacrificeCost(slots)
    if (slotCost != null) {
      const nth = slots === 2 ? t('3rd') : t('4th')
      out.push({
        // `short` is what the target STRIP shows, and it exists because `label` does not fit there:
        // the strip splits 288px between two buttons at 320px, and "3rd upgrade slot" ellipsized to
        // "3rd upgrad...". The pill on the shop screen has the full row to itself and keeps `label`.
        id: 'slot', cost: slotCost, icon: '🩸', label: tt('{nth} upgrade slot', { nth }), short: tt('{nth} slot', { nth }),
        desc: tt('Unlock the {nth} upgrade slot — sacrifice {cost} upgrade levels (no coin refund).', { nth, cost: slotCost }),
      })
    }
    return out.sort((a, b) => a.cost - b.cost) // cheapest first, as today
  }
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
  // reset link shares the same row as a 🗑 square. Both live in .shop-foot, a fixed-height flex
  // row, which is what lets .shop-rows own every remaining pixel (see styles.css).
  function shopFootHtml(bookId, slots, cost) {
    const bm = bookMeta(meta, bookId) ?? ensureBookMeta(meta, bookId)
    const owned = Object.values(bm.shop).reduce((sum, l) => sum + l, 0)
    // ONE pill, still — the target choice lives inside the view it opens, not out here. .shop-foot
    // is a fixed-height flex row that already shares its width with the reset square, and a second
    // pill is exactly the kind of thing that fits at 390px and overflows at 320. The pill tracks
    // the CHEAPEST available target so it lights up as early as anything is affordable.
    const targets = sacTargets(bookId)
    const cheapest = targets[0] ?? null
    let sac
    if (!cheapest) {
      sac = `<div class="shop-sac shop-sac--done">🩸 ${t('All 4 upgrade slots unlocked.')}</div>`
    } else {
      const afford = owned >= cheapest.cost
      const pct = Math.min(100, Math.round((owned / cheapest.cost) * 100))
      // The fraction is progress toward the requirement, not an inventory count — so it reads
      // "20/20" once you qualify, never "21/20". (The modal shows what you actually own.)
      const have = Math.min(owned, cheapest.cost)
      const cost = cheapest.cost
      sac = `
        <button class="shop-sac${afford ? ' shop-sac--ready' : ''}" data-act="sacrifice-start" ${afford ? '' : 'disabled'}>
          <span class="shop-sac-label">${cheapest.icon} ${cheapest.label}</span>
          <span class="shop-sac-track">
            <span class="shop-sac-meter"><i style="width:${pct}%"></i></span>
            <span class="shop-sac-count">${have}/${cost}</span>
          </span>
        </button>`
    }
    return `
      <div class="shop-foot">
        ${sac}
        <button class="reset-link" data-act="reset-start" aria-label="${t('Reset all progress')}" title="${t('Reset all progress')}">🗑</button>
      </div>`
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
    const rows = Object.entries(lines).filter(([id]) => (bm.shop[id] ?? 0) > 0).map(([id, item]) => {
      const level = bm.shop[id]
      const picked = sacrificePicks[id] ?? 0
      const kept = level - picked
      const canOffer = picked < level && !full
      const notches = Array.from({ length: MAX_SHOP_LEVEL }, (_, i) => {
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
            <span class="shop-row-icon">${item.icon}</span>
            <span class="shop-row-effect">${mid}</span>
            <button class="sac-btn sac-btn--offer" data-act="sacrifice-offer" data-id="${id}" ${canOffer ? '' : 'disabled'}
                    aria-label="${t('Offer')} — ${t(item.name)}">🩸<b>+</b></button>
            <button class="sac-btn sac-btn--undo" data-act="sacrifice-unoffer" data-id="${id}" ${picked > 0 ? '' : 'disabled'}
                    aria-label="${t('Undo')} — ${t(item.name)}">↺</button>
          </span>
          <span class="shop-rail">${notches}</span>
        </div>`
    }).join('')

    // v7.x: the target toggles. Rendered ONLY when there is a real choice — with one target this
    // strip is a row of one button that does nothing, which is worse than no strip, and one target
    // is what every non-dev save has. Switching target clears the altar (see the handler): the
    // costs differ, so carrying an offer across would silently leave you over or under.
    const targets = sacTargets(bookId)
    const targetStrip = targets.length < 2 ? '' : `
      <div class="sac-targets">
        ${targets.map((x) => `
          <button class="sac-target${x.id === target.id ? ' sac-target--on' : ''}" data-act="sacrifice-target" data-id="${x.id}">
            <span class="sac-target-label">${x.icon} ${x.short ?? x.label}</span>
            <span class="sac-target-cost">${x.cost}</span>
          </button>`).join('')}
      </div>`

    // v6.6: the "what does this buy me" line lives here now — the shop screen no longer carries a
    // standing panel to hold it (see shopFootHtml). v7.x: it is the target's own copy.
    return `
      <header class="shop-head shop-head--sac">
        <span class="sacrifice-counter${ready ? ' sacrifice-counter--ready' : ''}" style="color:${counterColor}">🩸 ${tt('Offered {offered}/{cost}', { offered, cost })}</span>
      </header>
      ${targetStrip}
      <p class="sacrifice-desc">${target.desc}</p>
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

  function renderShop(bounceId) {
    const bookId = shopBookId()
    const bm = bookMeta(meta, bookId) ?? ensureBookMeta(meta, bookId)
    const slots = bm.choiceSlots ?? 2
    const cost = sacrificeCost(slots)
    // v7.x: gated on a TARGET existing rather than on the slot cost alone — with all 4 slots
    // unlocked, sacrificeCost is null while Light Thief may still be buyable.
    const target = activeTarget(bookId)
    // The sacrifice list takes over the shop screen rather than floating above it (see
    // sacrificeViewHtml). --sac drops the bottom-nav padding reservation, since the nav is not
    // rendered while a Cancel/Confirm flow is up.
    screens.shop.classList.toggle('screen--sac', sacrificeOpen && target != null)
    if (sacrificeOpen && target != null) {
      setHtml(screens.shop, sacrificeViewHtml(target, bookId))
      return
    }
    // v6.6 card: the NAME is gone from the face. A purchase turns on the effect and the price —
    // "Power Gel" is flavour the player already knows by icon after one session, and it was
    // costing the biggest type on the card plus a whole line. The effect takes that slot, and the
    // name survives in aria-label so screen readers and the sacrifice list still speak it.
    // v6.6.2 (owner picked this shape over the two-column cards): ONE COLUMN of rows (eight for
    // book 1, more for a book with its own lines — see shopLines). A full-width row is what lets
    // the effect sit on a single line and never ellipsize, in either language — horizontal room is
    // the scarce axis at 320px, and every previous attempt lost labels to a meter competing for
    // the same line. So the meter is not on the line: ten discrete notches ride the row's bottom
    // edge, and reading down the column shows the whole build at once. The price is an explicit
    // gold "buy" chip rather than a bare number.
    const cards = Object.entries(shopLines(bookId)).map(([id, item]) => {
      const level = bm.shop[id] ?? 0
      const maxed = level >= MAX_SHOP_LEVEL
      const buyCost = maxed ? 0 : shopCost(id, level)
      const afford = !maxed && bm.coins >= buyCost
      const notches = Array.from({ length: MAX_SHOP_LEVEL },
        (_, i) => `<i class="notch${i < level ? ' notch--on' : ''}"></i>`).join('')
      const label = `${t(item.name)} — ${t(item.desc)} · ${level}/${MAX_SHOP_LEVEL} · ${maxed ? 'MAX' : `🪙 ${buyCost}`}`
      return `
        <!-- maxed is NOT disabled-looking: a finished upgrade is an achievement, not a dead
             control. It gets the gold treatment instead of the grey one (onBuy already no-ops on
             a maxed id, so the tap is safe). Only unaffordable rows fade. -->
        <button class="card shop-row${afford || maxed ? '' : ' card--disabled'}${maxed ? ' shop-row--maxed' : ''}${id === bounceId ? ' card--bounce' : ''}"
                data-buy="${id}" aria-label="${label}">
          <!-- v6.0.2: layout lives on an inner span, NOT the button — iOS Safari doesn't reliably
               grow a flex <button> around its content. The button is a plain block. -->
          <span class="shop-row-in">
            <span class="shop-row-icon">${item.icon}</span>
            <span class="shop-row-effect">${t(item.desc)}</span>
            <span class="shop-row-buy">${maxed ? 'MAX' : tt('buy : 🪙 {n}', { n: buyCost })}</span>
          </span>
          <span class="shop-rail">${notches}</span>
        </button>`
    }).join('')
    // Nav (below) replaces the old "← Back" header. The book name sits beside the balance, or a
    // returning player who just browsed into a book with its own (freshly reset) purse reads the
    // lower number as a bug rather than as "this is a different book's coins".
    setHtml(screens.shop, `
      <header class="shop-head">
        <span class="shop-balance">🪙 <b>${bm.coins}</b></span>
        <span class="shop-book">${t(BOOKS[bookId].name)}</span>
      </header>
      <div class="shop-rows">${cards}</div>
      ${shopFootHtml(bookId, slots, cost)}
      ${navHtml('shop')}
      ${resetModalHtml()}
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
        <!-- data-act="dev-tap": seven quick taps open the hidden dev menu (see the 'dev-tap' click
             case). The badge is otherwise inert, and styles.css has to give it pointer-events:auto
             — the whole HUD is pointer-events:none so it cannot eat gameplay touches. -->
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
    chargeShown: undefined, chargeNum: -1, chargeArmed: undefined, chargeLaneX: undefined,
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
    if (res) paintCharge(run.charge, run.chargeMax ?? res.max)
  }

  // The RESOURCE rail's per-frame paint, modelled on paintChaos below — refs looked up once (the
  // HUD markup is written exactly once at boot, so they cannot go stale) and every text write
  // guarded by a cache, because the textContent write is the expensive half of a per-frame readout.
  let chargeRefs = null
  function paintCharge(charge, max) {
    if (!chargeRefs) {
      const q = (sel) => hud.chargeWrap.querySelector(sel)
      chargeRefs = { text: q('[data-charge-text]'), fill: q('[data-charge-fill]') }
    }
    const frac = max > 0 ? Math.max(0, Math.min(1, charge / max)) : 0
    chargeRefs.fill.style.height = `${frac * 100}%`
    // Two readouts from one bar, because the quantity alone does not answer the only question the
    // player actually asks: the NUMBER is how much light is left, and the ARMED state is whether
    // the next press is a full-strength Pulse or the floor shove. A player reading only the height
    // cannot tell where the threshold is, and PULSE_CHARGE_COST is not a round fraction of max.
    const armed = charge >= PULSE_CHARGE_COST
    if (armed !== last.chargeArmed) {
      last.chargeArmed = armed
      hud.chargeWrap.classList.toggle('charge--armed', armed)
    }
    const n = Math.round(charge)
    if (n !== last.chargeNum) { last.chargeNum = n; chargeRefs.text.textContent = `${n}` }
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

  // ---- daily briefing (shown before a daily run starts) ---------------------
  // Human labels for MUTATORS effect keys + whether a value above 1 helps the player
  // (drives the green/red chip color; a nerf direction shows red).
  const EFFECT_LABELS = {
    spawnMul: ['enemy spawns', false],
    enemyHpMul: ['enemy HP', false],
    enemySpeedMul: ['enemy speed', false],
    enemyDmgMul: ['enemy damage', false],
    enemyRadiusMul: ['enemy size', false],
    contactDmgTakenMul: ['damage you take', false],
    playerDmgMul: ['your damage', true],
    playerSpeedMul: ['your move speed', true],
    coinMul: ['coins', true],
    xpMul: ['XP', true],
    eliteEveryMul: ['time between elites', true],
    elementWeightMul: ['infusion card chance', true],
    magnetMul: ['pickup magnet', true],
    // v5.25 chapter-anomaly knobs (missing until v6.1 — the chips showed the raw key)
    currentForceMul: ['current push', false],
    pheromoneLifeMul: ['pheromone life', false],
    trapCountMul: ['trap count', false],
    trafficIntervalMul: ['time between cars', true],
    bombardIntervalMul: ['time between shells', true],
    wellForceMul: ['gravity well force', false],
    acidPotencyMul: ['acid pool burn', false],
  }

  // One chip per effect key, tagged with whether it helps the player — the brief screen needs the
  // split (costs on one side of the trade, gains on the other), everything else just joins it.
  function effectChipList(effects) {
    return Object.entries(effects).map(([key, v]) => {
      const [label, goodUp] = EFFECT_LABELS[key] ?? [key, true]
      const pct = Math.round((v - 1) * 100)
      const good = (pct > 0) === goodUp
      return { good, html: `<span class="fx-chip ${good ? 'fx-chip--good' : 'fx-chip--bad'}">${pct > 0 ? '+' : ''}${pct}% ${t(label)}</span>` }
    })
  }

  function effectChips(effects) {
    return effectChipList(effects).map((c) => c.html).join('')
  }

  // One anomaly explainer card (icon + name + desc + effect chips) — the daily briefing's own
  // card. The daily never offers a reroll (one shared seed for everyone; a paid swap would break
  // the whole premise), and the classic brief draws its own compact row — see briefAnomHtml.
  function mutatorCardHtml(id) {
    const m = MUTATORS[id]
    return `
      <div class="daily-mutator">
        <span class="daily-mutator-icon">${m?.icon ?? '❔'}</span>
        <span class="daily-mutator-body">
          <span class="daily-mutator-name">${t(m?.name ?? id)}</span>
          <span class="daily-mutator-desc">${t(m?.desc ?? '')}</span>
          <span class="daily-mutator-fx">${m ? effectChips(m.effects ?? {}) : ''}</span>
        </span>
      </div>`
  }

  function renderDaily() {
    const chId = dailyChapter(todayKey())
    const ids = dailyMutators(todayKey(), chId) // chapter-scoped pool — must match main.js's roll
    const chapter = CHAPTERS[chId]
    const isPreview = !chapterAvailable(meta, chId)
    setHtml(screens.daily, `
      <div class="modal daily-brief" data-pop="daily">
        <h2 class="modal-title">🌀 ${t('Daily Anomaly')}</h2>
        <p class="daily-date">${todayKey()}</p>
        <div class="daily-chapter">
          <span class="daily-chapter-icon">${chapter.icon}</span>
          <span class="daily-chapter-name">${t(chapter.name)}</span>
          ${isPreview ? `<span class="daily-chapter-preview">${t('preview')}</span>` : ''}
        </div>
        ${ids.map((id) => mutatorCardHtml(id)).join('')}
        <p class="daily-note">${t('Everyone gets the same anomaly today — new one at midnight.')}</p>
        <button class="btn btn--big" data-act="daily-start">▶&nbsp; ${t('Start Daily Run')}</button>
      </div>
      ${navHtml('daily')}
    `)
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
      <div class="modal daily-brief brief" data-pop="brief">
        <div class="brief-head">
          <div class="brief-headtext">
            <h2 class="brief-title">${chapter.icon} ${t(chapter.name)}</h2>
            <div class="brief-diff">${t('difficulty')} <b>${d.difficulty ?? 1}</b></div>
          </div>
          <div class="coins-badge">🪙 <b>${briefBm.coins}</b></div>
        </div>
        ${ids.length ? `
          ${eyebrow('Anomalies', reroll ? tt('reroll {n}', { n: ANOMALY_REROLL_COST }) : '')}
          <div class="brief-anoms">${ids.map((id, i) => briefAnomHtml(id, i, reroll)).join('')}</div>
          ${d.chapterId === 'blank' ? `<p class="daily-note">${t('The Blank\'s ladder is fixed — each difficulty adds its named modifier.')}</p>` : ''}
        ` : `<p class="daily-note">${t('the base game')}</p>`}
        ${eyebrow('Boosters', t('this run only'))}
        ${boosterSlotsHtml()}
        <button class="btn btn--big" data-act="brief-start">▶&nbsp; ${t('Start')}</button>
      </div>
      ${navHtml('battle')}
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
        <div class="pause-mutators-head">🌀 ${d.mode === 'daily' ? t('Daily Anomaly') : t('Anomalies')}</div>
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
  let devTaps = 0
  let devTapAt = 0
  // The TITLE badge's seven-tap counter, deliberately NOT the pair above. Sharing one counter would
  // let taps on two different badges add up, so a burst split across the title and the HUD could
  // half-arm either gesture — and these two do very different things (this one toggles a persisted
  // flag, that one opens a throwaway screen). Two counters, no interaction.
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

  function renderDev(d) {
    devList = d.cards ?? []
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
        <button class="btn btn--big" data-act="dev-close">▶&nbsp; Resume</button>
      </div>
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

  // ---- summary modal -------------------------------------------------------
  function renderSummary(d) {
    const mutatorIds = d.mutators || []
    // The data object doesn't carry which chapter was played (see the header contract above) —
    // reconstruct it: classic runs play whatever's currently selected (meta.chapter can't have
    // changed mid-run, the chapter row only lives on the title screen); daily runs play the
    // date-seeded chapter, recomputed the same way the daily briefing screen does.
    const chapterId = d.mode === 'daily' ? dailyChapter(todayKey()) : meta.chapter
    const chapter = CHAPTERS[chapterId] ?? CHAPTERS[CHAPTER_ORDER[0]]
    const mutatorBlock = mutatorIds.length ? `
      <div class="summary-mutators">
        <div class="summary-mutators-head">🌀 ${d.mode === 'daily' ? t('Daily Anomaly') : t('Anomalies')}</div>
        ${mutatorIds.map((id) => `<div class="summary-mutator-line">${MUTATORS[id]?.icon ?? '❔'} ${t(MUTATORS[id]?.name ?? id)}</div>`).join('')}
      </div>` : ''
    setHtml(screens.summary, `
      <div class="modal" data-pop="summary">
        <h2 class="modal-title">${d.victory
          ? t(CHAPTER_ENDINGS[chapterId]?.victory ?? 'You escaped! 🎉')
          : t(CHAPTER_ENDINGS[chapterId]?.death ?? 'Squished… 💦')}</h2>
        <p class="summary-chapter">${chapter.icon} ${t(chapter.name)}</p>
        <div class="stats">
          <div class="stat-row"><span>${t('Time')}</span><b>${fmtTime(d.time)}</b></div>
          <div class="stat-row"><span>${t('Kills')}</span><b>${d.kills}</b></div>
          <div class="stat-row"><span>${t('Level reached')}</span><b>${d.level}</b></div>
        </div>
        ${mutatorBlock}
        ${typeof d.unlockedDifficulty === 'number' ? `<div class="summary-unlock">🔓 ${tt('Difficulty {d} unlocked!', { d: d.unlockedDifficulty })}</div>` : ''}
        ${d.unlockedChapter ? `<div class="summary-unlock summary-unlock--chapter">🔓 ${CHAPTER_UNLOCK_LINES[d.unlockedChapterId]
          ? t(CHAPTER_UNLOCK_LINES[d.unlockedChapterId])
          : tt('Chapter unlocked: {name}!', { name: t(d.unlockedChapter) })}</div>` : ''}
        ${d.unlockedHiddenChapter ? `<div class="summary-unlock summary-unlock--hidden">⬜ ${t('THE BLANK — the antibody that let you go wants you back')}</div>` : ''}
        <div class="earned">🪙 +${d.earned}
          ${d.bonus > 0 ? `<span class="earned-bonus">+${d.bonus} ${t('finish bonus')}</span>` : ''}
        </div>
        <button class="btn btn--big" data-act="play" data-mode="${d.mode ?? 'classic'}">▶&nbsp; ${d.nextDifficulty ? t('Next level') : t('Play again')}</button>
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
    if (name === 'title') renderTitle()
    else if (name === 'shop') renderShop()
    else if (name === 'daily') renderDaily()
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

  // Persistent bottom-nav tab switch (v5.2). `target` is the destination SCREEN ('title' | 'shop' |
  // 'daily'); a tap on the tab already showing is inert. Leaving the shop resets its transient
  // modal state (sacrifice / reset) — the cleanup the old '← Back' case used to own.
  function resetShopModals() {
    sacrificeOpen = false
    sacrificePicks = {}
    sacrificeBounceId = null
    sacrificeTarget = null
    resetOpen = false
  }
  function switchTab(target) {
    if (active === target) return
    if (active === 'shop') resetShopModals()
    if (active === 'title') { slotsOpen = false; settingsOpen = false } // don't strand a sheet open on return
    if (active === 'brief') boostersOpen = false // v6.7: same, for the booster sheet that lives there now
    playSfx('click')
    showScreen(target)
  }

  // v6.6.12: the text-field pair that keeps a value alive across renderTitle()'s wholesale innerHTML
  // rewrite. Delegated, so it survives the field being destroyed and recreated on every re-render.
  root.addEventListener('input', (e) => {
    if (e.target.id === 'rename-field') renameDraft = e.target.value
    // Repaint the LIST only, never the modal: rewriting screens.dev.innerHTML on every keystroke
    // would destroy the field being typed into and drop focus after one character.
    else if (e.target.id === 'dev-filter') { devFilter = e.target.value; paintDevList() }
  })
  root.addEventListener('keydown', (e) => {
    if (e.target.id !== 'rename-field') return
    // Enter commits and Escape cancels, because a soft keyboard's "done" key is the only obvious
    // exit once it covers the buttons — which on iOS it does, since the sheet is centred in a
    // position:fixed backdrop and the visual viewport shrinks under it without moving the layout.
    if (e.key === 'Enter') { e.preventDefault(); root.querySelector('[data-act="rename-save"]')?.click() }
    else if (e.key === 'Escape') { e.preventDefault(); root.querySelector('[data-act="rename-cancel"]')?.click() }
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
    const el = e.target.closest('[data-act], [data-buy], [data-choose], [data-consumable], [data-subject], [data-dev], [data-vol]')
    if (!el) return
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
      // Unlocked + a real change persists via onChapter (which plays 'click' itself); a locked
      // volume only browses, so click here instead. Then re-render the whole title: the shelf has
      // to redraw to move the selection ring and the ribbon.
      if (chapterAvailable(meta, id) && id !== meta.chapter) hooks.onChapter(id)
      else playSfx('click')
      renderTitle()
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
        const mode = el.dataset.mode || 'classic'
        selectedConsumables.clear()
        boostersOpen = false
        slotsOpen = false // keyboard focus can reach Play behind a backdrop — don't strand the modal open on return
        settingsOpen = false
        hooks.onPlay(mode)
        break
      }
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
      // Persistent bottom nav (v5.2): 'battle' → title, 'shop' → shop, 'daily' → daily. A tap on
      // the current tab is inert. See switchTab (leaving the shop resets its modal state).
      case 'battle': switchTab('title'); break
      case 'shop': switchTab('shop'); break
      case 'daily': switchTab('daily'); break
      case 'daily-start': selectedConsumables.clear(); hooks.onPlay('daily'); break
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
      // Hidden dev menu: seven taps on the HUD coin badge. Seven because the badge sits next to the
      // pause button on a phone, and anything shorter would open on a fat-fingered miss. The count
      // resets after a second of quiet, so it takes a deliberate burst rather than seven taps
      // spread across a run.
      case 'dev-tap': {
        const now = performance.now()
        devTaps = now - devTapAt < DEV_TAP_WINDOW_MS ? devTaps + 1 : 1
        devTapAt = now
        if (devTaps >= DEV_TAPS_TO_OPEN) { devTaps = 0; playSfx('buy'); hooks.onDevOpen?.() }
        break
      }
      case 'dev-close': playSfx('click'); hooks.onDevClose?.(); break
      // Opt-in element Codex (see renderCodex): opened from the title's ⚙ sheet or the pause build
      // sheet, data-from says which so Close can return to it — main.js resolves the destination
      // (it's the only module that knows whether a run exists to go back to).
      case 'codex-open': playSfx('click'); hooks.onCodexOpen?.(el.dataset.from || 'title'); break
      case 'codex-close': playSfx('click'); hooks.onCodexClose?.(el.dataset.from || 'title'); break
      // The WIP gate, on the TITLE coin badge. Seven taps flips meta.dev, which is what makes
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
      case 'sacrifice-start':
        sacrificeOpen = true
        sacrificePicks = {}
        sacrificeBounceId = null
        // Open on the CHEAPEST target, matching the pill the player just tapped (shopFootHtml
        // labels itself with that same target) rather than whatever was selected last session.
        sacrificeTarget = sacTargets(shopBookId())[0]?.id ?? null
        playSfx('click')
        renderShop()
        break
      case 'sacrifice-target': {
        // Switching what you are buying CLEARS the altar. The targets cost different numbers of
        // levels, so carrying an offer across would leave you silently over the new cost (confirm
        // stays dead, with no visible reason) or under it.
        const id = el.dataset.id
        if (id !== sacrificeTarget) {
          sacrificeTarget = id
          sacrificePicks = {}
          sacrificeBounceId = null
          playSfx('click')
          renderShop()
        }
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
        // The ACTIVE target's cost, not the slot's — Light Thief costs 15 where the 3rd slot costs
        // 20, and reading the slot's number here would cap the altar at the wrong total.
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
      case 'reset-start':
        resetOpen = true
        playSfx('click')
        renderShop()
        break
      case 'reset-cancel':
        if (el.classList.contains('modal-backdrop') && el !== e.target) break
        resetOpen = false
        playSfx('click')
        renderShop()
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
  return { showScreen, updateHUD, activeScreen: () => active }
}
