/**
 * Version comparison, in its own module so it can be imported and tested without
 * running a script's command-line entry point.
 */
import { fail } from './run.js'

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

export const isSemver = (value) => SEMVER.test(value)

/**
 * Enough of semver to stop a release moving the version backwards by accident.
 * Returns -1, 0 or 1.
 *
 * A pre-release sorts below the release with the same numbers, which is the only
 * extra precision this needs.
 */
export function compareVersions (a, b) {
  const left = SEMVER.exec(a)
  const right = SEMVER.exec(b)
  if (!left || !right) {
    fail(`cannot compare "${a}" with "${b}": not both plain semver`)
  }

  for (let i = 1; i <= 3; i++) {
    const diff = Number(left[i]) - Number(right[i])
    if (diff !== 0) {
      return diff < 0 ? -1 : 1
    }
  }

  const leftPre = left[4]
  const rightPre = right[4]
  if (leftPre === rightPre) return 0
  // A release outranks any pre-release of the same numbers.
  if (!leftPre) return 1
  if (!rightPre) return -1
  return leftPre < rightPre ? -1 : 1
}
