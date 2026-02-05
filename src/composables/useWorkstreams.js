import { ref, computed, watch } from 'vue'

const STORAGE_KEY = 'weekly-task-manager-workstreams'

// 10 predefined colors for workstreams
export const WORKSTREAM_COLORS = [
  { name: 'Mint', bg: '#e8f4ef', text: '#1a5f4a' },
  { name: 'Blue', bg: '#e3f2fd', text: '#1565c0' },
  { name: 'Orange', bg: '#fff3e0', text: '#e65100' },
  { name: 'Purple', bg: '#f3e5f5', text: '#7b1fa2' },
  { name: 'Indigo', bg: '#e8eaf6', text: '#3949ab' },
  { name: 'Amber', bg: '#fff8e1', text: '#f9a825' },
  { name: 'Pink', bg: '#fce4ec', text: '#c2185b' },
  { name: 'Teal', bg: '#e0f2f1', text: '#00796b' },
  { name: 'Brown', bg: '#efebe9', text: '#5d4037' },
  { name: 'Green', bg: '#f1f8e9', text: '#558b2f' },
]

function loadFromStorage() {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

function saveToStorage(workstreams) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workstreams))
}

// Shared state across all usages
const workstreams = ref(loadFromStorage())

watch(workstreams, (newWorkstreams) => {
  saveToStorage(newWorkstreams)
}, { deep: true })

export function useWorkstreams() {
  const addWorkstream = (name, color) => {
    // Check if workstream already exists
    if (workstreams.value.find(w => w.name.toLowerCase() === name.toLowerCase())) {
      return null
    }

    // Get next sort order
    const maxOrder = workstreams.value.reduce((max, w) => Math.max(max, w.sortOrder ?? 0), -1)

    const workstream = {
      name: name.trim(),
      color: {
        bg: color.bg,
        text: color.text
      },
      sortOrder: maxOrder + 1
    }
    workstreams.value.push(workstream)
    return workstream
  }

  const updateWorkstream = (name, updates) => {
    const index = workstreams.value.findIndex(w => w.name === name)
    if (index !== -1) {
      workstreams.value[index] = { ...workstreams.value[index], ...updates }
    }
  }

  const deleteWorkstream = (name) => {
    const index = workstreams.value.findIndex(w => w.name === name)
    if (index !== -1) {
      workstreams.value.splice(index, 1)
    }
  }

  const getWorkstreamColor = (name) => {
    if (!name) return null
    const workstream = workstreams.value.find(w => w.name === name)
    return workstream ? workstream.color : null
  }

  const allWorkstreams = computed(() => {
    return [...workstreams.value].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  })

  const workstreamNames = computed(() => {
    return allWorkstreams.value.map(w => w.name)
  })

  const reorderWorkstreams = (orderedNames) => {
    orderedNames.forEach((name, index) => {
      const ws = workstreams.value.find(w => w.name === name)
      if (ws) {
        ws.sortOrder = index
      }
    })
  }

  return {
    workstreams,
    addWorkstream,
    updateWorkstream,
    deleteWorkstream,
    getWorkstreamColor,
    allWorkstreams,
    workstreamNames,
    reorderWorkstreams,
    WORKSTREAM_COLORS
  }
}
