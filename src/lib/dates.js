/**
 * Format a Date object as YYYY-MM-DD in local time.
 * Avoids the UTC-offset bug from toISOString().split('T')[0],
 * which returns the wrong date when local time is ahead of or behind UTC.
 */
export function toLocalDateString(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
