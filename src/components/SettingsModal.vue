<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useApiKey } from '../composables/useApiKey'
import { getTagColor, TAG_COLORS } from '../composables/useTags'
import { WORKSTREAM_COLORS } from '../composables/useWorkstreams'
import { ALL_COLUMNS } from '../composables/useWeekLogic'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  workstreams: {
    type: Array,
    default: () => []
  },
  allTags: {
    type: Array,
    default: () => []
  },
  tagCounts: {
    type: Object,
    default: () => ({})
  },
  hiddenDays: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits([
  'close',
  'add-workstream',
  'delete-workstream',
  'rename-tag',
  'delete-tag',
  'recolor-tag',
  'toggle-day'
])

const { keyMeta, hasKey, loadKey, generateKey, revokeKey } = useApiKey()

const activeSection = ref('days')
const newlyGeneratedKey = ref(null)
const copied = ref(false)
const isGenerating = ref(false)
const isRevoking = ref(false)
const showRevokeConfirm = ref(false)

// Workstream form state
const newWorkstreamName = ref('')
const newWorkstreamColor = ref(WORKSTREAM_COLORS[0])

// Tag rename state
const renamingTag = ref(null)
const renameValue = ref('')
const coloringTag = ref(null)

const apiEndpoint = computed(() => {
  const base = import.meta.env.VITE_SUPABASE_URL
  return `${base}/functions/v1/tasks-api`
})

const dayColumns = computed(() => {
  return ALL_COLUMNS.filter(col => col.isDay)
})

onMounted(() => {
  loadKey()
})

// Reset state when modal opens
watch(() => props.show, (newVal) => {
  if (newVal) {
    newWorkstreamName.value = ''
    newWorkstreamColor.value = WORKSTREAM_COLORS[0]
    renamingTag.value = null
    renameValue.value = ''
    coloringTag.value = null
  }
})

const handleGenerate = async () => {
  isGenerating.value = true
  const rawKey = await generateKey()
  if (rawKey) {
    newlyGeneratedKey.value = rawKey
  }
  isGenerating.value = false
}

const handleRevoke = async () => {
  isRevoking.value = true
  await revokeKey()
  newlyGeneratedKey.value = null
  showRevokeConfirm.value = false
  isRevoking.value = false
}

const copyToClipboard = async (text) => {
  await navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

const handleOverlayClick = (e) => {
  if (e.target === e.currentTarget) {
    emit('close')
  }
}

const formatDate = (dateStr) => {
  if (!dateStr) return 'Never'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })
}

// Workstream handlers
const handleAddWorkstream = () => {
  const name = newWorkstreamName.value.trim()
  if (!name) return
  emit('add-workstream', { name, color: newWorkstreamColor.value })
  newWorkstreamName.value = ''
  newWorkstreamColor.value = WORKSTREAM_COLORS[0]
}

const handleDeleteWorkstream = (wsName) => {
  emit('delete-workstream', wsName)
}

// Tag handlers
const startRenameTag = (tag) => {
  renamingTag.value = tag
  renameValue.value = tag
}

const confirmRenameTag = () => {
  const newName = renameValue.value.trim()
  if (!newName || newName === renamingTag.value) {
    renamingTag.value = null
    return
  }
  emit('rename-tag', { oldName: renamingTag.value, newName })
  renamingTag.value = null
  renameValue.value = ''
}

const cancelRenameTag = () => {
  renamingTag.value = null
  renameValue.value = ''
}

const handleDeleteTag = (tag) => {
  emit('delete-tag', tag)
}

const toggleTagColorPicker = (tag) => {
  coloringTag.value = coloringTag.value === tag ? null : tag
}

const handleRecolorTag = (tag, color) => {
  emit('recolor-tag', { tagName: tag, color })
  coloringTag.value = null
}

// Day visibility
const handleToggleDay = (dayId) => {
  emit('toggle-day', dayId)
}

const isDayVisible = (dayId) => {
  return !props.hiddenDays.includes(dayId)
}

// API guides
const claudeGuide = computed(() =>
`When the user asks you to create a task, make an HTTP POST request:

POST ${apiEndpoint.value}
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{"title": "Task name", "notes": "Optional details", "location": "today"}

When the user asks to see their tasks, make an HTTP GET request:

GET ${apiEndpoint.value}
Authorization: Bearer YOUR_API_KEY

Optional query params: ?location=today&completed=false

Valid locations: today, this-week, monday, tuesday, wednesday, thursday, friday, saturday, sunday, next-week, later`)

const chatgptGuide = computed(() =>
`When I ask you to create a task, make an HTTP POST request to my task manager API:

POST ${apiEndpoint.value}
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

Body: {"title": "Task name", "notes": "Optional details", "location": "today"}

When I ask to see my tasks, make an HTTP GET request:

GET ${apiEndpoint.value}
Authorization: Bearer YOUR_API_KEY

Optional query params: ?location=today&completed=false

Valid locations: today, this-week, monday-sunday, next-week, later
"today" maps to the current day of the week.`)

const siriGuide = computed(() =>
`1. Open the Shortcuts app on your iPhone/iPad/Mac
2. Tap "+" to create a new shortcut
3. Add an "Ask for Input" action (type: Text, prompt: "What's the task?")
4. Add a "Get Contents of URL" action:
   - URL: ${apiEndpoint.value}
   - Method: POST
   - Headers: Authorization = Bearer YOUR_API_KEY
   - Headers: Content-Type = application/json
   - Request Body (JSON):
     title = Provided Input
     location = today
5. Name the shortcut "Add Task" and tap Done
6. Say "Hey Siri, Add Task" to use it!

To read tasks, create a second shortcut:
1. Add "Get Contents of URL" with method GET
2. URL: ${apiEndpoint.value}?location=today&completed=false
3. Headers: Authorization = Bearer YOUR_API_KEY
4. Add "Show Result" action to display the response`)

const activeTab = ref('claude')
</script>

<template>
  <div v-if="show" class="modal-overlay" @click="handleOverlayClick">
    <div class="modal settings-modal">
      <div class="modal-header">
        <h2 class="modal-title">Settings</h2>
        <button class="modal-close" @click="emit('close')">&times;</button>
      </div>

      <!-- Section tabs -->
      <div class="settings-tabs">
        <button
          class="settings-tab"
          :class="{ active: activeSection === 'days' }"
          @click="activeSection = 'days'"
        >Days</button>
        <button
          class="settings-tab"
          :class="{ active: activeSection === 'workstreams' }"
          @click="activeSection = 'workstreams'"
        >Workstreams</button>
        <button
          class="settings-tab"
          :class="{ active: activeSection === 'tags' }"
          @click="activeSection = 'tags'"
        >Tags</button>
        <button
          class="settings-tab"
          :class="{ active: activeSection === 'api' }"
          @click="activeSection = 'api'"
        >API</button>
      </div>

      <div class="modal-body">
        <!-- ═══ Visible Days Section ═══ -->
        <section v-if="activeSection === 'days'" class="settings-section">
          <h3 class="section-title">Visible Days</h3>
          <p class="section-desc">
            Choose which day columns appear in your week view.
          </p>

          <div class="day-toggle-list">
            <div
              v-for="col in dayColumns"
              :key="col.id"
              class="day-toggle-row"
            >
              <span class="day-toggle-label">{{ col.label }}</span>
              <button
                class="day-toggle-switch"
                :class="{ 'is-on': isDayVisible(col.id) }"
                @click="handleToggleDay(col.id)"
                :title="isDayVisible(col.id) ? 'Hide ' + col.label : 'Show ' + col.label"
              >
                <span class="day-toggle-knob"></span>
              </button>
            </div>
          </div>
        </section>

        <!-- ═══ Workstreams Section ═══ -->
        <section v-if="activeSection === 'workstreams'" class="settings-section">
          <h3 class="section-title">Workstreams</h3>
          <p class="section-desc">
            Create workstreams to organize your tasks. Workstreams persist even when they have no tasks.
          </p>

          <!-- Existing workstreams -->
          <div v-if="workstreams.length > 0" class="ws-list">
            <div
              v-for="ws in workstreams"
              :key="ws.name"
              class="ws-list-item"
            >
              <div
                class="ws-list-swatch"
                :style="{ backgroundColor: ws.color.bg, borderColor: ws.color.text }"
              ></div>
              <span class="ws-list-name">{{ ws.name }}</span>
              <button
                class="ws-list-delete"
                @click="handleDeleteWorkstream(ws.name)"
                title="Delete workstream"
              >&times;</button>
            </div>
          </div>
          <p v-else class="ws-empty">No workstreams yet.</p>

          <!-- Add workstream form -->
          <div class="ws-add-form">
            <div class="ws-add-row">
              <input
                v-model="newWorkstreamName"
                class="form-input ws-name-input"
                placeholder="New workstream name"
                @keydown.enter="handleAddWorkstream"
              />
              <button
                class="btn-primary ws-add-btn"
                @click="handleAddWorkstream"
                :disabled="!newWorkstreamName.trim()"
              >Add</button>
            </div>
            <div class="ws-color-select">
              <button
                v-for="(color, index) in WORKSTREAM_COLORS"
                :key="index"
                class="ws-color-dot"
                :class="{ 'is-selected': newWorkstreamColor.bg === color.bg }"
                :style="{ backgroundColor: color.bg, borderColor: color.text }"
                :title="color.name"
                @click="newWorkstreamColor = color"
              />
            </div>
          </div>
        </section>

        <!-- ═══ Tags Section ═══ -->
        <section v-if="activeSection === 'tags'" class="settings-section">
          <h3 class="section-title">Tags</h3>
          <p class="section-desc">
            Manage tags used across your tasks. Renaming or deleting a tag updates all tasks that use it.
          </p>

          <div v-if="allTags.length > 0" class="tag-manage-list">
            <div
              v-for="tag in allTags"
              :key="tag"
              class="tag-manage-item-wrapper"
            >
              <div class="tag-manage-item">
                <!-- Normal display -->
                <template v-if="renamingTag !== tag">
                  <button
                    class="tag-color-swatch"
                    :style="{ backgroundColor: getTagColor(tag).bg, borderColor: getTagColor(tag).text }"
                    :title="'Change color for ' + tag"
                    @click="toggleTagColorPicker(tag)"
                  />
                  <span
                    class="tag-manage-pill"
                    :style="{
                      backgroundColor: getTagColor(tag).bg,
                      color: getTagColor(tag).text
                    }"
                  >{{ tag }}</span>
                  <span class="tag-manage-count">{{ tagCounts[tag] || 0 }} task{{ (tagCounts[tag] || 0) !== 1 ? 's' : '' }}</span>
                  <button
                    class="tag-manage-action"
                    @click="startRenameTag(tag)"
                    title="Rename tag"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button
                    class="tag-manage-action delete"
                    @click="handleDeleteTag(tag)"
                    title="Delete tag from all tasks"
                  >&times;</button>
                </template>

                <!-- Rename mode -->
                <template v-else>
                  <input
                    v-model="renameValue"
                    class="form-input tag-rename-input"
                    @keydown.enter="confirmRenameTag"
                    @keydown.escape="cancelRenameTag"
                    autofocus
                  />
                  <button class="tag-manage-action save" @click="confirmRenameTag" title="Save">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                  <button class="tag-manage-action" @click="cancelRenameTag" title="Cancel">&times;</button>
                </template>
              </div>

              <!-- Expandable color picker -->
              <div v-if="coloringTag === tag" class="tag-color-picker">
                <button
                  v-for="(color, index) in TAG_COLORS"
                  :key="index"
                  class="ws-color-dot"
                  :class="{ 'is-selected': getTagColor(tag).bg === color.bg }"
                  :style="{ backgroundColor: color.bg, borderColor: color.text }"
                  :title="color.name"
                  @click="handleRecolorTag(tag, color)"
                />
              </div>
            </div>
          </div>
          <p v-else class="ws-empty">No tags in use.</p>
        </section>

        <!-- ═══ API Key Section ═══ -->
        <section v-if="activeSection === 'api'" class="settings-section">
          <h3 class="section-title">AI Assistant API Key</h3>
          <p class="section-desc">
            Generate an API key to let Claude, ChatGPT, or Siri create and read tasks on your behalf.
          </p>

          <!-- Newly generated key (shown once) -->
          <div v-if="newlyGeneratedKey" class="key-reveal">
            <div class="key-reveal-warning">
              Copy this key now — it won't be shown again.
            </div>
            <div class="key-display">
              <code class="key-value">{{ newlyGeneratedKey }}</code>
              <button class="copy-btn" @click="copyToClipboard(newlyGeneratedKey)">
                {{ copied ? 'Copied!' : 'Copy' }}
              </button>
            </div>
          </div>

          <!-- Existing key info -->
          <div v-else-if="hasKey" class="key-info">
            <div class="key-meta">
              <span class="key-prefix">{{ keyMeta.prefix }}</span>
              <span class="key-date">Created {{ formatDate(keyMeta.createdAt) }}</span>
              <span class="key-date" v-if="keyMeta.lastUsedAt">Last used {{ formatDate(keyMeta.lastUsedAt) }}</span>
            </div>
            <div class="key-actions">
              <button
                v-if="!showRevokeConfirm"
                class="btn-danger-outline"
                @click="showRevokeConfirm = true"
              >
                Revoke & Regenerate
              </button>
              <div v-else class="revoke-confirm">
                <span class="revoke-warning">This will invalidate your current key.</span>
                <button class="btn-danger" @click="handleRevoke" :disabled="isRevoking">
                  {{ isRevoking ? 'Revoking...' : 'Confirm Revoke' }}
                </button>
                <button class="btn-secondary" @click="showRevokeConfirm = false">Cancel</button>
              </div>
            </div>
          </div>

          <!-- No key yet -->
          <div v-else class="key-empty">
            <button class="btn-primary" @click="handleGenerate" :disabled="isGenerating">
              {{ isGenerating ? 'Generating...' : 'Generate API Key' }}
            </button>
          </div>

          <!-- Setup Guides -->
          <div v-if="hasKey || newlyGeneratedKey" class="api-guides">
            <h3 class="section-title" style="margin-top: 24px;">Setup Guides</h3>

            <div class="guide-tabs">
              <button
                class="guide-tab"
                :class="{ active: activeTab === 'claude' }"
                @click="activeTab = 'claude'"
              >Claude</button>
              <button
                class="guide-tab"
                :class="{ active: activeTab === 'chatgpt' }"
                @click="activeTab = 'chatgpt'"
              >ChatGPT</button>
              <button
                class="guide-tab"
                :class="{ active: activeTab === 'siri' }"
                @click="activeTab = 'siri'"
              >Siri</button>
            </div>

            <div class="guide-content">
              <div v-if="activeTab === 'claude'" class="guide-panel">
                <p class="guide-intro">Add this to Claude's custom instructions or system prompt:</p>
                <div class="guide-code-wrapper">
                  <pre class="guide-code">{{ claudeGuide }}</pre>
                  <button class="copy-btn copy-btn-sm" @click="copyToClipboard(claudeGuide)">
                    {{ copied ? 'Copied!' : 'Copy' }}
                  </button>
                </div>
              </div>

              <div v-if="activeTab === 'chatgpt'" class="guide-panel">
                <p class="guide-intro">Add this to ChatGPT's custom instructions (Settings &rarr; Personalization &rarr; Custom instructions):</p>
                <div class="guide-code-wrapper">
                  <pre class="guide-code">{{ chatgptGuide }}</pre>
                  <button class="copy-btn copy-btn-sm" @click="copyToClipboard(chatgptGuide)">
                    {{ copied ? 'Copied!' : 'Copy' }}
                  </button>
                </div>
              </div>

              <div v-if="activeTab === 'siri'" class="guide-panel">
                <p class="guide-intro">Create an Apple Shortcut to use with Siri:</p>
                <div class="guide-code-wrapper">
                  <pre class="guide-code">{{ siriGuide }}</pre>
                  <button class="copy-btn copy-btn-sm" @click="copyToClipboard(siriGuide)">
                    {{ copied ? 'Copied!' : 'Copy' }}
                  </button>
                </div>
              </div>

              <p class="guide-note">
                Replace <code>YOUR_API_KEY</code> with your key above.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-modal {
  max-width: 520px;
}

/* Section tabs */
.settings-tabs {
  display: flex;
  gap: 2px;
  padding: 0 22px;
  border-bottom: 1px solid var(--color-border);
}

.settings-tab {
  padding: 10px 16px;
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--color-text-muted);
  border-bottom: 2px solid transparent;
  transition: all var(--transition);
  background: none;
  margin-bottom: -1px;
}

.settings-tab.active {
  color: var(--color-text);
  border-bottom-color: var(--color-primary);
}

.settings-tab:hover:not(.active) {
  color: var(--color-text-secondary);
}

.settings-section {
  margin-bottom: 28px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 0.95rem;
  font-weight: 600;
  margin-bottom: 6px;
  letter-spacing: -0.01em;
}

.section-desc {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  margin-bottom: 14px;
  line-height: 1.5;
}

/* ── Day visibility toggles ── */
.day-toggle-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.day-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--color-bg);
  border-radius: var(--radius-md);
}

.day-toggle-label {
  font-size: 0.88rem;
  font-weight: 500;
}

.day-toggle-switch {
  width: 44px;
  height: 24px;
  border-radius: 12px;
  background: var(--color-border);
  position: relative;
  cursor: pointer;
  transition: background 0.2s;
  border: none;
  padding: 0;
}

.day-toggle-switch.is-on {
  background: var(--color-primary);
}

.day-toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: white;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.day-toggle-switch.is-on .day-toggle-knob {
  transform: translateX(20px);
}

/* ── Workstream list ── */
.ws-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 16px;
}

.ws-list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--color-bg);
  border-radius: var(--radius-md);
}

.ws-list-swatch {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 2px solid;
  flex-shrink: 0;
}

.ws-list-name {
  flex: 1;
  font-size: 0.88rem;
  font-weight: 500;
}

.ws-list-delete {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: 1.1rem;
  background: none;
  border: none;
  cursor: pointer;
  transition: all var(--transition);
}

.ws-list-delete:hover {
  background: #fef2f2;
  color: var(--color-danger);
}

.ws-empty {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  margin-bottom: 16px;
}

.ws-add-form {
  border-top: 1px solid var(--color-border);
  padding-top: 14px;
}

.ws-add-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.ws-name-input {
  flex: 1;
}

.ws-add-btn {
  padding: 8px 16px;
  background: var(--color-primary);
  color: #fff;
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  font-weight: 500;
  transition: background var(--transition);
  border: none;
  cursor: pointer;
}

.ws-add-btn:hover {
  background: var(--color-primary-hover);
}

.ws-add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ws-color-select {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ws-color-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.ws-color-dot:hover {
  transform: scale(1.15);
}

.ws-color-dot.is-selected {
  border-style: solid;
  border-width: 2px;
  box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 4px currentColor;
}

/* ── Tag management ── */
.tag-manage-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tag-manage-item-wrapper {
  background: var(--color-bg);
  border-radius: var(--radius-md);
}

.tag-manage-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
}

.tag-color-swatch {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 2px solid;
  flex-shrink: 0;
  cursor: pointer;
  transition: all 0.15s ease;
  padding: 0;
  background: none;
}

.tag-color-swatch:hover {
  transform: scale(1.15);
}

.tag-color-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px 10px;
  border-top: 1px solid var(--color-border);
}

.tag-manage-pill {
  font-size: 0.78rem;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 4px;
}

.tag-manage-count {
  flex: 1;
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.tag-manage-action {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  background: none;
  border: none;
  cursor: pointer;
  transition: all var(--transition);
  font-size: 1.1rem;
}

.tag-manage-action:hover {
  background: var(--color-border);
  color: var(--color-text);
}

.tag-manage-action.delete:hover {
  background: #fef2f2;
  color: var(--color-danger);
}

.tag-manage-action.save {
  color: var(--color-primary);
}

.tag-manage-action.save:hover {
  background: rgba(71, 85, 105, 0.08);
}

.tag-rename-input {
  flex: 1;
  padding: 4px 8px;
  font-size: 0.85rem;
}

/* ── API Key styles ── */
.key-reveal {
  background: #fffbeb;
  border: 1px solid #fbbf24;
  border-radius: var(--radius-md);
  padding: 14px;
}

.key-reveal-warning {
  font-size: 0.8rem;
  font-weight: 600;
  color: #92400e;
  margin-bottom: 10px;
}

.key-display {
  display: flex;
  align-items: center;
  gap: 10px;
}

.key-value {
  flex: 1;
  font-size: 0.82rem;
  background: #fff;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  word-break: break-all;
  font-family: 'IBM Plex Mono', monospace;
}

.key-info {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 14px;
}

.key-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.key-prefix {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.85rem;
  font-weight: 600;
  background: var(--color-surface);
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}

.key-date {
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.key-actions {
  display: flex;
  gap: 8px;
}

.revoke-confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.revoke-warning {
  font-size: 0.78rem;
  color: var(--color-danger);
  width: 100%;
}

.key-empty {
  display: flex;
}

/* Buttons */
.btn-primary {
  background: var(--color-primary);
  color: #fff;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  font-weight: 500;
  transition: background var(--transition);
  border: none;
  cursor: pointer;
}

.btn-primary:hover {
  background: var(--color-primary-hover);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-danger {
  background: var(--color-danger);
  color: #fff;
  padding: 6px 14px;
  border-radius: var(--radius-md);
  font-size: 0.82rem;
  font-weight: 500;
  border: none;
  cursor: pointer;
}

.btn-danger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-danger-outline {
  border: 1px solid var(--color-danger);
  color: var(--color-danger);
  padding: 6px 14px;
  border-radius: var(--radius-md);
  font-size: 0.82rem;
  font-weight: 500;
  background: transparent;
  cursor: pointer;
}

.btn-danger-outline:hover {
  background: #fef2f2;
}

.btn-secondary {
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  padding: 6px 14px;
  border-radius: var(--radius-md);
  font-size: 0.82rem;
  background: transparent;
  cursor: pointer;
}

.btn-secondary:hover {
  background: var(--color-bg);
}

.copy-btn {
  background: var(--color-primary);
  color: #fff;
  padding: 6px 14px;
  border-radius: var(--radius-md);
  font-size: 0.82rem;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
  border: none;
  cursor: pointer;
}

.copy-btn:hover {
  background: var(--color-primary-hover);
}

.copy-btn-sm {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 10px;
  font-size: 0.75rem;
}

/* Guide tabs */
.guide-tabs {
  display: flex;
  gap: 2px;
  background: var(--color-bg);
  border-radius: var(--radius-md);
  padding: 3px;
  margin-bottom: 14px;
}

.guide-tab {
  flex: 1;
  padding: 7px 12px;
  font-size: 0.82rem;
  font-weight: 500;
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  transition: all var(--transition);
  background: none;
  border: none;
  cursor: pointer;
}

.guide-tab.active {
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: var(--shadow-sm);
}

.guide-tab:hover:not(.active) {
  color: var(--color-text);
}

.guide-panel {
  margin-bottom: 10px;
}

.guide-intro {
  font-size: 0.82rem;
  color: var(--color-text-secondary);
  margin-bottom: 10px;
}

.guide-code-wrapper {
  position: relative;
}

.guide-code {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 14px;
  padding-right: 70px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.75rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
  max-height: 240px;
  overflow-y: auto;
}

.guide-note {
  font-size: 0.78rem;
  color: var(--color-text-muted);
  margin-top: 10px;
}

.guide-note code {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.75rem;
  background: var(--color-bg);
  padding: 1px 5px;
  border-radius: var(--radius-sm);
}

/* Mobile */
@media (max-width: 600px) {
  .settings-modal {
    max-width: none;
  }

  .key-display {
    flex-direction: column;
  }

  .copy-btn {
    align-self: flex-start;
  }

  .settings-tabs {
    padding: 0 16px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .settings-tab {
    padding: 10px 12px;
    white-space: nowrap;
  }
}
</style>
