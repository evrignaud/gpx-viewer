/**
 * Builds the GitHub Pages commit.
 *
 * Shared by scripts/release.js, which can publish from a workstation, and
 * scripts/publish-pages.js, which the tag-triggered workflow runs. One
 * implementation, so the two paths cannot produce different results.
 */
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { identityEnv } from './identity.js'
import { distDir, fail, git, info, note, step } from './run.js'

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
 * GitHub Pages serves this project from the /gpx-viewer/ sub-path, so every
 * asset URL has to be relative. An absolute one means vite.config.js lost its
 * `base: './'`, which would break the published site while leaving the local
 * preview working, so it is worth failing the release over.
 */
export function assertRelativeAssetUrls (indexHtml) {
  const html = readFileSync(indexHtml, 'utf8')
  const absolute = html.match(/(?:src|href)="\/[^"]*"/g)
  if (absolute) {
    fail(
      'the built index.html has root-absolute asset URLs, which will 404 under a sub-path:\n  ' +
      `${absolute.join('\n  ')}\n\nCheck that vite.config.js still sets base: './'.`
    )
  }
}

/**
 * Builds a commit whose tree is exactly the contents of dist/.
 *
 * Done with plumbing against a throwaway index rather than by checking the
 * branch out, so the working tree, the real index and the current branch are
 * never touched. That also sidesteps dist/ being listed in .gitignore.
 *
 * The tree is built from scratch, so files from an earlier release disappear
 * instead of lingering: gh-pages held webpack-era bundles from 2017.
 *
 * Returns `{ commit: null, unchanged: true }` when the branch already publishes
 * this exact tree, which makes publishing idempotent. That matters now that a
 * tag push triggers a release: tagging locally and letting the workflow publish
 * must not produce a second, identical commit.
 */
export function buildPagesCommit ({ version, sourceSha, sourceRef, remote, pagesBranch, identity }) {
  step(`Preparing the ${pagesBranch} commit`)

  if (!identity?.name || !identity?.email) {
    fail('buildPagesCommit needs an identity: commit-tree cannot author a commit without one')
  }

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
    ['rev-parse', '--verify', '--quiet', `refs/remotes/${remote}/${pagesBranch}`],
    { allowFailure: true }
  )

  if (parent) {
    if (git(['rev-parse', `${parent}^{tree}`]) === tree) {
      info(`${pagesBranch} already publishes exactly this output, nothing to do`)
      return { commit: null, parent, tree, fileCount: files.length + 1, unchanged: true }
    }
  } else {
    note(`${remote}/${pagesBranch} does not exist yet, starting its history`)
  }

  // The provenance lines are the point: they record which source commit produced
  // the published files.
  const paragraphs = [
    `Publish gpx-viewer ${version}`,
    [
      `Source-Commit: ${sourceSha}`,
      `Source-Ref: ${sourceRef}`,
      `Release-Tag: ${version}`,
      `Built-At: ${new Date().toISOString()}`
    ].join('\n')
  ]

  const commitArgs = ['commit-tree', tree]
  if (parent) {
    commitArgs.push('-p', parent)
  }
  for (const paragraph of paragraphs) {
    commitArgs.push('-m', paragraph)
  }

  // The identity goes in through the environment rather than git config, so this
  // works on a runner where no identity is configured at all.
  const commit = git(commitArgs, { env: { ...process.env, ...identityEnv(identity) } })
  info(`${files.length + 1} files, tree ${tree.slice(0, 10)}, commit ${commit.slice(0, 10)}`)
  info(`authored by ${identity.name} <${identity.email}> (${identity.source || 'given'})`)

  return { commit, parent, tree, fileCount: files.length + 1, unchanged: false }
}
