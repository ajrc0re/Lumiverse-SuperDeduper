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

export interface BulkDeletionCandidate {
  characterId: string
  expectedUpdatedAt: number
  name: string
}

export interface BulkDeletionApi {
  getCharacter(id: string): Promise<CharacterRecord | null>
  deleteCharacter(id: string): Promise<boolean>
  confirm(characters: CharacterRecord[]): Promise<boolean>
}

export interface BulkDeletionResult {
  deleted: number
  skipped: number
  cancelled: boolean
  errors: string[]
}

export async function deleteCharactersSafely(
  api: BulkDeletionApi,
  candidates: BulkDeletionCandidate[],
): Promise<BulkDeletionResult> {
  const unique = new Map(candidates.map((candidate) => [candidate.characterId, candidate]))
  const eligible: Array<{ candidate: BulkDeletionCandidate; character: CharacterRecord }> = []
  const errors: string[] = []

  for (const candidate of unique.values()) {
    const character = await api.getCharacter(candidate.characterId)
    if (!character || character.updated_at !== candidate.expectedUpdatedAt) {
      errors.push(`${candidate.name} (${candidate.characterId}) was missing or changed.`)
    } else {
      eligible.push({ candidate, character })
    }
  }

  if (eligible.length === 0) {
    return { deleted: 0, skipped: unique.size, cancelled: false, errors }
  }
  if (!(await api.confirm(eligible.map(({ character }) => character)))) {
    return { deleted: 0, skipped: unique.size, cancelled: true, errors }
  }

  let deleted = 0
  for (const { candidate } of eligible) {
    const current = await api.getCharacter(candidate.characterId)
    if (!current || current.updated_at !== candidate.expectedUpdatedAt) {
      errors.push(`${candidate.name} (${candidate.characterId}) changed during confirmation.`)
      continue
    }
    try {
      if (await api.deleteCharacter(candidate.characterId)) deleted += 1
      else errors.push(`${candidate.name} (${candidate.characterId}) was not deleted.`)
    } catch (error) {
      errors.push(`${candidate.name} (${candidate.characterId}): ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return { deleted, skipped: unique.size - deleted, cancelled: false, errors }
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
