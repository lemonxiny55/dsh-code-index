import type { ChangeContextResult, ImpactHop } from './change-context.js'

/** Browser-safe presentation contract. Persisted v1 PoCs remain readable. */
export const XRAY_LIMITS = { nodes: 32, edges: 48, paths: 12, evidenceChars: 900, metadataBytes: 96_000 } as const
export interface XrayEvidence {
  file: string
  line: number
  startLine: number
  side: 'current' | 'base'
  ref?: string
  type?: 'declaration' | 'call-site' | 'import-site' | 'test-lead' | 'unmapped-change'
  code?: string
  gap?: string
}
export interface XrayNode {
  id: string
  name: string
  kind: string
  file: string
  line: number
  changed: boolean
  category?: 'change' | 'caller' | 'impact' | 'module' | 'test'
  depth?: number
  resolution?: ImpactHop['resolution']
  change?: string
  reason: string
  evidence: XrayEvidence
}
export interface XrayEdge {
  id: string
  from: string
  to: string
  kind?: 'call' | 'import'
  resolution: ImpactHop['resolution']
  reason: string
  evidence: XrayEvidence
}
export interface XrayPath {
  id: string
  from: string
  to: string
  edgeIds: string[]
  resolution: ImpactHop['resolution']
  omitted: boolean
}
export interface ImpactXray {
  card: 'impact-xray'
  version: 1 | 2
  root: string
  source: ChangeContextResult['source']
  nodes: XrayNode[]
  edges: XrayEdge[]
  tests: Array<ChangeContextResult['tests'][number] & { nodeId?: string }>
  imports: Array<ChangeContextResult['importDependents'][number] & { edgeId?: string }>
  paths?: XrayPath[]
  unmapped?: Array<ChangeContextResult['unmapped'][number] & { evidence: XrayEvidence }>
  bounds?: { analysis: ChangeContextResult['truncated']; projection: boolean; text?: boolean; totals: { changed: number; callers: number; impact: number; imports: number; tests: number; paths: number; unmapped: number } }
  gaps: string[]
  truncated: boolean
}
