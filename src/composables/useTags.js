import { computed } from 'vue'
import { useTasks } from './useTasks'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

// 10 curated tag colors - background and text pairs for good contrast
const TAG_COLORS = [
  { bg: '#e8f4ef', text: '#1a5f4a' },  // Mint
  { bg: '#e3f2fd', text: '#1565c0' },  // Blue
  { bg: '#fff3e0', text: '#e65100' },  // Orange
  { bg: '#f3e5f5', text: '#7b1fa2' },  // Purple
  { bg: '#e8eaf6', text: '#3949ab' },  // Indigo
  { bg: '#fff8e1', text: '#f9a825' },  // Amber
  { bg: '#fce4ec', text: '#c2185b' },  // Pink
  { bg: '#e0f2f1', text: '#00796b' },  // Teal
  { bg: '#efebe9', text: '#5d4037' },  // Brown
  { bg: '#f1f8e9', text: '#558b2f' },  // Light Green
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
