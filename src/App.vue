<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import WeekView from './components/WeekView.vue'
import TaskForm from './components/TaskForm.vue'
import BiteModal from './components/BiteModal.vue'
import SearchBar from './components/SearchBar.vue'
import TagFilter from './components/TagFilter.vue'
import WeeklyReview from './components/WeeklyReview.vue'
import DailyReview from './components/DailyReview.vue'

import { useTasks } from './composables/useTasks'
import { useTags } from './composables/useTags'
import { useWorkstreams } from './composables/useWorkstreams'
import { useWeekLogic, ALL_COLUMNS } from './composables/useWeekLogic'
import { useReviews } from './composables/useReviews'
import { useMultiSelect } from './composables/useMultiSelect'

const {
  tasks,
  addTask,
  updateTask,
  deleteTask,
  toggleTask,
  moveTask,
  getTaskById,
  biteTask,
  reorderTasks
} = useTasks()

const { recentTags, allTags } = useTags()
const { allWorkstreams, addWorkstream, reorderWorkstreams, deleteWorkstream } = useWorkstreams()
const { isToday, currentDayLocation } = useWeekLogic()
const {
  needsWeeklyReview,
  needsDailyReview,
  getRolledOverTasks,
  getLaterTasks,
  getDailyRolloverTasks,
  performWeeklyRollover,
  completeWeeklyReview,
  completeDailyReview
} = useReviews()

const {
  isSelectMode,
  selectedTaskIds,
  clearSelection,
  getSelectedIds,
  setupListeners,
  teardownListeners
} = useMultiSelect()

// UI State
const showTaskForm = ref(false)
const editingTask = ref(null)
const defaultLocation = ref(null)
const defaultWorkstream = ref(null)
const searchQuery = ref('')
const selectedTagFilters = ref([])

// Review modals
const showWeeklyReview = ref(false)
const showDailyReview = ref(false)
const rolledOverTasks = ref([])
const laterTasksForReview = ref([])
const dailyRolloverTasks = ref([])

// Bite modal
const showBiteModal = ref(false)
const biteParentTask = ref(null)

// Compute tasks by location with filtering
const tasksByLocation = computed(() => {
  const byLocation = {}

  ALL_COLUMNS.forEach(col => {
    let columnTasks = tasks.value.filter(t => t.location === col.id)

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
const seedTestData = () => {
  // Clear existing data
  tasks.value.splice(0, tasks.value.length)

  // Create workstreams
  addWorkstream('Product', { bg: '#e3f2fd', text: '#1565c0' })
  addWorkstream('Engineering', { bg: '#f1f8e9', text: '#558b2f' })
  addWorkstream('Design', { bg: '#f3e5f5', text: '#7b1fa2' })

  // --- Today (friday) tasks ---
  addTask('Review PR #342 - auth refactor', 'friday', 'Check edge cases around token refresh', ['code-review'], 'Engineering')
  addTask('Write release notes for v2.1', 'friday', '', ['docs'], 'Product')
  addTask('Fix tooltip z-index bug', 'friday', 'Reported by QA - tooltips hidden behind modal', ['bug'], 'Engineering')
  addTask('Standup notes', 'friday', '', [], null)
  const doneTask = addTask('Update CI pipeline config', 'friday', '', ['devops'], 'Engineering')
  toggleTask(doneTask.id)

  // --- Monday tasks ---
  addTask('Sprint planning prep', 'monday', 'Gather velocity metrics from last sprint', ['planning'], 'Product')
  addTask('Sketch onboarding flow v2', 'monday', '', ['ux'], 'Design')

  // --- Tuesday tasks ---
  addTask('Implement search API endpoint', 'tuesday', 'Elasticsearch integration', ['backend', 'api'], 'Engineering')
  addTask('Design review: dashboard widgets', 'tuesday', '', ['ux'], 'Design')

  // --- Wednesday tasks ---
  addTask('Write integration tests for payments', 'wednesday', '', ['testing'], 'Engineering')
  addTask('User interview - enterprise client', 'wednesday', 'Acme Corp, 2pm PST', ['research'], 'Product')

  // --- Thursday tasks ---
  addTask('Accessibility audit on forms', 'thursday', 'Focus on keyboard navigation and screen readers', ['a11y'], 'Design')
  addTask('Deploy staging environment', 'thursday', '', ['devops'], 'Engineering')

  // --- Next week ---
  addTask('Plan Q2 roadmap', 'next-week', 'Align with stakeholder feedback', ['strategy'], 'Product')
  addTask('Migrate legacy auth service', 'next-week', 'Break into smaller tasks first', ['backend'], 'Engineering')
  addTask('Design system color token update', 'next-week', '', ['design-system'], 'Design')

  // --- Later ---
  addTask('Evaluate new monitoring tools', 'later', 'Datadog vs Grafana comparison', ['research'], 'Engineering')
  addTask('Customer feedback synthesis - Jan', 'later', '', ['research'], 'Product')

  // --- Create a bite chain to demo the feature ---
  // Parent task moved to next-week, bite on friday
  const elephantTask = addTask('Refactor entire notification system', 'next-week', 'This is a big one - needs to be broken into pieces', ['refactor'], 'Engineering')
  const bite1 = biteTask(elephantTask.id, 'Extract notification templates into config', 'friday', 'next-week')
  // A completed bite
  const bite2Id = biteTask(elephantTask.id, 'Audit current notification triggers', 'friday', 'next-week')
  if (bite2Id) toggleTask(bite2Id.id)

  // Remove ?seed from URL without reload
  const url = new URL(window.location.href)
  url.searchParams.delete('seed')
  window.history.replaceState({}, '', url)
}

// Check for reviews on mount
onMounted(() => {
  setupListeners()
  const params = new URLSearchParams(window.location.search)

  if (params.has('seed')) {
    seedTestData()
  }

  const forceWeeklyReview = params.has('plan')

  if (forceWeeklyReview || needsWeeklyReview.value) {
    rolledOverTasks.value = getRolledOverTasks()
    laterTasksForReview.value = getLaterTasks()
    performWeeklyRollover()
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
      tags: taskData.tags
    })
  } else {
    // Add new task
    addTask(taskData.title, taskData.location, taskData.notes, taskData.tags, taskData.workstream)
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

const handleWeeklyReviewComplete = (decisions) => {
  completeWeeklyReview(decisions)
  showWeeklyReview.value = false

  // Now check for daily review
  if (needsDailyReview.value) {
    dailyRolloverTasks.value = getDailyRolloverTasks()
    if (dailyRolloverTasks.value.length > 0) {
      showDailyReview.value = true
    }
  }
}

const handleDailyReviewComplete = (decisions) => {
  completeDailyReview(decisions)
  showDailyReview.value = false
}

// Auto-remove workstreams that have no tasks
watch(tasks, () => {
  const usedWorkstreams = new Set(
    tasks.value
      .filter(t => t.workstream)
      .map(t => t.workstream)
  )

  // Find workstreams with no tasks
  allWorkstreams.value.forEach(ws => {
    if (!usedWorkstreams.has(ws.name)) {
      deleteWorkstream(ws.name)
    }
  })
}, { deep: true })
</script>

<template>
  <div class="app-container" :class="{ 'select-mode': isSelectMode || selectedTaskIds.size > 0 }">
    <header class="app-header">
      <h1 class="app-title">NexBite</h1>

      <TagFilter
        :tags="allTags"
        v-model:selected-tags="selectedTagFilters"
      />

      <SearchBar v-model="searchQuery" />

      <div v-if="isSelectMode || selectedTaskIds.size > 0" class="select-mode-badge">
        {{ selectedTaskIds.size > 0 ? `${selectedTaskIds.size} selected` : 'Select Mode' }}
      </div>
    </header>

    <main class="app-main">
      <WeekView
        :tasks-by-location="tasksByLocation"
        :workstreams="allWorkstreams"
        :all-tasks="tasks"
        @add="handleAddTask"
        @toggle="handleToggleTask"
        @edit="handleEditTask"
        @delete="handleDeleteTask"
        @bite="handleBiteTask"
        @move="handleMoveTask"
        @reorder="handleReorder"
        @reorder-workstreams="handleReorderWorkstreams"
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
  </div>
</template>
