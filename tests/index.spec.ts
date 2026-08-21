import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../src/index.js'

describe('plugin lifecycle', () => {
  afterEach(() => vi.restoreAllMocks())

  it('disposes every registration and can mount again', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    function mount() {
      const registered: string[] = []
      let disposedTools = 0
      let disposedSections = 0
      let disposeEffect: (() => void) | undefined
      const ctx = {
        effect(fn: () => void | (() => void)) { disposeEffect = fn() ?? undefined },
        tools: {
          register(tool: { name: string }) {
            registered.push(tool.name)
            return () => { disposedTools++ }
          },
        },
        systemPrompt: {
          section() { return () => { disposedSections++ } },
        },
      }
      apply(ctx)
      return {
        registered,
        dispose: () => disposeEffect?.(),
        disposedTools: () => disposedTools,
        disposedSections: () => disposedSections,
      }
    }

    const first = mount()
    expect(first.registered).toEqual(['code_index', 'code_symbols', 'code_search', 'code_map'])
    first.dispose()
    expect(first.disposedTools()).toBe(4)
    expect(first.disposedSections()).toBe(1)

    const second = mount()
    expect(second.registered).toEqual(['code_index', 'code_symbols', 'code_search', 'code_map'])
    second.dispose()
  })
})
