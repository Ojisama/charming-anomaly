# Crucible Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `crucible` skill (alias `/creuset`): an orchestrator-run loop where implementer agents build a new feature and separate grader agents judge it against a co-designed bar.

**Architecture:** `SKILL.md` drives the main session as orchestrator (judgment calls). `crucible.py` (python3 stdlib, no deps) does every deterministic step (run dir, worktrees from local HEAD, snapshot tags, pristine-bench checks ×3, verdict recording, replacement rule, plateau, gallery HTML). Two prompt templates (`implementer.md`, `grader.md`) are filled by the orchestrator per agent.

**Tech Stack:** Markdown skill files, Python 3.10 stdlib, git ≥ 2.31 (`--path-format`).

**Spec:** `~/.agents/skills/crucible/docs/DESIGN.md`

## Global Constraints

- Skill dir: `~/.agents/skills/crucible/`, symlinked as `~/.claude/skills/crucible` (same pattern as gauntlet-loop).
- Alias: `~/.claude/commands/creuset.md`.
- Run dir: `<main repo>/.crucible/<slug>/`, excluded via `.git/info/exclude`; never touch the user's `.gitignore`.
- Worktrees: `git worktree add` from local HEAD / a crucible tag; never the Agent tool's `isolation: worktree`.
- Tags: `crucible/<slug>/<version>` (e.g. `crucible/book3/r1-a`, `crucible/book3/r2`).
- Criteria: ≤ 8 must (`check` + `rubric`) + 1-2 `compare`. `unknown` = fail.
- Replacement: candidate's passing musts must be a strict superset of best's (≥ as many, wins one, regresses none). Equal sets = tie → `compare` decides.
- Plateau: best not replaced 2 rounds in a row.
- Defaults: calibration present = no, parallel cap = 3, width = 3, max rounds = 6.
- `~/.agents` is not a git repo: no commit steps for skill files.
- No Claude signature in any commit the skill makes (user rule).
- Snapshot commits run with `-c commit.gpgsign=false` (user has gpgsign on; a pinentry would hang an unattended run). The self-check exercises this path on this machine.
- Parallel runs: one run = one slug. `init` refuses an existing slug (resume = `init <slug> resume`) and gives each run its own block of 10 ports, stored in `state.port`.
- Skill's own design docs live in `docs/` (not read at run time except on demand).

## Review Focus

1. Run launched from inside a worktree or subdirectory → run dir must still resolve to the main repo (`--git-common-dir`). Pinned by test (init from subdir).
2. Same slug launched twice → refused; `init <slug> resume` keeps state.json and adds no duplicate exclude line; a second slug gets a different port block. Pinned by test.
3. Implementer edits a bench file to cheat → overwritten before checks. Pinned by test.
4. Exploit worktree reused across rounds → must be reset to the parent tag, ignored deps (node_modules) kept. Pinned by test (reset) — ignored-files kept by `git clean -fd` without `-x`.
5. Grader returns nested JSON `{"c2": {"verdict": ..., "evidence": ...}, "_gap": ...}` instead of a flat map → `record` must accept both. Pinned by test.

---

### Task 1: `crucible.py` + self-check

**Files:**
- Create: `~/.agents/skills/crucible/crucible.py`
- Test: `~/.agents/skills/crucible/test_crucible.py`

**Interfaces (Produces, used by SKILL.md):**
- `crucible.py init <slug> [resume]` → prints run dir path. Creates `bench/ shots/ logs/ wt/`, `state.json` (with `port`), exclude line. Without `resume`, exits 1 if the run already exists.
- `crucible.py worktree <slug> <name> <ref>` → prints worktree path `<run>/wt/<name>`. `<ref>` may be a short version (`r1-b`) or any git ref. Existing worktree is reset to ref.
- `crucible.py tag <slug> <name> <version>` → commit (no hooks) + tag `crucible/<slug>/<version>`, prints sha.
- `crucible.py check <slug> <name>` → copies `bench/` over the worktree, runs every `check` criterion 3×, prints `{"c1":"pass",...}`, logs to `logs/<name>.<id>.log`.
- `crucible.py record <slug> <version> <parent|-> <verdicts.json>` → merges verdicts (flat or nested) into `state.versions[<version>]`.
- `crucible.py better <slug> <cand> <best>` → prints `yes|no|tie`.
- `crucible.py round-end <slug> <best> [log text]` → prints `{"round","stale","plateau","bar_met"}`.
- `crucible.py gallery <slug>` → writes `<run>/gallery.html`, prints its path.
- `state.json`: `{slug, port, round, best_tag, stale, versions:{<v>:{parent, round, verdicts, evidence, notes}}, anchors, human_pick, pending_questions, artifact_url}`.

- [ ] **Step 1: Write the failing self-check** — `test_crucible.py`:

```python
#!/usr/bin/env python3
"""Self-check for crucible.py. Run: python3 test_crucible.py"""
import json, subprocess, sys, tempfile
from pathlib import Path

S = Path(__file__).with_name('crucible.py')

def sh(*a, cwd):
    return subprocess.run(a, cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()

def cru(*a, cwd):
    return sh(sys.executable, str(S), *a, cwd=cwd)

with tempfile.TemporaryDirectory() as d:
    repo = Path(d)
    sh('git', 'init', '-q', cwd=repo)
    (repo / 'sub').mkdir()
    (repo / 'sub' / 'keep').write_text('x')
    (repo / '.gitignore').write_text('deps/\n')
    sh('git', 'add', '-A', cwd=repo)
    sh('git', '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'base', cwd=repo)

    # init from a subdirectory resolves to the main repo, and is idempotent
    r = Path(cru('init', 'f', cwd=repo / 'sub'))
    assert r.resolve() == (repo / '.crucible' / 'f').resolve(), r
    # same slug twice is refused (parallel runs need distinct slugs); resume is explicit
    dup = subprocess.run([sys.executable, str(S), 'init', 'f'], cwd=repo, capture_output=True, text=True)
    assert dup.returncode == 1 and 'resume' in dup.stderr, dup.stderr
    cru('init', 'f', 'resume', cwd=repo)
    assert (repo / '.git/info/exclude').read_text().count('.crucible/') == 1
    # a second run in parallel gets its own port block
    cru('init', 'g', cwd=repo)
    pf = json.loads((r / 'state.json').read_text())['port']
    pg = json.loads((repo / '.crucible/g/state.json').read_text())['port']
    assert abs(pf - pg) >= 10, (pf, pg)

    (r / 'bench' / 't.sh').write_text('grep -q jump feature.txt\n')
    (r / 'criteria.json').write_text(json.dumps({'feature': 'x', 'contested': [], 'criteria': [
        {'id': 'c1', 'type': 'check', 'text': 'feature has jump', 'verify': 'sh t.sh'},
        {'id': 'c2', 'type': 'rubric', 'text': 'feels good', 'verify': 'grader'},
        {'id': 'k1', 'type': 'compare', 'text': 'feel', 'anchors': []}]}))
    vf = r / 'v.json'

    # version a cheats: rewrites the bench test to always pass -> overwritten -> fail
    wa = Path(cru('worktree', 'f', 'a', 'HEAD', cwd=repo))
    (wa / 't.sh').write_text('true\n')
    cru('tag', 'f', 'a', 'r1-a', cwd=repo)
    assert json.loads(cru('check', 'f', 'a', cwd=repo)) == {'c1': 'fail'}
    vf.write_text(json.dumps({'c1': 'fail', 'c2': 'unknown'}))
    cru('record', 'f', 'r1-a', '-', str(vf), cwd=repo)

    # version b does the work; grader-style nested JSON accepted
    wb = Path(cru('worktree', 'f', 'b', 'HEAD', cwd=repo))
    (wb / 'feature.txt').write_text('jump\n')
    cru('tag', 'f', 'b', 'r1-b', cwd=repo)
    assert json.loads(cru('check', 'f', 'b', cwd=repo)) == {'c1': 'pass'}
    vf.write_text(json.dumps({'c1': 'pass', 'c2': {'verdict': 'unknown', 'evidence': 'no probe'}, '_gap': 'jump is floaty'}))
    cru('record', 'f', 'r1-b', '-', str(vf), cwd=repo)
    st = json.loads((r / 'state.json').read_text())
    assert st['versions']['r1-b']['verdicts'] == {'c1': 'pass', 'c2': 'unknown'}
    assert st['versions']['r1-b']['notes'] == 'jump is floaty'

    assert cru('better', 'f', 'r1-b', 'r1-a', cwd=repo) == 'yes'
    assert cru('better', 'f', 'r1-a', 'r1-b', cwd=repo) == 'no'
    assert cru('better', 'f', 'r1-b', 'r1-b', cwd=repo) == 'tie'

    s = json.loads(cru('round-end', 'f', 'r1-b', 'round one', cwd=repo))
    assert s == {'round': 1, 'stale': 0, 'plateau': False, 'bar_met': False}, s  # c2 unknown = fail

    # exploit worktree reused: reset to the tag, ignored deps kept; no replacement twice -> plateau
    for _ in (2, 3):
        wx = Path(cru('worktree', 'f', 'x', 'r1-b', cwd=repo))
        assert (wx / 'feature.txt').read_text() == 'jump\n'
        (wx / 'junk.txt').write_text('stale edit')
        (wx / 'deps').mkdir(exist_ok=True)
        (wx / 'deps' / 'lib').write_text('cached')
        s = json.loads(cru('round-end', 'f', 'r1-b', cwd=repo))
    wx = Path(cru('worktree', 'f', 'x', 'r1-b', cwd=repo))
    assert not (wx / 'junk.txt').exists() and (wx / 'deps' / 'lib').exists()
    assert s['plateau'] and s['stale'] == 2, s

    vf.write_text(json.dumps({'c2': 'pass'}))
    cru('record', 'f', 'r1-b', '-', str(vf), cwd=repo)
    assert json.loads(cru('round-end', 'f', 'r1-b', cwd=repo))['bar_met'] is True

    sh('git', 'rev-parse', 'crucible/f/r1-a', cwd=repo)
    g = Path(cru('gallery', 'f', cwd=repo)).read_text()
    assert 'r1-b' in g and 'feature has jump' in g and 'jump is floaty' in g
    assert sh('git', 'status', '--porcelain', cwd=repo) == '', 'run dir must be excluded'
    assert 'round one' in (r / 'log.md').read_text()

print('ok')
```

- [ ] **Step 2: Run it, expect failure**

Run: `python3 ~/.agents/skills/crucible/test_crucible.py`
Expected: FAIL (`crucible.py` missing → CalledProcessError).

- [ ] **Step 3: Write `crucible.py`**

```python
#!/usr/bin/env python3
"""Crucible deterministic steps. Called by the orchestrator (see SKILL.md).

  init <slug> [resume]                 create run dir, exclude it, state.json (+ port block); refuses an existing run
  worktree <slug> <name> <ref>         worktree at <run>/wt/<name> on ref (reset if it exists)
  tag <slug> <name> <version>          snapshot worktree -> tag crucible/<slug>/<version>
  check <slug> <name>                  copy pristine bench over worktree, run check criteria x3
  record <slug> <version> <parent|-> <verdicts.json>
  better <slug> <cand> <best>          yes | no | tie   (strict superset of passing musts)
  round-end <slug> <best> [log]        -> {round, stale, plateau, bar_met}
  gallery <slug>                       write <run>/gallery.html
"""
import base64, hashlib, html, json, shutil, socket, subprocess, sys
from pathlib import Path


def git(*a, cwd=None):
    return subprocess.run(['git', *a], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def common():
    return Path(git('rev-parse', '--path-format=absolute', '--git-common-dir'))


def run_dir(slug):
    return common().parent / '.crucible' / slug


def load(p):
    return json.loads(Path(p).read_text())


def save(p, d):
    Path(p).write_text(json.dumps(d, indent=2, ensure_ascii=False) + '\n')


def ref_of(slug, ref):
    t = f'crucible/{slug}/{ref}'
    ok = subprocess.run(['git', 'rev-parse', '-q', '--verify', t], capture_output=True).returncode == 0
    return t if ok else ref


def musts(r):
    return [c['id'] for c in load(r / 'criteria.json')['criteria'] if c['type'] != 'compare']


def free(port):
    with socket.socket() as s:
        return s.connect_ex(('127.0.0.1', port)) != 0


def pick_port(r):
    # ponytail: deterministic block per (repo, slug) + skip blocks claimed in this repo or in use; cross-repo runs only collide if both hash alike AND neither is listening yet
    taken = {load(p).get('port') for p in r.parent.glob('*/state.json')}
    base = 5200 + int(hashlib.sha1(str(r).encode()).hexdigest(), 16) % 80 * 10
    for i in range(80):
        port = 5200 + (base - 5200 + i * 10) % 800
        if port not in taken and all(free(port + k) for k in range(10)):
            return port
    sys.exit('crucible: no free port block in 5200-5999')


def init(slug, mode=''):
    r = run_dir(slug)
    if (r / 'state.json').exists() and mode != 'resume':
        sys.exit(f'crucible: run "{slug}" already exists. Pick another slug, or: init {slug} resume')
    for d in ('bench', 'shots', 'logs', 'wt'):
        (r / d).mkdir(parents=True, exist_ok=True)
    excl = common() / 'info' / 'exclude'
    excl.parent.mkdir(exist_ok=True)
    lines = excl.read_text().splitlines() if excl.exists() else []
    if '.crucible/' not in lines:
        excl.write_text('\n'.join(lines + ['.crucible/']) + '\n')
    if not (r / 'state.json').exists():
        save(r / 'state.json', {'slug': slug, 'port': pick_port(r), 'round': 0, 'best_tag': None, 'stale': 0, 'versions': {},
                                'anchors': [], 'human_pick': None, 'pending_questions': [], 'artifact_url': None})
    print(r)


def worktree(slug, name, ref):
    wt, ref = run_dir(slug) / 'wt' / name, ref_of(slug, ref)
    if wt.exists():
        git('reset', '-q', '--hard', ref, cwd=wt)
        git('clean', '-fdq', cwd=wt)  # no -x: ignored deps (node_modules...) survive between rounds
    else:
        git('worktree', 'add', '-q', '--detach', str(wt), ref)
    print(wt)


def tag(slug, name, version):
    wt = run_dir(slug) / 'wt' / name
    git('add', '-A', cwd=wt)
    has_id = subprocess.run(['git', 'config', 'user.email'], cwd=wt, capture_output=True, text=True).stdout.strip()
    ident = [] if has_id else ['-c', 'user.name=crucible', '-c', 'user.email=crucible@localhost']
    # snapshots are local-only: never block an unattended run on a GPG pinentry
    git(*ident, '-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '--allow-empty', '-m', f'crucible {slug} {version}', cwd=wt)
    git('tag', '-f', f'crucible/{slug}/{version}', cwd=wt)
    print(git('rev-parse', 'HEAD', cwd=wt))


def check(slug, name):
    r = run_dir(slug)
    wt = r / 'wt' / name
    shutil.copytree(r / 'bench', wt, dirs_exist_ok=True)  # ponytail: overwrite = integrity, no diff policing
    out = {}
    for c in load(r / 'criteria.json')['criteria']:
        if c['type'] != 'check':
            continue
        ok = True
        with open(r / 'logs' / f'{name}.{c["id"]}.log', 'w') as log:
            for _ in range(3):  # flaky = fail
                try:
                    p = subprocess.run(c['verify'], shell=True, cwd=wt, stdout=log, stderr=subprocess.STDOUT, timeout=900)
                    ok = p.returncode == 0
                except subprocess.TimeoutExpired:
                    ok = False
                if not ok:
                    break
        out[c['id']] = 'pass' if ok else 'fail'
    print(json.dumps(out))


def record(slug, version, parent, verdicts_file):
    r = run_dir(slug)
    st = load(r / 'state.json')
    raw = load(verdicts_file)
    v = st['versions'].setdefault(version, {'parent': None if parent == '-' else parent, 'round': st['round'] + 1,
                                            'verdicts': {}, 'evidence': {}, 'notes': ''})
    for k, x in raw.items():
        if k == '_gap':
            v['notes'] = x
        elif not k.startswith('_'):
            v['verdicts'][k] = x['verdict'] if isinstance(x, dict) else x
            if isinstance(x, dict) and x.get('evidence'):
                v['evidence'][k] = x['evidence']
    save(r / 'state.json', st)


def passing(r, st, version):
    vd = st['versions'][version]['verdicts']
    return {i for i in musts(r) if vd.get(i) == 'pass'}  # unknown / missing = fail


def better(slug, cand, best):
    r = run_dir(slug)
    st = load(r / 'state.json')
    c, b = passing(r, st, cand), passing(r, st, best)
    print('tie' if c == b else 'yes' if c > b else 'no')


def round_end(slug, best, log=''):
    r = run_dir(slug)
    st = load(r / 'state.json')
    st['stale'] = 0 if best != st['best_tag'] else st['stale'] + 1
    st['best_tag'] = best
    st['round'] += 1
    save(r / 'state.json', st)
    if log:
        with open(r / 'log.md', 'a') as f:
            f.write(f'## Round {st["round"]}\n\n{log}\n\n')
    print(json.dumps({'round': st['round'], 'stale': st['stale'], 'plateau': st['stale'] >= 2,
                      'bar_met': passing(r, st, best) == set(musts(r))}))


CSS = """
:root{--bg:#f7f5f0;--fg:#1d1b18;--muted:#6b665d;--card:#fff;--line:#e2ddd2;--accent:#b4441c}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#15130f;--fg:#ece7dc;--muted:#9a9384;--card:#1f1c17;--line:#3a352c;--accent:#f08a4b}}
:root[data-theme="dark"]{--bg:#15130f;--fg:#ece7dc;--muted:#9a9384;--card:#1f1c17;--line:#3a352c;--accent:#f08a4b}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
main{max-width:1100px;margin:auto}h1{margin:.2em 0}.muted{color:var(--muted)}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;white-space:nowrap}
td:first-child{white-space:normal;min-width:200px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}.card img{width:100%;border-radius:6px}
.badge{display:inline-block;background:var(--accent);color:var(--bg);border-radius:4px;padding:0 6px;margin-right:4px;font-size:12px}
code{font-size:12px;word-break:break-all}
"""


def gallery(slug):
    r = run_dir(slug)
    st, cfg = load(r / 'state.json'), load(r / 'criteria.json')
    e, tags, ms = html.escape, list(st['versions']), musts(r)
    glyph = {'pass': '✅', 'fail': '❌', 'unknown': '❔'}
    head = '<tr><th>Critère</th>' + ''.join(f'<th>{e(t)}</th>' for t in tags) + '</tr>'
    rows = ''.join(
        f'<tr><td><b>{e(c["id"])}</b> {e(c["text"])}{" ⚠ contesté" if c["id"] in cfg.get("contested", []) else ""}</td>'
        + ''.join(f'<td>{glyph.get(st["versions"][t]["verdicts"].get(c["id"]), "·")}</td>' for t in tags) + '</tr>'
        for c in cfg['criteria'])
    cards = ''
    for t in reversed(tags):
        v = st['versions'][t]
        img = next((p for p in (r / 'shots' / f'{t}.png', r / 'shots' / f'{t}.gif') if p.exists()), None)
        # ponytail: images inlined as data URIs (one self-contained file); fine for ~20 shots, use Artifact `files` if it nears 16MB
        pic = f'<img alt="{e(t)}" src="data:image/{img.suffix[1:]};base64,{base64.b64encode(img.read_bytes()).decode()}">' if img else ''
        badges = ('<span class="badge">meilleure</span>' if t == st['best_tag'] else '') + \
                 ('<span class="badge">ton choix</span>' if t == st.get('human_pick') else '')
        n = sum(v['verdicts'].get(i) == 'pass' for i in ms)
        cards += (f'<div class="card">{pic}<h3>{e(t)} {badges}</h3><p class="muted">parent {e(str(v["parent"]))} · '
                  f'tour {v["round"]} · {n}/{len(ms)} must</p><p>{e(v.get("notes", ""))}</p>'
                  f'<code>git checkout crucible/{e(slug)}/{e(t)}</code></div>')
    qs = ''.join(f'<li>{e(q)}</li>' for q in st['pending_questions']) or '<li class="muted">aucune</li>'
    page = (f'<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>Crucible {e(slug)}</title><style>{CSS}</style></head><body><main>'
            f'<h1>Crucible · {e(slug)}</h1><p class="muted">{e(cfg.get("feature", ""))}</p>'
            f'<p>Tour {st["round"]} · meilleure : <b>{e(str(st["best_tag"]))}</b> · tours sans progrès : {st["stale"]}</p>'
            f'<h2>Questions pour toi</h2><ul>{qs}</ul>'
            f'<h2>Critères</h2><div class="scroll"><table>{head}{rows}</table></div>'
            f'<h2>Versions</h2><div class="cards">{cards}</div></main></body></html>')
    (r / 'gallery.html').write_text(page)
    print(r / 'gallery.html')


if __name__ == '__main__':
    cmd, *args = sys.argv[1:]
    {'init': init, 'worktree': worktree, 'tag': tag, 'check': check, 'record': record,
     'better': better, 'round-end': round_end, 'gallery': gallery}[cmd](*args)
```

- [ ] **Step 4: Run the self-check, expect `ok`**

Run: `python3 ~/.agents/skills/crucible/test_crucible.py`
Expected: `ok`

---

### Task 2: Prompt templates

**Files:**
- Create: `~/.agents/skills/crucible/implementer.md`
- Create: `~/.agents/skills/crucible/grader.md`

**Interfaces:**
- Placeholders `{{...}}` are filled by the orchestrator (SKILL.md, Task 3) before spawning.
- Grader output JSON matches what `crucible.py record` accepts (nested `{"verdict","evidence"}`, `_gap`).

- [ ] **Step 1: Write `implementer.md`**

```markdown
You are an IMPLEMENTER in a Crucible run. Someone else will judge your work, harshly, by running it.

Worktree: {{worktree}}. Work only there. It starts at version {{parent}}.
Run the product with: {{run_cmd}} (use PORT={{port}}, never another port).

Feature:
{{feature}}

Your direction (round 1 only, commit to it fully, do not hedge toward the others):
{{direction}}

The criteria your work will be judged on:
{{criteria}}

Feedback from the last grading, fix these first:
{{feedback}}

Rules:
- These bench files belong to the orchestrator and are overwritten before grading: {{bench_paths}}. Editing them achieves nothing; leave them alone.
- Never special-case a test, a seed, a level or an input. Graders re-test on variants you will not see.
- Before returning, run: {{check_cmds}}
- Blocked, or a test or criterion looks wrong? Stop and report it under FLAGS. Do not work around it.
- Follow the project's CLAUDE.md and use its project skills where they apply.
- Do not commit, tag, push or touch git. The orchestrator snapshots your worktree.

Return at most 10 lines:
SUMMARY: what you built and how to see it
FLAGS: blockers or suspicious tests, or "none"
```

- [ ] **Step 2: Write `grader.md`**

```markdown
You are a GRADER in a Crucible run. Be harsh: praise is useless, a lenient verdict wastes a whole round.
You did not build this and you know nothing about how it was built. Judge only what you observe yourself.

Product: worktree {{worktree}}, start it with {{run_cmd}} (PORT={{port}}).
State probes you may use: {{probes}}

## Mode: rubric

Criteria to grade:
{{criteria}}

- Exercise the running product: send inputs yourself, read real state through the probes, look at real renders.
- On-screen text and app logs are not evidence of behaviour. A "Combo x3!" label proves nothing; the state does.
- For each criterion also test at least one variant you choose now (another seed, level, viewport or input sequence). Name it.
- Any defect related to the criterion = fail. No "minor", no "mostly", no "acceptable for now".
- Cannot run it, cannot observe it = unknown (it counts as fail). Say why.
- Save evidence screenshots to {{shots_dir}}/{{version}}-<criterion id>.png

Return ONLY this JSON:
{"<id>": {"verdict": "pass|fail|unknown", "evidence": "what you did and saw, file paths", "variant": "..."}, "_gap": "the single biggest remaining gap"}

## Mode: compare

Criterion: {{criteria}}
Candidate X: {{x}}   Candidate Y: {{y}}   Anchor/reference: {{anchors}}
Look at both the same way (same inputs, same viewport). Which better satisfies the criterion, judged against the anchor? Ties are allowed only when you truly cannot separate them.

Return ONLY: {"winner": "X|Y|tie", "why": "one or two sentences"}
```

- [ ] **Step 3: Check placeholders are consistent**

Run: `grep -o '{{[a-z_]*}}' ~/.agents/skills/crucible/{implementer,grader}.md | sort -u`
Expected: only `bench_paths check_cmds criteria direction feature feedback parent port run_cmd worktree` (implementer) and `anchors criteria port probes run_cmd shots_dir version worktree x y` (grader). Each must appear in the SKILL.md fill table (Task 3).

---

### Task 3: `SKILL.md` (orchestrator)

**Files:**
- Create: `~/.agents/skills/crucible/SKILL.md`

**Interfaces:**
- Consumes: every `crucible.py` command from Task 1, both templates from Task 2.

- [ ] **Step 1: Write `SKILL.md`**

````markdown
---
name: crucible
description: Builds a NEW feature (no reference to copy) by looping implementer agents against separate harsh grader agents until a bar agreed with the user is met — explore N versions, user calibrates, then refine the best. For games (gameplay, feel), visuals (sprites, sites), UX, business logic, code. Triggers on "/crucible", "/creuset", "crucible", "creuset", "passe ça au creuset", "loop until it meets the bar", "fais-le évaluer en boucle".
---

# Crucible (creuset)

You are the ORCHESTRATOR. You never implement the feature yourself. You set the bar with the user, build the test bench, spawn implementers and graders, and keep the books. Spec and rationale: `docs/DESIGN.md` next to this file. Speak the user's language.

`C` below means `python3 ~/.claude/skills/crucible/crucible.py`, always run from the project repo.

## Phase 0 — settings

Ask in ONE AskUserQuestion call (defaults first, marked Recommended):
1. Present for round-1 calibration? (no / yes)
2. Max parallel subagents (3 / 2 / 5) — hard cap on implementers + graders running at once.
3. Round-1 exploration width (3 / 2 / 1) — must be ≤ cap.
4. Max rounds (6 / 4 / 10).

Then state the cost estimate: round 1 ≈ 1-2M tokens, each later round ≈ 400-600k.
`git status --short`: if there are uncommitted changes, list them — worktrees start from HEAD and will not contain them — and ask: commit first, or proceed without.
Pick a short slug for the feature (`book3`) and run `C init <slug>`. One run = one slug: if it says the run exists, either pick another slug (another run may be going in parallel) or resume it. Read `port` from `<run>/state.json`: this run owns ports `port` … `port+9`; never use any other (other runs may be live).

## Phase 1 — the feature

Let the user describe it. Read the project's CLAUDE.md and design docs it points to. Restate the feature in one paragraph; get a yes.

## Phase 2 — the bar

Draft the criteria yourself. Ask only two things: "what would make you reject it?" and "which reference looks right?" (competitor, images, game, site — get the actual files/URLs).
Write `<run>/criteria.json`:

```json
{"feature": "one paragraph", "contested": [], "criteria": [
  {"id": "c1", "type": "check", "text": "...", "verify": "<shell command, exit 0 = pass, run from repo root>"},
  {"id": "c2", "type": "rubric", "text": "<one observable yes/no question>", "verify": "<how a grader observes it: inputs + probe>"},
  {"id": "k1", "type": "compare", "text": "<taste dimension>", "anchors": ["<path or URL>"]}]}
```

- At most 8 `check` + `rubric` (all are must), plus 1-2 `compare`.
- Rewrite every wish into something observable ("jump feels good" → "player can reverse direction mid-air within 150 ms"). What stays pure taste becomes a `compare` against an anchor.
- Show the list as a table; the user corrects; freeze.

## Phase 2.5 — the bench (yours)

In `<run>/bench/`, laid out as an overlay of repo-relative paths (`bench/test/crucible-book3.test.js` lands at `test/crucible-book3.test.js`), write what the checks and graders need: tests, a run script honouring `$PORT`, state probes (debug hook / endpoint / script that sends inputs and reads real state), render harness for visuals.
**Reuse the project's tooling first**: its test runner, browser rig, debug hooks, headless sim, probe scripts, project skills (e.g. `probing-the-game`). New code only for what is missing.
Validate on base: `C worktree <slug> base HEAD` then `C check <slug> base` — every check must FAIL, and the log in `<run>/logs/` must show it fails for the right reason (feature absent, not a typo). Fix until true.

## Phase 2.9 — dry run, then RUN.md

On the `base` worktree, do one full cycle exactly as agents will: install deps, start with the run script on `PORT=<base port>`, call one probe, take one screenshot, run `C check`, `C gallery <slug>`, publish the gallery (below). Anything that asks for permission or fails: fix it now. If the user is leaving and the dry run is not clean, say so and do not start.

Then write `<run>/RUN.md` (≤ 40 lines, never edited after): slug, feature paragraph, settings, base port from state.json and port per version (`port + index`, base worktree = `port`), run/check/probe commands, Artifact URL, bench paths, and this procedure + invariants copied verbatim:

```
ROUND PROCEDURE (re-read RUN.md and state.json at the start of every round)
1. Inbox: user messages since last round? STOP file at <run>/STOP? Apply / stop.
2. Spawn implementer(s) (Agent tool, no isolation) with implementer.md filled; ≤ cap at once.
3. Each return: C tag <slug> <name> <version> immediately. Copy FLAGS to state pending_questions.
4. C check <slug> <name>  -> record check verdicts.
5. Graders (grader.md, rubric mode, ≤ 5 criteria each) on candidate AND best, same instance, same variants.
6. C record each verdict file. Compare criteria: two runs, X/Y swapped; disagreement = tie.
7. C better <slug> <cand> <best>: yes -> new best; tie -> compare vs anchors decides; no -> keep best.
8. Copy one representative screenshot to <run>/shots/<version>.png.
9. C round-end <slug> <best> "<3-line log>"  -> bar_met / plateau / round.
10. C gallery <slug>, republish Artifact, then decide: continue / end.
INVARIANTS: deliver best, not last. unknown = fail. compare only vs fixed anchors.
Bench overwrites before every check. Tag before grading. Never exceed the parallel cap.
Only the user changes a criterion's meaning; if you fix a test, add its id to contested and re-grade best.
```

## Phase 3 — the loop

**Round 1 — explore.** Invent `width` deliberately different directions (e.g. arcade / heavy / floaty). For each: `C worktree <slug> r1-<a|b|c> HEAD`, spawn an implementer (fill: worktree, parent=HEAD, run_cmd, port, feature, direction, criteria — visible text + verify of every must, feedback="none yet", bench_paths, check_cmds). Then procedure steps 3-10 for each version (no "best" yet; graders grade each version alone; compare vs user anchors).
- **Calibration, user present:** send a PushNotification if that tool exists, show the gallery link, ask the user to pick the winner and to point at every grader verdict they disagree with. Rewrite the wording of those criteria (not few-shot examples) and re-grade with the new wording. Their pick → `state.human_pick` and an extra anchor for every `compare`.
- **Calibration, user absent:** the best by `C better` (tie → compare) becomes best; add "round 1 not calibrated" to pending_questions. Continue.

**Rounds 2+ — exploit.** `C worktree <slug> x <best version>`, one implementer (direction="refine", feedback = the 1-3 failing musts + their grader evidence + the user's notes + the `_gap`). Version name `r<round>`. Then procedure steps 3-10.

**Mid-run user messages:** apply at step 1 of the next round. "Restart from r3, keep its attack animation" → next parent = r3, note added to feedback.

**Stop:** bar_met → End. plateau → stop. round == max rounds → stop. STOP file → stop.

## End

If bar_met: final blind compare of best vs every anchor (two runs, swapped). Verdict:
- user took part (calibration or mid-run) and best wins or ties → **success**.
- user never took part → **criteria met, taste unverified**.
Report: best version tag + `git checkout crucible/<slug>/<v>` (or how to merge it), per-criterion table, pending questions, gallery link, resume command. Never merge into the user's branch yourself.

## Gallery

`C gallery <slug>` writes `<run>/gallery.html` (already follows the artifact page contract). Publish it with the Artifact tool (`file_path` = that file, `icon: "chart"` on first publish, then the same path republishes to the same URL); store the URL in `state.artifact_url`. A failed publish never blocks the loop; retry next round.

## Resume — `/crucible resume [<slug>] [<version>]`

Run `C init <slug> resume`, read `<run>/RUN.md` and `state.json`, say where it stopped, continue from best (or the given version as parent). Same settings unless the user changes them.
````

- [ ] **Step 2: Cross-check templates ↔ SKILL.md**

Every placeholder listed in Task 2 Step 3 must be named in SKILL.md's spawn instructions (implementer: Round 1 fill list; grader: procedure step 5-6 + grader.md). Fix wording if one is missing.

---

### Task 4: Install + alias

**Files:**
- Create symlink: `~/.claude/skills/crucible -> ../../.agents/skills/crucible`
- Create: `~/.claude/commands/creuset.md`

- [ ] **Step 1: Symlink and alias**

```bash
ln -s ../../.agents/skills/crucible ~/.claude/skills/crucible
mkdir -p ~/.claude/commands
cat > ~/.claude/commands/creuset.md <<'EOF'
---
description: Creuset — alias français de /crucible (boucle implémenteurs + notateurs jusqu'à la barre)
---
Invoke the `crucible` skill with these arguments: $ARGUMENTS
EOF
```

- [ ] **Step 2: Verify**

Run: `ls -la ~/.claude/skills/crucible/ && python3 ~/.claude/skills/crucible/test_crucible.py`
Expected: SKILL.md, crucible.py, test_crucible.py, implementer.md, grader.md, docs/ listed; `ok`.
New skills appear in the skill list at the next session start.

---

### Task 5: First real run — Charming Anomaly, Book 3 (3 chapters)

Not code: the acceptance test of the skill, run by the user in a fresh session from `~/gamedev/charming_anomaly`.

Known facts to feed Phase 1-2.5 (from exploration, verify at run time):
- "Levels" = **chapters** in `src/config.js` (`BOOKS`, `BOOK_ORDER = ['book1','undertow']`, `CHAPTERS.<id> = {...}`); French copy in `src/fr.js`; save fields add-only (`state.js`).
- Book design rule: "a book is a verb and a threat model, not a substrate" (`docs/superpowers/specs/2026-08-12-book-2-downward-design.md`) — Phase 1 must produce that for Book 3.
- Tooling for the bench: `npm test` (node assert scenarios, seeded), `scripts/smoke.mjs --chapter X` (puppeteer, phone + desktop), `?debug` → `window.__run`, `__stepSim`, localStorage `{chapter, dev:true}` to jump in, headless sim in node; project skills `probing-the-game`, `verifying-chapter-stage`, `designing-an-enemy`, `game-art-and-copy`.
- Repo state: uncommitted `.gitignore` change + untracked lockfiles; local `main` 23 commits behind origin → Phase 0 will ask; decide whether to pull first (see `shipping-a-release` skill: pulling is the dangerous fix).
- Port: run gets its block from `state.port`; versions on `port+i` via `npm run dev -- --port $PORT --strictPort` (strictPort so Vite fails instead of silently drifting to another run's port).

- [ ] **Step 1:** User runs `/creuset` (or `/crucible`) in `~/gamedev/charming_anomaly`: "Book 3 et ses 3 premiers chapitres".
- [ ] **Step 2:** Watch for: dry run catching a permission prompt, tags created, bench overwrite, gallery updating each round, plateau/bar stop, resume after interruption. Each miss → fix SKILL.md/crucible.py.
