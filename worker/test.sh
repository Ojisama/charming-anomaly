#!/usr/bin/env bash
# Slice 1 self-check: curl assertions against `wrangler dev --local`. No Cloudflare account and no
# network — local D1 is a SQLite file under .wrangler/state. Starts the server, applies the schema,
# asserts, tears down. Run: ./test.sh   (from worker/)
#
# Each run mints a FRESH random code, so generations start from zero without wiping the database and
# two runs cannot collide.
#
# Runs against wrangler.test.toml, which differs from the deployed config in exactly one value: the
# rate limit, raised so ~30 functional requests against one code are not throttled. The production
# numbers are asserted from wrangler.toml below, and the enforcement path gets its own test.
set -uo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8787}"
BASE="http://127.0.0.1:$PORT/v1/save"
PASS=0; FAIL=0

# A valid Crockford code: 16 chars from the alphabet minus I, L, O and U.
CODE=$(LC_ALL=C tr -dc '0-9A-HJKMNP-TV-Z' </dev/urandom | head -c 16)
AUTH="Authorization: Bearer $CODE"
# The worker stores SHA-256(code) as the primary key, never the code. Recompute it here so the
# prev_blob assertion can address the row directly — no endpoint exposes that column.
ID=$(printf '%s' "$CODE" | sha256sum | cut -d' ' -f1)

ok()  { PASS=$((PASS+1)); printf '  PASS  %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  FAIL  %s\n        expected: %s\n        actual:   %s\n' "$1" "$2" "$3"; }
is()  { [ "$2" = "$3" ] && ok "$1" || bad "$1" "$2" "$3"; }

call() {
  local method="$1"; shift
  curl -s -o "/tmp/ca-body.$$" -w '%{http_code}' -X "$method" "$@" "$BASE"
  printf '\n'; cat "/tmp/ca-body.$$"; printf '\n'
}
status() { call "$@" | head -1; }
body()   { call "$@" | tail -n +2; }
# String(), not console.log(value): console.log on a number routes through util.inspect, which
# emits ANSI colour escapes that silently break every string comparison below.
field()  { local key="$1"; shift; body "$@" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);const v=o[process.argv[1]];console.log(v===null?"null":String(v))}catch{console.log("PARSE_ERROR:"+s.trim())}})' "$key"; }

cleanup() { [ -n "${DEV_PID:-}" ] && kill "$DEV_PID" 2>/dev/null; rm -f "/tmp/ca-body.$$" "/tmp/ca-dev.$$.log"; }
trap cleanup EXIT

echo "Applying schema to local D1..."
npx wrangler d1 execute charming-anomaly-sync --local --config wrangler.test.toml --file=./schema.sql >/dev/null 2>&1

echo "Starting wrangler dev --local on :$PORT..."
npx wrangler dev --local --config wrangler.test.toml --port "$PORT" --ip 127.0.0.1 >"/tmp/ca-dev.$$.log" 2>&1 &
DEV_PID=$!
for _ in $(seq 1 60); do
  sleep 1
  curl -s --max-time 2 -o /dev/null "http://127.0.0.1:$PORT/" && break
done
if ! curl -s --max-time 2 -o /dev/null "http://127.0.0.1:$PORT/"; then
  echo "dev server never came up; log:"; tail -20 "/tmp/ca-dev.$$.log"; exit 1
fi
echo "Testing with code $CODE"; echo

echo "-- CORS and auth (must cost zero D1 reads) --"
is "OPTIONS short-circuits with 204"        204   "$(status OPTIONS)"
is "preflight caches for 2h"                7200  "$(curl -s -X OPTIONS -D- -o /dev/null "$BASE" | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-max-age"{print $2}')"
is "no Authorization is 401"                401   "$(status GET)"
is "wrong-length code is 401"               401   "$(status GET -H 'Authorization: Bearer SHORT')"
is "code with excluded letter I is 401"     401   "$(status GET -H 'Authorization: Bearer IIIIIIIIIIIIIIII')"
is "code with excluded letter U is 401"     401   "$(status GET -H 'Authorization: Bearer UUUUUUUUUUUUUUUU')"

echo "-- GET on an unknown code --"
is "unknown code is 404"                    404   "$(status GET -H "$AUTH")"

echo "-- first write: baseGen 0 --"
is "first PUT accepted"                     200   "$(status PUT -H "$AUTH" -H 'content-type: application/json' -d '{"baseGen":0,"blob":"{\"coins\":10}","savedAt":111,"device":"devA","reqId":"r1"}')"
is "gen is now 1"                           1     "$(field gen GET -H "$AUTH")"
is "blob round-trips verbatim"              '{"coins":10}' "$(field blob GET -H "$AUTH")"
is "device round-trips"                     devA  "$(field device GET -H "$AUTH")"
is "reqId round-trips (lost-ACK check)"     r1    "$(field reqId GET -H "$AUTH")"
is "savedAt round-trips"                    111   "$(field savedAt GET -H "$AUTH")"

echo "-- baseGen 0 against an existing row is an ordinary conflict --"
is "re-INSERT is 409, not a duplicate"      409   "$(status PUT -H "$AUTH" -H 'content-type: application/json' -d '{"baseGen":0,"blob":"x","savedAt":222,"device":"devB","reqId":"r2"}')"
is "409 carries the current gen"            1     "$(field gen PUT -H "$AUTH" -H 'content-type: application/json' -d '{"baseGen":0,"blob":"x","savedAt":222,"device":"devB","reqId":"r2"}')"
is "409 carries the current blob"           '{"coins":10}' "$(field blob PUT -H "$AUTH" -H 'content-type: application/json' -d '{"baseGen":0,"blob":"x","savedAt":222,"device":"devB","reqId":"r2"}')"
is "the losing write did not land"          '{"coins":10}' "$(field blob GET -H "$AUTH")"

echo "-- ordinary write and stale write --"
is "PUT at the current gen is accepted"     200   "$(status PUT -H "$AUTH" -H 'content-type: application/json' -d '{"baseGen":1,"blob":"{\"coins\":20}","savedAt":333,"device":"devB","reqId":"r3"}')"
is "gen advanced to 2"                      2     "$(field gen GET -H "$AUTH")"
is "replaying the same baseGen is 409"      409   "$(status PUT -H "$AUTH" -H 'content-type: application/json' -d '{"baseGen":1,"blob":"{\"coins\":30}","savedAt":444,"device":"devA","reqId":"r4"}')"
is "stale write did not land"               '{"coins":20}' "$(field blob GET -H "$AUTH")"

echo "-- size and shape caps (§10) --"
BIG=$(head -c 5000 </dev/zero | tr '\0' 'a')
is "blob over 4KB is 400"                   400   "$(status PUT -H "$AUTH" -H 'content-type: application/json' -d "{\"baseGen\":2,\"blob\":\"$BIG\",\"savedAt\":1,\"device\":\"d\",\"reqId\":\"r\"}")"
is "unparseable envelope is 400"            400   "$(status PUT -H "$AUTH" -H 'content-type: application/json' -d 'not json')"
is "non-string blob is 400"                 400   "$(status PUT -H "$AUTH" -H 'content-type: application/json' -d '{"baseGen":2,"blob":{"a":1},"savedAt":1,"device":"d","reqId":"r"}')"
is "negative baseGen is 400"                400   "$(status PUT -H "$AUTH" -H 'content-type: application/json' -d '{"baseGen":-1,"blob":"x","savedAt":1,"device":"d","reqId":"r"}')"
is "caps rejected before any write"         2     "$(field gen GET -H "$AUTH")"

echo "-- the dashed display form is accepted --"
DASHED="${CODE:0:4}-${CODE:4:4}-${CODE:8:4}-${CODE:12:4}"
is "XXXX-XXXX-XXXX-XXXX hashes the same"    2     "$(field gen GET -H "Authorization: Bearer $DASHED")"

echo "-- DELETE (§5.4 tombstone) --"
is "stale DELETE is 409"                    409   "$(status DELETE -H "$AUTH" -H 'content-type: application/json' -d '{"baseGen":1}')"
is "the save survived the stale DELETE"     '{"coins":20}' "$(field blob GET -H "$AUTH")"
is "DELETE at the current gen is accepted"  200   "$(status DELETE -H "$AUTH" -H 'content-type: application/json' -d '{"baseGen":2}')"
is "gen advanced to 3"                      3     "$(field gen GET -H "$AUTH")"
is "GET returns the tombstone, not a 404"   200   "$(status GET -H "$AUTH")"
is "blob is null on a tombstone"            null  "$(field blob GET -H "$AUTH")"

echo "-- the assertion the whole DELETE exists for --"
# §6.1: copying the PUT's `SET prev_blob = blob` into DELETE would write the player's full save into
# prev_blob while telling them it was erased. Read the column directly — no endpoint exposes it.
ROW=$(npx wrangler d1 execute charming-anomaly-sync --local --config wrangler.test.toml --json \
        --command "SELECT COALESCE(prev_blob,'<NULL>') AS p, COALESCE(prev_gen,-1) AS g, COALESCE(blob,'<NULL>') AS b FROM saves WHERE id='$ID'" 2>/dev/null \
        | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const m=s.match(/\[[\s\S]*\]/);const r=JSON.parse(m[0])[0].results[0];console.log(`${r.p}|${r.g}|${r.b}`)}catch(e){console.log("PARSE_ERROR")}})')
is "erasing NULLs prev_blob, prev_gen and blob" '<NULL>|-1|<NULL>' "$ROW"

echo "-- DELETE is idempotent --"
is "repeat DELETE is 200, not 409"          200   "$(status DELETE -H "$AUTH" -H 'content-type: application/json' -d '{"baseGen":3}')"
is "and does not burn a generation"         3     "$(field gen GET -H "$AUTH")"
OTHER=$(LC_ALL=C tr -dc '0-9A-HJKMNP-TV-Z' </dev/urandom | head -c 16)
is "DELETE on an unknown code is 404"       404   "$(status DELETE -H "Authorization: Bearer $OTHER" -H 'content-type: application/json' -d '{"baseGen":0}')"

echo "-- rate limiting (§10) --"
# The DEPLOYED numbers, read from the real config — wrangler.test.toml raises the limit, so without
# this a bad edit to wrangler.toml would ship unnoticed behind a green suite.
is "deployed limit is 10"                   10    "$(grep -oE 'limit *= *[0-9]+' wrangler.toml | grep -oE '[0-9]+')"
is "deployed period is 60"                  60    "$(grep -oE 'period *= *[0-9]+' wrangler.toml | grep -oE '[0-9]+')"
# And the enforcement path itself: hammer a FRESH code past the test config's 40 and expect a 429.
# Keyed on the code hash, so this cannot throttle the assertions above.
HAMMER=$(LC_ALL=C tr -dc '0-9A-HJKMNP-TV-Z' </dev/urandom | head -c 16)
LAST=""
for _ in $(seq 1 46); do LAST=$(status GET -H "Authorization: Bearer $HAMMER"); done
is "a flood of requests eventually 429s"    429   "$LAST"
is "and an untouched code still works"      3     "$(field gen GET -H "$AUTH")"

echo
echo "-- leaderboard (/scores) --"
# A SECOND FEATURE on the same Worker, and the one thing it must never do is disturb the first: the
# assertions above all ran before this block and are re-checked at the end of it.
#
# Its own base URL and its own helpers, because nothing here is authenticated — passing $AUTH would
# hide the property most worth asserting, that a board read needs no pairing code at all.
SBASE="http://127.0.0.1:$PORT/scores"
# A fresh chapter id per run, so repeated runs against one local D1 file cannot see each other's
# rows — the same reason CODE is minted fresh above. Lowercase letters only: the Worker's shape
# check is /^[a-z][a-z0-9]{0,15}$/.
CH="t$(LC_ALL=C tr -dc 'a-z' </dev/urandom | head -c 8)"
scall()  { curl -s -o "/tmp/ca-body.$$" -w '%{http_code}' -X "$1" "${@:2}"; printf '\n'; cat "/tmp/ca-body.$$"; printf '\n'; }
sstatus() { scall "$@" | head -1; }
sbody()   { scall "$@" | tail -n +2; }
post()    { scall POST -H 'content-type: application/json' -d "$1" "$SBASE"; }

is "an unknown board is 200, not 404"       200   "$(sstatus GET "$SBASE?chapter=$CH&difficulty=3")"
is "and it is empty rather than absent"     '{"kills":[],"level":[],"time":[]}' "$(sbody GET "$SBASE?chapter=$CH&difficulty=3")"
is "a board read carries no Authorization"  200   "$(sstatus GET "$SBASE?chapter=$CH&difficulty=1")"

is "a score is accepted"                    200   "$(post "{\"nick\":\"Ann\",\"chapter\":\"$CH\",\"difficulty\":3,\"kills\":900,\"level\":20}" | head -1)"
is "a second score is accepted"             200   "$(post "{\"nick\":\"Bob\",\"chapter\":\"$CH\",\"difficulty\":3,\"kills\":500,\"level\":24}" | head -1)"
# THE ASSERTION THE TWO BOARDS EXIST FOR. Bob has fewer kills and a higher level, so a single
# ordering would put the same name on top of both — which is exactly what a copy-pasted second
# query, or a tiebreak applied to the wrong column, silently produces.
BOARDS=$(sbody GET "$SBASE?chapter=$CH&difficulty=3")
lead() { printf '%s' "$BOARDS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s)[process.argv[1]][0].nick)}catch{console.log("PARSE_ERROR:"+s.trim())}})' "$1"; }
is "the kills board is led by the killer"   Ann   "$(lead kills)"
is "the level board is led by the leveller" Bob   "$(lead level)"
# THE BOSS BOARD. Neither submit above carried a kill time, and neither should join it: an
# ordinary chapter stores NULL there, and an ASC index sorts NULLs FIRST — so a missing
# `time_ms IS NOT NULL` puts two players who never fought a boss on top of the boss board.
# String(), like field() above and for the same reason: console.log of a NUMBER routes through
# util.inspect, which emits ANSI colour escapes that silently break every comparison here.
count() { printf '%s' "$1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(String(JSON.parse(s)[process.argv[1]].length))}catch{console.log("PARSE_ERROR:"+s.trim())}})' "$2"; }
is "a timeless submit joins no time board" 0     "$(count "$BOARDS" time)"

is "a kill time is accepted"                200   "$(post "{\"nick\":\"Cid\",\"chapter\":\"$CH\",\"difficulty\":3,\"kills\":40,\"level\":5,\"timeMs\":242000}" | head -1)"
is "a faster kill is accepted"              200   "$(post "{\"nick\":\"Dot\",\"chapter\":\"$CH\",\"difficulty\":3,\"kills\":30,\"level\":4,\"timeMs\":181000}" | head -1)"
# THE ONE ASSERTION THIS BOARD EXISTS FOR, and the one a copy-pasted third query gets wrong: it is
# the only board in the game that sorts ASC. Dot has FEWER kills and a LOWER level than Cid, so any
# ordering borrowed from the other two puts Cid on top; shortest-wins puts Dot there.
TBOARDS=$(sbody GET "$SBASE?chapter=$CH&difficulty=3")
tlead() { printf '%s' "$TBOARDS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const b=JSON.parse(s).time;console.log(b.map(r=>r.nick+":"+r.timeMs).join(","))}catch{console.log("PARSE_ERROR:"+s.trim())}})'; }
is "the time board is led by the fastest"   'Dot:181000,Cid:242000' "$(tlead)"

# Difficulty is part of the board's identity, not a filter applied afterwards.
is "another difficulty is a separate board" '{"kills":[],"level":[],"time":[]}' "$(sbody GET "$SBASE?chapter=$CH&difficulty=4")"

echo "-- leaderboard rejections (shape only — this endpoint is deliberately credulous) --"
is "a short nick is 400"                    400   "$(post "{\"nick\":\"Bo\",\"chapter\":\"$CH\",\"difficulty\":3,\"kills\":5,\"level\":2}" | head -1)"
# The ceiling is READ OUT OF THE WORKER, not written here: a literal one character over the old
# bound becomes a VALID name the moment the bound rises, and this line would then be posting a real
# row while still reading like a rejection test. ("no rejection wrote a row" below would catch it,
# but as a mystery red two screens away from the thing that actually moved.)
NMAX=$(grep -oE 'const NICK_MAX = [0-9]+' src/index.js | grep -oE '[0-9]+')
TOOLONG=$(printf 'a%.0s' $(seq 1 $((NMAX + 1))))
is "a long nick is 400"                     400   "$(post "{\"nick\":\"$TOOLONG\",\"chapter\":\"$CH\",\"difficulty\":3,\"kills\":5,\"level\":2}" | head -1)"
is "a malformed chapter is 400"             400   "$(post "{\"nick\":\"Ann\",\"chapter\":\"DROP TABLE\",\"difficulty\":3,\"kills\":5,\"level\":2}" | head -1)"
is "a difficulty out of range is 400"       400   "$(post "{\"nick\":\"Ann\",\"chapter\":\"$CH\",\"difficulty\":99,\"kills\":5,\"level\":2}" | head -1)"
is "a non-integer score is 400"             400   "$(post "{\"nick\":\"Ann\",\"chapter\":\"$CH\",\"difficulty\":3,\"kills\":1.5,\"level\":2}" | head -1)"
# A time that is PRESENT and malformed is refused; an ABSENT one is not. The pair matters: almost
# every submit omits the field (only a won boss run has a kill time), and an older build omits it
# always — refusing those would drop every ordinary score on the floor.
is "a zero kill time is 400"                400   "$(post "{\"nick\":\"Ann\",\"chapter\":\"$CH\",\"difficulty\":4,\"kills\":5,\"level\":2,\"timeMs\":0}" | head -1)"
is "a non-integer kill time is 400"         400   "$(post "{\"nick\":\"Ann\",\"chapter\":\"$CH\",\"difficulty\":4,\"kills\":5,\"level\":2,\"timeMs\":1.5}" | head -1)"
is "an explicit null kill time is accepted" 200   "$(post "{\"nick\":\"Eve\",\"chapter\":\"$CH\",\"difficulty\":5,\"kills\":5,\"level\":2,\"timeMs\":null}" | head -1)"
is "an unparseable envelope is 400"         400   "$(scall POST -H 'content-type: application/json' -d 'not json' "$SBASE" | head -1)"
is "PUT to /scores is 405"                  405   "$(sstatus PUT "$SBASE")"
is "a bad board read is 400"                400   "$(sstatus GET "$SBASE?chapter=$CH&difficulty=abc")"
# Nothing above may have written a row: a rejected submit that still inserted would be invisible
# until someone opened the podium and found a stranger on it.
is "no rejection wrote a row"               '{"kills":[],"level":[],"time":[]}' "$(sbody GET "$SBASE?chapter=$CH&difficulty=4")"

echo "-- a missing table answers 500 WITH CORS, not the runtime's own error page --"
# THE DAY-ONE MISTAKE: deploying the Worker without running `npm run db:remote`. An exception
# escaping fetch() is answered by the Workers 1101 page, which carries NO CORS headers — so the
# browser rejects it before the client can see a status, and the game reports "could not reach the
# podium" for a broken database. This is the only assertion that can tell those apart, so it drops
# the table on purpose and puts it straight back.
npx wrangler d1 execute charming-anomaly-sync --local --config wrangler.test.toml --command "DROP TABLE scores" >/dev/null 2>&1
is "a missing table is 500, not a crash"    500   "$(sstatus GET "$SBASE?chapter=$CH&difficulty=3")"
# The header is the whole point — a 500 the browser discards is indistinguishable from being offline.
CORSHDR=$(curl -s -D - -o /dev/null "$SBASE?chapter=$CH&difficulty=3" | grep -ci 'access-control-allow-origin')
is "and it still carries CORS"              1     "$CORSHDR"
npx wrangler d1 execute charming-anomaly-sync --local --config wrangler.test.toml --file=./schema.sql >/dev/null 2>&1
is "the table is back"                      200   "$(sstatus GET "$SBASE?chapter=$CH&difficulty=3")"

echo "-- the save contract is untouched by any of that --"
is "save-sync still answers its own path"   3     "$(field gen GET -H "$AUTH")"
is "and still 401s a malformed code"        401   "$(status GET -H 'Authorization: Bearer nope')"

echo
echo "passed $PASS, failed $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
echo "ALL WORKER TESTS PASSED"
