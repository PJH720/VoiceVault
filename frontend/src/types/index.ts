/** Shared TypeScript types for VoiceVault frontend. */

export interface Recording {
  id: number;
  started_at: string;
  ended_at: string | null;
  status: "recording" | "completed" | "error";
  total_minutes: number;
}

export interface Summary {
  id: number;
  recording_id: number;
  minute_index: number;
  summary_text: string;
  keywords: string[];
  speakers: string[];
  confidence: number;
}
