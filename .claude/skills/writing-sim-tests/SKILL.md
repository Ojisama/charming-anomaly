---
name: writing-sim-tests
description: Use before writing, widening or mutation-proofing a test/sim-test.js scenario in Charming Anomaly, before blaming your diff for a red band, and before quoting a perf win or claiming a change is behaviour-neutral. Carries the scratch-tree extraction rule, the red-band protocol, the distinct-mutation rule and the profiler-vs-A/B trap.
---

# Writing and proving sim-tests

## A scratch tree must be the WHOLE tree

**THOSE SOURCE-TEXT SCENARIOS READ FILES OUTSIDE `src/` AND `test/`** — `index.html`, `public/sw.js`, `vite.config.js`. So a scratch copy made for mutation-proofing with `cp -r src test <tmp>` is not a runnable suite: it dies partway with a missing-file throw, which the top-level `try` turns into one `FAIL:` line and `process.exit(1)`. A harness looping over mutations reads that as "caught" and a timing harness prints a total for a run that stopped partway. Extract with `git archive HEAD | tar -x -C <tmp>` (the WHOLE tree, not `HEAD src`), and make the harness require a `ALL TESTS PASSED` line on its baseline before it believes anything after it.

## Mutate a scratch copy, never the working tree

Mutation-proofing an assertion means editing `sim.js`, and `git checkout src/sim.js` to undo it
silently discards any real edit you already had in that file (v7.7 lost a comment fix this way and
only caught it from `git status`). Either extract a throwaway tree (`git archive <ref> | tar -x -C
<tmp>`) and mutate there, or re-read `git status --short` after every revert.

**Every mutation must be DISTINCT as well as applied.** A harness that skips on a missing anchor
still cannot see two entries whose `from`/`to` are the same edit under different labels — that is
a passing check that checks nothing, and it inflates the count you then quote as proof. v7.62
shipped a four-mutation table where two entries both just deleted the `flushSpawns(run)` line, one
of them captioned "the flush moves to the BOTTOM"; it was caught by re-reading the harness, not by
running it. Diff the entries, and prefer a mutation that expresses the pathology (move the call)
over one that merely removes the code.

## A red band is not proof your change caused it

**Several bands are eyeballed literals under 3σ.** The suite seeds `Math.random` once per scenario,
so ANY change that alters how many randoms get drawn re-phases the whole stream and re-rolls every
sampled statistic. Two bands were measured sitting at 2.6–2.8σ: the anomaly slot-uniformity check
(±0.06 on ~400 anomaly pools, where 1σ = 2.2pts) and `mod > 24` in the partial-arsenal fixtures.
v7.7 moved five bucket weights and drew a false red on the first — slot 2 of 4 at 31.6% — for a
placement that is `Math.floor(random * cards.length)` and cannot read `BUCKET_WEIGHTS` at all.
**Protocol:** before attributing a red to your diff, ask whether the assertion's subject is even
reachable from what you changed, then re-run with a different seed. If it goes green, the band is
under-powered — fix it with a power calculation (state N, 1σ, and the size of the pathology it must
still catch), and mutation-prove the widened band still fails on that pathology. Do NOT retune your
change to satisfy a noisy test.

## A profiler tells you where time goes, never how much a fix saved

`--cpu-prof` does not tax uniformly: it weighs allocation heavily, so optimising away allocations
measures far better under the profiler than in reality. The separation rewrite read as 25% faster
comparing a profiled before against an unprofiled after, and was 6.4% with neither side
instrumented. Quote the A/B, not the profile. And when a change is meant to be behaviour-neutral,
PROVE it — extract the old tree (`git archive <ref> src | tar -x -C <tmp>`) and diff full end state
across several seeded runs, rather than inferring it from a green suite. Make the harness assert the
old tree really contains the old code: pointed at the wrong ref it compares HEAD against itself and
prints a screenful of reassuring IDENTICALs.
