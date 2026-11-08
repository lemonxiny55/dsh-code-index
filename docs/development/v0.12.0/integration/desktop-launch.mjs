// Launch the installed Electron application with disposable DSH_HOME/userData.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, symlinkSync, cpSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
const out = path.resolve('docs/development/v0.12.0/integration')
const state = JSON.parse(readFileSync(readFileSync('node_modules/.v012-rc-state-path', 'utf8'), 'utf8'))
const smoke = JSON.parse(readFileSync(path.join(out, 'smoke-node24.json'), 'utf8'))
const host = JSON.parse(readFileSync(path.join(out, 'host-results.json'), 'utf8'))
const runDir = mkdtempSync(path.join(state.scratch, 'desktop-')), home = path.join(runDir, 'home'), profile = path.join(home, 'profiles/desktop'), userData = path.join(runDir, 'electron-user-data')
mkdirSync(path.join(profile, 'node_modules'), { recursive: true })
symlinkSync(smoke.installedRoot, path.join(profile, 'node_modules/dsh-code-index'), 'junction')
writeFileSync(path.join(profile, 'package.json'), JSON.stringify({ name: 'rc-desktop-isolated', private: true,
  dependencies: { 'dsh-code-index': 'file:' + state.archive.replaceAll('\\', '/') },
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-code-index'] } } }, null, 2))
writeFileSync(path.join(profile, 'cordis.yml'), '[]\n')
writeFileSync(path.join(profile, 'cordis.patch.yml'), '- id: code-index\n  config:\n    codeHealth: true\n    externalWatch: true\n')
cpSync(path.join(host.home, 'sessions'), path.join(home, 'sessions'), { recursive: true, errorOnExist: true })
const files = ['profiles/desktop/package.json', 'profiles/desktop/cordis.patch.yml', '.credentials.yaml']
const protectedBefore = Object.fromEntries(files.map(relative => { const file = path.join(os.homedir(), '.dsh', relative); return [file, existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null] }))
const env = { ...process.env, DSH_HOME: home }; delete env.ELECTRON_RUN_AS_NODE
const executable = 'E:/DeepSeek Harness/DeepSeek Harness.exe', args = ['--user-data-dir=' + userData]
const child = spawn(executable, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
const record = { executable, args, pid: child.pid, home, userData, profile, installedRoot: smoke.installedRoot, package: smoke.version, sha256: smoke.sha256, copiedHostReplay: host.sessionId, protectedBefore, method: 'actual installed Desktop; isolated DSH_HOME and Electron userData, no stable profile changes', started: new Date().toISOString() }
writeFileSync(path.join(out, 'desktop-launch.json'), JSON.stringify(record, null, 2))
let log = ''
const append = b => { log += b; writeFileSync(path.join(state.scratch, 'desktop.log'), log) }
child.stdout.on('data', append); child.stderr.on('data', append)
child.on('close', exitCode => { record.exitCode = exitCode; writeFileSync(path.join(out, 'desktop-launch.json'), JSON.stringify(record, null, 2)); console.log('Desktop exited', exitCode) })
console.log(JSON.stringify({ pid: child.pid, home, userData }))
