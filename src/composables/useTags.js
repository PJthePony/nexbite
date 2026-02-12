import { computed } from 'vue'
import { useTasks } from './useTasks'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

// 10 curated tag colors - Electric Brights palette
const TAG_COLORS = [
  { bg: '#dbeafe', text: '#2563eb' },  // Electric Blue
  { bg: '#ffe4e6', text: '#f43f5e' },  // Neon Rose
  { bg: '#ccfbf1', text: '#14b8a6' },  // Turquoise
  { bg: '#ffedd5', text: '#f97316' },  // Tangerine
  { bg: '#e9d5ff', text: '#a855f7' },  // Violet
  { bg: '#d1fae5', text: '#10b981' },  // Neon Green
  { bg: '#fef08a', text: '#ca8a04' },  // Lemon
  { bg: '#fce7f3', text: '#ec4899' },  // Flamingo
  { bg: '#cffafe', text: '#06b6d4' },  // Aqua
  { bg: '#fecdd3', text: '#e11d48' },  // Watermelon
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
