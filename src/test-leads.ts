/**
 * Deterministic minimal-scope verification command leads from repository manifests.
 *
 * Strictly static inspection only — never spawns or executes any test runner.
 * Leaves `commandLead` undefined when no runner can be safely determined.
 */

import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { AffectedTest } from './change-context.js'

export interface ReviewTestLead extends AffectedTest {
  /** Deterministic minimal-scope verification command suggestion (never executed). */
  commandLead?: string
}

export interface CommandLeadBatch {
  leads: ReviewTestLead[]
  hasUnresolvedRunner: boolean
}

const JS_TEST_EXTS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])
const PY_TEST_EXTS = new Set(['.py', '.pyi'])

function quoteArg(value: string): string {
  return /^[A-Za-z0-9_./:-]+$/.test(value) ? value : `"${value.replace(/"/g, '\\"')}"`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ancestorDirs(relFile: string): string[] {
  const dirs: string[] = []
  let dir = path.posix.dirname(relFile)
  for (;;) {
    const clean = dir === '.' ? '' : dir
    dirs.push(clean)
    if (!clean) break
    const parent = path.posix.dirname(clean)
    dir = parent === clean ? '' : parent
  }
  return dirs
}

function detectJsRunnerFromPackage(pkg: Record<string, unknown>): 'vitest' | 'jest' | null {
  const scripts = isPlainObject(pkg.scripts) ? pkg.scripts : undefined
  const scriptTexts = [scripts?.test, scripts?.['test:unit']].filter(
    (v): v is string => typeof v === 'string',
  )
  for (const script of scriptTexts) {
    const hasVitest = /\bvitest\b/i.test(script)
    const hasJest = /\bjest\b/i.test(script)
    if (hasVitest && !hasJest) return 'vitest'
    if (hasJest && !hasVitest) return 'jest'
  }

  const deps: Record<string, unknown> = {
    ...(isPlainObject(pkg.dependencies) ? pkg.dependencies : {}),
    ...(isPlainObject(pkg.devDependencies) ? pkg.devDependencies : {}),
  }
  const hasVitestDep = 'vitest' in deps
  const hasJestDep = 'jest' in deps || 'ts-jest' in deps
  if (hasVitestDep && !hasJestDep) return 'vitest'
  if (hasJestDep && !hasVitestDep) return 'jest'
  return null
}

function detectCargoPackageName(toml: string): string | undefined {
  let section = ''
  for (const rawLine of toml.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const sec = /^\[([^\]]+)\]$/.exec(line)
    if (sec) {
      section = sec[1]!.trim()
      continue
    }
    if (section === 'package') {
      const match = /^name\s*=\s*["']([^"']+)["']/.exec(line)
      if (match) return match[1]!.trim()
    }
  }
  return undefined
}

function hasPytestConfig(toml: string): boolean {
  for (const rawLine of toml.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    if (/^\[tool\.pytest(?:\.[^\]]+)?\]$/.test(line)) return true
    if (/\bpytest\b/i.test(line)) return true
  }
  return false
}

function hasGoModule(goMod: string): boolean {
  return goMod
    .split(/\r?\n/)
    .some((raw) => /^\s*module\s+\S+/.test(raw.replace(/\/\/.*$/, '')))
}

/**
 * Derive deterministic minimal-scope verification command suggestions for
 * candidate tests from nearby manifest files without executing anything.
 */
export async function deriveCommandLeads(
  root: string,
  tests: readonly AffectedTest[],
): Promise<CommandLeadBatch> {
  if (tests.length === 0) return { leads: [], hasUnresolvedRunner: false }

  const fileTextCache = new Map<string, Promise<string | null>>()
  const readRel = (relPath: string): Promise<string | null> => {
    const existing = fileTextCache.get(relPath)
    if (existing) return existing
    const pending = readFile(path.join(root, ...relPath.split('/')), 'utf8').catch(() => null)
    fileTextCache.set(relPath, pending)
    return pending
  }

  const fileExistsCache = new Map<string, Promise<boolean>>()
  const existsRel = (relPath: string): Promise<boolean> => {
    const existing = fileExistsCache.get(relPath)
    if (existing) return existing
    const pending = stat(path.join(root, ...relPath.split('/')))
      .then((st) => st.isFile())
      .catch(() => false)
    fileExistsCache.set(relPath, pending)
    return pending
  }

  const rootPm = async (pkg?: Record<string, unknown>): Promise<'pnpm' | 'yarn' | 'npx'> => {
    const pmField = typeof pkg?.packageManager === 'string' ? pkg.packageManager : ''
    if (pmField.startsWith('pnpm@')) return 'pnpm'
    if (pmField.startsWith('yarn@')) return 'yarn'
    if (await existsRel('pnpm-lock.yaml')) return 'pnpm'
    if (await existsRel('yarn.lock')) return 'yarn'
    return 'npx'
  }

  let hasUnresolvedRunner = false
  const leads: ReviewTestLead[] = []

  for (const test of tests) {
    const normalized = test.file.replace(/\\/g, '/').replace(/^\.\//, '')
    if (!normalized || normalized.startsWith('/') || /(^|\/)\.\.(\/|$)/.test(normalized)) {
      hasUnresolvedRunner = true
      leads.push({ ...test })
      continue
    }

    const ext = path.posix.extname(normalized).toLowerCase()
    const dirs = ancestorDirs(normalized)
    let commandLead: string | undefined

    if (JS_TEST_EXTS.has(ext)) {
      for (const dir of dirs) {
        const pkgPath = dir ? `${dir}/package.json` : 'package.json'
        const raw = await readRel(pkgPath)
        if (raw === null) continue
        let parsed: unknown
        try {
          parsed = JSON.parse(raw)
        } catch {
          continue
        }
        if (!isPlainObject(parsed)) continue
        const runner = detectJsRunnerFromPackage(parsed)
        if (!runner) continue
        const pm = await rootPm(parsed)
        const targetRel = dir ? path.posix.relative(dir, normalized) : normalized
        const quoted = quoteArg(targetRel)
        if (dir === '') {
          if (runner === 'vitest') {
            commandLead =
              pm === 'pnpm'
                ? `pnpm vitest run ${quoted}`
                : pm === 'yarn'
                  ? `yarn vitest run ${quoted}`
                  : `npx vitest run ${quoted}`
          } else {
            commandLead =
              pm === 'pnpm'
                ? `pnpm exec jest ${quoted}`
                : pm === 'yarn'
                  ? `yarn jest ${quoted}`
                  : `npx jest ${quoted}`
          }
        } else {
          const quotedDir = quoteArg(dir)
          if (runner === 'vitest') {
            commandLead =
              pm === 'pnpm'
                ? `pnpm --dir ${quotedDir} exec vitest run ${quoted}`
                : `npx --prefix ${quotedDir} vitest run ${quoted}`
          } else {
            commandLead =
              pm === 'pnpm'
                ? `pnpm --dir ${quotedDir} exec jest ${quoted}`
                : `npx --prefix ${quotedDir} jest ${quoted}`
          }
        }
        break
      }
    } else if (PY_TEST_EXTS.has(ext)) {
      for (const dir of dirs) {
        const tomlPath = dir ? `${dir}/pyproject.toml` : 'pyproject.toml'
        const raw = await readRel(tomlPath)
        if (raw === null) continue
        if (!hasPytestConfig(raw)) continue
        commandLead =
          dir === ''
            ? `pytest ${quoteArg(normalized)}`
            : `pytest -c ${quoteArg(tomlPath)} ${quoteArg(normalized)}`
        break
      }
    } else if (ext === '.go') {
      const hasGoWork = await existsRel('go.work')
      for (const dir of dirs) {
        const modPath = dir ? `${dir}/go.mod` : 'go.mod'
        const raw = await readRel(modPath)
        if (raw === null || !hasGoModule(raw)) continue
        const testDir = path.posix.dirname(normalized)
        const pkgRel = dir ? path.posix.relative(dir, testDir) : testDir === '.' ? '' : testDir
        const pkgTarget = pkgRel ? `./${pkgRel}` : '.'
        if (dir === '') {
          commandLead = `go test ${quoteArg(pkgTarget)}`
        } else if (hasGoWork) {
          commandLead = `go test ${quoteArg(`./${testDir}`)}`
        } else {
          commandLead = `cd ${quoteArg(dir)} && go test ${quoteArg(pkgTarget)}`
        }
        break
      }
    } else if (ext === '.rs') {
      for (const dir of dirs) {
        const cargoPath = dir ? `${dir}/Cargo.toml` : 'Cargo.toml'
        const raw = await readRel(cargoPath)
        if (raw === null) continue
        const pkgName = detectCargoPackageName(raw)
        if (!pkgName && !raw.includes('[package]')) continue
        const relInCrate = dir ? path.posix.relative(dir, normalized) : normalized
        const pkgFlag = pkgName ? ` -p ${quoteArg(pkgName)}` : ''
        if (relInCrate.startsWith('tests/')) {
          const testName = path.posix.basename(relInCrate, '.rs')
          commandLead = `cargo test${pkgFlag} --test ${quoteArg(testName)}`
        } else {
          const stem = path.posix.basename(relInCrate, '.rs')
          if (stem && stem !== 'lib' && stem !== 'main' && stem !== 'mod') {
            commandLead = `cargo test${pkgFlag} ${quoteArg(stem)}`
          } else {
            commandLead = `cargo test${pkgFlag}`
          }
        }
        break
      }
    }

    if (!commandLead) hasUnresolvedRunner = true
    leads.push(commandLead ? { ...test, commandLead } : { ...test })
  }

  return { leads, hasUnresolvedRunner }
}
