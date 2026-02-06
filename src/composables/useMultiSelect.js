import { ref, readonly } from 'vue'

// Shared state across all usages (singleton pattern)
const selectedTaskIds = ref(new Set())
const isSelectMode = ref(false)
const isDraggingSelected = ref(false)
const draggedTaskId = ref(null)

function handleKeyDown(e) {
  if (e.key === 'Shift') {
    isSelectMode.value = true
  }
}

function handleKeyUp(e) {
  if (e.key === 'Shift') {
    isSelectMode.value = false
    // Don't clear selection here — let the user drag selected tasks after releasing Shift
  }
}

function handleBlur() {
  isSelectMode.value = false
  selectedTaskIds.value = new Set()
}

export function useMultiSelect() {
  const toggleSelection = (taskId) => {
    const newSet = new Set(selectedTaskIds.value)
    if (newSet.has(taskId)) {
      newSet.delete(taskId)
    } else {
      newSet.add(taskId)
    }
    selectedTaskIds.value = newSet
  }

  const isSelected = (taskId) => {
    return selectedTaskIds.value.has(taskId)
  }

  const clearSelection = () => {
    selectedTaskIds.value = new Set()
  }

  const getSelectedIds = () => {
    return [...selectedTaskIds.value]
  }

  const startDrag = (taskId) => {
    if (selectedTaskIds.value.has(taskId)) {
      isDraggingSelected.value = true
      draggedTaskId.value = taskId
    }
  }

  const endDrag = () => {
    isDraggingSelected.value = false
    draggedTaskId.value = null
  }

  const setupListeners = () => {
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
  }

  const teardownListeners = () => {
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('keyup', handleKeyUp)
    window.removeEventListener('blur', handleBlur)
  }

  return {
    selectedTaskIds: readonly(selectedTaskIds),
    isSelectMode: readonly(isSelectMode),
    isDraggingSelected: readonly(isDraggingSelected),
    draggedTaskId: readonly(draggedTaskId),
    toggleSelection,
    isSelected,
    clearSelection,
    getSelectedIds,
    startDrag,
    endDrag,
    setupListeners,
    teardownListeners
  }
}
