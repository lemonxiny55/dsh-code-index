import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildIndex } from '../src/buildIndex.js'
import { buildTaskContext, renderTaskContext, routeTask } from '../src/context.js'
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
      provenance: 'exact',
      symbol: { name: 'parseConfig', file: 'src/config.ts' },
    })
    expect(result.primarySymbols.find((item) => item.symbol.name === 'parseConfig')?.score).toBeGreaterThan(
      result.primarySymbols.find((item) => item.symbol.name === 'loadConfig')?.score ?? 0,
    )
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
    expect(result.relationships.some((row) => row.resolution === 'exact')).toBe(true)
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
  })
})
