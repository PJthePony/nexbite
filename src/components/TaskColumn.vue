<script setup>
import { computed } from 'vue'
import WorkstreamRow from './WorkstreamRow.vue'

const props = defineProps({
  column: {
    type: Object,
    required: true
  },
  tasks: {
    type: Array,
    required: true
  },
  workstreams: {
    type: Array,
    default: () => []
  },
  isToday: {
    type: Boolean,
    default: false
  },
  isPastDay: {
    type: Boolean,
    default: false
  },
  hideWhenEmpty: {
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
  },
  allTasks: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['add', 'toggle', 'edit', 'delete', 'bite', 'update:tasks', 'createWorkstream', 'multi-drop', 'mobile-drag-start', 'mobile-drag-end'])

const taskCount = computed(() => {
  return props.tasks.filter(t => !t.completed).length
})

const shouldHide = computed(() => {
  return props.hideWhenEmpty && props.tasks.length === 0
})

// Group tasks by workstream
const tasksByWorkstream = computed(() => {
  const groups = {}

  // Initialize with null workstream (always first)
  groups[null] = []

  // Group tasks
  props.tasks.forEach(task => {
    const ws = task.workstream || null
    if (!groups[ws]) {
      groups[ws] = []
    }
    groups[ws].push(task)
  })

  return groups
})

// Get ordered list of all workstreams (shown as rows across all columns)
const allWorkstreamRows = computed(() => {
  // Get all workstream names from the workstreams prop, sorted alphabetically
  const wsNames = props.workstreams.map(w => w.name).sort()

  // null (no workstream) is always first, then only workstreams with tasks
  return [null, ...wsNames.filter(ws => getTasksForWorkstream(ws).length > 0)]
})

const getWorkstreamColor = (workstreamName) => {
  if (!workstreamName) return null
  const ws = props.workstreams.find(w => w.name === workstreamName)
  return ws ? ws.color : null
}

const getTasksForWorkstream = (workstream) => {
  return tasksByWorkstream.value[workstream] || []
}

const handleUpdateTasks = (workstream, newTasks) => {
  // Emit update:tasks event with task list and workstream
  emit('update:tasks', newTasks, workstream)
}

const handleAdd = (location, workstream) => {
  emit('add', location, workstream)
}
</script>

<template>
  <div
    v-if="!shouldHide"
    class="task-column"
    :class="{ 'is-today': isToday }"
  >
    <div class="column-header">
      <div>
        <span class="column-title">{{ column.label }}</span>
        <span v-if="taskCount > 0" class="column-count">{{ taskCount }}</span>
      </div>
    </div>
    <div class="column-tasks">
      <WorkstreamRow
        v-for="ws in allWorkstreamRows"
        :key="ws || 'no-workstream'"
        :workstream="ws"
        :workstream-color="getWorkstreamColor(ws)"
        :tasks="getTasksForWorkstream(ws)"
        :location="column.id"
        :all-tasks="allTasks"
        :is-today="isToday"
        :is-past-day="isPastDay"
        :is-currently-viewed="isCurrentlyViewed"
        :is-mobile="isMobile"
        @add="handleAdd"
        @toggle="emit('toggle', $event)"
        @edit="emit('edit', $event)"
        @delete="emit('delete', $event)"
        @bite="emit('bite', $event)"
        @update:tasks="handleUpdateTasks(ws, $event)"
        @multi-drop="(location, workstream, draggedId) => emit('multi-drop', location, workstream, draggedId)"
        @mobile-drag-start="emit('mobile-drag-start')"
        @mobile-drag-end="emit('mobile-drag-end')"
      />
    </div>
  </div>
</template>
