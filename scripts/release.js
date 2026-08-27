#!/usr/bin/env node
/**
 * Cuts a release of gpx-viewer.
 *
 *   1. checks the repository is in a fit state to release from,
 *   2. optionally bumps the version and commits it,
 *   3. lints, tests and builds,
 *   4. tags the release,
 *   5. publishes dist/ to the gh-pages branch,
 *   6. pushes the branch, the tag and gh-pages together.
 *
 * Pushing the tag also triggers .github/workflows/release.yml, which builds and
 * publishes on a runner. Publishing is idempotent, so the two cannot fight: if
 * the branch already holds this exact output, neither adds a commit. Pass
 * --skip-pages to leave publishing entirely to the workflow.
 *
 * Usage:
 *   node scripts/release.js                  release the version in package.json
 *   node scripts/release.js 0.3.0            set that version, then release it
 *   node scripts/release.js patch            bump patch, then release
 *   node scripts/release.js minor|major      likewise
 *
 * Options:
 *   --dry-run          do the checks and the build, change and push nothing
 *   --yes, -y          skip the confirmation prompt
 *   --skip-checks      skip lint and tests (the build still has to succeed)
 *   --skip-pages       do not publish; let the release workflow do it
 *   --remote <name>    default: origin
 *   --branch <name>    branch to release from, default: master
 *   --pages-branch <n> branch to publish to, default: gh-pages
 *
 * Written in Node rather than a shell script so it behaves the same on Windows
 * and Linux, and so it can use the repository's own tooling.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'

import { fromGitConfig, fromHead, fromTag, resolveIdentity } from './lib/identity.js'
import { isSemver } from './lib/version.js'
import { assertRelativeAssetUrls, buildPagesCommit } from './lib/pages.js'
import {
  colour, distDir, fail, git, info, note, npm, readPackage, repoRoot, runScript, step, warn
} from './lib/run.js'

const BUMPS = new Set(['patch', 'minor', 'major'])

const readVersion = () => readPackage().version

// ------------------------------------------------------------------- options ---

function parseArgs (argv) {
  const options = {
    version: null,
    dryRun: false,
    yes: false,
    skipChecks: false,
    skipPages: false,
    remote: 'origin',
    branch: 'master',
    pagesBranch: 'gh-pages'
  }

  const takeValue = (name, index) => {
    const value = argv[index + 1]
    if (!value || value.startsWith('-')) {
      fail(`${name} needs a value`)
    }
    return value
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--dry-run': options.dryRun = true; break
      case '--yes': case '-y': options.yes = true; break
      case '--skip-checks': options.skipChecks = true; break
      case '--skip-pages': options.skipPages = true; break
      case '--remote': options.remote = takeValue(arg, i); i++; break
      case '--branch': options.branch = takeValue(arg, i); i++; break
      case '--pages-branch': options.pagesBranch = takeValue(arg, i); i++; break
      case '--help': case '-h': options.help = true; break
      default:
        if (arg.startsWith('-')) {
          fail(`unknown option "${arg}". Try --help.`)
        }
        if (options.version) {
          fail(`unexpected extra argument "${arg}"`)
        }
        if (!BUMPS.has(arg) && !isSemver(arg)) {
          fail(`"${arg}" is neither a semver version nor one of patch, minor, major`)
        }
        options.version = arg
    }
  }

  return options
}

function usage () {
  console.log(`
Cut a release of gpx-viewer.

  node scripts/release.js [version] [options]

  version            a semver version such as 0.3.0, or patch, minor, major.
                     Omit it to release the version already in package.json.

  --dry-run          run the checks and the build, change and push nothing
  --yes, -y          skip the confirmation prompt
  --skip-checks      skip lint and tests
  --skip-pages       do not publish; let the release workflow do it
  --remote <name>    default: origin
  --branch <name>    branch to release from, default: master
  --pages-branch <n> branch to publish to, default: gh-pages

Pushing the tag also triggers the release workflow, which builds and publishes
on a runner. Publishing is idempotent, so running both is safe.
`)
}

// ----------------------------------------------------------------- preflight ---

function preflight (options) {
  step('Checking the repository')

  if (git(['rev-parse', '--is-inside-work-tree'], { allowFailure: true }) !== 'true') {
    fail('not inside a git work tree')
  }

  const dirty = git(['status', '--porcelain'])
  if (dirty) {
    fail(`the working tree has uncommitted changes:\n${dirty}\n\nCommit or stash them before releasing.`)
  }
  info('working tree is clean')

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch !== options.branch) {
    fail(`on branch "${branch}" but releasing from "${options.branch}". Switch branch, or pass --branch ${branch}.`)
  }
  info(`on branch ${branch}`)

  if (!git(['remote', 'get-url', options.remote], { allowFailure: true })) {
    fail(`remote "${options.remote}" does not exist`)
  }

  step(`Fetching ${options.remote}`)
  git(['fetch', '--tags', options.remote])
  info('done')

  // Releasing from a branch that is behind the remote would publish stale code.
  const upstream = `refs/remotes/${options.remote}/${options.branch}`
  if (git(['rev-parse', '--verify', '--quiet', upstream], { allowFailure: true })) {
    const behind = Number(git(['rev-list', '--count', `HEAD..${upstream}`]))
    if (behind > 0) {
      fail(`${options.branch} is ${behind} commit(s) behind ${options.remote}/${options.branch}. Pull first.`)
    }
  }

  // An unpushed commit would be tagged, and the workflow would then build a
  // commit the remote does not have.
  const ahead = Number(git(['rev-list', '--count', `${upstream}..HEAD`], { allowFailure: true }) || 0)
  if (ahead > 0) {
    info(`${ahead} commit(s) will be pushed along with the tag`)
  }

  return branch
}

function bumpVersion (current, kind) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(current)
  if (!match) {
    fail(`cannot bump "${current}": it is not a plain major.minor.patch version`)
  }
  const [major, minor, patch] = match.slice(1).map(Number)
  if (kind === 'major') return `${major + 1}.0.0`
  if (kind === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

/**
 * Works out the version being released without writing anything, so --dry-run
 * reports the version it would actually produce rather than the current one.
 */
function resolveVersion (options) {
  const current = readVersion()

  if (!options.version) {
    info(`releasing the version already in package.json: ${current}`)
    return { version: current, changed: false }
  }

  const target = BUMPS.has(options.version)
    ? bumpVersion(current, options.version)
    : options.version

  if (target === current) {
    info(`package.json is already at ${current}`)
    return { version: current, changed: false }
  }

  info(`${current} -> ${target}`)
  return { version: target, changed: true }
}

function assertTagFree (tag, options) {
  if (git(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], { allowFailure: true })) {
    fail(`tag "${tag}" already exists locally. Delete it, or release a different version.`)
  }
  if (git(['ls-remote', '--tags', options.remote, `refs/tags/${tag}`], { allowFailure: true })) {
    fail(`tag "${tag}" already exists on ${options.remote}. Releases are not meant to be rewritten.`)
  }
}

// --------------------------------------------------------- version and build ---

function applyVersion (version, options) {
  step(`Setting the version to ${version}`)
  if (options.dryRun) {
    note('dry run: package.json left alone')
    return
  }

  // --no-git-tag-version: this script owns the commit and the tag.
  npm(['version', version, '--no-git-tag-version'])

  const written = readVersion()
  if (written !== version) {
    fail(`expected package.json to be at ${version} but it is at ${written}`)
  }

  git(['add', 'package.json', 'package-lock.json'])
  git(['commit', '-m', `Move to ${version}`])
  info(`committed "Move to ${version}"`)
}

function runChecks (options) {
  if (options.skipChecks) {
    warn('skipping lint and tests because --skip-checks was passed')
    return
  }
  step('Linting and testing')
  npm(['run', 'lint'])
  npm(['test'])
}

function build () {
  step('Building')
  npm(['run', 'build'])

  const indexHtml = path.join(distDir, 'index.html')
  if (!existsSync(indexHtml)) {
    fail(`the build produced no ${path.relative(repoRoot, indexHtml)}`)
  }
  assertRelativeAssetUrls(indexHtml)
  info('asset URLs are relative')
}

// ---------------------------------------------------------------------- main ---

async function confirm (summary, options) {
  console.log(`\n${summary}`)

  if (options.yes) {
    return true
  }
  if (!process.stdin.isTTY) {
    fail('refusing to push without confirmation. Re-run with --yes, or from a terminal.')
  }

  const readline = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await readline.question('\nPush this release? [y/N] ')
    return /^y(es)?$/i.test(answer.trim())
  } finally {
    readline.close()
  }
}

await runScript(async () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    usage()
    return
  }

  const branch = preflight(options)

  step('Working out the version')
  const { version, changed } = resolveVersion(options)

  // Checked before anything is written, so a clash costs nothing.
  assertTagFree(version, options)

  if (changed) {
    applyVersion(version, options)
  }

  runChecks(options)
  build()

  const sourceSha = git(['rev-parse', 'HEAD'])

  let pages = null
  if (options.skipPages) {
    step('Skipping the pages commit')
    note('the release workflow will publish when the tag arrives')
  } else {
    // git config first here: a person is running this, on their own machine.
    // Resolved rather than left to git so commit-tree still works if no identity
    // is configured, which is what broke the same call in CI.
    pages = buildPagesCommit({
      version,
      sourceSha,
      sourceRef: branch,
      remote: options.remote,
      pagesBranch: options.pagesBranch,
      identity: resolveIdentity([fromGitConfig, fromHead, () => fromTag(version)])
    })
  }

  step('Tagging')
  if (options.dryRun) {
    note(`dry run: would create tag ${version}`)
  } else {
    git(['tag', '-a', version, '-m', `gpx-viewer ${version}`])
    info(`created annotated tag ${version}`)
  }

  // Shown in the summary so the identity the release is recorded under is
  // visible before anything is pushed.
  const identity = `${git(['config', 'user.name'])} <${git(['config', 'user.email'])}>`
  const pagesUrl = readPackage().homepage || '(see repository settings)'

  const publishing = pages && !pages.unchanged

  const refspecs = [`refs/heads/${branch}:refs/heads/${branch}`, `refs/tags/${version}:refs/tags/${version}`]
  if (publishing) {
    refspecs.push(`${pages.commit}:refs/heads/${options.pagesBranch}`)
  }

  let publishedLine = '  published      nothing, the workflow will do it'
  if (publishing) {
    publishedLine = `  published      ${pages.fileCount} files as ${pages.commit.slice(0, 10)} on ${options.pagesBranch}`
  } else if (pages) {
    publishedLine = `  published      nothing, ${options.pagesBranch} already matches this build`
  }

  const summary = [
    colour('bold', 'Release summary'),
    `  version        ${version}`,
    `  source commit  ${sourceSha.slice(0, 10)} on ${branch}`,
    `  tag            ${version}${options.dryRun ? ' (not created)' : ''}`,
    publishedLine,
    `  committed as   ${identity}`,
    '',
    `  ${colour('bold', 'git push')} --atomic ${options.remote}`,
    ...refspecs.map((refspec) => `    ${refspec}`),
    '',
    '  pushing the tag also runs .github/workflows/release.yml',
    `  site           ${pagesUrl}`
  ].join('\n')

  if (options.dryRun) {
    console.log(`\n${summary}`)
    step('Dry run finished')
    note('nothing was committed, tagged or pushed')
    return
  }

  if (!await confirm(summary, options)) {
    step('Stopped')
    note(`the tag ${version} exists locally but was not pushed`)
    note(`to undo: git tag -d ${version}`)
    return
  }

  step(`Pushing to ${options.remote}`)
  // --atomic so a partly-published release is not possible: either the branch,
  // the tag and gh-pages all move, or none of them do.
  git(['push', '--atomic', options.remote, ...refspecs])
  info('pushed')

  step(`Released ${version}`)
  info(`${pagesUrl} will update once GitHub Pages rebuilds`)
  note('watch the release workflow: gh run list --workflow=release.yml')
})
