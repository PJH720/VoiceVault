CREATE TABLE IF NOT EXISTS speaker_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  embedding BLOB,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS speaker_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id INTEGER NOT NULL,
  speaker_profile_id INTEGER,
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  raw_speaker_label TEXT NOT NULL,
  FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE,
  FOREIGN KEY (speaker_profile_id) REFERENCES speaker_profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_speaker_segments_recording ON speaker_segments(recording_id);
CREATE INDEX IF NOT EXISTS idx_speaker_segments_profile ON speaker_segments(speaker_profile_id);
