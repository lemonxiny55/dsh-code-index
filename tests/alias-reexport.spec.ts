import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  buildChangeContext,
  buildIndex,
  buildIndexWithCache,
  buildReferenceGraph,
  buildReviewBrief,
  buildTaskContext,
  defaultCachePath,
  findCycles,
  loadIndex,
  MAX_REEXPORT_DEPTH,
  parseJsoncOrJson5,
  renderChangeContext,
  renderReviewBrief,
  REPO_INDEX_SCHEMA_VERSION,
  resolveImportDetailed,
  symbolRefs,
  tools,
} from '../src/index.js'
import { RepoContextManager } from '../src/repo-context.js'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })),
  )
})

async function makeRepo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-alias-m1-'))
  dirs.push(root)
  await mkdir(path.join(root, '.git'), { recursive: true })
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, ...rel.split('/'))
    await mkdir(path.dirname(abs), { recursive: true })
    await writeFile(abs, content, 'utf8')
  }
  return root
}

function allGraphEdges(index: Awaited<ReturnType<typeof buildIndex>>) {
  const graph = buildReferenceGraph(index)
  return {
    graph,
    edges: [...graph.outgoing.values()].flat().concat(graph.moduleLevelEdges),
  }
}

describe('M1: JSONC / JSON5 parser', () => {
  it('parses line/block comments, trailing commas, single quotes, unquoted keys, and preserves URL strings', () => {
    const raw = `// leading comment
    {
      /* block comment */
      url: 'https://example.com/a//b/*not-a-comment*/',
      "extends": "./tsconfig.base.json", // inline comment
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@/*": ["src/*",],
        },
      },
      arr: [1, 2, /* inner */],
    }`
    const parsed = parseJsoncOrJson5(raw) as Record<string, unknown>
    expect(parsed).toEqual({
      url: 'https://example.com/a//b/*not-a-comment*/',
      extends: './tsconfig.base.json',
      compilerOptions: {
        baseUrl: '.',
        paths: {
          '@/*': ['src/*'],
        },
      },
      arr: [1, 2],
    })
  })

  it('returns null on malformed JSONC/JSON5 without throwing', () => {
    expect(parseJsoncOrJson5('{ "broken": [1, 2')).toBeNull()
    expect(parseJsoncOrJson5('/* unterminated')).toBeNull()
  })
})

describe('M1: tsconfig/jsconfig & package.json alias resolution', () => {
  it('resolves JSONC tsconfig with extends, baseUrl, and paths to exact with deterministic via', async () => {
    const root = await makeRepo({
      'tsconfig.base.json': `{
        // Base config with comments and trailing commas
        "compilerOptions": {
          "baseUrl": ".",
          "paths": {
            "@base/*": ["src/shared/*",],
            "@/*": ["src/wrong/*"],
          },
        },
      }`,
      'tsconfig.json': `{
        /* Child overrides @/* while inheriting @base/* */
        "extends": "./tsconfig.base.json",
        "compilerOptions": {
          "paths": {
            "@/*": ["src/*",],
          },
        },
      }`,
      'src/shared/fmt.ts': 'export function formatName(v: string) { return v.trim() }\n',
      'src/core/calc.ts': 'export function addOne(n: number) { return n + 1 }\n',
      'src/app.ts': [
        "import { addOne } from '@/core/calc'",
        "import { formatName } from '@base/fmt'",
        "import { extFn } from 'third-party-lib'",
        'export function runApp(x: number) { return formatName(String(addOne(x))) + String(extFn()) }',
      ].join('\n'),
      'node_modules/third-party-lib/index.ts': 'export function extFn() { return 0 }\n',
    })

    const index = await buildIndex(root)
    expect(index.schemaVersion).toBe(REPO_INDEX_SCHEMA_VERSION)
    expect(index.resolution?.configFiles.map((c) => c.path)).toEqual([
      'tsconfig.base.json',
      'tsconfig.json',
    ])

    const { edges } = allGraphEdges(index)
    const addEdge = edges.find((e) => e.name === 'addOne')
    const fmtEdge = edges.find((e) => e.name === 'formatName')
    const extEdge = edges.find((e) => e.name === 'extFn')

    expect(addEdge).toMatchObject({
      resolution: 'exact',
      provenance: 'explicit-import-binding',
      via: 'tsconfig-path',
    })
    expect(fmtEdge).toMatchObject({
      resolution: 'exact',
      provenance: 'explicit-import-binding',
      via: 'tsconfig-path',
    })
    // node_modules is never indexed or resolved as a local target
    expect(extEdge).toBeUndefined()
    expect(findCycles(index)).toEqual([])
  })

  it('guards against circular extends and skips external extends packages', async () => {
    const root = await makeRepo({
      'tsconfig.a.json': '{ "extends": ["./tsconfig.b.json", "@tsconfig/node22/tsconfig.json"], "compilerOptions": { "baseUrl": "src" } }',
      'tsconfig.b.json': '{ "extends": "./tsconfig.a.json" }',
      'tsconfig.json': '{ "extends": "./tsconfig.a.json", "compilerOptions": { "paths": { "#/*": ["lib/*"] } } }',
      'src/lib/util.ts': 'export function ping() { return 1 }\n',
      'src/entry.ts': "import { ping } from '#/util'\nexport function go() { return ping() }\n",
    })

    const index = await buildIndex(root)
    const { edges } = allGraphEdges(index)
    expect(edges.find((e) => e.name === 'ping')).toMatchObject({
      resolution: 'exact',
      via: 'tsconfig-path',
    })
  })

  it('resolves jsconfig.json baseUrl and package.json local relative exports', async () => {
    const root = await makeRepo({
      'jsconfig.json': '{ "compilerOptions": { "baseUrl": "src" } }',
      'packages/shared/package.json': JSON.stringify({
        name: '@acme/shared',
        exports: {
          '.': { import: './src/index.ts', types: './dist/index.d.ts' },
          './math/*': './src/math/*.ts',
        },
      }),
      'packages/shared/src/index.ts': 'export function sharedEntry() { return 42 }\n',
      'packages/shared/src/math/sum.ts': 'export function sumTwo(a: number, b: number) { return a + b }\n',
      'src/helpers/str.js': 'export function trimIt(s) { return s.trim() }\n',
      'src/main.js': [
        "import { trimIt } from 'helpers/str'",
        "import { sharedEntry } from '@acme/shared'",
        "import { sumTwo } from '@acme/shared/math/sum'",
        'export function execMain() { return trimIt("a") + sharedEntry() + sumTwo(1, 2) }',
      ].join('\n'),
    })

    const index = await buildIndex(root)
    const { edges } = allGraphEdges(index)
    expect(edges.find((e) => e.name === 'trimIt')).toMatchObject({
      resolution: 'exact',
      via: 'tsconfig-baseurl',
    })
    expect(edges.find((e) => e.name === 'sharedEntry')).toMatchObject({
      resolution: 'exact',
      via: 'package-exports',
    })
    expect(edges.find((e) => e.name === 'sumTwo')).toMatchObject({
      resolution: 'exact',
      via: 'package-exports',
    })
  })

  it('downgrades wildcard multi-match aliases to import-scoped without guessing and emits ambiguous-alias gap', async () => {
    const root = await makeRepo({
      'tsconfig.json': `{
        "compilerOptions": {
          "baseUrl": ".",
          "paths": {
            "@/*": ["src/*", "fallback/*"]
          }
        }
      }`,
      'src/dup.ts': 'export function compute(x: number) { return x + 1 }\n',
      'fallback/dup.ts': 'export function other(x: number) { return x }\n',
      'src/consumer.ts': "import { compute } from '@/dup'\nexport function runConsumer() { return compute(1) }\n",
      'tests/consumer.spec.ts': "import { compute } from '@/dup'\nexport function testCompute() { return compute(2) }\n",
    })

    const index = await buildIndex(root)
    const fileSet = new Set(index.files.map((f) => f.path))
    const resolved = resolveImportDetailed('@/dup', 'src/consumer.ts', fileSet, index.resolution)
    expect(resolved).toMatchObject({
      target: null,
      ambiguous: true,
      targets: ['fallback/dup.ts', 'src/dup.ts'],
      via: 'tsconfig-path',
    })

    const { graph, edges } = allGraphEdges(index)
    const callEdge = edges.find((e) => e.name === 'compute' && e.callSite.file === 'src/consumer.ts')
    // Even though `compute` only exists in src/dup.ts, wildcard multi-file ambiguity forbids exact.
    expect(callEdge).toMatchObject({
      resolution: 'import-scoped',
      provenance: 'explicit-import-binding',
      via: 'tsconfig-path',
      ambiguousAlias: true,
    })
    expect(graph.ambiguousAliases).toEqual([
      {
        file: 'src/consumer.ts',
        specifier: '@/dup',
        candidates: ['fallback/dup.ts', 'src/dup.ts'],
        via: 'tsconfig-path',
      },
      {
        file: 'tests/consumer.spec.ts',
        specifier: '@/dup',
        candidates: ['fallback/dup.ts', 'src/dup.ts'],
        via: 'tsconfig-path',
      },
    ])

    const change = await buildChangeContext(index, { kind: 'files', files: ['src/dup.ts'] })
    expect(change.directCallers.some((c) => c.symbol.name === 'runConsumer' && c.resolution === 'import-scoped')).toBe(true)
    expect(change.evidence?.gaps).toContainEqual(
      expect.objectContaining({ kind: 'ambiguous', code: 'ambiguous-alias' }),
    )
    expect(renderChangeContext(change)).toContain('via: tsconfig-path')

    const review = await buildReviewBrief(index, change, 5000)
    expect(review.brief.status).toBe('bounded')
    expect(review.brief.gaps).toContain('ambiguous-alias')
    expect(review.text).toContain('via: tsconfig-path')
  })
})

describe('M1: Barrel re-export traversal, cycles, and depth bounds', () => {
  it('resolves named and wildcard re-export chains across code_refs, code_change_context, and Review Brief', async () => {
    const root = await makeRepo({
      'tsconfig.json': '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } } }',
      'src/core/math.ts': [
        'export function realAdd(a: number, b: number) { return a + b }',
        'export function starHelper(n: number) { return n * 2 }',
      ].join('\n'),
      'src/core/index.ts': [
        "export { realAdd as publicAdd } from './math'",
        "export * from './math'",
      ].join('\n'),
      'src/index.ts': [
        "export { publicAdd } from './core'",
        "export * from './core'",
      ].join('\n'),
      'src/app.ts': [
        "import { publicAdd, starHelper } from '@/index'",
        'export function mainFlow() { return publicAdd(1, 2) + starHelper(3) }',
      ].join('\n'),
      'tests/math.spec.ts': [
        "import { publicAdd } from '@/index'",
        'export function verifyMath() { return publicAdd(2, 3) }',
      ].join('\n'),
    })

    const index = await buildIndex(root)
    const { edges } = allGraphEdges(index)

    const addEdge = edges.find((e) => e.name === 'publicAdd' && e.callSite.file === 'src/app.ts')
    expect(addEdge).toMatchObject({
      resolution: 'exact',
      provenance: 'explicit-import-binding',
      via: 'tsconfig-path+reexport(2)',
    })

    const starEdge = edges.find((e) => e.name === 'starHelper' && e.callSite.file === 'src/app.ts')
    expect(starEdge).toMatchObject({
      resolution: 'import-scoped',
      provenance: 'explicit-import-binding',
      via: 'tsconfig-path+reexport(2)',
    })

    // code_refs (symbolRefs & tool execution)
    const refs = symbolRefs(index, 'realAdd')
    expect(refs.callers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: 'src/app.ts', from: 'mainFlow', via: 'tsconfig-path+reexport(2)' }),
        expect.objectContaining({ file: 'tests/math.spec.ts', from: 'verifyMath', via: 'tsconfig-path+reexport(2)' }),
      ]),
    )
    const refsOut = await tools
      .find((t) => t.name === 'code_refs')!
      .execute({ repoRoot: root, symbol: 'realAdd' }, {} as never) as string
    expect(refsOut).toContain('src/app.ts:2 in mainFlow [via: tsconfig-path+reexport(2)]')

    // code_change_context & Review Brief (including budget enforcement)
    const change = await buildChangeContext(index, { kind: 'files', files: ['src/core/math.ts'] })
    expect(change.directCallers.find((c) => c.symbol.name === 'mainFlow')).toMatchObject({
      resolution: 'exact',
      via: expect.objectContaining({ via: 'tsconfig-path+reexport(2)' }),
    })
    expect(change.importDependents.find((d) => d.file === 'src/app.ts')).toMatchObject({
      specifier: '@/index',
      resolution: 'import-scoped',
      via: 'tsconfig-path+reexport(2)',
    })
    expect(change.tests.find((t) => t.file === 'tests/math.spec.ts')).toMatchObject({
      resolution: 'import-scoped',
      reason: 'imports-changed-file',
    })

    for (const budget of [300, 500, 5000]) {
      const review = await buildReviewBrief(index, change, budget)
      expect(JSON.stringify(review).length).toBeLessThanOrEqual(budget)
      expect(renderReviewBrief(review.brief).length).toBeLessThanOrEqual(budget)
      expect(review.text).toBe(renderReviewBrief(review.brief))
      expect(review.brief.budget.usedChars).toBe(JSON.stringify(review).length)
      if (budget === 5000) {
        expect(review.text).toContain('via: tsconfig-path+reexport(2)')
      }
    }
  })

  it('terminates on cyclic re-exports and enforces maxReexportDepth = 3', async () => {
    expect(MAX_REEXPORT_DEPTH).toBe(3)
    const root = await makeRepo({
      // Cycle between cycA and cycB
      'src/cycA.ts': "export { ghost } from './cycB'\nexport * from './cycB'\n",
      'src/cycB.ts': "export { ghost } from './cycA'\nexport * from './cycA'\n",
      'src/useCycle.ts': "import { ghost } from './cycA'\nexport function runCycle() { return ghost() }\n",
      // 4-hop barrel chain: depth 3 succeeds, depth 4 stops
      'src/leaf.ts': 'export function deepLeaf() { return 99 }\nexport function exactAtThree() { return 3 }\n',
      'src/b1.ts': "export { deepLeaf, exactAtThree } from './leaf'\n",
      'src/b2.ts': "export { deepLeaf, exactAtThree } from './b1'\n",
      'src/b3.ts': "export { deepLeaf, exactAtThree } from './b2'\n",
      'src/b4.ts': "export { deepLeaf } from './b3'\n",
      'src/useDepth3.ts': "import { exactAtThree } from './b3'\nexport function call3() { return exactAtThree() }\n",
      'src/useDepth4.ts': "import { deepLeaf } from './b4'\nexport function call4() { return deepLeaf() }\n",
    })

    const index = await buildIndex(root)
    const { edges } = allGraphEdges(index)

    // Cycle does not hang and yields no fake edges
    expect(edges.some((e) => e.callSite.file === 'src/useCycle.ts')).toBe(false)

    // Depth 3 succeeds as exact with reexport(3)
    expect(edges.find((e) => e.callSite.file === 'src/useDepth3.ts' && e.name === 'exactAtThree')).toMatchObject({
      resolution: 'exact',
      provenance: 'explicit-import-binding',
      via: 'reexport(3)',
    })

    // Depth 4 is truncated at maxReexportDepth = 3 (never reaches leaf via Tier 2 exact)
    const depth4Edge = edges.find((e) => e.callSite.file === 'src/useDepth4.ts' && e.name === 'deepLeaf')
    expect(depth4Edge?.resolution).not.toBe('exact')
    expect(depth4Edge?.provenance).toBe('global-name')
    expect(depth4Edge?.resolution).toBe('name-only')
  })
})

describe('M1: HarmonyOS ArkTS oh-package.json5 resolution', () => {
  it('resolves local oh-package.json5 dependencies and Index.ets barrels while blocking SDK namespaces', async () => {
    const root = await makeRepo({
      'oh-package.json5': `{
        // HarmonyOS root package
        name: 'my-app',
        dependencies: {
          '@app/common': 'file:./packages/common',
          '@third/ui': '^2.1.0',
        },
      }`,
      'packages/common/oh-package.json5': `{
        name: '@app/common',
        main: './Index.ets',
      }`,
      'packages/common/Index.ets': "export { PrimaryButton } from './src/main/ets/Button'\n",
      'packages/common/src/main/ets/Button.ets': [
        '@Component',
        'export struct PrimaryButton {',
        '  build() { Text("OK") }',
        '}',
      ].join('\n'),
      'entry/src/main/ets/pages/Home.ets': [
        "import router from '@ohos.router'",
        "import { PrimaryButton } from '@app/common'",
        '@Entry',
        '@Component',
        'struct Home {',
        '  build() {',
        '    Column() {',
        '      PrimaryButton()',
        '    }',
        '  }',
        '}',
      ].join('\n'),
      '@ohos.router.ts': 'export default function fakeRouter() {}\n',
    })

    const index = await buildIndex(root)
    const { edges } = allGraphEdges(index)
    const btnEdge = edges.find((e) => e.name === 'PrimaryButton')
    expect(btnEdge).toMatchObject({
      resolution: 'exact',
      provenance: 'explicit-import-binding',
      via: 'oh-package+reexport(1)',
    })
    expect(edges.some((e) => e.callSite.file === 'entry/src/main/ets/pages/Home.ets' && e.targetId.includes('fakeRouter'))).toBe(false)

    const pack = await buildTaskContext(index, 'Explain PrimaryButton usage in Home.ets', { budgetChars: 5000 })
    expect(pack.relationships.some((r) => r.resolution === 'exact')).toBe(true)

    // Hot invalidation when oh-package.json5 changes target module
    await mkdir(path.join(root, 'packages/common2'), { recursive: true })
    await writeFile(
      path.join(root, 'packages/common2/oh-package.json5'),
      '{ name: "@app/common2", main: "./Index.ets" }',
      'utf8',
    )
    await writeFile(
      path.join(root, 'packages/common2/Index.ets'),
      "export { PrimaryButton } from './Button2'\n",
      'utf8',
    )
    await writeFile(
      path.join(root, 'packages/common2/Button2.ets'),
      '@Component\nexport struct PrimaryButton {\n  build() { Text("V2") }\n}\n',
      'utf8',
    )
    await buildIndexWithCache(root)
    await new Promise((r) => setTimeout(r, 25))
    await writeFile(
      path.join(root, 'oh-package.json5'),
      `{ name: 'my-app', dependencies: { '@app/common': 'file:./packages/common2' } }`,
      'utf8',
    )
    const updatedIndex = await buildIndexWithCache(root)
    const updatedBtn = allGraphEdges(updatedIndex).edges.find((e) => e.name === 'PrimaryButton')
    expect(updatedBtn?.targetId).toContain('packages%2Fcommon2%2FButton2.ets')
  })
})

describe('M1: Cache Schema v5, no source persistence, and config hot invalidation', () => {
  it('rebuilds legacy schema v4 cache to v5, persists no source text, and invalidates when configs change', async () => {
    const root = await makeRepo({
      'tsconfig.base.json': '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/v1/*"] } } }',
      'tsconfig.json': '{ "extends": "./tsconfig.base.json" }',
      'src/v1/mod.ts': 'export function targetFn() { const SECRET_SOURCE_BODY = "DO_NOT_PERSIST"; return SECRET_SOURCE_BODY }\n',
      'src/v2/mod.ts': 'export function targetFn() { return "v2" }\n',
      'src/use.ts': "import { targetFn } from '@/mod'\nexport function caller() { return targetFn() }\n",
    })

    const cachePath = defaultCachePath(root)
    await mkdir(path.dirname(cachePath), { recursive: true })
    await writeFile(
      cachePath,
      JSON.stringify({ schemaVersion: 4, root, generatedAt: 1, excludedDirs: [], files: [] }),
      'utf8',
    )
    expect(await loadIndex(cachePath)).toBeNull()

    const built = await buildIndexWithCache(root)
    expect(built.schemaVersion).toBe(REPO_INDEX_SCHEMA_VERSION)
    expect(built.schemaVersion).toBe(5)

    // Verify no source bodies are persisted in cache JSON
    const rawCache = await readFile(cachePath, 'utf8')
    expect(rawCache).not.toContain('SECRET_SOURCE_BODY')
    expect(rawCache).not.toContain('DO_NOT_PERSIST')

    const { edges: edgesV1 } = allGraphEdges(built)
    expect(edgesV1.find((e) => e.name === 'targetFn')?.targetId).toContain('src%2Fv1%2Fmod.ts')

    // Unchanged run does not rewrite the cache file
    const firstStat = await stat(cachePath)
    await new Promise((r) => setTimeout(r, 25))
    await buildIndexWithCache(root)
    const secondStat = await stat(cachePath)
    expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs)

    // Modifying extended tsconfig.base.json invalidates resolution config on next build
    await new Promise((r) => setTimeout(r, 25))
    await writeFile(
      path.join(root, 'tsconfig.base.json'),
      '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/v2/*"] } } }',
      'utf8',
    )
    const refreshed = await buildIndexWithCache(root)
    const { edges: edgesV2 } = allGraphEdges(refreshed)
    expect(edgesV2.find((e) => e.name === 'targetFn')?.targetId).toContain('src%2Fv2%2Fmod.ts')
  })

  it('triggers live watcher refresh when tsconfig.json changes in RepoContextManager', async () => {
    const root = await makeRepo({
      'tsconfig.json': '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/a/*"] } } }',
      'src/a/target.ts': 'export function target() { return "a" }\n',
      'src/b/target.ts': 'export function target() { return "b" }\n',
      'src/main.ts': "import { target } from '@/target'\nexport function run() { return target() }\n",
    })

    const manager = new RepoContextManager({ indexOptions: () => ({}), debounceMs: 40 })
    try {
      const initial = await manager.get(root)
      expect(allGraphEdges(initial).edges.find((e) => e.name === 'target')?.targetId).toContain('src%2Fa%2Ftarget.ts')

      const watcher = manager.getContext(root)!.watcher!
      if (!(watcher as unknown as { _readyEmitted?: boolean })._readyEmitted) {
        await new Promise<void>((resolve) => watcher.once('ready', resolve))
      }

      await writeFile(
        path.join(root, 'tsconfig.json'),
        '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/b/*"] } } }',
        'utf8',
      )

      await vi.waitFor(
        () => {
          const current = manager.getContext(root)?.index
          const targetId = current
            ? allGraphEdges(current).edges.find((e) => e.name === 'target')?.targetId
            : undefined
          expect(targetId).toContain('src%2Fb%2Ftarget.ts')
        },
        { timeout: 5_000 },
      )
    } finally {
      await manager.dispose()
    }
  })
})
