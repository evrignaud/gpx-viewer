// Single entry point for Leaflet plus every plugin, so import order is stated
// once and cannot drift.
import L from './leaflet-global.js'

import 'leaflet/dist/leaflet.css'
import 'leaflet.fullscreen/dist/Control.FullScreen.css'
import 'leaflet.locatecontrol/dist/L.Control.Locate.css'

import 'leaflet-providers'
import 'leaflet-gpx'

// Unlike the two plugins above, the ESM builds of these export their classes
// and factories but do not register them on the L namespace, so `L.control.
// fullscreen` and `L.control.locate` do not exist. Attaching them here keeps
// every plugin reachable the same way from the rest of the code.
import { FullScreen } from 'leaflet.fullscreen'
import { locate } from 'leaflet.locatecontrol'

L.Control.FullScreen = FullScreen
L.control.fullscreen = (options) => new FullScreen(options)
L.control.locate = locate

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
