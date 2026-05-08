/**
 * cookie-consent.js
 * Google Consent Mode v2 defaults + GDPR cookie banner.
 *
 * Load this script BEFORE the Google Analytics / AdSense scripts
 * (but after the gtag dataLayer bootstrap snippet) so that the
 * deny-all defaults are already in place when those services fire.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'a11y_cookie_consent';

  /* ── 1. Apply consent state ─────────────────────────────────────── */

  function applyConsent(granted) {
    if (typeof window.gtag !== 'function') return;
    const val = granted ? 'granted' : 'denied';
    window.gtag('consent', 'update', {
      ad_storage:              val,
      ad_user_data:            val,
      ad_personalization:      val,
      analytics_storage:       val,
    });
  }

  /* ── 2. Safe localStorage helpers ──────────────────────────────── */
  // localStorage throws in private-browsing modes and when storage is full.

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_) {
      // Storage unavailable — consent won't persist, but the UI still works.
    }
  }

  /* ── 3. Check saved preference ──────────────────────────────────── */

  const saved = storageGet(STORAGE_KEY);

  if (saved === 'accepted') {
    // User already accepted — update consent and bail out.
    applyConsent(true);
    return;
  }

  if (saved === 'declined') {
    // User already declined — nothing to show, defaults remain denied.
    return;
  }

  /* ── 4. Build & show the banner ─────────────────────────────────── */

  function buildBanner() {
    const banner = document.createElement('div');
    banner.className = 'cookie-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Cookie consent');

    banner.innerHTML = `
      <p>
        We use cookies for analytics and personalised advertising (Google Analytics &amp; AdSense).
        See our <a href="/privacy.html">Privacy Policy</a> for details.
      </p>
      <div class="cookie-banner-actions">
        <button class="cookie-btn cookie-btn-decline" id="cookie-decline">Decline</button>
        <button class="cookie-btn cookie-btn-accept"  id="cookie-accept">Accept</button>
      </div>
    `;

    document.body.appendChild(banner);

    document.getElementById('cookie-accept').addEventListener('click', function () {
      storageSet(STORAGE_KEY, 'accepted');
      applyConsent(true);
      banner.remove();
    });

    document.getElementById('cookie-decline').addEventListener('click', function () {
      storageSet(STORAGE_KEY, 'declined');
      // consent remains denied — no update call needed
      banner.remove();
    });
  }

  // Wait for DOM to be ready before injecting the banner.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildBanner);
  } else {
    buildBanner();
  }
})();
