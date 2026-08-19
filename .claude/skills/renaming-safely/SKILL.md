---
name: renaming-safely
description: Use before renaming ANYTHING in Charming Anomaly that already exists — an id, a field, a weapon or creature display name, a constant, an event type — and before naming a NEW mechanic. Carries the three sweep failure modes a green test suite cannot see, including the one where the name you rename TO silently overwrites shipped code. Triggers on "rename", "call it", "new name", "naming this", "change the id".
---

# Renaming safely

A rename in this repo has three distinct silent failure modes, and only one of them is ever a test
failure. Read all three before the first replacement — and grep the candidate name as an IDENTIFIER
before you write a single line of a new mechanic.

- **GREP THE NAME BEFORE YOU WRITE THE MECHANIC, and grep it as an IDENTIFIER, not as a word.**
  Naming The Surf's button cost two full renames because every obvious word was already spoken for:
  `wave` is three unrelated things (`WAVE_TABLE` the spawn schedule, `WEAPONS.wave`, `WAVE_ECHO_*`
  its mod), `swell` is two (a Breaker mod whose display name is `Swell`, and the `render.swell`
  water field that render.js's `updateSwell` draws), and `surge`, `riptide`, `backwash`, `breaker`,
  `crest` and `undertow` are all taken as well. A `stepSwell` sitting beside an `updateSwell` doing
  something unrelated is the same one-fact-two-places trap this file is built around, wearing a
  different hat. One `grep -rn "<candidate>" src/` before the first line of code is the whole fix.

- **A RENAME SWEEP HAS TWO SILENT FAILURE MODES, and only one of them is a test failure.** Renaming
  `sewerGeyser` → `burstHydrant` and `tesseractBeam` → `pulsarSweep` in v7.10 hit both:
  - **Field names also exist as quoted STRINGS**, which an identifier sweep cannot see. `run.geysers`
    was renamed everywhere except `LISTS = [… 'geysers' …]` in test/sim-test.js's every-weapon IPECAC
    block, and the doc block in state.js indexes fields the same way. The suite caught this one, but
    only because that assertion happened to enumerate the array by name.
  - **A DISPLAY-name sweep over-matches user-facing copy.** `leaf blade` → `boomerang leaf` also
    rewrote the boomerang's five mod descriptions, shipping `'boomerang leaf(s) per throw'` — which
    is not English, and which every test passes happily. Nothing catches this but reading it.

- **A RENAME SWEEP CAN CLOBBER A PRE-EXISTING IDENTIFIER YOU DID NOT KNOW ABOUT — the failure mode
  the two below do not cover, because here the name you are renaming *to* is the collision.**
  Renaming a brand-new `waveG` to `swellG` silently overwrote the SHIPPED `swellG` (updateSwell's
  Graphics), and the only symptom was `Identifier "swellG" has already been declared` from esbuild —
  which reads as a typo in your own new code, not as "you just renamed someone else's". `npm test`
  cannot see it: render.js is unimportable, and the file did not parse at all. Two rules:
  - **Assert the count you expect for every replacement, and DO NOT WRITE THE FILE when it misses.**
    A harness that logs a mismatch and writes anyway (mine did) leaves the tree half-renamed, which
    is strictly harder to reason about than either end state.
  - **Repair against `git show HEAD:<file>`, never against memory.** The first repair guessed the
    original name was `waveG`, which built cleanly and was wrong — it had quietly renamed shipped
    code. `git show HEAD:src/render.js` is the authority; diff the token COUNTS against it and
    require they match before believing the tree is clean.
  The check that finds both, run after the sweep and before the commit:
  `git diff -U0 src/config.js | grep -E "name: '|desc: '"` — every user-facing string the rename
  touched, in one screen — plus a grep for the OLD token in quotes. Also leave verbatim quotations
  alone: the sweep rewrote a playtest quote (`"leaf blade doesn't look like a leaf"`) into words
  nobody said.
