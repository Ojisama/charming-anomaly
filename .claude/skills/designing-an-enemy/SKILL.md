---
name: designing-an-enemy
description: Use when adding or reworking anything in Charming Anomaly that fights the player — a roster enemy, an elite affix, a scripted wave creature, a boss, or a hazard/trap. Triggers on "new enemy", "add a creature", "design a monster", "make it harder", "this enemy feels wrong", "add a trap/hazard", and on how the owner actually phrases it mid-playtest — "diminish tank amount", "make the telegraph more subtle", "it one-shots me", "no <mechanic> in this chapter", "let's move this idea to an enemy", "reduce <creature> size by X% and increase enemy size by Y%", or any change to what a creature does, telegraphs, or looks like.
---

# Designing an enemy

Three phases. **Each one ends by presenting to the owner and WAITING for his answer.** He chose
hard gates on all three: he will not review a look for a creature whose concept he'd have changed,
and he will not review numbers for a look he hasn't picked.

| Phase | You produce | You must NOT yet |
|---|---|---|
| 1 · FEEL | what fighting it is LIKE, and the choice he has to make | name a field or pick a number |
| 2 · LOOK | 3–4 labelled bakes on ONE identical in-game frame, then a GIF of the winner moving | tune stats |
| 3 · NUMBERS | measured stats, with the spread | ship before he has seen them |

**Red flag: you have typed `hpMul:` and he has not approved a concept.** Go back to phase 1.
A baseline run of this task locked hp, speed and radius in step 1 of 12 and asked for sign-off in
step 11 — every number chosen before the idea was agreed and before any art existed.

## Phase 1 — feel

In prose, before opening config.js:

- What does the player **do differently** because this thing exists? If the answer is "takes more
  damage", it is a stat change, not a new creature.
- **Which archetype** — `normal`/`fast`/`tank` map to `drone`/`wisp`/`tank` (`ARCHETYPE_TYPE`).
  This is a hard constraint, not a label: `WAVE_TABLE` gates `wisp` to t≥40s and **`tank` to
  t≥140s**, so a tank cannot appear in any probe shorter than that.
- **Does an existing flag already do it?** Flags are chapter-agnostic and shared — `weave`,
  `latch`, `split`, `dashBurst`, `diveBomb`, `pounce`, `phase`, `unshakeable`… Reusing one costs
  nothing. Inventing a movement machine is a materially bigger job with its own risk.
- **For a hazard/trap: reuse an existing family** — `run.pools`, `run.bombs`, `run.strips`. The
  Shelf's own doc block records that it "reuses two existing generic entities rather than adding
  new run arrays". A new `run.*` array needs a stated reason.

Present **the choice he has**, not your pick. "Scuttles sideways" is either `lean: 0` + the
existing `weave` (free) or genuine strafing (new sim code) — that is his call, and the baseline
buried it at the bottom under "unsure" after already designing around the cheap answer.

## Phase 2 — look

- **Top-down plan view.** The only side-on creature in the game is the Moon Jelly, because a body
  in a water column has no floor to lie on. Ask explicitly: *is this the same viewpoint as the
  sprites around it?* A screenshot alone will not catch this — v6.8 shipped a side-elevation
  tornado that read fine as a drawing.
- **`lean` is a decision, not a number.** `0` = no forward axis, it would just tumble (redcell,
  shorecrab). `90` = bilaterally symmetric about the forward axis (krill, jelly). `30` = a
  distinct UP (tardigrade). Wrong value throws nothing; the body just never turns.
- Hand him **3–4 labelled bakes on one identical frame**, then a GIF of the winner moving. An
  enemy's read depends on how it moves.

## Phase 3 — numbers

**Precedent is not measurement.** "Matches gull's 1.15" is a starting point, never a justification.

**XP per point of health is not equal across archetypes — check where yours lands:**

| archetype | base hp | base xp | xp per hp |
|---|---|---|---|
| wisp (fast) | 10 | 1 | **0.100** |
| drone (normal) | 20 | 1 | 0.050 |
| tank | 90 | 4 | 0.044 |

A `fast` enemy already pays double a drone per point of health. Adding one raises a chapter's XP
rate more than the same health of drone would, and `xpMul` is the lever that corrects it —
independent of `hpMul` on purpose, so the two can move in opposite directions. Getting this wrong
is not hypothetical: split children inherited a full parent's XP on 45% of its health, which was
1.58× everything else in the game and front-loaded two chapters.

Roster fields: `{ id, archetype, name, hpMul, speedMul, xpMul, radiusMul, flags, weight, minT }`.
`weight` (default 1) splits the archetype's share — a second `fast` entry halves the incumbent's
spawns unless you set it. `minT` gates earliest spawn.

**Measurement protocol** — anything else is a guess:

- Headless probe against `sim.js`; seed `Math.random` with mulberry32; `createRun(meta, { chapter,
  difficulty })` takes an OPTIONS OBJECT and the meta must unlock the chapters.
- **≥6 seeds, print every one, read the SPREAD.** Two seeds lie: The Shelf's 300s level came back
  `[7, 11, 6, 11, 12, 11]`. Every 2-seed figure quoted while tuning that chapter sat inside that
  band.
- Changing any HP **re-phases the RNG**, so two arms are different builds, not one build with a
  knob turned. Never attribute a moved number without the spread.
- Run the full 300s whenever the answer involves tanks or late composition.

## Silent failures — none of these throw

| Miss | What you see instead |
|---|---|
| `ROSTER_LOOKS` entry in render.js | a generic archetype blob |
| `node scripts/bake-cast.mjs` after adding to `render.cast` | the thumbnail is skipped, the cast row just looks short |
| French for `roster.name` | run XX goes red — **but only for Book 1**: its walk is `CHAPTER_ORDER.concat(['blank'])`, so a Shelf or Surf creature escapes it entirely |
| new stat read in sim.js | a field in config that nothing reads — assert the spawned ENTITY, never the table |

## The adversarial pass — before shipping, without being asked

He asks for this by hand constantly (*"spawn an adversarial fable agent to challenge your
findings"*). Make it automatic. Dispatch **one** `general-purpose` subagent to REFUTE the work, and
give it this constraint verbatim, because a reviewer with no rules reaches for `git stash` and
reverts the change it was asked to review:

> You are reviewing UNCOMMITTED work. **Do not mutate the tree.** Allowed: `git diff`, `git show`,
> `git log`, file reads, running probes and the test suite. Forbidden: `git stash` in any form,
> `git reset`, `git checkout`, `git restore`, `git clean`, `git add`, `git commit`, and any edit.
> Default to "this is broken" when uncertain.

Aim it at the four things that actually go wrong with a creature:

1. **Can the rig see the claim?** A kiting probe cannot see a shove lock on slow enemies; a
   stationary one reports the same contact-hit count for every build. Which question was the rig
   built for?
2. **Was anything baked at spawn compared across runs?** `hp` and `dmg` are frozen through
   `hpScale`/`dmgScale` at spawn time — two runs that spawned at different clocks produce numbers
   that cannot be subtracted.
3. **Did the probe window reach the archetype, and is the spread shown?** `WAVE_TABLE` gates `tank`
   to t=140s, and two seeds lie — six seeds of one Shelf level came back `[7, 11, 6, 11, 12, 11]`.
4. **Walk the silent-failure table above against the diff**, and check the denominator: a sweep over
   `CHAPTER_ORDER` silently skips The Blank and all of Book 2.

Fix what it finds, or say in the report what you are knowingly shipping past.

## Ship

`npm run ship "<one plain sentence>"` — never pick the version. Then `scripts/deploy-watch.sh`.
Guard the tune by pinning **the arithmetic he asked for**, not the literal: `2.5 * 0.75`, so the
intent survives a later re-tune of the pre-change number.
