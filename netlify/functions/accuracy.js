// ════════════════════════════════════════════════════════════════
// HAN Accuracy Metrics — Public endpoint
// GET /api/accuracy
//
// Returns cached aggregated accuracy metrics from the Evaluation sheet.
// Cache TTL: 1 hour (in-memory, resets on cold start).
// ════════════════════════════════════════════════════════════════

const https = require('https');

const GAS_URL    = process.env.GAS_URL || '';
const GAS_SECRET = process.env.GAS_ADMIN_SECRET || process.env.ADMIN_SECRET || '';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=3600',
};

// ── In-memory cache ───────────────────────────────────────────────
let _cache = null;        // { data, fetchedAt }
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ── GAS fetch helper ─────────────────────────────────────────────
function gasGet(params) {
  return new Promise((resolve, reject) => {
    const qs  = new URLSearchParams(params).toString();
    const url = new URL(GAS_URL + '?' + qs);
    https.get({ hostname: url.hostname, path: url.pathname + url.search }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ── Main handler ─────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  if (!GAS_URL) {
    return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: 'Accuracy metrics not configured' }) };
  }

  // Serve from cache if still fresh
  if (_cache && (Date.now() - _cache.fetchedAt) < CACHE_TTL) {
    return {
      statusCode: 200,
      headers: { ...CORS, 'X-Cache': 'HIT' },
      body: JSON.stringify(_cache.data),
    };
  }

  // Fetch fresh metrics from GAS
  try {
    const metrics = await gasGet({
      action: 'getAccuracyMetrics',
      secret: GAS_SECRET,
    });

    if (metrics.error) {
      return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: metrics.error }) };
    }

    _cache = { data: metrics, fetchedAt: Date.now() };

    return {
      statusCode: 200,
      headers: { ...CORS, 'X-Cache': 'MISS' },
      body: JSON.stringify(metrics),
    };
  } catch (e) {
    // If cache exists but stale, return stale rather than error
    if (_cache) {
      return {
        statusCode: 200,
        headers: { ...CORS, 'X-Cache': 'STALE' },
        body: JSON.stringify({ ..._cache.data, stale: true }),
      };
    }
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: 'Failed to fetch accuracy metrics: ' + e.message }) };
  }
};
