// Temporary acceptance entry, runs INSIDE the user's actual Desktop Host.
// Does not register tools or invoke a model; all results come from ctx.tools.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
const out = import.meta.dirname
export const name = 'v012-desktop-acceptance'
export const inject = ['tools', 'sessions', 'sessionPersistence']
export function apply(ctx) {
  const timer = setTimeout(async () => {
    const record = { method: 'actual running Desktop Host ctx.tools API, no model request', node: process.version, pid: process.pid, started: new Date().toISOString(), results: [] }
    const save = () => writeFileSync(path.join(out, 'desktop-results.json'), JSON.stringify(record, null, 2))
    try {
      const host = JSON.parse(readFileSync(path.join(out, 'host-results.json'), 'utf8'))
      const invoke = async (name, args = {}, root = host.repos.a) => {
        const callId = `desktop-rc:${record.results.length}`, arguments_ = { ...args, repoRoot: root }
        const batch = await ctx.tools.execute({ calls: [{ type: 'tool-call', id: callId, name, arguments: JSON.stringify(arguments_) }], signal: new AbortController().signal })
        assert.equal(batch.results.length, 1)
        const result = batch.results[0].result
        assert.equal(result.isError, false, JSON.stringify(result)); record.results.push({ callId, name, arguments: arguments_, result }); return result
      }
      record.names = ctx.tools.schemas().map(t => t.name).filter(n => n.startsWith('code_')).sort()
      record.candidateLoad = JSON.parse(readFileSync(path.join(out, 'desktop-candidate-load.json'), 'utf8'))
      assert.equal(record.names.length, 8)
      for (const [name, args] of [['code_index', { action: 'build' }], ['code_symbols', {}], ['code_search', { query: 'normalize' }], ['code_map', {}], ['code_refs', { symbol: 'lonelyMarker' }], ['code_health', {}]]) await invoke(name, args)
      for (const budgetChars of [300, 500, 5000]) for (const outputFormat of ['text', 'pack']) {
        const r = await invoke('code_context', { task: '理解 lonelyMarker 的实现和静态调用者', budgetChars, outputFormat })
        assert.ok((outputFormat === 'pack' ? JSON.stringify(r.value) : r.value).length <= budgetChars)
        if (outputFormat === 'pack' && budgetChars === 5000) { assert.equal(r.value.evidence.scope, 'indexed-static-only'); assert.equal(r.value.evidence.tests.verification, 'not-run'); assert.ok(r.value.evidence.callers.zero.length) }
      }
      await invoke('code_change_context')
      const xray = await invoke('code_change_context', { outputFormat: 'xray' })
      assert.equal(xray.meta.evidence.scope, 'indexed-static-only'); assert.equal(xray.meta.evidence.tests.verification, 'not-run')
      for (const resolution of ['exact', 'import-scoped', 'name-only']) assert.ok(xray.meta.edges.some(e => e.resolution === resolution))
      assert.equal((await invoke('code_search', { query: 'B_ONLY_MARKER' }, host.repos.b)).value[0].name, 'B_ONLY_MARKER')
      assert.deepEqual((await invoke('code_search', { query: 'B_ONLY_MARKER' })).value, [])
      assert.equal((await invoke('code_search', { query: 'WORKTREE_ONLY_MARKER' }, host.repos.wt)).value[0].name, 'WORKTREE_ONLY_MARKER')
      assert.deepEqual((await invoke('code_search', { query: 'WORKTREE_ONLY_MARKER' }, host.repos.b)).value, [])
      await invoke('code_change_context', {}, host.repos.wt)
      const { execFileSync } = await import('node:child_process')
      const external = path.join(host.repos.b, 'desktop-external.ts')
      const externalNode = 'C:/Users/18439/AppData/Local/Programs/node-v24.19.0/node.exe'
      for (const marker of ['DESKTOP_EXTERNAL_ONE', 'DESKTOP_EXTERNAL_TWO']) {
        execFileSync(externalNode, ['-e', 'require("fs").writeFileSync(process.argv[1],process.argv[2])', external, `export function ${marker}() { return 4 }\n`], { windowsHide: true })
        assert.equal((await invoke('code_search', { query: marker }, host.repos.b)).value[0].name, marker)
      }
      execFileSync(externalNode, ['-e', 'require("fs").unlinkSync(process.argv[1])', external], { windowsHide: true })
      assert.deepEqual((await invoke('code_search', { query: 'DESKTOP_EXTERNAL_TWO' }, host.repos.b)).value, [])
      const load = createRequire('E:/DeepSeek Harness/resources/app.asar/dsh/package.json')
      record.runtime = load('@deepseek-ai/dsh/package.json').version
      const { createUserMessage, createAssistantMessage, createToolResultMessage } = load('@deepseek-ai/dsh-llm')
      const session = ctx.sessions.create(randomUUID(), { meta: { cwd: host.repos.a } })
      session.append('turn/start', { turn: 1 })
      session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'v0.12 RC Desktop 验收：真实桌面 Host 工具结果回放（非模型 Agent）。候选 tarball 0.12.0-rc.0。' }] }), { surfaceOp: 'append' })
      session.append('step/start', { turn: 1, step: 1 })
      const shown = [record.results[2], record.results[4], ...record.results.filter(r => r.name === 'code_context' && r.arguments.budgetChars === 5000), record.results.find(r => r.name === 'code_change_context' && r.arguments.outputFormat === 'xray')]
      session.append('assistant/message', { turn: 1, step: 1, message: createAssistantMessage({ source: { provider: 'desktop-host-acceptance', model: 'none' }, content: shown.map(r => ({ type: 'tool-call', id: r.callId, name: r.name, arguments: JSON.stringify(r.arguments) })) }), stream: [] }, { surfaceOp: 'append' })
      for (const r of shown) { session.append('tool/call', { turn: 1, step: 1, callId: r.callId, name: r.name, arguments: JSON.stringify(r.arguments) }); session.append('tool/result', { turn: 1, step: 1, message: createToolResultMessage({ callId: r.callId, content: r.result.content, isError: false }), ...(r.result.meta ? { meta: r.result.meta } : {}) }, { surfaceOp: 'append' }) }
      session.append('step/end', { turn: 1, step: 1 }); session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      const stored = await ctx.sessionPersistence.create(session.header); await stored.append(session.snapshotEvents()); await stored.flush(); await stored.close()
      record.sessionId = session.id; record.status = 'PASS'; save()
    } catch (error) { record.status = 'FAIL'; record.error = { name: error.name, message: error.message, stack: error.stack,
      ...(error.cause ? { cause: { name: error.cause.name, message: error.cause.message, stack: error.cause.stack } } : {}) }; save() }
  }, 1000)
  ctx.effect(() => () => clearTimeout(timer))
}
