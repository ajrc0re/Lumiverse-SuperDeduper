import type { CharacterRecord } from './types'

export interface DeletionApi {
  getCharacter(id: string): Promise<CharacterRecord | null>
  deleteCharacter(id: string): Promise<boolean>
  confirm(character: CharacterRecord): Promise<boolean>
}

export interface DeletionResult {
  deleted: boolean
  cancelled: boolean
  stale: boolean
  error?: string
}

export async function deleteCharacterSafely(
  api: DeletionApi,
  characterId: string,
  expectedUpdatedAt: number,
): Promise<DeletionResult> {
  const current = await api.getCharacter(characterId)
  if (!current) {
    return {
      deleted: false,
      cancelled: false,
      stale: true,
      error: 'This character no longer exists. Scan again.',
    }
  }
  if (current.updated_at !== expectedUpdatedAt) {
    return {
      deleted: false,
      cancelled: false,
      stale: true,
      error: 'This character changed after the scan. Scan again before deleting it.',
    }
  }

  if (!(await api.confirm(current))) {
    return { deleted: false, cancelled: true, stale: false }
  }

  const rechecked = await api.getCharacter(characterId)
  if (!rechecked || rechecked.updated_at !== expectedUpdatedAt) {
    return {
      deleted: false,
      cancelled: false,
      stale: true,
      error: 'This character changed while confirmation was open. Nothing was deleted.',
    }
  }

  const deleted = await api.deleteCharacter(characterId)
  return {
    deleted,
    cancelled: false,
    stale: !deleted,
    ...(deleted ? {} : { error: 'Lumiverse did not delete the character.' }),
  }
}
