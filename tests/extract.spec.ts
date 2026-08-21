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