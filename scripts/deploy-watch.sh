#!/bin/sh
# Watch the Pages deploy until completion, then grep the live bundle for each expected string.
# Usage: scripts/deploy-watch.sh "v6.4.5 · b19a30f" ["more strings" ...]
for i in $(seq 1 30); do
  sleep 20
  s=$(gh run list --workflow=deploy.yml --limit 1 --json status,conclusion,headSha --jq '.[0] | "\(.status):\(.conclusion):\(.headSha[0:7])"')
  echo "$s"
  case "$s" in completed:*) break;; esac
done
# -oE, not -oP: the pattern needs no PCRE, and "grep -P" aborts outright under a non-UTF-8
# locale (Git Bash on Windows). It exited 2 leaving $js empty, the next curl fetched the SITE
# ROOT instead of the bundle, and every string came back 0 -- a post-push gate reporting that a
# deploy had not landed when it had. Any failure here must be loud; a 0 must mean genuinely absent.
js=$(curl -s https://ojisama.github.io/charming-anomaly/ | grep -oE 'assets/index-[^"]+\.js' | head -1)
[ -n "$js" ] || { echo "bundle: NO assets/index-*.js in the deployed index.html" >&2; exit 1; }
bundle=$(curl -sf "https://ojisama.github.io/charming-anomaly/$js") ||
  { echo "bundle: $js FAILED to fetch (mid-deploy? index.html can name a hash the CDN lacks)" >&2; exit 1; }
echo "bundle: $js"
for want in "$@"; do
  printf '%s: %s\n' "$want" "$(printf '%s' "$bundle" | grep -cF "$want")"
done
