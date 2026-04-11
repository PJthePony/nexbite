import { ref, computed } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

async function hashKey(key) {
  const encoder = new TextEncoder()
  const data = encoder.encode(key)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

function generateRawKey() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  return `nb_${hex}`
}

// Singleton state
const keyMeta = ref(null) // { prefix, createdAt, lastUsedAt }
const isLoaded = ref(false)

export function useApiKey() {
  const { user } = useAuth()

  const hasKey = computed(() => !!keyMeta.value)

  const loadKey = async () => {
    const { data, error } = await supabase
      .from('api_keys')
      .select('key_prefix, key_raw, created_at, last_used_at')
      .single()

    if (error || !data) {
      keyMeta.value = null
    } else {
      keyMeta.value = {
        prefix: data.key_prefix,
        raw: data.key_raw,
        createdAt: data.created_at,
        lastUsedAt: data.last_used_at
      }
    }
    isLoaded.value = true
  }

  // Returns the raw key (only time it's visible)
  const generateKey = async () => {
    const userId = user.value?.id
    if (!userId) return null

    // Revoke existing key first
    await supabase.from('api_keys').delete().eq('user_id', userId)

    const rawKey = generateRawKey()
    const hash = await hashKey(rawKey)
    const prefix = rawKey.slice(0, 7) + '...'

    const { error } = await supabase.from('api_keys').insert({
      user_id: userId,
      key_hash: hash,
      key_prefix: prefix,
      key_raw: rawKey
    })

    if (error) {
      console.error('Failed to generate API key:', error)
      return null
    }

    keyMeta.value = {
      prefix,
      createdAt: new Date().toISOString(),
      lastUsedAt: null
    }

    return rawKey
  }

  const revokeKey = async () => {
    const userId = user.value?.id
    if (!userId) return

    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('user_id', userId)

    if (error) {
      console.error('Failed to revoke API key:', error)
      return
    }

    keyMeta.value = null
  }

  return {
    keyMeta,
    hasKey,
    isLoaded,
    loadKey,
    generateKey,
    revokeKey
  }
}
