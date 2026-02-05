<script setup>
import { computed } from 'vue'
import draggable from 'vuedraggable'
import TaskItem from './TaskItem.vue'

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
  }
})

const emit = defineEmits(['add', 'toggle', 'edit', 'delete', 'update:tasks'])

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
      :animation="150"
    >
      <template #item="{ element }">
        <TaskItem
          :task="element"
          :workstream-color="workstreamColor"
          @toggle="emit('toggle', $event)"
          @edit="emit('edit', $event)"
          @delete="emit('delete', $event)"
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
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
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
