import { describe, expect, it } from 'vitest'

import { identityEnv, resolveIdentity } from '../scripts/lib/identity.js'

const ETIENNE = { name: 'Etienne Vrignaud', email: 'evrignaud@gmail.com', source: 'tagger of 1.0.0' }

describe('resolveIdentity', () => {
  it('takes the first candidate that yields a name and an email', () => {
    expect(resolveIdentity([() => null, () => ETIENNE, () => ({ name: 'x', email: 'y' })]))
      .toBe(ETIENNE)
  })

  it('skips candidates missing either field', () => {
    const partial = [
      () => null,
      () => ({ name: 'No Email' }),
      () => ({ email: 'no-name@example.test' }),
      () => ({ name: '', email: '' }),
      () => ETIENNE
    ]
    expect(resolveIdentity(partial)).toBe(ETIENNE)
  })

  it('accepts plain objects as well as functions', () => {
    expect(resolveIdentity([ETIENNE])).toBe(ETIENNE)
  })

  it('does not evaluate later candidates once one has matched', () => {
    let evaluated = false
    resolveIdentity([() => ETIENNE, () => { evaluated = true; return null }])
    expect(evaluated).toBe(false)
  })

  it('fails with an actionable message when nothing matches', () => {
    // The situation that broke the release: a runner with no git identity.
    expect(() => resolveIdentity([() => null, () => null]))
      .toThrow(/could not work out who to attribute/)
  })
})

describe('identityEnv', () => {
  it('sets author and committer, which is what commit-tree reads', () => {
    // git commit-tree needs an identity just as git commit does, and a CI runner
    // has none configured. Passing it in the environment avoids touching config.
    expect(identityEnv(ETIENNE)).toEqual({
      GIT_AUTHOR_NAME: 'Etienne Vrignaud',
      GIT_AUTHOR_EMAIL: 'evrignaud@gmail.com',
      GIT_COMMITTER_NAME: 'Etienne Vrignaud',
      GIT_COMMITTER_EMAIL: 'evrignaud@gmail.com'
    })
  })
})
