<script setup>
import { ref } from 'vue'

const props = defineProps({
  selectedTags: {
    type: Array,
    default: () => []
  },
  availableTags: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:selectedTags'])

const newTagInput = ref('')

const toggleTag = (tag) => {
  const current = [...props.selectedTags]
  const index = current.indexOf(tag)

  if (index === -1) {
    current.push(tag)
  } else {
    current.splice(index, 1)
  }

  emit('update:selectedTags', current)
}

const isSelected = (tag) => {
  return props.selectedTags.includes(tag)
}

const addNewTag = () => {
  const tag = newTagInput.value.trim().toLowerCase()
  if (tag && !props.selectedTags.includes(tag)) {
    emit('update:selectedTags', [...props.selectedTags, tag])
  }
  newTagInput.value = ''
}

const handleKeydown = (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    addNewTag()
  }
}
</script>

<template>
  <div class="tag-picker-container">
    <div v-if="availableTags.length > 0" class="tag-picker">
      <button
        v-for="tag in availableTags"
        :key="tag"
        class="tag-option"
        :class="{ 'is-selected': isSelected(tag) }"
        @click="toggleTag(tag)"
        type="button"
      >
        {{ tag }}
      </button>
    </div>

    <div class="tag-input-wrapper">
      <input
        v-model="newTagInput"
        class="tag-input"
        placeholder="Add new tag..."
        @keydown="handleKeydown"
      />
      <button
        class="tag-add-btn"
        @click="addNewTag"
        type="button"
        :disabled="!newTagInput.trim()"
      >
        Add
      </button>
    </div>

    <div v-if="selectedTags.length > 0" class="selected-tags">
      <span class="selected-tags-label">Selected:</span>
      <span
        v-for="tag in selectedTags"
        :key="tag"
        class="task-tag"
      >
        {{ tag }}
        <button
          class="tag-remove"
          @click="toggleTag(tag)"
          type="button"
        >
          &times;
        </button>
      </span>
    </div>
  </div>
</template>

<style scoped>
.tag-picker-container {
  margin-top: 8px;
}

.tag-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-option {
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  font-weight: 500;
  background: var(--color-bg);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: all var(--transition);
}

.tag-option:hover {
  border-color: var(--color-border-light);
  color: var(--color-text);
}

.tag-option.is-selected {
  background: var(--color-text);
  color: var(--color-surface);
  border-color: var(--color-text);
}

.selected-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
}

.selected-tags-label {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.selected-tags .task-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: var(--color-bg);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
}

.tag-remove {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  margin-left: 2px;
}

.tag-remove:hover {
  color: var(--color-danger);
}

.tag-add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
