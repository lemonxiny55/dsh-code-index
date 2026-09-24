/** Workspace file discovery with dir exclusions and mtime tracking. */

import { readFile, readdir, stat } from 'node:fs/promises'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import ignore from 'ignore'
import type { IndexOptions } from './types.js'

export const DEFAULT_EXCLUDED_DIRS = [
  'node_modules',
  '.git',
  '.idea',
  '.vscode',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  'target',
  'vendor',
  '.dsh-code-index',
]

/** Language-agnostic source extensions we index. */
export const SUPPORTED_EXTS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.pyi',
  '.go',
  '.rs',
  '.java',
  '.cpp',
  '.cc',
  '.cxx',
  '.c++',
  '.hpp',
  '.hxx',
  '.hh',
  '.h',
  '.ipp',
  '.tpp',
  '.inl',
  '.c',
])

export type GitIgnoreMatcherCache = Map<string, {
  mtimeMs: number
  size: number
  matcher: ReturnType<typeof ignore>
}>

/** Check root and nested Git ignore rules for a repo-relative path. */
export function isGitIgnoredPath(
  root: string,
  relativePath: string,
  cache: GitIgnoreMatcherCache = new Map(),
): boolean {
  const rel = relativePath.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!rel) return false
  const parentParts = rel.split('/').slice(0, -1)
  for (let depth = 0; depth <= parentParts.length; depth += 1) {
    const base = parentParts.slice(0, depth).join('/')
    const ignoreFile = path.join(root, base, '.gitignore')
    let fileStat
    try {
      fileStat = statSync(ignoreFile)
    } catch {
      continue
    }
    const previous = cache.get(ignoreFile)
    let matcher = previous?.matcher
    if (!previous || previous.mtimeMs !== fileStat.mtimeMs || previous.size !== fileStat.size) {
      try {
        matcher = ignore().add(readFileSync(ignoreFile, 'utf8'))
        cache.set(ignoreFile, { mtimeMs: fileStat.mtimeMs, size: fileStat.size, matcher })
      } catch {
        cache.delete(ignoreFile)
        continue
      }
    }
    const scoped = base ? path.posix.relative(base, rel) : rel
    if (matcher?.ignores(scoped)) return true
  }
  return false
}

export interface ScannedFile {
  /** Absolute path on disk. */
  abs: string
  /** Repo-relative path (forward-slash). */
  rel: string
  mtimeMs: number
}

/**
 * Recursively walk `root` and return indexed files, skipping excluded dir
 * components at any depth. Uses readdir with `withFileTypes` so we never
 * stat every entry; mtime comes from a targeted stat per candidate file.
 */
export async function scanRepo(
  root: string,
  options: IndexOptions = {},
): Promise<ScannedFile[]> {
  const excluded = new Set([...DEFAULT_EXCLUDED_DIRS, ...(options.excludeDirs ?? [])])
  const results: ScannedFile[] = []
  type IgnoreLayer = { base: string; matcher: ReturnType<typeof ignore> }
  const queue: Array<[string, string, IgnoreLayer[]]> = [[root, '', []]] // [absDir, relDir, inherited ignore files]

  while (queue.length) {
    const [absDir, relDir, inherited] = queue.pop()!
    let layers = inherited
    try {
      const rules = await readFile(path.join(absDir, '.gitignore'), 'utf8')
      layers = [...inherited, { base: relDir, matcher: ignore().add(rules) }]
    } catch {
      // Missing or unreadable ignore file does not prevent indexing.
    }
    const ignoredByGit = (relativePath: string): boolean => layers.some(({ base, matcher }) => {
      const scoped = base ? path.posix.relative(base, relativePath) : relativePath
      return scoped !== '..' && !scoped.startsWith('../') && matcher.ignores(scoped)
    })
    let entries
    try {
      entries = await readdir(absDir, { withFileTypes: true })
    } catch {
      continue // unreadable dir: skip into the void
    }
    for (const entry of entries) {
      const abs = path.join(absDir, entry.name)
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (excluded.has(entry.name)) continue
        if (!ignoredByGit(rel)) queue.push([abs, rel, layers])
      } else if (entry.isFile() && !ignoredByGit(rel) && SUPPORTED_EXTS.has(path.extname(entry.name).toLowerCase())) {
        try {
          const st = await stat(abs)
          results.push({ abs, rel, mtimeMs: st.mtimeMs })
        } catch {
          // race: file deleted mid-scan — ignore
        }
      }
    }
  }

  results.sort((a, b) => a.rel.localeCompare(b.rel))
  return results
}
