import type { SearchField } from './types'

const WHITESPACE = /\s+/gu

interface SearchableCard {
  id: string
  name: string
  creator: string
  tags: string[]
}

export function searchFieldValues(card: SearchableCard, field: SearchField): string[] {
  if (field === 'name') return [card.name]
  if (field === 'creator') return [card.creator]
  if (field === 'tag') return card.tags
  return [card.id]
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().trim().replace(WHITESPACE, ' ')
}

export function matchesWildcardSearch(values: string[], query: string): boolean {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return true
  const normalizedValues = values.map(normalize)
  if (!normalizedQuery.includes('*')) {
    return normalizedValues.some((value) => value.includes(normalizedQuery))
  }
  const pattern = normalizedQuery
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  const matcher = new RegExp(`^${pattern}$`, 'u')
  return normalizedValues.some((value) => matcher.test(value))
}
