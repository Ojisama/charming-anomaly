// Save-sync Worker for Charming Anomaly. Three endpoints over one D1 row per pairing code.
// Design: docs/superpowers/specs/2026-08-03-cross-device-save-sync-design.md (§6 endpoints, §10
// abuse). The game does not import this and this does not import the game — the blob is opaque
// JSON text the Worker never parses.

const MAX_BODY = 8 * 1024 // §10 Content-Length cap: reject before reading the stream
const MAX_BLOB = 4 * 1024 // §10 blob cap. Today's maxed save is 893 bytes; ~4.5x headroom

// §5.1 Crockford base32, 16 chars = 80 bits. Crockford omits I, L, O and U so a code read off a
// screen has no 0/O or 1/l ambiguity. Validated BEFORE any D1 query (§10.2) so garbage costs one
// CPU microsecond and zero row reads.
const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{16}$/

// §10: Authorization is not a CORS-safelisted header, so even GET preflights and the default
// Access-Control-Max-Age of 5s makes effectively every request two invocations. 7200 is Chromium's
// cap (Firefox honours more); it collapses preflights to ~one per two hours per browser.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '7200',
}

const json = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })

// The code is never stored — only this hash is. A dump of the table therefore cannot be replayed
// against the API, since the bearer token is the pre-image.
async function codeHash(code) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Accepts the display form (XXXX-XXXX-XXXX-XXXX) and the bare form, since players retype what they
// see. Returns null for anything that is not a well-formed code.
function normalizeCode(header) {
  const raw = /^Bearer (.+)$/.exec(header ?? '')?.[1]
  if (!raw) return null
  const code = raw.replace(/-/g, '').toUpperCase()
  return CODE_RE.test(code) ? code : null
}

const rowBody = (row) => ({
  gen: row.gen,
  blob: row.blob, // null on a tombstone (§5.4) — a first-class value, not an error
  savedAt: row.saved_at,
  device: row.device,
  reqId: row.req_id,
})

// §6.1: "Both are followed by a SELECT when zero rows changed, to build the 409 body. Write the
// whole thing as a D1 batch/transaction so the SELECT cannot observe a row written between the
// failed write and the read." The SELECT runs unconditionally — when the write DID land it reads
// back the row the write produced, which is where the new gen comes from.
async function writeThenRead(env, write, id) {
  const [written, read] = await env.DB.batch([write, env.DB.prepare('SELECT * FROM saves WHERE id = ?').bind(id)])
  return { changed: written.meta.changes > 0, row: read.results[0] ?? null }
}

async function readEnvelope(req) {
  if (Number(req.headers.get('content-length')) > MAX_BODY) return { err: 'body too large' }
  const text = await req.text()
  if (text.length > MAX_BODY) return { err: 'body too large' } // chunked requests send no length
  try {
    const env = JSON.parse(text)
    if (!env || typeof env !== 'object') return { err: 'envelope must be an object' }
    return { env }
  } catch {
    return { err: 'unparseable envelope' }
  }
}

// ---------------------------------------------------------------------------------------------
// Leaderboard. A SECOND, UNRELATED FEATURE sharing this Worker and this database: no pairing code,
// no Authorization header, no generation counter. It is handled before the save-sync auth block so
// that block's 401 cannot swallow it, and it touches only the `scores` table — the save contract
// above is unchanged.
//
// Deliberately credulous. The owner's ruling: "dev runs don't count, else trust the client for
// now, it's just friends." The dev-menu exclusion therefore lives in the GAME (sim.js sets
// run._devUsed, main.js refuses to submit) and everything here is a SHAPE check — enough that a
// stray request cannot write junk the podium then has to render, not enough to stop anyone who
// opens devtools. Do not mistake it for anti-cheat.
// ---------------------------------------------------------------------------------------------

const NICK_MIN = 3
const NICK_MAX = 10

// Mirrors validNick in src/scores.js, which is the one-fact-two-places trap this repo warns about
// most. It is survivable here only because the two sides are not equals: the CLIENT normalizes
// (trim, strip controls, clamp) and the SERVER only refuses what falls outside the range, so a
// nick the client produced always passes and the two can never disagree about a legal name.
const validNick = (v) =>
  typeof v === 'string' && v.length >= NICK_MIN && v.length <= NICK_MAX && !/[\p{Cc}\p{Cs}]/u.test(v)

// Chapter ids stay opaque to this Worker for the same reason the save blob does — the game must be
// able to add a chapter without a Worker deploy. A shape check is all it is entitled to.
const validChapter = (v) => typeof v === 'string' && /^[a-z][a-z0-9]{0,15}$/.test(v)
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null)

const boardRow = (r) => ({ nick: r.nick, kills: r.kills, level: r.level, at: r.at })

// `at ASC` on both boards so a tie goes to whoever got there FIRST. Without it SQLite is free to
// return either row and the podium reorders itself between two reads of an unchanged board.
async function readBoards(env, chapter, difficulty) {
  const [byKills, byLevel] = await env.DB.batch([
    env.DB.prepare(
      'SELECT nick, kills, level, at FROM scores WHERE chapter = ? AND difficulty = ? ORDER BY kills DESC, at ASC LIMIT 3',
    ).bind(chapter, difficulty),
    env.DB.prepare(
      'SELECT nick, kills, level, at FROM scores WHERE chapter = ? AND difficulty = ? ORDER BY level DESC, kills DESC, at ASC LIMIT 3',
    ).bind(chapter, difficulty),
  ])
  return { kills: byKills.results.map(boardRow), level: byLevel.results.map(boardRow) }
}

async function scores(req, env) {
  // EVERY METHOD, not just the writes. This is the only endpoint on this Worker a stranger can
  // find — anonymous, unauthenticated, Access-Control-Allow-Origin: * — and a board read is two D1
  // statements against the same 100k/day account budget §10 exists to narrow. The save path limits
  // every method for the same reason; an earlier cut of this had the check inside the POST branch,
  // which left the discoverable half of the feature uncapped.
  //
  // Keyed on the client IP, NOT on the nickname: a nickname is self-declared, so keying on it would
  // let one abuser rate-limit everybody simply by claiming their name. Absent binding means no
  // limit, same as the save path (`wrangler dev --local` does not always bind one).
  // A BUCKET PER METHOD, and the method is in the key for a reason. Sharing one bucket across GET
  // and POST lets READS starve a WRITE: a few friends behind one household or carrier NAT — which
  // is this feature's entire stated audience — share an egress IP, the client caches nothing (every
  // podium open is a fresh GET, and the retry button is a one-tap way to spend another), so the
  // bucket empties on browsing alone. The next run to end then POSTs into a 429, scores.js answers
  // null on !res.ok, and the score is simply absent from the board with no error on any screen.
  // Separate keys keep the read cap that hoisting this above the method switch was for, without
  // letting reads cost anyone a score.
  if (env.LIMITER) {
    const ip = req.headers.get('cf-connecting-ip') ?? 'local'
    const { success } = await env.LIMITER.limit({ key: `scores:${req.method}:${ip}` })
    if (!success) return json(429, { error: 'rate limited' })
  }

  if (req.method === 'GET') {
    const params = new URL(req.url).searchParams
    const chapter = params.get('chapter')
    const difficulty = int(Number(params.get('difficulty')), 1, 9)
    if (!validChapter(chapter) || difficulty === null) return json(400, { error: 'bad board' })
    return json(200, await readBoards(env, chapter, difficulty))
  }

  if (req.method === 'POST') {
    const { env: body, err } = await readEnvelope(req)
    if (err) return json(400, { error: err })
    const nick = typeof body.nick === 'string' ? body.nick.trim() : null
    const { chapter } = body
    const difficulty = int(body.difficulty, 1, 9)
    const kills = int(body.kills, 0, 99999)
    const level = int(body.level, 1, 999)
    if (!validNick(nick)) return json(400, { error: `nick must be ${NICK_MIN}-${NICK_MAX} characters` })
    if (!validChapter(chapter)) return json(400, { error: 'bad chapter' })
    if (difficulty === null || kills === null || level === null) return json(400, { error: 'bad score' })

    await env.DB.prepare('INSERT INTO scores (chapter, difficulty, nick, kills, level, at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(chapter, difficulty, nick, kills, level, Date.now())
      .run()
    // The boards come back in the same round trip, so a submit that landed is visibly a submit
    // that landed rather than a 200 the client takes on faith — and the summary screen can say
    // "you made the podium" without a second request.
    return json(200, await readBoards(env, chapter, difficulty))
  }

  return json(405, { error: 'method not allowed' })
}

export default {
  async fetch(req, env) {
    // §10.3: short-circuit OPTIONS before auth and before D1.
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

    // Leaderboard: its own path, its own (absent) auth, its own table. Before the code check
    // below, which would otherwise 401 every anonymous board read.
    //
    // THE CATCH IS LOAD-BEARING AND IS NOT DEFENSIVE PROGRAMMING. An exception escaping fetch() is
    // answered by the Workers runtime's own 1101 page, which carries NO CORS HEADERS — so the
    // browser rejects it before the client sees a status, and scores.js's blanket catch reports
    // "Could not reach the podium" for what is really a database error. The one way to reach it is
    // also the most likely day-one mistake: deploying this Worker without having run
    // `npm run db:remote`, so the `scores` table does not exist. That state is then invisible from
    // the game, from the console, and from the network tab.
    if (new URL(req.url).pathname === '/scores') {
      try {
        return await scores(req, env)
      } catch {
        return json(500, { error: 'leaderboard unavailable' })
      }
    }

    const code = normalizeCode(req.headers.get('authorization'))
    if (!code) return json(401, { error: 'malformed code' }) // §10.2: before any D1 query
    const id = await codeHash(code)

    // Keyed on the code hash, so one abusive code cannot rate-limit an unrelated player who happens
    // to share an egress IP. Guarded because `wrangler dev --local` does not always bind a limiter;
    // ponytail: absent binding means no limit locally, which is exactly what test.sh wants.
    if (env.LIMITER) {
      const { success } = await env.LIMITER.limit({ key: id })
      if (!success) return json(429, { error: 'rate limited' })
    }

    const now = Date.now()

    if (req.method === 'GET') {
      const row = await env.DB.prepare('SELECT * FROM saves WHERE id = ?').bind(id).first()
      if (!row) return json(404, { error: 'no save under this code' })
      return json(200, rowBody(row))
    }

    if (req.method === 'PUT') {
      const { env: body, err } = await readEnvelope(req)
      if (err) return json(400, { error: err })
      const { baseGen, blob, savedAt, device, reqId } = body
      if (typeof blob !== 'string') return json(400, { error: 'blob must be a string' })
      if (blob.length > MAX_BLOB) return json(400, { error: 'blob too large' })
      if (!Number.isInteger(baseGen) || baseGen < 0) return json(400, { error: 'baseGen must be a non-negative integer' })

      // §6.1: baseGen 0 means "I believe no row exists" and maps to INSERT .. DO NOTHING; zero rows
      // affected produces the same 409 as any other stale write, carrying the existing row. That is
      // what makes first write, ordinary write and conflict ONE client-visible code path.
      const write = baseGen === 0
        ? env.DB.prepare(
            `INSERT INTO saves (id, gen, blob, saved_at, device, req_id, updated_at, prev_blob, prev_gen)
             VALUES (?, 1, ?, ?, ?, ?, ?, NULL, NULL)
             ON CONFLICT(id) DO NOTHING`,
          ).bind(id, blob, Number(savedAt) || now, String(device ?? ''), String(reqId ?? ''), now)
        : env.DB.prepare(
            `UPDATE saves
                SET prev_blob = blob, prev_gen = gen,
                    blob = ?, gen = gen + 1, saved_at = ?, device = ?, req_id = ?, updated_at = ?
              WHERE id = ? AND gen = ?`,
          ).bind(blob, Number(savedAt) || now, String(device ?? ''), String(reqId ?? ''), now, id, baseGen)

      const { changed, row } = await writeThenRead(env, write, id)
      if (!changed) return json(409, rowBody(row)) // row is non-null: a write only fails because one exists
      return json(200, { gen: row.gen })
    }

    if (req.method === 'DELETE') {
      const { env: body, err } = await readEnvelope(req)
      if (err) return json(400, { error: err })
      const { baseGen } = body
      if (!Number.isInteger(baseGen) || baseGen < 0) return json(400, { error: 'baseGen must be a non-negative integer' })

      // §6.1: this statement must NOT reuse the PUT's `SET prev_blob = blob` opening. Copying that
      // in would write the player's full save into prev_blob while telling them it was erased,
      // making "Erase everything" a lie. NULLing prev_blob here is the point, not an oversight:
      // §7.3's operator undo exists to recover a mis-tap, and a deliberate deletion is the one case
      // where retaining a copy is exactly wrong.
      // `AND blob IS NOT NULL` is what makes DELETE idempotent (§6.1): a repeat against an
      // already-tombstoned row changes nothing and is answered 200 with the current gen below,
      // rather than pointlessly burning a generation on each retry.
      const write = env.DB.prepare(
        `UPDATE saves
            SET blob = NULL, prev_blob = NULL, prev_gen = NULL,
                gen = gen + 1, saved_at = ?, device = '', req_id = ?, updated_at = ?
          WHERE id = ? AND gen = ? AND blob IS NOT NULL`,
      ).bind(now, String(body.reqId ?? ''), now, id, baseGen)

      const { changed, row } = await writeThenRead(env, write, id)
      if (changed) return json(200, { gen: row.gen })
      // Nothing changed. Three reasons, and they are not the same answer:
      if (!row) return json(404, { error: 'no save under this code' }) // never synced; nothing to erase
      if (row.blob === null) return json(200, { gen: row.gen }) // already a tombstone — the idempotent repeat
      return json(409, rowBody(row)) // a real save is there, at a generation the caller did not expect
    }

    return json(405, { error: 'method not allowed' })
  },
}
