import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

// Singleton state
const hiddenDays = ref([])
const tagColors = ref({}) // { tagName: { bg, text } }
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
    isLoaded,
    loadPreferences,
    toggleDay,
    isDayVisible,
    setTagColor,
    removeTagColor,
    renameTagColor
  }
}
