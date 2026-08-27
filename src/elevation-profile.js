import L from 'leaflet'
import { area, axisBottom, axisLeft, bisector, line, pointer, scaleLinear, select } from 'd3'

import { formatNumber } from './format.js'

// Rendering every recorded point makes long tracks crawl, and the extra detail
// is invisible at chart resolution. Full-resolution points are still kept for
// the hover lookup.
const MAX_RENDERED_POINTS = 1500

const bisectDistance = bisector((point) => point.dist).left

/**
 * Turns a Leaflet polyline produced by leaflet-gpx into `{ dist, ele, latlng }`
 * samples. Distance is cumulative along the track, in metres.
 */
function samplePolyline (polyline) {
  const latlngs = polyline.getLatLngs().flat(Infinity)
  const points = []
  let distance = 0
  let previous = null

  for (const latlng of latlngs) {
    if (previous) {
      distance += previous.distanceTo(latlng)
    }
    previous = latlng

    const meta = latlng.meta
    const elevation = meta && Number.isFinite(meta.ele)
      ? meta.ele
      : (Number.isFinite(latlng.alt) ? latlng.alt : null)

    if (elevation === null) {
      continue
    }
    points.push({ dist: distance, ele: elevation, latlng })
  }

  return points
}

function decimate (points, limit) {
  if (points.length <= limit) {
    return points
  }
  const stride = Math.ceil(points.length / limit)
  const reduced = points.filter((_point, index) => index % stride === 0)
  const last = points[points.length - 1]
  if (reduced[reduced.length - 1] !== last) {
    reduced.push(last)
  }
  return reduced
}

/**
 * Elevation profile chart, drawn with d3 v7 and shown as a Leaflet control.
 *
 * Replaces the abandoned MrMufflon/Leaflet.Elevation control, which was pinned
 * to d3 v3 and was fetched from GitHub master at build time. Tracks are overlaid
 * from a common zero on the distance axis so they can be compared, which is the
 * whole point of loading several at once.
 */
const ElevationProfile = L.Control.extend({
  options: {
    position: 'bottomright',
    widthRatio: 0.6,
    minWidth: 260,
    heightRatio: 0.22,
    minHeight: 110,
    maxHeight: 190,
    margin: { top: 10, right: 14, bottom: 22, left: 46 }
  },

  initialize (options) {
    L.setOptions(this, options)
    this._tracks = new Map()
    this._nextId = 0
    this._hoverMarker = null
  },

  onAdd (map) {
    this._map = map

    const container = L.DomUtil.create('div', 'elevation-profile')
    container.setAttribute('aria-label', 'Elevation profile')
    // Without this the chart would pan and zoom the map underneath it.
    L.DomEvent.disableClickPropagation(container)
    L.DomEvent.disableScrollPropagation(container)

    this._container = container
    this._svg = select(container).append('svg')
    this._tooltip = L.DomUtil.create('div', 'elevation-tooltip', container)
    this._tooltip.hidden = true

    this._onResize = () => this._render()
    map.on('resize', this._onResize)
    if (typeof ResizeObserver === 'function') {
      this._resizeObserver = new ResizeObserver(this._onResize)
      this._resizeObserver.observe(map.getContainer())
    }

    this._render()
    return container
  },

  onRemove (map) {
    map.off('resize', this._onResize)
    this._resizeObserver?.disconnect()
    this._clearHoverMarker()
    this._map = null
  },

  /**
   * Adds one track's profile. Returns an id usable with `removeTrack`.
   */
  addTrack (polyline, { color = '#3388ff', name = '' } = {}) {
    const points = samplePolyline(polyline)
    if (points.length < 2) {
      return null
    }

    const id = ++this._nextId
    this._tracks.set(id, {
      id,
      name,
      color,
      points,
      rendered: decimate(points, MAX_RENDERED_POINTS)
    })
    this._render()
    return id
  },

  removeTrack (id) {
    if (this._tracks.delete(id)) {
      this._render()
    }
  },

  setTrackVisible (id, visible) {
    const track = this._tracks.get(id)
    if (track) {
      track.hidden = !visible
      this._render()
    }
  },

  clear () {
    this._tracks.clear()
    this._render()
  },

  isEmpty () {
    return this._visibleTracks().length === 0
  },

  _visibleTracks () {
    return [...this._tracks.values()].filter((track) => !track.hidden)
  },

  _measure () {
    const mapSize = this._map.getSize()
    const width = Math.max(this.options.minWidth, Math.round(mapSize.x * this.options.widthRatio))
    const height = Math.min(
      this.options.maxHeight,
      Math.max(this.options.minHeight, Math.round(mapSize.y * this.options.heightRatio))
    )
    // Never let the chart grow wider than the viewport it sits in.
    return { width: Math.min(width, mapSize.x - 20), height }
  },

  _render () {
    if (!this._map || !this._container) {
      return
    }

    const tracks = this._visibleTracks()
    this._container.hidden = tracks.length === 0
    if (tracks.length === 0) {
      this._svg.selectAll('*').remove()
      this._clearHoverMarker()
      return
    }

    const { width, height } = this._measure()
    const { margin } = this.options
    const innerWidth = Math.max(10, width - margin.left - margin.right)
    const innerHeight = Math.max(10, height - margin.top - margin.bottom)

    let maxDistance = 0
    let minElevation = Infinity
    let maxElevation = -Infinity
    for (const track of tracks) {
      for (const point of track.rendered) {
        if (point.dist > maxDistance) maxDistance = point.dist
        if (point.ele < minElevation) minElevation = point.ele
        if (point.ele > maxElevation) maxElevation = point.ele
      }
    }
    if (minElevation === maxElevation) {
      minElevation -= 1
      maxElevation += 1
    }

    const x = scaleLinear().domain([0, maxDistance / 1000]).range([0, innerWidth]).nice()
    const y = scaleLinear().domain([minElevation, maxElevation]).range([innerHeight, 0]).nice()
    this._x = x
    this._y = y
    this._innerWidth = innerWidth
    this._innerHeight = innerHeight

    const svg = this._svg
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)

    svg.selectAll('*').remove()

    const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    plot.append('g')
      .attr('class', 'elevation-grid')
      .call(axisLeft(y).ticks(4).tickSize(-innerWidth).tickFormat(() => ''))

    const areaShape = area()
      .x((point) => x(point.dist / 1000))
      .y0(innerHeight)
      .y1((point) => y(point.ele))

    const lineShape = line()
      .x((point) => x(point.dist / 1000))
      .y((point) => y(point.ele))

    // A single track reads better as a filled area; several overlaid tracks
    // read better as lines, because stacked fills hide each other.
    const single = tracks.length === 1

    for (const track of tracks) {
      const group = plot.append('g').attr('class', 'elevation-track')
      if (single) {
        group.append('path')
          .attr('class', 'elevation-area')
          .attr('fill', track.color)
          .attr('fill-opacity', 0.28)
          .attr('d', areaShape(track.rendered))
      }
      group.append('path')
        .attr('class', 'elevation-line')
        .attr('fill', 'none')
        .attr('stroke', track.color)
        .attr('stroke-width', 1.8)
        .attr('d', lineShape(track.rendered))
    }

    plot.append('g')
      .attr('class', 'elevation-axis elevation-axis-x')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(axisBottom(x).ticks(Math.max(2, Math.round(innerWidth / 70))))

    plot.append('g')
      .attr('class', 'elevation-axis elevation-axis-y')
      .call(axisLeft(y).ticks(4))

    plot.append('text')
      .attr('class', 'elevation-axis-label')
      .attr('x', innerWidth)
      .attr('y', innerHeight + margin.bottom - 4)
      .attr('text-anchor', 'end')
      .text('km')

    plot.append('text')
      .attr('class', 'elevation-axis-label')
      .attr('x', 0)
      .attr('y', -2)
      .attr('text-anchor', 'start')
      .text('m')

    this._cursor = plot.append('line')
      .attr('class', 'elevation-cursor')
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .style('display', 'none')

    this._focus = plot.append('circle')
      .attr('class', 'elevation-focus')
      .attr('r', 4)
      .style('display', 'none')

    plot.append('rect')
      .attr('class', 'elevation-overlay')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'none')
      .style('pointer-events', 'all')
      .on('pointermove', (event) => this._onPointerMove(event))
      .on('pointerleave', () => this._onPointerLeave())
  },

  _onPointerMove (event) {
    const tracks = this._visibleTracks()
    if (tracks.length === 0) {
      return
    }

    const [pointerX] = pointer(event)
    const distanceKm = this._x.invert(pointerX)
    const targetMetres = distanceKm * 1000

    // Pick the sample closest to the cursor, across every visible track.
    let best = null
    let bestTrack = null
    for (const track of tracks) {
      const index = Math.min(bisectDistance(track.points, targetMetres), track.points.length - 1)
      const candidates = [track.points[index], track.points[Math.max(0, index - 1)]]
      for (const candidate of candidates) {
        if (!candidate) continue
        const delta = Math.abs(candidate.dist - targetMetres)
        if (!best || delta < best.delta) {
          best = { point: candidate, delta }
          bestTrack = track
        }
      }
    }

    if (!best) {
      return
    }

    const { point } = best
    const px = this._x(point.dist / 1000)
    const py = this._y(point.ele)

    this._cursor.attr('x1', px).attr('x2', px).style('display', null)
    this._focus.attr('cx', px).attr('cy', py).attr('fill', bestTrack.color).style('display', null)

    const label = bestTrack.name ? `${bestTrack.name}: ` : ''
    this._tooltip.textContent =
      `${label}${formatNumber(point.dist / 1000, 2)} km, ${formatNumber(point.ele, 0)} m`
    this._tooltip.hidden = false

    this._showHoverMarker(point.latlng, bestTrack.color)
  },

  _onPointerLeave () {
    this._cursor?.style('display', 'none')
    this._focus?.style('display', 'none')
    if (this._tooltip) {
      this._tooltip.hidden = true
    }
    this._clearHoverMarker()
  },

  _showHoverMarker (latlng, color) {
    if (!this._map) {
      return
    }
    if (!this._hoverMarker) {
      // Left in the default overlay pane: it is added after the track polylines,
      // so it already paints on top of them.
      this._hoverMarker = L.circleMarker(latlng, {
        className: 'elevation-hover-marker',
        radius: 6,
        weight: 2,
        color: '#ffffff',
        fillColor: color,
        fillOpacity: 1,
        interactive: false
      }).addTo(this._map)
    } else {
      this._hoverMarker.setLatLng(latlng).setStyle({ fillColor: color })
    }
  },

  _clearHoverMarker () {
    if (this._hoverMarker && this._map) {
      this._map.removeLayer(this._hoverMarker)
    }
    this._hoverMarker = null
  }
})

export function elevationProfile (options) {
  return new ElevationProfile(options)
}

export default ElevationProfile
