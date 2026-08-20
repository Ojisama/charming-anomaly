---
name: verifying-chapter-stage
description: Use when asked how far along a Charming Anomaly chapter is, whether it is ready to move on, ready to drop its wipFrom gate, or done — and whenever the owner says "is <chapter> finished", "what's left on <chapter>", "can I publish <chapter>", "is this ready", "how far is the reef", "what stage is it at", or names a stage (IDEATING, BUILDING, POLISHING, BALANCING, PLAYTESTING, PUBLISHED). Also use before advancing a chapter past any of those stages, and before claiming a chapter is done.
---

# Verifying a chapter's dev stage

A chapter is at exactly one of six stages. **You do not ask what stage it is at — you audit the
repo and report what the evidence says.** Nothing in the codebase stores a chapter's stage, and
that is deliberate: a stored label is one more fact authored in two places, which CLAUDE.md's
architecture audit names as the single largest root-cause class in this project. The evidence
*is* the stage.

```bash
node scripts/chapter-stage.mjs           # every chapter, one line each, plus the debt list
node scripts/chapter-stage.mjs reef      # one chapter, the full ladder
```

## The ladder is strict

| Stage | It has… | Proven by |
|---|---|---|
| **IDEATING** | an idea, maybe a spec in `docs/superpowers/` | no `CHAPTERS[id]` entry yet |
| **BUILDING** | an idea that meets the bar, wired, and running | **≥4 weapons in the pool, ≥4 mods on every one of them, ≥1 anomaly of its own, ≥1 mutator of its own**; then roster + starter resolve, every flag read by sim.js, signature not inert, a 60s headless run kills things without throwing |
| **POLISHING** | its own look and its own French, **both signed off by the owner** | `run RA` (roster art + cast thumbs); every chapter-native string in `fr.js`; a `bgColor` not borrowed; **then his review of every fr translation, and his verification of every asset and animation** |
| **BALANCING** | numbers that are its own and were measured | a `balance` block that is not a clone; ≥5 sim-test references to the id |
| **PLAYTESTING** | the owner's hands on a phone | **nothing in the repo. Ask him.** |
| **PUBLISHED** | real players | reachable: in a book, past `wipFrom` |

**A failed rung makes every rung above it "not reached", however finished the chapter looks.**
The Reef has finished art, finished French and a tuned balance block, and still reports IDEATING —
its pool is three weapons and it owns neither an anomaly nor a mutator. Do not report the highest
rung that passes; report the lowest that fails. The sweep's one-liner names only the FIRST bar a
chapter trips, so a chapter owing three of the four still reads as one line — run it with an id to
see the whole bill.

## Three gates are the owner's, not yours

The script cannot prove any of these, and it says so rather than guessing:

1. **Every fr translation reviewed** (POLISHING). A key existing in `fr.js` proves a translation
   exists, never that it is *right*. French copy is his call — never a subagent's, never yours.
2. **Every asset and animation verified** (POLISHING). No script tells a finished animation from
   a placeholder that happens to render.
3. **Playtested** (PLAYTESTING). Hands on a phone.

For a **live** chapter all three are taken as passed — publication is the proof, since nothing
reaches a player without going through him. For anything still behind `wipFrom` they are PENDING,
printed as `YOU`, and they cap the reported stage. The printout deliberately carries on past a
pending owner gate so you can still see whether the mechanical work above it is done: a chapter
can read `BUILDING` with green POLISHING and BALANCING rows underneath, meaning *everything
mechanical is finished and it is sitting on your desk*.

**Say that, not "ready to publish."** When the only thing missing is one of these three, the
correct report is *"mechanically done through BALANCING — waiting on your fr review and assets
check"*. Never infer a sign-off from a chapter looking finished.

## The ideation bar gates WIP only

The ≥4 weapons / ≥4 mods / ≥1 unique anomaly / ≥1 unique mutator bar (owner, 2026-08-20) postdates
most of the game. Applied retroactively it demotes all 15 chapters to IDEATING and the stage column
stops meaning anything, so **a live chapter records the same shortfall as DEBT** — printed under
the sweep, never gating. Nine shipped chapters sit below it today. That list is the backlog, not a
set of bugs.

**Unique means unique for the mutator, and only for it.** A mutator naming six chapters —
`springtide` across Undertow — is the BOOK's, and none of the six may count it as its own. The
anomaly gate is the looser one: it accepts any anomaly scoped to the chapter, shared or not,
because only one chapter-scoped anomaly exists in the whole game to be shared.

## Polish before balance, always

Art moves hitboxes, reach and readability. Balancing first means balancing twice. This matches
`design-a-weapon`'s own phase order (idea → look → numbers) and the standing rule that geometry is
settled before any balance number is trusted.

There is a second reason, and it is the one that bites: **you cannot tell "this enemy is too
strong" from "this enemy has no visual tell" until it is drawn.** CLAUDE.md's frozen-enemies bug
shipped to the live URL looking exactly like a balance problem — cold "did nothing" — when the
status was working perfectly and simply had no consumer in `render.js`. Balance numbers taken
against an unpolished chapter measure the missing tell, not the mechanic.

## What the script cannot see — check these by hand

It proves wiring and coverage. It has no eyes and no phone.

**Before handing POLISHING to him for sign-off**, load `game-art-and-copy` and `probing-the-game`:
- **Shoot the chapter, don't read it.** Never claim how something looks without a frame. Shoot
  every state, and judge any layout question in MAP MODE — a gameplay shot shows one city block.
- **Sweep the chapter-agnostic FX.** Dust, rings and blotches are authored against the biomes that
  existed when they were written and are routinely wrong on a new floor, especially a pale one. A
  chapter can pass every mechanical check and still wear another chapter's weather.
- **Shoot the FRENCH panel, not just the dictionary.** The script checks that the strings it knows
  about resolve. It cannot invent a surface a string has never appeared on — three creature names
  sat untranslated for the project's whole life because no screen had ever shown them, and were
  found by looking. A new screen can CREATE an i18n gap, not only reveal one.
- **Contrast**: `node scripts/obstacle-contrast.mjs` for the biome's obstacle footprints.

**Before calling BALANCING done**, load `probing-the-game`:
- `node scripts/weapon-census.mjs --chapter <id> …` for what the native weapons actually do.
- Run a **movement axis** (still / amble / kite), not kite alone — the kiting rig hides shove locks.
- **A probe needs a do-nothing control.** What the signature *prevents* needs a feature-removed run
  to measure at all.
- Never estimate what the harness can measure. Every guess in this repo's history was off 3–6×.

## Reporting the answer

State the stage, the one thing blocking the next rung, and nothing else. If the audit disagrees
with what the owner said, say so plainly and show the failing line — that disagreement is the
entire value of the audit.

## Traps this skill exists to prevent

Every one of these produced a WRONG stage on a real chapter while the script was being built.

- **The signature `type` string is not the wiring.** sim.js branches on `sig.type === 'currents'`
  for some chapters and reads the payload key (`signature?.maws`, `sig?.pockets`) for others.
  Checking only the type string reports The Reef and The Deep as unbuilt ideas.
- **The consumer may live in config.js.** `refillSpec` — the one function answering "where does
  this chapter's food come from" — is a pure helper exported from `config.js`, not sim.js.
- **`CHAPTERS.reef.signature.pockets` is not a consumer.** config.js names its own fields in
  self-check tables. A real consumer takes the signature as a parameter and never hardcodes an id,
  so a search counting hardcoded references stays green after you delete the only real read.
  `CHAPTERS[run.chapter].signature?.maws` *is* generic and must survive that filter.
- **Strip comments before searching for wiring.** Every id here is discussed in prose right beside
  its wiring, so a raw substring search is satisfied by the comment alone: delete the code, keep
  the sentence, and the check passes over a dead feature. This is run MB.a's lesson.
- **`starter` is an array on The Blank**, which hands you the whole arsenal. Treating it as a
  string reports a shipped chapter as unbuilt.
- **A missing `balance` block is not always unbalanced.** The Beyond ships with none on purpose —
  raw defaults are what make the last chapter the hardest. The real tell is a block *byte-identical
  to another chapter's*, i.e. copy-pasted and never touched.
- **`hidden` does not mean unreleased.** It means *outside the ladder*. The Blank is Book 1's
  off-ladder boss chapter and is fully shipped. Only `wipFrom` hides a chapter from players.
- **`balance_decision` comments are advisory, never a gate.** Half the shipped chapters have none;
  gating on them measures the comment convention's age, not the chapter's state.
- **`CHAPTER_ORDER` is Book 1 only.** Any sweep over "every chapter" must use
  `Object.keys(CHAPTERS)` — 15 ids, not 7 — and print its denominator.

## Changing the script

Every gate is mutation-proven by `mutations.sh` in this directory: break the thing a gate watches,
and the audited stage must drop. Run it after any edit.

```bash
bash .claude/skills/verifying-chapter-stage/mutations.sh
```

`scripts/` is **not** in the sim-test import graph, so `npm test` gives a change here exactly zero
coverage — it will pass whatever you did. The script and this table are the only checks.

**A mutation must cross the threshold it is testing, and must delete every reader.** Both rules
were learned by writing mutations that quietly proved nothing: cutting one mod off a seven-mod
weapon still leaves six, and deleting `.maws` from `refillSpec` leaves two more readers in sim.js,
so the signature is still genuinely wired and a passing audit is the *correct* answer. A mutation
that fails to bite looks identical to a gate that does not work — check which one you have before
you "fix" the script.

Add a gate only where a real chapter could sit at the wrong stage without it, and prove it by
watching a chapter move. A gate that never fires is a green light with no bulb.
