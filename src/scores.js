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
    return Array.isArray(body?.kills) && Array.isArray(body?.level) ? body : null
  } catch {
    return null
  }
}

// -> { kills: [{nick, kills, level, at}], level: [...] } (each 0-3 long), or null.
export function fetchBoards(chapter, difficulty) {
  return call(`${SCORES_URL}?chapter=${encodeURIComponent(chapter)}&difficulty=${difficulty}`)
}

// Where a just-submitted run landed, read off the boards the POST answered with. -> { kills, level }
// with 1|2|3|null in each, or null if it made neither podium.
//
// Matching on nick + the score itself rather than on a row id, because rows have no id — the table
// is append-only and the Worker returns three anonymous rows. The one imprecision that buys: a
// player who submits the SAME kill count twice matches their earlier row and is told the rank that
// row holds. It is still a rank they hold, so it is not a lie, and the alternative is an id column
// and a rank query to remove an ambiguity nobody can perceive.
export function podiumRank(boards, nick, kills, level) {
  if (!boards) return null
  const at = (rows, key, want) => {
    const i = rows.findIndex((r) => r.nick === nick && r[key] === want)
    return i < 0 ? null : i + 1
  }
  const k = at(boards.kills, 'kills', kills)
  const l = at(boards.level, 'level', level)
  return k || l ? { kills: k, level: l } : null
}

// Returns the boards AFTER the insert, so the caller can see where the run landed without a second
// request. null on any failure, including a nickname this build would not have offered.
export function submitScore({ nick, chapter, difficulty, kills, level }) {
  const name = validNick(nick)
  if (!name) return Promise.resolve(null)
  return call(SCORES_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nick: name, chapter, difficulty, kills, level }),
  })
}
