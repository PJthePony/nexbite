<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
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

const open = ref(false)
const dropdownRef = ref(null)

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
    backgroundColor: color.text + '14',  // ~8% opacity whisper fill
    color: color.text,
    borderColor: color.text + '26'       // ~15% opacity border
  }
}

const handleClickOutside = (e) => {
  if (open.value && dropdownRef.value && !dropdownRef.value.contains(e.target)) {
    open.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div v-if="tags.length > 0" class="tag-filter" ref="dropdownRef">
    <button
      class="header-btn tag-filter-toggle"
      :class="{ 'is-active': selectedTags.length > 0 }"
      @click.stop="open = !open"
      title="Filter by tag"
      aria-label="Filter by tag"
      type="button"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
      <span v-if="selectedTags.length > 0" class="tag-filter-badge">{{ selectedTags.length }}</span>
    </button>
    <div v-if="open" class="tag-filter-dropdown">
      <div class="tag-filter-header">
        <span class="tag-filter-title">Filter</span>
        <button
          v-if="selectedTags.length > 0"
          class="tag-filter-clear"
          @click="clearFilters"
        >
          Clear all
        </button>
      </div>
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
    </div>
  </div>
</template>
