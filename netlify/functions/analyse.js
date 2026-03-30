const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const fs = require('fs');

// Read axe-core script once at cold-start
const axeScript = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const FUNCTION_TIMEOUT_MS = 22000;
const NAV_TIMEOUT_MS = 15000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let targetUrl;
  try {
    const body = JSON.parse(event.body || '{}');
    targetUrl = body.url;
    const parsed = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Only http/https URLs are supported');
    }
  } catch {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Invalid URL. Please enter a full URL starting with https://' }),
    };
  }

  const result = await Promise.race([
    runAudit(targetUrl),
    new Promise((resolve) =>
      setTimeout(() => resolve({ timedOut: true }), FUNCTION_TIMEOUT_MS)
    ),
  ]);

  if (result.timedOut) {
    return {
      statusCode: 504,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'The page took too long to load. Try a simpler URL or check the site is publicly accessible.' }),
    };
  }

  if (result.error) {
    return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ error: result.error }) };
  }

  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(result) };
};

async function runAudit(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // Set a realistic user agent to avoid basic bot blocking
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    // Block images, media and fonts to speed up load; keep stylesheets
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'media', 'font'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

    try {
      await page.goto(url, { waitUntil: 'networkidle2' });
    } catch {
      // Fallback for pages with persistent connections (SSE, WebSockets)
      await page.goto(url, { waitUntil: 'load' });
    }

    await page.evaluate(axeScript);

    const results = await page.evaluate(() =>
      axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
        },
        resultTypes: ['violations', 'incomplete', 'passes'],
      })
    );

    return {
      url,
      testedAt: new Date().toISOString(),
      violations: results.violations.map(shapeRule),
      incomplete: results.incomplete.map(shapeRule),
      passCount: results.passes.length,
    };
  } catch (err) {
    return { error: formatError(err) };
  } finally {
    if (browser) await browser.close();
  }
}

function shapeRule(rule) {
  return {
    id: rule.id,
    impact: rule.impact,
    description: rule.description,
    helpUrl: rule.helpUrl,
    nodes: rule.nodes.map((n) => ({
      html: n.html,
      failureSummary: n.failureSummary,
      target: n.target,
    })),
  };
}

function formatError(err) {
  const msg = err?.message || String(err);
  if (msg.includes('ERR_NAME_NOT_RESOLVED')) return 'Could not reach that URL. Check the address and try again.';
  if (msg.includes('ERR_CONNECTION_REFUSED')) return 'Connection refused. The site may be down or blocking automated requests.';
  if (msg.includes('ERR_CERT') || msg.includes('ERR_SSL')) return 'SSL certificate error on the target site.';
  if (msg.includes('Navigation timeout') || msg.includes('TimeoutError')) return 'Page load timed out. The site may be too slow or blocking headless browsers.';
  return 'Could not audit the page. The site may be unreachable or blocking automated access.';
}
