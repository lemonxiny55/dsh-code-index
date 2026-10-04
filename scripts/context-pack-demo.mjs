// Record actual local tool calls; no model, fake card, or invented output.
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { tools } from '../dist/index.js'

const root = await mkdtemp(path.join(os.tmpdir(), 'cix-demo-'))
const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' })
const frames = []
const started = Date.now()
const record = text => frames.push([(Date.now() - started) / 1000, 'o', text.replace(/\n/g, '\r\n')])
const waitUntil = async seconds => new Promise(resolve => setTimeout(resolve, Math.max(0, seconds * 1000 - (Date.now() - started))))
try {
  await mkdir(path.join(root, 'src')); await mkdir(path.join(root, 'tests'))
  await writeFile(path.join(root, 'src/config.ts'), 'export function loadConfig(input: string) {\n  return input.trim()\n}\nexport function removed() { return 0 }\n')
  await writeFile(path.join(root, 'src/startup.ts'), "import { loadConfig } from './config'\nexport function startup() { return loadConfig(' input ') }\n")
  await writeFile(path.join(root, 'tests/config.spec.ts'), "import { loadConfig } from '../src/config'\ntest('whitespace', () => loadConfig(' input '))\n")
  git('init', '-q'); git('config', 'user.email', 'demo@example.invalid'); git('config', 'user.name', 'Context Pack demo')
  git('add', '.'); git('commit', '-qm', 'demo baseline')
  const tool = tools.find(tool => tool.name === 'code_context')
  record('dsh-code-index v0.9.0 — actual local tool calls\nClean Git repository: loadConfig, startup, related test\n')
  await waitUntil(3)
  record('\n> code_context({ task: "Explain loadConfig", budgetChars: 5000 })\n')
  const first = await tool.execute({ task: 'Explain loadConfig', repoRoot: root }, {})
  record(first + '\n')
  await waitUntil(13)
  record('\x1b[2J\x1b[HExternal edit: modify loadConfig, remove removed, add betaCaller\n')
  await writeFile(path.join(root, 'src/config.ts'), "export function loadConfig(input: string) {\n  return input.toUpperCase()\n}\nexport function betaCaller() { return loadConfig('beta') }\n")
  record('\n> code_context({ task: "Review current changes", outputFormat: "pack" })\n')
  const pack = await tool.execute({ task: 'Review current changes', repoRoot: root, outputFormat: 'pack' }, {})
  record(tool.output.render({}, pack).map(block => block.text ?? '').join('\n') + '\n')
  await waitUntil(23)
  record('\x1b[2J\x1b[H> code_context({ task: "Explain loadConfig", budgetChars: 500 })\n')
  const bounded = await tool.execute({ task: 'Explain loadConfig', repoRoot: root, budgetChars: 500 }, {})
  record(bounded + '\n\nActual text length: ' + bounded.length + ' / 500\n')
  await waitUntil(30)
  record('\nDemo complete. No publishing, model calls, or external API key.\n')
  await mkdir(new URL('../assets/', import.meta.url), { recursive: true })
  await writeFile(new URL('../assets/context-pack-demo.cast', import.meta.url),
    [JSON.stringify({ version: 2, width: 110, height: 36, timestamp: Math.floor(started / 1000), title: 'Edit-ready Context Packs — real local calls' }), ...frames.map(frame => JSON.stringify(frame))].join('\n') + '\n')
  const replay = { duration: frames.at(-1)[0], frames }
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Context Pack · 30-second local demo</title>
<style>body{background:#10151e;color:#e2e8f0;font:15px system-ui;max-width:1000px;margin:30px auto;padding:0 20px}button{padding:8px 16px;margin-right:12px}pre{background:#19212d;padding:20px;white-space:pre-wrap;overflow:auto;height:65vh;font:13px/1.5 monospace}small{color:#a8b3c5}</style>
<h1>Edit-ready Context Packs</h1><p>Recorded real local calls · no DSH Web Card · no model/API request</p><button id="play">Replay 30 seconds</button><span id="time"></span><pre id="terminal"></pre><small>Reproduce with node scripts/context-pack-demo.mjs after building. Output is recorded, not live.</small>
<script>const recording=${JSON.stringify(replay).replace(/</g, '\\u003c')};let timer;function run(){clearInterval(timer);let start=performance.now(),next=0;terminal.textContent='';timer=setInterval(()=>{let elapsed=(performance.now()-start)/1000;while(next<recording.frames.length&&recording.frames[next][0]<=elapsed){let text=recording.frames[next++][2];if(text.includes('\\x1b[2J\\x1b[H')){terminal.textContent='';text=text.replace('\\x1b[2J\\x1b[H','')}terminal.textContent+=text;terminal.scrollTop=terminal.scrollHeight}time.textContent=Math.min(30,elapsed).toFixed(1)+' / 30 s';if(next===recording.frames.length)clearInterval(timer)},100)}play.onclick=run;run();</script></html>`
  await writeFile(new URL('../assets/context-pack-demo.html', import.meta.url), html)
  console.log(`Recorded ${replay.duration.toFixed(1)}s demo; text ${bounded.length}/500; pack ${JSON.stringify(pack).length}/5000.`)
} finally { await rm(root, { recursive: true, force: true }) }
