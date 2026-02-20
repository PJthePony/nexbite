import { ref, computed } from 'vue'
import { toLocalDateString } from '../lib/dates'

export const LOCATIONS = {
  THIS_WEEK: 'this-week',
  MONDAY: 'monday',
  TUESDAY: 'tuesday',
  WEDNESDAY: 'wednesday',
  THURSDAY: 'thursday',
  FRIDAY: 'friday',
  SATURDAY: 'saturday',
  SUNDAY: 'sunday',
  NEXT_WEEK: 'next-week',
  LATER: 'later'
}

export const DAY_LOCATIONS = [
  LOCATIONS.SUNDAY,
  LOCATIONS.MONDAY,
  LOCATIONS.TUESDAY,
  LOCATIONS.WEDNESDAY,
  LOCATIONS.THURSDAY,
  LOCATIONS.FRIDAY,
  LOCATIONS.SATURDAY
]

export const ALL_COLUMNS = [
  { id: LOCATIONS.THIS_WEEK, label: 'This Week', shortLabel: 'Wk', hideWhenEmpty: true },
  { id: LOCATIONS.SUNDAY, label: 'Sunday', shortLabel: 'Sun', isDay: true },
  { id: LOCATIONS.MONDAY, label: 'Monday', shortLabel: 'Mon', isDay: true },
  { id: LOCATIONS.TUESDAY, label: 'Tuesday', shortLabel: 'Tue', isDay: true },
  { id: LOCATIONS.WEDNESDAY, label: 'Wednesday', shortLabel: 'Wed', isDay: true },
  { id: LOCATIONS.THURSDAY, label: 'Thursday', shortLabel: 'Thu', isDay: true },
  { id: LOCATIONS.FRIDAY, label: 'Friday', shortLabel: 'Fri', isDay: true },
  { id: LOCATIONS.SATURDAY, label: 'Saturday', shortLabel: 'Sat', isDay: true },
  { id: LOCATIONS.NEXT_WEEK, label: 'Next Week', shortLabel: 'Next' },
  { id: LOCATIONS.LATER, label: 'Later', shortLabel: 'Later' }
]

// Convert an ISO date string to a location bucket
function getWeekStartDateStatic(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay() // Sunday = 0
  d.setDate(d.getDate() - day) // Go back to Sunday
  d.setHours(0, 0, 0, 0)
  return d
}

export function dateToLocation(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString + 'T00:00:00')
  const weekStart = getWeekStartDateStatic()
  const nextWeekStart = new Date(weekStart)
  nextWeekStart.setDate(nextWeekStart.getDate() + 7)
  const weekAfterNext = new Date(weekStart)
  weekAfterNext.setDate(weekAfterNext.getDate() + 14)

  if (date >= weekStart && date < nextWeekStart) {
    const dayOfWeek = date.getDay()
    const dayMap = { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' }
    return dayMap[dayOfWeek]
  } else if (date >= nextWeekStart && date < weekAfterNext) {
    return 'next-week'
  } else {
    return 'later'
  }
}

// Convert a location back to an ISO date string (for pre-filling the date picker)
export function locationToDate(location) {
  const weekStart = getWeekStartDateStatic()
  const dayOffsets = {
    'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
    'thursday': 4, 'friday': 5, 'saturday': 6,
  }

  if (location in dayOffsets) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + dayOffsets[location])
    return toLocalDateString(d)
  }

  if (location === 'next-week') {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    return toLocalDateString(d)
  }

  if (location === 'this-week') {
    return toLocalDateString()
  }

  // 'later' — caller should use task.activateAt instead
  return null
}

export function useWeekLogic() {
  const getCurrentDayLocation = () => {
    const day = new Date().getDay()
    // Sunday = 0, Monday = 1, etc.
    const dayMap = {
      0: LOCATIONS.SUNDAY,
      1: LOCATIONS.MONDAY,
      2: LOCATIONS.TUESDAY,
      3: LOCATIONS.WEDNESDAY,
      4: LOCATIONS.THURSDAY,
      5: LOCATIONS.FRIDAY,
      6: LOCATIONS.SATURDAY
    }
    return dayMap[day]
  }

  const currentDayLocation = ref(getCurrentDayLocation())

  const isWeekend = () => {
    const day = new Date().getDay()
    return day === 6 // Saturday only — Sunday is the start of the new week
  }

  const isToday = (location) => {
    return location === currentDayLocation.value
  }

  const getWeekStartDate = (date = new Date()) => {
    const d = new Date(date)
    const day = d.getDay() // Sunday = 0
    d.setDate(d.getDate() - day) // Go back to Sunday
    d.setHours(0, 0, 0, 0)
    return d
  }

  const getCurrentWeekStart = () => {
    return toLocalDateString(getWeekStartDate())
  }

  const isNewWeek = (lastWeekStart) => {
    if (!lastWeekStart) return true
    // New week only if the current calendar week is AFTER the stored week start.
    // This prevents re-triggering after advancing the week early on Saturday
    // (where lastWeekStart is already set to next Sunday).
    return getCurrentWeekStart() > lastWeekStart
  }

  const isNewDay = (lastDayCheck) => {
    if (!lastDayCheck) return true
    const today = toLocalDateString()
    return today !== lastDayCheck
  }

  const getPriorDayLocations = (currentLocation) => {
    const currentIndex = DAY_LOCATIONS.indexOf(currentLocation)
    if (currentIndex <= 0) return []
    return DAY_LOCATIONS.slice(0, currentIndex)
  }

  const getDayIndex = (location) => {
    return ALL_COLUMNS.findIndex(col => col.id === location)
  }

  // Get the calendar date for each day column (Sun=0 offset, Mon=1, etc.)
  const getColumnDate = (location) => {
    const weekStart = getWeekStartDate() // Sunday
    const dayOffsets = {
      [LOCATIONS.SUNDAY]: 0,
      [LOCATIONS.MONDAY]: 1,
      [LOCATIONS.TUESDAY]: 2,
      [LOCATIONS.WEDNESDAY]: 3,
      [LOCATIONS.THURSDAY]: 4,
      [LOCATIONS.FRIDAY]: 5,
      [LOCATIONS.SATURDAY]: 6,
    }
    const offset = dayOffsets[location]
    if (offset === undefined) return null
    const d = new Date(weekStart)
    d.setDate(d.getDate() + offset)
    return d
  }

  return {
    LOCATIONS,
    DAY_LOCATIONS,
    ALL_COLUMNS,
    currentDayLocation,
    getCurrentDayLocation,
    isWeekend,
    isToday,
    getWeekStartDate,
    getCurrentWeekStart,
    isNewWeek,
    isNewDay,
    getPriorDayLocations,
    getDayIndex,
    getColumnDate
  }
}
