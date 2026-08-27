// Single entry point for Leaflet plus every plugin, so import order is stated
// once and cannot drift.
import L from './leaflet-global.js'

import 'leaflet/dist/leaflet.css'
import 'leaflet.fullscreen/dist/Control.FullScreen.css'
import 'leaflet.locatecontrol/dist/L.Control.Locate.css'

import 'leaflet-providers'
import 'leaflet-gpx'
import 'leaflet.fullscreen'
import 'leaflet.locatecontrol'

import markerIconUrl from '../images/marker-icon.png'
import markerIconRetinaUrl from '../images/marker-icon-2x.png'
import markerShadowUrl from '../images/marker-shadow.png'

// Leaflet derives its default icon URLs by inspecting the page's script tags,
// which never resolves correctly once the code is bundled and asset names are
// hashed. Pointing the defaults at the imported assets fixes the missing marker
// images.
L.Icon.Default.mergeOptions({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIconRetinaUrl,
  shadowUrl: markerShadowUrl
})

export default L
