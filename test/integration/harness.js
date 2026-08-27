import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

/**
 * Synchronous stdout write.
 *
 * console.log is buffered, and app.exit() tears the process down without
 * draining it, so anything logged shortly before the exit is lost when stdout is
 * a pipe rather than a terminal. That silently swallowed the results report.
 */
export function write (line = '') {
  fs.writeSync(1, `${line}\n`)
}

const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

/**
 * Serves the production build over http, plus a few extra routes the ?gpx=
 * checks need.
 *
 * http rather than file://, because a file:// page has a null origin and would
 * not exercise the Content-Security-Policy or cross-origin rules the way the
 * deployed app does.
 */
export function startServer ({ dist, routes = {} }) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')

    const route = routes[url.pathname]
    if (route) {
      res.writeHead(route.status || 200, { 'content-type': route.type || 'application/gpx+xml' })
      res.end(route.body ?? '')
      return
    }

    const file = path.join(dist, url.pathname === '/' ? 'index.html' : url.pathname)
    if (!file.startsWith(dist)) {
      res.writeHead(403)
      res.end()
      return
    }

    fs.readFile(file, (error, body) => {
      if (error) {
        res.writeHead(404)
        res.end()
        return
      }
      res.writeHead(200, { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' })
      res.end(body)
    })
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port })
    })
  })
}

/**
 * Minimal assertion collector. Every check is recorded so one failure does not
 * hide the rest, and the run exits non-zero if anything failed.
 */
export class Checks {
  constructor () {
    this.results = []
  }

  ok (name, condition, detail) {
    const passed = Boolean(condition)
    // Detail is only worth printing when something went wrong; including it on
    // every pass buried the failures in noise.
    this.results.push({ name, passed, detail: passed ? undefined : detail })
  }

  equal (name, actual, expected) {
    const passed = Object.is(actual, expected)
    this.results.push({
      name,
      passed,
      detail: passed ? undefined : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    })
  }

  close (name, actual, expected, tolerance) {
    const passed = Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance
    this.results.push({
      name,
      passed,
      detail: passed ? undefined : `expected ${expected} +/- ${tolerance}, got ${actual}`
    })
  }

  get failures () {
    return this.results.filter((result) => !result.passed)
  }

  report () {
    for (const result of this.results) {
      const mark = result.passed ? 'PASS' : 'FAIL'
      write(`  ${mark}  ${result.name}${result.detail ? ` -- ${result.detail}` : ''}`)
    }
    const passed = this.results.length - this.failures.length
    write('')
    write(`${passed}/${this.results.length} checks passed`)
    if (this.failures.length > 0) {
      write(`${this.failures.length} FAILED`)
    }
    return this.failures.length === 0
  }
}

/**
 * Builds the snippet of page-side code the checks run, wrapping it so a thrown
 * error comes back as data instead of an unhandled rejection that would hang the
 * Electron process.
 */
export function inPage (body) {
  return `(async () => {
    const out = {}
    try {
      ${body}
    } catch (error) {
      out.__error = String(error && error.message)
      out.__stack = String(error && error.stack)
    }
    return out
  })()`
}
