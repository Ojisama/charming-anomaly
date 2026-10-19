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

    # --- review fixes ---
    # base commit pinned as a tag at init (user may commit mid-run)
    sh('git', 'rev-parse', 'crucible/f/base', cwd=repo)
    # fixed port slots inside the run's 10-port block
    p0 = json.loads((r / 'state.json').read_text())['port']
    assert [int(cru('port', 'f', n, cwd=repo)) - p0 for n in ('base', 'r1-a', 'r1-e', 'x', 'best')] == [0, 1, 5, 6, 7]
    # worktree brings the bench in for the implementer; tag keeps bench files out of the snapshot
    wc = Path(cru('worktree', 'f', 'c', 'base', cwd=repo))
    assert (wc / 't.sh').exists()
    (wc / 'feature.txt').write_text('jump\n')
    cru('tag', 'f', 'c', 'r1-c', cwd=repo)
    files = sh('git', 'show', '--name-only', '--format=', 'crucible/f/r1-c', cwd=repo).split()
    assert files == ['feature.txt'], files
    # init from inside a linked worktree still targets the main repo
    assert Path(cru('init', 'h', cwd=wc)).resolve() == (repo / '.crucible' / 'h').resolve()
    # malformed grader verdict (no "verdict" key) -> unknown, no crash
    vf.write_text(json.dumps({'c1': {'evidence': 'forgot the verdict'}}))
    cru('record', 'f', 'r1-c', '-', str(vf), cwd=repo)
    assert json.loads((r / 'state.json').read_text())['versions']['r1-c']['verdicts']['c1'] == 'unknown'
    # a check that times out has its whole process group killed (no orphan server holding a port)
    (r / 'criteria.json').write_text(json.dumps({'feature': 'x', 'contested': [], 'criteria': [
        {'id': 't1', 'type': 'check', 'text': 'hangs', 'verify': 'sleep 30 & echo $! > child.pid; wait', 'timeout': 1}]}))
    import time
    t0 = time.time()
    assert json.loads(cru('check', 'f', 'c', cwd=repo)) == {'t1': 'fail'}
    assert time.time() - t0 < 10, 'timeout did not kill the process group'
    child = int((wc / 'child.pid').read_text())
    time.sleep(0.3)
    assert not Path(f'/proc/{child}').exists() or 'Z' in Path(f'/proc/{child}/stat').read_text().split()[2], 'orphan survived'
    # free-ports kills anything listening in the run's block
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(p0 + 6)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    cru('free-ports', 'f', cwd=repo)
    srv.wait(timeout=5)

    # --- axes: scaffold once, then axes on disjoint files; conflicting axes reported ---
    assert 'worktree' in sh(sys.executable, str(S), '--help', cwd=repo)
    (r / 'criteria.json').write_text(json.dumps({'feature': 'x', 'contested': [], 'criteria': [
        {'id': 'c1', 'type': 'check', 'text': 't', 'verify': 'echo x >> runs.log', 'axis': 'scaffold', 'runs': 1}],
        'axes': {'scaffold': {'paths': ['*']},
                 'visual': {'paths': ['art/*'], 'after': 'scaffold'},
                 'balance': {'paths': ['numbers.txt'], 'after': 'scaffold'},
                 'feel': {'paths': ['numbers.txt', 'feel/*'], 'after': 'scaffold'}}}))
    ov = cru('overlap', 'f', cwd=repo)
    assert 'balance feel' in ov and 'visual' not in ov and 'scaffold' not in ov, ov

    ws = Path(cru('worktree', 'f', 's', 'base', cwd=repo))
    assert json.loads(cru('check', 'f', 's', cwd=repo)) == {'c1': 'pass'}
    assert (ws / 'runs.log').read_text().count('x') == 1, 'runs: 1 must run once'
    (ws / 'runs.log').unlink()
    (ws / 'art').mkdir()
    (ws / 'art' / 'mole.png').write_text('p')
    assert cru('scope', 'f', 's', 'visual', cwd=repo) == 'ok'
    (ws / 'numbers.txt').write_text('9')
    bad = subprocess.run([sys.executable, str(S), 'scope', 'f', 's', 'visual'], cwd=repo, capture_output=True, text=True)
    assert bad.returncode == 1 and 'numbers.txt' in bad.stdout, bad.stdout + bad.stderr

    wv = Path(cru('worktree', 'f', 'v', 'base', cwd=repo))
    (wv / 'art').mkdir()
    (wv / 'art' / 'a.png').write_text('v')
    cru('tag', 'f', 'v', 'ax-visual', cwd=repo)
    wbal = Path(cru('worktree', 'f', 'bal', 'base', cwd=repo))
    (wbal / 'numbers.txt').write_text('1\n')
    cru('tag', 'f', 'bal', 'ax-balance', cwd=repo)
    wm = Path(cru('merge', 'f', 'm', 'base', 'ax-visual', 'ax-balance', cwd=repo))
    assert (wm / 'art' / 'a.png').exists() and (wm / 'numbers.txt').read_text() == '1\n'
    wfe = Path(cru('worktree', 'f', 'fe', 'base', cwd=repo))
    (wfe / 'numbers.txt').write_text('2\n')
    cru('tag', 'f', 'fe', 'ax-feel', cwd=repo)
    bad = subprocess.run([sys.executable, str(S), 'merge', 'f', 'm2', 'base', 'ax-balance', 'ax-feel'], cwd=repo, capture_output=True, text=True)
    assert bad.returncode == 1 and 'numbers.txt' in bad.stdout, bad.stdout + bad.stderr

    # port slots: explicit slot for names outside a..e, a clear error otherwise
    assert int(cru('port', 'f', 'r2-f', '3', cwd=repo)) - p0 == 3
    assert int(cru('port', 'f', 'scaffold', cwd=repo)) - p0 == 9
    bad = subprocess.run([sys.executable, str(S), 'port', 'f', 'r2-f'], cwd=repo, capture_output=True, text=True)
    assert bad.returncode == 1 and 'slot' in bad.stderr, bad.stderr

    # per-axis best / plateau; bar_met only looks at that axis's musts
    st = json.loads((r / 'state.json').read_text())
    st['versions']['ax-visual'] = {'parent': 'base', 'round': 9, 'verdicts': {'c1': 'pass'}, 'evidence': {}, 'notes': ''}
    (r / 'state.json').write_text(json.dumps(st))
    (r / 'criteria.json').write_text(json.dumps({'feature': 'x', 'contested': [], 'criteria': [
        {'id': 'c1', 'type': 'check', 'text': 't', 'verify': 'true', 'axis': 'visual'},
        {'id': 'c2', 'type': 'rubric', 'text': 'u', 'verify': 'g', 'axis': 'balance'}]}))
    g1 = json.loads(cru('round-end', 'f', 'ax-visual', 'visual round', 'visual', cwd=repo))
    assert g1['bar_met'] is True and g1['stale'] == 0, g1
    g2 = json.loads(cru('round-end', 'f', 'ax-visual', '', 'visual', cwd=repo))
    assert g2['stale'] == 1 and g2['axis'] == 'visual', g2
    st = json.loads((r / 'state.json').read_text())
    assert st['axes']['visual']['best'] == 'ax-visual' and st['best_tag'] == 'r1-b', 'axis must not move the global best'

    # gallery stays far under the 16MB Artifact limit: big screenshots are inlined as small thumbnails
    try:
        from PIL import Image
        import os as _os
        Image.frombytes('RGB', (1600, 1600), _os.urandom(1600 * 1600 * 3)).save(r / 'shots' / 'ax-visual.png')
        assert (r / 'shots' / 'ax-visual.png').stat().st_size > 5_000_000
        size = Path(cru('gallery', 'f', cwd=repo)).stat().st_size
        assert size < 600_000, size
    except ImportError:
        pass

print('ok')
