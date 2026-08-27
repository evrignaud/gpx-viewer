import L from './leaflet.js'

/**
 * Wraps an element that already exists in index.html as a Leaflet control, so it
 * participates in the normal control layout instead of being positioned over the
 * map with `position: fixed`.
 */
export function domControl (element, position) {
  const Wrapper = L.Control.extend({
    options: { position },
    onAdd () {
      // Otherwise clicks and wheel events inside the panel would pan and zoom
      // the map underneath it.
      L.DomEvent.disableClickPropagation(element)
      L.DomEvent.disableScrollPropagation(element)
      return element
    },
    onRemove () {}
  })

  return new Wrapper()
}
