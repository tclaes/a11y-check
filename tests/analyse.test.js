import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Import the CJS module. Its default export IS module.exports.
// Because handler calls _seam.runAudit (a shared object property), we can
// replace _seam.runAudit per-test without needing to mock puppeteer.
const mod = (await import('../netlify/functions/analyse.js')).default;
const { handler, _shapeRule, _formatError, _seam } = mod;

// ── Fixtures ─────────────────────────────────────────────────────────────────

const axeRule = {
  id: 'image-alt',
  impact: 'critical',
  description: 'Images must have alternate text',
  helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/image-alt',
  nodes: [
    { html: '<img src="logo.png">', failureSummary: 'Fix: add alt attribute', target: ['img'] },
  ],
};

const happyResult = {
  url: 'https://example.com',
  testedAt: new Date().toISOString(),
  violations: [axeRule].map(_shapeRule),
  incomplete: [],
  passCount: 3,
};

function post(body) {
  return handler({ httpMethod: 'POST', body: JSON.stringify(body) });
}

// ── Handler: HTTP method validation ──────────────────────────────────────────

describe('handler — HTTP method', () => {
  it('OPTIONS → 204 with CORS headers', async () => {
    const res = await handler({ httpMethod: 'OPTIONS' });
    expect(res.statusCode).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('GET → 405', async () => {
    const res = await handler({ httpMethod: 'GET' });
    expect(res.statusCode).toBe(405);
    expect(JSON.parse(res.body).error).toMatch(/method not allowed/i);
  });

  it('PUT → 405', async () => {
    const res = await handler({ httpMethod: 'PUT' });
    expect(res.statusCode).toBe(405);
  });
});

// ── Handler: URL validation ───────────────────────────────────────────────────

describe('handler — URL validation', () => {
  it('missing url field → 400', async () => {
    const res = await post({});
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/invalid url/i);
  });

  it('malformed JSON body → 400', async () => {
    const res = await handler({ httpMethod: 'POST', body: '{not json' });
    expect(res.statusCode).toBe(400);
  });

  it('empty body → 400', async () => {
    const res = await handler({ httpMethod: 'POST', body: '' });
    expect(res.statusCode).toBe(400);
  });

  it('ftp:// URL → 400', async () => {
    const res = await post({ url: 'ftp://example.com' });
    expect(res.statusCode).toBe(400);
  });

  it('plain string (no protocol) → 400', async () => {
    const res = await post({ url: 'not-a-url' });
    expect(res.statusCode).toBe(400);
  });
});

// ── Handler: audit outcomes ───────────────────────────────────────────────────
// These tests spy on exports._runAudit (the seam), avoiding any need to
// mock puppeteer or chromium at the require() level.

describe('handler — audit outcomes', () => {
  let originalRunAudit;

  beforeEach(() => {
    originalRunAudit = _seam.runAudit;
    _seam.runAudit = vi.fn().mockResolvedValue(happyResult);
  });

  afterEach(() => {
    _seam.runAudit = originalRunAudit;
  });

  it('happy path → 200 with correct response shape', async () => {
    const res = await post({ url: 'https://example.com' });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.url).toBe('https://example.com');
    expect(body).toHaveProperty('testedAt');
    expect(Array.isArray(body.violations)).toBe(true);
    expect(Array.isArray(body.incomplete)).toBe(true);
    expect(typeof body.passCount).toBe('number');
    expect(body.passCount).toBe(3);
  });

  it('happy path — violation is shaped correctly', async () => {
    const res = await post({ url: 'https://example.com' });
    const { violations } = JSON.parse(res.body);

    expect(violations).toHaveLength(1);
    const v = violations[0];
    expect(v).toHaveProperty('id', 'image-alt');
    expect(v).toHaveProperty('impact', 'critical');
    expect(v).toHaveProperty('description');
    expect(v).toHaveProperty('helpUrl');
    expect(v).toHaveProperty('nodes');
    expect(v).not.toHaveProperty('tags');
  });

  it('passes the resolved URL to _runAudit', async () => {
    await post({ url: 'https://example.com' });
    expect(_seam.runAudit).toHaveBeenCalledWith('https://example.com');
  });

  it('runAudit returns error → 502', async () => {
    _seam.runAudit.mockResolvedValue({ error: 'Connection refused. The site may be down or blocking automated requests.' });
    const res = await post({ url: 'https://example.com' });
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body).error).toMatch(/connection refused/i);
  });

  it('timeout → 504', async () => {
    vi.useFakeTimers();
    _seam.runAudit.mockReturnValue(new Promise(() => {})); // never resolves

    const resultPromise = post({ url: 'https://example.com' });
    await vi.runAllTimersAsync();
    const res = await resultPromise;

    expect(res.statusCode).toBe(504);
    expect(JSON.parse(res.body).error).toMatch(/too long/i);
    vi.useRealTimers();
  });

  it('all responses include CORS headers', async () => {
    const res = await post({ url: 'https://example.com' });
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res.headers['Content-Type']).toBe('application/json');
  });
});

// ── _shapeRule ────────────────────────────────────────────────────────────────

describe('_shapeRule', () => {
  const raw = {
    id: 'label',
    impact: 'serious',
    description: 'Form elements must have labels',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/label',
    tags: ['wcag2a'],
    any: [],
    nodes: [
      { html: '<input>', failureSummary: 'Fix it', target: ['input'], any: [], all: [] },
    ],
  };

  it('returns only the expected top-level fields', () => {
    const shaped = _shapeRule(raw);
    expect(Object.keys(shaped)).toEqual(['id', 'impact', 'description', 'helpUrl', 'nodes']);
  });

  it('strips extra node fields', () => {
    const shaped = _shapeRule(raw);
    expect(Object.keys(shaped.nodes[0])).toEqual(['html', 'failureSummary', 'target']);
  });

  it('preserves node html and failureSummary', () => {
    const shaped = _shapeRule(raw);
    expect(shaped.nodes[0].html).toBe('<input>');
    expect(shaped.nodes[0].failureSummary).toBe('Fix it');
  });
});

// ── _formatError ──────────────────────────────────────────────────────────────

describe('_formatError', () => {
  it('ERR_NAME_NOT_RESOLVED → DNS message', () => {
    expect(_formatError(new Error('ERR_NAME_NOT_RESOLVED'))).toMatch(/could not reach/i);
  });

  it('ERR_CONNECTION_REFUSED → connection refused message', () => {
    expect(_formatError(new Error('ERR_CONNECTION_REFUSED'))).toMatch(/connection refused/i);
  });

  it('ERR_CERT → SSL message', () => {
    expect(_formatError(new Error('ERR_CERT_AUTHORITY_INVALID'))).toMatch(/ssl/i);
  });

  it('ERR_SSL → SSL message', () => {
    expect(_formatError(new Error('ERR_SSL_PROTOCOL_ERROR'))).toMatch(/ssl/i);
  });

  it('Navigation timeout → timeout message', () => {
    expect(_formatError(new Error('Navigation timeout exceeded'))).toMatch(/timed out/i);
  });

  it('TimeoutError → timeout message', () => {
    expect(_formatError(new Error('TimeoutError: waiting failed'))).toMatch(/timed out/i);
  });

  it('unknown error → generic fallback', () => {
    expect(_formatError(new Error('something weird'))).toMatch(/could not audit/i);
  });

  it('handles null/undefined gracefully', () => {
    expect(() => _formatError(null)).not.toThrow();
    expect(() => _formatError(undefined)).not.toThrow();
  });
});
