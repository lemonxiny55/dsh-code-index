import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { XRAY_LIMITS, type ImpactXray, type XrayEvidence, type XrayEdge, type XrayNode } from '../impact-xray-model.js'
import { FALLBACK_LOCALE, xrayTranslator, type XrayLocaleStore, type XrayTranslate } from './xray-locales.js'

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const string = (v: unknown): v is string => typeof v === 'string' && v.length <= 4096
const line = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 1
const label = (v: unknown): boolean => v === 'exact' || v === 'import-scoped' || v === 'name-only'
const evidence = (v: unknown): boolean => record(v) && string(v.file) && line(v.line) && line(v.startLine) &&
  (v.side === 'current' || v.side === 'base') && (v.ref === undefined || string(v.ref)) &&
  (v.type === undefined || string(v.type) && ['declaration', 'call-site', 'import-site', 'test-lead', 'unmapped-change'].includes(v.type)) &&
  (v.code === undefined || typeof v.code === 'string' && v.code.length <= XRAY_LIMITS.evidenceChars) && (v.gap === undefined || string(v.gap))

/** Persisted results are untrusted input; reject malformed or oversized graphs. */
export function asImpactXray(v: unknown): ImpactXray | null {
  if (!record(v) || v.card !== 'impact-xray' || (v.version !== 1 && v.version !== 2) || !string(v.root) ||
    !string(v.source) || !['git', 'diff', 'files', 'symbols'].includes(v.source) || typeof v.truncated !== 'boolean') return null
  if (!Array.isArray(v.nodes) || v.nodes.length > XRAY_LIMITS.nodes || !Array.isArray(v.edges) || v.edges.length > XRAY_LIMITS.edges ||
    !Array.isArray(v.gaps) || v.gaps.length > 24 || !v.gaps.every(string)) return null
  if (!v.nodes.every(n => record(n) && string(n.id) && string(n.name) && string(n.kind) && string(n.file) && line(n.line) &&
    typeof n.changed === 'boolean' && string(n.reason) && evidence(n.evidence) &&
    (n.category === undefined || string(n.category) && ['change', 'caller', 'impact', 'module', 'test'].includes(n.category)) &&
    (n.resolution === undefined || label(n.resolution)) && (n.change === undefined || string(n.change)) &&
    (n.depth === undefined || Number.isInteger(n.depth) && Number(n.depth) >= 0 && Number(n.depth) <= 6))) return null
  const ids = new Set(v.nodes.map(n => n.id))
  if (ids.size !== v.nodes.length || !v.edges.every(e => record(e) && string(e.id) && ids.has(e.from) && ids.has(e.to) &&
    label(e.resolution) && string(e.reason) && evidence(e.evidence) && (e.kind === undefined || e.kind === 'call' || e.kind === 'import'))) return null
  const edgeIds = new Set(v.edges.map(e => e.id))
  if (edgeIds.size !== v.edges.length) return null
  if (!Array.isArray(v.tests) || v.tests.length > 8 || !v.tests.every(t => record(t) && string(t.file) && string(t.reason) && label(t.resolution) &&
    (t.nodeId === undefined || ids.has(t.nodeId)))) return null
  if (!Array.isArray(v.imports) || v.imports.length > 8 || !v.imports.every(i => record(i) && string(i.file) && string(i.changedFile) && string(i.specifier) &&
    i.resolution === 'import-scoped' && (i.edgeId === undefined || edgeIds.has(i.edgeId)))) return null
  if (v.paths !== undefined && (!Array.isArray(v.paths) || v.paths.length > XRAY_LIMITS.paths || !v.paths.every(p => record(p) && string(p.id) &&
    string(p.from) && string(p.to) && label(p.resolution) && typeof p.omitted === 'boolean' && Array.isArray(p.edgeIds) && p.edgeIds.length <= 6 && p.edgeIds.every(id => edgeIds.has(id))))) return null
  if (v.unmapped !== undefined && (!Array.isArray(v.unmapped) || v.unmapped.length > 8 || !v.unmapped.every(u => record(u) && string(u.file) &&
    string(u.reason) && (u.side === 'base' || u.side === 'current') && evidence(u.evidence) && Array.isArray(u.ranges) && u.ranges.length <= 16 &&
    u.ranges.every(r => record(r) && line(r.startLine) && line(r.endLine) && r.endLine >= r.startLine)))) return null
  if (v.bounds !== undefined && (!record(v.bounds) || typeof v.bounds.projection !== 'boolean' || !record(v.bounds.analysis) || !record(v.bounds.totals) ||
    !['callers', 'dependents', 'paths', 'impact', 'tests'].every(k => typeof (v.bounds as Record<string, Record<string, unknown>>).analysis[k] === 'boolean') ||
    !['changed', 'callers', 'impact', 'imports', 'tests', 'paths', 'unmapped'].every(k => Number.isSafeInteger((v.bounds as Record<string, Record<string, unknown>>).totals[k]) && Number((v.bounds as Record<string, Record<string, unknown>>).totals[k]) >= 0))) return null
  return v as unknown as ImpactXray
}

export function sourcePath(root: string, file: string): string | null {
  const base = root.replace(/\\/g, '/'), relative = file.replace(/\\/g, '/')
  if (!(/^[A-Za-z]:\//.test(base) || base.startsWith('/')) || !relative || /[\u0000-\u001f]/.test(base + relative) ||
    relative.startsWith('/') || relative.split('/').some(part => part === '..') || relative.includes(':')) return null
  return `${base.replace(/\/$/, '')}/${relative}`
}
type OpenFile = (path: string, options?: unknown) => unknown
type Selection = { type: 'node' | 'edge' | 'unmapped'; id: string }
const CSS = `
.ix-dialog{width:min(1180px,96vw);max-width:96vw;max-height:90vh;padding:0;border:0;border-radius:12px;background:#161b24;color:#e7edf5;overflow:auto}.ix-dialog::backdrop{background:#000b}.ix-dialog .ix{min-height:70vh}.ix-dialog .ix-workspace{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:16px}.ix-dialog .ix-evidence{grid-column:2;grid-row:1}.ix-dialog .ix-relations{grid-column:1;grid-row:1}.ix-dialog .ix .pane{max-height:420px}.ix-dialog .ix .graph{max-height:410px}.ix-dialog .ix .code{max-height:240px}@media(max-width:750px){.ix-dialog .ix-workspace{display:block}}
.ix{border:1px solid var(--dsw-alias-border-l2,#455164);border-radius:12px;background:var(--dsw-alias-bg-layer-2,#161b24);color:var(--dsw-alias-label-primary,#e7edf5);font:12px/1.5 system-ui,sans-serif;padding:12px;overflow-wrap:anywhere;container-type:inline-size}
.ix *{box-sizing:border-box}.ix h3,.ix p{margin:0 0 7px}.ix h3{font-size:17px}.ix small,.ix .muted{opacity:.72}.ix button,.ix select{font:inherit;color:inherit;border:1px solid var(--dsw-alias-border-l2,#4c586a);border-radius:6px;background:var(--dsw-alias-bg-layer-3,#253042);padding:4px 7px;cursor:pointer}.ix button:disabled{opacity:.35;cursor:default}.ix button:hover:not(:disabled),.ix button[aria-pressed=true]{border-color:#65baf2;background:var(--dsw-alias-bg-layer-1,#33465b)}.ix button:focus-visible,.ix select:focus-visible{outline:2px solid #65baf2;outline-offset:2px}.ix .bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:8px 0}.ix .badge{font-size:10px;border-radius:4px;padding:1px 4px;background:#374151;color:#fff;white-space:nowrap}.ix .low{color:#e7b852}.ix .pane{border:1px solid var(--dsw-alias-border-l2,#455164);border-radius:8px;padding:9px;margin:8px 0;max-height:250px;overflow:auto}.ix .code{font:11px/1.6 var(--dsh-mono-font,monospace);white-space:pre-wrap;margin:8px 0;max-height:130px;overflow:auto}.ix .code span{display:block}.ix .code .focus{background:#28475b66}.ix .lane{display:grid;grid-template-columns:minmax(0,1fr) 100px minmax(0,1fr);align-items:center;gap:6px;margin:8px 0}.ix .node{text-align:left;min-height:45px;min-width:0;overflow:hidden}.ix .node.changed{border-left:3px solid #f49b5c}.ix .node small{display:block;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ix .edge{border:0;background:none!important;padding:0;display:flex;flex-direction:column;align-items:center}.ix .edge svg{width:100%;height:20px}.ix .edge small{font-size:9px}.ix .graph{max-height:310px;overflow:auto;padding:0 3px}.ix .notice{border-left:3px solid #e7b852;padding:5px 8px;margin:7px 0}.ix summary{cursor:pointer}.ix .tabs button[aria-pressed=true]{border-bottom:2px solid #65baf2}.ix .chips{display:flex;gap:5px;flex-wrap:wrap}.ix .chips button{text-align:left;max-width:100%}@container(max-width:360px){.ix .lane{grid-template-columns:minmax(0,1fr) 72px minmax(0,1fr)}.ix .node{font-size:11px;padding:4px}.ix .edge small{font-size:8px}}
`

function Evidence({ value, root, openFile, t }: { value: XrayEvidence; root: string; openFile?: OpenFile; t: XrayTranslate }): ReactNode {
  const [failed, setFailed] = useState(false)
  const path = sourcePath(root, value.file)
  const canOpen = value.side === 'current' && path && openFile && value.code !== undefined
  return <>
    <p><strong>{value.file}:{value.line}</strong> · {t(value.side)}{value.ref ? ` @ ${value.ref}` : ''}</p>
    <small>{t('evidenceType')}: {t(value.type ?? 'declaration')}</small>
    {value.code !== undefined ? <pre className="code">{value.code.split('\n').map((code, i) => <span className={value.startLine + i === value.line ? 'focus' : ''} key={i}>{value.startLine + i}  {code}</span>)}</pre> : <p className="notice" role="status">{t(value.gap ?? 'missing')}</p>}
    <p className="muted">{t('snapshot')}</p>
    {canOpen ? <button type="button" onClick={() => { setFailed(false); try { Promise.resolve(openFile(path, { line: value.line })).catch(() => setFailed(true)) } catch { setFailed(true) } }}>{t('open', { line: value.line })}</button> : <small>{t('noOpen')}</small>}
    {failed ? <p role="alert">{t('openFailed')}</p> : null}
  </>
}

export function ImpactXrayCard({ view, openFile, localeStore = FALLBACK_LOCALE, rawText = '' }: { view: ImpactXray; openFile?: OpenFile; localeStore?: XrayLocaleStore; rawText?: string }): ReactNode {
  const active = useSyncExternalStore(localeStore.subscribe, localeStore.getSnapshot, localeStore.getSnapshot)
  const [language, setLanguage] = useState<string | null>(null)
  const t = xrayTranslator(language ?? active)
  const [tab, setTab] = useState('calls'), [visible, setVisible] = useState(6), [confidence, setConfidence] = useState('all'), [depth, setDepth] = useState(6)
  const [pathId, setPathId] = useState<string | null>(null)
  const [history, setHistory] = useState<Selection[]>(view.nodes[0] ? [{ type: 'node', id: view.nodes[0].id }] : [])
  const [cursor, setCursor] = useState(view.nodes.length ? 0 : -1), [showEvidence, setShowEvidence] = useState(true)
  const pane = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (focused && dialog.current && !dialog.current.open) dialog.current.showModal() }, [focused])
  const byId = useMemo(() => new Map(view.nodes.map(n => [n.id, n])), [view])
  const selected = history[cursor]
  const selectedNode = selected?.type === 'node' ? byId.get(selected.id) : undefined
  const selectedEdge = selected?.type === 'edge' ? view.edges.find(e => e.id === selected.id) : undefined
  const unmapped = selected?.type === 'unmapped' ? view.unmapped?.[Number(selected.id)] : undefined
  const selectedEvidence = selectedNode?.evidence ?? selectedEdge?.evidence ?? unmapped?.evidence
  const pick = (type: Selection['type'], id: string): void => {
    setHistory(h => [...h.slice(0, cursor + 1), { type, id }].slice(-32)); setCursor(Math.min(cursor + 1, 31)); setShowEvidence(true)
    requestAnimationFrame(() => pane.current?.scrollIntoView({ block: 'nearest' }))
  }
  const path = view.paths?.find(p => p.id === pathId)
  const filtered = view.edges.filter(e => (tab === 'imports' ? e.kind === 'import' : e.kind !== 'import') &&
    (confidence === 'all' || e.resolution === confidence) && (byId.get(e.from)?.depth ?? 1) <= depth && (!path || path.edgeIds.includes(e.id)))
  const nodeButton = (n: XrayNode): ReactNode => <button type="button" key={n.id} className={`node ${n.changed ? 'changed' : ''}`} aria-pressed={selectedNode?.id === n.id} onClick={() => pick('node', n.id)}>
    {n.name}<small>{n.file}:{n.line}</small><span className="badge">{t(n.category ?? (n.changed ? 'change' : 'caller'))}</span>
  </button>
  const graph = <>
    <div className="bar"><label>{t('depth')} <select aria-label={t('depth')} value={depth} onChange={e => setDepth(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6].map(d => <option key={d}>{d}</option>)}</select></label>
      <select aria-label={t('all')} value={confidence} onChange={e => setConfidence(e.target.value)}><option value="all">{t('all')}</option>{['exact', 'import-scoped', 'name-only'].map(s => <option value={s} key={s}>{t(s)}</option>)}</select>
      <button type="button" onClick={() => { setDepth(6); setConfidence('all'); setPathId(null); setVisible(6) }}>{t('reset')}</button>
    </div>
    <small>{t('rows', { shown: Math.min(visible, filtered.length), total: filtered.length })}</small>
    <div className="graph" aria-label={t(tab === 'imports' ? 'imports' : 'calls')}>
      {filtered.slice(0, visible).map(e => <div className="lane" key={e.id}>
        {nodeButton(byId.get(e.from)!)}
        <button type="button" className={`edge ${e.resolution === 'name-only' ? 'low' : ''}`} aria-pressed={selectedEdge?.id === e.id} aria-label={`${t('inspect')}: ${byId.get(e.from)!.name} → ${byId.get(e.to)!.name} · ${e.resolution}`} onClick={() => pick('edge', e.id)}>
          <small>{e.resolution}</small><svg viewBox="0 0 100 20" aria-hidden="true"><path d="M 2 10 H 88" stroke={e.resolution === 'name-only' ? '#e7b852' : '#65baf2'} strokeWidth="2" strokeDasharray={e.resolution === 'exact' ? undefined : e.resolution === 'name-only' ? '2 5' : '9 5'} /><path d="M 87 5 L 96 10 L 87 15" fill="none" stroke="#65baf2" strokeWidth="2" /></svg><small>{t(e.kind ?? 'call')}</small>
        </button>{nodeButton(byId.get(e.to)!)}</div>)}
      {!filtered.length ? <p role="status">{t(view.nodes.length ? 'noMatch' : 'empty')}</p> : null}
    </div>
    <div className="bar">{visible < filtered.length ? <button type="button" onClick={() => setVisible(v => v + 6)}>{t('expand')} (+6)</button> : null}{visible > 6 ? <button type="button" onClick={() => setVisible(6)}>{t('collapse')}</button> : null}</div>
  </>
  const card = <section className="ix" aria-label="Impact X-Ray"><style>{CSS}</style>
    <div className="bar"><h3>Impact X-Ray</h3><button type="button" aria-label="English" onClick={() => setLanguage('en')}>EN</button><button type="button" aria-label="简体中文" onClick={() => setLanguage('zh')}>简体中文</button><button type="button" onClick={() => setFocused(v => !v)}>{t(focused ? 'closeView' : 'focusView')}</button></div>
    <p>{t('subtitle')}</p><small>{t('potential')} · {t('source')}: {t(view.source)} · {t('nodes', { count: view.nodes.length })}</small>
    {view.version === 1 ? <p className="notice">{t('saved')}</p> : null}
    {view.truncated ? <p className="notice">{t('displayCut')}</p> : null}
    <div className="ix-workspace"><div className="ix-evidence">
    <div className="bar"><strong>{t('inspect')}</strong><button type="button" aria-label={t('back')} disabled={cursor <= 0} onClick={() => setCursor(c => c - 1)}>←</button><button type="button" aria-label={t('forward')} disabled={cursor >= history.length - 1} onClick={() => setCursor(c => c + 1)}>→</button><button type="button" onClick={() => setShowEvidence(v => !v)}>{t(showEvidence ? 'collapse' : 'expand')}</button></div>
    {showEvidence ? <div className="pane" ref={pane} aria-live="polite">
      <p><strong>{selectedNode?.name ?? (selectedEdge ? `${byId.get(selectedEdge.from)?.name} → ${byId.get(selectedEdge.to)?.name}` : unmapped?.file ?? t('inspect'))}</strong></p>
      {selectedEdge || selectedNode ? <p>{t('reason')}: {t(selectedEdge?.reason ?? selectedNode!.reason)} {selectedNode?.change ? `· ${t(selectedNode.change)}` : ''} {selectedEdge?.resolution || selectedNode?.resolution ? `· ${t(selectedEdge?.resolution ?? selectedNode!.resolution!)}` : ''}</p> : null}
      {selectedEvidence ? <Evidence key={`${selected?.type}:${selected?.id}`} value={selectedEvidence} root={view.root} openFile={openFile && focused ? (file, options) => Promise.resolve(openFile(file, options)).then(() => setFocused(false)) : openFile} t={t} /> : <p>{t('missing')}</p>}
    </div> : null}
    </div><div className="ix-relations"><div className="bar tabs" role="group">{['calls', 'imports', 'tests', 'paths', 'gaps'].map(key => <button type="button" key={key} aria-pressed={tab === key} onClick={() => { setTab(key); setVisible(6); if (key !== 'calls') setPathId(null) }}>{t(key)}</button>)}</div>
    {tab === 'calls' ? <><small>{t('changed')}</small><div className="chips">{view.nodes.filter(n => n.changed && n.kind !== 'module').map(nodeButton)}</div><p className="muted">{t('legend')}</p>{graph}</> : null}
    {tab === 'imports' ? <><p className="muted">{t('legend')}</p>{graph}{view.imports.filter(i => !i.edgeId).map((i, n) => <p className="notice" key={n}>{i.file} → {i.changedFile} · {t('import-site-unavailable')}</p>)}</> : null}
    {tab === 'tests' ? <><p>{t('testCaveat')}</p>{!view.tests.length ? <p>{t('noTests')}</p> : view.tests.map((test, i) => <div className="bar" key={i}>
      {test.nodeId && byId.has(test.nodeId) ? nodeButton(byId.get(test.nodeId)!) : <span>{test.file} · {t('missing')}</span>}<span>{t(test.resolution)} · {t(test.reason)}</span>
    </div>)}</> : null}
    {tab === 'paths' ? <>{!view.paths?.length ? <p>{t('noPaths')}</p> : view.paths.map(p => <div className="pane" key={p.id}><strong>{p.from} → {p.to}</strong><p>{t('pathConfidence')}: {t(p.resolution)}</p>{p.omitted ? <p className="notice">{t('incompletePath')}</p> : null}<div className="bar">{p.edgeIds.map((id, i) => <button type="button" key={`${id}:${i}`} onClick={() => pick('edge', id)}>{t('pathStep', { step: i + 1, total: p.edgeIds.length })}</button>)}<button type="button" disabled={p.omitted} onClick={() => { setPathId(p.id); setTab('calls'); setVisible(48); setConfidence('all'); setDepth(6) }}>{t('calls')}</button></div></div>)}</> : null}
    {tab === 'gaps' ? <><h4>{t('unmapped')}</h4>{view.unmapped?.map((u, i) => <div key={i}><button type="button" onClick={() => pick('unmapped', String(i))}>{u.file} · {t(u.side)}</button><p>{t(u.reason)} · {t('ranges')}: {u.ranges.map(r => `${r.startLine}–${r.endLine}`).join(', ')}</p></div>)}
      {view.bounds && Object.values(view.bounds.analysis).some(Boolean) ? <p className="notice">{t('analysisCut')}: {Object.entries(view.bounds.analysis).filter(([, v]) => v).map(([k]) => t(k)).join(', ')}</p> : null}
      {view.bounds?.projection ? <p className="notice">{t('displayCut')}</p> : null}{view.bounds?.text ? <p>{t('textCut')}</p> : null}
      {view.gaps.map((gap, i) => <p className="notice" key={i}>{t(gap)}</p>)}<p>{t('caveat')}</p></> : null}
    </div></div><details><summary>{t('uncertain')}</summary><p>{t('caveat')}</p></details>
    {rawText ? <details><summary>{t('raw')}</summary><pre className="code">{rawText}</pre></details> : null}
  </section>
  return focused ? <dialog className="ix-dialog" ref={dialog} aria-label="Impact X-Ray" onClose={() => setFocused(false)}>{card}</dialog> : card
}

export function XrayFallback({ loading, text, localeStore = FALLBACK_LOCALE }: { loading: boolean; text: string; localeStore?: XrayLocaleStore }): ReactNode {
  const active = useSyncExternalStore(localeStore.subscribe, localeStore.getSnapshot, localeStore.getSnapshot), t = xrayTranslator(active)
  return <section className="ix" role={loading ? 'status' : 'alert'}><style>{CSS}</style><h3>Impact X-Ray</h3><p>{t(loading ? 'loading' : 'error')}</p>{!loading ? <><p>{t('fallback')}</p><pre className="code">{text}</pre></> : null}</section>
}
