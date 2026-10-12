import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { extractAll, languageForFile } from '../src/extract.js'
import { buildIndex, buildIndexWithCache } from '../src/buildIndex.js'
import { buildReferenceGraph, symbolRefs } from '../src/refgraph.js'
import { resolveImportDetailed } from '../src/repomap.js'
import { buildTaskContext } from '../src/context.js'
import { renderContextPack } from '../src/context-pack.js'
import { buildChangeContext } from '../src/change-context.js'
import { indexIntegrityWarnings } from '../src/integrity.js'
import { RepoContextManager } from '../src/repo-context.js'
import { activateRepoContextManager, clearRepoContextManager, tools } from '../src/tools.js'
import type { RepoIndex } from '../src/types.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function repo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-arkts-')); roots.push(root)
  await mkdir(path.join(root, '.git'))
  for (const [file, code] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), code)
  }
  return root
}
const component = `@Component
export struct Card {
  @State title: string = 'ArkTS';
  @Builder
  heading() { Text(this.title).fontSize(20) }
  build() {
    Column() {
      this.heading()
      Text(this.title).fontSize(20)
    }.width('100%')
  }
}`
const page = `import { Card as Panel } from './Card'
import { label } from './logic'
@Entry
@ComponentV2
struct Index {
  @Local count: number = 0;
  build() {
    Column() {
      Panel({ title: label(this.count) })
      Text('hello').fontSize(20)
    }
  }
}`

describe('ArkTS grammar and extraction', () => {
  it('pins the licensed WASM and identifies .ets independently from TS', async () => {
    const bytes = await readFile('grammars/tree-sitter-arkts.wasm')
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('a5fbf24b2eeab43cf60e9fcdbde99e9089f7ceae43134d24e1d5cc166d285446')
    expect(await readFile('grammars/ARKTS-LICENSE', 'utf8')).toContain('Copyright (c) 2026-present richerfu')
    expect(languageForFile('Page.ETS')).toBe('arkts')
    expect(languageForFile('Page.ts')).toBe('typescript')
  })

  it('parses every pinned official sample without repairing sources', async () => {
    const manifest = JSON.parse(await readFile('tests/fixtures/arkts/official/provenance.json', 'utf8')) as Array<{ file: string; sha256: string }>
    expect(manifest).toHaveLength(22)
    for (const row of manifest) {
      const file = row.file.startsWith('device/Browser/') ? 'browser/' + row.file.slice('device/Browser/'.length) : 'local/' + row.file
      const code = await readFile('tests/fixtures/arkts/official/' + file, 'utf8')
      expect(createHash('sha256').update(code).digest('hex'), file).toBe(row.sha256)
      const result = await extractAll(code, languageForFile(file)!, file)
      expect(result.diagnostic, file).toEqual({ status: 'parsed', errorCount: 0, missingCount: 0, issues: [] })
    }
  })

  it('extracts struct, decorated methods and fields with accurate owner/ranges', async () => {
    const { symbols, diagnostic } = await extractAll(component, 'arkts', 'Card.ets')
    expect(diagnostic.status).toBe('parsed')
    expect(symbols.map(s => s.name)).toEqual(['Card', 'title', 'heading', 'build'])
    expect(symbols[0]).toMatchObject({ kind: 'class', exported: true, line: 1, endLine: 12, signature: 'struct Card', decorators: ['@Component'] })
    expect(symbols[1]).toMatchObject({ kind: 'field', exported: false, decorators: ['@State'], line: 3, scope: [{ kind: 'class', name: 'Card', ordinal: 1 }] })
    expect(symbols[2]).toMatchObject({ kind: 'method', line: 4, endLine: 5, decorators: ['@Builder'], signature: 'heading()' })
    const moved = await extractAll('// moved\n\n'+component.replace("'ArkTS'", "'changed'"), 'arkts', 'Card.ets')
    expect(moved.symbols.map(s => s.id)).toEqual(symbols.map(s => s.id))
    expect(moved.symbols[0].line).toBe(3)
  })

  it('indexes TS-style declarations and global decorated Builders', async () => {
    const code = `import { label as text } from './logic'
export interface Item { name: string }
export type Id = number
export enum Mode { On, Off }
export class Service { run() { return text(1) } }
export const seed = 1
@Builder
export function Heading() { Column() { Text('hi') } }
export function logic(x: number) { const local = x; return local + seed }
`
    const result = await extractAll(code, 'arkts', 'logic.ets')
    expect(result.diagnostic.status).toBe('parsed')
    expect(result.symbols.map(s=>s.name)).toEqual(['Item','Id','Mode','Service','run','seed','Heading','logic'])
    expect(result.symbols.find(s=>s.name==='Heading')).toMatchObject({ exported: true, decorators: ['@Builder'], line: 7 })
    expect(result.symbols.find(s=>s.name==='run')!.exported).toBe(false)
    expect(result.importDetails[0].bindings[0]).toMatchObject({ imported: 'label', local: 'text' })
  })

  it('reports partial/failed syntax and suppresses unreliable component owners', async () => {
    const partial = await extractAll('export function safe() {}\n@Component\nstruct Broken { build() { Column() { Text( } } }', 'arkts', 'Broken.ets')
    expect(partial.diagnostic.status).toBe('partial')
    expect(partial.diagnostic.errorCount + partial.diagnostic.missingCount).toBeGreaterThan(0)
    expect(partial.diagnostic.issues.length).toBeLessThanOrEqual(3)
    expect(partial.symbols.map(s=>s.name)).toEqual(['safe'])
    const failed = await extractAll('@Component\nstruct Broken { build() {', 'arkts')
    expect(failed.diagnostic.status).toBe('failed')
    expect(failed.symbols).toEqual([])
  })

  it('preserves @Extend metadata but excludes decorators and leading-dot attributes from references', async () => {
    const result=await extractAll('@Extend(Text) function fancy() { .fontSize(size()).fontColor(Color.Red) }','arkts','styles.ets')
    expect(result.diagnostic.status).toBe('parsed')
    expect(result.symbols[0].decorators).toEqual(['@Extend(Text)'])
    expect(result.calls.map(call=>call.name)).toEqual(['size'])
  })

  it('keeps duplicate components/methods and non-ASCII source lines structurally distinct', async () => {
    const code='// 中文注释\n@Component\nstruct A { @State title: string = "你好"; build() { Text(this.title) } }\n@Component\nstruct B { build() { Text("🙂") } }'
    const result=await extractAll(code,'arkts','中文.ets')
    const methods=result.symbols.filter(s=>s.name==='build')
    expect(new Set(methods.map(s=>s.id)).size).toBe(2)
    expect(methods.map(s=>s.scope[0].name)).toEqual(['A','B'])
    expect(methods.map(s=>s.line)).toEqual([3,5])
  })
})

describe('ArkTS trustworthy relationships/context', () => {
  async function mixed(): Promise<RepoIndex> {
    const root = await repo({ 'Card.ets': component, 'Index.ets': page, 'logic.ts': 'export function label(n: number) { return n.toString() }',
      'other.ets': '@Component\nexport struct Card { build() { Text("other") } }\nexport function Text() {}\nexport function fontSize() {}\nexport function Column() {}',
      'tests/Card.spec.ets': "import { Card } from '../Card'\nexport function cardTest() { return new Card() }" })
    return buildIndex(root)
  }

  it('resolves explicit mixed imports, keeps aliases, and excludes built-ins/modifiers', async () => {
    const index = await mixed(), graph = buildReferenceGraph(index)
    const edges = [...graph.outgoing.values()].flat().concat(graph.moduleLevelEdges)
    expect(edges.find(e=>e.name==='Panel')).toMatchObject({ resolution:'exact', provenance:'explicit-import-binding', targetId:index.files.find(f=>f.path==='Card.ets')!.symbols[0].id })
    expect(edges.find(e=>e.name==='label')).toMatchObject({ resolution:'exact', provenance:'explicit-import-binding' })
    expect(edges.filter(e=>['Text','Column','fontSize','width'].includes(e.name))).toEqual([])
    expect(index.files.find(f=>f.path==='Index.ets')!.calls!.some(c=>c.name==='fontSize')).toBe(false)
    const refs = symbolRefs(index, 'Card')
    expect(refs.callers.some(c=>c.file==='Index.ets')).toBe(true)
    expect(symbolRefs(index,'Text').callers).toEqual([])
    expect(symbolRefs(index,'build').callees.find(c=>c.name==='Text')?.targets).toEqual([])
  })

  it('does not resolve same-named UI calls without bindings or ambiguous ETS/TS stems', async () => {
    const index=await mixed()
    const unbound=await extractAll('@Component\nstruct Other { build() { Card() } }','arkts','Unbound.ets')
    index.files.push({path:'Unbound.ets',lang:'arkts',mtimeMs:0,...unbound})
    const graph=buildReferenceGraph(index)
    expect([...graph.outgoing.values()].flat().some(edge=>edge.callSite.file==='Unbound.ets')).toBe(false)
    expect(resolveImportDetailed('./Thing','Index.ets',new Set(['Thing.ets','Thing.ts']))).toMatchObject({target:null})
    expect(resolveImportDetailed('./Thing.ets','Index.ts',new Set(['Thing.ets','Thing.ts']))).toMatchObject({target:'Thing.ets',suffixSkipped:false})
    expect(resolveImportDetailed('@kit.ArkUI','Index.ets',new Set(['@kit.ArkUI.ts']))).toMatchObject({target:null})
  })

  it('resolves TS to ETS named imports while default aliases remain import-scoped', async () => {
    const root=await repo({'Card.ets':component,'caller.ts':"import { Card } from './Card'\nexport function create() { return new Card() }",'default.ets':"import Whatever from './Card'\n@Component struct Index { build() { Whatever() } }"})
    const graph=buildReferenceGraph(await buildIndex(root))
    const edges=[...graph.outgoing.values()].flat()
    expect(edges.find(edge=>edge.name==='Card')).toMatchObject({resolution:'exact',provenance:'explicit-import-binding'})
    expect(edges.find(edge=>edge.name==='Whatever')).toMatchObject({resolution:'import-scoped',provenance:'explicit-import-binding'})
  })

  it('returns verified decorated source, related tests, provenance and strict text/JSON budgets', async () => {
    const index=await mixed()
    for(const budget of [500, 1500, 5000]) {
      const result=await buildTaskContext(index,'Explain Card.ets Card component and callers',{budgetChars:budget})
      expect(renderContextPack(result.pack).length).toBeLessThanOrEqual(budget)
      expect(JSON.stringify(result.pack).length).toBeLessThanOrEqual(budget)
      for(const item of result.pack.items.filter(item=>item.code!==undefined)) {
        const lines=(await readFile(path.join(index.root,item.file!),'utf8')).split(/\r?\n/)
        expect(item.code).toBe(lines.slice(item.startLine!-1,item.endLine!).join('\n'))
        expect(item.reason.length).toBeGreaterThan(0)
      }
      if(budget===5000){
        expect(result.pack.items.some(item=>item.code?.includes('@Component'))).toBe(true)
        expect(result.pack.items.some(item=>item.file==='tests/Card.spec.ets')).toBe(true)
        expect(result.pack.items.some(item=>item.provenance==='explicit-import-binding')).toBe(true)
      }
    }
  })

  it('maps real git edits/deletes to current/base ETS declarations and related tests', async () => {
    const index=await mixed(), root=index.root
    await rm(path.join(root,'.git'),{recursive:true})
    const git=(...args:string[])=>execFileSync('git',['-C',root,...args])
    git('init','--quiet');git('config','user.name','ArkTS Test');git('config','user.email','arkts@example.invalid');git('add','.');git('commit','--quiet','-m','seed')
    await writeFile(path.join(root,'Card.ets'),component.replace("'ArkTS'","'edited'"))
    await rm(path.join(root,'other.ets'))
    const current=await buildIndex(root)
    const changes=await buildChangeContext(current,{kind:'git',root,baseRef:'HEAD'})
    expect(changes.changed.some(row=>row.symbol.name==='Card'&&row.side==='current'&&row.change==='modified')).toBe(true)
    expect(changes.changed.some(row=>row.symbol.file==='other.ets'&&row.side==='base'&&row.change==='deleted')).toBe(true)
    expect(changes.tests.some(row=>row.file==='tests/Card.spec.ets')).toBe(true)
    expect(changes.directCallers.some(row=>row.symbol.file==='Index.ets'&&row.resolution==='exact')).toBe(true)
  })

  it('keeps bounded incomplete-index diagnostics visible inside small Context Packs', async () => {
    const root=await repo({'Good.ets':component,'Bad.ets':'@Component\nstruct Bad { build() {','Missing.ets':'@Component\nstruct Missing { build() { Text( } } }'})
    const index=await buildIndexWithCache(root)
    expect(indexIntegrityWarnings(index)[0]).toContain('index incomplete')
    expect(index.files.find(file=>file.path==='Bad.ets')!.diagnostic!.status).toBe('failed')
    const cached=await buildIndexWithCache(root)
    expect(indexIntegrityWarnings(cached)).toEqual(indexIntegrityWarnings(index))
    for(const budget of [300,500,5000]) {
      const result=await buildTaskContext(cached,'Explain Card in Good.ets',{budgetChars:budget})
      expect(result.pack.gaps.join(' ')).toContain('index incomplete')
      expect(JSON.stringify(result.pack).length).toBeLessThanOrEqual(budget)
      expect(renderContextPack(result.pack).length).toBeLessThanOrEqual(budget)
    }
  })

  it('refreshes ETS add/edit/delete and whitelist changes through actual tool handlers', async () => {
    const root=await repo({'.gitignore':'/extensions/*\n!/extensions/keep/\n!/extensions/keep/**\n','extensions/keep/Card.ets':component,'extensions/other/Hidden.ets':'export function HIDDEN() {}','Index.ts':'export const CONTROL = 1'})
    const manager=new RepoContextManager({indexOptions:()=>({}),watch:false});activateRepoContextManager(manager)
    const exec={agent:{session:{header:{cwd:root}}}} as never
    const call=(name:string,args:Record<string,unknown>={})=>tools.find(t=>t.name===name)!.execute(args as never,exec)
    try {
      expect(await call('code_index')).toContain('languages:')
      expect(await call('code_symbols',{query:'Card'})).toMatchObject([{file:'extensions/keep/Card.ets',line:1}])
      expect(await call('code_search',{query:'HIDDEN'})).toEqual([])
      expect(await call('code_map')).toContain('struct Card')
      expect(await call('code_refs',{symbol:'Card'})).toContain('Card.ets')
      const source=path.join(root,'extensions/keep/Added.ets')
      await writeFile(source,'export function ARK_ADDED() { return 1 }')
      expect(await call('code_search',{query:'ARK_ADDED'})).toMatchObject([{name:'ARK_ADDED'}])
      await writeFile(source,'export function ARK_EDITED() { return 2 }')
      expect(await call('code_context',{task:'Explain ARK_EDITED'})).toContain('return 2')
      expect(await call('code_search',{query:'ARK_ADDED'})).toEqual([])
      await rm(source)
      expect(await call('code_search',{query:'ARK_EDITED'})).toEqual([])
      await writeFile(path.join(root,'extensions/keep/.gitignore'),'Card.ets\n')
      expect(await call('code_search',{query:'Card'})).toEqual([])
      await rm(path.join(root,'extensions/keep/.gitignore'))
      expect(await call('code_search',{query:'Card'})).toMatchObject([{name:'Card'}])
    } finally {clearRepoContextManager(manager);await manager.dispose()}
  })

  it('observes watcher freshness without reads triggering the scan', async () => {
    const root=await repo({'seed.ts':'export const seed = 1'})
    const manager=new RepoContextManager({indexOptions:()=>({}),debounceMs:30})
    const names=()=>manager.getContext(root)?.index?.files.flatMap(file=>file.symbols.map(s=>s.name))??[]
    try {
      await manager.get(root)
      const watcher=manager.getContext(root)!.watcher!
      if(!(watcher as unknown as {_readyEmitted:boolean})._readyEmitted)await new Promise<void>(resolve=>watcher.once('ready',resolve))
      const file=path.join(root,'Fresh.ets')
      await writeFile(file,'@Component\nstruct Fresh { build() { Text("hi") } }')
      await vi.waitFor(()=>expect(names()).toContain('Fresh'),{timeout:5000})
      await writeFile(file,'@ComponentV2\nstruct Changed { build() { Text("changed") } }')
      await vi.waitFor(()=>{expect(names()).toContain('Changed');expect(names()).not.toContain('Fresh')},{timeout:5000})
      await rm(file)
      await vi.waitFor(()=>expect(names()).not.toContain('Changed'),{timeout:5000})
    } finally {await manager.dispose()}
  })
})
