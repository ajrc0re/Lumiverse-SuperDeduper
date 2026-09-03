# Lumiverse SuperDeduper Extension

## Summary

- Before changing source code, save this finalized plan verbatim as `/Users/aaronreeves/ai/Lumiverse-SuperDeduper/PLAN.md` and verify it is the only new repository change.
- Build a small backend/frontend Spindle extension using the documented [character](https://docs.lumiverse.chat/backend-api/characters/), [token](https://docs.lumiverse.chat/backend-api/tokens/), [world-book](https://docs.lumiverse.chat/backend-api/world-books/), [image](https://docs.lumiverse.chat/backend-api/images/), and [regex-script](https://docs.lumiverse.chat/backend-api/regex-scripts/) APIs.
- Present the tool in a free [drawer tab](https://docs.lumiverse.chat/frontend-api/ui-placement/) named **SuperDeduper**.
- Keep scanning on-demand. Character-change events only mark existing results stale; they do not trigger background rescans.
- Include review plus individually confirmed deletion. No automatic or bulk deletion.

## Implementation Changes

### Extension structure and permissions

- Add the standard TypeScript Spindle project files, build scripts, `src/backend.ts`, `src/frontend.ts`, shared types/helpers, and unit tests.
- Configure `spindle.json` with frontend and backend entries and these permissions:
  - `characters` — required for scanning and deleting cards.
  - `world_books`, `images`, and `regex_scripts` — optional enrichment permissions.
  - Do not request generation, UI-panel, network, or other unrelated permissions.
- If `characters` is unavailable, show a blocked state linking to Lumiverse’s Extensions settings. Optional inaccessible metrics must display as **Unavailable**, never zero.

### Duplicate detection

Fetch every character through the paginated API and support three explicit modes:

1. **Names match**
   - Normalize names with Unicode NFKC, lowercase, trimmed ends, and collapsed internal whitespace.
   - Group cards whose normalized names are identical.

2. **Exact card contents**
   - Canonicalize and compare the ordinary card fields: description, personality, scenario, primary greeting, example dialogue, creator notes, system prompt, post-history instructions, creator, and tags.
   - Exclude IDs, timestamps, avatar IDs, alternate greetings, attached payloads, and the name so renamed imports and payload-rich revisions can still match.
   - Hash the stable serialized canonical value and group identical hashes.

3. **Similar card contents**
   - Compare the same canonical text fields with dependency-free Sørensen–Dice similarity over normalized character trigrams.
   - Ignore fields empty on both cards and weight field scores by their normalized text length.
   - Default to a conservative `90%` threshold, adjustable from `75–100%`.
   - Compare pairs in memory, join qualifying pairs into connected duplicate groups, and display each matched pair’s percentage so transitive groupings remain reviewable.

Only groups containing at least two cards are returned. A frontend search box filters detected groups by character name, creator, tag, or ID.

### Candidate enrichment and keeper recommendation

Enrich only cards already found in duplicate groups:

- **Card tokens:** Count regular card text, tags, primary greeting, and alternate greetings using `spindle.tokens.countText({ modelSource: "main" })`. If model resolution fails, use `ceil(characters / 4)` and label the value approximate.
- **Greetings:** Show total greetings and alternate-greeting count separately.
- **Lorebooks:** Show attached book count, total entry count, and lorebook text tokens. Page through entries and cache each book’s result by ID so shared books are read once.
- **LumiScripts/scripts:** Count character-scoped scripts through `spindle.regex_scripts.list()` and show enabled/disabled totals and script-text tokens.
- **Expressions and embedded galleries:** Inspect the raw character `extensions` object for top-level keys classified by `lumiscript`/`regex_script`, `expression`, or `gallery`/`image` naming. Count arrays by elements, objects by properties, and non-empty scalars as one item while retaining the actual source key in the UI.
- **Stored images:** Query character-scoped assets with thumbnail specificity, count unique assets, and show thumbnails.
- **Unknown payload:** Show remaining top-level extension keys and serialized byte size so unrecognized card data is still visible rather than discarded.
- Distinguish API-backed assets from extension-embedded references and deduplicate repeated IDs/URLs.

Choose the recommended keeper using a transparent payload-first tuple:

1. Number of populated known payload categories: alternate greetings, lorebooks, scripts/LumiScripts, expressions, and gallery/stored images.
2. Total items across those categories, including lorebook entries.
3. Most recent `updated_at`.
4. Highest total accessible text-token count.
5. Most recent `created_at`.
6. Character ID as a deterministic final tie-breaker.

Show the comparison reasons rather than a mysterious numeric score. Missing optional permissions or partial enrichment make the recommendation **Provisional**. The recommendation is initially selected as the protected keeper, but the user may select a different card.

### Review and deletion UI

- Render duplicate groups with the recommended card first.
- Each card summary shows avatar, name, creator, created/updated dates, match reason/confidence, token counts, greetings, lorebooks/entries, scripts, expressions, images, extension keys, and availability/approximation warnings.
- Provide an expandable comparison showing which canonical fields are equal or different and the payload details for each card.
- Allow deletion only for cards other than the currently selected keeper.
- On deletion:
  - Send the card ID and scanned `updated_at` to the backend.
  - Re-fetch the card and abort if it is missing or has changed since the scan.
  - Show a danger confirmation containing the exact card name and ID.
  - Call only `spindle.characters.delete()`, then refresh the affected group.
- Do not separately delete attached lorebooks, images, scripts, chats, or extension metadata because those resources may be shared and their cascade behavior is not guaranteed by the public API.

## Internal Interfaces

- Frontend requests:
  - `scan_duplicates { requestId, mode, similarityThreshold }`
  - `delete_card { requestId, characterId, expectedUpdatedAt }`
- Backend responses:
  - `scan_started`, `scan_result`, `scan_error`
  - `results_stale`
  - `delete_result`
- Shared result types:
  - `DuplicateGroup`
  - `CardComparison`
  - `PayloadSummary`
  - `TokenSummary`
  - `PermissionAvailability`
- Include `requestId` in all request-bound responses so late results cannot overwrite a newer scan.
- Keep the chosen keeper and search/filter state frontend-local; no persistent settings are needed for v1.

## Test Plan

- Unit-test normalization, stable canonical serialization, exact fingerprints, trigram similarity, empty-field behavior, threshold boundaries, grouping, payload classification, and deterministic keeper ordering.
- Verify the required example: a card with ten greetings, images, and lorebooks is recommended over an older one-greeting copy with no payload.
- Test renamed exact-content copies, same-name unrelated cards, similar revisions, transitive similarity groups, identical timestamps, and deterministic ties.
- Mock paginated character, image, lorebook-entry, and script results; verify shared lorebooks are cached and candidate enrichment does not run for unique cards.
- Test missing/revoked optional permissions, token fallback, partial API failures, stale-card deletion rejection, cancelled deletion, successful deletion, and already-deleted cards.
- Run type-check, unit tests, production builds, and a manual Lumiverse install smoke test covering all three modes, responsive drawer rendering, result filtering, keeper override, confirmation, deletion, stale-event handling, and cleanup on extension disable.

## Assumptions

- Payload richness takes priority over recency; recency is the first tie-breaker after known payload breadth and quantity.
- Similar-content matching is deliberately local and deterministic—no embeddings, LLM calls, external services, or persistent index.
- V1 supports individual reviewed deletions only.
- Raw `extensions` data is schema-flexible, so named payload counts are best-effort and always accompanied by the original extension keys and generic size information.
