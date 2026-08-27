import { Collapsible, isNarrowScreen } from './collapsible.js'
import { formatNumber } from './format.js'

// Inline so no icon font is needed; Font Awesome was referenced by the old
// markup but never actually loaded.
const ICON_ZOOM =
  '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
  '<path d="M6.5 1a5.5 5.5 0 1 1 3.4 9.8l3.4 3.4-1.1 1.1-3.4-3.4A5.5 5.5 0 0 1 6.5 1zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM6 4h1v1.5h1.5v1H7V8H6V6.5H4.5v-1H6V4z"/>' +
  '</svg>'

const ICON_REMOVE =
  '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
  '<path d="M4.3 3.2 8 6.9l3.7-3.7 1.1 1.1L9.1 8l3.7 3.7-1.1 1.1L8 9.1l-3.7 3.7-1.1-1.1L6.9 8 3.2 4.3z"/>' +
  '</svg>'

/**
 * Panel listing every loaded track, with per-track visibility, zoom and
 * removal.
 *
 * Before this the app could only ever accumulate tracks: there was no way to
 * hide one, to re-frame the map on one, or to take one back off the map short of
 * reloading the page.
 */
export class TrackList {
  constructor ({ element, store, units }) {
    this.element = element
    this.store = store
    this.units = units
    this.list = element.querySelector('#track-list')
    this.countLabel = element.querySelector('#track-count')
    this.items = new Map()

    this.units.onChange(() => this.update())

    this.collapsible = new Collapsible({
      element,
      toggle: element.querySelector('#track-toggle'),
      body: element.querySelector('#track-body'),
      expanded: false
    })

    // One delegated listener rather than one per row, so rows stay cheap to
    // create and destroy.
    this.list.addEventListener('click', (event) => this.onListClick(event))
    this.list.addEventListener('change', (event) => this.onListChange(event))

    element.querySelector('#tracks-show-all').addEventListener('click', () => {
      this.store.setAllVisible(true)
    })
    element.querySelector('#tracks-remove-all').addEventListener('click', () => {
      this.store.clear()
    })

    this.autoExpanded = false
  }

  onListClick (event) {
    const button = event.target.closest('button[data-action]')
    if (!button) {
      return
    }
    const id = Number(button.closest('[data-track-id]').dataset.trackId)
    if (button.dataset.action === 'zoom') {
      this.store.zoomTo(id)
    } else if (button.dataset.action === 'remove') {
      this.store.remove(id)
    }
  }

  onListChange (event) {
    const checkbox = event.target.closest('input[type="checkbox"]')
    if (!checkbox) {
      return
    }
    const id = Number(checkbox.closest('[data-track-id]').dataset.trackId)
    this.store.setVisible(id, checkbox.checked)
  }

  createItem (track) {
    const item = document.createElement('li')
    item.className = 'track-item'
    item.dataset.trackId = String(track.id)

    const checkboxId = `track-visible-${track.id}`

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.id = checkboxId
    checkbox.className = 'track-visible'

    const label = document.createElement('label')
    label.className = 'track-label'
    label.htmlFor = checkboxId

    const swatch = document.createElement('span')
    swatch.className = 'track-swatch'

    const name = document.createElement('span')
    name.className = 'track-name'

    const distance = document.createElement('span')
    distance.className = 'track-distance'

    label.append(swatch, name, distance)

    const zoom = document.createElement('button')
    zoom.type = 'button'
    zoom.className = 'track-action'
    zoom.dataset.action = 'zoom'
    zoom.innerHTML = ICON_ZOOM

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'track-action track-action-remove'
    remove.dataset.action = 'remove'
    remove.innerHTML = ICON_REMOVE

    item.append(checkbox, label, zoom, remove)

    return { item, checkbox, swatch, name, distance, zoom, remove }
  }

  updateItem (parts, track) {
    parts.checkbox.checked = track.visible
    parts.checkbox.setAttribute('aria-label', `Show ${track.name}`)
    parts.swatch.style.backgroundColor = track.color
    // textContent, not innerHTML: the name comes out of a user-supplied file.
    parts.name.textContent = track.name
    parts.name.title = track.name
    parts.distance.textContent =
      `${formatNumber(this.units.distance(track.stats.distance), 2)} ${this.units.distanceLabel}`
    parts.zoom.setAttribute('aria-label', `Zoom to ${track.name}`)
    parts.zoom.title = `Zoom to ${track.name}`
    parts.remove.setAttribute('aria-label', `Remove ${track.name}`)
    parts.remove.title = `Remove ${track.name}`
    parts.item.classList.toggle('is-hidden-track', !track.visible)
  }

  /**
   * Reconciles the existing rows against the store rather than rebuilding the
   * list, so toggling one checkbox does not move keyboard focus.
   */
  update () {
    const tracks = this.store.tracks
    this.element.hidden = tracks.length === 0

    const seen = new Set()
    for (const track of tracks) {
      seen.add(track.id)
      let parts = this.items.get(track.id)
      if (!parts) {
        parts = this.createItem(track)
        this.items.set(track.id, parts)
        this.list.appendChild(parts.item)
      }
      this.updateItem(parts, track)
    }

    for (const [id, parts] of this.items) {
      if (!seen.has(id)) {
        parts.item.remove()
        this.items.delete(id)
      }
    }

    const visible = tracks.filter((track) => track.visible).length
    this.countLabel.textContent = tracks.length === visible
      ? `Tracks (${tracks.length})`
      : `Tracks (${visible}/${tracks.length})`

    // Open the list once, on the first track, and only where there is room.
    if (!this.autoExpanded && tracks.length > 0) {
      this.autoExpanded = true
      if (!isNarrowScreen()) {
        this.collapsible.setExpanded(true)
      }
    }
  }
}
