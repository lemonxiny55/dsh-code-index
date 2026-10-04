import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { tools } from '../src/tools.js'

describe('matched DSH RC native runtime', () => {
  it('registers and dispatches plugin tools through the real RC pipeline', async () => {
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
    } finally {
      for (const dispose of disposers.reverse()) dispose()
      await ctx.fiber.dispose()
    }
  })
})
