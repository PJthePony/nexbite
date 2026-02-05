import { ref, computed } from 'vue'
import { useTasks } from './useTasks'
import { useWeekLogic, LOCATIONS, DAY_LOCATIONS } from './useWeekLogic'

const STORAGE_KEY = 'weekly-task-manager-reviews'

function loadReviewState() {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : {
      lastWeeklyReview: null,
      lastDailyReview: null,
      lastWeekStart: null
    }
  } catch {
    return {
      lastWeeklyReview: null,
      lastDailyReview: null,
      lastWeekStart: null
    }
  }
}

function saveReviewState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function useReviews() {
  const { tasks, bulkMoveToLocation, bulkDelete } = useTasks()
  const { getCurrentWeekStart, isNewWeek, isNewDay, currentDayLocation, getPriorDayLocations } = useWeekLogic()

  const reviewState = ref(loadReviewState())

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

  const performWeeklyRollover = () => {
    // Move "Next Week" tasks to "This Week"
    const nextWeekTasks = tasks.value.filter(t =>
      t.location === LOCATIONS.NEXT_WEEK
    )
    bulkMoveToLocation(nextWeekTasks.map(t => t.id), LOCATIONS.THIS_WEEK)

    // Move incomplete day tasks to "This Week"
    const incompleteDayTasks = tasks.value.filter(t =>
      DAY_LOCATIONS.includes(t.location) && !t.completed
    )
    bulkMoveToLocation(incompleteDayTasks.map(t => t.id), LOCATIONS.THIS_WEEK)
  }

  const completeWeeklyReview = (laterDecisions) => {
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
      bulkMoveToLocation(toThisWeek, LOCATIONS.THIS_WEEK)
    }

    if (toDelete.length > 0) {
      bulkDelete(toDelete)
    }

    // Update review state
    reviewState.value.lastWeeklyReview = new Date().toISOString()
    reviewState.value.lastWeekStart = getCurrentWeekStart()
    reviewState.value.lastDailyReview = new Date().toISOString().split('T')[0]
    saveReviewState(reviewState.value)
  }

  const completeDailyReview = (decisions) => {
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
      bulkMoveToLocation(toToday, currentDayLocation.value)
    }

    if (toThisWeek.length > 0) {
      bulkMoveToLocation(toThisWeek, LOCATIONS.THIS_WEEK)
    }

    if (toLater.length > 0) {
      bulkMoveToLocation(toLater, LOCATIONS.LATER)
    }

    if (toDelete.length > 0) {
      bulkDelete(toDelete)
    }

    // Update review state
    reviewState.value.lastDailyReview = new Date().toISOString().split('T')[0]
    saveReviewState(reviewState.value)
  }

  return {
    reviewState,
    needsWeeklyReview,
    needsDailyReview,
    getRolledOverTasks,
    getLaterTasks,
    getDailyRolloverTasks,
    performWeeklyRollover,
    completeWeeklyReview,
    completeDailyReview
  }
}
