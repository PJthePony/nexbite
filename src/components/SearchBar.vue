<script setup>
const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue'])

const handleInput = (e) => {
  emit('update:modelValue', e.target.value)
}

const clearSearch = () => {
  emit('update:modelValue', '')
}
</script>

<template>
  <div class="search-bar">
    <span class="search-icon">&#128269;</span>
    <input
      type="text"
      class="search-input"
      :value="modelValue"
      @input="handleInput"
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
</template>

<style scoped>
.search-bar {
  position: relative;
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

.search-input {
  padding-right: 32px;
}
</style>
