import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, symlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
const out = import.meta.dirname, repo = path.resolve(out, '../../../..'), prior = path.join(out, '../integration')
const load = createRequire(path.join(repo, '.rc3/host/package.json')), yaml = load('yaml')
const parse = p => yaml.parse(readFileSync(p, 'utf8'), { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: String }] })
const rows = parse(path.join(os.homedir(), '.dsh/profiles/desktop/cordis.patch.yml'))
const model = rows.find(r => r.id === 'agent-default-model')?.config, deep = rows.find(r => r.id === 'llm-deepseek')?.config ?? {}
assert.ok(model?.provider && model?.model, 'do not guess configured model')
const key = parse(path.join(os.homedir(), '.dsh/.credentials.yaml')).refs?.DEEPSEEK_API_KEY
const scrub = text => [key, process.env.DEEPSEEK_API_KEY].filter(s => typeof s === 'string' && s.length > 5).reduce((t, k) => t.split(k).join('[REDACTED]'), String(text))
const smoke = JSON.parse(readFileSync(path.join(prior, 'smoke-node24.json'), 'utf8'))
const fixture = JSON.parse(readFileSync(path.join(prior, 'host-results.json'), 'utf8')).repos.a
const entry = path.join(smoke.installedRoot, 'dist/index.js')
const records = [], protectedFiles = ['profiles/desktop/package.json', 'profiles/desktop/cordis.patch.yml', '.credentials.yaml'].map(f => path.join(os.homedir(), '.dsh', f))
const hashes = () => Object.fromEntries(protectedFiles.map(f => [f, createHash('sha256').update(readFileSync(f)).digest('hex')]))
const before = hashes()
const run = async (id, prompt, withPlugin) => {
  const dir = path.join(out, 'agent-' + id); mkdirSync(dir, { recursive: true })
  const home = mkdtempSync(path.join(repo, 'node_modules/.v012-final-agent-')), profile = path.join(home, 'profiles/headless')
  mkdirSync(profile, { recursive: true }); symlinkSync(path.join(repo, '.rc3/host/node_modules'), path.join(profile, 'node_modules'), 'junction')
  writeFileSync(path.join(profile, 'package.json'), JSON.stringify({ name: 'bounded-agent-check', private: true, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'] } } }))
  writeFileSync(path.join(profile, 'cordis.yml'), '[]\n')
  const patch = [{ id: 'agent-default-model', config: model }, { id: 'llm-deepseek', config: { ...deep, maxTokens: 8192, streamIdleTimeoutMs: 45000, retryPolicy: { mode: 'normal', maxRetries: 0 } } }, { id: 'session-title-llm', disabled: true }]
  if (withPlugin) patch.push({ insert: [{ id: 'code-index', name: entry.replaceAll('\\', '/'), config: { autoInject: false, codeHealth: true, externalWatch: true } }] })
  writeFileSync(path.join(profile, 'cordis.patch.yml'), yaml.stringify(patch))
  const env = { ...process.env, DSH_HOME: home }; if (typeof key === 'string') env.DEEPSEEK_API_KEY = key
  delete env.DSH_PERMISSION_MODE
  const args = [path.join(repo, '.rc3/host/node_modules/@deepseek-ai/dsh/lib/bin.js'), '--profile', 'headless', '--json', '-']
  const r = { id, withPlugin, model, executable: process.execPath, args, cwd: fixture, prompt, maxTokens: 8192, maxRetries: 0, candidate: smoke.version, sha256: smoke.sha256, home, started: new Date().toISOString() }
  const child = spawn(process.execPath, args, { cwd: fixture, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''; const start = Date.now()
  child.stdout.on('data', b => { stdout += b; writeFileSync(path.join(dir, 'stdout.jsonl'), scrub(stdout)) }); child.stderr.on('data', b => { stderr += b; writeFileSync(path.join(dir, 'stderr.log'), scrub(stderr)) })
  child.stdin.end(prompt)
  const timer = setTimeout(() => { r.timedOut = true; child.kill() }, 150000)
  r.exitCode = await new Promise((resolve, reject) => { child.once('close', resolve); child.once('error', reject) }); clearTimeout(timer)
  r.elapsedMs = Date.now() - start
  const events = stdout.split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
  r.calls = events.filter(e => e.type === 'tool_call'); r.results = events.filter(e => e.type === 'tool_result')
  r.final = events.findLast(e => e.type === 'final')?.text ?? null
  r.termination = events.findLast(e => e.type === 'status' && e.phase === 'turn_end')?.reason ?? null
  r.transport = /TRANSPORT|ECONNRESET/.test(stdout + stderr)
  r.hostPermission = /SetNamedSecurityInfoW|grantWrite|Win32 5/.test(stdout + stderr)
  r.pluginErrors = r.results.filter(e => /^code_/.test(r.calls.find(c => c.callId === e.callId)?.tool ?? '') && e.status !== 'completed')
  records.push(r); writeFileSync(path.join(dir, 'result.json'), scrub(JSON.stringify(r, null, 2)))
  writeFileSync(path.join(out, 'agent-recheck.json'), scrub(JSON.stringify({ limit: 'one request per task; at most one no-plugin transport probe total', records, protectedFilesUnchanged: JSON.stringify(before) === JSON.stringify(hashes()) }, null, 2)))
  console.log(JSON.stringify({ id, exitCode: r.exitCode, termination: r.termination, toolCalls: r.calls.length, toolResults: r.results.length, pluginErrors: r.pluginErrors.length, transport: r.transport, hostPermission: r.hostPermission, final: r.final })); return r
}
const tasks = [
  ['impact', '只使用一次 code_change_context（默认文本输出）分析当前小仓库修改。随后直接用不超过200字说明主要修改、潜在影响和候选测试，明确候选未执行、覆盖未验证。不要调用 read、pwsh、grep 或其他工具，不访问父目录，不修改文件，不运行测试。'],
  ['zero-callers', '只调用 code_refs(symbol="lonelyMarker") 和 code_context(task="解释 lonelyMarker 的实现及静态调用者", budgetChars=3000)。随后直接用不超过150字解释 0 callers 只指当前索引及静态解析范围未发现调用者，不能推断运行时绝对无人调用。不要调用其他工具，不读取父目录，不修改文件。'],
]
let isolated = false
for (const [id, prompt] of tasks) {
  const r = await run(id, prompt, true)
  if (r.transport && !isolated) { isolated = true; const probe = await run('isolation', '只回复 RC_OK，不调用工具。', false); if (probe.transport || probe.timedOut) break }
}
