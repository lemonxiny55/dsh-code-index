import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { extractAll } from '../src/extract.js'
import { buildIndex, buildIndexWithCache } from '../src/buildIndex.js'
import { defaultCachePath, loadIndex } from '../src/store.js'
import { REPO_INDEX_SCHEMA_VERSION } from '../src/types.js'
import { tools } from '../src/tools.js'
import { renderHit, type RankedHit } from '../src/search.js'

const repro = await readFile(new URL('./fixtures/rust/repro.rs', import.meta.url), 'utf8')
const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-rust-'))
  roots.push(root)
  await mkdir(path.join(root, '.git'))
  await writeFile(path.join(root, 'repro.rs'), repro)
  return root
}
const invoke = async (name: string, root: string, args: Record<string, unknown> = {}) =>
  tools.find(tool => tool.name === name)!.execute({ ...args, repoRoot: root } as never, {} as never)

describe('Rust declarations — Issue #5', () => {
  it('keeps the actual names, signatures and stable IDs from the reported minimal reproduction', async () => {
    const result = await extractAll(repro, 'rust', 'repro.rs')
    expect(result.diagnostic.status).toBe('parsed')
    const declarations = result.symbols.filter(symbol => symbol.name !== 'run')
    expect(declarations.map(symbol => symbol.name)).toEqual([
      'PublicOne', 'PrivateOne', 'PublicEnum', 'PrivateEnum', 'PublicTrait', 'PrivateTrait',
      'public_function', 'private_function',
    ])
    for (const symbol of declarations) {
      expect(symbol.signature).toBe(symbol.kind === 'function' ? `${symbol.name}(a: u32)` : symbol.name)
      expect(symbol.id).toContain(`${symbol.name}@1`)
    }
    const moved = await extractAll(`\n// line-only change\n${repro}`, 'rust', 'repro.rs')
    expect(moved.symbols.map(symbol => symbol.id)).toEqual(result.symbols.map(symbol => symbol.id))
  })

  it.each(['', 'pub ', 'pub(crate) ', 'pub(in crate::nested) '])('handles %s visibility for types and existing functions', async visibility => {
    const result = await extractAll([
      `${visibility}struct Item { value: u32 }`,
      `${visibility}struct Tuple(u32);`,
      `${visibility}struct Unit;`,
      `${visibility}enum Choice { A }`,
      `${visibility}trait Service { fn run(&self); }`,
      `${visibility}fn helper(value: u32) -> u32 { value }`,
    ].join('\n'), 'rust', 'visibility.rs')
    expect(result.diagnostic.status).toBe('parsed')
    for (const name of ['Item', 'Tuple', 'Unit', 'Choice', 'Service', 'helper']) {
      const symbol = result.symbols.find(symbol => symbol.name === name)!
      expect(symbol).toBeDefined()
      expect(symbol.exported).toBe(visibility === 'pub ')
      expect(symbol.signature).toBe(name === 'helper' ? 'helper(value: u32)' : name)
    }
    expect(result.symbols.find(symbol => symbol.name === 'run')).toMatchObject({ signature: 'run(&self)', exported: false })
  })

  it('renders the declared names across symbols, search, map, context and refs without inventing type-use edges', async () => {
    const root = await fixture()
    // Struct literals/type annotations are not call expressions in the existing Rust provider.
    await writeFile(path.join(root, 'use.rs'), 'fn caller() { let value: PublicOne = PublicOne { field: public_function(1) }; }\n')
    const symbols = await invoke('code_symbols', root, { file: 'repro.rs' }) as RankedHit[]
    expect(symbols).toHaveLength(10)
    for (const name of ['PublicOne', 'PublicEnum', 'PublicTrait']) {
      const hits = await invoke('code_search', root, { query: name }) as RankedHit[]
      expect(hits[0]).toMatchObject({ name, signature: name, score: 1, exported: true })
      expect(renderHit(hits[0])).toContain(name)
      const refs = await invoke('code_refs', root, { symbol: name }) as string
      expect(refs).toContain(`${name} — repro.rs:`)
      expect(refs).toContain('callers (0)')
      expect(refs).toContain('callees (0)')
    }
    const map = await invoke('code_map', root) as string
    for (const name of ['PublicOne', 'PublicEnum', 'PublicTrait']) expect(map).toContain(name)
    expect(map).not.toMatch(/(?:class|enum|interface) pub(?:\s|\()/)
    const context = await invoke('code_context', root, { task: 'Explain PublicOne PublicEnum PublicTrait', budgetChars: 8000 }) as string
    expect(context).toContain('PublicOne')
    expect(context).not.toMatch(/(?:class|enum|interface) pub(?:\s|\()/)
    const pack = await invoke('code_context', root, { task: 'Explain PublicOne', outputFormat: 'pack', budgetChars: 8000 }) as { items: { name?: string; code?: string }[] }
    expect(pack.items.some(item => item.name === 'PublicOne' && item.code?.includes('pub struct PublicOne'))).toBe(true)
    const functions = await invoke('code_refs', root, { symbol: 'public_function' }) as string
    expect(functions).toContain('callers (1)')
    expect(functions).toContain('in caller')
  })

  it('rejects pre-fix caches and reparses unchanged files rather than preserving stale names, signatures or IDs', async () => {
    const root = await fixture()
    const previous = await buildIndex(root)
    const originalIds = previous.files[0].symbols.map(symbol => symbol.id)
    const stale = JSON.parse(JSON.stringify(previous))
    stale.schemaVersion = 3
    for (const symbol of stale.files[0].symbols) {
      if (symbol.exported && symbol.kind !== 'function') {
        symbol.name = 'pub'
        symbol.signature = 'pub'
        symbol.id = symbol.id.replace(/Public\w+/, 'pub')
      }
    }
    const cache = defaultCachePath(root)
    await mkdir(path.dirname(cache), { recursive: true })
    await writeFile(cache, JSON.stringify(stale))
    expect(await loadIndex(cache)).toBeNull()
    const rebuilt = await buildIndexWithCache(root)
    expect(rebuilt.schemaVersion).toBe(REPO_INDEX_SCHEMA_VERSION)
    expect(rebuilt.files[0].mtimeMs).toBe(previous.files[0].mtimeMs)
    expect(rebuilt.files[0].symbols.map(symbol => symbol.id)).toEqual(originalIds)
    expect(rebuilt.files[0].symbols.find(symbol => symbol.name === 'PublicOne')?.signature).toBe('PublicOne')
    expect(await loadIndex(cache)).toEqual(rebuilt)
    const direct = await buildIndex(root, {}, stale)
    expect(direct.files[0].symbols).toEqual(rebuilt.files[0].symbols)
  })
})
