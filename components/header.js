import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

class A11yHeader extends LitElement {
  static styles = css`
    :host {
      display: block;
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
      padding: 0 var(--space-4);
    }
  
    .header-inner {
      max-width: 1100px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 64px;
    }
  
    .logo {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      text-decoration: none;
      color: var(--color-text);
      font-weight: var(--font-bold);
      font-size: var(--text-xl);
    }
  
    .logo-badge {
      background: var(--color-primary);
      color: #fff;
      padding: var(--space-half) var(--space-1);
      border-radius: var(--radius-sm);
      font-size: var(--text-sm);
      font-weight: var(--font-extrabold);
      letter-spacing: 0.5px;
    }
  
    nav a {
      color: var(--color-muted);
      text-decoration: none;
      font-size: var(--text-base);
      padding: var(--space-half) var(--space-2);
      border-radius: var(--radius-sm);
      transition: color 0.15s, background 0.15s;
    }
  
    nav a:hover, nav a:focus {
      color: var(--color-primary);
      background: var(--color-primary-bg);
      outline: none;
    }
  `;

  render() {
    return html`
      <div class="header-inner">
        <a href="/" class="logo" aria-label="a11y-check home">
          <span class="logo-badge">a11y</span>
          check.eu
        </a>
        <nav aria-label="Main navigation">
          <a href="https://github.com/tclaes/a11y-check" target="_blank" rel="noopener">GitHub</a>
        </nav>
      </div>
    `;
  }
}

customElements.define('a11y-header', A11yHeader);
