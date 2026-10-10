import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
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

const packed = parseJsonArrayOutput(run(npm, ['pack', '--ignore-scripts', '--json'], root), 'npm pack')
assert.equal(packed.length, 1, 'npm pack must produce exactly one artifact')
const tarball = path.resolve(root, packed[0].filename)
const listed = new Set(packed[0].files.map((file) => file.path))
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
  'scripts/fix-wsl-links.mjs',
  'scripts/release-smoke.mjs',
]
for (const file of expectedFiles) assert.ok(listed.has(file), `tarball is missing ${file}`)

const smokeDir = mkdtempSync(path.join(os.tmpdir(), 'dsh-code-index-release-'))
try {
  run(npm, ['init', '--yes'], smokeDir)
  run(npm, ['install', '--ignore-scripts', '--no-save', tarball], smokeDir)

  const installedPackage = JSON.parse(
    readFileSync(path.join(smokeDir, 'node_modules', packageJson.name, 'package.json'), 'utf8'),
  )
  assert.equal(installedPackage.version, packageJson.version)
  assert.equal(installedPackage.main, './dist/index.js')
  assert.equal(installedPackage.exports['.'].default, './dist/index.js')
  assert.match(installedPackage.engines.node, />=22/)
  assert.equal(installedPackage.license, 'MIT')
  const installedTools = JSON.parse(readFileSync(path.join(smokeDir, 'node_modules', '@deepseek-ai', 'dsh-tools', 'package.json'), 'utf8'))
  assert.equal(installedTools.version, '0.2.0-rc.2', 'fresh consumers must resolve the verified matching RC')

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
  console.log(`release smoke passed for ${packageJson.name}@${packageJson.version}`)
} finally {
  rmSync(smokeDir, { recursive: true, force: true })
  rmSync(tarball, { force: true })
}
