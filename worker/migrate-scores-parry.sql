ALTER TABLE scores ADD COLUMN parry_pct INTEGER;
CREATE INDEX IF NOT EXISTS scores_parry ON scores (chapter, difficulty, parry_pct DESC, time_ms ASC, at ASC);
