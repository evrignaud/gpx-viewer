import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchGpx, loadRemoteGpx, remoteGpxUrls } from '../src/remote-gpx.js'

const GPX = '<?xml version="1.0"?><gpx version="1.1"><trk><name>t</name></trk></gpx>'

function respondWith (body, init = {}) {
  return vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers: new Headers(init.headers || {}),
    text: () => Promise.resolve(body)
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('remoteGpxUrls', () => {
  it('collects every gpx parameter, so a link can carry several tracks', () => {
    expect(remoteGpxUrls('?gpx=a.gpx&gpx=b.gpx&gpx=c.gpx')).toEqual(['a.gpx', 'b.gpx', 'c.gpx'])
  })

  it('ignores empty values and unrelated parameters', () => {
    expect(remoteGpxUrls('?gpx=&debug=true&other=x')).toEqual([])
    expect(remoteGpxUrls('')).toEqual([])
  })
})

describe('fetchGpx scheme handling', () => {
  // Rejecting anything but http(s) matters: the parameter comes from a URL that
  // one person hands to another, so without this check the app would fetch
  // whatever scheme the browser understands on the recipient's behalf.
  it.each([
    'javascript:alert(1)',
    'file:///etc/passwd',
    'data:text/xml,<gpx></gpx>',
    'blob:http://localhost/abc'
  ])('refuses %s', async (candidate) => {
    const fetchMock = respondWith(GPX)
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchGpx(candidate)).rejects.toThrow(/unsupported scheme/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a value that is not a URL at all', async () => {
    const fetchMock = respondWith(GPX)
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchGpx('http://')).rejects.toThrow(/not a valid URL/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts http and https', async () => {
    vi.stubGlobal('fetch', respondWith(GPX))
    await expect(fetchGpx('https://example.test/a.gpx')).resolves.toMatchObject({ text: GPX })
    await expect(fetchGpx('http://example.test/a.gpx')).resolves.toMatchObject({ text: GPX })
  })
})

describe('fetchGpx results', () => {
  it('derives a file name from the path', async () => {
    vi.stubGlobal('fetch', respondWith(GPX))
    const { name } = await fetchGpx('https://example.test/tracks/Col%20du%20Galibier.gpx')
    expect(name).toBe('Col du Galibier.gpx')
  })

  it('falls back to a default name when the path has none', async () => {
    vi.stubGlobal('fetch', respondWith(GPX))
    const { name } = await fetchGpx('https://example.test/')
    expect(name).toBe('remote.gpx')
  })

  it('reports the status for a failed response', async () => {
    vi.stubGlobal('fetch', respondWith('nope', { ok: false, status: 404, statusText: 'Not Found' }))
    await expect(fetchGpx('https://example.test/missing.gpx')).rejects.toThrow(/404 Not Found/)
  })

  it('names CORS in the message when the request itself fails', async () => {
    // By far the most common reason a cross-origin GPX will not load, so the
    // error says so instead of leaving the user guessing.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(fetchGpx('https://example.test/a.gpx')).rejects.toThrow(/CORS/)
  })

  it('refuses a file whose declared length is too large', async () => {
    vi.stubGlobal('fetch', respondWith(GPX, { headers: { 'content-length': String(80 * 1024 * 1024) } }))
    await expect(fetchGpx('https://example.test/huge.gpx')).rejects.toThrow(/too large/)
  })

  it('refuses a body that turns out to be too large', async () => {
    vi.stubGlobal('fetch', respondWith('x'.repeat(26 * 1024 * 1024)))
    await expect(fetchGpx('https://example.test/huge.gpx')).rejects.toThrow(/too large/)
  })
})

describe('loadRemoteGpx', () => {
  it('reports each failure separately so one bad link does not hide the others', async () => {
    vi.stubGlobal('fetch', respondWith(GPX))

    const store = { pendingCount: 0, addGpx: vi.fn() }
    const onError = vi.fn()

    await loadRemoteGpx({
      urls: ['https://example.test/ok.gpx', 'javascript:alert(1)', 'file:///etc/passwd'],
      store,
      onError
    })

    expect(store.addGpx).toHaveBeenCalledTimes(1)
    expect(store.addGpx).toHaveBeenCalledWith(GPX, 'ok.gpx')
    expect(onError).toHaveBeenCalledTimes(2)
    expect(onError.mock.calls.map(([message]) => message).join('\n')).toMatch(/javascript:[\s\S]*file:/)
  })

  it('counts each accepted file as pending so the busy state stays correct', async () => {
    vi.stubGlobal('fetch', respondWith(GPX))
    const store = { pendingCount: 0, addGpx: vi.fn() }
    await loadRemoteGpx({
      urls: ['https://example.test/a.gpx', 'https://example.test/b.gpx'],
      store,
      onError: vi.fn()
    })
    expect(store.pendingCount).toBe(2)
  })
})
