ALTER TABLE recordings ADD COLUMN template_id TEXT;
ALTER TABLE recordings ADD COLUMN classification_confidence REAL;

CREATE INDEX IF NOT EXISTS idx_recordings_template ON recordings(template_id);
