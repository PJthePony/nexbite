<script setup>
import { getTagColor } from '../composables/useTags'

const props = defineProps({
  tags: {
    type: Array,
    default: () => []
  },
  selectedTags: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:selectedTags'])

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

const isActive = (tag) => {
  return props.selectedTags.includes(tag)
}

const clearFilters = () => {
  emit('update:selectedTags', [])
}

const getTagStyle = (tag) => {
  const color = getTagColor(tag)
  return {
    backgroundColor: color.bg,
    color: color.text
  }
}
</script>

<template>
  <div v-if="tags.length > 0" class="tag-filter">
    <span class="tag-filter-label">Filter:</span>
    <div class="tag-filter-list">
      <button
        v-for="tag in tags"
        :key="tag"
        class="tag-filter-btn"
        :class="{ 'is-active': isActive(tag) }"
        :style="getTagStyle(tag)"
        @click="toggleTag(tag)"
      >
        {{ tag }}
      </button>
    </div>
    <button
      v-if="selectedTags.length > 0"
      class="tag-filter-clear"
      @click="clearFilters"
    >
      Clear
    </button>
  </div>
</template>
