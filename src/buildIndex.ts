/** Build a RepoIndex for a workspace: scan -> extract -> persist. */

import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { extractAll, languageForFile } from './extract.js'
import { scanRepo, DEFAULT_EXCLUDED_DIRS } from './scan.js'
import {
  cacheKeyForRoot,
  defaultCachePath,
  legacyCachePath,
  loadIndex,
  saveIndex,
} from './store.js'
import type { IndexOptions, IndexedFile, RepoIndex } from './types.js'

/**
 * Full build: scan + extract every supported file. Existing per-file
 * extraction is reused when `previous` holds an identical mtime for the
 * same rel path (incremental refresh), so touched files alone re-parse.
 */
export async function buildIndex(
  root: string,
  options: IndexOptions = {},
  previous: RepoIndex | null = null,
): Promise<RepoIndex> {
  const scanned = await scanRepo(root, options)

  // Index stale/current state from the previous run by rel path.
  const prevByPath = new Map((previous?.files ?? []).map((f) => [f.path, f]))
  const prevMtime = new Map((previous?.files ?? []).map((f) => [f.path, f.mtimeMs]))

  const files: IndexedFile[] = []
  const BATCH = 8
  for (let i = 0; i < scanned.length; i += BATCH) {
    const batch = scanned.slice(i, i + BATCH)
    const rows = await Promise.all(
      batch.map(async (f) => {
        const lang = languageForFile(f.abs)
        if (!lang) return null
        if (prevMtime.get(f.rel) === f.mtimeMs) {
          const cached = prevByPath.get(f.rel)!
          return {
            ...cached,
            mtimeMs: f.mtimeMs,
            symbols: cached.symbols.map((symbol) => ({ ...symbol, file: f.rel })),
          }
        }
        let code: string
        try {
          code = await readFile(f.abs, 'utf8')
        } catch {
          return null
        }
        const { symbols, imports } = await extractAll(code, lang)
        // Backfill the repo-relative path: the extractor is file-agnostic and
        // leaves SymbolInfo.file empty, but search/render depend on it.
        return {
          path: f.rel,
          lang,
          mtimeMs: f.mtimeMs,
          symbols: symbols.map((s) => ({ ...s, file: f.rel })),
          imports,
        } satisfies IndexedFile
      }),
    )
    for (const f of rows) {
      if (f) files.push(f)
    }
  }

  return {
    root,
    generatedAt: Date.now(),
    files,
    excludedDirs: [...DEFAULT_EXCLUDED_DIRS, ...(options.excludeDirs ?? [])],
  }
}

/** Convenience wrapper: evolve an on-disk cache if `root` exists. */
export async function buildIndexWithCache(
  root: string,
  options: IndexOptions = {},
  cacheDir?: string,
): Promise<RepoIndex> {
  const cachePath = defaultCachePath(root, cacheDir)
  let prev = await loadIndex(cachePath)
  let loadedLegacy = false
  if (!prev) {
    const oldPath = legacyCachePath(root, cacheDir)
    if (oldPath !== cachePath) {
      prev = await loadIndex(oldPath)
      loadedLegacy = prev !== null
    }
  }
  const reusable = prev && cacheKeyForRoot(prev.root) === cacheKeyForRoot(root) ? prev : null
  const fresh = await buildIndex(root, options, reusable)
  if (prev && indexesEqual(prev, fresh)) {
    if (loadedLegacy) await saveIndex(cachePath, fresh)
    return loadedLegacy ? fresh : prev
  }
  await saveIndex(cachePath, fresh)
  return fresh
}

function indexesEqual(left: RepoIndex, right: RepoIndex): boolean {
  if (cacheKeyForRoot(left.root) !== cacheKeyForRoot(right.root)) return false
  if (left.files.length !== right.files.length) return false
  if (left.excludedDirs.length !== right.excludedDirs.length) return false
  if (left.excludedDirs.some((value, index) => value !== right.excludedDirs[index])) return false

  return left.files.every((file, fileIndex) => {
    const other = right.files[fileIndex]
    if (!other || file.path !== other.path || file.lang !== other.lang || file.mtimeMs !== other.mtimeMs) {
      return false
    }
    if (file.symbols.length !== other.symbols.length) return false
    return file.symbols.every((symbol, symbolIndex) => {
      const candidate = other.symbols[symbolIndex]
      return candidate !== undefined
        && symbol.name === candidate.name
        && symbol.kind === candidate.kind
        && symbol.file === candidate.file
        && symbol.line === candidate.line
        && symbol.endLine === candidate.endLine
        && symbol.exported === candidate.exported
        && symbol.signature === candidate.signature
    })
  })
}

/**
 * Locate the git repo root for a path by walking up to the nearest `.git`
 * directory. Bounded walk (max `maxLevels` levels); returns `null` when no
 * repo marker is found — callers must NOT index an untagged directory
 * (the fs root is the classic footgun: indexing `C:\` by accident).
 */
export async function findRepoRoot(startDir: string, maxLevels = 12): Promise<string | null> {
  let dir = path.resolve(startDir)
  for (let level = 0; level < maxLevels; level++) {
    try {
      // stat() accepts BOTH a `.git` directory (normal repos) and a `.git`
      // file (worktrees / submodules) — readFile only handled the file form.
      await stat(path.join(dir, '.git'))
      return dir
    } catch {
      // not a repo here — keep walking
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}
