import { createHash } from 'node:crypto'

import {
  CORE_FIELD_KEYS,
  type CardComparison,
  type CharacterRecord,
  type CoreFieldKey,
  type ExtensionPayloadCategory,
  type ExtensionPayloadKey,
  type MatchMode,
  type MatchPair,
  type RawDuplicateGroup,
} from './types'

const WHITESPACE = /\s+/gu

export function normalizeName(value: string): string {
  return value.normalize('NFKC').toLowerCase().trim().replace(WHITESPACE, ' ')
}

export function normalizeContent(value: string): string {
  return value.normalize('NFKC').toLowerCase().trim().replace(WHITESPACE, ' ')
}

export function canonicalCoreFields(
  character: CharacterRecord,
): Record<CoreFieldKey, string> {
  return {
    description: normalizeContent(character.description),
    personality: normalizeContent(character.personality),
    scenario: normalizeContent(character.scenario),
    first_mes: normalizeContent(character.first_mes),
    mes_example: normalizeContent(character.mes_example),
    creator_notes: normalizeContent(character.creator_notes),
    system_prompt: normalizeContent(character.system_prompt),
    post_history_instructions: normalizeContent(character.post_history_instructions),
    creator: normalizeContent(character.creator),
    tags: [...new Set(character.tags.map(normalizeContent).filter(Boolean))].sort().join('\n'),
  }
}

export function canonicalCoreText(character: CharacterRecord): string {
  const fields = canonicalCoreFields(character)
  return CORE_FIELD_KEYS.map((key) => `${key}\n${fields[key]}`).join('\n\n')
}

export function exactFingerprint(character: CharacterRecord): string {
  return createHash('sha256').update(canonicalCoreText(character)).digest('hex')
}

function trigrams(value: string): Set<string> {
  if (!value) return new Set()
  if (value.length < 3) return new Set([value])

  const grams = new Set<string>()
  for (let index = 0; index <= value.length - 3; index += 1) {
    grams.add(value.slice(index, index + 3))
  }
  return grams
}

export function sorensenDice(left: string, right: string): number {
  if (!left && !right) return 0
  if (left === right) return 1

  const leftGrams = trigrams(left)
  const rightGrams = trigrams(right)
  if (leftGrams.size === 0 || rightGrams.size === 0) return 0

  let intersection = 0
  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) intersection += 1
  }
  return (2 * intersection) / (leftGrams.size + rightGrams.size)
}

export function characterSimilarity(
  left: CharacterRecord,
  right: CharacterRecord,
): number {
  const leftFields = canonicalCoreFields(left)
  const rightFields = canonicalCoreFields(right)
  let weightedScore = 0
  let totalWeight = 0

  for (const key of CORE_FIELD_KEYS) {
    const leftValue = leftFields[key]
    const rightValue = rightFields[key]
    if (!leftValue && !rightValue) continue

    const weight = Math.max(leftValue.length, rightValue.length, 1)
    weightedScore += sorensenDice(leftValue, rightValue) * weight
    totalWeight += weight
  }

  return totalWeight === 0 ? 0 : weightedScore / totalWeight
}

function pairAll(ids: string[]): MatchPair[] {
  const pairs: MatchPair[] = []
  for (let left = 0; left < ids.length; left += 1) {
    for (let right = left + 1; right < ids.length; right += 1) {
      pairs.push({ leftId: ids[left]!, rightId: ids[right]!, similarity: 1 })
    }
  }
  return pairs
}

function groupId(mode: MatchMode, ids: string[]): string {
  const digest = createHash('sha256').update(ids.slice().sort().join('\0')).digest('hex').slice(0, 12)
  return `${mode}-${digest}`
}

function bucketGroups(
  characters: CharacterRecord[],
  mode: 'name' | 'exact',
): RawDuplicateGroup[] {
  const buckets = new Map<string, CharacterRecord[]>()
  for (const character of characters) {
    const key = mode === 'name' ? normalizeName(character.name) : exactFingerprint(character)
    if (!key) continue
    const bucket = buckets.get(key) ?? []
    bucket.push(character)
    buckets.set(key, bucket)
  }

  return [...buckets.values()]
    .filter((bucket) => bucket.length > 1)
    .map((bucket) => {
      const ids = bucket.map((character) => character.id).sort()
      return { id: groupId(mode, ids), mode, characterIds: ids, matches: pairAll(ids) }
    })
}

export function findDuplicateGroups(
  characters: CharacterRecord[],
  mode: MatchMode,
  similarityThreshold: number,
): RawDuplicateGroup[] {
  if (mode === 'name' || mode === 'exact') return bucketGroups(characters, mode)

  const threshold = Math.min(1, Math.max(0, similarityThreshold))
  const parent = new Map(characters.map((character) => [character.id, character.id]))
  const matches: MatchPair[] = []

  const find = (id: string): string => {
    const current = parent.get(id) ?? id
    if (current === id) return id
    const root = find(current)
    parent.set(id, root)
    return root
  }

  const join = (left: string, right: string): void => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot)
  }

  for (let left = 0; left < characters.length; left += 1) {
    for (let right = left + 1; right < characters.length; right += 1) {
      const leftCharacter = characters[left]!
      const rightCharacter = characters[right]!
      const similarity = characterSimilarity(leftCharacter, rightCharacter)
      if (similarity >= threshold) {
        matches.push({
          leftId: leftCharacter.id,
          rightId: rightCharacter.id,
          similarity,
        })
        join(leftCharacter.id, rightCharacter.id)
      }
    }
  }

  const components = new Map<string, string[]>()
  for (const character of characters) {
    const root = find(character.id)
    const ids = components.get(root) ?? []
    ids.push(character.id)
    components.set(root, ids)
  }

  return [...components.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) => {
      const sortedIds = ids.sort()
      const idSet = new Set(sortedIds)
      return {
        id: groupId(mode, sortedIds),
        mode,
        characterIds: sortedIds,
        matches: matches.filter(
          (match) => idSet.has(match.leftId) && idSet.has(match.rightId),
        ),
      }
    })
}

function payloadCategory(key: string): ExtensionPayloadCategory {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]+/gu, '_')
  if (/lumiscript|regex_script/u.test(normalized)) return 'lumiscripts'
  if (/expression/u.test(normalized)) return 'expressions'
  if (/gallery|galleries|image/u.test(normalized)) return 'gallery'
  return 'other'
}

function payloadItemCount(value: unknown): number {
  if (Array.isArray(value)) return value.length
  if (value && typeof value === 'object') return Object.keys(value).length
  if (typeof value === 'string') return value.trim() ? 1 : 0
  return value === null || value === undefined || value === false ? 0 : 1
}

function serializedBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength
  } catch {
    return 0
  }
}

function collectReferences(value: unknown): string[] {
  const references = new Set<string>()
  const pending: unknown[] = [value]
  let visited = 0

  while (pending.length > 0 && visited < 10_000) {
    visited += 1
    const current = pending.pop()
    if (typeof current === 'string' && current.trim()) {
      references.add(current.trim())
    } else if (Array.isArray(current)) {
      pending.push(...current)
    } else if (current && typeof current === 'object') {
      pending.push(...Object.values(current))
    }
  }

  return [...references]
}

export function classifyExtensionPayload(
  extensions: Record<string, unknown>,
): ExtensionPayloadKey[] {
  return Object.entries(extensions)
    .map(([key, value]) => {
      const category = payloadCategory(key)
      return {
        key,
        category,
        count: payloadItemCount(value),
        bytes: serializedBytes(value),
        references: category === 'gallery' ? collectReferences(value) : [],
      }
    })
    .filter((entry) => entry.count > 0 || entry.bytes > 0)
    .sort((left, right) => left.key.localeCompare(right.key))
}

export function keeperTuple(card: CardComparison): readonly [number, number, number, number, number, string] {
  return [
    card.payload.categoryCount,
    card.payload.itemCount,
    card.updatedAt,
    card.tokens.total,
    card.createdAt,
    card.id,
  ]
}

export function compareKeeperCandidates(left: CardComparison, right: CardComparison): number {
  const leftTuple = keeperTuple(left)
  const rightTuple = keeperTuple(right)
  for (let index = 0; index < leftTuple.length - 1; index += 1) {
    const difference = (rightTuple[index] as number) - (leftTuple[index] as number)
    if (difference !== 0) return difference
  }
  return String(rightTuple[5]).localeCompare(String(leftTuple[5]))
}

export function recommendationReasons(
  winner: CardComparison,
  runnerUp: CardComparison | undefined,
): string[] {
  if (!runnerUp) return ['Only candidate in group.']

  const reasons: string[] = []
  if (winner.payload.categoryCount !== runnerUp.payload.categoryCount) {
    reasons.push(
      `Payload coverage: ${winner.payload.categoryCount} categories versus ${runnerUp.payload.categoryCount}.`,
    )
  }
  if (winner.payload.itemCount !== runnerUp.payload.itemCount) {
    reasons.push(`Payload items: ${winner.payload.itemCount} versus ${runnerUp.payload.itemCount}.`)
  }
  if (winner.updatedAt !== runnerUp.updatedAt) {
    reasons.push(
      winner.updatedAt > runnerUp.updatedAt
        ? `Updated more recently (${formatDate(winner.updatedAt)}).`
        : `Older update (${formatDate(winner.updatedAt)}); payload richness takes priority.`,
    )
  }
  if (winner.tokens.total !== runnerUp.tokens.total) {
    reasons.push(`Accessible text tokens: ${winner.tokens.total} versus ${runnerUp.tokens.total}.`)
  }
  if (reasons.length === 0) reasons.push('Selected by the deterministic character ID tie-breaker.')
  return reasons
}

function formatDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1_000).toISOString().slice(0, 10)
}
