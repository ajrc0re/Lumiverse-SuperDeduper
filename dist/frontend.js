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

// src/comparison.ts
var CORE_FIELD_LABELS = {
  description: "Description",
  personality: "Personality",
  scenario: "Scenario",
  first_mes: "Primary greeting",
  mes_example: "Example dialogue",
  creator_notes: "Creator notes",
  system_prompt: "System prompt",
  post_history_instructions: "Post-history instructions",
  creator: "Creator",
  tags: "Tags"
};
var PAYLOAD_CATEGORY_ORDER = {
  lumiscripts: 0,
  expressions: 1,
  gallery: 2,
  other: 3
};
function formatNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString("en-US") : "Unavailable";
}
function formatCount(value, singular) {
  if (!Number.isFinite(value))
    return "Unavailable";
  return `${formatNumber(value)} ${Math.abs(value) === 1 ? singular : `${singular}s`}`;
}
function formatOptionalCount(value, singular) {
  return value === null ? "Unavailable" : formatCount(value, singular);
}
function formatTokenCount(value, approximate) {
  if (!Number.isFinite(value))
    return "Unavailable";
  return `${approximate ? "~" : ""}${formatCount(value, "token")}`;
}
function formatCoreValue(key, value) {
  if (!value.trim())
    return "Empty";
  return key === "tags" ? value.split(`
`).filter(Boolean).join(", ") : value;
}
function formatScriptSummary(card) {
  const { scripts, enabledScripts, disabledScripts } = card.payload;
  if (scripts === null)
    return "Unavailable";
  const details = [formatCount(scripts, "script")];
  details.push(enabledScripts === null ? "enabled status unavailable" : `${formatNumber(enabledScripts)} enabled`);
  details.push(disabledScripts === null ? "disabled status unavailable" : `${formatNumber(disabledScripts)} disabled`);
  return details.join(" · ");
}
function formatExtensionValue(entry) {
  if (!entry)
    return "Not present";
  const references = new Set(entry.references.filter((reference) => reference.trim())).size;
  return [
    formatCount(entry.count, "item"),
    formatCount(entry.bytes, "byte"),
    formatCount(references, "reference")
  ].join(" · ");
}
function comparisonCardReference(card) {
  return { id: card.id, name: card.name.trim() || "Unnamed card" };
}
function buildRow(label, cards, valueForCard, payloadCategory) {
  const valueGroups = new Map;
  for (const card of cards) {
    const value = valueForCard(card);
    const group = valueGroups.get(value);
    if (group) {
      group.cards.push(comparisonCardReference(card));
    } else {
      valueGroups.set(value, { value, cards: [comparisonCardReference(card)] });
    }
  }
  const values = [...valueGroups.values()];
  return {
    label,
    ...payloadCategory === undefined ? {} : { payloadCategory },
    status: values.length <= 1 ? "same" : "different",
    values
  };
}
function allExtensionEntries(card) {
  return [...card.payload.recognizedExtensionKeys, ...card.payload.otherExtensionKeys];
}
function extensionKeyDefinitions(cards) {
  const definitions = new Map;
  for (const card of cards) {
    for (const entry of allExtensionEntries(card)) {
      const existing = definitions.get(entry.key);
      if (!existing || PAYLOAD_CATEGORY_ORDER[entry.category] < PAYLOAD_CATEGORY_ORDER[existing.category]) {
        definitions.set(entry.key, { key: entry.key, category: entry.category });
      }
    }
  }
  return [...definitions.values()].sort((left, right) => {
    const categoryDifference = PAYLOAD_CATEGORY_ORDER[left.category] - PAYLOAD_CATEGORY_ORDER[right.category];
    if (categoryDifference !== 0)
      return categoryDifference;
    return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
  });
}
function extensionEntry(card, key) {
  return allExtensionEntries(card).find((entry) => entry.key === key);
}
function buildPayloadSummaryRows(cards) {
  return [
    buildRow("Payload categories", cards, (card) => formatCount(card.payload.categoryCount, "category"), "summary"),
    buildRow("Payload items", cards, (card) => formatCount(card.payload.itemCount, "item"), "summary"),
    buildRow("Greetings", cards, (card) => formatCount(card.payload.greetings, "greeting"), "summary"),
    buildRow("Alternate greetings", cards, (card) => formatCount(card.payload.alternateGreetings, "alternate greeting"), "summary"),
    buildRow("Lorebooks", cards, (card) => formatOptionalCount(card.payload.lorebooks, "lorebook"), "summary"),
    buildRow("Lorebook entries", cards, (card) => formatOptionalCount(card.payload.lorebookEntries, "entry"), "summary"),
    buildRow("Scoped scripts", cards, formatScriptSummary, "summary"),
    buildRow("Embedded LumiScripts", cards, (card) => formatCount(card.payload.embeddedLumiScripts, "LumiScript"), "lumiscripts"),
    buildRow("Expressions", cards, (card) => formatCount(card.payload.expressions, "expression"), "expressions"),
    buildRow("Embedded gallery references", cards, (card) => formatCount(card.payload.embeddedGalleryItems, "reference"), "gallery"),
    buildRow("Stored images", cards, (card) => formatOptionalCount(card.payload.storedImages, "image"), "gallery"),
    buildRow("Other extension data", cards, (card) => formatCount(card.payload.otherExtensionBytes, "byte"), "other"),
    buildRow("Card text tokens", cards, (card) => formatTokenCount(card.tokens.card.value, card.tokens.card.approximate), "summary"),
    buildRow("Accessible payload tokens", cards, (card) => formatTokenCount(card.tokens.payload.value, card.tokens.payload.approximate), "summary"),
    buildRow("Total accessible tokens", cards, (card) => formatTokenCount(card.tokens.total, card.tokens.card.approximate || card.tokens.payload.approximate), "summary")
  ];
}
function buildComparisonRows(cards) {
  if (cards.length === 0)
    return [];
  const coreRows = CORE_FIELD_KEYS.map((key) => buildRow(CORE_FIELD_LABELS[key], cards, (card) => formatCoreValue(key, card.coreFields[key])));
  const payloadRows = buildPayloadSummaryRows(cards);
  const extensionRows = extensionKeyDefinitions(cards).map((definition) => buildRow(`Extension key: ${definition.key || "Unnamed key"}`, cards, (card) => formatExtensionValue(extensionEntry(card, definition.key)), definition.category));
  return [...coreRows, ...payloadRows, ...extensionRows];
}

// src/search.ts
var WHITESPACE = /\s+/gu;
function searchFieldValues(card, field) {
  if (field === "name")
    return [card.name];
  if (field === "creator")
    return [card.creator];
  if (field === "tag")
    return card.tags;
  return [card.id];
}
function normalize(value) {
  return value.normalize("NFKC").toLowerCase().trim().replace(WHITESPACE, " ");
}
function matchesWildcardSearch(values, query) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery)
    return true;
  const normalizedValues = values.map(normalize);
  if (!normalizedQuery.includes("*")) {
    return normalizedValues.some((value) => value.includes(normalizedQuery));
  }
  const pattern = normalizedQuery.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  const matcher = new RegExp(`^${pattern}$`, "u");
  return normalizedValues.some((value) => matcher.test(value));
}

// src/group-selection.ts
function activeGroupsForBulk(groups, deactivatedGroupIds) {
  return groups.filter((group) => !deactivatedGroupIds.has(group.id));
}

// src/styles.ts
var superDeduperStyles = `
  .sd-root {
    --sd-accent: var(--lumiverse-primary, #a594db);
    --sd-bg: var(--lumiverse-bg, #18171e);
    --sd-surface: var(--lumiverse-fill-subtle, #24222d);
    --sd-surface-raised: var(--lumiverse-bg-elevated, #202126);
    --sd-text: var(--lumiverse-text, #edeaf4);
    --sd-muted: var(--lumiverse-text-muted, #a5a0b3);
    --sd-border: var(--lumiverse-border, #3a3646);
    box-sizing: border-box;
    color: var(--sd-text);
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    min-height: 0;
    max-width: 960px;
    margin: 0 auto;
    padding: 12px;
    font: 13px/1.45 system-ui, sans-serif;
  }
  .sd-root *, .sd-root *::before, .sd-root *::after { box-sizing: border-box; }
  .sd-root button, .sd-root input, .sd-root select { font: inherit; }
  .sd-root button:focus-visible, .sd-root input:focus-visible, .sd-root select:focus-visible, .sd-root summary:focus-visible {
    outline: 2px solid var(--sd-accent);
    outline-offset: 2px;
  }
  .sd-header { padding: 1px 1px 0; }
  .sd-header h2 { margin: 0 0 3px; font-size: 18px; line-height: 1.25; }
  .sd-header p, .sd-muted { color: var(--sd-muted); margin: 0; font-size: 12px; }
  .sd-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
  .sd-toolbar-spacer { flex: 1 1 36px; min-width: 24px; }
  .sd-separator { display: flex; align-items: center; gap: 10px; min-height: 14px; color: var(--sd-border); }
  .sd-separator::before, .sd-separator::after { content: ''; height: 1px; flex: 1; background: var(--sd-border); opacity: .78; }
  .sd-separator::marker { content: ''; }
  .sd-controls {
    display: grid;
    grid-template-columns: repeat(2, minmax(150px, 1fr));
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--sd-border);
    border-radius: 9px;
    background: var(--sd-surface-raised);
  }
  .sd-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .sd-field label { font-size: 12px; color: var(--sd-muted); font-weight: 600; }
  .sd-component-slot { min-width: 0; flex: 1; }
  .sd-native-control {
    box-sizing: border-box;
    width: 100%;
    min-height: 32px;
    padding: 7px 9px;
    border: 1px solid var(--sd-border);
    border-radius: 7px;
    background: var(--sd-surface);
    color: var(--sd-text);
    pointer-events: auto !important;
    position: relative;
    z-index: 1;
  }
  select.sd-native-control, button.sd-button { cursor: pointer; pointer-events: auto !important; position: relative; z-index: 1; }
  input.sd-native-control { cursor: text; }
  input[type='range'].sd-native-control { cursor: pointer; padding: 0; }
  .sd-hidden { display: none !important; }
  .sd-field--wide { grid-column: 1 / -1; }
  .sd-threshold-line { display: flex; align-items: center; gap: 8px; }
  .sd-button {
    min-height: 32px;
    padding: 6px 10px;
    border: 1px solid var(--sd-border);
    border-radius: 7px;
    background: var(--sd-accent);
    color: var(--sd-bg);
    cursor: pointer;
    font-weight: 600;
  }
  .sd-button:hover:not(:disabled) { filter: brightness(1.08); }
  .sd-button:disabled { cursor: not-allowed; opacity: .45; }
  .sd-button--secondary { background: transparent; color: var(--sd-text); font-weight: 500; }
  .sd-button--secondary:hover:not(:disabled) { background: var(--sd-surface); filter: none; }
  .sd-button--danger {
    background: color-mix(in srgb, var(--lumiverse-danger, #e66161) 18%, transparent);
    border-color: var(--lumiverse-danger, #e66161);
    color: var(--lumiverse-danger, #ed9090);
  }
  .sd-button--danger:hover:not(:disabled) { background: color-mix(in srgb, var(--lumiverse-danger, #e66161) 28%, transparent); filter: none; }
  .sd-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .sd-progress {
    padding: 10px 12px;
    border: 1px solid var(--sd-border);
    border-radius: 9px;
    border-left: 3px solid var(--sd-accent);
    background: var(--sd-surface-raised);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .sd-progress[hidden] { display: none; }
  .sd-progress progress { width: 100%; height: 10px; accent-color: var(--sd-accent); }
  .sd-notice {
    padding: 9px 10px;
    border: 1px solid var(--sd-border);
    border-left: 3px solid var(--sd-accent);
    border-radius: 5px;
    background: color-mix(in srgb, var(--sd-accent) 11%, transparent);
    font-size: 12px;
  }
  .sd-notice--warning { border-left-color: var(--lumiverse-warning, #e7ad42); background: color-mix(in srgb, var(--lumiverse-warning, #e7ad42) 11%, transparent); }
  .sd-notice--error { border-left-color: var(--lumiverse-danger, #e66161); background: color-mix(in srgb, var(--lumiverse-danger, #e66161) 11%, transparent); }
  .sd-summary { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .sd-group {
    --sd-group-accent: var(--sd-accent);
    border: 1px solid var(--sd-border);
    border-radius: 11px;
    overflow: hidden;
    background: var(--sd-surface);
  }
  .sd-group--exact { --sd-group-accent: var(--lumiverse-success, #5ca879); }
  .sd-group--similar { --sd-group-accent: #7eabdc; }
  .sd-group--inactive { opacity: .62; border-style: dashed; }
  .sd-group-header {
    padding: 12px 13px;
    border-bottom: 1px solid var(--sd-border);
    border-left: 3px solid var(--sd-group-accent);
    background: var(--sd-surface-raised);
    background: color-mix(in srgb, var(--sd-group-accent) 15%, var(--sd-surface-raised));
    cursor: pointer;
  }
  .sd-group-header-content { display: flex; flex-direction: column; gap: 8px; margin-left: 5px; }
  .sd-group:not([open]) .sd-group-header { border-bottom: 0; }
  .sd-group-title { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
  .sd-group-title h3 { margin: 0; font-size: 14px; line-height: 1.3; }
  .sd-reasons { margin: 0; padding-left: 18px; font-size: 12px; color: var(--sd-muted); }
  .sd-cards { display: flex; flex-direction: column; background: var(--sd-surface); }
  .sd-card {
    padding: 12px;
    display: grid;
    grid-template-columns: 58px minmax(0, 1fr);
    gap: 10px;
    border-bottom: 1px solid var(--sd-border);
    background: var(--sd-surface);
  }
  .sd-card:last-child { border-bottom: 0; }
  .sd-avatar { width: 58px; height: 78px; border-radius: 9px; object-fit: cover; background: var(--sd-bg); border: 1px solid var(--sd-border); }
  .sd-avatar--empty { display: grid; place-items: center; font-size: 11px; color: var(--sd-muted); }
  .sd-card-main { min-width: 0; display: flex; flex-direction: column; gap: 7px; }
  .sd-card-title { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .sd-card-title strong { overflow-wrap: anywhere; }
  .sd-card-meta { font-size: 12px; color: var(--sd-muted); overflow-wrap: anywhere; }
  .sd-badges { display: flex; flex-wrap: wrap; gap: 5px; }
  .sd-badge { display: inline-flex; align-items: center; min-height: 20px; padding: 1px 7px; border-radius: 999px; background: color-mix(in srgb, var(--sd-bg) 70%, transparent); border: 1px solid var(--sd-border); font-size: 11px; }
  .sd-badge--good { border-color: var(--lumiverse-success, #5ca879); color: var(--lumiverse-success, #7bc895); }
  .sd-badge--warning { border-color: var(--lumiverse-warning, #e7ad42); color: var(--lumiverse-warning, #f0c76b); }
  .sd-badge--danger { border-color: var(--lumiverse-danger, #e66161); color: var(--lumiverse-danger, #ed9090); }
  .sd-card-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .sd-card-actions label { font-size: 12px; display: flex; align-items: center; gap: 5px; }
  .sd-key-list { font-size: 12px; color: var(--sd-muted); overflow-wrap: anywhere; }
  .sd-images { display: flex; gap: 5px; overflow-x: auto; }
  .sd-images img { width: 52px; height: 52px; flex: 0 0 auto; object-fit: cover; border-radius: 7px; border: 1px solid var(--sd-border); }
  .sd-compare { margin: 0 12px 12px; padding: 10px; border: 1px solid var(--sd-border); border-radius: 9px; background: var(--sd-bg); }
  .sd-compare > summary { cursor: pointer; font-size: 13px; font-weight: 600; }
  .sd-table-wrap { margin-top: 9px; overflow-x: auto; }
  .sd-comparison-table { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; font-size: 12px; }
  .sd-comparison-table th, .sd-comparison-table td { text-align: left; vertical-align: top; padding: 8px; border-bottom: 1px solid var(--sd-border); overflow-wrap: anywhere; }
  .sd-comparison-table thead th { color: var(--sd-muted); background: var(--sd-surface-raised); font-size: 11px; font-weight: 650; letter-spacing: .03em; text-transform: uppercase; }
  .sd-comparison-table .sd-comparison-field { width: 23%; }
  .sd-comparison-table .sd-comparison-cards { width: 27%; }
  .sd-comparison-table .sd-comparison-value { width: 50%; }
  .sd-comparison-section th { padding: 8px; background: color-mix(in srgb, var(--sd-accent) 10%, var(--sd-surface-raised)); color: var(--sd-text); font-size: 11px; letter-spacing: .04em; text-transform: uppercase; }
  .sd-comparison-field-label { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; font-size: 12px; }
  .sd-comparison-field-meta { color: var(--sd-muted); font-size: 11px; font-weight: 500; }
  .sd-comparison-value-group + .sd-comparison-value-group { border-top: 1px solid var(--sd-border); }
  .sd-comparison-card-list { display: grid; gap: 4px; }
  .sd-comparison-card { color: var(--sd-text); font-weight: 600; overflow-wrap: anywhere; }
  .sd-comparison-card-id { color: var(--sd-muted); font-size: 11px; font-weight: 400; }
  .sd-comparison-value-preview { white-space: pre-wrap; overflow-wrap: anywhere; }
  .sd-comparison-full-value { margin-top: 6px; }
  .sd-comparison-full-value > summary { cursor: pointer; color: var(--sd-muted); font-size: 11px; }
  .sd-comparison-full-value pre { margin: 6px 0 0; max-height: 28em; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--sd-text); font: 11px/1.4 ui-monospace, Consolas, monospace; }
  .sd-similarity-pairs { margin-top: 10px; padding: 9px; border: 1px solid var(--sd-border); border-radius: 7px; background: var(--sd-surface-raised); }
  .sd-similarity-pairs > summary { cursor: pointer; font-size: 12px; font-weight: 600; }
  .sd-similarity-pairs-content { display: grid; gap: 8px; margin-top: 8px; }
  .sd-similarity-pair-list { max-height: 24em; margin: 0; padding-left: 26px; overflow: auto; }
  .sd-similarity-pair { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--sd-border); }
  .sd-similarity-pair:last-child { border-bottom: 0; }
  .sd-similarity-pair-cards { min-width: 0; overflow-wrap: anywhere; }
  .sd-similarity-pair-score { color: var(--lumiverse-success, #7bc895); font-variant-numeric: tabular-nums; font-weight: 650; }
  .sd-equal { color: var(--lumiverse-success, #7bc895); }
  .sd-different { color: var(--lumiverse-warning, #f0c76b); }
  .sd-empty { text-align: center; padding: 24px 12px; color: var(--sd-muted); }
  @media (max-width: 540px) {
    .sd-root { padding: 10px; }
    .sd-controls { grid-template-columns: 1fr; }
    .sd-field--wide, .sd-actions { grid-column: 1; }
    .sd-card { grid-template-columns: 46px minmax(0, 1fr); }
    .sd-avatar { width: 46px; height: 64px; }
    .sd-group-header { padding: 10px; }
    .sd-compare { margin: 0 8px 8px; padding: 8px; }
    .sd-comparison-table th, .sd-comparison-table td { padding: 6px; }
    .sd-comparison-table .sd-comparison-field { width: 27%; }
    .sd-comparison-table .sd-comparison-cards { width: 30%; }
    .sd-comparison-table .sd-comparison-value { width: 43%; }
  }
`;

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
function createRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function")
    return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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
  const removeStyle = ctx.dom.addStyle(superDeduperStyles);
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
  const toolbar = element("nav", "sd-toolbar");
  toolbar.setAttribute("aria-label", "Result actions");
  const clearButton = element("button", "sd-button sd-button--secondary", "Clear results");
  clearButton.type = "button";
  clearButton.disabled = true;
  clearButton.dataset.action = "clear-results";
  const collapseButton = element("button", "sd-button sd-button--secondary", "Collapse all");
  collapseButton.type = "button";
  collapseButton.disabled = true;
  collapseButton.dataset.action = "toggle-all-groups";
  toolbar.append(clearButton, collapseButton, element("span", "sd-toolbar-spacer"));
  root.append(toolbar, element("div", "sd-separator", "◆"));
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
  const searchScopeField = element("div", "sd-field");
  const searchScopeLabel = element("label", "", "Search field");
  const searchScopeSlot = element("div", "sd-component-slot");
  const searchScopeOptions = [
    { value: "name", label: "Name" },
    { value: "creator", label: "Creator" },
    { value: "tag", label: "Tag" },
    { value: "id", label: "Character ID" }
  ];
  searchScopeField.append(searchScopeLabel, searchScopeSlot);
  const searchField = element("div", "sd-field");
  const searchLabel = element("label", "", "Search scope and filter (optional)");
  const searchSlot = element("div", "sd-component-slot");
  searchField.append(searchLabel, searchSlot);
  const batchModeField = element("div", "sd-field");
  const batchModeLabel = element("label", "", "Scan scope");
  const batchModeSelect = element("select", "sd-native-control");
  batchModeSelect.setAttribute("aria-label", "Scan scope");
  for (const [value, label] of [["all", "All matching cards"], ["batch", "Batch"]]) {
    const option = element("option", "", label);
    option.value = value;
    batchModeSelect.append(option);
  }
  batchModeField.append(batchModeLabel, batchModeSelect);
  const batchSettingsField = element("div", "sd-field sd-hidden");
  const batchSettingsLabel = element("label", "", "Batch size and starting position");
  const batchSettings = element("div", "sd-threshold-line");
  const batchSizeInput = element("input", "sd-native-control");
  batchSizeInput.type = "number";
  batchSizeInput.min = "1";
  batchSizeInput.max = "1000";
  batchSizeInput.step = "1";
  batchSizeInput.value = "100";
  batchSizeInput.setAttribute("aria-label", "Batch size");
  const batchStartInput = element("input", "sd-native-control");
  batchStartInput.type = "number";
  batchStartInput.min = "1";
  batchStartInput.step = "1";
  batchStartInput.value = "1";
  batchStartInput.setAttribute("aria-label", "Batch starting position");
  batchSettings.append(batchSizeInput, batchStartInput);
  batchSettingsField.append(batchSettingsLabel, batchSettings);
  const actions = element("div", "sd-actions");
  const scanButton = element("button", "sd-button", "Scan characters");
  scanButton.type = "button";
  const previousBatchButton = element("button", "sd-button sd-button--secondary", "Previous batch");
  previousBatchButton.type = "button";
  const nextBatchButton = element("button", "sd-button sd-button--secondary", "Next batch");
  nextBatchButton.type = "button";
  const status = element("span", "sd-muted", "Scans your entire character library. Connecting to extension backend…");
  actions.append(scanButton, previousBatchButton, nextBatchButton, status);
  controls.append(modeField, thresholdField, searchScopeField, searchField, batchModeField, batchSettingsField, actions);
  root.append(controls);
  const progressPanel = element("div", "sd-progress");
  progressPanel.hidden = true;
  const progressBar = element("progress");
  const progressLabel = element("span", "sd-muted", "Preparing scan…");
  progressPanel.append(progressBar, progressLabel);
  root.append(progressPanel);
  root.append(element("div", "sd-separator", "◆"));
  const summary = element("div", "sd-summary");
  const results = element("div");
  root.append(summary, results);
  tab.root.append(root);
  let currentResult = null;
  let currentScanRequestId = null;
  let activeDeleteRequestId = null;
  let charactersAvailable = true;
  let selectedMode = "name";
  let similarityThreshold = 90;
  let searchQuery = "";
  let selectedSearchField = "name";
  let batchEnabled = false;
  let batchSize = 100;
  let batchOffset = 0;
  let scanTimeoutId = null;
  let cancelRequestPending = false;
  let backendStatusTimeoutId = null;
  const selectedKeepers = new Map;
  const collapsedGroups = new Set;
  const deactivatedGroups = new Set;
  function updateScanButton() {
    const scanning = currentScanRequestId !== null;
    scanButton.textContent = scanning ? "Stop search" : "Scan characters";
    scanButton.classList.toggle("sd-button--danger", scanning);
    scanButton.disabled = !charactersAvailable || cancelRequestPending;
    previousBatchButton.hidden = !batchEnabled;
    nextBatchButton.hidden = !batchEnabled;
    previousBatchButton.disabled = scanning || cancelRequestPending || batchOffset === 0;
    nextBatchButton.disabled = scanning || cancelRequestPending || currentResult !== null && currentResult.scopeOffset + currentResult.totalCharacters >= currentResult.scopeTotalCharacters;
  }
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
    const updateValue = () => {
      similarityThreshold = Number(input.value);
    };
    input.addEventListener("input", onInput);
    input.addEventListener("input", updateValue);
    thresholdSlot.append(input);
    return { getValue: () => similarityThreshold, destroy: () => {
      input.removeEventListener("input", onInput);
      input.removeEventListener("input", updateValue);
    } };
  }
  function nativeSearchControl() {
    searchSlot.replaceChildren();
    const input = element("input", "sd-native-control");
    input.type = "search";
    input.placeholder = "Search text (* wildcard supported)";
    input.setAttribute("aria-label", "Filter duplicate results");
    const onInput = () => {
      searchQuery = input.value;
      batchOffset = 0;
      batchStartInput.value = "1";
      updateScanButton();
      renderResults();
    };
    input.addEventListener("input", onInput);
    searchSlot.append(input);
    return {
      getValue: () => input.value,
      setValue: (value) => {
        input.value = value;
      },
      destroy: () => input.removeEventListener("input", onInput)
    };
  }
  function nativeSearchScopeControl() {
    searchScopeSlot.replaceChildren();
    const select = element("select", "sd-native-control");
    select.setAttribute("aria-label", "Search field");
    for (const optionData of searchScopeOptions) {
      const option = element("option", "", optionData.label);
      option.value = optionData.value;
      select.append(option);
    }
    select.value = selectedSearchField;
    const onChange = () => {
      const value = select.value;
      if (value !== "name" && value !== "creator" && value !== "tag" && value !== "id")
        return;
      selectedSearchField = value;
      batchOffset = 0;
      batchStartInput.value = "1";
      updateScanButton();
      renderResults();
    };
    select.addEventListener("change", onChange);
    searchScopeSlot.append(select);
    return {
      getValue: () => selectedSearchField,
      destroy: () => select.removeEventListener("change", onChange)
    };
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
        if (value !== null) {
          similarityThreshold = value;
          thresholdOutput.textContent = `${value}%`;
        }
      },
      onCommit: (value) => {
        similarityThreshold = value;
        thresholdOutput.textContent = `${value}%`;
      }
    });
  } catch {
    thresholdControl = nativeThresholdControl();
  }
  const searchControl = nativeSearchControl();
  let searchScopeControl;
  try {
    if (typeof components?.mountSelect !== "function")
      throw new Error("Unavailable");
    const mounted = components.mountSelect(searchScopeSlot, {
      value: selectedSearchField,
      options: searchScopeOptions,
      ariaLabel: "Search field",
      portal: true,
      onChange: (value) => {
        if (value !== "name" && value !== "creator" && value !== "tag" && value !== "id")
          return;
        selectedSearchField = value;
        batchOffset = 0;
        batchStartInput.value = "1";
        updateScanButton();
        renderResults();
      }
    });
    searchScopeControl = { getValue: () => selectedSearchField, destroy: () => mounted.destroy() };
  } catch {
    searchScopeControl = nativeSearchScopeControl();
  }
  const onBatchModeChange = () => {
    batchEnabled = batchModeSelect.value === "batch";
    batchSettingsField.classList.toggle("sd-hidden", !batchEnabled);
    batchOffset = 0;
    batchStartInput.value = "1";
    updateScanButton();
  };
  const onBatchSettingsChange = () => {
    batchSize = Math.min(1000, Math.max(1, Math.floor(Number(batchSizeInput.value) || 100)));
    batchOffset = Math.max(0, Math.floor(Number(batchStartInput.value) || 1) - 1);
    batchSizeInput.value = String(batchSize);
    batchStartInput.value = String(batchOffset + 1);
    updateScanButton();
  };
  batchModeSelect.addEventListener("change", onBatchModeChange);
  batchSizeInput.addEventListener("change", onBatchSettingsChange);
  batchStartInput.addEventListener("change", onBatchSettingsChange);
  updateScanButton();
  function setPermissionState(availability) {
    charactersAvailable = availability.characters !== "unavailable";
    updateScanButton();
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
    if (!charactersAvailable) {
      status.textContent = "Cannot scan until the Characters permission is granted.";
      return;
    }
    if (currentScanRequestId) {
      status.textContent = "A scan is already in progress.";
      return;
    }
    searchQuery = searchControl.getValue();
    onBatchSettingsChange();
    const requestId = createRequestId();
    currentScanRequestId = requestId;
    cancelRequestPending = false;
    updateScanButton();
    const scopeDescription = searchQuery.trim() ? `${searchScopeOptions.find((option) => option.value === selectedSearchField)?.label ?? selectedSearchField}: ${searchQuery}` : "the full library";
    const batchDescription = batchEnabled ? `, batch ${batchOffset + 1}–${batchOffset + batchSize}` : "";
    status.textContent = `Scan request sent for ${scopeDescription}${batchDescription}…`;
    progressPanel.hidden = false;
    progressBar.removeAttribute("value");
    progressLabel.textContent = "Waiting for the backend to start…";
    staleNotice.hidden = true;
    try {
      ctx.sendToBackend({
        type: "scan_duplicates",
        requestId,
        mode: selectedMode,
        similarityThreshold: similarityThreshold / 100,
        filterQuery: searchQuery,
        searchField: selectedSearchField,
        ...batchEnabled ? { batchSize, batchOffset } : {}
      });
    } catch (error) {
      currentScanRequestId = null;
      updateScanButton();
      progressPanel.hidden = true;
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
      updateScanButton();
      progressPanel.hidden = true;
      status.textContent = "The backend did not respond. Reload or re-enable the extension, then try again.";
      results.replaceChildren(element("div", "sd-notice sd-notice--error", "The backend did not acknowledge the scan request within 15 seconds."));
    }, 15000);
  }
  function renderSummary(result, visibleGroups) {
    summary.replaceChildren();
    addBadge(summary, `${result.groups.length} duplicate groups`);
    addBadge(summary, `${result.duplicateCharacters} duplicate cards`);
    addBadge(summary, `${result.totalCharacters} cards scanned`);
    if (result.scopeLimit !== null) {
      const first = result.totalCharacters > 0 ? result.scopeOffset + 1 : 0;
      const last = result.scopeOffset + result.totalCharacters;
      addBadge(summary, `Batch ${first}–${last} of ${result.scopeTotalCharacters} matching cards`);
    }
    if (visibleGroups !== result.groups.length)
      addBadge(summary, `${visibleGroups} groups shown`);
    const approximate = result.groups.some((group) => group.cards.some((card) => card.tokens.card.approximate || card.tokens.payload.approximate));
    if (approximate)
      addBadge(summary, "Some token counts approximate", "warning");
    if (result.groups.length > 0) {
      const activeGroups = activeGroupsForBulk(result.groups, deactivatedGroups);
      if (activeGroups.length !== result.groups.length) {
        addBadge(summary, `${result.groups.length - activeGroups.length} groups deactivated`, "warning");
      }
      const bulkButton = element("button", "sd-button sd-button--danger", "Delete all non-keepers");
      bulkButton.type = "button";
      bulkButton.disabled = activeDeleteRequestId !== null || activeGroups.length === 0;
      bulkButton.dataset.action = "delete-all-duplicates";
      bulkButton.title = "Deletes every duplicate except the protected keeper in each active group";
      summary.append(bulkButton);
      summary.append(element("span", "sd-muted", "“Keep this card” changes the protected keeper for its group."));
    }
  }
  function cardMatchesSearch(card, query) {
    return matchesWildcardSearch(searchFieldValues(card, selectedSearchField), query);
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
    const keeperButton = element("button", "sd-button sd-button--secondary", isKeeper ? "Protected keeper" : "Protect this card instead");
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
  function comparisonCategoryLabel(category) {
    switch (category) {
      case "lumiscripts":
        return "LumiScript payload";
      case "expressions":
        return "Expression payload";
      case "gallery":
        return "Gallery payload";
      case "other":
        return "Other extension payload";
      default:
        return "Payload overview";
    }
  }
  function appendComparisonCards(parent, cards, groupSize) {
    const list = element("div", "sd-comparison-card-list");
    if (cards.length === groupSize) {
      list.append(element("div", "sd-comparison-card", `All ${groupSize} cards`));
    } else {
      for (const card of cards) {
        const item = element("div", "sd-comparison-card");
        item.append(document.createTextNode(card.name || "Unnamed card"));
        item.append(element("span", "sd-comparison-card-id", ` · ${card.id}`));
        list.append(item);
      }
    }
    parent.append(list);
  }
  function appendComparisonValue(parent, value) {
    const preview = truncate(value, 420);
    parent.append(element("div", "sd-comparison-value-preview", preview));
    if (preview !== value) {
      const fullValue = element("details", "sd-comparison-full-value");
      fullValue.append(element("summary", "", "Show full value"));
      const fullText = element("pre", "", value);
      fullText.tabIndex = 0;
      fullText.setAttribute("aria-label", "Full comparison value");
      fullValue.append(fullText);
      parent.append(fullValue);
    }
  }
  function appendSimilarityPairs(parent, group) {
    if (group.mode !== "similar" || group.matches.length === 0)
      return;
    const pairDetails = element("details", "sd-similarity-pairs");
    pairDetails.append(element("summary", "", `Review qualifying similarity pairs · ${group.matches.length.toLocaleString()} pairs`));
    const content = element("div", "sd-similarity-pairs-content");
    const status2 = element("div", "sd-muted", "Open this section to load the first matching pairs.");
    status2.setAttribute("role", "status");
    const list = element("ol", "sd-similarity-pair-list");
    list.tabIndex = 0;
    list.setAttribute("aria-label", "Qualifying similarity pairs");
    const controls2 = element("div", "sd-card-actions");
    const moreButton = element("button", "sd-button sd-button--secondary", "Show 50 more pairs");
    moreButton.type = "button";
    controls2.append(moreButton);
    const cardsById = new Map(group.cards.map((card) => [card.id, card]));
    const cardLabel = (id) => {
      const card = cardsById.get(id);
      return card ? `${card.name || "Unnamed card"} · ${card.id}` : id;
    };
    let visiblePairs = 0;
    const pageSize = 50;
    const appendNextPairs = () => {
      const nextVisiblePairs = Math.min(group.matches.length, visiblePairs + pageSize);
      for (const match of group.matches.slice(visiblePairs, nextVisiblePairs)) {
        const pair = element("li", "sd-similarity-pair");
        pair.append(element("span", "sd-similarity-pair-cards", `${cardLabel(match.leftId)} ↔ ${cardLabel(match.rightId)}`), element("span", "sd-similarity-pair-score", `${Math.round(match.similarity * 100)}%`));
        list.append(pair);
      }
      visiblePairs = nextVisiblePairs;
      status2.textContent = `Showing ${visiblePairs.toLocaleString()} of ${group.matches.length.toLocaleString()} qualifying pairs.`;
      controls2.hidden = visiblePairs >= group.matches.length;
    };
    pairDetails.addEventListener("toggle", () => {
      if (pairDetails.open && visiblePairs === 0)
        appendNextPairs();
    });
    moreButton.addEventListener("click", appendNextPairs);
    content.append(status2, list, controls2);
    pairDetails.append(content);
    parent.append(pairDetails);
  }
  function renderComparison(group) {
    const details = element("details", "sd-compare");
    details.append(element("summary", "", `Compare matching fields and payload keys · ${group.cards.length} cards`));
    const wrap = element("div", "sd-table-wrap");
    const table = element("table", "sd-comparison-table");
    table.setAttribute("aria-label", `Comparison for duplicate group with ${group.cards.length} cards`);
    const head = element("thead");
    const headingRow = element("tr");
    const fieldHeading = element("th", "sd-comparison-field", "Field or payload key");
    const cardsHeading = element("th", "sd-comparison-cards", "Cards");
    const valueHeading = element("th", "sd-comparison-value", "Value");
    fieldHeading.scope = "col";
    cardsHeading.scope = "col";
    valueHeading.scope = "col";
    headingRow.append(fieldHeading, cardsHeading, valueHeading);
    head.append(headingRow);
    table.append(head);
    const rows = buildComparisonRows(group.cards);
    const appendSection = (label, sectionRows) => {
      if (sectionRows.length === 0)
        return;
      const body = element("tbody");
      const sectionRow = element("tr", "sd-comparison-section");
      const sectionHeading = element("th", "", label);
      sectionHeading.colSpan = 3;
      sectionRow.append(sectionHeading);
      body.append(sectionRow);
      for (const row of sectionRows) {
        for (const [valueIndex, valueGroup] of row.values.entries()) {
          const comparisonRow = element("tr", "sd-comparison-value-group");
          if (valueIndex === 0) {
            const field = element("th", `sd-comparison-field ${row.status === "same" ? "sd-equal" : "sd-different"}`);
            field.scope = "row";
            field.rowSpan = row.values.length;
            const fieldLabel = element("div", "sd-comparison-field-label");
            fieldLabel.append(element("span", "", row.label));
            addBadge(fieldLabel, row.status === "same" ? "Same" : "Different", row.status === "same" ? "good" : "warning");
            field.append(fieldLabel);
            if (row.payloadCategory)
              field.append(element("div", "sd-comparison-field-meta", comparisonCategoryLabel(row.payloadCategory)));
            comparisonRow.append(field);
          }
          const cards = element("td", "sd-comparison-cards");
          appendComparisonCards(cards, valueGroup.cards, group.cards.length);
          const value = element("td", "sd-comparison-value");
          appendComparisonValue(value, valueGroup.value);
          comparisonRow.append(cards, value);
          body.append(comparisonRow);
        }
      }
      table.append(body);
    };
    appendSection("Core card fields", rows.filter((row) => row.payloadCategory === undefined));
    appendSection("Payload overview", rows.filter((row) => row.payloadCategory !== undefined && !row.label.startsWith("Extension key: ")));
    appendSection("Extension payload keys", rows.filter((row) => row.label.startsWith("Extension key: ")));
    wrap.append(table);
    details.append(wrap);
    appendSimilarityPairs(details, group);
    return details;
  }
  function renderGroup(group, index) {
    const deactivated = deactivatedGroups.has(group.id);
    const groupElement = element("details", `sd-group sd-group--${group.mode}${deactivated ? " sd-group--inactive" : ""}`);
    groupElement.open = !collapsedGroups.has(group.id);
    groupElement.dataset.groupId = group.id;
    groupElement.addEventListener("toggle", () => {
      if (groupElement.open)
        collapsedGroups.delete(group.id);
      else
        collapsedGroups.add(group.id);
    });
    const headerElement = element("summary", "sd-group-header");
    const headerContent = element("div", "sd-group-header-content");
    const title = element("div", "sd-group-title");
    title.append(element("h3", "", `Group ${index + 1} · ${group.cards.length} cards`));
    addBadge(title, group.mode === "name" ? "Name match" : group.mode === "exact" ? "Exact contents" : "Similar contents");
    if (deactivated)
      addBadge(title, "Excluded from bulk delete", "warning");
    const activationButton = element("button", "sd-button sd-button--secondary", deactivated ? "Activate group" : "Deactivate group");
    activationButton.type = "button";
    activationButton.dataset.action = "toggle-group-active";
    activationButton.dataset.groupId = group.id;
    const groupDeleteButton = element("button", "sd-button sd-button--danger", `Delete all Group ${index + 1} non-keepers`);
    groupDeleteButton.type = "button";
    groupDeleteButton.disabled = activeDeleteRequestId !== null;
    groupDeleteButton.dataset.action = "delete-group-duplicates";
    groupDeleteButton.dataset.groupId = group.id;
    title.append(activationButton, groupDeleteButton);
    headerContent.append(title);
    const reasons = element("ul", "sd-reasons");
    for (const reason of group.recommendationReasons)
      reasons.append(element("li", "", reason));
    headerContent.append(reasons);
    headerElement.append(headerContent);
    groupElement.append(headerElement);
    const cards = element("div", "sd-cards");
    for (const card of group.cards)
      cards.append(renderCard(group, card));
    groupElement.append(cards, renderComparison(group));
    return groupElement;
  }
  function renderResults() {
    results.replaceChildren();
    clearButton.disabled = currentResult === null;
    collapseButton.disabled = currentResult === null || currentResult.groups.length === 0;
    if (!currentResult) {
      collapseButton.textContent = "Collapse all";
      summary.replaceChildren();
      results.append(element("div", "sd-empty", "Choose a match mode and scan your character library."));
      return;
    }
    const query = searchQuery.trim().toLocaleLowerCase();
    const visibleGroups = currentResult.groups.filter((group) => !query || group.cards.some((card) => cardMatchesSearch(card, query)));
    const allVisibleCollapsed = visibleGroups.length > 0 && visibleGroups.every((group) => collapsedGroups.has(group.id));
    collapseButton.textContent = allVisibleCollapsed ? "Expand all" : "Collapse all";
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
    if (action === "clear-results") {
      currentResult = null;
      selectedKeepers.clear();
      collapsedGroups.clear();
      deactivatedGroups.clear();
      searchQuery = "";
      try {
        searchControl.setValue?.("");
      } catch {}
      status.textContent = "Results cleared. Ready to scan the full character library.";
      staleNotice.hidden = true;
      renderResults();
      return;
    }
    if (action === "toggle-all-groups") {
      if (!currentResult)
        return;
      const groupElements = [...results.querySelectorAll("details.sd-group")];
      const shouldExpand = groupElements.length > 0 && groupElements.every((group) => !group.open);
      for (const groupElement of groupElements) {
        groupElement.open = shouldExpand;
        const groupId = groupElement.dataset.groupId;
        if (groupId) {
          if (shouldExpand)
            collapsedGroups.delete(groupId);
          else
            collapsedGroups.add(groupId);
        }
      }
      renderResults();
      return;
    }
    if (action === "toggle-group-active") {
      const groupId = actionElement.dataset.groupId;
      if (!groupId || !currentResult?.groups.some((group) => group.id === groupId))
        return;
      if (deactivatedGroups.has(groupId))
        deactivatedGroups.delete(groupId);
      else
        deactivatedGroups.add(groupId);
      renderResults();
      return;
    }
    if (action === "delete-all-duplicates" || action === "delete-group-duplicates") {
      if (!currentResult || activeDeleteRequestId)
        return;
      const requestedGroups = action === "delete-group-duplicates" ? currentResult.groups.filter((group) => group.id === actionElement.dataset.groupId) : activeGroupsForBulk(currentResult.groups, deactivatedGroups);
      const cards = requestedGroups.flatMap((group) => {
        const keeperId = selectedKeepers.get(group.id) ?? group.recommendedKeeperId;
        return group.cards.filter((card) => card.id !== keeperId).map((card) => ({ characterId: card.id, expectedUpdatedAt: card.updatedAt, name: card.name }));
      });
      const uniqueCards = [...new Map(cards.map((card) => [card.characterId, card])).values()];
      if (uniqueCards.length === 0)
        return;
      const requestId = createRequestId();
      activeDeleteRequestId = requestId;
      status.textContent = `Waiting for confirmation to delete ${uniqueCards.length} non-keeper duplicates…`;
      renderResults();
      ctx.sendToBackend({
        type: "delete_duplicates",
        requestId,
        groupCount: requestedGroups.length,
        cards: uniqueCards
      });
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
      const requestId = createRequestId();
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
  const onScanClick = (event) => {
    event.preventDefault();
    if (currentScanRequestId) {
      if (cancelRequestPending)
        return;
      cancelRequestPending = true;
      updateScanButton();
      status.textContent = "Waiting for confirmation to stop the scan…";
      try {
        ctx.sendToBackend({ type: "cancel_scan", requestId: currentScanRequestId });
      } catch (error) {
        cancelRequestPending = false;
        updateScanButton();
        status.textContent = `Could not request cancellation: ${error instanceof Error ? error.message : String(error)}`;
      }
    } else {
      startScan();
    }
  };
  const onScanKeyDown = (event) => {
    if (event.key !== "Enter")
      return;
    event.preventDefault();
    startScan();
  };
  const onPreviousBatch = () => {
    if (!batchEnabled || currentScanRequestId)
      return;
    onBatchSettingsChange();
    batchOffset = Math.max(0, batchOffset - batchSize);
    batchStartInput.value = String(batchOffset + 1);
    startScan();
  };
  const onNextBatch = () => {
    if (!batchEnabled || currentScanRequestId)
      return;
    onBatchSettingsChange();
    batchOffset += batchSize;
    batchStartInput.value = String(batchOffset + 1);
    startScan();
  };
  scanButton.addEventListener("click", onScanClick);
  previousBatchButton.addEventListener("click", onPreviousBatch);
  nextBatchButton.addEventListener("click", onNextBatch);
  controls.addEventListener("keydown", onScanKeyDown);
  const onActionClick = (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!target || !root.contains(target) || target instanceof HTMLButtonElement && target.disabled)
      return;
    if (target.closest("summary"))
      event.preventDefault();
    const action = target.dataset.action;
    if (action)
      handleAction(action, target);
  };
  root.addEventListener("click", onActionClick);
  const unbindActions = () => {
    scanButton.removeEventListener("click", onScanClick);
    controls.removeEventListener("keydown", onScanKeyDown);
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
      if (!currentScanRequestId) {
        const version = message.backendVersion ? ` Backend v${message.backendVersion}.` : " Backend version unavailable.";
        status.textContent = charactersAvailable ? `Ready to scan.${version}` : `Characters permission required.${version}`;
      }
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
        const acceptedQuery = message.filterQuery?.trim();
        const acceptedScope = acceptedQuery ? `${message.searchField ?? "name"}=${JSON.stringify(message.filterQuery)}` : "the full library";
        const acceptedBatch = message.batchSize === undefined ? "" : `, batch ${message.batchOffset ?? 0}–${(message.batchOffset ?? 0) + message.batchSize - 1}`;
        const backendVersion = message.backendVersion ?? "unknown";
        status.textContent = `Backend v${backendVersion} accepted ${acceptedScope}${acceptedBatch}.`;
        progressPanel.hidden = false;
        progressBar.removeAttribute("value");
        progressLabel.textContent = "Collecting character cards…";
        if (scanTimeoutId !== null)
          window.clearTimeout(scanTimeoutId);
        scanTimeoutId = window.setTimeout(() => {
          if (currentScanRequestId !== message.requestId)
            return;
          currentScanRequestId = null;
          cancelRequestPending = false;
          updateScanButton();
          progressPanel.hidden = true;
          status.textContent = "The acknowledged scan did not finish within 10 minutes.";
          results.replaceChildren(element("div", "sd-notice sd-notice--error", "The backend started this scan but did not return a result. Check the Lumiverse server log for the extension error."));
        }, 600000);
      }
      return;
    }
    if (message.type === "scan_progress") {
      if (message.requestId !== currentScanRequestId)
        return;
      progressPanel.hidden = false;
      if (message.total > 0) {
        progressBar.max = message.total;
        progressBar.value = Math.min(message.current, message.total);
      } else {
        progressBar.removeAttribute("value");
      }
      const phaseLabel = message.phase === "collecting" ? "Collecting cards" : message.phase === "matching" ? "Comparing cards" : "Inspecting duplicate payloads";
      progressLabel.textContent = message.total > 0 ? `${phaseLabel}: ${message.current.toLocaleString()} of ${message.total.toLocaleString()}` : `${phaseLabel}…`;
      return;
    }
    if (message.type === "scan_result") {
      if (message.requestId !== currentScanRequestId)
        return;
      if (scanTimeoutId !== null)
        window.clearTimeout(scanTimeoutId);
      scanTimeoutId = null;
      currentScanRequestId = null;
      cancelRequestPending = false;
      currentResult = message.result;
      deactivatedGroups.clear();
      activeDeleteRequestId = null;
      setPermissionState(message.result.availability);
      progressPanel.hidden = true;
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
      cancelRequestPending = false;
      updateScanButton();
      progressPanel.hidden = true;
      status.textContent = "Scan failed.";
      results.replaceChildren(element("div", "sd-notice sd-notice--error", message.error));
      if (message.permissionDenied)
        ctx.sendToBackend({ type: "get_status" });
      return;
    }
    if (message.type === "scan_cancel_result") {
      if (message.requestId !== currentScanRequestId)
        return;
      cancelRequestPending = false;
      if (!message.cancelled) {
        updateScanButton();
        status.textContent = message.error ?? "Cancellation dismissed. Scan is continuing…";
        return;
      }
      if (scanTimeoutId !== null)
        window.clearTimeout(scanTimeoutId);
      scanTimeoutId = null;
      currentScanRequestId = null;
      currentResult = null;
      selectedKeepers.clear();
      collapsedGroups.clear();
      updateScanButton();
      progressPanel.hidden = true;
      status.textContent = "Scan stopped. Partial results were discarded.";
      staleNotice.hidden = true;
      renderResults();
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
      return;
    }
    if (message.type === "bulk_delete_result") {
      if (message.requestId !== activeDeleteRequestId)
        return;
      activeDeleteRequestId = null;
      if (message.cancelled) {
        status.textContent = "Bulk deletion cancelled. Nothing was deleted.";
        renderResults();
        return;
      }
      const detail = message.errors.length > 0 ? ` ${message.errors.slice(0, 3).join(" ")}` : "";
      status.textContent = `Deleted ${message.deleted}; skipped ${message.skipped}.${detail}`;
      if (message.deleted > 0) {
        currentScanRequestId = null;
        startScan();
      } else {
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
    searchScopeControl.destroy();
    batchModeSelect.removeEventListener("change", onBatchModeChange);
    batchSizeInput.removeEventListener("change", onBatchSettingsChange);
    batchStartInput.removeEventListener("change", onBatchSettingsChange);
    previousBatchButton.removeEventListener("click", onPreviousBatch);
    nextBatchButton.removeEventListener("click", onNextBatch);
    tab.destroy();
    removeStyle();
  };
}
export {
  setup
};
