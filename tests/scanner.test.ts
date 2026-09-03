import { describe, expect, test } from 'bun:test'

import { scanDuplicates, type ScannerApi } from '../src/scanner'
import type { CharacterRecord } from '../src/types'

function character(id: string, overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return {
    id,
    name: `Card ${id}`,
    description: 'Shared description',
    personality: 'Shared personality',
    scenario: 'Shared scenario',
    first_mes: 'Hello',
    mes_example: '',
    creator_notes: '',
    system_prompt: '',
    post_history_instructions: '',
    tags: ['shared'],
    alternate_greetings: [],
    creator: 'Tester',
    image_id: null,
    world_book_ids: [],
    extensions: {},
    created_at: 100,
    updated_at: 200,
    ...overrides,
  }
}

function createApi(cards: CharacterRecord[]) {
  const calls = {
    characterPages: 0,
    tokenCounts: 0,
    worldBooks: 0,
    worldBookEntryPages: 0,
    scripts: [] as string[],
    images: [] as string[],
  }

  const api: ScannerApi = {
    listCharacters: async ({ offset }) => {
      calls.characterPages += 1
      const data = cards.slice(offset, offset + 2)
      return { data, total: cards.length }
    },
    countText: async (text) => {
      calls.tokenCounts += 1
      return { total_tokens: text.length, tokenizer_name: 'test', approximate: false }
    },
    getWorldBook: async (id) => {
      calls.worldBooks += 1
      return { id, name: 'Shared lore', description: 'Lore description' }
    },
    listWorldBookEntries: async (_id, { offset }) => {
      calls.worldBookEntryPages += 1
      const entries = [{
        key: ['hero'], keysecondary: [], content: 'Hero lore', comment: 'Hero', role: null, group_name: '',
      }]
      return { data: entries.slice(offset, offset + 1), total: entries.length }
    },
    listRegexScripts: async ({ scopeId }) => {
      calls.scripts.push(scopeId)
      return {
        data: [{
          id: `script-${scopeId}`, name: 'Script', find_regex: 'x', replace_string: 'y',
          actions: [], disabled: false, description: '', folder: '',
        }],
        total: 1,
      }
    },
    listImages: async ({ characterId }) => {
      calls.images.push(characterId)
      return {
        data: [{
          id: `image-${characterId}`, url: `/image/${characterId}`, original_filename: 'gallery.png',
          mime_type: 'image/png', width: 512, height: 512,
        }],
        total: 1,
      }
    },
    getImage: async () => null,
  }
  return { api, calls }
}

describe('duplicate scan orchestration', () => {
  test('reports measured collection, matching, and enrichment progress', async () => {
    const { api } = createApi([character('a', { name: 'Same' }), character('b', { name: 'Same' })])
    const progress: Array<[string, number, number]> = []
    await scanDuplicates(api, {
      characters: true, worldBooks: false, images: false, regexScripts: false,
    }, 'name', 0.9, undefined, (phase, current, total) => progress.push([phase, current, total]))
    expect(progress).toContainEqual(['collecting', 2, 2])
    expect(progress).toContainEqual(['matching', 2, 2])
    expect(progress).toContainEqual(['enriching', 2, 2])
  })

  test('compares filtered cards against every candidate in the library', async () => {
    const cards = [
      character('a1', { name: 'Alice' }),
      character('t1', { name: 'Tom' }),
      character('j1', { name: 'Jerry', description: 'Unrelated content' }),
    ]
    const { api } = createApi(cards)
    const progress: Array<[string, number, number]> = []
    const result = await scanDuplicates(api, {
      characters: true, worldBooks: false, images: false, regexScripts: false,
    }, 'similar', 0.9, undefined, (phase, current, total) => progress.push([phase, current, total]), 'a*')

    expect(result.totalCharacters).toBe(1)
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]?.cards.map((card) => card.id).sort()).toEqual(['a1', 't1'])
    expect(progress).toContainEqual(['matching', 2, 2])
    expect(progress.filter(([phase]) => phase === 'matching').every(([, , total]) => total === 2)).toBe(true)
  })

  test('uses the selected field to build the operated-card pool', async () => {
    const cards = [
      character('a1', { name: 'Alice', creator: 'Someone', description: 'Shared description '.repeat(20) }),
      character('t1', { name: 'Tom', creator: 'Alice Studio', description: 'Shared description '.repeat(20) }),
      character('j1', { name: 'Jerry', creator: 'Someone', description: 'Unrelated content' }),
    ]
    const { api } = createApi(cards)
    const result = await scanDuplicates(api, {
      characters: true, worldBooks: false, images: false, regexScripts: false,
    }, 'similar', 0.9, undefined, undefined, 'alice*', 'creator')

    expect(result.totalCharacters).toBe(1)
    expect(result.groups[0]?.cards.map((card) => card.id).sort()).toEqual(['a1', 't1'])
  })

  test('batches filtered cards in deterministic name and ID order', async () => {
    const cards = [
      character('d', { name: 'Delta' }),
      character('a', { name: 'Alpha' }),
      character('c', { name: 'Charlie' }),
      character('b', { name: 'Bravo' }),
    ]
    const { api } = createApi(cards)
    const progress: Array<[string, number, number]> = []
    const result = await scanDuplicates(api, {
      characters: true, worldBooks: false, images: false, regexScripts: false,
    }, 'similar', 0.9, undefined, (phase, current, total) => progress.push([phase, current, total]), '', 'name', 2, 1)

    expect(result.totalCharacters).toBe(2)
    expect(result.scopeTotalCharacters).toBe(4)
    expect(result.scopeOffset).toBe(1)
    expect(result.scopeLimit).toBe(2)
    expect(progress.filter(([phase]) => phase === 'matching').every(([, , total]) => total === 5)).toBe(true)
  })

  test('similarity matching yields progress while comparing many pairs', async () => {
    const cards = Array.from({ length: 33 }, (_, index) => character(String(index)))
    const { api } = createApi(cards)
    const progress: Array<[string, number, number]> = []
    await scanDuplicates(api, {
      characters: true, worldBooks: false, images: false, regexScripts: false,
    }, 'similar', 0.9, undefined, (phase, current, total) => progress.push([phase, current, total]))

    expect(progress).toContainEqual(['matching', 500, 528])
    expect(progress).toContainEqual(['matching', 528, 528])
  })

  test('can cancel during a long similarity comparison', async () => {
    const cards = Array.from({ length: 34 }, (_, index) => character(String(index)))
    const { api } = createApi(cards)
    const controller = new AbortController()
    await expect(scanDuplicates(api, {
      characters: true, worldBooks: false, images: false, regexScripts: false,
    }, 'similar', 0.9, controller.signal, (phase, current) => {
      if (phase === 'matching' && current === 500) controller.abort()
    })).rejects.toThrow('SCAN_CANCELLED')
  })

  test('stops before further work when its cancellation signal is aborted', async () => {
    const { api, calls } = createApi([character('a'), character('b')])
    const controller = new AbortController()
    controller.abort()
    await expect(scanDuplicates(api, {
      characters: true, worldBooks: true, images: true, regexScripts: true,
    }, 'name', 0.9, controller.signal)).rejects.toThrow('SCAN_CANCELLED')
    expect(calls.characterPages).toBe(0)
    expect(calls.tokenCounts).toBe(0)
  })

  test('paginates characters, enriches candidates only, and caches shared lorebooks', async () => {
    const cards = [
      character('a', {
        world_book_ids: ['book-1'],
        extensions: { image_gallery: ['image-a', 'image-a', 'external-image'] },
      }),
      character('b', { world_book_ids: ['book-1'], alternate_greetings: ['Hi again'] }),
      character('unique', { description: 'Completely unique content' }),
    ]
    const { api, calls } = createApi(cards)
    const result = await scanDuplicates(api, {
      characters: true, worldBooks: true, images: true, regexScripts: true,
    }, 'exact', 0.9)

    expect(calls.characterPages).toBe(2)
    expect(calls.worldBooks).toBe(1)
    expect(calls.scripts.sort()).toEqual(['a', 'b'])
    expect(calls.images.sort()).toEqual(['a', 'b'])
    expect(calls.tokenCounts).toBe(4)
    expect(result.groups).toHaveLength(1)
    expect(result.duplicateCharacters).toBe(2)
    expect(result.groups[0]?.cards.some((card) => card.id === 'unique')).toBe(false)
    const cardA = result.groups[0]?.cards.find((card) => card.id === 'a')
    expect(cardA?.payload.storedImages).toBe(1)
    expect(cardA?.payload.embeddedGalleryItems).toBe(1)
  })

  test('labels missing optional data unavailable and recommendations provisional', async () => {
    const { api, calls } = createApi([character('a'), character('b')])
    const result = await scanDuplicates(api, {
      characters: true, worldBooks: false, images: false, regexScripts: false,
    }, 'exact', 0.9)

    expect(calls.worldBooks).toBe(0)
    expect(calls.scripts).toEqual([])
    expect(calls.images).toEqual([])
    expect(result.availability).toEqual({
      characters: 'available', worldBooks: 'unavailable', images: 'unavailable', regexScripts: 'unavailable',
    })
    expect(result.groups[0]?.recommendationProvisional).toBe(true)
    expect(result.groups[0]?.cards[0]?.payload.scripts).toBeNull()
    expect(result.groups[0]?.cards[0]?.payload.storedImages).toBeNull()
    expect(result.groups[0]?.cards[0]?.payload.lorebooks).toBe(0)
  })

  test('falls back to an approximate local token estimate', async () => {
    const { api } = createApi([character('a'), character('b')])
    api.countText = async () => { throw new Error('No main model') }
    const result = await scanDuplicates(api, {
      characters: true, worldBooks: false, images: false, regexScripts: false,
    }, 'exact', 0.9)
    expect(result.groups[0]?.cards[0]?.tokens.card.approximate).toBe(true)
    expect(result.groups[0]?.cards[0]?.tokens.card.tokenizerName).toContain('estimate')
  })

  test('requires character permission before reading any cards', async () => {
    const { api, calls } = createApi([character('a'), character('b')])
    await expect(scanDuplicates(api, {
      characters: false, worldBooks: false, images: false, regexScripts: false,
    }, 'name', 0.9)).rejects.toThrow('PERMISSION_DENIED: characters')
    expect(calls.characterPages).toBe(0)
  })
})
