<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import WeekView from '../components/WeekView.vue'
import TaskForm from '../components/TaskForm.vue'
import BiteModal from '../components/BiteModal.vue'
import SearchBar from '../components/SearchBar.vue'
import TagFilter from '../components/TagFilter.vue'
import WeeklyReview from '../components/WeeklyReview.vue'
import DailyReview from '../components/DailyReview.vue'
import SettingsModal from '../components/SettingsModal.vue'
import LaterDatePrompt from '../components/LaterDatePrompt.vue'
import CalendarView from '../components/CalendarView.vue'

import { useTasks } from '../composables/useTasks'
import { useTags } from '../composables/useTags'
import { useWorkstreams } from '../composables/useWorkstreams'
import { useWeekLogic, ALL_COLUMNS, DAY_LOCATIONS, dateToLocation, setWeekStartOverride } from '../composables/useWeekLogic'
import { useReviews } from '../composables/useReviews'
import { useMultiSelect } from '../composables/useMultiSelect'
import { useAuth } from '../composables/useAuth'
import { usePreferences } from '../composables/usePreferences'
import { toLocalDateString } from '../lib/dates'

const router = useRouter()
const { signOut, user } = useAuth()

const {
  tasks,
  addTask,
  updateTask,
  deleteTask,
  toggleTask,
  moveTask,
  getTaskById,
  biteTask,
  reorderTasks,
  loadTasks,
  isLoaded: tasksLoaded,
  promoteScheduledTasks,
  relocateHiddenDayTasks,
  subscribeToChanges,
  unsubscribeFromChanges,
  bulkMoveToLocation
} = useTasks()

const { recentTags, allTags, getTagCounts } = useTags()
const { allWorkstreams, addWorkstream, updateWorkstream, renameWorkstream, reorderWorkstreams, deleteWorkstream, loadWorkstreams, isLoaded: workstreamsLoaded } = useWorkstreams()
const { isToday, currentDayLocation, getCurrentWeekStart } = useWeekLogic()
const {
  needsWeeklyReview,
  needsDailyReview,
  canAdvanceWeek,
  logicalWeekStart,
  getNextWeekStart,
  getRolledOverTasks,
  getLaterTasks,
  getDailyRolloverTasks,
  performWeeklyRollover,
  completeWeeklyReview,
  completeDailyReview,
  loadReviewState
} = useReviews()

const {
  isSelectMode,
  selectedTaskIds,
  clearSelection,
  getSelectedIds,
  setupListeners,
  teardownListeners
} = useMultiSelect()

const { hiddenDays, loadPreferences, toggleDay, setTagColor, removeTagColor, renameTagColor, addStandaloneTag, removeStandaloneTag, renameStandaloneTag } = usePreferences()

// Loading state
const isLoading = computed(() => !tasksLoaded.value || !workstreamsLoaded.value)

// WeekView ref for mobile nav
const weekViewRef = ref(null)

// UI State
const showTaskForm = ref(false)
const editingTask = ref(null)
const defaultLocation = ref(null)
const defaultWorkstream = ref(null)
const defaultActivateAt = ref(null)
const searchQuery = ref('')
const selectedTagFilters = ref([])

// Settings modal
const showSettings = ref(false)
const activeView = ref('week') // 'week' or 'calendar'

// Page header date
const dateStr = computed(() => {
  const today = new Date()
  return today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
})

// Later date prompt
const showLaterPrompt = ref(false)
const laterPromptTaskId = ref(null)
const laterPromptTaskTitle = ref('')
const laterPromptDefaultDate = ref('')

const getTwoWeeksFromNow = () => {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return toLocalDateString(d)
}

// Review modals
const showWeeklyReview = ref(false)
const showDailyReview = ref(false)
const rolledOverTasks = ref([])
const laterTasksForReview = ref([])
const dailyRolloverTasks = ref([])

// Advance week (weekend early planning)
const isAdvancingWeek = ref(false)

// Sync the week start override whenever logicalWeekStart changes
watch(logicalWeekStart, (newVal) => {
  const calendarWeekStart = getCurrentWeekStart()
  if (newVal && newVal > calendarWeekStart) {
    setWeekStartOverride(newVal)
  } else {
    setWeekStartOverride(null)
  }
}, { immediate: true })

// After advancing week, the calendar week hasn't started yet — focus "This Week"
const weekAdvanced = computed(() => {
  return logicalWeekStart.value > getCurrentWeekStart()
})

// Bite modal
const showBiteModal = ref(false)
const biteParentTask = ref(null)

// Hide completed tasks from prior weeks (reactive — updates when week is advanced)
const weekStartMs = computed(() => {
  return new Date(logicalWeekStart.value).getTime()
})

// Compute tasks by location with filtering
const tasksByLocation = computed(() => {
  const byLocation = {}

  ALL_COLUMNS.forEach(col => {
    let columnTasks = tasks.value.filter(t => t.location === col.id)

    // Hide tasks completed before this week started (they belong to a prior week)
    columnTasks = columnTasks.filter(t =>
      !t.completed || !t.completedAt || t.completedAt >= weekStartMs.value
    )

    // Apply search filter
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase()
      columnTasks = columnTasks.filter(t =>
        t.title.toLowerCase().includes(query) ||
        (t.notes && t.notes.toLowerCase().includes(query))
      )
    }

    // Apply tag filter
    if (selectedTagFilters.value.length > 0) {
      columnTasks = columnTasks.filter(t =>
        t.tags && selectedTagFilters.value.some(tag => t.tags.includes(tag))
      )
    }

    // Sort: incomplete first, then by sortOrder (user-defined), then by creation date
    columnTasks.sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1
      }
      // Use sortOrder if available, otherwise fall back to createdAt
      const aOrder = a.sortOrder ?? a.createdAt
      const bOrder = b.sortOrder ?? b.createdAt
      return aOrder - bOrder
    })

    byLocation[col.id] = columnTasks
  })

  return byLocation
})

// Orphaned tasks: incomplete on a prior day, in 'later' without a date, or in 'later' with a date that's already this week or earlier
const orphanedTasks = computed(() => {
  // When week is advanced (planning mode), there are no "past days" to worry about
  const checkPastDays = !weekAdvanced.value
  const todayIndex = DAY_LOCATIONS.indexOf(currentDayLocation.value)
  const priorDays = (checkPastDays && todayIndex > 0) ? DAY_LOCATIONS.slice(0, todayIndex) : []

  return tasks.value.filter(t => {
    if (t.completed) return false
    // Case 1: Incomplete task assigned to a day before today (skip in planning mode)
    if (priorDays.includes(t.location)) return true
    // Case 2: Task in 'later' with no activate_at date (invisible in calendar)
    if (t.location === 'later' && !t.activateAt) return true
    // Case 3: Task in 'later' but its date resolves to this week or next week (wrong bucket)
    if (t.location === 'later' && t.activateAt) {
      const resolved = dateToLocation(t.activateAt)
      if (resolved && resolved !== 'later') return true
    }
    return false
  })
})

const handleFixOrphans = () => {
  orphanedTasks.value.forEach(t => {
    if (t.location === 'later' && t.activateAt) {
      // Task has a date — move to the correct column based on its date
      const resolved = dateToLocation(t.activateAt)
      if (resolved && resolved !== 'later') {
        moveTask(t.id, resolved)
        updateTask(t.id, { activateAt: null })
      } else {
        // Date is still far out but somehow orphaned — move to today
        moveTask(t.id, currentDayLocation.value)
        updateTask(t.id, { activateAt: null })
      }
    } else {
      // No date or stale day — move to today
      moveTask(t.id, currentDayLocation.value)
    }
  })
}

// Seed test data via ?seed
const seedTestData = async () => {
  // Clear existing data
  tasks.value.splice(0, tasks.value.length)

  // Create workstreams
  await addWorkstream('Product', { bg: '#dbeafe', text: '#2563eb' })
  await addWorkstream('Engineering', { bg: '#ccfbf1', text: '#14b8a6' })
  await addWorkstream('Design', { bg: '#e9d5ff', text: '#a855f7' })

  // --- Today (friday) tasks ---
  await addTask('Review PR #342 - auth refactor', 'friday', 'Check edge cases around token refresh', ['code-review'], 'Engineering')
  await addTask('Write release notes for v2.1', 'friday', '', ['docs'], 'Product')
  await addTask('Fix tooltip z-index bug', 'friday', 'Reported by QA - tooltips hidden behind modal', ['bug'], 'Engineering')
  await addTask('Standup notes', 'friday', '', [], null)
  const doneTask = await addTask('Update CI pipeline config', 'friday', '', ['devops'], 'Engineering')
  await toggleTask(doneTask.id)

  // --- Monday tasks ---
  await addTask('Sprint planning prep', 'monday', 'Gather velocity metrics from last sprint', ['planning'], 'Product')
  await addTask('Sketch onboarding flow v2', 'monday', '', ['ux'], 'Design')

  // --- Tuesday tasks ---
  await addTask('Implement search API endpoint', 'tuesday', 'Elasticsearch integration', ['backend', 'api'], 'Engineering')
  await addTask('Design review: dashboard widgets', 'tuesday', '', ['ux'], 'Design')

  // --- Wednesday tasks ---
  await addTask('Write integration tests for payments', 'wednesday', '', ['testing'], 'Engineering')
  await addTask('User interview - enterprise client', 'wednesday', 'Acme Corp, 2pm PST', ['research'], 'Product')

  // --- Thursday tasks ---
  await addTask('Accessibility audit on forms', 'thursday', 'Focus on keyboard navigation and screen readers', ['a11y'], 'Design')
  await addTask('Deploy staging environment', 'thursday', '', ['devops'], 'Engineering')

  // --- Next week ---
  await addTask('Plan Q2 roadmap', 'next-week', 'Align with stakeholder feedback', ['strategy'], 'Product')
  await addTask('Migrate legacy auth service', 'next-week', 'Break into smaller tasks first', ['backend'], 'Engineering')
  await addTask('Design system color token update', 'next-week', '', ['design-system'], 'Design')

  // --- Later ---
  await addTask('Evaluate new monitoring tools', 'later', 'Datadog vs Grafana comparison', ['research'], 'Engineering')
  await addTask('Customer feedback synthesis - Jan', 'later', '', ['research'], 'Product')

  // --- Create a bite chain to demo the feature ---
  const elephantTask = await addTask('Refactor entire notification system', 'next-week', 'This is a big one - needs to be broken into pieces', ['refactor'], 'Engineering')
  const bite1 = await biteTask(elephantTask.id, 'Extract notification templates into config', 'friday', 'next-week')
  const bite2 = await biteTask(elephantTask.id, 'Audit current notification triggers', 'friday', 'next-week')
  if (bite2) await toggleTask(bite2.id)

  // Remove ?seed from URL without reload
  const url = new URL(window.location.href)
  url.searchParams.delete('seed')
  window.history.replaceState({}, '', url)
}

// Logout handler
const handleLogout = async () => {
  await signOut()
  router.push('/login')
}

// Check for reviews on mount
onMounted(async () => {
  setupListeners()

  // Load data from Supabase
  await Promise.all([
    loadTasks(),
    loadWorkstreams(),
    loadReviewState(),
    loadPreferences()
  ])

  // Promote any "Later" tasks whose scheduled date has arrived
  await promoteScheduledTasks()

  // Move incomplete tasks off hidden days to the next visible day
  await relocateHiddenDayTasks(hiddenDays.value)

  // Subscribe to realtime changes for cross-client sync
  subscribeToChanges()

  const params = new URLSearchParams(window.location.search)

  if (params.has('seed')) {
    await seedTestData()
  }

  const forceWeeklyReview = params.has('plan')

  if (forceWeeklyReview || needsWeeklyReview.value) {
    // Strip ?plan from URL so a refresh doesn't re-trigger
    if (forceWeeklyReview) {
      const url = new URL(window.location.href)
      url.searchParams.delete('plan')
      window.history.replaceState({}, '', url)
    }
    rolledOverTasks.value = getRolledOverTasks()
    laterTasksForReview.value = getLaterTasks()
    await performWeeklyRollover()
    showWeeklyReview.value = true
  } else if (needsDailyReview.value) {
    dailyRolloverTasks.value = getDailyRolloverTasks()
    if (dailyRolloverTasks.value.length > 0) {
      showDailyReview.value = true
    }
  }
})

onUnmounted(() => {
  teardownListeners()
  unsubscribeFromChanges()
})

// Event handlers
const handleAddTask = (location, workstream = null) => {
  editingTask.value = null
  defaultLocation.value = location
  defaultWorkstream.value = workstream
  defaultActivateAt.value = null
  showTaskForm.value = true
}

const handleCalendarAdd = (dateStr) => {
  editingTask.value = null
  defaultLocation.value = 'later'
  defaultWorkstream.value = null
  defaultActivateAt.value = dateStr
  showTaskForm.value = true
}

const handleCalendarMoveTask = ({ taskId, newDate }) => {
  const resolvedLocation = dateToLocation(newDate)
  if (resolvedLocation === 'next-week') {
    updateTask(taskId, { location: 'next-week', activateAt: newDate })
  } else {
    updateTask(taskId, { location: 'later', activateAt: newDate })
  }
}

const handleCalendarMoveTaskToDay = ({ taskId, location }) => {
  moveTask(taskId, location)
  updateTask(taskId, { activateAt: null })
}

const handleEditTask = (task) => {
  editingTask.value = task
  defaultLocation.value = null
  defaultWorkstream.value = null
  showTaskForm.value = true
}

const handleSaveTask = (taskData) => {
  if (taskData.id) {
    // Update existing task
    updateTask(taskData.id, {
      title: taskData.title,
      notes: taskData.notes,
      location: taskData.location,
      workstream: taskData.workstream,
      tags: taskData.tags,
      activateAt: taskData.activateAt
    })
  } else {
    // Add new task
    addTask(taskData.title, taskData.location, taskData.notes, taskData.tags, taskData.workstream, taskData.activateAt)
  }
}

const handleDeleteTask = (taskId) => {
  deleteTask(taskId)
}

const handleToggleTask = (taskId) => {
  toggleTask(taskId)
}

const handleMoveTask = (taskId, newLocation) => {
  moveTask(taskId, newLocation)
  // Auto-set activateAt when moving to Later
  if (newLocation === 'later') {
    const task = getTaskById(taskId)
    if (task && !task.activateAt) {
      updateTask(taskId, { activateAt: getTwoWeeksFromNow() })
    }
  }
}

const handleReorder = (location, orderedTaskIds, workstream) => {
  reorderTasks(location, orderedTaskIds, workstream)

  // When tasks are dropped into Later, auto-set activateAt and show date prompt
  if (location === 'later') {
    // Find tasks that just arrived in Later (didn't have location 'later' before)
    const newLaterTasks = orderedTaskIds
      .map(id => getTaskById(id))
      .filter(t => t && !t.activateAt)

    if (newLaterTasks.length > 0) {
      const defaultDate = getTwoWeeksFromNow()
      // Set default date for all dropped tasks
      newLaterTasks.forEach(t => {
        updateTask(t.id, { activateAt: defaultDate })
      })
      // Show prompt for the first one so user can adjust
      const firstTask = newLaterTasks[0]
      laterPromptTaskId.value = firstTask.id
      laterPromptTaskTitle.value = firstTask.title
      laterPromptDefaultDate.value = defaultDate
      showLaterPrompt.value = true
    }
  }
}

// Multi-select drag handler
const handleMultiDrop = (location, workstream, draggedTaskId) => {
  const selectedIds = getSelectedIds()
  if (!selectedIds.includes(draggedTaskId)) return

  // Get other selected tasks sorted by their current sortOrder (preserves relative order)
  const otherSelectedIds = selectedIds.filter(id => id !== draggedTaskId)
  const otherTasks = otherSelectedIds
    .map(id => getTaskById(id))
    .filter(Boolean)
    .sort((a, b) => (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt))

  // Move them to the destination
  otherTasks.forEach(t => {
    moveTask(t.id, location)
    updateTask(t.id, { workstream: workstream })
  })

  // Now rebuild sort order for this cell: all tasks in (location + workstream),
  // inserting the other selected tasks right after the dragged task
  const draggedTask = getTaskById(draggedTaskId)
  const cellTasks = tasks.value
    .filter(t => t.location === location && (t.workstream || null) === (workstream || null))
    .filter(t => !otherSelectedIds.includes(t.id))
    .sort((a, b) => (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt))

  // Find where the dragged task sits and splice the others in after it
  const draggedIndex = cellTasks.findIndex(t => t.id === draggedTaskId)
  const insertAt = draggedIndex !== -1 ? draggedIndex + 1 : cellTasks.length
  cellTasks.splice(insertAt, 0, ...otherTasks)

  // Re-index sort orders
  cellTasks.forEach((t, i) => {
    t.sortOrder = i
  })

  // Auto-set activateAt for multi-dropped tasks going to Later
  if (location === 'later') {
    const defaultDate = getTwoWeeksFromNow()
    const allDropped = [draggedTaskId, ...otherSelectedIds]
    allDropped.forEach(id => {
      const t = getTaskById(id)
      if (t && !t.activateAt) {
        updateTask(id, { activateAt: defaultDate })
      }
    })
  }

  clearSelection()
}

const handleCreateWorkstream = (wsData) => {
  addWorkstream(wsData.name, wsData.color)
}

const handleReorderWorkstreams = (orderedNames) => {
  reorderWorkstreams(orderedNames)
}

const handleUpdateWorkstreamColor = (wsName, color) => {
  updateWorkstream(wsName, { color })
}

// Bite handlers
const handleBiteTask = (task) => {
  biteParentTask.value = task
  showBiteModal.value = true
}

const handleBiteSave = ({ parentId, biteTitle, biteLocation, parentDestination }) => {
  biteTask(parentId, biteTitle, biteLocation, parentDestination)
}

// Computed props for TaskForm linked task info
const editingTaskParent = computed(() => {
  if (!editingTask.value || !editingTask.value.parentTaskId) return null
  return getTaskById(editingTask.value.parentTaskId)
})

const editingTaskBites = computed(() => {
  if (!editingTask.value || !editingTask.value.biteTaskIds || editingTask.value.biteTaskIds.length === 0) return []
  return editingTask.value.biteTaskIds
    .map(id => getTaskById(id))
    .filter(Boolean)
})

const handleAdvanceWeek = async () => {
  isAdvancingWeek.value = true
  rolledOverTasks.value = getRolledOverTasks()
  laterTasksForReview.value = getLaterTasks()
  await performWeeklyRollover()
  showWeeklyReview.value = true
}

const handleWeeklyReviewComplete = async (decisions) => {
  if (isAdvancingWeek.value) {
    await completeWeeklyReview(decisions, { weekStart: getNextWeekStart() })
    isAdvancingWeek.value = false
  } else {
    await completeWeeklyReview(decisions)
  }
  showWeeklyReview.value = false

  // Now check for daily review
  if (needsDailyReview.value) {
    dailyRolloverTasks.value = getDailyRolloverTasks()
    if (dailyRolloverTasks.value.length > 0) {
      showDailyReview.value = true
    }
  }
}

const handleDailyReviewComplete = async (decisions) => {
  await completeDailyReview(decisions)
  showDailyReview.value = false
}

// Settings event handlers
const handleSettingsAddWorkstream = (wsData) => {
  addWorkstream(wsData.name, wsData.color)
}

const handleSettingsDeleteWorkstream = (wsName) => {
  deleteWorkstream(wsName)
}

const handleLaterDateSave = (date) => {
  if (laterPromptTaskId.value) {
    const effectiveDate = date || getTwoWeeksFromNow()
    const resolvedLocation = dateToLocation(effectiveDate)

    if (resolvedLocation && resolvedLocation !== 'later') {
      // Date is this week or next week — move task to the right column
      moveTask(laterPromptTaskId.value, resolvedLocation)
      updateTask(laterPromptTaskId.value, { activateAt: null })
    } else {
      // Date is further out — keep in later with the scheduled date
      updateTask(laterPromptTaskId.value, { activateAt: effectiveDate })
    }
  }
  showLaterPrompt.value = false
  laterPromptTaskId.value = null
}

const handleAddTag = async ({ name, color }) => {
  await addStandaloneTag(name)
  await setTagColor(name, { bg: color.bg, text: color.text })
}

const handleRenameTag = ({ oldName, newName }) => {
  tasks.value.forEach(task => {
    if (task.tags && task.tags.includes(oldName)) {
      const newTags = task.tags.map(t => t === oldName ? newName : t)
      // Deduplicate in case newName already exists on this task
      const uniqueTags = [...new Set(newTags)]
      updateTask(task.id, { tags: uniqueTags })
    }
  })
  renameTagColor(oldName, newName)
  renameStandaloneTag(oldName, newName)
}

const handleRenameWorkstream = async ({ oldName, newName }) => {
  // Update the workstream name in the workstreams table
  await renameWorkstream(oldName, newName)
  // Cascade to all tasks referencing the old workstream name
  tasks.value.forEach(task => {
    if (task.workstream === oldName) {
      updateTask(task.id, { workstream: newName })
    }
  })
}

const handleDeleteTag = (tagName) => {
  tasks.value.forEach(task => {
    if (task.tags && task.tags.includes(tagName)) {
      const newTags = task.tags.filter(t => t !== tagName)
      updateTask(task.id, { tags: newTags })
    }
  })
  removeTagColor(tagName)
  removeStandaloneTag(tagName)
}

const handleRecolorTag = ({ tagName, color }) => {
  setTagColor(tagName, { bg: color.bg, text: color.text })
}

const handleToggleDay = (dayId) => {
  toggleDay(dayId)
}
</script>

<template>
  <!-- Loading state -->
  <div v-if="isLoading" class="loading-container">
    <div class="loading-spinner"></div>
    <p class="loading-text">Loading your tasks...</p>
  </div>

  <!-- Main app -->
  <div v-else class="app-container" :class="{ 'select-mode': isSelectMode || selectedTaskIds.size > 0 }">
    <header class="app-header">
      <div class="app-title">
        <div class="header-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        </div>
        <span class="app-name">Tessio</span>
      </div>

      <TagFilter
        :tags="allTags"
        v-model:selected-tags="selectedTagFilters"
      />

      <SearchBar v-model="searchQuery" />

      <div v-if="isSelectMode || selectedTaskIds.size > 0" class="select-mode-badge">
        {{ selectedTaskIds.size > 0 ? `${selectedTaskIds.size} selected` : 'Select Mode' }}
      </div>

      <button
        class="view-toggle-btn"
        :class="{ 'is-calendar': activeView === 'calendar' }"
        @click="activeView = activeView === 'week' ? 'calendar' : 'week'"
        :title="activeView === 'week' ? 'Calendar view' : 'Week view'"
      >
        <svg v-if="activeView === 'week'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      </button>

      <button class="settings-btn" @click="showSettings = true" title="Settings" aria-label="Settings">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
      </button>

      <button class="logout-btn" @click="handleLogout" title="Sign out" aria-label="Sign out">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    </header>

    <div class="page-header">
      <div class="page-date">{{ dateStr }}</div>
      <h1 class="page-title">The Hit List</h1>
    </div>

    <!-- Mobile day navigation (between title and content) -->
    <div v-if="activeView === 'week' && weekViewRef?.isMobile" class="column-nav-bar">
      <button
        v-for="(column, index) in weekViewRef.visibleColumns"
        :key="column.id"
        class="nav-pill"
        :class="{
          'is-active': index === weekViewRef.currentColumnIndex,
          'is-today': weekViewRef.isActiveColumn(column.id)
        }"
        @click="weekViewRef.goToColumn(index)"
      >
        {{ column.shortLabel || column.label }}
      </button>
    </div>

    <!-- Weekend advance-week CTA -->
    <div v-if="canAdvanceWeek" class="advance-week-banner">
      <span class="advance-week-text">Week's over — ready to plan next week?</span>
      <button class="advance-week-btn" @click="handleAdvanceWeek">
        Plan Next Week
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
      </button>
    </div>

    <!-- Orphaned tasks banner -->
    <div v-if="orphanedTasks.length > 0" class="orphan-banner">
      <span class="orphan-text">
        {{ orphanedTasks.length }} task{{ orphanedTasks.length === 1 ? " isn't" : "s aren't" }} showing — stuck in a past day, in Later without a date, or in Later with a date that's already here
      </span>
      <button class="orphan-fix-btn" @click="handleFixOrphans">
        Fix Now
      </button>
    </div>

    <main class="app-main">
      <WeekView
        v-if="activeView === 'week'"
        ref="weekViewRef"
        :tasks-by-location="tasksByLocation"
        :workstreams="allWorkstreams"
        :all-tasks="tasks"
        :hidden-days="hiddenDays"
        :week-advanced="weekAdvanced"
        @add="handleAddTask"
        @toggle="handleToggleTask"
        @edit="handleEditTask"
        @delete="handleDeleteTask"
        @bite="handleBiteTask"
        @move="handleMoveTask"
        @reorder="handleReorder"
        @reorder-workstreams="handleReorderWorkstreams"
        @update-workstream-color="handleUpdateWorkstreamColor"
        @multi-drop="handleMultiDrop"
      />
      <CalendarView
        v-else
        :tasks="tasks"
        :tasks-by-location="tasksByLocation"
        @edit="handleEditTask"
        @add="handleCalendarAdd"
        @add-to-day="(location) => handleAddTask(location)"
        @move-task="handleCalendarMoveTask"
        @move-task-to-day="handleCalendarMoveTaskToDay"
      />
    </main>

    <!-- Task Form Modal -->
    <TaskForm
      :show="showTaskForm"
      :task="editingTask"
      :default-location="defaultLocation"
      :default-workstream="defaultWorkstream"
      :default-activate-at="defaultActivateAt"
      :available-tags="recentTags"
      :workstreams="allWorkstreams"
      :parent-task="editingTaskParent"
      :bite-tasks="editingTaskBites"
      @close="showTaskForm = false"
      @save="handleSaveTask"
      @delete="handleDeleteTask"
      @bite="handleBiteTask"
      @edit-linked="handleEditTask"
      @create-workstream="handleCreateWorkstream"
    />

    <!-- Bite Modal -->
    <BiteModal
      :show="showBiteModal"
      :parent-task="biteParentTask"
      :current-day-location="currentDayLocation"
      @close="showBiteModal = false"
      @save="handleBiteSave"
    />

    <!-- Weekly Review Modal -->
    <WeeklyReview
      :show="showWeeklyReview"
      :rolled-over-tasks="rolledOverTasks"
      :later-tasks="laterTasksForReview"
      @complete="handleWeeklyReviewComplete"
    />

    <!-- Daily Review Modal -->
    <DailyReview
      :show="showDailyReview"
      :rollover-tasks="dailyRolloverTasks"
      @complete="handleDailyReviewComplete"
    />

    <!-- Settings Modal -->
    <SettingsModal
      :show="showSettings"
      :workstreams="allWorkstreams"
      :all-tags="allTags"
      :tag-counts="getTagCounts"
      :hidden-days="hiddenDays"
      @close="showSettings = false"
      @add-workstream="handleSettingsAddWorkstream"
      @delete-workstream="handleSettingsDeleteWorkstream"
      @rename-workstream="handleRenameWorkstream"
      @recolor-workstream="({ wsName, color }) => handleUpdateWorkstreamColor(wsName, color)"
      @add-tag="handleAddTag"
      @rename-tag="handleRenameTag"
      @delete-tag="handleDeleteTag"
      @recolor-tag="handleRecolorTag"
      @toggle-day="handleToggleDay"
    />

    <!-- Later Date Prompt -->
    <LaterDatePrompt
      :show="showLaterPrompt"
      :task-title="laterPromptTaskTitle"
      :default-date="laterPromptDefaultDate"
      @save="handleLaterDateSave"
      @close="handleLaterDateSave(null)"
    />
  </div>
</template>

<style scoped>
.loading-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background-color: var(--color-bg);
}

.loading-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  color: var(--color-text-muted);
  font-size: 14px;
}

.page-header {
  padding: 20px 24px 0;
}

.page-date {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0;
}

@media (max-width: 768px) {
  .page-header {
    padding: 12px 16px 0;
  }
}

/* Mobile day navigation bar */
.column-nav-bar {
  display: flex;
  gap: 4px;
  padding: 8px 16px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  justify-content: center;
}

.column-nav-bar::-webkit-scrollbar {
  display: none;
}

.nav-pill {
  flex: 1;
  padding: 10px 0;
  border-radius: 16px;
  font-size: 0.78rem;
  font-weight: 500;
  background: var(--color-bg);
  color: var(--color-text-muted);
  border: 1px solid transparent;
  white-space: nowrap;
  cursor: pointer;
  text-align: center;
}

.nav-pill.is-active {
  background: var(--color-primary);
  color: white;
  font-weight: 600;
}

.nav-pill.is-today:not(.is-active) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.view-toggle-btn {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  color: var(--color-text-secondary);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition);
}

.view-toggle-btn:hover {
  background: var(--color-surface);
  color: var(--color-text);
}

.view-toggle-btn.is-calendar {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.settings-btn {
  margin-left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  color: var(--color-text-secondary);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition);
}

.settings-btn:hover {
  background: var(--color-surface);
  color: var(--color-text);
}

.logout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  color: var(--color-text-secondary);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition);
}

.logout-btn:hover {
  background: var(--color-surface);
  color: var(--color-text);
}

@media (max-width: 768px) {
  .view-toggle-btn,
  .settings-btn,
  .logout-btn {
    width: 44px;
    height: 44px;
  }
}
</style>
