import { describe, expect, test } from 'bun:test'

import { createUuidV4Generator, fallbackUuidV4 } from '../src/uuid'

const V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('uuid helpers', () => {
  test('fallback produces unique RFC 4122 v4 strings', () => {
    const values = new Set(Array.from({ length: 200 }, () => fallbackUuidV4()))
    expect(values.size).toBe(200)
    for (const value of values) expect(value).toMatch(V4_PATTERN)
  })

  test('prefers ctx.uuid.v4 when the host provides it', () => {
    let calls = 0
    const ctx = { uuid: { v4() { calls++; return 'host-id' }, v7: () => 'ordered' } }
    expect(createUuidV4Generator(ctx)()).toBe('host-id')
    expect(calls).toBe(1)
  })

  test('falls back on older hosts without ctx.uuid', () => {
    expect(createUuidV4Generator({})()).toMatch(V4_PATTERN)
  })

  test('falls back when the host helper throws for an unloaded context', () => {
    const ctx = { uuid: { v4: () => { throw new Error('inactive context') } } }
    expect(createUuidV4Generator(ctx)()).toMatch(V4_PATTERN)
  })
})
