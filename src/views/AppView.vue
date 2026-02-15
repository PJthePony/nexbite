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

import { useTasks } from '../composables/useTasks'
import { useTags } from '../composables/useTags'
import { useWorkstreams } from '../composables/useWorkstreams'
import { useWeekLogic, ALL_COLUMNS } from '../composables/useWeekLogic'
import { useReviews } from '../composables/useReviews'
import { useMultiSelect } from '../composables/useMultiSelect'
import { useAuth } from '../composables/useAuth'
import { usePreferences } from '../composables/usePreferences'

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
  unsubscribeFromChanges
} = useTasks()

const { recentTags, allTags, getTagCounts } = useTags()
const { allWorkstreams, addWorkstream, updateWorkstream, reorderWorkstreams, deleteWorkstream, loadWorkstreams, isLoaded: workstreamsLoaded } = useWorkstreams()
const { isToday, currentDayLocation, isWeekend } = useWeekLogic()
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

const { hiddenDays, loadPreferences, toggleDay } = usePreferences()

// Loading state
const isLoading = computed(() => !tasksLoaded.value || !workstreamsLoaded.value)

// UI State
const showTaskForm = ref(false)
const editingTask = ref(null)
const defaultLocation = ref(null)
const defaultWorkstream = ref(null)
const searchQuery = ref('')
const selectedTagFilters = ref([])

// Settings modal
const showSettings = ref(false)

// Review modals
const showWeeklyReview = ref(false)
const showDailyReview = ref(false)
const rolledOverTasks = ref([])
const laterTasksForReview = ref([])
const dailyRolloverTasks = ref([])

// Advance week (weekend early planning)
const isAdvancingWeek = ref(false)

// After advancing week on a weekend, the week hasn't started yet — focus "This Week"
const weekAdvanced = computed(() => isWeekend() && !canAdvanceWeek.value)

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
  showTaskForm.value = true
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
}

const handleReorder = (location, orderedTaskIds, workstream) => {
  reorderTasks(location, orderedTaskIds, workstream)
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

const handleRenameTag = ({ oldName, newName }) => {
  tasks.value.forEach(task => {
    if (task.tags && task.tags.includes(oldName)) {
      const newTags = task.tags.map(t => t === oldName ? newName : t)
      // Deduplicate in case newName already exists on this task
      const uniqueTags = [...new Set(newTags)]
      updateTask(task.id, { tags: uniqueTags })
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
        <img src="/logo.svg" alt="pjt" width="44" height="42" class="app-logo" />
      </div>

      <TagFilter
        :tags="allTags"
        v-model:selected-tags="selectedTagFilters"
      />

      <SearchBar v-model="searchQuery" />

      <div v-if="isSelectMode || selectedTaskIds.size > 0" class="select-mode-badge">
        {{ selectedTaskIds.size > 0 ? `${selectedTaskIds.size} selected` : 'Select Mode' }}
      </div>

      <button class="settings-btn" @click="showSettings = true" title="Settings">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </button>

      <button class="logout-btn" @click="handleLogout" title="Sign out">
        Sign out
      </button>
    </header>

    <!-- Weekend advance-week CTA -->
    <div v-if="canAdvanceWeek" class="advance-week-banner">
      <span class="advance-week-text">Week's over — ready to plan next week?</span>
      <button class="advance-week-btn" @click="handleAdvanceWeek">
        Plan Next Week
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
      </button>
    </div>

    <main class="app-main">
      <WeekView
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
    </main>

    <!-- Task Form Modal -->
    <TaskForm
      :show="showTaskForm"
      :task="editingTask"
      :default-location="defaultLocation"
      :default-workstream="defaultWorkstream"
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
      @rename-tag="handleRenameTag"
      @delete-tag="handleDeleteTag"
      @toggle-day="handleToggleDay"
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

.settings-btn {
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

.settings-btn:hover {
  background: var(--color-border);
  color: var(--color-text);
}

.logout-btn {
  padding: 6px 14px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition);
}

.logout-btn:hover {
  background: var(--color-border);
  color: var(--color-text);
}
</style>
