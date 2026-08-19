---
name: shipping-a-release
description: Use before publishing anything from Charming Anomaly to the live URL, or before reconciling a branch with main — running `npm run ship`, pushing, handling a rejected push, writing a release subject or a commit body, or reading what a build stamp says. Carries the numbering race, the amend-destroys-the-body trap, and the pull-is-the-dangerous-fix rule. Triggers on "ship it", "release", "push to main", "npm run ship", "rejected push", "non-fast-forward", "what version", "deploy".
---

# Shipping Charming Anomaly

**Never choose a version number. `npm run ship` assigns it.** A release is a commit subject
`vX.Y.Z: <what changed and why, in one plain sentence>` (e.g. `v5.6.16: roar and tail swipe are
visible — their events were silently dropped`), but you write only the sentence.

```bash
npm run ship "<that sentence>"        # fetch main, take the next free number, amend HEAD, push
npm run ship                          # no argument: reuse HEAD's own subject
node scripts/ship.mjs "…" --patch     # flags need the bare form; --patch/--major override the
node scripts/ship.mjs "…" --dry-run   # default minor bump; --dry-run prints and touches nothing
```

Chores use `chore: …` and stay on your branch. Ship prints the exact
`scripts/deploy-watch.sh "vX.Y.Z · <sha>"` to verify with.

## Why ship picks the number, not you

An agent that picks a number when it STARTS work picks it hours before `main` is next read, and on
2026-08-09 `v6.7.6` and `v6.7.7` each shipped twice — a published duplicate is unfixable without
rewriting history. ship closes that window to the seconds between fetch and push, and if it loses
even that race it unlabels the number it never published, merges what landed, takes the number free
at that moment, and retries — so neither a duplicate nor a gap can reach the log.
(`scripts/ship.mjs --selftest` asserts the numbering; the race path was proven end-to-end against a
throwaway remote.) Expect the retry path to fire for real: it merged `main` and renumbered twice in
one afternoon while another session was shipping, which is working as designed — check
`git log --oneline origin/main..HEAD` comes back empty afterwards rather than assuming.

## Ship destroys the commit BODY

**Ship amends HEAD with `git commit --amend -m`, which replaces the WHOLE message — any BODY on that
commit is destroyed.** So write the reasoning where it survives: on the commits below the release,
or push the branch first (the pre-amend commit stays reachable there) and ship after.

**After ship, the branch you already pushed has DIVERGED** — ship amended HEAD, so your local branch
is no longer a descendant of its remote copy and a second `git push` is rejected as non-fast-forward.
Push the next commit to a NEW branch name (`git push origin HEAD:<name>-2`) rather than force-pushing;
the point of that push is only to keep the commit BODY reachable, so a fresh name costs nothing and
`--force` is never the answer.

## A rejected push is not always your own divergence — and git's suggested fix is the dangerous one

Branch names get reused across sessions here, so `origin/<your-branch>` can hold a feature commit you
have never seen. git's hint on the rejection says *"use 'git pull' before pushing again"* — do that on
a shared name and you have merged someone else's UNSHIPPED, untested work into the tree you are one
command away from publishing under your release number. On 2026-08-16 `origin/surf-weapons` carried
`e49e607` ("The Surf gets three native weapons"), absent from both `main` and the local branch of the
same name; a pull-then-ship would have put it on the live URL inside a release whose subject was about
a summary badge.

**Diff before you reconcile:** `git log --oneline HEAD..origin/<branch>` names exactly what the remote
has that you do not. If it is not yours, do not pull it — move your commits to a NEW branch
(`git switch -c <topic>`) and ship from there, leaving the other session's branch untouched.

The general rule: **`git log --oneline origin/main..HEAD` before shipping tells you what you are about
to publish, and it is the list you must actually READ**, not just confirm is short.

## `main` MOVES WHILE YOU WORK, AND IT CAN DELETE THE FUNCTION YOU ARE REWRITING

Several sessions ship to this repo concurrently. Checking `origin/main` once, at the start, is not
enough for anything that takes hours: on 2026-08-16 a per-book-progression branch spent a whole task
rewriting `titleChapterList` to walk every book, while another session **deleted that function
outright** and replaced it with `titleBookshelf`, which grouped by book natively and fixed the same
bug better. That task's production code and its four assertions were thrown away at merge time, and
`main` had advanced **13 versions** (v7.92→v7.98, a new chapter and a title-screen rework) since the
branch started.

`git fetch && git log --oneline HEAD..origin/main` costs one second. Run it: before you start
rewriting any shared function, again before you write the plan that assumes its shape, and again
before shipping. When the answer is "someone already did this, differently", **take theirs** —
resurrecting your version against a deleted function is how two designs end up half-merged.

## The build stamp

`buildStamp()` (`vite.config.js`) reads HEAD's subject, and when that isn't a release it falls back to
the most recent `vX.Y.Z` in HEAD's ancestry, marked `v7.7.0+ · <sha>` — the `+` meaning "there are
commits after that release". A `chore:`, a docs-only push or a merge commit at HEAD therefore stamps
honestly instead of `dev`, which is what killed the old land-the-chores-first choreography. It stamped
`dev` twice for real: v6.10.1 shipped to fix the chore form, and a CLAUDE.md-only push took the live
page from `v6.10.0 · 969a0e8` to `dev · 4f17cad` one command after that rule was written down. The sha
is still the part that cannot be duplicated or guessed.

Deploy is automatic: pushing to `main` triggers `.github/workflows/deploy.yml` (build → GitHub Pages).
