# Lumiverse SuperDeduper

Find, compare, and safely remove duplicate character cards in Lumiverse.

## Features

- Match cards by normalized name, exact card contents, or adjustable content similarity.
- Compare greetings, token counts, lorebooks and entries, character-scoped scripts, expressions, image galleries, timestamps, and other embedded extension data.
- Get a transparent payload-first keeper recommendation that uses recency as its first tie-breaker.
- Protect a selected keeper and delete other cards only after an explicit Lumiverse confirmation.
- Keep optional data visibly marked as unavailable when its permission is not granted.

## Install

Install this repository URL from Lumiverse's Extensions panel:

```text
https://github.com/ajrc0re/Lumiverse-SuperDeduper
```

The extension requires the `characters` permission. The `world_books`, `images`, and `regex_scripts` permissions add comparison details; scans still work without them, but recommendations are marked provisional.

Open the **SuperDeduper** drawer tab, select a match mode, and choose **Scan characters**. Scans run only when requested. If a card or associated payload changes afterward, the existing results are marked stale.

## Development

```bash
bun install
bun run typecheck
bun test
bun run build
```

Lumiverse loads `dist/backend.js` and `dist/frontend.js`. If `dist/` is absent during installation, Lumiverse can build the TypeScript entry points from `src/`.

See [PLAN.md](PLAN.md) for the complete behavior and acceptance criteria.
