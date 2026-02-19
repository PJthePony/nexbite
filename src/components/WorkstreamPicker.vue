<script setup>
import { ref, computed } from 'vue'
import { WORKSTREAM_COLORS } from '../composables/useWorkstreams'

const props = defineProps({
  modelValue: {
    type: String,
    default: null
  },
  workstreams: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue', 'createWorkstream'])

const showCreateForm = ref(false)
const newWorkstreamName = ref('')
const selectedColorIndex = ref(0)

const selectedWorkstream = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const selectWorkstream = (name) => {
  selectedWorkstream.value = name
}

const clearWorkstream = () => {
  selectedWorkstream.value = null
}

const getWorkstreamStyle = (workstream, isActive = false) => {
  if (!workstream || !workstream.color) {
    return {}
  }
  if (isActive) {
    return {
      backgroundColor: workstream.color.bg,
      color: workstream.color.text,
      borderColor: workstream.color.text
    }
  }
  return {
    backgroundColor: 'transparent',
    color: workstream.color.text,
    borderColor: workstream.color.text + '40'
  }
}

const toggleCreateForm = () => {
  showCreateForm.value = !showCreateForm.value
  if (!showCreateForm.value) {
    newWorkstreamName.value = ''
    selectedColorIndex.value = 0
  }
}

const selectColor = (index) => {
  selectedColorIndex.value = index
}

const createWorkstream = () => {
  const name = newWorkstreamName.value.trim()
  if (!name) return

  const color = WORKSTREAM_COLORS[selectedColorIndex.value]
  emit('createWorkstream', { name, color })

  // Select the new workstream
  selectedWorkstream.value = name

  // Reset form
  newWorkstreamName.value = ''
  selectedColorIndex.value = 0
  showCreateForm.value = false
}

const handleKeydown = (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    createWorkstream()
  }
}
</script>

<template>
  <div class="workstream-picker">
    <!-- Current selection -->
    <div class="workstream-current">
      <span v-if="selectedWorkstream" class="workstream-selected">
        <span
          class="workstream-badge"
          :style="getWorkstreamStyle(workstreams.find(w => w.name === selectedWorkstream) || {}, true)"
        >
          {{ selectedWorkstream }}
        </span>
        <button class="workstream-clear" @click="clearWorkstream" type="button">
          &times;
        </button>
      </span>
      <span v-else class="workstream-none">No workstream</span>
    </div>

    <!-- Existing workstreams -->
    <div v-if="workstreams.length > 0" class="workstream-list">
      <button
        v-for="ws in workstreams"
        :key="ws.name"
        class="workstream-option"
        :class="{ 'is-selected': selectedWorkstream === ws.name }"
        :style="getWorkstreamStyle(ws, selectedWorkstream === ws.name)"
        @click="selectWorkstream(ws.name)"
        type="button"
      >
        {{ ws.name }}
      </button>
    </div>

    <!-- Create new workstream -->
    <div class="workstream-create">
      <button
        v-if="!showCreateForm"
        class="workstream-create-toggle"
        @click="toggleCreateForm"
        type="button"
      >
        + New Workstream
      </button>

      <div v-else class="workstream-create-form">
        <input
          v-model="newWorkstreamName"
          class="workstream-name-input"
          placeholder="Workstream name"
          @keydown="handleKeydown"
        />

        <div class="color-picker">
          <span class="color-picker-label">Color:</span>
          <div class="color-options">
            <button
              v-for="(color, index) in WORKSTREAM_COLORS"
              :key="index"
              class="color-option"
              :class="{ 'is-selected': selectedColorIndex === index }"
              :style="{ backgroundColor: color.bg, borderColor: color.text }"
              :title="color.name"
              @click="selectColor(index)"
              type="button"
            />
          </div>
        </div>

        <div class="workstream-create-actions">
          <button
            class="btn btn-secondary btn-sm"
            @click="toggleCreateForm"
            type="button"
          >
            Cancel
          </button>
          <button
            class="btn btn-primary btn-sm"
            @click="createWorkstream"
            :disabled="!newWorkstreamName.trim()"
            type="button"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workstream-picker {
  margin-top: 8px;
}

.workstream-current {
  margin-bottom: 12px;
}

.workstream-selected {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.workstream-badge {
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  font-weight: 500;
  border: 1px solid;
}

.workstream-clear {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0 4px;
}

.workstream-clear:hover {
  color: var(--color-danger);
}

.workstream-none {
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.workstream-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.workstream-option {
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  font-weight: 500;
  border: 2px solid;
  cursor: pointer;
  transition: all var(--transition);
}

.workstream-option:hover {
  opacity: 0.85;
}

.workstream-option.is-selected {
  box-shadow: 0 0 0 2px var(--color-primary);
}

.workstream-create-toggle {
  background: none;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  color: var(--color-text-secondary);
  font-size: 0.85rem;
  cursor: pointer;
  width: 100%;
}

.workstream-create-toggle:hover {
  background: var(--color-bg);
  border-color: var(--color-text-secondary);
}

.workstream-create-form {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 12px;
  background: var(--color-bg);
}

.workstream-name-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  margin-bottom: 12px;
}

.workstream-name-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.color-picker {
  margin-bottom: 12px;
}

.color-picker-label {
  display: block;
  font-size: 0.8rem;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.color-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.color-option {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid;
  cursor: pointer;
  transition: transform var(--transition);
}

.color-option:hover {
  transform: scale(1.1);
}

.color-option.is-selected {
  box-shadow: 0 0 0 2px var(--color-primary);
}

.workstream-create-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 0.85rem;
}
</style>
