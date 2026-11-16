// Existing Desktop, short-lived uniquely named candidate tool. No plugin replacement.
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
  const gate = JSON.parse(readFileSync(path.join(import.meta.dirname, 'm1-runtime-results.json'), 'utf8'))
  const entry = path.resolve('node_modules/.m1-consumer-final/node_modules/dsh-code-index/dist/index.js')
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
      arguments: [{ value: pathToFileURL(entry).href }, { value: gate.repos.a }, { value: route }, { value: isolation }],
      functionDeclaration: String(async function (entry, repoRoot, route, isolation) {
        const candidate = isolation ? null : await this.loader.import(entry), llm = await this.loader.import('@deepseek-ai/dsh-llm')
        const definition = candidate?.tools.find(t => t.name === 'code_change_context')
        const before = this.tools.schemas().map(t => t.name).sort()
        const handle = await this.agents.create({ sessionId: `review-v013-${Date.now()}`, meta: { cwd: repoRoot },
          agentOptions: { ...route, maxTokens: 4096 },
          setup(agentCtx) {
            if (isolation) agentCtx.tools.restrict({ deny: before })
            else { agentCtx.tools.register(definition); agentCtx.tools.restrict({ allow: ['code_change_context'] }) }
          },
        })
        let timedOut = false
        const timer = setTimeout(() => { timedOut = true; handle.agent.cancel({ kind: 'user' }) }, 105000)
        let record
        try {
          handle.agent.followup(llm.createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: isolation ? '仅回复 RC3_TRANSPORT_OK，不调用任何工具。' : '这是只读验收合成仓库。必须调用 code_change_context，outputFormat 为 review，budgetChars 为 5000。不要运行测试或修改文件。根据工具实际返回的 Review Brief，用中文简述变更实现、静态影响、候选测试和缺口；明确测试未执行、静态关系不证明运行行为，不能把版本信息当作安全交接令牌。' }] }))
          await handle.agent.whenIdle()
          const events = handle.agent.session.snapshotEvents()
          const calls = events.filter(e => e.type === 'tool/call')
          const ends = events.filter(e => e.type === 'turn/end')
          const messages = events.filter(e => e.type === 'assistant/message')
          const last = messages.at(-1)?.data?.message
          record = { method: isolation ? 'one no-candidate/no-tools transport check in existing Desktop; global profile preserved' : 'real existing Desktop Agent with agent-scoped candidate tool; configured model; synthetic repository', isolation,
            sessionId: handle.agent.id, route, timedOut, toolCalls: calls.length, turnEnd: ends.at(-1)?.data,
            final: last?.content?.filter(block => block.type === 'text').map(block => block.text).join('\n') ?? null,
            events: events.filter(e => ['tool/call', 'tool/result', 'turn/end', 'assistant/message'].includes(e.type)) }
        } finally { clearTimeout(timer); await handle.dispose() }
        const after = this.tools.schemas().map(t => t.name).sort()
        record.globalToolsUnchanged = JSON.stringify(before) === JSON.stringify(after)
        return record
      }),
    }, 150000)
    if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails))
    writeFileSync(path.join(import.meta.dirname, isolation ? 'm1-desktop-isolation-results.json' : 'm1-desktop-agent-results.json'), JSON.stringify(response.result.value, null, 2))
    console.log(JSON.stringify({ ...response.result.value, events: undefined }))
    process.exitCode = response.result.value.timedOut || response.result.value.turnEnd?.reason?.kind !== 'completed' || (!isolation && response.result.value.toolCalls === 0) ? 1 : 0
    socket.close()
  } else {
  const response = await send('Runtime.callFunctionOn', { objectId: object.objectId, awaitPromise: true, returnByValue: true,
    arguments: [{ value: pathToFileURL(entry).href }, { value: gate.repos.a }],
    functionDeclaration: String(async function (entry, repoRoot) {
      // CDP's synthetic function realm has no dynamic-import callback. Use the
      // Loader's public module-import API; it does not mount or persist an entry.
      const candidate = await this.loader.import(entry)
      const tool = candidate.tools.find(t => t.name === 'code_change_context')
      if (!tool) throw Error('Candidate tool missing')
      const alias = 'code_change_context_v013_validation'
      const names = () => this.tools.schemas().map(t => t.name).sort()
      const before = names()
      if (before.includes(alias)) throw Error('Validation alias already exists; refusing to replace it')
      const dispose = this.tools.register({ ...tool, name: alias })
      const results = []
      try {
        for (const budgetChars of [5000, 300]) {
          const batch = await this.tools.execute({ calls: [{ type: 'tool-call', id: `v013:review:${budgetChars}`, name: alias,
            arguments: JSON.stringify({ repoRoot, outputFormat: 'review', budgetChars }) }], signal: new AbortController().signal })
          const result = batch.results[0].result
          if (result.isError) throw Error(JSON.stringify(result))
          const output = result.value
          if (JSON.stringify(output).length > budgetChars || output.brief.verification !== 'not-run') throw Error('Review contract failed')
          if (JSON.stringify(result.content) !== JSON.stringify([{ type: 'text', text: output.text }])) throw Error('Canonical render mismatch')
          if (budgetChars === 5000 && !output.brief.changes.some(row => row.code?.includes('return 43'))) throw Error('Implementation missing')
          results.push({ budgetChars, result })
        }
      } finally { dispose() }
      const after = names()
      if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('Desktop tools were not restored')
      return { status: 'PASS', method: 'existing Desktop official Inspector + temporary candidate alias through native Host pipeline',
        stablePluginReplaced: false, namesBefore: before.filter(n => n.startsWith('code_')), namesAfter: after.filter(n => n.startsWith('code_')),
        aliasRemoved: !after.includes(alias), clientRenderingVerified: false, results }
    }),
  })
  if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails))
  const record = response.result.value
  writeFileSync(path.join(import.meta.dirname, 'm1-desktop-results.json'), JSON.stringify(record, null, 2))
  console.log(JSON.stringify({ ...record, results: record.results.length }))
  }
} finally { socket.close() }
