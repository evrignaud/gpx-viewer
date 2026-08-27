import L from './leaflet.js'
import { logger, settings } from './config.js'
import { createBaseLayers, createOverlays } from './layers.js'

/**
 * Builds the map, its tile layers and the standard controls.
 */
export function createMap (containerId) {
  const map = L.map(containerId, {
    zoomControl: false,
    // Keyboard panning and zooming, needed to operate the map without a mouse.
    keyboard: true,
    worldCopyJump: true
  }).setView(settings.initialCenter, settings.initialZoom)

  const baseLayers = createBaseLayers()
  const overlays = createOverlays()

  // The previous build shipped no zoom buttons at all (`zoomControl: false` and
  // nothing added back), leaving pinch or wheel as the only way to zoom.
  L.control.zoom({ position: 'topright' }).addTo(map)

  // Replaces leaflet-graphicscale, unmaintained since 2015 and written against
  // pre-1.0 Leaflet. Leaflet's own scale control covers the same ground.
  //
  // L.Control.Scale reads metric/imperial once, at construction, so following
  // the unit toggle means replacing the control rather than reconfiguring it.
  const createScale = (metric) => L.control.scale({
    position: 'bottomleft',
    metric,
    imperial: !metric,
    maxWidth: 180
  }).addTo(map)

  let scale = createScale(true)
  const setScaleMetric = (metric) => {
    map.removeControl(scale)
    scale = createScale(metric)
  }

  L.control.fullscreen({
    position: 'topright',
    title: 'Fullscreen',
    titleCancel: 'Leave fullscreen',
    forceSeparateButton: true
  }).addTo(map)

  // Handy for checking where a track goes relative to where you are. The
  // browser only prompts for permission when the button is actually pressed.
  L.control.locate({
    position: 'topright',
    setView: 'untilPan',
    flyTo: true,
    keepCurrentZoomLevel: true,
    showPopup: false,
    strings: { title: 'Show me where I am' }
  }).addTo(map)

  const initial = baseLayers[settings.defaultBaseLayer] || Object.values(baseLayers)[0]
  if (initial) {
    initial.addTo(map)
  } else {
    logger.error('No base layer could be created')
  }

  const layerControl = L.control.layers(baseLayers, overlays, {
    position: 'topright',
    collapsed: true
  }).addTo(map)

  return { map, baseLayers, overlays, layerControl, setScaleMetric }
}
