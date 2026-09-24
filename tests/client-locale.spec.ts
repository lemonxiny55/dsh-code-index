import { describe, expect, it } from 'vitest'
import { apply as applyClient, SETTINGS_EN, SETTINGS_ZH } from '../src/client/index.js'

describe('settings card locales', () => {
  it('ships matching English and Chinese keys with no blank translations', () => {
    expect(Object.keys(SETTINGS_ZH).sort()).toEqual(Object.keys(SETTINGS_EN).sort())
    for (const locale of [SETTINGS_ZH, SETTINGS_EN]) {
      for (const [key, value] of Object.entries(locale)) {
        expect(value.trim(), `${key} should have a translation`).not.toBe('')
      }
    }
    expect(Object.values(SETTINGS_EN).join('')).not.toMatch(/[\u3400-\u9fff]/)
  })

  it('works without a locale service and disposes registrations across reloads', () => {
    const mount = (activeLocale?: 'zh' | 'en') => {
      const registered: Array<{ entry: Record<string, unknown>; component: unknown }> = []
      const disposers: Array<() => void> = []
      let activeLocaleRegistrations = 0
      const locale = activeLocale ? {
        register(_namespace: string, dictionaries: { zh: Record<string, string>; en: Record<string, string> }) {
          expect(dictionaries[activeLocale].description).toBeTruthy()
          activeLocaleRegistrations += 1
          return () => { activeLocaleRegistrations -= 1 }
        },
      } : undefined
      const form = { getSnapshot: () => ({ status: 'unavailable' as const, value: undefined, writable: false }), subscribe: () => () => {}, set: async () => {}, unset: async () => {} }
      const ctx = {
        effect(effect: () => (() => void) | void) {
          const dispose = effect()
          if (dispose) disposers.push(dispose)
        },
        slots: {
          inject(_name: string, run: () => Iterable<unknown>) {
            for (const _value of run()) { /* registration is recorded by slots.register */ }
          },
          register(entry: Record<string, unknown>, component: unknown) {
            registered.push({ entry, component })
            return () => {}
          },
        },
        inject(dependencies: string[], callback: (ctx: Parameters<typeof applyClient>[0]) => void) {
          if (dependencies.includes('locale')) callback({ ...ctx, ...(locale ? { locale } : {}) } as Parameters<typeof applyClient>[0])
          if (dependencies.includes('configForms')) callback({ ...ctx, configForms: { get: () => form } } as Parameters<typeof applyClient>[0])
          if (dependencies.includes('settingsScope')) callback({ ...ctx, settingsScope: { bind: () => form } } as Parameters<typeof applyClient>[0])
        },
      }
      applyClient(ctx)
      return { registered, disposers, activeLocaleRegistrations: () => activeLocaleRegistrations }
    }

    const noLocale = mount()
    expect(noLocale.registered.some(({ entry }) => entry.id === 'code-index')).toBe(true)
    expect(noLocale.registered.some(({ entry }) => entry.key === 'code-index')).toBe(true)
    const first = mount('zh')
    const firstCard = first.registered.find(({ entry }) => entry.name === 'settings.plugins.tab')!
    expect(firstCard.entry.locale).toBe('settings.codeIndex')
    const firstScope = (firstCard.entry.inject as () => { scope: unknown })().scope
    for (const dispose of first.disposers) dispose()
    expect(first.activeLocaleRegistrations()).toBe(0)

    const second = mount('en')
    const secondCard = second.registered.find(({ entry }) => entry.name === 'settings.plugins.tab')!
    const secondScope = (secondCard.entry.inject as () => { scope: unknown })().scope
    expect(secondScope).not.toBe(firstScope)
    for (const dispose of second.disposers) dispose()
    expect(second.activeLocaleRegistrations()).toBe(0)
  })
})
