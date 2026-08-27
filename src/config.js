const params = new URLSearchParams(window.location.search)

function flag (name) {
  if (!params.has(name)) {
    return false
  }
  const value = params.get(name)
  return value === '' || value === 'true' || value === '1'
}

export const debug = flag('debug')

export const appVersion = __APP_VERSION__

export const settings = {
  // Opening view. Every loaded track re-frames the map with fitBounds, so this
  // only matters until the first file is read.
  initialCenter: [48.86, -45.18],
  initialZoom: 3,
  defaultBaseLayer: 'OpenTopoMap',
  // Files in a dropped batch are read one at a time with this gap, so the
  // browser keeps repainting while a large batch is parsed.
  fileLoadIntervalMs: 25,
  // Palette size for track colours.
  trackColorCount: 50
}

function emit (level, args) {
  if (level === 'debug' && !debug) {
    return
  }
  const target = console[level] || console.log
  target.call(console, '[gpx-viewer]', ...args)
}

export const logger = {
  debug: (...args) => emit('debug', args),
  info: (...args) => emit('info', args),
  warn: (...args) => emit('warn', args),
  error: (...args) => emit('error', args)
}
