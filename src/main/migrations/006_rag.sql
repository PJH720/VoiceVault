CREATE TABLE IF NOT EXISTS vector_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id INTEGER NOT NULL,
  segment_id INTEGER,
  text TEXT NOT NULL,
  embedding BLOB NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE,
  FOREIGN KEY (segment_id) REFERENCES transcript_segments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vectors_recording ON vector_documents(recording_id);
CREATE INDEX IF NOT EXISTS idx_vectors_segment ON vector_documents(segment_id);

CREATE TABLE IF NOT EXISTS search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  result_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_search_history_created ON search_history(created_at DESC);
