<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import WeekView from './components/WeekView.vue'
import TaskForm from './components/TaskForm.vue'
import SearchBar from './components/SearchBar.vue'
import TagFilter from './components/TagFilter.vue'
import WeeklyReview from './components/WeeklyReview.vue'
import DailyReview from './components/DailyReview.vue'

import { useTasks } from './composables/useTasks'
import { useTags } from './composables/useTags'
import { useWorkstreams } from './composables/useWorkstreams'
import { useWeekLogic, ALL_COLUMNS } from './composables/useWeekLogic'
import { useReviews } from './composables/useReviews'

const {
  tasks,
  addTask,
  updateTask,
  deleteTask,
  toggleTask,
  moveTask,
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

// Check for reviews on mount
onMounted(() => {
  if (needsWeeklyReview.value) {
    // Perform the rollover first
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

const handleCreateWorkstream = (wsData) => {
  addWorkstream(wsData.name, wsData.color)
}

const handleReorderWorkstreams = (orderedNames) => {
  reorderWorkstreams(orderedNames)
}

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
  <div class="app-container">
    <header class="app-header">
      <h1 class="app-title">Weekly Tasks</h1>

      <TagFilter
        :tags="allTags"
        v-model:selected-tags="selectedTagFilters"
      />

      <SearchBar v-model="searchQuery" />
    </header>

    <main class="app-main">
      <WeekView
        :tasks-by-location="tasksByLocation"
        :workstreams="allWorkstreams"
        @add="handleAddTask"
        @toggle="handleToggleTask"
        @edit="handleEditTask"
        @delete="handleDeleteTask"
        @move="handleMoveTask"
        @reorder="handleReorder"
        @reorder-workstreams="handleReorderWorkstreams"
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
      @close="showTaskForm = false"
      @save="handleSaveTask"
      @delete="handleDeleteTask"
      @create-workstream="handleCreateWorkstream"
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
