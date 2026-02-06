import { ref, computed } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

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
