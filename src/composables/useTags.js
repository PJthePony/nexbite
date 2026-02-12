import { computed } from 'vue'
import { useTasks } from './useTasks'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

// 10 curated tag colors - harmonized with Palette C (Soft Neutrals + Muted Teal)
const TAG_COLORS = [
  { bg: '#e6f2ef', text: '#1f6b5e' },  // Teal (primary family)
  { bg: '#e8eee4', text: '#3d6b3a' },  // Sage
  { bg: '#f2ebe0', text: '#8b6d3f' },  // Warm Gold (accent family)
  { bg: '#eae4f0', text: '#6b4d8a' },  // Muted Purple
  { bg: '#e0eaf2', text: '#3a5f7a' },  // Slate Blue
  { bg: '#f2ece6', text: '#8b6040' },  // Copper
  { bg: '#f0e6e6', text: '#8b4a4a' },  // Dusty Rose
  { bg: '#e4ede8', text: '#3d6b56' },  // Forest
  { bg: '#ebe8e4', text: '#6b5d4f' },  // Warm Stone
  { bg: '#e6eee2', text: '#4f6b3a' },  // Moss
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
  const index = hashString(tagName.toLowerCase()) % TAG_COLORS.length
  return TAG_COLORS[index]
}

export function useTags() {
  const { tasks } = useTasks()

  const recentTags = computed(() => {
    const thirtyDaysAgo = Date.now() - THIRTY_DAYS_MS
    const tagSet = new Set()

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
