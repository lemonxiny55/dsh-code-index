import { beforeAll, describe, expect, it } from 'vitest'
import { extractSymbols } from '../src/extract.js'
import type { SymbolInfo } from '../src/types.js'

const SAMPLE = `
import { readFile } from 'node:fs/promises'

export function greet(name: string): string {
  return \`hi \${name}\`
}

class Foo {
  private x = 1
  bar(): number { return this.x }
}

interface Shape {
  area(): number
}

const c = () => 1

export type ID = string
`

describe('extractSymbols — typescript sample', () => {
  let rows: SymbolInfo[]

  beforeAll(async () => {
    rows = await extractSymbols(SAMPLE, 'typescript')
  })

  it('extracts function', () => {
    const greet = rows.find((r) => r.name === 'greet')
    expect(greet).toMatchObject({ kind: 'function', line: 4, exported: true })
    expect(greet!.signature).toBe('greet(name: string)')
  })

  it('extracts class and method', () => {
    const foo = rows.find((r) => r.name === 'Foo')
    const bar = rows.find((r) => r.name === 'bar')
    expect(foo).toMatchObject({ kind: 'class', exported: false })
    expect(bar).toMatchObject({ kind: 'method', line: 10, exported: false })
  })

  it('extracts interface', () => {
    const shape = rows.find((r) => r.name === 'Shape')
    expect(shape).toMatchObject({ kind: 'interface', exported: false })
  })

  it('extracts variable (arrow) and type alias', () => {
    const c = rows.find((r) => r.name === 'c')
    const id = rows.find((r) => r.name === 'ID')
    expect(c).toMatchObject({ kind: 'variable', line: 17 })
    expect(id).toMatchObject({ kind: 'type', exported: true, line: 19 })
  })

  it('does not produce import rows yet and rows are line-sorted', () => {
    expect(rows.every((r) => r.kind !== 'import')).toBe(true)
    const lines = rows.map((r) => r.line)
    expect([...lines].sort((a, b) => a - b)).toEqual(lines)
  })
})

describe('extractSymbols — python sample', () => {
  let rows: SymbolInfo[]

  beforeAll(async () => {
    rows = await extractSymbols(
      'def greet(name: str) -> str:\n    return name\n\nclass Engine:\n    def start(self) -> None:\n        pass\n',
      'python',
    )
  })

  it('extracts functions and classes with parameters', () => {
    const greet = rows.find((r) => r.name === 'greet')
    const engine = rows.find((r) => r.name === 'Engine')
    const start = rows.find((r) => r.name === 'start')
    // top-level defs/classes are importable: Python's notion of exported
    expect(greet).toMatchObject({ kind: 'function', line: 1, exported: true })
    expect(greet!.signature).toBe('greet(name: str)')
    expect(engine).toMatchObject({ kind: 'class', line: 4, exported: true })
    expect(start).toMatchObject({ kind: 'method', line: 5, exported: false })
  })
})

describe('extractSymbols — python module-scope semantics', () => {
  it('classifies class-body defs as methods, nested defs stay functions', async () => {
    const rows = await extractSymbols(
      [
        'def top():',
        '    def inner():',
        '        pass',
        '    return inner',
        '',
        'class Klass:',
        '    def method(self):',
        '        pass',
      ].join('\n'),
      'python',
    )
    const byName = new Map(rows.map((r) => [r.name, r]))
    expect(byName.get('top')).toMatchObject({ kind: 'function', exported: true })
    expect(byName.get('inner')).toMatchObject({ kind: 'function', exported: false })
    expect(byName.get('Klass')).toMatchObject({ kind: 'class', exported: true })
    expect(byName.get('method')).toMatchObject({ kind: 'method', exported: false })
  })
})

describe('extractSymbols — javascript sample', () => {
  let rows: SymbolInfo[]

  beforeAll(async () => {
    rows = await extractSymbols(
      'function helper() {}\nclass W { go() {} }\nconst z = 3\n',
      'javascript',
    )
  })

  it('extracts function, class, method, variable', () => {
    expect(rows.map((r) => r.name)).toEqual(['helper', 'W', 'go', 'z'])
    expect(rows.map((r) => r.kind)).toEqual(['function', 'class', 'method', 'variable'])
  })
})

describe('extractSymbols — module-scope accuracy (regressions)', () => {
  it('indexes only module-level variables, not function locals', async () => {
    const rows = await extractSymbols(
      [
        'const top = 1',
        'export const shared = 2',
        'function f() {',
        '  const local = 3',
        '  let alsoLocal = 4',
        '  for (const item of []) {}',
        '}',
        'if (top) {',
        '  const inBlock = 5',
        '}',
      ].join('\n'),
      'typescript',
    )
    expect(rows.filter((r) => r.kind === 'variable').map((r) => r.name)).toEqual([
      'top',
      'shared',
    ])
  })

  it('marks only module-level declarations exported — methods never inherit the class export', async () => {
    const rows = await extractSymbols(
      [
        'export function pub() {}',
        'function priv() {}',
        'export class Box {',
        '  private hidden() {}',
        '  visible() {}',
        '}',
        'export const x = 1',
        'const y = 2',
        'export function outer() {',
        '  function nested() {}',
        '}',
      ].join('\n'),
      'typescript',
    )
    const exported = new Map(rows.map((r) => [r.name, r.exported]))
    expect(exported.get('pub')).toBe(true)
    expect(exported.get('priv')).toBe(false)
    expect(exported.get('Box')).toBe(true)
    // the original bug: `private hidden()` inherited `exported: true` from the
    // enclosing `export class` because the ancestor walk passed through the
    // class body.
    expect(exported.get('hidden')).toBe(false)
    expect(exported.get('visible')).toBe(false)
    expect(exported.get('x')).toBe(true)
    expect(exported.get('y')).toBe(false)
    expect(exported.get('nested')).toBe(false)
  })

  it('collapses multi-line signatures to one line', async () => {
    const rows = await extractSymbols(
      'function wide(\n  a: string,\n  b: number,\n): void {}\n',
      'typescript',
    )
    expect(rows[0].signature).toBe('wide(a: string, b: number)')
  })
})