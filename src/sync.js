// Cloud save sync. Owns the pairing credential and its own localStorage key, decides when to
// pull/push, talks to the Worker (worker/src/index.js), and hands main.js a decision.
// Design: docs/superpowers/specs/2026-08-03-cross-device-save-sync-design.md
//
// MAY NOT TOUCH: Pixi, DOM (including event listeners), `run`, sim.js, render.js, or save-slot
// localStorage keys directly — slots are reached only through state.js's exportSlot/importSlot, and
// this module never constructs a save key.
//
// TWO CONSTRAINTS THAT ARE ONE CARELESS IMPORT AWAY FROM BEING LOST, so they are written here:
//
// 1. NO BROWSER GLOBALS AT MODULE SCOPE. `fetch`, `localStorage` and `crypto` appear only inside
//    function bodies, and __SYNC_URL__ sits behind the same `typeof` guard ui.js already uses for
//    __BUILD_STAMP__. That discipline is what keeps this file importable from plain node, which is
//    what makes `decide` and the hash unit-testable in npm test with no browser.
// 2. `run === null` IS THE SAFETY INVARIANT BEHIND ADOPTING, AND THIS MODULE CANNOT READ IT.
//    `run` is a `let` local inside main.js's boot() — not exported, not reachable here. main.js
//    passes an isIdle() predicate in at wiring time and this module calls it before any adopt.
//    Without that the invariant is prose with no implementation.

import { exportSlot, importSlot, freezeSaves, SCHEMA } from './state.js'

const RECORD_KEY = 'charming-anomaly-sync-v1'

// Vite replaces __SYNC_URL__ at build time. Guarded so an un-defined build (and node) reads as
// empty rather than throwing at import — §8's disabled preview state.
const SYNC_URL = typeof __SYNC_URL__ === 'string' ? __SYNC_URL__ : ''

// ---------------------------------------------------------------------------------------------
// The pure core. Everything below this line is a function of its arguments — no I/O, no globals.
// ---------------------------------------------------------------------------------------------

// FNV-1a, 32-bit, hex. A change-detector over ~900 bytes, NOT a security boundary: the question it
// answers is "does the disk still match what we last pushed", and both sides are our own bytes.
export function hash(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

// §6.2's decision table. `dirty` is DERIVED by the caller (hash of the disk vs record.syncedHash),
// never stored — see deriveDirty below for why a stored boolean loses data three separate ways.
//
//   dirty | cloud gen vs baseGen | decision
//   ------+----------------------+----------
//   false | equal                | nothing
//   false | greater              | pull      (adopt: importSlot + reload)
//   true  | equal                | push
//   true  | greater              | conflict  (both moved from a common ancestor; prompt)
//   any   | LESS                 | resync, then re-run the table
//
// The last row is not a decision, it is a desynchronisation, and an earlier draft had it as `push`
// on the reasoning that "our baseGen wins the next write anyway". It does not: the server's write is
// `UPDATE … WHERE id = ? AND gen = ?` with ? = baseGen, so if the row's gen is LOWER the predicate
// can never match — the row only counts up. Zero rows change, 409, and that means a conflict prompt
// on every trigger, forever. Reachable with no database restore: a 404 outside pairing means "treat
// as baseGen 0 and push", so if device B recreates a deleted row at gen 1 while device A holds
// baseGen 12, device A is permanently wedged — and every wedge is a modal inviting the player to
// overwrite something. So: adopt the server's gen unconditionally and evaluate again.
export function decide({ dirty, cloudGen, baseGen }) {
  const resynced = cloudGen < baseGen
  const base = resynced ? cloudGen : baseGen
  const action = cloudGen > base ? (dirty ? 'conflict' : 'pull') : (dirty ? 'push' : 'nothing')
  return { action, baseGen: base, resynced }
}

// §6.4. A push that is accepted but whose response is lost leaves a stale baseGen, so the next push
// 409s against a row the device wrote itself — and the player is shown a conflict between their save
// and their own save. Keyed on a per-push reqId, never on a timestamp: an earlier draft compared
// `server.savedAt === record.sentAt` and broke in BOTH directions. False negative — any save between
// the lost push and the retry changes sentAt, so the rule stopped firing exactly when it mattered
// and the prompt compared the device against its own older save. False positive — a clock that steps
// backwards can stamp two different saves with the same value, matching a row that does not
// correspond to the pending blob, silently dropping it. A reqId is unique per attempt, cannot be
// accidentally reproduced, and is compared against a value the server echoes back.
//
// Resolution is always ADOPT THE GEN, THEN RE-DERIVE dirty — never an unconditional clear, which is
// what turned this check into a data-loss path rather than a convenience.
export function isOwnLostAck(server, record) {
  return !!server && !!record
    && server.device === record.device
    && server.reqId === record.reqId
    && typeof record.reqId === 'string' && record.reqId.length > 0
}

// §2.4 R4. Refuse to adopt a blob written by a build whose save format this one does not understand.
// Absence means the writer predated the field, which is format 1 — never this build's SCHEMA.
export function schemaOk(blob) {
  if (blob == null) return true // a tombstone carries no format
  try {
    const m = JSON.parse(blob)
    return (Number(m?.schema) || 1) <= SCHEMA
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------------------------
// The record. Its own localStorage key — never a save-slot key.
// ---------------------------------------------------------------------------------------------

export function readRecord() {
  try {
    const raw = localStorage.getItem(RECORD_KEY)
    if (!raw) return null
    const r = JSON.parse(raw)
    return (r && typeof r === 'object' && typeof r.code === 'string') ? r : null
  } catch { return null }
}

export function writeRecord(r) {
  try { localStorage.setItem(RECORD_KEY, JSON.stringify(r)); return true } catch { return false }
}

export function clearRecord() {
  try { localStorage.removeItem(RECORD_KEY); return true } catch { return false }
}

// The derived `dirty` of §6.2, asked of the disk rather than of a writer. A stored boolean that
// saveMeta's hook sets and a push clears loses data three independent ways, all silent:
//   1. A save that lands WHILE A PUSH IS IN FLIGHT is invisible — the hook sets a flag that is
//      already true (a no-op), the ACK clears it, and the newer disk content is never pushed. The
//      window is seconds wide by design, since one trigger pushes while the player is still shopping.
//   2. TWO TABS share the record with no compare-and-swap: both push from gen 7, the loser's 409
//      lands on a record the winner already rewrote, and the loser's disk content survives locally
//      while the flag reads false.
//   3. AN OLD CACHED BUNDLE HAS NO HOOK AT ALL — sw.js falls back to caches.match on network
//      failure, so an offline boot serves the previous build, writes the same slot key, advances
//      real progress and sets nothing. An entire build is the call site that skips the flag.
// A content hash fixes all three because it asks the disk. No writer cooperation is required, so
// tabs, cached bundles and future call sites are covered, and a lost race is self-healing.
export function deriveDirty(record) {
  if (!record) return false
  const blob = exportSlot(record.slot)
  if (blob == null) return false // nothing on disk to push
  return hash(blob) !== record.syncedHash
}

// ---------------------------------------------------------------------------------------------
// Adopting. Order is load-bearing (§3.3): freeze BEFORE the write, commit the record, then reload.
// ---------------------------------------------------------------------------------------------

// Returns 'adopted' | 'refused-schema' | 'refused-shape' | 'not-idle'. The caller reloads on
// 'adopted' and reports anything else to the player — a refused import is never silent (§8).
export function adopt({ record, blob, gen, isIdle }) {
  if (!isIdle()) return 'not-idle'
  if (!schemaOk(blob)) return 'refused-schema'
  // freezeSaves() first and permanently: location.reload() below queues a navigation but does not
  // stop script execution, and live handlers would otherwise write the pre-adopt save back over
  // this blob and then announce that write to sync.
  freezeSaves()
  if (!importSlot(record.slot, blob)) return 'refused-shape'
  writeRecord({ ...record, gen, syncedHash: hash(blob), pulledAt: nowMs() })
  return 'adopted'
}

// Isolated so tests can drive time without touching the decision logic, and so no module-scope
// browser global sneaks in.
function nowMs() { return Date.now() }

// ---------------------------------------------------------------------------------------------
// The pairing code (§5.1). Crockford base32, 16 chars = 80 bits, shown XXXX-XXXX-XXXX-XXXX.
// ---------------------------------------------------------------------------------------------

// Crockford omits I, L, O and U, so nothing on this screen is 0/O or 1/l ambiguous when read off a
// phone. Must stay identical to the Worker's CODE_RE character class — run ZZ.i asserts both ends.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_LEN = 16
const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{16}$/

// `bytes` is injectable so the suite can mint a known code; production passes nothing and takes
// crypto.getRandomValues. 256 is a whole multiple of 32, so the modulo is uniform — with a
// non-power-of-two alphabet it would not be, and a biased pairing code is a smaller keyspace than
// the 80 bits this claims.
export function newCode(bytes) {
  const b = bytes ?? crypto.getRandomValues(new Uint8Array(CODE_LEN))
  let out = ''
  for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[b[i] % 32]
  return out
}

export function groupCode(code) {
  return String(code ?? '').replace(/(.{4})(?=.)/g, '$1-')
}

// Generous about what the player types, exact about what it returns. Crockford's canonicalization
// is the whole reason that alphabet was chosen: uppercase, I and L read as 1, O reads as 0, and
// separators are noise. Returns null for anything that is not a well-formed code, so a caller can
// never accidentally send garbage as a bearer token.
//
// U IS NOT REMAPPED. Crockford excludes it to avoid accidental obscenity, not because it collides
// with another glyph, so there is nothing to map it to and a typed U is genuinely wrong.
export function canonicalize(typed) {
  const s = String(typed ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
  return CODE_RE.test(s) ? s : null
}

// ---------------------------------------------------------------------------------------------
// Transport. Every browser global below is inside a function body — see the header's rule 1.
// ---------------------------------------------------------------------------------------------

const TIMEOUT_MS = 5000
const PULL_THROTTLE_MS = 10_000
const PUSH_DEBOUNCE_MS = 10_000

// NOTHING HERE THROWS AND NOTHING HERE REJECTS. §8: every failure resolves to "do nothing, stay
// dirty, retry on the next trigger", because the local save has lost nothing and sync must never
// interrupt play. The tags are kept apart rather than collapsed to one `error` because §8 needs
// them to carry different sentences — "Offline" is a lie when the wifi is fine and the server is
// down, and a player who reads it goes looking at their router instead of waiting.
async function call(method, code, body) {
  if (!SYNC_URL) return { tag: 'disabled' }
  let res
  try {
    res = await fetch(SYNC_URL, {
      method,
      headers: { authorization: `Bearer ${code}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    if (e?.name === 'TimeoutError') return { tag: 'timeout' }
    // navigator.onLine only ever tells the truth when it is FALSE — a `true` means "there is a
    // network interface", not "the internet is reachable". Read in that direction only.
    return { tag: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'network' }
  }
  // A body is not guaranteed on any status (a 401 is JSON, a proxy's 502 is HTML), so parsing is
  // its own try — an unparseable error page must not turn a clean 503 into an exception.
  let parsed = null
  try { parsed = await res.json() } catch { /* no body, or not JSON */ }
  if (res.status === 200) return { tag: 'ok', body: parsed ?? {} }
  if (res.status === 409) return { tag: 'conflict', body: parsed ?? {} }
  if (res.status === 404) return { tag: 'notFound' }
  if (res.status === 401) return { tag: 'badCode' }
  if (res.status === 429) return { tag: 'rateLimited' }
  return { tag: 'serverError' }
}

// §6.3: two tabs otherwise interleave freely on a store with no compare-and-swap. The derived
// `dirty` already makes a lost race self-healing; the lock makes it rare.
// ponytail: no Web Locks (a very old browser) means no serialisation, which degrades to the
// self-healing path rather than to data loss. Upgrade path is a localStorage mutex if it matters.
async function withLock(fn) {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : null
  if (!locks?.request) return fn()
  return locks.request('ca-sync', fn)
}

function uuid() {
  try { return crypto.randomUUID() } catch { return String(nowMs()) + Math.random().toString(16).slice(2) }
}

// The writer's clock, read from the blob rather than stamped here: §4.1 puts `savedAt` in the meta
// at write time, and the cloud row must report when the SAVE happened, not when it was uploaded.
function savedAtOf(blob) {
  try { return Number(JSON.parse(blob)?.savedAt) || nowMs() } catch { return nowMs() }
}

// ---------------------------------------------------------------------------------------------
// Operations. main.js wires the triggers and the idle predicate; ui.js reads `status()` and drives
// the pairing flow. This module owns no pixels and registers no listeners (§3.1).
// ---------------------------------------------------------------------------------------------

// isIdle: `run === null`, which lives in a `let` inside main.js's boot() and is unreachable from
// here (§3.1). Without it the safety invariant behind every adopt is prose with no implementation,
// so the default REFUSES rather than permits — an unwired module must never adopt.
let hooks = { isIdle: () => false, onChange: () => {}, onAdopted: () => {}, reload: () => {} }
export function initSync(h) { hooks = { ...hooks, ...h } }

// The last thing that actually happened, for §9.3's evidence-based status. `tag` is a transport tag
// or 'ok'; `pending` holds the cloud row behind an unresolved conflict prompt.
let lastTag = 'idle'
let busy = false
let pending = null
let debounceT = null

function notify() { try { hooks.onChange() } catch { /* a broken listener must not break sync */ } }

function settle(tag) { lastTag = tag; notify(); return tag }

// Everything ui.js needs to render, and nothing it could mutate. `dirty` is derived here rather
// than stored, for the three reasons deriveDirty documents.
export function status() {
  const rec = readRecord()
  if (!SYNC_URL) return { on: false, available: false, reason: 'disabled', tag: lastTag }
  if (!rec) return { on: false, available: storageWorks(), reason: storageWorks() ? 'off' : 'no-storage', tag: lastTag }
  return {
    on: true,
    available: true,
    slot: rec.slot,
    code: rec.code,
    gen: rec.gen,
    pulledAt: rec.pulledAt || 0,
    dirty: deriveDirty(rec),
    busy,
    tag: lastTag,
    conflict: pending,
  }
}

// §8: private browsing is not a silent no-op. Without a durable record every page load would mint a
// new code and orphan a row, so sync genuinely cannot work — but the row says why instead of
// sitting there dead.
function storageWorks() {
  try {
    localStorage.setItem(RECORD_KEY + ':probe', '1')
    localStorage.removeItem(RECORD_KEY + ':probe')
    return true
  } catch { return false }
}

// ---- push ------------------------------------------------------------------------------------

// Returns a transport tag. Serialised per device, and a no-op when the disk already matches what we
// last pushed — so every trigger can call it unconditionally and only a real change costs a request.
export async function push() {
  return withLock(async () => {
    const rec = readRecord()
    if (!SYNC_URL || !rec) return 'idle'
    const blob = exportSlot(rec.slot)
    if (blob == null) return 'idle' // nothing on disk to push
    const h = hash(blob)
    if (h === rec.syncedHash) return settle('ok') // clean
    const reqId = uuid()
    // WRITTEN BEFORE THE REQUEST, and that ordering is the whole lost-ACK mechanism (§6.4): a push
    // whose response never arrives can only be recognised as ours on the next GET if the reqId we
    // sent is already on disk. Persist it after the request and a dropped response is
    // indistinguishable from someone else's write — which the player is then shown as a conflict
    // between their save and their own save.
    writeRecord({ ...rec, reqId })
    busy = true; notify()
    const r = await call('PUT', rec.code, {
      baseGen: rec.gen, blob, savedAt: savedAtOf(blob), device: rec.device, reqId,
    })
    busy = false
    // Re-read rather than spreading the stale `rec`: an adopt or an unlink may have rewritten the
    // record while this request was in flight, and resurrecting the old one would undo it.
    const now = readRecord()
    if (!now || now.code !== rec.code) return settle('ok')
    if (r.tag === 'ok') {
      writeRecord({ ...now, gen: Number(r.body?.gen) || now.gen, syncedHash: h, reqId })
      return settle('ok')
    }
    if (r.tag === 'conflict') { pending = { ...r.body, context: 'steady' }; return settle('conflict') }
    if (r.tag === 'notFound') {
      // The row was deleted out from under us (§8). baseGen 0 means "I believe no row exists", so
      // the very next push recreates it rather than 409ing against a row that no longer exists.
      writeRecord({ ...now, gen: 0 })
      return settle('notFound')
    }
    return settle(r.tag)
  })
}

// Push trigger 3 (§6.3): a 10s trailing debounce after any save on the synced slot, so a burst of
// shop purchases collapses into one request and a tab closed without ever being hidden loses at
// most ten seconds of menu shopping.
export function noteSave(slot) {
  const rec = readRecord()
  if (!SYNC_URL || !rec || slot !== rec.slot) return
  clearTimeout(debounceT)
  debounceT = setTimeout(() => { push() }, PUSH_DEBOUNCE_MS)
}

// Triggers 1 and 2 want the pending debounce flushed now rather than in ten seconds.
export function pushNow() {
  clearTimeout(debounceT)
  return push()
}

// ---- pull ------------------------------------------------------------------------------------

// The one entry that pulls, runs §6.2's table and acts on it. `force` skips the throttle, for the
// triggers that are a deliberate act (linking, the sheet opening) rather than an ambient poll.
export async function evaluate({ force = false } = {}) {
  const rec = readRecord()
  if (!SYNC_URL || !rec || busy || pending) return 'idle'
  // Math.abs, not a bare subtraction: a clock that steps BACKWARDS makes the difference negative,
  // which suppresses every pull for the duration of the jump — during which the device runs on a
  // stale save and accumulates divergence.
  if (!force && Math.abs(nowMs() - (rec.pulledAt || 0)) < PULL_THROTTLE_MS) return 'idle'
  busy = true; notify()
  const r = await call('GET', rec.code)
  busy = false
  const live = readRecord()
  if (!live || live.code !== rec.code) return settle('ok') // unlinked mid-flight
  if (r.tag === 'notFound') {
    // Outside pairing a 404 means the row was deleted: treat as baseGen 0 and push (§8).
    writeRecord({ ...live, gen: 0, pulledAt: nowMs() })
    return deriveDirty(live) ? pushNow() : settle('ok')
  }
  if (r.tag !== 'ok') return settle(r.tag)
  const cloud = r.body

  // §6.4 BEFORE the table, not after: an ACKed push whose response we lost leaves cloud.gen one
  // ahead of ours while the row is OURS. Left to the table that reads as cloudGen > baseGen with a
  // dirty disk — a conflict prompt between the player's save and their own save. Adopting the gen
  // first collapses it to the ordinary `push` it always was.
  const base = isOwnLostAck(cloud, live) ? cloud.gen : live.gen
  const { action, baseGen, resynced } = decide({ dirty: deriveDirty(live), cloudGen: cloud.gen, baseGen: base })
  if (baseGen !== live.gen) writeRecord({ ...readRecord(), gen: baseGen })
  if (resynced) lastTag = 'resynced'

  if (action === 'push') { markPulled(); return pushNow() }
  if (action === 'nothing') { markPulled(); return settle('ok') }
  if (action === 'conflict') { pending = { ...cloud, context: 'steady' }; return settle('conflict') }

  // action === 'pull'
  if (cloud.blob == null) {
    // A TOMBSTONE, and this build has no confirm for one (plan D1: reset is dev-only, so nothing a
    // player can reach produces one). Take the generation so we stop re-asking, and let the ordinary
    // dirty path push our save back up — a real save outranks a deletion nobody in this build could
    // have requested. ponytail: build §5.4's "This save was erased" confirm the day reset becomes
    // player-reachable again; the DELETE endpoint and its idempotency are already there.
    writeRecord({ ...readRecord(), gen: cloud.gen })
    markPulled()
    return deriveDirty(readRecord()) ? pushNow() : settle('ok')
  }
  const verdict = adopt({ record: readRecord(), blob: cloud.blob, gen: cloud.gen, isIdle: hooks.isIdle })
  if (verdict === 'adopted') { hooks.onAdopted('pulled'); hooks.reload(); return settle('adopted') }
  // NEVER MARK PULLED HERE. A blocked adopt is a decision that was not made, and bumping pulledAt
  // would let the 10s throttle remember it — so nothing re-evaluates and the device plays on a save
  // it has already been told is stale (§6.3).
  return settle(verdict === 'not-idle' ? 'ok' : verdict)
}

function markPulled() {
  const rec = readRecord()
  if (rec) writeRecord({ ...rec, pulledAt: nowMs() })
}

// ---- pairing ---------------------------------------------------------------------------------

// Device A (§5.1). Mints, commits the record, and uploads IMMEDIATELY — push trigger 4, which is
// not a saveMeta and therefore matches none of the other three. Without it device A shows a code,
// the player types all sixteen characters correctly on the laptop, and gets a 404.
// The caller shows the code only on 'ok', which is what the sheet's uploading → ready states are.
export async function link(slot) {
  if (!SYNC_URL) return 'disabled'
  if (exportSlot(slot) == null) return 'no-save'
  const rec = { code: newCode(), slot, device: uuid(), gen: 0, syncedHash: '', reqId: '', pulledAt: 0 }
  if (!writeRecord(rec)) return settle('no-storage')
  const tag = await push()
  if (tag !== 'ok') clearRecord() // never leave a half-linked device holding a code nothing answers
  notify()
  return tag
}

// Device B, step 1: does this code have a save behind it? Returns the transport tag plus the cloud
// row, so the caller can render the destination picker against something real.
export async function lookup(typed) {
  const code = canonicalize(typed)
  if (!code) return { tag: 'badCode' }
  if (!SYNC_URL) return { tag: 'disabled' }
  busy = true; notify()
  const r = await call('GET', code)
  busy = false; notify()
  return { ...r, code }
}

// Device B, step 2: the player has pointed at a slot (§5.3). An EMPTY slot adopts outright — the
// common path, and nothing is destroyed. An OCCUPIED one returns 'conflict' and the caller shows
// the §7.2 prompt with that slot's save on one side and the cloud's on the other, because an
// overwrite must be one the player steered into rather than a side effect of linking two devices.
export function joinInto({ code, slot, cloud }) {
  if (exportSlot(slot) != null) {
    pending = { ...cloud, context: 'pairing', code, slot }
    notify()
    return 'conflict'
  }
  const rec = { code, slot, device: uuid(), gen: 0, syncedHash: '', reqId: '', pulledAt: 0 }
  if (!writeRecord(rec)) return settle('no-storage')
  const verdict = adopt({ record: rec, blob: cloud.blob, gen: cloud.gen, isIdle: hooks.isIdle })
  if (verdict !== 'adopted') { clearRecord(); return settle(verdict) }
  // SUCCESS IS CONFIRMED. Sixteen typed characters and a slot choice ending in a silent reload
  // is indistinguishable from failure on a slow connection (§9.2).
  hooks.onAdopted('linked')
  hooks.reload()
  return settle('adopted')
}

// Unlinking deletes the LOCAL record only — the cloud row is untouched, so re-pairing with the same
// code restores everything. That is the rollback story for the whole feature, and (plan D1) the only
// erase-adjacent control a player has.
export function unlink() {
  clearTimeout(debounceT)
  pending = null
  clearRecord()
  return settle('off')
}

// ---- conflict resolution (§7.3) ---------------------------------------------------------------

// choice: 'local' | 'cloud' | 'later'. Returns a tag; 'adopted' means the caller's reload is running.
export async function resolveConflict(choice) {
  const c = pending
  if (!c) return 'idle'
  if (choice === 'later') {
    // The only one of the three that writes nothing, which is why it is the only one safe to reach
    // by accident. The disk still hashes differently, so the next trigger asks again.
    pending = null
    return settle('later')
  }
  // At pairing the record does not exist yet — the player is choosing what to do with a slot they
  // just pointed at, so commit the pairing first and let the branches below act on it.
  let rec = readRecord()
  if (c.context === 'pairing') {
    rec = { code: c.code, slot: c.slot, device: uuid(), gen: 0, syncedHash: '', reqId: '', pulledAt: 0 }
    if (!writeRecord(rec)) return settle('no-storage')
  }
  if (!rec) { pending = null; return settle('off') }

  if (choice === 'cloud') {
    stashDiscarded(exportSlot(rec.slot))
    const verdict = adopt({ record: rec, blob: c.blob, gen: c.gen, isIdle: hooks.isIdle })
    if (verdict !== 'adopted') {
      if (c.context === 'pairing') clearRecord()
      return settle(verdict)
    }
    pending = null
    hooks.onAdopted(c.context === 'pairing' ? 'linked' : 'pulled')
    hooks.reload()
    return settle('adopted')
  }
  // 'local' — push over the cloud's generation. Nobody else moved in between, so the write is
  // accepted and the row advances holding this device's blob; the cloud's previous content survives
  // in prev_blob. No reload: the local save was already the truth on this device.
  writeRecord({ ...rec, gen: Number(c.gen) || 0, syncedHash: '' })
  pending = null
  return pushNow()
}

// The local counterpart to the server's prev_blob (§7.3). One key, overwritten each time. It exists
// because "Take the cloud's" is the button a player is MORE likely to hit by accident than the
// operator-only case prev_blob covers, and symmetry here is the difference between a recoverable
// mis-tap and a lost session. No UI reads it — an escape hatch, stated plainly so nobody mistakes
// it for a feature.
function stashDiscarded(blob) {
  if (blob == null) return
  try { localStorage.setItem(RECORD_KEY + ':discarded', blob) } catch { /* private mode */ }
}

export { RECORD_KEY, SYNC_URL, PULL_THROTTLE_MS, PUSH_DEBOUNCE_MS, TIMEOUT_MS }
