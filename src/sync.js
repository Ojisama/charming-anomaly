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

export { RECORD_KEY, SYNC_URL }
