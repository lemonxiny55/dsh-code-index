// Installed development tarball + real rc.3 native pipeline, not Desktop or model.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
const root = process.cwd(), consumer = path.join(root, 'node_modules/.rc2-consumer22')
const load = createRequire(path.join(consumer, 'package.json'))
const pluginRoot = path.join(consumer, 'node_modules/dsh-code-index')
const plugin = await import(pathToFileURL(path.join(pluginRoot, 'dist/index.js')))
const { Context } = load('@deepseek-ai/cordis'), Tools = load('@deepseek-ai/dsh-tools').default
const Prompt = load('@deepseek-ai/dsh-system-prompt').default, native = load('@deepseek-ai/dsh-tool-executor-native')
const dir = mkdtempSync(path.join(os.tmpdir(), 'review-rc3-')), a = path.join(dir, 'a'), b = path.join(dir, 'b'), wt = path.join(dir, 'wt')
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: 'pipe' })
for (const [repo, name] of [[a, 'ALPHA_MARKER'], [b, 'BETA_MARKER']]) {
  mkdirSync(path.join(repo, 'tests'), { recursive: true })
  writeFileSync(path.join(repo, 'core.ts'), `export function ${name}() { return 40 }\n`)
  writeFileSync(path.join(repo, 'caller.ts'), `import { ${name} } from './core'\nexport function caller() { return ${name}() }\n`)
  writeFileSync(path.join(repo, 'tests/core.test.ts'), `import { ${name} } from '../core'\nexport function candidate() { return ${name}() }\n`)
  writeFileSync(path.join(repo, 'old.ts'), 'export function removedMarker() { return 7 }\n')
  git(repo, 'init', '-q'); git(repo, 'add', '.'); git(repo, '-c', 'user.name=Gate', '-c', 'user.email=gate@example.invalid', 'commit', '-qm', 'tiny baseline')
}
git(b, 'worktree', 'add', '-qb', 'review-worktree', wt)
writeFileSync(path.join(wt, 'core.ts'), 'export function WORKTREE_MARKER() { return 82 }\n')
writeFileSync(path.join(a, 'core.ts'), 'export function ALPHA_MARKER() { return 43 }\n')
const ctx = new Context(); new Prompt(ctx, { includeHarnessIdentity: false }); const runtime = new Tools(ctx); ctx.plugin(native)
const calls = [], checks = []
async function invoke(name, args, repoRoot = a) {
  const batch = await runtime.execute({ calls: [{ type: 'tool-call', id: `review:${calls.length}`, name, arguments: JSON.stringify({ ...args, repoRoot }) }], signal: new AbortController().signal })
  const result = batch.results[0].result; assert.equal(result.isError, false, JSON.stringify(result))
  calls.push({ name, args, repoRoot, result }); return result
}
try {
  for (let cycle = 0; cycle < 2; cycle++) {
    const fiber = ctx.plugin(plugin, { autoInject: false, externalWatch: true, codeHealth: true })
    await new Promise(r => setTimeout(r, 100))
    assert.equal(runtime.schemas().filter(t => t.name.startsWith('code_')).length, 8)
    if (cycle === 0) {
      const text = await invoke('code_change_context', {}), xray = await invoke('code_change_context', { outputFormat: 'xray' })
      const pack = await invoke('code_context', { task: '理解 ALPHA_MARKER 的实现', outputFormat: 'pack', budgetChars: 5000 })
      for (const budgetChars of [300, 500, 1000, 2000, 5000, 20000]) {
        const result = await invoke('code_change_context', { outputFormat: 'review', budgetChars })
        const output = result.value
        assert.ok(JSON.stringify(output).length <= budgetChars); assert.equal(output.brief.budget.usedChars, JSON.stringify(output).length)
        assert.deepEqual(result.content, [{ type: 'text', text: output.text }])
        assert.equal(output.brief.verification, 'not-run'); assert.notEqual(result.meta?.card, 'impact-xray')
        if (budgetChars === 5000) {
          assert.equal(output.brief.status, 'bounded'); assert.ok(output.brief.changes.some(r => r.code?.includes('return 43')))
          assert.ok(output.brief.relations.some(r => r.kind === 'call' && r.name === 'caller'))
          assert.ok(output.brief.tests.some(r => r.file === 'tests/core.test.ts')); assert.equal(output.brief.repository.dirty, true)
        }
      }
      assert.deepEqual((await invoke('code_change_context', { budgetChars: 300 })).value, text.value)
      const unchangedXray = await invoke('code_change_context', { outputFormat: 'xray', budgetChars: 300 })
      assert.deepEqual(unchangedXray.value, xray.value); assert.deepEqual(unchangedXray.meta, xray.meta)
      assert.deepEqual((await invoke('code_context', { task: '理解 ALPHA_MARKER 的实现', outputFormat: 'pack', budgetChars: 5000 })).value, pack.value)
      const beta = (await invoke('code_change_context', { outputFormat: 'review', files: ['core.ts'] }, b)).value
      assert.ok(beta.brief.changes.some(r => r.name === 'BETA_MARKER')); assert.ok(!JSON.stringify(beta).includes('ALPHA_MARKER'))
      const worktree = (await invoke('code_change_context', { outputFormat: 'review' }, wt)).value
      assert.equal(worktree.brief.repository.root.replaceAll('\\', '/'), wt.replaceAll('\\', '/'))
      assert.ok(worktree.brief.changes.some(r => r.name === 'WORKTREE_MARKER')); assert.ok(!JSON.stringify(worktree).includes('ALPHA_MARKER'))
      const alpha = (await invoke('code_change_context', { outputFormat: 'review' })).value
      assert.ok(alpha.brief.changes.some(r => r.name === 'ALPHA_MARKER'))
      checks.push('review six full-envelope budgets and canonical native rendering', 'source, direct caller, candidate test and dirty metadata', 'default text/X-Ray value+metadata and raw Context Pack unchanged', 'A/B/A and linked-worktree review identity/source isolation')
    } else {
      const output = (await invoke('code_change_context', { outputFormat: 'review' })).value
      assert.ok(output.brief.changes.some(r => r.code?.includes('return 43')))
    }
    await fiber.dispose(); assert.equal(runtime.schemas().filter(t => t.name.startsWith('code_')).length, 0)
  }
  checks.push('candidate load/dispose/reload: 8/0/8/0')
  const version = n => JSON.parse(readFileSync(path.join(consumer, 'node_modules', n, 'package.json'), 'utf8')).version
  const archive = path.join(root, 'node_modules/.rc-final2/dsh-code-index-0.13.0-rc.1.tgz')
  const record = { status: 'PASS', method: 'normal installed development tarball + rc.3 Cordis/ToolsService/NativeToolExecutor', node: process.version,
    versions: Object.fromEntries(['dsh-code-index', '@deepseek-ai/dsh-tools', '@deepseek-ai/cordis'].map(n => [n, version(n)])),
    archiveSha256: createHash('sha256').update(readFileSync(archive)).digest('hex'), checks, repos: { a, b, wt }, calls }
  writeFileSync(path.join(import.meta.dirname, 'rc2-runtime-22-results.json'), JSON.stringify(record, null, 2))
  console.log(JSON.stringify({ ...record, calls: calls.length }))
} finally { await ctx.fiber.dispose() }
