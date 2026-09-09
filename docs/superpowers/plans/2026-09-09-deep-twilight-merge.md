# The Deep absorbs The Twilight — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge The Twilight into The Deep (its light weapons, the Deep's dark and maws, a re-cut four-creature roster, a Light-costed starter), delete The Twilight and the five weapons no chapter offers, measure, and ship WIP-gated.

**Architecture:** Every task leaves `npm run test:fast` green and is one commit on branch `deep-twilight-merge`. Config first (the roster, which un-breaks the suite the art commit left red), then the new weapon, then the pool, then the three deletions, then the measurements, then the adversarial pass and the gated ship. No new `run.*` arrays; the starter is a `run.bullets` projectile; the roster uses existing flags only.

**Tech Stack:** vanilla JS, PixiJS v8, Vite, `test/sim-test.js` (plain node asserts, mulberry32), `scripts/fx-probe.mjs`, `scripts/weapon-census.mjs`, `scripts/charge-probe.mjs`, `scripts/bake-cast.mjs`.

**Spec:** `docs/superpowers/specs/2026-09-09-deep-twilight-merge-design.md` — read it whole, including Revision 2 at the bottom, which overrides rev 1 where they disagree.

## Global Constraints

- Branch `deep-twilight-merge`, already checked out; commit with `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=commit.gpgsign GIT_CONFIG_VALUE_0=false git commit -F <file>` (GPG has no tty here). **Never** put a backtick inside a double-quoted zsh argument; write commit messages to a file.
- **Never choose a version number.** Only Task 9 ships, via `npm run ship "<sentence>"`.
- Read the repo's `CLAUDE.md` before Task 1. Load `.claude/skills/game-art-and-copy/SKILL.md` before touching `fr.js` or any player-visible string; `design-a-weapon` before Task 2; `designing-an-enemy` before Task 8; `probing-the-game` before any measurement; `shipping-a-release` before Task 9.
- `fr.js` edits go through node/python, never an exact-string anchor that includes French punctuation (U+00A0 before `: ; ! ?`).
- French for every new player-visible string is a **draft for the owner's review** and is flagged as such in the commit.
- Balance numbers live in `config.js` only. A balance decision is one `// balance_decision : <10 words> [date]` line, no essay.
- `npm run test:fast` after every task; `npm test` (full, ~77s) at Tasks 4, 7 and 9; `node scripts/test-isolation.mjs` at Task 9.
- **Never mutate the working tree from a reviewer subagent**; the reviewer prompt in Task 9 states the allowed/forbidden git commands verbatim.

---

### Task 1: The Deep's roster — lanternfish, barreleye, fangtooth, siphonophore

The art is already in `render.js` (commit 60e701e) under ids `lanternfish`, `barreleye`, `fangtooth`, `siphonophore`; the config roster still names the deleted looks, so the suite currently aborts at run RA. This task lands the roster and restores green.

**Files:**
- Modify: `src/config.js` — `CHAPTERS.deep` roster (lines ~8805–8831), `render.cast` (~8863), `webLook` (~8871–8877)
- Modify: `src/render.js:22299` (`syncWebs(..., webLook === 'slime')`) and the slime branch it selects inside `syncWebs`
- Modify: `src/fr.js` (creature names near line 1765)
- Modify: `test/sim-test.js` run DP.i (~32275–32285)
- Delete: `src/cast/hagfish.png`, `src/cast/viperfish.png`, `src/cast/gulper.png`
- Create (by script): `src/cast/lanternfish.png`, `src/cast/barreleye.png`, `src/cast/fangtooth.png`, `src/cast/siphonophore.png`

**Interfaces:**
- Produces: `CHAPTERS.deep.roster` ids `lanternfish` (normal), `barreleye` (normal), `fangtooth` (fast), `siphonophore` (tank); `CHAPTERS.deep.render.cast = ['lanternfish', 'fangtooth', 'siphonophore']`; `CHAPTERS.deep.eliteFlags = []`.

- [ ] **Step 1: Confirm the red baseline**

Run: `node test/sim-test.js rosterart 2>&1 | tail -3`
Expected: FAIL naming `hagfish` (or `viperfish`/`gulper`) with "ROSTER_LOOKS has no entry for it".

- [ ] **Step 2: Replace the roster block in `CHAPTERS.deep`**

Find the block (config.js ~8805–8831) that begins `  // THE ROSTER, AND THE ANGLERFISH IS NOT IN IT.` and ends with `  eliteFlags: ['webZone'],`. Replace the whole thing (comment, `roster: [...]`, `eliteFlags`) with:

```js
  // THE ROSTER, AND THE ANGLERFISH IS NOT IN IT. Owner, 2026-08-17: "the anglerfishes dont move,
  // they are not enemies, they are traps." It is `signature.maws` above — a streamed refill circle,
  // the same system The Surf's tide pools use — and the MAW_* block in this file says why at length.
  //
  // RE-CUT 2026-09-09 (spec 2026-09-09-deep-twilight-merge §7b, R2.1). Owner: "Redesign enemies
  // relevant to the abysses." The old three (hagfish/viperfish/gulper) were real abyssal animals
  // whose behaviour could have been any chapter's; these four are about the player's LIGHT. Every
  // flag is an existing one — no movement code was added for this roster.
  //   lanternfish   the crowd, and the ONE enemy you can see outside your lamp: it carries its own
  //                 photophores, and render.js punches the dark scrim for it (ROSTER_LOOKS.glow).
  //                 Flagless: what it does is be visible.
  //   barreleye     the second `normal`, flagless, the roster's baseline body (the Trawl's mackerel
  //                 argument: with a flag on every entry none reads as special). It shares the
  //                 archetype's spawn share with the lanternfish through `weight`.
  //   fangtooth     the fast slot: a burst dash, the viperfish's flag under an abyssal skin.
  //   siphonophore  the tank: a colony as long as a bus that comes apart into zooids when killed
  //                 (`split`). Its children wear this same bake at SPLIT_RADIUS_FRAC and inherit
  //                 SPLIT_HP_FRAC of its HP and xp, which is why xpMul sits under 1 — see Task 8's
  //                 measurement in the commit that set it.
  // hpMul/speedMul below are the OLD slots' numbers carried one-for-one (viperfish -> fangtooth,
  // gulper -> siphonophore) until Task 8 measures them; the two normals split a `normal`'s share.
  roster: [
    { id: 'lanternfish',  archetype: 'normal', name: 'Lanternfish',  hpMul: 1,   speedMul: 0.95, weight: 1.2, flags: [] },
    { id: 'barreleye',    archetype: 'normal', name: 'Barreleye',    hpMul: 1.1, speedMul: 0.9,  weight: 1,   flags: [] },
    { id: 'fangtooth',    archetype: 'fast',   name: 'Fangtooth',    hpMul: 0.9, speedMul: 1.08, flags: ['dashBurst'] },
    { id: 'siphonophore', archetype: 'tank',   name: 'Siphonophore', hpMul: 1.9, speedMul: 0.62, xpMul: 0.7, flags: ['split'] },
  ],
  // NO elite behaviour flag (R2.4): `webZone` existed for the hagfish's slime and nothing here
  // produces slime. Elites still roll affixes (ELITE_AFFIXES); this only stops a chapter flag being
  // pushed on top. `[]` is the Garden's shipped shape (config.js ~6241), so it is a legal value.
  eliteFlags: [],
```

- [ ] **Step 3: Cast and webLook**

In the same block's `render:` (~8863) change `cast: ['hagfish', 'viperfish', 'gulper'],` to `cast: ['lanternfish', 'fangtooth', 'siphonophore'],` and add the comment line above it: `// Three, like every chapter card; the barreleye is off the card (R2.6) — swap at the assets check.`

Delete the `webLook: 'slime',` line and the five comment lines above it (from `// The hagfish's slow patch is SLIME, not silk.` to `// byte-identical to the garden's, and only the drawing changes (see syncWebs).`).

- [ ] **Step 4: Delete the slime web look in render.js**

At `src/render.js:22299` change `syncWebs(run.webs || [], CHAPTERS[run.chapter]?.render?.webLook === 'slime')` to `syncWebs(run.webs || [])`. Open `function syncWebs(` (~17341) and remove its second parameter and every branch it selects (the slime drawing, ~17341–17400 — read it, delete only the `slime` branches, keep the garden's orb web). Grep: `grep -n "slime\|webLook" src/render.js src/config.js` must return nothing outside comments.

- [ ] **Step 5: French names**

In `src/fr.js` replace the three lines
```js
  'Hagfish': 'Myxine Gluante',
  'Viperfish': 'Poisson-Vipère',
  'Gulper Eel': 'Grandgousier',
```
with
```js
  // The Deep's re-cut roster (2026-09-09). DRAFTS pending the owner's review, like every creature
  // name in this block: 'Poisson-lanterne' and 'Poisson-ogre' are the French common names;
  // 'Revenant' is the trade name for Macropinna and reads better on a card than 'Œil-tonneau';
  // 'Siphonophore' is the same word.
  'Lanternfish': 'Poisson-lanterne',
  'Barreleye': 'Revenant',
  'Fangtooth': 'Poisson-ogre',
  'Siphonophore': 'Siphonophore',
```

- [ ] **Step 6: Bake the cast thumbs**

Run: `rm src/cast/hagfish.png src/cast/viperfish.png src/cast/gulper.png && node scripts/bake-cast.mjs 2>&1 | tail -3 && ls src/cast | grep -c "lanternfish\|barreleye\|fangtooth\|siphonophore"`
Expected: the bake lists the four ids; the count prints `4`. (bake-cast needs the dev server on 5173: `npx vite --port 5173 --strictPort > /tmp/vite.log 2>&1 &` first if it is not running.)

- [ ] **Step 7: Fix run DP.i**

In `test/sim-test.js` ~32275, replace
```js
    assert.ok(CHAPTERS.deep.weapons.includes('finHit') && CHAPTERS.deep.starter === 'finHit',
      `run DP.i: the pool is [${CHAPTERS.deep.weapons}] starting '${CHAPTERS.deep.starter}' — its own native is not fielded`)
```
with
```js
    assert.ok(CHAPTERS.deep.weapons.includes(CHAPTERS.deep.starter),
      `run DP.i: the pool is [${CHAPTERS.deep.weapons}] starting '${CHAPTERS.deep.starter}' — the starter is not in its own pool`)
    assert.deepStrictEqual(CHAPTERS.deep.roster.map((r) => r.id), ['lanternfish', 'barreleye', 'fangtooth', 'siphonophore'],
      'run DP.i: the roster is not the 2026-09-09 re-cut (spec 2026-09-09-deep-twilight-merge §7b)')
    assert.deepStrictEqual(CHAPTERS.deep.eliteFlags, [], 'run DP.i: an elite behaviour flag came back — nothing on this roster produces slime (R2.4)')
```

- [ ] **Step 8: Run the fast suite**

Run: `npm run test:fast 2>&1 | tail -4`
Expected: `ALL TESTS PASSED` (or the last line naming what a partial run skipped). If run DA.h complains about an archetype, the roster above covers all three — read the message. If run VO complains, `eliteFlags: []` is not the cause (the Garden ships it).

- [ ] **Step 9: Commit**

Write `/tmp/c1.txt`:
```
feat(deep): the re-cut roster — lanternfish, barreleye, fangtooth, siphonophore — replaces hagfish/viperfish/gulper

Spec 2026-09-09-deep-twilight-merge §7b + R2.1/R2.4. Flags are existing ones only. eliteFlags is
empty: the slime elite and its render branch existed for the hagfish. hp/speed numbers are the old
slots' carried one-for-one until Task 8 measures; siphonophore xpMul 0.7 is the split tax (R2.6),
also to be measured. French creature names are DRAFTS for the owner's review.
```
Run: `git add -A src/config.js src/render.js src/fr.js src/cast test/sim-test.js && GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=commit.gpgsign GIT_CONFIG_VALUE_0=false git commit -F /tmp/c1.txt && git status --short`
Expected: clean status.

---

### Task 2: Glint — the Light-costed starter dart

A mimic of Spike Protein (`WEAPONS.star`, `fireStar` at sim.js ~8244) firing darts of light at the nearest enemy; costs 1 Light per cast, clamped at zero, still fires at zero (spec §3.1, R2.5). Not in any pool yet (Task 3 adds it), so no chapter changes here.

**Files:**
- Modify: `src/config.js` — `WEAPONS` (insert after `sunlance`'s entry, before `// ---- The Shelf's three natives`), `WEAPON_MODS` (insert after `sunlance`'s block), `WEAPON_RATE_MODS` (line ~4258 row), new const `GLINT_LIGHT_COST` beside `STAR_FAN` (~2942)
- Modify: `src/sim.js` — `WEAPON_STAT_MODS` (~7962), the dispatcher (~8144), a new `stepGlintWeapon`/`fireGlint` after `stepSunlanceWeapon`, the import list for `GLINT_LIGHT_COST`
- Modify: `src/render.js` — `placeBullet` (~22401) gains a `glint` case
- Modify: `src/fr.js` — name, desc, four mod names/descs
- Modify: `test/sim-test.js` — new `testGlint()` beside `testSunlance()` (~23991) and its call beside `testSunlance()` (~23250)

**Interfaces:**
- Produces: weapon id `'glint'`, rarity `'normal'`, `levels[]` keys `dmg, interval, count, speed, pierce`; mods `bright` (dmg pct), `keenLight` (pierce flat, `maxPicks: PIERCE_MAX_PICKS`), `secondGlint` (tier, extra dart), `quickGlint` (rate); export `GLINT_LIGHT_COST = 1`; bullets carry `weapon: 'glint'`; emits `{type:'shoot', weapon:'glint'}` (already a render+sfx consumer).

- [ ] **Step 1: Write the failing test**

Insert before `function run0ChargeMax()` in `test/sim-test.js` (~23985):

```js
// (d) GLINT, the starter: a dart at the nearest body that costs 1 Light per CAST and never
// refuses to fire. Both halves are EFFECTS: the bar read after casts, the enemy's HP after darts.
function testGlint() {
  const L = 1
  const lvl = WEAPONS.glint.levels[L - 1]
  assert.strictEqual(WEAPONS.glint.rarity, 'normal', 'Glint is the starter, and a starter is normal rarity')
  const mk = (charge) => {
    Math.random = mulberry32(20260909)
    const run = deepRun('glint', L)
    run.charge = charge
    const p = run.player
    const e = makeStatusEnemy(run, { x: p.x + 90, y: p.y, hp: 1e6, speed: 0 })
    run.enemies.push(e)
    return { run, e }
  }
  const step = (run, n) => { for (let i = 0; i < n; i++) { stepSim(run, { x: 0, y: 0, skill: false }, 1 / 60); run.events.length = 0 } }
  // (1) ONE CAST COSTS ONE LIGHT. Drain is switched off so the only thing moving the bar is the cast.
  {
    const { run, e } = mk(50)
    run.chargeDrainMul = 0
    const before = run.charge
    step(run, Math.round((lvl.interval + 0.05) * 60))
    assert.ok(e.hp < 1e6, 'the dart never landed — the fixture is not exercising the weapon')
    const casts = Math.floor((lvl.interval + 0.05) / lvl.interval)
    assert.ok(Math.abs((before - run.charge) - casts * GLINT_LIGHT_COST) < 1e-6,
      `${casts} cast(s) moved the bar ${(before - run.charge).toFixed(2)}, want ${casts * GLINT_LIGHT_COST} — the cost is per projectile, or missing`)
  }
  // (2) AT ZERO IT STILL FIRES AND THE BAR STAYS AT ZERO — the no-spiral floor, spec §3.1.
  {
    const { run, e } = mk(0)
    run.chargeDrainMul = 0
    step(run, Math.round((lvl.interval * 3) * 60))
    assert.ok(e.hp < 1e6, 'Glint refused to fire at an empty bar — that is the death spiral the spec forbids')
    assert.strictEqual(run.charge, 0, `the bar went to ${run.charge} — a clamp is missing`)
  }
  // (3) THE COST DOES NOT GO THROUGH THE AMBIENT DRAIN'S MULTIPLIER (Slow Burn is not an ammo card).
  {
    const { run } = mk(50)
    run.chargeDrainMul = 0
    run.chargeMax = 100
    step(run, Math.round((lvl.interval + 0.05) * 60))
    assert.ok(run.charge < 50, 'with chargeDrainMul 0 the cast still costs — it must not be folded into the drain term')
  }
  console.log(`PASS run SH.d (glint): 1 Light per cast (${GLINT_LIGHT_COST}), fires at an empty bar with the bar held at 0, cost independent of chargeDrainMul`)
}
```

Also add `GLINT_LIGHT_COST` to the test file's import from `../src/config.js` (find the existing `SUNLANCE_REACH_MIN` in that import list and append `, GLINT_LIGHT_COST`). `deepRun` does not exist yet; **Task 4 renames `twilightRun` to `deepRun`** — for this task, define at the top of `testGlint` a local:

```js
  const deepRun = (weaponId, level) => {
    const meta = makeMeta(); meta.dev = true; ensureChapterMeta(meta)
    const run = createRun(meta, { chapter: 'deep', difficulty: 1 })
    run.weapons = [{ id: weaponId, level }]
    run.player.maxHP = run.player.hp = 1e9
    run.enemies.length = 0; run.shafts.length = 0
    return run
  }
```
(Task 4 replaces this local with the shared helper.) Add `testGlint()` right after the `testSunlance()` call (~23250).

- [ ] **Step 2: Run it to see it fail**

Run: `node test/sim-test.js twilightweapons 2>&1 | tail -3`
Expected: FAIL — `WEAPONS.glint` is undefined (TypeError reading `levels`).

- [ ] **Step 3: Config — the weapon, its cost, its mods**

Beside `STAR_FAN` (config.js ~2942) add:
```js
// GLINT (The Deep's starter, 2026-09-09). Light spent per CAST, whatever the dart count; clamped at
// zero at the fire site, and the weapon fires at zero — spec 2026-09-09-deep-twilight-merge §3.1.
// Per cast rather than per dart so levelling adds darts, not cost (~1.8-3 Light/s across the
// ladder against the chapter's own 2.0/s ambient drain).
export const GLINT_LIGHT_COST = 1
```

After `sunlance`'s closing `  },` in `WEAPONS` (before `// ---- The Shelf's three natives`) insert:
```js
  // -- The Deep's starter (2026-09-09) ------------------------------------------------------------
  // Owner: "a mimic of chapter 1-1, just a small light projectile. Costs 1 light to fire." This is
  // Spike Protein's ladder in light: a dart at the nearest body, `count` rising with level, pierce,
  // speed. It reads the bar ONCE, as ammo — GLINT_LIGHT_COST per cast — and never for damage or
  // reach (the Foxfire/Sunlance pair own the bar's two ends). At zero Light it still fires and the
  // bar simply cannot go lower: blind, never unarmed.
  // NAMES THE BAR in the HUD's own word ('Light'), the Sunlance idiom.
  glint: {
    name: 'Glint',
    desc: 'Flings a dart of light at what is nearest. Each cast costs 1 Light.',
    icon: '✨', rarity: 'normal',
    // ⚠ UNMEASURED FIRST CUT: Spike Protein's numbers with the fan one dart narrower at L5, so the
    // chapter's opening is Book 1's opening. Task 8 censuses it beside Sunspear.
    levels: [
      { dmg: 12, interval: 0.55, count: 1, speed: 480, pierce: 1 },
      { dmg: 14, interval: 0.50, count: 2, speed: 480, pierce: 1 },
      { dmg: 16, interval: 0.45, count: 2, speed: 500, pierce: 2 },
      { dmg: 19, interval: 0.40, count: 3, speed: 520, pierce: 2 },
      { dmg: 24, interval: 0.34, count: 3, speed: 560, pierce: 3 },
    ],
  },
```
Check the desc's number is not templated: `1` is `GLINT_LIGHT_COST`; write the desc as a template so the two cannot drift: `desc: \`Flings a dart of light at what is nearest. Each cast costs ${GLINT_LIGHT_COST} Light.\`` — `GLINT_LIGHT_COST` is declared above `WEAPONS` (line ~2942 < WEAPONS), so no TDZ.

After `sunlance`'s block in `WEAPON_MODS` (the one ending `heldLance: {...},\n  },`) insert:
```js
  // Glint's four (2026-09-09). Spike Protein's axes in light. NONE touches the Light cost — a mod
  // that discounted or refunded it would sell the bar back as a card, the line the Twilight's mods
  // held ("none of them buys the BAR"). Display names checked against fr.js for collisions.
  glint: {
    bright:      { name: 'Bright',       desc: 'dart damage', icon: '💥', base: 0.30, kind: 'pct' },
    keenLight:   { name: 'Keen Light',   desc: 'dart pierce', icon: '🎯', base: 1, kind: 'flat', maxPicks: PIERCE_MAX_PICKS },
    secondGlint: { name: 'Second Glint', desc: 'extra dart(s) per cast', icon: '💫', kind: 'tier' },
    quickGlint:  { name: 'Quick Glint',  desc: 'cast rate', icon: '⏩', base: 0.25, kind: 'pct' },
  },
```
In `WEAPON_RATE_MODS` change `  bringItIn: 'quickReel', screw: 'overspeed',` to `  bringItIn: 'quickReel', screw: 'overspeed', glint: 'quickGlint',`.

Grep first: `grep -n "'Bright'\|'Keen Light'\|'Second Glint'\|'Quick Glint'\|'Glint'" src/fr.js` must return nothing (a duplicate display name silently inherits a translation).

- [ ] **Step 4: sim.js — folds, dispatcher, fire site**

In `WEAPON_STAT_MODS` (~7962, after the `sunlance:` row) add:
```js
  // Glint: `secondGlint` is a per-cast COUNT read at the fire site like star's multishot;
  // `quickGlint` is in WEAPON_RATE_MODS. The other two fold.
  glint:         { bright: ['dmg', 'pct'], keenLight: ['pierce', 'flat'] },
```
In the dispatcher after `else if (w.id === 'sunlance') stepSunlanceWeapon(run, w, stats, fireRateMul, dt)` add `    else if (w.id === 'glint') stepGlintWeapon(run, w, stats, fireRateMul, dt)`.

After `stepSunlanceWeapon`'s closing `}` add:
```js
// Glint. fireStar's shape in light (a run.bullets entry tagged weapon:'glint'), with ONE addition:
// the cast spends GLINT_LIGHT_COST off run.charge, clamped at 0, BEFORE the darts leave — and it
// fires whether or not there was Light to spend. Not chargeDrainMul (Slow Burn is about the
// ambient drain, not ammo) and not a refill in reverse. Spec 2026-09-09-deep-twilight-merge §3.1.
function stepGlintWeapon(run, w, stats, fireRateMul, dt) {
  const quick = run.weaponMods.glint?.quickGlint ?? 0
  fireOnTimer(run, w.id, stats.interval / (fireRateMul * (1 + quick)), dt, () => fireGlint(run, stats))
}

function fireGlint(run, stats) {
  const p = run.player
  run.charge = Math.max(0, run.charge - GLINT_LIGHT_COST)
  const target = nearestEnemy(run)
  const baseAngle = target ? Math.atan2(target.y - p.y, target.x - p.x) : (p.facing >= 0 ? 0 : Math.PI)
  // ONE local for the count, used as the loop bound AND the fan divisor (the per-cast-count trap).
  const count = ipecacN(run, stats.count + (run.weaponMods.glint?.secondGlint ?? 0))
  for (let i = 0; i < count; i++) {
    const angle = baseAngle + (i - (count - 1) / 2) * STAR_FAN
    run.bullets.push({
      x: p.x, y: p.y,
      vx: Math.cos(angle) * stats.speed, vy: Math.sin(angle) * stats.speed,
      dmg: stats.dmg, pierce: stats.pierce, life: STAR_LIFE, r: STAR_R, speed: stats.speed,
      hitIds: new Set(), _shard: false, _splitDone: false, _chainsLeft: 0,
      weapon: 'glint',
    })
  }
  run.events.push({ type: 'shoot', weapon: 'glint' })
}
```
Add `GLINT_LIGHT_COST` to sim.js's import list from `./config.js` (next to `SUNLANCE_REACH_MIN`). Check `nearestEnemy`, `ipecacN`, `STAR_FAN`, `STAR_LIFE`, `STAR_R` are in scope (all used by `fireStar` in the same file).

Then read `stepBullets` (grep `function stepBullets`) for any `star`-specific mod read (`run.weaponMods.star?.split`, `chain`) and confirm it keys off the bullet's own `_splitDone`/`_chainsLeft` fields, not the weapon id — the plan expects it does; if it reads `run.weaponMods.star` unconditionally, a Glint dart would inherit Spike Protein's Mitosis when both are held (the Blank holds every Book 1 weapon; the Deep never holds star). Note the finding in the commit either way.

- [ ] **Step 5: render.js — the dart**

In `placeBullet` (~22401) add before the default path:
```js
    if (b.weapon === 'glint') {
      // A dart of light: the star bullet's bake, cold and small, so it reads as the chapter's own
      // light and not Spike Protein's amber.
      if (s.texture !== T.bullet.tex) { s.texture = T.bullet.tex; s.anchor.set(T.bullet.ax, T.bullet.ay) }
      s.tint = 0xbfefff
      s.rotation = Math.atan2(b.vy, b.vx)
      s.scale.set(0.75)
      return
    }
```
Read the default path below it to see whether it sets `s.tint`/`s.scale` unconditionally (it must, or a glint dart's tint leaks onto the next star reused from the pool); if it does not, add `s.tint = 0xffffff; s.scale.set(1)` to the default path.

- [ ] **Step 6: French (drafts)**

Append to `src/fr.js` after the Sunlance mod lines (`'how long the lance is held': ...`), via python:
```js
  // The Deep's starter (2026-09-09). DRAFTS pending the owner's review.
  'Glint': 'Lueur',
  'Flings a dart of light at what is nearest. Each cast costs {n} Light.': 'Lance un dard de lumière sur ce qui est le plus proche. Chaque tir coûte {n} Lumière.',
  'Bright': 'Vive',
  'dart damage': 'dégâts du dard',
  'Keen Light': 'Lumière Acérée',
  'dart pierce': 'perforation du dard',
  'Second Glint': 'Seconde Lueur',
  'extra dart(s) per cast': 'dard(s) en plus par tir',
  'Quick Glint': 'Lueur Rapide',
  'cast rate': 'cadence de tir',
```
⚠ The desc is a template only if `WEAPONS.glint.desc` is written with `tt()`-style braces; the Sunspear/Trawl precedent bakes the number into the English key (see Tight Weave's fr comment: "the desc IS a template on the English side … change TIGHT_WEAVE_TEAR_MUL and the English key changes with it, so run XX goes red"). Follow that precedent: keep the desc as the JS template literal from Step 3 (the key is the rendered English, `…costs 1 Light.`) and make the fr key match it exactly: `'Flings a dart of light at what is nearest. Each cast costs 1 Light.': 'Lance un dard de lumière sur ce qui est le plus proche. Chaque tir coûte 1 Lumière.'`. Drop the `{n}` form. Run XX will tell you if the key does not match.

`'cast rate'` may already exist in fr.js — grep; if it does, do not add a second copy.

- [ ] **Step 7: Run the tests**

Run: `node test/sim-test.js twilightweapons 2>&1 | tail -3 && node test/sim-test.js modbudget 2>&1 | tail -2 && node test/sim-test.js xx 2>&1 | tail -2 && npm run test:fast 2>&1 | tail -3`
Expected: `PASS run SH.d (glint)…`, MB.a green (every glint mod resolves), XX green (French covers every new string), suite green.

- [ ] **Step 8: Shoot it**

Create `scripts/scenes/deep-glint.js`:
```js
// Scene: The Deep's starter, Glint — darts of light leaving the player toward a crowd, at the bar
// the card is actually played on (half). Question: does a dart read as LIGHT against this floor,
// and not as Spike Protein's amber star?
//   node scripts/fx-probe.mjs --scene scripts/scenes/deep-glint.js --chapter deep --out /tmp/gl --frames 8
H.weapon('glint', 3)
H.breed(12)
const crowd = H.keep(12)
H.place((i, p) => ({ x: p.x + 110 + (i % 4) * 34, y: p.y + ((i % 3) - 1) * 40 + Math.floor(i / 4) * 12 }))
run.shafts.length = 0
run.charge = run.chargeMax * 0.5
H.until(() => run.bullets.some((b) => b.weapon === 'glint'))
H.note([run.chapter, 'glint L3, bar 50%, darts=' + run.bullets.length].join(' '))
return () => { run.charge = run.chargeMax * 0.5; for (let k = 0; k < 3; k++) H.tickFx(1 / 60); H.pin(); H.render() }
```
Run it, read `/tmp/gl-03.png`, and state in the commit what the dart reads as. If it reads as amber, change the tint in Step 5 and reshoot.

- [ ] **Step 9: Commit**

`/tmp/c2.txt`:
```
feat(deep): Glint, a starter dart of light that costs 1 Light per cast and still fires at zero

Spec §3.1 / R2.5. fireStar's shape with one addition: the cast spends GLINT_LIGHT_COST off
run.charge, clamped at 0, independent of chargeDrainMul. Four mods (dmg / pierce / count / rate),
none touching the cost. Not in any pool yet — Task 3 fields it. French is a DRAFT. Run SH.d
asserts the cost per cast, the fire-at-zero floor, and the clamp.
```

---

### Task 3: The Deep's pool — Glint starter, Sunspear at double damage

**Files:**
- Modify: `src/config.js` — `CHAPTERS.deep.weapons` (~8853) and the comment block above it (~8846–8852), `WEAPONS.sunspear.levels` (~2246–2252) and its comment (~2193, ~2222–2225)
- Modify: `test/sim-test.js` — run DP.g and DP.h (32187–32266) deleted; run RN's `(a)` pool assert unaffected (Reef); `testTwilightWeapons`'s pool assert (23785–23795) unaffected until Task 4

- [ ] **Step 1: The pool**

Replace the block from `  // ---- the arsenal. One native and two borrowed, and BOTH BORROWS ARE ABSTRACT CASTS` through `  weapons: ['finHit', 'chitterShriek', 'mines'], starter: 'finHit',` with:
```js
  // ---- the arsenal (2026-09-09, spec 2026-09-09-deep-twilight-merge §3). Owner: "I want the
  // weapons of the twilight (light related) but the darkness of the abyss." Four light cards, no
  // borrows: two normal, two rare — The Shelf's exact shape.
  //   glint     the starter (§3.1): a dart at what is nearest, 1 Light per cast, fires at zero.
  //   sunspear  columns of light on what is nearest, at DOUBLE its Twilight damage (§3.2, R2.2 —
  //             measured in Task 8; the retune clause is written down there).
  //   foxfire   a cold fire that takes hold in the dark — the bar's empty end.
  //   sunlance  a stab of hard light that reaches as far as your Light does — the bar's full end.
  // Fin Hit, Chitter Shriek and mines left with this change; Fin Hit is deleted outright (§5.2).
  weapons: ['glint', 'sunspear', 'foxfire', 'sunlance'], starter: 'glint',
```

- [ ] **Step 2: Sunspear**

In `WEAPONS.sunspear.levels` double every `dmg`: `17→34, 21→42, 26→52, 32→64, 40→80`. Directly above `levels: [` add:
```js
    // balance_decision : dmg doubled on leaving the starter slot, owner ruling [2026-09-09]
    //  - its own block above says damage was the WRONG knob (-23% measured better); Task 8 measures
    //    this beside Glint and the two rares, and it comes back down if it is the pool's runaway best
```
Fix the stale line ~2193 `// The chapter's starter and the tagline made literal — the light only goes down. A column is a` → `// The Deep's second normal (the starter until 2026-09-09; see CHAPTERS.deep). A column is a`. Grep `grep -n "Pulse's AMMO\|starter" src/config.js | sed -n '/sunspear/p'` — any other line in Sunspear's block calling it the starter is reworded.

- [ ] **Step 3: Delete the Fin Hit arms of run DP**

Delete `test/sim-test.js` lines from `  // (g) FIN HIT IS ZERO AT A STANDSTILL AND SCALES WITH SPEED.` (32187) up to but not including `  // (i) THE CHAPTER IS ACTUALLY WIRED IN.` (32267). Then find `rig(` in `testTheDeep` — if the `rig` helper is now only used by deleted arms, delete it too (grep `rig(` within 31948–32363).

- [ ] **Step 4: Tests**

Run: `node test/sim-test.js thedeep 2>&1 | tail -3 && node test/sim-test.js twilightweapons 2>&1 | tail -3 && npm run test:fast 2>&1 | tail -3`
Expected: green. run MB.a2 does not lint `deep` (it covers surf/shelf/reef/wreck), so ALSO run `node scripts/chapter-stage.mjs deep 2>&1 | grep -A3 ideation` and confirm `4 weapon(s)` and `all 4 pool weapons carry 4+ mods`.

- [ ] **Step 5: Commit**

`/tmp/c3.txt`: `feat(deep): the pool is four light cards — Glint starts you, Sunspear at double damage, Foxfire, Sunlance; Fin Hit, Chitter Shriek and mines leave it` + a body citing §3, §3.2 and R2.2's retune clause.

---

### Task 4: Delete The Twilight

Everything keyed to `twilight`, `copepod` or `krill`. The shafts machinery (`type: 'shafts'`, drift) STAYS — The Shelf's signature is the same type with the same drift (config.js ~7048). Read spec §5.1 and R2.3/R2.4 first.

**Files:**
- Modify: `src/config.js` — delete lines 6741–6973 (the block from `// v7.x Book 2 ("Undertow") chapter 5 — THE TWILIGHT.` through the `}` closing `CHAPTERS.twilight`), `BOOKS.undertow.chapters` (6057), the signature self-check row (~8900 `['twilight', CHAPTERS.twilight.signature],`), `CHAPTER_SPINE` row (~10098 `twilight: 'Twilight',`), `MUTATORS.sticky.exclude` (~14596, drop `'twilight'`)
- Modify: `src/state.js` — delete the hop 305–320 (from `// v7.x THE SHELF -> THE TWILIGHT (2026-08-17).` through the closing `}` of the `if`), R2.3
- Modify: `src/render.js:11629` (`twilight: BIOME_SHELF,` row and its comment), `ROSTER_LOOKS` rows `copepod`/`krill` and their comment (~4700), `drawCopepod` and `drawKrill` functions (grep `function drawCopepod`/`function drawKrill`, delete each with its comment block above)
- Modify: `src/fr.js` — delete keys `'The Twilight'`, `'Twilight'`, `'the light only goes down'`, `'Copepod'`, `'Krill'`, and the Twilight comment block (~1715–1731); keep `'Light'`
- Modify: `scripts/charge-probe.mjs:59` default `'twilight'` → `'deep'` (and the header comment at 54: say the tables were measured on the shafts); `scripts/obstacle-contrast.mjs:48` delete the `twilight:` row
- Delete: `scripts/scenes/twilight-cast.js`, `twilight-dark.js`, `twilight-drawdown.js`; rename `twilight-sunspear.js → deep-sunspear.js`, `twilight-foxfire.js → deep-foxfire.js`, `twilight-foxfire-dark.js → deep-foxfire-dark.js`, `twilight-sunlance.js → deep-sunlance.js` and inside each replace `--chapter twilight` with `--chapter deep` and `twilight` in prose with `deep`
- Delete: `src/cast/copepod.png`, `src/cast/krill.png`
- Modify: `test/sim-test.js` — the 61 references, itemised in Step 5

- [ ] **Step 1: Delete the sources**

Do the config/state/render/fr/scripts/scenes/cast edits listed above. For config.js use line numbers only after re-checking them (`grep -n "chapter 5 — THE TWILIGHT\|^CHAPTERS.twilight = {" src/config.js` and the `awk` for the closing `}`), because Tasks 1–3 shifted lines.

- [ ] **Step 2: Grep for survivors**

Run: `grep -n "twilight\|copepod\|krill\|Twilight" src/*.js scripts/*.mjs scripts/scenes/*.js | grep -v "^\S*:\s*[0-9]*:\s*//"`
Expected: nothing. Then `grep -rn "twilight" src/ scripts/ --include=*.js --include=*.mjs | wc -l` — comments may remain where they are history (e.g. "moved from The Twilight"); reword any that state a present-tense fact about a chapter that no longer exists.

- [ ] **Step 3: Confirm the suite is red for the right reasons**

Run: `npm run test:fast 2>&1 | grep -n "Error\|twilight" | head -5`
Expected: the first failure is in one of the blocks itemised below.

- [ ] **Step 4: Fix the tests, block by block**

Work top to bottom. Line numbers are pre-Task-1; anchor on the quoted text.

1. **WIP gate (4716–4816):** every `'twilight'` → `'deep'`; the message at 4716 becomes `"isWipChapter('deep') — the rung below The Wreck is still gated"`; `CHAPTERS.twilight.starter` → `CHAPTERS.deep.starter`; the `wipLocked` object's `twilight:` key → `deep:`.
2. **run BL `runTwilight` (6153–6362):** rename to `runShelfLight`; `twilightMeta` → `shelfMeta` with `chapter: 'shelf'` and `[...CHAPTER_ORDER, 'shelf']`; `CHAPTERS.twilight.resource/signature` → `CHAPTERS.shelf.…` (same `type: 'shafts'`, same drift). Arm **(h) The Pulse** (6319–6348): DELETE — no chapter fields the plain Pulse after the merge (The Shelf has Clear, The Deep Scent), and record that in the arm's place as a one-line comment. Arm (b) "standing in a shaft refills": the Shelf's bar is `invert: true` (Pollution FILLS as the water fouls), so a refill DROPS `charge`; read `stepCharge`'s invert handling before asserting direction, and if the arm's direction assumptions cannot be flipped in two lines, re-point the whole function to `deep` instead (maws are also `run.shafts`; `signature.maws` has no drift, so arms (c)–(e) about drift then move to a `shelf` fixture only). Rewrite the PASS line to name the chapter used. Update the `run(runTwilight)` call.
3. **run RO (6381–6666):** in (b) `overridden` expectation `['surf/searoach', 'twilight/krill']` → `['surf/searoach']`. In (f) replace `const KRILL = CHAPTERS.twilight.roster.find((r) => r.id === 'krill').dash` with `const KRILL = { restMul: 2.48, lenMul: 0.5, spdMul: 0.5 }  // the Twilight's krill numbers, kept as a fixture after the chapter left`. Delete arm **(g) THE KRILL'S SHIPPED NUMBERS** (6634–6664) entirely. Fix the RO PASS line if it names the krill.
4. **run CL (6911–6963):** `ringRun('twilight', …)` → `ringRun('deep', …)`; `CHAPTERS.twilight.resource.max` → `CHAPTERS.deep.resource.max`; PASS strings "twilight" → "deep". (7018) `others = ['surf', 'reef', 'twilight', 'deep']` → `['surf', 'reef', 'deep']`.
5. **run DK `runDark` (10938–11130):** `CHAPTERS.twilight.resource` → `CHAPTERS.deep.resource`; `twilightMeta` chapters list `['body','pond','twilight','beyond']` → `['body','pond','deep','beyond']`, `chapter: 'twilight'` → `'deep'`. Arm **(b) THE SLOW IS REAL** (11050–11083): the Deep's `dark.speedFloor` is 1 — rewrite the arm's final assert to equality: travelled distance at an empty bar within 2% of a full bar, message `'The Deep's dark must NOT slow (speedFloor 1, its own ruling) — a slow leaked in'`. Arm **(c) it joins the slow MIN** (11084–11104): DELETE (no Book 2 chapter but The Shelf slows in the dark and PB7's Runoff arm already proves the MIN composition on the Shelf). Fix the PASS line.
6. **Signature table (22318):** delete the `['twilight', 'shafts']` row.
7. **`testTwilightWeapons` (23763–24040):** rename to `testDeepLightWeapons`; `twilightRun` → `deepRun` with `chapter: 'deep'` (keep the body: it clears `run.shafts` and the tide); delete the local `deepRun` Task 2 put in `testGlint` and use this one; the pool assert (23785–23795) becomes `assert.deepStrictEqual(CHAPTERS.deep.weapons, ['glint', 'sunspear', 'foxfire', 'sunlance'])` and `assert.strictEqual(CHAPTERS.deep.starter, 'glint', …)`; `run0ChargeMax` uses `chapter: 'deep'`; `CHAPTERS.twilight.*` → `CHAPTERS.deep.*`; every "Twilight"/"Shelf" in PASS strings → "Deep". SH.b's dark fixture sets `run.charge = 0` and reads `darkness()` on the Deep's `dark.from 0.5` — unchanged semantics. Update the `run(testTwilightWeapons)` call at ~20021.
8. **run US.j (32742–32801):** `BARS` loses `twilight: 'Light'`; delete the `murk > dark` block (32774–32780) and the `SUN` pool assert (32792) and the self-referential grep (32799–32801) per R2.4; fix the PASS line (33043) which is titled "shelf/twilight split".
9. **Hop test (32897–32920):** delete the block that asserts `m.chapters.twilight` (R2.3), and any fixture object built only for it.
10. **WANT_SPEND (32952):** `['shelf', 'twilight', 'reef']` → `['shelf', 'reef']`.
11. **run RA / DA.e:** nothing to edit; they read the tables. `node test/sim-test.js rosterart` must pass with the PNGs deleted.

- [ ] **Step 5: Full suite and isolation**

Run: `npm test 2>&1 | tail -3` (full — the Twilight had 300s balance sims) then `node scripts/test-isolation.mjs 2>&1 | tail -3`.
Expected: ALL TESTS PASSED, every scenario passes alone.

- [ ] **Step 6: The chapter audit**

Run: `node scripts/chapter-stage.mjs 2>&1 | head -22`
Expected: 14 chapters (the denominator line says `Auditing all 14 chapters`), no `The Twilight` row, `2-6  The Deep … ideation owes2` (anomaly + mutator), `wiring ok`.

- [ ] **Step 7: Commit**

`/tmp/c4.txt`: `feat(undertow): The Twilight is gone — its light lives in The Deep; Book 2 is six chapters` + body: the spec section, the hop deletion reason (R2.3), that shafts/drift stay for The Shelf, the tests that moved and the four arms deleted with their reasons.

---

### Task 5: Delete Fin Hit

**Files:**
- Modify: `src/config.js` — `WEAPONS.finHit` (2722–2770 pre-shift; anchor `  finHit: {` in WEAPONS), `WEAPON_MODS.finHit` (~4226–4235), `WEAPON_RATE_MODS` row `finHit: 'thrash'`
- Modify: `src/sim.js` — `WEAPON_STAT_MODS.finHit` row (~7979), dispatcher line (~8145), `stepFinHitWeapon` + `fireFinHit` (~12654–12696) with the comment block above them, and `run._finPrevA/_finSide` reads (12674–12684 are inside `fireFinHit`)
- Modify: `src/state.js` — `_finPrevA: null,` `_finSide: 1,` and their comment (2764–2768)
- Modify: `src/render.js` — `case 'finHit':` (~20462, delete the case body to its `break`), the nova drawer keyed `look === 'finHit'` (grep `'finHit'` in render.js; if a `drawFinHit`/finG Graphics exists, delete it, its `.clear()` in reset and its layer registration)
- Modify: `src/main.js` — no SFX row exists for `finHit` (confirmed); nothing
- Modify: `src/fr.js` — keys `'Fin Hit'`, its desc (`'Your own body, swung where you turn…'`), `'Serrated'`, `'fin damage'`, `'Broad Fin'`, `'how wide the sweep is'`, `'Long Fin'`, `'sweep reach'`, `'Thrash'`, `'sweep rate'`, and the two comment blocks naming them (~808–810, ~1276–1279)
- Modify: `test/sim-test.js` — IPECAC `NEEDS_MOTION = new Set(['finHit'])` (1535) → `new Set([])` and reword its comment; run BN (the "every sector nova names its drawer" lint — grep `'finHit'` in the test file) loses the finHit row

- [ ] **Step 1: Delete, then grep**

Run after editing: `grep -n "finHit\|FinHit\|_finPrevA\|_finSide\|'Fin Hit'\|thrash" src/*.js test/sim-test.js | grep -v "^\S*:\s*[0-9]*:\s*//"`
Expected: nothing. (`SCENT_*` stays — Scent is the chapter's button and applies in `dealDamage` to every weapon.)

- [ ] **Step 2: Tests**

Run: `node test/sim-test.js modbudget 2>&1 | tail -2 && node test/sim-test.js ev 2>&1 | tail -2 && npm run test:fast 2>&1 | tail -3`
Expected: green; run EV must not list `finHit` as an orphan or as a stale `SILENT_BY_DESIGN` row.

- [ ] **Step 3: Commit**

`/tmp/c5.txt`: `chore: delete Fin Hit — no chapter offers it after The Deep's pool became four light cards` + body naming every site.

---

### Task 6: Delete Pistol Shrimp and Fire Coral

The Reef became a race with `weapons: []` on 2026-08-24; these two were its first natives. **Delete by weapon, never by prefix** — `SNAP_TRAP_*` (Undergrowth traps), `CORAL_CRUSH`, `bakeCoral`, `updateCoralGrit`, `coralPool`, `T.coral` (the Reef's coral LEVEL) all stay.

**Files:**
- Modify: `src/config.js` — `WEAPONS.pistolShrimp`, `WEAPONS.fireCoral` (anchors `  pistolShrimp: {`, `  fireCoral: {` in WEAPONS), their `WEAPON_MODS` blocks, `WEAPON_RATE_MODS` rows `pistolShrimp: 'quickSnap', fireCoral: 'quickWake'`, consts `FIRE_CORAL_VIS` (9498 block), `SNAP_CAVITY` (9543 block), `FIRE_CORAL_LEAD` (12280), `SNAP_BACKBLAST_FRAC/_FULL_FRAC/_LEN` (12289–12293) each with its comment, `STAT_KEYS` row `{ key: 'ridges', label: 'Ridges lit' }` and its comment
- Modify: `src/sim.js` — import list (167: `FIRE_CORAL_LEAD, SNAP_BACKBLAST_FRAC, SNAP_BACKBLAST_FULL_FRAC, SNAP_BACKBLAST_LEN`), `WEAPON_STAT_MODS` rows (7968–7969), dispatcher (8150–8151), `stepSnapWeapon`/`fireSnap`/`stepFireCoralWeapon`/`fireCoral`/`stepPolyps` (12449–12577) and the comments above them, the `stepPolyps(run, dt)` call site (grep), the beams' `look: 'snap'` special-casing (grep `'snap'` in sim.js — the "tick clears duration/2" branch in `stepBeams`)
- Modify: `src/state.js` — `polyps: [],` (2681) and the `polyps[i]` doc block (~1366), the doc rows at ~2126–2143 for the snap beam and Fire Coral, the `{type:'snap'…}` event row
- Modify: `src/render.js` — `FIRE_CORAL_VIS`, `SNAP_CAVITY` from the import (line 10), `polypG` (10637), its layer registration (10646), `syncPolyps` (13585–13622), `polypG.clear()` (20730, 22944), the `syncPolyps(run)` call (22297), `case 'snap':` (20061–20079), `placeBeam`'s `snap` branches (22808–22812: `const snap = …` and the three ternaries — collapse each to its non-snap form), `T.beamSnap` (grep its bake), the SNAP_CAVITY drawers (16610 block and 22773–22865 — read to find the function boundaries; delete the functions and their callers)
- Modify: `src/main.js` — `snap: 'shoot',` and its five comment lines (676–681)
- Modify: `src/fr.js` — keys `'Pistol Shrimp'`, its desc, `'Fire Coral'`, its desc, `'Overpressure'…'the polyps grow over the gaps as well'` (the 20 mod keys at ~1538–1557), `'Ridges lit'`, and the comment block at ~1524–1530
- Modify: `test/sim-test.js` — `testReefNatives` (27291–27910): delete arms (a)–(h) and (j) and the RN PASS line; KEEP arm **(i) EVERY BEAM GETS ONE BRIGHT FRAME** (27747–27814, generic over every beam weapon) — move it into its own function `testBeamBrightFrame()` with its own PASS line and register it where `run(testReefNatives)` was (20041); IPECAC `CHAPTER_FOR = { fireCoral: 'reef' }` (1541) → `{}` with the comment reworded, and `'polyps'` removed from `LISTS` (1520); run RF.e's `syncPolyps` asserts (29543–29552 region: the `pl.lit / V.igniteT` regex and `FIRE_CORAL_VIS.igniteT`) deleted and its PASS line trimmed; run BN's `'snap'`-look row if any
- Delete: `scripts/scenes/reef-snap.js`; grep `scripts/` for `fireCoral|pistolShrimp|polyps|SNAP_CAVITY` (`reef-pileup.mjs` is named in the snap test — read its header; if it is the snap's probe, delete it)

- [ ] **Step 1: Delete, then grep**

`grep -n "pistolShrimp\|fireCoral\|polyp\|SNAP_CAVITY\|SNAP_BACKBLAST\|FIRE_CORAL\|beamSnap\|'snap'\|Ridges lit\|quickSnap\|quickWake" src/*.js scripts/*.mjs scripts/scenes/*.js test/sim-test.js | grep -v "^\S*:\s*[0-9]*:\s*//"` → nothing. Then `grep -n "SNAP_TRAP\|CORAL_CRUSH\|bakeCoral\|coralPool\|T.coral" src/render.js | head -3` → still present (the level's coral).

- [ ] **Step 2: Tests**

`node test/sim-test.js ipecac 2>&1 | tail -2 && node test/sim-test.js cp 2>&1 | tail -2 && node test/sim-test.js ev 2>&1 | tail -2 && npm run test:fast 2>&1 | tail -3` → green. run CP will complain if `polyps` was in `clearWorld`'s list but no longer exists, or the reverse — fix per its message.

- [ ] **Step 3: Commit**

`/tmp/c6.txt`: `chore: delete Pistol Shrimp and Fire Coral — the Reef has offered no weapon since it became a race` + body listing the kept look-alikes (SNAP_TRAP_*, CORAL_CRUSH, T.coral) explicitly.

---

### Task 7: Delete Squid Ink and Oxygen Tank

**Delete by weapon:** `INK_*` at config ~11401–11409, `stepInkjet`, `drawInkStain`, `run._inkT`, `inkOn` (render 19475, 22267) and the event `inkjet` are **The Wreck's squid enemy** and stay. `TANK_KB_REFRACTORY` is the tank archetype and stays. `drawTankColumn` is the City's tank column and stays.

**Files:**
- Modify: `src/config.js` — `WEAPONS.squidInk`, `WEAPONS.oxygenTank`, their `WEAPON_MODS` blocks, `WEAPON_RATE_MODS` rows `squidInk: 'quickInk', oxygenTank: 'quickTank'`, consts `INK_BLIND_REACH` (12303), `INK_JET_SPREAD` (12307), `TANK_SHOVE_KB` (12315) with comments, `STAT_KEYS` rows `blind` ('Blinded for') and `boil` ('Bubbles last') with their comment
- Modify: `src/sim.js` — import list (`INK_BLIND_REACH, INK_JET_SPREAD, TANK_SHOVE_KB`), `WEAPON_STAT_MODS` rows (7974–7975), dispatcher (8152–8153), `stepSquidInkWeapon`/`fireInk`/`stepTankWeapon`/`fireTank` (12578–12645) with comments; **the blind machinery** (R2.4): `blindT: 0,` at 2146, the seam 2617–2632 (`if ((e.blindT ?? 0) > 0) {…}` whole block), the decay 2929–2931, the bloom-side producer 9712–9724 (`if ((bl.blind ?? 0) > 0) {…}`); **the tank landing** in `stepLobs` 11358–11380 (`if (lo.tank) {…continue}`), and the `airHold` term in `stepCharge` 6216–6227 (the `const airHold = …` block and its comment; then `* airHold` in the drain line)
- Modify: `src/state.js` — doc rows 966–972 (blindT), 1088–1089 (`blind`, `airHold`), 2027–2031 (tank lobs), 2134-ish rows naming `{type:'ink'}`/`{type:'rupture'}`
- Modify: `src/render.js` — `case 'ink':` (20080–20095) and `case 'rupture':` (20096–?) bodies, `bl.look === 'ink'`/`'boil'` branches in `syncBlooms` (17216–17217 and what they select), `s._blindT` machinery (21755, 21907, 22047–22054, 22148) and `(e.blindT || 0) > 0` in `facesOwnHeading` (21839) — remove that term only
- Modify: `src/main.js` — `ink: 'hole',` and `rupture: 'explode',` with their comment lines (682–693)
- Modify: `src/fr.js` — keys `'Squid Ink'`, its desc, `'Blackout'…'extra ink cloud(s) per jet'`, `'Oxygen Tank'`, its desc, `'Overfilled'…'the rupture shoves everything clear'`, `'Blinded for'`, `'Bubbles last'`, the comment at ~1557–1566 (reword: it also introduces Last Breath and Tidal Race — keep those lines)
- Modify: `test/sim-test.js` — `testReefPool` (27929–28435): delete arms (a)–(g) (28002–28286) and arm **(j) THE RENDER HALF OF THE FACING** (28407–end, the blind's render assert); KEEP (h) Last Breath and (i) Tidal Race; rename the function `testReefCards` and rewrite the RP PASS line (28286+220ish) to name only Last Breath and Tidal Race; update `run(testReefPool)`; grep the file for `blindT`, `INK_JET_SPREAD`, `oxygenTank`, `squidInk` for strays (28434 is inside (j))
- Delete: `scripts/scenes/reef-ink.js`, `reef-tank.js`, `reef-blind-facing.js`

- [ ] **Step 1: Delete, then grep**

`grep -n "squidInk\|oxygenTank\|blindT\|_blindH\|airHold\|lo\.tank\|INK_BLIND_REACH\|INK_JET_SPREAD\|TANK_SHOVE_KB\|'boil'\|look === 'ink'\|Blinded for\|Bubbles last\|quickInk\|quickTank" src/*.js scripts/scenes/*.js test/sim-test.js | grep -v "^\S*:\s*[0-9]*:\s*//"` → nothing. `grep -n "stepInkjet\|drawInkStain\|INK_STAIN_T\|TANK_KB_REFRACTORY" src/*.js | wc -l` → still > 0.

- [ ] **Step 2: Full suite**

`npm test 2>&1 | tail -3` → ALL TESTS PASSED. `node scripts/chapter-stage.mjs 2>&1 | head -20` → every live chapter still `wiring ok`.

- [ ] **Step 3: Commit**

`/tmp/c7.txt`: `chore: delete Squid Ink and Oxygen Tank, and the blind status machinery only they fed` + body naming the Wreck's squid ink as kept.

---

### Task 8: Measure — the pool, the bar, the roster, the glow

Load `probing-the-game` and `designing-an-enemy` (phase 3) first. Every number here goes into a config comment beside the one it replaces, in the fixed `balance_decision` format, with the spread printed.

**Files:**
- Modify: `src/config.js` — `WEAPONS.glint`/`sunspear`/`foxfire`/`sunlance` comments; `CHAPTERS.deep.roster` numbers; `CHAPTERS.deep.resource` comment
- Modify: `src/render.js` — `ROSTER_LOOKS.lanternfish.glow.frac` if the range shot says so
- Create: `scripts/deep-roster-probe.mjs`, `scripts/scenes/deep-lantern-range.js`
- Modify: `docs/superpowers/specs/2026-09-09-deep-twilight-merge-design.md` — a "Measured" section under §6

- [ ] **Step 1: The pool, one invocation**

Run: `node scripts/weapon-census.mjs --chapter deep --level 5 --weapons glint,sunspear,foxfire,sunlance --secs 300 2>&1 | tail -12`
Read the ORDER, not the values. Record the table in the commit and beside `WEAPONS.sunspear.levels`. **Sunspear's retune clause (R2.2):** if Sunspear's effective dps is more than 1.5× the next card, halve the doubling (`×1.5` instead of `×2`), re-run in one invocation, and record both tables. Glint at L1 is the run's opening: also run `--level 1 --weapons glint,sunspear` and record.

- [ ] **Step 2: The bar under a maw-working player**

Run: `node scripts/charge-probe.mjs --chapter deep 2>&1 | tail -20`
Record the mean bar and % dark for each policy beside `CHAPTERS.deep.resource`. Note whether Glint's cost changed the `seek` policy's mean bar against the Deep's block's own table (it will — Glint drains ~2/s while firing). If the seeking player is pinned under 25% of the bar for more than 70% of a run, raise `CHAPTERS.deep.resource.refill` by one measured step (16→20) and re-run; the maws' bite clock is untouched.

- [ ] **Step 3: The roster, six seeds, 300s**

Create `scripts/deep-roster-probe.mjs`:
```js
// Six seeded 300s Deep runs, immortal + kiting stick, printing per seed: kills by roster id, xp
// earned, damage taken by source, split children spawned. Read the SPREAD. Two seeds lie.
import { createRun, ensureChapterMeta } from '../src/state.js'
import { stepSim } from '../src/sim.js'
import { CHAPTERS } from '../src/config.js'
const mulberry32 = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
const SEEDS = [11, 22, 33, 44, 55, 66]
for (const seed of SEEDS) {
  Math.random = mulberry32(seed)
  const meta = { coins: 0, shop: {}, best: {}, runs: 0, choiceSlots: 2, chapter: 'deep', dev: true, chapters: {} }
  ensureChapterMeta(meta)
  const run = createRun(meta, { chapter: 'deep', difficulty: 1 })
  run.player.maxHP = run.player.hp = 1e9
  const kills = {}, taken = {}
  let xp = 0, children = 0
  const dt = 1 / 60
  for (let i = 0; i < 300 * 60; i++) {
    const a = run.time * 0.7
    stepSim(run, { x: Math.cos(a), y: Math.sin(a) }, dt)
    for (const ev of run.events) {
      if (ev.type === 'kill') kills[ev.rosterId ?? ev.src ?? '?'] = (kills[ev.rosterId ?? ev.src ?? '?'] ?? 0) + 1
      if (ev.type === 'hurt') taken[ev.src ?? '?'] = (taken[ev.src ?? '?'] ?? 0) + (ev.dmg ?? 0)
    }
    run.events.length = 0
    if (run.phase === 'levelup') run.phase = 'playing'
    if (run.phase !== 'playing') break
  }
  console.log(`seed ${seed}: level ${run.player.level} kills ${JSON.stringify(kills)} taken ${JSON.stringify(taken)}`)
}
```
Before trusting it, read `state.js`'s event doc for the real field names on `kill`/`hurt` events (`rosterId`? `src`?) and fix the two lines. Run it; record the six rows. **Decide the split tax:** if the siphonophore's share of xp across the six seeds exceeds the old gulper's (run the same probe on `git stash`-free baseline: `git archive cdd29a7 src | tar -x -C /tmp/base` and point the imports there for one run), lower `xpMul` until the tank slot's xp share is within 20% of baseline; record `[low, high]` of the six seeds beside the roster.

- [ ] **Step 4: The glow at spawn distance (R2.6)**

Create `scripts/scenes/deep-lantern-range.js` modelled on `deep-hunt.js`'s header: four lanternfish pinned at 90/180/300/410px from the player on a 20/100 bar, `run.shafts.length = 0`, one frame. Read the frame at the phone viewport. Requirement: the fish at 300px is visible as a glow with the lamp at 20%. If not, raise `ROSTER_LOOKS.lanternfish.glow.frac` (2.4 → 3.5 → 5) until it is, and stop at the first value that passes; record the value and the frame path in the commit.

- [ ] **Step 5: Foxfire on the Deep's scrim (§6.3)**

Run `node scripts/fx-probe.mjs --scene scripts/scenes/deep-foxfire-dark.js --chapter deep --out /tmp/ffd --frames 6 --wait 20000` and read the last frame. This is an OWNER picture: do not tune `FOXFIRE_GLOW`; put the frame path in the report.

- [ ] **Step 6: Tests still green, then commit**

`npm test 2>&1 | tail -3` → green. Commit `/tmp/c8.txt`: `balance(deep): measured — the four-card pool in one census, the bar under Glint, the roster over six seeds, the lanternfish glow at range` + the tables in the body.

---

### Task 9: Adversarial pass, audit, ship gated

- [ ] **Step 1: Dispatch ONE reviewer (general-purpose, opus)** with this verbatim block first:

> You are reviewing UNCOMMITTED and committed work on branch `deep-twilight-merge`. **Do not mutate the tree.** Allowed: `git diff`, `git show`, `git log`, file reads, grep, running `node scripts/*.mjs` and `node test/sim-test.js <name>` and `npm run test:fast`. Forbidden: `git stash` in any form, `git reset`, `git checkout`, `git restore`, `git clean`, `git add`, `git commit`, `git switch`, and any edit to any file. Default to "this is broken" when uncertain.

Point it at: (1) `git diff cdd29a7..HEAD --stat` and every deletion — grep each deleted id across `src/`, `scripts/`, `public/`, `worker/`, `test/` and report any survivor, and any look-alike that was wrongly deleted (`stepInkjet`, `SNAP_TRAP_*`, `CORAL_CRUSH`, `TANK_KB_REFRACTORY`, the Shelf's `type: 'shafts'` drift); (2) the census reading — same invocation, order not values, rig capable of seeing a Light-costed dart; (3) run RA/DA.e/EV/CP/VO/MB.a/XX all green and the denominators in their PASS lines (14 chapters, not 15); (4) the state.js hop deletion — trace `loadMeta` on a save that still carries `chapters.twilight` and one that never did; (5) the walk of spec §5 and R2.4 against the diff; (6) the French drafts flagged as drafts in the commits.

Fix what it finds or state in the report what you are shipping past.

- [ ] **Step 2: Audit and gates**

`node scripts/chapter-stage.mjs deep` → `ideation owes2 (anomaly, mutator) wiring ok played YOU art YOU fr YOU numbers ok reachable wip`. `npm test` → green. `node scripts/test-isolation.mjs` → every scenario alone. `git status --short` → clean (no scratch PNGs outside `/tmp`).

- [ ] **Step 3: Read what you are about to publish**

`git fetch && git log --oneline HEAD..origin/main` — if main moved under you, merge it and re-run the suite. Then `git log --oneline origin/main..HEAD` and READ the list.

- [ ] **Step 4: Ship, gated**

The Deep is behind `wipFrom: 5`; nothing here reaches a player without the dev flag. `npm run ship "The Twilight is gone and The Deep is the light chapter: Glint, Sunspear, Foxfire and Sunlance against lanternfish, barreleye, fangtooth and siphonophore in the anglerfish's dark; Fin Hit and the Reef's four old weapons are deleted"` then `scripts/deploy-watch.sh "<the line ship prints>"`.

- [ ] **Step 5: Report to the owner**

Seven taps on the TITLE wordmark turn DEV on; The Deep is then the gated rung on the Undertow shelf. Give: the census table, the charge-probe rows, the six-seed roster rows, the four frames (cast, lantern range, foxfire-dark, glint), the French drafts list for review, and the three gates still his (played / fr / art). Say what the reviewer found and what was shipped past.

---

## Self-review against the spec

- §1–§4 (survivor, order, wipFrom untouched): Tasks 3, 4. `wipFrom` is not edited anywhere — verified by Task 4 Step 6's audit line.
- §5.1 (Twilight deletion, every row, R2.4's additions): Task 4 Steps 1, 4 items 1–11.
- §5.2 (five weapons, by weapon, collisions kept, blindT, state.js rows): Tasks 5, 6, 7.
- §3.1/R2.5 (starter: cost per cast, fires at zero, own mods, bullet tag, render case): Task 2.
- §3.2/R2.2 (Sunspear doubled, measured, retune clause): Task 3 Step 2, Task 8 Step 1.
- §6 (Foxfire under no-slow, Sunlance bar cycle, Foxfire scrim, Sunspear census): Task 8 Steps 1, 2, 5.
- §7b/R2.1/R2.6 (roster, flagless barreleye, no beacon, split tax, cast of three, glow at range, `glow` guard): Task 1, Task 8 Steps 3–4. **Gap found:** R2.6's run-RA source-text assert that `updateDark` reads `.glow` off `ROSTER_LOOKS` has no task — add to Task 1 Step 7: in `runRosterArt` append
  ```js
  assert.ok(/ROSTER_LOOKS\[e\.rosterId\]\?\.glow/.test(src), "updateDark no longer reads `.glow` off ROSTER_LOOKS — the lanternfish's own light is inert and it renders as a dark body like any other")
  ```
  (`src` is already the render.js text in that function.)
- R2.3 (hop deleted, nothing migrates): Task 4 Step 1 (state.js) and Step 4 item 9.
- R2.7 (wording): Task 3 Step 2 (Sunspear line), spec already corrected.
- Type consistency: `deepRun(weaponId, level)` is defined in Task 4 item 7 and used by Task 2's test (which carries a local until then); `GLINT_LIGHT_COST` is exported from config and imported in sim and the test; `testDeepLightWeapons` is the renamed function; `testBeamBrightFrame` and `testReefCards` are the survivors of Tasks 6 and 7.
