import { permissionAvailability, scanDuplicates, type ScannerApi } from './scanner'
import { deleteCharacterSafely } from './deletion'
import type {
  BackendResponse,
  CharacterRecord,
  FrontendRequest,
  MatchMode,
} from './types'

declare const spindle: import('lumiverse-spindle-types').SpindleAPI

function grantedFeatures() {
  return {
    characters: spindle.permissions.has('characters'),
    worldBooks: spindle.permissions.has('world_books'),
    images: spindle.permissions.has('images'),
    regexScripts: spindle.permissions.has('regex_scripts'),
  }
}

const scannerApi: ScannerApi = {
  listCharacters: async (options) =>
    (await spindle.characters.list(options)) as { data: CharacterRecord[]; total: number },
  countText: (text) => spindle.tokens.countText(text, { modelSource: 'main' }),
  getWorldBook: (id) => spindle.world_books.get(id),
  listWorldBookEntries: (worldBookId, options) =>
    spindle.world_books.entries.list(worldBookId, options),
  listRegexScripts: (options) => spindle.regex_scripts.list(options),
  listImages: (options) => spindle.images.list(options),
  getImage: (id) => spindle.images.get(id, { specificity: 'sm' }),
}

function send(payload: BackendResponse, userId?: string): void {
  spindle.sendToFrontend(payload, userId)
}

function isMatchMode(value: unknown): value is MatchMode {
  return value === 'name' || value === 'exact' || value === 'similar'
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
      typeof request.similarityThreshold === 'number'
    )
  }
  if (type === 'delete_card') {
    const request = payload as Partial<Extract<FrontendRequest, { type: 'delete_card' }>>
    return (
      typeof request.requestId === 'string' &&
      typeof request.characterId === 'string' &&
      typeof request.expectedUpdatedAt === 'number'
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
  send({ type: 'scan_started', requestId: request.requestId }, userId)
  try {
    const result = await scanDuplicates(
      scannerApi,
      grantedFeatures(),
      request.mode,
      request.similarityThreshold,
    )
    send({ type: 'scan_result', requestId: request.requestId, result }, userId)
  } catch (error) {
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
        getCharacter: async (id) => (await spindle.characters.get(id)) as CharacterRecord | null,
        deleteCharacter: (id) => spindle.characters.delete(id),
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

spindle.onFrontendMessage((payload: unknown, userId?: string) => {
  if (!isFrontendRequest(payload)) return
  if (payload.type === 'get_status') {
    send({ type: 'status_result', availability: permissionAvailability(grantedFeatures()) }, userId)
  } else if (payload.type === 'scan_duplicates') {
    void handleScan(payload, userId)
  } else {
    void handleDelete(payload, userId)
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
  spindle.on(event, () => {
    send({ type: 'results_stale', reason: 'Character data changed after the last scan.' })
  })
}

if (spindle.permissions.has('regex_scripts')) {
  spindle.on('REGEX_SCRIPT_CHANGED', () => {
    send({ type: 'results_stale', reason: 'Character script data changed after the last scan.' })
  })
  spindle.on('REGEX_SCRIPT_DELETED', () => {
    send({ type: 'results_stale', reason: 'Character script data changed after the last scan.' })
  })
}

spindle.permissions.onChanged(() => {
  send({ type: 'status_result', availability: permissionAvailability(grantedFeatures()) })
  send({ type: 'results_stale', reason: 'Extension permissions changed after the last scan.' })
})

spindle.log.info('Lumiverse SuperDeduper loaded.')
