import { describe, expect, it } from 'vitest'

import { formatDateTime, formatDuration, formatNumber, formatPace } from '../src/format.js'

describe('formatDuration', () => {
  it('drops the hour part when it is zero', () => {
    expect(formatDuration(0)).toBe('00\'00"')
    expect(formatDuration(42 * 1000)).toBe('00\'42"')
    expect(formatDuration(9 * 60 * 1000 + 5 * 1000)).toBe('09\'05"')
  })

  it('shows hours once there are any', () => {
    expect(formatDuration(60 * 60 * 1000)).toBe('1:00\'00"')
    expect(formatDuration(4 * 60 * 60 * 1000 + 7 * 60 * 1000 + 3 * 1000)).toBe('4:07\'03"')
  })

  it('truncates rather than rounds sub-second remainders', () => {
    expect(formatDuration(1999)).toBe('00\'01"')
  })

  it('renders a dash for values that are not a usable duration', () => {
    // Reached when a GPX carries no timestamps at all.
    for (const value of [NaN, Infinity, -1, undefined, null, 'nope']) {
      expect(formatDuration(value)).toBe('-')
    }
  })
})

describe('formatPace', () => {
  it('formats a positive pace like a duration', () => {
    expect(formatPace(5 * 60 * 1000)).toBe('05\'00"')
  })

  it('renders a dash instead of NaN or Infinity', () => {
    // A zero-distance track divides by zero. The original code printed the
    // result straight out, so the panel showed "Infinity" or "NaN".
    for (const value of [Infinity, NaN, 0, -10]) {
      expect(formatPace(value)).toBe('-')
    }
  })
})

describe('formatNumber', () => {
  it('fixes to the requested precision', () => {
    expect(formatNumber(3.14159, 2)).toBe('3.14')
    expect(formatNumber(1234.5, 0)).toBe('1235')
    expect(formatNumber(0, 2)).toBe('0.00')
  })

  it('renders a dash for non-finite input', () => {
    expect(formatNumber(NaN, 2)).toBe('-')
    expect(formatNumber(Infinity, 0)).toBe('-')
  })
})

describe('formatDateTime', () => {
  it('renders a date and a time', () => {
    const formatted = formatDateTime(new Date('2024-05-01T08:00:00Z'))
    expect(formatted).toMatch(/2024/)
    expect(formatted).toContain(',')
  })

  it('returns an empty string when there is no usable date', () => {
    // get_start_time() is null for a GPX with no timestamps.
    expect(formatDateTime(null)).toBe('')
    expect(formatDateTime(undefined)).toBe('')
    expect(formatDateTime(new Date('not a date'))).toBe('')
    expect(formatDateTime('2024-05-01')).toBe('')
  })
})
