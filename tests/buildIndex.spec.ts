import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildIndex, findRepoRoot } from '../src/buildIndex.js'
import { renderHit, searchSymbols } from '../src/search.js'

describe('buildIndex', () => {
  let dir: string

  async function seed() {
    await mkdir(path.join(dir, 'src'), { recursive: true })
    await mkdir(path.join(dir, 'lib'), { recursive: true })
    await mkdir(path.join(dir, 'node_modules', 'pkg'), { recursive: true })
    await writeFile(
      path.join(dir, 'src', 'greet.ts'),
      'export function greet(name: string) { return name }\nexport class Util { static run() {} }\n',
    )
    await writeFile(path.join(dir, 'lib', 'util.js'), 'function helper() {}\nmodule.exports = { helper }\n')
    await writeFile(path.join(dir, 'node_modules', 'pkg', 'index.ts'), 'export const hidden = 1\n')
    await writeFile(path.join(dir, 'README.md'), '# Readme\n')
  }

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-code-index-'))
    await seed()
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('indexes ts+js, skips node_modules and unsupported exts', async () => {
    const index = await buildIndex(dir)
    expect(index.files.map((f) => f.path)).toEqual(['lib/util.js', 'src/greet.ts'])
    expect(index.files[1].symbols.map((s) => s.name)).toEqual(['greet', 'Util', 'run'])
    expect(index.files[1].symbols[0].exported).toBe(true)
    expect(index.files[0].symbols.map((s) => s.name)).toEqual(['helper'])

    const [hit] = searchSymbols(index, { query: 'greet' })
    expect(hit.file).toBe('src/greet.ts')
    expect(renderHit(hit)).toContain('src/greet.ts:1')
  })

  it('stores raw import specifiers per indexed file', async () => {
    const solo = await mkdtemp(path.join(os.tmpdir(), 'dsh-code-imports-'))
    try {
      await mkdir(path.join(solo, 'src'), { recursive: true })
      await writeFile(path.join(solo, 'src', 'core.ts'), 'export const x = 1\n')
      await writeFile(path.join(solo, 'src', 'app.ts'), "import { x } from './core'\n")
      const index = await buildIndex(solo)
      const app = index.files.find((f) => f.path === 'src/app.ts')
      expect(app?.imports).toEqual(['./core'])
    } finally {
      await rm(solo, { recursive: true, force: true })
    }
  })

  it('incremental refresh picks up edits and new files', async () => {
    const first = await buildIndex(dir)

    await writeFile(
      path.join(dir, 'src', 'greet.ts'),
      'export function greet(name: string) { return name }\nexport class Util { static run() {} }\nexport const k = 1\n',
    )
    await writeFile(path.join(dir, 'lib', 'extra.js'), 'export function extra() {}\n')

    const second = await buildIndex(dir, {}, first)
    const greet = second.files.find((f) => f.path === 'src/greet.ts')!
    expect(greet.symbols.find((s) => s.name === 'k')).toBeTruthy()
    expect(second.files.map((f) => f.path)).toEqual([
      'lib/extra.js',
      'lib/util.js',
      'src/greet.ts',
    ])
  })

  it('reuses cached per-file extraction when mtime is unchanged', async () => {
    const first = await buildIndex(dir)
    for (const file of first.files) {
      for (const symbol of file.symbols) symbol.file = ''
    }
    // Unchanged files reuse the previous extraction path; a missing file is dropped.
    await rm(path.join(dir, 'lib', 'extra.js'))
    const second = await buildIndex(dir, {}, first)
    expect(second.files.map((f) => f.path)).toEqual(['lib/util.js', 'src/greet.ts'])
    expect(second.files.flatMap((f) => f.symbols).every((s) => s.file.length > 0)).toBe(true)
    const cacheFile = await readFile(path.join(dir, 'src', 'greet.ts'), 'utf8')
    expect(cacheFile.length).toBeGreaterThan(0)
  })

  it('finds repositories with directory and worktree file markers', async () => {
    const regular = path.join(dir, 'regular-repo')
    const worktree = path.join(dir, 'linked-worktree')
    await mkdir(path.join(regular, '.git'), { recursive: true })
    await mkdir(path.join(regular, 'src'), { recursive: true })
    await mkdir(path.join(worktree, 'src'), { recursive: true })
    await writeFile(path.join(worktree, '.git'), 'gitdir: ../git/worktrees/linked\n')

    expect(await findRepoRoot(path.join(regular, 'src'))).toBe(regular)
    expect(await findRepoRoot(path.join(worktree, 'src'))).toBe(worktree)
  })
})
