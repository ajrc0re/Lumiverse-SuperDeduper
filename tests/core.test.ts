import { describe, expect, test } from 'bun:test'

import {
  canonicalCoreFields,
  characterSimilarity,
  classifyExtensionPayload,
  compareKeeperCandidates,
  exactFingerprint,
  findDuplicateGroups,
  normalizeName,
  sorensenDice,
} from '../src/core'
import { matchesWildcardSearch } from '../src/search'
import type { CardComparison, CharacterRecord, PayloadSummary } from '../src/types'

test('result filtering supports asterisks as wildcards', () => {
  expect(matchesWildcardSearch(['John', 'Joseph'], 'jo*')).toBe(true)
  expect(matchesWildcardSearch(['Alice'], 'jo*')).toBe(false)
  expect(matchesWildcardSearch(['Alice'], 'a*')).toBe(true)
  expect(matchesWildcardSearch(['Banana'], 'a*')).toBe(false)
  expect(matchesWildcardSearch(['Creator Name'], 'ator')).toBe(true)
  expect(matchesWildcardSearch(['literal.value'], 'literal.*')).toBe(true)
})

function character(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return {
    id: 'character-1',
    name: 'Alice',
    description: 'A curious adventurer.',
    personality: 'Brave and kind.',
    scenario: 'A forest.',
    first_mes: 'Hello!',
    mes_example: '{{char}}: Welcome.',
    creator_notes: '',
    system_prompt: '',
    post_history_instructions: '',
    tags: ['Fantasy'],
    alternate_greetings: [],
    creator: 'Creator',
    image_id: null,
    world_book_ids: [],
    extensions: {},
    created_at: 100,
    updated_at: 200,
    ...overrides,
  }
}

function payload(overrides: Partial<PayloadSummary> = {}): PayloadSummary {
  return {
    greetings: 1,
    alternateGreetings: 0,
    lorebooks: 0,
    lorebookEntries: 0,
    scripts: 0,
    enabledScripts: 0,
    disabledScripts: 0,
    embeddedLumiScripts: 0,
    expressions: 0,
    embeddedGalleryItems: 0,
    storedImages: 0,
    images: [],
    recognizedExtensionKeys: [],
    otherExtensionKeys: [],
    otherExtensionBytes: 0,
    categoryCount: 0,
    itemCount: 0,
    ...overrides,
  }
}

function comparison(overrides: Partial<CardComparison> = {}): CardComparison {
  const source = character()
  return {
    id: source.id,
    name: source.name,
    creator: source.creator,
    tags: source.tags,
    imageId: null,
    avatarUrl: null,
    createdAt: source.created_at,
    updatedAt: source.updated_at,
    coreFields: canonicalCoreFields(source),
    tokens: {
      card: { value: 100, approximate: false, tokenizerName: 'test' },
      payload: { value: 0, approximate: false, tokenizerName: 'test' },
      total: 100,
    },
    payload: payload(),
    warnings: [],
    ...overrides,
  }
}

describe('normalization and exact matching', () => {
  test('normalizes unicode, case, and whitespace in names', () => {
    expect(normalizeName('  ＡLICE\n Smith  ')).toBe('alice smith')
  })

  test('exact fingerprints ignore identity, name, timestamps, and attached payload', () => {
    const left = character()
    const right = character({
      id: 'character-2',
      name: 'Renamed Alice',
      alternate_greetings: ['A second greeting'],
      world_book_ids: ['book-1'],
      extensions: { expressions: { happy: 'image-1' } },
      image_id: 'avatar-2',
      created_at: 900,
      updated_at: 1_000,
    })
    expect(exactFingerprint(left)).toBe(exactFingerprint(right))
  })

  test('exact fingerprints include every canonical content field', () => {
    expect(exactFingerprint(character())).not.toBe(
      exactFingerprint(character({ scenario: 'A city.' })),
    )
  })

  test('name mode groups same normalized names even when content differs', () => {
    const groups = findDuplicateGroups(
      [character(), character({ id: 'character-2', name: ' alice ', description: 'Different' })],
      'name',
      0.9,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]?.characterIds).toEqual(['character-1', 'character-2'])
  })
})

describe('similarity matching', () => {
  test('returns one for identical non-empty trigram sets and zero for empty text', () => {
    expect(sorensenDice('abcdef', 'abcdef')).toBe(1)
    expect(sorensenDice('', '')).toBe(0)
  })

  test('weights changed fields and does not treat two empty cards as duplicates', () => {
    const base = character()
    expect(characterSimilarity(base, character({ id: 'character-2' }))).toBe(1)

    const empty = character({
      description: '', personality: '', scenario: '', first_mes: '', mes_example: '',
      creator_notes: '', system_prompt: '', post_history_instructions: '', creator: '', tags: [],
    })
    expect(characterSimilarity(empty, { ...empty, id: 'empty-2' })).toBe(0)
  })

  test('joins qualifying similarity pairs into a connected group', () => {
    const cards = [
      character({ id: 'a', description: 'alpha beta gamma delta epsilon' }),
      character({ id: 'b', description: 'alpha beta gamma delta zeta' }),
      character({ id: 'c', description: 'alpha beta gamma theta zeta' }),
    ]
    const groups = findDuplicateGroups(cards, 'similar', 0.75)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.characterIds).toEqual(['a', 'b', 'c'])
    expect(groups[0]?.matches.length).toBeGreaterThanOrEqual(2)
  })
})

describe('payload classification and keeper ranking', () => {
  test('classifies known extension payload names and preserves unknown keys', () => {
    const entries = classifyExtensionPayload({
      regex_scripts: [{ id: 1 }],
      characterExpressions: { happy: 'image-1', sad: 'image-2' },
      image_gallery: ['image-1', 'image-1', 'https://example.test/image.png'],
      customMetadata: { importedBy: 'test' },
    })
    expect(entries.map((entry) => [entry.key, entry.category, entry.count])).toEqual([
      ['characterExpressions', 'expressions', 2],
      ['customMetadata', 'other', 1],
      ['image_gallery', 'gallery', 3],
      ['regex_scripts', 'lumiscripts', 1],
    ])
    expect(entries.find((entry) => entry.key === 'image_gallery')?.references).toEqual([
      'https://example.test/image.png',
      'image-1',
    ])
  })

  test('payload-rich card outranks a newer sparse card', () => {
    const rich = comparison({
      id: 'rich',
      updatedAt: 100,
      payload: payload({
        greetings: 10,
        alternateGreetings: 9,
        lorebooks: 1,
        lorebookEntries: 20,
        storedImages: 4,
        categoryCount: 3,
        itemCount: 34,
      }),
    })
    const sparse = comparison({ id: 'sparse', updatedAt: 10_000 })
    expect([sparse, rich].sort(compareKeeperCandidates)[0]?.id).toBe('rich')
  })

  test('recency breaks equal-payload ties before token count', () => {
    const old = comparison({ id: 'old', updatedAt: 100, tokens: { ...comparison().tokens, total: 500 } })
    const recent = comparison({ id: 'recent', updatedAt: 200, tokens: { ...comparison().tokens, total: 50 } })
    expect([old, recent].sort(compareKeeperCandidates)[0]?.id).toBe('recent')
  })
})
