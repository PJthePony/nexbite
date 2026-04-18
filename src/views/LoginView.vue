<script setup>
import { ref } from 'vue'
import { useAuth } from '../composables/useAuth'

const { signIn } = useAuth()

const email = ref('')
const error = ref('')
const linkSent = ref(false)
const submitting = ref(false)

const handleSubmit = async () => {
  error.value = ''
  submitting.value = true

  try {
    await signIn(email.value.trim())
    linkSent.value = true
  } catch (err) {
    error.value = err.message || "Something got lost on the way to the docks. Try again."
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login-container">
    <div class="string-from-above" aria-hidden="true"></div>

    <div class="login-card">
      <div class="login-logo">
        <div class="login-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D4246F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        </div>
        <span class="login-app-name">Tessio</span>
      </div>
      <p class="login-subtitle">The family's organizer. A week at a time, one bite at a time.</p>

      <div v-if="linkSent" class="link-sent">
        <div class="link-sent-rule" aria-hidden="true"></div>
        <h2 class="link-sent-title">Word has been sent</h2>
        <p class="link-sent-body">A link is on its way to <strong>{{ email }}</strong>.</p>
        <p class="link-sent-hint">Click it and you're in. You can close this tab.</p>
        <button class="login-btn secondary" @click="linkSent = false; email = ''">
          Use a different address
        </button>
      </div>

      <form v-else @submit.prevent="handleSubmit" class="login-form">
        <div class="form-group">
          <label for="email">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            placeholder="you@example.com"
            required
            autofocus
            :disabled="submitting"
          />
        </div>

        <div v-if="error" class="login-error">{{ error }}</div>

        <button
          type="submit"
          class="login-btn primary"
          :disabled="submitting || !email.trim()"
        >
          {{ submitting ? 'Sending…' : 'Send word' }}
        </button>

        <p class="login-hint">
          No password. We'll send a link you can use once.
        </p>
      </form>

      <div class="login-legal">
        <a href="https://tanzillo.ai/privacy.html" target="_blank">Privacy</a>
        <span class="legal-sep" aria-hidden="true">·</span>
        <a href="https://tanzillo.ai/terms.html" target="_blank">Terms</a>
      </div>
    </div>

    <div class="login-foot">
      <span>tanzillo.ai · the family</span>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background-color: var(--color-bg);
  position: relative;
  overflow: hidden;
}

/* Vertical rule descending from above — the "string from above" motif */
.string-from-above {
  position: absolute;
  top: 0;
  left: 50%;
  width: 1px;
  height: calc(50% - 120px);
  background: linear-gradient(to bottom, transparent, var(--color-accent) 60%, var(--color-accent));
  opacity: 0.4;
}

.login-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 48px 40px;
  width: 100%;
  max-width: 440px;
  text-align: center;
  position: relative;
  z-index: 1;
}

.login-logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.login-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-xl);
  background: rgba(212, 36, 111, 0.08);
  border: 1px solid rgba(212, 36, 111, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-app-name {
  font-family: var(--nxb-font-serif);
  font-style: italic;
  font-weight: 600;
  font-size: 1.75rem;
  font-variation-settings: 'opsz' 48, 'WONK' 1;
  letter-spacing: -0.03em;
  color: var(--color-accent);
  line-height: 1;
}

.login-subtitle {
  font-family: var(--nxb-font-serif);
  font-style: italic;
  color: var(--color-text-muted);
  font-size: 1rem;
  line-height: 1.5;
  max-width: 32ch;
  margin: 0 auto 32px;
  font-variation-settings: 'opsz' 24;
  text-wrap: balance;
}

.login-form {
  text-align: left;
}

.form-group {
  margin-bottom: 18px;
}

.form-group label {
  display: block;
  font-family: inherit;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--color-text-muted);
  margin-bottom: 8px;
}

.form-group input {
  width: 100%;
  padding: 11px 12px;
  font-family: inherit;
  font-size: 0.95rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  transition: border-color var(--transition), box-shadow var(--transition);
}

.form-group input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-primary-ring);
}

.form-group input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.login-btn {
  width: 100%;
  padding: 12px 16px;
  font-family: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition);
}

.login-btn.primary {
  background: var(--color-primary);
  color: var(--sage-50);
}

.login-btn.primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-suspend);
}

.login-btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.login-btn.secondary {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  margin-top: 16px;
}

.login-btn.secondary:hover {
  background: var(--color-primary-ghost);
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.login-error {
  background: var(--danger-100);
  color: var(--color-danger);
  padding: 10px 12px;
  border-radius: var(--radius-md);
  font-family: var(--nxb-font-serif);
  font-style: italic;
  font-size: 0.85rem;
  line-height: 1.4;
  margin-bottom: 16px;
}

.login-hint {
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.74rem;
  margin-top: 14px;
  font-style: italic;
  font-family: var(--nxb-font-serif);
}

.link-sent {
  padding: 6px 0 2px;
}

.link-sent-rule {
  width: 40px;
  height: 1px;
  background: var(--color-accent);
  margin: 4px auto 20px;
  opacity: 0.7;
}

.link-sent-title {
  font-family: var(--nxb-font-serif);
  font-style: italic;
  font-size: 1.5rem;
  font-weight: 600;
  font-variation-settings: 'opsz' 48, 'WONK' 1;
  letter-spacing: -0.025em;
  color: var(--color-text);
  margin: 0 0 12px;
}

.link-sent-body {
  color: var(--color-text-secondary);
  font-size: 0.9rem;
  margin: 0 0 4px;
}

.link-sent-body strong {
  color: var(--color-text);
  font-weight: 600;
}

.link-sent-hint {
  color: var(--color-text-muted);
  font-size: 0.78rem;
  font-style: italic;
  font-family: var(--nxb-font-serif);
  margin: 12px 0 4px;
}

.login-legal {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--color-border);
}

.legal-sep {
  color: var(--color-text-muted);
  font-size: 0.72rem;
}

.login-legal a {
  font-family: inherit;
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-decoration: none;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 600;
  transition: color var(--transition);
}

.login-legal a:hover {
  color: var(--color-accent);
}

.login-foot {
  margin-top: 28px;
  font-family: inherit;
  font-size: 0.66rem;
  color: var(--color-text-muted);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  z-index: 1;
}

@media (max-width: 640px) {
  .login-card {
    padding: 36px 24px;
  }

  .login-btn,
  .form-group input {
    min-height: 48px;
  }
}
</style>
