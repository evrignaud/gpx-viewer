#!/usr/bin/env node
/**
 * Publishes the built dist/ to the GitHub Pages branch.
 *
 * This is the step the tag-triggered release workflow runs. It shares its
 * implementation with scripts/release.js through scripts/lib/pages.js, so
 * publishing from CI and publishing from a workstation cannot diverge.
 *
 * Usage:
 *   node scripts/publish-pages.js --version 0.3.0 [options]
 *
 * Options:
 *   --version <v>      version to record in the commit message. Defaults to the
 *                      version in package.json.
 *   --source-ref <r>   ref being released, recorded in the commit message.
 *                      Defaults to $GITHUB_REF_NAME, then the current branch.
 *   --dry-run          build the commit and report it, push nothing
 *   --remote <name>    default: origin
 *   --pages-branch <n> default: gh-pages
 */
import { appendFileSync, existsSync } from 'node:fs'
import path from 'node:path'

import { fromGitConfig, fromHead, fromTag, resolveIdentity } from './lib/identity.js'
import { assertRelativeAssetUrls, buildPagesCommit } from './lib/pages.js'
import { distDir, fail, git, info, note, readPackage, runScript, step } from './lib/run.js'

function parseArgs (argv) {
  const options = {
    version: null,
    sourceRef: null,
    dryRun: false,
    remote: 'origin',
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
      case '--version': options.version = takeValue(arg, i); i++; break
      case '--source-ref': options.sourceRef = takeValue(arg, i); i++; break
      case '--remote': options.remote = takeValue(arg, i); i++; break
      case '--pages-branch': options.pagesBranch = takeValue(arg, i); i++; break
      case '--dry-run': options.dryRun = true; break
      default: fail(`unknown argument "${arg}"`)
    }
  }

  return options
}

/** Exposes values to later workflow steps when running under Actions. */
function report (values) {
  if (!process.env.GITHUB_OUTPUT) {
    return
  }
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`)
  appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`)
}

await runScript(async () => {
  const options = parseArgs(process.argv.slice(2))

  const version = options.version || readPackage().version
  const sourceRef = options.sourceRef ||
    process.env.GITHUB_REF_NAME ||
    git(['rev-parse', '--abbrev-ref', 'HEAD'])

  step('Checking the build')
  const indexHtml = path.join(distDir, 'index.html')
  if (!existsSync(indexHtml)) {
    fail('no dist/index.html. Run "npm run build" first.')
  }
  assertRelativeAssetUrls(indexHtml)
  info('asset URLs are relative')

  // The workflow checks out a tag, so HEAD is the released commit.
  const sourceSha = git(['rev-parse', 'HEAD'])

  // actions/checkout only fetches the ref it checks out, so the pages branch is
  // not present on a runner. Fetching it gives buildPagesCommit a parent to build
  // on, which keeps publishing a fast-forward rather than replacing the branch.
  // Not shallow: gh-pages history is tiny, and a shallow fetch into an otherwise
  // complete clone leaves the repository in a mixed state.
  step(`Fetching ${options.remote}/${options.pagesBranch}`)

  // Asked for separately so "the branch does not exist" and "the branch exists
  // but could not be fetched" are told apart. Getting that wrong is quiet and
  // nasty: with no local ref, buildPagesCommit starts a fresh history, and
  // pushing a parentless commit over an existing branch is then rejected as a
  // non-fast-forward, which says nothing about the real cause.
  const remoteHead = git(
    ['ls-remote', '--heads', options.remote, `refs/heads/${options.pagesBranch}`],
    { allowFailure: true }
  )
  const existsOnRemote = Boolean(remoteHead)

  const fetched = git(
    ['fetch', options.remote,
      `+refs/heads/${options.pagesBranch}:refs/remotes/${options.remote}/${options.pagesBranch}`],
    { allowFailure: true }
  )

  const localRef = git(
    ['rev-parse', '--verify', '--quiet', `refs/remotes/${options.remote}/${options.pagesBranch}`],
    { allowFailure: true }
  )

  if (existsOnRemote && !localRef) {
    fail(
      `${options.pagesBranch} exists on ${options.remote} but could not be fetched.\n` +
      'Publishing now would replace its history rather than add to it, so stopping here.'
    )
  }
  if (!existsOnRemote) {
    note(`${options.pagesBranch} does not exist on ${options.remote} yet`)
  } else {
    info(`at ${localRef.slice(0, 10)}${fetched === null ? ' (already present)' : ''}`)
  }

  // The tagger first: this commit exists because somebody tagged a release, so
  // it belongs to them. A runner has no git config at all, which is why the
  // identity has to be worked out rather than left to git.
  const identity = resolveIdentity([
    () => fromTag(sourceRef),
    fromHead,
    fromGitConfig
  ])

  const pages = buildPagesCommit({
    version,
    sourceSha,
    sourceRef,
    remote: options.remote,
    pagesBranch: options.pagesBranch,
    identity
  })

  // Handed to the version-sync job, so its commit carries the same name.
  report({ author_name: identity.name, author_email: identity.email })

  if (pages.unchanged) {
    step('Nothing to publish')
    note('the published output already matches this build')
    return
  }

  if (options.dryRun) {
    step('Dry run finished')
    note(`would push ${pages.commit.slice(0, 10)} to ${options.remote}/${options.pagesBranch}`)
    return
  }

  step(`Pushing to ${options.remote}/${options.pagesBranch}`)
  // git's own stderr is reported verbatim by the git helper, which is enough:
  // guessing at causes here only added noise for the one that actually happened.
  git(['push', options.remote, `${pages.commit}:refs/heads/${options.pagesBranch}`])
  info(`published ${pages.fileCount} files as ${pages.commit.slice(0, 10)}`)

  const url = readPackage().homepage
  if (url) {
    note(`${url} will update once GitHub Pages rebuilds`)
  }
})
