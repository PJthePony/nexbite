<script setup>
import { ref, computed } from 'vue'
import draggable from 'vuedraggable'
import { getTagColor } from '../composables/useTags'
import { useWorkstreams } from '../composables/useWorkstreams'
import { useMultiSelect } from '../composables/useMultiSelect'
import { toLocalDateString } from '../lib/dates'
import { dateToLocation } from '../composables/useWeekLogic'

const { getWorkstreamColor } = useWorkstreams()
const { selectedTaskIds, isSelectMode, toggleSelection, isSelected, startDrag, endDrag, clearSelection } = useMultiSelect()

const props = defineProps({
  tasks: {
    type: Array,
    required: true
  },
  tasksByLocation: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['edit', 'add', 'add-to-day', 'move-task', 'move-task-to-day'])

// Number of weeks to show
const WEEKS_TO_SHOW = 52
const VISIBLE_TASK_COUNT = 3 // max tasks shown per day before collapsing

const expandedDays = ref(new Set())

// Get all Later tasks with activateAt dates
const laterTasks = computed(() => {
  return props.tasks.filter(t => t.location === 'later' && t.activateAt && !t.completed)
})

// Build a map from day-location to calendar date for the current week
const dayLocationDateMap = computed(() => {
  const today = new Date()
  const day = today.getDay() // Sunday = 0
  const weekStart = new Date(today)
  weekStart.setDate(weekStart.getDate() - day)
  weekStart.setHours(0, 0, 0, 0)

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const map = {}
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    map[dayNames[i]] = toLocalDateString(d)
  }
  return map
})

// Get Monday of next week as a date string
const nextWeekMondayStr = computed(() => {
  const today = new Date()
  const day = today.getDay() // Sunday = 0
  const weekStart = new Date(today)
  weekStart.setDate(weekStart.getDate() - day) // Sunday of this week
  const nextMonday = new Date(weekStart)
  nextMonday.setDate(nextMonday.getDate() + 8) // Next week's Monday
  return toLocalDateString(nextMonday)
})

// Group tasks by date — includes both "later" tasks and this-week day-location tasks
const tasksByDate = computed(() => {
  const map = {}

  // Add later tasks by their activateAt date
  laterTasks.value.forEach(task => {
    const date = task.activateAt
    if (!map[date]) map[date] = []
    map[date].push(task)
  })

  // Add this-week tasks (from day-location columns) mapped to their calendar dates
  const locationDateMap = dayLocationDateMap.value
  for (const [location, dateStr] of Object.entries(locationDateMap)) {
    const columnTasks = (props.tasksByLocation[location] || []).filter(t => !t.completed)
    if (columnTasks.length > 0) {
      if (!map[dateStr]) map[dateStr] = []
      map[dateStr].push(...columnTasks)
    }
  }

  // Also add "this-week" bucket tasks to today's date
  const thisWeekTasks = (props.tasksByLocation['this-week'] || []).filter(t => !t.completed)
  if (thisWeekTasks.length > 0) {
    const todayStr = toLocalDateString()
    if (!map[todayStr]) map[todayStr] = []
    map[todayStr].push(...thisWeekTasks)
  }

  // Add next-week bucket tasks (no specific day) to Monday of next week
  const nextWeekTasks = (props.tasksByLocation['next-week'] || []).filter(t => !t.completed)
  if (nextWeekTasks.length > 0) {
    const mondayStr = nextWeekMondayStr.value
    if (!map[mondayStr]) map[mondayStr] = []
    map[mondayStr].push(...nextWeekTasks)
  }

  return map
})

// Generate calendar grid starting from this week (weeks start on Sunday)
const calendarWeeks = computed(() => {
  const weeks = []
  const today = new Date()
  // Start from Sunday of the current week
  const startOfWeek = new Date(today)
  const day = startOfWeek.getDay()
  startOfWeek.setDate(startOfWeek.getDate() - day)

  for (let w = 0; w < WEEKS_TO_SHOW; w++) {
    const week = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(startOfWeek)
      date.setDate(date.getDate() + (w * 7) + d)
      const dateStr = toLocalDateString(date)
      const todayStr = toLocalDateString(today)
      week.push({
        date: dateStr,
        dayOfMonth: date.getDate(),
        isToday: dateStr === todayStr,
        isPast: dateStr < todayStr,
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
        month: date.toLocaleDateString(undefined, { month: 'short' }),
        isFirstOfMonth: date.getDate() === 1,
        tasks: tasksByDate.value[dateStr] || []
      })
    }
    weeks.push(week)
  }
  return weeks
})

const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Show a month label when the month changes between weeks
const weekMonthLabels = computed(() => {
  let prevMonth = null
  return calendarWeeks.value.map((week, wi) => {
    // Use the last day of the week (Saturday) to determine the month label
    // This ensures the label is always for the upcoming/new month even if
    // Sunday is still in the prior month
    const lastDay = week[6]
    const date = new Date(lastDay.date)
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`
    const label = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

    if (wi === 0) {
      prevMonth = monthKey
      return label
    }

    if (monthKey !== prevMonth) {
      prevMonth = monthKey
      return label
    }

    prevMonth = monthKey
    return null
  })
})

const toggleExpand = (dateStr) => {
  if (expandedDays.value.has(dateStr)) {
    expandedDays.value.delete(dateStr)
  } else {
    expandedDays.value.add(dateStr)
  }
  // Force reactivity
  expandedDays.value = new Set(expandedDays.value)
}

const isExpanded = (dateStr) => expandedDays.value.has(dateStr)

// Handle task click: edit or toggle selection
const handleTaskClick = (task) => {
  if (isSelectMode.value) {
    toggleSelection(task.id)
  } else {
    emit('edit', task)
  }
}

// Handle clicking on a day to add a task
const handleDayClick = (dateStr) => {
  const resolvedLocation = dateToLocation(dateStr)
  if (resolvedLocation && resolvedLocation !== 'later' && resolvedLocation !== 'next-week') {
    // Current week — add to the day-location column
    emit('add-to-day', resolvedLocation)
  } else {
    // Future date — add as a "later" task with activateAt
    emit('add', dateStr)
  }
}

// Handle drag-and-drop: when a task is added to a day, move it appropriately.
// If the date falls in the current week, move to the day-location column.
// Otherwise, update activateAt for "later" scheduling.
// If multiple tasks are selected and one of them is dragged, move all selected.
const handleDragChange = (dateStr, evt) => {
  if (evt.added) {
    const addedId = evt.added.element.id
    const tasksToMove = (selectedTaskIds.value.has(addedId) && selectedTaskIds.value.size > 1)
      ? [...selectedTaskIds.value]
      : [addedId]

    const resolvedLocation = dateToLocation(dateStr)

    tasksToMove.forEach(taskId => {
      if (resolvedLocation && resolvedLocation !== 'later' && resolvedLocation !== 'next-week') {
        // Date is in the current week — move to the day column
        emit('move-task-to-day', { taskId, location: resolvedLocation })
      } else {
        // Date is in the future — update activateAt
        emit('move-task', { taskId, newDate: dateStr })
      }
    })

    if (selectedTaskIds.value.has(addedId) && selectedTaskIds.value.size > 1) {
      clearSelection()
    }
  }
}

const handleDragStart = (evt) => {
  const tasks = evt.item?.__vue__?.$attrs?.element
  // startDrag is from useMultiSelect — tracks if we're dragging a selected item
  if (tasks) startDrag(tasks.id)
}

const handleDragEnd = () => {
  endDrag()
}

</script>

<template>
  <div class="calendar-view">
    <!-- Day headers -->
    <div class="calendar-header">
      <div
        v-for="header in dayHeaders"
        :key="header"
        class="calendar-header-cell"
      >{{ header }}</div>
    </div>

    <!-- Calendar grid -->
    <div class="calendar-grid">
      <template
        v-for="(week, wi) in calendarWeeks"
        :key="wi"
      >
      <!-- Month divider label -->
      <div v-if="weekMonthLabels[wi]" class="calendar-month-divider" :class="{ 'is-first': wi === 0 }">
        <span class="month-label">{{ weekMonthLabels[wi] }}</span>
      </div>
      <div class="calendar-week">
        <div
          v-for="day in week"
          :key="day.date"
          :data-date="day.date"
          class="calendar-day"
          :class="{
            'is-today': day.isToday,
            'is-past': day.isPast,
            'is-weekend': day.isWeekend,
            'has-tasks': day.tasks.length > 0,
            'is-expanded': isExpanded(day.date)
          }"
          @click="handleDayClick(day.date)"
        >
          <div class="day-header">
            <span class="day-number" :class="{ 'is-first-of-month': day.isFirstOfMonth }">
              <template v-if="day.isFirstOfMonth || day.isToday">
                <span class="day-month">{{ day.month }}</span>
              </template>
              {{ day.dayOfMonth }}
            </span>
            <span v-if="day.tasks.length > 0" class="day-task-count">{{ day.tasks.length }}</span>
          </div>

          <draggable
            :model-value="day.tasks"
            :group="{ name: 'calendar-tasks', pull: true, put: true }"
            item-key="id"
            class="day-tasks"
            :class="{ 'is-collapsed': !isExpanded(day.date) && day.tasks.length > VISIBLE_TASK_COUNT }"
            ghost-class="sortable-ghost"
            chosen-class="sortable-chosen"
            drag-class="sortable-drag"
            :force-fallback="true"
            :animation="150"
            @change="handleDragChange(day.date, $event)"
          >
            <template #item="{ element: task }">
              <div
                class="calendar-task"
                :class="{ 'is-selected': isSelected(task.id) }"
                :style="task.workstream && getWorkstreamColor(task.workstream) ? { borderLeftColor: getWorkstreamColor(task.workstream).text, borderLeftWidth: '3px' } : {}"
                @click.stop="handleTaskClick(task)"
              >
                <template v-if="task.tags && task.tags.length > 0">
                  <span
                    v-for="tag in task.tags"
                    :key="tag"
                    class="cal-tag-dot"
                    :style="{ backgroundColor: getTagColor(tag).text }"
                  ></span>
                </template>
                <span class="calendar-task-title">{{ task.title }}</span>
              </div>
            </template>
          </draggable>

          <!-- Expand / Collapse buttons -->
          <button
            v-if="!isExpanded(day.date) && day.tasks.length > VISIBLE_TASK_COUNT"
            class="day-expand-btn day-see-all"
            @click.stop="toggleExpand(day.date)"
          >
            +{{ day.tasks.length - VISIBLE_TASK_COUNT }} more
          </button>

          <button
            v-if="isExpanded(day.date) && day.tasks.length > VISIBLE_TASK_COUNT"
            class="day-expand-btn"
            @click.stop="toggleExpand(day.date)"
          >
            Show less
          </button>
        </div>
      </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.calendar-view {
  max-width: 100%;
  overflow-x: auto;
}

.calendar-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  margin-bottom: 2px;
}

.calendar-header-cell {
  text-align: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 10px 0;
}

.calendar-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.calendar-week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.calendar-day {
  min-height: 80px;
  padding: 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  transition: background 0.15s ease;
  cursor: pointer;
  min-width: 0;
  position: relative;
}

.calendar-day:hover {
  border-color: var(--color-text-muted);
}

.calendar-day.is-past {
  opacity: 0.5;
}

.calendar-day.is-weekend {
  background: var(--color-bg);
}

.calendar-day.is-today {
  border-color: var(--color-primary);
  background: rgba(249, 115, 22, 0.04);
}


.day-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.day-number {
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  display: flex;
  align-items: baseline;
  gap: 3px;
}

.calendar-day.is-today .day-number {
  color: var(--color-primary);
  font-weight: 700;
}

.day-number.is-first-of-month {
  font-weight: 600;
  color: var(--color-text);
}

.day-month {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.day-task-count {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--color-text-muted);
  background: var(--color-bg);
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.day-tasks {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
  min-height: 20px;
}

/* Hide tasks beyond the visible count when collapsed */
.day-tasks.is-collapsed > :nth-child(n+4) {
  display: none;
}

.calendar-task {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border-radius: 3px;
  cursor: pointer;
  transition: background 0.1s ease;
  overflow: hidden;
  min-width: 0;
  border-left: 2px solid transparent;
}

.calendar-task:hover {
  background: rgba(0, 0, 0, 0.05);
}

.calendar-task.is-selected {
  background: rgba(249, 115, 22, 0.1);
  box-shadow: 0 0 0 1px var(--color-primary);
}

/* Drag ghost styles */
.sortable-ghost {
  opacity: 0.4;
}

.sortable-chosen {
  opacity: 0.8;
}

.cal-tag-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

.calendar-task-title {
  font-size: 0.7rem;
  line-height: 1.3;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.day-expand-btn {
  font-size: 0.65rem;
  color: var(--color-primary);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  text-align: left;
  font-weight: 500;
}

.day-see-all {
  margin-top: 2px;
}

.day-expand-btn:hover {
  text-decoration: underline;
}

/* Month divider */
.calendar-month-divider {
  padding: 16px 4px 6px;
  margin-top: 8px;
  border-top: 1px solid var(--color-border);
}

.calendar-month-divider.is-first {
  padding-top: 4px;
  margin-top: 0;
  border-top: none;
}

.month-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  letter-spacing: -0.01em;
}

/* Mobile */
@media (max-width: 768px) {
  .calendar-day {
    min-height: 60px;
    padding: 5px;
  }

  .calendar-task-title {
    font-size: 0.65rem;
  }

  .day-number {
    font-size: 0.75rem;
  }
}
</style>
