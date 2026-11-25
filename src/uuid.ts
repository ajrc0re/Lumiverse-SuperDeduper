/** Minimal shape of the host's `ctx.uuid` helper (`frontend-uuid-v1`). */
export interface UuidProvider {
  v4?: () => string
  v7?: () => string
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < length; index++) bytes[index] = Math.floor(Math.random() * 256)
  }
  return bytes
}

/**
 * RFC 4122 version 4 UUID built from `crypto.getRandomValues()`, which stays
 * available on insecure HTTP/LAN origins. Used only when the host predates
 * `ctx.uuid`.
 */
export function fallbackUuidV4(): string {
  const bytes = randomBytes(16)
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Returns a v4 UUID generator that prefers the host's `ctx.uuid.v4()` and
 * falls back to {@link fallbackUuidV4} on older Lumiverse hosts or when the
 * host helper throws (for example after the frontend context is unloaded).
 */
export function createUuidV4Generator(ctx: object): () => string {
  const uuid = (ctx as { uuid?: UuidProvider }).uuid
  return () => {
    if (uuid && typeof uuid.v4 === 'function') {
      try {
        const value = uuid.v4()
        if (typeof value === 'string' && value) return value
      } catch {
        // Inactive or unloaded context: use the local generator instead.
      }
    }
    return fallbackUuidV4()
  }
}
