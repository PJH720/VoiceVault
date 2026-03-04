---
name: Plan 10 - System Audio Capture
overview: 회의 앱 오디오 수집을 위해 시스템 오디오 캡처, 소스 선택, 권한 처리, 마이크-시스템 믹싱을 포함한 크로스플랫폼 캡처 기능을 구현하는 실행 플랜입니다.
todos:
  - id: system-audio-service
    content: 플랫폼별 시스템 오디오 캡처 서비스를 구현한다.
    status: completed
  - id: permissions-and-sources
    content: 권한 확인/요청 및 소스 열거/선택 흐름을 구현한다.
    status: completed
  - id: audio-mixing
    content: 마이크/시스템 오디오 동시 캡처와 믹싱 처리를 구현한다.
    status: completed
  - id: source-selector-ui
    content: 오디오 소스 선택 및 상태 피드백 UI를 구현한다.
    status: completed
  - id: system-audio-tests
    content: 주요 플랫폼 시나리오와 오류 복구 플로우를 검증한다.
    status: completed
isProject: true
---

# Plan 10: System Audio Capture

**Phase:** 6 — System Audio
**Priority:** P2 (Nice-to-Have)
**Effort:** ~2 weeks
**Prerequisites:** Plan 01 (audio recording), Plan 02 (transcription)

## Overview

Implement system audio capture for recording Zoom, Google Meet, Microsoft Teams, and other app audio using `native-audio-node`. Support audio source selection (mic only, system only, or both), mixing multiple sources, macOS Screen Recording permission handling, loopback capture, and audio routing. Provide UI for source management and meeting platform auto-detection.

## Architecture

### Native Layer

- `src/main/services/SystemAudioService.ts` — wraps `native-audio-node` for system audio
- Platform-specific implementations: CoreAudio (macOS), PulseAudio (Linux), WASAPI (Windows)
- Audio mixing handled in main process before transcription

### IPC Bridge

- `system-audio:list-sources` — enumerate audio devices and apps
- `system-audio:start-capture` — start system audio capture
- `system-audio:stop-capture` — stop capture
- `system-audio:set-source` — select audio source
- `system-audio:check-permissions` — check Screen Recording permission (macOS)
- `system-audio:request-permissions` — open System Preferences to permissions

### React Layer

- `src/renderer/components/Audio/AudioSourceSelector.tsx` — device/app picker
- `src/renderer/components/Audio/PermissionPrompt.tsx` — macOS permission instructions
- `src/renderer/components/Audio/MixerControls.tsx` — volume controls for each source

## Implementation Steps

### 1. System Audio Service (Main Process)

1. Install `native-audio-node` (`pnpm add native-audio-node`)
2. Create `SystemAudioService` wrapping platform-specific audio capture
3. Implement device enumeration (input/output devices + app-specific sources)
4. Handle audio mixing (mic + system audio)

```typescript
// src/main/services/SystemAudioService.ts
import { AudioCapture, AudioDevice, AudioSource } from 'native-audio-node';
import { systemPreferences } from 'electron';

export interface AudioSourceInfo {
  id: string;
  name: string;
  type: 'input' | 'output' | 'app';
  isDefault: boolean;
  appName?: string; // For app-specific sources (e.g., "Zoom", "Google Chrome")
}

export interface CaptureConfig {
  micSource?: string;
  systemSource?: string;
  mixMode: 'mic-only' | 'system-only' | 'both';
  micVolume: number; // 0.0 - 1.0
  systemVolume: number; // 0.0 - 1.0
}

export class SystemAudioService {
  private capture: AudioCapture | null = null;
  private currentConfig: CaptureConfig | null = null;

  async listSources(): Promise<AudioSourceInfo[]> {
    const sources: AudioSourceInfo[] = [];

    if (process.platform === 'darwin') {
      // macOS: CoreAudio enumeration
      const devices = await AudioCapture.listDevices();

      devices.forEach(device => {
        sources.push({
          id: device.id,
          name: device.name,
          type: device.type === 'input' ? 'input' : 'output',
          isDefault: device.isDefault,
        });
      });

      // App-specific sources (requires Screen Recording permission)
      if (await this.hasScreenRecordingPermission()) {
        const apps = await AudioCapture.listRunningApps();

        apps.forEach(app => {
          if (this.isMeetingApp(app.name)) {
            sources.push({
              id: `app:${app.pid}`,
              name: app.name,
              type: 'app',
              isDefault: false,
              appName: app.name,
            });
          }
        });
      }
    } else if (process.platform === 'linux') {
      // Linux: PulseAudio enumeration
      // ... implementation
    } else if (process.platform === 'win32') {
      // Windows: WASAPI enumeration
      // ... implementation
    }

    return sources;
  }

  async startCapture(config: CaptureConfig): Promise<AsyncIterableIterator<Float32Array>> {
    this.currentConfig = config;

    if (process.platform === 'darwin') {
      return this.startCaptureCoreaudio(config);
    } else if (process.platform === 'linux') {
      return this.startCapturePulseAudio(config);
    } else {
      return this.startCaptureWASAPI(config);
    }
  }

  private async startCaptureCoreaudio(config: CaptureConfig): Promise<AsyncIterableIterator<Float32Array>> {
    const sources: string[] = [];

    if (config.mixMode === 'mic-only' || config.mixMode === 'both') {
      if (config.micSource) sources.push(config.micSource);
    }

    if (config.mixMode === 'system-only' || config.mixMode === 'both') {
      if (config.systemSource) sources.push(config.systemSource);
    }

    this.capture = new AudioCapture({
      sources,
      sampleRate: 16000,
      channels: 1,
      format: 'float32',
    });

    const stream = this.capture.start();

    // Mix audio streams if both sources
    if (config.mixMode === 'both') {
      return this.mixAudioStreams(stream, config);
    }

    return stream;
  }

  private async *mixAudioStreams(
    stream: AsyncIterableIterator<Float32Array>,
    config: CaptureConfig
  ): AsyncIterableIterator<Float32Array> {
    for await (const buffer of stream) {
      // Apply volume scaling
      const mixed = new Float32Array(buffer.length);

      for (let i = 0; i < buffer.length; i++) {
        // Simple mixing: weighted average
        // Note: native-audio-node may provide separate buffers per source
        // This is a simplified example
        mixed[i] = buffer[i] * 0.5; // Normalize to prevent clipping
      }

      yield mixed;
    }
  }

  async stopCapture(): Promise<void> {
    if (this.capture) {
      this.capture.stop();
      this.capture = null;
    }
    this.currentConfig = null;
  }

  async hasScreenRecordingPermission(): Promise<boolean> {
    if (process.platform !== 'darwin') return true;

    // macOS 10.15+ requires Screen Recording permission for app audio capture
    const status = systemPreferences.getMediaAccessStatus('screen');
    return status === 'granted';
  }

  async requestScreenRecordingPermission(): Promise<void> {
    if (process.platform !== 'darwin') return;

    // Open System Preferences to Security & Privacy > Screen Recording
    const { shell } = require('electron');
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  }

  private isMeetingApp(appName: string): boolean {
    const meetingApps = [
      'zoom.us',
      'Google Chrome', // Google Meet
      'Microsoft Teams',
      'Slack',
      'Discord',
      'Skype',
    ];

    return meetingApps.some(app => appName.toLowerCase().includes(app.toLowerCase()));
  }

  private async startCapturePulseAudio(config: CaptureConfig): Promise<AsyncIterableIterator<Float32Array>> {
    // Linux implementation using PulseAudio
    // ... implementation
    throw new Error('Linux system audio not yet implemented');
  }

  private async startCaptureWASAPI(config: CaptureConfig): Promise<AsyncIterableIterator<Float32Array>> {
    // Windows implementation using WASAPI loopback
    // ... implementation
    throw new Error('Windows system audio not yet implemented');
  }
}
```

### 2. Permission Handling (macOS)

1. Check Screen Recording permission status
2. Show instructions if permission denied
3. Deep link to System Preferences

```typescript
// src/main/services/PermissionService.ts
import { systemPreferences, shell } from 'electron';

export class PermissionService {
  static async checkScreenRecording(): Promise<boolean> {
    if (process.platform !== 'darwin') return true;

    const status = systemPreferences.getMediaAccessStatus('screen');
    return status === 'granted';
  }

  static async requestScreenRecording(): Promise<void> {
    if (process.platform !== 'darwin') return;

    // Open System Preferences
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  }

  static async checkMicrophonePermission(): Promise<boolean> {
    if (process.platform !== 'darwin') return true;

    const status = systemPreferences.getMediaAccessStatus('microphone');
    return status === 'granted';
  }

  static async requestMicrophonePermission(): Promise<boolean> {
    if (process.platform !== 'darwin') return true;

    const granted = await systemPreferences.askForMediaAccess('microphone');
    return granted;
  }
}
```

### 3. IPC Handlers (Main Process)

```typescript
// src/main/ipc/system-audio.ts
import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { SystemAudioService } from '../services/SystemAudioService';
import { PermissionService } from '../services/PermissionService';

const systemAudioService = new SystemAudioService();

export function registerSystemAudioHandlers(): void {
  ipcMain.handle('system-audio:list-sources', async () => {
    const sources = await systemAudioService.listSources();
    return { sources };
  });

  ipcMain.handle('system-audio:start-capture', async (event, config: any) => {
    await systemAudioService.startCapture(config);
    return { success: true };
  });

  ipcMain.handle('system-audio:stop-capture', async () => {
    await systemAudioService.stopCapture();
    return { success: true };
  });

  ipcMain.handle('system-audio:check-permissions', async () => {
    const hasScreenRecording = await PermissionService.checkScreenRecording();
    const hasMicrophone = await PermissionService.checkMicrophonePermission();

    return {
      screenRecording: hasScreenRecording,
      microphone: hasMicrophone,
    };
  });

  ipcMain.handle('system-audio:request-permissions', async (event, type: 'screen' | 'microphone') => {
    if (type === 'screen') {
      await PermissionService.requestScreenRecording();
    } else {
      await PermissionService.requestMicrophonePermission();
    }
    return { success: true };
  });
}
```

### 4. Preload API (Preload Process)

```typescript
// src/preload/index.ts (extend)
contextBridge.exposeInMainWorld('api', {
  // ... existing APIs

  systemAudio: {
    listSources: () => ipcRenderer.invoke('system-audio:list-sources'),
    startCapture: (config: any) => ipcRenderer.invoke('system-audio:start-capture', config),
    stopCapture: () => ipcRenderer.invoke('system-audio:stop-capture'),
    checkPermissions: () => ipcRenderer.invoke('system-audio:check-permissions'),
    requestPermissions: (type: 'screen' | 'microphone') =>
      ipcRenderer.invoke('system-audio:request-permissions', type),
  },
});
```

### 5. UI Components (Renderer)

```typescript
// src/renderer/components/Audio/AudioSourceSelector.tsx
import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AudioSourceSelector() {
  const [sources, setSources] = useState<any[]>([]);
  const [micSource, setMicSource] = useState<string>('');
  const [systemSource, setSystemSource] = useState<string>('');
  const [mixMode, setMixMode] = useState<'mic-only' | 'system-only' | 'both'>('mic-only');
  const [micVolume, setMicVolume] = useState(100);
  const [systemVolume, setSystemVolume] = useState(100);
  const [permissions, setPermissions] = useState({ screenRecording: true, microphone: true });

  useEffect(() => {
    loadSources();
    checkPermissions();
  }, []);

  const loadSources = async () => {
    const { sources } = await window.api.systemAudio.listSources();
    setSources(sources);

    // Set defaults
    const defaultMic = sources.find(s => s.type === 'input' && s.isDefault);
    const defaultSystem = sources.find(s => s.type === 'output' && s.isDefault);

    if (defaultMic) setMicSource(defaultMic.id);
    if (defaultSystem) setSystemSource(defaultSystem.id);
  };

  const checkPermissions = async () => {
    const perms = await window.api.systemAudio.checkPermissions();
    setPermissions(perms);
  };

  const requestPermission = async (type: 'screen' | 'microphone') => {
    await window.api.systemAudio.requestPermissions(type);

    // Wait a bit and recheck
    setTimeout(checkPermissions, 1000);
  };

  const micSources = sources.filter(s => s.type === 'input');
  const systemSources = sources.filter(s => s.type === 'output' || s.type === 'app');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audio Sources</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {!permissions.microphone && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Microphone access required.
              <Button variant="link" onClick={() => requestPermission('microphone')}>
                Grant Permission
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {process.platform === 'darwin' && !permissions.screenRecording && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Screen Recording permission required to capture app audio (Zoom, Meet, etc.).
              <Button variant="link" onClick={() => requestPermission('screen')}>
                Open System Preferences
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div>
          <Label>Capture Mode</Label>
          <RadioGroup value={mixMode} onValueChange={(v: any) => setMixMode(v)}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="mic-only" id="mic-only" />
              <Label htmlFor="mic-only">Microphone Only</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="system-only" id="system-only" />
              <Label htmlFor="system-only">System Audio Only</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="both" id="both" />
              <Label htmlFor="both">Microphone + System Audio</Label>
            </div>
          </RadioGroup>
        </div>

        {(mixMode === 'mic-only' || mixMode === 'both') && (
          <div>
            <Label>Microphone</Label>
            <Select value={micSource} onValueChange={setMicSource}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {micSources.map(source => (
                  <SelectItem key={source.id} value={source.id}>
                    {source.name} {source.isDefault && '(Default)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="mt-2">
              <Label>Mic Volume: {micVolume}%</Label>
              <Slider
                value={[micVolume]}
                onValueChange={([v]) => setMicVolume(v)}
                min={0}
                max={100}
              />
            </div>
          </div>
        )}

        {(mixMode === 'system-only' || mixMode === 'both') && (
          <div>
            <Label>System Audio Source</Label>
            <Select value={systemSource} onValueChange={setSystemSource}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {systemSources.map(source => (
                  <SelectItem key={source.id} value={source.id}>
                    {source.type === 'app' && '🎯 '}
                    {source.name}
                    {source.appName && ` (${source.appName})`}
                    {source.isDefault && ' (Default)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="mt-2">
              <Label>System Volume: {systemVolume}%</Label>
              <Slider
                value={[systemVolume]}
                onValueChange={([v]) => setSystemVolume(v)}
                min={0}
                max={100}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

### 6. macOS Entitlements

Update `forge.config.ts` to include Screen Recording entitlement:

```typescript
// forge.config.ts (extend)
const config: ForgeConfig = {
  // ... existing config

  packagerConfig: {
    // ... existing packager config

    osxSign: {
      identity: 'Developer ID Application: Your Name',
      hardenedRuntime: true,
      entitlements: 'entitlements.plist',
      entitlementsInherit: 'entitlements.plist',
      'gatekeeper-assess': false,
    },
  },
};
```

```xml
<!-- entitlements.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.device.audio-input</key>
    <true/>
    <key>com.apple.security.device.camera</key>
    <false/>
    <!-- Screen Recording permission for system audio capture -->
    <key>com.apple.security.automation.apple-events</key>
    <true/>
</dict>
</plist>
```

## New Files

```
src/
├── main/
│   ├── services/
│   │   ├── SystemAudioService.ts
│   │   └── PermissionService.ts
│   └── ipc/
│       └── system-audio.ts
├── renderer/
│   └── components/
│       └── Audio/
│           ├── AudioSourceSelector.tsx
│           ├── PermissionPrompt.tsx
│           └── MixerControls.tsx
└── entitlements.plist (new)
```

## Testing Strategy

### Unit Tests

- `SystemAudioService.test.ts` — mock audio devices, test source enumeration
- `PermissionService.test.ts` — test permission checking (mock systemPreferences)

### E2E Tests

- Select mic source → start recording → verify audio captured
- Select system audio → verify app audio captured (manual test with Zoom)
- Mix both sources → verify both present in recording

## Acceptance Criteria

- Audio sources enumerated correctly on macOS/Linux/Windows
- Microphone permission requested on first use
- Screen Recording permission prompt shown on macOS
- Meeting apps (Zoom, Meet, Teams) detected and listed
- Audio source selector shows all devices + apps
- Mix mode works (mic only, system only, both)
- Volume controls adjust audio levels
- Permission status checked before capture
- Deep link to System Preferences works (macOS)
- System audio capture works on macOS (CoreAudio loopback)
- Linux support (PulseAudio) documented as TODO
- Windows support (WASAPI) documented as TODO

## Edge Cases & Gotchas

- **Permission timing:** macOS Screen Recording requires app restart after granting
- **Audio routing:** Some apps (Zoom) may route audio differently when screen sharing
- **Device changes:** Handle hot-plug/unplug of audio devices
- **App detection:** Running app detection may fail if process name differs from app name
- **Mixing artifacts:** Improper mixing can cause clipping or phasing issues
- **Sample rate mismatch:** Different devices may have different sample rates — resample to 16kHz
- **Latency:** System audio may have latency vs microphone — sync issues possible

## Performance Targets


| Metric                    | Target  |
| ------------------------- | ------- |
| **Device enumeration**    | <100ms  |
| **Capture start time**    | <500ms  |
| **Audio mixing overhead** | <5% CPU |
| **Permission check**      | <50ms   |


## Platform Support


| Platform    | Status        | Technology                                       |
| ----------- | ------------- | ------------------------------------------------ |
| **macOS**   | ✅ Implemented | CoreAudio loopback + Screen Recording permission |
| **Linux**   | 🚧 TODO       | PulseAudio monitor sources                       |
| **Windows** | 🚧 TODO       | WASAPI loopback                                  |


