import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

// Singleton state
const hiddenDays = ref([])
const tagColors = ref({}) // { tagName: { bg, text } }
const standaloneTags = ref([]) // Tags created from settings (persist without tasks)
const isLoaded = ref(false)

export function usePreferences() {
  const { user } = useAuth()
  const getUserId = () => user.value?.id

  const loadPreferences = async () => {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', getUserId())
      .single()

    if (data) {
      hiddenDays.value = data.hidden_days || []
      tagColors.value = data.tag_colors || {}
      standaloneTags.value = data.standalone_tags || []
    }
    // If no row yet, keep defaults (empty array = all days visible)
    isLoaded.value = true
  }

  const savePreferences = async (fields) => {
    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: getUserId(),
        ...fields,
        updated_at: new Date().toISOString()
      })

    if (error) {
      console.error('Failed to save preferences:', error)
    }
  }

  const saveHiddenDays = async () => {
    await savePreferences({ hidden_days: hiddenDays.value })
  }

  const setTagColor = async (tagName, color) => {
    tagColors.value = { ...tagColors.value, [tagName]: color }
    await savePreferences({ tag_colors: tagColors.value })
  }

  const removeTagColor = async (tagName) => {
    const { [tagName]: _, ...rest } = tagColors.value
    tagColors.value = rest
    await savePreferences({ tag_colors: tagColors.value })
  }

  const renameTagColor = async (oldName, newName) => {
    if (tagColors.value[oldName]) {
      const color = tagColors.value[oldName]
      const { [oldName]: _, ...rest } = tagColors.value
      tagColors.value = { ...rest, [newName]: color }
      await savePreferences({ tag_colors: tagColors.value })
    }
  }

  const addStandaloneTag = async (tagName) => {
    if (!standaloneTags.value.includes(tagName)) {
      standaloneTags.value = [...standaloneTags.value, tagName]
      await savePreferences({ standalone_tags: standaloneTags.value })
    }
  }

  const removeStandaloneTag = async (tagName) => {
    standaloneTags.value = standaloneTags.value.filter(t => t !== tagName)
    await savePreferences({ standalone_tags: standaloneTags.value })
  }

  const renameStandaloneTag = async (oldName, newName) => {
    if (standaloneTags.value.includes(oldName)) {
      standaloneTags.value = standaloneTags.value.map(t => t === oldName ? newName : t)
      await savePreferences({ standalone_tags: standaloneTags.value })
    }
  }

  const toggleDay = async (dayId) => {
    const index = hiddenDays.value.indexOf(dayId)
    if (index === -1) {
      hiddenDays.value.push(dayId)
    } else {
      hiddenDays.value.splice(index, 1)
    }
    await saveHiddenDays()
  }

  const isDayVisible = (dayId) => {
    return !hiddenDays.value.includes(dayId)
  }

  return {
    hiddenDays,
    tagColors,
    standaloneTags,
    isLoaded,
    loadPreferences,
    toggleDay,
    isDayVisible,
    setTagColor,
    removeTagColor,
    renameTagColor,
    addStandaloneTag,
    removeStandaloneTag,
    renameStandaloneTag
  }
}
