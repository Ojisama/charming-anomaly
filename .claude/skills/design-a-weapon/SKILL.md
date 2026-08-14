---
name: design-a-weapon
description: Use when adding a weapon to Charming Anomaly or redesigning an existing one — runs the idea, the look and the numbers as three phases, each ending at an owner ruling, then wires it in through the checklist whose every entry fails silently.
---

# Design a Weapon

Three phases, in order, each ending at a ruling from Aurélien: **the idea**, **the look**, **the
numbers**. Then a wiring checklist and a gated ship.

The order is not bureaucracy. Each phase produces a decision the next phase's work *depends on*, and
every time this repo has run them out of order it has thrown the later work away:

- Geometry (reach, targeting, what the thing even is) is settled in phase 1, because it is the
  owner's ruling and it invalidates every balance number. Tuning a knob before geometry is settled
  is tuning a knob that is about to be deleted.
- The look is judged before the numbers, because a mechanic that cannot be drawn legibly gets
  redesigned, not rebalanced. An effect whose damage IS an area must be drawn at that area's size,
  several overlap, and the screen becomes a wash — no amount of tuning fixes that, and no skin
  does either.

## The three gates

**Stop and ask at all three.** This is Aurélien's standing preference, and each gate has a specific
shape:

| Gate | You deliver | He returns |
|---|---|---|
| 1. Idea | 3–5 concepts, one sentence each, in text | a pick (sometimes a reframe that replaces all of them) |
| 2. Look | one labelled contact sheet: **3 variants** + a baseline panel, all on one identical frame | a pick **and a tuning note** in the same breath |
| 3. Numbers | the honest census table, no auto-retune | a ruling — he balances case by case |

**Ask each gate with `AskUserQuestion`, not as a prose list of open questions** — a "needs your
ruling" paragraph makes him re-type answers that could have been taps.

At gate 3 he rules; the skill does **not** retune to hit a parity band on its own. Produce the
table, state what it says including when it says the weapon is weak, and let him decide. See
`dont-ship-a-tune-your-numbers-call-a-downgrade` for the one exception: if the numbers say the card
is worse than skipping it, sweep a knob grid *before* presenting, so he is ruling on options rather
than on a dead card.

**Read "[No preference]" as "none of these is the axis"** — go back to concepts, do not ship the
recommended one. It has meant that every time.

## Phase 0 — where does this one enter?

A redesign enters at the phase that is wrong, not at phase 1.

- "this weapon is weak / too strong" → phase 3 only.
- "it doesn't look like an X" → phase 2 only.
- "it doesn't work / it's a mess / it's not fun" → phase 1, even though it sounds like a bug
  report. The Pincer's "doesn't work, doesn't look like a crab shield, can't touch enemies on you"
  was three complaints across all three phases and needed all three.

Before deciding, **measure the complaint** — a card reported broken is usually working with no
feedback (`measure-the-mechanic-before-fixing-it`). A clean probe is a clue, not "cannot reproduce".

## Phase 1 — the idea

**Pitch concepts in text before building anything.** Four ideas in four sentences is one cheap
message; four built variants is an hour of probe runs. Three separate weapons have now landed on
Aurélien's own one-line reframe after I skipped this round: the Sewer Geyser (twelve-plus rejected
variants, then *"I want it like an auto turret"*), the Moon Jelly, and the Pincer.

**The test for "genuinely different": what does the player DO differently while holding it?** If two
concepts differ only in damage, area or fire rate, they are one concept at three intensities. That
mistake has shipped three times (Beam Prism A/B/C, the jellyfish's four plan views, the claw's four
arc-spanning cuts).

Settle these before leaving the phase, because each one is his and each one invalidates numbers:

- **Geometry.** Reach, and what it is anchored to — the player, a point in the world, a target.
  Orbiting, aimed, persistent-until-triggered, or on a timer.
- **Targeting.** Nearest enemy, facing, all directions, a placed zone.
- **The tell.** Does the player read this weapon *before* it fires? If yes it needs distinct
  ARMED / SPENT silhouettes, and phase 2 has to shoot both — a telegraph judged only on its payoff
  frame is not judged.
- **Which chapters' pools it joins**, and **the branch each of those chapters takes.** Several
  systems fork on `CHAPTERS[id].lane`; a weapon can genuinely do two different things in two
  chapters, and describing the wrong branch out loud has already been corrected from play.
- **Its 4–6 weapon mods** (`WEAPON_MODS[id]`). A weapon without mods is half-designed — the mods are
  where the build variety lives. Note which one is the count mod, because a per-cast count is
  usually written twice (loop bound *and* spacing divisor) and multiplying one of them renders
  identically to no change at all.

**Name it in this phase, in both languages.** A display name chosen late means renaming the id, the
constants, the events and the comments, and that sweep has two silent failure modes: field names
also exist as quoted strings an identifier sweep cannot see, and a display-name sweep over-matches
user-facing copy (`leaf blade` → `boomerang leaf` shipped `'boomerang leaf(s) per throw'`, which is
not English and which every test passes happily). Draft 2–3 French options and let him pick — there
is no translation subagent for this repo.

Cost of implementation is **never** a ranking column (`judge-designs-on-fun-not-build-cost`). Rarity
licenses run-ending extremity.

## Phase 2 — the look

**Build the probe FIRST, before writing any candidate look.** The variants are cheap once the seed
exists; the seed is the expensive part.

```bash
# one scene file per effect, in scripts/scenes/<weapon>.js
node scripts/fx-probe.mjs --scene scripts/scenes/<weapon>.js --chapter <id> \
  --url http://127.0.0.1:PORT/ --out /tmp/x --frames 6 --wait 60000
```

`beam-prism.js` is the worked example and documents the `H` surface
(`weapon`/`breed`/`keep`/`place`/`pin`/`tick`/`tickFx`/`note`).

Non-negotiables, each one a round this repo has already lost:

- **Plan view.** The camera looks straight down. Creatures, weapons, effects and pickups are all
  overhead; only buildings and props stand upright. Ask the frame the second question explicitly:
  *is this the same viewpoint as the sprites around it?* (v6.8 shipped the Trash Tornado as a side
  elevation — a coherent drawing, the wrong projection, and a whole version to undo. The one
  deliberate exception is a body in a water column with no floor to lie on, e.g. the Moon Jelly.)
- **Draw the OBJECT, not the hitbox.** A sprite baked to state its own tested extent can stop
  depicting the thing it is. Four cuts of the Pincer claw were faithful pictures of a 140° arc and
  none of them was a claw. State the part of the hitbox that can be drawn without destroying the
  read (for the claw: the radius, via where the fingertips land), and say plainly in the commit
  which part the art no longer states.
- **Shoot every STATE**, not just the payoff — armed, firing, spent, re-arming.
- **Two viewports.** `--w 1280 --h 800` for the second. Anything compared against the screen is a
  different mechanic on each, and the one you shot will look right.
- **Bake at the largest shipped size and scale DOWN.** A sprite baked small and magnified comes out
  stepped on every edge.
- **A motion GIF when it animates** — variants that differ only in motion cannot be picked from a
  still.

Deliver **one labelled contact sheet**: **three variants** plus a baseline panel of what currently
ships — four panels — every one the same in-game frame so only the sprite differs, stacked with
labels, sent with `SendUserFile`. One image beats five.

**Three is the baseline count** (Aurélien's ruling, 2026-08-14). Deviate only when he asks. And note
what the number is *not* for: past sessions have gone from three variants to twelve and been
rejected at every count, because volume does not find a direction. If three genuinely different
designs all miss, that is the signal to go back to the concept round — not to draw a fourth.

**After he picks and you build it, send the frames again** — iterations in order with the shipped
one marked, failed cuts included. They are the argument for why the shipped one is right and they
already exist. Any commit that changes what something looks like ends with a `SendUserFile`; prose
about what it now reads as is unreviewable.

Two probe traps that read exactly like "the effect is invisible": a scene that throws renders
nothing (paint the caught exception into the page), and a pinned cast struck every frame never
stops flashing white (`e.hitFlash = 0`, and `run.player.invuln = 0`, on both sides of the step).

## Phase 3 — the numbers

```bash
node scripts/weapon-census.mjs --chapter <id> --level 5 \
  --weapons <new>,<chapterNative1>,<chapterNative2> --mods <modKey>=1
```

- **Every comparator in ONE invocation.** Each weapon is measured off one seeded RNG stream, so
  changing weapon A re-phases B's draws. A number that moved without a matching code change is
  noise — re-run the whole table and read the ORDER, not the absolute value.
- **Effective dps, never `hit` events.** `{type:'hit', dmg}` carries the raw swing, credits overkill
  in full, and flatters exactly the weapons with the biggest per-hit numbers. It once read the
  Sewer Geyser as the city's highest-damage weapon when it was its lowest.
- **Pick the rig for the question.** Immortal + stationary answers *what does it do* (dps, proc
  rates). Immortal + **kiting** answers *can anything reach you* — mandatory for slows, knockback,
  fear, walls. Mortal + kiting is the only one that may be quoted as a win rate.
- **Probe a lever with an existing mod rather than editing config between runs.** The Pincer's reach
  ladder was measured by feeding its own Long Arm mod at three values in one invocation — no config
  churn, no A/B across runs, no re-phased stream.
- **300s seeded runs, several seeds.** `WAVE_TABLE` gates archetypes by time: no tank spawns before
  t=140s, so a short probe measures "absent from this window" and reports it as "absent".
- `createRun(meta, { chapter, difficulty })` takes an **options object** — a positional string
  silently gives you `body` at difficulty 1. The probe meta must also unlock the chapters, and must
  carry `shop: {}` or `loadMeta` throws into a fresh meta with no warning.

Present the table with its denominator stated. Never estimate a quantity the harness can measure —
every guess this repo has made was off 3–6×.

## Phase 4 — wiring it in

Every entry here fails **silently**. Nothing throws, no test goes red on its own, and the symptom is
always "the feature seems to do nothing".

- [ ] `WEAPONS[id]` in config.js with its `levels[]` ladder. **Balance numbers live in config.js and
      nowhere else** — a magic number in sim.js belongs here as a named export.
- [ ] Added to each chapter's `weapons` pool (and `starter` if it is one).
- [ ] `WEAPON_MODS[id]` — 4–6 mods. An on/off mod that must be EPIC cannot be `kind: 'switch'`;
      use `values: { epic: 1 }` + `maxPicks: 1` (the Beam Prism idiom).
- [ ] **A new stat is registered twice**: the whitelist array in `buildReadout` (sim.js:4960) *and*
      `STAT_LABEL` (ui.js:1821). Miss either and the stat is simply absent from the pause build
      sheet. The whitelist is ordered and the sheet caps at `STAT_MAX_ROWS` (5), so where you insert
      decides what gets dropped.
- [ ] French for the label and the copy in `src/fr.js`. Edit it via node/python — the NBSP (U+00A0)
      before `: ; ! ?` makes exact-string anchors fail invisibly.
- [ ] **Copy containing a number is a `tt()` template**, not a built string. `t()` is keyed by the
      exact English source, so a sentence with its numbers baked in has a different key every time
      the value changes and can never be translated.
- [ ] Added to run XX's coverage walk in the same commit, and watched go red before writing the
      French. Copy living in a function or a bare const is exempt from that walk by construction —
      that exemption has shipped untranslated strings three times.
- [ ] New events emitted by sim.js are handled in **both** render.js and `SFX_FOR_EVENT`
      (main.js:380). Sound is a deliberate decision, not an oversight: it gets an entry only if the
      event is rare enough to bear one.
- [ ] **Publish into an existing contract field** rather than teaching render.js a new one. Grep
      render.js for the field you are actually setting before shipping any status.
- [ ] New `run.*` fields and event shapes documented in the `state.js` doc block.
- [ ] render.js `reset()`: a flat sprite pool goes in the hardcoded flat list; a rig gets its own
      `.root.visible = false` line. Putting one in the other's list sets a dead property on a plain
      object and last run's entities stay on screen.
- [ ] A `test/sim-test.js` scenario, **mutation-proved**. Assert effects, not state — a test that
      checks a timer moved passes with the feature deleted. Mutate a scratch copy
      (`git archive HEAD src | tar -x -C <tmp>`), never the working tree, and make every mutation
      distinct.
- [ ] `npm test` green, and `git status --short` clean of scratch artifacts (`.gitignore` only
      covers `/*.png` at the repo ROOT).

## Phase 5 — ship it gated, then he plays

Ship to the live URL behind the WIP/dev gate so he can reach it on his phone.

```bash
npm run ship "<one plain sentence about what changed and why>"
scripts/deploy-watch.sh "vX.Y.Z · <sha>"     # ship prints the exact line
```

Never choose a version number. Write reasoning on the commits *below* the release — `ship` amends
HEAD with `-m` and destroys any body on that commit.

Then hand him **the exact card name and how to summon it**: seven taps on the HUD coin badge
mid-run (within 1s of each other) opens the dev menu, which lists every card the game can produce
and ignores every eligibility rule — chapter pool, minLevel, dedup. That is how he tests one
specific card on a phone against the live URL.

Report: what it does, what the census said, what you did **not** verify, and the card name.

## What this skill does not cover

A weapon that needs a new chapter, a new enemy behaviour flag, or a new signature mechanic is a
bigger change than this — brainstorm it as a chapter, then come back here for the weapon.
