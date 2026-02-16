import { ref, computed } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

// 12 predefined colors for workstreams - Electric Brights palette + neutrals
export const WORKSTREAM_COLORS = [
  { name: 'Stone', bg: '#f5f5f4', text: '#78716c' },
  { name: 'Slate', bg: '#f1f5f9', text: '#64748b' },
  { name: 'Electric Blue', bg: '#dbeafe', text: '#2563eb' },
  { name: 'Neon Rose', bg: '#ffe4e6', text: '#f43f5e' },
  { name: 'Turquoise', bg: '#ccfbf1', text: '#14b8a6' },
  { name: 'Tangerine', bg: '#ffedd5', text: '#f97316' },
  { name: 'Violet', bg: '#e9d5ff', text: '#a855f7' },
  { name: 'Neon Green', bg: '#d1fae5', text: '#10b981' },
  { name: 'Lemon', bg: '#fef08a', text: '#ca8a04' },
  { name: 'Flamingo', bg: '#fce7f3', text: '#ec4899' },
  { name: 'Aqua', bg: '#cffafe', text: '#06b6d4' },
  { name: 'Watermelon', bg: '#fecdd3', text: '#e11d48' },
]

// Shared state across all usages (singleton)
const workstreams = ref([])
const isLoaded = ref(false)

export function useWorkstreams() {
  const { user } = useAuth()
  const getUserId = () => user.value?.id

  // Load workstreams from Supabase
  const loadWorkstreams = async () => {
    const { data, error } = await supabase
      .from('workstreams')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('Failed to load workstreams:', error)
      return
    }

    workstreams.value = (data || []).map(w => ({
      name: w.name,
      color: { bg: w.color_bg, text: w.color_text },
      sortOrder: w.sort_order
    }))
    isLoaded.value = true
  }

  const addWorkstream = async (name, color) => {
    const userId = getUserId()

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

    // Optimistic update
    workstreams.value.push(workstream)

    // Persist to Supabase
    const { error } = await supabase
      .from('workstreams')
      .insert({
        user_id: userId,
        name: workstream.name,
        color_bg: workstream.color.bg,
        color_text: workstream.color.text,
        sort_order: workstream.sortOrder
      })

    if (error) {
      console.error('Failed to save workstream:', error)
      workstreams.value = workstreams.value.filter(w => w.name !== workstream.name)
    }

    return workstream
  }

  const updateWorkstream = async (name, updates) => {
    const index = workstreams.value.findIndex(w => w.name === name)
    if (index === -1) return

    const oldWorkstream = { ...workstreams.value[index] }
    workstreams.value[index] = { ...workstreams.value[index], ...updates }

    const dbUpdates = {}
    if (updates.color) {
      dbUpdates.color_bg = updates.color.bg
      dbUpdates.color_text = updates.color.text
    }
    if ('sortOrder' in updates) dbUpdates.sort_order = updates.sortOrder

    const { error } = await supabase
      .from('workstreams')
      .update(dbUpdates)
      .eq('user_id', getUserId())
      .eq('name', name)

    if (error) {
      console.error('Failed to update workstream:', error)
      workstreams.value[index] = oldWorkstream
    }
  }

  const deleteWorkstream = async (name) => {
    const index = workstreams.value.findIndex(w => w.name === name)
    if (index === -1) return

    const removed = workstreams.value.splice(index, 1)[0]

    const { error } = await supabase
      .from('workstreams')
      .delete()
      .eq('user_id', getUserId())
      .eq('name', name)

    if (error) {
      console.error('Failed to delete workstream:', error)
      workstreams.value.splice(index, 0, removed)
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

  const reorderWorkstreams = async (orderedNames) => {
    const userId = getUserId()

    // Optimistic update
    orderedNames.forEach((name, index) => {
      const ws = workstreams.value.find(w => w.name === name)
      if (ws) {
        ws.sortOrder = index
      }
    })

    // Batch update to Supabase
    const updates = orderedNames.map((name, index) => {
      const ws = workstreams.value.find(w => w.name === name)
      return {
        user_id: userId,
        name,
        color_bg: ws?.color?.bg || '',
        color_text: ws?.color?.text || '',
        sort_order: index
      }
    })

    const { error } = await supabase
      .from('workstreams')
      .upsert(updates, { onConflict: 'user_id,name' })

    if (error) {
      console.error('Failed to reorder workstreams:', error)
    }
  }

  return {
    workstreams,
    isLoaded,
    loadWorkstreams,
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
