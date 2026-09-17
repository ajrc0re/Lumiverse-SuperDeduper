export const superDeduperStyles = `
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
`
