const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE

/**
 * Formats a duration in milliseconds as `1:07'42"`, dropping the hour part when
 * it is zero. Mirrors the shape leaflet-gpx uses so both agree on screen.
 */
export function formatDuration (millis) {
  if (!Number.isFinite(millis) || millis < 0) {
    return '-'
  }

  let rest = Math.floor(millis)
  const hours = Math.floor(rest / HOUR)
  rest -= hours * HOUR
  const minutes = Math.floor(rest / MINUTE)
  rest -= minutes * MINUTE
  const seconds = Math.floor(rest / SECOND)

  const pad = (n) => String(n).padStart(2, '0')
  const head = hours > 0 ? `${hours}:${pad(minutes)}` : pad(minutes)
  return `${head}'${pad(seconds)}"`
}

/**
 * Pace is a duration per unit of distance, so an unknown or zero distance has
 * to short-circuit. The original code divided straight through and rendered
 * "Infinity" or "NaN" for tracks with no distance.
 */
export function formatPace (millisPerUnit) {
  if (!Number.isFinite(millisPerUnit) || millisPerUnit <= 0) {
    return '-'
  }
  return formatDuration(millisPerUnit)
}

export function formatNumber (value, digits) {
  if (!Number.isFinite(value)) {
    return '-'
  }
  return value.toFixed(digits)
}

export function formatDateTime (date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return ''
  }
  return `${date.toDateString()}, ${date.toLocaleTimeString()}`
}
