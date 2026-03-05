import type { AudioSourceInfo, CaptureConfig } from '../../shared/types'

type NativeDevice = {
  id?: string
  name?: string
  type?: string
  isDefault?: boolean
}

type NativeApp = {
  pid?: number
  name?: string
}

type NativeCapture = {
  start: () => AsyncIterableIterator<Float32Array>
  stop: () => void
}

export class SystemAudioService {
  private capture: NativeCapture | null = null
  private currentConfig: CaptureConfig | null = null

  public async listSources(): Promise<AudioSourceInfo[]> {
    const sources: AudioSourceInfo[] = []
    try {
      const moduleName = 'native-audio-node'
      const native = (await import(/* @vite-ignore */ moduleName)) as Record<string, unknown>
      const listDevicesFn = native.listDevices as (() => Promise<NativeDevice[]>) | undefined
      const listRunningAppsFn = native.listRunningApps as (() => Promise<NativeApp[]>) | undefined
      const devices = listDevicesFn ? await listDevicesFn() : []
      for (const device of devices) {
        const type = device.type === 'input' ? 'input' : 'output'
        sources.push({
          id: device.id ?? `${type}-${device.name ?? 'unknown'}`,
          name: device.name ?? 'Unknown device',
          type,
          isDefault: Boolean(device.isDefault)
        })
      }
      if (process.platform === 'darwin') {
        const apps = listRunningAppsFn ? await listRunningAppsFn() : []
        for (const app of apps) {
          const name = app.name ?? ''
          if (!this.isMeetingApp(name)) continue
          sources.push({
            id: `app:${app.pid ?? name}`,
            name,
            type: 'app',
            isDefault: false,
            appName: name
          })
        }
      }
    } catch {
      // system audio enumeration failed, use defaults
      // fall through to default virtual devices
    }

    if (sources.length === 0) {
      sources.push(
        { id: 'default-mic', name: 'Default Microphone', type: 'input', isDefault: true },
        { id: 'default-system', name: 'Default System Output', type: 'output', isDefault: true }
      )
    }
    return sources
  }

  public async startCapture(config: CaptureConfig): Promise<AsyncIterableIterator<Float32Array>> {
    this.currentConfig = config
    if (process.platform === 'linux') {
      throw new Error('Linux system audio not yet implemented (PulseAudio TODO)')
    }
    if (process.platform === 'win32') {
      throw new Error('Windows system audio not yet implemented (WASAPI TODO)')
    }
    return this.startCaptureCoreAudio(config)
  }

  public async stopCapture(): Promise<void> {
    this.capture?.stop()
    this.capture = null
    this.currentConfig = null
  }

  public getCurrentConfig(): CaptureConfig | null {
    return this.currentConfig
  }

  private async startCaptureCoreAudio(
    config: CaptureConfig
  ): Promise<AsyncIterableIterator<Float32Array>> {
    try {
      const moduleName = 'native-audio-node'
      const native = (await import(/* @vite-ignore */ moduleName)) as Record<string, unknown>
      const SystemAudioCapture = native.SystemAudioCapture as
        | (new (options: Record<string, unknown>) => NativeCapture)
        | undefined
      if (SystemAudioCapture) {
        this.capture = new SystemAudioCapture({
          sampleRate: 16000,
          channels: 1,
          format: 'float32',
          micSource: config.micSource,
          systemSource: config.systemSource,
          mixMode: config.mixMode
        })
        const stream = this.capture.start()
        if (config.mixMode === 'both') {
          return this.mixAudioStreams(stream, config)
        }
        return stream
      }
    } catch {
      // system audio capture failed, use fallback stream
      // fallback stream below
    }
    const fallback = this.fallbackStream()
    if (config.mixMode === 'both') {
      return this.mixAudioStreams(fallback, config)
    }
    return fallback
  }

  private async *mixAudioStreams(
    stream: AsyncIterableIterator<Float32Array>,
    config: CaptureConfig
  ): AsyncIterableIterator<Float32Array> {
    const micGain = Math.max(0, Math.min(1, config.micVolume))
    const sysGain = Math.max(0, Math.min(1, config.systemVolume))
    const gain =
      config.mixMode === 'both'
        ? (micGain + sysGain) / 2
        : config.mixMode === 'mic-only'
          ? micGain
          : sysGain
    for await (const chunk of stream) {
      const mixed = new Float32Array(chunk.length)
      for (let i = 0; i < chunk.length; i += 1) {
        mixed[i] = Math.max(-1, Math.min(1, chunk[i] * gain))
      }
      yield mixed
    }
  }

  private async *fallbackStream(): AsyncIterableIterator<Float32Array> {
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 30))
      yield new Float32Array(480)
    }
  }

  private isMeetingApp(appName: string): boolean {
    const apps = ['zoom', 'google chrome', 'meet', 'microsoft teams', 'slack', 'discord', 'skype']
    const lowered = appName.toLowerCase()
    return apps.some((item) => lowered.includes(item))
  }
}
