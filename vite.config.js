import { defineConfig } from 'vite'
import { execSync } from 'node:child_process'

// Build stamp (v5.17). Derived from git AT BUILD TIME, never hand-maintained: a version string you
// have to remember to bump is a version string that eventually lies, and the entire point of this
// one is to be trusted when someone says "I still see the old behaviour". It answers exactly one
// question — is the code in front of me the code that was pushed?
//   - the vX.Y.Z from the HEAD commit subject (this repo's release convention, see CLAUDE.md)
//   - the short SHA, which is the part that cannot be duplicated or guessed
// Falls back to 'dev' outside a git checkout so a tarball build still boots.
function buildStamp() {
  try {
    const subject = execSync('git log -1 --pretty=%s', { encoding: 'utf8' }).trim()
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    const tag = subject.match(/^(v\d+\.\d+(?:\.\d+)?)/)?.[1] ?? 'dev'
    return `${tag} · ${sha}`
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  base: './',
  define: { __BUILD_STAMP__: JSON.stringify(buildStamp()) },
  // inlineDynamicImports: Pixi v8 auto-detects its environment via dynamic import;
  // as a split chunk it never loads in prod (app.init() hangs on a blank page).
  build: { target: 'es2022', rollupOptions: { output: { inlineDynamicImports: true } } },
  server: { host: true },
})
