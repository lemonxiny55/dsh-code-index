import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const semver = createRequire(import.meta.url)('semver')
const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const toolsRange = metadata.peerDependencies['@deepseek-ai/dsh-tools']
const cordisRange = metadata.peerDependencies['@deepseek-ai/cordis']

describe('normal npm peer resolution for DSH 0.2.x and Cordis 4.x', () => {
  it.each([
    '0.2.0-rc.2',
    '0.2.1-rc.2',
    '0.2.1-rc.3',
    '0.2.2-rc.1',
    '0.2.2',
    '0.2.3-alpha.2',
    '0.2.3',
    '0.2.4-alpha.1',
    '0.2.5-rc.1',
  ])('accepts @deepseek-ai/dsh-tools@%s without includePrerelease bypass', version => {
    expect(semver.satisfies(version, toolsRange)).toBe(true)
  })

  it.each(['0.1.9', '0.3.0', '0.3.0-alpha.1'])(
    'strictly rejects out-of-band @deepseek-ai/dsh-tools@%s',
    version => {
      expect(semver.satisfies(version, toolsRange)).toBe(false)
    },
  )

  it.each(['4.0.1', '4.0.4', '4.0.5-alpha.1', '4.1.0', '4.2.0-alpha.1', '4.2.0'])(
    'accepts @deepseek-ai/cordis@%s without includePrerelease bypass',
    version => {
      expect(semver.satisfies(version, cordisRange)).toBe(true)
    },
  )

  it.each(['3.9.9', '5.0.0', '5.0.0-alpha.1'])(
    'strictly rejects out-of-band @deepseek-ai/cordis@%s',
    version => {
      expect(semver.satisfies(version, cordisRange)).toBe(false)
    },
  )
})
