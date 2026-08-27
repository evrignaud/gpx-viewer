import L from 'leaflet'
import 'leaflet-providers'

/**
 * Base layers offered in the layer control.
 *
 * Every entry here is keyless and served over HTTPS. The previous selection
 * included `Stamen.Watercolor` and `Stamen.Terrain`, which stopped working when
 * Stamen retired their free tile endpoints in 2023; leaflet-providers 3.x has
 * since moved those styles under `Stadia.*`, where they need an account.
 */
const BASE_LAYERS = [
  { key: 'OpenStreetMap', provider: 'OpenStreetMap.Mapnik' },
  { key: 'OpenStreetMap France', provider: 'OpenStreetMap.France' },
  { key: 'OpenTopoMap', provider: 'OpenTopoMap' },
  { key: 'CyclOSM', provider: 'CyclOSM' },
  { key: 'Satellite', provider: 'Esri.WorldImagery' },
  { key: 'Light', provider: 'CartoDB.Positron' },
  { key: 'Dark', provider: 'CartoDB.DarkMatter' }
]

/**
 * Overlays. The waymarked trail networks are genuinely useful next to a GPX
 * track, and the original overlay list was empty.
 */
const OVERLAYS = [
  { key: 'Hiking routes', provider: 'WaymarkedTrails.hiking' },
  { key: 'Cycling routes', provider: 'WaymarkedTrails.cycling' },
  { key: 'MTB routes', provider: 'WaymarkedTrails.mtb' }
]

function build (definitions) {
  const layers = {}
  for (const { key, provider } of definitions) {
    try {
      layers[key] = L.tileLayer.provider(provider)
    } catch (error) {
      // A provider renamed or dropped upstream must not take the whole map down.
      console.warn(`[gpx-viewer] skipping unavailable tile provider "${provider}"`, error)
    }
  }
  return layers
}

export function createBaseLayers () {
  return build(BASE_LAYERS)
}

export function createOverlays () {
  return build(OVERLAYS)
}
