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
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
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

export default {
  async fetch(req, env) {
    // §10.3: short-circuit OPTIONS before auth and before D1.
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

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
