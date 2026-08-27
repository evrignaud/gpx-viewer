import 'normalize.css'
import '../styles/styles.css'

import { appVersion, logger } from './config.js'
import { domControl } from './dom-control.js'
import { installDropTarget } from './drop-target.js'
import { elevationProfile } from './elevation-profile.js'
import { installFilePicker } from './file-picker.js'
import { InfoPanel } from './info-panel.js'
import { createMap } from './map.js'
import { Notices } from './notice.js'
import { loadRemoteGpx, remoteGpxUrls } from './remote-gpx.js'
import { TrackList } from './track-list.js'
import { TrackStore } from './tracks.js'
import { installUnitToggle } from './unit-toggle.js'
import { Units } from './units.js'

function start () {
  logger.info(`GPX Viewer ${appVersion}`)

  const app = document.getElementById('app')
  const notices = new Notices(app)
  const units = new Units()

  const { map, setScaleMetric } = createMap('map')

  // Keep the scale bar in step with the chosen units, including on first load
  // when the preference was restored from a previous visit.
  setScaleMetric(units.isMetric)
  units.onChange((current) => setScaleMetric(current.isMetric))

  const elevation = elevationProfile({ units })
  elevation.addTo(map)

  // Toolbar first, so it sits above the panels in the top-left corner.
  domControl(document.getElementById('toolbar'), 'topleft').addTo(map)

  installUnitToggle({
    button: document.getElementById('unit-toggle'),
    label: document.getElementById('unit-label'),
    units
  })

  const infoPanel = new InfoPanel(document.getElementById('info-panel'), units)
  domControl(infoPanel.element, 'topleft').addTo(map)

  const trackPanel = document.getElementById('track-panel')
  domControl(trackPanel, 'topleft').addTo(map)

  // `trackList` is referenced by the store's onChange callback below, so it has
  // to be declared before the store is constructed.
  let trackList = null

  const store = new TrackStore({
    map,
    elevation,
    onChange: () => {
      infoPanel.update(store)
      trackList?.update()
    },
    onError: (message) => notices.error(message)
  })

  trackList = new TrackList({ element: trackPanel, store, units })

  const loadFiles = (files) => store.loadFiles(files)

  installFilePicker({ input: document.getElementById('file-input'), onFiles: loadFiles })
  installDropTarget({ element: app, map, onFiles: loadFiles })

  // Hiding the splash is what boot-diagnostics.js looks for to decide whether
  // the bundle booted.
  document.getElementById('splash').hidden = true

  // ?gpx=<url> makes a set of tracks shareable as a link. Deliberately last, so
  // a slow or failing remote fetch cannot hold up the rest of the UI.
  const urls = remoteGpxUrls()
  if (urls.length > 0) {
    loadRemoteGpx({ urls, store, onError: (message) => notices.error(message) })
  }

  return { map, store, elevation, notices, units }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true })
} else {
  start()
}
