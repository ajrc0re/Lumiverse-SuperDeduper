export type MatchMode = 'name' | 'exact' | 'similar'
export type SearchField = 'name' | 'creator' | 'tag' | 'id'

export const CORE_FIELD_KEYS = [
  'description',
  'personality',
  'scenario',
  'first_mes',
  'mes_example',
  'creator_notes',
  'system_prompt',
  'post_history_instructions',
  'creator',
  'tags',
] as const

export type CoreFieldKey = (typeof CORE_FIELD_KEYS)[number]

export interface CharacterRecord {
  id: string
  name: string
  description: string
  personality: string
  scenario: string
  first_mes: string
  mes_example: string
  creator_notes: string
  system_prompt: string
  post_history_instructions: string
  tags: string[]
  alternate_greetings: string[]
  creator: string
  image_id: string | null
  world_book_ids: string[]
  extensions: Record<string, unknown>
  created_at: number
  updated_at: number
}

export interface MatchPair {
  leftId: string
  rightId: string
  similarity: number
}

export interface RawDuplicateGroup {
  id: string
  mode: MatchMode
  characterIds: string[]
  matches: MatchPair[]
}

export type Availability = 'available' | 'unavailable' | 'partial'

export interface PermissionAvailability {
  characters: Availability
  worldBooks: Availability
  images: Availability
  regexScripts: Availability
}

export interface TokenCount {
  value: number
  approximate: boolean
  tokenizerName: string
}

export interface TokenSummary {
  card: TokenCount
  payload: TokenCount
  total: number
}

export type ExtensionPayloadCategory =
  | 'lumiscripts'
  | 'expressions'
  | 'gallery'
  | 'other'

export interface ExtensionPayloadKey {
  key: string
  category: ExtensionPayloadCategory
  count: number
  bytes: number
  references: string[]
}

export interface ImageSummary {
  id: string
  url: string
  filename: string
  mimeType: string
  width: number | null
  height: number | null
}

export interface PayloadSummary {
  greetings: number
  alternateGreetings: number
  lorebooks: number | null
  lorebookEntries: number | null
  scripts: number | null
  enabledScripts: number | null
  disabledScripts: number | null
  embeddedLumiScripts: number
  expressions: number
  embeddedGalleryItems: number
  storedImages: number | null
  images: ImageSummary[]
  recognizedExtensionKeys: ExtensionPayloadKey[]
  otherExtensionKeys: ExtensionPayloadKey[]
  otherExtensionBytes: number
  categoryCount: number
  itemCount: number
}

export interface CardComparison {
  id: string
  name: string
  creator: string
  tags: string[]
  imageId: string | null
  avatarUrl: string | null
  createdAt: number
  updatedAt: number
  coreFields: Record<CoreFieldKey, string>
  tokens: TokenSummary
  payload: PayloadSummary
  warnings: string[]
}

export interface DuplicateGroup {
  id: string
  mode: MatchMode
  matches: MatchPair[]
  cards: CardComparison[]
  recommendedKeeperId: string
  recommendationProvisional: boolean
  recommendationReasons: string[]
}

export interface ScanResult {
  groups: DuplicateGroup[]
  totalCharacters: number
  duplicateCharacters: number
  availability: PermissionAvailability
  scannedAt: number
}

export type FrontendRequest =
  | { type: 'get_status' }
  | {
      type: 'scan_duplicates'
      requestId: string
      mode: MatchMode
      similarityThreshold: number
      filterQuery?: string
      searchField?: SearchField
    }
  | { type: 'cancel_scan'; requestId: string }
  | {
      type: 'delete_card'
      requestId: string
      characterId: string
      expectedUpdatedAt: number
    }
  | {
      type: 'delete_duplicates'
      requestId: string
      groupCount: number
      cards: Array<{ characterId: string; expectedUpdatedAt: number; name: string }>
    }

export type BackendResponse =
  | { type: 'status_result'; availability: PermissionAvailability }
  | { type: 'scan_started'; requestId: string }
  | {
      type: 'scan_progress'
      requestId: string
      phase: 'collecting' | 'matching' | 'enriching'
      current: number
      total: number
    }
  | { type: 'scan_result'; requestId: string; result: ScanResult }
  | { type: 'scan_error'; requestId: string; error: string; permissionDenied: boolean }
  | { type: 'scan_cancel_result'; requestId: string; cancelled: boolean; error?: string }
  | { type: 'results_stale'; reason: string }
  | {
      type: 'delete_result'
      requestId: string
      characterId: string
      deleted: boolean
      cancelled: boolean
      stale: boolean
      error?: string
    }
  | {
      type: 'bulk_delete_result'
      requestId: string
      deleted: number
      skipped: number
      cancelled: boolean
      errors: string[]
    }
