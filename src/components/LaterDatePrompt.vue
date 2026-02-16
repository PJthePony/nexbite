<script setup>
import { ref, watch, computed } from 'vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  taskTitle: {
    type: String,
    default: ''
  },
  defaultDate: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['save', 'close'])

const selectedDate = ref('')

const minDate = computed(() => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
})

watch(() => props.show, (newVal) => {
  if (newVal) {
    selectedDate.value = props.defaultDate || ''
  }
})

const handleSave = () => {
  emit('save', selectedDate.value || null)
}

const handleOverlayClick = (e) => {
  if (e.target === e.currentTarget) {
    handleSave()
  }
}
</script>

<template>
  <div v-if="show" class="later-prompt-overlay" @click="handleOverlayClick">
    <div class="later-prompt">
      <div class="later-prompt-header">
        <span class="later-prompt-title">When should this come back?</span>
      </div>
      <p class="later-prompt-task">{{ taskTitle }}</p>
      <div class="later-prompt-input">
        <input
          type="date"
          v-model="selectedDate"
          class="form-input"
          :min="minDate"
          autofocus
        />
      </div>
      <div class="later-prompt-actions">
        <button
          type="button"
          class="btn btn-primary"
          @click="handleSave"
        >
          Save
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.later-prompt-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.later-prompt {
  background: var(--color-surface);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-lg, 0 8px 30px rgba(0, 0, 0, 0.12));
  padding: 20px 24px;
  max-width: 340px;
  width: 90%;
}

.later-prompt-title {
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.later-prompt-task {
  font-size: 0.82rem;
  color: var(--color-text-secondary);
  margin: 8px 0 14px;
  line-height: 1.4;
}

.later-prompt-input {
  margin-bottom: 16px;
}

.later-prompt-input .form-input {
  width: 100%;
}

.later-prompt-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
