import { describe, expect, it } from 'vitest'
import { encodeSymbolComponent, extractAll } from '../src/extract.js'

describe('encodeSymbolComponent', () => {
  it('encodes path separators and the RFC 3986 extras', () => {
    expect(encodeSymbolComponent('src/service.ts')).toBe('src%2Fservice.ts')
    expect(encodeSymbolComponent("a b~c!'")).toBe('a%20b%7Ec%21%27')
  })
})

describe('stable qualified symbol ids', () => {
  const FILE = 'src/service.ts'
  const prefix = `sym:v1:${encodeSymbolComponent(FILE)}#`

  it('is stable across blank-line, comment and body edits', async () => {
    const before = await extractAll(
      'export function first() {}\nexport function second() {}\n',
      'typescript',
      FILE,
    )
    const after = await extractAll(
      '\n// header\n\nexport function first() {}\n\n\n// between\nexport function second() {\n  return 1\n}\n',
      'typescript',
      FILE,
    )
    expect(after.symbols.map((s) => s.id)).toEqual(before.symbols.map((s) => s.id))
  })

  it('assigns distinct ordinals to same-name declarations in one file', async () => {
    const { symbols } = await extractAll(
      'function save() {}\nfunction save(a: number) {}\n',
      'typescript',
      FILE,
    )
    const saves = symbols.filter((s) => s.name === 'save')
    expect(saves).toHaveLength(2)
    expect(saves.map((s) => s.ordinal)).toEqual([1, 2])
    expect(new Set(saves.map((s) => s.id)).size).toBe(2)
  })

  it('keeps two same-line same-name declarations with distinct ordinals', async () => {
    const { symbols } = await extractAll(
      'function save() {} function save(a: number) {}\n',
      'typescript',
      FILE,
    )
    const saves = symbols.filter((s) => s.name === 'save')
    expect(saves).toHaveLength(2)
    expect(saves.map((s) => s.ordinal)).toEqual([1, 2])
    expect(saves.map((s) => s.id)).toEqual([
      `${prefix}function:save@1`,
      `${prefix}function:save@2`,
    ])
  })

  it('keeps same-line same-name methods scoped to their own owner', async () => {
    const { symbols } = await extractAll(
      'class A { run() {} } class B { run() {} }\n',
      'typescript',
      FILE,
    )
    expect(symbols.filter((s) => s.name === 'run').map((s) => s.id)).toEqual([
      `${prefix}class:A@1/method:run@1`,
      `${prefix}class:B@1/method:run@1`,
    ])
  })

  it('distinguishes a method from a free function of the same name', async () => {
    const { symbols } = await extractAll(
      'class Box { save() {} }\nfunction save() {}\n',
      'typescript',
      FILE,
    )
    const method = symbols.find((s) => s.kind === 'method')!
    const fn = symbols.find((s) => s.kind === 'function')!
    expect(method.scope).toEqual([{ kind: 'class', name: 'Box', ordinal: 1 }])
    expect(fn.scope).toEqual([])
    expect(method.id).toBe(`${prefix}class:Box@1/method:save@1`)
    expect(fn.id).toBe(`${prefix}function:save@1`)
  })

  it('scopes same-named methods to their own class', async () => {
    const { symbols } = await extractAll(
      'class A { run() {} }\nclass B { run() {} }\n',
      'typescript',
      FILE,
    )
    expect(symbols.filter((s) => s.name === 'run').map((s) => s.id)).toEqual([
      `${prefix}class:A@1/method:run@1`,
      `${prefix}class:B@1/method:run@1`,
    ])
  })

  it('nests a function inside its lexical owner', async () => {
    const { symbols } = await extractAll(
      'function parse() {\n  function visit() {}\n}\n',
      'typescript',
      FILE,
    )
    const visit = symbols.find((s) => s.name === 'visit')!
    expect(visit.scope).toEqual([{ kind: 'function', name: 'parse', ordinal: 1 }])
    expect(visit.id).toBe(`${prefix}function:parse@1/function:visit@1`)
  })

  it('scopes a Go method to its receiver type and a free function to module level', async () => {
    const { symbols } = await extractAll(
      'package m\n\ntype Server struct{}\n\nfunc (s *Server) Start() error { return nil }\n\nfunc Free() {}\n',
      'go',
      'pkg/s.go',
    )
    const start = symbols.find((s) => s.name === 'Start')!
    expect(start.scope).toEqual([{ kind: 'class', name: 'Server', ordinal: 1 }])
    expect(start.id).toContain('#class:Server@1/method:Start@1')
    expect(symbols.find((s) => s.name === 'Free')!.scope).toEqual([])
  })

  it('scopes a Rust impl method to its impl, not the declared type', async () => {
    const { symbols } = await extractAll(
      'struct Config {}\n\nimpl Config {\n    fn new() -> Self { Self {} }\n}\n',
      'rust',
      'src/c.rs',
    )
    const create = symbols.find((s) => s.name === 'new')!
    expect(create.scope).toEqual([{ kind: 'impl', name: 'Config', ordinal: 1 }])
    expect(create.id).toBe('sym:v1:src%2Fc.rs#impl:Config@1/method:new@1')
  })

  it('keeps distinct trait impls for one type in separate impl scopes', async () => {
    const { symbols } = await extractAll(
      'struct Config {}\n\nimpl Display for Config {\n    fn fmt(&self) {}\n}\n\nimpl Debug for Config {\n    fn fmt(&self) {}\n}\n',
      'rust',
      'src/c.rs',
    )
    const fmts = symbols.filter((s) => s.name === 'fmt')
    expect(fmts.map((s) => s.scope)).toEqual([
      [{ kind: 'impl', name: 'Display for Config', ordinal: 1 }],
      [{ kind: 'impl', name: 'Debug for Config', ordinal: 1 }],
    ])
    expect(fmts.map((s) => s.id)).toEqual([
      'sym:v1:src%2Fc.rs#impl:Display%20for%20Config@1/method:fmt@1',
      'sym:v1:src%2Fc.rs#impl:Debug%20for%20Config@1/method:fmt@1',
    ])
  })

  it('scopes an out-of-class C++ definition through its qualifier', async () => {
    const { symbols } = await extractAll(
      'class Widget { public: void draw(); };\nvoid Widget::draw() {}\n',
      'cpp',
      'src/w.cpp',
    )
    const draws = symbols.filter((s) => s.name === 'draw' && s.kind === 'method')
    expect(draws.length).toBeGreaterThanOrEqual(1)
    expect(
      draws.every((s) => s.scope[0]?.kind === 'class' && s.scope[0]?.name === 'Widget'),
    ).toBe(true)
    expect(new Set(draws.map((s) => s.id)).size).toBe(draws.length)
  })

  it('scopes out-of-class C++ definitions to their qualified owner, not the first same-named one', async () => {
    const { symbols } = await extractAll(
      'namespace a { class Widget { public: void draw(); }; }\n' +
        'namespace b { class Widget { public: void draw(); }; }\n' +
        'void a::Widget::draw() {}\n' +
        'void b::Widget::draw() {}\n',
      'cpp',
      'src/w.cpp',
    )
    const defs = symbols.filter((s) => s.name === 'draw' && s.kind === 'function')
    expect(defs.map((s) => s.id)).toEqual([
      'sym:v1:src%2Fw.cpp#namespace:a@1/class:Widget@1/function:draw@1',
      'sym:v1:src%2Fw.cpp#namespace:b@1/class:Widget@1/function:draw@1',
    ])
  })

  it('scopes symbols inside a C++ namespace', async () => {
    const { symbols } = await extractAll('namespace app {\nint value = 1;\n}\n', 'cpp', 'src/a.cpp')
    const value = symbols.find((s) => s.name === 'value')!
    expect(value.scope).toEqual([{ kind: 'namespace', name: 'app', ordinal: 1 }])
  })
})

describe('import bindings', () => {
  it('captures ts named/alias/default/namespace/re-export bindings', async () => {
    const { imports, importDetails } = await extractAll(
      [
        "import def, { a, b as c } from './m'",
        "import * as ns from './n'",
        "import './side'",
        "export { x as y } from './r'",
        "export * from './w'",
      ].join('\n'),
      'typescript',
      'src/a.ts',
    )
    expect(imports).toEqual(['./m', './n', './side', './r', './w'])
    expect(importDetails).toEqual([
      {
        specifier: './m',
        line: 1,
        kind: 'import',
        bindings: [
          { imported: 'default', local: 'def', kind: 'default' },
          { imported: 'a', local: 'a', kind: 'named' },
          { imported: 'b', local: 'c', kind: 'named' },
        ],
      },
      {
        specifier: './n',
        line: 2,
        kind: 'import',
        bindings: [{ imported: '*', local: 'ns', kind: 'namespace' }],
      },
      { specifier: './side', line: 3, kind: 'import', bindings: [] },
      {
        specifier: './r',
        line: 4,
        kind: 'reexport',
        bindings: [{ imported: 'x', local: 'y', kind: 'named' }],
      },
      { specifier: './w', line: 5, kind: 'reexport', bindings: [] },
    ])
  })

  it('captures python from-import and module aliases', async () => {
    const { imports, importDetails } = await extractAll(
      [
        'from .utils import helper',
        'from ..pkg.mod import Thing as T',
        'import os.path',
        'import x as y',
        'from mod import *',
      ].join('\n'),
      'python',
      'pkg/a.py',
    )
    expect(imports).toEqual(['./utils', '../pkg/mod', 'os/path', 'x', 'mod'])
    expect(importDetails).toEqual([
      {
        specifier: './utils',
        line: 1,
        kind: 'import',
        bindings: [{ imported: 'helper', local: 'helper', kind: 'named' }],
      },
      {
        specifier: '../pkg/mod',
        line: 2,
        kind: 'import',
        bindings: [{ imported: 'Thing', local: 'T', kind: 'named' }],
      },
      {
        specifier: 'os/path',
        line: 3,
        kind: 'import',
        bindings: [{ imported: null, local: 'os', kind: 'package' }],
      },
      {
        specifier: 'x',
        line: 4,
        kind: 'import',
        bindings: [{ imported: 'x', local: 'y', kind: 'namespace' }],
      },
      {
        specifier: 'mod',
        line: 5,
        kind: 'import',
        bindings: [{ imported: '*', local: '*', kind: 'glob' }],
      },
    ])
  })

  it('captures go package aliases and rust use aliases', async () => {
    const go = await extractAll(
      'package m\n\nimport (\n\talias "example.com/x"\n\t"os"\n)\n',
      'go',
      'pkg/m.go',
    )
    expect(go.imports).toEqual(['example.com/x', 'os'])
    expect(go.importDetails).toEqual([
      {
        specifier: 'example.com/x',
        line: 4,
        kind: 'import',
        bindings: [{ imported: null, local: 'alias', kind: 'package' }],
      },
      {
        specifier: 'os',
        line: 5,
        kind: 'import',
        bindings: [{ imported: null, local: 'os', kind: 'package' }],
      },
    ])
    const rust = await extractAll(
      'use crate::engine::Settings as Cfg;\nuse std::collections::HashMap;\n',
      'rust',
      'src/m.rs',
    )
    expect(rust.imports).toEqual(['engine/Settings', 'std/collections/HashMap'])
    expect(rust.importDetails[0]).toEqual({
      specifier: 'engine/Settings',
      line: 1,
      kind: 'use',
      bindings: [{ imported: 'Settings', local: 'Cfg', kind: 'named' }],
    })
    expect(rust.importDetails[1]?.bindings).toEqual([
      { imported: 'HashMap', local: 'HashMap', kind: 'named' },
    ])
  })
})

describe('call owner and qualifier capture', () => {
  it('captures fromId of the enclosing symbol and receiver qualifier', async () => {
    const { symbols, calls } = await extractAll(
      'export function outer() {\n  ns.foo()\n  bar()\n}\n',
      'typescript',
      'src/a.ts',
    )
    const outer = symbols.find((s) => s.name === 'outer')!
    expect(calls.find((c) => c.name === 'foo')).toMatchObject({
      from: 'outer',
      fromId: outer.id,
      qualifier: 'ns',
    })
    expect(calls.find((c) => c.name === 'bar')).toMatchObject({
      from: 'outer',
      fromId: outer.id,
      qualifier: null,
    })
  })

  it('leaves a module-level call without an owner but keeps its qualifier', async () => {
    const { calls } = await extractAll('bootstrap()\nns.start()\n', 'typescript', 'src/a.ts')
    expect(calls.find((c) => c.name === 'bootstrap')).toMatchObject({
      from: '',
      fromId: null,
      qualifier: null,
    })
    expect(calls.find((c) => c.name === 'start')).toMatchObject({
      from: '',
      fromId: null,
      qualifier: 'ns',
    })
  })

  it('attributes a call inside an arrow assigned to a variable to that variable', async () => {
    const { symbols, calls } = await extractAll(
      'const handler = () => helper()\n',
      'typescript',
      'src/a.ts',
    )
    const handler = symbols.find((s) => s.name === 'handler')!
    expect(calls.find((c) => c.name === 'helper')).toMatchObject({
      from: 'handler',
      fromId: handler.id,
    })
  })
})
