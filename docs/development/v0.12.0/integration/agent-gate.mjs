// Real model requests only. One no-plugin isolation probe after transport failure.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, symlinkSync, existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
const repo = process.cwd(), out = path.join(repo, 'docs/development/v0.12.0/integration')
const state = JSON.parse(readFileSync(readFileSync('node_modules/.v012-rc-state-path', 'utf8'), 'utf8'))
const host = JSON.parse(readFileSync(path.join(out, 'host-results.json'), 'utf8'))
const smoke = JSON.parse(readFileSync(path.join(out, 'smoke-node24.json'), 'utf8'))
const load = createRequire(path.join(state.host, 'package.json')), yaml = load('yaml')
const readYaml = p => yaml.parse(readFileSync(p, 'utf8'), { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => String(value) }] })
const globalHome = path.join(os.homedir(), '.dsh')
const rows = readYaml(path.join(globalHome, 'profiles/desktop/cordis.patch.yml'))
const configured = rows.find(row => row.id === 'agent-default-model')?.config
const deep = rows.find(row => row.id === 'llm-deepseek')?.config ?? {}
if (!configured?.provider || !configured?.model) throw Error('No verified configured model route; refusing to guess')
const credential = readYaml(path.join(globalHome, '.credentials.yaml')).refs?.DEEPSEEK_API_KEY
const secrets = [credential, process.env.DEEPSEEK_API_KEY].filter(s => typeof s === 'string' && s.length > 5)
const scrub = value => secrets.reduce((text, secret) => text.split(secret).join('[REDACTED]'), String(value))
const summaryPath = path.join(out, 'agent-results.json')
const records = existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, 'utf8')).records : []
for (const record of records) {
  const events = readFileSync(path.join(out, 'agent-' + record.id, 'stdout.jsonl'), 'utf8').split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
  record.toolCalls = events.filter(e => e.type === 'tool_call').length
  writeFileSync(path.join(out, 'agent-' + record.id, 'result.json'), scrub(JSON.stringify(record, null, 2)))
}
writeFileSync(summaryPath, scrub(JSON.stringify({ method: 'real model CLI; never substituted Host replay', records }, null, 2)))
const tasks = [
  '请调用 code_context（中文任务：理解 normalize 的实现并定位源码），再用 code_search 核实声明。只读当前小仓库，给出实际文件行号和源码证据。不要访问上级目录，不修改文件。',
  '请调用 code_change_context 分析当前修改，说明潜在影响和候选测试。明确静态候选测试没有执行，也不代表覆盖已验证。只读当前仓库，不修改文件。',
  '请调用 code_refs 查找 lonelyMarker 的调用者，再调用 code_context 获取证据摘要。解释 0 callers 的索引与静态分析边界，不能说运行时绝对无人调用。只读当前仓库，不修改文件。',
]
const run = async (id, prompt, withPlugin) => {
  const dir = path.join(out, 'agent-' + id); mkdirSync(dir, { recursive: true })
  const scratch = mkdtempSync(path.join(state.scratch, 'agent-')), home = path.join(scratch, 'home'), profile = path.join(home, 'profiles/headless')
  mkdirSync(profile, { recursive: true }); symlinkSync(path.join(state.host, 'node_modules'), path.join(profile, 'node_modules'), 'junction')
  writeFileSync(path.join(profile, 'package.json'), JSON.stringify({ name: 'rc-agent-isolated', private: true, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'] } } }))
  writeFileSync(path.join(profile, 'cordis.yml'), '[]\n')
  const patch = [
    { id: 'agent-default-model', config: configured },
    { id: 'llm-deepseek', config: { ...deep, maxTokens: 2048, streamIdleTimeoutMs: 45000, retryPolicy: { mode: 'normal', maxRetries: 0 } } },
    { id: 'session-title-llm', disabled: true },
  ]
  if (withPlugin) patch.push({ insert: [{ id: 'code-index', name: path.join(smoke.installedRoot, 'dist/index.js').replaceAll('\\', '/'), config: { autoInject: true, codeHealth: true, externalWatch: true } }] })
  writeFileSync(path.join(profile, 'cordis.patch.yml'), yaml.stringify(patch))
  const env = { ...process.env, DSH_HOME: home }
  if (typeof credential === 'string') env.DEEPSEEK_API_KEY = credential
  delete env.DSH_PERMISSION_MODE
  const args = [path.join(state.host, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), '--profile', 'headless', '--json', '-']
  const record = { id, method: 'actual official headless CLI model request', withPlugin, model: configured, home, cwd: host.repos.a, executable: process.execPath, args, prompt, started: new Date().toISOString(), retryPolicy: { mode: 'normal', maxRetries: 0 } }
  const child = spawn(process.execPath, args, { cwd: host.repos.a, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''; const start = Date.now()
  child.stdout.on('data', b => { stdout += b; writeFileSync(path.join(dir, 'stdout.jsonl'), scrub(stdout)) })
  child.stderr.on('data', b => { stderr += b; writeFileSync(path.join(dir, 'stderr.log'), scrub(stderr)) })
  child.stdin.end(prompt)
  const timer = setTimeout(() => { record.timedOut = true; child.kill() }, 105000)
  record.exitCode = await new Promise((resolve, reject) => { child.once('close', resolve); child.once('error', reject) }); clearTimeout(timer)
  record.elapsedMs = Date.now() - start
  const events = stdout.split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
  record.toolCalls = events.filter(e => e.type === 'tool_call').length
  record.final = events.filter(e => e.type === 'final').at(-1) ?? null
  record.transportFailure = /ECONNRESET|TRANSPORT|fetch failed|network.*error|socket hang up/i.test(stdout + stderr)
  // Persist the genuine session event stream, including tool results and final.
  const sessions = path.join(home, 'sessions')
  if (existsSync(sessions)) {
    const visit = p => { for (const e of readdirSync(p, { withFileTypes: true })) { const file = path.join(p, e.name); if (e.isDirectory()) visit(file); else if (e.name.endsWith('.jsonl')) {
      const text = scrub(readFileSync(file, 'utf8')); writeFileSync(path.join(dir, 'session-' + e.name), text)
      record.toolCalls = Math.max(record.toolCalls, text.split('\n').filter(line => { try { return JSON.parse(line).type === 'tool/call' } catch { return false } }).length)
    } } }; visit(sessions)
  }
  writeFileSync(path.join(dir, 'result.json'), scrub(JSON.stringify(record, null, 2))); records.push(record)
  writeFileSync(path.join(out, 'agent-results.json'), scrub(JSON.stringify({ method: 'real model CLI; never substituted Host replay', records }, null, 2)))
  console.log(JSON.stringify({ id, exitCode: record.exitCode, elapsedMs: record.elapsedMs, toolCalls: record.toolCalls, transportFailure: record.transportFailure, final: record.final }))
  return record
}
const first = records.find(r => r.id === '1') ?? await run('1', tasks[0], true)
if (first.transportFailure) await run('isolation-no-plugin', '只回复 RC_OK，不调用任何工具。', false)
else if (first.exitCode === 0 && first.toolCalls > 0) for (let i = 1; i < tasks.length; i++) { const r = records.find(r => r.id === String(i + 1)) ?? await run(String(i + 1), tasks[i], true); if (r.transportFailure) { if (!records.some(r => r.id === 'isolation-no-plugin')) await run('isolation-no-plugin', '只回复 RC_OK，不调用任何工具。', false); break } }
