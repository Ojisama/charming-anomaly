---
description: Start a feature the right way — check main has not moved, load the matching skill, agree the spec in plan mode before any code.
---

Start work on: **$ARGUMENTS**

This session is one feature. When it is done, `/wrap` closes it and the next one starts fresh —
do not carry this context into unrelated work.

Do these in order, and do not skip to code:

1. **Check `main` has not moved under you.** `git fetch && git log --oneline HEAD..origin/main`.
   Several sessions ship to this repo concurrently; a branch has already spent a whole task
   rewriting a function another session had deleted. If someone already did this differently,
   take theirs and say so.

2. **Load the skill that covers this**, if one does, and say which:
   - a weapon, weapon mod, or "this weapon feels wrong" → `design-a-weapon`
   - an enemy, elite affix, boss, hazard, telegraph, or difficulty complaint → `designing-an-enemy`
   - a bug with unclear cause → `superpowers:systematic-debugging`
   - a visual bug reported from a photo or screenshot → `screenshot-forensics`
   - a new chapter, mechanic, or anything genuinely open-ended → `superpowers:brainstorming`

3. **Agree the spec before writing code.** Enter plan mode and stay there until the shape is
   settled. Ask with `AskUserQuestion`, not as a prose list of open questions — a "needs your
   ruling" paragraph makes him re-type answers that could have been taps.

   For anything with a LOOK or a FEEL, the spec is not settled until it is unambiguous. Push for a
   number or a picture rather than an adjective: "the biggest screen dimension at a full bar, down
   to 10% of that linearly", "0.6s wind-up, committed at 0.3s", "50% of max HP" — not "smaller",
   "subtler", "more readable". Three round trips have been lost to a described visual that could
   have been one sentence or one photo.

4. **Only then implement.** Delegate read-only exploration to the `measure` agent or an `Explore`
   agent rather than grepping in this session — their context dies with them, this one does not.

Nothing here overrides CLAUDE.md; it sequences it.
