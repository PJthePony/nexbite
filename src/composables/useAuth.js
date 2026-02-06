import { ref, computed } from 'vue'
import { supabase } from '../lib/supabase'

// Module-scope state (singleton)
const user = ref(null)
const session = ref(null)
const loading = ref(true)
let initialized = false

export function useAuth() {
  const isAuthenticated = computed(() => !!user.value)

  const initialize = () => {
    if (initialized) {
      return Promise.resolve()
    }
    initialized = true

    return new Promise((resolve) => {
      // Get the initial session
      supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
        session.value = currentSession
        user.value = currentSession?.user ?? null
        loading.value = false
        resolve()
      })

      // Listen for auth state changes (login, logout, token refresh)
      supabase.auth.onAuthStateChange((_event, newSession) => {
        session.value = newSession
        user.value = newSession?.user ?? null
        loading.value = false
      })
    })
  }

  const signIn = async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin
      }
    })
    if (error) throw error
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return {
    user,
    session,
    loading,
    isAuthenticated,
    initialize,
    signIn,
    signOut
  }
}
