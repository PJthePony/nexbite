<script setup>
import { ref, watch, computed } from 'vue'
import { ALL_COLUMNS } from '../composables/useWeekLogic'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  parentTask: {
    type: Object,
    default: null
  },
  currentDayLocation: {
    type: String,
    default: 'monday'
  }
})

const emit = defineEmits(['close', 'save'])

const biteTitle = ref('')
const biteLocation = ref('')
const parentDestination = ref('')

watch(() => props.show, (newVal) => {
  if (newVal && props.parentTask) {
    biteTitle.value = ''
    biteLocation.value = props.currentDayLocation
    parentDestination.value = 'next-week'
  }
})

const canSave = computed(() => {
  return biteTitle.value.trim() && biteLocation.value && parentDestination.value
})

const handleSubmit = () => {
  if (!canSave.value) return

  emit('save', {
    parentId: props.parentTask.id,
    biteTitle: biteTitle.value.trim(),
    biteLocation: biteLocation.value,
    parentDestination: parentDestination.value
  })
  emit('close')
}

const handleOverlayClick = (e) => {
  if (e.target === e.currentTarget) {
    emit('close')
  }
}
</script>

<template>
  <div v-if="show && parentTask" class="modal-overlay" @click="handleOverlayClick">
    <div class="modal bite-modal">
      <div class="modal-header">
        <h2 class="modal-title">Take a Bite</h2>
        <button class="modal-close" @click="emit('close')">&times;</button>
      </div>

      <form @submit.prevent="handleSubmit" class="bite-form">
        <div class="modal-body">
          <div class="bite-parent-info">
            <span class="bite-parent-label">From:</span>
            <span class="bite-parent-title">{{ parentTask.title }}</span>
          </div>

          <div class="form-group">
            <label class="form-label" for="bite-title">What are you biting off?</label>
            <input
              id="bite-title"
              v-model="biteTitle"
              class="form-input"
              placeholder="Describe the piece you'll work on..."
              required
              autofocus
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="bite-location">Put this bite in</label>
            <select
              id="bite-location"
              v-model="biteLocation"
              class="form-input"
              required
            >
              <option
                v-for="col in ALL_COLUMNS"
                :key="col.id"
                :value="col.id"
              >
                {{ col.label }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="parent-destination">Move the rest to</label>
            <select
              id="parent-destination"
              v-model="parentDestination"
              class="form-input"
              required
            >
              <option
                v-for="col in ALL_COLUMNS"
                :key="col.id"
                :value="col.id"
              >
                {{ col.label }}
              </option>
            </select>
          </div>
        </div>

        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-secondary"
            @click="emit('close')"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="!canSave"
          >
            Create Bite
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.bite-modal {
  display: flex;
  flex-direction: column;
}

.bite-form {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.bite-parent-info {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 10px 12px;
  background: var(--color-bg);
  border-radius: var(--radius-md);
  margin-bottom: 16px;
}

.bite-parent-label {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.bite-parent-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text);
  word-break: break-word;
}

select.form-input {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2386868b' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10l-5 5z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
}
</style>
