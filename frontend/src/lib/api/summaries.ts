import { apiClient } from "@/lib/api-client";
import type {
  SummaryResponse,
  HourSummaryResponse,
  ExtractRangeRequest,
  ExtractRangeResponse,
} from "@/types/api";

export const summariesApi = {
  list(recordingId: number): Promise<SummaryResponse[]> {
    return apiClient.get(`/recordings/${recordingId}/summaries`);
  },

  hourSummaries(recordingId: number): Promise<HourSummaryResponse[]> {
    return apiClient.get(`/recordings/${recordingId}/hour-summaries`);
  },

  extractRange(
    recordingId: number,
    body: ExtractRangeRequest,
  ): Promise<ExtractRangeResponse> {
    return apiClient.post(`/recordings/${recordingId}/extract`, body);
  },
} as const;
