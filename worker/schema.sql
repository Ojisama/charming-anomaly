-- Design §4.3. One row per pairing code. No secondary index: every query is a primary-key point
-- lookup on `id`, and at ~1 KB/row against a 5 GB allowance nothing needs sweeping.
CREATE TABLE IF NOT EXISTS saves (
  id         TEXT    PRIMARY KEY,  -- lowercase hex SHA-256 of the pairing code; the code is never stored
  gen        INTEGER NOT NULL,     -- optimistic-concurrency counter, +1 per accepted write
  blob       TEXT,                 -- the meta JSON verbatim, opaque to the Worker; NULL = tombstone (§5.4)
  saved_at   INTEGER NOT NULL,     -- writer's clock, epoch ms — display only, never compared
  device     TEXT    NOT NULL,     -- last writer's device id; used only for the lost-ACK check (§6.4)
  req_id     TEXT    NOT NULL,     -- last writer's per-push idempotency key (§6.4)
  updated_at INTEGER NOT NULL,     -- server clock, epoch ms; no reader today, but unreconstructable later
  prev_blob  TEXT,                 -- the blob this write replaced; operator-only undo (§7.3)
  prev_gen   INTEGER
);
