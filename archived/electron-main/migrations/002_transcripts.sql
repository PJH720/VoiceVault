CREATE TABLE IF NOT EXISTS transcript_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  language TEXT NOT NULL DEFAULT 'auto',
  confidence REAL NOT NULL DEFAULT 0,
  words_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_segments_recording ON transcript_segments(recording_id, start_time);
CREATE INDEX IF NOT EXISTS idx_segments_time ON transcript_segments(start_time);
