import { computed } from 'vue'
import { useTasks } from './useTasks'
import { usePreferences } from './usePreferences'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

// 13 curated tag colors - Soft Jewel palette + neutrals
export const TAG_COLORS = [
  { name: 'Stone',    bg: '#eeecea', text: '#7a7168' },
  { name: 'Slate',    bg: '#e3e8ed', text: '#5c6b7a' },
  { name: 'Charcoal', bg: '#e5e5e5', text: '#454545' },
  { name: 'Sapphire', bg: '#dce8f5', text: '#3b6fc2' },
  { name: 'Rose',     bg: '#f5dde1', text: '#d4576b' },
  { name: 'Jade',     bg: '#d4efe9', text: '#27907e' },
  { name: 'Amber',    bg: '#f5e8d5', text: '#d48a3a' },
  { name: 'Amethyst', bg: '#e8ddf5', text: '#8855bb' },
  { name: 'Emerald',  bg: '#d5f0e2', text: '#2e9664' },
  { name: 'Gold',     bg: '#f0ebd3', text: '#b09630' },
  { name: 'Peony',    bg: '#f5dde8', text: '#c45580' },
  { name: 'Teal',     bg: '#d3eff3', text: '#1a96a8' },
  { name: 'Ruby',     bg: '#f5dcdd', text: '#c43e44' },
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
