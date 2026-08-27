// Leaderboard client. Talks to the /scores path of the same Worker save-sync uses
// (worker/src/index.js) and knows nothing about save-sync itself — no pairing code, no generation,
// no localStorage of its own. The nickname lives in `meta.nick` (state.js) because it is player
// progress, not a sync credential.
//
// MAY NOT TOUCH: Pixi, DOM, `run`, sim.js, render.js. Same module-scope discipline as sync.js and
// for the same reason: `fetch` appears only inside function bodies, so this file imports cleanly
// into plain node and `validNick` is unit-testable in npm test with no browser.

// ponytail: the URL is a literal rather than a build-time define. It is public either way (the
// save-sync design says so explicitly), and a define would need a repository variable set in the
// GitHub deploy workflow before the feature worked at all — one more thing to forget. The cost is
// that `npm run dev` posts to the real board; that is the owner's own board and he can delete rows.
// Add `__SCORES_URL__` beside `__BUILD_STAMP__` in vite.config.js if a fork ever needs its own.
const SCORES_URL = 'https://charming-anomaly-sync.ojisama-san.workers.dev/scores'

// A dead network must not leave the podium spinning forever, and the game has no other loading
// state to borrow. Eight seconds is past any healthy round trip and short enough to read as "this
// is not coming".
const TIMEOUT_MS = 8000

export const NICK_MIN = 3
// Widening is backward-compatible by construction: every name already on the board is shorter than
// this, and the Worker only refuses what falls OUTSIDE the range. Narrowing would not be — it would
// orphan rows whose nick the client can no longer reproduce, so the rank chip and the own-row
// highlight would stop matching for exactly the players who got there first.
export const NICK_MAX = 15

// The one place that decides what a nickname IS. Returns the normalized name, or null if what is
// left after normalizing is not a legal one — so callers never have to trim before asking.
// Counting in UTF-16 units, not code points, deliberately: that is what the <input maxlength>
// counts and what the Worker checks, so all three agree and a name can never be accepted by the
// field and refused by the server.
export function validNick(raw) {
  if (typeof raw !== 'string') return null
  let s = raw
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cs}]/gu, '') // control characters would corrupt the podium row
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NICK_MAX)
  // slice() cuts UTF-16 units, so it can bisect an emoji and leave a lone high surrogate — which
  // renders as a replacement box and survives every other check here.
  if (/\p{Cs}$/u.test(s)) s = s.slice(0, -1)
  // TRIM AGAIN, and this one is not belt-and-braces. The clamp cuts at a fixed width with no regard
  // for what is there, so a name whose 11th character is a space comes out of it with a TRAILING
  // one: 'Alexandre Dupont' -> 'Alexandre '. The Worker trims before storing (it has to — it cannot
  // trust a client), so the board would hold 'Alexandre' while meta.nick held 'Alexandre ', and
  // every comparison between them is by string equality. Nothing throws; the player simply never
  // sees their rank chip and never sees their own row highlighted, forever.
  return (s = s.trim()).length >= NICK_MIN ? s : null
}

// Both calls answer null on ANY failure — offline, timeout, 4xx, malformed body. A leaderboard is
// the one feature in this game that is allowed to simply not be there, so there is no retry, no
// queue and no error state beyond "no scores to show"; the caller distinguishes null (could not
// reach the board) from an empty board, and nothing else.
async function call(url, init) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return null
    const body = await res.json()
    if (!Array.isArray(body?.kills) || !Array.isArray(body?.level)) return null
    // `time` and `lap` (the two DURATION boards) are TOLERATED MISSING, unlike the other two, and
    // that asymmetry is deliberate: the Worker deploys separately from the game, so between
    // shipping this build and deploying that one every response lacks the key. Requiring it would
    // turn the whole podium — every chapter, every other board — into 'could not reach the podium'
    // for the length of that gap. Defaulted to empty instead, which is what an unplayed board looks
    // like anyway, and which is also what The Reef's lap board honestly IS on the day it ships: the
    // column is new, so no existing row carries one.
    return {
      ...body,
      time: Array.isArray(body.time) ? body.time : [],
      lap: Array.isArray(body.lap) ? body.lap : [],
    }
  } catch {
    return null
  }
}

// -> { kills: [{nick, kills, level, at, timeMs, lapMs, starter}], level: [...], time: [...],
// lap: [...] } (each 0-3 long), or null.
//
// FOUR BOARDS COME BACK AND A CHAPTER DRAWS TWO. `time` is a duration in ms, shortest first, and
// means whatever its chapter means by one — a boss's kill time, a circuit's full race. `lap` is the
// circuit's best single lap. Which pair a chapter draws is a game fact and lives in
// CHAPTERS[].boards (config.js); ui.js reads it. Rows never mix across chapters, so one duration
// column meaning two things is safe; the unit is reconciled at the submit site (main.js).
export function fetchBoards(chapter, difficulty) {
  return call(`${SCORES_URL}?chapter=${encodeURIComponent(chapter)}&difficulty=${difficulty}`)
}

// Where a just-submitted run landed, read off the boards the POST answered with.
// -> { kills, level, time, lap } with 1|2|3|null in each, or null if it made no podium at all.
// Takes the SAME object submitScore was given, so the score being looked up cannot drift from the
// score that was sent — with five positional arguments it silently could.
//
// Matching on nick + the score itself rather than on a row id, because rows have no id — the table
// is append-only and the Worker returns three anonymous rows. The one imprecision that buys: a
// player who submits the SAME kill count twice matches their earlier row and is told the rank that
// row holds. It is still a rank they hold, so it is not a lie, and the alternative is an id column
// and a rank query to remove an ambiguity nobody can perceive.
export function podiumRank(boards, { nick, kills, level, timeMs = null, lapMs = null }) {
  if (!boards) return null
  const at = (rows, key, want) => {
    // A RUN THAT CARRIES NO SUCH SCORE HOLDS NO PLACE ON THAT BOARD -- and this guard now serves
    // BOTH duration boards, not just the time one it was written for. Without it findIndex would
    // match a stored row whose own timeMs/lapMs is null against a null lookup, and hand an
    // ordinary chapter's run a rank on a board it never entered. run LB mutation-proves both.
    if (want == null) return null
    const i = rows.findIndex((r) => r.nick === nick && r[key] === want)
    return i < 0 ? null : i + 1
  }
  const k = at(boards.kills, 'kills', kills)
  const l = at(boards.level, 'level', level)
  const t = at(boards.time ?? [], 'timeMs', timeMs)
  const p = at(boards.lap ?? [], 'lapMs', lapMs)
  return k || l || t || p ? { kills: k, level: l, time: t, lap: p } : null
}

// Returns the boards AFTER the insert, so the caller can see where the run landed without a second
// request. null on any failure, including a nickname this build would not have offered.
//
// `timeMs` is null for every ordinary chapter and for every LOST boss run — main.js is what
// decides, and it has to: the board sorts SHORTEST FIRST, so a death at 12 seconds would take
// first place off everyone who actually killed the thing.
//
// `lapMs` is null off a circuit, and on a race that crossed no lap line. It does NOT need the
// won/lost test its twin does: a lap has to be COMPLETED to be timed at all, so unlike a kill time
// there is no way to shorten one by ending the run early, and a race that ran the clock out on lap
// 4 still drove three real laps. See sim.js's run.bestLap block.
//
// `starter` is null unless the chapter ROLLS its starter. It ranks nothing — it is carried so a
// podium row can say which weapon the record was set with, which is only a fact worth recording
// where two rows can differ.
export function submitScore({ nick, chapter, difficulty, kills, level, timeMs = null, lapMs = null, starter = null }) {
  const name = validNick(nick)
  if (!name) return Promise.resolve(null)
  return call(SCORES_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nick: name, chapter, difficulty, kills, level, timeMs, lapMs, starter }),
  })
}
