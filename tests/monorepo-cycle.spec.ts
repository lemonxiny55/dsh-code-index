import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  buildChangeContext,
  buildImpactXray,
  buildIndex,
  buildIndexWithCache,
  buildReviewBrief,
  defaultCachePath,
  renderChangeContext,
  renderReviewBrief,
  tools,
} from '../src/index.js'
import { asImpactXray } from '../src/client/impact-xray.js'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })),
  )
})

async function makeRepo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-mono-cycle-'))
  dirs.push(root)
  await mkdir(path.join(root, '.git'), { recursive: true })
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, ...rel.split('/'))
    await mkdir(path.dirname(abs), { recursive: true })
    await writeFile(abs, content, 'utf8')
  }
  return root
}

describe('M2 P1b: cycle-warning scoped to changed files', () => {
  it('emits cycle-warning only for import cycles touching changed files (via aliases too) while ignoring unrelated cycles', async () => {
    const root = await makeRepo({
      'tsconfig.json': '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } } }',
      'src/changedA.ts': "import { bFn } from '@/changedB'\nexport function aFn() { return bFn() }\n",
      'src/changedB.ts': "import { aFn } from './changedA'\nexport function bFn() { return 1 }\n",
      // Unrelated legacy cycle that must not pollute the review output
      'src/legacy1.ts': "import { l2 } from './legacy2'\nexport function l1() { return l2() }\n",
      'src/legacy2.ts': "import { l1 } from './legacy1'\nexport function l2() { return 2 }\n",
      'src/clean.ts': 'export function cleanFn() { return 42 }\n',
    })

    const index = await buildIndex(root)

    const changeInCycle = await buildChangeContext(index, { kind: 'files', files: ['src/changedA.ts'] })
    const defaultText = renderChangeContext(changeInCycle)
    expect(defaultText).not.toContain('cycle-warning:')

    const reviewInCycle = await buildReviewBrief(index, changeInCycle, 5000)
    expect(reviewInCycle.brief.status).toBe('bounded')
    if (reviewInCycle.brief.status !== 'bounded') throw new Error('expected bounded')
    expect(reviewInCycle.brief.warnings.some((w) => w.startsWith('cycle-warning:'))).toBe(true)
    expect(reviewInCycle.brief.warnings.join('\n')).toContain('src/changedA.ts')
    expect(reviewInCycle.brief.warnings.join('\n')).toContain('src/changedB.ts')
    expect(reviewInCycle.brief.warnings.join('\n')).not.toContain('src/legacy1.ts')
    expect(reviewInCycle.brief.cycleWarnings).toEqual([
      {
        files: ['src/changedA.ts', 'src/changedB.ts'],
        changedFiles: ['src/changedA.ts'],
        totalFiles: 2,
        truncated: false,
      },
    ])

    // Changing clean.ts triggers zero cycle-warnings even though two cycles exist in the repo
    const cleanChange = await buildChangeContext(index, { kind: 'files', files: ['src/clean.ts'] })
    const cleanReview = await buildReviewBrief(index, cleanChange, 5000)
    expect(cleanReview.brief.status).toBe('bounded')
    if (cleanReview.brief.status !== 'bounded') throw new Error('expected bounded')
    expect(cleanReview.brief.cycleWarnings).toBeUndefined()
    expect(cleanReview.brief.warnings.some((w) => w.startsWith('cycle-warning:'))).toBe(false)
  })

  it('bounds large cycle paths to 5 files with truncated metadata', async () => {
    const files: Record<string, string> = {}
    const count = 7
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count
      files[`src/m${i}.ts`] = `import { fn${next} } from './m${next}'\nexport function fn${i}() { return fn${next}() }\n`
    }
    const root = await makeRepo(files)
    const index = await buildIndex(root)
    const change = await buildChangeContext(index, { kind: 'files', files: ['src/m0.ts'] })
    const review = await buildReviewBrief(index, change, 5000)
    expect(review.brief.status).toBe('bounded')
    if (review.brief.status !== 'bounded') throw new Error('expected bounded')
    expect(review.brief.cycleWarnings?.[0]).toMatchObject({
      totalFiles: 7,
      truncated: true,
      changedFiles: ['src/m0.ts'],
    })
    expect(review.brief.cycleWarnings?.[0]?.files).toHaveLength(5)
    expect(review.text).toContain('(+2 more)')
  })
})

describe('M2 P2: Monorepo Cross-package impact & budget regression', () => {
  it('detects pnpm-workspace packages and summarizes Cross-package impact in Review Brief & Impact X-Ray', async () => {
    const root = await makeRepo({
      'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n  - 'apps/*'\n",
      'pnpm-lock.yaml': 'lockfileVersion: 9.0\n',
      'package.json': JSON.stringify({ name: 'monorepo', private: true, devDependencies: { vitest: '^4.0.0' } }),
      'packages/core/package.json': JSON.stringify({ name: '@acme/core', exports: { '.': './src/index.ts' } }),
      'packages/core/src/index.ts': 'export function formatMoney(n: number) { return n.toFixed(2) }\n',
      'apps/desktop/package.json': JSON.stringify({ name: '@acme/desktop' }),
      'apps/desktop/src/screen.ts': [
        "import { formatMoney } from '@acme/core'",
        'export function renderPrice(x: number) { return formatMoney(x) }',
        'export function renderTax(x: number) { return formatMoney(x) }',
      ].join('\n'),
      'apps/desktop/tests/screen.spec.ts': [
        "import { renderPrice } from '../src/screen'",
        'export function testPrice() { return renderPrice(10) }',
      ].join('\n'),
    })

    const index = await buildIndex(root)
    expect(index.resolution?.workspacePackages?.map((p) => `${p.dirPrefix}:${p.name}:${p.source}`)).toEqual([
      'packages/core:@acme/core:pnpm-workspace',
      'apps/desktop:@acme/desktop:pnpm-workspace',
    ])

    const change = await buildChangeContext(index, { kind: 'files', files: ['packages/core/src/index.ts'] })
    const review = await buildReviewBrief(index, change, 5000)
    expect(review.brief.status).toBe('bounded')
    if (review.brief.status !== 'bounded') throw new Error('expected bounded')
    expect(review.brief.crossPackageImpact).toEqual([
      {
        fromDir: 'packages/core',
        fromPackage: '@acme/core',
        toDir: 'apps/desktop',
        toPackage: '@acme/desktop',
        callRefs: 3,
        importRefs: 1,
        refs: 4,
      },
    ])
    expect(review.text).toContain('Cross-package impact:')
    expect(review.text).toContain('packages/core [@acme/core] -> apps/desktop [@acme/desktop] (4 refs)')

    // Impact X-Ray integration & client runtime validation
    const xray = await buildImpactXray(index, change)
    expect(xray.crossPackageImpact).toEqual(review.brief.crossPackageImpact)
    expect(asImpactXray(JSON.parse(JSON.stringify(xray)))).toEqual(xray)

    const toolOut = await tools
      .find((t) => t.name === 'code_change_context')!
      .execute(
        { repoRoot: root, files: ['packages/core/src/index.ts'], outputFormat: 'xray' },
        {} as never,
      ) as { xray: unknown }
    expect(asImpactXray(toolOut.xray)).not.toBeNull()
  })

  it('parses package.json#workspaces, Cargo.toml, go.work, and HarmonyOS build-profile.json5 with mtime cache invalidation', async () => {
    const pkgRoot = await makeRepo({
      'package.json': JSON.stringify({ name: 'root', workspaces: { packages: ['libs/*', '!libs/ignored'] } }),
      'libs/alpha/package.json': JSON.stringify({ name: '@ws/alpha' }),
      'libs/alpha/index.ts': 'export function a() { return 1 }\n',
      'libs/ignored/package.json': JSON.stringify({ name: '@ws/ignored' }),
      'libs/ignored/index.ts': 'export function b() { return 2 }\n',
    })
    const pkgIdx = await buildIndex(pkgRoot)
    expect(pkgIdx.resolution?.workspacePackages).toEqual([
      { dirPrefix: 'libs/alpha', name: '@ws/alpha', source: 'package-workspaces' },
    ])

    const cargoRoot = await makeRepo({
      'Cargo.toml': '[workspace]\nmembers = [\n  "crates/*",\n]\nexclude = ["crates/scratch"]\n',
      'crates/engine/Cargo.toml': '[package]\nname = "my_engine"\nversion = "0.1.0"\n',
      'crates/engine/src/lib.rs': 'pub fn run_engine() {}\n',
      'crates/scratch/Cargo.toml': '[package]\nname = "scratch"\n',
      'crates/scratch/src/lib.rs': 'pub fn tmp() {}\n',
    })
    const cargoIdx = await buildIndex(cargoRoot)
    expect(cargoIdx.resolution?.workspacePackages).toEqual([
      { dirPrefix: 'crates/engine', name: 'my_engine', source: 'cargo-workspace' },
    ])

    const goRoot = await makeRepo({
      'go.work': 'go 1.23\nuse (\n  ./svc-a\n  ./svc-b\n)\n',
      'svc-a/go.mod': 'module example.com/svc-a\n',
      'svc-a/main.go': 'package main\nfunc StartA() {}\n',
      'svc-b/go.mod': 'module example.com/svc-b\n',
      'svc-b/main.go': 'package main\nfunc StartB() {}\n',
    })
    const goIdx = await buildIndex(goRoot)
    expect(goIdx.resolution?.workspacePackages).toEqual([
      { dirPrefix: 'svc-a', name: 'example.com/svc-a', source: 'go-work' },
      { dirPrefix: 'svc-b', name: 'example.com/svc-b', source: 'go-work' },
    ])

    // HarmonyOS build-profile.json5 + oh-package.json5 cross-package impact & mtime invalidation
    const arkRoot = await makeRepo({
      'build-profile.json5': `{
        app: { signingConfigs: [] },
        modules: [
          { name: 'entry', srcPath: './entry' },
          { name: 'common', srcPath: './features/common' },
        ],
      }`,
      'oh-package.json5': "{ name: 'hm-app', dependencies: { '@hm/common': 'file:./features/common' } }",
      'features/common/oh-package.json5': "{ name: '@hm/common', main: './Index.ets' }",
      'features/common/Index.ets': "export { formatTitle } from './src/main/ets/Title'\n",
      'features/common/src/main/ets/Title.ets': 'export function formatTitle(t: string) { return t.trim() }\n',
      'entry/src/main/ets/Home.ets': [
        "import { formatTitle } from '@hm/common'",
        '@Entry\n@Component\nstruct Home {',
        '  build() { Text(formatTitle("hi")) }',
        '}',
      ].join('\n'),
    })

    const cachePath = defaultCachePath(arkRoot)
    const arkIdx = await buildIndexWithCache(arkRoot)
    const arkChange = await buildChangeContext(arkIdx, {
      kind: 'files',
      files: ['features/common/src/main/ets/Title.ets'],
    })
    const arkReview = await buildReviewBrief(arkIdx, arkChange, 5000)
    expect(arkReview.text).toContain('Cross-package impact:')
    expect(arkReview.text).toContain('features/common [common] -> entry (2 refs)')

    // Unchanged cache is not rewritten
    const firstStat = await stat(cachePath)
    await new Promise((r) => setTimeout(r, 25))
    await buildIndexWithCache(arkRoot)
    expect((await stat(cachePath)).mtimeMs).toBe(firstStat.mtimeMs)

    // Editing build-profile.json5 invalidates cached workspace mapping
    await new Promise((r) => setTimeout(r, 25))
    await writeFile(
      path.join(arkRoot, 'build-profile.json5'),
      `{
        modules: [
          { name: 'entry-renamed', srcPath: './entry' },
          { name: 'common-core', srcPath: './features/common' },
        ],
      }`,
      'utf8',
    )
    const refreshedArk = await buildIndexWithCache(arkRoot)
    expect(refreshedArk.resolution?.workspacePackages?.map((p) => p.name)).toEqual([
      'common-core',
      'entry-renamed',
    ])
  })

  it('enforces strict 300/500/5000/20000 budgets & priority trimming on combined Monorepo + cycle + commandLead', async () => {
    const root = await makeRepo({
      'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n  - 'apps/*'\n",
      'pnpm-lock.yaml': 'lockfileVersion: 9.0\n',
      'package.json': JSON.stringify({ name: 'mono', devDependencies: { vitest: '^4.0.0' } }),
      'tsconfig.json': '{ "compilerOptions": { "baseUrl": ".", "paths": { "@core/*": ["packages/core/src/*"] } } }',
      'packages/core/package.json': JSON.stringify({ name: '@mono/core' }),
      'packages/core/src/a.ts': "import { helperB } from './b'\nexport function coreApi(x: number) { return helperB(x) + 1 }\n",
      'packages/core/src/b.ts': "import { coreApi } from './a'\nexport function helperB(x: number) { return x > 0 ? x : coreApi(1) }\n",
      'apps/web/package.json': JSON.stringify({ name: '@mono/web' }),
      'apps/web/src/page.ts': "import { coreApi } from '@core/a'\nexport function mountPage() { return coreApi(5) }\n",
      'apps/web/tests/page.spec.ts': "import { mountPage } from '../src/page'\nexport function spec() { return mountPage() }\n",
    })

    execFileSync('git', ['init', '-q'], { cwd: root })
    execFileSync('git', ['add', '.'], { cwd: root })
    execFileSync(
      'git',
      ['-c', 'user.name=Mono', '-c', 'user.email=mono@example.invalid', 'commit', '-qm', 'base'],
      { cwd: root },
    )
    await writeFile(
      path.join(root, 'packages/core/src/a.ts'),
      "import { helperB } from './b'\nexport function coreApi(x: number) { return helperB(x) + 10 }\n",
    )

    const index = await buildIndex(root)
    const change = await buildChangeContext(index, { kind: 'git', root, baseRef: 'HEAD' })

    for (const budget of [300, 500, 5000, 20000]) {
      const out = await buildReviewBrief(index, change, budget)
      expect(out.brief.budget.limit).toBe(budget)
      expect(out.brief.budget.usedChars).toBe(JSON.stringify(out).length)
      expect(out.brief.budget.usedChars).toBeLessThanOrEqual(budget)
      expect(renderReviewBrief(out.brief)).toBe(out.text)
      expect(out.text.length).toBeLessThanOrEqual(budget)
      expect(out.brief.verification).toBe('not-run')
      if (out.brief.status === 'bounded') {
        for (const row of out.brief.changes.filter((c) => c.code !== undefined && c.side === 'current')) {
          const lines = (await readFile(path.join(root, row.file), 'utf8')).split(/\r?\n/)
          expect(row.code).toBe(lines.slice(row.startLine - 1, row.endLine).join('\n'))
        }
      }
    }

    const full = await buildReviewBrief(index, change, 5000)
    expect(full.brief.status).toBe('bounded')
    if (full.brief.status !== 'bounded') throw new Error('expected bounded')
    expect(full.text).toContain('cycle-warning:')
    expect(full.text).toContain('Cross-package impact:')
    expect(full.text).toContain('— lead: pnpm vitest run apps/web/tests/page.spec.ts')
  })
})
