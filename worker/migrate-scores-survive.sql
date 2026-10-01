ALTER TABLE scores ADD COLUMN survive_ms INTEGER;
CREATE INDEX IF NOT EXISTS scores_survive ON scores (chapter, difficulty, survive_ms DESC, at ASC);
