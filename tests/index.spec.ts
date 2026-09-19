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
    expect(first.registered).toEqual([
      'code_index',
      'code_symbols',
      'code_search',
      'code_map',
      'code_refs',
      'code_change_context',
      'code_context',
    ])
    first.dispose()
    expect(first.disposedTools()).toBe(7)
    expect(first.disposedSections()).toBe(1)

    const second = mount()
    expect(second.registered).toEqual([
      'code_index',
      'code_symbols',
      'code_search',
      'code_map',
      'code_refs',
      'code_change_context',
      'code_context',
    ])
    second.dispose()
  })

  it('supports the optional compact tool surface without changing full defaults', () => {
    const registered: string[] = []
    let disposeEffect: (() => void) | undefined
    const ctx = {
      effect(fn: () => void | (() => void)) { disposeEffect = fn() ?? undefined },
      tools: {
        register(tool: { name: string }) {
          registered.push(tool.name)
          return () => {}
        },
      },
      systemPrompt: { section() { return () => {} } },
    }
    apply(ctx, { toolSurface: 'compact', codeHealth: true, autoInject: false })
    expect(registered).toEqual(['code_index', 'code_context', 'code_health'])
    disposeEffect?.()
  })
})
