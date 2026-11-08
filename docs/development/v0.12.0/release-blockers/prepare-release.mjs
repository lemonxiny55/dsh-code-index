import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
const out = import.meta.dirname, repo = path.resolve(out, '../../../..')
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const old = JSON.parse(readFileSync(path.join(out, '../integration/candidate-manifest.json'), 'utf8'))
for (const file of old.files.filter(f => f.path.startsWith('dist/'))) assert.equal(sha(path.join(repo, file.path)), file.sha256, 'reuse only the byte-identical tested build')
for (const source of old.sourceChecks) assert.equal(sha(path.join(repo, source.file)), source.sha256)
const scratch = mkdtempSync(path.join(repo, 'node_modules/.v012-release-')), stage = path.join(scratch, 'stage')
mkdirSync(stage)
for (const dir of ['dist', 'grammars', 'scripts']) cpSync(path.join(repo, dir), path.join(stage, dir), { recursive: true, filter: source => path.basename(source) !== 'HANDOFF_PROMPT.md' })
for (const file of ['package.json', 'README.md', 'README.zh.md', 'CHANGELOG.md', 'LICENSE', 'cordis.patch.yml']) cpSync(path.join(repo, file), path.join(stage, file))
const metadata = JSON.parse(readFileSync(path.join(stage, 'package.json'), 'utf8')); assert.equal(metadata.version, '0.12.0')
assert.ok(!existsSync(path.join(out, 'dsh-code-index-0.12.0.tgz')), 'release archives are immutable')
const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
const args = [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', out]
const packed = JSON.parse(execFileSync(process.execPath, args, { cwd: stage, encoding: 'utf8', windowsHide: true }))[0]
const archive = path.join(out, packed.filename), unpack = path.join(scratch, 'unpack'); mkdirSync(unpack)
execFileSync('tar', ['-xzf', archive, '-C', unpack], { windowsHide: true })
const root = path.join(unpack, 'package')
for (const file of old.files.filter(f => f.path.startsWith('dist/'))) assert.equal(sha(path.join(root, file.path)), file.sha256)
assert.equal(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).peerDependencies['@deepseek-ai/dsh-tools'], metadata.peerDependencies['@deepseek-ai/dsh-tools'])
assert.ok(!packed.files.some(f => /(^|\/)(?:node_modules|HANDOFF_PROMPT\.md)(\/|$)/.test(f.path)))
const record = { version: metadata.version, published: false, basedOn: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  binding: 'HEAD plus recorded package/docs/smoke edits; application source and dist match tested rc.0 exactly', archive, sha256: sha(archive), integrity: packed.integrity, node: process.version,
  command: { executable: process.execPath, args, cwd: stage, exitCode: 0 }, peers: metadata.peerDependencies,
  sourceChecks: old.sourceChecks, files: packed.files.map(f => ({ path: f.path, size: f.size, sha256: sha(path.join(root, f.path)) })), unpacked: root }
writeFileSync(path.join(out, 'release-artifact.json'), JSON.stringify(record, null, 2) + '\n')
console.log(JSON.stringify({ archive, sha256: record.sha256, files: record.files.length, applicationBuildMatchesRc0: true }))
