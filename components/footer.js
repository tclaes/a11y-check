import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

class A11yFooter extends LitElement {
  static styles = css`
    :host {
      display: block;
      background: var(--color-surface);
      border-top: 1px solid var(--color-border);
      padding: var(--space-3) var(--space-4);
      text-align: center;
      color: var(--color-muted);
      font-size: var(--text-sm);
    }
  
    a {
      color: var(--color-primary);
      text-decoration: underline;
    }

    a:hover {
      text-decoration: none;
    }
  `;

  render() {
    return html`
      <p>
        &copy; 2026 <strong>a11y-check.eu</strong> &mdash;
        Built with ♥ for a more accessible web &mdash;
        <a href="https://www.w3.org/WAI/standards-guidelines/wcag/" target="_blank" rel="noopener">WCAG Guidelines</a>
        &middot;
        <a href="https://github.com/dequelabs/axe-core" target="_blank" rel="noopener">axe-core</a>
      </p>
    `;
  }
}

customElements.define('a11y-footer', A11yFooter);
