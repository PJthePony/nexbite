<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const wrapperRef = ref(null)
const inputRef = ref(null)

const handleInput = (e) => {
  emit('update:modelValue', e.target.value)
}

const clearSearch = () => {
  emit('update:modelValue', '')
}

const togglePopover = async () => {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    inputRef.value?.focus()
  }
}

const handleClickOutside = (e) => {
  if (open.value && wrapperRef.value && !wrapperRef.value.contains(e.target)) {
    open.value = false
  }
}

const handleKeydown = (e) => {
  if (e.key === 'Escape' && open.value) {
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
  <div class="search-bar" ref="wrapperRef">
    <button
      class="header-btn search-toggle"
      :class="{ 'is-active': modelValue }"
      @click.stop="togglePopover"
      title="Search"
      aria-label="Search"
      type="button"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    </button>
    <div v-if="open" class="search-popover">
      <input
        ref="inputRef"
        type="text"
        class="search-input"
        :value="modelValue"
        @input="handleInput"
        @keydown="handleKeydown"
        placeholder="Search tasks..."
      />
      <button
        v-if="modelValue"
        class="search-clear"
        @click="clearSearch"
        type="button"
      >
        &times;
      </button>
    </div>
  </div>
</template>

<style scoped>
.search-bar {
  position: relative;
}

.search-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 100;
}

.search-popover .search-input {
  width: 260px;
  padding-right: 32px;
}

.search-clear {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: 1.125rem;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
}

.search-clear:hover {
  color: var(--color-text);
}
</style>
