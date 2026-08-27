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
import { TrackList } from './track-list.js'
import { TrackStore } from './tracks.js'

function start () {
  logger.info(`GPX Viewer ${appVersion}`)

  const app = document.getElementById('app')
  const notices = new Notices(app)

  const { map } = createMap('map')

  const elevation = elevationProfile()
  elevation.addTo(map)

  // Toolbar first, so it sits above the info panel in the top-left corner.
  domControl(document.getElementById('toolbar'), 'topleft').addTo(map)

  const infoPanel = new InfoPanel(document.getElementById('info-panel'))
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

  trackList = new TrackList({ element: trackPanel, store })

  const loadFiles = (files) => store.loadFiles(files)

  installFilePicker({ input: document.getElementById('file-input'), onFiles: loadFiles })
  installDropTarget({ element: app, map, onFiles: loadFiles })

  // Hiding the splash is what the inline check in index.html looks for to decide
  // whether the bundle booted.
  document.getElementById('splash').hidden = true

  return { map, store, elevation, notices }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true })
} else {
  start()
}
