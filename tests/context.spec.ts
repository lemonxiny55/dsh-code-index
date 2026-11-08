import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildIndex } from '../src/buildIndex.js'
import { buildTaskContext, contextTerms, renderTaskContext, routeTask } from '../src/context.js'
import { tools } from '../src/tools.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixtureRepo(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-cix-context-'))
  roots.push(root)
  await mkdir(path.join(root, '.git'), { recursive: true })
  await mkdir(path.join(root, 'src'), { recursive: true })
  await mkdir(path.join(root, 'tests'), { recursive: true })
  await writeFile(
    path.join(root, 'src', 'config.ts'),
    [
      'export function loadConfig() { return parseConfig() }',
      'export function parseConfig() { return { enabled: true } }',
    ].join('\n'),
  )
  await writeFile(
    path.join(root, 'src', 'bootstrap.ts'),
    "import { loadConfig } from './config'\nexport function bootstrap() { return loadConfig() }\n",
  )
  await writeFile(
    path.join(root, 'tests', 'config.spec.ts'),
    "import { loadConfig } from '../src/config'\ntest('config', () => loadConfig())\n",
  )
  execFileSync('git', ['-C', root, 'init', '-q'])
  execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.invalid'])
  execFileSync('git', ['-C', root, 'config', 'user.name', 'dsh-code-index test'])
  execFileSync('git', ['-C', root, 'add', '.'])
  execFileSync('git', ['-C', root, 'commit', '-qm', 'fixture'])
  return root
}

describe('task-aware router', () => {
  it('does not read English intent keywords from source-path components', async () => {
    const root = await fixtureRepo()
    for (const name of ['change', 'current', 'failure', 'coverage']) {
      await writeFile(path.join(root, `src/${name}.ts`), `export function ${name}Marker() { return 1 }\n`)
    }
    const index = await buildIndex(root)
    for (const name of ['change', 'current', 'failure', 'coverage']) {
      expect(routeTask(`Explain src/${name}.ts`, index).includeChangeContext, name).toBe(false)
    }
    expect(routeTask('Fix failing tests/config.spec.ts', index).kind).toBe('test')
    expect(routeTask('Review current changes in src/change.ts', index).kind).toBe('change')
  })
  it.each([
    ['修复错误', 'Fix a bug', 'change'],
    ['排查异常', 'Fix failure', 'change'],
    ['修改代码', 'Change code', 'change'],
    ['分析变更影响', 'Review change impact', 'change'],
    ['查找测试', 'Find tests', 'test'],
    ['分析测试覆盖', 'Analyze test coverage', 'test'],
    ['查找函数', 'Where is the function?', 'exploration'],
    ['定位实现', 'Locate implementation', 'exploration'],
    ['理解架构', 'Explain architecture', 'architecture'],
    ['分析调用流程', 'Explain call flow', 'architecture'],
  ])('routes %s like %s', (chinese, english, kind) => {
    expect(routeTask(chinese).kind).toBe(kind)
    expect(routeTask(english).kind).toBe(kind)
  })

  it('separates path components, ordinary words, and explicit identifiers', async () => {
    const root = await fixtureRepo()
    await writeFile(path.join(root, 'src/repo-context.ts'), 'export function refreshIndex() { return 1 }\n')
    await writeFile(path.join(root, 'src/helpers.ts'), 'function repo() { return 0 }\nfunction src() { return 1 }\nfunction git() { return 2 }\nfunction normalize() { return 3 }\n')
    const index = await buildIndex(root)
    for (const task of ['Analyze src/repo-context.ts', '定位 D:\\repo\\src\\repo-context.ts',
      'Explain missing/repo-context.ts', 'Explain repo and src in a git repository']) {
      expect(routeTask(task, index).exactSymbolNames).toEqual([])
    }
    for (const task of ['Explain `repo`', 'Find repo()', 'Find repo', 'Find function repo', '定位 repo 函数', 'Explain Namespace.repo()']) {
      expect(routeTask(task, index).exactSymbolNames).toContain('repo')
    }
    expect(routeTask('Find `src` in src/repo-context.ts', index).exactSymbolNames).toContain('src')
    expect(routeTask('Explain src/repo-context.ts and `repo`', index).exactSymbolNames).toEqual(['repo'])
    expect(routeTask('Explain src/repo-context.tsx', index).mentionedFiles).toEqual([])
    expect(routeTask('Explain normalize behavior', index)).toMatchObject({ kind: 'symbol', exactSymbolNames: ['normalize'] })
    const result = await buildTaskContext(index, 'Explain `repo`', { maxSymbols: 1 })
    expect(result.primarySymbols[0].symbol.name).toBe('repo')
  })

  it('retrieves equivalent Chinese and English config tasks without test-helper noise', async () => {
    const root = await fixtureRepo()
    await writeFile(path.join(root, 'tests/noise.spec.ts'), 'function config() { return "UNRELATED_SETUP" }\n')
    const index = await buildIndex(root)
    for (const task of ['修复配置加载错误，不要提交', 'Fix config loading bug']) {
      const result = await buildTaskContext(index, task)
      expect(result.route.kind).toBe('change')
      expect(result.pack.items.some(item => item.file === 'src/config.ts' && item.code?.includes('return parseConfig()'))).toBe(true)
      expect(JSON.stringify(result.pack)).not.toContain('UNRELATED_SETUP')
    }
  })

  it('does not interpret a prohibition as a request to change code', () => {
    expect(routeTask('定位并解释原因，不要修改代码').kind).toBe('exploration')
    expect(routeTask('查找测试，无需修改代码').kind).toBe('test')
    expect(routeTask('修复配置加载，补充测试，不要提交').kind).toBe('change')
  })

  it('keeps default and boundary budgets for text and structured output', async () => {
    const index = await buildIndex(await fixtureRepo())
    for (const [requested, normalized] of [[undefined, 5000], [-1, 300], [300, 300], [20_001, 20_000], [NaN, 5000], [Infinity, 5000]]) {
      const result = await buildTaskContext(index, 'Explain loadConfig', { budgetChars: requested })
      expect(result.pack.budget.budgetChars).toBe(normalized)
      expect(renderTaskContext(result).length).toBeLessThanOrEqual(normalized!)
      expect(JSON.stringify(result.pack).length).toBeLessThanOrEqual(normalized!)
    }
  })

  it('distinguishes a test seed from a test declaration changed in Git', async () => {
    const root = await fixtureRepo()
    const file = path.join(root, 'tests/seed.spec.ts')
    await writeFile(file, 'function selectedFixture() { return 1 }\n')
    execFileSync('git', ['-C', root, 'add', '.'])
    execFileSync('git', ['-C', root, 'commit', '-qm', 'test seed'])
    const seed = await buildTaskContext(await buildIndex(root), 'Explain selectedFixture')
    const seedTest = seed.pack.items.find(item => item.kind === 'test' && item.file === 'tests/seed.spec.ts')!
    expect(seedTest.reason).toContain('not verified coverage')
    expect(seedTest.reason).toContain('primary seed')
    expect(seedTest.provenance).toContain('not Git change evidence')
    await writeFile(file, 'function selectedFixture() { return 2 }\n')
    const changed = await buildTaskContext(await buildIndex(root), 'Fix selectedFixture')
    expect(changed.pack.items.find(item => item.kind === 'test' && item.file === 'tests/seed.spec.ts')).toMatchObject({
      provenance: 'changed-test', reason: expect.stringContaining('test declaration intersects Git change'),
    })
  })
  it('matches camel/snake, path and signature terms for natural-language tasks', async () => {
    const root = await fixtureRepo()
    expect(contextTerms('loadConfig parse_config loading configs')).toEqual(expect.arrayContaining(['load', 'config', 'parse']))
    await writeFile(path.join(root, 'src', 'noise.ts'), 'export function unrelatedWidget() { return 0 }\n')
    const result = await buildTaskContext(await buildIndex(root), 'Fix config loading bug')
    expect(result.primarySymbols.some(seed => seed.symbol.name === 'loadConfig')).toBe(true)
    expect(result.pack.items.some(item => item.file === 'src/noise.ts')).toBe(false)
  })
  it('classifies exact symbol, change, architecture, test, exploration, and ambiguous tasks', async () => {
    const root = await fixtureRepo()
    const index = await buildIndex(root)
    expect(routeTask('Why does loadConfig call parseConfig twice?', index).kind).toBe('symbol')
    expect(routeTask('Fix the current configuration loading bug', index).kind).toBe('change')
    expect(routeTask('How does plugin loading work?', index).kind).toBe('architecture')
    expect(routeTask('Fix failing tests/config.spec.ts', index).kind).toBe('test')
    expect(routeTask('Where should I implement a new startup feature?', index).kind).toBe('exploration')
    expect(routeTask('Please help', index).kind).toBe('ambiguous')
  })

  it('puts an exact named symbol ahead of lexical and structural candidates', async () => {
    const root = await fixtureRepo()
    const index = await buildIndex(root)
    const result = await buildTaskContext(index, 'Fix parseConfig', { maxSymbols: 4 })
    expect(result.primarySymbols[0]).toMatchObject({
      reason: 'task names this symbol',
      provenance: 'exact',
      symbol: { name: 'parseConfig', file: 'src/config.ts' },
    })
    expect(result.primarySymbols.find((item) => item.symbol.name === 'parseConfig')?.score).toBeGreaterThan(
      result.primarySymbols.find((item) => item.symbol.name === 'loadConfig')?.score ?? 0,
    )
  })

  it('finds tests from strong primary seeds on a clean tree and separates evidence', async () => {
    const root = await fixtureRepo()
    const result = await buildTaskContext(await buildIndex(root), 'Explain loadConfig')
    expect(result.tests).toContain('tests/config.spec.ts')
    expect(result.testEvidence).toContainEqual(expect.objectContaining({
      file: 'tests/config.spec.ts', reason: 'imports-changed-file', resolution: 'import-scoped',
    }))
    expect(result.relationships.some(row => row.provenance && row.resolution === 'exact')).toBe(true)
  })

  it('uses a real working-tree change and preserves relationship provenance', async () => {
    const root = await fixtureRepo()
    const configPath = path.join(root, 'src', 'config.ts')
    await writeFile(
      configPath,
      [
        'export function loadConfig() { return parseConfig() }',
        'export function parseConfig() { return { enabled: false } }',
      ].join('\n'),
    )
    const index = await buildIndex(root)
    const result = await buildTaskContext(index, 'Why does my current parseConfig change break startup?', {
      budgetChars: 5_000,
    })
    expect(result.route.kind).toBe('change')
    expect(result.changeContext?.changed.some((entry) => entry.symbol.name === 'parseConfig')).toBe(true)
    expect(result.relevantFiles[0]?.path).toBe('src/config.ts')
    // The same-file sibling call is name-only under the structural resolver.
    expect(result.relationships.some((row) => row.resolution === 'name-only')).toBe(true)
    expect(renderTaskContext(result).length).toBeLessThanOrEqual(5_000)
  })

  it('trims low-priority context, removes duplicates, and stays deterministic', async () => {
    const root = await fixtureRepo()
    const index = await buildIndex(root)
    const task = 'How does configuration loading work? '.repeat(30)
    const first = await buildTaskContext(index, task, {
      budgetChars: 500,
      maxFiles: 20,
      maxSymbols: 20,
    })
    const second = await buildTaskContext(index, task, {
      budgetChars: 500,
      maxFiles: 20,
      maxSymbols: 20,
    })
    const rendered = renderTaskContext(first)
    expect(first.budget.truncated).toBe(true)
    expect(rendered.length).toBeLessThanOrEqual(500)
    expect(rendered).toContain(`Budget: ${first.budget.usedChars} / 500 chars`)
    expect(rendered).toBe(renderTaskContext(second))
    expect(new Set(first.relevantFiles.map((file) => file.path)).size).toBe(first.relevantFiles.length)
    expect(new Set(first.relationships.map((row) => row.key)).size).toBe(first.relationships.length)
  })

  it('exposes code_context through the normal tool surface', async () => {
    const codeContext = tools.find((tool) => tool.name === 'code_context')
    expect(codeContext).toBeDefined()
    const root = await fixtureRepo()
    const result = (await codeContext!.execute(
      { task: 'How does loadConfig work?', repoRoot: root, budgetChars: 2_000 },
      {} as never,
    )) as string
    expect(result).toContain('Task context')
    expect(result).toContain('loadConfig')
    expect(result.length).toBeLessThanOrEqual(2_000)
    const structured = await codeContext!.execute(
      { task: 'How does loadConfig work?', repoRoot: root, budgetChars: 2_000, outputFormat: 'pack' }, {} as never,
    )
    expect(typeof structured).toBe('object')
    expect(JSON.stringify(structured).length).toBeLessThanOrEqual(2_000)
    expect(structured).toMatchObject({ version: 1, route: 'symbol' })
  })

  it('selects one final pack for both source text and DTO under a hard budget', async () => {
    const root = await fixtureRepo()
    const index = await buildIndex(root)
    for (const budget of [300, 500, 2000, 5000]) {
      const result = await buildTaskContext(index, 'Explain loadConfig', { budgetChars: budget })
      expect(renderTaskContext(result).length).toBeLessThanOrEqual(budget)
      expect(JSON.stringify(result.pack).length).toBeLessThanOrEqual(budget)
      expect(result.pack.budget.packChars).toBe(JSON.stringify(result.pack).length)
      for (const item of result.pack.items) {
        expect(item.reason).toBeTruthy()
        if (item.code !== undefined) {
          expect(item.endLine! - item.startLine! + 1).toBe(item.code.split('\n').length)
          expect(renderTaskContext(result)).toContain(item.code)
        }
      }
      for (const seed of result.primarySymbols) expect(result.pack.items.some(item => item.name === seed.symbol.name)).toBe(true)
    }
    const result = await buildTaskContext(index, 'Explain loadConfig')
    expect(result.pack.items).toContainEqual(expect.objectContaining({
      kind: 'primary', file: 'src/config.ts', startLine: 1, endLine: 1,
      code: 'export function loadConfig() { return parseConfig() }', side: 'current',
    }))
  })

  it('keeps failed root-resolution diagnostics within the hard budget', async () => {
    const root = await fixtureRepo()
    const invalid = path.join(root, ...Array.from({ length: 14 }, () => 'missing'), 'z'.repeat(1000))
    const tool = tools.find(tool => tool.name === 'code_context')!
    const result = await tool.execute({ task: 'Explain target', repoRoot: invalid, budgetChars: 300 }, {} as never)
    expect(typeof result).toBe('string')
    expect(result as string).toMatch(/^code_context:/)
    expect((result as string).length).toBeLessThanOrEqual(300)
  })
})
