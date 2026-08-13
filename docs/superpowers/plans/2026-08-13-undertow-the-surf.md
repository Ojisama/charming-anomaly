# Undertow — The Surf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Book 2's chapter 1 — The Surf — behind the existing dev gate: a beach chapter with an alternating tide, sandbars that dry you out, tide pools that refill you, a bristle-worm player form, and the Pincer parry weapon.

**Architecture:** Everything lands on shipped shapes. The tide's wave push copies `stepCurrents`' force-application idiom; sandbars and tide pools copy `streamShafts`' cell-streaming idiom with fresh hash salts; the Humidity bar reuses `run.charge` and `stepCharge` unchanged; the damage multiplier is one pure helper in config.js applied at the two existing damage sites. The one genuine refactor is generalising render.js's `chapterHasKaiju` boolean into a per-chapter player-form id, done here because The Surf is the cheapest place to pay for it.

**Tech Stack:** vanilla JS, PixiJS v8, Vite. Tests are `node test/sim-test.js` — plain `assert` scenarios, no framework.

**Spec:** `docs/superpowers/specs/2026-08-13-book-2-undertow-design.md`

## Global Constraints

- **Never choose a version number.** Chapter work is a feature: ship with `npm run ship "<one plain sentence>"`. Chores use `chore: …` and stay on the branch. Never push to main by hand.
- **Never add a Claude signature, `Co-Authored-By`, or session trailer to a commit.**
- **Balance numbers live in `config.js` and nowhere else.** A magic number in sim.js is a bug.
- **Non-trivial commit messages go in a file and use `git commit -F <file>`.** The shell is zsh: a backtick inside a double-quoted argument is command substitution, and `git commit -m` succeeds with the backticked words silently deleted.
- **`src/fr.js` edits must go through node/python, not exact-string Edit.** French values carry U+00A0 before `: ; ! ?` and it is invisible. A NBSP must never reach a KEY.
- **Every new roster id needs a `ROSTER_LOOKS` entry in render.js**, and every id in a chapter's `render.cast` also needs a baked `src/cast/<id>.png` from `node scripts/bake-cast.mjs`. Both fail silently.
- **`Object.keys(CHAPTERS)` is the only honest denominator** for "every chapter". `CHAPTER_ORDER` is Book 1 only.
- **Mutation-prove every new assertion.** Mutate a scratch copy (`git archive HEAD src | tar -x -C <tmp>`), never the working tree.
- **`npm test` must be green before every commit**, and `git status --short` must be clean of scratch files (only `/*.png` at the repo root is ignored).
- **The camera looks straight down.** Every creature bake is a plan view.
- Existing taken names — do not reuse: `run.pools` / `stepPools` (acid pools), `stepFlashlightCones` (undergrowth elites), hash salts 0–4 (obstacles), 11–14 (eddies), 15–17 (traps), 20–23 (shafts).

---

### Task 1: Rename the book `downward` → `undertow`

**Files:**
- Modify: `src/config.js` (the `BOOKS` table, ~line 3147)
- Modify: `test/sim-test.js` (any `'downward'` string literal)
- Test: `test/sim-test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `BOOKS.undertow = { name: 'Undertow', chapters: ['shelf'], hidden: [], wip: true }`. Every later task adds to `BOOKS.undertow.chapters`.

- [ ] **Step 1: Find every occurrence of the old token, including inside strings**

```bash
grep -rn "downward" src/ test/ docs/ scripts/ --include="*.js" --include="*.mjs"
```

Expected: at least `src/config.js` (the `BOOKS` key). Record the full list before editing — an identifier sweep cannot see a quoted string, and that is the documented failure mode of a rename in this repo.

- [ ] **Step 2: Rename the key and the display name**

In `src/config.js`, in the `BOOKS` table:

```js
  undertow: { name: 'Undertow', chapters: ['shelf'], hidden: [], wip: true },
```

Then apply the same rename to every other hit from Step 1.

- [ ] **Step 3: Prove the sweep is complete, and that it did not eat user-facing copy**

```bash
grep -rn "downward" src/ test/ scripts/ --include="*.js" --include="*.mjs" ; echo "---"
git diff -U0 src/config.js | grep -E "name: '|desc: '"
```

Expected: the first grep prints nothing. The second prints only the `BOOKS` name line — if it prints a weapon or card description, the sweep over-matched and those lines must be reverted.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: `ALL TESTS PASSED`. The WIP-gate scenarios still pass because they key on `wip: true`, not on the book's name.

- [ ] **Step 5: Commit**

```bash
git add src/config.js test/sim-test.js
git commit -m "chore: rename Book 2 from downward to undertow"
```

---

### Task 2: Register The Surf as a chapter with its own roster

**Files:**
- Modify: `src/config.js` (add `CHAPTERS.surf` after `CHAPTERS.shelf`; add `'surf'` to `BOOKS.undertow.chapters`)
- Modify: `src/render.js` (`ROSTER_LOOKS`, ~line 2400)
- Modify: `src/fr.js` (three creature names + the tagline)
- Create: `src/cast/sandhopper.png`, `src/cast/shorecrab.png`, `src/cast/gull.png` (generated)
- Test: `test/sim-test.js`

**Interfaces:**
- Consumes: `BOOKS.undertow` from Task 1.
- Produces: `CHAPTERS.surf` with roster ids `sandhopper`, `shorecrab`, `gull`. Tasks 3–9 all read `CHAPTERS.surf`.

- [ ] **Step 1: Add the chapter, spreading pond like The Shelf does**

In `src/config.js`, immediately after the `CHAPTERS.shelf = { … }` block:

```js
// Book 2 chapter 1. Spreads pond for the same reason The Shelf does — a working balance table and
// obstacle field to start from — then overrides everything that makes it a beach. The signature,
// resource and weapon pool arrive in later tasks; this block is the chapter's existence.
CHAPTERS.surf = {
  ...CHAPTERS.pond,
  name: 'The Surf',
  tagline: 'the tide decides',
  icon: '🏖️',
  // The `normal` lane is deliberately FLAGLESS. An onboarding chapter needs one enemy that simply
  // walks at you: with a flag on all three there is no baseline against which the other two read as
  // special. (The first draft gave the sandhopper dashBurst and had no plain enemy at all.)
  roster: [
    { id: 'sandhopper', archetype: 'normal', name: 'Sand Hopper', hpMul: 0.9, speedMul: 1,    flags: [] },
    { id: 'shorecrab',  archetype: 'tank',   name: 'Shore Crab',  hpMul: 2.2, speedMul: 0.75, flags: ['unshakeable'] },
    { id: 'gull',       archetype: 'fast',   name: 'Gull',        hpMul: 0.8, speedMul: 1.15, flags: ['diveBomb'] },
  ],
}
```

⚠ The gull uses `diveBomb`, not `aerialStrike`. `aerialStrike` is built and parked (sim.js:1601/1880, render.js:2399) and a gull is a re-tinted owl — but config.js:3354 records that it is **unkillable in a melee-only chapter**, because it circles at `AERIAL_RADIUS` and dives to where a kiting player was. Revisit only if Task 7 gives The Surf a ranged weapon.

- [ ] **Step 2: Put the chapter on the book's ladder, before The Shelf**

In `src/config.js`, in `BOOKS`:

```js
  undertow: { name: 'Undertow', chapters: ['surf', 'shelf'], hidden: [], wip: true },
```

- [ ] **Step 3: Run the suite to watch run RA fail**

Run: `npm test`
Expected: **FAIL** in run RA (roster art) — three roster ids have no `ROSTER_LOOKS` entry. This is the guard working; without it the three would render as generic archetype blobs with no error at all.

- [ ] **Step 4: Add the three looks**

In `src/render.js`, in the `ROSTER_LOOKS` table, alongside `copepod`/`krill`/`jelly`:

```js
    sandhopper: { archetype: 'normal', draw: drawSandhopper, lean: 90 },
    shorecrab: { archetype: 'tank', draw: drawShorecrab, lean: 0 },
    gull: { archetype: 'fast', draw: drawGull, lean: 90 },
```

Write `drawSandhopper` (r = 16), `drawShorecrab` (r = 26) and `drawGull` (r = 12) in the Shelf art section's style. Hard requirements, all of which have cost this repo a version before:

- **Plan view.** Every creature is drawn from directly overhead. A gull is a spread wing silhouette seen from above, not a side profile.
- **Separate them by value and hue, not silhouette alone** — the Shelf block's header documents the rule. Beach sand is pale warm, so the roster must not be: crab deep red-orange, hopper mid grey-brown, gull near-white with dark wingtips.
- **Give each a backup read that survives at 12px**: the crab's two raised claws, the hopper's long rear legs, the gull's wing notch.

- [ ] **Step 5: Judge the art before believing it**

```bash
cp scripts/scenes/shelf-cast.js scripts/scenes/surf-cast.js
```

Edit `surf-cast.js` so its column list is `[['sandhopper',16],['shorecrab',26],['gull',12]]`. **The radius override is not optional** — `syncEnemies` draws at `k = e.radius / look.baseR`, and every enemy bred at t=0 is a `drone` (radius 16), so without it the crab renders at 16/26 of its real size and the shot misrepresents the one thing a cast shot is for.

```bash
npm run dev &
node scripts/fx-probe.mjs --scene scripts/scenes/surf-cast.js --out /tmp/surf --frames 2 --wait 30000
```

Open the frames. Ask both questions: *is it the animal?* and *is it the same viewpoint as the sprites around it?* Per the owner's standing preference, present labelled variants on one identical frame and let him pick rather than shipping the first draft.

- [ ] **Step 6: Bake the title-card thumbnails**

Add to `CHAPTERS.surf`'s `render` block:

```js
    cast: ['sandhopper', 'shorecrab', 'gull'],
```

Run: `node scripts/bake-cast.mjs`
Expected: it reports 30 thumbnails (27 + 3) and writes the three new PNGs.

- [ ] **Step 7: Add the French**

Write and run a node script (not an Edit — see Global Constraints):

```js
// scratch-fr.cjs — delete after running
const fs = require('fs')
const p = 'src/fr.js'
let s = fs.readFileSync(p, 'utf8')
s = s.replace("  'Copepod': 'Copépode',", `  // The Surf (Book 2 chapter 1).
  'The Surf': 'Le Ressac',
  'the tide decides': 'la marée décide',
  'Sand Hopper': 'Puce de mer',
  'Shore Crab': 'Crabe vert',
  'Gull': 'Mouette',
  'Copepod': 'Copépode',`)
fs.writeFileSync(p, s)
```

```bash
node scratch-fr.cjs && rm scratch-fr.cjs
```

- [ ] **Step 8: Run the suite**

Run: `npm test`
Expected: `ALL TESTS PASSED`, and run RA's line now reads **38 roster entries across 10 chapters** and **30 thumbnails**. Read those counts against reality — a sweep whose denominator you have not checked is the exact bug run RA was written to catch.

- [ ] **Step 9: Commit**

```bash
git status --short   # must show no scratch files
git add src/config.js src/render.js src/fr.js src/cast/ scripts/scenes/surf-cast.js
git commit -F <message file>
```

---

### Task 3: The tide — an alternating lateral push

**Files:**
- Modify: `src/config.js` (`CHAPTERS.surf.signature`)
- Modify: `src/sim.js` (new `stepTide`, registered in the step order beside `stepCurrents`)
- Test: `test/sim-test.js`

**Interfaces:**
- Consumes: `CHAPTERS.surf` from Task 2.
- Produces: `signature: { type: 'tide', surge, period, axis, … }` and `stepTide(run, dt)`. Task 4 extends the same signature object with `bars`; Task 5 adds `pools`.

- [ ] **Step 1: Write the failing test**

Append to `test/sim-test.js`, in the style of its neighbours:

```js
function testSurfTide() {
  Math.random = mulberry32(20260813)
  const meta = makeMeta()
  meta.dev = true
  ensureChapterMeta(meta)
  const run = createRun(meta, { chapter: 'surf', difficulty: 1 })
  assert.strictEqual(run.chapter, 'surf', 'probe did not land on The Surf')

  const sig = CHAPTERS.surf.signature
  assert.strictEqual(sig.type, 'tide', 'The Surf must declare the tide signature')

  // (a) the push REVERSES. Sample the surge across one full period and require both signs — a
  // one-way drift is a current, which the pond already has; the whole point is surge and backwash.
  const at = (t) => { run._realTime = t; const x0 = run.player.x; stepTide(run, 1 / 60); return run.player.x - x0 }
  let maxPush = -Infinity, minPush = Infinity
  for (let i = 0; i <= 60; i++) maxPush = Math.max(maxPush, at((i / 60) * sig.period))
  for (let i = 0; i <= 60; i++) minPush = Math.min(minPush, at((i / 60) * sig.period))
  assert.ok(maxPush > 0 && minPush < 0,
    `tide must push both ways over its period, saw max ${maxPush.toFixed(3)} min ${minPush.toFixed(3)}`)

  // (b) it must be OUTSWIMMABLE. baseSpeed is 220 and the joystick's expressible set is {0} u [33,220],
  // so a surge at or above baseSpeed would pin the player against it with no counter-input available.
  const peak = Math.max(Math.abs(maxPush), Math.abs(minPush)) * 60
  assert.ok(peak < 220 * 0.5,
    `peak tide surge ${peak.toFixed(1)} px/s is more than half baseSpeed — the player cannot fight it`)
  assert.ok(peak > 33,
    `peak tide surge ${peak.toFixed(1)} px/s is under the joystick's 33 px/s floor — it cannot be felt`)

  // (c) every other chapter is untouched.
  const pond = createRun(meta, { chapter: 'pond', difficulty: 1 })
  const px = pond.player.x, py = pond.player.y
  pond._realTime = 3
  stepTide(pond, 1 / 60)
  assert.strictEqual(pond.player.x, px, 'stepTide moved the player in a non-tide chapter')
  assert.strictEqual(pond.player.y, py, 'stepTide moved the player in a non-tide chapter')

  console.log(`PASS run US.a (the tide): surge reverses across a ${sig.period}s period, peaks at ${peak.toFixed(0)} px/s — over the joystick floor, under half baseSpeed — and is a no-op outside The Surf`)
}
```

Add `stepTide` to the `sim.js` import list at test/sim-test.js:113, and `CHAPTERS` if it is not already imported.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `stepTide is not a function` (or an import error), before any assertion runs.

- [ ] **Step 3: Add the signature**

In `src/config.js`, in `CHAPTERS.surf`:

```js
  // The tide. `surge` is peak lateral speed in px/s and `period` a full surge->backwash cycle; the
  // push is a sine, so it is zero-mean and cannot walk the player off the map over a 300s run.
  // axis is radians — 0 means the shore runs along y and the water shoves you along +/- x.
  //
  // 46 px/s sits inside the two hard numbers the joystick imposes (see CHAPTERS.shelf.signature's
  // block for the full derivation): above 33, the DEADZONE 0.15 x baseSpeed 220 floor, or the
  // player cannot express a slow correction against it; and far under 220, or the surge is not a
  // push but a wall. It is deliberately felt rather than fought — chapter 1 teaches "the map is not
  // neutral" and then lets you win the argument.
  signature: { type: 'tide', surge: 46, period: 14, axis: 0 },
```

- [ ] **Step 4: Add `stepTide`**

In `src/sim.js`, directly below `stepCurrents`:

```js
// The Surf's tide (Book 2 chapter 1). A chapter-gated no-op exactly like stepCurrents above: a
// chapter that is not the tide returns on the second line.
//
// run._realTime, NOT run.time — the same reason stepShafts gives: the Time Debt anomaly advances
// run.time at TIME_DEBT_MUL (1.5x) and its `chapter` is null, so deriving the phase from run.time
// would multiply the surge by 1.5 and break the ceiling the number was chosen against.
//
// It moves the ENEMIES too. Water that shoves only the player is a control tax; water that shoves
// everything is weather, and it is also the only thing that makes the backwash readable — the crowd
// drifting with you is the tell that you are not simply being nerfed.
function stepTide(run, dt) {
  const sig = CHAPTERS[run.chapter].signature
  if (!sig || sig.type !== 'tide') return
  const s = Math.sin((run._realTime / sig.period) * Math.PI * 2)
  const fx = Math.cos(sig.axis) * sig.surge * s * dt
  const fy = Math.sin(sig.axis) * sig.surge * s * dt
  const p = run.player
  p.x += fx; p.y += fy
  for (const e of run.enemies) {
    if (e._dead) continue
    e.x += fx; e.y += fy
  }
}
```

Register it in the step order beside its neighbour:

```js
  stepCurrents(run, dt)   // v5.0 signature mechanic: drift field (no-op unless the chapter has one)
  stepTide(run, dt)       // Book 2 surf signature: alternating surge/backwash (no-op elsewhere)
```

Export it for the test: add `stepTide` to sim.js's export list.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: `PASS run US.a (the tide): …` and `ALL TESTS PASSED`.

- [ ] **Step 6: Mutation-prove it**

```bash
TMP=$(mktemp -d) && git archive HEAD src | tar -x -C "$TMP"
```

Apply each mutation to `$TMP/src/sim.js` or `$TMP/src/config.js`, point the suite at that tree, and confirm the named assertion fires:

| Mutation | Must fail on |
|---|---|
| `Math.sin(...)` → `Math.abs(Math.sin(...))` | (a) — the push no longer reverses |
| `surge: 46` → `surge: 200` | (b) upper — no longer outswimmable |
| `surge: 46` → `surge: 20` | (b) lower — under the joystick floor |
| delete the `sig.type !== 'tide'` guard | (c) — the pond moves |

If any mutation passes, the assertion is decorative — fix it before continuing. Then `rm -rf "$TMP"`.

- [ ] **Step 7: Commit**

```bash
git status --short
git add src/config.js src/sim.js test/sim-test.js
git commit -F <message file>
```

---

### Task 4: Sandbars — streamed patches that slow you and dry you out

**Files:**
- Modify: `src/config.js` (`CHAPTERS.surf.signature.bars`)
- Modify: `src/state.js` (`run.sandbars`, the cell cursor, and the doc block)
- Modify: `src/sim.js` (`streamSandbars`, the slow term, the drain term)
- Test: `test/sim-test.js`

**Interfaces:**
- Consumes: `CHAPTERS.surf.signature` from Task 3.
- Produces: `run.sandbars` — an array of `{ x, y, r, _cell }` — and `onSandbar(run)` returning `boolean`. Task 5's `stepCharge` change consumes `onSandbar`.

- [ ] **Step 1: Write the failing test**

```js
function testSurfSandbars() {
  Math.random = mulberry32(20260814)
  const meta = makeMeta()
  meta.dev = true
  ensureChapterMeta(meta)
  const run = createRun(meta, { chapter: 'surf', difficulty: 1 })

  // (a) the field materializes as the player roams, and drops behind them.
  run.player.x = 4000; run.player.y = 4000
  streamSandbars(run)
  assert.ok(run.sandbars.length > 0, 'no sandbars materialized after crossing a cell boundary')
  const far = run.sandbars.length
  run.player.x = 40000; run.player.y = 40000
  streamSandbars(run)
  assert.ok(!run.sandbars.some((b) => Math.hypot(b.x - 40000, b.y - 40000) > OBSTACLE_DROP_RADIUS),
    'sandbars from the old position were not dropped')
  assert.ok(far > 0 && run.sandbars.length > 0, 'the field went empty after a long walk')

  // (b) it is DETERMINISTIC — no Math.random at step time. Same seed, same field.
  const snapshot = run.sandbars.map((b) => `${b.x.toFixed(2)},${b.y.toFixed(2)}`).sort().join('|')
  run.sandbars.length = 0
  run._sandCellI = null; run._sandCellJ = null
  Math.random = () => { throw new Error('streamSandbars consumed Math.random at step time') }
  streamSandbars(run)
  Math.random = mulberry32(1)
  assert.strictEqual(run.sandbars.map((b) => `${b.x.toFixed(2)},${b.y.toFixed(2)}`).sort().join('|'), snapshot,
    'the sandbar field is not reproducible from the run seed')

  // (c) onSandbar is a position test, not a proximity guess.
  const b = run.sandbars[0]
  run.player.x = b.x; run.player.y = b.y
  assert.strictEqual(onSandbar(run), true, 'standing dead centre on a sandbar read as off it')
  run.player.x = b.x + b.r + 5; run.player.y = b.y
  assert.strictEqual(onSandbar(run), false, 'standing outside the radius read as on it')

  // (d) the slow actually reaches the player, and composes by MIN like every other slow.
  run.player.x = b.x; run.player.y = b.y
  const before = { x: run.player.x, y: run.player.y }
  advance(run, 0.5, 1 / 60, { x: 1, y: 0, skill: false })
  const onBar = Math.hypot(run.player.x - before.x, run.player.y - before.y)
  run.sandbars.length = 0
  run.player.x = before.x; run.player.y = before.y
  advance(run, 0.5, 1 / 60, { x: 1, y: 0, skill: false })
  const offBar = Math.hypot(run.player.x - before.x, run.player.y - before.y)
  assert.ok(onBar < offBar * 0.9,
    `a sandbar must slow the player: travelled ${onBar.toFixed(1)}px on it vs ${offBar.toFixed(1)}px off it`)

  console.log(`PASS run US.b (sandbars): ${far} patches streamed deterministically from the run seed, dropped behind the player, and standing on one costs ${(100 - (onBar / offBar) * 100).toFixed(0)}% of your travel`)
}
```

Import `streamSandbars`, `onSandbar` and `OBSTACLE_DROP_RADIUS`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `streamSandbars is not a function`.

- [ ] **Step 3: Add the tuning block**

In `src/config.js`, extend `CHAPTERS.surf.signature`:

```js
  signature: {
    type: 'tide', surge: 46, period: 14, axis: 0,
    // Sandbars: dry ground you can walk onto. `slowMul` composes with every other slow by MIN (see
    // the slow-composition note in sim.js), so it is the FLOOR the chapter can impose, never a stack.
    // drainMul multiplies the resource drain while you stand on one — the sandbar is the only place
    // Humidity falls fast, which is what makes it a place rather than a clock.
    bars: { cell: 620, chance: 0.42, r: 150, minDist: 380, slowMul: 0.62, drainMul: 4 },
  },
```

- [ ] **Step 4: Add the run state**

In `src/state.js`, in `createRun`'s returned object beside `shafts: []`:

```js
    sandbars: [],          // Book 2 surf: streamed dry patches (signature.bars) — see streamSandbars
    _sandCellI: null,      // streaming cursor, independent of the obstacle/eddy/trap/shaft cursors
    _sandCellJ: null,
```

Add matching entries to the `run.*` field doc block, next to `shafts`.

- [ ] **Step 5: Add the streamer and the query**

In `src/sim.js`, directly below `stepShafts`:

```js
// Sandbars (Book 2 / The Surf). The FIFTH copy of streamObstacles' streaming idiom (obstacles ->
// eddies -> traps -> shafts -> here): own cell size (sig.bars.cell), own _sandCellI/_sandCellJ
// cursor, same run._obstacleSeed, same OBSTACLE_STREAM_RADIUS/OBSTACLE_DROP_RADIUS. Own hash salts
// (30 occupancy, 31 x jitter, 32 y jitter) so a sandbar's roll can never collide with an obstacle's
// (0-4), an eddy's (11-14), a trap's (15-17) or a shaft's (20-23) at the same cell.
//
// ZERO Math.random() at step time — the same hard rule the other four state, and run US.b asserts it
// by making Math.random throw. A sandbar never moves, so unlike a shaft it spends the whole jitter
// budget and has no per-frame step of its own.
function streamSandbars(run) {
  const sig = CHAPTERS[run.chapter].signature
  const spec = sig && sig.type === 'tide' ? sig.bars : null
  if (!spec) return
  if (run._obstacleSeed == null) return
  const p = run.player
  const cs = spec.cell
  const ci = Math.floor(p.x / cs), cj = Math.floor(p.y / cs)
  if (ci === run._sandCellI && cj === run._sandCellJ) return
  run._sandCellI = ci; run._sandCellJ = cj

  for (let k = run.sandbars.length - 1; k >= 0; k--) {
    if (Math.hypot(run.sandbars[k].x - p.x, run.sandbars[k].y - p.y) > OBSTACLE_DROP_RADIUS) run.sandbars.splice(k, 1)
  }
  const live = new Set()
  for (const b of run.sandbars) live.add(b._cell)

  const seed = run._obstacleSeed
  const span = Math.ceil(OBSTACLE_STREAM_RADIUS / cs)
  for (let i = ci - span; i <= ci + span; i++) {
    for (let j = cj - span; j <= cj + span; j++) {
      const key = i + ',' + j
      if (live.has(key)) continue
      if (obstacleCellHash(i, j, seed, 30) >= spec.chance) continue
      const slack = Math.max(0, cs / 2 - spec.r - 20)
      const x = (i + 0.5) * cs + (obstacleCellHash(i, j, seed, 31) - 0.5) * 2 * slack
      const y = (j + 0.5) * cs + (obstacleCellHash(i, j, seed, 32) - 0.5) * 2 * slack
      if (Math.hypot(x, y) < spec.minDist) continue
      if (Math.hypot(x - p.x, y - p.y) > OBSTACLE_STREAM_RADIUS) continue
      run.sandbars.push({ x, y, r: spec.r, _cell: key })
    }
  }
}

// Is the player standing on dry ground? Centre-to-centre against the patch radius, exactly like
// stepCharge's shaft test — standing ON it, not brushing its edge.
function onSandbar(run) {
  const p = run.player
  for (const b of run.sandbars) if (Math.hypot(b.x - p.x, b.y - p.y) <= b.r) return true
  return false
}
```

Register the streamer in the step order beside the others:

```js
  streamShafts(run)       // v7.x Book 2: materialize/drop sun-shaft cells (no-op outside The Shelf)
  stepShafts(run)         // ...and DRIFT them; the streamer above only decides existence (see its doc)
  streamSandbars(run)     // Book 2 surf: materialize/drop dry patches (no-op elsewhere)
```

- [ ] **Step 6: Apply the slow**

In `stepPlayerMovement`, beside the existing `darkMul` term (sim.js:583), add the sandbar floor to the same MIN composition the dark slow uses:

```js
  const _sig = CHAPTERS[run.chapter].signature
  const sandMul = _sig && _sig.type === 'tide' && onSandbar(run) ? _sig.bars.slowMul : 1
```

…and include `sandMul` in the existing `Math.min(...)` of slow multipliers. **Do not multiply it in** — every slow in this game composes by MIN so the strongest wins, and a product would silently stack with `latch`.

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test`
Expected: `PASS run US.b (sandbars): …` and `ALL TESTS PASSED`.

- [ ] **Step 8: Mutation-prove it**

| Mutation | Must fail on |
|---|---|
| salt `30` → `20` (collide with shafts) | (b) — the field no longer matches its own snapshot after the cursor reset |
| `run.sandbars.splice(k, 1)` removed | (a) — old patches survive the walk |
| `<= b.r` → `<= b.r * 3` in `onSandbar` | (c) — outside the radius reads as on it |
| `sandMul` dropped from the MIN | (d) — no slow reaches the player |

- [ ] **Step 9: Commit**

---

### Task 5: Humidity — the bar, and tide pools as its refill

**Files:**
- Modify: `src/config.js` (`refillSpec` helper; `CHAPTERS.surf.signature.pools`; `CHAPTERS.surf.resource`)
- Modify: `src/sim.js` (`streamShafts` generalised; `stepCharge` gains the sandbar drain)
- Test: `test/sim-test.js`

**Interfaces:**
- Consumes: `onSandbar(run)` from Task 4.
- Produces: `refillSpec(sig)` returning the refill-circle geometry block or `null`; `CHAPTERS.surf.resource` with `name: 'Humidity'`. Task 6 consumes `resource.damage`.

- [ ] **Step 1: Write the failing test**

```js
function testSurfHumidity() {
  Math.random = mulberry32(20260815)
  const meta = makeMeta()
  meta.dev = true
  ensureChapterMeta(meta)

  // (a) The Shelf's refill field is IDENTICAL after the generalisation. This is a regression guard
  // on shipped, tuned, measured behaviour — the whole reason refillSpec exists rather than a rewrite.
  const shelf = createRun(meta, { chapter: 'shelf', difficulty: 1 })
  shelf.player.x = 5000; shelf.player.y = 5000
  streamShafts(shelf)
  const shelfField = shelf.shafts.map((s) => `${s.bx.toFixed(2)},${s.by.toFixed(2)},${s.r}`).sort().join('|')
  assert.ok(shelf.shafts.length > 0, 'The Shelf lost its shaft field')
  assert.strictEqual(refillSpec(CHAPTERS.shelf.signature), CHAPTERS.shelf.signature,
    'refillSpec must return the shafts signature ITSELF, or the Shelf tune is reading a different object')

  // (b) The Surf streams refill circles from its own `pools` block into the same list.
  const run = createRun(meta, { chapter: 'surf', difficulty: 1 })
  run.player.x = 5000; run.player.y = 5000
  streamShafts(run)
  assert.ok(run.shafts.length > 0, 'The Surf materialized no tide pools')
  assert.strictEqual(run.shafts[0].r, CHAPTERS.surf.signature.pools.r, 'tide pools ignored their own radius')

  // (c) the bar fills in a pool and falls outside one.
  const res = CHAPTERS.surf.resource
  const pool = run.shafts[0]
  run.charge = 50
  run.player.x = pool.x; run.player.y = pool.y
  run.sandbars.length = 0
  stepCharge(run, 1)
  assert.ok(run.charge > 50, `standing in a tide pool must refill: ${run.charge}`)
  run.player.x = pool.x + pool.r + 400; run.player.y = pool.y
  const dry = run.charge
  stepCharge(run, 1)
  assert.ok(run.charge < dry, `outside a pool the bar must fall: ${run.charge}`)

  // (d) A SANDBAR drains faster than open water — the whole reason the patch is a place and not a
  // clock. Compare the two drains directly rather than asserting the bar merely moved.
  run.shafts.length = 0
  run.sandbars.length = 0
  run.charge = 80
  stepCharge(run, 1)
  const openDrain = 80 - run.charge
  run.charge = 80
  run.sandbars.push({ x: run.player.x, y: run.player.y, r: 150, _cell: 'test' })
  stepCharge(run, 1)
  const barDrain = 80 - run.charge
  assert.ok(barDrain > openDrain * 2,
    `a sandbar must dry you out much faster: ${barDrain.toFixed(2)}/s on it vs ${openDrain.toFixed(2)}/s in water`)

  // (e) The Shelf's field is still byte-identical after all of the above touched the same code path.
  const shelf2 = createRun(meta, { chapter: 'shelf', difficulty: 1 })
  shelf2.player.x = 5000; shelf2.player.y = 5000
  streamShafts(shelf2)
  assert.strictEqual(shelf2.shafts.map((s) => `${s.bx.toFixed(2)},${s.by.toFixed(2)},${s.r}`).sort().join('|'), shelfField,
    'The Shelf field changed between two identical runs — the generalisation is not seed-stable')

  console.log(`PASS run US.c (humidity): tide pools refill ${res.refill}/s, open water drains ${openDrain.toFixed(1)}/s and a sandbar ${barDrain.toFixed(1)}/s, and The Shelf's shaft field is unchanged`)
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `refillSpec is not a function`.

- [ ] **Step 3: Add `refillSpec` and the two config blocks**

In `src/config.js`, beside `lightRadius`:

```js
// Where a chapter's refill circles come from. run.shafts is the ONE list of "streamed circles you
// stand in to refill", and two chapters fill it from different places: The Shelf's shafts ARE its
// signature (cell/chance/r/minDist sit directly on it), while The Surf's tide pools are a sub-block,
// because its signature already owns the surge and the sandbars.
//
// Returning the signature OBJECT ITSELF for shafts — not a copy — is deliberate and asserted: the
// Shelf's tune was measured against that exact object, and a copy would be a second thing to keep
// in sync for no gain.
export const refillSpec = (sig) => (sig?.type === 'shafts' ? sig : (sig?.pools ?? null))
```

In `CHAPTERS.surf.signature`, add the pools block:

```js
    // Tide pools: the refill. Same vocabulary as the shelf's shafts and the pond's eddies — cell is
    // the grid, chance a DIRECT per-cell occupancy probability, minDist spawn-ring clearance from
    // the run ORIGIN. No drift: a pool is a hole in the sand, and the thing that moves in this
    // chapter is the water, not the ground.
    pools: { cell: 700, chance: 0.55, r: 165, minDist: 420 },
```

And the resource:

```js
  // Humidity. `drain` is the ambient cost of being out of the water at all, and standing on a
  // sandbar multiplies it by signature.bars.drainMul. Numbers are a STARTING POINT to be measured
  // with scripts/charge-probe.mjs across its three spend policies before being called tuned — the
  // Shelf's first two cuts both read as healthy under one policy and were the spiral under another.
  resource: {
    name: 'Humidity', drain: 1.6, refill: 20, killRefill: 1.2, max: 100,
    damage: { floor: HUMIDITY_DMG_FLOOR },
  },
```

- [ ] **Step 4: Generalise `streamShafts` and extend `stepCharge`**

In `src/sim.js`, in `streamShafts`, replace the first two lines of the body:

```js
  const sig = CHAPTERS[run.chapter].signature
  const spec = refillSpec(sig)
  if (!spec) return
```

…then read `spec.cell`, `spec.chance`, `spec.r`, `spec.minDist` and `spec.driftAmp` throughout in place of `sig.*`. `stepShafts` keeps gating on `sig.type === 'shafts'` — only The Shelf drifts.

In `stepCharge`, make the drain chapter-aware:

```js
  const sig = CHAPTERS[run.chapter].signature
  const dryMul = sig && sig.type === 'tide' && onSandbar(run) ? sig.bars.drainMul : 1
  let c = run.charge - res.drain * dryMul * dt
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: `PASS run US.c (humidity): …`, `PASS run DK (the dark): …` still green, and `ALL TESTS PASSED`.

- [ ] **Step 6: Mutation-prove it**

| Mutation | Must fail on |
|---|---|
| `refillSpec` returns `{ ...sig }` for shafts | (a) — the identity assertion |
| `pools.r` ignored (hardcode 205) | (b) — wrong radius |
| `dryMul` forced to 1 | (d) — sandbar drains no faster than water |
| shaft salt `20` → `30` | (e) — the Shelf's field moves |

- [ ] **Step 7: Measure the tune before believing it**

```bash
node scripts/charge-probe.mjs
```

Extend the probe to take `--chapter surf` if it does not already. Read the **pair** of movement policies, never `kite` alone — the kiting rig's circle radius is `speed / 0.35 / 2π`, so any slow shrinks the sampled area below the spacing of the thing being sampled and reports a false collapse. The Surf has *two* slows (the sandbar and the surge), so this trap is live here in a way it was not on The Shelf.

- [ ] **Step 8: Commit**

---

### Task 6: Humidity drives damage

**Files:**
- Modify: `src/config.js` (`HUMIDITY_DMG_FLOOR`, `resourceDamageMul`)
- Modify: `src/sim.js:4048` and `src/sim.js:5754` — **both** damage sites
- Test: `test/sim-test.js`

**Interfaces:**
- Consumes: `CHAPTERS.surf.resource.damage` from Task 5.
- Produces: `resourceDamageMul(charge, res)` → number in `[floor, 1]`.

⚠ This task implements an owner ruling that **overrides** the design's own earlier rule that the bar never touches damage (spec §5.3). The mitigations there are not optional: a tuned floor, the drain tied to a *place* rather than the clock, and a charge column in the census. Read §5.3 before starting.

- [ ] **Step 1: Write the failing test**

```js
function testSurfHumidityDamage() {
  const res = CHAPTERS.surf.resource

  // (a) endpoints and monotonicity.
  assert.strictEqual(resourceDamageMul(res.max, res), 1, 'a full bar must cost nothing')
  assert.strictEqual(resourceDamageMul(0, res), HUMIDITY_DMG_FLOOR, 'an empty bar must sit on the floor')
  let prev = -Infinity
  for (let i = 0; i <= 40; i++) {
    const v = resourceDamageMul((i / 40) * res.max, res)
    assert.ok(v >= prev, `damage multiplier is not monotonic at charge ${(i / 40) * res.max}`)
    prev = v
  }

  // (b) the floor is a NUDGE, not a cliff. The four-reviewer pass that originally banned this found
  // 40% output in the onboarding chapter put it past Undergrowth's endgame. Anything under 0.6 here
  // is that finding again.
  assert.ok(HUMIDITY_DMG_FLOOR >= 0.6,
    `HUMIDITY_DMG_FLOOR ${HUMIDITY_DMG_FLOOR} re-creates the exact failure this was reviewed for`)

  // (c) EVERY OTHER CHAPTER IS UNAFFECTED. The rule still holds everywhere it was not overridden.
  for (const id of Object.keys(CHAPTERS)) {
    const r = CHAPTERS[id].resource
    if (id === 'surf') continue
    assert.strictEqual(resourceDamageMul(0, r), 1,
      `${id}: an empty bar changed damage, but only The Surf's humidity may do that`)
  }

  // (d) BOTH damage sites route through it. A one-site fix is the silent failure here: half the
  // weapons would scale and half would not, and nothing would throw. sim.js is not importable as a
  // module for this check, so assert against its source text — the run UG.k trick.
  const src = readFileSync(new URL('../src/sim.js', import.meta.url), 'utf8')
  const sites = [...src.matchAll(/baseDmg \* p\.damageMul/g)].length
  const wired = [...src.matchAll(/resourceDamageMul\(run\.charge/g)].length
  assert.ok(sites >= 2, `expected at least 2 player-damage sites in sim.js, found ${sites}`)
  assert.strictEqual(wired, sites,
    `${wired} of ${sites} player-damage sites call resourceDamageMul — every one must, or humidity ` +
    `scales some weapons and not others with no error`)

  console.log(`PASS run US.d (humidity damage): floor ${HUMIDITY_DMG_FLOOR}, monotonic to 1.0, wired at all ${sites} damage sites, and every other chapter reads 1.0`)
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `resourceDamageMul is not a function`.

- [ ] **Step 3: Add the helper**

In `src/config.js`, beside `lightRadius`:

```js
// How hard you hit, as a function of the chapter bar. OWNER RULING 2026-08-13, overriding the
// earlier rule that the bar never touches damage — see the design doc's §5.3 for what that rule was
// protecting and which mitigations replace it.
//
// Opt-in per chapter: only a resource declaring a `damage` block participates, so The Shelf, The
// Reef and The Trawl are untouched and their census numbers stay comparable with Book 1's.
//
// LINEAR from the floor to 1.0, deliberately: the reviewed failure was a multiplier you cannot feel
// in its top half and fall off a cliff in its bottom, and a curve with a knee is that shape by
// construction. A straight line at least reports its own state honestly.
export const HUMIDITY_DMG_FLOOR = 0.7
export const resourceDamageMul = (charge, res) => {
  const d = res?.damage
  if (!d) return 1
  return d.floor + (1 - d.floor) * Math.min(1, Math.max(0, charge) / (res.max || 1))
}
```

- [ ] **Step 4: Wire BOTH damage sites**

At `src/sim.js:4048` and `src/sim.js:5754`, the expression is currently identical at both:

```js
  let dmg = baseDmg * p.damageMul * (1 + run.passives.damage) * run.mods.playerDmgMul * anomalyDamageMul(run)
```

Append the term at each:

```js
  let dmg = baseDmg * p.damageMul * (1 + run.passives.damage) * run.mods.playerDmgMul * anomalyDamageMul(run)
    * resourceDamageMul(run.charge, CHAPTERS[run.chapter].resource)
```

(The second site declares `const dmg`, not `let` — keep each site's existing binding.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: `PASS run US.d (humidity damage): …` and `ALL TESTS PASSED`.

- [ ] **Step 6: Mutation-prove it**

| Mutation | Must fail on |
|---|---|
| wire only sim.js:4048, revert 5754 | (d) — the site count mismatch |
| `HUMIDITY_DMG_FLOOR` → `0.4` | (b) — the reviewed failure |
| add `damage: { floor: 0.5 }` to `CHAPTERS.shelf.resource` | (c) — another chapter participating |
| `Math.min(1, …)` dropped | (a) — a full bar exceeds 1.0 |

- [ ] **Step 7: Give the census a charge column**

`scripts/weapon-census.mjs` diffs enemy `hp` per step and may only be compared **within one invocation**. With a damage multiplier in play its Undertow readings are meaningless without knowing the bar. Add a mean-charge column to its per-weapon table and print the chapter's resource name in the header.

Run: `node scripts/weapon-census.mjs --chapter surf --level 5 --weapons pincer`
Expected: a table whose header names Humidity and whose rows carry mean charge.

- [ ] **Step 8: Commit**

---

### Task 7: Pincer — the parry

**Files:**
- Modify: `src/config.js` (`WEAPONS.pincer`, its `levels[]`, `WEAPON_MODS.pincer`, `CHAPTERS.surf.weapons`/`starter`)
- Modify: `src/sim.js` (`firePincer`, the guard's contact check, `buildReadout`'s whitelist)
- Modify: `src/ui.js` (`STAT_LABEL` for any new stat key)
- Modify: `src/render.js` (the claw sprite and its snap burst)
- Modify: `src/fr.js` (name, description, mod descriptions, stat labels)
- Test: `test/sim-test.js`

**Interfaces:**
- Consumes: `CHAPTERS.surf` from Task 2.
- Produces: `WEAPONS.pincer`; `run.guards` — an array of `{ x, y, angle, r, armed, cd }`.

**Design contract (owner's, verbatim from the feedback):** *"like a crab pinch you put it in towards the nearest enemy like a shield, and when an enemy hits it or is close enough, you smash it and it gets yanked away."* So: a persistent oriented guard that tracks `nearestEnemy`, triggers **on being approached**, deals damage and a hard knockback, then re-arms on a cooldown. It is the only weapon in the game whose value depends on what the enemy does rather than on what the player aimed at.

- [ ] **Step 1: Write the failing test**

```js
function testPincer() {
  Math.random = mulberry32(20260816)
  const meta = makeMeta()
  meta.dev = true
  ensureChapterMeta(meta)
  const run = createRun(meta, { chapter: 'surf', difficulty: 1 })
  run.weapons = { pincer: 1 }
  run.charge = 100
  run.enemies.length = 0

  // (a) the guard exists and FACES the nearest enemy, not the player's heading.
  makeStatusEnemy(run, { x: run.player.x + 200, y: run.player.y, hp: 1e6, speed: 0 })
  advance(run, 0.5, 1 / 60, { x: 0, y: 0, skill: false })
  assert.ok(run.guards.length > 0, 'pincer produced no guard')
  const g = run.guards[0]
  assert.ok(Math.abs(Math.atan2(0, 200) - g.angle) < 0.35,
    `the guard must point at the nearest enemy, angle was ${g.angle.toFixed(2)}`)

  // (b) IT TRIGGERS ON BEING APPROACHED, not on a timer. A stationary enemy far away must leave the
  // guard armed indefinitely — that is the whole shape, and a fireOnTimer weapon would fail here.
  const armedAfterWait = run.guards[0].armed
  assert.strictEqual(armedAfterWait, true, 'the guard disarmed with nothing near it — this is a timer, not a parry')

  // (c) an enemy that reaches it takes damage AND is thrown outward.
  const e = run.enemies[0]
  e.x = run.player.x + g.r * 0.5; e.y = run.player.y
  const hpBefore = e.hp
  const distBefore = Math.hypot(e.x - run.player.x, e.y - run.player.y)
  advance(run, 0.2, 1 / 60, { x: 0, y: 0, skill: false })
  assert.ok(e.hp < hpBefore, 'reaching the guard dealt no damage')
  assert.ok(Math.hypot(e.x - run.player.x, e.y - run.player.y) > distBefore * 1.5,
    'the enemy was not yanked away from the player')

  // (d) it re-arms rather than being spent for the run.
  advance(run, 6, 1 / 60, { x: 0, y: 0, skill: false })
  assert.ok(run.guards.some((q) => q.armed), 'the guard never re-armed')

  console.log(`PASS run US.e (pincer): the guard tracks the nearest enemy, stays armed while nothing approaches, and on contact damages and throws`)
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `run.guards` is undefined.

- [ ] **Step 3: Add the weapon, its tuning and its state**

Follow the shape of an existing weapon block in `config.js` (`WEAPONS.stinger` is the closest single-target one) — `name`, `desc`, `levels[]` with the stats the guard reads (`dmg`, `r`, `cd`, `knock`), and a `WEAPON_MODS.pincer` block of **no more than 4 mods**, per the spec's budget note. Add `run.guards: []` to `createRun` and the state.js doc block. Add `'pincer'` to `CHAPTERS.surf.weapons` and set `starter: 'pincer'`.

⚠ **Any new stat key must be registered twice** — `buildReadout`'s hardcoded whitelist in sim.js **and** `STAT_LABEL` in ui.js — plus the French, or the stat is silently absent from the pause build sheet. The whitelist is ordered and the sheet caps at `STAT_MAX_ROWS`, so where the key is inserted decides what gets dropped.

- [ ] **Step 4: Implement `firePincer` and the contact check**

The guard is maintained per frame (position, angle from `nearestEnemy`) and its trigger is a proximity test in the enemy loop, not a timer. Register it in the step order alongside the other weapon fire sites.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: `PASS run US.e (pincer): …` and `ALL TESTS PASSED`.

- [ ] **Step 6: Mutation-prove it**

| Mutation | Must fail on |
|---|---|
| the guard fires on a timer instead of on contact | (b) — it disarms with nothing near |
| the angle taken from the player's heading | (a) |
| knockback set to 0 | (c) — no throw |
| `cd` never resets `armed` | (d) |

- [ ] **Step 7: Judge it in motion**

```bash
node scripts/fx-probe.mjs --scene scripts/scenes/pincer.js --out /tmp/pincer --frames 14
```

Write `scripts/scenes/pincer.js` following `beam-prism.js`. **Shoot the armed state as well as the snap** — a telegraph judged only at its payoff is the documented way this repo has shipped unreadable effects. A scene that throws renders nothing and looks exactly like "the effect is invisible", so paint the caught exception into the page.

- [ ] **Step 8: Measure it before calling it balanced**

```bash
node scripts/weapon-census.mjs --chapter surf --level 5 --weapons pincer,flagella,bloom
```

Compare **within this one invocation only** — every weapon named shares one seeded RNG stream, so a number from a different run is not comparable. Read the order, not the absolute value.

- [ ] **Step 9: Commit**

---

### Task 8: The bristle-worm player form

**Files:**
- Modify: `src/render.js` (generalise `chapterHasKaiju` → a form id; add `drawBristleWorm`)
- Modify: `src/config.js` (`CHAPTERS.surf.render.form`)
- Test: `test/sim-test.js` (source-text assertions — render.js is not importable)

**Interfaces:**
- Consumes: `CHAPTERS.surf` from Task 2.
- Produces: `CHAPTERS[id].render.form` — a string id or absent. `chapterHasKaiju` becomes `playerForm === 'kaiju'`.

- [ ] **Step 1: Write the failing test**

```js
function testPlayerForms() {
  const src = readFileSync(new URL('../src/render.js', import.meta.url), 'utf8')

  // (a) the boolean is gone. It survived as ~10 separate call sites, so a partial refactor leaves
  // half the renderer reading a variable that no longer means anything.
  const leftovers = [...src.matchAll(/chapterHasKaiju/g)].length
  assert.strictEqual(leftovers, 0,
    `${leftovers} references to chapterHasKaiju remain — the form refactor is half-applied`)

  // (b) the generalised read exists and is driven by config, not by a chapter id literal.
  assert.ok(/playerForm\s*=\s*chapterRender\.form/.test(src),
    'render.js does not read the player form from the chapter render block')
  assert.ok(!/playerForm\s*===\s*'kaiju'\s*\|\|\s*run\.chapter/.test(src),
    'the form check still branches on a chapter id — that is the boolean with extra steps')

  // (c) every declared form has a draw function.
  const forms = new Set(Object.keys(CHAPTERS).map((id) => CHAPTERS[id].render?.form).filter(Boolean))
  assert.ok(forms.has('kaiju') && forms.has('worm'),
    `expected at least the kaiju and worm forms, found ${[...forms].join(', ')}`)
  for (const f of forms) {
    const fn = 'draw' + f[0].toUpperCase() + f.slice(1)
    assert.ok(src.includes(fn) || f === 'kaiju',
      `form '${f}' is declared in config but ${fn} does not exist in render.js — the player renders as the generic blob with no error`)
  }

  console.log(`PASS run US.f (player forms): ${forms.size} chapter-specific player bodies declared in config, each with a draw fn, and no chapterHasKaiju left`)
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL on (a) — `chapterHasKaiju` still has ~10 references.

- [ ] **Step 3: Generalise the boolean**

In `src/render.js`, replace `let chapterHasKaiju = false` with `let playerForm = null`, set it from `chapterRender.form`, and convert every one of the ~10 sites (9303, 11459, 11714, 11996, 12508-12563 in the pre-refactor file) from `chapterHasKaiju` to `playerForm === 'kaiju'`. Add `form: 'kaiju'` to `CHAPTERS.skies.render`.

Run `npm run build` and shoot The Skies before going further — this task's only real risk is silently breaking a shipped chapter's player art, and nothing in the suite can see a Pixi regression.

- [ ] **Step 4: Add the worm**

Add `form: 'worm'` to `CHAPTERS.surf.render` and write `drawBristleWorm`. **Reuse `drawCentipede`'s rig**: one tapered trunk driven by `spine(t)` with six baked slither phases (`phases: 6`, `lean: 90`). A marine bristle worm is a centipede that swims — shorten the parapodia, retint, and keep the slither.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: `PASS run US.f (player forms): …` and `ALL TESTS PASSED`.

- [ ] **Step 6: Mutation-prove it**

| Mutation | Must fail on |
|---|---|
| revert one of the ~10 sites to `chapterHasKaiju` | (a) |
| declare `form: 'shark'` on a chapter with no `drawShark` | (c) |
| hardcode `playerForm = run.chapter === 'skies' ? 'kaiju' : null` | (b) |

- [ ] **Step 7: Shoot both forms**

```bash
node scripts/shot.mjs 'http://127.0.0.1:5173/?debug' /tmp/skies.png 8000 390 844 scripts/seed-skies.js
node scripts/shot.mjs 'http://127.0.0.1:5173/?debug' /tmp/surf.png 8000 390 844 scripts/seed-surf.js
```

The Skies must be visually unchanged. Judge The Surf's worm against the roster it stands among, not in isolation.

- [ ] **Step 8: Commit**

---

### Task 9: Balance — The Surf as onboarding, The Shelf one step firmer

**Files:**
- Modify: `src/config.js` (`CHAPTERS.surf.balance`, `CHAPTERS.shelf.balance`, `MUTATORS.sticky.exclude`)
- Test: `test/sim-test.js`

**Interfaces:**
- Consumes: everything above.
- Produces: the shipped tune. Nothing consumes it.

- [ ] **Step 1: Write the failing test**

```js
function testUndertowLadder() {
  // (a) The Surf is the gentlest chapter in its book — it is the onboarding chapter now, and The
  // Shelf's numbers were fitted while IT held that job.
  const surf = CHAPTERS.surf.balance, shelf = CHAPTERS.shelf.balance
  assert.ok(surf.spawnMul <= shelf.spawnMul, `The Surf must not out-spawn The Shelf (${surf.spawnMul} vs ${shelf.spawnMul})`)
  assert.ok(surf.enemyDmgMul <= shelf.enemyDmgMul, 'The Surf must not out-damage The Shelf')
  assert.ok(surf.maxAliveMul <= shelf.maxAliveMul, 'The Surf must not hold a bigger crowd than The Shelf')

  // (b) sticky excludes every Undertow chapter. A flat -15% player speed is an unstated tax in a
  // book built on travel, and it is already excluded from beyond/pond/shelf for that reason.
  for (const id of BOOKS.undertow.chapters) {
    assert.ok(MUTATORS.sticky.exclude.includes(id),
      `MUTATORS.sticky does not exclude ${id} — a travel book cannot take a blanket speed tax`)
  }

  // (c) the book's ladder is intact and the WIP gate still holds.
  assert.deepStrictEqual(BOOKS.undertow.chapters, ['surf', 'shelf'], 'the Undertow ladder is wrong')
  assert.ok(!CHAPTER_ORDER.includes('surf'), 'a WIP chapter leaked into Book 1s ladder')

  console.log(`PASS run US.g (undertow ladder): surf gentler than shelf on all three axes, sticky excludes ${BOOKS.undertow.chapters.length} chapters, WIP gate holds`)
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL on (a) or (b) — The Surf inherited the pond's numbers verbatim from the spread, and `sticky` does not list it.

- [ ] **Step 3: Set the tune**

In `CHAPTERS.surf`:

```js
  // The Surf is Book 2's onboarding chapter, so it takes the gentle numbers The Shelf held while IT
  // was chapter 1. Humidity taxes damage on top of everything here (see resourceDamageMul), which is
  // a pressure no other first chapter carries — hence spawnMul under the pond's own 0.75.
  balance: { spawnMul: 0.68, enemyDmgMul: 0.7, enemyHpMul: 0.85, xpMul: 1.25, maxAliveMul: 0.55 },
```

Firm The Shelf one step, and extend the mutator exclusion:

```js
  sticky: { …, exclude: ['beyond', 'pond', 'shelf', 'surf'], … },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: `PASS run US.g (undertow ladder): …` and `ALL TESTS PASSED`.

- [ ] **Step 5: Play it behind the dev gate**

Build, open the live URL on a phone, seven-tap the title coin badge to toggle `meta.dev`, and play The Surf at difficulty 1 and 3. **This step is not optional** — the spec records that every quality correction of consequence in this repo's log came from the shipped build being played, and the dev gate exists precisely so a WIP book can be. Watch for: whether the surge reads as weather or as a control tax; whether a sandbar is legible *before* you are on it; whether the damage floor is felt as pressure or as being nerfed.

- [ ] **Step 6: Ship**

```bash
npm run ship "The Surf opens Book 2 — a tide that shoves you both ways, sandbars that dry you out and cost you damage, and a crab claw you hold out and snap"
```

Then verify with the exact command `ship` prints:

```bash
scripts/deploy-watch.sh "vX.Y.Z · <sha>" "The Surf" "Le Ressac" "Sand Hopper" "Puce de mer"
```

Only string **literals** survive minification — never pass an identifier.

---

## Self-Review

**Spec coverage.** §3 rename → Task 1. §6.1's roster and its flagless-normal correction → Task 2. The tide's two halves → Tasks 3 and 4. Humidity, tide pools and the refill geometry → Task 5. §5.3's amendment and all three of its mitigations → Task 6. Pincer's parry contract → Task 7. §8.4's player-form refactor → Task 8. The onboarding re-tune and the `sticky` exclusion → Task 9.

**Deferred to later plans, deliberately:** chapters 2–5, all other buttons, and the litter/pollution obstacle family. The Surf's button is Thrash — *the shipped shove, unmodified* — so this plan needs no button work at all, which is why it is first in the build order.

**Known gap:** the spec's §4 gives The Surf a litter rung (static obstacles the shove cannot move). The pond spread already supplies an obstacle field, so The Surf has obstacles from Task 2; re-skinning them as tide-line litter is art, and it is folded into Task 2's art step rather than given a task of its own.
