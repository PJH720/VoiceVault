CREATE TABLE IF NOT EXISTS summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id INTEGER NOT NULL,
  summary_text TEXT NOT NULL,
  action_items TEXT,
  discussion_points TEXT,
  key_statements TEXT,
  decisions TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_summaries_recording ON summaries(recording_id);
