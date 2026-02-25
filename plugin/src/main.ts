import { Notice, Plugin, requestUrl } from "obsidian";
import { DEFAULT_SETTINGS, type VoiceVaultSettings } from "./settings";
import { VoiceVaultSettingTab } from "./ui/SettingTab";

export default class VoiceVaultPlugin extends Plugin {
  settings: VoiceVaultSettings = DEFAULT_SETTINGS;

  private ribbonIconEl: HTMLElement | null = null;
  private isBackendConnected = false;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Initial health check
    await this.checkBackendHealth();

    // Ribbon icon — reflects connection state
    this.ribbonIconEl = this.addRibbonIcon(
      "mic",
      "VoiceVault",
      () => {
        if (!this.isBackendConnected) {
          new Notice("VoiceVault: Backend is not connected. Check settings.");
          return;
        }
        new Notice("VoiceVault: Connected");
      },
    );
    this.updateRibbonState();

    // Command: RAG Search
    this.addCommand({
      id: "rag-search",
      name: "RAG Search",
      callback: () => {
        if (!this.isBackendConnected) {
          new Notice("VoiceVault: Backend is not connected.");
          return;
        }
        new Notice("VoiceVault: RAG Search — coming in v0.6.0");
      },
    });

    // Settings tab
    this.addSettingTab(new VoiceVaultSettingTab(this.app, this));

    // Periodic health check every 30 seconds
    this.registerInterval(
      window.setInterval(() => {
        this.checkBackendHealth();
      }, 30000),
    );
  }

  onunload(): void {
    // registerEvent and registerInterval are automatically cleaned up by Obsidian
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData(),
    );
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async checkBackendHealth(): Promise<void> {
    try {
      const url = `${this.settings.backendUrl}/api/v1/health`;
      const response = await requestUrl({ url, method: "GET" });
      this.isBackendConnected = response.status === 200;
    } catch {
      this.isBackendConnected = false;
    }
    this.updateRibbonState();
  }

  private updateRibbonState(): void {
    if (!this.ribbonIconEl) return;

    if (this.isBackendConnected) {
      this.ribbonIconEl.ariaLabel = "VoiceVault (connected)";
      this.ribbonIconEl.removeClass("voicevault-disconnected");
      this.ribbonIconEl.addClass("voicevault-connected");
    } else {
      this.ribbonIconEl.ariaLabel = "VoiceVault (disconnected)";
      this.ribbonIconEl.removeClass("voicevault-connected");
      this.ribbonIconEl.addClass("voicevault-disconnected");
    }
  }
}
