/** Shared data model for dsh-code-index. */

export type SymbolKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'variable'
  | 'field'
  | 'import'
  | 'module'

export interface SymbolInfo {
  /** Symbol name (identifier / type id / member name). */
  name: string
  kind: SymbolKind
  /** Repo-relative path of the containing file, always forward-slash. */
  file: string
  /** 1-based start line. */
  line: number
  /** 1-based end line (inclusive). */
  endLine: number
  /** True when the symbol is exported at module level (export .. / export default). */
  exported: boolean
  /** Short human-readable signature, e.g. `greet(name: string)` — empty when n/a. */
  signature: string
}

export interface IndexedFile {
  /** Repo-relative path (forward-slash). */
  path: string
  lang: string
  /** fs mtime of the source file at index time (milliseconds). */
  mtimeMs: number
  symbols: SymbolInfo[]
  /** Raw import specifiers found in this file ('./util', 'mypkg/core', …).
   *  Optional because caches written before reference ranking lack it. */
  imports?: string[]
}

export interface RepoIndex {
  /** Absolute source root this index describes. */
  root: string
  /** Unix ms when the index was generated. */
  generatedAt: number
  files: IndexedFile[]
  excludedDirs: string[]
}

export function symbolCount(index: RepoIndex): number {
  return index.files.reduce((n, f) => n + f.symbols.length, 0)
}

/** Optional config consumed by the index build pipeline. */
export interface IndexOptions {
  /** Extra directories to exclude, appended to the defaults. */
  excludeDirs?: string[]
  /** Minimum mtime delta (ms) that forces a re-extract in refresh mode. */
  staleToleranceMs?: number
}