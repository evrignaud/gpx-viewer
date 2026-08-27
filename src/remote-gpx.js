import { logger } from './config.js'

// A GPX file is text; anything much larger than this is not one, and we would
// rather refuse it than lock the tab up parsing it.
const MAX_BYTES = 25 * 1024 * 1024

/**
 * Reads `?gpx=` parameters from the current URL. Repeating the parameter loads
 * several tracks, which makes a set of tracks shareable as a single link.
 */
export function remoteGpxUrls (search = window.location.search) {
  return new URLSearchParams(search).getAll('gpx').filter(Boolean)
}

/**
 * Only http(s) is accepted. Without this check a `?gpx=` value could name any
 * scheme the browser understands, and the app would be handing arbitrary
 * attacker-chosen URLs to fetch on behalf of whoever opened the link.
 */
function parseUrl (candidate) {
  let url
  try {
    url = new URL(candidate, window.location.href)
  } catch (error) {
    throw new Error('not a valid URL', { cause: error })
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`unsupported scheme "${url.protocol}"`)
  }
  return url
}

/**
 * Fetches one remote GPX file.
 *
 * The remote host has to send permissive CORS headers; a browser cannot read a
 * cross-origin response without them. That failure is reported rather than
 * swallowed, because it is by far the most likely one.
 */
export async function fetchGpx (candidate, { signal } = {}) {
  const url = parseUrl(candidate)

  let response
  try {
    response = await fetch(url, { signal, redirect: 'follow', referrerPolicy: 'no-referrer' })
  } catch (error) {
    logger.debug('Remote GPX fetch failed', error)
    throw new Error(
      'the request failed, which usually means the server does not allow cross-origin reads (CORS)',
      { cause: error }
    )
  }

  if (!response.ok) {
    throw new Error(`the server answered ${response.status} ${response.statusText}`)
  }

  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
    throw new Error('the file is too large')
  }

  const text = await response.text()
  if (text.length > MAX_BYTES) {
    throw new Error('the file is too large')
  }

  const name = decodeURIComponent(url.pathname.split('/').pop() || 'remote.gpx')
  return { name, text }
}

/**
 * Loads every `?gpx=` URL into the store, reporting each failure individually so
 * one bad link does not hide the others.
 */
export async function loadRemoteGpx ({ urls, store, onError }) {
  for (const candidate of urls) {
    try {
      const { name, text } = await fetchGpx(candidate)
      store.pendingCount += 1
      store.addGpx(text, name)
    } catch (error) {
      onError(`Could not load "${candidate}": ${error.message}`)
    }
  }
}
