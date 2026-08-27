import 'normalize.css'
import '../styles/styles.css'

import { appVersion, logger } from './config.js'
import { domControl } from './dom-control.js'
import { installDropTarget } from './drop-target.js'
import { elevationProfile } from './elevation-profile.js'
import { InfoPanel } from './info-panel.js'
import { createMap } from './map.js'
import { Notices } from './notice.js'
import { TrackStore } from './tracks.js'

function start () {
  logger.info(`GPX Viewer ${appVersion}`)

  const app = document.getElementById('app')
  const notices = new Notices(app)

  const { map } = createMap('map')

  const elevation = elevationProfile()
  elevation.addTo(map)

  const infoPanel = new InfoPanel(document.getElementById('info-panel'))
  domControl(infoPanel.element, 'topleft').addTo(map)

  const store = new TrackStore({
    map,
    elevation,
    onChange: () => infoPanel.update(store),
    onError: (message) => notices.error(message)
  })

  installDropTarget({
    element: app,
    map,
    onFiles: (files) => store.loadFiles(files)
  })

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
