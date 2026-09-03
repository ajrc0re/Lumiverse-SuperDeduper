import {
  canonicalCoreFields,
  classifyExtensionPayload,
  compareKeeperCandidates,
  findDuplicateGroups,
  recommendationReasons,
} from './core'
import type {
  Availability,
  CardComparison,
  CharacterRecord,
  DuplicateGroup,
  ImageSummary,
  MatchMode,
  PermissionAvailability,
  ScanResult,
  TokenCount,
} from './types'

interface Page<T> {
  data: T[]
  total: number
}

export type ScanProgressCallback = (
  phase: 'collecting' | 'matching' | 'enriching',
  current: number,
  total: number,
) => void

interface WorldBookRecord {
  id: string
  name: string
  description: string
}

interface WorldBookEntryRecord {
  key: string[]
  keysecondary: string[]
  content: string
  comment: string
  role: string | null
  group_name: string
}

interface RegexScriptRecord {
  id: string
  name: string
  find_regex: string
  replace_string: string
  actions?: unknown[]
  disabled: boolean
  description: string
  folder: string
}

interface ImageRecord {
  id: string
  url: string
  original_filename: string
  mime_type: string
  width: number | null
  height: number | null
}

interface HostTokenCount {
  total_tokens: number
  tokenizer_name: string
  approximate: boolean
}

export interface ScannerApi {
  listCharacters(options: { limit: number; offset: number }): Promise<Page<CharacterRecord>>
  countText(text: string): Promise<HostTokenCount>
  getWorldBook(id: string): Promise<WorldBookRecord | null>
  listWorldBookEntries(
    worldBookId: string,
    options: { limit: number; offset: number },
  ): Promise<Page<WorldBookEntryRecord>>
  listRegexScripts(options: {
    scope: 'character'
    scopeId: string
    limit: number
    offset: number
  }): Promise<Page<RegexScriptRecord>>
  listImages(options: {
    characterId: string
    specificity: 'sm'
    limit: number
    offset: number
  }): Promise<Page<ImageRecord>>
  getImage(id: string): Promise<ImageRecord | null>
}

export interface GrantedFeatures {
  characters: boolean
  worldBooks: boolean
  images: boolean
  regexScripts: boolean
}

interface LorebookDetails {
  entries: number
  text: string
  warning: string | null
}

interface ScriptDetails {
  total: number
  enabled: number
  disabled: number
  text: string
}

function availability(granted: boolean): Availability {
  return granted ? 'available' : 'unavailable'
}

export function permissionAvailability(features: GrantedFeatures): PermissionAvailability {
  return {
    characters: availability(features.characters),
    worldBooks: availability(features.worldBooks),
    images: availability(features.images),
    regexScripts: availability(features.regexScripts),
  }
}

async function listEvery<T>(
  list: (options: { limit: number; offset: number }) => Promise<Page<T>>,
  signal?: AbortSignal,
  onPage?: (current: number, total: number) => void,
): Promise<T[]> {
  const values: T[] = []
  const limit = 200
  let offset = 0

  for (;;) {
    checkCancelled(signal)
    const page = await list({ limit, offset })
    checkCancelled(signal)
    values.push(...page.data)
    offset += page.data.length
    onPage?.(values.length, page.total)
    if (offset >= page.total || page.data.length === 0) return values
  }
}

export async function listAllCharacters(
  api: ScannerApi,
  signal?: AbortSignal,
  onProgress?: ScanProgressCallback,
): Promise<CharacterRecord[]> {
  return listEvery(
    (options) => api.listCharacters(options),
    signal,
    (current, total) => onProgress?.('collecting', current, total),
  )
}

function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('SCAN_CANCELLED')
}

async function countText(api: ScannerApi, text: string): Promise<TokenCount> {
  if (!text) return { value: 0, approximate: false, tokenizerName: 'No text' }
  try {
    const result = await api.countText(text)
    return {
      value: result.total_tokens,
      approximate: result.approximate,
      tokenizerName: result.tokenizer_name,
    }
  } catch {
    return {
      value: Math.ceil(text.length / 4),
      approximate: true,
      tokenizerName: 'Local characters ÷ 4 estimate',
    }
  }
}

function cardText(character: CharacterRecord): string {
  return [
    character.description,
    character.personality,
    character.scenario,
    character.first_mes,
    character.mes_example,
    character.creator_notes,
    character.system_prompt,
    character.post_history_instructions,
    character.creator,
    character.tags.join('\n'),
    character.alternate_greetings.join('\n\n'),
  ]
    .filter(Boolean)
    .join('\n\n')
}

function worldBookEntryText(entry: WorldBookEntryRecord): string {
  return [
    entry.key.join(', '),
    entry.keysecondary.join(', '),
    entry.content,
    entry.comment,
    entry.role ?? '',
    entry.group_name,
  ]
    .filter(Boolean)
    .join('\n')
}

async function loadLorebook(api: ScannerApi, id: string): Promise<LorebookDetails> {
  try {
    const book = await api.getWorldBook(id)
    if (!book) return { entries: 0, text: '', warning: `Lorebook ${id} was not found.` }
    const entries = await listEvery((options) => api.listWorldBookEntries(id, options))
    return {
      entries: entries.length,
      text: [book.name, book.description, ...entries.map(worldBookEntryText)]
        .filter(Boolean)
        .join('\n\n'),
      warning: null,
    }
  } catch (error) {
    return {
      entries: 0,
      text: '',
      warning: `Could not inspect lorebook ${id}: ${errorMessage(error)}`,
    }
  }
}

function scriptText(script: RegexScriptRecord): string {
  return [
    script.name,
    script.description,
    script.folder,
    script.find_regex,
    script.replace_string,
    JSON.stringify(script.actions ?? []),
  ]
    .filter(Boolean)
    .join('\n')
}

async function loadScripts(api: ScannerApi, characterId: string): Promise<ScriptDetails> {
  const scripts = await listEvery((options) =>
    api.listRegexScripts({ scope: 'character', scopeId: characterId, ...options }),
  )
  const disabled = scripts.filter((script) => script.disabled).length
  return {
    total: scripts.length,
    enabled: scripts.length - disabled,
    disabled,
    text: scripts.map(scriptText).join('\n\n'),
  }
}

async function loadImages(api: ScannerApi, characterId: string): Promise<ImageSummary[]> {
  const images = await listEvery((options) =>
    api.listImages({ characterId, specificity: 'sm', ...options }),
  )
  const unique = new Map<string, ImageSummary>()
  for (const image of images) {
    unique.set(image.id, {
      id: image.id,
      url: image.url,
      filename: image.original_filename,
      mimeType: image.mime_type,
      width: image.width,
      height: image.height,
    })
  }
  return [...unique.values()]
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
  signal?: AbortSignal,
  onComplete?: (completed: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(values.length)
  let nextIndex = 0
  let completed = 0

  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    for (;;) {
      checkCancelled(signal)
      const index = nextIndex
      nextIndex += 1
      if (index >= values.length) return
      results[index] = await mapper(values[index]!)
      completed += 1
      onComplete?.(completed, values.length)
    }
  })

  await Promise.all(workers)
  return results
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function markPartial(
  availabilityState: PermissionAvailability,
  key: 'worldBooks' | 'images' | 'regexScripts',
): void {
  if (availabilityState[key] === 'available') availabilityState[key] = 'partial'
}

async function enrichCharacter(
  api: ScannerApi,
  character: CharacterRecord,
  features: GrantedFeatures,
  availabilityState: PermissionAvailability,
  lorebookCache: Map<string, Promise<LorebookDetails>>,
  signal?: AbortSignal,
): Promise<CardComparison> {
  checkCancelled(signal)
  const warnings: string[] = []
  const extensionPayload = classifyExtensionPayload(character.extensions)
  const embeddedLumiScripts = extensionPayload
    .filter((entry) => entry.category === 'lumiscripts')
    .reduce((total, entry) => total + entry.count, 0)
  const expressions = extensionPayload
    .filter((entry) => entry.category === 'expressions')
    .reduce((total, entry) => total + entry.count, 0)
  const galleryEntries = extensionPayload.filter((entry) => entry.category === 'gallery')
  const otherExtensionKeys = extensionPayload.filter((entry) => entry.category === 'other')

  const lorebookIds = [...new Set(character.world_book_ids.filter(Boolean))]
  let lorebookEntries: number | null = features.worldBooks ? 0 : null
  let lorebookText = ''
  if (features.worldBooks) {
    const books = await Promise.all(
      lorebookIds.map((id) => {
        let pending = lorebookCache.get(id)
        if (!pending) {
          pending = loadLorebook(api, id)
          lorebookCache.set(id, pending)
        }
        return pending
      }),
    )
    checkCancelled(signal)
    lorebookEntries = books.reduce((total, book) => total + book.entries, 0)
    lorebookText = books.map((book) => book.text).filter(Boolean).join('\n\n')
    for (const book of books) {
      if (book.warning) {
        warnings.push(book.warning)
        markPartial(availabilityState, 'worldBooks')
      }
    }
  }

  let scripts: ScriptDetails | null = null
  if (features.regexScripts) {
    try {
      scripts = await loadScripts(api, character.id)
    } catch (error) {
      warnings.push(`Could not inspect character scripts: ${errorMessage(error)}`)
      markPartial(availabilityState, 'regexScripts')
    }
  }
  checkCancelled(signal)

  let images: ImageSummary[] = []
  let storedImages: number | null = features.images ? 0 : null
  let avatarUrl: string | null = null
  if (features.images) {
    try {
      images = (await loadImages(api, character.id)).filter(
        (image) => image.id !== character.image_id,
      )
      storedImages = images.length
      if (character.image_id) avatarUrl = (await api.getImage(character.image_id))?.url ?? null
    } catch (error) {
      warnings.push(`Could not inspect character images: ${errorMessage(error)}`)
      markPartial(availabilityState, 'images')
      storedImages = null
      images = []
    }
  }
  checkCancelled(signal)

  const storedReferences = new Set<string>()
  for (const image of images) {
    storedReferences.add(image.id)
    storedReferences.add(image.url)
  }
  if (character.image_id) storedReferences.add(character.image_id)
  const allGalleryReferences = new Set(galleryEntries.flatMap((entry) => entry.references))
  const embeddedGalleryReferences = new Set(
    [...allGalleryReferences].filter((ref) => !storedReferences.has(ref)),
  )

  const cardTokenCount = await countText(api, cardText(character))
  const payloadTokenCount = await countText(
    api,
    [lorebookText, scripts?.text ?? ''].filter(Boolean).join('\n\n'),
  )

  const alternateGreetings = character.alternate_greetings.filter(
    (greeting) => greeting.trim().length > 0,
  ).length
  const scriptCount = scripts?.total ?? null
  const visibleStoredImages = storedImages ?? 0
  const galleryItemCount =
    allGalleryReferences.size > 0
      ? embeddedGalleryReferences.size
      : galleryEntries.reduce((total, entry) => total + entry.count, 0)
  const knownCategoryFlags = [
    alternateGreetings > 0,
    lorebookIds.length > 0,
    (scriptCount ?? 0) + embeddedLumiScripts > 0,
    expressions > 0,
    visibleStoredImages + galleryItemCount > 0,
  ]
  const payloadItemCount =
    alternateGreetings +
    lorebookIds.length +
    (lorebookEntries ?? 0) +
    (scriptCount ?? 0) +
    embeddedLumiScripts +
    expressions +
    visibleStoredImages +
    galleryItemCount

  return {
    id: character.id,
    name: character.name,
    creator: character.creator,
    tags: character.tags,
    imageId: character.image_id,
    avatarUrl,
    createdAt: character.created_at,
    updatedAt: character.updated_at,
    coreFields: canonicalCoreFields(character),
    tokens: {
      card: cardTokenCount,
      payload: payloadTokenCount,
      total: cardTokenCount.value + payloadTokenCount.value,
    },
    payload: {
      greetings: (character.first_mes.trim() ? 1 : 0) + alternateGreetings,
      alternateGreetings,
      lorebooks: lorebookIds.length,
      lorebookEntries,
      scripts: scriptCount,
      enabledScripts: scripts?.enabled ?? null,
      disabledScripts: scripts?.disabled ?? null,
      embeddedLumiScripts,
      expressions,
      embeddedGalleryItems: galleryItemCount,
      storedImages,
      images,
      recognizedExtensionKeys: extensionPayload.filter((entry) => entry.category !== 'other'),
      otherExtensionKeys,
      otherExtensionBytes: otherExtensionKeys.reduce((total, entry) => total + entry.bytes, 0),
      categoryCount: knownCategoryFlags.filter(Boolean).length,
      itemCount: payloadItemCount,
    },
    warnings,
  }
}

export async function scanDuplicates(
  api: ScannerApi,
  features: GrantedFeatures,
  mode: MatchMode,
  similarityThreshold: number,
  signal?: AbortSignal,
  onProgress?: ScanProgressCallback,
): Promise<ScanResult> {
  if (!features.characters) throw new Error('PERMISSION_DENIED: characters')

  onProgress?.('collecting', 0, 0)
  const characters = await listAllCharacters(api, signal, onProgress)
  checkCancelled(signal)
  onProgress?.('matching', 0, characters.length)
  const rawGroups = findDuplicateGroups(characters, mode, similarityThreshold)
  onProgress?.('matching', characters.length, characters.length)
  const duplicateIds = new Set(rawGroups.flatMap((group) => group.characterIds))
  const candidates = characters.filter((character) => duplicateIds.has(character.id))
  const availabilityState = permissionAvailability(features)
  const lorebookCache = new Map<string, Promise<LorebookDetails>>()
  onProgress?.('enriching', 0, candidates.length)
  const enriched = await mapConcurrent(
    candidates,
    6,
    (character) => enrichCharacter(api, character, features, availabilityState, lorebookCache, signal),
    signal,
    (current, total) => onProgress?.('enriching', current, total),
  )
  checkCancelled(signal)
  const cardsById = new Map(enriched.map((card) => [card.id, card]))
  const optionalUnavailable =
    !features.worldBooks || !features.images || !features.regexScripts

  const groups: DuplicateGroup[] = rawGroups.map((rawGroup) => {
    const cards = rawGroup.characterIds
      .map((id) => cardsById.get(id))
      .filter((card): card is CardComparison => Boolean(card))
      .sort(compareKeeperCandidates)
    const winner = cards[0]!
    const provisional =
      optionalUnavailable ||
      Object.values(availabilityState).includes('partial') ||
      cards.some((card) => card.warnings.length > 0)
    return {
      id: rawGroup.id,
      mode: rawGroup.mode,
      matches: rawGroup.matches,
      cards,
      recommendedKeeperId: winner.id,
      recommendationProvisional: provisional,
      recommendationReasons: recommendationReasons(winner, cards[1]),
    }
  })

  return {
    groups,
    totalCharacters: characters.length,
    duplicateCharacters: duplicateIds.size,
    availability: availabilityState,
    scannedAt: Math.floor(Date.now() / 1_000),
  }
}
