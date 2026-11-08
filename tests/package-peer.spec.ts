import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const semver = createRequire(import.meta.url)('semver')
const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const range = metadata.peerDependencies['@deepseek-ai/dsh-tools']

describe('normal npm peer resolution for verified DSH groups', () => {
  it.each(['0.2.0-rc.2', '0.2.1-rc.2', '0.2.1-rc.3', '0.2.2-rc.1', '0.2.2'])('accepts %s without includePrerelease bypass', version => {
    expect(semver.satisfies(version, range)).toBe(true)
  })
  it('does not automatically admit a future unverified prerelease tuple', () => {
    expect(semver.satisfies('0.2.3-rc.1', range)).toBe(false)
  })
})
