import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { RepoContextManager } from '../src/repo-context.js'
import { findRepoRoot } from '../src/buildIndex.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function repo(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-code-index-watch-'))
  roots.push(root)
  await mkdir(path.join(root, '.git'))
  await mkdir(path.join(root, 'src'))
  return root
}

async function ready(manager: RepoContextManager, root: string): Promise<void> {
  const context = manager.getContext(root)
  const watcher = context?.watcher
  if (!watcher) throw new Error('watcher was not created')
  const internal = watcher as unknown as { _readyEmitted?: boolean }
  if (internal._readyEmitted) return
  await new Promise<void>((resolve) => watcher.once('ready', resolve))
}

function names(manager: RepoContextManager, root: string): string[] {
  return manager.getContext(root)?.index?.files.flatMap((file) => file.symbols.map((symbol) => symbol.name)) ?? []
}

function indexedPaths(manager: RepoContextManager, root: string): string[] {
  return manager.getContext(root)?.index?.files.map((file) => file.path) ?? []
}

describe('live RepoContext freshness', () => {
  it('coalesces external add/change/rename/delete events and respects ignored paths', async () => {
    const root = await repo()
    const refreshed = vi.fn()
    const manager = new RepoContextManager({
      indexOptions: () => ({ excludeDirs: ['secrets'] }),
      debounceMs: 100,
      onRefresh: refreshed,
    })
    try {
      await writeFile(path.join(root, 'src/base.ts'), 'export function baseline() { return 1 }\n')
      await manager.get(root)
      await ready(manager, root)

      const added = path.join(root, 'src/added.ts')
      await writeFile(added, 'export function addedSymbol() { return 2 }\n')
      await vi.waitFor(() => expect(names(manager, root)).toContain('addedSymbol'), { timeout: 5_000 })

      await writeFile(added, 'export function changedSymbol() { return 3 }\n')
      await vi.waitFor(() => {
        expect(names(manager, root)).toContain('changedSymbol')
        expect(names(manager, root)).not.toContain('addedSymbol')
      }, { timeout: 5_000 })

      const renamed = path.join(root, 'src/renamed.ts')
      await rename(added, renamed)
      await vi.waitFor(() => expect(indexedPaths(manager, root)).toContain('src/renamed.ts'), { timeout: 5_000 })
      await rm(renamed)
      await vi.waitFor(() => expect(indexedPaths(manager, root)).not.toContain('src/renamed.ts'), { timeout: 5_000 })

      await mkdir(path.join(root, 'secrets'))
      await writeFile(path.join(root, 'secrets/hidden.ts'), 'export function secretSymbol() {}\n')
      await manager.get(root)
      expect(names(manager, root)).not.toContain('secretSymbol')
      expect(refreshed.mock.calls.length).toBeLessThanOrEqual(6)
    } finally {
      await manager.dispose()
    }
  })

  it('stops callbacks after dispose while a debounced event is pending', async () => {
    const root = await repo()
    const refreshed = vi.fn()
    const manager = new RepoContextManager({ indexOptions: () => ({}), debounceMs: 500, onRefresh: refreshed })
    await manager.get(root)
    await ready(manager, root)
    await writeFile(path.join(root, 'src/pending.ts'), 'export function pending() {}\n')
    await manager.dispose()
    const countAtDispose = refreshed.mock.calls.length
    await vi.waitFor(() => expect(manager.getContext(root)).toBeUndefined())
    expect(refreshed).toHaveBeenCalledTimes(countAtDispose)
  })

  it('canonicalizes separator and trailing-slash aliases to one context', async () => {
    const root = await repo()
    const manager = new RepoContextManager({ indexOptions: () => ({}), watch: false })
    try {
      const first = await manager.get(root)
      const aliased = await manager.get(`${root.replaceAll('\\', '/')}/`)
      expect(aliased.root).toBe(first.root)
      expect((manager as unknown as { contexts: Map<string, unknown> }).contexts.size).toBe(1)
    } finally {
      await manager.dispose()
    }
  })

  it('keeps linked Git worktrees on separate indexes and roots', async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'dsh-code-worktrees-'))
    roots.push(parent)
    const primary = path.join(parent, 'primary')
    const linked = path.join(parent, 'linked')
    await mkdir(path.join(primary, 'src'), { recursive: true })
    await writeFile(path.join(primary, 'src/main.ts'), 'export function primaryOnly() { return 1 }\n')
    execFileSync('git', ['init', '--quiet', primary])
    execFileSync('git', ['-C', primary, 'config', 'user.name', 'Repo Context Test'])
    execFileSync('git', ['-C', primary, 'config', 'user.email', 'repo-context@example.invalid'])
    execFileSync('git', ['-C', primary, 'add', '.'])
    execFileSync('git', ['-C', primary, 'commit', '--quiet', '-m', 'seed'])
    execFileSync('git', ['-C', primary, 'worktree', 'add', '--quiet', '--detach', linked])
    await writeFile(path.join(linked, 'src/main.ts'), 'export function linkedOnly() { return 2 }\n')

    const manager = new RepoContextManager({ indexOptions: () => ({}), watch: false })
    try {
      const first = await manager.get(primary)
      const second = await manager.get(linked)
      expect(await findRepoRoot(path.join(linked, 'src'))).toBe(linked)
      expect(first.root).not.toBe(second.root)
      expect(names(manager, primary)).toContain('primaryOnly')
      expect(names(manager, primary)).not.toContain('linkedOnly')
      expect(names(manager, linked)).toContain('linkedOnly')
      expect(names(manager, linked)).not.toContain('primaryOnly')
    } finally {
      await manager.dispose()
      execFileSync('git', ['-C', primary, 'worktree', 'remove', '--force', linked])
    }
  })
})
