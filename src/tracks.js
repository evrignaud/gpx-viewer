import randomColor from 'randomcolor'

import L from './leaflet.js'
import { logger, settings } from './config.js'

import startIconUrl from '../images/pin-icon-start.png'
import endIconUrl from '../images/pin-icon-end.png'
import waypointIconUrl from '../images/red-pin.png'
import pinShadowUrl from '../images/pin-shadow.png'

// leaflet-gpx 2.x moved icon configuration out of `marker_options` and into a
// dedicated `markers` object; `marker_options` now only carries the shared icon
// geometry. The old `startIconUrl` / `endIconUrl` / `wptIconUrls` keys are
// silently ignored by 2.x, which is why tracks used to come back with plain blue
// default pins after an upgrade attempt.
const MARKERS = {
  startIcon: startIconUrl,
  endIcon: endIconUrl,
  wptIcons: { '': waypointIconUrl }
}

const MARKER_OPTIONS = {
  shadowUrl: pinShadowUrl,
  iconSize: [33, 45],
  iconAnchor: [16, 45],
  shadowSize: [50, 34],
  shadowAnchor: [16, 34],
  clickable: false
}

function buildPalette (count) {
  return randomColor({ luminosity: 'dark', count })
}

/**
 * Owns every loaded track: the Leaflet layer, the elevation series, the derived
 * statistics and the running totals.
 */
export class TrackStore {
  constructor ({ map, elevation, onChange, onError }) {
    this.map = map
    this.elevation = elevation
    this.onChange = onChange || (() => {})
    this.onError = onError || (() => {})

    this.tracks = []
    this.palette = buildPalette(settings.trackColorCount)
    this.nextId = 0
    this.pendingCount = 0
  }

  /**
   * Reads a batch of files one at a time, leaving a gap between each so the
   * browser can repaint while a large drop is parsed.
   */
  loadFiles (fileList) {
    const files = Array.from(fileList).filter((file) => this.isSupported(file))
    const rejected = Array.from(fileList).length - files.length
    if (rejected > 0) {
      this.onError(`Ignored ${rejected} file(s): only .gpx files are supported.`)
    }
    if (files.length === 0) {
      return
    }

    this.pendingCount += files.length
    this.onChange()

    const queue = [...files]
    const next = () => {
      const file = queue.shift()
      if (file) {
        this.loadFile(file)
      }
      if (queue.length > 0) {
        setTimeout(next, settings.fileLoadIntervalMs)
      }
    }
    setTimeout(next, settings.fileLoadIntervalMs)
  }

  isSupported (file) {
    return /\.gpx$/i.test(file.name) || file.type === 'application/gpx+xml'
  }

  loadFile (file) {
    const reader = new FileReader()
    reader.onerror = () => {
      this.pendingCount = Math.max(0, this.pendingCount - 1)
      this.onError(`Could not read "${file.name}".`)
      this.onChange()
    }
    reader.onload = (event) => {
      this.addGpx(String(event.target.result), file.name)
    }
    reader.readAsText(file)
    return reader
  }

  /**
   * Parses GPX text and adds it to the map. `pendingCount` is decremented on
   * both the success and the failure path so the busy indicator always clears.
   */
  addGpx (gpxText, fallbackName) {
    // leaflet-gpx treats a string that does not look like XML as a URL and
    // fetches it. Rejecting non-GPX content here keeps file contents from being
    // turned into outbound requests, and produces a clearer message than the
    // "Error fetching resource" that would come back otherwise.
    if (!/<\s*gpx[\s>]/i.test(gpxText)) {
      this.pendingCount = Math.max(0, this.pendingCount - 1)
      this.onError(`"${fallbackName}" is not a GPX file: no <gpx> element found.`)
      this.onChange()
      return
    }

    const color = this.palette[this.nextId % this.palette.length]
    const id = ++this.nextId
    let settled = false

    const settle = () => {
      if (!settled) {
        settled = true
        this.pendingCount = Math.max(0, this.pendingCount - 1)
      }
    }

    try {
      const elevationIds = []

      const gpx = new L.GPX(gpxText, {
        async: true,
        markers: MARKERS,
        marker_options: MARKER_OPTIONS,
        polyline_options: { color, weight: 4, opacity: 0.85 }
      })

      gpx.on('addline', (event) => {
        const elevationId = this.elevation.addTrack(event.line, {
          color,
          name: this.tracks.find((track) => track.id === id)?.name || fallbackName
        })
        if (elevationId !== null) {
          elevationIds.push(elevationId)
        }
      })

      gpx.on('error', (event) => {
        settle()
        logger.error(`GPX error in "${fallbackName}":`, event.err)
        this.onError(`"${fallbackName}" could not be parsed: ${event.err || 'unknown error'}`)
        this.onChange()
      })

      gpx.on('loaded', (event) => {
        settle()
        const target = event.target
        const name = target.get_name() || fallbackName

        this.tracks.push({
          id,
          name,
          color,
          layer: target,
          elevationIds,
          visible: true,
          stats: this.readStats(target)
        })

        this.fitLoadedTracks()
        this.onChange()
      })

      gpx.addTo(this.map)
    } catch (error) {
      settle()
      logger.error('Failed to load GPX', error)
      this.onError(`"${fallbackName}" could not be loaded: ${error.message}`)
      this.onChange()
    }
  }

  readStats (gpx) {
    const distanceKm = gpx.m_to_km(gpx.get_distance())
    const movingTime = gpx.get_moving_time()
    return {
      distanceKm,
      movingTime,
      // Recomputed rather than read from get_moving_pace() so a zero-distance
      // track yields Infinity here and is rendered as "-" instead of "NaN".
      pace: distanceKm > 0 ? movingTime / distanceKm : Infinity,
      elevationGain: gpx.get_elevation_gain(),
      elevationLoss: gpx.get_elevation_loss(),
      startTime: gpx.get_start_time() || null
    }
  }

  get visibleTracks () {
    return this.tracks.filter((track) => track.visible)
  }

  get lastTrack () {
    return this.tracks[this.tracks.length - 1] || null
  }

  get isBusy () {
    return this.pendingCount > 0
  }

  /**
   * Totals across the visible tracks only, so hiding a track also removes it
   * from the summary.
   */
  get totals () {
    const totals = {
      count: 0,
      distanceKm: 0,
      movingTime: 0,
      elevationGain: 0,
      elevationLoss: 0
    }

    for (const track of this.visibleTracks) {
      totals.count += 1
      totals.distanceKm += track.stats.distanceKm
      totals.movingTime += track.stats.movingTime
      totals.elevationGain += track.stats.elevationGain
      totals.elevationLoss += track.stats.elevationLoss
    }

    totals.pace = totals.distanceKm > 0 ? totals.movingTime / totals.distanceKm : Infinity
    return totals
  }

  setAllVisible (visible) {
    for (const track of this.tracks) {
      this.setVisible(track.id, visible)
    }
  }

  setVisible (id, visible) {
    const track = this.tracks.find((entry) => entry.id === id)
    if (!track || track.visible === visible) {
      return
    }
    track.visible = visible

    if (visible) {
      track.layer.addTo(this.map)
    } else {
      this.map.removeLayer(track.layer)
    }
    for (const elevationId of track.elevationIds) {
      this.elevation.setTrackVisible(elevationId, visible)
    }
    this.onChange()
  }

  remove (id) {
    const index = this.tracks.findIndex((entry) => entry.id === id)
    if (index === -1) {
      return
    }
    const [track] = this.tracks.splice(index, 1)
    this.map.removeLayer(track.layer)
    for (const elevationId of track.elevationIds) {
      this.elevation.removeTrack(elevationId)
    }
    this.onChange()
  }

  clear () {
    for (const track of [...this.tracks]) {
      this.remove(track.id)
    }
  }

  zoomTo (id) {
    const track = this.tracks.find((entry) => entry.id === id)
    const bounds = track?.layer.getBounds()
    if (bounds?.isValid()) {
      this.map.fitBounds(bounds, { padding: [24, 24] })
    }
  }

  /**
   * Frames every visible track. The original code framed only the most recently
   * loaded one, which pushed the earlier tracks off screen exactly when you
   * wanted to compare them.
   */
  fitLoadedTracks () {
    let bounds = null
    for (const track of this.visibleTracks) {
      const trackBounds = track.layer.getBounds()
      if (!trackBounds.isValid()) {
        continue
      }
      bounds = bounds ? bounds.extend(trackBounds) : L.latLngBounds(trackBounds.getSouthWest(), trackBounds.getNorthEast())
    }
    if (bounds?.isValid()) {
      this.map.fitBounds(bounds, { padding: [24, 24] })
    }
  }
}
