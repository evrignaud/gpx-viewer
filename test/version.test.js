import { describe, expect, it } from 'vitest'

import { compareVersions, isSemver } from '../scripts/lib/version.js'

describe('isSemver', () => {
  it.each(['0.0.0', '0.2.0', '1.0.0', '10.20.30', '1.0.0-rc.1', '1.0.0-alpha'])(
    'accepts %s', (value) => expect(isSemver(value)).toBe(true)
  )

  it.each(['1.0', 'v1.0.0', '1.0.0.0', 'latest', '', '1.0.0 ', 'a.b.c'])(
    'rejects %s', (value) => expect(isSemver(value)).toBe(false)
  )
})

describe('compareVersions', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareVersions('1.0.0', '0.2.0')).toBe(1)
    expect(compareVersions('0.2.0', '1.0.0')).toBe(-1)
    expect(compareVersions('0.3.0', '0.2.9')).toBe(1)
    expect(compareVersions('0.2.1', '0.2.0')).toBe(1)
    expect(compareVersions('0.2.0', '0.2.0')).toBe(0)
  })

  it('compares numerically, not as strings', () => {
    // The bug this guards against: "10" < "9" when compared as text, which would
    // make the release pipeline think 0.10.0 is a downgrade from 0.9.0.
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1)
    expect(compareVersions('10.0.0', '9.0.0')).toBe(1)
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1)
  })

  it('sorts a pre-release below the release with the same numbers', () => {
    expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBe(-1)
    expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBe(1)
    expect(compareVersions('1.0.0-rc.1', '1.0.0-rc.1')).toBe(0)
    expect(compareVersions('1.0.0-rc.2', '1.0.0-rc.1')).toBe(1)
  })

  it('still ranks a pre-release of a higher version above a lower release', () => {
    expect(compareVersions('1.0.0-rc.1', '0.9.0')).toBe(1)
  })

  it('refuses to compare things that are not versions', () => {
    expect(() => compareVersions('1.0.0', 'latest')).toThrow(/not both plain semver/)
  })
})
