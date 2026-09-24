import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { apply } from '../src/index.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

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

  it('injects a repo map for the active project context without crossing A and B', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const a = await mkdtemp(path.join(os.tmpdir(), 'dsh-code-index-prompt-a-'))
    const b = await mkdtemp(path.join(os.tmpdir(), 'dsh-code-index-prompt-b-'))
    roots.push(a, b)
    for (const root of [a, b]) {
      await mkdir(path.join(root, '.git'))
      await mkdir(path.join(root, 'src'))
    }
    await writeFile(path.join(a, 'src/a.ts'), 'export function projectAlpha() { return 1 }\n')
    await writeFile(path.join(b, 'src/b.ts'), 'export function projectBeta() { return 2 }\n')

    let disposeEffect: (() => void) | undefined
    let promptText: ((context: unknown) => string) | undefined
    const ctx = {
      effect(fn: () => void | (() => void)) { disposeEffect = fn() ?? undefined },
      tools: { register() { return () => {} } },
      systemPrompt: { section(value: { text: string | ((context: unknown) => string) }) {
        if (typeof value.text === 'function') promptText = value.text
        return () => {}
      } },
    }
    apply(ctx, { externalWatch: false })
    const render = (cwd: string): string => promptText!({ agent: { session: { header: { cwd } } } })
    try {
      await vi.waitFor(() => expect(render(a)).toContain('projectAlpha'), { timeout: 5_000 })
      await vi.waitFor(() => expect(render(b)).toContain('projectBeta'), { timeout: 5_000 })
      expect(render(a)).not.toContain('projectBeta')
      expect(render(b)).not.toContain('projectAlpha')
      expect(render(a)).toContain('projectAlpha')
    } finally {
      disposeEffect?.()
    }
  })
})
