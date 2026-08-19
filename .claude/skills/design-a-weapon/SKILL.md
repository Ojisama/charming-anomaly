---
name: design-a-weapon
description: Use when adding, redesigning, rebalancing or fixing a WEAPON or a weapon mod in Charming Anomaly. Triggers on how the owner actually phrases it — "this weapon feels weak/wrong", "it doesn't look like a <thing>", "it's a mess, redesign it or propose alternatives", "propose 3 other designs", "make it work like an auto turret / a shield / a boomerang", "the <X> doesn't work", a new card for a chapter's arsenal, or any change to what a weapon hits, reaches, throws or looks like. Runs the idea, the look and the numbers as three phases, each ending at an owner ruling, then an adversarial pass, then wires it in through the checklist whose every entry fails silently.
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

  **THIS SENTENCE ALONE DID NOT WORK, WHICH IS WHY IT IS NOW ENFORCED.** The Shelf shipped its three
  natives at 2/0/0 — Silt Veil and Ballast with no mods at all — while this line and the phase-4
  checkbox both already said not to, so the chapter could offer exactly two distinct mod cards in a
  300s run and its mod bucket measured 20.4% against a declared 27.9%. `run MB.a2` now fails any
  weapon in The Surf or The Shelf carrying fewer than four, and `run MB.a` fails any mod anywhere
  that resolves to no fold, no rate division and no fire site. **Design the mods in this phase and
  let the suite prove it in phase 4** — an unenforced instruction is a note, not a guard.

  **A count mod that CHOOSES TARGETS must choose distinct ones.** The divisor trap above is the
  version where the spacing is wrong; the other version is a chooser that picks *with replacement*,
  so two of the three things land on one body. That is the same "same hit, bigger" outcome the card
  exists to escape and it also renders identically to no change at all — `pickBloomSpot` picks with
  replacement and is right for a single cloud, `pickBloomSpots` is what a count mod needs. Assert
  **distinct positions**, never a count.

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
      use `values: { epic: 1 }` + `maxPicks: 1` (the Beam Prism idiom). **Do not self-report this
      one — run it.** `node test/sim-test.js modbudget` fails on a weapon below four mods in either
      Book 2 chapter (MB.a2) and on any mod in the game wired to nothing (MB.a). A mod present in
      `WEAPON_MODS` but absent from `WEAPON_STAT_MODS`, `WEAPON_RATE_MODS` and every fire site is an
      INERT CARD: offered, picked, banked, doing nothing, with nothing thrown.
- [ ] **Its player-facing copy names what it reads.** A card that keys off a bar, a zone or a
      resource must say so in the words on the HUD — the Sunlance's *"It reaches as far as your
      Light does."* is the shipped idiom — and must not coin a noun the game shows nowhere else.
      Checking a string for fr.js collisions and `tt()` correctness proves it is unique and
      translatable, not that it is legible; both failures in v7.163 passed those checks and were
      caught by the owner reading the card.
- [ ] **A new stat is registered in ONE place**: `STAT_KEYS` (config.js). This used to be two lists
      in two files; ui.js now derives `STAT_LABEL` from `STAT_KEYS` and needs **no edit at all** for
      a new weapon or a new stat. The table is ORDERED and ui.js appends the cadence row then slices
      to `STAT_MAX_ROWS` (5), so where you insert decides which stats fall off the bottom. Add the
      French for the label — run XX walks `STAT_KEYS` and catches a missing one, but only the label,
      never the row order.
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

## Three that are not checklist ticks — they are how weapons break

- **A PER-CAST COUNT IS USUALLY WRITTEN TWICE — as the loop bound AND as the divisor that spaces
  what the loop spawns.** `for (i < stats.orbs)` with `angle = (i / stats.orbs) * 2pi`,
  `(i - (count - 1) / 2) * STAR_FAN`, `(2 * BOOMERANG_FAN) / (count - 1)`, `i / count` in the quill
  and shriek rings: eight sites across the weapons. Multiply ONE of them and the extra output stacks
  on top of the original instead of spreading — and it **renders identically to no change at all**,
  because three projectiles sharing a point look like one projectile. v7.6.0 shipped Ipecac tripling
  orbit's loop bound to 15 while the divisor still read `stats.orbs` (5): fifteen phages in five
  positions, three deep, which is the "same hit, bigger" shape that whole card was rewritten to
  escape. It was caught by eye, from a screenshot that looked unchanged. Introduce ONE local for the
  count and use it in both places, and assert **distinct positions** rather than a count — a count
  passes happily when things spawn on top of each other (run PB7's every-weapon block does this).

- **A SHARED ENTITY ARRAY HAS MORE RENDER CONSUMERS THAN THE ONE YOU EDITED.** `run.lobs` has
  THREE — `syncLobs` (the thrown-object rig), `redrawHazards` (the amber landing ring), and now
  `drawColumns` — and nothing about the array says so. The Twilight's Sunspear reused `run.lobs`, was
  filtered out of `syncLobs`, and still came back wearing a Debris Toss landing ring: two telegraphs
  on one strike, which read as "the effect looks like soap bubbles" rather than as a missed site.
  **Reading the render code named the wrong culprit twice; one ablation pass (hide the layer, shoot
  the same frame) found it immediately.** Before reusing an array, `grep -n "run.<array>" src/render.js`
  and check every hit, then ablate to confirm what is actually drawing what you see.

- **A WEAPON'S BEHAVIOUR IS CHAPTER-CONDITIONAL — read the branch its own chapter takes.** Several
  systems fork on `CHAPTERS[id].lane`. **There are TWO lane chapters, not one: `beyond` (forward is
  -y) and `reef` (`laneAxis: 'x'`, forward is +x).** This sentence read "`beyond` is the only lane
  chapter" until v7.120, when the stale count caused a real bug: the death outro's iris is centred on
  the player, a lane camera holds the player `LANE_CAMERA_FRAC` along the forward axis rather than at
  the centre (20% across, in The Reef), and a sprite sized only against the screen therefore left a
  hard dark band down the right of every Reef frame. **Anything screen-space anchored to the player
  has an off-centre origin in a lane chapter** — see `irisCoverMul` in config.js. Grep `lane:` in
  config.js rather than trusting a count written here, this one included. So `firePulsar`'s
  `lane ? PULSAR_FAN_ARC : 0` means the full-circle rotating rake — the behaviour its comments
  describe at length, and the one you will describe to the owner if you read the function
  top-to-bottom — **never happens in The Beyond**, the only chapter that offers the weapon: there it
  is a ~112° forward fan wipering left-right-left. (It does run in `blank`, whose pool is all 22
  weapons, which is exactly why "what does this weapon do" has more than one answer.) Before
  describing a mechanic, list the chapters whose pool contains it and check the branch each takes.
  v7.10 got this wrong out loud and was corrected from play.

## Phase 4.5 — the adversarial pass (do not skip, do not ask permission)

Aurélien asks for this by hand, over and over — *"spawn an adversarial fable agent to challenge your
findings"*, *"have 1 adversarial agent challenging your output"*, *"implement the 4 remaining cards,
each against a adversary reviewer"*. It works, and it should not depend on him remembering to ask.
Run it after wiring and **before** shipping.

Dispatch **one** subagent (`general-purpose`, sonnet is enough) whose job is to REFUTE, not to
admire. Give it the census table, the diff, and this instruction set verbatim:

> You are reviewing UNCOMMITTED work. **Do not mutate the tree.** Allowed: `git diff`, `git show`,
> `git log`, file reads, running `node scripts/*.mjs` and `node test/sim-test.js`. Forbidden:
> `git stash` in any form, `git reset`, `git checkout`, `git restore`, `git clean`, `git add`,
> `git commit`, and any edit to any file. Default to "this is broken" when uncertain.

Point it at the five things that actually go wrong here, because a vague "review this" comes back
with prose:

1. **Does the census reading survive?** Numbers compared ACROSS invocations are noise — every weapon
   in one `--weapons` list shares an RNG stream, so changing A re-phases B. Did the comparison stay
   inside one invocation, and does the ORDER hold?
2. **Is the rig capable of seeing the claim?** A stationary rig cannot measure reach, slows or
   knockback; a kiting rig cannot see a shove lock on slow enemies. Ask which question the rig was
   built for and whether that is the question being answered.
3. **Which chapters actually offer this weapon, and what branch does each take?** Behaviour forks on
   `CHAPTERS[id].lane`. A function read top-to-bottom describes behaviour that may never happen in
   the one chapter that offers the card.
4. **Is every mod wired, and is the copy legible?** `node test/sim-test.js modbudget` answers the
   first. For the second: does each card name the bar it reads in the words on the HUD, and has it
   coined a noun the player has never seen?
5. **Walk phase 4's checklist against the diff.** Every entry fails silently; the reviewer's job is
   to find the one that was ticked without being done.

Bring its findings back and either fix them or say, in the report, which you are knowingly shipping
past. Do not take a subagent's verdict at face value — it is a challenge, not a verdict.

## Phase 5 — ship it gated, then he plays

Ship to the live URL behind the WIP/dev gate so he can reach it on his phone.

```bash
npm run ship "<one plain sentence about what changed and why>"
scripts/deploy-watch.sh "vX.Y.Z · <sha>"     # ship prints the exact line
```

Never choose a version number. Write reasoning on the commits *below* the release — `ship` amends
HEAD with `-m` and destroys any body on that commit.

Then hand him **the exact card name and how to summon it**: seven taps on the **TITLE wordmark**
(within 1s of each other) turn DEV on and the pill appears; then **one tap on the HUD coin badge**
mid-run opens the card list, which contains every card the game can produce and ignores every
eligibility rule — chapter pool, minLevel, an anomaly's `when` gate, dedup. That is how he tests one
specific card on a phone against the live URL.

The badge has **no gesture of its own**, deliberately: `meta.dev` is the single dev switch, and
`endRun` (main.js) refuses to submit any run played under it to the leaderboard. If you ever give
the badge its own tap burst back, you have re-created the bug where a dev run reached the public
board — run LB asserts the gate.

Report: what it does, what the census said, what you did **not** verify, and the card name.

## What this skill does not cover

A weapon that needs a new chapter, a new enemy behaviour flag, or a new signature mechanic is a
bigger change than this — brainstorm it as a chapter, then come back here for the weapon.
