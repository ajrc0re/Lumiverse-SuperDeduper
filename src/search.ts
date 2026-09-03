const WHITESPACE = /\s+/gu

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
