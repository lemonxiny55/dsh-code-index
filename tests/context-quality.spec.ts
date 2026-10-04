import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildIndex } from '../src/buildIndex.js'
import { buildTaskContext, renderTaskContext } from '../src/context.js'
import type { ContextPack } from '../src/context-pack.js'
import { RepoContextManager } from '../src/repo-context.js'
import { sourceReader } from '../src/source-excerpts.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const git = (root: string, ...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
async function repo(marker = 'loadConfig'): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cix-quality-')); roots.push(root)
  await mkdir(path.join(root, 'src')); await mkdir(path.join(root, 'tests'))
  await writeFile(path.join(root, 'src/config.ts'), `export function ${marker}(config_path: string) {\n  return config_path.trim()\n}\nexport function removed() { return 'old' }\n`)
  await writeFile(path.join(root, 'src/startup.ts'), `import { ${marker} } from './config'\nexport function startup() { return ${marker}('input') }\n`)
  await writeFile(path.join(root, 'tests/config.spec.ts'), `import { ${marker} } from '../src/config'\ntest('config whitespace', () => ${marker}(' input '))\n`)
  await writeFile(path.join(root, 'src/noise.ts'), 'export function unrelatedWidget() { return "FORBIDDEN_WIDGET" }\n')
  git(root, 'init', '-q'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'quality fixture')
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'baseline')
  return root
}

interface QualityContract {
  mustInclude: string[]
  forbiddenNoise: string[]
  requiredReason: string[]
  requiredProvenance: string[]
  expectedSource: Array<{ file: string; side: 'current' | 'base'; text: string }>
  budget: number
}

async function check(pack: ContextPack, contract: QualityContract): Promise<void> {
  const serialized = JSON.stringify(pack)
  expect(serialized.length).toBeLessThanOrEqual(contract.budget)
  expect(pack.budget.packChars).toBe(serialized.length)
  for (const value of contract.mustInclude) expect(serialized).toContain(value)
  for (const value of contract.forbiddenNoise) expect(serialized).not.toContain(value)
  for (const reason of contract.requiredReason) expect(pack.items.some(item => item.reason.includes(reason))).toBe(true)
  for (const resolution of contract.requiredProvenance) expect(pack.items.some(item => item.resolution === resolution)).toBe(true)
  for (const evidence of contract.expectedSource) expect(pack.items.some(item => item.file === evidence.file && item.side === evidence.side && item.code?.includes(evidence.text))).toBe(true)
  for (const item of pack.items) {
    expect(item.reason).toBeTruthy()
    if (item.code === undefined) continue
    const code = item.side === 'base' ? git(pack.root, 'show', `${item.ref}:${item.file}`) : await readFile(path.join(pack.root, item.file!), 'utf8')
    expect(item.code).toBe(code.split(/\r?\n/).slice(item.startLine! - 1, item.endLine).join('\n'))
    for (const other of pack.items) if (other !== item && other.code !== undefined && other.file === item.file && other.side === item.side && other.ref === item.ref) {
      expect(item.endLine! < other.startLine! || other.endLine! < item.startLine!).toBe(true)
    }
  }
}

const contract = (overrides: Partial<QualityContract> = {}): QualityContract => ({
  mustInclude: ['loadConfig'], forbiddenNoise: ['FORBIDDEN_WIDGET', 'src/noise.ts'],
  requiredReason: ['task names this symbol'], requiredProvenance: [],
  expectedSource: [{ file: 'src/config.ts', side: 'current', text: 'return config_path.trim()' }], budget: 5000, ...overrides,
})

describe('Context Pack quality contracts', () => {
  for (const fixture of [
    { name: 'exact symbol', task: 'Explain loadConfig', contract: contract({ requiredProvenance: ['exact'] }) },
    { name: 'natural-language bug', task: 'Fix config loading whitespace bug', contract: contract({ requiredReason: ['matches task terms'] }) },
    { name: 'clean-tree likely test', task: 'Explain loadConfig', contract: contract({ mustInclude: ['loadConfig', 'tests/config.spec.ts'], requiredProvenance: ['import-scoped'], expectedSource: [{ file: 'tests/config.spec.ts', side: 'current', text: "test('config whitespace'" }] }) },
    { name: 'signature/path terms', task: 'Locate config_path processing in src/config.ts', contract: contract({ requiredReason: ['matches task terms'] }) },
    { name: 'architecture', task: 'Explain config loading architecture', contract: contract({ requiredReason: ['matches task terms'] }) },
    { name: 'exploration', task: 'Where should config loading start?', contract: contract({ requiredReason: ['matches task terms'] }) },
    { name: 'ambiguous task', task: 'Please help', contract: contract({ mustInclude: ['no strong primary symbol'], forbiddenNoise: ['FORBIDDEN_WIDGET'], requiredReason: [], expectedSource: [] }) },
    { name: 'hard budget', task: 'Explain loadConfig', contract: contract({ requiredProvenance: [], expectedSource: [], requiredReason: [], budget: 500 }) },
  ]) it(fixture.name, async () => {
    const root = await repo()
    const result = await buildTaskContext(await buildIndex(root), fixture.task, { budgetChars: fixture.contract.budget })
    await check(result.pack, fixture.contract)
    expect(renderTaskContext(result).length).toBeLessThanOrEqual(fixture.contract.budget)
    expect(result.budget.usedChars).toBe(renderTaskContext(result).length)
  })

  it('current change and added/modified/deleted with current/base source evidence', async () => {
    const root = await repo()
    await writeFile(path.join(root, 'src/config.ts'), "export function loadConfig(config_path: string) {\n  return config_path.toUpperCase()\n}\nexport function betaCaller() { return loadConfig('beta') }\n")
    const result = await buildTaskContext(await buildIndex(root), 'Review current changes', { budgetChars: 8000 })
    await check(result.pack, contract({ mustInclude: ['betaCaller', 'added', 'modified', 'deleted', 'removed'],
      requiredReason: ['declaration intersects'], budget: 8000,
      expectedSource: [{ file: 'src/config.ts', side: 'current', text: 'toUpperCase()' }, { file: 'src/config.ts', side: 'base', text: "return 'old'" }] }))
    expect(result.pack.items.find(item => item.name === 'betaCaller')?.change).toBe('added')
  })

  it('A → B → A isolation and external add/change/delete freshness', async () => {
    const a = await repo('alphaMarker'); const b = await repo('betaMarker')
    const manager = new RepoContextManager({ indexOptions: () => ({}), watch: false })
    try {
      for (const [root, marker, forbidden] of [[a, 'alphaMarker', 'betaMarker'], [b, 'betaMarker', 'alphaMarker'], [a, 'alphaMarker', 'betaMarker']]) {
        const result = await buildTaskContext(await manager.get(root), `Explain ${marker}`)
        await check(result.pack, contract({ mustInclude: [marker], forbiddenNoise: [forbidden, 'FORBIDDEN_WIDGET'], requiredProvenance: ['exact'] }))
      }
      const added = path.join(a, 'src/external.ts')
      const external = (code: string) => execFileSync(process.execPath, ['-e', code, added])
      external("require('fs').writeFileSync(process.argv[1], 'export function freshMarker() { return 11 }\\n')")
      await check((await buildTaskContext(await manager.get(a), 'Explain freshMarker')).pack, contract({
        mustInclude: ['freshMarker'], forbiddenNoise: ['betaMarker'], expectedSource: [{ file: 'src/external.ts', side: 'current', text: 'return 11' }],
      }))
      external("require('fs').writeFileSync(process.argv[1], 'export function freshMarker() { return 22 }\\n')")
      await check((await buildTaskContext(await manager.get(a), 'Explain freshMarker')).pack, contract({
        mustInclude: ['freshMarker'], forbiddenNoise: ['return 11', 'betaMarker'], expectedSource: [{ file: 'src/external.ts', side: 'current', text: 'return 22' }],
      }))
      external("require('fs').unlinkSync(process.argv[1])")
      await check((await buildTaskContext(await manager.get(a), 'Explain freshMarker')).pack, contract({
        mustInclude: ['no strong primary symbol'], forbiddenNoise: ['return 22', 'src/external.ts'], requiredReason: [], expectedSource: [],
      }))
    } finally { await manager.dispose() }
  })

  it('worktree source is isolated from the main checkout and Git baseline', async () => {
    const main = await repo()
    const worktree = await mkdtemp(path.join(os.tmpdir(), 'cix-quality-worktree-')); roots.push(worktree)
    git(main, 'worktree', 'add', '--detach', worktree, 'HEAD')
    await writeFile(path.join(worktree, 'src/config.ts'), 'export function worktreeMarker() { return "WORKTREE_ONLY" }\n')
    const manager = new RepoContextManager({ indexOptions: () => ({}), watch: false })
    try {
      await check((await buildTaskContext(await manager.get(worktree), 'Explain worktreeMarker')).pack,
        contract({ mustInclude: ['worktreeMarker'], forbiddenNoise: ['return config_path.trim()'], expectedSource: [{ file: 'src/config.ts', side: 'current', text: 'WORKTREE_ONLY' }] }))
      await check((await buildTaskContext(await manager.get(main), 'Explain loadConfig')).pack, contract({ forbiddenNoise: ['WORKTREE_ONLY', 'worktreeMarker'] }))
    } finally { await manager.dispose() }
  })

  it('oversized nested declarations deduplicate overlapping lines and never slice bodies', async () => {
    const root = await repo()
    await writeFile(path.join(root, 'src/large.ts'), `export class Huge {\n  run() {\n${'    consume()\n'.repeat(200)}  }\n}\n`)
    const result = await buildTaskContext(await buildIndex(root), 'Explain Huge run', { budgetChars: 3000 })
    await check(result.pack, contract({ mustInclude: ['Huge', 'run'], forbiddenNoise: ['FORBIDDEN_WIDGET'], budget: 3000,
      expectedSource: [{ file: 'src/large.ts', side: 'current', text: 'export class Huge' }] }))
    expect(result.pack.items.some(item => item.mode === 'window')).toBe(true)
  })

  it('refuses stale source bodies after the index snapshot', async () => {
    const root = await repo()
    const index = await buildIndex(root)
    await writeFile(path.join(root, 'src/config.ts'), 'export function replacement() { return 99 }\n')
    expect(await sourceReader(index)('src/config.ts', 'current')).toBeNull()
  })
})
