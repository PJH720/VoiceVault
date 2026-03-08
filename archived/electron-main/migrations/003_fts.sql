CREATE VIRTUAL TABLE IF NOT EXISTS transcript_segments_fts USING fts5(
  recording_id UNINDEXED,
  text,
  content='transcript_segments',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS transcript_ai AFTER INSERT ON transcript_segments BEGIN
  INSERT INTO transcript_segments_fts(rowid, recording_id, text)
  VALUES (new.id, new.recording_id, new.text);
END;

CREATE TRIGGER IF NOT EXISTS transcript_ad AFTER DELETE ON transcript_segments BEGIN
  INSERT INTO transcript_segments_fts(transcript_segments_fts, rowid, recording_id, text)
  VALUES('delete', old.id, old.recording_id, old.text);
END;

CREATE TRIGGER IF NOT EXISTS transcript_au AFTER UPDATE ON transcript_segments BEGIN
  INSERT INTO transcript_segments_fts(transcript_segments_fts, rowid, recording_id, text)
  VALUES('delete', old.id, old.recording_id, old.text);
  INSERT INTO transcript_segments_fts(rowid, recording_id, text)
  VALUES (new.id, new.recording_id, new.text);
END;
