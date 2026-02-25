import { Notice, requestUrl, type RequestUrlParam } from "obsidian";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type VoiceVaultErrorCode = "NETWORK" | "AUTH" | "SERVER" | "TIMEOUT" | "UNKNOWN";

export class VoiceVaultApiError extends Error {
  readonly code: VoiceVaultErrorCode;
  readonly status: number;

  constructor(code: VoiceVaultErrorCode, status: number, message: string) {
    super(message);
    this.name = "VoiceVaultApiError";
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface ClientConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  showNotices?: boolean;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class VoiceVaultClient {
  private config: ClientConfig;

  constructor(config: ClientConfig) {
    this.config = config;
  }

  updateConfig(config: Partial<ClientConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.stripTrailingSlash(this.config.baseUrl)}${path}`;
    const headers: Record<string, string> = {};

    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    let lastError: VoiceVaultApiError | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        await this.sleep(delayMs);
      }

      try {
        const params: RequestUrlParam = {
          url,
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          throw: false,
        };

        const controller = new AbortController();
        const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        let response;
        try {
          response = await requestUrl(params);
        } finally {
          clearTimeout(timer);
        }

        // Classify response
        if (response.status >= 200 && response.status < 300) {
          return response.json as T;
        }

        // Auth errors — never retry
        if (response.status === 401 || response.status === 403) {
          const err = new VoiceVaultApiError(
            "AUTH",
            response.status,
            "Authentication failed. Check your API key in settings.",
          );
          this.maybeNotice(err.message);
          throw err;
        }

        // Retryable server errors
        if (RETRYABLE_STATUS_CODES.has(response.status)) {
          lastError = new VoiceVaultApiError(
            "SERVER",
            response.status,
            `Server error (${response.status}). Retrying...`,
          );
          continue;
        }

        // Non-retryable server error
        const serverErr = new VoiceVaultApiError(
          "SERVER",
          response.status,
          `Request failed with status ${response.status}`,
        );
        this.maybeNotice(serverErr.message);
        throw serverErr;
      } catch (err) {
        if (err instanceof VoiceVaultApiError) {
          if (err.code === "AUTH") throw err;
          if (err.code === "SERVER" && !RETRYABLE_STATUS_CODES.has(err.status)) throw err;
          lastError = err;
          continue;
        }

        // Network or timeout error
        if (err instanceof DOMException && err.name === "AbortError") {
          lastError = new VoiceVaultApiError("TIMEOUT", 0, "Request timed out");
          continue;
        }

        lastError = new VoiceVaultApiError(
          "NETWORK",
          0,
          "Could not reach the VoiceVault backend. Is it running?",
        );
        continue;
      }
    }

    // All retries exhausted
    const finalError =
      lastError ??
      new VoiceVaultApiError("UNKNOWN", 0, "Request failed after retries");
    this.maybeNotice(finalError.message);
    throw finalError;
  }

  private maybeNotice(message: string): void {
    if (this.config.showNotices !== false) {
      new Notice(`VoiceVault: ${message}`);
    }
  }

  private stripTrailingSlash(url: string): string {
    return url.endsWith("/") ? url.slice(0, -1) : url;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
