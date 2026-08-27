/**
 * Integration check for the production build.
 *
 * Runs the real bundle in a real browser engine, because that is where this
 * project's bugs actually lived: bundling breaking Leaflet's icon URLs, a plugin
 * whose ESM build does not register its factory, panels overlapping on a phone,
 * unit conversion reaching the DOM. None of that is visible to jsdom, which has
 * no layout engine.
 *
 * Launched by Electron, not by Vitest: run `npm run test:integration`.
 */
import { app, BrowserWindow, session } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { NOT_GPX, NO_TRACKS, TRACK_A, TRACK_B } from './fixtures.js'
import { Checks, inPage, startServer, write } from './harness.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(here, '..', '..', 'dist')

const checks = new Checks()

/**
 * Every URL requested during the whole run.
 *
 * Collected by a single handler installed once, because re-registering
 * webRequest.onBeforeRequest on a session makes the next loadURL fail with
 * ERR_FAILED, and giving each window its own partition crashes the process.
 * A run-wide list is the stronger assertion anyway: no window may ever reach a
 * third-party font host.
 */
// Each check destroys its window when it is done. Electron quits by default once
// the last window closes, which ended the run after the first section and exited
// 0 before any results were reported. This keeps the process alive until the
// results have been written.
app.on('window-all-closed', () => {})

const allRequests = []

function installRequestRecorder () {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    allRequests.push(details.url)
    callback({})
  })
}

/**
 * Windows share the default session, so the unit preference one check writes to
 * localStorage would otherwise change what the next one sees.
 */
function clearStoredPreferences () {
  return session.defaultSession.clearStorageData({ storages: ['localstorage'] })
}

function openWindow (width, height) {
  return new BrowserWindow({
    show: false,
    width,
    height,
    webPreferences: { contextIsolation: true, sandbox: false, offscreen: true }
  })
}

function record (win) {
  const messages = []
  win.webContents.on('console-message', (event) => {
    messages.push(`[${event.level ?? 'log'}] ${event.message ?? ''}`)
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    messages.push(`[fatal] renderer gone: ${JSON.stringify(details)}`)
  })
  return { messages }
}

const HELPERS = `
  const text = (sel) => (document.querySelector(sel) || {}).textContent || null
  const rows = () => [...document.querySelectorAll('#track-list .track-item')]
  const paths = () => document.querySelectorAll('.leaflet-overlay-pane path').length
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const drop = (files) => {
    const dt = new DataTransfer()
    for (const [name, body] of files) {
      dt.items.add(new File([body], name, { type: 'application/gpx+xml' }))
    }
    const appEl = document.getElementById('app')
    appEl.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }))
    appEl.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }))
  }
  const rect = (sel) => {
    const el = document.querySelector(sel)
    if (!el || el.hidden || el.offsetParent === null) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  }
`

async function checkDesktop (port) {
  const win = openWindow(1280, 900)
  const { messages } = record(win)

  await win.loadURL(`http://127.0.0.1:${port}/`)
  await new Promise((resolve) => setTimeout(resolve, 2000))

  const result = await win.webContents.executeJavaScript(inPage(`
    ${HELPERS}
    await document.fonts.ready

    out.booted = document.getElementById('splash').hidden
    out.controls = {
      zoom: !!document.querySelector('.leaflet-control-zoom'),
      layers: !!document.querySelector('.leaflet-control-layers'),
      scale: !!document.querySelector('.leaflet-control-scale'),
      fullscreen: !!document.querySelector('.leaflet-control-zoom-fullscreen'),
      locate: !!document.querySelector('.leaflet-control-locate')
    }
    out.baseLayers = [...document.querySelectorAll('.leaflet-control-layers-base label')].length
    out.overlays = [...document.querySelectorAll('.leaflet-control-layers-overlays label')].length
    out.fontResolvesToLato = getComputedStyle(document.body).fontFamily.toLowerCase().includes('lato')

    // --- one track ---------------------------------------------------------
    drop([['alpha.gpx', ${JSON.stringify(TRACK_A)}]])
    await wait(2500)

    out.single = {
      name: text('.info-name'),
      distance: text('.info-distance'),
      duration: text('.info-duration'),
      pace: text('.info-pace'),
      gainIsNumber: /^[0-9]+$/.test(text('.info-elevation-gain') || ''),
      chartLines: document.querySelectorAll('.elevation-line').length,
      chartAreas: document.querySelectorAll('.elevation-area').length,
      // start pin, end pin and the waypoint
      markers: document.querySelectorAll('.leaflet-marker-pane img').length,
      // Leaflet's bundled default icon would be a same-origin asset URL; the
      // project's own pins are small enough that Vite inlines them.
      markersUseProjectPins: [...document.querySelectorAll('.leaflet-marker-pane img')]
        .every((img) => img.src.startsWith('data:image/png')),
      rows: rows().length
    }

    // --- second track: overlaid, not concatenated --------------------------
    drop([['beta.gpx', ${JSON.stringify(TRACK_B)}]])
    await wait(2500)

    out.multi = {
      chartLines: document.querySelectorAll('.elevation-line').length,
      chartAreas: document.querySelectorAll('.elevation-area').length,
      polylines: paths(),
      rows: rows().length,
      distinctColours: [...new Set([...document.querySelectorAll('.elevation-line')]
        .map((p) => p.getAttribute('stroke')))].length,
      totalDistance: text('.info-total-distance'),
      singleDistances: rows().map((r) => r.querySelector('.track-distance').textContent)
    }

    // --- hide, show, remove ------------------------------------------------
    const totalBoth = text('.info-total-distance')
    const before = paths()
    const box = rows()[0].querySelector('input[type=checkbox]')
    box.checked = false
    box.dispatchEvent(new Event('change', { bubbles: true }))
    await wait(400)
    out.hide = {
      polylinesDropped: paths() < before,
      totalChanged: text('.info-total-distance') !== totalBoth,
      chartLines: document.querySelectorAll('.elevation-line').length,
      count: document.getElementById('track-count').textContent,
      struckThrough: rows()[0].classList.contains('is-hidden-track')
    }

    document.getElementById('tracks-show-all').click()
    await wait(400)
    out.showAll = {
      totalRestored: text('.info-total-distance') === totalBoth,
      count: document.getElementById('track-count').textContent
    }

    const rowsBefore = rows().length
    rows()[0].querySelector('button[data-action=remove]').click()
    await wait(500)
    out.remove = {
      rowsDropped: rows().length === rowsBefore - 1,
      chartLines: document.querySelectorAll('.elevation-line').length
    }

    // --- units -------------------------------------------------------------
    const axisLabels = () => [...document.querySelectorAll('.elevation-axis-label')].map((t) => t.textContent)
    const metricDistance = Number(text('.info-total-distance'))
    const metricGain = Number(text('.info-elevation-gain'))
    out.unitsMetric = { axis: axisLabels(), scale: text('.leaflet-control-scale-line') }

    document.getElementById('unit-toggle').click()
    await wait(400)
    out.unitsImperial = {
      axis: axisLabels(),
      label: document.getElementById('unit-label').textContent,
      scale: text('.leaflet-control-scale-line'),
      distanceRatio: metricDistance / Number(text('.info-total-distance')),
      elevationRatio: Number(text('.info-elevation-gain')) / metricGain,
      rowUnit: rows()[0].querySelector('.track-distance').textContent.split(' ').pop()
    }

    document.getElementById('unit-toggle').click()
    await wait(400)
    out.unitsBack = document.getElementById('unit-label').textContent

    // --- chart hover marks the map ----------------------------------------
    const overlay = document.querySelector('.elevation-overlay')
    const ob = overlay.getBoundingClientRect()
    overlay.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, clientX: ob.left + ob.width / 2, clientY: ob.top + ob.height / 2
    }))
    await wait(300)
    out.hover = {
      tooltip: text('.elevation-tooltip'),
      cursorVisible: document.querySelector('.elevation-cursor').style.display !== 'none',
      mapMarkers: document.querySelectorAll('path.elevation-hover-marker').length
    }
    overlay.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }))
    await wait(200)
    out.hoverCleared = document.querySelectorAll('path.elevation-hover-marker').length === 0

    // --- bad input surfaces an error, it is not swallowed ------------------
    drop([['empty.gpx', ${JSON.stringify(NO_TRACKS)}]])
    await wait(1200)
    drop([['notes.gpx', ${JSON.stringify(NOT_GPX)}]])
    await wait(1200)
    out.errors = [...document.querySelectorAll('.notice-body')].map((n) => n.textContent)
  `))

  const c = checks
  c.ok('desktop: page-side checks ran without throwing', !result.__error, result.__error || result.__stack)
  c.ok('desktop: app booted and hid the splash', result.booted)
  c.ok('desktop: no JS errors in the console',
    !messages.some((m) => /\[error\]/.test(m) && !/gpx-viewer/.test(m)),
    messages.filter((m) => /\[error\]/.test(m) && !/gpx-viewer/.test(m)).join(' | '))
  c.ok('desktop: no CSP violations',
    !messages.some((m) => /content security policy|refused to/i.test(m)),
    messages.filter((m) => /content security policy|refused to/i.test(m)).join(' | '))
  c.ok('desktop: nothing fetched from a third-party font host',
    !allRequests.some((url) => /googleapis|gstatic/i.test(url)))

  for (const [name, present] of Object.entries(result.controls || {})) {
    c.ok(`desktop: ${name} control is on the map`, present)
  }
  c.equal('desktop: seven base layers offered', result.baseLayers, 7)
  c.equal('desktop: three route overlays offered', result.overlays, 3)
  c.ok('desktop: body text resolves to the bundled Lato', result.fontResolvesToLato)

  const single = result.single || {}
  c.ok('one track: name shown in the summary', /Alpha Ridge/.test(single.name || ''), single.name)
  c.ok('one track: a distance was computed', Number(single.distance) > 0, single.distance)
  c.ok('one track: moving time is non-zero', single.duration !== '-' && single.duration !== "00'00\"", single.duration)
  c.ok('one track: pace is a value, not NaN or Infinity', single.pace !== '-' && !/NaN|Infinity/.test(single.pace || ''), single.pace)
  c.ok('one track: elevation gain is numeric', single.gainIsNumber)
  c.equal('one track: one chart line', single.chartLines, 1)
  c.equal('one track: drawn as a filled area', single.chartAreas, 1)
  c.equal('one track: start, end and waypoint pins', single.markers, 3)
  c.ok('one track: pins use the project icons, not Leaflet defaults', single.markersUseProjectPins)
  c.equal('one track: one row in the track list', single.rows, 1)

  const multi = result.multi || {}
  c.equal('two tracks: two chart lines', multi.chartLines, 2)
  c.equal('two tracks: fills dropped so neither hides the other', multi.chartAreas, 0)
  c.equal('two tracks: two polylines', multi.polylines, 2)
  c.equal('two tracks: two rows', multi.rows, 2)
  c.equal('two tracks: each drawn in its own colour', multi.distinctColours, 2)
  c.ok('two tracks: total is the sum of the rows',
    Math.abs(Number(multi.totalDistance) -
      (multi.singleDistances || []).reduce((sum, d) => sum + Number.parseFloat(d), 0)) < 0.02,
    `total ${multi.totalDistance} vs rows ${JSON.stringify(multi.singleDistances)}`)

  c.ok('hide: polyline removed from the map', result.hide?.polylinesDropped)
  c.ok('hide: totals recomputed', result.hide?.totalChanged)
  c.equal('hide: chart drops to one line', result.hide?.chartLines, 1)
  c.equal('hide: header shows the visible count', result.hide?.count, 'Tracks (1/2)')
  c.ok('hide: row marked as hidden', result.hide?.struckThrough)
  c.ok('show all: original total restored exactly', result.showAll?.totalRestored)
  c.equal('show all: header back to a plain count', result.showAll?.count, 'Tracks (2)')
  c.ok('remove: row dropped from the list', result.remove?.rowsDropped)
  c.equal('remove: chart drops to one line', result.remove?.chartLines, 1)

  c.ok('units: metric axes are km and m',
    JSON.stringify(result.unitsMetric?.axis) === JSON.stringify(['km', 'm']),
    JSON.stringify(result.unitsMetric?.axis))
  c.ok('units: imperial axes are mi and ft',
    JSON.stringify(result.unitsImperial?.axis) === JSON.stringify(['mi', 'ft']),
    JSON.stringify(result.unitsImperial?.axis))
  c.equal('units: button label follows the system', result.unitsImperial?.label, 'mi')
  c.equal('units: track rows follow the system', result.unitsImperial?.rowUnit, 'mi')
  // Ratios rather than fixed strings: this proves a real conversion happened
  // rather than the labels simply being swapped.
  c.close('units: distance really converts by the mile factor', result.unitsImperial?.distanceRatio, 1.609344, 0.01)
  c.close('units: elevation really converts by the foot factor', result.unitsImperial?.elevationRatio, 3.280839895, 0.01)
  // Leaflet's scale picks feet or miles depending on zoom, and metres or
  // kilometres likewise, so match the system rather than one specific unit.
  c.ok('units: scale bar switches to imperial',
    /\b(ft|mi)\b/.test(result.unitsImperial?.scale || ''), result.unitsImperial?.scale)
  c.ok('units: scale bar returns to metric',
    /\b(m|km)\b/.test(result.unitsMetric?.scale || ''), result.unitsMetric?.scale)
  c.equal('units: toggling twice returns to metric', result.unitsBack, 'km')

  c.ok('hover: tooltip names the track and reads a value',
    /km|mi/.test(result.hover?.tooltip || ''), result.hover?.tooltip)
  c.ok('hover: cursor line shown', result.hover?.cursorVisible)
  c.equal('hover: matching point marked on the map', result.hover?.mapMarkers, 1)
  c.ok('hover: marker cleared on leaving the chart', result.hoverCleared)

  const errors = result.errors || []
  c.ok('bad input: a GPX with no tracks reports an error',
    errors.some((message) => /empty\.gpx/.test(message)), JSON.stringify(errors))
  c.ok('bad input: a non-GPX file is rejected before the parser sees it',
    errors.some((message) => /notes\.gpx.*not a GPX file/.test(message)), JSON.stringify(errors))

  win.destroy()
}

async function checkPhone (port) {
  const win = openWindow(390, 780)
  record(win)

  await win.loadURL(`http://127.0.0.1:${port}/`)
  await new Promise((resolve) => setTimeout(resolve, 2000))

  const result = await win.webContents.executeJavaScript(inPage(`
    ${HELPERS}

    out.addButton = rect('label[for=file-input]')
    out.layerToggle = rect('.leaflet-control-layers-toggle')
    out.layerCollapsed = !document.querySelector('.leaflet-control-layers-expanded')
    out.zoomButton = rect('.leaflet-control-zoom a')

    drop([['alpha.gpx', ${JSON.stringify(TRACK_A)}]])
    await wait(2500)

    out.infoCollapsed = document.getElementById('info-toggle').getAttribute('aria-expanded') === 'false'
    out.tracksCollapsed = document.getElementById('track-toggle').getAttribute('aria-expanded') === 'false'
    out.chartCompact = document.querySelector('.elevation-profile').classList.contains('is-compact')

    const names = ['#toolbar', '#info-panel', '#track-panel', '.elevation-profile', '.leaflet-control-layers']
    const boxes = names.map((sel) => [sel, rect(sel)]).filter(([, r]) => r)
    out.boxes = boxes

    const within = (r) => r.x >= -1 && r.y >= -1 &&
      r.x + r.w <= window.innerWidth + 1 && r.y + r.h <= window.innerHeight + 1
    out.outsideViewport = boxes.filter(([, r]) => !within(r)).map(([sel]) => sel)

    const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    out.overlaps = boxes.flatMap(([selA, a], i) =>
      boxes.slice(i + 1).filter(([, b]) => hits(a, b)).map(([selB]) => selA + ' / ' + selB))

    out.percentCovered = Math.round(100 * boxes.reduce((sum, [, r]) => sum + r.w * r.h, 0) /
      (window.innerWidth * window.innerHeight))

    // Expanding both panels must not push anything off screen either.
    document.getElementById('info-toggle').click()
    document.getElementById('track-toggle').click()
    await wait(400)
    const expanded = names.map((sel) => [sel, rect(sel)]).filter(([, r]) => r)
    out.outsideViewportExpanded = expanded.filter(([, r]) => !within(r)).map(([sel]) => sel)
  `))

  const c = checks
  c.ok('phone: page-side checks ran without throwing', !result.__error, result.__error || result.__stack)

  // Issue #2, first half: the tiles selector overlapped the map.
  c.ok('phone (#2): layer selector is collapsed', result.layerCollapsed)
  c.ok('phone (#2): nothing overlaps anything else',
    (result.overlaps || []).length === 0, JSON.stringify(result.overlaps))
  c.ok('phone (#2): nothing spills outside the viewport',
    (result.outsideViewport || []).length === 0, JSON.stringify(result.outsideViewport))
  c.ok('phone (#2): panels leave most of the map visible',
    result.percentCovered <= 35, `${result.percentCovered}% covered`)

  // Issue #2, second half: there was no way to upload a file.
  c.ok('phone (#2): upload button is present and a comfortable size',
    result.addButton && result.addButton.h >= 40 && result.addButton.w >= 60,
    JSON.stringify(result.addButton))
  c.ok('phone: layer toggle is a comfortable tap target',
    result.layerToggle && result.layerToggle.h >= 40, JSON.stringify(result.layerToggle))
  c.ok('phone: zoom buttons are a comfortable tap target',
    result.zoomButton && result.zoomButton.h >= 30, JSON.stringify(result.zoomButton))

  c.ok('phone: summary panel starts collapsed', result.infoCollapsed)
  c.ok('phone: track list starts collapsed', result.tracksCollapsed)
  c.ok('phone: chart switches to compact mode', result.chartCompact)
  c.ok('phone: expanding both panels keeps them on screen',
    (result.outsideViewportExpanded || []).length === 0, JSON.stringify(result.outsideViewportExpanded))

  win.destroy()
}

async function checkRemoteGpx (port) {
  const win = openWindow(1280, 900)
  record(win)

  const query = [
    'gpx=%2Fserved.gpx',
    'gpx=%2Fmissing.gpx',
    'gpx=%2Fplain.txt',
    `gpx=${encodeURIComponent('javascript:alert(1)')}`,
    `gpx=${encodeURIComponent('file:///etc/passwd')}`
  ].join('&')

  await win.loadURL(`http://127.0.0.1:${port}/?${query}`)
  await new Promise((resolve) => setTimeout(resolve, 4000))

  const result = await win.webContents.executeJavaScript(inPage(`
    ${HELPERS}
    out.rows = rows().length
    out.names = [...document.querySelectorAll('#track-list .track-name')].map((n) => n.textContent)
    out.polylines = paths()
    out.errors = [...document.querySelectorAll('.notice-body')].map((n) => n.textContent)
  `))

  const c = checks
  c.ok('?gpx=: page-side checks ran without throwing', !result.__error, result.__error || result.__stack)
  c.equal('?gpx=: the one good link loaded', result.rows, 1)
  c.ok('?gpx=: it is the served track', (result.names || []).includes('Alpha Ridge'), JSON.stringify(result.names))
  c.equal('?gpx=: it was drawn', result.polylines, 1)

  const errors = (result.errors || []).join('\n')
  c.ok('?gpx=: a 404 is reported', /404/.test(errors), errors)
  c.ok('?gpx=: a non-GPX body is rejected', /plain\.txt.*not a GPX file/.test(errors), errors)
  // The important ones: a link handed to somebody else must not be able to make
  // their browser fetch an arbitrary scheme.
  c.ok('?gpx=: a javascript: URL is refused', /javascript:.*unsupported scheme/.test(errors), errors)
  c.ok('?gpx=: a file: URL is refused', /file:.*unsupported scheme/.test(errors), errors)
  c.equal('?gpx=: every failure is reported separately', (result.errors || []).length, 4)

  win.destroy()
}

app.whenReady().then(async () => {
  const { server, port } = await startServer({
    dist,
    routes: {
      '/served.gpx': { body: TRACK_A },
      '/plain.txt': { body: 'not gpx at all', type: 'text/plain' },
      '/missing.gpx': { status: 404, body: 'nope' }
    }
  })

  installRequestRecorder()

  try {
    write('\nDesktop, 1280x900')
    await checkDesktop(port)

    await clearStoredPreferences()
    write('\nPhone, 390x780')
    await checkPhone(port)

    await clearStoredPreferences()
    write('\nShareable ?gpx= links')
    await checkRemoteGpx(port)
  } catch (error) {
    write(`\nHARNESS FAILED: ${error && error.stack}`)
    server.close()
    app.exit(1)
    return
  }

  write('')
  const passed = checks.report()
  server.close()
  app.exit(passed ? 0 : 1)
}).catch((error) => {
  write(`HARNESS FAILED: ${error && error.stack}`)
  app.exit(1)
})
