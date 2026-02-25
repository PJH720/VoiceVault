import { apiClient } from "@/lib/api-client";
import type { RAGQueryRequest, RAGQueryResponse } from "@/types/api";

export const ragApi = {
  query(request: RAGQueryRequest): Promise<RAGQueryResponse> {
    return apiClient.post("/rag/query", request);
  },
} as const;
