/** Shared data model for dsh-code-index. */

/** On-disk cache layout version. Bump when persisted graph/symbol shapes change. */
export const REPO_INDEX_SCHEMA_VERSION = 2 as const

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

/** Stable, file-qualified symbol identity: `sym:v1:<file>#<scope>/<segment>`. */
export type SymbolId = string

/** Vocabulary for one scope segment in a qualified symbol id. */
export type ScopeKind =
  | 'module'
  | 'namespace'
  | 'class'
  | 'interface'
  | 'trait'
  | 'impl'
  | 'function'
  | 'method'
  | 'owner'

export interface SymbolScopePart {
  kind: ScopeKind
  name: string
  /** 1-based among sibling scope owners with the same kind and name. */
  ordinal: number
}

export interface SymbolInfo {
  /** Stable qualified id; unique within a RepoIndex. */
  id: SymbolId
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
  /** Owners only; excludes the symbol itself. Empty at module level. */
  scope: SymbolScopePart[]
  /** 1-based among symbols with the same scope, kind, and name. */
  ordinal: number
}

/** One name bound by an import statement, with its local alias. */
export interface ImportBinding {
  /** Imported name: "foo" | "default" | "*" | null (namespace/package). */
  imported: string | null
  /** Name visible in this file (alias when renamed). */
  local: string
  kind: 'named' | 'default' | 'namespace' | 'package' | 'static' | 'glob'
}

/** Structured form of one import/include/use site. */
export interface ImportInfo {
  specifier: string
  line: number
  kind: 'import' | 'reexport' | 'include' | 'use'
  bindings: ImportBinding[]
}

/** One call site: callee name, line, and enclosing function ('' = module level). */
export interface CallInfo {
  /** Callee name as written (identifier, member/property, or qualified tail). */
  name: string
  /** 1-based line of the call expression. */
  line: number
  /** Enclosing function/method name, or '' for a module-level call. */
  from: string
  /** Structural owner from AST containment; null at module level. */
  fromId: SymbolId | null
  /** Receiver/namespace text when available: `ns.foo()` -> "ns"; bare -> null. */
  qualifier: string | null
}

export interface IndexedFile {
  /** Repo-relative path (forward-slash). */
  path: string
  lang: string
  /** fs mtime of the source file at index time (milliseconds). */
  mtimeMs: number
  symbols: SymbolInfo[]
  /** Derived compatibility view of {@link importDetails} specifiers. */
  imports?: string[]
  /** Structured import/include/use sites with their name bindings. */
  importDetails?: ImportInfo[]
  /** Call sites found in this file (callee + line + enclosing function).
   *  Optional because caches written before call-graph support lack it. */
  calls?: CallInfo[]
}

export interface RepoIndex {
  /** Persisted layout version; see {@link REPO_INDEX_SCHEMA_VERSION}. */
  schemaVersion: typeof REPO_INDEX_SCHEMA_VERSION
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