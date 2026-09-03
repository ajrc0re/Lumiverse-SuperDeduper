import { permissionAvailability, scanDuplicates, type ScannerApi } from './scanner'
import { deleteCharacterSafely, deleteCharactersSafely } from './deletion'
import type {
  BackendResponse,
  CharacterRecord,
  FrontendRequest,
  MatchMode,
  SearchField,
} from './types'

declare const spindle: import('lumiverse-spindle-types').SpindleAPI

const activeScans = new Map<string, { requestId: string; controller: AbortController }>()
const EXTENSION_VERSION = '0.6.1'

function scanOwnerKey(userId?: string): string {
  return userId ?? '__extension_owner__'
}

function grantedFeatures() {
  return {
    characters: spindle.permissions.has('characters'),
    worldBooks: spindle.permissions.has('world_books'),
    images: spindle.permissions.has('images'),
    regexScripts: spindle.permissions.has('regex_scripts'),
  }
}

function scannerApiFor(userId?: string): ScannerApi {
  return {
    listCharacters: async (options) =>
      (await spindle.characters.list({ ...options, ...(userId ? { userId } : {}) })) as {
        data: CharacterRecord[]
        total: number
      },
    countText: (text) =>
      spindle.tokens.countText(text, { modelSource: 'main', ...(userId ? { userId } : {}) }),
    getWorldBook: (id) => spindle.world_books.get(id, userId),
    listWorldBookEntries: (worldBookId, options) =>
      spindle.world_books.entries.list(worldBookId, { ...options, ...(userId ? { userId } : {}) }),
    listRegexScripts: (options) =>
      spindle.regex_scripts.list({ ...options, ...(userId ? { userId } : {}) }),
    listImages: (options) => spindle.images.list({ ...options, ...(userId ? { userId } : {}) }),
    getImage: (id) =>
      spindle.images.get(id, { specificity: 'sm', ...(userId ? { userId } : {}) }),
  }
}

function send(payload: BackendResponse, userId?: string): void {
  spindle.sendToFrontend(payload, userId)
}

function isMatchMode(value: unknown): value is MatchMode {
  return value === 'name' || value === 'exact' || value === 'similar'
}

function isSearchField(value: unknown): value is SearchField {
  return value === 'name' || value === 'creator' || value === 'tag' || value === 'id'
}

function isFrontendRequest(payload: unknown): payload is FrontendRequest {
  if (!payload || typeof payload !== 'object' || !('type' in payload)) return false
  const type = (payload as { type?: unknown }).type
  if (type === 'get_status') return true
  if (type === 'scan_duplicates') {
    const request = payload as Partial<Extract<FrontendRequest, { type: 'scan_duplicates' }>>
    return (
      typeof request.requestId === 'string' &&
      isMatchMode(request.mode) &&
      (request.filterQuery === undefined || typeof request.filterQuery === 'string') &&
      (request.searchField === undefined || isSearchField(request.searchField)) &&
      (request.batchSize === undefined ||
        (typeof request.batchSize === 'number' && Number.isFinite(request.batchSize))) &&
      (request.batchOffset === undefined ||
        (typeof request.batchOffset === 'number' && Number.isFinite(request.batchOffset)))
    )
  }
  if (type === 'cancel_scan') {
    const request = payload as Partial<Extract<FrontendRequest, { type: 'cancel_scan' }>>
    return typeof request.requestId === 'string'
  }
  if (type === 'delete_card') {
    const request = payload as Partial<Extract<FrontendRequest, { type: 'delete_card' }>>
    return (
      typeof request.requestId === 'string' &&
      typeof request.characterId === 'string' &&
      typeof request.expectedUpdatedAt === 'number'
    )
  }
  if (type === 'delete_duplicates') {
    const request = payload as Partial<Extract<FrontendRequest, { type: 'delete_duplicates' }>>
    return (
      typeof request.requestId === 'string' &&
      typeof request.groupCount === 'number' &&
      Array.isArray(request.cards) &&
      request.cards.length > 0 &&
      request.cards.every((card) =>
        card && typeof card.characterId === 'string' &&
        typeof card.expectedUpdatedAt === 'number' && typeof card.name === 'string',
      )
    )
  }
  return false
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function handleScan(
  request: Extract<FrontendRequest, { type: 'scan_duplicates' }>,
  userId?: string,
): Promise<void> {
  const ownerKey = scanOwnerKey(userId)
  if (activeScans.has(ownerKey)) {
    send({ type: 'scan_error', requestId: request.requestId, error: 'A scan is already running for this user.', permissionDenied: false }, userId)
    return
  }
  const controller = new AbortController()
  activeScans.set(ownerKey, { requestId: request.requestId, controller })
  send({
    type: 'scan_started',
    requestId: request.requestId,
    backendVersion: EXTENSION_VERSION,
    filterQuery: request.filterQuery ?? '',
    searchField: request.searchField ?? 'name',
    ...(request.batchSize === undefined ? {} : { batchSize: request.batchSize }),
    ...(request.batchOffset === undefined ? {} : { batchOffset: request.batchOffset }),
  }, userId)
  spindle.log.info(
    `Starting ${request.mode} scan for ${request.searchField ?? 'name'}=${JSON.stringify(request.filterQuery ?? '')}` +
      (request.batchSize === undefined ? '.' : `, batch offset ${request.batchOffset ?? 0}, size ${request.batchSize}.`),
  )
  try {
    const threshold = Number.isFinite(request.similarityThreshold)
      ? Math.min(1, Math.max(0.75, request.similarityThreshold))
      : 0.9
    const result = await scanDuplicates(
      scannerApiFor(userId),
      grantedFeatures(),
      request.mode,
      threshold,
      controller.signal,
      (phase, current, total) => {
        if (!controller.signal.aborted) {
          send({ type: 'scan_progress', requestId: request.requestId, phase, current, total }, userId)
        }
      },
      request.filterQuery ?? '',
      request.searchField ?? 'name',
      request.batchSize,
      request.batchOffset ?? 0,
    )
    if (controller.signal.aborted) return
    send({ type: 'scan_result', requestId: request.requestId, result }, userId)
  } catch (error) {
    if (controller.signal.aborted || errorMessage(error) === 'SCAN_CANCELLED') return
    const message = errorMessage(error)
    send(
      {
        type: 'scan_error',
        requestId: request.requestId,
        error: message,
        permissionDenied: message.startsWith('PERMISSION_DENIED:'),
      },
      userId,
    )
  } finally {
    const active = activeScans.get(ownerKey)
    if (active?.requestId === request.requestId) activeScans.delete(ownerKey)
  }
}

async function handleCancelScan(
  request: Extract<FrontendRequest, { type: 'cancel_scan' }>,
  userId?: string,
): Promise<void> {
  const ownerKey = scanOwnerKey(userId)
  const active = activeScans.get(ownerKey)
  if (!active || active.requestId !== request.requestId) {
    send({ type: 'scan_cancel_result', requestId: request.requestId, cancelled: false, error: 'The scan is no longer running.' }, userId)
    return
  }
  try {
    const confirmation = await spindle.modal.confirm({
      title: 'Stop duplicate scan?',
      message: 'Stop the current scan and discard any results it has produced?',
      variant: 'danger',
      confirmLabel: 'Stop search',
      cancelLabel: 'Continue scanning',
      ...(userId ? { userId } : {}),
    })
    if (!confirmation.confirmed) {
      send({ type: 'scan_cancel_result', requestId: request.requestId, cancelled: false }, userId)
      return
    }
    const current = activeScans.get(ownerKey)
    if (!current || current.requestId !== request.requestId) {
      send({ type: 'scan_cancel_result', requestId: request.requestId, cancelled: false, error: 'The scan finished before it could be stopped.' }, userId)
      return
    }
    current.controller.abort()
    activeScans.delete(ownerKey)
    send({ type: 'scan_cancel_result', requestId: request.requestId, cancelled: true }, userId)
  } catch (error) {
    send({ type: 'scan_cancel_result', requestId: request.requestId, cancelled: false, error: errorMessage(error) }, userId)
  }
}

async function handleDelete(
  request: Extract<FrontendRequest, { type: 'delete_card' }>,
  userId?: string,
): Promise<void> {
  const reply = (
    result: Omit<Extract<BackendResponse, { type: 'delete_result' }>, 'type' | 'requestId' | 'characterId'>,
  ): void => {
    send(
      {
        type: 'delete_result',
        requestId: request.requestId,
        characterId: request.characterId,
        ...result,
      },
      userId,
    )
  }

  try {
    if (!spindle.permissions.has('characters')) {
      reply({
        deleted: false,
        cancelled: false,
        stale: false,
        error: 'The characters permission is required.',
      })
      return
    }

    const result = await deleteCharacterSafely(
      {
        getCharacter: async (id) => (await spindle.characters.get(id, userId)) as CharacterRecord | null,
        deleteCharacter: (id) => spindle.characters.delete(id, userId),
        confirm: async (character) => {
          const confirmation = await spindle.modal.confirm({
            title: 'Delete duplicate character?',
            message: `Permanently delete “${character.name}” (${character.id})? Attached resources will not be deleted separately.`,
            variant: 'danger',
            confirmLabel: 'Delete character',
            cancelLabel: 'Cancel',
            ...(userId ? { userId } : {}),
          })
          return confirmation.confirmed
        },
      },
      request.characterId,
      request.expectedUpdatedAt,
    )
    reply(result)
    if (result.deleted) send({ type: 'results_stale', reason: 'A character was deleted.' }, userId)
  } catch (error) {
    reply({
      deleted: false,
      cancelled: false,
      stale: false,
      error: errorMessage(error),
    })
  }
}

async function handleBulkDelete(
  request: Extract<FrontendRequest, { type: 'delete_duplicates' }>,
  userId?: string,
): Promise<void> {
  const reply = (result: Omit<Extract<BackendResponse, { type: 'bulk_delete_result' }>, 'type' | 'requestId'>) => {
    send({ type: 'bulk_delete_result', requestId: request.requestId, ...result }, userId)
  }
  try {
    if (!spindle.permissions.has('characters')) {
      reply({ deleted: 0, skipped: request.cards.length, cancelled: false, errors: ['The characters permission is required.'] })
      return
    }
    const result = await deleteCharactersSafely(
      {
        getCharacter: async (id) => (await spindle.characters.get(id, userId)) as CharacterRecord | null,
        deleteCharacter: (id) => spindle.characters.delete(id, userId),
        confirm: async (characters) => {
          const names = characters.slice(0, 12).map((character) => `• ${character.name} (${character.id})`)
          const remainder = characters.length > names.length ? `\n…and ${characters.length - names.length} more.` : ''
          const confirmation = await spindle.modal.confirm({
            title: `Delete ${characters.length} non-keeper duplicates?`,
            message: `Permanently delete ${characters.length} cards from ${request.groupCount} duplicate groups? Your selected protected keeper in every group will be retained.\n\n${names.join('\n')}${remainder}\n\nAttached resources will not be deleted separately.`,
            variant: 'danger',
            confirmLabel: `Delete ${characters.length} cards`,
            cancelLabel: 'Cancel',
            ...(userId ? { userId } : {}),
          })
          return confirmation.confirmed
        },
      },
      request.cards,
    )
    reply(result)
    if (result.deleted > 0) send({ type: 'results_stale', reason: `${result.deleted} duplicate cards were deleted.` }, userId)
  } catch (error) {
    reply({ deleted: 0, skipped: request.cards.length, cancelled: false, errors: [errorMessage(error)] })
  }
}

spindle.onFrontendMessage((payload: unknown, userId?: string) => {
  if (!isFrontendRequest(payload)) return
  if (payload.type === 'get_status') {
    send({ type: 'status_result', availability: permissionAvailability(grantedFeatures()), backendVersion: EXTENSION_VERSION }, userId)
  } else if (payload.type === 'scan_duplicates') {
    void handleScan(payload, userId)
  } else if (payload.type === 'cancel_scan') {
    void handleCancelScan(payload, userId)
  } else if (payload.type === 'delete_card') {
    void handleDelete(payload, userId)
  } else {
    void handleBulkDelete(payload, userId)
  }
})

const staleEvents = [
  'CHARACTER_EDITED',
  'CHARACTER_DELETED',
  'CHARACTER_DUPLICATED',
  'CHARACTER_AVATAR_CHANGED',
  'IMAGE_UPLOADED',
  'IMAGE_DELETED',
  'EXPRESSION_CHANGED',
] as const

for (const event of staleEvents) {
  spindle.on(event, (_payload, userId) => {
    send({ type: 'results_stale', reason: 'Character data changed after the last scan.' }, userId)
  })
}

if (spindle.permissions.has('regex_scripts')) {
  spindle.on('REGEX_SCRIPT_CHANGED', (_payload, userId) => {
    send({ type: 'results_stale', reason: 'Character script data changed after the last scan.' }, userId)
  })
  spindle.on('REGEX_SCRIPT_DELETED', (_payload, userId) => {
    send({ type: 'results_stale', reason: 'Character script data changed after the last scan.' }, userId)
  })
}

spindle.permissions.onChanged(() => {
  send({ type: 'status_result', availability: permissionAvailability(grantedFeatures()), backendVersion: EXTENSION_VERSION })
  send({ type: 'results_stale', reason: 'Extension permissions changed after the last scan.' })
})

spindle.log.info('Lumiverse SuperDeduper loaded.')
