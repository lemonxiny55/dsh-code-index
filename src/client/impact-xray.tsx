import { useId, useState, type ReactNode } from 'react'
import type { ImpactXray, XrayEvidence } from '../impact-xray.js'

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const string = (value: unknown): value is string => typeof value === 'string' && value.length <= 4096
const line = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 1
const evidence = (value: unknown): boolean => record(value) && string(value.file) && line(value.line) && line(value.startLine) &&
  (value.side === 'current' || value.side === 'base') && (value.ref === undefined || string(value.ref)) &&
  (value.code === undefined || typeof value.code === 'string' && value.code.length <= 900) &&
  (value.gap === undefined || string(value.gap))

/** Validate persisted metadata before rendering; old/text calls keep their card. */
export function asImpactXray(value: unknown): ImpactXray | null {
  if (!record(value) || value.card !== 'impact-xray' || value.version !== 1 || !string(value.root) ||
    !['git', 'diff', 'files', 'symbols'].includes(String(value.source)) || typeof value.truncated !== 'boolean') return null
  if (!Array.isArray(value.nodes) || value.nodes.length > 20 || !Array.isArray(value.edges) || value.edges.length > 32 ||
    !Array.isArray(value.gaps) || value.gaps.length > 24 || !value.gaps.every(string)) return null
  if (!value.nodes.every(n => record(n) && string(n.id) && string(n.name) && string(n.kind) && string(n.file) && line(n.line) &&
    typeof n.changed === 'boolean' && string(n.reason) && evidence(n.evidence))) return null
  const ids = new Set(value.nodes.map(n => n.id))
  if (ids.size !== value.nodes.length || !value.edges.every(e => record(e) && string(e.id) && ids.has(e.from) && ids.has(e.to) &&
    ['exact', 'import-scoped', 'name-only'].includes(String(e.resolution)) && string(e.reason) && evidence(e.evidence))) return null
  if (!Array.isArray(value.tests) || value.tests.length > 8 || !value.tests.every(t => record(t) && string(t.file) && string(t.reason) &&
    ['exact', 'import-scoped', 'name-only'].includes(String(t.resolution)))) return null
  if (!Array.isArray(value.imports) || value.imports.length > 8 || !value.imports.every(i => record(i) && string(i.file) &&
    string(i.changedFile) && string(i.specifier) && i.resolution === 'import-scoped')) return null
  return value as unknown as ImpactXray
}

export function sourcePath(root: string, file: string): string | null {
  const base = root.replace(/\\/g, '/')
  const relative = file.replace(/\\/g, '/')
  if (!(/^[A-Za-z]:\//.test(base) || base.startsWith('/')) || /[\u0000-\u001f]/.test(base + relative) ||
    relative.startsWith('/') || relative.split('/').some(part => part === '..') || relative.includes(':')) return null
  return `${base.replace(/\/$/, '')}/${relative}`
}

function Evidence(props: { value: XrayEvidence; root: string; openFile?: (path: string, options?: unknown) => void }): ReactNode {
  const { value, root, openFile } = props
  const path = sourcePath(root, value.file)
  return <div>
    <div>{value.file}:{value.line} · {value.side}{value.ref ? ` @ ${value.ref}` : ''}</div>
    <p style={{ opacity: .7 }}>Source snapshot captured with this tool result. Repository files may since have changed.</p>
    {value.code !== undefined ? <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 220, overflow: 'auto' }}>
      {value.code.split('\n').map((text, i) => `${value.startLine + i}  ${text}`).join('\n')}
    </pre> : <p role="status">{value.gap ?? 'No source evidence available.'}</p>}
    {value.side === 'current' && path && openFile ? <button type="button" onClick={() => openFile(path, { line: value.line })}>Open current file at line {value.line}</button> : null}
  </div>
}

/** Native React/SVG inside the existing DSH keyed tool slot; no service or fetch. */
export function ImpactXrayCard(props: { view: ImpactXray; openFile?: (path: string, options?: unknown) => void }): ReactNode {
  const { view, openFile } = props
  const arrow = useId()
  const [visible, setVisible] = useState(6)
  const [selected, setSelected] = useState<{ type: 'node' | 'edge'; id: string } | null>(null)
  const nodes = view.nodes.slice(0, visible)
  const left = nodes.filter(n => n.changed)
  const right = nodes.filter(n => !n.changed)
  const height = Math.max(1, left.length, right.length) * 76 + 20
  const positions = new Map(nodes.map(n => [n.id, { x: n.changed ? 155 : 545, y: (n.changed ? left : right).indexOf(n) * 76 + 36 }]))
  const edges = view.edges.filter(e => positions.has(e.from) && positions.has(e.to))
  const node = selected?.type === 'node' ? view.nodes.find(n => n.id === selected.id) : undefined
  const edge = selected?.type === 'edge' ? view.edges.find(e => e.id === selected.id) : undefined
  const pick = (type: 'node' | 'edge', id: string): void => setSelected({ type, id })
  return <section aria-label="Impact X-Ray" style={{ border: '1px solid #64748b', borderRadius: 8, padding: 12, fontSize: 12, overflowWrap: 'anywhere' }}>
    <strong>Impact X-Ray · experimental PoC</strong>
    <p>Potential impact · {view.source} · {nodes.length}/{view.nodes.length} nodes · {edges.length}/{view.edges.length} call edges</p>
    <p>Solid: exact · dashed: import-scoped · dotted: name-only (low confidence). Arrows point from caller to callee.</p>
    {nodes.length ? <div style={{ position: 'relative', height, overflow: 'auto', minWidth: 280 }}>
      <svg width="100%" height={height} viewBox={`0 0 700 ${height}`} preserveAspectRatio="none" aria-label="Call relationships">
        <defs><marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" /></marker></defs>
        {edges.map(e => {
          const a = positions.get(e.from)!, b = positions.get(e.to)!
          const sameColumn = a.x === b.x
          // Route same-column hops around the cards, never through another
          // symbol: passing through a test card would suggest a false edge.
          const side = a.x < 350 ? -1 : 1
          const boundary = a.x + side * 142
          const lane = a.x < 350 ? 3 : 697
          const route = sameColumn ? `M ${boundary} ${a.y} H ${lane} V ${b.y} H ${boundary}` :
            `M ${a.x + (b.x > a.x ? 144 : -144)} ${a.y} L ${b.x + (b.x > a.x ? -144 : 144)} ${b.y}`
          // The visible line is selectable; an adjacent HTML list also supports keyboard input.
          return <g key={e.id} onClick={() => pick('edge', e.id)} style={{ cursor: 'pointer' }}>
            <title>{e.resolution}: {e.evidence.file}:{e.evidence.line}</title>
            <path d={route} fill="none" stroke="transparent" strokeWidth={16} />
            <path d={route} fill="none" markerEnd={`url(#${arrow})`} stroke={e.resolution === 'name-only' ? '#eab308' : '#38bdf8'} strokeWidth={2}
              strokeDasharray={e.resolution === 'exact' ? undefined : e.resolution === 'import-scoped' ? '9 5' : '2 5'} />
          </g>
        })}
      </svg>
      {nodes.map(n => <button type="button" key={n.id} aria-pressed={node?.id === n.id} onClick={() => pick('node', n.id)}
        style={{ position: 'absolute', left: n.changed ? '2%' : '58%', top: positions.get(n.id)!.y - 24, width: '40%', height: 54,
          background: 'var(--dsw-alias-bg-layer-3, #182331)', color: 'inherit', border: `2px solid ${n.changed ? '#f97316' : '#38bdf8'}`,
          borderRadius: 6, overflow: 'hidden', textAlign: 'left', cursor: 'pointer' }}>
        {n.changed ? '◆ ' : ''}{n.name}<br /><small>{n.file}:{n.line}</small>
      </button>)}
    </div> : <p role="status">No mapped symbols to display. Review the analysis gaps below.</p>}
    {visible < view.nodes.length ? <button type="button" onClick={() => setVisible(v => v + 6)}>Expand nodes ({view.nodes.length - nodes.length} remaining)</button> : null}
    <details><summary>Call evidence ({edges.length})</summary>
      {edges.map(e => <div key={e.id}><button type="button" aria-pressed={edge?.id === e.id} onClick={() => pick('edge', e.id)}>
        {view.nodes.find(n => n.id === e.from)?.name} → {view.nodes.find(n => n.id === e.to)?.name} · {e.resolution} · {e.evidence.file}:{e.evidence.line}
      </button></div>)}
    </details>
    <div aria-live="polite" style={{ marginTop: 12 }}>
      {node ? <><strong>{node.kind} {node.name}</strong><p>Included because: {node.reason}</p><Evidence value={node.evidence} root={view.root} openFile={openFile} /></> :
        edge ? <><strong>Call evidence · {edge.resolution}</strong><p>Resolution reason: {edge.reason}. This is a potential impact relation.</p><Evidence value={edge.evidence} root={view.root} openFile={openFile} /></> : <p>Select a node or call relation to inspect source evidence.</p>}
    </div>
    <details><summary>Test leads ({view.tests.length}) / import dependents ({view.imports.length})</summary>
      {view.tests.map((t, i) => <p key={`t${i}`}>{t.file} · {t.resolution} · {t.reason} (not coverage proof)</p>)}
      {view.imports.map((item, i) => <p key={`i${i}`}>{item.file} imports {item.specifier} → {item.changedFile} · {item.resolution}</p>)}
      <p>These file-level leads are not rendered as function call edges in this PoC.</p>
    </details>
    <details open={view.truncated}><summary>Analysis gaps / limits{view.truncated ? ' · bounded result' : ''}</summary>
      {view.gaps.map((gap, i) => <p key={i}>{gap}</p>)}
    </details>
  </section>
}
