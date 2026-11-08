// Acceptance harness: real installed candidate and official Host, no model calls.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, symlinkSync, mkdtempSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
const repo = process.cwd()
const state = JSON.parse(readFileSync(readFileSync('node_modules/.v012-rc-state-path', 'utf8'), 'utf8'))
const smoke = JSON.parse(readFileSync(path.join(state.out, 'smoke-node24.json'), 'utf8'))
const runDir = mkdtempSync(path.join(state.scratch, 'host-run-'))
const home = path.join(runDir, 'home'), profile = path.join(home, 'profiles/web')
process.env.DSH_HOME = home
mkdirSync(profile, { recursive: true })
writeFileSync(path.join(profile, 'package.json'), JSON.stringify({ name: 'rc-isolated-web', private: true,
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } } }))
writeFileSync(path.join(profile, 'cordis.yml'), '[]\n')
symlinkSync(path.join(state.host, 'node_modules'), path.join(profile, 'node_modules'), 'junction')
const pluginEntry = path.join(smoke.installedRoot, 'dist/index.js')
const overlay = path.join(state.scratch, 'host.patch.yml')
writeFileSync(overlay, '- insert:\n    - id: code-index\n      name: ' + JSON.stringify(pluginEntry.replaceAll('\\', '/')) + '\n      config:\n        autoInject: true\n        codeHealth: true\n        externalWatch: true\n')
const load = createRequire(path.join(state.host, 'package.json'))
const { loadLayeredEnv, evaluatePluginCompatibility } = load('@deepseek-ai/dsh-app-boot')
assert.equal(evaluatePluginCompatibility(JSON.parse(readFileSync(path.join(smoke.installedRoot, 'package.json'), 'utf8'))), undefined)
const { o: runProfile } = await import(pathToFileURL(path.join(state.host, 'node_modules/@deepseek-ai/dsh/lib/profile-boot-C14i-8IN.js')))
const a = path.join(runDir, 'repos/a'), b = path.join(runDir, 'repos/b'), wt = path.join(runDir, 'repos/worktree')
execFileSync(process.execPath, [path.join(smoke.installedRoot, 'scripts/impact-xray-demo.mjs'), a])
writeFileSync(path.join(a, 'src/idle.js'), 'export function lonelyMarker() { return 77 }\n')
mkdirSync(b, { recursive: true }); writeFileSync(path.join(b, 'b.ts'), 'export function B_ONLY_MARKER() { return 73 }\n')
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' })
git(b, 'init', '-q'); git(b, 'add', '.'); git(b, '-c', 'user.name=RC', '-c', 'user.email=rc@example.invalid', 'commit', '-qm', 'tiny fixture')
git(b, 'worktree', 'add', '-qb', 'rc-worktree', wt)
writeFileSync(path.join(wt, 'b.ts'), 'export function WORKTREE_ONLY_MARKER() { return 74 }\n')
const { ctx } = await runProfile({ environment: loadLayeredEnv('dsh'), profile: 'web', patchFiles: [overlay], args: ['--host', '127.0.0.1', '--port', '0', '--no-open'] })
const results = [], checks = []
const invoke = async (name, args = {}, root = a) => {
  const callId = `rc-host:${results.length}`, arguments_ = { ...args, repoRoot: root }
  const result = await ctx.tools.execute({ callId, name, arguments: arguments_, signal: new AbortController().signal })
  assert.equal(result.isError, false, JSON.stringify(result)); results.push({ callId, name, arguments: arguments_, result }); return result
}
try {
  const names = ctx.tools.schemas().map(t => t.name).filter(n => n.startsWith('code_')).sort()
  assert.equal(names.length, 8); checks.push('eight tools registered')
  for (const [name, args] of [['code_index', { action: 'build' }], ['code_symbols', {}], ['code_search', { query: 'normalize' }], ['code_map', {}], ['code_refs', { symbol: 'normalize' }], ['code_health', {}]]) await invoke(name, args)
  for (const budgetChars of [300, 500, 5000]) {
    for (const outputFormat of ['text', 'pack']) {
      const r = await invoke('code_context', { task: '理解 lonelyMarker 的实现和静态调用者', budgetChars, outputFormat })
      const text = outputFormat === 'pack' ? JSON.stringify(r.value) : r.value
      assert.ok(text.length <= budgetChars, `${outputFormat} ${text.length} > ${budgetChars}`)
      if (outputFormat === 'pack' && budgetChars === 5000) {
        assert.equal(r.value.evidence.scope, 'indexed-static-only'); assert.equal(r.value.evidence.tests.verification, 'not-run')
        assert.ok(r.value.evidence.callers.zero.some(s => s.name === 'lonelyMarker'))
      }
    }
  }
  const change = await invoke('code_change_context'), xray = await invoke('code_change_context', { outputFormat: 'xray' })
  assert.equal(xray.meta.card, 'impact-xray'); assert.deepEqual(xray.content, change.content)
  assert.equal(xray.meta.evidence.scope, 'indexed-static-only'); assert.equal(xray.meta.evidence.tests.verification, 'not-run')
  for (const resolution of ['exact', 'import-scoped', 'name-only']) assert.ok(xray.meta.edges.some(e => e.resolution === resolution))
  checks.push('text/JSON budgets 300/500/5000; zero callers; change/X-Ray evidence')
  assert.equal((await invoke('code_search', { query: 'B_ONLY_MARKER' }, b)).value[0].name, 'B_ONLY_MARKER')
  assert.deepEqual((await invoke('code_search', { query: 'B_ONLY_MARKER' }, a)).value, [])
  assert.equal((await invoke('code_search', { query: 'WORKTREE_ONLY_MARKER' }, wt)).value[0].name, 'WORKTREE_ONLY_MARKER')
  assert.deepEqual((await invoke('code_search', { query: 'WORKTREE_ONLY_MARKER' }, b)).value, [])
  await invoke('code_change_context', {}, wt)
  checks.push('A/B/A and worktree isolation with change context')
  const added = path.join(b, 'external.ts')
  const external = code => execFileSync(process.execPath, ['-e', code, added])
  external('require("node:fs").writeFileSync(process.argv[1], "export function EXTERNAL_ONE() { return 1 }\\n")')
  assert.equal((await invoke('code_search', { query: 'EXTERNAL_ONE' }, b)).value[0].name, 'EXTERNAL_ONE')
  external('require("node:fs").writeFileSync(process.argv[1], "export function EXTERNAL_TWO() { return 2 }\\n")')
  assert.equal((await invoke('code_search', { query: 'EXTERNAL_TWO' }, b)).value[0].name, 'EXTERNAL_TWO')
  assert.deepEqual((await invoke('code_search', { query: 'EXTERNAL_ONE' }, b)).value, [])
  external('require("node:fs").unlinkSync(process.argv[1])')
  assert.deepEqual((await invoke('code_search', { query: 'EXTERNAL_TWO' }, b)).value, [])
  checks.push('external child process add/edit/delete freshness')
  // Dispose/reload with the same real SDK instance as the installed package.
  const { Context } = load('@deepseek-ai/cordis'), ToolRuntime = load('@deepseek-ai/dsh-tools').default
  const SystemPrompt = load('@deepseek-ai/dsh-system-prompt').default
  const isolated = new Context()
  new SystemPrompt(isolated, { includeHarnessIdentity: false })
  const runtime = new ToolRuntime(isolated)
  const plugin = await import(pathToFileURL(pluginEntry))
  for (let i = 0; i < 2; i++) {
    const fiber = isolated.plugin(plugin, { autoInject: false, codeHealth: true, externalWatch: false })
    await new Promise(resolve => setTimeout(resolve, 100)); assert.equal(runtime.schemas().length, 8)
    const r = await runtime.execute({ callId: `reload:${i}`, name: 'code_search', arguments: { query: 'normalize', repoRoot: a }, signal: new AbortController().signal })
    assert.equal(r.isError, false); assert.ok(r.value.length)
    await fiber.dispose(); assert.equal(runtime.schemas().length, 0)
  }
  await isolated.fiber.dispose(); checks.push('actual Cordis load/dispose/reload: 8/0/8/0 tools')
  const { createUserMessage, createAssistantMessage, createToolResultMessage } = load('@deepseek-ai/dsh-llm')
  const session = ctx.sessions.create(randomUUID(), { meta: { cwd: a } })
  session.append('turn/start', { turn: 1 })
  session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'v0.12.0 RC — actual installed-package Host API results. No model Agent request; UI replay only.' }] }), { surfaceOp: 'append' })
  session.append('step/start', { turn: 1, step: 1 })
  const shown = [results.find(r => r.name === 'code_search'), ...results.filter(r => r.name === 'code_context' && r.arguments.budgetChars === 5000), results.find(r => r.name === 'code_refs'), ...results.filter(r => r.name === 'code_change_context' && r.arguments.repoRoot === a)]
  session.append('assistant/message', { turn: 1, step: 1, message: createAssistantMessage({ source: { provider: 'host-api-verification', model: 'none' }, content: shown.map(r => ({ type: 'tool-call', id: r.callId, name: r.name, arguments: JSON.stringify(r.arguments) })) }), stream: [] }, { surfaceOp: 'append' })
  for (const r of shown) {
    session.append('tool/call', { turn: 1, step: 1, callId: r.callId, name: r.name, arguments: JSON.stringify(r.arguments) })
    session.append('tool/result', { turn: 1, step: 1, message: createToolResultMessage({ callId: r.callId, content: r.result.content, isError: false }), ...(r.result.meta ? { meta: r.result.meta } : {}) }, { surfaceOp: 'append' })
  }
  session.append('step/end', { turn: 1, step: 1 }); session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const stored = await ctx.sessionPersistence.create(session.header); await stored.append(session.snapshotEvents()); await stored.flush(); await stored.close()
  const record = { method: 'actual installed candidate + official DSH Host API, not model Agent', runtime: '0.2.1-rc.3', node: process.version, package: smoke.version, sha256: smoke.sha256, checks, names, home, repos: { a, b, wt }, url: ctx.webServer.getOrigin(), sessionId: session.id, results }
  writeFileSync(path.join(state.out, 'host-results.json'), JSON.stringify(record, null, 2))
  console.log(JSON.stringify({ status: 'PASS', calls: results.length, url: record.url, sessionId: session.id, checks }))
  // Keep only this isolated Host open for direct UI inspection.
} catch (error) { console.error(error); await ctx.fiber.dispose(); process.exitCode = 1 }
