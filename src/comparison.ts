import {
  CORE_FIELD_KEYS,
  type CardComparison,
  type CoreFieldKey,
  type ExtensionPayloadCategory,
  type ExtensionPayloadKey,
} from './types'

export type ComparisonStatus = 'same' | 'different'

export type ComparisonPayloadCategory = 'summary' | ExtensionPayloadCategory

export interface ComparisonCardReference {
  id: string
  name: string
}

export interface ComparisonValueGroup {
  value: string
  cards: ComparisonCardReference[]
}

/**
 * One fixed-width comparison row. The renderer can display each value group
 * vertically, with its associated cards listed below it, instead of creating
 * a column for every card in a duplicate group.
 */
export interface ComparisonRow {
  label: string
  payloadCategory?: ComparisonPayloadCategory
  status: ComparisonStatus
  values: ComparisonValueGroup[]
}

const CORE_FIELD_LABELS: Record<CoreFieldKey, string> = {
  description: 'Description',
  personality: 'Personality',
  scenario: 'Scenario',
  first_mes: 'Primary greeting',
  mes_example: 'Example dialogue',
  creator_notes: 'Creator notes',
  system_prompt: 'System prompt',
  post_history_instructions: 'Post-history instructions',
  creator: 'Creator',
  tags: 'Tags',
}

const PAYLOAD_CATEGORY_ORDER: Record<ExtensionPayloadCategory, number> = {
  lumiscripts: 0,
  expressions: 1,
  gallery: 2,
  other: 3,
}

interface ExtensionKeyDefinition {
  key: string
  category: ExtensionPayloadCategory
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('en-US') : 'Unavailable'
}

function formatCount(value: number, singular: string): string {
  if (!Number.isFinite(value)) return 'Unavailable'
  return `${formatNumber(value)} ${Math.abs(value) === 1 ? singular : `${singular}s`}`
}

function formatOptionalCount(value: number | null, singular: string): string {
  return value === null ? 'Unavailable' : formatCount(value, singular)
}

function formatTokenCount(value: number, approximate: boolean): string {
  if (!Number.isFinite(value)) return 'Unavailable'
  return `${approximate ? '~' : ''}${formatCount(value, 'token')}`
}

function formatCoreValue(key: CoreFieldKey, value: string): string {
  if (!value.trim()) return 'Empty'
  return key === 'tags'
    ? value.split('\n').filter(Boolean).join(', ')
    : value
}

function formatScriptSummary(card: CardComparison): string {
  const { scripts, enabledScripts, disabledScripts } = card.payload
  if (scripts === null) return 'Unavailable'

  const details = [formatCount(scripts, 'script')]
  details.push(enabledScripts === null ? 'enabled status unavailable' : `${formatNumber(enabledScripts)} enabled`)
  details.push(disabledScripts === null ? 'disabled status unavailable' : `${formatNumber(disabledScripts)} disabled`)
  return details.join(' · ')
}

function formatExtensionValue(entry: ExtensionPayloadKey | undefined): string {
  if (!entry) return 'Not present'
  const references = new Set(entry.references.filter((reference) => reference.trim())).size
  return [
    formatCount(entry.count, 'item'),
    formatCount(entry.bytes, 'byte'),
    formatCount(references, 'reference'),
  ].join(' · ')
}

function comparisonCardReference(card: CardComparison): ComparisonCardReference {
  return { id: card.id, name: card.name.trim() || 'Unnamed card' }
}

function buildRow(
  label: string,
  cards: CardComparison[],
  valueForCard: (card: CardComparison) => string,
  payloadCategory?: ComparisonPayloadCategory,
): ComparisonRow {
  const valueGroups = new Map<string, ComparisonValueGroup>()
  for (const card of cards) {
    const value = valueForCard(card)
    const group = valueGroups.get(value)
    if (group) {
      group.cards.push(comparisonCardReference(card))
    } else {
      valueGroups.set(value, { value, cards: [comparisonCardReference(card)] })
    }
  }

  const values = [...valueGroups.values()]
  return {
    label,
    ...(payloadCategory === undefined ? {} : { payloadCategory }),
    status: values.length <= 1 ? 'same' : 'different',
    values,
  }
}

function allExtensionEntries(card: CardComparison): ExtensionPayloadKey[] {
  return [...card.payload.recognizedExtensionKeys, ...card.payload.otherExtensionKeys]
}

function extensionKeyDefinitions(cards: CardComparison[]): ExtensionKeyDefinition[] {
  const definitions = new Map<string, ExtensionKeyDefinition>()
  for (const card of cards) {
    for (const entry of allExtensionEntries(card)) {
      const existing = definitions.get(entry.key)
      if (!existing || PAYLOAD_CATEGORY_ORDER[entry.category] < PAYLOAD_CATEGORY_ORDER[existing.category]) {
        definitions.set(entry.key, { key: entry.key, category: entry.category })
      }
    }
  }

  return [...definitions.values()].sort((left, right) => {
    const categoryDifference = PAYLOAD_CATEGORY_ORDER[left.category] - PAYLOAD_CATEGORY_ORDER[right.category]
    if (categoryDifference !== 0) return categoryDifference
    return left.key < right.key ? -1 : left.key > right.key ? 1 : 0
  })
}

function extensionEntry(card: CardComparison, key: string): ExtensionPayloadKey | undefined {
  return allExtensionEntries(card).find((entry) => entry.key === key)
}

function buildPayloadSummaryRows(cards: CardComparison[]): ComparisonRow[] {
  return [
    buildRow('Payload categories', cards, (card) => formatCount(card.payload.categoryCount, 'category'), 'summary'),
    buildRow('Payload items', cards, (card) => formatCount(card.payload.itemCount, 'item'), 'summary'),
    buildRow('Greetings', cards, (card) => formatCount(card.payload.greetings, 'greeting'), 'summary'),
    buildRow('Alternate greetings', cards, (card) => formatCount(card.payload.alternateGreetings, 'alternate greeting'), 'summary'),
    buildRow('Lorebooks', cards, (card) => formatOptionalCount(card.payload.lorebooks, 'lorebook'), 'summary'),
    buildRow('Lorebook entries', cards, (card) => formatOptionalCount(card.payload.lorebookEntries, 'entry'), 'summary'),
    buildRow('Scoped scripts', cards, formatScriptSummary, 'summary'),
    buildRow('Embedded LumiScripts', cards, (card) => formatCount(card.payload.embeddedLumiScripts, 'LumiScript'), 'lumiscripts'),
    buildRow('Expressions', cards, (card) => formatCount(card.payload.expressions, 'expression'), 'expressions'),
    buildRow('Embedded gallery references', cards, (card) => formatCount(card.payload.embeddedGalleryItems, 'reference'), 'gallery'),
    buildRow('Stored images', cards, (card) => formatOptionalCount(card.payload.storedImages, 'image'), 'gallery'),
    buildRow('Other extension data', cards, (card) => formatCount(card.payload.otherExtensionBytes, 'byte'), 'other'),
    buildRow('Card text tokens', cards, (card) => formatTokenCount(card.tokens.card.value, card.tokens.card.approximate), 'summary'),
    buildRow('Accessible payload tokens', cards, (card) => formatTokenCount(card.tokens.payload.value, card.tokens.payload.approximate), 'summary'),
    buildRow(
      'Total accessible tokens',
      cards,
      (card) => formatTokenCount(card.tokens.total, card.tokens.card.approximate || card.tokens.payload.approximate),
      'summary',
    ),
  ]
}

/**
 * Builds stable, vertically scalable comparison rows for one duplicate group.
 * Rows retain the supplied card order (the scanner puts the recommended keeper
 * first); extension-key rows are sorted by category and key.
 */
export function buildComparisonRows(cards: CardComparison[]): ComparisonRow[] {
  if (cards.length === 0) return []

  const coreRows = CORE_FIELD_KEYS.map((key) =>
    buildRow(CORE_FIELD_LABELS[key], cards, (card) => formatCoreValue(key, card.coreFields[key])),
  )
  const payloadRows = buildPayloadSummaryRows(cards)
  const extensionRows = extensionKeyDefinitions(cards).map((definition) =>
    buildRow(
      `Extension key: ${definition.key || 'Unnamed key'}`,
      cards,
      (card) => formatExtensionValue(extensionEntry(card, definition.key)),
      definition.category,
    ),
  )

  return [...coreRows, ...payloadRows, ...extensionRows]
}
