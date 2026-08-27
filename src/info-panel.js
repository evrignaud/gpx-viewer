import { Collapsible, isNarrowScreen } from './collapsible.js'
import { formatDateTime, formatDuration, formatNumber, formatPace } from './format.js'

/**
 * Renders the summary panel: the most recently loaded track, then the totals
 * across every visible track.
 */
export class InfoPanel {
  constructor (element, units) {
    this.element = element
    this.units = units
    this.fields = new Map()
    this.store = null

    for (const node of element.querySelectorAll('[class*="info-"]')) {
      const name = [...node.classList].find((cls) => cls.startsWith('info-'))
      if (name) {
        this.fields.set(name, node)
      }
    }

    this.collapsible = new Collapsible({
      element,
      toggle: element.querySelector('#info-toggle'),
      body: element.querySelector('#info-body'),
      expanded: !isNarrowScreen()
    })

    this.units.onChange(() => this.refresh())
  }

  set (field, value) {
    const node = this.fields.get(field)
    if (node) {
      node.textContent = value
    }
  }

  setAll (className, value) {
    for (const node of this.element.querySelectorAll(`.${className}`)) {
      node.textContent = value
    }
  }

  refresh () {
    if (this.store) {
      this.update(this.store)
    }
  }

  update (store) {
    // Remembered so a unit change can re-render without the caller's help.
    this.store = store

    const units = this.units
    this.setAll('unit-distance', units.distanceLabel)
    this.setAll('unit-elevation', units.elevationLabel)

    const hasTracks = store.visibleTracks.length > 0
    this.element.hidden = !hasTracks
    if (!hasTracks) {
      return
    }

    const last = store.lastTrack
    if (last) {
      const stats = last.stats
      this.set('info-name', `Last track: ${last.name}`)
      this.set('info-start', formatDateTime(stats.startTime))
      this.set('info-distance', formatNumber(units.distance(stats.distance), 2))
      this.set('info-duration', formatDuration(stats.movingTime))
      this.set('info-pace', formatPace(units.pace(stats.movingTime, stats.distance)))
      this.set('info-elevation-gain', formatNumber(units.elevation(stats.elevationGain), 0))
      this.set('info-elevation-loss', formatNumber(units.elevation(stats.elevationLoss), 0))
      this.set('info-elevation-net',
        formatNumber(units.elevation(stats.elevationGain - stats.elevationLoss), 0))
    }

    const totals = store.totals
    this.set('info-total-distance', formatNumber(units.distance(totals.distance), 2))
    this.set('info-total-duration', formatDuration(totals.movingTime))
    this.set('info-total-pace', formatPace(units.pace(totals.movingTime, totals.distance)))
    this.set('info-total-elevation-gain', formatNumber(units.elevation(totals.elevationGain), 0))
    this.set('info-total-elevation-loss', formatNumber(units.elevation(totals.elevationLoss), 0))
    this.set('info-total-elevation-net',
      formatNumber(units.elevation(totals.elevationGain - totals.elevationLoss), 0))
  }
}
