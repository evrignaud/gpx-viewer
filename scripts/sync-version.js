#!/usr/bin/env node
/**
 * Sets package.json, and package-lock.json with it, to a given version.
 *
 * The release pipeline treats the pushed tag as the source of truth for the
 * version, so this is how package.json is brought into line with it rather than
 * the release failing over the difference.
 *
 * Usage:
 *   node scripts/sync-version.js --version 1.0.0
 *
 * Options:
 *   --version <v>   the version to move to. Required.
 *   --allow-older   permit moving to a version lower than the current one
 *
 * When $GITHUB_OUTPUT is set it also writes `changed`, `previous` and `version`
 * for later workflow steps to read.
 */
import { appendFileSync } from 'node:fs'

import { fail, info, note, npm, readPackage, runScript, step, warn } from './lib/run.js'
import { compareVersions, isSemver } from './lib/version.js'

function parseArgs (argv) {
  const options = { version: null, allowOlder: false }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--version': {
        const value = argv[i + 1]
        if (!value || value.startsWith('-')) {
          fail('--version needs a value')
        }
        options.version = value
        i++
        break
      }
      case '--allow-older': options.allowOlder = true; break
      default: fail(`unknown argument "${arg}"`)
    }
  }

  if (!options.version) {
    fail('--version is required')
  }
  if (!isSemver(options.version)) {
    fail(`"${options.version}" is not a plain semver version`)
  }

  return options
}

function report (values) {
  if (!process.env.GITHUB_OUTPUT) {
    return
  }
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`)
  appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`)
}

await runScript(async () => {
  const options = parseArgs(process.argv.slice(2))
  const previous = readPackage().version

  step(`Version: ${previous} -> ${options.version}`)

  if (previous === options.version) {
    info('already at this version, nothing to do')
    report({ changed: 'false', previous, version: options.version })
    return
  }

  const direction = compareVersions(options.version, previous)
  if (direction < 0 && !options.allowOlder) {
    // Tagging an older version than the one on the branch is almost always a
    // mistake, and silently rewinding the branch would hide it.
    warn(`${options.version} is older than ${previous}, leaving package.json alone`)
    note('pass --allow-older to move the version backwards on purpose')
    report({ changed: 'false', previous, version: options.version })
    return
  }

  // --no-git-tag-version: the caller decides whether to commit. --allow-same-version
  // because npm otherwise treats a no-op as an error.
  npm(['version', options.version, '--no-git-tag-version', '--allow-same-version'])

  const written = readPackage().version
  if (written !== options.version) {
    fail(`expected package.json to be at ${options.version} but it is at ${written}`)
  }
  info('package.json and package-lock.json updated')

  report({ changed: 'true', previous, version: options.version })
})
