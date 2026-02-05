<script setup>
import { ref } from 'vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  rolledOverTasks: {
    type: Array,
    default: () => []
  },
  laterTasks: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['complete'])

// Track decisions for later tasks: 'keep' | 'this-week' | 'delete'
const laterDecisions = ref({})

// Initialize decisions for all later tasks as 'keep'
const initializeDecisions = () => {
  laterDecisions.value = {}
  props.laterTasks.forEach(task => {
    laterDecisions.value[task.id] = 'keep'
  })
}

// Watch for show changes to initialize
const resetOnShow = () => {
  if (props.show) {
    initializeDecisions()
  }
}

// Call when component updates
resetOnShow()

const setDecision = (taskId, decision) => {
  laterDecisions.value[taskId] = decision
}

const setAllDecisions = (decision) => {
  props.laterTasks.forEach(task => {
    laterDecisions.value[task.id] = decision
  })
}

const handleComplete = () => {
  emit('complete', { ...laterDecisions.value })
}

const getDecisionClass = (taskId, decision) => {
  return laterDecisions.value[taskId] === decision ? 'is-selected' : ''
}
</script>

<template>
  <div v-if="show" class="modal-overlay">
    <div class="modal" style="max-width: 600px;">
      <div class="modal-header">
        <h2 class="modal-title">Weekly Planning</h2>
      </div>

      <div class="modal-body">
        <!-- Rolled Over Tasks -->
        <div v-if="rolledOverTasks.length > 0" class="review-section">
          <h3 class="review-section-title">Rolled Over to This Week</h3>
          <p class="review-section-desc">
            These incomplete tasks have been moved to "This Week":
          </p>
          <div class="review-tasks">
            <div
              v-for="task in rolledOverTasks"
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
            </div>
          </div>
        </div>

        <div v-else class="review-section">
          <p class="review-section-desc">
            No incomplete tasks rolled over from last week.
          </p>
        </div>

        <!-- Later Tasks Review -->
        <div v-if="laterTasks.length > 0" class="review-section">
          <h3 class="review-section-title">Review "Later" Items</h3>
          <p class="review-section-desc">
            Decide what to do with each item in your backlog:
          </p>

          <div class="review-bulk-actions">
            <button
              class="review-action-btn"
              @click="setAllDecisions('keep')"
            >
              Keep all in Later
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
              v-for="task in laterTasks"
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
                  :class="getDecisionClass(task.id, 'keep')"
                  @click="setDecision(task.id, 'keep')"
                >
                  Keep
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

        <div v-else class="review-section">
          <p class="review-section-desc">
            No items in "Later" to review.
          </p>
        </div>
      </div>

      <div class="modal-footer">
        <button
          class="btn btn-primary"
          @click="handleComplete"
        >
          Start My Week
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
