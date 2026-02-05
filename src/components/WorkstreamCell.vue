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
