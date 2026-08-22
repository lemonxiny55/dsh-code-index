import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { tools } from '../src/tools.js'
import type { RepoIndex } from '../src/types.js'

type ToolName = 'code_index' | 'code_symbols' | 'code_search' | 'code_map'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

/** A real git repo with two small TS files, so resolveRoot walks to .git. */
async function fixtureRepo(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-cix-'))
  dirs.push(root)
  await mkdir(path.join(root, '.git'), { recursive: true })
  await mkdir(path.join(root, 'src'), { recursive: true })
  await writeFile(
    path.join(root, 'src', 'core.ts'),
    'export function scope(x: number) { return x }\nexport class Core { run() {} }\n',
  )
  await writeFile(path.join(root, 'src', 'util.ts'), 'const helper = () => 1\nexport { helper }\n')
  return root
}

const tool = (name: ToolName) => tools.find((t) => t.name === name)!
/**
 * Minimal structural exec carrying the session cwd the way the harness does.
 * Cast to `never`: dsh-tools types the parameter as its full ToolRunContext
 * (deferContext, concludeTurn, ...) which a test stub intentionally omits.
 */
const execAt = (cwd: string) =>
  ({ agent: { session: { header: { cwd } } } }) as unknown as never

describe('tool execute — full tool path', () => {
  it('code_index builds lazily and reports counts from the session cwd', async () => {
    const root = await fixtureRepo()
    const out = (await tool('code_index').execute({}, execAt(root))) as string
    expect(out).toContain(`repo: ${path.resolve(root)}`)
    expect(out).toContain('files indexed: 2')
    expect(out).toContain('symbols: 4')
    expect(out).toContain('languages: typescript')
  })

  it('code_symbols filters by kind and carries repo-relative file:line', async () => {
    const root = await fixtureRepo()
    const hits = (await tool('code_symbols').execute(
      { kind: 'function' },
      execAt(root),
    )) as Array<Record<string, unknown>>
    const scope = hits.find((h) => h.name === 'scope')
    expect(scope).toMatchObject({ file: 'src/core.ts', exported: true, line: 1 })
    // util.ts's arrow `helper` is indexed as a variable, so only one function.
    expect(hits).toHaveLength(1)
  })

  it('code_search pins an exact match with file:line', async () => {
    const root = await fixtureRepo()
    const hits = (await tool('code_search').execute(
      { query: 'scope' },
      execAt(root),
    )) as Array<{ name: string; score: number; file: string; line: number }>
    expect(hits[0]).toMatchObject({ name: 'scope', score: 1, file: 'src/core.ts', line: 1 })
  })

  it('code_map renders a ranked map with signatures', async () => {
    const root = await fixtureRepo()
    const map = (await tool('code_map').execute({}, execAt(root))) as string
    expect(map).toContain('# repo map')
    expect(map).toContain('## src/core.ts')
    expect(map).toContain('scope(x: number)')
  })

  it('partitions caches per repo root (no cross-contamination)', async () => {
    const a = await fixtureRepo()
    const b = await fixtureRepo()
    const searchA = (await tool('code_search').execute(
      { query: 'Core' },
      execAt(a),
    )) as Array<{ name: string; file: string }>
    const searchB = (await tool('code_search').execute(
      { query: 'Core' },
      execAt(b),
    )) as Array<{ name: string; file: string }>
    expect(searchA).toHaveLength(1)
    expect(searchB).toHaveLength(1)
    expect(searchA[0].file).toBe('src/core.ts')
    expect(searchB[0].file).toBe('src/core.ts')
  })

  it('auto-resolves a null cwd to a git repo near the process cwd or reports a missing index', async () => {
    // No session cwd: resolveRoot falls back to process.cwd(). We cannot rely
    // on what that is under vitest, but the tool must not throw a raw error.
    const out = (await tool('code_index').execute({}, {} as unknown as never)) as string
    expect(typeof out).toBe('string')
    expect(out.length).toBeGreaterThan(0)
  })
})