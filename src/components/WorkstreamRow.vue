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
  isCurrentlyViewed: {
    type: Boolean,
    default: false
  },
  isMobile: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['add', 'toggle', 'edit', 'delete', 'bite', 'update:tasks', 'multi-drop', 'mobile-drag-start', 'mobile-drag-end'])

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

  if (props.isMobile) {
    emit('mobile-drag-start')
  }
}

const handleDragEnd = () => {
  endDrag()
  if (props.isMobile) {
    emit('mobile-drag-end')
  }
}

const handleDragChange = (evt) => {
  // Fires when a task is added to this row from another row
  if (evt.added && selectedTaskIds.value.size > 0) {
    const addedTask = evt.added.element
    if (selectedTaskIds.value.has(addedTask.id)) {
      emit('multi-drop', props.location, props.workstream, addedTask.id)
    }
  }
}

const rowLabel = computed(() => {
  return props.workstream || 'Tasks'
})

const rowStyle = computed(() => {
  if (props.workstreamColor) {
    return {
      borderLeftColor: props.workstreamColor.text,
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
  <div class="workstream-row" :style="rowStyle">
    <div class="workstream-header" v-if="workstream">
      <span
        class="workstream-label"
        :style="{ color: workstreamColor?.text }"
      >
        {{ rowLabel }}
      </span>
    </div>
    <draggable
      v-model="localTasks"
      :group="{ name: 'tasks', pull: true, put: true }"
      item-key="id"
      class="workstream-tasks"
      ghost-class="sortable-ghost"
      chosen-class="sortable-chosen"
      drag-class="sortable-drag"
      :force-fallback="true"
      :animation="150"
      :delay="isMobile ? 300 : 0"
      :delay-on-touch-only="true"
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
          :compact="!isToday && !isCurrentlyViewed"
          :is-mobile="isMobile"
          @toggle="emit('toggle', $event)"
          @edit="emit('edit', $event)"
          @delete="emit('delete', $event)"
          @bite="emit('bite', $event)"
        />
      </template>
    </draggable>
    <button
      class="workstream-add-btn"
      @click="handleAdd"
      title="Add task"
      :style="workstreamColor ? { color: workstreamColor.text } : {}"
    >
      +
    </button>
  </div>
</template>

<style scoped>
.workstream-row {
  border-left: 3px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 8px;
  margin-bottom: 8px;
  background: var(--color-surface);
}

.workstream-header {
  margin-bottom: 8px;
  padding-bottom: 4px;
}

.workstream-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.workstream-tasks {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 40px;
}

.workstream-add-btn {
  width: 100%;
  padding: 8px;
  margin-top: 8px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 1rem;
  cursor: pointer;
  transition: all var(--transition);
}

.workstream-add-btn:hover {
  background: var(--color-bg);
  border-color: var(--color-text-secondary);
}
</style>
