import type { DatabaseService } from './DatabaseService'
import type { SpeakerProfile } from '../../shared/types'

const COLORS = [
  '#3b82f6',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#6366f1'
]

export class SpeakerProfileService {
  public constructor(private readonly databaseService: DatabaseService) {}

  public listProfiles(): SpeakerProfile[] {
    return this.databaseService.listSpeakerProfiles()
  }

  public createProfile(name: string): SpeakerProfile {
    return this.databaseService.createSpeakerProfile(name, this.generateColor())
  }

  public updateProfile(
    id: number,
    updates: { name?: string; color?: string }
  ): SpeakerProfile | null {
    return this.databaseService.updateSpeakerProfile(id, updates)
  }

  public mergeProfiles(sourceId: number, targetId: number): boolean {
    return this.databaseService.mergeSpeakerProfiles(sourceId, targetId)
  }

  private generateColor(): string {
    return COLORS[Math.floor(Math.random() * COLORS.length)]
  }
}
