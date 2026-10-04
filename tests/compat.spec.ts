import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { tools } from '../src/tools.js'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

describe('matched DSH RC native runtime', () => {
  it('registers and dispatches plugin tools through the real RC pipeline', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cix-rc-'))
    await mkdir(path.join(root, '.git'))
    await writeFile(path.join(root, 'core.ts'), 'export function rcMarker() { return 9 }\n')
    const ctx = new Context()
    ctx.provide('systemPrompt', { tools: () => () => {}, section: () => () => {} })
    const runtime = new ToolRuntime(ctx)
    const disposers = tools.map(tool => runtime.register(tool))
    try {
      const result = await runtime.execute({
        callId: 'compat:1' as never, name: 'code_context',
        arguments: { task: '' }, signal: new AbortController().signal,
      })
      expect(result.isError).toBe(false) // legacy tool-owned error text
      expect(result.content).toEqual([{ type: 'text', text: 'code_context: task must be a non-empty string' }])
      const invalid = await runtime.execute({
        callId: 'compat:2' as never, name: 'code_context',
        arguments: { task: 42 }, signal: new AbortController().signal,
      })
      expect(invalid.isError).toBe(true)
      for (const outputFormat of ['text', 'pack']) {
        const result = await runtime.execute({
          callId: `compat:${outputFormat}` as never, name: 'code_context',
          arguments: { task: 'Explain rcMarker', repoRoot: root, outputFormat, budgetChars: 2000 },
          signal: new AbortController().signal,
        })
        expect(result.isError).toBe(false)
        expect(result.content).toContainEqual(expect.objectContaining({ type: 'text', text: expect.stringContaining('return 9') }))
        if (result.isError) throw new Error('RC tool execution failed')
        expect(JSON.stringify(result.value)).toContain('rcMarker')
        expect(typeof result.value).toBe(outputFormat === 'pack' ? 'object' : 'string')
      }
    } finally {
      for (const dispose of disposers.reverse()) dispose()
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
})
