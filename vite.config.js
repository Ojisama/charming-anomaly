import { defineConfig } from 'vite'
import { execSync } from 'node:child_process'

// Build stamp (v5.17). Derived from git AT BUILD TIME, never hand-maintained: a version string you
// have to remember to bump is a version string that eventually lies, and the entire point of this
// one is to be trusted when someone says "I still see the old behaviour". It answers exactly one
// question — is the code in front of me the code that was pushed?
//   - the vX.Y.Z from the HEAD commit subject (this repo's release convention, see CLAUDE.md)
//   - the short SHA, which is the part that cannot be duplicated or guessed
// When HEAD is NOT a release commit — a chore, a docs-only push, a merge — the honest answer is the
// most recent release in HEAD's ancestry, suffixed '+' to say there are commits after it. That
// fallback used to be the literal 'dev', which threw away the version for anyone reading the live
// page and twice made a successful deploy look like a failed one. Only a build with no git at all
// (a tarball) still says 'dev'.
function buildStamp() {
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    const at = (s) => s.match(/^(v\d+\.\d+(?:\.\d+)?)(?=[:\s]|$)/)?.[1]
    const head = at(execSync('git log -1 --pretty=%s', { encoding: 'utf8' }).trim())
    if (head) return `${head} · ${sha}`
    const last = at(execSync("git log -1 -E --grep='^v[0-9]+\\.[0-9]+' --pretty=%s", { encoding: 'utf8' }).trim())
    return `${last ? last + '+' : 'dev'} · ${sha}`
  } catch {
    return 'dev'
  }
}

// THE WHOLE FEATURE'S KILL SWITCH for cloud save sync (tech strategy §1). Setting this to an
// empty string disables it at the module level — sync.js early-returns from every entry point
// and ui.js draws nothing — so "turn it off" stays a one-word change and never a revert.
// SYNC_URL= in the environment overrides it, which is how a fork or a local build opts out.
//
// Same Worker and same origin as the leaderboard (scores.js's SCORES_URL), so turning this on
// provisioned nothing new. It is LIVE but not yet public: ui.js keeps the entry point behind
// meta.dev in a production build, so the owner can walk two real devices against the deployed
// URL — which is the one part of slice 4 that cannot be done on localhost — before any player
// meets it.
const SYNC_URL = process.env.SYNC_URL ?? 'https://charming-anomaly-sync.ojisama-san.workers.dev/v1/save'

export default defineConfig({
  base: './',
  define: { __BUILD_STAMP__: JSON.stringify(buildStamp()), __SYNC_URL__: JSON.stringify(SYNC_URL) },
  // inlineDynamicImports: Pixi v8 auto-detects its environment via dynamic import;
  // as a split chunk it never loads in prod (app.init() hangs on a blank page).
  build: { target: 'es2022', rolldownOptions: { output: { inlineDynamicImports: true } } },
  server: { host: true },
})
