// Attach only to the already-enabled, local DSH Inspector. No profile changes.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
const targets = await (await fetch('http://127.0.0.1:9230/json/list')).json()
const target = targets.find(t => t.title === 'DeepSeek Harness Host')
if (!target) throw Error('No existing DSH Inspector target; do not enable one automatically')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let sequence = 0
const pending = new Map(), events = []
socket.addEventListener('message', event => {
  const message = JSON.parse(String(event.data))
  if (!message.id) { events.push(message); return }
  const callback = pending.get(message.id); if (!callback) return
  pending.delete(message.id); clearTimeout(callback.timer)
  if (message.error) callback.reject(Error(JSON.stringify(message.error))); else callback.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP request timeout: ' + method)) }, 15000)
  pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }))
})
try {
  await send('Runtime.enable')
  if (process.argv[2] === 'inventory') {
    console.log(JSON.stringify(events.filter(e => e.method === 'Runtime.executionContextCreated')))
    console.log(JSON.stringify(await send('DOM.getDocument', { depth: 3 })))
  } else {
    const tree = await send('DOM.getDocument', { depth: 3 })
    const context = tree.root.children.find(n => n.nodeName === 'HOST')?.children?.find(n => n.nodeName === 'CONTEXT')
    if (!context) throw Error('No observed live Host context')
    const resolved = await send('DOM.resolveNode', { nodeId: context.nodeId })
    if (process.argv[2] === 'gate') {
      const { repos } = JSON.parse(readFileSync(path.join(import.meta.dirname, 'm0-native-results.json'), 'utf8'))
      const result = await send('Runtime.callFunctionOn', {
        objectId: resolved.object.objectId, awaitPromise: true, returnByValue: true,
        arguments: [{ value: repos }],
        functionDeclaration: String(async function (repos) {
          const calls = []
          const invoke = async (name, args, repoRoot = repos.a) => {
            const batch = await this.tools.execute({ calls: [{ type: 'tool-call', id: 'v013-desktop:' + calls.length, name, arguments: JSON.stringify({ ...args, repoRoot }) }], signal: new AbortController().signal })
            const result = batch.results[0].result
            if (result.isError) throw Error(JSON.stringify(result))
            calls.push({ name, args, repoRoot, result }); return result
          }
          const names = this.tools.schemas().map(t => t.name).filter(n => n.startsWith('code_'))
          const source = await invoke('code_context', { task: '理解 ALPHA_MARKER 的真实实现', outputFormat: 'pack', budgetChars: 5000 })
          if (!JSON.stringify(source).includes('return 43')) throw Error('Source implementation missing')
          const text = await invoke('code_change_context', {})
          const xray = await invoke('code_change_context', { outputFormat: 'xray' })
          if (JSON.stringify(text.content) !== JSON.stringify(xray.content) || xray.meta.card !== 'impact-xray') throw Error('X-Ray compatibility mismatch')
          const beta = await invoke('code_search', { query: 'BETA_MARKER' }, repos.b)
          const alpha = await invoke('code_search', { query: 'BETA_MARKER' }, repos.a)
          if (beta.value[0]?.name !== 'BETA_MARKER' || alpha.value.length) throw Error('Repository isolation mismatch')
          const wt = await invoke('code_change_context', {}, repos.wt)
          if (!JSON.stringify(wt).includes('WORKTREE_MARKER') || JSON.stringify(wt).includes('ALPHA_MARKER')) throw Error('Worktree isolation mismatch')
          return { status: 'PASS', method: 'existing user Desktop Host API through its already-enabled official Inspector; no UI automation', names, calls, services: { subagents: typeof this.subagents?.startActivation, sendMessage: typeof this.subagents?.sendMessage, teamMode: typeof this.agentTeams?.setEnabled, teamTask: typeof this.agentTeams?.createTask }, clientRenderingVerified: false }
        }),
      })
      if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails))
      writeFileSync(path.join(import.meta.dirname, 'm0-desktop-direct-results.json'), JSON.stringify(result.result.value, null, 2))
      console.log(JSON.stringify({ ...result.result.value, calls: result.result.value.calls.length }))
    } else {
      const inspected = await send('Runtime.callFunctionOn', { objectId: resolved.object.objectId, functionDeclaration: 'function() { return {tools: this.tools?.schemas().map(t => t.name).filter(n => n.startsWith("code_")), sessions: !!this.sessions, persistence: !!this.sessionPersistence, subagents: !!this.subagents, team: !!this.agentTeams, inspector: !!this.inspector} }', returnByValue: true })
      console.log(JSON.stringify(inspected))
    }
  }
} finally { socket.close() }
