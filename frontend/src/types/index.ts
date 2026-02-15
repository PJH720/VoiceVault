/**
 * Shared TypeScript types for VoiceVault frontend.
 *
 * Re-exports API types for convenience.
 * Domain-specific types that don't come from the API can live here.
 */

export type {
  RecordingStatus,
  RecordingResponse,
  RecordingCreateRequest,
  SummaryResponse,
  HourSummaryResponse,
  ClassificationResponse,
  TemplateResponse,
  RAGQueryRequest,
  RAGQueryResponse,
  RAGSource,
  ObsidianExportResponse,
} from "./api";

// Legacy aliases — keep until all consumers migrate to @/types/api
export type Recording = import("./api").RecordingResponse;
export type Summary = import("./api").SummaryResponse;
