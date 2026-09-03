import type { SpindleFrontendContext } from 'lumiverse-spindle-types'

import { matchesWildcardSearch } from './search'
import { CORE_FIELD_KEYS, type BackendResponse, type CardComparison, type DuplicateGroup, type MatchMode, type PermissionAvailability, type ScanResult } from './types'

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag)
  if (className) value.className = className
  if (text !== undefined) value.textContent = text
  return value
}

function formatDate(epochSeconds: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(epochSeconds * 1_000))
}

function metric(value: number | null): string {
  return value === null ? 'Unavailable' : value.toLocaleString()
}

function truncate(value: string, length = 180): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value
}

function addBadge(parent: HTMLElement, text: string, tone = ''): void {
  const badge = element('span', `sd-badge${tone ? ` sd-badge--${tone}` : ''}`, text)
  parent.appendChild(badge)
}

function maxSimilarity(group: DuplicateGroup, cardId: string): number {
  const values = group.matches
    .filter((match) => match.leftId === cardId || match.rightId === cardId)
    .map((match) => match.similarity)
  return values.length > 0 ? Math.max(...values) : 1
}

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function setup(ctx: SpindleFrontendContext) {
  let deferredReady = false
  try {
    const deferReady = (ctx as SpindleFrontendContext & { deferReady?: () => void }).deferReady
    if (typeof deferReady === 'function') {
      deferReady.call(ctx)
      deferredReady = true
    }
  } catch {
    // Older hosts do not expose manual readiness. Registration can continue normally.
  }

  const removeStyle = ctx.dom.addStyle(`
    .sd-root { padding: 14px; color: var(--lumiverse-text); display: flex; flex-direction: column; gap: 12px; }
    .sd-header h2 { margin: 0; font-size: 1.15rem; }
    .sd-header p, .sd-muted { color: var(--lumiverse-text-muted); margin: 4px 0 0; font-size: .86rem; }
    .sd-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .sd-toolbar-spacer { flex: 1 1 36px; min-width: 24px; }
    .sd-separator { display: flex; align-items: center; gap: 10px; min-height: 14px; color: var(--lumiverse-border); }
    .sd-separator::before, .sd-separator::after { content: ''; height: 1px; flex: 1; background: var(--lumiverse-border); opacity: .7; }
    .sd-separator::marker { content: ''; }
    .sd-controls { display: grid; grid-template-columns: minmax(150px, 1fr) minmax(150px, 1fr); gap: 10px; padding: 12px; border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); background: var(--lumiverse-fill-subtle); }
    .sd-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
    .sd-field label { font-size: .75rem; color: var(--lumiverse-text-muted); font-weight: 600; }
    .sd-component-slot { min-width: 0; flex: 1; }
    .sd-native-control { box-sizing: border-box; width: 100%; min-height: 36px; padding: 7px 9px; border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); background: var(--lumiverse-fill); color: var(--lumiverse-text); pointer-events: auto !important; position: relative; z-index: 1; }
    select.sd-native-control, button.sd-button { cursor: pointer; pointer-events: auto !important; position: relative; z-index: 1; }
    input.sd-native-control { cursor: text; }
    input[type='range'].sd-native-control { cursor: pointer; padding: 0; }
    .sd-hidden { display: none !important; }
    .sd-field--wide { grid-column: 1 / -1; }
    .sd-threshold-line { display: flex; align-items: center; gap: 8px; }
    .sd-button { min-height: 36px; padding: 7px 12px; border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); background: var(--lumiverse-accent, #7866ff); color: white; cursor: pointer; font-weight: 650; }
    .sd-button:disabled { cursor: not-allowed; opacity: .5; }
    .sd-button--secondary { background: var(--lumiverse-fill); color: var(--lumiverse-text); }
    .sd-button--danger { background: var(--lumiverse-danger, #c84646); }
    .sd-actions { grid-column: 1 / -1; display: flex; gap: 8px; align-items: center; }
    .sd-progress { padding: 10px 12px; border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); background: var(--lumiverse-fill-subtle); display: flex; flex-direction: column; gap: 6px; }
    .sd-progress[hidden] { display: none; }
    .sd-progress progress { width: 100%; height: 12px; accent-color: var(--lumiverse-accent, #7866ff); }
    .sd-notice { padding: 10px 12px; border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); background: var(--lumiverse-fill-subtle); font-size: .85rem; }
    .sd-notice--warning { border-color: var(--lumiverse-warning, #d69e2e); }
    .sd-notice--error { border-color: var(--lumiverse-danger, #c84646); }
    .sd-summary { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .sd-group { border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); overflow: hidden; background: var(--lumiverse-fill-subtle); }
    .sd-group-header { padding: 12px; border-bottom: 1px solid var(--lumiverse-border); cursor: pointer; }
    .sd-group-header-content { display: flex; flex-direction: column; gap: 8px; margin-left: 6px; }
    .sd-group:not([open]) .sd-group-header { border-bottom: 0; }
    .sd-group-title { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
    .sd-group-title h3 { margin: 0; font-size: 1rem; }
    .sd-reasons { margin: 0; padding-left: 20px; font-size: .8rem; color: var(--lumiverse-text-muted); }
    .sd-cards { display: flex; flex-direction: column; }
    .sd-card { padding: 12px; display: grid; grid-template-columns: 58px minmax(0, 1fr); gap: 10px; border-bottom: 1px solid var(--lumiverse-border); }
    .sd-card:last-child { border-bottom: 0; }
    .sd-avatar { width: 58px; height: 78px; border-radius: var(--lumiverse-radius); object-fit: cover; background: var(--lumiverse-fill); border: 1px solid var(--lumiverse-border); }
    .sd-avatar--empty { display: grid; place-items: center; font-size: .7rem; color: var(--lumiverse-text-muted); }
    .sd-card-main { min-width: 0; display: flex; flex-direction: column; gap: 7px; }
    .sd-card-title { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .sd-card-title strong { overflow-wrap: anywhere; }
    .sd-card-meta { font-size: .76rem; color: var(--lumiverse-text-muted); overflow-wrap: anywhere; }
    .sd-badges { display: flex; flex-wrap: wrap; gap: 5px; }
    .sd-badge { display: inline-flex; align-items: center; min-height: 20px; padding: 1px 7px; border-radius: 999px; background: var(--lumiverse-fill); border: 1px solid var(--lumiverse-border); font-size: .7rem; }
    .sd-badge--good { border-color: var(--lumiverse-success, #3e9b68); }
    .sd-badge--warning { border-color: var(--lumiverse-warning, #d69e2e); }
    .sd-badge--danger { border-color: var(--lumiverse-danger, #c84646); }
    .sd-card-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .sd-card-actions label { font-size: .78rem; display: flex; align-items: center; gap: 5px; }
    .sd-key-list { font-size: .74rem; color: var(--lumiverse-text-muted); overflow-wrap: anywhere; }
    .sd-images { display: flex; gap: 5px; overflow-x: auto; }
    .sd-images img { width: 52px; height: 52px; flex: 0 0 auto; object-fit: cover; border-radius: 5px; border: 1px solid var(--lumiverse-border); }
    .sd-compare { margin: 0 12px 12px; padding: 8px; border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); background: var(--lumiverse-fill); }
    .sd-compare summary { cursor: pointer; font-size: .82rem; font-weight: 650; }
    .sd-table-wrap { overflow-x: auto; margin-top: 8px; }
    .sd-table { width: 100%; min-width: 560px; border-collapse: collapse; font-size: .72rem; }
    .sd-table th, .sd-table td { text-align: left; vertical-align: top; padding: 6px; border-bottom: 1px solid var(--lumiverse-border); white-space: pre-wrap; overflow-wrap: anywhere; }
    .sd-equal { color: var(--lumiverse-success, #3e9b68); }
    .sd-different { color: var(--lumiverse-warning, #d69e2e); }
    .sd-empty { text-align: center; padding: 24px 12px; color: var(--lumiverse-text-muted); }
    @media (max-width: 540px) {
      .sd-controls { grid-template-columns: 1fr; }
      .sd-field--wide, .sd-actions { grid-column: 1; }
      .sd-card { grid-template-columns: 46px minmax(0, 1fr); }
      .sd-avatar { width: 46px; height: 64px; }
    }
  `)

  const tab = ctx.ui.registerDrawerTab({
    id: 'superdeduper',
    title: 'SuperDeduper',
    shortName: 'Deduper',
    headerTitle: 'SuperDeduper',
    description: 'Find and compare duplicate character cards',
    keywords: ['characters', 'duplicates', 'cards', 'cleanup'],
  })

  const root = element('section', 'sd-root')
  const header = element('header', 'sd-header')
  header.append(element('h2', '', 'Lumiverse SuperDeduper'))
  header.append(
    element(
      'p',
      '',
      'Scan on demand, compare every payload, and choose which duplicate to keep.',
    ),
  )
  root.append(header)

  const toolbar = element('nav', 'sd-toolbar')
  toolbar.setAttribute('aria-label', 'Result actions')
  const clearButton = element('button', 'sd-button sd-button--secondary', 'Clear results')
  clearButton.type = 'button'
  clearButton.disabled = true
  clearButton.dataset.action = 'clear-results'
  const collapseButton = element('button', 'sd-button sd-button--secondary', 'Collapse all')
  collapseButton.type = 'button'
  collapseButton.disabled = true
  collapseButton.dataset.action = 'toggle-all-groups'
  toolbar.append(clearButton, collapseButton, element('span', 'sd-toolbar-spacer'))
  root.append(toolbar, element('div', 'sd-separator', '◆'))

  const permissionNotice = element('div', 'sd-notice sd-notice--warning')
  permissionNotice.hidden = true
  root.append(permissionNotice)

  const staleNotice = element('div', 'sd-notice sd-notice--warning')
  staleNotice.hidden = true
  root.append(staleNotice)

  const controls = element('form', 'sd-controls')
  const modeField = element('div', 'sd-field')
  const modeLabel = element('label', '', 'Match mode')
  const modeSlot = element('div', 'sd-component-slot')
  const modeOptions: Array<{ value: MatchMode; label: string }> = [
    { value: 'name', label: 'Names match' },
    { value: 'exact', label: 'Exact card contents' },
    { value: 'similar', label: 'Similar card contents' },
  ]
  modeField.append(modeLabel, modeSlot)

  const thresholdField = element('div', 'sd-field sd-hidden')
  const thresholdLabel = element('label', '', 'Similarity threshold')
  const thresholdLine = element('div', 'sd-threshold-line')
  const thresholdSlot = element('div', 'sd-component-slot')
  const thresholdOutput = element('output', '', '90%')
  thresholdLine.append(thresholdSlot, thresholdOutput)
  thresholdField.append(thresholdLabel, thresholdLine)

  const searchField = element('div', 'sd-field sd-field--wide')
  const searchLabel = element('label', '', 'Filter results after scanning (optional)')
  const searchSlot = element('div', 'sd-component-slot')
  searchField.append(searchLabel, searchSlot)

  const actions = element('div', 'sd-actions')
  const scanButton = element('button', 'sd-button', 'Scan characters')
  scanButton.type = 'button'
  const status = element('span', 'sd-muted', 'Scans your entire character library. Connecting to extension backend…')
  actions.append(scanButton, status)
  controls.append(modeField, thresholdField, searchField, actions)
  root.append(controls)
  const progressPanel = element('div', 'sd-progress')
  progressPanel.hidden = true
  const progressBar = element('progress')
  const progressLabel = element('span', 'sd-muted', 'Preparing scan…')
  progressPanel.append(progressBar, progressLabel)
  root.append(progressPanel)
  root.append(element('div', 'sd-separator', '◆'))

  const summary = element('div', 'sd-summary')
  const results = element('div')
  root.append(summary, results)
  tab.root.append(root)

  let currentResult: ScanResult | null = null
  let currentScanRequestId: string | null = null
  let activeDeleteRequestId: string | null = null
  let charactersAvailable = true
  let selectedMode: MatchMode = 'name'
  let similarityThreshold = 90
  let searchQuery = ''
  let scanTimeoutId: number | null = null
  let cancelRequestPending = false
  let backendStatusTimeoutId: number | null = null
  const selectedKeepers = new Map<string, string>()
  const collapsedGroups = new Set<string>()

  function updateScanButton(): void {
    const scanning = currentScanRequestId !== null
    scanButton.textContent = scanning ? 'Stop search' : 'Scan characters'
    scanButton.classList.toggle('sd-button--danger', scanning)
    scanButton.disabled = !charactersAvailable || cancelRequestPending
  }

  type Control<T> = { getValue: () => T; setValue?: (value: T) => void; destroy: () => void }
  const components = (ctx as SpindleFrontendContext & {
    components?: Partial<SpindleFrontendContext['components']>
  }).components

  function nativeModeControl(): Control<MatchMode> {
    modeSlot.replaceChildren()
    const select = element('select', 'sd-native-control')
    select.setAttribute('aria-label', 'Duplicate match mode')
    for (const optionData of modeOptions) {
      const option = element('option', '', optionData.label)
      option.value = optionData.value
      select.append(option)
    }
    select.value = selectedMode
    const onChange = () => {
      const value = select.value
      if (value !== 'name' && value !== 'exact' && value !== 'similar') return
      selectedMode = value
      thresholdField.classList.toggle('sd-hidden', value !== 'similar')
    }
    select.addEventListener('change', onChange)
    modeSlot.append(select)
    return { getValue: () => selectedMode, destroy: () => select.removeEventListener('change', onChange) }
  }

  function nativeThresholdControl(): Control<number> {
    thresholdSlot.replaceChildren()
    const input = element('input', 'sd-native-control')
    input.type = 'range'
    input.min = '75'
    input.max = '100'
    input.step = '1'
    input.value = '90'
    input.setAttribute('aria-label', 'Similarity threshold')
    const onInput = () => { thresholdOutput.textContent = `${input.value}%` }
    const updateValue = () => { similarityThreshold = Number(input.value) }
    input.addEventListener('input', onInput)
    input.addEventListener('input', updateValue)
    thresholdSlot.append(input)
    return { getValue: () => similarityThreshold, destroy: () => {
      input.removeEventListener('input', onInput)
      input.removeEventListener('input', updateValue)
    } }
  }

  function nativeSearchControl(): Control<string> {
    searchSlot.replaceChildren()
    const input = element('input', 'sd-native-control')
    input.type = 'search'
    input.placeholder = 'Name, creator, tag, or character ID (* wildcard supported)'
    input.setAttribute('aria-label', 'Filter duplicate results')
    const onInput = () => {
      searchQuery = input.value
      renderResults()
    }
    input.addEventListener('input', onInput)
    searchSlot.append(input)
    return {
      getValue: () => input.value,
      setValue: (value) => { input.value = value },
      destroy: () => input.removeEventListener('input', onInput),
    }
  }

  let modeControl: Control<MatchMode>
  try {
    if (typeof components?.mountSelect !== 'function') throw new Error('Unavailable')
    const mounted = components.mountSelect(modeSlot, {
      value: selectedMode,
      options: modeOptions,
      ariaLabel: 'Duplicate match mode',
      portal: true,
      onChange: (value) => {
        if (value !== 'name' && value !== 'exact' && value !== 'similar') return
        selectedMode = value
        thresholdField.classList.toggle('sd-hidden', value !== 'similar')
      },
    })
    modeControl = { getValue: () => selectedMode, destroy: () => mounted.destroy() }
  } catch {
    modeControl = nativeModeControl()
  }

  let thresholdControl: Control<number>
  try {
    if (typeof components?.mountRangeSlider !== 'function') throw new Error('Unavailable')
    thresholdControl = components.mountRangeSlider(thresholdSlot, {
      min: 75, max: 100, step: 1, integer: true, value: 90,
      onDragValue: (value) => {
        if (value !== null) {
          similarityThreshold = value
          thresholdOutput.textContent = `${value}%`
        }
      },
      onCommit: (value) => {
        similarityThreshold = value
        thresholdOutput.textContent = `${value}%`
      },
    })
  } catch {
    thresholdControl = nativeThresholdControl()
  }

  let searchControl: Control<string>
  try {
    if (typeof components?.mountTextInput !== 'function') throw new Error('Unavailable')
    searchControl = components.mountTextInput(searchSlot, {
      value: '',
      placeholder: 'Name, creator, tag, or character ID (* wildcard supported)',
      ariaLabel: 'Filter duplicate results',
      onChange: (value) => {
        searchQuery = value
        renderResults()
      },
    })
  } catch {
    searchControl = nativeSearchControl()
  }

  function setPermissionState(availability: PermissionAvailability): void {
    charactersAvailable = availability.characters !== 'unavailable'
    updateScanButton()
    permissionNotice.replaceChildren()

    if (!charactersAvailable) {
      permissionNotice.hidden = false
      permissionNotice.append(
        document.createTextNode('The Characters permission is required. '),
      )
      const settingsButton = element('button', 'sd-button sd-button--secondary', 'Open Extensions settings')
      settingsButton.type = 'button'
      settingsButton.dataset.action = 'open-settings'
      permissionNotice.append(settingsButton)
      return
    }

    const unavailable = [
      availability.worldBooks === 'unavailable' ? 'world books' : '',
      availability.images === 'unavailable' ? 'images' : '',
      availability.regexScripts === 'unavailable' ? 'scripts' : '',
    ].filter(Boolean)
    if (unavailable.length > 0) {
      permissionNotice.hidden = false
      permissionNotice.append(
        document.createTextNode(
          `Optional ${unavailable.join(', ')} data is unavailable. Recommendations will be provisional. `,
        ),
      )
      const settingsButton = element('button', 'sd-button sd-button--secondary', 'Review permissions')
      settingsButton.type = 'button'
      settingsButton.dataset.action = 'open-settings'
      permissionNotice.append(settingsButton)
    } else {
      permissionNotice.hidden = true
    }
  }

  function startScan(): void {
    if (!charactersAvailable) {
      status.textContent = 'Cannot scan until the Characters permission is granted.'
      return
    }
    if (currentScanRequestId) {
      status.textContent = 'A scan is already in progress.'
      return
    }
    const requestId = createRequestId()
    currentScanRequestId = requestId
    cancelRequestPending = false
    updateScanButton()
    status.textContent = 'Scan request sent…'
    progressPanel.hidden = false
    progressBar.removeAttribute('value')
    progressLabel.textContent = 'Waiting for the backend to start…'
    staleNotice.hidden = true
    try {
      ctx.sendToBackend({
        type: 'scan_duplicates',
        requestId,
        mode: selectedMode,
        similarityThreshold: similarityThreshold / 100,
        filterQuery: searchControl.getValue(),
      })
    } catch (error) {
      currentScanRequestId = null
      updateScanButton()
      progressPanel.hidden = true
      status.textContent = 'Could not send the scan request.'
      results.replaceChildren(
        element('div', 'sd-notice sd-notice--error', error instanceof Error ? error.message : String(error)),
      )
      return
    }
    if (scanTimeoutId !== null) window.clearTimeout(scanTimeoutId)
    scanTimeoutId = window.setTimeout(() => {
      if (currentScanRequestId !== requestId) return
      currentScanRequestId = null
      updateScanButton()
      progressPanel.hidden = true
      status.textContent = 'The backend did not respond. Reload or re-enable the extension, then try again.'
      results.replaceChildren(
        element(
          'div',
          'sd-notice sd-notice--error',
          'The backend did not acknowledge the scan request within 15 seconds.',
        ),
      )
    }, 15_000)
  }

  function renderSummary(result: ScanResult, visibleGroups: number): void {
    summary.replaceChildren()
    addBadge(summary, `${result.groups.length} duplicate groups`)
    addBadge(summary, `${result.duplicateCharacters} duplicate cards`)
    addBadge(summary, `${result.totalCharacters} cards scanned`)
    if (visibleGroups !== result.groups.length) addBadge(summary, `${visibleGroups} groups shown`)
    const approximate = result.groups.some((group) =>
      group.cards.some((card) => card.tokens.card.approximate || card.tokens.payload.approximate),
    )
    if (approximate) addBadge(summary, 'Some token counts approximate', 'warning')
    if (result.groups.length > 0) {
      const bulkButton = element('button', 'sd-button sd-button--danger', 'Delete all non-keepers')
      bulkButton.type = 'button'
      bulkButton.disabled = activeDeleteRequestId !== null
      bulkButton.dataset.action = 'delete-all-duplicates'
      bulkButton.title = 'Deletes every duplicate except the protected keeper selected in each group'
      summary.append(bulkButton)
      summary.append(element('span', 'sd-muted', '“Keep this card” changes the protected keeper for its group.'))
    }
  }

  function cardMatchesSearch(card: CardComparison, query: string): boolean {
    return matchesWildcardSearch([card.id, card.name, card.creator, ...card.tags], query)
  }

  function appendCardBadges(container: HTMLElement, card: CardComparison, group: DuplicateGroup): void {
    const match = Math.round(maxSimilarity(group, card.id) * 100)
    addBadge(container, `${match}% match`)
    addBadge(
      container,
      `${card.tokens.card.value.toLocaleString()} card tokens${card.tokens.card.approximate ? ' ≈' : ''}`,
    )
    addBadge(
      container,
      `${card.tokens.payload.value.toLocaleString()} accessible payload tokens${card.tokens.payload.approximate ? ' ≈' : ''}`,
    )
    addBadge(
      container,
      `${card.payload.greetings} greetings · ${card.payload.alternateGreetings} alternate`,
    )
    addBadge(container, `${metric(card.payload.lorebooks)} lorebooks`)
    addBadge(container, `${metric(card.payload.lorebookEntries)} lore entries`)
    addBadge(
      container,
      card.payload.scripts === null
        ? 'Unavailable scoped scripts'
        : `${card.payload.scripts} scoped scripts · ${card.payload.enabledScripts ?? 0} on · ${card.payload.disabledScripts ?? 0} off`,
    )
    if (card.payload.embeddedLumiScripts > 0) {
      addBadge(container, `${card.payload.embeddedLumiScripts} embedded LumiScripts`)
    }
    addBadge(container, `${card.payload.expressions} expressions`)
    addBadge(container, `${metric(card.payload.storedImages)} stored images`)
    if (card.payload.embeddedGalleryItems > 0) {
      addBadge(container, `${card.payload.embeddedGalleryItems} gallery refs`)
    }
  }

  function renderCard(group: DuplicateGroup, card: CardComparison): HTMLElement {
    const cardElement = element('article', 'sd-card')
    if (card.avatarUrl) {
      const avatar = element('img', 'sd-avatar')
      avatar.src = card.avatarUrl
      avatar.alt = `${card.name} avatar`
      avatar.loading = 'lazy'
      cardElement.append(avatar)
    } else {
      cardElement.append(element('div', 'sd-avatar sd-avatar--empty', 'No avatar'))
    }

    const main = element('div', 'sd-card-main')
    const title = element('div', 'sd-card-title')
    title.append(element('strong', '', card.name || 'Unnamed character'))
    if (card.id === group.recommendedKeeperId) {
      addBadge(title, group.recommendationProvisional ? 'Recommended · provisional' : 'Recommended', group.recommendationProvisional ? 'warning' : 'good')
    }
    if (selectedKeepers.get(group.id) === card.id) addBadge(title, 'Protected keeper', 'good')
    main.append(title)

    main.append(
      element(
        'div',
        'sd-card-meta',
        `Creator: ${card.creator || 'Unknown'} · Updated ${formatDate(card.updatedAt)} · Created ${formatDate(card.createdAt)} · ID ${card.id}`,
      ),
    )

    const badges = element('div', 'sd-badges')
    appendCardBadges(badges, card, group)
    main.append(badges)

    const recognizedKeys = card.payload.recognizedExtensionKeys.map((entry) => `${entry.key} (${entry.count})`)
    const otherKeys = card.payload.otherExtensionKeys.map((entry) => `${entry.key} (${entry.count})`)
    if (recognizedKeys.length > 0) {
      main.append(element('div', 'sd-key-list', `Recognized extension payload: ${recognizedKeys.join(', ')}`))
    }
    if (otherKeys.length > 0) {
      main.append(
        element(
          'div',
          'sd-key-list',
          `Other extension payload: ${otherKeys.join(', ')} · ${card.payload.otherExtensionBytes.toLocaleString()} bytes`,
        ),
      )
    }

    if (card.payload.images.length > 0) {
      const images = element('div', 'sd-images')
      for (const imageData of card.payload.images.slice(0, 8)) {
        const image = element('img')
        image.src = imageData.url
        image.alt = imageData.filename || 'Character image'
        image.title = imageData.filename || imageData.id
        image.loading = 'lazy'
        images.append(image)
      }
      if (card.payload.images.length > 8) {
        images.append(element('span', 'sd-muted', `+${card.payload.images.length - 8} more`))
      }
      main.append(images)
    }

    for (const warning of card.warnings) {
      main.append(element('div', 'sd-notice sd-notice--warning', warning))
    }

    const cardActions = element('div', 'sd-card-actions')
    const isKeeper = selectedKeepers.get(group.id) === card.id
    const keeperButton = element(
      'button',
      'sd-button sd-button--secondary',
      isKeeper ? 'Protected keeper' : 'Protect this card instead',
    )
    keeperButton.type = 'button'
    keeperButton.disabled = isKeeper
    keeperButton.dataset.action = 'protect-card'
    keeperButton.dataset.groupId = group.id
    keeperButton.dataset.characterId = card.id

    const deleteButton = element('button', 'sd-button sd-button--danger', 'Delete duplicate')
    deleteButton.type = 'button'
    deleteButton.disabled = isKeeper || activeDeleteRequestId !== null
    deleteButton.dataset.action = 'delete-card'
    deleteButton.dataset.groupId = group.id
    deleteButton.dataset.characterId = card.id
    cardActions.append(keeperButton, deleteButton)
    main.append(cardActions)
    cardElement.append(main)
    return cardElement
  }

  function renderComparison(group: DuplicateGroup): HTMLElement {
    const details = element('details', 'sd-compare')
    details.append(element('summary', '', 'Compare matching fields and payload keys'))
    const wrap = element('div', 'sd-table-wrap')
    const table = element('table', 'sd-table')
    const head = element('thead')
    const headingRow = element('tr')
    headingRow.append(element('th', '', 'Field'))
    for (const card of group.cards) headingRow.append(element('th', '', card.name || card.id))
    head.append(headingRow)
    table.append(head)
    const body = element('tbody')

    for (const key of CORE_FIELD_KEYS) {
      const values = group.cards.map((card) => card.coreFields[key])
      const equal = new Set(values).size === 1
      const row = element('tr')
      row.append(element('th', equal ? 'sd-equal' : 'sd-different', `${key} · ${equal ? 'equal' : 'different'}`))
      for (const value of values) row.append(element('td', '', value ? truncate(value) : '—'))
      body.append(row)
    }

    const payloadRow = element('tr')
    payloadRow.append(element('th', '', 'Payload summary'))
    for (const card of group.cards) {
      payloadRow.append(
        element(
          'td',
          '',
          `${card.payload.categoryCount} categories · ${card.payload.itemCount} items · ${card.payload.otherExtensionBytes} other bytes`,
        ),
      )
    }
    body.append(payloadRow)

    if (group.mode === 'similar') {
      const matchRow = element('tr')
      matchRow.append(element('th', '', 'Qualifying pairs'))
      const descriptions = group.matches.map((match) => {
        const left = group.cards.find((card) => card.id === match.leftId)?.name ?? match.leftId
        const right = group.cards.find((card) => card.id === match.rightId)?.name ?? match.rightId
        return `${left} ↔ ${right}: ${Math.round(match.similarity * 100)}%`
      })
      const cell = element('td', '', descriptions.join('\n'))
      cell.colSpan = group.cards.length
      matchRow.append(cell)
      body.append(matchRow)
    }

    table.append(body)
    wrap.append(table)
    details.append(wrap)
    return details
  }

  function renderGroup(group: DuplicateGroup, index: number): HTMLElement {
    const groupElement = element('details', 'sd-group')
    groupElement.open = !collapsedGroups.has(group.id)
    groupElement.dataset.groupId = group.id
    groupElement.addEventListener('toggle', () => {
      if (groupElement.open) collapsedGroups.delete(group.id)
      else collapsedGroups.add(group.id)
    })
    const headerElement = element('summary', 'sd-group-header')
    const headerContent = element('div', 'sd-group-header-content')
    const title = element('div', 'sd-group-title')
    title.append(element('h3', '', `Group ${index + 1} · ${group.cards.length} cards`))
    addBadge(title, group.mode === 'name' ? 'Name match' : group.mode === 'exact' ? 'Exact contents' : 'Similar contents')
    const groupDeleteButton = element('button', 'sd-button sd-button--danger', `Delete all Group ${index + 1} non-keepers`)
    groupDeleteButton.type = 'button'
    groupDeleteButton.disabled = activeDeleteRequestId !== null
    groupDeleteButton.dataset.action = 'delete-group-duplicates'
    groupDeleteButton.dataset.groupId = group.id
    title.append(groupDeleteButton)
    headerContent.append(title)
    const reasons = element('ul', 'sd-reasons')
    for (const reason of group.recommendationReasons) reasons.append(element('li', '', reason))
    headerContent.append(reasons)
    headerElement.append(headerContent)
    groupElement.append(headerElement)
    const cards = element('div', 'sd-cards')
    for (const card of group.cards) cards.append(renderCard(group, card))
    groupElement.append(cards, renderComparison(group))
    return groupElement
  }

  function renderResults(): void {
    results.replaceChildren()
    clearButton.disabled = currentResult === null
    collapseButton.disabled = currentResult === null || currentResult.groups.length === 0
    if (!currentResult) {
      collapseButton.textContent = 'Collapse all'
      summary.replaceChildren()
      results.append(element('div', 'sd-empty', 'Choose a match mode and scan your character library.'))
      return
    }

    const query = searchQuery.trim().toLocaleLowerCase()
    const visibleGroups = currentResult.groups.filter(
      (group) => !query || group.cards.some((card) => cardMatchesSearch(card, query)),
    )
    const allVisibleCollapsed = visibleGroups.length > 0 && visibleGroups.every((group) => collapsedGroups.has(group.id))
    collapseButton.textContent = allVisibleCollapsed ? 'Expand all' : 'Collapse all'
    renderSummary(currentResult, visibleGroups.length)
    if (visibleGroups.length === 0) {
      results.append(
        element(
          'div',
          'sd-empty',
          currentResult.groups.length === 0
            ? 'No duplicate groups were found with this match mode.'
            : 'No duplicate groups match this filter.',
        ),
      )
      return
    }

    for (const [index, group] of visibleGroups.entries()) {
      if (!group.cards.some((card) => card.id === selectedKeepers.get(group.id))) {
        selectedKeepers.set(group.id, group.recommendedKeeperId)
      }
      results.append(renderGroup(group, index))
    }
  }

  function handleAction(action: string, actionElement: HTMLElement): void {
    if (action === 'open-settings') {
      ctx.events.emit('open-settings', { view: 'extensions' })
      return
    }
    if (action === 'protect-card') {
        const groupId = actionElement.dataset.groupId
        const characterId = actionElement.dataset.characterId
        if (!groupId || !characterId) return
        selectedKeepers.set(groupId, characterId)
        renderResults()
      return
    }
    if (action === 'clear-results') {
      currentResult = null
      selectedKeepers.clear()
      collapsedGroups.clear()
      searchQuery = ''
      try { searchControl.setValue?.('') } catch { /* Native and older host controls need no reset hook. */ }
      status.textContent = 'Results cleared. Ready to scan the full character library.'
      staleNotice.hidden = true
      renderResults()
      return
    }
    if (action === 'toggle-all-groups') {
      if (!currentResult) return
      const groupElements = [...results.querySelectorAll<HTMLDetailsElement>('details.sd-group')]
      const shouldExpand = groupElements.length > 0 && groupElements.every((group) => !group.open)
      for (const groupElement of groupElements) {
        groupElement.open = shouldExpand
        const groupId = groupElement.dataset.groupId
        if (groupId) {
          if (shouldExpand) collapsedGroups.delete(groupId)
          else collapsedGroups.add(groupId)
        }
      }
      renderResults()
      return
    }
    if (action === 'delete-all-duplicates' || action === 'delete-group-duplicates') {
      if (!currentResult || activeDeleteRequestId) return
      const requestedGroups = action === 'delete-group-duplicates'
        ? currentResult.groups.filter((group) => group.id === actionElement.dataset.groupId)
        : currentResult.groups
      const cards = requestedGroups.flatMap((group) => {
        const keeperId = selectedKeepers.get(group.id) ?? group.recommendedKeeperId
        return group.cards
          .filter((card) => card.id !== keeperId)
          .map((card) => ({ characterId: card.id, expectedUpdatedAt: card.updatedAt, name: card.name }))
      })
      const uniqueCards = [...new Map(cards.map((card) => [card.characterId, card])).values()]
      if (uniqueCards.length === 0) return
      const requestId = createRequestId()
      activeDeleteRequestId = requestId
      status.textContent = `Waiting for confirmation to delete ${uniqueCards.length} non-keeper duplicates…`
      renderResults()
      ctx.sendToBackend({
        type: 'delete_duplicates',
        requestId,
        groupCount: requestedGroups.length,
        cards: uniqueCards,
      })
      return
    }
    if (action === 'delete-card') {
        const groupId = actionElement.dataset.groupId
        const characterId = actionElement.dataset.characterId
        if (!groupId || !characterId || !currentResult || activeDeleteRequestId) return
        if (selectedKeepers.get(groupId) === characterId) return
        const card = currentResult.groups
          .find((group) => group.id === groupId)
          ?.cards.find((candidate) => candidate.id === characterId)
        if (!card) return

        const requestId = createRequestId()
        activeDeleteRequestId = requestId
        status.textContent = `Waiting for deletion confirmation for ${card.name}…`
        renderResults()
        ctx.sendToBackend({
          type: 'delete_card',
          requestId,
          characterId: card.id,
          expectedUpdatedAt: card.updatedAt,
        })
    }
  }

  const onScanClick = (event: MouseEvent) => {
    event.preventDefault()
    if (currentScanRequestId) {
      if (cancelRequestPending) return
      cancelRequestPending = true
      updateScanButton()
      status.textContent = 'Waiting for confirmation to stop the scan…'
      try {
        ctx.sendToBackend({ type: 'cancel_scan', requestId: currentScanRequestId })
      } catch (error) {
        cancelRequestPending = false
        updateScanButton()
        status.textContent = `Could not request cancellation: ${error instanceof Error ? error.message : String(error)}`
      }
    } else {
      startScan()
    }
  }
  const onScanKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    startScan()
  }
  scanButton.addEventListener('click', onScanClick)
  controls.addEventListener('keydown', onScanKeyDown)

  const onActionClick = (event: Event) => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-action]')
      : null
    if (!target || !root.contains(target) || target instanceof HTMLButtonElement && target.disabled) return
    if (target.closest('summary')) event.preventDefault()
    const action = target.dataset.action
    if (action) handleAction(action, target)
  }
  root.addEventListener('click', onActionClick)
  const unbindActions = () => {
    scanButton.removeEventListener('click', onScanClick)
    controls.removeEventListener('keydown', onScanKeyDown)
    root.removeEventListener('click', onActionClick)
  }

  const unsubscribe = ctx.onBackendMessage((payload: unknown) => {
    if (!payload || typeof payload !== 'object' || !('type' in payload)) return
    if (backendStatusTimeoutId !== null) {
      window.clearTimeout(backendStatusTimeoutId)
      backendStatusTimeoutId = null
    }
    const message = payload as BackendResponse
    if (message.type === 'status_result') {
      setPermissionState(message.availability)
      status.textContent = charactersAvailable ? 'Ready to scan.' : 'Characters permission required.'
      return
    }
    if (message.type === 'results_stale') {
      if (!currentResult) return
      staleNotice.textContent = `${message.reason} Run a new scan before making cleanup decisions.`
      staleNotice.hidden = false
      return
    }
    if (message.type === 'scan_started') {
      if (message.requestId === currentScanRequestId) {
        status.textContent = 'Scanning the full character library and inspecting duplicate payloads…'
        progressPanel.hidden = false
        progressBar.removeAttribute('value')
        progressLabel.textContent = 'Collecting character cards…'
        if (scanTimeoutId !== null) window.clearTimeout(scanTimeoutId)
        scanTimeoutId = window.setTimeout(() => {
          if (currentScanRequestId !== message.requestId) return
          currentScanRequestId = null
          cancelRequestPending = false
          updateScanButton()
          progressPanel.hidden = true
          status.textContent = 'The acknowledged scan did not finish within 10 minutes.'
          results.replaceChildren(
            element(
              'div',
              'sd-notice sd-notice--error',
              'The backend started this scan but did not return a result. Check the Lumiverse server log for the extension error.',
            ),
          )
        }, 600_000)
      }
      return
    }
    if (message.type === 'scan_progress') {
      if (message.requestId !== currentScanRequestId) return
      progressPanel.hidden = false
      if (message.total > 0) {
        progressBar.max = message.total
        progressBar.value = Math.min(message.current, message.total)
      } else {
        progressBar.removeAttribute('value')
      }
      const phaseLabel = message.phase === 'collecting'
        ? 'Collecting cards'
        : message.phase === 'matching'
          ? 'Comparing cards'
          : 'Inspecting duplicate payloads'
      progressLabel.textContent = message.total > 0
        ? `${phaseLabel}: ${message.current.toLocaleString()} of ${message.total.toLocaleString()}`
        : `${phaseLabel}…`
      return
    }
    if (message.type === 'scan_result') {
      if (message.requestId !== currentScanRequestId) return
      if (scanTimeoutId !== null) window.clearTimeout(scanTimeoutId)
      scanTimeoutId = null
      currentScanRequestId = null
      cancelRequestPending = false
      currentResult = message.result
      activeDeleteRequestId = null
      setPermissionState(message.result.availability)
      progressPanel.hidden = true
      status.textContent = `Scan completed ${formatDate(message.result.scannedAt)}.`
      staleNotice.hidden = true
      renderResults()
      return
    }
    if (message.type === 'scan_error') {
      if (message.requestId !== currentScanRequestId) return
      if (scanTimeoutId !== null) window.clearTimeout(scanTimeoutId)
      scanTimeoutId = null
      currentScanRequestId = null
      cancelRequestPending = false
      updateScanButton()
      progressPanel.hidden = true
      status.textContent = 'Scan failed.'
      results.replaceChildren(element('div', 'sd-notice sd-notice--error', message.error))
      if (message.permissionDenied) ctx.sendToBackend({ type: 'get_status' })
      return
    }
    if (message.type === 'scan_cancel_result') {
      if (message.requestId !== currentScanRequestId) return
      cancelRequestPending = false
      if (!message.cancelled) {
        updateScanButton()
        status.textContent = message.error ?? 'Cancellation dismissed. Scan is continuing…'
        return
      }
      if (scanTimeoutId !== null) window.clearTimeout(scanTimeoutId)
      scanTimeoutId = null
      currentScanRequestId = null
      currentResult = null
      selectedKeepers.clear()
      collapsedGroups.clear()
      updateScanButton()
      progressPanel.hidden = true
      status.textContent = 'Scan stopped. Partial results were discarded.'
      staleNotice.hidden = true
      renderResults()
      return
    }
    if (message.type === 'delete_result') {
      if (message.requestId !== activeDeleteRequestId) return
      activeDeleteRequestId = null
      if (message.deleted) {
        status.textContent = 'Character deleted. Refreshing duplicate groups…'
        currentScanRequestId = null
        startScan()
      } else {
        status.textContent = message.cancelled ? 'Deletion cancelled.' : message.error ?? 'Character was not deleted.'
        if (message.stale) {
          staleNotice.textContent = 'The scan is stale. Run a new scan before deleting.'
          staleNotice.hidden = false
        }
        renderResults()
      }
      return
    }
    if (message.type === 'bulk_delete_result') {
      if (message.requestId !== activeDeleteRequestId) return
      activeDeleteRequestId = null
      if (message.cancelled) {
        status.textContent = 'Bulk deletion cancelled. Nothing was deleted.'
        renderResults()
        return
      }
      const detail = message.errors.length > 0 ? ` ${message.errors.slice(0, 3).join(' ')}` : ''
      status.textContent = `Deleted ${message.deleted}; skipped ${message.skipped}.${detail}`
      if (message.deleted > 0) {
        currentScanRequestId = null
        startScan()
      } else {
        renderResults()
      }
    }
  })

  renderResults()
  if (deferredReady) {
    try {
      const ready = (ctx as SpindleFrontendContext & { ready?: () => void }).ready
      if (typeof ready === 'function') ready.call(ctx)
    } catch {
      // The drawer has already been registered; readiness failures must not remove it.
    }
  }
  backendStatusTimeoutId = window.setTimeout(() => {
    status.textContent = 'Backend not responding. Reload or re-enable the extension.'
  }, 5_000)
  ctx.sendToBackend({ type: 'get_status' })
  let unsubscribeActivation = () => {}
  try {
    const onActivate = (tab as typeof tab & { onActivate?: (callback: () => void) => () => void }).onActivate
    if (typeof onActivate === 'function') {
      unsubscribeActivation = onActivate.call(tab, () => {
        ctx.sendToBackend({ type: 'get_status' })
      })
    }
  } catch {
    // Activation refresh is an enhancement; initial status discovery still runs above.
  }

  return () => {
    if (scanTimeoutId !== null) window.clearTimeout(scanTimeoutId)
    if (backendStatusTimeoutId !== null) window.clearTimeout(backendStatusTimeoutId)
    unsubscribeActivation()
    unbindActions()
    unsubscribe()
    modeControl.destroy()
    thresholdControl.destroy()
    searchControl.destroy()
    tab.destroy()
    removeStyle()
  }
}
