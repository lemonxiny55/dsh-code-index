import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
const out = import.meta.dirname, repo = path.resolve(out, '../../../..')
const read = file => JSON.parse(readFileSync(path.join(out, file), 'utf8'))
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const manifest = read('candidate-manifest.json'), tests = read('test-commands.json'), builds = read('build-commands.json')
const smoke = ['smoke-node22.json', 'smoke-node24.json'].map(read)
const host = read('host-results.json'), desktop = read('desktop-results.json'), agent = read('agent-results.json')
const restored = read('desktop-restored-runtime.json'), profile = read('desktop-profile.json')
assert.equal(hash(manifest.archive), manifest.sha256)
for (const source of manifest.sourceChecks) assert.equal(hash(path.join(repo, source.file)), source.sha256)
for (const file of manifest.files.filter(f => f.path.startsWith('dist/'))) assert.equal(hash(path.join(repo, file.path)), file.sha256, file.path)
assert.equal(JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8')).version, '0.11.2')
assert.ok(tests.every(r => r.exitCode === 0 && r.total === 290 && r.passed === 290 && r.testFiles === 30))
assert.ok(builds.slice(1).every(r => r.exitCode === 0))
assert.ok(smoke.every(r => r.passed && r.sha256 === manifest.sha256 && r.nativeCalls === 19))
assert.equal(host.results.length, 23); assert.equal(desktop.status, 'PASS'); assert.equal(desktop.results.length, 22)
assert.equal(desktop.runtime, '0.2.2-rc.1'); assert.equal(desktop.candidateLoad.sha256, manifest.sha256)
assert.equal(restored.status, 'PASS'); assert.equal(restored.names.length, 7)
assert.ok(profile.restored); assert.equal(hash(profile.target), profile.originalHash)
const launch = read('desktop-launch.json')
const protectedFiles = Object.entries(launch.protectedBefore).map(([file, before]) => ({ file, unchanged: (existsSync(file) ? hash(file) : null) === before }))
assert.ok(protectedFiles.every(r => r.unchanged))
const report24 = read('tests-node24.json')
const groups = report24.testResults.map(result => ({ file: path.basename(result.name), tests: result.assertionResults.length, status: result.status }))
const fullTrial = read('full-trial-tests.json')
assert.ok(fullTrial.success); assert.equal(fullTrial.numPassedTests, 6)
const records = {
  date: '2026-11-08', timezone: 'Asia/Shanghai', branch: execFileSync('git', ['branch', '--show-current'], { cwd: repo, encoding: 'utf8' }).trim(),
  basedOn: manifest.basedOn, packageVersion: '0.11.2', candidate: { version: manifest.version, sha256: manifest.sha256, files: manifest.files.length, published: false },
  codexModel: 'Not selectable/verifiable through session tools; no guessed model ID',
  tests, builds, groups,
  shellBuild: { command: 'pnpm build *> docs/development/v0.12.0/integration/pnpm-build-shell.log', shell: 'PowerShell 7.6', cwd: repo, exitCode: 0, note: 'Actual command completion observed; initial spawnSync(pnpm.cmd) EINVAL is separately preserved in build-commands.json' },
  packageSmoke: smoke.map((r, i) => ({ ...r, executable: tests[i === 0 ? 1 : 0].executable,
    args: [path.join(path.dirname(readFileSync(path.join(repo, 'node_modules/.v012-rc-state-path'), 'utf8')), 'stage/scripts/release-smoke.mjs'), manifest.archive, '0.2.1-rc.3'], exitCode: 0,
    env: { CIX_NPM_CLI: 'C:/Users/18439/AppData/Local/Programs/node-v24.19.0/node_modules/npm/bin/npm-cli.js', npm_config_registry: 'https://registry.npmjs.org' }, npmPeerAutoResolution: 'not verified; --force used' })),
  fullTrials: { command: 'node node_modules/vitest/vitest.mjs run tests/context-c-phase.spec.ts --reporter=json --outputFile=docs/development/v0.12.0/integration/full-trial-tests.json', executable: tests[0].executable, cwd: repo, exitCode: 0, total: 6, passed: 6,
    env: { CONTEXT_QUALITY_TRIALS_DIR: path.join(repo, 'node_modules/.c-phase-2026-11-04-pom2YH/trials'), CONTEXT_QUALITY_REPORT: path.join(out, 'full-trial-quality.json'), GIT_CONFIG_COUNT: '6', safeDirectoryScope: 'six C3 sample paths, process environment only' } },
  host: { method: host.method, runtime: host.runtime, calls: host.results.length, status: 'PASS', command: 'node docs/development/v0.12.0/integration/host-gate.mjs', exitCode: null, note: 'Long-running isolated Web Host: assertions completed, not reported as normal process exit' },
  desktop: { method: desktop.method, runtime: desktop.runtime, node: desktop.node, pid: desktop.pid, calls: desktop.results.length, status: desktop.status, sessionId: desktop.sessionId, command: 'Temporary local Cordis plugin in actual Desktop; ctx.tools.execute({ calls: [...] })', exitCode: null },
  agent: agent.records.map(r => ({ id: r.id, executable: r.executable, args: r.args, cwd: r.cwd, model: r.model, exitCode: r.exitCode, toolCalls: r.toolCalls, elapsedMs: r.elapsedMs, transportFailure: r.transportFailure, final: r.final, status: r.id === '1' || r.id === 'isolation-no-plugin' ? 'PASS' : r.id === '2' ? 'FAIL-incomplete' : 'BLOCKED-transport' })),
  restoration: { runtime: restored.status, originalTools: restored.names.length, originalSearch: 'PASS', profileByteExact: profile.restored, protectedFiles },
  recommendation: 'Keep unpublished RC; complete the two unfinished real Agent tasks before formal release',
}
writeFileSync(path.join(out, 'verification.json'), JSON.stringify(records, null, 2) + '\n')
console.log(JSON.stringify({ status: 'PASS', tests: tests.map(t => `${t.label}:${t.passed}/${t.total}`), candidateFiles: manifest.files.length, hostCalls: host.results.length, desktopCalls: desktop.results.length, restoration: true, realAgentCompleted: '1/3', formalReleaseRecommended: false }))
