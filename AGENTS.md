# Repository Instructions

## Project

Lumiverse SuperDeduper is a TypeScript Spindle extension with a browser frontend and Bun backend. Read `PLAN.md` before changing behavior and use the local `developer-docs/` documentation as the primary API reference when it is available.

## Development

- Use Bun for dependencies, tests, and builds.
- Keep shared request/response contracts in `src/types.ts`.
- Keep duplicate matching and ranking deterministic and dependency-free.
- Prefer straightforward DOM and TypeScript implementations over additional frameworks or abstractions.
- Preserve on-demand scanning; character-change events only mark results stale.

Run all of these before handing off changes:

```bash
bun run typecheck
bun test
bun run build
git diff --check
```

## Versioning and bundles

- Bump the version in both `package.json` and `spindle.json` for every user-facing extension update. The values must match.
- Lumiverse loads `dist/backend.js` and `dist/frontend.js` directly.
- Always run `bun run build` after source changes and commit both generated bundles. Do not re-ignore `dist/`; stale installed bundles have previously caused updates to execute old code.

## Spindle compatibility

- The extension may be installed operator-scoped and used by several clients. Forward the originating `userId` through every user-owned backend API call, modal, and targeted frontend response.
- Never broadcast character data or scan results between users.
- Keep frontend host-component integrations feature-detected and retain native-control fallbacks so older Lumiverse hosts can still register the drawer.
- LAN clients may run over insecure HTTP. Do not depend directly on secure-context-only browser APIs such as `crypto.randomUUID()`; use the existing request-ID helper.
- Scan responses must retain their `requestId` so stale or late responses cannot replace a newer scan.
- Keep scan cancellation scoped per user and suppress results after cancellation.

## Deletion safety

- Never delete a protected keeper.
- Require an explicit danger confirmation before individual, group, or global deletion.
- Re-fetch every character and compare its scanned `updated_at` before deletion. Bulk operations must also recheck after confirmation and skip missing or changed cards.
- Delete only character cards through `spindle.characters.delete()`.
- Do not separately delete lorebooks, images, scripts, chats, or extension metadata because those resources may be shared.

## UI behavior

- A blank filter means the scan covers the full character library; filtering only narrows displayed results after scanning.
- Keep optional enrichment failures labeled unavailable or partial rather than reporting false zero values.
- Preserve the recommended keeper explanation and allow the user to override the protected keeper per group.
- Keep long scans observable through measured progress and keep the red Stop search action available while scanning.
- New toolbar actions belong in the toolbar below the main title.

## Tests

- Add or update unit tests for matching, grouping, payload classification, keeper ordering, progress, cancellation, and deletion behavior when those areas change.
- Test operator-scoped message routing with a non-local `userId` when changing backend communication.
- Treat missing optional permissions, stale cards, partial failures, and insecure LAN-browser behavior as supported conditions rather than exceptional edge cases.
