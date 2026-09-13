import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createIndexCache, tools } from '../src/tools.js'
import type { RepoIndex } from '../src/types.js'

function index(root: string, generatedAt: number): RepoIndex {
  return { root, generatedAt, files: [], excludedDirs: [] }
}

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('createIndexCache', () => {
  it('retains completed indexes until the ttl expires', async () => {
    let loads = 0
    let now = 1_000
    const cache = createIndexCache(async (root) => index(root, ++loads), 60_000, () => now)

    const first = await cache.get('C:\\repo')
    const second = await cache.get('C:\\repo')
    expect(second).toBe(first)
    expect(loads).toBe(1)

    now += 60_001
    const refreshed = await cache.get('C:\\repo')
    expect(refreshed).not.toBe(first)
    expect(loads).toBe(2)
  })

  it('coalesces concurrent loads and supports forced refresh', async () => {
    let loads = 0
    const releases: Array<() => void> = []
    const cache = createIndexCache(async (root) => {
      loads++
      await new Promise<void>((resolve) => { releases.push(resolve) })
      return index(root, loads)
    })
    const first = cache.get('C:\\repo')
    const second = cache.get('C:\\repo')
    const forced = cache.get('C:\\repo', true)
    expect(loads).toBe(1)
    releases.shift()!()
    expect(await second).toBe(await first)
    await vi.waitFor(() => expect(loads).toBe(2))
    releases.shift()!()
    expect(await forced).not.toBe(await first)
  })

  // Same win32-only branch as cacheKeyForRoot — see store.spec.ts.
  it.skipIf(process.platform !== 'win32')('canonicalizes Windows path casing', async () => {
    let loads = 0
    const cache = createIndexCache(async (root) => index(root, ++loads))
    const first = await cache.get('C:\\Repo')
    const second = await cache.get('c:\\repo')
    expect(second).toBe(first)
    expect(loads).toBe(1)
  })

  it('queues a fresh load after invalidation during an in-flight load', async () => {
    let loads = 0
    const releases: Array<() => void> = []
    const cache = createIndexCache(async (root) => {
      loads++
      await new Promise<void>((resolve) => { releases.push(resolve) })
      return index(root, loads)
    })
    const oldLoad = cache.get('C:\\repo')
    cache.invalidate()
    const newLoad = cache.get('C:\\repo')
    releases.shift()!()
    await oldLoad
    await vi.waitFor(() => expect(loads).toBe(2))
    releases.shift()!()
    expect((await newLoad).generatedAt).toBe(2)
  })

  it('queues every forced refresh behind an in-flight refresh', async () => {
    let loads = 0
    const releases: Array<() => void> = []
    const cache = createIndexCache(async (root) => {
      loads++
      await new Promise<void>((resolve) => { releases.push(resolve) })
      return index(root, loads)
    })
    const first = cache.get('C:\\repo', true)
    const second = cache.get('C:\\repo', true)
    releases.shift()!()
    await first
    await vi.waitFor(() => expect(loads).toBe(2))
    releases.shift()!()
    expect((await second).generatedAt).toBe(2)
  })

  it('serves a queued refresh instead of the completed stale load', async () => {
    let loads = 0
    const releases: Array<() => void> = []
    const cache = createIndexCache(async (root) => {
      loads++
      await new Promise<void>((resolve) => { releases.push(resolve) })
      return index(root, loads)
    })
    const stale = cache.get('C:\\repo')
    const refresh = cache.get('C:\\repo', true)
    releases.shift()!()
    await stale
    await vi.waitFor(() => expect(loads).toBe(2))
    const reader = cache.get('C:\\repo')
    releases.shift()!()
    expect(await reader).toBe(await refresh)
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
