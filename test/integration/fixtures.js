/**
 * GPX fixtures for the integration check.
 *
 * Points are five seconds apart so they fall inside leaflet-gpx's 15 s
 * max_point_interval and therefore count towards moving time. Spacing them
 * further apart makes moving time legitimately zero, which is easy to mistake
 * for a bug.
 */
export function makeGpx ({ name, lat = 45.9, lon = 6.12, count = 40, baseElevation = 1000 }) {
  const start = Date.parse('2024-05-01T08:00:00Z')

  const points = Array.from({ length: count }, (_, i) => {
    const pointLat = (lat + i * 0.0004).toFixed(6)
    const pointLon = (lon + i * 0.0004).toFixed(6)
    const time = new Date(start + i * 5000).toISOString()
    const elevation = baseElevation + Math.round(30 * Math.sin(i / 4)) + i
    return `    <trkpt lat="${pointLat}" lon="${pointLon}"><ele>${elevation}</ele><time>${time}</time></trkpt>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="gpx-viewer-tests" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${name}</name></metadata>
  <wpt lat="${lat}" lon="${lon}"><name>${name} waypoint</name></wpt>
  <trk><name>${name}</name><trkseg>
${points}
  </trkseg></trk>
</gpx>
`
}

export const TRACK_A = makeGpx({ name: 'Alpha Ridge' })
export const TRACK_B = makeGpx({ name: 'Beta Loop', lat: 45.94, lon: 6.16, count: 30, baseElevation: 900 })

/**
 * A valid track carrying no <ele> elements. Plenty of real GPX files are like
 * this, and it used to make the elevation chart vanish with nothing to say why.
 */
export function makeGpxWithoutElevation ({ name, lat = 46.2, lon = 6.4, count = 25 }) {
  const start = Date.parse('2024-05-01T08:00:00Z')
  const points = Array.from({ length: count }, (_, i) => {
    const pointLat = (lat + i * 0.0004).toFixed(6)
    const pointLon = (lon + i * 0.0004).toFixed(6)
    const time = new Date(start + i * 5000).toISOString()
    return `    <trkpt lat="${pointLat}" lon="${pointLon}"><time>${time}</time></trkpt>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="gpx-viewer-tests" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${name}</name></metadata>
  <trk><name>${name}</name><trkseg>
${points}
  </trkseg></trk>
</gpx>
`
}

export const FLAT_TRACK = makeGpxWithoutElevation({ name: 'Flat, no elevation' })

// Well-formed enough to reach the parser, but with nothing parseable in it.
export const NO_TRACKS = '<?xml version="1.0"?><gpx version="1.1"></gpx>'

// Not XML at all. leaflet-gpx treats a string like this as a URL to fetch, which
// is why the app rejects it before handing it over.
export const NOT_GPX = 'this is definitely not a gpx file'
