<script setup>
import { ref, computed } from 'vue'
import { useMultiSelect } from '../composables/useMultiSelect'
import { getTagColor } from '../composables/useTags'

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
  completedBiteCount: {
    type: Number,
    default: 0
  },
  compact: {
    type: Boolean,
    default: false
  },
  isMobile: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['toggle', 'edit', 'delete', 'bite'])

const isBite = computed(() => !!props.task.parentTaskId)
const hasBites = computed(() => props.biteCount > 0)
const biteProgress = computed(() => {
  if (props.biteCount === 0) return 0
  return Math.round((props.completedBiteCount / props.biteCount) * 100)
})

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
      borderColor: props.compact ? props.workstreamColor.text + '40' : props.workstreamColor.text
    }
  }
  return {}
})

// --- Mobile swipe-to-delete ---
const swipeOffset = ref(0)
const swipeRevealed = ref(false)
const taskSwipeStartX = ref(0)
const taskSwipeStartY = ref(0)
const isTaskSwiping = ref(false)

const REVEAL_WIDTH = 64
const TASK_SWIPE_THRESHOLD = 32

const handleTaskSwipeStart = (e) => {
  taskSwipeStartX.value = e.touches[0].clientX
  taskSwipeStartY.value = e.touches[0].clientY
  isTaskSwiping.value = false
}

const handleTaskSwipeMove = (e) => {
  const dx = e.touches[0].clientX - taskSwipeStartX.value
  const dy = e.touches[0].clientY - taskSwipeStartY.value

  // If primarily vertical, bail out
  if (!isTaskSwiping.value && Math.abs(dy) > Math.abs(dx)) return

  if (Math.abs(dx) > 10) {
    isTaskSwiping.value = true
    e.stopPropagation()
  }

  if (isTaskSwiping.value) {
    const base = swipeRevealed.value ? -REVEAL_WIDTH : 0
    const offset = Math.min(0, Math.max(-REVEAL_WIDTH - 20, base + dx))
    swipeOffset.value = offset
    e.preventDefault()
  }
}

const handleTaskSwipeEnd = () => {
  if (!isTaskSwiping.value) return

  if (swipeOffset.value < -TASK_SWIPE_THRESHOLD) {
    swipeOffset.value = -REVEAL_WIDTH
    swipeRevealed.value = true
  } else {
    swipeOffset.value = 0
    swipeRevealed.value = false
  }
  isTaskSwiping.value = false
}

const handleSwipeDelete = () => {
  swipeOffset.value = 0
  swipeRevealed.value = false
  emit('delete', props.task.id)
}

const closeSwipe = () => {
  swipeOffset.value = 0
  swipeRevealed.value = false
}
</script>

<template>
  <!-- Mobile: swipe-to-delete wrapper -->
  <div v-if="isMobile && !compact" class="task-swipe-container">
    <div v-if="swipeOffset !== 0 || swipeRevealed" class="task-swipe-actions">
      <button class="swipe-action-btn delete-action" @click.stop="handleSwipeDelete">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
    </div>
    <div
      class="task-item task-item-mobile"
      :class="{ 'is-completed': task.completed, 'is-selected': isTaskSelected, 'is-faded-for-drag': isFadedDuringDrag, 'has-bites': hasBites }"
      :style="{ ...cardStyle, transform: `translateX(${swipeOffset}px)`, transition: isTaskSwiping ? 'none' : 'transform 0.2s ease' }"
      @touchstart="handleTaskSwipeStart"
      @touchmove="handleTaskSwipeMove"
      @touchend="handleTaskSwipeEnd"
      @mousedown="handleMouseDown"
      @click="swipeRevealed ? closeSwipe() : handleClick()"
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
          <div class="task-title">
            <span
              v-if="workstreamColor"
              class="ws-dot"
              :style="{ backgroundColor: workstreamColor.text }"
            ></span>
            {{ task.title }}
          </div>
          <div v-if="task.notes" class="task-notes-indicator">
            Has notes
          </div>
        </div>
      </div>
      <div v-if="isBite && parentTask" class="task-bite-indicator bite-child">
        bite of: {{ parentTask.title }}
      </div>
      <div v-if="hasBites" class="task-bite-parent-indicator">
        <span class="bite-summary">{{ completedBiteCount }}/{{ biteCount }} bites</span>
        <div class="bite-progress-track">
          <div class="bite-progress-fill" :style="{ width: biteProgress + '%' }"></div>
        </div>
      </div>
      <div v-if="formattedActivateAt" class="task-activate-at">
        &#x2192; Next Week on {{ formattedActivateAt }}
      </div>
      <div v-if="task.tags && task.tags.length > 0" class="task-tags">
        <span
          v-for="tag in task.tags"
          :key="tag"
          class="task-tag"
          :style="{ backgroundColor: getTagColor(tag).bg, color: getTagColor(tag).text }"
        >
          {{ tag }}
        </span>
      </div>
    </div>
  </div>

  <!-- Desktop / compact: original rendering -->
  <div
    v-else
    class="task-item"
    :class="{ 'is-completed': task.completed, 'is-compact': compact, 'is-selected': isTaskSelected, 'is-faded-for-drag': isFadedDuringDrag, 'has-bites': hasBites }"
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
        <div class="task-title">
          <span
            v-if="compact && workstreamColor"
            class="ws-dot"
            :style="{ backgroundColor: workstreamColor.text }"
          ></span>
          {{ task.title }}
        </div>
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
      <div v-if="hasBites" class="task-bite-parent-indicator">
        <span class="bite-summary">{{ completedBiteCount }}/{{ biteCount }} bites</span>
        <div class="bite-progress-track">
          <div class="bite-progress-fill" :style="{ width: biteProgress + '%' }"></div>
        </div>
      </div>
      <div v-if="formattedActivateAt" class="task-activate-at">
        &#x2192; Next Week on {{ formattedActivateAt }}
      </div>
      <div v-if="task.tags && task.tags.length > 0" class="task-tags">
        <span
          v-for="tag in task.tags"
          :key="tag"
          class="task-tag"
          :style="{ backgroundColor: getTagColor(tag).bg, color: getTagColor(tag).text }"
        >
          {{ tag }}
        </span>
      </div>
    </template>
  </div>
</template>
