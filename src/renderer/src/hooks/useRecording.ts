import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AudioLevelEvent, RecordingResult } from '../../../shared/types'

const TARGET_SAMPLE_RATE = 16000

type RecordingState = {
  isRecording: boolean
  levels: number[]
  durationMs: number
  permissionGranted: boolean | null
  lastResult: RecordingResult | null
  errorMessage: string | null
  requestPermission: () => Promise<boolean>
  startRecording: () => Promise<void>
  stopRecording: () => Promise<RecordingResult | null>
}

/**
 * Downsample Float32Array from sourceSampleRate to targetSampleRate and convert to Int16 PCM.
 */
function float32ToInt16PCM(
  float32: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number
): ArrayBuffer {
  const ratio = sourceSampleRate / targetSampleRate
  const outputLength = Math.floor(float32.length / ratio)
  const result = new Int16Array(outputLength)
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = Math.floor(i * ratio)
    const sample = Math.max(-1, Math.min(1, float32[srcIndex]))
    result[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }
  return result.buffer
}

export function useRecording(): RecordingState {
  const { t } = useTranslation()
  const [isRecording, setIsRecording] = useState(false)
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null)
  const [levels, setLevels] = useState<number[]>([])
  const [durationMs, setDurationMs] = useState(0)
  const [lastResult, setLastResult] = useState<RecordingResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const startedAtRef = useRef<number>(0)
  const stopLevelListenerRef = useRef<(() => void) | null>(null)

  // Web Audio refs
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const animFrameRef = useRef<number>(0)
  const webAudioActiveRef = useRef(false)

  useEffect(() => {
    if (!isRecording) return
    const timer = setInterval(() => {
      setDurationMs(Date.now() - startedAtRef.current)
    }, 100)
    return () => clearInterval(timer)
  }, [isRecording])

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const granted = await window.api.requestMicPermission()
    setPermissionGranted(granted)
    if (!granted) {
      setErrorMessage(t('recording.micPermissionDenied'))
    }
    return granted
  }, [t])

  const stopWebAudio = useCallback((): void => {
    webAudioActiveRef.current = false
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = 0
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect()
      scriptProcessorRef.current = null
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect()
      sourceNodeRef.current = null
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect()
      analyserRef.current = null
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop()
      }
      mediaStreamRef.current = null
    }
  }, [])

  const startWebAudioCapture = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: { ideal: TARGET_SAMPLE_RATE },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      })
      mediaStreamRef.current = stream

      const audioCtx = new AudioContext({
        sampleRate: stream.getAudioTracks()[0]?.getSettings().sampleRate ?? 48000
      })
      audioContextRef.current = audioCtx

      const source = audioCtx.createMediaStreamSource(stream)
      sourceNodeRef.current = source

      // AnalyserNode for real-time levels
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.3
      analyserRef.current = analyser
      source.connect(analyser)

      // ScriptProcessorNode to capture PCM and send to main
      const bufferSize = 4096
      const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1)
      scriptProcessorRef.current = processor

      processor.onaudioprocess = (event: AudioProcessingEvent): void => {
        if (!webAudioActiveRef.current) return
        const inputData = event.inputBuffer.getChannelData(0)
        const pcmBuffer = float32ToInt16PCM(inputData, audioCtx.sampleRate, TARGET_SAMPLE_RATE)
        window.api.sendAudioChunk(pcmBuffer)
      }

      source.connect(processor)
      processor.connect(audioCtx.destination) // required for onaudioprocess to fire

      webAudioActiveRef.current = true

      // Pump levels from AnalyserNode
      const timeDomainData = new Float32Array(analyser.fftSize)
      const pumpLevels = (): void => {
        if (!webAudioActiveRef.current) return
        analyser.getFloatTimeDomainData(timeDomainData)
        let sumSquares = 0
        for (let i = 0; i < timeDomainData.length; i++) {
          sumSquares += timeDomainData[i] * timeDomainData[i]
        }
        const rms = Math.sqrt(sumSquares / timeDomainData.length)
        setLevels((prev) => [...prev.slice(-159), rms])
        animFrameRef.current = requestAnimationFrame(pumpLevels)
      }
      animFrameRef.current = requestAnimationFrame(pumpLevels)

      return true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Permission') || msg.includes('NotAllowedError')) {
        setErrorMessage(t('recording.micPermissionDenied'))
        setPermissionGranted(false)
      } else if (msg.includes('NotFoundError') || msg.includes('DevicesNotFoundError')) {
        setErrorMessage(t('recording.noMicrophoneFound', 'No microphone found'))
      } else {
        setErrorMessage(t('recording.micError', 'Microphone error: {{message}}', { message: msg }))
      }
      return false
    }
  }, [t])

  const startRecording = useCallback(async (): Promise<void> => {
    setErrorMessage(null)
    const granted = permissionGranted ?? (await requestPermission())
    if (!granted) return

    setLevels([])
    setDurationMs(0)
    startedAtRef.current = Date.now()

    // Start recording on main process (creates output file, determines capture mode)
    const { streamId } = await window.api.startRecording()

    // Check capture mode — if web-audio, start local capture
    const mode = await window.api.getCaptureMode()
    if (mode === 'web-audio') {
      const ok = await startWebAudioCapture()
      if (!ok) {
        // Failed to start web audio — stop the main-side recording
        await window.api.stopRecording()
        return
      }
    } else {
      // Native mode — subscribe to level events from main
      if (!stopLevelListenerRef.current) {
        stopLevelListenerRef.current = window.api.onAudioLevel((event: AudioLevelEvent) => {
          setLevels((prev) => [...prev.slice(-159), event.rms])
        })
      }
    }

    void streamId // used by main process internally
    setIsRecording(true)
  }, [permissionGranted, requestPermission, startWebAudioCapture])

  const stopRecording = useCallback(async (): Promise<RecordingResult | null> => {
    if (!isRecording) return null

    // Stop web audio capture first so final chunks are sent before stop
    stopWebAudio()

    // Stop level listener if in native mode
    if (stopLevelListenerRef.current) {
      stopLevelListenerRef.current()
      stopLevelListenerRef.current = null
    }

    const result = await window.api.stopRecording()
    setIsRecording(false)
    setLastResult(result)
    return result
  }, [isRecording, stopWebAudio])

  useEffect(() => {
    return () => {
      stopWebAudio()
      if (stopLevelListenerRef.current) {
        stopLevelListenerRef.current()
      }
    }
  }, [stopWebAudio])

  return {
    isRecording,
    levels,
    durationMs,
    permissionGranted,
    lastResult,
    errorMessage,
    requestPermission,
    startRecording,
    stopRecording
  }
}
