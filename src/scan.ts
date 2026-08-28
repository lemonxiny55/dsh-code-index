/** Workspace file discovery with dir exclusions and mtime tracking. */

import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
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
])

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
  const queue: Array<[string, string]> = [[root, '']] // [absDir, relDir]

  while (queue.length) {
    const [absDir, relDir] = queue.pop()!
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
        queue.push([abs, rel])
      } else if (entry.isFile() && SUPPORTED_EXTS.has(path.extname(entry.name).toLowerCase())) {
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