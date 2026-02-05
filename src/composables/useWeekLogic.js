import { ref, computed } from 'vue'

export const LOCATIONS = {
  THIS_WEEK: 'this-week',
  MONDAY: 'monday',
  TUESDAY: 'tuesday',
  WEDNESDAY: 'wednesday',
  THURSDAY: 'thursday',
  FRIDAY: 'friday',
  NEXT_WEEK: 'next-week',
  LATER: 'later'
}

export const DAY_LOCATIONS = [
  LOCATIONS.MONDAY,
  LOCATIONS.TUESDAY,
  LOCATIONS.WEDNESDAY,
  LOCATIONS.THURSDAY,
  LOCATIONS.FRIDAY
]

export const ALL_COLUMNS = [
  { id: LOCATIONS.THIS_WEEK, label: 'This Week', hideWhenEmpty: true },
  { id: LOCATIONS.MONDAY, label: 'Monday', isDay: true },
  { id: LOCATIONS.TUESDAY, label: 'Tuesday', isDay: true },
  { id: LOCATIONS.WEDNESDAY, label: 'Wednesday', isDay: true },
  { id: LOCATIONS.THURSDAY, label: 'Thursday', isDay: true },
  { id: LOCATIONS.FRIDAY, label: 'Friday', isDay: true },
  { id: LOCATIONS.NEXT_WEEK, label: 'Next Week' },
  { id: LOCATIONS.LATER, label: 'Later' }
]

export function useWeekLogic() {
  const getCurrentDayLocation = () => {
    const day = new Date().getDay()
    // Sunday = 0, Monday = 1, etc.
    const dayMap = {
      1: LOCATIONS.MONDAY,
      2: LOCATIONS.TUESDAY,
      3: LOCATIONS.WEDNESDAY,
      4: LOCATIONS.THURSDAY,
      5: LOCATIONS.FRIDAY
    }
    // If weekend, default to Monday
    return dayMap[day] || LOCATIONS.MONDAY
  }

  const currentDayLocation = ref(getCurrentDayLocation())

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
    return getCurrentWeekStart() !== lastWeekStart
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
    isToday,
    getWeekStartDate,
    getCurrentWeekStart,
    isNewWeek,
    isNewDay,
    getPriorDayLocations,
    getDayIndex
  }
}
