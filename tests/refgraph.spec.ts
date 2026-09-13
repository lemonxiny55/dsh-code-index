import { describe, expect, it } from 'vitest'
import { extractAll } from '../src/extract.js'
import { buildSymbolTable, callerCounts, symbolRefs } from '../src/refgraph.js'
import type { CallInfo, IndexedFile, RepoIndex, SymbolInfo } from '../src/types.js'

function sym(name: string, kind: SymbolInfo['kind'], line: number): SymbolInfo {
  return { name, kind, file: '', line, endLine: line, exported: true, signature: `${name}()` }
}

function file(path: string, symbols: SymbolInfo[], calls: CallInfo[], imports: string[] = []): IndexedFile {
  return {
    path,
    lang: 'typescript',
    mtimeMs: 1,
    symbols: symbols.map((s) => ({ ...s, file: path })),
    calls,
    imports,
  }
}

function index(files: IndexedFile[]): RepoIndex {
  return { root: '/tmp/repo', generatedAt: 0, excludedDirs: [], files }
}

describe('extractAll — call sites', () => {
  it('captures callee and enclosing function (typescript)', async () => {
    const { calls } = await extractAll(
      [
        "import { g } from './g'",
        'export function outer() {',
        '  g()',
        '  helper()',
        '  obj.method()',
        '  const c = new Widget()',
        '}',
        'function helper() {}',
      ].join('\n'),
      'typescript',
    )
    const fromOuter = calls.filter((c) => c.from === 'outer').map((c) => c.name)
    expect(fromOuter).toContain('g')
    expect(fromOuter).toContain('helper')
    expect(fromOuter).toContain('method')
    expect(fromOuter).toContain('Widget')
    expect(calls.every((c) => c.from !== 'helper')).toBe(true)
  })

  it('attributes a module-level call to the empty scope', async () => {
    const { calls } = await extractAll('bootstrap()\n', 'typescript')
    expect(calls).toEqual([{ name: 'bootstrap', line: 1, from: '' }])
  })

  it('captures calls across python, go, rust, java and c', async () => {
    const py = await extractAll('def run():\n    helper()\n    obj.method()\n', 'python')
    expect(py.calls.map((c) => `${c.from}:${c.name}`)).toEqual(['run:helper', 'run:method'])

    const go = await extractAll('package m\n\nfunc Run() {\n\thelper()\n\tw.Field()\n}\n', 'go')
    expect(go.calls.map((c) => `${c.from}:${c.name}`)).toEqual(['Run:helper', 'Run:Field'])

    const rs = await extractAll('fn run() {\n    helper();\n    obj.method();\n}\n', 'rust')
    expect(rs.calls.map((c) => `${c.from}:${c.name}`)).toEqual(['run:helper', 'run:method'])

    const java = await extractAll(
      'class A {\n  void run() {\n    helper();\n    new Thing();\n  }\n}\n',
      'java',
    )
    expect(java.calls.map((c) => `${c.from}:${c.name}`)).toEqual(['run:helper', 'run:Thing'])

    const c = await extractAll('int main(void) {\n  helper();\n  return 0;\n}\n', 'c')
    expect(c.calls.map((x) => `${x.from}:${x.name}`)).toEqual(['main:helper'])
  })
})

describe('symbolRefs', () => {
  const repo = index([
    file(
      'src/core.ts',
      [sym('helper', 'function', 1), sym('main', 'function', 5)],
      [{ name: 'helper', line: 6, from: 'main' }],
    ),
    file(
      'src/use.ts',
      [sym('run', 'function', 1)],
      [
        { name: 'main', line: 2, from: 'run' },
        { name: 'helper', line: 3, from: 'run' },
      ],
      ['./core'],
    ),
  ])

  it('finds callers across files, sorted', () => {
    const refs = symbolRefs(repo, 'helper')
    expect(refs.callers).toEqual([
      { file: 'src/core.ts', line: 6, from: 'main' },
      { file: 'src/use.ts', line: 3, from: 'run' },
    ])
  })

  it('resolves callees to in-repo definitions', () => {
    const refs = symbolRefs(repo, 'main')
    const helper = refs.callees.find((c) => c.name === 'helper')
    expect(helper?.targets.map((t) => `${t.file}:${t.line}`)).toEqual(['src/core.ts:1'])
  })

  it('reports definitions and empty sides honestly', () => {
    const refs = symbolRefs(repo, 'main')
    expect(refs.defs.map((d) => d.file)).toEqual(['src/core.ts'])
    const unknown = symbolRefs(repo, 'nope')
    expect(unknown.defs).toEqual([])
    expect(unknown.callers).toEqual([])
    expect(unknown.callees).toEqual([])
  })

  it('builds a symbol table and counts call fan-in', () => {
    expect(buildSymbolTable(repo).get('helper')).toHaveLength(1)
    const counts = callerCounts(repo)
    expect(counts.get('helper')).toBe(2)
    expect(counts.get('main')).toBe(1)
  })
})
