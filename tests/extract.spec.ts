import { beforeAll, describe, expect, it } from 'vitest'
import { extractSymbols, extractAll } from '../src/extract.js'
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

describe('extractAll — import specifiers', () => {
  it('extracts ES import and re-export specifiers (ts/js)', async () => {
    const { symbols, imports } = await extractAll(
      [
        "import { readFile } from 'node:fs/promises'",
        "import x from './util'",
        "export { y } from './core'",
        'const z = 3',
      ].join('\n'),
      'typescript',
    )
    expect(symbols.map((s) => s.name)).toEqual(['z'])
    expect(imports).toEqual(['node:fs/promises', './util', './core'])
  })

  it('normalises python imports: relatives to ./.., dotted to paths', async () => {
    const { imports } = await extractAll(
      ['from .utils import helper', 'from ..pkg.mod import Thing', 'from mypkg.core import T', 'import os.path'].join('\n'),
      'python',
    )
    expect(imports).toEqual(['./utils', '../pkg/mod', 'mypkg/core', 'os/path'])
  })

  it('extracts go/rust/java import specifiers', async () => {
    const go = await extractAll(
      'package m\n\nimport (\n\t"os"\n\t"example.com/foo/internal/util"\n)\n',
      'go',
    )
    expect(go.imports).toEqual(['os', 'example.com/foo/internal/util'])
    const rust = await extractAll(
      'use std::collections::HashMap;\nuse crate::engine::config::Settings;\nuse super::types::Mode;\nuse a::b::{c, d};\n',
      'rust',
    )
    expect(rust.imports).toEqual([
      'std/collections/HashMap',
      'engine/config/Settings',
      '../types/Mode',
      'a/b',
    ])
    const java = await extractAll('import java.util.List;\nimport com.example.core.Thing;\n', 'java')
    expect(java.imports).toEqual(['java/util/List', 'com/example/core/Thing'])
  })
})

describe('extractSymbols — go sample', () => {
  it('extracts funcs, methods, struct/interface types; uppercase = exported', async () => {
    const rows = await extractSymbols(
      [
        'package main',
        '',
        'type Server struct {',
        '\tPort int',
        '}',
        '',
        'type Reader interface {',
        '\tRead() error',
        '}',
        '',
        'type Handle func()',
        '',
        'func Connect(addr string) (*Server, error) {',
        '\treturn nil, nil',
        '}',
        '',
        'func (s *Server) Start() error {',
        '\treturn nil',
        '}',
        '',
        'func internal() {}',
      ].join('\n'),
      'go',
    )
    const byName = new Map(rows.map((r) => [r.name, r]))
    expect(byName.get('Server')).toMatchObject({ kind: 'class', exported: true })
    expect(byName.get('Reader')).toMatchObject({ kind: 'interface', exported: true })
    expect(byName.get('Handle')).toMatchObject({ kind: 'type', exported: true })
    expect(byName.get('Connect')).toMatchObject({ kind: 'function', exported: true })
    expect(byName.get('Start')).toMatchObject({ kind: 'method', exported: true })
    expect(byName.get('internal')).toMatchObject({ kind: 'function', exported: false })
    expect(byName.get('Connect')!.signature).toBe('Connect(addr string)')
    expect(byName.get('Start')!.signature).toBe('Start()')
  })
})

describe('extractSymbols — rust sample', () => {
  it('extracts fns, impl methods, struct/enum/trait; pub = exported', async () => {
    const rows = await extractSymbols(
      [
        'pub struct Config {',
        '    pub name: String,',
        '}',
        '',
        'pub enum Mode { Fast, Slow }',
        '',
        'pub trait Runner {',
        '    fn run(&self) -> u32;',
        '}',
        '',
        'pub fn load(path: &str) -> Config {',
        '    Config { name: path.into() }',
        '}',
        '',
        'impl Runner for Config {',
        '    fn run(&self) -> u32 { 0 }',
        '}',
        '',
        'fn helper() {}',
      ].join('\n'),
      'rust',
    )
    const byName = new Map(rows.map((r) => [r.name, r]))
    expect(byName.get('Config')).toMatchObject({ kind: 'class', exported: true })
    expect(byName.get('Mode')).toMatchObject({ kind: 'enum', exported: true })
    expect(byName.get('Runner')).toMatchObject({ kind: 'interface', exported: true })
    expect(byName.get('load')).toMatchObject({ kind: 'function', exported: true })
    // both the trait signature and the impl body classify as methods
    expect(rows.filter((r) => r.name === 'run').every((r) => r.kind === 'method')).toBe(true)
    expect(byName.get('helper')).toMatchObject({ kind: 'function', exported: false })
    expect(byName.get('load')!.signature).toBe('load(path: &str)')
  })
})

describe('extractSymbols — java sample', () => {
  it('extracts class/interface/enum/method/constructor; public = exported', async () => {
    const rows = await extractSymbols(
      [
        'package com.example;',
        '',
        'public class Server {',
        '    private int port;',
        '',
        '    public Server(int port) {',
        '        this.port = port;',
        '    }',
        '',
        '    public void start() {',
        '    }',
        '}',
        '',
        'interface Handler {',
        '    void handle(String req);',
        '}',
        '',
        'enum Mode { ON, OFF }',
      ].join('\n'),
      'java',
    )
    const byName = new Map(rows.map((r) => [r.name, r]))
    const serverClass = rows.find((r) => r.name === 'Server' && r.kind === 'class')
    const serverCtor = rows.find((r) => r.name === 'Server' && r.kind === 'method')
    expect(serverClass).toMatchObject({ exported: true })
    expect(serverCtor).toMatchObject({ exported: true })
    expect(serverCtor!.signature).toBe('Server(int port)')
    expect(byName.get('Handler')).toMatchObject({ kind: 'interface', exported: false })
    expect(byName.get('start')).toMatchObject({ kind: 'method', exported: true })
    // interface members are implicitly public
    expect(byName.get('handle')).toMatchObject({ kind: 'method', exported: true })
    expect(byName.get('Mode')).toMatchObject({ kind: 'enum', exported: false })
  })
})