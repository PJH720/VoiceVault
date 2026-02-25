"use client";

import { useMutation } from "@tanstack/react-query";
import { ragApi } from "@/lib/api/rag";
import type { RAGQueryRequest, RAGQueryResponse } from "@/types/api";

export function useRAGSearch() {
  const mutation = useMutation<RAGQueryResponse, Error, RAGQueryRequest>({
    mutationFn: (request) => ragApi.query(request),
  });

  return {
    search: mutation.mutate,
    data: mutation.data,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    reset: mutation.reset,
  };
}
