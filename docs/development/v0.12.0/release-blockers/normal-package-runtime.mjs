import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import os from 'node:os'
import path from 'node:path'
const out = import.meta.dirname
const install = JSON.parse(readFileSync(path.join(out, 'release-npm.json'), 'utf8')).find(r => r.mode === 'host-rc1')
assert.equal(install.exitCode, 0)
const load = createRequire(path.join(install.root, 'package.json'))
const { Context } = load('@deepseek-ai/cordis'), ToolRuntime = load('@deepseek-ai/dsh-tools').default
const SystemPrompt = load('@deepseek-ai/dsh-system-prompt').default
const { ToolExecutionPipeline, executeToolBatch } = load('@deepseek-ai/dsh-tools/pipeline')
const plugin = await import(pathToFileURL(path.join(install.root, 'node_modules/dsh-code-index/dist/index.js')))
const ctx = new Context(); new SystemPrompt(ctx, { includeHarnessIdentity: false }); const runtime = new ToolRuntime(ctx)
const fiber = ctx.plugin(plugin, { autoInject: false, externalWatch: false, codeHealth: true })
await new Promise(resolve => setTimeout(resolve, 50))
const names = runtime.schemas().map(t => t.name).filter(n => n.startsWith('code_')).sort()
assert.equal(names.length, 8)
const root = mkdtempSync(path.join(os.tmpdir(), 'cix-normal-runtime-')); mkdirSync(path.join(root, '.git'))
writeFileSync(path.join(root, 'core.ts'), 'export function normalNpmMarker() { return 12 }\n')
const pipeline = new ToolExecutionPipeline(ctx), results = []
try {
  for (const [name, args] of [
    ['code_context', { task: '解释 normalNpmMarker 的实现和静态调用者', outputFormat: 'pack', budgetChars: 5000 }],
    ['code_refs', { symbol: 'normalNpmMarker' }],
  ]) {
    const batch = await executeToolBatch({ calls: [{ type: 'tool-call', id: `normal:${name}`, name, arguments: JSON.stringify({ ...args, repoRoot: root }) }], signal: new AbortController().signal }, pipeline, () => 1)
    const result = batch.results[0].result; assert.equal(result.isError, false)
    if (name === 'code_context') { assert.equal(result.value.evidence.scope, 'indexed-static-only'); assert.equal(result.value.evidence.tests.verification, 'not-run'); assert.ok(JSON.stringify(result.value).length <= 5000) }
    results.push({ name, args, result })
  }
} finally { await fiber.dispose() }
assert.equal(runtime.schemas().filter(t => t.name.startsWith('code_')).length, 0); await ctx.fiber.dispose()
writeFileSync(path.join(out, 'normal-package-runtime.json'), JSON.stringify({ method: 'normally installed package; real Cordis/SystemPrompt/ToolRuntime and public shared execution pipeline', installed: install.installed, archiveSha256: install.sha256, names, results, disposedToolCount: 0, status: 'PASS' }, null, 2) + '\n')
console.log(JSON.stringify({ status: 'PASS', installed: install.installed, registered: names.length, calls: results.length, disposed: 0 }))
