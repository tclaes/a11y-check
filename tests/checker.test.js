// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const checkerSrc = readFileSync(resolve(__dirname, '../checker.js'), 'utf8');

// ── Fixtures ─────────────────────────────────────────────────────────────────

const makeRule = (overrides = {}) => ({
  id: 'image-alt',
  impact: 'critical',
  description: 'Images must have alternate text',
  helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/image-alt',
  nodes: [{ html: '<img src="logo.png">', failureSummary: 'Add an alt attribute' }],
  ...overrides,
});

const makeData = (overrides = {}) => ({
  url: 'https://example.com',
  violations: [makeRule()],
  incomplete: [],
  passCount: 5,
  ...overrides,
});

// ── Setup ─────────────────────────────────────────────────────────────────────

function boot() {
  document.body.innerHTML = `
    <form id="checker-form">
      <input id="url-input" type="url" disabled value="" />
      <button type="submit" disabled aria-disabled="true">Analyse</button>
    </form>
    <div id="results"></div>
  `;
  globalThis.fetch = vi.fn();
  // Execute the IIFE in the jsdom global scope
  // eslint-disable-next-line no-new-func
  new Function(checkerSrc)();
}

function getEl(sel) {
  return document.querySelector(sel);
}

async function submitForm(url) {
  getEl('#url-input').value = url;
  const form = getEl('#checker-form');
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  // flush microtasks
  await new Promise((r) => setTimeout(r, 0));
}

function mockFetchOk(data) {
  globalThis.fetch.mockResolvedValue({
    ok: true,
    json: async () => data,
  });
}

function mockFetchError(status, error) {
  globalThis.fetch.mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ error }),
  });
}

function mockFetchNetworkFailure() {
  globalThis.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
}

// ── Form initialisation ───────────────────────────────────────────────────────

describe('initialisation', () => {
  beforeEach(boot);

  it('enables the input on load', () => {
    expect(getEl('#url-input').disabled).toBe(false);
  });

  it('enables the submit button on load', () => {
    expect(getEl('#checker-form button').disabled).toBe(false);
  });

  it('removes aria-disabled from button', () => {
    expect(getEl('#checker-form button').hasAttribute('aria-disabled')).toBe(false);
  });
});

// ── URL normalisation ─────────────────────────────────────────────────────────

describe('URL normalisation', () => {
  beforeEach(boot);

  it('prepends https:// when no protocol given', async () => {
    mockFetchOk(makeData());
    await submitForm('example.com');
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.url).toBe('https://example.com');
  });

  it('leaves https:// URLs unchanged', async () => {
    mockFetchOk(makeData());
    await submitForm('https://example.com');
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.url).toBe('https://example.com');
  });

  it('leaves http:// URLs unchanged', async () => {
    mockFetchOk(makeData());
    await submitForm('http://example.com');
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.url).toBe('http://example.com');
  });

  it('does not fetch when input is empty', async () => {
    await submitForm('');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

// ── Loading state ─────────────────────────────────────────────────────────────

describe('loading state', () => {
  beforeEach(boot);

  it('disables the button while fetching', async () => {
    let resolveFetch;
    globalThis.fetch.mockReturnValue(
      new Promise((resolve) => { resolveFetch = resolve; })
    );
    getEl('#url-input').value = 'https://example.com';
    getEl('#checker-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));

    expect(getEl('#checker-form button').disabled).toBe(true);

    resolveFetch({ ok: true, json: async () => makeData() });
    await new Promise((r) => setTimeout(r, 0));

    expect(getEl('#checker-form button').disabled).toBe(false);
  });

  it('re-enables the button after fetch completes', async () => {
    mockFetchOk(makeData());
    await submitForm('https://example.com');
    expect(getEl('#checker-form button').disabled).toBe(false);
  });
});

// ── renderResults ─────────────────────────────────────────────────────────────

describe('renderResults', () => {
  beforeEach(boot);

  it('shows violation count in summary', async () => {
    mockFetchOk(makeData({ violations: [makeRule(), makeRule({ id: 'label' })] }));
    await submitForm('https://example.com');
    expect(getEl('.stat-violations .stat-number').textContent).toBe('2');
  });

  it('shows incomplete count in summary', async () => {
    mockFetchOk(makeData({ incomplete: [makeRule()] }));
    await submitForm('https://example.com');
    expect(getEl('.stat-incomplete .stat-number').textContent).toBe('1');
  });

  it('shows pass count in summary', async () => {
    mockFetchOk(makeData({ passCount: 13 }));
    await submitForm('https://example.com');
    expect(getEl('.stat-passes .stat-number').textContent).toBe('13');
  });

  it('shows audited URL in summary', async () => {
    mockFetchOk(makeData({ url: 'https://example.com' }));
    await submitForm('https://example.com');
    expect(getEl('.summary-url').textContent).toContain('https://example.com');
  });

  it('renders "No violations found" when violations is empty', async () => {
    mockFetchOk(makeData({ violations: [] }));
    await submitForm('https://example.com');
    expect(getEl('.no-issues').textContent).toContain('No violations');
  });

  it('renders a rule item for each violation', async () => {
    mockFetchOk(makeData({ violations: [makeRule(), makeRule({ id: 'label', description: 'Labels' })] }));
    await submitForm('https://example.com');
    expect(document.querySelectorAll('.rule-item')).toHaveLength(2);
  });

  it('sorts violations by impact severity (critical before minor)', async () => {
    mockFetchOk(makeData({
      violations: [
        makeRule({ id: 'minor-rule', impact: 'minor', description: 'Minor issue' }),
        makeRule({ id: 'critical-rule', impact: 'critical', description: 'Critical issue' }),
      ],
    }));
    await submitForm('https://example.com');
    const badges = document.querySelectorAll('.impact-badge');
    expect(badges[0].textContent).toBe('critical');
    expect(badges[1].textContent).toBe('minor');
  });

  it('renders the Needs Manual Review section when incomplete items exist', async () => {
    mockFetchOk(makeData({ incomplete: [makeRule()] }));
    await submitForm('https://example.com');
    expect(getEl('#incomplete-heading')).not.toBeNull();
  });

  it('omits the Needs Manual Review section when incomplete is empty', async () => {
    mockFetchOk(makeData({ incomplete: [] }));
    await submitForm('https://example.com');
    expect(getEl('#incomplete-heading')).toBeNull();
  });

  it('uses singular "violation" for exactly 1', async () => {
    mockFetchOk(makeData({ violations: [makeRule()] }));
    await submitForm('https://example.com');
    expect(getEl('.stat-violations .stat-label').textContent).toBe('violation');
  });

  it('uses plural "violations" for 0 or more than 1', async () => {
    mockFetchOk(makeData({ violations: [] }));
    await submitForm('https://example.com');
    expect(getEl('.stat-violations .stat-label').textContent).toBe('violations');
  });
});

// ── renderError ───────────────────────────────────────────────────────────────

describe('renderError', () => {
  beforeEach(boot);

  it('shows error card on non-ok response', async () => {
    mockFetchError(502, 'Could not reach the site');
    await submitForm('https://example.com');
    expect(getEl('.error-card')).not.toBeNull();
    expect(getEl('.error-card').textContent).toContain('Could not reach the site');
  });

  it('shows error card on data.error in ok response', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'Something went wrong' }),
    });
    await submitForm('https://example.com');
    expect(getEl('.error-card')).not.toBeNull();
  });

  it('shows fallback message on network failure', async () => {
    mockFetchNetworkFailure();
    await submitForm('https://example.com');
    expect(getEl('.error-card')).not.toBeNull();
    expect(getEl('.error-card').textContent).toContain('Could not connect');
  });

  it('escapes HTML in error messages', async () => {
    mockFetchError(400, '<script>alert(1)</script>');
    await submitForm('https://example.com');
    expect(document.body.innerHTML).not.toContain('<script>');
    expect(getEl('.error-card').innerHTML).toContain('&lt;script&gt;');
  });
});

// ── HTML escaping ─────────────────────────────────────────────────────────────

describe('HTML escaping in rendered output', () => {
  beforeEach(boot);

  it('escapes < > & in rule description', async () => {
    mockFetchOk(makeData({ violations: [makeRule({ description: '<b>Bold & dangerous</b>' })] }));
    await submitForm('https://example.com');
    expect(document.body.innerHTML).not.toContain('<b>Bold');
    expect(document.body.innerHTML).toContain('&lt;b&gt;');
  });

  it('escapes " in helpUrl so it does not break the attribute syntax in raw HTML', async () => {
    mockFetchOk(makeData({ violations: [makeRule({ helpUrl: 'https://example.com/"path"' })] }));
    await submitForm('https://example.com');
    // jsdom decodes &quot; back to " when reading getAttribute (correct DOM behaviour),
    // so we check the raw serialised HTML instead
    expect(document.querySelector('.rule-body').innerHTML).toContain('&quot;');
  });
});
