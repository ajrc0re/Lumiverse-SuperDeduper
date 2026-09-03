// @bun
// src/core.ts
import { createHash } from "crypto";

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

// src/core.ts
var WHITESPACE = /\s+/gu;
function normalizeName(value) {
  return value.normalize("NFKC").toLowerCase().trim().replace(WHITESPACE, " ");
}
function normalizeContent(value) {
  return value.normalize("NFKC").toLowerCase().trim().replace(WHITESPACE, " ");
}
function canonicalCoreFields(character) {
  return {
    description: normalizeContent(character.description),
    personality: normalizeContent(character.personality),
    scenario: normalizeContent(character.scenario),
    first_mes: normalizeContent(character.first_mes),
    mes_example: normalizeContent(character.mes_example),
    creator_notes: normalizeContent(character.creator_notes),
    system_prompt: normalizeContent(character.system_prompt),
    post_history_instructions: normalizeContent(character.post_history_instructions),
    creator: normalizeContent(character.creator),
    tags: [...new Set(character.tags.map(normalizeContent).filter(Boolean))].sort().join(`
`)
  };
}
function canonicalCoreText(character) {
  const fields = canonicalCoreFields(character);
  return CORE_FIELD_KEYS.map((key) => `${key}
${fields[key]}`).join(`

`);
}
function exactFingerprint(character) {
  return createHash("sha256").update(canonicalCoreText(character)).digest("hex");
}
function trigrams(value) {
  if (!value)
    return new Set;
  if (value.length < 3)
    return new Set([value]);
  const grams = new Set;
  for (let index = 0;index <= value.length - 3; index += 1) {
    grams.add(value.slice(index, index + 3));
  }
  return grams;
}
function sorensenDice(left, right) {
  if (!left && !right)
    return 0;
  if (left === right)
    return 1;
  const leftGrams = trigrams(left);
  const rightGrams = trigrams(right);
  if (leftGrams.size === 0 || rightGrams.size === 0)
    return 0;
  let intersection = 0;
  for (const gram of leftGrams) {
    if (rightGrams.has(gram))
      intersection += 1;
  }
  return 2 * intersection / (leftGrams.size + rightGrams.size);
}
function characterSimilarity(left, right) {
  const leftFields = canonicalCoreFields(left);
  const rightFields = canonicalCoreFields(right);
  let weightedScore = 0;
  let totalWeight = 0;
  for (const key of CORE_FIELD_KEYS) {
    const leftValue = leftFields[key];
    const rightValue = rightFields[key];
    if (!leftValue && !rightValue)
      continue;
    const weight = Math.max(leftValue.length, rightValue.length, 1);
    weightedScore += sorensenDice(leftValue, rightValue) * weight;
    totalWeight += weight;
  }
  return totalWeight === 0 ? 0 : weightedScore / totalWeight;
}
function canonicalSimilarity(leftFields, rightFields) {
  let weightedScore = 0;
  let totalWeight = 0;
  for (const key of CORE_FIELD_KEYS) {
    const leftValue = leftFields[key];
    const rightValue = rightFields[key];
    if (!leftValue && !rightValue)
      continue;
    const weight = Math.max(leftValue.length, rightValue.length, 1);
    weightedScore += sorensenDice(leftValue, rightValue) * weight;
    totalWeight += weight;
  }
  return totalWeight === 0 ? 0 : weightedScore / totalWeight;
}
function pairAll(ids) {
  const pairs = [];
  for (let left = 0;left < ids.length; left += 1) {
    for (let right = left + 1;right < ids.length; right += 1) {
      pairs.push({ leftId: ids[left], rightId: ids[right], similarity: 1 });
    }
  }
  return pairs;
}
function groupId(mode, ids) {
  const digest = createHash("sha256").update(ids.slice().sort().join("\x00")).digest("hex").slice(0, 12);
  return `${mode}-${digest}`;
}
function bucketGroups(characters, mode) {
  const buckets = new Map;
  for (const character of characters) {
    const key = mode === "name" ? normalizeName(character.name) : exactFingerprint(character);
    if (!key)
      continue;
    const bucket = buckets.get(key) ?? [];
    bucket.push(character);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].filter((bucket) => bucket.length > 1).map((bucket) => {
    const ids = bucket.map((character) => character.id).sort();
    return { id: groupId(mode, ids), mode, characterIds: ids, matches: pairAll(ids) };
  });
}
function findDuplicateGroups(characters, mode, similarityThreshold) {
  if (mode === "name" || mode === "exact")
    return bucketGroups(characters, mode);
  const threshold = Math.min(1, Math.max(0, similarityThreshold));
  const parent = new Map(characters.map((character) => [character.id, character.id]));
  const matches = [];
  const find = (id) => {
    const current = parent.get(id) ?? id;
    if (current === id)
      return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const join = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot)
      parent.set(rightRoot, leftRoot);
  };
  for (let left = 0;left < characters.length; left += 1) {
    for (let right = left + 1;right < characters.length; right += 1) {
      const leftCharacter = characters[left];
      const rightCharacter = characters[right];
      const similarity = characterSimilarity(leftCharacter, rightCharacter);
      if (similarity >= threshold) {
        matches.push({
          leftId: leftCharacter.id,
          rightId: rightCharacter.id,
          similarity
        });
        join(leftCharacter.id, rightCharacter.id);
      }
    }
  }
  const components = new Map;
  for (const character of characters) {
    const root = find(character.id);
    const ids = components.get(root) ?? [];
    ids.push(character.id);
    components.set(root, ids);
  }
  return [...components.values()].filter((ids) => ids.length > 1).map((ids) => {
    const sortedIds = ids.sort();
    const idSet = new Set(sortedIds);
    return {
      id: groupId(mode, sortedIds),
      mode,
      characterIds: sortedIds,
      matches: matches.filter((match) => idSet.has(match.leftId) && idSet.has(match.rightId))
    };
  });
}
async function findDuplicateGroupsAsync(characters, mode, similarityThreshold, signal, onProgress, operatedCharacterIds) {
  if (mode !== "similar") {
    const groups = findDuplicateGroups(characters, mode, similarityThreshold);
    return operatedCharacterIds ? groups.filter((group) => group.characterIds.some((id) => operatedCharacterIds.has(id))) : groups;
  }
  const threshold = Math.min(1, Math.max(0, similarityThreshold));
  const parent = new Map(characters.map((character) => [character.id, character.id]));
  const fields = characters.map(canonicalCoreFields);
  const matches = [];
  const total = characters.length * (characters.length - 1) / 2;
  let completed = 0;
  const find = (id) => {
    let root = id;
    while ((parent.get(root) ?? root) !== root)
      root = parent.get(root);
    let current = id;
    while ((parent.get(current) ?? current) !== root) {
      const next = parent.get(current);
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  for (let left = 0;left < characters.length; left += 1) {
    for (let right = left + 1;right < characters.length; right += 1) {
      if (operatedCharacterIds && !operatedCharacterIds.has(characters[left].id) && !operatedCharacterIds.has(characters[right].id))
        continue;
      if (signal?.aborted)
        throw new Error("SCAN_CANCELLED");
      const similarity = canonicalSimilarity(fields[left], fields[right]);
      if (similarity >= threshold) {
        const leftId = characters[left].id;
        const rightId = characters[right].id;
        matches.push({ leftId, rightId, similarity });
        const leftRoot = find(leftId);
        const rightRoot = find(rightId);
        if (leftRoot !== rightRoot)
          parent.set(rightRoot, leftRoot);
      }
      completed += 1;
      if (completed % 500 === 0 || completed === total) {
        onProgress?.(completed, total);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }
  const components = new Map;
  for (const character of characters) {
    const root = find(character.id);
    const ids = components.get(root) ?? [];
    ids.push(character.id);
    components.set(root, ids);
  }
  return [...components.values()].filter((ids) => ids.length > 1).map((ids) => {
    const sortedIds = ids.sort();
    const idSet = new Set(sortedIds);
    return {
      id: groupId(mode, sortedIds),
      mode,
      characterIds: sortedIds,
      matches: matches.filter((match) => idSet.has(match.leftId) && idSet.has(match.rightId))
    };
  });
}
function payloadCategory(key) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]+/gu, "_");
  if (/lumiscript|regex_script/u.test(normalized))
    return "lumiscripts";
  if (/expression/u.test(normalized))
    return "expressions";
  if (/gallery|galleries|image/u.test(normalized))
    return "gallery";
  return "other";
}
function payloadItemCount(value) {
  if (Array.isArray(value))
    return value.length;
  if (value && typeof value === "object")
    return Object.keys(value).length;
  if (typeof value === "string")
    return value.trim() ? 1 : 0;
  return value === null || value === undefined || value === false ? 0 : 1;
}
function serializedBytes(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return 0;
  }
}
function collectReferences(value) {
  const references = new Set;
  const pending = [value];
  let visited = 0;
  while (pending.length > 0 && visited < 1e4) {
    visited += 1;
    const current = pending.pop();
    if (typeof current === "string" && current.trim()) {
      references.add(current.trim());
    } else if (Array.isArray(current)) {
      pending.push(...current);
    } else if (current && typeof current === "object") {
      pending.push(...Object.values(current));
    }
  }
  return [...references];
}
function classifyExtensionPayload(extensions) {
  return Object.entries(extensions).map(([key, value]) => {
    const category = payloadCategory(key);
    return {
      key,
      category,
      count: payloadItemCount(value),
      bytes: serializedBytes(value),
      references: category === "gallery" ? collectReferences(value) : []
    };
  }).filter((entry) => entry.count > 0 || entry.bytes > 0).sort((left, right) => left.key.localeCompare(right.key));
}
function keeperTuple(card) {
  return [
    card.payload.categoryCount,
    card.payload.itemCount,
    card.updatedAt,
    card.tokens.total,
    card.createdAt,
    card.id
  ];
}
function compareKeeperCandidates(left, right) {
  const leftTuple = keeperTuple(left);
  const rightTuple = keeperTuple(right);
  for (let index = 0;index < leftTuple.length - 1; index += 1) {
    const difference = rightTuple[index] - leftTuple[index];
    if (difference !== 0)
      return difference;
  }
  return String(rightTuple[5]).localeCompare(String(leftTuple[5]));
}
function recommendationReasons(winner, runnerUp) {
  if (!runnerUp)
    return ["Only candidate in group."];
  const reasons = [];
  if (winner.payload.categoryCount !== runnerUp.payload.categoryCount) {
    reasons.push(`Payload coverage: ${winner.payload.categoryCount} categories versus ${runnerUp.payload.categoryCount}.`);
  }
  if (winner.payload.itemCount !== runnerUp.payload.itemCount) {
    reasons.push(`Payload items: ${winner.payload.itemCount} versus ${runnerUp.payload.itemCount}.`);
  }
  if (winner.updatedAt !== runnerUp.updatedAt) {
    reasons.push(winner.updatedAt > runnerUp.updatedAt ? `Updated more recently (${formatDate(winner.updatedAt)}).` : `Older update (${formatDate(winner.updatedAt)}); payload richness takes priority.`);
  }
  if (winner.tokens.total !== runnerUp.tokens.total) {
    reasons.push(`Accessible text tokens: ${winner.tokens.total} versus ${runnerUp.tokens.total}.`);
  }
  if (reasons.length === 0)
    reasons.push("Selected by the deterministic character ID tie-breaker.");
  return reasons;
}
function formatDate(epochSeconds) {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

// src/search.ts
var WHITESPACE2 = /\s+/gu;
function normalize(value) {
  return value.normalize("NFKC").toLowerCase().trim().replace(WHITESPACE2, " ");
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

// src/scanner.ts
function availability(granted) {
  return granted ? "available" : "unavailable";
}
function permissionAvailability(features) {
  return {
    characters: availability(features.characters),
    worldBooks: availability(features.worldBooks),
    images: availability(features.images),
    regexScripts: availability(features.regexScripts)
  };
}
async function listEvery(list, signal, onPage) {
  const values = [];
  const limit = 200;
  let offset = 0;
  for (;; ) {
    checkCancelled(signal);
    const page = await list({ limit, offset });
    checkCancelled(signal);
    values.push(...page.data);
    offset += page.data.length;
    onPage?.(values.length, page.total);
    if (offset >= page.total || page.data.length === 0)
      return values;
  }
}
async function listAllCharacters(api, signal, onProgress) {
  return listEvery((options) => api.listCharacters(options), signal, (current, total) => onProgress?.("collecting", current, total));
}
function checkCancelled(signal) {
  if (signal?.aborted)
    throw new Error("SCAN_CANCELLED");
}
async function countText(api, text) {
  if (!text)
    return { value: 0, approximate: false, tokenizerName: "No text" };
  try {
    const result = await api.countText(text);
    return {
      value: result.total_tokens,
      approximate: result.approximate,
      tokenizerName: result.tokenizer_name
    };
  } catch {
    return {
      value: Math.ceil(text.length / 4),
      approximate: true,
      tokenizerName: "Local characters \xF7 4 estimate"
    };
  }
}
function cardText(character) {
  return [
    character.description,
    character.personality,
    character.scenario,
    character.first_mes,
    character.mes_example,
    character.creator_notes,
    character.system_prompt,
    character.post_history_instructions,
    character.creator,
    character.tags.join(`
`),
    character.alternate_greetings.join(`

`)
  ].filter(Boolean).join(`

`);
}
function worldBookEntryText(entry) {
  return [
    entry.key.join(", "),
    entry.keysecondary.join(", "),
    entry.content,
    entry.comment,
    entry.role ?? "",
    entry.group_name
  ].filter(Boolean).join(`
`);
}
async function loadLorebook(api, id) {
  try {
    const book = await api.getWorldBook(id);
    if (!book)
      return { entries: 0, text: "", warning: `Lorebook ${id} was not found.` };
    const entries = await listEvery((options) => api.listWorldBookEntries(id, options));
    return {
      entries: entries.length,
      text: [book.name, book.description, ...entries.map(worldBookEntryText)].filter(Boolean).join(`

`),
      warning: null
    };
  } catch (error) {
    return {
      entries: 0,
      text: "",
      warning: `Could not inspect lorebook ${id}: ${errorMessage(error)}`
    };
  }
}
function scriptText(script) {
  return [
    script.name,
    script.description,
    script.folder,
    script.find_regex,
    script.replace_string,
    JSON.stringify(script.actions ?? [])
  ].filter(Boolean).join(`
`);
}
async function loadScripts(api, characterId) {
  const scripts = await listEvery((options) => api.listRegexScripts({ scope: "character", scopeId: characterId, ...options }));
  const disabled = scripts.filter((script) => script.disabled).length;
  return {
    total: scripts.length,
    enabled: scripts.length - disabled,
    disabled,
    text: scripts.map(scriptText).join(`

`)
  };
}
async function loadImages(api, characterId) {
  const images = await listEvery((options) => api.listImages({ characterId, specificity: "sm", ...options }));
  const unique = new Map;
  for (const image of images) {
    unique.set(image.id, {
      id: image.id,
      url: image.url,
      filename: image.original_filename,
      mimeType: image.mime_type,
      width: image.width,
      height: image.height
    });
  }
  return [...unique.values()];
}
async function mapConcurrent(values, concurrency, mapper, signal, onComplete) {
  const results = new Array(values.length);
  let nextIndex = 0;
  let completed = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    for (;; ) {
      checkCancelled(signal);
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length)
        return;
      results[index] = await mapper(values[index]);
      completed += 1;
      onComplete?.(completed, values.length);
    }
  });
  await Promise.all(workers);
  return results;
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function markPartial(availabilityState, key) {
  if (availabilityState[key] === "available")
    availabilityState[key] = "partial";
}
async function enrichCharacter(api, character, features, availabilityState, lorebookCache, signal) {
  checkCancelled(signal);
  const warnings = [];
  const extensionPayload = classifyExtensionPayload(character.extensions);
  const embeddedLumiScripts = extensionPayload.filter((entry) => entry.category === "lumiscripts").reduce((total, entry) => total + entry.count, 0);
  const expressions = extensionPayload.filter((entry) => entry.category === "expressions").reduce((total, entry) => total + entry.count, 0);
  const galleryEntries = extensionPayload.filter((entry) => entry.category === "gallery");
  const otherExtensionKeys = extensionPayload.filter((entry) => entry.category === "other");
  const lorebookIds = [...new Set(character.world_book_ids.filter(Boolean))];
  let lorebookEntries = features.worldBooks ? 0 : null;
  let lorebookText = "";
  if (features.worldBooks) {
    const books = await Promise.all(lorebookIds.map((id) => {
      let pending = lorebookCache.get(id);
      if (!pending) {
        pending = loadLorebook(api, id);
        lorebookCache.set(id, pending);
      }
      return pending;
    }));
    checkCancelled(signal);
    lorebookEntries = books.reduce((total, book) => total + book.entries, 0);
    lorebookText = books.map((book) => book.text).filter(Boolean).join(`

`);
    for (const book of books) {
      if (book.warning) {
        warnings.push(book.warning);
        markPartial(availabilityState, "worldBooks");
      }
    }
  }
  let scripts = null;
  if (features.regexScripts) {
    try {
      scripts = await loadScripts(api, character.id);
    } catch (error) {
      warnings.push(`Could not inspect character scripts: ${errorMessage(error)}`);
      markPartial(availabilityState, "regexScripts");
    }
  }
  checkCancelled(signal);
  let images = [];
  let storedImages = features.images ? 0 : null;
  let avatarUrl = null;
  if (features.images) {
    try {
      images = (await loadImages(api, character.id)).filter((image) => image.id !== character.image_id);
      storedImages = images.length;
      if (character.image_id)
        avatarUrl = (await api.getImage(character.image_id))?.url ?? null;
    } catch (error) {
      warnings.push(`Could not inspect character images: ${errorMessage(error)}`);
      markPartial(availabilityState, "images");
      storedImages = null;
      images = [];
    }
  }
  checkCancelled(signal);
  const storedReferences = new Set;
  for (const image of images) {
    storedReferences.add(image.id);
    storedReferences.add(image.url);
  }
  if (character.image_id)
    storedReferences.add(character.image_id);
  const allGalleryReferences = new Set(galleryEntries.flatMap((entry) => entry.references));
  const embeddedGalleryReferences = new Set([...allGalleryReferences].filter((ref) => !storedReferences.has(ref)));
  const cardTokenCount = await countText(api, cardText(character));
  const payloadTokenCount = await countText(api, [lorebookText, scripts?.text ?? ""].filter(Boolean).join(`

`));
  const alternateGreetings = character.alternate_greetings.filter((greeting) => greeting.trim().length > 0).length;
  const scriptCount = scripts?.total ?? null;
  const visibleStoredImages = storedImages ?? 0;
  const galleryItemCount = allGalleryReferences.size > 0 ? embeddedGalleryReferences.size : galleryEntries.reduce((total, entry) => total + entry.count, 0);
  const knownCategoryFlags = [
    alternateGreetings > 0,
    lorebookIds.length > 0,
    (scriptCount ?? 0) + embeddedLumiScripts > 0,
    expressions > 0,
    visibleStoredImages + galleryItemCount > 0
  ];
  const payloadItemCount2 = alternateGreetings + lorebookIds.length + (lorebookEntries ?? 0) + (scriptCount ?? 0) + embeddedLumiScripts + expressions + visibleStoredImages + galleryItemCount;
  return {
    id: character.id,
    name: character.name,
    creator: character.creator,
    tags: character.tags,
    imageId: character.image_id,
    avatarUrl,
    createdAt: character.created_at,
    updatedAt: character.updated_at,
    coreFields: canonicalCoreFields(character),
    tokens: {
      card: cardTokenCount,
      payload: payloadTokenCount,
      total: cardTokenCount.value + payloadTokenCount.value
    },
    payload: {
      greetings: (character.first_mes.trim() ? 1 : 0) + alternateGreetings,
      alternateGreetings,
      lorebooks: lorebookIds.length,
      lorebookEntries,
      scripts: scriptCount,
      enabledScripts: scripts?.enabled ?? null,
      disabledScripts: scripts?.disabled ?? null,
      embeddedLumiScripts,
      expressions,
      embeddedGalleryItems: galleryItemCount,
      storedImages,
      images,
      recognizedExtensionKeys: extensionPayload.filter((entry) => entry.category !== "other"),
      otherExtensionKeys,
      otherExtensionBytes: otherExtensionKeys.reduce((total, entry) => total + entry.bytes, 0),
      categoryCount: knownCategoryFlags.filter(Boolean).length,
      itemCount: payloadItemCount2
    },
    warnings
  };
}
async function scanDuplicates(api, features, mode, similarityThreshold, signal, onProgress, filterQuery = "") {
  if (!features.characters)
    throw new Error("PERMISSION_DENIED: characters");
  onProgress?.("collecting", 0, 0);
  const allCharacters = await listAllCharacters(api, signal, onProgress);
  checkCancelled(signal);
  const operatedCharacters = allCharacters.filter((character) => matchesWildcardSearch([character.name, character.creator, character.id, ...character.tags], filterQuery));
  const operatedCharacterIds = new Set(operatedCharacters.map((character) => character.id));
  const characters = allCharacters;
  const unfilteredCharacters = characters.length - operatedCharacters.length;
  const matchingTotal = mode === "similar" ? operatedCharacters.length * (operatedCharacters.length - 1) / 2 + operatedCharacters.length * unfilteredCharacters : operatedCharacters.length;
  onProgress?.("matching", 0, matchingTotal);
  const rawGroups = await findDuplicateGroupsAsync(characters, mode, similarityThreshold, signal, (current, total) => onProgress?.("matching", current, total), operatedCharacterIds);
  onProgress?.("matching", matchingTotal, matchingTotal);
  const duplicateIds = new Set(rawGroups.flatMap((group) => group.characterIds));
  const candidates = characters.filter((character) => duplicateIds.has(character.id));
  const availabilityState = permissionAvailability(features);
  const lorebookCache = new Map;
  onProgress?.("enriching", 0, candidates.length);
  const enriched = await mapConcurrent(candidates, 6, (character) => enrichCharacter(api, character, features, availabilityState, lorebookCache, signal), signal, (current, total) => onProgress?.("enriching", current, total));
  checkCancelled(signal);
  const cardsById = new Map(enriched.map((card) => [card.id, card]));
  const optionalUnavailable = !features.worldBooks || !features.images || !features.regexScripts;
  const groups = rawGroups.map((rawGroup) => {
    const cards = rawGroup.characterIds.map((id) => cardsById.get(id)).filter((card) => Boolean(card)).sort(compareKeeperCandidates);
    const winner = cards[0];
    const provisional = optionalUnavailable || Object.values(availabilityState).includes("partial") || cards.some((card) => card.warnings.length > 0);
    return {
      id: rawGroup.id,
      mode: rawGroup.mode,
      matches: rawGroup.matches,
      cards,
      recommendedKeeperId: winner.id,
      recommendationProvisional: provisional,
      recommendationReasons: recommendationReasons(winner, cards[1])
    };
  });
  return {
    groups,
    totalCharacters: operatedCharacters.length,
    duplicateCharacters: duplicateIds.size,
    availability: availabilityState,
    scannedAt: Math.floor(Date.now() / 1000)
  };
}

// src/deletion.ts
async function deleteCharactersSafely(api, candidates) {
  const unique = new Map(candidates.map((candidate) => [candidate.characterId, candidate]));
  const eligible = [];
  const errors = [];
  for (const candidate of unique.values()) {
    const character = await api.getCharacter(candidate.characterId);
    if (!character || character.updated_at !== candidate.expectedUpdatedAt) {
      errors.push(`${candidate.name} (${candidate.characterId}) was missing or changed.`);
    } else {
      eligible.push({ candidate, character });
    }
  }
  if (eligible.length === 0) {
    return { deleted: 0, skipped: unique.size, cancelled: false, errors };
  }
  if (!await api.confirm(eligible.map(({ character }) => character))) {
    return { deleted: 0, skipped: unique.size, cancelled: true, errors };
  }
  let deleted = 0;
  for (const { candidate } of eligible) {
    const current = await api.getCharacter(candidate.characterId);
    if (!current || current.updated_at !== candidate.expectedUpdatedAt) {
      errors.push(`${candidate.name} (${candidate.characterId}) changed during confirmation.`);
      continue;
    }
    try {
      if (await api.deleteCharacter(candidate.characterId))
        deleted += 1;
      else
        errors.push(`${candidate.name} (${candidate.characterId}) was not deleted.`);
    } catch (error) {
      errors.push(`${candidate.name} (${candidate.characterId}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { deleted, skipped: unique.size - deleted, cancelled: false, errors };
}
async function deleteCharacterSafely(api, characterId, expectedUpdatedAt) {
  const current = await api.getCharacter(characterId);
  if (!current) {
    return {
      deleted: false,
      cancelled: false,
      stale: true,
      error: "This character no longer exists. Scan again."
    };
  }
  if (current.updated_at !== expectedUpdatedAt) {
    return {
      deleted: false,
      cancelled: false,
      stale: true,
      error: "This character changed after the scan. Scan again before deleting it."
    };
  }
  if (!await api.confirm(current)) {
    return { deleted: false, cancelled: true, stale: false };
  }
  const rechecked = await api.getCharacter(characterId);
  if (!rechecked || rechecked.updated_at !== expectedUpdatedAt) {
    return {
      deleted: false,
      cancelled: false,
      stale: true,
      error: "This character changed while confirmation was open. Nothing was deleted."
    };
  }
  const deleted = await api.deleteCharacter(characterId);
  return {
    deleted,
    cancelled: false,
    stale: !deleted,
    ...deleted ? {} : { error: "Lumiverse did not delete the character." }
  };
}

// src/backend.ts
var activeScans = new Map;
function scanOwnerKey(userId) {
  return userId ?? "__extension_owner__";
}
function grantedFeatures() {
  return {
    characters: spindle.permissions.has("characters"),
    worldBooks: spindle.permissions.has("world_books"),
    images: spindle.permissions.has("images"),
    regexScripts: spindle.permissions.has("regex_scripts")
  };
}
function scannerApiFor(userId) {
  return {
    listCharacters: async (options) => await spindle.characters.list({ ...options, ...userId ? { userId } : {} }),
    countText: (text) => spindle.tokens.countText(text, { modelSource: "main", ...userId ? { userId } : {} }),
    getWorldBook: (id) => spindle.world_books.get(id, userId),
    listWorldBookEntries: (worldBookId, options) => spindle.world_books.entries.list(worldBookId, { ...options, ...userId ? { userId } : {} }),
    listRegexScripts: (options) => spindle.regex_scripts.list({ ...options, ...userId ? { userId } : {} }),
    listImages: (options) => spindle.images.list({ ...options, ...userId ? { userId } : {} }),
    getImage: (id) => spindle.images.get(id, { specificity: "sm", ...userId ? { userId } : {} })
  };
}
function send(payload, userId) {
  spindle.sendToFrontend(payload, userId);
}
function isMatchMode(value) {
  return value === "name" || value === "exact" || value === "similar";
}
function isFrontendRequest(payload) {
  if (!payload || typeof payload !== "object" || !("type" in payload))
    return false;
  const type = payload.type;
  if (type === "get_status")
    return true;
  if (type === "scan_duplicates") {
    const request = payload;
    return typeof request.requestId === "string" && isMatchMode(request.mode) && (request.filterQuery === undefined || typeof request.filterQuery === "string");
  }
  if (type === "cancel_scan") {
    const request = payload;
    return typeof request.requestId === "string";
  }
  if (type === "delete_card") {
    const request = payload;
    return typeof request.requestId === "string" && typeof request.characterId === "string" && typeof request.expectedUpdatedAt === "number";
  }
  if (type === "delete_duplicates") {
    const request = payload;
    return typeof request.requestId === "string" && typeof request.groupCount === "number" && Array.isArray(request.cards) && request.cards.length > 0 && request.cards.every((card) => card && typeof card.characterId === "string" && typeof card.expectedUpdatedAt === "number" && typeof card.name === "string");
  }
  return false;
}
function errorMessage2(error) {
  return error instanceof Error ? error.message : String(error);
}
async function handleScan(request, userId) {
  const ownerKey = scanOwnerKey(userId);
  if (activeScans.has(ownerKey)) {
    send({ type: "scan_error", requestId: request.requestId, error: "A scan is already running for this user.", permissionDenied: false }, userId);
    return;
  }
  const controller = new AbortController;
  activeScans.set(ownerKey, { requestId: request.requestId, controller });
  send({ type: "scan_started", requestId: request.requestId }, userId);
  try {
    const threshold = Number.isFinite(request.similarityThreshold) ? Math.min(1, Math.max(0.75, request.similarityThreshold)) : 0.9;
    const result = await scanDuplicates(scannerApiFor(userId), grantedFeatures(), request.mode, threshold, controller.signal, (phase, current, total) => {
      if (!controller.signal.aborted) {
        send({ type: "scan_progress", requestId: request.requestId, phase, current, total }, userId);
      }
    }, request.filterQuery ?? "");
    if (controller.signal.aborted)
      return;
    send({ type: "scan_result", requestId: request.requestId, result }, userId);
  } catch (error) {
    if (controller.signal.aborted || errorMessage2(error) === "SCAN_CANCELLED")
      return;
    const message = errorMessage2(error);
    send({
      type: "scan_error",
      requestId: request.requestId,
      error: message,
      permissionDenied: message.startsWith("PERMISSION_DENIED:")
    }, userId);
  } finally {
    const active = activeScans.get(ownerKey);
    if (active?.requestId === request.requestId)
      activeScans.delete(ownerKey);
  }
}
async function handleCancelScan(request, userId) {
  const ownerKey = scanOwnerKey(userId);
  const active = activeScans.get(ownerKey);
  if (!active || active.requestId !== request.requestId) {
    send({ type: "scan_cancel_result", requestId: request.requestId, cancelled: false, error: "The scan is no longer running." }, userId);
    return;
  }
  try {
    const confirmation = await spindle.modal.confirm({
      title: "Stop duplicate scan?",
      message: "Stop the current scan and discard any results it has produced?",
      variant: "danger",
      confirmLabel: "Stop search",
      cancelLabel: "Continue scanning",
      ...userId ? { userId } : {}
    });
    if (!confirmation.confirmed) {
      send({ type: "scan_cancel_result", requestId: request.requestId, cancelled: false }, userId);
      return;
    }
    const current = activeScans.get(ownerKey);
    if (!current || current.requestId !== request.requestId) {
      send({ type: "scan_cancel_result", requestId: request.requestId, cancelled: false, error: "The scan finished before it could be stopped." }, userId);
      return;
    }
    current.controller.abort();
    activeScans.delete(ownerKey);
    send({ type: "scan_cancel_result", requestId: request.requestId, cancelled: true }, userId);
  } catch (error) {
    send({ type: "scan_cancel_result", requestId: request.requestId, cancelled: false, error: errorMessage2(error) }, userId);
  }
}
async function handleDelete(request, userId) {
  const reply = (result) => {
    send({
      type: "delete_result",
      requestId: request.requestId,
      characterId: request.characterId,
      ...result
    }, userId);
  };
  try {
    if (!spindle.permissions.has("characters")) {
      reply({
        deleted: false,
        cancelled: false,
        stale: false,
        error: "The characters permission is required."
      });
      return;
    }
    const result = await deleteCharacterSafely({
      getCharacter: async (id) => await spindle.characters.get(id, userId),
      deleteCharacter: (id) => spindle.characters.delete(id, userId),
      confirm: async (character) => {
        const confirmation = await spindle.modal.confirm({
          title: "Delete duplicate character?",
          message: `Permanently delete \u201C${character.name}\u201D (${character.id})? Attached resources will not be deleted separately.`,
          variant: "danger",
          confirmLabel: "Delete character",
          cancelLabel: "Cancel",
          ...userId ? { userId } : {}
        });
        return confirmation.confirmed;
      }
    }, request.characterId, request.expectedUpdatedAt);
    reply(result);
    if (result.deleted)
      send({ type: "results_stale", reason: "A character was deleted." }, userId);
  } catch (error) {
    reply({
      deleted: false,
      cancelled: false,
      stale: false,
      error: errorMessage2(error)
    });
  }
}
async function handleBulkDelete(request, userId) {
  const reply = (result) => {
    send({ type: "bulk_delete_result", requestId: request.requestId, ...result }, userId);
  };
  try {
    if (!spindle.permissions.has("characters")) {
      reply({ deleted: 0, skipped: request.cards.length, cancelled: false, errors: ["The characters permission is required."] });
      return;
    }
    const result = await deleteCharactersSafely({
      getCharacter: async (id) => await spindle.characters.get(id, userId),
      deleteCharacter: (id) => spindle.characters.delete(id, userId),
      confirm: async (characters) => {
        const names = characters.slice(0, 12).map((character) => `\u2022 ${character.name} (${character.id})`);
        const remainder = characters.length > names.length ? `
\u2026and ${characters.length - names.length} more.` : "";
        const confirmation = await spindle.modal.confirm({
          title: `Delete ${characters.length} non-keeper duplicates?`,
          message: `Permanently delete ${characters.length} cards from ${request.groupCount} duplicate groups? Your selected protected keeper in every group will be retained.

${names.join(`
`)}${remainder}

Attached resources will not be deleted separately.`,
          variant: "danger",
          confirmLabel: `Delete ${characters.length} cards`,
          cancelLabel: "Cancel",
          ...userId ? { userId } : {}
        });
        return confirmation.confirmed;
      }
    }, request.cards);
    reply(result);
    if (result.deleted > 0)
      send({ type: "results_stale", reason: `${result.deleted} duplicate cards were deleted.` }, userId);
  } catch (error) {
    reply({ deleted: 0, skipped: request.cards.length, cancelled: false, errors: [errorMessage2(error)] });
  }
}
spindle.onFrontendMessage((payload, userId) => {
  if (!isFrontendRequest(payload))
    return;
  if (payload.type === "get_status") {
    send({ type: "status_result", availability: permissionAvailability(grantedFeatures()) }, userId);
  } else if (payload.type === "scan_duplicates") {
    handleScan(payload, userId);
  } else if (payload.type === "cancel_scan") {
    handleCancelScan(payload, userId);
  } else if (payload.type === "delete_card") {
    handleDelete(payload, userId);
  } else {
    handleBulkDelete(payload, userId);
  }
});
var staleEvents = [
  "CHARACTER_EDITED",
  "CHARACTER_DELETED",
  "CHARACTER_DUPLICATED",
  "CHARACTER_AVATAR_CHANGED",
  "IMAGE_UPLOADED",
  "IMAGE_DELETED",
  "EXPRESSION_CHANGED"
];
for (const event of staleEvents) {
  spindle.on(event, (_payload, userId) => {
    send({ type: "results_stale", reason: "Character data changed after the last scan." }, userId);
  });
}
if (spindle.permissions.has("regex_scripts")) {
  spindle.on("REGEX_SCRIPT_CHANGED", (_payload, userId) => {
    send({ type: "results_stale", reason: "Character script data changed after the last scan." }, userId);
  });
  spindle.on("REGEX_SCRIPT_DELETED", (_payload, userId) => {
    send({ type: "results_stale", reason: "Character script data changed after the last scan." }, userId);
  });
}
spindle.permissions.onChanged(() => {
  send({ type: "status_result", availability: permissionAvailability(grantedFeatures()) });
  send({ type: "results_stale", reason: "Extension permissions changed after the last scan." });
});
spindle.log.info("Lumiverse SuperDeduper loaded.");
