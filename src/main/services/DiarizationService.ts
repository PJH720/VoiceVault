import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { SpeakerSegment, SpeakerStats, TranscriptSegment } from '../../shared/types'

type PyannoteLike = {
  diarize: (
    audioPath: string,
    options?: { minSpeakers?: number; maxSpeakers?: number }
  ) => Promise<{ segments: Array<{ start: number; end: number; speaker: string; confidence?: number }> }>
  embed?: (audioPath: string, options: { start: number; end: number }) => Promise<Float32Array>
  destroy?: () => void
}

type PyannoteCtor = new (options: { modelPath: string; numThreads: number }) => PyannoteLike

export class DiarizationService {
  private pyannote: PyannoteLike | null = null
  private nativeModuleAvailable: boolean | null = null
  private readonly modelPath: string

  public constructor() {
    this.modelPath = path.join(app.getPath('userData'), 'models', 'pyannote')
  }

  public async initialize(): Promise<void> {
    if (this.pyannote) return
    if (this.nativeModuleAvailable === false) {
      throw new Error('pyannote-cpp-node not available — using fallback')
    }
    if (!(await this.isModelAvailable())) {
      throw new Error('Pyannote model not found. Download required.')
    }

    try {
      const moduleName = 'pyannote-cpp-node'
      const pyannoteModule = (await import(/* @vite-ignore */ moduleName)) as {
        Pyannote?: PyannoteCtor
        default?: PyannoteCtor
      }
      const Ctor = pyannoteModule.Pyannote ?? pyannoteModule.default
      if (!Ctor) {
        this.nativeModuleAvailable = false
        throw new Error('pyannote-cpp-node constructor missing')
      }
      this.nativeModuleAvailable = true
      this.pyannote = new Ctor({
        modelPath: this.modelPath,
        numThreads: 4
      })
    } catch (err) {
      this.nativeModuleAvailable = false
      throw err
    }
  }

  public async diarize(audioPath: string, numSpeakers?: number): Promise<SpeakerSegment[]> {
    try {
      await this.initialize()
      if (!this.pyannote) return []
      const result = await this.pyannote.diarize(audioPath, {
        minSpeakers: numSpeakers || 1,
        maxSpeakers: numSpeakers || 10
      })
      return result.segments
        .filter((segment) => segment.end > segment.start)
        .map((segment) => ({
          recordingId: 0,
          start: segment.start,
          end: segment.end,
          speaker: segment.speaker,
          confidence: segment.confidence ?? 1
        }))
    } catch {
      return this.fallbackDiarization(audioPath)
    }
  }

  public async extractEmbedding(
    audioPath: string,
    start: number,
    end: number
  ): Promise<Float32Array | null> {
    try {
      await this.initialize()
      if (!this.pyannote?.embed) return null
      return await this.pyannote.embed(audioPath, { start, end })
    } catch {
      return null
    }
  }

  public alignTranscript(
    transcriptSegments: TranscriptSegment[],
    speakerSegments: SpeakerSegment[]
  ): Array<TranscriptSegment & { speaker: string }> {
    return transcriptSegments.map((segment) => {
      let bestSpeaker: SpeakerSegment | null = null
      let maxOverlap = 0
      for (const speakerSegment of speakerSegments) {
        const overlap = Math.min(segment.end, speakerSegment.end) - Math.max(segment.start, speakerSegment.start)
        if (overlap > maxOverlap) {
          maxOverlap = overlap
          bestSpeaker = speakerSegment
        }
      }
      return {
        ...segment,
        speaker: bestSpeaker?.speaker ?? 'SPEAKER_UNKNOWN'
      }
    })
  }

  public calculateStats(segments: SpeakerSegment[], totalDuration: number): SpeakerStats[] {
    const bucket = new Map<string, { duration: number; turns: number }>()
    for (const segment of segments) {
      const current = bucket.get(segment.speaker) ?? { duration: 0, turns: 0 }
      current.duration += Math.max(0, segment.end - segment.start)
      current.turns += 1
      bucket.set(segment.speaker, current)
    }
    return Array.from(bucket.entries()).map(([speaker, info]) => ({
      speaker,
      totalDuration: info.duration,
      percentage: totalDuration > 0 ? (info.duration / totalDuration) * 100 : 0,
      turnCount: info.turns
    }))
  }

  public isNativeModuleAvailable(): boolean | null {
    return this.nativeModuleAvailable
  }

  public async isModelAvailable(): Promise<boolean> {
    const segmentation = path.join(this.modelPath, 'segmentation.onnx')
    const embedding = path.join(this.modelPath, 'embedding.onnx')
    return fs.existsSync(segmentation) && fs.existsSync(embedding)
  }

  public destroy(): void {
    this.pyannote?.destroy?.()
    this.pyannote = null
  }

  private fallbackDiarization(audioPath: string): SpeakerSegment[] {
    const size = fs.existsSync(audioPath) ? fs.statSync(audioPath).size : 0
    const approxDuration = Math.max(1, Math.floor(size / (16000 * 2)))
    const segments: SpeakerSegment[] = []
    let cursor = 0
    let idx = 0
    while (cursor < approxDuration) {
      const step = Math.min(4, approxDuration - cursor)
      segments.push({
        recordingId: 0,
        start: cursor,
        end: cursor + step,
        speaker: `SPEAKER_0${idx % 2}`,
        confidence: 0.65
      })
      cursor += step
      idx += 1
    }
    return segments
  }
}
