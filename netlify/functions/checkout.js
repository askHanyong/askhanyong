// ════════════════════════════════════════════════════════════════
// HAN Checkout — Netlify Function
// Creates a Stripe Checkout session for the Contributor tier.
//
// Required env vars (set in Netlify dashboard):
//   STRIPE_SECRET_KEY   — sk_live_... or sk_test_...
//   STRIPE_PRICE_ID     — price_... (set once you decide the fee)
//
// Optional env vars:
//   SITE_URL            — e.g. https://askhanyong.com (for redirects)
//
// POST /api/checkout
// Body: { email?: string }
// Returns: { url: string }   — redirect the user to this URL
// ════════════════════════════════════════════════════════════════

const https = require('https');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_ID   = process.env.STRIPE_PRICE_ID;
const SITE_URL          = (process.env.SITE_URL || 'https://askhanyong.com').replace(/\/$/, '');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(statusCode, body) {
  return { statusCode, headers: CORS, body: JSON.stringify(body) };
}

// ── Raw Stripe API call (no npm dependency) ───────────────────────
function stripePost(path, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const options = {
      hostname: 'api.stripe.com',
      path,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'Stripe-Version': '2023-10-16',
      },
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) });
        } catch (e) {
          reject(new Error('Could not parse Stripe response'));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  // Guard: env vars must be configured
  if (!STRIPE_SECRET_KEY) {
    return json(503, { error: 'Stripe is not yet configured. Please use the payment link for now.' });
  }
  if (!STRIPE_PRICE_ID) {
    return json(503, { error: 'Subscription fee not yet set. Please use the payment link for now.' });
  }

  let email = '';
  try {
    const body = JSON.parse(event.body || '{}');
    email = (body.email || '').toLowerCase().trim();
  } catch (e) {
    return json(400, { error: 'Invalid JSON' });
  }

  // Build checkout session params
  // Using 'payment' mode for a one-time contribution (not recurring subscription).
  // Switch to 'subscription' + a recurring price if you want monthly billing.
  const params = {
    'payment_method_types[]': 'card',
    'line_items[0][price]': STRIPE_PRICE_ID,
    'line_items[0][quantity]': '1',
    'mode': 'payment',
    'success_url': SITE_URL + '/app?contributed=1',
    'cancel_url':  SITE_URL + '/app',
    'allow_promotion_codes': 'true',
  };

  // Pre-fill email if we have one
  if (email) {
    params['customer_email'] = email;
  }

  try {
    const result = await stripePost('/v1/checkout/sessions', params);
    if (result.status !== 200 || !result.data.url) {
      console.error('Stripe error:', JSON.stringify(result.data));
      return json(502, { error: result.data?.error?.message || 'Could not create checkout session.' });
    }
    return json(200, { url: result.data.url });
  } catch (e) {
    console.error('Checkout error:', e.message);
    return json(500, { error: 'Checkout failed. Please try again or use the payment link.' });
  }
};
