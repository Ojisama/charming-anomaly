// DOM overlay inside #ui: title, shop, HUD, level-up, pause, summary. No Pixi.
import { SHOP, shopCost, MAX_SHOP_LEVEL, RUN_DURATION, RARITIES, WEAPONS, ELEMENTS, MUTATORS, CONSUMABLES, dailyMutators, todayKey, MAX_DIFFICULTY, DIFFICULTY_HP_PER_LEVEL, DIFFICULTY_DMG_PER_LEVEL, DIFFICULTY_COIN_PER_LEVEL, sacrificeCost, ANOMALY_REROLL_COST, CHAPTER_ENDINGS, CHAPTER_UNLOCK_LINES, CHAPTERS, CHAPTER_ORDER, nextChapter, dailyChapter, chapterMaxDifficulty } from './config.js'
import { playSfx } from './audio.js'
import { t, tt, getLang, LANGS } from './i18n.js'
import { SAVE_SLOTS, activeSlot, slotSummary } from './state.js'

const SCREEN_NAMES = ['title', 'shop', 'daily', 'brief', 'hud', 'levelup', 'pause', 'summary']
const CHOICE_ICONS = { weapon: '⭐', passive: '💪', mod: '⭐', element: '✨', heal: '🍡' }
// v6.3 dispatch beat: how long the "pest control dispatched" HUD banner stays up, in run.time
// seconds — a UI display duration, not sim balance, so it lives here rather than config.js.
const DISPATCH_NOTICE_T = 2.5

// v5.17 build stamp: "vX.Y.Z · <short sha>", substituted by vite.config.js's `define` from the git
// HEAD at BUILD time — so it identifies the bundle you are actually running, not what the source
// tree says it should be. Shown on the title screen and in the pause modal (see buildStampHtml).
// The typeof guard survives substitution (`typeof "v5.17 · abc1234"` is just "string") and keeps
// the module importable outside a Vite build, e.g. from a plain node script.
const BUILD_STAMP = typeof __BUILD_STAMP__ !== 'undefined' ? __BUILD_STAMP__ : 'dev'
const buildStampHtml = () => `<div class="build-stamp" title="build actually running">${BUILD_STAMP}</div>`

// v5.0: difficulty pips/hints/gating read the SELECTED chapter's ladder (meta.chapters[id],
// see state.js's meta.chapters doc block) rather than the pre-v5.0 top-level
// meta.difficulty/meta.maxDifficulty (removed at migration).
function selectedChapterMeta(meta) {
  return meta.chapters?.[meta.chapter] ?? { maxDifficulty: 1, difficulty: 1 }
}

// v5.2 title redesign: the chapter picker is a native CSS scroll-snap CAROUSEL (carouselHtml,
// inside initUI) — one diorama "hero card" (heroCardHtml) per chapter, laid out horizontally so
// the prev/next cards PEEK at both edges. Cards come from titleChapterList: every unlocked chapter
// plus the first locked one, which renders as an anonymous dark "???" preview whose Play is
// disabled. Page dots (carouselDotsHtml) sit under the strip. Selection follows the SCROLL: when a
// card settles under the viewport centre (scrollend, with a scroll-timeout fallback for Safari) the
// browsed chapter updates; an unlocked one persists via hooks.onChapter, the locked one never
// reaches it. The v5.1 single-card + ‹ › arrows + custom touch swipe (navChapter, heroTouch*) are
// gone — native scroll handles paging.
// The carousel = [unlocked chapters] + [the first still-locked CHAPTERS entry].
function titleChapterList(meta) {
  const ids = CHAPTER_ORDER.filter((id) => meta.chapters?.[id]?.unlocked)
  const locked = nextChapter(ids[ids.length - 1] ?? CHAPTER_ORDER[0])
  if (locked && !meta.chapters?.[locked]?.unlocked) ids.push(locked)
  const base = ids.length ? ids : [CHAPTER_ORDER[0]]
  // v5.24: The Blank lives OUTSIDE CHAPTER_ORDER (see config.js) so nextChapter can never surface
  // it — appended explicitly instead. Unlocked: a real card. Not yet, but Beyond has been pushed to
  // its ceiling (one win away): a "???" mystery card. Otherwise it must never appear at all.
  if (meta.chapters?.blank?.unlocked) base.push('blank')
  else if (meta.chapters?.beyond?.maxDifficulty === MAX_DIFFICULTY) base.push('blank')
  return base
}

// Pixi int colour (0xrrggbb) -> '#rrggbb'; shade() blends a hex toward white (amt > 0) or black
// (amt < 0) by |amt| for the hero card's diorama gradient stops; luminance() picks dark-on-light
// vs light-on-dark card text so every chapter's per-bgColor gradient still reads.
function pixiHex(int) {
  return '#' + (int & 0xffffff).toString(16).padStart(6, '0')
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16)
  const t = amt < 0 ? 0 : 255, p = Math.min(1, Math.abs(amt))
  const r = Math.round(((n >> 16) & 255) + (t - ((n >> 16) & 255)) * p)
  const g = Math.round(((n >> 8) & 255) + (t - ((n >> 8) & 255)) * p)
  const b = Math.round((n & 255) + (t - (n & 255)) * p)
  return `rgb(${r}, ${g}, ${b})`
}
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16)
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
}

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

// Formats a SHOP stat's total bonus at a given level the same way its shop-row desc reads
// (e.g. "+25%" for percentage stats, "+150" for flat ones like maxHP) — used by the sacrifice
// modal's per-row "current -> after" preview.
function formatShopBonus(id, levels) {
  const per = SHOP[id].perLevel
  return per < 1 ? `+${Math.round(per * levels * 100)}%` : `+${Math.round(per * levels)}`
}

/**
 * Contract used by main.js:
 *   const ui = initUI({ meta, onPlay(mode, consumableIds), onBuy(id)->bool, onChoose(i),
 *                       onPauseToggle, onQuit, onDifficulty(d), onChapter(id), onReroll(), onSkill(),
 *                       onSacrifice(picks)->bool, onReset(), onSlot(n) })
 *     - onChapter(id): title screen's chapter carousel (v5.2 — see carouselHtml/wireCarousel).
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
 *     - onBriefStart(): fired by the classic pre-run briefing's Start button (v6.0.2 — see
 *       renderBrief). main.js stages the rolled anomalies + booster picks in onPlay and only
 *       creates the run here; the 'brief' screen (ui.showScreen('brief', { chapterId,
 *       difficulty, mutators, reroll })) is skipped entirely when the roll is empty (difficulty 1).
 *     - onBriefReroll(): fired by the briefing's reroll button (v6.0.4, shown when data.reroll —
 *       classic non-blank only). main.js spends ANOMALY_REROLL_COST, rerolls the staged set and
 *       re-shows the brief; the button renders disabled when meta.coins can't cover it.
 *     - onPlay(mode, consumableIds): mode is 'classic' | 'daily'. 'classic' fires from the title
 *       Play button (consumableIds = the booster bottom-sheet's session-local selection, an array
 *       of CONSUMABLES ids; the selection is cleared as soon as onPlay fires) and from the summary
 *       "Play again" button (which replays whatever mode the just-ended run used, selection
 *       cleared the same way). 'daily' fires from the daily briefing screen's Start button with
 *       consumableIds always [] — boosters never apply to daily runs (the title's Daily nav tab
 *       opens the 'daily' briefing screen first; the booster slots/sheet only live on title).
 *     - onReroll(): level-up screen's Reroll button (or the 'R' key). main.js is expected to
 *       no-op silently if unaffordable/wrong phase, otherwise deduct RUN coins (run.coinsEarned,
 *       the HUD counter — not the meta bank), bump run._rerolls,
 *       rebuild run.levelUpChoices, and call showScreen('levelup', ...) again with fresh data.
 *     - onSacrifice(picks): fired by the sacrifice modal's "Confirm sacrifice" button. picks is
 *       { [statId]: count }, the shop levels offered per stat (sum === sacrificeCost(meta.choiceSlots)).
 *       Returns true/false; the UI closes the modal and re-renders the shop either way (main.js
 *       already validates, so false should only happen if the two ever disagree).
 *     - onReset(): shop's "🗑 Reset all progress" button, after its own confirm modal. Full
 *       new-game wipe — main.js is expected to clear the save and reload the page; the UI has
 *       nothing left to re-render after that.
 *     - onSlot(n): title's 💾 save-slot picker (v6.4.6 — see slotsOpen/slotsModalHtml), fired
 *       when tapping an inactive slot row. main.js writes the slot pointer and reloads the page,
 *       same "nothing left to re-render" idiom as onReset — never fires for the already-active slot.
 *   ui.showScreen('title' | 'shop' | 'daily' | 'hud' | 'levelup' | 'pause' | 'summary', data?)
 *     - 'levelup' data: { choices, rerollCost, coins } — choices is run.levelUpChoices
 *       (run.choiceSlots cards, all shown); rerollCost/coins drive the Reroll button.
 *     - 'pause' data: { mutators: string[] }   (run.mutators; omit/empty for classic runs)
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
 *     chips. events (v6.3) is this frame's drained run.events array, scanned only for 'dispatch'
 *     (see DISPATCH_NOTICE_T) to (re)start the "pest control dispatched" HUD banner.
 */
export function initUI(hooks) {
  const root = document.getElementById('ui')
  const { meta } = hooks
  const screens = {}
  let active = 'title'

  for (const name of SCREEN_NAMES) {
    const el = document.createElement('div')
    el.className = `screen screen--${name}`
    el.dataset.ui = ''            // keeps input.js from anchoring the joystick on menu touches
    root.appendChild(el)
    screens[name] = el
  }

  // ---- title -----------------------------------------------------------
  // Session-local pre-run booster selection (v4.5). Not saved to meta — plain in-memory Set,
  // scoped to this initUI() call. Only applies to classic runs (see onPlay hook doc above);
  // cleared as soon as a run actually starts (see the 'play'/'daily-start' click cases below).
  let selectedConsumables = new Set()

  // v5.2 title redesign — UI-local browse state (not persisted, scoped to this initUI call):
  //   browseChapterId: which carousel card is currently centred. Starts at the saved meta.chapter;
  //     native scroll moves it across titleChapterList (see wireCarousel). When it settles on an
  //     unlocked chapter we persist the selection via hooks.onChapter (so meta.chapter tracks it);
  //     the locked preview card never calls onChapter and its Play button is disabled.
  //   boostersOpen: whether the booster bottom-sheet is up (replaces the v5.0.1 run-options panel).
  let browseChapterId = meta.chapter
  let boostersOpen = false

  // Per-chapter DECORATIVE ambient shapes for the diorama card (v5.2). Pure CSS overlay INSIDE the
  // DOM card (the "no procedural shapes" rule is about the Pixi canvas, not this HTML overlay):
  //   body → soft cells/blobs drifting slowly; pond → small bubbles rising. Each item carries its
  // own position/size/loop-duration/delay so the loop never looks synchronised. Locked cards get
  // none. All motion is transform/opacity only + reduced-motion-gated (see styles.css).
  const CHAPTER_AMBIENT = {
    body: {
      cls: 'amb-cell',
      items: [
        { x: 14, y: 24, s: 26, d: 12, delay: 0, dx: 10, dy: -16 },
        { x: 72, y: 30, s: 18, d: 10, delay: 2.5, dx: -12, dy: -12 },
        { x: 40, y: 60, s: 30, d: 14, delay: 1.2, dx: 8, dy: -20 },
        { x: 84, y: 66, s: 14, d: 9, delay: 4, dx: -8, dy: -14 },
        { x: 26, y: 78, s: 20, d: 11, delay: 3.2, dx: 14, dy: -10 },
      ],
    },
    pond: {
      cls: 'amb-bubble',
      items: [
        { x: 18, s: 14, d: 9, delay: 0 },
        { x: 34, s: 10, d: 7.5, delay: 2 },
        { x: 50, s: 18, d: 11, delay: 1 },
        { x: 63, s: 12, d: 8.5, delay: 3.5 },
        { x: 78, s: 9, d: 7, delay: 0.8 },
        { x: 88, s: 15, d: 10, delay: 4.2 },
      ],
    },
  }
  function ambientHtml(id) {
    const spec = CHAPTER_AMBIENT[id]
    if (!spec) return ''
    return spec.items.map((it) => {
      const pos = spec.cls === 'amb-bubble'
        ? `left:${it.x}%;`
        : `left:${it.x}%; top:${it.y}%; --dx:${it.dx}px; --dy:${it.dy}px;`
      return `<span class="amb ${spec.cls}" style="${pos} width:${it.s}px; height:${it.s}px; animation-duration:${it.d}s; animation-delay:${it.delay}s"></span>`
    }).join('')
  }

  // One diorama card for chapter `id`. Unlocked: per-chapter gradient (from render.bgColor) with a
  // drifting ambient layer, a glowing bobbing creature (the chapter emoji), a ★ progress row and a
  // "best" line. Locked: flat greyscale + 🔒 + "???" + unlock hint, no ambient/stars.
  //
  // ★ ROW SEMANTICS: chMeta.maxDifficulty is the highest UNLOCKED level, so levels actually BEATEN
  // = maxDifficulty - 1 (clamped ≥ 0) → that many gold stars. A 5th (all-MAX) gold star would mean
  // "won level 5", which the save does NOT track today; so at maxDifficulty === MAX_DIFFICULTY we
  // still fill 4 and render the 5th as a hollow, gently PULSING star (a "one to go" tease) rather
  // than inventing a win-flag. Row length is per-chapter (chapterMaxDifficulty) — blank's ladder
  // caps at 3, so its card shows 3 stars, not 5.
  // v5.24: Beyond is the one exception — meta.chapters.blank.unlocked IS the save's first "won
  // level 5" fact (see endRun's third unlock block), so once it's true Beyond's 5th star can finally
  // render as a genuine win (gold, no pulse) instead of the "one to go" tease.
  function heroCardHtml(id) {
    if (!meta.chapters?.[id]?.unlocked) {
      const tagline = id === 'blank'
        ? t('win The Beyond at level 5 — something has been counting')
        : tt('win {name} at difficulty 3+', { name: t(CHAPTERS[furthestUnlockedChapterId(meta)].name) })
      return `
        <div class="hero-card hero-card--locked" data-chapter="${id}" data-hero>
          <span class="hero-icon">🔒</span>
          <span class="hero-name">???</span>
          <span class="hero-tagline">${tagline}</span>
        </div>`
    }
    const chapter = CHAPTERS[id]
    const chMeta = meta.chapters[id]
    const base = pixiHex(chapter.render.bgColor)
    const light = luminance(base) > 0.5
    const bg = light
      ? `linear-gradient(160deg, ${shade(base, 0.4)}, ${base} 58%, ${shade(base, -0.1)})`
      : `linear-gradient(160deg, ${shade(base, 0.22)}, ${base} 55%, ${shade(base, -0.32)})`
    const cap = chapterMaxDifficulty(id)
    const filled = Math.max(0, chMeta.maxDifficulty - 1)
    const beyondWon = id === 'beyond' && meta.chapters?.blank?.unlocked
    const stars = Array.from({ length: cap }, (_, i) => {
      const on = i < filled || (beyondWon && i === cap - 1)
      const pulse = !on && i === cap - 1 && chMeta.maxDifficulty === cap
      return `<span class="hero-star${on ? ' hero-star--on' : ''}${pulse ? ' hero-star--pulse' : ''}">${on ? '★' : '☆'}</span>`
    }).join('')
    const best = chMeta.best?.time ? `<span class="hero-best">${t('best')} ${fmtTime(chMeta.best.time)}</span>` : ''
    return `
      <div class="hero-card${light ? ' hero-card--light' : ''}" data-chapter="${id}" data-hero style="background:${bg}; color:${light ? 'var(--ink)' : '#f5f9f7'}">
        <div class="hero-ambient" aria-hidden="true">${ambientHtml(id)}</div>
        <div class="hero-creature">
          <span class="hero-glow"></span>
          <span class="hero-icon">${chapter.icon}</span>
        </div>
        <span class="hero-name">${t(chapter.name)}</span>
        <span class="hero-tagline">${t(chapter.tagline)}</span>
        <div class="hero-stars" aria-label="progress">${stars}</div>
        ${best}
      </div>`
  }

  // The scroll-snap carousel: one card per titleChapterList entry, plus page dots under it. The
  // active/locked dot state mirrors browseChapterId and is patched in place by updateTitleBelow.
  function carouselHtml() {
    const list = titleChapterList(meta)
    const cards = list.map((id) => heroCardHtml(id)).join('')
    const dots = list.map((id) => {
      const locked = !meta.chapters?.[id]?.unlocked
      return `<span class="carousel-dot${id === browseChapterId ? ' carousel-dot--active' : ''}${locked ? ' carousel-dot--locked' : ''}" data-dot="${id}"></span>`
    }).join('')
    return `
      <div class="chapter-carousel" data-carousel>${cards}</div>
      <div class="carousel-dots">${dots}</div>`
  }

  // 3 booster slots under the difficulty row: session-selected consumables fill left-to-right,
  // the rest show ＋. Any slot opens the booster bottom-sheet. Boosters are classic-only.
  function boosterSlotsHtml() {
    const selected = [...selectedConsumables]
    const slots = Array.from({ length: 3 }, (_, i) => {
      const id = selected[i]
      if (!id) return `<button class="booster-slot booster-slot--empty" data-act="boosters-open" aria-label="add booster">＋</button>`
      const item = CONSUMABLES[id]
      return `
        <button class="booster-slot booster-slot--filled" data-act="boosters-open" aria-label="${item.name}">
          <span class="booster-slot-icon">${item.icon}</span>
          <span class="booster-slot-cost">${item.cost}🪙</span>
        </button>`
    }).join('')
    return `<div class="booster-row">${slots}</div>`
  }

  // Bottom sheet (same .modal-backdrop idiom as the sacrifice modal): the 3 CONSUMABLES as toggle
  // rows. A row is greyed (disabled) when adding it would push the running selection cost past
  // meta.coins (cheapest-first affordability still finally resolved in main.js's onPlay).
  function boosterSheetHtml() {
    if (!boostersOpen) return ''
    const selectedCost = [...selectedConsumables].reduce((sum, id) => sum + (CONSUMABLES[id]?.cost ?? 0), 0)
    const rows = Object.entries(CONSUMABLES).map(([id, item]) => {
      const selected = selectedConsumables.has(id)
      const otherCost = selectedCost - (selected ? item.cost : 0)
      const afford = selected || (meta.coins - otherCost) >= item.cost
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
      <div class="modal-backdrop sheet-backdrop" data-act="boosters-close">
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

  function titleBelowHtml() {
    const heroUnlocked = !!meta.chapters?.[browseChapterId]?.unlocked
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
      ${chMeta.maxDifficulty < cap ? `<p class="diff-hint diff-hint--locked">${tt('win level {n} to unlock {m}', { n: chMeta.maxDifficulty, m: chMeta.maxDifficulty + 1 })}</p>` : ''}
      ${boosterSlotsHtml()}` : ''
    return `
      ${playBlock}
      <button class="btn btn--big btn--play" data-act="play" ${heroUnlocked ? '' : 'disabled'}>▶&nbsp; ${t('Play')}</button>`
  }

  // Surgical update after a scroll settles / a difficulty pip is tapped: rebuild only the
  // below-carousel block and re-point the active/locked page dots — the carousel node (and its
  // live scroll offset) is left untouched, so the strip doesn't jump back to the start.
  function updateTitleBelow() {
    const below = screens.title.querySelector('.title-below')
    if (below) below.innerHTML = titleBelowHtml()
    for (const dot of screens.title.querySelectorAll('.carousel-dot')) {
      dot.classList.toggle('carousel-dot--active', dot.dataset.dot === browseChapterId)
    }
  }

  // Centre the browsed card in the carousel WITHOUT animation. Must run while the title screen is
  // visible (a display:none element measures as zero-width) — hence it's also called from
  // showScreen right after the screen is shown, not only from renderTitle.
  function positionCarousel() {
    const car = screens.title.querySelector('[data-carousel]')
    if (!car) return
    const t = car.querySelector(`[data-chapter="${browseChapterId}"]`)
    if (!t) return
    // Centre t by shifting scrollLeft by how far t's centre sits from the carousel's centre.
    // Measured via getBoundingClientRect (viewport space) NOT offsetLeft: a card's offsetLeft is
    // relative to the positioned .screen--title ancestor, so on a WIDE screen (where the 460px
    // carousel is centred with a large left gutter) it's offset from the scroller's own content by
    // that gutter — which mis-centred the last chapters off-screen. Rects avoid the mismatch.
    const carMid = car.getBoundingClientRect().left + car.clientWidth / 2
    const tMid = t.getBoundingClientRect().left + t.clientWidth / 2
    car.scrollLeft = Math.max(0, car.scrollLeft + (tMid - carMid))
  }

  // Attach the scroll-settle selection to a freshly-rendered carousel. Safari lacks 'scrollend', so
  // a debounced scroll-timeout backs it up (both funnel into settle(); the second is a no-op once
  // browseChapterId already matches the centred card).
  function wireCarousel() {
    const car = screens.title.querySelector('[data-carousel]')
    if (!car) return
    positionCarousel()
    let timer = null
    const settle = () => {
      // Pick the card whose centre is nearest the carousel's centre, both in viewport space
      // (getBoundingClientRect). Do NOT use el.offsetLeft here: it's relative to the positioned
      // .screen--title, not the scroller, so on wide screens it's shifted by the carousel's left
      // gutter and settle would select a card several to the left of the one actually centred —
      // making the last chapters unselectable on desktop (the carousel is full-width on phones,
      // gutter ~0, which is why this only bit wide screens).
      const carMid = car.getBoundingClientRect().left + car.clientWidth / 2
      let best = null, bestDist = Infinity
      for (const el of car.querySelectorAll('[data-chapter]')) {
        const c = el.getBoundingClientRect().left + el.clientWidth / 2
        const dist = Math.abs(c - carMid)
        if (dist < bestDist) { bestDist = dist; best = el }
      }
      if (!best || best.dataset.chapter === browseChapterId) return
      browseChapterId = best.dataset.chapter
      // Unlocked + a real change persists via onChapter (which itself plays 'click'); the locked
      // preview only browses, so click here instead. Then patch the below-carousel block in place.
      if (meta.chapters?.[browseChapterId]?.unlocked && browseChapterId !== meta.chapter) hooks.onChapter(browseChapterId)
      else playSfx('click')
      updateTitleBelow()
    }
    car.addEventListener('scrollend', settle)
    car.addEventListener('scroll', () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(settle, 130)
    }, { passive: true })
  }

  function renderTitle() {
    if (!meta.chapters?.[browseChapterId]) browseChapterId = meta.chapter
    screens.title.innerHTML = `
      <button class="lang-toggle" data-act="lang" aria-label="language">🌐 ${getLang().toUpperCase()}</button>
      <button class="slot-toggle" data-act="slots" aria-label="save slots">💾 ${activeSlot()}/${SAVE_SLOTS}</button>
      <div class="coins-badge">🪙 <b>${meta.coins}</b></div>
      <h1 class="title-logo"><span>Charming</span><span>Anomaly</span></h1>
      ${carouselHtml()}
      <div class="title-below">${titleBelowHtml()}</div>
      ${navHtml('battle')}
      ${boosterSheetHtml()}
      ${buildStampHtml()}
      ${slotsModalHtml()}
    `
    wireCarousel()
  }

  // Save-slot picker modal (v6.4.6) — same backdrop/confirm-sheet idiom as the reset-all-progress
  // modal below (resetOpen/resetModalHtml): a ui-local boolean, not persisted, toggled by the
  // title's 💾 button and the slot rows themselves.
  let slotsOpen = false

  function slotsModalHtml() {
    if (!slotsOpen) return ''
    const rows = Array.from({ length: SAVE_SLOTS }, (_, i) => i + 1).map((n) => {
      const isCurrent = n === activeSlot()
      const summary = slotSummary(n)
      const line2 = summary
        ? `🪙 ${summary.coins} · ${summary.unlocked}/${summary.total}`
        : t('Empty — new game')
      const label = isCurrent ? `${t('Slot')} ${n} — ${t('Current')}` : `${t('Slot')} ${n}`
      return `
        <button class="btn btn--soft slot-row" data-act="slot-pick" data-slot="${n}" ${isCurrent ? 'disabled' : ''}>
          <span class="slot-row-name">${label}</span>
          <small class="slot-row-summary">${line2}</small>
        </button>`
    }).join('')
    return `
      <div class="modal-backdrop" data-act="slots-cancel">
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
  // Reset-all-progress confirmation: a backdrop + a small confirm/cancel sheet. Still a modal (a
  // destructive yes/no genuinely wants to block), unlike the sacrifice list which is a view now.
  let resetOpen = false

  function sacrificeOffered() {
    return Object.values(sacrificePicks).reduce((sum, n) => sum + n, 0)
  }

  // v6.6 shop redesign: the sacrifice explainer used to be a permanent ~170px panel under the
  // grid — a paragraph of standing text for something a save does twice, which is most of why the
  // shop scrolled on a small phone. It is now one two-line pill (label + progress toward the
  // cost); the paragraph moved inside the modal the pill opens, so nothing is lost, and the
  // reset link shares the same row as a 🗑 square. Both live in .shop-foot, a fixed-height flex
  // row, which is what lets .shop-rows own every remaining pixel (see styles.css).
  function shopFootHtml(slots, cost) {
    const owned = Object.values(meta.shop).reduce((sum, l) => sum + l, 0)
    let sac
    if (slots >= 4) {
      sac = `<div class="shop-sac shop-sac--done">🩸 ${t('All 4 upgrade slots unlocked.')}</div>`
    } else {
      const nth = slots === 2 ? t('3rd') : t('4th')
      const afford = owned >= cost
      const pct = Math.min(100, Math.round((owned / cost) * 100))
      // The fraction is progress toward the requirement, not an inventory count — so it reads
      // "20/20" once you qualify, never "21/20". (The modal shows what you actually own.)
      const have = Math.min(owned, cost)
      sac = `
        <button class="shop-sac${afford ? ' shop-sac--ready' : ''}" data-act="sacrifice-start" ${afford ? '' : 'disabled'}>
          <span class="shop-sac-label">🩸 ${tt('{nth} upgrade slot', { nth })}</span>
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
  function sacrificeViewHtml(cost) {
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
    const rows = Object.entries(SHOP).filter(([id]) => (meta.shop[id] ?? 0) > 0).map(([id, item]) => {
      const level = meta.shop[id]
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
        ? `<span class="sac-row-before">${formatShopBonus(id, level)}</span> → <span class="sac-row-after">${formatShopBonus(id, kept)}</span>`
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

    // v6.6: the "what does this buy me" line lives here now — the shop screen no longer carries a
    // standing panel to hold it (see shopFootHtml).
    const nth = (meta.choiceSlots ?? 2) === 2 ? t('3rd') : t('4th')

    return `
      <header class="shop-head shop-head--sac">
        <span class="sacrifice-counter${ready ? ' sacrifice-counter--ready' : ''}" style="color:${counterColor}">🩸 ${tt('Offered {offered}/{cost}', { offered, cost })}</span>
      </header>
      <p class="sacrifice-desc">${tt('Unlock the {nth} upgrade slot — sacrifice {cost} upgrade levels (no coin refund).', { nth, cost })}</p>
      <div class="shop-rows shop-rows--sac">${rows}</div>
      <footer class="shop-foot shop-foot--sac">
        <button class="btn btn--soft btn--small" data-act="sacrifice-cancel">${t('Cancel')}</button>
        <button class="btn btn--danger btn--small" data-act="sacrifice-confirm" ${ready ? '' : 'disabled'}>${t('Confirm sacrifice')}</button>
      </footer>`
  }

  function resetModalHtml() {
    if (!resetOpen) return ''
    return `
      <div class="modal-backdrop reset-modal" data-act="reset-cancel">
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
    const slots = meta.choiceSlots ?? 2
    const cost = sacrificeCost(slots)
    // The sacrifice list takes over the shop screen rather than floating above it (see
    // sacrificeViewHtml). --sac drops the bottom-nav padding reservation, since the nav is not
    // rendered while a Cancel/Confirm flow is up.
    screens.shop.classList.toggle('screen--sac', sacrificeOpen && cost != null)
    if (sacrificeOpen && cost != null) {
      screens.shop.innerHTML = sacrificeViewHtml(cost)
      return
    }
    // v6.6 card: the NAME is gone from the face. A purchase turns on the effect and the price —
    // "Power Gel" is flavour the player already knows by icon after one session, and it was
    // costing the biggest type on the card plus a whole line. The effect takes that slot, and the
    // name survives in aria-label so screen readers and the sacrifice list still speak it.
    // v6.6.2 (owner picked this shape over the two-column cards): ONE COLUMN of eight rows. A full
    // -width row is what lets the effect sit on a single line and never ellipsize, in either
    // language — horizontal room is the scarce axis at 320px, and every previous attempt lost
    // labels to a meter competing for the same line. So the meter is not on the line: ten discrete
    // notches ride the row's bottom edge, and reading down the column shows the whole build at
    // once. The price is an explicit gold "buy" chip rather than a bare number.
    const cards = Object.entries(SHOP).map(([id, item]) => {
      const level = meta.shop[id]
      const maxed = level >= MAX_SHOP_LEVEL
      const buyCost = maxed ? 0 : shopCost(id, level)
      const afford = !maxed && meta.coins >= buyCost
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
    // Nav (below) replaces the old "← Back" header.
    screens.shop.innerHTML = `
      <header class="shop-head"><span class="shop-balance">🪙 <b>${meta.coins}</b></span></header>
      <div class="shop-rows">${cards}</div>
      ${shopFootHtml(slots, cost)}
      ${navHtml('shop')}
      ${resetModalHtml()}
    `
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
        <span class="hud-coins">🪙 0</span>
        <button class="btn-pause" data-act="pause" aria-label="Pause">⏸</button>
      </div>
      <div class="rampage-wrap rampage-wrap--hidden">
        <div class="rampage-bar"><div class="rampage-fill"></div></div>
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
    <div class="dispatch-notice"></div>
    <div class="xp-row">
      <span class="lv-badge">${t('Lv')} 1</span>
      <div class="xp-bar"><div class="xp-fill"></div></div>
    </div>
    <div class="weapon-row"></div>
    <button class="skill-btn skill-btn--hidden" data-act="skill" aria-label="Repulse">
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
    dispatchNotice: screens.hud.querySelector('.dispatch-notice'),
  }
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
    // v6.3 dispatch beat: dispatchUntil is a run.time DEADLINE (0 = nothing pending), not a DOM
    // timer — updateHUD already redraws every frame while playing, so comparing against run.time
    // needs no separate countdown/interval and survives pause (run.time simply stops advancing).
    dispatchUntil: 0, dispatchShown: undefined,
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
    const laneChapter = CHAPTERS[run.chapter].lane === true
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
        <span class="weapon-chip weapon-chip--mutator" title="${MUTATORS[id]?.name ?? id}">
          <span class="weapon-chip-icon">${MUTATORS[id]?.icon ?? '❔'}</span>
        </span>`).join('')
      hud.weaponRow.innerHTML = weaponChips + elementChips + mutatorChips
    }
    // v6.3 dispatch beat: a 'dispatch' event this frame (re)starts the banner's ~2.5s window —
    // main.js drains run.events and passes them through here alongside render/audio, the same
    // frame-loop cadence every other event consumer already uses (see main.js's ticker).
    if (events) {
      for (const e of events) {
        if (e.type === 'dispatch') { last.dispatchUntil = run.time + DISPATCH_NOTICE_T; break }
      }
    }
    const dispatchShown = run.time < last.dispatchUntil
    if (dispatchShown !== last.dispatchShown) {
      last.dispatchShown = dispatchShown
      if (dispatchShown) hud.dispatchNotice.textContent = t('📋 REPORTED — pest control dispatched')
      hud.dispatchNotice.classList.toggle('dispatch-notice--show', dispatchShown)
    }
  }

  // ---- level-up modal ----------------------------------------------------
  let lvCards = []
  let lvFocus = 0

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

  function renderLevelup(data = {}) {
    const { choices = [], rerollCost: rerollN = 0, coins = 0 } = data
    const cards = choices.map((c, i) => {
      const rarity = c.rarity ?? 'normal'
      const rarityName = RARITIES[rarity]?.name ?? RARITIES.normal.name
      return `
      <button class="card lv-card" data-choose="${i}" data-rarity="${rarity}" style="animation-delay:${i * 90}ms">
        <i class="rarity-chip">${t(rarityName)}</i>
        <span class="lv-card-icon">${c.icon ?? CHOICE_ICONS[c.kind] ?? '✨'}</span>
        <span class="lv-card-body">
          <span class="lv-card-title">${t(c.title)}
            ${c.tag ? `<i class="tag ${c.tag === 'New!' ? 'tag--new' : 'tag--lv'}">${tCardTag(c.tag)}</i>` : ''}
          </span>
          <span class="lv-card-desc">${tCardDesc(c.desc)}</span>
        </span>
      </button>`
    }).join('')
    const rerollDisabled = coins < rerollN
    screens.levelup.innerHTML = `
      <div class="modal">
        <h2 class="modal-title">${t('LEVEL UP!')}</h2>
        <div class="lv-cards">${cards}</div>
        <p class="lv-hint">${tt('1-{n} · arrows · enter · R reroll', { n: choices.length })}</p>
        <div class="lv-footer">
          <button class="btn btn--soft btn--small lv-reroll" data-act="reroll" ${rerollDisabled ? 'disabled' : ''}>🔄 ${tt('Reroll ({n}🪙)', { n: rerollN })}</button>
          <span class="lv-coins">🪙 ${coins}</span>
        </div>
      </div>
    `
    lvCards = Array.from(screens.levelup.querySelectorAll('.lv-card'))
    setLvFocus(0)
  }

  // ---- level-up keyboard nav (only wired while the level-up screen shows) ----
  function setLvFocus(i) {
    if (lvCards.length === 0) return
    lvFocus = ((i % lvCards.length) + lvCards.length) % lvCards.length
    lvCards.forEach((el, idx) => el.classList.toggle('card--focused', idx === lvFocus))
  }

  function chooseLvCard(i) {
    if (i < 0 || i >= lvCards.length) return
    hooks.onChoose(i)
  }

  function onLevelupKeydown(e) {
    if (e.repeat) return
    const digit = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[e.code]
    if (digit !== undefined) {
      e.preventDefault()
      e.stopPropagation()
      chooseLvCard(digit)
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
        chooseLvCard(lvFocus)
        break
      case 'KeyR':
        e.preventDefault(); e.stopPropagation()
        hooks.onReroll()
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

  function effectChips(effects) {
    return Object.entries(effects).map(([key, v]) => {
      const [label, goodUp] = EFFECT_LABELS[key] ?? [key, true]
      const pct = Math.round((v - 1) * 100)
      const good = (pct > 0) === goodUp
      return `<span class="fx-chip ${good ? 'fx-chip--good' : 'fx-chip--bad'}">${pct > 0 ? '+' : ''}${pct}% ${t(label)}</span>`
    }).join('')
  }

  // One anomaly explainer card (icon + name + desc + effect chips) — shared by the daily
  // briefing and the classic pre-run briefing (v6.0.2).
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
    const isPreview = !meta.chapters?.[chId]?.unlocked
    screens.daily.innerHTML = `
      <div class="modal daily-brief">
        <h2 class="modal-title">🌀 ${t('Daily Anomaly')}</h2>
        <p class="daily-date">${todayKey()}</p>
        <div class="daily-chapter">
          <span class="daily-chapter-icon">${chapter.icon}</span>
          <span class="daily-chapter-name">${t(chapter.name)}</span>
          ${isPreview ? `<span class="daily-chapter-preview">${t('preview')}</span>` : ''}
        </div>
        ${ids.map(mutatorCardHtml).join('')}
        <p class="daily-note">${t('Everyone gets the same anomaly today — new one at midnight.')}</p>
        <button class="btn btn--big" data-act="daily-start">▶&nbsp; ${t('Start Daily Run')}</button>
      </div>
      ${navHtml('daily')}
    `
  }

  // ---- classic pre-run briefing (v6.0.2) -----------------------------------
  // Shown between the title's Play and actual gameplay whenever the classic roll produced
  // anomalies (difficulty 2+, or The Blank's fixed ladder) — a new player otherwise meets
  // "Riptide" as an unexplained icon chip in the HUD. The run does NOT exist yet: main.js
  // stages the rolled ids and only creates/starts the run from this screen's Start button
  // (backing out via the bottom nav costs nothing — boosters aren't spent either).
  function renderBrief(d) {
    const chapter = CHAPTERS[d.chapterId] ?? CHAPTERS.body
    const ids = d.mutators ?? []
    const note = d.chapterId === 'blank'
      ? t('The Blank\'s ladder is fixed — each difficulty adds its named modifier.')
      : t('Anomalies bend the rules of this run — every difficulty level past the first adds one more.')
    screens.brief.innerHTML = `
      <div class="modal daily-brief">
        <h2 class="modal-title">🌀 ${t('Anomalies')}</h2>
        <div class="daily-chapter">
          <span class="daily-chapter-icon">${chapter.icon}</span>
          <span class="daily-chapter-name">${t(chapter.name)} — ${t('difficulty')} ${d.difficulty ?? 1}</span>
        </div>
        <p class="daily-note">${note}</p>
        ${ids.map(mutatorCardHtml).join('')}
        ${d.reroll ? `
        <button class="btn btn--soft btn--small" data-act="brief-reroll" ${meta.coins >= ANOMALY_REROLL_COST ? '' : 'disabled'}>
          🎲 ${t('Reroll')} — ${ANOMALY_REROLL_COST} 🪙 <span class="brief-coins">(${tt('you have {coins}', { coins: meta.coins })})</span>
        </button>` : ''}
        <button class="btn btn--big" data-act="brief-start">▶&nbsp; ${t('Start')}</button>
      </div>
      ${navHtml('battle')}
    `
  }

  // ---- pause modal -------------------------------------------------------
  function renderPause(d) {
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
    screens.pause.innerHTML = `
      <div class="modal">
        <h2 class="modal-title">${t('Paused')}</h2>
        ${mutatorBlock}
        <button class="btn btn--big" data-act="resume">▶&nbsp; ${t('Resume')}</button>
        <button class="btn btn--soft" data-act="quit">${t('Quit to menu')}</button>
        ${buildStampHtml()}
      </div>
    `
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
    screens.summary.innerHTML = `
      <div class="modal">
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
    `
  }

  // ---- screen switching -----------------------------------------------------
  function showScreen(name, data) {
    if (name === 'title') renderTitle()
    else if (name === 'shop') renderShop()
    else if (name === 'daily') renderDaily()
    else if (name === 'brief') renderBrief(data ?? {})
    else if (name === 'levelup') renderLevelup(data ?? {})
    else if (name === 'pause') renderPause(data ?? {})
    else if (name === 'summary') renderSummary(data ?? {})
    const hudUnder = name === 'levelup' || name === 'pause'   // hud stays visible under these modals
    for (const [n, el] of Object.entries(screens)) {
      el.classList.toggle('screen--visible', n === name || (hudUnder && n === 'hud'))
    }
    // The carousel can only be scroll-positioned once the title screen is actually visible (a
    // display:none element measures as zero-width, so renderTitle's own positionCarousel no-ops on
    // first show / tab-return) — re-run it now that the screen is laid out.
    if (name === 'title') positionCarousel()
    // keyboard nav for the level-up cards is only live while that screen shows
    document.removeEventListener('keydown', onLevelupKeydown)
    if (name === 'levelup') document.addEventListener('keydown', onLevelupKeydown)
    active = name
  }

  // Persistent bottom-nav tab switch (v5.2). `target` is the destination SCREEN ('title' | 'shop' |
  // 'daily'); a tap on the tab already showing is inert. Leaving the shop resets its transient
  // modal state (sacrifice / reset) — the cleanup the old '← Back' case used to own.
  function resetShopModals() {
    sacrificeOpen = false
    sacrificePicks = {}
    sacrificeBounceId = null
    resetOpen = false
  }
  function switchTab(target) {
    if (active === target) return
    if (active === 'shop') resetShopModals()
    if (active === 'title') slotsOpen = false // v6.4.6: don't strand the slot modal open on return
    playSfx('click')
    showScreen(target)
  }

  // ---- one delegated click handler for every screen ---------------------------
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act], [data-buy], [data-choose], [data-consumable]')
    if (!el) return
    if (el.dataset.buy !== undefined) {
      if (hooks.onBuy(el.dataset.buy)) renderShop(el.dataset.buy)
      return
    }
    if (el.dataset.choose !== undefined) {
      hooks.onChoose(Number(el.dataset.choose))
      return
    }
    if (el.dataset.consumable !== undefined) {
      const id = el.dataset.consumable
      if (selectedConsumables.has(id)) selectedConsumables.delete(id)
      else selectedConsumables.add(id)
      playSfx('click')
      renderTitle()
      return
    }
    switch (el.dataset.act) {
      case 'play': {
        const mode = el.dataset.mode || 'classic'
        const ids = mode === 'daily' ? [] : [...selectedConsumables]
        selectedConsumables.clear()
        boostersOpen = false
        slotsOpen = false // keyboard focus can reach Play behind the slot backdrop — don't strand the modal open on return
        hooks.onPlay(mode, ids)
        break
      }
      case 'boosters-open':
        boostersOpen = true
        playSfx('click')
        renderTitle()
        break
      case 'boosters-close':
        // Tapping inside the sheet also resolves to the backdrop (nothing stops propagation), so
        // only the Done button or a *direct* backdrop hit closes it (same guard as the modals).
        if (el.classList.contains('modal-backdrop') && el !== e.target) break
        boostersOpen = false
        playSfx('click')
        renderTitle()
        break
      // Persistent bottom nav (v5.2): 'battle' → title, 'shop' → shop, 'daily' → daily. A tap on
      // the current tab is inert. See switchTab (leaving the shop resets its modal state).
      case 'battle': switchTab('title'); break
      case 'shop': switchTab('shop'); break
      case 'daily': switchTab('daily'); break
      case 'daily-start': selectedConsumables.clear(); hooks.onPlay('daily', []); break
      case 'lang': {
        // v6.1 i18n: cycle to the next language, persist via main.js, re-render this screen live
        const ids = LANGS.map(([id]) => id)
        const next = ids[(ids.indexOf(getLang()) + 1) % ids.length]
        hooks.onLang?.(next)
        renderTitle()
        break
      }
      // v6.4.6 save slots: title's 💾 button opens the picker, backdrop/Cancel closes it, tapping
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
      case 'brief-start': hooks.onBriefStart?.(); break
      case 'brief-reroll': hooks.onBriefReroll?.(); break
      case 'diff': {
        const d = Number(el.dataset.diff)
        if (d > selectedChapterMeta(meta).maxDifficulty) break // belt-and-braces: locked pips are disabled already
        hooks.onDifficulty(d)
        updateTitleBelow() // surgical: keep the carousel's scroll position (a full renderTitle would reset it)
        break
      }
      case 'pause':
      case 'resume': playSfx('click'); hooks.onPauseToggle(); break
      case 'quit': playSfx('click'); hooks.onQuit(); break
      case 'skill': hooks.onSkill(); break
      case 'reroll': hooks.onReroll(); break
      case 'sacrifice-start':
        sacrificeOpen = true
        sacrificePicks = {}
        sacrificeBounceId = null
        playSfx('click')
        renderShop()
        break
      case 'sacrifice-cancel':
        sacrificeOpen = false
        sacrificePicks = {}
        sacrificeBounceId = null
        playSfx('click')
        renderShop()
        break
      case 'sacrifice-offer': {
        // whole-row tap: offer ONE more level of this stat onto the altar, capped at both the
        // stat's owned level and the sacrifice's total cost
        const id = el.dataset.id
        const cost = sacrificeCost(meta.choiceSlots ?? 2)
        const have = sacrificePicks[id] ?? 0
        if (cost != null && sacrificeOffered() < cost && have < (meta.shop[id] ?? 0)) {
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
        const cost = sacrificeCost(meta.choiceSlots ?? 2)
        if (cost != null && sacrificeOffered() === cost) hooks.onSacrifice(sacrificePicks)
        sacrificeOpen = false
        sacrificePicks = {}
        sacrificeBounceId = null
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

  // Escape/KeyP from input.js — only meaningful while in a run
  window.addEventListener('game-pause', () => {
    if (active === 'hud' || active === 'pause') hooks.onPauseToggle()
  })

  showScreen('title')
  return { showScreen, updateHUD }
}
