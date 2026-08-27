import { logger } from './config.js'

const STORAGE_KEY = 'gpx-viewer.elevation-hidden'

// localStorage throws on a file:// page in some browsers and in private mode, and
// a panel preference is not worth failing to start over.
function read () {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch (error) {
    logger.debug('Could not read the elevation panel preference', error)
    return false
  }
}

function save (hidden) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(hidden))
  } catch (error) {
    logger.debug('Could not save the elevation panel preference', error)
  }
}

/**
 * Wires the toolbar button that shows and hides the elevation profile, and
 * restores whichever state was chosen last.
 */
export function installElevationToggle ({ button, elevation }) {
  const render = () => {
    const hidden = elevation.isUserHidden()
    button.setAttribute('aria-pressed', String(!hidden))
    button.setAttribute('aria-label', hidden ? 'Show the elevation profile' : 'Hide the elevation profile')
    button.title = button.getAttribute('aria-label')
    button.classList.toggle('is-off', hidden)
  }

  elevation.setUserHidden(read())
  render()

  button.addEventListener('click', () => {
    const hidden = !elevation.isUserHidden()
    elevation.setUserHidden(hidden)
    save(hidden)
    render()
  })
}
