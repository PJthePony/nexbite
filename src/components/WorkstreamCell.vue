<script setup>
import { computed } from 'vue'
import Sortable from 'sortablejs'
import draggable from 'vuedraggable'
import TaskItem from './TaskItem.vue'
import { useMultiSelect } from '../composables/useMultiSelect'

const { selectedTaskIds, startDrag, endDrag } = useMultiSelect()

const props = defineProps({
  workstream: {
    type: String,
    default: null
  },
  workstreamColor: {
    type: Object,
    default: null
  },
  tasks: {
    type: Array,
    required: true
  },
  location: {
    type: String,
    required: true
  },
  allTasks: {
    type: Array,
    default: () => []
  },
  isToday: {
    type: Boolean,
    default: false
  },
  showEmptyState: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['add', 'toggle', 'edit', 'delete', 'bite', 'update:tasks', 'multi-drop'])

const getParentTask = (task) => {
  if (!task.parentTaskId) return null
  return props.allTasks.find(t => t.id === task.parentTaskId) || null
}

const getBiteCount = (task) => {
  if (!task.biteTaskIds || task.biteTaskIds.length === 0) return 0
  return task.biteTaskIds.length
}

const getCompletedBiteCount = (task) => {
  if (!task.biteTaskIds || task.biteTaskIds.length === 0) return 0
  return task.biteTaskIds.filter(id => {
    const bite = props.allTasks.find(t => t.id === id)
    return bite && bite.completed
  }).length
}

const localTasks = computed({
  get: () => props.tasks,
  set: (value) => {
    // When tasks are dropped here, update their workstream
    const updatedTasks = value.map(task => ({
      ...task,
      workstream: props.workstream
    }))
    emit('update:tasks', updatedTasks)
  }
})

const handleDragStart = (evt) => {
  const taskId = localTasks.value[evt.oldIndex]?.id
  if (taskId) startDrag(taskId)

  // Modify the fallback ghost to show "N tasks" for multi-select drags
  if (taskId && selectedTaskIds.value.has(taskId) && selectedTaskIds.value.size > 1) {
    const ghost = Sortable.ghost
    if (ghost) {
      const count = selectedTaskIds.value.size
      ghost.innerHTML = `<div class="multi-drag-label">${count} ${count === 1 ? 'task' : 'tasks'}</div>`
    }
  }
}

const handleDragEnd = () => {
  endDrag()
}

const handleDragChange = (evt) => {
  // Fires when a task is added to this cell from another cell
  if (evt.added && selectedTaskIds.value.size > 0) {
    const addedTask = evt.added.element
    if (selectedTaskIds.value.has(addedTask.id)) {
      emit('multi-drop', props.location, props.workstream, addedTask.id)
    }
  }
}

const cellStyle = computed(() => {
  if (props.workstreamColor) {
    if (props.isToday) {
      // Blend workstream tint with today background for a subtler effect
      return {
        backgroundColor: props.workstreamColor.bg,
        backgroundImage: 'linear-gradient(rgba(249,250,248,0.4), rgba(249,250,248,0.4))'
      }
    }
    return {
      backgroundColor: props.workstreamColor.bg
    }
  }
  return {}
})

const isLater = computed(() => props.location === 'later')
const isEmpty = computed(() => localTasks.value.length === 0)

const handleAdd = () => {
  emit('add', props.location, props.workstream)
}

const handleCellClick = (e) => {
  // Only trigger if the cell itself or the empty drag area was clicked (not a task card or button)
  if (isEmpty.value && (e.target.closest('.workstream-cell') === e.currentTarget)) {
    handleAdd()
  }
}
</script>

<template>
  <div class="workstream-cell" :class="{ 'is-empty': isEmpty, 'is-later': isLater }" :style="cellStyle" @click="handleCellClick">
    <!-- Later column: show count only, but still accept drops -->
    <template v-if="isLater">
      <draggable
        v-model="localTasks"
        :group="{ name: 'tasks', pull: true, put: true }"
        item-key="id"
        class="cell-tasks later-drop-zone"
        ghost-class="sortable-ghost"
        chosen-class="sortable-chosen"
        drag-class="sortable-drag"
        :force-fallback="true"
        :animation="150"
        @start="handleDragStart"
        @end="handleDragEnd"
        @change="handleDragChange"
      >
        <template #item="{ element }">
          <!-- Hidden: items exist for drag-and-drop but are not rendered -->
          <div class="later-hidden-item"></div>
        </template>
      </draggable>
      <div v-if="localTasks.length > 0" class="later-count" @click.stop="emit('edit', localTasks[0])">
        <span class="later-count-number">{{ localTasks.length }}</span>
        <span class="later-count-label">{{ localTasks.length === 1 ? 'task' : 'tasks' }}</span>
      </div>
    </template>

    <!-- Normal columns: full task rendering -->
    <template v-else>
      <draggable
        v-model="localTasks"
        :group="{ name: 'tasks', pull: true, put: true }"
        item-key="id"
        class="cell-tasks"
        ghost-class="sortable-ghost"
        chosen-class="sortable-chosen"
        drag-class="sortable-drag"
        :force-fallback="true"
        :animation="150"
        @start="handleDragStart"
        @end="handleDragEnd"
        @change="handleDragChange"
      >
        <template #item="{ element }">
          <TaskItem
            :task="element"
            :workstream-color="workstreamColor"
            :parent-task="getParentTask(element)"
            :bite-count="getBiteCount(element)"
            :completed-bite-count="getCompletedBiteCount(element)"
            :compact="!isToday"
            @toggle="emit('toggle', $event)"
            @edit="emit('edit', $event)"
            @delete="emit('delete', $event)"
            @bite="emit('bite', $event)"
          />
        </template>
        <template #footer v-if="localTasks.length === 0 && showEmptyState">
          <div class="column-empty">
            <span class="column-empty-icon">+</span>
            <span class="column-empty-title">No tasks yet</span>
            <span class="column-empty-desc">Add a task to get started</span>
            <button class="column-empty-cta" @click.stop="handleAdd">+ Add Task</button>
          </div>
        </template>
      </draggable>
      <button
        class="cell-add-btn"
        @click="handleAdd"
        title="Add task"
        :style="workstreamColor ? { borderColor: workstreamColor.text, color: workstreamColor.text } : {}"
      >
        + Add a task...
      </button>
    </template>
  </div>
</template>

<style scoped>
.workstream-cell {
  padding: 8px;
  min-height: 48px;
  display: flex;
  flex-direction: column;
}

.workstream-cell.is-empty {
  cursor: pointer;
}

.workstream-cell.is-empty:hover {
  background-image: linear-gradient(rgba(0, 0, 0, 0.015), rgba(0, 0, 0, 0.015));
}

.cell-tasks {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-height: 24px;
}

.cell-add-btn {
  width: 100%;
  padding: 8px 12px;
  margin-top: 8px;
  border: 1px dashed transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.82rem;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: all var(--transition);
  opacity: 0;
}

.workstream-cell:hover .cell-add-btn {
  opacity: 1;
  border-color: var(--color-border);
}

.cell-add-btn:hover {
  background: rgba(0, 0, 0, 0.03);
  border-color: var(--color-text-secondary);
}

/* Later column: count-only display */
.workstream-cell.is-later {
  min-height: 36px;
  justify-content: center;
  align-items: center;
  position: relative;
}

.later-drop-zone {
  position: absolute;
  inset: 0;
  min-height: 0;
}

.later-hidden-item {
  display: none;
}

.later-count {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease;
  position: relative;
  z-index: 1;
}

.later-count:hover {
  background: rgba(0, 0, 0, 0.05);
}

.later-count-number {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.later-count-label {
  font-size: 0.72rem;
  color: var(--color-text-muted);
}
</style>
