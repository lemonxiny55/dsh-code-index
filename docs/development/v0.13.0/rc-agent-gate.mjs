// Real Desktop Agent. Candidate tool is scoped; global plugin/profile preserved.
// Usage: node m2-agent.mjs agent A|B|C; one isolation control ONLY after TRANSPORT.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { createRequire } from 'node:module'
const targets = await (await fetch('http://127.0.0.1:9230/json/list', { signal: AbortSignal.timeout(3000) })).json()
const target = targets.find(t => t.title === 'DeepSeek Harness Host')
if (!target) throw Error('No existing DSH Inspector; do not enable a new one')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let seq = 0; const pending = new Map()
socket.addEventListener('message', event => {
  const m = JSON.parse(String(event.data)), p = pending.get(m.id); if (!p) return
  clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result)
})
const send = (method, params = {}, timeoutMs = 15000) => new Promise((resolve, reject) => {
  const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout')) }, timeoutMs)
  pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }))
})
try {
  await send('Runtime.enable')
  const tree = await send('DOM.getDocument', { depth: 3 })
  const node = tree.root.children.find(n => n.nodeName === 'HOST')?.children?.find(n => n.nodeName === 'CONTEXT')
  assert.ok(node)
  const { object } = await send('DOM.resolveNode', { nodeId: node.nodeId })
  const gate = JSON.parse(readFileSync(path.join(import.meta.dirname, '../../../node_modules/.m2-demo/manifest.json'), 'utf8'))
  const task = gate.tasks.find(t => t.id === (process.argv[3] ?? 'A'))
  assert.ok(task)
  const entry = path.resolve('node_modules/.rc-final-consumer24/node_modules/dsh-code-index/dist/index.js')
  if (['agent', 'isolation'].includes(process.argv[2])) {
    const isolation = process.argv[2] === 'isolation'
    // Reuse M0's already-installed official runtime only for its YAML reader.
    const runtimeRoot = process.env.DSH_VALIDATION_HOST_ROOT ?? path.resolve('../../node_modules/.v013-dev/node_modules/.m0-host')
    const load = createRequire(path.join(runtimeRoot, 'package.json'))
    const yaml = load('yaml'), os = load('node:os')
    const rows = yaml.parse(readFileSync(path.join(os.homedir(), '.dsh/profiles/desktop/cordis.patch.yml'), 'utf8'), { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => String(value) }] })
    const route = rows.find(row => row.id === 'agent-default-model')?.config
    assert.ok(route?.provider && route?.model, 'Use an existing configured route, never guess a provider')
    const response = await send('Runtime.callFunctionOn', { objectId: object.objectId, awaitPromise: true, returnByValue: true,
      arguments: [{ value: pathToFileURL(entry).href }, { value: task.root }, { value: route }, { value: isolation }, { value: task.prompt }, { value: task.id }],
      functionDeclaration: String(async function (entry, repoRoot, route, isolation, taskPrompt, taskId) {
        const candidate = isolation ? null : await this.loader.import(entry), llm = await this.loader.import('@deepseek-ai/dsh-llm')
        const definition = candidate?.tools.find(t => t.name === 'code_change_context')
        const before = this.tools.schemas().map(t => t.name).sort()
        const handle = await this.agents.create({ sessionId: `review-v013-${Date.now()}`, meta: { cwd: repoRoot },
          agentOptions: { ...route, maxTokens: 8192 },
          setup(agentCtx) {
            if (isolation) agentCtx.tools.restrict({ deny: before })
            else { agentCtx.tools.register(definition); agentCtx.tools.restrict({ allow: ['code_change_context'] }) }
          },
        })
        let timedOut = false
        const timer = setTimeout(() => { timedOut = true; handle.agent.cancel({ kind: 'user' }) }, 105000)
        let record
        try {
          handle.agent.followup(llm.createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: isolation ? '仅回复 RC3_TRANSPORT_OK，不调用任何工具。' : taskPrompt + ' 必须分别调用 code_change_context 的 text 和 review，review budgetChars=5000。只读，不运行测试或修改文件。对照实际工具结果，说明差异、缺失源码和错误推论风险。不要把静态关系等同运行影响或把候选测试等同已验证覆盖。' }] }))
          await handle.agent.whenIdle()
          const events = handle.agent.session.snapshotEvents()
          const calls = events.filter(e => e.type === 'tool/call')
          const ends = events.filter(e => e.type === 'turn/end')
          const messages = events.filter(e => e.type === 'assistant/message')
          const last = messages.at(-1)?.data?.message
          record = { method: isolation ? 'one no-candidate/no-tools transport check in existing Desktop; global profile preserved' : 'real existing Desktop Agent with agent-scoped candidate tool; configured model; synthetic repository', isolation, taskId, maxTokens: 8192,
            sessionId: handle.agent.id, route, timedOut, toolCalls: calls.length, turnEnd: ends.at(-1)?.data,
            final: last?.content?.filter(block => block.type === 'text').map(block => block.text).join('\n') ?? null,
            events: events.filter(e => ['tool/call', 'tool/result', 'turn/end'].includes(e.type)) }
        } finally { clearTimeout(timer); await handle.dispose() }
        const after = this.tools.schemas().map(t => t.name).sort()
        record.globalToolsUnchanged = JSON.stringify(before) === JSON.stringify(after)
        return record
      }),
    }, 150000)
    if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails))
    writeFileSync(path.join(import.meta.dirname, isolation ? 'rc-agent-isolation-results.json' : 'rc-agent-' + task.id + '-results.json'), JSON.stringify(response.result.value, null, 2))
    console.log(JSON.stringify({ ...response.result.value, events: undefined }))
    process.exitCode = response.result.value.timedOut || response.result.value.turnEnd?.reason?.kind !== 'completed' || (!isolation && response.result.value.toolCalls === 0) ? 1 : 0
    socket.close()
  }
} finally { socket.close() }
