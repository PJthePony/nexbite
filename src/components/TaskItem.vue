<script setup>
import { computed } from 'vue'

const props = defineProps({
  task: {
    type: Object,
    required: true
  },
  workstreamColor: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['toggle', 'edit', 'delete'])

const cardStyle = computed(() => {
  if (props.workstreamColor) {
    return {
      backgroundColor: props.workstreamColor.bg,
      borderColor: props.workstreamColor.text
    }
  }
  return {}
})
</script>

<template>
  <div
    class="task-item"
    :class="{ 'is-completed': task.completed }"
    :style="cardStyle"
    @click="emit('edit', task)"
  >
    <div class="task-header">
      <input
        type="checkbox"
        class="task-checkbox"
        :checked="task.completed"
        @click.stop="emit('toggle', task.id)"
        @change.stop
      />
      <div class="task-content">
        <div class="task-title">{{ task.title }}</div>
        <div v-if="task.notes" class="task-notes-indicator">
          Has notes
        </div>
      </div>
      <div class="task-actions">
        <button
          class="task-action-btn delete"
          @click.stop="emit('delete', task.id)"
          title="Delete task"
        >
          &times;
        </button>
      </div>
    </div>
    <div v-if="task.tags && task.tags.length > 0" class="task-tags">
      <span
        v-for="tag in task.tags"
        :key="tag"
        class="task-tag"
      >
        {{ tag }}
      </span>
    </div>
  </div>
</template>
