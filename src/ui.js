// DOM overlay inside #ui: title, shop, HUD, level-up, pause, summary. No Pixi.
import { SHOP, shopCost, MAX_SHOP_LEVEL, RUN_DURATION, RARITIES, WEAPONS, ELEMENTS, MUTATORS, dailyMutators, todayKey, MAX_DIFFICULTY, DIFFICULTY_HP_PER_LEVEL, DIFFICULTY_COIN_PER_LEVEL } from './config.js'
import { playSfx } from './audio.js'

const SCREEN_NAMES = ['title', 'shop', 'daily', 'hud', 'levelup', 'pause', 'summary']
const CHOICE_ICONS = { weapon: '⭐', passive: '💪', mod: '⭐', element: '✨', heal: '🍡' }

function fmtTime(s) {
  const t = Math.max(0, Math.floor(s))
  const m = String(Math.floor(t / 60)).padStart(2, '0')
  return `${m}:${String(t % 60).padStart(2, '0')}`
}

/**
 * Contract used by main.js:
 *   const ui = initUI({ meta, onPlay(mode), onBuy(id)->bool, onChoose(i), onPauseToggle, onQuit,
 *                       onDifficulty(d) })
 *     - onDifficulty(d): title-screen difficulty pips (1..MAX_DIFFICULTY); persists meta.difficulty.
 *     - onPlay(mode): mode is 'classic' | 'daily'. 'classic' fires from the title Play button
 *       and from the summary "Play again" button (which replays whatever mode the just-ended
 *       run used); 'daily' fires from the daily briefing screen's Start button (the title
 *       Daily Anomaly button opens the 'daily' briefing screen first).
 *   ui.showScreen('title' | 'shop' | 'daily' | 'hud' | 'levelup' | 'pause' | 'summary', data?)
 *     - 'pause' data: { mutators: string[] }   (run.mutators; omit/empty for classic runs)
 *     - 'summary' data: { victory, time, kills, level, earned, bonus, mutators?, mode }
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
  function renderTitle() {
    const { coins, best, runs } = meta
    const dailyIds = dailyMutators(todayKey())
    const dailyPreview = dailyIds.map((id) => `${MUTATORS[id]?.icon ?? '❔'} ${MUTATORS[id]?.name ?? id}`).join(' · ')
    screens.title.innerHTML = `
      <div class="coins-badge">🪙 <b>${coins}</b></div>
      <h1 class="title-logo"><span>Charming</span><span>Anomaly</span></h1>
      <p class="subtitle">escape the lab · outlive the swarm</p>
      <button class="btn btn--big" data-act="play">▶&nbsp; Play</button>
      <div class="diff-row">
        <span class="diff-label">Difficulty</span>
        ${Array.from({ length: MAX_DIFFICULTY }, (_, i) => {
          const d = i + 1
          return `<button class="diff-pip${d <= (meta.difficulty ?? 1) ? ' diff-pip--on' : ''}" data-act="diff" data-diff="${d}">${d}</button>`
        }).join('')}
      </div>
      <p class="diff-hint">${(meta.difficulty ?? 1) === 1
        ? 'the base game'
        : `+${meta.difficulty - 1} random anomal${meta.difficulty === 2 ? 'y' : 'ies'} · +${Math.round(((meta.difficulty - 1) * DIFFICULTY_HP_PER_LEVEL) * 100)}% enemy HP · <b class="diff-hint-reward">+${Math.round(((meta.difficulty - 1) * DIFFICULTY_COIN_PER_LEVEL) * 100)}% coins</b>`}</p>
      <button class="btn btn--daily" data-act="daily">🌀&nbsp; Daily Anomaly</button>
      <p class="daily-preview">${dailyPreview}</p>
      <button class="btn btn--soft" data-act="shop">🛒&nbsp; Shop</button>
      ${runs > 0 ? `<p class="best-line">best ${fmtTime(best.time)} · ${best.kills} kills · ${runs} run${runs === 1 ? '' : 's'}</p>` : ''}
    `
  }

  // ---- shop ------------------------------------------------------------
  function renderShop(bounceId) {
    const cards = Object.entries(SHOP).map(([id, item]) => {
      const level = meta.shop[id]
      const maxed = level >= MAX_SHOP_LEVEL
      const cost = maxed ? 0 : shopCost(id, level)
      const afford = !maxed && meta.coins >= cost
      const pips = Array.from({ length: MAX_SHOP_LEVEL },
        (_, i) => `<i class="pip${i < level ? ' pip--on' : ''}"></i>`).join('')
      return `
        <button class="card shop-card${afford ? '' : ' card--disabled'}${id === bounceId ? ' card--bounce' : ''}" data-buy="${id}">
          <span class="shop-card-name">${item.name}</span>
          <span class="shop-card-desc">${item.desc}</span>
          <span class="pips">${pips}</span>
          <span class="shop-card-cost">${maxed ? 'MAX' : `🪙 ${cost}`}</span>
        </button>`
    }).join('')
    screens.shop.innerHTML = `
      <header class="shop-head">
        <button class="btn btn--soft btn--small" data-act="back">← Back</button>
        <div class="coins-badge">🪙 <b>${meta.coins}</b></div>
      </header>
      <div class="shop-grid">${cards}</div>
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

  function renderLevelup(choices) {
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
    screens.levelup.innerHTML = `
      <div class="modal">
        <h2 class="modal-title">LEVEL UP!</h2>
        <div class="lv-cards">${cards}</div>
        <p class="lv-hint">1-3 · arrows · enter</p>
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
    const digit = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code]
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
    screens.daily.innerHTML = `
      <div class="modal daily-brief">
        <h2 class="modal-title">🌀 Daily Anomaly</h2>
        <p class="daily-date">${todayKey()}</p>
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
    const mutatorBlock = mutatorIds.length ? `
      <div class="summary-mutators">
        <div class="summary-mutators-head">${d.mode === 'daily' ? '🌀 Daily Anomaly' : '🌀 Anomalies'}</div>
        ${mutatorIds.map((id) => `<div class="summary-mutator-line">${MUTATORS[id]?.icon ?? '❔'} ${MUTATORS[id]?.name ?? id}</div>`).join('')}
      </div>` : ''
    screens.summary.innerHTML = `
      <div class="modal">
        <h2 class="modal-title">${d.victory ? 'You escaped! 🎉' : 'Squished… 💦'}</h2>
        <div class="stats">
          <div class="stat-row"><span>Time</span><b>${fmtTime(d.time)}</b></div>
          <div class="stat-row"><span>Kills</span><b>${d.kills}</b></div>
          <div class="stat-row"><span>Level reached</span><b>${d.level}</b></div>
        </div>
        ${mutatorBlock}
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
    else if (name === 'levelup') renderLevelup(data ?? [])
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
    const el = e.target.closest('[data-act], [data-buy], [data-choose]')
    if (!el) return
    if (el.dataset.buy !== undefined) {
      if (hooks.onBuy(el.dataset.buy)) renderShop(el.dataset.buy)
      return
    }
    if (el.dataset.choose !== undefined) {
      hooks.onChoose(Number(el.dataset.choose))
      return
    }
    switch (el.dataset.act) {
      case 'play': hooks.onPlay(el.dataset.mode || 'classic'); break
      case 'daily': playSfx('click'); showScreen('daily'); break
      case 'daily-start': hooks.onPlay('daily'); break
      case 'diff': hooks.onDifficulty(Number(el.dataset.diff)); renderTitle(); break
      case 'shop': playSfx('click'); showScreen('shop'); break
      case 'back': playSfx('click'); showScreen('title'); break
      case 'pause':
      case 'resume': playSfx('click'); hooks.onPauseToggle(); break
      case 'quit': playSfx('click'); hooks.onQuit(); break
    }
  })

  // Escape/KeyP from input.js — only meaningful while in a run
  window.addEventListener('game-pause', () => {
    if (active === 'hud' || active === 'pause') hooks.onPauseToggle()
  })

  showScreen('title')
  return { showScreen, updateHUD }
}
