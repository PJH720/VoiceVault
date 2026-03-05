import { useEffect, useRef } from 'react'

type WaveformProps = {
  levels: number[]
  isRecording: boolean
}

export function Waveform({ levels, isRecording }: WaveformProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    ctx.clearRect(0, 0, width, height)

    const barWidth = 3
    const gap = 2
    const maxBars = Math.floor(width / (barWidth + gap))
    const visibleLevels = levels.slice(-maxBars)
    const color = isRecording ? '#dc2626' : '#6b7280'
    ctx.fillStyle = color

    visibleLevels.forEach((level, index) => {
      const barHeight = Math.max(2, Math.floor(level * height))
      const x = index * (barWidth + gap)
      const y = (height - barHeight) / 2
      ctx.fillRect(x, y, barWidth, barHeight)
    })
  }, [levels, isRecording])

  return <canvas className="waveform" width={720} height={100} ref={canvasRef} />
}
