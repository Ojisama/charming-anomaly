#!/usr/bin/env node
// Release to main without ever choosing a version number by hand.
//
//   node scripts/ship.mjs "what changed and why, in one plain sentence"
//   node scripts/ship.mjs                      # reuse HEAD's own subject as the prose
//   node scripts/ship.mjs "…" --patch          # default is --minor; --major also accepted
//   node scripts/ship.mjs "…" --dry-run        # print the version and subject, touch nothing
//
// Why this exists. The build stamp is regexed out of HEAD's commit subject, so a vX.Y.Z has to
// exist by the time you push — and an agent that picks one when it STARTS work picks it hours
// before main is next read. Two of them then ship the same number (v6.7.6 and v6.7.7 each shipped
// twice on 2026-08-09) and a published duplicate cannot be fixed afterwards. This closes the
// window to the seconds between fetch and push: read main, take the next free number, label HEAD
// with it, push. Lose even that race and it unlabels (that number was never published), merges what
// landed, takes the number that is free NOW, and tries again — up to three times.
//
// It labels HEAD by AMENDING it, which is also why the old "release commit must be last, land
// chores first, never leave a merge at HEAD" choreography is gone: whatever HEAD is when you ship,
// including a merge commit, comes out carrying the version.

import { spawnSync } from 'node:child_process'
import assert from 'node:assert'

const VERSION_RE = /^v(\d+)\.(\d+)(?:\.(\d+))?(?=[:\s]|$)/

const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

// The highest version mentioned in `subjects`, bumped. Reads a LIST rather than one subject so the
// caller can hand it the union of main and the local branch — the branch may already carry a label
// from a previous attempt, and that number must count as taken.
export function nextVersion(subjects, level = 'minor') {
  let best = [0, 0, 0]
  for (const s of subjects) {
    const m = VERSION_RE.exec(s)
    if (m) {
      const v = [+m[1], +m[2], +(m[3] ?? 0)]
      if (cmp(v, best) > 0) best = v
    }
  }
  const [M, m, p] = best
  if (level === 'major') return `v${M + 1}.0.0`
  if (level === 'patch') return `v${M}.${m}.${p + 1}`
  return `v${M}.${m + 1}.0`
}

export const stripVersion = (subject) => subject.replace(VERSION_RE, '').replace(/^\s*:\s*/, '').trim()

// spawnSync, not execSync: subjects carry apostrophes and em-dashes, and shell quoting them is a
// bug waiting to happen.
function git(...args) {
  const r = spawnSync('git', args, { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}\n${(r.stderr || r.stdout || '').trim()}`)
  return r.stdout.trim()
}

const die = (msg) => { console.error(`ship: ${msg}`); process.exit(1) }

function selftest() {
  const next = (subs, lvl) => nextVersion(subs, lvl)
  assert.equal(next(['v7.6.0: three more anomaly cards', 'chore: French'], 'minor'), 'v7.7.0')
  assert.equal(next(['v7.6.0: x'], 'patch'), 'v7.6.1')
  assert.equal(next(['v7.6.0: x'], 'major'), 'v8.0.0')
  // highest wins regardless of log order, and 10 > 9 numerically, not lexically
  assert.equal(next(['v7.10.0: x', 'v7.9.0: y'], 'minor'), 'v7.11.0')
  assert.equal(next(['v7.9.0: y', 'v7.10.0: x'], 'minor'), 'v7.11.0')
  // two-part versions exist in this history (v5.11); they mean .0
  assert.equal(next(['v5.11: x'], 'patch'), 'v5.11.1')
  // a branch label already burned counts as taken — this is what stops the retry duplicating
  assert.equal(next(['v7.6.0: on main', 'v7.7.0: burned locally'], 'minor'), 'v7.8.0')
  // non-releases are ignored, and a bare vN prefix that isn't a version doesn't match
  assert.equal(next(['chore: x', 'fix: y', 'video: z'], 'minor'), 'v0.1.0')
  assert.equal(stripVersion('v7.6.0: three more cards'), 'three more cards')
  assert.equal(stripVersion('three more cards'), 'three more cards')
  assert.equal(stripVersion(stripVersion('v7.6.0: x')), 'x')
  console.log('ship selftest OK')
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--selftest')) return selftest()
  const dryRun = args.includes('--dry-run')
  const level = args.find((a) => /^--(patch|minor|major)$/.test(a))?.slice(2) ?? 'minor'
  const given = args.filter((a) => !a.startsWith('--')).join(' ').trim()

  const dirty = git('status', '--porcelain')
  if (dirty && !dryRun) die(`working tree is not clean — commit or delete these first:\n${dirty}`)

  const prose = stripVersion(given || git('log', '-1', '--pretty=%s'))
  if (!prose) die('no subject — pass one as an argument')

  git('fetch', '-q', 'origin', 'main')
  if (git('rev-list', '--count', 'origin/main..HEAD') === '0') die('nothing to ship — HEAD is already on main')

  for (let attempt = 1; ; attempt++) {
    const version = nextVersion(git('log', '--pretty=%s', '-n', '500', 'origin/main', 'HEAD').split('\n'), level)
    if (dryRun) {
      console.log(`would ship: ${version}: ${prose}`)
      console.log(`  (${git('rev-list', '--count', 'origin/main..HEAD')} commit(s) ahead of main, ${level} bump)`)
      return
    }
    git('commit', '--amend', '-m', `${version}: ${prose}`)
    try {
      git('push', 'origin', 'HEAD:main')
      const sha = git('rev-parse', '--short', 'HEAD')
      console.log(`shipped ${version} · ${sha}`)
      console.log(`  scripts/deploy-watch.sh "${version} · ${sha}"`)
      return
    } catch (e) {
      if (attempt === 3) die(`push rejected 3 times — another release is landing right now. Re-run in a minute.\n${e.message}`)
      console.log('push rejected — merging what landed and renumbering')
      // Drop the label we just failed to publish before merging, so it doesn't survive as a
      // phantom release on the parent commit. Nothing ever saw that number; it goes back in the pool.
      git('commit', '--amend', '-m', prose)
      git('fetch', '-q', 'origin', 'main')
      try {
        git('merge', '--no-edit', 'origin/main')
      } catch {
        git('merge', '--abort')
        die('merge conflict with main — resolve it by hand, commit, then re-run')
      }
    }
  }
}

main()
