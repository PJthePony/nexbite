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

const mobileOpen = ref(false)
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
  if (mobileOpen.value && dropdownRef.value && !dropdownRef.value.contains(e.target)) {
    mobileOpen.value = false
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
    <!-- Desktop: inline tag list -->
    <span class="tag-filter-label">Filter:</span>
    <div class="tag-filter-list tag-filter-desktop">
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

    <!-- Mobile: toggle button + dropdown -->
    <button
      class="tag-filter-toggle"
      @click.stop="mobileOpen = !mobileOpen"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
      <span v-if="selectedTags.length > 0" class="tag-filter-badge">{{ selectedTags.length }}</span>
    </button>
    <div v-if="mobileOpen" class="tag-filter-dropdown">
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
      <button
        v-if="selectedTags.length > 0"
        class="tag-filter-clear"
        @click="clearFilters"
      >
        Clear all
      </button>
    </div>

    <button
      v-if="selectedTags.length > 0"
      class="tag-filter-clear tag-filter-desktop"
      @click="clearFilters"
    >
      Clear
    </button>
  </div>
</template>
