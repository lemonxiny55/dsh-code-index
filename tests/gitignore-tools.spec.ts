import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { activateRepoContextManager, clearRepoContextManager, tools } from '../src/tools.js'
import { RepoContextManager } from '../src/repo-context.js'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('Issue #2 tool regression', () => {
  it('returns whitelisted source and affected tests, and refreshes without manual rebuild', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-code-ignore-tools-'))
    roots.push(root)
    const source = 'extensions/keep/kept.ts'
    const test = 'extensions/keep/tests/kept.spec.ts'
    await mkdir(path.join(root, 'extensions/keep/tests'), { recursive: true })
    await mkdir(path.join(root, 'extensions/other'), { recursive: true })
    await mkdir(path.join(root, 'src'))
    await writeFile(path.join(root, '.gitignore'), '/extensions/*\n!/extensions/keep/\n!/extensions/keep/**\n')
    await writeFile(path.join(root, 'extensions/keep/.gitignore'), '*.generated.ts\n')
    await writeFile(path.join(root, source), 'export function KEPT_MARKER_fn() { return 1 }\n')
    await writeFile(path.join(root, test), "import { KEPT_MARKER_fn } from '../kept'\nexport function keptTest() { return KEPT_MARKER_fn() }\n")
    await writeFile(path.join(root, 'extensions/keep/drop.generated.ts'), 'export function DROPPED_fn() {}\n')
    await writeFile(path.join(root, 'extensions/other/skip.ts'), 'export function SKIPPED_fn() {}\n')
    await writeFile(path.join(root, 'src/control.ts'), 'export function CONTROL_MARKER_fn() {}\n')
    const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args])
    git('init', '--quiet')
    git('config', 'user.name', 'Gitignore Test')
    git('config', 'user.email', 'gitignore@example.invalid')
    git('add', '.')
    git('commit', '--quiet', '-m', 'seed')
    const manager = new RepoContextManager({ indexOptions: () => ({}), watch: false })
    activateRepoContextManager(manager)
    const exec = { agent: { session: { header: { cwd: root } } } } as never
    const call = (name: string, args: Record<string, unknown>) => tools.find((tool) => tool.name === name)!.execute(args as never, exec)
    try {
      expect(await call('code_index', { action: 'build' })).toContain('files indexed: 3')
      expect(await call('code_search', { query: 'KEPT_MARKER_fn' })).toMatchObject([{ file: source, name: 'KEPT_MARKER_fn', line: 1 }])
      expect(await call('code_search', { query: 'SKIPPED_fn' })).toEqual([])
      expect(await call('code_search', { query: 'DROPPED_fn' })).toEqual([])
      const context = await call('code_context', { task: 'Explain KEPT_MARKER_fn' })
      expect(context).toContain(source)
      expect(context).toContain('return 1')
      expect(context).toContain(test)
      await writeFile(path.join(root, source), 'export function KEPT_MARKER_fn() { return 91 }\n')
      const changes = await call('code_change_context', {})
      expect(changes).toContain('KEPT_MARKER_fn')
      expect(changes).toContain(test)
      expect(await call('code_context', { task: 'Explain KEPT_MARKER_fn' })).toContain('return 91')
      const added = path.join(root, 'extensions/keep/added.ts')
      await writeFile(added, 'export function FRESH_MARKER_fn() { return 7 }\n')
      expect(await call('code_search', { query: 'FRESH_MARKER_fn' })).toMatchObject([{ file: 'extensions/keep/added.ts', name: 'FRESH_MARKER_fn' }])
      await rm(added)
      expect(await call('code_search', { query: 'FRESH_MARKER_fn' })).toEqual([])
      await writeFile(path.join(root, 'extensions/keep/.gitignore'), '*.generated.ts\nadded.ts\n')
      await writeFile(added, 'export function FRESH_MARKER_fn() {}\n')
      expect(await call('code_search', { query: 'FRESH_MARKER_fn' })).toEqual([])
      await rm(path.join(root, 'extensions/keep/.gitignore'))
      expect(await call('code_search', { query: 'FRESH_MARKER_fn' })).toMatchObject([{ name: 'FRESH_MARKER_fn' }])
    } finally {
      clearRepoContextManager(manager)
      await manager.dispose()
    }
  })
})
