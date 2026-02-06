import { ref, computed, watch } from 'vue'

const STORAGE_KEY = 'weekly-task-manager-tasks'

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

function loadFromStorage() {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

function saveToStorage(tasks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
}

const tasks = ref(loadFromStorage())

watch(tasks, (newTasks) => {
  saveToStorage(newTasks)
}, { deep: true })

export function useTasks() {
  const getNextSortOrder = (location) => {
    const locationTasks = tasks.value.filter(t => t.location === location)
    if (locationTasks.length === 0) return 0
    return Math.max(...locationTasks.map(t => t.sortOrder ?? 0)) + 1
  }

  const addTask = (title, location, notes = '', tags = [], workstream = null) => {
    const task = {
      id: generateId(),
      title,
      notes,
      completed: false,
      location,
      workstream,
      tags,
      createdAt: Date.now(),
      completedAt: null,
      sortOrder: getNextSortOrder(location),
      parentTaskId: null,
      biteTaskIds: []
    }
    tasks.value.push(task)
    return task
  }

  const getTaskById = (id) => {
    return tasks.value.find(t => t.id === id) || null
  }

  const biteTask = (parentId, biteTitle, biteLocation, parentNewLocation) => {
    const parent = tasks.value.find(t => t.id === parentId)
    if (!parent) return null

    // Create the bite task, inheriting workstream and tags from parent
    const bite = {
      id: generateId(),
      title: biteTitle,
      notes: '',
      completed: false,
      location: biteLocation,
      workstream: parent.workstream,
      tags: [...(parent.tags || [])],
      createdAt: Date.now(),
      completedAt: null,
      sortOrder: getNextSortOrder(biteLocation),
      parentTaskId: parentId,
      biteTaskIds: []
    }
    tasks.value.push(bite)

    // Update the parent: add bite reference and move it
    if (!parent.biteTaskIds) parent.biteTaskIds = []
    parent.biteTaskIds.push(bite.id)
    parent.location = parentNewLocation

    return bite
  }

  const updateTask = (id, updates) => {
    const index = tasks.value.findIndex(t => t.id === id)
    if (index !== -1) {
      tasks.value[index] = { ...tasks.value[index], ...updates }
    }
  }

  const deleteTask = (id) => {
    const index = tasks.value.findIndex(t => t.id === id)
    if (index !== -1) {
      tasks.value.splice(index, 1)
    }
  }

  const toggleTask = (id) => {
    const task = tasks.value.find(t => t.id === id)
    if (task) {
      task.completed = !task.completed
      task.completedAt = task.completed ? Date.now() : null
    }
  }

  const moveTask = (id, newLocation) => {
    const task = tasks.value.find(t => t.id === id)
    if (task) {
      task.location = newLocation
    }
  }

  const getTasksByLocation = (location) => {
    return computed(() =>
      tasks.value.filter(t => t.location === location)
    )
  }

  const getFilteredTasks = (location, searchQuery, tagFilter) => {
    return computed(() => {
      let filtered = tasks.value.filter(t => t.location === location)

      if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase()
        filtered = filtered.filter(t =>
          t.title.toLowerCase().includes(query) ||
          t.notes.toLowerCase().includes(query)
        )
      }

      if (tagFilter.value && tagFilter.value.length > 0) {
        filtered = filtered.filter(t =>
          tagFilter.value.some(tag => t.tags.includes(tag))
        )
      }

      // Sort: incomplete first, then by creation date
      return filtered.sort((a, b) => {
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1
        }
        return b.createdAt - a.createdAt
      })
    })
  }

  const searchTasks = (query, tagFilter = []) => {
    return computed(() => {
      let filtered = tasks.value

      if (query.value) {
        const q = query.value.toLowerCase()
        filtered = filtered.filter(t =>
          t.title.toLowerCase().includes(q) ||
          t.notes.toLowerCase().includes(q)
        )
      }

      if (tagFilter.length > 0) {
        filtered = filtered.filter(t =>
          tagFilter.some(tag => t.tags.includes(tag))
        )
      }

      // Sort: incomplete first
      return filtered.sort((a, b) => {
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1
        }
        return b.createdAt - a.createdAt
      })
    })
  }

  const getIncompleteTasksFromPriorDays = (currentDayLocation, allDayLocations) => {
    const currentIndex = allDayLocations.indexOf(currentDayLocation)
    if (currentIndex <= 0) return []

    const priorDays = allDayLocations.slice(0, currentIndex)
    return tasks.value.filter(t =>
      priorDays.includes(t.location) && !t.completed
    )
  }

  const bulkMoveToLocation = (taskIds, location) => {
    taskIds.forEach(id => {
      const task = tasks.value.find(t => t.id === id)
      if (task) {
        task.location = location
      }
    })
  }

  const bulkDelete = (taskIds) => {
    tasks.value = tasks.value.filter(t => !taskIds.includes(t.id))
  }

  const reorderTasks = (location, orderedTaskIds, workstream = undefined) => {
    // Update sortOrder for all tasks in the given location based on new order
    // If workstream is provided, also update the workstream
    orderedTaskIds.forEach((taskId, index) => {
      const task = tasks.value.find(t => t.id === taskId)
      if (task) {
        task.sortOrder = index
        task.location = location // Ensure location is updated for moved tasks
        if (workstream !== undefined) {
          task.workstream = workstream
        }
      }
    })
  }

  const setWorkstream = (taskId, workstream) => {
    const task = tasks.value.find(t => t.id === taskId)
    if (task) {
      task.workstream = workstream
    }
  }

  return {
    tasks,
    addTask,
    updateTask,
    deleteTask,
    toggleTask,
    moveTask,
    setWorkstream,
    getTaskById,
    biteTask,
    getTasksByLocation,
    getFilteredTasks,
    searchTasks,
    getIncompleteTasksFromPriorDays,
    bulkMoveToLocation,
    bulkDelete,
    reorderTasks
  }
}
