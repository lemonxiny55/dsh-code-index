// Runs inside the genuine Desktop host. The transcript is an explicit Host API
// replay for UI inspection, never a model-generated Agent conversation.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
const out = import.meta.dirname
const host = path.resolve(out, '../../../node_modules/.m0-host')
const load = createRequire(path.join(host, 'package.json'))
const { createUserMessage, createAssistantMessage, createToolResultMessage } = load('@deepseek-ai/dsh-llm')
export const inject = ['tools', 'sessions', 'sessionPersistence', 'webServer']
export async function apply(ctx) {
  try {
    for (let n = 0; n < 100 && ctx.tools.schemas().filter(t => t.name.startsWith('code_')).length < 8; n++) await new Promise(r => setTimeout(r, 100))
    const native = JSON.parse(readFileSync(path.join(out, 'm0-native-results.json'), 'utf8'))
    const names = ctx.tools.schemas().map(t => t.name).filter(n => n.startsWith('code_')).sort()
    assert.equal(names.length, 8)
    const results = []
    for (const [name, args] of [['code_context', { task: '理解 ALPHA_MARKER 实现', outputFormat: 'pack' }], ['code_change_context', {}], ['code_change_context', { outputFormat: 'xray' }]]) {
      const callId = `desktop:${results.length}`
      const arguments_ = { ...args, repoRoot: native.repos.a }
      const batch = await ctx.tools.execute({ calls: [{ type: 'tool-call', id: callId, name, arguments: JSON.stringify(arguments_) }], signal: new AbortController().signal })
      const result = batch.results[0].result
      assert.equal(result.isError, false); results.push({ callId, name, arguments: arguments_, result })
    }
    assert.ok(JSON.stringify(results[0]).includes('return 43'))
    assert.equal(results[2].result.meta.card, 'impact-xray')
    const session = ctx.sessions.create(randomUUID(), { meta: { cwd: native.repos.a } })
    session.append('turn/start', { turn: 1 })
    session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'v0.13 M0 / v0.12.0 + rc.3 Desktop Host API replay. No model call. Inspect Context Pack source, change text and X-Ray.' }] }), { surfaceOp: 'append' })
    session.append('step/start', { turn: 1, step: 1 })
    session.append('assistant/message', { turn: 1, step: 1, message: createAssistantMessage({ source: { provider: 'host-api-verification', model: 'none' }, content: results.map(r => ({ type: 'tool-call', id: r.callId, name: r.name, arguments: JSON.stringify(r.arguments) })) }), stream: [] }, { surfaceOp: 'append' })
    for (const r of results) {
      session.append('tool/call', { turn: 1, step: 1, callId: r.callId, name: r.name, arguments: JSON.stringify(r.arguments) })
      session.append('tool/result', { turn: 1, step: 1, message: createToolResultMessage({ callId: r.callId, content: r.result.content, isError: false }), ...(r.result.meta ? { meta: r.result.meta } : {}) }, { surfaceOp: 'append' })
    }
    session.append('step/end', { turn: 1, step: 1 }); session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    const stored = await ctx.sessionPersistence.create(session.header); await stored.append(session.snapshotEvents()); await stored.flush(); await stored.close()
    writeFileSync(path.join(out, 'm0-desktop-host-results.json'), JSON.stringify({ status: 'PASS', method: 'real Desktop host API; synthetic transcript for subsequent UI inspection', pid: process.pid, node: process.version, clientVersion: process.env.DSH_CLIENT_VERSION, sessionId: session.id, origin: ctx.webServer.getOrigin(), names, results }, null, 2))
  } catch (error) { writeFileSync(path.join(out, 'm0-desktop-host-results.json'), JSON.stringify({ status: 'FAIL', error: String(error), stack: error.stack }, null, 2)) }
}
