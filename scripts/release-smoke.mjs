import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const npm = 'npm'

function shellQuote(value) {
  return /[\s"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value
}

function run(command, args, cwd) {
  const invocation = [command, ...args].map(shellQuote).join(' ')
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', invocation]
    : args
  const executable = process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : command
  const executableArgs = process.platform === 'win32' ? commandArgs : args
  return execFileSync(executable, executableArgs, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
}

function parseJsonArrayOutput(output, command) {
  const text = output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== '[') continue
    let depth = 0
    let inString = false
    let escaped = false
    for (let index = start; index < text.length; index += 1) {
      const char = text[index]
      if (inString) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') inString = false
        continue
      }
      if (char === '"') {
        inString = true
        continue
      }
      if (char === '[') depth += 1
      else if (char === ']') {
        depth -= 1
        if (depth === 0) {
          try {
            const parsed = JSON.parse(text.slice(start, index + 1))
            if (Array.isArray(parsed)) return parsed
          } catch {
            break
          }
        }
      }
    }
  }
  throw new Error(`${command} did not return a JSON array`)
}

// A release gate can reuse one immutable candidate across Node versions.
const suppliedTarball = process.argv[2] ? path.resolve(process.argv[2]) : null
// Exercise each supported host group against the same immutable candidate.
const toolsVersion = process.argv[3] ?? '0.2.1-rc.3'
const supportedToolsVersions = packageJson.peerDependencies['@deepseek-ai/dsh-tools'].split(' || ')
assert.ok(supportedToolsVersions.includes(toolsVersion), 'smoke requires an explicitly supported DSH tools version')
const packed = suppliedTarball ? null : parseJsonArrayOutput(run(npm, ['pack', '--ignore-scripts', '--json'], root), 'npm pack')
if (packed) assert.equal(packed.length, 1, 'npm pack must produce exactly one artifact')
const tarball = suppliedTarball ?? path.resolve(root, packed[0].filename)
const listed = suppliedTarball
  ? new Set(run('tar', ['-tzf', tarball], root).trim().split(/\r?\n/).map(file => file.replace(/^package\//, '')))
  : new Set(packed[0].files.map((file) => file.path))
const expectedFiles = [
  'package.json',
  'README.md',
  'README.zh.md',
  'CHANGELOG.md',
  'LICENSE',
  'cordis.patch.yml',
  'dist/index.js',
  'dist/index.d.ts',
  'dist/client.js',
  'grammars/tree-sitter-arkts.wasm',
  'grammars/ARKTS-LICENSE',
  'grammars/README.md',
  'scripts/fix-wsl-links.mjs',
  'scripts/release-smoke.mjs',
]
for (const file of expectedFiles) assert.ok(listed.has(file), `tarball is missing ${file}`)

const smokeDir = mkdtempSync(path.join(os.tmpdir(), 'dsh-code-index-release-'))
try {
  run(npm, ['init', '--yes'], smokeDir)
  run(npm, ['install', '--ignore-scripts', '--no-save', tarball, `@deepseek-ai/dsh-tools@${toolsVersion}`], smokeDir)

  const installedPackage = JSON.parse(
    readFileSync(path.join(smokeDir, 'node_modules', packageJson.name, 'package.json'), 'utf8'),
  )
  assert.equal(installedPackage.version, packageJson.version)
  assert.equal(installedPackage.main, './dist/index.js')
  assert.equal(installedPackage.exports['.'].default, './dist/index.js')
  assert.match(installedPackage.engines.node, />=22/)
  assert.equal(installedPackage.license, 'MIT')
  const installedTools = JSON.parse(readFileSync(path.join(smokeDir, 'node_modules', '@deepseek-ai', 'dsh-tools', 'package.json'), 'utf8'))
  assert.equal(installedTools.version, toolsVersion, 'consumer must use the selected matching RC group')

  const plugin = await import(
    pathToFileURL(path.join(smokeDir, 'node_modules', packageJson.name, 'dist', 'index.js')).href,
  )
  const registered = []
  const disposers = []
  const ctx = {
    effect(effect) {
      const disposer = effect()
      if (typeof disposer === 'function') disposers.push(disposer)
    },
    tools: {
      register(tool) {
        registered.push(tool.name)
        return () => {}
      },
    },
    systemPrompt: { section: () => () => {} },
  }
  plugin.apply(ctx, { autoInject: false, codeHealth: true })
  assert.deepEqual(registered, [
    'code_index',
    'code_symbols',
    'code_search',
    'code_map',
    'code_refs',
    'code_change_context',
    'code_context',
    'code_health',
  ])

  const exec = { agent: { session: { header: { cwd: root } } } }
  const tools = new Map(plugin.tools.map((tool) => [tool.name, tool]))
  const invoke = (name, args) => tools.get(name).execute(args, exec)
  const status = await invoke('code_index', { action: 'build', repoRoot: root })
  assert.match(status, /files indexed:/)
  assert.ok(Array.isArray(await invoke('code_symbols', { limit: 2, repoRoot: root })))
  assert.ok(Array.isArray(await invoke('code_search', { query: 'buildIndex', repoRoot: root })))
  assert.match(await invoke('code_map', { repoRoot: root }), /repo map|no indexable symbols/)
  assert.match(await invoke('code_refs', { symbol: 'buildIndex', repoRoot: root }), /definitions:|no definition/)
  assert.match(
    await invoke('code_change_context', { files: ['src/index.ts'], repoRoot: root }),
    /CHANGED:/,
  )
  assert.match(
    await invoke('code_context', {
      task: 'How does plugin loading work?',
      repoRoot: root,
      budgetChars: 5_000,
    }),
    /Task context|Primary symbols:/,
  )
  const contextPack = await invoke('code_context', {
    task: 'Explain buildIndex', repoRoot: root, budgetChars: 5000, outputFormat: 'pack',
  })
  assert.equal(contextPack.version, 1)
  assert.ok(contextPack.items.some(item => item.kind === 'primary' && item.name === 'buildIndex'))
  assert.ok(contextPack.items.some(item => item.code !== undefined))
  assert.ok(JSON.stringify(contextPack).length <= 5000)
  assert.match(await invoke('code_health', { repoRoot: root }), /repo health/)

  // Issue #2 must also be fixed in the installed tarball, not just TS sources.
  const whitelistRoot = path.join(smokeDir, 'whitelist-repo')
  for (const dir of ['.git', 'src', 'extensions/keep', 'extensions/other']) {
    mkdirSync(path.join(whitelistRoot, dir), { recursive: true })
  }
  writeFileSync(path.join(whitelistRoot, '.gitignore'), '/extensions/*\n!/extensions/keep/\n!/extensions/keep/**\n')
  writeFileSync(path.join(whitelistRoot, 'src/control.ts'), 'export function CONTROL_MARKER_fn() { return 3 }\n')
  writeFileSync(path.join(whitelistRoot, 'extensions/keep/kept.ts'), 'export function KEPT_MARKER_fn() { return 1 }\n')
  writeFileSync(path.join(whitelistRoot, 'extensions/other/skip.ts'), 'export function SKIPPED_fn() { return 2 }\n')
  assert.match(await invoke('code_index', { action: 'build', repoRoot: whitelistRoot }), /files indexed: 2/)
  const keptHits = await invoke('code_search', { query: 'KEPT_MARKER_fn', repoRoot: whitelistRoot })
  assert.equal(keptHits[0]?.file, 'extensions/keep/kept.ts')
  assert.deepEqual(await invoke('code_search', { query: 'SKIPPED_fn', repoRoot: whitelistRoot }), [])
  const keptPack = await invoke('code_context', {
    task: 'Explain KEPT_MARKER_fn', repoRoot: whitelistRoot, outputFormat: 'pack',
  })
  assert.ok(keptPack.items.some(item => item.name === 'KEPT_MARKER_fn' && item.code?.includes('return 1')))
  const freshSource = path.join(whitelistRoot, 'extensions/keep/fresh.ts')
  writeFileSync(freshSource, 'export function FRESH_MARKER_fn() { return 91 }\n')
  assert.equal((await invoke('code_search', { query: 'FRESH_MARKER_fn', repoRoot: whitelistRoot }))[0]?.name, 'FRESH_MARKER_fn')
  rmSync(freshSource)
  assert.deepEqual(await invoke('code_search', { query: 'FRESH_MARKER_fn', repoRoot: whitelistRoot }), [])

  // ArkTS must work from the actual installed package, without native grammar
  // bindings or the source checkout. Keep the fixture tiny and mixed ETS/TS.
  const arkRoot = path.join(smokeDir, 'arkts-repo')
  mkdirSync(path.join(arkRoot, '.git'), { recursive: true })
  writeFileSync(path.join(arkRoot, 'logic.ts'), 'export function label() { return "package ArkTS" }\n')
  const card = '@ComponentV2\nexport struct PackageCard {\n  @Local count: number = 0;\n  build() { Column() { Text(label()) } }\n}\n'
  writeFileSync(path.join(arkRoot, 'Card.ets'), "import { label } from './logic'\n" + card)
  const arkIndex = await plugin.buildIndex(arkRoot)
  assert.equal(arkIndex.files.length, 2)
  assert.ok(arkIndex.files.every(file => file.diagnostic.status === 'parsed'))
  assert.equal(arkIndex.files.find(file => file.path === 'Card.ets').lang, 'arkts')
  assert.equal((await invoke('code_search', { query: 'PackageCard', repoRoot: arkRoot }))[0]?.file, 'Card.ets')
  const arkPack = await invoke('code_context', { task: 'Explain PackageCard in Card.ets', repoRoot: arkRoot, outputFormat: 'pack', budgetChars: 5000 })
  assert.ok(arkPack.items.some(item => item.name === 'PackageCard' && item.code?.includes('@ComponentV2')))
  assert.ok(JSON.stringify(arkPack).length <= 5000)
  assert.ok(arkPack.items.some(item => item.name === 'label' && item.provenance === 'explicit-import-binding'))
  const arkFresh = path.join(arkRoot, 'Fresh.ets')
  writeFileSync(arkFresh, 'export function ARK_PACKAGE_ADDED() {}\n')
  assert.equal((await invoke('code_search', { query: 'ARK_PACKAGE_ADDED', repoRoot: arkRoot }))[0]?.name, 'ARK_PACKAGE_ADDED')
  writeFileSync(arkFresh, 'export function ARK_PACKAGE_EDITED() {}\n')
  assert.equal((await invoke('code_search', { query: 'ARK_PACKAGE_EDITED', repoRoot: arkRoot }))[0]?.name, 'ARK_PACKAGE_EDITED')
  rmSync(arkFresh)
  assert.deepEqual(await invoke('code_search', { query: 'ARK_PACKAGE_EDITED', repoRoot: arkRoot }), [])
  writeFileSync(path.join(arkRoot, 'Broken.ets'), '@Component\nstruct Broken { build() {')
  assert.match(await invoke('code_index', { repoRoot: arkRoot }), /index incomplete:/)

  // Issue #5: exercise actual installed Rust signatures, not source imports.
  const rustRoot = path.join(smokeDir, 'rust-repo')
  mkdirSync(path.join(rustRoot, '.git'), { recursive: true })
  writeFileSync(path.join(rustRoot, 'repro.rs'), [
    'pub struct PublicOne { pub field: u32 }',
    'struct PrivateOne { field: u32 }',
    'pub enum PublicEnum { A }',
    'enum PrivateEnum { A }',
    'pub trait PublicTrait { fn run(&self); }',
    'trait PrivateTrait { fn run(&self); }',
    'pub fn public_function(a: u32) -> u32 { a }',
    'fn private_function(a: u32) -> u32 { a }',
    'pub(crate) struct CrateOnly;',
    'pub(in crate) enum Restricted { A }',
    'fn caller() { let value = PublicOne { field: public_function(1) }; }',
  ].join('\n'))

  for (const dispose of disposers.reverse()) dispose()

  const compactRegistered = []
  const compactDisposers = []
  plugin.apply(
    {
      effect(effect) {
        const disposer = effect()
        if (typeof disposer === 'function') compactDisposers.push(disposer)
      },
      tools: {
        register(tool) {
          compactRegistered.push(tool.name)
          return () => {}
        },
      },
      systemPrompt: { section: () => () => {} },
    },
    { autoInject: false, codeHealth: true, toolSurface: 'compact' },
  )
  assert.deepEqual(compactRegistered, ['code_index', 'code_context', 'code_health'])
  for (const dispose of compactDisposers.reverse()) dispose()

  // Direct handlers above verify package behavior; this separate check runs
  // through the selected RC's real schema/dispatch/rendering pipeline.
  const consumerRequire = createRequire(path.join(smokeDir, 'package.json'))
  const { Context } = await import(pathToFileURL(consumerRequire.resolve('@deepseek-ai/cordis')).href)
  const { default: ToolRuntime } = await import(pathToFileURL(consumerRequire.resolve('@deepseek-ai/dsh-tools')).href)
  const nativeContext = new Context()
  nativeContext.provide('systemPrompt', { tools: () => () => {}, section: () => () => {} })
  const runtime = new ToolRuntime(nativeContext)
  const nativeDisposers = plugin.tools.map(tool => runtime.register(tool))
  try {
    const nativeInvoke = async (name, args) => {
      const result = await runtime.execute({
        callId: `release:${name}`, name, arguments: args,
        signal: new AbortController().signal,
      })
      assert.equal(result.isError, false, JSON.stringify(result.content))
      return result
    }
    await nativeInvoke('code_index', { action: 'build', repoRoot: arkRoot })
    const search = await nativeInvoke('code_search', { query: 'PackageCard', repoRoot: arkRoot })
    assert.equal(search.value[0]?.file, 'Card.ets')
    assert.ok(search.meta, 'search presentation metadata must survive runtime dispatch')
    for (const outputFormat of ['text', 'pack']) {
      const result = await nativeInvoke('code_context', {
        task: 'Explain PackageCard in Card.ets', repoRoot: arkRoot, outputFormat, budgetChars: 5000,
      })
      assert.match(JSON.stringify(result.content), /@ComponentV2/)
      assert.equal(typeof result.value, outputFormat === 'pack' ? 'object' : 'string')
      if (outputFormat === 'pack') assert.ok(JSON.stringify(result.value).length <= 5000)
    }
    await nativeInvoke('code_index', { action: 'build', repoRoot: rustRoot })
    const rustSymbols = await nativeInvoke('code_symbols', { repoRoot: rustRoot })
    assert.ok(rustSymbols.value.some(symbol => symbol.name === 'CrateOnly' && symbol.signature === 'CrateOnly' && !symbol.exported))
    assert.ok(rustSymbols.value.some(symbol => symbol.name === 'Restricted' && symbol.signature === 'Restricted' && !symbol.exported))
    const rustMap = await nativeInvoke('code_map', { repoRoot: rustRoot })
    const health = await nativeInvoke('code_health', { repoRoot: rustRoot })
    assert.match(health.value, /repo health/)
    for (const name of ['PublicOne', 'PublicEnum', 'PublicTrait']) {
      const search = await nativeInvoke('code_search', { query: name, repoRoot: rustRoot })
      assert.equal(search.value[0]?.name, name)
      assert.equal(search.value[0]?.signature, name)
      assert.match(JSON.stringify(search.content), new RegExp(name))
      assert.match(rustMap.value, new RegExp(name))
      const refs = await nativeInvoke('code_refs', { symbol: name, repoRoot: rustRoot })
      assert.match(refs.value, new RegExp(`${name} — repro.rs:`))
      assert.match(refs.value, /callers \(0\)/) // no invented struct-literal/type-use edges
    }
    const rustFunction = await nativeInvoke('code_refs', { symbol: 'public_function', repoRoot: rustRoot })
    assert.match(rustFunction.value, /callers \(1\)/)
    const xrayRoot = path.join(smokeDir, 'xray-demo')
    execFileSync(process.execPath, [path.join(smokeDir, 'node_modules', packageJson.name, 'scripts/impact-xray-demo.mjs'), xrayRoot], { encoding: 'utf8' })
    const legacyChange = await nativeInvoke('code_change_context', { repoRoot: xrayRoot })
    const xray = await nativeInvoke('code_change_context', { repoRoot: xrayRoot, outputFormat: 'xray' })
    assert.equal(typeof legacyChange.value, 'string')
    assert.deepEqual(xray.content, legacyChange.content)
    assert.equal(xray.meta.card, 'impact-xray'); assert.equal(xray.meta.version, 2)
    assert.equal(xray.meta.edges.filter(e => e.kind === 'call').length, 6)
    assert.equal(xray.meta.edges.filter(e => e.kind === 'import').length, 3)
    assert.equal(xray.meta.tests.length, 1)
    assert.deepEqual(new Set(xray.meta.edges.map(e => e.resolution)), new Set(['exact', 'import-scoped', 'name-only']))
    assert.ok(xray.meta.paths.some(p => p.edgeIds.length === 2 && p.resolution === 'exact' && !p.omitted))
    assert.ok(Buffer.byteLength(JSON.stringify(xray.meta)) <= plugin.XRAY_LIMITS.metadataBytes)
    for (const item of [...xray.meta.nodes, ...xray.meta.edges]) {
      const e = item.evidence
      assert.equal(typeof e.code, 'string')
      const lines = readFileSync(path.join(xrayRoot, e.file), 'utf8').split(/\r?\n/)
      assert.equal(e.code, lines.slice(e.startLine - 1, e.startLine - 1 + e.code.split('\n').length).join('\n'))
    }
    console.log('Impact X-Ray installed runtime: default text, call/import/test/path provenance and source windows passed')
    for (const outputFormat of ['text', 'pack']) {
      const result = await nativeInvoke('code_context', {
        task: 'Explain PublicOne', repoRoot: rustRoot, outputFormat, budgetChars: 5000,
      })
      assert.match(JSON.stringify(result.content), /PublicOne/)
      if (outputFormat === 'pack') assert.ok(result.value.items.some(item => item.name === 'PublicOne' && item.code?.includes('pub struct PublicOne')))
    }
  } finally {
    for (const dispose of nativeDisposers.reverse()) dispose()
    await nativeContext.fiber.dispose()
  }
  console.log(`release smoke passed for ${packageJson.name}@${packageJson.version} with dsh-tools@${toolsVersion}`)
} finally {
  rmSync(smokeDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  if (!suppliedTarball) rmSync(tarball, { force: true })
}
