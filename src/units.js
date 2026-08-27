import { logger } from './config.js'

const STORAGE_KEY = 'gpx-viewer.units'

const METRES_PER_MILE = 1609.344
const FEET_PER_METRE = 3.280839895

const SYSTEMS = {
  metric: {
    id: 'metric',
    distanceLabel: 'km',
    elevationLabel: 'm',
    toDistance: (metres) => metres / 1000,
    toElevation: (metres) => metres
  },
  imperial: {
    id: 'imperial',
    distanceLabel: 'mi',
    elevationLabel: 'ft',
    toDistance: (metres) => metres / METRES_PER_MILE,
    toElevation: (metres) => metres * FEET_PER_METRE
  }
}

/**
 * localStorage is unavailable in some contexts, notably a file:// page in
 * Firefox and Safari private mode, where touching it throws. The preference is
 * a nicety, so a failure here must not stop the app from starting.
 */
function readStored () {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch (error) {
    logger.debug('Could not read the unit preference', error)
    return null
  }
}

function writeStored (value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value)
  } catch (error) {
    logger.debug('Could not save the unit preference', error)
  }
}

/**
 * Distance and elevation units, switchable between metric and imperial.
 *
 * Track statistics are held in metres and milliseconds and converted here at
 * render time, so switching does not need the files to be parsed again.
 */
export class Units {
  constructor () {
    const stored = readStored()
    this.system = SYSTEMS[stored] || SYSTEMS.metric
    this.listeners = new Set()
  }

  get id () {
    return this.system.id
  }

  get isMetric () {
    return this.system.id === 'metric'
  }

  get distanceLabel () {
    return this.system.distanceLabel
  }

  get elevationLabel () {
    return this.system.elevationLabel
  }

  distance (metres) {
    return this.system.toDistance(metres)
  }

  elevation (metres) {
    return this.system.toElevation(metres)
  }

  /**
   * Pace as milliseconds per displayed distance unit, so it follows the chosen
   * system: per kilometre in metric, per mile in imperial.
   */
  pace (millis, metres) {
    const distance = this.distance(metres)
    return distance > 0 ? millis / distance : Infinity
  }

  onChange (listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  set (id) {
    const next = SYSTEMS[id]
    if (!next || next === this.system) {
      return
    }
    this.system = next
    writeStored(next.id)
    for (const listener of this.listeners) {
      listener(this)
    }
  }

  toggle () {
    this.set(this.isMetric ? 'imperial' : 'metric')
  }
}
