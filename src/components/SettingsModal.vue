<script setup>
import { ref, computed, onMounted } from 'vue'
import { useApiKey } from '../composables/useApiKey'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close'])

const { keyMeta, hasKey, loadKey, generateKey, revokeKey } = useApiKey()

const activeTab = ref('claude')
const newlyGeneratedKey = ref(null)
const copied = ref(false)
const isGenerating = ref(false)
const isRevoking = ref(false)
const showRevokeConfirm = ref(false)

const apiEndpoint = computed(() => {
  const base = import.meta.env.VITE_SUPABASE_URL
  return `${base}/functions/v1/tasks-api`
})

onMounted(() => {
  loadKey()
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

Valid locations: today, this-week, monday, tuesday, wednesday, thursday, friday, next-week, later`)

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

Valid locations: today, this-week, monday-friday, next-week, later
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
</script>

<template>
  <div v-if="show" class="modal-overlay" @click="handleOverlayClick">
    <div class="modal settings-modal">
      <div class="modal-header">
        <h2 class="modal-title">Settings</h2>
        <button class="modal-close" @click="emit('close')">&times;</button>
      </div>

      <div class="modal-body">
        <!-- API Key Section -->
        <section class="settings-section">
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
        </section>

        <!-- Setup Guides Section -->
        <section v-if="hasKey || newlyGeneratedKey" class="settings-section">
          <h3 class="section-title">Setup Guides</h3>

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
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-modal {
  max-width: 520px;
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

/* Key reveal */
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

/* Key info (existing) */
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

/* Key empty */
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
}

.guide-tab.active {
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: var(--shadow-sm);
}

.guide-tab:hover:not(.active) {
  color: var(--color-text);
}

/* Guide content */
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
}
</style>
