(() => {
  const FUNCTION_URL = '/.netlify/functions/analyse';

  // After deploying Firebase functions (`firebase deploy --only functions`),
  // paste the generated URL here, e.g.:
  //   https://generatepdf-abc123-uc.a.run.app
  const PDF_FUNCTION_URL = '';

  const form    = document.getElementById('checker-form');
  const input   = document.getElementById('url-input');
  const button  = document.querySelector('#checker-form button');
  const results = document.getElementById('results');

  // Enable the form
  input.disabled = false;
  button.disabled = false;
  button.removeAttribute('aria-disabled');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = input.value.trim();
    if (!url) return;

    // Normalise: add https:// if no protocol given
    const targetUrl = /^https?:\/\//i.test(url) ? url : 'https://' + url;

    setLoading(true);
    clearResults();

    try {
      const res  = await fetch(FUNCTION_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url: targetUrl }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        renderError(data.error || 'Something went wrong. Please try again.');
      } else {
        renderResults(data);
      }
    } catch {
      renderError('Could not connect to the analysis service. Please try again.');
    } finally {
      setLoading(false);
    }
  });

  function setLoading(on) {
    form.classList.toggle('is-loading', on);
    button.disabled = on;
    if (on) {
      button.innerHTML = '<span class="spinner" aria-hidden="true"></span> Analysing…';
    } else {
      button.textContent = 'Analyse';
    }
  }

  function clearResults() {
    results.innerHTML = '';
    results.className = '';
  }

  function renderError(message) {
    results.className = 'results-error';
    results.innerHTML = `
      <div class="result-card error-card" role="alert">
        <div class="error-icon" aria-hidden="true">⚠️</div>
        <p>${escHtml(message)}</p>
      </div>`;
  }

  function renderResults(data) {
    const vCount      = data.violations.length;
    const iCount      = data.incomplete.length;
    const impactOrder = ['critical', 'serious', 'moderate', 'minor'];

    // Sort violations by impact severity
    const sorted = [...data.violations].sort(
      (a, b) => impactOrder.indexOf(a.impact) - impactOrder.indexOf(b.impact),
    );

    const pdfBtn = PDF_FUNCTION_URL
      ? `<button
           id="pdf-download-btn"
           class="pdf-download-btn"
           type="button"
           aria-label="Download PDF report for ${escHtml(data.url)}"
         >
           <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
             <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
             <polyline points="7 10 12 15 17 10"/>
             <line x1="12" y1="15" x2="12" y2="3"/>
           </svg>
           Download PDF Report
         </button>`
      : '';

    const summaryHtml = `
      <div class="results-summary" role="region" aria-label="Audit summary">
        <div class="summary-stat stat-violations">
          <span class="stat-number">${vCount}</span>
          <span class="stat-label">violation${vCount !== 1 ? 's' : ''}</span>
        </div>
        <div class="summary-stat stat-incomplete">
          <span class="stat-number">${iCount}</span>
          <span class="stat-label">need${iCount !== 1 ? '' : 's'} review</span>
        </div>
        <div class="summary-stat stat-passes">
          <span class="stat-number">${data.passCount}</span>
          <span class="stat-label">passed</span>
        </div>
        <div class="summary-url">
          Audited: <a href="${escHtml(data.url)}" target="_blank" rel="noopener">${escHtml(data.url)}</a>
        </div>
        ${pdfBtn}
      </div>`;

    const violationsHtml = vCount === 0
      ? '<p class="no-issues">No violations found.</p>'
      : sorted.map(renderRule).join('');

    const incompleteHtml = iCount === 0 ? '' : `
      <section class="results-section" aria-labelledby="incomplete-heading">
        <h3 id="incomplete-heading" class="section-heading">Needs Manual Review (${iCount})</h3>
        <p class="section-description">axe could not automatically determine if these pass or fail — check them manually.</p>
        ${data.incomplete.map((r) => renderRule(r, true)).join('')}
      </section>`;

    results.className = 'results-panel';
    results.innerHTML = `
      ${summaryHtml}
      <section class="results-section" aria-labelledby="violations-heading">
        <h3 id="violations-heading" class="section-heading">Violations (${vCount})</h3>
        ${violationsHtml}
      </section>
      ${incompleteHtml}`;

    // Attach PDF download handler after the DOM is updated
    if (PDF_FUNCTION_URL) {
      const pdfBtnEl = document.getElementById('pdf-download-btn');
      if (pdfBtnEl) {
        pdfBtnEl.addEventListener('click', () => downloadPdf(data, pdfBtnEl));
      }
    }
  }

  async function downloadPdf(data, btn) {
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Generating PDF…';

    try {
      const res = await fetch(PDF_FUNCTION_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const blob     = await res.blob();
      const blobUrl  = URL.createObjectURL(blob);
      const anchor   = document.createElement('a');
      const dateSlug = new Date().toISOString().slice(0, 10);
      anchor.href     = blobUrl;
      anchor.download = `a11y-report-${dateSlug}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(blobUrl);

      btn.innerHTML = '✓ Downloaded';
      setTimeout(() => {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
      }, 2500);
    } catch {
      btn.innerHTML = '⚠ PDF failed — try again';
      btn.disabled = false;
      setTimeout(() => { btn.innerHTML = originalHtml; }, 3000);
    }
  }

  function renderRule(rule, isIncomplete = false) {
    const impact    = rule.impact || 'minor';
    const nodeItems = rule.nodes.map((n) => `
      <div class="node-item">
        <code class="node-html">${escHtml(n.html)}</code>
        ${n.failureSummary ? `<p class="node-summary">${escHtml(n.failureSummary)}</p>` : ''}
      </div>`).join('');

    return `
      <details class="rule-item impact-${escHtml(impact)}">
        <summary>
          <span class="impact-badge">${escHtml(impact)}</span>
          <span class="rule-description">${escHtml(rule.description)}</span>
          <span class="rule-count">${rule.nodes.length} element${rule.nodes.length !== 1 ? 's' : ''}</span>
        </summary>
        <div class="rule-body">
          ${nodeItems}
          <a class="rule-help-link" href="${escHtml(rule.helpUrl)}" target="_blank" rel="noopener">
            How to fix ↗
          </a>
        </div>
      </details>`;
  }

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
