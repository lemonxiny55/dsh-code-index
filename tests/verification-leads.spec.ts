import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import * as childProcess from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  buildChangeContext,
  buildIndex,
  buildReviewBrief,
  deriveCommandLeads,
  renderReviewBrief,
  type ReviewOutput,
} from '../src/index.js'

vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>()
  return { ...original, execFile: vi.fn(original.execFile) }
})

const dirs: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })),
  )
})

async function makeRepo(files: Record<string, string>, initGit = false): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-leads-m2-'))
  dirs.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, ...rel.split('/'))
    await mkdir(path.dirname(abs), { recursive: true })
    await writeFile(abs, content, 'utf8')
  }
  if (initGit) {
    execFileSync('git', ['init', '-q'], { cwd: root })
    execFileSync('git', ['add', '.'], { cwd: root })
    execFileSync(
      'git',
      ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'base'],
      { cwd: root },
    )
  } else {
    await mkdir(path.join(root, '.git'), { recursive: true })
  }
  return root
}

describe('M2 P1a: verification commandLead derivation', () => {
  it('derives minimal commands for Vitest (pnpm/subpkg), Jest, Pytest, Go, and Cargo without executing tests', async () => {
    const root = await makeRepo({
      'pnpm-lock.yaml': 'lockfileVersion: 9.0\n',
      'package.json': JSON.stringify({ name: 'root-app', devDependencies: { vitest: '^4.0.0' } }),
      'packages/jest-pkg/package.json': JSON.stringify({ name: '@repo/jest-pkg', scripts: { test: 'jest' } }),
      'py/pyproject.toml': '[tool.pytest.ini_options]\ntestpaths = ["tests"]\n',
      'go-svc/go.mod': 'module example.com/svc\n\ngo 1.23\n',
      'rust-crate/Cargo.toml': '[package]\nname = "core_lib"\nversion = "0.1.0"\n',
      'tests/core.spec.ts': 'export const ok = true\n',
      'packages/jest-pkg/tests/unit.test.ts': 'export const ok = true\n',
      'py/tests/test_calc.py': 'def test_add():\n    assert 1 + 1 == 2\n',
      'go-svc/pkg/handler_test.go': 'package pkg\nfunc TestHandler() {}\n',
      'rust-crate/tests/smoke.rs': 'fn smoke() {}\n',
      'rust-crate/src/parser.rs': 'pub fn parse() {}\n',
    })

    const spy = vi.mocked(childProcess.execFile).mockClear()
    const { leads, hasUnresolvedRunner } = await deriveCommandLeads(root, [
      { file: 'tests/core.spec.ts', resolution: 'import-scoped', reason: 'imports-changed-file' },
      { file: 'packages/jest-pkg/tests/unit.test.ts', resolution: 'import-scoped', reason: 'imports-changed-file' },
      { file: 'py/tests/test_calc.py', resolution: 'import-scoped', reason: 'imports-changed-file' },
      { file: 'go-svc/pkg/handler_test.go', resolution: 'import-scoped', reason: 'imports-changed-file' },
      { file: 'rust-crate/tests/smoke.rs', resolution: 'import-scoped', reason: 'imports-changed-file' },
      { file: 'rust-crate/src/parser.rs', resolution: 'name-only', reason: 'references-symbol-name' },
    ])

    expect(spy).not.toHaveBeenCalled()
    expect(hasUnresolvedRunner).toBe(false)
    expect(leads.map((l) => l.commandLead)).toEqual([
      'pnpm vitest run tests/core.spec.ts',
      'pnpm --dir packages/jest-pkg exec jest tests/unit.test.ts',
      'pytest -c py/pyproject.toml py/tests/test_calc.py',
      'cd go-svc && go test ./pkg',
      'cargo test -p core_lib --test smoke',
      'cargo test -p core_lib parser',
    ])
  })

  it('leaves commandLead empty and records verification-command-unavailable when runner cannot be identified', async () => {
    const root = await makeRepo({
      // Ambiguous deps without disambiguating script, plus missing pyproject runner
      'package.json': JSON.stringify({ name: 'ambiguous', devDependencies: { vitest: '^4.0.0', jest: '^29.0.0' } }),
      'src/calc.ts': 'export function add(a: number, b: number) { return a + b }\n',
      'tests/calc.spec.ts': "import { add } from '../src/calc'\nexport function t() { return add(1, 2) }\n",
    })

    const index = await buildIndex(root)
    const change = await buildChangeContext(index, { kind: 'files', files: ['src/calc.ts'] })
    const spy = vi.mocked(childProcess.execFile).mockClear()
    const out = await buildReviewBrief(index, change, 5000)

    expect(out.brief.status).toBe('bounded')
    if (out.brief.status !== 'bounded') throw new Error('expected bounded brief')
    expect(out.brief.verification).toBe('not-run')
    expect(out.brief.tests[0]?.commandLead).toBeUndefined()
    expect(out.brief.gaps).toContain('verification-command-unavailable')
    expect(out.text).not.toContain('— lead:')
    // Only git metadata commands (never test runners) may run
    for (const call of spy.mock.calls) {
      expect(call[0]).toBe('git')
    }
  })

  it('trims commandLead before dropping core change source or strong callers and obeys 300/500/5000/20000 budgets', async () => {
    const root = await makeRepo(
      {
        'pnpm-lock.yaml': 'lockfileVersion: 9.0\n',
        'package.json': JSON.stringify({ name: 'app', devDependencies: { vitest: '^4.0.0' } }),
        'src/core.ts': 'export function calc(n: number) { return n + 1 }\n',
        'src/caller.ts': "import { calc } from './core'\nexport function runCaller() { return calc(1) }\n",
        'tests/core.spec.ts': "import { calc } from '../src/core'\nexport function verifyCalc() { return calc(2) }\n",
      },
      true,
    )
    await writeFile(path.join(root, 'src/core.ts'), 'export function calc(n: number) { return n + 99 }\n')

    const index = await buildIndex(root)
    const change = await buildChangeContext(index, { kind: 'git', root, baseRef: 'HEAD' })

    // Verify full budget includes commandLead
    const roomy = await buildReviewBrief(index, change, 5000)
    expect(roomy.brief.status).toBe('bounded')
    if (roomy.brief.status !== 'bounded') throw new Error('expected bounded')
    expect(roomy.brief.tests[0]?.commandLead).toBe('pnpm vitest run tests/core.spec.ts')
    expect(roomy.text).toContain('— lead: pnpm vitest run tests/core.spec.ts')

    // Tight budget just below the full with-lead output: drops commandLead first, keeps source/caller & gap
    const tightLimit = Math.max(500, roomy.brief.budget.usedChars - 10)
    const tight = await buildReviewBrief(index, change, tightLimit)
    expect(tight.brief.status).toBe('bounded')
    if (tight.brief.status === 'bounded') {
      expect(tight.brief.changes[0]?.code).toContain('return n + 99')
      expect(tight.brief.relations.some((r) => r.kind === 'call' && r.name === 'runCaller')).toBe(true)
      expect(tight.brief.tests.length).toBeGreaterThan(0)
      expect(tight.brief.tests[0]?.commandLead).toBeUndefined()
      expect(tight.brief.gaps).toContain('command-lead-budget')
    }

    // Strict envelope and non-sliced code lines across 300 / 500 / 5000 / 20000
    for (const budget of [300, 500, 5000, 20000]) {
      const out: ReviewOutput = await buildReviewBrief(index, change, budget)
      expect(out.brief.budget.limit).toBe(budget)
      expect(out.brief.budget.usedChars).toBe(JSON.stringify(out).length)
      expect(out.brief.budget.usedChars).toBeLessThanOrEqual(budget)
      expect(renderReviewBrief(out.brief)).toBe(out.text)
      expect(out.text.length).toBeLessThanOrEqual(budget)
      expect(out.brief.verification).toBe('not-run')
      if (out.brief.status === 'bounded') {
        for (const row of out.brief.changes.filter((c) => c.code !== undefined && c.side === 'current')) {
          const lines = (await readFile(path.join(root, row.file), 'utf8')).split(/\r?\n/)
          expect(row.code).toBe(lines.slice(row.startLine - 1, row.endLine).join('\n'))
        }
      }
    }
  })
})
