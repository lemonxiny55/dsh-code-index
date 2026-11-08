import { readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
const out = path.resolve('docs/development/v0.12.0/integration')
const records = await Promise.all([
  ['node24', process.execPath], ['node22', 'D:/DevCache/npm/_npx/d18f28baf1132559/node_modules/node/bin/node.exe'],
].map(([label, executable]) => new Promise((resolve, reject) => {
  const args = ['node_modules/vitest/vitest.mjs', 'run', '--reporter=json', '--outputFile=' + path.join(out, 'tests-' + label + '.json')]
  const start = Date.now(), child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''; child.stdout.on('data', b => { log += b }); child.stderr.on('data', b => { log += b })
  child.once('error', reject)
  child.once('close', exitCode => {
    writeFileSync(path.join(out, 'tests-' + label + '.log'), log)
    const report = JSON.parse(readFileSync(path.join(out, 'tests-' + label + '.json'), 'utf8'))
    const record = { label, executable, args, cwd: process.cwd(), exitCode, elapsedMs: Date.now() - start, testFiles: report.testResults.length, total: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests, skipped: report.numPendingTests }
    console.log(JSON.stringify(record)); resolve(record)
  })
})))
writeFileSync(path.join(out, 'test-commands.json'), JSON.stringify(records, null, 2))
if (records.some(r => r.exitCode !== 0)) process.exitCode = 1
