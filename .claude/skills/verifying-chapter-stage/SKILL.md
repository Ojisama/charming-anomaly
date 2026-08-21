---
name: verifying-chapter-stage
description: Use when asked how far along a Charming Anomaly chapter is, what is left on it, whether it is ready to move on, ready to drop its wipFrom gate, or done — and whenever the owner says "is <chapter> finished", "what's left on <chapter>", "can I publish <chapter>", "is this ready", "how far is the reef", "what stage is it at", or names a stage (IDEATING, BUILDING, POLISHING, BALANCING, PLAYTESTING, PUBLISHED). Also use before advancing a chapter, before dropping its wipFrom gate, and before claiming a chapter is done.
---

# What is left on a chapter

**You do not ask how far along a chapter is — you audit the repo and report what the evidence
says.** Nothing in the codebase stores a chapter's progress, and that is deliberate: a stored
label is one more fact authored in two places, which CLAUDE.md's architecture audit names as the
single largest root-cause class in this project. The evidence *is* the answer.

```bash
node scripts/chapter-stage.mjs           # every chapter, one row each, seven columns
node scripts/chapter-stage.mjs reef      # one chapter, the full bill + a greppable `axes:` line
```

## There is no stage word, and that is the point

This skill used to report one word per chapter — the lowest failing rung of a strict six-rung
ladder. It was removed on 2026-08-21 (owner) because it was wrong twice over:

- **It could only ever say three things.** Every un-published chapter trips a pending owner gate
  early and stops there, so no work-in-progress chapter could report POLISHING or BALANCING
  however finished it was. The reachable values were IDEATING, BUILDING and PUBLISHED. Reordering
  the rungs — which was tried — changed *not one chapter's reported stage*.
- **It flattened facts that are independent.** The Reef carries finished art, finished French, a
  tuned balance block and a shipped terrain field while its pool is still three weapons; the
  ladder called that "IDEATING". The Shelf shipped art, then balance, then a fourth weapon, then
  more balance. The work does not queue, so a report that pretends it does deletes information.

Report the **bill**, never a single word. If someone asks for a stage, give them the axes line and
the one or two things actually outstanding.

## The seven axes

Each is independent. Each has its own column and its own rows.

| Axis | Asks | Proven by |
|---|---|---|
| **ideation** | is the SHAPE of the idea complete | ≥4 weapons in the pool, ≥4 mods on every one, ≥1 anomaly of its own, ≥1 mutator of its own |
| **wiring** | does it exist, is it read, does it run | roster + starter resolve, every flag read by sim.js, signature not inert, a 60s headless run kills things without throwing |
| **played** | the owner's hands on a phone | **nothing in the repo. Ask him.** |
| **art** | can its creatures actually be drawn | a `ROSTER_LOOKS` entry for every roster and cast id, a `src/cast/<id>.png` per cast id, a `bgColor` not borrowed; **then his verification of every asset and animation** |
| **fr** | does it have its own copy, in French | every chapter-native string resolves in `fr.js`; **then his review of every translation** |
| **numbers** | are the numbers this chapter's own | a `balance` block that is not a byte-identical clone; ≥5 sim-test references to the id, comments excluded |
| **reachable** | can a player get to it at all | in a book, past `wipFrom` |

Cell vocabulary, the same in the table, the bill and the `axes:` line: `ok`, `FAIL` (the repo can
prove it), `YOU` (waiting on an owner gate), `owesN` / `debtN` (ideation), `live` / `wip`.

**`numbers` cannot tell you a number was MEASURED.** Nothing in the repo can — a tuned-looking
block is a block somebody typed. That is what the probes below are for, and why
`balance_decision` comments print as advisory rather than as a gate.

## Three gates are the owner's, not yours

The script cannot prove any of these, and it says so rather than guessing:

1. **Played** (`played`). Hands on a phone.
2. **Every fr translation reviewed** (`fr`). A key existing in `fr.js` proves a translation
   exists, never that it is *right*. French copy is his call — never a subagent's, never yours.
3. **Every asset and animation verified** (`art`). No script tells a finished animation from a
   placeholder that happens to render.

For a **live** chapter all three are taken as passed — publication is the proof, since nothing
reaches a player without going through him. For anything still behind `wipFrom` they print as
`YOU`, and they are the *only* thing standing between several Undertow chapters and done.

**Never infer a sign-off from a chapter looking finished.** When the mechanical columns are green
and only these are outstanding, the correct report is *"mechanically done — waiting on your
playtest, your fr review and your assets check"*, not "ready to publish".

## The ideation bar is a backlog, not a verdict

The ≥4 weapons / ≥4 mods / ≥1 unique anomaly / ≥1 unique mutator bar (owner, 2026-08-20) postdates
most of the game: **9 of the 15 shipped chapters sit under it**, The Body included. A live
chapter therefore records the shortfall as `debtN` rather than as a failure, and nothing is gated
on it either way. That column is the list of what to go back and enrich — it is not a set of bugs,
and a chapter does not become good by clearing it.

**Unique means unique for the mutator, and only for it.** A mutator naming six chapters —
`springtide` across Undertow — is the BOOK's, and none of the six may count it as its own. The
anomaly bar is the looser one: it accepts any anomaly scoped to the chapter, shared or not,
because only one chapter-scoped anomaly exists in the whole game to be shared.

## Play it before you dress it

The one piece of sequencing that survived the ladder, because it is about *spending*, not about
proving: **a chapter that runs at all goes to him on a phone before art and tuning are paid for**
(owner, 2026-08-21). If it is not fun as a wired grey box, everything spent dressing it is spent
on the wrong chapter. This project ranks designs on fun, never on build cost.

Known limit of that: an undressed chapter can feel wrong for reasons that are not the design's,
because a missing visual tell reads exactly like a broken mechanic — CLAUDE.md's frozen-enemies
bug shipped looking like a balance problem when the status worked and simply had no consumer in
`render.js`. So judge the SHAPE on that first play (does the signature give you something to do,
does the roster pressure you) and play it again once it is dressed.

**`art` and `numbers` do not queue behind each other.** Balance here is measured with headless
probes that have no eyes at all; art needs no numbers. Run them in whichever order the work
arrives in.

## What the script cannot see — check these by hand

It proves wiring and coverage. It has no eyes and no phone.

**Before handing `art` or `fr` to him for sign-off**, load `game-art-and-copy` and
`probing-the-game`:
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

**Before calling `numbers` done**, load `probing-the-game`:
- `node scripts/weapon-census.mjs --chapter <id> …` for what the native weapons actually do.
- Run a **movement axis** (still / amble / kite), not kite alone — the kiting rig hides shove locks.
- **A probe needs a do-nothing control.** What the signature *prevents* needs a feature-removed run
  to measure at all.
- Never estimate what the harness can measure. Every guess in this repo's history was off 3–6×.

## Reporting the answer

Give the `axes:` line and then the outstanding items, most actionable first. Nothing else. If the
audit disagrees with what the owner said, say so plainly and show the failing row — that
disagreement is the entire value of the audit.

Do not manufacture a stage word to answer a question phrased with one. "The Shelf is mechanically
done; waiting on your playtest, fr review and assets check" is the answer to "what stage is The
Shelf at".

## Traps this skill exists to prevent

Every one of these produced a WRONG answer on a real chapter while the script was being built.

- **A gate can pass on the comment beside the code.** The sim-test reference count ran over the raw
  suite for its whole life: `'reef'` appears 20 times and 3 of those are prose. Every search here
  decomments first; keep it that way. This is run MB.a's lesson.
- **A COMMENT STRIPPER IS A SECOND PARSER, AND GETTING IT WRONG DELETES CODE SILENTLY.** Stripping
  block comments before line comments means `src/cast/*.png` written inside a `//` comment opens a
  block that runs to the next `*/` thousands of lines away. That ate 64% of `test/sim-test.js` —
  two openers, 7685 and 3134 lines — and reported The Skies, The Trawl and The Deep as shipped
  chapters with no test coverage, which is a plausible-sounding lie that shipped as v7.187 and was
  caught by grepping for `'skies'` by hand. Line comments first, then blocks. And a `/*` inside a
  STRING (`import.meta.glob('./props/*.png')`) survives any ordering, so quoted strings are masked
  before either pass — M13 proves it, by hiding The Shelf's whole signature behind one glob.
  **The same trap is live in five places in `test/sim-test.js`** (lines 5136, 6977, 21618, 21818,
  24712), all block-first. `codeOnly` over `render.js` keeps 22% of the file and cannot see
  `ROSTER_LOOKS` or `drawJelly` at all. Those lints are in the ship gate and are asserting over a
  hole; fixing them is its own job.
- **A gate can be blind to its own subject.** The `art` axis used to be
  `TESTS.includes('run RA (roster art)')` — a string existing in a file, byte-identical for all 15
  chapters, which never looked at the chapter being audited and never ran the assertion it was
  named after. It now parses `ROSTER_LOOKS` the way run RA parses it and asks about *this* roster.
  Before trusting any gate, ask what edit to THIS chapter could make it fail.
- **The signature `type` string is not the wiring.** sim.js branches on `sig.type === 'currents'`
  for some chapters and reads the payload key (`signature?.maws`, `sig?.pockets`) for others.
  Checking only the type string reports The Reef and The Deep as unbuilt ideas.
- **The consumer may live in config.js.** `refillSpec` — the one function answering "where does
  this chapter's food come from" — is a pure helper exported from `config.js`, not sim.js.
- **`CHAPTERS.reef.signature.pockets` is not a consumer.** config.js names its own fields in
  self-check tables. A real consumer takes the signature as a parameter and never hardcodes an id,
  so a search counting hardcoded references stays green after you delete the only real read.
  `CHAPTERS[run.chapter].signature?.maws` *is* generic and must survive that filter.
- **`starter` is an array on The Blank**, which hands you the whole arsenal. Treating it as a
  string reports a shipped chapter as unbuilt.
- **A missing `balance` block is not always unbalanced.** The Beyond ships with none on purpose —
  raw defaults are what make the last chapter the hardest. The real tell is a block *byte-identical
  to another chapter's*, i.e. copy-pasted and never touched.
- **`hidden` does not mean unreleased.** It means *outside the ladder of its book*. The Blank is
  Book 1's off-ladder boss chapter and is fully shipped. Only `wipFrom` hides a chapter from
  players.
- **`balance_decision` comments are advisory, never a gate.** Half the shipped chapters have none;
  gating on them measures the comment convention's age, not the chapter's state.
- **`CHAPTER_ORDER` is Book 1 only.** Any sweep over "every chapter" must use
  `Object.keys(CHAPTERS)` — 15 ids, not 7 — and print its denominator.

## Changing the script

Every gate is mutation-proven by `mutations.sh` in this directory: break the thing a gate watches,
and **its own axis** must move. Run it after any edit.

```bash
bash .claude/skills/verifying-chapter-stage/mutations.sh
```

The harness reads the one greppable line the single-chapter audit prints (`axes: ideation=ok
wiring=ok …`), and each mutation names the axis it expects to move. That naming is load-bearing:
the previous harness compared one word per chapter, so a mutation that broke the wrong thing still
moved that word and still read as a pass — every gate proved only "something, somewhere, noticed".

`scripts/` is **not** in the sim-test import graph, so `npm test` gives a change here exactly zero
coverage — it will pass whatever you did. The script and this harness are the only checks.

**A mutation must cross the threshold it is testing, and must delete every reader.** Both rules
were learned by writing mutations that quietly proved nothing: cutting one mod off a seven-mod
weapon still leaves six, and deleting `.maws` from `refillSpec` leaves two more readers in sim.js,
so the signature is still genuinely wired and a passing audit is the *correct* answer. A mutation
that fails to bite looks identical to a gate that does not work — check which one you have before
you "fix" the script.

Add a gate only where a real chapter could sit at the wrong answer without it, and prove it by
watching an axis move. A gate that never fires is a green light with no bulb.
