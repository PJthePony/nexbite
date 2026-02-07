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
  }
})

const emit = defineEmits(['add', 'toggle', 'edit', 'delete', 'bite', 'move', 'reorder', 'createWorkstream', 'reorderWorkstreams', 'multi-drop', 'update-workstream-color'])

const { isToday, currentDayLocation } = useWeekLogic()

// Refs
const gridWrapper = ref(null)

// Mobile state
const isMobile = ref(false)
const currentColumnIndex = ref(0)
const touchStartX = ref(0)
const touchEndX = ref(0)
const isDragging = ref(false)

// Get visible columns (filter out hidden ones)
const visibleColumns = computed(() => {
  return ALL_COLUMNS.filter(col => {
    if (col.hideWhenEmpty) {
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
  return columnTasks.filter(t => (t.workstream || null) === workstream)
}

// Check if a workstream is the last row (for bottom border of today column)
const isLastRow = (wsName) => {
  const wsNames = orderedWorkstreamNames.value
  if (wsNames.length === 0) return true // Tasks row is last if no workstreams
  return wsName === wsNames[wsNames.length - 1]
}

const checkMobile = () => {
  isMobile.value = window.innerWidth <= 768
  if (isMobile.value) {
    const todayIndex = visibleColumns.value.findIndex(col =>
      col.id === currentDayLocation.value
    )
    if (todayIndex !== -1) {
      currentColumnIndex.value = todayIndex
    }
  }
}

const handleTouchStart = (e) => {
  touchStartX.value = e.touches[0].clientX
  isDragging.value = true
}

const handleTouchMove = (e) => {
  if (!isDragging.value) return
  touchEndX.value = e.touches[0].clientX
}

const handleTouchEnd = () => {
  if (!isDragging.value) return
  isDragging.value = false

  const diff = touchStartX.value - touchEndX.value
  const threshold = 50

  if (Math.abs(diff) > threshold) {
    if (diff > 0 && currentColumnIndex.value < visibleColumns.value.length - 1) {
      currentColumnIndex.value++
    } else if (diff < 0 && currentColumnIndex.value > 0) {
      currentColumnIndex.value--
    }
  }

  touchStartX.value = 0
  touchEndX.value = 0
}

const goToColumn = (index) => {
  currentColumnIndex.value = index
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

const toggleColorPicker = (wsName) => {
  if (editingColorWorkstream.value === wsName) {
    editingColorWorkstream.value = null
  } else {
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

const gridTemplateColumns = computed(() => {
  // workstream label column + one column per day
  return `120px repeat(${visibleColumns.value.length}, minmax(220px, 1fr))`
})

// Scroll to today's column on desktop
const scrollToToday = () => {
  if (isMobile.value || !gridWrapper.value) return

  const todayIndex = visibleColumns.value.findIndex(col => isToday(col.id))
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
      :class="{ 'is-today': isToday(column.id) }"
    >
      <span class="column-title">{{ column.label }}</span>
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
      :is-today="isToday(column.id)"
      :class="{ 'is-today': isToday(column.id), 'is-last-row': orderedWorkstreamNames.length === 0 }"
      @add="(location, workstream) => emit('add', location, workstream)"
      @toggle="emit('toggle', $event)"
      @edit="emit('edit', $event)"
      @delete="emit('delete', $event)"
      @bite="emit('bite', $event)"
      @update:tasks="(tasks) => handleUpdateTasks(column.id, tasks, null)"
      @multi-drop="(location, workstream, draggedId) => emit('multi-drop', location, workstream, draggedId)"
    />

    <!-- Draggable workstream rows -->
    <template v-for="wsName in orderedWorkstreamNames" :key="wsName">
      <!-- Workstream label (draggable) -->
      <div
        class="grid-row-label draggable-row-label"
        :style="{
          backgroundColor: getWorkstreamColor(wsName)?.bg,
          borderLeftColor: getWorkstreamColor(wsName)?.text,
          color: getWorkstreamColor(wsName)?.text
        }"
        draggable="true"
        @dragstart="handleDragStart($event, wsName)"
        @dragend="handleDragEnd"
        @dragover.prevent="handleDragOver($event, wsName)"
        @drop="handleDrop($event, wsName)"
      >
        <span class="drag-handle">⋮⋮</span>
        <span class="workstream-label" @click.stop="toggleColorPicker(wsName)">{{ wsName }}</span>

        <!-- Color picker popover -->
        <div v-if="editingColorWorkstream === wsName" class="ws-color-popover" @click.stop>
          <div class="ws-color-options">
            <button
              v-for="(color, index) in WORKSTREAM_COLORS"
              :key="index"
              class="ws-color-option"
              :class="{ 'is-selected': getWorkstreamColor(wsName)?.bg === color.bg }"
              :style="{ backgroundColor: color.bg, borderColor: color.text }"
              :title="color.name"
              @click.stop="selectWorkstreamColor(wsName, color)"
            />
          </div>
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
        :is-today="isToday(column.id)"
        :class="{ 'is-today': isToday(column.id), 'is-last-row': isLastRow(wsName) }"
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
      :style="{ transform: `translateX(-${currentColumnIndex * 100}vw)` }"
    >
      <TaskColumn
        v-for="column in visibleColumns"
        :key="column.id"
        :column="column"
        :tasks="tasksByLocation[column.id] || []"
        :is-today="isToday(column.id)"
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
      />
    </div>

    <!-- Column indicator dots -->
    <div class="column-indicator">
      <button
        v-for="(column, index) in visibleColumns"
        :key="column.id"
        class="indicator-dot"
        :class="{ 'is-active': index === currentColumnIndex }"
        @click="goToColumn(index)"
        :title="column.label"
      />
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
  min-width: 100%;
}

.grid-header-corner {
  background: var(--color-bg);
  padding: 12px;
  position: sticky;
  left: 0;
  top: 0;
  z-index: 3;
}

.grid-header {
  background: var(--color-bg);
  padding: 12px 16px;
  font-weight: 500;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 8px;
  position: sticky;
  top: 0;
  z-index: 1;
  color: var(--color-text-secondary);
  letter-spacing: -0.01em;
}

.grid-header.is-today {
  box-shadow: inset 2px 0 0 0 var(--color-success), inset -2px 0 0 0 var(--color-success), inset 0 2px 0 0 var(--color-success);
  color: var(--color-text);
}

.column-title {
  font-weight: 500;
}

.column-count {
  background: var(--color-border);
  color: var(--color-text-muted);
  font-size: 0.7rem;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;
}

.grid-row-label {
  background: var(--color-surface);
  padding: 12px;
  border-left: 3px solid var(--color-border);
  display: flex;
  align-items: flex-start;
  gap: 6px;
  position: sticky;
  left: 0;
  z-index: 2;
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
  background: linear-gradient(to bottom, transparent, rgba(59, 130, 246, 0.1));
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
  color: var(--color-text-secondary);
  font-size: 0.7rem;
  line-height: 1;
  opacity: 0.5;
  user-select: none;
}

.grid-row-label:hover .drag-handle {
  opacity: 1;
}

.workstream-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  writing-mode: horizontal-tb;
}

/* Workstream color picker */
.grid-row-label {
  position: relative;
}

.workstream-label {
  cursor: pointer;
}

.ws-color-popover {
  position: absolute;
  top: 100%;
  left: 8px;
  z-index: 10;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  padding: 8px;
  min-width: 140px;
}

.ws-color-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ws-color-option {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all var(--transition);
}

.ws-color-option:hover {
  transform: scale(1.2);
}

.ws-color-option.is-selected {
  border-style: solid;
  border-width: 2px;
  box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 4px currentColor;
}

.week-grid :deep(.workstream-cell) {
  background: var(--color-surface);
}

.week-grid :deep(.workstream-cell.is-today) {
  box-shadow: inset 2px 0 0 0 var(--color-success), inset -2px 0 0 0 var(--color-success);
}

.week-grid :deep(.workstream-cell.is-today.is-last-row) {
  box-shadow: inset 2px 0 0 0 var(--color-success), inset -2px 0 0 0 var(--color-success), inset 0 -2px 0 0 var(--color-success);
}

/* Mobile styles */
.week-view.is-mobile {
  position: relative;
  overflow: hidden;
}

.mobile-columns-wrapper {
  display: flex;
  transition: transform 0.3s ease;
  touch-action: pan-y;
}

.column-indicator {
  display: flex;
  justify-content: center;
  gap: 6px;
  padding: 12px;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
}

.indicator-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-border);
  border: none;
  cursor: pointer;
}

.indicator-dot.is-active {
  background: var(--color-primary);
}
</style>
