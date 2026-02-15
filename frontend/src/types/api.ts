/**
 * API types for VoiceVault frontend.
 *
 * Schema-backed types are re-exported from the auto-generated file
 * (api.generated.ts) produced by openapi-typescript against docs/openapi.json.
 * Run `pnpm gen:types` to regenerate after backend model changes.
 *
 * Only frontend-specific types that have no OpenAPI counterpart are defined
 * directly in this file.
 */

import type { components } from "./api.generated";

// ---------------------------------------------------------------------------
// Helper – shorthand accessor for schema types
// ---------------------------------------------------------------------------

type Schema = components["schemas"];

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type RecordingStatus = Schema["RecordingStatus"];

// ---------------------------------------------------------------------------
// Error (frontend-only – not in OpenAPI spec)
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

export type HealthResponse = Schema["HealthResponse"];

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

export type RecordingResponse = Schema["RecordingResponse"];
export type RecordingCreateRequest = Schema["RecordingCreate"];
export type DeleteRecordingResponse = Schema["DeleteRecordingResponse"];
export type ProcessRecordingResponse = Schema["ProcessRecordingResponse"];
export type SyncResponse = Schema["SyncResponse"];
export type OrphanRecord = Schema["OrphanRecord"];
export type OrphanFile = Schema["OrphanFile"];
export type ConsistencyResponse = Schema["ConsistencyResponse"];
export type CleanupRequest = Schema["CleanupRequest"];
export type CleanupResponse = Schema["CleanupResponse"];

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export type TranscriptionCorrection = Schema["TranscriptionCorrection"];
export type SummaryResponse = Schema["SummaryResponse"];
export type HourSummaryResponse = Schema["HourSummaryResponse"];
export type ExtractRangeRequest = Schema["ExtractRangeRequest"];
export type ExtractRangeResponse = Schema["ExtractRangeResponse"];

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export type ClassificationResponse = Schema["ClassificationResponse"];

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

export type TemplateResponse = Schema["TemplateResponse"];
export type TemplateCreateRequest = Schema["TemplateCreate"];

/** Partial update – frontend-only convenience type. */
export type TemplateUpdateRequest = Partial<TemplateCreateRequest> & {
  is_active?: boolean;
};

// ---------------------------------------------------------------------------
// RAG
// ---------------------------------------------------------------------------

export type RAGQueryRequest = Schema["RAGQueryRequest"];
export type RAGSource = Schema["RAGSource"];
export type RAGQueryResponse = Schema["RAGQueryResponse"];
export type ReindexResponse = Schema["ReindexResponse"];
export type ReindexDetailResponse = Schema["ReindexDetailResponse"];

// ---------------------------------------------------------------------------
// Export (Obsidian)
// ---------------------------------------------------------------------------

export type ObsidianExportRequest = Schema["ObsidianExportRequest"];
export type ObsidianExportResponse = Schema["ObsidianExportResponse"];

// ---------------------------------------------------------------------------
// Validation (from OpenAPI)
// ---------------------------------------------------------------------------

export type ValidationError = Schema["ValidationError"];
export type HTTPValidationError = Schema["HTTPValidationError"];
