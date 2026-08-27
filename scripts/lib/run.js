/**
 * Shared process plumbing and output helpers for the scripts in this folder.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const distDir = path.join(repoRoot, 'dist')

const packageJsonPath = path.join(repoRoot, 'package.json')

// Read straight from disk rather than through import or require, both of which
// cache: `npm version` rewrites this file part-way through a release.
export const readPackage = () => JSON.parse(readFileSync(packageJsonPath, 'utf8'))

// On Windows npm is a .cmd shim, and since the fix for CVE-2024-27980 Node
// refuses to spawn .cmd or .bat without a shell, failing with EINVAL. Hence
// shell: true there. Do not remove it: the scripts cannot run npm on Windows
// without it.
const NEEDS_SHELL = process.platform === 'win32'

const styles = {
  bold: '\u001B[1m',
  dim: '\u001B[2m',
  red: '\u001B[31m',
  yellow: '\u001B[33m',
  reset: '\u001B[0m'
}

export const colour = (name, text) => (process.stdout.isTTY ? `${styles[name]}${text}${styles.reset}` : text)

export const step = (message) => console.log(`\n${colour('bold', '==>')} ${colour('bold', message)}`)
export const info = (message) => console.log(`    ${message}`)
export const note = (message) => console.log(`    ${colour('dim', message)}`)
export const warn = (message) => console.log(`    ${colour('yellow', 'warning:')} ${message}`)

/** Thrown for anything the user can act on, and reported without a stack. */
class ScriptError extends Error {}

export const fail = (message, options) => {
  throw new ScriptError(message, options)
}

export function git (args, { input, env, allowFailure = false } = {}) {
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
    throw new ScriptError(`git ${args.join(' ')} failed${detail ? `:\n${detail}` : ''}`, { cause: error })
  }
}

export function npm (args) {
  // Going through a shell means arguments are re-parsed by it, so refuse
  // anything that could be read as shell syntax. Every argument passed here is
  // either a literal or a version already matched against SEMVER, so this only
  // guards against a future edit introducing something unsafe.
  for (const arg of args) {
    if (!/^[A-Za-z0-9._@/-]+$/.test(arg)) {
      fail(`refusing to pass "${arg}" to npm: unexpected characters`)
    }
  }

  try {
    execFileSync('npm', args, { cwd: repoRoot, stdio: 'inherit', shell: NEEDS_SHELL })
  } catch (error) {
    fail(`npm ${args.join(' ')} failed`, { cause: error })
  }
}

/**
 * Escapes a string for a GitHub Actions workflow command, where a raw newline
 * would end the annotation early.
 */
function encodeAnnotation (message) {
  return message
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A')
}

/** Wraps a script's entry point so expected failures print cleanly. */
export async function runScript (main) {
  try {
    await main()
  } catch (error) {
    if (error instanceof ScriptError) {
      console.error(`\n${colour('red', 'Aborted:')} ${error.message}`)

      // Also emitted as a workflow annotation. Actions job logs need
      // authentication to read, whereas annotations are available on the check
      // run, so this is what makes a CI failure diagnosable without trawling
      // the log by hand.
      if (process.env.GITHUB_ACTIONS) {
        const script = process.argv[1] ? path.basename(process.argv[1]) : 'script'
        console.error(`::error title=${script}::${encodeAnnotation(error.message)}`)
      }

      process.exit(1)
    }
    throw error
  }
}
