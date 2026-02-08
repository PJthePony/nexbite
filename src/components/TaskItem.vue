<script setup>
import { computed } from 'vue'
import { useMultiSelect } from '../composables/useMultiSelect'

const { isSelectMode, isSelected: checkIsSelected, toggleSelection, clearSelection, selectedTaskIds, isDraggingSelected, draggedTaskId } = useMultiSelect()

const props = defineProps({
  task: {
    type: Object,
    required: true
  },
  workstreamColor: {
    type: Object,
    default: null
  },
  parentTask: {
    type: Object,
    default: null
  },
  biteCount: {
    type: Number,
    default: 0
  },
  compact: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['toggle', 'edit', 'delete', 'bite'])

const isBite = computed(() => !!props.task.parentTaskId)
const hasBites = computed(() => props.biteCount > 0)

const formattedActivateAt = computed(() => {
  if (!props.task.activateAt) return null
  const [year, month, day] = props.task.activateAt.split('-')
  const d = new Date(+year, +month - 1, +day)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
})

const isTaskSelected = computed(() => checkIsSelected(props.task.id))
const hasSelection = computed(() => selectedTaskIds.value.size > 0)
// Fade this task during drag if it's selected but not the one being dragged
const isFadedDuringDrag = computed(() =>
  isDraggingSelected.value && isTaskSelected.value && draggedTaskId.value !== props.task.id
)

const handleMouseDown = (e) => {
  if (isSelectMode.value) {
    // Block SortableJS from starting a drag — we want click-to-select
    e.preventDefault()
    e.stopPropagation()
    toggleSelection(props.task.id)
  }
}

const handleClick = () => {
  if (isSelectMode.value) {
    // Already handled in mousedown
    return
  }
  if (hasSelection.value) {
    // Click without Shift while tasks are selected — clear selection
    clearSelection()
    return
  }
  emit('edit', props.task)
}

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
    :class="{ 'is-completed': task.completed, 'is-compact': compact, 'is-selected': isTaskSelected, 'is-faded-for-drag': isFadedDuringDrag }"
    :style="cardStyle"
    @mousedown="handleMouseDown"
    @click="handleClick"
  >
    <div class="task-header">
      <input
        v-if="!compact"
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
      <div v-if="!compact" class="task-actions">
        <button
          class="task-action-btn bite"
          @click.stop="emit('bite', task)"
          title="Take a bite"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Z"/>
            <path d="M12 5a3 3 0 0 1-3 3" fill="currentColor" stroke="none"/>
            <circle cx="12" cy="5" r="3" fill="var(--color-surface, #fff)" stroke="currentColor"/>
          </svg>
        </button>
        <button
          class="task-action-btn delete"
          @click.stop="emit('delete', task.id)"
          title="Delete task"
        >
          &times;
        </button>
      </div>
    </div>
    <template v-if="!compact">
      <div v-if="isBite && parentTask" class="task-bite-indicator bite-child">
        bite of: {{ parentTask.title }}
      </div>
      <div v-if="hasBites" class="task-bite-indicator bite-parent">
        {{ biteCount }} {{ biteCount === 1 ? 'bite' : 'bites' }}
      </div>
      <div v-if="formattedActivateAt" class="task-activate-at">
        &#x2192; Next Week on {{ formattedActivateAt }}
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
    </template>
  </div>
</template>
