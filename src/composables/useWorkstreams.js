import { ref, computed } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

// 10 predefined colors for workstreams - harmonized with Palette C (Soft Neutrals + Muted Teal)
export const WORKSTREAM_COLORS = [
  { name: 'Teal', bg: '#e6f2ef', text: '#1f6b5e' },
  { name: 'Slate', bg: '#e0eaf2', text: '#3a5f7a' },
  { name: 'Gold', bg: '#f2ebe0', text: '#8b6d3f' },
  { name: 'Plum', bg: '#eae4f0', text: '#6b4d8a' },
  { name: 'Sage', bg: '#e8eee4', text: '#3d6b3a' },
  { name: 'Copper', bg: '#f2ece6', text: '#8b6040' },
  { name: 'Rose', bg: '#f0e6e6', text: '#8b4a4a' },
  { name: 'Forest', bg: '#e4ede8', text: '#3d6b56' },
  { name: 'Stone', bg: '#ebe8e4', text: '#6b5d4f' },
  { name: 'Moss', bg: '#e6eee2', text: '#4f6b3a' },
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
