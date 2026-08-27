import { formatDateTime, formatDuration, formatNumber, formatPace } from './format.js'

/**
 * Renders the summary panel: the most recently loaded track, then the totals
 * across every visible track.
 */
// Below this width the panel is collapsed by default: at full height it covered
// most of a phone screen.
const NARROW_SCREEN = '(max-width: 700px)'

export class InfoPanel {
  constructor (element) {
    this.element = element
    this.fields = new Map()

    for (const node of element.querySelectorAll('[class*="info-"]')) {
      const name = [...node.classList].find((cls) => cls.startsWith('info-'))
      if (name) {
        this.fields.set(name, node)
      }
    }

    this.setAll('unit-distance', 'km')
    this.setAll('unit-elevation', 'm')

    this.toggle = element.querySelector('#info-toggle')
    this.body = element.querySelector('#info-body')
    this.toggle.addEventListener('click', () => this.setExpanded(!this.expanded))
    this.setExpanded(!window.matchMedia(NARROW_SCREEN).matches)
  }

  get expanded () {
    return this.toggle.getAttribute('aria-expanded') === 'true'
  }

  setExpanded (expanded) {
    this.toggle.setAttribute('aria-expanded', String(expanded))
    this.body.hidden = !expanded
    this.element.classList.toggle('is-collapsed', !expanded)
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

  update (store) {
    const hasTracks = store.visibleTracks.length > 0
    this.element.hidden = !hasTracks
    if (!hasTracks) {
      return
    }

    const last = store.lastTrack
    if (last) {
      this.set('info-name', `Last track: ${last.name}`)
      this.set('info-start', formatDateTime(last.stats.startTime))
      this.set('info-distance', formatNumber(last.stats.distanceKm, 2))
      this.set('info-duration', formatDuration(last.stats.movingTime))
      this.set('info-pace', formatPace(last.stats.pace))
      this.set('info-elevation-gain', formatNumber(last.stats.elevationGain, 0))
      this.set('info-elevation-loss', formatNumber(last.stats.elevationLoss, 0))
      this.set('info-elevation-net', formatNumber(last.stats.elevationGain - last.stats.elevationLoss, 0))
    }

    const totals = store.totals
    this.set('info-total-distance', formatNumber(totals.distanceKm, 2))
    this.set('info-total-duration', formatDuration(totals.movingTime))
    this.set('info-total-pace', formatPace(totals.pace))
    this.set('info-total-elevation-gain', formatNumber(totals.elevationGain, 0))
    this.set('info-total-elevation-loss', formatNumber(totals.elevationLoss, 0))
    this.set('info-total-elevation-net', formatNumber(totals.elevationGain - totals.elevationLoss, 0))
  }
}
