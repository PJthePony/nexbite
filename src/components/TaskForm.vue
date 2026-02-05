<script setup>
import { ref, watch } from 'vue'
import TagPicker from './TagPicker.vue'
import WorkstreamPicker from './WorkstreamPicker.vue'
import { ALL_COLUMNS } from '../composables/useWeekLogic'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  task: {
    type: Object,
    default: null
  },
  defaultLocation: {
    type: String,
    default: null
  },
  defaultWorkstream: {
    type: String,
    default: null
  },
  availableTags: {
    type: Array,
    default: () => []
  },
  workstreams: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['close', 'save', 'delete', 'createWorkstream'])

const title = ref('')
const notes = ref('')
const location = ref('')
const workstream = ref(null)
const tags = ref([])

const isEditing = ref(false)

watch(() => props.show, (newVal) => {
  if (newVal) {
    if (props.task) {
      // Editing existing task
      isEditing.value = true
      title.value = props.task.title
      notes.value = props.task.notes || ''
      location.value = props.task.location
      workstream.value = props.task.workstream || null
      tags.value = [...(props.task.tags || [])]
    } else {
      // Adding new task
      isEditing.value = false
      title.value = ''
      notes.value = ''
      location.value = props.defaultLocation || ''
      workstream.value = props.defaultWorkstream || null
      tags.value = []
    }
  }
})

const handleSubmit = () => {
  if (!title.value.trim()) return

  const taskData = {
    title: title.value.trim(),
    notes: notes.value.trim(),
    location: location.value,
    workstream: workstream.value,
    tags: tags.value
  }

  if (isEditing.value && props.task) {
    taskData.id = props.task.id
  }

  emit('save', taskData)
  emit('close')
}

const handleDelete = () => {
  if (isEditing.value && props.task) {
    emit('delete', props.task.id)
    emit('close')
  }
}

const handleOverlayClick = (e) => {
  if (e.target === e.currentTarget) {
    emit('close')
  }
}

const handleCreateWorkstream = (wsData) => {
  emit('createWorkstream', wsData)
}
</script>

<template>
  <div v-if="show" class="modal-overlay" @click="handleOverlayClick">
    <div class="modal task-form-modal">
      <div class="modal-header">
        <h2 class="modal-title">
          {{ isEditing ? 'Edit Task' : 'Add Task' }}
        </h2>
        <button class="modal-close" @click="emit('close')">&times;</button>
      </div>

      <form @submit.prevent="handleSubmit" class="task-form">
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label" for="task-title">Title</label>
            <input
              id="task-title"
              v-model="title"
              class="form-input"
              placeholder="What needs to be done?"
              required
              autofocus
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="task-notes">Notes (optional)</label>
            <textarea
              id="task-notes"
              v-model="notes"
              class="form-input form-textarea"
              placeholder="Add any additional details..."
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="task-location">Location</label>
            <select
              id="task-location"
              v-model="location"
              class="form-input"
              required
            >
              <option value="" disabled>Choose where to add this task</option>
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
            <label class="form-label">Workstream</label>
            <WorkstreamPicker
              v-model="workstream"
              :workstreams="workstreams"
              @create-workstream="handleCreateWorkstream"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Tags</label>
            <TagPicker
              v-model:selected-tags="tags"
              :available-tags="availableTags"
            />
          </div>
        </div>

        <div class="modal-footer-sticky">
          <button
            v-if="isEditing"
            type="button"
            class="btn btn-danger"
            @click="handleDelete"
          >
            Delete
          </button>
          <div style="flex: 1"></div>
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
            :disabled="!title.trim() || !location"
          >
            {{ isEditing ? 'Save' : 'Add Task' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.task-form-modal {
  display: flex;
  flex-direction: column;
}

.task-form {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.task-form-modal .modal-body {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 16px;
}

.modal-footer-sticky {
  display: flex;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
  position: sticky;
  bottom: 0;
  margin-top: auto;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

select.form-input {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2386868b' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10l-5 5z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
}
</style>
