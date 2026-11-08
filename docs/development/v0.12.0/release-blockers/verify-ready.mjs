import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
const out = import.meta.dirname, repo = path.resolve(out, '../../../..'), stable = process.env.CIX_STABLE_WORKSPACE ?? 'D:/ChatGPTProjects/dsh-code-index'
const read = f => JSON.parse(readFileSync(path.join(out, f), 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), norm = bytes => bytes.toString('utf8').replace(/\r\n/g, '\n')
const git = (...args) => execFileSync('git', args, { cwd: repo })
const artifact = read('release-artifact.json'), npm = read('release-npm.json'), agent = read('agent-recheck.json')
assert.equal(hash(readFileSync(artifact.archive)), artifact.sha256)
assert.ok(npm.length === 2 && npm.every(r => r.exitCode === 0 && !r.bypass && r.installed.plugin === '0.12.0' && r.sha256 === artifact.sha256))
assert.equal(read('normal-package-runtime.json').status, 'PASS')
assert.ok(agent.records.length === 2 && agent.records.every(r => r.exitCode === 0 && r.termination.kind === 'completed' && r.final && !r.transport && !r.hostPermission && !r.pluginErrors.length))
assert.ok(agent.protectedFilesUnchanged)
assert.equal(read('peer-after.json').numPassedTests, 6)
assert.equal(readFileSync(path.join(out, 'typecheck-exit.txt'), 'utf8').trim(), '0')
const payloadRefs = []
for (const file of artifact.files.filter(f => !f.path.startsWith('dist/'))) {
  assert.ok(!file.path.includes('HANDOFF_PROMPT.md'))
  const blob = git('show', `HEAD:${file.path}`), disk = readFileSync(path.join(repo, file.path)), packed = readFileSync(path.join(artifact.unpacked, file.path))
  assert.equal(hash(packed), file.sha256)
  if (file.path.endsWith('.wasm')) { assert.equal(hash(blob), file.sha256); assert.equal(hash(disk), file.sha256) }
  else { assert.equal(norm(blob), norm(disk)); assert.equal(norm(blob), norm(packed)) }
  payloadRefs.push({ path: file.path, gitBlob: git('rev-parse', `HEAD:${file.path}`).toString().trim(), packageSha256: file.sha256 })
}
const sourceRefs = []
for (const map of artifact.files.filter(f => f.path.endsWith('.map'))) {
  const bytes = readFileSync(path.join(repo, map.path)); assert.equal(hash(bytes), map.sha256)
  const data = JSON.parse(bytes)
  data.sources.forEach((source, i) => {
    if (source.includes('node_modules')) return
    const name = source.replaceAll('\\', '/').match(/(?:^|\/)(src\/.*)$/)?.[1]
    if (!name) return
    const blob = git('show', `HEAD:${name}`)
    assert.equal(norm(blob), norm(data.sourcesContent[i]), name)
    sourceRefs.push({ path: name, gitBlob: git('rev-parse', `HEAD:${name}`).toString().trim() })
  })
}
for (const file of artifact.files.filter(f => f.path.startsWith('dist/'))) assert.equal(hash(readFileSync(path.join(repo, file.path))), file.sha256)
assert.equal(JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8')).version, '0.12.0')
const original = git('show', '69981b5:package.json'), stablePackage = readFileSync(path.join(stable, 'package.json'))
assert.equal(norm(stablePackage), norm(original), 'stable linked workspace must retain original manifest')
const protectedBefore = JSON.parse(readFileSync(path.join(out, '../integration/desktop-launch.json'), 'utf8')).protectedBefore
for (const [file, before] of Object.entries(protectedBefore)) assert.equal(hash(readFileSync(file)), before, file)
const old = JSON.parse(readFileSync(path.join(out, '../integration/candidate-manifest.json'), 'utf8'))
for (const file of old.files.filter(f => f.path.startsWith('dist/'))) assert.equal(hash(readFileSync(path.join(stable, file.path))), file.sha256)
const record = { decision: 'RELEASE READY', releasePayloadCommit: git('rev-parse', 'HEAD').toString().trim(), packageVersion: '0.12.0', archive: artifact.archive, sha256: artifact.sha256,
  payloadRefs, sourceRefs, normalNpm: npm.map(r => ({ mode: r.mode, exitCode: r.exitCode, installed: r.installed })), realAgentRechecks: agent.records.map(r => ({ id: r.id, exitCode: r.exitCode, calls: r.calls.length, termination: r.termination })),
  peerTests: '6/6', typecheck: 0, fullSuite: 'Previous 290/290 on Node22 and Node24 retained; not rerun this round', stable: { root: stable, packageVersion: '0.11.2', manifestMatchesOriginal: true, distMatchesRc0: true, desktopProfileAndAuthenticationUnchanged: true }, published: false }
if (!process.argv.includes('--check-only')) writeFileSync(path.join(out, 'artifact-commit.json'), JSON.stringify(record, null, 2) + '\n')
console.log(JSON.stringify({ decision: record.decision, head: record.releasePayloadCommit, sha256: record.sha256, gitBoundPackageFiles: payloadRefs.length, gitBoundSources: sourceRefs.length, stableVersion: '0.11.2', releaseVersion: '0.12.0' }))
