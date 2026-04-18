<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

const goToLogin = () => {
  router.push({ name: 'Login' })
}
</script>

<template>
  <div class="landing">
    <!-- Ambient particles -->
    <div class="particles" aria-hidden="true">
      <div class="particle" v-for="n in 15" :key="n"></div>
    </div>

    <!-- Nav -->
    <nav class="landing-nav">
      <span class="nav-brand">tanzillo.ai</span>
      <div class="nav-status">
        <span class="status-dot" aria-hidden="true"></span>
        <span>Tending to family business</span>
      </div>
    </nav>

    <!-- Hero -->
    <section class="hero">
      <div class="string-from-above" aria-hidden="true"></div>
      <div class="hero-content">
        <div class="hero-eyebrow">The family · organizer</div>
        <h1 class="hero-headline">Tessio <em>keeps the week</em>.</h1>
        <p class="hero-description">
          My wife has a system for staying organized. I reverse-engineered it, added some AI, and now it runs my whole operation. She has not received credit.
        </p>
        <button class="sign-in-btn" @click="goToLogin">
          Open the door
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </button>
      </div>
    </section>

    <!-- Footer -->
    <footer class="landing-footer">
      <span class="footer-copy">© 2026 tanzillo.ai · none of this is for sale</span>
      <div class="footer-links">
        <a href="https://tanzillo.ai/privacy.html" target="_blank">Privacy</a>
        <span aria-hidden="true">·</span>
        <a href="https://tanzillo.ai/terms.html" target="_blank">Terms</a>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.landing {
  font-family: var(--nxb-font-family);
  background: var(--navy-600);
  color: var(--sage-200);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Pinstripe overlay — stage-scrim on dark surface */
.landing::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-image: repeating-linear-gradient(
    90deg,
    transparent 0,
    transparent 39px,
    rgba(240, 245, 243, 0.015) 39px,
    rgba(240, 245, 243, 0.015) 40px
  );
}

/* ── Particles ── */
.particles {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.particle {
  position: absolute;
  width: 2px;
  height: 2px;
  background: rgba(212, 36, 111, 0.08);
  border-radius: 50%;
  animation: particleFloat linear infinite;
}

.particle:nth-child(1)  { left: 5%;  top: 10%; animation-duration: 28s; }
.particle:nth-child(2)  { left: 15%; top: 80%; animation-duration: 22s; animation-delay: -4s;  width: 3px; height: 3px; background: rgba(13, 92, 82, 0.06); }
.particle:nth-child(3)  { left: 25%; top: 30%; animation-duration: 32s; animation-delay: -8s; }
.particle:nth-child(4)  { left: 35%; top: 60%; animation-duration: 26s; animation-delay: -2s;  background: rgba(13, 92, 82, 0.05); }
.particle:nth-child(5)  { left: 45%; top: 15%; animation-duration: 30s; animation-delay: -12s; width: 3px; height: 3px; }
.particle:nth-child(6)  { left: 55%; top: 70%; animation-duration: 24s; animation-delay: -6s;  background: rgba(13, 92, 82, 0.06); }
.particle:nth-child(7)  { left: 65%; top: 40%; animation-duration: 34s; animation-delay: -10s; }
.particle:nth-child(8)  { left: 75%; top: 85%; animation-duration: 20s; animation-delay: -3s;  background: rgba(212, 36, 111, 0.05); }
.particle:nth-child(9)  { left: 85%; top: 25%; animation-duration: 28s; animation-delay: -7s; }
.particle:nth-child(10) { left: 92%; top: 55%; animation-duration: 36s; animation-delay: -14s; width: 3px; height: 3px; }
.particle:nth-child(11) { left: 10%; top: 45%; animation-duration: 25s; animation-delay: -5s;  background: rgba(212, 36, 111, 0.06); }
.particle:nth-child(12) { left: 40%; top: 90%; animation-duration: 30s; animation-delay: -9s; }
.particle:nth-child(13) { left: 70%; top: 5%;  animation-duration: 27s; animation-delay: -11s; background: rgba(13, 92, 82, 0.04); }
.particle:nth-child(14) { left: 50%; top: 50%; animation-duration: 33s; animation-delay: -1s;  background: rgba(212, 36, 111, 0.1); }
.particle:nth-child(15) { left: 20%; top: 65%; animation-duration: 29s; animation-delay: -13s; }

@keyframes particleFloat {
  0%   { transform: translate(0, 0) scale(1);        opacity: 0; }
  10%  { opacity: 1; }
  50%  { transform: translate(60px, -120px) scale(1.5); opacity: 0.6; }
  90%  { opacity: 1; }
  100% { transform: translate(-30px, -240px) scale(1);  opacity: 0; }
}

/* ── Nav ── */
.landing-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  padding: 22px 40px;
  display: flex;
  align-items: center;
  gap: 14px;
  background: rgba(38, 60, 78, 0.4);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  pointer-events: none;
}

.landing-nav > * { pointer-events: auto; }

.nav-brand {
  font-family: var(--nxb-font-serif);
  font-weight: 700;
  font-size: 1.1rem;
  font-style: italic;
  font-variation-settings: 'opsz' 24, 'WONK' 1;
  letter-spacing: -0.02em;
  color: var(--fuchsia-600);
}

.nav-status {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.72rem;
  color: var(--sage-200);
  letter-spacing: 0.02em;
}

.status-dot {
  width: 6px;
  height: 6px;
  background: #22c55e;
  border-radius: 50%;
  animation: pulse 3s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.45; }
}

/* ── Hero ── */
.hero {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 1;
  padding: 24px;
}

/* Vertical string descending from the top */
.string-from-above {
  position: absolute;
  top: 0;
  left: 50%;
  width: 1px;
  height: 72px;
  background: linear-gradient(to bottom, transparent, var(--fuchsia-600));
  opacity: 0.55;
}

.hero-content {
  text-align: center;
  max-width: 640px;
  opacity: 0;
  transform: translateY(24px);
  animation: fadeSlideUp 1s cubic-bezier(0.16, 1, 0.3, 1) 0.25s forwards;
}

.hero-eyebrow {
  font-family: inherit;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.25em;
  color: var(--sage-600);
  margin-bottom: 28px;
}

.hero-headline {
  font-family: var(--nxb-font-serif);
  font-size: clamp(2.75rem, 6vw, 5rem);
  font-weight: 700;
  line-height: 1.04;
  letter-spacing: -0.04em;
  font-variation-settings: 'opsz' 144, 'WONK' 1;
  color: var(--sage-100);
  margin: 0 0 24px;
  text-wrap: balance;
}

.hero-headline em {
  font-style: italic;
  color: var(--fuchsia-600);
  font-weight: 700;
}

.hero-description {
  font-family: var(--nxb-font-serif);
  font-style: italic;
  font-size: 1.1rem;
  line-height: 1.6;
  color: var(--navy-100);
  max-width: 40ch;
  margin: 0 auto 36px;
  font-variation-settings: 'opsz' 24;
  text-wrap: balance;
}

.sign-in-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 14px 28px;
  background: var(--fuchsia-600);
  color: var(--sage-50);
  border: none;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background var(--nxb-dur-2) var(--nxb-ease-out-expo),
              transform var(--nxb-dur-2) var(--nxb-ease-out-expo),
              box-shadow var(--nxb-dur-2) var(--nxb-ease-out-expo);
}

.sign-in-btn:hover {
  background: var(--fuchsia-800);
  transform: translateY(-1px);
  box-shadow: 0 18px 24px -16px rgba(212, 36, 111, 0.55);
}

.sign-in-btn:active {
  transform: translateY(0);
}

@keyframes fadeSlideUp {
  to { opacity: 1; transform: translateY(0); }
}

/* ── Footer ── */
.landing-footer {
  position: relative;
  z-index: 1;
  padding: 28px 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid rgba(240, 245, 243, 0.08);
}

.footer-copy {
  font-size: 0.72rem;
  color: var(--navy-100);
  letter-spacing: 0.02em;
}

.footer-links {
  display: flex;
  align-items: center;
  gap: 12px;
}

.footer-links a {
  font-size: 0.7rem;
  color: var(--navy-100);
  text-decoration: none;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 600;
  transition: color var(--nxb-dur-2) var(--nxb-ease-out-expo);
}

.footer-links a:hover {
  color: var(--fuchsia-600);
}

/* ── Mobile ── */
@media (max-width: 640px) {
  .landing-nav {
    padding: 18px 20px;
  }

  .landing-footer {
    padding: 20px 18px;
    gap: 12px;
    flex-direction: column;
    text-align: center;
  }

  .hero-description {
    font-size: 1rem;
  }
}
</style>
