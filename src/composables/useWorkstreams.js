import { ref, computed } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

// 10 predefined colors for workstreams - Concrete & Signal palette
export const WORKSTREAM_COLORS = [
  { name: 'Concrete', bg: '#b8c4ce', text: '#1b2838' },
  { name: 'Signal Orange', bg: '#e8a87c', text: '#5c2c0e' },
  { name: 'Patina', bg: '#7eb8b0', text: '#0e3830' },
  { name: 'Brick', bg: '#d48888', text: '#521818' },
  { name: 'Aluminum', bg: '#a0a8b4', text: '#1e2630' },
  { name: 'Caution', bg: '#c8b870', text: '#3a3410' },
  { name: 'Gunmetal', bg: '#8898b0', text: '#1a2440' },
  { name: 'Oxidized', bg: '#88b498', text: '#163024' },
  { name: 'Rust', bg: '#c4a498', text: '#3e201a' },
  { name: 'Charcoal', bg: '#989898', text: '#1e1e1e' },
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
