/**
 * Lightweight Monorepo / multi-module workspace boundary resolver.
 *
 * Parses pnpm-workspace.yaml, package.json#workspaces, Cargo.toml [workspace],
 * go.work, and HarmonyOS build-profile.json5 to map dirPrefix -> packageName
 * and summarize cross-package impact without extra directory walks.
 */

import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { parseJsoncOrJson5, type ConfigFileEntry } from './alias.js'
import type { ChangeContextResult } from './change-context.js'
import type {
  CrossPackageImpact,
  RepoIndex,
  SymbolId,
  WorkspacePackage,
  WorkspaceSource,
} from './types.js'

export const WORKSPACE_CONFIG_BASENAMES = new Set([
  'pnpm-workspace.yaml',
  'Cargo.toml',
  'go.work',
  'go.mod',
  'build-profile.json5',
  'pyproject.toml',
])

const THIRD_PARTY_SEGMENT_RE = /(?:^|\/)(?:node_modules|oh_modules)(?:\/|$)/

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeDirPrefix(baseDir: string, raw: string): string | null {
  const cleaned = raw.replace(/\\/g, '/').trim().replace(/\/+$/, '')
  if (!cleaned) return baseDir
  if (cleaned.startsWith('/') || /^[A-Za-z]:\//.test(cleaned)) return null
  const joined = baseDir ? `${baseDir}/${cleaned}` : cleaned
  const normalized = path.posix.normalize(joined).replace(/\/+$/, '')
  if (normalized === '..' || normalized.startsWith('../')) return null
  const result = normalized === '.' ? '' : normalized
  if (THIRD_PARTY_SEGMENT_RE.test(result)) return null
  return result
}

function stripInlineComment(line: string, marker: '#' | '//'): string {
  let quote: '"' | "'" | null = null
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (quote) {
      if (ch === '\\' && quote === '"') {
        i++
        continue
      }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (marker === '#' && ch === '#') return line.slice(0, i)
    if (marker === '//' && ch === '/' && line[i + 1] === '/') return line.slice(0, i)
  }
  return line
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1)
    }
  }
  return trimmed
}

function globToRegex(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
  let regex = '^'
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]!
    if (ch === '*') {
      if (normalized[i + 1] === '*') {
        if (normalized[i + 2] === '/') {
          regex += '(?:.*/)?'
          i += 2
        } else {
          regex += '.*'
          i += 1
        }
      } else {
        regex += '[^/]*'
      }
    } else if (ch === '?') {
      regex += '[^/]'
    } else {
      regex += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
  }
  regex += '$'
  return new RegExp(regex)
}

function expandDirGlobs(
  baseDir: string,
  rawPatterns: readonly string[],
  candidateDirs: ReadonlySet<string>,
): string[] {
  const includes: RegExp[] = []
  const excludes: RegExp[] = []
  const literalDirs: string[] = []

  for (const raw of rawPatterns) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const negated = trimmed.startsWith('!')
    const patternBody = (negated ? trimmed.slice(1) : trimmed).replace(/\\/g, '/').trim()
    if (!patternBody) continue
    if (patternBody.startsWith('/') || /^[A-Za-z]:\//.test(patternBody)) continue
    const scoped = baseDir ? `${baseDir}/${patternBody.replace(/^\.\//, '')}` : patternBody.replace(/^\.\//, '')
    const cleaned = scoped.replace(/\/\*+$/, (m) => (m === '/**' ? '/**' : '/*')).replace(/\/$/, '')
    if (!cleaned || cleaned.startsWith('..') || THIRD_PARTY_SEGMENT_RE.test(cleaned)) continue

    if (!negated && !/[*?]/.test(cleaned)) {
      const normalized = normalizeDirPrefix('', cleaned)
      if (normalized !== null) literalDirs.push(normalized)
    }
    const re = globToRegex(cleaned)
    if (negated) excludes.push(re)
    else includes.push(re)
  }

  const matched = new Set<string>(literalDirs)
  for (const dir of candidateDirs) {
    if (!dir) continue
    if (includes.some((re) => re.test(dir))) matched.add(dir)
  }

  return [...matched]
    .filter((dir) => !excludes.some((re) => re.test(dir)))
    .sort((a, b) => a.localeCompare(b))
}

function parsePnpmWorkspacePatterns(text: string): string[] {
  const lines = text.split(/\r?\n/)
  const patterns: string[] = []
  let inPackages = false

  for (const rawLine of lines) {
    const clean = stripInlineComment(rawLine, '#').trimEnd()
    if (!clean.trim()) continue
    const indent = clean.length - clean.trimStart().length
    const trimmed = clean.trim()

    if (indent === 0) {
      if (trimmed.startsWith('packages:')) {
        inPackages = true
        const rest = trimmed.slice('packages:'.length).trim()
        if (rest.startsWith('[') && rest.endsWith(']')) {
          for (const item of rest.slice(1, -1).split(',')) {
            const val = unquote(item)
            if (val) patterns.push(val)
          }
          inPackages = false
        }
        continue
      }
      inPackages = false
      continue
    }

    if (inPackages && trimmed.startsWith('-')) {
      const val = unquote(trimmed.slice(1))
      if (val) patterns.push(val)
    }
  }
  return patterns
}

function parseQuotedList(raw: string): string[] {
  const out: string[] = []
  for (const m of raw.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/g)) {
    const val = (m[1] ?? m[2] ?? '').trim()
    if (val) out.push(val)
  }
  return out
}

function parseCargoToml(text: string): {
  packageName?: string
  members: string[]
  exclude: string[]
} {
  let section = ''
  let packageName: string | undefined
  const members: string[] = []
  const exclude: string[] = []

  const lines = text.split(/\r?\n/)
  let activeListKey: 'members' | 'exclude' | null = null
  let listBuf = ''

  for (const rawLine of lines) {
    const line = stripInlineComment(rawLine, '#').trim()
    if (!line) continue

    if (activeListKey) {
      listBuf += ` ${line}`
      if (line.includes(']')) {
        const items = parseQuotedList(listBuf)
        if (activeListKey === 'members') members.push(...items)
        else exclude.push(...items)
        activeListKey = null
        listBuf = ''
      }
      continue
    }

    const secMatch = /^\[([^\]]+)\]$/.exec(line)
    if (secMatch) {
      section = secMatch[1]!.trim()
      continue
    }

    const kvMatch = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line)
    if (!kvMatch) continue
    const key = kvMatch[1]!
    const value = kvMatch[2]!.trim()

    if (section === 'package' && key === 'name' && !packageName) {
      const val = unquote(value)
      if (val) packageName = val
    } else if (section === 'workspace' && (key === 'members' || key === 'exclude')) {
      if (value.startsWith('[') && value.includes(']')) {
        const items = parseQuotedList(value)
        if (key === 'members') members.push(...items)
        else exclude.push(...items)
      } else if (value.startsWith('[')) {
        activeListKey = key
        listBuf = value
      }
    }
  }

  return { packageName, members, exclude }
}

function parseGoWorkDirs(text: string): string[] {
  const dirs: string[] = []
  let inUseBlock = false
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripInlineComment(rawLine, '//').trim()
    if (!line) continue
    if (inUseBlock) {
      if (line.startsWith(')')) {
        inUseBlock = false
        continue
      }
      const val = unquote(line.split(/\s+/)[0] ?? '')
      if (val) dirs.push(val)
      continue
    }
    if (/^use\s*\(/.test(line)) {
      inUseBlock = true
      const inner = line.replace(/^use\s*\(/, '')
      if (inner.includes(')')) {
        const body = inner.slice(0, inner.indexOf(')'))
        for (const token of body.split(/\s+/)) {
          const val = unquote(token)
          if (val) dirs.push(val)
        }
        inUseBlock = false
      }
      continue
    }
    const single = /^use\s+(.+)$/.exec(line)
    if (single) {
      const val = unquote(single[1]!.split(/\s+/)[0] ?? '')
      if (val) dirs.push(val)
    }
  }
  return dirs
}

function parseGoModName(text: string): string | undefined {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripInlineComment(rawLine, '//').trim()
    const match = /^module\s+(\S+)/.exec(line)
    if (match) return unquote(match[1]!)
  }
  return undefined
}

async function readTrackedFile(
  root: string,
  relPath: string,
  trackedMap: Map<string, number>,
): Promise<string | null> {
  if (!relPath || THIRD_PARTY_SEGMENT_RE.test(relPath)) return null
  const abs = path.join(root, ...relPath.split('/'))
  try {
    const st = await stat(abs)
    if (!st.isFile()) return null
    const content = await readFile(abs, 'utf8')
    trackedMap.set(relPath, st.mtimeMs)
    return content
  } catch {
    return null
  }
}

/**
 * Collect deterministic directory-prefix -> package-name boundaries from
 * pnpm-workspace.yaml, package.json#workspaces, Cargo.toml, go.work, and
 * HarmonyOS build-profile.json5. Tracks every read manifest in `trackedMap`.
 */
export async function loadWorkspacePackages(
  root: string,
  discoveredConfigs: readonly ConfigFileEntry[],
  scannedFiles: readonly ConfigFileEntry[],
  trackedMap: Map<string, number>,
  pkgNameByDir: ReadonlyMap<string, string>,
  ohNameByDir: ReadonlyMap<string, string>,
  pkgWorkspacesByDir: ReadonlyMap<string, string[]>,
): Promise<WorkspacePackage[]> {
  const candidateDirs = new Set<string>()
  for (const entry of [...discoveredConfigs, ...scannedFiles]) {
    let dir = path.posix.dirname(entry.rel)
    while (dir && dir !== '.') {
      candidateDirs.add(dir)
      const parent = path.posix.dirname(dir)
      dir = parent === dir ? '' : parent
    }
  }

  const packages = new Map<string, WorkspacePackage>()
  const addPkg = (dirPrefix: string, name: string, source: WorkspaceSource): void => {
    if (!dirPrefix && packages.has('')) return
    const existing = packages.get(dirPrefix)
    if (!existing) packages.set(dirPrefix, { dirPrefix, name: name || dirPrefix || '.', source })
  }

  // Track pyproject.toml mtimes when present for incremental cache consistency.
  for (const cfg of discoveredConfigs) {
    if (path.posix.basename(cfg.rel) === 'pyproject.toml') {
      trackedMap.set(cfg.rel, cfg.mtimeMs)
    }
  }

  // 1. pnpm-workspace.yaml
  for (const cfg of discoveredConfigs) {
    if (path.posix.basename(cfg.rel) !== 'pnpm-workspace.yaml') continue
    const text = await readTrackedFile(root, cfg.rel, trackedMap)
    if (text === null) continue
    const baseDir = path.posix.dirname(cfg.rel) === '.' ? '' : path.posix.dirname(cfg.rel)
    const patterns = parsePnpmWorkspacePatterns(text)
    for (const dir of expandDirGlobs(baseDir, patterns, candidateDirs)) {
      addPkg(dir, pkgNameByDir.get(dir) ?? dir, 'pnpm-workspace')
    }
  }

  // 2. package.json#workspaces
  for (const [dir, rawPatterns] of pkgWorkspacesByDir) {
    for (const pkgDir of expandDirGlobs(dir, rawPatterns, candidateDirs)) {
      addPkg(pkgDir, pkgNameByDir.get(pkgDir) ?? pkgDir, 'package-workspaces')
    }
  }

  // 3. Cargo.toml [workspace]
  const cargoCache = new Map<string, ReturnType<typeof parseCargoToml>>()
  for (const cfg of discoveredConfigs) {
    if (path.posix.basename(cfg.rel) !== 'Cargo.toml') continue
    const text = await readTrackedFile(root, cfg.rel, trackedMap)
    if (text === null) continue
    const parsed = parseCargoToml(text)
    const dir = path.posix.dirname(cfg.rel) === '.' ? '' : path.posix.dirname(cfg.rel)
    cargoCache.set(dir, parsed)
  }
  for (const [dir, parsed] of cargoCache) {
    if (parsed.members.length === 0) continue
    const patterns = [
      ...parsed.members,
      ...parsed.exclude.map((item) => (item.startsWith('!') ? item : `!${item}`)),
    ]
    for (const memberDir of expandDirGlobs(dir, patterns, candidateDirs)) {
      let memberCargo = cargoCache.get(memberDir)
      if (!memberCargo) {
        const memberText = await readTrackedFile(root, `${memberDir}/Cargo.toml`, trackedMap)
        if (memberText !== null) {
          memberCargo = parseCargoToml(memberText)
          cargoCache.set(memberDir, memberCargo)
        }
      }
      addPkg(memberDir, memberCargo?.packageName ?? memberDir, 'cargo-workspace')
    }
  }

  // 4. go.work + go.mod
  const goModNames = new Map<string, string>()
  for (const cfg of discoveredConfigs) {
    if (path.posix.basename(cfg.rel) !== 'go.mod') continue
    const text = await readTrackedFile(root, cfg.rel, trackedMap)
    if (text === null) continue
    const dir = path.posix.dirname(cfg.rel) === '.' ? '' : path.posix.dirname(cfg.rel)
    const modName = parseGoModName(text)
    if (modName) goModNames.set(dir, modName)
  }
  for (const cfg of discoveredConfigs) {
    if (path.posix.basename(cfg.rel) !== 'go.work') continue
    const text = await readTrackedFile(root, cfg.rel, trackedMap)
    if (text === null) continue
    const baseDir = path.posix.dirname(cfg.rel) === '.' ? '' : path.posix.dirname(cfg.rel)
    for (const rawDir of parseGoWorkDirs(text)) {
      const modDir = normalizeDirPrefix(baseDir, rawDir)
      if (modDir === null) continue
      let modName = goModNames.get(modDir)
      if (!modName) {
        const modRel = modDir ? `${modDir}/go.mod` : 'go.mod'
        const modText = await readTrackedFile(root, modRel, trackedMap)
        if (modText !== null) modName = parseGoModName(modText)
      }
      addPkg(modDir, modName ?? (modDir || '.'), 'go-work')
    }
  }

  // 5. HarmonyOS build-profile.json5
  for (const cfg of discoveredConfigs) {
    if (path.posix.basename(cfg.rel) !== 'build-profile.json5') continue
    const text = await readTrackedFile(root, cfg.rel, trackedMap)
    if (text === null) continue
    const parsed = parseJsoncOrJson5(text)
    if (!isPlainObject(parsed) || !Array.isArray(parsed.modules)) continue
    const baseDir = path.posix.dirname(cfg.rel) === '.' ? '' : path.posix.dirname(cfg.rel)
    for (const mod of parsed.modules) {
      if (!isPlainObject(mod) || typeof mod.srcPath !== 'string') continue
      const modDir = normalizeDirPrefix(baseDir, mod.srcPath)
      if (modDir === null || !modDir) continue
      let name = typeof mod.name === 'string' && mod.name.trim() ? mod.name.trim() : undefined
      if (!name) name = ohNameByDir.get(modDir)
      if (!name) {
        const ohText = await readTrackedFile(root, `${modDir}/oh-package.json5`, trackedMap)
        if (ohText !== null) {
          const ohParsed = parseJsoncOrJson5(ohText)
          if (isPlainObject(ohParsed) && typeof ohParsed.name === 'string' && ohParsed.name.trim()) {
            name = ohParsed.name.trim()
          }
        }
      }
      addPkg(modDir, name ?? modDir, 'harmony-build-profile')
    }
  }

  return [...packages.values()].sort(
    (a, b) => b.dirPrefix.length - a.dirPrefix.length || a.dirPrefix.localeCompare(b.dirPrefix),
  )
}

/** Longest-prefix workspace package lookup for a repo-relative file path. */
export function packageForFile(
  filePath: string,
  packages: readonly WorkspacePackage[],
): WorkspacePackage | null {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '')
  let best: WorkspacePackage | null = null
  for (const pkg of packages) {
    if (
      pkg.dirPrefix === '' ||
      normalized === pkg.dirPrefix ||
      normalized.startsWith(`${pkg.dirPrefix}/`)
    ) {
      if (!best || pkg.dirPrefix.length > best.dirPrefix.length) best = pkg
    }
  }
  return best
}

/** Summarize cross-package caller and import impacts for multi-package workspaces. */
export function computeCrossPackageImpact(
  index: RepoIndex,
  change: ChangeContextResult,
  limit = 12,
): CrossPackageImpact[] {
  const packages = index.resolution?.workspacePackages ?? []
  if (packages.length < 2) return []

  const rootFileBySymbolId = new Map<SymbolId, string>()
  for (const row of change.changed) {
    rootFileBySymbolId.set(row.symbol.id, row.symbol.file)
  }

  const allImpactRows = [...change.directCallers, ...change.impact].sort(
    (a, b) => a.depth - b.depth,
  )
  for (const row of allImpactRows) {
    const rootFile =
      rootFileBySymbolId.get(row.via.toId) ?? fileFromSymbolId(row.via.toId)
    if (rootFile) rootFileBySymbolId.set(row.symbol.id, rootFile)
  }

  interface Bucket {
    fromPackage: string
    fromDir: string
    toPackage: string
    toDir: string
    callKeys: Set<string>
    importKeys: Set<string>
  }
  const buckets = new Map<string, Bucket>()

  const getBucket = (fromPkg: WorkspacePackage, toPkg: WorkspacePackage): Bucket => {
    const key = `${fromPkg.dirPrefix}\u0000${toPkg.dirPrefix}`
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = {
        fromPackage: fromPkg.name,
        fromDir: fromPkg.dirPrefix,
        toPackage: toPkg.name,
        toDir: toPkg.dirPrefix,
        callKeys: new Set(),
        importKeys: new Set(),
      }
      buckets.set(key, bucket)
    }
    return bucket
  }

  for (const row of allImpactRows) {
    const originFile =
      rootFileBySymbolId.get(row.via.toId) ?? fileFromSymbolId(row.via.toId)
    if (!originFile) continue
    const fromPkg = packageForFile(originFile, packages)
    const toPkg = packageForFile(row.symbol.file, packages)
    if (!fromPkg || !toPkg || fromPkg.dirPrefix === toPkg.dirPrefix) continue
    const bucket = getBucket(fromPkg, toPkg)
    bucket.callKeys.add(
      `${row.via.callSite.file}\u0000${row.via.callSite.line}\u0000${row.via.fromId ?? ''}\u0000${row.via.toId}`,
    )
  }

  for (const dep of change.importDependents) {
    const fromPkg = packageForFile(dep.changedFile, packages)
    const toPkg = packageForFile(dep.file, packages)
    if (!fromPkg || !toPkg || fromPkg.dirPrefix === toPkg.dirPrefix) continue
    const bucket = getBucket(fromPkg, toPkg)
    bucket.importKeys.add(`${dep.file}\u0000${dep.changedFile}\u0000${dep.specifier}`)
  }

  return [...buckets.values()]
    .map((bucket) => ({
      fromPackage: bucket.fromPackage,
      fromDir: bucket.fromDir,
      toPackage: bucket.toPackage,
      toDir: bucket.toDir,
      callRefs: bucket.callKeys.size,
      importRefs: bucket.importKeys.size,
      refs: bucket.callKeys.size + bucket.importKeys.size,
    }))
    .filter((row) => row.refs > 0)
    .sort(
      (a, b) =>
        b.refs - a.refs ||
        a.fromDir.localeCompare(b.fromDir) ||
        a.toDir.localeCompare(b.toDir),
    )
    .slice(0, Math.max(0, limit))
}

export function formatPackageLabel(dirPrefix: string, name: string): string {
  if (!dirPrefix) return name || '.'
  if (!name || name === dirPrefix) return dirPrefix
  return `${dirPrefix} [${name}]`
}

export function formatCrossPackageImpact(row: CrossPackageImpact): string {
  const from = formatPackageLabel(row.fromDir, row.fromPackage)
  const to = formatPackageLabel(row.toDir, row.toPackage)
  return `${from} -> ${to} (${row.refs} ${row.refs === 1 ? 'ref' : 'refs'})`
}

function fileFromSymbolId(id: SymbolId): string | null {
  const prefix = 'sym:v1:'
  if (!id.startsWith(prefix)) return null
  const hash = id.indexOf('#', prefix.length)
  if (hash < 0) return null
  try {
    return decodeURIComponent(id.slice(prefix.length, hash))
  } catch {
    return null
  }
}
