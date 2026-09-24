import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { activateRepoContextManager, clearRepoContextManager, tools } from '../src/tools.js'
import { RepoContextManager } from '../src/repo-context.js'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('RepoContextManager', () => {
  it('keeps A and B isolated across A → B → A and refreshes external edits', async () => {
    const a = await mkdtemp(path.join(os.tmpdir(), 'dsh-code-index-a-'))
    const b = await mkdtemp(path.join(os.tmpdir(), 'dsh-code-index-b-'))
    tempDirs.push(a, b)
    for (const root of [a, b]) await mkdir(path.join(root, '.git'))
    await mkdir(path.join(a, 'src'))
    await mkdir(path.join(b, 'src'))
    await writeFile(path.join(a, 'src/a.ts'), 'export function onlyA() { return 1 }\n')
    await writeFile(path.join(b, 'src/b.ts'), 'export function onlyB() { return 2 }\n')
    const fixedTimestamp = new Date('2020-01-01T00:00:00.000Z')
    await utimes(path.join(a, 'src/a.ts'), fixedTimestamp, fixedTimestamp)
    const manager = new RepoContextManager({ indexOptions: () => ({}), watch: false })
    try {
      const firstA = await manager.get(a)
      const firstB = await manager.get(b)
      expect(firstA.files.flatMap((file) => file.symbols.map((symbol) => symbol.name))).toContain('onlyA')
      expect(firstA.files.flatMap((file) => file.symbols.map((symbol) => symbol.name))).not.toContain('onlyB')
      expect(firstB.files.flatMap((file) => file.symbols.map((symbol) => symbol.name))).toContain('onlyB')
      expect(firstB.files.flatMap((file) => file.symbols.map((symbol) => symbol.name))).not.toContain('onlyA')
      await writeFile(path.join(b, 'src/b.ts'), 'export function changedB() { return 3 }\n')
      const secondA = await manager.get(a)
      const secondB = await manager.get(b)
      expect(secondA.root).toBe(firstA.root)
      expect(secondB.files.flatMap((file) => file.symbols.map((symbol) => symbol.name))).toContain('changedB')
      expect(secondB.files.flatMap((file) => file.symbols.map((symbol) => symbol.name))).not.toContain('onlyB')

      const source = path.join(a, 'src/a.ts')
      const sourceStat = await stat(source)
      await writeFile(source, 'export function sameMtimeReplacement() { return 4 }\n')
      await utimes(source, sourceStat.atime, sourceStat.mtime)
      const ordinaryRefresh = await manager.get(a)
      expect(ordinaryRefresh.files.flatMap((file) => file.symbols.map((symbol) => symbol.name))).toContain('onlyA')
      const forcedRefresh = await manager.get(a, true)
      expect(forcedRefresh.files.flatMap((file) => file.symbols.map((symbol) => symbol.name))).toContain('sameMtimeReplacement')
    } finally {
      await manager.dispose()
    }
  })

  it('routes code_context and change context through the active session project', async () => {
    const a = await mkdtemp(path.join(os.tmpdir(), 'dsh-code-index-tool-a-'))
    const b = await mkdtemp(path.join(os.tmpdir(), 'dsh-code-index-tool-b-'))
    tempDirs.push(a, b)
    for (const root of [a, b]) {
      await mkdir(path.join(root, '.git'))
      await mkdir(path.join(root, 'src'))
    }
    await writeFile(path.join(a, 'src/a.ts'), 'export function uniqueAlphaTaskMarker() { return 1 }\n')
    await writeFile(path.join(b, 'src/b.ts'), 'export function uniqueBetaTaskMarker() { return 2 }\n')

    const manager = new RepoContextManager({ indexOptions: () => ({}), watch: false })
    activateRepoContextManager(manager)
    try {
      const contextTool = tools.find((tool) => tool.name === 'code_context')!
      const changeTool = tools.find((tool) => tool.name === 'code_change_context')!
      const execAt = (cwd: string) => ({ agent: { session: { header: { cwd } } } }) as Parameters<typeof contextTool.execute>[1]
      const resultA = await contextTool.execute({ task: 'Explain uniqueAlphaTaskMarker.' }, execAt(a))
      const resultB = await contextTool.execute({ task: 'Explain uniqueBetaTaskMarker.' }, execAt(b))
      const resultA2 = await contextTool.execute({ task: 'Explain uniqueAlphaTaskMarker.' }, execAt(a))
      expect(resultA).toContain('uniqueAlphaTaskMarker')
      expect(resultB).toContain('uniqueBetaTaskMarker')
      expect(resultB).not.toContain('uniqueAlphaTaskMarker')
      expect(resultA2).toContain('uniqueAlphaTaskMarker')
      const changeB = await changeTool.execute({ files: ['src/b.ts'] }, execAt(b))
      expect(changeB).toContain('uniqueBetaTaskMarker')
      expect(changeB).not.toContain('uniqueAlphaTaskMarker')
    } finally {
      clearRepoContextManager(manager)
      await manager.dispose()
    }
  })

  it('bounds contexts and closes evicted watchers', async () => {
    const roots = await Promise.all([1, 2, 3].map(() => mkdtemp(path.join(os.tmpdir(), 'dsh-code-index-evict-'))))
    tempDirs.push(...roots)
    for (const root of roots) await mkdir(path.join(root, '.git'))
    const manager = new RepoContextManager({ indexOptions: () => ({}), watch: false, maxContexts: 2 })
    try {
      for (const root of roots) await manager.get(root)
      expect((manager as unknown as { contexts: Map<string, unknown> }).contexts.size).toBe(2)
    } finally {
      await manager.dispose()
    }
  })
})

describe('tool repository boundary', () => {
  it('refuses to index a workspace without a git marker', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-code-index-boundary-'))
    tempDirs.push(root)
    const codeIndex = tools.find((tool) => tool.name === 'code_index')!
    const unusedContext = {} as Parameters<typeof codeIndex.execute>[1]
    const result = await codeIndex.execute({ action: 'status', repoRoot: root }, unusedContext)
    expect(result).toContain('no git repository found')
    await expect(stat(path.join(root, '.dsh-code-index'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('code_refs / code_health tools', () => {
  it('traces callers across a real workspace', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-code-index-refs-'))
    tempDirs.push(root)
    await mkdir(path.join(root, '.git'), { recursive: true })
    await mkdir(path.join(root, 'src'), { recursive: true })
    await writeFile(
      path.join(root, 'src/core.ts'),
      ['export function helper() { return 1 }', 'export function main() { return helper() }'].join('\n'),
    )
    await writeFile(
      path.join(root, 'src/use.ts'),
      ["import { main } from './core'", 'export function run() { return main() }'].join('\n'),
    )

    const refs = tools.find((tool) => tool.name === 'code_refs')!
    const context = {} as Parameters<typeof refs.execute>[1]
    const callers = await refs.execute({ symbol: 'helper', direction: 'callers', repoRoot: root }, context)
    expect(callers).toContain('src/core.ts:2')
    expect(callers).toContain('callers (1)')

    const callees = await refs.execute({ symbol: 'main', direction: 'callees', repoRoot: root }, context)
    expect(callees).toContain('helper :2')
  })

  it('reports an import cycle from the graph', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-code-index-health-'))
    tempDirs.push(root)
    await mkdir(path.join(root, '.git'), { recursive: true })
    await mkdir(path.join(root, 'src'), { recursive: true })
    await writeFile(
      path.join(root, 'src/a.ts'),
      "import { b } from './b'\nexport function a() { return b() }\n",
    )
    await writeFile(
      path.join(root, 'src/b.ts'),
      "import { a } from './a'\nexport function b() { return a() }\n",
    )

    const health = tools.find((tool) => tool.name === 'code_health')!
    const context = {} as Parameters<typeof health.execute>[1]
    const report = await health.execute({ repoRoot: root }, context)
    expect(report).toContain('circular dependencies (1)')
    expect(report).toContain('src/a.ts → src/b.ts')
  })
})
