/** On-disk JSON cache for RepoIndex, keyed by repo root. */

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { RepoIndex } from './types.js'

export const CACHE_DIR_NAME = '.dsh-code-index'

/** Stable root identity for cache hashing, including Windows case aliases. */
export function cacheKeyForRoot(root: string): string {
  const resolved = path.resolve(root)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/** Default cache location: `<repoRoot>/.dsh-code-index/index.json`. */
export function defaultCachePath(root: string, cacheDir?: string): string {
  const dir = cacheDir ?? path.join(root, CACHE_DIR_NAME)
  const hash = createHash('sha1').update(cacheKeyForRoot(root)).digest('hex').slice(0, 12)
  return path.join(dir, `${hash}.json`)
}

/** Cache filename used before Windows root casing was canonicalized. */
export function legacyCachePath(root: string, cacheDir?: string): string {
  const dir = cacheDir ?? path.join(root, CACHE_DIR_NAME)
  const hash = createHash('sha1').update(root).digest('hex').slice(0, 12)
  return path.join(dir, `${hash}.json`)
}

export async function loadIndex(cachePath: string): Promise<RepoIndex | null> {
  try {
    const raw = await readFile(cachePath, 'utf8')
    const parsed = JSON.parse(raw) as RepoIndex
    if (!parsed || typeof parsed.root !== 'string' || !Array.isArray(parsed.files)) return null
    return healSymbolFiles(parsed)
  } catch {
    return null // missing or corrupt cache == no cache
  }
}

/**
 * Self-heal caches written before the per-symbol file backfill (the
 * "SymbolInfo.file is always set" invariant). Empty `file` fields are derived
 * from the containing IndexedFile path on load, so any consumer of loadIndex
 * sees consistent rows — and the next save persists the healed form.
 */
export function healSymbolFiles(index: RepoIndex): RepoIndex {
  for (const file of index.files) {
    for (const symbol of file.symbols) {
      if (!symbol.file) symbol.file = file.path
    }
  }
  return index
}

export async function saveIndex(cachePath: string, index: RepoIndex): Promise<void> {
  await mkdir(path.dirname(cachePath), { recursive: true })
  const temporaryPath = `${cachePath}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, JSON.stringify(index, null, 2), { encoding: 'utf8', flag: 'wx' })
    await rename(temporaryPath, cachePath)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}
