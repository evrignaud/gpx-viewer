import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Units } from '../src/units.js'

const STORAGE_KEY = 'gpx-viewer.units'

beforeEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('Units', () => {
  it('starts metric', () => {
    const units = new Units()
    expect(units.id).toBe('metric')
    expect(units.isMetric).toBe(true)
    expect(units.distanceLabel).toBe('km')
    expect(units.elevationLabel).toBe('m')
  })

  it('converts metres to kilometres and leaves elevation alone', () => {
    const units = new Units()
    expect(units.distance(1000)).toBeCloseTo(1, 10)
    expect(units.distance(3210)).toBeCloseTo(3.21, 10)
    expect(units.elevation(183)).toBe(183)
  })

  it('converts to miles and feet', () => {
    const units = new Units()
    units.set('imperial')
    expect(units.distanceLabel).toBe('mi')
    expect(units.elevationLabel).toBe('ft')
    expect(units.distance(1609.344)).toBeCloseTo(1, 10)
    expect(units.elevation(1)).toBeCloseTo(3.280839895, 8)
  })

  it('expresses pace per displayed distance unit', () => {
    const units = new Units()
    const oneHour = 3600 * 1000

    // 10 km in an hour is 6 minutes per km.
    expect(units.pace(oneHour, 10000)).toBeCloseTo(6 * 60 * 1000, 6)

    // The same effort in miles is a slower number per unit, since a mile is longer.
    units.set('imperial')
    expect(units.pace(oneHour, 10000)).toBeGreaterThan(6 * 60 * 1000)
  })

  it('returns Infinity for the pace of a zero-distance track', () => {
    // formatPace turns this into "-" rather than NaN.
    const units = new Units()
    expect(units.pace(1000, 0)).toBe(Infinity)
  })

  it('toggles back and forth', () => {
    const units = new Units()
    units.toggle()
    expect(units.id).toBe('imperial')
    units.toggle()
    expect(units.id).toBe('metric')
  })

  it('notifies listeners only on a real change', () => {
    const units = new Units()
    const listener = vi.fn()
    units.onChange(listener)

    units.set('imperial')
    expect(listener).toHaveBeenCalledTimes(1)

    units.set('imperial')
    expect(listener).toHaveBeenCalledTimes(1)

    units.set('nonsense')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stops notifying after the returned unsubscribe is called', () => {
    const units = new Units()
    const listener = vi.fn()
    const off = units.onChange(listener)
    off()
    units.set('imperial')
    expect(listener).not.toHaveBeenCalled()
  })

  it('remembers the choice', () => {
    const first = new Units()
    first.set('imperial')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('imperial')
    expect(new Units().id).toBe('imperial')
  })

  it('falls back to metric when the stored value is unusable', () => {
    window.localStorage.setItem(STORAGE_KEY, 'furlongs')
    expect(new Units().id).toBe('metric')
  })

  it('still works when localStorage throws', () => {
    // Reading or writing localStorage throws on a file:// page in some browsers
    // and in private mode. A unit preference is not worth failing to start over.
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    const units = new Units()
    expect(units.id).toBe('metric')
    expect(() => units.set('imperial')).not.toThrow()
    expect(units.id).toBe('imperial')
  })
})
