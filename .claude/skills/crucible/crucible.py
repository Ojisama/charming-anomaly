#!/usr/bin/env python3
"""Crucible deterministic steps. Called by the orchestrator (see SKILL.md).

  init <slug> [resume]                 create run dir, exclude it, state.json (+ port block), tag HEAD as <slug>/base
  port <slug> <name> [slot]            fixed port slot: base +0, *-a..e +1..5, x +6, best +7, merge +8, scaffold +9 (or explicit slot)
  free-ports <slug>                    kill whatever listens on the run's 10-port block
  worktree <slug> <name> <ref>         worktree at <run>/wt/<name> on ref (reset if it exists) + bench copied in
  tag <slug> <name> <version>          snapshot worktree (bench files excluded) -> tag crucible/<slug>/<version>
  check <slug> <name>                  copy pristine bench over worktree, run check criteria x3
  scope <slug> <name> <axis>           ok | files changed outside the axis paths (exit 1); run before tag
  overlap <slug>                       axis pairs whose paths overlap -> must run one after the other
  merge <slug> <name> <base> <v1> <v2>...  worktree on base with each version merged in; conflict -> files, exit 1
  record <slug> <version> <parent|-> <verdicts.json>
  better <slug> <cand> <best>          yes | no | tie   (strict superset of passing musts)
  round-end <slug> <best> [log]        -> {round, stale, plateau, bar_met}
  gallery <slug>                       write <run>/gallery.html
"""
import base64, fnmatch, hashlib, html, json, os, shutil, signal, socket, subprocess, sys
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


def musts(r, axis=None):
    return [c['id'] for c in load(r / 'criteria.json')['criteria']
            if c['type'] != 'compare' and (axis is None or c.get('axis') == axis)]


def free(port):
    with socket.socket() as s:
        return s.connect_ex(('127.0.0.1', port)) != 0


def pick_port(r):
    # ponytail: deterministic block per (repo, slug) + skip blocks claimed in this repo or in use; cross-repo runs only collide if both hash alike AND neither is listening yet
    taken = set()
    for p in r.parent.glob('*/state.json'):
        try:
            taken.add(load(p).get('port'))
        except ValueError:  # another run is writing it right now
            pass
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
        git('tag', '-f', f'crucible/{slug}/base', 'HEAD')  # pin the base: the user may commit mid-run
        save(r / 'state.json', {'slug': slug, 'port': pick_port(r), 'round': 0, 'best_tag': None, 'stale': 0, 'versions': {},
                                'anchors': [], 'human_pick': None, 'pending_questions': [], 'artifact_url': None})
    print(r)


SLOTS = {'base': 0, 'x': 6, 'best': 7, 'merge': 8, 'scaffold': 9}


def port(slug, name, slot=None):
    p = load(run_dir(slug) / 'state.json')['port']
    if slot is not None:
        k = int(slot)
    elif name in SLOTS:
        k = SLOTS[name]
    elif len(name) > 1 and name[-2] == '-' and name[-1] in 'abcde':
        k = 1 + 'abcde'.index(name[-1])
    else:
        sys.exit(f'crucible: no fixed slot for "{name}"; pass one: port {slug} {name} <slot 0-9>')
    print(p + k)


def free_ports(slug):
    p = load(run_dir(slug) / 'state.json')['port']
    subprocess.run(['fuser', '-s', '-k', *[f'{p + k}/tcp' for k in range(10)]], capture_output=True)


def bench_files(r):
    return [str(f.relative_to(r / 'bench')) for f in (r / 'bench').rglob('*') if f.is_file()]


def worktree(slug, name, ref):
    print(_worktree(slug, name, ref))


def _worktree(slug, name, ref):
    wt, ref = run_dir(slug) / 'wt' / name, ref_of(slug, ref)
    if wt.exists():
        git('reset', '-q', '--hard', ref, cwd=wt)
        git('clean', '-fdq', cwd=wt)  # no -x: ignored deps (node_modules...) survive between rounds
    else:
        git('worktree', 'add', '-q', '--detach', str(wt), ref)
    shutil.copytree(run_dir(slug) / 'bench', wt, dirs_exist_ok=True)  # implementer can run the checks
    return wt


def changed(r, wt):
    out = git('status', '--porcelain', '-uall', cwd=wt).splitlines()
    bench = set(bench_files(r))
    return sorted({ln[3:].split(' -> ')[-1] for ln in out} - bench)


def scope(slug, name, axis):
    r = run_dir(slug)
    # ponytail: fnmatch globs ('*' also crosses '/'), enough for "src/render/*"-style axis paths
    pats = load(r / 'criteria.json')['axes'][axis]['paths']
    out = [f for f in changed(r, r / 'wt' / name) if not any(fnmatch.fnmatch(f, p) for p in pats)]
    if out:
        print('outside axis ' + axis + ': ' + ' '.join(out))
        sys.exit(1)
    print('ok')


def prefix(pat):
    return next((pat[:i] for i, ch in enumerate(pat) if ch in '*?['), pat)


def overlap(slug):
    axes = load(run_dir(slug) / 'criteria.json').get('axes', {})
    names, out = list(axes), []
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            if axes[a].get('after') == b or axes[b].get('after') == a:
                continue  # already sequential
            hits = [f'{x} ~ {y}' for x in axes[a]['paths'] for y in axes[b]['paths']
                    if prefix(x).startswith(prefix(y)) or prefix(y).startswith(prefix(x))]
            if hits:
                out.append(f'{a} {b}: ' + ', '.join(hits))
    print('\n'.join(out) or 'none')


def ident(wt):
    has_id = subprocess.run(['git', 'config', 'user.email'], cwd=wt, capture_output=True, text=True).stdout.strip()
    # snapshots are local-only: never block an unattended run on a GPG pinentry
    return ([] if has_id else ['-c', 'user.name=crucible', '-c', 'user.email=crucible@localhost']) + ['-c', 'commit.gpgsign=false']


def merge(slug, name, base, *versions):
    wt = _worktree(slug, name, base)
    for v in versions:
        try:
            git(*ident(wt), 'merge', '-q', '--no-ff', '--no-edit', ref_of(slug, v), cwd=wt)
        except subprocess.CalledProcessError:
            files = git('diff', '--name-only', '--diff-filter=U', cwd=wt).split()
            subprocess.run(['git', 'merge', '--abort'], cwd=wt, capture_output=True)
            print(f'conflict merging {v}: ' + ' '.join(files))
            sys.exit(1)
    print(wt)


def tag(slug, name, version):
    r = run_dir(slug)
    wt = r / 'wt' / name
    git('add', '-A', cwd=wt)
    bench = [f for f in bench_files(r) if (wt / f).exists()]
    if bench:  # crucible's own test files never end up in a version the user may merge
        git('reset', '-q', '--', *bench, cwd=wt)
    git(*ident(wt), 'commit', '-q', '--no-verify', '--allow-empty', '-m', f'crucible {slug} {version}', cwd=wt)
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
            for _ in range(c.get('runs', 3)):  # flaky = fail; seeded deterministic checks can set runs: 1
                p = subprocess.Popen(c['verify'], shell=True, cwd=wt, stdout=log, stderr=subprocess.STDOUT,
                                     start_new_session=True)
                try:
                    ok = p.wait(timeout=c.get('timeout', 900)) == 0
                except subprocess.TimeoutExpired:
                    ok = False
                finally:  # kill the whole group: a server started by the check must not keep its port
                    try:
                        os.killpg(p.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    p.wait()
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
            v['verdicts'][k] = x.get('verdict', 'unknown') if isinstance(x, dict) else x
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


def round_end(slug, best, log='', axis=None):
    r = run_dir(slug)
    st = load(r / 'state.json')
    node = st.setdefault('axes', {}).setdefault(axis, {'best': None, 'stale': 0, 'round': 0}) if axis else None
    if node is None:
        st['stale'] = 0 if best != st['best_tag'] else st['stale'] + 1
        st['best_tag'] = best
    else:  # an axis keeps its own best and plateau counter; st.round stays the run-wide budget
        node['stale'] = 0 if best != node['best'] else node['stale'] + 1
        node['best'] = best
        node['round'] += 1
    st['round'] += 1
    save(r / 'state.json', st)
    if log:
        with open(r / 'log.md', 'a') as f:
            f.write(f'## Round {st["round"]}{" · " + axis if axis else ""}\n\n{log}\n\n')
    stale = node['stale'] if node else st['stale']
    ms = set(musts(r, axis))
    out = {'round': st['round'], 'stale': stale, 'plateau': stale >= 2,
           'bar_met': {i for i in ms if st['versions'][best]['verdicts'].get(i) == 'pass'} == ms}
    if axis:
        out['axis'] = axis
    print(json.dumps(out))


CSS = """
/* Layout: run status band on top, then versions as the main grid, criteria matrix and references below. */
:root{
  --bg:#eceef0; --surface:#f8f9fa; --ink:#1a1f26; --muted:#5f6873; --line:#d3d8de;
  --ember:#c4511a; --ember-soft:#f6dccd;
  --pass:#2f8a4e; --fail:#c23b3b; --unk:#a7a08f;
  --f-display:"Bricolage Grotesque","Segoe UI",system-ui,sans-serif;
  --f-body:"IBM Plex Sans",system-ui,sans-serif;
  --f-mono:"IBM Plex Mono",ui-monospace,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#121518; --surface:#1b1f24; --ink:#e7e3dc; --muted:#98a0a9; --line:#2d333a;
  --ember:#f08a46; --ember-soft:#3a2418; --pass:#54b876; --fail:#e26a6a; --unk:#7d7768; color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:#121518; --surface:#1b1f24; --ink:#e7e3dc; --muted:#98a0a9; --line:#2d333a;
  --ember:#f08a46; --ember-soft:#3a2418; --pass:#54b876; --fail:#e26a6a; --unk:#7d7768; color-scheme:dark}
body{background:var(--bg);color:var(--ink);font:15px/1.55 var(--f-body)}
main{max-width:1180px;margin:0 auto;padding-inline:16px;padding-block:20px 48px;display:grid;gap:28px}
h1,h2{font-family:var(--f-display);text-wrap:balance;margin:0}
h1{font-size:clamp(26px,4vw,38px);font-weight:700;letter-spacing:-.01em}
h2{font-size:15px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
section{display:grid;gap:12px;min-width:0}
.mono{font-family:var(--f-mono);font-size:12.5px}
.muted{color:var(--muted)}
.band{display:grid;gap:14px;padding-block:6px 18px;border-bottom:2px solid var(--ink)}
.band-top{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:10px 20px}
.pill{display:inline-flex;align-items:center;gap:8px;font:600 13px var(--f-body);padding:4px 12px;border-radius:999px;background:var(--ember-soft);color:var(--ember)}
.pill::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor}
.stats{display:flex;flex-wrap:wrap;gap:8px 32px}
.stat{display:grid}
.stat b{font:600 22px var(--f-display);font-variant-numeric:tabular-nums}
.stat span{font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
details>summary{cursor:pointer;color:var(--muted);font-size:13.5px}
details p{max-width:72ch;margin:.6em 0 0}
.ask{border-left:4px solid var(--ember);background:var(--surface);padding:12px 16px;display:grid;gap:6px}
.ask ul{margin:0;padding-left:1.2em}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:16px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:8px;overflow:hidden;display:grid;grid-template-rows:auto 1fr;align-self:start;min-width:0}
.card.best{border-color:var(--ember);box-shadow:0 0 0 1px var(--ember)}
.shot{position:relative;overflow:hidden;aspect-ratio:16/10;background:var(--line);display:grid;place-items:center;color:var(--muted);font-size:13px;max-width:100%}
.shot img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top;display:block}
.body{padding:12px 14px 14px;display:grid;gap:10px;align-content:start;min-width:0}
.head{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px}
.tag{font:700 18px var(--f-display)}
.badge{font-size:11.5px;font-weight:600;padding:1px 8px;border-radius:4px;border:1px solid var(--line);color:var(--muted)}
.badge.hot{background:var(--ember);border-color:var(--ember);color:var(--surface)}
.meter{display:flex;gap:3px}
.meter i{flex:1;height:8px;border-radius:2px;background:var(--unk)}
.meter i.pass{background:var(--pass)} .meter i.fail{background:var(--fail)}
.score{display:flex;justify-content:space-between;font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.gap{font-size:13.5px;margin:0}
.gap b{font-weight:600}
.copy{display:flex;gap:6px;align-items:center;min-width:0}
.copy code{flex:1;min-width:0;overflow-x:auto;white-space:nowrap;padding:5px 8px;border-radius:4px;background:var(--bg);font:12px var(--f-mono)}
button{font:600 12px var(--f-body);padding:5px 10px;border-radius:4px;border:1px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer}
button:focus-visible,summary:focus-visible{outline:2px solid var(--ember);outline-offset:2px}
.empty{padding:28px;border:1px dashed var(--line);border-radius:8px;color:var(--muted);text-align:center}
.scroll{overflow-x:auto;border:1px solid var(--line);border-radius:8px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
tr:last-child td{border-bottom:0}
th{font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);white-space:nowrap}
td.v{text-align:center;width:56px}
.dot{display:inline-block;width:12px;height:12px;border-radius:50%;background:var(--unk)}
.dot.pass{background:var(--pass)} .dot.fail{background:var(--fail)} .dot.none{background:transparent;border:1px dashed var(--line)}
.crit summary{color:var(--ink);font-size:13.5px} .crit summary b{font-family:var(--f-mono);font-weight:500;color:var(--muted);margin-right:6px}
.crit p{color:var(--muted);font-size:13px}
.kind{font:11px var(--f-mono);color:var(--muted);white-space:nowrap}
.contested{color:var(--ember);font-weight:600;font-size:12px}
.refs{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:12px}
.refs figure{margin:0;display:grid;gap:6px}
.refs img{width:100%;border-radius:6px;border:1px solid var(--line)}
.refs figcaption{font:12px var(--f-mono);color:var(--muted)}
.log{white-space:pre-wrap;font-size:13.5px;max-width:80ch;margin:.6em 0 0}
@media (prefers-reduced-motion:no-preference){.card{transition:transform .15s}.card:hover{transform:translateY(-2px)}}
"""


def short(text):
    head = text.split(':', 1)[0]
    if ':' in text and len(head) <= 48:
        return head
    return text if len(text) <= 70 else text[:68].rsplit(' ', 1)[0] + '…'


def img_uri(p):
    # one self-contained page under the 16MB Artifact cap: inline a ~720px JPEG thumbnail (Pillow), raw file if Pillow is missing
    try:
        import io
        from PIL import Image
        im = Image.open(p)
        im.thumbnail((720, 720))
        buf = io.BytesIO()
        im.convert('RGB').save(buf, 'JPEG', quality=75)
        return f'data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode()}'
    except ImportError:
        return f'data:image/{p.suffix[1:]};base64,{base64.b64encode(p.read_bytes()).decode()}'


def gallery(slug):
    r = run_dir(slug)
    st, cfg = load(r / 'state.json'), load(r / 'criteria.json')
    e, ms = html.escape, musts(r)
    crit = cfg['criteria']
    best = st['best_tag']
    tags = sorted(st['versions'], key=lambda t: (t != best, -st['versions'][t]['round'], t))
    passing_best = best and all(st['versions'][best]['verdicts'].get(i) == 'pass' for i in ms)
    if not tags:
        status = 'Préparation'
    elif passing_best:
        status = 'Barre atteinte'
    elif st['stale'] >= 2:
        status = 'Plateau'
    else:
        status = f'Tour {st["round"] + 1} en cours'
    stats = [(st['round'], 'tours finis'), (len(tags), 'versions'), (e(best) if best else '—', 'meilleure'),
             (st['stale'], 'tours sans progrès'), (f'{len(ms)} + {len(crit) - len(ms)}', 'must + compare')]
    stats += [(e(n['best'] or '—'), f'meilleure · {e(a)}') for a, n in st.get('axes', {}).items()]
    stats_html = ''.join(f'<div class="stat"><b>{v}</b><span>{k}</span></div>' for v, k in stats)
    qs = st['pending_questions']
    ask = (f'<section class="ask" aria-label="Questions"><h2>À trancher par toi</h2><ul>'
           + ''.join(f'<li>{e(q)}</li>' for q in qs) + '</ul></section>') if qs else ''

    cards = ''
    for t in tags:
        v = st['versions'][t]
        img = next((p for p in (r / 'shots' / f'{t}.png', r / 'shots' / f'{t}.gif') if p.exists()), None)
        shot = f'<img alt="Capture de {e(t)}" src="{img_uri(img)}">' if img else 'pas encore de capture'
        badges = ''.join(f'<span class="badge{" hot" if hot else ""}">{e(b)}</span>' for b, hot in
                         ((('meilleure', True),) if t == best else ()) + ((('ton choix', True),) if t == st.get('human_pick') else ())
                         + (((f'depuis {v["parent"]}', False),) if v.get('parent') else ()))
        segs = ''.join(f'<i class="{v["verdicts"].get(i, "")}" title="{e(i)}"></i>' for i in ms)
        n = sum(v['verdicts'].get(i) == 'pass' for i in ms)
        gap = f'<p class="gap"><b>Plus gros manque :</b> {e(v["notes"])}</p>' if v.get('notes') else ''
        cmd = f'git checkout crucible/{e(slug)}/{e(t)}'
        cards += (f'<article class="card{" best" if t == best else ""}"><div class="shot">{shot}</div><div class="body">'
                  f'<div class="head"><span class="tag">{e(t)}</span>{badges}</div>'
                  f'<div><div class="meter">{segs}</div><div class="score"><span>{n}/{len(ms)} must</span><span>tour {v["round"]}</span></div></div>'
                  f'{gap}<div class="copy"><code>{cmd}</code><button type="button" data-copy="{cmd}">Copier</button></div></div></article>')
    if not cards:
        cards = '<div class="empty">Les versions apparaîtront ici dès que les implémenteurs du tour 1 rendent leur travail.</div>'
    else:
        cards = f'<div class="cards">{cards}</div>'

    head = '<tr><th>Critère</th><th>Type</th>' + ''.join(f'<th class="v">{e(t)}</th>' for t in tags) + '</tr>'
    rows = ''
    for c in crit:
        flag = ' <span class="contested">contesté</span>' if c['id'] in cfg.get('contested', []) else ''
        cells = ''.join(
            '<td class="v"><span class="dot none" title="jugé dans le journal"></span></td>' if c['type'] == 'compare' else
            f'<td class="v"><span class="dot {st["versions"][t]["verdicts"].get(c["id"], "")}" title="{e(st["versions"][t]["verdicts"].get(c["id"], "pas encore noté"))}"></span></td>'
            for t in tags)
        rows += (f'<tr><td class="crit"><details><summary><b>{e(c["id"])}</b>{e(short(c["text"]))}{flag}</summary>'
                 f'<p>{e(c["text"])}</p></details></td><td class="kind">{e(c["type"])}</td>{cells}</tr>')

    refs = sorted(r.glob('shots/anchor*.*'))
    refs_html = ('<section><h2>Références</h2><div class="refs">' + ''.join(
        f'<figure><img alt="{e(p.stem)}" src="{img_uri(p)}"><figcaption>{e(p.stem.removeprefix("anchor-"))}</figcaption></figure>'
        for p in refs) + '</div></section>') if refs else ''
    log = (r / 'log.md').read_text() if (r / 'log.md').exists() else ''
    log_html = f'<details><summary>Journal des tours</summary><div class="log">{e(log)}</div></details>' if log else ''

    page = (f'<title>Crucible {e(slug)}</title>'
            '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Mono&family=IBM+Plex+Sans:wght@400;600&display=swap">'
            f'<style>{CSS}</style><main>'
            f'<header class="band"><div class="band-top"><h1>Crucible · {e(slug)}</h1><span class="pill">{status}</span></div>'
            f'<div class="stats">{stats_html}</div>'
            f'<details><summary>La feature</summary><p>{e(cfg.get("feature", ""))}</p></details></header>'
            f'{ask}<section><h2>Versions</h2>{cards}</section>'
            f'<section><h2>Critères</h2><div class="scroll"><table>{head}{rows}</table></div></section>'
            f'{refs_html}{log_html}</main>'
            '<script>document.addEventListener("click",ev=>{const b=ev.target.closest("[data-copy]");if(!b)return;'
            'const done=()=>{b.textContent="Copié";setTimeout(()=>b.textContent="Copier",1500)};'
            'navigator.clipboard.writeText(b.dataset.copy).then(done,()=>{const c=b.previousElementSibling;'
            'const s=getSelection();const g=document.createRange();g.selectNodeContents(c);s.removeAllRanges();s.addRange(g)})})</script>')
    (r / 'gallery.html').write_text(page)
    print(r / 'gallery.html')


if __name__ == '__main__':
    cmds = {'init': init, 'port': port, 'free-ports': free_ports, 'worktree': worktree, 'tag': tag, 'check': check,
            'scope': scope, 'overlap': overlap, 'merge': merge, 'record': record, 'better': better,
            'round-end': round_end, 'gallery': gallery}
    if len(sys.argv) < 2 or sys.argv[1] not in cmds:
        print(__doc__)
        sys.exit(0 if sys.argv[1:2] in ([], ['--help'], ['-h']) else 1)
    cmds[sys.argv[1]](*sys.argv[2:])
