import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

// Singleton state
const hiddenDays = ref([])
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
    }
    // If no row yet, keep defaults (empty array = all days visible)
    isLoaded.value = true
  }

  const saveHiddenDays = async () => {
    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: getUserId(),
        hidden_days: hiddenDays.value,
        updated_at: new Date().toISOString()
      })

    if (error) {
      console.error('Failed to save preferences:', error)
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
    isLoaded,
    loadPreferences,
    toggleDay,
    isDayVisible
  }
}
