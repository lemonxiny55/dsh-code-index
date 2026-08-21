import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { buildIndexWithCache } from '../src/buildIndex.js'
import { cacheKeyForRoot, defaultCachePath, loadIndex, saveIndex } from '../src/store.js'
import type { RepoIndex } from '../src/types.js'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-code-index-store-'))
  dirs.push(dir)
  return dir
}

describe('index persistence', () => {
  it('uses one cache key for Windows path casing aliases', () => {
    expect(cacheKeyForRoot('C:\\Repo')).toBe(cacheKeyForRoot('c:\\repo'))
  })

  it('migrates the legacy case-sensitive cache filename', async () => {
    const root = await tempDir()
    await mkdir(path.join(root, 'src'))
    const sourcePath = path.join(root, 'src', 'index.ts')
    await writeFile(sourcePath, 'export const value = 1\n')
    const sourceStat = await stat(sourcePath)
    const cacheDir = path.join(root, 'cache')
    const legacyHash = createHash('sha1').update(root).digest('hex').slice(0, 12)
    const legacyPath = path.join(cacheDir, `${legacyHash}.json`)
    const legacy: RepoIndex = {
      root,
      generatedAt: 123,
      excludedDirs: [],
      files: [{
        path: 'src/index.ts',
        lang: 'typescript',
        mtimeMs: sourceStat.mtimeMs,
        symbols: [{ name: 'legacyOnly', kind: 'variable', file: '', line: 1, endLine: 1, exported: true, signature: 'legacyOnly' }],
      }],
    }
    await saveIndex(legacyPath, legacy)
    const migrated = await buildIndexWithCache(root, {}, cacheDir)
    expect(migrated.files[0].symbols[0]).toMatchObject({ name: 'legacyOnly', file: 'src/index.ts' })
    expect(await loadIndex(defaultCachePath(root, cacheDir))).toEqual(migrated)
  })

  it('reuses a Windows cache across root casing aliases', async () => {
    const root = await tempDir()
    await mkdir(path.join(root, 'src'))
    await writeFile(path.join(root, 'src', 'index.ts'), 'export const value = 1\n')
    const cacheDir = path.join(root, 'cache')
    const cachePath = defaultCachePath(root, cacheDir)
    await buildIndexWithCache(root, {}, cacheDir)
    const first = await stat(cachePath)
    await new Promise((resolve) => setTimeout(resolve, 20))
    await buildIndexWithCache(root.toLowerCase(), {}, cacheDir)
    const second = await stat(cachePath)
    expect(second.mtimeMs).toBe(first.mtimeMs)
  })

  it('does not rewrite an unchanged cache', async () => {
    const root = await tempDir()
    await mkdir(path.join(root, 'src'))
    await writeFile(path.join(root, 'src', 'index.ts'), 'export const value = 1\n')
    const cachePath = defaultCachePath(root)
    await buildIndexWithCache(root)
    const first = await stat(cachePath)
    await new Promise((resolve) => setTimeout(resolve, 20))
    await buildIndexWithCache(root)
    const second = await stat(cachePath)
    expect(second.mtimeMs).toBe(first.mtimeMs)
  })

  it('replaces cache contents with valid json', async () => {
    const root = await tempDir()
    const cachePath = defaultCachePath(root)
    const value: RepoIndex = { root, generatedAt: 123, files: [], excludedDirs: [] }
    await saveIndex(cachePath, { ...value, generatedAt: 1 })
    await saveIndex(cachePath, value)
    expect(await loadIndex(cachePath)).toEqual(value)
    const raw = await readFile(cachePath, 'utf8')
    expect(() => JSON.parse(raw)).not.toThrow()
    expect(await readdir(path.dirname(cachePath))).toEqual([path.basename(cachePath)])
  })
})
