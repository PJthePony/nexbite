<script setup>
import { ref, computed } from 'vue'
import { getTagColor } from '../composables/useTags'

const props = defineProps({
  tasks: {
    type: Array,
    required: true
  }
})

const emit = defineEmits(['edit'])

// Number of weeks to show
const WEEKS_TO_SHOW = 12
const MAX_VISIBLE_TASKS = 3

const expandedDays = ref(new Set())

// Get all Later tasks with activateAt dates
const laterTasks = computed(() => {
  return props.tasks.filter(t => t.location === 'later' && t.activateAt && !t.completed)
})

// Group tasks by date
const tasksByDate = computed(() => {
  const map = {}
  laterTasks.value.forEach(task => {
    const date = task.activateAt
    if (!map[date]) map[date] = []
    map[date].push(task)
  })
  return map
})

// Generate calendar grid starting from today (weeks start on Sunday)
const calendarWeeks = computed(() => {
  const weeks = []
  const today = new Date()
  // Start from Sunday of current week
  const startOfWeek = new Date(today)
  const day = startOfWeek.getDay()
  startOfWeek.setDate(startOfWeek.getDate() - day)

  for (let w = 0; w < WEEKS_TO_SHOW; w++) {
    const week = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(startOfWeek)
      date.setDate(date.getDate() + (w * 7) + d)
      const dateStr = date.toISOString().split('T')[0]
      week.push({
        date: dateStr,
        dayOfMonth: date.getDate(),
        isToday: dateStr === today.toISOString().split('T')[0],
        isPast: date < new Date(today.toISOString().split('T')[0]),
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

const visibleTasks = (day) => {
  if (isExpanded(day.date) || day.tasks.length <= MAX_VISIBLE_TASKS) {
    return day.tasks
  }
  return day.tasks.slice(0, MAX_VISIBLE_TASKS)
}

const hiddenCount = (day) => {
  if (isExpanded(day.date)) return 0
  return Math.max(0, day.tasks.length - MAX_VISIBLE_TASKS)
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
      <div
        v-for="(week, wi) in calendarWeeks"
        :key="wi"
        class="calendar-week"
      >
        <div
          v-for="day in week"
          :key="day.date"
          class="calendar-day"
          :class="{
            'is-today': day.isToday,
            'is-past': day.isPast,
            'is-weekend': day.isWeekend,
            'has-tasks': day.tasks.length > 0,
            'is-expanded': isExpanded(day.date)
          }"
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

          <div class="day-tasks" v-if="day.tasks.length > 0">
            <div
              v-for="task in visibleTasks(day)"
              :key="task.id"
              class="calendar-task"
              @click="emit('edit', task)"
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

            <button
              v-if="hiddenCount(day) > 0"
              class="day-expand-btn"
              @click="toggleExpand(day.date)"
            >
              +{{ hiddenCount(day) }} more
            </button>

            <button
              v-if="isExpanded(day.date) && day.tasks.length > MAX_VISIBLE_TASKS"
              class="day-expand-btn"
              @click="toggleExpand(day.date)"
            >
              Show less
            </button>
          </div>
        </div>
      </div>
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
  min-height: 110px;
  padding: 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  transition: background 0.15s ease;
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

.calendar-day.has-tasks {
  min-height: 120px;
}

.calendar-day.is-expanded {
  min-height: auto;
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
}

.calendar-task {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border-radius: 3px;
  cursor: pointer;
  transition: background 0.1s ease;
}

.calendar-task:hover {
  background: rgba(0, 0, 0, 0.05);
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

.day-expand-btn:hover {
  text-decoration: underline;
}

/* Mobile */
@media (max-width: 768px) {
  .calendar-day {
    min-height: 70px;
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
