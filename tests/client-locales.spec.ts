import { describe, expect, it } from 'vitest'
import { en, zh } from '../src/client/locales.js'
import { apply } from '../src/client/index.js'

// Loose structural fake of the client context; apply() only reads what it uses.
type FakeContext = Record<string, any>

describe('client locales', () => {
  it('en translates every zh key', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
    for (const [key, value] of Object.entries(en)) {
      expect(value, key).not.toBe('')
      expect(value, key).not.toMatch(/\p{Script=Han}/u)
    }
  })

  it('registers both dictionaries and tags the settings card with its namespace', () => {
    const registered: Array<{ namespace: string; dictionaries: unknown }> = []
    const entries: Array<Record<string, unknown>> = []
    const cleanups: Array<() => void> = []
    let unregistered = false

    const ctx: FakeContext = {
      slots: {
        inject: (_name: string, run: () => Iterable<unknown>) => { for (const _ of run()) { /* drain */ } },
        register: (entry: Record<string, unknown>) => { entries.push(entry); return () => {} },
      },
      inject: (_deps: string[], run: (scoped: FakeContext) => void) => run(ctx),
      effect: (run: () => () => void) => { cleanups.push(run()) },
      settingsScope: {
        bind: () => ({
          getSnapshot: () => ({ status: 'ready' as const, value: {}, writable: true }),
          subscribe: () => () => {},
          set: async () => {},
          unset: async () => {},
        }),
      },
      locale: {
        register: (namespace: string, dictionaries: Record<string, Record<string, string>>) => {
          registered.push({ namespace, dictionaries })
          return () => { unregistered = true }
        },
        bind: () => (key: string) => (en as Record<string, string>)[key] ?? key,
      },
    }

    apply(ctx as never)

    expect(registered).toEqual([{ namespace: 'code-index', dictionaries: { zh, en } }])
    const card = entries.find((entry) => entry.name === 'settings.plugin.item')
    expect(card).toMatchObject({ key: 'code-index', locale: 'code-index' })

    for (const cleanup of cleanups) cleanup()
    expect(unregistered).toBe(true)
  })

  it('still registers the settings card without a locale service', () => {
    const entries: Array<Record<string, unknown>> = []
    const ctx: FakeContext = {
      slots: {
        inject: (_name: string, run: () => Iterable<unknown>) => { for (const _ of run()) { /* drain */ } },
        register: (entry: Record<string, unknown>) => { entries.push(entry); return () => {} },
      },
      inject: (_deps: string[], run: (scoped: FakeContext) => void) => run(ctx),
      settingsScope: {
        bind: () => ({
          getSnapshot: () => ({ status: 'ready' as const, value: {}, writable: true }),
          subscribe: () => () => {},
          set: async () => {},
          unset: async () => {},
        }),
      },
    }
    expect(() => apply(ctx as never)).not.toThrow()
    expect(entries.some((entry) => entry.name === 'settings.plugin.item')).toBe(true)
  })
})
