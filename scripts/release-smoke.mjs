import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
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

const packed = JSON.parse(run(npm, ['pack', '--ignore-scripts', '--json'], root))
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
  assert.match(await invoke('code_health', { repoRoot: root }), /repo health/)

  for (const dispose of disposers.reverse()) dispose()
  console.log(`release smoke passed for ${packageJson.name}@${packageJson.version}`)
} finally {
  rmSync(smokeDir, { recursive: true, force: true })
  rmSync(tarball, { force: true })
}
