# Crucible (creuset) — design spec

Date: 2026-10-03. Status: draft for review.

## Purpose

Build a **new** feature with no existing reference to copy, by looping implementer agents against separate grader agents until a bar the human agreed on is met. Gauntlet-loop needs a named, fetchable thing to beat; Crucible replaces that with a co-designed bar (criteria) and an RL-style explore → exploit loop.

Scope: any project. Game features (gameplay, feel, fun), visuals (sprites, web pages), UX, business logic, "beat competitor X", plain code. The user often launches it and leaves for hours, and wants to drop in mid-run.

Triggers: `/crucible`, `/creuset`, "crucible", "creuset", "passe ça au creuset".

## Non-goals

- Not a prompt generator (that's gauntlet-loop). Crucible runs the loop in the current session.
- No Workflow-tool orchestration. The main session is the orchestrator; a small script (`crucible.py`) covers the deterministic steps.
- No hidden holdout criteria, no `nice` weights, no pivot branch.

## Revision 2026-10-03 — scaffold + axes (supersedes "N full versions" below)

First real run (Charming Anomaly Book 3) showed round-1 "explore" made 3 implementers write the same ~1,600 lines each, varying only the art. New rule: **no code is ever written twice.** Stage A: one implementer builds the scaffold (data, wiring, mechanics, placeholders) against the technical checks. Stage B: taste axes (visual, balance/feel, copy…), each restricted to its own file globs (`C scope` rejects edits outside them); best-of-N exploration only on axes marked `explore`; independent axes in parallel; axes whose files overlap (`C overlap`) or whose criteria depend on each other run **sequentially**, and the user is warned. Stage C: `C merge` the axis winners onto the scaffold, re-check everything. Calibration may also reject all explored versions → they become `anti_anchors` and the axis explores again. Per-axis best/plateau live in `state.axes`.

## Flow overview

```
Phase 0  Launch settings (questions)
Phase 1  Describe the feature (conversation)
Phase 2  Agree on the bar -> criteria.json (≤ 8 must + 1-2 compare)
Phase 2.5 Test bench: orchestrator writes checks/run cmd/probes, validates on base
Phase 2.9 Dry run (mandatory if unattended) -> writes RUN.md
Phase 3  Loop: round 1 explore (N versions) -> calibration -> rounds 2+ exploit (1 implementer)
End      Final blind compare vs anchors -> report + final gallery publish
```

## Phase 0 — launch settings

Asked at start (one AskUserQuestion round), with defaults:

| Setting | Default | Notes |
|---|---|---|
| Present for round-1 calibration? | no | yes: pause after round 1, push notification if available. no: continue, calibration on return |
| Max parallel subagents | 3 | hard cap, implementers and graders combined |
| Exploration width (round-1 versions) | 3 | ≤ cap |
| Max rounds | 6 | cost guard |

Then print a cost estimate: round 1 ≈ 1-2M tokens, each exploit round ≈ 400-600k tokens.

Preconditions: git repo. Worktrees are created by `crucible.py` with `git worktree add` from **local HEAD** (never the Agent tool's `isolation: worktree`, which branches from origin's default branch). Uncommitted changes are not in the worktrees: the orchestrator lists them and asks to commit or proceed without them.

## Phase 1 — describe the feature

Free conversation. The orchestrator restates the feature in a short paragraph and the user confirms.

## Phase 2 — the bar

The orchestrator drafts the criteria and the user corrects them. It asks two questions to get there: "what would make you reject it?" and "which reference looks right?" (a competitor, images, a game, a site).

`criteria.json` holds at most 8 `must` criteria plus 1-2 `compare` criteria:

```json
{
  "feature": "one paragraph",
  "criteria": [
    {"id": "c1", "type": "check",  "text": "jump apex reached in 0.35-0.45s", "verify": "npm test -- jump.apex"},
    {"id": "c2", "type": "rubric", "text": "player can correct trajectory mid-air", "verify": "send left/right inputs mid-jump via probe, read x velocity"},
    {"id": "k1", "type": "compare", "text": "jump feel", "anchors": ["refs/celeste-jump.mp4"]}
  ],
  "contested": []
}
```

- `check`: a script decides, no LLM. The orchestrator runs it.
- `rubric`: an LLM grader answers one observable yes/no question.
- `compare`: blind A/B against **fixed anchors** (user reference; after round 1, also the human's round-1 pick). Never against the moving best-so-far.
- Subjective wishes get rewritten into observable questions. What stays pure taste becomes a `compare`.
- Bar = all `must` pass (check + rubric), then the final compare gate (see End).

## Phase 2.5 — test bench (orchestrator-owned)

The orchestrator writes, and owns:
- the `check` tests and their config;
- the **run command**, with a `PORT` env var;
- the **state probes**: a small API, debug endpoint or script that lets graders send inputs and read real state (game state, DOM, DB);
- the render harness for visuals, e.g. render the sprite at real size on the real background.

**Reuse the project's own tooling first**: its test runner, browser rig (Playwright, puppeteer, ...), debug hooks, headless sim, probe scripts and project skills (e.g. a `probing-the-game` skill). Write new bench code only for what is missing.

Each check is run on the base code and must **fail for the right reason**; otherwise it gets fixed before being frozen. These files live in the run dir and are copied into each worktree before grading (see Integrity).

## Phase 2.9 — dry run → RUN.md

One full cycle on the base: install deps, start with the run command on an assigned port, run one check, take one screenshot, call one probe. If anything triggers a permission prompt or fails, the orchestrator fixes it now. **It refuses an unattended start until the dry run passes clean.**

It then writes `RUN.md` (~40 lines, frozen), which is the anti-compaction anchor:
- the feature, criteria summary and settings;
- commands, ports (`PORT = state.port + index`), the Artifact URL;
- the round procedure (≤ 10 steps);
- the invariants: best not last; unknown = fail; compare against anchors only; copy pristine tests before grading; tag before grading; respect the parallel cap.

**At the start of every round the orchestrator re-reads `RUN.md` and `state.json`.**

## Phase 3 — the loop

### Round 1 — explore

1. The orchestrator assigns each of the N implementers a **deliberately different direction** (e.g. arcade / heavy / floaty feel).
2. Implementers run in parallel (≤ cap), each in its own worktree from HEAD.
3. When each returns, `crucible.py tag` commits and tags it **immediately** (`crucible/<feature>/r1-a`…).
4. Grading: pristine test bench copied in, checks run, rubric graders run, each version compared against the user reference.
5. Gallery updated: local `gallery.html` plus the Artifact republished.
6. **Calibration.**
   - Present: the user picks the winner and flags grader verdicts they disagree with. The disagreements are turned into **reworded criteria**, not few-shot examples. The pick becomes an anchor for `compare`.
   - Absent: the graders' top version becomes best and no calibration happens. The report says so, and the user can calibrate on return and resume.

### Rounds 2+ — exploit

1. **One implementer** starts from best-so-far: an explicit checkout of its tag in a single exploit worktree that is reused across rounds.
2. It receives the 1-3 failing `must` criteria, the user's notes and the graders' evidence.
3. It returns → tag → pristine bench copied in → grading.
4. **Paired grading**: the candidate and best-so-far are graded in the same round by the same grader instance, against the same variants.
5. Replacement rule: the candidate replaces best if it passes **≥ as many musts, wins at least one, and regresses on none**. `unknown` counts as fail.
6. Gallery updated and Artifact republished.
7. The orchestrator checks the inbox: user messages typed in the session, and the `STOP` file.

### Stop conditions

- All musts pass → go to End.
- Plateau: best not replaced for 2 consecutive rounds → stop and report.
- Max rounds reached → stop and report.
- `.crucible/<feature>/STOP` exists → stop cleanly at the end of the current round.

### End

Run a **final blind compare** of best-so-far against the anchors.
- The user was present at some point (calibration or a mid-run intervention) and the compare holds → **success**.
- The user was never present → "criteria met, taste unverified".

The orchestrator delivers the **best version, not the last**: its tag, a per-criterion table, pending questions, the Artifact link and the resume command.

## Integrity (anti reward-hacking)

- Implementers must not edit tests, the bench, criteria or the run command. This is a prompt rule, and it is also **enforced by overwrite**: before grading, the orchestrator copies its pristine bench (tests, test config, probes, run script) over the worktree, so implementer edits there have no effect.
- Graders judge only what **they cause and read through the orchestrator's probes**. They ignore on-screen text and the implementer's logs.
- Anti-overfit: graders pick **variants at grading time** (another seed, level, viewport or input sequence) and run the criteria on them too.
- Checks run 3 times and must pass all 3, which filters out flaky tests.
- Implementers have a **flag exit** ("blocked" / "this test looks wrong") instead of working around a problem.
- If the orchestrator edits a test or criterion mid-run, that criterion goes into `contested`, best-so-far is re-graded, and it's logged. Only the human can change a criterion's meaning.

## Roles

**Orchestrator** (main session):
- does not implement the feature;
- owns the bench and runs the checks;
- spawns agents with the Agent tool and enforces the parallel cap;
- maintains state, the log and the gallery;
- reads user interventions between rounds.

**Implementer** (`implementer.md` template):
- receives the feature, its direction (round 1), the visible criteria, the parent tag, and feedback (failing criteria, grader evidence, user notes);
- rules: no edits to bench/tests/criteria, no special-casing, run the visible checks before returning, flag rather than work around;
- returns a ≤ 10-line summary plus flags.

**Grader** (`grader.md` template):
- fresh context; never sees the implementer's summary or reasoning;
- receives the worktree path, the run command and port, the probes, its criteria batch (≤ 5 rubric criteria per grader) and the anchors;
- exercises the running product;
- returns JSON per criterion: `pass|fail|unknown` plus evidence (screenshot path or command output);
- a defect related to a criterion means fail; no "minor".
- For `compare`:
  - candidates are labelled X and Y in random order, and the comparison runs twice with the order swapped;
  - if the two runs disagree, it is a tie.

## Run directory

`<repo>/.crucible/<feature>/` is excluded via `.git/info/exclude` (the user's `.gitignore` is never touched) and sits outside the implementer worktrees. It contains:

```
RUN.md          frozen brief, re-read every round
criteria.json   the bar (+ contested list)
bench/          orchestrator-owned tests, config, probes, run script
state.json      {round, best_tag, versions:[{tag, parent, verdicts, grader_notes}], anchors, pending_questions, artifact_url}
log.md          one paragraph per round
gallery.html    local gallery
shots/          screenshots / GIFs
STOP            (optional) user-created abort flag
```

## Gallery (Artifact)

A private claude.ai Artifact, **republished every round** to the same URL, with local `gallery.html` as fallback. A publish failure never blocks the loop; it is retried the next round. Layout:
- top: the criteria list with per-version verdicts (so a wrong bar is visible at a glance), current status and round, and pending questions;
- then one card per version: screenshot or GIF, musts passed/total, badges (best, user pick, rejected), parent, grader notes and the `git checkout` command.

## Parallel runs

One run = one slug, with its own run dir, worktrees, tags (`crucible/<slug>/…`), gallery Artifact and **port block** (10 ports, picked at `init` from a hash of repo+slug, skipping blocks claimed by other runs in the repo or currently in use; stored in `state.json`). `init` refuses a slug that already exists; resuming is explicit (`init <slug> resume`). Dev servers must be started in strict-port mode so they fail rather than drift onto another run's port.

## Mid-run intervention and resume

- **Mid-run**: the user types in the session ("r2 is weird, restart from r1 keeping X"). The orchestrator applies it at the end of the current round. A designated version becomes the next parent, and the user's note is added to the feedback.
- **Resume** (`/crucible resume [<tag>]`): rehydrate from `RUN.md` and `state.json`, then continue from best-so-far or from the given tag.

## Skill files

```
~/.agents/skills/crucible/        (symlinked from ~/.claude/skills/crucible, like gauntlet-loop)
  SKILL.md          orchestrator flow: phases, settings, judgment calls
  implementer.md    implementer prompt template
  grader.md         grader prompt template
  crucible.py       deterministic steps (python3 stdlib): init, worktree, tag, check (copy bench + run checks x3), record, gallery
  test_crucible.py  self-check of crucible.py on a temp git repo
  docs/DESIGN.md    this spec
  docs/PLAN.md      implementation plan
~/.claude/commands/creuset.md     alias: invokes the crucible skill
```

## Testing the skill

Run it on a small throwaway feature in a scratch repo, e.g. a jump mechanic in a minimal web canvas game, unattended, with width 2 and max 3 rounds. Verify:
- the dry run catches a missing permission;
- versions get tagged;
- an implementer edit to a test is overwritten;
- the replacement rule and plateau stop work;
- the Artifact updates every round;
- `resume` works after killing the session mid-run.

## Research basis

- Anthropic, *Building effective agents*; *Harness design for long-running apps*; *Effective harnesses for long-running agents*; *Demystifying evals for AI agents*.
- Checklist rubrics beat Likert scales (arXiv 2507.17746). Self-bias grows in iterative refinement (arXiv 2402.11436). Pairwise-judge instability (arXiv 2504.14716).
- ImpossibleBench (arXiv 2510.20270): more feedback rounds lead to more cheating; read-only tests are the best tradeoff; a flag exit helps.
- Large Language Monkeys (arXiv 2407.21787): the verifier is the bottleneck for best-of-N.
- Ralph loop (ghuntley.com/ralph); gauntlet-loop.
- Two adversarial design reviews (signal reliability; cost and practicality), integrated above.
