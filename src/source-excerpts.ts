import { readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { readGitFileAtRef } from './git-diff.js'
import type { RepoIndex, SymbolInfo } from './types.js'

export interface SourceExcerpt {
  file: string
  startLine: number
  endLine: number
  side: 'current' | 'base'
  ref?: string
  mode: 'complete' | 'window' | 'signature'
  code?: string
  signature?: string
}

/** Per-request reader. Source bodies are never persisted in the index. */
export function sourceReader(index: RepoIndex) {
  const cache = new Map<string, Promise<string[] | null>>()
  return async (file: string, side: 'current' | 'base', ref?: string): Promise<string[] | null> => {
    const key = `${side}:${ref ?? ''}:${file}`
    if (!cache.has(key)) cache.set(key, (async () => {
      if (side === 'base') {
        if (!ref) return null
        const code = await readGitFileAtRef(index.root, ref, file)
        return code === null ? null : code.split(/\r?\n/)
      }
      const indexed = index.files.find(entry => entry.path === file)
      if (!indexed) return null
      try {
        const root = await realpath(index.root)
        const target = await realpath(path.join(root, file))
        const relative = path.relative(root, target)
        if (relative.startsWith('..') || path.isAbsolute(relative)) return null
        const before = await stat(target)
        if (before.size > 1_000_000 || before.mtimeMs !== indexed.mtimeMs) return null
        const code = await readFile(target, 'utf8')
        const after = await stat(target)
        if (after.mtimeMs !== before.mtimeMs || after.size !== before.size) return null
        return code.split(/\r?\n/)
      } catch { return null }
    })())
    return cache.get(key)!
  }
}

/** Whole declarations → whole-line bounded windows → signature metadata.
 * A signature fallback is not represented as executable/source code. */
export function excerptVariants(
  lines: readonly string[] | null, symbol: Pick<SymbolInfo, 'file' | 'line' | 'endLine' | 'signature'>,
  side: 'current' | 'base' = 'current', ref?: string, focusLine = symbol.line,
): SourceExcerpt[] {
  const base = { file: symbol.file, side, ...(ref ? { ref } : {}) }
  const signature: SourceExcerpt = { ...base, startLine: symbol.line, endLine: symbol.line,
    mode: 'signature', signature: symbol.signature }
  if (!lines || symbol.line < 1 || symbol.endLine > lines.length) return [signature]
  const ranges = [
    { start: symbol.line, end: symbol.endLine, mode: 'complete' as const },
    { start: Math.max(symbol.line, focusLine - 3), end: Math.min(symbol.endLine, focusLine + 5), mode: 'window' as const },
    { start: symbol.line, end: Math.min(symbol.endLine, symbol.line + 2), mode: 'window' as const },
  ]
  const seen = new Set<string>()
  const variants: SourceExcerpt[] = []
  for (const range of ranges) {
    const key = `${range.start}:${range.end}`
    if (seen.has(key) || range.end < range.start) continue
    seen.add(key)
    const code = lines.slice(range.start - 1, range.end).join('\n')
    if (code.length > 1600 || range.end - range.start >= 80) continue
    variants.push({ ...base, startLine: range.start, endLine: range.end, mode: range.mode, code })
  }
  return [...variants, signature]
}

/** Remove already selected lines, independently for each source side/ref. */
export function subtractExcerpt(excerpt: SourceExcerpt, selected: readonly SourceExcerpt[]): SourceExcerpt[] {
  if (excerpt.code === undefined) return [excerpt]
  const covered = selected.filter(item => item.code !== undefined && item.file === excerpt.file &&
    item.side === excerpt.side && item.ref === excerpt.ref)
  const lines = excerpt.code.split('\n')
  const fragments: SourceExcerpt[] = []
  let start: number | null = null
  for (let line = excerpt.startLine; line <= excerpt.endLine + 1; line++) {
    const include = line <= excerpt.endLine && !covered.some(item => line >= item.startLine && line <= item.endLine)
    if (include && start === null) start = line
    if (!include && start !== null) {
      fragments.push({ ...excerpt, startLine: start, endLine: line - 1,
        mode: start === excerpt.startLine && line - 1 === excerpt.endLine ? excerpt.mode : 'window',
        code: lines.slice(start - excerpt.startLine, line - excerpt.startLine).join('\n') })
      start = null
    }
  }
  return fragments
}
