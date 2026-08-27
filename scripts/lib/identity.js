/**
 * Works out who a generated commit should be attributed to.
 *
 * `git commit-tree` needs an author and a committer just as `git commit` does. A
 * CI runner has no user.name or user.email configured, so without this the
 * publish step aborts with:
 *
 *   *** Please tell me who you are.
 *   fatal: unable to auto-detect email address
 *
 * Passing the identity explicitly is better than writing it into git config: it
 * leaves no global state behind, and it works the same on a workstation that
 * already has a different identity set.
 */
import { fail, git } from './run.js'

// for-each-ref gives the address wrapped in angle brackets.
const stripBrackets = (email) => email.replace(/^</, '').replace(/>$/, '')

function split (output) {
  if (!output) {
    return null
  }
  // Tab-separated, because a person's name may well contain other punctuation.
  const [name, email] = output.split('\t')
  if (!name || !email) {
    return null
  }
  const trimmed = { name: name.trim(), email: stripBrackets(email.trim()) }
  return trimmed.name && trimmed.email ? trimmed : null
}

/**
 * The person who created an annotated tag. Empty for a lightweight tag, which
 * carries no tagger of its own.
 */
export function fromTag (tag) {
  if (!tag) {
    return null
  }
  const found = split(git(
    ['for-each-ref', '--format=%(taggername)%09%(taggeremail)', `refs/tags/${tag}`],
    { allowFailure: true }
  ))
  return found ? { ...found, source: `tagger of ${tag}` } : null
}

/** The author of the commit being published. */
export function fromHead () {
  const found = split(git(['log', '-1', '--format=%an%x09%ae'], { allowFailure: true }))
  return found ? { ...found, source: 'author of HEAD' } : null
}

/** Whatever this machine is configured to use, if anything. */
export function fromGitConfig () {
  const name = git(['config', 'user.name'], { allowFailure: true })
  const email = git(['config', 'user.email'], { allowFailure: true })
  return name && email ? { name, email, source: 'git config' } : null
}

/**
 * First candidate that produced something usable. Candidates are functions so an
 * expensive or failing lookup is only attempted when it is actually reached.
 */
export function resolveIdentity (candidates) {
  for (const candidate of candidates) {
    const identity = typeof candidate === 'function' ? candidate() : candidate
    if (identity?.name && identity?.email) {
      return identity
    }
  }

  fail(
    'could not work out who to attribute the commit to.\n' +
    'No annotated tag, no commit author and no configured git identity were found.'
  )
}

/**
 * Environment for a git command that writes a commit. Set explicitly so
 * commit-tree does not need git config to exist.
 */
export function identityEnv ({ name, email }) {
  return {
    GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email,
    GIT_COMMITTER_NAME: name,
    GIT_COMMITTER_EMAIL: email
  }
}
