import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, symlinkSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
const root = process.cwd(), host = path.join(root, 'node_modules/.m0-host'), out = path.join(root, 'docs/development/v0.13.0')
const scratch = mkdtempSync(path.join(host, 'desktop-')), home = path.join(scratch, 'home'), profile = path.join(home, 'profiles/desktop'), userData = path.join(scratch, 'electron-user-data')
mkdirSync(profile, { recursive: true }); symlinkSync(path.join(host, 'node_modules'), path.join(profile, 'node_modules'), 'junction')
writeFileSync(path.join(profile, 'package.json'), JSON.stringify({ name: 'v013-desktop-gate', private: true, dependencies: { 'dsh-code-index': '0.12.0' }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-code-index'] } } }))
writeFileSync(path.join(profile, 'cordis.yml'), '[]\n')
writeFileSync(path.join(profile, 'cordis.patch.yml'), '- id: code-index\n  config:\n    codeHealth: true\n    externalWatch: true\n    autoInject: false\n- insert:\n    - id: m0-acceptance-probe\n      name: ' + JSON.stringify(path.join(out, 'm0-desktop-probe.mjs').replaceAll('\\', '/')) + '\n')
const protectedFiles = ['profiles/desktop/package.json', 'profiles/desktop/cordis.patch.yml', '.credentials.yaml']
const protectedBefore = Object.fromEntries(protectedFiles.map(p => { const file = path.join(os.homedir(), '.dsh', p); return [file, existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null] }))
const executable = 'E:/DeepSeek Harness/DeepSeek Harness.exe', args = ['--user-data-dir=' + userData]
const env = { ...process.env, DSH_HOME: home }; delete env.ELECTRON_RUN_AS_NODE
const child = spawn(executable, args, { env, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'] })
const record = { executable, args, pid: child.pid, home, profile, userData, protectedBefore, method: 'installed rc.3 Desktop; disposable home and Electron data' }
writeFileSync(path.join(out, 'm0-desktop-launch.json'), JSON.stringify(record, null, 2))
let log = ''; const append = b => { log += b; writeFileSync(path.join(scratch, 'desktop.log'), log) }; child.stdout.on('data', append); child.stderr.on('data', append)
child.once('close', code => { record.exitCode = code; writeFileSync(path.join(out, 'm0-desktop-launch.json'), JSON.stringify(record, null, 2)); console.log('Desktop exit', code) })
console.log(JSON.stringify({ pid: child.pid, home }))
