#!/usr/bin/env bash
# Post-deploy smoke test against the DEPLOYED Worker. test.sh is the full suite and runs against
# `wrangler dev --local`; this is the subset that proves the same behaviour survives the real edge,
# the real D1 and the real rate-limit binding.
#
# WHY IT IS NOT JUST test.sh POINTED AT PROD: production allows 10 requests/60s per code, and the
# full suite fires ~30 at a single code. So the lifecycle is budgeted to 9 requests on one code, the
# 400-level checks get their own, and the limiter gets a third that it is SUPPOSED to throttle.
# Requests that 401 (malformed code) and OPTIONS cost nothing — the Worker rejects both before the
# limiter and before D1, which is itself part of what this asserts.
#
# Usage: ./smoke-live.sh [https://your-worker.workers.dev]
set -uo pipefail
HOST="${1:-https://charming-anomaly-sync.ojisama-san.workers.dev}"
BASE="$HOST/v1/save"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  PASS  %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  FAIL  %s\n        expected: %s\n        actual:   %s\n' "$1" "$2" "$3"; }
is()  { [ "$2" = "$3" ] && ok "$1" || bad "$1" "$2" "$3"; }

newcode() { LC_ALL=C tr -dc '0-9A-HJKMNP-TV-Z' </dev/urandom | head -c 16; }
call() { local m="$1"; shift; curl -s -o "/tmp/lv.$$" -w '%{http_code}' -X "$m" "$@" "$BASE"; printf '\n'; cat "/tmp/lv.$$"; printf '\n'; }
status() { call "$@" | head -1; }
field()  { local k="$1"; shift; call "$@" | tail -n +2 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);const v=o[process.argv[1]];console.log(v===null?"null":String(v))}catch{console.log("PARSE_ERROR")}})' "$k"; }
trap 'rm -f "/tmp/lv.$$"' EXIT

A=$(newcode); AUTH="Authorization: Bearer $A"
echo "Live smoke against $HOST"
echo "lifecycle code $A  (sha256 $(printf '%s' "$A" | sha256sum | cut -d' ' -f1))"
echo

echo "-- free requests: rejected before the limiter and before D1 --"
is "OPTIONS short-circuits"          204  "$(status OPTIONS)"
is "preflight caches for 2h"         7200 "$(curl -s -X OPTIONS -D- -o /dev/null "$BASE" | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-max-age"{print $2}')"
is "malformed code is 401"           401  "$(status GET -H 'Authorization: Bearer NOPE')"

echo "-- full lifecycle, budgeted to 9 requests on one code --"
is "1. unknown code is 404"          404  "$(status GET -H "$AUTH")"
is "2. first PUT accepted"           200  "$(status PUT -H "$AUTH" -H 'content-type: application/json' -d '{"baseGen":0,"blob":"{\"coins\":10}","savedAt":111,"device":"devA","reqId":"live-1"}')"
is "3. blob round-trips verbatim"    '{"coins":10}' "$(field blob GET -H "$AUTH")"
is "4. re-INSERT conflicts"          409  "$(status PUT -H "$AUTH" -H 'content-type: application/json' -d '{"baseGen":0,"blob":"x","savedAt":222,"device":"devB","reqId":"live-2"}')"
is "5. PUT at current gen accepted"  200  "$(status PUT -H "$AUTH" -H 'content-type: application/json' -d '{"baseGen":1,"blob":"{\"coins\":20}","savedAt":333,"device":"devB","reqId":"live-3"}')"
is "6. stale DELETE conflicts"       409  "$(status DELETE -H "$AUTH" -H 'content-type: application/json' -d '{"baseGen":1}')"
is "7. DELETE at current gen"        200  "$(status DELETE -H "$AUTH" -H 'content-type: application/json' -d '{"baseGen":2}')"
is "8. tombstone reads as null blob" null "$(field blob GET -H "$AUTH")"
is "9. repeat DELETE is idempotent"  200  "$(status DELETE -H "$AUTH" -H 'content-type: application/json' -d '{"baseGen":3}')"

echo "-- size and shape caps, on their own code --"
B=$(newcode); BAUTH="Authorization: Bearer $B"
BIG=$(head -c 5000 </dev/zero | tr '\0' 'a')
is "blob over 4KB is 400"            400  "$(status PUT -H "$BAUTH" -H 'content-type: application/json' -d "{\"baseGen\":0,\"blob\":\"$BIG\",\"savedAt\":1,\"device\":\"d\",\"reqId\":\"r\"}")"
is "unparseable envelope is 400"     400  "$(status PUT -H "$BAUTH" -H 'content-type: application/json' -d 'not json')"
is "non-string blob is 400"          400  "$(status PUT -H "$BAUTH" -H 'content-type: application/json' -d '{"baseGen":0,"blob":{"a":1},"savedAt":1,"device":"d","reqId":"r"}')"
is "nothing was written"             404  "$(status GET -H "$BAUTH")"

echo "-- the production rate limiter, on a throwaway code --"
# MEASURED 2026-08-04, and it is NOT a 10-per-60s counter: 40 SEQUENTIAL requests against one code
# drew zero 429s, while 30 PARALLEL ones drew two. That matches the documented design rather than
# contradicting it — Cloudflare states the binding is "permissive, eventually consistent, and
# intentionally designed to not be used as an accurate accounting system", with counters "cached on
# the same machine that your Worker runs in, and updated asynchronously in the background", and a
# separate limit per Cloudflare location.
#
# So assert the burst path, which is the only thing the platform actually promises. A sequential
# assertion would be testing a guarantee that does not exist, and would fail intermittently forever.
# The consequence for the design is recorded in §10 of the design doc: this filter stops concurrency
# bursts, NOT a paced attacker, so it does not meaningfully defend the 100k/day account budget.
# ENFORCEMENT IS DELIBERATELY NOT ASSERTED. Repeated runs gave 2-of-30 throttled, then 0-of-30, on
# identical bursts. An assertion either way would be flaky forever, and a flaky gate is worse than no
# gate: it trains you to re-run until green, which is how a real failure gets waved through. What IS
# asserted is that the binding is still CONFIGURED, so deleting it from wrangler.toml is caught.
is "the limiter is still declared"   10   "$(grep -oE 'limit *= *[0-9]+' wrangler.toml | grep -oE '[0-9]+')"
is "at the intended period"          60   "$(grep -oE 'period *= *[0-9]+' wrangler.toml | grep -oE '[0-9]+')"
# Reported, never gated — a number to eyeball, not a pass/fail.
C=$(newcode)
BURST=$(for _ in $(seq 1 30); do curl -s -o /dev/null -w '%{http_code}\n' -X GET -H "Authorization: Bearer $C" "$BASE" & done; wait)
echo "  INFO  30-way concurrent burst: $(echo "$BURST" | grep -c 429) of 30 throttled (best-effort by design; see §10)"
is "and an unrelated code is fine"   200  "$(status GET -H "$AUTH")"

echo "-- the leaderboard, against the deployed database --"
# THIS BLOCK EXISTS FOR ONE FAILURE, and it is the most likely one there is: deploying the Worker
# without having run `npm run db:remote`, so the `scores` table is absent. From inside the game that
# state is invisible — scores.js answers null on every failure, so a missing table, an offline
# phone and a genuinely empty board are one indistinguishable "no scores yet". Only a live probe can
# tell them apart, which is exactly what a post-deploy gate is for.
#
# It WRITES NOTHING. Every assertion here is a read or a rejected write, so running the gate can
# never put a row on a real player's podium.
SB="$HOST/scores"
sstat() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
# A chapter id no build has ever shipped, so an empty answer proves the table can be QUERIED rather
# than proving some real board happens to be empty.
is "a board reads 200, so the table exists"  200  "$(sstat "$SB?chapter=zzsmoke&difficulty=3")"
is "an unknown board is empty, not an error" '{"kills":[],"level":[],"time":[]}' "$(curl -s "$SB?chapter=zzsmoke&difficulty=3")"
is "and needs no pairing code"                200  "$(sstat "$SB?chapter=zzsmoke&difficulty=1")"
is "a malformed board is 400"                 400  "$(sstat "$SB?chapter=zzsmoke&difficulty=abc")"
# A rejected write, to prove validation is live without leaving anything behind.
is "a short nick is refused"                  400  "$(sstat -X POST -H 'content-type: application/json' \
  -d '{"nick":"Bo","chapter":"zzsmoke","difficulty":3,"kills":1,"level":1}' "$SB")"
is "and it wrote nothing"                     '{"kills":[],"level":[],"time":[]}' "$(curl -s "$SB?chapter=zzsmoke&difficulty=3")"
# The BOSS board, which is the one that needs the deployed database to have been MIGRATED and not
# merely created: `scores` predates the time_ms column, so a deploy without `npm run db:migrate:remote`
# leaves every SELECT naming an absent column — and the Worker's own catch turns that into a 500
# the game reports as "could not reach the podium". The read above already proves it (a 200 with a
# `time` key cannot come from a table without the column); this rejects a malformed time as well,
# so the validation added with the column is confirmed live without writing a row.
is "a zero kill time is refused"               400  "$(sstat -X POST -H 'content-type: application/json' \
  -d '{"nick":"Smoke","chapter":"zzsmoke","difficulty":3,"kills":1,"level":1,"timeMs":0}' "$SB")"
is "and it wrote nothing either"               '{"kills":[],"level":[],"time":[]}' "$(curl -s "$SB?chapter=zzsmoke&difficulty=3")"
# The save contract, after all of that: the two features share one Worker and one database, and this
# is the assertion that says so out loud.
is "save-sync is untouched by the above"      404  "$(status GET -H "$BAUTH")"

echo
echo "passed $PASS, failed $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
echo "LIVE SMOKE PASSED"
