<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import draggable from 'vuedraggable'
import WorkstreamCell from './WorkstreamCell.vue'
import TaskColumn from './TaskColumn.vue'
import { useWeekLogic, ALL_COLUMNS } from '../composables/useWeekLogic'
import { WORKSTREAM_COLORS } from '../composables/useWorkstreams'

const props = defineProps({
  tasksByLocation: {
    type: Object,
    required: true
  },
  workstreams: {
    type: Array,
    default: () => []
  },
  allTasks: {
    type: Array,
    default: () => []
  },
  hiddenDays: {
    type: Array,
    default: () => []
  },
  weekAdvanced: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['add', 'toggle', 'edit', 'delete', 'bite', 'move', 'reorder', 'createWorkstream', 'reorderWorkstreams', 'multi-drop', 'update-workstream-color'])

const { isToday, LOCATIONS, getColumnDate } = useWeekLogic()

const formatColumnDate = (columnId) => {
  const date = getColumnDate(columnId)
  if (!date) return null
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// When the week is advanced on a weekend, treat "This Week" as the active column
const isActiveColumn = (columnId) => {
  if (props.weekAdvanced) {
    return columnId === LOCATIONS.THIS_WEEK
  }
  return isToday(columnId)
}

// Refs
const gridWrapper = ref(null)

// Mobile state
const isMobile = ref(false)
const currentColumnIndex = ref(0)

// Swipe day-switching state
const touchStartX = ref(0)
const touchStartY = ref(0)
const touchStartTime = ref(0)
const touchCurrentX = ref(0)
const isSwiping = ref(false)
const swipeDecided = ref(false)
const interimOffset = ref(0)

const SWIPE_ANGLE_THRESHOLD = 25
const SWIPE_DISTANCE_THRESHOLD = 80
const SWIPE_VELOCITY_THRESHOLD = 0.3
const SWIPE_DECIDE_DISTANCE = 12

// Mobile drag-to-edge state
const mobileDragActive = ref(false)
const edgeScrollTimer = ref(null)
const EDGE_ZONE_WIDTH = 40
const EDGE_SCROLL_DELAY = 500

// Get visible columns (filter out hidden ones and user-hidden days)
const visibleColumns = computed(() => {
  return ALL_COLUMNS.filter(col => {
    // Hide columns the user has toggled off in settings
    if (props.hiddenDays.includes(col.id)) return false
    if (col.hideWhenEmpty) {
      // Always show "This Week" when the week is advanced (planning mode)
      if (props.weekAdvanced && col.id === LOCATIONS.THIS_WEEK) return true
      const tasks = props.tasksByLocation[col.id] || []
      return tasks.length > 0
    }
    return true
  })
})

// Workstream names in order (for draggable)
const orderedWorkstreamNames = computed({
  get: () => props.workstreams.map(w => w.name),
  set: (newOrder) => {
    emit('reorderWorkstreams', newOrder)
  }
})

const getWorkstreamColor = (workstreamName) => {
  if (!workstreamName) return null
  const ws = props.workstreams.find(w => w.name === workstreamName)
  return ws ? ws.color : null
}

const getTasksForCell = (columnId, workstream) => {
  const columnTasks = props.tasksByLocation[columnId] || []
  if (workstream === null) {
    // Include tasks with no workstream AND tasks with orphaned workstreams
    // (workstream name exists on the task but isn't in the workstream list)
    return columnTasks.filter(t => {
      const ws = t.workstream || null
      if (ws === null) return true
      return !orderedWorkstreamNames.value.includes(ws)
    })
  }
  return columnTasks.filter(t => (t.workstream || null) === workstream)
}

// Only show workstreams that have at least one task in any visible column
const visibleWorkstreamNames = computed(() => {
  return orderedWorkstreamNames.value.filter(wsName => {
    return visibleColumns.value.some(col => {
      return getTasksForCell(col.id, wsName).length > 0
    })
  })
})

// Check if a workstream is the last row (for bottom border of today column)
const isLastRow = (wsName) => {
  const wsNames = visibleWorkstreamNames.value
  if (wsNames.length === 0) return true // Tasks row is last if no workstreams
  return wsName === wsNames[wsNames.length - 1]
}

const mobileInitialized = ref(false)

const checkMobile = () => {
  const wasMobile = isMobile.value
  isMobile.value = window.innerWidth <= 768

  // Only snap to active column on the first time we enter mobile mode
  if (isMobile.value && !mobileInitialized.value) {
    mobileInitialized.value = true
    const activeIndex = visibleColumns.value.findIndex(col => isActiveColumn(col.id))
    if (activeIndex !== -1) {
      currentColumnIndex.value = activeIndex
    }
  }

  // Reset if we leave mobile so re-entering will snap to today again
  if (!isMobile.value) {
    mobileInitialized.value = false
  }
}

const handleTouchStart = (e) => {
  touchStartX.value = e.touches[0].clientX
  touchStartY.value = e.touches[0].clientY
  touchStartTime.value = Date.now()
  touchCurrentX.value = touchStartX.value
  isSwiping.value = false
  swipeDecided.value = false
  interimOffset.value = 0
}

const handleTouchMove = (e) => {
  if (swipeDecided.value && !isSwiping.value) return

  const dx = e.touches[0].clientX - touchStartX.value
  const dy = e.touches[0].clientY - touchStartY.value
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)

  if (!swipeDecided.value) {
    const totalMove = Math.sqrt(dx * dx + dy * dy)
    if (totalMove < SWIPE_DECIDE_DISTANCE) return

    const angle = Math.atan2(absDy, absDx) * (180 / Math.PI)
    if (angle < SWIPE_ANGLE_THRESHOLD) {
      isSwiping.value = true
      swipeDecided.value = true
    } else {
      swipeDecided.value = true
      isSwiping.value = false
      return
    }
  }

  if (isSwiping.value) {
    touchCurrentX.value = e.touches[0].clientX
    interimOffset.value = dx
    e.preventDefault()
  }
}

const handleTouchEnd = () => {
  if (!isSwiping.value) {
    interimOffset.value = 0
    return
  }

  const dx = touchCurrentX.value - touchStartX.value
  const elapsed = Date.now() - touchStartTime.value
  const velocity = Math.abs(dx) / elapsed

  const shouldSwipe = Math.abs(dx) > SWIPE_DISTANCE_THRESHOLD
                    || velocity > SWIPE_VELOCITY_THRESHOLD

  if (shouldSwipe) {
    if (dx < 0 && currentColumnIndex.value < visibleColumns.value.length - 1) {
      currentColumnIndex.value++
    } else if (dx > 0 && currentColumnIndex.value > 0) {
      currentColumnIndex.value--
    }
  }

  isSwiping.value = false
  swipeDecided.value = false
  interimOffset.value = 0
}

const goToColumn = (index) => {
  currentColumnIndex.value = index
}

// Mobile drag-to-edge: scroll columns when dragging near screen edges
const handleMobileDragStart = () => {
  if (!isMobile.value) return
  mobileDragActive.value = true

  // Listen for touchmove on the document to detect edge proximity
  document.addEventListener('touchmove', handleDragEdgeDetection, { passive: true })
}

const handleMobileDragEnd = () => {
  mobileDragActive.value = false
  clearEdgeScrollTimer()
  document.removeEventListener('touchmove', handleDragEdgeDetection)
}

const handleDragEdgeDetection = (e) => {
  if (!mobileDragActive.value || !e.touches[0]) return

  const x = e.touches[0].clientX
  const screenWidth = window.innerWidth

  if (x < EDGE_ZONE_WIDTH && currentColumnIndex.value > 0) {
    startEdgeScroll(-1)
  } else if (x > screenWidth - EDGE_ZONE_WIDTH && currentColumnIndex.value < visibleColumns.value.length - 1) {
    startEdgeScroll(1)
  } else {
    clearEdgeScrollTimer()
  }
}

const startEdgeScroll = (direction) => {
  if (edgeScrollTimer.value) return // Already scrolling
  edgeScrollTimer.value = setTimeout(() => {
    if (!mobileDragActive.value) return
    currentColumnIndex.value = Math.max(0, Math.min(visibleColumns.value.length - 1, currentColumnIndex.value + direction))
    edgeScrollTimer.value = null
    // Continue scrolling if still at edge
    if (mobileDragActive.value) {
      startEdgeScroll(direction)
    }
  }, EDGE_SCROLL_DELAY)
}

const clearEdgeScrollTimer = () => {
  if (edgeScrollTimer.value) {
    clearTimeout(edgeScrollTimer.value)
    edgeScrollTimer.value = null
  }
}

const handleUpdateTasks = (columnId, newTasks, workstream) => {
  const orderedIds = newTasks.map(t => t.id)
  emit('reorder', columnId, orderedIds, workstream)
}

// Workstream drag and drop
const draggedWorkstream = ref(null)

const handleDragStart = (e, wsName) => {
  draggedWorkstream.value = wsName
  e.dataTransfer.effectAllowed = 'move'
  e.target.classList.add('is-dragging')
}

const handleDragEnd = (e) => {
  draggedWorkstream.value = null
  e.target.classList.remove('is-dragging')
}

const handleDragOver = (e, wsName) => {
  if (draggedWorkstream.value && draggedWorkstream.value !== wsName) {
    e.dataTransfer.dropEffect = 'move'
  }
}

const handleDrop = (e, targetWsName) => {
  if (!draggedWorkstream.value || draggedWorkstream.value === targetWsName) return

  const currentOrder = [...orderedWorkstreamNames.value]
  const draggedIndex = currentOrder.indexOf(draggedWorkstream.value)
  const targetIndex = currentOrder.indexOf(targetWsName)

  if (draggedIndex !== -1 && targetIndex !== -1) {
    // Remove from old position and insert at new position
    currentOrder.splice(draggedIndex, 1)
    currentOrder.splice(targetIndex, 0, draggedWorkstream.value)
    emit('reorderWorkstreams', currentOrder)
  }

  draggedWorkstream.value = null
}

const tasksRowDragOver = ref(false)

const handleDragOverTasks = (e) => {
  if (draggedWorkstream.value) {
    e.dataTransfer.dropEffect = 'move'
    tasksRowDragOver.value = true
  }
}

const handleDragLeaveTasks = () => {
  tasksRowDragOver.value = false
}

const handleDropOnTasks = () => {
  tasksRowDragOver.value = false
  if (!draggedWorkstream.value) return

  // Move the dragged workstream to the first position
  const currentOrder = [...orderedWorkstreamNames.value]
  const draggedIndex = currentOrder.indexOf(draggedWorkstream.value)

  if (draggedIndex !== -1) {
    currentOrder.splice(draggedIndex, 1)
    currentOrder.unshift(draggedWorkstream.value)
    emit('reorderWorkstreams', currentOrder)
  }

  draggedWorkstream.value = null
}

// Workstream color editing
const editingColorWorkstream = ref(null)
const colorPickerPos = ref({ top: 0, left: 0 })

const toggleColorPicker = (e, wsName) => {
  if (editingColorWorkstream.value === wsName) {
    editingColorWorkstream.value = null
  } else {
    const rect = e.target.getBoundingClientRect()
    colorPickerPos.value = { top: rect.bottom + 4, left: rect.left }
    editingColorWorkstream.value = wsName
  }
}

const selectWorkstreamColor = (wsName, color) => {
  emit('update-workstream-color', wsName, { bg: color.bg, text: color.text })
  editingColorWorkstream.value = null
}

const closeColorPicker = () => {
  editingColorWorkstream.value = null
}

// Whether the active column has zero tasks across all workstreams
const todayHasNoTasks = computed(() => {
  const activeCol = visibleColumns.value.find(col => isActiveColumn(col.id))
  if (!activeCol) return false
  const activeTasks = props.tasksByLocation[activeCol.id] || []
  return activeTasks.length === 0
})

const gridTemplateColumns = computed(() => {
  // workstream label column + one column per day (active is wider, all capped)
  const colSizes = visibleColumns.value.map(col =>
    isActiveColumn(col.id) ? 'minmax(220px, 320px)' : 'minmax(180px, 260px)'
  )
  return `120px ${colSizes.join(' ')}`
})

// Scroll to active column on desktop
const scrollToToday = () => {
  if (isMobile.value || !gridWrapper.value) return

  const todayIndex = visibleColumns.value.findIndex(col => isActiveColumn(col.id))
  if (todayIndex > 0) {
    // Wait for layout to complete, then scroll
    setTimeout(() => {
      const headerElements = gridWrapper.value?.querySelectorAll('.grid-header')

      if (headerElements && headerElements.length > 0) {
        // The first header's offsetLeft tells us where day columns start (after the label column)
        const firstDayColumnStart = headerElements[0].offsetLeft
        const todayHeader = headerElements[todayIndex]

        // Scroll = today's position minus where we want it to appear (at firstDayColumnStart)
        gridWrapper.value.scrollLeft = todayHeader.offsetLeft - firstDayColumnStart
      }
    }, 50)
  }
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  window.addEventListener('click', closeColorPicker)

  // Scroll to today after DOM is ready
  nextTick(() => {
    scrollToToday()
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
  window.removeEventListener('click', closeColorPicker)
  clearEdgeScrollTimer()
  document.removeEventListener('touchmove', handleDragEdgeDetection)
})
</script>

<template>
  <!-- Desktop View - Grid Layout -->
  <div v-if="!isMobile" ref="gridWrapper" class="week-grid-wrapper">
    <div class="week-grid" :style="{ gridTemplateColumns }">
    <!-- Header row -->
    <div class="grid-header-corner"></div>
    <div
      v-for="column in visibleColumns"
      :key="'header-' + column.id"
      class="grid-header"
      :class="{ 'is-today': isActiveColumn(column.id) }"
    >
      <span class="column-title">
        {{ column.label }}
        <span v-if="formatColumnDate(column.id)" class="column-date">{{ formatColumnDate(column.id) }}</span>
      </span>
      <span v-if="isActiveColumn(column.id)" class="today-badge">{{ weekAdvanced && column.id === LOCATIONS.THIS_WEEK ? 'Planning' : 'Today' }}</span>
      <span class="column-count" v-if="(tasksByLocation[column.id] || []).filter(t => !t.completed).length > 0">
        {{ (tasksByLocation[column.id] || []).filter(t => !t.completed).length }}
      </span>
    </div>

    <!-- "Tasks" row (null workstream) - always first, accepts drops to reorder -->
    <div
      class="grid-row-label tasks-row-label"
      :class="{ 'drag-over': tasksRowDragOver }"
      @dragover.prevent="handleDragOverTasks"
      @dragleave="handleDragLeaveTasks"
      @drop="handleDropOnTasks"
    >
      <span class="workstream-label">Tasks</span>
    </div>
    <WorkstreamCell
      v-for="column in visibleColumns"
      :key="'tasks-' + column.id"
      :workstream="null"
      :workstream-color="null"
      :tasks="getTasksForCell(column.id, null)"
      :location="column.id"
      :all-tasks="allTasks"
      :is-today="isActiveColumn(column.id)"
      :show-empty-state="isActiveColumn(column.id) && todayHasNoTasks"
      :class="{ 'is-today': isActiveColumn(column.id), 'is-last-row': visibleWorkstreamNames.length === 0 }"
      @add="(location, workstream) => emit('add', location, workstream)"
      @toggle="emit('toggle', $event)"
      @edit="emit('edit', $event)"
      @delete="emit('delete', $event)"
      @bite="emit('bite', $event)"
      @update:tasks="(tasks) => handleUpdateTasks(column.id, tasks, null)"
      @multi-drop="(location, workstream, draggedId) => emit('multi-drop', location, workstream, draggedId)"
    />

    <!-- Draggable workstream rows -->
    <template v-for="wsName in visibleWorkstreamNames" :key="wsName">
      <!-- Workstream label (draggable) -->
      <div
        class="grid-row-label draggable-row-label"
        draggable="true"
        @dragstart="handleDragStart($event, wsName)"
        @dragend="handleDragEnd"
        @dragover.prevent="handleDragOver($event, wsName)"
        @drop="handleDrop($event, wsName)"
      >
        <div
          class="ws-pill"
          :style="{
            backgroundColor: getWorkstreamColor(wsName)?.bg,
            borderLeftColor: getWorkstreamColor(wsName)?.text,
            color: getWorkstreamColor(wsName)?.text
          }"
        >
          <span class="drag-handle">⋮⋮</span>
          <span class="workstream-label" @click.stop="toggleColorPicker($event, wsName)">{{ wsName }}</span>
        </div>
      </div>

      <!-- Cells for each column -->
      <WorkstreamCell
        v-for="column in visibleColumns"
        :key="wsName + '-' + column.id"
        :workstream="wsName"
        :workstream-color="getWorkstreamColor(wsName)"
        :tasks="getTasksForCell(column.id, wsName)"
        :location="column.id"
        :all-tasks="allTasks"
        :is-today="isActiveColumn(column.id)"
        :class="{ 'is-today': isActiveColumn(column.id), 'is-last-row': isLastRow(wsName) }"
        @add="(location, workstream) => emit('add', location, workstream)"
        @toggle="emit('toggle', $event)"
        @edit="emit('edit', $event)"
        @delete="emit('delete', $event)"
        @bite="emit('bite', $event)"
        @update:tasks="(tasks) => handleUpdateTasks(column.id, tasks, wsName)"
        @multi-drop="(location, workstream, draggedId) => emit('multi-drop', location, workstream, draggedId)"
      />
    </template>
    </div>

    <!-- Color picker popover (teleported to body to escape sticky context) -->
    <Teleport to="body">
      <div
        v-if="editingColorWorkstream"
        class="ws-color-popover"
        :style="{ top: colorPickerPos.top + 'px', left: colorPickerPos.left + 'px' }"
        @click.stop
      >
        <div class="ws-color-options">
          <button
            v-for="(color, index) in WORKSTREAM_COLORS"
            :key="index"
            class="ws-color-option"
            :class="{ 'is-selected': getWorkstreamColor(editingColorWorkstream)?.bg === color.bg }"
            :style="{ backgroundColor: color.bg, borderColor: color.text }"
            :title="color.name"
            @click.stop="selectWorkstreamColor(editingColorWorkstream, color)"
          />
        </div>
      </div>
    </Teleport>
  </div>

  <!-- Mobile View -->
  <div
    v-else
    class="week-view is-mobile"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <div
      class="mobile-columns-wrapper"
      :style="{
        transform: `translateX(calc(-${currentColumnIndex * 100}% + ${interimOffset}px))`,
        transition: isSwiping ? 'none' : 'transform 0.3s ease'
      }"
    >
      <TaskColumn
        v-for="(column, index) in visibleColumns"
        :key="column.id"
        :column="column"
        :tasks="tasksByLocation[column.id] || []"
        :is-today="isActiveColumn(column.id)"
        :is-currently-viewed="index === currentColumnIndex"
        :is-mobile="true"
        :workstreams="workstreams"
        :all-tasks="allTasks"
        @add="(location, workstream) => emit('add', location, workstream)"
        @toggle="emit('toggle', $event)"
        @edit="emit('edit', $event)"
        @delete="emit('delete', $event)"
        @bite="emit('bite', $event)"
        @update:tasks="(tasks, ws) => handleUpdateTasks(column.id, tasks, ws)"
        @create-workstream="emit('createWorkstream', $event)"
        @multi-drop="(location, workstream, draggedId) => emit('multi-drop', location, workstream, draggedId)"
        @mobile-drag-start="handleMobileDragStart"
        @mobile-drag-end="handleMobileDragEnd"
      />
    </div>

    <!-- Edge zone indicators during drag -->
    <div v-if="mobileDragActive" class="mobile-drag-edge left-edge"></div>
    <div v-if="mobileDragActive" class="mobile-drag-edge right-edge"></div>

    <!-- Column navigation bar -->
    <div class="column-nav-bar">
      <button
        v-for="(column, index) in visibleColumns"
        :key="column.id"
        class="nav-pill"
        :class="{
          'is-active': index === currentColumnIndex,
          'is-today': isActiveColumn(column.id)
        }"
        @click="goToColumn(index)"
      >
        {{ column.shortLabel || column.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.week-grid-wrapper {
  overflow-x: auto;
  overflow-y: visible;
  min-height: calc(100vh - 140px);
}

.week-grid {
  display: grid;
  gap: 1px;
  background: var(--color-border);
  border-radius: var(--radius-lg);
  width: max-content;
}

.grid-header-corner {
  background: var(--color-bg);
  padding: 12px;
  position: sticky;
  left: 0;
  top: 0;
  z-index: 3;
  box-shadow: 1px 1px 0 0 var(--color-border);
}

.grid-header {
  background: var(--color-bg);
  padding: 12px 16px;
  font-weight: 500;
  font-size: 0.82rem;
  display: flex;
  align-items: center;
  gap: 8px;
  position: sticky;
  top: 0;
  z-index: 1;
  color: var(--color-text-muted);
  letter-spacing: -0.01em;
}

.grid-header.is-today {
  box-shadow: inset 2px 0 0 0 var(--color-primary), inset -2px 0 0 0 var(--color-primary), inset 0 2px 0 0 var(--color-primary), 0 4px 20px rgba(71, 85, 105, 0.12);
  background: var(--color-today);
  color: var(--color-text);
  font-size: 0.92rem;
}

.column-title {
  font-weight: 500;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.column-date {
  font-size: 0.72rem;
  font-weight: 400;
  color: var(--color-text-muted);
}

.grid-header.is-today .column-date {
  color: var(--color-primary);
  font-weight: 500;
}

.grid-header.is-today .column-title {
  font-weight: 600;
}

.column-count {
  background: var(--color-border);
  color: var(--color-text-muted);
  font-size: 0.7rem;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;
}

.grid-header.is-today .column-count {
  background: rgba(71, 85, 105, 0.12);
  color: var(--color-primary);
  font-weight: 600;
}

.today-badge {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: var(--color-primary);
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  line-height: 1;
}

.grid-row-label {
  background: var(--color-surface);
  padding: 8px 6px;
  display: flex;
  align-items: flex-start;
  gap: 4px;
  position: sticky;
  left: 0;
  z-index: 2;
  box-shadow: 1px 0 0 0 var(--color-border);
}

.grid-row-label.draggable-row-label {
  border-radius: 0;
  padding: 8px 6px;
}

.ws-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 4px;
  border-left: 3px solid;
}

.grid-row-label.tasks-row-label {
  padding-left: 12px;
  padding-bottom: 24px;
  margin-bottom: -12px;
}

.grid-row-label.tasks-row-label::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 20px;
  background: linear-gradient(to bottom, transparent, rgba(71, 85, 105, 0.1));
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}

.grid-row-label.tasks-row-label.drag-over::after {
  opacity: 1;
}

.grid-row-label.draggable-row-label {
  cursor: grab;
}

.grid-row-label.draggable-row-label:active {
  cursor: grabbing;
}

.grid-row-label.is-dragging {
  opacity: 0.5;
}

.drag-handle {
  color: inherit;
  font-size: 0.6rem;
  line-height: 1;
  opacity: 0.4;
  user-select: none;
}

.grid-row-label:hover .drag-handle {
  opacity: 1;
}

.workstream-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  writing-mode: horizontal-tb;
  line-height: 1.2;
}

/* Workstream color picker */
/* Note: position: sticky (set above) already establishes a containing block for
   the absolutely-positioned color picker popover, so no extra position: relative needed */

.workstream-label {
  cursor: pointer;
}

/* Teleported to body — use :global to escape scoped styles */
:global(.ws-color-popover) {
  position: fixed;
  z-index: 100;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  padding: 8px;
  min-width: 140px;
}

:global(.ws-color-options) {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

:global(.ws-color-option) {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

:global(.ws-color-option:hover) {
  transform: scale(1.2);
}

:global(.ws-color-option.is-selected) {
  border-style: solid;
  border-width: 2px;
  box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 4px currentColor;
}

.week-grid :deep(.workstream-cell) {
  background-color: var(--color-surface);
}

.week-grid :deep(.workstream-cell.is-today) {
  box-shadow: inset 2px 0 0 0 var(--color-primary), inset -2px 0 0 0 var(--color-primary), 0 4px 20px rgba(71, 85, 105, 0.12);
  background-color: var(--color-today);
}

.week-grid :deep(.workstream-cell.is-today.is-last-row) {
  box-shadow: inset 2px 0 0 0 var(--color-primary), inset -2px 0 0 0 var(--color-primary), inset 0 -2px 0 0 var(--color-primary), 0 4px 20px rgba(71, 85, 105, 0.12);
  background-color: var(--color-today);
}

/* Mobile styles */
.week-view.is-mobile {
  position: relative;
  overflow: hidden;
}

.mobile-columns-wrapper {
  display: flex;
  touch-action: pan-y;
}

.column-nav-bar {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  justify-content: center;
}

.column-nav-bar::-webkit-scrollbar {
  display: none;
}

.nav-pill {
  flex-shrink: 0;
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 0.78rem;
  font-weight: 500;
  background: var(--color-bg);
  color: var(--color-text-muted);
  border: 1px solid transparent;
  white-space: nowrap;
  cursor: pointer;
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

/* Mobile drag-to-edge zones */
.mobile-drag-edge {
  position: fixed;
  top: 0;
  bottom: 0;
  width: 40px;
  z-index: 10;
  pointer-events: none;
}

.mobile-drag-edge.left-edge {
  left: 0;
  background: linear-gradient(to right, rgba(42, 125, 110, 0.15), transparent);
}

.mobile-drag-edge.right-edge {
  right: 0;
  background: linear-gradient(to left, rgba(42, 125, 110, 0.15), transparent);
}
</style>
