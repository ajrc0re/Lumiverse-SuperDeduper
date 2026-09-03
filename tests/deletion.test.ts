import { describe, expect, test } from 'bun:test'

import { deleteCharacterSafely, type DeletionApi } from '../src/deletion'
import type { CharacterRecord } from '../src/types'

function character(updatedAt = 20): CharacterRecord {
  return {
    id: 'card-1', name: 'Card', description: '', personality: '', scenario: '', first_mes: '',
    mes_example: '', creator_notes: '', system_prompt: '', post_history_instructions: '', tags: [],
    alternate_greetings: [], creator: '', image_id: null, world_book_ids: [], extensions: {},
    created_at: 10, updated_at: updatedAt,
  }
}

function api(overrides: Partial<DeletionApi> = {}): DeletionApi {
  return {
    getCharacter: async () => character(),
    deleteCharacter: async () => true,
    confirm: async () => true,
    ...overrides,
  }
}

describe('safe character deletion', () => {
  test('rejects a missing or stale card before confirmation', async () => {
    let confirmations = 0
    const missing = await deleteCharacterSafely(api({
      getCharacter: async () => null,
      confirm: async () => { confirmations += 1; return true },
    }), 'card-1', 20)
    expect(missing.stale).toBe(true)

    const stale = await deleteCharacterSafely(api({
      getCharacter: async () => character(21),
      confirm: async () => { confirmations += 1; return true },
    }), 'card-1', 20)
    expect(stale.stale).toBe(true)
    expect(confirmations).toBe(0)
  })

  test('does nothing when confirmation is cancelled', async () => {
    let deletes = 0
    const result = await deleteCharacterSafely(api({
      confirm: async () => false,
      deleteCharacter: async () => { deletes += 1; return true },
    }), 'card-1', 20)
    expect(result.cancelled).toBe(true)
    expect(deletes).toBe(0)
  })

  test('rechecks updated_at after confirmation', async () => {
    let reads = 0
    const result = await deleteCharacterSafely(api({
      getCharacter: async () => {
        reads += 1
        return character(reads === 1 ? 20 : 21)
      },
    }), 'card-1', 20)
    expect(result.stale).toBe(true)
    expect(result.deleted).toBe(false)
  })

  test('deletes an unchanged confirmed card', async () => {
    const result = await deleteCharacterSafely(api(), 'card-1', 20)
    expect(result).toEqual({ deleted: true, cancelled: false, stale: false })
  })
})
