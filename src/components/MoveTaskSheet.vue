<script setup>
import { computed } from 'vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  task: { type: Object, default: null }
})

const emit = defineEmits(['close', 'move'])

const close = () => emit('close')

const handleOverlayClick = (e) => {
  if (e.target === e.currentTarget) emit('close')
}

const tomorrowLabel = computed(() => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
})

const nextWeekLabel = computed(() => {
  // Sunday of next week
  const d = new Date()
  const daysUntilNextSunday = (7 - d.getDay()) % 7 || 7
  d.setDate(d.getDate() + daysUntilNextSunday)
  return `Starting ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
})

const select = (target) => {
  if (!props.task) return
  emit('move', { taskId: props.task.id, target })
  close()
}
</script>

<template>
  <div v-if="show" class="move-sheet-overlay" @click="handleOverlayClick">
    <div class="move-sheet" role="dialog" aria-label="Move task">
      <div class="move-sheet-grip" aria-hidden="true"></div>
      <div class="move-sheet-header">
        <div class="move-sheet-eyebrow">Move</div>
        <div class="move-sheet-title">{{ task?.title }}</div>
      </div>

      <div class="move-sheet-options">
        <button type="button" class="move-option" @click="select('tomorrow')">
          <div class="move-option-label">Move to tomorrow</div>
          <div class="move-option-meta">{{ tomorrowLabel }}</div>
        </button>
        <button type="button" class="move-option" @click="select('next-week')">
          <div class="move-option-label">Move to next week</div>
          <div class="move-option-meta">{{ nextWeekLabel }}</div>
        </button>
      </div>

      <button type="button" class="move-sheet-cancel" @click="close">Cancel</button>
    </div>
  </div>
</template>

<style scoped>
.move-sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(11, 20, 30, 0.4);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1100;
  animation: overlay-in 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.move-sheet {
  width: 100vw;
  max-width: 100vw;
  background: var(--color-surface);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  padding: 10px 16px 20px;
  border-top: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
  animation: sheet-in 0.32s cubic-bezier(0.34, 1.35, 0.64, 1);
  padding-bottom: calc(20px + env(safe-area-inset-bottom, 0));
}

@keyframes sheet-in {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}

.move-sheet-grip {
  width: 40px;
  height: 4px;
  border-radius: 999px;
  background: var(--color-border-light);
  margin: 4px auto 12px;
}

.move-sheet-header {
  padding: 0 4px 14px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 12px;
}

.move-sheet-eyebrow {
  font-family: var(--nxb-font-family);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  margin-bottom: 4px;
}

.move-sheet-title {
  font-family: var(--nxb-font-serif);
  font-size: 1.15rem;
  font-weight: 600;
  font-variation-settings: 'opsz' 36, 'WONK' 0;
  letter-spacing: -0.015em;
  color: var(--color-text);
  line-height: 1.25;
}

.move-sheet-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.move-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  text-align: left;
  width: 100%;
  padding: 14px 16px;
  min-height: 60px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-elevated);
  color: var(--color-text);
  font-family: inherit;
  cursor: pointer;
  transition:
    background var(--transition),
    border-color var(--transition),
    color var(--transition);
}

.move-option:active,
.move-option:hover {
  background: var(--color-primary-ghost);
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.move-option-label {
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: -0.005em;
}

.move-option-meta {
  font-family: var(--nxb-font-serif);
  font-style: italic;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.move-option:hover .move-option-meta,
.move-option:active .move-option-meta {
  color: var(--color-accent);
}

.move-sheet-cancel {
  width: 100%;
  margin-top: 12px;
  padding: 12px 16px;
  min-height: 48px;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: color var(--transition);
}

.move-sheet-cancel:hover,
.move-sheet-cancel:active {
  color: var(--color-accent);
}
</style>
