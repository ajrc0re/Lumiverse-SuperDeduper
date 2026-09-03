// src/types.ts
var CORE_FIELD_KEYS = [
  "description",
  "personality",
  "scenario",
  "first_mes",
  "mes_example",
  "creator_notes",
  "system_prompt",
  "post_history_instructions",
  "creator",
  "tags"
];

// src/frontend.ts
function element(tag, className, text) {
  const value = document.createElement(tag);
  if (className)
    value.className = className;
  if (text !== undefined)
    value.textContent = text;
  return value;
}
function formatDate(epochSeconds) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(epochSeconds * 1000));
}
function metric(value) {
  return value === null ? "Unavailable" : value.toLocaleString();
}
function truncate(value, length = 180) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}
function addBadge(parent, text, tone = "") {
  const badge = element("span", `sd-badge${tone ? ` sd-badge--${tone}` : ""}`, text);
  parent.appendChild(badge);
}
function maxSimilarity(group, cardId) {
  const values = group.matches.filter((match) => match.leftId === cardId || match.rightId === cardId).map((match) => match.similarity);
  return values.length > 0 ? Math.max(...values) : 1;
}
function setup(ctx) {
  let deferredReady = false;
  try {
    const deferReady = ctx.deferReady;
    if (typeof deferReady === "function") {
      deferReady.call(ctx);
      deferredReady = true;
    }
  } catch {}
  const removeStyle = ctx.dom.addStyle(`
    .sd-root { padding: 14px; color: var(--lumiverse-text); display: flex; flex-direction: column; gap: 12px; }
    .sd-header h2 { margin: 0; font-size: 1.15rem; }
    .sd-header p, .sd-muted { color: var(--lumiverse-text-muted); margin: 4px 0 0; font-size: .86rem; }
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
  `);
  const tab = ctx.ui.registerDrawerTab({
    id: "superdeduper",
    title: "SuperDeduper",
    shortName: "Deduper",
    headerTitle: "SuperDeduper",
    description: "Find and compare duplicate character cards",
    keywords: ["characters", "duplicates", "cards", "cleanup"]
  });
  const root = element("section", "sd-root");
  const header = element("header", "sd-header");
  header.append(element("h2", "", "Lumiverse SuperDeduper"));
  header.append(element("p", "", "Scan on demand, compare every payload, and choose which duplicate to keep."));
  root.append(header);
  const permissionNotice = element("div", "sd-notice sd-notice--warning");
  permissionNotice.hidden = true;
  root.append(permissionNotice);
  const staleNotice = element("div", "sd-notice sd-notice--warning");
  staleNotice.hidden = true;
  root.append(staleNotice);
  const controls = element("form", "sd-controls");
  const modeField = element("div", "sd-field");
  const modeLabel = element("label", "", "Match mode");
  const modeSlot = element("div", "sd-component-slot");
  const modeOptions = [
    { value: "name", label: "Names match" },
    { value: "exact", label: "Exact card contents" },
    { value: "similar", label: "Similar card contents" }
  ];
  modeField.append(modeLabel, modeSlot);
  const thresholdField = element("div", "sd-field sd-hidden");
  const thresholdLabel = element("label", "", "Similarity threshold");
  const thresholdLine = element("div", "sd-threshold-line");
  const thresholdSlot = element("div", "sd-component-slot");
  const thresholdOutput = element("output", "", "90%");
  thresholdLine.append(thresholdSlot, thresholdOutput);
  thresholdField.append(thresholdLabel, thresholdLine);
  const searchField = element("div", "sd-field sd-field--wide");
  const searchLabel = element("label", "", "Filter results after scanning (optional)");
  const searchSlot = element("div", "sd-component-slot");
  searchField.append(searchLabel, searchSlot);
  const actions = element("div", "sd-actions");
  const scanButton = element("button", "sd-button", "Scan characters");
  scanButton.type = "submit";
  const status = element("span", "sd-muted", "Scans your entire character library. Connecting to extension backend…");
  actions.append(scanButton, status);
  controls.append(modeField, thresholdField, searchField, actions);
  root.append(controls);
  const summary = element("div", "sd-summary");
  const results = element("div");
  root.append(summary, results);
  tab.root.append(root);
  let currentResult = null;
  let currentScanRequestId = null;
  let activeDeleteRequestId = null;
  let charactersAvailable = true;
  let selectedMode = "name";
  let searchQuery = "";
  let scanTimeoutId = null;
  let backendStatusTimeoutId = null;
  const selectedKeepers = new Map;
  const components = ctx.components;
  function nativeModeControl() {
    modeSlot.replaceChildren();
    const select = element("select", "sd-native-control");
    select.setAttribute("aria-label", "Duplicate match mode");
    for (const optionData of modeOptions) {
      const option = element("option", "", optionData.label);
      option.value = optionData.value;
      select.append(option);
    }
    select.value = selectedMode;
    const onChange = () => {
      const value = select.value;
      if (value !== "name" && value !== "exact" && value !== "similar")
        return;
      selectedMode = value;
      thresholdField.classList.toggle("sd-hidden", value !== "similar");
    };
    select.addEventListener("change", onChange);
    modeSlot.append(select);
    return { getValue: () => selectedMode, destroy: () => select.removeEventListener("change", onChange) };
  }
  function nativeThresholdControl() {
    thresholdSlot.replaceChildren();
    const input = element("input", "sd-native-control");
    input.type = "range";
    input.min = "75";
    input.max = "100";
    input.step = "1";
    input.value = "90";
    input.setAttribute("aria-label", "Similarity threshold");
    const onInput = () => {
      thresholdOutput.textContent = `${input.value}%`;
    };
    input.addEventListener("input", onInput);
    thresholdSlot.append(input);
    return { getValue: () => Number(input.value), destroy: () => input.removeEventListener("input", onInput) };
  }
  function nativeSearchControl() {
    searchSlot.replaceChildren();
    const input = element("input", "sd-native-control");
    input.type = "search";
    input.placeholder = "Name, creator, tag, or character ID";
    input.setAttribute("aria-label", "Filter duplicate results");
    const onInput = () => {
      searchQuery = input.value;
      renderResults();
    };
    input.addEventListener("input", onInput);
    searchSlot.append(input);
    return { getValue: () => input.value, destroy: () => input.removeEventListener("input", onInput) };
  }
  let modeControl;
  try {
    if (typeof components?.mountSelect !== "function")
      throw new Error("Unavailable");
    const mounted = components.mountSelect(modeSlot, {
      value: selectedMode,
      options: modeOptions,
      ariaLabel: "Duplicate match mode",
      portal: true,
      onChange: (value) => {
        if (value !== "name" && value !== "exact" && value !== "similar")
          return;
        selectedMode = value;
        thresholdField.classList.toggle("sd-hidden", value !== "similar");
      }
    });
    modeControl = { getValue: () => selectedMode, destroy: () => mounted.destroy() };
  } catch {
    modeControl = nativeModeControl();
  }
  let thresholdControl;
  try {
    if (typeof components?.mountRangeSlider !== "function")
      throw new Error("Unavailable");
    thresholdControl = components.mountRangeSlider(thresholdSlot, {
      min: 75,
      max: 100,
      step: 1,
      integer: true,
      value: 90,
      onDragValue: (value) => {
        if (value !== null)
          thresholdOutput.textContent = `${value}%`;
      },
      onCommit: (value) => {
        thresholdOutput.textContent = `${value}%`;
      }
    });
  } catch {
    thresholdControl = nativeThresholdControl();
  }
  let searchControl;
  try {
    if (typeof components?.mountTextInput !== "function")
      throw new Error("Unavailable");
    searchControl = components.mountTextInput(searchSlot, {
      value: "",
      placeholder: "Name, creator, tag, or character ID",
      ariaLabel: "Filter duplicate results",
      onChange: (value) => {
        searchQuery = value;
        renderResults();
      }
    });
  } catch {
    searchControl = nativeSearchControl();
  }
  function setPermissionState(availability) {
    charactersAvailable = availability.characters !== "unavailable";
    scanButton.disabled = !charactersAvailable || currentScanRequestId !== null;
    permissionNotice.replaceChildren();
    if (!charactersAvailable) {
      permissionNotice.hidden = false;
      permissionNotice.append(document.createTextNode("The Characters permission is required. "));
      const settingsButton = element("button", "sd-button sd-button--secondary", "Open Extensions settings");
      settingsButton.type = "button";
      settingsButton.dataset.action = "open-settings";
      permissionNotice.append(settingsButton);
      return;
    }
    const unavailable = [
      availability.worldBooks === "unavailable" ? "world books" : "",
      availability.images === "unavailable" ? "images" : "",
      availability.regexScripts === "unavailable" ? "scripts" : ""
    ].filter(Boolean);
    if (unavailable.length > 0) {
      permissionNotice.hidden = false;
      permissionNotice.append(document.createTextNode(`Optional ${unavailable.join(", ")} data is unavailable. Recommendations will be provisional. `));
      const settingsButton = element("button", "sd-button sd-button--secondary", "Review permissions");
      settingsButton.type = "button";
      settingsButton.dataset.action = "open-settings";
      permissionNotice.append(settingsButton);
    } else {
      permissionNotice.hidden = true;
    }
  }
  function startScan() {
    if (!charactersAvailable || currentScanRequestId)
      return;
    const requestId = crypto.randomUUID();
    currentScanRequestId = requestId;
    scanButton.disabled = true;
    status.textContent = "Scan request sent…";
    staleNotice.hidden = true;
    try {
      ctx.sendToBackend({
        type: "scan_duplicates",
        requestId,
        mode: selectedMode,
        similarityThreshold: thresholdControl.getValue() / 100
      });
    } catch (error) {
      currentScanRequestId = null;
      scanButton.disabled = !charactersAvailable;
      status.textContent = "Could not send the scan request.";
      results.replaceChildren(element("div", "sd-notice sd-notice--error", error instanceof Error ? error.message : String(error)));
      return;
    }
    if (scanTimeoutId !== null)
      window.clearTimeout(scanTimeoutId);
    scanTimeoutId = window.setTimeout(() => {
      if (currentScanRequestId !== requestId)
        return;
      currentScanRequestId = null;
      scanButton.disabled = !charactersAvailable;
      status.textContent = "The backend did not respond. Reload or re-enable the extension, then try again.";
      results.replaceChildren(element("div", "sd-notice sd-notice--error", "The backend did not acknowledge the scan request within 15 seconds."));
    }, 15000);
  }
  function renderSummary(result, visibleGroups) {
    summary.replaceChildren();
    addBadge(summary, `${result.groups.length} duplicate groups`);
    addBadge(summary, `${result.duplicateCharacters} duplicate cards`);
    addBadge(summary, `${result.totalCharacters} cards scanned`);
    if (visibleGroups !== result.groups.length)
      addBadge(summary, `${visibleGroups} groups shown`);
    const approximate = result.groups.some((group) => group.cards.some((card) => card.tokens.card.approximate || card.tokens.payload.approximate));
    if (approximate)
      addBadge(summary, "Some token counts approximate", "warning");
  }
  function cardMatchesSearch(card, query) {
    const haystack = [card.id, card.name, card.creator, ...card.tags].join(`
`).toLocaleLowerCase();
    return haystack.includes(query);
  }
  function appendCardBadges(container, card, group) {
    const match = Math.round(maxSimilarity(group, card.id) * 100);
    addBadge(container, `${match}% match`);
    addBadge(container, `${card.tokens.card.value.toLocaleString()} card tokens${card.tokens.card.approximate ? " ≈" : ""}`);
    addBadge(container, `${card.tokens.payload.value.toLocaleString()} accessible payload tokens${card.tokens.payload.approximate ? " ≈" : ""}`);
    addBadge(container, `${card.payload.greetings} greetings · ${card.payload.alternateGreetings} alternate`);
    addBadge(container, `${metric(card.payload.lorebooks)} lorebooks`);
    addBadge(container, `${metric(card.payload.lorebookEntries)} lore entries`);
    addBadge(container, card.payload.scripts === null ? "Unavailable scoped scripts" : `${card.payload.scripts} scoped scripts · ${card.payload.enabledScripts ?? 0} on · ${card.payload.disabledScripts ?? 0} off`);
    if (card.payload.embeddedLumiScripts > 0) {
      addBadge(container, `${card.payload.embeddedLumiScripts} embedded LumiScripts`);
    }
    addBadge(container, `${card.payload.expressions} expressions`);
    addBadge(container, `${metric(card.payload.storedImages)} stored images`);
    if (card.payload.embeddedGalleryItems > 0) {
      addBadge(container, `${card.payload.embeddedGalleryItems} gallery refs`);
    }
  }
  function renderCard(group, card) {
    const cardElement = element("article", "sd-card");
    if (card.avatarUrl) {
      const avatar = element("img", "sd-avatar");
      avatar.src = card.avatarUrl;
      avatar.alt = `${card.name} avatar`;
      avatar.loading = "lazy";
      cardElement.append(avatar);
    } else {
      cardElement.append(element("div", "sd-avatar sd-avatar--empty", "No avatar"));
    }
    const main = element("div", "sd-card-main");
    const title = element("div", "sd-card-title");
    title.append(element("strong", "", card.name || "Unnamed character"));
    if (card.id === group.recommendedKeeperId) {
      addBadge(title, group.recommendationProvisional ? "Recommended · provisional" : "Recommended", group.recommendationProvisional ? "warning" : "good");
    }
    if (selectedKeepers.get(group.id) === card.id)
      addBadge(title, "Protected keeper", "good");
    main.append(title);
    main.append(element("div", "sd-card-meta", `Creator: ${card.creator || "Unknown"} · Updated ${formatDate(card.updatedAt)} · Created ${formatDate(card.createdAt)} · ID ${card.id}`));
    const badges = element("div", "sd-badges");
    appendCardBadges(badges, card, group);
    main.append(badges);
    const recognizedKeys = card.payload.recognizedExtensionKeys.map((entry) => `${entry.key} (${entry.count})`);
    const otherKeys = card.payload.otherExtensionKeys.map((entry) => `${entry.key} (${entry.count})`);
    if (recognizedKeys.length > 0) {
      main.append(element("div", "sd-key-list", `Recognized extension payload: ${recognizedKeys.join(", ")}`));
    }
    if (otherKeys.length > 0) {
      main.append(element("div", "sd-key-list", `Other extension payload: ${otherKeys.join(", ")} · ${card.payload.otherExtensionBytes.toLocaleString()} bytes`));
    }
    if (card.payload.images.length > 0) {
      const images = element("div", "sd-images");
      for (const imageData of card.payload.images.slice(0, 8)) {
        const image = element("img");
        image.src = imageData.url;
        image.alt = imageData.filename || "Character image";
        image.title = imageData.filename || imageData.id;
        image.loading = "lazy";
        images.append(image);
      }
      if (card.payload.images.length > 8) {
        images.append(element("span", "sd-muted", `+${card.payload.images.length - 8} more`));
      }
      main.append(images);
    }
    for (const warning of card.warnings) {
      main.append(element("div", "sd-notice sd-notice--warning", warning));
    }
    const cardActions = element("div", "sd-card-actions");
    const isKeeper = selectedKeepers.get(group.id) === card.id;
    const keeperButton = element("button", "sd-button sd-button--secondary", isKeeper ? "Protected keeper" : "Keep this card");
    keeperButton.type = "button";
    keeperButton.disabled = isKeeper;
    keeperButton.dataset.action = "protect-card";
    keeperButton.dataset.groupId = group.id;
    keeperButton.dataset.characterId = card.id;
    const deleteButton = element("button", "sd-button sd-button--danger", "Delete duplicate");
    deleteButton.type = "button";
    deleteButton.disabled = isKeeper || activeDeleteRequestId !== null;
    deleteButton.dataset.action = "delete-card";
    deleteButton.dataset.groupId = group.id;
    deleteButton.dataset.characterId = card.id;
    cardActions.append(keeperButton, deleteButton);
    main.append(cardActions);
    cardElement.append(main);
    return cardElement;
  }
  function renderComparison(group) {
    const details = element("details", "sd-compare");
    details.append(element("summary", "", "Compare matching fields and payload keys"));
    const wrap = element("div", "sd-table-wrap");
    const table = element("table", "sd-table");
    const head = element("thead");
    const headingRow = element("tr");
    headingRow.append(element("th", "", "Field"));
    for (const card of group.cards)
      headingRow.append(element("th", "", card.name || card.id));
    head.append(headingRow);
    table.append(head);
    const body = element("tbody");
    for (const key of CORE_FIELD_KEYS) {
      const values = group.cards.map((card) => card.coreFields[key]);
      const equal = new Set(values).size === 1;
      const row = element("tr");
      row.append(element("th", equal ? "sd-equal" : "sd-different", `${key} · ${equal ? "equal" : "different"}`));
      for (const value of values)
        row.append(element("td", "", value ? truncate(value) : "—"));
      body.append(row);
    }
    const payloadRow = element("tr");
    payloadRow.append(element("th", "", "Payload summary"));
    for (const card of group.cards) {
      payloadRow.append(element("td", "", `${card.payload.categoryCount} categories · ${card.payload.itemCount} items · ${card.payload.otherExtensionBytes} other bytes`));
    }
    body.append(payloadRow);
    if (group.mode === "similar") {
      const matchRow = element("tr");
      matchRow.append(element("th", "", "Qualifying pairs"));
      const descriptions = group.matches.map((match) => {
        const left = group.cards.find((card) => card.id === match.leftId)?.name ?? match.leftId;
        const right = group.cards.find((card) => card.id === match.rightId)?.name ?? match.rightId;
        return `${left} ↔ ${right}: ${Math.round(match.similarity * 100)}%`;
      });
      const cell = element("td", "", descriptions.join(`
`));
      cell.colSpan = group.cards.length;
      matchRow.append(cell);
      body.append(matchRow);
    }
    table.append(body);
    wrap.append(table);
    details.append(wrap);
    return details;
  }
  function renderGroup(group, index) {
    const groupElement = element("section", "sd-group");
    const headerElement = element("header", "sd-group-header");
    const title = element("div", "sd-group-title");
    title.append(element("h3", "", `Group ${index + 1} · ${group.cards.length} cards`));
    addBadge(title, group.mode === "name" ? "Name match" : group.mode === "exact" ? "Exact contents" : "Similar contents");
    headerElement.append(title);
    const reasons = element("ul", "sd-reasons");
    for (const reason of group.recommendationReasons)
      reasons.append(element("li", "", reason));
    headerElement.append(reasons);
    groupElement.append(headerElement);
    const cards = element("div", "sd-cards");
    for (const card of group.cards)
      cards.append(renderCard(group, card));
    groupElement.append(cards, renderComparison(group));
    return groupElement;
  }
  function renderResults() {
    results.replaceChildren();
    if (!currentResult) {
      summary.replaceChildren();
      results.append(element("div", "sd-empty", "Choose a match mode and scan your character library."));
      return;
    }
    const query = searchQuery.trim().toLocaleLowerCase();
    const visibleGroups = currentResult.groups.filter((group) => !query || group.cards.some((card) => cardMatchesSearch(card, query)));
    renderSummary(currentResult, visibleGroups.length);
    if (visibleGroups.length === 0) {
      results.append(element("div", "sd-empty", currentResult.groups.length === 0 ? "No duplicate groups were found with this match mode." : "No duplicate groups match this filter."));
      return;
    }
    for (const [index, group] of visibleGroups.entries()) {
      if (!group.cards.some((card) => card.id === selectedKeepers.get(group.id))) {
        selectedKeepers.set(group.id, group.recommendedKeeperId);
      }
      results.append(renderGroup(group, index));
    }
  }
  function handleAction(action, actionElement) {
    if (action === "open-settings") {
      ctx.events.emit("open-settings", { view: "extensions" });
      return;
    }
    if (action === "protect-card") {
      const groupId = actionElement.dataset.groupId;
      const characterId = actionElement.dataset.characterId;
      if (!groupId || !characterId)
        return;
      selectedKeepers.set(groupId, characterId);
      renderResults();
      return;
    }
    if (action === "delete-card") {
      const groupId = actionElement.dataset.groupId;
      const characterId = actionElement.dataset.characterId;
      if (!groupId || !characterId || !currentResult || activeDeleteRequestId)
        return;
      if (selectedKeepers.get(groupId) === characterId)
        return;
      const card = currentResult.groups.find((group) => group.id === groupId)?.cards.find((candidate) => candidate.id === characterId);
      if (!card)
        return;
      const requestId = crypto.randomUUID();
      activeDeleteRequestId = requestId;
      status.textContent = `Waiting for deletion confirmation for ${card.name}…`;
      renderResults();
      ctx.sendToBackend({
        type: "delete_card",
        requestId,
        characterId: card.id,
        expectedUpdatedAt: card.updatedAt
      });
    }
  }
  const onSubmit = (event) => {
    event.preventDefault();
    startScan();
  };
  controls.addEventListener("submit", onSubmit);
  const onActionClick = (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!target || !root.contains(target) || target instanceof HTMLButtonElement && target.disabled)
      return;
    const action = target.dataset.action;
    if (action)
      handleAction(action, target);
  };
  root.addEventListener("click", onActionClick);
  const unbindActions = () => {
    controls.removeEventListener("submit", onSubmit);
    root.removeEventListener("click", onActionClick);
  };
  const unsubscribe = ctx.onBackendMessage((payload) => {
    if (!payload || typeof payload !== "object" || !("type" in payload))
      return;
    if (backendStatusTimeoutId !== null) {
      window.clearTimeout(backendStatusTimeoutId);
      backendStatusTimeoutId = null;
    }
    const message = payload;
    if (message.type === "status_result") {
      setPermissionState(message.availability);
      status.textContent = charactersAvailable ? "Ready to scan." : "Characters permission required.";
      return;
    }
    if (message.type === "results_stale") {
      if (!currentResult)
        return;
      staleNotice.textContent = `${message.reason} Run a new scan before making cleanup decisions.`;
      staleNotice.hidden = false;
      return;
    }
    if (message.type === "scan_started") {
      if (message.requestId === currentScanRequestId) {
        status.textContent = "Scanning the full character library and inspecting duplicate payloads…";
        if (scanTimeoutId !== null)
          window.clearTimeout(scanTimeoutId);
        scanTimeoutId = window.setTimeout(() => {
          if (currentScanRequestId !== message.requestId)
            return;
          currentScanRequestId = null;
          scanButton.disabled = !charactersAvailable;
          status.textContent = "The acknowledged scan did not finish within 10 minutes.";
          results.replaceChildren(element("div", "sd-notice sd-notice--error", "The backend started this scan but did not return a result. Check the Lumiverse server log for the extension error."));
        }, 600000);
      }
      return;
    }
    if (message.type === "scan_result") {
      if (message.requestId !== currentScanRequestId)
        return;
      if (scanTimeoutId !== null)
        window.clearTimeout(scanTimeoutId);
      scanTimeoutId = null;
      currentScanRequestId = null;
      currentResult = message.result;
      activeDeleteRequestId = null;
      setPermissionState(message.result.availability);
      status.textContent = `Scan completed ${formatDate(message.result.scannedAt)}.`;
      staleNotice.hidden = true;
      renderResults();
      return;
    }
    if (message.type === "scan_error") {
      if (message.requestId !== currentScanRequestId)
        return;
      if (scanTimeoutId !== null)
        window.clearTimeout(scanTimeoutId);
      scanTimeoutId = null;
      currentScanRequestId = null;
      scanButton.disabled = !charactersAvailable;
      status.textContent = "Scan failed.";
      results.replaceChildren(element("div", "sd-notice sd-notice--error", message.error));
      if (message.permissionDenied)
        ctx.sendToBackend({ type: "get_status" });
      return;
    }
    if (message.type === "delete_result") {
      if (message.requestId !== activeDeleteRequestId)
        return;
      activeDeleteRequestId = null;
      if (message.deleted) {
        status.textContent = "Character deleted. Refreshing duplicate groups…";
        currentScanRequestId = null;
        startScan();
      } else {
        status.textContent = message.cancelled ? "Deletion cancelled." : message.error ?? "Character was not deleted.";
        if (message.stale) {
          staleNotice.textContent = "The scan is stale. Run a new scan before deleting.";
          staleNotice.hidden = false;
        }
        renderResults();
      }
    }
  });
  renderResults();
  if (deferredReady) {
    try {
      const ready = ctx.ready;
      if (typeof ready === "function")
        ready.call(ctx);
    } catch {}
  }
  backendStatusTimeoutId = window.setTimeout(() => {
    status.textContent = "Backend not responding. Reload or re-enable the extension.";
  }, 5000);
  ctx.sendToBackend({ type: "get_status" });
  let unsubscribeActivation = () => {};
  try {
    const onActivate = tab.onActivate;
    if (typeof onActivate === "function") {
      unsubscribeActivation = onActivate.call(tab, () => {
        ctx.sendToBackend({ type: "get_status" });
      });
    }
  } catch {}
  return () => {
    if (scanTimeoutId !== null)
      window.clearTimeout(scanTimeoutId);
    if (backendStatusTimeoutId !== null)
      window.clearTimeout(backendStatusTimeoutId);
    unsubscribeActivation();
    unbindActions();
    unsubscribe();
    modeControl.destroy();
    thresholdControl.destroy();
    searchControl.destroy();
    tab.destroy();
    removeStyle();
  };
}
export {
  setup
};
