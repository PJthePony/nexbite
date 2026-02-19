import { computed } from 'vue'
import { useTasks } from './useTasks'
import { usePreferences } from './usePreferences'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

// 13 curated tag colors - Vivid palette + neutrals
export const TAG_COLORS = [
  { name: 'Stone',    bg: '#f5f5f4', text: '#78716c' },
  { name: 'Slate',    bg: '#f1f5f9', text: '#64748b' },
  { name: 'Charcoal', bg: '#e5e5e5', text: '#454545' },
  { name: 'Sapphire', bg: '#dbeafe', text: '#2563eb' },
  { name: 'Rose',     bg: '#ffe4e6', text: '#f43f5e' },
  { name: 'Jade',     bg: '#ccfbf1', text: '#14b8a6' },
  { name: 'Amber',    bg: '#ffedd5', text: '#f97316' },
  { name: 'Amethyst', bg: '#e9d5ff', text: '#a855f7' },
  { name: 'Emerald',  bg: '#d1fae5', text: '#10b981' },
  { name: 'Gold',     bg: '#fef08a', text: '#ca8a04' },
  { name: 'Peony',    bg: '#fce7f3', text: '#ec4899' },
  { name: 'Teal',     bg: '#cffafe', text: '#06b6d4' },
  { name: 'Ruby',     bg: '#fecdd3', text: '#e11d48' },
]

// Hash a string to a number for consistent color assignment
function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

export function getTagColor(tagName) {
  // Check for user-defined color override
  const { tagColors } = usePreferences()
  const override = tagColors.value[tagName]
  if (override) return override

  const index = hashString(tagName.toLowerCase()) % TAG_COLORS.length
  return TAG_COLORS[index]
}

export function useTags() {
  const { tasks } = useTasks()
  const { standaloneTags } = usePreferences()

  const recentTags = computed(() => {
    const thirtyDaysAgo = Date.now() - THIRTY_DAYS_MS
    const tagSet = new Set()

    // Include standalone tags (created from settings)
    standaloneTags.value.forEach(tag => tagSet.add(tag))

    tasks.value.forEach(task => {
      // Include tags from tasks created in last 30 days
      // or completed in last 30 days
      const isRecent = task.createdAt > thirtyDaysAgo ||
        (task.completedAt && task.completedAt > thirtyDaysAgo)

      if (isRecent && task.tags) {
        task.tags.forEach(tag => tagSet.add(tag))
      }
    })

    return Array.from(tagSet).sort()
  })

  const allTags = computed(() => {
    const tagSet = new Set()
    // Include standalone tags (created from settings, persist without tasks)
    standaloneTags.value.forEach(tag => tagSet.add(tag))
    tasks.value.forEach(task => {
      if (task.tags) {
        task.tags.forEach(tag => tagSet.add(tag))
      }
    })
    return Array.from(tagSet).sort()
  })

  const getTagCounts = computed(() => {
    const counts = {}
    tasks.value.forEach(task => {
      if (task.tags) {
        task.tags.forEach(tag => {
          counts[tag] = (counts[tag] || 0) + 1
        })
      }
    })
    return counts
  })

  return {
    recentTags,
    allTags,
    getTagCounts
  }
}
