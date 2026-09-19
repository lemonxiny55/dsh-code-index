/**
 * Browser half of dsh-code-index: structured result cards for the code_* tools
 * plus a settings card for the `code-index` namespace.
 *
 * Deliberately imports no harness client package: this bundle only needs
 * `react` (a shell platform module) plus the slot registry and settings scope
 * services reached through the plugin context. Keeping the surface local avoids
 * a dependency on a synchronized client-package version.
 */

import { useEffect, useState, type ReactNode } from 'react'

/** Minimal structural view of the client plugin context this bundle uses. */
interface ClientContextLike {
  slots: {
    inject(name: string, run: () => Iterable<unknown>): void
    register(entry: Record<string, unknown>, component: (props: never) => ReactNode): () => void
  }
  inject(deps: string[], run: (ctx: ClientContextLike) => void): unknown
  settingsScope?: { bind(spec: { namespace: string }): SettingsScopeLike<CodeIndexSettings> }
}

interface SettingsSnapshot<T> {
  status: 'loading' | 'ready' | 'unavailable'
  value: T | undefined
  writable: boolean
}

interface SettingsScopeLike<T> {
  getSnapshot(): SettingsSnapshot<T>
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
  unset(field: string): Promise<void>
}

interface CodeIndexSettings {
  excludeDirs?: string[]
  mapTopFiles?: number
  mapMaxChars?: number
  mapTtlMs?: number
  autoInject?: boolean
  codeHealth?: boolean
  toolSurface?: 'full' | 'compact'
}

interface ToolCallHead {
  name?: string
  argsRaw?: string
}

interface TextContent {
  type?: string
  text?: string
}

interface ToolResultLike {
  call?: ToolCallHead | null
  content?: readonly TextContent[]
  isError?: boolean
  resultView?: unknown
}

interface SearchView {
  card: 'search'
  shape?: 'matches' | 'paths'
  files?: Array<{ path: string; matches?: Array<{ lineNumber: number; line: string }> }>
  paths?: string[]
  truncated?: boolean
  total?: number
}

interface ToolViewProps {
  toolName: string
  block: ToolResultLike & ToolCallHead
  openFile?: (path: string, options?: unknown) => void
}

const CARD_STYLE: Record<string, string | number> = {
  border: '1px solid var(--dsh-border, #333)',
  borderRadius: 6,
  padding: '6px 8px',
  fontFamily: 'var(--dsh-mono-font, monospace)',
  fontSize: 12,
  margin: '4px 0',
}

const ROW_STYLE: Record<string, string | number> = {
  display: 'flex',
  gap: 8,
  alignItems: 'baseline',
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const value: unknown = JSON.parse(raw)
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function summarizeArgs(args: Record<string, unknown>): string {
  const parts: string[] = []
  for (const key of ['task', 'query', 'symbol', 'action', 'direction', 'kind', 'budgetChars']) {
    const value = args[key]
    if (typeof value === 'string' && value) parts.push(`${key}=${value}`)
  }
  return parts.join(' ')
}

function asSearchView(view: unknown): SearchView | undefined {
  if (typeof view !== 'object' || view === null || Array.isArray(view)) return undefined
  const record = view as Record<string, unknown>
  return record.card === 'search' ? (record as unknown as SearchView) : undefined
}

function resultText(block: ToolResultLike): string {
  return (block.content ?? [])
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text ?? '')
    .join('\n')
}

/** One code tool's card: argument summary, structured search matches, or text. */
function CodeToolCard(props: ToolViewProps): ReactNode {
  const { toolName, block, openFile } = props
  const head: ToolCallHead = block.call ?? block
  const summary = summarizeArgs(parseArgs(head.argsRaw))
  const search = asSearchView(block.resultView)
  const isError = block.isError === true

  return (
    <div style={CARD_STYLE}>
      <div style={ROW_STYLE}>
        <strong>{toolName}</strong>
        {summary ? <span style={{ opacity: 0.75 }}>{summary}</span> : null}
        {isError ? <span style={{ color: '#e5534b' }}>error</span> : null}
      </div>
      {search?.shape === 'matches' && search.files ? (
        <div style={{ marginTop: 4 }}>
          {search.files.map((file) => (
            <div key={file.path}>
              <div style={{ opacity: 0.85 }}>{file.path}</div>
              {(file.matches ?? []).map((match, index) => (
                <div
                  key={`${match.lineNumber}-${index}`}
                  style={{ paddingLeft: 12, cursor: openFile ? 'pointer' : 'default' }}
                  onClick={() => openFile?.(file.path, { line: match.lineNumber })}
                >
                  <span style={{ opacity: 0.6 }}>{match.lineNumber}</span> {match.line}
                </div>
              ))}
            </div>
          ))}
          {search.truncated ? <div style={{ opacity: 0.6 }}>… truncated ({search.total} total)</div> : null}
        </div>
      ) : (
        <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto' }}>
          {resultText(block)}
        </pre>
      )}
    </div>
  )
}

/** The scope is captured at apply() time; the card reads it through React state. */
let activeScope: SettingsScopeLike<CodeIndexSettings> | null = null

/** Mirrors the first-party plugin card + field CSS modules, under our own class names. */
const CARD_CSS = `
.dci-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}
.dci-card:hover{border-color:var(--dsw-alias-label-dimmed)}
.dci-cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}
.dci-header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}
.dci-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dci-headText{flex-direction:column;flex:1 1 0%;gap:4px;min-width:0;display:flex}
.dci-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}
.dci-description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}
.dci-chevron{color:var(--dsw-alias-label-tertiary);flex:0 0 auto;transition:transform .16s}
.dci-chevronOpen{transform:rotate(180deg)}
.dci-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}
.dci-field{flex-direction:column;gap:6px;padding:12px 0;display:flex}
.dci-field+.dci-field{border-top:1px solid var(--dsw-alias-border-l2)}
.dci-head{align-items:center;gap:8px;display:flex}
.dci-label{min-width:0;color:var(--dsw-alias-label-primary);flex:1 1 0%;font-size:13px;font-weight:500;line-height:1.5}
.dci-input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font:inherit;font-size:13px;line-height:1.5}
.dci-input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}
.dci-input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.dci-check{width:16px;height:16px;flex:0 0 auto;accent-color:var(--dsw-alias-brand-primary)}
.dci-hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}
.dci-footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}
.dci-discard,.dci-save{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}
.dci-discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}
.dci-discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}
.dci-save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.dci-discard:disabled,.dci-save:disabled{opacity:.4;cursor:default}
`

const CHEVRON_PATH =
  'M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z'

const SETTINGS_DEFAULTS = { autoInject: true, codeHealth: false, mapTopFiles: 24 }
const SETTINGS_FIELDS = ['autoInject', 'codeHealth', 'mapTopFiles'] as const

/** Settings card for `code-index`, laid out like the first-party plugin cards. */
function CodeIndexSettingsCard(): ReactNode {
  const scope = activeScope
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<SettingsSnapshot<CodeIndexSettings> | null>(
    scope ? scope.getSnapshot() : null,
  )
  const [draft, setDraft] = useState<CodeIndexSettings | null>(null)

  useEffect(() => {
    if (!scope) return
    setSnapshot(scope.getSnapshot())
    return scope.subscribe(() => setSnapshot(scope.getSnapshot()))
  }, [scope])

  const resolved = snapshot?.value ?? {}
  const form: CodeIndexSettings = { ...SETTINGS_DEFAULTS, ...resolved, ...draft }
  const writable = snapshot?.writable ?? false
  const changed = (key: (typeof SETTINGS_FIELDS)[number]): boolean =>
    form[key] !== (resolved[key] ?? SETTINGS_DEFAULTS[key])
  const dirty = draft !== null && SETTINGS_FIELDS.some(changed)

  const edit = (key: (typeof SETTINGS_FIELDS)[number], value: string | number | boolean): void => {
    setDraft({ ...form, [key]: value })
  }
  const save = (): void => {
    if (!scope) return
    for (const key of SETTINGS_FIELDS) {
      if (changed(key)) {
        scope.set(key, form[key]).catch((error: unknown) => {
          console.error('[dsh-code-index] settings save failed', error)
        })
      }
    }
    setDraft(null)
  }

  return (
    <li className={open ? 'dci-card dci-cardOpen' : 'dci-card'}>
      <style>{CARD_CSS}</style>
      <button
        type="button"
        className="dci-header"
        aria-expanded={open}
        aria-label={`${open ? '收起设置' : '展开设置'}: dsh-code-index`}
        onClick={() => { setOpen(!open) }}
      >
        <span className="dci-headText">
          <span className="dci-name">dsh-code-index</span>
          <span className="dci-description">结构化仓库索引：符号搜索、仓库地图与调用图。</span>
        </span>
        <svg className={open ? 'dci-chevron dci-chevronOpen' : 'dci-chevron'} width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d={CHEVRON_PATH} fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <div className="dci-body">
          <div className="dci-field">
            <div className="dci-head">
              <label className="dci-label" htmlFor="dci-auto-inject">自动注入仓库地图</label>
              <input
                id="dci-auto-inject"
                className="dci-check"
                type="checkbox"
                checked={form.autoInject}
                disabled={!writable}
                onChange={(event) => { edit('autoInject', event.target.checked) }}
              />
            </div>
            <p className="dci-hint">把精简的排名仓库地图注入系统提示词。</p>
          </div>
          <div className="dci-field">
            <div className="dci-head">
              <label className="dci-label" htmlFor="dci-code-health">代码健康工具</label>
              <input
                id="dci-code-health"
                className="dci-check"
                type="checkbox"
                checked={form.codeHealth}
                disabled={!writable}
                onChange={(event) => { edit('codeHealth', event.target.checked) }}
              />
            </div>
            <p className="dci-hint">注册 code_health 工具，报告环依赖与孤儿模块（重启后生效）。</p>
          </div>
          <div className="dci-field">
            <div className="dci-head">
              <label className="dci-label" htmlFor="dci-map-files">地图文件数</label>
            </div>
            <input
              id="dci-map-files"
              className="dci-input"
              type="text"
              inputMode="numeric"
              value={String(form.mapTopFiles)}
              disabled={!writable}
              onChange={(event) => { edit('mapTopFiles', Number(event.target.value)) }}
            />
            <p className="dci-hint">仓库地图中最多展示的文件数。</p>
          </div>
          <div className="dci-footer">
            <button type="button" className="dci-discard" disabled={!dirty || !writable} onClick={() => { setDraft(null) }}>
              放弃修改
            </button>
            <button type="button" className="dci-save" disabled={!dirty || !writable} onClick={save}>保存</button>
          </div>
        </div>
      ) : null}
      {scope ? null : <p className="dci-hint" style={{ padding: '0 16px 12px' }}>设置服务不可用。</p>}
    </li>
  )
}

export const name = 'dsh-code-index'

/** `slots` is required for direct access; `settingsScope` binds lazily below. */
export const inject = ['slots']

const TOOLVIEW_KEYS = [
  'code_index',
  'code_symbols',
  'code_search',
  'code_map',
  'code_refs',
  'code_change_context',
  'code_context',
  'code_health',
]

export function apply(ctx: ClientContextLike): void {
  const card = CodeToolCard as unknown as (props: never) => ReactNode
  ctx.slots.inject('tool.call.toolview', function* () {
    for (const key of TOOLVIEW_KEYS) {
      yield ctx.slots.register({ name: 'tool.call.toolview', key }, card)
    }
  })

  ctx.inject(['settingsScope'], (scoped: ClientContextLike) => {
    activeScope = scoped.settingsScope?.bind({ namespace: 'code-index' }) ?? null
    ctx.slots.inject('settings.plugin.item', function* () {
      yield ctx.slots.register(
        { name: 'settings.plugin.item', key: 'code-index' },
        CodeIndexSettingsCard as unknown as (props: never) => ReactNode,
      )
    })
  })
}
