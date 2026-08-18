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

-- Leaderboard (v7.x). One row per submitted run; the podium is the top 3 by each metric. No
-- pruning and no dedup by nickname — the owner's call: "raw top 3", a board for friends.
-- ponytail: rows accumulate forever. At a few runs a day that is thousands over the game's life
-- against a 5 GB allowance, and both reads are 3-row index scans. Add a prune-on-insert if that
-- ever stops being true.
CREATE TABLE IF NOT EXISTS scores (
  chapter    TEXT    NOT NULL,  -- CHAPTERS key, opaque here: the Worker knows no chapter ids
  difficulty INTEGER NOT NULL,
  nick       TEXT    NOT NULL,  -- 3-10 chars, whatever the player typed
  kills      INTEGER NOT NULL,
  level      INTEGER NOT NULL,
  at         INTEGER NOT NULL   -- server clock, epoch ms
);
-- One index per board. The second carries kills as a tiebreak so two runs that reached the same
-- level order by the more convincing one rather than by insertion accident.
CREATE INDEX IF NOT EXISTS scores_kills ON scores (chapter, difficulty, kills DESC);
CREATE INDEX IF NOT EXISTS scores_level ON scores (chapter, difficulty, level DESC, kills DESC);
