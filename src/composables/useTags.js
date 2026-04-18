import { computed } from 'vue'
import { useTasks } from './useTasks'
import { usePreferences } from './usePreferences'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

// Tanzillo.ai berry-arc palette — fuchsia family + muted neutrals that share DNA.
// Mirrors WORKSTREAM_COLORS so tags and workstreams draw from the same family.
export const TAG_COLORS = [
  { name: 'Fuchsia',   bg: '#FAE8F1', text: '#D4246F' }, // signal
  { name: 'Mulberry',  bg: '#F4D7E0', text: '#B43A5F' }, // warm red-violet
  { name: 'Wine',      bg: '#F0CCD4', text: '#A83A4A' }, // danger-sibling
  { name: 'Plum',      bg: '#DCC8E8', text: '#7E3E9E' }, // cool sister
  { name: 'Indigo',    bg: '#C4CEE0', text: '#3B5A8C' }, // azure
  { name: 'Teal',      bg: '#D4EFEC', text: '#0D5C52' }, // ground
  { name: 'Viridian',  bg: '#C9E6DB', text: '#2B8A6E' }, // success family
  { name: 'Moss',      bg: '#D9E2C5', text: '#5F6E32' }, // muted olive
  { name: 'Persimmon', bg: '#F4D3BA', text: '#D0682A' }, // warning family
  { name: 'Honey',     bg: '#F3E1B6', text: '#9C6F1A' }, // warm gold
  { name: 'Clay',      bg: '#EBD7C8', text: '#8B5438' }, // terracotta
  { name: 'Slate',     bg: '#E0EDEA', text: '#4D7D7D' }, // sage-adjacent
  { name: 'Navy',      bg: '#D6DEE9', text: '#334A66' }, // stage
  { name: 'Dust',      bg: '#EFEAE6', text: '#6B5E55' }, // warm neutral
  { name: 'Smoke',     bg: '#DEE1DE', text: '#5A5F5C' }, // cool neutral
  { name: 'Stone',     bg: '#EDEBE7', text: '#78716C' }, // true light neutral
  { name: 'Charcoal',  bg: '#DCDAD6', text: '#454545' }, // true dark neutral
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
