import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow } from 'electron'
import type { AudioLevelEvent } from '../../shared/types'
import { AudioChannels } from '../../shared/ipc-channels'

// native-audio-node is an optional native addon — may not be available
type AudioChunk = { data: Buffer }
type AudioMetadata = { sampleRate: number }
type MicrophoneRecorderLike = {
  on: (event: string, cb: (...args: unknown[]) => void) => void
  start: () => Promise<void>
  stop: () => Promise<void>
}
type NativeAudioModule = {
  MicrophoneRecorder?: new (opts: Record<string, unknown>) => MicrophoneRecorderLike
  default?: { MicrophoneRecorder?: new (opts: Record<string, unknown>) => MicrophoneRecorderLike }
}

let NativeAudioAvailable: boolean | null = null
let MicrophoneRecorderCtor: (new (opts: Record<string, unknown>) => MicrophoneRecorderLike) | null = null

async function loadNativeAudio(): Promise<boolean> {
  if (NativeAudioAvailable !== null) return NativeAudioAvailable
  try {
    const moduleName = 'native-audio-node'
    const mod = (await import(/* @vite-ignore */ moduleName)) as unknown as NativeAudioModule
    MicrophoneRecorderCtor = mod.MicrophoneRecorder ?? mod.default?.MicrophoneRecorder ?? null
    NativeAudioAvailable = MicrophoneRecorderCtor !== null
  } catch {
    NativeAudioAvailable = false
    MicrophoneRecorderCtor = null
  }
  return NativeAudioAvailable
}

type StopResult = {
  audioPath: string
  duration: number
  fileSizeBytes: number
}

const SAMPLE_RATE = 16000

export class AudioCaptureService {
  private recorder: MicrophoneRecorderLike | null = null
  private isRecording = false
  private startedAt = 0
  private audioPath: string | null = null
  private streamId: string | null = null
  private levelTimer: NodeJS.Timeout | null = null
  private rawChunks: Buffer[] = []
  private metadata: AudioMetadata | null = null
  private captureMode: 'native' | 'fallback' = 'fallback'
  private readonly chunkListeners = new Set<(chunk: Buffer, sampleRate: number) => void>()

  public async startRecording(outputDir: string): Promise<string> {
    if (this.isRecording) {
      throw new Error('Recording already in progress')
    }

    fs.mkdirSync(outputDir, { recursive: true })
    const fileName = `recording-${Date.now()}.wav`
    this.audioPath = path.join(outputDir, fileName)
    this.streamId = fileName
    this.startedAt = Date.now()
    this.isRecording = true
    this.rawChunks = []
    this.metadata = null

    try {
      const hasNative = await loadNativeAudio()
      if (!hasNative || !MicrophoneRecorderCtor) {
        throw new Error('native-audio-node not available')
      }
      this.recorder = new MicrophoneRecorderCtor({
        sampleRate: SAMPLE_RATE,
        chunkDurationMs: 100,
        stereo: false
      })
      this.recorder.on('metadata', (meta: unknown) => {
        this.metadata = meta as AudioMetadata
      })
      this.recorder.on('data', (...args: unknown[]) => {
        const chunk = args[0] as AudioChunk
        this.rawChunks.push(chunk.data)
        this.emitLevelFromChunk(chunk.data)
        const sampleRate = this.metadata?.sampleRate ?? SAMPLE_RATE
        for (const listener of this.chunkListeners) {
          listener(chunk.data, sampleRate)
        }
      })
      this.recorder.on('error', () => {
        this.captureMode = 'fallback'
      })
      await this.recorder.start()
      this.captureMode = 'native'
    } catch {
      this.captureMode = 'fallback'
      this.startLevelEvents()
    }

    return this.audioPath
  }

  public async stopRecording(): Promise<StopResult> {
    if (!this.isRecording || !this.audioPath) {
      throw new Error('Not currently recording')
    }

    this.isRecording = false
    this.stopLevelEvents()

    const durationSeconds = Math.max(0.1, (Date.now() - this.startedAt) / 1000)
    if (this.captureMode === 'native' && this.recorder) {
      await this.recorder.stop()
      const bytes = this.generateWavFromChunks(
        this.rawChunks,
        this.metadata?.sampleRate ?? SAMPLE_RATE
      )
      fs.writeFileSync(this.audioPath, bytes)
    } else {
      const bytes = this.generateSilentWav(durationSeconds)
      fs.writeFileSync(this.audioPath, bytes)
    }

    const stat = fs.statSync(this.audioPath)
    const finishedPath = this.audioPath
    this.audioPath = null
    this.streamId = null
    this.recorder = null
    this.rawChunks = []
    this.metadata = null
    this.captureMode = 'fallback'

    return {
      audioPath: finishedPath,
      duration: durationSeconds,
      fileSizeBytes: stat.size
    }
  }

  public get recording(): boolean {
    return this.isRecording
  }

  public get recordingStartedAt(): number {
    return this.startedAt
  }

  public getCaptureMode(): 'native' | 'fallback' {
    return this.captureMode
  }

  public async isNativeAvailable(): Promise<boolean> {
    return loadNativeAudio()
  }

  public onAudioChunk(listener: (chunk: Buffer, sampleRate: number) => void): () => void {
    this.chunkListeners.add(listener)
    return () => this.chunkListeners.delete(listener)
  }

  private startLevelEvents(): void {
    this.levelTimer = setInterval(() => {
      if (!this.isRecording || !this.streamId) return

      const rms = Math.random() * 0.35 + 0.05
      const peak = Math.min(1, rms + Math.random() * 0.2)
      const event: AudioLevelEvent = {
        streamId: this.streamId,
        rms,
        peak,
        timestamp: Date.now() - this.startedAt
      }

      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(AudioChannels.AUDIO_LEVEL, event)
      }
    }, 100)
  }

  private stopLevelEvents(): void {
    if (this.levelTimer) {
      clearInterval(this.levelTimer)
      this.levelTimer = null
    }
  }

  private generateSilentWav(durationSeconds: number): Buffer {
    const sampleCount = Math.floor(durationSeconds * SAMPLE_RATE)
    const dataSize = sampleCount * 2
    const buffer = Buffer.alloc(44 + dataSize)

    buffer.write('RIFF', 0)
    buffer.writeUInt32LE(36 + dataSize, 4)
    buffer.write('WAVE', 8)
    buffer.write('fmt ', 12)
    buffer.writeUInt32LE(16, 16)
    buffer.writeUInt16LE(1, 20)
    buffer.writeUInt16LE(1, 22)
    buffer.writeUInt32LE(SAMPLE_RATE, 24)
    buffer.writeUInt32LE(SAMPLE_RATE * 2, 28)
    buffer.writeUInt16LE(2, 32)
    buffer.writeUInt16LE(16, 34)
    buffer.write('data', 36)
    buffer.writeUInt32LE(dataSize, 40)

    return buffer
  }

  private generateWavFromChunks(chunks: Buffer[], sampleRate: number): Buffer {
    const pcmData = Buffer.concat(chunks)
    const dataSize = pcmData.length
    const wav = Buffer.alloc(44 + dataSize)

    wav.write('RIFF', 0)
    wav.writeUInt32LE(36 + dataSize, 4)
    wav.write('WAVE', 8)
    wav.write('fmt ', 12)
    wav.writeUInt32LE(16, 16)
    wav.writeUInt16LE(1, 20)
    wav.writeUInt16LE(1, 22)
    wav.writeUInt32LE(sampleRate, 24)
    wav.writeUInt32LE(sampleRate * 2, 28)
    wav.writeUInt16LE(2, 32)
    wav.writeUInt16LE(16, 34)
    wav.write('data', 36)
    wav.writeUInt32LE(dataSize, 40)
    pcmData.copy(wav, 44)

    return wav
  }

  private emitLevelFromChunk(buffer: Buffer): void {
    if (!this.streamId) return
    if (buffer.length < 2) return
    const sampleCount = Math.floor(buffer.length / 2)
    if (sampleCount === 0) return

    let sumSquares = 0
    let peak = 0
    for (let i = 0; i < sampleCount; i += 1) {
      const sample = buffer.readInt16LE(i * 2) / 32768
      sumSquares += sample * sample
      const abs = Math.abs(sample)
      if (abs > peak) peak = abs
    }

    const rms = Math.min(1, Math.sqrt(sumSquares / sampleCount))
    const event: AudioLevelEvent = {
      streamId: this.streamId,
      rms,
      peak,
      timestamp: Date.now() - this.startedAt
    }

    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(AudioChannels.AUDIO_LEVEL, event)
    }
  }
}
