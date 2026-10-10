import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { isGitIgnoredPath, scanRepo, type GitIgnoreMatcherCache } from '../src/scan.js'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(rules: string, files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-code-ignore-regression-'))
  roots.push(root)
  execFileSync('git', ['init', '--quiet', root])
  await writeFile(path.join(root, '.gitignore'), rules)
  for (const [rel, contents] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, rel)), { recursive: true })
    await writeFile(path.join(root, rel), contents)
  }
  return root
}

function gitIgnored(root: string, rel: string): boolean {
  try {
    execFileSync('git', ['-C', root, 'check-ignore', '--no-index', '-q', rel])
    return true
  } catch (error) {
    expect((error as { status: number }).status).toBe(1)
    return false
  }
}

describe('Git ignore directory semantics (Issue #2)', () => {
  it('descends into directory-only whitelist negations', async () => {
    const root = await fixture('/extensions/*\n!/extensions/keep/\n!/extensions/keep/**\n', {
      'src/control.ts': 'export function CONTROL_MARKER_fn() { return 3 }\n',
      'extensions/keep/kept.ts': 'export function KEPT_MARKER_fn() { return 1 }\n',
      'extensions/other/skip.ts': 'export function SKIPPED_fn() { return 2 }\n',
    })
    expect(gitIgnored(root, 'extensions/keep/kept.ts')).toBe(false)
    expect(gitIgnored(root, 'extensions/other/skip.ts')).toBe(true)
    expect((await scanRepo(root)).map((file) => file.rel)).toEqual(['extensions/keep/kept.ts', 'src/control.ts'])
    expect(isGitIgnoredPath(root, 'extensions/keep/')).toBe(false)
    expect(isGitIgnoredPath(root, 'extensions/keep/kept.ts')).toBe(false)
  })

  it('respects directory-only exclusions and cannot unignore children of excluded parents', async () => {
    const root = await fixture('/hidden/\n!hidden/kept.ts\n/plain\n', {
      'hidden/.gitignore': '!kept.ts\n',
      'hidden/kept.ts': 'export function hidden() {}\n',
      'plain/a.ts': 'export function plain() {}\n',
      'visible/a.ts': 'export function visible() {}\n',
    })
    for (const rel of ['hidden/', 'hidden/kept.ts', 'plain/', 'visible/a.ts']) {
      expect(isGitIgnoredPath(root, rel), rel).toBe(gitIgnored(root, rel))
    }
    expect(isGitIgnoredPath(root, 'hidden', new Map(), true)).toBe(true)
    expect(isGitIgnoredPath(root, 'hidden', new Map(), false)).toBe(false)
    expect((await scanRepo(root)).map((file) => file.rel)).toEqual(['visible/a.ts'])
  })

  it('lets nested rules override file matches and refreshes changed/deleted ignore files', async () => {
    const root = await fixture('*.generated.ts\n', {
      'src/.gitignore': '!keep.generated.ts\n/local/\n',
      'src/keep.generated.ts': 'export function kept() {}\n',
      'src/drop.generated.ts': 'export function dropped() {}\n',
      'src/local/a.ts': 'export function local() {}\n',
    })
    const cache: GitIgnoreMatcherCache = new Map()
    const check = async (expected: string[]) => {
      expect((await scanRepo(root)).map((file) => file.rel)).toEqual(expected)
      for (const rel of ['src/keep.generated.ts', 'src/drop.generated.ts', 'src/local/', 'src/local/a.ts']) {
        expect(isGitIgnoredPath(root, rel, cache), rel).toBe(gitIgnored(root, rel))
      }
    }
    await check(['src/keep.generated.ts'])
    await writeFile(path.join(root, 'src/.gitignore'), '!*.generated.ts\n')
    await check(['src/drop.generated.ts', 'src/keep.generated.ts', 'src/local/a.ts'])
    await rm(path.join(root, 'src/.gitignore'))
    await check(['src/local/a.ts'])
  })
})
