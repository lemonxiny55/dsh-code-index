// Real npm-installed v0.12.0 + rc.3 Cordis/ToolsService. No model or UI replay.
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import path from 'node:path'
const root = process.cwd(), host = path.join(root, 'node_modules/.m0-host')
const load = createRequire(path.join(host, 'package.json'))
const { Context } = load('@deepseek-ai/cordis')
const Tools = load('@deepseek-ai/dsh-tools').default
const Prompt = load('@deepseek-ai/dsh-system-prompt').default
const entry = path.join(host, 'node_modules/dsh-code-index/dist/index.js')
const plugin = await import(pathToFileURL(entry))
const scratch = mkdtempSync(path.join(host, 'native-fixtures-')), a = path.join(scratch, 'a'), b = path.join(scratch, 'b'), wt = path.join(scratch, 'wt')
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: 'pipe' })
for (const [dir, name] of [[a, 'ALPHA_MARKER'], [b, 'BETA_MARKER']]) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'core.ts'), `export function ${name}() { return 41 }\n`)
  git(dir, 'init', '-q'); git(dir, 'add', '.'); git(dir, '-c', 'user.name=Gate', '-c', 'user.email=gate@example.invalid', 'commit', '-qm', 'tiny baseline')
}
git(b, 'worktree', 'add', '-qb', 'gate-worktree', wt)
writeFileSync(path.join(wt, 'core.ts'), 'export function WORKTREE_MARKER() { return 42 }\n')
writeFileSync(path.join(a, 'caller.ts'), "import { ALPHA_MARKER } from './core'\nexport function callAlpha() { return ALPHA_MARKER() }\n")
writeFileSync(path.join(a, 'core.ts'), 'export function ALPHA_MARKER() { return 43 }\n')
const ctx = new Context(); new Prompt(ctx, { includeHarnessIdentity: false }); const runtime = new Tools(ctx)
const native = load('@deepseek-ai/dsh-tool-executor-native')
ctx.plugin(native)
const results = [], checks = []
const invoke = async (name, args = {}, repoRoot = a) => {
  const callId = `m0:${results.length}`
  const batch = await runtime.execute({ calls: [{ type: 'tool-call', id: callId, name, arguments: JSON.stringify({ ...args, repoRoot }) }], signal: new AbortController().signal })
  const result = batch.results[0].result
  assert.equal(result.isError, false, JSON.stringify(result))
  results.push({ name, args, repoRoot, result }); return result
}
const version = name => JSON.parse(readFileSync(path.join(host, 'node_modules', name, 'package.json'), 'utf8')).version
try {
  for (let cycle = 0; cycle < 2; cycle++) {
    const fiber = ctx.plugin(plugin, { autoInject: false, codeHealth: true, externalWatch: true })
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(runtime.schemas().filter(t => t.name.startsWith('code_')).length, 8)
    const found = await invoke('code_search', { query: 'ALPHA_MARKER' })
    assert.equal(found.value[0].name, 'ALPHA_MARKER')
    if (cycle === 0) {
      await invoke('code_index', { action: 'build' }); await invoke('code_symbols'); await invoke('code_map'); await invoke('code_refs', { symbol: 'ALPHA_MARKER' }); await invoke('code_health')
      for (const budgetChars of [300, 500, 5000, 20000]) for (const outputFormat of ['text', 'pack']) {
        const value = (await invoke('code_context', { task: '理解 ALPHA_MARKER 的实现', budgetChars, outputFormat })).value
        assert.ok((typeof value === 'string' ? value : JSON.stringify(value)).length <= budgetChars)
        if (budgetChars === 5000) assert.ok(JSON.stringify(value).includes('return 43'))
      }
      const text = await invoke('code_change_context'), xray = await invoke('code_change_context', { outputFormat: 'xray' })
      assert.deepEqual(xray.content, text.content); assert.equal(xray.meta.card, 'impact-xray'); assert.equal(xray.meta.evidence.tests.verification, 'not-run')
      assert.equal((await invoke('code_search', { query: 'BETA_MARKER' }, b)).value[0].name, 'BETA_MARKER')
      assert.deepEqual((await invoke('code_search', { query: 'BETA_MARKER' }, a)).value, [])
      assert.equal((await invoke('code_search', { query: 'WORKTREE_MARKER' }, wt)).value[0].name, 'WORKTREE_MARKER')
      assert.deepEqual((await invoke('code_search', { query: 'WORKTREE_MARKER' }, b)).value, [])
      const change = await invoke('code_change_context', {}, wt)
      assert.ok(JSON.stringify(change).includes('WORKTREE_MARKER')); assert.ok(!JSON.stringify(change).includes('ALPHA_MARKER'))
      const external = path.join(b, 'external.ts')
      execFileSync(process.execPath, ['-e', 'require("node:fs").writeFileSync(process.argv[1], "export function EXTERNAL_MARKER() { return 99 }\\n")', external])
      assert.equal((await invoke('code_search', { query: 'EXTERNAL_MARKER' }, b)).value[0].name, 'EXTERNAL_MARKER')
      execFileSync(process.execPath, ['-e', 'require("node:fs").unlinkSync(process.argv[1])', external])
      assert.deepEqual((await invoke('code_search', { query: 'EXTERNAL_MARKER' }, b)).value, [])
      checks.push('all eight tools through native rc.3 batch pipeline', 'source and pack budgets 300/500/5000/20000', 'text/X-Ray content compatibility and test not-run metadata', 'A/B/A and linked-worktree change isolation', 'external child-process add/delete freshness')
    }
    await fiber.dispose(); assert.equal(runtime.schemas().filter(t => t.name.startsWith('code_')).length, 0)
  }
  checks.push('load/dispose/reload: 8/0/8/0')
  const report = { status: 'PASS', method: 'npm installed package + real Cordis/ToolsService; no model, no Desktop', node: process.version, versions: Object.fromEntries(['dsh-code-index', '@deepseek-ai/dsh', '@deepseek-ai/dsh-tools', '@deepseek-ai/cordis'].map(n => [n, version(n)])), entrySha256: createHash('sha256').update(readFileSync(entry)).digest('hex'), checks, calls: results.length, repos: { a, b, wt }, results }
  writeFileSync(path.join(root, 'docs/development/v0.13.0/m0-native-results.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ...report, results: undefined }))
} finally { await ctx.fiber.dispose() }
