---
name: crucible
description: Builds a NEW feature (no reference to copy) by looping implementer agents against separate harsh grader agents until a bar agreed with the user is met — the common base is built once, then each taste axis (visuals, balance/feel, copy…) is explored and refined on its own files, then merged. For games (gameplay, feel), visuals (sprites, sites), UX, business logic, code. Triggers on "/crucible", "/creuset", "crucible", "creuset", "passe ça au creuset", "loop until it meets the bar", "fais-le évaluer en boucle".
---

# Crucible (creuset)

You are the ORCHESTRATOR. You never implement the feature yourself. You set the bar with the user, build the test bench, split the work into a scaffold and axes, spawn implementers and graders, and keep the books. Spec and rationale: `docs/DESIGN.md`. Speak the user's language.

`C` below means `python3 .claude/skills/crucible/crucible.py`, always run from the project repo root (`C --help` lists commands).

**The rule that drives everything: no code is ever written twice.** The common base (structure, wiring, mechanics, copy plumbing) is built ONCE, by one implementer. Parallel or best-of-N work happens only on an axis where taste decides, and each such agent may only touch that axis's files. Never ask N agents to build the whole feature.

**Background sessions:** file tools may refuse to write in the main checkout. Write run-dir files (`<run>/…`, bench, criteria, RUN.md) with Bash heredocs; they are crucible scratch, not project code.

## Phase 0 — settings

Ask in ONE AskUserQuestion call (defaults first, marked Recommended):
1. Present for calibration? (no / yes) — calibration happens after the first round of each taste axis.
2. Max parallel subagents (3 / 2 / 5) — hard cap on implementers + graders running at once.
3. Exploration width per taste axis (3 / 2 / 1) — ≤ cap.
4. Max rounds, whole run (8 / 5 / 12).

State the cost estimate: scaffold ≈ 300-600k tokens per round, each explored axis round ≈ width × 150-300k.
`git status --short`: list uncommitted changes (worktrees start from HEAD and will not contain them) and ask: commit first, or proceed without. If the branch is behind upstream (`git status -sb`), say so; never pull yourself.
Pick a slug (`book3`), run `C init <slug>`. One run = one slug; if it exists, pick another (a parallel run may be live) or resume. `init` tags HEAD as `crucible/<slug>/base`. This run owns ports `port`…`port+9` (state.json). Every worktree running at the same time gets its own slot: `C port <slug> <name> [slot]` (base 0, `*-a..e` 1-5, x 6, best 7, merge 8, scaffold 9; pass an explicit free slot otherwise). Never use another port.

## Phase 1 — the feature

Let the user describe it. Read the project's CLAUDE.md and the design docs it points to. If WHAT to build is still open (a whole book, a new mode), run a short design pass with the user first (concept options, pick one). Restate the feature in one paragraph; get a yes.

## Phase 2 — the bar and the split

Draft criteria. Ask only: "what would make you reject it?" and "which reference looks right?" (get the actual files/URLs).
Then split the work, and write both into `<run>/criteria.json`:

```json
{"feature": "one paragraph", "contested": [],
 "axes": {
   "scaffold": {"paths": ["*"]},
   "visual":   {"paths": ["src/render/*", "assets/*"], "after": "scaffold", "explore": true},
   "balance":  {"paths": ["src/chapters/burrow-balance.js"], "after": "scaffold"}},
 "criteria": [
  {"id": "c1", "axis": "scaffold", "type": "check", "text": "...", "verify": "node test/crucible-c1.test.js", "timeout": 900, "runs": 1},
  {"id": "c2", "axis": "visual", "type": "rubric", "text": "<one observable yes/no question>", "verify": "<inputs + probe>"},
  {"id": "k1", "axis": "visual", "type": "compare", "text": "<taste dimension>", "anchors": ["<path>"], "anti_anchors": []}]}
```

- **scaffold** = everything that must exist for the feature to run at all: data, registration, mechanics, UI wiring, placeholder art/numbers. Its criteria are the technical `check`s.
- **Axes** = the parts where several good answers exist and taste decides (visuals, balance/feel, copy, level layout…). `explore: true` only where trying different directions is worth it; otherwise one implementer refines.
- Every axis lists the files it may touch (`paths`, globs). Decide them by reading the scaffold's layout; if the project mixes art and numbers in one file, make the scaffold split them first (that is scaffold work).
- **Conflicting axes run one after the other.** Run `C overlap <slug>`: every pair it prints touches the same files. Also treat as conflicting two axes whose criteria depend on each other (feel judged on numbers the balance axis is changing). For each conflict: **warn the user** in one line ("visual and feel both touch render.js → feel runs after visual"), then set `"after"` so they run sequentially. Never run conflicting axes in parallel and never re-implement one axis inside another.
- ≤ 8 must (`check` + `rubric`) in total, plus 1-2 `compare`. Rewrite wishes into observables; pure taste becomes a `compare`.
- A `check` calls bench-owned files directly — never `npm test` or a project script the implementer can rewrite. Seeded deterministic checks set `"runs": 1` (default 3, for flaky ones).
- Show the user one table: axis · files · criteria · explored? · runs after. They correct; freeze.

## Phase 2.5 — the bench (yours)

`<run>/bench/` is an overlay of repo-relative paths (`bench/test/x.test.js` lands at `test/x.test.js`): tests, a run script honouring `$PORT` in **strict** mode (`vite --port $PORT --strictPort`), state probes (send inputs, read real state), a render harness for visuals. **Reuse the project's tooling first** (test runner, browser rig, debug hooks, headless sim, probe scripts, project skills). `C worktree` copies the bench into every worktree; `C tag` keeps bench files out of snapshots.
Validate on base: `C worktree <slug> base base`, `C check <slug> base`: every check must FAIL, for the right reason (read `<run>/logs/`). Where a similar existing feature exists, also run the probes on it as a positive control (they must measure something real).

## Phase 2.9 — dry run, then RUN.md

On `base`: install deps, start the run script on `$(C port <slug> base)` and confirm it fails if that port is taken, call one probe, take one screenshot, `C check`, `C gallery`, publish the gallery. Check free space in `/tmp` (`df -h /tmp`): browser probes can leave large profile dirs; agents must delete the scratch they create. Anything that asks permission or fails: fix now. If the user is leaving and the dry run is not clean, say so and do not start.
Write `<run>/RUN.md` (≤ 45 lines, never edited after): slug, feature, settings, axes table with order, ports/slots, commands, Artifact URL, bench paths, and this procedure verbatim:

```
STAGES: A scaffold (1 implementer) -> B axes (independent ones in parallel, conflicting ones in sequence, each from the previous best) -> C merge.
ROUND PROCEDURE for one axis (re-read RUN.md + state.json first)
1. Inbox: user messages? <run>/STOP? Apply / stop. C free-ports <slug> (only slots no live agent uses).
2. Worktrees from the axis parent (scaffold: base; an axis: crucible tag of what it runs after; exploit: its best):
   explore round -> C worktree <slug> <axis>-r<n>-<a..> <parent> each; refine round -> <axis>-x from best + <axis>-best.
   Spawn implementers (Agent tool, no isolation) with implementer.md; allowed_paths = the axis paths; ≤ cap.
   --- steps 3-8 once PER VERSION ---
3. Return: C scope <slug> <name> <axis> (outside paths -> reject the version, feedback). Then C tag. FLAGS -> pending_questions.
4. C check <slug> <name>: ALL checks (scaffold ones guard against regressions) -> record.
5. Graders on the axis criteria only (≤ 5 each). Refine rounds: same grader grades candidate AND best, same variants.
6. C record verdict files (never compare output). Compare: two runs X/Y swapped, disagreement = tie, result in the log.
7. C better <slug> <cand> <best>: yes -> new best; tie -> compare decides; still tie -> keep best.
8. Copy one screenshot to <run>/shots/<version>.png.
   --- steps 9-10 ONCE PER ROUND ---
9. C round-end <slug> <best> "<3-line log>" <axis>  -> axis bar_met / plateau; total round budget.
10. C gallery <slug>, republish Artifact. Every FLAG about a criterion gets a ruling before the next round.
INVARIANTS: no code written twice. deliver best, not last. unknown = fail. compare vs fixed anchors (and away from anti_anchors).
Bench overwrites before every check. Tag before grading. Never exceed the cap. Only the user changes a criterion's meaning;
if you fix a test, add it to contested and re-grade best.
```

## Phase 3 — the loop

**Filling implementer.md:** worktree, parent, run_cmd, port, feature, axis + allowed_paths, direction (explore rounds only), criteria of the axis (+ the scaffold checks it must keep green), feedback, bench_paths, check_cmds. Before spawning, `grep -n '{{' <prompt file>` must print nothing: a leftover placeholder (it happened with `{{axis}}`/`{{allowed_paths}}`) leaves the agent guessing its scope. Same for grader.md.
**Filling grader.md** (only the mode section you need): worktree, run_cmd, port, probes, criteria (≤ 5 rubric), shots_dir = `<run>/shots`, version; compare mode: x / y in random order, anchors, anti_anchors. Never pass an implementer's SUMMARY to a grader.

**Stage A — scaffold.** One implementer from `base`, with every scaffold criterion. Refine rounds on it (procedure, axis `scaffold`) until its bar is met, then `git tag -f crucible/<slug>/scaffold <best>` and tell the user what exists. Plateau here → stop and report: the axes need a working base.

**Stage B — axes.** Start every axis whose `after` is done; independent axes run in parallel, sharing the cap. Per axis:
- `explore: true` → round 1 = `width` deliberately different directions, all on the axis files only, then calibration; next rounds refine the best.
- otherwise → one implementer refines from the start.
- **Calibration** (first round of each explored axis): user present → PushNotification if available, gallery link, the user either picks a winner (→ `human_pick`, extra anchor; then refine) or rejects them all (→ they become `anti_anchors` for that axis's compares; run another explore round with new directions). The user also flags grader verdicts they disagree with: reword those criteria and re-grade. User absent → `C better` picks; add "axis X not calibrated" to pending_questions.
- An axis ends at bar_met or plateau; its best is its result. A sequential axis starts from the previous axis's best tag.

**Stage C — merge.** `C merge <slug> merge scaffold <best of each parallel branch>`. A conflict means two axes touched the same file: tell the user, then redo the later axis on top of the merge (sequential) — never hand-mix. On the merged worktree: tag it, run all checks and one grader pass over every rubric. That version is the candidate for End.

**Mid-run user messages:** apply at step 1 of the next round ("restart visual from visual-r1-b, keep its moles" → new parent + note).
**Stop:** total rounds == max → stop wherever you are and report. STOP file → stop.

## End

Final blind compare of the merged candidate vs every anchor (two runs, swapped). Success = all musts pass and the user took part at some point; otherwise "criteria met, taste unverified". Report: final tag + `git checkout crucible/<slug>/<v>`, per-axis best and verdict table, pending questions, gallery link, resume command. Never merge into the user's branch yourself.

## Gallery

`C gallery <slug>` writes `<run>/gallery.html` (follows the artifact page contract). Publish with the Artifact tool (`file_path` = that file, `icon: "chart"` first time, same path afterwards → same URL); store the URL in `state.artifact_url`. A failed publish never blocks the loop.

## Resume — `/crucible resume [<slug>] [<version>]`

`C init <slug> resume`, read `RUN.md` + `state.json` (incl. `axes`), say where it stopped, continue the current stage. Same settings unless the user changes them.
