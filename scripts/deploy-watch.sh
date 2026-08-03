#!/bin/sh
# Watch the Pages deploy until completion, then grep the live bundle for each expected string.
# Usage: scripts/deploy-watch.sh "v6.4.5 · b19a30f" ["more strings" ...]
for i in $(seq 1 30); do
  sleep 20
  s=$(gh run list --workflow=deploy.yml --limit 1 --json status,conclusion,headSha --jq '.[0] | "\(.status):\(.conclusion):\(.headSha[0:7])"')
  echo "$s"
  case "$s" in completed:*) break;; esac
done
js=$(curl -s https://ojisama.github.io/charming-anomaly/ | grep -oP 'assets/index-[^"]+\.js' | head -1)
bundle=$(curl -s "https://ojisama.github.io/charming-anomaly/$js")
echo "bundle: $js"
for want in "$@"; do
  printf '%s: %s\n' "$want" "$(printf '%s' "$bundle" | grep -cF "$want")"
done
