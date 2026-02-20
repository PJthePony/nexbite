import { ref, computed } from 'vue'
import { supabase } from '../lib/supabase'
import { toLocalDateString } from '../lib/dates'
import { useAuth } from './useAuth'
import { useTasks } from './useTasks'
import { useWeekLogic, LOCATIONS, DAY_LOCATIONS } from './useWeekLogic'

// Get next Sunday's week start date (for advancing week early on weekends)
function getNextWeekStart() {
  const d = new Date()
  const day = d.getDay()
  // Days until next Sunday: Sun(0)=7, Mon(1)=6, ... Sat(6)=1
  const daysUntilSunday = day === 0 ? 7 : (7 - day)
  d.setDate(d.getDate() + daysUntilSunday)
  d.setHours(0, 0, 0, 0)
  return toLocalDateString(d)
}

const reviewState = ref({
  lastWeeklyReview: null,
  lastDailyReview: null,
  lastWeekStart: null
})
const reviewLoaded = ref(false)

export function useReviews() {
  const { user } = useAuth()
  const { tasks, bulkMoveToLocation, bulkDelete } = useTasks()
  const { getCurrentWeekStart, isNewWeek, isNewDay, isWeekend, currentDayLocation, getPriorDayLocations } = useWeekLogic()

  const getUserId = () => user.value?.id

  // Load review state from Supabase
  const loadReviewState = async () => {
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('user_id', getUserId())
      .single()

    if (data) {
      reviewState.value = {
        lastWeeklyReview: data.last_weekly_review,
        lastDailyReview: data.last_daily_review,
        lastWeekStart: data.last_week_start
      }
    }
    // If no data or error (no row yet), keep defaults
    reviewLoaded.value = true
  }

  // Save review state to Supabase
  const saveReviewState = async () => {
    const { error } = await supabase
      .from('reviews')
      .upsert({
        user_id: getUserId(),
        last_weekly_review: reviewState.value.lastWeeklyReview,
        last_daily_review: reviewState.value.lastDailyReview,
        last_week_start: reviewState.value.lastWeekStart
      })

    if (error) {
      console.error('Failed to save review state:', error)
    }
  }

  const needsWeeklyReview = computed(() => {
    return isNewWeek(reviewState.value.lastWeekStart)
  })

  const needsDailyReview = computed(() => {
    if (!isNewDay(reviewState.value.lastDailyReview)) {
      return false
    }

    // Check if there are incomplete tasks from prior days
    const priorDays = getPriorDayLocations(currentDayLocation.value)
    return tasks.value.some(t =>
      priorDays.includes(t.location) && !t.completed
    )
  })

  // Can advance to next week early (weekend only, and haven't already advanced)
  const canAdvanceWeek = computed(() => {
    if (!isWeekend()) return false
    // If lastWeekStart already matches next Sunday, we've already advanced
    const nextSunday = getNextWeekStart()
    return reviewState.value.lastWeekStart !== nextSunday
  })

  const getRolledOverTasks = () => {
    // Tasks from "Next Week" that should move to "This Week"
    const nextWeekTasks = tasks.value.filter(t =>
      t.location === LOCATIONS.NEXT_WEEK
    )

    // Incomplete tasks from day columns
    const incompleteDayTasks = tasks.value.filter(t =>
      DAY_LOCATIONS.includes(t.location) && !t.completed
    )

    return [...nextWeekTasks, ...incompleteDayTasks]
  }

  const getLaterTasks = () => {
    return tasks.value.filter(t => t.location === LOCATIONS.LATER)
  }

  const getDailyRolloverTasks = () => {
    const priorDays = getPriorDayLocations(currentDayLocation.value)
    return tasks.value.filter(t =>
      priorDays.includes(t.location) && !t.completed
    )
  }

  const performWeeklyRollover = async () => {
    // Move "Next Week" tasks to "This Week"
    const nextWeekTasks = tasks.value.filter(t =>
      t.location === LOCATIONS.NEXT_WEEK
    )
    await bulkMoveToLocation(nextWeekTasks.map(t => t.id), LOCATIONS.THIS_WEEK)

    // Move incomplete day tasks to "This Week"
    const incompleteDayTasks = tasks.value.filter(t =>
      DAY_LOCATIONS.includes(t.location) && !t.completed
    )
    await bulkMoveToLocation(incompleteDayTasks.map(t => t.id), LOCATIONS.THIS_WEEK)
  }

  const completeWeeklyReview = async (laterDecisions, { weekStart } = {}) => {
    // laterDecisions is an object: { taskId: 'keep' | 'this-week' | 'delete' }
    const toThisWeek = []
    const toDelete = []

    Object.entries(laterDecisions).forEach(([taskId, decision]) => {
      if (decision === 'this-week') {
        toThisWeek.push(taskId)
      } else if (decision === 'delete') {
        toDelete.push(taskId)
      }
      // 'keep' means stay in Later, no action needed
    })

    if (toThisWeek.length > 0) {
      await bulkMoveToLocation(toThisWeek, LOCATIONS.THIS_WEEK)
    }

    if (toDelete.length > 0) {
      await bulkDelete(toDelete)
    }

    // Update review state
    // weekStart override allows advancing to next week early (from weekend)
    reviewState.value.lastWeeklyReview = new Date().toISOString()
    reviewState.value.lastWeekStart = weekStart || getCurrentWeekStart()
    reviewState.value.lastDailyReview = toLocalDateString()
    await saveReviewState()
  }

  const completeDailyReview = async (decisions) => {
    // decisions is an object: { taskId: 'today' | 'this-week' | 'later' | 'delete' }
    const toToday = []
    const toThisWeek = []
    const toLater = []
    const toDelete = []

    Object.entries(decisions).forEach(([taskId, decision]) => {
      switch (decision) {
        case 'today':
          toToday.push(taskId)
          break
        case 'this-week':
          toThisWeek.push(taskId)
          break
        case 'later':
          toLater.push(taskId)
          break
        case 'delete':
          toDelete.push(taskId)
          break
      }
    })

    if (toToday.length > 0) {
      await bulkMoveToLocation(toToday, currentDayLocation.value)
    }

    if (toThisWeek.length > 0) {
      await bulkMoveToLocation(toThisWeek, LOCATIONS.THIS_WEEK)
    }

    if (toLater.length > 0) {
      await bulkMoveToLocation(toLater, LOCATIONS.LATER)
    }

    if (toDelete.length > 0) {
      await bulkDelete(toDelete)
    }

    // Update review state
    reviewState.value.lastDailyReview = toLocalDateString()
    await saveReviewState()
  }

  // The "logical" week start — reflects advanced week on weekends
  const logicalWeekStart = computed(() => {
    return reviewState.value.lastWeekStart || getCurrentWeekStart()
  })

  return {
    reviewState,
    needsWeeklyReview,
    needsDailyReview,
    canAdvanceWeek,
    logicalWeekStart,
    getNextWeekStart: () => getNextWeekStart(),
    getRolledOverTasks,
    getLaterTasks,
    getDailyRolloverTasks,
    performWeeklyRollover,
    completeWeeklyReview,
    completeDailyReview,
    loadReviewState
  }
}
