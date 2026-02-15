/**
 * API response types matching backend Pydantic models.
 *
 * Field names use snake_case to match the JSON wire format from FastAPI.
 * Keep in sync with backend/src/core/models.py.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type RecordingStatus =
  | "active"
  | "processing"
  | "completed"
  | "failed"
  | "imported";

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/** Standard error body returned by the backend error_handler middleware. */
export interface ApiErrorBody {
  detail: string;
  code: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: string;
  version: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

export interface RecordingResponse {
  id: number;
  title: string | null;
  context: string | null;
  status: RecordingStatus;
  started_at: string;
  ended_at: string | null;
  total_minutes: number;
  audio_path: string | null;
}

export interface RecordingCreateRequest {
  title?: string;
  context?: string;
}

export interface DeleteRecordingResponse {
  recording_id: number;
  db_deleted: boolean;
  audio_deleted: boolean;
  exports_deleted: number;
  vectors_deleted: number;
}

export interface ProcessRecordingResponse {
  recording_id: number;
  status: string;
  total_minutes: number;
  transcripts_created: number;
  summaries_created: number;
  embeddings_created: number;
}

export interface SyncResponse {
  scanned: number;
  new_imports: number;
  already_exists: number;
  errors: string[];
}

export interface OrphanRecord {
  recording_id: number;
  audio_path: string | null;
  reason: string;
}

export interface OrphanFile {
  file_path: string;
  reason: string;
}

export interface ConsistencyResponse {
  total_db_records: number;
  total_fs_files: number;
  orphan_records: OrphanRecord[];
  orphan_files: OrphanFile[];
  healthy_count: number;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface TranscriptionCorrection {
  original: string;
  corrected: string;
  reason: string;
}

export interface SummaryResponse {
  id: number;
  recording_id: number;
  minute_index: number;
  summary_text: string;
  keywords: string[];
  confidence: number;
  corrections: TranscriptionCorrection[];
  created_at: string;
}

export interface HourSummaryResponse {
  id: number;
  recording_id: number;
  hour_index: number;
  summary_text: string;
  keywords: string[];
  topic_segments: Record<string, unknown>[];
  token_count: number;
  model_used: string;
  created_at: string;
}

export interface ExtractRangeRequest {
  start_minute: number;
  end_minute: number;
}

export interface ExtractRangeResponse {
  recording_id: number;
  start_minute: number;
  end_minute: number;
  summary_text: string;
  keywords: string[];
  included_minutes: number[];
  source_count: number;
  model_used: string;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export interface ClassificationResponse {
  id: number;
  recording_id: number;
  template_name: string;
  start_minute: number;
  end_minute: number;
  confidence: number;
  result: Record<string, unknown>;
  export_path: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

export interface TemplateResponse {
  id: number;
  name: string;
  display_name: string;
  triggers: string[];
  output_format: string;
  fields: Record<string, unknown>[];
  icon: string;
  priority: number;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

export interface TemplateCreateRequest {
  name: string;
  display_name: string;
  triggers: string[];
  output_format?: string;
  fields: Record<string, unknown>[];
  icon: string;
  priority: number;
}

export interface TemplateUpdateRequest {
  display_name?: string;
  triggers?: string[];
  output_format?: string;
  fields?: Record<string, unknown>[];
  icon?: string;
  priority?: number;
  is_active?: boolean;
}

// ---------------------------------------------------------------------------
// RAG
// ---------------------------------------------------------------------------

export interface RAGQueryRequest {
  query: string;
  top_k?: number;
  min_similarity?: number;
  date_from?: string;
  date_to?: string;
  category?: string;
  keywords?: string[];
}

export interface RAGSource {
  recording_id: number;
  minute_index: number;
  summary_text: string;
  similarity: number;
  date: string;
  category: string;
}

export interface RAGQueryResponse {
  answer: string;
  sources: RAGSource[];
  model_used: string;
  query_time_ms: number;
}

export interface ReindexResponse {
  reindexed: number;
  errors: number;
  total_in_store: number;
}

// ---------------------------------------------------------------------------
// Export (Obsidian)
// ---------------------------------------------------------------------------

export interface ObsidianExportRequest {
  format?: string;
  include_transcript?: boolean;
  vault_path?: string;
}

export interface ObsidianExportResponse {
  file_path: string;
  markdown_content: string;
  frontmatter: Record<string, unknown>;
}
