import { BrowserWindow, ipcMain } from 'electron'
import { DiarizationChannels } from '../../shared/ipc-channels'
import type { SpeakerSegment, TranscriptSegment } from '../../shared/types'
import { DatabaseService } from '../services/DatabaseService'
import type { DiarizationService } from '../services/DiarizationService'
import { SpeakerProfileService } from '../services/SpeakerProfileService'
import { ServiceRegistry } from '../services/ServiceRegistry'

export function registerDiarizationHandlers(
  mainWindow: BrowserWindow,
  databaseService: DatabaseService
): { diarizationService: DiarizationService } {
  const diarizationService = ServiceRegistry.getDiarizationService()
  const profileService = new SpeakerProfileService(databaseService)

  ipcMain.handle(
    DiarizationChannels.PROCESS,
    async (
      _event,
      audioPath: string,
      recordingId: number
    ): Promise<{ success: boolean; segments: SpeakerSegment[] }> => {
      const segments = await diarizationService.diarize(audioPath)
      const persisted = segments.map((segment) => ({ ...segment, recordingId }))
      databaseService.insertSpeakerSegments(recordingId, persisted)
      for (const segment of persisted) {
        mainWindow.webContents.send(DiarizationChannels.ON_SEGMENT, segment)
      }
      return { success: true, segments: persisted }
    }
  )

  ipcMain.handle(
    DiarizationChannels.ALIGN_TRANSCRIPT,
    (
      _event,
      recordingId: number,
      transcriptSegments: TranscriptSegment[],
      speakerSegments?: SpeakerSegment[]
    ) => {
      if (typeof recordingId !== 'number' || !Number.isFinite(recordingId)) {
        throw new Error('Invalid recordingId')
      }
      if (!Array.isArray(transcriptSegments)) {
        throw new Error('transcriptSegments must be an array')
      }
      const sourceSegments = speakerSegments ?? databaseService.listSpeakerSegments(recordingId)
      const aligned = diarizationService.alignTranscript(transcriptSegments, sourceSegments)
      databaseService.assignTranscriptSpeakers(recordingId, aligned)
      return aligned
    }
  )

  ipcMain.handle(DiarizationChannels.LIST_SPEAKER_SEGMENTS, (_event, recordingId: number) => {
    return databaseService.listSpeakerSegments(recordingId)
  })

  ipcMain.handle(DiarizationChannels.LIST_SPEAKERS, () => {
    return profileService.listProfiles()
  })

  ipcMain.handle(DiarizationChannels.CREATE_SPEAKER, (_event, name: string) => {
    return profileService.createProfile(name)
  })

  ipcMain.handle(
    DiarizationChannels.UPDATE_SPEAKER,
    (_event, id: number, updates: { name?: string; color?: string }) => {
      return profileService.updateProfile(id, updates)
    }
  )

  ipcMain.handle(
    DiarizationChannels.MERGE_SPEAKERS,
    (_event, sourceId: number, targetId: number) => {
      return { success: profileService.mergeProfiles(sourceId, targetId) }
    }
  )

  return { diarizationService }
}
