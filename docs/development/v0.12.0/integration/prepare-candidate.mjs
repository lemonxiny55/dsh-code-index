import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const out = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(out, '../../../..')
const scratch = mkdtempSync(path.join(repo, 'node_modules/.v012-rc-'))
const stage = path.join(scratch, 'stage')
const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
assert.ok(existsSync(npmCli), 'use the installed Node 24 runtime with its existing npm CLI')
mkdirSync(stage)
mkdirSync(path.join(stage, 'node_modules'))
const semver = path.join(repo, '.rc3/host/node_modules/semver')
assert.equal(JSON.parse(readFileSync(path.join(semver, 'package.json'))).version, '7.8.5')
symlinkSync(semver, path.join(stage, 'node_modules/semver'), 'junction') // gate-only dev dependency, never packed
for (const directory of ['dist', 'grammars', 'scripts']) cpSync(path.join(repo, directory), path.join(stage, directory), {
  recursive: true, filter: source => path.basename(source) !== 'HANDOFF_PROMPT.md',
})
for (const file of ['README.md', 'README.zh.md', 'CHANGELOG.md', 'LICENSE', 'cordis.patch.yml']) cpSync(path.join(repo, file), path.join(stage, file))
const metadata = JSON.parse(readFileSync(path.join(repo, 'package.json')))
assert.equal(metadata.version, '0.11.2', 'do not bump the workspace formal version')
metadata.version = process.argv[2] ?? '0.12.0-rc.0'
assert.match(metadata.version, /^0\.12\.0-rc\.\d+$/)
assert.ok(!existsSync(path.join(out, `dsh-code-index-${metadata.version}.tgz`)), 'candidate archives are immutable; use a new RC suffix')
writeFileSync(path.join(stage, 'package.json'), JSON.stringify(metadata, null, 2) + '\n')
// The shipped smoke uses its script root as one analysis fixture. Keep that
// root tiny; these sources and the marker are excluded by package.json.files.
mkdirSync(path.join(stage, '.git'))
mkdirSync(path.join(stage, 'src'))
writeFileSync(path.join(stage, 'src/index.ts'), 'export function buildIndex() { return 1 }\n')
writeFileSync(path.join(stage, 'src/use.ts'), "import { buildIndex } from './index'\nexport function useIndex() { return buildIndex() }\n")
const command = [npmCli, 'pack', '--ignore-scripts', '--json', '--pack-destination', out]
const packed = JSON.parse(execFileSync(process.execPath, command, {
  cwd: stage, encoding: 'utf8', env: { ...process.env, npm_config_cache: path.join(scratch, 'npm-cache') }, windowsHide: true,
}))[0]
const archive = path.join(out, packed.filename)
const extract = path.join(scratch, 'extracted')
mkdirSync(extract)
execFileSync('tar', ['-xzf', archive, '-C', extract], { windowsHide: true })
const installed = path.join(extract, 'package')
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const sourceMap = JSON.parse(readFileSync(path.join(installed, 'dist/index.js.map')))
const normalize = text => text.replace(/\r\n/g, '\n')
const sourceChecks = ['context.ts', 'context-pack.ts', 'context-terms.ts', 'evidence-summary.ts', 'change-context.ts', 'tools.ts'].map(file => {
  const index = sourceMap.sources.findIndex(source => source.replaceAll('\\', '/').endsWith(`/src/${file}`))
  assert.ok(index >= 0, `candidate missing source-map provenance for ${file}`)
  assert.equal(normalize(sourceMap.sourcesContent[index]), normalize(readFileSync(path.join(repo, 'src', file), 'utf8')))
  return { file: `src/${file}`, sha256: sha(path.join(repo, 'src', file)) }
})
assert.match(readFileSync(path.join(installed, 'dist/index.js'), 'utf8'), /indexed-static-only/)
assert.match(readFileSync(path.join(installed, 'dist/index.d.ts'), 'utf8'), /evidence\?: EvidenceSummary/)
assert.ok(!packed.files.some(file => /(^|\/)(?:node_modules|\.env|HANDOFF_PROMPT\.md)(\/|$)/.test(file.path)))
const state = { scratch, stage, archive, installed, npmCli, host: path.join(repo, '.rc3/host'), out }
writeFileSync(path.join(scratch, 'state.json'), JSON.stringify(state, null, 2) + '\n')
writeFileSync(path.join(repo, 'node_modules/.v012-rc-state-path'), path.join(scratch, 'state.json'))
const manifest = {
  name: metadata.name, version: metadata.version, published: false,
  basedOn: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  sourceChecks, node: process.version, archive, sha256: sha(archive), integrity: packed.integrity,
  command: { executable: process.execPath, args: command, cwd: stage, exitCode: 0 },
  files: packed.files.map(file => ({ path: file.path, size: file.size, sha256: sha(path.join(installed, file.path)) })),
}
writeFileSync(path.join(out, 'candidate-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify({ state: path.join(scratch, 'state.json'), archive, version: metadata.version, sha256: manifest.sha256, files: manifest.files.length }))
