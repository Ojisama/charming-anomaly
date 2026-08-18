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
-- One index per board, and EACH MUST COVER THE WHOLE ORDER BY, `at` included. Without the trailing
-- `at` SQLite can seek the partition but not the order, so it materialises every row for that
-- (chapter, difficulty) and sorts:
--     SEARCH scores USING INDEX scores_kills (chapter=? AND difficulty=?)
--     USE TEMP B-TREE FOR LAST TERM OF ORDER BY
-- which is the read this table's "no pruning, rows accumulate forever" decision is predicated on
-- NOT being. With `at` in the index both plans are a bare SEARCH with no sort at all.
-- The second index carries kills as a tiebreak so two runs that reached the same level order by
-- the more convincing one rather than by insertion accident.
--
-- DROPPED FIRST, and that is the point: `CREATE INDEX IF NOT EXISTS` on an index that already
-- exists is a silent no-op — it does not alter it — so a deployment that already ran the first
-- version of this file would keep the sorting plan forever and this comment would be a lie.
DROP INDEX IF EXISTS scores_kills;
DROP INDEX IF EXISTS scores_level;
CREATE INDEX IF NOT EXISTS scores_kills ON scores (chapter, difficulty, kills DESC, at ASC);
CREATE INDEX IF NOT EXISTS scores_level ON scores (chapter, difficulty, level DESC, kills DESC, at ASC);
