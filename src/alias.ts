/**
 * Lightweight config-based path alias & local package resolution.
 *
 * Parses repository-local tsconfig/jsconfig (JSONC with comments & trailing
 * commas, extends, baseUrl, paths), package.json local relative exports, and
 * HarmonyOS oh-package.json5 local relative dependencies. Never executes code,
 * never runs full TS type-checking, and never inspects node_modules/oh_modules.
 */

import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type {
  OhPackageScope,
  PackageExportsScope,
  ResolutionConfig,
  TrackedConfigFile,
  TsConfigAliasScope,
} from './types.js'
import { loadWorkspacePackages, WORKSPACE_CONFIG_BASENAMES } from './workspace.js'

export const CONFIG_BASENAMES = new Set([
  'tsconfig.json',
  'jsconfig.json',
  'package.json',
  'oh-package.json5',
  ...WORKSPACE_CONFIG_BASENAMES,
])

const MAX_EXTENDS_DEPTH = 8
const THIRD_PARTY_SEGMENT_RE = /(?:^|\/)(?:node_modules|oh_modules)(?:\/|$)/

export type AliasVia = 'tsconfig-path' | 'tsconfig-baseurl' | 'package-exports' | 'oh-package'

export interface AliasMatchResult {
  targets: string[]
  ambiguous: boolean
  via: AliasVia
}

export interface ConfigFileEntry {
  abs: string
  rel: string
  mtimeMs: number
}

export type CandidateResolver = (
  base: string,
  fileSet: Set<string>,
  extraIndexNames?: readonly string[],
) => string | null

/** True when `rel` is a tracked or recognized config affecting import resolution. */
export function isResolutionConfigPath(
  rel: string,
  tracked?: readonly TrackedConfigFile[],
): boolean {
  const normalized = rel.replace(/\\/g, '/').replace(/^\.\//, '')
  if (tracked?.some((entry) => entry.path === normalized)) return true
  const base = path.posix.basename(normalized)
  if (CONFIG_BASENAMES.has(base)) return true
  return /^(?:tsconfig|jsconfig)\..+\.json$/i.test(base)
}

/* -------------------------------------------------------------------------- */
/* Recursive-descent JSONC / JSON5 parser                                     */
/* -------------------------------------------------------------------------- */

/**
 * Parse JSON, JSONC (line/block comments + trailing commas), or JSON5 subset
 * (single-quoted strings, unquoted identifier keys, hex/leading-sign numbers).
 * Returns `null` on syntax errors so malformed configs never break indexing.
 */
export function parseJsoncOrJson5(text: string): unknown {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const len = src.length
  let pos = 0

  const skipTrivia = (): void => {
    while (pos < len) {
      const ch = src.charCodeAt(pos)
      if (ch === 0x20 || ch === 0x09 || ch === 0x0a || ch === 0x0d || ch === 0x0b || ch === 0x0c) {
        pos++
        continue
      }
      if (ch === 0x2f && pos + 1 < len) {
        const next = src.charCodeAt(pos + 1)
        if (next === 0x2f) {
          pos += 2
          while (pos < len && src.charCodeAt(pos) !== 0x0a && src.charCodeAt(pos) !== 0x0d) pos++
          continue
        }
        if (next === 0x2a) {
          pos += 2
          let closed = false
          while (pos + 1 < len) {
            if (src.charCodeAt(pos) === 0x2a && src.charCodeAt(pos + 1) === 0x2f) {
              pos += 2
              closed = true
              break
            }
            pos++
          }
          if (!closed) throw new Error('unterminated block comment')
          continue
        }
      }
      break
    }
  }

  const readString = (quote: number): string => {
    pos++ // consume opening quote
    let out = ''
    while (pos < len) {
      const ch = src.charCodeAt(pos++)
      if (ch === quote) return out
      if (ch === 0x5c) {
        if (pos >= len) throw new Error('unterminated escape')
        const esc = src.charCodeAt(pos++)
        switch (esc) {
          case 0x22: out += '"'; break
          case 0x27: out += "'"; break
          case 0x5c: out += '\\'; break
          case 0x2f: out += '/'; break
          case 0x62: out += '\b'; break
          case 0x66: out += '\f'; break
          case 0x6e: out += '\n'; break
          case 0x72: out += '\r'; break
          case 0x74: out += '\t'; break
          case 0x0a: break
          case 0x0d:
            if (pos < len && src.charCodeAt(pos) === 0x0a) pos++
            break
          case 0x75: {
            const hex = src.slice(pos, pos + 4)
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error('invalid unicode escape')
            out += String.fromCharCode(parseInt(hex, 16))
            pos += 4
            break
          }
          case 0x78: {
            const hex = src.slice(pos, pos + 2)
            if (!/^[0-9a-fA-F]{2}$/.test(hex)) throw new Error('invalid hex escape')
            out += String.fromCharCode(parseInt(hex, 16))
            pos += 2
            break
          }
          default:
            out += String.fromCharCode(esc)
        }
        continue
      }
      out += String.fromCharCode(ch)
    }
    throw new Error('unterminated string')
  }

  const readIdentifier = (): string => {
    const start = pos
    while (pos < len && /[A-Za-z0-9_$]/.test(src[pos]!)) pos++
    if (pos === start) throw new Error('expected identifier')
    return src.slice(start, pos)
  }

  const readNumber = (): number => {
    const rest = src.slice(pos)
    const match = /^[+-]?(?:0[xX][0-9a-fA-F]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/.exec(rest)
    if (!match) throw new Error('invalid number')
    pos += match[0].length
    const num = Number(match[0])
    if (!Number.isFinite(num)) throw new Error('non-finite number')
    return num
  }

  const readValue = (): unknown => {
    skipTrivia()
    if (pos >= len) throw new Error('unexpected end of input')
    const ch = src.charCodeAt(pos)
    if (ch === 0x7b) return readObject()
    if (ch === 0x5b) return readArray()
    if (ch === 0x22 || ch === 0x27) return readString(ch)
    if (src.startsWith('true', pos) && !isIdentPart(src[pos + 4])) {
      pos += 4
      return true
    }
    if (src.startsWith('false', pos) && !isIdentPart(src[pos + 5])) {
      pos += 5
      return false
    }
    if (src.startsWith('null', pos) && !isIdentPart(src[pos + 4])) {
      pos += 4
      return null
    }
    if (src.startsWith('Infinity', pos) && !isIdentPart(src[pos + 8])) {
      pos += 8
      return null
    }
    if (src.startsWith('NaN', pos) && !isIdentPart(src[pos + 3])) {
      pos += 3
      return null
    }
    return readNumber()
  }

  const readObject = (): Record<string, unknown> => {
    pos++ // {
    const obj: Record<string, unknown> = {}
    for (;;) {
      skipTrivia()
      if (pos >= len) throw new Error('unterminated object')
      if (src.charCodeAt(pos) === 0x7d) {
        pos++
        return obj
      }
      const ch = src.charCodeAt(pos)
      let key: string
      if (ch === 0x22 || ch === 0x27) {
        key = readString(ch)
      } else if (/[A-Za-z_$]/.test(src[pos]!)) {
        key = readIdentifier()
      } else {
        throw new Error('expected object key')
      }
      skipTrivia()
      if (src.charCodeAt(pos) !== 0x3a) throw new Error('expected colon')
      pos++
      const value = readValue()
      if (key !== '__proto__') obj[key] = value
      skipTrivia()
      if (src.charCodeAt(pos) === 0x2c) {
        pos++
        continue
      }
      if (src.charCodeAt(pos) === 0x7d) {
        pos++
        return obj
      }
      throw new Error('expected comma or closing brace')
    }
  }

  const readArray = (): unknown[] => {
    pos++ // [
    const arr: unknown[] = []
    for (;;) {
      skipTrivia()
      if (pos >= len) throw new Error('unterminated array')
      if (src.charCodeAt(pos) === 0x5d) {
        pos++
        return arr
      }
      arr.push(readValue())
      skipTrivia()
      if (src.charCodeAt(pos) === 0x2c) {
        pos++
        continue
      }
      if (src.charCodeAt(pos) === 0x5d) {
        pos++
        return arr
      }
      throw new Error('expected comma or closing bracket')
    }
  }

  try {
    const value = readValue()
    skipTrivia()
    if (pos !== len) return null
    return value
  } catch {
    return null
  }
}

function isIdentPart(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_$]/.test(ch)
}

/* -------------------------------------------------------------------------- */
/* Path normalization & config loading                                        */
/* -------------------------------------------------------------------------- */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function scopeDirOf(relPath: string): string {
  const dir = path.posix.dirname(relPath)
  return dir === '.' ? '' : dir
}

/** Normalize a relative/subpath expression against `baseDir` inside the repo root. */
function resolveRepoRelativePath(baseDir: string, target: string): string | null {
  const cleaned = target.replace(/\\/g, '/').trim()
  if (!cleaned) return null
  if (path.posix.isAbsolute(cleaned) || /^[A-Za-z]:\//.test(cleaned)) return null
  const joined = baseDir ? `${baseDir}/${cleaned}` : cleaned
  const normalized = path.posix.normalize(joined).replace(/\/$/, '')
  if (normalized === '..' || normalized.startsWith('../')) return null
  const finalPath = normalized === '.' ? '' : normalized
  if (THIRD_PARTY_SEGMENT_RE.test(finalPath)) return null
  return finalPath
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {}
  for (const key of Object.keys(record).sort((a, b) => a.localeCompare(b))) {
    out[key] = record[key]!
  }
  return out
}

interface RawTsConfigData {
  baseUrlDir?: string
  paths?: Record<string, string[]>
  pathsBaseDir: string
}

async function readParsedConfig(
  absPath: string,
  relPath: string,
  trackedMap: Map<string, number>,
): Promise<Record<string, unknown> | null> {
  try {
    const st = await stat(absPath)
    if (!st.isFile()) return null
    const raw = await readFile(absPath, 'utf8')
    trackedMap.set(relPath, st.mtimeMs)
    const parsed = parseJsoncOrJson5(raw)
    return isPlainObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function resolveLocalExtendsFile(
  root: string,
  fromDir: string,
  spec: string,
): Promise<{ abs: string; rel: string } | null> {
  const trimmed = spec.replace(/\\/g, '/').trim()
  if (!trimmed || trimmed.startsWith('/') || /^[A-Za-z]:\//.test(trimmed)) return null
  if (!trimmed.startsWith('./') && !trimmed.startsWith('../')) return null
  const baseRel = resolveRepoRelativePath(fromDir, trimmed)
  if (baseRel === null) return null

  const candidates = [baseRel]
  if (!baseRel.endsWith('.json')) {
    candidates.push(`${baseRel}.json`, baseRel ? `${baseRel}/tsconfig.json` : 'tsconfig.json')
  }
  for (const rel of candidates) {
    if (!rel || THIRD_PARTY_SEGMENT_RE.test(rel)) continue
    const abs = path.join(root, ...rel.split('/'))
    try {
      const st = await stat(abs)
      if (st.isFile()) return { abs, rel }
    } catch {
      // try next candidate
    }
  }
  return null
}

async function loadTsConfigChain(
  root: string,
  relPath: string,
  trackedMap: Map<string, number>,
  visited: Set<string>,
  depth: number,
): Promise<RawTsConfigData | null> {
  if (depth > MAX_EXTENDS_DEPTH || visited.has(relPath)) return null
  visited.add(relPath)

  const absPath = path.join(root, ...relPath.split('/'))
  const parsed = await readParsedConfig(absPath, relPath, trackedMap)
  if (!parsed) {
    visited.delete(relPath)
    return null
  }

  const dir = scopeDirOf(relPath)
  let mergedBaseUrlDir: string | undefined
  let mergedPaths: Record<string, string[]> | undefined
  let mergedPathsBaseDir = dir

  const rawExtends = parsed.extends
  const extendsList = typeof rawExtends === 'string'
    ? [rawExtends]
    : Array.isArray(rawExtends)
      ? rawExtends.filter((item): item is string => typeof item === 'string')
      : []

  for (const extSpec of extendsList) {
    const parentRef = await resolveLocalExtendsFile(root, dir, extSpec)
    if (!parentRef) continue
    const parentData = await loadTsConfigChain(root, parentRef.rel, trackedMap, visited, depth + 1)
    if (!parentData) continue
    if (parentData.baseUrlDir !== undefined) mergedBaseUrlDir = parentData.baseUrlDir
    if (parentData.paths) {
      mergedPaths = { ...(mergedPaths ?? {}), ...parentData.paths }
      mergedPathsBaseDir = parentData.pathsBaseDir
    }
  }

  const compilerOptions = isPlainObject(parsed.compilerOptions) ? parsed.compilerOptions : undefined
  if (compilerOptions) {
    if (typeof compilerOptions.baseUrl === 'string') {
      const resolvedBase = resolveRepoRelativePath(dir, compilerOptions.baseUrl)
      if (resolvedBase !== null) mergedBaseUrlDir = resolvedBase
    }
    if (isPlainObject(compilerOptions.paths)) {
      const pathsAnchor = mergedBaseUrlDir ?? dir
      const localPaths: Record<string, string[]> = {}
      for (const [pattern, rawTargets] of Object.entries(compilerOptions.paths)) {
        if (!Array.isArray(rawTargets)) continue
        const normalizedTargets: string[] = []
        for (const entry of rawTargets) {
          if (typeof entry !== 'string') continue
          const targetRel = resolveRepoRelativePath(pathsAnchor, entry)
          if (targetRel !== null && !normalizedTargets.includes(targetRel)) {
            normalizedTargets.push(targetRel)
          }
        }
        if (normalizedTargets.length > 0) localPaths[pattern] = normalizedTargets
      }
      mergedPaths = { ...(mergedPaths ?? {}), ...localPaths }
      mergedPathsBaseDir = pathsAnchor
    }
  }

  visited.delete(relPath)
  return {
    baseUrlDir: mergedBaseUrlDir,
    paths: mergedPaths,
    pathsBaseDir: mergedPathsBaseDir,
  }
}

/**
 * Extract local relative target templates from a package.json `exports` value.
 * Prefers source/ESM conditions (`source`/`import`/`default`/`node`/`browser`)
 * over `types` and `require`, while preserving multiple matching targets so
 * wildcard/multi-branch ambiguities are never hidden.
 */
function extractExportTargets(value: unknown, pkgDir: string): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed.startsWith('./') && trimmed !== '.') return []
    const rel = resolveRepoRelativePath(pkgDir, trimmed)
    return rel !== null && rel !== '' ? [rel] : []
  }
  if (Array.isArray(value)) {
    const out: string[] = []
    for (const item of value) {
      for (const target of extractExportTargets(item, pkgDir)) {
        if (!out.includes(target)) out.push(target)
      }
    }
    return out
  }
  if (isPlainObject(value)) {
    const primary: string[] = []
    const secondary: string[] = []
    const fallback: string[] = []
    for (const [condition, nested] of Object.entries(value)) {
      const targets = extractExportTargets(nested, pkgDir)
      if (targets.length === 0) continue
      const bucket = condition === 'types'
        ? fallback
        : condition === 'require'
          ? secondary
          : primary
      for (const t of targets) {
        if (!bucket.includes(t)) bucket.push(t)
      }
    }
    if (primary.length > 0) return primary
    if (secondary.length > 0) return secondary
    return fallback
  }
  return []
}

function parsePackageExports(
  parsed: Record<string, unknown>,
  relPath: string,
): PackageExportsScope | null {
  const name = typeof parsed.name === 'string' ? parsed.name.trim() : ''
  if (!name) return null
  const rawExports = parsed.exports
  if (rawExports === undefined || rawExports === null) return null

  const dir = scopeDirOf(relPath)
  const exportsMap: Record<string, string[]> = {}

  if (typeof rawExports === 'string' || Array.isArray(rawExports)) {
    const targets = extractExportTargets(rawExports, dir)
    if (targets.length > 0) exportsMap['.'] = targets
  } else if (isPlainObject(rawExports)) {
    const keys = Object.keys(rawExports)
    const isSubpathMap = keys.some((key) => key === '.' || key.startsWith('./'))
    if (isSubpathMap) {
      for (const [subpath, targetVal] of Object.entries(rawExports)) {
        if (subpath !== '.' && !subpath.startsWith('./')) continue
        const targets = extractExportTargets(targetVal, dir)
        if (targets.length > 0) exportsMap[subpath] = targets
      }
    } else {
      const targets = extractExportTargets(rawExports, dir)
      if (targets.length > 0) exportsMap['.'] = targets
    }
  }

  if (Object.keys(exportsMap).length === 0) return null
  return { dir, name, exports: sortRecord(exportsMap) }
}

function parseOhPackage(
  parsed: Record<string, unknown>,
  relPath: string,
): OhPackageScope | null {
  const scopeDir = scopeDirOf(relPath)
  const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : undefined
  let main: string | undefined
  if (typeof parsed.main === 'string' && parsed.main.trim()) {
    const resolvedMain = resolveRepoRelativePath(scopeDir, parsed.main.trim())
    if (resolvedMain) main = resolvedMain
  }

  const dependencies: Record<string, string> = {}
  for (const field of ['dependencies', 'devDependencies', 'dynamicDependencies'] as const) {
    const table = parsed[field]
    if (!isPlainObject(table)) continue
    for (const [depName, rawSpec] of Object.entries(table)) {
      if (typeof rawSpec !== 'string') continue
      let depTarget = rawSpec.trim()
      if (depTarget.startsWith('file:')) depTarget = depTarget.slice('file:'.length).trim()
      if (!depTarget.startsWith('./') && !depTarget.startsWith('../')) continue
      const resolved = resolveRepoRelativePath(scopeDir, depTarget)
      if (resolved !== null) dependencies[depName] = resolved
    }
  }

  if (!name && !main && Object.keys(dependencies).length === 0) return null
  return {
    scopeDir,
    ...(name ? { name } : {}),
    ...(main ? { main } : {}),
    dependencies: sortRecord(dependencies),
  }
}

async function canReuseResolutionConfig(
  root: string,
  discoveredConfigs: readonly ConfigFileEntry[],
  previous: ResolutionConfig,
  forcePaths: ReadonlySet<string>,
): Promise<boolean> {
  if (forcePaths.has('*')) return false
  if (previous.workspacePackages === undefined) return false
  const prevByPath = new Map(previous.configFiles.map((entry) => [entry.path, entry.mtimeMs]))
  const discoveredPaths = new Set<string>()
  for (const cfg of discoveredConfigs) {
    discoveredPaths.add(cfg.rel)
    if (forcePaths.has(cfg.rel)) return false
    if (prevByPath.get(cfg.rel) !== cfg.mtimeMs) return false
  }
  for (const tracked of previous.configFiles) {
    if (forcePaths.has(tracked.path)) return false
    if (discoveredPaths.has(tracked.path)) continue
    const abs = path.join(root, ...tracked.path.split('/'))
    try {
      const st = await stat(abs)
      if (!st.isFile() || st.mtimeMs !== tracked.mtimeMs) return false
    } catch {
      return false
    }
  }
  return true
}

function parsePackageWorkspaces(parsed: Record<string, unknown>): string[] {
  const raw = parsed.workspaces
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === 'string')
  }
  if (isPlainObject(raw) && Array.isArray(raw.packages)) {
    return raw.packages.filter((item): item is string => typeof item === 'string')
  }
  return []
}

/**
 * Load and normalize repository-local alias/export/dependency/workspace configs.
 * Reuses `previous` without re-reading JSON when all config mtimes match.
 */
export async function loadResolutionConfig(
  root: string,
  discoveredConfigs: readonly ConfigFileEntry[],
  previous?: ResolutionConfig,
  forcePaths: ReadonlySet<string> = new Set(),
  scannedFiles: readonly ConfigFileEntry[] = [],
): Promise<ResolutionConfig | undefined> {
  if (previous && (await canReuseResolutionConfig(root, discoveredConfigs, previous, forcePaths))) {
    return previous
  }
  if (discoveredConfigs.length === 0) return undefined

  const trackedMap = new Map<string, number>()
  const tsConfigs: TsConfigAliasScope[] = []
  const packageExports: PackageExportsScope[] = []
  const ohPackages: OhPackageScope[] = []
  const pkgNameByDir = new Map<string, string>()
  const ohNameByDir = new Map<string, string>()
  const pkgWorkspacesByDir = new Map<string, string[]>()

  for (const cfg of discoveredConfigs) {
    const base = path.posix.basename(cfg.rel)
    if (base === 'tsconfig.json' || base === 'jsconfig.json') {
      const chain = await loadTsConfigChain(root, cfg.rel, trackedMap, new Set(), 0)
      if (!chain) continue
      const paths = sortRecord(chain.paths ?? {})
      if (chain.baseUrlDir === undefined && Object.keys(paths).length === 0) continue
      tsConfigs.push({
        scopeDir: scopeDirOf(cfg.rel),
        kind: base === 'jsconfig.json' ? 'jsconfig' : 'tsconfig',
        ...(chain.baseUrlDir !== undefined ? { baseUrl: chain.baseUrlDir } : {}),
        paths,
      })
      continue
    }

    if (base !== 'package.json' && base !== 'oh-package.json5') continue

    const abs = path.join(root, ...cfg.rel.split('/'))
    const parsed = await readParsedConfig(abs, cfg.rel, trackedMap)
    if (!parsed) continue

    if (base === 'package.json') {
      const dir = scopeDirOf(cfg.rel)
      if (typeof parsed.name === 'string' && parsed.name.trim()) {
        pkgNameByDir.set(dir, parsed.name.trim())
      }
      const workspaces = parsePackageWorkspaces(parsed)
      if (workspaces.length > 0) pkgWorkspacesByDir.set(dir, workspaces)
      const pkg = parsePackageExports(parsed, cfg.rel)
      if (pkg) packageExports.push(pkg)
    } else if (base === 'oh-package.json5') {
      const oh = parseOhPackage(parsed, cfg.rel)
      if (oh) {
        ohPackages.push(oh)
        if (oh.name) ohNameByDir.set(oh.scopeDir, oh.name)
      }
    }
  }

  const workspacePackages = await loadWorkspacePackages(
    root,
    discoveredConfigs,
    scannedFiles,
    trackedMap,
    pkgNameByDir,
    ohNameByDir,
    pkgWorkspacesByDir,
  )

  if (trackedMap.size === 0) return undefined

  const configFiles: TrackedConfigFile[] = [...trackedMap.entries()]
    .map(([filePath, mtimeMs]) => ({ path: filePath, mtimeMs }))
    .sort((a, b) => a.path.localeCompare(b.path))

  tsConfigs.sort(
    (a, b) =>
      b.scopeDir.length - a.scopeDir.length ||
      a.scopeDir.localeCompare(b.scopeDir) ||
      a.kind.localeCompare(b.kind),
  )
  packageExports.sort(
    (a, b) =>
      b.dir.length - a.dir.length ||
      a.dir.localeCompare(b.dir) ||
      a.name.localeCompare(b.name),
  )
  ohPackages.sort(
    (a, b) => b.scopeDir.length - a.scopeDir.length || a.scopeDir.localeCompare(b.scopeDir),
  )

  return { configFiles, tsConfigs, packageExports, ohPackages, workspacePackages }
}

/* -------------------------------------------------------------------------- */
/* Alias matching                                                             */
/* -------------------------------------------------------------------------- */

function inScopeDir(filePath: string, scopeDir: string): boolean {
  return scopeDir === '' || filePath === scopeDir || filePath.startsWith(`${scopeDir}/`)
}

function joinPosix(dir: string, rel: string): string {
  const cleanRel = rel.replace(/^\/+/, '')
  const combined = dir ? (cleanRel ? `${dir}/${cleanRel}` : dir) : cleanRel
  return path.posix.normalize(combined).replace(/\/$/, '')
}

function matchPattern(pattern: string, spec: string): { prefixLen: number; suffixLen: number; capture: string } | null {
  const star = pattern.indexOf('*')
  if (star < 0) {
    return pattern === spec ? { prefixLen: pattern.length, suffixLen: 0, capture: '' } : null
  }
  if (pattern.indexOf('*', star + 1) >= 0) return null // TS paths/exports allow at most one '*'
  const prefix = pattern.slice(0, star)
  const suffix = pattern.slice(star + 1)
  if (spec.length < prefix.length + suffix.length) return null
  if (!spec.startsWith(prefix) || !spec.endsWith(suffix)) return null
  return {
    prefixLen: prefix.length,
    suffixLen: suffix.length,
    capture: spec.slice(prefix.length, spec.length - suffix.length),
  }
}

function applyTemplate(template: string, capture: string): string {
  const star = template.indexOf('*')
  return star < 0 ? template : `${template.slice(0, star)}${capture}${template.slice(star + 1)}`
}

function dedupeSorted(items: readonly string[]): string[] {
  return [...new Set(items)].sort((a, b) => a.localeCompare(b))
}

function isJsSource(filePath: string): boolean {
  return /\.(?:[cm]?jsx?)$/i.test(filePath)
}

function resolveTsPaths(
  spec: string,
  fromPath: string,
  fileSet: Set<string>,
  tsConfigs: readonly TsConfigAliasScope[],
  resolveCandidate: CandidateResolver,
): AliasMatchResult | null {
  const preferJs = isJsSource(fromPath)
  const scopes = tsConfigs
    .filter((scope) => inScopeDir(fromPath, scope.scopeDir))
    .sort((a, b) => {
      if (b.scopeDir.length !== a.scopeDir.length) return b.scopeDir.length - a.scopeDir.length
      if (a.kind !== b.kind) {
        if (preferJs) return a.kind === 'jsconfig' ? -1 : 1
        return a.kind === 'tsconfig' ? -1 : 1
      }
      return a.scopeDir.localeCompare(b.scopeDir)
    })

  for (const scope of scopes) {
    const entries = Object.entries(scope.paths)
    if (entries.length === 0) continue

    let bestScore: { prefixLen: number; suffixLen: number } | null = null
    let bestMatches: Array<{ capture: string; templates: string[] }> = []

    for (const [pattern, templates] of entries) {
      const m = matchPattern(pattern, spec)
      if (!m) continue
      if (
        !bestScore ||
        m.prefixLen > bestScore.prefixLen ||
        (m.prefixLen === bestScore.prefixLen && m.suffixLen > bestScore.suffixLen)
      ) {
        bestScore = { prefixLen: m.prefixLen, suffixLen: m.suffixLen }
        bestMatches = [{ capture: m.capture, templates }]
      } else if (m.prefixLen === bestScore.prefixLen && m.suffixLen === bestScore.suffixLen) {
        bestMatches.push({ capture: m.capture, templates })
      }
    }

    if (bestMatches.length > 0) {
      const hits: string[] = []
      for (const match of bestMatches) {
        for (const template of match.templates) {
          const base = applyTemplate(template, match.capture)
          if (THIRD_PARTY_SEGMENT_RE.test(base)) continue
          const hit = resolveCandidate(base, fileSet)
          if (hit) hits.push(hit)
        }
      }
      const targets = dedupeSorted(hits)
      if (targets.length > 0) {
        return { targets, ambiguous: targets.length > 1, via: 'tsconfig-path' }
      }
    }
  }

  for (const scope of scopes) {
    if (scope.baseUrl === undefined) continue
    const base = joinPosix(scope.baseUrl, spec)
    if (THIRD_PARTY_SEGMENT_RE.test(base)) continue
    const hit = resolveCandidate(base, fileSet)
    if (hit) return { targets: [hit], ambiguous: false, via: 'tsconfig-baseurl' }
  }

  return null
}

function resolveOhPackageImport(
  spec: string,
  fromPath: string,
  fileSet: Set<string>,
  ohPackages: readonly OhPackageScope[],
  resolveCandidate: CandidateResolver,
): AliasMatchResult | null {
  if (ohPackages.length === 0) return null
  const byDir = new Map(ohPackages.map((pkg) => [pkg.scopeDir, pkg]))
  const scopes = ohPackages
    .filter((scope) => inScopeDir(fromPath, scope.scopeDir))
    .sort((a, b) => b.scopeDir.length - a.scopeDir.length || a.scopeDir.localeCompare(b.scopeDir))

  const resolveInTarget = (targetBase: string, subpath: string | null): string | null => {
    if (THIRD_PARTY_SEGMENT_RE.test(targetBase)) return null
    if (subpath === null) {
      const targetPkg = byDir.get(targetBase)
      if (targetPkg?.main) {
        const hit = resolveCandidate(targetPkg.main, fileSet, ['Index.ets'])
        if (hit) return hit
      }
      return resolveCandidate(targetBase, fileSet, ['Index.ets'])
    }
    return resolveCandidate(joinPosix(targetBase, subpath), fileSet, ['Index.ets'])
  }

  for (const scope of scopes) {
    const deps = Object.entries(scope.dependencies).sort(
      (a, b) => b[0].length - a[0].length || a[0].localeCompare(b[0]),
    )
    for (const [depName, targetBase] of deps) {
      if (spec === depName) {
        const hit = resolveInTarget(targetBase, null)
        if (hit) return { targets: [hit], ambiguous: false, via: 'oh-package' }
      } else if (spec.startsWith(`${depName}/`)) {
        const hit = resolveInTarget(targetBase, spec.slice(depName.length + 1))
        if (hit) return { targets: [hit], ambiguous: false, via: 'oh-package' }
      }
    }
  }

  // Named local OHPM packages may also be imported by another module when they share a repo.
  for (const pkg of ohPackages) {
    if (!pkg.name) continue
    if (spec === pkg.name) {
      const hit = resolveInTarget(pkg.scopeDir, null)
      if (hit) return { targets: [hit], ambiguous: false, via: 'oh-package' }
    } else if (spec.startsWith(`${pkg.name}/`)) {
      const hit = resolveInTarget(pkg.scopeDir, spec.slice(pkg.name.length + 1))
      if (hit) return { targets: [hit], ambiguous: false, via: 'oh-package' }
    }
  }

  return null
}

function resolvePackageExportsImport(
  spec: string,
  fromPath: string,
  fileSet: Set<string>,
  packageExports: readonly PackageExportsScope[],
  resolveCandidate: CandidateResolver,
): AliasMatchResult | null {
  const candidates = packageExports
    .filter((pkg) => spec === pkg.name || spec.startsWith(`${pkg.name}/`))
    .sort((a, b) => {
      if (b.name.length !== a.name.length) return b.name.length - a.name.length
      const aAnc = Number(inScopeDir(fromPath, a.dir))
      const bAnc = Number(inScopeDir(fromPath, b.dir))
      if (aAnc !== bAnc) return bAnc - aAnc
      return b.dir.length - a.dir.length || a.dir.localeCompare(b.dir)
    })

  for (const pkg of candidates) {
    const subpath = spec === pkg.name ? '.' : `./${spec.slice(pkg.name.length + 1)}`
    let bestPrefix = -1
    let bestSuffix = -1
    let bestMatches: Array<{ capture: string; templates: string[] }> = []

    for (const [exportKey, templates] of Object.entries(pkg.exports)) {
      const m = matchPattern(exportKey, subpath)
      if (!m) continue
      if (
        m.prefixLen > bestPrefix ||
        (m.prefixLen === bestPrefix && m.suffixLen > bestSuffix)
      ) {
        bestPrefix = m.prefixLen
        bestSuffix = m.suffixLen
        bestMatches = [{ capture: m.capture, templates }]
      } else if (m.prefixLen === bestPrefix && m.suffixLen === bestSuffix) {
        bestMatches.push({ capture: m.capture, templates })
      }
    }

    if (bestMatches.length === 0) continue
    const hits: string[] = []
    for (const match of bestMatches) {
      for (const template of match.templates) {
        const base = applyTemplate(template, match.capture)
        if (THIRD_PARTY_SEGMENT_RE.test(base)) continue
        const hit = resolveCandidate(base, fileSet)
        if (hit) hits.push(hit)
      }
    }
    const targets = dedupeSorted(hits)
    if (targets.length > 0) {
      return { targets, ambiguous: targets.length > 1, via: 'package-exports' }
    }
  }

  return null
}

/**
 * Resolve a non-relative import specifier using configured tsconfig/jsconfig
 * paths & baseUrl, HarmonyOS oh-package.json5 local deps, and local package.json
 * exports. Returns `null` when no config rule matches.
 */
export function resolveAliasImport(
  spec: string,
  fromPath: string,
  fileSet: Set<string>,
  config: ResolutionConfig | undefined,
  resolveCandidate: CandidateResolver,
): AliasMatchResult | null {
  if (!config || !spec) return null
  if (/^@(ohos|kit)\./.test(spec)) return null
  if (spec === '.' || spec === '..' || spec.startsWith('./') || spec.startsWith('../')) {
    return null
  }

  const tsHit = resolveTsPaths(spec, fromPath, fileSet, config.tsConfigs, resolveCandidate)
  if (tsHit) return tsHit

  const ohHit = resolveOhPackageImport(spec, fromPath, fileSet, config.ohPackages, resolveCandidate)
  if (ohHit) return ohHit

  const pkgHit = resolvePackageExportsImport(
    spec,
    fromPath,
    fileSet,
    config.packageExports,
    resolveCandidate,
  )
  if (pkgHit) return pkgHit

  return null
}
