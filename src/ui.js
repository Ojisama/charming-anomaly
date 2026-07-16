// DOM overlay inside #ui: title, shop, HUD, level-up, pause, summary. No Pixi.
import { SHOP, shopCost, MAX_SHOP_LEVEL, RUN_DURATION, RARITIES, WEAPONS, ELEMENTS, MUTATORS, CONSUMABLES, dailyMutators, todayKey, MAX_DIFFICULTY, DIFFICULTY_HP_PER_LEVEL, DIFFICULTY_COIN_PER_LEVEL, sacrificeCost, CHAPTERS, CHAPTER_ORDER, nextChapter, dailyChapter } from './config.js'
import { playSfx } from './audio.js'

const SCREEN_NAMES = ['title', 'shop', 'daily', 'hud', 'levelup', 'pause', 'summary']
const CHOICE_ICONS = { weapon: '⭐', passive: '💪', mod: '⭐', element: '✨', heal: '🍡' }

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
function titleChapterList(meta) {
  const ids = CHAPTER_ORDER.filter((id) => meta.chapters?.[id]?.unlocked)
  const locked = nextChapter(ids[ids.length - 1] ?? CHAPTER_ORDER[0])
  if (locked && !meta.chapters?.[locked]?.unlocked) ids.push(locked)
  return ids.length ? ids : [CHAPTER_ORDER[0]]
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

// Formats a SHOP stat's total bonus at a given level the same way its shop-card desc reads
// (e.g. "+25%" for percentage stats, "+150" for flat ones like maxHP) — used by the sacrifice
// modal's per-row "current -> after" preview.
function formatShopBonus(id, levels) {
  const per = SHOP[id].perLevel
  return per < 1 ? `+${Math.round(per * levels * 100)}%` : `+${Math.round(per * levels)}`
}

/**
 * Contract used by main.js:
 *   const ui = initUI({ meta, onPlay(mode, consumableIds), onBuy(id)->bool, onChoose(i),
 *                       onPauseToggle, onQuit, onDifficulty(d), onChapter(id), onReroll(),
 *                       onSacrifice(picks)->bool, onReset() })
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
 *   ui.showScreen('title' | 'shop' | 'daily' | 'hud' | 'levelup' | 'pause' | 'summary', data?)
 *     - 'levelup' data: { choices, rerollCost, coins } — choices is run.levelUpChoices
 *       (run.choiceSlots cards, all shown); rerollCost/coins drive the Reroll button.
 *     - 'pause' data: { mutators: string[] }   (run.mutators; omit/empty for classic runs)
 *     - 'summary' data: { victory, time, kills, level, earned, bonus, mutators?, mode,
 *       unlockedDifficulty?, unlockedChapter? }   unlockedDifficulty is the newly-unlocked level
 *       number when this win just raised the run's chapter's maxDifficulty (see endRun in
 *       main.js), else null — rendered as a mint .summary-unlock badge. unlockedChapter (v5.0)
 *       is the newly-unlocked NEXT chapter's name when this win (classic, difficulty 3+) just
 *       unlocked it, else null — rendered as a second, violet .summary-unlock--chapter badge;
 *       both can and do appear together. renderSummary itself resolves which chapter was just
 *       played (meta.chapter for classic, dailyChapter(todayKey()) for daily — the data object
 *       doesn't carry it) purely to show its icon/name in the header, unrelated to these unlocks.
 *   ui.updateHUD(run)   called every frame while playing — renders run.mutators as HUD chips
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
  // than inventing a win-flag.
  function heroCardHtml(id) {
    if (!meta.chapters?.[id]?.unlocked) {
      const prevName = CHAPTERS[furthestUnlockedChapterId(meta)].name
      return `
        <div class="hero-card hero-card--locked" data-chapter="${id}" data-hero>
          <span class="hero-icon">🔒</span>
          <span class="hero-name">???</span>
          <span class="hero-tagline">win ${prevName} at difficulty 3+</span>
        </div>`
    }
    const chapter = CHAPTERS[id]
    const chMeta = meta.chapters[id]
    const base = pixiHex(chapter.render.bgColor)
    const light = luminance(base) > 0.5
    const bg = light
      ? `linear-gradient(160deg, ${shade(base, 0.4)}, ${base} 58%, ${shade(base, -0.1)})`
      : `linear-gradient(160deg, ${shade(base, 0.22)}, ${base} 55%, ${shade(base, -0.32)})`
    const filled = Math.max(0, chMeta.maxDifficulty - 1)
    const stars = Array.from({ length: MAX_DIFFICULTY }, (_, i) => {
      const on = i < filled
      const pulse = !on && i === MAX_DIFFICULTY - 1 && chMeta.maxDifficulty === MAX_DIFFICULTY
      return `<span class="hero-star${on ? ' hero-star--on' : ''}${pulse ? ' hero-star--pulse' : ''}">${on ? '★' : '☆'}</span>`
    }).join('')
    const best = chMeta.best?.time ? `<span class="hero-best">best ${fmtTime(chMeta.best.time)}</span>` : ''
    return `
      <div class="hero-card${light ? ' hero-card--light' : ''}" data-chapter="${id}" data-hero style="background:${bg}; color:${light ? 'var(--ink)' : '#f5f9f7'}">
        <div class="hero-ambient" aria-hidden="true">${ambientHtml(id)}</div>
        <div class="hero-creature">
          <span class="hero-glow"></span>
          <span class="hero-icon">${chapter.icon}</span>
        </div>
        <span class="hero-name">${chapter.name}</span>
        <span class="hero-tagline">${chapter.tagline}</span>
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
            <span class="booster-item-name">${item.name}</span>
            <span class="booster-item-desc">${item.desc}</span>
          </span>
          <span class="booster-item-cost">${item.cost}🪙</span>
          <span class="booster-item-check">${selected ? '✓' : ''}</span>
        </button>`
    }).join('')
    return `
      <div class="modal-backdrop sheet-backdrop" data-act="boosters-close">
        <div class="bottom-sheet">
          <div class="sheet-handle"></div>
          <h3 class="sheet-title">Boosters <span class="sheet-note">this run only</span></h3>
          <div class="sheet-list">${rows}</div>
          <button class="btn btn--soft btn--small sheet-done" data-act="boosters-close">Done</button>
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
        ${tab('shop', '🛒', 'Shop')}
        ${tab('battle', '⚔️', 'Battle')}
        ${tab('daily', '🌀', 'Daily', `<sup class="nav-tab-badge">${dailyIcon}</sup>`)}
      </nav>`
  }

  // Everything BELOW the carousel: the difficulty row + hint + booster slots (unlocked chapters
  // only) and the Play button. Split out so scroll-driven selection can rebuild JUST this part
  // (via updateTitleBelow) without touching the carousel node and resetting its scroll position.
  function titleBelowHtml() {
    const heroUnlocked = !!meta.chapters?.[browseChapterId]?.unlocked
    const chMeta = meta.chapters?.[browseChapterId] ?? { maxDifficulty: 1, difficulty: 1 }
    const playBlock = heroUnlocked ? `
      <div class="diff-row">
        <span class="diff-label">Difficulty</span>
        ${Array.from({ length: MAX_DIFFICULTY }, (_, i) => {
          const d = i + 1
          if (d > chMeta.maxDifficulty) return `<button class="diff-pip diff-pip--locked" data-act="diff" data-diff="${d}" disabled>🔒</button>`
          return `<button class="diff-pip${d <= chMeta.difficulty ? ' diff-pip--on' : ''}" data-act="diff" data-diff="${d}">${d}</button>`
        }).join('')}
      </div>
      <p class="diff-hint">${chMeta.difficulty === 1
        ? 'the base game'
        : `+${chMeta.difficulty - 1} random anomal${chMeta.difficulty === 2 ? 'y' : 'ies'} · +${Math.round(((chMeta.difficulty - 1) * DIFFICULTY_HP_PER_LEVEL) * 100)}% enemy HP · <b class="diff-hint-reward">+${Math.round(((chMeta.difficulty - 1) * DIFFICULTY_COIN_PER_LEVEL) * 100)}% coins</b>`}</p>
      ${chMeta.maxDifficulty < MAX_DIFFICULTY ? `<p class="diff-hint diff-hint--locked">win level ${chMeta.maxDifficulty} to unlock ${chMeta.maxDifficulty + 1}</p>` : ''}
      ${boosterSlotsHtml()}` : ''
    return `
      ${playBlock}
      <button class="btn btn--big btn--play" data-act="play" ${heroUnlocked ? '' : 'disabled'}>▶&nbsp; Play</button>`
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
    if (t) car.scrollLeft = Math.max(0, t.offsetLeft - (car.clientWidth - t.clientWidth) / 2)
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
      const centre = car.scrollLeft + car.clientWidth / 2
      let best = null, bestDist = Infinity
      for (const el of car.querySelectorAll('[data-chapter]')) {
        const c = el.offsetLeft + el.clientWidth / 2
        const dist = Math.abs(c - centre)
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
      <div class="coins-badge">🪙 <b>${meta.coins}</b></div>
      <h1 class="title-logo"><span>Charming</span><span>Anomaly</span></h1>
      ${carouselHtml()}
      <div class="title-below">${titleBelowHtml()}</div>
      ${navHtml('battle')}
      ${boosterSheetHtml()}
    `
    wireCarousel()
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
  // The shop re-renders wholesale on every tap (screens.shop.innerHTML is rebuilt), which recreates
  // the modal node and would restart its CSS enter animation each tap — the "janky replay" bug.
  // sacrificeAnimated is flipped false when the modal opens and consumed on the FIRST render after
  // (see sacrificeModalHtml): only that first paint carries the .sacrifice-modal--enter class, so
  // the slide-up plays exactly once. Per-tap feedback (counter + touched chip) uses its own always-on
  // pulse, which is fine to replay because it SHOULD fire on every offer.
  let sacrificeAnimated = false

  // Reset-all-progress confirmation modal — same backdrop idiom as the sacrifice modal, just a
  // small confirm/cancel sheet instead of a scrollable stat list. Not persisted either.
  let resetOpen = false

  function sacrificeOffered() {
    return Object.values(sacrificePicks).reduce((sum, n) => sum + n, 0)
  }

  function sacrificeSectionHtml(slots, cost) {
    if (slots >= 4) {
      return `
        <div class="sacrifice-panel">
          <span class="sacrifice-title">🩸 Sacrifice</span>
          <p class="sacrifice-desc">All 4 card slots unlocked.</p>
        </div>`
    }
    const nth = slots === 2 ? '3rd' : '4th'
    const owned = Object.values(meta.shop).reduce((sum, l) => sum + l, 0)
    const afford = owned >= cost
    return `
      <div class="sacrifice-panel">
        <span class="sacrifice-title">🩸 Sacrifice</span>
        <p class="sacrifice-desc">Unlock the ${nth} level-up card — sacrifice ${cost} upgrade levels (no coin refund).</p>
        <button class="btn btn--soft btn--small" data-act="sacrifice-start" ${afford ? '' : 'disabled'}>Sacrifice ${cost} levels</button>
        ${afford ? '' : `<p class="sacrifice-hint">Not enough upgrade levels owned (${owned}/${cost}).</p>`}
      </div>`
  }

  // Full-screen sacrifice modal (v5.1.1 altar rework): a dim backdrop (tapping it directly, not the
  // sheet, cancels — see the sacrifice-cancel case below) centering a rounded sheet. Top is a pinned
  // ALTAR zone — the big Offered X/COST counter plus one chip per offered stat (tap a chip to un-offer
  // one level). Below scrolls the stat list where the WHOLE row is one tap target offering ONE level
  // (no +/− steppers): unambiguous, since the only action a row affords is "give up a level here".
  // enter animation: gated by sacrificeAnimated so the slide-up plays only on the first paint.
  function sacrificeModalHtml(cost) {
    if (!sacrificeOpen || cost == null) return ''
    const offered = sacrificeOffered()
    const ready = offered === cost
    const full = offered >= cost
    const counterColor = ready ? 'var(--mint-dark)' : lerpColor('#7a7a90', '#c23a52', offered / cost)
    // Consume the once-only enter flag: only this first render after opening tags the modal with
    // --enter (the animated class), so subsequent tap re-renders can't replay the slide-up.
    const enter = !sacrificeAnimated
    sacrificeAnimated = true

    // Altar chips: one per offered stat, tap to take ONE level back off the altar. The just-touched
    // one gets --pop so it scale-pops on appear/increment (recreated each render → restart-safe).
    const chips = Object.entries(sacrificePicks).filter(([, n]) => n > 0).map(([id, n]) => `
      <button class="sacrifice-chip${id === sacrificeBounceId ? ' sacrifice-chip--pop' : ''}" data-act="sacrifice-unoffer" data-id="${id}">
        <span class="sacrifice-chip-name">${SHOP[id].name}</span>
        <span class="sacrifice-chip-count">×${n}</span>
      </button>`).join('')
    const altarInner = chips || '<span class="sacrifice-altar-empty">tap a stat below to offer its levels</span>'

    const rows = Object.entries(SHOP).filter(([id]) => (meta.shop[id] ?? 0) > 0).map(([id, item]) => {
      const level = meta.shop[id]
      const picked = sacrificePicks[id] ?? 0
      const kept = level - picked
      const canOffer = picked < level && !full
      const pips = Array.from({ length: MAX_SHOP_LEVEL }, (_, i) => {
        const cls = i < kept ? 'pip pip--on' : i < level ? 'pip pip--lost' : 'pip'
        return `<i class="${cls}"></i>`
      }).join('')
      // "disappearing" preview: current total bonus at this level -> what's left after the offer
      const preview = picked > 0
        ? `<span class="sacrifice-bonus-preview"><span class="sacrifice-bonus-before">${formatShopBonus(id, level)}</span> → <span class="sacrifice-bonus-after">${formatShopBonus(id, kept)}</span></span>`
        : ''
      return `
        <button class="sacrifice-stat-row${id === sacrificeBounceId ? ' sacrifice-stat-row--bounce' : ''}" data-act="sacrifice-offer" data-id="${id}" ${canOffer ? '' : 'disabled'}>
          <div class="sacrifice-stat-info">
            <span class="sacrifice-stat-name">${item.name}</span>
            <span class="sacrifice-stat-effect">${item.desc} / level</span>
            ${preview}
            <span class="pips">${pips}</span>
          </div>
          <span class="sacrifice-offer-affordance">🩸<span class="sacrifice-offer-label">Offer</span></span>
        </button>`
    }).join('')

    return `
      <div class="modal-backdrop sacrifice-modal${enter ? ' sacrifice-modal--enter' : ''}" data-act="sacrifice-cancel">
        <div class="sacrifice-sheet">
          <div class="sacrifice-altar${ready ? ' sacrifice-altar--ready' : ''}">
            <span class="sacrifice-counter${ready ? ' sacrifice-counter--ready' : ''}" style="color:${counterColor}">🩸 Offered ${offered}/${cost}</span>
            <div class="sacrifice-altar-chips">${altarInner}</div>
          </div>
          <div class="sacrifice-sheet-body">${rows}</div>
          <footer class="sacrifice-sheet-foot">
            <button class="btn btn--soft btn--small" data-act="sacrifice-cancel">Cancel</button>
            <button class="btn btn--danger btn--small" data-act="sacrifice-confirm" ${ready ? '' : 'disabled'}>Confirm sacrifice</button>
          </footer>
        </div>
      </div>`
  }

  function resetSectionHtml() {
    return `<button class="reset-link" data-act="reset-start">🗑 Reset all progress</button>`
  }

  function resetModalHtml() {
    if (!resetOpen) return ''
    return `
      <div class="modal-backdrop reset-modal" data-act="reset-cancel">
        <div class="confirm-sheet">
          <h2 class="confirm-sheet-title">Erase everything?</h2>
          <p class="confirm-sheet-body">Coins, upgrades, card slots and best scores will be permanently erased.</p>
          <div class="confirm-sheet-actions">
            <button class="btn btn--soft btn--small" data-act="reset-cancel">Cancel</button>
            <button class="btn btn--danger btn--small" data-act="reset-confirm">Erase everything</button>
          </div>
        </div>
      </div>`
  }

  function renderShop(bounceId) {
    const slots = meta.choiceSlots ?? 2
    const cost = sacrificeCost(slots)
    const cards = Object.entries(SHOP).map(([id, item]) => {
      const level = meta.shop[id]
      const maxed = level >= MAX_SHOP_LEVEL
      const buyCost = maxed ? 0 : shopCost(id, level)
      const afford = !maxed && meta.coins >= buyCost
      const pips = Array.from({ length: MAX_SHOP_LEVEL },
        (_, i) => `<i class="pip${i < level ? ' pip--on' : ''}"></i>`).join('')
      return `
        <button class="card shop-card${afford ? '' : ' card--disabled'}${id === bounceId ? ' card--bounce' : ''}" data-buy="${id}">
          <span class="shop-card-name">${item.name}</span>
          <span class="shop-card-desc">${item.desc}</span>
          <span class="pips">${pips}</span>
          <span class="shop-card-cost">${maxed ? 'MAX' : `🪙 ${buyCost}`}</span>
        </button>`
    }).join('')
    // Full re-render resets scroll positions — carry the sacrifice list's scroll across so
    // offering a stat at the bottom doesn't fling the player back to the top of the list.
    const prevScroll = screens.shop.querySelector('.sacrifice-sheet-body')?.scrollTop ?? 0
    // Nav (below) replaces the old "← Back" header; the coins badge floats top-right like the title.
    screens.shop.innerHTML = `
      <div class="coins-badge">🪙 <b>${meta.coins}</b></div>
      <div class="shop-grid">${cards}</div>
      ${sacrificeSectionHtml(slots, cost)}
      ${resetSectionHtml()}
      ${navHtml('shop')}
      ${sacrificeModalHtml(cost)}
      ${resetModalHtml()}
    `
    const body = screens.shop.querySelector('.sacrifice-sheet-body')
    if (body && prevScroll) body.scrollTop = prevScroll
  }

  // ---- hud (built once; updateHUD mutates in place) ---------------------
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
    </div>
    <div class="xp-row">
      <span class="lv-badge">Lv 1</span>
      <div class="xp-bar"><div class="xp-fill"></div></div>
    </div>
    <div class="weapon-row"></div>
  `
  const hud = {
    hpFill: screens.hud.querySelector('.hp-fill'),
    hpText: screens.hud.querySelector('.hp-text'),
    timer: screens.hud.querySelector('.hud-timer'),
    coins: screens.hud.querySelector('.hud-coins'),
    lv: screens.hud.querySelector('.lv-badge'),
    xpFill: screens.hud.querySelector('.xp-fill'),
    weaponRow: screens.hud.querySelector('.weapon-row'),
  }
  const last = { hp: NaN, maxHP: NaN, remain: NaN, coins: NaN, level: NaN, xpPct: NaN, weaponsSig: '' }

  function updateHUD(run) {
    const p = run.player
    if (p.hp !== last.hp || p.maxHP !== last.maxHP) {
      last.hp = p.hp
      last.maxHP = p.maxHP
      const ratio = Math.max(0, Math.min(1, p.hp / p.maxHP))
      hud.hpFill.style.width = `${ratio * 100}%`
      hud.hpFill.classList.toggle('hp-fill--low', ratio < 0.35)
      hud.hpText.textContent = `${Math.max(0, Math.ceil(p.hp))}/${p.maxHP}`
    }
    const remain = Math.max(0, Math.ceil(RUN_DURATION - run.time))
    if (remain !== last.remain) {
      last.remain = remain
      hud.timer.textContent = fmtTime(remain)
    }
    if (run.coinsEarned !== last.coins) {
      last.coins = run.coinsEarned
      hud.coins.textContent = `🪙 ${run.coinsEarned}`
    }
    if (p.level !== last.level) {
      last.level = p.level
      hud.lv.textContent = `Lv ${p.level}`
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
  }

  // ---- level-up modal ----------------------------------------------------
  let lvCards = []
  let lvFocus = 0

  function renderLevelup(data = {}) {
    const { choices = [], rerollCost: rerollN = 0, coins = 0 } = data
    const cards = choices.map((c, i) => {
      const rarity = c.rarity ?? 'normal'
      const rarityName = RARITIES[rarity]?.name ?? RARITIES.normal.name
      return `
      <button class="card lv-card" data-choose="${i}" data-rarity="${rarity}" style="animation-delay:${i * 90}ms">
        <i class="rarity-chip">${rarityName}</i>
        <span class="lv-card-icon">${c.icon ?? CHOICE_ICONS[c.kind] ?? '✨'}</span>
        <span class="lv-card-body">
          <span class="lv-card-title">${c.title}
            ${c.tag ? `<i class="tag ${c.tag === 'New!' ? 'tag--new' : 'tag--lv'}">${c.tag}</i>` : ''}
          </span>
          <span class="lv-card-desc">${c.desc}</span>
        </span>
      </button>`
    }).join('')
    const rerollDisabled = coins < rerollN
    screens.levelup.innerHTML = `
      <div class="modal">
        <h2 class="modal-title">LEVEL UP!</h2>
        <div class="lv-cards">${cards}</div>
        <p class="lv-hint">1-${choices.length} · arrows · enter · R reroll</p>
        <div class="lv-footer">
          <button class="btn btn--soft btn--small lv-reroll" data-act="reroll" ${rerollDisabled ? 'disabled' : ''}>🔄 Reroll (${rerollN}🪙)</button>
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
  }

  function effectChips(effects) {
    return Object.entries(effects).map(([key, v]) => {
      const [label, goodUp] = EFFECT_LABELS[key] ?? [key, true]
      const pct = Math.round((v - 1) * 100)
      const good = (pct > 0) === goodUp
      return `<span class="fx-chip ${good ? 'fx-chip--good' : 'fx-chip--bad'}">${pct > 0 ? '+' : ''}${pct}% ${label}</span>`
    }).join('')
  }

  function renderDaily() {
    const ids = dailyMutators(todayKey())
    const chId = dailyChapter(todayKey())
    const chapter = CHAPTERS[chId]
    const isPreview = !meta.chapters?.[chId]?.unlocked
    screens.daily.innerHTML = `
      <div class="modal daily-brief">
        <h2 class="modal-title">🌀 Daily Anomaly</h2>
        <p class="daily-date">${todayKey()}</p>
        <div class="daily-chapter">
          <span class="daily-chapter-icon">${chapter.icon}</span>
          <span class="daily-chapter-name">${chapter.name}</span>
          ${isPreview ? '<span class="daily-chapter-preview">preview</span>' : ''}
        </div>
        ${ids.map((id) => {
          const m = MUTATORS[id]
          return `
          <div class="daily-mutator">
            <span class="daily-mutator-icon">${m?.icon ?? '❔'}</span>
            <span class="daily-mutator-body">
              <span class="daily-mutator-name">${m?.name ?? id}</span>
              <span class="daily-mutator-desc">${m?.desc ?? ''}</span>
              <span class="daily-mutator-fx">${m ? effectChips(m.effects) : ''}</span>
            </span>
          </div>`
        }).join('')}
        <p class="daily-note">Everyone gets the same anomaly today — new one at midnight.</p>
        <button class="btn btn--big" data-act="daily-start">▶&nbsp; Start Daily Run</button>
      </div>
      ${navHtml('daily')}
    `
  }

  // ---- pause modal -------------------------------------------------------
  function renderPause(d) {
    const mutatorIds = d.mutators || []
    const mutatorBlock = mutatorIds.length ? `
      <div class="pause-mutators">
        <div class="pause-mutators-head">${d.mode === 'daily' ? '🌀 Daily Anomaly' : '🌀 Anomalies'}</div>
        ${mutatorIds.map((id) => `
          <div class="pause-mutator-line">
            <span class="pause-mutator-icon">${MUTATORS[id]?.icon ?? '❔'}</span>
            <span class="pause-mutator-body">
              <span class="pause-mutator-name">${MUTATORS[id]?.name ?? id}</span>
              <span class="pause-mutator-desc">${MUTATORS[id]?.desc ?? ''}</span>
            </span>
          </div>`).join('')}
      </div>` : ''
    screens.pause.innerHTML = `
      <div class="modal">
        <h2 class="modal-title">Paused</h2>
        ${mutatorBlock}
        <button class="btn btn--big" data-act="resume">▶&nbsp; Resume</button>
        <button class="btn btn--soft" data-act="quit">Quit to menu</button>
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
        <div class="summary-mutators-head">${d.mode === 'daily' ? '🌀 Daily Anomaly' : '🌀 Anomalies'}</div>
        ${mutatorIds.map((id) => `<div class="summary-mutator-line">${MUTATORS[id]?.icon ?? '❔'} ${MUTATORS[id]?.name ?? id}</div>`).join('')}
      </div>` : ''
    screens.summary.innerHTML = `
      <div class="modal">
        <h2 class="modal-title">${d.victory ? 'You escaped! 🎉' : 'Squished… 💦'}</h2>
        <p class="summary-chapter">${chapter.icon} ${chapter.name}</p>
        <div class="stats">
          <div class="stat-row"><span>Time</span><b>${fmtTime(d.time)}</b></div>
          <div class="stat-row"><span>Kills</span><b>${d.kills}</b></div>
          <div class="stat-row"><span>Level reached</span><b>${d.level}</b></div>
        </div>
        ${mutatorBlock}
        ${typeof d.unlockedDifficulty === 'number' ? `<div class="summary-unlock">🔓 Difficulty ${d.unlockedDifficulty} unlocked!</div>` : ''}
        ${d.unlockedChapter ? `<div class="summary-unlock summary-unlock--chapter">🌊 Chapter unlocked: ${d.unlockedChapter}!</div>` : ''}
        <div class="earned">🪙 +${d.earned}
          ${d.bonus > 0 ? `<span class="earned-bonus">+${d.bonus} finish bonus</span>` : ''}
        </div>
        <button class="btn btn--big" data-act="play" data-mode="${d.mode ?? 'classic'}">▶&nbsp; Play again</button>
        <button class="btn btn--soft" data-act="quit">Menu</button>
      </div>
    `
  }

  // ---- screen switching -----------------------------------------------------
  function showScreen(name, data) {
    if (name === 'title') renderTitle()
    else if (name === 'shop') renderShop()
    else if (name === 'daily') renderDaily()
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
      case 'reroll': hooks.onReroll(); break
      case 'sacrifice-start':
        sacrificeOpen = true
        sacrificePicks = {}
        sacrificeBounceId = null
        sacrificeAnimated = false // arm the once-only enter animation for the next render
        playSfx('click')
        renderShop()
        break
      case 'sacrifice-cancel':
        // A tap anywhere inside the sheet also resolves to this backdrop element (nothing in
        // the sheet stops propagation), so only close on a *direct* hit on the backdrop itself.
        if (el.classList.contains('modal-backdrop') && el !== e.target) break
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
