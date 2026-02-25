import { apiClient } from "@/lib/api-client";
import type { ObsidianExportRequest, ObsidianExportResponse } from "@/types/api";

export const exportApi = {
  exportRecording(
    id: number,
    options?: ObsidianExportRequest,
  ): Promise<ObsidianExportResponse> {
    return apiClient.post(`/recordings/${id}/export`, options);
  },

  downloadMarkdown(filename: string, content: string): void {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
} as const;
