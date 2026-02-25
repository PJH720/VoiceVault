import { App, Notice, PluginSettingTab, Setting, requestUrl } from "obsidian";
import type VoiceVaultPlugin from "../main";

export class VoiceVaultSettingTab extends PluginSettingTab {
  plugin: VoiceVaultPlugin;

  constructor(app: App, plugin: VoiceVaultPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "VoiceVault Settings" });

    // Backend URL
    new Setting(containerEl)
      .setName("Backend URL")
      .setDesc("The URL of your VoiceVault backend server.")
      .addText((text) =>
        text
          .setPlaceholder("http://localhost:8000")
          .setValue(this.plugin.settings.backendUrl)
          .onChange(async (value) => {
            this.plugin.settings.backendUrl = value;
            await this.plugin.saveSettings();
          }),
      );

    // API Key
    new Setting(containerEl)
      .setName("API Key")
      .setDesc("Bearer token for plugin authentication (leave empty if not required).")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("Enter your API key")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          });
      });

    // Test connection button
    new Setting(containerEl)
      .setName("Test Connection")
      .setDesc("Check if the backend is reachable.")
      .addButton((btn) =>
        btn
          .setButtonText("Test")
          .setCta()
          .onClick(async () => {
            btn.setButtonText("Testing...");
            btn.setDisabled(true);
            try {
              const url = `${this.plugin.settings.backendUrl}/api/v1/health`;
              const response = await requestUrl({ url, method: "GET" });
              if (response.status === 200) {
                new Notice("Connected to VoiceVault backend!");
              } else {
                new Notice(`Connection failed: HTTP ${response.status}`);
              }
            } catch {
              new Notice("Connection failed: Could not reach backend.");
            } finally {
              btn.setButtonText("Test");
              btn.setDisabled(false);
            }
          }),
      );

    containerEl.createEl("h3", { text: "Export Settings" });

    // Export Folder
    new Setting(containerEl)
      .setName("Export Folder")
      .setDesc("Folder path within your vault for exported recordings.")
      .addText((text) =>
        text
          .setPlaceholder("VoiceVault/Recordings")
          .setValue(this.plugin.settings.exportFolder)
          .onChange(async (value) => {
            this.plugin.settings.exportFolder = value;
            await this.plugin.saveSettings();
          }),
      );

    // Folder Structure
    new Setting(containerEl)
      .setName("Folder Structure")
      .setDesc("How to organize exported files.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("date", "By date (YYYY-MM-DD)")
          .addOption("type", "By classification type")
          .addOption("flat", "Flat (no subfolders)")
          .setValue(this.plugin.settings.folderStructure)
          .onChange(async (value) => {
            this.plugin.settings.folderStructure = value as
              | "date"
              | "type"
              | "flat";
            await this.plugin.saveSettings();
          }),
      );

    // Include Transcript
    new Setting(containerEl)
      .setName("Include Transcript")
      .setDesc("Include the full transcript in exported Markdown files.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeTranscript)
          .onChange(async (value) => {
            this.plugin.settings.includeTranscript = value;
            await this.plugin.saveSettings();
          }),
      );

    // Include Wikilinks
    new Setting(containerEl)
      .setName("Include Wikilinks")
      .setDesc("Add [[wikilinks]] to related recordings based on RAG similarity.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeWikilinks)
          .onChange(async (value) => {
            this.plugin.settings.includeWikilinks = value;
            await this.plugin.saveSettings();
          }),
      );

    // Auto Export on Stop
    new Setting(containerEl)
      .setName("Auto Export on Stop")
      .setDesc("Automatically export recordings when they finish processing.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoExportOnStop)
          .onChange(async (value) => {
            this.plugin.settings.autoExportOnStop = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
