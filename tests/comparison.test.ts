import { describe, expect, test } from 'bun:test'

import { buildComparisonRows } from '../src/comparison'
import type { CardComparison, PayloadSummary } from '../src/types'

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

function coreFields(overrides: Partial<CardComparison['coreFields']> = {}): CardComparison['coreFields'] {
  return {
    description: 'Shared description',
    personality: 'Shared personality',
    scenario: 'Shared scenario',
    first_mes: 'Hello',
    mes_example: 'Example dialogue',
    creator_notes: '',
    system_prompt: '',
    post_history_instructions: '',
    creator: 'Creator',
    tags: 'fantasy',
    ...overrides,
  }
}

function card(overrides: Partial<CardComparison> = {}): CardComparison {
  return {
    id: 'card-1',
    name: 'Card 1',
    creator: 'Creator',
    tags: ['fantasy'],
    imageId: null,
    avatarUrl: null,
    createdAt: 100,
    updatedAt: 200,
    coreFields: coreFields(),
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

function rowByLabel(rows: ReturnType<typeof buildComparisonRows>, label: string) {
  const row = rows.find((candidate) => candidate.label === label)
  if (!row) throw new Error(`Missing comparison row: ${label}`)
  return row
}

describe('buildComparisonRows', () => {
  test('collapses matching values for groups with more than 25 cards', () => {
    const cards = Array.from({ length: 30 }, (_, index) =>
      card({ id: `card-${index + 1}`, name: `Card ${index + 1}` }),
    )

    const rows = buildComparisonRows(cards)
    const twoCardRows = buildComparisonRows(cards.slice(0, 2))
    const description = rowByLabel(rows, 'Description')
    const greetings = rowByLabel(rows, 'Greetings')

    expect(rows).toHaveLength(twoCardRows.length)
    expect(description).toMatchObject({ status: 'same' })
    expect(description.values).toHaveLength(1)
    expect(description.values[0]?.cards).toHaveLength(30)
    expect(greetings.values).toHaveLength(1)
    expect(greetings.values[0]?.cards.map((candidate) => candidate.id)).toEqual([
      ...Array.from({ length: 30 }, (_, index) => `card-${index + 1}`),
    ])
  })

  test('groups divergent core-field values and keeps cards in supplied order', () => {
    const rows = buildComparisonRows([
      card({ id: 'keeper', name: 'Keeper', coreFields: coreFields({ description: 'Shared profile' }) }),
      card({ id: 'revision', name: 'Revision', coreFields: coreFields({ description: 'Changed profile' }) }),
      card({ id: 'import', name: 'Import', coreFields: coreFields({ description: 'Shared profile' }) }),
    ])

    expect(rowByLabel(rows, 'Description')).toEqual({
      label: 'Description',
      status: 'different',
      values: [
        {
          value: 'Shared profile',
          cards: [
            { id: 'keeper', name: 'Keeper' },
            { id: 'import', name: 'Import' },
          ],
        },
        {
          value: 'Changed profile',
          cards: [{ id: 'revision', name: 'Revision' }],
        },
      ],
    })
  })

  test('uses readable empty and unavailable values instead of blanks or false zeroes', () => {
    const rows = buildComparisonRows([
      card({
        id: 'a',
        payload: payload({ lorebooks: null, scripts: null, storedImages: null }),
        coreFields: coreFields({ creator_notes: '   ' }),
      }),
      card({
        id: 'b',
        payload: payload({ lorebooks: null, scripts: null, storedImages: null }),
        coreFields: coreFields({ creator_notes: '' }),
      }),
    ])

    expect(rowByLabel(rows, 'Creator notes').values[0]?.value).toBe('Empty')
    expect(rowByLabel(rows, 'Lorebooks').values[0]?.value).toBe('Unavailable')
    expect(rowByLabel(rows, 'Scoped scripts').values[0]?.value).toBe('Unavailable')
    expect(rowByLabel(rows, 'Stored images').values[0]?.value).toBe('Unavailable')
  })

  test('unions payload keys and reports presence, counts, bytes, and references', () => {
    const rows = buildComparisonRows([
      card({
        id: 'a',
        name: 'A',
        payload: payload({
          recognizedExtensionKeys: [
            { key: 'expression_sets', category: 'expressions', count: 2, bytes: 40, references: [] },
          ],
          otherExtensionKeys: [
            { key: 'chub', category: 'other', count: 4, bytes: 307, references: [] },
          ],
          otherExtensionBytes: 307,
        }),
      }),
      card({
        id: 'b',
        name: 'B',
        payload: payload({
          recognizedExtensionKeys: [
            { key: 'expression_sets', category: 'expressions', count: 2, bytes: 40, references: [] },
            {
              key: 'image_gallery',
              category: 'gallery',
              count: 1,
              bytes: 9,
              references: ['image-1', 'https://example.test/image-1'],
            },
          ],
          otherExtensionKeys: [
            { key: 'chub', category: 'other', count: 2, bytes: 100, references: [] },
          ],
          otherExtensionBytes: 100,
        }),
      }),
      card({ id: 'c', name: 'C' }),
    ])

    const expression = rowByLabel(rows, 'Extension key: expression_sets')
    const gallery = rowByLabel(rows, 'Extension key: image_gallery')
    const chub = rowByLabel(rows, 'Extension key: chub')

    expect(expression.payloadCategory).toBe('expressions')
    expect(expression.status).toBe('different')
    expect(expression.values).toEqual([
      {
        value: '2 items · 40 bytes · 0 references',
        cards: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ],
      },
      { value: 'Not present', cards: [{ id: 'c', name: 'C' }] },
    ])
    expect(gallery.payloadCategory).toBe('gallery')
    expect(gallery.values).toEqual([
      { value: 'Not present', cards: [{ id: 'a', name: 'A' }, { id: 'c', name: 'C' }] },
      {
        value: '1 item · 9 bytes · 2 references',
        cards: [{ id: 'b', name: 'B' }],
      },
    ])
    expect(chub.payloadCategory).toBe('other')
    expect(chub.values.map((group) => group.value)).toEqual([
      '4 items · 307 bytes · 0 references',
      '2 items · 100 bytes · 0 references',
      'Not present',
    ])
  })
})
