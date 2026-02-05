<script setup>
import { ref } from 'vue'
import { useWeekLogic } from '../composables/useWeekLogic'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  rolloverTasks: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['complete'])

const { currentDayLocation, ALL_COLUMNS } = useWeekLogic()

// Track decisions: 'today' | 'this-week' | 'later' | 'delete'
const decisions = ref({})

const initializeDecisions = () => {
  decisions.value = {}
  props.rolloverTasks.forEach(task => {
    // Default to moving to today
    decisions.value[task.id] = 'today'
  })
}

// Initialize when shown
if (props.show) {
  initializeDecisions()
}

const setDecision = (taskId, decision) => {
  decisions.value[taskId] = decision
}

const setAllDecisions = (decision) => {
  props.rolloverTasks.forEach(task => {
    decisions.value[task.id] = decision
  })
}

const handleComplete = () => {
  emit('complete', { ...decisions.value })
}

const getDecisionClass = (taskId, decision) => {
  return decisions.value[taskId] === decision ? 'is-selected' : ''
}

const getTodayLabel = () => {
  const col = ALL_COLUMNS.find(c => c.id === currentDayLocation.value)
  return col ? col.label : 'Today'
}
</script>

<template>
  <div v-if="show" class="modal-overlay">
    <div class="modal" style="max-width: 600px;">
      <div class="modal-header">
        <h2 class="modal-title">Daily Review</h2>
      </div>

      <div class="modal-body">
        <div class="review-section">
          <h3 class="review-section-title">Incomplete Tasks from Yesterday</h3>
          <p class="review-section-desc">
            These tasks weren't completed. What would you like to do with them?
          </p>

          <div class="review-bulk-actions">
            <button
              class="review-action-btn"
              @click="setAllDecisions('today')"
            >
              Move all to {{ getTodayLabel() }}
            </button>
            <button
              class="review-action-btn"
              @click="setAllDecisions('this-week')"
            >
              Move all to This Week
            </button>
          </div>

          <div class="review-tasks" style="margin-top: 16px;">
            <div
              v-for="task in rolloverTasks"
              :key="task.id"
              class="review-task"
            >
              <div class="review-task-info">
                <div class="review-task-title">{{ task.title }}</div>
                <div v-if="task.tags?.length" class="review-task-tags">
                  <span v-for="tag in task.tags" :key="tag" class="task-tag">
                    {{ tag }}
                  </span>
                </div>
              </div>
              <div class="review-task-action">
                <button
                  class="review-action-btn"
                  :class="getDecisionClass(task.id, 'today')"
                  @click="setDecision(task.id, 'today')"
                >
                  {{ getTodayLabel() }}
                </button>
                <button
                  class="review-action-btn"
                  :class="getDecisionClass(task.id, 'this-week')"
                  @click="setDecision(task.id, 'this-week')"
                >
                  This Week
                </button>
                <button
                  class="review-action-btn"
                  :class="getDecisionClass(task.id, 'later')"
                  @click="setDecision(task.id, 'later')"
                >
                  Later
                </button>
                <button
                  class="review-action-btn"
                  :class="getDecisionClass(task.id, 'delete')"
                  @click="setDecision(task.id, 'delete')"
                  style="color: var(--color-danger);"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button
          class="btn btn-primary"
          @click="handleComplete"
        >
          Start My Day
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.review-task {
  flex-wrap: wrap;
}

.review-task-action {
  margin-left: auto;
  flex-wrap: wrap;
  gap: 4px;
}

@media (max-width: 500px) {
  .review-task-action {
    width: 100%;
    margin-top: 8px;
    margin-left: 0;
    justify-content: flex-start;
  }
}
</style>
