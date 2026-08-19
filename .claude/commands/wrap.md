---
description: Close out a feature — full suite, clean tree, ship, verify live, record what was learned, then clear.
---

Close this feature out. Work through it and report; stop and ask only if something is genuinely
ambiguous.

1. **Full suite, no filter.** `npm test`. A filtered run is not a ship gate — it prints what it
   skipped on the last line for a reason. If you added a scenario or changed how many randoms are
   drawn, also run `node scripts/test-isolation.mjs`.

2. **Clean the tree.** `git status --short`. `.gitignore` only covers a `.png` at the repo ROOT —
   a PNG in a subdirectory, a JSON dump, a screenshot in any other format is tracked. Delete every
   scratch artifact explicitly rather than trusting the ignore rule.

3. **Read what you are about to publish.** `git log --oneline origin/main..HEAD` — actually read
   the list, do not just confirm it is short. If a push is rejected, diff before reconciling:
   `origin/<branch>` may carry another session's unshipped work, and git's suggested `git pull`
   would merge it into what you are one command away from publishing. Never force-push.

4. **Ship.** `npm run ship "<one plain sentence about what changed and why>"` — never choose a
   version number. Write any reasoning on the commit BELOW the release, or push the branch first:
   ship amends HEAD with `-m` and destroys the body. Then verify with the exact
   `scripts/deploy-watch.sh "vX.Y.Z · <sha>"` line it prints, passing only strings that survive
   minification (user-visible copy, config text, French — never an identifier).
   Afterwards confirm `git log --oneline origin/main..HEAD` comes back empty.

5. **Record what would not be obvious next time.** One memory file per fact, only if it is not
   already in the repo, CLAUDE.md or git history — a lesson, a ruling, a trap, an owner preference.
   If a rule you just learned could be a test or a thrown error instead of a sentence, say so and
   propose it: a guard cannot be forgotten, a paragraph can. Prefer editing an existing memory over
   adding a near-duplicate.

6. **Then tell me to `/clear`.** This session has done its job; the next feature starts fresh.
   A session kept alive past its feature runs every later call at this context depth, and that —
   not output length — is where the tokens go.
