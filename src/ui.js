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

// v5.0 chapter selector (title screen). One card per CHAPTER_ORDER entry: unlocked chapters
// show icon + name (mint border when selected); locked chapters render as an anonymous "???"
// card (🔒, no icon/name leak) and are disabled — the delegated click handler double-guards
// against a locked id ever reaching onChapter.
function chapterRowHtml(meta) {
  const cards = CHAPTER_ORDER.map((id) => {
    const chapter = CHAPTERS[id]
    const unlocked = meta.chapters?.[id]?.unlocked
    if (!unlocked) {
      return `
        <button class="chapter-card chapter-card--locked" data-act="chapter" data-id="${id}" disabled>
          <span class="chapter-card-icon">🔒</span>
          <span class="chapter-card-name">???</span>
        </button>`
    }
    const selected = id === meta.chapter
    return `
      <button class="chapter-card${selected ? ' chapter-card--selected' : ''}" data-act="chapter" data-id="${id}">
        <span class="chapter-card-icon">${chapter.icon}</span>
        <span class="chapter-card-name">${chapter.name}</span>
      </button>`
  }).join('')
  return `<div class="chapter-row">${cards}</div>`
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
 *     - onChapter(id): title screen's chapter-card row (see chapterRowHtml above). Only fires
 *       for CHAPTER_ORDER ids the delegated click handler already sees as unlocked (locked
 *       cards render disabled) — main.js re-guards via ensureChapterMeta(meta, id).unlocked,
 *       sets meta.chapter, saveMeta, plays 'click'. Like onDifficulty below, ui.js re-renders
 *       the title itself right after calling the hook — main.js never calls showScreen for it.
 *     - onDifficulty(d): title-screen difficulty pips (1..MAX_DIFFICULTY); persists to the
 *       SELECTED chapter's ladder, meta.chapters[meta.chapter].difficulty (v5.0 — see
 *       selectedChapterMeta below and state.js's meta.chapters doc block). Pips above that
 *       chapter's maxDifficulty render locked (🔒, disabled) and never fire this at all — level
 *       d+1 only unlocks by winning a classic run at level d in that same chapter (see endRun in
 *       main.js). Chapter selection itself is the onChapter hook right above.
 *     - onPlay(mode, consumableIds): mode is 'classic' | 'daily'. 'classic' fires from the title
 *       Play button (consumableIds = the title shelf's session-local selection, an array of
 *       CONSUMABLES ids; the selection is cleared as soon as onPlay fires) and from the summary
 *       "Play again" button (which replays whatever mode the just-ended run used, selection
 *       cleared the same way). 'daily' fires from the daily briefing screen's Start button with
 *       consumableIds always [] — boosters never apply to daily runs (the title Daily Anomaly
 *       button opens the 'daily' briefing screen first; the shelf itself only lives on title).
 *     - onReroll(): level-up screen's Reroll button (or the 'R' key). main.js is expected to
 *       no-op silently if unaffordable/wrong phase, otherwise deduct coins, bump run._rerolls,
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

  function consumablesShelfHtml() {
    const selectedCost = [...selectedConsumables].reduce((sum, id) => sum + (CONSUMABLES[id]?.cost ?? 0), 0)
    const chips = Object.entries(CONSUMABLES).map(([id, item]) => {
      const selected = selectedConsumables.has(id)
      const otherCost = selectedCost - (selected ? item.cost : 0)
      const afford = selected || (meta.coins - otherCost) >= item.cost
      return `
        <button class="chip--consumable${selected ? ' chip--selected' : ''}" data-consumable="${id}" ${afford ? '' : 'disabled'}>
          ${item.icon} ${item.name} · ${item.cost}🪙
        </button>`
    }).join('')
    return `
      <div class="consumables-shelf">
        <span class="consumables-label">Boosters (this run only)</span>
        <div class="consumables-row">${chips}</div>
      </div>`
  }

  function renderTitle() {
    const { coins, best, runs } = meta
    const chMeta = selectedChapterMeta(meta)
    const selectedChapter = CHAPTERS[meta.chapter] ?? CHAPTERS[CHAPTER_ORDER[0]]
    const furthestId = furthestUnlockedChapterId(meta)
    const lockedNextId = nextChapter(furthestId)
    const dailyIds = dailyMutators(todayKey())
    const dailyChapterInfo = CHAPTERS[dailyChapter(todayKey())]
    const dailyPreview = dailyIds.map((id) => `${MUTATORS[id]?.icon ?? '❔'} ${MUTATORS[id]?.name ?? id}`).join(' · ')
    screens.title.innerHTML = `
      <div class="coins-badge">🪙 <b>${coins}</b></div>
      <h1 class="title-logo"><span>Charming</span><span>Anomaly</span></h1>
      <p class="subtitle">escape the lab · outlive the swarm</p>
      <button class="btn btn--big" data-act="play">▶&nbsp; Play</button>
      ${chapterRowHtml(meta)}
      <p class="chapter-tagline">${selectedChapter.tagline}</p>
      ${lockedNextId ? `<p class="chapter-hint--locked">win ${CHAPTERS[furthestId].name} at difficulty 3+</p>` : ''}
      <div class="diff-row">
        <span class="diff-label">Difficulty</span>
        ${Array.from({ length: MAX_DIFFICULTY }, (_, i) => {
          const d = i + 1
          const locked = d > chMeta.maxDifficulty
          if (locked) return `<button class="diff-pip diff-pip--locked" data-act="diff" data-diff="${d}" disabled>🔒</button>`
          return `<button class="diff-pip${d <= chMeta.difficulty ? ' diff-pip--on' : ''}" data-act="diff" data-diff="${d}">${d}</button>`
        }).join('')}
      </div>
      <p class="diff-hint">${chMeta.difficulty === 1
        ? 'the base game'
        : `+${chMeta.difficulty - 1} random anomal${chMeta.difficulty === 2 ? 'y' : 'ies'} · +${Math.round(((chMeta.difficulty - 1) * DIFFICULTY_HP_PER_LEVEL) * 100)}% enemy HP · <b class="diff-hint-reward">+${Math.round(((chMeta.difficulty - 1) * DIFFICULTY_COIN_PER_LEVEL) * 100)}% coins</b>`}</p>
      ${chMeta.maxDifficulty < MAX_DIFFICULTY ? `<p class="diff-hint diff-hint--locked">win level ${chMeta.maxDifficulty} to unlock ${chMeta.maxDifficulty + 1}</p>` : ''}
      ${consumablesShelfHtml()}
      <button class="btn btn--daily" data-act="daily">🌀&nbsp; Daily Anomaly</button>
      <p class="daily-preview">${dailyChapterInfo.icon} ${dailyChapterInfo.name} · ${dailyPreview}</p>
      <button class="btn btn--soft" data-act="shop">🛒&nbsp; Shop</button>
      ${runs > 0 ? `<p class="best-line">best ${fmtTime(best.time)} · ${best.kills} kills · ${runs} run${runs === 1 ? '' : 's'}</p>` : ''}
    `
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

  // Full-screen sacrifice modal: a dim backdrop (tapping it directly, not the sheet, cancels —
  // see the sacrifice-cancel case below) centering a rounded sheet with a fixed header/footer
  // and a scrollable middle listing every owned SHOP stat. Stepper scheme: − offers one FEWER
  // level (undo), + offers one MORE (commit) — never ambiguous about which direction burns levels.
  function sacrificeModalHtml(cost) {
    if (!sacrificeOpen || cost == null) return ''
    const offered = sacrificeOffered()
    const ready = offered === cost
    const counterColor = ready ? 'var(--mint-dark)' : lerpColor('#7a7a90', '#c23a52', offered / cost)
    const rows = Object.entries(SHOP).filter(([id]) => (meta.shop[id] ?? 0) > 0).map(([id, item]) => {
      const level = meta.shop[id]
      const picked = sacrificePicks[id] ?? 0
      const kept = level - picked
      const pips = Array.from({ length: MAX_SHOP_LEVEL }, (_, i) => {
        const cls = i < kept ? 'pip pip--on' : i < level ? 'pip pip--lost' : 'pip'
        return `<i class="${cls}"></i>`
      }).join('')
      const canUndo = picked > 0
      const canOffer = picked < level && offered < cost
      // "disappearing" preview: current total bonus at this level -> what's left after the offer
      const preview = picked > 0
        ? `<span class="sacrifice-bonus-before">${formatShopBonus(id, level)}</span> → <span class="sacrifice-bonus-after">${formatShopBonus(id, kept)}</span>`
        : `<span class="sacrifice-bonus-before">${formatShopBonus(id, level)}</span>`
      return `
        <div class="sacrifice-stat-row${id === sacrificeBounceId ? ' sacrifice-stat-row--bounce' : ''}">
          <div class="sacrifice-stat-info">
            <span class="sacrifice-stat-name">${item.name}</span>
            <span class="sacrifice-bonus-preview">${preview}</span>
            <span class="pips">${pips}</span>
          </div>
          <div class="sacrifice-stepper">
            <button class="sacrifice-step sacrifice-step--minus" data-act="sacrifice-minus" data-id="${id}" ${canUndo ? '' : 'disabled'}>−</button>
            <span class="sacrifice-stepper-count${picked > 0 ? ' sacrifice-stepper-count--active' : ''}">${picked > 0 ? picked : '·'}</span>
            <button class="sacrifice-step sacrifice-step--plus" data-act="sacrifice-plus" data-id="${id}" ${canOffer ? '' : 'disabled'}>+</button>
          </div>
        </div>`
    }).join('')
    return `
      <div class="modal-backdrop sacrifice-modal" data-act="sacrifice-cancel">
        <div class="sacrifice-sheet">
          <header class="sacrifice-sheet-head">
            <span class="sacrifice-counter${ready ? ' sacrifice-counter--ready' : ''}" style="color:${counterColor}">🩸 Offered ${offered}/${cost}</span>
            <p class="sacrifice-modal-hint">Choose which upgrade levels to give up — this can't be undone.</p>
          </header>
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
    screens.shop.innerHTML = `
      <header class="shop-head">
        <button class="btn btn--soft btn--small" data-act="back">← Back</button>
        <div class="coins-badge">🪙 <b>${meta.coins}</b></div>
      </header>
      <div class="shop-grid">${cards}</div>
      ${sacrificeSectionHtml(slots, cost)}
      ${resetSectionHtml()}
      ${sacrificeModalHtml(cost)}
      ${resetModalHtml()}
    `
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
        <button class="btn btn--soft" data-act="back">← Back</button>
      </div>
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
    // keyboard nav for the level-up cards is only live while that screen shows
    document.removeEventListener('keydown', onLevelupKeydown)
    if (name === 'levelup') document.addEventListener('keydown', onLevelupKeydown)
    active = name
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
        hooks.onPlay(mode, ids)
        break
      }
      case 'daily': playSfx('click'); showScreen('daily'); break
      case 'daily-start': selectedConsumables.clear(); hooks.onPlay('daily', []); break
      case 'diff': {
        const d = Number(el.dataset.diff)
        if (d > selectedChapterMeta(meta).maxDifficulty) break // belt-and-braces: locked pips are disabled already
        hooks.onDifficulty(d)
        renderTitle()
        break
      }
      case 'chapter': {
        const id = el.dataset.id
        if (!meta.chapters?.[id]?.unlocked) break // belt-and-braces: locked cards are disabled already
        hooks.onChapter(id)
        renderTitle()
        break
      }
      case 'shop': playSfx('click'); showScreen('shop'); break
      case 'back':
        sacrificeOpen = false
        sacrificePicks = {}
        sacrificeBounceId = null
        resetOpen = false
        playSfx('click')
        showScreen('title')
        break
      case 'pause':
      case 'resume': playSfx('click'); hooks.onPauseToggle(); break
      case 'quit': playSfx('click'); hooks.onQuit(); break
      case 'reroll': hooks.onReroll(); break
      case 'sacrifice-start':
        sacrificeOpen = true
        sacrificePicks = {}
        sacrificeBounceId = null
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
      case 'sacrifice-minus': {
        // − undoes one previously-offered level (offer fewer)
        const id = el.dataset.id
        const have = sacrificePicks[id] ?? 0
        if (have > 0) {
          sacrificePicks[id] = have - 1
          sacrificeBounceId = id
          playSfx('click')
          renderShop()
        }
        break
      }
      case 'sacrifice-plus': {
        // + offers one more level (offer more), capped at both the stat's owned level and the
        // sacrifice's total cost
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
