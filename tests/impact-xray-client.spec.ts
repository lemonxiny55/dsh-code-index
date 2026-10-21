import { afterEach, expect, it, vi } from 'vitest'
import type { ImpactXray } from '../src/impact-xray-model.js'

// Run the real card's event handlers without adding a DOM/rendering dependency.
// This checks state transitions; actual layout and source display are Desktop gates.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState(initial: unknown) {
    const i = hooks.cursor++
    if (!(i in hooks.values)) hooks.values[i] = typeof initial === 'function' ? initial() : initial
    return [hooks.values[i], (next: unknown) => { hooks.values[i] = typeof next === 'function' ? next(hooks.values[i]) : next }]
  },
  useMemo: (fn: () => unknown) => fn(), useRef: () => ({ current: null }), useEffect: () => {},
  useSyncExternalStore: (_subscribe: unknown, get: () => string) => get(),
}))
import { ImpactXrayCard } from '../src/client/impact-xray.js'
type Element = { type: unknown; props: Record<string, unknown> }
function walk(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(walk)
  if (!value || typeof value !== 'object' || !('props' in value)) return []
  const node = value as Element
  return [node, ...walk(node.props.children)]
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join('')
  if (value && typeof value === 'object' && 'props' in value) return text((value as Element).props.children)
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}
afterEach(() => { hooks.values = []; hooks.cursor = 0; vi.unstubAllGlobals() })

it('selects the first unmapped evidence when there are no mapped nodes, then navigates history correctly', () => {
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => { fn(); return 0 })
  const view: ImpactXray = { card: 'impact-xray', version: 2, root: 'D:/repo', source: 'git', nodes: [], edges: [], tests: [], imports: [], gaps: [], truncated: false,
    unmapped: (['base', 'current'] as const).map(side => ({ file: 'unmapped.js', side, reason: 'outside-symbol', ranges: [{ startLine: 1, endLine: 1 }],
      evidence: { file: 'unmapped.js', side, line: 1, startLine: 1, type: 'unmapped-change', code: `// ${side} real comment` } })) }
  const render = () => { hooks.cursor = 0; return walk(ImpactXrayCard({ view })) }
  const button = (nodes: Element[], label: string) => nodes.find(n => n.type === 'button' && (text(n.props.children) === label || n.props['aria-label'] === label))!
  let nodes = render()
  expect(button(nodes, 'Previous selection').props.disabled).toBe(true)
  ;(button(nodes, 'Gaps & limits').props.onClick as () => void)()
  nodes = render()
  ;(button(nodes, 'unmapped.js · current').props.onClick as () => void)()
  nodes = render()
  expect(nodes.find(n => typeof n.type === 'function' && n.props.value)?.props.value).toEqual(view.unmapped![1]!.evidence)
  expect(button(nodes, 'Previous selection').props.disabled).toBe(true)
  ;(button(nodes, 'unmapped.js · base').props.onClick as () => void)()
  nodes = render()
  ;(button(nodes, 'Previous selection').props.onClick as () => void)()
  nodes = render()
  expect(nodes.find(n => typeof n.type === 'function' && n.props.value)?.props.value).toEqual(view.unmapped![1]!.evidence)
  expect(button(nodes, 'Next selection').props.disabled).toBe(false)
})
