import { ref, computed } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

// Tanzillo.ai berry-arc palette — fuchsia family + muted neutrals that share DNA.
// Each entry pairs a ~50-level bg with a ~600-level text for legible contrast.
export const WORKSTREAM_COLORS = [
  { name: 'Fuchsia',   bg: '#FAE8F1', text: '#D4246F' }, // signal
  { name: 'Mulberry',  bg: '#F4D7E0', text: '#B43A5F' }, // warm red-violet
  { name: 'Wine',      bg: '#F0CCD4', text: '#A83A4A' }, // danger-sibling
  { name: 'Plum',      bg: '#DCC8E8', text: '#7E3E9E' }, // cool sister
  { name: 'Indigo',    bg: '#C4CEE0', text: '#3B5A8C' }, // azure
  { name: 'Teal',      bg: '#D4EFEC', text: '#0D5C52' }, // ground
  { name: 'Viridian',  bg: '#C9E6DB', text: '#2B8A6E' }, // success family
  { name: 'Moss',      bg: '#D9E2C5', text: '#5F6E32' }, // muted olive
  { name: 'Persimmon', bg: '#F4D3BA', text: '#D0682A' }, // warning family
  { name: 'Honey',     bg: '#F3E1B6', text: '#9C6F1A' }, // warm gold
  { name: 'Clay',      bg: '#EBD7C8', text: '#8B5438' }, // terracotta
  { name: 'Slate',     bg: '#E0EDEA', text: '#4D7D7D' }, // sage-adjacent
  { name: 'Navy',      bg: '#D6DEE9', text: '#334A66' }, // stage
  { name: 'Dust',      bg: '#EFEAE6', text: '#6B5E55' }, // warm neutral
  { name: 'Smoke',     bg: '#DEE1DE', text: '#5A5F5C' }, // cool neutral
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

  const renameWorkstream = async (oldName, newName) => {
    const index = workstreams.value.findIndex(w => w.name === oldName)
    if (index === -1) return

    // Check for duplicate
    if (workstreams.value.find(w => w.name.toLowerCase() === newName.toLowerCase() && w.name !== oldName)) {
      console.error('Workstream name already exists:', newName)
      return
    }

    const oldWorkstream = { ...workstreams.value[index] }
    workstreams.value[index] = { ...workstreams.value[index], name: newName }

    const { error } = await supabase
      .from('workstreams')
      .update({ name: newName })
      .eq('user_id', getUserId())
      .eq('name', oldName)

    if (error) {
      console.error('Failed to rename workstream:', error)
      workstreams.value[index] = oldWorkstream
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
    renameWorkstream,
    deleteWorkstream,
    getWorkstreamColor,
    allWorkstreams,
    workstreamNames,
    reorderWorkstreams,
    WORKSTREAM_COLORS
  }
}
