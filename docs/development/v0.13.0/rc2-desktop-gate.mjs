// Existing Desktop Inspector, scoped actual plugin lifecycle, synthetic data only.
// UI transcript is explicitly a Host API replay, never a model success claim.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const fixture = JSON.parse(readFileSync('node_modules/.m2-demo/manifest.json', 'utf8'))
const entry = pathToFileURL(path.resolve('node_modules/.rc2-consumer24/node_modules/dsh-code-index/dist/index.js')).href
const targets = await (await fetch('http://127.0.0.1:9230/json/list', { signal: AbortSignal.timeout(3000) })).json()
const target = targets.find(t => t.title === 'DeepSeek Harness Host')
assert.ok(target, 'Use the existing official Inspector only')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let sequence = 0
const pending = new Map()
socket.addEventListener('message', event => {
  const message = JSON.parse(String(event.data)), p = pending.get(message.id)
  if (!p) return
  clearTimeout(p.timer); pending.delete(message.id)
  message.error ? p.reject(Error(JSON.stringify(message.error))) : p.resolve(message.result)
})
const send = (method, params = {}, timeout = 60000) => new Promise((resolve, reject) => {
  const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error('Inspector timeout')) }, timeout)
  pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }))
})
try {
  await send('Runtime.enable')
  const tree = await send('DOM.getDocument', { depth: 3 })
  const node = tree.root.children.find(n => n.nodeName === 'HOST')?.children?.find(n => n.nodeName === 'CONTEXT')
  assert.ok(node)
  const { object } = await send('DOM.resolveNode', { nodeId: node.nodeId })
  const response = await send('Runtime.callFunctionOn', { objectId: object.objectId, awaitPromise: true, returnByValue: true,
    arguments: [{ value: entry }, { value: fixture }],
    functionDeclaration: String(async function (entry, fixture) {
      const candidate = await this.loader.import(entry), llm = await this.loader.import('@deepseek-ai/dsh-llm')
      const names = () => this.tools.schemas().map(t => t.name).sort()
      const before = names(), calls = [], sessions = [], lifecycle = []
      let scope, fiber
      const handle = await this.agents.create({ sessionId: `review-m2-host-${Date.now()}`, meta: { cwd: fixture.tasks[0].root },
        setup(agentCtx) { scope = agentCtx; fiber = agentCtx.plugin(candidate, { autoInject: false, externalWatch: false, codeHealth: true, toolSurface: 'full' }) } })
      const invoke = async (root, name, args) => {
        const callId = `m2:${calls.length}`, arguments_ = { ...args, repoRoot: root }
        const batch = await scope.tools.execute({ agent: handle.agent, calls: [{ type: 'tool-call', id: callId, name, arguments: JSON.stringify(arguments_) }], signal: new AbortController().signal })
        const result = batch.results[0].result
        if (result.isError) throw Error(JSON.stringify(result))
        const row = { callId, name, arguments: arguments_, result }; calls.push(row); return row
      }
      try {
        await new Promise(r => setTimeout(r, 150))
        lifecycle.push(scope.tools.schemas(handle.agent).filter(t => t.name.startsWith('code_')).length)
        if (lifecycle[0] !== 8) throw Error('Scoped plugin failed to mount all tools')
        for (const task of fixture.tasks) {
          for (const outputFormat of ['text', 'review', 'xray']) {
            const row = await invoke(task.root, 'code_change_context', { outputFormat })
            if (outputFormat === 'review') {
              const value = row.result.value
              if (JSON.stringify(value).length > 5000 || value.brief.verification !== 'not-run') throw Error('Budget or verification contract')
              if (value.brief.repository.root.replaceAll('\\', '/') !== task.root.replaceAll('\\', '/')) throw Error('Worktree identity mismatch')
              if (!value.text.includes('Index built:')) throw Error('Missing freshness in visible output')
            }
            sessions.push({ task: task.id, format: outputFormat, callId: row.callId })
          }
        }
        await invoke(fixture.other, 'code_change_context', { outputFormat: 'review', files: ['marker.ts'] })
        await invoke(fixture.tasks[0].root, 'code_change_context', { outputFormat: 'review' })
        for (const budgetChars of [300, 500, 1000, 2000, 20000]) await invoke(fixture.tasks[0].root, 'code_change_context', { outputFormat: 'review', budgetChars })
        const text = await invoke(fixture.tasks[0].root, 'code_change_context', {})
        const legacy = await invoke(fixture.tasks[0].root, 'code_change_context', { budgetChars: 300 })
        if (JSON.stringify(text.result.value) !== JSON.stringify(legacy.result.value)) throw Error('Legacy text changed with review-only budget')
        const pack1 = await invoke(fixture.tasks[0].root, 'code_context', { task: 'calculateTotal implementation', outputFormat: 'pack', budgetChars: 5000 })
        await invoke(fixture.tasks[0].root, 'code_change_context', { outputFormat: 'review' })
        const pack2 = await invoke(fixture.tasks[0].root, 'code_context', { task: 'calculateTotal implementation', outputFormat: 'pack', budgetChars: 5000 })
        if (JSON.stringify(pack1.result.value) !== JSON.stringify(pack2.result.value)) throw Error('Raw Context Pack changed after review')
        await fiber.dispose()
        lifecycle.push(scope.tools.schemas(handle.agent).filter(t => t.name.startsWith('code_')).length)
        fiber = scope.plugin(candidate, { autoInject: false, externalWatch: false, codeHealth: true, toolSurface: 'full' })
        await new Promise(r => setTimeout(r, 150))
        lifecycle.push(scope.tools.schemas(handle.agent).filter(t => t.name.startsWith('code_')).length)
        await invoke(fixture.tasks[0].root, 'code_change_context', { outputFormat: 'review' })
        await fiber.dispose()
        lifecycle.push(scope.tools.schemas(handle.agent).filter(t => t.name.startsWith('code_')).length)
      } finally { await handle.dispose() }
      if (JSON.stringify(before) !== JSON.stringify(names())) throw Error('Global tool set changed')
      return { status: 'PASS', method: 'existing Desktop; agent-scoped plugin apply/dispose/reload and native tools; no UI interaction or session replay', node: process.version, clientVersion: process.env.DSH_CLIENT_VERSION, globalToolsUnchanged: true, lifecycle, calls, sessions }
    }),
  })
  if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails))
  const record = response.result.value
  writeFileSync(path.join(import.meta.dirname, 'rc2-desktop-results.json'), JSON.stringify(record, null, 2))
  console.log(JSON.stringify({ ...record, calls: record.calls.length }))
} finally { socket.close() }
