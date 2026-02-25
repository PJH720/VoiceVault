export interface VoiceVaultSettings {
  backendUrl: string;
  apiKey: string;
  exportFolder: string;
  folderStructure: "date" | "type" | "flat";
  includeTranscript: boolean;
  includeWikilinks: boolean;
  autoExportOnStop: boolean;
}

export const DEFAULT_SETTINGS: VoiceVaultSettings = {
  backendUrl: "http://localhost:8000",
  apiKey: "",
  exportFolder: "VoiceVault/Recordings",
  folderStructure: "date",
  includeTranscript: true,
  includeWikilinks: true,
  autoExportOnStop: false,
};
