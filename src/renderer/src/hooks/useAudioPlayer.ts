import { useCallback, useEffect, useRef, useState } from 'react'

type AudioPlayerState = {
  load: (audioPath: string) => void
  play: () => Promise<void>
  pause: () => void
  seek: (time: number) => void
  setRate: (rate: number) => void
  isPlaying: boolean
  currentTime: number
  duration: number
  playbackRate: number
}

export function useAudioPlayer(): AudioPlayerState {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)

  const load = useCallback(
    (audioPath: string) => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      const audio = new Audio(`file://${audioPath}`)
      audio.playbackRate = playbackRate
      audio.onloadedmetadata = () => setDuration(audio.duration)
      audio.ontimeupdate = () => setCurrentTime(audio.currentTime)
      audio.onended = () => setIsPlaying(false)
      audioRef.current = audio
      setCurrentTime(0)
    },
    [playbackRate]
  )

  const play = useCallback(async () => {
    await audioRef.current?.play()
    setIsPlaying(true)
  }, [])

  const pause = useCallback(() => {
    audioRef.current?.pause()
    setIsPlaying(false)
  }, [])

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }, [])

  const setRate = useCallback((rate: number) => {
    setPlaybackRate(rate)
    if (audioRef.current) {
      audioRef.current.playbackRate = rate
    }
  }, [])

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
    }
  }, [])

  return {
    load,
    play,
    pause,
    seek,
    setRate,
    isPlaying,
    currentTime,
    duration,
    playbackRate
  }
}
