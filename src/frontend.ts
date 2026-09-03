import type { SpindleFrontendContext } from 'lumiverse-spindle-types'

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

export function setup(ctx: SpindleFrontendContext) {
  const removeStyle = ctx.dom.addStyle(`
    .sd-root { padding: 14px; color: var(--lumiverse-text); display: flex; flex-direction: column; gap: 12px; }
    .sd-header h2 { margin: 0; font-size: 1.15rem; }
    .sd-header p, .sd-muted { color: var(--lumiverse-text-muted); margin: 4px 0 0; font-size: .86rem; }
    .sd-controls { display: grid; grid-template-columns: minmax(150px, 1fr) minmax(150px, 1fr); gap: 10px; padding: 12px; border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); background: var(--lumiverse-fill-subtle); }
    .sd-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
    .sd-field label { font-size: .75rem; color: var(--lumiverse-text-muted); font-weight: 600; }
    .sd-field input, .sd-field select { box-sizing: border-box; width: 100%; min-height: 36px; padding: 7px 9px; color: var(--lumiverse-text); background: var(--lumiverse-fill); border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); }
    .sd-field--wide { grid-column: 1 / -1; }
    .sd-threshold-line { display: flex; align-items: center; gap: 8px; }
    .sd-threshold-line input { min-height: auto; padding: 0; }
    .sd-button { min-height: 36px; padding: 7px 12px; border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); background: var(--lumiverse-accent, #7866ff); color: white; cursor: pointer; font-weight: 650; }
    .sd-button:disabled { cursor: not-allowed; opacity: .5; }
    .sd-button--secondary { background: var(--lumiverse-fill); color: var(--lumiverse-text); }
    .sd-button--danger { background: var(--lumiverse-danger, #c84646); }
    .sd-actions { grid-column: 1 / -1; display: flex; gap: 8px; align-items: center; }
    .sd-notice { padding: 10px 12px; border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); background: var(--lumiverse-fill-subtle); font-size: .85rem; }
    .sd-notice--warning { border-color: var(--lumiverse-warning, #d69e2e); }
    .sd-notice--error { border-color: var(--lumiverse-danger, #c84646); }
    .sd-summary { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .sd-group { border: 1px solid var(--lumiverse-border); border-radius: var(--lumiverse-radius); overflow: hidden; background: var(--lumiverse-fill-subtle); }
    .sd-group-header { padding: 12px; border-bottom: 1px solid var(--lumiverse-border); display: flex; flex-direction: column; gap: 8px; }
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

  const permissionNotice = element('div', 'sd-notice sd-notice--warning')
  permissionNotice.hidden = true
  root.append(permissionNotice)

  const staleNotice = element('div', 'sd-notice sd-notice--warning')
  staleNotice.hidden = true
  root.append(staleNotice)

  const controls = element('div', 'sd-controls')
  const modeField = element('div', 'sd-field')
  const modeLabel = element('label', '', 'Match mode')
  const modeSelect = element('select')
  modeSelect.setAttribute('aria-label', 'Duplicate match mode')
  const modeOptions: Array<{ value: MatchMode; label: string }> = [
    { value: 'name', label: 'Names match' },
    { value: 'exact', label: 'Exact card contents' },
    { value: 'similar', label: 'Similar card contents' },
  ]
  for (const optionData of modeOptions) {
    const option = element('option', '', optionData.label)
    option.value = optionData.value
    modeSelect.append(option)
  }
  modeField.append(modeLabel, modeSelect)

  const thresholdField = element('div', 'sd-field')
  const thresholdLabel = element('label', '', 'Similarity threshold')
  const thresholdLine = element('div', 'sd-threshold-line')
  const thresholdInput = element('input')
  thresholdInput.type = 'range'
  thresholdInput.min = '75'
  thresholdInput.max = '100'
  thresholdInput.step = '1'
  thresholdInput.value = '90'
  thresholdInput.setAttribute('aria-label', 'Similarity threshold')
  const thresholdOutput = element('output', '', '90%')
  thresholdLine.append(thresholdInput, thresholdOutput)
  thresholdField.append(thresholdLabel, thresholdLine)
  thresholdField.hidden = true

  const searchField = element('div', 'sd-field sd-field--wide')
  const searchLabel = element('label', '', 'Filter duplicate results')
  const searchInput = element('input')
  searchInput.type = 'search'
  searchInput.placeholder = 'Name, creator, tag, or character ID'
  searchInput.disabled = true
  searchField.append(searchLabel, searchInput)

  const actions = element('div', 'sd-actions')
  const scanButton = element('button', 'sd-button', 'Scan characters')
  scanButton.type = 'button'
  const status = element('span', 'sd-muted', 'Ready to scan.')
  actions.append(scanButton, status)
  controls.append(modeField, thresholdField, searchField, actions)
  root.append(controls)

  const summary = element('div', 'sd-summary')
  const results = element('div')
  root.append(summary, results)
  tab.root.append(root)

  let currentResult: ScanResult | null = null
  let currentScanRequestId: string | null = null
  let activeDeleteRequestId: string | null = null
  let charactersAvailable = true
  const selectedKeepers = new Map<string, string>()

  function setPermissionState(availability: PermissionAvailability): void {
    charactersAvailable = availability.characters !== 'unavailable'
    scanButton.disabled = !charactersAvailable || currentScanRequestId !== null
    permissionNotice.replaceChildren()

    if (!charactersAvailable) {
      permissionNotice.hidden = false
      permissionNotice.append(
        document.createTextNode('The Characters permission is required. '),
      )
      const settingsButton = element('button', 'sd-button sd-button--secondary', 'Open Extensions settings')
      settingsButton.type = 'button'
      settingsButton.addEventListener('click', () => {
        ctx.events.emit('open-settings', { view: 'extensions' })
      })
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
      settingsButton.addEventListener('click', () => {
        ctx.events.emit('open-settings', { view: 'extensions' })
      })
      permissionNotice.append(settingsButton)
    } else {
      permissionNotice.hidden = true
    }
  }

  function startScan(): void {
    if (!charactersAvailable || currentScanRequestId) return
    const requestId = crypto.randomUUID()
    currentScanRequestId = requestId
    scanButton.disabled = true
    status.textContent = 'Scanning characters…'
    staleNotice.hidden = true
    ctx.sendToBackend({
      type: 'scan_duplicates',
      requestId,
      mode: modeSelect.value as MatchMode,
      similarityThreshold: Number(thresholdInput.value) / 100,
    })
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
  }

  function cardMatchesSearch(card: CardComparison, query: string): boolean {
    const haystack = [card.id, card.name, card.creator, ...card.tags]
      .join('\n')
      .toLocaleLowerCase()
    return haystack.includes(query)
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
    const keeperLabel = element('label')
    const keeperRadio = element('input')
    keeperRadio.type = 'radio'
    keeperRadio.name = `keeper-${group.id}`
    keeperRadio.value = card.id
    keeperRadio.checked = selectedKeepers.get(group.id) === card.id
    keeperRadio.addEventListener('change', () => {
      if (keeperRadio.checked) {
        selectedKeepers.set(group.id, card.id)
        renderResults()
      }
    })
    keeperLabel.append(keeperRadio, document.createTextNode(' Keep this card'))

    const deleteButton = element('button', 'sd-button sd-button--danger', 'Delete duplicate')
    deleteButton.type = 'button'
    deleteButton.disabled = keeperRadio.checked || activeDeleteRequestId !== null
    deleteButton.addEventListener('click', () => {
      if (selectedKeepers.get(group.id) === card.id || activeDeleteRequestId) return
      const requestId = crypto.randomUUID()
      activeDeleteRequestId = requestId
      status.textContent = `Waiting for deletion confirmation for ${card.name}…`
      renderResults()
      ctx.sendToBackend({
        type: 'delete_card',
        requestId,
        characterId: card.id,
        expectedUpdatedAt: card.updatedAt,
      })
    })
    cardActions.append(keeperLabel, deleteButton)
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
    const groupElement = element('section', 'sd-group')
    const headerElement = element('header', 'sd-group-header')
    const title = element('div', 'sd-group-title')
    title.append(element('h3', '', `Group ${index + 1} · ${group.cards.length} cards`))
    addBadge(title, group.mode === 'name' ? 'Name match' : group.mode === 'exact' ? 'Exact contents' : 'Similar contents')
    headerElement.append(title)
    const reasons = element('ul', 'sd-reasons')
    for (const reason of group.recommendationReasons) reasons.append(element('li', '', reason))
    headerElement.append(reasons)
    groupElement.append(headerElement)
    const cards = element('div', 'sd-cards')
    for (const card of group.cards) cards.append(renderCard(group, card))
    groupElement.append(cards, renderComparison(group))
    return groupElement
  }

  function renderResults(): void {
    results.replaceChildren()
    if (!currentResult) {
      summary.replaceChildren()
      results.append(element('div', 'sd-empty', 'Choose a match mode and scan your character library.'))
      return
    }

    const query = searchInput.value.trim().toLocaleLowerCase()
    const visibleGroups = currentResult.groups.filter(
      (group) => !query || group.cards.some((card) => cardMatchesSearch(card, query)),
    )
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

  modeSelect.addEventListener('change', () => {
    thresholdField.hidden = modeSelect.value !== 'similar'
  })
  thresholdInput.addEventListener('input', () => {
    thresholdOutput.textContent = `${thresholdInput.value}%`
  })
  searchInput.addEventListener('input', renderResults)
  scanButton.addEventListener('click', startScan)

  const unsubscribe = ctx.onBackendMessage((payload: unknown) => {
    if (!payload || typeof payload !== 'object' || !('type' in payload)) return
    const message = payload as BackendResponse
    if (message.type === 'status_result') {
      setPermissionState(message.availability)
      return
    }
    if (message.type === 'results_stale') {
      if (!currentResult) return
      staleNotice.textContent = `${message.reason} Run a new scan before making cleanup decisions.`
      staleNotice.hidden = false
      return
    }
    if (message.type === 'scan_started') {
      if (message.requestId === currentScanRequestId) status.textContent = 'Scanning characters and candidate payloads…'
      return
    }
    if (message.type === 'scan_result') {
      if (message.requestId !== currentScanRequestId) return
      currentScanRequestId = null
      currentResult = message.result
      activeDeleteRequestId = null
      setPermissionState(message.result.availability)
      searchInput.disabled = false
      status.textContent = `Scan completed ${formatDate(message.result.scannedAt)}.`
      staleNotice.hidden = true
      renderResults()
      return
    }
    if (message.type === 'scan_error') {
      if (message.requestId !== currentScanRequestId) return
      currentScanRequestId = null
      scanButton.disabled = !charactersAvailable
      status.textContent = 'Scan failed.'
      results.replaceChildren(element('div', 'sd-notice sd-notice--error', message.error))
      if (message.permissionDenied) ctx.sendToBackend({ type: 'get_status' })
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
    }
  })

  renderResults()
  ctx.sendToBackend({ type: 'get_status' })

  return () => {
    unsubscribe()
    tab.destroy()
    removeStyle()
  }
}
