import { apiClient } from "@/lib/api-client";
import type {
  RecordingResponse,
  RecordingCreateRequest,
  DeleteRecordingResponse,
  ProcessRecordingResponse,
  SyncResponse,
  ConsistencyResponse,
  ClassificationResponse,
  ObsidianExportRequest,
  ObsidianExportResponse,
} from "@/types/api";

export const recordingsApi = {
  list(): Promise<RecordingResponse[]> {
    return apiClient.get("/recordings");
  },

  get(id: number): Promise<RecordingResponse> {
    return apiClient.get(`/recordings/${id}`);
  },

  create(body?: RecordingCreateRequest): Promise<RecordingResponse> {
    return apiClient.post("/recordings", body);
  },

  stop(id: number): Promise<RecordingResponse> {
    return apiClient.patch(`/recordings/${id}/stop`);
  },

  delete(id: number): Promise<DeleteRecordingResponse> {
    return apiClient.delete(`/recordings/${id}`);
  },

  process(id: number): Promise<ProcessRecordingResponse> {
    return apiClient.post(`/recordings/${id}/process`);
  },

  sync(): Promise<SyncResponse> {
    return apiClient.post("/recordings/sync");
  },

  consistency(): Promise<ConsistencyResponse> {
    return apiClient.get("/recordings/consistency");
  },

  classifications(id: number): Promise<ClassificationResponse[]> {
    return apiClient.get(`/recordings/${id}/classifications`);
  },

  export(
    id: number,
    body?: ObsidianExportRequest,
  ): Promise<ObsidianExportResponse> {
    return apiClient.post(`/recordings/${id}/export`, body);
  },
} as const;
