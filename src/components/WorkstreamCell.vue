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
    return {
      backgroundColor: props.workstreamColor.bg
    }
  }
  return {}
})

const handleAdd = () => {
  emit('add', props.location, props.workstream)
}
</script>

<template>
  <div class="workstream-cell" :style="cellStyle">
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
          :compact="!isToday"
          @toggle="emit('toggle', $event)"
          @edit="emit('edit', $event)"
          @delete="emit('delete', $event)"
          @bite="emit('bite', $event)"
        />
      </template>
    </draggable>
    <button
      class="cell-add-btn"
      @click="handleAdd"
      title="Add task"
      :style="workstreamColor ? { borderColor: workstreamColor.text, color: workstreamColor.text } : {}"
    >
      +
    </button>
  </div>
</template>

<style scoped>
.workstream-cell {
  padding: 8px;
  min-height: 80px;
  display: flex;
  flex-direction: column;
}

.cell-tasks {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-height: 40px;
}

.cell-add-btn {
  width: 100%;
  padding: 6px;
  margin-top: 8px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 1rem;
  cursor: pointer;
  transition: all var(--transition);
}

.cell-add-btn:hover {
  background: rgba(0, 0, 0, 0.03);
  border-color: var(--color-text-secondary);
}
</style>
