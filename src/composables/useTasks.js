import { ref, computed, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

// Map snake_case DB columns to camelCase JS properties
function mapDbToLocal(dbTask) {
  return {
    id: dbTask.id,
    title: dbTask.title,
    notes: dbTask.notes,
    completed: dbTask.completed,
    location: dbTask.location,
    workstream: dbTask.workstream,
    tags: dbTask.tags || [],
    createdAt: dbTask.created_at,
    completedAt: dbTask.completed_at,
    activateAt: dbTask.activate_at,
    sortOrder: dbTask.sort_order,
    parentTaskId: dbTask.parent_task_id,
    biteTaskIds: [] // derived after load
  }
}

// Map camelCase JS properties to snake_case DB columns
function mapLocalToDb(task, userId) {
  return {
    id: task.id,
    user_id: userId,
    title: task.title,
    notes: task.notes,
    completed: task.completed,
    location: task.location,
    workstream: task.workstream,
    tags: task.tags,
    created_at: task.createdAt,
    completed_at: task.completedAt,
    activate_at: task.activateAt,
    sort_order: task.sortOrder,
    parent_task_id: task.parentTaskId
  }
}

// Derive biteTaskIds from parentTaskId references
function refreshBiteTaskIds(tasksList) {
  const map = {}
  tasksList.forEach(t => {
    if (t.parentTaskId) {
      if (!map[t.parentTaskId]) map[t.parentTaskId] = []
      map[t.parentTaskId].push(t.id)
    }
  })
  tasksList.forEach(t => {
    t.biteTaskIds = map[t.id] || []
  })
}

// Singleton state
const tasks = ref([])
const isLoaded = ref(false)

export function useTasks() {
  const { user } = useAuth()

  const getUserId = () => user.value?.id

  // Load all tasks from Supabase
  const loadTasks = async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('Failed to load tasks:', error)
      return
    }

    tasks.value = (data || []).map(mapDbToLocal)
    refreshBiteTaskIds(tasks.value)
    isLoaded.value = true
  }

  const getNextSortOrder = (location) => {
    const locationTasks = tasks.value.filter(t => t.location === location)
    if (locationTasks.length === 0) return 0
    return Math.max(...locationTasks.map(t => t.sortOrder ?? 0)) + 1
  }

  const addTask = async (title, location, notes = '', tags = [], workstream = null, activateAt = null) => {
    const userId = getUserId()
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
      activateAt,
      sortOrder: getNextSortOrder(location),
      parentTaskId: null,
      biteTaskIds: []
    }

    // Optimistic update
    tasks.value.push(task)

    // Persist to Supabase
    const { error } = await supabase
      .from('tasks')
      .insert(mapLocalToDb(task, userId))

    if (error) {
      console.error('Failed to save task:', error)
      tasks.value = tasks.value.filter(t => t.id !== task.id)
    }

    return task
  }

  const getTaskById = (id) => {
    return tasks.value.find(t => t.id === id) || null
  }

  const biteTask = async (parentId, biteTitle, biteLocation, parentNewLocation) => {
    const userId = getUserId()
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

    // Optimistic update
    tasks.value.push(bite)
    parent.location = parentNewLocation
    refreshBiteTaskIds(tasks.value)

    // Persist bite task and parent update
    const { error: biteError } = await supabase
      .from('tasks')
      .insert(mapLocalToDb(bite, userId))

    if (biteError) {
      console.error('Failed to save bite task:', biteError)
    }

    const { error: parentError } = await supabase
      .from('tasks')
      .update({ location: parentNewLocation })
      .eq('id', parentId)

    if (parentError) {
      console.error('Failed to update parent task:', parentError)
    }

    return bite
  }

  const updateTask = async (id, updates) => {
    const index = tasks.value.findIndex(t => t.id === id)
    if (index === -1) return

    // Optimistic update
    const oldTask = { ...tasks.value[index] }
    tasks.value[index] = { ...tasks.value[index], ...updates }

    // Build DB update object (map camelCase to snake_case)
    const dbUpdates = {}
    if ('title' in updates) dbUpdates.title = updates.title
    if ('notes' in updates) dbUpdates.notes = updates.notes
    if ('completed' in updates) dbUpdates.completed = updates.completed
    if ('location' in updates) dbUpdates.location = updates.location
    if ('workstream' in updates) dbUpdates.workstream = updates.workstream
    if ('tags' in updates) dbUpdates.tags = updates.tags
    if ('completedAt' in updates) dbUpdates.completed_at = updates.completedAt
    if ('activateAt' in updates) dbUpdates.activate_at = updates.activateAt
    if ('sortOrder' in updates) dbUpdates.sort_order = updates.sortOrder
    if ('parentTaskId' in updates) dbUpdates.parent_task_id = updates.parentTaskId

    const { error } = await supabase
      .from('tasks')
      .update(dbUpdates)
      .eq('id', id)

    if (error) {
      console.error('Failed to update task:', error)
      // Rollback
      tasks.value[index] = oldTask
    }
  }

  const deleteTask = async (id) => {
    const index = tasks.value.findIndex(t => t.id === id)
    if (index === -1) return

    // Optimistic update
    const removed = tasks.value.splice(index, 1)[0]
    refreshBiteTaskIds(tasks.value)

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Failed to delete task:', error)
      // Rollback
      tasks.value.splice(index, 0, removed)
      refreshBiteTaskIds(tasks.value)
    }
  }

  const toggleTask = async (id) => {
    const task = tasks.value.find(t => t.id === id)
    if (!task) return

    // Optimistic update
    const wasCompleted = task.completed
    task.completed = !task.completed
    task.completedAt = task.completed ? Date.now() : null

    const { error } = await supabase
      .from('tasks')
      .update({
        completed: task.completed,
        completed_at: task.completedAt
      })
      .eq('id', id)

    if (error) {
      console.error('Failed to toggle task:', error)
      // Rollback
      task.completed = wasCompleted
      task.completedAt = wasCompleted ? task.completedAt : null
    }
  }

  const moveTask = async (id, newLocation) => {
    const task = tasks.value.find(t => t.id === id)
    if (!task) return

    const oldLocation = task.location
    const oldActivateAt = task.activateAt
    // Optimistic update
    task.location = newLocation
    // Clear activateAt when moving away from later
    if (newLocation !== 'later') {
      task.activateAt = null
    }

    const dbUpdate = { location: newLocation }
    if (newLocation !== 'later') {
      dbUpdate.activate_at = null
    }

    const { error } = await supabase
      .from('tasks')
      .update(dbUpdate)
      .eq('id', id)

    if (error) {
      console.error('Failed to move task:', error)
      task.location = oldLocation
      task.activateAt = oldActivateAt
    }
  }

  // Promote "later" tasks whose activate_at date has arrived
  const promoteScheduledTasks = async () => {
    const today = new Date().toISOString().split('T')[0]
    const toPromote = tasks.value.filter(t =>
      t.location === 'later' && t.activateAt && t.activateAt <= today && !t.completed
    )
    if (toPromote.length === 0) return

    const ids = toPromote.map(t => t.id)
    // Optimistic update
    toPromote.forEach(t => {
      t.location = 'next-week'
      t.activateAt = null
    })

    const updates = ids.map(id => ({
      id,
      user_id: getUserId(),
      location: 'next-week',
      activate_at: null
    }))

    const { error } = await supabase
      .from('tasks')
      .upsert(updates, { onConflict: 'id' })

    if (error) {
      console.error('Failed to promote scheduled tasks:', error)
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

  const bulkMoveToLocation = async (taskIds, location) => {
    // Optimistic update
    taskIds.forEach(id => {
      const task = tasks.value.find(t => t.id === id)
      if (task) {
        task.location = location
      }
    })

    // Batch update in Supabase
    const updates = taskIds.map(id => ({
      id,
      user_id: getUserId(),
      location
    }))

    const { error } = await supabase
      .from('tasks')
      .upsert(updates, { onConflict: 'id' })

    if (error) {
      console.error('Failed to bulk move tasks:', error)
    }
  }

  const bulkDelete = async (taskIds) => {
    // Optimistic update
    const removed = tasks.value.filter(t => taskIds.includes(t.id))
    tasks.value = tasks.value.filter(t => !taskIds.includes(t.id))
    refreshBiteTaskIds(tasks.value)

    const { error } = await supabase
      .from('tasks')
      .delete()
      .in('id', taskIds)

    if (error) {
      console.error('Failed to bulk delete tasks:', error)
      // Rollback
      tasks.value.push(...removed)
      refreshBiteTaskIds(tasks.value)
    }
  }

  const reorderTasks = async (location, orderedTaskIds, workstream = undefined) => {
    const userId = getUserId()

    // Optimistic update
    orderedTaskIds.forEach((taskId, index) => {
      const task = tasks.value.find(t => t.id === taskId)
      if (task) {
        task.sortOrder = index
        task.location = location
        if (workstream !== undefined) {
          task.workstream = workstream
        }
      }
    })

    // Batch update to Supabase
    const updates = orderedTaskIds.map((taskId, index) => {
      const update = {
        id: taskId,
        user_id: userId,
        sort_order: index,
        location
      }
      if (workstream !== undefined) {
        update.workstream = workstream
      }
      return update
    })

    const { error } = await supabase
      .from('tasks')
      .upsert(updates, { onConflict: 'id' })

    if (error) {
      console.error('Failed to reorder tasks:', error)
    }
  }

  const setWorkstream = async (taskId, workstream) => {
    const task = tasks.value.find(t => t.id === taskId)
    if (!task) return

    const oldWorkstream = task.workstream
    task.workstream = workstream

    const { error } = await supabase
      .from('tasks')
      .update({ workstream })
      .eq('id', taskId)

    if (error) {
      console.error('Failed to set workstream:', error)
      task.workstream = oldWorkstream
    }
  }

  return {
    tasks,
    isLoaded,
    loadTasks,
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
    reorderTasks,
    promoteScheduledTasks
  }
}
