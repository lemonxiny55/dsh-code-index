import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const consumer = path.resolve(process.argv[2])
const require = createRequire(path.join(consumer, 'package.json'))
const entry = require.resolve('dsh-code-index')
const pkgRoot = path.dirname(path.dirname(entry))
for (const file of ['dist/index.js', 'dist/index.d.ts', 'dist/client.js']) assert.ok(existsSync(path.join(pkgRoot, file)), file)
assert.equal(JSON.parse(readFileSync(path.join(pkgRoot, 'package.json'))).version, '0.11.0')
const plugin = await import(pathToFileURL(entry).href)
const registered = [], disposers = []
plugin.apply({effect(fn) { const d = fn(); if(typeof d === 'function') disposers.push(d) }, tools:{register(t) { registered.push(t.name); return () => {} }}, systemPrompt:{section:() => () => {}}}, {autoInject:false, codeHealth:true})
assert.equal(registered.length, 8)
const {Context} = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)
const {default:ToolRuntime} = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-tools')).href)
const ctx = new Context()
ctx.provide('systemPrompt', {tools:() => () => {}, section:() => () => {}})
const runtime = new ToolRuntime(ctx)
const nativeDisposers = plugin.tools.map(t => runtime.register(t))
async function invoke(name,args) { const r = await runtime.execute({callId:`issue10:${name}`,name,arguments:args,signal:new AbortController().signal}); assert.equal(r.isError,false,JSON.stringify(r.content)); return r }
try {
 const a = path.join(consumer,'repo-a'), b = path.join(consumer,'repo-b')
 for(const [repo,marker] of [[a,'ISSUE10_ALPHA'],[b,'ISSUE10_BETA']]) { mkdirSync(path.join(repo,'.git'),{recursive:true}); writeFileSync(path.join(repo,'marker.ts'),`export function ${marker}() { return 10 }\n`); await invoke('code_index',{action:'build',repoRoot:repo}) }
 assert.equal((await invoke('code_search',{query:'ISSUE10_ALPHA',repoRoot:a})).value[0].name,'ISSUE10_ALPHA')
 assert.deepEqual((await invoke('code_search',{query:'ISSUE10_ALPHA',repoRoot:b})).value,[])
 assert.equal((await invoke('code_search',{query:'ISSUE10_BETA',repoRoot:b})).value[0].name,'ISSUE10_BETA')
 writeFileSync(path.join(a,'fresh.ts'),'export function ISSUE10_FRESH() {}\n')
 assert.equal((await invoke('code_search',{query:'ISSUE10_FRESH',repoRoot:a})).value[0].name,'ISSUE10_FRESH')
 rmSync(path.join(a,'fresh.ts'))
 assert.deepEqual((await invoke('code_search',{query:'ISSUE10_FRESH',repoRoot:a})).value,[])
 assert.match((await invoke('code_change_context',{repoRoot:a,files:['marker.ts']})).value,/CHANGED:/)
 console.log(JSON.stringify({passed:true,method:'Node CLI + installed plugin apply + real dsh-tools ToolRuntime; no Desktop UI',version:'0.11.0',dist:['index.js','index.d.ts','client.js'],registered,checks:['two repositories','switching isolation','external add/delete freshness','change context']},null,2))
} finally { for(const d of [...disposers,...nativeDisposers].reverse()) d(); await ctx.fiber.dispose() }
