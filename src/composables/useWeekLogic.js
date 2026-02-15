import { ref, computed } from 'vue'

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
  LOCATIONS.MONDAY,
  LOCATIONS.TUESDAY,
  LOCATIONS.WEDNESDAY,
  LOCATIONS.THURSDAY,
  LOCATIONS.FRIDAY,
  LOCATIONS.SATURDAY,
  LOCATIONS.SUNDAY
]

export const ALL_COLUMNS = [
  { id: LOCATIONS.THIS_WEEK, label: 'This Week', shortLabel: 'Wk', hideWhenEmpty: true },
  { id: LOCATIONS.MONDAY, label: 'Monday', shortLabel: 'Mon', isDay: true },
  { id: LOCATIONS.TUESDAY, label: 'Tuesday', shortLabel: 'Tue', isDay: true },
  { id: LOCATIONS.WEDNESDAY, label: 'Wednesday', shortLabel: 'Wed', isDay: true },
  { id: LOCATIONS.THURSDAY, label: 'Thursday', shortLabel: 'Thu', isDay: true },
  { id: LOCATIONS.FRIDAY, label: 'Friday', shortLabel: 'Fri', isDay: true },
  { id: LOCATIONS.SATURDAY, label: 'Saturday', shortLabel: 'Sat', isDay: true },
  { id: LOCATIONS.SUNDAY, label: 'Sunday', shortLabel: 'Sun', isDay: true },
  { id: LOCATIONS.NEXT_WEEK, label: 'Next Week', shortLabel: 'Next' },
  { id: LOCATIONS.LATER, label: 'Later', shortLabel: 'Later' }
]

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
    return day === 0 || day === 6
  }

  const isToday = (location) => {
    return location === currentDayLocation.value
  }

  const getWeekStartDate = (date = new Date()) => {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Adjust if Sunday
    d.setDate(diff)
    d.setHours(0, 0, 0, 0)
    return d
  }

  const getCurrentWeekStart = () => {
    return getWeekStartDate().toISOString().split('T')[0]
  }

  const isNewWeek = (lastWeekStart) => {
    if (!lastWeekStart) return true
    // New week only if the current calendar week is AFTER the stored week start.
    // This prevents re-triggering after advancing the week early on weekends
    // (where lastWeekStart is already set to next Monday).
    return getCurrentWeekStart() > lastWeekStart
  }

  const isNewDay = (lastDayCheck) => {
    if (!lastDayCheck) return true
    const today = new Date().toISOString().split('T')[0]
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
    getDayIndex
  }
}
