---
name: probing-the-game
description: Use before measuring ANYTHING about Charming Anomaly, or driving the game in a browser — dps, proc rates, pool shares, survival, reach, spawn composition, an A/B of a balance change, a screenshot of an effect, a layout judged at a viewport, or any "is this weapon weak / does this mechanic work" question. Carries the rig-selection rule and the traps that make a correct-looking probe return confidently wrong numbers, plus the browser and headless capture recipes. Triggers on "measure", "probe", "how much", "is X weak", "screenshot it", "shoot the frame", "check it on desktop".
---

# Probing Charming Anomaly

Two ways to find out what the game actually does: headless node against `sim.js`, and a real
browser. Both have traps that fail **silently** and hand back confident numbers, which is why this
is a skill and not a paragraph.

**Prefer the `measure` subagent for anything headless** — it carries these rules, it is read-only by
construction, and its context dies with it instead of deepening yours.

## Headless sim probes (node against sim.js — no browser)

`sim.js`/`config.js`/`state.js` import cleanly into plain node, which makes "what does this actually
do over a real run" a 30-line script rather than a browser session. `scripts/weapon-census.mjs` and
`scripts/pool-probe.mjs` are the worked examples. Five traps. The first four produced CONFIDENT
WRONG NUMBERS in v7.16 and the fifth was found in 2026-08-16; every one of them fails silently, and
three of the original four were only caught because a downstream detail looked odd:

- **`createRun(meta, opts)` TAKES AN OPTIONS OBJECT.** `createRun(meta, 'undergrowth', 3)` does not
  throw and does not warn — `opts` is a string, `opts.chapter` is undefined, and you get **body at
  difficulty 1**. A whole session's measurements were quoted as "undergrowth d3" before a roster-id
  breakdown came back `redcell`/`antibody`. Use `createRun(meta, { chapter, difficulty })`, and
  print `run.chapter` in the probe's own header so the output states what it measured.
- **The probe meta must UNLOCK the chapters**, exactly like a seeded save (see the browser section
  below). With `chapters: {}` `ensureChapterMeta` defaults `unlocked` to `id === 'body'` and
  `resolveChapterId` falls back — the same wrong-chapter failure, from a different direction.
- **A PROBE THAT CANNOT MEASURE MUST NOT PRINT NUMBERS — abort, loudly, with a non-zero exit.**
  The positional order for `pool-probe.mjs` is `<chapter> <slots> <runs> <policy>`, so the plausible
  `pool-probe body 4 dps` omits `runs` and lands `'dps'` in that slot. `Number('dps')` is `NaN`,
  every loop bounded by it runs zero times — and it used to print **every heading with `NaN` under
  it and exit 0**, including `short pools 0/0  (MUST be 0)`, which reads as a PASS when nothing ran
  at all. That is the worst shape a harness can fail in: not an error, but a confident answer to a
  question it never asked. It now aborts on all four positionals with a message naming the mistake
  (v7.99+). Two rules follow for any probe you write or extend: validate every argument that
  indexes a loop bound, and treat a **silent fallback** as the same defect — `pool-probe`'s
  `choose()` tests `'random'` and `'defense'` and lets everything else become the dps bot, so
  `defence` (the spelling this file prints in its own output) quietly measured the wrong policy.
  This is the companion to the print-the-denominator rule: `0/75` proves a run happened, `0/0`
  proves nothing and looks identical.
- **A HARNESS THAT *WRITES* MUST ABORT ON A FAILED PRECONDITION, NOT LOG AND CARRY ON.** The
  mutating twin of the rule above, and it fails worse, because it leaves the TREE in a state neither
  end of the change would produce. A v7.11x rename script asserted an expected occurrence count per
  replacement and got every one of them wrong (the counts were guesses); it printed `MISMATCH` for
  each, `continue`d — and then still ran `fs.writeFileSync` at the bottom of the loop, rewriting all
  three files with the replacements that *had* matched. The output said the run failed and the disk
  said it half-succeeded. Collect every edit, verify them ALL, and only then write; or exit non-zero
  before touching anything. And prefer asserting a count you have MEASURED (`grep -c`) over one you
  expect — a guessed count turns a safety rail into noise you learn to scroll past.
- **PIN A SUBJECT BY IDENTITY, NEVER BY ARRAY POSITION OR LENGTH.** `run.enemies.length = 1` keeps
  index 0, and a splice anywhere in the step moves your subject off it — after which the probe is
  measuring some *other* entity, or none, and nothing says so. That fixture reported **7 dashes in
  120s for a machine on a 1.45s cycle** (its subject had been dropped ~10s in and its state frozen
  ever since), which reads exactly like a slow mechanic. `if (run.enemies.length !== 1 ||
  run.enemies[0] !== e) run.enemies = [e]` is the fix, plus a floor assertion (`if (dashes < 5)
  abort`) so the next silent drop is an error instead of a number.
- **NORMALISE ANYTHING BAKED AT SPAWN BEFORE COMPARING IT ACROSS RUNS OR TREES.** `hp` and `dmg` are
  frozen at spawn through `hpScale(t)` / `dmgScale(t)` (spawnEnemy), so two runs whose subject
  happened to spawn at different times produce numbers that cannot be subtracted. An A/B of a change
  that HALVES the Sea Roach's damage read "down 30%" for exactly this reason — and the tell was in
  the same output the whole time, `maxHP 8` on one side against `66` on the other. Capture the clock
  with the subject (`tSeen = run.time`) and report `dmg / dmgScale(tSeen)`; or force both sides to
  sample the same moment. Same hazard for any `*Scale(run.time)` quantity.
- **SEED `Math.random`** (mulberry32, as test/sim-test.js does) and average several runs. Unseeded,
  the same build measured 11 and then 34 contact hits — enough to invent or erase any effect you
  are about to report. Seed per run, use the same seed set on both sides of an A/B.
- **`WAVE_TABLE` GATES ARCHETYPES BY TIME.** `tank` does not spawn until **t=140s** and `wisp` not
  until t=40. A 120s probe therefore cannot see a single tank, so anything about tanks — a roster
  flag, a behaviour, a counter to a strategy — measures as "absent" rather than "absent from this
  window". Run the full 300s when the question involves late-run composition.

**PICK THE RIG FOR THE QUESTION, not just the parameters.** The traps above are all things you can
get wrong in a correct rig; this is the one that makes a correct probe structurally incapable of
seeing the answer, and it costs whole rounds because it returns confident numbers rather than an
error. Three rigs, three different questions:

- **immortal + stationary** (the offer probe): what the pool OFFERS, what a weapon DOES, dps,
  proc rates. `pool-probe.mjs` says in its own header that it is not valid for survival — that
  warning is broader than it looks.
- **immortal + KITING** (walk away from the crowd; a floor on player skill, not a model of one):
  can anything REACH you. Anything about slows, knockback, fear, walls or "I'm invincible" needs
  this. A stationary player is surrounded whatever the crowd's speed, so it reports the same
  180-350 contact hits for every build and hides the effect completely — v7.17 read that as "no
  lock exists" while the lock was on screen in a screenshot.
- **mortal + kiting**: can you SURVIVE. Only this one may be quoted as a win rate.

Match the metric too. For a wall, damage taken is the wrong number — it conflates "nothing reached
me" with "I killed it first". Use the **median distance of the nearest enemy** over the back half of
the run: a crowd sitting at a stable radius is a lock, whatever the damage column says.

And when several effects compose (knockback + slow + fear + fire rate), add them to the REAL build
one at a time. Testing each alone finds nothing and reads as "cannot reproduce" — see the layered
table in the CC_DR_* block of config.js.

To A/B a change, extract the old tree rather than editing back and forth:
`git archive HEAD src | tar -x -C <tmp>`, then point the same probe at each `src` in turn (take a
src path as argv). That also keeps the mutation rule intact — the working tree is never touched.

## Browser probing (headless / backgrounded tabs)

- Background tabs throttle rAF to a crawl: never wait wall-clock for the sim. Drive frames
  explicitly — `let now = performance.now(); for (…) app.ticker.update(now += 50)` — or stop the
  ticker and call `__stepSim` + `__renderer.sync(run, dt, run.events.splice(0))` +
  `app.renderer.render(app.stage)` manually.
- main.js reacts to phase transitions (levelup/dead/victory) ONLY when its own ticker's stepSim
  flips them. Forcing `run.phase` or stepping via `__stepSim` never fires endRun — set the
  preconditions instead (e.g. `run.time = 299.9` while 'playing') and let `ticker.update` cross
  the line.
- Screenshotting short-lived FX: `app.ticker.stop()` first, drive frames manually, render, then
  shoot — the live rAF loop otherwise expires the effect between evaluate and screenshot.
- **Judging a LOOK (an effect, a weapon animation, a telegraph): use `scripts/fx-probe.mjs`.** It
  boots once, seeds a save, pins the RNG, composes a scene from `scripts/scenes/<name>.js`, and
  captures a frame sequence — `node scripts/fx-probe.mjs --scene scripts/scenes/beam-prism.js
  --out /tmp/pr --frames 14`. Write a new scene file per effect; `beam-prism.js` is the worked
  example and documents the `H` helper surface (`weapon`/`breed`/`keep`/`place`/`pin`/`scrub`).
  Stack the frames with `ffmpeg` into a labelled contact sheet or GIF.

  **TWO OPERATIONAL FACTS FIRST, because each costs a round and neither error names its own cause.**
  (1) **It needs a dev server ALREADY RUNNING** — it navigates to `--url`, default
  `http://127.0.0.1:5173/`, and does not start one. With nothing there the page is an error document
  with an opaque origin, so the save-seeding initScript dies as
  `DOMException: Failed to read the 'localStorage' property ... Access is denied`, followed by
  `scene never became ready`. That names neither the port nor the missing server, and reads like a
  broken scene. Start vite on a fresh port (`npx vite --port 5203 --strictPort`) and pass `--url`.
  (2) **RUN INVOCATIONS ONE AT A TIME.** Two fx-probes launched in the same message both fail with
  `scene never became ready`; run sequentially and both pass unchanged. Shooting N look variants is
  therefore N sequential calls, not one parallel batch — budget the wall clock for it.

  The three traps it exists to
  bake out, which cost real rounds in v6.7.7 and will again if you hand-roll a probe:
  - **One `initScript` seeding of `Math.random` does NOT give you the same frame twice.** The
    ticker runs free between boot and whenever the probe gets control, and each rendered frame
    burns randoms (dust motes, particles), so how many depends on machine load — every variant
    lands on a different tile with a different crowd. Pin it in the initScript AND **again right
    after `app.ticker.stop()`**. Even then only the SCENE is reproducible, not the pixels (animT
    drives the beam pulse and floor dust): compare by eye, never by md5.
  - **Don't re-boot per frame** (~16s each). Stop the ticker, compose once, then rewind the
    effect's own life field (`s.life = full * (1 - age)`) and re-render between captures. A burst
    or a fade cannot be judged from a still.
  - **A scene that throws renders nothing, which looks exactly like "the effect is invisible".**
    Paint the caught exception into the page so the screenshot carries it, and read that before
    re-shooting anything.
- **ANYTHING THAT READS THE VIEWPORT IS NOT VERIFIED UNTIL IT HAS BEEN SHOT AT TWO VIEWPORTS.**
  `fx-probe.mjs` defaults to a 390x844 phone; pass `--w 1280 --h 800` for the second. The phone's
  half-diagonal is 465px and the desktop's is 755px, so any quantity compared against the screen —
  a radius, a cull margin, a vignette, an early-out — can be a different mechanic on each, and the
  one you shot will look correct. v7.58 shipped a full-bar early-out for the light chapter's dark with a
  config comment calling it a considered decision; it was measured on the phone alone, where it is
  right, and on a desktop the same code left the corners vignetted at a full bar. It came back as a
  bug report within the hour (v7.60 fixed it by stating the light in screen half-diagonals). Assert
  the RATIO in the suite, never px: px passes at exactly one screen size, which is how it shipped.
- Enemies that render as white silhouettes are `hitFlash`, not a bug — a pinned cast being struck
  every frame never stops flashing. Clear it, or you cannot judge an effect against the sprites it
  sits over. Same class of trap: a final `sync` handed the whole warm-up's `run.events` buries the
  frame in damage numbers, so drain events every step.
- **A/B-ing a BAKE (an entity's texture, not its motion): put every candidate behind a throwaway
  query param** — `const V = Number(new URLSearchParams(location.search).get('tv') || 0)` at
  render.js module scope, one bake per value, then `--url 'http://127.0.0.1:PORT/?tv=N'` per shot
  (fx-probe appends its own `&debug`). One edit and N probe runs, instead of editing render.js
  between every shot and hoping the frame came back the same. Bakes happen once at boot, so the
  param has to be read at module scope, not per frame. Delete the switch and the losing bakes with
  the pick — grep the param name to prove it is gone before committing.
- A probe that runs thousands of `__stepSim` calls synchronously BLOCKS the main thread, and a
  screenshot taken during that block is plain white. That is not a blank-page bug — confirm which
  one you have by shooting the same URL with no seed script at all before reporting a prod outage.
- `vite preview` snapshots the dist file list at startup (always restart it AFTER `npm run
  build`) and serves at `/`, not the Pages subpath. Stale preview servers from other sessions
  squat ports — pick a fresh one (`--port N --strictPort`) rather than killing unattributed pids.
- Seeding a save: use a DevTools navigate `initScript` (runs on the fresh document before app
  boot). NOT `localStorage.setItem` + `location.reload()` from inside an evaluate — the reload
  silently does not take, and you are left probing the pre-seed app while localStorage shows the
  right bytes. (This repo has no unload handler; `state.js` says so explicitly. If a seed looks
  ignored, suspect the reload or the save shape, not a clobber.) Open tabs share localStorage —
  use isolated browser contexts or close extras first.
- **A seeded save MUST carry `shop: {}`.** `loadMeta` does `m.shop[id] = …` inside its own
  try/catch, so a save without it throws and falls back to a FRESH meta with no warning — the
  symptom is a title screen at difficulty 1 in English while localStorage holds your seed. Same
  trap for any field the loader writes into rather than reads: read `loadMeta` before hand-building
  its input. A working seed is
  `{schema:1, coins, runs, lang, chapter, shop:{}, best:{}, chapters:{…}, nick:'…'}`.
  **`nick` IS LOAD-BEARING SINCE v7.157 and its absence looks nothing like its cause.** `nick: ''`
  means "never chosen" and fires the leaderboard nickname prompt — a MODAL over the title screen —
  so a perfectly good seeded save never reaches a run. In `fx-probe` that surfaces as
  `scene never became ready` with no page error and no `__fxError`, i.e. indistinguishable from a
  scene that draws nothing; it cost a bisect against a known-good scene to find, and it had broken
  EVERY scene for every user of the probe. The general rule is worth more than the field:
  **any new modal on the title screen breaks every headless probe that seeds a save**, and the
  symptom never names the modal. When a probe that used to work stops reaching a run, shoot the
  bare URL with `scripts/shot.mjs` and look at the page before debugging the scene.
  Per-book progression (v7.x) has NOT changed this — `shop` is still book 1's own top-level field,
  still required, still repaired the same way. A seed MAY also carry `books: {}` / `grants: {}`
  (Book 2's per-book purses and the monotone unlock-grant flags, both additive — see `bookMeta`/
  `ensureBookMeta` in state.js), but both are optional: `ensureBookMeta` repairs a missing `books`
  entry on first read, same as every other additive field below.
- Judging layout at 320px: the devtools window will not resize below ~500px, and `resize_page`
  fails SILENTLY (it reports success; `innerWidth` still reads 500). Always read `innerWidth` back
  before trusting a width. To actually test the phone width, inject a style constraining the
  screen + `.modal` to 320/294px — `.modal` is `min(92vw, 390px)`, so the viewport alone will not
  do it — and measure there.
- `scripts/deploy-watch.sh "vX.Y.Z · <sha>" ["more strings" …]` watches the Pages deploy to
  completion, then greps the LIVE bundle for each string — the standard post-push gate. **Only
  pass strings that survive minification**: user-visible copy, config text, French translations,
  anything that is a string LITERAL in the source. Never an identifier — esbuild renames locals and
  private functions, so grepping a variable name reports `0` and proves nothing (v6.7.7 asked it
  for `prismBodyG`). A change with no new string literals cannot be gated this way at all; verify
  it by shooting the built bundle instead (`npm run build`, `vite preview`, `scripts/fx-probe.mjs`).

### When there is no MCP browser tab

The chrome-devtools MCP profile is single-instance: another Claude session (or a stale one) holding
it makes every tool call fail with *"browser is already running"*, and claude-in-chrome needs the
extension connected. Both can be unavailable at once. Fallbacks, in order:

- **Pure DOM/CSS work on ui.js needs no browser boot at all.** Write a throwaway `harness.html` at
  the repo root that imports `ui.js` + `state.js` + `config.js`, hand-builds a `meta`, stubs every
  hook with `() => {}`, and calls `initUI` — optionally `ui.showScreen('brief'|'shop'|…)`. ui.js is
  Pixi-free by contract, so it renders instantly, in any headless mode, with no WebGL. This is the
  fast path for title/shop/summary layout; delete the file before committing.
- **Anything needing the real app** (the Pixi canvas, `window.__renderer`, a real run):
  `node scripts/shot.mjs <url> <out.png> [waitMs] [w] [h] [seed.js]`. Its header documents why it
  exists; the three traps it exists to avoid are worth knowing on their own:
  - `google-chrome --headless=new --screenshot` / `--dump-dom` report `innerWidth` as **0** here.
    The page still paints at some unrelated size and gets tiled into the file, so captures show
    clipped badges and overflowing cards that do not exist. **Do not debug layout from them** — one
    session lost several rounds "fixing" CSS against these. `--headless=old` would honour
    `--window-size`, but it has been removed from the Chrome binary. Use `chrome-headless-shell`
    (puppeteer's cache, `~/.cache/puppeteer/chrome-headless-shell/*/`), which still behaves.
  - `--virtual-time-budget` fires the capture when VIRTUAL time expires, which is unrelated to Pixi
    finishing its async boot — the app screenshots blank. Drive CDP and sleep on the wall clock.
  - If you must hand-roll CDP: node >= 22 has a global `WebSocket`, so no dependency is needed, and
    `Page.addScriptToEvaluateOnNewDocument` is the CDP form of the initScript seeding rule above.

## One more measurement trap

- **Measuring damage from `hit` events over-reports.** `{type:'hit', dmg}` carries the RAW swing,
  not HP removed, so it credits overkill in full and flatters exactly the weapons with the biggest
  per-hit numbers. In v6.10 that read the Sewer Geyser as the city's highest-damage weapon (531)
  when it was its lowest (383 effective, 28% wasted) and inverted the ranking of all three natives.
  Diff enemy `hp` across the step instead — `scripts/weapon-census.mjs` does, and documents the
  other trap in the same breath (`run.events` must be drained every step, as main.js does, or the
  backlog is recounted every frame and dps reads ~2800× high).
