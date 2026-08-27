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
 *   --remote <name>    default: origin
 *   --branch <name>    branch to release from, default: master
 *   --pages-branch <n> branch to publish to, default: gh-pages
 *
 * Written in Node rather than a shell script so it behaves the same on Windows
 * and Linux, and so it can use the repository's own tooling.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(repoRoot, 'dist')
const packageJsonPath = path.join(repoRoot, 'package.json')

// Read straight from disk rather than through import or require, both of which
// cache: `npm version` rewrites this file part-way through the run.
const readPackage = () => JSON.parse(readFileSync(packageJsonPath, 'utf8'))

// npm is a .cmd shim on Windows, which execFile cannot launch without it.
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const BUMPS = new Set(['patch', 'minor', 'major'])
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

// ---------------------------------------------------------------- utilities ---

const styles = { bold: '\u001B[1m', dim: '\u001B[2m', red: '\u001B[31m', green: '\u001B[32m', yellow: '\u001B[33m', reset: '\u001B[0m' }
const colour = (name, text) => (process.stdout.isTTY ? `${styles[name]}${text}${styles.reset}` : text)

const step = (message) => console.log(`\n${colour('bold', '==>')} ${colour('bold', message)}`)
const info = (message) => console.log(`    ${message}`)
const note = (message) => console.log(`    ${colour('dim', message)}`)
const warn = (message) => console.log(`    ${colour('yellow', 'warning:')} ${message}`)

class ReleaseError extends Error {}

const fail = (message) => {
  throw new ReleaseError(message)
}

function git (args, { input, env, allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      input,
      env: env || process.env,
      maxBuffer: 64 * 1024 * 1024
    }).trim()
  } catch (error) {
    if (allowFailure) {
      return null
    }
    const detail = `${error.stderr || ''}${error.stdout || ''}`.trim()
    throw new ReleaseError(`git ${args.join(' ')} failed${detail ? `:\n${detail}` : ''}`, { cause: error })
  }
}

function npm (args) {
  execFileSync(NPM, args, { cwd: repoRoot, stdio: 'inherit' })
}

// ------------------------------------------------------------------- options ---

function parseArgs (argv) {
  const options = {
    version: null,
    dryRun: false,
    yes: false,
    skipChecks: false,
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
        if (!BUMPS.has(arg) && !SEMVER.test(arg)) {
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
  --remote <name>    default: origin
  --branch <name>    branch to release from, default: master
  --pages-branch <n> branch to publish to, default: gh-pages
`)
}

// ----------------------------------------------------------------- preflight ---

const readVersion = () => readPackage().version

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
  const remoteTag = git(['ls-remote', '--tags', options.remote, `refs/tags/${tag}`], { allowFailure: true })
  if (remoteTag) {
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

  // GitHub Pages serves this project from the /gpx-viewer/ sub-path, so every
  // asset URL has to be relative. An absolute one means vite.config.js lost its
  // `base: './'`, which would break the published site while leaving the local
  // preview working.
  const html = readFileSync(indexHtml, 'utf8')
  const absolute = html.match(/(?:src|href)="\/[^"]*"/g)
  if (absolute) {
    fail(`the built index.html has root-absolute asset URLs, which will 404 under a sub-path:\n  ${absolute.join('\n  ')}\n\nCheck that vite.config.js still sets base: './'.`)
  }
  info('asset URLs are relative')
}

// ------------------------------------------------------------ pages publish ---

function collectFiles (dir, prefix = '') {
  const found = []
  for (const entry of readdirSync(dir).sort()) {
    const absolute = path.join(dir, entry)
    // Always forward slashes: this becomes a path inside a git tree.
    const repoPath = prefix ? `${prefix}/${entry}` : entry
    if (statSync(absolute).isDirectory()) {
      found.push(...collectFiles(absolute, repoPath))
    } else {
      found.push({ absolute, repoPath })
    }
  }
  return found
}

/**
 * Builds a commit whose tree is exactly the contents of dist/, and points the
 * pages branch at it.
 *
 * Done with plumbing against a throwaway index rather than by checking the
 * branch out, so the working tree, the real index and the current branch are
 * never touched. That also sidesteps dist/ being listed in .gitignore.
 *
 * The tree is built from scratch, so files from an earlier release disappear
 * instead of lingering: gh-pages currently still holds webpack-era bundles.
 */
function buildPagesCommit ({ version, sourceSha, sourceBranch, options }) {
  step(`Preparing the ${options.pagesBranch} commit`)

  const files = collectFiles(distDir)
  if (files.length === 0) {
    fail('dist/ is empty, nothing to publish')
  }

  const indexFile = path.join(tmpdir(), `gpx-viewer-pages-index-${process.pid}-${Date.now()}`)
  const env = { ...process.env, GIT_INDEX_FILE: indexFile }

  const entries = []
  for (const file of files) {
    // --no-filters keeps the bytes exactly as built. Without it the repository's
    // `* text=auto` attribute could rewrite line endings inside published
    // assets, and corrupt the binary ones.
    const sha = git(['hash-object', '-w', '--no-filters', '--', file.absolute])
    entries.push(`100644 ${sha}\t${file.repoPath}`)
  }

  // .nojekyll stops GitHub Pages running the output through Jekyll, which
  // ignores paths beginning with an underscore.
  const nojekyll = git(['hash-object', '-w', '--stdin'], { input: '' })
  entries.push(`100644 ${nojekyll}\t.nojekyll`)

  git(['update-index', '--index-info'], { input: `${entries.join('\n')}\n`, env })
  const tree = git(['write-tree'], { env })

  rmSync(indexFile, { force: true })

  const parent = git(
    ['rev-parse', '--verify', '--quiet', `refs/remotes/${options.remote}/${options.pagesBranch}`],
    { allowFailure: true }
  )

  if (parent) {
    const existing = git(['rev-parse', `${parent}^{tree}`])
    if (existing === tree) {
      info(`${options.pagesBranch} already publishes exactly this output`)
    }
  } else {
    note(`${options.remote}/${options.pagesBranch} does not exist yet, starting its history`)
  }

  // The provenance lines are the point of "the accurate commit": they say which
  // source commit produced the published files.
  const message = [
    `Publish gpx-viewer ${version}`,
    [
      `Source-Commit: ${sourceSha}`,
      `Source-Branch: ${sourceBranch}`,
      `Release-Tag: ${version}`,
      `Built-At: ${new Date().toISOString()}`
    ].join('\n')
  ]

  const commitArgs = ['commit-tree', tree]
  if (parent) {
    commitArgs.push('-p', parent)
  }
  for (const paragraph of message) {
    commitArgs.push('-m', paragraph)
  }

  const commit = git(commitArgs)
  info(`${files.length + 1} files, tree ${tree.slice(0, 10)}, commit ${commit.slice(0, 10)}`)

  return { commit, parent, fileCount: files.length + 1 }
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

async function main () {
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
  const pages = buildPagesCommit({ version, sourceSha, sourceBranch: branch, options })

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

  const refspecs = []
  if (changed) {
    refspecs.push(`refs/heads/${branch}:refs/heads/${branch}`)
  }
  refspecs.push(`refs/tags/${version}:refs/tags/${version}`)
  refspecs.push(`${pages.commit}:refs/heads/${options.pagesBranch}`)

  const summary = [
    colour('bold', 'Release summary'),
    `  version        ${version}`,
    `  source commit  ${sourceSha.slice(0, 10)} on ${branch}`,
    `  tag            ${version}${options.dryRun ? ' (not created)' : ''}`,
    `  published      ${pages.fileCount} files as ${pages.commit.slice(0, 10)} on ${options.pagesBranch}`,
    `  committed as   ${identity}`,
    '',
    `  ${colour('bold', 'git push')} --atomic ${options.remote}`,
    ...refspecs.map((refspec) => `    ${refspec}`),
    '',
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
    note(`the tag ${version} and the ${options.pagesBranch} commit exist locally but were not pushed`)
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
}

try {
  await main()
} catch (error) {
  if (error instanceof ReleaseError) {
    console.error(`\n${colour('red', 'Release aborted:')} ${error.message}`)
    process.exit(1)
  }
  throw error
}
