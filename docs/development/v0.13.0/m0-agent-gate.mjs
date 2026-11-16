// Genuine rc.3 headless model request on synthetic files only. No stable writes.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, symlinkSync, existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
const root = process.cwd(), host = path.join(root, 'node_modules/.m0-host'), out = path.join(root, 'docs/development/v0.13.0')
const load = createRequire(path.join(host, 'package.json')), yaml = load('yaml')
const parse = file => yaml.parse(readFileSync(file, 'utf8'), { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => String(value) }] })
const stable = path.join(os.homedir(), '.dsh')
const rows = parse(path.join(stable, 'profiles/desktop/cordis.patch.yml'))
const route = rows.find(row => row.id === 'agent-default-model')?.config
const deepseek = rows.find(row => row.id === 'llm-deepseek')?.config ?? {}
if (!route?.provider || !route?.model) throw Error('No configured route; do not guess an API')
const key = parse(path.join(stable, '.credentials.yaml')).refs?.DEEPSEEK_API_KEY
const secrets = [key, process.env.DEEPSEEK_API_KEY].filter(v => typeof v === 'string' && v.length > 5)
const scrub = value => secrets.reduce((text, secret) => text.split(secret).join('[REDACTED]'), String(value))
const native = JSON.parse(readFileSync(path.join(out, 'm0-native-results.json'), 'utf8'))
const records = []
async function run(withPlugin) {
  const scratch = mkdtempSync(path.join(host, 'agent-')), home = path.join(scratch, 'home'), profile = path.join(home, 'profiles/headless')
  mkdirSync(profile, { recursive: true }); symlinkSync(path.join(host, 'node_modules'), path.join(profile, 'node_modules'), 'junction')
  writeFileSync(path.join(profile, 'package.json'), JSON.stringify({ name: 'v013-agent-gate', private: true, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'] } } }))
  writeFileSync(path.join(profile, 'cordis.yml'), '[]\n')
  const patch = [{ id: 'agent-default-model', config: route }, { id: 'llm-deepseek', config: { ...deepseek, maxTokens: 8192, streamIdleTimeoutMs: 45000, retryPolicy: { mode: 'normal', maxRetries: 0 } } }, { id: 'session-title-llm', disabled: true }]
  if (withPlugin) patch.push({ insert: [{ id: 'code-index', name: path.join(host, 'node_modules/dsh-code-index/dist/index.js').replaceAll('\\', '/'), config: { autoInject: false, codeHealth: true, externalWatch: true } }] })
  writeFileSync(path.join(profile, 'cordis.patch.yml'), yaml.stringify(patch))
  const prompt = withPlugin ? '只读当前微型测试仓库。必须调用 code_context 获取 ALPHA_MARKER 的真实实现源码，再调用 code_change_context（outputFormat 为 xray）分析当前变更。不要调用 shell 或其它工具，不修改文件。最终回答给出文件行号、实现和潜在影响，明确候选测试未执行、静态关系不等于运行时证明。' : '仅回复 RC3_ISOLATION_OK，不调用工具。'
  const args = [path.join(host, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), '--profile', 'headless', '--json', '-']
  const env = { ...process.env, DSH_HOME: home }; if (typeof key === 'string') env.DEEPSEEK_API_KEY = key
  const child = spawn(process.execPath, args, { cwd: native.repos.a, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''; const start = Date.now()
  child.stdout.on('data', b => { stdout += b }); child.stderr.on('data', b => { stderr += b }); child.stdin.end(prompt)
  let timedOut = false; const timer = setTimeout(() => { timedOut = true; child.kill() }, 120000)
  const exitCode = await new Promise((resolve, reject) => { child.once('close', resolve); child.once('error', reject) }); clearTimeout(timer)
  const events = stdout.split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
  const dir = path.join(out, withPlugin ? 'agent-target' : 'agent-isolation'); mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'stdout.jsonl'), scrub(stdout)); writeFileSync(path.join(dir, 'stderr.log'), scrub(stderr))
  let toolCalls = events.filter(e => e.type === 'tool_call').length
  const sessionEvents = []
  const visit = p => { if (!existsSync(p)) return; for (const e of readdirSync(p, { withFileTypes: true })) { const file = path.join(p, e.name); if (e.isDirectory()) visit(file); else if (e.name.endsWith('.jsonl')) { const text = scrub(readFileSync(file, 'utf8')); writeFileSync(path.join(dir, 'session-' + e.name), text); for (const line of text.split('\n')) try { sessionEvents.push(JSON.parse(line)) } catch {} } } }
  visit(path.join(home, 'sessions'))
  toolCalls = Math.max(toolCalls, sessionEvents.filter(e => e.type === 'tool/call').length)
  const record = { method: 'real rc.3 headless CLI + configured model; synthetic repo only', withPlugin, route, exitCode, timedOut, elapsedMs: Date.now() - start, toolCalls, final: events.filter(e => e.type === 'final').at(-1) ?? null, transportFailure: /ECONNRESET|TRANSPORT|fetch failed|socket hang up/i.test(stdout + stderr), home }
  records.push(record); writeFileSync(path.join(out, 'm0-agent-results.json'), scrub(JSON.stringify(records, null, 2))); console.log(scrub(JSON.stringify(record)))
  return record
}
const first = await run(true)
// Stop condition: one core-only probe classifies pre-tool or transport failure;
// no host/profile/third-party investigation beyond this point.
if (first.transportFailure || (first.toolCalls === 0 && first.exitCode !== 0)) await run(false)
